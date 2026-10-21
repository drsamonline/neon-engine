<div align="center">

# Neon Engine

**A code-only open-world game engine for the browser.** No assets, no build step, no dependencies &mdash; every texture, mesh and sound is generated at runtime, so a complete open-world shooter ships in about 915&nbsp;KB and runs offline.

[![Landing page](https://img.shields.io/badge/%E2%96%B6_LANDING_PAGE-neon--engine-2dd4bf?style=for-the-badge)](https://drsamonline.github.io/neon-engine/)
[![Play Dead Zone](https://img.shields.io/badge/%E2%96%B6_PLAY-Dead_Zone-ff5a7a?style=for-the-badge)](https://drsamonline.github.io/neon-games/play/dead-zone/)
[![Play Neon Police](https://img.shields.io/badge/%E2%96%B6_PLAY-Neon_Police-59d0ff?style=for-the-badge)](https://drsamonline.github.io/neon-games/play/neon-police/)

[![License: MIT](https://img.shields.io/badge/License-MIT-2dd4bf.svg)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-0-2dd4bf.svg)](#)
[![Offline](https://img.shields.io/badge/offline-ready-2dd4bf.svg)](#)
[![three.js r160](https://img.shields.io/badge/three.js-r160-9a7cff.svg)](https://threejs.org)
[![WebGL2](https://img.shields.io/badge/WebGL2-required-2dd4bf.svg)](#)


</div>

---


**A code-only open-world game engine for the browser.** No assets, no build step,
no dependencies — every texture, mesh and sound is generated at runtime, so a
complete open-world shooter ships at under 1 MB and runs offline.

Created by **[Dr. Sohil Momin](https://github.com/drsamonline)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-38f2c8.svg)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-0-38f2c8.svg)](#)
[![Offline](https://img.shields.io/badge/offline-ready-38f2c8.svg)](#)
[![three.js r160](https://img.shields.io/badge/three.js-r160-9a7cff.svg)](https://threejs.org)

## Play the games built with it

Both games are free to play, right in your browser — no install, no account.


| Game | What it is | Source |
| --- | --- | --- |
| **[Dead Zone](https://drsamonline.github.io/neon-games/play/dead-zone/)** | Endless zombie survival. No timer, no end — the horde escalates as you level. | [repo](https://github.com/drsamonline/neon-games) |
| **[Neon Police](https://drsamonline.github.io/neon-games/play/neon-police/)** | Respond to crime in an open city. Arrest when you can, shoot when you must. | [repo](https://github.com/drsamonline/neon-games) |

---

# Neon Engine

A small, dependency-light WebGL game engine for **open-world browser shooters**.
It powers two shipped games — *Dead Zone* (zombie survival) and *Neon Police*
(crime response) — and is designed so a new game is mostly a config object plus a
gameplay hook.

Everything is procedural: no image, model or audio files. The city, textures and
sound are all generated in code, so a whole game is about 1.4 MB and works offline.

## Documentation

- [Getting started](docs/GETTING-STARTED.md) — serve it and build your first game
- [Architecture](docs/ARCHITECTURE.md) — how the engine is put together
- [API reference](docs/API.md) — every config key, hook and module
- [Balance](docs/BALANCE.md) — weapons, enemies, progression, economy
- [Mods](docs/MODS.md) — writing and shipping a content pack

## Requirements

- Any modern browser with WebGL2.
- three.js r160 (vendored in `three.module.js` — MIT).
- No build step. Serve the files over HTTP and load `gamebase.js` as an ES module.

```html
<script type="importmap">
{ "imports": { "three": "./engine/three.module.js" } }
</script>
<script type="module" src="./mygame.js"></script>
```

## Modules

| File | Responsibility |
| --- | --- |
| `core.js` | math helpers, seeded RNG, per-chunk hashing |
| `settings.js` | persisted player settings + a reusable settings panel |
| `music.js` | generative adaptive music — menu / calm / combat / boss |
| `ambience.js` | skyline silhouette, traffic, puddles, rain ripples, snow cover |
| `sky.js` | gradient sky dome with sun disc, halo, stars, clouds and moon phases |
| `worldkit.js` | constants and geometry shared by the world builders |
| `world.js` | streaming, materials, textures, queries |
| `biomes.js` | one generator per biome, plus buildings and interiors |
| `props.js` | street furniture, foliage and destructibles |
| `player.js` | first-person controller: walk/run, slide, mantle, prone, lean, ADS |
| `weapons.js` | 14-weapon arsenal, alt fire, attachments, status effects, mastery |
| `ai.js` | enemy archetypes, boss weak points, steering, spawn director |
| `enemybody.js` | modular enemy bodies: heads, wounds, limb loss, boss props |
| `throwables.js` | grenades and molotovs with arcs, fuses and ground hazards |
| `vehicle.js` | drivable cars with arcade handling and headlights |
| `ally.js` | a companion who follows you and fights |
| `base.js` | safe-house installations, including an auto turret |
| `compound.js` | the walled safe-house compound, with a single gate |
| `campaign.js` | the 16-mission scripted chain |
| `loot.js` | drops: ammo, health, armour, coins, magnets, upgrade tokens |
| `leveling.js` | XP, perks, sets, attachments, mastery, prestige, save slots |
| `store.js` | wandering merchant with a shop UI and daily rotating stock |
| `safehouse.js` | safe-zone structure with the skill-point / armoury UI |
| `particles.js` | pooled GPU blood / sparks / dust |
| `postfx.js` | bloom, god rays, motion blur, depth of field, grain, wet ground |
| `audio.js` | procedural WebAudio SFX: weapons, voices, UI, weather, ambience |
| `input.js` | keyboard + mouse + gamepad + full touch controls |
| `hud.js` | bars, minimap, sector map, POIs, boss bar, killfeed, waypoints |
| `menus.js` | pause menu, settings modal, progress panel, run summary |
| `modes.js` | arena, boss rush, defence and extraction modes |
| `meta.js` | achievements, date-seeded dailies, bests — all local |
| `mods.js` | offline drop-in content packs |
| `hud.css` | all shared HUD / touch / shop / map styling |
| `gamebase.js` | the game shell: renderer, day/night, main loop, wiring |
| `BufferGeometryUtils.js` | three.js geometry merging (MIT) |

## Building a game

```js
import { GameBase } from './engine/gamebase.js';

const game = new GameBase(document.getElementById('game'), {
  seed: 1234,
  dayLength: 300,
  worldWeights: [['downtown', 2], ['city', 5], ['park', 2], ['jungle', 2]],
  pool: ['walker', 'runner'],          // enemy types the director spawns
  autoSpawn: true,
  persist: true,                       // save progression to localStorage
  startingWeapons: ['knife', 'pistol'],
  objectiveMain: 'SURVIVE',

  onGameplay(dt, g) { /* your game logic each frame */ },
  extraPois(out, g) { out.push({ x: 0, z: 0, type: 'crime', label: 'Theft' }); },
  difficulty: (g) => 1 + g.stats.time / 75,
});

game.init();
game.loop();
```

### Key hooks

- `onGameplay(dt, game)` — per-frame game logic.
- `onKill(enemy, game)` / `onLevelUp(level, n, game)` / `onPickup(type, amount, pos, game)`.
- `extraPois(out, game)` — add your own map markers.
- `difficulty(game)` — returns the director's difficulty scalar.

### Key subsystems on the game object

`world`, `player`, `arsenal`, `director`, `loot`, `progression`, `store`,
`safeHouse`, `upgradeStation`, `hud`, `particles`, `audio`, `input`, `safeZones`.

## Sound & music — zero bytes

There are **no audio files anywhere**. Every sound and all music is synthesised at
runtime with the WebAudio API, which makes the whole audio layer 0 KB of download:

- **SFX** (`audio.js`) — per-weapon gunshots, dry fire, reload, weapon switch,
  flesh/metal/wood impacts, headshot ding, footsteps per surface, landing, zombie
  groans, screamer wails, bloater hiss, boss roar, pickups, coins, tokens,
  level-up, purchase, UI clicks/errors, thunder, and continuous wind + rain beds.
- **Music** (`music.js`) — a generative engine that schedules notes on a lookahead
  clock. Four moods (menu, calm, combat, boss) crossfade on tempo and layer mix,
  driven live by how close the nearest threat is. Minor-key pad, bass, arpeggio
  and drum layers, so the score never loops audibly.

If you ever want real files instead, drop them in and swap `Music` for an
`<audio>` loop — but you would be adding megabytes for something this does in zero.

## Extending

- **New biome** — add a `_myBiome(ch, r, ox, oz)` method to `World` and a weight.
- **New weapon** — add an entry to `WEAPONS` in `weapons.js` (optionally a model case).
- **New enemy** — add an entry to `ENEMY_TYPES` in `ai.js`.
- **New pickup** — add to `LOOT` in `loot.js` and handle it in `_onPickup`.

## Performance notes

- Static chunk geometry is merged per material with `mergeGeometries`, so a whole
  96-unit chunk is a handful of draw calls instead of hundreds.
- Chunks stream in a 5 × 5 window (480 × 480 world units).
- Shadow maps are 1024² with `normalBias` to avoid acne on large flat surfaces.
- If you need more headroom on mobile: lower `LOAD_R` in `world.js`, shrink
  `sun.shadow.mapSize`, or cap `renderer.setPixelRatio(1)`.

## Author & licence

**Created by Dr. Sohil Momin.**

Free to play. You may use, modify, remix and redistribute the engine — including in
derivative works — **as long as you credit Dr. Sohil Momin as the original
creator**. three.js and `BufferGeometryUtils` remain under their own MIT licences.

See [LICENSE](LICENSE) for the full terms.
