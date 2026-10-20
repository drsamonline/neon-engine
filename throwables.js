// throwables.js — grenades and molotovs: real arcs, bounces, fuses and fire pools.
import * as THREE from 'three';
import { clamp } from './core.js';

export const THROWABLES = {
  grenade: {
    id: 'grenade', name: 'Frag Grenade', radius: 8, damage: 150, fuse: 2.2,
    price: 60, max: 8, bounce: 0.42, color: '#4c5a3c', kind: 'blast',
  },
  molotov: {
    id: 'molotov', name: 'Molotov', radius: 4.5, damage: 40, fuse: 0,
    price: 45, max: 8, bounce: 0.18, color: '#7a4a2a', kind: 'fire',
    fire: { dps: 28, duration: 6.5, radius: 4.6 },
  },
};

const G = new THREE.SphereGeometry(0.16, 8, 6);

export class Throwables {
  constructor(scene, world, player, audio, particles) {
    this.scene = scene; this.world = world; this.player = player;
    this.audio = audio; this.particles = particles;
    this.counts = { grenade: 2, molotov: 1 };
    this.selected = 'grenade';
    this.live = [];        // in-flight projectiles
    this.pools = [];       // burning / corrosive ground
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.onBlast = null;
    this.cool = 0;
  }

  add(kind, n = 1) {
    const t = THROWABLES[kind]; if (!t) return false;
    this.counts[kind] = Math.min(t.max, (this.counts[kind] || 0) + n);
    return true;
  }

  count(kind = this.selected) { return this.counts[kind] || 0; }

  cycle() {
    const keys = Object.keys(THROWABLES);
    const i = (keys.indexOf(this.selected) + 1) % keys.length;
    this.selected = keys[i];
    return this.selected;
  }

  /* throw one in the camera's direction */
  throwFromCamera() {
    if (this.cool > 0) return false;
    const kind = this.selected;
    if (this.count(kind) <= 0) return false;
    this.counts[kind]--;

    const t = THROWABLES[kind];
    const origin = new THREE.Vector3(); this.player.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(); this.player.camera.getWorldDirection(dir);

    const mesh = new THREE.Mesh(G, new THREE.MeshStandardMaterial({
      color: t.color, roughness: .7, metalness: .3, emissive: t.color, emissiveIntensity: .25,
    }));
    mesh.position.copy(origin).addScaledVector(dir, 0.6);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.live.push({
      kind, mesh, t: 0,
      vel: dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: t.fuse,
    });
    this.cool = 0.5;
    if (this.audio) this.audio.ui('click');
    return true;
  }

