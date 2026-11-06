// Procedural "costumes": props and silhouette pieces attached to the rig's bones so each champion reads as a
// different character (hair, horns, ears, tails, helmets, capes, wings, signature weapons). Riot's models are
// not available, so these are original low-poly interpretations of each champion's well-known silhouette,
// coloured from the champion's icon. The 20 scripted champions have hand-built outfits; everyone else gets an
// outfit generated from class, name hash and icon colours.
import * as THREE from 'three';

export interface Palette { main: string; accent: string }
export interface Part { bone: string; obj: THREE.Object3D }
type V3 = [number, number, number];

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, o: { glow?: boolean; metal?: boolean; rough?: number } = {}) {
  const k = color + (o.glow ? 'g' : '') + (o.metal ? 'm' : '') + (o.rough ?? '');
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: o.rough ?? (o.metal ? 0.35 : 0.75), metalness: o.metal ? 0.65 : 0.05 });
    if (o.glow) { m.emissive = new THREE.Color(color); m.emissiveIntensity = 1.6; }
    mats.set(k, m);
  }
  return m;
}
type MatOpt = { glow?: boolean; metal?: boolean; rough?: number };
const mesh = (g: THREE.BufferGeometry, color: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1, o: MatOpt = {}) => {
  const m = new THREE.Mesh(g, mat(color, o));
  m.position.set(...p);
  m.rotation.set(...r);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
  return m;
};
const box = (w: number, h: number, d: number, c: string, p?: V3, r?: V3, s?: V3 | number, o?: MatOpt) => mesh(new THREE.BoxGeometry(w, h, d), c, p, r, s, o);
const cone = (rad: number, h: number, c: string, p?: V3, r?: V3, s?: V3 | number, o?: MatOpt) => mesh(new THREE.ConeGeometry(rad, h, 6), c, p, r, s, o);
const cyl = (r1: number, r2: number, h: number, c: string, p?: V3, r?: V3, s?: V3 | number, o?: MatOpt) => mesh(new THREE.CylinderGeometry(r1, r2, h, 7), c, p, r, s, o);
const ball = (rad: number, c: string, p?: V3, s?: V3 | number, o?: MatOpt) => mesh(new THREE.IcosahedronGeometry(rad, 1), c, p, [0, 0, 0], s, o);
const gem = (rad: number, c: string, p?: V3, s?: V3 | number) => mesh(new THREE.OctahedronGeometry(rad, 0), c, p, [0, 0, 0], s, { glow: true });
const ring = (rad: number, tube: number, c: string, p?: V3, r?: V3, o?: MatOpt) => mesh(new THREE.TorusGeometry(rad, tube, 5, 14), c, p, r, 1, o);
const grp = (...c: THREE.Object3D[]) => { const g = new THREE.Group(); c.forEach((x) => g.add(x)); return g; };
const at = (o: THREE.Object3D, p: V3, r: V3 = [0, 0, 0], s = 1) => { o.position.set(...p); o.rotation.set(...r); o.scale.setScalar(s); return o; };

// ---- reusable pieces (head origin = base of the head, +y up, +z forward; hands: blade/shaft along +y) ----
const catEars = (c: string, inner: string) => grp(
  at(grp(cone(0.1, 0.24, c), cone(0.06, 0.16, inner, [0, -0.02, 0.05])), [-0.14, 0.33, 0], [0, 0, 0.35]),
  at(grp(cone(0.1, 0.24, c), cone(0.06, 0.16, inner, [0, -0.02, 0.05])), [0.14, 0.33, 0], [0, 0, -0.35]));
const foxEars = (c: string, inner: string) => grp(
  at(grp(cone(0.1, 0.36, c), cone(0.06, 0.24, inner, [0, -0.03, 0.05])), [-0.15, 0.38, 0], [0, 0, 0.25]),
  at(grp(cone(0.1, 0.36, c), cone(0.06, 0.24, inner, [0, -0.03, 0.05])), [0.15, 0.38, 0], [0, 0, -0.25]));
const roundEars = (c: string) => grp(ball(0.1, c, [-0.27, 0.16, 0]), ball(0.1, c, [0.27, 0.16, 0]));
const horns = (c: string, big = 1) => grp(
  at(cone(0.07 * big, 0.36 * big, c), [-0.17, 0.3, 0.02], [0, 0, 0.55]),
  at(cone(0.07 * big, 0.36 * big, c), [0.17, 0.3, 0.02], [0, 0, -0.55]));
