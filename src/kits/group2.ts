// Irelia, Lux, Rengar, Garen, Ashe. Numbers come from the reference data at cast time.
import type { Unit } from '../main';
import { K, register } from './registry';
import { dropBuff, face, foesIn, foesInCone, foesOnLine, holdBuff, isChamp, isMonster, segDist } from './util';

const now = () => K.time();

// ---------------------------------------------------------------- Irelia
const IP = 'IreliaPassive';
function fervor(u: Unit) {
  const st = u.champ!.st;
  if (now() - (st.fvGain ?? -9) < 0.25) return; // one stack per burst of hits
  st.fvGain = now();
  st.fv = Math.min(K.pv(u, 'MaxStacks', IP), (st.fv ?? 0) + 1);
  st.fvT = now() + K.pv(u, 'BuffDuration', IP);
}
register('irelia', {
  passive: {
    onDealt(u, t, _d, _ty, from) {
      if (from === 'spell' && (t.kind === 'champ' || t.kind === 'monster' || t.kind === 'minion')) fervor(u);
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if (st.fv >= K.pv(u, 'MaxStacks', IP)) {
        const mod = t.kind === 'tower' || t.kind === 'nexus' ? K.pv(u, 'OnHitStructureMod', IP) : 1;
        K.dmg(u, t, K.pcalc(u, 'OnHitBonus', IP) * mod, 'magic', 'dot');
      }
    },
    onTaken(u, _src, amt, type) {
      if (!u.champ!.st.wT) return amt;
      const dr = K.calc(u, 1, type === 'phys' ? 'FinalPhysicalDR' : 'FinalMagicDR', 'IreliaW') / 100;
      return type === 'true' ? amt : amt * (1 - dr);
    },
    tick(u, dt) {
      const c = u.champ!;
      const st = c.st;
      if (st.fv > 0 && now() > st.fvT) st.fv = 0;
      if (st.fv > 0) holdBuff(u, 'p', (st.fv * K.pcalc(u, 'SingleStackAS', IP)) / 100, 0, 0.3);
      else dropBuff(u, 'p');
      if (st.wT) {
        st.wT += dt; // time spent charging Defiant Dance
        u.rootT = Math.max(u.rootT, 0.1);
        c.order = null;
        if (u.stunT > 0 || u.dead) {
          st.wT = 0;
          c.rc[1] = 0;
          c.cds[1] = K.cdOf(u, 1);
        }
      }
    },
    recastEnd(u, slot) {
      if (slot === 1 && u.champ!.st.wT) releaseW(u, Math.cos(u.face), Math.sin(u.face));
    },
  },
  cast: [
    // Q Bladesurge
    (k) => {
      const { u } = k;
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 260);
      if (!t) return false;
      const marked = !!t.marks.unsteady;
      const dmg = K.calc(u, 0, t.kind === 'minion' || t.kind === 'monster' ? 'MinionDamage' : 'ChampionDamage', 'IreliaQ');
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const dl = Math.hypot(dx, dy) || 1;
      face(u, dx, dy);
      K.dash(u, t.x - (dx / dl) * (t.r + 40), t.y - (dy / dl) * (t.r + 40), K.v(u, 0, 'DashSpeedBonus', 'IreliaQ') + u.ms, {
        end: () => {
          K.dmg(u, t, dmg, 'phys');
          if (t.kind === 'champ' || t.kind === 'monster') K.heal(u, K.calc(u, 0, 'HealAmount', 'IreliaQ') + u.maxHp * 0);
          if (marked || t.dead) K.setCd(u, 0, 0); // refreshed on a Marked target or a kill
        },
      });
      return marked ? { cd: 0.25 } : undefined;
    },
    // W Defiant Dance: charge, then release (recast) or let it expire
    (k) => {
      const { u, c } = k;
      if (k.recast) return void releaseW(u, k.nx, k.ny);
      c.st.wT = 0.001;
      return { recast: K.v(u, 1, 'MaxDuration', 'IreliaW') };
    },
    // E Flawless Duet: place a blade, recast to throw the second
    (k) => {
      const { u, c } = k;
      const max = K.v(u, 2, 'MaxRange', 'IreliaE');
      if (!k.recast) {
        const r = Math.min(k.d, max);
        c.st.eBlade = { x: u.x + k.nx * r, y: u.y + k.ny * r };
        K.ring(c.st.eBlade.x, c.st.eBlade.y, 60, '#6fc8ff', 0.5, 6);
        return { recast: K.v(u, 2, 'BuffDuration', 'IreliaE') };
      }
      const a = c.st.eBlade as { x: number; y: number };
      const r = Math.min(Math.max(k.d, K.v(u, 2, 'MinRange', 'IreliaE')), max);
      const b = { x: u.x + k.nx * r, y: u.y + k.ny * r };
      face(u, k.nx, k.ny);
      K.later(K.v(u, 2, 'RevTime', 'IreliaE'), () => {
        for (const e of K.foes(u, (e) => segDist(e, a, b) <= 45 + e.r)) {
          K.dmg(u, e, K.calc(u, 2, 'TotalDamage', 'IreliaE'), 'magic');
          K.mark(e, 'unsteady', K.v(u, 2, 'MarkDuration', 'IreliaE'), 1, u);
          if (e.kind === 'champ') K.cc(e, { stun: K.v(u, 2, 'StunDuration', 'IreliaE') });
        }
        K.ring(a.x, a.y, 70, '#6fc8ff', 0.4, 6);
        K.ring(b.x, b.y, 70, '#6fc8ff', 0.4, 6);
      });
    },
    // R Vanguard's Edge
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      let caged = false;
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 160, speed: 2000, color: '#4fa8ff', pierce: true,
        cb: (e, p) => {
          K.dmg(u, e, K.calc(u, 3, 'MissileDamage', 'IreliaR'), 'magic');
          K.mark(e, 'unsteady', K.v(u, 3, 'MarkDuration', 'IreliaR'), 1, u);
          if (e.kind === 'champ' && !caged) {
            caged = true;
            p.done = true;
            cage(u, e.x, e.y);
          }
        },
        onEnd: (p) => {
          if (!caged) cage(u, p.x, p.y); // no champion hit: the wall forms where the blades land
        },
      });
    },
  ],
});
function releaseW(u: Unit, nx: number, ny: number) {
  const c = u.champ!;
  const charged = c.st.wT as number;
  c.st.wT = 0;
  c.rc[1] = 0;
  c.cds[1] = K.cdOf(u, 1);
  const f = Math.min(1, charged / K.v(u, 1, 'ChargeTimeForMax', 'IreliaW'));
  const lo = K.calc(u, 1, 'MinDamageCalc', 'IreliaW');
  const hi = K.calc(u, 1, 'MaxDamageCalc', 'IreliaW');
  const dmg = lo + (hi - lo) * f;
  face(u, nx, ny);
  for (const e of foesOnLine(u, u.x, u.y, u.x + nx * 825, u.y + ny * 825, 120)) K.dmg(u, e, dmg, 'phys');
  K.ring(u.x + nx * 300, u.y + ny * 300, 200, '#cfeeff', 0.4, 8);
}
function cage(u: Unit, x: number, y: number) {
  const dur = K.v(u, 3, 'ZoneDuration', 'IreliaR');
  const R = 450; // wall radius is not in the data export (see docs/CHAMPIONS.md)
  const hit = new Set<Unit>();
  K.ring(x, y, R, '#4fa8ff', dur, 10);
  K.every(dur, () => {
    for (const e of K.foes(u, (e) => Math.abs(K.dist(e, { x, y }) - R) < e.r + 70)) {
      if (hit.has(e)) continue;
      hit.add(e);
      K.dmg(u, e, K.calc(u, 3, 'ZoneDamage', 'IreliaR'), 'magic');
      K.cc(e, { slow: K.v(u, 3, 'SlowAmount', 'IreliaR') / 100, slowT: K.v(u, 3, 'CCDuration', 'IreliaR') });
    }
  });
}

