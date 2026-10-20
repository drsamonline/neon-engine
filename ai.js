// ai.js — enemy archetypes (zombies + criminals), deaths, and the spawn director
import * as THREE from 'three';
import { clamp } from './core.js';
import { EnemyBody } from './enemybody.js';

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
};

let DAMAGE_SCALE = 1;
export function setDamageScale(v) { DAMAGE_SCALE = Math.max(0.1, v || 1); }

export const ENEMY_TYPES = {
  /* ---- zombies ---- */
  walker: { name: 'Walker', hp: 60, speed: 2.0, dmg: 9, radius: 0.5, scale: 1, color: '#5a7a4a',
    skin: '#7a9a5a', behavior: 'chase', xp: 12, coins: 10, unlock: 0 },
  runner: { name: 'Runner', hp: 42, speed: 4.6, dmg: 7, radius: 0.45, scale: 0.95, color: '#7a5a3a',
    skin: '#9a7a4a', behavior: 'chase', xp: 16, coins: 12, unlock: 0 },
  spitter: { name: 'Spitter', hp: 70, speed: 1.8, dmg: 11, radius: 0.55, scale: 1.05, color: '#3a7a5a',
    skin: '#5aaa6a', behavior: 'chase', ranged: true, range: 26, xp: 26, coins: 20, unlock: 2 },
  brute: { name: 'Brute', hp: 320, speed: 1.6, dmg: 24, radius: 0.95, scale: 1.7, color: '#4a3a5a',
    skin: '#6a5a7a', behavior: 'chase', xp: 110, coins: 56, unlock: 4, elite: true, charge: true },
  crawler: { name: 'Crawler', hp: 34, speed: 5.2, dmg: 6, radius: 0.4, scale: 0.8, color: '#6a8a4a',
    skin: '#88a85a', behavior: 'chase', xp: 14, coins: 10, unlock: 1, leap: true },
  bloater: { name: 'Bloater', hp: 140, speed: 1.3, dmg: 18, radius: 0.8, scale: 1.35, color: '#5a6a3a',
    skin: '#7a8a4a', behavior: 'chase', xp: 34, coins: 26, unlock: 3, explodes: { radius: 6.5, damage: 34 } },
  screamer: { name: 'Screamer', hp: 90, speed: 2.6, dmg: 8, radius: 0.55, scale: 1.05, color: '#8a4a6a',
    skin: '#a86a8a', behavior: 'chase', xp: 30, coins: 22, unlock: 3, summoner: true },
  pickpocket: { name: 'Pickpocket', hp: 70, speed: 4.0, dmg: 6, radius: 0.45, scale: 0.95, color: '#4a6a4a',
    skin: '#8aa06a', behavior: 'thief', xp: 30, coins: 28, unlock: 3, thief: true },
  behemoth: { name: 'Behemoth', hp: 900, speed: 1.5, dmg: 34, radius: 1.5, scale: 2.6, color: '#3a2a4a',
    skin: '#5a4a6a', behavior: 'chase', xp: 420, coins: 300, unlock: 6, boss: true, elite: true },
  warlord: { name: 'Warlord', hp: 620, speed: 3.2, dmg: 26, radius: 0.85, scale: 1.5, color: '#2a2a3a',
    skin: '#9a8a7a', behavior: 'guard', ranged: true, range: 34, xp: 380, coins: 260, unlock: 7, boss: true, elite: true },

  /* ---- criminals (Neon Police) ---- */
  vandal: { name: 'Vandal', hp: 45, speed: 3.0, dmg: 6, radius: 0.45, scale: 1, color: '#c86a2f',
    skin: '#e0a070', behavior: 'flee', crime: 'Vandalism', xp: 12, coins: 10, unlock: 0 },
  thief: { name: 'Thief', hp: 55, speed: 3.6, dmg: 8, radius: 0.45, scale: 1, color: '#3a3a4a',
    skin: '#c0a080', behavior: 'flee', crime: 'Theft', xp: 18, coins: 18, unlock: 0 },
  burglar: { name: 'Burglar', hp: 65, speed: 3.2, dmg: 10, radius: 0.5, scale: 1.05, color: '#2a2a38',
    skin: '#b09070', behavior: 'flee', crime: 'Burglary', xp: 24, coins: 28, unlock: 1 },
  dealer: { name: 'Dealer', hp: 75, speed: 2.6, dmg: 12, radius: 0.5, scale: 1.05, color: '#4a3a2a',
    skin: '#a08060', behavior: 'guard', ranged: true, range: 22, crime: 'Drug Deal', xp: 36, coins: 44, unlock: 1 },
  carjacker: { name: 'Carjacker', hp: 80, speed: 3.4, dmg: 14, radius: 0.5, scale: 1.05, color: '#3a2a2a',
    skin: '#a08070', behavior: 'flee', crime: 'Carjacking', xp: 30, coins: 36, unlock: 2 },
  kidnapper: { name: 'Kidnapper', hp: 110, speed: 3.0, dmg: 16, radius: 0.55, scale: 1.15, color: '#2a1a2a',
    skin: '#a08878', behavior: 'guard', ranged: true, range: 20, crime: 'Kidnapping', xp: 52, coins: 60, unlock: 3 },
  homicide: { name: 'Homicide Suspect', hp: 160, speed: 3.4, dmg: 20, radius: 0.6, scale: 1.2, color: '#1a1a22',
    skin: '#a08878', behavior: 'guard', ranged: true, range: 28, crime: 'Homicide', xp: 85, coins: 96, unlock: 4, elite: true },
  gangster: { name: 'Gangster', hp: 120, speed: 3.2, dmg: 16, radius: 0.55, scale: 1.1, color: '#3a2a3a',
    skin: '#a08070', behavior: 'guard', ranged: true, range: 26, crime: 'Gang Activity', xp: 46, coins: 52, unlock: 2 },
  smuggler: { name: 'Smuggler', hp: 95, speed: 3.0, dmg: 12, radius: 0.5, scale: 1, color: '#2a3a2a',
    skin: '#b09070', behavior: 'flee', crime: 'Smuggling', xp: 34, coins: 44, unlock: 2 },
  pyromaniac: { name: 'Pyromaniac', hp: 130, speed: 2.8, dmg: 18, radius: 0.6, scale: 1.15, color: '#5a2a1a',
    skin: '#c09070', behavior: 'guard', crime: 'Arson', xp: 62, coins: 72, unlock: 3 },
  ringleader: { name: 'Ringleader', hp: 420, speed: 3.0, dmg: 24, radius: 0.85, scale: 1.5, color: '#1a1a26',
    skin: '#a08878', behavior: 'guard', ranged: true, range: 30, crime: 'Organised Crime',
    xp: 320, coins: 220, unlock: 5, boss: true, elite: true },
};

