// Blitzcrank, Morgana, Zed, Darius, Ahri.
import type { Unit } from '../main';
import { K, register } from './registry';
import { dropBuff, face, foesIn, foesInCone, foesOnLine, holdBuff, isChamp } from './util';

const now = () => K.time();

// ---------------------------------------------------------------- Blitzcrank
const BP = 'ManaBarrierIcon';
register('blitzcrank', {
  passive: {
    onTaken(u, _src, amt) {
      const st = u.champ!.st;
      if (now() >= (st.mbCd ?? 0) && u.hp - amt < u.maxHp * K.pv(u, 'HealthThreshold', BP)) {
        st.mbCd = now() + K.pv(u, 'Cooldown', BP);
        // shield = share of current mana (the resource-based formula is rebuilt by hand)
        K.shield(u, u.mp * K.pv(u, 'ManaPercent', BP) * K.pv(u, 'ManaRatio', BP), K.pv(u, 'ShieldDuration', BP), '#7fd8ff');
      }
      return amt;
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.eT ?? 0) > now()) {
        // Power Fist: the attack hits for double and pops the target up
        st.eT = 0;
        const total = K.calc(u, 2, 'TotalDamage', 'PowerFist');
        K.dmg(u, t, Math.max(0, total - u.ad), 'phys', 'dot');
        K.cc(t, { air: K.v(u, 2, 'CCDuration', 'PowerFist') });
      }
      // Static Field: attacked enemies are zapped a moment later
      if (u.champ!.ranks[3] > 0 && (t.kind === 'champ' || t.kind === 'minion')) {
        const dmg = K.calc(u, 3, 'PassiveDamage', 'StaticField');
        if (!t.marks.static) {
          K.mark(t, 'static', K.v(u, 3, 'ZapCountdown', 'StaticField'), 1, u);
          K.later(K.v(u, 3, 'ZapCountdown', 'StaticField'), () => {
            if (!t.dead) {
              K.dmg(u, t, dmg, 'magic', 'dot');
              K.ring(t.x, t.y, 80, '#7fd8ff', 0.3, 6);
            }
          });
        }
      }
    },
    tick(u) {
      const st = u.champ!.st;
      const o = st.od as { t0: number } | undefined;
      if (o) {
        const el = now() - o.t0;
        const dur = K.v(u, 1, 'Duration', 'Overdrive');
        if (el >= dur) {
          st.od = undefined;
          dropBuff(u, 'od');
          u.slowAmt = K.v(u, 1, 'MoveSpeedModReduction', 'Overdrive');
          u.slowT = K.v(u, 1, 'SlowDuration', 'Overdrive');
        } else {
          const hi = K.v(u, 1, 'MoveSpeedMod', 'Overdrive');
          const lo = K.v(u, 1, 'MoveSpeedModMin', 'Overdrive');
          const f = Math.min(1, el / K.v(u, 1, 'MoveSpeedModMinTime', 'Overdrive'));
          holdBuff(u, 'od', K.v(u, 1, 'AttackSpeedMod', 'Overdrive'), hi + (lo - hi) * f, 0.3);
        }
      }
    },
  },
  cast: [
    // Q Rocket Grab
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 140, speed: 1800, color: '#e8c88a', champOnly: false,
        cb: (e, p) => {
          if (e.kind === 'monster' || e.kind === 'ward') return;
          K.dmg(u, e, K.calc(u, 0, 'TotalDamage', 'RocketGrab'), 'magic');
          const stop = u.r + e.r + K.v(u, 0, 'LolipopLength', 'RocketGrab');
          const d = K.dist(u, e) || 1;
          K.cc(e, { pull: { x: u.x + ((e.x - u.x) / d) * stop, y: u.y + ((e.y - u.y) / d) * stop }, pullSpeed: 1800, stun: 0.65 });
          p.done = true;
        },
      });
    },
    // W Overdrive
    (k) => {
      k.c.st.od = { t0: now() };
      k.u.slowT = 0;
      K.ring(k.u.x, k.u.y, 90, '#ffe27a', 0.3, 6);
    },
    // E Power Fist
    (k) => {
      k.c.st.eT = now() + 5; // empowered-attack window is not in the data export
      K.ring(k.u.x, k.u.y, 70, '#fff0a8', 0.3, 6);
    },
    // R Static Field
    (k) => {
      const { u } = k;
      const rad = K.v(u, 3, 'ActiveRange', 'StaticField');
      for (const e of foesIn(u, u.x, u.y, rad)) {
        e.shield = 0;
        K.dmg(u, e, K.calc(u, 3, 'ActiveDamage', 'StaticField'), 'magic');
        K.cc(e, { silence: K.v(u, 3, 'SilenceDuration', 'StaticField') });
      }
      K.ring(u.x, u.y, rad, '#7fd8ff', 0.5, 12);
      K.trauma(u, 0.4);
    },
  ],
});