const mane = (c: string) => {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(at(cone(0.09, 0.3, c), [Math.sin(a) * 0.3, 0.17 + Math.cos(a * 2) * 0.03, Math.cos(a) * 0.3 - 0.05], [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2]));
  }
  return g;
};
const topknot = (c: string) => grp(ball(0.11, c, [0, 0.42, -0.04]), cyl(0.05, 0.06, 0.2, c, [0, 0.31, -0.03]), cyl(0.035, 0.02, 0.5, c, [0, 0.25, -0.2], [-1.0, 0, 0]));
const longHair = (c: string, len = 0.9) => grp(ball(0.3, c, [0, 0.2, -0.04], [1.05, 0.8, 1.05]), box(0.4, len, 0.1, c, [0, 0.05 - len / 2 + 0.1, -0.27]), ball(0.1, c, [-0.28, 0.12, 0.12]), ball(0.1, c, [0.28, 0.12, 0.12]));
const spikyHair = (c: string) => { const g = new THREE.Group(); for (let i = 0; i < 7; i++) g.add(at(cone(0.08, 0.3, c), [(i - 3) * 0.1, 0.38, (i % 2) * 0.1 - 0.05], [0.3, 0, (i - 3) * 0.18])); return g; };
const braid = (c: string, len: number, side: number) => grp(cyl(0.045, 0.03, len, c, [side * 0.25, 0.05 - len / 2 + 0.12, -0.05]), ball(0.07, c, [side * 0.25, 0.1 - len / 2 - 0.02 + 0.12 - 0.0, -0.05]));
const helmet = (c: string, crest?: string) => grp(ball(0.32, c, [0, 0.18, 0], [1.02, 0.85, 1.02], { metal: true }), box(0.4, 0.05, 0.05, c, [0, 0.12, 0.3]), ...(crest ? [box(0.07, 0.18, 0.4, crest, [0, 0.45, -0.02])] : []));
const hood = (c: string) => grp(ball(0.33, c, [0, 0.2, -0.05], [1, 0.9, 1.05]));
const mask = (c: string, eye: string) => grp(box(0.34, 0.2, 0.06, c, [0, 0.12, 0.24]), box(0.07, 0.03, 0.02, eye, [-0.08, 0.14, 0.275], undefined, 1, { glow: true }), box(0.07, 0.03, 0.02, eye, [0.08, 0.14, 0.275], undefined, 1, { glow: true }));
const crown = (c: string) => grp(ring(0.24, 0.03, c, [0, 0.4, 0], [Math.PI / 2, 0, 0], { metal: true }), cone(0.04, 0.14, c, [0, 0.5, 0.2]));
const pauldrons = (c: string, trim: string, big = 1) => grp(
  box(0.34 * big, 0.2 * big, 0.38 * big, c, [-0.42, 0.0, 0], [0, 0, 0.3], 1, { metal: true }), box(0.36 * big, 0.04, 0.4 * big, trim, [-0.4, 0.09 * big, 0], [0, 0, 0.3]),
  box(0.34 * big, 0.2 * big, 0.38 * big, c, [0.42, 0.0, 0], [0, 0, -0.3], 1, { metal: true }), box(0.36 * big, 0.04, 0.4 * big, trim, [0.4, 0.09 * big, 0], [0, 0, -0.3]));
