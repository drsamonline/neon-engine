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

  // ---- 6. a live beat rewrites the objective already handed out (1.26.0) ----
  // The seam the roadmap named: an authored beat inside a mission. The property
  // under test is that a revision changes what the player is measured against
  // NOW, and does it without editing the authored mission table.
  const seen = [];
  const hudStub = {
    banner: () => {},
    setObjective: (label, line) => seen.push({ label, line }),
  };
  const beat = new Campaign({
    stepDelay: 0, hud: hudStub,
    missions: [{ id: 'b', title: 'BEAT', brief: 'b', reward: 10, phases: [
      { brief: 'hold the line', metric: 'kills', goal: 10 },
      { brief: 'get out', metric: 'extractions', goal: 1 },
    ] }],
  });
  const authoredBefore = JSON.stringify(beat.missions);

  ok('revisePhase() refuses before the campaign has started', beat.revisePhase({ goal: 3 }) === false,
    'a revision with no live phase must not be filed');
  beat.start();
  beat.bump('kills', 4);
  beat.update(0);

  const revised = beat.revisePhase({ brief: 'reach the van', goal: 6 });
  ok('revisePhase() applies a brief + goal change to the live phase', revised === true,
    'revisePhase returned false on a live phase');
  ok('the player now reads the revised brief', beat.currentPhase.brief === 'reach the van',
    `currentPhase.brief is ${beat.currentPhase.brief}`);
  ok('a goal-only revision keeps the progress already made', beat.progress === 4,
    `progress reset to ${beat.progress} by a revision that did not change the metric`);
  ok('the HUD is repainted with the revised brief immediately',
    seen.length > 0 && seen[seen.length - 1].line.startsWith('reach the van'),
    `last objective line: ${seen.length ? seen[seen.length - 1].line : '(none)'}`);
  ok('a revision does NOT edit the authored mission table',
    JSON.stringify(beat.missions) === authoredBefore,
    'the shipped/content table was mutated, so the next run would start from the revised text');

  beat.bump('kills', 2); beat.update(0);
  ok('the revised goal is what completes the phase, and it completes on update()',
    beat.phase === 1 && beat.progress === 0,
    `phase ${beat.phase}, progress ${beat.progress} (expected 1 and 0)`);

  // A change of metric starts the new objective from zero: those kills belong to
  // the objective that asked for them.
  const swap = new Campaign({ stepDelay: 0, missions: [{ id: 's', title: 'S', brief: 's', reward: 5,
    phases: [{ brief: 'a', metric: 'kills', goal: 10 }, { brief: 'b', metric: 'extractions', goal: 1 }] }] });
  swap.start();
  swap.bump('kills', 7);
  swap.revisePhase({ metric: 'headshots', goal: 3 });
  ok('a change of metric resets progress to zero', swap.progress === 0,
    `progress is ${swap.progress} after the metric changed`);
  swap.bump('kills', 5);
  ok('the old metric no longer advances the revised phase', swap.progress === 0,
    `a kill added ${swap.progress} to a headshot objective`);
  swap.bump('headshots', 3); swap.update(0);
  ok('the new metric is what advances it', swap.phase === 1,
    `phase is ${swap.phase} after 3 headshots on a goal of 3`);

  // Surplus carries only within one metric — against the metric the CLOSED phase
  // actually measured, which is the revised one when a beat rewrote it.
  const carry = new Campaign({ stepDelay: 0, missions: [{ id: 'c', title: 'C', brief: 'c', reward: 5,
    phases: [{ brief: 'a', metric: 'kills', goal: 10 }, { brief: 'b', metric: 'kills', goal: 10 }] }] });
  carry.start();
  carry.revisePhase({ metric: 'headshots' });
  carry.bump('headshots', 12); carry.update(0);
  ok('surplus does not carry into a phase measured by the metric the revision replaced',
    carry.phase === 1 && carry.progress === 0,
    `phase ${carry.phase}, progress ${carry.progress} (expected 1 and 0 — those were headshots, not kills)`);

  // Invalid input is refused and changes nothing.
  const bad = new Campaign({ stepDelay: 0, missions: [{ id: 'z', title: 'Z', brief: 'z', reward: 1,
    metric: 'kills', goal: 10 }] });
  bad.start();
  bad.bump('kills', 2);
  const badResults = [
    bad.revisePhase({ goal: 0 }), bad.revisePhase({ goal: -4 }), bad.revisePhase({ goal: NaN }),
    bad.revisePhase({ goal: '5' }), bad.revisePhase({ brief: '   ' }), bad.revisePhase({ metric: '' }),
    bad.revisePhase({}), bad.revisePhase(),
  ];
  ok('every invalid revision is refused', badResults.every((r) => r === false),
    `results ${JSON.stringify(badResults)}`);
  ok('a refused revision leaves the phase and the progress untouched',
    bad.currentPhase.goal === 10 && bad.currentPhase.metric === 'kills' && bad.progress === 2,
    `goal ${bad.currentPhase.goal}, metric ${bad.currentPhase.metric}, progress ${bad.progress}`);

  // A revision is per run: restarting drops it, and a finished campaign refuses one.
  bad.revisePhase({ brief: 'still here' });
  bad.start();
  ok('a restart drops the revision, so the next run starts from the authored brief',
    bad.currentPhase.brief === 'z', `brief after restart is ${bad.currentPhase.brief}`);

  // No revision is accepted during the hand-off gap, when the next mission has not
  // been handed out yet.
  const gap = new Campaign({ stepDelay: 40, missions: [
    { id: 'g1', title: 'G1', brief: 'g1', reward: 1, metric: 'kills', goal: 1 },
    { id: 'g2', title: 'G2', brief: 'g2', reward: 1, metric: 'kills', goal: 1 },
  ] });
  gap.start();
  gap.bump('kills', 1); gap.update(0);
  ok('a revision is refused inside the hand-off gap',
    gap.index === 1 && gap.revisePhase({ brief: 'too early' }) === false,
    `index ${gap.index}, revisePhase returned ${gap.revisePhase({ brief: 'x' })}`);
  await flush(60);
  ok('the next mission starts from its authored brief', gap.currentPhase.brief === 'g2',
    `brief is ${gap.currentPhase.brief}`);

  const finished = new Campaign({ stepDelay: 0, missions: [
    { id: 'f', title: 'F', brief: 'f', reward: 1, metric: 'kills', goal: 1 }] });
  finished.start(); finished.bump('kills', 1); finished.update(0); await flush();
  ok('a finished campaign refuses a revision', finished.done && finished.revisePhase({ goal: 5 }) === false,
    `done ${finished.done}`);

  // ---- 7. a phase can schedule its own revision (1.25.2) -----------------
  // `revisePhase()` is a seam with nothing hanging from it unless content can
  // name a beat, so a phase now carries `revise: { after, brief, metric, goal }`
  // and `update()` applies it when its time arrives. Two things are checked
  // first: that the shipped specs are well formed (an unusable `after` is inert,
  // so a bad spec would be SILENT rather than loud), and that the one shipped
  // beat does what its row says.

  const scheduled = MISSIONS.flatMap((m) => phasesOf(m).filter((p) => p.revise));
  ok('the chain ships a phase whose revision is on a clock', scheduled.length >= 1,
    'no phase carries a `revise` spec, so nothing hangs from revisePhase() and no player ever sees an objective change');

  const specProblems = [];
  for (const p of scheduled) {
    const r = p.revise;
    if (!Number.isFinite(r.after) || r.after <= 0) specProblems.push(`after ${JSON.stringify(r.after)}`);
    if (r.brief !== undefined && (typeof r.brief !== 'string' || !r.brief.trim())) specProblems.push('brief');
    if (r.metric !== undefined && (typeof r.metric !== 'string' || !r.metric.trim())) specProblems.push('metric');
    if (r.goal !== undefined && (typeof r.goal !== 'number' || !Number.isFinite(r.goal) || r.goal <= 0)) specProblems.push('goal');
    if (r.brief === undefined && r.metric === undefined && r.goal === undefined) specProblems.push('changes nothing');
  }
  ok('every shipped scheduled revision is well formed', specProblems.length === 0,
    `bad field(s): ${specProblems.join(', ')}`);

  // The beat fires on the frame clock, not on wall time: a slow frame must not
  // fire it early, and no frame must fire it twice.
  const schedLines = [];
  const sched = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective: (l, s) => schedLines.push(s) },
    missions: [{ id: 'sch', title: 'SCHED', brief: 'sch', reward: 5, phases: [
      { brief: 'hold', metric: 'kills', goal: 10, revise: { after: 2, brief: 'reach the van', goal: 4 } },
      { brief: 'out', metric: 'extractions', goal: 1 },
    ] }],
  });
  const schedAuthored = JSON.stringify(sched.missions);
  sched.start();
  sched.bump('kills', 3);
  sched.update(1.5);
  ok('a scheduled revision has not fired before its time',
    sched.currentPhase.brief === 'hold' && sched.currentPhase.goal === 10,
    `brief "${sched.currentPhase.brief}", goal ${sched.currentPhase.goal} at 1.5 s of a 2 s beat`);
  sched.update(0.6);
  ok('it fires on the frame that reaches its time',
    sched.currentPhase.brief === 'reach the van' && sched.currentPhase.goal === 4,
    `brief "${sched.currentPhase.brief}", goal ${sched.currentPhase.goal} at 2.1 s of a 2 s beat`);
  ok('a scheduled goal-only revision keeps the progress already made', sched.progress === 3,
    `progress is ${sched.progress} — tightening a goal must not be dodged by progress in hand`);
  ok('a scheduled revision does not edit the authored mission table',
    JSON.stringify(sched.missions) === schedAuthored,
    'the shipped/content table was mutated, so the next run would start from the revised text');
  ok('the HUD is repainted with the scheduled brief',
    schedLines.some((s) => s.startsWith('reach the van')),
    `no objective line began with the revised brief; last: ${schedLines[schedLines.length - 1]}`);

  sched.bump('kills', 1); sched.update(0);
  ok('the tightened goal is what completes the phase', sched.phase === 1 && sched.progress === 0,
    `phase ${sched.phase}, progress ${sched.progress} (expected 1 and 0 after 4 kills on a goal of 4)`);

  // Fires exactly once: counted at the seam, because a repaint per frame looks
  // identical from the HUD.
  let schedCalls = 0;
  const onceCampaign = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective() {} },
    missions: [{ id: 'once', title: 'ONCE', brief: 'once', reward: 1, phases: [
      { brief: 'hold', metric: 'kills', goal: 100, revise: { after: 1, brief: 'hold on' } },
      { brief: 'out', metric: 'extractions', goal: 1 },
    ] }],
  });
  const realRevise = onceCampaign.revisePhase.bind(onceCampaign);
  onceCampaign.revisePhase = (patch) => { schedCalls++; return realRevise(patch); };
  onceCampaign.start();
  for (let i = 0; i < 10; i++) onceCampaign.update(1);
  ok('a scheduled revision fires exactly once per phase', schedCalls === 1,
    `revisePhase() was called ${schedCalls} times over 10 s of frames for one 1 s beat`);
  ok('the clock keeps running but the beat does not re-apply',
    onceCampaign.currentPhase.brief === 'hold on' && onceCampaign.progress === 0,
    `brief "${onceCampaign.currentPhase.brief}", progress ${onceCampaign.progress}`);

  // A beat is measured from the phase hand-off, not from the run: a phase 2 beat
  // that fires 3 s in must not be fired by the 9.5 s already spent in phase 1.
  const phaseClock = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective() {} },
    missions: [{ id: 'pc', title: 'PC', brief: 'pc', reward: 1, phases: [
      { brief: 'a', metric: 'kills', goal: 5, revise: { after: 10, brief: 'a2' } },
      { brief: 'b', metric: 'kills', goal: 5, revise: { after: 3, brief: 'b2' } },
    ] }],
  });
  phaseClock.start();
  phaseClock.update(9.5);
  phaseClock.bump('kills', 5);
  phaseClock.update(0);                       // phase 1 clears at 9.5 s; the clock restarts
  phaseClock.update(2.5);
  ok('a phase 2 beat is not fired by the time spent in phase 1',
    phaseClock.phase === 1 && phaseClock.currentPhase.brief === 'b',
    `phase ${phaseClock.phase}, brief "${phaseClock.currentPhase.brief}" at 2.5 s into phase 2`);
  phaseClock.update(1);
  ok('and it fires once its own phase has been live that long', phaseClock.currentPhase.brief === 'b2',
    `brief "${phaseClock.currentPhase.brief}" at 3.5 s into phase 2`);

  // The same rule one level up: a beat in the NEXT mission is measured from that
  // mission's start, not from the time the last one had already run.
  const nextMission = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective() {} },
    missions: [
      { id: 'n1', title: 'N1', brief: 'n1', reward: 1, phases: [
        { brief: 'one', metric: 'kills', goal: 2, revise: { after: 5, brief: 'one-tight' } }] },
      { id: 'n2', title: 'N2', brief: 'n2', reward: 1, phases: [
        { brief: 'two', metric: 'kills', goal: 10, revise: { after: 3, brief: 'two-tight' } }] },
    ],
  });
  nextMission.start();
  nextMission.update(6);                       // 6 s into mission 1; its own beat fired at 5
  nextMission.bump('kills', 2);
  nextMission.update(0);                       // mission 1 clears
  await flush();                               // _enter() hands out mission 2
  nextMission.update(0);
  ok('a beat in the next mission is measured from that mission\'s own start',
    nextMission.current && nextMission.current.id === 'n2' && nextMission.currentPhase.brief === 'two',
    `mission ${nextMission.current && nextMission.current.id}, brief "${nextMission.currentPhase.brief}"`);
  nextMission.update(3);
  ok('and it fires once its own mission has been live that long',
    nextMission.currentPhase.brief === 'two-tight',
    `brief "${nextMission.currentPhase.brief}" 3 s into mission 2`);

  // A restart re-arms it: the run that comes after must not be born revised.
  sched.start();
  ok('a restart puts the authored objective back',
    sched.currentPhase.brief === 'hold' && sched.currentPhase.goal === 10,
    `brief "${sched.currentPhase.brief}", goal ${sched.currentPhase.goal} after a restart`);
  sched.update(2);
  ok('the beat fires again in the next run', sched.currentPhase.brief === 'reach the van',
    `brief "${sched.currentPhase.brief}" after 2 s of the restarted run`);

  // A scheduled change of METRIC follows the revision rule: those events were
  // counted for the objective that asked for them, so progress restarts.
  const schedSwap = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective() {} },
    missions: [{ id: 'ss', title: 'SS', brief: 'ss', reward: 1, phases: [
      { brief: 'a', metric: 'kills', goal: 10, revise: { after: 1, metric: 'headshots', goal: 3 } },
      { brief: 'b', metric: 'extractions', goal: 1 },
    ] }],
  });
  schedSwap.start();
  schedSwap.bump('kills', 5);
  schedSwap.update(1);
  ok('a scheduled change of metric restarts progress from zero', schedSwap.progress === 0,
    `progress is ${schedSwap.progress} after the metric changed`);
  schedSwap.bump('kills', 5);
  ok('the replaced metric no longer advances the scheduled objective', schedSwap.progress === 0,
    `a kill added ${schedSwap.progress} to a headshot objective`);

  // A spec whose time is unusable is INERT, not immediate — otherwise a content
  // typo would fire a beat on the first frame and read as a working feature.
  const inert = new Campaign({
    stepDelay: 0, hud: { banner() {}, setObjective() {} },
    missions: [{ id: 'in', title: 'IN', brief: 'in', reward: 1, phases: [
      { brief: 'still here', metric: 'kills', goal: 10, revise: { after: 'soon', brief: 'too early' } },
    ] }],
  });
  inert.start();
  inert.update(1000);
  ok('a scheduled revision with no usable time never fires', inert.currentPhase.brief === 'still here',
    `brief "${inert.currentPhase.brief}" after 1000 s — an unusable \`after\` must be inert, not immediate`);

  // THE BREACH is the one shipped beat, and the row names it: phase 1 tightens
  // from 15 kills to 25 after 30 s, keeping the kills already made.
  const breach = MISSIONS.find((m) => m.id === 'm17');
  ok('the shipped set-piece THE BREACH carries the beat', !!breach && !!phasesOf(breach)[0].revise,
    'mission 17 has no scheduled revision on its first phase');
  if (breach) {
    const bc = new Campaign({ stepDelay: 0, hud: { banner() {}, setObjective() {} } });
    bc.start(MISSIONS.indexOf(breach));
    bc.bump('kills', 10);
    bc.update(29);
    const beforeGoal = bc.currentPhase.goal;
    bc.update(2);
    ok('THE BREACH tightens its first phase once 30 s have passed',
      beforeGoal === 15 && bc.currentPhase.goal === 25,
      `goal ${beforeGoal} at 29 s, ${bc.currentPhase.goal} at 31 s (expected 15 then 25)`);
    ok('and the ten kills already made still count against the tighter goal', bc.progress === 10,
      `progress is ${bc.progress}`);
  }

  // ---- 8. the hand-off gap has no live phase (1.25.2) --------------------
  // `index` moves on the frame a mission clears but `_enter()` waits 2.2 s, and
  // `update()` kept running in between with the CLOSED mission's progress read
  // against the NEXT mission's goal. In play that paid out mission 2 "SUPPLY
  // RUN" (goal 2) on the frame after mission 1's 8 kills — measured before the
  // fix, rewards [200, 300] with nothing collected.
  const gapRewards = [];
  const gapFrames = new Campaign({ stepDelay: 2200, onReward: (r) => gapRewards.push(r) });
  gapFrames.start();
  gapFrames.bump('kills', 8);
  gapFrames.update(0);
  for (let i = 0; i < 20; i++) gapFrames.update(0.1);      // 2 s of frames inside the gap
  ok('a frame inside the hand-off gap cannot complete the next mission',
    gapFrames.index === 1 && JSON.stringify(gapRewards) === JSON.stringify([200]),
    `index ${gapFrames.index}, rewards ${JSON.stringify(gapRewards)} — the gap paid out a mission nobody played`);
  ok('and it cannot move the progress of a mission not yet handed out', gapFrames.progress === 8,
    `progress is ${gapFrames.progress} during the gap (expected the closed mission's 8, untouched)`);
  await flush(60);
  // The hand-off itself still works, and still starts the next mission clean.
  const gapShort = new Campaign({ stepDelay: 40, onReward: (r) => gapRewards.push(r) });
  gapShort.start();
  gapShort.bump('kills', 8);
  gapShort.update(0);
  gapShort.update(0.016); gapShort.update(0.016);     // frames inside the 40 ms gap
  await flush(80);
  ok('the next mission still starts from zero once the gap ends',
    gapShort.current && gapShort.current.id === 'm2' && gapShort.progress === 0 && gapShort.phase === 0,
    `mission ${gapShort.current && gapShort.current.id}, progress ${gapShort.progress}, phase ${gapShort.phase} after the hand-off`);
  ok('and the gap paid out only the mission that was actually played',
    JSON.stringify(gapRewards) === JSON.stringify([200, 200]),
    `rewards ${JSON.stringify(gapRewards)} (expected two runs of mission 1 and nothing else)`);

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