// ---------------------------------------------------------------- Morgana
register('morgana', {
  passive: {
    onDealt(u, t, dmg) {
      if (t.kind === 'champ') K.heal(u, (dmg * K.pv(u, 'HealPercent', 'MorganaPassive')) / 100);
    },
    tick(u) {
      const st = u.champ!.st;
      const r = st.chains as { t: number } | undefined;
      if (r) holdBuff(u, 'r', 0, K.v(u, 3, 'HastePercent', 'MorganaR') / 100, 0.3);
      else dropBuff(u, 'r');
    },
  },
  cast: [
    // Q Dark Binding
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 140, speed: 1200, color: '#c89bff',
        cb: (e, p) => {
          K.dmg(u, e, K.calc(u, 0, 'TotalDamage', 'MorganaQ'), 'magic');
          K.cc(e, { root: K.v(u, 0, 'RootDuration', 'MorganaQ') });
          p.done = true;
        },
      });
    },
    // W Tormented Shadow: damage grows as targets lose health
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      const dur = K.v(u, 1, 'WDuration', 'MorganaW');
      const tick = K.v(u, 1, 'TickRate', 'MorganaW');
      const amp = K.v(u, 1, 'MissingHealthAmpPercent', 'MorganaW');
      const lo = K.calc(u, 1, 'TotalMinDamage', 'MorganaW');
      const hi = K.calc(u, 1, 'TotalMaxDamage', 'MorganaW');
      let acc = 0;
      K.ring(x, y, 275, '#8a4bd8', dur, 8);
      K.every(dur, (dt) => {
        acc += dt;
        if (acc < tick) return;
        acc -= tick;
        for (const e of foesIn(u, x, y, 275)) {
          const miss = 1 - e.hp / e.maxHp;
          K.dmg(u, e, lo + (hi - lo) * Math.min(1, miss * amp), 'magic', 'dot');
        }
      });
    },
    // E Black Shield: absorbs damage and breaks crowd control
    (k) => {
      const { u } = k;
      const tgt = K.pickAlly(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 260, true) ?? u;
      const dur = K.v(u, 2, 'ShieldDuration', 'MorganaE');
      K.shield(tgt, K.calc(u, 2, 'TotalShieldStrength', 'MorganaE'), dur, '#d8c0ff');
      tgt.stunT = tgt.rootT = tgt.slowT = tgt.silenceT = tgt.charmT = 0;
      K.every(dur, () => {
        if (tgt.shield <= 0 || tgt.dead) return false;
        tgt.stunT = tgt.rootT = tgt.silenceT = tgt.charmT = 0;
      });
    },
    // R Soul Shackles
    (k) => {
      const { u, c } = k;
      const rad = k.a.ranges![k.rank - 1];
      const chain = K.v(u, 3, 'ChainDuration', 'MorganaR');
      const hit: Unit[] = [];
      for (const e of foesIn(u, u.x, u.y, rad, isChamp)) {
        K.dmg(u, e, K.calc(u, 3, 'TotalDamage', 'MorganaR'), 'magic');
        K.cc(e, { slow: K.v(u, 3, 'SlowPercent', 'MorganaR') / 100, slowT: chain });
        hit.push(e);
      }
      c.st.chains = { t: chain };
      K.ring(u.x, u.y, rad, '#7a3bd8', chain, 10);
      K.later(chain, () => {
        c.st.chains = undefined;
        for (const e of hit) if (!e.dead && K.dist(u, e) <= rad + 150) K.cc(e, { stun: K.v(u, 3, 'StunDuration', 'MorganaR') });
      });
    },
  ],
});