// ---------------------------------------------------------------- Lux
const LP = 'LuxIlluminationPassive';
function illuminate(u: Unit, t: Unit) {
  if (t.kind === 'champ' || t.kind === 'monster' || t.kind === 'minion') K.mark(t, 'illum', K.pv(u, 'DebuffDuration', LP), 1, u);
}
register('lux', {
  passive: {
    onDealt(u, t, _d, _ty, from) {
      if (from === 'spell') illuminate(u, t);
    },
    onAttack(u, t) {
      if (t.marks.illum) {
        delete t.marks.illum;
        K.dmg(u, t, K.pcalc(u, 'TotalDamage', LP), 'magic', 'dot');
      }
    },
    onKill(u, victim) {
      const r = u.champ!.st.rHit as Map<Unit, number> | undefined;
      if (r && r.has(victim) && now() - r.get(victim)! < K.v(u, 3, 'ResetAssistWindow', 'LuxR')) u.champ!.cds[3] *= 1 - K.v(u, 3, 'ResetPercent', 'LuxR');
    },
  },
  cast: [
    // Q Light Binding: binds up to two enemies
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 80, speed: 1200, color: '#fff0b8', pierce: true, maxHits: 2,
        cb: (e) => {
          K.dmg(u, e, K.calc(u, 0, 'TotalDamageTT', 'LuxLightBinding'), 'magic');
          K.cc(e, { root: K.v(u, 0, 'RootDuration', 'LuxLightBinding') });
          K.burst(e.x, e.y, 10, { kind: 'ember', color: '#fff0b8', speed: 300, life: 0.4, size: 4, drag: 5 });
        },
      });
    },
    // W Prismatic Barrier: the wand shields allies on the way out and back
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1];
      const speed = 2200;
      const shield = K.calc(u, 1, 'TotalShieldTT', 'LuxPrismaticWave');
      const dur = K.v(u, 1, 'ShieldDuration', 'LuxPrismaticWave');
      const out = range / speed;
      const total = out * 2;
      let t0 = 0;
      const done = new Set<Unit>();
      const a = { x: u.x, y: u.y };
      let wasOut = true;
      face(u, k.nx, k.ny);
      K.every(total, (dt) => {
        t0 += dt;
        const isOut = t0 < out;
        if (wasOut && !isOut) done.clear();
        wasOut = isOut;
        const d = isOut ? t0 * speed : Math.max(0, (total - t0) * speed);
        const p = { x: a.x + k.nx * d, y: a.y + k.ny * d };
        for (const al of K.allies(u)) if (!done.has(al) && K.dist(al, p) <= 150 + al.r) {
          done.add(al);
          K.shield(al, shield, dur, '#fff6d0');
        }
      });
    },
    // E Lucent Singularity: placed field, recast (or time out) to detonate
    (k) => {
      const { u, c } = k;
      const rad = 295;
      const slowFor = K.v(u, 2, 'SlowZoneDuration', 'LuxLightStrikeKugel');
      if (k.recast) return void detonate(u);
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      c.st.eField = { x, y, rad };
      K.later(r / 1300, () => {
        K.ring(x, y, rad, '#ffe27a', slowFor, 6);
      });
      K.every(slowFor + r / 1300, () => {
        const f = c.st.eField;
        if (!f) return false;
        for (const e of foesIn(u, f.x, f.y, f.rad)) K.cc(e, { slow: K.v(u, 2, 'SlowPercent', 'LuxLightStrikeKugel') / 100, slowT: K.v(u, 2, 'SlowLingerDuration', 'LuxLightStrikeKugel') });
      });
      return { recast: slowFor + r / 1300 };
    },
    // R Final Spark
    (k) => {
      const { u } = k;
      const len = Math.min(3340, 3340);
      const sx = u.x;
      const sy = u.y;
      const ex = sx + k.nx * len;
      const ey = sy + k.ny * len;
      face(u, k.nx, k.ny);
      K.teleLine(sx, sy, ex, ey, 190, '#fff3a0', 1, () => {
        const hits = new Map<Unit, number>();
        for (const e of foesOnLine(u, sx, sy, ex, ey, 190)) {
          K.dmg(u, e, K.calc(u, 3, 'TotalDamage', 'LuxR'), 'magic');
          if (e.marks.illum) {
            delete e.marks.illum;
            K.dmg(u, e, K.pcalc(u, 'TotalDamage', LP), 'magic', 'dot'); // the beam triggers Illumination
          }
          illuminate(u, e); // and refreshes it
          hits.set(e, now());
        }
        u.champ!.st.rHit = hits;
        K.ring(sx, sy, 200, '#fff3a0', 0.5, 10);
        K.trauma({ x: sx, y: sy }, 0.4);
      });
    },
  ],
});
function detonate(u: Unit) {
  const c = u.champ!;
  const f = c.st.eField as { x: number; y: number; rad: number } | undefined;
  c.st.eField = undefined;
  c.rc[2] = 0;
  c.cds[2] = K.cdOf(u, 2);
  if (!f) return;
  for (const e of foesIn(u, f.x, f.y, f.rad)) K.dmg(u, e, K.calc(u, 2, 'TotalDamageTT', 'LuxLightStrikeKugel'), 'magic');
  K.ring(f.x, f.y, f.rad, '#fff3b0', 0.4, 10);
  K.burst(f.x, f.y, 20, { kind: 'ember', color: '#ffe27a', speed: 500, life: 0.5, size: 5, drag: 5 });
}

