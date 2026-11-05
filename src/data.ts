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
export const FIRST_WAVE = 65; // first wave leaves the nexus at 1:05

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

// Ability shorthand: everything defaults to 0 / magic so kits stay readable.
type AbIn = Partial<AbilityDef> & Pick<AbilityDef, 'name' | 'desc' | 'kind' | 'cd' | 'cost' | 'color'>;
const ab = (a: AbIn): AbilityDef => ({ range: 0, base: 0, perLvl: 0, adR: 0, apR: 0, dmgType: 'magic', ...a });
type StatIn = Omit<ChampDef, 'abilities' | 'build'>;
const MAGE_BUILD = ['boots', 'tome', 'crown', 'tome', 'gem', 'crown', 'cloak'];
const TANK_BUILD = ['boots', 'vest', 'gem', 'plate', 'cloak', 'plate', 'gem'];
const BRUISER_BUILD = ['boots', 'sword', 'edge', 'plate', 'blade', 'gem', 'cloak'];
const ASSASSIN_BUILD = ['boots', 'sword', 'edge', 'blade', 'edge', 'cloak', 'gem'];
const ADC_BUILD = ['boots', 'dagger', 'bow', 'blade', 'edge', 'bow', 'vest'];
const SUPPORT_BUILD = ['boots', 'gem', 'tome', 'crown', 'plate', 'cloak', 'crown'];
const champ = (st: StatIn, build: string[], abilities: AbilityDef[]): ChampDef => ({ ...st, build, abilities });
const melee = { range: 155, ranged: false, as: 0.66, asL: 0.022, mr: 32, mrL: 2, mp: 310, mpL: 40, mpRegen: 7 };
const caster = { range: 525, ranged: true, as: 0.64, asL: 0.02, mr: 30, mrL: 1.3, mp: 430, mpL: 30, mpRegen: 9 };

