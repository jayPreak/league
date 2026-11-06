import './style.css';
import { quote, iconUrl } from './items';
import { openDraft } from './draft';
import { renderPost } from './postmatch';
import type { PostData } from './postmatch';
import { runeByKey, runeIcon } from './runes';
import { defaultPage, loadPage, pageStats } from './runes';
import type { RunePage } from './runes';
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
  TURRET_AT,
  INHIB_AT,
  WAVE_INTERVAL,
} from './data';
import type { ItemDef } from './data';
import { BRUSHES, brushOf, CAMPS, findPath, isWall, lineClear, pushOut } from './terrain';
import type { CampDef, MonsterType } from './terrain';
import {
  addTrauma,
  burst as fxBurst,
  drawAirParticles,
  drawGlow,
  drawGroundParticles,
  ease,
  particles,
  ring as fxRing,
  settings,
  setReduceMotion,
  shake,
  spawn as fxSpawn,
  updateParticles,
  updateShake,
} from './fx';
import { audio, setMuted, sfx as playSfx } from './audio';
import type { SoundName } from './audio';
import { broadcast, cleanCode, dropGuest, hostLobby, joinLobby, leave, MAX_PLAYERS, net, sendTo, sendToHost } from './net';
import type { Cmd, LobbyPlayer, Msg } from './net';
import { ACCEPT_TIME, BOT_MMR, loadRating, mmAccept, mmActive, mmCancel, mmDecline, mmDone, mmQueue, rateResult, saveRating, tierOf } from './mm';
import type { MatchInfo, Mode } from './mm';
import type { BurstOpts, Particle } from './fx';
import { beginDecals, canvas3d, endDecals, HK, K, loadModels, minimapCanvas, renderPortraits, renderWorld, resetUnits, setChampHue, syncUnits, unitHeight } from './world3d';
import type { AbilityDef, ChampDef, DifficultyDef, DmgType, Side, Team, Vec } from './data';
import { KITS, setKitApi } from './kits';
import type { KApi } from './kits/types';
import { REF, evalCalc, dataValue } from './champions/ref';
export type { Unit, Champ, Proj };

// ================= types =================
type Kind = 'champ' | 'minion' | 'tower' | 'nexus' | 'monster' | 'ward';
type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const ROLE_NAME: Record<Role, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'Bot', support: 'Support' };
const ROLE_LANE: Record<Role, number> = { top: 0, jungle: 1, mid: 1, adc: 2, support: 2 };
// structure tiers along each lane, outermost first
const T_OUTER = 0;
const T_INNER = 1;
const T_BASE = 2; // inhibitor turret
const T_INHIB = 3;
const T_NEXUS = 4;
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
  land?: number; // damage dealt in an area when the dash ends
  cb?: (e: Unit) => void; // kit hook: called once per enemy passed through
  end?: () => void; // kit hook: called when the dash finishes
  hitR?: number;
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
  empower: { dmg: number; a: AbilityDef } | null; // bonus on the next basic attack
  role: Role;
  spell2: 'heal' | 'smite';
  azureT: number; // jungle buffs, seconds left
  emberT: number;
  wards: number; // trinket charges
  pinks: number; // Control Wards in the bag
  wardCd: number;
  st: Record<string, any>; // per-kit state (stacks, timers, recast data)
  rc: number[]; // recast windows per slot (seconds left)
  ms: MatchStats;
  itemLog: [number, string][]; // [game second, item id] purchases
  runes: RunePage;
}
export interface MatchStats {
  pc: number; mc: number; tc: number; // damage to champions by type
  obj: number; mon: number; taken: number; healed: number; gold: number; wards: number; ctrl: number; firstDeath: number;
}
interface Unit {
  id: number;
  kind: Kind;
  team: Side;
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
  shield: number; // absorbs damage before health
  shieldT: number;
  rootT: number; // can't move
  stealthT: number; // untargetable + hidden from enemies
  airT: number; // knocked up (stunned while airborne)
  push: { tx: number; ty: number; speed: number } | null; // forced movement: hooks, knockbacks
  path: Vec[]; // waypoints around walls
  pathGoal: Vec | null;
  pathT: number;
  monster: MonsterType | null;
  camp: number; // camp id for monsters
  home: Vec | null; // where a monster resets to
  leashT: number; // seconds since a monster was last hurt by its target
  resetting: boolean;
  heat: number; // turret warm-up against champions
  plates: number; // outer turret plating left
  life: number; // wards: seconds left
  // status effects added for the real-champion kits
  untargT: number; // untargetable (but visible)
  silenceT: number; // cannot cast
  charmT: number; // walks toward charmSrc
  charmSrc: Unit | null;
  drPct: number; // damage reduction fraction while drT > 0
  drT: number;
  shredPct: number; // armor reduction fraction while shredT > 0
  shredT: number;
  rangeBonus: number; // added to attack range
  asRed: number; // attack speed reduction fraction while asRedT > 0
  asRedT: number;
  unslow: number; // immune to slows while > 0
  dots: Dot[];
  marks: Record<string, Mark>;
  petOwner: Unit | null; // summoned packmates / bear: follows and fights for its owner
  petLife: number;
}
interface Dot {
  src: Unit;
  dps: number;
  t: number;
  acc: number;
  type: DmgType;
  tag: string;
}
interface Mark {
  t: number;
  v: number;
  src: Unit | null;
}
interface KFx {
  t: number;
  fn: (dt: number, left: number) => boolean | void;
}
interface Zone {
  x: number;
  y: number;
  r: number;
  t: number; // seconds left
  dur: number;
  tick: number; // next damage tick in
  owner: Unit;
  team: Side;
  a: AbilityDef;
  dmg: number; // per second, or per trigger for traps
  heal: number; // per second to allies
  hit: Set<Unit>;
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
  team: Side;
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
  a?: AbilityDef; // champion skillshots carry their ability for crowd control
  cb?: (e: Unit, p: Proj) => void; // kit hook: replaces the default hit
  onEnd?: (p: Proj) => void;
  maxHits?: number;
  ended?: boolean;
}
interface Pending {
  t: number;
  total: number;
  fn: () => void;
  draw: (ctx: CanvasRenderingContext2D, k: number) => void;
  tele?: Tele; // what guests need to redraw the telegraph
}
type Tele = ['n', number, number, number, string, number] | ['b', number, number, number, number, number, string];
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
  kfx: KFx[];
  tl: { t: number; g: [number, number]; d: [number, number]; k: [number, number] }[]; // 30s timeline samples
  zones: Zone[];
  camps: CampState[];
  drakes: [number, number];
  colossus: [number, number]; // buff ends at this game time
  seen: [Set<Unit>, Set<Unit>]; // what each team can see (fog of war)
  visionT: number;
  platesGone: boolean;
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

// ================= multiplayer relay =================
// The host simulates; every visible effect it makes during simulation is also queued and sent to
// guests with the next snapshot, so their particles, sounds and numbers match the host's.
type Ev =
  | ['b', number, number, number, BurstOpts]
  | ['r', number, number, number, string, number, number]
  | ['p', Partial<Particle> & Vec]
  | ['s', SoundName, number, number, number]
  | ['t', number, number, string, string, number]
  | ['i', number, number, keyof typeof TIER]
  | ['tr', number, number, number]
  | ['f', string, Side | -1]
  | ['a', string, 'good' | 'bad' | 'neutral', string]
  | ['k', number, number, number]
  | ['tv', number, number, number, string, string, number];
let evq: Ev[] = [];
let inSim = false; // true while the host runs simulation code whose effects guests should see
const relaying = () => inSim && net.role === 'host';
// run personal feedback (your level-up, your gold) without sending it to guests
function local<T>(fn: () => T): T {
  const was = inSim;
  inSim = false;
  try {
    return fn();
  } finally {
    inSim = was;
  }
}
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
function burst(x: number, y: number, n: number, o: BurstOpts) {
  if (relaying()) evq.push(['b', r1(x), r1(y), n, o]);
  fxBurst(x, y, n, o);
}
function ring(x: number, y: number, r: number, color: string, life = 0.45, width = 6) {
  if (relaying()) evq.push(['r', r1(x), r1(y), r, color, life, width]);
  fxRing(x, y, r, color, life, width);
}
function spawn(p: Partial<Particle> & Vec) {
  if (relaying() && !p.home) evq.push(['p', p]);
  return fxSpawn(p);
}
const PERSONAL_SFX = new Set<SoundName>(['coin', 'levelUp', 'heal', 'recall', 'recallDone', 'nope', 'click', 'buy', 'good', 'bad', 'victory', 'defeat']);
function sfx(name: SoundName, at?: Vec, vol = 1) {
  if (relaying() && !PERSONAL_SFX.has(name)) evq.push(['s', name, at ? r1(at.x) : 0, at ? r1(at.y) : 0, at ? vol : -vol]);
  playSfx(name, at, vol);
}
function trauma(at: Vec, amt: number) {
  if (relaying()) evq.push(['tr', r1(at.x), r1(at.y), amt]);
  if (nearMe(at)) addTrauma(amt);
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
const lanePoly = (lane: number, team: Side) => (team === 0 ? LANES[lane] : [...LANES[lane]].reverse());
const fmtTime = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ================= state =================
let NEXT_ID = 1;
let G: Game;
let running = false;
let difficulty: DifficultyDef = DIFFICULTIES[1];
const NORMAL = DIFFICULTIES[1];
// Difficulty only tunes the Red team; Blue bots always play at Normal.
// bot difficulty only touches Red bots; human-controlled champions always play at Normal
const diffOf = (u: Unit) => (u.team === 1 && !(u.champ?.isPlayer) ? difficulty : NORMAL);

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
    shield: 0,
    shieldT: 0,
    rootT: 0,
    stealthT: 0,
    airT: 0,
    push: null,
    path: [],
    pathGoal: null,
    pathT: 0,
    monster: null,
    camp: -1,
    home: null,
    leashT: 0,
    resetting: false,
    heat: 0,
    plates: 0,
    life: 0,
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
    untargT: 0,
    silenceT: 0,
    charmT: 0,
    charmSrc: null,
    drPct: 0,
    drT: 0,
    shredPct: 0,
    shredT: 0,
    rangeBonus: 0,
    asRed: 0,
    asRedT: 0,
    unslow: 0,
    dots: [],
    marks: {},
    petOwner: null,
    petLife: 0,
    ...p,
  };
}

function recalc(u: Unit) {
  const c = u.champ!;
  const d = c.def;
  const L = c.level - 1;
  // League's stat growth curve: base + g * (n-1) * (0.7025 + 0.0175 * (n-1))
  const gr = (g: number) => g * L * (0.7025 + 0.0175 * L);
  let hp = d.hp + gr(d.hpL);
  let ad = d.ad + gr(d.adL);
  let ap = 0;
  let armor = d.armor + gr(d.armorL);
  let mr = d.mr + gr(d.mrL);
  let asBonus = gr(d.asL);
  let ms = d.ms;
  let haste = 0;
  let ls = 0;
  let itemMp = 0;
  for (const id of c.items) {
    const it = ITEM_MAP[id];
    itemMp += it.mp ?? 0;
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
  {
    const rs = pageStats(c.runes);
    hp += (rs.hp ?? 0) + (c.st.graspHp ?? 0);
    ad += rs.ad ?? 0;
    ap += rs.ap ?? 0;
    armor += rs.armor ?? 0;
    mr += rs.mr ?? 0;
    asBonus += rs.as ?? 0;
    ms += rs.ms ?? 0;
    haste += rs.haste ?? 0;
    ls += rs.ls ?? 0;
    itemMp += rs.mp ?? 0;
  }
  const oldMp = u.maxMp;
  u.maxMp = d.mp + gr(d.mpL) + itemMp;
  // bonus stats (total minus base) feed the ability ratios
  c.st.baseAd = d.ad + gr(d.adL);
  c.st.baseArmor = d.armor + gr(d.armorL);
  c.st.baseMr = d.mr + gr(d.mrL);
  c.st.baseHp = d.hp + gr(d.hpL);
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
  KITS[d.id]?.passive?.recalc?.(u);
  c.ls = ls;
}

function makeChamp(def: ChampDef, team: Team, role: Role, isPlayer: boolean): Unit {
  const b = BASES[team];
  const lane = ROLE_LANE[role];
  const slot = ROLES.indexOf(role) - 2;
  const dir = team ? -1 : 1;
  const u = makeUnit({
    kind: 'champ',
    team,
    x: b.x + slot * 85 * dir + 140 * dir,
    y: b.y - slot * 85 * dir - 140 * dir,
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
    empower: null,
    role,
    spell2: role === 'jungle' ? 'smite' : 'heal',
    azureT: 0,
    emberT: 0,
    wards: 2,
    pinks: 0,
    wardCd: 0,
    st: {},
    rc: [0, 0, 0, 0],
    ms: { pc: 0, mc: 0, tc: 0, obj: 0, mon: 0, taken: 0, healed: 0, gold: 0, wards: 0, ctrl: 0, firstDeath: 0 },
    itemLog: [],
    runes: isPlayer ? loadPage(def.id, def.tags ?? []) : defaultPage(def.tags ?? []),
  };
  u.maxHp = 0;
  recalc(u);
  if (!isPlayer) autoRank(u);
  return u;
}

interface Human {
  peer: string; // 'host' for the local player
  name: string;
  pick: string;
  team?: Team; // ranked puts humans on both sides; co-op keeps everyone on Blue
  role?: Role | 'fill';
}
// Everyone gets their preferred role if it's free; the rest are filled in order.
function assignRoles(side: Human[]): Map<Human, Role> {
  const out = new Map<Human, Role>();
  const free = new Set<Role>(ROLES);
  for (const h of side)
    if (h.role && h.role !== 'fill' && free.has(h.role)) {
      out.set(h, h.role);
      free.delete(h.role);
    }
  for (const h of side)
    if (!out.has(h)) {
      const r = [...free][0];
      out.set(h, r);
      free.delete(r);
    }
  return out;
}
const ROLE_TAGS: Record<Role, string[]> = {
  top: ['Fighter', 'Tank'],
  jungle: ['Assassin', 'Fighter'],
  mid: ['Mage', 'Assassin'],
  adc: ['Marksman'],
  support: ['Support', 'Tank'],
};
function botPick(role: Role, taken: Set<string>): ChampDef {
  const free = CHAMPS.filter((c) => !taken.has(c.id));
  const fit = free.filter((c) => (c.tags ?? []).some((t) => ROLE_TAGS[role].includes(t)));
  const pool = fit.length ? fit : free.length ? free : CHAMPS;
  return pool[Math.floor(Math.random() * pool.length)];
}
interface DraftPlan { teams: [string[], string[]]; bans: string[] } // champion ids by position (ROLES order)
let draftPlan: DraftPlan | null = null;
let lastBans: string[] | null = null;
const runeInfo = (k: string) => runeByKey(k);
let soloRole: Role | 'fill' = 'mid';
let soloSpell: 'auto' | 'heal' | 'smite' = 'auto'; // player's second summoner spell
function newGame(champId: string, humans: Human[] = []) {
  NEXT_ID = 1;
  cannonCount = 0;
  firstBlood = true;
  streak = 0;
  lastPlayerKill = -99;
  hitStop = slowmo = hurt = 0;
  particles.length = 0;
  shake.trauma = 0;
  resetUnits();
  const units: Unit[] = [];
  const TURRET = [
    { hp: 5000, ad: 170, name: 'Outer' },
    { hp: 3600, ad: 190, name: 'Inner' },
    { hp: 3300, ad: 210, name: 'Inhibitor' },
  ];
  for (const team of [0, 1] as Team[]) {
    for (let lane = 0; lane < 3; lane++) {
      const poly = lanePoly(lane, team);
      const at = lane === 1 ? TURRET_AT.mid : TURRET_AT.side;
      at.forEach((d, tier) => {
        const p = pointAt(poly, d);
        const T = TURRET[tier];
        const tw = makeUnit({
          kind: 'tower',
          team,
          x: p.x,
          y: p.y,
          r: 42,
          hp: T.hp,
          maxHp: T.hp,
          ad: T.ad,
          armor: 40,
          mr: 40,
          range: 700,
          as: 0.83,
          lane,
          tier,
          name: `${LANE_NAMES[lane]} ${T.name} Turret`,
        });
        if (tier === T_OUTER) tw.plates = 5; // plating falls off at 14:00
        units.push(tw);
      });
      // inhibitor: no attack, rebuilds itself, and while down the enemy spawns super minions here
      const ip = pointAt(poly, INHIB_AT);
      units.push(
        makeUnit({ kind: 'tower', team, x: ip.x, y: ip.y, r: 46, hp: 4000, maxHp: 4000, armor: 20, mr: 20, range: 0, lane, tier: T_INHIB, name: `${LANE_NAMES[lane]} Inhibitor` }),
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
          x: nx.x + fx * 330 - fy * side * 210,
          y: nx.y + fy * 330 + fx * side * 210,
          r: 42,
          hp: 2700,
          maxHp: 2700,
          ad: 200,
          armor: 40,
          mr: 40,
          range: 700,
          as: 0.83,
          lane: 1,
          tier: T_NEXUS,
          name: 'Nexus Turret',
        }),
      );
    units.push(
      makeUnit({ kind: 'nexus', team, ...NEXUS[team], r: 90, hp: 5500, maxHp: 5500, name: 'Nexus' }),
    );
  }
  // 5v5: humans take their roles; bots fill the rest with champions suited to the role
  remote.clear();
  const all: Human[] = humans.length ? humans : [{ peer: 'host', name: '', pick: champId, team: 0, role: soloRole }];
  const taken = new Set(all.map((h) => h.pick));
  for (const b of draftPlan?.bans ?? []) taken.add(b);
  const slots: Unit[] = [];
  for (const team of [0, 1] as Team[]) {
    const side = all.filter((h) => (h.team ?? 0) === team);
    const roles = assignRoles(side);
    for (const role of ROLES) {
      const h = side.find((x) => roles.get(x) === role);
      if (h) {
        const def = CHAMPS.find((c) => c.id === h.pick) ?? botPick(role, taken);
        taken.add(def.id);
        const u = makeChamp(def, team, role, true);
        if (h.name) u.name = h.name;
        if (h.peer === 'host' && soloSpell !== 'auto') u.champ!.spell2 = soloSpell;
        if (h.peer === 'host') slots.push(u);
        else remote.set(h.peer, u);
        units.push(u);
      } else {
        const planned = draftPlan && CHAMPS.find((c) => c.id === draftPlan!.teams[team][ROLES.indexOf(role)]);
        const def = planned ?? botPick(role, taken);
        taken.add(def.id);
        units.push(makeChamp(def, team, role, false));
      }
    }
  }
  const player = slots[0];
  if (!player) throw new Error('host has no champion');

  G = {
    t: 0,
    units,
    projs: [],
    pending: [],
    kfx: [],
    tl: [],
    zones: [],
    camps: [],
    drakes: [0, 0],
    colossus: [0, 0],
    seen: [new Set(), new Set()],
    visionT: 0,
    platesGone: false,
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
    zoom: baseZoom(),
    marker: null,
    focus: null,
  };
  G.camps = CAMPS.map((def) => ({ def, next: def.first, mobs: [], announced: false }));
  for (const u of units) if (u.champ && u !== player) aiShop(u);
  buildHud();
  feedMsg(`Welcome to the Rift (${difficulty.name}). Minions spawn in 8 seconds.`, -1);
}

// ================= combat =================
function targetable(t: Unit): boolean {
  if (t.dead || t.stealthT > 0 || t.untargT > 0) return false;
  if (t.kind === 'tower' || t.kind === 'nexus') return G.open.has(t);
  return true;
}

// Structures open in order: outer -> inner -> inhibitor per lane; any inhibitor opens the nexus
// turrets; both nexus turrets open the nexus.
function refreshOpenStructures() {
  G.open.clear();
  const down = (team: Side, tier: number, lane?: number) =>
    G.units.some((o) => o.kind === 'tower' && o.team === team && o.tier === tier && o.dead && (lane === undefined || o.lane === lane));
  for (const t of G.units) {
    if (t.dead) continue;
    if (t.kind === 'tower') {
      if (t.tier === T_OUTER || (t.tier <= T_INHIB && down(t.team, t.tier - 1, t.lane)) || (t.tier === T_NEXUS && down(t.team, T_INHIB))) G.open.add(t);
    } else if (t.kind === 'nexus') {
      if (G.units.filter((o) => o.kind === 'tower' && o.team === t.team && o.tier === T_NEXUS && o.dead).length >= 2) G.open.add(t);
    }
  }
}

const effAS = (u: Unit) => Math.min(2.5, u.as * (1 + (u.champ?.buffs.reduce((s, b) => s + b.as, 0) ?? 0)) * (u.asRedT > 0 ? 1 - u.asRed : 1));
function effMS(u: Unit): number {
  if (u.stunT > 0 || u.rootT > 0) return 0;
  let ms = u.ms * (1 + (u.champ?.buffs.reduce((s, b) => s + b.ms, 0) ?? 0));
  if (u.slowT > 0 && u.unslow <= 0) ms *= 1 - u.slowAmt;
  return ms;
}

function addText(x: number, y: number, text: string, color: string, size = 15) {
  if (relaying()) evq.push(['t', r1(x), r1(y), text, color, size]);
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
const nearMe = (p: Vec) => !!G && dist(p, G.cam) < 1300 / G.zoom;
// effects are created if anyone could see them: the host camera or any remote player's champion
const onScreen = (p: Vec) => nearMe(p) || (net.role === 'host' && remoteUnits().some((u) => dist(p, u) < 1400));
const TIER = { small: 0.12, medium: 0.3, large: 0.62 };
function impact(at: Vec, tier: keyof typeof TIER) {
  if (relaying()) evq.push(['i', r1(at.x), r1(at.y), tier]);
  if (nearMe(at)) addTrauma(TIER[tier]);
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
  if (relaying()) evq.push(['a', text, tone, sub]);
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

type DmgFrom = 'attack' | 'spell' | 'dot';
// ---- keystone runes (the simulated subset; see src/runes.ts) ----
function runeOnDeal(src: Unit, t: Unit, dmg: number, type: DmgType, from: DmgFrom) {
  const c = src.champ;
  if (!c || src.dead || from === 'dot' || t.kind !== 'champ' || t.team === src.team) return;
  const k = c.runes.keystone;
  const st = c.st;
  const now = G.t;
  const L = c.level;
  const lv = (a: number, b: number) => a + ((b - a) * (L - 1)) / 17;
  const bonusAd = src.ad - (st.baseAd ?? src.ad);
  const adType: DmgType = src.ap > bonusAd ? 'magic' : 'phys';
  const rune = (amt: number, label: string) => {
    dealDamage(src, t, amt, adType, 'dot');
    local(() => addText(t.x, t.y - t.r - 30, label, '#ffe27a', 12));
  };
  const ready = (n: string, cd: number) => {
    if ((st[n] ?? 0) > now) return false;
    st[n] = now + cd;
    return true;
  };
  const hits = (n: string, win: number, push = true) => {
    const arr: { t: number; id: number }[] = (st[n] ?? []).filter((h: { t: number; id: number }) => now - h.t < win && h.id === t.id);
    if (push) arr.push({ t: now, id: t.id });
    st[n] = arr;
    return arr.length;
  };
  switch (k) {
    case 'Electrocute':
      if (hits('elH', 3) >= 3 && ready('elCd', 25)) {
        st.elH = [];
        rune(lv(30, 180) + 0.4 * bonusAd + 0.25 * src.ap, 'Electrocute');
      }
      break;
    case 'PressTheAttack':
      if (from === 'attack' && hits('ptaH', 4) >= 3 && ready('ptaCd', 6)) {
        st.ptaH = [];
        rune(lv(40, 174), 'Press the Attack');
        t.marks.pta = { t: 6, v: 0.08, src };
      }
      break;
    case 'PhaseRush':
      if (hits('prH', 3) >= 3 && ready('prCd', 15)) {
        st.prH = [];
        c.buffs.push({ as: 0, ms: 0.25, t: 3 });
      }
      break;
    case 'FleetFootwork':
      if (from === 'attack' && (st.ff = (st.ff ?? 0) + 1) >= 6) {
        st.ff = 0;
        heal(src, lv(10, 70) + 0.1 * bonusAd + 0.05 * src.ap);
        c.buffs.push({ as: 0, ms: 0.2, t: 1 });
      }
      break;
    case 'GraspOfTheUndying':
      if (from === 'attack' && ready('grCd', 4)) {
        dealDamage(src, t, src.maxHp * (c.def.ranged ? 0.02 : 0.04), 'magic', 'dot');
        heal(src, src.maxHp * 0.02);
        st.graspHp = (st.graspHp ?? 0) + 5;
        src.maxHp += 5;
      }
      break;
    case 'ArcaneComet':
      if (from === 'spell' && ready('acCd', 12)) rune(lv(30, 100) + 0.2 * bonusAd + 0.15 * src.ap, 'Arcane Comet');
      break;
    case 'HailOfBlades':
      if (from === 'attack' && ready('hobCd', 12)) c.buffs.push({ as: 1.0, ms: 0, t: 3 });
      break;
    case 'Conqueror': {
      if (now > (st.conqT ?? 0)) st.conq = 0;
      st.conqT = now + 5;
      st.conq = Math.min(10, (st.conq ?? 0) + (from === 'attack' ? 2 : 1));
      const extra = dmg * 0.012 * st.conq;
      if (extra >= 1) dealDamage(src, t, extra, adType, 'dot');
      if (st.conq >= 10) heal(src, extra * 0.08);
      break;
    }
    case 'LethalTempo':
      if (from === 'attack') {
        st.ltT = now + 6;
        if ((st.lt = Math.min(6, (st.lt ?? 0) + 1)) < 6) c.buffs.push({ as: 0.08, ms: 0, t: 6 });
      }
      break;
    case 'DarkHarvest':
      if (t.hp / t.maxHp < 0.5 && ready('dhCd', 40)) rune(lv(40, 100) + 0.25 * src.ap + 0.2 * bonusAd, 'Dark Harvest');
      break;
    case 'GlacialAugment':
      if (from === 'attack' && ready('gaCd', 6)) {
        t.slowAmt = Math.max(t.slowT > 0 ? t.slowAmt : 0, 0.3);
        t.slowT = Math.max(t.slowT, 1.5);
      }
      break;
  }
}
function dealDamage(src: Unit, t: Unit, amt: number, type: DmgType, from: DmgFrom = 'spell'): number {
  if (!targetable(t) || amt <= 0) return 0;
  if (t.kind === 'ward') amt = t.maxHp > 0 ? 1 : amt; // wards lose one health per hit, like the real game
  if (t.champ) amt = KITS[t.champ.def.id]?.passive?.onTaken?.(t, src, amt, type) ?? amt;
  let res = type === 'phys' ? t.armor : type === 'magic' ? t.mr : 0;
  if (type === 'phys' && t.shredT > 0) res *= 1 - t.shredPct;
  if (type === 'phys' && src.champ) res *= 1 - (KITS[src.champ.def.id]?.passive?.armorPen?.(src, t) ?? 0);
  if (t.drT > 0) amt *= 1 - t.drPct;
  if (t.marks.pta && t.marks.pta.t > 0) amt *= 1 + t.marks.pta.v;
  if (t.champ?.runes.keystone === 'Aftershock' && (t.stunT > 0 || t.rootT > 0)) amt *= 0.8;
  let mult = src.champ ? diffOf(src).dmg : 1;
  // Dragon: each drake the team owns adds 5% damage
  if (src.champ && src.team < 2) mult *= 1 + 0.05 * G.drakes[src.team as Team];
  if (src.champ && t.kind === 'monster' && src.champ.spell2 === 'smite') mult *= 1.75; // jungle companion: junglers clear faster
  // Baron Nashor: empowered minions near the team's champions
  if (src.kind === 'minion' && colossusOn(src.team) && G.units.some((c) => c.champ && !c.dead && c.team === src.team && dist(c, src) < 900)) mult *= 1.5;
  if (t.kind === 'minion' && colossusOn(t.team) && G.units.some((c) => c.champ && !c.dead && c.team === t.team && dist(c, t) < 900)) mult *= 0.6;
  const dmg = amt * mult * (100 / (100 + Math.max(0, res)));
  if (src.champ && dmg > 0) KITS[src.champ.def.id]?.passive?.onDealt?.(src, t, dmg, type, from);
  if (src.champ && dmg > 0) runeOnDeal(src, t, dmg, type, from);
  if (dmg > 0 && from !== 'dot') {
    // Molten Shield: attackers are burned
    const rf = t.marks.reflect;
    if (rf?.src && src.team !== t.team && src.kind !== 'tower' && !src.dead) dealDamage(rf.src, src, rf.v, 'magic', 'dot');
    // Sunlight: an ally's damage cashes in the mark
    const sun = t.marks.sun;
    if (sun?.src && src.champ && src !== sun.src && src.team === sun.src.team) {
      delete t.marks.sun;
      dealDamage(sun.src, t, sun.v, 'magic', 'dot');
    }
  }
  {
    const own = src.champ ? src : src.petOwner?.champ ? src.petOwner : null;
    if (own) {
      const m = own.champ!.ms;
      if (t.kind === 'champ') m[type === 'phys' ? 'pc' : type === 'magic' ? 'mc' : 'tc'] += dmg;
      else if (t.kind === 'tower' || t.kind === 'nexus') m.obj += dmg;
      else if (t.kind === 'minion' || t.kind === 'monster') m.mon += dmg;
    }
    if (t.champ) t.champ.ms.taken += dmg;
  }
  const soak = Math.min(t.shield, dmg);
  t.shield -= soak;
  t.hp -= dmg - soak;
  if (t.kind === 'monster' && src.kind === 'champ') monsterAggro(t, src);
  if (t.plates > 0 && src.champ) checkPlates(t);
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
  // damage numbers are personal: each player sees what they deal and take
  const P = G.player;
  for (const v of [P, ...remoteUnits()]) {
    if ((src !== v && t !== v) || dmg < 1) continue;
    const col = t === v ? '#ff6b6b' : type === 'magic' ? '#c69bff' : type === 'true' ? '#ffffff' : '#ffd27a';
    const size = t.kind === 'champ' ? 17 : 13;
    if (v === P) local(() => addText(t.x, t.y - t.r - 14, String(Math.round(dmg)), col, size));
    else if (relaying()) evq.push(['tv', v.id, r1(t.x), r1(t.y - t.r - 14), String(Math.round(dmg)), col, size]);
  }
  if (t.hp <= 0) kill(t, src);
  return dmg;
}

function heal(u: Unit, amt: number) {
  const before = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + amt);
  if (u.champ) u.champ.ms.healed += Math.max(0, u.hp - before);
}

// ---------- ability ranks: one point per level; basics cap at ceil(level/2), R at 6/11/16 ----------
const rankCap = (lvl: number, slot: number) => (slot === 3 ? (lvl >= 16 ? 3 : lvl >= 11 ? 2 : lvl >= 6 ? 1 : 0) : Math.min(5, Math.ceil(lvl / 2)));
const skillPoints = (c: Champ) => c.level - c.ranks.reduce((a, b) => a + b, 0);
const canRank = (c: Champ, slot: number) => skillPoints(c) > 0 && c.ranks[slot] < rankCap(c.level, slot);
function rankUp(u: Unit, slot: number): boolean {
  const c = u.champ!;
  if (!canRank(c, slot)) return false;
  c.ranks[slot]++;
  if (G && u === G.player)
    local(() => {
      sfx('click');
      if (slot === 3 && c.ranks[3] === 1) feedMsg('Ultimate learned! Press R.', -1);
    });
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
    if (u === G.player) local(() => levelUpFx(u));
  }
  if (!c.isPlayer) autoRank(u);
}
function levelUpFx(u: Unit) {
  const c = u.champ!;
  {
    {
      const pt = $('portrait');
      pt.classList.remove('lvlup');
      void pt.offsetWidth;
      pt.classList.add('lvlup');
      sfx('levelUp');
      addText(u.x, u.y - 60, `LEVEL ${c.level}`, '#ffe27a', 20);
      if (c.level === 6) feedMsg(TOUCH ? 'Ultimate ready to learn: tap + on it.' : 'Ultimate ready to learn: Ctrl+R or click +.', -1);
    }
  }
}
const xpNeed = (lvl: number) => 180 + lvl * 100;

function giveGold(u: Unit, amt: number) {
  amt = Math.round(amt * diffOf(u).gold);
  u.champ!.gold += amt;
  u.champ!.ms.gold += amt;
  if (u === G.player) local(() => addText(u.x, u.y - 50, `+${amt}g`, '#ffd700', 14));
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
    trauma(t, 0.9);
  }
}

