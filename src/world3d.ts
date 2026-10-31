// 3D view of the match: a Three.js scene drawn behind the 2D overlay canvas.
// Characters are CC0 KayKit models by Kay Lousberg (kaylousberg.com); the map, structures and
// foliage are built here from primitives. The simulation never reads anything in this file.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASES, FOUNTAIN_R, LANES, MAP, RIVER } from './data';
import type { Team, Vec } from './data';

// Orthographic camera tilted 56° above the horizon. Ortho keeps the ground plane affine on screen,
// so the 2D overlay lines up with a plain scale: screen y = (y - cy) * zoom * K - height * zoom * HK.
export const ELEV = (56 * Math.PI) / 180;
export const K = Math.sin(ELEV);
export const HK = Math.cos(ELEV);

const TOUCH = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
const TEAM_HEX = [0x3b8cff, 0xff4d4d];

export interface WUnit {
  kind: 'champ' | 'minion' | 'tower' | 'nexus';
  team: Team;
  x: number;
  y: number;
  r: number;
  dead: boolean;
  face: number;
  hitFlash: number;
  lunge: number;
  lx: number;
  ly: number;
  pop: number;
  fadeIn: number;
  slowT: number;
  mtype: 'melee' | 'caster' | 'siege' | 'super' | null;
  tier: number;
  act: string;
  actN: number;
  champ: { def: { id: string; ranged: boolean }; dash: unknown; recallT: number } | null;
}

// Height of the top of each body, for health bars, hover tests and effects.
export function unitHeight(u: Pick<WUnit, 'kind' | 'mtype' | 'tier'>): number {
  if (u.kind === 'champ') return 150;
  if (u.kind === 'tower') return u.tier === 2 ? 170 : 300;
  if (u.kind === 'nexus') return 250;
  return u.mtype === 'super' ? 140 : u.mtype === 'siege' ? 104 : u.mtype === 'caster' ? 76 : 82;
}

// ---------- helpers ----------
const segDist = (p: Vec, a: Vec, b: Vec) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const polyDist = (p: Vec, poly: Vec[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length - 1; i++) d = Math.min(d, segDist(p, poly[i], poly[i + 1]));
  return d;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- renderer / scene ----------
export const canvas3d = document.createElement('canvas');
canvas3d.id = 'world';
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1a12');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);

scene.add(new THREE.HemisphereLight('#dfeeff', '#4a5a2e', 1.35));
const sun = new THREE.DirectionalLight('#fff0d2', 2.6);
const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.3).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 1.5;
scene.add(sun, sun.target);

// ---------- ground texture (also feeds the minimap) ----------
const TEX = TOUCH ? 2048 : 4096;
export const groundCanvas = document.createElement('canvas');
groundCanvas.width = groundCanvas.height = TEX;
const trees: { x: number; y: number; s: number; v: number }[] = [];
const rocks: { x: number; y: number; s: number }[] = [];
const brush: { x: number; y: number }[] = [];

