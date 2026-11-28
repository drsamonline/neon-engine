# Roadmap

What is done, what is planned, and what is deliberately out of scope.

## Shipped

- Infinite streaming world, 12 biomes, merged chunk geometry
- Day/night cycle, weather, traffic, street lamps, skyline
- First-person controller: crouch, vault, coyote time, jump buffer, fall damage, sway
- 13 weapons + 4 upgrade tracks each, 6 colour themes, rarity tiers
- Grenades and molotovs with real arcs, bounces, fuses and fire pools
- Status effects (burn, bleed, shock), penetration, spin-up, recoil patterns
- Modular enemy bodies — shuffled parts, wounds, limb loss, crawl, death poses
- Enemy perception: line of sight, hearing, alert states, flanking, fear, leaps, charges
- Boss phases and ground slams
- Destructible crates and explosive barrels
- Loot, magnets, coins, merchants, safe zones, safe houses
- 19 achievements, daily quests, contracts, personal bests, bestiary
- Per-weapon upgrades, armour plating, perks, prestige
- Wave/arena mode
- Drop-in content packs
- Generative adaptive music and a full procedural SFX library (zero audio files)
- Bloom post-processing, HUD, minimap, sector map, weapon wheel, photo-ready debug view
- Full touch controls, rebinding, accessibility options
- Gamepad support with haptics
- Weapon attachments (optic / muzzle / magazine / grip)
- Positional convolution reverb (indoor vs street)
- An eighteen-mission scripted campaign (`?campaign=1`) — every mission's metric is
  wired and asserted, so none of them can dead-end (`tests/campaign.cjs`)
- **Multi-phase set-piece missions** — missions 17 and 18 ("THE BREACH", "LAST LIGHT")
  are cleared in ordered phases, and a later phase's metric cannot advance an earlier
  one (`campaign.js` → `phasesOf`, `tests/campaign.cjs`)
- **Live objective revision** — a beat can rewrite the objective a phase already handed
  out, without editing the authored mission table (`campaign.js` → `revisePhase`)
- **A beat on a clock** — a phase carries `revise: { after, … }` and `update()` applies
  it when its time arrives; THE BREACH's first phase tightens from 15 kills to 25 after
  30 s, keeping the kills already made (`campaign.js` → `_tickRevision`)
- **The hand-off gap has no live phase** — `update()` cannot complete the next mission
  with the closed one's progress (`tests/campaign.cjs` section 8)
- Two-floor building interiors in the city: a slab at 3.3 m cut by a stairwell, an
  inside staircase within the controller's step limit, and loot that can only be
  reached from upstairs (`tests/world.cjs` asserts every one of those)
- Drivable vehicles with arcade handling (`vehicle.js`)

## Planned

- More set-pieces, and the authored CONTENT for beats inside a mission: the engine can
  now rewrite a live objective (`revisePhase`) and spawn on a beat, but no shipped
  mission triggers one yet — that needs a beat table and a set-piece that uses it

## Considered and rejected

- **Web worker for chunk generation.** The generator builds three.js geometry
  directly; a worker would need a full data-serialisation rewrite. Frame-budgeted
  streaming (6 ms/frame, nearest first) removes the hitch for far less complexity.
- **InstancedMesh for props.** Static props are already merged to one draw call per
  material per chunk, which instancing cannot beat for static geometry.

## Out of scope

- **Multiplayer of any kind.** Browsers cannot listen for incoming connections, so a
  player-hosted server is impossible without a native wrapper; WebRTC would need a
  signalling service and a host-authoritative rewrite. Not planned.
- **Any backend.** No accounts, no cloud saves, no leaderboards, no telemetry. The
  whole project runs offline from static files.
