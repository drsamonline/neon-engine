// campaign.js — a short scripted mission chain. Each mission is a single tracked
// metric plus a goal, so it works with any game that feeds the metrics in.
// Fully offline; progress lives in the save.
//
// A mission is normally ONE metric and ONE goal. A **set-piece** mission (1.25.0)
// is a short ordered list of phases instead — clear the first, then the second,
// then the third — so a scripted beat can ask for more than one thing without the
// engine growing a second kind of mission. See `phasesOf()`.

/**
 * The mission table: title, brief, metric, goal, reward.
 */
export const MISSIONS = [
  { id: 'm1', title: 'FIRST CONTACT', brief: 'Put down 8 of the infected.', metric: 'kills', goal: 8, reward: 200 },
  { id: 'm2', title: 'SUPPLY RUN', brief: 'Crack open 2 hidden caches.', metric: 'stashes', goal: 2, reward: 300 },
  { id: 'm3', title: 'CLEAR THE BLOCK', brief: 'Clear 20 more of them.', metric: 'kills', goal: 20, reward: 400 },
  { id: 'm4', title: 'HEADHUNTER', brief: 'Land 10 headshots.', metric: 'headshots', goal: 10, reward: 450 },
  { id: 'm5', title: 'SPEND IT WELL', brief: 'Buy 3 upgrades at a safe house.', metric: 'upgrades', goal: 3, reward: 500 },
  { id: 'm6', title: 'THE BIG ONE', brief: 'Take down a boss.', metric: 'bosses', goal: 1, reward: 800 },
  { id: 'm7', title: 'LAST STAND', brief: 'Survive five more minutes.', metric: 'seconds', goal: 300, reward: 900 },
  { id: 'm8', title: 'THE SWARM', brief: 'Clear a wave of 12 or more.', metric: 'hordeKills', goal: 12, reward: 1200 },
  { id: 'm9', title: 'BREAKER', brief: 'Destroy a boss core.', metric: 'cores', goal: 1, reward: 900 },
  { id: 'm10', title: 'FIELD WORK', brief: 'Craft 3 things from scrap.', metric: 'crafts', goal: 3, reward: 700 },
  { id: 'm11', title: 'THE LONG HAUL', brief: 'Survive five more minutes.', metric: 'seconds', goal: 300, reward: 1000 },
  { id: 'm12', title: 'GET OUT', brief: 'Complete an extraction.', metric: 'extractions', goal: 1, reward: 1400 },
  { id: 'm13', title: 'HOLD THE LINE', brief: 'Hold two defence waves.', metric: 'defences', goal: 2, reward: 1500 },
  { id: 'm14', title: 'CLEAN SWEEP', brief: 'Land 30 headshots.', metric: 'headshots', goal: 30, reward: 1300 },
  { id: 'm15', title: 'WRECKER', brief: 'Take down three bosses.', metric: 'bosses', goal: 3, reward: 2000 },
  { id: 'm16', title: 'LEGEND', brief: 'Survive to ten minutes and clear 100.', metric: 'kills', goal: 100, reward: 3000 },

  // ---- set-pieces: one authored beat, cleared in order -------------------
  {
    id: 'm17', title: 'THE BREACH', reward: 2500,
    brief: 'A set-piece: get in, break the thing, get out.',
    phases: [
      // The first authored beat on a clock (1.25.2): 30 s in, the alarm goes and
      // the perimeter asks for more. A goal-only revision keeps the kills already
      // made, so tightening it cannot be dodged by progress in hand.
      { brief: 'Breach the perimeter — 15 down.', metric: 'kills', goal: 15,
        revise: { after: 30, brief: 'Alarm up — 25 down before the door seals.', goal: 25 } },
      { brief: 'Destroy the core it guards.', metric: 'cores', goal: 1 },
      { brief: 'Leave with it.', metric: 'extractions', goal: 1 },
    ],
  },
  {
    id: 'm18', title: 'LAST LIGHT', reward: 3500,
    brief: 'A set-piece: hold, break their champion, then wait out the dust.',
    phases: [
      { brief: 'Hold two defence waves.', metric: 'defences', goal: 2 },
      { brief: 'Put down the champion they send.', metric: 'bosses', goal: 1 },
      { brief: 'Survive a minute while it settles.', metric: 'seconds', goal: 60 },
    ],
  },
];