(function paintGround() {
  const m = groundCanvas.getContext('2d')!;
  m.scale(TEX / MAP, TEX / MAP);
  m.fillStyle = '#4f7232';
  m.fillRect(0, 0, MAP, MAP);
  const blob = (x: number, y: number, r: number, col: string) => {
    const g = m.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    m.fillStyle = g;
    m.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // painterly colour drift
  for (let i = 0; i < 420; i++) {
    const c = ['rgba(118,150,62,0.35)', 'rgba(40,82,52,0.35)', 'rgba(150,160,70,0.22)', 'rgba(32,70,48,0.3)'][i % 4];
    blob(rnd() * MAP, rnd() * MAP, 120 + rnd() * 320, c);
  }
  // jungle placement: trees wherever there is no lane, river or base
  for (let i = 0; i < 2600; i++) {
    const p = { x: rnd() * MAP, y: rnd() * MAP };
    const laneD = Math.min(...LANES.map((l) => polyDist(p, l)));
    const riverD = segDist(p, RIVER[0], RIVER[1]);
    if (laneD < 250 || riverD < 210 || dist(p, BASES[0]) < 980 || dist(p, BASES[1]) < 980) continue;
    // keep a few camp clearings open so the jungle reads as paths, not a carpet
    const clearing = ((p.x * 0.0021 + Math.sin(p.y * 0.003) * 1.3) % 1 + 1) % 1;
    if (clearing < 0.16 && laneD > 420) continue;
    if (rnd() < 0.1) rocks.push({ x: p.x, y: p.y, s: 0.7 + rnd() * 0.9 });
    else trees.push({ x: p.x, y: p.y, s: 0.75 + rnd() * 0.6, v: rnd() });
  }
  for (const t of trees) blob(t.x, t.y, 120 * t.s, 'rgba(24,52,30,0.55)');
  // river bed
  m.lineCap = 'round';
  m.lineJoin = 'round';
  const stroke = (poly: Vec[], w: number, col: string) => {
    m.strokeStyle = col;
    m.lineWidth = w;
    m.beginPath();
    m.moveTo(poly[0].x, poly[0].y);
    for (const p of poly.slice(1)) m.lineTo(p.x, p.y);
    m.stroke();
  };
  stroke(RIVER, 420, 'rgba(60,80,50,0.7)');
  stroke(RIVER, 330, '#3f5f4d');
  stroke(RIVER, 260, '#2c5a62');
  // lanes: soft worn edge, packed dirt, pale centre
  for (const l of LANES) stroke(l, 330, 'rgba(92,86,52,0.55)');
  for (const l of LANES) stroke(l, 260, '#8a7550');
  for (const l of LANES) stroke(l, 180, '#a08b62');
  for (const l of LANES) stroke(l, 90, 'rgba(184,163,118,0.55)');
  // pebbles and cracks along the lanes
  for (const l of LANES)
    for (let i = 0; i < l.length - 1; i++) {
      const a = l[i];
      const b = l[i + 1];
      const len = dist(a, b);
      for (let s = 0; s < len; s += 18) {
        const t = s / len;
        const off = (rnd() - 0.5) * 230;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        m.fillStyle = rnd() < 0.5 ? 'rgba(70,58,38,0.35)' : 'rgba(210,196,160,0.35)';
        m.beginPath();
        m.ellipse(a.x + (b.x - a.x) * t + nx * off, a.y + (b.y - a.y) * t + ny * off, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
        m.fill();
      }
    }
  // grass strokes for texture
  for (let i = 0; i < (TOUCH ? 30000 : 70000); i++) {
    const x = rnd() * MAP;
    const y = rnd() * MAP;
    m.strokeStyle = ['rgba(150,190,80,0.25)', 'rgba(30,70,40,0.3)', 'rgba(190,200,110,0.18)'][i % 3];
    m.lineWidth = 2;
    m.beginPath();
    m.moveTo(x, y);
    m.lineTo(x + (rnd() - 0.5) * 6, y - 6 - rnd() * 8);
    m.stroke();
  }
  // brush patches beside the lanes
  for (const l of LANES)
    for (let i = 0; i < l.length - 1; i++) {
      const a = l[i];
      const b = l[i + 1];
      for (const t of [0.38, 0.62]) {
        const len = dist(a, b);
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const side = rnd() < 0.5 ? -1 : 1;
        const p = { x: a.x + (b.x - a.x) * t + nx * side * 215, y: a.y + (b.y - a.y) * t + ny * side * 215 };
        if (dist(p, BASES[0]) < 1100 || dist(p, BASES[1]) < 1100 || segDist(p, RIVER[0], RIVER[1]) < 200) continue;
        brush.push(p);
      }
    }
  // bases: stone plazas with tile rings
  BASES.forEach((b, team) => {
    const g = m.createRadialGradient(b.x, b.y, 100, b.x, b.y, 980);
    g.addColorStop(0, '#9a917a');
    g.addColorStop(0.7, '#857c66');
    g.addColorStop(1, 'rgba(110,100,80,0)');
    m.fillStyle = g;
    m.beginPath();
    m.arc(b.x, b.y, 980, 0, Math.PI * 2);
    m.fill();
    m.strokeStyle = 'rgba(60,52,40,0.35)';
    m.lineWidth = 4;
    for (let r = 160; r < 900; r += 85) {
      m.beginPath();
      m.arc(b.x, b.y, r, 0, Math.PI * 2);
      m.stroke();
      for (let a = 0; a < Math.PI * 2; a += 340 / r) {
        m.beginPath();
        m.moveTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
        m.lineTo(b.x + Math.cos(a) * (r + 85), b.y + Math.sin(a) * (r + 85));
        m.stroke();
      }
    }
    m.strokeStyle = team ? 'rgba(200,70,60,0.55)' : 'rgba(70,140,230,0.55)';
    m.lineWidth = 14;
    m.beginPath();
    m.arc(b.x, b.y, FOUNTAIN_R, 0, Math.PI * 2);
    m.stroke();
  });
})();

// Minimap: ground plus the jungle canopy.
export const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = minimapCanvas.height = 440;
(function paintMinimap() {
  const m = minimapCanvas.getContext('2d')!;
  m.drawImage(groundCanvas, 0, 0, 440, 440);
  m.scale(440 / MAP, 440 / MAP);
  for (const t of trees) {
    m.fillStyle = t.v < 0.5 ? '#1d3b22' : '#24472a';
    m.beginPath();
    m.arc(t.x, t.y, 60 * t.s, 0, Math.PI * 2);
    m.fill();
  }
})();

const groundTex = new THREE.CanvasTexture(groundCanvas);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP, MAP), new THREE.MeshLambertMaterial({ map: groundTex }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(MAP / 2, 0, MAP / 2);
ground.receiveShadow = true;
scene.add(ground);
// dark forest beyond the playable edge
const outer = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 3, MAP * 3), new THREE.MeshLambertMaterial({ color: '#1a2e1b' }));
outer.rotation.x = -Math.PI / 2;
outer.position.set(MAP / 2, -2, MAP / 2);
scene.add(outer);

