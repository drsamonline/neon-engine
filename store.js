// store.js — a wandering merchant that appears periodically to sell gear
import * as THREE from 'three';
import { WEAPONS, RARITY, WEAPON_TRACKS, weaponStats, statDelta, ATTACH_SLOTS, ATTACHMENTS } from './weapons.js';
import { RECIPES, SETS } from './leveling.js';
import { ARMOUR, ARMOUR_TRACK } from './leveling.js';

export class Store {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.active = false; this.group = null; this.timer = 45;
    this.cooldown = 0;
    this.onBuy = null;      // (item) -> bool (handled by game, returns success)
    this.open = false;
    this._buildUI();
  }

  _buildUI() {
    const el = document.createElement('div');
    el.id = 'shop'; el.className = 'hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Merchant');
    el.innerHTML = `<div class="shop-panel">
      <div class="shop-head"><span id="shop-title">MERCHANT</span>
        <span id="shop-coins">◈ 0</span></div>
      <div id="shop-items" class="shop-items"></div>
      <div class="shop-foot"><button id="shop-close">CLOSE (E)</button></div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.itemsEl = el.querySelector('#shop-items');
    this.coinsEl = el.querySelector('#shop-coins');
    el.querySelector('#shop-close').addEventListener('click', () => this.close());
  }

  _buildStall() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: .9 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#c8442f', roughness: .8 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 2.4), cloth);
    top.position.y = 2.6; top.castShadow = true; g.add(top);
    for (const [x, z] of [[-1.8, -1], [1.8, -1], [-1.8, 1], [1.8, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), wood);
      leg.position.set(x, 1.3, z); leg.castShadow = true; g.add(leg);
    }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 0.6), wood);
    counter.position.set(0, 0.45, 1); counter.castShadow = true; g.add(counter);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.1),
      new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffd23a', emissiveIntensity: .7 }));
    sign.position.set(0, 3.2, 0); g.add(sign);
    const light = new THREE.PointLight('#ffd98a', 1.4, 12); light.position.set(0, 3, 0); g.add(light);
    return g;
  }

  spawnNear(player) {
    const pos = this.world.spawnAround(player.pos, 16, 26);
    this.group = this._buildStall();
    this.group.position.copy(pos);
    this.scene.add(this.group);
    this.active = true; this.pos = pos;
    if (this.audio) this.audio.buy();
  }

  despawn() {
    if (this.group) this.scene.remove(this.group);
    this.group = null; this.active = false; this.close();
  }

  update(dt, player, progression, input, hud) {
    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) { this.spawnNear(player); this.cooldown = this.timer; }
      return;
    }
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const near = d < 3.2;
    if (hud) hud.setUseVisible(near && !this.open, 'PRESS E TO SHOP');
    if (near && input && input.once('interact')) { this.open ? this.close() : this.show(progression); }
    if (this.open && !near) this.close();
  }

  show(progression) {
    this.open = true;
    this.el.classList.remove('hidden');
    this._render(progression);
  }
  close() { this.open = false; this.el.classList.add('hidden'); }

  /* three items rotate each day, at 25% off, seeded from the date */
  _dailyDeals(items) {
    const pool = items.filter((i) => i.price > 0 && i.kind !== 'craft' && i.kind !== 'set' && !i.deal);
    if (!pool.length) return [];
    let seed = 0;
    const day = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < day.length; i++) seed = (seed * 31 + day.charCodeAt(i)) >>> 0;
    const pick = [];
    for (let n = 0; n < 3 && pool.length; n++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      pick.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return pick.map((i) => Object.assign({}, i, {
      key: 'deal_' + i.key, price: Math.max(1, Math.round(i.price * 0.75)),
      sub: (i.sub || '') + '   \u2014 25% OFF TODAY',
    }));
  }

  _render(progression) {
    const mod = this.priceMod || 1;
    this.coinsEl.textContent = '◈ ' + progression.coins + '   ⚙ ' + (progression.scrap || 0) + ' scrap'
      + (mod < 0.999 ? '   (' + Math.round((1 - mod) * 100) + '% rep discount)' : '');
    const items = [];
    // weapons not owned
    for (const id of ['smg', 'shotgun', 'rifle', 'sniper']) {
      const w = WEAPONS[id];
      if (!progression.unlocked.has(id)) {
        items.push({ key: 'w_' + id, label: w.name, sub: `${RARITY[w.rarity].name} weapon • unlock Lv${w.unlock}`, price: w.price, kind: 'weapon', rarity: w.rarity });
      }
    }
    // workbench: upgrade the weapon you are currently holding
    const cur = this.arsenal && this.arsenal.current;
    const def = cur ? cur.def : null;
    if (cur) {
      const now = progression.statsFor(def.id);
      for (const tr of WEAPON_TRACKS) {
        if (def.mag === Infinity && tr.key === 'mag') continue;
        const lv = progression.weaponUpLevel(def.id, tr.key);
        if (lv >= tr.max) { items.push({ key: 'wmax_' + tr.key, kind: 'info', label: tr.name + ' \u2014 MAX', sub: def.name, price: 0 }); continue; }
        const next = weaponStats(def, Object.assign({}, progression.weaponUp[def.id], { [tr.key]: lv + 1 }));
        const cost = progression.weaponUpCost(def.id, tr.key);
        items.push({ key: 'wu_' + tr.key, kind: 'wup', wid: def.id, track: tr.key, selfPay: true,
          label: `${tr.name} Lv${lv + 1}`, sub: `${def.name} \u2022 ${statDelta(tr.key, now, next)}`,
          price: cost, rarity: def.rarity, disabled: progression.coins < cost });
      }
    }
    if (cur) {
      for (const slot of ATTACH_SLOTS) {
        for (const a of ATTACHMENTS[slot.key]) {
          if (a.id === 'none') continue;
          const owned = progression.ownsAttach(def.id, slot.key, a.id);
          const on = progression.equippedAttach(def.id, slot.key) === a.id;
          if (on) { items.push({ key: 'at_' + slot.key + a.id, kind: 'info', label: `${slot.name}: ${a.name}`, sub: 'equipped', price: 0 }); continue; }
          items.push({ key: 'at_' + slot.key + a.id, kind: 'attach', wid: def.id, slot: slot.key, aid: a.id,
            selfPay: true, label: `${slot.name}: ${a.name}`, sub: a.note || def.name,
            price: owned ? 0 : a.price, rarity: def.rarity, disabled: !owned && progression.coins < a.price });
        }
      }
    }
    // scrap crafting — always available at a safe house
    for (const r of RECIPES) {
      const afford = progression.scrap >= r.scrap;
      items.push({ key: 'cr_' + r.id, kind: 'craft', rid: r.id, selfPay: true,
        label: r.name, sub: r.note, price: r.scrap, cost: r.scrap, costKind: 'scrap',
        disabled: !afford });
    }
    if (progression.armorTier >= 1 && progression.armorLevel < ARMOUR_TRACK.max) {
      const cost = progression.armorUpCost();
      items.push({ key: 'aup', kind: 'aup', selfPay: true, label: `Armour Plating Lv${progression.armorLevel + 1}`,
        sub: `+${ARMOUR_TRACK.perArmor} armour \u2022 +${Math.round(ARMOUR_TRACK.perAbsorb * 100)}% absorb`,
        price: cost, disabled: progression.coins < cost });
    }
    items.push({ key: 'ammo', label: 'Ammo Crate', sub: 'refill all reserves', price: 60, kind: 'ammo' });
    items.push({ key: 'health', label: 'Medkit', sub: 'restore 60 HP', price: 50, kind: 'health' });
    items.push({ key: 'armor', label: 'Armour Plate', sub: 'top up +50 armour', price: 90, kind: 'armor' });
    for (let t = progression.armorTier + 1; t < ARMOUR.length; t++) {
      const a = ARMOUR[t];
      items.push({ key: 'at' + t, label: a.name, sub: `${a.max} armour • ${Math.round(a.absorb * 100)}% absorb`, price: a.price, kind: 'armourTier', tier: t });
    }
    items.push({ key: 'magnet', label: 'Loot Magnet', sub: 'auto-collect 30s', price: 70, kind: 'magnet' });
    items.push({ key: 'up_vitality', label: 'Upgrade: Vitality', sub: '+25 max HP', price: 250, kind: 'up', stat: 'vitality' });
    items.push({ key: 'up_speed', label: 'Upgrade: Speed', sub: '+0.7 run speed', price: 250, kind: 'up', stat: 'speed' });
    items.push({ key: 'up_stamina', label: 'Upgrade: Stamina', sub: '+20 stamina', price: 220, kind: 'up', stat: 'stamina' });
    items.push({ key: 'up_carry', label: 'Upgrade: Carry', sub: '+3 carry', price: 200, kind: 'up', stat: 'carry' });

    for (const it of items) if (it.price && it.kind !== 'craft') it.price = Math.max(1, Math.round(it.price * mod));
    // ---- today's deals: three date-seeded items at a discount ----
    const deals = this._dailyDeals(items);
    if (deals.length) {
      items.unshift(...deals.map((d) => Object.assign({}, d, { deal: true })));
    }
    // ---- gear sets ----
    for (const set of SETS) {
      const owned = progression.ownsSet(set.id);
      const worn = progression.setId === set.id;
      items.push({ key: 'set_' + set.id, kind: 'set', sid: set.id, selfPay: true,
        label: set.name + (worn ? '  \u2713 worn' : ''), sub: set.note,
        price: owned ? 0 : set.price, disabled: !owned && progression.coins < set.price });
    }

    this.itemsEl.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      const isScrap = it.costKind === 'scrap';
      const wallet = isScrap ? (progression.scrap || 0) : progression.coins;
      const unit = isScrap ? '\u2699' : '\u25c8';
      const short = wallet < it.price ? ` · short ${it.price - wallet}` : '';
      row.className = 'shop-row' + (wallet < it.price ? ' dim' : '');
      if (it.kind === 'info') {
        row.innerHTML = `<div class="shop-info"><b style="color:#5f7f9a">${it.label}</b><span>${it.sub}</span></div>
          <span class="shop-max">MAX</span>`;
        this.itemsEl.appendChild(row); continue;
      }
      row.innerHTML = `<div class="shop-info"><b style="color:${it.rarity ? RARITY[it.rarity].c : ''}">${it.label}</b><span>${it.sub}${short}</span></div>
        <button class="shop-buy">${unit} ${it.price}</button>`;
      row.querySelector('.shop-buy').addEventListener('click', () => {
        if (wallet < it.price) { if (this.audio) this.audio.error(); return; }
        const ok = this.onBuy ? this.onBuy(it) : false;
        if (ok) { if (!it.selfPay) progression.spend(it.price); if (this.audio) this.audio.buy(); this._render(progression); }
      });
      this.itemsEl.appendChild(row);
    }
  }
}
