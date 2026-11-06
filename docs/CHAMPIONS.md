# Champion data and kits

20 playable champions: Master Yi, Twitch, Wukong, Yuumi, Naafiri, Irelia, Lux, Rengar, Garen, Ashe, Annie,
Malphite, Ezreal, Jinx, Leona, Blitzcrank, Morgana, Zed, Darius, Ahri.

## Architecture (data separate from logic)

| Layer | Where | What |
|---|---|---|
| Reference data | `src/champions/data/*.json` | Generated. Never hand-edited. |
| Generator | `scripts/build-champions.mjs` | `node scripts/build-champions.mjs` re-pulls everything. |
| Typed access + calc evaluator | `src/champions/ref.ts` | Reads the JSON; evaluates CommunityDragon `GameCalculation` trees. |
| Roster / presentation | `src/champions/index.ts` | Stats, text, per-rank cooldown/cost/range from the data; colour, item build and AI hints are the only hand-written fields. |
| Behaviour | `src/kits/*.ts` | One `register(id, { cast: [Q,W,E,R], passive })` per champion; every number is read via `K.v()` / `K.calc()`. |
| Engine hooks | `src/main.ts` | `castKit`, `KApi`, passive hooks, status effects (silence, charm, untargetable, damage reduction, armor shred, DoTs, marks, pets, recasts). |

Debug helpers: `node scripts/dump-kit-data.mjs Lux`, `node scripts/eval-calc.mjs Lux Q LuxLightBinding 3`.

## Sources

* **Text, titles, tags, resource, base stats, attack range, cooldowns, costs, cast ranges**: Riot Data Dragon, patch 16.22.1.
* **Per-rank damage, ratios, shields, durations, missile speeds**: CommunityDragon export of the client files, same 16.22 patch. This is a community-run extraction, not an official Riot API.
* Stat growth uses League's formula `base + g*(n-1)*(0.7025+0.0175*(n-1))`; regen from Data Dragon per-5s values.

## Not verifiable / approximated (flagged, not invented)

Values not present in either source, or mechanics the engine cannot express. Each is marked in the kit code.

* **Missing from the data**: Irelia R wall radius (450 used); Ashe R full-stun distance (3500) and slow/AoE strength; Jinx R full-damage distance (1500); Darius Q inner-circle radius (250); Leona Q, Darius W, Blitzcrank E "next attack" windows (5s); Naafiri packmate health; Wukong clone health; Rengar `0.25s` cooldowns are as listed by Riot.
* **Ambiguous per-level tables**: `ByCharLevelFormula` tables (Lux passive, Rengar W empowered) - index = level-1, or = level when the first entry is 0.
* **Crits do not exist in this game**: Ashe's Frost Shot bonus (scales with crit chance) is therefore 0; Master Yi / Garen crit parts evaluate to 0.
* **Simplified**: Yuumi attach (follows ally, untargetable; no turret exception, no bond bonuses, Q not steerable); Zed shadows are positions, not units; Wukong/Naafiri/Annie summons are minion-model units following the owner; Twitch camouflage is not revealed by nearby enemies; Ashe Hawkshot only reveals champions near the point; Ashe Volley hits each enemy once; Black Shield absorbs all damage types; Garen W tenacity, Malphite W passive armor and Wukong Q cooldown reduction are not modelled; Rengar's brush leap and trophies are not modelled; Morgana W cooldown refund is not modelled.
* **Cosmetic**: all champions reuse the CC0 KayKit hero bodies (tinted). Names, abilities and numbers are Riot's; art is not.
* Rank scaling in the old engine (75% + 15% per rank) is **not** applied to these kits: ranks use the data's arrays.

Riot Games, League of Legends and all champion names, abilities and text are trademarks / property of Riot Games.
This is a non-commercial fan project and is not endorsed by Riot Games.


## Full roster, items, runes, draft (patch 16.22.1)

- `scripts/build-all.mjs` pulls every champion, the Summoner's Rift item list and the rune trees from Riot Data Dragon
  (plus CommunityDragon for per-rank damage numbers) and downloads icons into `public/img`.
- **20 champions keep their hand-written kits** (`src/kits`). The other **153** run on the generic ability engine
  (`src/champions/generic.json`): stats, text, cooldowns, costs and ranges are exact; damage and ratios are evaluated from
  the CommunityDragon calculations; **the ability shape (skillshot / ground target / dash / self nova) and CC durations are
  inferred**, so their kits are approximations (no recasts, transforms, summons or passives beyond text). A few spells that
  did not parse deal no damage (e.g. Kha'Zix, Yunara) and Jax E's damage is zeroed (bogus calc).
- **Models**: Riot's models are not available. Champions use CC0 KayKit bodies picked by class and tinted with the dominant
  colour of the champion icon; icons are the real Data Dragon art.
- **Items**: real SR shop with recipes (owned components are consumed and lower the price). Only HP, AD, AP, armor, MR,
  attack speed, move speed, lifesteal, ability haste and mana are simulated; crit, on-hit and active effects are text only.
  Recommended builds are generated per class by scoring items against what the engine simulates (not Riot's builds).
- **Runes**: all 5 trees selectable. Simulated: keystones Electrocute, Press the Attack, Phase Rush, Fleet Footwork, Grasp,
  Arcane Comet, Hail of Blades, Conqueror, Lethal Tempo, Dark Harvest, Glacial Augment, Aftershock (numbers simplified), plus
  the flat-stat minor runes in `RUNE_STATS`. Other runes can be chosen but have no effect. Shards are approximated.
- **Draft**: solo play opens champion select: 5 bans each, then a 1-2-2-2-2-1 pick; bots pick for their position.
  Multiplayer lobbies still use the older picker.
- **Post-match**: scoreboard, damage by type, taken/healing/objective damage, team graphs, item timelines.
  Stats are tracked on the host only, so guests in multiplayer see host-side data only when hosting.
- **Mobile**: portrait and landscape; pinch zooms in, zoom-out is locked to the default view; Safari page-zoom gestures are blocked.
  Tested in WebKit 18 (Playwright) emulating an iPhone 14, not on a physical device.