export class Enemy {
  constructor(typeId, pos, world, difficulty = 1) {
    const t = ENEMY_TYPES[typeId] || ENEMY_TYPES.walker;
    this.type = typeId; this.t = t; this.world = world;
    this.maxHealth = Math.round(t.hp * (1 + (difficulty - 1) * 0.28));
    this.health = this.maxHealth;
    this.speed = t.speed * (1 + Math.min(0.30, (difficulty - 1) * 0.04));
    this.attackDamage = t.dmg * (1 + (difficulty - 1) * 0.16);   // NB: never name this `damage` — it would shadow the damage() method
    this.radius = t.radius * t.scale;
    this.alive = true; this.removeMe = false;
    this.attackCool = 0.6 + Math.random();
    this.hitFlash = 0; this.deadT = 0;
    this.isBoss = !!t.boss;
    this._onDeath = null;
    this.staggerT = 0;        // brief pause after a heavy hit
    this.windup = 0;          // attack telegraph
    this.bias = new THREE.Vector3();
    this.cohesionT = Math.random() * 0.5;
    this.passive = false;     // ambient wanderer: never attacks
    this.alert = 'idle';      // idle -> suspicious -> hunting
    this.alertT = 0;
    this.losT = 99;           // seconds since we last saw the player
    this.lastKnown = new THREE.Vector3();
    this._losTick = Math.random() * 0.25;
    this._canSee = false;
    this._cueT = 0;
    this._cols = [];
    this._tgt = new THREE.Vector3();
    this._toP = new THREE.Vector3();
    // personality / tactics, seeded off the body so it is stable
    const r = this.body ? this.body.rnd : Math.random;
    this.flank = r() < 0.42;
    this.flankSide = r() < 0.5 ? -1 : 1;
    this.phase = 1;
    this.fearT = 0;
    this.leapCool = 0; this.hopT = 0; this.hopDur = 0; this.hopDir = new THREE.Vector3();
    this.chargeCool = 0; this.chargeT = 0; this.chargeDir = new THREE.Vector3();
    this.slamCool = 0;
    this.leaps = !!t.leap; this.charger = !!t.charge;
    this.knock = new THREE.Vector3();
    this.wander = new THREE.Vector3(); this.wanderT = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.surrendered = false; this.arrested = false; this.arrestT = 0;
    this.safeZones = [];   // assigned by the director
    this.stolen = 0;       // what a thief has run off with
    this.grabbing = null;  // the player, while a brute has hold of them
    this.grabCool = 0;
    this.fleeing = false;
    this.weak = null;        // a boss's damageable core
    this.weakBroken = false;

    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this._build(t);
    this._mats = []; this.group.traverse((o) => { if (o.isMesh) { o.userData.enemy = this; this._mats.push(o.material); } });
    this._pickWander();
  }

