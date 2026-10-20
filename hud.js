// hud.js — shared HUD: bars, minimap, full map, POIs, boss bar, compass, debug
const POI_STYLE = {
  safehouse: { c: '#38f2c8', s: 'square', n: 5, label: 'Safe House' },
  shop: { c: '#ffd23a', s: 'square', n: 4, label: 'Merchant' },
  upgrade: { c: '#8affd8', s: 'diamond', n: 4, label: 'Upgrade Station' },
  boss: { c: '#ff2d55', s: 'star', n: 7, label: 'Boss' },
  crime: { c: '#ff2d55', s: 'ring', n: 6, label: 'Crime' },
  surrender: { c: '#ffd23a', s: 'dot', n: 4, label: 'Surrendered' },
  ping: { c: '#ff9ecb', s: 'star', n: 6, label: 'Ping' },
  downtown: { c: '#a78bfa', s: 'diamond', n: 4, label: 'Downtown' },
  residential: { c: '#7dd3fc', s: 'diamond', n: 3, label: 'Residential' },
  industrial: { c: '#94a3b8', s: 'diamond', n: 3, label: 'Industrial' },
  park: { c: '#4ade80', s: 'diamond', n: 3, label: 'Park' },
  school: { c: '#6ab0ff', s: 'diamond', n: 3, label: 'School' },
  playground: { c: '#facc15', s: 'diamond', n: 3, label: 'Playground' },
  plaza: { c: '#c8a86a', s: 'diamond', n: 3, label: 'Plaza' },
  desert: { c: '#e0c078', s: 'diamond', n: 3, label: 'Wastes' },
  snow: { c: '#dbe9f7', s: 'diamond', n: 3, label: 'Frozen Ground' },
  swamp: { c: '#7a8a4a', s: 'diamond', n: 3, label: 'Marsh' },
  loot: { c: '#38f2c8', s: 'dot', n: 2 },
  stash: { c: '#ffb03a', s: 'square', n: 5, label: 'Cache' },
  enemy: { c: '#ff4d4d', s: 'dot', n: 3 },
};
/* map filter categories — the legend toggles these */
const POI_CATEGORY = {
  safehouse: 'safe', shop: 'safe', upgrade: 'safe',
  loot: 'loot', stash: 'loot', crate: 'loot',
  boss: 'threat', enemy: 'threat', crime: 'threat', ping: 'threat',
};

const LABELLED = new Set(['safehouse', 'shop', 'upgrade', 'boss', 'crime', 'ping', 'stash']);
const BIOME_FILL = {
  downtown: 'rgba(167,139,250,.30)', residential: 'rgba(125,211,252,.22)',
  industrial: 'rgba(148,163,184,.22)', city: 'rgba(120,140,170,.22)',
  park: 'rgba(74,222,128,.26)', jungle: 'rgba(34,197,94,.26)',
  playground: 'rgba(250,204,21,.22)', school: 'rgba(106,176,255,.24)',
  plaza: 'rgba(200,168,106,.24)', desert: 'rgba(224,192,120,.26)',
  snow: 'rgba(219,233,247,.28)', swamp: 'rgba(122,138,74,.28)',
};
const ROAD_BIOMES = new Set(['city', 'downtown', 'residential', 'industrial']);
const CARDINALS = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];

function shape(ctx, s, x, y, n) {
  if (s === 'square') ctx.fillRect(x - n, y - n, n * 2, n * 2);
  else if (s === 'ring') { ctx.beginPath(); ctx.arc(x, y, n + 2, 0, 7); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.stroke(); }
  else if (s === 'diamond') { ctx.beginPath(); ctx.moveTo(x, y - n); ctx.lineTo(x + n, y); ctx.lineTo(x, y + n); ctx.lineTo(x - n, y); ctx.closePath(); ctx.fill(); }
  else if (s === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? n * 0.45 : n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  } else { ctx.beginPath(); ctx.arc(x, y, n, 0, 7); ctx.fill(); }
}

export class HUD {
  constructor() {
    this._build();
    this._fpsAcc = 0; this._fpsN = 0; this._lastFps = 0;
    this.mapZoom = 1;
    this.mapFilter = { safe: true, loot: true, threat: true, terrain: true };
    this.waypoint = null;
    this.onWaypoint = null;
  }

