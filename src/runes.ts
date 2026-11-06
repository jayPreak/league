// Rune pages: trees and rune text come from Data Dragon (src/runes.json). A subset of runes is simulated
// (see RUNE_STATS for flat stats and the keystone handlers in main.ts); the rest are selectable and shown
// in the post-match screen but have no gameplay effect, and the picker labels them as such.
import raw from './runes.json';

export interface Rune { id: number; key: string; name: string; icon: string; desc: string }
export interface Tree { id: number; key: string; name: string; icon: string; slots: Rune[][] }
export const TREES = raw as Tree[];
export const runeIcon = (p: string) => `${import.meta.env.BASE_URL}img/rune/${p}`;
export const runeByKey = (k: string): Rune | undefined => TREES.flatMap((t) => t.slots.flat()).find((r) => r.key === k);
export const treeOf = (k: string): Tree | undefined => TREES.find((t) => t.slots.some((s) => s.some((r) => r.key === k)));

export interface RunePage { primary: string; keystone: string; minors: string[]; secondary: string; picks: string[]; shards: number[] }
// flat stats granted by simulated runes (approximations of the in-game values at level ~9)
export const RUNE_STATS: Record<string, Partial<Record<'ad' | 'ap' | 'hp' | 'armor' | 'mr' | 'as' | 'ms' | 'haste' | 'ls' | 'mp', number>>> = {
  LegendAlacrity: { as: 0.12 }, LegendHaste: { haste: 10 }, LegendBloodline: { ls: 0.05, hp: 100 },
  Conditioning: { armor: 9, mr: 9 }, Overgrowth: { hp: 120 }, Celerity: { ms: 12 }, Transcendence: { haste: 8 }, NimbusCloak: { ms: 20 },
  ManaflowBand: { mp: 250 }, PresenceOfMind: { mp: 150 }, Waterwalking: { ap: 18, ad: 11, ms: 10 }, JackOfAllTrades: { ad: 5, ap: 8 },
  CosmicInsight: { haste: 8 }, ApproachVelocity: { ms: 14 }, TimeWarpTonic: { ms: 8 }, AbsorbLife: { hp: 60 }, BonePlating: { armor: 6, mr: 6 },
  SecondWind: { hp: 50 }, Unflinching: { armor: 5, mr: 5, ms: 6 }, Revitalize: { hp: 40 }, GatheringStorm: { ap: 20, ad: 12 }, Scorch: { ap: 6, ad: 4 },
  CutDown: { ad: 6 }, CoupDeGrace: { ad: 5 }, LastStand: { ad: 7 }, Triumph: { hp: 40 }, AbsoluteFocus: { ap: 12, ad: 8 },
  TreasureHunter: { ad: 4 }, UltimateHunter: { haste: 6 }, RelentlessHunter: { ms: 10 }, GrislyMementos: { hp: 20 }, DeepWard: { hp: 30 },
  FontOfLife: { hp: 40 }, ShieldBash: { armor: 5, mr: 5 }, Demolish: { hp: 25 }, SuddenImpact: { ad: 6, ap: 10 }, TasteOfBlood: { ls: 0.03 },
  CheapShot: { ad: 4 }, SixthSense: { ms: 8 }, HextechFlashtraption: { haste: 4 }, MagicalFootwear: { ms: 12 }, CashBack: { hp: 20 },
  PerfectTiming: { hp: 20 }, BiscuitDelivery: { hp: 40 }, NullifyingOrb: { mr: 15 }, UnsealedSpellbook: { haste: 5 },
};
// keystones with gameplay code in main.ts
export const SIMULATED_KEYSTONES = ['Electrocute', 'PressTheAttack', 'PhaseRush', 'FleetFootwork', 'GraspOfTheUndying', 'ArcaneComet', 'HailOfBlades', 'Conqueror', 'Aftershock', 'GlacialAugment', 'LethalTempo', 'DarkHarvest'];
export const isSimulated = (k: string) => SIMULATED_KEYSTONES.includes(k) || k in RUNE_STATS;
// three shard rows: label + flat stats
export const SHARDS: { label: string; st: Partial<Record<'ad' | 'ap' | 'hp' | 'as' | 'ms' | 'haste' | 'armor' | 'mr', number>> }[][] = [
  [{ label: '+9 Adaptive Force', st: { ad: 5.4, ap: 9 } }, { label: '+10% Attack Speed', st: { as: 0.1 } }, { label: '+8 Ability Haste', st: { haste: 8 } }],
  [{ label: '+9 Adaptive Force', st: { ad: 5.4, ap: 9 } }, { label: '+2% Move Speed', st: { ms: 7 } }, { label: '+10-180 Health', st: { hp: 60 } }],
  [{ label: '+65 Health', st: { hp: 65 } }, { label: '+10% Tenacity & Slow Resist', st: { armor: 4, mr: 4 } }, { label: '+10-180 Health', st: { hp: 60 } }],
];
const PRESET: Record<string, [string, string, string[], string, string[]]> = {
  Marksman: ['Precision', 'PressTheAttack', ['Triumph', 'LegendAlacrity', 'CoupDeGrace'], 'Resolve', ['Conditioning', 'Overgrowth']],
  Mage: ['Sorcery', 'ArcaneComet', ['ManaflowBand', 'Transcendence', 'Scorch'], 'Inspiration', ['MagicalFootwear', 'CosmicInsight']],
  Fighter: ['Precision', 'Conqueror', ['Triumph', 'LegendHaste', 'LastStand'], 'Resolve', ['Conditioning', 'Overgrowth']],
  Tank: ['Resolve', 'GraspOfTheUndying', ['Demolish', 'Conditioning', 'Overgrowth'], 'Precision', ['LegendHaste', 'CutDown']],
  Assassin: ['Domination', 'Electrocute', ['SuddenImpact', 'GrislyMementos', 'RelentlessHunter'], 'Precision', ['LegendAlacrity', 'CoupDeGrace']],
  Support: ['Resolve', 'Aftershock', ['FontOfLife', 'Conditioning', 'Revitalize'], 'Sorcery', ['Celerity', 'GatheringStorm']],
};
export function defaultPage(tags: string[]): RunePage {
  const [p, k, m, s, pk] = PRESET[tags[0]] ?? PRESET.Fighter;
  return { primary: p, keystone: k, minors: m, secondary: s, picks: pk, shards: [0, 0, 0] };
}
const store = (id: string) => `rift.runes.${id}`;
export function loadPage(id: string, tags: string[]): RunePage {
  try {
    const v = JSON.parse(localStorage.getItem(store(id)) ?? 'null');
    if (v && v.keystone && v.primary) return v as RunePage;
  } catch { /* storage unavailable */ }
  return defaultPage(tags);
}
export function savePage(id: string, p: RunePage) {
  try { localStorage.setItem(store(id), JSON.stringify(p)); } catch { /* storage unavailable */ }
}
export function pageStats(p: RunePage) {
  const t: Record<string, number> = {};
  const add = (o?: Record<string, number>) => { for (const [k, v] of Object.entries(o ?? {})) t[k] = (t[k] ?? 0) + v; };
  for (const k of [...p.minors, ...p.picks]) add(RUNE_STATS[k]);
  p.shards.forEach((s, i) => add(SHARDS[i][s]?.st));
  return t;
}
