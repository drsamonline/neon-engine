// vehicle.js — drivable cars. Arcade handling: throttle, steering that bites with
// speed, and a handbrake. No physics engine, just enough to feel right.
import * as THREE from 'three';

const MAX_SPEED = 26;
const REVERSE = 8;
const ACCEL = 15;
const BRAKE = 26;
const DRAG = 0.6;

export class Vehicle {
  constructor(scene, world, x, z, ry, color = '#8a3a3a') {
    this.scene = scene; this.world = world;
    this.speed = 0; this.heading = ry;
    this._cols = [];
    this.radius = 1.6;

    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.45, flatShading: true });
    const glass = new THREE.MeshStandardMaterial({ color: '#9fd8f0', metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1a1a20', roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), paint);
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 2.0), glass);
    cabin.position.set(0, 1.5, -0.15); g.add(cabin);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
      head.position.set(sx * 0.62, 0.85, sz * 2.1); g.add(head);
    }
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Mesh(wg, dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 1.0, 0.42, sz * 1.4);
      g.add(w); this.wheels.push(w);
    }
    // headlights, switched on after dark
    const beam = new THREE.SpotLight('#fff3c4', 0, 34, 0.5, 0.5, 1.4);
    beam.position.set(0, 0.9, -2.0);
    beam.target.position.set(0, 0.2, -14);
    g.add(beam); g.add(beam.target);
    this.beam = beam;

    this.group = g;
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
  }

  get seat() {
    const off = new THREE.Vector3(0, 1.35, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    return this.group.position.clone().add(off);
  }

  blocked(x, z) {
    for (const c of this.world.collidersNear(x, z, this.radius, this._cols)) {
      if (c.height < 0.6) continue;                       // kerbs are fine
      if (x > c.minX - 1.2 && x < c.maxX + 1.2 && z > c.minZ - 1.2 && z < c.maxZ + 1.2) return true;
    }
    return false;
  }

  setLights(on) { if (this.beam) this.beam.intensity = on ? 2.6 : 0; }

  update(dt, input) {
    const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const handbrake = !!input.crouch;

    if (throttle > 0) this.speed += ACCEL * dt;
    else if (throttle < 0) this.speed -= BRAKE * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), DRAG * 6 * dt + 4 * dt);

    if (handbrake) this.speed *= (1 - 2.4 * dt);
    this.speed = Math.max(-REVERSE, Math.min(MAX_SPEED, this.speed));
    if (Math.abs(this.speed) < 0.05) this.speed = 0;

    // steering only bites once you are actually moving
    const bite = Math.min(1, Math.abs(this.speed) / 7);
    this.heading += steer * 1.5 * bite * dt * Math.sign(this.speed || 1);

    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const nx = this.group.position.x + fx * this.speed * dt;
    const nz = this.group.position.z + fz * this.speed * dt;
    if (this.blocked(nx, nz)) this.speed *= -0.18;        // bounce off, don't stick
    else this.group.position.set(nx, 0, nz);
    this.group.rotation.y = this.heading;

    // wheels spin
    const spin = this.speed * dt * 2.4;
    for (const w of this.wheels) w.rotation.x += spin;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export class Vehicles {
  constructor(scene, world, player, audio) {
    this.scene = scene; this.world = world; this.player = player; this.audio = audio;
    this.list = [];
    this.current = null;
    this._spawned = new Set();
    this.lightsOn = false;
    this.colors = ['#8a3a3a', '#3a5a8a', '#4a7a4a', '#8a7a2a', '#6a3a7a', '#3a7a7a'];
  }

  /* drop a couple of drivable cars around a point, once per area */
  spawnNear(pos, n = 2) {
    const key = Math.round(pos.x / 60) + ',' + Math.round(pos.z / 60);
    if (this._spawned.has(key)) return;
    this._spawned.add(key);
    for (let i = 0; i < n; i++) {
      const p = this.world.spawnAround(pos, 9, 26);
      if (this._nearExisting(p)) continue;
      const v = new Vehicle(this.scene, this.world, p.x, p.z,
        Math.random() * Math.PI * 2, this.colors[Math.floor(Math.random() * this.colors.length)]);
      v.setLights(this.lightsOn);
      this.list.push(v);
    }
    // keep the fleet bounded
    while (this.list.length > 14) this.list.shift().dispose();
  }

  _nearExisting(p) {
    for (const v of this.list) if (v.group.position.distanceTo(p) < 8) return true;
    return false;
  }

  get driving() { return !!this.current; }

  nearest(pos, maxDist = 3.4) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      const d = v.group.position.distanceTo(pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  enter(v) {
    this.current = v;
    if (this.audio) this.audio.buy();
  }

  exit() {
    if (!this.current) return;
    const v = this.current;
    // step out beside the car
    const side = new THREE.Vector3(1.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.heading);
    const p = v.group.position.clone().add(side);
    this.player.pos.set(p.x, 0, p.z);
    this.current = null;
  }

  setLights(on) { if (this.beam) this.beam.intensity = on ? 2.6 : 0; }

  /* called by the game each frame with the current light level */
  setLights(on) {
    if (this.lightsOn === on) return;
    this.lightsOn = on;
    for (const v of this.list) v.setLights(on);
  }

  update(dt, input) {
    if (!this.current) return;
    this.current.update(dt, input);
    const seat = this.current.seat;
    this.player.pos.set(seat.x, seat.y - 1.7, seat.z);
    this.player.yaw = this.current.heading;
    this.player.vel.set(0, 0, 0);
  }

  /* the HUD prompt when you are close enough to get in */
  promptFor(pos) {
    if (this.current) return 'F  exit vehicle';
    const v = this.nearest(pos);
    return v ? 'F  drive' : null;
  }

  dispose() { for (const v of this.list) v.dispose(); this.list.length = 0; }
}
