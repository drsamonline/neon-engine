// leveling.js — XP, levels, stat upgrades, unlocks, persistence
import { WEAPONS, WEAPON_ORDER, WEAPON_TRACKS, weaponStats, ATTACHMENTS } from './weapons.js';

// passive perks, bought with skill points (they compete with raw stat upgrades)
export const PERKS = [
  { id: 'lifesteal', name: 'Vampirism', desc: '+5 HP per kill', cost: 2, max: 3 },
  { id: 'thorns', name: 'Retribution', desc: 'reflect 18% of melee damage', cost: 2, max: 3 },
  { id: 'reload', name: 'Quick Hands', desc: '-12% reload time', cost: 2, max: 3 },
  { id: 'magnet', name: 'Scavenger', desc: '+2.5m pickup radius', cost: 1, max: 3 },
  { id: 'plating', name: 'Plating', desc: '+2% damage absorbed', cost: 2, max: 3 },
  { id: 'learner', name: 'Fast Learner', desc: '+12% XP gained', cost: 2, max: 3 },
];

// armour plating: an upgrade track that stacks on top of your vest
export const ARMOUR_TRACK = { max: 6, perArmor: 12, perAbsorb: 0.02, base: 180, growth: 1.42 };

// armour tiers: max armour and the share of damage it absorbs
export const ARMOUR = [
  { name: 'No Armour', max: 0, absorb: 0, price: 0 },
  { name: 'Light Vest', max: 60, absorb: 0.4, price: 250 },
  { name: 'Medium Vest', max: 110, absorb: 0.55, price: 700 },
  { name: 'Heavy Plate', max: 170, absorb: 0.68, price: 1500 },
];

/* scrap recipes — cheap, repeatable, and the reason to pick scrap up */
export const RECIPES = [
  { id: 'ammo', name: 'Ammo Crate', scrap: 12, note: '+90 reserve ammo', give: (p) => { p.pendingAmmo = (p.pendingAmmo || 0) + 90; } },
  { id: 'medkit', name: 'Field Medkit', scrap: 25, note: 'instant full heal', give: (p) => { p.pendingHeal = 1; } },
  { id: 'grenade', name: 'Frag Grenade', scrap: 20, note: '+2 grenades', give: (p) => { p.pendingThrow = (p.pendingThrow || 0) + 2; } },
  { id: 'molotov', name: 'Molotov', scrap: 20, note: '+2 molotovs', give: (p) => { p.pendingThrow = (p.pendingThrow || 0) + 2; } },
  { id: 'plate', name: 'Armour Plate', scrap: 60, note: '+1 armour tier', give: (p) => { p.armorTier = Math.min(3, p.armorTier + 1); } },
  { id: 'coin', name: 'Sell Scrap', scrap: 30, coins: 120, note: '+120 coins' },
];

/* gear sets — buy a loadout, wear one at a time. Passive, permanent. */
export const SETS = [
  { id: 'assault', name: 'Assault Kit', price: 1200, note: '+22% reload, +10% weapon damage', mods: { reload: 0.22, damage: 0.10 } },
  { id: 'juggernaut', name: 'Juggernaut Rig', price: 1600, note: '+45 armour, -12% speed', mods: { armor: 45, speed: -0.12 } },
  { id: 'scout', name: 'Scout Harness', price: 1000, note: '+18% speed, -15% health', mods: { speed: 0.18, health: -0.15 } },
  { id: 'ghost', name: 'Ghost Suit', price: 1400, note: '40% quieter, heat decays faster', mods: { noise: -0.4, heat: 0.35 } },
];

