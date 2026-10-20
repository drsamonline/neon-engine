# Changelog

All notable changes to the Neon Engine and its games.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [1.22.0] — 2026-10-19

### Fixed — the zombie game was showing police text
You were right, and it was in two places:
- The **zombie title screen** listed the interact key as *"F interact · drive ·
  arrest"*. There is nothing to arrest in Dead Zone. It now reads "enter a vehicle".
- The **shared Controls menu** labelled that action *"Interact / drive / arrest"*,
  so it said "arrest" in both games. The shared label is now neutral
  ("Interact / use") and a game may relabel it for its own world — only Neon Police
  uses the arrest wording.

**The mirror image was broken too.** The police game was showing zombie text: the
run summary read *"Killed by: the horde"*, and the campaign's mission 8 was called
"THE HORDE" in both games. The death text is now per-game (`the horde` / `a suspect`)
and the mission is neutral ("THE SWARM").

Also fixed while in there: the police game's own hint still said *"press E to
arrest"* after interact moved to F.

### Fixed — the build could silently ship stale bundles
While fixing the above I found the packages were being built from **hour-old
bundles**: esbuild disappears when the sandbox recycles, `minify.py` failed
quietly, and `build_packages.py` happily packaged whatever was in `_min/`. My own
verification was then testing the old code and reporting it as fixed.
`build_packages.py` now **refuses to build** if a bundle is older than its sources.

### Audit
New guard: **neither game may contain the other's vocabulary** — police words in
the zombie game, zombie words in the police game, and either in the shared controls
table. It catches the exact bug you reported.

## [1.21.0] — 2026-10-19

### Fixed — map labels piled on top of each other
On the full map (M), every labelled marker drew its name and distance at a fixed
offset, so a cluster of POIs produced a pile of unreadable text. Measured on the
default spawn: **"SAFE HOUSE 17m" overlapped both "Merchant 23m" and
"Upgrade Station 76m"**.

Labels now:
- are **skipped** if they would land on one already drawn, so what you see is always
  readable rather than smeared;
- **flip to the left** of the marker if the right-hand side would run off the canvas;
- are claimed in **priority order** — a boss or the safe house wins its space over a
  stash.

### Changed — the waypoint readout says what it is
It was a bare `◆ 60m ↑` with nothing anchoring it, and it moved into the centre
column in the previous pass. It now names the target: `SAFE HOUSE ◆ 60m ↑`.

### Audit
New guard: map labels must not overlap each other and must not run off the canvas.
It reproduces the old failure exactly if the collision check is removed.

## [1.20.0] — 2026-10-19

Gameplay pass: measured the live tables first, then fixed what was actually wrong.

### Fixed — weapons that were worse than the free starting pistol
Two weapons you paid for were **below the M9 you start with**:
- **Compound Bow** — 140 dps for 650 coins, against the pistol's 149. Now 197.
- **Longshot .50** — 154 dps for 1600 coins. Now 208.
- **Railgun** (in the shipped example mod pack) — 140 dps for **3200** coins, the
  worst value in the game. Now 420 damage at 42 rpm with pierce.

### Fixed — the launcher did zero on a direct hit
`damage: 0` with splash only, so a rocket that hit an enemy squarely did nothing
unless the explosion caught it. It now does 55 direct plus its 190 splash.

### Fixed — prices were far above what you could earn
The rifle unlocked at Lv6, when a typical run had earned about 400 coins, but cost
1400. Coin rewards are now **doubled** (average 35 per kill, up from 18) and the
top-end prices came down. A weapon is now reachable within a few kills of
unlocking rather than a fifty-kill grind.

### Changed — the horde now actually escalates
The alive cap and the spawn interval were **fixed for the entire run**, so the only
thing that ever changed was enemy health. It never felt like a horde. Now the cap
grows (14 → 24), the spawn interval shortens (2.2s → 1.27s), and past difficulty 3
enemies arrive **in pairs**.

The difficulty curve was also replaced: `1 + t/110` reached **17.4** at 30 minutes,
which is a wall, not a curve. It is now
`1 + 2.6*(1 - e^(-t/180)) + t/900`, reaching **5.6** at 30 minutes — still rising,
but never absurd.

### Fixed — a tanky enemy was worth less than a weak one
The Brute (320 hp) gave 75 XP; the Homicide (160 hp) gave 85. The Brute is now 110.

