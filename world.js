// world.js — infinite streaming world: 9 biomes, detailed buildings, POI registry.
// Static geometry is merged per chunk into a handful of meshes for performance.
import * as THREE from 'three';
import { installProps } from './props.js';
import { installBiomes } from './biomes.js';
import { mergeGeometries } from './BufferGeometryUtils.js';
import { CHUNK, LOAD_R, TILE, WIND, G, bake, addColor } from './worldkit.js';
import { mulberry32, hashSeed } from './core.js';


/* ------------------------------------------------------------------ *
 *  Shared procedural textures (built once)
 * ------------------------------------------------------------------ */
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const finish = (c, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const facade = (base, litChance = 0.22, litColors = ['#ffd98a', '#a7e8ff', '#ff9ecb', '#c9ffd0', '#fff4c2']) => {
    const col = canvas(128, 256), emi = canvas(128, 256);
    const g = col.getContext('2d'), e = emi.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    e.fillStyle = '#000'; e.fillRect(0, 0, 128, 256);
    const gr = g.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(.5, 'rgba(255,255,255,.08)');
    gr.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 12; row++) for (let ci = 0; ci < 4; ci++) {
      const x = 14 + ci * 28, y = 10 + row * 20;
      const on = Math.random() < litChance;
      g.fillStyle = on ? 'rgba(255,255,255,.16)' : 'rgba(26,34,48,.72)';
      g.fillRect(x, y, 15, 12);
      if (on) {
        e.fillStyle = litColors[(Math.random() * litColors.length) | 0];
        e.fillRect(x, y, 15, 12);
      }
    }
    return { map: finish(col), emissive: finish(emi) };
  };

  const noise = (base, dots, rgb) => {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < dots; i++) {
      g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.1 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return finish(c);
  };

  const road = (() => {
    const c = canvas(128, 512), g = c.getContext('2d');
    g.fillStyle = '#5b626d'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 3200; i++) { g.fillStyle = 'rgba(190,195,205,.07)';
      g.fillRect(Math.random() * 128, Math.random() * 512, 2, 2); }
    g.fillStyle = '#e8c33a'; for (let y = 0; y < 512; y += 64) g.fillRect(62, y, 5, 34);
    return finish(c);
  })();

  const sidewalk = (() => {
    const c = canvas(64, 64), g = c.getContext('2d');
    g.fillStyle = '#787e88'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(24,26,30,.7)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
    return finish(c);
  })();

  const paving = (() => {
    const c = canvas(64, 64), g = c.getContext('2d');
    g.fillStyle = '#8a8274'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(34,30,24,.55)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
    return finish(c);
  })();

  TEX = {
    facade: {
      slate: facade('#6d7c9b'), navy: facade('#71809d'), plum: facade('#806d89'),
      teal: facade('#657a8e'), wine: facade('#846571'), brick: facade('#8f6354'),
      school: facade('#668d71'), glass: facade('#33425c', 0.42, ['#a7e8ff', '#dff2ff', '#8fd0ff']),
      industrial: facade('#7a8391', 0.16, ['#ffd98a', '#cfe0ff']),
    },
    road, sidewalk, paving,
    grass: noise('#3a5a2e', 4200, [60, 120, 50]),
    sand: noise('#cbb078', 3200, [200, 170, 110]),
    snow: noise('#e6edf6', 3200, [215, 226, 240]),
    mud: noise('#463c2a', 3200, [70, 62, 44]),
    dirt: noise('#5c4a34', 3000, [110, 90, 60]),
  };
  return TEX;
}

/* ------------------------------------------------------------------ *
 *  Shared geometry + merge helpers
 * ------------------------------------------------------------------ */
