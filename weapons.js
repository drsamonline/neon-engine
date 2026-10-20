// weapons.js — arsenal: pistol, smg, shotgun, rifle, sniper, melee
import * as THREE from 'three';
import { clamp, damp } from './core.js';

export const RARITY = {
  common:    { c: '#9aa6b8', name: 'Common' },
  rare:      { c: '#4aa8ff', name: 'Rare' },
  epic:      { c: '#b06aff', name: 'Epic' },
  legendary: { c: '#ffb03a', name: 'Legendary' },
};

/* selectable view-model colour themes (Settings → Weapon colour) */
export const THEMES = {
  neon:     { name: 'Neon',     accent: null },
  military: { name: 'Military', accent: '#7d9a4e' },
  crimson:  { name: 'Crimson',  accent: '#e0432f' },
  gold:     { name: 'Gold',     accent: '#e8c33a' },
  ice:      { name: 'Ice',      accent: '#5fd4ff' },
  violet:   { name: 'Violet',   accent: '#a86aff' },
};

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Combat Knife', kind: 'melee', damage: 70, rpm: 150, mag: Infinity,
    reserve: Infinity, spread: 0, pellets: 1, range: 2.9, reload: 0, auto: true,
    unlock: 1, price: 0, ch: 0.5, rarity: 'common',
    palette: { body: '#5f6d84', accent: '#dbe6f5', barrel: '#9aa7bb' },
  },
  pistol: {
    id: 'pistol', name: 'M9 Pistol', kind: 'pistol', damage: 28, rpm: 320, mag: 12,
    reserveMax: 120, spread: 0.014, pellets: 1, range: 90, reload: 1.1, auto: false,
    unlock: 1, price: 0, ch: 1.0, rarity: 'common',
    altFire: { kind: 'burst', count: 2, delay: 0.06 },
    palette: { body: '#4d5a72', accent: '#38f2c8', barrel: '#2a3140' },
  },
  revolver: {
    id: 'revolver', name: '.44 Revolver', kind: 'revolver', damage: 62, rpm: 150, mag: 6,
    reserveMax: 60, spread: 0.020, pellets: 1, range: 80, reload: 1.7, auto: false,
    unlock: 2, price: 700, ch: 1.25, rarity: 'rare',
    palette: { body: '#6f5844', accent: '#e0a04a', barrel: '#463626' },
  },
  smg: {
    id: 'smg', name: 'Vex SMG', kind: 'smg', damage: 16, rpm: 800, mag: 32,
    reserveMax: 320, spread: 0.032, pellets: 1, range: 70, reload: 1.3, auto: true,
    unlock: 3, price: 700, ch: 1.6, rarity: 'rare',
    palette: { body: '#4e5c72', accent: '#4aa8ff', barrel: '#2c3648' },
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12g', kind: 'shotgun', damage: 14, rpm: 75, mag: 6,
    reserveMax: 60, spread: 0.10, pellets: 9, range: 26, reload: 1.8, auto: false,
    unlock: 4, price: 850, ch: 2.4, rarity: 'rare', altFire: { kind: 'slug', mult: 3.4 },
    palette: { body: '#6f4c3a', accent: '#ff9142', barrel: '#3e2a20' },
  },
  crossbow: {
    id: 'crossbow', name: 'Compound Bow', kind: 'crossbow', damage: 215, rpm: 55, mag: 1,
    reserveMax: 40, spread: 0.002, pellets: 1, range: 190, reload: 1.5, auto: false,
    unlock: 5, price: 650, ch: 0.6, rarity: 'epic', silent: true,
    palette: { body: '#6f5840', accent: '#7fd85a', barrel: '#463626' },
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Rifle', kind: 'rifle', damage: 26, rpm: 620, mag: 30,
    reserveMax: 300, spread: 0.020, pellets: 1, range: 140, reload: 1.6, auto: true,
    unlock: 6, price: 1200, ch: 1.3, rarity: 'epic', altFire: { kind: 'burst', count: 3, delay: 0.07 },
    palette: { body: '#566a90', accent: '#9a7cff', barrel: '#2e3a52' },
  },
  sniper: {
    id: 'sniper', name: 'Longshot .50', kind: 'sniper', damage: 195, rpm: 64, mag: 5,
    reserveMax: 40, spread: 0.0015, pellets: 1, range: 260, reload: 2.3, auto: false,
    unlock: 8, price: 1400, ch: 0.28, rarity: 'epic', pierce: 2, ricochet: 1,
    palette: { body: '#41506a', accent: '#59d0ff', barrel: '#243044' },
  },
  lmg: {
    id: 'lmg', name: 'M249 LMG', kind: 'lmg', damage: 24, rpm: 760, mag: 100,
    reserveMax: 400, spread: 0.050, pellets: 1, range: 110, reload: 3.2, auto: true,
    unlock: 9, price: 1800, ch: 2.0, rarity: 'legendary', pierce: 1, heat: 0.011,
    palette: { body: '#5c6444', accent: '#e8c33a', barrel: '#333a26' },
  },
  launcher: {
    id: 'launcher', name: 'RPG Launcher', kind: 'launcher', damage: 55, rpm: 35, mag: 1,
    reserveMax: 12, spread: 0.010, pellets: 1, range: 220, reload: 2.6, auto: false,
    unlock: 11, price: 2000, ch: 1.8, rarity: 'legendary',
    explosive: { radius: 9, damage: 190 },
    palette: { body: '#6f4034', accent: '#ff6a3a', barrel: '#3e241c' },
  },
  taser: {
    id: 'taser', name: 'Arc Taser', kind: 'taser', damage: 30, rpm: 90, mag: 2,
    reserveMax: 20, spread: 0.006, pellets: 1, range: 9, reload: 1.4, auto: false,
    effect: 'shock', effectTime: 2.4, unlock: 3, price: 600, ch: 0.8, rarity: 'rare',
    palette: { body: '#3f4a5a', accent: '#ffe14d', barrel: '#20262f' },
  },
  flame: {
    id: 'flame', name: 'Purifier', kind: 'flame', damage: 9, rpm: 900, mag: 120,
    reserveMax: 400, spread: 0.09, pellets: 1, range: 13, reload: 2.4, auto: true,
    effect: 'burn', effectTime: 3.2, unlock: 12, price: 2000, ch: 2.2, rarity: 'legendary',
    palette: { body: '#5a4038', accent: '#ff6a2a', barrel: '#2f211c' },
  },
  minigun: {
    id: 'minigun', name: 'Vulcan Minigun', kind: 'minigun', damage: 18, rpm: 1400, mag: 200,
    reserveMax: 600, spread: 0.06, pellets: 1, range: 90, reload: 4.5, auto: true,
    spinup: 0.9, unlock: 13, price: 2600, ch: 2.6, rarity: 'legendary', pierce: 1, heat: 0.0075,
    palette: { body: '#5a5442', accent: '#ffb03a', barrel: '#33302a' },
  },
};

