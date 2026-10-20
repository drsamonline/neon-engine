// compound.js — the walled safe house.
//
// A safe zone used to be an invisible circular barrier. Enemies could not cross
// it, so they walked up to the line and stood there, which read as "the zombies
// are broken". Now the safe house sits inside a real walled compound with a
// single gate: enemies are stopped by something you can SEE, they mill around the
// walls, and you leave through the door.
//
// The walls are registered as permanent world structures, so they do not stream
// out when you walk away.
import * as THREE from 'three';

const WALL_H = 4.2;
const WALL_T = 0.9;

/* One wall run from (x1,z1) to (x2,z2), with an optional gate gap. */
function wallRun(x1, z1, x2, z2, opts) {
  const { gapAt = null, gapW = 5, mat, h = WALL_H, t = WALL_T } = opts;
  const horiz = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const meshes = [];
  const colliders = [];

  // split the run into segments, skipping the gate
  const spans = [];
  if (gapAt === null) {
    spans.push([0, len]);
  } else {
    const g0 = Math.max(0, gapAt - gapW / 2), g1 = Math.min(len, gapAt + gapW / 2);
    if (g0 > 0.01) spans.push([0, g0]);
    if (g1 < len - 0.01) spans.push([g1, len]);
  }

  for (const [a, b] of spans) {
    const segLen = b - a;
    if (segLen <= 0.01) continue;
    const geo = new THREE.BoxGeometry(horiz ? segLen : t, h, horiz ? t : segLen);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    const mid = (a + b) / 2;
    const cx = horiz ? Math.min(x1, x2) + mid : x1;
    const cz = horiz ? z1 : Math.min(z1, z2) + mid;
    m.position.set(cx, h / 2, cz);
    meshes.push(m);
    colliders.push({
      minX: cx - (horiz ? segLen : t) / 2, maxX: cx + (horiz ? segLen : t) / 2,
      minZ: cz - (horiz ? t : segLen) / 2, maxZ: cz + (horiz ? t : segLen) / 2,
      height: h,
    });
  }
  return { meshes, colliders };
}

/* Small square pillars at the gate, so the opening reads as a doorway. */
function gatePosts(x, z, horiz, mat) {
  const out = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, WALL_H + 1.2, 1.1), mat);
    p.position.set(horiz ? x + s * 3.2 : x, (WALL_H + 1.2) / 2, horiz ? z : z + s * 3.2);
    p.castShadow = true;
    out.push(p);
  }
  return out;
}

/**
 * Build a walled compound around a point.
 * @returns {{group: THREE.Group, colliders: Array, door: {x:number,z:number}}}
 */
export function buildCompound(world, cx, cz, half, opts = {}) {
  const doorSide = opts.doorSide || 'south';     // which wall has the gate
  const colour = opts.colour || '#5a6070';
  const mat = new THREE.MeshLambertMaterial({ color: colour });

  const group = new THREE.Group();
  group.name = 'safe-compound';
  const colliders = [];
  const push = (r) => { group.add(...r.meshes); colliders.push(...r.colliders); };

  const x0 = cx - half, x1 = cx + half;
  const z0 = cz - half, z1 = cz + half;
  const gateW = opts.gateWidth || 5;

  // south / north runs (horizontal), east / west runs (vertical)
  push(wallRun(x0, z0, x1, z0, { mat, gapAt: doorSide === 'south' ? half : null, gapW: gateW }));
  push(wallRun(x0, z1, x1, z1, { mat, gapAt: doorSide === 'north' ? half : null, gapW: gateW }));
  push(wallRun(x0, z0, x0, z1, { mat, gapAt: doorSide === 'west' ? half : null, gapW: gateW }));
  push(wallRun(x1, z0, x1, z1, { mat, gapAt: doorSide === 'east' ? half : null, gapW: gateW }));

  let door = { x: cx, z: z0 };
  if (doorSide === 'south') { group.add(...gatePosts(cx, z0, true, mat)); door = { x: cx, z: z0 }; }
  else if (doorSide === 'north') { group.add(...gatePosts(cx, z1, true, mat)); door = { x: cx, z: z1 }; }
  else if (doorSide === 'west') { group.add(...gatePosts(x0, cz, false, mat)); door = { x: x0, z: cz }; }
  else { group.add(...gatePosts(x1, cz, false, mat)); door = { x: x1, z: cz }; }

  // a lamp over the gate, so it is findable at night
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.28, 1.4),
    new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
  lamp.position.set(door.x, WALL_H + 1.0, door.z);
  group.add(lamp);

  if (world && world.addStatic) world.addStatic(group, colliders);
  return { group, colliders, door };
}

export const COMPOUND = { WALL_H, WALL_T };
