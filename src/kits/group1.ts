// Master Yi, Twitch, Wukong, Yuumi, Naafiri. Numbers are read from the reference data at cast time.
import type { Unit } from '../main';
import { K, register } from './registry';
import { dropBuff, face, foesIn, foesOnLine, holdBuff, isChamp, isMonster } from './util';

const now = () => K.time();

// ---------------------------------------------------------------- Master Yi
register('masteryi', {
  passive: {
    onAttack(u, t) {
      const st = u.champ!.st;
      if (now() - (st.dsT ?? -99) > K.pv(u, 'StackDuration', 'MasterYiPassive')) st.ds = 0;
      st.dsT = now();
      st.ds = (st.ds ?? 0) + 1;
      K.refundCd(u, 0, K.v(u, 0, 'BasicAttackCDR', 'AlphaStrike')); // basic attacks reduce Alpha Strike's cooldown
      const wuju = () => {
        if ((st.wujuT ?? 0) > now()) K.dmg(u, t, K.calc(u, 2, 'TotalDamage', 'WujuStyle'), 'true', 'attack');
      };
      wuju();
      if (st.ds >= K.pv(u, 'AttackCount', 'MasterYiPassive')) {
        st.ds = 0;
        // Double Strike: the attack lands a second time
        K.dmg(u, t, K.pcalc(u, 'TotalDamage', 'MasterYiPassive') + u.ad * 0.5, 'phys', 'attack');
        wuju();
      }
    },
    onKill(u) {
      const st = u.champ!.st;
      if ((st.rT ?? 0) > 0) st.rT += K.v(u, 3, 'RKillAssistExtension', 'Highlander');
      if (K.rankOf(u, 3) > 0 && u.champ!.ranks[3] > 0) {
        // Highlander passive: other abilities lose 70% of their remaining cooldown
        const keep = 1 - K.v(u, 3, 'RCooldownRefund', 'Highlander');
        for (let i = 0; i < 3; i++) u.champ!.cds[i] *= keep;
      }
    },
    tick(u, dt) {
      const c = u.champ!;
      const st = c.st;
      // Highlander: move/attack speed, slow immunity, duration pauses while meditating
      if ((st.rT ?? 0) > 0) {
        if (!st.med) st.rT -= dt;
        u.unslow = 0.2;
        u.slowT = 0;
        holdBuff(u, 'r', K.v(u, 3, 'RASBonus', 'Highlander') / 100, K.v(u, 3, 'RMSBonus', 'Highlander') / 100, 0.3);
      } else dropBuff(u, 'r');
      // Meditate: a channel with damage reduction, healing and Double Strike stacks
      const m = st.med as { t: number; healed: number; sec: number } | undefined;
      if (m) {
        if (u.dead || u.stunT > 0 || u.silenceT > 0 || u.airT > 0) return endMeditate(u);
        const dur = K.v(u, 1, 'HealDuration', 'Meditate');
        m.t -= dt;
        u.rootT = Math.max(u.rootT, 0.1);
        c.order = null;
        u.drPct = m.t > dur - K.v(u, 1, 'InitialExtraDRDuration', 'Meditate') ? K.calc(u, 1, 'InitialDR', 'Meditate') : K.v(u, 1, 'DamageReduction', 'Meditate');
        u.drT = 0.2;
        const total = K.calc(u, 1, 'TotalHeal', 'Meditate');
        K.heal(u, (total / dur) * dt);
        u.mp -= K.v(u, 1, 'PercentManaCostPerSecond', 'Meditate') * u.maxMp * dt;
        m.sec += dt;
        if (m.sec >= 1) {
          m.sec -= 1;
          st.ds = Math.min(K.pv(u, 'AttackCount', 'MasterYiPassive'), (st.ds ?? 0) + 1);
          st.dsT = now();
        }
        if (m.t <= 0 || u.mp <= 0) endMeditate(u);
      }
    },
  },
  cast: [
    // Q Alpha Strike
    (k) => {
      const { u } = k;
      const first = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 260);
      if (!first) return false;
      const bounces = K.v(u, 0, 'AlphaStrikeBounces', 'AlphaStrike');
      const base = K.calc(u, 0, 'TotalDamage', 'AlphaStrike');
      const sub = K.v(u, 0, 'SubsequentHitMultiplier', 'AlphaStrike');
      const pool = [first, ...K.foes(u, (e) => e !== first && K.dist(e, first) <= 300).sort((a, b) => K.dist(a, first) - K.dist(b, first))];
      const seq: Unit[] = [];
      for (let i = 0; i < bounces; i++) seq.push(pool[i % pool.length]);
      const gap = 0.12;
      u.untargT = bounces * gap + 0.1;
      const struck = new Set<Unit>();
      seq.forEach((e, i) =>
        K.later(i * gap, () => {
          if (u.dead || e.dead) return;
          const again = struck.has(e);
          struck.add(e);
          let dmg = again ? base * sub : base;
          if (isMonster(e)) dmg += K.v(u, 0, 'BonusMonsterDamage', 'AlphaStrike');
          K.dmg(u, e, dmg, 'phys');
          const dx = e.x - u.x || 1;
          const dy = e.y - u.y || 0;
          const dl = Math.hypot(dx, dy) || 1;
          K.blink(u, e.x - (dx / dl) * 70, e.y - (dy / dl) * 70);
          K.burst(e.x, e.y, 8, { kind: 'ember', color: '#ffe08a', speed: 360, life: 0.3, size: 4, drag: 5 });
        }),
      );
      face(u, k.nx, k.ny);
    },
    // W Meditate (cast again to stop)
    (k) => {
      const { u, c } = k;
      if (k.recast) return void endMeditate(u);
      const dur = K.v(u, 1, 'HealDuration', 'Meditate');
      c.st.med = { t: dur, healed: 0, sec: 0 };
      return { recast: dur };
    },
    // E Wuju Style
    (k) => {
      k.c.st.wujuT = now() + K.v(k.u, 2, 'Duration', 'WujuStyle');
      K.ring(k.u.x, k.u.y, 80, '#ffb347', 0.4, 6);
    },
    // R Highlander
    (k) => {
      const { u, c } = k;
      c.st.rT = K.v(u, 3, 'RDuration', 'Highlander');
      u.slowT = 0;
      K.ring(u.x, u.y, 120, '#ff6a3d', 0.5, 8);
    },
  ],
});
function endMeditate(u: Unit) {
  const c = u.champ!;
  if (!c.st.med) return;
  c.st.med = null;
  u.drPct = K.v(u, 1, 'DamageReduction', 'Meditate');
  u.drT = K.v(u, 1, 'DRLinger', 'Meditate');
  c.rc[1] = 0;
  c.cds[1] = K.cdOf(u, 1);
}