/* attachment slots — buy once per weapon, then swap freely */
export const ATTACH_SLOTS = [
  { key: 'optic', name: 'Optic' },
  { key: 'muzzle', name: 'Muzzle' },
  { key: 'mag', name: 'Magazine' },
  { key: 'grip', name: 'Grip' },
];

export const ATTACHMENTS = {
  optic: [
    { id: 'none', name: 'Iron Sights', price: 0, mod: {} },
    { id: 'holo', name: 'Holo Sight', price: 350, mod: { spread: -0.10 }, note: '-10% spread' },
    { id: 'scope', name: '4x Scope', price: 700, mod: { spread: -0.18, ads: 0.25 }, note: '-18% spread, slower ADS' },
  ],
  muzzle: [
    { id: 'none', name: 'Bare', price: 0, mod: {} },
    { id: 'comp', name: 'Compensator', price: 400, mod: { spread: -0.22, recoil: -0.15 }, note: '-22% spread, less recoil' },
    { id: 'supp', name: 'Suppressor', price: 650, mod: { silent: true, damage: -0.08 }, note: 'silent, -8% damage' },
  ],
  mag: [
    { id: 'none', name: 'Standard', price: 0, mod: {} },
    { id: 'ext', name: 'Extended Mag', price: 450, mod: { mag: 0.5 }, note: '+50% magazine' },
    { id: 'drum', name: 'Drum Mag', price: 900, mod: { mag: 1.0, reload: 0.2 }, note: '+100% mag, +20% reload' },
  ],
  grip: [
    { id: 'none', name: 'None', price: 0, mod: {} },
    { id: 'vert', name: 'Vertical Grip', price: 300, mod: { spread: -0.15 }, note: '-15% spread' },
    { id: 'ang', name: 'Angled Grip', price: 380, mod: { recoil: -0.25 }, note: '-25% recoil' },
  ],
};

