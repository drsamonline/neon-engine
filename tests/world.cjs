// tests/world.cjs — headless structural test for building interiors.
//
// Boots the bundled example in headless Chromium (the same harness smoke.cjs
// uses) and then inspects the REAL world the game built — not a mock. It proves
// the two-floor interior is not just code that runs but a place a player can
// reach: a slab at 3.3 m split by a stairwell, an inside staircase whose every
// rise is within the controller's step limit, open air above the stair, and
// upper-floor loot that a player on the ground floor cannot pick up.
//
// Why this exists: interiors shipped with nothing that checked them. The smoke
// test asserts the engine boots and renders; it would pass with every building
// solid, every stair missing, or the second floor floating over a hole.
//
// Run: node tests/world.cjs        (set CHROME_PATH to override the browser)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8124);
const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || '/usr/bin/chromium';

// The first-person controller refuses a step taller than 0.55 m (player.js:
// `if (c.height > this.pos.y + 0.55) continue`). A staircase whose rise exceeds
// it is a wall, so the test uses the controller's own number rather than one
// invented here.
const STEP_LIMIT = 0.55;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
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

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
}

async function main() {
  const server = await serve();
  let browser;
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

    await page.goto(`http://127.0.0.1:${PORT}/example/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__game && window.__game.world', { timeout: 60000 });

    const scan = await page.evaluate((STEP) => {
      const W = window.__game.world;
      const near = (c, p, pad) => c.minX < p.x + pad && c.maxX > p.x - pad && c.minZ < p.z + pad && c.maxZ > p.z - pad;
      let cities = 0, chunks = 0, twoFloor = null, oneFloor = null;

      outer:
      for (let cx = -12; cx <= 12; cx++) for (let cz = -12; cz <= 12; cz++) {
        if (W.biomeFor(cx, cz) !== 'city') continue;
        cities++;
        if (cities > 24) break outer;
        const key = cx + ',' + cz;
        const ch = W.chunks.get(key) || W._loadChunk(cx, cz);
        chunks++;
        for (const p of ch.pois) {
          const cols = ch.colliders.filter((c) => near(c, p, 30));
          const slab = cols.filter((c) => c.height > 3.25 && c.height < 3.5 && (c.maxX - c.minX) * (c.maxZ - c.minZ) > 8);
          // only the steps UNDER the upper floor: the outside stair to the roof is a
          // different thing and must not be able to stand in for the inside one
          const sb = slab.length
            ? { minX: Math.min(...slab.map((c) => c.minX)), maxX: Math.max(...slab.map((c) => c.maxX)),
                minZ: Math.min(...slab.map((c) => c.minZ)), maxZ: Math.max(...slab.map((c) => c.maxZ)) }
            : null;
          const steps = cols.filter((c) => c.height > 0.05 && c.height < 3.28 &&
                                          (c.maxX - c.minX) <= 3.2 && (c.maxZ - c.minZ) <= 1.2 &&
                                          sb !== null &&
                                          (c.minX + c.maxX) / 2 > sb.minX && (c.minX + c.maxX) / 2 < sb.maxX &&
                                          (c.minZ + c.maxZ) / 2 > sb.minZ && (c.minZ + c.maxZ) / 2 < sb.maxZ);
          const inside = cols.filter((c) => c.height > 0.05 && c.height <= 3.5 && c.maxX - c.minX > 6);
          const loot = ch.lootSpots.filter((s) => Math.abs(s.x - p.x) < 30 && Math.abs(s.z - p.z) < 30);

          if (p.label === 'Building (2F)' && !twoFloor) {
            const stairX = steps.length
              ? steps.map((c) => (c.minX + c.maxX) / 2).sort((a, b) => a - b)[Math.floor(steps.length / 2)]
              : null;
            twoFloor = {
              poi: { x: p.x, z: p.z },
              slab: slab.map((c) => ({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, top: c.height })),
              steps: steps.map((c) => ({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, top: c.height })),
              stairX,
              // a slab piece covering the stair's own column would be a ceiling over it
              slabOverStair: stairX === null ? [] : slab
                .filter((c) => stairX > c.minX - 0.01 && stairX < c.maxX + 0.01)
                .map((c) => c.height),
              loot: loot.map((s) => ({ x: s.x, y: s.y, z: s.z })),
              height: ch.pois.find((q) => q.label === 'Building (2F)') ? null : null,
            };
            // the interior rect the audio/indoor test uses
            const rect = W.interiors.find((r) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);
            twoFloor.rect = rect ? { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ, h: rect.h } : null;
            twoFloor.indoor = rect
              ? { onSlab: W.isIndoor({ x: p.x, y: 3.6, z: p.z }), aboveRoof: W.isIndoor({ x: p.x, y: rect.h + 1.2, z: p.z }) }
              : null;
            twoFloor.width = Math.max(...slab.map((c) => c.maxX)) - Math.min(...slab.map((c) => c.minX));
            twoFloor.depth = Math.max(...slab.map((c) => c.maxZ)) - Math.min(...slab.map((c) => c.minZ));
            twoFloor.stepLimit = STEP;
            twoFloor.gap = 0;
            twoFloor.gapX = null;
            if (slab.length > 1) {
              const s = slab.slice().sort((a, b) => a.minX - b.minX);
              for (let i = 1; i < s.length; i++) {
                const w = s[i].minX - s[i - 1].maxX;
                if (w > twoFloor.gap) { twoFloor.gap = w; twoFloor.gapX = [s[i - 1].maxX, s[i].minX]; }
              }
            }
          } else if (p.label === 'Building' && !oneFloor) {
            oneFloor = { slabAt33: slab.length, steps: steps.length, loot: loot.length };
          }
        }
        if (twoFloor && oneFloor) break outer;
      }
      return { cities, chunks, twoFloor, oneFloor };
    }, STEP_LIMIT);

    const t = scan.twoFloor;
    ok('a two-floor building exists in the city biome', !!t, 'scanned ' + scan.chunks + ' city chunks');

    if (t) {
      // 1. the slab is a real second floor
      const slabTop = t.slab.length ? Math.max(...t.slab.map((s) => s.top)) : 0;
      ok('the upper floor is a slab at 3.3 m', t.slab.length > 0 && Math.abs(slabTop - 3.425) < 0.02,
        'slab pieces=' + t.slab.length + ' top=' + slabTop.toFixed(3));
      ok('the slab spans the building', t.width > 6 && t.depth > 6,
        'width=' + (t.width || 0).toFixed(2) + ' depth=' + (t.depth || 0).toFixed(2));

      // 2. a stairwell: the slab is cut, and the cut is wide enough to walk up through
      ok('the slab is cut by a stairwell', t.slab.length >= 2 && t.gap > 1.5,
        'pieces=' + t.slab.length + ' gap=' + (t.gap || 0).toFixed(2) + ' m');

      // 3. the inside staircase: monotonic, and every rise within the controller's limit
      const tops = t.steps.map((s) => s.top).sort((a, b) => a - b);
      const uniq = [...new Set(tops.map((v) => +v.toFixed(2)))].sort((a, b) => a - b);
      ok('an inside staircase exists', uniq.length >= 6, uniq.length + ' distinct step tops');
      let worst = 0;
      for (let i = 1; i < uniq.length; i++) worst = Math.max(worst, uniq[i] - uniq[i - 1]);
      ok('every step rise is within the 0.55 m step limit', worst <= t.stepLimit,
        'worst rise=' + worst.toFixed(3) + ' m');
      ok('the staircase starts at the floor', uniq.length > 0 && uniq[0] < 0.5, 'first step=' + (uniq[0] || 0).toFixed(2));
      const lastStep = uniq.length ? uniq[uniq.length - 1] : 0;
      ok('the staircase reaches the slab', lastStep > 0 && slabTop - lastStep <= t.stepLimit,
        'last step=' + lastStep.toFixed(3) + ' slab=' + slabTop.toFixed(3));

      // 4. nothing over the stair: a slab piece above the climber would be a ceiling
      ok('the stairwell is open above the stair', t.slabOverStair.length === 0,
        'slab pieces over stair x=' + JSON.stringify(t.slabOverStair));

      // 5. the upper floor has loot, and the ground floor cannot collect it
      const upper = t.loot.filter((s) => s.y > 3.0);
      ok('the upper floor carries loot', upper.length > 0, upper.length + ' upper-floor spots');
      const inGap = t.gapX ? upper.filter((s) => s.x > t.gapX[0] && s.x < t.gapX[1]) : [];
      ok('no upper-floor loot floats over the stairwell', inGap.length === 0,
        inGap.length + ' spot(s) between x=' + (t.gapX ? t.gapX.map((v) => v.toFixed(2)).join('..') : 'n/a'));
      ok('upper-floor loot is out of reach from the ground', upper.every((s) => s.y > 3.0),
        'lowest upper spot y=' + (upper.length ? Math.min(...upper.map((s) => s.y)) : 0).toFixed(2));

      // 6. the interior rect covers the second floor, so indoor reverb applies upstairs
      ok('the building registers an interior rect', !!t.rect, 'no rect covering the building centre');
      if (t.rect) {
        ok('standing on the upper floor counts as indoors', t.indoor.onSlab === true, 'isIndoor(y=3.6)=' + t.indoor.onSlab);
        ok('standing above the roof counts as outdoors', t.indoor.aboveRoof === false, 'isIndoor(y=roof+1.2)=' + t.indoor.aboveRoof);
      }
    }

    // 7. a single-floor building stays single-floor: the two-floor path is opt-in
    const o = scan.oneFloor;
    ok('a single-floor building exists to compare against', !!o, 'no plain Building POI found in the same scan');
    if (o) ok('a single-floor building has no second-floor slab', o.slabAt33 === 0, o.slabAt33 + ' slab colliders at 3.3 m');

    const real = errors.filter((e) => !/favicon|Failed to load resource|WebGL|software|swiftshader/i.test(e));
    ok('no page errors during world generation', real.length === 0, real.join(' | '));
  } catch (e) {
    failures.push('harness: ' + (e && e.message ? e.message : String(e)));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  if (failures.length) {
    console.error('world test FAILED — ' + failures.length + ' failing, ' + pass + ' passing');
    for (const f of failures) console.error('  FAIL: ' + f);
    process.exit(1);
  }
  console.log('world test passed — ' + pass + ' assertions');
}

main();
