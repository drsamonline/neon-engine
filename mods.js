// mods.js — drop-in content packs. No server, no download service: a pack is a
// plain script (or JSON) that registers itself, and the engine merges it in.
//
//   <script src="./mods/my-pack.js"></script>   (before the game module)
//
//   window.NEON_MODS = window.NEON_MODS || [];
//   window.NEON_MODS.push({
//     id: 'my-pack', name: 'My Pack', author: 'You', version: '1.0.0',
//     weapons: [ { id: 'railgun', name: 'Railgun', kind: 'sniper', ... } ],
//     enemies: [ { id: 'stalker',  name: 'Stalker', hp: 90, ... } ],
//     biomes:  [ ['desert', 3] ],
//   });

import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { ENEMY_TYPES } from './ai.js';

const REQUIRED_WEAPON = ['id', 'name', 'kind', 'damage', 'rpm', 'range'];
const REQUIRED_ENEMY = ['id', 'name', 'hp', 'speed', 'dmg', 'radius'];

const applied = [];
const problems = [];

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function validateWeapon(w, packId) {
  for (const k of REQUIRED_WEAPON) {
    if (w[k] === undefined) { problems.push(`${packId}: weapon "${w.id || '?'}" missing "${k}"`); return false; }
  }
  if (!isFiniteNum(w.damage) || !isFiniteNum(w.rpm)) { problems.push(`${packId}: weapon "${w.id}" has non-numeric damage/rpm`); return false; }
  return true;
}

function validateEnemy(e, packId) {
  for (const k of REQUIRED_ENEMY) {
    if (e[k] === undefined) { problems.push(`${packId}: enemy "${e.id || '?'}" missing "${k}"`); return false; }
  }
  if (!isFiniteNum(e.hp) || e.hp <= 0) { problems.push(`${packId}: enemy "${e.id}" needs hp > 0`); return false; }
  return true;
}

/* fill in the optional fields so a pack only has to describe what is new */
function normaliseWeapon(w) {
  return {
    mag: 12, reserveMax: 120, spread: 0.02, pellets: 1, reload: 1.5, auto: false,
    unlock: 1, price: 500, ch: 1.0, rarity: 'rare',
    palette: { body: '#4d5a72', accent: '#38f2c8', barrel: '#2a3140' },
    ...w,
  };
}
function normaliseEnemy(e) {
  return {
    behavior: 'chase', xp: 15, coins: 6, unlock: 0, scale: 1, radius: 0.5,
    color: '#5a7a4a', skin: '#7a9a5a',
    ...e,
  };
}

/* merge one pack in; returns a small report */
export function registerMod(pack) {
  const id = pack && (pack.id || pack.name);
  if (!id) { problems.push('a pack is missing "id"'); return null; }
  if (applied.some((m) => m.id === id)) { problems.push(`duplicate pack id "${id}"`); return null; }

  const report = { id, name: pack.name || id, author: pack.author || 'unknown',
    version: pack.version || '1.0.0', weapons: 0, enemies: 0, biomes: 0, skipped: 0 };

  for (const w of pack.weapons || []) {
    if (!validateWeapon(w, id)) { report.skipped++; continue; }
    if (WEAPONS[w.id] && !pack.overwrite) { problems.push(`${id}: weapon "${w.id}" already exists (set overwrite:true to replace)`); report.skipped++; continue; }
    WEAPONS[w.id] = normaliseWeapon(w);
    if (!WEAPON_ORDER.includes(w.id)) WEAPON_ORDER.push(w.id);
    report.weapons++;
  }

  for (const e of pack.enemies || []) {
    if (!validateEnemy(e, id)) { report.skipped++; continue; }
    if (ENEMY_TYPES[e.id] && !pack.overwrite) { problems.push(`${id}: enemy "${e.id}" already exists (set overwrite:true to replace)`); report.skipped++; continue; }
    ENEMY_TYPES[e.id] = normaliseEnemy(e);
    report.enemies++;
  }

  report.biomes = (pack.biomes || []).length;
  report.pool = pack.pool || null;          // optional: add to the spawn pool
  report.extraBiomes = pack.biomes || [];
  applied.push(report);
  return report;
}

/* apply every registered pack */
export function applyMods() {
  const list = (typeof window !== 'undefined' && Array.isArray(window.NEON_MODS)) ? window.NEON_MODS : [];
  for (const pack of list) registerMod(pack);
  return { mods: applied.slice(), problems: problems.slice(),
    extraBiomes: applied.flatMap((m) => m.extraBiomes || []),
    pool: applied.flatMap((m) => m.pool || []) };
}

export function listMods() { return applied.slice(); }
export function modProblems() { return problems.slice(); }

/* optional: discover packs listed in mods/index.json when served over HTTP.
   Purely a convenience — script-tag registration works with no fetch at all. */
export async function discoverMods(base = './mods/') {
  if (typeof fetch !== 'function') return [];
  try {
    const res = await fetch(base + 'index.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const idx = await res.json();
    return Array.isArray(idx.mods) ? idx.mods : [];
  } catch (_) { return []; }
}
