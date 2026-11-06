import { buildRoster } from './champions';
import { ALL_ITEMS } from './items';
export type Team = 0 | 1;
export type Side = 0 | 1 | 2; // 2 = neutral (jungle monsters)
export type DmgType = 'phys' | 'magic' | 'true';
export type AbilityKind = 'bolt' | 'nova' | 'dash' | 'buff' | 'beam' | 'zone' | 'ally';
export interface Vec {
  x: number;
  y: number;
}

export interface AbilityDef {
  name: string;
  desc: string;
  kind: AbilityKind;
  cd: number;
  range: number;
  base: number;
  perLvl: number;
  adR: number;
  apR: number;
  dmgType: DmgType;
  color: string;
  width?: number;
  speed?: number;
  radius?: number;
  delay?: number;
  pierce?: boolean;
  slow?: number;
  slowT?: number;
  stun?: number;
  champOnly?: boolean;
  selfCenter?: boolean;
  buffAs?: number;
  buffMs?: number;
  buffT?: number;
  heal?: number;
  cost: number; // mana
  // crowd control and utility
  root?: number; // can't move, can still attack and cast
  knockup?: number; // airborne: a hard stun that lifts the target
  knockback?: number; // pushes enemies away from the caster / impact point
  hook?: boolean; // skillshot pulls the first enemy hit to the caster
  execute?: number; // bonus damage as a share of the target's missing health
  shield?: number; // absorbs damage for shieldT seconds (+shieldL per level)
  shieldL?: number;
  shieldT?: number;
  stealth?: number; // untargetable and hidden from enemies; attacking or casting breaks it
  empower?: boolean; // the ability's damage is added to the next basic attack
  healL?: number; // heal per level for 'ally' / zone heals
  landRadius?: number; // dash ends in an area hit
  dur?: number; // zone lifetime
  once?: boolean; // zone triggers on the first enemy that enters, then ends (traps)
  allyHeal?: number; // zone heals allies per second
  // --- real-champion kits (src/champions): numbers come from the reference database ---
  script?: boolean; // behaviour lives in src/kits, not in the generic cast switch
  cds?: number[]; // cooldown per rank (seconds)
  costs?: number[]; // resource cost per rank
  ranges?: number[]; // cast range per rank
  costType?: string; // 'Mana', 'Energy', 'No Cost', 'Generates 1 Ferocity', ...
  aim?: AimShape; // what the hold-to-aim indicator draws
  perRank?: boolean; // base/perLvl scale with the ability rank instead of champion level
}
// line: skillshot rectangle (w wide, reach long); circle: ground target of radius r within reach;
// cone: wedge of `deg` degrees; self: ring of radius r around the caster; target: a unit within reach; none: nothing
export interface AimShape {
  shape: 'line' | 'circle' | 'cone' | 'self' | 'target' | 'none';
  reach: number;
  w?: number;
  r?: number;
  deg?: number;
}

export interface ChampDef {
  id: string;
  name: string;
  role: string;
  color: string;
  hp: number;
  hpL: number;
  ad: number;
  adL: number;
  armor: number;
  armorL: number;
  mr: number;
  mrL: number;
  range: number;
  as: number;
  asL: number;
  ms: number;
  ranged: boolean;
  mp: number;
  mpL: number;
  mpRegen: number; // per second
  abilities: AbilityDef[];
  build: string[];
  title?: string;
  tags?: string[]; // class tags for champion select filters
  // --- real-champion data ---
  resource?: string; // Mana, Energy, Ferocity, None
  hpRegen?: number; // per 5s at level 1
  hpRegenL?: number;
  mpRegenL?: number;
  passive?: { name: string; desc: string };
  wiki?: string; // Data Dragon version the numbers were taken from
  approx?: boolean; // generic-engine kit: exact stats/text, inferred ability behaviour
  key?: string; // Data Dragon id used for icons
}

export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  desc: string;
  hp?: number;
  ad?: number;
  ap?: number;
  armor?: number;
  mr?: number;
  as?: number;
  ms?: number;
  haste?: number;
  ls?: number;
  unique?: boolean;
  consumable?: boolean; // bought into a counter instead of an inventory slot
  mp?: number;
  boots?: boolean; // only one pair of boots
  tags?: string[];
  from?: string[]; // recipe components
  into?: string[];
  icon?: string; // Data Dragon item id for the icon
  depth?: number;
}

// ---------- map ----------
// Genre-standard proportions: a ~14k square with 750-range turrets, three lanes, a diagonal river and
// four walled jungle quadrants. Blue's fountain is bottom-left, Red's top-right.
export const MAP = 14000;
export const BASES: Vec[] = [
  { x: 650, y: 13350 },
  { x: 13350, y: 650 },
];
export const NEXUS: Vec[] = [
  { x: 1900, y: 12100 },
  { x: 12100, y: 1900 },
];
export const FOUNTAIN_R = 560;
export const TEAM_COLOR = ['#3b8cff', '#ff4d4d', '#c8aa6e'];
export const TEAM_NAME = ['Blue', 'Red', 'Neutral'];
export const LANE_NAMES = ['Top', 'Mid', 'Bot'];
// Lanes run from the blue nexus to the red nexus.
export const LANES: Vec[][] = [
  [NEXUS[0], { x: 1500, y: 9000 }, { x: 1700, y: 1700 }, { x: 9000, y: 1500 }, NEXUS[1]],
  [NEXUS[0], NEXUS[1]],
  [NEXUS[0], { x: 5000, y: 12500 }, { x: 12300, y: 12300 }, { x: 12500, y: 5000 }, NEXUS[1]],
];
export const RIVER: Vec[] = [
  { x: 1700, y: 1700 },
  { x: 12300, y: 12300 },
];
// distance along a lane (from its own nexus) for each structure
export const TURRET_AT = { side: [8900, 5900, 3000], mid: [5300, 4000, 2700] }; // outer, inner, base turret
export const INHIB_AT = 2050;

export const WAVE_INTERVAL = 30;
export const FIRST_WAVE = 20; // first wave leaves the nexus at 0:20

// ---------- champions ----------
// Built from the reference database in src/champions (see scripts/build-champions.mjs).
export const CHAMPS: ChampDef[] = buildRoster();

// ---------- items ----------
// Real Summoner's Rift shop from Data Dragon: see src/items.ts.
export const ITEMS: ItemDef[] = ALL_ITEMS;
export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ---------- difficulty (applies to the Red team only) ----------
export interface DifficultyDef {
  id: string;
  name: string;
  desc: string;
  dmg: number; // damage multiplier for Red champions
  gold: number; // gold multiplier for Red champions
  edge: number; // HP lead a Red bot wants before it starts a fight
  think: number; // seconds between Red bot decisions
  castChance: number; // chance a Red bot uses a ready ability when it could
}
export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy', name: 'Easy', desc: 'Passive bots, slower reactions, less damage', dmg: 0.75, gold: 0.85, edge: 0.2, think: 0.45, castChance: 0.35 },
  { id: 'normal', name: 'Normal', desc: 'Balanced bots', dmg: 1, gold: 1, edge: 0.05, think: 0.2, castChance: 1 },
  { id: 'hard', name: 'Hard', desc: 'Aggressive bots, fast reactions, more damage and gold', dmg: 1.2, gold: 1.15, edge: -0.1, think: 0.12, castChance: 1 },
];
