// tests/smoke.cjs — headless smoke test for Neon Engine.
//
// Boots the bundled example (example/index.html) in headless Chromium via
// puppeteer-core, starts the game and asserts the engine actually initialises
// and renders a frame. A syntax check (node --check) cannot catch runtime
// wiring errors — this can.
//
// Run: node tests/smoke.cjs        (set CHROME_PATH to override the browser)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8123);
const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || '/usr/bin/chromium';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/') rel = '/example/index.html';
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await serve();
  let browser;
  let failed = false;
  const fail = (m) => { console.error('FAIL: ' + m); failed = true; };

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle',
             '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,600'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

    await page.goto(`http://127.0.0.1:${PORT}/example/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 });

    const boot = await page.evaluate(() => ({
      hasScene: !!window.__game.scene,
      children: window.__game.scene ? window.__game.scene.children.length : 0,
      hasRenderer: !!window.__game.renderer,
      hasCamera: !!window.__game.camera,
    }));
    console.log('boot:', JSON.stringify(boot));
    if (!boot.hasScene || !boot.hasRenderer || !boot.hasCamera) fail('engine did not expose scene/renderer/camera');
    if (boot.children < 1) fail('scene has no children after init');

    await page.evaluate(() => { const g = window.__game; if (typeof g.start === 'function') g.start(); });
    await new Promise((r) => setTimeout(r, 2500));

    const run = await page.evaluate(() => {
      const g = window.__game;
      const info = g.renderer && g.renderer.info && g.renderer.info.render;
      return { running: !!g.running, frames: info ? info.frame : null, calls: info ? info.calls : null };
    });
    console.log('run:', JSON.stringify(run));
    if (run.frames === null) fail('renderer.info.render.frame unavailable');
    else if (run.frames < 1) fail('renderer rendered no frames');

    // auto-pause on window blur — the world must not keep simulating while the
    // player is away from the tab (they could otherwise be killed off-screen)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await new Promise((r) => setTimeout(r, 400));
    const pausedOnBlur = await page.evaluate(() => window.__game.running === false);
    console.log('blur-pause:', pausedOnBlur);
    if (!pausedOnBlur) fail('game did not auto-pause on window blur');
    // and it must resume cleanly afterwards
    await page.evaluate(() => { const g = window.__game; if (typeof g.start === 'function') g.start(); });
    await new Promise((r) => setTimeout(r, 400));
    const resumed = await page.evaluate(() => window.__game.running === true);
    console.log('resume-after-blur:', resumed);
    if (!resumed) fail('game did not resume after an auto-pause');

    const real = errors.filter((e) => !/favicon|Failed to load resource|WebGL|software|swiftshader/i.test(e));
    if (real.length) fail('page errors:\n  ' + real.join('\n  '));
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  if (failed) { console.error('smoke test FAILED'); process.exit(1); }
  console.log('smoke test passed');
}

main();
