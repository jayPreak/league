// Annie, Malphite, Ezreal, Jinx, Leona.
import type { Unit } from '../main';
import { K, register } from './registry';
import { dropBuff, face, foesIn, foesInCone, foesOnLine, holdBuff, isChamp } from './util';

const now = () => K.time();

// ---------------------------------------------------------------- Annie
function pyro(u: Unit): boolean {
  const st = u.champ!.st;
  if ((st.pyro ?? 0) >= K.pv(u, 'MaxStacks', 'AnniePassive')) {
    st.pyro = 0;
    st.pyroUsed = true;
    return true;
  }
  return false;
}
const stunOf = (u: Unit) => K.pcalc(u, 'StunDuration', 'AnniePassive');
register('annie', {
  passive: {
    tick(u) {
      const st = u.champ!.st;
      if (st.pyro === undefined) st.pyro = K.pv(u, 'MaxStacks', 'AnniePassive'); // begins the game with Pyromania ready
    },
    onCast(u) {
      const st = u.champ!.st;
      if (st.pyroUsed) st.pyroUsed = false;
      else st.pyro = Math.min(K.pv(u, 'MaxStacks', 'AnniePassive'), (st.pyro ?? 0) + 1);
    },
  },
  cast: [
    // Q Disintegrate
    (k) => {
      const { u } = k;
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 260);
      if (!t) return false;
      const stun = pyro(u);
      face(u, t.x - u.x, t.y - u.y);
      K.proj({
        u, nx: t.x - u.x, ny: t.y - u.y, range: 2000, width: 40, speed: 1400, color: '#ff7a4a', homing: t,
        cb: (e) => {
          K.dmg(u, e, K.calc(u, 0, 'TotalDamage', 'AnnieQ'), 'magic');
          if (stun) K.cc(e, { stun: stunOf(u) });
          if (e.dead) u.mp = Math.min(u.maxMp, u.mp + K.costOf(u, 0)); // refunds the mana on a kill
        },
      });
    },
    // W Incinerate: a cone of fire
    (k) => {
      const { u } = k;
      const stun = pyro(u);
      face(u, k.nx, k.ny);
      for (const e of foesInCone(u, k.nx, k.ny, k.a.ranges![k.rank - 1], 0.45)) {
        K.dmg(u, e, K.calc(u, 1, 'TotalDamage', 'AnnieW'), 'magic');
        if (stun) K.cc(e, { stun: stunOf(u) });
      }
      K.ring(u.x + k.nx * 300, u.y + k.ny * 300, 260, '#ff6a3a', 0.3, 8);
    },
    // E Molten Shield: shield, speed and reflected damage
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1] + K.v(u, 2, 'CastRangeGenerosity', 'AnnieE');
      const tgt = K.pickAlly(u, k.tx, k.ty, range, 260, true) ?? u;
      const dur = K.v(u, 2, 'ShieldDuration', 'AnnieE');
      K.shield(tgt, K.calc(u, 2, 'ShieldBlockTotal', 'AnnieE'), dur, '#ff9a6a');
      K.addBuff(tgt, 0, K.calc(u, 2, 'MoveSpeedCalc', 'AnnieE'), K.v(u, 2, 'MovementSpeedDuration', 'AnnieE'));
      K.mark(tgt, 'reflect', dur, K.calc(u, 2, 'DamageReturn', 'AnnieE'), u);
    },
    // R Summon: Tibbers
    (k) => {
      const { u, rank } = k;
      const stun = pyro(u);
      const range = k.a.ranges![rank - 1];
      const r = Math.min(k.d, range);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      const rad = 290;
      face(u, k.nx, k.ny);
      for (const e of foesIn(u, x, y, rad)) {
        K.dmg(u, e, K.pcalc(u, 'InitialBurstDamage', 'AnnieR', rank), 'magic');
        if (stun) K.cc(e, { stun: stunOf(u) });
      }
      K.ring(x, y, rad, '#ff3a2a', 0.5, 10);
      K.trauma({ x, y }, 0.4);
      const pet = K.pet(u, {
        name: 'Tibbers', x, y, r: 36,
        hp: K.pcalc(u, 'TibbersTotalHP', 'AnnieR', rank),
        ad: K.pcalc(u, 'TibbersAADamage', 'AnnieR', rank),
        as: 0.9, range: 175, ms: 330 + K.pv(u, 'TibbersBonusMS', 'AnnieR', rank),
        armor: K.pcalc(u, 'TibbersTotalResists', 'AnnieR', rank), mr: K.pcalc(u, 'TibbersTotalResists', 'AnnieR', rank),
        life: K.pv(u, 'TibbersLifetime', 'AnnieR', rank),
      });
      const aura = K.pcalc(u, 'TibbersAuraDamage', 'AnnieR', rank);
      let acc = 0;
      K.every(K.pv(u, 'TibbersLifetime', 'AnnieR', rank), (dt) => {
        if (pet.dead) return false;
        acc += dt;
        if (acc >= 0.5) {
          for (const e of foesIn(u, pet.x, pet.y, 275)) K.dmg(u, e, aura * acc, 'magic', 'dot');
          acc = 0;
        }
      });
    },
  ],
});