### Audit
Two new guards: **no paid weapon may be worse than the free pistol** (this is what
caught the railgun), and the horde must escalate — cap up, interval down,
difficulty rising but under 8 at 30 minutes. `docs/BALANCE.md` regenerated from the
live tables, with the escalation and reward maths written out.

## [1.19.0] — 2026-10-19

Six bugs you reported, all reproduced first and then fixed.

### Fixed — you could not get out of a vehicle
The "press F to get in" check ran **while you were already driving**, so it
consumed the key before the exit check ever saw it. The two paths are now mutually
exclusive: driving handles exit, on foot handles entry.

### Fixed — the zombies stood still
Two causes. The player spawned **dead centre of the 13-unit safe zone**, and safe
zones are solid to enemies, so they piled up at exactly r=13 and froze — which
looks completely broken. And they had no behaviour for that case at all.
- The player now spawns **just outside** the safe zone, facing the city, so the
  game starts alive.
- Enemies now **pace around the perimeter** when you are inside a safe zone,
  instead of pressing into the wall.
- A **SAFE ZONE** notice explains why nothing is attacking you.

### Fixed — the map arrow pointed the wrong way
It was 180 degrees out, and there were **two** arrow draws (minimap and full map)
with the same mistake. The arrow now points up at yaw 0 and left at yaw 90 —
verified by reading the pixels back off the canvas, not by eye.

### Fixed — the HUD collided with itself
The objective, boss bar, safe-zone notice, waypoint, evidence and notifications were
each absolutely positioned at fixed offsets, so they landed on top of each other;
the prompt and the use hint overlapped directly. They now live in two **flowing
columns** that cannot overlap, and the notification list drops its oldest entry if
the column would reach the prompt. Verified at five viewport sizes with every
element forced on at once.

### Changed — graphics off by default
A new **Graphics preset** (Performance / Balanced / Quality) defaults to
**Performance** on first launch: shadows, bloom, motion blur, depth of field and
grain all off. One click turns them back on. Existing saves are migrated once.

### Changed — models are no longer boxes
Bodies are now built from **rounded, tapered geometry** instead of scaled cubes:
rounded boxes generated at their real size (scaling one unit box squashed the
rounding back into a slab), tapered limbs, plus a jaw, brow and neck so the head
reads as a head. Same silhouette variety, ~1800 triangles per body.

### Audit
Six new guards, one per fix: the vehicle round trip, the spawn being outside the
safe zone, enemies pacing rather than freezing, no HUD overlap, the arrow pointing
the right way, and the built page being a classic script.

## [1.18.0] — 2026-10-19

Launch, controls and performance.

### Added — the games now launch by double-clicking
The game packages ship as a **single classic-script bundle (IIFE)**, not an ES
module. Browsers block modules on `file://`, which is why opening the page used to
hang on the loading screen; a classic script loads fine from disk. **No server
needed** — double-click `index.html` and play. `serve.py` is still there if you
prefer it, and the engine source still needs a server for development.

The build now **asserts** this: it fails rather than shipping a page that uses an
import map or `type="module"`.

### Added — controls you can actually change
- **There was no rebinding UI at all.** There is now a **Controls** section in
  settings listing all **37** actions in groups, with the current key on each and
  anything unbound flagged.
- `Tab`, `Escape` and the weapon number keys were **hardcoded outside the binding
  table**, so they could never be changed. They are now real actions.
- Weapon slots went from `1`–`6` to **`1`–`9`**, matching the 13 weapons.
- Rebinding a key that is already in use **hands it over** and names the action that
  lost it. Duplicate bindings are impossible.
- `ACTIONS` is now the single source of truth: the settings panel is generated from
  it, so an action cannot exist without being rebindable.

### Fixed — the graphics settings did nothing
- **Turning Shadows off had no effect.** `renderer.shadowMap.enabled` was read once
  at boot and never again, so the shadow pass kept running. All graphics toggles now
  apply immediately.
- **Bloom could not be turned off without a reload** — it now disposes and rebuilds
  live.
- **Added a Render scale setting** (0.5–1.0). This is the single most effective fix
  for lag: 0.5 is roughly four times the frame rate on a weak GPU.
- Auto-quality reacts in 1.5s instead of 3, scales down to 0.5, and sheds shadows
  and then bloom before giving up — telling you what it turned off.

### Audit
New guards: no unbound action, no duplicate key, rebinding works, a clash does not
duplicate, every action appears in the menu, and every graphics toggle changes the
renderer. The launch guard checks the built page really is a classic script.

