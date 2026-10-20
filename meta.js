// meta.js — local-only progression meta: achievements, daily quests, personal
// bests and the end-of-run summary. Everything lives in localStorage; there is
// no network call anywhere in this file.

const STORE = 'ow-meta';

export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Kill your first enemy' },
  { id: 'kill_100', name: 'Exterminator', desc: 'Kill 100 enemies', goal: 100 },
  { id: 'kill_1000', name: 'Cleanup Crew', desc: 'Kill 1,000 enemies', goal: 1000 },
  { id: 'head_50', name: 'Marksman', desc: 'Land 50 headshots', goal: 50 },
  { id: 'head_500', name: 'Deadeye', desc: 'Land 500 headshots', goal: 500 },
  { id: 'combo_10', name: 'On a Roll', desc: 'Reach a ×10 kill combo', goal: 10 },
  { id: 'combo_25', name: 'Unstoppable', desc: 'Reach a ×25 kill combo', goal: 25 },
  { id: 'level_10', name: 'Rising Star', desc: 'Reach level 10', goal: 10 },
  { id: 'level_25', name: 'Veteran', desc: 'Reach level 25', goal: 25 },
  { id: 'boss_1', name: 'Giant Slayer', desc: 'Take down a boss' },
  { id: 'boss_10', name: 'Boss Rush', desc: 'Take down 10 bosses', goal: 10 },
  { id: 'survive_10', name: 'Ten Minutes', desc: 'Survive 10 minutes in one run', goal: 600 },
  { id: 'survive_30', name: 'Half Hour', desc: 'Survive 30 minutes in one run', goal: 1800 },
  { id: 'rich', name: 'Well Off', desc: 'Hold 5,000 coins at once', goal: 5000 },
  { id: 'collector', name: 'Collector', desc: 'Own 8 weapons at once', goal: 8 },
  { id: 'gunsmith', name: 'Gunsmith', desc: 'Max out a weapon upgrade track' },
  { id: 'tank', name: 'Tank', desc: 'Buy every armour plating level', goal: 6 },
  { id: 'untouchable', name: 'Untouchable', desc: 'Survive 5 minutes without being hit', goal: 300 },
  { id: 'untouchable_10', name: 'Ghost', desc: 'Survive 10 minutes without being hit', goal: 600 },
];

const DAILY_POOL = [
  { id: 'kill', text: 'Kill {n} enemies', metric: 'kills', roll: () => 25 + ((Math.random() * 4) | 0) * 10, reward: 250 },
  { id: 'head', text: 'Land {n} headshots', metric: 'headshots', roll: () => 8 + ((Math.random() * 3) | 0) * 4, reward: 300 },
  { id: 'coins', text: 'Collect {n} coins', metric: 'coins', roll: () => 400 + ((Math.random() * 4) | 0) * 200, reward: 200 },
  { id: 'boss', text: 'Take down {n} boss', metric: 'bosses', roll: () => 1 + ((Math.random() * 2) | 0), reward: 500 },
  { id: 'time', text: 'Survive {n} minutes total', metric: 'seconds', roll: () => 5 + ((Math.random() * 4) | 0) * 3, reward: 250 },
  { id: 'upgrade', text: 'Buy {n} upgrades', metric: 'upgrades', roll: () => 3 + ((Math.random() * 3) | 0) * 2, reward: 300 },
  { id: 'combo', text: 'Reach a ×{n} kill combo', metric: 'bestCombo', roll: () => 8 + ((Math.random() * 3) | 0) * 4, reward: 250 },
];

const CONTRACT_POOL = [
  { id: 'kill', text: 'Kill {n} enemies', metric: 'kills', roll: () => 15 + ((Math.random() * 30) | 0), reward: 320 },
  { id: 'head', text: 'Land {n} headshots', metric: 'headshots', roll: () => 6 + ((Math.random() * 10) | 0), reward: 380 },
  { id: 'boss', text: 'Take down {n} boss', metric: 'bosses', roll: () => 1 + ((Math.random() * 2) | 0), reward: 650 },
  { id: 'combo', text: 'Reach a ×{n} kill combo', metric: 'bestCombo', roll: () => 10 + ((Math.random() * 10) | 0), reward: 420 },
];

