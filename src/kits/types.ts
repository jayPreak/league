import type { AbilityDef, DmgType, Vec } from '../data';
import type { Champ, Proj, Unit } from '../main';
import type { StatCtx } from '../champions/ref';
import type { BurstOpts } from '../fx';

export interface KCtx {
  u: Unit;
  c: Champ;
  slot: number;
  rank: number;
  a: AbilityDef;
  tx: number; // aim point
  ty: number;
  nx: number; // unit vector toward the aim point
  ny: number;
  d: number; // distance to the aim point
  recast: boolean; // true when this cast is a recast of an open window
}
// false = refused (nothing spent); recast = keep the ability open for that many seconds;
// cd = override the cooldown that starts now
export type KResult = void | false | { recast?: number; cd?: number; free?: boolean; keepCd?: boolean };
export type KCast = (k: KCtx) => KResult;

export interface CCOpts {
  stun?: number;
  slow?: number;
  slowT?: number;
  root?: number;
  air?: number;
  silence?: number;
  charm?: number;
  src?: Unit;
  pull?: Vec;
  pullSpeed?: number;
  knock?: { from: Vec; dist: number; speed?: number };
}
export interface ProjOpts {
  u: Unit;
  nx: number;
  ny: number;
  from?: Vec;
  range: number;
  width: number;
  speed: number;
  color: string;
  pierce?: boolean;
  maxHits?: number;
  champOnly?: boolean;
  homing?: Unit;
  cb: (e: Unit, p: Proj) => void;
  onEnd?: (p: Proj) => void;
}
export interface PetOpts {
  name: string;
  x: number;
  y: number;
  hp: number;
  ad: number;
  as: number;
  range: number;
  ms: number;
  life: number;
  r?: number;
  armor?: number;
  mr?: number;
}

// What a kit is allowed to do to the game. Implemented in main.ts.
export interface KApi {
  dist(a: Vec, b: Vec): number;
  clamp(v: number, lo: number, hi: number): number;
  time(): number;
  rand(): number;
  dmg(src: Unit, t: Unit, amt: number, type: DmgType, from?: 'attack' | 'spell' | 'dot'): number;
  heal(u: Unit, amt: number): void;
  shield(t: Unit, amt: number, secs: number, color: string): void;
  foes(u: Unit, test?: (e: Unit) => boolean): Unit[];
  allies(u: Unit, radius?: number, includeSelf?: boolean): Unit[];
  units(): Unit[];
  nearestFoe(u: Unit, radius: number, pred?: (e: Unit) => boolean): Unit | null;
  pick(u: Unit, tx: number, ty: number, range: number, grab?: number, pred?: (e: Unit) => boolean): Unit | null;
  pickAlly(u: Unit, tx: number, ty: number, range: number, grab?: number, includeSelf?: boolean): Unit | null;
  v(u: Unit, slot: number, name: string, spell?: string): number; // reference DataValue at current rank
  calc(u: Unit, slot: number, name: string, spell?: string): number; // evaluated GameCalculation
  pv(u: Unit, name: string, spell?: string, rank?: number): number; // passive / summon DataValue
  pcalc(u: Unit, name: string, spell?: string, rank?: number): number;
  ctx(u: Unit): StatCtx;
  cc(e: Unit, o: CCOpts): void;
  dot(src: Unit, t: Unit, dps: number, secs: number, type: DmgType, tag: string): void;
  mark(t: Unit, key: string, secs: number, v?: number, src?: Unit | null): void;
  markOf(t: Unit, key: string): { t: number; v: number; src: Unit | null } | undefined;
  proj(o: ProjOpts): Proj;
  later(secs: number, fn: () => void): void;
  every(secs: number, fn: (dt: number, left: number) => boolean | void): void;
  teleCircle(x: number, y: number, r: number, color: string, secs: number, fn: () => void): void;
  teleLine(sx: number, sy: number, ex: number, ey: number, w: number, color: string, secs: number, fn: () => void): void;
  dash(u: Unit, tx: number, ty: number, speed: number, o?: { cb?: (e: Unit) => void; end?: () => void; hitR?: number }): void;
  blink(u: Unit, tx: number, ty: number): void;
  isWall(x: number, y: number): boolean;
  ring(x: number, y: number, r: number, color: string, life?: number, width?: number): void;
  burst(x: number, y: number, n: number, o: BurstOpts): void;
  trauma(at: Vec, amt: number): void;
  text(u: Unit, str: string, color?: string): void;
  pet(owner: Unit, o: PetOpts): Unit;
  remove(u: Unit): void;
  costOf(u: Unit, slot: number): number;
  cdOf(u: Unit, slot: number): number;
  refundCd(u: Unit, slot: number, secs: number): void;
  setCd(u: Unit, slot: number, secs: number): void;
  rankOf(u: Unit, slot: number): number;
  recalc(u: Unit): void;
  effAS(u: Unit): number;
  addBuff(u: Unit, as: number, ms: number, t: number): void;
}

export interface Passive {
  tick?(u: Unit, dt: number): void;
  recalc?(u: Unit): void; // after stats are rebuilt (level-up, items)
  onAttack?(u: Unit, t: Unit, dealt: number): void; // after one of u's basic attacks lands
  onDealt?(u: Unit, t: Unit, dmg: number, type: DmgType, from: 'attack' | 'spell' | 'dot'): void;
  onTaken?(u: Unit, src: Unit, amt: number, type: DmgType): number; // returns the damage to apply
  onKill?(u: Unit, victim: Unit, assist: boolean): void;
  onLastHit?(u: Unit, victim: Unit): void; // minion / monster kills
  onCast?(u: Unit, slot: number): void;
  recastEnd?(u: Unit, slot: number): void;
  armorPen?(u: Unit, t: Unit): number; // fraction of armor ignored
}
export interface Kit {
  cast: [KCast, KCast, KCast, KCast];
  passive?: Passive;
}
