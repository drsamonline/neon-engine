# Balance

All numbers are generated from the live tables (`game.tables`) — this document is
a snapshot of the shipped values, not a wish list.

## Weapons

DPS is `damage × pellets × rpm / 60` for hitscan, and `explosive damage × rpm / 60`
for the launcher (which hits everything in its radius, so its real DPS is higher).

| Weapon | Rarity | Dmg | ×pellets | RPM | Mag | Reload | Price | Unlock | DPS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Combat Knife | common | 70 | 1 | 150 | ∞ | — | 0 | 1 | 175 |
| M9 Pistol | common | 28 | 1 | 320 | 12 | 1.1s | 0 | 1 | 149 |
| .44 Revolver | rare | 62 | 1 | 150 | 6 | 1.7s | 700 | 2 | 155 |
| Vex SMG | rare | 16 | 1 | 800 | 32 | 1.3s | 700 | 3 | 213 |
| Breacher 12g | rare | 14 | 9 | 75 | 6 | 1.8s | 850 | 4 | 158 |
| Compound Bow | epic | 215 | 1 | 55 | 1 | 1.5s | 650 | 5 | 197 |
| AR-7 Rifle | epic | 26 | 1 | 620 | 30 | 1.6s | 1200 | 6 | 269 |
| Longshot .50 | epic | 195 | 1 | 64 | 5 | 2.3s | 1400 | 8 | 208 |
| M249 LMG | legendary | 24 | 1 | 760 | 100 | 3.2s | 1800 | 9 | 304 |
| RPG Launcher | legendary | 190 AoE | 1 | 35 | 1 | 2.6s | 2000 | 11 | 111 AoE |

**Why it is shaped this way.** Price tracks sustained DPS *plus* utility, not DPS
alone. The pistol is free and stays relevant forever because you can upgrade it.
The SMG out-DPSes the revolver at the same price but sprays at range. The shotgun
one-shots anything in its 26 m range but is useless beyond it. The bow has the
lowest DPS on purpose — it is silent and one-shots most of the horde. The sniper
exists to delete bloaters and brutes from 260 m. The LMG is the endgame bullet
hose. The launcher is crowd control, priced for its area damage.

## Enemies

| Enemy | HP | Damage | Speed | XP | Coins |
| --- | --- | --- | --- | --- | --- |
| Crawler | 34 | 6 | 5.2 | 14 | 5 |
| Runner | 42 | 7 | 4.6 | 16 | 6 |
| Walker | 60 | 9 | 2.0 | 12 | 5 |
| Spitter | 70 | 11 | 1.8 | 26 | 10 |
| Screamer | 90 | 8 | 2.6 | 30 | 11 |
| Bloater | 140 | 18 | 1.3 | 34 | 13 |
| Brute | 320 | 24 | 1.6 | 75 | 28 |
| Warlord *(boss)* | 620 | 26 | 3.2 | 380 | 130 |
| Behemoth *(boss)* | 900 | 34 | 1.5 | 420 | 150 |

Criminals (Neon Police) run 45–160 HP, with the **Ringleader** boss at 420 HP.

**Difficulty scaling.** A single scalar `d = 1 + time/110 + level × 0.12` drives:

- health `× (1 + (d−1) × 0.28)`
- damage `× (1 + (d−1) × 0.16)`
- speed `× (1 + min(0.30, (d−1) × 0.04))` — **capped**, so nothing ever outruns you
- spawn cap `min(28, 14 + d × 1.4)`

Because the scalar includes level, new mutations gate on **progression** rather
than the clock: crawlers at d > 1.5, spitters 2.2, bloaters and screamers 2.9,
brutes 4.2, boss timers from 3.5.

## Progression

`xpToNext = 90 × 1.16^(level − 1)` — level 2 costs 90 XP, level 10 costs ~342,
level 20 ~1512. Reaching level 20 is roughly 10,400 XP, or a few hundred kills.

**Weapon upgrades.** Four tracks per weapon, five levels each — 20 upgrades × 10
weapons = **200 purchases**. Cost is `(50 + price × 0.05) × 1.40^level`:

| Weapon | Per level (1→5) | All 5 | All 4 tracks |
| --- | --- | --- | --- |
| Pistol | 50 / 70 / 98 / 137 / 192 | 547 | 2,188 |
| SMG | 85 / 119 / 167 / 233 / 327 | 931 | 3,724 |
| Rifle | 120 / 168 / 235 / 329 / 461 | 1,313 | 5,252 |
| LMG | 150 / 210 / 294 / 412 / 577 | 1,643 | 6,572 |
| Launcher | 170 / 238 / 333 / 466 / 653 | 1,860 | 7,440 |

Each level is `+8%` damage, `+20%` magazine, `−6%` reload or `−7%` spread. Fully
upgraded, a pistol does `+40%` damage with a 24-round magazine — enough to keep it
viable deep into a run, which is the point: **you keep a gun and grow it**.

**Armour.** Tiers (light 60 / medium 110 / heavy 170 max armour) plus **plating**,
six levels at `180 × 1.42^level` (180 → 1,040, 3,087 total), each adding
`+12` max armour and `+2%` absorption.

**Skill points** come from levels only, spent on vitality (+25 HP), speed (+0.7),
stamina (+20) and carry (+3). Respec refunds them for 300 coins.

## Economy

Coins drop from kills in ~5-coin pickups worth **8 each**, so a walker yields ~8 and
a brute ~48. A 700-coin SMG is roughly 90 walkers; fully upgrading the starter
pistol is ~275 walkers. That is deliberate — the upgrade tracks are the long game.

## Known rough edges

- These numbers come from DPS and time-to-kill maths, not from playtesting at
  volume. The *shape* is sound; the *pacing* may want tuning.
- Every value above lives in one place — `ENEMY_TYPES` and `WEAPONS` — so a
  rebalance is a data edit, not a code change.


## Escalation

The horde **grows** as well as hardening. Earlier the alive cap and the spawn
interval were fixed for the whole run, so difficulty came only from enemy health —
it never felt like a horde. Now, with `d` the difficulty scalar:

| | formula | at d=1 | at d=4 | at d=5.6 (30 min) |
| --- | --- | --- | --- | --- |
| Max alive | `min(38, 14 + (d-1)*2.2)` | 14 | 21 | 24 |
| Spawn interval | `max(0.55, 2.2 / (1 + (d-1)*0.16))` | 2.20s | 1.53s | 1.27s |
| Spawns per tick | `1 + floor((d-2)/3)` when d ≥ 3 | 1 | 1 | 2 |

Difficulty itself is `1 + 2.6 * (1 - e^(-t/180)) + t/900`: it climbs quickly for the
first few minutes, then keeps rising but decelerating. At 30 minutes it reaches
**5.6** — previously the linear `1 + t/110` reached **17.4**, which is not a curve,
it is a wall.

## Rewards

Average per non-boss kill: **38.5 XP** and **35.1 coins**.

Coin rewards were doubled in this pass, because weapon prices were far above what
you could earn by the level a weapon unlocked — the rifle unlocked at Lv6 when you
had roughly 400 coins, but cost 1400. The top-end prices also came down. The
intent is that a weapon is reachable within a handful of kills of unlocking, not a
grind of fifty.

## Invariants the audit enforces

- A weapon you **pay for** must not be worse than the free starting pistol, unless
  it is a utility weapon (taser, launcher, flame, knife).
- The alive cap must grow with difficulty and the spawn interval must shorten.
- Difficulty must rise over time and must not exceed 8 by 30 minutes.