// ---------- river ----------
const riverMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime;
    void main(){
      float edge = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
      vec2 p = vec2(vUv.x * 60.0, vUv.y * 4.0);
      float w = sin(p.x * 1.3 + uTime * 1.4 + sin(p.y * 3.0 + uTime) * 1.5) * 0.5 + 0.5;
      float w2 = sin(p.x * 2.7 - uTime * 1.1 + p.y * 5.0) * 0.5 + 0.5;
      float caustic = pow(w * w2, 4.0);
      vec3 deep = vec3(0.05, 0.22, 0.28);
      vec3 shallow = vec3(0.16, 0.42, 0.45);
      vec3 col = mix(shallow, deep, edge * 0.8) + caustic * vec3(0.16, 0.24, 0.22);
      gl_FragColor = vec4(col, 0.62 * edge + 0.04);
    }`,
});
{
  const len = dist(RIVER[0], RIVER[1]);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(len, 300), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = -Math.atan2(RIVER[1].y - RIVER[0].y, RIVER[1].x - RIVER[0].x);
  river.position.set((RIVER[0].x + RIVER[1].x) / 2, 1.5, (RIVER[0].y + RIVER[1].y) / 2);
  river.renderOrder = 1;
  scene.add(river);
}

// ---------- foliage ----------
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: { m: THREE.Matrix4; c?: THREE.Color }[], shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    if (it.c) mesh.setColorAt(i, it.c);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}
{
  const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  // a ring of border trees frames the map edge
  for (let a = 0; a < MAP * 4; a += 110) {
    const side = Math.floor(a / MAP);
    const t = a % MAP;
    const off = -60 - rnd() * 120;
    const p = [
      { x: t, y: off },
      { x: MAP - off, y: t },
      { x: MAP - t, y: MAP - off },
      { x: off, y: MAP - t },
    ][side];
    trees.push({ x: p.x, y: p.y, s: 1 + rnd() * 0.5, v: rnd() });
  }
  const trunks: { m: THREE.Matrix4 }[] = [];
  const crowns: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const palette = ['#245a33', '#2f6a35', '#21503f', '#3a7232', '#1d4a33'].map((c) => new THREE.Color(c));
  for (const t of trees) {
    const s = t.s;
    trunks.push({ m: M(t.x, 40 * s, t.y, 12 * s, 80 * s, 12 * s) });
    const c = palette[Math.floor(t.v * palette.length)].clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
    crowns.push({ m: M(t.x, 110 * s, t.y, 66 * s, 58 * s, 66 * s, rnd() * 6), c });
    crowns.push({ m: M(t.x + 14 * s, 158 * s, t.y - 8 * s, 46 * s, 44 * s, 46 * s, rnd() * 6), c: c.clone().offsetHSL(0, 0.02, 0.04) });
  }
  instanced(new THREE.CylinderGeometry(0.6, 1, 1, 6), new THREE.MeshLambertMaterial({ color: '#5a3d26' }), trunks, false);
  instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), crowns);
  const rockList = rocks.map((r) => ({ m: M(r.x, 20 * r.s, r.y, 60 * r.s, 45 * r.s, 50 * r.s, rnd() * 6), c: new THREE.Color('#7d7a6e').offsetHSL(0, 0, (rnd() - 0.5) * 0.1) }));
  instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), rockList);
  // tall brush: clumps of blades, tinted the classic teal-violet
  const blades: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  for (const b of brush)
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 95;
      const h = 45 + rnd() * 35;
      blades.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(b.x + Math.cos(a) * r, h / 2, b.y + Math.sin(a) * r * 0.7),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5)),
          new THREE.Vector3(10, h, 10),
        ),
        c: new THREE.Color(rnd() < 0.5 ? '#3f7a52' : '#4e6f6a').offsetHSL(0, 0, (rnd() - 0.5) * 0.08),
      });
    }
  instanced(new THREE.ConeGeometry(1, 1, 4), new THREE.MeshLambertMaterial({ flatShading: true }), blades, false);
}

// ---------- structures ----------
const STONE = [new THREE.Color('#c9c1ad'), new THREE.Color('#5c5560')];
const TRIM = [new THREE.Color('#d9b45a'), new THREE.Color('#8a3a2c')];
const GLOW = [new THREE.Color('#5fb4ff'), new THREE.Color('#ff5a4a')];
const stoneMat = STONE.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
const trimMat = TRIM.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.6, flatShading: true }));
const crystalMat = GLOW.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.2, flatShading: true, transparent: true, opacity: 0.92 }),
);
const rubbleMat = new THREE.MeshStandardMaterial({ color: '#4a4744', roughness: 1, flatShading: true });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, y: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

interface Struct {
  root: THREE.Group;
  alive: THREE.Group;
  rubble: THREE.Group;
  crystal: THREE.Mesh;
  spin: THREE.Object3D | null;
  wasDead: boolean;
}
function buildTower(team: Team): Struct {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  const rubble = new THREE.Group();
  part(new THREE.CylinderGeometry(66, 80, 36, 8), stoneMat[team], 18, root);
  part(new THREE.CylinderGeometry(58, 62, 14, 8), trimMat[team], 42, alive);
  part(new THREE.CylinderGeometry(32, 44, 170, 8), stoneMat[team], 134, alive);
  part(new THREE.CylinderGeometry(30, 34, 10, 8), trimMat[team], 120, alive);
  part(new THREE.CylinderGeometry(54, 38, 28, 8), trimMat[team], 228, alive);
  for (let i = 0; i < 4; i++) {
    const prong = part(new THREE.BoxGeometry(10, 74, 16), trimMat[team], 270, alive);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    prong.position.x = Math.cos(a) * 40;
    prong.position.z = Math.sin(a) * 40;
    prong.rotation.y = -a;
    prong.rotation.z = 0.28;
    prong.rotation.order = 'YXZ';
  }
  const crystal = part(new THREE.OctahedronGeometry(26, 0), crystalMat[team], 282, alive);
  crystal.scale.y = 1.7;
  crystal.castShadow = false;
  for (let i = 0; i < 7; i++) {
    const r = part(new THREE.DodecahedronGeometry(14 + rnd() * 16, 0), i % 2 ? stoneMat[team] : rubbleMat, 30 + rnd() * 10, rubble);
    r.position.x = (rnd() - 0.5) * 90;
    r.position.z = (rnd() - 0.5) * 90;
    r.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  rubble.visible = false;
  root.add(alive, rubble);
  scene.add(root);
  return { root, alive, rubble, crystal, spin: null, wasDead: false };
}
function buildNexus(team: Team): Struct {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  const rubble = new THREE.Group();
  part(new THREE.CylinderGeometry(150, 172, 30, 12), stoneMat[team], 15, root);
  part(new THREE.CylinderGeometry(112, 130, 26, 12), trimMat[team], 42, root);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pillar = part(new THREE.BoxGeometry(20, 100, 20), stoneMat[team], 80, alive);
    pillar.position.x = Math.cos(a) * 128;
    pillar.position.z = Math.sin(a) * 128;
    const tip = part(new THREE.OctahedronGeometry(12, 0), crystalMat[team], 142, alive);
    tip.position.copy(pillar.position).setY(142);
    tip.castShadow = false;
  }
  const crystal = part(new THREE.OctahedronGeometry(70, 0), crystalMat[team], 170, alive);
  crystal.scale.set(0.8, 1.6, 0.8);
  crystal.castShadow = false;
  const spin = new THREE.Group();
  spin.position.y = 170;
  const ringMesh = part(new THREE.TorusGeometry(100, 6, 6, 36), trimMat[team], 0, spin);
  ringMesh.rotation.x = Math.PI / 2 - 0.35;
  alive.add(spin);
  for (let i = 0; i < 9; i++) {
    const r = part(new THREE.OctahedronGeometry(16 + rnd() * 22, 0), i % 3 ? crystalMat[team] : rubbleMat, 60 + rnd() * 20, rubble);
    r.position.x = (rnd() - 0.5) * 160;
    r.position.z = (rnd() - 0.5) * 160;
    r.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  rubble.visible = false;
  root.add(alive, rubble);
  scene.add(root);
  return { root, alive, rubble, crystal, spin, wasDead: false };
}
// inhibitor: a crystal sphere held in a floating ring above a stepped plinth
function buildInhib(team: Team): Struct {
  const root = new THREE.Group();
  const alive = new THREE.Group();
  const rubble = new THREE.Group();
  part(new THREE.CylinderGeometry(70, 84, 22, 10), stoneMat[team], 11, root);
  part(new THREE.CylinderGeometry(52, 62, 18, 10), trimMat[team], 31, root);
  const crystal = part(new THREE.IcosahedronGeometry(38, 1), crystalMat[team], 120, alive);
  crystal.castShadow = false;
  const spin = new THREE.Group();
  spin.position.y = 120;
  const r1 = part(new THREE.TorusGeometry(58, 5, 6, 32), trimMat[team], 0, spin);
  r1.rotation.x = Math.PI / 2;
  const r2 = part(new THREE.TorusGeometry(50, 4, 6, 32), trimMat[team], 0, spin);
  r2.rotation.y = Math.PI / 2;
  alive.add(spin);
  for (let i = 0; i < 6; i++) {
    const r = part(new THREE.OctahedronGeometry(12 + rnd() * 14, 0), i % 2 ? crystalMat[team] : rubbleMat, 48, rubble);
    r.position.x = (rnd() - 0.5) * 90;
    r.position.z = (rnd() - 0.5) * 90;
  }
  rubble.visible = false;
  root.add(alive, rubble);
  scene.add(root);
  return { root, alive, rubble, crystal, spin, wasDead: false };
}

// fountains: a low stone dais with a glowing rune ring champions stand on
BASES.forEach((b, team) => {
  const root = new THREE.Group();
  root.position.set(b.x, 0, b.y);
  part(new THREE.CylinderGeometry(FOUNTAIN_R * 0.5, FOUNTAIN_R * 0.54, 6, 24), stoneMat[team], 3, root).castShadow = false;
  const rune = new THREE.Mesh(new THREE.TorusGeometry(FOUNTAIN_R * 0.42, 5, 6, 48), crystalMat[team as Team]);
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 7;
  root.add(rune);
  scene.add(root);
});

// ---------- characters ----------
interface HeroCfg {
  file: string;
  hide: string[];
  attack: string;
  abilities: string[]; // per slot
}
const HEROES: Record<string, HeroCfg> = {
  aurin: { file: 'Mage', hide: ['Spellbook', 'Spellbook_open', '1H_Wand'], attack: 'Spellcast_Shoot', abilities: ['Spellcast_Shoot', 'Spellcast_Raise', 'Dodge_Forward', 'Spellcast_Long'] },
  brakk: { file: 'Barbarian', hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'], attack: '2H_Melee_Attack_Chop', abilities: ['Cheer', '2H_Melee_Attack_Spin', 'Dodge_Forward', '2H_Melee_Attack_Chop'] },
  sylla: { file: 'Rogue', hide: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'], attack: '2H_Ranged_Shoot', abilities: ['Spellcast_Raise', '2H_Ranged_Shoot', 'Dodge_Forward', '2H_Ranged_Shoot'] },
};
const MINIONS = {
  melee: { file: 'Skeleton_Minion', weapon: 'Skeleton_Blade', offhand: 'Skeleton_Shield_Small_A', attack: '1H_Melee_Attack_Chop', tint: /Cloak/ },
  caster: { file: 'Skeleton_Mage', weapon: 'Skeleton_Staff', offhand: '', attack: 'Spellcast_Shoot', tint: /Hat/ },
  siege: { file: 'Skeleton_Warrior', weapon: 'Skeleton_Axe', offhand: '', attack: '2H_Melee_Attack_Chop', tint: /Cloak|Helmet/ },
  super: { file: 'Skeleton_Warrior', weapon: 'Skeleton_Axe', offhand: 'Skeleton_Shield_Small_A', attack: '2H_Melee_Attack_Chop', tint: /Cloak|Helmet|Body/ },
} as const;

const templates = new Map<string, THREE.Object3D>();
const clips = new Map<string, THREE.AnimationClip>();
const heights = new Map<string, number>();
export let modelsReady = false;

export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/`;
  const files = ['Mage', 'Barbarian', 'Rogue', 'Skeleton_Minion', 'Skeleton_Mage', 'Skeleton_Warrior', 'Skeleton_Blade', 'Skeleton_Staff', 'Skeleton_Axe', 'Skeleton_Shield_Small_A'];
  const [hero, skel, ...gl] = await Promise.all([
    loader.loadAsync(`${base}anims_hero.glb`),
    loader.loadAsync(`${base}anims_skel.glb`),
    ...files.map((f) => loader.loadAsync(`${base}${f}.glb`)),
  ]);
  for (const c of [...skel.animations, ...hero.animations]) clips.set(c.name, c);
  files.forEach((f, i) => {
    const sc = gl[i].scene;
    sc.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow animation
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.roughness = 0.85;
      mat.metalness = 0;
    });
    templates.set(f, sc);
    const box = new THREE.Box3().setFromObject(sc);
    heights.set(f, box.max.y - box.min.y || 2);
  });
  modelsReady = true;
}

