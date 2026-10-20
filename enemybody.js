// enemybody.js — modular enemy bodies.
// Every enemy is assembled from a shuffled kit of parts, so a handful of meshes
// produce hundreds of distinct silhouettes. All geometry is shared at module
// level; only materials are per-enemy (they carry the hit flash and corpse fade).
import * as THREE from 'three';
import { clamp } from './core.js';

/* A rounded box: a rounded rectangle extruded with a bevel, so every edge is
   softened. This is the single change that stops the models reading as cubes. */
function roundBox(w, h, d, r) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const sh = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  sh.moveTo(-x - r, -y);
  sh.lineTo(-x - r, y);
  sh.quadraticCurveTo(-x - r, y + r, -x, y + r);
  sh.lineTo(x, y + r);
  sh.quadraticCurveTo(x + r, y + r, x + r, y);
  sh.lineTo(x + r, -y);
  sh.quadraticCurveTo(x + r, -y - r, x, -y - r);
  sh.lineTo(-x, -y - r);
  sh.quadraticCurveTo(-x - r, -y - r, -x - r, -y);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.001, d - r * 2), bevelEnabled: true,
    bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 3,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/* a limb: rounded, and tapered so it reads as an arm or a leg rather than a bar */
function limbGeo(topW, botW, len, depth, r) {
  const g = roundBox(Math.max(topW, botW), len, depth, r);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + len / 2) / len;          // 0 at the bottom, 1 at the top
    const k = botW + (topW - botW) * t;
    pos.setX(i, pos.getX(i) * (k / Math.max(topW, botW)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/* Rounded boxes built at their REAL size, cached. Scaling one unit geometry
   non-uniformly squashes the rounded corners back into a slab, which is what
   kept the models looking boxy. Sizes repeat across enemies, so the cache stays
   small. */
const RB_CACHE = new Map();
function roundBoxCached(w, h, d, r) {
  const key = w.toFixed(2) + ',' + h.toFixed(2) + ',' + d.toFixed(2) + ',' + r.toFixed(2);
  let g = RB_CACHE.get(key);
  if (!g) { g = roundBox(w, h, d, r); RB_CACHE.set(key, g); }
  return g;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 3, 8),
  round: roundBox(1, 1, 1, 0.16),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sph: new THREE.SphereGeometry(0.5, 8, 6),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
};

const HEAD_SHAPES = ['box', 'round', 'long', 'hood', 'helm'];
const TORSO_SHAPES = ['plain', 'broad', 'hunch', 'bloat'];
const ACCESSORIES = ['none', 'none', 'cap', 'helmet', 'pack', 'belt', 'pad'];
const WOUND_COLORS = ['#6a2020', '#7a2a2a', '#4a1a1a'];

/* xorshift — deterministic per spawn, so a body never changes while alive */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function jitterColor(hex, rnd, amt = 0.10) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  hsl.h = (hsl.h + (rnd() - 0.5) * amt + 1) % 1;
  hsl.s = clamp(hsl.s + (rnd() - 0.5) * amt * 1.6, 0.05, 1);
  hsl.l = clamp(hsl.l + (rnd() - 0.5) * amt, 0.06, 0.72);
  return c.setHSL(hsl.h, hsl.s, hsl.l);
}