  /* Re-initialise a pooled enemy instead of allocating a new one. */
  reset(typeId, pos, difficulty = 1) {
    const t = ENEMY_TYPES[typeId] || ENEMY_TYPES.walker;
    const typeChanged = this.type !== typeId;
    this.type = typeId; this.t = t;
    this.maxHealth = Math.round(t.hp * (1 + (difficulty - 1) * 0.28));
    this.health = this.maxHealth;
    this.speed = t.speed * (1 + Math.min(0.30, (difficulty - 1) * 0.04));
    this.attackDamage = t.dmg * (1 + (difficulty - 1) * 0.16);
    this.radius = t.radius * t.scale;
    this.alive = true; this.removeMe = false;
    this.attackCool = 0.6 + Math.random();
    this.hitFlash = 0; this.deadT = 0;
    this.isBoss = !!t.boss;
    this._onDeath = null;
    this.staggerT = 0; this.windup = 0; this._cueT = 0; this._canSee = false; this.losT = 99;
    this.cohesionT = Math.random() * 0.5;
    this.passive = false;
    this.alert = 'idle'; this.alertT = 0;
    this.flank = Math.random() < 0.42; this.flankSide = Math.random() < 0.5 ? -1 : 1;
    this.phase = 1; this.fearT = 0;
    this.leapCool = 0; this.hopT = 0; this.hopDur = 0;
    this.chargeCool = 0; this.chargeT = 0; this.slamCool = 0;
    this.grabCool = 0;
    this.leaps = !!t.leap; this.charger = !!t.charge;
    this.knock.set(0, 0, 0);
    this.wanderT = 0; this.facing = Math.random() * Math.PI * 2;
    this.surrendered = false; this.arrested = false; this.arrestT = 0;
    this.effects = null;
    this.group.position.copy(pos);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
    if (typeChanged || !this.body) { this._clearBody(); this._build(t); }
    else this.body.resetVisual();
    this._mats = [];
    this.group.traverse((o) => { if (o.isMesh) { o.userData.enemy = this; this._mats.push(o.material); } });
    this._pickWander();
    return this;
  }