// ---------------------------------------------------------------- Twitch
const VENOM = 'TwitchDeadlyVenomMarker';
function venom(u: Unit, t: Unit, add = 1) {
  const max = K.pv(u, 'MaxStacks', VENOM);
  const dur = K.pv(u, 'Duration', VENOM);
  const stacks = Math.min(max, (K.markOf(t, 'venom')?.v ?? 0) + add);
  K.mark(t, 'venom', dur, stacks, u);
  K.dot(u, t, K.pcalc(u, 'DamagePerSecond', VENOM) * stacks, dur, 'true', 'venom');
}
register('twitch', {
  passive: {
    onAttack(u, t) {
      if (t.kind === 'champ' || t.kind === 'minion' || t.kind === 'monster') venom(u, t);
      // Spray and Pray: bolts pierce, losing 10% per target down to 60%
      if ((u.champ!.st.rT ?? 0) > now()) {
        const reach = u.range + u.rangeBonus + u.r;
        const dx = t.x - u.x;
        const dy = t.y - u.y;
        const dl = Math.hypot(dx, dy) || 1;
        const fall = K.v(u, 3, 'FallOffDamage', 'TwitchFullAutomatic');
        const min = K.v(u, 3, 'MinimumFallOffDamage', 'TwitchFullAutomatic');
        foesOnLine(u, u.x, u.y, u.x + (dx / dl) * reach, u.y + (dy / dl) * reach, 70, (e) => e !== t).forEach((e, i) => {
          K.dmg(u, e, u.ad * Math.max(min, 1 - fall * (i + 1)), 'phys', 'dot');
          venom(u, e);
        });
      }
    },
    onKill(u, victim) {
      // an enemy champion with Deadly Venom died: Ambush is ready again
      if (victim.marks.venom) u.champ!.cds[0] = 0;
    },
    onCast(u, slot) {
      if (slot !== 0) u.champ!.st.qPending = 0; // casting anything else cancels the fade-out
    },
    recalc(u) {
      u.ad += u.champ!.st.rAd ?? 0;
    },
    tick(u) {
      const st = u.champ!.st;
      const hidden = u.stealthT > 0;
      if (st.wasHidden && !hidden) {
        // leaving camouflage: attack speed burst
        K.addBuff(u, K.v(u, 0, 'AttackSpeedMod', 'TwitchHideInShadows'), 0, K.v(u, 0, 'AttackSpeedDuration', 'TwitchHideInShadows'));
        dropBuff(u, 'q');
      }
      st.wasHidden = hidden;
      if (hidden) holdBuff(u, 'q', 0, K.v(u, 0, 'MoveSpeedMod', 'TwitchHideInShadows') / 100, 0.3);
      if ((st.rT ?? 0) > 0) {
        if (now() > st.rT) {
          st.rT = 0;
          st.rAd = 0;
          u.rangeBonus = 0;
          K.recalc(u);
        }
      }
    },
  },
  cast: [
    // Q Ambush: fade for a moment, then camouflage
    (k) => {
      const { u, c } = k;
      c.st.qPending = 1;
      const fade = K.v(u, 0, 'MaxFadeTime', 'TwitchHideInShadows');
      K.later(fade, () => {
        if (c.st.qPending && !u.dead) {
          u.stealthT = K.v(u, 0, 'StealthDuration', 'TwitchHideInShadows');
          c.st.qPending = 0;
        }
      });
    },
    // W Venom Cask
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1];
      const r = Math.min(k.d, range);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      const rad = K.v(u, 1, 'AoERadius', 'TwitchVenomCask');
      const travel = r / 1750;
      face(u, k.nx, k.ny);
      K.teleCircle(x, y, rad, '#7ac520', travel, () => {
        const slow = K.calc(u, 1, 'TotalSlowAmount', 'TwitchVenomCask') / 100;
        for (const e of foesIn(u, x, y, rad)) {
          K.cc(e, { slow, slowT: K.v(u, 1, 'Duration', 'TwitchVenomCask') });
          venom(u, e);
        }
        K.ring(x, y, rad, '#7ac520', 0.5, 8);
        K.burst(x, y, 16, { kind: 'ember', color: '#9acd32', speed: rad * 2, life: 0.5, size: 5, drag: 5 });
      });
    },
    // E Contaminate: every poisoned enemy in range takes damage per stack
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1];
      const base = K.v(u, 2, 'BaseDamage', 'TwitchExpunge');
      for (const e of K.foes(u, (e) => !!e.marks.venom && K.dist(u, e) <= range + e.r)) {
        const n = e.marks.venom.v;
        K.dmg(u, e, base + n * K.calc(u, 2, 'PhysicalDamagePerStack', 'TwitchExpunge'), 'phys');
        K.dmg(u, e, n * K.calc(u, 2, 'MagicDamagePerStack', 'TwitchExpunge'), 'magic');
        K.burst(e.x, e.y, 12, { kind: 'ember', color: '#b6e04a', speed: 320, life: 0.4, size: 4, drag: 5 });
      }
      K.ring(u.x, u.y, 140, '#b6e04a', 0.35, 6);
    },
    // R Spray and Pray
    (k) => {
      const { u, c } = k;
      const dur = K.v(u, 3, 'Duration', 'TwitchFullAutomatic');
      c.st.rT = now() + dur;
      c.st.rAd = K.v(u, 3, 'BonusAD', 'TwitchFullAutomatic');
      u.rangeBonus = K.v(u, 3, 'BonusRange', 'TwitchFullAutomatic');
      K.recalc(u);
      K.ring(u.x, u.y, 110, '#c8f060', 0.5, 8);
    },
  ],
});

