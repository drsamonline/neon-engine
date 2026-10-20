// modes.js — alternate game modes layered on top of the normal loop.
// Installed onto GameBase.prototype.
import * as THREE from 'three';
export function installModes(GameBase) {
  Object.assign(GameBase.prototype, {
  /* ---------------- mode dispatch ---------------- */
  _updateMode(dt, dtW) {
    const m = this.cfg.mode;
    if (m === 'bossrush') this._modeBossRush(dt);
    else if (m === 'defence') this._modeDefence(dt);
    else if (m === 'extraction') this._modeExtraction(dt);
    else this._updateArena(dt, dtW);
  },

  /* ---------------- boss rush: nothing but bosses ---------------- */
  _modeBossRush(dt) {
    if (!this._br) { this._br = { n: 0, t: 5, alive: 0 }; }
    const b = this._br;
    const bosses = ['behemoth', 'warlord', 'ringleader'];
    b.alive = this.director.alive.filter((e) => e.isBoss).length;
    if (b.alive === 0) {
      b.t -= dt;
      if (b.t <= 0) {
        b.n++;
        b.t = 7;
        const id = bosses[(b.n - 1) % bosses.length];
        const diff = 1 + b.n * 0.22;
        const c = this.world.spawnAround(this.player.pos, 22, 34);
        this.director.spawnAt(id, c, diff);
        if (b.n > 1 && b.n % 3 === 0) {
          const c2 = this.world.spawnAround(this.player.pos, 24, 36);
          this.director.spawnAt(bosses[b.n % bosses.length], c2, diff * 0.85);
        }
        this.hud.banner('BOSS ' + b.n, 'incoming');
        this.audio.bossRoar();
        if (this.music) this.music.sting('boss');
      }
    }
    this.hud.setObjective(`BOSS RUSH — ${b.n} down`, b.alive ? `${b.alive} boss active` : `next in ${Math.ceil(b.t)}s`);
  },

  /* ---------------- defence: hold a beacon ---------------- */
  _modeDefence(dt) {
    if (!this._def) {
      const p = this.player.pos.clone();
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: '#2ad3ab', emissive: '#2ad3ab', emissiveIntensity: 0.6 }));
      beacon.position.set(p.x, 1.1, p.z);
      this.scene.add(beacon);
      const light = new THREE.PointLight('#2ad3ab', 2, 22); light.position.set(p.x, 3, p.z);
      this.scene.add(light);
      this._def = { beacon, light, hp: 100, max: 100, wave: 0, t: 6, state: 'idle', pos: p };
      this.hud.banner('DEFEND THE BEACON', 'keep it alive');
    }
    const d = this._def;
    const near = this.director.alive.filter((e) => e.group.position.distanceTo(d.beacon.position) < 7).length;
    if (near > 0) d.hp = Math.max(0, d.hp - near * 3.5 * dt);          // they chew on it
    d.beacon.material.emissiveIntensity = 0.35 + (d.hp / d.max) * 0.7;
    d.beacon.rotation.y += dt * 0.6;
    if (d.hp <= 0) { this.hud.banner('BEACON DESTROYED', 'defence failed'); this.die(); return; }

    if (d.state === 'idle') {
      d.t -= dt;
      if (d.t <= 0) {
        d.wave++; d.state = 'wave';
        const n = 5 + Math.floor(d.wave * 1.7);
        const diff = 1 + d.wave * 0.15;
        this.director.spawnHorde(this.world.spawnAround(d.pos, 26, 40), Math.min(22, n), diff);
        this.hud.banner('WAVE ' + d.wave, 'defend the beacon');
        this.audio.siren();
      }
    } else if (this.director.alive.length === 0) {
      const bonus = 80 + d.wave * 40;
      this.progression.addCoins(bonus); this.meta.add('coins', bonus);
      this.hud.banner('WAVE ' + d.wave + ' HELD', '+' + bonus + '\u25c8');
      if (this.music) this.music.sting('win');
      d.hp = Math.min(d.max, d.hp + 25);
      d.state = 'idle'; d.t = 9;
      if (this.campaign) this.campaign.bump('defences');
    }
    this.hud.setObjective(`DEFENCE — WAVE ${d.wave}`, `beacon ${Math.ceil(d.hp)}%`);
  },

  /* ---------------- extraction: loot, then get out ---------------- */
  _modeExtraction(dt) {
    if (!this._ex) {
      this._ex = { need: 4, got: 0, zone: null, t: 0 };
      this.hud.banner('EXTRACTION', `find ${this._ex.need} caches, then reach the LZ`);
    }
    const e = this._ex;
    if (!e.zone) {
      if (e.got >= e.need) {
        const p = this.world.spawnAround(this.player.pos, 70, 110);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.4, 6, 24),
          new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffd23a', emissiveIntensity: 0.8 }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.4, p.z);
        this.scene.add(ring);
        e.zone = { mesh: ring, x: p.x, z: p.z };
        this.hud.banner('LZ OPEN', 'get to the extraction zone');
        if (this.music) this.music.sting('win');
      }
    } else {
      const d = Math.hypot(this.player.pos.x - e.zone.x, this.player.pos.z - e.zone.z);
      e.zone.mesh.rotation.z += dt * 1.2;
      e.t += dt;
      if (d < 6) {
        const bonus = 500 + e.got * 150;
        this.progression.addCoins(bonus); this.meta.add('coins', bonus);
        this.hud.banner('EXTRACTED', '+' + bonus + '\u25c8');
        if (this.music) this.music.sting('win');
        e.got = 0; e.zone = null; e.need += 1;
        this.hud.notify('Next run needs ' + e.need + ' caches');
      }
      this.hud.setObjective('EXTRACTION', `LZ is ${Math.round(d)}m away`);
      return;
    }
    this.hud.setObjective('EXTRACTION', `caches ${e.got} / ${e.need}`);
  },

  /* ---------------- arena / wave mode ---------------- */
  _updateArena(dt, dtW) {
    const w = this.wave;
    const alive = this.director.alive.length;
    if (w.state === 'idle') {
      w.t -= dt;
      if (w.t <= 0) {
        w.n++;
        w.state = 'wave';
        const n = 4 + Math.floor(w.n * 1.6);
        const diff = 1 + w.n * 0.14;
        const c = this.world.spawnAround(this.player.pos, 26, 42);
        this.director.spawnHorde(c, Math.min(24, n), diff);
        this.hud.banner('WAVE ' + w.n, n + ' contacts');
        this.hud.setObjective(`WAVE ${w.n}`, `${n} contacts incoming`);
        this.audio.siren();
        if (this.music) this.music.sting('danger');
      }
    } else if (w.state === 'wave') {
      if (alive === 0) {
        const bonus = 60 + w.n * 35;
        this.progression.addCoins(bonus);
        this.meta.add('coins', bonus);
        this.hud.banner('WAVE ' + w.n + ' CLEARED', '+' + bonus + '\u25c8');
        this.music && this.music.sting('win');
        w.state = 'idle'; w.t = 8;
        this.hud.setObjective(`WAVE ${w.n + 1}`, `next wave in 8s`);
      } else {
        this.hud.setObjective(`WAVE ${w.n}`, `${alive} remaining`);
      }
    }
  }
  });
}
