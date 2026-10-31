import './style.css';
import {
  BASES,
  CHAMPS,
  DIFFICULTIES,
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
import {
  addTrauma,
  burst,
  drawAirParticles,
  drawGlow,
  drawGroundParticles,
  ease,
  particles,
  ring,
  settings,
  setReduceMotion,
  shake,
  spawn,
  updateParticles,
  updateShake,
} from './fx';
import { audio, setMuted, sfx } from './audio';
import { beginDecals, canvas3d, endDecals, HK, K, loadModels, minimapCanvas, renderPortraits, renderWorld, resetUnits, syncUnits, unitHeight } from './world3d';
import type { AbilityDef, ChampDef, DifficultyDef, DmgType, Team, Vec } from './data';

// ================= types =================
type Kind = 'champ' | 'minion' | 'tower' | 'nexus';
type MinionType = 'melee' | 'caster' | 'siege' | 'super';
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
  ranks: number[]; // points in Q W E R; one point per level, R at 6/11/16
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
  pop: number; // squash on hit, 1 -> 0
  lunge: number; // attack anticipation, 1 -> 0
  lx: number;
  ly: number;
  face: number;
  fadeIn: number; // spawn scale-in, seconds left
  hpTrail: number; // lagging damage chunk on health bars
  retarget: number;
  mp: number;
  maxMp: number;
  revealT: number; // seconds a champion stays visible after attacking from brush
  reviveT: number; // inhibitors rebuild after this many seconds
  act: string; // last one-shot action ('attack', 'cast0'..'cast3', 'flash'), drives 3D animation
  actN: number; // bumps every action so repeats replay
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
  vx: number;
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
  focus: Vec | null;
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
let difficulty: DifficultyDef = DIFFICULTIES[1];
const NORMAL = DIFFICULTIES[1];
// Difficulty only tunes the Red team; Blue bots always play at Normal.
const diffOf = (u: Unit) => (u.team === 1 ? difficulty : NORMAL);

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
    pop: 0,
    lunge: 0,
    lx: 0,
    ly: 0,
    face: -Math.PI / 4,
    fadeIn: 0,
    hpTrail: 1,
    retarget: 0,
    mp: 0,
    maxMp: 0,
    revealT: 0,
    reviveT: 0,
    act: '',
    actN: 0,
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
  const oldMp = u.maxMp;
  u.maxMp = d.mp + d.mpL * L;
  u.mp = oldMp > 0 ? Math.min(u.maxMp, u.mp + Math.max(0, u.maxMp - oldMp)) : u.maxMp;
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
    ranks: [0, 0, 0, 0],
  };
  u.maxHp = 0;
  recalc(u);
  if (!isPlayer) autoRank(u);
  return u;
}

