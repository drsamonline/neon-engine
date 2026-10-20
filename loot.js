// loot.js — drops: ammo, health, armor, coins, magnets, upgrades
import * as THREE from 'three';

const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.2, 6, 14), ico: new THREE.IcosahedronGeometry(1, 0) };

const LOOT = {
  ammo:   { color: '#38f2c8', size: 0.55, label: 'AMMO' },
  health: { color: '#ff3d81', size: 0.55, label: 'HEALTH' },
  armor:  { color: '#4aa8ff', size: 0.55, label: 'ARMOR' },
  coin:   { color: '#ffd23a', size: 0.4, label: 'COIN' },
  magnet: { color: '#c05aff', size: 0.5, label: 'MAGNET' },
  upgrade:{ color: '#ffe066', size: 0.6, label: 'UPGRADE' },
};

function makeMesh(type) {
  const c = LOOT[type].color;
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .6,
    roughness: .35, metalness: .5 });
  const grp = new THREE.Group();
  if (type === 'coin') {
    const m = new THREE.Mesh(G.cyl, mat); m.rotation.x = Math.PI / 2; m.scale.set(0.35, 0.08, 0.35); grp.add(m);
  } else if (type === 'health') {
    const a = new THREE.Mesh(G.box, mat); a.scale.set(0.5, 0.16, 0.16); grp.add(a);
    const b = new THREE.Mesh(G.box, mat); b.scale.set(0.16, 0.5, 0.16); grp.add(b);
  } else if (type === 'magnet') {
    const m = new THREE.Mesh(G.torus, mat); m.scale.set(0.3, 0.3, 0.3); m.rotation.x = Math.PI / 2; grp.add(m);
    const m2 = new THREE.Mesh(G.torus, mat); m2.scale.set(0.3, 0.3, 0.3); m2.position.y = -0.3; grp.add(m2);
  } else if (type === 'upgrade') {
    const m = new THREE.Mesh(G.ico, mat); m.scale.setScalar(0.35); grp.add(m);
  } else {
    const m = new THREE.Mesh(G.box, mat); m.scale.setScalar(0.5); grp.add(m);
  }
  const ring = new THREE.Mesh(G.torus, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .5 }));
  ring.rotation.x = Math.PI / 2; ring.scale.setScalar(LOOT[type].size * 1.5); ring.position.y = -0.45;
  grp.add(ring);
  grp.traverse((o) => { o.castShadow = false; });
  return grp;
}

export class LootSystem {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio;
    this.items = [];
    this.onPickup = null;      // (type, amount, worldPos)
  }

  spawn(type, pos, amount = 1) {
    if (!LOOT[type]) return;
    const mesh = makeMesh(type);
    mesh.position.set(pos.x, Math.max(0.9, pos.y || 0.9), pos.z);
    this.scene.add(mesh);
    this.items.push({ type, amount, mesh, home: mesh.position.clone(),
      vy: 1.5 + Math.random(), life: 26, active: true });
  }

  dropFrom(enemy) {
    const p = enemy.group.position.clone();
    const t = enemy.t;
    // coins
    const n = Math.min(6, Math.max(1, Math.round(t.coins / 5)));
    for (let i = 0; i < n; i++) this.spawn('coin', p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.5, 0, (Math.random() - .5) * 1.5)));
    // ammo
    if (Math.random() < 0.50) this.spawn('ammo', p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2)));
    // health
    if (Math.random() < 0.28) this.spawn('health', p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2)));
    // armour (elites)
    if (t.elite && Math.random() < 0.55) this.spawn('armor', p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2)));
    // magnet / upgrade rare
    if (Math.random() < 0.04) this.spawn('magnet', p.clone());
    if (t.elite && Math.random() < 0.22) this.spawn('upgrade', p.clone());
  }

  update(dt, player, magnetTimer, t) {
    const magnet = magnetTimer > 0;
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y + 1;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.active) continue;
      it.life -= dt;
      // float
      it.mesh.rotation.y += dt * 1.6;
      it.mesh.position.y = it.home.y + Math.sin(t * 2 + it.home.x) * 0.16;

      const dx = px - it.mesh.position.x, dz = pz - it.mesh.position.z;
      const dy = py - it.mesh.position.y;
      const d = Math.hypot(dx, dy, dz);

      // coins always drift in a little; the magnet powerup pulls everything
      if (((magnet && d < 12) || (it.type === 'coin' && d < (this.baseMagnet || 2.6))) && d > 0.1) {
        const pull = 9 * dt;
        it.mesh.position.x += dx / d * pull; it.mesh.position.y += dy / d * pull; it.mesh.position.z += dz / d * pull;
        it.home.copy(it.mesh.position);
      }

      if (d < 1.5) {
        it.active = false; this.scene.remove(it.mesh); this.items.splice(i, 1);
        if (this.audio) { if (it.type === 'coin') this.audio.coin(); else this.audio.pickup(); }
        if (this.onPickup) this.onPickup(it.type, it.amount, it.mesh.position);
        continue;
      }
      if (it.life <= 0) { it.active = false; this.scene.remove(it.mesh); this.items.splice(i, 1); }
    }
  }


  clear() { for (const it of this.items) this.scene.remove(it.mesh); this.items.length = 0; }
}