export class EnemyBody {
  constructor(group, t, seed) {
    this.group = group;
    this.t = t;
    const rnd = makeRng(seed);
    this.rnd = rnd;

    // ---- per-spawn identity ----
    this.sizeJitter = t.boss ? 1 : 0.88 + rnd() * 0.26;
    this.headShape = HEAD_SHAPES[(rnd() * HEAD_SHAPES.length) | 0];
    this.torsoShape = t.boss ? 'broad' : TORSO_SHAPES[(rnd() * TORSO_SHAPES.length) | 0];
    this.accessory = t.boss ? 'pad' : ACCESSORIES[(rnd() * ACCESSORIES.length) | 0];
    this.walkStyle = (rnd() * 3) | 0;
    this.deathPose = (rnd() * 3) | 0;
    this.stance = (rnd() - 0.5) * 0.18;              // shoulder tilt
    this.eyeColor = t.behavior === 'flee' ? '#ffb03a' : t.ranged ? '#59d0ff' : '#ff4d4d';

    const s = t.scale * this.sizeJitter;
    this.s = s;

    // ---- materials (per enemy: hit flash + fade need their own instance) ----
    this.bodyMat = new THREE.MeshStandardMaterial({ color: jitterColor(t.color, rnd), roughness: .85, flatShading: true });
    this.skinMat = new THREE.MeshStandardMaterial({ color: jitterColor(t.skin, rnd, .16), roughness: .9, flatShading: true });
    this.darkMat = new THREE.MeshStandardMaterial({ color: jitterColor('#20242c', rnd, .05), roughness: .9, flatShading: true });
    this.mats = [this.bodyMat, this.skinMat, this.darkMat];

    if (t.elite) {                                    // elites get a faint self-glow
      this.bodyMat.emissive = new THREE.Color(this.eyeColor);
      this.bodyMat.emissiveIntensity = 0.16;
      this.skinMat.emissive = new THREE.Color(this.eyeColor);
      this.skinMat.emissiveIntensity = 0.10;
    }

    // soft contact shadow so enemies never look like they float
    const shadow = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({
      color: '#000', transparent: true, opacity: 0.28, depthWrite: false,
    }));
    shadow.scale.set(1.5 * s, 0.02 * s, 1.5 * s);
    shadow.position.y = 0.02;
    group.add(shadow);
    this.contact = shadow;

    this._buildTorso(s);
    this._buildHead(s);
    this._buildCue(s);
    this._buildLimbs(s);
    this._buildAccessory(s);
    if (t.boss) { this._buildBossProps(s); this._buildWeakPoint(s); }

