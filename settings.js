// settings.js — persisted player settings + a reusable settings panel
import { THEMES } from './weapons.js';
import { ACTIONS, keyLabel, actionLabel } from './input.js';
/* One control for the whole graphics load. 'performance' is the default so the
   first launch runs smoothly on anything; the individual toggles below still work
   if you want to fine-tune. */
export const QUALITY_PRESETS = {
  performance: { shadows: false, bloom: false, motionBlur: false, depthOfField: false, filmGrain: false, renderScale: 1, autoQuality: true },
  balanced:    { shadows: true,  bloom: false, motionBlur: true,  depthOfField: false, filmGrain: false, renderScale: 1, autoQuality: true },
  quality:     { shadows: true,  bloom: true,  motionBlur: true,  depthOfField: true,  filmGrain: true,  renderScale: 1, autoQuality: true },
};

export const DEFAULTS = {
  sensitivity: 1.0,
  fov: 78,
  invertY: false,
  shadows: false,      // off by default so a first launch runs smoothly
  renderScale: 1,        // 0.5 = half resolution (the biggest lever on a weak GPU)
  quality: 'performance',  // performance | balanced | quality
  volume: 0.6,
  musicVolume: 0.4,
  sprintToggle: false,
  rotateMap: false,
  shake: true,
  autoQuality: true,
  showFps: true,
  weaponTheme: 'neon',
  bloom: false,
  reducedMotion: false,
  hudScale: 1.0,
  colorblind: 'off',
  difficulty: 'normal',
  subtitles: true,
  hudMinimap: true, hudCompass: true, hudKillfeed: true, hudCredit: true,
  immersive: false, limitFlashes: false,
  binds: null,          // null = the engine defaults
};