// ---------------------------------------------------------------- Rengar
const RP = 'RengarPassive';
// Ferocity lives in the resource bar (0-4). Casting Q/W/E adds one; at 4 the next cast is empowered.
function ferocity(u: Unit): boolean {
  if (u.mp >= K.pv(u, 'MaxFerocity', RP)) {
    u.mp = 0;
    return true;
  }
  u.mp += 1;
  return false;
}
register('rengar', {
  passive: {
    onTaken(u, _src, amt) {
      const log = (u.champ!.st.dmgLog ??= []) as { t: number; a: number }[];
      log.push({ t: now(), a: amt });
      return amt;
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.qT ?? 0) > now()) {
        const emp = st.qEmp;
        K.dmg(u, t, K.calc(u, 0, emp ? 'EmpoweredQTotalDamage' : 'QTotalDamage', 'RengarQ'), 'phys', 'dot');
        if (emp) K.addBuff(u, K.calc(u, 0, 'EmpoweredQAS', 'RengarQ'), 0, K.v(u, 0, 'ASDuration', 'RengarQ'));
        st.qT = 0;
        st.qEmp = false;
      }
    },
    tick(u, dt) {
      const c = u.champ!;
      const st = c.st;
      if (st.ccImm && now() < st.ccImm) {
        u.stunT = u.rootT = u.slowT = u.silenceT = u.charmT = 0;
      }
      // Thrill of the Hunt: camouflage, speed, track the nearest champion, leap at it
      if ((st.rT ?? 0) > now()) {
        holdBuff(u, 'r', 0, K.v(u, 3, 'StealthMS', 'RengarR') / 100, 0.3);
        const prey = K.nearestFoe(u, K.v(u, 3, 'EnemyDetectionRange', 'RengarR'), isChamp);
        st.prey = prey;
        const o = c.order;
        if (prey && o && o.type === 'attack' && o.target === prey && !c.dash) {
          const d = K.dist(u, prey);
          const leap = K.v(u, 3, 'LeapRange', 'RengarR');
          if (d > u.range + u.r + prey.r + 30 && d <= leap + prey.r) {
            const dx = prey.x - u.x;
            const dy = prey.y - u.y;
            const dl = Math.hypot(dx, dy) || 1;
            K.dash(u, prey.x - (dx / dl) * (prey.r + 60), prey.y - (dy / dl) * (prey.r + 60), 1800, {
              end: () => {
                K.dmg(u, prey, K.calc(u, 3, 'BonusDamage', 'RengarR'), 'phys');
                prey.shredPct = K.v(u, 3, 'ArmorShred', 'RengarR') / 100;
                prey.shredT = K.v(u, 3, 'ArmorShredDuration', 'RengarR');
                u.stealthT = 0;
                st.rT = 0;
                dropBuff(u, 'r');
                ferocity(u);
              },
            });
          }
        }
      } else if (st.rT) {
        st.rT = 0;
        dropBuff(u, 'r');
        u.stealthT = 0;
      }
      void dt;
    },
  },
  cast: [
    // Q Savagery: the next attack stabs
    (k) => {
      const { u, c } = k;
      const emp = ferocity(u);
      c.st.qT = now() + K.v(u, 0, 'BuffDuration', 'RengarQ');
      c.st.qEmp = emp;
      K.ring(u.x, u.y, 70, '#ffb36b', 0.3, 6);
    },
    // W Battle Roar
    (k) => {
      const { u, c } = k;
      const emp = ferocity(u);
      const win = K.v(u, 1, 'HealingWindow', 'RengarW');
      const taken = ((c.st.dmgLog ?? []) as { t: number; a: number }[]).filter((d) => now() - d.t <= win).reduce((s, d) => s + d.a, 0);
      for (const e of foesIn(u, u.x, u.y, 450)) {
        K.dmg(u, e, K.calc(u, 1, emp ? 'TotalDamageEmpowered' : 'TotalDamage', 'RengarW'), 'magic');
        if (isMonster(e)) K.dmg(u, e, K.calc(u, 1, 'BonusMonsterDamage', 'RengarW'), 'magic');
      }
      K.heal(u, (taken * K.v(u, 1, 'DamagePercentageHealed', 'RengarW')) / 100);
      if (emp) {
        c.st.ccImm = now() + K.v(u, 1, 'CCImmuneDuration', 'RengarW');
        u.stunT = u.rootT = u.slowT = u.silenceT = 0; // breaks crowd control
      }
      K.ring(u.x, u.y, 450, '#ff9a4a', 0.4, 8);
    },
    // E Bola Strike
    (k) => {
      const { u } = k;
      const emp = ferocity(u);
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 70, speed: 1500, color: '#d8a46a',
        cb: (e) => {
          K.dmg(u, e, K.calc(u, 2, emp ? 'TotalEmpoweredDamage' : 'TotalDamage', 'RengarE'), 'phys');
          const cc = K.v(u, 2, 'CCDuration', 'RengarE');
          K.cc(e, emp ? { root: cc } : { slow: K.v(u, 2, 'SlowAmount', 'RengarE') / 100, slowT: cc });
        },
      });
    },
    // R Thrill of the Hunt
    (k) => {
      const { u, c } = k;
      const dur = K.v(u, 3, 'StealthDuration', 'RengarR');
      c.st.rT = now() + dur;
      K.later(K.v(u, 3, 'FadeTime', 'RengarR'), () => {
        if (!u.dead && (c.st.rT ?? 0) > now()) u.stealthT = dur;
      });
    },
  ],
});

