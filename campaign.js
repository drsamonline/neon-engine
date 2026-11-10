// campaign.js — a short scripted mission chain. Each mission is a single tracked
// metric plus a goal, so it works with any game that feeds the metrics in.
// Fully offline; progress lives in the save (serialize/restore).

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
];

// The gap between a finished mission and the next one's brief.
const TRANSITION = 2.2;

export class Campaign {
  constructor(hooks = {}) {
    this.hud = hooks.hud; this.audio = hooks.audio; this.music = hooks.music;
    this.onReward = hooks.onReward || null;
    this.onChange = hooks.onChange || null;   // (campaign) -> persist the save
    this.index = 0;
    this.progress = 0;
    this.active = false;
    this.done = false;
    this.timer = 0;
    this.transition = 0;                      // seconds left in the between-mission banner
  }

  get current() { return MISSIONS[this.index] || null; }

  start(index = 0) {
    this.index = Math.max(0, Math.min(MISSIONS.length - 1, index));
    this.active = true; this.done = false;
    this.transition = 0;
    this._enter();
  }

  /* Pick up from a restored save without wiping the progress inside it. */
  resume() {
    if (this.done) { this.done = true; this.active = false; return; }
    this.active = true;
    this.transition = 0;
    this._enter(true);
  }

  serialize() {
    return { v: 1, index: this.index, progress: Math.round(this.progress * 100) / 100, done: this.done };
  }

  /* Returns false (and changes nothing) when the state cannot be trusted. */
  restore(state) {
    if (!state || typeof state !== 'object') return false;
    const i = Number(state.index);
    if (!Number.isInteger(i) || i < 0 || i > MISSIONS.length) return false;
    const p = Number(state.progress);
    this.index = Math.min(MISSIONS.length, i);
    this.progress = Number.isFinite(p) && p > 0 ? p : 0;
    this.done = !!state.done || this.index >= MISSIONS.length;
    this.active = false;
    this.transition = 0;
    if (this.done) this.progress = 0;
    return true;
  }

  _enter(keepProgress = false) {
    const m = this.current;
    if (!m) { this._finish(); return; }
    if (!keepProgress) this.progress = 0;
    this.timer = 0;
    if (this.hud) {
      this.hud.banner(m.title, m.brief);
      this.hud.setObjective(`MISSION ${this.index + 1}/${MISSIONS.length} — ${m.title}`, m.brief);
    }
    if (this.audio) this.audio.warn();
  }

  /* the game feeds these in */
  bump(metric, n = 1) {
    if (!this.active || this.done || this.transition > 0) return;
    const m = this.current;
    if (m && m.metric === metric) this.progress += n;
  }

  update(dt) {
    if (!this.active || this.done) return;

    // Between missions: no objective is running, so nothing counts towards the
    // next one. This used to be a setTimeout that left the finished mission's
    // progress live, and every frame in the gap credited it to the mission after
    // — one kill streak cleared two missions and paid both rewards.
    if (this.transition > 0) {
      this.transition -= dt;
      if (this.transition <= 0) {
        this.transition = 0;
        if (!this.done) this._enter();
      }
      return;
    }

    const m = this.current; if (!m) return;
    if (m.metric === 'seconds') this.progress += dt;
    const done = this.progress >= m.goal;
    if (this.hud) {
      const shown = m.metric === 'seconds'
        ? `${Math.floor(this.progress)}s / ${m.goal}s`
        : `${Math.min(Math.floor(this.progress), m.goal)} / ${m.goal}`;
      this.hud.setObjective(`MISSION ${this.index + 1}/${MISSIONS.length} — ${m.title}`, `${m.brief}   (${shown})`);
    }
    if (!done) return;
    this._complete(m);
  }

  _complete(m) {
    this.progress = 0;          // never carry a finished mission's count forward
    this.transition = TRANSITION;
    if (this.onReward) this.onReward(m.reward);
    if (this.hud) this.hud.banner('MISSION COMPLETE', `+${m.reward} coins`);
    if (this.music) this.music.sting('win');
    this.index++;
    if (this.index >= MISSIONS.length) { this._finish(); return; }
    if (this.onChange) this.onChange(this);
  }

  _finish() {
    this.done = true; this.active = false; this.transition = 0; this.progress = 0;
    if (this.hud) { this.hud.banner('CAMPAIGN COMPLETE', 'you cleared every mission'); this.hud.setObjective('CAMPAIGN COMPLETE', 'free roam'); }
    if (this.music) this.music.sting('win');
    if (this.onChange) this.onChange(this);
  }
}
