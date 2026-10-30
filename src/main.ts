import './style.css';
import {
  BASES,
  CHAMPS,
  FIRST_WAVE,
  FOUNTAIN_R,
  ITEMS,
  ITEM_MAP,
  LANES,
  LANE_NAMES,
  MAP,
  NEXUS,
  RIVER,
  TEAM_COLOR,
  TEAM_NAME,
  WAVE_INTERVAL,
} from './data';
import type { AbilityDef, ChampDef, DmgType, Team, Vec } from './data';

// ================= types =================
type Kind = 'champ' | 'minion' | 'tower' | 'nexus';
type MinionType = 'melee' | 'caster' | 'siege';
interface Buff {
  as: number;
  ms: number;
  t: number;
}
interface Dash {
  tx: number;
  ty: number;
  speed: number;
  dmg: number;
  a: AbilityDef | null;
  hit: Set<Unit>;
}
type Order = { type: 'move'; x: number; y: number } | { type: 'attack'; target: Unit };
interface Champ {
  def: ChampDef;
  level: number;
  xp: number;
  gold: number;
  items: string[];
  cds: number[];
  spellCds: number[];
  respawnT: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  isPlayer: boolean;
  lane: number;
  buffs: Buff[];
  recallT: number;
  dash: Dash | null;
  damagers: Map<Unit, number>;
  order: Order | null;
  haste: number;
  ls: number;
  think: number;
  retreating: boolean;
  buildIdx: number;
}
interface Unit {
  id: number;
  kind: Kind;
  team: Team;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  range: number;
  as: number;
  atkCd: number;
  ms: number;
  dead: boolean;
  target: Unit | null;
  slowT: number;
  slowAmt: number;
  stunT: number;
  name: string;
  champ: Champ | null;
  lane: number;
  wp: number;
  mtype: MinionType | null;
  tier: number;
  aggro: Unit | null;
  aggroT: number;
  hitFlash: number;
  retarget: number;
}
interface Proj {
  homing: Unit | null;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  traveled: number;
  max: number;
  width: number;
  owner: Unit;
  team: Team;
  dmg: number;
  dmgType: DmgType;
  pierce: boolean;
  hit: Set<Unit>;
  slow: number;
  slowT: number;
  stun: number;
  champOnly: boolean;
  color: string;
  done: boolean;
}
interface Pending {
  t: number;
  total: number;
  fn: () => void;
  draw: (ctx: CanvasRenderingContext2D, k: number) => void;
}
interface Fx {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  color: string;
}
interface FText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}
interface Game {
  t: number;
  units: Unit[];
  projs: Proj[];
  pending: Pending[];
  fx: Fx[];
  texts: FText[];
  nextWave: number;
  waveNo: number;
  over: Team | null;
  kills: [number, number];
  open: Set<Unit>;
  player: Unit;
  cam: Vec;
  camLocked: boolean;
  zoom: number;
  marker: { x: number; y: number; t: number } | null;
}

// ================= helpers =================
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function polyLen(p: Vec[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]);
  return l;
}
function pointAt(p: Vec[], d: number): Vec {
  for (let i = 1; i < p.length; i++) {
    const seg = dist(p[i - 1], p[i]);
    if (d <= seg) {
      const k = d / seg;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k };
    }
    d -= seg;
  }
  return { ...p[p.length - 1] };
}
function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const k = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}
function polyDist(p: Vec, poly: Vec[]): number {
  let m = Infinity;
  for (let i = 1; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i - 1], poly[i]));
  return m;
}
const lanePoly = (lane: number, team: Team) => (team === 0 ? LANES[lane] : [...LANES[lane]].reverse());
const fmtTime = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ================= state =================
let NEXT_ID = 1;
let G: Game;
let running = false;

function makeUnit(p: Partial<Unit> & Pick<Unit, 'kind' | 'team' | 'x' | 'y'>): Unit {
  return {
    id: NEXT_ID++,
    r: 20,
    hp: 100,
    maxHp: 100,
    ad: 0,
    ap: 0,
    armor: 0,
    mr: 0,
    range: 100,
    as: 1,
    atkCd: 0,
    ms: 0,
    dead: false,
    target: null,
    slowT: 0,
    slowAmt: 0,
    stunT: 0,
    name: '',
    champ: null,
    lane: 0,
    wp: 1,
    mtype: null,
    tier: 0,
    aggro: null,
    aggroT: 0,
    hitFlash: 0,
    retarget: 0,
    ...p,
  };
}

function recalc(u: Unit) {
  const c = u.champ!;
  const d = c.def;
  const L = c.level - 1;
  let hp = d.hp + d.hpL * L;
  let ad = d.ad + d.adL * L;
  let ap = 0;
  let armor = d.armor + d.armorL * L;
  let mr = d.mr + d.mrL * L;
  let asBonus = d.asL * L;
  let ms = d.ms;
  let haste = 0;
  let ls = 0;
  for (const id of c.items) {
    const it = ITEM_MAP[id];
    hp += it.hp ?? 0;
    ad += it.ad ?? 0;
    ap += it.ap ?? 0;
    armor += it.armor ?? 0;
    mr += it.mr ?? 0;
    asBonus += it.as ?? 0;
    ms += it.ms ?? 0;
    haste += it.haste ?? 0;
    ls += it.ls ?? 0;
  }
  const old = u.maxHp;
  u.maxHp = hp;
  u.hp = old > 0 ? Math.min(hp, u.hp + Math.max(0, hp - old)) : hp;
  u.ad = ad;
  u.ap = ap;
  u.armor = armor;
  u.mr = mr;
  u.as = d.as * (1 + asBonus);
  u.ms = ms;
  u.range = d.range;
  c.haste = haste;
  c.ls = ls;
}

function makeChamp(def: ChampDef, team: Team, lane: number, isPlayer: boolean): Unit {
  const b = BASES[team];
  const u = makeUnit({
    kind: 'champ',
    team,
    x: b.x + (lane - 1) * 70,
    y: b.y - (lane - 1) * 70,
    r: 28,
    name: def.name,
  });
  u.champ = {
    def,
    level: 1,
    xp: 0,
    gold: 500,
    items: [],
    cds: [0, 0, 0, 0],
    spellCds: [0, 0],
    respawnT: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    isPlayer,
    lane,
    buffs: [],
    recallT: 0,
    dash: null,
    damagers: new Map(),
    order: null,
    haste: 0,
    ls: 0,
    think: Math.random() * 0.3,
    retreating: false,
    buildIdx: 0,
  };
  u.maxHp = 0;
  recalc(u);
  return u;
}

function newGame(champId: string) {
  NEXT_ID = 1;
  const units: Unit[] = [];
  for (const team of [0, 1] as Team[]) {
    for (let lane = 0; lane < 3; lane++) {
      const poly = lanePoly(lane, team);
      const len = polyLen(poly);
      [0.3, 0.14].forEach((f, tier) => {
        const p = pointAt(poly, len * f);
        units.push(
          makeUnit({
            kind: 'tower',
            team,
            x: p.x,
            y: p.y,
            r: 42,
            hp: tier ? 4000 : 3500,
            maxHp: tier ? 4000 : 3500,
            ad: tier ? 200 : 180,
            armor: 40,
            mr: 40,
            range: 775,
            as: 0.85,
            lane,
            tier,
            name: `${LANE_NAMES[lane]} ${tier ? 'Inner' : 'Outer'} Turret`,
          }),
        );
      });
    }
    units.push(
      makeUnit({ kind: 'nexus', team, ...NEXUS[team], r: 80, hp: 5000, maxHp: 5000, name: 'Nexus' }),
    );
  }
  const pick = CHAMPS.find((c) => c.id === champId)!;
  const allies = CHAMPS.filter((c) => c.id !== champId);
  const player = makeChamp(pick, 0, 1, true);
  units.push(player, makeChamp(allies[0], 0, 0, false), makeChamp(allies[1], 0, 2, false));
  const foes = [...CHAMPS].sort(() => Math.random() - 0.5);
  foes.forEach((d, lane) => units.push(makeChamp(d, 1, lane, false)));

  G = {
    t: 0,
    units,
    projs: [],
    pending: [],
    fx: [],
    texts: [],
    nextWave: FIRST_WAVE,
    waveNo: 0,
    over: null,
    kills: [0, 0],
    open: new Set(),
    player,
    cam: { x: player.x, y: player.y },
    camLocked: true,
    zoom: 1,
    marker: null,
  };
  for (const u of units) if (u.champ && u !== player) aiShop(u);
  buildHud();
  feedMsg('Welcome to the Rift. Minions spawn in 8 seconds.', -1);
}