// ---------------------------------------------------------------- Wukong
const wukongArmor = (u: Unit) => K.recalc(u);
register('monkeyking', {
  passive: {
    recalc(u) {
      const st = u.champ!.st;
      if (st.stacks > 0) u.armor += K.pcalc(u, 'BonusArmor', 'MonkeyKingPassive') * st.stacks;
    },
    onDealt(u, t, _d, _ty, from) {
      if (t.kind === 'champ' || t.kind === 'monster') u.champ!.st.fightT = now();
      void from;
    },
    onTaken(u, src, amt) {
      if (src.kind === 'champ' || src.kind === 'monster') u.champ!.st.fightT = now();
      return amt;
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.qT ?? 0) > now()) {
        // Crushing Blow: bonus damage and armor shred on the empowered attack
        K.dmg(u, t, K.calc(u, 0, 'TotalDamage', 'MonkeyKingDoubleAttack'), 'phys', 'dot');
        t.shredPct = K.v(u, 0, 'ArmorShredPercent', 'MonkeyKingDoubleAttack');
        t.shredT = K.v(u, 0, 'ShredDuration', 'MonkeyKingDoubleAttack');
        st.qT = 0;
        u.rangeBonus = 0;
      }
    },
    tick(u, dt) {
      const c = u.champ!;
      const st = c.st;
      const combat = now() - (st.fightT ?? -99) < K.pv(u, 'CombatDuration', 'MonkeyKingPassive');
      st.stackAcc = (st.stackAcc ?? 0) + dt;
      if (combat) {
        if (st.stackAcc >= 1) {
          st.stackAcc = 0;
          const n = Math.min(K.pv(u, 'MaxStacks', 'MonkeyKingPassive'), (st.stacks ?? 0) + 1);
          if (n !== st.stacks) {
            st.stacks = n;
            wukongArmor(u);
          }
        }
        st.decay = 0;
      } else if ((st.stacks ?? 0) > 0) {
        st.decay = (st.decay ?? 0) + dt;
        if (st.decay >= K.pv(u, 'StackDuration', 'MonkeyKingPassive')) {
          st.decay = 0;
          st.stacks--;
          wukongArmor(u);
        }
      }
      if (st.stacks > 0) K.heal(u, (K.pv(u, 'HealthPercentPer5', 'MonkeyKingPassive') * st.stacks * u.maxHp * dt) / 5);
      if ((st.qT ?? 0) > 0 && now() > st.qT) {
        st.qT = 0;
        u.rangeBonus = 0;
      }
      // Cyclone: spin damage ticks
      const r = st.spin as { t: number; acc: number; hit: Set<Unit> } | undefined;
      if (r) {
        r.t -= dt;
        r.acc += dt;
        const per = K.v(u, 3, 'SecondsPerTick', 'MonkeyKingSpinToWin');
        if (u.dead || u.stunT > 0) st.spin = undefined;
        else if (r.acc >= per) {
          r.acc -= per;
          const dps = K.calc(u, 3, 'DamagePerSecondTotal', 'MonkeyKingSpinToWin');
          const pct = K.v(u, 3, 'BasePercentMaxHPDmgPerSec', 'MonkeyKingSpinToWin');
          for (const e of foesIn(u, u.x, u.y, 315)) {
            const cap = K.calc(u, 3, 'MonsterCap', 'MonkeyKingSpinToWin');
            const dmg = (dps + pct * e.maxHp) * per;
            K.dmg(u, e, isMonster(e) ? Math.min(cap * per, dmg) : dmg, 'phys');
            if (!r.hit.has(e)) {
              r.hit.add(e);
              K.cc(e, { air: K.v(u, 3, 'KnockupDuration', 'MonkeyKingSpinToWin') });
            }
          }
          K.ring(u.x, u.y, 315, '#ffc94a', 0.25, 6);
        }
        if (r.t <= 0) endCyclone(u);
      }
    },
  },
  cast: [
    // Q Crushing Blow
    (k) => {
      const { u, c } = k;
      c.st.qT = now() + K.v(u, 0, 'BuffDuration', 'MonkeyKingDoubleAttack');
      u.rangeBonus = K.v(u, 0, 'AttackRangeBonus', 'MonkeyKingDoubleAttack');
      K.ring(u.x, u.y, 80, '#ffd27a', 0.3, 6);
    },
    // W Warrior Trickster: vanish, dash, leave a clone
    (k) => {
      const { u } = k;
      const clamp = K.v(u, 1, 'RangeClamp', 'MonkeyKingDecoy');
      const min = K.v(u, 1, 'MinRange', 'MonkeyKingDecoy');
      const dist = Math.max(min, Math.min(k.d, clamp));
      const x0 = u.x;
      const y0 = u.y;
      K.dash(u, u.x + k.nx * dist, u.y + k.ny * dist, K.v(u, 1, 'DashSpeed', 'MonkeyKingDecoy'));
      u.stealthT = K.v(u, 1, 'StealthDuration', 'MonkeyKingDecoy');
      const mod = K.v(u, 1, 'CloneDamageMod', 'MonkeyKingDecoy');
      K.pet(u, { name: 'Wukong', x: x0, y: y0, hp: 1, ad: u.ad * mod, as: u.as, range: 175, ms: u.ms, life: K.v(u, 1, 'CloneDuration', 'MonkeyKingDecoy'), r: 28 });
    },
    // E Nimbus Strike
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1];
      const t = K.pick(u, k.tx, k.ty, range, 260);
      if (!t) return false;
      const reach = K.v(u, 2, 'EndPointOffsetDistance', 'MonkeyKingNimbus');
      const dmg = K.calc(u, 2, 'TotalDamage', 'MonkeyKingNimbus');
      const hitR = K.v(u, 2, 'ExtraTargetRange', 'MonkeyKingNimbus');
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const dl = Math.hypot(dx, dy) || 1;
      face(u, dx, dy);
      K.dash(u, t.x - (dx / dl) * (t.r + reach), t.y - (dy / dl) * (t.r + reach), 2200, {
        end: () => {
          K.dmg(u, t, isMonster(t) ? K.calc(u, 2, 'TotalDamageMonsters', 'MonkeyKingNimbus') : dmg, 'magic');
          const extra = K.foes(u, (e) => e !== t && K.dist(e, t) <= hitR).sort((a, b) => K.dist(a, t) - K.dist(b, t)).slice(0, K.v(u, 2, 'ExtraTargets', 'MonkeyKingNimbus'));
          for (const e of extra) {
            K.dmg(u, e, dmg, 'magic');
            K.burst(e.x, e.y, 8, { kind: 'ember', color: '#fff0a8', speed: 300, life: 0.3, size: 4, drag: 5 });
          }
          K.addBuff(u, K.v(u, 2, 'AttackSpeed', 'MonkeyKingNimbus'), 0, K.v(u, 2, 'AttackSpeedDuration', 'MonkeyKingNimbus'));
        },
      });
    },
    // R Cyclone (recast to stop early)
    (k) => {
      const { u, c } = k;
      if (k.recast) {
        endCyclone(u);
        return;
      }
      const dur = K.v(u, 3, 'SpinDuration', 'MonkeyKingSpinToWin');
      c.st.spin = { t: dur, acc: 0, hit: new Set<Unit>() };
      K.addBuff(u, 0, K.v(u, 3, 'MoveSpeed', 'MonkeyKingSpinToWin'), dur);
      return { recast: dur };
    },
  ],
});
function endCyclone(u: Unit) {
  const c = u.champ!;
  if (!c.st.spin) return;
  c.st.spin = undefined;
  c.rc[3] = 0;
  c.cds[3] = K.cdOf(u, 3);
}