export class Settings {
  constructor(key = 'neon-settings') {
    this.key = key;
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (d) {
      Object.assign(this.data, d);
      // A save from before the quality preset existed has the heavy effects on.
      // Bring it in line with the new default once, so the first launch after
      // updating is smooth.
      if (d.quality === undefined) this.applyQuality('performance');
    }
    } catch (_) { /* ignore */ }
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (_) { /* ignore */ }
  }
  get(k) { return this.data[k]; }
  /* apply a whole quality preset at once */
  applyQuality(name) {
    const p = QUALITY_PRESETS[name];
    if (!p) return;
    for (const k of Object.keys(p)) this.data[k] = p[k];
    this.data.quality = name;
    this.save();
  }
  set(k, v) { this.data[k] = v; this.save(); }

  /* build a settings panel into a container element */
  buildPanel(onChange, input, onPreset) {
    const rows = [
      ['sensitivity', 'Look sensitivity', 'range', 0.3, 2.5, 0.05],
      ['fov', 'Field of view', 'range', 60, 110, 1],
      ['volume', 'Sound volume', 'range', 0, 1, 0.05],
      ['musicVolume', 'Music volume', 'range', 0, 1, 0.05],
      ['invertY', 'Invert look (Y)', 'bool'],
      ['sprintToggle', 'Sprint: toggle instead of hold', 'bool'],
      ['shake', 'Screen shake', 'bool'],
      ['rotateMap', 'Rotate minimap with heading', 'bool'],
      ['quality', 'Graphics preset', 'cycle', ['performance', 'balanced', 'quality']],
      ['renderScale', 'Render scale (fixes lag)', 'range', 0.5, 1, 0.05],
      ['shadows', 'Shadows', 'bool'],
      ['autoQuality', 'Auto-adjust quality', 'bool'],
      ['showFps', 'Show FPS counter', 'bool'],
      ['bloom', 'Bloom', 'bool'],
      ['reducedMotion', 'Reduce motion (no shake/bob)', 'bool'],
      ['hudScale', 'HUD size', 'range', 0.75, 1.5, 0.05],
      ['colorblind', 'Colour-blind palette', 'cycle', ['off', 'deuter', 'protan', 'tritan']],
      ['difficulty', 'Difficulty', 'cycle', ['story', 'normal', 'hard', 'nightmare']],
      ['subtitles', 'Enemy callouts', 'bool'],
      ['hudMinimap', 'Show minimap', 'bool'],
      ['hudCompass', 'Show compass', 'bool'],
      ['hudKillfeed', 'Show kill feed', 'bool'],
      ['hudCredit', 'Show credit line', 'bool'],
      ['immersive', 'Immersive (hide HUD)', 'bool'],
      ['limitFlashes', 'Limit screen flashes', 'bool'],
      ['musicStyle', 'Music', ['auto', 'calm', 'combat', 'off']],
      ['motionBlur', 'Motion blur', 'bool'],
      ['depthOfField', 'Depth of field', 'bool'],
      ['filmGrain', 'Film grain', 'bool'],
      ['oneHanded', 'One-handed layout', 'bool'],
      ['weaponTheme', 'Weapon colour', 'cycle'],
    ];
    const el = document.createElement('div');
    el.className = 'settings-grid';

    // ---- key bindings, generated from the action table so an action cannot be
    //      missing from this panel or duplicated in it ----
    if (input) {
      const head = document.createElement('div');
      head.className = 'set-head';
      const missing = input.unbound();
      head.innerHTML = 'CONTROLS <small>click a key to change it</small>' +
        (missing.length ? ' <b class="set-warn">' + missing.length + ' unbound</b>' : '');
      el.appendChild(head);

      let group = '';
      for (const a of ACTIONS) {
        if (a.group !== group) {
          group = a.group;
          const g = document.createElement('div');
          g.className = 'set-subhead'; g.textContent = group;
          el.appendChild(g);
        }
        const row = document.createElement('div');
        row.className = 'set-row';
        const lab = document.createElement('span');
        lab.className = 'set-label'; lab.textContent = actionLabel(a, input.actionLabels);
        const btn = document.createElement('button');
        btn.className = 'btn xs keybind';
        if (a.mouse !== undefined) {
          btn.textContent = a.mouse === 0 ? 'Mouse 1' : 'Mouse 2';
          btn.disabled = true;                       // mouse buttons stay fixed
          btn.title = 'Mouse buttons are not rebindable';
        } else {
          const codes = input.binds[a.id] || [];
          btn.textContent = codes.length ? keyLabel(codes[0]) : 'UNBOUND';
          if (!codes.length) btn.classList.add('unbound');
          btn.onclick = () => {
            btn.textContent = 'press a key…';
            btn.classList.add('listening');
            input.startRebind(a.id);
          };
        }
        row.appendChild(lab); row.appendChild(btn);
        el.appendChild(row);
      }
    }

    for (const [key, label, kind, a, b, step] of rows) {
      const opts0 = Array.isArray(a) ? a : null;
      const row = document.createElement('div');
      row.className = 'set-row';
      if (kind === 'cycle') {
        const opts = (opts0 && opts0.length) ? opts0 : Object.keys(THEMES);
        const show = (v) => (THEMES[v] ? THEMES[v].name : v.charAt(0).toUpperCase() + v.slice(1));
        row.innerHTML = `<label>${label}</label>
          <button class="set-toggle on" style="grid-column:2 / span 2">${show(this.get(key))}</button>`;
        const btn = row.querySelector('.set-toggle');
        btn.addEventListener('click', () => {
          const i = (opts.indexOf(this.get(key)) + 1) % opts.length;
          this.set(key, opts[i]);
          btn.textContent = show(opts[i]);
          if (onChange) onChange(key, opts[i]);
          if (onPreset) onPreset(key, opts[i]);
        });
      } else if (kind === 'bool') {
        row.innerHTML = `<label>${label}</label>
          <button class="set-toggle ${this.get(key) ? 'on' : ''}">${this.get(key) ? 'ON' : 'OFF'}</button>`;
        const btn = row.querySelector('.set-toggle');
        btn.addEventListener('click', () => {
          const v = !this.get(key);
          this.set(key, v);
          btn.classList.toggle('on', v); btn.textContent = v ? 'ON' : 'OFF';
          if (onChange) onChange(key, v);
        });
      } else {
        row.innerHTML = `<label>${label}</label>
          <input type="range" min="${a}" max="${b}" step="${step}" value="${this.get(key)}">
          <span class="set-val">${this.get(key)}</span>`;
        const inp = row.querySelector('input');
        const val = row.querySelector('.set-val');
        inp.addEventListener('input', () => {
          const v = parseFloat(inp.value);
          this.set(key, v); val.textContent = v;
          if (onChange) onChange(key, v);
        });
      }
      el.appendChild(row);
    }
    return el;
  }
}