// A mission's ordered phases. A plain mission is one implicit phase, so every
// caller reads the same shape and there is no second code path to forget.
/**
 * The phases of a mission, or a single phase built from its own fields.
 */
export function phasesOf(m) {
  if (m && Array.isArray(m.phases) && m.phases.length) return m.phases;
  return [{ brief: m.brief, metric: m.metric, goal: m.goal }];
}

// The metrics a mission can be measured by that the campaign advances ITSELF:
// `update(dt)` accrues them, so nothing outside has to feed them. Every other
// metric in MISSIONS must be fed by a `campaign.bump('<metric>')` in the engine,
// and `tests/campaign.cjs` fails if one is not — see CHANGELOG 1.24.3.
// A set-piece's phase metrics are in here too, so an unwired phase fails the
// same guard a plain mission does.
/**
 * Metrics measured in seconds rather than counted.
 */
export const TIME_METRICS = ['seconds'];
/**
 * Every metric any mission phase asks for.
 */
export const MISSION_METRICS = [...new Set(MISSIONS.flatMap((m) => phasesOf(m).map((p) => p.metric)))];

/**
 * Mission progress: what is done, what is active, what pays out.
 */
export class Campaign {
  constructor(hooks = {}) {
    this.hud = hooks.hud; this.audio = hooks.audio; this.music = hooks.music;
    this.onReward = hooks.onReward || null;
    // The mission list is overridable so a test can exercise a shape the shipped
    // chain does not happen to contain (e.g. two consecutive phases on one metric).
    this.missions = Array.isArray(hooks.missions) && hooks.missions.length ? hooks.missions : MISSIONS;
    // The pause between one mission clearing and the next one's banner. 2.2 s
    // in play; tests set it to 0 so eighteen missions do not cost 40 seconds.
    this.stepDelay = hooks.stepDelay === undefined ? 2200 : hooks.stepDelay;
    this.index = 0;
    this.phase = 0;
    this.progress = 0;
    this.active = false;
    this.done = false;
    this.timer = 0;
    this._pending = null;
    // Live revisions of the current phase, keyed `index:phase` (1.26.0). They are
    // an OVERLAY, not an edit: the authored mission table is never mutated, so a
    // beat that fires in one run cannot rewrite the objective the next run starts
    // from. `start()` clears it, which is what makes a restart clean.
    this._revised = new Map();
    // Seconds the CURRENT phase has been live, and the phases whose scheduled
    // revision has already fired (1.25.2). Both are per run: `_enter()` clears
    // them, and a phase hand-off clears the clock, so `revise.after` is measured
    // from the moment the player was handed that objective and not from the run.
    this._phaseClock = 0;
    this._reviseFired = new Set();
  }

  get current() { return this.missions[this.index] || null; }

  /* The phase the player is being measured against right now — the authored one,
     with any live revision applied on top. */
  get currentPhase() {
    const m = this.current;
    if (!m) return null;
    const p = phasesOf(m)[this.phase] || null;
    if (!p) return null;
    const r = this._revised.get(this._phaseKey());
    return r ? { ...p, ...r } : p;
  }

  /* One live phase, one overlay entry. */
  _phaseKey() { return `${this.index}:${this.phase}`; }

  start(index = 0) {
    this._clearPending();
    this._revised.clear();
    this._phaseClock = 0;
    this._reviseFired.clear();
    this.index = Math.max(0, Math.min(this.missions.length - 1, index));
    this.active = true; this.done = false;
    this._enter();
  }

  /* A pending hand-off belongs to the run that scheduled it. Restarting the
     campaign inside the 2.2 s gap used to let the stale timer fire and reset the
     NEW mission's progress to zero, silently. */
  _clearPending() {
    if (this._pending !== null) { clearTimeout(this._pending); this._pending = null; }
  }

