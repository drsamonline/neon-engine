// tests/campaign.cjs — the campaign's gate: every mission can actually be finished.
//
// No browser, no network, no game boot — a second and a half.
//
// Why it exists. The campaign ships enabled by default (`example/game.js` →
// `campaign: true`) and it is eighteen missions long. Mission 12, "GET OUT", is
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
//   * all eighteen missions can be walked to the end, in order, for the right
//     reward, and the campaign then reports itself complete;
//   * a SET-PIECE mission (1.25.0) is cleared phase by phase, in order: a later
//     phase's metric cannot advance an earlier one, the first phase does not
//     complete the mission, and surplus carries only within one metric;
//   * an AUTHORED BEAT (1.26.0) is a scripted moment between phases: a placed
//     beat holds its phase at zero until the player stands where it put them, an
//     event beat is a line and changes nothing, and neither can fire twice;
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
  const { MISSIONS, TIME_METRICS, MISSION_METRICS, phasesOf, Campaign } = mod;

  // ---- 1. the wiring guard: a mission's metric must be reachable ----------
  ok('campaign.js exports its missions', Array.isArray(MISSIONS) && MISSIONS.length > 0);
  ok('the campaign is longer than the eight missions the README used to claim',
    MISSIONS.length >= 12, `MISSIONS.length is ${MISSIONS.length}`);
  ok('phasesOf() reads a plain mission as exactly one phase',
    phasesOf(MISSIONS[0]).length === 1 && phasesOf(MISSIONS[0])[0].metric === MISSIONS[0].metric,
    'a plain mission must not need a `phases` array to be readable');
  const setPieces = MISSIONS.filter((m) => Array.isArray(m.phases) && m.phases.length > 1);
  ok('the chain ships authored set-pieces (the roadmap\'s open item)', setPieces.length >= 2,
    `${setPieces.length} set-piece mission(s) — the roadmap named "a longer campaign with authored set-pieces"`);
  ok('every set-piece phase declares a metric, a goal and a brief',
    setPieces.every((m) => m.phases.every((p) => p.metric && p.goal > 0 && p.brief)),
    'a phase with no metric can never complete, and one with no goal would complete instantly');

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

  // ---- 2. all eighteen missions walk to the end, phase by phase ----------
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
    // A set-piece is cleared one phase at a time; a plain mission is one phase.
    const phases = phasesOf(m);
    for (let pi = 0; pi < phases.length; pi++) {
      const p = phases[pi];
      ok(`mission ${i + 1} "${m.title}" is on phase ${pi + 1}/${phases.length}`,
        campaign.phase === pi, `phase is ${campaign.phase}`);
      // A phase can open with an authored beat, and a PLACED one holds the phase
      // until the player walks to it. The walk below is a player, so it walks.
      if (campaign.beatPending) {
        ok(`mission ${i + 1} phase ${pi + 1} beat is reachable`,
          campaign.reach(campaign.beacon.x, campaign.beacon.z) === true,
          'a placed beat that reach() cannot clear is a phase nobody can finish');
      }
      // The engine checks the goal in update(), not in bump(), so a frame is what
      // turns a reached goal into a completed mission — exactly as in play.
      if (timeMetrics.has(p.metric)) campaign.update(p.goal);
      else { campaign.bump(p.metric, p.goal); campaign.update(0); }
    }
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

  // ---- 5. a set-piece is cleared phase by phase, in order ----------------
  // Missions 17 and 18 are the shipped set-pieces. They are found by shape, not
  // by index, so re-ordering the chain cannot make this section test nothing.
  const spIndex = MISSIONS.findIndex((m) => Array.isArray(m.phases) && m.phases.length > 1);
  ok('the chain has a set-piece to test', spIndex >= 0);
  const sp = MISSIONS[spIndex];
  const spPhases = phasesOf(sp);

  const lines = [];
  const hud = {
    banner(t, s) { lines.push('BANNER ' + t + ' — ' + s); },
    setObjective(t, s) { lines.push('OBJ ' + t + ' — ' + s); },
  };
  const c4 = new Campaign({ stepDelay: 0, hud });
  const c4rewards = [];
  c4.onReward = (r) => c4rewards.push(r);
  c4.start(spIndex);
  ok('starting a set-piece puts the player on its first phase',
    c4.current.id === sp.id && c4.phase === 0);
  ok('the objective line names the phase',
    lines.some((l) => l.startsWith('OBJ ') && l.includes(`PHASE 1/${spPhases.length}`)),
    'no objective carried "PHASE 1/' + spPhases.length + '"');

  // A metric belonging to a LATER phase must not move the current one.
  const later = spPhases.slice(1).map((p) => p.metric).filter((m) => m !== spPhases[0].metric);
  if (later.length) {
    c4.bump(later[0], 99);
    ok(`bumping "${later[0]}" (a later phase) does not advance phase 1 of "${sp.title}"`,
      c4.progress === 0, `progress became ${c4.progress}`);
  }

  // Clearing phase 1 must not complete the mission, and must not pay its reward.
  const p1 = spPhases[0];
  if (timeMetrics.has(p1.metric)) c4.update(p1.goal); else { c4.bump(p1.metric, p1.goal); c4.update(0); }
  ok('clearing the first phase does not complete a set-piece',
    c4.current && c4.current.id === sp.id && c4.index === spIndex,
    `the campaign moved to index ${c4.index}`);
  ok('clearing the first phase pays nothing yet', c4rewards.length === 0,
    `reward(s) paid: ${JSON.stringify(c4rewards)}`);
  ok('clearing the first phase advances to phase 2', c4.phase === 1, `phase is ${c4.phase}`);
  ok('phase 2 starts from zero when it is measured by a different metric',
    spPhases[1].metric === p1.metric ? true : c4.progress === 0,
    `progress carried over as ${c4.progress} into a phase that does not count it`);

  // Walk the rest of the set-piece to the end; the reward is paid exactly once.
  for (let pi = 1; pi < spPhases.length; pi++) {
    const p = spPhases[pi];
    if (c4.beatPending) c4.reach(c4.beacon.x, c4.beacon.z);
    if (timeMetrics.has(p.metric)) c4.update(p.goal); else { c4.bump(p.metric, p.goal); c4.update(0); }
    await flush();
  }
  ok('the set-piece pays its reward exactly once when its last phase clears',
    JSON.stringify(c4rewards) === JSON.stringify([sp.reward]), `got ${JSON.stringify(c4rewards)}`);

  // Surplus carries only within one metric. Two synthetic chains, so the rule is
  // tested rather than assumed from whatever the shipped content happens to be.
  const sameMetric = new Campaign({
    stepDelay: 0,
    missions: [{ id: 'x', title: 'X', brief: 'x', reward: 1, phases: [
      { brief: 'a', metric: 'kills', goal: 10 },
      { brief: 'b', metric: 'kills', goal: 10 },
    ] }],
  });
  sameMetric.start();
  sameMetric.bump('kills', 12);
  sameMetric.update(0);
  ok('surplus carries into a next phase measured by the same metric',
    sameMetric.phase === 1 && sameMetric.progress === 2,
    `phase ${sameMetric.phase}, progress ${sameMetric.progress} (expected 1 and 2)`);

  const crossMetric = new Campaign({
    stepDelay: 0,
    missions: [{ id: 'y', title: 'Y', brief: 'y', reward: 1, phases: [
      { brief: 'a', metric: 'kills', goal: 10 },
      { brief: 'b', metric: 'headshots', goal: 5 },
    ] }],
  });
  crossMetric.start();
  crossMetric.bump('kills', 12);
  crossMetric.update(0);
  ok('surplus does NOT carry into a phase measured by another metric',
    crossMetric.phase === 1 && crossMetric.progress === 0,
    `phase ${crossMetric.phase}, progress ${crossMetric.progress} (expected 1 and 0)`);

  // ---- 6. authored beats: a scripted moment between phases --------------
  // The roadmap's open item after 1.25.0 was "authored beats inside a mission (a
  // scripted event between phases, not only a counter)". A beat is not a number:
  // an EVENT beat is a line the mission says, and a PLACED beat is a spot in the
  // world the player must stand on before the phase's metric counts at all.
  const shippedBeats = [];
  MISSIONS.forEach((m) => phasesOf(m).forEach((p, pi) => { if (p.beat) shippedBeats.push({ m, p, pi }); }));
  ok('the shipped chain uses authored beats', shippedBeats.length >= 2,
    `${shippedBeats.length} beat(s) in ${MISSIONS.length} missions — the roadmap item is still unbuilt`);
  ok('every shipped beat says something out loud',
    shippedBeats.every((b) => typeof b.p.beat.text === 'string' && b.p.beat.text.trim().length > 8),
    'a beat with no line is a pause, not a scripted moment');
  ok('a shipped beat is PLACED — a spot in the world, not only a counter',
    shippedBeats.some((b) => Array.isArray(b.p.beat.at) && b.p.beat.at.length === 2
      && b.p.beat.at.every((n) => typeof n === 'number' && Number.isFinite(n))),
    'no beat places the player anywhere, so every beat is decoration');
  ok('a shipped beat is an EVENT — a line with no place',
    shippedBeats.some((b) => !b.p.beat.at));
  ok('every shipped beat opens a phase after the mission\'s first',
    shippedBeats.every((b) => b.pi > 0),
    'a beat on phase 1 fires before the set-piece has established anything');
  ok('the engine reads the player\'s position for a pending beat',
    /campaign\.reach\(\s*this\.player\.pos\.x/.test(baseText),
    'gamebase.js never calls campaign.reach() — a placed beat could never be cleared in play');

  // A placed beat, synthetic so the rule is tested rather than the content.
  const beatLines = [];
  const beatsSeen = [];
  const placed = new Campaign({
    stepDelay: 0,
    hud: { banner(t, s) { beatLines.push('BANNER ' + t + ' — ' + s); }, setObjective() {}, setWaypoint(w) { beatLines.push('WAYPOINT ' + JSON.stringify(w)); } },
    onBeat: (b) => beatsSeen.push(b),
    missions: [{ id: 'z', title: 'Z', brief: 'z', reward: 7, phases: [
      { brief: 'clear the yard', metric: 'kills', goal: 5 },
      { brief: 'walk in and break it', metric: 'cores', goal: 1, beat: { text: 'The yard is quiet. The door is open.', at: [10, -4], radius: 3 } },
    ] }],
  });
  placed.start();
  ok('a mission whose first phase has no beat opens with none',
    placed.beatPending === false && placed.beacon === null && beatsSeen.length === 0);
  placed.bump('kills', 5); placed.update(0);
  ok('clearing a phase opens the next phase\'s beat',
    placed.phase === 1 && placed.beatPending === true,
    `phase ${placed.phase}, beatPending ${placed.beatPending}`);
  ok('the beat put the player somewhere specific',
    placed.beacon && placed.beacon.x === 10 && placed.beacon.z === -4 && placed.beacon.radius === 3,
    `beacon is ${JSON.stringify(placed.beacon)}`);
  ok('the beat is announced and marked', beatLines.some((l) => l.startsWith('BANNER BEAT'))
    && beatLines.some((l) => l === 'WAYPOINT {"x":10,"z":-4}'),
    `lines: ${JSON.stringify(beatLines)}`);
  ok('the beat reached the world exactly once, with its mission and phase',
    beatsSeen.length === 1 && beatsSeen[0].mission === 'z' && beatsSeen[0].phase === 1
    && beatsSeen[0].at && beatsSeen[0].at.x === 10,
    `beatsSeen: ${JSON.stringify(beatsSeen)}`);

  // While a placed beat is pending, the phase is a PLACE, not a counter: neither
  // a kill from across the map nor a long frame may advance it.
  placed.bump('cores', 5); placed.update(30);
  ok('a pending beat counts nothing from where the player stands',
    placed.progress === 0 && placed.phase === 1,
    `progress ${placed.progress}, phase ${placed.phase}`);
  ok('a pending beat is not re-fired on every frame', beatsSeen.length === 1,
    `onBeat fired ${beatsSeen.length} times for one beat`);

  ok('standing short of the marker does not clear the beat',
    placed.reach(14, -4) === false && placed.beatPending === true,
    'reach() cleared a beat the player has not arrived at');
  ok('standing on the marker clears the beat',
    placed.reach(10, -4) === true && placed.beatPending === false);
  ok('a cleared beat cannot be cleared twice', placed.reach(10, -4) === false);
  placed.bump('cores', 1); placed.update(0);
  ok('the phase counts once its beat is reached and the mission completes',
    placed.done === true, `done ${placed.done}, phase ${placed.phase}, progress ${placed.progress}`);

  // An EVENT beat is a line, not a gate: the phase counts from the first frame.
  const eventSeen = [];
  const evt = new Campaign({
    stepDelay: 0,
    onBeat: (b) => eventSeen.push(b),
    missions: [{ id: 'e', title: 'E', brief: 'e', reward: 1, phases: [
      { brief: 'wait it out', metric: 'seconds', goal: 10, beat: { text: 'Nothing comes now but the dust.' } },
    ] }],
  });
  evt.start();
  ok('an event beat does not place the player anywhere',
    evt.beatPending === false && evt.beacon === null && eventSeen.length === 1,
    `beatPending ${evt.beatPending}, beats ${eventSeen.length}`);
  ok('an event beat reports no position to the world', eventSeen[0] && eventSeen[0].at === null);
  evt.update(10);
  ok('an event beat does not hold its phase', evt.done === true, `done ${evt.done}`);

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
