// ally.js — a friendly companion that follows you and shoots what you shoot.
// Deliberately simple: no pathfinding, just steering, so it stays cheap.
import * as THREE from 'three';


export class Ally {
  constructor(scene, world, player, audio, name = 'Rook') {
    this.scene = scene; this.world = world; this.player = player; this.audio = audio;
    this.name = name;
    this.maxHealth = 120; this.health = this.maxHealth;
    this.speed = 5.2;
    this.down = false; this.downT = 0;
    this.cool = 0; this.facing = 0;
    this._cols = [];

    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: '#3a4a5e', roughness: .8, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: '#c8a884', roughness: .9, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: '#1e242c', roughness: .9, flatShading: true });
    this.mats = [body, skin, dark];

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.95, 0.4), body);
    torso.position.y = 1.3; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.98; head.castShadow = true; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: '#38f2c8' }));
    visor.position.set(0, 2.0, -0.22); g.add(visor);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), dark);
      l.position.set(0.16 * sx, 0.4, 0); l.castShadow = true; g.add(l); this.legs.push(l);
    }
    this.arms = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.18), body);
      a.position.set(0.44 * sx, 1.3, 0); a.castShadow = true; g.add(a); this.arms.push(a);
    }
    // contact shadow
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
    sh.scale.set(1.3, 0.02, 1.3); sh.position.y = 0.02; g.add(sh);

    this.group = g;
    g.position.copy(player.pos);
    scene.add(g);
    this.bobT = 0;
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  revive() { this.down = false; this.downT = 0; this.health = this.maxHealth * 0.5; }

  damage(n) {
    if (this.down) return;
    this.health -= n;
    if (this.health <= 0) { this.health = 0; this.down = true; this.downT = 0; }
  }

  update(dt, enemies, ctx = {}) {
    const p = this.group.position;
    const target = this.player.pos;

    if (this.down) {
      this.downT += dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * 3);
      if (this.downT > 14) this.revive();        // picks itself back up after a while
      return;
    }
    this.group.rotation.x = 0;

    // follow at a distance, stopping when close
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 3.2) {
      const step = Math.min(this.speed, (d - 3.0) * 1.6) * dt;
      const nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step;
      if (!this._blocked(nx, p.z)) p.x = nx;
      if (!this._blocked(p.x, nz)) p.z = nz;
      this.bobT += dt;
    }

    // pick the nearest live enemy and shoot it
    let best = null, bd = 34;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dd = e.group.position.distanceTo(p);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (best) this.facing = Math.atan2(best.group.position.x - p.x, best.group.position.z - p.z);
    else if (d > 1) this.facing = Math.atan2(dx, dz);
    this.group.rotation.y = this.facing;

    this.cool -= dt;
    if (best && this.cool <= 0 && bd < 32) {
      this.cool = 0.42;
      const dmg = 16 + Math.random() * 8;
      best.damage(dmg, best.group.position.clone().setY(1.3), null);
      if (ctx.onHit) ctx.onHit(best, dmg);
      if (!best.alive && ctx.onKill) ctx.onKill(best);
      if (this.audio) this.audio.at(() => this.audio.shot('rifle'), p.x - target.x, p.z - target.z, 60);
    }

    // walk cycle
    const sw = Math.sin(this.bobT * 10) * 0.5;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.5 - (best ? 1.1 : 0);
    this.arms[1].rotation.x = sw * 0.5 - (best ? 1.1 : 0);
  }

  _blocked(x, z) {
    for (const c of this.world.collidersNear(x, z, this.radius || 0.45, this._cols)) {
      if (c.height > 1.2 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  }

  dispose() { this.scene.remove(this.group); for (const m of this.mats) m.dispose(); }
}