/* merge every equipped attachment into one modifier object */
function attachmentMods(equipped) {
  const out = {};
  if (!equipped) return out;
  for (const slot of Object.keys(equipped)) {
    const list = ATTACHMENTS[slot]; if (!list) continue;
    const a = list.find((x) => x.id === equipped[slot]); if (!a) continue;
    for (const [k, v] of Object.entries(a.mod)) {
      if (k === 'silent') out.silent = true;
      else out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

/* per-weapon upgrade tracks — how a single gun keeps growing with you */
export const WEAPON_TRACKS = [
  { key: 'damage', name: 'Damage',   max: 5, step: '+8% damage' },
  { key: 'mag',    name: 'Magazine', max: 5, step: '+20% mag size' },
  { key: 'reload', name: 'Reload',   max: 5, step: '-6% reload time' },
  { key: 'spread', name: 'Accuracy', max: 5, step: '-7% spread' },
];

/* apply a weapon's upgrade levels to its base definition */
export function weaponStats(def, up, reloadBonus = 0, att = null, masteryBonus = 0) {
  const u = up || {};
  const dl = u.damage || 0, ml = u.mag || 0, rl = u.reload || 0, sl = u.spread || 0;
  const magStep = def.mag === Infinity ? 0 : Math.max(1, Math.round(def.mag * 0.2));
  const st = {
    damage: def.damage * (1 + 0.08 * dl),
    mag: def.mag === Infinity ? Infinity : def.mag + magStep * ml,
    magStep,
    reload: def.reload * Math.max(0.35, 1 - 0.06 * rl - 0.12 * reloadBonus),
    spread: def.spread * Math.max(0.35, 1 - 0.07 * sl),
  };
  if (def.explosive) st.explosive = { radius: def.explosive.radius, damage: def.explosive.damage * (1 + 0.08 * dl) };
  // attachments
  const a = attachmentMods(att);
  if (a.damage) st.damage *= (1 + a.damage);
  if (a.mag && def.mag !== Infinity) st.mag = Math.max(1, Math.round(st.mag * (1 + a.mag)));
  if (a.spread) st.spread *= Math.max(0.25, 1 + a.spread);
  if (a.reload) st.reload *= (1 + a.reload);
  if (a.recoil) st.recoil = 1 + a.recoil;
  if (a.ads) st.adsSlow = 1 + a.ads;
  if (a.silent) st.silent = true;
  if (masteryBonus) st.damage *= (1 + masteryBonus);
  return st;
}

/* human-readable "before → after" line for an upgrade row */
export function statDelta(track, a, b) {
  if (track === 'damage') return `${Math.round(a.damage)} \u2192 ${Math.round(b.damage)} dmg`;
  if (track === 'mag') return `${a.mag} \u2192 ${b.mag} rounds`;
  if (track === 'reload') return `${a.reload.toFixed(2)}s \u2192 ${b.reload.toFixed(2)}s reload`;
  return `${(a.spread * 1000).toFixed(0)} \u2192 ${(b.spread * 1000).toFixed(0)} spread`;
}

export const WEAPON_ORDER = ['knife', 'pistol', 'revolver', 'smg', 'shotgun', 'crossbow', 'rifle', 'sniper', 'lmg', 'launcher', 'taser', 'flame', 'minigun'];

/* gloved hands, added to every view model so the weapon is held, not floating */
function addHands(g, pal) {
  const glove = new THREE.MeshStandardMaterial({ color: '#232a33', roughness: .85, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: '#c8a884', roughness: .9, flatShading: true });
  const cuff = new THREE.MeshStandardMaterial({ color: '#39424f', roughness: .8, flatShading: true });
  const grip = (x, z, rx, rz) => {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.17), glove);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.10), glove);
    thumb.position.set(0.07, 0.04, -0.02);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.09), cuff);
    wrist.position.set(0, -0.02, 0.13);
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), skin);
    knuckle.position.set(0, 0.06, -0.06);
    h.add(palm, thumb, wrist, knuckle);
    h.position.set(x, -0.10, z);
    h.rotation.set(rx || 0, 0, rz || 0);
    g.add(h);
    return h;
  };
  const right = grip(0.055, 0.02, 0.18, -0.10);       // trigger hand
  const left = grip(-0.075, -0.30, 0.10, 0.16);       // support hand
  return { right, left };
}