// Kill announcements are personal ("You have slain…"), so guests rebuild them from the kill event.
function announceKill(killer: Unit, t: Unit, first: boolean) {
  const P = G.player;
  if (killer === P) {
    streak = G.t - lastPlayerKill < 10 ? streak + 1 : 1;
    lastPlayerKill = G.t;
    const multi = ['', '', 'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill'][Math.min(streak, 5)];
    announce(first ? 'First Blood' : multi || 'You have slain an enemy', 'good', first ? `${t.name} has fallen` : '');
    freeze(0.09);
  } else if (t === P) {
    announce('You have been slain', 'bad', `by ${killer.name}`);
    freeze(0.07);
  } else if (first) announce('First Blood', killer.team === P.team ? 'good' : 'bad', `${killer.name} slew ${t.name}`);
  else if (killer.team === P.team) announce('An enemy has been slain', 'good');
  else announce('An ally has been slain', 'bad');
  feedMsg(`${killer.name}${killer === G.player ? ' (you)' : ''} slew ${t.name}${t === G.player ? ' (you)' : ''}`, killer.team);
}

function kill(t: Unit, src: Unit) {
  t.dead = true;
  t.shield = t.shieldT = t.rootT = t.stealthT = t.airT = 0;
  t.push = null;
  if (t.champ) t.champ.empower = null;
  t.hp = 0;
  let killer: Unit | null = src.champ ? src : null;
  if (!killer && t.champ) {
    let best = -Infinity;
    for (const [d, time] of t.champ.damagers) if (G.t - time < 10 && time > best) [best, killer] = [time, d];
  }
  const foes = G.units.filter((c) => c.champ && !c.dead && c.team !== t.team && dist(c, t) < 1400);
  if (t.champ && t.kind === 'champ') {
    for (const [d, time] of t.champ.damagers) if (d.champ && G.t - time < 10) KITS[d.champ.def.id]?.passive?.onKill?.(d, t, d !== src);
  } else if (src.champ && t.kind !== 'ward') KITS[src.champ.def.id]?.passive?.onLastHit?.(src, t);

  deathFx(t);
  if (t.kind === 'monster') {
    monsterKilled(t, killer);
    return;
  }
  if (t.kind === 'ward' || t.petOwner) return;
  // champions drop their jungle blessings to whoever kills them
  if (t.champ && killer?.champ) {
    if (t.champ.azureT > 0) killer.champ.azureT = Math.max(killer.champ.azureT, t.champ.azureT);
    if (t.champ.emberT > 0) killer.champ.emberT = Math.max(killer.champ.emberT, t.champ.emberT);
  }
  if (t.champ) t.champ.azureT = t.champ.emberT = 0;
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
    c.respawnT = 8 + c.level * 2.5;
    c.order = null;
    c.dash = null;
    c.buffs = [];
    c.recallT = 0;
    c.retreating = false;
    if (killer && killer.team !== t.team) {
      killer.champ!.kills++;
      G.kills[killer.team as Team]++;
      giveGold(killer, 300);
      for (const [d, time] of c.damagers) {
        if (d !== killer && G.t - time < 10) {
          d.champ!.assists++;
          giveGold(d, 150);
        }
      }
      for (const f of foes) gainXp(f, (140 + 30 * c.level) / Math.max(1, foes.length * 0.75));
      if (relaying()) evq.push(['k', killer.id, t.id, firstBlood ? 1 : 0]);
      const fb = firstBlood;
      local(() => announceKill(killer!, t, fb));
      firstBlood = false;
    } else feedMsg(`${t.name} was executed`, (1 - t.team) as Team);
    c.damagers.clear();
  } else if (t.kind === 'tower') {
    for (const c of G.units) if (c.champ && c.team !== t.team) giveGold(c, t.tier === T_INHIB ? 50 : t.tier === T_OUTER ? 250 : 150);
    feedMsg(`${TEAM_NAME[1 - t.team]} destroyed the ${TEAM_NAME[t.team]} ${t.name}`, (1 - t.team) as Team);
    const mine = t.team === G.player.team;
    if (t.tier === T_INHIB) {
      t.reviveT = 300;
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
          trauma(t, 0.45);
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
  if (u.kind === 'minion' && t.kind === 'champ' && !u.petOwner) dmg *= 0.6;
  if (u.kind === 'tower' && t.kind === 'champ') {
    dmg *= 1 + u.heat;
    u.heat = Math.min(1.2, u.heat + 0.4); // turret warm-up: +40% per consecutive shot on a champion
  } else if (u.kind === 'tower') u.heat = 0;
  if (u.kind === 'monster' && t.champ?.spell2 === 'smite') dmg *= 0.55; // and take less from monsters
  const ang = Math.atan2(t.y - u.y, t.x - u.x);
  u.lunge = 1;
  u.revealT = 1.2;
  u.stealthT = 0;
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
  const emp = u.champ?.empower;
  const done = dealDamage(u, t, dmg, type, 'attack');
  if (u.champ) KITS[u.champ.def.id]?.passive?.onAttack?.(u, t, done);
  // Ember blessing: attacks burn and slow
  if (u.champ && u.champ.emberT > 0 && !t.dead && (t.kind === 'champ' || t.kind === 'monster' || t.kind === 'minion')) {
    dealDamage(u, t, 8 + 2 * u.champ.level, 'true');
    t.slowAmt = Math.max(t.slowT > 0 ? t.slowAmt : 0, 0.1);
    t.slowT = Math.max(t.slowT, 1);
  }
  if (emp && !t.dead && t.kind !== 'tower' && t.kind !== 'nexus') {
    u.champ!.empower = null;
    hitEnemy(u, t, emp.a, emp.dmg);
    if (onScreen(t)) {
      ring(t.x, t.y, t.r + 30, emp.a.color, 0.3, 7);
      burst(t.x, t.y, 12, { kind: 'ember', color: emp.a.color, speed: 320, life: 0.35, size: 4, drag: 5 });
    }
  }
  if (u.champ && u.champ.ls > 0 && !u.dead) heal(u, done * u.champ.ls);
}

function tryAttack(u: Unit, t: Unit) {
  if (u.atkCd > 0) return;
  performAttack(u, t);
  u.atkCd = 1 / effAS(u);
}

const inRange = (u: Unit, t: Unit) => dist(u, t) <= u.range + u.rangeBonus + u.r + t.r;

// Walks toward (x, y), routing around jungle walls with A* when there's no straight line.
function moveToward(u: Unit, x: number, y: number, dt: number, speedMul = 1): boolean {
  let tx = x;
  let ty = y;
  const goal = { x, y };
  if (!lineClear(u, goal, 60)) {
    if (!u.pathGoal || dist(u.pathGoal, goal) > 140 || u.pathT <= 0 || !u.path.length) {
      u.path = findPath(u, goal);
      u.pathGoal = goal;
      u.pathT = 1.2;
    }
    while (u.path.length > 1 && dist(u, u.path[0]) < 40) u.path.shift();
    if (u.path.length) {
      tx = u.path[0].x;
      ty = u.path[0].y;
    }
  } else if (u.path.length) {
    u.path = [];
    u.pathGoal = null;
  }
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  const step = effMS(u) * speedMul * dt;
  if (d <= step || d < 1) {
    u.x = tx;
    u.y = ty;
    if (tx !== x || ty !== y) u.path.shift();
    return tx === x && ty === y;
  }
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  return false;
}

function nearestEnemy(u: Unit, radius: number, pred: (e: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bd = radius;
  for (const e of G.units) {
    // monsters are only fought on purpose; fogged enemies can't be auto-targeted
    if (e.team === u.team || e.kind === 'monster' || e.kind === 'ward' || !targetable(e) || !pred(e) || !isSeen(u.team, e)) continue;
    const d = dist(u, e) - e.r;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function towerCovering(p: Vec, towerTeam: Side, pad = 0): Unit | null {
  for (const t of G.units)
    if (t.kind === 'tower' && !t.dead && t.team === towerTeam && dist(t, p) <= t.range + pad) return t;
  return null;
}

// ================= abilities =================
function abilityDamage(u: Unit, a: AbilityDef, slot: number): number {
  const rank = Math.max(1, u.champ!.ranks[slot]);
  if (a.perRank) return a.base + a.perLvl * (rank - 1) + a.adR * u.ad + a.apR * u.ap;
  return (a.base + a.perLvl * (u.champ!.level - 1)) * rankMul(slot, rank) + a.adR * u.ad + a.apR * u.ap;
}

function hitEnemy(u: Unit, e: Unit, a: AbilityDef, dmg: number, from: Vec = u) {
  if (a.execute && e.kind === 'champ') dmg += (e.maxHp - e.hp) * a.execute;
  dealDamage(u, e, dmg, a.dmgType);
  const champ = e.kind === 'champ' || e.kind === 'minion';
  if (!champ) return;
  if (a.slow) {
    e.slowAmt = a.slow;
    e.slowT = a.slowT ?? 1;
  }
  if (a.stun) e.stunT = Math.max(e.stunT, a.stun);
  if (a.root) e.rootT = Math.max(e.rootT, a.root);
  if (a.knockup) {
    e.stunT = Math.max(e.stunT, a.knockup);
    e.airT = Math.max(e.airT, a.knockup);
  }
  if (a.hook && !u.dead) {
    const d = dist(e, u) || 1;
    const stop = u.r + e.r + 10;
    if (d > stop) e.push = { tx: u.x + ((e.x - u.x) / d) * stop, ty: u.y + ((e.y - u.y) / d) * stop, speed: 1800 };
    e.stunT = Math.max(e.stunT, Math.min(1.2, d / 1800 + (a.stun ?? 0)));
  }
  if (a.knockback) {
    const d = dist(e, from) || 1;
    e.push = {
      tx: clamp(e.x + ((e.x - from.x) / d) * a.knockback, 40, MAP - 40),
      ty: clamp(e.y + ((e.y - from.y) / d) * a.knockback, 40, MAP - 40),
      speed: 1400,
    };
    e.stunT = Math.max(e.stunT, a.knockback / 1400);
  }
  if (e.champ?.dash && (a.stun || a.knockup || a.hook || a.knockback)) e.champ.dash = null; // hard CC interrupts dashes
}

const shieldOf = (u: Unit, a: AbilityDef, slot: number) =>
  ((a.shield ?? 0) + (a.shieldL ?? 0) * (u.champ!.level - 1)) * rankMul(slot, Math.max(1, u.champ!.ranks[slot])) + a.apR * u.ap * (a.kind === 'ally' ? 1 : 0.5);
const healOf = (u: Unit, a: AbilityDef, slot: number, base: number) =>
  (base + (a.healL ?? 0) * (u.champ!.level - 1)) * rankMul(slot, Math.max(1, u.champ!.ranks[slot])) + a.apR * u.ap;
function giveShield(t: Unit, amt: number, time: number, color: string) {
  t.shield = Math.max(t.shield, amt);
  t.shieldT = Math.max(t.shieldT, time);
  if (onScreen(t)) ring(t.x, t.y, t.r + 22, color, 0.4, 6);
}

function enemiesIn(team: Side, test: (e: Unit) => boolean): Unit[] {
  return G.units.filter((e) => e.team !== team && (e.kind === 'champ' || e.kind === 'minion' || e.kind === 'monster') && targetable(e) && test(e));
}

const costOf = (c: Champ, slot: number) => {
  const a = c.def.abilities[slot];
  return a.costs ? a.costs[Math.max(0, Math.min(a.costs.length - 1, c.ranks[slot] - 1))] : a.cost;
};
// Real-champion abilities: numbers from the reference data, behaviour from src/kits.
function castKit(u: Unit, slot: number, tx: number, ty: number): boolean {
  const c = u.champ!;
  const a = c.def.abilities[slot];
  const kit = KITS[c.def.id];
  const recast = c.rc[slot] > 0;
  if (u.dead || u.stunT > 0 || u.silenceT > 0 || u.charmT > 0 || c.dash) return false;
  if (!recast && (c.cds[slot] > 0 || c.ranks[slot] === 0 || u.mp < costOf(c, slot))) return false;
  const handler = kit?.cast[slot];
  if (!handler) return false;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const rank = Math.max(1, c.ranks[slot]);
  u.stealthT = 0; // casting breaks camouflage; kits that grant it set it again
  const res = handler({ u, c, slot, rank, a, tx, ty, nx: dx / d, ny: dy / d, d, recast });
  if (res === false) return false; // handler refused (no valid target): nothing spent
  if (!recast && !(res && (res as any).free)) {
    u.mp -= costOf(c, slot);
    u.revealT = 1.2;
    c.recallT = 0;
  }
  u.act = `cast${slot}`;
  u.actN++;
  sfx(({ bolt: 'bolt', nova: 'nova', dash: 'dash', buff: 'buff', beam: 'beamCharge', zone: 'nova', ally: 'buff' } as const)[a.kind], u, u === G.player ? 1 : 0.6);
  if (res && res.recast) {
    c.rc[slot] = res.recast;
    // keepCd: the cooldown already runs while the recast window is open (Zed's shadows, Ahri's dashes)
    c.st['keepCd' + slot] = !!res.keepCd;
    c.cds[slot] = res.keepCd ? (res.cd ?? cdOf(c, slot)) : 0.25;
  } else {
    c.rc[slot] = 0;
    if (c.st['keepCd' + slot]) c.st['keepCd' + slot] = false; // cooldown has been running since the first cast
    else c.cds[slot] = res && res.cd !== undefined ? res.cd : cdOf(c, slot);
  }
  KITS[c.def.id]?.passive?.onCast?.(u, slot);
  return true;
}

function cast(u: Unit, slot: number, tx: number, ty: number): boolean {
  const c = u.champ!;
  const a = c.def.abilities[slot];
  if (a.script) return castKit(u, slot, tx, ty);
  if (u.dead || u.stunT > 0 || c.cds[slot] > 0 || c.dash) return false;
  if (c.ranks[slot] === 0 || u.mp < a.cost) return false;
  u.mp -= a.cost;
  u.revealT = 1.2;
  if (!a.stealth) u.stealthT = 0;
  c.recallT = 0;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const dmg = abilityDamage(u, a, slot);
  if (a.kind !== 'buff' && a.kind !== 'ally' && !a.selfCenter) u.face = Math.atan2(ny, nx);
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
        a,
      });
      break;
    case 'zone': {
      const reach = Math.min(d, a.range);
      const zx = clamp(u.x + nx * reach, 40, MAP - 40);
      const zy = clamp(u.y + ny * reach, 40, MAP - 40);
      G.zones.push({
        x: zx,
        y: zy,
        r: a.radius ?? 250,
        t: a.dur ?? 3,
        dur: a.dur ?? 3,
        tick: a.once ? 0.6 : 0.25, // traps arm after a moment
        owner: u,
        team: u.team,
        a,
        dmg,
        heal: a.allyHeal ? healOf(u, a, slot, a.allyHeal) : 0,
        hit: new Set(),
      });
      if (onScreen({ x: zx, y: zy })) ring(zx, zy, a.radius ?? 250, a.color, 0.45, 8);
      break;
    }
    case 'ally': {
      const rad = a.radius ?? 600;
      for (const al of G.units) {
        if (al.dead || al.team !== u.team || al.kind !== 'champ' || dist(al, u) > rad) continue;
        if (a.heal) heal(al, healOf(u, a, slot, a.heal));
        if (a.shield) giveShield(al, shieldOf(u, a, slot), a.shieldT ?? 3, a.color);
        if (a.buffAs || a.buffMs) al.champ!.buffs.push({ as: a.buffAs ?? 0, ms: a.buffMs ?? 0, t: a.buffT ?? 3 });
        if (onScreen(al))
          for (let i = 0; i < 8; i++)
            spawn({ kind: a.heal ? 'plus' : 'ember', x: al.x + (Math.random() - 0.5) * 60, y: al.y + (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 80, life: 0.7, size: 4.5, color: a.color, drag: 1.5 });
      }
      if (onScreen(u)) ring(u.x, u.y, rad, a.color, 0.5, 6);
      break;
    }
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
          for (const e of enemiesIn(u.team, (e) => dist(e, { x: px, y: py }) <= rad + e.r)) hitEnemy(u, e, a, dmg, { x: px, y: py });
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
          drawNovaTele(ctx, px, py, rad, a.color, k);
        },
        tele: ['n', r1(cx), r1(cy), rad, a.color, a.selfCenter ? u.id : 0],
      });
      break;
    }
    case 'dash': {
      const reach = Math.min(d, a.range);
      c.dash = {
        tx: clamp(u.x + nx * reach, 40, MAP - 40),
        ty: clamp(u.y + ny * reach, 40, MAP - 40),
        speed: a.speed ?? 1500,
        dmg: a.landRadius ? 0 : dmg,
        a,
        hit: new Set(),
        land: a.landRadius ? dmg : 0,
      };
      if (onScreen(u)) {
        burst(u.x, u.y, 6, { kind: 'smoke', color: '#8b8f96', speed: 80, life: 0.4, size: 9, grow: 26 });
        ring(u.x, u.y, 50, a.color, 0.3, 5);
      }
      break;
    }
    case 'buff':
      if (a.buffAs || a.buffMs) c.buffs.push({ as: a.buffAs ?? 0, ms: a.buffMs ?? 0, t: a.buffT ?? 3 });
      if (a.shield) giveShield(u, shieldOf(u, a, slot), a.shieldT ?? 3, a.color);
      if (a.stealth) {
        u.stealthT = a.stealth;
        u.target = null;
        // enemies lose their lock
        for (const e of G.units) {
          if (e.target === u) e.target = null;
          if (e.champ?.order?.type === 'attack' && e.champ.order.target === u) e.champ.order = null;
        }
      }
      if (a.empower) c.empower = { dmg, a };
      if (a.heal) heal(u, healOf(u, a, slot, a.heal));
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
          trauma({ x: sx, y: sy }, u === G.player ? 0.5 : 0.3);
          for (let i = 0; i < 40; i++) {
            const k = Math.random();
            spawn({ kind: 'ember', x: sx + (ex - sx) * k + (Math.random() - 0.5) * w * 0.6, y: sy + (ey - sy) * k + (Math.random() - 0.5) * w * 0.6, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.6, size: 6, color: a.color, drag: 2 });
          }
        },
        draw: (ctx, k) => drawBeamTele(ctx, sx, sy, ex, ey, w, a.color, k),
        tele: ['b', r1(sx), r1(sy), r1(ex), r1(ey), w, a.color],
      });
      break;
    }
  }
  const castVol = u === G.player ? 1 : 0.6;
  sfx(({ bolt: 'bolt', nova: 'nova', dash: 'dash', buff: 'buff', beam: 'beamCharge', zone: 'nova', ally: 'buff' } as const)[a.kind], u, castVol);
  if (a.kind === 'bolt' && onScreen(u)) ring(u.x, u.y, u.r + 26, a.color, 0.25, 5);
  c.cds[slot] = cdOf(c, slot);
  return true;
}
// each rank shaves 6% off the cooldown
const cdOf = (c: Champ, slot: number) => {
  const a = c.def.abilities[slot];
  const base = a.cds ? a.cds[Math.max(0, Math.min(a.cds.length - 1, c.ranks[slot] - 1))] : a.cd * (1 - 0.06 * Math.max(0, c.ranks[slot] - 1));
  return base * (100 / (100 + c.haste + (c.azureT > 0 ? 20 : 0)));
};
const beams: { sx: number; sy: number; ex: number; ey: number; w: number; t: number; color: string }[] = [];