interface Avatar {
  u: WUnit;
  root: THREE.Group;
  model: THREE.Object3D;
  scale: number;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  cur: THREE.AnimationAction | null;
  curName: string;
  mats: THREE.MeshStandardMaterial[];
  idle: string;
  run: string;
  attack: string;
  abilities: string[];
  death: string;
  lastX: number;
  lastY: number;
  speed: number;
  yaw: number;
  actN: number;
  oneShot: number;
  dying: number; // seconds since death, -1 while alive
  ring: THREE.Mesh;
}

const avatars = new Map<WUnit, Avatar>();
const structs = new Map<WUnit, Struct>();
const ringGeo = new THREE.RingGeometry(0.82, 1, 40);

function findBone(root: THREE.Object3D, name: string) {
  return root.getObjectByName(name) ?? root.getObjectByName(name.replace('.', ''));
}

function makeAvatar(u: WUnit): Avatar | null {
  let file: string;
  let attack: string;
  let abilities: string[] = [];
  let hide: string[] = [];
  let tint: RegExp | null = null;
  let weapon = '';
  let offhand = '';
  if (u.kind === 'champ') {
    const h = HEROES[u.champ!.def.id] ?? HEROES.aurin;
    file = h.file;
    attack = h.attack;
    abilities = h.abilities;
    hide = h.hide;
  } else {
    const m = MINIONS[u.mtype ?? 'melee'];
    file = m.file;
    attack = m.attack;
    tint = m.tint;
    weapon = m.weapon;
    offhand = m.offhand;
  }
  const tpl = templates.get(file);
  if (!tpl) return null;
  const model = cloneSkinned(tpl);
  const mats: THREE.MeshStandardMaterial[] = [];
  const team = new THREE.Color(TEAM_HEX[u.team]);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (hide.includes(mesh.name)) {
      mesh.visible = false;
      return;
    }
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (mat.name === 'Glow') {
      mat.emissive = team.clone();
      mat.emissiveIntensity = 2;
    } else {
      if (tint && tint.test(mesh.name)) {
        // team cloth reads as a flat team colour, like lane minions' armour
        mat.map = null;
        mat.color = team.clone().multiplyScalar(0.8);
      }
      else if (u.kind === 'minion') mat.color = new THREE.Color('#ffffff').lerp(team, 0.18);
      mats.push(mat);
    }
    mesh.material = mat;
  });
  const attach = (name: string, bone: string) => {
    const src = templates.get(name);
    const b = findBone(model, bone);
    if (!src || !b) return;
    const w = src.clone();
    w.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.color = new THREE.Color('#ffffff').lerp(team, 0.3);
      mats.push(mat);
      mesh.material = mat;
    });
    b.add(w);
  };
  if (weapon) attach(weapon, 'handslot.r');
  if (offhand) attach(offhand, 'handslot.l');

  const scale = unitHeight(u) / (heights.get(file) ?? 2);
  model.scale.setScalar(scale);
  const root = new THREE.Group();
  root.add(model);
  // team ring under every unit, like the selection circles in a MOBA
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: TEAM_HEX[u.team], transparent: true, opacity: u.kind === 'champ' ? 0.75 : 0.35, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 1;
  ring.scale.setScalar(u.r + (u.kind === 'champ' ? 10 : 4));
  ring.renderOrder = 2;
  root.add(ring);
  scene.add(root);
  const minion = u.kind === 'minion';
  const av: Avatar = {
    u,
    root,
    model,
    scale,
    mixer: new THREE.AnimationMixer(model),
    actions: new Map(),
    cur: null,
    curName: '',
    mats,
    idle: minion ? 'Idle_Combat' : 'Idle',
    run: 'Running_A',
    attack,
    abilities,
    death: minion ? 'Death_C_Skeletons' : 'Death_A',
    lastX: u.x,
    lastY: u.y,
    speed: 0,
    yaw: Math.PI / 2 - u.face,
    actN: u.actN,
    oneShot: 0,
    dying: -1,
    ring,
  };
  play(av, av.idle, 0);
  return av;
}