// ---------------------------------------------------------------- Malphite
register('malphite', {
  passive: {
    onTaken(u, _src, amt) {
      u.champ!.st.hurtT = now();
      return amt;
    },
    tick(u) {
      const st = u.champ!.st;
      if (u.shield <= 0 && now() - (st.hurtT ?? -99) >= K.pcalc(u, 'PassiveCooldown', 'MalphiteShield')) {
        u.shield = K.pcalc(u, 'TotalShield', 'MalphiteShield');
        u.shieldT = 9999;
      }
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.wT ?? 0) > now()) {
        // Thunderclap: aftershocks in front of him
        K.dmg(u, t, K.calc(u, 1, 'TotalBonusDamage', 'Obduracy'), 'phys', 'dot');
        const nx = t.x - u.x;
        const ny = t.y - u.y;
        const dl = Math.hypot(nx, ny) || 1;
        for (const e of foesInCone(u, nx / dl, ny / dl, K.v(u, 1, 'ThunderClapSplashRange', 'Obduracy'), 0.6)) if (e !== t) K.dmg(u, e, K.calc(u, 1, 'ThunderclapSplash', 'Obduracy'), 'phys', 'dot');
        K.ring(t.x, t.y, 140, '#d8c8aa', 0.25, 6);
      }
    },
  },
  cast: [
    // Q Seismic Shard: steals move speed
    (k) => {
      const { u } = k;
      const t = K.pick(u, k.tx, k.ty, k.a.ranges![k.rank - 1], 260);
      if (!t) return false;
      face(u, t.x - u.x, t.y - u.y);
      K.proj({
        u, nx: t.x - u.x, ny: t.y - u.y, range: 2000, width: 50, speed: 1200, color: '#c8b89a', homing: t,
        cb: (e) => {
          K.dmg(u, e, K.calc(u, 0, 'QDamageCalc', 'SeismicShard'), 'magic');
          const steal = K.v(u, 0, 'SpeedSteal', 'SeismicShard') / 100;
          const dur = K.v(u, 0, 'SlowDuration', 'SeismicShard');
          K.cc(e, { slow: steal, slowT: dur });
          K.addBuff(u, 0, steal, dur);
        },
      });
    },
    // W Thunderclap
    (k) => {
      k.c.st.wT = now() + K.v(k.u, 1, 'ThunderclapBuffDuration', 'Obduracy');
      K.ring(k.u.x, k.u.y, 90, '#d8c8aa', 0.3, 6);
    },
    // E Ground Slam: damage scales with armor, slows attack speed
    (k) => {
      const { u } = k;
      const rad = k.a.ranges![k.rank - 1];
      for (const e of foesIn(u, u.x, u.y, rad)) {
        K.dmg(u, e, K.calc(u, 2, 'EDamageCalc', 'Landslide'), 'magic');
        if (e.kind === 'champ' || e.kind === 'minion') {
          e.asRed = K.v(u, 2, 'ASReduction', 'Landslide') / 100;
          e.asRedT = K.v(u, 2, 'Duration', 'Landslide');
        }
      }
      K.ring(u.x, u.y, rad, '#b8a888', 0.4, 10);
    },
    // R Unstoppable Force
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      face(u, k.nx, k.ny);
      K.dash(u, u.x + k.nx * r, u.y + k.ny * r, 1800, {
        end: () => {
          for (const e of foesIn(u, u.x, u.y, 300)) {
            K.dmg(u, e, K.calc(u, 3, 'TotalDamage', 'UFSlash'), 'magic');
            K.cc(e, { air: K.v(u, 3, 'KnockupDuration', 'UFSlash') });
          }
          K.ring(u.x, u.y, 300, '#a89878', 0.5, 12);
          K.trauma(u, 0.5);
        },
      });
    },
  ],
});