function newGame(champId: string) {
  NEXT_ID = 1;
  firstBlood = true;
  streak = 0;
  lastPlayerKill = -99;
  hitStop = slowmo = hurt = 0;
  particles.length = 0;
  shake.trauma = 0;
  resetUnits();
  const units: Unit[] = [];
  for (const team of [0, 1] as Team[]) {
    for (let lane = 0; lane < 3; lane++) {
      const poly = lanePoly(lane, team);
      const len = polyLen(poly);
      [0.36, 0.22].forEach((f, tier) => {
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
      // inhibitor: no attack, rebuilds itself, and while down the enemy spawns super minions here
      const ip = pointAt(poly, Math.max(430, len * 0.11));
      units.push(
        makeUnit({ kind: 'tower', team, x: ip.x, y: ip.y, r: 46, hp: 3000, maxHp: 3000, armor: 20, mr: 20, range: 0, lane, tier: 2, name: `${LANE_NAMES[lane]} Inhibitor` }),
      );
    }
    // two nexus turrets stand between the inhibitors and the nexus
    const nx = NEXUS[team];
    const ex = NEXUS[1 - team];
    const dl = dist(nx, ex);
    const fx = (ex.x - nx.x) / dl;
    const fy = (ex.y - nx.y) / dl;
    for (const side of [-1, 1])
      units.push(
        makeUnit({
          kind: 'tower',
          team,
          x: nx.x + fx * 210 - fy * side * 140,
          y: nx.y + fy * 210 + fx * side * 140,
          r: 42,
          hp: 2700,
          maxHp: 2700,
          ad: 190,
          armor: 40,
          mr: 40,
          range: 775,
          as: 0.85,
          lane: 1,
          tier: 3,
          name: 'Nexus Turret',
        }),
      );
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
    focus: null,
  };
  for (const u of units) if (u.champ && u !== player) aiShop(u);
  buildHud();
  feedMsg(`Welcome to the Rift (${difficulty.name}). Minions spawn in 8 seconds.`, -1);
}

// ================= combat =================
function targetable(t: Unit): boolean {
  if (t.dead) return false;
  if (t.kind === 'tower' || t.kind === 'nexus') return G.open.has(t);
  return true;
}

// Structures open in order: outer -> inner -> inhibitor per lane; any inhibitor opens the nexus
// turrets; both nexus turrets open the nexus.
function refreshOpenStructures() {
  G.open.clear();
  const down = (team: Team, tier: number, lane?: number) =>
    G.units.some((o) => o.kind === 'tower' && o.team === team && o.tier === tier && o.dead && (lane === undefined || o.lane === lane));
  for (const t of G.units) {
    if (t.dead) continue;
    if (t.kind === 'tower') {
      if (t.tier === 0 || (t.tier < 3 && down(t.team, t.tier - 1, t.lane)) || (t.tier === 3 && down(t.team, 2))) G.open.add(t);
    } else if (t.kind === 'nexus') {
      if (G.units.filter((o) => o.kind === 'tower' && o.team === t.team && o.tier === 3 && o.dead).length >= 2) G.open.add(t);
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
  G.texts.push({ x, y, vx: (Math.random() - 0.5) * 60, text, color, t: 1, size });
}
function addFx(x: number, y: number, r: number, color: string, max = 0.4) {
  G.fx.push({ x, y, r, t: 0, max, color });
}

// ---------- game feel: tiers scale with how much the player cares ----------
let hitStop = 0; // real seconds of frozen simulation
let slowmo = 0; // real seconds of 30% speed
let hurt = 0; // red screen-edge pulse when the player takes a big hit
const onScreen = (p: Vec) => !!G && dist(p, G.cam) < 1300 / G.zoom;
const TIER = { small: 0.12, medium: 0.3, large: 0.62 };
function impact(at: Vec, tier: keyof typeof TIER) {
  if (onScreen(at)) addTrauma(TIER[tier]);
}
function freeze(sec: number) {
  if (!settings.reduceMotion) hitStop = Math.max(hitStop, sec);
}
const DMG_COLOR: Record<DmgType, string> = { phys: '#ffcf7a', magic: '#c69bff', true: '#ffffff' };

function hitSparks(src: Unit, t: Unit, type: DmgType) {
  if (!onScreen(t) || src.kind === 'nexus') return;
  const a = Math.atan2(t.y - src.y, t.x - src.x);
  const ex = t.x - Math.cos(a) * t.r * 0.6;
  const ey = t.y - Math.sin(a) * t.r * 0.6;
  const structure = t.kind === 'tower' || t.kind === 'nexus';
  burst(ex, ey, t.kind === 'champ' ? 7 : structure ? 5 : 4, {
    color: structure ? '#d8d2c4' : DMG_COLOR[type],
    speed: 420,
    life: 0.28,
    size: 3,
    angle: a,
    spread: Math.PI * 0.9,
    drag: 6,
  });
}

let firstBlood = true;
let lastPlayerKill = -99;
let streak = 0;
function announce(text: string, tone: 'good' | 'bad' | 'neutral', sub = '') {
  if (!running) return;
  const el = $('announce');
  el.className = `show ${tone}`;
  if (tone !== 'neutral') sfx(tone);
  el.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
  void el.offsetWidth; // restart the one-shot animation
  el.classList.add('run');
  clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => el.classList.remove('run'), 1900);
}
let announceTimer = 0;

function dealDamage(src: Unit, t: Unit, amt: number, type: DmgType): number {
  if (!targetable(t) || amt <= 0) return 0;
  const res = type === 'phys' ? t.armor : type === 'magic' ? t.mr : 0;
  const mult = src.champ ? diffOf(src).dmg : 1;
  const dmg = amt * mult * (100 / (100 + Math.max(0, res)));
  t.hp -= dmg;
  t.hitFlash = 0.12;
  if (t.kind === 'champ' || t.kind === 'minion') t.pop = Math.min(1, t.pop + (dmg > 40 ? 1 : 0.6));
  if (dmg > 4) {
    hitSparks(src, t, type);
    const mine = src === G.player || t === G.player;
    if (t.kind === 'champ' && (mine || src.kind === 'champ')) sfx(dmg > 60 ? 'hitHeavy' : 'hit', t, mine ? 1 : 0.6);
    else if (mine && src.kind !== 'nexus') sfx('hit', t, 0.45);
  }
  if (t === G.player && dmg > t.maxHp * 0.06) {
    hurt = Math.min(1, hurt + 0.6);
    addTrauma(0.16);
  }
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

// ---------- ability ranks: one point per level; basics cap at ceil(level/2), R at 6/11/16 ----------
const rankCap = (lvl: number, slot: number) => (slot === 3 ? (lvl >= 16 ? 3 : lvl >= 11 ? 2 : lvl >= 6 ? 1 : 0) : Math.min(5, Math.ceil(lvl / 2)));
const skillPoints = (c: Champ) => c.level - c.ranks.reduce((a, b) => a + b, 0);
const canRank = (c: Champ, slot: number) => skillPoints(c) > 0 && c.ranks[slot] < rankCap(c.level, slot);
function rankUp(u: Unit, slot: number): boolean {
  const c = u.champ!;
  if (!canRank(c, slot)) return false;
  c.ranks[slot]++;
  if (G && u === G.player) {
    sfx('click');
    if (slot === 3 && c.ranks[3] === 1) feedMsg('Ultimate learned! Press R.', -1);
  }
  return true;
}
// Bots take Q, W, E once, then R whenever possible, then max their first ability.
function autoRank(u: Unit) {
  const c = u.champ!;
  while (skillPoints(c) > 0) {
    const order = c.ranks.slice(0, 3).some((r) => r === 0) ? [3, ...[0, 1, 2].filter((i) => c.ranks[i] === 0)] : [3, 0, 1, 2];
    if (!order.some((i) => rankUp(u, i))) break;
  }
}
// Rank 1 hits for 75% and each rank adds 15%; ultimates go 100/130/160%.
const rankMul = (slot: number, rank: number) => (slot === 3 ? 1 + 0.3 * (rank - 1) : 0.75 + 0.15 * (rank - 1));

function gainXp(u: Unit, amt: number) {
  const c = u.champ!;
  c.xp += amt;
  while (c.level < 18 && c.xp >= xpNeed(c.level)) {
    c.xp -= xpNeed(c.level);
    c.level++;
    recalc(u);
    if (onScreen(u)) {
      ring(u.x, u.y, 90, '#ffe27a', 0.6, 8);
      for (let i = 0; i < 14; i++)
        spawn({ kind: 'ember', x: u.x + (Math.random() - 0.5) * 50, y: u.y + 10, vy: -220 - Math.random() * 200, life: 0.8, size: 4, color: '#ffd76a', drag: 1.5 });
    }
    if (u === G.player) {
      const pt = $('portrait');
      pt.classList.remove('lvlup');
      void pt.offsetWidth;
      pt.classList.add('lvlup');
      sfx('levelUp');
      addText(u.x, u.y - 60, `LEVEL ${c.level}`, '#ffe27a', 20);
      if (c.level === 6) feedMsg(TOUCH ? 'Ultimate ready to learn: tap + on it.' : 'Ultimate ready to learn: Ctrl+R or click +.', -1);
    }
  }
  if (!c.isPlayer) autoRank(u);
}
const xpNeed = (lvl: number) => 180 + lvl * 100;

function giveGold(u: Unit, amt: number) {
  amt = Math.round(amt * diffOf(u).gold);
  u.champ!.gold += amt;
  if (u === G.player) addText(u.x, u.y - 50, `+${amt}g`, '#ffd700', 14);
}

function deathFx(t: Unit) {
  if (t.kind === 'minion') sfx('minionDie', t, 0.5);
  else if (t.kind === 'champ') sfx('champDie', t);
  else if (t.kind === 'tower') sfx('towerDie', t);
  else sfx('nexus');
  if (!onScreen(t)) return;
  const col = TEAM_COLOR[t.team];
  if (t.kind === 'minion') {
    burst(t.x, t.y, 6, { kind: 'shard', color: col, speed: 260, life: 0.55, size: 6, grav: 600, drag: 2, spin: 10 });
    burst(t.x, t.y, 3, { kind: 'smoke', color: '#9aa0a6', speed: 50, life: 0.6, size: 10, grow: 30, drag: 2 });
  } else if (t.kind === 'champ') {
    burst(t.x, t.y, 22, { color: col, speed: 620, life: 0.45, size: 4, drag: 4 });
    burst(t.x, t.y, 14, { kind: 'ember', color: t.champ!.def.color, speed: 300, life: 0.9, size: 5, drag: 2.5 });
    burst(t.x, t.y, 8, { kind: 'smoke', color: '#3a3f47', speed: 90, life: 0.9, size: 18, grow: 40, drag: 2 });
    ring(t.x, t.y, 150, col, 0.55, 8);
    spawn({ kind: 'ember', x: t.x, y: t.y, vy: -160, life: 1.4, size: 10, color: '#e8f4ff', drag: 0.4 });
    impact(t, t === G.player || t.champ!.damagers.has(G.player) ? 'large' : 'medium');
  } else if (t.kind === 'tower') {
    burst(t.x, t.y, 30, { kind: 'shard', color: '#8d8f98', speed: 520, life: 0.9, size: 9, grav: 700, drag: 1.5, spin: 12 });
    burst(t.x, t.y, 18, { kind: 'ember', color: '#ff9a3c', speed: 480, life: 0.8, size: 6, drag: 2 });
    burst(t.x, t.y, 14, { kind: 'smoke', color: '#4a4d55', speed: 140, life: 1.4, size: 26, grow: 50, drag: 1.5, jitter: 60 });
    ring(t.x, t.y, 260, '#ffb347', 0.7, 12);
    impact(t, 'large');
  } else {
    burst(t.x, t.y, 60, { kind: 'ember', color: col, speed: 900, life: 1.2, size: 8, drag: 1.6 });
    ring(t.x, t.y, 520, '#ffe27a', 1, 16);
    addTrauma(0.9);
  }
}

function kill(t: Unit, src: Unit) {
  t.dead = true;
  t.hp = 0;
  let killer: Unit | null = src.champ ? src : null;
  if (!killer && t.champ) {
    let best = -Infinity;
    for (const [d, time] of t.champ.damagers) if (G.t - time < 10 && time > best) [best, killer] = [time, d];
  }
  const foes = G.units.filter((c) => c.champ && !c.dead && c.team !== t.team && dist(c, t) < 1400);

  deathFx(t);
  if (t.kind === 'minion') {
    if (killer === G.player) sfx('coin');
    if (killer === G.player && onScreen(t))
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        spawn({ kind: 'coin', x: t.x, y: t.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.75, size: 5, drag: 2, spin: 14, home: G.player });
      }
    if (killer && killer.team !== t.team) {
      giveGold(killer, t.mtype === 'siege' || t.mtype === 'super' ? 60 : t.mtype === 'melee' ? 21 : 14);
      killer.champ!.cs++;
    }
    const xp = t.mtype === 'siege' || t.mtype === 'super' ? 90 : t.mtype === 'melee' ? 60 : 30;
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
      const P = G.player;
      if (killer === P) {
        streak = G.t - lastPlayerKill < 10 ? streak + 1 : 1;
        lastPlayerKill = G.t;
        const multi = ['', '', 'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill'][Math.min(streak, 5)];
        announce(firstBlood ? 'First Blood' : multi || 'You have slain an enemy', 'good', firstBlood ? `${t.name} has fallen` : '');
        freeze(0.09);
      } else if (t === P) {
        announce('You have been slain', 'bad', `by ${killer.name}`);
        freeze(0.07);
      } else if (firstBlood) announce('First Blood', killer.team === P.team ? 'good' : 'bad', `${killer.name} slew ${t.name}`);
      else if (killer.team === P.team) announce('An enemy has been slain', 'good');
      else announce('An ally has been slain', 'bad');
      firstBlood = false;
      feedMsg(`${killer.name}${killer === G.player ? ' (you)' : ''} slew ${t.name}${t === G.player ? ' (you)' : ''}`, killer.team);
    } else feedMsg(`${t.name} was executed`, (1 - t.team) as Team);
    c.damagers.clear();
  } else if (t.kind === 'tower') {
    for (const c of G.units) if (c.champ && c.team !== t.team) giveGold(c, t.tier === 2 ? 50 : 150);
    feedMsg(`${TEAM_NAME[1 - t.team]} destroyed the ${TEAM_NAME[t.team]} ${t.name}`, (1 - t.team) as Team);
    const mine = t.team === G.player.team;
    if (t.tier === 2) {
      t.reviveT = 150;
      announce(mine ? 'Your inhibitor has been destroyed' : 'Inhibitor destroyed', mine ? 'bad' : 'good', mine ? 'Enemy super minions are coming' : 'Your super minions will spawn');
    } else announce(mine ? 'Your turret has been destroyed' : 'Turret destroyed', mine ? 'bad' : 'good');
  } else if (t.kind === 'nexus') {
    G.over = (1 - t.team) as Team;
    slowmo = settings.reduceMotion ? 0 : 2.2;
    G.cam = { x: G.cam.x, y: G.cam.y };
    G.focus = { x: t.x, y: t.y };
    for (let i = 1; i <= 4; i++)
      G.pending.push({
        t: i * 0.35,
        total: 1,
        fn: () => {
          const x = t.x + (Math.random() - 0.5) * 220;
          const y = t.y + (Math.random() - 0.5) * 220;
          burst(x, y, 30, { kind: 'ember', color: TEAM_COLOR[t.team], speed: 700, life: 0.9, size: 6, drag: 2 });
          burst(x, y, 24, { color: '#fff3c4', speed: 900, life: 0.5, size: 4 });
          ring(x, y, 260, '#ffe27a', 0.7, 12);
          addTrauma(0.45);
        },
        draw: () => {},
      });
    const ended = G;
    setTimeout(() => {
      if (G === ended && running) showEnd();
    }, 1800);
  }
}

function performAttack(u: Unit, t: Unit) {
  const ranged = u.kind === 'tower' || (u.champ ? u.champ.def.ranged : u.mtype === 'caster' || u.mtype === 'siege');
  let dmg = u.ad;
  let type: DmgType = 'phys';
  if (u.kind === 'tower' && t.kind === 'minion') {
    dmg = t.maxHp * (t.mtype === 'super' ? 0.07 : t.mtype === 'siege' ? 0.14 : t.mtype === 'caster' ? 0.7 : 0.45);
    type = 'true';
  }
  if (u.kind === 'minion' && t.kind === 'champ') dmg *= 0.6;
  const ang = Math.atan2(t.y - u.y, t.x - u.x);
  u.lunge = 1;
  u.revealT = 1.2;
  u.act = 'attack';
  u.actN++;
  u.lx = Math.cos(ang);
  u.ly = Math.sin(ang);
  if (u.kind !== 'tower') u.face = ang;
  if (u.kind === 'tower') sfx('towerShot', u, t === G.player ? 1 : 0.4);
  else if (u.champ) sfx(ranged ? 'shoot' : 'swing', u, u === G.player ? 0.9 : 0.35);
  if (ranged && u.champ && onScreen(u))
    burst(u.x + u.lx * u.r, u.y + u.ly * u.r, 3, { color: u.champ.def.color, speed: 260, life: 0.18, size: 2.5, angle: ang, spread: 0.8 });
  if (ranged) {
    G.projs.push({
      homing: t,
      x: u.x,
      y: u.y,
      dx: 0,
      dy: 0,
      speed: u.kind === 'tower' ? 1100 : 1500,
      traveled: 0,
      max: dist(u, t), // homing shots use this to arc down from the tower crystal
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
function abilityDamage(u: Unit, a: AbilityDef, slot: number): number {
  const rank = Math.max(1, u.champ!.ranks[slot]);
  return (a.base + a.perLvl * (u.champ!.level - 1)) * rankMul(slot, rank) + a.adR * u.ad + a.apR * u.ap;
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
  if (c.ranks[slot] === 0 || u.mp < a.cost) return false;
  u.mp -= a.cost;
  u.revealT = 1.2;
  c.recallT = 0;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const dmg = abilityDamage(u, a, slot);
  if (a.kind !== 'buff' && !a.selfCenter) u.face = Math.atan2(ny, nx);
  u.act = `cast${slot}`;
  u.actN++;
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
          sfx('boom', { x: px, y: py }, u === G.player || slot === 3 ? 1 : 0.6);
          if (onScreen({ x: px, y: py })) {
            ring(px, py, rad * 1.05, a.color, 0.4, 10);
            burst(px, py, a.stun ? 26 : 16, { kind: 'ember', color: a.color, speed: rad * 2.4, life: 0.45, size: 5, drag: 5, jitter: rad * 0.5 });
            burst(px, py, 10, { color: '#ffffff', speed: rad * 3, life: 0.25, size: 2.5, drag: 6 });
            impact({ x: px, y: py }, slot === 3 ? 'large' : u === G.player ? 'small' : 'small');
          }
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
      if (onScreen(u)) {
        burst(u.x, u.y, 6, { kind: 'smoke', color: '#8b8f96', speed: 80, life: 0.4, size: 9, grow: 26 });
        ring(u.x, u.y, 50, a.color, 0.3, 5);
      }
      break;
    }
    case 'buff':
      c.buffs.push({ as: a.buffAs ?? 0, ms: a.buffMs ?? 0, t: a.buffT ?? 3 });
      if (onScreen(u)) {
        ring(u.x, u.y, 70, a.color, 0.4, 6);
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          spawn({ kind: 'ember', x: u.x + Math.cos(ang) * 30, y: u.y + Math.sin(ang) * 30, vx: Math.cos(ang) * 40, vy: -160, life: 0.6, size: 3.5, color: a.color, drag: 2 });
        }
      }
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
          sfx('beam', { x: (sx + ex) / 2, y: (sy + ey) / 2 });
          if (onScreen({ x: sx, y: sy })) addTrauma(u === G.player ? 0.5 : 0.3);
          for (let i = 0; i < 40; i++) {
            const k = Math.random();
            spawn({ kind: 'ember', x: sx + (ex - sx) * k + (Math.random() - 0.5) * w * 0.6, y: sy + (ey - sy) * k + (Math.random() - 0.5) * w * 0.6, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.6, size: 6, color: a.color, drag: 2 });
          }
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
  const castVol = u === G.player ? 1 : 0.6;
  sfx(({ bolt: 'bolt', nova: 'nova', dash: 'dash', buff: 'buff', beam: 'beamCharge' } as const)[a.kind], u, castVol);
  if (a.kind === 'bolt' && onScreen(u)) ring(u.x, u.y, u.r + 26, a.color, 0.25, 5);
  c.cds[slot] = cdOf(c, slot);
  return true;
}
// each rank shaves 6% off the cooldown
const cdOf = (c: Champ, slot: number) => c.def.abilities[slot].cd * (1 - 0.06 * Math.max(0, c.ranks[slot] - 1)) * (100 / (100 + c.haste));
const beams: { sx: number; sy: number; ex: number; ey: number; w: number; t: number; color: string }[] = [];

function castFlash(u: Unit, tx: number, ty: number) {
  const c = u.champ!;
  if (u.dead || c.spellCds[0] > 0 || c.dash) return;
  const d = Math.hypot(tx - u.x, ty - u.y) || 1;
  const reach = Math.min(d, 425);
  burst(u.x, u.y, 14, { color: '#fff6a8', speed: 380, life: 0.3, size: 3 });
  u.x = clamp(u.x + ((tx - u.x) / d) * reach, 40, MAP - 40);
  u.y = clamp(u.y + ((ty - u.y) / d) * reach, 40, MAP - 40);
  burst(u.x, u.y, 18, { kind: 'ember', color: '#fff6a8', speed: 300, life: 0.4, size: 4 });
  ring(u.x, u.y, 70, '#fff6a8', 0.35, 6);
  c.spellCds[0] = 180;
  sfx('flash', u, u === G.player ? 1 : 0.5);
  c.recallT = 0;
  if (c.order?.type === 'move') c.order = null;
}
function castHeal(u: Unit) {
  const c = u.champ!;
  if (u.dead || c.spellCds[1] > 0) return;
  heal(u, 90 + 20 * c.level);
  c.buffs.push({ as: 0, ms: 0.3, t: 1.2 });
  c.spellCds[1] = 150;
  if (u === G.player) sfx('heal');
  ring(u.x, u.y, 90, '#7dff9c', 0.5, 8);
  for (let i = 0; i < 12; i++)
    spawn({ kind: 'plus', x: u.x + (Math.random() - 0.5) * 70, y: u.y + (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 80, life: 0.8, size: 5, color: '#7dff9c', drag: 1.5 });
}
function startRecall(u: Unit) {
  const c = u.champ!;
  if (u.dead || c.recallT > 0) return;
  c.recallT = 4;
  if (u === G.player) sfx('recall');
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
      const inhibDown = G.units.some((o) => o.kind === 'tower' && o.tier === 2 && o.team !== team && o.lane === lane && o.dead);
      const laneTypes: MinionType[] = inhibDown ? ['super', ...types.filter((t) => t !== 'siege')] : types;
      laneTypes.forEach((mt, i) => {
        const p = pointAt(poly, Math.max(0, 300 - i * 50));
        const STATS: Record<MinionType, { hp: number; ad: number; range: number; as: number; r: number; armor: number }> = {
          melee: { hp: 480, ad: 14, range: 90, as: 1.2, r: 18, armor: 0 },
          caster: { hp: 300, ad: 24, range: 480, as: 0.7, r: 15, armor: 0 },
          siege: { hp: 950, ad: 45, range: 300, as: 0.8, r: 24, armor: 15 },
          super: { hp: 1700, ad: 95, range: 170, as: 0.85, r: 30, armor: 30 },
        };
        const stats = STATS[mt];
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
            fadeIn: 0.35,
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
  if (u.tier === 2) return; // inhibitors don't shoot
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
  u.mp = Math.min(u.maxMp, u.mp + c.def.mpRegen * (1 + c.level * 0.06) * dt);
  if (u.revealT > 0) u.revealT -= dt;
  c.buffs = c.buffs.filter((b) => (b.t -= dt) > 0);
  if (c.recallT > 0) {
    c.recallT -= dt;
    if (onScreen(u) && Math.random() < 0.7) {
      const a = G.t * 8 + Math.random() * 0.4;
      const rr = u.r + 14;
      spawn({ kind: 'ember', x: u.x + Math.cos(a) * rr, y: u.y + Math.sin(a) * rr, vx: 0, vy: -140, life: 0.6, size: 3.5, color: '#6fb8ff', drag: 1 });
    }
    if (c.recallT <= 0) {
      if (onScreen(u)) ring(u.x, u.y, 80, '#4aa3ff', 0.4, 8);
      const b = BASES[u.team];
      u.x = b.x + 60;
      u.y = b.y - 60;
      c.order = null;
      ring(u.x, u.y, 110, '#4aa3ff', 0.6, 10);
      if (u === G.player) sfx('recallDone');
      burst(u.x, u.y, 18, { kind: 'ember', color: '#6fb8ff', speed: 200, life: 0.7, size: 4, angle: -Math.PI / 2, spread: 1.2 });
      u.fadeIn = 0.35;
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
    if (onScreen(u)) spawn({ kind: 'ghost', x: u.x, y: u.y, life: 0.22, size: u.r, color: c.def.color, drag: 0 });
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
  if (c.cds[s] > 0 || c.ranks[s] === 0 || u.mp < a.cost) return;
  // keep enough mana for the ultimate when it is nearly up
  if (s !== 3 && c.ranks[3] > 0 && c.cds[3] < 4 && u.mp - a.cost < c.def.abilities[3].cost) return;
  if (Math.random() > diffOf(u).castChance) return;
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
  c.think = diffOf(u).think + Math.random() * 0.1;
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
    const want = (edge > diffOf(u).edge || fp < 0.25) && (!foeSafe || (fp < 0.15 && hpP > 0.5));
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
      u.champ.gold += 2 * dt * diffOf(u).gold;
      if (u.dead) {
        u.champ.respawnT -= dt;
        if (u.champ.respawnT <= 0) {
          const b = BASES[u.team];
          u.dead = false;
          u.hp = u.maxHp;
          u.mp = u.maxMp;
          u.x = b.x + 60;
          u.y = b.y - 60;
          u.stunT = 0;
          u.slowT = 0;
          u.hpTrail = 1;
          u.fadeIn = 0.45;
          if (onScreen(u)) {
            ring(u.x, u.y, 120, TEAM_COLOR[u.team], 0.6, 10);
            burst(u.x, u.y, 16, { kind: 'ember', color: '#cfe6ff', speed: 220, life: 0.8, size: 4, angle: -Math.PI / 2, spread: 1.4 });
          }
          if (!u.champ.isPlayer) aiShop(u);
        }
        continue;
      }
    }
    if (u.dead) {
      if (u.kind === 'tower' && u.tier === 2 && (u.reviveT -= dt) <= 0) {
        u.dead = false;
        u.hp = u.maxHp;
        u.hpTrail = 1;
        feedMsg(`${TEAM_NAME[u.team]} ${u.name} has respawned`, u.team);
      }
      continue;
    }
    u.atkCd -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.stunT > 0) u.stunT -= dt;
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.pop > 0) u.pop = Math.max(0, u.pop - dt * 5);
    if (u.lunge > 0) u.lunge = Math.max(0, u.lunge - dt * 5);
    if (u.fadeIn > 0) u.fadeIn = Math.max(0, u.fadeIn - dt);
    const frac = clamp(u.hp / u.maxHp, 0, 1);
    u.hpTrail = frac > u.hpTrail ? frac : Math.max(frac, u.hpTrail - dt * 0.55);
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
    if (onScreen(p)) spawn({ kind: 'ember', x: p.x, y: p.y, vx: -p.dx * 60 + (Math.random() - 0.5) * 50, vy: -p.dy * 60 + (Math.random() - 0.5) * 50, life: 0.3, size: p.width * 0.12 + 2, color: p.color, drag: 3 });
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
      if (onScreen(e)) burst(e.x, e.y, 10, { kind: 'ember', color: p.color, speed: 300, life: 0.35, size: 4, drag: 5 });
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
    if (m.champ && dist(m, BASES[m.team]) < FOUNTAIN_R) {
      heal(m, m.maxHp * 0.15 * dt);
      m.mp = Math.min(m.maxMp, m.mp + m.maxMp * 0.15 * dt);
    }
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
// Three layers: the 3D world (world3d.ts), ground decals painted onto a canvas laid on the ground
// under the units, and this 2D overlay for air effects, health bars and numbers.
const canvas = $<HTMLCanvasElement>('game');
canvas.before(canvas3d);
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
let PORTRAITS: Record<string, string> = {};
void loadModels()
  .then(() => {
    PORTRAITS = renderPortraits();
    applyPortraits();
  })
  .catch((e) => console.error('model load failed', e));
function applyPortraits() {
  document.querySelectorAll<HTMLElement>('.champ').forEach((el) => {
    const img = PORTRAITS[el.dataset.id ?? ''];
    const orb = el.querySelector<HTMLElement>('.orb');
    if (img && orb) {
      // inline shorthand from buildMenu resets size/position, so set them inline too
      orb.style.backgroundImage = `url(${img})`;
      orb.style.backgroundSize = '104%';
      orb.style.backgroundPosition = 'center 40%';
      orb.style.backgroundRepeat = 'no-repeat';
      orb.classList.add('img');
    }
  });
  if (G && running) paintPortrait();
}
function paintPortrait() {
  const c = G.player.champ!;
  const img = PORTRAITS[c.def.id];
  const portrait = $('portrait');
  portrait.style.background = img ? `url(${img}) center 40% / 104% no-repeat, radial-gradient(circle at 50% 35%, ${c.def.color}, #0b0f14 80%)` : c.def.color;
  $('pinit').textContent = img ? '' : c.def.name[0];
}

const AIR = 50; // height that sparks, embers and beams float at
let animDt = 0; // simulation seconds since the last render, so hit-stop also freezes animation
// camera used by the last render (includes shake)
let rcx = 0;
let rcy = 0;

let mouse = { x: 0, y: 0 };
const toWorld = (sx: number, sy: number): Vec => ({
  x: (sx - W / 2) / G.zoom + G.cam.x,
  y: (sy - H / 2) / (G.zoom * K) + G.cam.y,
});
const screenOf = (x: number, y: number, h: number): Vec => ({
  x: W / 2 + (x - rcx) * G.zoom,
  y: H / 2 + (y - rcy) * G.zoom * K - h * G.zoom * HK,
});

// Health bar in the style of a modern MOBA: dark frame, damage trail, 100 HP ticks.
function hpBar(x: number, y: number, w: number, h: number, frac: number, trail: number, col: string, maxHp = 0) {
  ctx.fillStyle = 'rgba(6,8,10,0.92)';
  ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#26191a';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = '#f0e2b8';
  ctx.fillRect(x - w / 2, y, w * clamp(trail, 0, 1), h);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), Math.max(1, h * 0.35));
  if (maxHp > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let v = 100; v < maxHp; v += 100) {
      const tx = x - w / 2 + (w * v) / maxHp;
      ctx.fillRect(tx, y, v % 1000 === 0 ? 1.5 : 1, v % 1000 === 0 ? h : h * 0.55);
    }
  }
}

function render() {
  const P = G.player;
  const target = G.focus ?? (demoMode ? demoFocus() : P);
  if (G.camLocked || demoMode || G.focus) {
    const k = demoMode ? 0.03 : G.focus ? 0.06 : 0.2;
    G.cam.x += (target.x - G.cam.x) * k;
    G.cam.y += (target.y - G.cam.y) * k;
  }
  const z = G.zoom;
  audio.listener.x = G.cam.x;
  audio.listener.y = G.cam.y;
  audio.listener.halfWidth = W / 2 / z;
  rcx = G.cam.x - shake.x / z;
  rcy = G.cam.y - shake.y / (z * K);
  const now = performance.now() / 1000;
  const halfW = W / 2 / z;
  const halfH = H / 2 / (z * K);
  // tall bodies stay visible a little past the bottom edge
  const view = { x0: rcx - halfW, x1: rcx + halfW, y0: rcy - halfH, y1: rcy + halfH + 260 };
  const visible = (u: Vec) => u.x > view.x0 - 100 && u.x < view.x1 + 100 && u.y > view.y0 - 100 && u.y < view.y1 + 100;

  const hovered = demoMode ? null : hoverUnit();
  canvas.classList.toggle('hostile', !!hovered);
  syncUnits(G.units, { dt: animDt, time: now, hovered, winner: G.over, view });
  animDt = 0;

  // ---- ground decals: telegraphs, rings and smoke sit under the units ----
  const d = beginDecals(view);
  for (const b of BASES) {
    d.globalCompositeOperation = 'lighter';
    drawGlow(d, b.x, b.y, FOUNTAIN_R * 0.9, '#3a6fd8', 0.18 + 0.05 * Math.sin(now * 2));
    d.globalCompositeOperation = 'source-over';
  }
  for (const pd of G.pending) pd.draw(d, 1 - pd.t / pd.total);
  drawAim(d);
  if (G.marker) {
    const k = ease.outCubic(1 - G.marker.t / 0.5);
    d.strokeStyle = `rgba(120,255,140,${1 - k})`;
    d.lineWidth = 7;
    d.beginPath();
    d.arc(G.marker.x, G.marker.y, 14 + 22 * k, 0, Math.PI * 2);
    d.stroke();
  }
  if (!demoMode) {
    for (const t of G.units) {
      if (t.kind !== 'tower' || t.tier === 2 || t.dead || t.team === P.team) continue;
      if (dist(t, P) < t.range + 300) {
        const aimed = t.target === P;
        d.strokeStyle = aimed ? `rgba(255,60,60,${0.7 + 0.25 * Math.sin(now * 10)})` : 'rgba(255,90,90,0.4)';
        d.lineWidth = aimed ? 9 : 5;
        d.setLineDash([26, 18]);
        d.lineDashOffset = -now * 30;
        d.beginPath();
        d.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        d.stroke();
        d.setLineDash([]);
      }
    }
  }
  drawGroundParticles(d, view);
  for (const u of G.units) {
    if (u.dead || !visible(u)) continue;
    if (hovered === u) {
      d.strokeStyle = '#ff4040';
      d.lineWidth = 6;
      d.beginPath();
      d.arc(u.x, u.y, u.r + 12, 0, Math.PI * 2);
      d.stroke();
    }
    if (u.kind === 'tower' && !G.open.has(u)) {
      d.strokeStyle = 'rgba(255,255,255,0.3)';
      d.lineWidth = 6;
      d.beginPath();
      d.arc(u.x, u.y, u.r + 34, 0, Math.PI * 2);
      d.stroke();
    }
    const c = u.champ;
    if (!c) continue;
    if (u === P && !demoMode) {
      d.strokeStyle = '#ffe27a';
      d.lineWidth = 5;
      d.beginPath();
      d.arc(u.x, u.y, u.r + 16, 0, Math.PI * 2);
      d.stroke();
    }
    if (c.recallT > 0) {
      const k = 1 - c.recallT / 4;
      d.globalCompositeOperation = 'lighter';
      drawGlow(d, u.x, u.y, u.r * 3, '#4aa3ff', 0.35 + 0.4 * k);
      d.globalCompositeOperation = 'source-over';
      d.strokeStyle = '#6fb8ff';
      d.lineWidth = 8;
      d.beginPath();
      d.arc(u.x, u.y, u.r + 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      d.stroke();
    }
    if (c.buffs.length) {
      d.globalCompositeOperation = 'lighter';
      drawGlow(d, u.x, u.y, u.r * 2.4, '#ffcf6a', 0.4 + 0.15 * Math.sin(now * 12));
      d.globalCompositeOperation = 'source-over';
    }
  }
  endDecals();

  renderWorld(rcx, rcy, z, W, H, now);

  // ---- overlay ----
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // structure crystals and tower lasers
  ctx.globalCompositeOperation = 'lighter';
  for (const u of G.units) {
    if ((u.kind !== 'tower' && u.kind !== 'nexus') || u.dead || !visible(u)) continue;
    const col = TEAM_COLOR[u.team];
    const inhib = u.kind === 'tower' && u.tier === 2;
    const s = screenOf(u.x, u.y, inhib ? 120 : u.kind === 'tower' ? 282 : 170);
    if (inhib) drawGlow(ctx, s.x, s.y, 90 * z, col, 0.4 + 0.1 * Math.sin(now * 2 + u.id));
    else if (u.kind === 'tower') {
      drawGlow(ctx, s.x, s.y, (46 + 30 * u.lunge) * z, col, 0.45 + 0.15 * Math.sin(now * 3 + u.id) + 0.4 * u.lunge);
      if (u.target && targetable(u.target)) {
        const t = screenOf(u.target.x, u.target.y, unitHeight(u.target) * 0.5);
        ctx.strokeStyle = u.target === P ? 'rgba(255,70,60,0.75)' : col + '55';
        ctx.lineWidth = (u.target === P ? 3 : 2) * z;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
    } else {
      drawGlow(ctx, s.x, s.y, 170 * z, col, 0.45 + 0.12 * Math.sin(now * 1.6));
    }
  }

  // projectiles
  for (const p of G.projs) {
    if (!visible(p)) continue;
    if (p.homing) {
      const tower = p.owner.kind === 'tower';
      const h = tower ? 60 + 220 * clamp(dist(p, p.homing) / (p.max || 1), 0, 1) : p.owner.kind === 'minion' ? 40 : 62;
      const s = screenOf(p.x, p.y, h);
      drawGlow(ctx, s.x, s.y, (tower ? 34 : 18) * z, p.color);
    } else {
      const s = screenOf(p.x, p.y, AIR);
      const tail = screenOf(p.x - p.dx * 110, p.y - p.dy * 110, AIR);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = p.width * 0.4 * z;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawGlow(ctx, s.x, s.y, p.width * 0.9 * z, p.color);
    }
  }
  // world-space air layer: beams and particles float at AIR height
  ctx.setTransform(DPR * z, 0, 0, DPR * z * K, DPR * (W / 2 - rcx * z), DPR * (H / 2 - rcy * z * K - AIR * z * HK));
  for (const b of beams) {
    const k = clamp(b.t * 2, 0, 1);
    const w = b.w * (0.4 + 0.6 * ease.outCubic(k));
    ctx.lineCap = 'round';
    ctx.globalAlpha = k;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(b.sx, b.sy);
    ctx.lineTo(b.ex, b.ey);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  drawAirParticles(ctx, view);

  // ---- screen space: bars, names, numbers ----
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ui = TOUCH ? 0.9 : 1;
  for (const u of G.units) {
    if (u.dead || !visible(u) || u.kind === 'champ') continue;
    if (u.kind === 'minion') {
      const s = screenOf(u.x, u.y, unitHeight(u) + 16);
      hpBar(s.x, s.y, 46 * ui, 4, u.hp / u.maxHp, u.hpTrail, u.team === P.team ? '#4a9cff' : '#e8473c');
    } else {
      const s = screenOf(u.x, u.y, unitHeight(u) + 40);
      const w = (u.kind === 'nexus' ? 150 : 116) * ui;
      hpBar(s.x, s.y, w, 9, u.hp / u.maxHp, u.hpTrail, u.team === P.team ? '#4a9cff' : '#e8473c', u.maxHp > 2000 ? 0 : u.maxHp);
    }
  }
  for (const u of G.units) {
    if (u.kind !== 'champ' || u.dead || !visible(u)) continue;
    const c = u.champ!;
    const s = screenOf(u.x, u.y, unitHeight(u) + 34);
    const w = 104 * ui;
    const col = u === P && !demoMode ? '#4fd34a' : u.team === P.team ? '#4a9cff' : '#e8473c';
    hpBar(s.x + 11, s.y, w, 11, u.hp / u.maxHp, u.hpTrail, col, u.maxHp);
    ctx.fillStyle = 'rgba(6,8,10,0.92)';
    ctx.fillRect(s.x + 11 - w / 2 - 2, s.y + 13, w + 4, 5);
    ctx.fillStyle = '#3d8bff';
    ctx.fillRect(s.x + 11 - w / 2, s.y + 14, w * clamp(u.mp / (u.maxMp || 1), 0, 1), 3);
    // level badge
    const bx = s.x + 11 - w / 2 - 22;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(bx, s.y - 4, 19, 19);
    ctx.strokeStyle = '#c8aa6e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.5, s.y - 3.5, 18, 18);
    ctx.fillStyle = '#f0e6d2';
    ctx.font = '700 11px Geist, sans-serif';
    ctx.fillText(String(c.level), bx + 9.5, s.y + 6);
    ctx.font = '600 12px Geist, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(u.name, s.x + 11, s.y - 11);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(u.name, s.x + 11, s.y - 11);
    if (u.stunT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = now * 6 + (i * Math.PI * 2) / 3;
        drawGlow(ctx, s.x + Math.cos(a) * 22, s.y + 26 + Math.sin(a) * 6, 9, '#ffe27a');
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // damage numbers: pop in with overshoot, drift, then fade
  for (const t of G.texts) {
    const age = 1 - t.t;
    const pop = age < 0.14 ? ease.outBack(age / 0.14) : 1;
    ctx.globalAlpha = clamp(t.t / 0.35, 0, 1);
    ctx.font = `800 ${Math.round(t.size * (0.6 + 0.4 * pop) * (age < 0.14 ? 1.15 : 1))}px Geist, sans-serif`;
    const s = screenOf(t.x + t.vx * ease.outCubic(age), t.y, 90);
    const y = s.y - ease.outCubic(age) * 56;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3.5;
    ctx.strokeText(t.text, s.x, y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, s.x, y);
  }
  ctx.globalAlpha = 1;

  const low = !demoMode && !P.dead && P.hp / P.maxHp < 0.3 ? 0.35 + 0.15 * Math.sin(now * 5) : 0;
  const edge = Math.max(low, hurt * 0.6);
  // the red edge is a fixed CSS layer; only its opacity changes (compositor-only, no canvas fill)
  const op = edge > 0.01 ? Math.min(1, edge * 1.6) : 0;
  if (Math.abs(op - vignetteOpacity) > 0.02 || (op === 0 && vignetteOpacity !== 0)) {
    vignetteOpacity = op;
    vignetteEl.style.opacity = op.toFixed(2);
  }

  drawMinimap();
}

const vignetteEl = $('vignette');
let vignetteOpacity = 0;

function drawMinimap() {
  const s = 220 / MAP;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(minimapCanvas, 0, 0, 220, 220);
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
  const vw = W / G.zoom;
  const vh = H / (G.zoom * K);
  mctx.strokeRect((G.cam.x - vw / 2) * s, (G.cam.y - vh / 2) * s, vw * s, vh * s);
}

// Hit-test against the upright body on screen, not just the ground circle.
function hoverUnit(pad = 14): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const u of G.units) {
    if (u.team === G.player.team || !targetable(u)) continue;
    const h = unitHeight(u);
    const foot = screenOf(u.x, u.y, 0);
    const head = screenOf(u.x, u.y, h * 0.85);
    const rad = Math.max(u.r * G.zoom, 14) + pad * 0.5;
    const my = clamp(mouse.y, head.y, foot.y);
    const d = Math.hypot(mouse.x - foot.x, mouse.y - my);
    if (d < rad && d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

const hudCache = new Map<string, string>();
function setText(el: HTMLElement, key: string, v: string) {
  if (hudCache.get(key) === v) return;
  hudCache.set(key, v);
  el.textContent = v;
}
let slotEls: { cd: HTMLElement; cdt: HTMLElement; root: HTMLElement; pips: HTMLElement | null }[] = [];

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
    const cost = i < 4 ? c.def.abilities[i].cost : 0;
    el.innerHTML = `<div class="ico" style="background:radial-gradient(circle at 35% 30%, ${d.color}, #111 85%)">${i > 3 ? '' : d.name}</div><div class="cd"></div><div class="cdt"></div><span class="key">${keys[i]}</span>${
      i < 4 ? `<span class="mana">${cost}</span><div class="pips"></div><button class="plus" title="Learn (Ctrl+${keys[i]})">+</button>` : ''
    }`;
    if (i < 4)
      el.querySelector('.plus')!.addEventListener('click', (e) => {
        e.stopPropagation();
        rankUp(G.player, i);
      });
    ab.appendChild(el);
    slotEls.push({ root: el, cd: el.querySelector('.cd')!, cdt: el.querySelector('.cdt')!, pips: el.querySelector<HTMLElement>('.pips') });
  });
  paintPortrait();
  buildTouch();
  lastGold = c.gold;
  lastCd.clear();
}

// Cooldown just finished: a one-shot glow so the player notices without looking.
const lastCd = new Map<string, number>();
function readyFlash(el: HTMLElement, key: string, v: number) {
  const prev = lastCd.get(key) ?? 0;
  lastCd.set(key, v);
  if (prev > 0 && v <= 0) {
    el.classList.remove('ready');
    void el.offsetWidth;
    el.classList.add('ready');
  }
}
let lastGold = 0;
let lastBuyAt = 0;
function goldPop(gold: number) {
  if (gold - lastGold >= 14) {
    for (const id of ['gold', 'mgold']) {
      const el = $(id);
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }
  lastGold = gold;
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
  goldPop(c.gold);
  $('hptrail').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`;
  setText($('shopgold'), 'sgold', `${gold} gold`);
  const all = [...c.cds, ...c.spellCds];
  const maxes = [...c.def.abilities.map((_, i) => cdOf(c, i)), 180, 150];
  slotEls.forEach((s, i) => {
    const v = all[i];
    readyFlash(s.root, 'slot' + i, v);
    s.cd.style.height = `${v > 0 ? clamp(v / maxes[i], 0, 1) * 100 : 0}%`;
    setText(s.cdt, 'cdt' + i, v > 0 ? String(Math.ceil(v)) : '');
    if (i < 4) {
      s.root.classList.toggle('locked', c.ranks[i] === 0);
      s.root.classList.toggle('nomana', c.ranks[i] > 0 && P.mp < c.def.abilities[i].cost);
      s.root.classList.toggle('learn', canRank(c, i));
      const max = i === 3 ? 3 : 5;
      const pips = Array.from({ length: max }, (_, k) => `<i class="${k < c.ranks[i] ? 'on' : ''}"></i>`).join('');
      if (s.pips && hudCache.get('pips' + i) !== pips) {
        hudCache.set('pips' + i, pips);
        s.pips.innerHTML = pips;
      }
    }
  });
  $('mpfill').style.transform = `scaleX(${clamp(P.mp / (P.maxMp || 1), 0, 1)})`;
  setText($('mptext'), 'mp', `${Math.floor(P.mp)} / ${Math.round(P.maxMp)}`);
  const statsHtml = `<span>AD <b>${Math.round(P.ad)}</b></span><span>AP <b>${Math.round(P.ap)}</b></span><span>Armor <b>${Math.round(P.armor)}</b></span><span>MR <b>${Math.round(P.mr)}</b></span><span>AS <b>${effAS(P).toFixed(2)}</b></span><span>MS <b>${Math.round(effMS(P) || P.ms)}</b></span>`;
  if (hudCache.get('statsHtml') !== statsHtml) {
    hudCache.set('statsHtml', statsHtml);
    $('stats').innerHTML = statsHtml;
  }
  const fresh = performance.now() - lastBuyAt < 400 ? c.items.length - 1 : -1;
  const invHtml = Array.from(
    { length: 6 },
    (_, i) => `<div class="${c.items[i] ? 'full' : ''}${i === fresh ? ' new' : ''}">${c.items[i] ? ITEM_MAP[c.items[i]].name : ''}</div>`,
  ).join('');
  if (hudCache.get('inv') !== invHtml) {
    hudCache.set('inv', invHtml);
    $('inv').innerHTML = invHtml;
  }
  const respawn = $('respawn');
  respawn.classList.toggle('hidden', !P.dead);
  canvas.classList.toggle('dead', P.dead);
  canvas3d.classList.toggle('dead', P.dead);
  if (P.dead) setText(respawn, 'resp', `Respawning in ${Math.ceil(c.respawnT)}`);
  $('recallbar').classList.toggle('hidden', c.recallT <= 0);
  if (c.recallT > 0) $('recallfill').style.transform = `scaleX(${1 - c.recallT / 4})`;
  if (!$('shop').classList.contains('hidden')) renderShop();
  updateTouchHud();
}

function feedMsg(text: string, team: Team | -1) {
  const el = document.createElement('div');
  el.textContent = text;
  if (team !== -1) el.className = team === 0 ? 'b' : 'r';
  const feed = $('feed');
  feed.prepend(el);
  while (feed.children.length > 6) feed.lastChild!.remove();
  setTimeout(() => el.classList.add('out'), 6800);
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
      `<button class="item" data-id="${it.id}" ${!ok || c.gold < it.cost || c.items.length >= 6 || (it.unique && c.items.includes(it.id)) ? 'disabled' : ''}><span class="cost">${it.cost}</span><b>${it.name}</b><small>${it.desc}</small></button>`,
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
  if (running && show === el.classList.contains('hidden')) sfx('click');
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
  if (!canShop() || c.gold < it.cost || c.items.length >= 6 || (it.unique && c.items.includes(it.id))) return;
  c.gold -= it.cost;
  c.items.push(it.id);
  lastBuyAt = performance.now();
  sfx('buy');
  btn.classList.add('bought');
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
canvas.addEventListener('pointerdown', (e) => {
  if (!running) return;
  mouse = { x: e.clientX, y: e.clientY };
  if (e.pointerType === 'touch') {
    const t = hoverUnit(40);
    if (t && !G.player.dead) G.player.champ!.order = { type: 'attack', target: t };
    return;
  }
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
mini.addEventListener('pointerdown', (e) => {
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
  if (k === 'm') return toggleMute();
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
  if (slot >= 0 && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    rankUp(P, slot);
    return;
  }
  if (slot >= 0) {
    if (!cast(P, slot, w.x, w.y)) {
      sfx('nope');
      const a = c.def.abilities[slot];
      if (c.ranks[slot] === 0) addText(P.x, P.y - 60, canRank(c, slot) ? 'Learn it first (Ctrl+key)' : slot === 3 ? 'Learn at level 6' : 'Not learned', '#aaa', 14);
      else if (P.mp < a.cost && c.cds[slot] <= 0) addText(P.x, P.y - 60, 'Not enough mana', '#6fb0ff', 14);
    }
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
  if (G.camLocked || TOUCH) return;
  const m = 24;
  const sp = 1400 * dt;
  if (mouse.x < m) G.cam.x -= sp;
  if (mouse.x > W - m) G.cam.x += sp;
  if (mouse.y < m) G.cam.y -= sp;
  if (mouse.y > H - m) G.cam.y += sp;
  G.cam.x = clamp(G.cam.x, 0, MAP);
  G.cam.y = clamp(G.cam.y, 0, MAP);
}

// ================= touch controls (Wild Rift style) =================
// Left half: floating move joystick. Right side: attack button with abilities arced around it.
// Tap an ability to quick-cast at the best nearby target; drag it to aim; release on ✕ to cancel.
const TOUCH = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
if (TOUCH) document.body.classList.add('touch');

const AIM_DEAD = 16; // px of drag before a press becomes an aimed cast
const AIM_MAX = 80; // px of drag that maps to full range
const joy = { id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
let facing: Vec = { x: 0.7071, y: -0.7071 };
let attackHeld: 'any' | 'minion' | 'tower' | null = null;
let attackTick = 0;
let touchScale = 1;
interface Aim {
  slot: number; // 0-3 abilities, 4 Flash
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  aiming: boolean;
  cancel: boolean;
}
let aim: Aim | null = null;
interface TouchBtn {
  id: string;
  label: string;
  angle: number;
  r: number;
  size: number;
  color: string;
  el?: HTMLElement;
  cd?: HTMLElement;
  cdt?: HTMLElement;
}
let touchBtns: TouchBtn[] = [];

function aimReach(slot: number): number {
  const P = G.player;
  if (slot === 4) return 425;
  const a = P.champ!.def.abilities[slot];
  if (a.kind === 'beam') return 1300;
  if (a.kind === 'bolt') return Math.min(a.range, 1300);
  if (a.kind === 'nova') return a.selfCenter ? 0 : a.range;
  if (a.kind === 'buff') return P.range + 150;
  return a.range;
}

function autoTarget(radius: number, allow: (u: Unit) => boolean = () => true): Unit | null {
  const P = G.player;
  let champ: Unit | null = null;
  let other: Unit | null = null;
  for (const u of G.units) {
    if (u.team === P.team || !targetable(u) || !allow(u)) continue;
    const d = dist(u, P) - u.r;
    if (d > radius) continue;
    if (u.kind === 'champ') {
      if (!champ || u.hp / u.maxHp < champ.hp / champ.maxHp) champ = u;
    } else if (!other || d < dist(other, P) - other.r) other = u;
  }
  return champ ?? other;
}

function aimTarget(a: Aim): Vec {
  const P = G.player;
  const len = Math.hypot(a.dx, a.dy) || 1;
  const gl = Math.hypot(a.dx, a.dy / K) || 1;
  const nx = a.dx / gl;
  const ny = a.dy / K / gl;
  const reach = aimReach(a.slot);
  const def = a.slot < 4 ? P.champ!.def.abilities[a.slot] : null;
  const k = def && def.kind === 'nova' ? Math.min(1, len / AIM_MAX) : 1;
  return { x: P.x + nx * reach * k, y: P.y + ny * reach * k };
}

function quickTarget(slot: number): Vec {
  const P = G.player;
  const reach = aimReach(slot);
  const def = slot < 4 ? P.champ!.def.abilities[slot] : null;
  if (def && (def.kind === 'buff' || def.selfCenter)) return { x: P.x + facing.x, y: P.y + facing.y };
  if (slot !== 4 && def?.kind !== 'dash') {
    const extra = def?.kind === 'nova' ? (def.radius ?? 0) * 0.5 : 0;
    const t = autoTarget(reach + extra, (u) => u.kind === 'champ' || u.kind === 'minion');
    if (t) return { x: t.x, y: t.y };
  }
  return { x: P.x + facing.x * Math.max(reach, 300), y: P.y + facing.y * Math.max(reach, 300) };
}

function touchCast(slot: number, at: Vec) {
  const P = G.player;
  if (slot === 4) castFlash(P, at.x, at.y);
  else if (!cast(P, slot, at.x, at.y)) {
    sfx('nope');
    const c = P.champ!;
    if (c.ranks[slot] === 0) addText(P.x, P.y - 60, canRank(c, slot) ? 'Tap + to learn it' : slot === 3 ? 'Learn at level 6' : 'Not learned', '#aaa', 14);
    else if (P.mp < c.def.abilities[slot].cost && c.cds[slot] <= 0) addText(P.x, P.y - 60, 'Not enough mana', '#6fb0ff', 14);
  }
}

function touchAttack(kind: 'any' | 'minion' | 'tower') {
  const P = G.player;
  if (P.dead) return;
  const radius = P.range + P.r + 260;
  const t =
    kind === 'minion'
      ? autoTarget(radius, (u) => u.kind === 'minion')
      : kind === 'tower'
        ? autoTarget(radius + 300, (u) => u.kind === 'tower' || u.kind === 'nexus')
        : autoTarget(radius);
  if (t) {
    P.champ!.order = { type: 'attack', target: t };
    P.champ!.recallT = 0;
  }
}

// Called every frame before update().
function touchTick(dt: number) {
  if (!TOUCH || !running) return;
  const P = G.player;
  const c = P.champ!;
  const mag = Math.hypot(joy.dx, joy.dy);
  if (joy.id >= 0 && mag > 12 && !P.dead) {
    const gy = joy.dy / K;
    const gm = Math.hypot(joy.dx, gy);
    facing = { x: joy.dx / gm, y: gy / gm };
    c.order = { type: 'move', x: clamp(P.x + facing.x * 160, 30, MAP - 30), y: clamp(P.y + facing.y * 160, 30, MAP - 30) };
    c.recallT = 0;
    return;
  }
  if (attackHeld && (attackTick -= dt) <= 0) {
    attackTick = 0.25;
    touchAttack(attackHeld);
  }
}

function drawAim(ctx: CanvasRenderingContext2D) {
  if (!aim || !aim.aiming) return;
  const P = G.player;
  const t = aimTarget(aim);
  const col = aim.cancel ? '#ff4d4d' : '#ffffff';
  const def = aim.slot < 4 ? P.champ!.def.abilities[aim.slot] : null;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = col;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(P.x, P.y, aimReach(aim.slot), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  if (def && def.kind === 'nova') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(t.x, t.y, def.radius ?? 200, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineWidth = def?.width ?? 50;
    ctx.beginPath();
    ctx.moveTo(P.x, P.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function layoutTouch() {
  touchScale = clamp(Math.min(W, H) / 430, 0.72, 1.15);
  const s = touchScale;
  const cx = 96 * s;
  const cy = 100 * s;
  for (const b of touchBtns) {
    if (!b.el) continue;
    const rad = (b.angle * Math.PI) / 180;
    const x = Math.cos(rad) * b.r * s;
    const y = Math.sin(rad) * b.r * s;
    const size = b.size * s;
    Object.assign(b.el.style, {
      width: `${size}px`,
      height: `${size}px`,
      right: `calc(${cx - x - size / 2}px + env(safe-area-inset-right))`,
      bottom: `calc(${cy + y - size / 2}px + env(safe-area-inset-bottom))`,
      fontSize: `${Math.max(9, size / 6)}px`,
    });
  }
}

function buildTouch() {
  if (!TOUCH) return;
  const wrap = $('tbuttons');
  wrap.innerHTML = '';
  const ab = G.player.champ!.def.abilities;
  touchBtns = [
    { id: 'atk', label: 'ATTACK', angle: 0, r: 0, size: 96, color: '#c8aa6e' },
    { id: 'q', label: ab[0].name, angle: 180, r: 122, size: 62, color: ab[0].color },
    { id: 'w', label: ab[1].name, angle: 140, r: 122, size: 62, color: ab[1].color },
    { id: 'e', label: ab[2].name, angle: 100, r: 122, size: 62, color: ab[2].color },
    { id: 'r', label: ab[3].name, angle: 148, r: 205, size: 68, color: ab[3].color },
    { id: 'd', label: 'Flash', angle: 102, r: 205, size: 48, color: '#fff6a8' },
    { id: 'f', label: 'Heal', angle: 72, r: 200, size: 48, color: '#7dff9c' },
    { id: 'minion', label: 'Minion', angle: 222, r: 100, size: 42, color: '#8fa3b8' },
    { id: 'tower', label: 'Turret', angle: 50, r: 98, size: 42, color: '#b88f8f' },
  ];
  for (const b of touchBtns) {
    const el = document.createElement('div');
    el.className = `tbtn tb-${b.id}`;
    const rs = ['q', 'w', 'e', 'r'].indexOf(b.id);
    el.innerHTML = `<div class="ico" style="background:radial-gradient(circle at 35% 30%, ${b.color}, #111 85%)"></div><span class="lbl">${b.label}</span><div class="cd"></div><div class="cdt"></div>${
      rs >= 0 ? '<div class="tplus">+</div>' : ''
    }`;
    if (rs >= 0)
      el.querySelector('.tplus')!.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (running) rankUp(G.player, rs);
      });
    wrap.appendChild(el);
    b.el = el;
    b.cd = el.querySelector<HTMLElement>('.cd')!;
    b.cdt = el.querySelector<HTMLElement>('.cdt')!;
    bindTouchBtn(b);
  }
  layoutTouch();
}

function bindTouchBtn(b: TouchBtn) {
  const el = b.el!;
  const slot = ['q', 'w', 'e', 'r', 'd'].indexOf(b.id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running || G.player.dead) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
    el.classList.add('down');
    if (b.id === 'atk' || b.id === 'minion' || b.id === 'tower') {
      attackHeld = b.id === 'atk' ? 'any' : b.id;
      attackTick = 0.25;
      touchAttack(attackHeld);
    } else if (b.id === 'f') {
      castHeal(G.player);
    } else if (slot >= 0) {
      const r = el.getBoundingClientRect();
      aim = { slot, cx: r.left + r.width / 2, cy: r.top + r.height / 2, dx: 0, dy: 0, aiming: false, cancel: false };
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!aim || aim.slot !== slot) return;
    aim.dx = e.clientX - aim.cx;
    aim.dy = e.clientY - aim.cy;
    if (!aim.aiming && Math.hypot(aim.dx, aim.dy) > AIM_DEAD) {
      aim.aiming = true;
      $('tcancel').classList.remove('hidden');
    }
    const cr = $('tcancel').getBoundingClientRect();
    aim.cancel = aim.aiming && e.clientX >= cr.left && e.clientX <= cr.right && e.clientY >= cr.top && e.clientY <= cr.bottom;
    $('tcancel').classList.toggle('hot', aim.cancel);
  });
  const release = () => {
    el.classList.remove('down');
    if (b.id === 'atk' || b.id === 'minion' || b.id === 'tower') {
      attackHeld = null;
      return;
    }
    if (!aim || aim.slot !== slot) return;
    if (running && !G.player.dead && !aim.cancel) touchCast(slot, aim.aiming ? aimTarget(aim) : quickTarget(slot));
    aim = null;
    $('tcancel').classList.add('hidden');
    $('tcancel').classList.remove('hot');
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

function updateTouchHud() {
  if (!TOUCH) return;
  const P = G.player;
  const c = P.champ!;
  const maxes = [...c.def.abilities.map((_, i) => cdOf(c, i)), 180, 150];
  const vals = [...c.cds, ...c.spellCds];
  for (const b of touchBtns) {
    const i = ['q', 'w', 'e', 'r', 'd', 'f'].indexOf(b.id);
    if (i < 0 || !b.cd || !b.cdt) continue;
    const v = vals[i];
    b.cd.style.height = `${v > 0 ? clamp(v / maxes[i], 0, 1) * 100 : 0}%`;
    readyFlash(b.el!, 't' + i, v);
    setText(b.cdt, 'tcd' + i, v > 0 ? String(Math.ceil(v)) : '');
    if (i < 4) {
      b.el!.classList.toggle('locked', c.ranks[i] === 0);
      b.el!.classList.toggle('nomana', c.ranks[i] > 0 && P.mp < c.def.abilities[i].cost);
      b.el!.classList.toggle('learn', canRank(c, i));
    }
  }
  setText($('mlevel'), 'mlevel', String(c.level));
  setText($('mgold'), 'mgold', String(Math.floor(c.gold)));
  setText($('mkda'), 'mkda', `${c.kills}/${c.deaths}/${c.assists} · CS ${c.cs}`);
  $('mhpfill').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`;
  $('mmpfill').style.transform = `scaleX(${clamp(P.mp / (P.maxMp || 1), 0, 1)})`;
}

// floating joystick
const joyzone = $('joyzone');
joyzone.addEventListener('pointerdown', (e) => {
  if (!running || joy.id >= 0) return;
  e.preventDefault();
  try {
      joyzone.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  joy.id = e.pointerId;
  joy.bx = e.clientX;
  joy.by = e.clientY;
  joy.dx = joy.dy = 0;
  const base = $('joybase');
  base.style.left = `${e.clientX}px`;
  base.style.top = `${e.clientY}px`;
  base.classList.add('on');
  $('joyknob').style.transform = 'translate(-50%, -50%)';
});
joyzone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  const max = 60 * touchScale;
  let dx = e.clientX - joy.bx;
  let dy = e.clientY - joy.by;
  const d = Math.hypot(dx, dy);
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
  }
  joy.dx = dx;
  joy.dy = dy;
  $('joyknob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
const joyEnd = (e: PointerEvent) => {
  if (e.pointerId !== joy.id) return;
  joy.id = -1;
  joy.dx = joy.dy = 0;
  $('joybase').classList.remove('on');
  const c = G?.player.champ;
  if (c?.order?.type === 'move') c.order = null;
};
joyzone.addEventListener('pointerup', joyEnd);
joyzone.addEventListener('pointercancel', joyEnd);
$('mshop').addEventListener('click', () => toggleShop());
$('mrecall').addEventListener('click', () => running && startRecall(G.player));
window.addEventListener('resize', () => TOUCH && G && layoutTouch());

// ================= menu / end =================
let picked = '';

// ---------- attract mode: a live all-bot match plays behind the menu ----------
let demoMode = false;
let demoRestart = 0;
let demoTarget: Unit | null = null;
let demoSwitchAt = 0;
function startDemo() {
  newGame(CHAMPS[Math.floor(Math.random() * CHAMPS.length)].id);
  G.player.champ!.isPlayer = false;
  G.zoom = TOUCH ? 0.5 : 0.8;
  demoMode = true;
  demoRestart = 0;
  demoTarget = null;
  for (let i = 0; i < 75 * 30; i++) update(1 / 30); // skip the walk to lane
  particles.length = 0;
  const f = demoFocus();
  G.cam = { x: f.x, y: f.y };
}
// Follow whichever champion has the most enemies around; hold each shot for a few seconds.
function demoFocus(): Vec {
  const now = performance.now();
  if (demoTarget && !demoTarget.dead && now < demoSwitchAt) return demoTarget;
  let best: Unit = G.player;
  let bs = -1;
  for (const u of G.units) {
    if (!u.champ || u.dead) continue;
    let n = 0;
    for (const e of G.units)
      if (!e.dead && e.team !== u.team && (e.kind === 'champ' || e.kind === 'minion') && dist(e, u) < 700)
        n += e.kind === 'champ' ? 4 : 1;
    if (n > bs) {
      bs = n;
      best = u;
    }
  }
  demoTarget = best;
  demoSwitchAt = now + 5000;
  return best;
}

function syncMute() {
  for (const id of ['mute', 'mmute']) {
    const b = $<HTMLButtonElement>(id);
    b.textContent = audio.muted ? 'Sound: Off' : 'Sound: On';
    b.setAttribute('aria-pressed', String(audio.muted));
  }
}
function toggleMute() {
  setMuted(!audio.muted);
  syncMute();
  sfx('click');
}
$('mute').addEventListener('click', toggleMute);
$('mmute').addEventListener('click', toggleMute);
syncMute();

function buildMotionToggle() {
  const btn = $<HTMLButtonElement>('motion');
  const sync = () => {
    btn.textContent = settings.reduceMotion ? 'Reduced motion: On' : 'Reduced motion: Off';
    btn.setAttribute('aria-pressed', String(settings.reduceMotion));
    document.body.classList.toggle('reduce', settings.reduceMotion);
  };
  sync();
  btn.addEventListener('click', () => {
    setReduceMotion(!settings.reduceMotion);
    sfx('click');
    sync();
  });
}
function buildDifficulty() {
  try {
    difficulty = DIFFICULTIES.find((d) => d.id === localStorage.getItem('rift-difficulty')) ?? NORMAL;
  } catch {
    difficulty = NORMAL;
  }
  const wrap = $('diff');
  const render = () => {
    wrap.innerHTML =
      DIFFICULTIES.map(
        (d) => `<button data-id="${d.id}" class="${d === difficulty ? 'sel' : ''}">${d.name}</button>`,
      ).join('') + `<p>${difficulty.desc}</p>`;
  };
  render();
  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    difficulty = DIFFICULTIES.find((d) => d.id === b.dataset.id) ?? NORMAL;
    sfx('click');
    try {
      localStorage.setItem('rift-difficulty', difficulty.id);
    } catch {
      // storage unavailable; selection still applies for this session
    }
    render();
  });
}
function buildMenu() {
  const wrap = $('champs');
  wrap.innerHTML = CHAMPS.map(
    (c, i) => `<button class="champ" data-id="${c.id}" style="--i:${i}"><div class="core">
      <div class="orb" style="background:${c.color};--glow:${c.color}">${c.name[0]}</div>
      <h3>${c.name}</h3><div class="role">${c.role} · ${c.ranged ? 'Ranged' : 'Melee'}</div>
      <ul>${c.abilities.map((a, i) => `<li><b>${'QWER'[i]}</b> ${a.name}</li>`).join('')}</ul>
    </div></button>`,
  ).join('');
  applyPortraits();
  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.champ');
    if (!b) return;
    picked = b.dataset.id!;
    sfx('click');
    wrap.querySelectorAll('.champ').forEach((el) => el.classList.toggle('sel', el === b));
    const play = $<HTMLButtonElement>('play');
    play.disabled = false;
    play.textContent = 'Play';
  });
}
function start() {
  if (!picked) return;
  demoMode = false;
  sfx('click');
  $('feed').innerHTML = '';
  newGame(picked);
  if (TOUCH) {
    G.zoom = clamp(Math.min(W, H) / 700, 0.55, 1);
    try {
      void document.documentElement.requestFullscreen?.().then(() =>
        (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}),
      ).catch(() => {});
    } catch {
      // fullscreen not supported (e.g. iOS Safari); play in the browser window
    }
  }
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('hud').classList.remove('hidden');
  running = true;
  audio.gameplay = true;
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', () => {
  $('end').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  running = false;
  audio.gameplay = false;
  startDemo();
});
function showEnd() {
  const won = G.over === G.player.team;
  const c = G.player.champ!;
  $('endtitle').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('endtitle').style.color = won ? '#c8aa6e' : '#ff5a5a';
  $('endstats').innerHTML = `${c.def.name} · Level ${c.level} · ${difficulty.name}<br/>K/D/A ${c.kills} / ${c.deaths} / ${c.assists} · CS ${c.cs}<br/>Game time ${fmtTime(G.t)} · Team kills ${G.kills[0]} – ${G.kills[1]}`;
  toggleShop(false);
  $('end').classList.remove('hidden');
  running = false;
  audio.gameplay = false;
  sfx(won ? 'victory' : 'defeat');
}
buildMenu();
buildDifficulty();
buildMotionToggle();
startDemo();

// ================= loop =================
let last = performance.now();
let debugPaused = false; // test hook: freeze the frame for screenshots
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G && debugPaused) render();
  else if (G) {
    // hit-stop freezes the simulation for a few frames; slow-mo plays the Nexus explosion
    let sim = dt;
    if (hitStop > 0) {
      hitStop -= dt;
      sim = 0;
    } else if (slowmo > 0) {
      slowmo -= dt;
      sim = dt * 0.3;
    }
    hurt = Math.max(0, hurt - dt * 2.5);
    if (running) {
      edgePan(dt);
      touchTick(sim);
      update(sim);
      updateHud();
    } else if (demoMode) {
      update(sim);
      if (G.over !== null && (demoRestart += dt) > 4) startDemo();
    }
    updateParticles(sim);
    updateShake(dt);
    animDt += sim;
    render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/test hook
Object.assign(window, {
  __rift: () => G,
  __riftStep: (seconds: number) => {
    for (let i = 0; i < seconds * 30; i++) {
      touchTick(1 / 30);
      update(1 / 30);
      updateParticles(1 / 30);
      animDt += 1 / 30;
    }
  },
  __riftPause: (on: boolean) => {
    debugPaused = on;
  },
  __riftFrame: () => {
    render();
    updateHud();
  },
});
