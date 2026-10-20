// menus.js — the pause menu, the settings modal, the progress panel and the
// end-of-run summary. Split out of gamebase.js, which was getting long.
// Installed onto GameBase.prototype.
import { ACHIEVEMENTS } from './meta.js';
import { WEAPONS } from './weapons.js';

export function installMenus(GameBase) {
  Object.assign(GameBase.prototype, {
  /* ---------------- menus ---------------- */
  _buildMenus() {
    const o = document.getElementById('overlay');
    if (!o) return;
    const panel = o.querySelector('.panel') || o;
    const menu = document.createElement('div');
    menu.id = 'pausebtns'; menu.className = 'menu-btns hidden';
    menu.innerHTML = `<button class="btn sm" id="m-resume">RESUME</button>
      <button class="btn sm ghost" id="m-settings">SETTINGS</button>
      <button class="btn sm ghost" id="m-restart">RESTART</button>`;
    panel.appendChild(menu);
    this.pauseMenu = menu;
    menu.querySelector('#m-resume').onclick = () => this.start();
    menu.querySelector('#m-restart').onclick = () => this.respawn();
    menu.querySelector('#m-settings').onclick = () => this.openSettings();
    const pb2 = document.createElement('button');
    pb2.className = 'btn sm ghost'; pb2.textContent = 'PROGRESS';
    pb2.onclick = () => this.openMeta();
    menu.appendChild(pb2);

    const sb = document.getElementById('settingsbtn');
    if (sb) sb.onclick = () => this.openSettings();
  },

  /* ---------------- photo mode ---------------- */
  togglePhoto() {
    this.photo = !this.photo;
    this.player.flying = this.photo;
    document.getElementById('hud').classList.toggle('hidden', this.photo);
    document.body.classList.toggle('photo', this.photo);
    if (this.photo) { this.hud.notify('PHOTO MODE \u2014 WASD fly, Space up, Ctrl down, O to exit'); this.hud.setUseVisible(false); }
  },

  _showRunSummary(run, record) {
    const el = document.getElementById('runsummary');
    if (!el) return;
    const mm = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
    const rows = [
      ['Survived', mm(run.time)],
      ['Kills', run.kills],
      ['Level reached', run.level],
      ['Score', run.score],
      ['Killed by', this._lastAttacker || this.cfg.killerDefault || 'an unknown attacker'],
    ].map(([k, v]) => `<div class="rs-row"><span>${k}</span><b>${v}</b></div>`).join('');
    const unlocked = ACHIEVEMENTS.filter((a) => this.meta.achievements[a.id]).slice(-3);
    el.innerHTML = `<div class="rs-panel"><h3>RUN SUMMARY${record ? ' · NEW BEST' : ''}</h3>
      ${rows}
      <div class="rs-best">Best: ${mm(this.meta.best.time)} · ${this.meta.best.kills} kills · score ${this.meta.best.score}</div>
      ${unlocked.length ? `<div class="rs-ach">${unlocked.map((a) => `<span>${a.name}</span>`).join('')}</div>` : ''}
      </div>`;
    el.classList.remove('hidden');
    clearTimeout(this._rsT);
    this._rsT = setTimeout(() => el.classList.add('hidden'), 9000);
  },

  openMeta() {
    let el = document.getElementById('metamodal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'metamodal';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Progress panel');
      el.innerHTML = `<div class="set-panel"><h3>PROGRESS</h3><div class="meta-body"></div>
        <button class="btn sm" id="meta-close">CLOSE</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#meta-close').onclick = () => this.closeMeta();
    }
    el.querySelector('.meta-body').innerHTML = this._metaHtml();
    el.querySelectorAll('[data-claim]').forEach((b) => {
      b.onclick = () => {
        const reward = this.meta.claimDaily(b.dataset.claim);
        if (reward) {
          this.progression.addCoins(reward);
          this.audio.buy();
          this.hud.notify(`Daily complete  +${reward}◈`, true);
          this.openMeta();
        }
      };
    });
    el.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => {
        const n = +b.dataset.slot, act = b.dataset.act, pr = this.progression;
        if (act === 'save') { pr.saveSlot(n); this.hud.notify('Saved to slot ' + n); }
        else if (act === 'load') { if (pr.loadSlot(n)) { this._applyProgression(); this.hud.notify('Loaded slot ' + n); } }
        else { pr.deleteSlot(n); this.hud.notify('Cleared slot ' + n); }
        this.openMeta();
      };
    });
    const asc = el.querySelector('#meta-ascend');
    if (asc) asc.onclick = () => {
      const pr = this.progression;
      if (pr.canAscend()) { pr.ascend(); this.director.difficulty = pr.ngMul; this.hud.notify('ASCENDED  New Game+' + pr.ngPlus, true); this.closeMeta(); }
      else this.hud.notify('Reach level 20 to ascend');
    };
    el.classList.remove('hidden');
  },
  closeMeta() { const el = document.getElementById('metamodal'); if (el) el.classList.add('hidden'); },

  _metaHtml() {
    const m = this.meta;
    const mm = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
    const got = ACHIEVEMENTS.filter((a) => m.achievements[a.id]).length;
    const ach = ACHIEVEMENTS.map((a) => {
      const has = !!m.achievements[a.id];
      const cur = a.goal ? Math.min(a.goal, m.totals[a.id === 'tank' ? 'armorLevel' : a.id === 'gunsmith' ? 'maxedTrack'
        : a.id === 'survive_10' || a.id === 'survive_30' ? 'runTime'
        : a.id === 'untouchable' || a.id === 'untouchable_10' ? 'noHitRun'
        : a.id === 'rich' ? 'coinsHeld' : a.id === 'collector' ? 'weaponsHeld'
        : a.id === 'combo_10' || a.id === 'combo_25' ? 'bestCombo'
        : a.id.startsWith('level') ? 'level' : a.id.startsWith('boss') ? 'bosses'
        : a.id.startsWith('head') ? 'headshots' : 'kills'] || 0) : 0;
      return `<div class="ach ${has ? 'on' : ''}"><b>${a.name}</b><span>${a.desc}</span>
        ${a.goal ? `<i>${has ? '✓' : Math.floor(cur) + '/' + a.goal}</i>` : (has ? '<i>✓</i>' : '')}</div>`;
    }).join('');
    const daily = m.daily.map((q) => {
      const v = Math.min(q.goal, m.dailyValue(q));
      const done = m.dailyDone(q);
      const claimed = m.dailyClaimed[q.id];
      return `<div class="shop-row${done && !claimed ? '' : ' dim'}">
        <div class="shop-info"><b>${q.text.replace('{n}', q.goal)}</b>
        <span>${Math.floor(v)} / ${q.goal}</span></div>
        ${claimed ? '<span class="shop-max">CLAIMED</span>'
          : `<button class="shop-buy" data-claim="${q.id}">+${q.reward}◈</button>`}</div>`;
    }).join('');
    return `
      <div class="meta-sec"><h4>DAILY QUESTS <small>${m.dailyDate}</small></h4>${daily}</div>
      <div class="meta-sec"><h4>PERSONAL BEST</h4>
        <div class="rs-row"><span>Longest survival</span><b>${mm(m.best.time)}</b></div>
        <div class="rs-row"><span>Most kills</span><b>${m.best.kills}</b></div>
        <div class="rs-row"><span>Highest level</span><b>${m.best.level}</b></div>
        <div class="rs-row"><span>Best score</span><b>${m.best.score}</b></div>
        <div class="rs-row"><span>Runs played</span><b>${m.totals.runs || 0}</b></div>
      </div>
      <div class="meta-sec"><h4>CONTRACT</h4>
        ${m.contract ? `<div class="rs-row"><span>${m.contract.text.replace('{n}', m.contract.goal)}</span>
          <b>${Math.floor(Math.min(m.contractProgress(), m.contract.goal))} / ${m.contract.goal} \u00b7 ${m.contract.reward}\u25c8</b></div>` : ''}
      </div>
      <div class="meta-sec"><h4>BESTIARY <small>${Object.keys(m.bestiary).length} types</small></h4>
        ${Object.keys(m.bestiary).length ? Object.entries(m.bestiary).sort((a, b) => b[1] - a[1])
          .map(([n, c]) => `<div class="rs-row"><span>${n}</span><b>${c}</b></div>`).join('')
          : '<div class="rs-row"><span>Nothing logged yet</span><b>—</b></div>'}
      </div>
      <div class="meta-sec"><h4>WEAPON RECORD</h4>
        ${Object.keys(this.arsenal.stats).length ? Object.entries(this.arsenal.stats).map(([id, st]) => {
          const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
          const nm = (WEAPONS[id] && WEAPONS[id].name) || id;
          return `<div class="rs-row"><span>${nm}</span><b>${st.kills} kills · ${acc}% acc</b></div>`;
        }).join('') : '<div class="rs-row"><span>No shots fired</span><b>—</b></div>'}
      </div>
      <div class="meta-sec"><h4>CONTENT PACKS <small>${(this.mods || []).length}</small></h4>
        ${(this.mods || []).length ? this.mods.map((m) =>
          `<div class="rs-row"><span>${m.name}</span><b>${m.weapons}w ${m.enemies}e</b></div>`).join('')
          : '<div class="rs-row"><span>No packs loaded</span><b>—</b></div>'}
        ${(this.modProblems || []).length ? `<div class="rs-best">${this.modProblems.length} pack issue(s) — see console</div>` : ''}
      </div>
      <div class="meta-sec"><h4>ACHIEVEMENTS <small>${got}/${ACHIEVEMENTS.length}</small></h4>
        <div class="ach-grid">${ach}</div></div>
      <div class="meta-sec"><h4>NEW GAME+ <small>loop ${this.progression.ngPlus || 0}</small></h4>
        <div class="rs-row"><span>Enemies are ${Math.round((this.progression.ngMul - 1) * 100)}% tougher, rewards +${Math.round((this.progression.ngReward - 1) * 100)}%</span></div>
        <button class="btn sm" id="meta-ascend" ${this.progression.canAscend() ? '' : 'disabled'}>
          ${this.progression.canAscend() ? 'ASCEND (reset to Lv1)' : 'reach Lv20 to ascend'}</button>
      </div>
      <div class="meta-sec"><h4>SAVE SLOTS</h4>
        ${[1, 2, 3].map((n) => {
          const info = this.progression.slotInfo(n);
          const label = info ? `Lv${info.level} · ${info.coins}\u25c8${info.ng ? ' · NG+' + info.ng : ''}` : 'empty';
          return `<div class="rs-row"><span>Slot ${n}</span><b>${label}</b>
            <button class="btn xs" data-slot="${n}" data-act="save">SAVE</button>
            ${info ? `<button class="btn xs" data-slot="${n}" data-act="load">LOAD</button>
            <button class="btn xs" data-slot="${n}" data-act="del">DEL</button>` : ''}</div>`;
        }).join('')}
      </div>`;
  },

  openSettings() {
    let el = document.getElementById('settingsmodal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'settingsmodal';
      el.innerHTML = `<div class="set-panel"><h3>SETTINGS</h3><div class="set-body"></div>
        <button class="btn sm" id="set-close">CLOSE</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#set-close').onclick = () => this.closeSettings();
    }
    const body = el.querySelector('.set-body');
    body.innerHTML = '';
    body.appendChild(this.settings.buildPanel(() => this._applySettings(), this.input, (key) => {
      // changing the preset rewrites the individual toggles, so redraw the panel
      if (key === 'quality') { this.settings.applyQuality(this.settings.get('quality')); this._applySettings(); this.openSettings(); }
    }));
    el.classList.remove('hidden');
    // when a key is rebound, save it and redraw so the new key shows (and any
    // action that lost its key is visibly flagged as unbound)
    if (this.input) {
      this.input.onBind = (action, code, clash) => {
        this.settings.set('binds', Object.assign({}, this.input.binds));
        if (action) {
          this.hud.notify(clash
            ? 'Bound to ' + action + ' — ' + clash + ' was unbound'
            : 'Bound ' + action + ' to ' + code, true);
        }
        this.openSettings();
      };
    }
  },
  closeSettings() { const el = document.getElementById('settingsmodal'); if (el) el.classList.add('hidden'); }
  });
}
