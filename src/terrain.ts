// Map terrain shared by the simulation and the renderer: a 100-unit grid of walkable / wall cells,
// brush patches, jungle camp sites, pathfinding and line-of-sight. The layout is original but follows
// the genre's standard shape: walled jungle quadrants with corridors and camp clearings between
// three lanes, a diagonal river with two epic pits, and walled bases with one exit per lane.
import { BASES, LANES, MAP, RIVER } from './data';
import type { Vec } from './data';

export const CELL = 100;
export const GN = MAP / CELL;
export const blocked = new Uint8Array(GN * GN); // 1 = wall
export const brushAt = new Int16Array(GN * GN).fill(-1); // brush patch id or -1

const segDist = (p: Vec, a: Vec, b: Vec) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
export const polyDist = (p: Vec, poly: Vec[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(p, poly[i], poly[i + 1]));
  return d;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// symmetry: features are authored for Blue's west quadrant (between top lane, mid and river)
const reflect = (p: Vec): Vec => ({ x: MAP - p.y, y: MAP - p.x }); // across mid lane -> Blue's south quadrant
const mirror = (p: Vec): Vec => ({ x: MAP - p.x, y: MAP - p.y }); // point mirror -> Red's side
const four = (p: Vec): Vec[] => [p, reflect(p), mirror(p), mirror(reflect(p))];

// ---------- camps ----------
export type MonsterType = 'azure' | 'ember' | 'toad' | 'birdBig' | 'bird' | 'boarBig' | 'boar' | 'hulkBig' | 'hulk' | 'skitter' | 'drake' | 'colossus';
export interface CampDef {
  id: number;
  name: string;
  x: number;
  y: number;
  side: 0 | 1 | 2; // which team's jungle it sits in (2 = river)
  first: number; // first spawn, seconds
  respawn: number;
  mobs: { type: MonsterType; dx: number; dy: number }[];
  epic?: boolean;
}
const WEST = {
  toad: { x: 2900, y: 7300 },
  buff: { x: 4100, y: 7600 },
  birds: { x: 5300, y: 7300 },
};
export const CAMPS: CampDef[] = [];
{
  let id = 0;
  const add = (name: string, p: Vec, side: 0 | 1 | 2, first: number, respawn: number, mobs: CampDef['mobs'], epic = false) =>
    CAMPS.push({ id: id++, name, x: p.x, y: p.y, side, first, respawn, mobs, epic });
  for (const team of [0, 1] as const) {
    const t = (p: Vec) => (team ? mirror(p) : p);
    add('Azure Golem', t(WEST.buff), team, 90, 300, [{ type: 'azure', dx: 0, dy: 0 }]);
    add('Bog Toad', t(WEST.toad), team, 102, 135, [{ type: 'toad', dx: 0, dy: 0 }]);
    add('Razorbeaks', t(WEST.birds), team, 90, 135, [
      { type: 'birdBig', dx: 0, dy: 0 },
      { type: 'bird', dx: 110, dy: -70 },
      { type: 'bird', dx: -110, dy: -60 },
      { type: 'bird', dx: 20, dy: 120 },
    ]);
    add('Ember Brute', t(reflect(WEST.buff)), team, 90, 300, [{ type: 'ember', dx: 0, dy: 0 }]);
    add('Stonehulks', t(reflect(WEST.toad)), team, 102, 135, [
      { type: 'hulkBig', dx: 0, dy: 0 },
      { type: 'hulk', dx: 130, dy: 60 },
    ]);
    add('Thornback Boars', t(reflect(WEST.birds)), team, 90, 135, [
      { type: 'boarBig', dx: 0, dy: 0 },
      { type: 'boar', dx: 120, dy: 70 },
      { type: 'boar', dx: -100, dy: 90 },
    ]);
  }
  add('River Skitter', { x: 5900, y: 5900 }, 2, 210, 150, [{ type: 'skitter', dx: 0, dy: 0 }]);
  add('River Skitter', { x: 8100, y: 8100 }, 2, 210, 150, [{ type: 'skitter', dx: 0, dy: 0 }]);
  add('Abyssal Colossus', { x: 4650, y: 4650 }, 2, 480, 360, [{ type: 'colossus', dx: 0, dy: 0 }], true);
  add('Storm Drake', { x: 9350, y: 9350 }, 2, 300, 300, [{ type: 'drake', dx: 0, dy: 0 }], true);
}

// ---------- brush ----------
export const BRUSHES: { x: number; y: number; r: number }[] = [];
{
  const west: [number, number, number][] = [
    [3400, 6500, 210], // jungle corridor
    [4750, 6600, 200],
    [4700, 8400, 190],
    [5400, 5100, 230], // river, beside the skitter
    [6350, 6950, 200], // mid lane, by the river
    [2650, 4200, 200], // river entrance
  ];
  for (const [x, y, r] of west) for (const p of four({ x, y })) BRUSHES.push({ ...p, r });
  // lane brushes on alternating sides, away from the bases
  for (const lane of LANES) {
    const len = lane.reduce((a, p, i) => (i ? a + dist(lane[i - 1], p) : 0), 0);
    [0.3, 0.42, 0.58, 0.7].forEach((f, k) => {
      let d = len * f;
      for (let i = 1; i < lane.length; i++) {
        const seg = dist(lane[i - 1], lane[i]);
        if (d > seg) {
          d -= seg;
          continue;
        }
        const a = lane[i - 1];
        const b = lane[i];
        const nx = -(b.y - a.y) / seg;
        const ny = (b.x - a.x) / seg;
        const side = k % 2 ? 1 : -1;
        const p = { x: a.x + ((b.x - a.x) * d) / seg + nx * side * 560, y: a.y + ((b.y - a.y) * d) / seg + ny * side * 560 };
        if (p.x > 300 && p.y > 300 && p.x < MAP - 300 && p.y < MAP - 300 && dist(p, BASES[0]) > 4200 && dist(p, BASES[1]) > 4200) BRUSHES.push({ ...p, r: 200 });
        break;
      }
    });
  }
}

// ---------- walls ----------
const CORRIDORS: Vec[][] = [];
{
  const west: [number, number][][] = [
    [[1500, 7000], [2900, 7300], [4100, 7600], [5300, 7300], [6250, 7750]],
    [[4100, 7600], [3900, 6000], [3700, 4000]],
    [[2900, 7300], [2700, 5300], [2600, 3000]],
    [[2700, 5300], [3900, 6000]],
    [[5300, 7300], [5600, 5900]],
    [[3700, 9800], [4000, 8700], [4100, 7600]],
    [[4000, 8700], [5300, 7300]],
  ];
  for (const path of west) {
    const pts = path.map(([x, y]) => ({ x, y }));
    CORRIDORS.push(pts, pts.map(reflect), pts.map(mirror), pts.map((p) => mirror(reflect(p))));
  }
}
const inBase = (p: Vec) => (p.x <= 4400 && p.y >= 9600) || (p.x >= MAP - 4400 && p.y <= MAP - 9600);
const baseWall = (p: Vec) =>
  (p.x <= 4400 && p.y >= 9600 && (p.x >= 4050 || p.y <= 9950)) || (p.x >= MAP - 4400 && p.y <= MAP - 9600 && (p.x <= MAP - 4050 || p.y >= MAP - 9950));

const isFreeAt = (p: Vec) => {
  if (p.x < 150 || p.y < 150 || p.x > MAP - 150 || p.y > MAP - 150) return false;
  if (LANES.some((l) => polyDist(p, l) < 470)) return true;
  if (segDist(p, RIVER[0], RIVER[1]) < 520) return true;
  if (CAMPS.some((c) => dist(p, c) < (c.epic ? 680 : c.mobs.length > 1 ? 470 : 420))) return true;
  if (CORRIDORS.some((c) => polyDist(p, c) < 190)) return true;
  if (BRUSHES.some((b) => dist(p, b) < b.r + 40)) return true;
  if (inBase(p)) return !baseWall(p);
  return false;
};
for (let gy = 0; gy < GN; gy++)
  for (let gx = 0; gx < GN; gx++) {
    const p = { x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL };
    blocked[gy * GN + gx] = isFreeAt(p) ? 0 : 1;
    BRUSHES.forEach((b, i) => {
      if (dist(p, b) < b.r) brushAt[gy * GN + gx] = i;
    });
  }

export const cellOf = (x: number, y: number) => {
  const gx = Math.max(0, Math.min(GN - 1, Math.floor(x / CELL)));
  const gy = Math.max(0, Math.min(GN - 1, Math.floor(y / CELL)));
  return gy * GN + gx;
};
export const isWall = (x: number, y: number) => blocked[cellOf(x, y)] === 1;
export const brushOf = (x: number, y: number) => brushAt[cellOf(x, y)];

// For every wall cell, the closest walkable cell (multi-source BFS), so anything pushed into a
// wall can be put back on the nearest floor.
const nearest = new Int32Array(GN * GN).fill(-1);
{
  const q = new Int32Array(GN * GN);
  let h = 0;
  let t = 0;
  for (let i = 0; i < GN * GN; i++)
    if (!blocked[i]) {
      nearest[i] = i;
      q[t++] = i;
    }
  while (h < t) {
    const i = q[h++];
    const gx = i % GN;
    const gy = (i / GN) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= GN || ny >= GN) continue;
      const j = ny * GN + nx;
      if (nearest[j] !== -1) continue;
      nearest[j] = nearest[i];
      q[t++] = j;
    }
  }
}
// Moves a point out of walls onto the closest walkable spot (just inside that cell's edge).
export function pushOut(p: Vec): boolean {
  const c = cellOf(p.x, p.y);
  if (!blocked[c]) return false;
  const f = nearest[c];
  const fx = (f % GN) * CELL;
  const fy = ((f / GN) | 0) * CELL;
  p.x = Math.max(fx + 2, Math.min(fx + CELL - 2, p.x));
  p.y = Math.max(fy + 2, Math.min(fy + CELL - 2, p.y));
  return true;
}

