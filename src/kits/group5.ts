// Lillia (hand-written from the reference data; values marked "approx" are not in the data export).
import type { Unit } from '../main';
import { K, register } from './registry';
import { face, foesIn, holdBuff, isChamp } from './util';

const now = () => K.time();
const DUST = 'dust';

// Passive Dream-Laden Bough: spell hits burn for max-health damage and leave Dream Dust (what her ultimate puts to sleep)
function dust(u: Unit, t: Unit) {
  if (t.kind !== 'champ' && t.kind !== 'monster') return;
  const c = u.champ!;
  if (t.marks.lilDot === undefined) {
    const total = K.pv(u, 'DotDamageFlat', 'LilliaPDoT') + (K.pv(u, 'DotDamagePercent', 'LilliaPDoT') * t.maxHp) * (t.kind === 'monster' ? 0.4 : 1) * (t.hp / t.maxHp < K.pv(u, 'LowHealthThreshold', 'LilliaPDoT') ? K.pv(u, 'LowHealthMod', 'LilliaPDoT') : 1);
    const secs = K.pv(u, 'Duration', 'LilliaPDoT');
    K.dot(u, t, total / secs, secs, 'magic', 'lilliaP');
    K.mark(t, 'lilDot', secs, 1, u);
    // she heals off the burn on monsters (big monsters heal more); champion healing is not in the export, so none
    if (t.kind === 'monster') {
      const big = t.maxHp > 1500;
      const pct = K.pv(u, 'MonsterHealingPercent', 'LilliaP') * (big ? K.pv(u, 'LargeMonsterHealMod', 'LilliaP') : 1);
      K.later(secs, () => !u.dead && K.heal(u, total * pct));
    }
  }
  K.mark(t, DUST, K.pv(u, 'Duration', 'LilliaPDoT') + 0.5, 1, u);
  // Prance: every spell hit stacks move speed (Q rank sets the strength)
  const st = c.st;
  const per = c.ranks[0] > 0 ? K.v(u, 0, 'PranceBonusPerStack', 'LilliaQ') : 0;
  if (per > 0) {
    st.prance = Math.min(K.v(u, 0, 'PranceMaxStacks', 'LilliaQ'), (now() > (st.pranceT ?? 0) ? 0 : st.prance ?? 0) + 1);
    st.pranceT = now() + K.v(u, 0, 'PranceDuration', 'LilliaQ');
    holdBuff(u, 'prance', 0, per * st.prance, K.v(u, 0, 'PranceDuration', 'LilliaQ'));
  }
}
register('lillia', {
  passive: {
    onDealt(u, t, dmg, _ty, from) {
      if (from === 'spell') dust(u, t);
      const sleep = t.marks.lilSleep;
      if (sleep && from !== 'dot') {
        // damage wakes a sleeping target and cashes in the break damage
        delete t.marks.lilSleep;
        t.stunT = 0;
        K.dmg(u, t, sleep.v, 'magic', 'dot');
        K.text(t, 'WOKEN', '#e8d0ff');
      }
      void dmg;
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.prance && now() > st.pranceT) st.prance = 0;
    },
  },
  cast: [
    // Q Blooming Blows: magic damage around her, extra true damage on the outer edge
    (k) => {
      const { u } = k;
      const max = K.v(u, 0, 'MaximumRadius', 'LilliaQ');
      const min = K.v(u, 0, 'MinimumRadius', 'LilliaQ');
      const mag = K.calc(u, 0, 'TotalDamage', 'LilliaQ');
      const tru = K.calc(u, 0, 'BonusTrueDamage', 'LilliaQ');
      K.ring(u.x, u.y, max, '#ffb0f0', 0.35, 10);
      for (const e of foesIn(u, u.x, u.y, max)) {
        const m = e.kind === 'minion' ? K.v(u, 0, 'MinionDamageMod', 'LilliaQ') : 1;
        K.dmg(u, e, mag * m, 'magic');
        if (K.dist(u, e) > min) K.dmg(u, e, tru * m, 'true', 'dot');
        K.burst(e.x, e.y, 6, { kind: 'ember', color: '#ffb0f0', speed: 260, life: 0.4, size: 4, drag: 5 });
      }
    },
    // W Watch Out! Eep!: a delayed smash; the sweet spot in the centre deals extra damage
    (k) => {
      const { u } = k;
      const range = K.v(u, 1, 'MaximumDistance', 'LilliaW');
      const r = K.v(u, 1, 'MinimumRadius', 'LilliaW');
      const sweet = K.v(u, 1, 'SweetSpotRadius', 'LilliaW');
      const tx = u.x + k.nx * Math.min(k.d, range);
      const ty = u.y + k.ny * Math.min(k.d, range);
      face(u, k.nx, k.ny);
      const base = K.calc(u, 1, 'FlatDamage', 'LilliaW');
      const mid = K.calc(u, 1, 'FlatDamageSweetSpot', 'LilliaW');
      const delay = K.v(u, 1, 'MaximumCastTime', 'LilliaW');
      K.teleCircle(tx, ty, r, '#d89bff', delay, () => {
        K.ring(tx, ty, r, '#d89bff', 0.4, 12);
        for (const e of foesIn(u, tx, ty, r)) {
          const m = e.kind === 'minion' ? K.v(u, 1, 'MinionDamageMod', 'LilliaW') : 1;
          const inner = Math.hypot(e.x - tx, e.y - ty) <= sweet + e.r;
          K.dmg(u, e, (inner ? mid : base) * m, 'magic');
        }
      });
    },
    // E Swirlseed: hits the first enemy, otherwise keeps rolling
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      const dmg = K.calc(u, 2, 'ImpactDamageTotal', 'LilliaE');
      const slow = K.v(u, 2, 'SlowAmount', 'LilliaE');
      const slowT = K.v(u, 2, 'SlowDuration', 'LilliaE');
      const hit = (e: Unit) => {
        K.dmg(u, e, dmg, 'magic');
        K.cc(e, { slow, slowT });
        K.burst(e.x, e.y, 10, { kind: 'ember', color: '#b8ff8a', speed: 300, life: 0.4, size: 4, drag: 5 });
      };
      const range = Math.min(k.a.ranges![k.rank - 1] || 700, 1000);
      K.proj({
        u, nx: k.nx, ny: k.ny, range, width: 85, speed: 1750, color: '#b8ff8a', maxHits: 1, cb: hit,
        onEnd: (p) => {
          if (p.hit.size > 0) return;
          // approx: the rolling seed travels ~1.5 s at 700 u/s before it settles
          K.proj({ u, nx: k.nx, ny: k.ny, from: { x: p.x, y: p.y }, range: 1100, width: 85, speed: 700, color: '#8aff9a', maxHits: 1, cb: hit });
        },
      });
    },
    // R Lilting Lullaby: everyone carrying Dream Dust gets drowsy, then falls asleep
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1] || 1500;
      const targets = K.foes(u, (e) => isChamp(e) && !!e.marks[DUST] && K.dist(u, e) <= Math.max(range, 1500) * 1.5);
      const drowsy = K.v(u, 3, 'DrowsyDuration', 'LilliaR');
      const sleep = K.v(u, 3, 'SleepDuration', 'LilliaR');
      const breakDmg = K.v(u, 3, 'BreakDamageBase', 'LilliaR') + 0.4 * u.ap; // approx: ratio not in the export
      K.ring(u.x, u.y, 900, '#e8d0ff', 0.6, 10);
      if (!targets.length) return false;
      for (const e of targets) {
        K.dmg(u, e, K.v(u, 3, 'ImpactDamage', 'LilliaR'), 'magic');
        K.cc(e, { slow: 0.1, slowT: drowsy });
        K.later(drowsy, () => {
          if (e.dead) return;
          K.cc(e, { stun: sleep });
          K.mark(e, 'lilSleep', sleep, breakDmg, u);
          K.text(e, 'ZZZ', '#e8d0ff');
        });
      }
    },
  ],
});