## [1.17.0] — 2026-10-19

### Fixed — the game could hang forever on the loading screen

Opening `index.html` straight from the filesystem (double-clicking it) made the
game sit on "GENERATING CITY…" with no explanation, because **browsers block ES
modules on `file://` URLs** — the module never loads, so `init()` never runs.
Reproduced exactly: the script request fails with a CORS error and the loading bar
stays up permanently.

Three things now stop any boot failure from being silent:

- **A preflight in every page**, before the module loads. It detects `file://` and
  a missing WebGL context and replaces the loading bar with a plain explanation and
  the exact command to run.
- **`init()` is wrapped in a try/catch.** Any exception during setup now prints on
  screen with the technical detail, instead of leaving a frozen progress bar.
- **`START-HERE.txt` and `serve.py`** ship inside both game packages, so the correct
  way to run it is in the folder rather than buried in the README.

### Changed
- **First load is cheaper.** `warmup()` now builds only the 3x3 core synchronously
  and the rest streams in within a second, and bloom is created on the first frame
  rather than during boot. Measured: the game is ready at **1.8s**, and the loading
  bar is faded out at the same moment.
- **The title screen no longer renders at full rate.** Before you press play the
  loop renders at ~12fps, so a weak GPU does not pin the main thread while you read
  the menu.

### Audit
Added a boot guard: every page must carry the preflight, `init` must be wrapped, and
`warmup` must accept a radius. A silent boot failure can no longer ship.

## [1.16.0] — 2026-10-18

Compression and polish.

### Changed
- **three is now bundled into the game file and tree-shaken.** esbuild aliases the
  bare `three` specifier to the vendored build and inlines only what the engine
  actually imports. That is **730 KB in one request** instead of 914 KB in two — a
  20% cut and one fewer round trip. Verified safe by running the full audit against
  the built package: 12 biome generators, 14 weapons, bloom, four game modes and
  every panel, all clean.
- The import map is dropped from the game packages, since three is inlined and there
  is no bare specifier left to resolve.

### Polish
- Moved the stray test screenshots out of the repository root.
- `package.json` version now tracks the changelog (was stuck at 1.0.0).
- Documented the `Vehicle` class, which was exported but only implied by `Vehicles`.
- The generated `.gitignore` now covers `_min/`, `_build/` and `shot-*.png`, so a
  fresh clone stays clean.

### Audit
`docs: []` — every engine module is named in at least one doc, enforced by the
docs-coverage check added last round.

## [1.15.0] — 2026-10-18

Docs pass — the repository now describes itself.

### Changed
- **`docs/API.md` rewritten** to cover the whole surface: every config key (including
  the optional systems), every hook, every module and its public methods. It had
  drifted to describing roughly a third of the engine.
- **`docs/GETTING-STARTED.md` extended** with sections on turning systems on, the
  four game modes, reaching into systems directly, and running the tests.
- **`docs/ARCHITECTURE.md` updated** — the frame description, entity behaviour
  (steering, pooling, perception, weak points), progression, and a corrected
  "deliberate limits" section, which had claimed there was no post-processing stack.
- **Both READMEs updated** — complete module tables, and a controls table that had
  the wrong keys (use moved to F, melee to V, bullet time to X; prone, lean, vehicle,
  waypoint, replay, photo and disguise were all missing).
- **`example/game.js` rewritten** to turn on most optional systems and show the four
  ways to extend the engine.

### Fixed
- **`safehouse.js` used `INSTALLS` without importing it**, so opening the safe house
  threw. This was live in the shipped build: the installations shipped last round
  were unreachable through the UI. My earlier test called `base.install()` directly
  and never exercised the panel.

### Audit
Added a **docs-coverage check**: every engine module must be named in at least one
doc, so the repository cannot silently stop describing itself again. It found five
undocumented modules on its first run.

## [1.14.0] — 2026-10-18

Shadows, wet ground, and a much longer campaign.

### Added
- **Focused shadow frustum** — the sun's shadow camera is now tighter (52 units
  instead of 90), runs at 2048² instead of 1024², and is aimed *ahead* of the
  player in the direction they face rather than centred on them. That is roughly
  2.5x the texel density where shadow detail actually matters.
- **Wet-ground reflection** — a planar reflection mirrored about the horizon,
  blended in below the skyline and scaled by the rain. This is the cheap cousin
  of screen-space reflections: one blurred fetch, no raymarching.