  _build() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="crosshair">
        <span class="t up"></span><span class="t dn"></span>
        <span class="t lf"></span><span class="t rt"></span><span class="dot"></span>
      </div>
      <div id="hitmarker"></div>
      <div id="hitdir"></div>
      <div id="compass"><canvas id="compassc" width="320" height="26"></canvas></div>
      <div id="topbar">
        <div class="pill"><span class="lbl">LV</span><span class="val" id="hud-level">1</span></div>
        <div class="pill gold"><span class="lbl">COINS</span><span class="val" id="hud-coins">0</span></div>
        <div class="pill pts hidden" id="pill-pts"><span class="lbl">PTS</span><span class="val" id="hud-points">0</span></div>
        <div class="pill"><span class="lbl">TIME</span><span class="val" id="hud-clock">--:--</span></div>
        <div class="pill" id="pill-fps"><span class="lbl">FPS</span><span class="val" id="hud-fps">0</span></div>
      </div>
      <div id="centertop">
        <div id="objective" aria-live="polite" aria-label="Objective"></div>
        <div id="bossbar" class="hidden"><div id="bossname">BOSS</div><div class="bbar"><i id="bossfill"></i></div></div>
        <div id="safezone" class="hidden">SAFE ZONE — enemies cannot reach you here</div>
        <div id="waypoint" class="hidden"></div>
        <div id="evidence" class="hidden"></div>
        <div id="notif"></div>
      </div>
      <div id="banner" class="hidden"></div>
      <div id="killfeed" role="log" aria-live="polite" aria-label="Notifications"></div>
      <div id="wheel" class="hidden"></div>
      <div id="dmgwrap"></div>
      <div id="elitebars"></div>
      <div id="scope" class="hidden"></div>
      <div id="wanted" class="hidden"></div>
      <div id="ally" class="hidden"></div>
      <div id="throwable"><b id="th-count">0</b><span id="th-name">—</span></div>
      <div id="achtoast"></div>
      <div id="runsummary" class="hidden"></div>
      <div id="minimap-wrap"><canvas id="minimap" width="176" height="176"></canvas><div id="mm-label">M · MAP</div></div>
      <div id="bottomleft">
        <div class="bar hp"><i id="hud-hp"></i><span id="hud-hpt">100</span></div>
        <div class="bar ar"><i id="hud-ar"></i><span id="hud-art">0</span></div>
        <div class="bar st"><i id="hud-st"></i><span id="hud-stt">100</span></div>
        <div class="bar bt"><i id="hud-bt"></i><span id="hud-btt">100</span></div>
      </div>
      <div id="bottomright">
        <div id="weaponname">—</div>
        <div class="ammo"><span id="ammo">0</span><span class="slash">/</span><span id="reserve">0</span></div>
        <div id="heatwrap" class="hidden"><i id="heatfill"></i></div>
        <div id="reloading" class="hidden">RELOADING…</div>
      </div>
      <div id="xpwrap">
        <div id="xptop"><span id="hud-lvl2">LV 1</span><span id="hud-xpt">0 / 100 XP</span></div>
        <div id="xpbar"><div id="xpfill"></div></div>
      </div>
      <div id="combo" class="hidden"></div>
      <div id="xpfloats"></div>
      <div id="levelflash"></div>
      <div id="credit">Neon Engine &middot; created by Dr. Sohil Momin</div>
      <div id="bullettime"></div>
      <div id="damageflash"></div>
      <div id="bloodhit"></div>
      <div id="lowhealth"></div>
      <div id="centerbottom">
        <div id="prompt" class="hidden"></div>
        <div id="usehint" class="hidden">PRESS F</div>
      </div>
      <canvas id="framegraph" width="260" height="58" class="hidden"></canvas>
      <pre id="debug" class="hidden"></pre>`;
    document.body.appendChild(hud);
    this.el = hud;
    this.$ = (s) => hud.querySelector(s);
    this.mm = hud.querySelector('#minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.comp = hud.querySelector('#compassc');
    this.compCtx = this.comp.getContext('2d');
    this.objEl = this.$('#objective');
    this.bossEl = this.$('#bossbar');
    this.dirEl = this.$('#hitdir');

    const map = document.createElement('div');
    map.id = 'bigmap'; map.className = 'hidden';
    map.setAttribute('role', 'dialog'); map.setAttribute('aria-label', 'Sector map');
    map.innerHTML = `<div class="map-inner"><canvas id="bigcanvas" width="900" height="620"></canvas>
      <div class="map-legend" id="map-legend"></div>
      <div class="map-title">SECTOR MAP <span>M close · scroll to zoom · middle-click to ping</span></div></div>`;
    document.body.appendChild(map);
    this.mapEl = map;
    this.big = map.querySelector('#bigcanvas');
    this.bigCtx = this.big.getContext('2d');
    this._legendBuilt = false;
    // click the map to drop a waypoint
    this.big.addEventListener('click', (e) => {
      if (!this._lastPlayer) return;
      const r = this.big.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (this.big.width / r.width);
      const cy = (e.clientY - r.top) * (this.big.height / r.height);
      const wp = this.fullMapToWorld(cx, cy, this._lastPlayer);
      if (this.onWaypoint) this.onWaypoint(wp);
    });
  }

  show() { this.el.classList.remove('hidden'); }

  /* per-element visibility, and a hide-everything immersive mode */
  applyVisibility(opts = {}) {
    const set = (sel, on) => { const el = this.$(sel); if (el) el.classList.toggle('hidden', on === false); };
    set('#minimap-wrap', opts.minimap);
    set('#compass', opts.compass);
    set('#killfeed', opts.killfeed);
    set('#credit', opts.credit);
    set('#objective', opts.objective);
    set('#topbar', opts.topbar);
  }
  setImmersive(on) { this._immersive = !!on; this.el.classList.toggle('immersive', !!on); }
  hide() { this.el.classList.add('hidden'); }
  /* ---------- map filter + waypoints ---------- */
  toggleCategory(cat) {
    this.mapFilter[cat] = !this.mapFilter[cat];
    this._legendBuilt = false;                      // rebuild so the state shows
    return this.mapFilter[cat];
  }
  _catVisible(type) {
    const c = POI_CATEGORY[type];
    if (!c) return this.mapFilter.terrain !== false;
    return this.mapFilter[c] !== false;
  }

  /* screen point on the full map -> world position (the map is north-up) */
  fullMapToWorld(cx, cy, player) {
    const W = this.big.width, H = this.big.height;
    const R = 300 / this.mapZoom, sc = Math.min(W, H) / (R * 2);
    return { x: player.pos.x + (cx - W / 2) / sc, z: player.pos.z + (cy - H / 2) / sc };
  }

  setWaypoint(wp) { this.waypoint = wp;     this._fitCentre();
  }

  /* a compact readout of how far the waypoint is and which way */
  setWaypointHud(wp, player) {
    const el = this.$('#waypoint');
    if (!wp) { el.classList.add('hidden'); return; }
    const dx = wp.x - player.pos.x, dz = wp.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    // bearing relative to where you are looking
    let a = Math.atan2(dx, -dz) - player.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    el.classList.remove('hidden');
    // Say what it refers to. It sits in the centre column now, so a bare
    // distance with an arrow had nothing to anchor it to.
    const name = (wp.label || 'WAYPOINT').toString().toUpperCase();
    el.innerHTML = `<span class="wp-lbl">${name}</span> <b>\u25c6</b> ${Math.round(d)}m ` +
      `<span style="transform:rotate(${a}rad)">\u2191</span>`;
  }

  showMap() { this.mapEl.classList.remove('hidden'); }
  hideMap() { this.mapEl.classList.add('hidden'); }
  setFpsVisible(v) { this.$('#pill-fps').classList.toggle('hidden', !v); }

  setObjective(main, sub) { this.objEl.innerHTML = main + (sub ? `<small>${sub}</small>` : '');     this._fitCentre();
  }
  setUseVisible(v, text) {
    const u = this.$('#usehint');
    u.classList.toggle('hidden', !v);
    if (text) u.textContent = text;
  }

  update(dt, s) {
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) {
      this._lastFps = Math.round(this._fpsN / this._fpsAcc);
      this.$('#hud-fps').textContent = this._lastFps;
      this._fpsAcc = 0; this._fpsN = 0;
    }

    this.$('#hud-level').textContent = s.level;
    this.$('#hud-coins').textContent = s.coins;
    if (s.clock) this.$('#hud-clock').textContent = s.clock;
    this.$('#pill-pts').classList.toggle('hidden', !s.points);
    this.$('#hud-points').textContent = s.points;

    const hp = Math.max(0, s.health), mh = s.maxHealth || 100;
    this.$('#hud-hp').style.width = (hp / mh * 100) + '%';
    this.$('#hud-hpt').textContent = Math.round(hp);
    const ma = s.maxArmor || 0;
    this.$('#hud-ar').style.width = ma ? (s.armor / ma * 100) + '%' : '0%';
    this.$('#hud-art').textContent = ma ? Math.round(s.armor) : '—';
    this.$('#hud-st').style.width = (s.stamina / (s.maxStamina || 100) * 100) + '%';
    this.$('#hud-stt').textContent = Math.round(s.stamina);

    this.$('#ammo').textContent = s.ammo;
    this.$('#reserve').textContent = s.reserve;
    const ammoEl = this.$('#ammo');
    const low = s.ammoMax && s.ammo !== '∞' ? parseInt(s.ammo, 10) / s.ammoMax : 1;
    ammoEl.style.color = low <= 0.001 ? '#ff3d81' : low < 0.26 ? '#ffd23a' : '';
    const wn = this.$('#weaponname');
    wn.textContent = s.weapon || '—';
    wn.style.color = s.weaponColor || 'var(--dim)';
    wn.style.textShadow = s.weaponColor ? `0 0 10px ${s.weaponColor}55` : 'none';
    this.$('#reloading').classList.toggle('hidden', !s.reloading);
    const heat = s.heat || 0;
    const hw = this.$('#heatwrap');
    hw.classList.toggle('hidden', heat < 0.06);
    this.$('#heatfill').style.width = (heat * 100) + '%';
    this.$('#heatfill').style.background = s.overheated ? '#ff3d81' : 'linear-gradient(90deg,#ffb03a,#ff6a2a)';
    this.$('#heatwrap').title = s.overheated ? 'OVERHEATED' : '';

    this.$('#hud-lvl2').textContent = 'LV ' + s.level;
    this.$('#hud-xpt').textContent = `${Math.floor(s.xp)} / ${s.xpNext} XP`;
    this.$('#xpfill').style.width = (s.xp / s.xpNext * 100) + '%';

    this.$('#crosshair').style.setProperty('--gap', (6 + (s.spread || 0) * 260) + 'px');
    this.$('#lowhealth').style.opacity = hp / mh < 0.3 ? '1' : '0';

    const f = s.focus === undefined ? 100 : s.focus;
    this.$('#hud-bt').style.width = f + '%';
    this.$('#hud-btt').textContent = Math.round(f);
    this.$('#bullettime').style.opacity = s.slowmo ? '1' : '0';
  }

  setSprint() { /* stamina bar already communicates this */ }

  combo(n) {
    const el = this.$('#combo');
    el.textContent = 'x' + n + ' COMBO';
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this._comboT);
    this._comboT = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  levelFlash() {
    const el = this.$('#levelflash');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  updateBoss(boss, dist) {
    if (!boss) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.$('#bossname').textContent = boss.t.name.toUpperCase() + (dist ? `   ${Math.round(dist)}m` : '');
    this.$('#bossfill').style.width = Math.max(0, boss.health / boss.maxHealth * 100) + '%';
      this._fitCentre();
  }

  /* ---------------- compass ---------------- */
  setCompass(yaw) {
    const ctx = this.compCtx, W = this.comp.width, H = this.comp.height;
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;   // world bearing
    const span = 140;                                            // degrees visible
    ctx.clearRect(0, 0, W, H);
    for (const [deg, name] of CARDINALS) {
      let d = ((deg - heading + 540) % 360) - 180;               // -180..180
      if (Math.abs(d) > span / 2) continue;
      const x = W / 2 + (d / span) * W;
      ctx.fillStyle = name.length === 1 ? 'rgba(56,242,200,.95)' : 'rgba(200,215,235,.6)';
      ctx.font = (name.length === 1 ? 'bold 15px' : '11px') + ' system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, name.length === 1 ? 18 : 16);
      ctx.fillRect(x - 0.5, 20, 1, 5);
    }
    ctx.fillStyle = '#38f2c8';
    ctx.fillRect(W / 2 - 1, 0, 2, 7);
  }

  /* ---------------- damage direction ---------------- */
  hitDirection(rel, alpha = 1) {
    if (rel === null || rel === undefined) { this.dirEl.style.opacity = '0'; return; }
    const R = 78;
    const x = Math.sin(rel) * R, y = -Math.cos(rel) * R;
    this.dirEl.style.opacity = String(alpha * 0.95);
    this.dirEl.style.transform = `translate(-50%,-50%) rotate(${rel}rad) translateY(${-R}px)`;
  }

  headshot() {
    const h = this.$('#hitmarker');
    h.classList.remove('show'); h.classList.add('kill');
    void h.offsetWidth; h.classList.add('show');
    this.$('#hitmarker').style.filter = 'hue-rotate(150deg)';
    setTimeout(() => { this.$('#hitmarker').style.filter = ''; }, 220);
  }

  hitmarker(kill = false) {
    const h = this.$('#hitmarker');
    h.classList.remove('show'); h.classList.toggle('kill', kill);
    void h.offsetWidth; h.classList.add('show');
  }
  bloodHit() {
    const el = this.$('#bloodhit');
    el.style.background = `radial-gradient(circle at ${20 + Math.random() * 60}% ${20 + Math.random() * 60}%, rgba(150,10,10,.55), transparent 45%)`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  flashDamage() {
    const d = this.$('#damageflash'); d.style.opacity = '1';
    clearTimeout(this._dmgT); this._dmgT = setTimeout(() => d.style.opacity = '0', 110);
  }
  kill(text) {
    const f = this.$('#killfeed');
    const el = document.createElement('div'); el.className = 'kf'; el.textContent = text;
    f.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s';
      setTimeout(() => el.remove(), 400); }, 2600);
    while (f.children.length > 5) f.removeChild(f.firstChild);
  }
  damageAt(v, amount, kind) {
    if (!this.camera || !v) return;
    const p = v.clone().project(this.camera);
    if (p.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (kind === 'crit' ? ' crit' : '');
    el.textContent = Math.round(amount);
    el.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px';
    el.style.setProperty('--dx', (Math.random() * 34 - 17) + 'px');
    this.$('#dmgwrap').appendChild(el);
    setTimeout(() => el.remove(), 780);
  }

  setAlly(a) {
    const el = this.$('#ally');
    if (!a) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<b>${a.name}</b><i style="width:${Math.round(a.health / a.maxHealth * 100)}%"></i>`
      + (a.down ? '<span>DOWN</span>' : '');
    el.classList.toggle('down', a.down);
  }

  setSafeZone(on) {
    const el = this.$('#safezone');
    if (el) el.classList.toggle('hidden', !on);
      this._fitCentre();
  }

  /* the contextual "press F to …" line */
  setPrompt(text) {
    const el = this.$('#prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.textContent !== text) el.textContent = text;
      this._fitCentre();
  }

  setEvidence(n) {
    const el = this.$('#evidence');
    if (!n) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = 'EVIDENCE ' + n + ' / 5';
      this._fitCentre();
  }

  setWanted(stars) {
    const el = this.$('#wanted');
    if (!stars) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.dataset.n !== String(stars)) {
      el.dataset.n = stars;
      el.innerHTML = '<span>WANTED</span>' + '\u2605'.repeat(stars) + '\u2606'.repeat(Math.max(0, 5 - stars));
    }
  }

  setThrowable(name, count) {
    this.$('#th-name').textContent = name;
    this.$('#th-count').textContent = count;
    this.$('#throwable').classList.toggle('dim', count <= 0);
  }

  drawWheel(list, current, hovered) {
    const el = this.$('#wheel');
    if (!list || !list.length) { el.classList.add('hidden'); el.innerHTML = ''; el.dataset.n = ''; return; }
    const key = list.length + ':' + list.map((w) => w.def.id).join(',');
    if (el.dataset.n !== key) {
      el.dataset.n = key;
      const R = 132;
      el.innerHTML = '<div class="wheel-hub">WEAPONS</div>' + list.map((w, i) => {
        const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
        return `<div class="wseg" data-i="${i}" style="left:calc(50% + ${Math.cos(a) * R}px);top:calc(50% + ${Math.sin(a) * R}px)">
          <b>${i + 1}</b><span>${w.def.name}</span></div>`;
      }).join('');
    }
    el.classList.remove('hidden');
    el.querySelectorAll('.wseg').forEach((seg) => {
      seg.classList.toggle('on', +seg.dataset.i === hovered);
      seg.classList.toggle('cur', +seg.dataset.i === current);
    });
  }

  /* health bars floating over damaged elites and bosses */
  eliteBars(list) {
    const wrap = this.$('#elitebars');
    if (!list || !list.length) { if (wrap.childElementCount) wrap.innerHTML = ''; return; }
    if (wrap.childElementCount !== list.length) {
      wrap.innerHTML = list.map(() => '<div class="ebar"><i></i><b></b></div>').join('');
    }
    const kids = wrap.children;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], el = kids[i];
      const v = e.group.position.clone(); v.y += e.headHeight() + 0.55;
      const p = v.project(this.camera);
      if (p.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px';
      el.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px';
      const f = Math.max(0, e.health / e.maxHealth);
      el.querySelector('i').style.width = (f * 100) + '%';
      el.querySelector('b').textContent = e.t.name + (e.isBoss ? '  ' + Math.ceil(f * 100) + '%' : '');
    }
  }

  setScope(on) { this.$('#scope').classList.toggle('hidden', !on); }

  achievement(a) {
    const n = this.$('#achtoast');
    const el = document.createElement('div');
    el.className = 'achtoast';
    el.innerHTML = `<em>ACHIEVEMENT</em><b>${a.name}</b><span>${a.desc}</span>`;
    n.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 400); }, 3400);
    while (n.children.length > 3) n.removeChild(n.firstChild);
  }

  notify(text, gold = false) {
    const n = this.$('#notif');
    const el = document.createElement('div'); el.className = 'nt' + (gold ? ' gold' : '');
    el.textContent = text; n.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 400); }, 1900);
    while (n.children.length > 3) n.removeChild(n.firstChild);
    this._fitCentre();
  }

  /* The centre column holds the objective, boss bar, safe-zone notice, waypoint,
     evidence and notifications. If everything shows at once it can grow down into
     the prompt line, so drop the oldest notification until it fits. */
  _fitCentre() {
    const top = this.$('#centertop'), bottom = this.$('#centerbottom'), n = this.$('#notif');
    if (!top || !bottom || !n) return;
    const floor = bottom.getBoundingClientRect().top;
    let guard = 6;
    while (n.children.length && top.getBoundingClientRect().bottom > floor - 6 && guard-- > 0) {
      n.removeChild(n.firstChild);
    }
  }

  /* ---------------- XP floaters + level banner ---------------- */
  xpFloat(text, gold = false) {
    const wrap = this.$('#xpfloats');
    const el = document.createElement('div');
    el.className = 'xpf' + (gold ? ' gold' : '');
    el.textContent = text;
    el.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
  banner(text, sub) {
    const b = this.$('#banner');
    b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.remove('hidden');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 2200);
  }

  pushFrame(ms) {
    if (!this._ft) { this._ft = new Float32Array(120); this._ftIdx = 0; }
    this._ft[this._ftIdx] = ms;
    this._ftIdx = (this._ftIdx + 1) % 120;
  }

  drawFrameGraph(show) {
    const c = this.$('#framegraph');
    c.classList.toggle('hidden', !show);
    if (!show || !this._ft) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,10,16,.72)'; ctx.fillRect(0, 0, W, H);
    const yFor = (v) => H - Math.min(1, v / 50) * H;
    ctx.strokeStyle = 'rgba(56,242,200,.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yFor(16.7)); ctx.lineTo(W, yFor(16.7)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,58,.35)';
    ctx.beginPath(); ctx.moveTo(0, yFor(33)); ctx.lineTo(W, yFor(33)); ctx.stroke();
    ctx.strokeStyle = '#38f2c8'; ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const v = this._ft[(this._ftIdx + i) % 120] || 0;
      const x = (i / 119) * W, y = yFor(v);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#8ba0bb'; ctx.font = '9px ui-monospace,monospace';
    ctx.fillText('16.7ms', 3, yFor(16.7) - 2);
    ctx.fillText('33ms', 3, yFor(33) - 2);
  }

  debug(lines) {
    const d = this.$('#debug');
    d.classList.toggle('hidden', !lines);
    if (lines) d.textContent = lines.join('\n');
  }

  /* ---------------- minimap ---------------- */
  _transform(ctx, W, H, px, pz, sc, yaw, rotate) {
    const a = rotate ? yaw : 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    return {
      tx: (x, z) => {
        const dx = x - px, dz = z - pz;
        return W / 2 + (dx * ca - dz * sa) * sc;
      },
      ty: (x, z) => {
        const dx = x - px, dz = z - pz;
        return H / 2 + (dx * sa + dz * ca) * sc;
      },
    };
  }

  drawMinimap(world, player, pois, rotate = false) {
    const ctx = this.mmCtx, W = this.mm.width, H = this.mm.height;
    const R = 100, sc = W / (R * 2);
    const px = player.pos.x, pz = player.pos.z;
    const { tx, ty } = this._transform(ctx, W, H, px, pz, sc, player.yaw, rotate);
    const txz = (x, z) => [tx(x, z), ty(x, z)];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,12,20,.68)'; ctx.fillRect(0, 0, W, H);

    // roads first, then buildings on top
    ctx.fillStyle = 'rgba(70,78,92,.55)';
    for (const ch of world.chunks.values()) {
      if (!ROAD_BIOMES.has(ch.biome)) continue;
      for (const [rx, rz, rw, rh] of [[ch.ox, ch.oz, 18, 96], [ch.ox, ch.oz, 96, 18]]) {
        const [x0, y0] = txz(rx, rz), [x1, y1] = txz(rx + rw, rz + rh);
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
    }
    ctx.fillStyle = 'rgba(120,140,175,.5)';
    for (const ch of world.chunks.values()) for (const c of ch.colliders) {
      if (c.height < 2) continue;
      const [x0, y0] = txz(c.minX, c.minZ), [x1, y1] = txz(c.maxX, c.maxZ);
      if (Math.min(x0, x1) > W || Math.min(y0, y1) > H) continue;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    // safe-zone bubbles
    for (const p of pois) {
      if (!p.radius) continue;
      const st = POI_STYLE[p.type]; if (!st) continue;
      const [x, y] = txz(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, y, p.radius * sc, 0, 7);
      ctx.globalAlpha = 0.16; ctx.fillStyle = st.c; ctx.fill(); ctx.globalAlpha = 1;
    }

    const edge = [];
    for (const p of pois) {
      const st = POI_STYLE[p.type] || POI_STYLE.enemy;
      const [x, y] = txz(p.x, p.z);
      if (x < 6 || y < 6 || x > W - 6 || y > H - 6) {
        if (['safehouse', 'shop', 'upgrade', 'boss', 'crime', 'ping'].includes(p.type)) edge.push({ x, y, st });
        continue;
      }
      ctx.fillStyle = st.c;
      shape(ctx, st.s, x, y, st.n);
    }

    for (const e of edge) {
      const a = Math.atan2(e.y - H / 2, e.x - W / 2);
      const cx = W / 2 + Math.cos(a) * (W / 2 - 9), cy = H / 2 + Math.sin(a) * (H / 2 - 9);
      ctx.fillStyle = e.st.c;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
      ctx.lineTo(cx + Math.cos(a + 2.5) * 6, cy + Math.sin(a + 2.5) * 6);
      ctx.lineTo(cx + Math.cos(a - 2.5) * 6, cy + Math.sin(a - 2.5) * 6);
      ctx.closePath(); ctx.fill();
    }

    ctx.save(); ctx.translate(W / 2, H / 2);
    // When the map is rotated to match heading the arrow must stay fixed at the
    // top; otherwise it turns with the player. (This was 180 degrees out.)
    if (!rotate) ctx.rotate(-player.yaw);
    ctx.fillStyle = '#38f2c8';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------------- full map ---------------- */
  drawFullMap(world, player, pois) {
    this._lastPlayer = player;
    const ctx = this.bigCtx, W = this.big.width, H = this.big.height;
    const R = 300 / this.mapZoom, sc = Math.min(W, H) / (R * 2);
    const px = player.pos.x, pz = player.pos.z;
    const tx = (x) => W / 2 + (x - px) * sc;
    const ty = (z) => H / 2 + (z - pz) * sc;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(56,242,200,.10)'; ctx.lineWidth = 1;
    for (let i = 0; i <= W; i += 60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
    for (let i = 0; i <= H; i += 60) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }

    for (const ch of world.chunks.values()) {
      const x = tx(ch.ox), y = ty(ch.oz), s = world.chunkSize * sc;
      ctx.fillStyle = BIOME_FILL[ch.biome] || 'rgba(120,140,170,.2)';
      ctx.fillRect(x, y, s, s);
    }
    // roads
    ctx.fillStyle = 'rgba(80,88,102,.55)';
    for (const ch of world.chunks.values()) {
      if (!ROAD_BIOMES.has(ch.biome)) continue;
      ctx.fillRect(tx(ch.ox), ty(ch.oz), 18 * sc, world.chunkSize * sc);
      ctx.fillRect(tx(ch.ox), ty(ch.oz), world.chunkSize * sc, 18 * sc);
    }
    ctx.fillStyle = 'rgba(150,170,205,.45)';
    for (const ch of world.chunks.values()) for (const c of ch.colliders) {
      if (c.height < 3) continue;
      ctx.fillRect(tx(c.minX), ty(c.minZ), (c.maxX - c.minX) * sc, (c.maxZ - c.minZ) * sc);
    }

    // Important markers claim their label space first, so a cluster cannot
    // squeeze out the safe house or a boss in favour of a stash.
    const ORDER = ['boss', 'ping', 'safehouse', 'shop', 'upgrade', 'crime', 'stash'];
    const rank = (t) => { const i = ORDER.indexOf(t); return i < 0 ? ORDER.length : i; };
    const ordered = pois.slice().sort((a, b) => rank(a.type) - rank(b.type));
    const drawnLabels = [];

    for (const p of ordered) {
      if (!this._catVisible(p.type)) continue;
      const st = POI_STYLE[p.type] || POI_STYLE.enemy;
      const x = tx(p.x), y = ty(p.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (p.radius) {
        ctx.beginPath(); ctx.arc(x, y, p.radius * sc, 0, 7);
        ctx.globalAlpha = 0.14; ctx.fillStyle = st.c; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = st.c;
      shape(ctx, st.s, x, y, st.n);
      if (LABELLED.has(p.type)) {
        const d = Math.hypot(p.x - px, p.z - pz);
        const text = `${p.label} ${Math.round(d)}m`;
        ctx.font = 'bold 11px system-ui, sans-serif';
        const tw = ctx.measureText(text).width, th = 12;
        // Prefer the right of the marker, flip to the left if that would run off
        // the canvas. Skip it entirely if it would land on a label already drawn
        // — a cluster of POIs used to produce an unreadable pile of text.
        let lx = x + 10;
        if (lx + tw > W - 4) lx = x - 10 - tw;
        const ly = y + 4;
        let clash = lx < 4 || ly - th < 0 || ly > H - 2;
        if (!clash) {
          for (const b of drawnLabels) {
            if (lx < b.x + b.w && b.x < lx + tw && ly - th < b.y && b.y - th < ly) { clash = true; break; }
          }
        }
        if (!clash) {
          drawnLabels.push({ x: lx, y: ly, w: tw });
          ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(text, lx + 1, ly + 1);
          ctx.fillStyle = 'rgba(232,241,255,.95)'; ctx.fillText(text, lx, ly);
        }
      }
    }

    if (this.waypoint) {
      const [wx, wy] = txz(this.waypoint.x, this.waypoint.z);
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(wx, wy - 8); ctx.lineTo(wx + 8, wy); ctx.lineTo(wx, wy + 8); ctx.lineTo(wx - 8, wy);
      ctx.closePath(); ctx.stroke();
    }

    // The full map is always north-up, so the arrow always turns with heading.
    // (This was 180 degrees out.)
    ctx.save(); ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#38f2c8';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.restore();

    if (this.waypoint) {
      const wx = tx(this.waypoint.x), wy = ty(this.waypoint.z);
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx, wy - 12); ctx.lineTo(wx + 12, wy); ctx.lineTo(wx, wy + 12); ctx.lineTo(wx - 12, wy);
      ctx.closePath(); ctx.stroke();
    }

    if (!this._legendBuilt) {
      const CATS = [['safe', 'Safe houses', '#38f2c8'], ['loot', 'Loot', '#ffd23a'],
        ['threat', 'Threats', '#ff5a7a'], ['terrain', 'Terrain', '#8ba0bb']];
      const legend = this.mapEl.querySelector('#map-legend');
      legend.innerHTML = CATS.map(([k, label, c]) =>
        `<span class="leg-toggle${this.mapFilter[k] ? '' : ' off'}" data-cat="${k}"><i style="background:${c}"></i>${label}</span>`
      ).join('') + '<span class="leg-hint">click to filter \u00b7 click the map to set a waypoint</span>';
      legend.querySelectorAll('[data-cat]').forEach((el) => {
        el.onclick = () => { this.toggleCategory(el.dataset.cat); this._legendBuilt = false; };
      });
      this._legendBuilt = true;
    }
  }
}
