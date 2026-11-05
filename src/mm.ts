// Serverless matchmaking over PeerJS. The first player to queue claims a well-known peer id and
// becomes the broker; everyone else connects to it. The broker groups tickets by MMR with a search
// window that widens the longer people wait, runs an accept check, then tells the group which of
// them hosts the match and the lobby code to use. If the broker leaves, the next client to notice
// claims the id and everyone re-sends their ticket (keeping their place in time).
import Peer, { type DataConnection } from 'peerjs';

export type Mode = 'coop' | 'ranked';
export interface Ticket {
  id: string;
  name: string;
  mmr: number;
  mode: Mode;
  role: string; // preferred position (top / jungle / mid / adc / support / fill)
  since: number; // ms epoch when this player first queued
}
export interface MatchInfo {
  matchId: string;
  code: string; // lobby code the host opens
  hostId: string;
  you: string;
  mode: Mode;
  players: { id: string; name: string; mmr: number; team: 0 | 1; role: string }[];
}
type ToBroker =
  | { t: 'queue'; ticket: Ticket }
  | { t: 'cancel' }
  | { t: 'accept'; matchId: string }
  | { t: 'decline'; matchId: string };
type ToClient =
  | { t: 'queued'; size: number; spread: number }
  | { t: 'found'; matchId: string; size: number; timeout: number }
  | { t: 'ready'; info: Omit<MatchInfo, 'you'> }
  | { t: 'requeued' }
  | { t: 'dropped' };

export interface MmHandlers {
  onStatus: (text: string, size?: number) => void;
  onFound: (matchId: string, size: number, timeout: number) => void;
  onReady: (info: MatchInfo) => void;
  onRequeued: () => void;
  onDropped: () => void;
}

const BROKER_ID = 'riftclash-mm-v1';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCEPT_TIME = 12;
// how many humans a match needs, and how long each smaller size has to wait before it is allowed
export const MODES: Record<Mode, { sizes: [number, number][] }> = {
  coop: { sizes: [[5, 0], [3, 20], [2, 30], [1, 40]] },
  ranked: { sizes: [[10, 0], [6, 45], [4, 65], [2, 85]] },
};
export const spreadFor = (waitS: number) => Math.min(900, 150 + 20 * waitS);

// ---------- client ----------
const st = {
  peer: null as Peer | null,
  conn: null as DataConnection | null,
  ticket: null as Ticket | null,
  handlers: null as MmHandlers | null,
  broker: null as Broker | null,
  retry: 0,
  active: false,
};

export function mmActive() {
  return st.active;
}

export function mmQueue(t: Omit<Ticket, 'id' | 'since'>, h: MmHandlers) {
  mmCancel();
  st.active = true;
  st.handlers = h;
  st.ticket = { ...t, id: '', since: Date.now() };
  h.onStatus('Connecting to matchmaking…');
  connect();
}

export function mmCancel() {
  if (!st.active) return;
  st.active = false;
  send({ t: 'cancel' });
  teardown();
}

export function mmAccept(matchId: string) {
  send({ t: 'accept', matchId });
}
export function mmDecline(matchId: string) {
  send({ t: 'decline', matchId });
}

// The client has a match: stop queueing. A broker keeps serving the queue for a few seconds so its
// 'ready' messages flush, then hands the role off by closing (the others re-elect).
export function mmDone() {
  st.active = false;
  const b = st.broker;
  st.broker = null;
  st.conn?.close();
  st.conn = null;
  const p = st.peer;
  st.peer = null;
  setTimeout(() => {
    b?.stop();
    p?.destroy();
  }, b ? 2500 : 0);
}

function teardown() {
  st.broker?.stop();
  st.broker = null;
  st.conn?.close();
  st.conn = null;
  st.peer?.destroy();
  st.peer = null;
}

function send(m: ToBroker) {
  if (st.broker) st.broker.local(m);
  else if (st.conn?.open) st.conn.send(m);
}

function connect() {
  if (!st.active) return;
  teardown();
  // try to become the broker first
  const bp = new Peer(BROKER_ID);
  let settled = false;
  const giveUp = setTimeout(() => {
    if (!settled) {
      settled = true;
      bp.destroy();
      retryLater('Matchmaking server slow to answer, retrying…');
    }
  }, 8000);
  bp.on('open', () => {
    clearTimeout(giveUp);
    settled = true;
    st.peer = bp;
    st.broker = new Broker(bp, (m) => onClientMsg(m));
    st.ticket!.id = 'broker';
    st.broker.local({ t: 'queue', ticket: st.ticket! });
  });
  bp.on('error', (e) => {
    const type = (e as { type?: string }).type;
    if (settled) {
      if (type === 'network' || type === 'server-error' || type === 'socket-error') st.handlers?.onStatus('Matchmaking connection problem, retrying…');
      return;
    }
    settled = true;
    clearTimeout(giveUp);
    bp.destroy();
    if (type === 'unavailable-id') joinBroker();
    else retryLater(`Matchmaking server unreachable (${type ?? 'error'}), retrying…`);
  });
}