function action(av: Avatar, name: string): THREE.AnimationAction | null {
  let a = av.actions.get(name);
  if (a) return a;
  const clip = clips.get(name);
  if (!clip) return null;
  a = av.mixer.clipAction(clip);
  av.actions.set(name, a);
  return a;
}

function play(av: Avatar, name: string, fade = 0.15, once = false, timeScale = 1, startAt = 0) {
  const a = action(av, name);
  if (!a) return 0;
  if (av.cur === a && !once) {
    a.timeScale = timeScale;
    return 0;
  }
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  a.timeScale = timeScale;
  a.time = startAt * a.getClip().duration;
  a.enabled = true;
  a.setEffectiveWeight(1);
  if (av.cur && av.cur !== a) av.cur.crossFadeTo(a, fade, false);
  a.play();
  av.cur = a;
  av.curName = name;
  return (a.getClip().duration * (1 - startAt)) / timeScale;
}

function disposeAvatar(av: Avatar) {
  scene.remove(av.root);
  av.mixer.stopAllAction();
  for (const m of av.mats) m.dispose();
}

export function resetUnits() {
  for (const av of avatars.values()) disposeAvatar(av);
  avatars.clear();
  for (const s of structs.values()) scene.remove(s.root);
  structs.clear();
}

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface SyncOpts {
  dt: number;
  time: number;
  hovered: WUnit | null;
  winner: Team | null;
  view: View;
}