// ---------------------------------------------------------------- Garen
register('garen', {
  passive: {
    recalc(u) {
      const r = u.champ!.st.resist ?? 0;
      u.armor += r;
      u.mr += r;
    },
    onTaken(u, _src, amt) {
      u.champ!.st.hurtT = now();
      return amt;
    },
    onLastHit(u) {
      const st = u.champ!.st;
      const cap = K.v(u, 1, 'ResistMax', 'GarenW');
      if (K.rankOf(u, 1) > 0 && (st.resist ?? 0) < cap) {
        st.resist = Math.min(cap, (st.resist ?? 0) + K.v(u, 1, 'ResistGainOnKill', 'GarenW'));
        K.recalc(u);
      }
    },
    onKill(u) {
      const st = u.champ!.st;
      const cap = K.v(u, 1, 'ResistMax', 'GarenW');
      if (u.champ!.ranks[1] > 0) {
        st.resist = Math.min(cap, (st.resist ?? 0) + K.v(u, 1, 'ResistGainOnKill', 'GarenW'));
        K.recalc(u);
      }
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.qT ?? 0) > now()) {
        st.qT = 0;
        K.dmg(u, t, K.calc(u, 0, 'TotalDamage', 'GarenQ'), 'phys', 'dot');
        K.cc(t, { silence: K.v(u, 0, 'SilenceDuration', 'GarenQ') });
      }
    },
    tick(u, dt) {
      const st = u.champ!.st;
      // Perseverance: regenerates a share of max health every second while undamaged
      if (now() - (st.hurtT ?? -99) >= K.pv(u, 'DamageTimer', 'GarenPassive')) K.heal(u, K.pcalc(u, 'RegenCalc', 'GarenPassive') * u.maxHp * dt);
      // Judgment
      const j = st.spin as { t: number; acc: number; n: number } | undefined;
      if (j) {
        j.t -= dt;
        j.acc += dt;
        const per = K.v(u, 2, 'Duration', 'GarenE') / K.v(u, 2, 'NumTicks', 'GarenE');
        if (u.dead || u.stunT > 0 || u.silenceT > 0) endSpin(u);
        else if (j.acc >= per) {
          j.acc -= per;
          j.n++;
          const near = foesIn(u, u.x, u.y, 325);
          const nearest = near.slice().sort((a, b) => K.dist(a, u) - K.dist(b, u))[0];
          const dmg = K.calc(u, 2, 'TotalDamage', 'GarenE');
          for (const e of near) {
            K.dmg(u, e, e === nearest ? dmg * (1 + K.v(u, 2, 'NearestEnemyBonus', 'GarenE')) : dmg, 'phys');
            if (e.kind === 'champ') {
              const m = (K.markOf(e, 'garenE')?.v ?? 0) + 1;
              K.mark(e, 'garenE', K.v(u, 2, 'ShredDuration', 'GarenE'), m, u);
              if (m >= K.v(u, 2, 'StacksToShred', 'GarenE')) {
                e.shredPct = K.v(u, 2, 'ShredAmount', 'GarenE');
                e.shredT = K.v(u, 2, 'ShredDuration', 'GarenE');
              }
            }
          }
          K.ring(u.x, u.y, 325, '#ffd27a', 0.2, 5);
        }
        if (j.t <= 0) endSpin(u);
      }
    },
  },
  cast: [
    // Q Decisive Strike
    (k) => {
      const { u, c } = k;
      u.slowT = 0;
      K.addBuff(u, 0, K.v(u, 0, 'MovementSpeedAmount', 'GarenQ'), K.v(u, 0, 'MovementSpeedDuration', 'GarenQ'));
      c.st.qT = now() + K.v(u, 0, 'AttackWindow', 'GarenQ');
      K.ring(u.x, u.y, 80, '#cfe0ff', 0.3, 6);
    },
    // W Courage
    (k) => {
      const { u } = k;
      K.shield(u, K.calc(u, 1, 'TotalShield', 'GarenW'), K.v(u, 1, 'UpfrontDuration', 'GarenW'), '#9fc0ff');
      u.drPct = K.v(u, 1, 'DRPercent', 'GarenW');
      u.drT = K.v(u, 1, 'DRDuration', 'GarenW');
    },
    // E Judgment (recast to stop)
    (k) => {
      const { u, c } = k;
      if (k.recast) return void endSpin(u);
      const dur = K.v(u, 2, 'Duration', 'GarenE');
      c.st.spin = { t: dur, acc: 0, n: 0 };
      return { recast: dur };
    },
    // R Demacian Justice
    (k) => {
      const { u } = k;
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 300, isChamp) ?? K.nearestFoe(u, k.a.ranges![k.rank - 1], isChamp);
      if (!t) return false;
      face(u, t.x - u.x, t.y - u.y);
      const dmg = K.v(u, 3, 'BaseDamage', 'GarenR') + (t.maxHp - t.hp) * K.v(u, 3, 'ExecuteDamage', 'GarenR');
      K.ring(t.x, t.y, 120, '#fff0b0', 0.5, 10);
      K.later(0.15, () => {
        K.dmg(u, t, dmg, 'true');
        K.trauma(t, 0.4);
      });
    },
  ],
});
function endSpin(u: Unit) {
  const c = u.champ!;
  if (!c.st.spin) return;
  c.st.spin = undefined;
  c.rc[2] = 0;
  c.cds[2] = K.cdOf(u, 2);
}

