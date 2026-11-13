// tests/smoke.cjs — headless smoke test for Neon Engine.
//
// Boots the example game in headless Chromium via puppeteer-core, starts it and
// asserts the engine actually initialises and renders a frame. A syntax check
// (node --check) cannot catch runtime wiring errors — this can.
//
// The page is the shared harness page (tests/harness.cjs), not a file in the
// repository: `example/index.html` was deleted by the 2026-11-05 page audit and
// is listed under `deleted` in PAGES.json, so it is not restored for a test.
//
// Run: node tests/smoke.cjs        (set CHROME_PATH to override the browser)
'use strict';
const puppeteer = require('puppeteer-core');
const { serve, launch, open, realErrors } = require('./harness.cjs');

const PORT = Number(process.env.PORT || 8123);

async function main() {
  const server = await serve(PORT);
  let browser;
  let failed = false;
  const fail = (m) => { console.error('FAIL: ' + m); failed = true; };

  try {
    browser = await launch(puppeteer);
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    const { errors } = await open(page, PORT, 'window.__game && window.__game.scene');

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

    const real = realErrors(errors);
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