export function syncUnits(units: WUnit[], o: SyncOpts) {
  const seen = new Set<WUnit>();
  const inView = (x: number, y: number, pad: number) => x > o.view.x0 - pad && x < o.view.x1 + pad && y > o.view.y0 - pad && y < o.view.y1 + pad;
  for (const u of units) {
    if (u.kind === 'tower' || u.kind === 'nexus') {
      let s = structs.get(u);
      if (!s) {
        s = u.kind === 'nexus' ? buildNexus(u.team) : u.tier === 2 ? buildInhib(u.team) : buildTower(u.team);
        s.root.position.set(u.x, 0, u.y);
        structs.set(u, s);
      }
      if (u.dead !== s.wasDead) {
        s.wasDead = u.dead;
        s.alive.visible = !u.dead;
        s.rubble.visible = u.dead;
      }
      if (!u.dead) {
        const charge = u.lunge;
        s.crystal.rotation.y = o.time * (u.kind === 'nexus' ? 0.6 : 1.4);
        const inhib = u.kind === 'tower' && u.tier === 2;
        s.crystal.position.y = (u.kind === 'nexus' ? 170 : inhib ? 120 : 282) + Math.sin(o.time * 2 + u.x) * 6;
        const sc = 1 + 0.25 * charge + (u.hitFlash > 0 ? 0.08 : 0);
        if (inhib) s.crystal.scale.setScalar(sc);
        else s.crystal.scale.set((u.kind === 'nexus' ? 0.8 : 1) * sc, (u.kind === 'nexus' ? 1.6 : 1.7) * sc, (u.kind === 'nexus' ? 0.8 : 1) * sc);
        if (s.spin) s.spin.rotation.y = o.time * (inhib ? 1.2 : 0.5);
        if (inhib && s.spin) s.spin.rotation.x = Math.sin(o.time * 0.7) * 0.4;
      }
      continue;
    }
    if (!modelsReady) continue;
    let av = avatars.get(u);
    if (!av) {
      if (u.dead) continue;
      av = makeAvatar(u) ?? undefined;
      if (!av) continue;
      avatars.set(u, av);
    }
    seen.add(u);
    animate(av, o, inView(u.x, u.y, 250));
  }
  // units that left the simulation (minions die and are removed the same tick)
  for (const [u, av] of avatars) {
    if (seen.has(u)) continue;
    if (av.dying < 0) {
      av.dying = 0;
      av.ring.visible = false;
      play(av, av.death, 0.1, true, 1.3);
    }
    av.dying += o.dt;
    av.mixer.update(o.dt);
    if (av.dying > 1.6) av.root.position.y = -(av.dying - 1.6) * 80;
    if (av.dying > 2.3) {
      disposeAvatar(av);
      avatars.delete(u);
    }
  }
}

