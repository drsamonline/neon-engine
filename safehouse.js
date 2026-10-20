// safehouse.js — a fortified safe zone where skill points are spent (and gear bought)
import * as THREE from 'three';
import { WEAPONS, RARITY, WEAPON_TRACKS, weaponStats, statDelta } from './weapons.js';
import { ARMOUR, ARMOUR_TRACK, PERKS } from './leveling.js';
import { INSTALLS } from './base.js';

export class SafeHouse {
  constructor(scene, audio, opts = {}) {
    this.scene = scene;
    this.audio = audio;
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.radius = opts.radius ?? 11;
    this.armory = opts.armory ?? false;      // police station sells weapons too
    this.title = opts.title ?? 'SAFE HOUSE';
    this.onBuy = null;                        // (item) -> bool
    this.zone = { x: this.pos.x, z: this.pos.z, r: this.radius };
    this.open = false;
    this._build();
    this._buildUI();
  }

  _build() {
    const g = new THREE.Group();
    g.position.copy(this.pos);

    const paving = new THREE.MeshStandardMaterial({ color: '#6a6357', roughness: .95 });
    const sand = new THREE.MeshStandardMaterial({ color: '#8a7a58', roughness: 1, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: .6, metalness: .5 });
    const wood = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: .9 });
    const glow = new THREE.MeshStandardMaterial({ color: '#38f2c8', emissive: '#38f2c8', emissiveIntensity: .9, roughness: .4 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#2f7a4a', roughness: .85 });

    const R = this.radius;

    // paved platform
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R - 1, R - 1, 0.3, 30), paving);
    base.position.y = 0.15; base.receiveShadow = true; g.add(base);

    // glowing safe-zone ring on the ground
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 6, 56),
      new THREE.MeshBasicMaterial({ color: '#38f2c8', transparent: true, opacity: .55 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.34; g.add(ring);
    this.ring = ring;

    // sandbag perimeter with an entrance gap on the +X side
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.5) continue; // gap
      const x = Math.cos(a) * (R - 1.2), z = Math.sin(a) * (R - 1.2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.9), sand);
      b.position.set(x, 0.75, z); b.rotation.y = -a; b.castShadow = true; g.add(b);
    }

    // command tent tucked into the back-left corner so the spawn view stays open
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 4.2), cloth);
    t1.position.set(-8.0, 1.7, -8.5); t1.rotation.z = 0.5; t1.castShadow = true; g.add(t1);
    const t2 = t1.clone(); t2.position.set(-5.0, 1.7, -8.5); t2.rotation.z = -0.5; g.add(t2);
    for (const [dx, dz] of [[-9.2, -7.6], [-3.8, -7.6], [-9.2, -9.4], [-3.8, -9.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), wood);
      leg.position.set(dx, 0.9, dz); leg.castShadow = true; g.add(leg);
    }

    // upgrade workbench (back-right)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 1.0), metal);
    bench.position.set(6.6, 0.8, -7.4); bench.castShadow = true; g.add(bench);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.8, 0.08), glow);
    screen.position.set(6.6, 1.9, -7.4); screen.rotation.x = -0.25; g.add(screen);
    const screenLight = new THREE.PointLight('#38f2c8', 1.4, 12); screenLight.position.set(6.6, 2.1, -7.0); g.add(screenLight);

    // flag pole + banner at the back
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 6), metal);
    pole.position.set(0, 4, -11.6); pole.castShadow = true; g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 2.2), glow);
    flag.position.set(0, 7.2, -10.4); g.add(flag);

    // warm camp light (centre stays clear for the player)
    const lamp = new THREE.PointLight('#ffd98a', 1.6, 26); lamp.position.set(0, 5, 0); g.add(lamp);

    this.scene.add(g);
    this.group = g;
  }

  _buildUI() {
    const el = document.createElement('div');
    el.id = 'safehouse'; el.className = 'hidden';
    el.innerHTML = `<div class="shop-panel">
      <div class="shop-head"><span id="sh-title">${this.title}</span>
        <span id="sh-points">POINTS 0</span></div>
      <div class="sh-sub">Skill upgrades are only available inside a safe zone.</div>
      <div id="sh-items" class="shop-items"></div>
      <div class="shop-foot"><button id="sh-close">CLOSE (E)</button></div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.itemsEl = el.querySelector('#sh-items');
    this.pointsEl = el.querySelector('#sh-points');
    el.querySelector('#sh-close').addEventListener('click', () => this.close());
  }

  update(dt, player, progression, input, hud) {
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const near = d < this.radius - 1.5;
    const inZone = d < this.radius;
    this.playerInZone = inZone;
    if (this.ring) this.ring.material.opacity = 0.4 + Math.sin(performance.now() / 500) * 0.12;

    if (near && !this.open) {
      const K = (hud && hud.keyName) ? hud.keyName('use') : 'F';
      const prompt = progression.points > 0 ? 'PRESS ' + K + ' — SPEND SKILL POINTS' : 'PRESS ' + K + ' — SAFE HOUSE';
      if (hud) hud.setUseVisible(true, prompt);
    }
    if (near && input && input.once('interact')) { this.open ? this.close() : this.show(progression); }
    if (this.open && !near) this.close();
  }

  show(progression) {
    this.open = true; this.el.classList.remove('hidden'); this._render(progression);
  }
  close() { this.open = false; this.el.classList.add('hidden'); }

  _render(progression) {
    const p = progression;
    this.pointsEl.textContent = 'POINTS ' + p.points;
    const items = [];
    const up = [
      ['vitality', 'Vitality', `${p.maxHealth} → ${p.maxHealth + 25} HP`],
      ['speed', 'Speed', `${p.runSpeed.toFixed(1)} → ${(p.runSpeed + 0.7).toFixed(1)} run`],
      ['stamina', 'Stamina', `${p.maxStamina} → ${p.maxStamina + 20} stamina`],
      ['carry', 'Carry', `${p.carry} → ${p.carry + 3} carry`],
    ];
    for (const [key, label, sub] of up) {
      items.push({ kind: 'up', stat: key, label, sub: `${sub}   (Lv ${p.upgrades[key]})`,
        price: 1, currency: 'pt', disabled: p.points < 1 });
    }
    // installations — bought once, permanent
    for (const it of INSTALLS) {
      const owned = p.installs && p.installs[it.id];
      if (owned) { items.push({ kind: 'info', label: it.name, sub: 'installed', price: 0 }); continue; }
      items.push({ kind: 'install', iid: it.id, label: it.name, sub: it.note,
        price: it.price, currency: 'coin', disabled: p.coins < it.price });
    }
    // insurance: keep more of your coins when you die
    const INS = [0, 250, 700];
    const tier = p.insurance || 0;
    if (tier < 2) {
      items.push({ kind: 'insurance', label: `Insurance tier ${tier + 1}`, sub: `keep ${[65, 80, 95][tier]}% of coins on death (currently 50%)`,
        price: INS[tier + 1], currency: 'coin', disabled: p.coins < INS[tier + 1] });
    } else items.push({ kind: 'info', label: 'Insurance', sub: 'fully covered', price: 0 });
    // workbench: upgrade the weapon you are holding
    const cur = this.arsenal && this.arsenal.current;
    if (cur) {
      const def = cur.def;
      const now = p.statsFor(def.id);
      for (const tr of WEAPON_TRACKS) {
        if (def.mag === Infinity && tr.key === 'mag') continue;
        const lv = p.weaponUpLevel(def.id, tr.key);
        if (lv >= tr.max) { items.push({ kind: 'info', key: 'wmax_' + tr.key, label: tr.name + ' \u2014 MAX', sub: def.name, price: 0 }); continue; }
        const next = weaponStats(def, Object.assign({}, p.weaponUp[def.id], { [tr.key]: lv + 1 }));
        const cost = p.weaponUpCost(def.id, tr.key);
        items.push({ kind: 'wup', key: 'wu_' + tr.key, wid: def.id, track: tr.key, selfPay: true,
          label: `${tr.name} Lv${lv + 1}`, sub: `${def.name} \u2022 ${statDelta(tr.key, now, next)}`,
          price: cost, currency: 'coin', rarity: def.rarity, disabled: p.coins < cost });
      }
    }
    if (p.armorTier >= 1 && p.armorLevel < ARMOUR_TRACK.max) {
      const cost = p.armorUpCost();
      items.push({ kind: 'aup', key: 'aup', selfPay: true, label: `Armour Plating Lv${p.armorLevel + 1}`,
        sub: `+${ARMOUR_TRACK.perArmor} armour \u2022 +${Math.round(ARMOUR_TRACK.perAbsorb * 100)}% absorb`,
        price: cost, currency: 'coin', disabled: p.coins < cost });
    }

    for (const pk of PERKS) {
      const lv = p.perk(pk.id);
      if (lv >= pk.max) { items.push({ kind: 'info', key: 'pmax_' + pk.id, label: pk.name + ' \u2014 MAX', sub: pk.desc, price: 0 }); continue; }
      items.push({ kind: 'perk', key: 'pk_' + pk.id, pid: pk.id, label: `${pk.name} ${lv + 1}`,
        sub: pk.desc, price: pk.cost, currency: 'pt', disabled: p.points < pk.cost });
    }
    if (p.canPrestige()) {
      items.push({ kind: 'prestige', key: 'prestige', label: 'PRESTIGE',
        sub: `reset to level 1 for +8% XP and +10% coins, forever (rank ${p.prestige})`,
        price: 0, currency: 'pt', disabled: false });
    }

    const spent = p.upgrades.vitality + p.upgrades.speed + p.upgrades.stamina + p.upgrades.carry;
    if (spent > 0) items.push({ kind: 'respec', key: 'respec', label: 'Respec',
      sub: `refund ${spent} point${spent > 1 ? 's' : ''}`, price: 300, currency: 'coin', disabled: p.coins < 300 });
    if (this.arsenal) {
      for (const slot of this.arsenal.slots) {
        const d = slot.def;
        if (d.price <= 0 || d.id === 'knife' || d.id === 'pistol') continue;
        items.push({ kind: 'sell', key: 'w_' + d.id, label: 'Sell ' + d.name,
          sub: `${RARITY[d.rarity].name} • you get 50% back`, price: Math.round(d.price * 0.5),
          currency: 'coin', gain: true, rarity: d.rarity, disabled: false });
      }
    }
    if (this.armory) {
      for (const id of ['smg', 'shotgun', 'rifle', 'sniper']) {
        const w = WEAPONS[id];
        if (!p.unlocked.has(id)) items.push({ kind: 'weapon', key: 'w_' + id, label: w.name,
          sub: `${RARITY[w.rarity].name} weapon • unlock Lv${w.unlock}`, price: w.price, currency: 'coin',
          rarity: w.rarity, disabled: p.coins < w.price });
      }
      items.push({ kind: 'ammo', key: 'ammo', label: 'Ammo Crate', sub: 'refill reserves', price: 60, currency: 'coin', disabled: p.coins < 60 });
      items.push({ kind: 'armor', key: 'armor', label: 'Armour Plate', sub: 'top up +50 armour', price: 90, currency: 'coin', disabled: p.coins < 90 });
      for (let t = p.armorTier + 1; t < ARMOUR.length; t++) {
        const a = ARMOUR[t];
        items.push({ kind: 'armourTier', tier: t, label: a.name,
          sub: `${a.max} armour • ${Math.round(a.absorb * 100)}% absorb`, price: a.price,
          currency: 'coin', disabled: p.coins < a.price });
      }
    }

    this.itemsEl.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      const short = (it.currency === 'coin' && p.coins < it.price) ? ` · short ${it.price - p.coins}` : '';
      row.className = 'shop-row' + (it.disabled ? ' dim' : '');
      const tag = it.currency === 'pt' ? `${it.price} PT` : (it.gain ? `+◈ ${it.price}` : `◈ ${it.price}`);
      if (it.kind === 'info') {
        row.innerHTML = `<div class="shop-info"><b style="color:#5f7f9a">${it.label}</b><span>${it.sub}</span></div>
          <span class="shop-max">MAX</span>`;
        this.itemsEl.appendChild(row); continue;
      }
      row.innerHTML = `<div class="shop-info"><b style="color:${it.rarity ? RARITY[it.rarity].c : ''}">${it.label}</b><span>${it.sub}${short}</span></div>
        <button class="shop-buy">${tag}</button>`;
      row.querySelector('.shop-buy').addEventListener('click', () => {
        if (it.disabled) { if (this.audio) this.audio.error(); return; }
        let ok = false;
        if (it.kind === 'up') ok = p.applyUpgrade(it.stat);
        else if (this.onBuy) ok = this.onBuy(it);
        if (ok) {
          if (it.gain) p.addCoins(it.price);
          else if (it.currency === 'coin' && !it.selfPay) p.spend(it.price);
          if (this.audio) this.audio.buy();
          this._render(p);
        }
      });
      this.itemsEl.appendChild(row);
    }
  }
}