function buildModel(def, theme) {
  const g = new THREE.Group();
  const pal = def.palette || { body: '#2b3342', accent: '#38f2c8', barrel: '#12161f' };
  const accent = (theme && theme.accent) || pal.accent;
  const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: .46, metalness: .6,
    emissive: pal.body, emissiveIntensity: .38 });
  const dark = new THREE.MeshStandardMaterial({ color: pal.barrel, roughness: .66, metalness: .45,
    emissive: pal.barrel, emissiveIntensity: .32 });
  const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: .28, metalness: .55,
    emissive: accent, emissiveIntensity: .75 });

  if (def.kind === 'melee') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.5), bodyMat);
    blade.position.set(0, 0, -0.35); g.add(blade);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.18), dark);
    hilt.position.set(0, 0, 0.02); g.add(hilt);
    g.position.set(0.28, -0.26, -0.45);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.6); g.add(muzzle);
    return { g, muzzle, flashPos: new THREE.Vector3(0, 0, -0.6) };
  }

  if (def.kind === 'crossbow') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.75), bodyMat);
    stock.position.set(0, 0, -0.18); g.add(stock);
    const limbs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.06), dark);
    limbs.position.set(0, 0.04, -0.42); g.add(limbs);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), acc);
    string.position.set(0, 0.04, -0.05); g.add(string);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), acc);
    bolt.rotation.x = Math.PI / 2; bolt.position.set(0, 0.04, -0.4); g.add(bolt);
    g.position.set(0.26, -0.24, -0.42);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.04, -0.9); g.add(muzzle);
    return { g, muzzle, flashPos: new THREE.Vector3(0, 0.04, -0.9) };
  }

  if (def.kind === 'launcher') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.95, 10), bodyMat);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.02, -0.42); g.add(tube);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), dark);
    grip.position.set(0, -0.17, 0.02); grip.rotation.x = 0.3; g.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), acc);
    sight.position.set(0, 0.14, -0.2); g.add(sight);
    g.position.set(0.26, -0.22, -0.42);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.92); g.add(muzzle);
    return { g, muzzle, flashPos: new THREE.Vector3(0, 0.02, -0.92) };
  }

  const L = def.kind === 'sniper' ? 0.75 : def.kind === 'shotgun' ? 0.6 : def.kind === 'rifle' ? 0.55 : 0.42;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, L), bodyMat);
  body.position.set(0, 0, -L / 2 + 0.1); g.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, L * 0.9, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -L - 0.12); g.add(barrel);

  const magLen = def.kind === 'smg' ? 0.26 : 0.2;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, magLen, 0.11), acc);
  mag.position.set(0, -0.16, -0.02); g.add(mag);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), dark);
  grip.position.set(0, -0.16, 0.14); grip.rotation.x = 0.25; g.add(grip);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.22), bodyMat);
  stock.position.set(0, -0.02, 0.24); g.add(stock);

  if (def.kind === 'sniper' || def.kind === 'rifle') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8), dark);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.12, -0.25); g.add(scope);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), acc);
    lens.position.set(0, 0.12, -0.37); g.add(lens);
  } else {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), acc);
    sight.position.set(0, 0.12, -0.3); g.add(sight);
  }

  g.position.set(0.26, -0.24, -0.42);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -L - 0.5); g.add(muzzle);
  const hands = addHands(g, pal);
  return { g, muzzle, hands, flashPos: new THREE.Vector3(0, 0.03, -L - 0.5) };
}

export class Arsenal {
  constructor(camera, scene, player, audio) {
    this.camera = camera; this.scene = scene; this.player = player; this.audio = audio;
    this.slots = [];        // {def, ammo, reserve}
    this.index = 0;
    this.cool = 0; this.reloading = false; this.reloadT = 0;
    this.recoil = 0; this.adsPos = 0;
    this.onHit = null; this.onKill = null;
    this.raycaster = new THREE.Raycaster(); this.raycaster.far = 400;
    this._tracers = []; this._tracerPool = [];
    this._decals = []; this._decalPool = [];
    this._projectiles = [];
    this._buildDecalTex();
    this._vmHolder = new THREE.Group();
    this._vmHolder.frustumCulled = false;
    camera.add(this._vmHolder);
    this.muzzleLight = new THREE.PointLight('#ffd98a', 0, 9);
    this._vmHolder.add(this.muzzleLight);
    this._model = null;
    this.theme = 'neon';
    this.upgrades = {};   // id -> {damage, mag, reload, spread} (shared with progression)
    this._sway = new THREE.Vector2();
    this.spin = 0;                 // minigun spin-up
    this.heat = 0;                 // 0..1; overheated weapons lock out until they cool
    this.overheated = false;
    this._burstN = 0;
    this.stats = {};               // id -> { shots, hits, kills }
  }

