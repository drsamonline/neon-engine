// audio.js — procedural sound: weapons, enemies, UI, weather, ambience.
// No audio files anywhere — every sound is synthesised at runtime.
/* per-type voice profiles — [f]requency, [d]uration, [w]aveform, [g]ain, slide [to] */
const VOICES = {
  Walker:    { spot: { f: 300, d: 0.22, w: 'sawtooth', g: 0.11, to: 210 }, death: { f: 260, d: 0.5, w: 'sawtooth', g: 0.12, to: 120 }, surrender: { f: 300, d: 0.4, w: 'triangle', g: 0.1, to: 200 } },
  Runner:    { spot: { f: 520, d: 0.13, w: 'square', g: 0.10, to: 760 }, death: { f: 480, d: 0.3, w: 'square', g: 0.11, to: 200 }, surrender: { f: 460, d: 0.3, w: 'triangle', g: 0.09, to: 240 } },
  Crawler:   { spot: { f: 700, d: 0.10, w: 'square', g: 0.09, to: 980 }, death: { f: 640, d: 0.24, w: 'square', g: 0.1, to: 260 }, surrender: { f: 600, d: 0.26, w: 'triangle', g: 0.08, to: 300 } },
  Spitter:   { spot: { f: 240, d: 0.3, w: 'sawtooth', g: 0.11, to: 180 }, death: { f: 220, d: 0.5, w: 'sawtooth', g: 0.11, to: 90 }, surrender: { f: 240, d: 0.4, w: 'triangle', g: 0.09, to: 170 } },
  Bloater:   { spot: { f: 130, d: 0.42, w: 'sawtooth', g: 0.13, to: 90 }, layer: 0.5, death: { f: 110, d: 0.7, w: 'sawtooth', g: 0.14, to: 60 }, surrender: { f: 130, d: 0.5, w: 'triangle', g: 0.1, to: 90 } },
  Screamer:  { spot: { f: 880, d: 0.5, w: 'sawtooth', g: 0.13, to: 1500 }, death: { f: 900, d: 0.6, w: 'sawtooth', g: 0.13, to: 300 }, surrender: { f: 820, d: 0.4, w: 'triangle', g: 0.1, to: 400 } },
  Brute:     { spot: { f: 95, d: 0.5, w: 'sawtooth', g: 0.16, to: 60 }, layer: 0.5, death: { f: 80, d: 0.9, w: 'sawtooth', g: 0.16, to: 40 }, surrender: { f: 95, d: 0.6, w: 'triangle', g: 0.12, to: 70 } },
  Pickpocket:{ spot: { f: 620, d: 0.09, w: 'square', g: 0.08, to: 820 }, death: { f: 560, d: 0.2, w: 'square', g: 0.09, to: 240 }, surrender: { f: 540, d: 0.3, w: 'triangle', g: 0.09, to: 260 } },
  Behemoth:  { spot: { f: 62, d: 0.9, w: 'sawtooth', g: 0.2, to: 38 }, layer: 0.5, death: { f: 55, d: 1.4, w: 'sawtooth', g: 0.2, to: 28 }, surrender: { f: 62, d: 0.8, w: 'triangle', g: 0.14, to: 44 } },
  Warlord:   { spot: { f: 180, d: 0.34, w: 'square', g: 0.13, to: 140 }, death: { f: 160, d: 0.7, w: 'square', g: 0.13, to: 70 }, surrender: { f: 180, d: 0.5, w: 'triangle', g: 0.1, to: 130 } },
  Vandal:    { spot: { f: 400, d: 0.16, w: 'square', g: 0.1, to: 560 }, death: { f: 380, d: 0.3, w: 'square', g: 0.1, to: 160 }, surrender: { f: 400, d: 0.35, w: 'triangle', g: 0.09, to: 200 } },
  Thief:     { spot: { f: 470, d: 0.12, w: 'square', g: 0.09, to: 620 }, death: { f: 440, d: 0.26, w: 'square', g: 0.1, to: 180 }, surrender: { f: 470, d: 0.32, w: 'triangle', g: 0.09, to: 220 } },
  Burglar:   { spot: { f: 350, d: 0.15, w: 'square', g: 0.1, to: 500 }, death: { f: 330, d: 0.3, w: 'square', g: 0.1, to: 150 }, surrender: { f: 350, d: 0.34, w: 'triangle', g: 0.09, to: 190 } },
  Dealer:    { spot: { f: 210, d: 0.28, w: 'sawtooth', g: 0.12, to: 160 }, death: { f: 190, d: 0.5, w: 'sawtooth', g: 0.12, to: 80 }, surrender: { f: 210, d: 0.4, w: 'triangle', g: 0.1, to: 150 } },
  Carjacker: { spot: { f: 290, d: 0.2, w: 'square', g: 0.11, to: 420 }, death: { f: 270, d: 0.36, w: 'square', g: 0.11, to: 130 }, surrender: { f: 290, d: 0.36, w: 'triangle', g: 0.1, to: 180 } },
  Kidnapper: { spot: { f: 165, d: 0.36, w: 'sawtooth', g: 0.13, to: 120 }, death: { f: 150, d: 0.6, w: 'sawtooth', g: 0.13, to: 65 }, surrender: { f: 165, d: 0.45, w: 'triangle', g: 0.11, to: 110 } },
  _default:  { spot: { f: 420, d: 0.16, w: 'sawtooth', g: 0.11, to: 640 }, death: { f: 360, d: 0.35, w: 'sawtooth', g: 0.11, to: 150 }, surrender: { f: 380, d: 0.4, w: 'triangle', g: 0.1, to: 220 } },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.6;
    this._noise = null;
    this._wind = null; this._rain = null;
    this._out = null;      // temporary bus for positional sounds
    this._amb = null;
    this._rev = null;
    this._windGain = null; this._rainGain = null;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }

  /* ---------- primitives ---------- */
  _noiseBurst({ dur = 0.12, freq = 1200, q = 1, gain = 0.5, type = 'lowpass', delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise;
    const filt = this.ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = freq * (this._outPitch || 1); filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.02);
    src.connect(filt); filt.connect(g); g.connect(this._out || this.master);
    src.start(t); src.stop(t + dur + 0.06);
  }
  _tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.2, slideTo = null, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const pf = this._outPitch || 1;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq * pf, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo * pf), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this._out || this.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* ---------- weapons ---------- */
  shot(kind = 'rifle') {
    this._ensure();
    if (kind === 'shotgun') { this._noiseBurst({ dur: 0.22, freq: 700, gain: 0.7 });
      this._tone({ freq: 120, dur: 0.18, type: 'square', gain: 0.25, slideTo: 40 }); }
    else if (kind === 'sniper') { this._noiseBurst({ dur: 0.3, freq: 500, gain: 0.8 });
      this._tone({ freq: 90, dur: 0.25, type: 'sawtooth', gain: 0.3, slideTo: 30 }); }
    else if (kind === 'pistol' || kind === 'revolver') { this._noiseBurst({ dur: 0.1, freq: 1800, gain: 0.45 }); }
    else if (kind === 'melee') { this._noiseBurst({ dur: 0.08, freq: 2400, q: 3, gain: 0.35, type: 'bandpass' }); }
    else if (kind === 'crossbow') { this._tone({ freq: 320, dur: 0.1, type: 'triangle', gain: 0.2, slideTo: 900 }); }
    else if (kind === 'lmg') { this._noiseBurst({ dur: 0.1, freq: 1300, gain: 0.5 }); }
    else if (kind === 'launcher') { this._noiseBurst({ dur: 0.35, freq: 380, gain: 0.7 });
      this._tone({ freq: 70, dur: 0.3, type: 'sawtooth', gain: 0.3, slideTo: 25 }); }
    else { this._noiseBurst({ dur: 0.11, freq: 1500, gain: 0.5 }); }
  }
  dryFire() { this._ensure(); this._noiseBurst({ dur: 0.03, freq: 3000, q: 6, gain: 0.25, type: 'bandpass' }); }
  reload() {
    this._ensure();
    this._tone({ freq: 300, dur: 0.05, type: 'square', gain: 0.15 });
    this._tone({ freq: 220, dur: 0.06, type: 'square', gain: 0.15, delay: 0.12 });
    this._noiseBurst({ dur: 0.05, freq: 2600, q: 5, gain: 0.18, type: 'bandpass', delay: 0.22 });
  }
  switchWeapon() { this._ensure(); this._tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.13, slideTo: 780 }); }
  explodeAmmo() { this._noiseBurst({ dur: 0.4, freq: 260, gain: 0.8 }); }

  /* ---------- impacts & feedback ---------- */
  hit() { this._ensure(); this._noiseBurst({ dur: 0.06, freq: 3000, q: 4, gain: 0.3, type: 'bandpass' }); }
  headshot() {
    this._ensure();
    this._tone({ freq: 1400, dur: 0.09, type: 'square', gain: 0.22 });
    this._tone({ freq: 2100, dur: 0.11, type: 'square', gain: 0.18, delay: 0.06 });
  }
  impact(kind = 'concrete') {
    this._ensure();
    if (kind === 'metal') this._noiseBurst({ dur: 0.1, freq: 3400, q: 6, gain: 0.28, type: 'bandpass' });
    else if (kind === 'wood') this._noiseBurst({ dur: 0.09, freq: 900, q: 2, gain: 0.3 });
    else this._noiseBurst({ dur: 0.08, freq: 1600, q: 2, gain: 0.26 });
  }
  hurt() { this._ensure(); this._tone({ freq: 180, dur: 0.2, type: 'sawtooth', gain: 0.25, slideTo: 80 }); }
  land() { this._ensure(); this._noiseBurst({ dur: 0.12, freq: 300, gain: 0.35 }); }
  footstep(surface = 'road') {
    this._ensure();
    const f = surface === 'grass' ? 500 : surface === 'sand' ? 700 : 1200;
    this._noiseBurst({ dur: 0.05, freq: f, q: 1.4, gain: 0.13 });
  }

  /* ---------- enemies ---------- */
  groan() { this._ensure(); this._tone({ freq: 90 + Math.random() * 40, dur: 0.5, type: 'sawtooth', gain: 0.12, slideTo: 60 }); }
  scream() {
    this._ensure();
    this._tone({ freq: 700, dur: 0.5, type: 'sawtooth', gain: 0.16, slideTo: 300 });
    this._tone({ freq: 1050, dur: 0.45, type: 'square', gain: 0.1, slideTo: 500, delay: 0.05 });
  }
  hiss() { this._ensure(); this._noiseBurst({ dur: 0.6, freq: 2600, q: 1, gain: 0.2, type: 'highpass' }); }
  bossRoar() {
    this._ensure();
    this._tone({ freq: 70, dur: 1.1, type: 'sawtooth', gain: 0.35, slideTo: 42 });
    this._noiseBurst({ dur: 0.9, freq: 300, gain: 0.4 });
    this._tone({ freq: 150, dur: 0.8, type: 'square', gain: 0.14, slideTo: 90, delay: 0.1 });
  }

  /* ---------- pickups / progression ---------- */
  pickup() { this._ensure(); this._tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.2 });
    this._tone({ freq: 990, dur: 0.09, type: 'triangle', gain: 0.2, delay: 0.07 }); }
  coin() { this._ensure(); this._tone({ freq: 1320, dur: 0.06, type: 'square', gain: 0.12 }); }
  token() {
    this._ensure();
    [880, 1170, 1560].forEach((f, i) => this._tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.16, delay: i * 0.06 }));
  }
  levelup() { this._ensure(); [523, 659, 784, 1047].forEach((f, i) =>
    this._tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.22, delay: i * 0.09 })); }
  buy() { this._ensure(); this._tone({ freq: 880, dur: 0.07, type: 'square', gain: 0.18 });
    this._tone({ freq: 1180, dur: 0.1, type: 'square', gain: 0.18, delay: 0.08 }); }
  error() { this._ensure(); this._tone({ freq: 240, dur: 0.12, type: 'square', gain: 0.2, slideTo: 150 }); }
  ui(kind = 'click') {
    this._ensure();
    if (kind === 'hover') this._tone({ freq: 900, dur: 0.03, type: 'sine', gain: 0.06 });
    else this._tone({ freq: 620, dur: 0.05, type: 'square', gain: 0.12 });
  }

  /* ---------- world ---------- */
  explosion() { this._ensure(); this._noiseBurst({ dur: 0.6, freq: 220, gain: 0.9 });
    this._tone({ freq: 70, dur: 0.5, type: 'sawtooth', gain: 0.35, slideTo: 25 }); }
  siren() { this._ensure(); this._tone({ freq: 700, dur: 0.4, type: 'sine', gain: 0.12, slideTo: 1000 });
    this._tone({ freq: 1000, dur: 0.4, type: 'sine', gain: 0.12, slideTo: 700, delay: 0.4 }); }
  thunder() {
    this._ensure();
    this._noiseBurst({ dur: 1.4, freq: 140, gain: 0.5 });
    this._tone({ freq: 55, dur: 1.2, type: 'sawtooth', gain: 0.22, slideTo: 30, delay: 0.15 });
  }
  warn() { this._ensure(); this._tone({ freq: 300, dur: 0.3, type: 'square', gain: 0.16, slideTo: 500 }); }

  /* ---------- reverb: a generated impulse, mixed in by how enclosed you are ---------- */
  _ensureReverb() {
    if (this._rev || !this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1.7);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = buf;
    const wet = ctx.createGain(); wet.gain.value = 0;
    conv.connect(wet); wet.connect(this.master);
    this.master.connect(conv);
    this._rev = { wet };
  }
  setReverb(amount) {
    this._ensureReverb();
    if (this._rev) this._rev.wet.gain.value = Math.max(0, Math.min(0.6, amount * 0.6));
  }

  /* ---------- positional audio ---------- */
  _busFor(pan, gain, occluded) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (occluded) {
      // behind a wall: roll off the highs so it reads as muffled
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 620;
      g.connect(lp); node = lp;
    }
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p); node = p;
    }
    node.connect(this.master);
    return g;
  }

  /* is there a wall between the listener and (dx, dz)? */
  _occluded(dx, dz) {
    if (!this.world) return false;
    const d = Math.hypot(dx, dz);
    const steps = Math.min(6, Math.max(1, Math.round(d / 8)));
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const x = this.px + dx * t, z = this.pz + dz * t;
      for (const c of this.world.collidersNear(x, z, 1.2, this._ocCols || (this._ocCols = []))) {
        if (c.height > 2.4 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
    }
    return false;
  }

  /* play a sound as if it came from (dx, dz) relative to the listener */
  at(fn, dx, dz, maxDist = 48, pitch = 1) {
    if (!this.ctx || this.muted) return false;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    let gain = Math.max(0, 1 - d / maxDist);
    if (gain < 0.02) return false;
    const occluded = this._occluded(dx, dz);
    if (occluded) gain *= 0.55;
    const pan = dx / Math.max(8, d);
    this._out = this._busFor(pan, gain, occluded);
    this._outPitch = pitch;
    try { fn(); } finally { this._out = null; this._outPitch = 1; }
    return true;
  }

  /* the listener position, needed for occlusion tests */
  setListener(x, z) { this.px = x; this.pz = z; }
  /* pitch a sound by how fast the source is closing on you */
  doppler(relSpeed) { return Math.max(0.7, Math.min(1.4, 1 + relSpeed * 0.05)); }

  /* ---------- barks ---------- */
  /* every enemy type gets its own throat: a base pitch, waveform and slide */
  bark(kind = 'spot', typeName = null) {
    this._ensure();
    const V = VOICES[typeName] || VOICES._default;
    const k = kind === 'surrender' ? V.surrender : kind === 'death' ? V.death : V.spot;
    this._tone({ freq: k.f, dur: k.d, type: k.w, gain: k.g, slideTo: k.to });
    // growls get a second, detuned layer so they sound like more than one tone
    if (V.layer) this._tone({ freq: k.f * V.layer, dur: k.d * 0.8, type: 'triangle', gain: k.g * 0.5, slideTo: k.to * V.layer });
  }

  /* ---------- per-biome ambience bed ---------- */
  setAmbience(kind) {
    this._ensure(); if (!this.ctx) return;
    if (this._ambKind === kind) return;
    this._ambKind = kind;
    if (!this._amb) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
      const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      this._amb = { gain: g, filt };
    }
    const p = {
      park: [900, 0.030], jungle: [1200, 0.045], plaza: [700, 0.020],
      industrial: [180, 0.035], downtown: [140, 0.030], city: [300, 0.022],
      residential: [420, 0.018], snow: [260, 0.020], desert: [340, 0.022],
      swamp: [520, 0.030], playground: [800, 0.020], school: [600, 0.018],
    }[kind] || [400, 0.018];
    this._amb.filt.frequency.value = p[0];
    this._amb.gain.gain.value = p[1];
  }

  /* ---------- continuous ambience ---------- */
  _loop(kind) {
    const ctx = this.ctx, out = this.master;
    const src = ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain(); g.gain.value = 0;
    if (kind === 'wind') { filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 0.6; }
    else { filt.type = 'highpass'; filt.frequency.value = 1200; }
    src.connect(filt); filt.connect(g); g.connect(out);
    src.start();
    return { gain: g, src };
  }
  setWind(level) {
    this._ensure(); if (!this.ctx) return;
    if (!this._wind) this._wind = this._loop('wind');
    this._wind.gain.gain.value = level * 0.16;
  }
  setRain(level) {
    this._ensure(); if (!this.ctx) return;
    if (!this._rain) this._rain = this._loop('rain');
    this._rain.gain.gain.value = level * 0.12;
  }
}
