// Visual effects: pooled particles, cached glow sprites, trauma-based screen shake and easing.
// Everything here is cosmetic; the simulation in main.ts never reads it.

export interface Vec {
  x: number;
  y: number;
}

export type PKind = 'spark' | 'ember' | 'smoke' | 'shard' | 'coin' | 'ring' | 'ghost' | 'plus';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  drag: number;
  grav: number;
  rot: number;
  spin: number;
  home: Vec | null; // coins fly to this point
}

// ---------- easing ----------
export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// ---------- settings ----------
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const settings = {
  reduceMotion: prefersReduced,
  maxParticles: matchMedia('(pointer: coarse)').matches ? 350 : 800,
};
try {
  const saved = localStorage.getItem('rift-reduce-motion');
  if (saved !== null) settings.reduceMotion = saved === '1';
} catch {
  // storage unavailable
}
export function setReduceMotion(on: boolean) {
  settings.reduceMotion = on;
  try {
    localStorage.setItem('rift-reduce-motion', on ? '1' : '0');
  } catch {
    // storage unavailable
  }
}

// ---------- particles ----------
export const particles: Particle[] = [];
const pool: Particle[] = [];

export function spawn(p: Partial<Particle> & Vec): Particle | null {
  if (particles.length >= settings.maxParticles) return null;
  const q = pool.pop() ?? ({} as Particle);
  q.kind = p.kind ?? 'spark';
  q.x = p.x;
  q.y = p.y;
  q.vx = p.vx ?? 0;
  q.vy = p.vy ?? 0;
  q.max = q.life = p.life ?? 0.5;
  q.size = p.size ?? 4;
  q.grow = p.grow ?? 0;
  q.color = p.color ?? '#fff';
  q.drag = p.drag ?? 3;
  q.grav = p.grav ?? 0;
  q.rot = p.rot ?? Math.random() * Math.PI * 2;
  q.spin = p.spin ?? 0;
  q.home = p.home ?? null;
  particles.push(q);
  return q;
}

export interface BurstOpts {
  kind?: PKind;
  color: string;
  speed?: number;
  life?: number;
  size?: number;
  angle?: number; // centre direction (radians); omit for a full circle
  spread?: number; // total arc (radians)
  grav?: number;
  drag?: number;
  grow?: number;
  spin?: number;
  jitter?: number; // spawn radius
}

export function burst(x: number, y: number, n: number, o: BurstOpts) {
  const count = settings.reduceMotion ? Math.ceil(n / 2) : n;
  const spread = o.spread ?? Math.PI * 2;
  const base = o.angle ?? 0;
  for (let i = 0; i < count; i++) {
    const a = o.angle === undefined ? Math.random() * Math.PI * 2 : base + (Math.random() - 0.5) * spread;
    const sp = (o.speed ?? 300) * (0.45 + Math.random() * 0.75);
    const j = o.jitter ?? 0;
    spawn({
      kind: o.kind ?? 'spark',
      x: x + (Math.random() - 0.5) * j,
      y: y + (Math.random() - 0.5) * j,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: (o.life ?? 0.45) * (0.7 + Math.random() * 0.6),
      size: (o.size ?? 4) * (0.7 + Math.random() * 0.6),
      color: o.color,
      grav: o.grav ?? 0,
      drag: o.drag ?? 3,
      grow: o.grow ?? 0,
      spin: (o.spin ?? 0) * (Math.random() - 0.5) * 2,
    });
  }
}

export function ring(x: number, y: number, r: number, color: string, life = 0.45, width = 6) {
  spawn({ kind: 'ring', x, y, size: r, life, color, grow: width, drag: 0 });
}

export function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      pool.push(p);
      continue;
    }
    if (p.home) {
      // coins accelerate toward their target once their launch arc settles
      const k = 1 - p.life / p.max;
      const dx = p.home.x - p.x;
      const dy = p.home.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = 2600 * k * k;
      p.vx += (dx / d) * pull * dt;
      p.vy += (dy / d) * pull * dt;
      if (d < 30 && k > 0.3) p.life = Math.min(p.life, 0.02);
    }
    const f = Math.exp(-p.drag * dt);
    p.vx *= f;
    p.vy = p.vy * f + p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.kind !== 'ring') p.size = Math.max(0, p.size + p.grow * dt);
  }
}

// ---------- glow sprites (replaces per-draw shadowBlur, which is expensive) ----------
const glowCache = new Map<string, HTMLCanvasElement>();
export function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.5, color + '55');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const inView = (p: Particle, v: View) => p.x > v.x0 && p.x < v.x1 && p.y > v.y0 && p.y < v.y1;

// Ground layer: smoke, rings and afterimages sit under units.
export function drawGroundParticles(ctx: CanvasRenderingContext2D, v: View) {
  for (const p of particles) {
    if (!inView(p, v)) continue;
    const k = p.life / p.max;
    if (p.kind === 'smoke') {
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'ring') {
      const t = ease.outCubic(1 - k);
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.grow * k + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.3 + 0.7 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'ghost') {
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Air layer: additive sparks, embers, shards, coins.
export function drawAirParticles(ctx: CanvasRenderingContext2D, v: View) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    if (!inView(p, v)) continue;
    const k = p.life / p.max;
    if (p.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * (0.4 + 0.6 * k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    } else if (p.kind === 'ember') {
      drawGlow(ctx, p.x, p.y, p.size * 2.2, p.color, k);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const p of particles) {
    if (!inView(p, v)) continue;
    const k = p.life / p.max;
    if (p.kind === 'shard') {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    } else if (p.kind === 'coin') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#8a5b00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 1, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (p.kind === 'plus') {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(p.x - s, p.y - s / 3, s * 2, (s * 2) / 3);
      ctx.fillRect(p.x - s / 3, p.y - s, (s * 2) / 3, s * 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- screen shake (trauma model: shake = trauma^2, decays to rest) ----------
export const shake = { trauma: 0, t: 0, x: 0, y: 0, rot: 0 };
export function addTrauma(amount: number) {
  if (settings.reduceMotion) return;
  shake.trauma = Math.min(1, shake.trauma + amount);
}
export function updateShake(dt: number) {
  shake.trauma = Math.max(0, shake.trauma - 1.4 * dt);
  shake.t += dt * 32;
  const s = shake.trauma * shake.trauma;
  // summed sines instead of per-frame random, so it rolls instead of buzzing
  shake.x = 22 * s * (Math.sin(shake.t * 1.7) + 0.5 * Math.sin(shake.t * 3.9));
  shake.y = 16 * s * (Math.sin(shake.t * 2.3) + 0.5 * Math.sin(shake.t * 4.7));
  shake.rot = 0.02 * s * Math.sin(shake.t * 1.1);
}