function animate(av: Avatar, o: SyncOpts, visible: boolean) {
  const u = av.u;
  const dt = o.dt;
  av.root.visible = visible || av.dying >= 0;
  const dx = u.x - av.lastX;
  const dy = u.y - av.lastY;
  av.lastX = u.x;
  av.lastY = u.y;
  const inst = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
  // teleports (recall, flash, respawn) shouldn't read as sprinting
  av.speed = inst > 2500 ? 0 : dt > 0 ? av.speed + (inst - av.speed) * Math.min(1, dt * 12) : av.speed;

  if (u.dead) {
    if (av.dying < 0) {
      av.dying = 0;
      av.ring.visible = false;
      play(av, av.death, 0.1, true, 1.2);
    }
    av.dying += dt;
    if (visible) av.mixer.update(dt);
    av.root.position.set(u.x, 0, u.y);
    return;
  }
  if (av.dying >= 0) {
    av.dying = -1;
    av.ring.visible = true;
    av.oneShot = 0;
    play(av, av.idle, 0);
  }

  // facing: run direction while moving, otherwise the last attack direction
  const moving = av.speed > 30;
  const want = moving ? Math.atan2(dx, dy) : Math.PI / 2 - u.face;
  if (moving || av.oneShot > 0 || u.lunge > 0) av.yaw = lerpAngle(av.yaw, want, Math.min(1, dt * 16));

  // one-shot actions: attacks and casts
  if (u.actN !== av.actN) {
    av.actN = u.actN;
    const slot = Number(u.act.slice(4));
    const name = u.act === 'attack' ? av.attack : u.act.startsWith('cast') ? av.abilities[slot] ?? 'Spellcast_Shoot' : u.act === 'flash' ? 'Spellcast_Shoot' : '';
    if (name) {
      const startAt = u.act === 'attack' ? 0.22 : 0.1;
      const want = u.act === 'attack' ? (u.kind === 'minion' ? 0.6 : 0.45) : name === 'Dodge_Forward' ? 0.35 : 0.6;
      const clip = clips.get(name);
      const ts = clip ? (clip.duration * (1 - startAt)) / want : 1;
      av.oneShot = play(av, name, 0.06, true, ts, startAt);
    }
  }
  if (av.oneShot > 0) {
    av.oneShot -= dt;
    // moving cancels the tail of an attack so legs never slide
    if (moving && av.u.act === 'attack' && av.oneShot < 0.25) av.oneShot = 0;
  }
  if (av.oneShot <= 0) {
    if (o.winner !== null && u.kind === 'champ') play(av, u.team === o.winner ? 'Cheer' : 'Idle', 0.25);
    else if (u.champ && u.champ.recallT > 0) play(av, 'Spellcast_Long', 0.2);
    else if (moving) play(av, av.run, 0.15, false, Math.min(2, Math.max(0.7, av.speed / (u.kind === 'champ' ? 250 : 210))));
    else play(av, av.idle, 0.2);
  }

  const k = u.pop * u.pop;
  const born = u.fadeIn > 0 ? easeOutBack(1 - u.fadeIn / 0.45) : 1;
  const lunge = u.lunge > 0 ? Math.sin((1 - u.lunge) * Math.PI) : 0;
  const reach = u.kind === 'champ' && !u.champ!.def.ranged ? 18 : u.mtype === 'melee' || u.mtype === 'super' ? 10 : -4;
  av.root.position.set(u.x + u.lx * lunge * reach, 0, u.y + u.ly * lunge * reach);
  av.root.rotation.y = 0;
  av.model.rotation.y = av.yaw;
  av.model.scale.set(av.scale * (1 + 0.1 * k) * born, av.scale * (1 - 0.1 * k) * born, av.scale * (1 + 0.1 * k) * born);
  // hit flash, hover and slow tints all ride on emissive
  const flash = u.hitFlash > 0 ? 0.55 : 0;
  const hover = o.hovered === u ? 0.3 : 0;
  for (const m of av.mats) {
    if (flash) m.emissive.setRGB(flash, flash, flash);
    else if (hover) m.emissive.setRGB(hover, 0.02, 0.02);
    else if (u.slowT > 0) m.emissive.setRGB(0.02, 0.08, 0.2);
    else m.emissive.setRGB(0, 0, 0);
  }
  if (visible) av.mixer.update(dt);
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ---------- ground decals: a canvas laid on the ground under every unit ----------
const DECAL_W = TOUCH ? 640 : 1024;
export const decalCanvas = document.createElement('canvas');
const decalCtx = decalCanvas.getContext('2d')!;
const decalTex = new THREE.CanvasTexture(decalCanvas);
decalTex.colorSpace = THREE.SRGBColorSpace;
const decal = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
);
decal.rotation.x = -Math.PI / 2;
decal.position.y = 2;
decal.renderOrder = 3;
scene.add(decal);
let decalRect = { x0: 0, y0: 0, x1: 1, y1: 1 };