// ---------------------------------------------------------------- Ezreal
function risingForce(u: Unit) {
  const st = u.champ!.st;
  st.rf = Math.min(K.pv(u, 'MaxStacks', 'EzrealPassive'), (st.rf ?? 0) + 1);
  st.rfT = now() + K.pv(u, 'StackDuration', 'EzrealPassive');
}
register('ezreal', {
  passive: {
    onDealt(u, t, _d, _ty, from) {
      // Essence Flux detonates on Ezreal's next hit
      const flux = t.marks.fluxEz;
      if (flux && flux.src === u && from !== 'dot') {
        delete t.marks.fluxEz;
        K.dmg(u, t, K.calc(u, 1, 'Damage', 'EzrealW'), 'magic', 'dot');
        u.mp = Math.min(u.maxMp, u.mp + K.v(u, 1, 'ManaReturn', 'EzrealW'));
        risingForce(u);
        K.ring(t.x, t.y, 110, '#ffa84a', 0.4, 8);
      }
    },
    tick(u) {
      const st = u.champ!.st;
      if ((st.rf ?? 0) > 0 && now() > st.rfT) st.rf = 0;
      if (st.rf > 0) holdBuff(u, 'p', st.rf * K.pv(u, 'AttackSpeedPerStack', 'EzrealPassive'), 0, 0.3);
      else dropBuff(u, 'p');
    },
  },
  cast: [
    // Q Mystic Shot
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 120, speed: 2000, color: '#ffe27a',
        cb: (e, p) => {
          K.dmg(u, e, K.calc(u, 0, 'Damage', 'EzrealQ'), 'magic');
          risingForce(u);
          const r = K.v(u, 0, 'CDRefund', 'EzrealQ');
          for (let i = 0; i < 4; i++) K.refundCd(u, i, r);
          p.done = true;
        },
      });
    },
    // W Essence Flux: sticks to the first champion hit
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 160, speed: 1700, color: '#ffa84a',
        cb: (e, p) => {
          if (e.kind !== 'champ') return;
          K.mark(e, 'fluxEz', K.v(u, 1, 'DetonationTimeout', 'EzrealW'), 1, u);
          p.done = true;
        },
      });
    },
    // E Arcane Shift: blink, then a homing bolt
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      K.blink(u, u.x + k.nx * r, u.y + k.ny * r);
      const range = K.v(u, 2, 'MissileRange', 'EzrealE');
      const list = K.foes(u, (e) => K.dist(u, e) <= range + e.r);
      const t = list.find((e) => e.marks.fluxEz) ?? list.sort((a, b) => K.dist(u, a) - K.dist(u, b))[0];
      if (t)
        K.proj({
          u, nx: t.x - u.x, ny: t.y - u.y, range: 2000, width: 40, speed: 1700, color: '#7fe3ff', homing: t,
          cb: (e) => {
            K.dmg(u, e, K.calc(u, 2, 'Damage', 'EzrealE'), 'magic');
            risingForce(u);
          },
        });
    },
    // R Trueshot Barrage: global, weaker on each unit passed
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      const floor = K.v(u, 3, 'MinimumDamagePercent', 'EzrealR');
      const drop = K.v(u, 3, 'DamageReductionPerHit', 'EzrealR');
      K.later(1, () => {
        if (u.dead) return;
        let n = 0;
        K.proj({
          u, nx: k.nx, ny: k.ny, range: 12000, width: 320, speed: 2000, color: '#ffe27a', pierce: true,
          cb: (e) => {
            const mult = Math.max(floor, 1 - drop * n++);
            const big = e.kind === 'champ';
            K.dmg(u, e, K.calc(u, 3, big ? 'Damage' : 'DamageMinionMonster', 'EzrealR') * mult, 'magic');
            if (big) risingForce(u);
          },
        });
      });
    },
  ],
});

