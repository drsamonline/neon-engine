// tests/harness.cjs — the shared headless harness for the Neon Engine tests.
//
// Both tests used to boot `example/index.html`. That page was deleted by the
// 2026-11-05 page audit and is listed under `deleted` in PAGES.json, so the
// audit's decision stands and it must not be restored — which left BOTH tests
// red with nothing readable: `FAIL: Waiting failed: 60000ms exceeded` and
// `0 passing`. A suite that cannot say why it failed is not a gate.
//
// So the harness serves its own host page: a small, in-memory document built
// from the wiring docs/GETTING-STARTED.md already specifies (a `three` import
// map, a `#game` canvas, hud.css) that loads `example/game.js`. Nothing is
// written to the repository and no deleted page comes back.
//
// Two other things it fixes, both found the same way:
//   * the browser path was hard-coded to /usr/bin/chromium, which does not
//     exist on this machine (it is /usr/local/bin/chromium) — so the tests
//     could not run at all;
//   * a boot failure reported only the wait timeout. The harness now collects
//     page errors and 4xx/5xx responses and prints them with the failure, so
//     "the page 404s" is what you read, not "waiting failed".
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// The harness page's URL. It is deliberately NOT a file on disk: there is
// nothing here for a page sweep to delete and nothing for PAGES.json to list.
const PAGE_PATH = '/__harness/index.html';

// The minimum page the engine needs, per docs/GETTING-STARTED.md §2: the bare
// `three` specifier is resolved by the import map, the canvas is what
// GameBase() takes, and hud.css is what the HUD styles itself against.
const HOST_PAGE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Neon Engine test harness</title>
  <link rel="stylesheet" href="/hud.css" />
  <script type="importmap">
  { "imports": { "three": "/three.module.js" } }
  </script>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="overlay"><div class="panel"><h1>HARNESS</h1></div></div>
  <script type="module" src="/example/game.js"></script>
</body>
</html>`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

// Chromium is not in the same place on every machine. Probe, in order, and let
// CHROME_PATH / CHROME_BIN win — then say plainly that nothing was found
// rather than launching a path that cannot exist.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH, process.env.CHROME_BIN,
  '/usr/local/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function chromePath() {
  for (const c of CHROME_CANDIDATES) {
    if (!c) continue;
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* keep looking */ }
  }
  return null;
}

/** Serve the harness page plus every file in the repository, on 127.0.0.1. */
function serve(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/') rel = PAGE_PATH;
      if (rel === PAGE_PATH) {
        res.writeHead(200, { 'Content-Type': TYPES['.html'] });
        res.end(HOST_PAGE);
        return;
      }
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Launch headless Chromium with the software renderer the tests need. */
async function launch(puppeteer) {
  const executablePath = chromePath();
  if (!executablePath) {
    throw new Error('no Chromium found — set CHROME_PATH (looked at: ' +
      CHROME_CANDIDATES.filter(Boolean).join(', ') + ')');
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle',
           '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,600'],
  });
}

/**
 * Open the harness page and wait until `expr` is truthy inside it.
 * On failure the thrown message carries what the page actually reported:
 * page errors and every 4xx/5xx response — which is how a deleted entry file
 * stops looking like an anonymous timeout.
 */
async function open(page, port, expr, timeout = 60000) {
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

  await page.goto(`http://127.0.0.1:${port}${PAGE_PATH}`, { waitUntil: 'load', timeout });
  try {
    await page.waitForFunction(expr, { timeout });
  } catch (e) {
    const why = [];
    if (bad.length) why.push('HTTP failures:\n    ' + bad.join('\n    '));
    if (errors.length) why.push('page errors:\n    ' + errors.join('\n    '));
    throw new Error('the harness page never satisfied `' + expr + '`' +
      (why.length ? '\n  ' + why.join('\n  ') : '') +
      '\n  (page: http://127.0.0.1:' + port + PAGE_PATH + ')');
  }
  return { errors, bad };
}

/** Page errors worth failing on: the browser's own noise is not our bug. */
const IGNORE = /favicon|Failed to load resource|WebGL|software|swiftshader/i;
function realErrors(errors) {
  return errors.filter((e) => !IGNORE.test(e));
}

module.exports = { ROOT, PAGE_PATH, HOST_PAGE, CHROME_CANDIDATES, chromePath, serve, launch, open, realErrors };
