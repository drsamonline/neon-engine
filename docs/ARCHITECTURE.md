# Architecture

## The one idea

**Everything is generated in code.** There are no image, model or audio files
anywhere. The city, every texture, every mesh and every sound is synthesised at
runtime. That is why a complete open-world shooter ships at ~1.5 MB and works
offline with no asset pipeline.

## Layering

```
        game (survival.js / police.js)      <- config + gameplay hooks
                      |
              engine/gamebase.js            <- the game shell
                      |
  world  player  weapons  ai  loot  leveling  store  safehouse  hud  ...
                      |
          core.js / three.module.js
```

A game never talks to three.js directly. It configures `GameBase` and implements
hooks; everything else is inherited.

## The frame

`GameBase.loop()` runs one `requestAnimationFrame` cycle:

0. **Death / replay** — if the kill-cam or a replay is playing, it takes the frame
   instead of the normal loop, but rendering and particles keep running.
1. **Time** — `dt` is clamped, bullet time and hit-stop scale it into `dtW`.
2. **Player** — look, move, jump, crouch, prone, lean, slide, mantle, collide,
   footsteps, regen. The player always runs on real `dt`, so bullet time slows the
   world but not you. Driving a vehicle hands movement to `Vehicles` instead.
3. **List refresh** — `director.refreshLists()` rebuilds the live-enemy and
   hittable arrays once, and everything downstream reuses them.
4. **Weapons** — fire/reload/swap, effects, projectiles (projectiles use `dtW`).
5. **World** — stream chunks in and out around the player, within a frame budget.
6. **Entities** — director (enemies), throwables, gibs, base turret, companion,
   loot, enemy projectiles.
7. **World extras** — weather, traffic, puddles, rain ripples, snow cover, street
   lamps, leaves, skyline.
8. **Services** — store, safe houses, interaction prompts.
9. **Gameplay hook** — `cfg.onGameplayKeys(game)` then `cfg.onGameplay(dt, game)`.
10. **Presentation** — HUD, minimap, elite bars, chevron, music, hit direction.
11. **Render** — through the post-processing chain, or straight to the canvas.

## The world

`World` is a 5 × 5 window of 96-unit chunks around the player. A chunk's contents
are derived from `hashSeed(cx, cz, seed)`, so the same seed always builds the same
world and nothing needs saving.

Each chunk collects its geometry into **buckets keyed by material**, then merges
each bucket with `mergeGeometries` into a single mesh. A whole chunk therefore
costs roughly one draw call per material instead of hundreds. This is what lets
the world be large and dense at the same time.

Texture tiling is baked into the UVs rather than the material, so all buildings of
a given facade variant share one material and merge together.

Biomes are chosen per 2 × 2 chunk region from a weighted table, which keeps each
biome coherent across several chunks rather than flickering chunk to chunk.

## Entities

`Director` owns enemy spawning: a weighted pool, a cap, a difficulty scalar and a
spawn timer. `Enemy` is one class driven by a type table — behaviour (chase / flee
/ guard / thief), optional ranged or summoner attacks, optional death explosion,
boss flags.

Enemies **steer** rather than pathfind: the direct heading is tried first, then
progressively wider turns, so they slide along walls instead of grinding into them.
If every heading is blocked — which usually means they spawned inside geometry —
they push toward the target anyway rather than freezing.

Dead enemies are **recycled**, not reallocated: their bodies and materials go into
a pool and the next spawn of that type reuses them. A reused body gets its colours
re-jittered and its wounds and lost limbs restored.

Perception is line-of-sight plus hearing, feeding an idle → suspicious → hunting
machine. On top of that sit flanking, pack fear, ranged spacing, leaping crawlers,
charging brutes and bosses with three phases. Bosses carry a **weak point** — a
glowing core that takes 2.6× damage; breaking it staggers them and pays out.

## Progression

`Progression` holds XP, levels, skill points, coins, scrap, armour tier, armour
plating, per-weapon upgrade levels, perks, prestige, New Game+ loops, attachments,
weapon mastery, gear sets, insurance and save slots. Everything else *reads* from
it:

- `player.maxHealth = progression.maxHealth`, and so on.
- `arsenal` reads `progression.weaponUp[id]` to compute effective weapon stats
  through `weaponStats(def, up, reloadBonus, att, mastery)` — the single place
  upgrades, attachments, perks and set bonuses are applied.

That indirection is why adding a new upgrade track is a few lines: add it to
`WEAPON_TRACKS`, apply it in `weaponStats`, and the shop, HUD and firing code all
follow automatically.

## Audio

`AudioManager` synthesises every sound. `Music` is a separate generative engine
that schedules notes on a lookahead clock, with four moods that crossfade on tempo
and layer mix, driven live by how close the nearest threat is. Neither uses files.

## Module layout

The engine is ~34 small ES modules rather than a few big ones, so each file stays
readable and the browser can fetch them in parallel. The two that grew too large
were split:

- `world.js` keeps streaming, materials and queries. The biome generators live in
  `biomes.js`, the prop builders in `props.js`, and the constants and geometry
  helpers they share in `worldkit.js`. All three attach to `World.prototype`, so
  `this` inside a generator is still the chunk builder.
- `gamebase.js` keeps the shell. The menus and panels live in `menus.js`, the
  alternate modes in `modes.js`, likewise attached to the prototype.

## The build

`minify.py` bundles everything for release with esbuild:

```
engine + game  ->  <game>.min.js       (~263 KB, one request)
three.module   ->  three.module.min.js (~652 KB, one request)
```

That replaces roughly 34 module requests and ~1.55 MB with 2 requests and ~915 KB.
`build_packages.py` runs it and falls back to readable source if esbuild is missing.

## Deliberate limits

- **No physics engine.** Collision is AABB prisms, knockback is impulses, deaths are
  animated. Vehicles use an arcade model, not rigid bodies.
- **No worker threads.** Chunk building is synchronous but **frame-budgeted** — it
  builds nearest-first within a 6 ms slice, so travel never hitches. A worker would
  need a data-serialisation rewrite of the generator for marginal gain.
- **No true cascaded shadows or raymarched SSR.** The sun's shadow frustum is
  tightened and aimed ahead of the player instead, and wet ground uses a planar
  reflection rather than a screen-space raymarch. Both are noted in ROADMAP.md.
- **No asset files at all.** Every texture, mesh and sound is code. That is a
  strength for shipping size and offline play, and a limit if you want authored art.
