# API reference

Everything below is the public surface. If you only read one section, read the
config table — most games are a config object and a `GameBase`.

## `new GameBase(canvas, config)`

### Config

**World**

| Key | Default | Meaning |
| --- | --- | --- |
| `seed` | `20261017` | World seed. Same seed = same world. |
| `worldWeights` | mixed | `[['city', 5], ['park', 2], …]` biome weights. |
| `clearZones` | spawn + station | `[{x, z, r}]` kept free of buildings. |
| `startTime` | `0.30` | Time of day (0 = midnight, 0.5 = noon). |
| `dayLength` | `300` | Seconds per full day/night cycle. |
| `fog` | `true` | Distance fog matched to the horizon colour. |
| `renderScale` | `1` | Resolution multiplier. `0.5` is the biggest lever on a weak GPU. |
| `traffic` | `5` | Ambient cars wandering the streets. |

**Enemies**

| Key | Default | Meaning |
| --- | --- | --- |
| `pool` | `['walker','runner']` | Types the director spawns. |
| `maxAlive` | `14` | Soft cap on live enemies. |
| `spawnInterval` | `2.2` | Seconds between director spawns. |
| `autoSpawn` | `true` | Director spawns on its own. |
| `difficulty` | `(g) => 1 + g.stats.time / 110` | Returns the difficulty scalar. |

**Player and progression**

| Key | Default | Meaning |
| --- | --- | --- |
| `startingWeapons` | `['knife','pistol']` | Kit you spawn with. |
| `persist` | `false` | Save/load progression to `localStorage`. |
| `progressionKey` | `ow-progress` | Progression storage key. |
| `metaKey` | `ow-meta` | Achievements / dailies storage key. |

**Structures**

| Key | Default | Meaning |
| --- | --- | --- |
| `safeHouseX` / `safeHouseZ` | `0` | Where the safe house sits. |
| `safeHouseRadius` | `9` | Safe zone radius. |
| `safeHouseTitle` | `SAFE HOUSE` | Name shown on the map. |
| `armory` | `false` | Safe house also sells weapons (police station). |

**Optional systems** — each is off unless you ask for it.

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `undefined` | `'arena'`, `'bossrush'`, `'defence'` or `'extraction'`. |
| `campaign` | `false` | Run the 16-mission scripted chain. |
| `ally` | `false` | Spawn a companion who follows and fights. |
| `allyName` | `'Rook'` | The companion's name. |
| `vehicles` | `undefined` | Set `false` to disable drivable cars. |

**Text**

| Key | Default | Meaning |
| --- | --- | --- |
| `objectiveMain` / `objectiveSub` | — | Initial objective banner. |
| `subtitle` | — | Small line under the title. |

### Hooks

| Hook | Signature | Called |
| --- | --- | --- |
| `onGameplay` | `(dt, game)` | Every frame, while running. |
| `onGameplayKeys` | `(game)` | Every frame, before mode logic — for your own keys. |
| `onKill` | `(enemy, game)` | After a kill is scored. |
| `onLevelUp` | `(level, count, game)` | On level up. |
| `onPickup` | `(type, amount, pos, game)` | On loot pickup. |
| `extraPois` | `(out, game)` | Each frame — push `{x, z, type, label}` markers. |

### Methods

`init()` · `loop()` · `start()` · `pause()` · `respawn()` · `die()` ·
`togglePhoto()` · `toggleReplay()` · `openSettings()` · `closeSettings()` ·
`openMeta()` · `closeMeta()`

### Properties

`world` · `player` · `camera` · `scene` · `renderer` · `arsenal` · `director` ·
`loot` · `progression` · `store` · `safeHouse` · `hud` · `particles` · `audio` ·
`music` · `input` · `settings` · `meta` · `mods` · `stats` · `tables` ·
`safeZones` · `weather` · `sky` · `skyline` · `traffic` · `puddles`

Optional, present only when enabled: `vehicles` · `base` · `ally` · `campaign` ·
`throwables` · `ripples` · `snow` · `replay` · `bloom` · `postfx`

---

## Modules

### `core.js`
`clamp` · `lerp` · `damp` · `mulberry32(seed)` · `hashSeed(x, y, seed)` · `pick(rng, arr)`

### `worldkit.js`
Constants and geometry shared by the world builders: `CHUNK` · `LOAD_R` · `TILE` ·
`WIND` · `G` (shared geometries) · `bake()` · `addColor()`.

### `world.js` — `new World(scene, { seed, weights, clearZones })`
`update(playerPos, budgetMs)` · `warmup(playerPos)` · `collidersNear(x, z, r, out)` ·
`solidsNear(x, z, r, out)` · `spawnAround(pos, minR, maxR)` · `biomeFor(cx, cz)` ·
`isIndoor(pos)` · `lampsNear(pos, n, d)` · `setWet(v)` · `setEmissive(v)` ·
`flicker()` · `buildBudgetMs`

