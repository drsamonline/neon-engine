// base.js — safe-house installations you buy and place. Kept separate from the
// safe house UI so the world side (the turret that actually shoots) has a home.
import * as THREE from 'three';

export const INSTALLS = [
  { id: 'bed', name: 'Field Bed', price: 600, note: 'heal twice as fast in a safe zone' },
  { id: 'stash', name: 'Ammo Stash', price: 800, note: '+50% reserve ammo on respawn' },
  { id: 'turret', name: 'Auto Turret', price: 1500, note: 'shoots anything hostile near the base' },
  { id: 'forge', name: 'Scrap Forge', price: 1100, note: 'passively accrues scrap over time' },
];

export class Base {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.installed = {};        // id -> true
    this.turret = null;
    this.origin = new THREE.Vector3();
    this._acc = 0;
    this.forgeT = 0;
  }

  setOrigin(v) { this.origin.copy(v); }

  has(id) { return !!this.installed[id]; }

  install(id, progression) {
    const item = INSTALLS.find((i) => i.id === id);
    if (!item || this.has(id)) return false;
    if (progression.coins < item.price) return false;
    progression.spend(item.price);
    this.installed[id] = true;
    // record it on the progression too, so any caller stays in sync
    if (progression.installs) progression.installs[id] = true;
    if (id === 'turret') this._buildTurret();
    if (this.audio) this.audio.buy();
    return true;
  }

  _buildTurret() {
    if (this.turret) return;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: '#2b3342', roughness: .7, flatShading: true }));
    base.position.y = 0.35; g.add(base);
    const head = new THREE.Group(); head.position.y = 1.0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.7),
      new THREE.MeshStandardMaterial({ color: '#39424f', roughness: .6, metalness: .5, flatShading: true }));
    head.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: '#12161f', roughness: .5, metalness: .7 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.75; head.add(barrel);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ff5a7a' }));
    eye.position.set(0, 0.18, -0.3); head.add(eye);
    g.add(head);
    g.position.copy(this.origin);
    this.scene.add(g);
    this.turret = { group: g, head, cool: 0 };
  }

  /* auto-fire at whatever is hostile and close to the base */
  update(dt, enemies, ctx = {}) {
    // the forge trickles scrap while you are out and about
    if (this.has('forge') && ctx.progression) {
      this.forgeT += dt;
      if (this.forgeT >= 12) { this.forgeT = 0; ctx.progression.addScrap(1); }
    }
    const t = this.turret;
    if (!t) return;
    let best = null, bd = 34;
    for (const e of enemies) {
      if (!e.alive || e.passive) continue;
      const d = e.group.position.distanceTo(t.group.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { t.head.rotation.y += dt * 0.4; return; }

    const want = Math.atan2(best.group.position.x - t.group.position.x,
      best.group.position.z - t.group.position.z);
    // ease the turret round rather than snapping
    let diff = want - t.head.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    t.head.rotation.y += diff * Math.min(1, dt * 6);

    t.cool -= dt;
    if (t.cool <= 0 && Math.abs(diff) < 0.35) {
      t.cool = 0.22;
      const dmg = 22;
      best.damage(dmg, best.group.position.clone().setY(1.2), null);
      if (ctx.onDamage) ctx.onDamage(best.group.position.clone().setY(1.2), dmg, 'normal');
      if (!best.alive && ctx.onKill) ctx.onKill(best);
      if (this.audio) {
        const p = t.group.position;
        this.audio.at(() => this.audio.shot('rifle'), p.x - (ctx.player ? ctx.player.pos.x : 0),
          p.z - (ctx.player ? ctx.player.pos.z : 0), 55);
      }
    }
  }
}
