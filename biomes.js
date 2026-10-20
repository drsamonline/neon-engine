// biomes.js — one generator per biome, plus the building and interior builders.
// Installed onto World.prototype so `this` still refers to the chunk builder.
import * as THREE from 'three';
import { CHUNK, G } from './worldkit.js';
import { pick } from './core.js';

export function installBiomes(World) {
  Object.assign(World.prototype, {
  /* ---------- detailed building ---------- */
  _building(ch, r, x, z, w, d, h, variant, opt = {}) {
    if (this._inClear(x, z)) return;
    const key = 'facade_' + variant;
    const mat = this._mats.facade[variant] ? key : 'facade_slate';

    // main mass
    this._box(ch, mat, x, h / 2, z, w, h, d, { tile: true });
    let top = h, curW = w, curD = d;

    // setbacks
    const steps = opt.steps ?? ((h > 40) ? 2 : (r() < 0.5 ? 1 : 0));
    for (let s = 0; s < steps; s++) {
      const sh = h * (0.22 + r() * 0.16);
      curW *= 0.72; curD *= 0.72;
      this._box(ch, mat, x, top + sh / 2, z, curW, sh, curD, { tile: true });
      top += sh;
    }

    // ground-floor band (darker shopfront)
    this._box(ch, 'dark', x, 1.6, z, w * 1.02, 3.2, d * 1.02);

    // roof parapet + details
    this._box(ch, 'dark', x, top + 0.5, z, curW * 1.03, 1.0, curD * 1.03);
    const rd = Math.min(curW, curD);
    this._box(ch, 'metal', x + rd * 0.2, top + 1.6, z - rd * 0.2, 1.6, 1.2, 1.6);
    if (r() < 0.6) this._shape(ch, 'metal', G.cyl, x - rd * 0.2, top + 1.5, z + rd * 0.2, 1.6, 2.0, 1.6);
    if (r() < 0.5) this._box(ch, 'metal', x, top + 4.0, z, 0.16, 6.0, 0.16);

    // neon signage
    if (opt.sign || (variant === 'glass' && r() < 0.8)) {
      const sc = ['#ff3d81', '#38f2c8', '#ffd23a', '#7c5cff', '#ff8a3d'][(r() * 5) | 0];
      const sw = Math.min(w, d) * (0.5 + r() * 0.4);
      const face = (r() * 4) | 0;
      const y = h * (0.45 + r() * 0.35);
      const off = 0.12;
      if (face === 0) this._box(ch, 'neon', x, y, z - d / 2 - off, sw, 1.6, 0.12, { color: sc });
      else if (face === 1) this._box(ch, 'neon', x, y, z + d / 2 + off, sw, 1.6, 0.12, { color: sc });
      else if (face === 2) this._box(ch, 'neon', x - w / 2 - off, y, z, 0.12, 1.6, sw, { color: sc });
      else this._box(ch, 'neon', x + w / 2 + off, y, z, 0.12, 1.6, sw, { color: sc });
    }

    ch.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h + 1.2 });
  },

  /* ---------- biomes ---------- */
  _roads(ch, ox, oz, width = 16) {
    this._plane(ch, 'road', ox + width / 2, 0.02, oz + CHUNK / 2, width, CHUNK, [width / 8, CHUNK / 8]);
    this._plane(ch, 'road', ox + CHUNK / 2, 0.02, oz + width / 2, CHUNK, width, [CHUNK / 8, width / 8]);
  },

  _downtown(ch, r, ox, oz) {
    this._roads(ch, ox, oz, 18);
    const names = ['glass', 'slate', 'navy', 'teal'];
    const inner = CHUNK - 18 - 6;
    const lots = 2, lot = inner / lots;
    for (let lx = 0; lx < lots; lx++) for (let lz = 0; lz < lots; lz++) {
      if (r() < 0.12) continue;
      const pad = 3 + r() * 3;
      const w = lot - pad * 2, d = lot - pad * 2;
      const h = 34 + r() * r() * 78;
      const x = ox + 18 + 3 + lot * lx + lot / 2, z = oz + 18 + 3 + lot * lz + lot / 2;
      this._building(ch, r, x, z, w, d, h, pick(r, names), { sign: r() < 0.6, steps: 2 });
      if (r() < 0.4) ch.lootSpots.push(new THREE.Vector3(x, 0, z));
      if (r() < 0.3) ch.spawns.push(new THREE.Vector3(x + (r() - .5) * w * 1.6, 0, z + (r() - .5) * d * 1.6));
    }
    this._lamp(ch, ox + 18 - 3, oz + 18 - 3);
    if (r() < 0.6) this._lamp(ch, ox + CHUNK - 4, oz + 18 - 3);
    this._car(ch, r, ox + 18 / 2, oz + 20 + r() * (CHUNK - 40), Math.PI / 2);
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'downtown', label: 'Downtown' });
  },

  _city(ch, r, ox, oz) {
    this._roads(ch, ox, oz, 16);
    const names = ['slate', 'navy', 'plum', 'teal', 'wine', 'brick'];
    const inner = CHUNK - 16 - 6;
    const lots = 3, lot = inner / lots;
    for (let lx = 0; lx < lots; lx++) for (let lz = 0; lz < lots; lz++) {
      if (r() < 0.22) continue;
      const pad = 2 + r() * 2;
      const w = lot - pad * 2, d = lot - pad * 2;
      const h = 9 + r() * r() * 34;
      const x = ox + 16 + 3 + lot * lx + lot / 2, z = oz + 16 + 3 + lot * lz + lot / 2;
      this._building(ch, r, x, z, w, d, h, pick(r, names));
      if (r() < 0.4) ch.lootSpots.push(new THREE.Vector3(x + (r() - .5) * w, 0, z + (r() - .5) * d));
      if (r() < 0.35) ch.spawns.push(new THREE.Vector3(x + (r() - .5) * w * 1.6, 0, z + (r() - .5) * d * 1.6));
    }
    this._lamp(ch, ox + 16 - 2, oz + 16 - 2);
    if (r() < 0.5) this._lamp(ch, ox + CHUNK - 4, oz + 16 - 2);
    for (let i = 0; i < 2; i++) if (r() < 0.4)
      this._car(ch, r, ox + 16 / 2 + (r() - .5) * 5, oz + 8 + r() * (CHUNK - 16), Math.PI / 2);
    for (let i = 0; i < 3; i++) if (r() < 0.3)
      this._shape(ch, 'cone', G.cone, ox + r() * CHUNK, 0.6, oz + r() * CHUNK, 1, 1.2, 1);
    if (r() < 0.7) this._dumpster(ch, ox + 20 + r() * (CHUNK - 40), oz + 20 + r() * (CHUNK - 40), r() * 3);
    if (r() < 0.45) {
      const two = r() < 0.4;
      this._enterable(ch, r, ox + 24 + r() * (CHUNK - 48), oz + 24 + r() * (CHUNK - 48),
        12 + r() * 6, 12 + r() * 6, two ? 6.8 + r() : 4.5 + r() * 1.5, 'residential', two ? 2 : 1);
    }
    if (r() < 0.5) this._stash(ch, ox + 20 + r() * (CHUNK - 40), oz + 20 + r() * (CHUNK - 40));
    if (r() < 0.6) this._vending(ch, ox + 20 + r() * (CHUNK - 40), oz + 20 + r() * (CHUNK - 40), r() * 3);
    if (r() < 0.7) this._planter(ch, ox + 20 + r() * (CHUNK - 40), oz + 20 + r() * (CHUNK - 40));
    ch.spawns.push(new THREE.Vector3(ox + 16 / 2, 0, oz + r() * CHUNK));
    ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + 16 / 2));
  },

  _residential(ch, r, ox, oz) {
    this._plane(ch, 'road', ox + 10 / 2, 0.02, oz + CHUNK / 2, 10, CHUNK, [10 / 8, CHUNK / 8]);
    this._plane(ch, 'road', ox + CHUNK / 2, 0.02, oz + 10 / 2, CHUNK, 10, [CHUNK / 8, 10 / 8]);
    const inner = CHUNK - 10 - 8;
    const lots = 3, lot = inner / lots;
    for (let lx = 0; lx < lots; lx++) for (let lz = 0; lz < lots; lz++) {
      if (r() < 0.15) { this._tree(ch, r, ox + 10 + 4 + lot * lx + lot / 2, oz + 10 + 4 + lot * lz + lot / 2, 0.9 + r() * .5); continue; }
      const w = lot * 0.62, d = lot * 0.55, h = 4 + r() * 3;
      const x = ox + 10 + 4 + lot * lx + lot / 2, z = oz + 10 + 4 + lot * lz + lot / 2;
      this._building(ch, r, x, z, w, d, h, 'brick', { steps: 0 });
      // pitched roof
      this._box(ch, 'dark', x, h + 1.0, z, w * 1.05, 0.3, d * 1.05);
      this._shape(ch, 'brick', G.cone, x, h + 2.0, z, w * 1.1, 2.2, d * 1.1, { ry: Math.PI / 4 });
      this._fence(ch, x - w / 2 - 1.5, z - d / 2 - 1.5, x + w / 2 + 1.5, z - d / 2 - 1.5, 5);
      if (r() < 0.5) this._tree(ch, r, x + w, z + d, 0.8 + r() * .5);
      if (r() < 0.3) ch.lootSpots.push(new THREE.Vector3(x + w, 0, z));
      if (r() < 0.3) ch.spawns.push(new THREE.Vector3(x + (r() - .5) * w, 0, z + (r() - .5) * d));
    }
    if (r() < 0.7) this._lamp(ch, ox + 12, oz + 12);
    if (r() < 0.5) this._planter(ch, ox + 14 + r() * (CHUNK - 28), oz + 14 + r() * (CHUNK - 28));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'residential', label: 'Residential' });
  },

  _industrial(ch, r, ox, oz) {
    this._roads(ch, ox, oz, 20);
    // warehouses
    for (let i = 0; i < 3; i++) {
      const w = 18 + r() * 12, d = 12 + r() * 10, h = 7 + r() * 5;
      const x = ox + 20 + 4 + r() * (CHUNK - 20 - w - 8), z = oz + 20 + 4 + r() * (CHUNK - 20 - d - 8);
      this._building(ch, r, x, z, w, d, h, 'industrial', { steps: 0 });
      ch.spawns.push(new THREE.Vector3(x + (r() - .5) * w, 0, z + d));
    }
    // containers
    for (let i = 0; i < 6; i++) {
      const x = ox + 20 + 6 + r() * (CHUNK - 20 - 14), z = oz + 20 + 6 + r() * (CHUNK - 20 - 14);
      this._container(ch, r, x, z, (r() < .5 ? 0 : Math.PI / 2), r() < .5);
    }
    this._fence(ch, ox + 20, oz + CHUNK - 6, ox + CHUNK - 4, oz + CHUNK - 6, 16);
    for (let i = 0; i < 3; i++) this._shape(ch, 'cone', G.cone, ox + r() * CHUNK, 0.6, oz + r() * CHUNK, 1, 1.2, 1);
    for (let i = 0; i < 3; i++) ch.lootSpots.push(new THREE.Vector3(ox + 20 + r() * (CHUNK - 24), 0, oz + 20 + r() * (CHUNK - 24)));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'industrial', label: 'Industrial' });
  },

  _jungle(ch, r, ox, oz) {
    for (let i = 0; i < 14; i++) this._tree(ch, r, ox + 4 + r() * (CHUNK - 8), oz + 4 + r() * (CHUNK - 8), 0.9 + r() * 1.1);
    for (let i = 0; i < 20; i++) this._bush(ch, r, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 6; i++) this._rock(ch, r, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 7; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 3; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
  },

  _park(ch, r, ox, oz) {
    for (let i = 0; i < 10; i++) this._tree(ch, r, ox + 6 + r() * (CHUNK - 12), oz + 6 + r() * (CHUNK - 12), 1.0 + r() * 0.8);
    if (r() < 0.7) this._fountain(ch, ox + CHUNK / 2, oz + CHUNK / 2);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = 14 + r() * 16;
      this._bench(ch, ox + CHUNK / 2 + Math.cos(a) * d, oz + CHUNK / 2 + Math.sin(a) * d, a);
    }
    for (let i = 0; i < 4; i++) this._lamp(ch, ox + 8 + r() * (CHUNK - 16), oz + 8 + r() * (CHUNK - 16));
    for (let i = 0; i < 5; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 5; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'park', label: 'Park' });
  },

  _school(ch, r, ox, oz) {
    this._building(ch, r, ox + CHUNK * 0.34, oz + CHUNK * 0.32, CHUNK * 0.5, CHUNK * 0.36, 12 + r() * 6, 'school', { steps: 0 });
    this._fence(ch, ox + 4, oz + CHUNK - 5, ox + CHUNK - 4, oz + CHUNK - 5, 18);
    this._slide(ch, ox + CHUNK * 0.62, oz + CHUNK * 0.72, 0);
    this._swing(ch, ox + CHUNK * 0.8, oz + CHUNK * 0.72, 0);
    this._sandbox(ch, ox + CHUNK * 0.45, oz + CHUNK * 0.76);
    for (let i = 0; i < 3; i++) this._bench(ch, ox + CHUNK * 0.28 + i * 4, oz + CHUNK * 0.62, 0);
    for (let i = 0; i < 5; i++) ch.spawns.push(new THREE.Vector3(ox + CHUNK * (0.3 + r() * 0.6), 0, oz + CHUNK * (0.55 + r() * 0.4)));
    for (let i = 0; i < 4; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK * 0.34, z: oz + CHUNK * 0.32, type: 'school', label: 'School' });
  },

  _playground(ch, r, ox, oz) {
    this._playFrame(ch, ox + CHUNK * 0.34, oz + CHUNK * 0.4);
    this._slide(ch, ox + CHUNK * 0.62, oz + CHUNK * 0.36, 0.5);
    this._swing(ch, ox + CHUNK * 0.5, oz + CHUNK * 0.7, 0);
    this._sandbox(ch, ox + CHUNK * 0.72, oz + CHUNK * 0.68);
    for (let i = 0; i < 6; i++) this._shape(ch, 'yellow', G.ico, ox + r() * CHUNK, 0.4, oz + r() * CHUNK, 0.6 + r() * .3, 0.6 + r() * .3, 0.6 + r() * .3);
    for (let i = 0; i < 4; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 3; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK * 0.5, z: oz + CHUNK * 0.55, type: 'playground', label: 'Playground' });
  },

  _plaza(ch, r, ox, oz) {
    this._fountain(ch, ox + CHUNK / 2, oz + CHUNK / 2);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, d = 16;
      this._bench(ch, ox + CHUNK / 2 + Math.cos(a) * d, oz + CHUNK / 2 + Math.sin(a) * d, a);
    }
    for (let i = 0; i < 4; i++) this._lamp(ch, ox + 8 + (i % 2) * (CHUNK - 16), oz + 8 + ((i / 2) | 0) * (CHUNK - 16));
    for (let i = 0; i < 4; i++) this._tree(ch, r, ox + 10 + r() * (CHUNK - 20), oz + 10 + r() * (CHUNK - 20), 0.9);
    for (let i = 0; i < 4; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 3; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'plaza', label: 'Plaza' });
  },

  _desert(ch, r, ox, oz) {
    for (let i = 0; i < 9; i++) this._cactus(ch, ox + 6 + r() * (CHUNK - 12), oz + 6 + r() * (CHUNK - 12), 1 + r() * 0.9);
    for (let i = 0; i < 7; i++) this._rock(ch, r, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 5; i++) this._shape(ch, 'sandbag', G.ico, ox + r() * CHUNK, 1.4, oz + r() * CHUNK, 4 + r() * 4, 1.6, 4 + r() * 4);
    if (r() < 0.5) this._building(ch, r, ox + CHUNK * 0.3, oz + CHUNK * 0.3, 22, 16, 7 + r() * 4, 'industrial', { steps: 0 });
    for (let i = 0; i < 2; i++) this._barrel(ch, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 5; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 4; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'desert', label: 'Wastes' });
  },

  _snow(ch, r, ox, oz) {
    for (let i = 0; i < 16; i++) this._pine(ch, ox + 4 + r() * (CHUNK - 8), oz + 4 + r() * (CHUNK - 8), 1 + r() * 1.1);
    for (let i = 0; i < 6; i++) this._rock(ch, r, ox + r() * CHUNK, oz + r() * CHUNK);
    if (r() < 0.6) this._building(ch, r, ox + CHUNK * 0.55, oz + CHUNK * 0.35, 20, 14, 6 + r() * 3, 'residential', { steps: 1 });
    for (let i = 0; i < 4; i++) this._shape(ch, 'snowbank', G.ico, ox + r() * CHUNK, 0.4, oz + r() * CHUNK, 3 + r() * 3, 1.1, 3 + r() * 3);
    for (let i = 0; i < 2; i++) this._crate(ch, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 5; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 4; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'snow', label: 'Frozen Ground' });
  },

  _swamp(ch, r, ox, oz) {
    for (let i = 0; i < 8; i++) this._deadTree(ch, ox + 5 + r() * (CHUNK - 10), oz + 5 + r() * (CHUNK - 10), 1 + r() * 0.8);
    for (let i = 0; i < 18; i++) this._reed(ch, ox + r() * CHUNK, oz + r() * CHUNK);
    for (let i = 0; i < 5; i++) this._shape(ch, 'mud', G.ico, ox + r() * CHUNK, 0.08, oz + r() * CHUNK, 5 + r() * 5, 0.16, 5 + r() * 5);
    if (r() < 0.5) this._building(ch, r, ox + CHUNK * 0.4, oz + CHUNK * 0.4, 18, 14, 6 + r() * 3, 'industrial', { steps: 0 });
    for (let i = 0; i < 6; i++) ch.spawns.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    for (let i = 0; i < 5; i++) ch.lootSpots.push(new THREE.Vector3(ox + r() * CHUNK, 0, oz + r() * CHUNK));
    ch.pois.push({ x: ox + CHUNK / 2, z: oz + CHUNK / 2, type: 'swamp', label: 'Marsh' });
  }

  /* A hollow building you can walk into: four walls with a door gap, a roof you
     can reach by the outside stair, and loot inside. */,
  _enterable(ch, r, cx, cz, w, d, h, style, floors = 1) {
    const t = 0.4, halfW = w / 2, halfD = d / 2;
    const door = 3.0, dx = -door / 2;
    // floor slab (visual only)
    this._shape(ch, 'paving', G.box, cx, 0.06, cz, w - t, 0.12, d - t);
    // walls — the -Z face gets a doorway gap
    const seg = (x, z, sx, sz) => {
      this._box(ch, style, x, h / 2, z, sx, h, sz, { collide: true });
    };
    seg(cx - halfW + t / 2, cz, t, d);                       // left
    seg(cx + halfW - t / 2, cz, t, d);                       // right
    seg(cx, cz + halfD - t / 2, w, t);                       // back
    const front = (w - door) / 2;
    seg(cx - halfW + front / 2, cz - halfD + t / 2, front, t);   // front left of the door
    seg(cx + halfW - front / 2, cz - halfD + t / 2, front, t);   // front right of the door
    // header above the doorway
    this._box(ch, style, cx + dx + door / 2, h - 0.5, cz - halfD + t / 2, door, 1.0, t);
    // roof — walkable
    this._box(ch, 'dark', cx, h + 0.15, cz, w, 0.3, d, { collide: true });
    // lit window slits (and a couple you can shoot out)
    for (const sx of [-1, 1]) {
      this._shape(ch, 'neon', G.box, cx + sx * (halfW - t / 2), h * 0.6, cz + halfD * 0.4, t * 1.1, 1.0, 2.2, { color: '#ffd98a' });
      if (r() < 0.6) this._window(ch, cx + sx * (halfW - t / 2), h * 0.6, cz - halfD * 0.35, Math.PI / 2);
    }
    if (r() < 0.5) this._window(ch, cx, h * 0.6, cz + halfD - t / 2, 0);
    // inside loot + a couple of interior props
    for (let i = 0; i < 3; i++) ch.lootSpots.push(new THREE.Vector3(cx + (r() - .5) * (w - 6), 0, cz + (r() - .5) * (d - 6)));
    if (r() < 0.7) this._crate(ch, cx + (r() - .5) * (w - 6), cz + (r() - .5) * (d - 6));
    this._stairs(ch, cx + halfW + 1.6, cz - halfD + 2, h + 0.3);

    // ---- extra floors: a mid slab with a stairwell, and an inside staircase ----
    if (floors > 1) {
      const slabY = 3.3;
      // interior span in x, with a stairwell gap near the left wall
      const x0 = cx - halfW + t, x1 = cx + halfW - t;
      const gapC = cx - halfW + 3.4, gapHalf = 1.6;
      const aEnd = gapC - gapHalf, bStart = gapC + gapHalf;
      if (aEnd > x0) this._box(ch, 'paving', (x0 + aEnd) / 2, slabY, cz, aEnd - x0, 0.25, d - t, { collide: true });
      if (x1 > bStart) this._box(ch, 'paving', (bStart + x1) / 2, slabY, cz, x1 - bStart, 0.25, d - t, { collide: true });
      // inside stair up to the slab
      const rise = 0.42, run = 0.8;
      const n = Math.ceil(slabY / rise);
      for (let i = 0; i < n; i++) {
        const hh = (i + 1) * (slabY / n);
        this._box(ch, 'paving', cx - halfW + 2.2, hh / 2, cz + halfD - 2 - i * run, 2.6, hh, run, { collide: true });
      }
      // upper-floor loot and a crate
      for (let i = 0; i < 3; i++) {
        const lx = cx + (r() - .5) * (w - 6), lz = cz + (r() - .5) * (d - 6);
        if (Math.abs(lx - gapC) < 3) continue;
        ch.lootSpots.push(new THREE.Vector3(lx, slabY + 0.2, lz));
      }
      if (r() < 0.6) this._crate(ch, cx + (r() - .5) * (w - 8), cz + (r() - .5) * (d - 8));
      if (r() < 0.35) this._stash(ch, cx + (r() - .5) * (w - 8), cz + (r() - .5) * (d - 8));
      // interior light
      this._shape(ch, 'neon', G.sphere, cx, slabY - 0.4, cz, 0.5, 0.5, 0.5, { color: '#ffd98a' });
    }

    const rect = { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD, h };
    ch.interiorRect = rect;
    this.interiors.push(rect);
    ch.pois.push({ x: cx, z: cz, type: 'loot', label: floors > 1 ? 'Building (2F)' : 'Building' });
  }
  });
}
