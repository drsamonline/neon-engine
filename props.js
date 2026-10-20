// props.js — street furniture, foliage and destructibles.
// Installed onto World.prototype so `this` still refers to the chunk builder.
import * as THREE from 'three';
import { G, bake, addColor } from './worldkit.js';

export function installProps(World) {
  Object.assign(World.prototype, {
  /* ---------- shared props ---------- */
  _lamp(ch, x, z) {
    this._shape(ch, 'metal', G.cyl, x, 3.4, z, 0.3, 6.8, 0.3);
    this._shape(ch, 'neon', G.sphere, x, 7.0, z, 0.9, 0.9, 0.9, { color: '#ffd98a' });
    ch.lamps.push(new THREE.Vector3(x, 7.0, z));
    ch.colliders.push({ minX: x - .3, maxX: x + .3, minZ: z - .3, maxZ: z + .3, height: 7 });
  },
  _tree(ch, r, x, z, s = 1) {
    this._shape(ch, 'trunk', G.cyl, x, 1.5 * s, z, 0.6 * s, 3.0 * s, 0.6 * s);
    this._shape(ch, r() < .5 ? 'leaf' : 'leaf2', G.ico, x, 3.8 * s, z, 3.9 * s, 3.4 * s, 3.9 * s, { ry: r() * 3 });
    ch.colliders.push({ minX: x - .5, maxX: x + .5, minZ: z - .5, maxZ: z + .5, height: 3 * s });
  },
  _bush(ch, r, x, z) { this._shape(ch, 'bush', G.ico, x, 0.55, z, 1.5, 1.1, 1.5, { ry: r() * 3 }); },
  _rock(ch, r, x, z) {
    this._shape(ch, 'rock', G.ico, x, 0.4, z, 1.4 + r(), 0.9 + r() * .7, 1.4 + r(), { ry: r() * 3 });
    ch.colliders.push({ minX: x - .8, maxX: x + .8, minZ: z - .8, maxZ: z + .8, height: 1.2 });
  },
  _bench(ch, x, z, ry) {
    this._box(ch, 'bench', x, 0.5, z, 1.9, 0.14, 0.5, { ry, collide: true });
  },
  _car(ch, r, x, z, ry) {
    this._box(ch, 'car', x, 0.6, z, 3.7, 0.85, 1.75, { ry, collide: true });
    this._box(ch, 'carDark', x, 1.32, z, 1.9, 0.7, 1.55, { ry });
  },
  _fountain(ch, x, z) {
    this._shape(ch, 'paving', G.cyl, x, 0.3, z, 5.0, 0.5, 5.0);
    this._shape(ch, 'water', G.cyl, x, 0.6, z, 4.4, 0.35, 4.4);
    this._shape(ch, 'paving', G.cyl, x, 1.2, z, 0.7, 1.6, 0.7);
    ch.colliders.push({ minX: x - 2.5, maxX: x + 2.5, minZ: z - 2.5, maxZ: z + 2.5, height: 1.1 });
  },
  _slide(ch, x, z, ry) {
    this._box(ch, 'yellow', x, 1.1, z, 1.3, 0.16, 4.4, { rx: -0.42, ry });
    this._box(ch, 'metal', x + Math.cos(ry) * 1.7, 1.0, z + Math.sin(ry) * 1.7, 0.16, 2.0, 0.16);
    ch.colliders.push({ minX: x - 2.2, maxX: x + 2.2, minZ: z - 2.2, maxZ: z + 2.2, height: 2 });
  },
  _swing(ch, x, z, ry) {
    this._box(ch, 'metal', x, 2.6, z, 0.14, 0.14, 3.6, { ry });
    this._box(ch, 'metal', x + Math.cos(ry) * 1.8, 1.3, z + Math.sin(ry) * 1.8, 0.14, 2.6, 0.14);
    this._box(ch, 'metal', x - Math.cos(ry) * 1.8, 1.3, z - Math.sin(ry) * 1.8, 0.14, 2.6, 0.14);
    this._box(ch, 'blue', x + Math.sin(ry) * .8, 0.5, z + Math.cos(ry) * .8, 0.6, 0.08, 0.32);
    this._box(ch, 'blue', x - Math.sin(ry) * .8, 0.5, z - Math.cos(ry) * .8, 0.6, 0.08, 0.32);
    ch.colliders.push({ minX: x - 2, maxX: x + 2, minZ: z - 2, maxZ: z + 2, height: 2.6 });
  },
  _sandbox(ch, x, z) {
    this._box(ch, 'sandbag', x, 0.25, z, 5.2, 0.5, 5.2);
    this._box(ch, 'bench', x, 0.35, z, 5.6, 0.28, 5.6);
    ch.colliders.push({ minX: x - 2.8, maxX: x + 2.8, minZ: z - 2.8, maxZ: z + 2.8, height: 0.6 });
  },
  _playFrame(ch, x, z) {
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]])
      this._box(ch, 'red', x + dx, 1.4, z + dz, 0.2, 2.8, 0.2);
    this._box(ch, 'red', x, 2.7, z - 2, 4.4, 0.18, 0.18);
    this._box(ch, 'red', x, 2.7, z + 2, 4.4, 0.18, 0.18);
    this._box(ch, 'metal', x, 2.4, z, 4.4, 0.1, 0.1);
    ch.colliders.push({ minX: x - 2.4, maxX: x + 2.4, minZ: z - 2.4, maxZ: z + 2.4, height: 2.8 });
  },
  _dumpster(ch, x, z, ry) {
    this._box(ch, 'green', x, 0.7, z, 2.0, 1.2, 1.1, { ry, collide: true });
    this._box(ch, 'metal', x, 1.36, z, 2.1, 0.12, 1.2, { ry });
  },
  _planter(ch, x, z) {
    this._shape(ch, 'paving', G.cyl, x, 0.35, z, 1.5, 0.7, 1.5);
    this._shape(ch, 'bush', G.ico, x, 1.0, z, 1.6, 1.2, 1.6);
    ch.colliders.push({ minX: x - .8, maxX: x + .8, minZ: z - .8, maxZ: z + .8, height: 1 });
  },
  _vending(ch, x, z, ry) {
    this._box(ch, 'red', x, 1.0, z, 1.0, 2.0, 0.7, { ry, collide: true });
    this._box(ch, 'neon', x, 1.6, z - 0.38, 0.8, 0.9, 0.06, { ry, color: '#8fe0ff' });
  },
  _fence(ch, x0, z0, x1, z1, n) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this._box(ch, 'metal', x0 + (x1 - x0) * t, 0.75, z0 + (z1 - z0) * t, 0.12, 1.5, 0.12);
    }
  },
  _container(ch, r, x, z, ry, stacked) {
    const cols = ['#8a5a3a', '#3a6a8a', '#6a8a3a', '#8a3a4a'];
    const c = cols[(r() * cols.length) | 0];
    const h = 2.6;
    for (let i = 0; i < (stacked ? 2 : 1); i++) {
      let g = bake(G.box, x, 1.3 + i * h, z, 6.1, h, 2.44, 0, ry, 0, null);
      g = addColor(g, c);
      this._push(ch, 'neon', g);
    }
    ch.colliders.push({ minX: x - 3.2, maxX: x + 3.2, minZ: z - 1.6, maxZ: z + 1.6, height: stacked ? 5.4 : 2.6 });
  },

  /* stepped colliders the player can walk up (each rise is inside the step-up limit) */
  _stairs(ch, x, z, topH) {
    const rise = 0.42, run = 0.85;
    const n = Math.max(1, Math.ceil(topH / rise));
    for (let i = 0; i < n; i++) {
      const hh = (i + 1) * (topH / n);
      this._box(ch, 'paving', x, hh / 2, z - i * run, 1.6, hh, run, { collide: true });
    }
  },

  /* a hidden cache worth cracking open */
  _stash(ch, x, z) {
    const m = new THREE.Mesh(G.box, this._mats.metal);
    m.scale.set(1.3, 0.8, 0.9); m.position.set(x, 0.4, z);
    m.rotation.y = Math.random() * Math.PI;
    m.castShadow = true;
    const col = { minX: x - .7, maxX: x + .7, minZ: z - .5, maxZ: z + .5, height: 0.8 };
    m.userData.breakable = { hp: 24, kind: 'stash', chunk: ch, collider: col };
    ch.group.add(m); ch.solids.push(m); ch.breakables.push(m); ch.colliders.push(col);
    ch.pois.push({ x, z, type: 'stash', label: 'Cache' });
  },

  /* breakable glass — shoot it out */
  _window(ch, x, y, z, ry) {
    const m = new THREE.Mesh(G.box, this._mats.glass);
    m.scale.set(2.2, 1.4, 0.12); m.position.set(x, y, z); m.rotation.y = ry || 0;
    m.userData.breakable = { hp: 8, kind: 'glass' };
    ch.group.add(m); ch.solids.push(m); ch.breakables.push(m);
  },

  _pine(ch, x, z, s) {
    this._shape(ch, 'trunk', G.cyl, x, 1.1 * s, z, 0.42 * s, 2.2 * s, 0.42 * s);
    for (let i = 0; i < 3; i++) {
      const y = (1.6 + i * 1.3) * s, rr = (1.9 - i * 0.45) * s;
      this._shape(ch, 'pine', G.cone, x, y, z, rr, 1.8 * s, rr);
    }
    ch.colliders.push({ minX: x - .5, maxX: x + .5, minZ: z - .5, maxZ: z + .5, height: 2.5 * s });
  },
  _cactus(ch, x, z, s) {
    this._shape(ch, 'cactus', G.cyl, x, 1.5 * s, z, 0.55 * s, 3 * s, 0.55 * s);
    for (const sx of [-1, 1]) this._shape(ch, 'cactus', G.cyl, x + 0.7 * s * sx, 2.1 * s, z, 0.36 * s, 1.1 * s, 0.36 * s);
    ch.colliders.push({ minX: x - .6, maxX: x + .6, minZ: z - .6, maxZ: z + .6, height: 3 * s });
  },
  _deadTree(ch, x, z, s) {
    this._shape(ch, 'deadwood', G.cyl, x, 1.6 * s, z, 0.36 * s, 3.2 * s, 0.36 * s);
    for (const a of [0.6, 2.3, 4.1]) {
      const br = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this._shape(ch, 'deadwood', G.cyl, x + br.x * 0.7 * s, 2.7 * s, z + br.z * 0.7 * s, 0.18 * s, 1.6 * s, 0.18 * s);
    }
    ch.colliders.push({ minX: x - .5, maxX: x + .5, minZ: z - .5, maxZ: z + .5, height: 3 * s });
  },
  _reed(ch, x, z) {
    for (let i = 0; i < 3; i++)
      this._shape(ch, 'reed', G.cyl, x + (Math.random() - .5) * .8, 0.7, z + (Math.random() - .5) * .8, 0.09, 1.4, 0.09);
  },

  /* destructibles: real meshes (not merged) so they can be shot apart */
  _crate(ch, x, z) {
    const m = new THREE.Mesh(G.box, this._mats.crate);
    m.scale.set(1.1, 1.1, 1.1); m.position.set(x, 0.55, z);
    m.rotation.y = Math.random() * Math.PI;
    const col = { minX: x - .6, maxX: x + .6, minZ: z - .6, maxZ: z + .6, height: 1.1 };
    m.castShadow = true;
    m.userData.breakable = { hp: 45, kind: 'crate', loot: 'ammo', chunk: ch, collider: col };
    ch.group.add(m); ch.solids.push(m); ch.breakables.push(m); ch.colliders.push(col);
  },
  _barrel(ch, x, z) {
    const m = new THREE.Mesh(G.cyl, this._mats.barrel);
    m.scale.set(0.8, 1.3, 0.8); m.position.set(x, 0.65, z);
    const col = { minX: x - .5, maxX: x + .5, minZ: z - .5, maxZ: z + .5, height: 1.3 };
    m.castShadow = true;
    m.userData.breakable = { hp: 30, kind: 'barrel', loot: 'explode', chunk: ch, collider: col };
    ch.group.add(m); ch.solids.push(m); ch.breakables.push(m); ch.colliders.push(col);
  }
  });
}