  /* "MISSION 17/18 — THE BREACH" plus the phase, only when there is more than one. */
  _label(m) {
    const phases = phasesOf(m);
    const head = `MISSION ${this.index + 1}/${this.missions.length} — ${m.title}`;
    return phases.length > 1 ? `${head} · PHASE ${this.phase + 1}/${phases.length}` : head;
  }

  _enter() {
    const m = this.current;
    if (!m) { this._finish(); return; }
    this.progress = 0; this.timer = 0; this.phase = 0;
    this._phaseClock = 0;
    if (this.hud) {
      this.hud.banner(m.title, m.brief);
      this.hud.setObjective(this._label(m), this.currentPhase.brief);
    }
    if (this.audio) this.audio.warn();
  }

  /* the game feeds these in */
  bump(metric, n = 1) {
    if (!this.active || this.done) return;
    const p = this.currentPhase;
    if (p && p.metric === metric) this.progress += n;
  }

  update(dt) {
    if (!this.active || this.done) return;
    // Inside the 2.2 s hand-off gap there is NO live phase: `index` has already
    // moved on but `_enter()` has not run, so `this.phase` and `this.progress`
    // still belong to the mission just closed. Reading them against the next
    // mission completed it for free — mission 2 "SUPPLY RUN" (goal 2) was paid
    // out by mission 1's 8 kills on the very next frame (1.25.2).
    if (this._pending !== null) return;
    const m = this.current; if (!m) return;
    const phases = phasesOf(m);
    this._tickRevision(dt);
    let p = this.currentPhase;
    if (p.metric === 'seconds') this.progress += dt;

    if (this.hud) this.hud.setObjective(this._label(m), `${p.brief}   (${this._progressText(p)})`);

    // A phase may be over-satisfied by one big frame (or by a bump of 99), and a
    // set-piece has several phases, so this is a loop and not an `if`.
    while (this.active && !this.done && p && this.progress >= p.goal) {
      const isLastPhase = this.phase >= phases.length - 1;

      if (!isLastPhase) {
        // Carry the surplus into the next phase ONLY when it is measured by the
        // same metric; otherwise those events belong to the phase just closed and
        // counting them again would let a "kill 10, then land 5 headshots"
        // set-piece be satisfied by ten headshot kills.
        const overflow = this.progress - p.goal;
        const closedMetric = p.metric;
        this.phase++;
        this._phaseClock = 0;                 // the new phase's beat is measured from here
        p = this.currentPhase;
        this.progress = p.metric === closedMetric ? Math.max(0, overflow) : 0;
        if (this.hud) {
          this.hud.banner(`PHASE ${this.phase + 1}/${phases.length}`, p.brief);
          this.hud.setObjective(this._label(m), p.brief);
        }
        if (this.audio) this.audio.warn();
        continue;
      }

      // mission complete
      if (this.onReward) this.onReward(m.reward);
      if (this.hud) this.hud.banner('MISSION COMPLETE', `+${m.reward} coins`);
      if (this.music) this.music.sting('win');
      this.index++;
      if (this.index >= this.missions.length) { this._finish(); return; }
      this._clearPending();
      this._pending = setTimeout(() => {
        this._pending = null;
        if (this.active && !this.done) this._enter();
      }, this.stepDelay);
      return;
    }
  }