  /* drop the old body meshes and free their materials */
  _clearBody() {
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const c = this.group.children[i];
      this.group.remove(c);
      if (c.isMesh) c.material.dispose();
    }
    this.body = null;
  }

  dispose() {
    this._clearBody();
    if (this.group.parent) this.group.parent.remove(this.group);
  }

  _build(t) {
    Enemy._seq = (Enemy._seq || 0) + 1;
    const seed = (Math.round(this.group.position.x * 100) * 73856093)
      ^ (Math.round(this.group.position.z * 100) * 19349663)
      ^ (Enemy._seq * 83492791);
    this.body = new EnemyBody(this.group, t, seed);
    this.legs = this.body.legs;
    this.arms = this.body.arms;
  }

  /* sampled line-of-sight against the world's collision prisms */
  _hasLOS(player) {
    const ex = this.group.position.x, ez = this.group.position.z;
    const tx = player.pos.x, tz = player.pos.z;
    const dist = Math.hypot(tx - ex, tz - ez);
    if (dist < 3) return true;
    const steps = Math.min(10, 3 + (dist / 6) | 0);
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const x = ex + (tx - ex) * f, z = ez + (tz - ez) * f;
      for (const c of this.world.collidersNear(x, z, 0.4)) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.height > 1.4) return false;
      }
    }
    return true;
  }

  /* heard something: investigate it */
  hear(pos, radius) {
    if (!this.alive || this.surrendered || this.passive) return false;
    const d = Math.hypot(pos.x - this.group.position.x, pos.z - this.group.position.z);
    if (d > radius) return false;
    if (this.alert === 'hunting') return false;
    this.lastKnown.set(pos.x, 0, pos.z);
    this.alert = 'suspicious';
    this.alertT = 0;
    return true;
  }

  _spot() {
    if (this._cueT > 0) return;
    this._cueT = 0.9;
    if (this.body && this.body.alertCue) this.body.alertCue.visible = true;
  }

  headHeight() { return this.body ? this.body.headY : 1.78 * this.t.scale; }
  stagger(t) { this.staggerT = Math.max(this.staggerT, t); }

  /* status effects: burn (damage over time), bleed (damage over time), shock (stun) */
  applyEffect(kind, dur) {
    if (!this.effects) this.effects = {};
    this.effects[kind] = Math.max(this.effects[kind] || 0, dur);
    this._fxT = 0;
  }

  surrender() { if (!this.alive || this.surrendered) return; this.surrendered = true; this.knock.set(0, 0, 0); }

  _pickWander() {
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 22;
    this.wander.set(this.group.position.x + Math.cos(a) * d, 0, this.group.position.z + Math.sin(a) * d);
    this.wanderT = 0;
  }

  rnd() { return Math.random(); }

  damage(amount, point, dir) {
    if (!this.alive) return;
    this.health -= amount;
    this.hitFlash = 0.12;
    for (const m of this._mats) if (m.emissive) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.5; }
    const k = clamp(amount / 40, 0.2, 2.5) / this.t.scale;
    if (dir) this.knock.addScaledVector(dir, k * 6);
    if (this.body) {
      this.body.setDamage(Math.max(0, this.health / this.maxHealth));
      if (amount > 55 && this.rnd() < 0.35) this.body.loseLimb();
    }
    if (this.health <= 0) this._die(dir);
  }

  /* damage routed at the glowing core */
  hitWeak(dmg) {
    if (this.weakBroken || !this.t.boss) return false;
    if (this.weakHp === undefined) this.weakHp = 150 + (this.maxHealth * 0.12);
    this.weakHp -= dmg;
    if (this.weakHp <= 0) {
      this.weakBroken = true;
      if (this.body) this.body.breakWeak();
      this.staggerT = Math.max(this.staggerT, 1.8);
      if (this._onWeakBreak) this._onWeakBreak(this);
      return true;
    }
    return false;
  }

  _die(dir, gib = 0) {
    this.alive = false;
    const n = gib || (this.t.explodes ? 10 : this.isBoss ? 8 : this.t.elite ? 5 : 0);
    if (n > 0 && this._onGib) this._onGib(this, n);
    this.deadT = 0;
    if (dir) this.knock.addScaledVector(dir, 4 / this.t.scale);
    this.knock.y += 3;
    if (this._onDeath) this._onDeath(this);
  }

  update(dt, player, ctx) {
    const p = this.group.position;

    if (!this.alive) {
      this.deadT += dt;
      this.knock.y -= 20 * dt;
      p.addScaledVector(this.knock, dt);
      if (p.y < 0) { p.y = 0; this.knock.y = 0; this.knock.multiplyScalar(0.85); }
      // death pose varies per body: face-plant, backward sprawl, or spin-fall
      const dp = this.body ? this.body.deathPose : 0;
      const target = dp === 1 ? -Math.PI / 2 : dp === 2 ? Math.PI / 3 : Math.PI / 2;
      this.group.rotation.x += (target - this.group.rotation.x) * Math.min(1, dt * 5);
      this.group.rotation.z += dt * (dp === 2 ? 4.5 : 1.5) * (dp === 1 ? -1 : 1);
      // corpses linger, then fade
      if (this.deadT > 0.8) {
        const o = Math.max(0, 1 - (this.deadT - 0.8) / 1.8);
        for (const m of this._mats) { m.transparent = true; m.opacity = o; m.depthWrite = o > 0.6; }
      }
      if (this.deadT > 2.6) this.removeMe = true;
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) for (const m of this._mats) if (m.emissive) m.emissiveIntensity = 0;
    }

    if (this._cueT > 0) {
      this._cueT -= dt;
      if (this._cueT <= 0 && this.body && this.body.alertCue) this.body.alertCue.visible = false;
    }

    // ---- status effects ----
    if (this.effects) {
      let burning = false;
      for (const k in this.effects) {
        if (this.effects[k] <= 0) continue;
        this.effects[k] -= dt;
        if (k === 'burn') { this.health -= 11 * dt; burning = true; }
        else if (k === 'bleed') this.health -= 7 * dt;
      }
      if (burning) {
        this._fxT = (this._fxT || 0) - dt;
        if (this._fxT <= 0 && ctx.particles) {
          this._fxT = 0.08;
          ctx.particles.impact(this.group.position.clone().setY(1.1 * (this.t.scale || 1)), 1, [1, 0.5, 0.15]);
        }
        for (const m of this._mats) if (m.emissive) { m.emissive.setRGB(1, 0.35, 0.1); m.emissiveIntensity = 0.8; }
      }
      if (this.health <= 0) { this._die(null); return; }
      // a brute grabs instead of just swinging
      if (this.t.charge && distP < 2.4 && this.grabCool <= 0 && player.grabLock === undefined) {
        this.grabCool = 8;
        this.grabbing = player;
        player.grabLock = { t: 1.6, e: this, power: this.t.dmg * 0.5 };
        if (this._onGrab) this._onGrab(this);
      }
      if (this.effects.shock > 0) {
        // electrocuted: locked in place, twitching
        this.group.rotation.z = Math.sin(performance.now() / 35) * 0.16;
        this.arms[0].rotation.x = Math.sin(performance.now() / 40) * 0.7;
        this.arms[1].rotation.x = -Math.sin(performance.now() / 40) * 0.7;
        if (ctx.particles && Math.random() < dt * 10) {
          ctx.particles.impact(this.group.position.clone().setY(1.2), 1, [0.6, 0.85, 1]);
        }
        return;
      }
    }

    // stagger: a heavy hit briefly stops them
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.group.rotation.z = Math.sin(performance.now() / 40) * 0.12;
      return;
    }
    this.group.rotation.z = 0;

    // bloaters glow hotter as they get close to exploding
    if (this.t.explodes && this.hitFlash <= 0) {
      const danger = 1 - this.health / this.maxHealth;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      for (const m of this._mats) if (m.emissive) {
        m.emissive.setRGB(1, 0.32, 0.08);
        m.emissiveIntensity = 0.15 + danger * 1.7 * pulse;
      }
    }

    // arrested: fade out and leave, instead of standing there for ever
    if (this.arrested) {
      this.arrestT = (this.arrestT || 0) + dt;
      if (this.arrestT > 0.8) {
        const o = Math.max(0, 1 - (this.arrestT - 0.8) / 0.7);
        for (const m of this._mats) { m.transparent = true; m.opacity = o; m.depthWrite = o > 0.6; }
      }
      if (this.arrestT > 1.5) this.removeMe = true;
      return;
    }

    // surrendered: hands up, stand still, awaiting arrest
    if (this.surrendered) {
      this.arms[0].rotation.x = -2.3; this.arms[1].rotation.x = -2.3;
      this.group.rotation.y += dt * 0.8;
      return;
    }

    // knockback decay
    if (this.knock.lengthSq() > 0.01) {
      p.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(1 - Math.min(1, 8 * dt));
      if (this.knock.lengthSq() < 0.01) this.knock.set(0, 0, 0);
    }

    const toPlayer = this._toP.set(player.pos.x - p.x, 0, player.pos.z - p.z);
    const distP = toPlayer.length();
    const beh = this.passive ? 'wander' : this.t.behavior;

    // ---- perception: line of sight (staggered) + hearing ----
    const sight = this.t.sightRange ?? (this.t.ranged ? 60 : 44);
    this._losTick -= dt;
    if (this._losTick <= 0) {
      this._losTick = 0.22 + Math.random() * 0.12;
      this._canSee = player.alive && distP < sight && this._hasLOS(player);
    }
    const sees = this._canSee;

    if (sees) {
      this.losT = 0;
      this.lastKnown.set(player.pos.x, 0, player.pos.z);
      if (this.alert !== 'hunting' && this.alert !== 'suspicious') { this._spot(); if (ctx.onSound) ctx.onSound(this, 'spot'); }
      this.alert = 'hunting';
      this.alertT = 0;
    } else {
      this.losT += dt;
      if (this.alert === 'hunting') {
        this.alertT += dt;
        if (this.alertT > 3.5) { this.alert = 'suspicious'; this.alertT = 0; }
      }
    }

    // boss phases: angrier as it loses health
    if (this.isBoss) {
      const f = this.health / this.maxHealth;
      this.phase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
    }
    // fear: a lone, badly hurt grunt breaks and runs
    this.fearT = Math.max(0, this.fearT - dt);
    if (!this.t.elite && !this.passive && !this.isBoss && this.health / this.maxHealth < 0.35) {
      let allies = 0;
      for (const o of (ctx.enemies || [])) {
        if (o !== this && o.alive && o.group.position.distanceToSquared(p) < 196) { allies++; if (allies > 0) break; }
      }
      if (allies === 0) this.fearT = 2.5;
    }

    let target = null;
    // ---- the player is inside a safe zone: pace around the perimeter ----
    // Enemies cannot enter (the zone is solid), so without this they press into
    // the wall at exactly its radius and look frozen.
    if (player.alive && this._inSafe(player.pos.x, player.pos.z)) {
      const zone = this.safeZones.find((z) =>
        Math.hypot(player.pos.x - z.x, player.pos.z - z.z) < z.r);
      if (zone) {
        // Hug the wall and keep circling, so they read as "trying to get in"
        // rather than standing about. The step is big enough to be visible.
        // Record the zone only — the movement below walks them around the wall
        // directly, because steering cannot solve it (every heading near the
        // barrier is blocked, so the enemy simply stalls).
        this.alert = 'hunting';
        this._pacing = zone;
        this.speed = Math.max(this.speed, (this.t.speed || 2) * 0.9);
      }
    }
    // ---- thief: creep in, lift your coins, then run for it ----
    if (!target && this.t.thief && player.alive) {
      if (this.stolen <= 0) {
        target = this._tgt.set(p.x - toPlayer.x * 0.4, 0, p.z - toPlayer.z * 0.4);
        if (distP < 2.4) {
          this.stolen = 60 + Math.floor(Math.random() * 80);
          this.fleeing = true;
          if (ctx.onSteal) ctx.onSteal(this.stolen, this);
          if (this._onSteal) this._onSteal(this, this.stolen);
        }
      } else {
        target = this._tgt.set(p.x + toPlayer.x * 3, 0, p.z + toPlayer.z * 3);
        this.speed = (this.t.speed || 4) * 1.25;
        if (distP > 58) { this.stolen = 0; this.removeMe = true; }   // got away with it
      }
    }
    else if (!target && this.passive) target = null;
    else if (!target && this.fearT > 0 && player.alive)
      target = this._tgt.set(p.x - toPlayer.x * 2, 0, p.z - toPlayer.z * 2);
    else if (!target && this.alert === 'hunting' && player.alive && this.t.ranged && distP < this.t.range * 0.45)
      target = this._tgt.set(p.x - toPlayer.x * 1.6 + toPlayer.z * 0.5 * this.flankSide, 0,
        p.z - toPlayer.z * 1.6 - toPlayer.x * 0.5 * this.flankSide);
    else if (!target && this.alert === 'hunting' && player.alive) {
      if (this.flank) {                                  // come at the player from the side
        const d = distP || 1;
        const px = -toPlayer.z / d, pz = toPlayer.x / d;
        const off = this.flankSide * 3.4;
        target = this._tgt.set(player.pos.x + px * off, 0, player.pos.z + pz * off);
      } else target = this._tgt.set(player.pos.x, 0, player.pos.z);
    }
    else if (this.alert === 'suspicious') {
      // walk to the last place we saw them, then give up
      const d = Math.hypot(this.lastKnown.x - p.x, this.lastKnown.z - p.z);
      if (d < 2.5) { this.alertT += dt; if (this.alertT > 3) this.alert = 'idle'; }
      else { target = this.lastKnown.clone(); this.alertT = 0; }
    }
    else if (beh === 'flee' && player.alive && distP < 34 && this.alert !== 'idle')
      target = this._tgt.set(p.x - toPlayer.x, 0, p.z - toPlayer.z);

    if (this._pacing) {
      const z = this._pacing;
      const spd = this.speed * (this.fearT > 0 ? 1.35 : 1);
      // keep them just outside the barrier, then walk around it
      let dx = p.x - z.x, dz = p.z - z.z;
      let r = Math.hypot(dx, dz) || 0.001;
      const want = z.r + 1.1;
      const ux = dx / r, uz = dz / r;
      // outward nudge if they have drifted in, tangential step to circle
      const tx = -uz * (this.flankSide || 1), tz = ux * (this.flankSide || 1);
      const push = (want - r) * Math.min(1, dt * 3);
      p.x += (tx * spd * dt) + ux * push;
      p.z += (tz * spd * dt) + uz * push;
      this.facing = Math.atan2(tx, tz);
      this.moving = true;
      this._pacing = null;
      return;
    }

    if (target) {
      const to = target.clone().sub(p); to.y = 0;
      if (to.lengthSq() > 0.01) {
        to.normalize();
        to.x += this.bias.x; to.z += this.bias.z; to.normalize();
        const spd = (this.body && this.body.crawling ? this.speed * 0.5 : this.speed)
          * (this.isBoss ? 1 + (this.phase - 1) * 0.16 : 1) * (this.fearT > 0 ? 1.35 : 1);
        if (!this._steer(to, 0, 0, p, dt, spd)) { /* fully boxed in */ }
      }
    } else {
      this.wanderT += dt;
      const to = (this._wanderV || (this._wanderV = new THREE.Vector3())).set(this.wander.x - p.x, 0, this.wander.z - p.z);
      if (to.length() < 1.5 || this.wanderT > 6) this._pickWander();
      else { to.normalize();
        this._steer(to, 0, 0, p, dt, this.speed * 0.5);
      }
    }
    this._pacing = null;
    this.group.rotation.y = this.facing;
    if (this.body && this.body.weakCore && !this.weakBroken) {
      const pulse = 1 + Math.sin(performance.now() / 260) * 0.14;
      this.body.weakCore.scale.setScalar(0.55 * pulse);
      this.body.weakHalo.scale.setScalar(0.95 * pulse);
      this.body.weakHalo.material.opacity = 0.16 + 0.16 * pulse;
    }

    // ---- special movement: leaping crawlers, charging brutes ----
    this.leapCool = Math.max(0, this.leapCool - dt);
    this.chargeCool = Math.max(0, this.chargeCool - dt);
    if (this.leaps && this.alert === 'hunting' && this.hopT <= 0 && this.leapCool <= 0 && distP > 2.2 && distP < 8.5) {
      this.leapCool = 3.6;
      this.hopT = 0.55; this.hopDur = 0.55;
      this.hopDir.copy(toPlayer).normalize();
      if (ctx.onSound) ctx.onSound(this, 'groan');
    }
    if (this.charger && this.alert === 'hunting' && this.chargeT <= 0 && this.chargeCool <= 0 && distP > 5 && distP < 17) {
      this.chargeCool = 7; this.chargeT = 0.9;
      this.chargeDir.copy(toPlayer).normalize();
    }
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      const nx = p.x + this.chargeDir.x * this.speed * 2.6 * dt;
      const nz = p.z + this.chargeDir.z * this.speed * 2.6 * dt;
      if (!this._blocked(nx, p.z)) p.x = nx;
      if (!this._blocked(p.x, nz)) p.z = nz;
    }
    if (this.hopT > 0) {
      this.hopT -= dt;
      const f = 1 - this.hopT / this.hopDur;
      this.group.position.y = Math.sin(f * Math.PI) * 1.5;
      const nx = p.x + this.hopDir.x * this.speed * 2.2 * dt;
      const nz = p.z + this.hopDir.z * this.speed * 2.2 * dt;
      if (!this._blocked(nx, p.z)) p.x = nx;
      if (!this._blocked(p.x, nz)) p.z = nz;
      if (this.hopT <= 0) this.group.position.y = 0;
    }

    // light pack cohesion — drift toward nearby chasers so they arrive together
    this.cohesionT -= dt;
    if (beh === 'chase' && ctx.enemies && this.cohesionT <= 0) {
      this.cohesionT = 0.5;
      let sx = 0, sz = 0, n = 0, rx = 0, rz = 0, seen = 0;
      for (const o of ctx.enemies) {
        if (o === this || !o.alive) continue;
        if (++seen > 10) break;
        const dx = o.group.position.x - p.x, dz = o.group.position.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 150 && n < 6) { sx += dx; sz += dz; n++; }
        const min = (this.radius + o.radius) * 1.25;
        if (d2 > 0.02 && d2 < min * min) {          // too close: push apart
          const d = Math.sqrt(d2), k = (1 - d / min) * 2.4;
          rx -= (dx / d) * k; rz -= (dz / d) * k;
        }
      }
      if (n) this.bias.set(sx / n, 0, sz / n).normalize().multiplyScalar(0.30);
      else this.bias.set(0, 0, 0);
      this.bias.x += rx; this.bias.z += rz;
      if (this.bias.lengthSq() > 1) this.bias.normalize();
    }

    // limb animation
    const crawl = this.body && this.body.crawling;
    const ws = this.body ? this.body.walkStyle : 0;
    const rate = this.speed * (crawl ? 1.2 : ws === 2 ? 3.0 : 2.4);
    const amp = crawl ? 0.7 : ws === 1 ? 0.32 : 0.45;
    const sw = Math.sin(performance.now() / 1000 * rate) * amp;
    if (crawl) {
      this.arms[0].rotation.x = -sw; this.arms[1].rotation.x = sw;   // dragging forward
    } else if (ws === 1) {
      this.legs[0].rotation.x = sw * 1.5; this.legs[1].rotation.x = sw * 0.3;  // limp
      this.arms[0].rotation.x = -sw * 0.6; this.arms[1].rotation.x = sw * 0.6;
    } else {
      this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
      this.arms[0].rotation.x = -sw * 0.7; this.arms[1].rotation.x = sw * 0.7;
    }

    // attack (never inside a safe zone)
    const playerSafe = this._inSafe(player.pos.x, player.pos.z);
    this.attackCool -= dt;
    // windup resolves into the actual blow
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0 && player.alive && !playerSafe && distP < 2.2 + this.radius) {
        player.damage(this.attackDamage * DAMAGE_SCALE);
        const kb = toPlayer.clone().normalize().multiplyScalar(-2.5);
        player.addImpulse(new THREE.Vector3(kb.x, 0, kb.z));
        if (ctx.onMelee) ctx.onMelee(this);
      }
    }

    // boss ground slam in phase 2+
    this.slamCool = Math.max(0, this.slamCool - dt);
    if (this.isBoss && this.phase >= 2 && this.slamCool <= 0 && player.alive && !playerSafe && distP < 9) {
      this.slamCool = this.phase >= 3 ? 4.5 : 7;
      if (ctx.particles) ctx.particles.explosion(this.group.position.clone(), 40);
      if (this.audio) this.audio.explosion();
      player.addShake(1.0);
      if (distP < 9) {
        player.damage(this.attackDamage * 0.6 * DAMAGE_SCALE);
        const kb = toPlayer.clone().normalize().multiplyScalar(-5);
        player.addImpulse(new THREE.Vector3(kb.x, 0, kb.z));
        if (ctx.onMelee) ctx.onMelee(this);
      }
    }

    if (player.alive && !playerSafe && !this.passive && this.attackCool <= 0) {
      if (this.t.summoner) {
        this.attackCool = 4.5;
        if (ctx.onSummon) ctx.onSummon(this);
      } else if (this.t.ranged && distP < this.t.range) {
        this.attackCool = (1.6 + Math.random()) / (this.isBoss ? 1 + (this.phase - 1) * 0.4 : 1);
        if (Math.random() < 0.55) {
          if (ctx.onProjectile) ctx.onProjectile(this);
          else { player.damage(this.attackDamage * DAMAGE_SCALE); if (ctx.onRanged) ctx.onRanged(this, player); }
        }
      } else if (distP < 1.9 + this.radius && this.windup <= 0) {
        this.windup = 0.38;                       // telegraph before the hit lands
        if (ctx.onSound && this.t.summoner) ctx.onSound(this, 'scream');
        this.attackCool = (1.0 + Math.random() * 0.5) / (this.isBoss ? 1 + (this.phase - 1) * 0.4 : 1);
      }
    }

    // hold the telegraph pose over the walk cycle
    if (this.windup > 0) { this.arms[0].rotation.x = -1.9; this.arms[1].rotation.x = -1.9; }
  }

  _inSafe(x, z) {
    for (const s of this.safeZones) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) return true;
    }
    return false;
  }

  /* Steer around obstacles: try the direct heading, then progressively wider
     turns, so enemies slide along walls instead of grinding into them. */
  _steer(to, nx, nz, p, dt, spd) {
    const STEP = 0.5;                       // ~28 degrees per try
    for (let i = 0; i <= 4; i++) {
      for (const sign of i === 0 ? [1] : [1, -1]) {
        const a = STEP * i * sign;
        const ca = Math.cos(a), sa = Math.sin(a);
        const dx = to.x * ca - to.z * sa, dz = to.x * sa + to.z * ca;
        const tx = p.x + dx * spd * dt, tz = p.z + dz * spd * dt;
        if (!this._blocked(tx, tz)) {
          this._steerSide = sign;           // remember which way we went around
          p.x = tx; p.z = tz;
          this.facing = Math.atan2(dx, dz);
          return true;
        }
      }
    }
    // Boxed in on every heading — usually because we spawned inside geometry.
    // Push toward the target regardless so we can work our way free; freezing
    // here would leave the enemy stuck forever.
    p.x += to.x * spd * dt;
    p.z += to.z * spd * dt;
    this.facing = Math.atan2(to.x, to.z);
    return false;
  }

  _blocked(x, z, out) {
    if (this._inSafe(x, z)) return true;              // can't enter a safe zone
    for (const c of this.world.collidersNear(x, z, 1.2)) {
      if (x > c.minX - this.radius && x < c.maxX + this.radius &&
          z > c.minZ - this.radius && z < c.maxZ + this.radius && c.height > 1.2) return true;
    }
    return false;
  }
}