// ================= combat =================
function targetable(t: Unit): boolean {
  if (t.dead) return false;
  if (t.kind === 'tower' || t.kind === 'nexus') return G.open.has(t);
  return true;
}

function refreshOpenStructures() {
  G.open.clear();
  for (const t of G.units) {
    if (t.dead) continue;
    if (t.kind === 'tower') {
      if (t.tier === 0) G.open.add(t);
      else if (G.units.some((o) => o.kind === 'tower' && o.team === t.team && o.lane === t.lane && o.tier === 0 && o.dead))
        G.open.add(t);
    } else if (t.kind === 'nexus') {
      if (G.units.some((o) => o.kind === 'tower' && o.team === t.team && o.tier === 1 && o.dead)) G.open.add(t);
    }
  }
}

const effAS = (u: Unit) => Math.min(2.5, u.as * (1 + (u.champ?.buffs.reduce((s, b) => s + b.as, 0) ?? 0)));
function effMS(u: Unit): number {
  if (u.stunT > 0) return 0;
  let ms = u.ms * (1 + (u.champ?.buffs.reduce((s, b) => s + b.ms, 0) ?? 0));
  if (u.slowT > 0) ms *= 1 - u.slowAmt;
  return ms;
}

function addText(x: number, y: number, text: string, color: string, size = 15) {
  if (G.texts.length > 80) G.texts.shift();
  G.texts.push({ x: x + (Math.random() - 0.5) * 20, y, text, color, t: 1, size });
}
function addFx(x: number, y: number, r: number, color: string, max = 0.4) {
  G.fx.push({ x, y, r, t: 0, max, color });
}

function dealDamage(src: Unit, t: Unit, amt: number, type: DmgType): number {
  if (!targetable(t) || amt <= 0) return 0;
  const res = type === 'phys' ? t.armor : type === 'magic' ? t.mr : 0;
  const dmg = amt * (100 / (100 + Math.max(0, res)));
  t.hp -= dmg;
  t.hitFlash = 0.12;
  if (t.champ) {
    t.champ.recallT = 0;
    if (src.champ && src.team !== t.team) t.champ.damagers.set(src, G.t);
  }
  // Turrets switch to champions that hurt an allied champion inside their range.
  if (src.champ && t.champ) {
    for (const tw of G.units) {
      if (tw.kind === 'tower' && !tw.dead && tw.team === t.team && dist(tw, src) <= tw.range + src.r) {
        tw.aggro = src;
        tw.aggroT = 2.5;
      }
    }
  }
  const P = G.player;
  if ((src === P || t === P) && dmg >= 1) {
    const col = t === P ? '#ff6b6b' : type === 'magic' ? '#c69bff' : type === 'true' ? '#ffffff' : '#ffd27a';
    addText(t.x, t.y - t.r - 14, String(Math.round(dmg)), col, t.kind === 'champ' ? 17 : 13);
  }
  if (t.hp <= 0) kill(t, src);
  return dmg;
}

function heal(u: Unit, amt: number) {
  u.hp = Math.min(u.maxHp, u.hp + amt);
}

function gainXp(u: Unit, amt: number) {
  const c = u.champ!;
  c.xp += amt;
  while (c.level < 18 && c.xp >= xpNeed(c.level)) {
    c.xp -= xpNeed(c.level);
    c.level++;
    recalc(u);
    addFx(u.x, u.y, 70, '#ffe27a', 0.6);
    if (u === G.player) {
      addText(u.x, u.y - 60, `LEVEL ${c.level}`, '#ffe27a', 20);
      if (c.level === 6) feedMsg('Ultimate unlocked! Press R.', -1);
    }
  }
}
const xpNeed = (lvl: number) => 180 + lvl * 100;

function giveGold(u: Unit, amt: number) {
  u.champ!.gold += amt;
  if (u === G.player) addText(u.x, u.y - 50, `+${amt}g`, '#ffd700', 14);
}

function kill(t: Unit, src: Unit) {
  t.dead = true;
  t.hp = 0;
  addFx(t.x, t.y, t.r * 2.2, t.kind === 'minion' ? '#999' : '#ffb347', 0.5);
  let killer: Unit | null = src.champ ? src : null;
  if (!killer && t.champ) {
    let best = -Infinity;
    for (const [d, time] of t.champ.damagers) if (G.t - time < 10 && time > best) [best, killer] = [time, d];
  }
  const foes = G.units.filter((c) => c.champ && !c.dead && c.team !== t.team && dist(c, t) < 1400);

  if (t.kind === 'minion') {
    if (killer && killer.team !== t.team) {
      giveGold(killer, t.mtype === 'siege' ? 60 : t.mtype === 'melee' ? 21 : 14);
      killer.champ!.cs++;
    }
    const xp = t.mtype === 'siege' ? 90 : t.mtype === 'melee' ? 60 : 30;
    for (const c of foes) gainXp(c, xp / Math.max(1, foes.length * 0.75));
  } else if (t.champ) {
    const c = t.champ;
    c.deaths++;
    c.respawnT = 6 + c.level * 1.8;
    c.order = null;
    c.dash = null;
    c.buffs = [];
    c.recallT = 0;
    c.retreating = false;
    if (killer && killer.team !== t.team) {
      killer.champ!.kills++;
      G.kills[killer.team]++;
      giveGold(killer, 300);
      for (const [d, time] of c.damagers) {
        if (d !== killer && G.t - time < 10) {
          d.champ!.assists++;
          giveGold(d, 150);
        }
      }
      for (const f of foes) gainXp(f, (140 + 30 * c.level) / Math.max(1, foes.length * 0.75));
      feedMsg(`${killer.name}${killer === G.player ? ' (you)' : ''} slew ${t.name}${t === G.player ? ' (you)' : ''}`, killer.team);
    } else feedMsg(`${t.name} was executed`, (1 - t.team) as Team);
    c.damagers.clear();
  } else if (t.kind === 'tower') {
    for (const c of G.units) if (c.champ && c.team !== t.team) giveGold(c, 150);
    feedMsg(`${TEAM_NAME[1 - t.team]} destroyed the ${TEAM_NAME[t.team]} ${t.name}`, (1 - t.team) as Team);
    addFx(t.x, t.y, 200, '#ffb347', 1);
  } else if (t.kind === 'nexus') {
    G.over = (1 - t.team) as Team;
    addFx(t.x, t.y, 500, '#ffe27a', 2);
    setTimeout(showEnd, 1800);
  }
}

function performAttack(u: Unit, t: Unit) {
  const ranged = u.kind === 'tower' || (u.champ ? u.champ.def.ranged : u.mtype !== 'melee');
  let dmg = u.ad;
  let type: DmgType = 'phys';
  if (u.kind === 'tower' && t.kind === 'minion') {
    dmg = t.maxHp * (t.mtype === 'siege' ? 0.14 : t.mtype === 'caster' ? 0.7 : 0.45);
    type = 'true';
  }
  if (u.kind === 'minion' && t.kind === 'champ') dmg *= 0.6;
  if (ranged) {
    G.projs.push({
      homing: t,
      x: u.x,
      y: u.y,
      dx: 0,
      dy: 0,
      speed: u.kind === 'tower' ? 1100 : 1500,
      traveled: 0,
      max: 0,
      width: 0,
      owner: u,
      team: u.team,
      dmg,
      dmgType: type,
      pierce: false,
      hit: new Set(),
      slow: 0,
      slowT: 0,
      stun: 0,
      champOnly: false,
      color: u.kind === 'tower' ? (u.team ? '#ff8a6b' : '#7fc1ff') : u.champ ? u.champ.def.color : TEAM_COLOR[u.team],
      done: false,
    });
  } else applyAuto(u, t, dmg, type);
}