// ---------------------------------------------------------------- Zed
interface Shadow {
  x: number;
  y: number;
  t: number;
}
const shadowsOf = (u: Unit): Shadow[] => ((u.champ!.st.shadows as Shadow[] | undefined) ?? []).filter((s) => s.t > now());
register('zed', {
  passive: {
    onAttack(u, t) {
      if (t.kind !== 'champ' && t.kind !== 'minion' && t.kind !== 'monster') return;
      if (t.hp / t.maxHp < K.pv(u, 'CurrentHealthThreshold', 'ZedPassive') && !t.marks.zedP) {
        K.mark(t, 'zedP', K.pv(u, 'PerUnitCD', 'ZedPassive'), 1, u);
        K.dmg(u, t, K.pcalc(u, 'TotalDamage', 'ZedPassive'), 'magic', 'dot');
      }
    },
    onDealt(u, t, dmg, _ty, from) {
      const st = u.champ!.st;
      if (from !== 'dot' && st.rMark === t) st.rAcc = (st.rAcc ?? 0) + dmg; // Death Mark records damage
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.shadows) st.shadows = (st.shadows as Shadow[]).filter((s) => s.t > now());
    },
  },
  cast: [
    // Q Razor Shuriken: Zed and each shadow throw one
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      const origins = [{ x: u.x, y: u.y }, ...shadowsOf(u)];
      const range = k.a.ranges![k.rank - 1];
      const seen = new Map<Unit, number>();
      let restored = false;
      for (const o of origins)
        K.proj({
          u, nx: k.nx, ny: k.ny, from: { x: o.x, y: o.y }, range, width: 100, speed: 1700, color: '#ff5a5a', pierce: true,
          cb: (e) => {
            const n = seen.get(e) ?? 0;
            seen.set(e, n + 1);
            const hit = n === 0 ? K.calc(u, 0, 'TotalDamage', 'ZedQ') : K.calc(u, 0, 'PassThroughDamage', 'ZedQ');
            K.dmg(u, e, n === 0 ? hit : hit * 0.5, 'phys');
            if (n >= 1 && !restored) {
              restored = true;
              u.mp = Math.min(u.maxMp, u.mp + K.v(u, 1, 'EnergyRestoreDoubleHit', 'ZedW'));
            }
          },
        });
    },
    // W Living Shadow: send a shadow, recast to swap
    (k) => {
      const { u, c } = k;
      const sh = shadowsOf(u).find((s) => (s as any).w);
      if (k.recast && sh) {
        const ox = u.x;
        const oy = u.y;
        K.blink(u, sh.x, sh.y);
        sh.x = ox;
        sh.y = oy;
        c.rc[1] = 0;
        return;
      }
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      const s: Shadow & { w?: boolean } = { x: u.x + k.nx * r, y: u.y + k.ny * r, t: now() + K.v(u, 1, 'ShadowDuration', 'ZedW'), w: true };
      c.st.shadows = [...shadowsOf(u).filter((x) => !(x as any).w), s];
      K.ring(s.x, s.y, 60, '#7a2a2a', K.v(u, 1, 'ShadowDuration', 'ZedW'), 6);
      face(u, k.nx, k.ny);
      return { recast: K.v(u, 1, 'SwapTimeLimit', 'ZedW'), keepCd: true };
    },
    // E Shadow Slash
    (k) => {
      const { u } = k;
      const lo = K.calc(u, 2, 'TotalDamage', 'ZedE');
      const hit = new Set<Unit>();
      const slash = (x: number, y: number, r: number, bonus: boolean) => {
        for (const e of foesIn(u, x, y, r)) {
          if (!hit.has(e)) {
            hit.add(e);
            K.dmg(u, e, lo, 'phys');
          }
          const slow = Math.abs(K.v(u, 2, bonus ? 'MoveSpeedModBonus' : 'MoveSpeedMod', 'ZedE'));
          K.cc(e, { slow, slowT: K.v(u, 2, 'SlowDuration', 'ZedE') });
        }
        K.ring(x, y, r, '#ff6a6a', 0.3, 6);
      };
      slash(u.x, u.y, K.v(u, 2, 'ZedRadius', 'ZedE'), false);
      for (const s of shadowsOf(u)) slash(s.x, s.y, K.v(u, 2, 'ShadowRadius', 'ZedE'), true);
    },
    // R Death Mark
    (k) => {
      const { u, c } = k;
      if (k.recast) {
        const sh = shadowsOf(u).find((s) => (s as any).r);
        if (sh) {
          const ox = u.x;
          const oy = u.y;
          K.blink(u, sh.x, sh.y);
          sh.x = ox;
          sh.y = oy;
        }
        c.rc[3] = 0;
        return;
      }
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 300, isChamp) ?? K.nearestFoe(u, k.a.ranges![k.rank - 1], isChamp);
      if (!t) return false;
      const ox = u.x;
      const oy = u.y;
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const dl = Math.hypot(dx, dy) || 1;
      face(u, dx, dy);
      u.untargT = 0.6;
      K.dash(u, t.x - (dx / dl) * (t.r + 50), t.y - (dy / dl) * (t.r + 50), 2400, {
        end: () => {
          const s: Shadow & { r?: boolean } = { x: ox, y: oy, t: now() + K.v(u, 3, 'RCanSwapBuffDuration', 'ZedR'), r: true };
          c.st.shadows = [...shadowsOf(u).filter((x) => !(x as any).r), s];
          c.st.rMark = t;
          c.st.rAcc = 0;
          const dur = K.v(u, 3, 'RDeathMarkDuration', 'ZedR');
          K.mark(t, 'zedR', dur, 1, u);
          K.ring(t.x, t.y, 70, '#ff2a2a', dur, 8);
          K.later(dur, () => {
            if (!t.dead) K.dmg(u, t, K.calc(u, 3, 'RCalculatedDamage', 'ZedR') + (c.st.rAcc ?? 0) * K.v(u, 3, 'RDamageAmp', 'ZedR'), 'phys', 'dot');
            c.st.rMark = null;
          });
        },
      });
      return { recast: K.v(u, 3, 'RCanSwapBuffDuration', 'ZedR'), keepCd: true };
    },
  ],
});

