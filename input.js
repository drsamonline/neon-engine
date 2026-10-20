// input.js — unified keyboard/mouse + touch input with aiming, zoom and one-shot actions
/* Every rebindable action, in one place. The settings panel is generated from
   this list, so an action cannot exist without being rebindable — and cannot be
   rebindable without appearing in the menu. */
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement' },
  { id: 'back', label: 'Move back', group: 'Movement' },
  { id: 'left', label: 'Strafe left', group: 'Movement' },
  { id: 'right', label: 'Strafe right', group: 'Movement' },
  { id: 'jump', label: 'Jump', group: 'Movement' },
  { id: 'sprint', label: 'Sprint', group: 'Movement' },
  { id: 'crouch', label: 'Crouch / slide', group: 'Movement' },
  { id: 'prone', label: 'Prone', group: 'Movement' },
  { id: 'leanL', label: 'Lean left', group: 'Movement' },
  { id: 'leanR', label: 'Lean right', group: 'Movement' },

  { id: 'fire', label: 'Fire', group: 'Combat', mouse: 0 },
  { id: 'aim', label: 'Aim / zoom', group: 'Combat', mouse: 2 },
  { id: 'reload', label: 'Reload', group: 'Combat' },
  { id: 'melee', label: 'Melee', group: 'Combat' },
  { id: 'altFire', label: 'Alt fire', group: 'Combat' },
  { id: 'throwable', label: 'Throw', group: 'Combat' },
  { id: 'cycleThrow', label: 'Cycle throwable', group: 'Combat' },
  { id: 'slowmo', label: 'Bullet time', group: 'Combat' },
  { id: 'swap', label: 'Swap weapon', group: 'Combat' },

  { id: 'use', label: 'Interact / use', group: 'Interaction' },
  { id: 'map', label: 'Map', group: 'Interaction' },
  { id: 'progress', label: 'Progress panel', group: 'Interaction' },
  { id: 'disguise', label: 'Disguise', group: 'Interaction' },
  { id: 'replay', label: 'Replay last 20s', group: 'Interaction' },
  { id: 'photo', label: 'Photo mode', group: 'Interaction' },
  { id: 'pause', label: 'Pause', group: 'Interaction' },
  { id: 'mute', label: 'Mute', group: 'Interaction' },
  { id: 'debug', label: 'Debug overlay', group: 'Interaction' },

  { id: 'slot1', label: 'Weapon slot 1', group: 'Weapons' },
  { id: 'slot2', label: 'Weapon slot 2', group: 'Weapons' },
  { id: 'slot3', label: 'Weapon slot 3', group: 'Weapons' },
  { id: 'slot4', label: 'Weapon slot 4', group: 'Weapons' },
  { id: 'slot5', label: 'Weapon slot 5', group: 'Weapons' },
  { id: 'slot6', label: 'Weapon slot 6', group: 'Weapons' },
  { id: 'slot7', label: 'Weapon slot 7', group: 'Weapons' },
  { id: 'slot8', label: 'Weapon slot 8', group: 'Weapons' },
  { id: 'slot9', label: 'Weapon slot 9', group: 'Weapons' },
];

/* a readable name for a KeyboardEvent.code */
/* A game may relabel an action for its own world — the zombie game should not
   offer to "arrest" anything. */
export function actionLabel(action, overrides) {
  if (overrides && overrides[action.id]) return overrides[action.id];
  return action.label;
}

export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, 'Arrow ')
    .replace('Left', ' L').replace('Right', ' R').replace('Control', 'Ctrl')
    .replace('Shift', 'Shift').replace('Escape', 'Esc').replace('Space', 'Space');
}

export class Input {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.locked = false;
    this.onPause = null;
    this.onKey = null;

