// worldkit.js — constants and shared geometry used by the world, its biome
// generators and its prop builders. Kept separate so those three modules can
// share them without a circular import.
import * as THREE from 'three';

export const CHUNK = 96;      // world units per chunk
export const LOAD_R = 2;      // chunks loaded around the player (5 x 5)
export const TILE = 7;        // window tiling density
export const WIND = { value: 0 };

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 8, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};

// scratch objects + geometry helpers shared by the chunk builders
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export function bake(base, x, y, z, sx, sy, sz, rx, ry, rz, uvScale) {
  const g = base.clone();
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m4);
  if (uvScale) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    uv.needsUpdate = true;
  }
  if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; }
  return g;
}

export function addColor(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/* ------------------------------------------------------------------ *
 *  World
 * ------------------------------------------------------------------ */
