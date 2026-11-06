// Typed access to the generated reference database (src/champions/data/*.json).
// Those files come from scripts/build-champions.mjs: Riot Data Dragon (text, stats, cooldowns,
// costs, ranges) plus the CommunityDragon client export (per-rank damage values and ratios).
export interface RefGameSpell {
  DataValues: Record<string, number[]>;
  calcs: Record<string, any>;
  cooldown?: number[];
  castRange?: number[];
  castRadius?: number[];
  mana?: number[];
  missileSpeed?: number;
  lineWidth?: number;
  maxAmmo?: number;
  ammoRechargeTime?: number[];
}
export interface RefSpell {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  description: string;
  tooltip: string;
  ddCooldown: number[];
  ddCost: number[];
  ddRange: number[];
  costType: string;
  maxrank: number;
  game: Record<string, RefGameSpell | { buff: true } | null>;
}
export interface RefChamp {
  id: string;
  version: string;
  name: string;
  title: string;
  tags: string[];
  resource: string;
  stats: {
    hp: number; hpperlevel: number; mp: number; mpperlevel: number; movespeed: number;
    armor: number; armorperlevel: number; spellblock: number; spellblockperlevel: number;
    attackrange: number; hpregen: number; hpregenperlevel: number; mpregen: number; mpregenperlevel: number;
    attackdamage: number; attackdamageperlevel: number; attackspeedperlevel: number; attackspeed: number;
  };
  basicAttack: { range: number; attackSpeed: number; asRatio?: number; windup?: number };
  passive: { name: string; description: string; values: Record<string, RefGameSpell | null> | null };
  spells: RefSpell[];
}
const files = import.meta.glob('./data/*.json', { eager: true, import: 'default' }) as Record<string, RefChamp>;
export const REF: Record<string, RefChamp> = Object.fromEntries(Object.values(files).map((c) => [c.id.toLowerCase(), c]));

// ---------- calculation evaluator (CommunityDragon GameCalculation trees) ----------
export interface StatCtx {
  level: number;
  ap: number;
  ad: number;
  bonusAd: number;
  armor: number;
  bonusArmor: number;
  mr: number;
  bonusMr: number;
  maxHp: number;
  bonusHp: number;
  hp: number;
  mana: number;
  maxMana: number;
}
// mStat enum as observed against Data Dragon tooltips: 0 AP, 1 Armor, 2 AD, 6 MR, 12 Max HP,
// formula 2 = bonus-only. 8 (crit chance) and 9 (crit damage) are 0 / 1x: the game has no crits.
export const UNSUPPORTED = new Set<string>();
function stat(s: StatCtx, id: number | undefined, formula?: number): number {
  const bonus = formula === 2;
  switch (id ?? 0) {
    case 0: return s.ap;
    case 1: return bonus ? s.bonusArmor : s.armor;
    case 2: return bonus ? s.bonusAd : s.ad;
    case 6: return bonus ? s.bonusMr : s.mr;
    case 8: return 0;
    case 9: return 1;
    case 12: return bonus ? s.bonusHp : s.maxHp;
    default:
      UNSUPPORTED.add(`stat ${id}`);
      return 0;
  }
}
function part(p: any, g: RefGameSpell, rank: number, s: StatCtx, all: Record<string, any>): number {
  if (!p) return 0;
  const dv = (n: string) => g.DataValues[n]?.[Math.min(rank, g.DataValues[n].length - 1)] ?? 0;
  switch (p.__type) {
    case 'NumberCalculationPart': return p.mNumber ?? 0;
    case 'NamedDataValueCalculationPart': return dv(p.mDataValue);
    case 'StatByCoefficientCalculationPart': return stat(s, p.mStat, p.mStatFormula) * (p.mCoefficient ?? 1);
    case 'StatByNamedDataValueCalculationPart': return stat(s, p.mStat, p.mStatFormula) * dv(p.mDataValue);
    case 'StatBySubPartCalculationPart': return stat(s, p.mStat, p.mStatFormula) * part(p.mSubpart, g, rank, s, all);
    case 'SumOfSubPartsCalculationPart': return (p.mSubparts ?? []).reduce((t: number, x: any) => t + part(x, g, rank, s, all), 0);
    case 'ProductOfSubPartsCalculationPart': return part(p.mPart1, g, rank, s, all) * part(p.mPart2, g, rank, s, all);
    case 'ByCharLevelInterpolationCalculationPart': return p.mStartValue + ((p.mEndValue - p.mStartValue) * (s.level - 1)) / 17;
    case 'ByCharLevelBreakpointsCalculationPart': {
      let v = p.mLevel1Value ?? 0;
      if (p.mInitialBonusPerLevel) v += p.mInitialBonusPerLevel * (s.level - 1);
      for (const b of p.mBreakpoints ?? []) if (s.level >= b.mLevel) v += b.mAdditionalBonusAtThisLevel ?? 0;
      return v;
    }
    case 'ByCharLevelFormulaCalculationPart': {
      // per-level table; a leading 0 is read as a pad entry (index = level), otherwise index = level - 1
      const v: number[] = p.values ?? [];
      const i = v[0] === 0 ? s.level : s.level - 1;
      return v[Math.max(0, Math.min(v.length - 1, i))] ?? 0;
    }
    case '{b22609db}': return dv(p['{91d404a5}']) + dv(p['{b2cd0eb0}']) * s.level; // base + per-level
    case '{f3cbe7b2}': return calcByName(g, p.mSpellCalculationKey, rank, s, all);
    default:
      UNSUPPORTED.add(p.__type);
      return 0;
  }
}
function calcByName(g: RefGameSpell, name: string, rank: number, s: StatCtx, all: Record<string, any>): number {
  const c = (g.calcs ?? {})[name] ?? all[name];
  if (!c) {
    UNSUPPORTED.add(`calc ${name}`);
    return 0;
  }
  switch (c.__type) {
    case 'GameCalculationModified': {
      const base = calcByName(g, c.mModifiedGameCalculation, rank, s, all);
      return base * part(c.mMultiplier, g, rank, s, all);
    }
    case 'GameCalculationConditional': return calcByName(g, c.mDefaultGameCalculation, rank, s, all);
    default: {
      let v = (c.mFormulaParts ?? []).reduce((t: number, x: any) => t + part(x, g, rank, s, all), 0);
      if (c.mMultiplier) v *= part(c.mMultiplier, g, rank, s, all);
      return v;
    }
  }
}
export function evalCalc(g: RefGameSpell, name: string, rank: number, s: StatCtx): number {
  return calcByName(g, name, rank, s, g.calcs ?? {});
}
export function dataValue(g: RefGameSpell, name: string, rank: number): number {
  const a = g.DataValues[name];
  return a ? a[Math.min(rank, a.length - 1)] : 0;
}
