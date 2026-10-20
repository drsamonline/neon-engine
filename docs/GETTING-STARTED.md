# Getting started

The engine has **no build step and no dependencies**. Everything is vanilla ES
modules plus a vendored copy of three.js.

## 1. Running it

**The two game packages launch by double-clicking `index.html`.** They ship as a
single classic-script bundle, so no server is needed.

**The engine source needs a server**, because it is plain ES modules:

```bash
python3 serve.py            # then open http://localhost:8080
# or
python3 -m http.server 8080
```

If you build a game from the engine and want it to launch from disk too, bundle it
with `minify.py` — it emits an IIFE, which is what makes `file://` work. An ES
module is blocked by the browser on `file://`; a classic script is not.

## 2. Wire up a page

```html
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <link rel="stylesheet" href="./engine/hud.css" />
  <script type="importmap">
  { "imports": { "three": "./engine/three.module.js" } }
  </script>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="overlay">
    <div class="panel">
      <h1>MY GAME</h1>
      <button id="playbtn" class="btn">CLICK TO PLAY</button>
    </div>
  </div>
  <script type="module" src="./mygame.js"></script>
</body>
</html>
```

The import map is required: the engine imports `three` as a bare specifier.

## 3. Build a game

```js
// mygame.js
import { GameBase } from './engine/gamebase.js';

const game = new GameBase(document.getElementById('game'), {
  seed: 1234,
  dayLength: 300,
  worldWeights: [['city', 5], ['park', 2], ['jungle', 2]],
  pool: ['walker', 'runner'],       // what the spawn director sends at you
  autoSpawn: true,
  persist: true,                    // save progression to localStorage
  startingWeapons: ['knife', 'pistol'],
  objectiveMain: 'SURVIVE',

  onGameplay(dt, g) {
    // your per-frame logic
  },
});

game.init();
game.loop();
```

That is a complete, playable open-world shooter: streaming city, first-person
controls, weapons, enemies, loot, levelling, a shop, a safe house, a HUD, a map,
music and touch controls.

## 4. Turn systems on

Everything below is off unless you ask for it. They are all just config keys.

```js
const game = new GameBase(canvas, {
  // …the above, plus:

  vehicles: true,          // drivable cars (F to get in). Default on.
  ally: true,              // a companion who follows you and shoots
  allyName: 'Rook',
  campaign: true,          // the 16-mission scripted chain
  mode: 'bossrush',        // 'arena' | 'bossrush' | 'defence' | 'extraction'
});
```

`mode` replaces the normal spawn loop with a game mode:

| Mode | What it does |
| --- | --- |
| `arena` | Endless waves that get bigger and harder. |
| `bossrush` | Bosses only, escalating, with a double-spawn every third. |
| `defence` | Hold a beacon — enemies chew on it and it heals between waves. |
| `extraction` | Crack open caches, then reach the LZ that appears. |

The two shipped games read these from the URL, which is a handy pattern:
`?ally=1&campaign=1&mode=defence`.

## 5. Reach into the systems

```js
// give the player a companion mid-run
import { Ally } from './engine/ally.js';
game.ally = new Ally(game.scene, game.world, game.player, game.audio, 'Vex');

// drop a ground hazard
game.throwables.spawnPool(game.player.pos.clone(), 'acid', { radius: 4, dps: 20 });

// put an installation in the base
game.base.install('turret', game.progression);

// push your own map marker
game.cfg.extraPois = (out) => out.push({ x: 40, z: -20, type: 'ping', label: 'Here' });
```

## 6. Go further

- **Own map markers** — `extraPois(out, game)` pushes `{ x, z, type, label }`.
- **Own difficulty curve** — `difficulty: (game) => 1 + game.stats.time / 120`.
- **Own keys** — `onGameplayKeys(game)` runs every frame before mode logic; pair it
  with `game.input.once('yourAction')`.
- **React to events** — `onKill`, `onLevelUp`, `onPickup`, `onSpawn`, `onDeath`,
  `onGib`, `onWeakBreak`, `onSteal`, `onGrab`.
- **New content** — add to `WEAPONS` / `ENEMY_TYPES`, or a new `World` biome method
  plus a weight. See [API.md](API.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## 7. Check your work

The repo ships two headless tests. They need `puppeteer-core` and a Chromium binary:

```bash
NODE_PATH=$(npm root -g) node tests/smoke.cjs      # does it boot clean?
NODE_PATH=$(npm root -g) node tests/audit.cjs      # does everything actually run?
```

`audit.cjs` executes every biome generator, every weapon (normal and alt fire, plus
reload), every panel, every game mode, the companion, vehicles, crafting, save slots
and New Game+ — and it runs a **static wiring check** that every subsystem is really
called by the game loop. That last one exists because a method can exist, pass a
direct call, and still never run in the real game.

Point it at your own page with `AUDIT_PAGE=/mygame/index.html node tests/audit.cjs`.

## Deploying

The result is a static bundle. Drag the folder onto
[Netlify Drop](https://app.netlify.com/drop), or push to a repo and enable GitHub
Pages. All paths are relative, so it works from a sub-path. A service worker can
cache the whole thing for offline play — see the game packages for an example.

## Shipping smaller

`minify.py` bundles everything with esbuild into two files instead of ~30:

```bash
python3 minify.py        # -> _min/<game>.min.js and _min/three.module.min.js
```

Roughly 900 KB in 2 requests instead of 1.55 MB in ~30. `build_packages.py` runs it
automatically and falls back to readable source if esbuild is not installed.
