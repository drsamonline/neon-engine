// campaign.js — a short scripted mission chain. Each mission is a single tracked
// metric plus a goal, so it works with any game that feeds the metrics in.
// Fully offline; progress lives in the save.
//
// A mission is normally ONE metric and ONE goal. A **set-piece** mission (1.25.0)
// is a short ordered list of phases instead — clear the first, then the second,
// then the third — so a scripted beat can ask for more than one thing without the
// engine growing a second kind of mission. See `phasesOf()`.
//
// A phase may carry an **authored beat** (1.26.0): a scripted moment that happens
// when the phase opens, not a number to farm. A beat is either an event — a line
// the mission says out loud — or a *placed* objective, a spot in the world the
// player has to walk to before the phase's metric starts counting at all. See
// `_fireBeat()` and `reach()`. A counter alone is not a beat; a beat is a thing
// that happens to you.

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
      { brief: 'Breach the perimeter — 15 down.', metric: 'kills', goal: 15 },
      {
        // A PLACED beat: the perimeter is down and the way in is a walk, not a
        // number. The cores phase does not start counting until the player is
        // standing where the beat put them.
        beat: {
          text: 'The perimeter drops. The core chamber is two streets in — the alarm is already screaming.',
          at: [0, -70], radius: 8,
        },
        brief: 'Get to the core chamber, then destroy the core.', metric: 'cores', goal: 1,
      },
      { brief: 'Leave with it.', metric: 'extractions', goal: 1 },
    ],
  },
  {
    id: 'm18', title: 'LAST LIGHT', reward: 3500,
    brief: 'A set-piece: hold, break their champion, then wait out the dust.',
    phases: [
      { brief: 'Hold two defence waves.', metric: 'defences', goal: 2 },
      { brief: 'Put down the champion they send.', metric: 'bosses', goal: 1 },
      {
        // An EVENT beat, with no place: the last minute is meant to be waited
        // out, and this is the mission saying so before the clock starts.
        beat: { text: 'The champion is down. Nothing comes now but the dust — stand in it.' },
        brief: 'Survive a minute while it settles.', metric: 'seconds', goal: 60,
      },
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
  /* An authored beat is a scripted moment, so the world has to be told about it
     as well as the player: `onBeat(beat)` fires once per phase that carries one. */
  constructor(hooks = {}) {
    this.hud = hooks.hud; this.audio = hooks.audio; this.music = hooks.music;
    this.onReward = hooks.onReward || null;
    this.onBeat = hooks.onBeat || null;
    // The beat the current phase opened with, and — when it was placed — where it
    // put the player. `beatPending` is true only while a PLACED beat is unmet.
    this.beat = null;
    this.beacon = null;
    this.beatPending = false;
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
  }

  get current() { return this.missions[this.index] || null; }

  /* The phase the player is being measured against right now. */
  get currentPhase() {
    const m = this.current;
    return m ? (phasesOf(m)[this.phase] || null) : null;
  }

  start(index = 0) {
    this._clearPending();
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
    this.beatPending = false; this.beacon = null; this.beat = null;
    if (this.hud) {
      this.hud.banner(m.title, m.brief);
      this.hud.setObjective(this._label(m), this.currentPhase.brief);
    }
    if (this.audio) this.audio.warn();
    this._fireBeat();
  }

  /* Open the beat the current phase carries, once. An EVENT beat (no `at`) is a
     line and a sound: it changes nothing about what counts. A PLACED beat (an
     `at` position) is a place the player must stand before the phase's metric
     starts counting — a counter you can farm from anywhere is not a scripted
     moment, and `bump()`/`update()` refuse to count while one is pending. */
  _fireBeat() {
    const p = this.currentPhase;
    const b = p && p.beat ? p.beat : null;
    this.beat = b;
    this.beatPending = false;
    this.beacon = null;
    if (!b) return;
    if (Array.isArray(b.at) && b.at.length >= 2) {
      this.beatPending = true;
      this.beacon = { x: b.at[0], z: b.at[1], radius: b.radius > 0 ? b.radius : 6 };
    }
    if (this.hud) {
      this.hud.banner('BEAT', b.text);
      // The placed objective is the HUD's existing waypoint, so the marker the
      // player already reads is the one the beat puts down — no second marker.
      // Optional: a bare HUD (a test stub, another game) need not have a map.
      if (this.beacon && typeof this.hud.setWaypoint === 'function') {
        this.hud.setWaypoint({ x: this.beacon.x, z: this.beacon.z });
      }
    }
    if (this.audio) this.audio.warn();
    if (this.onBeat) {
      this.onBeat({
        mission: this.current ? this.current.id : null,
        missionIndex: this.index, phase: this.phase,
        text: b.text, at: this.beacon ? { x: this.beacon.x, z: this.beacon.z } : null,
        radius: this.beacon ? this.beacon.radius : 0,
      });
    }
  }

  /* The player is standing at (x, z) — the engine calls this every frame it has a
     pending beat, and the campaign does the distance test. Returns true only on
     the frame that clears the beat, so a caller cannot fire it twice. */
  reach(x, z) {
    if (!this.active || this.done || !this.beatPending || !this.beacon) return false;
    const dx = x - this.beacon.x, dz = z - this.beacon.z;
    if (dx * dx + dz * dz > this.beacon.radius * this.beacon.radius) return false;
    this.beatPending = false;
    const p = this.currentPhase;
    if (this.hud && p) {
      this.hud.banner('IN POSITION', p.brief);
      this.hud.setObjective(this._label(this.current), p.brief);
    }
    return true;
  }

  /* the game feeds these in */
  bump(metric, n = 1) {
    if (!this.active || this.done || this.beatPending) return;
    const p = this.currentPhase;
    if (p && p.metric === metric) this.progress += n;
  }

  update(dt) {
    if (!this.active || this.done) return;
    const m = this.current; if (!m) return;
    const phases = phasesOf(m);
    let p = this.currentPhase;

    // A placed beat holds the phase at zero until the player is there. The
    // objective keeps naming the beat's line, so the wait never reads as a stall.
    if (this.beatPending) {
      if (this.hud) this.hud.setObjective(this._label(m), `${p.brief}   (reach the marker)`);
      return;
    }

    if (p.metric === 'seconds') this.progress += dt;

    if (this.hud) {
      const shown = p.metric === 'seconds'
        ? `${Math.floor(this.progress)}s / ${p.goal}s`
        : `${Math.min(Math.floor(this.progress), p.goal)} / ${p.goal}`;
      this.hud.setObjective(this._label(m), `${p.brief}   (${shown})`);
    }

    // A phase may be over-satisfied by one big frame (or by a bump of 99), and a
    // set-piece has several phases, so this is a loop and not an `if`.
    while (this.active && !this.done && !this.beatPending && p && this.progress >= p.goal) {
      const isLastPhase = this.phase >= phases.length - 1;

      if (!isLastPhase) {
        // Carry the surplus into the next phase ONLY when it is measured by the
        // same metric; otherwise those events belong to the phase just closed and
        // counting them again would let a "kill 10, then land 5 headshots"
        // set-piece be satisfied by ten headshot kills.
        const overflow = this.progress - p.goal;
        this.phase++;
        p = this.currentPhase;
        this.progress = p.metric === phases[this.phase - 1].metric ? Math.max(0, overflow) : 0;
        if (this.hud) {
          this.hud.banner(`PHASE ${this.phase + 1}/${phases.length}`, p.brief);
          this.hud.setObjective(this._label(m), p.brief);
        }
        if (this.audio) this.audio.warn();
        // The beat belongs to the phase that just opened, and it is fired here —
        // between phases — so a set-piece's scripted moment lands where it is
        // written rather than at the end of the mission.
        this._fireBeat();
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

  _finish() {
    this._clearPending();
    this.beatPending = false; this.beacon = null; this.beat = null;
    this.done = true; this.active = false;
    if (this.hud) { this.hud.banner('CAMPAIGN COMPLETE', 'you cleared every mission'); this.hud.setObjective('CAMPAIGN COMPLETE', 'free roam'); }
    if (this.music) this.music.sting('win');
  }
}