// ---------------------------------------------------------------- Jinx
function jinxSpeed(u: Unit) {
  const st = u.champ!.st;
  st.xT = now() + K.pv(u, 'BuffDuration', 'JinxPassiveMarker');
}
register('jinx', {
  passive: {
    onKill(u, victim, assist) {
      void assist;
      if (victim.kind === 'champ') jinxSpeed(u);
    },
    onAttack(u, t, dealt) {
      const st = u.champ!.st;
      if (st.rocket) {
        const cost = K.costOf(u, 0);
        if (u.mp < cost) {
          st.rocket = false;
          return;
        }
        u.mp -= cost;
        const dmg = K.calc(u, 0, 'RocketDamage', 'JinxQ');
        const rad = K.v(u, 0, 'RocketAoERadius', 'JinxQ');
        for (const e of foesIn(u, t.x, t.y, rad)) K.dmg(u, e, e === t ? Math.max(0, dmg - dealt) : dmg, 'phys', 'dot');
        K.ring(t.x, t.y, rad, '#ff6ab0', 0.3, 6);
      } else {
        st.mg = Math.min(K.v(u, 0, 'MinigunAttackSpeedStacks', 'JinxQ'), (st.mg ?? 0) + 1);
        st.mgT = now() + K.v(u, 0, 'MinigunAttackSpeedDuration', 'JinxQ');
      }
    },
    tick(u) {
      const st = u.champ!.st;
      u.rangeBonus = st.rocket ? K.v(u, 0, 'RocketBonusRange', 'JinxQ') : 0;
      if (st.rocket) holdBuff(u, 'rk', -K.v(u, 0, 'RocketASPDPenalty', 'JinxQ'), 0, 0.3);
      else dropBuff(u, 'rk');
      if ((st.mg ?? 0) > 0 && now() > st.mgT) st.mg = 0;
      if (st.mg > 0 && !st.rocket) holdBuff(u, 'mg', (st.mg * K.v(u, 0, 'MinigunAttackSpeedMax', 'JinxQ')) / K.v(u, 0, 'MinigunAttackSpeedStacks', 'JinxQ') / 100, 0, 0.3);
      else dropBuff(u, 'mg');
      // Get Excited!: decaying move speed and attack speed after a takedown
      if ((st.xT ?? 0) > now()) {
        const f = (st.xT - now()) / K.pv(u, 'BuffDuration', 'JinxPassiveMarker');
        holdBuff(u, 'x', K.pv(u, 'ASBuff', 'JinxPassiveMarker') / 100, (K.pv(u, 'MSBuff', 'JinxPassiveMarker') * f) / u.ms, 0.3);
      } else dropBuff(u, 'x');
    },
  },
  cast: [
    // Q Switcheroo!: toggles weapons, costs nothing to swap
    (k) => {
      k.c.st.rocket = !k.c.st.rocket;
      k.c.st.mg = 0;
      K.ring(k.u.x, k.u.y, 60, '#ff6ab0', 0.25, 5);
      return { free: true };
    },
    // W Zap!
    (k) => {
      const { u } = k;
      face(u, k.nx, k.ny);
      K.later(K.v(u, 1, 'JinxLowEndWCastTime', 'JinxW') / Math.max(1, K.effAS(u) / u.as), () => {
        if (u.dead || u.stunT > 0) return;
        K.proj({
          u, nx: k.nx, ny: k.ny, range: k.a.ranges![k.rank - 1], width: 120, speed: 3300, color: '#4fd8ff',
          cb: (e, p) => {
            K.dmg(u, e, K.calc(u, 1, 'TotalDamage', 'JinxW'), 'phys');
            K.cc(e, { slow: K.v(u, 1, 'SlowPercent', 'JinxW') / 100, slowT: K.v(u, 1, 'SlowDuration', 'JinxW') });
            e.revealT = Math.max(e.revealT, 2);
            p.done = true;
          },
        });
      });
    },
    // E Flame Chompers!: three snare grenades
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      const cx = u.x + k.nx * r;
      const cy = u.y + k.ny * r;
      const arm = K.v(u, 2, 'GrenadeArmTime', 'JinxE');
      const life = K.v(u, 2, 'GrenadeDuration', 'JinxE');
      face(u, k.nx, k.ny);
      for (let i = -1; i <= 1; i++) {
        const x = cx - k.ny * i * 130;
        const y = cy + k.nx * i * 130;
        let t = 0;
        K.ring(x, y, 60, '#ff8a4a', life, 4);
        K.every(life + arm, (dt) => {
          t += dt;
          if (t < arm) return;
          const hit = foesIn(u, x, y, 90, (e) => e.kind === 'champ');
          if (hit.length || t >= life + arm - 0.05) {
            for (const e of foesIn(u, x, y, 150)) {
              K.dmg(u, e, K.calc(u, 2, 'TotalDamage', 'JinxE'), 'magic');
              if (hit.includes(e)) K.cc(e, { root: K.v(u, 2, 'RootDuration', 'JinxE') });
            }
            K.ring(x, y, 150, '#ff6a2a', 0.4, 8);
            return false;
          }
        });
      }
    },
    // R Super Mega Death Rocket!: grows with distance
    (k) => {
      const { u, rank } = k;
      face(u, k.nx, k.ny);
      K.proj({
        u, nx: k.nx, ny: k.ny, range: 12000, width: 280, speed: 1700, color: '#ff4a8a', champOnly: true,
        cb: (e, p) => {
          const lo = K.calc(u, 3, 'DamageFloor', 'JinxR');
          const hi = K.calc(u, 3, 'DamageMax', 'JinxR');
          const f = Math.min(1, p.traveled / 1500); // full damage at 1500 range (not in the data export)
          const base = lo + (hi - lo) * f;
          const pct = K.v(u, 3, 'PercentDamage', 'JinxR') / 100;
          K.dmg(u, e, base + (e.maxHp - e.hp) * pct, 'phys');
          const rad = K.v(u, 3, 'AoERadius', 'JinxR');
          for (const o of foesIn(u, e.x, e.y, rad, (x) => x !== e)) K.dmg(u, o, (base + (o.maxHp - o.hp) * pct) * K.v(u, 3, 'AoEDamageMult', 'JinxR'), 'phys');
          K.ring(e.x, e.y, rad, '#ff4a8a', 0.5, 12);
          K.trauma(e, 0.5);
          p.done = true;
        },
      });
      void rank;
    },
  ],
});