/* ---------------- spawn director ---------------- */
export class Director {
  constructor(scene, world, opts = {}) {
    this.scene = scene; this.world = world;
    this.enemies = [];
    this.pool = opts.pool ?? ['walker', 'runner'];
    this.maxAlive = opts.maxAlive ?? 14;
    this.difficulty = 1;
    this.autoSpawn = opts.autoSpawn ?? true;
    this.spawnInterval = opts.spawnInterval ?? 2.2;
    this.safeZones = opts.safeZones ?? [];
    this.timer = 0;
    this.onSpawn = null;
    this.onDeath = null;      // (enemy) -> void, for bloaters etc.
    this.onGib = null;        // (enemy, count) -> void, body chunks
    this.onWeakBreak = null;  // (enemy) -> void, boss core destroyed
    this.onSummon = null;     // (enemy) -> void, for screamers
    this._alive = [];         // live enemies, rebuilt once a frame
    this._hittables = [];
    this._recycle = [];       // dead enemies kept for reuse
    this.recycleMax = opts.recycleMax ?? 24;
  }

  /* rebuilt once per frame so nothing downstream has to allocate a filtered list */
  refreshLists() {
    const a = this._alive || (this._alive = []);
    a.length = 0;
    const h = this._hittables || (this._hittables = []);
    h.length = 0;
    for (const e of this.enemies) if (e.alive) { a.push(e); h.push(e.group); }
    return a;
  }
  get alive() { return this._alive || this.refreshLists(); }