// ---------------------------------------------------------------- Yuumi
const attachedTo = (u: Unit): Unit | null => {
  const a = u.champ!.st.att as Unit | undefined;
  return a && !a.dead ? a : null;
};
function detach(u: Unit) {
  const st = u.champ!.st;
  const a = st.att as Unit | undefined;
  st.att = null;
  u.untargT = 0;
  if (a) {
    u.x = a.x + 40;
    u.y = a.y + 40;
  }
}
register('yuumi', {
  passive: {
    onDealt(u, t, _d, _ty, from) {
      void from;
      if (t.kind !== 'champ' || now() < (u.champ!.st.pCd ?? 0)) return;
      u.champ!.st.pCd = now() + K.pcalc(u, 'PassiveCooldown', 'YuumiP');
      const amt = K.pcalc(u, 'HealAmount', 'YuumiP');
      K.heal(u, amt);
      const a = attachedTo(u);
      if (a) K.heal(a, amt);
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.att) {
        const a = attachedTo(u);
        if (!a) return detach(u);
        u.x = a.x;
        u.y = a.y;
        u.untargT = 0.2; // untargetable from everything except turrets (turret exception not modelled)
        u.champ!.order = null;
      }
    },
  },
  cast: [
    // Q Prowling Projectile
    (k) => {
      const { u } = k;
      const att = !!attachedTo(u);
      face(u, k.nx, k.ny);
      const slowT = 1.35;
      const p = K.proj({
        u, nx: k.nx, ny: k.ny, range: 1500, width: 65, speed: K.v(u, 0, 'StartingSpeed', 'YuumiQ'), color: '#d6b8ff',
        cb: (e, pr) => {
          const empowered = att || pr.traveled / K.v(u, 0, 'StartingSpeed', 'YuumiQ') >= slowT;
          K.dmg(u, e, K.calc(u, 0, empowered ? 'TotalMissileDamageEmpowered' : 'TotalMissileDamage', 'YuumiQ'), 'magic');
          K.cc(e, empowered
            ? { slow: K.v(u, 0, 'EmpoweredSlowAmount', 'YuumiQ') / 100, slowT: K.v(u, 0, 'EmpoweredSlowDuration', 'YuumiQ') }
            : { slow: K.v(u, 0, 'SlowAmount', 'YuumiQ') / 100, slowT: K.v(u, 0, 'SlowDuration', 'YuumiQ') });
          K.burst(e.x, e.y, 10, { kind: 'ember', color: '#d6b8ff', speed: 320, life: 0.35, size: 4, drag: 5 });
        },
      });
      // afterburners kick in after 1.35s of flight
      K.later(slowT, () => {
        p.speed = K.v(u, 0, 'AfterburnerSpeed', 'YuumiQ');
      });
    },
    // W You and Me!: attach to an ally (cast again to detach)
    (k) => {
      const { u, c } = k;
      if (attachedTo(u)) {
        if (!c.isPlayer) return false; // bots stay attached
        detach(u);
        return;
      }
      const range = K.v(u, 1, 'CastRange', 'YuumiW');
      const ally = K.pickAlly(u, k.tx, k.ty, range, 400, false);
      if (!ally) return false;
      K.dash(u, ally.x, ally.y, K.v(u, 1, 'DashSpeed', 'YuumiW'), { end: () => (c.st.att = ally) });
      u.untargT = 0.6;
    },
    // E Zoomies: shield, speed and mana for Yuumi or the ally she is on
    (k) => {
      const { u } = k;
      const tgt = attachedTo(u) ?? u;
      K.shield(tgt, K.calc(u, 2, 'TotalShielding', 'YuumiE'), K.v(u, 2, 'MSDuration', 'YuumiE'), '#ff9fd0');
      K.addBuff(tgt, K.calc(u, 2, 'TotalAttackSpeed', 'YuumiE') / 100, K.v(u, 2, 'MSAmount', 'YuumiE') / 100, K.v(u, 2, 'MSDuration', 'YuumiE'));
      tgt.mp = Math.min(tgt.maxMp, tgt.mp + K.v(u, 2, 'ManaRestore', 'YuumiE'));
    },
    // R Final Chapter: five waves
    (k) => {
      const { u } = k;
      const len = K.v(u, 3, 'UltLength', 'YuumiR');
      const waves = K.v(u, 3, 'NumberOfWaves', 'YuumiR');
      const every = K.v(u, 3, 'TimeBetweenWaves', 'YuumiR');
      const rootAt = K.v(u, 3, 'WavesToRoot', 'YuumiR');
      const hits = new Map<Unit, number>();
      face(u, k.nx, k.ny);
      for (let i = 0; i < waves; i++)
        K.later(i * every, () => {
          if (u.dead) return;
          const ex = u.x + k.nx * len;
          const ey = u.y + k.ny * len;
          for (const e of foesOnLine(u, u.x, u.y, ex, ey, 130)) {
            K.dmg(u, e, K.calc(u, 3, 'TotalMissileDamage', 'YuumiR'), 'magic');
            const n = (hits.get(e) ?? 0) + 1;
            hits.set(e, n);
            K.cc(e, n >= rootAt ? { root: K.v(u, 3, 'CCDuration', 'YuumiR') } : { slow: Math.abs(K.v(u, 3, 'BaseSlow', 'YuumiR') + K.v(u, 3, 'BonusSlowPerWave', 'YuumiR') * (n - 1)), slowT: 0.8 });
          }
          for (const a of K.allies(u)) if (K.dist(a, u) <= len + 100) K.heal(a, K.calc(u, 3, 'TotalHealPerWave', 'YuumiR'));
          K.ring(u.x + k.nx * (len / 2), u.y + k.ny * (len / 2), 160, '#ffc2f0', 0.4, 8);
        });
    },
  ],
});