// ---------------------------------------------------------------- Darius
const HEMO = 'DariusHemoMarker';
function bleed(u: Unit, t: Unit) {
  if (t.kind !== 'champ' && t.kind !== 'minion' && t.kind !== 'monster') return;
  const dur = K.pv(u, 'BleedDuration', HEMO);
  const n = Math.min(K.pv(u, 'MaxStacks', HEMO), (K.markOf(t, 'hemo')?.v ?? 0) + 1);
  K.mark(t, 'hemo', dur, n, u);
  K.dot(u, t, (K.pcalc(u, 'BleedDamagePerStack', HEMO) * n * (t.kind === 'monster' ? K.pv(u, 'MonsterMod', HEMO) : 1)) / dur, dur, 'phys', 'hemo');
  if (n >= K.pv(u, 'MaxStacks', HEMO) && t.kind === 'champ') {
    u.champ!.st.nmT = now() + dur; // Noxian Might
    K.recalc(u);
  }
}
register('darius', {
  passive: {
    recalc(u) {
      if ((u.champ!.st.nmT ?? 0) > now()) u.ad += K.pcalc(u, 'NoxianMightBonusAD', HEMO);
    },
    armorPen(u) {
      return u.champ!.ranks[2] > 0 ? K.v(u, 2, 'PassivePercentArmorPen', 'DariusAxeGrabCone') / 100 : 0;
    },
    onDealt(u, t, _d, _ty, from) {
      if (from !== 'dot') bleed(u, t);
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.wT ?? 0) > now()) {
        st.wT = 0;
        K.dmg(u, t, K.calc(u, 1, 'EmpoweredAttackDamage', 'DariusNoxianTacticsONH') - u.ad, 'phys', 'dot');
        K.cc(t, { slow: K.v(u, 1, 'SlowPercent', 'DariusNoxianTacticsONH') / 100, slowT: K.v(u, 1, 'SlowDuration', 'DariusNoxianTacticsONH') });
        st.wCheck = t;
        K.later(0.1, () => {
          if (t.dead) u.champ!.cds[1] *= 1 - K.v(u, 1, 'PercentCDRefund', 'DariusNoxianTacticsONH') / 100;
        });
      }
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.nmT && now() > st.nmT) {
        st.nmT = 0;
        K.recalc(u);
      }
    },
  },
  cast: [
    // Q Decimate: the blade hurts, the handle barely
    (k) => {
      const { u } = k;
      const outer = 425;
      const inner = 250; // inner circle radius is not in the data export
      K.teleCircle(u.x, u.y, outer, '#ff6a4a', 0.5, () => {
        let healed = 0;
        for (const e of foesIn(u, u.x, u.y, outer)) {
          const inHandle = K.dist(e, u) <= inner;
          K.dmg(u, e, K.calc(u, 0, inHandle ? 'HandleDamage' : 'BladeDamage', 'DariusCleave'), 'phys');
          if (!inHandle && e.kind === 'champ' && healed < K.v(u, 0, 'MissingHealPercent', 'DariusCleave')) {
            healed += K.v(u, 0, 'MissingHealthHeal', 'DariusCleave');
            K.heal(u, ((u.maxHp - u.hp) * K.v(u, 0, 'MissingHealthHeal', 'DariusCleave')) / 100);
          }
        }
        K.ring(u.x, u.y, outer, '#ff6a4a', 0.35, 10);
      });
    },
    // W Crippling Strike
    (k) => {
      k.c.st.wT = now() + 5; // empowered-attack window is not in the data export
      K.ring(k.u.x, k.u.y, 70, '#ff8a6a', 0.3, 6);
    },
    // E Apprehend: a hook that drags enemies in front of him
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      for (const e of foesInCone(u, k.nx, k.ny, k.a.ranges![k.rank - 1], 0.7)) {
        K.dmg(u, e, 0, 'phys'); // lets passives see the hit
        K.cc(e, { pull: { x: u.x + k.nx * (u.r + e.r + 40), y: u.y + k.ny * (u.r + e.r + 40) }, pullSpeed: 1600, slow: K.v(u, 2, 'SlowPercent', 'DariusAxeGrabCone') / 100, slowT: K.v(u, 2, 'SlowDuration', 'DariusAxeGrabCone') });
      }
      K.ring(u.x + k.nx * 250, u.y + k.ny * 250, 260, '#d8c0a0', 0.35, 8);
    },
    // R Noxian Guillotine
    (k) => {
      const { u, c, rank } = k;
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![rank - 1], 300, isChamp) ?? K.nearestFoe(u, k.a.ranges![rank - 1], isChamp);
      if (!t) return false;
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const dl = Math.hypot(dx, dy) || 1;
      face(u, dx, dy);
      K.dash(u, t.x - (dx / dl) * (t.r + 40), t.y - (dy / dl) * (t.r + 40), 2000, {
        end: () => {
          const stacks = K.markOf(t, 'hemo')?.v ?? 0;
          const dmg = K.pcalc(u, 'Damage', 'DariusExecute', rank) * (1 + K.pv(u, 'RDamagePercentPerHemoStack', 'DariusExecute', rank) * stacks);
          K.dmg(u, t, dmg, 'true');
          K.trauma(t, 0.5);
          if (t.dead) c.cds[3] = 0; // a killing blow refreshes it
        },
      });
    },
  ],
});