  /* gunfire and footsteps call this; nearby enemies come to investigate */
  makeNoise(pos, radius = 40) {
    let n = 0;
    for (const e of this.enemies) if (e.hear(pos, radius)) n++;
    return n;
  }

  /* a wandering mass that drifts toward the player as one body */
  spawnHorde(center, count, difficulty) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 2 + Math.random() * 5;
      const p = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
      const e = this.spawnAt(this.pool[(Math.random() * this.pool.length) | 0], p, difficulty);
      if (e) made.push(e);
    }
    return made;
  }

  spawnAt(typeId, pos, difficulty) {
    let e = null;
    for (let i = 0; i < this._recycle.length; i++) {
      if (this._recycle[i].type === typeId) { e = this._recycle.splice(i, 1)[0]; break; }
    }
    if (e) e.reset(typeId, pos, difficulty ?? this.difficulty);
    else e = new Enemy(typeId, pos, this.world, difficulty ?? this.difficulty);
    e.safeZones = this.safeZones;
    this.scene.add(e.group);
    this.enemies.push(e);
    if (this.onSpawn) this.onSpawn(e);
    return e;
  }

  spawnAround(player, minR = 26, maxR = 44) {
    const typeId = this.pool[(Math.random() * this.pool.length) | 0];
    let pos = this.world.spawnAround(player.pos, minR, maxR);
    for (let i = 0; i < 6; i++) {
      let bad = false;
      for (const s of this.safeZones) {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        if (dx * dx + dz * dz < (s.r + 4) * (s.r + 4)) { bad = true; break; }
      }
      if (!bad) break;
      pos = this.world.spawnAround(player.pos, minR, maxR);
    }
    return this.spawnAt(typeId, pos);
  }

  update(dt, player, ctx) {
    if (this.onSummon) ctx.onSummon = this.onSummon;
    for (const e of this.enemies) {
      e._onDeath = this.onDeath;
      e._onGib = this.onGib;
      e._onWeakBreak = this.onWeakBreak;          // bloaters explode via this hook
      e.update(dt, player, ctx);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.removeMe) continue;
      this.enemies.splice(i, 1);
      // recycle rather than reallocate: bodies and materials get reused
      if (this._recycle.length < this.recycleMax) { e.group.visible = false; this._recycle.push(e); }
      else e.dispose();
    }
    if (!this.autoSpawn) return;
    this.timer -= dt;
    const alive = this.enemies.filter((e) => e.alive).length;

    // The horde ESCALATES: more alive at once, arriving faster, and later in
    // groups. Previously the cap and interval were fixed forever, so the only
    // thing that ever changed was enemy health — it never felt like a horde.
    const d = Math.max(1, this.difficulty);
    const cap = Math.min(38, Math.round(this.maxAlive + (d - 1) * 2.2));
    const interval = Math.max(0.55, this.spawnInterval / (1 + (d - 1) * 0.16));
    if (this.timer <= 0 && alive < cap) {
      this.timer = interval;
      const burst = d >= 3 ? 1 + Math.floor((d - 2) / 3) : 1;
      for (let i = 0; i < burst && alive + i < cap; i++) this.spawnAround(player);
    }
  }

  getHittables() { return this._hittables || (this.refreshLists(), this._hittables); }

  clear() {
    for (const e of this.enemies) e.dispose();
    for (const e of this._recycle) e.dispose();
    this.enemies.length = 0;
    this._recycle.length = 0;
  }
}