  setTheme(id) {
    if (!THEMES[id] || this.theme === id) return;
    this.theme = id;
    this._equip(this.index);
  }

  stat(id) {
    if (!this.stats[id]) this.stats[id] = { shots: 0, hits: 0, kills: 0 };
    return this.stats[id];
  }

  _st(def) {
    const up = this.progression ? this.progression.weaponUp[def.id] : this.upgrades[def.id];
    const reloadBonus = this.progression ? this.progression.perk('reload') : 0;
    const att = this.progression ? this.progression.attachments[def.id] : null;
    return weaponStats(def, up, reloadBonus, att);
  }
  currentMag() { const s = this.current; return s ? this._st(s.def).mag : 0; }

  has(id) { return this.slots.some((s) => s.def.id === id); }
  slotOf(id) { return this.slots.findIndex((s) => s.def.id === id); }

  remove(id) {
    const i = this.slots.findIndex((sl) => sl.def.id === id);
    if (i < 0 || this.slots.length <= 1) return false;
    this.slots.splice(i, 1);
    if (this.index >= this.slots.length) this.index = this.slots.length - 1;
    this._equip(this.index);
    return true;
  }

  add(id) {
    if (this.has(id)) return false;
    const def = WEAPONS[id];
    this.slots.push({ def, ammo: this._st(def).mag, reserve: def.reserveMax ?? 0 });
    if (this.slots.length === 1) this._equip(0);
    return true;
  }

  switchTo(i) {
    if (i < 0 || i >= this.slots.length || i === this.index) return;
    this._equip(i);
    if (this.audio) this.audio.reload();
  }
  next() { this.switchTo((this.index + 1) % this.slots.length); }

  _equip(i) {
    this.index = i;
    this.reloading = false;
    if (this._model) this._vmHolder.remove(this._model);
    const built = buildModel(this.slots[i].def, THEMES[this.theme]);
    this._model = built.g; this._muzzle = built.muzzle; this._hands = built.hands;
    this.muzzleLight.position.copy(built.flashPos);
    this._vmHolder.add(this._model);
    this.basePos = this._model.position.clone();
    this.handBase = this._hands ? this._hands.left.position.clone() : null;
  }

  get current() { return this.slots[this.index]; }

