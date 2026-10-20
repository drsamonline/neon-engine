// music.js — generative adaptive music. Zero audio files: every note is synthesised.
import { clamp } from './core.js';

const BASE = 110;                      // A2
const ROOTS = [0, -4, 3, -2];          // i – VI – III – VII (A minor)

const MOODS = {
  menu:   { bpm: 72,  drums: 0.00, arp: 0.18, bass: 0.45, pad: 0.85, scale: [0, 3, 5, 7, 10] },
  calm:   { bpm: 84,  drums: 0.20, arp: 0.30, bass: 0.55, pad: 0.75, scale: [0, 3, 5, 7, 10] },
  combat: { bpm: 118, drums: 0.80, arp: 0.55, bass: 0.80, pad: 0.40, scale: [0, 2, 3, 7, 8] },
  boss:   { bpm: 148, drums: 1.00, arp: 0.72, bass: 1.00, pad: 0.28, scale: [0, 1, 3, 6, 8] },
};

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.mood = 'menu';
    this.target = 'menu';
    this.intensity = 0;
    this.vol = 0.4;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.playing = false;
  }

  _bus() {
    const a = this.audio;
    if (!a.ctx) return null;
    if (!this.bus) {
      this.bus = a.ctx.createGain();
      this.bus.gain.value = this.vol;
      this.bus.connect(a.master);
    }
    return this.bus;
  }

  setVolume(v) { this.vol = v; if (this.bus) this.bus.gain.value = v; }

  /* a short melodic stab — boss reveal, level up, close call */
  sting(kind = 'level') {
    const ctx = this.audio.ctx; if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    const sets = {
      level: [0, 4, 7, 12], boss: [-12, -5, 0, 3], danger: [0, 1, 6], win: [0, 7, 12, 19],
    };
    const notes = sets[kind] || sets.level;
    const base = 220;
    notes.forEach((n, i) => {
      const o = ctx.createOscillator();
      o.type = kind === 'boss' ? 'sawtooth' : 'triangle';
      o.frequency.value = base * Math.pow(2, n / 12);
      const g = ctx.createGain();
      const t = now + i * 0.075;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'boss' ? 0.16 : 0.13, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'boss' ? 0.9 : 0.5));
      o.connect(g); g.connect(this._bus() || this.audio.master);
      o.start(t); o.stop(t + 1.0);
    });
  }
  setMood(m) { if (MOODS[m]) this.target = m; }
  setIntensity(i) { this.intensity = clamp(i, 0, 1); }

  start(mood = 'menu') {
    this.audio.resume();
    if (!this.audio.ctx) return;
    this.target = mood; this.mood = mood;
    this._bus();
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.audio.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this._tick(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _tick() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.playing) return;
    this.mood = this.target;
    const m = MOODS[this.mood];
    const stepDur = 60 / m.bpm / 4;             // 16th notes
    while (this.nextTime < ctx.currentTime + 0.15) {
      this._schedule(this.step, this.nextTime, m, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  _schedule(step, t, m, stepDur) {
    const inBar = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const rootHz = BASE * Math.pow(2, ROOTS[bar] / 12);
    const e = 0.55 + this.intensity * 0.45;     // energy multiplier

    if (inBar === 0) this._pad(rootHz, t, stepDur * 16, m.pad * e);
    if (inBar % 8 === 0) this._bass(rootHz, t, m.bass * e);
    else if (inBar === 6 && this.intensity > 0.5) this._bass(rootHz, t, m.bass * e * 0.7);

    if (Math.random() < m.arp * e) {
      const deg = m.scale[(Math.random() * m.scale.length) | 0];
      const oct = Math.random() < 0.3 ? 12 : 0;
      this._arp(rootHz * 4 * Math.pow(2, (deg + oct) / 12), t, stepDur * 1.7, 0.085 * e);
    }

    const d = m.drums * e;
    if (d > 0.05) {
      if (inBar % 8 === 0) this._kick(t, 0.5 * d);
      if (inBar % 8 === 4) this._snare(t, 0.30 * d);
      if (inBar % 2 === 0 && Math.random() < 0.7) this._hat(t, 0.09 * d);
    }
  }

  /* ---- voices ---- */
  _pad(hz, t, dur, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * 0.16, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    g.connect(f); f.connect(out);
    for (const semi of [0, 3, 7]) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz * Math.pow(2, semi / 12) * 2 * Math.pow(2, det / 1200);
        o.connect(g); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }
  _bass(hz, t, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
  }
  _arp(hz, t, dur, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  _kick(t, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.24);
  }
  _snare(t, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const s = ctx.createBufferSource(); s.buffer = this.audio._noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.17);
  }
  _hat(t, gain) {
    const ctx = this.audio.ctx, out = this._bus();
    const s = ctx.createBufferSource(); s.buffer = this.audio._noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.06);
  }
}
