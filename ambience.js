// ambience.js — distant skyline, moving traffic, puddles
import * as THREE from 'three';
import { mergeGeometries } from './BufferGeometryUtils.js';

const CHUNK = 96;
const roadCoord = (v) => Math.round((v - 9) / CHUNK) * CHUNK + 9;

/* ---------------- distant skyline silhouette ---------------- */
export class Skyline {
  constructor(scene) {
    const geos = [];
    const N = 78, R = 430;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 34 + Math.random() * 64;
      const h = 16 + Math.random() * 84;
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2 - 2, 0);
      const m = new THREE.Matrix4().makeRotationY(-(a + Math.PI / 2));
      m.setPosition(Math.cos(a) * R, 0, Math.sin(a) * R);
      g.applyMatrix4(m);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    this.mat = new THREE.MeshBasicMaterial({ color: '#2c3a55', fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(merged, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5;
    scene.add(this.mesh);
  }

  update(cameraPos, horizonColor) {
    this.mesh.position.set(cameraPos.x, 0, cameraPos.z);
    this.mat.color.copy(horizonColor).multiplyScalar(0.72);
  }
}

/* ---------------- traffic ---------------- */
export class Traffic {
  constructor(scene, count = 5) {
    this.cars = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#8b95a8', roughness: .45, metalness: .5 });
    const cabMat = new THREE.MeshStandardMaterial({ color: '#1d2530', roughness: .5, metalness: .4 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.85, 3.7), bodyMat);
      body.position.y = 0.6; body.castShadow = true; g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 1.9), cabMat);
      cab.position.y = 1.32; cab.castShadow = true; g.add(cab);
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.1),
        new THREE.MeshBasicMaterial({ color: '#ffe9a8' }));
      light.position.set(0, 0.6, -1.9); g.add(light);
      g.visible = false;
      scene.add(g);
      this.cars.push({ group: g, axis: 'z', coord: 0, along: 0, speed: 11, active: false });
    }
  }

  _respawn(car, p) {
    car.axis = Math.random() < 0.5 ? 'z' : 'x';
    car.speed = 9 + Math.random() * 8;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lateral = p.x + (Math.random() - 0.5) * 20;
    const other = p.z + (Math.random() - 0.5) * 20;
    if (car.axis === 'z') {
      car.coord = roadCoord(lateral);
      car.along = p.z - dir * (70 + Math.random() * 40);
      car.group.rotation.y = 0;
    } else {
      car.coord = roadCoord(other);
      car.along = p.x - dir * (70 + Math.random() * 40);
      car.group.rotation.y = Math.PI / 2;
    }
    car.dir = dir;
    car.active = true;
    car.group.visible = true;
  }

  update(dt, playerPos) {
    for (const car of this.cars) {
      if (!car.active) { if (Math.random() < 0.02) this._respawn(car, playerPos); continue; }
      car.along += car.speed * car.dir * dt;
      let x, z;
      if (car.axis === 'z') { x = car.coord; z = car.along; }
      else { x = car.along; z = car.coord; }
      car.group.position.set(x, 0, z);
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 140) this._respawn(car, playerPos);
    }
  }
}

/* ---------------- puddles (visible when it rains) ---------------- */
export class Puddles {
  constructor(scene, count = 12) {
    this.items = [];
    const mat = new THREE.MeshStandardMaterial({
      color: '#8fa8c8', roughness: 0.06, metalness: 0.9,
      transparent: true, opacity: 0.5, depthWrite: false,
    });
    const geo = new THREE.CircleGeometry(1, 14);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.035;
      m.visible = false;
      scene.add(m);
      this.items.push(m);
    }
    this.mat = mat;
    this.t = 0;
  }

  update(dt, playerPos, wet) {
    this.mat.opacity = 0.5 * wet;
    this.t -= dt;
    const rehome = this.t <= 0;
    if (rehome) this.t = 2.5;
    for (const m of this.items) {
      if (wet < 0.05) { m.visible = false; continue; }
      m.visible = true;
      if (rehome) {
        m.position.set(playerPos.x + (Math.random() - 0.5) * 70, 0.035, playerPos.z + (Math.random() - 0.5) * 70);
        m.scale.setScalar(1.4 + Math.random() * 2.6);
      }
    }
  }
}

/* expanding rings where rain hits standing water */
export class Ripples {
  constructor(scene, max = 40) {
    this.scene = scene; this.max = max; this.items = [];
    const geo = new THREE.RingGeometry(0.35, 0.5, 14);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.5, depthWrite: false });
  }
  spawn(x, z) {
    if (this.items.length >= this.max) return;
    const m = new THREE.Mesh(this.geo, this.mat.clone());
    m.position.set(x, 0.04, z);
    m.scale.setScalar(0.4);
    this.scene.add(m);
    this.items.push({ m, t: 0, life: 0.7 });
  }
  update(dt, rain, player) {
    if (rain > 0.15 && Math.random() < dt * 26 * rain) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 22;
      this.spawn(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const f = it.t / it.life;
      it.m.scale.setScalar(0.4 + f * 2.4);
      it.m.material.opacity = Math.max(0, 0.5 * (1 - f));
      if (it.t >= it.life) { this.scene.remove(it.m); it.m.material.dispose(); this.items.splice(i, 1); }
    }
  }
  dispose() {
    for (const it of this.items) { this.scene.remove(it.m); it.m.material.dispose(); }
    this.items.length = 0; this.geo.dispose(); this.mat.dispose();
  }
}

/* snow that settles: a slow white build-up on the ground in snowy biomes */
export class SnowCover {
  constructor(scene) {
    this.scene = scene;
    this.patches = [];
    this.t = 0;
    this.amount = 0;
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
  }
  update(dt, snowy, player) {
    this.amount = Math.max(0, Math.min(1, this.amount + (snowy ? dt * 0.03 : -dt * 0.08)));
    this.t += dt;
    if (this.amount > 0.05 && this.t > 0.12 && this.patches.length < 60) {
      this.t = 0;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 18;
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: '#eef6ff', transparent: true, opacity: 0.32 * this.amount, depthWrite: false }));
      m.position.set(player.pos.x + Math.cos(a) * r, 0.035, player.pos.z + Math.sin(a) * r);
      m.scale.setScalar(1.6 + Math.random() * 2.4);
      m.rotation.y = Math.random() * Math.PI;
      this.scene.add(m);
      this.patches.push({ m, life: 26 });
    }
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const pt = this.patches[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.scene.remove(pt.m); pt.m.material.dispose(); this.patches.splice(i, 1); }
    }
  }
  dispose() {
    for (const pt of this.patches) { this.scene.remove(pt.m); pt.m.material.dispose(); }
    this.patches.length = 0; this.geo.dispose();
  }
}