`collidersNear` and `solidsNear` take an optional `out` array — pass a persistent
one in hot paths and they will not allocate.

### `biomes.js` / `props.js`
The generators, installed onto `World.prototype` at import time. `biomes.js` has one
method per biome (`_city`, `_park`, `_desert`, …) plus `_building` and `_enterable`;
`props.js` has the street furniture and foliage (`_tree`, `_lamp`, `_crate`, …).
Add a new biome by adding a method and a weight.

### `player.js` — `new Player(camera, world)`
`update(dt, input, { jump, crouch, prone, leanL, leanR })` · `addLook(dx, dy)` ·
`damage(n)` · `heal(n)` · `breakFree()` · `addShake(a)` · `registerHit(pos)` ·
`applyToCamera(dt)` · `kick(a, b)`

State: `pos` · `vel` · `yaw` · `pitch` · `health` · `stamina` · `crouch` · `prone` ·
`lean` · `slideT` · `zoom` · `flying` · `grabLock` · `regenMul`

### `weapons.js`
`WEAPONS` · `WEAPON_ORDER` · `WEAPON_TRACKS` · `RARITY` · `THEMES` ·
`ATTACH_SLOTS` · `ATTACHMENTS` · `weaponStats(def, up, reloadBonus, att, mastery)` ·
`statDelta(a, b)` · `new Arsenal(scene, camera, player, audio)`

Arsenal: `add(id)` · `switchTo(i)` · `slotOf(id)` · `next()` · `fire(ctx)` ·
`startReload()` · `update(dt, input)` · `heat` · `overheated` · `stats`

Weapons support `pierce`, `ricochet`, `heat`, `altFire` (burst or slug), `silent`,
`explosive` and status effects (`burn`, `bleed`, `shock`).

### `ai.js`
`ENEMY_TYPES` · `new Enemy(typeId, pos, world, difficulty)` ·
`new Director(scene, world, opts)`

Enemy: `update(dt, player, ctx)` · `damage(n, point, dir)` · `applyEffect(kind, t)` ·
`hitWeak(dmg)` · `surrender()` · `reset(typeId, pos, difficulty)` · `dispose()`

Director: `spawnAt(typeId, pos, difficulty)` · `spawnHorde(centre, n, difficulty)` ·
`update(dt, player, ctx)` · `refreshLists()` · `clear()` · `alive` · `getHittables()`

Director hooks: `onDeath` · `onGib` · `onSpawn` · `onSummon` · `onWeakBreak`

`alive` and `getHittables()` return cached arrays rebuilt by `refreshLists()` — call
that once per frame, which `GameBase` already does.

### `enemybody.js`
The modular enemy bodies: heads, torsos, accessories, size and colour jitter,
wounds, limb loss, crawl, death poses and the boss weak-point core.

### `throwables.js` — `new Throwables(scene, world, player, audio, particles)`
`throwFromCamera()` · `cycle()` · `add(kind, n)` · `count()` ·
`spawnPool(pos, kind, opts)` · `update(dt, enemies, ctx)`

`spawnPool` is the general ground-hazard entry point — `'fire'` or `'acid'`.

### `vehicle.js`
`new Vehicles(scene, world, player, audio)` — the fleet and the driving state.

`spawnNear(pos, n)` · `nearest(pos, maxDist)` · `enter(v)` · `exit()` ·
`update(dt, input)` · `setLights(on)` · `driving` · `promptFor(pos)`

`new Vehicle(scene, world, x, z, ry, colour)` — one car. `update(dt, input)` ·
`setLights(on)` · `seat` · `blocked(x, z)` · `dispose()`. Reach for this directly if
you want to place cars yourself rather than letting the fleet spawn them.

### `ally.js` — `new Ally(scene, world, player, audio, name)`
`update(dt, enemies, ctx)` · `damage(n)` · `revive()` · `dispose()`

### `base.js`
`INSTALLS` · `new Base(scene, world, audio)`

`setOrigin(v)` · `install(id, progression)` · `has(id)` · `update(dt, enemies, ctx)`

Installs: `bed` (double regen) · `stash` · `turret` · `forge` (scrap over time).

### `campaign.js`
`MISSIONS` (16) · `new Campaign(hooks)`

`start(index)` · `bump(metric, n)` · `update(dt)` · `current` · `index` · `done`

Metrics: `kills` · `stashes` · `headshots` · `upgrades` · `bosses` · `seconds` ·
`hordeKills` · `cores` · `crafts` · `extractions` · `defences` · `arrests`