// ---------------------------------------------------------------- Leona
const sun = (u: Unit, t: Unit) => {
  if (t.kind === 'champ' || t.kind === 'minion' || t.kind === 'monster') K.mark(t, 'sun', K.pv(u, 'MarkDuration', 'LeonaSunlightPassive'), K.pcalc(u, 'TotalDamage', 'LeonaSunlightPassive'), u);
};
register('leona', {
  passive: {
    onDealt(u, t, _d, _ty, from) {
      if (from === 'spell') sun(u, t);
    },
    recalc(u) {
      const st = u.champ!.st;
      if ((st.wT ?? 0) > now()) {
        u.armor += K.calc(u, 1, 'BonusArmorTooltip', 'LeonaSolarBarrier');
        u.mr += K.calc(u, 1, 'BonusMRTooltip', 'LeonaSolarBarrier');
      }
    },
    onTaken(u, _src, amt) {
      if ((u.champ!.st.wT ?? 0) <= now()) return amt;
      return Math.max(amt * (1 - K.v(u, 1, 'FlatDamageReductionMax', 'LeonaSolarBarrier')), amt - K.v(u, 1, 'FlatDamageReduction', 'LeonaSolarBarrier'));
    },
    onAttack(u, t) {
      const st = u.champ!.st;
      if ((st.qT ?? 0) > now()) {
        st.qT = 0;
        K.dmg(u, t, K.calc(u, 0, 'TotalDamageTooltip', 'LeonaShieldOfDaybreak'), 'magic', 'dot');
        K.cc(t, { stun: K.v(u, 0, 'StunDuration', 'LeonaShieldOfDaybreak') });
        sun(u, t);
      }
    },
    tick(u) {
      const st = u.champ!.st;
      if (st.wT && now() >= st.wT) {
        // Eclipse ends: it explodes, and lingers if enemies are close
        const foes = foesIn(u, u.x, u.y, 450);
        for (const e of foes) {
          K.dmg(u, e, K.calc(u, 1, 'TotalDamageTooltip', 'LeonaSolarBarrier'), 'magic');
          sun(u, e);
        }
        K.ring(u.x, u.y, 450, '#fff0a8', 0.4, 10);
        if (foes.length && !st.wExt) {
          st.wExt = true;
          st.wT = now() + K.v(u, 1, 'ArmorMRDuration', 'LeonaSolarBarrier');
        } else {
          st.wT = 0;
          st.wExt = false;
        }
        K.recalc(u);
      }
    },
  },
  cast: [
    // Q Shield of Daybreak
    (k) => {
      k.c.st.qT = now() + 5; // the empowered-attack window is not in the data export
      K.ring(k.u.x, k.u.y, 70, '#ffe27a', 0.3, 6);
    },
    // W Eclipse
    (k) => {
      const { u, c } = k;
      c.st.wT = now() + K.v(u, 1, 'ArmorMRDuration', 'LeonaSolarBarrier');
      c.st.wExt = false;
      K.recalc(u);
      K.ring(u.x, u.y, 450, '#fff0a8', 0.4, 6);
    },
    // E Zenith Blade: line damage, then Leona dashes to the last champion struck
    (k) => {
      const { u } = k;
      const range = k.a.ranges![k.rank - 1];
      face(u, k.nx, k.ny);
      const ex = u.x + k.nx * range;
      const ey = u.y + k.ny * range;
      K.later(range / 2000, () => {
        const hit = foesOnLine(u, u.x, u.y, ex, ey, 100);
        for (const e of hit) {
          K.dmg(u, e, K.calc(u, 2, 'TotalDamageTooltip', 'LeonaZenithBlade'), 'magic');
          sun(u, e);
        }
        const last = hit.filter(isChamp).sort((a, b) => K.dist(b, u) - K.dist(a, u))[0];
        if (last) {
          K.cc(last, { root: K.v(u, 2, 'RootDuration', 'LeonaZenithBlade') });
          const dx = last.x - u.x;
          const dy = last.y - u.y;
          const dl = Math.hypot(dx, dy) || 1;
          K.dash(u, last.x - (dx / dl) * (last.r + 50), last.y - (dy / dl) * (last.r + 50), 1800);
        }
      });
      K.ring(ex, ey, 60, '#ffd24a', 0.4, 6);
    },
    // R Solar Flare
    (k) => {
      const { u } = k;
      const r = Math.min(k.d, k.a.ranges![k.rank - 1]);
      const x = u.x + k.nx * r;
      const y = u.y + k.ny * r;
      face(u, k.nx, k.ny);
      K.teleCircle(x, y, 250, '#ffb83a', 0.625, () => {
        for (const e of foesIn(u, x, y, 250)) {
          K.dmg(u, e, K.calc(u, 3, 'ExplosionCalculatedDamage', 'LeonaSolarFlare'), 'magic');
          sun(u, e);
          if (K.dist(e, { x, y }) <= 110 + e.r) K.cc(e, { stun: K.v(u, 3, 'CCDuration', 'LeonaSolarFlare') });
          else K.cc(e, { slow: K.v(u, 3, 'SlowPercent', 'LeonaSolarFlare') / 100, slowT: K.v(u, 3, 'CCDuration', 'LeonaSolarFlare') });
        }
        K.ring(x, y, 250, '#ffb83a', 0.5, 12);
        K.trauma({ x, y }, 0.5);
      });
    },
  ],
});