  /* A phase can schedule its OWN revision (1.25.2): `revise: { after, brief,
     metric, goal }` is applied by `update()` once the phase has been live for
     `after` seconds. Nothing outside has to call `revisePhase()`, and no game
     loop has to know a beat exists — the clock is the frame clock the mission is
     already on, so a paused or slow frame does not fire it early.

     It runs THROUGH `revisePhase()` rather than beside it, so the overlay, the
     validation, the progress rule (a metric change restarts, a goal change does
     not) and the repaint are the one path that already exists; a second path
     would be a second place for them to disagree.

     Fires at most once per phase per run — `_reviseFired` holds the phases that
     have fired, and both it and `_phaseClock` are cleared by `_enter()`/`start()`,
     so a restart re-arms the beat and the next run is not born revised. An
     unusable `after` (not a finite number) is INERT rather than immediate: a bad
     spec must not fire on the first frame, and `tests/campaign.cjs` asserts every
     shipped spec is valid so this can never be how a content bug reads. */
  _tickRevision(dt) {
    const m = this.current;
    if (!m) return;
    const authored = phasesOf(m)[this.phase];
    if (!authored || !authored.revise) return;
    const key = this._phaseKey();
    if (this._reviseFired.has(key)) return;
    const spec = authored.revise;
    const after = Number.isFinite(spec.after) ? Math.max(0, spec.after) : Infinity;
    this._phaseClock += Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (this._phaseClock < after) return;
    this._reviseFired.add(key);
    this.revisePhase({ brief: spec.brief, metric: spec.metric, goal: spec.goal });
  }

  /* The count the HUD shows for a phase. One formatter, so `update()` and a live
     revision can never print two different readings of the same progress. */
  _progressText(p) {
    return p.metric === 'seconds'
      ? `${Math.floor(this.progress)}s / ${p.goal}s`
      : `${Math.min(Math.floor(this.progress), p.goal)} / ${p.goal}`;
  }

  /**
   * A live beat rewrites the objective the player is ALREADY being measured
   * against (1.26.0) — "hold the line" becomes "get to the van" without waiting
   * for the next phase.
   *
   * `revisePhase({ brief, metric, goal })` changes only the fields it is given
   * and files them as an overlay on the current phase, so the HUD, `currentPhase`
   * and the mission table keep reading one object and the authored table is never
   * mutated. Returns `true` when a revision was applied.
   *
   * Progress follows the same rule as a phase hand-off: a change of METRIC starts
   * the new objective from zero, because events already counted were counted for
   * the objective that asked for them; a change of GOAL alone keeps progress, so
   * tightening a goal cannot be dodged by having already made progress.
   *
   * It refuses, changing nothing, when there is no live phase to revise (not
   * started, finished, or inside the hand-off gap), and when a field is invalid
   * (`goal` must be a positive finite number, `brief`/`metric` non-empty strings).
   * Completion is left to `update()`, so a revision that is already met still
   * pays out through the one path that pays out.
   */
  revisePhase(patch = {}) {
    if (!this.active || this.done) return false;
    if (this._pending !== null) return false;
    const m = this.current;
    if (!m || !phasesOf(m)[this.phase]) return false;
    if (!patch || typeof patch !== 'object') return false;

    const next = {};
    if (patch.brief !== undefined) {
      if (typeof patch.brief !== 'string' || !patch.brief.trim()) return false;
      next.brief = patch.brief;
    }
    if (patch.goal !== undefined) {
      if (typeof patch.goal !== 'number' || !Number.isFinite(patch.goal) || patch.goal <= 0) return false;
      next.goal = patch.goal;
    }
    if (patch.metric !== undefined) {
      if (typeof patch.metric !== 'string' || !patch.metric.trim()) return false;
      next.metric = patch.metric;
    }
    if (!Object.keys(next).length) return false;

    const key = this._phaseKey();
    const metricChanged = next.metric !== undefined && next.metric !== this.currentPhase.metric;
    this._revised.set(key, { ...(this._revised.get(key) || {}), ...next });
    if (metricChanged) this.progress = 0;
    if (this.hud) {
      const p = this.currentPhase;
      this.hud.setObjective(this._label(m), `${p.brief}   (${this._progressText(p)})`);
    }
    return true;
  }

  _finish() {
    this._clearPending();
    this.done = true; this.active = false;
    if (this.hud) { this.hud.banner('CAMPAIGN COMPLETE', 'you cleared every mission'); this.hud.setObjective('CAMPAIGN COMPLETE', 'free roam'); }
    if (this.music) this.music.sting('win');
  }
}