// Returns a context whose transform maps world coordinates onto the ground under the view.
export function beginDecals(view: View): CanvasRenderingContext2D {
  const pad = 150;
  decalRect = { x0: view.x0 - pad, x1: view.x1 + pad, y0: view.y0 - pad, y1: view.y1 + pad };
  const w = decalRect.x1 - decalRect.x0;
  const h = decalRect.y1 - decalRect.y0;
  const cw = DECAL_W;
  const ch = Math.min(2048, Math.round((DECAL_W * h) / w));
  if (decalCanvas.width !== cw || decalCanvas.height !== ch) {
    decalCanvas.width = cw;
    decalCanvas.height = ch;
    decalTex.dispose();
  }
  decalCtx.setTransform(1, 0, 0, 1, 0, 0);
  decalCtx.clearRect(0, 0, cw, ch);
  decalCtx.setTransform(cw / w, 0, 0, ch / h, (-decalRect.x0 * cw) / w, (-decalRect.y0 * ch) / h);
  return decalCtx;
}
export function endDecals() {
  decal.scale.set(decalRect.x1 - decalRect.x0, decalRect.y1 - decalRect.y0, 1);
  decal.position.set((decalRect.x0 + decalRect.x1) / 2, 2, (decalRect.y0 + decalRect.y1) / 2);
  decalTex.needsUpdate = true;
}

// ---------- frame ----------
let lastW = 0;
let lastH = 0;
export function renderWorld(cx: number, cy: number, zoom: number, W: number, H: number, time: number) {
  if (W !== lastW || H !== lastH) {
    renderer.setSize(W, H, false);
    lastW = W;
    lastH = H;
  }
  riverMat.uniforms.uTime.value = time;
  camera.left = -W / 2 / zoom;
  camera.right = W / 2 / zoom;
  camera.top = H / 2 / zoom;
  camera.bottom = -H / 2 / zoom;
  camera.updateProjectionMatrix();
  const D = 4000;
  camera.position.set(cx, D * Math.sin(ELEV), cy + D * Math.cos(ELEV));
  camera.lookAt(cx, 0, cy);
  // the shadow frustum follows the view footprint
  const R = Math.max(W / zoom, H / zoom / K) * 0.62 + 200;
  sun.position.set(cx + SUN_DIR.x * 2500, SUN_DIR.y * 2500, cy + SUN_DIR.z * 2500);
  sun.target.position.set(cx, 0, cy);
  const sc = sun.shadow.camera;
  sc.left = -R;
  sc.right = R;
  sc.top = R;
  sc.bottom = -R;
  sc.near = 100;
  sc.far = 6000;
  sc.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// ---------- champion portraits: each hero rendered once for the menu and HUD icons ----------
export function renderPortraits(size = 256): Record<string, string> {
  const out: Record<string, string> = {};
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight('#ffffff', '#55606a', 1.6));
  const key = new THREE.DirectionalLight('#fff2dc', 2.4);
  key.position.set(1.5, 2.5, 3);
  const rim = new THREE.DirectionalLight('#9cc8ff', 1.6);
  rim.position.set(-2, 1.5, -2);
  s.add(key, rim);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  for (const [id, h] of Object.entries(HEROES)) {
    const tpl = templates.get(h.file);
    if (!tpl) continue;
    const m = cloneSkinned(tpl);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && h.hide.includes(o.name)) o.visible = false;
    });
    const mixer = new THREE.AnimationMixer(m);
    const idle = clips.get('Idle');
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0.6);
    m.rotation.y = 0.45;
    s.add(m);
    const hgt = heights.get(h.file) ?? 2;
    cam.position.set(0.15 * hgt, hgt * 0.78, hgt * 1.05);
    cam.lookAt(0, hgt * 0.62, 0);
    r.render(s, cam);
    out[id] = c.toDataURL('image/png');
    s.remove(m);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