export class Progression {
  constructor(opts = {}) {
    this.level = 1; this.xp = 0; this.coins = opts.coins ?? 0;
    this.points = 0;                 // unspent upgrade points
    this.upgrades = { vitality: 0, speed: 0, stamina: 0, carry: 0 };
    this.armorTier = 0;
    this.armorLevel = 0;                 // plating levels bought on top of the vest
    this.weaponUp = {};                  // weapon id -> { damage, mag, reload, spread }
    this.perks = {};                     // perk id -> level
    this.attachments = {};               // weapon id -> { slot: attachId }
    this.attachOwned = {};               // weapon id -> { slot: { attachId: true } }
    this.mastery = {};                   // weapon id -> kills (earned, not bought)
    this.scrap = 0;                      // crafting material, dropped by enemies
    this.ngPlus = 0;                     // New Game+ loops
    this.stash = {};                     // spare items kept between runs
    this.installs = {};                  // safe-house installations
    this.insurance = 0;                  // death-cover level
    this.setId = null;                   // equipped gear set
    this.setsOwned = {};
    this.prestige = 0;                   // permanent rebirth count
    this.unlocked = new Set(['knife', 'pistol']);
    this.onLevelUp = null; this.onChange = null;
    this.key = opts.key ?? 'ow-progress';
    this.weaponList = opts.weaponList ?? WEAPON_ORDER;
  }

  xpToNext() { return Math.round(90 * Math.pow(1.16, this.level - 1)); }