- **Campaign extended to 16 missions**, drawing on the newer systems: destroying a
  boss core, crafting from scrap, completing an extraction, holding defence waves,
  landing 30 headshots, three bosses, and a closing 'LEGEND' mission.

### Note on cascades and SSR
I did not implement true cascaded shadow maps or raymarched SSR. Real CSM needs a
multi-frustum shadow helper (a substantial vendored dependency), and true SSR needs
a depth buffer plus a per-pixel raymarch — both are heavy for a project that runs
in software rendering here. What shipped instead is the focused single frustum and
the planar reflection, which capture most of the visible benefit at a fraction of
the cost. Both are recorded as open items in ROADMAP.md.

### Audit
Wiring check now guards 53 integrations. The campaign is driven end to end and
asserted to reach its final mission.

## [1.13.0] — 2026-10-18

Audio character, weather on the ground, and replay.

### Added
- **Per-type enemy voices** — every enemy has its own throat: a base pitch,
  waveform, duration and slide, with growls getting a detuned second layer.
  A brute and a crawler no longer sound alike, and an unknown type falls back
  cleanly.
- **Rain ripples** — expanding rings where rain hits standing water, pooling
  around the player and fading out.
- **Snow cover** — snow settles on the ground while you are out in it and melts
  away when you leave the biome.
- **Replay capture** — the last ~20 seconds of your movement is recorded
  continuously; press K to fly the camera back along it, K again to stop.

### Audit
Wiring check now guards 46 integrations. Voices, ripples, snow and replay are each
verified by execution, including that snow melts back down and that the replay
camera actually follows the recorded path.

## [1.12.0] — 2026-10-18

Progression variety and accessibility.

### Added
- **Gear sets** — four loadouts you buy once and wear one at a time: Assault Kit
  (reload and damage), Juggernaut Rig (armour for speed), Scout Harness (speed for
  health) and Ghost Suit (quieter, faster heat decay). Wearing one is a toggle.
- **Rotating shop stock** — three items are 25% off each day, chosen from a
  date-seeded draw so the same deals hold for everyone all day.
- **Headlights** — cars switch their beams on after dark.
- **Film grain** — an optional animated grain pass in the composite.
- **Accessibility** — ARIA roles and labels on every panel, live regions for the
  objective and notification feed, and a one-handed layout that gathers the touch
  controls onto one side.

### Audit
Wiring check now guards 41 integrations. Gear-set stat effects are verified by
measuring the stats before and after equipping and unequipping, including that
unequipping leaves nothing behind.

## [1.11.0] — 2026-10-18

Base building, insurance, and police systems.

### Added
- **Safe-house installations** — a field bed (double regen), an ammo stash, a scrap
  forge (trickles scrap while you are out) and an **auto turret** that tracks and
  shoots anything hostile near your base. Bought once, permanent.
- **Insurance** — three tiers that decide how much of your coin purse survives
  death (50% base, up to 95% fully covered).
- **Faction reputation** for Neon Police — resolving crimes and making arrests
  raises your standing, which earns a shop discount of up to 25%.
- **Disguises** (J) — while disguised your wanted heat decays much faster.
- **Arrests and evidence** — cuff anyone who has surrendered (F) for a payout and
  a piece of evidence. Five pieces turn in for a bonus and a reputation bump.

### Fixed
- Pressing the interact key **anywhere** consumed it, so nothing else could ever
  see it — the check now confirms something is in range before consuming.
- The disguise toggle was bound to `prone`, which is a held key and never produced
  an edge event, so it could never fire. Now its own key (J).

### Audit
Wiring check now guards 34 integrations. Installations, insurance, reputation,
disguises, arrests and evidence were each verified by execution.

## [1.10.0] — 2026-10-18

Visual polish.

### Added
- **First-person hands** on every weapon — a gloved trigger hand and support hand,
  with the support hand dropping away and returning during a reload.
- **Motion blur** that scales with how fast you are turning and moving, and eases off
  while aiming.
- **Depth of field** — the blurred half-res copy is blended in away from the screen
  centre, and tightens when you aim down sights.
- **Moon phases** — a moon rises opposite the sun and runs its own ~29-day cycle,
  its shadow disc sliding across to carve the phase.

### Changed
- The post-processing chain now folds motion blur and depth of field into the final
  composite and keeps the previous frame for the smear, rather than adding passes.

