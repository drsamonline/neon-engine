// The smallest complete game on the Neon Engine — copy this file to start one.
//
// It deliberately turns on most of the optional systems so you can see them
// working. Delete the ones you do not want; each is a single config key.
import { GameBase } from '../gamebase.js';

const game = new GameBase(document.getElementById('game'), {
  // ---- world ----
  seed: 777,
  dayLength: 360,                 // seconds per full day/night cycle
  worldWeights: [['city', 5], ['park', 2], ['industrial', 2]],
  traffic: 5,

  // ---- enemies ----
  pool: ['walker', 'runner', 'crawler', 'spitter'],
  autoSpawn: true,

  // ---- player + progression ----
  startingWeapons: ['knife', 'pistol'],
  persist: true,
  progressionKey: 'example-progress',
  metaKey: 'example-meta',

  // ---- structures ----
  safeHouseTitle: 'Safe House',

  // ---- optional systems: delete any line you do not want ----
  vehicles: true,                 // drivable cars — F to get in
  ally: true,                     // a companion who follows and fights
  allyName: 'Rook',
  campaign: true,                 // the 16-mission chain
  mode: 'arena',                  // 'arena' | 'bossrush' | 'defence' | 'extraction'

  objectiveMain: 'SURVIVE',
});

game.init();
game.loop();
window.__game = game;   // handy for debugging and for the smoke test

// ---------------------------------------------------------------------------
// Everything below is optional. It shows the three ways you extend the engine.
// ---------------------------------------------------------------------------

// 1. A gameplay hook — reward a coin every 30 seconds survived.
let t = 0;
const base = game.cfg.onGameplay;
game.cfg.onGameplay = (dt, g) => {
  if (base) base(dt, g);
  t += dt;
  if (t > 30) { t = 0; g.progression.addCoins(25); g.hud.notify('+25\u25c8 survival bonus'); }
};

// 2. Your own keys. onGameplayKeys runs every frame before the mode logic, and
//    input.once() gives you an edge event that is not swallowed by anything else.
const baseKeys = game.cfg.onGameplayKeys;
game.cfg.onGameplayKeys = (g) => {
  if (baseKeys) baseKeys(g);
  if (g.input.once('map') && !g.mapOpen) g.hud.notify('Map opens on M — this hook fired first');
};

// 3. React to things happening. The director fires these; you can hang your own
//    logic on any of them.
game.director.onGib = (e, n) => game._gib(e, n);          // body chunks
game.director.onWeakBreak = (e) => {                       // boss core destroyed
  game.hud.notify('Core down — ' + e.t.name + ' staggered', true);
};

// 4. Your own map markers. Push {x, z, type, label}; the type must exist in the
//    HUD's POI_STYLE table, or use 'ping'.
const basePois = game.cfg.extraPois;
game.cfg.extraPois = (out, g) => {
  if (basePois) basePois(out, g);
  out.push({ x: 60, z: -60, type: 'ping', label: 'Your marker' });
};

// 5. Reach into a system directly. Anything on `game` is fair game.
//    game.base.install('turret', game.progression);       // an auto turret
//    game.throwables.spawnPool(game.player.pos.clone(), 'acid', { dps: 20 });
//    game.vehicles.spawnNear(game.player.pos, 3);
