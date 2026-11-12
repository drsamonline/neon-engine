// tests/campaign.cjs — the mission chain, headless and without a browser.
//
// campaign.js imports nothing, so its whole contract can be checked in plain
// node: one action pays one reward, nothing counts between missions, progress
// survives a save/restore, and a corrupt save starts over instead of throwing.
//
//   node tests/campaign.cjs

const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}`); }
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`);

function stubHud() {
  const h = { banners: [], objectives: [] };
  h.banner = (t, s) => h.banners.push(t);
  h.setObjective = (t, s) => h.objectives.push(t);
  return h;
}

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'campaign.js')).href);
  const { Campaign, MISSIONS } = mod;

  // ---------------------------------------------------------------- fresh start
  {
    const hud = stubHud();
    const c = new Campaign({ hud });
    c.start(0);
    eq(c.index, 0, 'a new campaign starts at mission 1');
    eq(c.progress, 0, 'with no progress');
    ok(c.active && !c.done, 'and is running');
    ok(hud.banners[0] === MISSIONS[0].title, 'the first brief is shown');
  }

  // ------------------------------------------- one action pays exactly one reward
  {
    const hud = stubHud();
    const rewards = [];
    const c = new Campaign({ hud, onReward: (r) => rewards.push(r) });
    c.start(0);
    c.bump('kills', MISSIONS[0].goal);          // clears m1
    c.update(1 / 60);
    eq(rewards, [MISSIONS[0].reward], 'clearing m1 pays its reward once');
    eq(c.index, 1, 'and advances to mission 2');
    eq(c.progress, 0, "and does not carry m1's kills into m2");

    // The regression: 40 frames of a 0.66 s gap used to clear m2 as well.
    for (let f = 0; f < 40; f++) c.update(1 / 60);
    eq(rewards, [MISSIONS[0].reward], 'no second reward fires while the banner is up');
    eq(c.index, 1, 'and the mission does not advance on stale progress');
  }

  // ----------------------------------- nothing counts between missions, then it opens
  {
    const hud = stubHud();
    const rewards = [];
    const c = new Campaign({ hud, onReward: (r) => rewards.push(r) });
    c.start(0);
    c.bump('kills', MISSIONS[0].goal);
    c.update(1 / 60);
    c.bump('stashes', 99);                       // the next mission's metric, too early
    eq(c.progress, 0, 'a metric fed during the banner is ignored');
    for (let i = 0; i < 30; i++) c.update(0.1);  // 3 s > the 2.2 s gap
    eq(c.index, 1, 'the next mission opens after the gap');
    eq(c.progress, 0, 'and it opens empty');
    c.bump('stashes', MISSIONS[1].goal);
    c.update(1 / 60);
    eq(rewards, [MISSIONS[0].reward, MISSIONS[1].reward], 'm2 then pays its own reward');
  }

  // ------------------------------------------------------- a timed mission ticks dt
  {
    const c = new Campaign({ hud: stubHud() });
    c.start(MISSIONS.findIndex((m) => m.metric === 'seconds'));
    const m = c.current;
    for (let i = 0; i < 10; i++) c.update(1);    // 10 s of a 300 s mission
    ok(Math.abs(c.progress - 10) < 1e-9, 'a seconds mission counts real dt');
    ok(c.index === MISSIONS.findIndex((x) => x === m), 'and does not advance early');
  }

  // ------------------------------------------------------------- save and restore
  {
    const rewards = [];
    const a = new Campaign({ hud: stubHud(), onReward: (r) => rewards.push(r) });
    a.start(0);
    a.bump('kills', 5);                          // 5 of 8, mid-mission
    const saved = a.serialize();

    const b = new Campaign({ hud: stubHud(), onReward: (r) => rewards.push(r) });
    ok(b.restore(saved), 'a saved campaign is accepted');
    eq(b.index, 0, 'and restores the mission index');
    eq(b.progress, 5, 'and the progress inside it');
    b.resume();
    ok(b.active, 'resume() starts it running');
    eq(b.progress, 5, 'resume() keeps the restored progress');
    b.bump('kills', 3);
    b.update(1 / 60);
    eq(rewards, [MISSIONS[0].reward], 'so the mission finishes on the remaining 3 kills');

    // A save taken in the gap resumes on the NEXT mission, not the finished one.
    const g = new Campaign({ hud: stubHud() });
    g.start(0);
    g.bump('kills', MISSIONS[0].goal);
    g.update(1 / 60);
    const midGap = g.serialize();
    eq(midGap.index, 1, 'a save taken mid-gap already points at the next mission');
    const h = new Campaign({ hud: stubHud() });
    h.restore(midGap); h.resume();
    eq(h.index, 1, 'and resuming from it does not replay m1');
    eq(h.progress, 0, 'with an empty next mission');
  }

  // ------------------------------------------- a corrupt save starts over, never throws
  {
    const bad = [
      ['null', null],
      ['undefined', undefined],
      ['an empty object', {}],
      ['a string', 'nope'],
      ['a negative index', { index: -1, progress: 4 }],
      ['an index past the end', { index: 99, progress: 4 }],
      ['a fractional index', { index: 1.5 }],
      ['a non-numeric index', { index: 'two' }],
      ['an object as index', { index: {}, progress: 4 }],
    ];
    for (const [name, state] of bad) {
      const c = new Campaign({ hud: stubHud() });
      let threw = null, accepted = null;
      try { accepted = c.restore(state); } catch (e) { threw = e; }
      ok(!threw, `${name} does not throw`);
      eq(accepted, false, `${name} is refused`);
      eq([c.index, c.progress, c.done], [0, 0, false], `${name} leaves the campaign at mission 1`);
      c.resume();
      eq(c.index, 0, `${name}: resuming afterwards still plays m1`);
    }
    // A junk progress in an otherwise valid save is cleaned, not carried.
    for (const junk of [NaN, 'lots', -5, Infinity]) {
      const c = new Campaign({ hud: stubHud() });
      ok(c.restore({ index: 2, progress: junk }), `a valid index with progress ${String(junk)} is accepted`);
      eq(c.progress, 0, `and progress ${String(junk)} becomes 0`);
    }
  }

  // ------------------------------------------------------------------ full clear
  {
    const hud = stubHud();
    const rewards = [];
    let changes = 0;
    const c = new Campaign({ hud, onReward: (r) => rewards.push(r), onChange: () => changes++ });
    c.start(0);
    let guard = 0;
    while (!c.done && guard++ < 20000) {
      if (c.transition > 0) { c.update(0.1); continue; }
      const m = c.current;
      if (!m) break;
      if (m.metric === 'seconds') c.update(1);
      else { c.bump(m.metric, m.goal); c.update(1 / 60); }
    }
    ok(c.done, 'the chain can be cleared end to end');
    eq(c.index, MISSIONS.length, 'and ends past the last mission');
    eq(rewards.length, MISSIONS.length, 'paying exactly one reward per mission');
    eq(rewards.reduce((a, b) => a + b, 0), MISSIONS.reduce((a, m) => a + m.reward, 0), 'totalling every mission reward');
    ok(hud.banners.includes('CAMPAIGN COMPLETE'), 'and announcing completion');
    ok(changes >= MISSIONS.length, 'notifying the save on every mission change');
    eq(c.transition, 0, 'leaving no pending transition');

    const after = new Campaign({ hud: stubHud() });
    ok(after.restore(c.serialize()), 'a finished campaign serialises');
    ok(after.done, 'and restores as finished');
    after.resume();
    ok(after.done && !after.active, 'so resuming it does not restart the chain');
  }

  // ------------------------------------------------------------------- missions
  {
    const ids = new Set(MISSIONS.map((m) => m.id));
    eq(ids.size, MISSIONS.length, 'every mission has a unique id');
    ok(MISSIONS.every((m) => m.goal > 0 && m.reward > 0 && m.metric && m.title && m.brief),
      'every mission is complete: metric, goal, reward, title, brief');
  }

  console.log(`\n${fail === 0 ? 'campaign test PASSED' : 'campaign test FAILED'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