// ---------------------------------------------------------------- Naafiri
const PACK = 'NaafiriP';
function packmates(u: Unit) {
  return K.units().filter((p) => p.petOwner === u && !p.dead);
}
function spawnPack(u: Unit, n: number, at?: { x: number; y: number }) {
  const cap = K.pcalc(u, 'PackmateCap', PACK) + (u.champ!.st.wBonus > now() ? 2 : 0);
  for (let i = 0; i < n && packmates(u).length < cap; i++) {
    const ang = Math.random() * Math.PI * 2;
    const p = K.pet(u, {
      name: 'Packmate',
      x: (at?.x ?? u.x) + Math.cos(ang) * 90,
      y: (at?.y ?? u.y) + Math.sin(ang) * 90,
      hp: 60 + 12 * u.champ!.level, // packmate health is not in the data export (see docs)
      ad: K.pcalc(u, 'PackmateTotalDamage', PACK),
      as: K.pv(u, 'PackmateBaseAS', PACK),
      range: 125,
      ms: K.pv(u, 'PackmateBaseMS', PACK),
      life: 9999,
      r: 15,
    });
    void p;
  }
}
register('naafiri', {
  passive: {
    recalc(u) {
      if ((u.champ!.st.wBonus ?? 0) > now()) u.ad += K.calc(u, 1, 'BonusAD', 'NaafiriR');
    },
    onDealt(u, t, _d, _ty, from) {
      if (from === 'spell' && t.kind === 'champ') u.champ!.st.spawnT = (u.champ!.st.spawnT ?? 0) - K.pv(u, 'CooldownReduceOnAbilityHit', PACK);
      // packmates leap at whatever Naafiri hits
      if (t.kind === 'champ' || t.kind === 'monster') for (const p of packmates(u)) p.target = t;
    },
    onKill(u) {
      u.champ!.st.spawnT = (u.champ!.st.spawnT ?? 0) - K.pv(u, 'CooldownReduceOnKill', PACK);
    },
    tick(u, dt) {
      const st = u.champ!.st;
      if (u.champ!.ranks[0] + u.champ!.ranks[1] + u.champ!.ranks[2] + u.champ!.ranks[3] === 0) return;
      st.spawnT = (st.spawnT ?? 0) + dt;
      const cd = K.pcalc(u, 'PackmateSpawnCooldown', PACK) / ((st.wBonus ?? 0) > now() ? 1 + K.v(u, 1, 'PackmateSpawnRateIncrease', 'NaafiriR') : 1);
      if (st.spawnT >= cd) {
        st.spawnT = 0;
        spawnPack(u, 1);
      }
      if ((st.wBonus ?? 0) && now() > st.wBonus) {
        st.wBonus = 0;
        K.recalc(u);
      }
      if ((st.qWin ?? 0) && now() > st.qWin) st.qWin = 0;
    },
  },
  cast: [
    // Q Darkin Daggers: cast, then recast for the second pair
    (k) => {
      const { u, c } = k;
      face(u, k.nx, k.ny);
      const second = k.recast;
      const cdmg = K.calc(u, 0, second ? 'TotalMinDamageSecondCast' : 'TotalDamageFirstCast', 'NaafiriQ');
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 90, speed: 1700, color: '#e86a5a', pierce: true, maxHits: 2,
        cb: (e) => {
          const bleeding = !!e.marks.naafiriBleed;
          let dmg = cdmg;
          if (second && bleeding) dmg = K.calc(u, 0, 'TotalMaxDamageSecondCast', 'NaafiriQ');
          K.dmg(u, e, dmg, 'phys');
          const total = K.calc(u, 0, 'TotalBleedDamage', 'NaafiriQ');
          const dur = K.v(u, 0, 'BleedDuration', 'NaafiriQ');
          K.mark(e, 'naafiriBleed', dur, 1, u);
          K.dot(u, e, total / dur, dur, 'phys', 'naafiriBleed');
          if (second) K.heal(u, K.calc(u, 0, 'TotalHealSecondCast', 'NaafiriQ'));
          if (isChamp(e) || isMonster(e)) for (const p of packmates(u)) p.target = e;
        },
      });
      if (second) {
        c.st.qWin = 0;
        return;
      }
      return { recast: K.v(u, 0, 'RecastWindow', 'NaafiriQ') };
    },
    // W The Call of the Pack
    (k) => {
      const { u, c } = k;
      u.untargT = K.v(u, 1, 'UntargetableDuration', 'NaafiriR');
      const dur = K.v(u, 1, 'Duration', 'NaafiriR');
      c.st.wBonus = now() + dur;
      K.addBuff(u, 0, K.v(u, 1, 'MoveSpeedAmount', 'NaafiriR'), K.v(u, 1, 'MoveSpeedDuration', 'NaafiriR'));
      K.recalc(u);
      spawnPack(u, K.v(u, 1, 'PackmatesToAdd', 'NaafiriR'));
      K.ring(u.x, u.y, 140, '#ff8a6b', 0.5, 8);
    },
    // E Eviscerate
    (k) => {
      const { u } = k;
      const dist = Math.max(K.v(u, 2, 'MinDashDistance', 'NaafiriE'), Math.min(k.d, K.v(u, 2, 'DashDistance', 'NaafiriE')));
      face(u, k.nx, k.ny);
      K.dash(u, u.x + k.nx * dist, u.y + k.ny * dist, 1400, {
        cb: (e) => K.dmg(u, e, K.calc(u, 2, 'TotalDamageFirstSlash', 'NaafiriE'), 'phys'),
        end: () => {
          const rad = K.v(u, 2, 'RadiusSecondSlash', 'NaafiriE');
          for (const e of foesIn(u, u.x, u.y, rad)) K.dmg(u, e, K.calc(u, 2, 'TotalDamageSecondSlash', 'NaafiriE'), 'phys');
          for (const p of packmates(u)) {
            // recall the pack and heal it fully
            p.hp = p.maxHp;
            p.x = u.x + (Math.random() - 0.5) * 120;
            p.y = u.y + (Math.random() - 0.5) * 120;
          }
          K.ring(u.x, u.y, rad, '#ff5a4a', 0.4, 8);
        },
      });
    },
    // R Hounds' Pursuit (recast for a shield and a second dash)
    (k) => {
      const { u, c } = k;
      const range = k.a.ranges![k.rank - 1];
      const t = K.pick(u, k.tx, k.ty, range, 300, isChamp) ?? K.nearestFoe(u, range, isChamp);
      if (!t) return false;
      face(u, t.x - u.x, t.y - u.y);
      const second = k.recast;
      const dx = t.x - u.x;
      const dy = t.y - u.y;
      const dl = Math.hypot(dx, dy) || 1;
      K.dash(u, t.x - (dx / dl) * (t.r + 60), t.y - (dy / dl) * (t.r + 60), K.v(u, 3, 'DashSpeed', 'NaafiriW'), {
        end: () => {
          K.dmg(u, t, K.calc(u, 3, 'TotalDamage', 'NaafiriW'), 'phys');
          t.shredPct = K.calc(u, 3, 'ArmorShred', 'NaafiriW') / Math.max(1, t.armor);
          t.shredT = K.v(u, 3, 'ShredDuration', 'NaafiriW');
          for (const p of packmates(u)) {
            p.target = t;
            K.dmg(u, t, K.calc(u, 3, 'PackmateDamage', 'NaafiriW'), 'phys');
          }
          if (second) K.shield(u, K.calc(u, 3, 'ShieldTotal', 'NaafiriW'), K.v(u, 3, 'ShieldDuration', 'NaafiriW'), '#ff3a2a');
        },
      });
      void c;
      if (second) return;
      return { recast: K.v(u, 3, 'RecastWindow', 'NaafiriW') };
    },
  ],
});
