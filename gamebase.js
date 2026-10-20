// gamebase.js — shared game shell: renderer, loop, and all subsystems
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Input, ACTIONS, keyLabel } from './input.js';
import { buildCompound } from './compound.js';
import { HUD } from './hud.js';
import { Arsenal, RARITY, WEAPONS, WEAPON_TRACKS } from './weapons.js';
import { Director, ENEMY_TYPES, setDamageScale } from './ai.js';
import { LootSystem } from './loot.js';
import { Progression, ARMOUR, ARMOUR_TRACK } from './leveling.js';
import { Store } from './store.js';
import { SafeHouse } from './safehouse.js';
import { Sky } from './sky.js';
import { Settings } from './settings.js';
import { Meta } from './meta.js';
import { applyMods } from './mods.js';
import { Throwables, THROWABLES } from './throwables.js';
import { Bloom } from './postfx.js';
import { Ally } from './ally.js';
import { Vehicles } from './vehicle.js';
import { Base } from './base.js';
import { Campaign } from './campaign.js';
import { installMenus } from './menus.js';
import { installModes } from './modes.js';
import { Music } from './music.js';
import { Skyline, Traffic, Puddles, Ripples, SnowCover } from './ambience.js';
import { Particles } from './particles.js';
import { AudioManager } from './audio.js';
import { clamp, damp, lerp } from './core.js';

