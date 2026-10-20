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
- An eight-mission scripted campaign (`?campaign=1`)

## Planned

- Multi-floor building interiors (single-floor ones ship today)
- Drivable vehicles
- A longer campaign with authored set-pieces

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