  _buildDecalTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 26);
    grd.addColorStop(0, 'rgba(6,8,12,.95)'); grd.addColorStop(.5, 'rgba(20,22,28,.7)');
    grd.addColorStop(1, 'rgba(20,22,28,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2;
      g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20); g.stroke(); }
    this._decalTex = new THREE.CanvasTexture(c);
  }

  _decal(p, n) {
    let d = this._decalPool.pop();
    if (!d) { const m = new THREE.MeshBasicMaterial({ map: this._decalTex, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      d = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), m); }
    d.visible = true; this.scene.add(d);
    d.position.copy(p).addScaledVector(n, 0.01);
    d.lookAt(p.clone().add(n)); d.rotation.z = Math.random() * Math.PI;
    this._decals.push(d);
    if (this._decals.length > 50) { const o = this._decals.shift(); o.visible = false;
      this.scene.remove(o); this._decalPool.push(o); }
  }

  _tracer(from, to, color = '#ffe9a8') {
    let t = this._tracerPool.pop();
    if (!t) { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      t = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 })); }
    t.material.color.set(color); t.material.opacity = .9;
    const p = t.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, to.x, to.y, to.z); p.needsUpdate = true;
    t.visible = true; this.scene.add(t);
    this._tracers.push({ line: t, life: 0.05 });
    if (this._tracers.length > 30) { const o = this._tracers.shift(); o.line.visible = false;
      this.scene.remove(o.line); this._tracerPool.push(o.line); }
  }

  fire(ctx) {
    const slot = this.current; if (!slot) return false;
    const def = slot.def;
    if (this.reloading) {
      if (slot.ammo > 0) this.reloading = false;   // cancel the reload and shoot
      else return false;
    }
    if (this.cool > 0) return false;

    if (def.kind === 'melee') { this._melee(ctx, def); return true; }
    if (this.overheated) return false;

    // alt fire: a burst, or a heavy single slug
    if (ctx.alt && def.altFire && this._burstN <= 0 && slot.ammo > 0) {
      if (def.altFire.kind === 'burst') {
        this._burstN = def.altFire.count - 1;
        this._burstCtx = ctx;
        this._burstDelay = def.altFire.delay;
        this._burstT = def.altFire.delay;
      } else if (def.altFire.kind === 'slug') {
        this._slug = def.altFire.mult;
      }
    }

    if (slot.ammo <= 0) { this.startReload(); return false; }
    slot.ammo--;
    this.cool = 60 / def.rpm;
    this.recoil = Math.min(1, this.recoil + 0.9);

    const origin = new THREE.Vector3(); this.camera.getWorldPosition(origin);
    const base = new THREE.Vector3(); this.camera.getWorldDirection(base);
    const st = this._st(def);
    let spread = st.spread * (1 - this.player.zoom * 0.7);
    if (this._slug) { st.damage *= this._slug; spread *= 0.15; }
    const muzzleWorld = new THREE.Vector3(); this._muzzle.getWorldPosition(muzzleWorld);

    // explosive launcher fires a travelling projectile instead of a hitscan
    if (def.explosive) {
      const dir = base.clone().normalize();
      this._launch(ctx, def, st, muzzleWorld.clone(), dir);
      this.recoil = 1.1;
      this.muzzleLight.intensity = 3.5;
      this.player.kick(0.05, (Math.random() - .5) * 0.008);
      this.player.addShake(0.4);
      if (this.audio) this.audio.shot('shotgun');
      return true;
    }

    const rpm = def.spinup ? def.rpm * (0.22 + 0.78 * Math.min(1, this.spin / def.spinup)) : def.rpm;
    this.cool = 60 / rpm;
    this.stat(def.id).shots++;
    if (def.heat) {
      this.heat = Math.min(1, this.heat + def.heat);
      if (this.heat >= 1) { this.overheated = true; if (this.audio) this.audio.error(); }
    }

    for (let p = 0; p < (def.pellets || 1); p++) {
      const dir = base.clone();
      dir.x += (Math.random() - .5) * spread * 2; dir.y += (Math.random() - .5) * spread * 2;
      dir.z += (Math.random() - .5) * spread * 2; dir.normalize();
      this.raycaster.set(origin, dir);
      this.raycaster.far = def.range;
      const hits = this.raycaster.intersectObjects(ctx.hittables, true);
      let end = origin.clone().addScaledVector(dir, def.range);

      // a bullet stops at the first wall but passes through up to `pierce` bodies
      let pierced = 0;
      const maxPierce = def.pierce || 0;
      const struck = new Set();
      for (const h of hits) {
        const enemy = h.object.userData.enemy;
        if (!enemy || !enemy.alive) {                       // wall or corpse: stop here
          end = h.point.clone();
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
            : dir.clone().negate();
          this._decal(h.point, n);
          if (ctx.particles) ctx.particles.impact(h.point, 5);
          if (this.onWorldHit) this.onWorldHit(h.point, h.object, dir);
          // ricochet: bounce the round once and keep going
          if (def.ricochet && !p._bounced) {
            const bd = dir.clone().reflect(n).normalize();
            this.raycaster.set(h.point.clone().addScaledVector(bd, 0.05), bd);
            const h2 = this.raycaster.intersectObjects(ctx.hittables, true);
            if (h2.length) {
              const g2 = h2[0], e2 = g2.object.userData.enemy;
              if (e2 && e2.alive) {
                const d2 = st.damage * 0.6;
                e2.damage(d2, g2.point, bd);
                if (this.onDamage) this.onDamage(g2.point, d2, 'normal');
                if (!e2.alive) { this.stat(def.id).kills++; if (this.onKill) this.onKill(e2); }
              }
              end = g2.point.clone();
            } else end = h.point.clone().addScaledVector(bd, def.range);
          }
          break;
        }
        if (struck.has(enemy)) continue;
        struck.add(enemy);
        const fall = clamp(1 - h.distance / def.range, 0.4, 1);
        const weak = h.object.userData.weakPoint && !enemy.weakBroken;
        const head = weak || h.point.y >= enemy.headHeight();
        let mult = head ? 1.5 : 1;
        if (weak) mult = 2.6;                       // the glowing core
        const dmg = st.damage * fall * mult;
        enemy.damage(dmg, h.point, dir);
        if (def.effect && enemy.alive) enemy.applyEffect(def.effect, def.effectTime || 2);
        if (dmg > 28) enemy.stagger(0.25);
        this.stat(def.id).hits++;
        if (weak) enemy.hitWeak(dmg);
        if (this.onDamage) this.onDamage(h.point, dmg, head ? 'crit' : 'normal');
        if (this.onHit) this.onHit(enemy, h.point, dmg, head);
        if (head && this.onHeadshot) this.onHeadshot(enemy);
        if (!enemy.alive) { this.stat(def.id).kills++; if (this.onKill) this.onKill(enemy); }
        end = h.point.clone();
        if (pierced >= maxPierce) break;
        pierced++;
      }
      if (!def.silent && !st.silent) this._tracer(muzzleWorld, end);
    }

    // effects
    if (ctx.particles) {
      ctx.particles.impact(muzzleWorld, 3, [1, .85, .5]);
      ctx.particles.smoke(muzzleWorld, 2);            // lingering muzzle smoke
      ctx.particles.casing(muzzleWorld, base);        // ejected brass
    }
    this.muzzleLight.intensity = 3.2;
    // recoil scales with punch and rate of fire, with a horizontal wander
    const punch = clamp((def.damage * (def.pellets || 1)) / 260 + (def.rpm / 1600) * 0.6, 0.25, 2.2) * (st.recoil || 1);
    this._slug = 0;
    this.player.kick(0.010 * punch, (Math.random() - .5) * 0.010 * punch);
    if (def.kind === 'sniper' || def.kind === 'shotgun') this.player.kick(0.045, (Math.random() - .5) * 0.012);
    this.player.addShake(def.kind === 'shotgun' || def.kind === 'sniper' ? 0.25 : 0.08);
    this.player.fovPunch = (def.kind === 'sniper' || def.kind === 'shotgun') ? 2.4
      : def.kind === 'launcher' ? 3.0 : 1.1;
    if (this.audio && !def.silent && !st.silent) this.audio.shot(def.kind);
    return true;
  }

  /* ---------------- projectiles ---------------- */
  _launch(ctx, def, st, origin, dir) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ffb03a' }));
    mesh.position.copy(origin);
    const light = new THREE.PointLight('#ffb03a', 1.6, 9); mesh.add(light);
    this.scene.add(mesh);
    this._projectiles.push({ mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(46), life: 5, def, st, ctx });
  }

  _explode(pos, st, ctx) {
    if (ctx.particles) ctx.particles.explosion(pos, 55);
    if (this.audio) this.audio.explosion();
    this.player.addShake(0.95);
    const R = st.explosive.radius;
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const d = e.group.position.distanceTo(pos);
      if (d < R) {
        const fall = 1 - d / R;
        e.damage(st.explosive.damage * (0.4 + 0.6 * fall), e.group.position.clone(),
          new THREE.Vector3(0, 0.35, 0).normalize());
        if (this.onHit) this.onHit(e, e.group.position, 0);
        if (!e.alive && this.onKill) this.onKill(e);
      }
    }
    if (this.player.pos.distanceTo(pos) < R * 0.7) this.player.damage(st.explosive.damage * 0.12);
  }

  _updateProjectiles(dt) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      let hit = p.life <= 0;
      if (!hit) for (const e of p.ctx.enemies) {
        if (e.alive && e.group.position.distanceTo(p.pos) < e.radius + 0.7) { hit = true; break; }
      }
      if (!hit) for (const c of this.player.world.collidersNear(p.pos.x, p.pos.z, 0.7)) {
        if (p.pos.x > c.minX && p.pos.x < c.maxX && p.pos.z > c.minZ && p.pos.z < c.maxZ && p.pos.y < c.height) { hit = true; break; }
      }
      if (hit) {
        this._explode(p.pos, p.st, p.ctx);
        this.scene.remove(p.mesh);
        this._projectiles.splice(i, 1);
      }
    }
  }

  _melee(ctx, def) {
    const st = this._st(def);
    this.cool = 60 / def.rpm;
    this.recoil = 0.7;
    if (this.audio) this.audio.shot('melee');
    const origin = new THREE.Vector3(); this.camera.getWorldPosition(origin);
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    this.player.addImpulse(new THREE.Vector3(fwd.x * 5.5, 0, fwd.z * 5.5));   // lunge
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const to = e.group.position.clone().sub(origin); to.y = 0;
      const d = to.length();
      if (d > def.range + e.radius) continue;
      to.normalize();
      if (to.dot(fwd) > 0.5) {
        e.damage(st.damage, e.group.position.clone().setY(1.2), fwd);
        if (this.onHit) this.onHit(e, e.group.position, st.damage);
        if (!e.alive && this.onKill) this.onKill(e);
      }
    }
  }

  startReload() {
    const slot = this.current; if (!slot || this.reloading) return;
    const def = slot.def;
    if (def.kind === 'melee') return;
    if (slot.ammo >= this._st(def).mag || slot.reserve <= 0) return;
    this.reloading = true; this.reloadT = 0;
    if (this.audio) this.audio.reload();
  }

  addAmmo(frac = 0.5) {
    for (const s of this.slots) if (s.def.kind !== 'melee') {
      s.reserve = Math.min(s.def.reserveMax, s.reserve + Math.ceil(s.def.reserveMax * frac));
    }
  }

  update(dt, input, dtWorld) {
    this.cool = Math.max(0, this.cool - dt);
    const slot = this.current; if (!slot) return;
    const def = slot.def;

    if (this.reloading) {
      this.reloadT += dt;
      const st = this._st(def);
      const rp = Math.sin(Math.min(1, this.reloadT / st.reload) * Math.PI);
      if (this._model) this._model.rotation.x = rp * 0.9;
      // the support hand drops away and comes back with the magazine
      if (this._hands && this.handBase) {
        this._hands.left.position.y = this.handBase.y - rp * 0.22;
        this._hands.left.position.z = this.handBase.z + rp * 0.10;
        this._hands.right.rotation.x = 0.18 - rp * 0.4;
      }
      if (this.reloadT >= st.reload) {
        const need = st.mag - slot.ammo, take = Math.min(need, slot.reserve);
        slot.ammo += take; slot.reserve -= take;
        this.reloading = false;
        if (this._model) this._model.rotation.x = 0;
        if (this._hands && this.handBase) { this._hands.left.position.copy(this.handBase); this._hands.right.rotation.x = 0.18; }
      }
    }

    // ADS position lerp
    this.adsPos = this.player.zoom;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const r = this.recoil * this.recoil;

    if (this._model) {
      const t = performance.now() / 1000;
      const bobX = Math.sin(t * 2) * 0.006, bobY = Math.cos(t * 4) * 0.006;
      // the gun lags behind fast turns
      const tx = clamp(-this.player.lookVX * 0.00042, -0.035, 0.035);
      const ty = clamp(-this.player.lookVY * 0.00042, -0.035, 0.035);
      this._sway.x = damp(this._sway.x, tx, 9, dt);
      this._sway.y = damp(this._sway.y, ty, 9, dt);
      const hip = this.basePos;
      const ads = new THREE.Vector3(0, -0.16, -0.32);
      const swayK = 1 - this.adsPos * 0.6;
      this._model.position.set(
        hip.x + (ads.x - hip.x) * this.adsPos + bobX + this._sway.x * swayK,
        hip.y + (ads.y - hip.y) * this.adsPos + bobY + this._sway.y * swayK - r * 0.02,
        hip.z + (ads.z - hip.z) * this.adsPos + r * 0.09);
      this._model.rotation.x = -r * 0.25;
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);
    // minigun spin-up / spin-down
    const firing = input && input.fire && this.current && this.current.def.spinup && this.cool <= 0;
    if (firing) this.spin = Math.min((this.current.def.spinup || 1), this.spin + dt);
    else this.spin = Math.max(0, this.spin - dt * 2.2);

    // heat cools when you are not shooting
    if (this.heat > 0) {
      const cooling = (input && input.fire) ? 0.10 : 0.42;
      this.heat = Math.max(0, this.heat - cooling * dt);
      if (this.overheated && this.heat <= 0.25) this.overheated = false;
    }
    // alt-fire burst: fire the remaining rounds on a short timer
    if (this._burstN > 0) {
      this._burstT -= dt;
      if (this._burstT <= 0) {
        this._burstT = this._burstDelay;
        this._burstN--;
        this.cool = 0;
        this.fire(this._burstCtx || { hittables: [], particles: null });
      }
    }

    this._updateProjectiles(dtWorld === undefined ? dt : dtWorld);

    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const tr = this._tracers[i]; tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.05) * 0.9;
      if (tr.life <= 0) { tr.line.visible = false; this.scene.remove(tr.line); this._tracerPool.push(tr.line);
        this._tracers.splice(i, 1); }
    }
  }

  ammoText() {
    const s = this.current; if (!s) return ['0', '0'];
    if (s.def.kind === 'melee') return ['∞', '∞'];
    return [String(s.ammo), String(s.reserve)];
  }
}