function joinBroker() {
  if (!st.active) return;
  const p = new Peer();
  st.peer = p;
  p.on('open', (id) => {
    st.ticket!.id = id;
    const c = p.connect(BROKER_ID, { reliable: true });
    // a broker that closed its tab can keep its id on the signalling server for a while; the
    // connection then never opens, so give up and race to claim the id again
    const stale = setTimeout(() => {
      if (st.peer === p && !st.conn) retryLater('Matchmaking host went away, taking over…', 1500 + Math.random() * 1500);
    }, 6000);
    c.on('open', () => {
      clearTimeout(stale);
      st.conn = c;
      st.retry = 0;
      c.send({ t: 'queue', ticket: st.ticket! } satisfies ToBroker);
    });
    c.on('data', (d) => onClientMsg(d as ToClient));
    c.on('close', () => {
      if (st.conn === c && st.active) retryLater('Matchmaking host changed, rejoining…', 150 + Math.random() * 600);
    });
  });
  p.on('error', (e) => {
    const type = (e as { type?: string }).type;
    // the broker vanished between our claim attempt and connecting: race to replace it
    if (type === 'peer-unavailable') retryLater('Rejoining matchmaking…', 100 + Math.random() * 500);
    else if (!st.conn) retryLater(`Matchmaking connection problem (${type ?? 'error'}), retrying…`);
  });
}

function retryLater(msg: string, ms?: number) {
  if (!st.active) return;
  teardown();
  st.handlers?.onStatus(msg);
  st.retry++;
  setTimeout(connect, ms ?? Math.min(8000, 800 * st.retry));
}

function onClientMsg(m: ToClient) {
  const h = st.handlers;
  if (!h || !st.active) return;
  switch (m.t) {
    case 'queued':
      h.onStatus(`In queue · ${m.size} searching · MMR window ±${m.spread}`, m.size);
      break;
    case 'found':
      h.onFound(m.matchId, m.size, m.timeout);
      break;
    case 'ready':
      h.onReady({ ...m.info, you: st.ticket!.id });
      break;
    case 'requeued':
      h.onRequeued();
      break;
    case 'dropped':
      h.onDropped();
      break;
  }
}

// ---------- broker ----------
interface Pending {
  id: string;
  mode: Mode;
  tickets: Ticket[];
  accepted: Set<string>;
  deadline: number;
}

class Broker {
  private queue = new Map<string, Ticket>();
  private conns = new Map<string, DataConnection>();
  private pending = new Map<string, Pending>();
  private timer: number;

