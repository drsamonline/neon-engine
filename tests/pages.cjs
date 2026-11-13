// tests/pages.cjs — the page-audit guard: what the sweep deleted stays deleted.
//
// No browser, no network, no game boot — this runs in a second and it exists
// because of a failure that cost a whole suite: on 2026-11-05 the page audit
// deleted `example/index.html` (PAGES.json → `deleted`), and `tests/smoke.cjs`
// and `tests/world.cjs` both booted that file. Both went red and neither could
// say why — the report was `Waiting failed: 60000ms exceeded`, `0 passing`.
// The suite was still there, still "green-looking" in a README, and measuring
// nothing.
//
// The repair was to stop depending on a deleted page (the harness serves its
// own, tests/harness.cjs). This file is what keeps that from un-happening:
//   * every path PAGES.json lists as deleted must really be absent;
//   * the harness page must be synthesized, never a file a sweep could delete;
//   * the harness page must carry the wiring the engine actually needs;
//   * no test may navigate itself to a page — navigation lives in the harness,
//     so there is one place a broken URL can be fixed;
//   * the browser path must be probed, not hard-coded to one machine.
//
// Run: node tests/pages.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, PAGE_PATH, HOST_PAGE, CHROME_CANDIDATES, chromePath } = require('./harness.cjs');

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
}

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

// ---- 1. the page audit's decisions are on disk and still hold -------------
let pages = null;
try {
  pages = JSON.parse(read('PAGES.json'));
  ok('PAGES.json parses', true);
} catch (e) {
  ok('PAGES.json parses', false, e.message);
}

if (pages) {
  const deleted = Array.isArray(pages.deleted) ? pages.deleted : [];
  ok('PAGES.json records the pages the audit deleted', deleted.length > 0,
    'no `deleted` entries — a sweep that deletes nothing records nothing, and this guard would pass vacuously');
  for (const d of deleted) {
    const p = typeof d === 'string' ? d : d.path;
    ok('a page the audit deleted is still deleted: ' + p, p && !exists(p),
      'it is back on disk — restoring a page the audit removed is a page-audit regression, not a fix');
  }
  // The specific one this suite tripped over, named so the guard's intent is
  // legible rather than inferred.
  const listed = deleted.some((d) => (typeof d === 'string' ? d : d.path) === 'example/index.html');
  ok('example/index.html is recorded as deleted (the page both tests used to boot)', listed,
    'PAGES.json no longer lists it — check whether it was restored by hand');
}

// ---- 2. the harness page cannot be swept away -----------------------------
ok('the harness page is not a file in the repository', !exists(PAGE_PATH),
  PAGE_PATH + ' exists on disk — it must be synthesized by tests/harness.cjs, or a page sweep can delete it and take the suite with it');
if (pages) {
  const deletedPaths = (pages.deleted || []).map((d) => (typeof d === 'string' ? d : d.path));
  ok('the harness page is not on the page audit\'s delete list', !deletedPaths.includes(PAGE_PATH),
    PAGE_PATH + ' is listed as deleted — the harness would serve a page the audit has condemned');
}

// ---- 3. the harness page carries what the engine needs --------------------
ok('the harness page resolves the bare `three` specifier', /"imports"\s*:\s*\{[^}]*"three"/.test(HOST_PAGE),
  'the engine imports three as a bare specifier (docs/GETTING-STARTED.md §2) — without the import map nothing loads');
ok('the harness page provides the #game canvas', /<canvas[^>]+id="game"/.test(HOST_PAGE),
  'GameBase() takes the canvas element');
ok('the harness page loads the example game', /src="\/example\/game\.js"/.test(HOST_PAGE),
  'the tests assert on the game that example/game.js builds');
ok('the harness page loads hud.css', /href="\/hud\.css"/.test(HOST_PAGE), 'the HUD styles itself against hud.css');

// ---- 4. navigation lives in exactly one place ----------------------------
const tests = ['tests/smoke.cjs', 'tests/world.cjs'];
for (const t of tests) {
  const src = read(t);
  ok(t + ' boots through the shared harness', /require\('\.\/harness\.cjs'\)/.test(src) && /\bopen\(page, PORT/.test(src),
    'it must serve and open the harness page, not its own');
  // `page.goto(` is the navigation primitive; only the harness may call it.
  ok(t + ' does not navigate on its own', !/\.goto\(/.test(src),
    'a second copy of the URL is a second place to forget the page moved');
}

// ---- 5. the browser is probed, not assumed ------------------------------
ok('the browser path is probed across candidates', CHROME_CANDIDATES.filter(Boolean).length >= 3,
  'a hard-coded /usr/bin/chromium is why the suite could not run on a machine where it is /usr/local/bin/chromium');
const found = chromePath();
if (found) ok('a Chromium was found on this machine', true);
else console.log('note: no Chromium on this machine — the browser tests will say so by name, not time out');

if (failures.length) {
  console.error('pages test FAILED — ' + failures.length + ' failing, ' + pass + ' passing');
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log('pages test passed — ' + pass + ' assertions');