function applyAuto(u: Unit, t: Unit, dmg: number, type: DmgType) {
  const done = dealDamage(u, t, dmg, type);
  if (u.champ && u.champ.ls > 0 && !u.dead) heal(u, done * u.champ.ls);
}

function tryAttack(u: Unit, t: Unit) {
  if (u.atkCd > 0) return;
  performAttack(u, t);
  u.atkCd = 1 / effAS(u);
}

const inRange = (u: Unit, t: Unit) => dist(u, t) <= u.range + u.r + t.r;

function moveToward(u: Unit, x: number, y: number, dt: number): boolean {
  const dx = x - u.x;
  const dy = y - u.y;
  const d = Math.hypot(dx, dy);
  const step = effMS(u) * dt;
  if (d <= step || d < 1) {
    u.x = x;
    u.y = y;
    return true;
  }
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  return false;
}

function nearestEnemy(u: Unit, radius: number, pred: (e: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bd = radius;
  for (const e of G.units) {
    if (e.team === u.team || !targetable(e) || !pred(e)) continue;
    const d = dist(u, e) - e.r;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function towerCovering(p: Vec, towerTeam: Team, pad = 0): Unit | null {
  for (const t of G.units)
    if (t.kind === 'tower' && !t.dead && t.team === towerTeam && dist(t, p) <= t.range + pad) return t;
  return null;
}

// ================= abilities =================
function abilityDamage(u: Unit, a: AbilityDef): number {
  return a.base + a.perLvl * (u.champ!.level - 1) + a.adR * u.ad + a.apR * u.ap;
}

function hitEnemy(u: Unit, e: Unit, a: AbilityDef, dmg: number) {
  dealDamage(u, e, dmg, a.dmgType);
  if (a.slow) {
    e.slowAmt = a.slow;
    e.slowT = a.slowT ?? 1;
  }
  if (a.stun) e.stunT = Math.max(e.stunT, a.stun);
}

function enemiesIn(team: Team, test: (e: Unit) => boolean): Unit[] {
  return G.units.filter((e) => e.team !== team && (e.kind === 'champ' || e.kind === 'minion') && targetable(e) && test(e));
}

function cast(u: Unit, slot: number, tx: number, ty: number): boolean {
  const c = u.champ!;
  const a = c.def.abilities[slot];
  if (u.dead || u.stunT > 0 || c.cds[slot] > 0 || c.dash) return false;
  if (slot === 3 && c.level < 6) return false;
  c.recallT = 0;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const dmg = abilityDamage(u, a);
  switch (a.kind) {
    case 'bolt':
      G.projs.push({
        homing: null,
        x: u.x,
        y: u.y,
        dx: nx,
        dy: ny,
        speed: a.speed ?? 1500,
        traveled: 0,
        max: a.range,
        width: a.width ?? 60,
        owner: u,
        team: u.team,
        dmg,
        dmgType: a.dmgType,
        pierce: !!a.pierce,
        hit: new Set(),
        slow: a.slow ?? 0,
        slowT: a.slowT ?? 0,
        stun: a.stun ?? 0,
        champOnly: !!a.champOnly,
        color: a.color,
        done: false,
      });
      break;
    case 'nova': {
      const reach = a.selfCenter ? 0 : Math.min(d, a.range);
      const cx = u.x + nx * reach;
      const cy = u.y + ny * reach;
      const rad = a.radius ?? 200;
      const delay = a.delay ?? 0.4;
      G.pending.push({
        t: delay,
        total: delay,
        fn: () => {
          const px = a.selfCenter ? u.x : cx;
          const py = a.selfCenter ? u.y : cy;
          if (a.selfCenter && u.dead) return;
          for (const e of enemiesIn(u.team, (e) => dist(e, { x: px, y: py }) <= rad + e.r)) hitEnemy(u, e, a, dmg);
          if (a.heal && !u.dead) heal(u, a.heal + 10 * c.level);
          addFx(px, py, rad, a.color, 0.35);
        },
        draw: (ctx, k) => {
          const px = a.selfCenter ? u.x : cx;
          const py = a.selfCenter ? u.y : cy;
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color + '22';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = a.color + '44';
          ctx.beginPath();
          ctx.arc(px, py, rad * k, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      break;
    }
    case 'dash': {
      const reach = Math.min(d, a.range);
      c.dash = {
        tx: clamp(u.x + nx * reach, 40, MAP - 40),
        ty: clamp(u.y + ny * reach, 40, MAP - 40),
        speed: a.speed ?? 1500,
        dmg,
        a,
        hit: new Set(),
      };
      addFx(u.x, u.y, 40, a.color, 0.3);
      break;
    }
    case 'buff':
      c.buffs.push({ as: a.buffAs ?? 0, ms: a.buffMs ?? 0, t: a.buffT ?? 3 });
      addFx(u.x, u.y, 60, a.color, 0.4);
      break;
    case 'beam': {
      const sx = u.x;
      const sy = u.y;
      const ex = sx + nx * a.range;
      const ey = sy + ny * a.range;
      const w = a.width ?? 120;
      const delay = a.delay ?? 0.8;
      G.pending.push({
        t: delay,
        total: delay,
        fn: () => {
          for (const e of enemiesIn(u.team, (e) => segDist(e, { x: sx, y: sy }, { x: ex, y: ey }) <= w / 2 + e.r))
            hitEnemy(u, e, a, dmg);
          G.fx.push({ x: sx, y: sy, r: -1, t: 0, max: 0.5, color: a.color });
          beams.push({ sx, sy, ex, ey, w, t: 0.5, color: a.color });
        },
        draw: (ctx, k) => {
          ctx.strokeStyle = a.color + '55';
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.strokeStyle = a.color + 'aa';
          ctx.lineWidth = w * k;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        },
      });
      break;
    }
  }
  c.cds[slot] = a.cd * (100 / (100 + c.haste));
  return true;
}
const beams: { sx: number; sy: number; ex: number; ey: number; w: number; t: number; color: string }[] = [];

function castFlash(u: Unit, tx: number, ty: number) {
  const c = u.champ!;
  if (u.dead || c.spellCds[0] > 0 || c.dash) return;
  const d = Math.hypot(tx - u.x, ty - u.y) || 1;
  const reach = Math.min(d, 425);
  addFx(u.x, u.y, 50, '#fff6a8', 0.4);
  u.x = clamp(u.x + ((tx - u.x) / d) * reach, 40, MAP - 40);
  u.y = clamp(u.y + ((ty - u.y) / d) * reach, 40, MAP - 40);
  addFx(u.x, u.y, 50, '#fff6a8', 0.4);
  c.spellCds[0] = 180;
  c.recallT = 0;
  if (c.order?.type === 'move') c.order = null;
}
function castHeal(u: Unit) {
  const c = u.champ!;
  if (u.dead || c.spellCds[1] > 0) return;
  heal(u, 90 + 20 * c.level);
  c.buffs.push({ as: 0, ms: 0.3, t: 1.2 });
  c.spellCds[1] = 150;
  addFx(u.x, u.y, 80, '#7dff9c', 0.5);
}
function startRecall(u: Unit) {
  const c = u.champ!;
  if (u.dead || c.recallT > 0) return;
  c.recallT = 4;
  c.order = null;
}

// ================= minions & waves =================
function spawnWave() {
  G.waveNo++;
  const types: MinionType[] = ['melee', 'melee', 'melee'];
  if (G.waveNo % 3 === 0) types.push('siege');
  types.push('caster', 'caster', 'caster');
  const s = 1 + (G.t / 60) * 0.04;
  for (const team of [0, 1] as Team[]) {
    for (let lane = 0; lane < 3; lane++) {
      const poly = lanePoly(lane, team);
      types.forEach((mt, i) => {
        const p = pointAt(poly, Math.max(0, 300 - i * 50));
        const stats = {
          melee: { hp: 480, ad: 14, range: 90, as: 1.2, r: 18, armor: 0 },
          caster: { hp: 300, ad: 24, range: 480, as: 0.7, r: 15, armor: 0 },
          siege: { hp: 950, ad: 45, range: 300, as: 0.8, r: 24, armor: 15 },
        }[mt];
        G.units.push(
          makeUnit({
            kind: 'minion',
            team,
            x: p.x + (Math.random() - 0.5) * 30,
            y: p.y + (Math.random() - 0.5) * 30,
            r: stats.r,
            hp: stats.hp * s,
            maxHp: stats.hp * s,
            ad: stats.ad * s,
            range: stats.range,
            as: stats.as,
            armor: stats.armor,
            ms: 325,
            lane,
            wp: 1,
            mtype: mt,
            name: 'Minion',
          }),
        );
      });
    }
  }
}

function updateMinion(u: Unit, dt: number) {
  if (u.stunT > 0) return;
  u.retarget -= dt;
  const t = u.target;
  if (t && (!targetable(t) || dist(u, t) > 750)) u.target = null;
  if (u.retarget <= 0 && !(u.target && inRange(u, u.target))) {
    u.retarget = 0.35;
    let best: Unit | null = null;
    let bs = Infinity;
    for (const e of G.units) {
      if (e.team === u.team || !targetable(e)) continue;
      const d = dist(u, e) - e.r;
      if (d > 480) continue;
      const score = d + (e.kind === 'champ' ? 260 : 0);
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    if (best) u.target = best;
  }
  if (u.target) {
    if (inRange(u, u.target)) tryAttack(u, u.target);
    else moveToward(u, u.target.x, u.target.y, dt);
    return;
  }
  const poly = lanePoly(u.lane, u.team);
  const wp = poly[Math.min(u.wp, poly.length - 1)];
  if (dist(u, wp) < 70 && u.wp < poly.length - 1) u.wp++;
  moveToward(u, wp.x, wp.y, dt);
}

function updateTower(u: Unit, dt: number) {
  if (u.aggroT > 0) u.aggroT -= dt;
  const valid = (t: Unit | null): t is Unit => !!t && targetable(t) && t.team !== u.team && dist(u, t) <= u.range + t.r;
  let t: Unit | null = null;
  if (u.aggroT > 0 && valid(u.aggro)) t = u.aggro;
  else if (valid(u.target)) t = u.target;
  else {
    t = nearestEnemy(u, u.range, (e) => e.kind === 'minion') ?? nearestEnemy(u, u.range, (e) => e.kind === 'champ');
  }
  u.target = t;
  if (t) tryAttack(u, t);
}

// ================= champions =================
function updateChamp(u: Unit, dt: number) {
  const c = u.champ!;
  for (let i = 0; i < 4; i++) c.cds[i] = Math.max(0, c.cds[i] - dt);
  for (let i = 0; i < 2; i++) c.spellCds[i] = Math.max(0, c.spellCds[i] - dt);
  c.buffs = c.buffs.filter((b) => (b.t -= dt) > 0);
  if (c.recallT > 0) {
    c.recallT -= dt;
    if (c.recallT <= 0) {
      const b = BASES[u.team];
      u.x = b.x + 60;
      u.y = b.y - 60;
      c.order = null;
      addFx(u.x, u.y, 90, '#4aa3ff', 0.6);
    }
    return;
  }
  if (c.dash) {
    const d = c.dash;
    if (d.dmg > 0 && d.a) {
      for (const e of enemiesIn(u.team, (e) => !d.hit.has(e) && dist(e, u) <= u.r + e.r + 40)) {
        d.hit.add(e);
        hitEnemy(u, e, d.a, d.dmg);
      }
    }
    const step = d.speed * dt;
    const rem = Math.hypot(d.tx - u.x, d.ty - u.y);
    if (rem <= step) {
      u.x = d.tx;
      u.y = d.ty;
      c.dash = null;
    } else {
      u.x += ((d.tx - u.x) / rem) * step;
      u.y += ((d.ty - u.y) / rem) * step;
    }
    return;
  }
  if (u.stunT > 0) return;
  if (!c.isPlayer) aiChamp(u, dt);
  else if (!c.order) {
    const t = nearestEnemy(u, u.range + u.r, () => true);
    if (t && inRange(u, t)) tryAttack(u, t);
  }
  runOrder(u, dt);
}

function runOrder(u: Unit, dt: number) {
  const c = u.champ!;
  const o = c.order;
  if (!o) return;
  if (o.type === 'move') {
    if (moveToward(u, o.x, o.y, dt)) c.order = null;
  } else {
    const t = o.target;
    if (!targetable(t) || t.team === u.team) {
      c.order = null;
      return;
    }
    if (inRange(u, t)) tryAttack(u, t);
    else moveToward(u, t.x, t.y, dt);
  }
}

function aiShop(u: Unit) {
  const c = u.champ!;
  while (c.buildIdx < c.def.build.length && c.items.length < 6) {
    const it = ITEM_MAP[c.def.build[c.buildIdx]];
    if (c.gold < it.cost) break;
    c.gold -= it.cost;
    c.items.push(it.id);
    c.buildIdx++;
    recalc(u);
  }
}

function laneFront(team: Team, lane: number): Vec {
  const enemyNexus = NEXUS[1 - team];
  const ownNexus = NEXUS[team];
  let best: Unit | null = null;
  let bd = Infinity;
  for (const m of G.units) {
    if (m.kind !== 'minion' || m.dead || m.team !== team || m.lane !== lane) continue;
    const d = dist(m, enemyNexus);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (best) {
    const d = dist(best, ownNexus) || 1;
    return { x: best.x + ((ownNexus.x - best.x) / d) * 160, y: best.y + ((ownNexus.y - best.y) / d) * 160 };
  }
  const towers = G.units.filter((t) => t.kind === 'tower' && !t.dead && t.team === team && t.lane === lane);
  const outer = towers.sort((a, b) => a.tier - b.tier)[0];
  if (outer) {
    const d = dist(outer, enemyNexus) || 1;
    return { x: outer.x + ((enemyNexus.x - outer.x) / d) * 120, y: outer.y + ((enemyNexus.y - outer.y) / d) * 120 };
  }
  return { ...ownNexus };
}

function aiCast(u: Unit, s: number, foe: Unit) {
  const c = u.champ!;
  const a = c.def.abilities[s];
  if (c.cds[s] > 0 || (s === 3 && c.level < 6)) return;
  const d = dist(u, foe);
  const fp = foe.hp / foe.maxHp;
  const jx = foe.x + (Math.random() - 0.5) * 60;
  const jy = foe.y + (Math.random() - 0.5) * 60;
  switch (a.kind) {
    case 'bolt':
      if (d < Math.min(a.range, 1100) * 0.85 && (s !== 3 || fp < 0.55)) cast(u, s, jx, jy);
      break;
    case 'beam':
      if (d < 1300 && fp < 0.55) cast(u, s, jx, jy);
      break;
    case 'nova':
      if ((a.selfCenter ? d < (a.radius ?? 0) * 0.8 : d < a.range + (a.radius ?? 0) * 0.4) && (s !== 3 || fp < 0.7))
        cast(u, s, jx, jy);
      break;
    case 'dash':
      if (!c.def.ranged && d > u.range + 60 && d < a.range + 100) cast(u, s, foe.x, foe.y);
      break;
    case 'buff':
      if (d < u.range + 150) cast(u, s, foe.x, foe.y);
      break;
  }
}

function aiChamp(u: Unit, dt: number) {
  const c = u.champ!;
  c.think -= dt;
  if (c.think > 0) return;
  c.think = 0.2 + Math.random() * 0.1;
  const home = BASES[u.team];
  const ownNexus = NEXUS[u.team];
  const hpP = u.hp / u.maxHp;
  if (dist(u, home) < FOUNTAIN_R) {
    aiShop(u);
    if (c.retreating && hpP < 0.95) {
      c.order = null;
      return;
    }
    c.retreating = false;
  }
  const foe = nearestEnemy(u, 900, (e) => e.kind === 'champ');

  // --- retreat / recall ---
  if (hpP < 0.3 || c.retreating) {
    c.retreating = true;
    if (hpP < 0.25) castHeal(u);
    if (!foe || dist(u, foe) > 1100) {
      if (dist(u, home) > 1200) startRecall(u);
      else c.order = { type: 'move', x: home.x, y: home.y };
      return;
    }
    const dashSlot = c.def.abilities.findIndex((a) => a.kind === 'dash');
    if (dist(u, foe) < 500 && dashSlot >= 0) cast(u, dashSlot, home.x, home.y);
    c.order = { type: 'move', x: home.x, y: home.y };
    return;
  }

  // --- fight ---
  if (foe) {
    const fp = foe.hp / foe.maxHp;
    const allies = G.units.filter((o) => o.champ && !o.dead && o.team === u.team && dist(o, u) < 900).length;
    const enemies = G.units.filter((o) => o.champ && !o.dead && o.team !== u.team && dist(o, u) < 900).length;
    const foeSafe = towerCovering(foe, foe.team, 50) !== null;
    const edge = hpP - fp + 0.08 * (allies - enemies);
    const want = (edge > 0.05 || fp < 0.25) && (!foeSafe || (fp < 0.15 && hpP > 0.5));
    if (want && dist(u, foe) < 700) {
      for (let s = 0; s < 4; s++) aiCast(u, s, foe);
      c.order = { type: 'attack', target: foe };
      return;
    }
  }

  // --- don't tank turrets without minions ---
  const tw = towerCovering(u, (1 - u.team) as Team, 60);
  if (tw) {
    const tanks = G.units.some(
      (m) => m.kind === 'minion' && !m.dead && m.team === u.team && dist(m, tw) <= tw.range,
    );
    if (!tanks || tw.target === u) {
      const d = dist(u, ownNexus) || 1;
      c.order = { type: 'move', x: u.x + ((ownNexus.x - u.x) / d) * 350, y: u.y + ((ownNexus.y - u.y) / d) * 350 };
      return;
    }
  }

  // --- push structures when minions tank ---
  const st = nearestEnemy(u, 700, (e) => e.kind === 'tower' || e.kind === 'nexus');
  if (st) {
    const tanks = G.units.filter((m) => m.kind === 'minion' && !m.dead && m.team === u.team && dist(m, st) <= 800).length;
    if (tanks >= 2 || st.kind === 'nexus') {
      c.order = { type: 'attack', target: st };
      return;
    }
  }

  // --- farm ---
  const mins = G.units.filter(
    (m) => m.kind === 'minion' && !m.dead && m.team !== u.team && dist(m, u) < 650,
  );
  if (mins.length) {
    mins.sort((a, b) => a.hp - b.hp);
    if (c.level >= 3 && Math.random() < 0.08) {
      const s = c.def.abilities.findIndex((a) => a.kind === 'bolt' || (a.kind === 'nova' && !a.selfCenter));
      if (s >= 0 && s < 3) cast(u, s, mins[0].x, mins[0].y);
    }
    c.order = { type: 'attack', target: mins[0] };
    return;
  }

  const f = laneFront(u.team, c.lane);
  c.order = { type: 'move', x: f.x, y: f.y };
}

// ================= main update =================
function update(dt: number) {
  if (G.over !== null) {
    G.fx = G.fx.filter((f) => (f.t += dt) < f.max);
    return;
  }
  G.t += dt;
  refreshOpenStructures();
  if (G.t >= G.nextWave) {
    spawnWave();
    G.nextWave += WAVE_INTERVAL;
  }

  for (const u of G.units) {
    if (u.champ) {
      u.champ.gold += 2 * dt;
      if (u.dead) {
        u.champ.respawnT -= dt;
        if (u.champ.respawnT <= 0) {
          const b = BASES[u.team];
          u.dead = false;
          u.hp = u.maxHp;
          u.x = b.x + 60;
          u.y = b.y - 60;
          u.stunT = 0;
          u.slowT = 0;
          if (!u.champ.isPlayer) aiShop(u);
        }
        continue;
      }
    }
    if (u.dead) continue;
    u.atkCd -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.stunT > 0) u.stunT -= dt;
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.kind === 'champ') updateChamp(u, dt);
    else if (u.kind === 'minion') updateMinion(u, dt);
    else if (u.kind === 'tower') updateTower(u, dt);
  }

  // projectiles
  for (const p of G.projs) {
    if (p.done) continue;
    const step = p.speed * dt;
    if (p.homing) {
      const t = p.homing;
      if (t.dead) {
        p.done = true;
        continue;
      }
      const d = dist(p, t);
      if (d <= step + t.r * 0.5) {
        applyAuto(p.owner, t, p.dmg, p.dmgType);
        p.done = true;
      } else {
        p.x += ((t.x - p.x) / d) * step;
        p.y += ((t.y - p.y) / d) * step;
      }
      continue;
    }
    p.x += p.dx * step;
    p.y += p.dy * step;
    p.traveled += step;
    for (const e of G.units) {
      if (e.team === p.team || p.hit.has(e) || !targetable(e)) continue;
      if (e.kind !== 'champ' && (p.champOnly || e.kind !== 'minion')) continue;
      if (dist(p, e) > p.width / 2 + e.r) continue;
      p.hit.add(e);
      dealDamage(p.owner, e, p.dmg, p.dmgType);
      if (p.slow) {
        e.slowAmt = p.slow;
        e.slowT = p.slowT;
      }
      if (p.stun) e.stunT = Math.max(e.stunT, p.stun);
      addFx(e.x, e.y, 40, p.color, 0.3);
      if (!p.pierce) {
        p.done = true;
        break;
      }
    }
    if (p.traveled >= p.max) p.done = true;
  }
  G.projs = G.projs.filter((p) => !p.done);

  for (const pd of G.pending) pd.t -= dt;
  const fire = G.pending.filter((pd) => pd.t <= 0);
  G.pending = G.pending.filter((pd) => pd.t > 0);
  for (const pd of fire) pd.fn();

  // separation
  const mobs = G.units.filter((u) => !u.dead && (u.kind === 'minion' || u.kind === 'champ'));
  for (let i = 0; i < mobs.length; i++) {
    const a = mobs[i];
    for (let j = i + 1; j < mobs.length; j++) {
      const b = mobs[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.r + b.r) * 0.85;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const push = (min - d) / 2;
      const ka = a.champ?.dash ? 0 : 1;
      const kb = b.champ?.dash ? 0 : 1;
      a.x -= (dx / d) * push * ka;
      a.y -= (dy / d) * push * ka;
      b.x += (dx / d) * push * kb;
      b.y += (dy / d) * push * kb;
    }
  }
  for (const s of G.units) {
    if (s.dead || (s.kind !== 'tower' && s.kind !== 'nexus')) continue;
    for (const m of mobs) {
      const d = dist(m, s) || 0.01;
      const min = m.r + s.r;
      if (d < min) {
        m.x = s.x + ((m.x - s.x) / d) * min;
        m.y = s.y + ((m.y - s.y) / d) * min;
      }
    }
  }
  for (const m of mobs) {
    m.x = clamp(m.x, 30, MAP - 30);
    m.y = clamp(m.y, 30, MAP - 30);
    // fountain: heal allies, burn enemies
    if (m.champ && dist(m, BASES[m.team]) < FOUNTAIN_R) heal(m, m.maxHp * 0.15 * dt);
    const enemyBase = BASES[1 - m.team];
    if (dist(m, enemyBase) < FOUNTAIN_R + 120) {
      const nexus = G.units.find((n) => n.kind === 'nexus' && n.team !== m.team)!;
      dealDamage(nexus, m, 1500 * dt, 'true');
    }
  }

  G.units = G.units.filter((u) => !(u.kind === 'minion' && u.dead));
  G.fx = G.fx.filter((f) => (f.t += dt) < f.max);
  G.texts = G.texts.filter((t) => (t.t -= dt * 0.9) > 0);
  for (const b of beams) b.t -= dt;
  while (beams.length && beams[0].t <= 0) beams.shift();
  if (G.marker && (G.marker.t -= dt) <= 0) G.marker = null;
}

// ================= rendering =================
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const mini = $<HTMLCanvasElement>('minimap');
const mctx = mini.getContext('2d')!;
let W = 0;
let H = 0;
let DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
}
window.addEventListener('resize', resize);
resize();

const mapCanvas = document.createElement('canvas');
mapCanvas.width = mapCanvas.height = 2000;
(function drawMapBase() {
  const m = mapCanvas.getContext('2d')!;
  m.scale(0.5, 0.5);
  m.fillStyle = '#26381f';
  m.fillRect(0, 0, MAP, MAP);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    m.fillStyle = rnd() < 0.5 ? 'rgba(60,85,40,0.25)' : 'rgba(20,35,18,0.25)';
    m.beginPath();
    m.arc(rnd() * MAP, rnd() * MAP, 30 + rnd() * 120, 0, Math.PI * 2);
    m.fill();
  }
  // lanes
  m.lineCap = 'round';
  m.lineJoin = 'round';
  for (const [w, col] of [
    [330, '#4f4430'],
    [270, '#6b5b3f'],
    [180, '#776649'],
  ] as const) {
    m.strokeStyle = col;
    m.lineWidth = w;
    for (const l of LANES) {
      m.beginPath();
      m.moveTo(l[0].x, l[0].y);
      for (const p of l.slice(1)) m.lineTo(p.x, p.y);
      m.stroke();
    }
  }
  // river
  m.strokeStyle = 'rgba(30,90,120,0.85)';
  m.lineWidth = 260;
  m.beginPath();
  m.moveTo(RIVER[0].x, RIVER[0].y);
  m.lineTo(RIVER[1].x, RIVER[1].y);
  m.stroke();
  m.strokeStyle = 'rgba(90,170,200,0.25)';
  m.lineWidth = 140;
  m.stroke();
  // jungle walls
  for (let i = 0; i < 1400; i++) {
    const p = { x: rnd() * MAP, y: rnd() * MAP };
    const laneD = Math.min(...LANES.map((l) => polyDist(p, l)));
    if (laneD < 260 || segDist(p, RIVER[0], RIVER[1]) < 190) continue;
    if (dist(p, BASES[0]) < 950 || dist(p, BASES[1]) < 950) continue;
    const r = 35 + rnd() * 60;
    m.fillStyle = '#132013';
    m.beginPath();
    m.arc(p.x, p.y, r, 0, Math.PI * 2);
    m.fill();
    m.fillStyle = rnd() < 0.5 ? '#1c3320' : '#22402a';
    m.beginPath();
    m.arc(p.x - r * 0.15, p.y - r * 0.2, r * 0.7, 0, Math.PI * 2);
    m.fill();
  }
  // bases
  BASES.forEach((b, team) => {
    const g = m.createRadialGradient(b.x, b.y, 50, b.x, b.y, 900);
    g.addColorStop(0, team ? 'rgba(120,40,40,0.55)' : 'rgba(40,70,140,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g;
    m.beginPath();
    m.arc(b.x, b.y, 900, 0, Math.PI * 2);
    m.fill();
    m.strokeStyle = TEAM_COLOR[team];
    m.lineWidth = 6;
    m.setLineDash([20, 14]);
    m.beginPath();
    m.arc(b.x, b.y, FOUNTAIN_R, 0, Math.PI * 2);
    m.stroke();
    m.setLineDash([]);
  });
})();

let mouse = { x: 0, y: 0 };
const toWorld = (sx: number, sy: number): Vec => ({
  x: (sx - W / 2) / G.zoom + G.cam.x,
  y: (sy - H / 2) / G.zoom + G.cam.y,
});

function hpBar(x: number, y: number, w: number, h: number, frac: number, col: string) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#300';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), h);
}

function render() {
  const P = G.player;
  if (G.camLocked) {
    G.cam.x += (P.x - G.cam.x) * 0.2;
    G.cam.y += (P.y - G.cam.y) * 0.2;
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, W, H);
  const z = G.zoom;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - G.cam.x * z), DPR * (H / 2 - G.cam.y * z));
  ctx.drawImage(mapCanvas, 0, 0, MAP, MAP);

  const view = { x0: G.cam.x - W / 2 / z - 200, x1: G.cam.x + W / 2 / z + 200, y0: G.cam.y - H / 2 / z - 200, y1: G.cam.y + H / 2 / z + 200 };
  const visible = (u: Vec) => u.x > view.x0 && u.x < view.x1 && u.y > view.y0 && u.y < view.y1;

  // fountain lasers zone shimmer
  for (const pd of G.pending) pd.draw(ctx, 1 - pd.t / pd.total);

  // move marker
  if (G.marker) {
    ctx.strokeStyle = `rgba(120,255,140,${G.marker.t * 2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(G.marker.x, G.marker.y, 18 * (1.3 - G.marker.t), 0, Math.PI * 2);
    ctx.stroke();
  }

  // enemy tower ranges near player
  for (const t of G.units) {
    if (t.kind !== 'tower' || t.dead || t.team === P.team) continue;
    const d = dist(t, P);
    if (d < t.range + 300) {
      ctx.strokeStyle = t.target === P ? 'rgba(255,60,60,0.8)' : 'rgba(255,90,90,0.35)';
      ctx.lineWidth = t.target === P ? 4 : 2;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const hovered = hoverUnit();
  canvas.classList.toggle('hostile', !!hovered);

  // structures
  for (const u of G.units) {
    if ((u.kind !== 'tower' && u.kind !== 'nexus') || !visible(u)) continue;
    const col = TEAM_COLOR[u.team];
    if (u.dead) {
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (u.kind === 'tower') {
      ctx.fillStyle = '#1a1a1f';
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = u.hitFlash > 0 ? '#fff' : '#55565e';
      ctx.fillRect(u.x - u.r * 0.7, u.y - u.r * 0.7, u.r * 1.4, u.r * 1.4);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(u.x, u.y - 8, 14, 0, Math.PI * 2);
      ctx.fill();
      if (!G.open.has(u)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.r + 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (u.target && targetable(u.target)) {
        ctx.strokeStyle = col + '88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(u.x, u.y - 8);
        ctx.lineTo(u.target.x, u.target.y);
        ctx.stroke();
      }
    } else {
      const g = ctx.createRadialGradient(u.x, u.y, 10, u.x, u.y, u.r * 1.6);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.3, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = u.hitFlash > 0 ? '#fff' : col;
      ctx.beginPath();
      ctx.moveTo(u.x, u.y - u.r);
      ctx.lineTo(u.x + u.r * 0.7, u.y);
      ctx.lineTo(u.x, u.y + u.r);
      ctx.lineTo(u.x - u.r * 0.7, u.y);
      ctx.closePath();
      ctx.fill();
      if (!G.open.has(u)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.r + 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (hovered === u) outline(u);
    hpBar(u.x, u.y - u.r - 22, u.kind === 'nexus' ? 140 : 90, 8, u.hp / u.maxHp, col);
  }

  // minions
  for (const u of G.units) {
    if (u.kind !== 'minion' || u.dead || !visible(u)) continue;
    ctx.fillStyle = u.hitFlash > 0 ? '#fff' : TEAM_COLOR[u.team];
    if (u.mtype === 'siege') {
      ctx.fillRect(u.x - u.r, u.y - u.r * 0.7, u.r * 2, u.r * 1.4);
    } else {
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = u.mtype === 'caster' ? '#e7d7ff' : '#1b1b1b';
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (hovered === u) outline(u);
    if (u.hp < u.maxHp) hpBar(u.x, u.y - u.r - 9, 32, 4, u.hp / u.maxHp, u.team === P.team ? '#4aa3ff' : '#ff5a5a');
  }

  // champions
  for (const u of G.units) {
    if (u.kind !== 'champ' || u.dead || !visible(u)) continue;
    const c = u.champ!;
    if (c.recallT > 0) {
      ctx.strokeStyle = '#4aa3ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - c.recallT / 4));
      ctx.stroke();
    }
    if (c.buffs.length) {
      ctx.fillStyle = 'rgba(255,220,120,0.18)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = TEAM_COLOR[u.team];
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = u.hitFlash > 0 ? '#fff' : c.def.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r - 1, 0, Math.PI * 2);
    ctx.fill();
    if (u.slowT > 0) {
      ctx.fillStyle = 'rgba(100,170,255,0.35)';
      ctx.fill();
    }
    ctx.fillStyle = '#111';
    ctx.font = '800 26px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.def.name[0], u.x, u.y + 2);
    if (u === P) {
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (u.stunT > 0) {
      ctx.fillStyle = '#ffe27a';
      ctx.font = '700 18px Inter';
      ctx.fillText('✦ ✦', u.x, u.y - u.r - 44);
    }
    if (hovered === u) outline(u);
    const by = u.y - u.r - 28;
    hpBar(u.x + 10, by, 84, 9, u.hp / u.maxHp, u === P ? '#3cc85a' : u.team === P.team ? '#4aa3ff' : '#ff5a5a');
    ctx.fillStyle = '#111';
    ctx.fillRect(u.x - 52, by - 2, 20, 13);
    ctx.fillStyle = '#ffe27a';
    ctx.font = '700 11px Inter';
    ctx.fillText(String(c.level), u.x - 42, by + 5);
    ctx.fillStyle = '#fff';
    ctx.font = '600 12px Inter';
    ctx.fillText(u.name, u.x, by - 10);
  }

  // projectiles
  for (const p of G.projs) {
    if (!visible(p)) continue;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    if (p.homing) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.owner.kind === 'tower' ? 11 : 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - p.dx * 60, p.y - p.dy * 60);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  for (const b of beams) {
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = clamp(b.t * 2, 0, 1);
    ctx.lineWidth = b.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.sx, b.sy);
    ctx.lineTo(b.ex, b.ey);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const f of G.fx) {
    if (f.r < 0) continue;
    const k = f.t / f.max;
    ctx.strokeStyle = f.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (0.5 + k * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    ctx.globalAlpha = clamp(t.t * 1.5, 0, 1);
    ctx.fillStyle = t.color;
    ctx.font = `800 ${t.size}px Inter`;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    const y = t.y - (1 - t.t) * 50;
    ctx.strokeText(t.text, t.x, y);
    ctx.fillText(t.text, t.x, y);
  }
  ctx.globalAlpha = 1;

  drawMinimap();
}

function outline(u: Unit) {
  ctx.strokeStyle = '#ff4040';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(u.x, u.y, u.r + 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMinimap() {
  const s = 220 / MAP;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(mapCanvas, 0, 0, 220, 220);
  for (const u of G.units) {
    if (u.dead) continue;
    const x = u.x * s;
    const y = u.y * s;
    mctx.fillStyle = TEAM_COLOR[u.team];
    if (u.kind === 'tower') mctx.fillRect(x - 4, y - 4, 8, 8);
    else if (u.kind === 'nexus') mctx.fillRect(x - 6, y - 6, 12, 12);
    else if (u.kind === 'minion') mctx.fillRect(x - 1, y - 1, 2.5, 2.5);
    else {
      mctx.beginPath();
      mctx.arc(x, y, 6, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = u === G.player ? '#ffe27a' : '#000';
      mctx.lineWidth = 2;
      mctx.stroke();
    }
  }
  mctx.strokeStyle = '#fff';
  mctx.lineWidth = 1;
  mctx.strokeRect((G.cam.x - W / 2 / G.zoom) * s, (G.cam.y - H / 2 / G.zoom) * s, (W / G.zoom) * s, (H / G.zoom) * s);
}

function hoverUnit(): Unit | null {
  const w = toWorld(mouse.x, mouse.y);
  let best: Unit | null = null;
  let bd = Infinity;
  for (const u of G.units) {
    if (u.team === G.player.team || !targetable(u)) continue;
    const d = dist(u, w);
    if (d < u.r + 14 && d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

// ================= HUD =================
const hudCache = new Map<string, string>();
function setText(el: HTMLElement, key: string, v: string) {
  if (hudCache.get(key) === v) return;
  hudCache.set(key, v);
  el.textContent = v;
}
let slotEls: { cd: HTMLElement; cdt: HTMLElement; root: HTMLElement }[] = [];

function buildHud() {
  hudCache.clear();
  const c = G.player.champ!;
  const ab = $('abilities');
  ab.innerHTML = '';
  slotEls = [];
  const keys = ['Q', 'W', 'E', 'R', 'D', 'F'];
  const defs = [
    ...c.def.abilities.map((a) => ({ name: a.name, desc: a.desc, color: a.color, cd: a.cd })),
    { name: 'Flash', desc: 'Blink a short distance.', color: '#fff6a8', cd: 180 },
    { name: 'Heal', desc: 'Restore health and gain a burst of speed.', color: '#7dff9c', cd: 150 },
  ];
  defs.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (i > 3 ? ' spell' : '');
    el.title = `${d.name} (${keys[i]}) — ${d.desc} Cooldown ${d.cd}s`;
    el.innerHTML = `<div class="ico" style="background:radial-gradient(circle at 35% 30%, ${d.color}, #111 85%)">${i > 3 ? '' : d.name}</div><div class="cd"></div><div class="cdt"></div><span class="key">${keys[i]}</span>`;
    ab.appendChild(el);
    slotEls.push({ root: el, cd: el.querySelector('.cd')!, cdt: el.querySelector('.cdt')! });
  });
  const portrait = $('portrait');
  portrait.style.background = c.def.color;
  $('pinit').textContent = c.def.name[0];
}

function updateHud() {
  const P = G.player;
  const c = P.champ!;
  setText($('clock'), 'clock', fmtTime(G.t));
  setText($('killsB'), 'kb', String(G.kills[0]));
  setText($('killsR'), 'kr', String(G.kills[1]));
  setText($('scoreline'), 'score', `${c.kills} / ${c.deaths} / ${c.assists}  ·  CS ${c.cs}`);
  setText($('plevel'), 'lvl', String(c.level));
  setText($('hptext'), 'hp', `${Math.ceil(P.hp)} / ${Math.round(P.maxHp)}`);
  $('hpfill').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`;
  $('xpfill').style.transform = `scaleX(${c.level >= 18 ? 1 : c.xp / xpNeed(c.level)})`;
  const gold = String(Math.floor(c.gold));
  setText($('gold'), 'gold', gold);
  setText($('shopgold'), 'sgold', `${gold} gold`);
  const all = [...c.cds, ...c.spellCds];
  const maxes = [...c.def.abilities.map((a) => a.cd * (100 / (100 + c.haste))), 180, 150];
  slotEls.forEach((s, i) => {
    const v = all[i];
    s.cd.style.height = `${v > 0 ? (v / maxes[i]) * 100 : 0}%`;
    setText(s.cdt, 'cdt' + i, v > 0 ? String(Math.ceil(v)) : '');
    s.root.classList.toggle('locked', i === 3 && c.level < 6);
  });
  const statsHtml = `<span>AD <b>${Math.round(P.ad)}</b></span><span>AP <b>${Math.round(P.ap)}</b></span><span>Armor <b>${Math.round(P.armor)}</b></span><span>MR <b>${Math.round(P.mr)}</b></span><span>AS <b>${effAS(P).toFixed(2)}</b></span><span>MS <b>${Math.round(effMS(P) || P.ms)}</b></span>`;
  if (hudCache.get('statsHtml') !== statsHtml) {
    hudCache.set('statsHtml', statsHtml);
    $('stats').innerHTML = statsHtml;
  }
  const invHtml = Array.from({ length: 6 }, (_, i) => `<div>${c.items[i] ? ITEM_MAP[c.items[i]].name : ''}</div>`).join('');
  if (hudCache.get('inv') !== invHtml) {
    hudCache.set('inv', invHtml);
    $('inv').innerHTML = invHtml;
  }
  const respawn = $('respawn');
  respawn.classList.toggle('hidden', !P.dead);
  canvas.classList.toggle('dead', P.dead);
  if (P.dead) setText(respawn, 'resp', `Respawning in ${Math.ceil(c.respawnT)}`);
  $('recallbar').classList.toggle('hidden', c.recallT <= 0);
  if (c.recallT > 0) $('recallfill').style.transform = `scaleX(${1 - c.recallT / 4})`;
  if (!$('shop').classList.contains('hidden')) renderShop();
}

function feedMsg(text: string, team: Team | -1) {
  const el = document.createElement('div');
  el.textContent = text;
  if (team !== -1) el.className = team === 0 ? 'b' : 'r';
  const feed = $('feed');
  feed.prepend(el);
  while (feed.children.length > 6) feed.lastChild!.remove();
  setTimeout(() => el.remove(), 7000);
}

// ================= shop =================
const canShop = () => G.player.dead || dist(G.player, BASES[0]) < FOUNTAIN_R + 60;
function renderShop() {
  const c = G.player.champ!;
  const ok = canShop();
  const note = ok
    ? c.items.length >= 6
      ? 'Inventory full.'
      : 'Click an item to buy it.'
    : 'You can only buy items while in your fountain (press B to recall).';
  const html = ITEMS.map(
    (it) =>
      `<button class="item" data-id="${it.id}" ${!ok || c.gold < it.cost || c.items.length >= 6 ? 'disabled' : ''}><span class="cost">${it.cost}</span><b>${it.name}</b><small>${it.desc}</small></button>`,
  ).join('');
  if (hudCache.get('shop') !== html + note) {
    hudCache.set('shop', html + note);
    $('shopnote').textContent = note;
    $('shopgrid').innerHTML = html;
  }
}
function toggleShop(force?: boolean) {
  const el = $('shop');
  const show = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  if (show) {
    hudCache.delete('shop');
    renderShop();
  }
}
$('shopgrid').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn || btn.disabled) return;
  const it = ITEM_MAP[btn.dataset.id!];
  const c = G.player.champ!;
  if (!canShop() || c.gold < it.cost || c.items.length >= 6) return;
  c.gold -= it.cost;
  c.items.push(it.id);
  recalc(G.player);
  hudCache.delete('shop');
  renderShop();
});
$('shopclose').addEventListener('click', () => toggleShop(false));
$('shopbtn').addEventListener('click', () => toggleShop());

// ================= input =================
let mouseHeld = false;
let lastHoldOrder = 0;
function issueClick() {
  const P = G.player;
  if (P.dead || G.over !== null) return;
  const c = P.champ!;
  const t = hoverUnit();
  c.recallT = 0;
  if (t) c.order = { type: 'attack', target: t };
  else {
    const w = toWorld(mouse.x, mouse.y);
    c.order = { type: 'move', x: clamp(w.x, 30, MAP - 30), y: clamp(w.y, 30, MAP - 30) };
    G.marker = { x: w.x, y: w.y, t: 0.5 };
  }
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
mini.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (!running) return;
  mouse = { x: e.clientX, y: e.clientY };
  mouseHeld = true;
  issueClick();
});
window.addEventListener('mouseup', () => (mouseHeld = false));
window.addEventListener('mousemove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (mouseHeld && running && performance.now() - lastHoldOrder > 120) {
    lastHoldOrder = performance.now();
    issueClick();
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!running) return;
    e.preventDefault();
    G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 1.5);
  },
  { passive: false },
);
mini.addEventListener('mousedown', (e) => {
  if (!running) return;
  const r = mini.getBoundingClientRect();
  const wx = ((e.clientX - r.left) / r.width) * MAP;
  const wy = ((e.clientY - r.top) / r.height) * MAP;
  if (e.button === 2 || G.camLocked) {
    const c = G.player.champ!;
    if (!G.player.dead) {
      c.recallT = 0;
      c.order = { type: 'move', x: wx, y: wy };
      G.marker = { x: wx, y: wy, t: 0.5 };
    }
  } else {
    G.cam = { x: wx, y: wy };
  }
});
window.addEventListener('keydown', (e) => {
  if (!running || G.over !== null) return;
  const k = e.key.toLowerCase();
  const P = G.player;
  const c = P.champ!;
  const w = toWorld(mouse.x, mouse.y);
  if (k === 'escape') return toggleShop(false);
  if (k === 'p') return toggleShop();
  if (k === 'y') {
    G.camLocked = !G.camLocked;
    feedMsg(`Camera ${G.camLocked ? 'locked' : 'unlocked'} (edge-pan with mouse)`, -1);
    return;
  }
  if (k === ' ') {
    G.cam = { x: P.x, y: P.y };
    e.preventDefault();
    return;
  }
  if (P.dead) return;
  const slot = ['q', 'w', 'e', 'r'].indexOf(k);
  if (slot >= 0) {
    if (!cast(P, slot, w.x, w.y) && slot === 3 && c.level < 6) addText(P.x, P.y - 60, 'Unlocks at level 6', '#aaa', 14);
    return;
  }
  if (k === 'd') castFlash(P, w.x, w.y);
  else if (k === 'f') castHeal(P);
  else if (k === 'b') startRecall(P);
  else if (k === 's') {
    c.order = null;
    c.recallT = 0;
  }
});