### `modes.js`
Installed onto `GameBase.prototype`. `_updateMode(dt, dtW)` dispatches on
`cfg.mode`; `_modeBossRush` · `_modeDefence` · `_modeExtraction` · `_updateArena`.

### `leveling.js`
`RECIPES` · `SETS` · `ARMOUR` · `ARMOUR_TRACK` · `PERKS` ·
`new Progression(key, audio)`

`addXp` · `addCoins` · `spend` · `addScrap` · `craft(id)` · `applyUpgrade(stat)` ·
`buyPerk(id)` · `perk(id)` · `prestige()` · `ascend()` · `canAscend()` ·
`buySet(id)` · `setMods()` · `buyAttach(w, slot, id)` · `equipAttach(w, slot, id)` ·
`addMastery(id)` · `masteryTier(id)` · `saveSlot(n)` · `loadSlot(n)` · `slotInfo(n)` ·
`save()` · `load()` · `reset()`

Getters: `maxHealth` · `runSpeed` · `maxStamina` · `maxArmor` · `xpMul` · `coinMul` ·
`ngMul` · `ngReward` · `statsFor(id)`

### `loot.js` — `new LootSystem(scene, audio)`
`spawn(type, pos)` · `update(dt, player)` · `clear()`

### `store.js` / `safehouse.js`
`new Store(scene, player, audio, { arsenal, hud, onBuy })` ·
`new SafeHouse(scene, player, audio, { arsenal, hud, onBuy })`

Both: `show(progression)` · `close()` · `update(dt, player, input)`.
`Store` also has `priceMod` and `_dailyDeals(items)`.

### `hud.js` — `new HUD(audio)`
`setHealth` · `setAmmo` · `setObjective` · `banner` · `notify` · `killFeed` ·
`damageAt` · `updateBoss` · `setCompass` · `setWanted` · `setEvidence` ·
`setWaypoint` · `setWaypointHud` · `setPrompt` · `setAlly` · `setThrowable` ·
`eliteBars(list)` · `drawMinimap` · `drawFullMap` · `fullMapToWorld(cx, cy, player)` ·
`toggleCategory(cat)` · `applyVisibility(opts)` · `setImmersive(on)` ·
`pushFrame(ms)` · `drawFrameGraph(show)` · `bloodHit` · `flashDamage`

Callbacks: `onWaypoint(wp)`

### `postfx.js` — `new Bloom(renderer)`
`setSize(w, h)` · `render(scene, camera)`

Tunables: `threshold` · `strength` · `motion` · `dof` · `grain` · `raysStrength` ·
`sunUv`

### `settings.js` — `new Settings(key)`
`get(k)` · `set(k, v)` · `all()` · `reset()`. Every key is in `DEFAULTS`.

### `input.js`
`new Input(canvas)` · `ACTIONS` · `keyLabel(code)`

`once(name)` · `clearOnce()` · `pollGamepad()` · `rumble(strength, ms)` ·
`whoHas(code, except)` · `unbound()` · `startRebind(action)` · `cancelRebind()` ·
`binds` · `axis` · `onBind(action, code, clash)`

`ACTIONS` is the single source of truth for what can be rebound — the settings
panel is generated from it, so an action cannot exist without appearing there.

### `audio.js` — `new AudioManager()`
`shot(kind)` · `impact(kind)` · `hurt()` · `buy()` · `error()` · `warn()` ·
`bark(kind, typeName)` · `at(fn, dx, dz, maxDist, pitch)` · `setListener(x, z)` ·
`setAmbience(kind)` · `setWind(v)` · `setRain(v)` · `setReverb(v)` ·
`setMusicMood(mood)`

### `music.js` — `new Music(audio)`
`start(mood)` · `setMood(mood)` · `sting(kind)` · `stop()`. Procedural — 0 KB.

### `sky.js` / `ambience.js` / `particles.js`
`Sky`: `update(cameraPos, sunDir, colours)` · `setMoonPhase(phase, sunDir, pos, night)`
`Ambience`: `Skyline` · `Traffic` · `Puddles` · `Ripples` · `SnowCover`
`Particles`: `impact(pos, n, colour)` · `update(dt)` · `bloodBurst(pos, n)`

### `meta.js` — `new Meta(key)`
`add(stat, n)` · `seen(name)` · `claimDaily(id)` · `recordRun(run)` · `bests` ·
`ACHIEVEMENTS`. All local — achievements, date-seeded dailies, bests.

### `mods.js`
`NEON_MODS` content packs, discovered offline. See [MODS.md](MODS.md).

### `menus.js`
Installed onto `GameBase.prototype`: the pause menu, settings modal, progress panel
and run summary.