  addXp(n) {
    this.xp += n;
    let leveled = 0;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++; leveled++;
      this.points++;
      this._unlockForLevel();
    }
    if (leveled) { if (this.onLevelUp) this.onLevelUp(this.level, leveled); }
    if (this.onChange) this.onChange();
    return leveled;
  }

  _unlockForLevel() {
    for (const id of this.weaponList) {
      const w = WEAPONS[id]; if (!w) continue;
      if (w.unlock <= this.level && !this.unlocked.has(id)) this.unlocked.add(id);
    }
  }

  addCoins(n) { this.coins += Math.round(n * this.coinMul); if (this.onChange) this.onChange(); }
  spend(n) { if (this.coins < n) return false; this.coins -= n; if (this.onChange) this.onChange(); return true; }

  applyUpgrade(key) {
    if (this.points <= 0) return false;
    if (!(key in this.upgrades)) return false;
    this.upgrades[key]++; this.points--;
    if (this.onChange) this.onChange();
    return true;
  }

  // derived stats
  get maxHealth() { return Math.round((100 + this.upgrades.vitality * 25) * (1 + (this.setMods().health || 0))); }
  get runSpeed() { return (10.5 + this.upgrades.speed * 0.7) * (1 + (this.setMods().speed || 0)); }
  get walkSpeed() { return 6.0 + this.upgrades.speed * 0.35; }
  get maxStamina() { return 100 + this.upgrades.stamina * 20; }
  get carry() { return 6 + this.upgrades.carry * 3; }
  perk(id) { return this.perks[id] || 0; }
  perkCost(id) { const p = PERKS.find((x) => x.id === id); return p ? p.cost : 0; }
  buyPerk(id) {
    const p = PERKS.find((x) => x.id === id);
    if (!p || this.perk(id) >= p.max) return false;
    if (this.points < p.cost) return false;
    this.points -= p.cost;
    this.perks[id] = this.perk(id) + 1;
    if (this.onChange) this.onChange();
    return true;
  }

  /* ---- gear sets ---- */
  setMods() {
    const s = SETS.find((x) => x.id === this.setId);
    return (s && s.mods) || {};
  }
  ownsSet(id) { return !!this.setsOwned[id]; }
  buySet(id) {
    const set = SETS.find((x) => x.id === id);
    if (!set) return false;
    if (!this.ownsSet(id)) {
      if (this.coins < set.price) return false;
      this.coins -= set.price;
      this.setsOwned[id] = true;
    }
    this.setId = this.setId === id ? null : id;      // wear it, or take it off
    this.save();
    if (this.onChange) this.onChange();
    return true;
  }

  get xpMul() { return (1 + this.prestige * 0.08) * (1 + this.perk('learner') * 0.12); }
  get coinMul() { return 1 + this.prestige * 0.10; }
  canPrestige() { return this.level >= 20; }
  doPrestige() {
    if (!this.canPrestige()) return false;
    this.prestige++;
    this.level = 1; this.xp = 0; this.points = 0; this.coins = 0;
    this.upgrades = { vitality: 0, speed: 0, stamina: 0, carry: 0 };
    this.armorTier = 0; this.armorLevel = 0;
    this.weaponUp = {};
    this.attachments = {};
    this.unlocked = new Set(['knife', 'pistol']);
    if (this.onChange) this.onChange();
    return true;
  }

  get maxArmor() { return (ARMOUR[this.armorTier]?.max ?? 0) + this.armorLevel * ARMOUR_TRACK.perArmor + (this.setMods().armor || 0); }
  get armorAbsorb() {
    return Math.min(0.85, (ARMOUR[this.armorTier]?.absorb ?? 0.4) + this.armorLevel * ARMOUR_TRACK.perAbsorb
      + this.perk('plating') * 0.02);
  }
  get armourName() { return (ARMOUR[this.armorTier]?.name ?? 'No Armour') + (this.armorLevel ? ` +${this.armorLevel}` : ''); }

  /* ---- weapon upgrades ---- */
  weaponUpLevel(id, track) { const u = this.weaponUp[id]; return u ? (u[track] || 0) : 0; }
  weaponUpCost(id, track) {
    const def = WEAPONS[id]; if (!def) return 0;
    return Math.round((50 + def.price * 0.05) * Math.pow(1.40, this.weaponUpLevel(id, track)));
  }
  upgradeWeapon(id, track) {
    const def = WEAPONS[id]; if (!def) return false;
    const tr = WEAPON_TRACKS.find((t) => t.key === track);
    if (!tr || def.mag === Infinity && track === 'mag') return false;
    if (this.weaponUpLevel(id, track) >= tr.max) return false;
    const cost = this.weaponUpCost(id, track);
    if (this.coins < cost) return false;
    this.coins -= cost;
    if (!this.weaponUp[id]) this.weaponUp[id] = {};
    this.weaponUp[id][track] = this.weaponUpLevel(id, track) + 1;
    if (this.onChange) this.onChange();
    return true;
  }
  statsFor(id) {
    const m = this.setMods();
    const st = weaponStats(WEAPONS[id], this.weaponUp[id], this.perk('reload') + (m.reload || 0),
      this.attachments[id], this.masteryBonus(id) + (m.damage || 0));
    return st;
  }

  /* every 40 kills with a weapon permanently adds 3% damage to it, to 5 tiers */
  masteryTier(id) { return Math.min(5, Math.floor((this.mastery[id] || 0) / 40)); }
  masteryBonus(id) { return this.masteryTier(id) * 0.03; }
  addMastery(id, n = 1) {
    this.mastery[id] = (this.mastery[id] || 0) + n;
    return this.masteryTier(id);
  }

  /* ---- attachments ---- */
  equippedAttach(w, slot) {
    const a = this.attachments[w];
    return (a && a[slot]) || 'none';
  }
  ownsAttach(w, slot, id) {
    if (id === 'none') return true;
    const o = this.attachOwned[w];
    return !!(o && o[slot] && o[slot][id]);
  }
  attachPrice(w, slot, id) {
    const list = ATTACHMENTS[slot]; if (!list) return 0;
    const a = list.find((x) => x.id === id);
    return a ? a.price : 0;
  }
  buyAttach(w, slot, id) {
    if (this.ownsAttach(w, slot, id)) { this.equipAttach(w, slot, id); return true; }
    const price = this.attachPrice(w, slot, id);
    if (this.coins < price) return false;
    this.coins -= price;
    if (!this.attachOwned[w]) this.attachOwned[w] = {};
    if (!this.attachOwned[w][slot]) this.attachOwned[w][slot] = {};
    this.attachOwned[w][slot][id] = true;
    this.equipAttach(w, slot, id);
    return true;
  }
  equipAttach(w, slot, id) {
    if (!this.ownsAttach(w, slot, id)) return false;
    if (!this.attachments[w]) this.attachments[w] = {};
    this.attachments[w][slot] = id;
    if (this.onChange) this.onChange();
    return true;
  }

  /* ---- armour plating ---- */
  armorUpCost() { return Math.round(ARMOUR_TRACK.base * Math.pow(ARMOUR_TRACK.growth, this.armorLevel)); }
  upgradeArmor() {
    if (this.armorTier < 1 || this.armorLevel >= ARMOUR_TRACK.max) return false;
    const cost = this.armorUpCost();
    if (this.coins < cost) return false;
    this.coins -= cost; this.armorLevel++;
    if (this.onChange) this.onChange();
    return true;
  }

  setArmourTier(t) {
    if (t <= this.armorTier || t >= ARMOUR.length) return false;
    this.armorTier = t;
    if (this.onChange) this.onChange();
    return true;
  }

  /* ---------------- scrap + crafting ---------------- */
  addScrap(n) { this.scrap = Math.max(0, this.scrap + n); if (this.onChange) this.onChange(); }
  get ngMul() { return 1 + this.ngPlus * 0.35; }          // enemies hit harder each loop
  get ngReward() { return 1 + this.ngPlus * 0.5; }

  canCraft(r) { return this.scrap >= r.scrap; }
  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r || !this.canCraft(r)) return false;
    this.scrap -= r.scrap;
    if (r.coins) this.addCoins(r.coins);
    if (r.give) r.give(this);
    if (this.onChange) this.onChange();
    return true;
  }

  /* ---------------- save slots ---------------- */
  slotKey(n) { return this.key + ':slot' + n; }
  slotInfo(n) {
    try {
      const d = JSON.parse(localStorage.getItem(this.slotKey(n)) || 'null');
      if (!d) return null;
      return { level: d.level, coins: d.coins, prestige: d.prestige || 0, ng: d.ngPlus || 0, at: d._at };
    } catch (_) { return null; }
  }
  saveSlot(n) {
    try {
      const blob = this._blob(); blob._at = Date.now();
      localStorage.setItem(this.slotKey(n), JSON.stringify(blob));
      return true;
    } catch (_) { return false; }
  }
  loadSlot(n) {
    try {
      const d = JSON.parse(localStorage.getItem(this.slotKey(n)) || 'null');
      if (!d) return false;
      this._apply(d);
      this.save();
      if (this.onChange) this.onChange();
      return true;
    } catch (_) { return false; }
  }
  deleteSlot(n) { try { localStorage.removeItem(this.slotKey(n)); return true; } catch (_) { return false; } }

  /* ---------------- New Game+ ---------------- */
  canAscend() { return this.level >= 20; }
  ascend() {
    if (!this.canAscend()) return false;
    this.ngPlus++;
    this.level = 1; this.xp = 0; this.points = 0;
    this.coins = Math.floor(this.coins * 0.25);
    this.prestige++;
    this.save();
    if (this.onChange) this.onChange();
    return true;
  }

  _blob() {
    return {
      level: this.level, xp: this.xp, coins: this.coins, points: this.points,
      upgrades: this.upgrades, armorTier: this.armorTier, armorLevel: this.armorLevel,
      weaponUp: this.weaponUp, perks: this.perks, prestige: this.prestige,
      attachments: this.attachments, attachOwned: this.attachOwned, mastery: this.mastery,
      scrap: this.scrap, ngPlus: this.ngPlus, stash: this.stash,
      installs: this.installs, insurance: this.insurance,
      setId: this.setId, setsOwned: this.setsOwned,
      unlocked: [...this.unlocked],
    };
  }
  _apply(d) {
    this.level = d.level ?? 1; this.xp = d.xp ?? 0; this.coins = d.coins ?? 0;
    this.points = d.points ?? 0; this.upgrades = d.upgrades ?? this.upgrades;
    this.armorTier = d.armorTier ?? 0; this.armorLevel = d.armorLevel ?? 0;
    this.weaponUp = d.weaponUp ?? {}; this.perks = d.perks ?? {};
    this.attachments = d.attachments ?? {}; this.attachOwned = d.attachOwned ?? {};
    this.mastery = d.mastery ?? {}; this.prestige = d.prestige ?? 0;
    this.scrap = d.scrap ?? 0; this.ngPlus = d.ngPlus ?? 0; this.stash = d.stash ?? {};
    this.installs = d.installs ?? {}; this.insurance = d.insurance ?? 0;
    this.setId = d.setId ?? null; this.setsOwned = d.setsOwned ?? {};
    if (d.unlocked) this.unlocked = new Set(d.unlocked);
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this._blob())); } catch (_) {}
  }
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (!d) return false;
      this._apply(d);
      return true;
    } catch (_) { return false; }
  }
  reset() { this.level = 1; this.xp = 0; this.coins = 0; this.points = 0;
    this.upgrades = { vitality: 0, speed: 0, stamina: 0, carry: 0 }; this.armorTier = 0;
    this.armorLevel = 0; this.weaponUp = {}; this.scrap = 0; this.ngPlus = 0;
    this.unlocked = new Set(['knife', 'pistol']); }
}