function edgePan(dt: number) {
  if (G.camLocked) return;
  const m = 24;
  const sp = 1400 * dt;
  if (mouse.x < m) G.cam.x -= sp;
  if (mouse.x > W - m) G.cam.x += sp;
  if (mouse.y < m) G.cam.y -= sp;
  if (mouse.y > H - m) G.cam.y += sp;
  G.cam.x = clamp(G.cam.x, 0, MAP);
  G.cam.y = clamp(G.cam.y, 0, MAP);
}

// ================= menu / end =================
let picked = '';
function buildMenu() {
  const wrap = $('champs');
  wrap.innerHTML = CHAMPS.map(
    (c) => `<button class="champ" data-id="${c.id}">
      <div class="orb" style="background:${c.color}">${c.name[0]}</div>
      <h3>${c.name}</h3><div class="role">${c.role} · ${c.ranged ? 'Ranged' : 'Melee'}</div>
      <ul>${c.abilities.map((a, i) => `<li><b>${'QWER'[i]}</b> ${a.name}</li>`).join('')}</ul>
    </button>`,
  ).join('');
  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.champ');
    if (!b) return;
    picked = b.dataset.id!;
    wrap.querySelectorAll('.champ').forEach((el) => el.classList.toggle('sel', el === b));
    const play = $<HTMLButtonElement>('play');
    play.disabled = false;
    play.textContent = 'Play';
  });
}
function start() {
  if (!picked) return;
  newGame(picked);
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('hud').classList.remove('hidden');
  running = true;
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', () => {
  $('end').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  running = false;
});
function showEnd() {
  const won = G.over === G.player.team;
  const c = G.player.champ!;
  $('endtitle').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('endtitle').style.color = won ? '#c8aa6e' : '#ff5a5a';
  $('endstats').innerHTML = `${c.def.name} · Level ${c.level}<br/>K/D/A ${c.kills} / ${c.deaths} / ${c.assists} · CS ${c.cs}<br/>Game time ${fmtTime(G.t)} · Team kills ${G.kills[0]} – ${G.kills[1]}`;
  toggleShop(false);
  $('end').classList.remove('hidden');
  running = false;
}
buildMenu();

// ================= loop =================
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G) {
    if (running) {
      edgePan(dt);
      update(dt);
      updateHud();
    }
    render();
  } else {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(mapCanvas, 0, 0, W, (W * 1) | 0);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/test hook
Object.assign(window, {
  __rift: () => G,
  __riftStep: (seconds: number) => {
    for (let i = 0; i < seconds * 30; i++) update(1 / 30);
  },
  __riftFrame: () => {
    render();
    updateHud();
  },
});