export class GameBase {
  constructor(canvas, cfg = {}) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.running = false;
    this.stats = { kills: 0, score: 0, time: 0 };
    this.magnetTimer = 0;
    this.focus = 100;
    this.slowmo = false;
    this.timeScale = 1;
    this._enemyTracers = [];
    this._tracerPool = [];
    this._lastHealth = 100;
    this._dead = false;
    this.debug = false;
    this.mapOpen = false;
    this._smooth = 1;
    this._leafT = 0;
    this._hudDt = 0.016;
    this.wave = { n: 0, state: 'idle', t: 3, alive: 0 };
    this.combo = 0;
    this._lastKillAt = -99;
    this._hitStop = 0;
  }

  init() {
    try {
      return this._boot();
    } catch (e) {
      this._bootError(e);
      throw e;                       // still visible in the console
    }
  }

  /* Anything that throws during boot used to leave the loading bar up forever
     with no explanation. Show what went wrong instead. */
  _bootError(e) {
    const msg = (e && e.message) || String(e);
    const el = document.getElementById('loading');
    if (!el) { console.error('[boot]', e); return; }
    el.classList.remove('done');
    el.innerHTML = '<div class="load-fail"><h2>Could not start</h2>' +
      '<p>The game failed while setting up. The technical detail is below — please report it ' +
      'with your browser and device.<br><br><code>' + msg.replace(/[<>&]/g, '') + '</code></p></div>';
    console.error('[boot]', e);
  }

  _boot() {
    // ---- drop-in content packs (fully offline: script tags register them) ----
    const mods = applyMods();
    this.mods = mods.mods;
    this.modProblems = mods.problems;
    this.modPool = mods.pool;
    if (mods.extraBiomes.length) {
      this.cfg.worldWeights = (this.cfg.worldWeights || []).concat(mods.extraBiomes);
    }
    if (mods.pool.length) {
      this.cfg.pool = (this.cfg.pool || ['walker', 'runner']).concat(mods.pool);
    }

    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.settings = new Settings();
    this._bloomEnabled = false;
    this.meta = new Meta(this.cfg.metaKey || 'ow-meta');
    this.meta.onUnlock = (a) => this.hud.achievement(a);
    this.renderer.shadowMap.enabled = this.settings.get('shadows');
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.cfg.fog ?? '#bcd4ec', 140, 520);
    this.sky = new Sky(this.scene);

    // day / night cycle (0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset)
    this.timeOfDay = this.cfg.startTime ?? 0.30;
    this.dayLength = this.cfg.dayLength ?? 300;   // seconds per full cycle
    this._c1 = new THREE.Color(); this._c2 = new THREE.Color();
    this._c3 = new THREE.Color(); this._c4 = new THREE.Color();
    this._sunDir = new THREE.Vector3(0, 1, 0);

    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 700);
    this.scene.add(this.camera);

    // lights
    const hemi = new THREE.HemisphereLight('#a8c4f0', '#33456a', 1.0); this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight('#fff2dc', 1.5);
    sun.position.set(80, 140, 60); sun.castShadow = true;
    // Shadow focus: a tighter frustum aimed where you are looking gives roughly
    // 2.5x the texel density of a wide one centred on the player, which is where
    // shadow detail actually matters. Distant geometry falls back to the fog.
    sun.shadow.mapSize.set(1536, 1536);   // 2.25x the pixels of 1024, without the memory of 2048
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 300;
    this._shadowExtent = 52;
    sun.shadow.camera.left = -this._shadowExtent; sun.shadow.camera.right = this._shadowExtent;
    sun.shadow.camera.top = this._shadowExtent; sun.shadow.camera.bottom = -this._shadowExtent;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.5;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const amb = new THREE.AmbientLight('#4a5f88', 0.8); this.scene.add(amb);
    this.amb = amb;

    // subsystems
    this.world = new World(this.scene, {
      seed: this.cfg.seed ?? 20261017,
      weights: this.cfg.worldWeights,
      clearZones: this.cfg.clearZones ?? [{ x: 0, z: 0, r: 20 }, { x: 74, z: 0, r: 16 }],
    });
    this.player = new Player(this.camera, this.world);
    // Spawn just OUTSIDE the safe zone, facing the city. Spawning dead centre
    // meant nothing could reach you and the world looked frozen.
    const sx = this.cfg.safeHouseX ?? 0, sz = this.cfg.safeHouseZ ?? 0;
    const sr = this.cfg.safeHouseRadius ?? 13;

    // A real walled compound with one gate, instead of an invisible barrier that
    // made enemies look frozen at an arbitrary line.
    this.compound = buildCompound(this.world, sx, sz, sr,
      { doorSide: 'north', gateWidth: 5.2, colour: '#5a6070' });
    const spawn = this.cfg.spawn ? new THREE.Vector3(this.cfg.spawn.x, 0, this.cfg.spawn.z)
      : new THREE.Vector3(sx, 0, sz + sr + 3.5);   // just outside the gate
    this.player.reset(spawn);
    this.spawnPos = spawn.clone();       // remembered so tests can assert it is safe
    this.player.yaw = Math.PI;          // looking away from the safe house
    this.input = new Input(canvas);
    this.input.actionLabels = this.cfg.actionLabels || null;
    this.hud = new HUD();
    this.particles = new Particles(this.scene);
    this.audio = new AudioManager();
    this.arsenal = new Arsenal(this.camera, this.scene, this.player, this.audio);
    this.loot = new LootSystem(this.scene, this.audio);
    this.progression = new Progression({ key: this.cfg.progressionKey ?? 'ow-progress',
      weaponList: ['knife', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper'] });
    this.director = new Director(this.scene, this.world, {
      pool: this.cfg.pool ?? ['walker', 'runner'],
      maxAlive: this.cfg.maxAlive ?? 14,
      autoSpawn: this.cfg.autoSpawn ?? true,
      spawnInterval: this.cfg.spawnInterval ?? 2.2,
    });
    this.store = new Store(this.scene, this.world, this.audio);

    // safe zones: the safe house is permanent, the merchant bubble appears with the vendor
    this.safeZones = [];
    this.director.safeZones = this.safeZones;
    this.safeHouse = new SafeHouse(this.scene, this.audio, {
      x: this.cfg.safeHouseX ?? 0, z: this.cfg.safeHouseZ ?? 0,
      radius: this.cfg.safeHouseRadius ?? 13,
      armory: this.cfg.armory ?? false,
      title: this.cfg.safeHouseTitle ?? 'SAFE HOUSE',
    });
    this.safeHouse.onBuy = (item) => this._onBuy(item);
    this.safeHouse.arsenal = this.arsenal;
    this.store.arsenal = this.arsenal;
    this.arsenal.progression = this.progression;

    // a satellite upgrade station a short walk from the safe house
    this.upgradeStation = new SafeHouse(this.scene, this.audio, {
      x: 74, z: 0, radius: 9, armory: false, title: 'UPGRADE STATION',
    });
    this.upgradeStation.onBuy = (item) => this._onBuy(item);
    this.upgradeStation.arsenal = this.arsenal;

    // persistence: restore saved progress and re-equip unlocked weapons
    if (this.cfg.persist && this.progression.load()) {
      for (const id of this.progression.unlocked) this.arsenal.add(id);
    }

    // starting kit (equip the last one added, so it's the pistol not the knife)
    for (const id of (this.cfg.startingWeapons ?? ['knife', 'pistol'])) {
      this.progression.unlocked.add(id);
      this.arsenal.add(id);
    }
    if (this.arsenal.slots.length) this.arsenal.switchTo(this.arsenal.slots.length - 1);

    // wiring
    this.arsenal.onHit = (e, p, dmg) => { this.hud.hitmarker(false); };
    this.arsenal.onKill = (e) => { this._onKill(e); };
    this.loot.onPickup = (type, amount, pos) => this._onPickup(type, amount, pos);
    this.progression.onLevelUp = (lvl, n) => this._onLevelUp(lvl, n);
    this.director.onSpawn = (e) => {};
    this.store.onBuy = (item) => this._onBuy(item);
    if (this.hud) this.hud.keyName = (a) => this.keyName(a);

    this.input.onPause = () => { if (!this.input.isTouch) this.pause(); };

    // initial world build around spawn
    // Build only the 3x3 core synchronously. The rest streams in within the first
    // second, which keeps first-load fast enough on a weak device.
    this.world.warmup(this.player.pos, 1);

    this._clock = new THREE.Clock();
    this._applyProgression();
    if (this.cfg.campaign) {
      this.campaign = new Campaign({ hud: this.hud, audio: this.audio, music: this.music,
        onReward: (c) => { this.progression.addCoins(c); this.meta.add('coins', c); } });
    }
    this._initExtras();
    this._bindUI();
    this._buildMenus();
    this._applySettings();
    // data tables exposed for tooling / balance analysis
    this.tables = { WEAPONS, ENEMY_TYPES, WEAPON_TRACKS, ARMOUR, ARMOUR_TRACK, ACTIONS };
    // Post-processing is created on the FIRST FRAME rather than here: compiling
    // five shaders is the slowest part of boot on a weak GPU, and there is no
    // reason to make the player stare at a loading bar for it.
    this._wantBloom = !(/(\?|&)nobloom/.test(location.search) || !this.settings.get('bloom'));
    this._bloomEnabled = false;
    this._hideLoading();
    return this;
  }

  _hideLoading() {
    // stand down the boot watchdog — we made it
    if (typeof clearTimeout === 'function' && window.__bootWatch) clearTimeout(window.__bootWatch);
    const el = document.getElementById('loading');
    if (!el) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 420);
  }

  /* ---------------- extras: music, skyline, traffic, weather, chevron ---------------- */
  _initExtras() {
    this.music = new Music(this.audio);
    this.skyline = new Skyline(this.scene);
    this.traffic = new Traffic(this.scene, this.cfg.traffic ?? 5);
    this.puddles = new Puddles(this.scene);
    this.ripples = new Ripples(this.scene);
    this.snow = new SnowCover(this.scene);

    this.lampLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffd98a', 0, 26, 2);
      l.visible = false; this.scene.add(l); this.lampLights.push(l);
    }

    // 3D chevron pointing at the current objective
    this.chevron = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 4),
      new THREE.MeshBasicMaterial({ color: '#38f2c8', transparent: true, opacity: 0.85, fog: false }));
    this.chevron.rotation.x = Math.PI;
    this.chevron.visible = false;
    this.scene.add(this.chevron);

    this._enemyShots = [];
    this._shotPool = [];
    this.waypoint = null;
    this.hud.onWaypoint = (wp) => {
      this.waypoint = wp;
      this.audio.buy();
      this.hud.notify('Waypoint set  ' + Math.round(Math.hypot(wp.x - this.player.pos.x, wp.z - this.player.pos.z)) + 'm');
    };
    // a rolling ~20s buffer of where you were, for replay
    this.replay = { buf: [], max: 1200, playing: false, idx: 0, acc: 0 };
    this._solidBuf = [];
    this._ctx = { hittables: [], enemies: [], particles: null };
    this._noHitT = 0;
    this._runStart = 0;
    this._pingRay = new THREE.Raycaster();
    this.ping = null;
    this.weather = { rain: 0, target: 0, timer: 50, lightning: 0 };

    // special enemy abilities
    this.director.onDeath = (e) => this._onEnemyDeath(e);
    this.director.onGib = (e, n) => this._gib(e, n);
    this.director.onWeakBreak = (e) => {
      this.hud.notify('CORE DESTROYED — ' + e.t.name + ' staggered', true);
      this.audio.explodeAmmo ? this.audio.explodeAmmo() : this.audio.impact('metal');
      this.particles.impact(e.group.position.clone().setY(1.8), 26, [1, 0.4, 0.6]);
      this._gib(e, 6);
      const c = 120 + Math.round(Math.random() * 120);
      this.progression.addCoins(c); this.meta.add('coins', c);
      if (this.campaign) this.campaign.bump('cores');
    };
    this.director.onSummon = (e) => this._onSummon(e);

    this.player.onStep = () => {
      this.audio.footstep(this._surface());
      this.director.makeNoise(this.player.pos, this.player.crouch > 0.5 ? 5 : 13);
    };
    this.arsenal.onShot = (pos, def) => {
      this.director.makeNoise(pos, def.silent ? 9 : 58);
      this.input.rumble(def.kind === 'shotgun' || def.kind === 'sniper' ? 0.6 : 0.25, 70);
    };
    this.arsenal.onDamage = (point, amount, kind) => this.hud.damageAt(point, amount, kind);
    this.arsenal.onHit = (enemy, point, dmg, head) => {
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      this.particles.bloodSpurt(point, dir, head ? 12 : 7);
    };
    this.arsenal.onWorldHit = (point, obj, dir) => this._onWorldHit(point, obj, dir);
    this.throwables = new Throwables(this.scene, this.world, this.player, this.audio, this.particles);
    this.vehicles = this.cfg.vehicles === false ? null : new Vehicles(this.scene, this.world, this.player, this.audio);
    this.base = new Base(this.scene, this.world, this.audio);
    this.base.setOrigin(this.player.pos);
    // restore anything already bought
    for (const id of Object.keys(this.progression.installs || {})) if (this.progression.installs[id]) this.base.install(id, { coins: Infinity, spend() {} });
    this.ally = this.cfg.ally ? new Ally(this.scene, this.world, this.player, this.audio, this.cfg.allyName || 'Rook') : null;
    this.hud.camera = this.camera;
    this.player.onLand = () => this.audio.land();
    this.arsenal.onHeadshot = () => { this.hud.headshot(); this.audio.headshot(); this.meta.add('headshots'); if (this.campaign) this.campaign.bump('headshots'); };
  }

  _surface() {
    const p = this.player.pos, S = this.world.chunkSize;
    const ch = this.world.chunks.get(Math.floor(p.x / S) + ',' + Math.floor(p.z / S));
    if (!ch) return 'road';
    if (ch.biome === 'park' || ch.biome === 'jungle') return 'grass';
    if (ch.biome === 'playground') return 'sand';
    return 'road';
  }

  _applySettings() {
    const s = this.settings;
    this.audio.setVolume(s.get('volume'));
    this.audio.muted = s.get('volume') <= 0.001;
    if (this.music) this.music.setVolume(s.get('musicVolume'));
    this.player.baseFov = s.get('fov');
    this.player.lookScale = 0.0022 * s.get('sensitivity');
    this.player.invertY = s.get('invertY');
    this.player.shakeEnabled = s.get('shake');
    this.arsenal.setTheme(s.get('weaponTheme'));
    const binds = s.get('binds');
    if (binds && this.input) Object.assign(this.input.binds, binds);
    // ---- graphics settings must take effect IMMEDIATELY ----
    // (they used to be read once at boot, so turning Shadows off did nothing)
    const wantShadows = !!s.get('shadows');
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.renderer.shadowMap.needsUpdate = true;
      this.scene.traverse((o) => { if (o.material) { const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; }); } });
    }
    const wantBloom = !/(\?|&)nobloom/.test(location.search) && !!s.get('bloom');
    if (!wantBloom) {
      this._wantBloom = false; this._bloomEnabled = false;
      if (this.bloom) { this.bloom.dispose && this.bloom.dispose(); this.bloom = null; }
    } else if (!this._wantBloom) {
      this._wantBloom = true; this._bloomTried = false;   // rebuild on the next frame
    }
    this._applyRenderScale();

    this.hud.setFpsVisible(s.get('showFps'));
    this.hud.applyVisibility({ minimap: s.get('hudMinimap'), compass: s.get('hudCompass'),
      killfeed: s.get('hudKillfeed'), credit: s.get('hudCredit'), objective: true, topbar: true });
    this.hud.setImmersive(s.get('immersive'));
    document.body.classList.toggle('one-handed', !!s.get('oneHanded'));
    this.musicStyle = s.get('musicStyle') || 'auto';
    if (this.music) {
      if (this.musicStyle === 'off') this.music.stop && this.music.stop();
      else if (this.musicStyle !== 'auto') this.music.start && this.music.start(this.musicStyle);
    }
    document.documentElement.classList.toggle('no-flash', s.get('limitFlashes'));
    // accessibility
    const rm = s.get('reducedMotion');
    this.player.shakeEnabled = s.get('shake') && !rm;
    this.player.noBob = rm;
    this.player.fovPunch = 0;
    if (rm) this.player.baseFov = s.get('fov');
    const hs = s.get('hudScale') || 1;
    document.getElementById('hud').style.zoom = hs;
    const cb = s.get('colorblind') || 'off';
    const hudEl = document.getElementById('hud');
    hudEl.classList.remove('cb-deuter', 'cb-protan', 'cb-tritan');
    if (cb !== 'off') hudEl.classList.add('cb-' + cb);
    this.difficultyScale = { story: 0.6, normal: 1, hard: 1.5, nightmare: 2.2 }[s.get('difficulty')] || 1;
    setDamageScale(this.difficultyScale);
    if (this.director) this.director.rateScale = 1 / Math.max(0.5, this.difficultyScale);
    this.renderer.shadowMap.enabled = s.get('shadows');
  }

  _bindUI() {
    const play = document.getElementById('playbtn');
    // "continue" when there is saved progress
    try {
      if (this.cfg.persist && localStorage.getItem(this.cfg.progressionKey || 'ow-progress') && play) {
        play.textContent = 'CONTINUE';
        const hi = document.querySelector('#overlay .hint');
        if (hi) hi.textContent = 'Saved progress found — continue where you left off.';
      }
    } catch (_) { /* ignore */ }
    if (play) play.addEventListener('click', () => {
      this.audio.world = this.world;
    this._baseBuffs();
    this.audio.resume();
      if (!this.player.alive || this._dead) this.respawn(); else this.start();
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      if (this.bloom) this.bloom.setSize(innerWidth, innerHeight);
    });
  }

  overlay(title, sub, hint, btn) {
    const o = document.getElementById('overlay'); if (!o) return;
    o.classList.remove('hidden');
    const h = o.querySelector('h1'); if (h && title) h.textContent = title;
    const s = o.querySelector('.sub'); if (s && sub !== undefined) s.innerHTML = sub;
    const hi = o.querySelector('.hint'); if (hi && hint !== undefined) hi.textContent = hint;
    const b = document.getElementById('playbtn'); if (b && btn) b.textContent = btn;
  }

  start() {
    document.getElementById('overlay')?.classList.add('hidden');
    if (this.pauseMenu) this.pauseMenu.classList.add('hidden');
    const pb = document.getElementById('playbtn'); if (pb) pb.style.display = '';
    this.hud.show();
    this.running = true;
    this._dead = false;
    if (this.input.isTouch) this.input.showTouch(true); else this.input.requestLock();
    this.audio.world = this.world;
    this._baseBuffs();
    this.audio.resume();
    if (this.music) this.music.start('calm');
    if (this.campaign && !this.campaign.active && !this.campaign.done) this.campaign.start();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    document.exitPointerLock?.();          // otherwise RESUME cannot be clicked
    this._uiWasOpen = true;
    this.input.showTouch(false);
    if (this.music) this.music.setMood('menu');
    this.overlay('PAUSED', this.cfg.subtitle || '', 'Click resume to continue.', 'RESUME');
    if (this.pauseMenu) this.pauseMenu.classList.remove('hidden');
    const pb = document.getElementById('playbtn'); if (pb) pb.style.display = 'none';
  }

  respawn() {
    this.director.clear();
    this.loot.clear();
    this.store.despawn();
    this.store.cooldown = 20;
    this.player.reset(new THREE.Vector3(0, 0, 0));
    this.progression.reset();
    this.arsenal.slots.length = 0;
    this.arsenal.add('knife'); this.arsenal.add('pistol');
    this.arsenal.switchTo(0);
    this.stats = { kills: 0, score: 0, time: 0 };
    this.magnetTimer = 0; this.focus = 100; this.slowmo = false;
    this.world.update(this.player.pos);
    this._applyProgression();
    this.hud.setObjective(this.cfg.objectiveMain || '', this.cfg.objectiveSub || '');
    this.start();
  }

  die() {
    if (this._dead) return;
    this._dead = true; this.running = false;
    // dying costs you a slice of your coins; insurance buys most of it back
    const keep = [0.5, 0.65, 0.8, 0.95][this.progression.insurance || 0];
    this.progression.coins = Math.floor(this.progression.coins * keep);
    this.progression.save();
    document.exitPointerLock?.();
    this.input.showTouch(false);
    if (this.pauseMenu) this.pauseMenu.classList.add('hidden');
    if (this.music) this.music.setMood('menu');
    this.hud.setPrompt(null);
    // a short orbit around where you fell, before the summary
    const look = this._killerRef && this._killerRef.group ? this._killerRef.group.position.clone() : this.player.pos.clone();
    this.killCam = { t: 0, dur: 3.4, at: this.player.pos.clone(), look };
    this.hud.banner('YOU DIED', this._lastAttacker ? 'killed by ' + this._lastAttacker : '');
    if (this.audio) this.audio.hurt();
  }

  /* drives the death orbit, then hands over to the summary */
  _updateKillCam(dt) {
    const k = this.killCam;
    if (!k) return;
    k.t += dt;
    const f = Math.min(1, k.t / k.dur);
    const a = -0.6 + f * 2.2;                       // sweep around the body
    const r = 7 - f * 2.4;
    this.camera.position.set(k.at.x + Math.sin(a) * r, k.at.y + 3.4 - f * 1.4, k.at.z + Math.cos(a) * r);
    this.camera.lookAt(k.look.x, k.look.y + 1.2, k.look.z);
    this.camera.fov = 55 - f * 6;
    this.camera.updateProjectionMatrix();
    if (f >= 1) {
      this.killCam = null;
      const run = { time: this.stats.time, kills: this.stats.kills, level: this.progression.level, score: this.stats.score };
      const record = this.meta.recordRun(run);
      this.meta.add('deaths');
      this._showRunSummary(run, record);
      this._lastAttacker = this._lastAttacker || this.cfg.killerDefault || 'an unknown attacker';
      this.overlay('YOU DIED', `You survived <b>${Math.floor(this.stats.time)}s</b>, killed <b>${this.stats.kills}</b>, scored <b>${this.stats.score}</b>.`,
        'Press respawn to try again.', 'RESPAWN');
    }
  }

  /* ---------------- progression ---------------- */
  _applyProgression() {
    const p = this.progression, pl = this.player;
    pl.maxHealth = p.maxHealth; pl.speedRun = p.runSpeed; pl.speedWalk = p.walkSpeed;
    pl.maxStamina = p.maxStamina; pl.carry = p.carry;
    pl.maxArmor = p.maxArmor; pl.armorAbsorb = p.armorAbsorb;
    if (pl.health > pl.maxHealth) pl.health = pl.maxHealth;
    if (pl.armor > pl.maxArmor) pl.armor = pl.maxArmor;
  }

  _onLevelUp(level, n) {
    this.audio.levelup();
    this.hud.notify('LEVEL ' + level + '!  +1 skill point — spend it at a Safe House', true);
    this.hud.banner('LEVEL ' + level, '+1 skill point');
    this.meta.peak('level', level);
    this.hud.levelFlash();
    this._applyProgression();
    this.player.heal(this.player.maxHealth * 0.4);
    if (this.cfg.onLevelUp) this.cfg.onLevelUp(level, n, this);
  }

  /* ---------------- combat callbacks ---------------- */
  _onKill(e) {
    this.stats.kills++;
    const now = performance.now();
    this.combo = (now - this._lastKillAt < 2500) ? this.combo + 1 : 1;
    this._lastKillAt = now;
    this._hitStop = 0.07;
    this.stats.score += e.t.xp * 10 * Math.min(5, this.combo);
    this.meta.add('kills');
    this.meta.seen(e.t.name);
    this.progression.addScrap(1 + Math.floor(Math.random() * (e.isBoss ? 25 : e.t.elite ? 6 : 3)));
    if (this.campaign) { this.campaign.bump('kills'); if (this._hordeN > 0) this.campaign.bump('hordeKills'); }
    const wp = this.arsenal.current;
    if (wp) { const tier = this.progression.addMastery(wp.def.id); if (tier > this._lastTier) { this._lastTier = tier; if (tier) this.hud.notify(`${wp.def.name} mastery ${tier}`); } }
    const ls = this.progression.perk('lifesteal');
    if (ls) this.player.heal(5 * ls);
    if (e.isBoss) { this.meta.add('bosses'); if (this.campaign) this.campaign.bump('bosses'); }
    if (this.combo > this.meta.bestCombo) this.meta.bestCombo = this.combo;
    this.meta.peak('bestCombo', this.combo);
    this.progression.addXp(e.t.xp);
    this.progression.addCoins(e.t.coins);
    this.loot.dropFrom(e);
    this.hud.hitmarker(true);
    const wpn = this.arsenal.current ? this.arsenal.current.def.name : '';
    this.hud.kill(`${e.t.name} — ${wpn}  +${e.t.xp}XP`);
    this.hud.xpFloat('+' + e.t.xp + ' XP');
    if (this.combo >= 3) this.hud.combo(this.combo);
    this.hud.xpFloat('+' + e.t.coins + '\u25c8', true);
    if (this.cfg.onKill) this.cfg.onKill(e, this);
  }

  _onPickup(type, amount, pos) {
    switch (type) {
      case 'ammo': this.arsenal.addAmmo(0.35); this.hud.notify('Ammo collected'); break;
      case 'health': this.player.heal(30); this.hud.notify('+30 HP'); break;
      case 'armor': this.player.addArmor(50); this.hud.notify('+50 Armour'); break;
      case 'coin': this.progression.addCoins(8); this.meta.add('coins', 8); break;
      case 'magnet': this.magnetTimer = 30; this.hud.notify('Loot Magnet active (30s)'); break;
      case 'upgrade': this.progression.points++; this.audio.token();
        this.hud.notify('Skill point token — spend it at a Safe House', true); break;
    }
    if (this.cfg.onPickup) this.cfg.onPickup(type, amount, pos, this);
  }

  _onBuy(item) {
    const p = this.progression;
    if (item.kind === 'weapon') {
      const id = item.key.slice(2);
      p.unlocked.add(id); this.arsenal.add(id);
      this.hud.notify(item.label + ' acquired', true);
      return true;
    }
    if (item.kind === 'ammo') { this.arsenal.addAmmo(1); return true; }
    if (item.kind === 'health') { this.player.heal(60); return true; }
    if (item.kind === 'armor') { this.player.addArmor(50); return true; }
    if (item.kind === 'armourTier') {
      const ok = p.setArmourTier(item.tier);
      if (ok) { this._applyProgression(); this.player.addArmor(p.maxArmor); }
      return ok;
    }
    if (item.kind === 'magnet') { this.magnetTimer = 30; return true; }
    if (item.kind === 'up') { p.upgrades[item.stat]++; this._applyProgression(); return true; }
    if (item.kind === 'set') {
      const ok = p.buySet(item.sid);
      if (ok) { this._applyProgression(); this.meta.add('upgrades'); }
      return ok;
    }
    if (item.kind === 'craft') { const ok = p.craft(item.rid); if (ok && this.campaign) this.campaign.bump('crafts'); return ok; }
    if (item.kind === 'install') {
      const ok = this.base.install(item.iid, p);
      if (ok) { p.save(); this._baseBuffs(); this.meta.add('upgrades'); }
      return ok;
    }
    if (item.kind === 'insurance') {
      if (p.coins < item.price) return false;
      p.insurance = Math.min(2, (p.insurance || 0) + 1);
      p.save();
      return true;
    }
    if (item.kind === 'attach') {
      const ok = p.buyAttach(item.wid, item.slot, item.aid);
      if (ok) { this.arsenal._equip(this.arsenal.index); this.meta.add('upgrades'); }
      return ok;
    }
    if (item.kind === 'perk') return p.buyPerk(item.pid);
    if (item.kind === 'prestige') {
      const ok = p.doPrestige();
      if (ok) { this._applyProgression(); this.hud.banner('PRESTIGE ' + p.prestige, 'permanent bonuses'); }
      return ok;
    }
    if (item.kind === 'wup') {
      const ok = p.upgradeWeapon(item.wid, item.track);
      if (ok) {
        this.meta.add('upgrades');
        if (this.campaign) this.campaign.bump('upgrades');
        const tr = WEAPON_TRACKS.find((t) => t.key === item.track);
        if (tr && p.weaponUpLevel(item.wid, item.track) >= tr.max) this.meta.peak('maxedTrack', 1);
      }
      return ok;
    }
    if (item.kind === 'aup') {
      const ok = p.upgradeArmor();
      if (ok) { this._applyProgression(); this.meta.add('upgrades'); this.meta.peak('armorLevel', p.armorLevel); }
      return ok;
    }
    if (item.kind === 'throwable') {
      const ok = p.spend(item.price);
      if (ok) { this.throwables.add(item.tid, item.qty || 1); }
      return ok;
    }
    if (item.kind === 'sell') { const id = item.key.slice(2); this.arsenal.remove(id); p.unlocked.delete(id); return true; }
    if (item.kind === 'respec') {
      const refund = p.upgrades.vitality + p.upgrades.speed + p.upgrades.stamina + p.upgrades.carry;
      if (refund <= 0) return false;
      p.upgrades = { vitality: 0, speed: 0, stamina: 0, carry: 0 };
      p.points += refund;
      this._applyProgression();
      this.hud.notify(`Respec — ${refund} point${refund > 1 ? 's' : ''} refunded`, true);
      return true;
    }
    return false;
  }

  /* ---------------- enemy shot tracers ---------------- */
  _enemyTracer(from, to) {
    let t = this._tracerPool.pop();
    if (!t) { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      t = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ff5b5b', transparent: true, opacity: .8 })); }
    const p = t.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, to.x, to.y, to.z); p.needsUpdate = true;
    t.material.opacity = .8; t.visible = true; this.scene.add(t);
    this._enemyTracers.push({ line: t, life: 0.12 });
    if (this._enemyTracers.length > 30) { const o = this._enemyTracers.shift(); o.line.visible = false;
      this.scene.remove(o.line); this._tracerPool.push(o.line); }
  }

  /* ---------------- weapon handling ---------------- */
  _handleWeapons(dt, dtWorld) {
    const input = this.input, ar = this.arsenal;
    // reuse buffers: this runs every frame and used to allocate three arrays
    const solids = this.world.solidsNear(this.player.pos.x, this.player.pos.z, 70, this._solidBuf);
    const ctx = this._ctx;
    ctx.hittables.length = 0;
    for (const o of solids) ctx.hittables.push(o);
    for (const o of this.director.getHittables()) ctx.hittables.push(o);
    ctx.enemies = this.director.alive;
    ctx.particles = this.particles;
    ctx.alt = this.input.altFire;
    if (input.fire) ar.fire(ctx);
    if (input.once('reload')) ar.startReload();
    if (input.once('swap') || (input.wheelDir && !this.mapOpen)) { ar.next(); input.wheelDir = 0; }
    if (input.once('melee')) {
      const ki = ar.slotOf('knife');
      if (ki >= 0) { if (ar.index !== ki) ar.switchTo(ki); ar.fire(ctx); }
    }
    for (let i = 1; i <= 6; i++) if (input.once('slot' + i)) {
      const s = ar.slots[i - 1]; if (s) ar.switchTo(i - 1);
    }
    ar.update(dt, input, dtWorld);
  }

  /* ---------------- main loop ---------------- */
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this._clock.getDelta());

    if (this.replay.playing) {
      this._updateReplay(dt);
      this._updateHud();
    } else if (this.killCam) {
      this._updateKillCam(dt);
      this._updateHud();
    } else if (this.running) {
      this.stats.time += dt;
      this.input.pollGamepad();
      this.audio.setListener(this.player.pos.x, this.player.pos.z);
      // record roughly 60 samples a second
      this.replay.acc += dt;
      if (this.replay.acc >= 1 / 60) {
        this.replay.acc = 0;
        this.replay.buf.push({ x: this.player.pos.x, y: this.player.pos.y + 1.7,
          z: this.player.pos.z, yaw: this.player.yaw, pitch: this.player.pitch });
        if (this.replay.buf.length > this.replay.max) this.replay.buf.shift();
      }
      this._updateSky(dt);
      this.hud.setUseVisible(false);

      // weapon wheel — hold Tab, steer with the mouse, release to equip
      const look = this.input.consumeLook();
      if (this.input.swapHeld && this.arsenal.slots.length > 1) {
        if (!this.wheelOpen) { this.wheelOpen = true; this._wheelLook = { x: 0, y: -60 }; }
        this._wheelLook.x += look.dx; this._wheelLook.y += look.dy;
        const n = this.arsenal.slots.length;
        let idx = Math.round(((Math.atan2(this._wheelLook.y, this._wheelLook.x) + Math.PI / 2) / (Math.PI * 2)) * n) % n;
        if (idx < 0) idx += n;
        this._wheelIdx = idx;
        this.hud.drawWheel(this.arsenal.slots, this.arsenal.index, idx);
      } else if (this.wheelOpen) {
        this.wheelOpen = false;
        this.hud.drawWheel([], 0, -1);
        if (this._wheelIdx !== undefined) this.arsenal.switchTo(this._wheelIdx);
      } else if (look.dx || look.dy) {
        this.player.addLook(look.dx, look.dy);
      }

      // bullet time
      if (this.input.once('slowmo')) {
        if (this.slowmo) this.slowmo = false;
        else if (this.focus > 12) this.slowmo = true;
      }
      if (this.input.once('mute')) this.audio.toggleMute();
      if (this.slowmo) { this.focus = Math.max(0, this.focus - 38 * dt); if (this.focus <= 0) this.slowmo = false; }
      else this.focus = Math.min(100, this.focus + 14 * dt);
      const targetTS = this.slowmo ? 0.28 : 1;
      this.timeScale = damp(this.timeScale, targetTS, 8, dt);
      // brief hit-stop on a kill for punch
      if (this._hitStop > 0) this._hitStop -= dt;
      const dtW = this.photo ? 0 : dt * this.timeScale * (this._hitStop > 0 ? 0.18 : 1);

      // player (unaffected by bullet time)
      if (!(this.vehicles && this.vehicles.driving))
        this.player.update(dt, this.input, { jump: this.input.once('jump'), crouch: this.input.crouch,
          prone: this.input.prone, leanL: this.input.leanL, leanR: this.input.leanR });
      else this.player.applyToCamera(dt);
      if (this.player.grabLock && this.input.once('melee')) this.player.breakFree();
      // crafting results are applied here, not in the shop
      const pr = this.progression;
      if (pr.pendingAmmo) { for (const sl of this.arsenal.slots) if (sl.def.mag !== Infinity) sl.reserve += pr.pendingAmmo; pr.pendingAmmo = 0; }
      if (pr.pendingHeal) { this.player.health = this.player.maxHealth; pr.pendingHeal = 0; this.hud.notify('Medkit used'); }
      if (pr.pendingThrow) { this.throwables.add('grenade', pr.pendingThrow); pr.pendingThrow = 0; }
      this.director.refreshLists();          // one pass; every consumer below reuses it
      this._handleWeapons(dt, dtW);

      // world streaming + entities (affected by bullet time)
      if (this.vehicles) {
        this.vehicles.setLights(this._night > 0.5);
        if (this.vehicles.driving) {
          // ---- driving: the key gets you OUT, and nothing else may eat it ----
          this._vehT = (this._vehT || 0) + dt;
          if (this._vehT > 0.35 && this.input.once('interact')) {
            this.vehicles.exit();
            this.player.inVehicle = false;
            this._vehT = 0;
            this.hud.setPrompt(null);
          } else {
            this.vehicles.update(dt, this.input);
          }
        } else {
          // ---- on foot: the key gets you IN, but only if a car is in range.
          //      (This used to run while driving too, swallowing the exit press.)
          this._vehT = 0;
          this.vehicles.spawnNear(this.player.pos, 2);
          const near = this.vehicles.nearest(this.player.pos);
          if (near && this.input.once('interact')) {
            this.vehicles.enter(near);
            this.player.inVehicle = true;
            this._vehT = 0;
          }
        }
      }
      this.world.update(this.player.pos);
      this._updateWorldExtras(dtW);

      const ctx = {
        onMelee: (e) => {
          if (e) {
            this._lastAttacker = e.t.name;
            this._killerRef = e;
            this.player.registerHit(e.group.position);
            const th = this.progression.perk('thorns');
            if (th) { e.damage(e.attackDamage * 0.18 * th, this.player.pos.clone(), null); if (!e.alive) this._onKill(e); }
          }
          this.hud.flashDamage(); this.hud.bloodHit(); this.audio.hurt(); this.player.addShake(0.2); this._noHitT = 0;
        },
        onGib: (e, n) => this._gib(e, n),
        onSteal: (amount) => {
          this.progression.addCoins(-Math.min(this.progression.coins, amount));
          this.hud.notify('PICKPOCKET!  -' + amount + '\u25c8', true);
          this.audio.warn();
        },
        onGrab: (e) => { this.hud.notify('GRABBED — press V to break free', true); this.audio.hurt(); this.player.addShake(0.5); },
        onRanged: (e) => {
          if (e) { this._lastAttacker = e.t.name; this._killerRef = e; }
          const from = e.group.position.clone(); from.y = 1.4;
          this._enemyTracer(from, this.camera.position.clone());
          if (e) this.player.registerHit(e.group.position);
          this.hud.flashDamage(); this.audio.hurt();
        },
        onDeath: (e) => this._onEnemyDeath(e),
        onSummon: (e) => this._onSummon(e),
        onProjectile: (e) => this._onEnemyProjectile(e),
        onSound: (e, kind) => this._enemySound(e, kind),
      };
      // Difficulty climbs quickly for the first few minutes, then keeps growing
      // but decelerating — so it never becomes impossible, and never stops rising.
      const t = this.stats.time;
      this.director.difficulty = this.cfg.difficulty ? this.cfg.difficulty(this)
        : (1 + 2.6 * (1 - Math.exp(-t / 180)) + t / 900);
      if (this.campaign && this.campaign.active) this.campaign.update(dt);
      if (this.input.once('replay')) this.toggleReplay();
      if (this.cfg.onGameplayKeys) this.cfg.onGameplayKeys(this);
      if (this.store) this.store.priceMod = this.repMod || 1;
      if (this.cfg.mode) this._updateMode(dt, dtW);
      else this.director.update(dtW, this.player, ctx);
      this._updateEnemyShots(dtW);
      this.throwables.update(dtW, this.director.alive, { onKill: (e) => this._onKill(e) });
      this._updateGibs(dtW);
      this.base.update(dtW, this.director.alive, {
        player: this.player, progression: this.progression,
        onDamage: (pos, d, kind) => this.hud.damageAt(pos, d, kind),
        onKill: (e) => this._onKill(e),
      });
      if (this.ally) this.ally.update(dtW, this.director.alive, {
        onHit: (e, dmg) => { this.hud.damageAt(e.group.position.clone().setY(e.headHeight()), dmg, 'normal'); },
        onKill: (e) => this._onKill(e),
      });

      this.loot.update(dtW, this.player, this.magnetTimer, this.stats.time);
      if (this.magnetTimer > 0) this.magnetTimer -= dt;
      this._syncSafeZones();
      this.store.update(dt, this.player, this.progression, this.input, this.hud);
      this.safeHouse.update(dt, this.player, this.progression, this.input, this.hud);
      this.upgradeStation.update(dt, this.player, this.progression, this.input, this.hud);

      // per-game logic
      if (this.cfg.onGameplay) this.cfg.onGameplay(dt, this);

      // throwables
      if (this.input.once('throwable')) this.throwables.throwFromCamera();
      if (this.input.once('cycleThrow')) { this.throwables.cycle(); this.hud.notify(THROWABLES[this.throwables.selected].name); }
      this.hud.setThrowable(THROWABLES[this.throwables.selected].name, this.throwables.count());
      if (this.ally) this.hud.setAlly(this.ally);
      this._syncPointerLock();
    this._updatePrompt();
    this.loot.baseMagnet = 2.6 + this.progression.perk('magnet') * 2.5;

      // ping
      if (this.input.once('ping')) this._placePing();

      // photo mode
      if (this.input.once('photo')) this.togglePhoto();

      // progress panel
      if (this.input.once('progress')) this.openMeta();

      // debug overlay
      if (this.input.once('debug')) { this.debug = !this.debug; this.hud.debug(this.debug ? ['...'] : null); }

      // map overlay
      if (this.input.once('map')) {
        this.mapOpen = !this.mapOpen;
        this.mapOpen ? this.hud.showMap() : this.hud.hideMap();
      }

      // damage feedback
      if (this.player.health < this._lastHealth) this.hud.flashDamage();
      this._lastHealth = this.player.health;

      if (!this.player.alive) this.die();

      this._hudDt = dt;
      this.hud.pushFrame(dt * 1000);
      if (this.meta.contractDone() && !this.meta.contract.claimed) {
        this.meta.contract.claimed = true;
        this.progression.addCoins(this.meta.contract.reward);
        this.hud.notify(`Contract complete  +${this.meta.contract.reward}\u25c8`, true);
        this.music && this.music.sting('win');
        setTimeout(() => this.meta.rollContract(), 1500);
      }
      this._noHitT += dt;
      this.meta.peak('runTime', this.stats.time);
      this.meta.peak('noHitRun', this._noHitT);
      this.meta.peak('coinsHeld', this.progression.coins);
      this.meta.peak('weaponsHeld', this.arsenal.slots.length);
      this._pois = this._collectPois();
      this._updateChevron();
      this._updateMusic(dt);
      this._updateHitDir();
      this._updateHud();
      if (this.mapOpen) {
        if (this.input.wheelDir) {
          this.hud.mapZoom = clamp(this.hud.mapZoom * (this.input.wheelDir > 0 ? 0.85 : 1.18), 0.5, 3);
          this.input.wheelDir = 0;
        }
        this.hud.drawFullMap(this.world, this.player, this._pois);
      }
      if (this.debug) this._updateDebug();
      this.hud.drawFrameGraph(this.debug);
    }

    // Before the player starts, there is nothing to interact with — render at a
    // low rate so the title screen stays responsive on a weak GPU instead of
    // pinning the main thread at full frame rate.
    if (!this.running && !this.killCam && !this.replay.playing) {
      this._idleT = (this._idleT || 0) + dt;
      if (this._idleT < 1 / 12) return;
      this._idleT = 0;
    }

    // particles + tracers run regardless (so they clear when paused)
    this.particles.update(this.timeScale * dt);
    for (let i = this._enemyTracers.length - 1; i >= 0; i--) {
      const t = this._enemyTracers[i]; t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.8;
      if (t.life <= 0) { t.line.visible = false; this.scene.remove(t.line); this._tracerPool.push(t.line);
        this._enemyTracers.splice(i, 1); }
    }

    // one-time, on the first frame, so the loading screen clears first
    if (this._wantBloom && !this._bloomTried) {
      this._bloomTried = true;
      try {
        this.bloom = new Bloom(this.renderer);
        this.bloom.setSize(innerWidth, innerHeight);
        this._bloomEnabled = true;
      } catch (e) { this._bloomEnabled = false; console.warn('[bloom]', e); }
    }

    if (this._bloomEnabled && this.bloom) {
      // ---- post-processing inputs ----
      const st = this.settings;
      // motion blur scales with how fast the view is turning and moving
      const look = Math.min(1, (Math.abs(this.player.lookVX || 0) + Math.abs(this.player.lookVY || 0)) / 12);
      const move = Math.min(1, Math.hypot(this.player.vel.x, this.player.vel.z) / 12);
      this.bloom.motion = (st.get('motionBlur') === false) ? 0
        : Math.min(0.45, look * 0.5 + move * 0.22) * (1 - this.player.zoom * 0.7);
      // depth of field tightens as you aim down sights
      this.bloom.dof = (st.get('depthOfField') === false) ? 0 : 0.35 + this.player.zoom * 0.5;
      this.bloom.matComposite.uniforms.dofCentre.value.set(0.5, 0.5);
      this.bloom.grain = st.get('filmGrain') ? 0.06 : 0;
      this.bloom.matComposite.uniforms.grain.value = this.bloom.grain;
      this.bloom.matComposite.uniforms.time.value = this.stats.time;
      this.bloom.matComposite.uniforms.wet.value = this.weather ? this.weather.rain : 0;
      // project the sun to screen space so the rays come from the right place
      if (this._sunDir) {
        const v = this._sunV || (this._sunV = new THREE.Vector3());
        v.copy(this.camera.position).addScaledVector(this._sunDir, 500).project(this.camera);
        this.bloom.sunUv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
        const night = clamp(1 - (this._daySmooth || 1) * 1.7, 0, 1);
        this.bloom.raysStrength = night > 0.5 ? 0 : Math.min(1, 0.35 + (this._daySmooth || 1) * 0.5);
      }
      this.bloom.render(this.scene, this.camera);
    }
    else this.renderer.render(this.scene, this.camera);
  }

  /* one contextual hint at a time, nearest thing first */
  /* bed and stash change how the safe house behaves */
  /* Resolution is the single most effective lever on a weak GPU, so it is a
     setting the player controls, and auto-quality may only scale DOWN from it. */
  _applyRenderScale() {
    const base = Math.min(devicePixelRatio, 2) * (this.settings.get('renderScale') || 1);
    this._renderBase = base;
    const q = this._autoScale === undefined ? 1 : this._autoScale;
    this.renderer.setPixelRatio(Math.max(0.4, base * q));
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.bloom) this.bloom.setSize(innerWidth, innerHeight);
  }

  _baseBuffs() {
    if (!this.base) return;
    this.player.regenMul = this.base.has('bed') ? 2 : 1;
  }

  /* ---------------- replay ---------------- */
  toggleReplay() {
    const r = this.replay;
    if (!r.buf.length) { this.hud.notify('Nothing recorded yet'); return; }
    r.playing = !r.playing;
    r.idx = 0;
    if (r.playing) {
      this.hud.banner('REPLAY', 'K to stop');
      this.hud.setImmersive(true);
    } else this.hud.setImmersive(this.settings.get('immersive'));
  }

  _updateReplay(dt) {
    const r = this.replay;
    if (!r.playing || !r.buf.length) return;
    r.idx += dt * 60;                       // real-time playback
    if (r.idx >= r.buf.length) { this.toggleReplay(); return; }
    const a = r.buf[Math.floor(r.idx)];
    const b = r.buf[Math.min(r.buf.length - 1, Math.floor(r.idx) + 1)];
    const f = r.idx - Math.floor(r.idx);
    this.camera.position.set(
      a.x + (b.x - a.x) * f,
      a.y + (b.y - a.y) * f,
      a.z + (b.z - a.z) * f);
    this.camera.rotation.set(a.pitch + (b.pitch - a.pitch) * f, a.yaw + (b.yaw - a.yaw) * f, 0, 'YXZ');
  }

  /* the display name of whatever key is actually bound to an action */
  keyName(action) {
    const b = this.input && this.input.binds && this.input.binds[action];
    return (b && b.length) ? keyLabel(b[0]) : '?';
  }

  /* Is any panel open? While one is, the pointer must be FREE — otherwise the
     mouse is captured by pointer lock and nothing in the UI can be clicked. */
  _uiOpen() {
    const vis = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
    return !!((this.store && this.store.open) || (this.safeHouse && this.safeHouse.open) ||
      this.mapOpen || vis('settingsmodal') || vis('metamodal') || vis('runsummary') ||
      vis('shop') || vis('bigmap'));
  }

  /* Release the pointer for menus, take it back when they close. */
  _syncPointerLock() {
    if (this.input.isTouch) return;
    const open = this._uiOpen();
    if (open === this._uiWasOpen) return;
    this._uiWasOpen = open;
    if (open) document.exitPointerLock?.();
    else if (this.running && !this.dead) this.input.requestLock();
  }

  _updatePrompt() {
    // a clear reason why nothing is attacking you
    const inZone = (this.safeZones || []).some((z) =>
      Math.hypot(z.x - this.player.pos.x, z.z - this.player.pos.z) < z.r);
    this.hud.setSafeZone(inZone);
    let text = null;
    if (this.vehicles) text = this.vehicles.promptFor(this.player.pos);
    if (!text) {
      const p = this.player.pos;
      const near = (o, r) => o && o.position && Math.hypot(o.position.x - p.x, o.position.z - p.z) < r;
      const K = this.keyName('use');
      if (this.safeHouse && near(this.safeHouse.standPos || this.safeHouse.position, 5)) text = K + '  safe house';
      else if (this.store && near(this.store.standPos || this.store.position, 5)) text = K + '  trade';
      else if (this.safeZones && this.safeZones.some((z) => Math.hypot(z.x - p.x, z.z - p.z) < z.r)) text = 'SAFE ZONE';
    }
    this.hud.setPrompt(text);
  }

  _updateHud() {
    const [a, r] = this.arsenal.ammoText();
    const p = this.progression, pl = this.player;
    this.hud.update(this._hudDt || 0.016, {
      level: p.level, coins: p.coins, points: p.points,
      health: pl.health, maxHealth: pl.maxHealth,
      armor: pl.armor, maxArmor: pl.maxArmor,
      stamina: pl.stamina, maxStamina: pl.maxStamina,
      ammo: a, reserve: r, weapon: this.arsenal.current?.def.name,
      reloading: this.arsenal.reloading,
      xp: p.xp, xpNext: p.xpToNext(),
      spread: (this.arsenal.current?.def.spread || 0) * (this.arsenal.current?.def.ch || 1),
      ammoMax: this.arsenal.current && this.arsenal.current.def.mag !== Infinity ? this.arsenal.current.def.mag : 0,
      clock: this._clockText(),
      combo: this.combo,
      weaponColor: this.arsenal.current ? (RARITY[this.arsenal.current.def.rarity] || {}).c : null,
      heat: this.arsenal.heat, overheated: this.arsenal.overheated,
      focus: this.focus, slowmo: this.slowmo,
    });
    this.hud.drawMinimap(this.world, this.player, this._pois || [], this.settings.get('rotateMap'));
    const boss = this._nearestBoss();
    this.hud.updateBoss(boss, boss ? boss.group.position.distanceTo(this.player.pos) : 0);
    this.hud.setCompass(this.player.yaw);
    this.hud.setWaypoint(this.waypoint || null);
    this.hud.setWaypointHud(this.waypoint || null, this.player);
    this.hud.setEvidence(this.evidence || 0);
    this.hud.eliteBars(this.director.alive.filter((e) => e.t.elite && e.health < e.maxHealth));
    this.hud.setSprint(this.player.stamina / this.player.maxStamina);

    // mirror the desktop "use" hint onto the touch button
    const useVisible = !this.hud.$('#usehint').classList.contains('hidden');
    this.input.setUseVisible(useVisible);
  }

  /* ---------------- day / night ---------------- */
  _updateSky(dt) {
    this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
    const t = this.timeOfDay;
    const el = Math.sin((t - 0.25) * Math.PI * 2);     // -1..1 sun elevation (sin)
    const day = clamp(el, 0, 1);
    const smooth = day * day * (3 - 2 * day);
    this._smooth = smooth;
    if (this.director) this.director.nightFactor = 1 - smooth;   // enemies push harder after dark
    const horizon = clamp(1 - Math.abs(el) / 0.5, 0, 1);
    const az = 1.05;
    const hz = Math.sqrt(Math.max(0, 1 - el * el));
    this._sunDir.set(Math.cos(az) * hz, el, Math.sin(az) * hz);

    // sky dome colours
    this._c1.copy(C_TOP_N).lerp(C_TOP_D, smooth).lerp(C_TOP_DUSK, horizon * 0.5);
    this._c2.copy(C_HOR_N).lerp(C_HOR_D, smooth).lerp(C_HOR_DUSK, horizon * 0.7);
    this._c3.copy(C_GRD_N).lerp(C_GRD_D, smooth);
    this._c4.copy(C_SUNSET).lerp(C_SUN, smooth);
    const night = clamp(1 - smooth * 1.7, 0, 1);
    this._daySmooth = smooth;                 // reused by the post-processing pass
    this._night = night;
    this.sky.update(this.camera.position, this._sunDir,
      { top: this._c1, horizon: this._c2, ground: this._c3, sun: this._c4, night });
    // the moon runs on its own ~29-day cycle
    this.sky.setMoonPhase(((this.stats.time / 480) % 29) / 29, this._sunDir, this.camera.position, night);

    // fog matches the horizon so distant geometry melts into the sky
    this.scene.fog.color.copy(this._c2);
    this.scene.fog.near = lerp(110, 170, smooth);
    this.scene.fog.far = lerp(360, 620, smooth);

    // aim the shadow frustum ahead of the player, in the direction they face
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const px = this.player.pos.x + fx * 22, pz = this.player.pos.z + fz * 22;
    this.sun.position.set(px + this._sunDir.x * 150, Math.max(25, this._sunDir.y * 150), pz + this._sunDir.z * 150);
    this.sun.target.position.set(px, 0, pz);
    this.sun.intensity = 0.16 + smooth * 2.0;
    this.sun.color.copy(this._c4);

    // fills keep the night readable — never pitch black
    this.amb.intensity = 0.62 + smooth * 0.68;
    this.amb.color.copy(C_AMB_N).lerp(C_AMB_D, smooth);
    this.hemi.intensity = 0.78 + smooth * 0.85;
    this.hemi.color.copy(C_HEMI_N).lerp(C_HEMI_D, smooth);

    // building windows glow at night, fade out by day
    this.world.setEmissive(1.6 - smooth * 1.45);
    this.renderer.toneMappingExposure = 1.28 + (1 - smooth) * 0.12;
  }

  _clockText() {
    const mins = this.timeOfDay * 24 * 60;
    const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* ---------------- points of interest ---------------- */
  _collectPois() {
    const p = this.player.pos;
    const out = [];
    const sh = this.safeHouse;
    out.push({ x: sh.pos.x, z: sh.pos.z, type: 'safehouse', label: sh.title, radius: sh.radius });
    if (this.store.active) out.push({ x: this.store.pos.x, z: this.store.pos.z, type: 'shop', label: 'Merchant', radius: 8 });
    out.push({ x: this.upgradeStation.pos.x, z: this.upgradeStation.pos.z, type: 'upgrade',
      label: 'Upgrade Station', radius: this.upgradeStation.radius });
    for (const poi of this.world.poisNear(p, 460)) out.push(poi);
    for (const e of this.director.enemies) {
      if (e.alive && e.isBoss) out.push({ x: e.group.position.x, z: e.group.position.z, type: 'boss', label: e.t.name });
    }
    if (this.ping && performance.now() - this.ping.t < 60000)
      out.push({ x: this.ping.x, z: this.ping.z, type: 'ping', label: 'Ping' });
    if (this.cfg.extraPois) this.cfg.extraPois(out, this);
    return out;
  }

  /* ---------------- world extras ---------------- */
  _updateWorldExtras(dt) {
    const p = this.player.pos, w = this.weather;

    // weather cycle
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = 75 + Math.random() * 95;
      w.target = w.target > 0.5 ? 0 : 1;
      if (w.target > 0.5) { this.hud.notify('Rain incoming'); }
    }
    w.rain = damp(w.rain, w.target, 0.45, dt);
    if (w.rain > 0.02) {
      this.audio.setRain(w.rain);
      this.particles.rain(p, Math.round(7 * w.rain));
      if (Math.random() < w.rain * 0.0016) { this.audio.thunder(); w.lightning = 1; }
    } else this.audio.setRain(0);
    w.lightning = Math.max(0, w.lightning - dt * 2);
    this.world.setWet(w.rain);
    this.world.setWindTime(this.stats.time);
    this.puddles.update(dt, p, w.rain);

    // skyline + traffic
    this.skyline.update(this.camera.position, this._c2);
    this.traffic.update(dt, p);

    // street lamps light up at night (nearest few only)
    const night = clamp(1 - this._smooth * 1.7, 0, 1);
    const lamps = night > 0.22 ? this.world.lampsNear(p, 3, 44) : [];
    for (let i = 0; i < this.lampLights.length; i++) {
      const l = this.lampLights[i], src = lamps[i];
      if (src) { l.visible = true; l.position.copy(src); l.intensity = 2.4 * night; }
      else l.visible = false;
    }

    // park / jungle leaves
    this._leafT -= dt;
    if (this._leafT <= 0) {
      this._leafT = 0.45;
      const S = this.world.chunkSize;
      const ch = this.world.chunks.get(Math.floor(p.x / S) + ',' + Math.floor(p.z / S));
      if (ch && (ch.biome === 'park' || ch.biome === 'jungle')) this.particles.leaves(p, 2);
    }

    // gentle wind bed + a per-biome ambience
    this.audio.setWind(0.3 + night * 0.25 + w.rain * 0.3);
    const S2 = this.world.chunkSize;
    const bch = this.world.chunks.get(Math.floor(p.x / S2) + ',' + Math.floor(p.z / S2));
    if (bch) this.audio.setAmbience(bch.biome);
    // weather on the ground: ripples in the rain, snow that settles
    this.ripples.update(dt, w.rain, this.player);
    this.snow.update(dt, !!bch && bch.biome === 'snow', this.player, this.world);
    this.audio.setReverb(this.world.isIndoor(this.player.pos) ? 0.85 : 0.12);

    // auto quality: nudge the render scale to hold a playable frame rate
    if (this.settings.get('autoQuality')) {
      this._qT = (this._qT || 0) + dt;
      if (this._qT > 1.5) {                       // react in 1.5s, not 3
        this._qT = 0;
        const fps = this.hud._lastFps || 60;
        const q = this._autoScale === undefined ? 1 : this._autoScale;
        let next = q;
        if (fps < 45 && q > 0.5) next = Math.max(0.5, q - 0.15);
        else if (fps > 58 && q < 1) next = Math.min(1, q + 0.1);
        if (next !== q) { this._autoScale = next; this._applyRenderScale(); }
        // at the floor and still hurting: shed shadows, then bloom
        else if (fps < 35 && q <= 0.55) {
          if (this.renderer.shadowMap.enabled && this.settings.get('shadows')) {
            this.settings.set('shadows', false);
            this.renderer.shadowMap.enabled = false;
            this.scene.traverse((o) => { if (o.material) { const m = o.material;
              (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; }); } });
            this.hud.notify('Shadows turned off to hold frame rate');
          } else if (this._bloomEnabled) { this._bloomEnabled = false; this.hud.notify('Bloom turned off to hold frame rate'); }
        }
      }
    }

    // window flicker twice a second
    this._flickT = (this._flickT || 0) - dt;
    if (this._flickT <= 0) { this._flickT = 0.5; this.world.flicker(); }
  }


  /* ---------------- positional enemy audio ---------------- */
  _enemySound(e, kind) {
    const dx = e.group.position.x - this.player.pos.x;
    const dz = e.group.position.z - this.player.pos.z;
    const near = Math.hypot(dx, dz) < 60;
    if (!near) return;
    this.audio.at(() => {
      if (kind === 'scream') this.audio.scream();
      else if (kind === 'death') this.audio.bark('death', e.t.name);
      else this.audio.bark(kind === 'surrender' ? 'surrender' : 'spot', e.t.name);
    }, dx, dz, 55);
  }

  /* ---------------- destructible props ---------------- */
  /* explosive deaths throw body chunks */
  _gib(e, n) {
    const col = new THREE.Color(e.t.color);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this._gibGeo || (this._gibGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24)),
        new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.8 + Math.random() * 0.5), flatShading: true }));
      m.position.copy(e.group.position); m.position.y += 0.9 + Math.random() * 0.5;
      m.userData.vel = new THREE.Vector3((Math.random() - .5) * 7, 3 + Math.random() * 5, (Math.random() - .5) * 7);
      m.userData.t = 2.2;
      m.userData.spin = new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      this.scene.add(m);
      (this._gibs || (this._gibs = [])).push(m);
    }
  }

  _updateGibs(dt) {
    if (!this._gibs || !this._gibs.length) return;
    for (let i = this._gibs.length - 1; i >= 0; i--) {
      const g = this._gibs[i], v = g.userData.vel;
      v.y -= 22 * dt;
      g.position.addScaledVector(v, dt);
      g.rotation.x += g.userData.spin.x * dt;
      g.rotation.y += g.userData.spin.y * dt;
      if (g.position.y < 0.12) { g.position.y = 0.12; v.y = Math.abs(v.y) * 0.24; v.x *= 0.6; v.z *= 0.6; }
      g.userData.t -= dt;
      if (g.userData.t <= 0) {
        this.scene.remove(g); g.material.dispose();
        this._gibs.splice(i, 1);
      }
    }
  }

  _onWorldHit(point, obj, dir) {
    const b = obj && obj.userData && obj.userData.breakable;
    if (!b || b.dead) return;
    b.hp -= 14;
    if (b.hp > 0) return;
    b.dead = true;
    const pos = obj.position.clone();
    if (obj.parent) obj.parent.remove(obj);
    if (b.chunk && b.collider) {
      const i = b.chunk.colliders.indexOf(b.collider);
      if (i >= 0) b.chunk.colliders.splice(i, 1);
      const j = b.chunk.solids.indexOf(obj);
      if (j >= 0) b.chunk.solids.splice(j, 1);
    }
    if (b.kind === 'glass') {
      this.audio.impact('metal');
      this.particles.impact(pos, 20, [0.75, 0.92, 1]);
      return;
    }
    if (b.kind === 'stash') {
      this.audio.buy();
      this.particles.impact(pos, 22, [1, 0.85, 0.35]);
      const coins = 45 + Math.round(Math.random() * 45);
      this.progression.addCoins(coins);
      this.meta.add('coins', coins);
      this.loot.spawn('ammo', pos);
      if (Math.random() < 0.35) this.loot.spawn('health', pos);
      this.hud.notify('Stash found  +' + coins + '\u25c8', true);
      if (this.campaign) this.campaign.bump('stashes');
      return;
    }
    if (b.kind === 'barrel') {
      this.audio.explosion();
      this.particles.explosion(pos, 34);
      this.player.addShake(0.55);
      for (const e of this.director.alive) {
        const d = e.group.position.distanceTo(pos);
        if (d < 6.5) { e.damage(95 * (1 - d / 6.5), pos, null); if (!e.alive) this._onKill(e); }
      }
      const pd = pos.distanceTo(this.player.pos);
      if (pd < 5) this.player.damage(14 * (1 - pd / 5));
    } else {
      this.audio.impact('wood');
      this.particles.impact(pos, 16, [0.72, 0.5, 0.3]);
      this.loot.spawn('ammo', pos);
      this.progression.addCoins(6);
      this.meta.add('coins', 6);
      this.hud.notify('+6◈');
    }
  }

  /* ---------------- ping ---------------- */
  _placePing() {
    const origin = new THREE.Vector3(); this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    this._pingRay.set(origin, dir); this._pingRay.far = 320;
    const hits = this._pingRay.intersectObjects(this.world.solidsNear(this.player.pos, 90), true);
    let x, z;
    if (hits.length) { x = hits[0].point.x; z = hits[0].point.z; }
    else if (dir.y < -0.01) { const t = -origin.y / dir.y; x = origin.x + dir.x * t; z = origin.z + dir.z * t; }
    else { x = origin.x + dir.x * 40; z = origin.z + dir.z * 40; }
    this.ping = { x, z, t: performance.now() };
    this.hud.notify('Ping placed');
    this.audio.ui('click');
  }

  /* ---------------- enemy projectiles ---------------- */
  _onEnemyProjectile(e) {
    // spitters leave a corrosive pool where their shot lands
    if (e && e.t && e.t.ranged && e.t.name === 'Spitter') {
      const p = e.group.position.clone();
      this.throwables.spawnPool(p, 'acid', { radius: 3.4, dps: 15, duration: 7 });
    }
    let m = this._shotPool.pop();
    if (!m) {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#a6ff8f' }));
      m.add(new THREE.PointLight('#a6ff8f', 0.8, 6));
      this.scene.add(m);
    }
    m.visible = true;
    const from = e.group.position.clone(); from.y = 1.5;
    const dir = this.camera.position.clone().sub(from).normalize();
    m.position.copy(from);
    this._enemyShots.push({ mesh: m, vel: dir.multiplyScalar(19), life: 3, dmg: e.attackDamage });
    this.audio.hiss();
  }

  _updateEnemyShots(dt) {
    for (let i = this._enemyShots.length - 1; i >= 0; i--) {
      const sh = this._enemyShots[i];
      sh.life -= dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      const pos = sh.mesh.position;
      const hitPlayer = pos.distanceTo(this.camera.position) < 1.1;
      let hitWorld = false;
      for (const c of this.world.collidersNear(pos.x, pos.z, 0.6)) {
        if (pos.x > c.minX && pos.x < c.maxX && pos.z > c.minZ && pos.z < c.maxZ && pos.y < c.height) { hitWorld = true; break; }
      }
      if (hitPlayer) {
        this.player.damage(sh.dmg);
        this.player.registerHit(pos);
        this.hud.flashDamage(); this.audio.hurt();
      }
      if (hitPlayer || hitWorld || sh.life <= 0) {
        this.particles.impact(pos, 6, [0.6, 1, 0.5]);
        sh.mesh.visible = false; this.scene.remove(sh.mesh); this._shotPool.push(sh.mesh);
        this._enemyShots.splice(i, 1);
      }
    }
  }

  /* ---------------- objective chevron ---------------- */
  _updateChevron() {
    const p = this.player.pos;
    let target = null, best = 1e9;
    const rank = { boss: 0, crime: 1, shop: 2, safehouse: 3, upgrade: 3 };
    for (const poi of this._pois) {
      const r = rank[poi.type];
      if (r === undefined) continue;
      if (r === 3 && this.progression.points <= 0) continue;
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      const score = r * 1000 + d;
      if (score < best) { best = score; target = poi; }
    }
    if (!target) { this.chevron.visible = false; return; }
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < 9) { this.chevron.visible = false; return; }
    this.chevron.visible = true;
    const y = 5.2 + Math.sin(performance.now() / 320) * 0.45;
    this.chevron.position.set(target.x, y, target.z);
    this.chevron.rotation.y += 0.02;
  }

  /* ---------------- music ---------------- */
  _updateMusic(dt) {
    if (this.musicStyle === 'off') return;
    if (!this.music) return;
    let threat = 0, boss = false;
    for (const e of this.director.enemies) {
      if (!e.alive) continue;
      const d = e.group.position.distanceTo(this.player.pos);
      if (d < 30) threat = Math.max(threat, 1 - d / 30);
      if (e.isBoss && d < 80) { boss = true; threat = 1; }
    }
    this.music.setMood(boss ? 'boss' : threat > 0.25 ? 'combat' : 'calm');
    this.music.setIntensity(threat);
  }

  /* ---------------- hit direction ---------------- */
  _updateHitDir() {
    const age = performance.now() - this.player.lastDamageAt;
    if (age > 900) { this.hud.hitDirection(null); return; }
    const rel = this.player.lastDamageDir - (this.player.yaw + Math.PI);
    this.hud.hitDirection(rel, 1 - age / 900);
  }

  /* ---------------- debug overlay ---------------- */
  _updateDebug() {
    const info = this.renderer.info, p = this.player.pos, S = this.world.chunkSize;
    this.hud.debug([
      `fps ${this.hud._lastFps || 0}   frame ${(this._hudDt * 1000).toFixed(1)}ms`,
      `pos ${p.x.toFixed(0)}, ${p.z.toFixed(0)}   chunk ${Math.floor(p.x / S)},${Math.floor(p.z / S)} (${this._surface()})`,
      `chunks ${this.world.chunks.size}   enemies ${this.director.enemies.length}   shots ${this._enemyShots.length}`,
      `draws ${info.render.calls}   tris ${(info.render.triangles / 1000).toFixed(0)}k   geoms ${info.memory.geometries}`,
      `rain ${this.weather.rain.toFixed(2)}   timeScale ${this.timeScale.toFixed(2)}   music ${this.music ? this.music.mood : '-'}`,
    ]);
  }


  _nearestBoss() {
    let best = null, bd = 90;
    for (const e of this.director.enemies) {
      if (!e.alive || !e.isBoss) continue;
      const d = e.group.position.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _syncSafeZones() {
    this.safeZones.length = 0;
    this.safeZones.push(this.safeHouse.zone);
    this.safeZones.push(this.upgradeStation.zone);
    if (this.store.active && this.store.pos)
      this.safeZones.push({ x: this.store.pos.x, z: this.store.pos.z, r: 8 });
  }

  /* ---------------- enemy special abilities ---------------- */
  _onEnemyDeath(e) {
    if (e.t.explodes) {
      const p = e.group.position.clone();
      this.particles.explosion(p, 45);
      this.audio.explosion();
      this.player.addShake(0.5);
      if (this.player.pos.distanceTo(p) < e.t.explodes.radius) this.player.damage(e.t.explodes.damage);
    }
  }

  _onSummon(e) {
    this.audio.groan();
    const p = e.group.position;
    for (let i = 0; i < 2; i++) {
      this.director.spawnAt('runner',
        new THREE.Vector3(p.x + (Math.random() - .5) * 8, 0, p.z + (Math.random() - .5) * 8));
    }
  }

}

/* reused colours for the sky cycle (avoid per-frame allocation) */
const C_TOP_N = new THREE.Color('#0b1024');
const C_TOP_D = new THREE.Color('#3f6fb5');
const C_TOP_DUSK = new THREE.Color('#2a3a6a');
const C_HOR_N = new THREE.Color('#182240');
const C_HOR_D = new THREE.Color('#bcd4ec');
const C_HOR_DUSK = new THREE.Color('#e8915a');
const C_GRD_N = new THREE.Color('#0a0e18');
const C_GRD_D = new THREE.Color('#4a5460');
const C_SUNSET = new THREE.Color('#ffb27a');
const C_SUN = new THREE.Color('#fff4e2');
const C_AMB_N = new THREE.Color('#3a4d78');
const C_AMB_D = new THREE.Color('#8fa8cc');
const C_HEMI_N = new THREE.Color('#7f9ede');
const C_HEMI_D = new THREE.Color('#bcd6ff');

// UI and mode mixins live in their own modules; attach them here
installMenus(GameBase);
installModes(GameBase);