const spikePauldrons = (c: string) => grp(pauldrons(c, c, 1.1), cone(0.08, 0.3, c, [-0.5, 0.2, 0], [0, 0, 0.8]), cone(0.08, 0.3, c, [0.5, 0.2, 0], [0, 0, -0.8]));
const cape = (c: string, len = 1.0) => grp(box(0.7, len, 0.06, c, [0, -len / 2 + 0.15, -0.28], [0.08, 0, 0]));
const scarf = (c: string) => grp(ring(0.27, 0.07, c, [0, -0.02, 0], [Math.PI / 2, 0, 0]), box(0.14, 0.7, 0.04, c, [0.08, -0.35, -0.3], [0.2, 0, 0.1]));
const tail = (c: string, tip?: string, len = 0.9, curl = 0.6) => {
  const g = new THREE.Group();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    g.add(ball(0.12 - t * 0.05, i === n - 1 && tip ? tip : c, [0, t * len * 0.9 * Math.cos(curl * t), -0.1 - t * len * 0.5 + Math.sin(curl * t * 2) * 0.1]));
  }
  return g;
};
const foxTails = (c: string, tip: string, n = 9) => {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / n) * 2.3;
    const t = new THREE.Group();
    t.add(cone(0.1, 0.9, c, [0, 0.45, 0]), cone(0.05, 0.3, tip, [0, 0.95, 0]));
    t.rotation.set(-0.5, 0, a);
    t.position.set(0, 0, -0.1);
    g.add(t);
  }
  return g;
};
const wings = (c: string, c2: string, span = 1.0) => grp(
  at(grp(cone(0.18, span, c, [0, span / 2, 0]), cone(0.12, span * 0.7, c2, [0.15, span * 0.35, 0.02], [0, 0, 0.4])), [-0.2, 0, -0.25], [0.2, 0.3, 1.1]),
  at(grp(cone(0.18, span, c, [0, span / 2, 0]), cone(0.12, span * 0.7, c2, [-0.15, span * 0.35, 0.02], [0, 0, -0.4])), [0.2, 0, -0.25], [0.2, -0.3, -1.1]));
const halo = (c: string) => ring(0.28, 0.025, c, [0, 0.55, 0], [Math.PI / 2, 0, 0], { glow: true });
// weapons: held at the hand, extending along +y
const blade = (c: string, len = 1.1, wide = 0.1, hilt = '#4a3a2a') => grp(cyl(0.035, 0.035, 0.28, hilt, [0, 0, 0]), box(0.22, 0.05, 0.07, hilt, [0, 0.15, 0], undefined, 1, { metal: true }), box(wide, len, 0.035, c, [0, 0.16 + len / 2, 0], undefined, 1, { metal: true }), cone(wide / 2, 0.18, c, [0, 0.16 + len + 0.08, 0], [0, Math.PI / 4, 0], 1, { metal: true }));
const katana = (c: string) => grp(cyl(0.03, 0.03, 0.26, '#2a2a3a'), box(0.1, 0.03, 0.1, '#d8b04a', [0, 0.15, 0], undefined, 1, { metal: true }), box(0.05, 1.0, 0.025, c, [0, 0.68, 0], [0, 0, 0.0], 1, { metal: true, glow: true }));
const dagger = (c: string, len = 0.5) => blade(c, len, 0.07);
const axe = (c: string, head: string, size = 1) => grp(cyl(0.04, 0.04, 1.4 * size, '#5a3a22', [0, 0.5, 0]), box(0.5 * size, 0.34 * size, 0.06, head, [0.2 * size, 1.05 * size, 0], undefined, 1, { metal: true }), cone(0.15 * size, 0.22 * size, head, [0.52 * size, 1.05 * size, 0], [0, 0, -Math.PI / 2], 1, { metal: true }), box(0.5 * size, 0.2 * size, 0.06, head, [-0.2 * size, 1.1 * size, 0], undefined, 1, { metal: true }));
const staff = (c: string, orb: string, len = 1.6, crystal = true) => grp(cyl(0.04, 0.05, len, c, [0, len / 2 - 0.2, 0], undefined, 1, { metal: true }), ...(crystal ? [gem(0.15, orb, [0, len - 0.05, 0], [1, 1.5, 1])] : [ball(0.14, orb, [0, len - 0.05, 0], 1, { glow: true })]));
const bow = (c: string, string_: string) => grp(at(ring(0.5, 0.035, c, [0, 0.35, 0.0], [0, 0, 0]), [0, 0.35, 0.12], [0, 0, 0]), box(0.015, 1.0, 0.015, string_, [0, 0.35, 0.12]));
const gun = (c: string, accent: string, len = 0.8, big = 1) => grp(box(0.14 * big, 0.2 * big, len, c, [0, 0.05, len / 2 - 0.1], undefined, 1, { metal: true }), cyl(0.07 * big, 0.07 * big, len * 0.5, accent, [0, 0.05, len + 0.1], [Math.PI / 2, 0, 0], 1, { metal: true }), box(0.1, 0.22, 0.1, c, [0, -0.1, 0.05]));
const shield = (c: string, trim: string, r = 0.5) => grp(cyl(r, r, 0.07, c, [0, 0.35, 0], [Math.PI / 2, 0, 0], 1, { metal: true }), ring(r, 0.04, trim, [0, 0.35, 0.03], [0, 0, 0], { metal: true }), ball(r * 0.25, trim, [0, 0.35, 0.08], 1, { glow: true }));
const orb = (c: string, r = 0.16) => grp(ball(r, c, [0, 0.25, 0], 1, { glow: true }), ring(r * 1.6, 0.012, c, [0, 0.25, 0], [Math.PI / 2.5, 0.3, 0], { glow: true }));
const book = (c: string, trim: string) => grp(box(0.34, 0.06, 0.44, c, [0, 0.2, 0.05], [0.4, 0, 0]), box(0.3, 0.02, 0.4, trim, [0, 0.235, 0.05], [0.4, 0, 0]));
const floating = (c: string, n = 4, r = 0.75) => { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.add(at(blade(c, 0.5, 0.09, '#a8d8ff'), [Math.sin(a) * r, 0.4 + (i % 2) * 0.3, Math.cos(a) * r], [Math.PI, a, 0.3], 0.6)); } return g; };
const rocks = (c: string, c2: string) => grp(
  box(0.34, 0.26, 0.34, c, [-0.42, 0.05, 0], [0.3, 0.4, 0.3]), box(0.34, 0.26, 0.34, c, [0.42, 0.05, 0], [0.2, -0.5, -0.3]), box(0.3, 0.24, 0.3, c, [0, 0.0, -0.3], [0.2, 0.3, 0]),
  gem(0.1, c2, [-0.4, 0.3, 0.2]), gem(0.1, c2, [0.4, 0.3, 0.2]), gem(0.12, c2, [0, 0.12, -0.5]));