    // base metrics the animation code uses
    this.baseHeight = 2.3 * s;
    this.baseRadius = t.radius;
    this._damageStage = 0;
    this._limbsLost = 0;
    this.crawling = false;
  }

  /* ---------------- parts ---------------- */
  _buildTorso(s) {
    const g = this.group;
    const shape = this.torsoShape;
    let geo = G.round, sx = 0.72 * s, sy = 1.0 * s, sz = 0.42 * s, y = 1.35 * s, tilt = 0;

    if (shape === 'broad') { sx = 0.94 * s; sy = 0.96 * s; sz = 0.52 * s; }
    else if (shape === 'hunch') { sy = 0.92 * s; tilt = 0.26; y = 1.30 * s; }
    else if (shape === 'bloat') { geo = G.sph; sx = 1.02 * s; sy = 1.12 * s; sz = 1.02 * s; y = 1.32 * s; }

    const useBox = (geo === G.round);
    const torso = new THREE.Mesh(useBox ? roundBoxCached(sx, sy, sz, 0.13 * s) : geo, this.bodyMat);
    if (!useBox) torso.scale.set(sx, sy, sz);
    torso.position.set(0, y, 0);
    torso.rotation.x = tilt;
    torso.rotation.z = this.stance;
    torso.castShadow = true;
    g.add(torso);
    this.torso = torso;
    this.torsoY = y;
  }

  _buildHead(s) {
    const g = this.group;
    const shape = this.headShape;
    const y = this.torsoShape === 'hunch' ? 2.02 * s : 2.08 * s;
    let geo = G.round, hx = 0.44 * s, hy = 0.46 * s, hz = 0.44 * s;

    if (shape === 'round') { geo = G.ico; hx = hy = hz = 0.48 * s; }
    else if (shape === 'long') { hx = 0.34 * s; hy = 0.58 * s; hz = 0.38 * s; }
    else if (shape === 'hood' || shape === 'helm') { hx = 0.42 * s; hy = 0.44 * s; hz = 0.42 * s; }

    const headUseBox = (geo === G.round);
    const head = new THREE.Mesh(headUseBox ? roundBoxCached(hx, hy, hz, 0.11 * s) : geo, this.skinMat);
    if (!headUseBox) head.scale.set(hx, hy, hz);
    head.position.y = y;
    head.rotation.z = this.stance * 1.4;
    head.castShadow = true;
    g.add(head);
    this.head = head;
    this.headY = y;

    // a jaw and a brow: two small rounded slabs that turn a blob into a face
    const jaw = new THREE.Mesh(G.round, this.skinMat);
    jaw.scale.set(hx * 0.78, hy * 0.3, hz * 0.82);
    jaw.position.set(0, y - hy * 0.62, hz * 0.12);
    jaw.castShadow = true;
    const brow = new THREE.Mesh(G.round, this.darkMat);
    brow.scale.set(hx * 0.94, hy * 0.22, hz * 0.4);
    brow.position.set(0, y + hy * 0.28, hz * 0.72);
    g.add(jaw, brow);
    this.faceParts = [jaw, brow];

    // a neck, so the head is not floating on the shoulders
    const neck = new THREE.Mesh(G.capsule, this.skinMat);
    neck.scale.set(0.19 * s, 0.24 * s, 0.19 * s);
    neck.position.set(0, y - hy * 1.05, -0.02 * s);
    g.add(neck);
    this.neck = neck;

    if (shape === 'hood') {
      const hood = new THREE.Mesh(G.cone, this.darkMat);
      hood.scale.set(0.5 * s, 0.5 * s, 0.5 * s);
      hood.position.set(0, y + 0.24 * s, 0.06 * s);
      g.add(hood);
    } else if (shape === 'helm') {
      const dome = new THREE.Mesh(G.sph, this.darkMat);
      dome.scale.set(0.46 * s, 0.3 * s, 0.46 * s);
      dome.position.set(0, y + 0.2 * s, 0);
      g.add(dome);
    }

    // eyes: one glowing bar, or two dots on round heads
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.eyeColor });
    this.mats.push(eyeMat);
    if (shape === 'round' || shape === 'long') {
      this.eyes = [];
      for (const ex of [-1, 1]) {
        const e = new THREE.Mesh(G.box, eyeMat);
        e.scale.set(0.09 * s, 0.07 * s, 0.05 * s);
        e.position.set(0.11 * s * ex, y + 0.04 * s, -hz * 0.95);
        g.add(e); this.eyes.push(e);
      }
    } else {
      const visor = new THREE.Mesh(G.box, eyeMat);
      visor.scale.set(0.40 * s, 0.09 * s, 0.05 * s);
      visor.position.set(0, y + 0.02 * s, -hz * 0.95);
      g.add(visor);
      this.eyes = [visor];
    }
  }

  _buildCue(s) {
    const cue = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: '#ff4d4d' }));
    cue.scale.set(0.15 * s, 0.52 * s, 0.15 * s);
    cue.position.set(0, this.headY + 0.78 * s, 0);
    cue.visible = false;
    this.group.add(cue);
    this.alertCue = cue;
  }

  _buildLimbs(s) {
    const g = this.group;
    this.legs = [];
    this.arms = [];

    const legLen = this.torsoShape === 'bloat' ? 0.72 : 0.85;
    const legGeo = limbGeo(0.27 * s, 0.19 * s, legLen * s, 0.26 * s, 0.07 * s);
    const hipY = 0.42 * s * (legLen / 0.85);
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(legGeo, this.darkMat);
      l.position.set(0.18 * s * sx, hipY, 0);
      l.castShadow = true;
      g.add(l); this.legs.push(l);
    }
    this.legY = hipY;

    const armLen = this.torsoShape === 'broad' ? 0.95 : 0.85;
    const armGeo = limbGeo(0.22 * s, 0.15 * s, armLen * s, 0.21 * s, 0.06 * s);
    const shoulderY = this.torsoY + 0.05 * s;
    for (const sx of [-1, 1]) {
      const a = new THREE.Mesh(armGeo, this.bodyMat);
      a.position.set(0.47 * s * sx, shoulderY, 0);
      a.castShadow = true;
      g.add(a); this.arms.push(a);
    }
    this.armY = shoulderY;
  }

  _buildAccessory(s) {
    const g = this.group;
    const acc = this.accessory;
    if (acc === 'none') return;

    if (acc === 'cap') {
      const cap = new THREE.Mesh(G.box, this.darkMat);
      cap.scale.set(0.46 * s, 0.1 * s, 0.46 * s);
      cap.position.set(0, this.headY + 0.22 * s, 0);
      const brim = new THREE.Mesh(G.box, this.darkMat);
      brim.scale.set(0.42 * s, 0.05 * s, 0.2 * s);
      brim.position.set(0, this.headY + 0.18 * s, -0.26 * s);
      g.add(cap, brim);
      this.accessoryParts = [cap, brim];
    } else if (acc === 'helmet') {
      const helm = new THREE.Mesh(G.sph, this.darkMat);
      helm.scale.set(0.5 * s, 0.34 * s, 0.5 * s);
      helm.position.set(0, this.headY + 0.18 * s, 0);
      g.add(helm);
      this.accessoryParts = [helm];
    } else if (acc === 'pack') {
      const pack = new THREE.Mesh(G.box, this.darkMat);
      pack.scale.set(0.5 * s, 0.6 * s, 0.26 * s);
      pack.position.set(0, this.torsoY + 0.05 * s, 0.3 * s);
      g.add(pack);
      this.accessoryParts = [pack];
    } else if (acc === 'belt') {
      const belt = new THREE.Mesh(G.box, this.darkMat);
      belt.scale.set(0.76 * s, 0.12 * s, 0.46 * s);
      belt.position.set(0, this.torsoY - 0.5 * s, 0);
      g.add(belt);
      this.accessoryParts = [belt];
    } else if (acc === 'pad') {
      const side = this.rnd() < 0.5 ? -1 : 1;
      const pad = new THREE.Mesh(G.box, this.darkMat);
      pad.scale.set(0.3 * s, 0.22 * s, 0.42 * s);
      pad.position.set(0.5 * s * side, this.armY + 0.22 * s, 0);
      g.add(pad);
      this.accessoryParts = [pad];
    }
  }

  _buildBossProps(s) {
    const g = this.group;
    const mat = new THREE.MeshStandardMaterial({
      color: '#2a2430', roughness: .5, metalness: .55, flatShading: true,
      emissive: new THREE.Color(this.eyeColor), emissiveIntensity: 0.25,
    });
    this.mats.push(mat);
    this.bossParts = [];

    // shoulder spikes
    for (const sx of [-1, 1]) {
      const spike = new THREE.Mesh(G.cone, mat);
      spike.scale.set(0.28 * s, 0.72 * s, 0.28 * s);
      spike.position.set(0.62 * s * sx, this.armY + 0.5 * s, 0);
      spike.rotation.z = -0.35 * sx;
      g.add(spike); this.bossParts.push(spike);
    }
    // crown
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const horn = new THREE.Mesh(G.cone, mat);
      horn.scale.set(0.1 * s, 0.42 * s, 0.1 * s);
      horn.position.set(Math.cos(a) * 0.18 * s, this.headY + 0.42 * s, Math.sin(a) * 0.18 * s);
      g.add(horn); this.bossParts.push(horn);
    }
    // aura
    const auraMat = new THREE.MeshBasicMaterial({
      color: this.eyeColor, transparent: true, opacity: 0.10, side: THREE.BackSide, depthWrite: false,
    });
    const aura = new THREE.Mesh(G.sph, auraMat);
    aura.scale.setScalar(3.1 * s);
    aura.position.y = this.torsoY;
    g.add(aura);
    this.aura = aura;
  }

  /* a glowing core on bosses: hitting it hurts a lot more, and breaking it
     staggers them and drops a reward */
  _buildWeakPoint() {
    const core = new THREE.Mesh(G.sphere, new THREE.MeshStandardMaterial({
      color: '#ff3d81', emissive: '#ff3d81', emissiveIntensity: 1.4, roughness: 0.4 }));
    core.scale.setScalar(0.55);
    core.position.set(0, 1.75, -0.45);
    core.userData.weakPoint = true;
    this.weakCore = core;
    this.group.add(core);
    // a pulsing halo so it reads as a target
    const halo = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({
      color: '#ff8ab4', transparent: true, opacity: 0.25, depthWrite: false }));
    halo.scale.setScalar(0.95);
    halo.position.copy(core.position);
    this.weakHalo = halo;
    this.group.add(halo);
  }

  breakWeak() {
    if (!this.weakCore) return;
    this.group.remove(this.weakCore); this.group.remove(this.weakHalo);
    this.weakCore.material.dispose(); this.weakHalo.material.dispose();
    this.weakCore = null; this.weakHalo = null;
  }

  /* ---------------- pooling ---------------- */
  /* Put a pooled body back to a fresh, undamaged look. */
  resetVisual() {
    this.bodyMat.color.copy(jitterColor(this.t.color, this.rnd));
    this.skinMat.color.copy(jitterColor(this.t.skin, this.rnd, .16));
    if (this.t.elite) {
      this.bodyMat.emissive = new THREE.Color(this.eyeColor); this.bodyMat.emissiveIntensity = 0.16;
      this.skinMat.emissive = new THREE.Color(this.eyeColor); this.skinMat.emissiveIntensity = 0.10;
    }
    for (const l of this.legs) l.visible = true;
    for (const a of this.arms) a.visible = true;
    this.crawling = false;
    this._damageStage = 0; this._limbsLost = 0;
    if (this._wounds) { for (const w of this._wounds) { this.group.remove(w); w.material.dispose(); } this._wounds = null; }
    if (this._stumps) { for (const st of this._stumps) { this.group.remove(st); st.material.dispose(); } this._stumps = null; }
    if (this.torso) this.torso.rotation.x = this.torsoShape === 'hunch' ? 0.26 : 0;
    if (this.head) { this.head.position.y = this.headY; this.head.position.z = 0; }
    if (this.aura) this.aura.visible = true;
    if (this.weakCore) this.weakCore.visible = true;
    if (this.alertCue) this.alertCue.visible = false;
    for (const m of this.mats) { m.transparent = false; m.opacity = 1; m.depthWrite = true; }
  }

  /* ---------------- progressive damage ---------------- */
  setDamage(fraction) {
    // stage 0: healthy, 1: bloodied, 2: mauled
    const stage = fraction > 0.6 ? 0 : fraction > 0.3 ? 1 : 2;
    if (stage === this._damageStage) return;
    this._damageStage = stage;

    // darken and bruise as it takes damage
    this.skinMat.color.lerp(new THREE.Color('#5a2a2a'), stage === 1 ? 0.25 : 0.5);
    this.bodyMat.color.lerp(new THREE.Color('#2a2028'), stage === 1 ? 0.18 : 0.38);

    // scatter a couple of wound patches on the torso
    if (stage >= 1 && !this._wounds) {
      this._wounds = [];
      for (let i = 0; i < (stage === 2 ? 4 : 2); i++) {
        const w = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({
          color: WOUND_COLORS[(this.rnd() * WOUND_COLORS.length) | 0], roughness: 1, flatShading: true,
        }));
        const sx = 0.62 * this.s, sy = 0.9 * this.s, sz = 0.46 * this.s;
        w.scale.set(0.16 * this.s, 0.14 * this.s, 0.06 * this.s);
        w.position.set(
          (this.rnd() - 0.5) * sx,
          this.torsoY + (this.rnd() - 0.5) * sy * 0.8,
          (this.rnd() < 0.5 ? -1 : 1) * sz * 0.5,
        );
        this.group.add(w); this._wounds.push(w); this.mats.push(w.material);
      }
    }
    if (stage === 2 && this._limbsLost === 0 && !this.t.boss && this.rnd() < 0.55) this.loseLimb();
    if (stage === 2 && !this.crawling && !this.t.boss && this.rnd() < 0.45) this.crawl();
  }

  /* blow an arm off — swap it for a stump */
  loseLimb() {
    if (this._limbsLost >= 2 || this.arms.length === 0) return false;
    const i = this._limbsLost === 0 ? 1 : 0;
    const arm = this.arms[i];
    if (!arm) return false;
    arm.visible = false;
    const stump = new THREE.Mesh(G.box, new THREE.MeshStandardMaterial({
      color: '#5a2020', roughness: 1, flatShading: true,
    }));
    stump.scale.set(0.24 * this.s, 0.24 * this.s, 0.24 * this.s);
    stump.position.copy(arm.position);
    stump.position.y -= 0.36 * this.s;
    this.group.add(stump);
    this.mats.push(stump.material);
    this._stumps = this._stumps || [];
    this._stumps.push(stump);
    this._limbsLost++;
    return true;
  }

  /* legs gone — drop to a drag */
  crawl() {
    if (this.crawling) return;
    this.crawling = true;
    for (const l of this.legs) l.visible = false;
    this.torso.rotation.x = Math.max(this.torso.rotation.x, 0.85);
    this.head.position.y = this.torsoY - 0.1 * this.s;
    this.head.position.z = -0.3 * this.s;
    if (this.aura) this.aura.visible = false;
  }
}