  /* returns damage dealt to enemies this frame (for kill credit) */
  /* one entry point for any lingering ground hazard */
  spawnPool(pos, kind = 'fire', opts = {}) {
    const base = kind === 'acid'
      ? { dps: 17, duration: 8, radius: 3.9, color: '#7ac83a', effect: 'bleed' }
      : { dps: 28, duration: 6.5, radius: 4.6, color: '#ff7a2a', effect: 'burn' };
    const o = Object.assign({}, base, opts);
    const mesh = new THREE.Mesh(this.poolGeo,
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.42, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(o.radius, o.radius, 1);
    mesh.position.set(pos.x, 0.06, pos.z);
    this.scene.add(mesh);
    this.pools.push({ mesh, x: pos.x, z: pos.z, radius: o.radius, t: o.duration, dps: o.dps, effect: o.effect, kind });
    return mesh;
  }

  update(dt, enemies, ctx = {}) {
    this.cool = Math.max(0, this.cool - dt);

    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const t = THROWABLES[p.kind];
      p.t += dt;
      p.vel.y -= 22 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 4;

      // ground bounce
      if (p.mesh.position.y < 0.16) {
        p.mesh.position.y = 0.16;
        if (Math.abs(p.vel.y) > 1.2) {
          p.vel.y = -p.vel.y * t.bounce;
          p.vel.x *= 0.72; p.vel.z *= 0.72;
          if (this.audio) this.audio.impact('metal');
        } else { p.vel.y = 0; p.vel.x *= 0.86; p.vel.z *= 0.86; }
      }
      // world bounce
      const pos = p.mesh.position;
      for (const c of this.world.collidersNear(pos.x, pos.z, 0.3)) {
        if (pos.x > c.minX && pos.x < c.maxX && pos.z > c.minZ && pos.z < c.maxZ && pos.y < c.height) {
          const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
          if (Math.abs(pos.x - cx) > Math.abs(pos.z - cz)) { p.vel.x = -p.vel.x * t.bounce; pos.x += Math.sign(pos.x - cx) * 0.1; }
          else { p.vel.z = -p.vel.z * t.bounce; pos.z += Math.sign(pos.z - cz) * 0.1; }
          if (this.audio) this.audio.impact('concrete');
        }
      }

      if (t.fuse > 0 && p.t >= t.fuse) { this._blast(p, t, enemies, ctx); this._remove(i); }
      else if (t.kind === 'fire' && p.t > 0.05 && (p.mesh.position.y <= 0.17 || p.t > 3)) {
        this._ignite(p.mesh.position.clone(), t);
        this._remove(i);
      }
    }

    // burning ground
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i];
      pool.t -= dt;
      if (pool.mesh) {
        pool.mesh.material.opacity = 0.20 + 0.12 * Math.sin(performance.now() / 90);
        pool.mesh.scale.setScalar(pool.radius * (0.94 + Math.random() * 0.1));
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.group.position.x - pool.x, e.group.position.z - pool.z);
        if (d < pool.radius) {
          e.damage(pool.dps * dt, e.group.position.clone(), null);
          e.applyEffect(pool.effect || 'burn', 1.6);
          if (!e.alive && ctx.onKill) ctx.onKill(e);
        }
      }
      // hazards hurt the player too
      if (this.player && this.player.alive) {
        const pd = Math.hypot(this.player.pos.x - pool.x, this.player.pos.z - pool.z);
        if (pd < pool.radius && this.player.pos.y < 1.6) this.player.damage(pool.dps * 0.55 * dt);
      }
      if (this.particles && Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * pool.radius;
        this.particles.impact(new THREE.Vector3(pool.x + Math.cos(a) * r, 0.4, pool.z + Math.sin(a) * r), 1, [1, 0.45, 0.12]);
      }
      if (pool.t <= 0) {
        if (pool.mesh) { this.scene.remove(pool.mesh); pool.mesh.geometry.dispose(); pool.mesh.material.dispose(); }
        this.pools.splice(i, 1);
      }
    }
  }

  _blast(p, t, enemies, ctx) {
    const pos = p.mesh.position.clone();
    if (this.particles) this.particles.explosion(pos, 60);
    if (this.audio) this.audio.explosion();
    if (this.player) this.player.addShake(1.1);
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = pos.distanceTo(e.group.position);
      if (d < t.radius) {
        const fall = clamp(1 - d / t.radius, 0.25, 1);
        const dir = e.group.position.clone().sub(pos).normalize();
        e.damage(t.damage * fall, pos, dir);
        e.stagger(0.3);
        if (!e.alive && ctx.onKill) ctx.onKill(e);
      }
    }
    if (this.player) {
      const d = pos.distanceTo(this.player.pos);
      if (d < t.radius * 0.8) this.player.damage(t.damage * 0.12 * (1 - d / (t.radius * 0.8)));
    }
    if (this.onBlast) this.onBlast(pos);
  }

  _ignite(pos, t) {
    const f = t.fire;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.26, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    mesh.scale.setScalar(f.radius);
    this.scene.add(mesh);
    this.pools.push({ x: pos.x, z: pos.z, radius: f.radius, dps: f.dps, t: f.duration, mesh });
    if (this.particles) this.particles.explosion(pos, 22);
    if (this.audio) this.audio.explosion();
  }

  _remove(i) {
    const p = this.live[i];
    this.scene.remove(p.mesh);
    p.mesh.material.dispose();
    this.live.splice(i, 1);
  }

  clear() {
    for (const p of this.live) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    for (const pool of this.pools) { if (pool.mesh) this.scene.remove(pool.mesh); }
    this.live.length = 0; this.pools.length = 0;
  }
}