const fist = (c: string, trim: string) => grp(box(0.34, 0.34, 0.34, c, [0, 0.12, 0], undefined, 1, { metal: true }), ring(0.18, 0.04, trim, [0, -0.04, 0], [Math.PI / 2, 0, 0], { metal: true }));
const bigFist = (c: string, trim: string) => at(fist(c, trim), [0, 0.1, 0], [0, 0, 0], 1.8);
const goggles = (c: string, lens: string) => grp(box(0.4, 0.1, 0.08, c, [0, 0.14, 0.24]), ball(0.07, lens, [-0.1, 0.14, 0.28], 1, { glow: true }), ball(0.07, lens, [0.1, 0.14, 0.28], 1, { glow: true }));
const bandana = (c: string) => grp(ring(0.26, 0.04, c, [0, 0.25, 0], [Math.PI / 2, 0, 0]), box(0.08, 0.4, 0.03, c, [0.2, 0.05, -0.2], [0, 0, 0.3]));
const hat = (c: string, trim: string) => grp(cyl(0.45, 0.45, 0.04, c, [0, 0.32, 0]), cone(0.28, 0.6, c, [0, 0.62, 0], [-0.1, 0, 0]), ring(0.27, 0.03, trim, [0, 0.38, 0], [Math.PI / 2, 0, 0]));
const bow2 = (c: string) => grp(box(0.34, 0.14, 0.02, c, [0, 0.35, -0.3]), box(0.1, 0.22, 0.02, c, [-0.1, 0.25, -0.3], [0, 0, 0.5]), box(0.1, 0.22, 0.02, c, [0.1, 0.25, -0.3], [0, 0, -0.5]));
const bear = (c: string) => grp(ball(0.2, c, [0, 0.25, 0]), ball(0.14, c, [0, 0.52, 0.02]), ball(0.06, c, [-0.1, 0.62, 0.0]), ball(0.06, c, [0.1, 0.62, 0.0]));
const shuriken = (c: string) => grp(box(0.7, 0.05, 0.12, c, [0, 0.25, -0.35], [0, 0.7, 0], 1, { metal: true }), box(0.7, 0.05, 0.12, c, [0, 0.25, -0.35], [0, -0.7, 0], 1, { metal: true }));
const fangs = (c: string) => grp(cone(0.025, 0.1, c, [-0.06, 0.02, 0.26], [Math.PI, 0, 0]), cone(0.025, 0.1, c, [0.06, 0.02, 0.26], [Math.PI, 0, 0]));
const ratEars = (c: string) => grp(at(ball(0.13, c, [0, 0, 0], [1, 1.2, 0.3]), [-0.22, 0.3, -0.04]), at(ball(0.13, c, [0, 0, 0], [1, 1.2, 0.3]), [0.22, 0.3, -0.04]));
const belt = (c: string) => grp(box(0.52, 0.08, 0.34, c, [0, 0, 0]));
const crystals = (c: string) => grp(gem(0.12, c, [-0.25, 0.35, -0.2], [1, 2.4, 1]), gem(0.14, c, [0, 0.45, -0.25], [1, 2.8, 1]), gem(0.12, c, [0.25, 0.35, -0.2], [1, 2.4, 1]));