CHAMPS.push(
  champ(
    { ...melee, id: 'gorvald', name: 'Gorvald', role: 'Warden', title: 'the Unbroken Gate', tags: ['Tank', 'Support'], color: '#9fb4c8', hp: 690, hpL: 112, ad: 60, adL: 3.4, armor: 38, armorL: 5, ms: 340 },
    TANK_BUILD,
    [
      ab({ name: 'Shield Bash', desc: 'Charge forward, stunning the first enemies you slam into.', kind: 'dash', cd: 9, cost: 40, color: '#cfe0f0', range: 380, speed: 1500, base: 60, perLvl: 15, adR: 0.4, dmgType: 'phys', stun: 0.8 }),
      ab({ name: 'Bulwark', desc: 'Raise your shield: a damage shield and a burst of speed.', kind: 'buff', cd: 12, cost: 50, color: '#9fd0ff', shield: 90, shieldL: 16, shieldT: 3, buffMs: 0.15, buffT: 3 }),
      ab({ name: 'Rallying Roar', desc: 'Roar, damaging and slowing nearby enemies.', kind: 'nova', cd: 10, cost: 45, color: '#a8c8ff', radius: 320, delay: 0.1, selfCenter: true, base: 40, perLvl: 12, adR: 0.3, slow: 0.35, slowT: 2 }),
      ab({ name: 'Fortress Leap', desc: 'Leap to a location and crash down, knocking up every enemy there.', kind: 'dash', cd: 75, cost: 100, color: '#e8f2ff', range: 700, speed: 1400, landRadius: 300, knockup: 1, base: 180, perLvl: 25, apR: 0.5 }),
    ],
  ),
  champ(
    { ...melee, id: 'nyssa', name: 'Nyssa', role: 'Assassin', title: 'the Quiet Knife', tags: ['Assassin'], color: '#c25cff', hp: 570, hpL: 92, ad: 66, adL: 3.6, armor: 25, armorL: 4.4, mr: 30, mrL: 1.3, range: 150, as: 0.68, asL: 0.025, ms: 350, mp: 280, mpL: 38 },
    ASSASSIN_BUILD,
    [
      ab({ name: 'Shadow Strike', desc: 'Dart forward, cutting every enemy you pass.', kind: 'dash', cd: 7, cost: 35, color: '#d38bff', range: 450, speed: 2000, base: 75, perLvl: 20, adR: 0.9, dmgType: 'phys' }),
      ab({ name: 'Veil', desc: 'Vanish: become untargetable and hidden from enemies, and move faster. Attacking or casting reveals you.', kind: 'buff', cd: 16, cost: 50, color: '#7a4fa8', stealth: 2.5, buffMs: 0.3, buffT: 2.5 }),
      ab({ name: 'Fan of Knives', desc: 'Throw knives in a circle, damaging and slowing nearby enemies.', kind: 'nova', cd: 6, cost: 30, color: '#e7c2ff', radius: 280, delay: 0.05, selfCenter: true, base: 60, perLvl: 16, adR: 0.7, dmgType: 'phys', slow: 0.25, slowT: 1 }),
      ab({ name: 'Death Mark', desc: 'Blink through enemies, dealing more damage the more health they are missing.', kind: 'dash', cd: 60, cost: 100, color: '#ff4fd8', range: 550, speed: 3000, base: 140, perLvl: 25, adR: 1.1, dmgType: 'phys', execute: 0.25 }),
    ],
  ),
  champ(
    { ...caster, id: 'solenne', name: 'Solenne', role: 'Enchanter', title: 'the Dawnsinger', tags: ['Support', 'Mage'], color: '#ffd6f0', hp: 520, hpL: 88, ad: 48, adL: 2.6, armor: 20, armorL: 4, range: 550, ms: 330, mp: 460, mpRegen: 10 },
    SUPPORT_BUILD,
    [
      ab({ name: 'Radiant Orb', desc: 'Throw an orb of light that damages and slows the first enemy hit.', kind: 'bolt', cd: 6, cost: 50, color: '#ffe6a8', range: 950, speed: 1400, width: 80, base: 70, perLvl: 18, apR: 0.55, slow: 0.3, slowT: 1.5 }),
      ab({ name: 'Aegis Ward', desc: 'Shield yourself and nearby allies and speed them up.', kind: 'ally', cd: 11, cost: 60, color: '#ffd6f0', radius: 650, shield: 80, shieldL: 18, shieldT: 3, apR: 0.4, buffMs: 0.2, buffT: 2 }),
      ab({ name: 'Mending Wave', desc: 'Heal yourself and nearby allies.', kind: 'ally', cd: 13, cost: 70, color: '#8dffb0', radius: 550, heal: 60, healL: 14, apR: 0.35 }),
      ab({ name: 'Sanctuary', desc: 'Consecrate an area: allies inside heal every second, enemies are slowed and burned.', kind: 'zone', cd: 80, cost: 100, color: '#fff3b0', range: 700, radius: 380, dur: 4, allyHeal: 40, healL: 6, slow: 0.4, base: 30, perLvl: 8, apR: 0.2 }),
    ],
  ),
  champ(
    { ...melee, id: 'hollen', name: 'Hollen', role: 'Catcher', title: 'the Harbor Chain', tags: ['Tank', 'Support'], color: '#7fb069', hp: 640, hpL: 105, ad: 56, adL: 3.2, armor: 36, armorL: 4.8, ms: 335, mp: 330 },
    TANK_BUILD,
    [
      ab({ name: 'Chain Grapple', desc: 'Throw a chain that drags the first enemy hit to you and stuns it briefly.', kind: 'bolt', cd: 14, cost: 60, color: '#c9d6b8', range: 1000, speed: 1700, width: 75, hook: true, base: 80, perLvl: 22, apR: 0.5, stun: 0.4 }),
      ab({ name: 'Iron Hide', desc: 'Harden your skin into a large damage shield.', kind: 'buff', cd: 14, cost: 50, color: '#a7c98f', shield: 100, shieldL: 20, shieldT: 3 }),
      ab({ name: 'Ground Stomp', desc: 'Stomp the ground, knocking up nearby enemies.', kind: 'nova', cd: 11, cost: 50, color: '#b8d98f', radius: 300, delay: 0.2, selfCenter: true, knockup: 0.6, base: 55, perLvl: 14, adR: 0.4, dmgType: 'phys' }),
      ab({ name: 'Warcry', desc: 'Nearby allies gain a shield, attack speed and move speed.', kind: 'ally', cd: 70, cost: 100, color: '#e3ff9e', radius: 700, buffAs: 0.4, buffMs: 0.3, buffT: 5, shield: 120, shieldL: 15, shieldT: 5 }),
    ],
  ),
  champ(
    { ...caster, id: 'mirela', name: 'Mirela', role: 'Battle Mage', title: 'the Kindled Storm', tags: ['Mage'], color: '#ff6a3d', hp: 580, hpL: 96, ad: 50, adL: 2.8, armor: 24, armorL: 4.4, range: 500, ms: 335, mp: 440 },
    MAGE_BUILD,
    [
      ab({ name: 'Ember Orb', desc: 'Hurl a fireball that bursts on the first enemy hit.', kind: 'bolt', cd: 5, cost: 45, color: '#ff8a4a', range: 950, speed: 1500, width: 90, base: 80, perLvl: 20, apR: 0.65 }),
      ab({ name: 'Inferno Field', desc: 'Set an area ablaze; enemies inside burn every second and are slowed.', kind: 'zone', cd: 11, cost: 70, color: '#ff5a2a', range: 800, radius: 260, dur: 3, base: 40, perLvl: 10, apR: 0.25, slow: 0.25 }),
      ab({ name: 'Flame Step', desc: 'Dash in a burst of fire, scorching enemies you pass.', kind: 'dash', cd: 12, cost: 50, color: '#ffb36b', range: 400, speed: 1800, base: 50, perLvl: 12, apR: 0.3 }),
      ab({ name: 'Cataclysm', desc: 'Call down a meteor that knocks up and devastates a large area after a delay.', kind: 'nova', cd: 75, cost: 100, color: '#ff3d1f', range: 1200, radius: 380, delay: 1.1, knockup: 0.8, base: 280, perLvl: 30, apR: 1 }),
    ],
  ),
  champ(
    { ...melee, id: 'dunstan', name: 'Dunstan', role: 'Juggernaut', title: 'the Iron Verdict', tags: ['Fighter', 'Tank'], color: '#d9a441', hp: 680, hpL: 110, ad: 66, adL: 3.9, armor: 34, armorL: 4.6, range: 165, as: 0.62, ms: 335, mp: 300 },
    BRUISER_BUILD,
    [
      ab({ name: 'Sundering Blow', desc: 'Your next attack deals bonus damage and slows. Gain a burst of speed.', kind: 'buff', cd: 6, cost: 30, color: '#ffd27a', empower: true, base: 60, perLvl: 18, adR: 0.8, dmgType: 'phys', slow: 0.4, slowT: 1.5, buffMs: 0.2, buffT: 2 }),
      ab({ name: 'Iron Will', desc: 'Brace yourself behind a heavy damage shield.', kind: 'buff', cd: 14, cost: 45, color: '#f2d08a', shield: 110, shieldL: 22, shieldT: 3 }),
      ab({ name: 'Decimate', desc: 'Swing your blade in a wide circle, damaging enemies and healing yourself.', kind: 'nova', cd: 9, cost: 40, color: '#e8b04a', radius: 320, delay: 0.3, selfCenter: true, base: 70, perLvl: 20, adR: 1, dmgType: 'phys', heal: 50 }),
      ab({ name: 'Judgment', desc: 'Bring down your blade on an area; the more health enemies are missing, the harder it hits.', kind: 'nova', cd: 70, cost: 100, color: '#fff0b0', range: 450, radius: 220, delay: 0.45, base: 200, perLvl: 30, adR: 1, dmgType: 'phys', execute: 0.35 }),
    ],
  ),
  champ(
    { ...melee, id: 'kestra', name: 'Kestra', role: 'Skirmisher', title: 'the Crimson Duelist', tags: ['Fighter', 'Assassin'], color: '#ff4f7b', hp: 600, hpL: 98, ad: 64, adL: 3.5, armor: 28, armorL: 4.5, range: 150, as: 0.7, asL: 0.03, ms: 345, mp: 300, mpL: 36 },
    BRUISER_BUILD,
    [
      ab({ name: 'Lunge', desc: 'Lunge forward, slashing enemies in your path.', kind: 'dash', cd: 5, cost: 25, color: '#ff8aa8', range: 380, speed: 1800, base: 60, perLvl: 17, adR: 0.8, dmgType: 'phys' }),
      ab({ name: 'Riposte', desc: 'Parry stance: a quick shield and bonus attack speed.', kind: 'buff', cd: 12, cost: 40, color: '#ffc2d2', shield: 70, shieldL: 18, shieldT: 2, buffAs: 0.3, buffT: 2 }),
      ab({ name: 'Bleeding Flurry', desc: 'Greatly increase attack speed; your next attack cuts deep.', kind: 'buff', cd: 10, cost: 35, color: '#ff4f7b', buffAs: 0.7, buffT: 4, empower: true, base: 40, perLvl: 10, adR: 0.5, dmgType: 'phys' }),
      ab({ name: 'Blade Storm', desc: 'Spin into a storm of blades, shredding and slowing everything around you.', kind: 'nova', cd: 60, cost: 100, color: '#ff2a5c', radius: 340, delay: 0.25, selfCenter: true, base: 200, perLvl: 25, adR: 1.2, dmgType: 'phys', slow: 0.5, slowT: 2 }),
    ],
  ),
  champ(
    { ...caster, id: 'ferro', name: 'Ferro', role: 'Artillery', title: 'the Far Sight', tags: ['Mage', 'Marksman'], color: '#4fd1ff', hp: 540, hpL: 90, ad: 52, adL: 2.8, armor: 22, armorL: 4.2, range: 575, ms: 330, mp: 420 },
    MAGE_BUILD,
    [
      ab({ name: 'Longshot', desc: 'A very long-range arcane shot that hits the first enemy.', kind: 'bolt', cd: 7, cost: 55, color: '#7fe3ff', range: 1500, speed: 2100, width: 70, base: 90, perLvl: 22, apR: 0.7 }),
      ab({ name: 'Gravity Well', desc: 'Create a well that heavily slows and grinds down enemies inside.', kind: 'zone', cd: 13, cost: 60, color: '#4f8dff', range: 900, radius: 280, dur: 3, slow: 0.5, base: 15, perLvl: 5, apR: 0.1 }),
      ab({ name: 'Repulse', desc: 'Blast nearby enemies away from you.', kind: 'nova', cd: 14, cost: 55, color: '#b5f0ff', radius: 260, delay: 0.05, selfCenter: true, knockback: 300, base: 50, perLvl: 12, apR: 0.4 }),
      ab({ name: 'Orbital Strike', desc: 'Target anywhere on the map; after a long delay a beam from the sky obliterates the area.', kind: 'nova', cd: 90, cost: 100, color: '#5ff0ff', range: 5000, radius: 320, delay: 1.8, base: 300, perLvl: 35, apR: 1 }),
    ],
  ),
  champ(
    { id: 'wren', name: 'Wren', role: 'Trapper', title: 'the Hedge Warden', tags: ['Marksman'], color: '#e6c75a', hp: 590, hpL: 94, ad: 60, adL: 3.1, armor: 25, armorL: 4.2, mr: 30, mrL: 1.3, range: 625, as: 0.66, asL: 0.03, ms: 330, ranged: true, mp: 340, mpL: 34, mpRegen: 7 },
    ADC_BUILD,
    [
      ab({ name: 'Piercing Bolt', desc: 'Fire a bolt that passes through every enemy in a line.', kind: 'bolt', cd: 7, cost: 45, color: '#fff0a8', range: 1100, speed: 2000, width: 80, pierce: true, base: 70, perLvl: 20, adR: 1.1, dmgType: 'phys' }),
      ab({ name: 'Snare Trap', desc: 'Set a hidden trap; the first enemy to step in snaps it, rooting and damaging everyone nearby.', kind: 'zone', cd: 12, cost: 50, color: '#d8b84a', range: 700, radius: 140, dur: 20, once: true, root: 1.3, base: 60, perLvl: 15, adR: 0.4, dmgType: 'phys' }),
      ab({ name: 'Vault', desc: 'Vault a short distance.', kind: 'dash', cd: 10, cost: 30, color: '#fff6d0', range: 350, speed: 1700 }),
      ab({ name: 'Barrage', desc: 'Rain bolts on an area for a few seconds, damaging and slowing enemies.', kind: 'zone', cd: 70, cost: 100, color: '#ffd84a', range: 1100, radius: 300, dur: 2.5, slow: 0.3, base: 120, perLvl: 20, adR: 0.6, dmgType: 'phys' }),
    ],
  ),
  champ(
    { ...caster, id: 'ysolde', name: 'Ysolde', role: 'Binder', title: 'the Star Warden', tags: ['Support', 'Mage'], color: '#8da8ff', hp: 540, hpL: 90, ad: 50, adL: 2.6, armor: 22, armorL: 4, ms: 330, mp: 440, mpRegen: 10 },
    SUPPORT_BUILD,
    [
      ab({ name: 'Binding Light', desc: 'A slow bolt that roots the first enemy hit in place.', kind: 'bolt', cd: 12, cost: 60, color: '#b9c8ff', range: 1100, speed: 1300, width: 75, root: 1.6, base: 80, perLvl: 20, apR: 0.6 }),
      ab({ name: 'Prism Shield', desc: 'Shield yourself and nearby allies.', kind: 'ally', cd: 10, cost: 50, color: '#d6e0ff', radius: 600, shield: 70, shieldL: 16, shieldT: 3, apR: 0.35 }),
      ab({ name: 'Pulse', desc: 'After a short delay, damages and slows enemies in an area.', kind: 'nova', cd: 8, cost: 55, color: '#8da8ff', range: 800, radius: 220, delay: 0.5, base: 65, perLvl: 16, apR: 0.5, slow: 0.35, slowT: 1.5 }),
      ab({ name: 'Starlight Cage', desc: 'Drop a cage of starlight that roots every enemy in a large area.', kind: 'nova', cd: 75, cost: 100, color: '#c6d2ff', range: 750, radius: 360, delay: 0.7, root: 1.5, base: 160, perLvl: 25, apR: 0.7 }),
    ],
  ),
  champ(
    { ...melee, id: 'rook', name: 'Rook', role: 'Vanguard', title: 'the Living Wall', tags: ['Tank'], color: '#b08d6a', hp: 700, hpL: 115, ad: 58, adL: 3.2, armor: 40, armorL: 5, ms: 335, mp: 320 },
    TANK_BUILD,
    [
      ab({ name: 'Shield Toss', desc: 'Hurl your shield, damaging and slowing the first enemy hit.', kind: 'bolt', cd: 7, cost: 40, color: '#e0c39a', range: 850, speed: 1500, width: 90, base: 70, perLvl: 18, apR: 0.4, slow: 0.4, slowT: 2 }),
      ab({ name: 'Stoneskin', desc: 'Turn to stone for a moment, gaining a huge damage shield.', kind: 'buff', cd: 16, cost: 50, color: '#c9b08f', shield: 140, shieldL: 25, shieldT: 3 }),
      ab({ name: 'Bulldoze', desc: 'Charge forward, knocking back every enemy in your path.', kind: 'dash', cd: 12, cost: 50, color: '#f0d7b0', range: 450, speed: 1400, knockback: 220, base: 60, perLvl: 15, adR: 0.4, dmgType: 'phys' }),
      ab({ name: 'Earthquake', desc: 'Shatter the ground, knocking up every enemy around you.', kind: 'nova', cd: 80, cost: 100, color: '#d8a86a', radius: 420, delay: 0.5, selfCenter: true, knockup: 1.3, base: 180, perLvl: 25, apR: 0.5 }),
    ],
  ),
);
// tag the original three
Object.assign(CHAMPS[0], { title: 'the Starbound', tags: ['Mage'] });
Object.assign(CHAMPS[1], { title: 'the Red Tide', tags: ['Fighter'] });
Object.assign(CHAMPS[2], { title: 'the Verdant Shot', tags: ['Marksman'] });

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