function sway(mat, amount) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float swayF = max(0.0, transformed.y) * ' + amount.toFixed(4) + ';\n' +
      'transformed.x += sin(uTime * 1.6 + (position.x + position.z) * 0.3) * swayF;\n' +
      'transformed.z += cos(uTime * 1.3 + (position.x - position.z) * 0.28) * swayF;\n');
  };
  mat.needsUpdate = true;
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.seed = opts.seed ?? 1337;
    this.weights = opts.weights ?? [
      ['downtown', 2], ['city', 5], ['residential', 3], ['industrial', 2],
      ['jungle', 2], ['park', 2], ['playground', 1], ['school', 1], ['plaza', 1],
    ];
    this.clearZones = opts.clearZones ?? [];
    this.chunks = new Map();
    this.chunkSize = CHUNK;
    this.buildBudgetMs = 6;      // max milliseconds per frame spent building chunks
    this.interiors = [];
    this._buildQueue = [];
    this._queueCentre = '';
    this._facadeMats = [];
    this._mats = this._materials();
  }

  _materials() {
    const t = textures();
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const facadeMat = (f) => {
      const m = std({ map: f.map, emissiveMap: f.emissive, emissive: new THREE.Color('#fff'),
        emissiveIntensity: 1.25, roughness: .86, metalness: .12 });
      this._facadeMats.push(m);
      return m;
    };
    const F = {};
    for (const [k, v] of Object.entries(t.facade)) F[k] = facadeMat(v);

    const ground = (tex, rep) => {
      const tt = tex.clone(); tt.repeat.set(rep, rep); tt.needsUpdate = true;
      return std({ map: tt, roughness: 1 });
    };
    const out = {
      facade: F,
      dark: std({ color: '#39414f', roughness: 1 }),
      metal: std({ color: '#2c333d', roughness: .55, metalness: .6 }),
      trunk: std({ color: '#4a3624', roughness: 1 }),
      leaf: sway(std({ color: '#3f7d45', roughness: 1, flatShading: true }), 0.030),
      leaf2: sway(std({ color: '#4a8f38', roughness: 1, flatShading: true }), 0.030),
      bush: sway(std({ color: '#35702f', roughness: 1, flatShading: true }), 0.016),
      rock: std({ color: '#6b6b70', roughness: 1, flatShading: true }),
      cone: std({ color: '#ff6a2b', roughness: .8 }),
      bench: std({ color: '#6a4a2c', roughness: .9 }),
      car: std({ color: '#8b95a8', roughness: .45, metalness: .5 }),
      carDark: std({ color: '#1d2530', roughness: .5, metalness: .4 }),
      water: std({ color: '#3f93b8', roughness: .15, metalness: .4, transparent: true, opacity: .85 }),
      paving: std({ map: t.paving, roughness: .95 }),
      sidewalk: std({ map: t.sidewalk, roughness: .95 }),
      road: std({ map: t.road, roughness: .96 }),
      sandbag: std({ color: '#8a7a58', roughness: 1, flatShading: true }),
      pine: sway(std({ color: '#2f5a3a', roughness: 1, flatShading: true }), 0.022),
      cactus: std({ color: '#4a7a3a', roughness: 1, flatShading: true }),
      reed: std({ color: '#6a7a3a', roughness: 1, flatShading: true }),
      deadwood: std({ color: '#5a5044', roughness: 1, flatShading: true }),
      crate: std({ color: '#7a5a32', roughness: .9, flatShading: true }),
      glass: std({ color: '#9fd8f0', roughness: .12, metalness: .1, transparent: true, opacity: .38 }),
      barrel: std({ color: '#8a3a2a', roughness: .7, metalness: .3, flatShading: true }),
      wood: std({ color: '#7a5530', roughness: .9 }),
      white: std({ color: '#d8dde6', roughness: .8 }),
      red: std({ color: '#c8442f', roughness: .8 }),
      blue: std({ color: '#3f74c8', roughness: .8 }),
      yellow: std({ color: '#e0b028', roughness: .8 }),
      green: std({ color: '#3f9e57', roughness: .8 }),
      container: std({ color: '#8a5a3a', roughness: .8, flatShading: true }),
      neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      g_road: ground(t.road, 1), g_grass: ground(t.grass, 1), g_sand: ground(t.sand, 1),
      g_paving: ground(t.paving, 1), g_dirt: ground(t.dirt, 1),
      g_snow: ground(t.snow, 1), g_mud: ground(t.mud, 1),
      facade: F,
    };
    // facade materials are addressed by flat bucket keys during merging
    for (const [k, m] of Object.entries(F)) out['facade_' + k] = m;
    return out;
  }

  setEmissive(v) {
    if (this._lastEmissive === v) return;
    this._lastEmissive = v;
    this._emissiveBase = v;
    for (const m of this._facadeMats) m.emissiveIntensity = v;
  }

  /* subtle per-building window flicker (call a couple of times a second) */
  flicker() {
    const base = this._emissiveBase || 0;
    if (base <= 0) return;
    for (const m of this._facadeMats) m.emissiveIntensity = base * (0.93 + Math.random() * 0.12);
  }

  /* wet roads: raise reflectivity while it rains */
  setWet(v) {
    if (this._wet === v) return;
    this._wet = v;
    const road = this._mats.g_road, r2 = this._mats.road;
    for (const m of [road, r2]) {
      if (!m) continue;
      m.roughness = 1 - v * 0.72;
      m.metalness = v * 0.55;
      m.needsUpdate = true;
    }
  }

  lampsNear(pos, count = 3, maxDist = 45) {
    const out = [];
    const cx = Math.floor(pos.x / CHUNK), cz = Math.floor(pos.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      for (const l of ch.lamps) {
        const d = l.distanceTo(pos);
        if (d < maxDist) out.push({ pos: l, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, count).map((o) => o.pos);
  }

  biomeFor(cx, cz) {
    const r = mulberry32(hashSeed(Math.floor(cx / 2), Math.floor(cz / 2), this.seed ^ 0x9e3779b9));
    const total = this.weights.reduce((s, w) => s + w[1], 0);
    let x = r() * total;
    for (const [name, w] of this.weights) { x -= w; if (x <= 0) return name; }
    return 'city';
  }

  _inClear(x, z) {
    for (const c of this.clearZones) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) return true;
    }
    return false;
  }

  /* ---------- streaming ---------- */
  setWindTime(t) { WIND.value = t; }

  /* are we inside a building? drives the reverb mix */
  isIndoor(pos) {
    for (let i = this.interiors.length - 1; i >= 0; i--) {
      const r = this.interiors[i];
      if (pos.x > r.minX && pos.x < r.maxX && pos.z > r.minZ && pos.z < r.maxZ && pos.y < r.h) return true;
    }
    return false;
  }

  /* Build a window of chunks now, synchronously. Used once at startup; the
     default radius is smaller than the streaming window so first load stays fast
     and the rest arrives over the next few frames. */
  warmup(playerPos, radius) {
    const R = radius === undefined ? LOAD_R : radius;
    const pcx = Math.floor(playerPos.x / CHUNK), pcz = Math.floor(playerPos.z / CHUNK);
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const key = (pcx + dx) + ',' + (pcz + dz);
        if (!this.chunks.has(key)) this._loadChunk(pcx + dx, pcz + dz);
      }
    }
  }

  /* Stream chunks with a per-frame time budget so travel never hitches. */
  update(playerPos, budgetMs) {
    const budget = budgetMs === undefined ? this.buildBudgetMs : budgetMs;
    const pcx = Math.floor(playerPos.x / CHUNK), pcz = Math.floor(playerPos.z / CHUNK);
    const need = new Set();
    for (let dx = -LOAD_R; dx <= LOAD_R; dx++)
      for (let dz = -LOAD_R; dz <= LOAD_R; dz++) need.add((pcx + dx) + ',' + (pcz + dz));
    // queue anything missing, nearest first, and build within the frame budget
    const centre = pcx + ',' + pcz;
    if (this._queueCentre !== centre || this._buildQueue.length === 0) {
      this._queueCentre = centre;
      this.interiors = [];
    this._buildQueue = [];
      for (const key of need) if (!this.chunks.has(key)) this._buildQueue.push(key);
      const dist = (k) => {
        const [ax, az] = k.split(',').map(Number);
        return Math.abs(ax - pcx) + Math.abs(az - pcz);
      };
      this._buildQueue.sort((a, b) => dist(a) - dist(b));
    }
    const t0 = performance.now();
    while (this._buildQueue.length && performance.now() - t0 < budget) {
      const key = this._buildQueue.shift();
      if (this.chunks.has(key) || !need.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      this._loadChunk(cx, cz);
    }
    for (const [key, ch] of this.chunks) {
      if (!need.has(key)) {
        this.scene.remove(ch.group); this.chunks.delete(key);
        if (ch.interiorRect) { const i = this.interiors.indexOf(ch.interiorRect); if (i >= 0) this.interiors.splice(i, 1); }
      }
    }
  }

  /* ---------- chunk construction ---------- */
  _loadChunk(cx, cz) {
    const r = mulberry32(hashSeed(cx, cz, this.seed));
    const biome = this.biomeFor(cx, cz);
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const ch = {
      cx, cz, biome, ox, oz, group: new THREE.Group(),
      colliders: [], solids: [], spawns: [], lootSpots: [], pois: [], lamps: [], breakables: [], buckets: new Map(),
    };

    // ground tile (baked UV so every chunk can share one material)
    const gkey = (biome === 'jungle' || biome === 'park') ? 'g_grass'
      : (biome === 'playground' || biome === 'desert') ? 'g_sand'
      : biome === 'industrial' ? 'g_dirt'
      : biome === 'snow' ? 'g_snow'
      : biome === 'swamp' ? 'g_mud'
      : biome === 'plaza' ? 'g_paving' : 'g_road';
    this._push(ch, gkey, bake(G.plane, ox + CHUNK / 2, 0, oz + CHUNK / 2, CHUNK, CHUNK, 1, -Math.PI / 2, 0, 0, [CHUNK / 8, CHUNK / 8]));

    const fn = this['_' + biome] || this._city;
    fn.call(this, ch, r, ox, oz);

    // merge buckets into one mesh per material
    for (const [key, list] of ch.buckets) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this._mats[key]);
      mesh.castShadow = key !== 'neon';
      mesh.receiveShadow = key !== 'neon';
      ch.group.add(mesh); ch.solids.push(mesh);
      if (list.length > 1) for (const g of list) g.dispose();
    }
    ch.buckets = null;
    this.scene.add(ch.group);
    this.chunks.set(cx + ',' + cz, ch);
    return ch;
  }

  _push(ch, key, geo) {
    if (!ch.buckets.has(key)) ch.buckets.set(key, []);
    ch.buckets.get(key).push(geo);
  }

  /* ---------- primitive builders ---------- */
  _box(ch, key, x, y, z, w, h, d, opt = {}) {
    if (this._inClear(x, z) && !opt.force) return;
    const uv = opt.tile ? [Math.max(1, Math.round(w / TILE)), Math.max(1, Math.round(h / TILE))] : null;
    let g = bake(G.box, x, y, z, w, h, d, opt.rx || 0, opt.ry || 0, opt.rz || 0, uv);
    if (opt.color) g = addColor(g, opt.color);
    this._push(ch, key, g);
    if (opt.collide) ch.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: y + h / 2 });
  }
  _shape(ch, key, base, x, y, z, sx, sy, sz, opt = {}) {
    if (this._inClear(x, z) && !opt.force) return;
    let g = bake(base, x, y, z, sx, sy, sz, opt.rx || 0, opt.ry || 0, opt.rz || 0, null);
    if (opt.color) g = addColor(g, opt.color);
    this._push(ch, key, g);
    if (opt.collide) ch.colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, height: y + sy / 2 });
  }
  _plane(ch, key, x, y, z, w, d, uvScale, opt = {}) {
    if (this._inClear(x, z) && !opt.force) return;
    this._push(ch, key, bake(G.plane, x, y, z, w, d, 1, -Math.PI / 2, opt.ry || 0, 0, uvScale));
  }

  /* ---------- queries ---------- */
  collidersNear(x, z, radius, out) {
    out = out || []; out.length = 0;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      for (const c of ch.colliders) {
        if (c.maxX < x - radius || c.minX > x + radius || c.maxZ < z - radius || c.minZ > z + radius) continue;
        out.push(c);
      }
    }
    return out;
  }

  solidsNear(x, z, radius, out) {
    out = out || []; out.length = 0;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const R = Math.ceil(radius / CHUNK) + 1;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const ch = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (ch) for (const s of ch.solids) out.push(s);
    }
    return out;
  }

  spawnAround(pos, minR, maxR, rng = Math.random) {
    const a = rng() * Math.PI * 2, d = minR + rng() * (maxR - minR);
    let x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
    for (const c of this.collidersNear(x, z, 1.2)) {
      if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) {
        x = pos.x - Math.cos(a) * d * 0.6; z = pos.z - Math.sin(a) * d * 0.6; break;
      }
    }
    return new THREE.Vector3(x, 0, z);
  }

  poisNear(pos, radius) {
    const out = [];
    const cx = Math.floor(pos.x / CHUNK), cz = Math.floor(pos.z / CHUNK);
    for (let dx = -LOAD_R; dx <= LOAD_R; dx++) for (let dz = -LOAD_R; dz <= LOAD_R; dz++) {
      const ch = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      for (const p of ch.pois) if (Math.hypot(p.x - pos.x, p.z - pos.z) < radius) out.push(p);
    }
    return out;
  }

}

// generators live in their own modules; attach them to the class here
installProps(World);
installBiomes(World);