type Builder = (p: Palette) => Part[];
// KayKit heads are big and the head bone sits at the neck, so head pieces are lifted and enlarged to wrap the skull
const P = (bone: string, obj: THREE.Object3D): Part => {
  if (bone !== 'head') return { bone, obj };
  const g = new THREE.Group();
  g.add(obj);
  g.position.set(0, 0.42, -0.02);
  g.scale.setScalar(1.55);
  return { bone, obj: g };
};
const HEAD = 'head', CHEST = 'chest', R = 'handslot.r', L = 'handslot.l', HIPS = 'hips';

// ---------- hand-built outfits for the 20 scripted champions ----------
export const OUTFITS: Record<string, Builder> = {
  masteryi: (p) => [P(HEAD, topknot('#1a1a22')), P(HEAD, bandana('#c23a3a')), P(CHEST, belt('#2d4fbf')), P(R, katana('#bfe8ff')), P(L, katana('#bfe8ff')), P(CHEST, scarf('#2d4fbf'))],
  twitch: (p) => [P(HEAD, hood('#4a5a2a')), P(HEAD, ratEars('#7a8a5a')), P(HEAD, goggles('#2a2a2a', '#9aff3a')), P(HIPS, tail('#9a8a7a', '#c8a89a', 1.0)), P(R, gun('#4a5a3a', '#9aff3a', 0.9, 1.4)), P(CHEST, cape('#3a4a22', 0.8)), P(HEAD, fangs('#fff'))],
  monkeyking: (p) => [P(HEAD, roundEars('#d8a040')), P(HEAD, bandana('#ffd54a')), P(HIPS, tail('#d8a040', '#ffe08a', 1.2, 1.4)), P(R, staff('#c23a2a', '#ffd54a', 2.0, false)), P(CHEST, pauldrons('#c8902a', '#ffd54a', 0.9))],
  yuumi: (p) => [P(HEAD, catEars('#f2eaff', '#c8a8ff')), P(HIPS, tail('#f2eaff', '#b78cff', 0.8, 1.6)), P(L, book('#b78cff', '#fff6d0')), P(HEAD, halo('#d8b8ff'))],
  naafiri: (p) => [P(HEAD, foxEars('#8a2a22', '#2a1a1a')), P(HEAD, mask('#1a1214', '#ff4a3a')), P(HIPS, tail('#2a1a1a', '#c8453b', 0.9, 0.8)), P(R, dagger('#ff6a5a', 0.7)), P(L, dagger('#ff6a5a', 0.7)), P(CHEST, scarf('#c8453b'))],
  irelia: (p) => [P(HEAD, braid('#1a1a22', 0.6, -1)), P(HEAD, braid('#1a1a22', 0.6, 1)), P(HEAD, crown('#c8e8ff')), P(CHEST, floating('#8fd8ff', 4, 0.8)), P(R, blade('#cfeeff', 0.9, 0.08)), P(CHEST, scarf('#ffffff'))],
  lux: (p) => [P(HEAD, longHair('#f2d56a', 0.9)), P(HEAD, crown('#e8f0ff')), P(R, staff('#e8e0c0', '#fff6a8', 1.6, true)), P(CHEST, cape('#ffffff', 0.7)), P(CHEST, pauldrons('#e8e8f8', '#d8b04a', 0.6))],
  rengar: (p) => [P(HEAD, mane('#c8884a')), P(HEAD, horns('#e8e0c0', 0.7)), P(R, blade('#e8e0c0', 0.7, 0.12, '#5a3a22')), P(L, blade('#e8e0c0', 0.7, 0.12, '#5a3a22')), P(CHEST, pauldrons('#5a4a3a', '#c8884a', 0.8)), P(HIPS, tail('#c8884a', '#5a3a22', 0.7, 0.6))],
  garen: (p) => [P(HEAD, helmet('#8aa8d8', '#d8b04a')), P(CHEST, pauldrons('#6fa8ff', '#d8b04a', 1.4)), P(R, blade('#d8e8ff', 1.6, 0.22, '#d8b04a')), P(CHEST, cape('#2d4fbf', 1.0))],
  ashe: (p) => [P(HEAD, hood('#8fd8ff')), P(HEAD, longHair('#f2faff', 0.8)), P(L, bow('#bfe8ff', '#fff')), P(CHEST, cape('#4a8acf', 0.9)), P(HEAD, crown('#d8f4ff'))],
  annie: (p) => [P(HEAD, longHair('#1a1018', 0.5)), P(HEAD, bow2('#e83a3a')), P(L, bear('#7a4a2a')), P(R, orb('#ff6a3a', 0.12))],
  malphite: (p) => [P(CHEST, rocks('#8a8478', '#6fd8ff')), P(HEAD, crystals('#6fd8ff')), P(R, bigFist('#7a7468', '#6fd8ff')), P(L, bigFist('#7a7468', '#6fd8ff'))],
  ezreal: (p) => [P(HEAD, spikyHair('#f2d56a')), P(HEAD, goggles('#c8a04a', '#6fd8ff')), P(L, grp(fist('#2a5fd8', '#ffd54a'), gem(0.1, '#6fd8ff', [0, 0.12, 0.2]))), P(CHEST, cape('#d8c08a', 0.6))],
  jinx: (p) => [P(HEAD, braid('#6fd8ff', 1.3, -1)), P(HEAD, braid('#6fd8ff', 1.3, 1)), P(HEAD, bandana('#ff6ab0')), P(R, gun('#ff6ab0', '#ffd54a', 1.0, 1.7)), P(CHEST, belt('#ff6ab0'))],
  leona: (p) => [P(HEAD, helmet('#e8b84a', '#ffd54a')), P(L, shield('#e8b84a', '#fff0a8', 0.65)), P(R, blade('#fff0c8', 1.0, 0.14, '#d8a030')), P(CHEST, pauldrons('#e8b84a', '#fff0a8', 1.2)), P(CHEST, cape('#c8452a', 0.8))],
  blitzcrank: (p) => [P(HEAD, box(0.52, 0.32, 0.5, '#c8a46a', [0, 0.3, 0], undefined, 1, { metal: true })), P(HEAD, goggles('#3a3a3a', '#ff4a3a')), P(R, bigFist('#c8a46a', '#c23a2a')), P(L, bigFist('#c8a46a', '#c23a2a')), P(CHEST, grp(box(0.46, 0.3, 0.3, '#8a8a8a', [0, 0, 0.0], undefined, 1, { metal: true }), gem(0.07, '#6fd8ff', [0, 0.05, 0.2])))],
  morgana: (p) => [P(HEAD, longHair('#1a1a22', 1.0)), P(HEAD, horns('#c8a8ff', 0.6)), P(CHEST, wings('#2a1a3a', '#a86bff', 1.5)), P(R, orb('#a86bff', 0.14)), P(CHEST, cape('#3a1a5a', 1.1))],
  zed: (p) => [P(HEAD, mask('#1a1214', '#ff3a3a')), P(HEAD, hood('#1a1a1e')), P(CHEST, scarf('#d83a3a')), P(CHEST, cape('#1a1a1e', 0.9)), P(R, blade('#d8d8e8', 0.8, 0.06, '#3a1a1a')), P(L, blade('#d8d8e8', 0.8, 0.06, '#3a1a1a')), P(CHEST, shuriken('#3a3a4a'))],
  darius: (p) => [P(HEAD, helmet('#3a3438', '#b8442a')), P(HEAD, horns('#b8442a', 0.8)), P(CHEST, spikePauldrons('#4a3a3a')), P(R, axe('#5a3a22', '#8a8a92', 1.3)), P(CHEST, cape('#6a1a1a', 1.0))],
  ahri: (p) => [P(HEAD, foxEars('#f2eaf8', '#ff9ac8')), P(HEAD, longHair('#f2eaf8', 0.8)), P(HIPS, foxTails('#f2eaf8', '#ff9ac8', 9)), P(R, orb('#8affff', 0.15)), P(CHEST, scarf('#ff9ac8'))],
};

