// tests/campaign.cjs — the campaign's gate: every mission can actually be finished.
//
// No browser, no network, no game boot — a second and a half.
//
// Why it exists. The campaign ships enabled by default (`example/game.js` →
// `campaign: true`) and it is sixteen missions long. Mission 12, "GET OUT", is
// measured by `extractions` — and nothing in the engine ever fed that metric.
// `modes.js` completed an extraction, paid the bonus and printed "EXTRACTED",
// and the campaign never heard about it, so the chain dead-ended at 12 of 16
// for anyone who played it, permanently, with no error and nothing to read.
// Sixteen missions were there; twelve were reachable.
//
// The repair is one line in `modes.js`. This file is what keeps it repaired:
//   * every metric a mission is measured by is either accrued by the campaign
//     itself (TIME_METRICS) or fed by a `campaign.bump('<metric>')` in a module
//     the engine actually loads — checked by reading the source, so adding a
//     mission with an unwired metric fails here instead of in someone's game;
//   * all sixteen missions can be walked to the end, in order, for the right
//     reward, and the campaign then reports itself complete;
//   * a metric that is not the current mission's does nothing;
//   * restarting inside the hand-off gap does not silently reset the new run.
//
// Run: node tests/campaign.cjs

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
const flush = (ms = 5) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mod = await import(path.join(ROOT, 'campaign.js'));
  const { MISSIONS, TIME_METRICS, MISSION_METRICS, Campaign } = mod;

  // ---- 1. the wiring guard: a mission's metric must be reachable ----------
  ok('campaign.js exports its missions', Array.isArray(MISSIONS) && MISSIONS.length > 0);
  ok('the campaign is longer than the eight missions the README used to claim',
    MISSIONS.length >= 12, `MISSIONS.length is ${MISSIONS.length}`);

  // Only modules the engine loads can feed a metric. gamebase.js is the entry
  // module and imports both of these (asserted below), so a bump in either is
  // live code, not a function nobody calls.
  const FEED_SOURCES = ['gamebase.js', 'modes.js'];
  const feedText = FEED_SOURCES.map(read).join('\n');
  const baseText = read('gamebase.js');

  ok('modes.js is installed by the engine, so a bump there runs',
    /import\s*\{[^}]*installModes[^}]*\}\s*from\s*'\.\/modes\.js'/.test(baseText)
    && /installModes\(\s*GameBase\s*\)/.test(baseText),
    'gamebase.js no longer imports and calls installModes — a bump in modes.js would be dead code');

  const timeMetrics = new Set(TIME_METRICS || []);
  for (const metric of MISSION_METRICS) {
    if (timeMetrics.has(metric)) {
      ok(`metric "${metric}" is accrued by the campaign itself`, true);
      continue;
    }
    ok(`metric "${metric}" is fed by the engine (campaign.bump('${metric}'))`,
      feedText.includes(`campaign.bump('${metric}')`),
      `no campaign.bump('${metric}') in ${FEED_SOURCES.join(' or ')} — a mission measured by ` +
      `"${metric}" can never complete, so the chain dead-ends there. This is exactly how ` +
      `mission 12 "GET OUT" was unreachable.`);
  }

  // Named, so the regression this file was written for reads as itself.
  ok('an extraction feeds the campaign (mission 12 "GET OUT")',
    read('modes.js').includes("campaign.bump('extractions')"),
    'modes.js completes an extraction without telling the campaign');

  // ---- 2. all sixteen missions walk to the end ---------------------------
  const rewards = [];
  const campaign = new Campaign({ stepDelay: 0, onReward: (r) => rewards.push(r) });
  ok('the campaign is not running before start()', campaign.active === false);

  campaign.start();
  ok('start() activates the campaign at mission 1', campaign.active === true && campaign.index === 0);

  // A metric that is not this mission's does nothing — no accidental progress.
  const other = MISSION_METRICS.find((m) => m !== MISSIONS[0].metric);
  campaign.bump(other, 99);
  ok(`bumping "${other}" does not advance "${MISSIONS[0].metric}"`, campaign.progress === 0,
    `progress became ${campaign.progress} on a metric the current mission does not use`);

  const expectedRewards = [];
  for (let i = 0; i < MISSIONS.length; i++) {
    const m = MISSIONS[i];
    ok(`mission ${i + 1} "${m.title}" is the one the campaign is on`, campaign.current && campaign.current.id === m.id,
      `the campaign is on ${campaign.current && campaign.current.id}`);
    // The engine checks the goal in update(), not in bump(), so a frame is what
    // turns a reached goal into a completed mission — exactly as in play.
    if (timeMetrics.has(m.metric)) campaign.update(m.goal);
    else { campaign.bump(m.metric, m.goal); campaign.update(0); }
    expectedRewards.push(m.reward);
    // The mission cleared and the hand-off is scheduled; let it run.
    if (i < MISSIONS.length - 1) await flush();
  }

  ok('every mission paid its reward, in order',
    JSON.stringify(rewards) === JSON.stringify(expectedRewards),
    `got ${JSON.stringify(rewards)}`);
  ok('the campaign reports itself complete after the last mission',
    campaign.done === true && campaign.active === false);
  ok('a completed campaign takes no more progress',
    (() => { const before = campaign.progress; campaign.bump('kills', 50); campaign.update(60); return campaign.progress === before; })(),
    'the campaign kept counting after it was finished');

  // ---- 3. progress cannot leak across a mission boundary ----------------
  const c2 = new Campaign({ stepDelay: 0 });
  c2.start();
  c2.bump(MISSIONS[0].metric, MISSIONS[0].goal - 1);
  c2.update(0);
  await flush();
  ok('a mission one short of its goal does not hand off', c2.index === 0,
    `advanced to index ${c2.index} before reaching the goal`);
  c2.bump(MISSIONS[0].metric, 1);
  c2.update(0);
  await flush();
  ok('the mission that reaches its goal hands off exactly once', c2.index === 1,
    `index is ${c2.index}`);
  ok('the next mission starts from zero progress', c2.progress === 0,
    `progress carried over as ${c2.progress}`);

  // ---- 4. a restart inside the hand-off gap does not wipe the new run ----
  const c3 = new Campaign({ stepDelay: 40 });
  c3.start();
  c3.bump(MISSIONS[0].metric, MISSIONS[0].goal);
  c3.update(0);                                    // clears mission 1, timer pending
  ok('the hand-off is pending', c3._pending !== null);
  c3.start();                                       // the player restarts
  c3.bump(MISSIONS[0].metric, 3);                   // and earns 3 of the new run
  await flush(120);                                 // the stale timer's moment passes
  ok('a restart clears the pending hand-off', c3._pending === null);
  ok('a stale hand-off does not reset the new run\'s progress', c3.progress === 3,
    `progress is ${c3.progress} — the old timer fired into the new run`);

  // ---- report -----------------------------------------------------------
  if (failures.length) {
    console.error('campaign test FAILED — ' + failures.length + ' failing, ' + pass + ' passing');
    for (const f of failures) console.error('  FAIL: ' + f);
    process.exit(1);
  }
  console.log('campaign test passed — ' + pass + ' assertions');
}

main().catch((e) => {
  console.error('campaign test FAILED — ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
