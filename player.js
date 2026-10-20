// player.js — first-person controller: walk/run, stamina, ADS zoom, physics
import * as THREE from 'three';
import { clamp, damp } from './core.js';

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;

    this.eye = 1.7;
    this.radius = 0.45;
    this.onGround = false;
    this.bobT = 0;

    // base stats (overridden by progression each frame)
    this.speedWalk = 6.0;
    this.speedRun = 10.5;
    this.jumpSpeed = 8.6;
    this.gravity = 26;

    this.maxHealth = 100; this.health = 100;
    this.armor = 0; this.maxArmor = 100; this.armorAbsorb = 0.5;
    this.maxStamina = 100; this.stamina = 100;
    this.carry = 6;

    this.alive = true;
    this.zoom = 0;              // 0 = hip, 1 = fully aimed
    this.zoomTarget = 0;
    this.baseFov = 78;
    this.adsFov = 42;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;

    this.crouch = 0;            // 0 = standing, 1 = fully crouched
    this.crouchTarget = 0;
    this.prone = 0;             // 0 = upright, 1 = flat on the ground
    this.proneTarget = 0;
    this.slideT = 0;            // >0 while sliding
    this.mantleT = 0;           // >0 while pulling up a ledge
    this.mantleFrom = null;
    this.mantleTo = null;
    this.lean = 0;              // -1 left .. +1 right
    this.leanTarget = 0;
    this.fovPunch = 0;          // short FOV kick when firing
    this.stepT = 0;             // footstep timer
    this.coyote = 0;            // jump grace after leaving the ground
    this.jumpBuffer = 0;        // jump pressed slightly early
    this.landDip = 0;           // camera dip on landing
    this.lookVX = 0; this.lookVY = 0;   // recent look delta, drives weapon sway
    this._cols = [];                    // reused collider buffer (no per-frame garbage)
    this.landVel = 0;           // impact speed when landing
    this.lastDamageAt = -99;
    this.lastDamageDir = 0;     // yaw of the attacker, for the hit indicator
  }

  /* jump at a chest-high ledge and pull yourself up onto it */
  /* shove off whoever has hold of you */
  breakFree() {
    if (!this.grabLock) return false;
    this.grabLock.t = Math.min(this.grabLock.t, 0.05);
    return true;
  }

  _tryMantle() {
    if (this.mantleT > 0 || !this.onGround || this.crouch > 0.5) return false;
    if (!this._wantJump) return false;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const dx = sp > 0.2 ? this.vel.x / sp : -Math.sin(this.yaw);
    const dz = sp > 0.2 ? this.vel.z / sp : -Math.cos(this.yaw);
    const px = this.pos.x + dx * 1.1, pz = this.pos.z + dz * 1.1;
    for (const c of this.world.collidersNear(px, pz, 0.6, this._cols)) {
      if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ) {
        const rise = c.height - this.pos.y;
        if (rise > 1.0 && rise < 2.3) {
          this.mantleDur = 0.42;
          this.mantleT = this.mantleDur;
          this.mantleFrom = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
          this.mantleTo = { x: px + dx * 0.7, y: c.height, z: pz + dz * 0.7 };
          this._wantJump = false;
          if (this.onVault) this.onVault();
          return true;
        }
      }
    }
    return false;
  }

  /* sprint into a waist-high obstacle and you hop it */
  _tryVault() {
    if (!this.onGround || this.crouch > 0.5) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < 3.4) return;
    const fx = this.pos.x + (this.vel.x / sp) * 0.95;
    const fz = this.pos.z + (this.vel.z / sp) * 0.95;
    for (const c of this.world.collidersNear(fx, fz, 0.5, this._cols)) {
      if (fx > c.minX && fx < c.maxX && fz > c.minZ && fz < c.maxZ
        && c.height > 0.35 && c.height <= 1.4) {
        this.vel.y = Math.sqrt(2 * this.gravity * (c.height + 0.6));
        const push = Math.min(1.8, sp * 0.3);
        this.vel.x += (this.vel.x / sp) * push;
        this.vel.z += (this.vel.z / sp) * push;
        this.onGround = false;
        this.coyote = 0;
        if (this.onVault) this.onVault();
        return;
      }
    }
  }

  /* called by the game when the player takes a hit */
  registerHit(sourcePos) {
    this.lastDamageAt = performance.now();
    if (sourcePos) {
      this.lastDamageDir = Math.atan2(sourcePos.x - this.pos.x, sourcePos.z - this.pos.z);
    }
  }

  reset(pos) {
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0; this.health = this.maxHealth;
    this.stamina = this.maxStamina; this.alive = true;
  }

  addLook(dx, dy) {
    const s = (this.lookScale ?? 0.0022) * (1 - this.zoom * 0.5);   // slower look when zoomed
    if (this.invertY) dy = -dy;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.lookVX = dx; this.lookVY = dy;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = clamp(this.pitch, -lim, lim);
  }

  addImpulse(v) { this.vel.x += v.x; this.vel.z += v.z; if (v.y) this.vel.y += v.y; }
  kick(pitch, yaw) { this.recoilPitch += pitch; this.recoilYaw += yaw; }
  addShake(a) { this.shake = Math.min(1, this.shake + a); }

  update(dt, input, opts = {}) {
    // ---- zoom / ADS ----
    this.zoomTarget = input.aim ? 1 : 0;
    this.zoom = damp(this.zoom, this.zoomTarget, 12, dt);

    // ---- crouch / prone ----
    this.proneTarget = opts.prone ? 1 : 0;
    this.prone = damp(this.prone, this.proneTarget, 8, dt);
    this.crouchTarget = (opts.crouch && !this.proneTarget) ? 1 : 0;
    this.crouch = damp(this.crouch, this.crouchTarget, 10, dt);
    // ---- lean ----
    this.leanTarget = (opts.leanR ? 1 : 0) - (opts.leanL ? 1 : 0);
    this.lean = damp(this.lean, this.leanTarget, 9, dt);

    // ---- FOV: ADS + firing punch ----
    this.fovPunch = damp(this.fovPunch, 0, 8, dt);
    const fov = this.baseFov + (this.adsFov - this.baseFov) * this.zoom - this.fovPunch;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

    if (!this.alive) { this.applyToCamera(dt); return; }

    // ---- grabbed by a brute: you can't move until you break free ----
    if (this.grabLock) {
      const g = this.grabLock;
      g.t -= dt;
      this.vel.set(0, 0, 0);
      if (g.tick === undefined) g.tick = 0;
      g.tick += dt;
      if (g.tick >= 0.4) { g.tick = 0; this.damage(g.power); if (this.onGrabBite) this.onGrabBite(); }
      if (g.t <= 0) { this.grabLock = null; if (this.onGrabEnd) this.onGrabEnd(); }
      this.applyToCamera(dt);
      return;
    }

    // ---- ledge mantle: a scripted pull-up, takes over movement while active ----
    if (this.mantleT > 0) {
      this.mantleT -= dt;
      const f = 1 - Math.max(0, this.mantleT) / this.mantleDur;
      const e = f * f * (3 - 2 * f);                       // smoothstep
      this.pos.x = this.mantleFrom.x + (this.mantleTo.x - this.mantleFrom.x) * e;
      this.pos.z = this.mantleFrom.z + (this.mantleTo.z - this.mantleFrom.z) * e;
      this.pos.y = this.mantleFrom.y + (this.mantleTo.y - this.mantleFrom.y) * e;
      this.vel.set(0, 0, 0);
      this.onGround = true;
      this.applyToCamera(dt);
      return;
    }

    // ---- movement input ----
    let fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    let str = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // analog stick takes over when it is pushed past the deadzone
    if (input.axis && (input.axis.x || input.axis.y)) {
      fwd += input.axis.y; str += input.axis.x;
    }
    const l = Math.hypot(fwd, str);
    if (l > 1) { fwd /= l; str /= l; } else if (l === 0) { fwd = 0; str = 0; }

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const dirX = -sinY * fwd + cosY * str;
    const dirZ = -cosY * fwd - sinY * str;

    // ---- stamina / run ----
    const moving = (fwd || str);
    const wantRun = input.sprint && moving && this.stamina > 1;
    if (wantRun) this.stamina = Math.max(0, this.stamina - 18 * dt);
    else this.stamina = Math.min(this.maxStamina, this.stamina + 12 * dt);
    const zoomSlow = 1 - this.zoom * 0.45;
    const crouchSlow = (1 - this.crouch * 0.55) * (1 - this.prone * 0.65);
    const target = (wantRun ? this.speedRun : this.speedWalk) * zoomSlow * crouchSlow;

    // ---- slide: crouch while sprinting at speed ----
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && opts.crouch && wantRun && speedNow > 4.2 && this.slideT <= 0) {
      this.slideT = 0.62;
      if (this.onSlide) this.onSlide();
    }
    if (this.slideT > 0) {
      this.slideT -= dt;
      const f = Math.max(0.2, this.slideT / 0.62);
      this.vel.x *= (1 - 1.1 * dt);
      this.vel.z *= (1 - 1.1 * dt);
      this.vel.x += dirX * target * f * 0.35 * dt;
      this.vel.z += dirZ * target * f * 0.35 * dt;
      this.crouch = Math.max(this.crouch, 0.9);
      if (this.slideT <= 0) this.slideT = 0;
    } else {
      const accel = this.onGround ? 14 : 4;
      this.vel.x += (dirX * target - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (dirZ * target - this.vel.z) * Math.min(1, accel * dt);
    }

    // ---- photo mode: fly freely, ignore gravity and collision ----
    if (this.flying) {
      this.vel.y = 0;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      if (opts.jump) this.pos.y += 9 * dt;
      if (opts.crouch) this.pos.y -= 9 * dt;
      this.pos.y = Math.max(0.2, this.pos.y);
      this.onGround = true;
      this.applyToCamera(dt);
      return;
    }

    // ---- jump: coyote time + input buffering so it always feels responsive ----
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    this._wantJump = !!opts.jump;
    this.jumpBuffer = opts.jump ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = this.jumpSpeed;
      this.onGround = false;
      this.coyote = 0; this.jumpBuffer = 0;
    }
    this.vel.y -= this.gravity * dt;

    // look velocity decays, used for view-model sway
    const decay = Math.exp(-11 * dt);
    this.lookVX *= decay; this.lookVY *= decay;

    // ---- integrate + collide ----
    this.pos.x += this.vel.x * dt; this._resolve('x');
    this.pos.z += this.vel.z * dt; this._resolve('z');
    const wasAir = !this.onGround;
    this.landVel = this.vel.y;
    this.pos.y += this.vel.y * dt;
    const gh = this._groundHeight();
    if (this.pos.y <= gh) { this.pos.y = gh; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    if (wasAir && this.onGround && this.landVel < -6) {
      this.landDip = Math.min(1, (-this.landVel - 6) / 16);
      if (this.onLand) this.onLand(this.landVel);
      if (this.landVel < -15) this.damage((Math.abs(this.landVel) - 15) * 2.2);   // fall damage
    }
    this.landDip = Math.max(0, this.landDip - dt * 3.2);
    if (!this._tryMantle()) this._tryVault();

    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.5) this.bobT += dt;

    // ---- slow regeneration once you have been safe for a few seconds ----
    if (performance.now() - this.lastDamageAt > 5000 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 1.4 * (this.regenMul || 1) * dt);
    }

    // ---- footsteps ----
    if (this.onGround && !wantRun && (fwd || str)) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.52; if (this.onStep) this.onStep(); }
    } else if (this.onGround && wantRun) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.33; if (this.onStep) this.onStep(); }
    }

    this.applyToCamera(dt);
  }

  /* the highest surface under our feet that we could be standing on */
  _groundHeight() {
    let h = 0;
    const r = this.radius * 0.75;
    for (const c of this.world.collidersNear(this.pos.x, this.pos.z, r + 0.6, this._cols)) {
      if (c.height > this.pos.y + 0.55) continue;        // too tall to step up from here
      if (this.pos.x > c.minX - r && this.pos.x < c.maxX + r &&
          this.pos.z > c.minZ - r && this.pos.z < c.maxZ + r) {
        if (c.height > h) h = c.height;
      }
    }
    return h;
  }

  _resolve(axis) {
    const r = this.radius, feet = this.pos.y;
    const cols = this.world.collidersNear(this.pos.x, this.pos.z, 3, this._cols);
    for (const c of cols) {
      if (feet >= c.height - 0.05) continue;
      if (this.pos.x > c.minX - r && this.pos.x < c.maxX + r &&
          this.pos.z > c.minZ - r && this.pos.z < c.maxZ + r) {
        if (axis === 'x') {
          const mid = (c.minX + c.maxX) / 2;
          this.pos.x = this.pos.x < mid ? c.minX - r : c.maxX + r; this.vel.x = 0;
        } else {
          const mid = (c.minZ + c.maxZ) / 2;
          this.pos.z = this.pos.z < mid ? c.minZ - r : c.maxZ + r; this.vel.z = 0;
        }
      }
    }
  }

  applyToCamera(dt) {
    // recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);

    const bob = (!this.noBob && this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.5)
      ? Math.sin(this.bobT * 11) * 0.045 : 0;
    const shake = this.shakeEnabled === false ? 0 : this.shake;
    const sx = (Math.random() - .5) * shake * 0.06;
    const sy = (Math.random() - .5) * shake * 0.06;

    const eyeH = this.eye - this.crouch * 0.72 - this.prone * 1.15;
    // leaning shifts the camera sideways and rolls the view
    const rx = Math.cos(this.yaw) * this.lean * 0.55;
    const rz = -Math.sin(this.yaw) * this.lean * 0.55;
    this.camera.position.set(this.pos.x + rx, this.pos.y + eyeH + bob - this.landDip * 0.34, this.pos.z + rz);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw + this.recoilYaw + sx);
    this.camera.rotateX(clamp(this.pitch + this.recoilPitch + sy - this.landDip * 0.07, -1.55, 1.55));
    if (this.lean) this.camera.rotateZ(-this.lean * 0.13);
  }

  damage(amount) {
    if (!this.alive) return false;
    // armour absorbs a share until it is depleted
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * this.armorAbsorb);
      this.armor -= absorbed; amount -= absorbed;
    }
    this.health -= amount;
    this.lastDamageAt = performance.now();
    if (this.health <= 0) { this.health = 0; this.alive = false; }
    return true;
  }
  heal(a) { this.health = Math.min(this.maxHealth, this.health + a); }
  addArmor(a) { this.armor = Math.min(this.maxArmor, this.armor + a); }
}
