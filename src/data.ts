export type Team = 0 | 1;
export type DmgType = 'phys' | 'magic' | 'true';
export type AbilityKind = 'bolt' | 'nova' | 'dash' | 'buff' | 'beam';
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
}

// ---------- map ----------
export const MAP = 4000;
export const BASES: Vec[] = [
  { x: 260, y: 3740 },
  { x: 3740, y: 260 },
];
export const NEXUS: Vec[] = [
  { x: 560, y: 3440 },
  { x: 3440, y: 560 },
];
export const FOUNTAIN_R = 380;
export const TEAM_COLOR = ['#3b8cff', '#ff4d4d'];
export const TEAM_NAME = ['Blue', 'Red'];
export const LANE_NAMES = ['Top', 'Mid', 'Bot'];
// Lanes run from the blue nexus to the red nexus.
export const LANES: Vec[][] = [
  [NEXUS[0], { x: 560, y: 560 }, NEXUS[1]],
  [NEXUS[0], NEXUS[1]],
  [NEXUS[0], { x: 3440, y: 3440 }, NEXUS[1]],
];
export const RIVER: Vec[] = [
  { x: 780, y: 780 },
  { x: 3220, y: 3220 },
];

export const WAVE_INTERVAL = 30;
export const FIRST_WAVE = 8;

// ---------- champions ----------
export const CHAMPS: ChampDef[] = [
  {
    id: 'aurin',
    name: 'Aurin',
    role: 'Arcane Mage',
    color: '#b78cff',
    hp: 560,
    hpL: 95,
    ad: 52,
    adL: 3,
    armor: 20,
    armorL: 4.5,
    mr: 30,
    mrL: 1.3,
    range: 525,
    as: 0.65,
    asL: 0.02,
    ms: 335,
    ranged: true,
    mp: 420,
    mpL: 28,
    mpRegen: 8,
    build: ['boots', 'tome', 'crown', 'tome', 'gem', 'crown', 'plate'],
    abilities: [
      {
        name: 'Arcane Bolt',
        desc: 'Fires a bolt that hits the first enemy for magic damage.',
        kind: 'bolt',
        cd: 6,
        range: 1050,
        base: 85,
        perLvl: 22,
        adR: 0,
        apR: 0.7,
        dmgType: 'magic',
        cost: 50,
        color: '#b78cff',
        width: 70,
        speed: 1500,
      },
      {
        name: 'Starfall',
        desc: 'After a short delay, damages and slows enemies in an area.',
        kind: 'nova',
        cd: 10,
        range: 850,
        base: 75,
        perLvl: 18,
        adR: 0,
        apR: 0.6,
        dmgType: 'magic',
        cost: 70,
        color: '#7ad7ff',
        radius: 230,
        delay: 0.6,
        slow: 0.4,
        slowT: 1.5,
      },
      {
        name: 'Blink',
        desc: 'Teleport a short distance toward the cursor.',
        kind: 'dash',
        cd: 14,
        range: 420,
        base: 0,
        perLvl: 0,
        adR: 0,
        apR: 0,
        dmgType: 'magic',
        cost: 60,
        color: '#e3d0ff',
        speed: 4000,
      },
      {
        name: 'Astral Lance',
        desc: 'Channels, then fires a huge beam that hits every enemy in a line.',
        kind: 'beam',
        cd: 70,
        range: 2600,
        base: 300,
        perLvl: 25,
        adR: 0,
        apR: 1.0,
        dmgType: 'magic',
        cost: 100,
        color: '#ffe27a',
        width: 140,
        delay: 0.9,
      },
    ],
  },
  {
    id: 'brakk',
    name: 'Brakk',
    role: 'Bruiser',
    color: '#ff9b4a',
    hp: 650,
    hpL: 105,
    ad: 64,
    adL: 3.8,
    armor: 34,
    armorL: 4.8,
    mr: 32,
    mrL: 2,
    range: 175,
    as: 0.68,
    asL: 0.025,
    ms: 345,
    ranged: false,
    mp: 300,
    mpL: 40,
    mpRegen: 7,
    build: ['boots', 'sword', 'edge', 'plate', 'blade', 'plate', 'edge'],
    abilities: [
      {
        name: 'Bloodrush',
        desc: 'Gain attack speed and move speed for a few seconds.',
        kind: 'buff',
        cd: 9,
        range: 0,
        base: 0,
        perLvl: 0,
        adR: 0,
        apR: 0,
        dmgType: 'phys',
        cost: 30,
        color: '#ff5a3c',
        buffAs: 0.6,
        buffMs: 0.25,
        buffT: 3.5,
      },
      {
        name: 'Cleave',
        desc: 'Spin, hitting all nearby enemies and healing yourself.',
        kind: 'nova',
        cd: 7,
        range: 0,
        base: 70,
        perLvl: 20,
        adR: 0.9,
        apR: 0,
        dmgType: 'phys',
        cost: 40,
        color: '#ffb36b',
        radius: 300,
        delay: 0.15,
        selfCenter: true,
        heal: 40,
      },
      {
        name: 'Charge',
        desc: 'Dash forward, damaging and briefly stunning enemies in the path.',
        kind: 'dash',
        cd: 11,
        range: 480,
        base: 60,
        perLvl: 15,
        adR: 0.6,
        apR: 0,
        dmgType: 'phys',
        cost: 45,
        color: '#ffd29a',
        speed: 1500,
        stun: 0.6,
      },
      {
        name: 'Earthbreaker',
        desc: 'Slam the ground, dealing heavy damage and stunning in a big area.',
        kind: 'nova',
        cd: 65,
        range: 500,
        base: 220,
        perLvl: 30,
        adR: 1.2,
        apR: 0,
        dmgType: 'phys',
        cost: 100,
        color: '#c8823c',
        radius: 340,
        delay: 0.5,
        stun: 1.2,
      },
    ],
  },
  {
    id: 'sylla',
    name: 'Sylla',
    role: 'Marksman',
    color: '#5fe0a0',
    hp: 590,
    hpL: 95,
    ad: 60,
    adL: 3.2,
    armor: 26,
    armorL: 4.2,
    mr: 30,
    mrL: 1.3,
    range: 600,
    as: 0.7,
    asL: 0.03,
    ms: 330,
    ranged: true,
    mp: 340,
    mpL: 35,
    mpRegen: 7,
    build: ['boots', 'dagger', 'bow', 'blade', 'edge', 'bow', 'plate'],
    abilities: [
      {
        name: 'Quickdraw',
        desc: 'Greatly increases attack speed for a few seconds.',
        kind: 'buff',
        cd: 10,
        range: 0,
        base: 0,
        perLvl: 0,
        adR: 0,
        apR: 0,
        dmgType: 'phys',
        cost: 30,
        color: '#5fe0a0',
        buffAs: 0.8,
        buffT: 4,
      },
      {
        name: 'Volley',
        desc: 'Fire a piercing arrow that damages and slows every enemy hit.',
        kind: 'bolt',
        cd: 8,
        range: 1000,
        base: 65,
        perLvl: 18,
        adR: 1.0,
        apR: 0,
        dmgType: 'phys',
        cost: 50,
        color: '#a6ffcf',
        width: 90,
        speed: 1800,
        pierce: true,
        slow: 0.3,
        slowT: 1.5,
      },
      {
        name: 'Tumble',
        desc: 'Roll a short distance toward the cursor.',
        kind: 'dash',
        cd: 9,
        range: 320,
        base: 0,
        perLvl: 0,
        adR: 0,
        apR: 0,
        dmgType: 'phys',
        cost: 30,
        color: '#d6ffe9',
        speed: 1600,
      },
      {
        name: "Hunter's Mark",
        desc: 'A map-wide arrow that stuns and heavily damages the first champion hit.',
        kind: 'bolt',
        cd: 80,
        range: 5000,
        base: 250,
        perLvl: 30,
        adR: 1.4,
        apR: 0,
        dmgType: 'phys',
        cost: 100,
        color: '#7dffb8',
        width: 130,
        speed: 1700,
        champOnly: true,
        stun: 1.5,
      },
    ],
  },
];