    // held state
    this.forward = this.back = this.left = this.right = false;
    this.sprint = this.jump = false;
    this.fire = this.aim = false;
    this.crouch = false;
    this.prone = false;
    this.leanL = this.leanR = false;
    this.altFire = false;
    this.sprintToggled = false;
    this.swapHeld = false;
    this.axis = { x: 0, y: 0 };       // analog move from a gamepad
    this.padIndex = null;
    this._padPrev = {};
    this.rumbleSupported = false;
    // rebindable actions: action -> array of KeyboardEvent.code values
    this.binds = {
      forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      sprint: ['ShiftLeft', 'ShiftRight'], jump: ['Space'],
      crouch: ['ControlLeft', 'ControlRight', 'KeyC'], prone: ['KeyZ'],
      leanL: ['KeyQ'], leanR: ['KeyE'],
      reload: ['KeyR'], melee: ['KeyV'], use: ['KeyF'],
      map: ['KeyM'], mute: ['KeyN'], progress: ['KeyP'], debug: ['F3'],
      throwable: ['KeyG'], cycleThrow: ['KeyH'], altFire: ['KeyB'], photo: ['KeyO'], disguise: ['KeyJ'], replay: ['KeyK'],
      slowmo: ['KeyX'],
      swap: ['Tab'], pause: ['Escape'],
      slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'], slot5: ['Digit5'],
      slot6: ['Digit6'], slot7: ['Digit7'], slot8: ['Digit8'], slot9: ['Digit9'],
    };
    this.capturing = null;      // action currently awaiting a new key
    // one-shot queue
    this._once = new Set();
    // look delta
    this.lookDX = 0; this.lookDY = 0;
    // weapon hotkeys produce events
    this.wheelDir = 0;

    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.onPause) this.onPause();
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.fire = true;
      else if (e.button === 2) this.aim = true;
      else if (e.button === 1) { this._once.add('ping'); e.preventDefault(); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      else if (e.button === 2) this.aim = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheelDir = Math.sign(e.deltaY); }, { passive: true });

    if (this.isTouch) this._buildTouch();
  }

  _key(e, down) {
    const B = this.binds;
    if (B.swap && B.swap.includes(e.code)) { this.swapHeld = down; e.preventDefault(); }

    // rebinding capture takes priority
    if (down && this.capturing) {
      const action = this.capturing;
      this.capturing = null;
      if (e.code !== 'Escape') {
        // a key can only mean one thing: take it away from whoever had it
        const clash = this.whoHas(e.code, action);
        if (clash) this.binds[clash] = [];
        this.binds[action] = [e.code];
        if (this.onBind) this.onBind(action, e.code, clash);
      } else if (this.onBind) this.onBind(null, null, null);
      e.preventDefault();
      return;
    }

    const b = this.binds;
    const once = { reload: 'reload', melee: 'melee', slowmo: 'slowmo', interact: 'interact',
      use: 'interact', map: 'map', mute: 'mute', progress: 'progress', debug: 'debug',
      throwable: 'throwable', cycleThrow: 'cycleThrow', photo: 'photo', disguise: 'disguise', replay: 'replay' };
    // edge-triggered: bullet time
    if (b.slowmo && b.slowmo.includes(e.code)) { if (down) this._once.add('slowmo'); return; }

    // movement / held actions
    if (b.forward.includes(e.code)) this.forward = down;
    else if (b.back.includes(e.code)) this.back = down;
    else if (b.left.includes(e.code)) this.left = down;
    else if (b.right.includes(e.code)) this.right = down;
    else if (b.sprint.includes(e.code)) this.sprint = down;
    else if (b.crouch.includes(e.code)) { this.crouch = down; if (down) e.preventDefault(); }
    else if (b.prone.includes(e.code)) { this.prone = down; }
    else if (b.leanL.includes(e.code)) this.leanL = down;
    else if (b.leanR.includes(e.code)) this.leanR = down;
    else if (b.altFire.includes(e.code)) this.altFire = down;
    else if (b.jump.includes(e.code)) { if (down) this._once.add('jump'); this.jump = down; if (down) e.preventDefault(); }
    // one-shot actions
    else if (down) {
      let acted = false;
      for (const [action, evt] of Object.entries(once)) {
        if (b[action] && b[action].includes(e.code)) { this._once.add(evt); acted = true; break; }
      }
      if (!acted) {
        if (B.swap && B.swap.includes(e.code)) { this._once.add('swap'); e.preventDefault(); }
        else if (B.pause && B.pause.includes(e.code)) { if (this.onPause) this.onPause(); }
        else {
          for (let n = 1; n <= 9; n++) {
            const k = 'slot' + n;
            if (B[k] && B[k].includes(e.code)) { this._once.add(k); acted = true; break; }
          }
        }
      }
    }
    if (this.onKey && down) this.onKey(e.code);
  }

  /* which other action currently owns this key, if any */
  whoHas(code, except) {
    for (const k of Object.keys(this.binds)) {
      if (k === except) continue;
      if ((this.binds[k] || []).includes(code)) return k;
    }
    return null;
  }
  /* any action with no key at all — surfaced in the settings panel */
  unbound() {
    return ACTIONS.filter((a) => a.mouse === undefined && (!this.binds[a.id] || !this.binds[a.id].length));
  }
  startRebind(action) { this.capturing = action; }
  cancelRebind() { this.capturing = null; }

  /* ---------------- touch controls ---------------- */
  _buildTouch() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="stick"><div id="stickknob"></div></div>
      <div id="lookpad"></div>
      <button class="tbtn" id="tb-fire">FIRE</button>
      <button class="tbtn" id="tb-aim">AIM</button>
      <button class="tbtn" id="tb-jump">JUMP</button>
      <div id="tcol">
        <button class="tsm" id="tb-reload">R</button>
        <button class="tsm" id="tb-melee">F</button>
        <button class="tsm" id="tb-swap">SWAP</button>
        <button class="tsm" id="tb-slow">TIME</button>
      </div>
      <button id="tb-use" class="hidden">USE</button>`;
    document.body.appendChild(root);
    this.touchRoot = root;

    const $ = (id) => root.querySelector(id);
    const stick = $('#stick'), knob = $('#stickknob'), look = $('#lookpad');

    let sid = null, sx = 0, sy = 0;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (sid === null) { sid = t.identifier; const r = stick.getBoundingClientRect();
        sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }
    }, { passive: false });
    const move = (t) => {
      const dx = t.clientX - sx, dy = t.clientY - sy;
      const max = 54, m = Math.min(max, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
      knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * m}px), calc(-50% + ${Math.sin(a) * m}px))`;
      const nx = Math.cos(a) * (m / max), ny = Math.sin(a) * (m / max);
      this.left = nx < -0.28; this.right = nx > 0.28;
      this.forward = ny < -0.28; this.back = ny > 0.28;
      this.sprint = (m / max) > 0.86;
    };
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) { move(t); e.preventDefault(); }
    }, { passive: false });
    addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        sid = null; this.forward = this.back = this.left = this.right = false; this.sprint = false;
        knob.style.transform = 'translate(-50%,-50%)';
      }
    });

    let lid = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lid) {
        this.lookDX += (t.clientX - lx) * 1.5; this.lookDY += (t.clientY - ly) * 1.5;
        lx = t.clientX; ly = t.clientY; e.preventDefault();
      }
    }, { passive: false });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; });

    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => { on(); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', (e) => { if (off) off(); e.preventDefault(); }, { passive: false });
    };
    hold($('#tb-fire'), () => { this.fire = true; }, () => { this.fire = false; });
    hold($('#tb-aim'), () => { this.aim = !this.aim; });
    hold($('#tb-jump'), () => { this._once.add('jump'); this.jump = true; }, () => { this.jump = false; });
    hold($('#tb-reload'), () => { this._once.add('reload'); });
    hold($('#tb-melee'), () => { this._once.add('melee'); });
    hold($('#tb-swap'), () => { this._once.add('swap'); });
    hold($('#tb-slow'), () => { this._once.add('slowmo'); });
    hold($('#tb-use'), () => { this._once.add('interact'); });
  }

  showTouch(v) { if (this.touchRoot) this.touchRoot.classList.toggle('hidden', !v); }
  setUseVisible(v) { const b = document.getElementById('tb-use'); if (b) b.classList.toggle('hidden', !v); }

  /* sprint may be hold or toggle, per settings */
  sprinting(toggleMode) {
    if (!toggleMode) return this.sprint;
    if (this._sprintEdge !== this.sprint) {
      this._sprintEdge = this.sprint;
      if (this.sprint) this.sprintToggled = !this.sprintToggled;
    }
    return this.sprintToggled;
  }

  /* ---- gamepad (Gamepad API) ---- */
  pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) { this.axis.x = 0; this.axis.y = 0; this.padIndex = null; return; }
    this.padIndex = pad.index;
    this.rumbleSupported = !!(pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators.length));

    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
    this.axis.x = lx; this.axis.y = -ly;

    // right stick look
    const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
    if (rx || ry) { this.lookDX += rx * 14; this.lookDY += ry * 14; }

    // standard mapping: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9 L3=10 R3=11
    const b = pad.buttons || [];
    const held = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    const edge = (name, i) => { const v = held(i); if (v && !this._padPrev[name]) this._once.add(name); this._padPrev[name] = v; };

    if (held(0)) this._once.add('jump');
    this.jump = held(0);
    this.sprint = held(10) || (b[7] && b[7].value > 0.5);
    this.crouch = held(11);
    this.fire = held(7);
    this.aim = held(6) || held(4);
    if (held(1)) { this._once.add('reload'); }
    this.prone = held(8);
    this.leanL = held(4); this.leanR = held(5);
    edge('interact', 2);
    edge('swap', 3);
    edge('throwable', 5);
    edge('melee', 4);
    edge('map', 8);
    if (held(9)) this._once.add('pausePad');
    // movement comes purely from the stick, so clear the digital flags
    this.forward = this.back = this.left = this.right = false;
  }

  /* short haptic pulse (fire, hit, explosion) */
  rumble(strength = 0.4, ms = 90) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected) continue;
      const act = p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]);
      if (!act) continue;
      try {
        if (act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 });
        else if (act.pulse) act.pulse(strength, ms);
      } catch (_) { /* unsupported */ }
    }
  }

  consumeLook() { const d = { dx: this.lookDX, dy: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return d; }
  once(name) { if (this._once.has(name)) { this._once.delete(name); return true; } return false; }
  clearOnce() { this._once.clear(); }

  requestLock() {
    try { const p = this.canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); }
    catch (_) { /* unavailable */ }
  }
}