// ---------------------------------------------------------------- Ahri
register('ahri', {
  passive: {
    onLastHit(u) {
      const st = u.champ!.st;
      st.farm = (st.farm ?? 0) + 1;
      if (st.farm >= K.pv(u, 'MaxStacks', 'AhriPassive')) {
        st.farm = 0;
        K.heal(u, K.pcalc(u, 'MinionHeal', 'AhriPassive'));
      }
    },
    onKill(u, victim) {
      if (victim.kind === 'champ') {
        K.heal(u, K.pcalc(u, 'ChampionHeal', 'AhriPassive'));
        // takedowns during Spirit Rush give an extra cast
        const st = u.champ!.st;
        if (u.champ!.rc[3] > 0 && st.rCasts > 0) st.rCasts = Math.max(0, st.rCasts - K.v(u, 3, 'RResetCasts', 'AhriR'));
      }
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.wBuff && now() < st.wBuff.end) {
        const f = (st.wBuff.end - now()) / K.v(u, 1, 'MovementSpeedDuration', 'AhriW');
        holdBuff(u, 'w', 0, K.v(u, 1, 'MovementSpeed', 'AhriW') * f, 0.3);
      } else dropBuff(u, 'w');
    },
  },
  cast: [
    // Q Orb of Deception: out as magic, back as true damage
    (k) => {
      const { u } = k;
      const dmg = K.calc(u, 0, 'TotalDamage', 'AhriQ');
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 100, speed: 2500, color: '#ffb8e0', pierce: true,
        cb: (e) => K.dmg(u, e, dmg, 'magic'),
        onEnd: (p) => {
          const bx = u.x - p.x;
          const by = u.y - p.y;
          const len = Math.hypot(bx, by) || 1;
          K.proj({
            u, nx: bx, ny: by, from: { x: p.x, y: p.y }, range: len, width: 100, speed: 2500, color: '#ffb8e0', pierce: true,
            cb: (e) => K.dmg(u, e, dmg, 'true'),
          });
        },
      });
    },
    // W Fox-Fire: three flames seek nearby enemies
    (k) => {
      const { u, c } = k;
      c.st.wBuff = { end: now() + K.v(u, 1, 'MovementSpeedDuration', 'AhriW') };
      const dmg1 = K.calc(u, 1, 'SingleFireDamage', 'AhriW');
      const dmgN = K.calc(u, 1, 'MultiFireDamage', 'AhriW');
      const range = K.v(u, 1, 'AcquisitionRange', 'AhriW');
      const used = new Map<Unit, number>();
      for (let i = 0; i < 3; i++)
        K.later(K.v(u, 1, 'InitialDelay', 'AhriW') + i * 0.08 + K.v(u, 1, 'SecondaryDelay', 'AhriW'), () => {
          const pool = K.foes(u, (e) => K.dist(u, e) <= range + e.r);
          const t = pool.filter(isChamp).concat(pool.filter((e) => !isChamp(e))).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0];
          if (!t) return;
          const n = used.get(t) ?? 0;
          used.set(t, n + 1);
          K.dmg(u, t, n === 0 ? dmg1 : dmgN, 'magic');
          K.burst(t.x, t.y, 8, { kind: 'ember', color: '#ff9ac8', speed: 300, life: 0.3, size: 4, drag: 5 });
        });
      K.ring(u.x, u.y, 150, '#ff9ac8', 0.4, 6);
    },
    // E Charm
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 120, speed: 1550, color: '#ff6ab0',
        cb: (e, p) => {
          K.dmg(u, e, K.calc(u, 2, 'TotalDamage', 'AhriE'), 'magic');
          const dur = K.v(u, 2, 'CharmDuration', 'AhriE');
          K.cc(e, { charm: dur, src: u, slow: Math.abs(K.v(u, 2, 'SlowPercent', 'AhriE')), slowT: dur });
          p.done = true;
        },
      });
    },
    // R Spirit Rush: up to three dashes
    (k) => {
      const { u, c } = k;
      const max = K.v(u, 3, 'RMaxCasts', 'AhriR');
      if (!k.recast) {
        c.st.rCasts = 0;
        c.st.rGap = 0;
      } else if (now() < c.st.rGap) return false; // dashes are RDashCooldown apart
      const dist = K.v(u, 3, 'RDashDistance', 'AhriR');
      face(u, k.nx, k.ny);
      c.st.rCasts++;
      c.st.rGap = now() + K.v(u, 3, 'RDashCooldown', 'AhriR');
      const per = K.calc(u, 3, 'RCalculatedDamage', 'AhriR');
      K.dash(u, u.x + k.nx * dist, u.y + k.ny * dist, K.v(u, 3, 'RBaseDashSpeed', 'AhriR'), {
        end: () => {
          const pool = K.foes(u, (e) => K.dist(u, e) <= K.v(u, 3, 'RAcquisitionRange', 'AhriR') + e.r);
          const picks = pool.filter(isChamp).sort((a, b) => K.dist(u, a) - K.dist(u, b)).concat(pool.filter((e) => !isChamp(e)).sort((a, b) => K.dist(u, a) - K.dist(u, b))).slice(0, K.v(u, 3, 'RMaxTargetsPerCast', 'AhriR'));
          for (const e of picks) K.dmg(u, e, per, 'magic');
          K.ring(u.x, u.y, 200, '#ffc0e8', 0.4, 8);
        },
      });
      if (c.st.rCasts >= max) return; // used them all: cooldown starts
      return { recast: K.v(u, 3, 'RRecastWindow', 'AhriR'), keepCd: false };
    },
  ],
});
