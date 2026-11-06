import type { Unit } from '../main';
import { K } from './registry';

export const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};
/** Enemies whose body touches a circle. */
export const foesIn = (u: Unit, x: number, y: number, r: number, test: (e: Unit) => boolean = () => true) =>
  K.foes(u, (e) => Math.hypot(e.x - x, e.y - y) <= r + e.r && test(e));
/** Enemies touching a thick line segment. */
export const foesOnLine = (u: Unit, sx: number, sy: number, ex: number, ey: number, w: number, test: (e: Unit) => boolean = () => true) =>
  K.foes(u, (e) => segDist(e, { x: sx, y: sy }, { x: ex, y: ey }) <= w / 2 + e.r && test(e));
/** Enemies inside a cone of half-angle `half` (radians) around (nx, ny). */
export const foesInCone = (u: Unit, nx: number, ny: number, range: number, half: number) =>
  K.foes(u, (e) => {
    const dx = e.x - u.x;
    const dy = e.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > range + e.r) return false;
    return d < 1 || (dx * nx + dy * ny) / d >= Math.cos(half);
  });
export const isChamp = (e: Unit) => e.kind === 'champ';
export const isMonster = (e: Unit) => e.kind === 'monster';
export const face = (u: Unit, nx: number, ny: number) => {
  u.face = Math.atan2(ny, nx);
};
/** Point `dist` away from u toward the aim, clamped to the cast range. */
export const aimPoint = (u: Unit, nx: number, ny: number, d: number, range: number) => {
  const r = Math.min(d, range);
  return { x: u.x + nx * r, y: u.y + ny * r };
};

/** Keeps exactly one buff entry alive per key (refreshing its time), for effects that can be extended. */
export function holdBuff(u: Unit, key: string, as: number, ms: number, t: number) {
  const c = u.champ!;
  const b = c.st['b_' + key] as { as: number; ms: number; t: number } | undefined;
  if (b && c.buffs.includes(b)) {
    b.as = as;
    b.ms = ms;
    b.t = t;
  } else {
    const nb = { as, ms, t };
    c.st['b_' + key] = nb;
    c.buffs.push(nb);
  }
}
export function dropBuff(u: Unit, key: string) {
  const c = u.champ!;
  const b = c.st['b_' + key];
  if (b) c.buffs = c.buffs.filter((x) => x !== b);
}
export const hpPct = (u: Unit) => u.hp / u.maxHp;