// ================= kit API: what src/kits may do to the game =================
function statCtx(u: Unit): import('./champions/ref').StatCtx {
  const c = u.champ!;
  return {
    level: c.level,
    ap: u.ap,
    ad: u.ad,
    bonusAd: Math.max(0, u.ad - c.st.baseAd),
    armor: u.armor,
    bonusArmor: Math.max(0, u.armor - c.st.baseArmor),
    mr: u.mr,
    bonusMr: Math.max(0, u.mr - c.st.baseMr),
    maxHp: u.maxHp,
    bonusHp: Math.max(0, u.maxHp - c.st.baseHp),
    hp: u.hp,
    mana: u.mp,
    maxMana: u.maxMp,
  };
}
const gameSpell = (u: Unit, slot: number, key?: string) => {
  const sp = REF[u.champ!.def.id].spells[slot];
  const k = key ?? Object.keys(sp.game)[0];
  const g = sp.game[k];
  if (!g || (g as any).buff || !(g as any).DataValues) throw new Error(`no data: ${u.champ!.def.id} ${'QWER'[slot]} ${k}`);
  return g as import('./champions/ref').RefGameSpell;
};
const passiveSpell = (u: Unit, key?: string) => {
  const vals = REF[u.champ!.def.id].passive.values;
  const k = key ?? Object.keys(vals ?? {})[0];
  const g = vals?.[k];
  if (!g) throw new Error(`no passive data: ${u.champ!.def.id} ${k}`);
  return g;
};
const rankOf = (u: Unit, slot: number) => Math.max(1, u.champ!.ranks[slot]);
const kitApi: KApi = {
  dist,
  clamp,
  time: () => (G ? G.t : 0),
  rand: Math.random,
  dmg: (src, t, amt, type, from = 'spell') => dealDamage(src, t, amt, type, from),
  heal,
  shield: giveShield,
  foes: (u, test = () => true) => enemiesIn(u.team, test),
  allies: (u, radius = 1e9, includeSelf = true) =>
    G.units.filter((a) => !a.dead && a.team === u.team && a.kind === 'champ' && (includeSelf || a !== u) && dist(a, u) <= radius),
  units: () => G.units,
  nearestFoe: (u, r, pred = () => true) => nearestEnemy(u, r, pred),
  pick: (u, tx, ty, range, grab = 160, pred = () => true) => {
    let best: Unit | null = null;
    let bd = grab;
    for (const e of enemiesIn(u.team, (e) => pred(e) && dist(u, e) <= range + e.r)) {
      const d = Math.hypot(e.x - tx, e.y - ty) - e.r;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  },
  pickAlly: (u, tx, ty, range, grab = 220, includeSelf = true) => {
    let best: Unit | null = null;
    let bd = grab;
    for (const a of G.units) {
      if (a.dead || a.team !== u.team || a.kind !== 'champ' || (!includeSelf && a === u) || dist(u, a) > range) continue;
      const d = Math.hypot(a.x - tx, a.y - ty);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  },
  v: (u, slot, name, key) => dataValue(gameSpell(u, slot, key), name, rankOf(u, slot)),
  calc: (u, slot, name, key) => evalCalc(gameSpell(u, slot, key), name, rankOf(u, slot), statCtx(u)),
  pv: (u, name, key, rank = 1) => dataValue(passiveSpell(u, key), name, rank),
  pcalc: (u, name, key, rank = 1) => evalCalc(passiveSpell(u, key), name, rank, statCtx(u)),
  ctx: statCtx,
  cc: (e, o) => {
    if (e.kind === 'tower' || e.kind === 'nexus' || e.kind === 'ward') return;
    if (o.slow) {
      e.slowAmt = Math.max(e.slowT > 0 ? e.slowAmt : 0, o.slow);
      e.slowT = Math.max(e.slowT, o.slowT ?? 1);
    }
    if (o.stun) e.stunT = Math.max(e.stunT, o.stun);
    if (o.root) e.rootT = Math.max(e.rootT, o.root);
    if (o.air) {
      e.stunT = Math.max(e.stunT, o.air);
      e.airT = Math.max(e.airT, o.air);
    }
    if (o.silence) e.silenceT = Math.max(e.silenceT, o.silence);
    if (o.charm && o.src) {
      e.charmT = Math.max(e.charmT, o.charm);
      e.charmSrc = o.src;
    }
    if (o.pull) e.push = { tx: o.pull.x, ty: o.pull.y, speed: o.pullSpeed ?? 1800 };
    if (o.knock) {
      const d = dist(e, o.knock.from) || 1;
      e.push = {
        tx: clamp(e.x + ((e.x - o.knock.from.x) / d) * o.knock.dist, 40, MAP - 40),
        ty: clamp(e.y + ((e.y - o.knock.from.y) / d) * o.knock.dist, 40, MAP - 40),
        speed: o.knock.speed ?? 1400,
      };
    }
    if (e.champ?.dash && (o.stun || o.air || o.pull || o.knock || o.charm)) e.champ.dash = null;
  },
  dot: (src, t, dps, secs, type, tag) => {
    const ex = t.dots.find((d) => d.tag === tag && d.src === src);
    if (ex) {
      ex.dps = dps;
      ex.t = secs;
    } else t.dots.push({ src, dps, t: secs, acc: 0, type, tag });
  },
  mark: (t, key, secs, v = 1, src = null) => {
    t.marks[key] = { t: secs, v, src };
  },
  markOf: (t, key) => t.marks[key],
  proj: (o) => {
    const len = Math.hypot(o.nx, o.ny) || 1;
    G.projs.push({
      homing: o.homing ?? null,
      x: o.from?.x ?? o.u.x,
      y: o.from?.y ?? o.u.y,
      dx: o.nx / len,
      dy: o.ny / len,
      speed: o.speed,
      traveled: 0,
      max: o.range,
      width: o.width,
      owner: o.u,
      team: o.u.team,
      dmg: 0,
      dmgType: 'magic',
      pierce: !!o.pierce,
      hit: new Set(),
      slow: 0,
      slowT: 0,
      stun: 0,
      champOnly: !!o.champOnly,
      color: o.color,
      done: false,
      cb: o.cb,
      onEnd: o.onEnd,
      maxHits: o.maxHits,
    });
    return G.projs[G.projs.length - 1];
  },
  later: (secs, fn) => {
    G.kfx.push({ t: secs, fn: (_dt, left) => { if (left <= 0) fn(); } });
  },
  every: (secs, fn) => {
    G.kfx.push({ t: secs, fn });
  },
  teleCircle: (x, y, r, color, secs, fn) => {
    G.pending.push({ t: secs, total: secs, fn, draw: (ctx, k) => drawNovaTele(ctx, x, y, r, color, k), tele: ['n', r1(x), r1(y), r, color, 0] });
  },
  teleLine: (sx, sy, ex, ey, w, color, secs, fn) => {
    G.pending.push({ t: secs, total: secs, fn, draw: (ctx, k) => drawBeamTele(ctx, sx, sy, ex, ey, w, color, k), tele: ['b', r1(sx), r1(sy), r1(ex), r1(ey), w, color] });
  },
  dash: (u, tx, ty, speed, o = {}) => {
    u.champ!.dash = { tx: clamp(tx, 40, MAP - 40), ty: clamp(ty, 40, MAP - 40), speed, dmg: 0, a: null, hit: new Set(), cb: o.cb, end: o.end, hitR: o.hitR };
    if (onScreen(u)) {
      burst(u.x, u.y, 6, { kind: 'smoke', color: '#8b8f96', speed: 80, life: 0.4, size: 9, grow: 26 });
    }
  },
  blink: (u, tx, ty) => {
    if (onScreen(u)) burst(u.x, u.y, 12, { color: '#ffffff', speed: 300, life: 0.3, size: 3 });
    u.x = clamp(tx, 40, MAP - 40);
    u.y = clamp(ty, 40, MAP - 40);
    pushOut(u);
    if (onScreen(u)) ring(u.x, u.y, 70, '#ffffff', 0.3, 5);
  },
  isWall: (x, y) => isWall(x, y),
  ring,
  burst,
  trauma: (at, amt) => trauma(at, amt),
  text: (u, str, color = '#ffffff') => addText(u.x, u.y - 60, str, color, 14),
  pet: (owner, o) => {
    const p = makeUnit({
      kind: 'minion',
      team: owner.team,
      x: o.x,
      y: o.y,
      r: o.r ?? 18,
      hp: o.hp,
      maxHp: o.hp,
      ad: o.ad,
      armor: o.armor ?? 0,
      mr: o.mr ?? 0,
      range: o.range,
      as: o.as,
      ms: o.ms,
      mtype: 'melee',
      name: o.name,
      fadeIn: 0.3,
      petOwner: owner,
      petLife: o.life,
    });
    G.units.push(p);
    return p;
  },
  remove: (u) => {
    u.dead = true;
    u.hp = 0;
  },
  costOf: (u, slot) => costOf(u.champ!, slot),
  cdOf: (u, slot) => cdOf(u.champ!, slot),
  refundCd: (u, slot, secs) => {
    u.champ!.cds[slot] = Math.max(0, u.champ!.cds[slot] - secs);
  },
  setCd: (u, slot, secs) => {
    u.champ!.cds[slot] = secs;
  },
  rankOf,
  recalc,
  effAS,
  addBuff: (u, as, ms, t) => {
    u.champ!.buffs.push({ as, ms, t });
  },
};
setKitApi(kitApi);

function castFlash(u: Unit, tx: number, ty: number) {
  const c = u.champ!;
  if (u.dead || c.spellCds[0] > 0 || c.dash) return;
  const d = Math.hypot(tx - u.x, ty - u.y) || 1;
  const reach = Math.min(d, 425);
  burst(u.x, u.y, 14, { color: '#fff6a8', speed: 380, life: 0.3, size: 3 });
  u.x = clamp(u.x + ((tx - u.x) / d) * reach, 40, MAP - 40);
  u.y = clamp(u.y + ((ty - u.y) / d) * reach, 40, MAP - 40);
  pushOut(u); // flashing into a wall lands on the nearest floor
  burst(u.x, u.y, 18, { kind: 'ember', color: '#fff6a8', speed: 300, life: 0.4, size: 4 });
  ring(u.x, u.y, 70, '#fff6a8', 0.35, 6);
  c.spellCds[0] = 180;
  sfx('flash', u, u === G.player ? 1 : 0.5);
  c.recallT = 0;
  if (c.order?.type === 'move') c.order = null;
}
function castHeal(u: Unit) {
  const c = u.champ!;
  if (u.dead || c.spellCds[1] > 0 || c.spell2 !== 'heal') return;
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
  c.recallT = colossusOn(u.team) ? 4 : 8;
  if (u === G.player) sfx('recall');
  c.order = null;
}

// ================= minions & waves =================
// Lane waves follow the real game: one minion leaves each barracks every 0.8s, a wave every 30s; a cannon
// minion joins every third wave, then every other wave after 20:00 and every wave after 35:00; super minions
// replace the cannon when the enemy inhibitor in that lane is down (two when all three are).
const MINION_GAP = 0.8;
let cannonCount = 0;
function spawnWave() {
  G.waveNo++;
  const cap = G.t >= 35 * 60 ? 0 : G.t >= 20 * 60 ? 1 : 2;
  const cannon = cannonCount >= cap;
  cannonCount = cannon ? 0 : cannonCount + 1;
  const s = 1 + (G.t / 60) * 0.04;
  for (const team of [0, 1] as Team[]) {
    const downs = [0, 1, 2].map((lane) => G.units.some((o) => o.kind === 'tower' && o.tier === T_INHIB && o.team !== team && o.lane === lane && o.dead));
    for (let lane = 0; lane < 3; lane++) {
      const poly = lanePoly(lane, team);
      let laneTypes: MinionType[] = ['melee', 'melee', 'melee', cannon ? 'siege' : 'caster', 'caster', 'caster'];
      if (!cannon) laneTypes = ['melee', 'melee', 'melee', 'caster', 'caster', 'caster'];
      else laneTypes = ['melee', 'melee', 'melee', 'siege', 'caster', 'caster', 'caster'];
      if (downs[lane]) laneTypes = downs.every(Boolean) ? ['super', 'super', 'melee', 'melee', 'melee', 'caster', 'caster', 'caster'] : ['super', 'melee', 'melee', 'melee', 'caster', 'caster', 'caster'];
      laneTypes.forEach((mt, i) => {
        const STATS: Record<MinionType, { hp: number; ad: number; range: number; as: number; r: number; armor: number }> = {
          melee: { hp: 480, ad: 14, range: 90, as: 1.2, r: 18, armor: 0 },
          caster: { hp: 300, ad: 24, range: 480, as: 0.7, r: 15, armor: 0 },
          siege: { hp: 950, ad: 45, range: 300, as: 0.8, r: 24, armor: 15 },
          super: { hp: 1700, ad: 95, range: 170, as: 0.85, r: 30, armor: 30 },
        };
        const stats = STATS[mt];
        K_later(i * MINION_GAP, () => {
          const p = pointAt(poly, 300);
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
      });
    }
  }
}
const K_later = (secs: number, fn: () => void) => {
  G.kfx.push({ t: Math.max(0.001, secs), fn: (_dt, left) => { if (left <= 0) fn(); } });
};

function updatePet(u: Unit, dt: number) {
  const o = u.petOwner!;
  if ((u.petLife -= dt) <= 0 || o.dead) {
    u.dead = true;
    u.hp = 0;
    return;
  }
  if (u.stunT > 0) return;
  let t = u.target && targetable(u.target) && dist(u, u.target) < 900 ? u.target : null;
  const ot = o.champ?.order?.type === 'attack' ? o.champ.order.target : o.target;
  if (ot && targetable(ot) && ot.team !== u.team && dist(o, ot) < 900) t = ot;
  if (!t && (u.retarget -= dt) <= 0) {
    u.retarget = 0.3;
    t = nearestEnemy(o, 600, (e) => e.kind === 'champ' || e.kind === 'minion');
  }
  u.target = t;
  if (t) {
    if (inRange(u, t)) tryAttack(u, t);
    else moveToward(u, t.x, t.y, dt, 1.15);
  } else if (dist(u, o) > 160) moveToward(u, o.x, o.y, dt, 1.2);
}

function updateMinion(u: Unit, dt: number) {
  if (u.petOwner) return updatePet(u, dt);
  if (u.stunT > 0) return;
  u.retarget -= dt;
  const t = u.target;
  if (t && (!targetable(t) || dist(u, t) > 750)) u.target = null;
  if (u.retarget <= 0 && !(u.target && inRange(u, u.target))) {
    u.retarget = 0.35;
    let best: Unit | null = null;
    let bs = Infinity;
    for (const e of G.units) {
      if (e.team === u.team || e.kind === 'monster' || e.kind === 'ward' || !targetable(e)) continue;
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
  if (u.tier === T_INHIB) return; // inhibitors don't shoot
  if (u.aggroT > 0) u.aggroT -= dt;
  const valid = (t: Unit | null): t is Unit => !!t && targetable(t) && t.team !== u.team && dist(u, t) <= u.range + t.r;
  let t: Unit | null = null;
  if (u.aggroT > 0 && valid(u.aggro)) t = u.aggro;
  else if (valid(u.target)) t = u.target;
  else {
    t = nearestEnemy(u, u.range, (e) => e.kind === 'minion') ?? nearestEnemy(u, u.range, (e) => e.kind === 'champ');
  }
  if (t !== u.target) u.heat = 0;
  u.target = t;
  if (t) tryAttack(u, t);
}

// ================= champions =================
function updateChamp(u: Unit, dt: number) {
  const c = u.champ!;
  for (let i = 0; i < 4; i++) c.cds[i] = Math.max(0, c.cds[i] - dt);
  for (let i = 0; i < 2; i++) c.spellCds[i] = Math.max(0, c.spellCds[i] - dt);
  if (c.azureT > 0) c.azureT = Math.max(0, c.azureT - dt);
  if (c.emberT > 0) c.emberT = Math.max(0, c.emberT - dt);
  if (c.wards < 2 && (c.wardCd -= dt) <= 0) {
    c.wards++;
    c.wardCd = c.wards < 2 ? 120 : 0;
  }
  // Azure blessing: much faster mana regeneration (and ability haste, see cdOf)
  u.mp = Math.min(u.maxMp, u.mp + (c.def.mpRegen + (c.def.mpRegenL ?? 0) * (c.level - 1) + (c.azureT > 0 ? u.maxMp * 0.01 : 0)) * dt);
  if (c.def.hpRegen) heal(u, ((c.def.hpRegen + (c.def.hpRegenL ?? 0) * (c.level - 1)) / 5) * dt);
  for (let i = 0; i < 4; i++)
    if (c.rc[i] > 0 && (c.rc[i] -= dt) <= 0) {
      c.rc[i] = 0;
      if (c.st['keepCd' + i]) c.st['keepCd' + i] = false;
      else c.cds[i] = cdOf(c, i); // recast window closed: cooldown starts now
      KITS[c.def.id]?.passive?.recastEnd?.(u, i);
    }
  KITS[c.def.id]?.passive?.tick?.(u, dt);
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
        hitEnemy(u, e, d.a, d.dmg, u);
      }
    }
    if (d.cb) {
      for (const e of enemiesIn(u.team, (e) => !d.hit.has(e) && dist(e, u) <= u.r + e.r + (d.hitR ?? 60))) {
        d.hit.add(e);
        d.cb(e);
      }
    }
    if (onScreen(u)) spawn({ kind: 'ghost', x: u.x, y: u.y, life: 0.22, size: u.r, color: c.def.color, drag: 0 });
    const step = d.speed * dt;
    const rem = Math.hypot(d.tx - u.x, d.ty - u.y);
    if (rem <= step) {
      u.x = d.tx;
      u.y = d.ty;
      c.dash = null;
      d.end?.();
      if (d.land && d.a) {
        const rad = d.a.landRadius ?? 250;
        for (const e of enemiesIn(u.team, (e) => dist(e, u) <= rad + e.r)) hitEnemy(u, e, d.a, d.land, u);
        sfx('boom', u, u === G.player ? 1 : 0.6);
        if (onScreen(u)) {
          ring(u.x, u.y, rad, d.a.color, 0.45, 10);
          burst(u.x, u.y, 24, { kind: 'smoke', color: '#9a8f80', speed: rad * 1.6, life: 0.6, size: 12, grow: 30, drag: 4 });
          impact(u, 'large');
        }
      }
    } else {
      const nx = u.x + ((d.tx - u.x) / rem) * step;
      const ny = u.y + ((d.ty - u.y) / rem) * step;
      // most dashes can't cross jungle walls
      if (isWall(nx, ny)) {
        d.tx = u.x;
        d.ty = u.y;
      } else {
        u.x = nx;
        u.y = ny;
      }
    }
    return;
  }
  if (u.stunT > 0 || u.charmT > 0) return;
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
  let guard = 12;
  while (c.buildIdx < c.def.build.length && guard-- > 0) {
    const target = c.def.build[c.buildIdx];
    if (c.items.includes(target)) {
      c.buildIdx++;
      continue;
    }
    if (c.items.length >= 6 && !quote(target, c.items, ITEM_MAP).consumed.length) break;
    if (canBuy(u, target)) {
      buyItem(u, target);
      c.buildIdx++;
      continue;
    }
    // can't afford the whole item: buy the most expensive affordable component, like a player would
    const comps = (function walk(id: string): string[] {
      const it = ITEM_MAP[id];
      return (it?.from ?? []).flatMap((f) => [f, ...walk(f)]);
    })(target)
      .filter((f) => ITEM_MAP[f] && canBuy(u, f))
      .sort((x, y) => ITEM_MAP[y].cost - ITEM_MAP[x].cost);
    if (!comps.length) break;
    buyItem(u, comps[0]);
  }
}

function laneFront(team: Side, lane: number): Vec {
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
  if (c.cds[s] > 0 || c.ranks[s] === 0 || u.mp < costOf(c, s) || u.silenceT > 0) return;
  // keep enough mana for the ultimate when it is nearly up
  if (s !== 3 && c.ranks[3] > 0 && c.cds[3] < 4 && u.mp - costOf(c, s) < costOf(c, 3)) return;
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
    case 'zone':
      if (a.once) {
        if (d < a.range) cast(u, s, foe.x, foe.y); // traps go on top of the target
      } else if (d < a.range + (a.radius ?? 0) * 0.4 && (s !== 3 || fp < 0.75 || a.allyHeal)) cast(u, s, jx, jy);
      break;
    case 'dash':
      if (a.landRadius || a.execute) {
        if (d < a.range + 60 && (s !== 3 || fp < (a.execute ? 0.45 : 0.8))) cast(u, s, foe.x, foe.y);
      } else if (a.knockback) {
        if (d < a.range * 0.8) cast(u, s, foe.x, foe.y);
      } else if (!c.def.ranged && d > u.range + 60 && d < a.range + 100) cast(u, s, foe.x, foe.y);
      break;
    case 'ally': {
      const hurt = G.units.some((al) => al.champ && !al.dead && al.team === u.team && dist(al, u) < (a.radius ?? 600) && al.hp / al.maxHp < 0.65);
      if (a.heal ? hurt : d < 650) cast(u, s, u.x, u.y);
      break;
    }
    case 'buff':
      if (a.stealth) {
        if (d < 500 && fp < 0.6) cast(u, s, foe.x, foe.y);
      } else if (a.shield && !a.buffAs) {
        if (u.hp / u.maxHp < 0.75) cast(u, s, foe.x, foe.y);
      } else if (d < u.range + 150) cast(u, s, foe.x, foe.y);
      break;
  }
}

function aiUtility(u: Unit, foe: Unit | null) {
  const c = u.champ!;
  c.def.abilities.forEach((a, s) => {
    if (c.cds[s] > 0 || c.ranks[s] === 0 || u.mp < costOf(c, s) || u.silenceT > 0) return;
    if (a.kind === 'ally' && a.heal) {
      if (G.units.some((al) => al.champ && !al.dead && al.team === u.team && dist(al, u) < (a.radius ?? 600) && al.hp / al.maxHp < 0.6)) cast(u, s, u.x, u.y);
    } else if (a.kind === 'ally' && foe && dist(u, foe) < 700) {
      if (G.units.some((al) => al.champ && !al.dead && al.team === u.team && al !== u && dist(al, u) < (a.radius ?? 600)) || u.hp / u.maxHp < 0.7) cast(u, s, u.x, u.y);
    } else if (s === 3 && a.range >= 3000) {
      // map-wide ultimates finish off low enemies anywhere
      const low = G.units.find((e) => e.champ && e.team !== u.team && targetable(e) && e.hp / e.maxHp < 0.3 && dist(e, u) <= a.range);
      if (low && Math.random() < 0.3) cast(u, s, low.x, low.y);
    } else if (foe && s < 3 && (a.kind === 'bolt' || (a.kind === 'zone' && !a.allyHeal)) && u.mp >= costOf(c, s) * 2.5 && Math.random() < 0.35) {
      aiCast(u, s, foe); // poke while trading in lane
    }
  });
}

// Junglers walk a clear of their own side's camps, smite buffs and epics, and gank lanes when an
// enemy laner nearby is hurt.
function aiJungle(u: Unit) {
  const c = u.champ!;
  const team = u.team as Team;
  // gank: a hurt enemy champion within reach of us
  const prey = G.units.find((e) => e.champ && e.team !== team && isSeen(team, e) && targetable(e) && e.hp / e.maxHp < 0.55 && dist(e, u) < 3000 && !towerCovering(e, e.team, 100));
  if (prey && c.level >= 3 && u.hp / u.maxHp > 0.6) {
    c.order = { type: 'attack', target: prey };
    return;
  }
  // fighting a camp already?
  const fighting = G.units.find((m) => m.kind === 'monster' && !m.dead && m.target === u);
  let goal: CampState | null = null;
  if (!fighting) {
    let best = Infinity;
    for (const cs of G.camps) {
      if (!cs.mobs.some((m) => !m.dead)) continue;
      const d = dist(u, cs.def);
      const epic = cs.def.epic;
      // epics need levels and health; enemy camps are only invaded when close
      if (epic && (c.level < (cs.def.mobs[0].type === 'colossus' ? 11 : 7) || u.hp / u.maxHp < 0.75)) continue;
      if (cs.def.side !== 2 && cs.def.side !== team && d > 2500) continue;
      const score = d + (epic ? -1500 : 0) + (cs.def.mobs[0].type === 'skitter' && c.level < 3 ? 4000 : 0);
      if (score < best) {
        best = score;
        goal = cs;
      }
    }
  }
  const target = fighting ?? goal?.mobs.filter((m) => !m.dead && !m.resetting).sort((a, b) => b.maxHp - a.maxHp)[0];
  if (target) {
    // smite to secure buffs and epics, or to speed the clear when low
    const big = target.monster === 'azure' || target.monster === 'ember' || target.monster === 'drake' || target.monster === 'colossus';
    if (c.spellCds[1] <= 0 && dist(u, target) < 500 && target.hp <= smiteDamage(u) && (big || u.hp / u.maxHp < 0.45 || c.level < 4)) castSmite(u, target);
    if (dist(u, target) < 700) for (let s = 0; s < 3; s++) {
      const a = c.def.abilities[s];
      if (c.cds[s] <= 0 && c.ranks[s] > 0 && u.mp >= costOf(c, s) * 2 && a.kind !== 'ally' && !(a.kind === 'buff' && a.stealth)) cast(u, s, target.x, target.y);
    }
    c.order = { type: 'attack', target };
    return;
  }
  // nothing up: wait at the camp that respawns soonest on our side, warding the river on the way
  const next = G.camps.filter((cs) => cs.def.side === team).sort((a, b) => a.next - b.next)[0];
  if (next) c.order = { type: 'move', x: next.def.x + 150, y: next.def.y + 150 };
  aiWard(u);
}

// Drop a trinket ward in the nearest river brush when there's no friendly ward around it.
function aiWard(u: Unit) {
  const c = u.champ!;
  if (c.wards <= 0 || Math.random() > 0.05) return;
  const spot = BRUSHES.filter((b) => dist(b, u) < 900).sort((a, b) => dist(a, u) - dist(b, u))[0];
  if (!spot || G.units.some((w) => w.kind === 'ward' && !w.dead && w.team === u.team && dist(w, spot) < 600)) return;
  placeWard(u, spot.x, spot.y);
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
    const dashSlot = c.def.abilities.findIndex((a) => a.kind === 'dash' && !a.landRadius);
    if (dist(u, foe) < 500 && dashSlot >= 0) cast(u, dashSlot, home.x, home.y);
    const saveSlot = c.def.abilities.findIndex((a) => a.kind === 'buff' && (a.stealth || a.shield));
    if (dist(u, foe) < 600 && saveSlot >= 0 && saveSlot < 3) cast(u, saveSlot, home.x, home.y);
    c.order = { type: 'move', x: home.x, y: home.y };
    return;
  }

  // --- utility: support spells for hurt allies, long-range poke, map-wide ultimates ---
  aiUtility(u, foe);

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

  // --- jungler: clear camps, take objectives, gank hurt laners ---
  if (c.role === 'jungle') {
    aiJungle(u);
    return;
  }

  // --- support: stay with the bot laner and leave the minions to them ---
  if (c.role === 'support') {
    const adc = G.units.find((o) => o.champ?.role === 'adc' && o.team === u.team && !o.dead && dist(o, BASES[u.team]) > 2500);
    if (adc) {
      const back = dist(adc, ownNexus) || 1;
      c.order = { type: 'move', x: adc.x + ((ownNexus.x - adc.x) / back) * 180 + 90, y: adc.y + ((ownNexus.y - adc.y) / back) * 180 - 90 };
      aiWard(u);
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

function updateZones(dt: number) {
  for (const z of G.zones) {
    z.t -= dt;
    z.tick -= dt;
    if (z.tick > 0) continue;
    const a = z.a;
    const inside = enemiesIn(z.team, (e) => dist(e, z) <= z.r + e.r);
    if (a.once) {
      // trap: waits for an enemy champion or minion to step in
      if (!inside.length) {
        z.tick = 0.1;
        continue;
      }
      for (const e of inside) hitEnemy(z.owner, e, a, z.dmg, z);
      sfx('boom', z, 0.8);
      if (onScreen(z)) {
        ring(z.x, z.y, z.r * 1.3, a.color, 0.45, 9);
        burst(z.x, z.y, 18, { kind: 'ember', color: a.color, speed: 300, life: 0.4, size: 4, drag: 5 });
      }
      z.t = 0;
      continue;
    }
    z.tick = 0.5;
    for (const e of inside) {
      dealDamage(z.owner, e, z.dmg * 0.5, a.dmgType);
      if (a.slow && e.kind !== 'tower') {
        e.slowAmt = Math.max(e.slowT > 0 ? e.slowAmt : 0, a.slow);
        e.slowT = Math.max(e.slowT, 0.6);
      }
      if (a.root && !z.hit.has(e)) {
        z.hit.add(e);
        e.rootT = Math.max(e.rootT, a.root);
      }
    }
    if (z.heal)
      for (const al of G.units)
        if (!al.dead && al.team === z.team && al.kind === 'champ' && dist(al, z) <= z.r + al.r) heal(al, z.heal * 0.5);
    if (onScreen(z))
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * z.r;
        spawn({ kind: 'ember', x: z.x + Math.cos(ang) * rr, y: z.y + Math.sin(ang) * rr, vx: 0, vy: -110, life: 0.6, size: 4, color: a.color, drag: 1 });
      }
  }
  G.zones = G.zones.filter((z) => z.t > 0);
}

const hiddenFrom = (u: Unit, viewer: Unit) => u.team !== viewer.team && (u.stealthT > 0 || !isSeen(viewer.team, u));
interface ZoneView {
  x: number;
  y: number;
  r: number;
  color: string;
  k: number; // time left, 1 -> 0
  team: Side;
  once: boolean;
}
let guestZones: ZoneView[] = [];
const zoneViews = (): ZoneView[] =>
  net.role === 'guest'
    ? guestZones
    : G.zones.map((z) => ({ x: z.x, y: z.y, r: z.r, color: z.a.color, k: z.t / z.dur, team: z.team, once: !!z.a.once }));

// ================= jungle =================
interface CampState {
  def: CampDef;
  next: number; // game time of the next spawn (when empty)
  mobs: Unit[];
  announced: boolean;
}
interface MonsterStat {
  name: string;
  hp: number;
  ad: number;
  range: number;
  as: number;
  r: number;
  armor: number;
  mr: number;
  ms: number;
  gold: number;
  xp: number;
}
const MONSTERS: Record<MonsterType, MonsterStat> = {
  azure: { name: 'Blue Sentinel', hp: 2300, ad: 66, range: 160, as: 0.5, r: 62, armor: 10, mr: -15, ms: 300, gold: 100, xp: 150 },
  ember: { name: 'Red Brambleback', hp: 2300, ad: 66, range: 160, as: 0.5, r: 62, armor: -15, mr: 10, ms: 300, gold: 100, xp: 150 },
  toad: { name: 'Gromp', hp: 2050, ad: 70, range: 250, as: 0.43, r: 56, armor: 0, mr: -15, ms: 300, gold: 80, xp: 125 },
  birdBig: { name: 'Crimson Raptor', hp: 1200, ad: 20, range: 300, as: 0.67, r: 34, armor: 20, mr: 20, ms: 350, gold: 60, xp: 50 },
  bird: { name: 'Razorbeak', hp: 400, ad: 13, range: 300, as: 1, r: 22, armor: 0, mr: 0, ms: 350, gold: 10, xp: 15 },
  boarBig: { name: 'Greater Murk Wolf', hp: 1600, ad: 35, range: 160, as: 0.63, r: 40, armor: 0, mr: 0, ms: 380, gold: 55, xp: 60 },
  boar: { name: 'Murk Wolf', hp: 420, ad: 15, range: 140, as: 0.67, r: 26, armor: 0, mr: 0, ms: 380, gold: 16, xp: 20 },
  hulkBig: { name: 'Krug', hp: 1350, ad: 70, range: 160, as: 0.5, r: 50, armor: 40, mr: -15, ms: 250, gold: 70, xp: 75 },
  hulk: { name: 'Pebblehulk', hp: 1000, ad: 40, range: 140, as: 0.6, r: 36, armor: 20, mr: 0, ms: 280, gold: 40, xp: 45 },
  skitter: { name: 'Rift Scuttler', hp: 1050, ad: 0, range: 0, as: 0.1, r: 34, armor: 40, mr: 40, ms: 260, gold: 70, xp: 110 },
  drake: { name: 'Dragon', hp: 3800, ad: 100, range: 500, as: 0.5, r: 90, armor: 21, mr: 30, ms: 330, gold: 0, xp: 0 },
  colossus: { name: 'Baron Nashor', hp: 9000, ad: 150, range: 250, as: 0.75, r: 110, armor: 120, mr: 70, ms: 350, gold: 0, xp: 0 },
};
const colossusOn = (team: Side) => team < 2 && !!G && G.colossus[team as Team] > G.t;
const smiteDamage = (u: Unit) => 450 + 25 * u.champ!.level;

function updateCamps() {
  for (const cs of G.camps) {
    cs.mobs = cs.mobs.filter((m) => !m.dead && G.units.includes(m));
    if (cs.mobs.length || G.t < cs.next) continue;
    if (cs.def.epic && !cs.announced && G.t >= cs.next) {
      cs.announced = true;
      feedMsg(`${cs.def.name} has spawned`, -1);
      announce(`${cs.def.name} has spawned`, 'neutral');
    }
    // monsters scale with the average champion level, like the lane minions scale with time
    const champs = G.units.filter((c) => c.champ);
    const avgLvl = champs.reduce((a, c) => a + c.champ!.level, 0) / Math.max(1, champs.length);
    const s = 1 + (avgLvl - 1) * 0.1;
    for (const mb of cs.def.mobs) {
      const st = MONSTERS[mb.type];
      const m = makeUnit({
        kind: 'monster',
        team: 2,
        x: cs.def.x + mb.dx,
        y: cs.def.y + mb.dy,
        r: st.r,
        hp: st.hp * s,
        maxHp: st.hp * s,
        ad: st.ad * s,
        range: st.range,
        as: st.as,
        armor: st.armor,
        mr: st.mr,
        ms: st.ms,
        name: st.name,
        fadeIn: 0.5,
      });
      m.monster = mb.type;
      m.camp = cs.def.id;
      m.home = { x: m.x, y: m.y };
      m.face = Math.random() * 6;
      cs.mobs.push(m);
      G.units.push(m);
    }
    cs.next = Infinity; // set when the camp is cleared
  }
}

// The whole camp turns on whoever hits one of its monsters.
function monsterAggro(t: Unit, src: Unit) {
  const cs = G.camps.find((c) => c.def.id === t.camp);
  for (const m of cs ? cs.mobs : [t]) {
    if (m.dead || m.resetting) continue;
    if (!m.target || m.target.dead || m.target === src) {
      m.target = src;
      m.leashT = 0;
    }
  }
}

function updateMonster(u: Unit, dt: number) {
  const home = u.home!;
  if (u.resetting) {
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.5 * dt);
    if (moveToward(u, home.x, home.y, dt, 2)) {
      u.resetting = false;
      u.hp = u.maxHp;
      u.face = Math.random() * 6;
    }
    return;
  }
  if (u.stunT > 0 || u.push) return;
  const t = u.target;
  if (!t) {
    if (u.monster === 'skitter') {
      // skitters wander the river between the pits
      if (dist(u, home) < 20 || Math.random() < 0.004) u.pathGoal = { x: home.x + (Math.random() - 0.5) * 900, y: home.y + (Math.random() - 0.5) * 900 };
    }
    return;
  }
  u.leashT += dt;
  // leash: too far from home, target gone, or not hit for a while -> walk home and heal
  if (!targetable(t) || dist(u, home) > 1000 || dist(t, home) > 1300 || u.leashT > 7 || (t.champ && t.champ.recallT > 0 && dist(t, u) > 600)) {
    u.target = null;
    u.resetting = true;
    return;
  }
  if (u.monster === 'skitter') {
    // skitters don't fight back; they scuttle away from the attacker
    const d = dist(u, t) || 1;
    moveToward(u, u.x + ((u.x - t.x) / d) * 200, u.y + ((u.y - t.y) / d) * 200, dt, 0.5);
    return;
  }
  if (inRange(u, t)) tryAttack(u, t);
  else moveToward(u, t.x, t.y, dt);
}

function monsterKilled(t: Unit, killer: Unit | null) {
  const st = MONSTERS[t.monster!];
  const cs = G.camps.find((c) => c.def.id === t.camp);
  if (cs) {
    cs.mobs = cs.mobs.filter((m) => m !== t && !m.dead);
    if (!cs.mobs.length) {
      cs.next = G.t + cs.def.respawn;
      cs.announced = false;
    }
  }
  if (!killer?.champ) return;
  const team = killer.team as Team;
  if (killer.champ.spell2 === 'smite') heal(killer, 30 + killer.maxHp * 0.06); // companion sustain
  giveGold(killer, st.gold);
  gainXp(killer, st.xp);
  killer.champ.cs += t.monster === 'bird' || t.monster === 'boar' ? 1 : 4;
  const mine = team === G.player.team;
  if (t.monster === 'azure') {
    killer.champ.azureT = 120;
    feedMsg(`${killer.name} took the Blue Sentinel's Crest of Insight`, team);
  } else if (t.monster === 'ember') {
    killer.champ.emberT = 120;
    feedMsg(`${killer.name} took the Red Brambleback's Crest of Cinders`, team);
  } else if (t.monster === 'drake') {
    G.drakes[team]++;
    for (const c of G.units) if (c.champ && c.team === team) giveGold(c, 100), gainXp(c, 200);
    announce(mine ? 'Your team has slain the Dragon' : 'The enemy has slain the Dragon', mine ? 'good' : 'bad', `+5% damage (${G.drakes[team]} stack${G.drakes[team] > 1 ? 's' : ''})`);
  } else if (t.monster === 'colossus') {
    G.colossus[team] = G.t + 180;
    for (const c of G.units) if (c.champ && c.team === team) giveGold(c, 300), gainXp(c, 400);
    announce(mine ? 'Your team has slain Baron Nashor' : 'The enemy has slain Baron Nashor', mine ? 'good' : 'bad', 'Empowered minions and fast recall for 3 minutes');
  }
}

// Smite: big true-damage hit on a monster or minion; the jungler's summoner spell.
function castSmite(u: Unit, target?: Unit | null): boolean {
  const c = u.champ!;
  if (u.dead || c.spellCds[1] > 0 || c.spell2 !== 'smite') return false;
  const ok = (e: Unit | null | undefined): e is Unit => !!e && targetable(e) && (e.kind === 'monster' || (e.kind === 'minion' && e.team !== u.team)) && dist(u, e) <= 500 + e.r;
  let t = ok(target) ? target : null;
  if (!t) {
    let best = Infinity;
    for (const e of G.units)
      if (ok(e)) {
        const score = (e.kind === 'monster' ? 0 : 1000) + dist(u, e) - e.r * 4;
        if (score < best) {
          best = score;
          t = e;
        }
      }
  }
  if (!t) return false;
  c.spellCds[1] = 75;
  const dmg = smiteDamage(u);
  t.hp -= dmg; // true damage, ignores shields and resistances
  t.hitFlash = 0.2;
  heal(u, 60 + 5 * c.level);
  if (t.kind === 'monster') monsterAggro(t, u);
  addText(t.x, t.y, String(Math.round(dmg)), '#ffcf6a', 20);
  if (onScreen(t)) {
    beams.push({ sx: t.x, sy: t.y - 600, ex: t.x, ey: t.y, w: 60, t: 0.35, color: '#ffcf6a' });
    ring(t.x, t.y, t.r + 50, '#ffcf6a', 0.4, 9);
    burst(t.x, t.y, 20, { kind: 'ember', color: '#ffcf6a', speed: 340, life: 0.45, size: 5, drag: 4 });
  }
  sfx('boom', t, u === G.player ? 1 : 0.6);
  if (t.hp <= 0) kill(t, u);
  return true;
}

// Turret plating: before 14:00 outer turrets shed a plate (and 125 gold) every 800 health.
function checkPlates(t: Unit) {
  if (G.t >= 840) return;
  while (t.plates > 0 && t.hp <= t.maxHp - (6 - t.plates) * 800) {
    t.plates--;
    const near = G.units.filter((c) => c.champ && !c.dead && c.team !== t.team && dist(c, t) < 1200);
    for (const c of near) giveGold(c, Math.round(125 / near.length));
    if (onScreen(t)) burst(t.x, t.y, 14, { kind: 'smoke', color: '#9a8f80', speed: 220, life: 0.6, size: 10, grow: 20 });
  }
}

// ---------- vision: champions, minions, turrets and wards light up the fog for their team ----------
const SIGHT = { champ: 1250, minion: 1100, tower: 1350, nexus: 1350, ward: 900, monster: 0 } as const;
function computeVision() {
  for (const team of [0, 1] as Team[]) {
    const eyes = G.units.filter((o) => !o.dead && o.team === team && o.kind !== 'monster' && !(o.kind === 'tower' && o.tier === T_INHIB));
    const seen = new Set<Unit>();
    for (const e of G.units) {
      if (e.dead || e.team === team) continue;
      if (e.kind === 'tower' || e.kind === 'nexus') {
        seen.add(e); // structures are always on the map
        continue;
      }
      const eb = e.revealT > 0 ? -1 : brushOf(e.x, e.y);
      for (const o of eyes) {
        const r = SIGHT[o.kind] + e.r;
        if (Math.abs(o.x - e.x) > r || Math.abs(o.y - e.y) > r || dist(o, e) > r) continue;
        // brush hides you from anyone not standing in it (turrets see in)
        if (eb >= 0 && o.kind !== 'tower' && brushOf(o.x, o.y) !== eb && dist(o, e) > 160) continue;
        if (!lineClear(o, e, 40)) continue;
        seen.add(e);
        break;
      }
    }
    G.seen[team] = seen;
  }
}
const isSeen = (team: Side, e: Unit) => team === 2 || e.team === team || !G.seen[team as Team] || G.seen[team as Team].has(e);
const fogged = (e: Unit) => !isSeen(G.player.team, e);

// ---------- trinket ward ----------
function placeWard(u: Unit, x: number, y: number, pink = false): boolean {
  const c = u.champ!;
  if (u.dead || (pink ? c.pinks <= 0 : c.wards <= 0)) return false;
  const d = Math.hypot(x - u.x, y - u.y) || 1;
  const reach = Math.min(d, 600);
  const p = { x: u.x + ((x - u.x) / d) * reach, y: u.y + ((y - u.y) / d) * reach };
  pushOut(p);
  // one ward per champion: the oldest goes
  const mine = G.units.filter((w) => w.kind === 'ward' && w.target === u && !w.dead && (w.tier === 1) === pink);
  if (mine.length >= (pink ? 1 : 2)) mine[0].dead = true;
  const w = makeUnit({ kind: 'ward', team: u.team, x: p.x, y: p.y, r: 14, hp: pink ? 4 : 3, maxHp: pink ? 4 : 3, name: pink ? 'Control Ward' : 'Ward', fadeIn: 0.3, tier: pink ? 1 : 0 });
  w.life = pink ? 1e9 : 90; // Control Wards never expire
  w.stealthT = pink ? 0 : 1;
  w.target = u; // owner
  G.units.push(w);
  c.ms.wards++;
  if (pink) c.ms.ctrl++;
  if (pink) c.pinks--;
  else {
    c.wards--;
    if (c.wardCd <= 0) c.wardCd = 120;
  }
  if (u === G.player) sfx('click');
  return true;
}

// ================= main update =================
function update(dt: number) {
  if (G.over !== null) {
    G.fx = G.fx.filter((f) => (f.t += dt) < f.max);
    return;
  }
  G.t += dt;
  if (G.t >= (G.tl.length + 1) * 30) {
    const g: [number, number] = [0, 0];
    const d: [number, number] = [0, 0];
    for (const u of G.units) if (u.champ && u.team < 2) {
      g[u.team as 0 | 1] += u.champ.ms.gold;
      d[u.team as 0 | 1] += u.champ.ms.pc + u.champ.ms.mc + u.champ.ms.tc;
    }
    G.tl.push({ t: G.tl.length * 30 + 30, g, d, k: [G.kills[0], G.kills[1]] });
  }
  refreshOpenStructures();
  if (G.t >= G.nextWave) {
    spawnWave();
    G.nextWave += WAVE_INTERVAL;
  }
  updateCamps();
  if ((G.visionT -= dt) <= 0) {
    G.visionT = 0.2;
    computeVision();
  }
  if (!G.platesGone && G.t >= 840) {
    G.platesGone = true;
    for (const t of G.units) t.plates = 0;
    feedMsg('Turret plating has fallen', -1);
  }

  for (const u of G.units) {
    if (u.champ) {
      u.champ.gold += 2 * dt * diffOf(u).gold;
      u.champ.ms.gold += 2 * dt * diffOf(u).gold;
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
      if (u.kind === 'tower' && u.tier === T_INHIB && (u.reviveT -= dt) <= 0) {
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
    if (u.rootT > 0) u.rootT -= dt;
    if (u.airT > 0) u.airT = Math.max(0, u.airT - dt);
    if (u.stealthT > 0) u.stealthT = Math.max(0, u.stealthT - dt);
    if (u.shieldT > 0 && (u.shieldT -= dt) <= 0) u.shield = 0;
    if (u.untargT > 0) u.untargT = Math.max(0, u.untargT - dt);
    if (u.asRedT > 0) u.asRedT = Math.max(0, u.asRedT - dt);
    if (u.silenceT > 0) u.silenceT = Math.max(0, u.silenceT - dt);
    if (u.drT > 0) u.drT = Math.max(0, u.drT - dt);
    if (u.shredT > 0) u.shredT = Math.max(0, u.shredT - dt);
    if (u.unslow > 0) u.unslow = Math.max(0, u.unslow - dt);
    if (u.charmT > 0) {
      u.charmT = Math.max(0, u.charmT - dt);
      if (u.charmSrc && !u.charmSrc.dead && u.stunT <= 0 && dist(u, u.charmSrc) > u.charmSrc.r + u.r + 20) moveToward(u, u.charmSrc.x, u.charmSrc.y, dt, 0.8);
    }
    for (const k in u.marks) if ((u.marks[k].t -= dt) <= 0) delete u.marks[k];
    if (u.dots.length) {
      for (const dot of u.dots) {
        dot.t -= dt;
        dot.acc += dt;
        if (dot.acc >= 0.5 || dot.t <= 0) {
          const dur = dot.acc;
          dot.acc = 0;
          if (!dot.src.dead) dealDamage(dot.src, u, dot.dps * dur, dot.type, 'dot');
        }
      }
      u.dots = u.dots.filter((d) => d.t > 0);
      if (u.dead) continue;
    }
    if (u.push) {
      const pu = u.push;
      const rem = Math.hypot(pu.tx - u.x, pu.ty - u.y);
      const step = pu.speed * dt;
      if (rem <= step) {
        u.x = pu.tx;
        u.y = pu.ty;
        u.push = null;
      } else {
        const nx = u.x + ((pu.tx - u.x) / rem) * step;
        const ny = u.y + ((pu.ty - u.y) / rem) * step;
        if (isWall(nx, ny)) u.push = null;
        else {
          u.x = nx;
          u.y = ny;
        }
      }
    }
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.pop > 0) u.pop = Math.max(0, u.pop - dt * 5);
    if (u.lunge > 0) u.lunge = Math.max(0, u.lunge - dt * 5);
    if (u.fadeIn > 0) u.fadeIn = Math.max(0, u.fadeIn - dt);
    const frac = clamp(u.hp / u.maxHp, 0, 1);
    u.hpTrail = frac > u.hpTrail ? frac : Math.max(frac, u.hpTrail - dt * 0.55);
    if (u.kind === 'champ') updateChamp(u, dt);
    else if (u.kind === 'minion') updateMinion(u, dt);
    else if (u.kind === 'monster') updateMonster(u, dt);
    else if (u.kind === 'ward') {
      // stealth wards hide from the enemy until an enemy Control Ward is within 900; Control Wards are always visible
      u.stealthT = u.tier === 1 || G.units.some((o) => o.kind === 'ward' && o.tier === 1 && !o.dead && o.team !== u.team && dist(o, u) <= 900) ? 0 : 1;
      if ((u.life -= dt) <= 0) u.dead = true;
    }
    if (u.pathT > 0) u.pathT -= dt;
    if (u.kind === 'champ' || u.kind === 'minion' || u.kind === 'monster') pushOut(u);
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
        if (p.cb) p.cb(t, p);
        else applyAuto(p.owner, t, p.dmg, p.dmgType);
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
      if (e.kind !== 'champ' && (p.champOnly || (e.kind !== 'minion' && e.kind !== 'monster'))) continue;
      if (dist(p, e) > p.width / 2 + e.r) continue;
      p.hit.add(e);
      if (p.cb) p.cb(e, p);
      else if (p.a) hitEnemy(p.owner, e, p.a, p.dmg, p);
      else {
        dealDamage(p.owner, e, p.dmg, p.dmgType);
        if (p.slow) {
          e.slowAmt = p.slow;
          e.slowT = p.slowT;
        }
        if (p.stun) e.stunT = Math.max(e.stunT, p.stun);
      }
      if (onScreen(e)) burst(e.x, e.y, 10, { kind: 'ember', color: p.color, speed: 300, life: 0.35, size: 4, drag: 5 });
      if (!p.pierce || (p.maxHits && p.hit.size >= p.maxHits)) {
        p.done = true;
        break;
      }
    }
    if (p.traveled >= p.max) p.done = true;
  }
  for (const p of G.projs)
    if (p.done && p.onEnd && !p.ended) {
      p.ended = true;
      p.onEnd(p);
    }
  G.projs = G.projs.filter((p) => !p.done);
  for (const f of G.kfx) {
    f.t -= dt;
    if (f.fn(dt, Math.max(0, f.t)) === false) f.t = 0;
  }
  G.kfx = G.kfx.filter((f) => f.t > 0);

  for (const pd of G.pending) pd.t -= dt;
  const fire = G.pending.filter((pd) => pd.t <= 0);
  G.pending = G.pending.filter((pd) => pd.t > 0);
  for (const pd of fire) pd.fn();
  updateZones(dt);

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

  G.units = G.units.filter((u) => !((u.kind === 'minion' || u.kind === 'monster' || u.kind === 'ward') && u.dead));
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
    if (img && orb && !orb.querySelector('img')) {
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
  const img = `${import.meta.env.BASE_URL}img/champ/${c.def.key ?? c.def.id}.png`;
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
  for (const u of G.units) (u as Unit & { fogged?: boolean }).fogged = u.team !== P.team && fogged(u);
  syncUnits(G.units, { dt: animDt, time: now, hovered, winner: G.over, view, viewTeam: P.team as Team });
  animDt = 0;

  // ---- ground decals: telegraphs, rings and smoke sit under the units ----
  const d = beginDecals(view);
  for (const b of BASES) {
    d.globalCompositeOperation = 'lighter';
    drawGlow(d, b.x, b.y, FOUNTAIN_R * 0.9, '#3a6fd8', 0.18 + 0.05 * Math.sin(now * 2));
    d.globalCompositeOperation = 'source-over';
  }
  for (const pd of G.pending) pd.draw(d, 1 - pd.t / pd.total);
  for (const z of zoneViews()) {
    if (z.once && z.team !== P.team) continue; // traps are hidden from the enemy
    d.globalAlpha = z.once ? 0.55 : 0.9;
    d.fillStyle = z.color + (z.once ? '18' : '26');
    d.strokeStyle = z.color;
    d.lineWidth = 5;
    d.setLineDash(z.once ? [10, 10] : []);
    d.beginPath();
    d.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    d.fill();
    d.stroke();
    d.setLineDash([]);
    if (!z.once) {
      d.lineWidth = 9;
      d.beginPath();
      d.arc(z.x, z.y, z.r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * z.k);
      d.stroke();
    }
    d.globalAlpha = 1;
  }
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
      if (t.kind !== 'tower' || t.tier === T_INHIB || t.dead || t.team === P.team) continue;
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
    if (u.dead || !visible(u) || hiddenFrom(u, P)) continue;
    if (u.rootT > 0) {
      d.strokeStyle = 'rgba(190,220,140,0.9)';
      d.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const ang = now * 1.5 + (i * Math.PI) / 2;
        d.beginPath();
        d.arc(u.x, u.y, u.r + 10, ang, ang + 0.9);
        d.stroke();
      }
    }
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
  if (!demoMode) drawFog(z);

  // structure crystals and tower lasers
  ctx.globalCompositeOperation = 'lighter';
  for (const u of G.units) {
    if ((u.kind !== 'tower' && u.kind !== 'nexus') || u.dead || !visible(u)) continue;
    const col = TEAM_COLOR[u.team];
    const inhib = u.kind === 'tower' && u.tier === T_INHIB;
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
    if (u.dead || !visible(u) || u.kind === 'champ' || u.kind === 'ward' || hiddenFrom(u, P)) continue;
    if (u.kind === 'monster') {
      const big = (u.monster === 'drake' || u.monster === 'colossus');
      const s = screenOf(u.x, u.y, unitHeight(u) + 24);
      hpBar(s.x, s.y, (big ? 150 : u.r > 45 ? 90 : 56) * ui, big ? 9 : 5, u.hp / u.maxHp, u.hpTrail, '#c8a050');
      if (big || u.r > 45) {
        ctx.font = '600 11px Geist, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(u.name, s.x, s.y - 10);
        ctx.fillStyle = '#f0e2b8';
        ctx.fillText(u.name, s.x, s.y - 10);
      }
      continue;
    }
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
    if (u.kind !== 'champ' || u.dead || !visible(u) || hiddenFrom(u, P)) continue;
    const c = u.champ!;
    const s = screenOf(u.x, u.y, unitHeight(u) + 34 + (u.airT > 0 ? 70 * Math.min(1, u.airT * 4) : 0));
    const w = 104 * ui;
    const col = u === P && !demoMode ? '#4fd34a' : u.team === P.team ? '#4a9cff' : '#e8473c';
    hpBar(s.x + 11, s.y, w, 11, u.hp / u.maxHp, u.hpTrail, col, u.maxHp);
    if (u.shield > 0) {
      // shield rides on the bar as a white segment after current health
      const tot = Math.max(u.maxHp, u.hp + u.shield);
      const x0 = s.x + 11 - w / 2 + w * clamp(u.hp / tot, 0, 1);
      ctx.fillStyle = 'rgba(240,244,255,0.92)';
      ctx.fillRect(x0, s.y, Math.min(w * (u.shield / tot), s.x + 11 + w / 2 - x0), 11);
    }
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

const fogCanvases = new Map<string, HTMLCanvasElement>();
function fogCanvas(w: number, h: number) {
  const key = `${w}x${h}`;
  let c = fogCanvases.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    fogCanvases.set(key, c);
  }
  return c;
}
// Darkens what your team can't see. Drawn at quarter resolution with soft edges; ground maps to
// the screen affinely, so each sight circle is an ellipse squashed by K.
const SIGHT_RAYS = 144;
const sightCache = new Map<Unit, { x: number; y: number; r: number; poly: Vec[] }>();
// Points where rays from u stop: at its sight radius or the first jungle wall (towers see over walls).
function sightPoly(u: Unit, r: number): Vec[] {
  const hit = sightCache.get(u);
  if (hit && Math.abs(hit.x - u.x) < 8 && Math.abs(hit.y - u.y) < 8 && hit.r === r) return hit.poly;
  const poly: Vec[] = [];
  const step = 25;
  for (let i = 0; i < SIGHT_RAYS; i++) {
    const a = (i / SIGHT_RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = step;
    if (u.kind !== 'tower' && u.kind !== 'nexus') {
      for (; d < r; d += step) if (isWall(u.x + dx * d, u.y + dy * d)) break;
      if (d < r) d += 30; // let the wall's face show
    }
    d = Math.min(d, r);
    poly.push({ x: u.x + dx * d, y: u.y + dy * d });
  }
  sightCache.set(u, { x: u.x, y: u.y, r, poly });
  if (sightCache.size > 400) sightCache.clear();
  return poly;
}
function drawFog(z: number) {
  const q = 4;
  const fw = Math.ceil(W / q);
  const fh = Math.ceil(H / q);
  const fc = fogCanvas(fw, fh);
  const f = fc.getContext('2d')!;
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, fw, fh);
  f.fillStyle = 'rgba(2,8,18,0.55)';
  f.fillRect(0, 0, fw, fh);
  f.globalCompositeOperation = 'destination-out';
  const halfW = W / 2 / z;
  for (const o of G.units) {
    if (o.dead || o.team !== G.player.team || o.kind === 'monster' || (o.kind === 'tower' && o.tier === T_INHIB)) continue;
    const r = SIGHT[o.kind];
    if (Math.abs(o.x - rcx) > halfW + r || Math.abs(o.y - rcy) > H / (z * K) + r) continue;
    // sight stops at jungle walls: cast rays and cut the circle down to what's in line of sight
    const sp = screenOf(o.x, o.y, 0);
    const rx = (r * z) / q;
    const g = f.createRadialGradient(0, 0, rx * 0.8, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    const poly = sightPoly(o, r);
    f.save();
    f.translate(sp.x / q, sp.y / q);
    f.scale(1, K);
    f.fillStyle = g;
    f.beginPath();
    poly.forEach((p, i) => (i ? f.lineTo(((p.x - o.x) * z) / q, ((p.y - o.y) * z) / q) : f.moveTo(((p.x - o.x) * z) / q, ((p.y - o.y) * z) / q)));
    f.closePath();
    f.fill();
    f.restore();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fc, 0, 0, fw * q, fh * q);
}
function drawMinimap() {
  const s = 220 / MAP;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(minimapCanvas, 0, 0, 220, 220);
  // fog of war: everything outside your team's sight is dimmed
  const fc = fogCanvas(220, 220);
  const f = fc.getContext('2d')!;
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, 220, 220);
  f.fillStyle = 'rgba(0,6,14,0.5)';
  f.fillRect(0, 0, 220, 220);
  f.globalCompositeOperation = 'destination-out';
  f.fillStyle = '#000';
  for (const o of G.units) {
    if (o.dead || o.team !== G.player.team || o.kind === 'monster' || (o.kind === 'tower' && o.tier === T_INHIB)) continue;
    f.beginPath();
    f.arc(o.x * s, o.y * s, SIGHT[o.kind] * s, 0, Math.PI * 2);
    f.fill();
  }
  mctx.drawImage(fc, 0, 0);
  for (const u of G.units) {
    if (u.dead || hiddenFrom(u, G.player)) continue;
    const x = u.x * s;
    const y = u.y * s;
    mctx.fillStyle = TEAM_COLOR[u.team];
    if (u.kind === 'ward') {
      mctx.fillStyle = u.tier === 1 ? '#ff4fd8' : '#ffe27a';
      mctx.fillRect(x - 2, y - 2, 4, 4);
    } else if (u.kind === 'monster') {
      const big = u.r > 45;
      mctx.fillStyle = u.monster === 'drake' || u.monster === 'colossus' ? '#d58cff' : '#e8c46a';
      mctx.beginPath();
      mctx.arc(x, y, big ? 4 : 2.2, 0, Math.PI * 2);
      mctx.fill();
    } else if (u.kind === 'tower') mctx.fillRect(x - 4, y - 4, 8, 8);
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
    if (u.team === G.player.team || !targetable(u) || fogged(u)) continue;
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
    ...c.def.abilities.map((a) => ({ name: a.name, desc: a.desc, color: a.color, cd: a.cds ? a.cds.join('/') : a.cd, extra: abilityCostText(c.def, a) })),
    { name: 'Flash', desc: 'Blink a short distance.', color: '#fff6a8', cd: 180, extra: '' },
    c.spell2 === 'smite'
      ? { name: 'Smite', desc: 'Deal heavy true damage to a monster or minion (hover it, or the nearest is chosen). Secures buffs and epic monsters.', color: '#ffcf6a', cd: 75, extra: '' }
      : { name: 'Heal', desc: 'Restore health and gain a burst of speed.', color: '#7dff9c', cd: 150, extra: '' },
  ];
  defs.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (i > 3 ? ' spell' : '');
    el.title = `${d.name} (${keys[i]}) — ${d.desc} Cooldown ${d.cd}s${d.extra}${i === 0 && c.def.passive ? `\nPassive, ${c.def.passive.name}: ${c.def.passive.desc}` : ''}`;
    const cost = i < 4 ? costOf(c, i) : 0;
    el.innerHTML = `<div class="ico" style="background:radial-gradient(circle at 35% 30%, ${d.color}, #111 85%)">${i > 3 ? '' : d.name}</div><div class="cd"></div><div class="cdt"></div><span class="key">${keys[i]}</span>${
      i < 4 ? `<span class="mana">${cost}</span><div class="pips"></div><button class="plus" title="Learn (Ctrl+${keys[i]})">+</button>` : ''
    }`;
    if (i < 4)
      el.querySelector('.plus')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (canRank(G.player.champ!, i)) command({ c: 'rank', s: i });
      });
    ab.appendChild(el);
    slotEls.push({ root: el, cd: el.querySelector('.cd')!, cdt: el.querySelector('.cdt')!, pips: el.querySelector<HTMLElement>('.pips') });
  });
  const wd = document.createElement('div');
  wd.className = 'slot spell';
  wd.id = 'wardslot';
  wd.title = 'Trinket ward (4) — place a hidden ward at the cursor that reveals the area for 90s. 2 charges, 120s recharge.';
  wd.innerHTML = `<div class="ico" style="background:radial-gradient(circle at 35% 30%, #ffe27a, #111 85%)">Ward</div><div class="cd"></div><div class="cdt"></div><span class="key">4</span>`;
  ab.appendChild(wd);
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
  const ws = document.getElementById('wardslot');
  if (ws) {
    const cc = G.player.champ!;
    setText(ws.querySelector<HTMLElement>('.cdt')!, 'wardcdt', cc.wards > 0 ? `${cc.wards}` : `${Math.ceil(cc.wardCd)}`);
    ws.classList.toggle('down', cc.wards <= 0);
  }
  slotEls.forEach((s, i) => {
    const v = all[i];
    readyFlash(s.root, 'slot' + i, v);
    s.cd.style.height = `${v > 0 ? clamp(v / maxes[i], 0, 1) * 100 : 0}%`;
    setText(s.cdt, 'cdt' + i, v > 0 ? String(Math.ceil(v)) : '');
    if (i < 4) {
      s.root.classList.toggle('locked', c.ranks[i] === 0);
      s.root.classList.toggle('nomana', c.ranks[i] > 0 && P.mp < costOf(c, i));
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
    (_, i) => `<div title="${c.items[i] ? ITEM_MAP[c.items[i]].name : ''}" class="${c.items[i] ? 'full' : ''}${i === fresh ? ' new' : ''}">${c.items[i] ? itemImg(ITEM_MAP[c.items[i]]) : ''}</div>`,
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

function feedMsg(text: string, team: Side | -1) {
  if (relaying()) evq.push(['f', text, team]);
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
let shopTab = 'rec';
const SHOP_TABS: [string, string, (i: ItemDef, c: Champ) => boolean][] = [
  ['rec', 'Recommended', (i, c) => c.def.build.includes(i.id) || (i.into ?? []).some((x) => c.def.build.includes(x)) || (i.into ?? []).some((x) => (ITEM_MAP[x]?.into ?? []).some((y) => c.def.build.includes(y)))],
  ['atk', 'Attack', (i) => !!(i.ad || i.as || i.ls)],
  ['mag', 'Magic', (i) => !!(i.ap || i.mp)],
  ['def', 'Defense', (i) => !!(i.hp || i.armor || i.mr)],
  ['boot', 'Boots', (i) => !!i.boots],
  ['all', 'All', () => true],
];
const itemImg = (it: ItemDef) => (it.icon ? `<img class="ico" src="${iconUrl(it)}" alt="" loading="lazy" draggable="false">` : '<span class="ico ward"></span>');
function renderShop() {
  const c = G.player.champ!;
  const ok = canShop();
  const note = ok
    ? c.items.length >= 6
      ? 'Inventory full — buying a completed item with owned components still works.'
      : 'Tap an item to buy it. Owned components are used up and lower the price.'
    : 'You can only buy items while in your fountain (press B to recall).';
  const tab = SHOP_TABS.find((t) => t[0] === shopTab) ?? SHOP_TABS[0];
  const list = ITEMS.filter((it) => it.consumable || tab[2](it, c));
  const rec = new Set(c.def.build);
  const html =
    `<div class="stabs">${SHOP_TABS.map((t) => `<button data-tab="${t[0]}" class="${t[0] === shopTab ? 'on' : ''}">${t[1]}</button>`).join('')}</div>` +
    list
      .sort((x, y) => (rec.has(y.id) ? 1 : 0) - (rec.has(x.id) ? 1 : 0) || x.cost - y.cost)
      .map((it) => {
        const q = it.consumable ? { cost: it.cost } : quote(it.id, c.items, ITEM_MAP);
        const off = !canBuy(G.player, it.id);
        const own = c.items.includes(it.id);
        return `<button class="item${rec.has(it.id) ? ' rec' : ''}${own ? ' own' : ''}" data-id="${it.id}" ${off ? 'disabled' : ''}>${itemImg(it)}<span class="cost">${q.cost}${q.cost !== it.cost ? `<s>${it.cost}</s>` : ''}</span><b>${it.name}</b><small>${it.desc}</small></button>`;
      })
      .join('');
  if (hudCache.get('shop') !== html + note + c.gold) {
    hudCache.set('shop', html + note + c.gold);
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
function canBuy(u: Unit, id: string): boolean {
  const it = ITEM_MAP[id];
  const c = u.champ!;
  const inShop = u.dead || dist(u, BASES[u.team]) < FOUNTAIN_R + 60;
  if (!it || !inShop) return false;
  if (it.consumable) return c.gold >= it.cost && c.pinks < 2;
  const q = quote(id, c.items, ITEM_MAP);
  if (c.gold < q.cost) return false;
  if (c.items.length - q.consumed.length >= 6) return false;
  if (c.items.includes(id) && it.unique) return false;
  if (it.boots) {
    const left = c.items.filter((x, i) => !q.consumed.includes(i));
    if (left.some((x) => ITEM_MAP[x]?.boots)) return false;
  }
  return true;
}
function buyItem(u: Unit, id: string) {
  if (!canBuy(u, id)) return;
  const c = u.champ!;
  const it = ITEM_MAP[id];
  if (it.consumable) {
    c.gold -= it.cost;
    c.pinks++;
    return;
  }
  const q = quote(id, c.items, ITEM_MAP);
  c.gold -= q.cost;
  c.items = c.items.filter((_, i) => !q.consumed.includes(i));
  c.items.push(id);
  c.itemLog.push([Math.round(G.t), id]);
  recalc(u);
}
$('shopgrid').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  const tabBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
  if (tabBtn) {
    shopTab = tabBtn.dataset.tab!;
    hudCache.delete('shop');
    renderShop();
    return;
  }
  if (!btn || btn.disabled || !btn.dataset.id) return;
  if (!canBuy(G.player, btn.dataset.id!)) return;
  command({ c: 'buy', item: btn.dataset.id! });
  lastBuyAt = performance.now();
  sfx('buy');
  btn.classList.add('bought');
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
  void c;
  const t = hoverUnit();
  if (t) command({ c: 'attack', id: t.id });
  else {
    const w = toWorld(mouse.x, mouse.y);
    command({ c: 'move', x: w.x, y: w.y });
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
    if (t && !G.player.dead) command({ c: 'attack', id: t.id });
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
    G.zoom = clampZoom(G.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
  },
  { passive: false },
);
mini.addEventListener('pointerdown', (e) => {
  if (!running) return;
  const r = mini.getBoundingClientRect();
  const wx = ((e.clientX - r.left) / r.width) * MAP;
  const wy = ((e.clientY - r.top) / r.height) * MAP;
  if (e.button === 2 || G.camLocked) {
    if (!G.player.dead) {
      command({ c: 'move', x: wx, y: wy });
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
  const slot = ['q', 'w', 'e', 'r'].indexOf(k);
  if (slot >= 0 && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (canRank(c, slot)) command({ c: 'rank', s: slot });
    return;
  }
  if (P.dead) return;
  if (slot >= 0) {
    if (e.repeat) return;
    if (castReady(P, slot)) kbAim = slot; // hold to show range, release to cast
    else {
      sfx('nope');
      const a = c.def.abilities[slot];
      if (c.ranks[slot] === 0) addText(P.x, P.y - 60, canRank(c, slot) ? 'Learn it first (Ctrl+key)' : slot === 3 ? 'Learn at level 6' : 'Not learned', '#aaa', 14);
      else if (P.mp < costOf(c, slot) && c.cds[slot] <= 0) addText(P.x, P.y - 60, 'Not enough mana', '#6fb0ff', 14);
    }
    return;
  }
  if (k === 'd') command({ c: 'flash', x: w.x, y: w.y });
  else if (k === 'f') command({ c: 'heal', id: hoverUnit(30)?.id });
  else if (k === '4') command({ c: 'ward', x: w.x, y: w.y });
  else if (k === '5') command({ c: 'ward', x: w.x, y: w.y, pink: true });
  else if (k === 'b') command({ c: 'recall' });
  else if (k === 's') command({ c: 'stop' });
});

// Hold Q/W/E/R to preview range and area; release to cast at the cursor. Right-click cancels.
let kbAim: number | null = null;
window.addEventListener('keyup', (e) => {
  if (kbAim === null) return;
  const slot = ['q', 'w', 'e', 'r'].indexOf(e.key.toLowerCase());
  if (slot !== kbAim) return;
  kbAim = null;
  if (!running || G.over !== null || G.player.dead || !castReady(G.player, slot)) return;
  const w = toWorld(mouse.x, mouse.y);
  command({ c: 'cast', s: slot, x: w.x, y: w.y });
});
window.addEventListener('contextmenu', () => (kbAim = null));
window.addEventListener('blur', () => (kbAim = null));

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

// Zoom: the default view is as far out as you can go (like the real game); pinch / wheel zooms in.
const baseZoom = () => (TOUCH ? clamp(Math.max(W, H) / 1500, 0.45, 0.8) : 0.62);
const ZOOM_IN = 2.4;
const clampZoom = (z: number) => clamp(z, baseZoom(), baseZoom() * ZOOM_IN);
{
  let startD = 0;
  let startZ = 1;
  const isField = (t: EventTarget | null) => t === canvas || t === canvas3d || t === joyzone || (t as HTMLElement | null)?.id === 'vignette';
  const dist2 = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  document.addEventListener(
    'touchstart',
    (e) => {
      if (!running || !G || e.touches.length !== 2) return;
      if (!isField(e.touches[0].target) || !isField(e.touches[1].target)) return;
      joyStop();
      startD = dist2(e.touches[0], e.touches[1]);
      startZ = G.zoom;
    },
    { passive: true, capture: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 2 && startD > 0 && running && G) {
        e.preventDefault();
        G.zoom = clampZoom((startZ * dist2(e.touches[0], e.touches[1])) / startD);
      }
    },
    { passive: false, capture: true },
  );
  const stop = (e: TouchEvent) => {
    if (e.touches.length < 2) startD = 0;
  };
  document.addEventListener('touchend', stop, { capture: true });
  document.addEventListener('touchcancel', stop, { capture: true });
  // Safari fires its own page-zoom gestures; the game owns pinch
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  document.addEventListener('dblclick', (e) => { if (running) e.preventDefault(); });
}
const AIM_DEAD = 16; // px of drag before a press becomes an aimed cast
const AIM_MAX = 80; // px of drag that maps to full range
const joy = { id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
let joySend = 0;
let joyMoving = false;
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
  if (a.aim) return a.aim.shape === 'self' || a.aim.shape === 'none' ? 0 : a.aim.reach;
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
  if (slot === 4) command({ c: 'flash', x: at.x, y: at.y });
  else if (castReady(P, slot)) command({ c: 'cast', s: slot, x: at.x, y: at.y });
  else {
    sfx('nope');
    const c = P.champ!;
    if (c.ranks[slot] === 0) addText(P.x, P.y - 60, canRank(c, slot) ? 'Tap + to learn it' : slot === 3 ? 'Learn at level 6' : 'Not learned', '#aaa', 14);
    else if (P.mp < costOf(c, slot) && c.cds[slot] <= 0) addText(P.x, P.y - 60, 'Not enough mana', '#6fb0ff', 14);
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
  if (t) command({ c: 'attack', id: t.id });
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
    void c;
    // guests send the joystick ten times a second; the host applies it every frame
    if (net.role !== 'guest' || (joySend -= dt) <= 0) {
      joySend = 0.1;
      command({ c: 'move', x: P.x + facing.x * 160, y: P.y + facing.y * 160 });
    }
    joyMoving = true;
    return;
  }
  if (joyMoving) {
    joyMoving = false;
    command({ c: 'stop' });
  }
  if (attackHeld && (attackTick -= dt) <= 0) {
    attackTick = 0.25;
    touchAttack(attackHeld);
  }
}

function drawAim(ctx: CanvasRenderingContext2D) {
  const P = G.player;
  let slot: number;
  let t: Vec;
  let col = '#ffffff';
  if (kbAim !== null && !P.dead) {
    slot = kbAim;
    const m = toWorld(mouse.x, mouse.y);
    const reach = aimReach(slot);
    const d = Math.hypot(m.x - P.x, m.y - P.y) || 1;
    const nova = P.champ!.def.abilities[slot].kind === 'nova' || P.champ!.def.abilities[slot].aim?.shape === 'circle';
    const k = nova ? Math.min(1, reach / d) : reach / d;
    t = { x: P.x + (m.x - P.x) * k, y: P.y + (m.y - P.y) * k };
  } else if (aim && aim.aiming) {
    slot = aim.slot;
    t = aimTarget(aim);
    if (aim.cancel) col = '#ff4d4d';
  } else return;
  const def = slot < 4 ? P.champ!.def.abilities[slot] : null;
  const shape = def?.aim;
  if (shape) return drawAimShape(ctx, shape, t, col, slot);
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = col;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(P.x, P.y, aimReach(slot), 0, Math.PI * 2);
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
// League-style indicators: thin white range ring, a translucent skillshot rectangle / ground circle /
// cone / self radius, and a highlight on the unit a targeted spell would pick.
function drawAimShape(ctx: CanvasRenderingContext2D, a: import('./data').AimShape, t: Vec, col: string, slot: number) {
  const P = G.player;
  const dx = t.x - P.x;
  const dy = t.y - P.y;
  const len = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const fill = col === '#ffffff' ? 'rgba(180,225,255,0.22)' : 'rgba(255,77,77,0.25)';
  const edge = col === '#ffffff' ? 'rgba(235,248,255,0.85)' : 'rgba(255,90,90,0.9)';
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = edge;
  ctx.fillStyle = fill;
  const ring = (r: number) => {
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  switch (a.shape) {
    case 'line': {
      ctx.translate(P.x, P.y);
      ctx.rotate(ang);
      const w = a.w ?? 80;
      ctx.beginPath();
      ctx.rect(0, -w / 2, a.reach, w);
      ctx.fill();
      ctx.stroke();
      // arrow head so the direction reads at a glance
      ctx.beginPath();
      ctx.moveTo(a.reach, -w * 0.9);
      ctx.lineTo(a.reach + w * 0.9, 0);
      ctx.lineTo(a.reach, w * 0.9);
      ctx.closePath();
      ctx.fillStyle = edge;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      break;
    }
    case 'circle': {
      ring(a.reach);
      const k = Math.min(1, a.reach / len);
      const cx = P.x + dx * k;
      const cy = P.y + dy * k;
      ctx.beginPath();
      ctx.arc(cx, cy, a.r ?? 200, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'cone': {
      const half = (((a.deg ?? 50) / 2) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(P.x, P.y);
      ctx.arc(P.x, P.y, a.reach, ang - half, ang + half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'self': {
      ctx.beginPath();
      ctx.arc(P.x, P.y, a.r ?? 300, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'target': {
      ring(a.reach);
      // the unit under (or nearest) the cursor, if the spell could reach it
      let best: Unit | null = null;
      let bd = 220;
      for (const e of G.units) {
        if (e.dead || e.team === P.team || !targetable(e) || fogged(e) || dist(e, P) > a.reach + e.r) continue;
        if (e.kind !== 'champ' && e.kind !== 'minion' && e.kind !== 'monster') continue;
        const d = Math.hypot(e.x - t.x, e.y - t.y) - e.r;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(best.x, best.y, best.r + 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
  void slot;
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
    G.player.champ!.spell2 === 'smite'
      ? { id: 'f', label: 'Smite', angle: 72, r: 200, size: 48, color: '#ffcf6a' }
      : { id: 'f', label: 'Heal', angle: 72, r: 200, size: 48, color: '#7dff9c' },
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
        if (running && canRank(G.player.champ!, rs)) command({ c: 'rank', s: rs });
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
      command({ c: 'heal' });
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
      b.el!.classList.toggle('nomana', c.ranks[i] > 0 && P.mp < costOf(c, i));
      b.el!.classList.toggle('learn', canRank(c, i));
    }
  }
  setText($('mlevel'), 'mlevel', String(c.level));
  setText($('mgold'), 'mgold', String(Math.floor(c.gold)));
  setText($('mkda'), 'mkda', `${c.kills}/${c.deaths}/${c.assists} · CS ${c.cs}`);
  $('mhpfill').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`;
  $('mmpfill').style.transform = `scaleX(${clamp(P.mp / (P.maxMp || 1), 0, 1)})`;
}

// floating joystick. iOS Safari is driven by Touch Events (tracked by identifier on the document,
// so lifting a thumb anywhere ends the stick); other browsers use Pointer Events.
const joyzone = $('joyzone');
function joyStart(id: number, x: number, y: number) {
  joy.id = id;
  joy.bx = x;
  joy.by = y;
  joy.dx = joy.dy = 0;
  const base = $('joybase');
  base.style.left = `${x}px`;
  base.style.top = `${y}px`;
  base.classList.add('on');
  $('joyknob').style.transform = 'translate(-50%, -50%)';
}
function joyMove(x: number, y: number) {
  const max = 60 * touchScale;
  let dx = x - joy.bx;
  let dy = y - joy.by;
  const d = Math.hypot(dx, dy);
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
  }
  joy.dx = dx;
  joy.dy = dy;
  $('joyknob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
function joyStop() {
  joy.id = -1;
  joy.dx = joy.dy = 0;
  $('joybase').classList.remove('on');
}
if ('ontouchstart' in window) {
  const TOUCH_ID = 100000; // keeps touch identifiers apart from pointer ids
  joyzone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      if (!running) return;
      // a stick whose finger is gone (missed touchend) gets reset instead of locking up
      if (joy.id >= 0 && ![...e.touches].some((t) => t.identifier + TOUCH_ID === joy.id)) joyStop();
      if (joy.id >= 0) return;
      const t = e.changedTouches[0];
      joyStart(t.identifier + TOUCH_ID, t.clientX, t.clientY);
    },
    { passive: false },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (joy.id < 0) return;
      for (const t of e.changedTouches)
        if (t.identifier + TOUCH_ID === joy.id) {
          e.preventDefault();
          joyMove(t.clientX, t.clientY);
        }
    },
    { passive: false },
  );
  const end = (e: TouchEvent) => {
    if (joy.id < 0) return;
    for (const t of e.changedTouches) if (t.identifier + TOUCH_ID === joy.id) joyStop();
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
} else {
  joyzone.addEventListener('pointerdown', (e) => {
    if (!running || joy.id >= 0) return;
    e.preventDefault();
    try {
      joyzone.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
    joyStart(e.pointerId, e.clientX, e.clientY);
  });
  joyzone.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) joyMove(e.clientX, e.clientY);
  });
  const joyEnd = (e: PointerEvent) => {
    if (e.pointerId === joy.id) joyStop();
  };
  joyzone.addEventListener('pointerup', joyEnd);
  joyzone.addEventListener('pointercancel', joyEnd);
}
$('mshop').addEventListener('click', () => toggleShop());
$('mrecall').addEventListener('click', () => running && command({ c: 'recall' }));
$('mward').addEventListener('click', () => {
  if (!running) return;
  const P = G.player;
  const pink = P.champ!.wards <= 0 && P.champ!.pinks > 0; // out of trinket charges: drop a Control Ward
  command({ c: 'ward', x: P.x + facing.x * 400, y: P.y + facing.y * 400, pink });
});
window.addEventListener('resize', () => {
  if (G) G.zoom = clampZoom(G.zoom);
  if (TOUCH && G) layoutTouch();
});

// ================= multiplayer: commands, snapshots, lobby =================
const remote = new Map<string, Unit>(); // host: each guest's champion
const remoteUnits = () => [...remote.values()];
const castReady = (u: Unit, slot: number) => {
  const c = u.champ!;
  return !u.dead && u.stunT <= 0 && c.cds[slot] <= 0 && !c.dash && c.ranks[slot] > 0 && u.mp >= costOf(c, slot);
};

// Every player action becomes a command: applied directly by the host, sent to the host by guests.
function command(cmd: Cmd) {
  if (!G || !running) return;
  if (net.role === 'guest') {
    sendToHost({ t: 'cmd', cmd });
    return;
  }
  inSim = true;
  try {
    applyCmd(G.player, cmd);
  } finally {
    inSim = false;
  }
}
function applyCmd(u: Unit, cmd: Cmd) {
  const c = u.champ;
  if (!c || G.over !== null) return;
  switch (cmd.c) {
    case 'move':
      if (u.dead) return;
      c.recallT = 0;
      c.order = { type: 'move', x: clamp(cmd.x, 30, MAP - 30), y: clamp(cmd.y, 30, MAP - 30) };
      break;
    case 'attack': {
      const t = G.units.find((o) => o.id === cmd.id);
      if (!t || u.dead || t.team === u.team || !targetable(t)) return;
      c.recallT = 0;
      c.order = { type: 'attack', target: t };
      break;
    }
    case 'cast':
      cast(u, cmd.s, cmd.x, cmd.y);
      break;
    case 'flash':
      castFlash(u, cmd.x, cmd.y);
      break;
    case 'heal':
      if (c.spell2 === 'smite') castSmite(u, cmd.id ? G.units.find((o) => o.id === cmd.id) : null);
      else castHeal(u);
      break;
    case 'ward':
      if (!placeWard(u, cmd.x, cmd.y, !!cmd.pink)) addText(u.x, u.y - 60, cmd.pink ? 'No Control Ward' : 'Ward on cooldown', '#aaa', 14);
      break;
    case 'recall':
      startRecall(u);
      break;
    case 'stop':
      c.order = null;
      c.recallT = 0;
      break;
    case 'rank':
      rankUp(u, cmd.s);
      break;
    case 'buy':
      buyItem(u, cmd.item);
      break;
  }
}

// ---- host -> guest snapshots ----
const KINDS: Kind[] = ['champ', 'minion', 'tower', 'nexus', 'monster', 'ward'];
type URow = [number, number, Side, number, number, number, number, number, number, number, string, number, number, number, number, string, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type CRow = [number, string, number, number, number, string[], number[], number[], number, number, number, number, number, number[], number, number, number, string, number, number, number, number, number, number, number, number];
type PRow = [number, number, string, number, number, number, number, number, number];
interface Snap {
  t: number;
  k: [number, number];
  o: Team | null;
  op: number[];
  u: URow[];
  c: CRow[];
  p: PRow[];
  pd: [Tele, number, number][];
  bm: [number, number, number, number, number, number, string][];
  ev: Ev[];
  z: [number, number, number, string, number, Side, number][];
}
function encodeSnap(): Snap {
  const ev = evq;
  evq = [];
  return {
    t: r2(G.t),
    k: G.kills,
    o: G.over,
    op: [...G.open].map((u) => u.id),
    u: G.units.map((u) => [
      u.id, KINDS.indexOf(u.kind), u.team, r1(u.x), r1(u.y), Math.round(u.hp), Math.round(u.maxHp), u.dead ? 1 : 0, r2(u.face), u.actN, u.act,
      r2(u.lunge), r2(u.hitFlash), r2(u.stunT), r2(u.slowT), u.monster ?? u.mtype ?? '', u.tier, u.lane, u.r, Math.round(u.mp), Math.round(u.maxMp),
      u.target && !u.target.dead ? u.target.id : 0, r2(u.pop), r2(u.fadeIn), r2(u.lx), r2(u.ly),
      Math.round(u.shield), r2(u.stealthT), r2(u.rootT), r2(u.airT),
    ]),
    c: G.units
      .filter((u) => u.champ)
      .map((u) => {
        const c = u.champ!;
        return [
          u.id, c.def.id, c.level, Math.round(c.xp), Math.floor(c.gold), c.items, c.cds.map(r1), c.spellCds.map(r1), r1(c.respawnT),
          c.kills, c.deaths, c.assists, c.cs, c.ranks, r2(c.recallT), c.buffs.length, c.dash ? 1 : 0, u.name, ROLES.indexOf(c.role),
          Math.round(u.ad), Math.round(u.ap), Math.round(u.armor), Math.round(u.mr), r2(effAS(u)), Math.round(effMS(u) || u.ms), c.haste,
        ];
      }),
    p: G.projs.map((p) => [r1(p.x), r1(p.y), p.color, p.homing?.id ?? 0, p.width, r2(p.dx), r2(p.dy), KINDS.indexOf(p.owner.kind), r1(p.max)]),
    pd: G.pending.filter((p) => p.tele).map((p) => [p.tele!, r2(p.t), r2(p.total)]),
    bm: beams.map((b) => [r1(b.sx), r1(b.sy), r1(b.ex), r1(b.ey), b.w, r2(b.t), b.color]),
    ev,
    z: zoneViews().map((z) => [r1(z.x), r1(z.y), z.r, z.color, r2(z.k), z.team, z.once ? 1 : 0]),
  };
}

// ---- guest side ----
const byId = new Map<number, Unit>();
const goal = new Map<Unit, Vec>(); // latest host position; units glide toward it
let awaitingYou = 0;
function drawNovaTele(ctx: CanvasRenderingContext2D, px: number, py: number, rad: number, color: string, k: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color + '22';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(px, py, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color + '44';
  ctx.beginPath();
  ctx.arc(px, py, rad * k, 0, Math.PI * 2);
  ctx.fill();
}
function drawBeamTele(ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number, w: number, color: string, k: number) {
  ctx.strokeStyle = color + '55';
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = color + 'aa';
  ctx.lineWidth = w * k;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

function newGuestGame() {
  firstBlood = true;
  streak = 0;
  lastPlayerKill = -99;
  hitStop = slowmo = hurt = 0;
  particles.length = 0;
  shake.trauma = 0;
  resetUnits();
  byId.clear();
  goal.clear();
}

function applySnap(s: Snap) {
  const first = awaitingYou > 0;
  if (first) newGuestGame();
  guestZones = (s.z ?? []).map((z) => ({ x: z[0], y: z[1], r: z[2], color: z[3], k: z[4], team: z[5], once: z[6] === 1 }));
  const seen = new Set<number>();
  const units: Unit[] = [];
  for (const r of s.u) {
    const id = r[0];
    seen.add(id);
    let u = byId.get(id);
    const fresh = !u;
    if (!u) {
      u = makeUnit({ kind: KINDS[r[1]], team: r[2], x: r[3], y: r[4] });
      u.id = id;
      byId.set(id, u);
    }
    u.hp = r[5];
    u.maxHp = r[6];
    u.dead = r[7] === 1;
    u.face = r[8];
    u.actN = r[9];
    u.act = r[10];
    u.lunge = r[11];
    u.hitFlash = r[12];
    u.stunT = r[13];
    u.slowT = r[14];
    if (u.kind === 'monster') u.monster = r[15] as MonsterType;
    else u.mtype = (r[15] || null) as MinionType | null;
    u.tier = r[16];
    u.lane = r[17];
    u.r = r[18];
    u.mp = r[19];
    u.maxMp = r[20];
    u.pop = r[22];
    u.fadeIn = r[23];
    u.lx = r[24];
    u.ly = r[25];
    u.shield = r[26] ?? 0;
    u.stealthT = r[27] ?? 0;
    u.rootT = r[28] ?? 0;
    u.airT = r[29] ?? 0;
    if (fresh || dist(u, { x: r[3], y: r[4] }) > 450) {
      u.x = r[3];
      u.y = r[4];
    }
    goal.set(u, { x: r[3], y: r[4] });
    units.push(u);
  }
  for (const u of units) {
    const r = s.u.find((row) => row[0] === u.id)!;
    u.target = r[21] ? byId.get(r[21]) ?? null : null;
  }
  for (const [id, u] of byId)
    if (!seen.has(id)) {
      byId.delete(id);
      goal.delete(u);
    }
  for (const r of s.c) {
    const u = byId.get(r[0]);
    if (!u) continue;
    if (!u.champ) {
      const def = CHAMPS.find((d) => d.id === r[1]) ?? CHAMPS[0];
      u.champ = makeChamp(def, (u.team === 1 ? 1 : 0) as Team, ROLES[r[18]] ?? 'mid', false).champ;
      u.champ!.isPlayer = true; // never run AI on a guest
    }
    const c = u.champ!;
    const was = { level: c.level, gold: c.gold, cs: c.cs };
    c.level = r[2];
    c.xp = r[3];
    c.gold = r[4];
    c.items = r[5];
    c.cds = r[6];
    c.spellCds = r[7];
    c.respawnT = r[8];
    c.kills = r[9];
    c.deaths = r[10];
    c.assists = r[11];
    c.cs = r[12];
    c.ranks = r[13];
    c.recallT = r[14];
    c.buffs = Array.from({ length: r[15] }, () => ({ as: 0, ms: 0, t: 1 }));
    c.dash = r[16] ? ({} as Dash) : null;
    u.name = r[17];
    u.ad = r[19];
    u.ap = r[20];
    u.armor = r[21];
    u.mr = r[22];
    u.as = r[23];
    u.ms = r[24];
    c.haste = r[25];
    // personal feedback the host doesn't send
    if (!first && G && u === G.player) {
      if (c.level > was.level) levelUpFx(u);
      if (c.cs > was.cs) playSfx('coin');
      if (c.gold - was.gold >= 14) addText(u.x, u.y - 50, `+${Math.round(c.gold - was.gold)}g`, '#ffd700', 14);
    }
  }
  if (first) {
    const me = byId.get(awaitingYou);
    if (!me) return;
    awaitingYou = 0;
    G = {
      t: s.t, units, projs: [], pending: [], kfx: [], tl: [], zones: [], camps: [], drakes: [0, 0], colossus: [0, 0], seen: [new Set(), new Set()], visionT: 0, platesGone: false, fx: [], texts: [], nextWave: 0, waveNo: 0, over: null, kills: s.k,
      open: new Set(), player: me, cam: { x: me.x, y: me.y }, camLocked: true, zoom: baseZoom(), marker: null, focus: null,
    };
    buildHud();
    enterMatch();
  }
  const P = G.player;
  const hpBefore = P.hp;
  G.units = units;
  G.t = s.t;
  G.kills = s.k;
  G.open = new Set(s.op.map((id) => byId.get(id)).filter((u): u is Unit => !!u));
  if (P.hp < hpBefore - P.maxHp * 0.06) hurt = Math.min(1, hurt + 0.6);
  G.projs = s.p.map((r) => ({
    homing: r[3] ? byId.get(r[3]) ?? null : null, x: r[0], y: r[1], dx: r[5], dy: r[6], speed: 0, traveled: 0, max: r[8], width: r[4],
    owner: { kind: KINDS[r[7]] } as Unit, team: 0, dmg: 0, dmgType: 'phys', pierce: false, hit: new Set(), slow: 0, slowT: 0, stun: 0,
    champOnly: false, color: r[2], done: false,
  }));
  G.pending = s.pd.map(([tele, t, total]) => ({
    t,
    total,
    tele,
    fn: () => {},
    draw: (ctx, k) => {
      if (tele[0] === 'n') {
        const f = tele[5] ? byId.get(tele[5]) : null;
        drawNovaTele(ctx, f ? f.x : tele[1], f ? f.y : tele[2], tele[3], tele[4], k);
      } else drawBeamTele(ctx, tele[1], tele[2], tele[3], tele[4], tele[5], tele[6], k);
    },
  }));
  beams.length = 0;
  for (const b of s.bm) beams.push({ sx: b[0], sy: b[1], ex: b[2], ey: b[3], w: b[4], t: b[5], color: b[6] });
  for (const e of s.ev) replay(e);
  if (s.o !== null && G.over === null) {
    G.over = s.o;
    const nexus = G.units.find((n) => n.kind === 'nexus' && n.team !== s.o);
    if (nexus) G.focus = { x: nexus.x, y: nexus.y };
    slowmo = settings.reduceMotion ? 0 : 2.2;
    const ended = G;
    setTimeout(() => {
      if (G === ended && running) showEnd();
    }, 1800);
  }
}

function replay(e: Ev) {
  switch (e[0]) {
    case 'b':
      if (nearMe({ x: e[1], y: e[2] })) fxBurst(e[1], e[2], e[3], e[4]);
      break;
    case 'r':
      if (nearMe({ x: e[1], y: e[2] })) fxRing(e[1], e[2], e[3], e[4], e[5], e[6]);
      break;
    case 'p':
      if (nearMe(e[1])) fxSpawn(e[1]);
      break;
    case 's':
      playSfx(e[1], e[4] < 0 ? undefined : { x: e[2], y: e[3] }, Math.abs(e[4]));
      break;
    case 't':
      if (G.texts.length > 80) G.texts.shift();
      G.texts.push({ x: e[1], y: e[2], vx: (Math.random() - 0.5) * 60, text: e[3], color: e[4], t: 1, size: e[5] });
      break;
    case 'tv':
      if (e[1] !== G.player.id) break;
      if (G.texts.length > 80) G.texts.shift();
      G.texts.push({ x: e[2], y: e[3], vx: (Math.random() - 0.5) * 60, text: e[4], color: e[5], t: 1, size: e[6] });
      break;
    case 'i':
      if (nearMe({ x: e[1], y: e[2] })) addTrauma(TIER[e[3]]);
      break;
    case 'tr':
      if (nearMe({ x: e[1], y: e[2] })) addTrauma(e[3]);
      break;
    case 'f':
      feedMsg(e[1], e[2]);
      break;
    case 'a':
      announce(e[1], e[2], e[3]);
      break;
    case 'k': {
      const k = byId.get(e[1]);
      const v = byId.get(e[2]);
      if (k && v) announceKill(k, v, e[3] === 1);
      break;
    }
  }
}

// Guests don't simulate: units glide to the host's positions and cosmetic timers run down.
function guestTick(dt: number) {
  const f = Math.min(1, dt * 14);
  for (const [u, g] of goal) {
    u.x += (g.x - u.x) * f;
    u.y += (g.y - u.y) * f;
    const frac = clamp(u.hp / u.maxHp, 0, 1);
    u.hpTrail = frac > u.hpTrail ? frac : Math.max(frac, u.hpTrail - dt * 0.55);
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.lunge > 0) u.lunge = Math.max(0, u.lunge - dt * 5);
    if (u.pop > 0) u.pop = Math.max(0, u.pop - dt * 5);
    if (u.fadeIn > 0) u.fadeIn = Math.max(0, u.fadeIn - dt);
  }
  for (const p of G.projs) {
    if (p.homing) {
      const d = dist(p, p.homing) || 1;
      const step = Math.min(d, 1300 * dt);
      p.x += ((p.homing.x - p.x) / d) * step;
      p.y += ((p.homing.y - p.y) / d) * step;
    } else {
      p.x += p.dx * 1600 * dt;
      p.y += p.dy * 1600 * dt;
    }
  }
  for (const pd of G.pending) pd.t = Math.max(0, pd.t - dt);
  G.texts = G.texts.filter((t) => (t.t -= dt * 0.9) > 0);
  for (const b of beams) b.t -= dt;
  while (beams.length && beams[0].t <= 0) beams.shift();
  if (G.marker && (G.marker.t -= dt) <= 0) G.marker = null;
  if ((G.visionT -= dt) <= 0) {
    G.visionT = 0.2;
    computeVision();
  }
}

// ---- lobby ----
let myName = '';
try {
  myName = localStorage.getItem('rift-name') ?? '';
} catch {
  // storage unavailable
}
if (!myName) myName = `Summoner${Math.floor(100 + Math.random() * 900)}`;
const lobbyStatus = (text: string, bad = false) => {
  const el = $('lstatus');
  el.textContent = text;
  el.classList.toggle('bad', bad);
};

// ================= matchmaking =================
let mmMatch: MatchInfo | null = null; // set while in a matchmade lobby/match
let mmMode: Mode = 'coop';
let rating = loadRating();
let draftEnds = 0; // host: performance.now() when champion select ends
let draftLeft = -1;
let draftSyncAt = 0;
let draftTimer = 0;
let queueStart = 0;
let queueTimer = 0;
let foundTimer = 0;
let foundId = '';
const DRAFT_TIME = 30;

function renderRank() {
  const t = tierOf(rating.mmr);
  const span = t.next ? t.next - t.floor : 200;
  const k = clamp((rating.mmr - t.floor) / span, 0, 1);
  $('rank').innerHTML = `<span class="rbadge" style="--c:${t.color}">${t.name}</span><span class="rmmr">${rating.mmr} MMR</span><span class="rbar"><i style="width:${Math.round(k * 100)}%;background:${t.color}"></i></span><span class="rwl">${rating.wins}W ${rating.losses}L</span>`;
}
function setQueueUi(on: boolean) {
  $('find').classList.toggle('hidden', on);
  $('mmq').classList.toggle('hidden', !on);
  document.querySelectorAll<HTMLButtonElement>('#mmodes button').forEach((b) => (b.disabled = on));
  clearInterval(queueTimer);
  if (on) {
    queueStart = performance.now();
    const tick = () => ($('mmtime').textContent = fmtTime((performance.now() - queueStart) / 1000));
    tick();
    queueTimer = window.setInterval(tick, 500);
  }
}
function findMatch() {
  if (net.role !== 'solo') leaveLobby();
  sfx('click');
  setQueueUi(true);
  mmQueue(
    { name: myName || 'Summoner', mmr: rating.mmr, mode: mmMode, role: soloRole },
    {
      onStatus: (t) => ($('mmstatus').textContent = t),
      onFound: (id, size, timeout) => showFound(id, size, timeout),
      onReady: (info) => void enterMatchLobby(info),
      onRequeued: () => {
        hideFound();
        $('mmstatus').textContent = 'Someone declined. Back in the queue at the front of the line.';
      },
      onDropped: () => {
        hideFound();
        setQueueUi(false);
        mmCancel();
        $('mmstatus').textContent = '';
        lobbyStatus('You were removed from the queue (match not accepted).', true);
        $('lobby').classList.remove('hidden');
      },
    },
  );
}
function cancelQueue() {
  sfx('click');
  mmCancel();
  hideFound();
  setQueueUi(false);
}
function showFound(id: string, size: number, timeout: number) {
  foundId = id;
  $('found').classList.remove('hidden', 'accepted');
  $('fsub').textContent = `${mmMode === 'ranked' ? 'Ranked 5v5' : 'Co-op vs AI'} · ${size} player${size > 1 ? 's' : ''}${size < (mmMode === 'ranked' ? 10 : 5) ? ' · bots fill the rest' : ''}`;
  sfx('levelUp');
  if (document.hidden) document.title = '⚔ Match found! · Rift Clash';
  const end = performance.now() + timeout * 1000;
  clearInterval(foundTimer);
  const tick = () => {
    const left = Math.max(0, (end - performance.now()) / 1000);
    $('ftime').textContent = String(Math.ceil(left));
    ($('fring') as unknown as SVGCircleElement).style.strokeDashoffset = String(283 * (1 - left / ACCEPT_TIME));
    if (left <= 0) {
      clearInterval(foundTimer);
      if (!$('found').classList.contains('accepted')) declineFound();
    }
  };
  tick();
  foundTimer = window.setInterval(tick, 100);
}
function hideFound() {
  clearInterval(foundTimer);
  $('found').classList.add('hidden');
  document.title = 'Rift Clash';
}
function acceptFound() {
  sfx('click');
  $('found').classList.add('accepted');
  $('faccept').textContent = 'Accepted';
  mmAccept(foundId);
}
function declineFound() {
  mmDecline(foundId);
  hideFound();
}
async function enterMatchLobby(info: MatchInfo) {
  hideFound();
  setQueueUi(false);
  mmDone();
  mmMatch = info;
  picked = '';
  $('faccept').textContent = 'Accept';
  $('lobby').classList.remove('hidden');
  if (info.hostId === info.you) {
    lobbyStatus('Opening the match lobby…');
    try {
      await hostLobby(info.code, info.players.length);
    } catch (e) {
      lobbyStatus(`Could not open the match lobby: ${(e as Error).message}`, true);
      mmMatch = null;
      return;
    }
    net.players = [];
    draftEnds = performance.now() + DRAFT_TIME * 1000;
    clearInterval(draftTimer);
    draftTimer = window.setInterval(draftTick, 500);
    hostSync();
  } else {
    lobbyStatus('Joining the match lobby…');
    try {
      await joinLobby(info.code, myName || 'Summoner', '', { mmId: info.you, mmr: rating.mmr, role: soloRole }, 10);
      clearInterval(draftTimer);
      draftTimer = window.setInterval(() => {
        if (draftLeft < 0 || running) return;
        const left = Math.max(0, draftLeft - Math.floor((performance.now() - draftSyncAt) / 1000));
        lobbyStatus(`Champion select · ${left}s · each champion can be picked once${picked ? '' : ' · pick now or one is chosen for you'}`);
      }, 500);
      renderLobby();
    } catch {
      lobbyStatus('Could not reach the match host. Queue again to find a new match.', true);
      mmMatch = null;
      leave();
      renderLobby();
    }
  }
}
// host: champion select clock; starts early once everyone has joined and picked
function draftTick() {
  if (!mmMatch || net.role !== 'host' || running) {
    clearInterval(draftTimer);
    return;
  }
  const allIn = net.players.length >= mmMatch.players.length && net.players.every((q) => q.pick);
  if (allIn && draftEnds - performance.now() > 4000) draftEnds = performance.now() + 4000;
  hostSync();
  if (performance.now() >= draftEnds) {
    clearInterval(draftTimer);
    startMultiplayer();
  }
}
function mmPick(id: string) {
  if (mmMatch && net.role === 'host') hostSync();
  void id;
}
// rated matches update the local rating once, when the result screen opens
function rateMatch(won: boolean): string {
  const m = mmMatch;
  mmMatch = null;
  if (!m) return 'Unrated';
  let opp = BOT_MMR[difficulty.id] ?? 1050;
  if (m.mode === 'ranked') {
    const meTeam = G.player.team;
    const foes = m.players.filter((q) => q.team !== meTeam).map((q) => q.mmr);
    while (foes.length < 5) foes.push(BOT_MMR.normal);
    opp = foes.reduce((a, b) => a + b, 0) / foes.length;
  }
  const before = tierOf(rating.mmr).name;
  const { next, delta } = rateResult(rating, opp, won);
  rating = next;
  saveRating(rating);
  renderRank();
  const after = tierOf(rating.mmr).name;
  const moved = before !== after ? ` · ${delta > 0 ? 'Promoted to' : 'Demoted to'} ${after}` : '';
  return `${m.mode === 'ranked' ? 'Ranked' : 'Co-op'} · <b style="color:${delta >= 0 ? '#7dff9c' : '#ff7a7a'}">${delta >= 0 ? '+' : ''}${delta} MMR</b> (${rating.mmr})${moved}`;
}

function renderLobby() {
  const inLobby = net.role !== 'solo';
  $('lobby').classList.toggle('hidden', !inLobby);
  $('mp').classList.toggle('hidden', inLobby);
  $('play').classList.toggle('hidden', inLobby);
  $('diff').classList.toggle('locked', net.role === 'guest');
  if (!inLobby) return;
  const mm = mmMatch;
  $('lcode').textContent = mm ? (mm.mode === 'ranked' ? 'Ranked' : 'Co-op') : net.code;
  $('lcopy').classList.toggle('hidden', !!mm);
  $('lobby').classList.toggle('draft', !!mm);
  const row = (p: LobbyPlayer | undefined, expect?: { name: string; mmr: number }) => {
    if (!p)
      return expect
        ? `<li class="empty"><span class="pimg"></span><span class="pname">${escapeHtml(expect.name)}</span><span class="ppick">Connecting…</span></li>`
        : `<li class="empty"><span class="pimg"></span><span>Open slot · a bot will play</span></li>`;
    const def = CHAMPS.find((c) => c.id === p.pick);
    const img = PORTRAITS[p.pick];
    const tier = p.mmr !== undefined ? tierOf(p.mmr) : null;
    const me = (net.role === 'host' && p.host) || (mm && p.mmId === mm.you);
    return `<li class="${me ? 'me' : ''}"><span class="pimg" style="${img ? `background-image:url(${img})` : `background:${def?.color ?? '#333'}`}"></span><span class="pname">${escapeHtml(p.name)}${p.host ? ' <em>host</em>' : ''}${tier ? ` <i style="color:${tier.color}">${tier.name}</i>` : ''}</span><span class="ppick">${def ? def.name : 'Choosing…'}</span></li>`;
  };
  if (mm) {
    const teams = mm.mode === 'ranked' ? ([0, 1] as const) : ([0] as const);
    $('lplayers').innerHTML = teams
      .map((team) => {
        const seats = mm.players.filter((q) => q.team === team);
        const rows = Array.from({ length: 5 }, (_, i) => {
          const s = seats[i];
          return s ? row(net.players.find((q) => q.mmId === s.id), s) : row(undefined);
        }).join('');
        return `<li class="tlabel ${team ? 'red' : 'blue'}">${team ? 'Red team' : 'Blue team'}</li>${rows}`;
      })
      .join('');
  } else
    $('lplayers').innerHTML = Array.from({ length: MAX_PLAYERS }, (_, i) => row(net.players[i])).join('');
  $('lstart').classList.toggle('hidden', net.role !== 'host' || !!mm);
  $('lwait').classList.toggle('hidden', net.role !== 'guest' || !!mm);
  // champions someone else already locked are greyed out
  const taken = new Set(net.players.filter((q) => !(net.role === 'host' ? q.host : mm && q.mmId === mm.you) && q.pick).map((q) => q.pick));
  document.querySelectorAll<HTMLElement>('#champs .champ').forEach((el) => {
    el.classList.toggle('taken', taken.has(el.dataset.id!));
    el.classList.toggle('sel', el.dataset.id === picked);
  });
  if (mm && draftLeft >= 0) lobbyStatus(`Champion select · ${draftLeft}s · each champion can be picked once${picked ? '' : ' · pick now or one is chosen for you'}`);
}
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function hostSync() {
  if (net.role !== 'host') return;
  const seat = mmMatch?.players.find((q) => q.id === mmMatch!.you);
  if (net.players.slice(1).some((q) => q.pick === picked)) picked = net.players[0]?.pick ?? '';
  net.players[0] = { id: 'host', name: myName, pick: picked, host: true, team: seat?.team ?? 0, mmr: seat?.mmr, mmId: mmMatch?.you, role: soloRole };
  const mm = mmMatch ? { mode: mmMatch.mode, left: Math.max(0, Math.ceil((draftEnds - performance.now()) / 1000)) } : undefined;
  broadcast({ t: 'lobby', players: net.players, diff: difficulty.id, mm });
  if (mm) draftLeft = mm.left;
  renderLobby();
}

net.onStatus = (t) => lobbyStatus(t, true);
net.onMsg = (from, m) => {
  if (net.role === 'host') {
    switch (m.t) {
      case 'hello': {
        if (!net.players.some((p) => p.id === from)) {
          const seat = mmMatch?.players.find((q) => q.id === m.mmId);
          if (mmMatch && !seat) {
            sendTo(from, { t: 'full' }); // matchmade lobbies only seat the matched players
            return;
          }
          const pick = net.players.some((q) => q.pick === m.pick) ? '' : m.pick;
          net.players.push({ id: from, name: m.name.slice(0, 16) || 'Guest', pick, host: false, team: seat?.team ?? 0, mmr: seat?.mmr, mmId: m.mmId, role: seat?.role ?? m.role ?? 'fill' });
        }
        hostSync();
        if (running) sendTo(from, { t: 'lobby', players: net.players, diff: difficulty.id });
        break;
      }
      case 'pick': {
        const p = net.players.find((q) => q.id === from);
        // each champion can only be picked once per match
        if (p && !net.players.some((q) => q !== p && q.pick === m.pick)) p.pick = m.pick;
        if (p && m.role) p.role = m.role;
        hostSync();
        break;
      }
      case 'cmd': {
        const u = remote.get(from);
        if (!u || !running) return;
        inSim = true;
        try {
          applyCmd(u, m.cmd);
        } finally {
          inSim = false;
        }
        break;
      }
      case 'bye':
        net.onLeave(from);
        break;
    }
    return;
  }
  switch (m.t) {
    case 'lobby':
      net.players = m.players;
      difficulty = DIFFICULTIES.find((d) => d.id === m.diff) ?? NORMAL;
      draftLeft = m.mm?.left ?? -1;
      draftSyncAt = performance.now();
      // the host may have bounced our pick because someone else took it
      if (m.mm) {
        const me = net.players.find((q) => q.mmId === mmMatch?.you);
        if (me && me.pick !== picked) picked = me.pick;
      }
      renderLobby();
      if (!m.mm) lobbyStatus(`Connected. ${difficulty.name} difficulty. Waiting for the host to start.`);
      break;
    case 'start':
      awaitingYou = m.you;
      lobbyStatus('Starting…');
      break;
    case 'snap':
      applySnap(m.s as Snap);
      break;
    case 'full':
      lobbyStatus('That lobby is full (3 players).', true);
      leaveLobby();
      break;
    case 'bye':
      net.onLeave('host');
      break;
  }
};
net.onLeave = (id) => {
  if (net.role === 'host') {
    const p = net.players.find((q) => q.id === id);
    net.players = net.players.filter((q) => q.id !== id);
    dropGuest(id);
    const u = remote.get(id);
    if (u && running) {
      u.champ!.isPlayer = false; // a bot takes over the champion
      remote.delete(id);
      inSim = true;
      feedMsg(`${p?.name ?? 'A player'} disconnected. A bot takes over.`, -1);
      inSim = false;
    }
    hostSync();
  } else if (net.role === 'guest' && id === 'host') {
    leave();
    const wasPlaying = running;
    backToMenu();
    lobbyStatus(wasPlaying ? 'The host left the game.' : 'The host closed the lobby.', true);
    $('lobby').classList.remove('hidden');
    $('lplayers').innerHTML = '';
    $('lstart').classList.add('hidden');
    $('lwait').classList.add('hidden');
    $('lcode').textContent = '—';
  }
};

async function createLobby() {
  if (!picked) picked = CHAMPS[0].id;
  sfx('click');
  lobbyStatus('Creating lobby…');
  $('lobby').classList.remove('hidden');
  try {
    const code = await hostLobby();
    net.players = [];
    hostSync();
    lobbyStatus(`Share the code ${code} or the invite link. Up to ${MAX_PLAYERS} players.`);
  } catch (e) {
    lobbyStatus(`Could not create a lobby: ${(e as Error).message}`, true);
  }
}
async function joinWithCode(raw: string) {
  const code = cleanCode(raw);
  if (code.length !== 5) {
    lobbyStatus('Lobby codes are 5 letters.', true);
    $('lobby').classList.remove('hidden');
    return;
  }
  sfx('click');
  $('lobby').classList.remove('hidden');
  lobbyStatus(`Joining ${code}…`);
  try {
    await joinLobby(code, myName, picked, { role: soloRole });
    renderLobby();
  } catch (e) {
    lobbyStatus((e as Error).message, true);
  }
}
function leaveLobby() {
  leave();
  renderLobby();
  $('lobby').classList.add('hidden');
}
function startMultiplayer() {
  if (net.role !== 'host') return;
  if (!picked) picked = CHAMPS[0].id;
  const used = new Set(net.players.map((p) => p.pick).filter(Boolean));
  const free = CHAMPS.filter((c) => !used.has(c.id)).sort(() => Math.random() - 0.5);
  const humans: Human[] = net.players.map((p) => ({ peer: p.id, name: p.name, pick: p.pick || free.shift()!.id, team: p.team ?? 0, role: (p.role ?? 'fill') as Role | 'fill' }));
  picked = humans.find((h) => h.peer === 'host')!.pick;
  if (mmMatch) {
    // co-op difficulty follows the group's rating; ranked bots play Normal
    const avg = mmMatch.players.reduce((a, q) => a + q.mmr, 0) / mmMatch.players.length;
    difficulty = mmMatch.mode === 'ranked' ? NORMAL : DIFFICULTIES[avg < 950 ? 0 : avg < 1200 ? 1 : 2];
    broadcast({ t: 'lobby', players: net.players, diff: difficulty.id });
  }
  clearInterval(draftTimer);
  demoMode = false;
  $('feed').innerHTML = '';
  newGame(picked, humans);
  for (const [peer, u] of remote) sendTo(peer, { t: 'start', you: u.id });
  enterMatch();
  broadcast({ t: 'snap', s: encodeSnap() });
}

$('pname').addEventListener('input', (e) => {
  myName = (e.target as HTMLInputElement).value.trim().slice(0, 16) || myName;
  try {
    localStorage.setItem('rift-name', myName);
  } catch {
    // storage unavailable
  }
  if (net.role === 'host') hostSync();
});
($('pname') as HTMLInputElement).value = myName;
$('create').addEventListener('click', () => void createLobby());
$('join').addEventListener('click', () => void joinWithCode(($('code') as HTMLInputElement).value));
$('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void joinWithCode(($('code') as HTMLInputElement).value);
});
$('lleave').addEventListener('click', () => {
  sfx('click');
  mmMatch = null;
  clearInterval(draftTimer);
  leaveLobby();
});
$('find').addEventListener('click', findMatch);
$('mmcancel').addEventListener('click', cancelQueue);
$('faccept').addEventListener('click', acceptFound);
$('fdecline').addEventListener('click', () => {
  sfx('click');
  declineFound();
  cancelQueue();
});
$('mmodes').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b || mmActive()) return;
  mmMode = b.dataset.m as Mode;
  document.querySelectorAll('#mmodes button').forEach((x) => x.classList.toggle('on', x === b));
  sfx('click');
});
renderRank();
$('lstart').addEventListener('click', () => {
  sfx('click');
  startMultiplayer();
});
$('lcopy').addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}?lobby=${net.code}`;
  void navigator.clipboard?.writeText(url).then(
    () => lobbyStatus('Invite link copied.'),
    () => lobbyStatus(url),
  );
});

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
  G.zoom = TOUCH ? 0.45 : 0.55;
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
    hostSync();
  });
}
const abilityCostText = (d: ChampDef, a: AbilityDef) => {
  const t = (a.costType ?? 'Mana').replace(/\(.*\)/, '').trim();
  if (!a.costs || a.costs.every((x) => x === 0)) return t === 'Mana' || t === 'No Cost' ? ' · No cost' : ` · ${t}`;
  return ` · ${a.costs.join('/')} ${t === '{{ abilityresourcename }}' || !t ? d.resource ?? 'Mana' : t}`;
};
const CLASSES = ['All', 'Mage', 'Fighter', 'Tank', 'Assassin', 'Marksman', 'Support'];
let champFilter = 'All';
function champDetail(id: string) {
  const c = CHAMPS.find((d) => d.id === id);
  const el = $('cdetail');
  if (!c) {
    el.innerHTML = '<p class="hint">Pick a champion to see their kit.</p>';
    return;
  }
  el.innerHTML = `<div class="dh"><h3>${c.name}</h3><span>${c.title ?? ''}</span></div>
    <div class="role">${c.role} · ${c.ranged ? 'Ranged' : 'Melee'} (${c.range}) · ${c.resource ?? 'Mana'}</div>
    <div class="stats">HP ${c.hp}+${c.hpL} · AD ${c.ad}+${c.adL} · Armor ${c.armor}+${c.armorL} · MR ${c.mr}+${c.mrL} · AS ${c.as} · MS ${c.ms}</div>
    <ul>${
      c.passive ? `<li><b>P</b><div><strong>${c.passive.name}</strong><p>${c.passive.desc}</p></div></li>` : ''
    }${c.abilities
      .map((a, i) => `<li><b>${'QWER'[i]}</b><div><strong>${a.name}</strong> <em>${a.cds ? a.cds.join('/') : a.cd}s${abilityCostText(c, a)}</em><p>${a.desc}</p></div></li>`)
      .join('')}</ul>`;
}
function buildSums() {
  const el = $('sums');
  try {
    const saved = localStorage.getItem('rift-spell');
    if (saved === 'heal' || saved === 'smite' || saved === 'auto') soloSpell = saved;
  } catch {
    // storage unavailable
  }
  const opts: [typeof soloSpell, string][] = [['auto', 'Auto (Smite if jungle)'], ['smite', 'Smite'], ['heal', 'Heal']];
  el.innerHTML = `<span>Summoner (F)</span>` + opts.map(([v, l]) => `<button data-s="${v}" class="${v === soloSpell ? 'on' : ''}">${l}</button>`).join('');
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    soloSpell = b.dataset.s as typeof soloSpell;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    try {
      localStorage.setItem('rift-spell', soloSpell);
    } catch {
      // storage unavailable
    }
    sfx('click');
  });
}
function buildRoles() {
  const el = $('roles');
  const opts: (Role | 'fill')[] = ['top', 'jungle', 'mid', 'adc', 'support', 'fill'];
  try {
    const saved = localStorage.getItem('rift-role');
    if (saved && (opts as string[]).includes(saved)) soloRole = saved as Role | 'fill';
  } catch {
    // storage unavailable
  }
  el.innerHTML = `<span>Position</span>` + opts.map((r) => `<button data-r="${r}" class="${r === soloRole ? 'on' : ''}">${r === 'fill' ? 'Fill' : ROLE_NAME[r]}</button>`).join('');
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    soloRole = b.dataset.r as Role | 'fill';
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    try {
      localStorage.setItem('rift-role', soloRole);
    } catch {
      // storage unavailable
    }
    sfx('click');
    if (net.role === 'guest') sendToHost({ t: 'pick', pick: picked, role: soloRole });
    hostSync();
  });
}
function buildMenu() {
  buildRoles();
  buildSums();
  const wrap = $('champs');
  const tabs = $('ctabs');
  tabs.innerHTML = CLASSES.map((k) => `<button data-k="${k}" class="${k === champFilter ? 'on' : ''}">${k}</button>`).join('');
  wrap.innerHTML = CHAMPS.map(
    (c, i) => `<button class="champ" data-id="${c.id}" data-tags="${(c.tags ?? []).join(' ')}" style="--i:${i}" title="${c.name}, ${c.role}"><div class="core">
      <div class="orb img" style="background:${c.color};--glow:${c.color}"><img src="${import.meta.env.BASE_URL}img/champ/${c.key ?? c.id}.png" alt="" loading="lazy" draggable="false"></div>
      <h3>${c.name}</h3><div class="role">${c.role}</div>
    </div></button>`,
  ).join('');
  applyPortraits();
  champDetail(picked);
  tabs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    champFilter = b.dataset.k!;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    wrap.querySelectorAll<HTMLElement>('.champ').forEach((el) => {
      el.hidden = champFilter !== 'All' && !el.dataset.tags!.split(' ').includes(champFilter);
    });
  });
  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.champ');
    if (!b || b.classList.contains('taken')) return;
    picked = b.dataset.id!;
    sfx('click');
    if (net.role === 'guest') sendToHost({ t: 'pick', pick: picked });
    hostSync();
    mmPick(picked);
    champDetail(picked);
    wrap.querySelectorAll('.champ').forEach((el) => el.classList.toggle('sel', el === b));
    const play = $<HTMLButtonElement>('play');
    play.disabled = false;
    play.textContent = 'Champion Select';
  });
}
function start() {
  if (!picked) return;
  demoMode = false;
  sfx('click');
  $('feed').innerHTML = '';
  newGame(picked);
  enterMatch();
}
function enterMatch() {
  demoMode = false;
  if (TOUCH) {
    G.zoom = baseZoom();
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
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
function openChampSelect() {
  sfx('click');
  openDraft({
    champs: CHAMPS,
    role: soloRole,
    spell: soloSpell,
    sfx: (n) => sfx(n as Parameters<typeof sfx>[0]),
    onCancel: () => {},
    onDone: (r) => {
      soloRole = r.role;
      soloSpell = r.spell;
      try {
        localStorage.setItem('rift-spell', soloSpell);
      } catch {
        // storage unavailable
      }
      draftPlan = { teams: [r.blue, r.red], bans: r.bans };
      lastBans = r.bans;
      picked = r.pick;
      demoMode = false;
      $('feed').innerHTML = '';
      newGame(r.pick);
      draftPlan = null;
      enterMatch();
    },
  });
}
$('play').addEventListener('click', openChampSelect);
function backToMenu() {
  $('end').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  toggleShop(false);
  running = false;
  audio.gameplay = false;
  startDemo();
  renderLobby();
}
// in a lobby, "Play again" returns everyone to the lobby so the host can start another match
$('again').addEventListener('click', backToMenu);
function showEnd() {
  const won = G.over === G.player.team;
  const base = import.meta.env.BASE_URL;
  const players = G.units
    .filter((u) => u.champ && u.team < 2)
    .map((u) => {
      const c = u.champ!;
      const rune = runeInfo(c.runes.keystone);
      return {
        name: u.name, champ: c.def.name, icon: `${base}img/champ/${c.def.key ?? c.def.id}.png`, team: u.team as 0 | 1, level: c.level, kills: c.kills, deaths: c.deaths, assists: c.assists, cs: c.cs,
        gold: Math.round(c.ms.gold), pc: c.ms.pc, mc: c.ms.mc, tc: c.ms.tc, obj: c.ms.obj, mon: c.ms.mon, taken: c.ms.taken, healed: c.ms.healed, wards: c.ms.wards, ctrl: c.ms.ctrl,
        items: [...new Set([...c.items, ...c.itemLog.map((l) => l[1])])].map((id) => ({ id, name: ITEM_MAP[id]?.name ?? id, icon: ITEM_MAP[id] ? iconUrl(ITEM_MAP[id]) : '' })),
        itemLog: c.itemLog, icons: Object.fromEntries(c.itemLog.map(([, id]) => [id, ITEM_MAP[id] ? iconUrl(ITEM_MAP[id]) : ''])), me: u === G.player, keystone: rune?.name ?? '', keystoneIcon: rune ? runeIcon(rune.icon) : '',
      };
    });
  for (const p of players) p.items = p.items.filter((i) => players.length && (G.units.find((u) => u.champ && u.champ.def.name === p.champ && u.team === p.team)?.champ?.items ?? []).includes(i.id));
  const towers: [number, number] = [0, 0];
  for (const u of G.units) if (u.kind === 'tower' && u.dead && u.team < 2 && u.tier !== T_INHIB) towers[1 - u.team]++;
  const data: PostData = {
    won, time: fmtTime(G.t), seconds: G.t, kills: [G.kills[0], G.kills[1]], mode: `Summoner's Rift · ${difficulty.name}`, rating: rateMatch(won).replace(/<[^>]+>/g, ''),
    bans: (lastBans ?? []).map((id) => {
      const d = CHAMPS.find((x) => x.id === id);
      return { icon: `${base}img/champ/${d?.key ?? id}.png`, name: d?.name ?? id };
    }),
    players, tl: G.tl, towers,
  };
  $('endstats').innerHTML = renderPost(data);
  $('end').scrollTop = 0;
  $('endstats').querySelectorAll<HTMLElement>('.ptabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $('endstats').querySelectorAll('.ptabs button').forEach((x) => x.classList.toggle('on', x === b));
      $('endstats').querySelectorAll<HTMLElement>('.pp').forEach((x) => x.classList.toggle('on', x.dataset.p === b.dataset.t));
    }),
  );
  $('endtitle').textContent = '';
  $('hud').classList.add('hidden');
  toggleShop(false);
  $('end').classList.remove('hidden');
  running = false;
  audio.gameplay = false;
  sfx(won ? 'victory' : 'defeat');
}
// tint each champion's body with the dominant colour of their icon
function loadChampHues() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 12;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return;
  for (const c of CHAMPS) {
    const im = new Image();
    im.onload = () => {
      cx.clearRect(0, 0, 12, 12);
      cx.drawImage(im, 0, 0, 12, 12);
      const d = cx.getImageData(0, 0, 12, 12).data;
      let r = 0, g = 0, b = 0, w = 0;
      let ar = 0, ag = 0, ab = 0, aw = 0;
      for (let i = 0; i < d.length; i += 4) {
        const s2 = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        const br = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const aw2 = (s2 * s2 * (br + 40)) / 1000;
        ar += d[i] * aw2; ag += d[i + 1] * aw2; ab += d[i + 2] * aw2; aw += aw2;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const sat = mx - Math.min(d[i], d[i + 1], d[i + 2]);
        const wt = 1 + sat / 40;
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      const hex = (a: number, b2: number, c2: number, k: number) => '#' + [a, b2, c2].map((v) => Math.round(v / k).toString(16).padStart(2, '0')).join('');
      setChampHue(c.id, hex(r, g, b, w), aw > 0 ? hex(ar, ag, ab, aw) : undefined);
    };
    im.src = `${import.meta.env.BASE_URL}img/champ/${c.key ?? c.id}.png`;
  }
}
loadChampHues();
buildMenu();
buildDifficulty();
buildMotionToggle();
startDemo();
{
  const code = new URLSearchParams(location.search).get('lobby');
  if (code) {
    ($('code') as HTMLInputElement).value = cleanCode(code);
    void joinWithCode(code);
  }
}
window.addEventListener('beforeunload', () => leave());

// ================= loop =================
let last = performance.now();
let debugPaused = false; // test hook: freeze the frame for screenshots
let snapAcc = 0;
const SNAP_DT = 1 / 15;
function simStep(dt: number) {
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
  if (running && net.role === 'guest') {
    touchTick(dt);
    guestTick(dt);
    updateHud();
  } else if (running) {
    edgePan(dt);
    touchTick(sim);
    inSim = true;
    try {
      update(sim);
    } finally {
      inSim = false;
    }
    updateHud();
    if (net.role === 'host' && (snapAcc += dt) >= SNAP_DT) {
      snapAcc = 0;
      broadcast({ t: 'snap', s: encodeSnap() });
    }
  } else if (demoMode) {
    update(sim);
    if (G.over !== null && (demoRestart += dt) > 4) startDemo();
  }
  updateParticles(sim);
  updateShake(dt);
  animDt += sim;
}
// A host keeps simulating in big steps when its tab is hidden, so guests aren't frozen.
function tick(now: number, draw: boolean) {
  const elapsed = (now - last) / 1000;
  last = now;
  if (!G) return;
  if (debugPaused) {
    if (draw) render();
    return;
  }
  let left = Math.min(net.role === 'host' && running ? 1 : 0.5, elapsed); // catch up after slow frames: never run in slow motion
  do {
    const dt = Math.min(0.05, left);
    simStep(dt);
    left -= dt;
  } while (left > 0.001);
  if (draw) render();
}
let lastFrame = 0;
function frame(now: number) {
  lastFrame = performance.now();
  tick(now, true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// browsers stop animation frames for hidden or occluded tabs (not always flagged as hidden), so a
// host whose frames stall keeps the match going from a timer
setInterval(() => {
  if (net.role === 'host' && running && (document.hidden || performance.now() - lastFrame > 300)) tick(performance.now(), false);
}, 250);

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
  __riftNet: () => ({ role: net.role, code: net.code, players: net.players, snapBytes: G && net.role === 'host' ? JSON.stringify(encodeSnap()).length : 0 }),
  __riftPause: (on: boolean) => {
    debugPaused = on;
  },
  __riftFrame: () => {
    render();
    updateHud();
  },
});

// dev-only handle for smoke-testing champion kits from the console
if (import.meta.env.DEV) {
  (window as any).__rift = { get G() { return G; }, newGame, update, cast, recalc, CHAMPS, KITS, costOf, encodeSnap, applySnap, applyCmd, rankUp, makeChamp, isWall, placeWard, CAMPS, dealDamage, kill, enterMatch };
}
