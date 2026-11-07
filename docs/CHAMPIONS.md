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
- **21 champions have hand-written kits (the original 20 plus Lillia)** (`src/kits`). The other **152** run on the generic ability engine
  (`src/champions/generic.json`): stats, text, cooldowns, costs and ranges are exact; damage and ratios are evaluated from
  the CommunityDragon calculations; **the ability shape (skillshot / ground target / dash / self nova) and CC durations are
  inferred**, so their kits are approximations (no recasts, transforms, summons or passives beyond text). A few spells that
  did not parse deal no damage (e.g. Kha'Zix, Yunara) and Jax E's damage is zeroed (bogus calc).
- **Models**: Riot's models are proprietary and not used. Champions share the CC0 KayKit rigs and get procedural outfits
  (`src/costume.ts`): hair, ears, horns, tails, helmets, hoods, capes, wings, signature weapons. The 20 scripted champions have
  hand-built outfits; the other 153 get one generated from class, name hash and icon colours (main + accent), so they differ
  in silhouette and colour but are not likenesses. Icons are the real Data Dragon art.
- **Items**: real SR shop with recipes (owned components are consumed and lower the price). HP, AD, AP, armor, MR,
  attack speed, move speed, lifesteal, ability haste, mana, crit, penetration and omnivamp are simulated, plus the item
  passives listed in "Item effects" below; other passives and all actives are text only.
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


## Summoner spells (D/F)

- All nine Summoner's Rift spells (`src/summoners.ts`): Flash, Ignite, Exhaust, Teleport, Ghost, Barrier, Cleanse, Heal, Smite.
  Cooldowns, ranges and icons from Data Dragon `summoner.json` (16.22.1); effect numbers from the League wiki pages
  (Data Dragon only ships `{{ placeholders }}` for them): Flash 400 units / 300s; Ignite 70-525 true over 5s + 40% Grievous
  Wounds + reveal / 600 range / 180s; Exhaust 40% slow + 35% less damage dealt for 3s / 650 / 240s; Ghost 24-50.82% MS and
  no unit collision for 10s / 240s; Barrier 100-502.35 shield for 2.5s / 180s; Cleanse removes disables (not airborne) and
  Ignite/Exhaust, 75% tenacity for 3s / 240s; Heal 80-346 on self + one ally (cursor, else most wounded in 900), 30% MS for
  1s, halved within 35s of a previous Heal / 240s; Teleport 3s channel then untargetable travel to an allied turret, minion
  or ward, Unleashed at 10:00 (330-240s cooldown, 50% MS for 3s) / 300s; Smite 600 true, 2 charges, 90s recharge, starts
  with 1 and the second starts recharging at 0:48, 15s between casts.
- **Approximated**: "a - b (based on level)" values are interpolated linearly from level 1 to 18 (Riot's curves are not
  published). Teleport travel time is `0.5-5s` (Unleashed `0.5-4s`) scaled linearly by distance / map size. Teleport is
  interrupted by stun, airborne, charm or silence, and by the player moving/attacking/casting (no partial cooldown refund).
  Tenacity shortens stun/root/slow/silence/charm applied after Cleanse. Exhaust's damage reduction applies to physical and
  magic damage only. Smite's Unleashed/Primal upgrades (jungle pet treats) are not modelled; the jungle-companion damage
  bonus and monster damage reduction stay as before. Summoner spell haste does not exist.
- Champion select and the main menu have a D/F picker (swaps when you pick the spell in the other slot). Role binding:
  junglers always carry Smite and nobody else may. Bots take Flash plus a role spell: jungle Smite, bottom Heal,
  top Teleport, mid Teleport (Ignite for assassins), support Exhaust for enchanters/mages, Ignite otherwise.

## Item effects

- **Stats beyond the flat ones**: crit chance comes from Data Dragon `FlatCritChanceMod`. Crit damage, lethality, % armor
  penetration, flat / % magic penetration and omnivamp are only in the tooltip's `<stats>` block, so `scripts/build-all.mjs`
  parses that block into `extra` in `src/items.json`. This round ran the parse alone against the cached 16.22.1 item.json
  rather than a full rebuild.
- **Crits**: basic attacks only. Base crit damage is 175%, and Infinity Edge adds +30% (CommunityDragon `mFlatCritDamageMod`).
  Crit chance caps at 100%. Crits show as larger orange damage numbers with "!".
  **Approximation**: each attack rolls plain random; League uses a pseudo-random distribution.
- **Penetration** (League wiki, Armor penetration): applied in League's order: armor reduction (Black Cleaver, kit shreds),
  then % penetration, then flat. Lethality is full flat armor penetration at every level (V14.1+). Several % penetration
  items stack multiplicatively.
- **Passives simulated**: values are in `ITEM_FX` (`src/items.ts`), read from CommunityDragon 16.22
  `items.cdtb.bin.json` (`mDataValues` / `mItemCalculations`):
  - Blade of the Ruined King: 9% (melee) / 6% (ranged) of current Health on-hit, capped at 100 against minions and monsters.
    Every 3rd attack on a champion slows by 30% for 1s.
  - Nashor's Tooth: 15 + 15% AP magic on-hit.
  - Wit's End: 45 magic on-hit.
  - Guinsoo's Rageblade: 30 magic on-hit, and 8% attack speed per stack (4 stacks, 4s).
  - Kraken Slayer: every 3rd attack deals 150 (+5 per level from 9) physical, ×0.8 for ranged champions. The damage grows
    by up to 75% based on the target's missing Health.
  - Spellblade, on the next attack within 10s after an ability, 1.5s cooldown:
    - Sheen: 100% base AD.
    - Trinity Force: 200% base AD, plus Quicken (+20 move speed for 2s).
    - Lich Bane: 75% base AD + 45% AP magic.
    - Essence Reaver: 125% base AD, and restores 15 + 15% missing mana.
  - The Collector: executes champions below 5% Health; +25 gold per champion kill.
  - Black Cleaver: 6% armor reduction per stack, 5 stacks for 6s, from physical damage to champions, plus Fervor
    (+20 move speed for 2s).
  - Mortal Reminder: 40% Grievous Wounds for 3s from physical damage to champions.
  - Lord Dominik's Regards: up to +15% damage against champions, scaled by their bonus Health up to 1500.
  - Rabadon's Deathcap: +30% total AP.
  - Bloodthirster: life steal past full Health becomes a shield, capped at 165 (+15 per level from 9), lasting 25s.
  - Doran's Blade: 2.5% omnivamp.
  - Doran's Ring and Doran's Shield: +5 damage to minions.
  - Doran's Ring: 1 mana/s, raised to 2/s for 5s after damaging a champion; champions without mana heal 45% of that instead.
  - Doran's Shield: 4 Health per 5s.
- **Approximations** (not verifiable from the data):
  - Essence Reaver: the `CritChanceMultiplier` term is left out, and the mana refund uses `FlatManaRefund`/`ManaRefundRatio`.
  - Blade of the Ruined King: the ranged slow uses the tooltip's 30%, not the bin's `RangedMoveSpeedMod` of 15%.
  - Doran's Shield: after champion damage it restores up to 40 Health (30 ranged) over 8s, scaled linearly by missing
    Health (`MaxRegenAmount`; the exact curve is not published).
  - Guinsoo's: stacks are refreshed together. The "every 3rd attack applies on-hit twice" part is not modelled.
  - On-hit item damage does not apply to turrets; Spellblade does.
  - Youmuu's, Terminus, Statikk Shiv, Runaan's, Rapid Firecannon and other passives, and all item actives, are not simulated.
- **Health Potion** (Data Dragon 2003): 50 gold, up to 5, restores 120 Health over 15s (`HealAmount`/`PotionDuration`).
  Press **1** or click the potion slot next to the ward. Only one potion can be active at a time.
  **Difference from League**: potions sit in a separate counter, not an inventory slot.
- **Starters**: bots open like League players:
  - Doran's Blade + 1 potion for marksmen, fighters and assassins.
  - Doran's Ring + 2 potions for mages.
  - Doran's Shield + 1 potion for tanks and supports. League supports start World Atlas, which has no simulated stats here.
  - Junglers buy 1 potion. Jungle pets are not in the shop; the jungle companion bonus still comes from Smite.
  - Bots sell the Doran's item at 40% (Data Dragon sell value) when they need the slot.
- **Bot builds**: when a bot can't afford its next item, it now buys only components still missing from the recipe.
  Before, it bought the same component again and again (for example four Giant's Belts) and filled the inventory.
  Build scoring now values crit, penetration and the simulated passives.

## HUD icons and Tab scoreboard

- Ability bar (desktop and touch) uses the Data Dragon 16.22.1 art for each champion's passive and Q/W/E/R
  (`img/passive/*`, `img/spell/*`), downloaded to `public/img/ability` by `scripts/build-all.mjs`; the file names per
  champion are in `src/champions/icons.json` as `[passive, Q, W, E, R]`. Hand-written kits use the same slot order as
  Data Dragon, so slot N always shows Data Dragon spell N. The passive sits left of Q, as in the League HUD.
- Hold **Tab** (tap the K/D/A line on touch) for the scoreboard: per team kills, turrets, dragons and total gold earned;
  per champion portrait with level and respawn timer, the two summoner spells, keystone, items plus trinket, K/D/A and CS.
  **Differences from League**: there are no Baron/Herald/void-grub counts and no "item value" column. Enemy items are always
  shown live, even when the enemy is in fog of war (not checked against League's rule). The trinket slot always shows the Stealth Ward.

## Full-game test (every champion)

`scripts/full-game-test.mjs` (needs `npm run dev` on :5173, puppeteer-core and Chrome) plays one complete 5v5 bot match per
champion with that champion as a bot (AI-driven, headless simulation) and checks for exceptions, NaN state, spell use, damage,
item purchases and match completion.

Last run: **173 champions, 173 games, 0 crashes, 0 NaN states**, every champion cast spells, dealt damage and bought items.
4 games hit the 30-minute cap without a winner (Anivia, Sion, Trundle, Kennen: bot siege stalemates, not errors).
Known weak spots: Fizz Q has no parsed damage (generic engine), Hwei and other multi-form champions are approximations.