### Audit
Wiring check now guards 28 integrations. Motion blur, DOF, the moon and the hands
were each verified by executing them — including that the support hand actually
moves during a reload and returns afterwards.

## [1.9.0] — 2026-10-18

HUD, navigation and enemy-AI depth.

### Added
- **A filterable map** — the legend categories (safe houses, loot, threats, terrain)
  are clickable toggles, and the map only draws what is switched on.
- **Custom waypoints** — click the sector map to drop a marker. It shows on both
  maps, the HUD gives a distance and a bearing arrow, and pressing M while the map
  is open clears it.
- **Contextual prompts** — a single hint line telling you what F will do, nearest
  thing first (drive, safe house, trade, safe zone).
- **A kill-cam** — on death the camera sweeps around where you fell, framed on
  whoever killed you, then hands over to the run summary.
- **Boss weak points** — bosses carry a glowing core that takes 2.6x damage.
  Destroying it staggers them, throws gibs and pays out coins. The core pulses so
  it reads as a target, and it is restored when a pooled boss is reused.
- **Obstacle steering** — enemies now try progressively wider headings when the
  direct path is blocked, so they slide along walls instead of grinding into them.

### Audit
The wiring check now guards 23 integrations, and the audit exercises steering and
the boss core directly (including that weak-point damage does not leak into the
boss's main health). All clean.

## [1.8.0] — 2026-10-18

A combined batch, then a declutter and audit pass.

### Added
- **Drivable vehicles** — cars spawn as you explore, press F to get in or out,
  arcade handling with a handbrake, and they bounce off walls rather than sticking.
- **Pickpocket** — a thief that creeps up, lifts your coins and runs. Kill it to get
  them back; let it reach 58m and the money is gone.
- **Acid pools** — spitters leave a corrosive pool where their shot lands. Ground
  hazards hurt you as well as them.
- **Gibs** — explosive, elite and boss deaths throw body chunks that bounce and fade.
- **Grab attacks** — brutes grab you; you are held and bitten until you break free
  with melee (V).
- **Scrap and crafting** — enemies drop scrap; six recipes at a safe house convert it
  into ammo, medkits, throwables, armour or coins.
- **Save slots** (three, with save/load/delete) and **New Game+** — ascend at level 20
  for tougher enemies and bigger rewards.
- **God rays** — a radial blur of the bright pass toward the sun's screen position.
- **A cloud layer** that scrolls and darkens at night.
- **Audio occlusion and doppler** — sounds behind walls are muffled and dulled, and
  pitch shifts with relative motion.
- **A jukebox** — pick the music mood (auto / calm / combat / off).

### Changed
- Reused scratch vectors in the enemy hot path instead of allocating per frame.
- Removed unreachable code and un-exported two internal-only helpers.

### Audit
`tests/audit.cjs` gained a **static wiring check** after it emerged that five
integration patches had silently failed — the methods existed and passed direct-call
tests, but were never called by the loop. Game modes, elite bars, gibs, grab
break-out and crafting results were all affected. The check now guards every
subsystem, and all pass.

## [1.7.0] — 2026-10-18

World depth, game modes and a companion.

### Added
- **Two-floor interiors.** Roughly 40% of enterable buildings now have a second
  floor: a mid slab with a stairwell opening, an inside staircase up to it, upper
  loot, a crate and a stash.
- **Three more game modes**, selectable with `?mode=`:
  `bossrush` (bosses only, escalating), `defence` (hold a beacon through waves —
  enemies chew on it and it heals between waves), and `extraction` (crack open
  caches, then reach the LZ).
- **A wanted system** for Neon Police — every kill raises the heat, it bleeds off
  when you lie low, and the wanted level scales how many criminals come for you.
  Shown as stars in the HUD.
- **A companion** (`?ally=1`) — a friendly that follows you, shoots what you shoot,
  can be downed, and picks itself back up after a while.

### Audit
`tests/audit.cjs` now also steps **all four game modes** and the companion's
down/revive cycle. All clean.

## [1.6.0] — 2026-10-18

Movement, weapon depth, HUD and an audit pass.

### Added
- **Movement:** slide (crouch at a sprint), ledge mantle (jump at a chest-high
  ledge), lean left/right (Q/E, with camera roll), and prone (Z).
- **Weapons:** alt-fire — a burst on the pistol and rifle, a heavy slug on the
  shotgun — plus overheat on the LMG and minigun (with a HUD heat bar), and
  ricochet on the sniper.
- **Weapon mastery:** every 40 kills with a weapon permanently adds 3% damage to
  it, up to five tiers.
- **HUD:** floating health bars over damaged elites and bosses, a "killed by" line
  in the run summary, and per-element visibility toggles (minimap, compass,
  kill feed, credit) plus an immersive mode that hides the HUD.
- **Accessibility:** a limit-flashes option for photosensitivity.
- **Repo:** an ESLint config, a licensing FAQ, and `tests/audit.cjs`.

### Fixed
- `store.js` referenced `def` outside the block that declared it, so opening the
  merchant threw.
- `input.js` read the key bindings before they were initialised (a TDZ error that
  broke all input).
- The alt-fire burst queue was never cleared, blocking every later alt-fire.

### Audit
`tests/audit.cjs` executes **every biome generator, every weapon (normal and alt
fire, plus reload), every panel and every effect**. All clean.

## [1.5.0] — 2026-10-18

Performance, modularity and a minified build.

### Changed
- **Split the two largest modules.** `world.js` 887 → 454 lines (generators moved
  to `biomes.js`, prop builders to `props.js`, shared constants to `worldkit.js`);
  `gamebase.js` 1300 → 1118 lines (`menus.js`, `modes.js`). No behaviour change.
- **Removed the per-frame allocations.** The live-enemy list and hittables are now
  rebuilt once per frame and reused instead of being re-filtered and re-concatenated
  several times; `collidersNear`/`solidsNear` take a reusable output buffer; the
  enemy AI reuses scratch vectors instead of allocating a target per frame.

### Added
- **A minified, bundled build.** `minify.py` uses esbuild to bundle the whole engine
  and game into one file and minify three. The games now load **2 requests instead
  of ~30**, at **~880 KB instead of ~1.55 MB** — about 45% fewer bytes. `hud.css` is
  minified too. `build_packages.py` runs it automatically and falls back to readable
  source if esbuild is unavailable.

## [1.4.0] — 2026-10-18

Roadmap items.

### Added
- **Gamepad support** (Gamepad API) — analog sticks for movement and look with a
  deadzone, full button mapping, and haptics on fire and impacts. Movement accepts
  analog input alongside the keyboard.
- **Weapon attachments** — optic, muzzle, magazine and grip slots, bought once per
  weapon and swapped freely. Compensators, suppressors, extended and drum mags,
  grips and sights each modify real stats.
- **Positional reverb** — a generated convolution impulse, mixed up indoors and
  down out on the street.
- **A scripted campaign** — eight missions tracked across kills, caches, headshots,
  upgrades, bosses, survival time and horde clears, with coin rewards. Enable with
  `?campaign=1`.

## [1.3.0] — 2026-10-18

Performance, world depth and photo mode.

### Added
- **Frame-budgeted chunk streaming.** Chunks build within a 6 ms per-frame budget,
  nearest first, instead of all at once — travel no longer hitches. `warmup()`
  still builds the whole window synchronously at startup.
- **Enemy recycling.** Dead enemies are pooled and reset rather than reallocated,
  so their bodies and materials are reused. A run of 10 kills recycles 10 objects
  and the next spawn is the same object.
- **Frame-time graph** in the debug overlay (F3), with 16.7 ms and 33 ms guides.
- **Platform standing.** The player can now stand on top of crates, barrels, roofs
  and stair treads rather than only on the ground plane.
- **Enterable buildings** — hollow interiors with a doorway, lit windows, interior
  loot and an outside stair to the roof.
- **Breakable windows** and **hidden stashes** (crack one open for 45–90 coins).
- **Photo mode** (`O`) — freezes the world, hides the HUD and lets you fly.
- **Screen blood** splatter when you take a hit.

### Notes
- Deliberately *not* done: a web worker for chunk generation. The generator builds
  three.js geometry directly, so a worker would need a full data-serialisation
  rewrite for less benefit than frame-budgeting gives. InstancedMesh was also
  skipped — static props are already merged to one draw call per material per
  chunk, which instancing would not improve on.

## [1.2.0] — 2026-10-18

The remaining offline feature pass. Still no backend and no network calls.

### Added
- **Combat:** three new weapons (arc taser, purifier flamethrower, vulcan minigun
  with spin-up), status effects (burn / bleed / shock), bullet penetration, shell
  casings, muzzle smoke, directional blood spurts, damage numbers, recoil patterns,
  scope overlay, per-weapon accuracy records.
- **Throwables:** frag grenades and molotovs with real arcs, bounces, fuses and
  burning ground pools.
- **AI:** line of sight and hearing feed an idle → suspicious → hunting machine;
  flanking, ranged spacing, leaping crawlers, charging brutes, pack fear, boss
  phases with ground slams, and a director that eases off when you are nearly dead
  and pushes harder at night.
- **World:** three new biomes (wastes, frozen ground, marsh), destructible crates
  and explosive barrels, roaming hordes, and wind-swayed foliage.
- **Visuals:** bloom post-processing (opt out with `?nobloom=1`), contact shadows.
- **Audio:** positional enemy sound, per-biome ambience beds, enemy callouts, and
  melodic stingers for bosses, wave clears and level ups.
- **UI:** radial weapon wheel (hold Tab), bestiary, weapon records, contracts.
- **Progression:** six perks, prestige (rebirth for permanent bonuses).
- **Modes:** wave/arena mode.
- **Accessibility:** reduced motion, HUD scaling, three colour-blind palettes,
  difficulty presets, callout toggle.
- **Repo:** GitHub Actions workflow, a runnable `example/` game, `ROADMAP.md`.

### Fixed
- `weaponStats` read `this.perkReload` from module scope, where `this` is undefined —
  any weapon stat lookup threw.

## [1.1.0] — 2026-10-18

Offline feature pass. No backend, no network calls anywhere.

### Fixed
- **Critical:** enemies assigned `this.damage` as a number, shadowing the
  `damage()` method — every weapon hit threw a TypeError, so enemies could not be
  killed by shooting at all. Renamed to `attackDamage`.
- The survival spawn pool rebuilt itself each frame, discarding enemies added by
  content packs.

### Added
- **Modular enemy bodies** (`enemybody.js`) — each spawn is assembled from a
  shuffled kit: 5 head shapes, 4 torsos, 6 accessories, size jitter, colour
  jitter, 3 walk cycles and 3 death poses. 40 walkers produced 40 distinct
  silhouettes. Plus progressive wounds, limb loss with stumps, a crawl state,
  elites with a self-glow, boss props with an aura, and corpses that linger.
- **Enemy perception** — sampled line-of-sight, hearing (gunshots and footsteps
  call `director.makeNoise`), and an idle → suspicious → hunting state machine
  with a floating "!" cue.
- **Local meta** (`meta.js`) — 19 achievements, three date-seeded daily quests,
  personal bests, and an end-of-run summary. All in localStorage.
- **Content packs** (`mods.js`) — drop a script in `mods/` and it registers new
  weapons, enemies, biomes and spawn-pool entries. Fully offline.
- **Vaulting** — sprint into a waist-high obstacle and you hop it.
- **Rebindable controls** — 14 actions, persisted to settings.

## [1.0.0] — 2026-10-18

First public release. The engine powers two games, *Dead Zone* and *Neon Police*.

### Engine
- Infinite streaming world across **nine biomes** (downtown, city, residential,
  industrial, jungle, park, playground, school, plaza), seeded and fully procedural.
- Static chunk geometry merged per material with `mergeGeometries` — a 96-unit chunk
  is a handful of draw calls instead of hundreds.
- Gradient sky dome with a sun disc, halo and night stars; a full day/night cycle
  drives the sun, sky, fog, ambient fills and the building window glow.
- First-person controller: walk/run, stamina, ADS zoom, crouch, coyote time, jump
  buffering, landing dip, fall damage and view-model sway.
- **Ten weapons** with per-weapon palettes, four rarity tiers and six selectable
  colour themes; hitscan, pellets, projectiles and explosive splash.
- **Per-weapon upgrade tracks** (Damage / Magazine / Reload / Accuracy, five levels
  each) plus **armour plating** — 200+ purchasable upgrades that extend the level cap.
- Enemy archetypes with behaviours, bosses, telegraphs, pack cohesion and ragdoll
  deaths; a spawn director with difficulty scaling.
- Loot, magnets, coins, a wandering merchant, safe zones and safe houses.
- Generative adaptive music (menu / calm / combat / boss) and a full procedural SFX
  library — **zero audio files**.
- Full touch controls, persisted settings, minimap, sector map, POIs and pings.

### Games
- **Dead Zone** — endless zombie survival with mutations, bosses and a full economy.
- **Neon Police** — crime-response sandbox with a dispatch system, arrests and scoring.