// ---------- items ----------
export const ITEMS: ItemDef[] = [
  { id: 'sword', name: 'Iron Blade', cost: 350, desc: '+10 AD', ad: 10 },
  { id: 'tome', name: 'Spell Tome', cost: 435, desc: '+20 AP', ap: 20 },
  { id: 'gem', name: 'Heart Gem', cost: 400, desc: '+150 HP', hp: 150 },
  { id: 'vest', name: 'Chain Vest', cost: 300, desc: '+15 Armor', armor: 15 },
  { id: 'cloak', name: 'Null Cloak', cost: 450, desc: '+25 MR', mr: 25 },
  { id: 'dagger', name: 'Quick Dagger', cost: 300, desc: '+12% AS', as: 0.12 },
  { id: 'boots', name: 'Swift Boots', cost: 300, desc: '+45 Move Speed (one only)', ms: 45, unique: true },
  { id: 'blade', name: 'Ruinblade', cost: 3000, desc: '+50 AD, +25% AS, 12% lifesteal', ad: 50, as: 0.25, ls: 0.12 },
  { id: 'edge', name: 'Void Edge', cost: 2900, desc: '+60 AD, +20 ability haste', ad: 60, haste: 20 },
  { id: 'bow', name: 'Storm Bow', cost: 2700, desc: '+35 AD, +45% AS, +25 MS', ad: 35, as: 0.45, ms: 25 },
  { id: 'crown', name: 'Archmage Crown', cost: 3000, desc: '+110 AP, +250 HP, +20 haste', ap: 110, hp: 250, haste: 20 },
  { id: 'plate', name: 'Titan Plate', cost: 2800, desc: '+450 HP, +45 Armor, +35 MR', hp: 450, armor: 45, mr: 35 },
];
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