// ---------- generated outfits for everyone else ----------
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = <T,>(arr: T[], h: number, salt: number) => arr[((h >>> salt) + salt) % arr.length];
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
export function generatedOutfit(id: string, tags: string[], ranged: boolean, p: Palette): Part[] {
  const h = hash(id);
  const t = tags[0] ?? 'Fighter';
  const out: Part[] = [];
  const dark = shade(p.main, 0.45);
  // head: one of several silhouettes
  const headKind = h % 7;
  if (t === 'Mage' || t === 'Support') out.push(P(HEAD, pick([() => hat(p.main, p.accent), () => crown(p.accent), () => longHair(shade(p.main, 0.9), 0.8), () => hood(p.main), () => halo(p.accent)], h, 3)()));
  else if (t === 'Marksman') out.push(P(HEAD, pick([() => hood(dark), () => goggles('#2a2a2a', p.accent), () => bandana(p.accent), () => spikyHair(p.main)], h, 2)()));
  else if (t === 'Assassin') out.push(P(HEAD, mask(dark, p.accent)), P(CHEST, scarf(p.accent)));
  else if (t === 'Tank') out.push(P(HEAD, helmet(shade(p.main, 0.8), p.accent)));
  else out.push(P(HEAD, pick([() => helmet(shade(p.main, 0.85)), () => spikyHair(p.main), () => horns(p.accent, 0.8), () => mane(p.main)], h, 4)()));
  // ears / horns / tail flavours for creature-like champions
  if (headKind === 0) out.push(P(HEAD, catEars(p.main, p.accent)), P(HIPS, tail(p.main, p.accent, 0.8, 1.2)));
  else if (headKind === 1) out.push(P(HEAD, foxEars(p.main, p.accent)), P(HIPS, tail(p.main, p.accent, 0.9, 0.9)));
  else if (headKind === 2) out.push(P(HEAD, horns(p.accent, 1)));
  // back / shoulders
  if (t === 'Tank' || t === 'Fighter') out.push(P(CHEST, pauldrons(shade(p.main, 0.85), p.accent, t === 'Tank' ? 1.3 : 1)));
  if (t === 'Mage' && h % 3 === 0) out.push(P(CHEST, wings(dark, p.accent, 1.2)));
  if (t === 'Support' && h % 2 === 0) out.push(P(CHEST, wings(p.main, p.accent, 1.0)));
  if (h % 4 === 1 && t !== 'Assassin') out.push(P(CHEST, cape(shade(p.main, 0.7), 0.9)));
  // weapons
  switch (t) {
    case 'Mage': out.push(P(R, pick([() => staff('#6a5a4a', p.accent), () => orb(p.accent), () => staff('#3a3a4a', p.accent, 1.4, false)], h, 5)())); break;
    case 'Support': out.push(P(R, pick([() => staff('#d8d0c0', p.accent, 1.3), () => orb(p.accent)], h, 5)())); break;
    case 'Marksman': out.push(P(R, pick([() => gun('#4a4a52', p.accent, 0.8, 1.1), () => bow(shade(p.main, 0.6), '#fff')], h, 6)())); break;
    case 'Assassin': out.push(P(R, dagger('#d8d8e8', 0.6)), P(L, dagger('#d8d8e8', 0.6))); break;
    case 'Tank': out.push(P(L, shield(shade(p.main, 0.8), p.accent, 0.55)), P(R, pick([() => blade('#c8c8d8', 0.9, 0.14), () => bigFist(shade(p.main, 0.8), p.accent), () => axe('#5a3a22', '#8a8a92', 1)], h, 7)())); break;
    default: out.push(P(R, pick([() => blade('#d8d8e8', 1.2, 0.12), () => axe('#5a3a22', '#8a8a92', 1.1), () => blade(p.accent, 1.0, 0.1)], h, 7)()));
  }
  void ranged;
  return out;
}

export function buildOutfit(id: string, tags: string[], ranged: boolean, p: Palette): Part[] {
  const f = OUTFITS[id];
  return f ? f(p) : generatedOutfit(id, tags, ranged, p);
}