// ---------------------------------------------------------------- Ashe
const AP = 'AshePassive';
register('ashe', {
  passive: {
    onAttack(u, t, dealt) {
      const st = u.champ!.st;
      if (t.kind === 'champ' || t.kind === 'minion' || t.kind === 'monster') {
        K.cc(t, { slow: K.pcalc(u, 'SlowAmount', AP), slowT: K.pv(u, 'SlowDuration', AP) });
        // bonus damage on slowed targets scales with crit chance, which this game has none of
        K.dmg(u, t, u.ad * (K.pcalc(u, 'DamageBonus', AP) - 1), 'phys', 'dot');
      }
      if ((st.qBuffT ?? 0) > now()) {
        const per = K.calc(u, 0, 'EmpoweredDamage', 'AsheQ');
        if (per > dealt) K.dmg(u, t, per - dealt, 'phys', 'dot'); // the flurry replaces the basic attack
      } else {
        st.focus = Math.min(K.v(u, 0, 'MaxStacks', 'AsheQ'), (st.focus ?? 0) + 1);
        st.focusT = now() + K.v(u, 0, 'StackDuration', 'AsheQ');
      }
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.focus > 0 && now() > st.focusT) st.focus = 0;
      if ((st.qBuffT ?? 0) > 0 && now() > st.qBuffT) st.qBuffT = 0;
    },
  },
  cast: [
    // Q Ranger's Focus: needs full Focus
    (k) => {
      const { u, c } = k;
      if ((c.st.focus ?? 0) < K.v(u, 0, 'MaxStacks', 'AsheQ')) return false;
      c.st.focus = 0;
      c.st.qBuffT = now() + K.v(u, 0, 'BuffDuration', 'AsheQ');
      K.addBuff(u, K.v(u, 0, 'BonusAS', 'AsheQ') / 100, 0, K.v(u, 0, 'BuffDuration', 'AsheQ'));
      K.ring(u.x, u.y, 90, '#b8ecff', 0.4, 6);
    },
    // W Volley: a cone of arrows
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      const range = k.a.ranges![k.rank - 1];
      for (const e of foesInCone(u, k.nx, k.ny, range, 0.5)) {
        K.dmg(u, e, K.calc(u, 1, 'TotalDamage', 'Volley'), 'phys');
        if (e.kind === 'champ' || e.kind === 'minion') K.cc(e, { slow: K.pcalc(u, 'SlowAmount', AP), slowT: K.pv(u, 'SlowDuration', AP) });
      }
      K.ring(u.x + k.nx * 300, u.y + k.ny * 300, 280, '#8fd8ff', 0.3, 6);
    },
    // E Hawkshot: scouting reveal
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, 5000);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      const dur = K.v(u, 2, 'VisionDuration', 'AsheSpiritOfTheHawk');
      K.ring(x, y, 650, '#e0f6ff', dur, 5);
      K.every(dur, () => {
        for (const e of K.foes(u, (e) => K.dist(e, { x, y }) <= 650 && e.kind === 'champ')) e.revealT = Math.max(e.revealT, 0.3);
      });
    },
    // R Enchanted Crystal Arrow: global, stun grows with distance
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      const lo = K.v(u, 3, 'MinStunDuration', 'EnchantedCrystalArrow');
      const hi = K.v(u, 3, 'MaxStunDuration', 'EnchantedCrystalArrow');
      K.proj({
        u, nx: k.nx, ny: k.ny, range: 12000, width: 130, speed: 1600, color: '#6fc8ff', champOnly: true,
        cb: (e, p) => {
          K.dmg(u, e, K.calc(u, 3, 'RMainDamage', 'EnchantedCrystalArrow'), 'magic');
          K.cc(e, { stun: lo + (hi - lo) * Math.min(1, p.traveled / 3500) }); // full stun at 3500 range (not in the data export)
          const rad = K.v(u, 3, 'SlowRadius', 'EnchantedCrystalArrow');
          for (const o of foesIn(u, e.x, e.y, rad, (x) => x !== e)) {
            K.dmg(u, o, K.calc(u, 3, 'RMainDamage', 'EnchantedCrystalArrow') * K.v(u, 3, 'AoECoefficient', 'EnchantedCrystalArrow'), 'magic');
            K.cc(o, { slow: 0.5, slowT: 1.5 });
          }
          K.ring(e.x, e.y, rad, '#6fc8ff', 0.5, 10);
          p.done = true;
        },
      });
    },
  ],
});
