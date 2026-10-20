# Writing a content pack

A pack is a plain script that registers itself. There is **no server, no download
service and no build step** — drop the file in `mods/`, add one `<script>` tag, and
it is loaded. It works with the network unplugged.

## 1. Register

```js
// mods/my-pack.js
window.NEON_MODS = window.NEON_MODS || [];
window.NEON_MODS.push({
  id: 'my-pack',            // required, must be unique
  name: 'My Pack',
  author: 'Your Name',
  version: '1.0.0',

  weapons: [ /* ... */ ],
  enemies: [ /* ... */ ],
  biomes:  [ ['desert', 3] ],   // extra biome weighting
  pool:    ['my-zombie'],       // add to the spawn pool
  overwrite: false,             // true to replace built-in ids
});
```

## 2. Load it

```html
<script src="./mods/my-pack.js"></script>      <!-- before the game module -->
<script type="module" src="./survival.js"></script>
```

## Weapons

Required: `id`, `name`, `kind`, `damage`, `rpm`, `range`. Everything else has a
default.

```js
{
  id: 'railgun', name: 'Railgun', kind: 'sniper',   // kinds: pistol smg rifle shotgun
  damage: 210, rpm: 40, mag: 4,                     // sniper lmg crossbow launcher melee
  reserveMax: 24, spread: 0.001, range: 300,
  reload: 2.6, auto: false, unlock: 12, price: 3200,
  rarity: 'legendary',                              // common rare epic legendary
  palette: { body: '#3a4a6a', accent: '#59d0ff', barrel: '#1a2434' },
}
```

Set `explosive: { radius: 9, damage: 190 }` for splash, `silent: true` so it does
not attract enemies, `pellets: 9` for a shotgun spread.

## Enemies

Required: `hp`, `speed`, `dmg`, `radius`. Also needs `id` and `name`.

```js
{
  id: 'stalker', name: 'Stalker', hp: 110, speed: 5.4, dmg: 15, radius: 0.5,
  scale: 1.0, xp: 60, coins: 22, unlock: 3,
  color: '#2a3a4a', skin: '#4a6a7a',
  behavior: 'chase',        // chase | flee | guard
  sightRange: 70,           // how far it can spot you
  ranged: true, range: 26,  // ranged attackers
  summoner: true,           // calls reinforcements
  explodes: { radius: 6.5, damage: 34 },
  boss: true, elite: true,
}
```

## Rules

- Packs are validated on load. Anything malformed is skipped and reported — a bad
  pack can never break the game.
- Adding an id that already exists is rejected unless you set `overwrite: true`.
- A pack cannot run arbitrary code beyond what the script itself does — treat
  third-party packs the same as any other script you load.

## Reporting

Loaded packs and any problems appear in the **Progress** panel (press `P`).