const today = () => new Date().toISOString().slice(0, 10);

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class Meta {
  constructor(key = STORE) {
    this.key = key;
    this.achievements = {};     // id -> true
    this.totals = { kills: 0, headshots: 0, bosses: 0, coins: 0, seconds: 0, upgrades: 0, deaths: 0, runs: 0 };
    this.best = { time: 0, kills: 0, level: 1, score: 0 };
    this.bestCombo = 0;
    this.dailyDate = '';
    this.daily = [];
    this.dailyProgress = {};
    this.dailyClaimed = {};
    this.bestiary = {};
    this.contract = null;
    this.onUnlock = null;
    this.load();
    this.rollDaily();
    if (!this.contract) this.rollContract();
  }

  /* ---------------- persistence ---------------- */
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        achievements: this.achievements, totals: this.totals, best: this.best,
        bestCombo: this.bestCombo, dailyDate: this.dailyDate, daily: this.daily,
        dailyProgress: this.dailyProgress, dailyClaimed: this.dailyClaimed,
        bestiary: this.bestiary, contract: this.contract,
      }));
    } catch (_) { /* private mode — play on without saving */ }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.key) || '{}');
      this.achievements = d.achievements || {};
      Object.assign(this.totals, d.totals || {});
      Object.assign(this.best, d.best || {});
      this.bestCombo = d.bestCombo || 0;
      this.dailyDate = d.dailyDate || '';
      this.daily = d.daily || [];
      this.dailyProgress = d.dailyProgress || {};
      this.dailyClaimed = d.dailyClaimed || {};
      this.bestiary = d.bestiary || {};
      this.contract = d.contract || null;
    } catch (_) { /* corrupt or absent — start fresh */ }
  }

  /* ---------------- daily quests (date-seeded, local) ---------------- */
  rollDaily() {
    const d = today();
    if (this.dailyDate === d && this.daily.length) return;
    const rnd = rngFrom(hashStr(d + this.key));
    const pool = DAILY_POOL.slice();
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const q = pool.splice((rnd() * pool.length) | 0, 1)[0];
      picked.push({ id: q.id, text: q.text, metric: q.metric, goal: q.roll(), reward: q.reward });
    }
    this.daily = picked;
    this.dailyDate = d;
    this.dailyProgress = {};
    this.dailyClaimed = {};
    this.save();
  }

  dailyProgressFor(q) {
    const v = this.dailyProgress[q.id] || 0;
    return q.metric === 'seconds' ? v : v;
  }
  dailyDone(q) { return (this.dailyProgress[q.id] || 0) >= q.goal; }
  dailyValue(q) { return this.dailyProgress[q.id] || 0; }

  claimDaily(id) {
    const q = this.daily.find((x) => x.id === id);
    if (!q || !this.dailyDone(q) || this.dailyClaimed[id]) return 0;
    this.dailyClaimed[id] = true;
    this.save();
    return q.reward;
  }

  /* ---------------- counters ---------------- */
  add(metric, value = 1) {
    // run-scoped metrics are fed by the game; totals mirror them
    this.dailyProgress[metric] = (this.dailyProgress[metric] || 0) + value;
    this.totals[metric] = (this.totals[metric] || 0) + value;
    if (metric === 'kills' || metric === 'headshots' || metric === 'bosses'
      || metric === 'coins' || metric === 'upgrades') {
      // mirrored into totals above; nothing extra to do
    }
    return this.check();
  }

  /* set a high-water metric (level, combo, run time) */
  peak(metric, value) {
    if ((this.totals[metric] || 0) < value) this.totals[metric] = value;
    this.dailyProgress[metric] = Math.max(this.dailyProgress[metric] || 0, value);
    return this.check();
  }

  check() {
    const unlocked = [];
    const t = this.totals;
    const test = (id, ok) => {
      if (ok && !this.achievements[id]) {
        this.achievements[id] = true;
        unlocked.push(ACHIEVEMENTS.find((a) => a.id === id));
      }
    };
    test('first_blood', t.kills >= 1);
    test('kill_100', t.kills >= 100);
    test('kill_1000', t.kills >= 1000);
    test('head_50', t.headshots >= 50);
    test('head_500', t.headshots >= 500);
    test('combo_10', this.bestCombo >= 10);
    test('combo_25', this.bestCombo >= 25);
    test('level_10', t.level >= 10);
    test('level_25', t.level >= 25);
    test('boss_1', t.bosses >= 1);
    test('boss_10', t.bosses >= 10);
    test('survive_10', t.runTime >= 600);
    test('survive_30', t.runTime >= 1800);
    test('rich', t.coinsHeld >= 5000);
    test('collector', t.weaponsHeld >= 8);
    test('gunsmith', t.maxedTrack >= 1);
    test('tank', t.armorLevel >= 6);
    test('untouchable', t.noHitRun >= 300);
    test('untouchable_10', t.noHitRun >= 600);
    if (unlocked.length) {
      this.save();
      if (this.onUnlock) for (const a of unlocked) if (a) this.onUnlock(a);
    }
    return unlocked;
  }

  /* ---------------- contracts ---------------- */
  rollContract() {
    const q = CONTRACT_POOL[(Math.random() * CONTRACT_POOL.length) | 0];
    this.contract = { id: q.id, text: q.text, metric: q.metric, goal: q.roll(), reward: q.reward,
      base: this.totals[q.metric] || 0 };
    this.save();
    return this.contract;
  }
  contractProgress() {
    const c = this.contract; if (!c) return 0;
    return Math.max(0, (this.totals[c.metric] || 0) - (c.base || 0));
  }
  contractDone() { const c = this.contract; return !!c && this.contractProgress() >= c.goal; }

  /* bestiary: how many of each enemy you have put down */
  seen(name) {
    this.bestiary[name] = (this.bestiary[name] || 0) + 1;
    this._seenT = (this._seenT || 0) + 1;
    if (this._seenT % 20 === 0) this.save();
  }

  /* ---------------- runs ---------------- */
  recordRun(run) {
    this.totals.runs = (this.totals.runs || 0) + 1;
    const better = run.score > (this.best.score || 0);
    if (run.time > (this.best.time || 0)) this.best.time = run.time;
    if (run.kills > (this.best.kills || 0)) this.best.kills = run.kills;
    if (run.level > (this.best.level || 0)) this.best.level = run.level;
    if (better) this.best.score = run.score;
    this.save();
    return better;
  }

  resetAll() {
    this.achievements = {};
    this.totals = { kills: 0, headshots: 0, bosses: 0, coins: 0, seconds: 0, upgrades: 0, deaths: 0, runs: 0 };
    this.best = { time: 0, kills: 0, level: 1, score: 0 };
    this.bestCombo = 0;
    this.dailyProgress = {}; this.dailyClaimed = {};
    this.save();
  }
}