  constructor(
    private peer: Peer,
    private toSelf: (m: ToClient) => void,
  ) {
    peer.on('connection', (c) => {
      c.on('data', (d) => this.onMsg(c.peer, d as ToBroker, c));
      c.on('close', () => this.drop(c.peer));
      c.on('error', () => this.drop(c.peer));
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  stop() {
    clearInterval(this.timer);
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
  }

  local(m: ToBroker) {
    this.onMsg('broker', m, null);
  }

  private to(id: string, m: ToClient) {
    if (id === 'broker') this.toSelf(m);
    else {
      const c = this.conns.get(id);
      if (c?.open) c.send(m);
    }
  }

  private drop(id: string) {
    this.conns.delete(id);
    this.queue.delete(id);
    for (const p of this.pending.values()) if (p.tickets.some((t) => t.id === id)) this.resolve(p, false);
  }

  private onMsg(from: string, m: ToBroker, c: DataConnection | null) {
    switch (m.t) {
      case 'queue':
        if (c) this.conns.set(from, c);
        this.queue.set(from, { ...m.ticket, id: from, mmr: Math.round(clamp(m.ticket.mmr, 0, 4000)), name: String(m.ticket.name).slice(0, 16), role: String(m.ticket.role ?? 'fill').slice(0, 8) });
        this.tick();
        break;
      case 'cancel':
        this.queue.delete(from);
        for (const p of this.pending.values()) if (p.tickets.some((t) => t.id === from)) this.resolve(p, false, from);
        break;
      case 'accept': {
        const p = this.pending.get(m.matchId);
        if (!p || !p.tickets.some((t) => t.id === from)) return;
        p.accepted.add(from);
        if (p.accepted.size === p.tickets.length) this.resolve(p, true);
        break;
      }
      case 'decline': {
        const p = this.pending.get(m.matchId);
        if (p) this.resolve(p, false, from);
        break;
      }
    }
  }

  private resolve(p: Pending, ok: boolean, decliner?: string) {
    this.pending.delete(p.id);
    if (ok) {
      const code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
      const teams = balanceTeams(p.tickets, p.mode);
      // the broker itself never hosts so its hand-off can't take the match down; otherwise the
      // longest-waiting player hosts
      const hostable = p.tickets.filter((t) => t.id !== 'broker');
      const host = (hostable.length ? hostable : p.tickets).reduce((a, b) => (a.since <= b.since ? a : b));
      const info = { matchId: p.id, code, hostId: host.id, mode: p.mode, players: p.tickets.map((t) => ({ id: t.id, name: t.name, mmr: t.mmr, team: teams.get(t.id) ?? 0, role: t.role })) };
      for (const t of p.tickets) this.to(t.id, { t: 'ready', info });
      return;
    }
    // everyone who accepted (or hadn't answered yet but wasn't the decliner) goes back in line;
    // the decliner and anyone who let the timer run out are dropped
    const expired = !decliner && Date.now() >= p.deadline;
    for (const t of p.tickets) {
      const back = t.id !== decliner && (!expired || p.accepted.has(t.id)) && (t.id === 'broker' || this.conns.has(t.id));
      if (back) {
        this.queue.set(t.id, t);
        this.to(t.id, { t: 'requeued' });
      } else this.to(t.id, { t: 'dropped' });
    }
  }

  private tick() {
    const now = Date.now();
    for (const p of this.pending.values()) if (now >= p.deadline) this.resolve(p, false);
    for (const mode of ['coop', 'ranked'] as Mode[]) {
      let pool = [...this.queue.values()].filter((t) => t.mode === mode).sort((a, b) => a.since - b.since);
      while (pool.length) {
        const group = findGroup(pool, mode, now);
        if (!group) break;
        for (const t of group) this.queue.delete(t.id);
        pool = pool.filter((t) => !group.includes(t));
        const id = Math.random().toString(36).slice(2, 10);
        const p: Pending = { id, mode, tickets: group, accepted: new Set(), deadline: now + ACCEPT_TIME * 1000 };
        this.pending.set(id, p);
        for (const t of group) this.to(t.id, { t: 'found', matchId: id, size: group.length, timeout: ACCEPT_TIME });
      }
    }
    const size = this.queue.size;
    for (const t of this.queue.values()) this.to(t.id, { t: 'queued', size, spread: Math.round(spreadFor((now - t.since) / 1000)) });
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : 1000));

// Anchor on the longest-waiting ticket; take the closest-MMR players inside its window.
export function findGroup(pool: Ticket[], mode: Mode, now: number): Ticket[] | null {
  for (const anchor of pool) {
    const wait = (now - anchor.since) / 1000;
    const spread = spreadFor(wait);
    const near = pool
      .filter((t) => Math.abs(t.mmr - anchor.mmr) <= spread)
      .sort((a, b) => Math.abs(a.mmr - anchor.mmr) - Math.abs(b.mmr - anchor.mmr));
    for (const [size, minWait] of MODES[mode].sizes) {
      if (wait < minWait || near.length < size) continue;
      const pick = near.slice(0, size);
      if (!pick.includes(anchor)) pick[size - 1] = anchor;
      return pick;
    }
  }
  return null;
}

// Ranked: snake-draft by MMR (1-2-2-1...) so both sides land on a similar average. Co-op: all Blue.
export function balanceTeams(ts: Ticket[], mode: Mode): Map<string, 0 | 1> {
  const out = new Map<string, 0 | 1>();
  if (mode === 'coop') {
    for (const t of ts) out.set(t.id, 0);
    return out;
  }
  const order: (0 | 1)[] = [0, 1, 1, 0];
  [...ts].sort((a, b) => b.mmr - a.mmr).forEach((t, i) => out.set(t.id, order[i % 4]));
  return out;
}

// ---------- rating ----------
const MMR_KEY = 'rift-mmr';
export interface Rating {
  mmr: number;
  wins: number;
  losses: number;
}
export function loadRating(): Rating {
  try {
    const r = JSON.parse(localStorage.getItem(MMR_KEY) ?? '') as Rating;
    if (Number.isFinite(r.mmr)) return r;
  } catch {
    /* first visit or storage blocked */
  }
  return { mmr: 1000, wins: 0, losses: 0 };
}
export function saveRating(r: Rating) {
  try {
    localStorage.setItem(MMR_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked: rating lasts for this tab only */
  }
}
// Elo with a bigger K while a player is new
export function rateResult(r: Rating, oppMmr: number, won: boolean): { next: Rating; delta: number } {
  const games = r.wins + r.losses;
  const k = games < 10 ? 48 : 28;
  const expected = 1 / (1 + 10 ** ((oppMmr - r.mmr) / 400));
  const delta = Math.round(k * ((won ? 1 : 0) - expected));
  return { next: { mmr: Math.max(0, r.mmr + delta), wins: r.wins + (won ? 1 : 0), losses: r.losses + (won ? 0 : 1) }, delta };
}
export const TIERS: [number, string, string][] = [
  [0, 'Stone', '#8b8f96'],
  [800, 'Bronze', '#c48a5a'],
  [950, 'Silver', '#c8d0d8'],
  [1100, 'Gold', '#e8c46a'],
  [1250, 'Platinum', '#5fd6c0'],
  [1400, 'Diamond', '#7ab6ff'],
  [1600, 'Mythic', '#d58cff'],
];
export function tierOf(mmr: number) {
  let t = TIERS[0];
  for (const x of TIERS) if (mmr >= x[0]) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1];
  return { name: t[1], color: t[2], floor: t[0], next: next ? next[0] : null };
}
// bots are rated so co-op wins against harder AI count for more
export const BOT_MMR: Record<string, number> = { easy: 850, normal: 1050, hard: 1300 };