// Walls block sight and straight-line movement.
export function lineClear(a: Vec, b: Vec, step = 45): boolean {
  const d = dist(a, b);
  const n = Math.ceil(d / step);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (blocked[cellOf(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)]) return false;
  }
  return true;
}

// ---------- A* ----------
const gScore = new Float32Array(GN * GN);
const came = new Int32Array(GN * GN);
const stamp = new Uint32Array(GN * GN);
const closed = new Uint32Array(GN * GN);
let run = 1;
const heap: number[] = [];
const fOf = new Float32Array(GN * GN);
function push(i: number) {
  heap.push(i);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (fOf[heap[p]] <= fOf[i]) break;
    heap[k] = heap[p];
    k = p;
  }
  heap[k] = i;
}
function pop(): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      if (l >= heap.length) break;
      const r = l + 1;
      const c = r < heap.length && fOf[heap[r]] < fOf[heap[l]] ? r : l;
      if (fOf[heap[c]] >= fOf[last]) break;
      heap[k] = heap[c];
      k = c;
    }
    heap[k] = last;
  }
  return top;
}
const NB: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// Returns waypoints from a to b (excluding a), smoothed by line-of-sight; [] if b is unreachable.
export function findPath(a: Vec, b: Vec): Vec[] {
  const goalP = { ...b };
  pushOut(goalP);
  if (lineClear(a, goalP)) return [goalP];
  const sp = { ...a };
  pushOut(sp);
  const s = cellOf(sp.x, sp.y);
  const g = cellOf(goalP.x, goalP.y);
  run++;
  heap.length = 0;
  const gx = g % GN;
  const gy = (g / GN) | 0;
  const h = (i: number) => {
    const dx = Math.abs((i % GN) - gx);
    const dy = Math.abs(((i / GN) | 0) - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  stamp[s] = run;
  gScore[s] = 0;
  came[s] = -1;
  fOf[s] = h(s);
  push(s);
  let found = false;
  let iters = 0;
  while (heap.length && iters++ < 12000) {
    const i = pop();
    if (closed[i] === run) continue;
    closed[i] = run;
    if (i === g) {
      found = true;
      break;
    }
    const x = i % GN;
    const y = (i / GN) | 0;
    for (const [dx, dy, cost] of NB) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GN || ny >= GN) continue;
      const j = ny * GN + nx;
      if (blocked[j] || closed[j] === run) continue;
      if (dx && dy && (blocked[y * GN + nx] || blocked[ny * GN + x])) continue; // no corner cutting
      const ng = gScore[i] + cost;
      if (stamp[j] === run && ng >= gScore[j]) continue;
      stamp[j] = run;
      gScore[j] = ng;
      came[j] = i;
      fOf[j] = ng + h(j);
      push(j);
    }
  }
  if (!found) return [];
  const cells: Vec[] = [];
  for (let i = g; i !== -1 && i !== s; i = came[i]) cells.push({ x: ((i % GN) + 0.5) * CELL, y: (((i / GN) | 0) + 0.5) * CELL });
  cells.reverse();
  cells[cells.length - 1] = goalP;
  // string-pull: skip every waypoint we can see past
  const out: Vec[] = [];
  let from = a;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let j = cells.length - 1; j > k; j--)
      if (lineClear(from, cells[j])) {
        far = j;
        break;
      }
    out.push(cells[far]);
    from = cells[far];
    k = far + 1;
  }
  return out;
}
