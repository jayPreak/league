// Synthesized sound effects (Web Audio, no asset files).
// Every sound is built from two primitives, a pitched oscillator and filtered noise,
// and is placed in stereo by its position relative to the camera.

export interface Vec {
  x: number;
  y: number;
}

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let voices = 0;
const MAX_VOICES = 28;
const lastPlayed = new Map<string, number>();

export const audio = {
  muted: false,
  volume: 0.7,
  gameplay: false, // world sounds only while a real match is running
  listener: { x: 0, y: 0, halfWidth: 800 },
};
try {
  audio.muted = localStorage.getItem('rift-muted') === '1';
  const v = parseFloat(localStorage.getItem('rift-volume') ?? '');
  if (!Number.isNaN(v)) audio.volume = v;
} catch {
  // storage unavailable
}

// Browsers only allow audio after a user gesture, so the context is created on the first one.
export function unlockAudio() {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ac = new Ctor();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ac.createGain();
    master.gain.value = audio.muted ? 0 : audio.volume;
    master.connect(comp).connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') void ac.resume();
}
['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlockAudio, { passive: true }));

export function setMuted(m: boolean) {
  audio.muted = m;
  if (master && ac) master.gain.setTargetAtTime(m ? 0 : audio.volume, ac.currentTime, 0.02);
  try {
    localStorage.setItem('rift-muted', m ? '1' : '0');
  } catch {
    // storage unavailable
  }
}

interface ToneOpts {
  freq: number;
  to?: number; // pitch slide target
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  delay?: number;
}
interface NoiseOpts {
  dur: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  gain?: number;
  attack?: number;
  delay?: number;
}

function out(pan: number, vol: number): AudioNode | null {
  if (!ac || !master || voices >= MAX_VOICES) return null;
  const g = ac.createGain();
  g.gain.value = vol;
  const p = ac.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(master);
  setTimeout(() => g.disconnect(), 3000); // longest sound is ~2.2s
  return g;
}

function envelope(g: GainNode, t0: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(dest: AudioNode, o: ToneOpts) {
  const t0 = ac!.currentTime + (o.delay ?? 0);
  const osc = ac!.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = ac!.createGain();
  envelope(g, t0, o.gain ?? 0.3, o.attack ?? 0.005, o.dur);
  osc.connect(g).connect(dest);
  voices++;
  osc.onended = () => voices--;
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

function noise(dest: AudioNode, o: NoiseOpts) {
  const t0 = ac!.currentTime + (o.delay ?? 0);
  const src = ac!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac!.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ac!.createGain();
  envelope(g, t0, o.gain ?? 0.3, o.attack ?? 0.005, o.dur);
  src.connect(f).connect(g).connect(dest);
  voices++;
  src.onended = () => voices--;
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.02);
}

// Each sound: [minimum gap between plays in ms, builder].
type Builder = (d: AudioNode, v: number) => void;
const vary = (f: number) => f * (0.94 + Math.random() * 0.12); // pitch variation so repeats don't drone

const SOUNDS: Record<string, [number, Builder]> = {
  // combat
  hit: [45, (d) => noise(d, { dur: 0.07, freq: vary(2200), q: 2, gain: 0.18 })],
  hitHeavy: [60, (d) => {
    noise(d, { dur: 0.12, freq: vary(900), q: 1.2, gain: 0.35 });
    tone(d, { freq: vary(140), to: 60, dur: 0.12, type: 'triangle', gain: 0.35 });
  }],
  shoot: [60, (d) => tone(d, { freq: vary(900), to: 420, dur: 0.08, type: 'triangle', gain: 0.12 })],
  swing: [70, (d) => noise(d, { dur: 0.11, filter: 'highpass', freq: vary(1800), to: 600, gain: 0.16 })],
  towerShot: [90, (d) => {
    tone(d, { freq: 220, to: 80, dur: 0.25, type: 'sawtooth', gain: 0.16 });
    noise(d, { dur: 0.2, freq: 500, to: 200, gain: 0.25 });
  }],
  // abilities
  bolt: [40, (d) => {
    tone(d, { freq: vary(700), to: 1400, dur: 0.18, type: 'sawtooth', gain: 0.1 });
    noise(d, { dur: 0.2, freq: 3000, to: 1200, q: 3, gain: 0.12 });
  }],
  nova: [40, (d) => tone(d, { freq: vary(300), to: 900, dur: 0.35, type: 'triangle', gain: 0.12, attack: 0.2 })],
  boom: [40, (d) => {
    noise(d, { dur: 0.4, filter: 'lowpass', freq: 1800, to: 120, gain: 0.45 });
    tone(d, { freq: vary(110), to: 40, dur: 0.35, type: 'sine', gain: 0.5 });
  }],
  dash: [40, (d) => noise(d, { dur: 0.22, filter: 'bandpass', freq: 600, to: 3200, q: 1.5, gain: 0.22, attack: 0.04 })],
  buff: [40, (d) => {
    tone(d, { freq: 523, dur: 0.18, type: 'triangle', gain: 0.12 });
    tone(d, { freq: 784, dur: 0.22, type: 'triangle', gain: 0.1, delay: 0.06 });
  }],
  beamCharge: [40, (d) => tone(d, { freq: 160, to: 900, dur: 0.85, type: 'sawtooth', gain: 0.09, attack: 0.6 })],
  beam: [40, (d) => {
    noise(d, { dur: 0.6, filter: 'lowpass', freq: 4000, to: 300, gain: 0.45 });
    tone(d, { freq: 90, to: 45, dur: 0.6, type: 'square', gain: 0.18 });
  }],
  flash: [40, (d) => tone(d, { freq: 1800, to: 300, dur: 0.14, type: 'square', gain: 0.08 })],
  heal: [40, (d) => {
    for (const [i, f] of [523, 659, 784].entries()) tone(d, { freq: f, dur: 0.5, type: 'sine', gain: 0.1, attack: 0.05, delay: i * 0.05 });
  }],
  recall: [40, (d) => tone(d, { freq: 300, to: 1200, dur: 1.1, type: 'sine', gain: 0.07, attack: 0.3 })],
  recallDone: [40, (d) => {
    tone(d, { freq: 1046, dur: 0.4, type: 'sine', gain: 0.12 });
    tone(d, { freq: 1568, dur: 0.5, type: 'sine', gain: 0.08, delay: 0.05 });
  }],
  // deaths and objectives
  minionDie: [50, (d) => tone(d, { freq: vary(500), to: 180, dur: 0.12, type: 'square', gain: 0.05 })],
  champDie: [80, (d) => {
    tone(d, { freq: 220, to: 55, dur: 0.7, type: 'sawtooth', gain: 0.18 });
    noise(d, { dur: 0.5, filter: 'lowpass', freq: 1200, to: 100, gain: 0.3 });
  }],
  towerDie: [100, (d) => {
    noise(d, { dur: 1.2, filter: 'lowpass', freq: 2500, to: 80, gain: 0.6 });
    tone(d, { freq: 70, to: 30, dur: 1.1, type: 'sine', gain: 0.55 });
    noise(d, { dur: 0.5, freq: 400, q: 0.7, gain: 0.25, delay: 0.25 });
  }],
  nexus: [300, (d) => {
    noise(d, { dur: 2.2, filter: 'lowpass', freq: 3000, to: 60, gain: 0.7 });
    tone(d, { freq: 60, to: 25, dur: 2, type: 'sine', gain: 0.7 });
  }],
  // feedback
  coin: [70, (d) => {
    tone(d, { freq: 1568, dur: 0.08, type: 'square', gain: 0.05 });
    tone(d, { freq: 2093, dur: 0.14, type: 'square', gain: 0.05, delay: 0.05 });
  }],
  levelUp: [200, (d) => {
    for (const [i, f] of [523, 659, 784, 1046].entries()) tone(d, { freq: f, dur: 0.3, type: 'triangle', gain: 0.12, delay: i * 0.07 });
  }],
  buy: [80, (d) => {
    noise(d, { dur: 0.08, freq: 5000, q: 4, gain: 0.12 });
    tone(d, { freq: 1318, dur: 0.12, type: 'square', gain: 0.06, delay: 0.04 });
    tone(d, { freq: 1760, dur: 0.22, type: 'square', gain: 0.06, delay: 0.11 });
  }],
  nope: [150, (d) => tone(d, { freq: 180, dur: 0.12, type: 'square', gain: 0.06 })],
  click: [40, (d) => tone(d, { freq: 900, to: 600, dur: 0.05, type: 'triangle', gain: 0.08 })],
  // stingers for banners
  good: [400, (d) => {
    for (const [i, f] of [392, 523, 659].entries()) tone(d, { freq: f, dur: 0.45, type: 'sawtooth', gain: 0.07, delay: i * 0.09, attack: 0.02 });
  }],
  bad: [400, (d) => {
    for (const [i, f] of [392, 311, 233].entries()) tone(d, { freq: f, dur: 0.5, type: 'sawtooth', gain: 0.07, delay: i * 0.11, attack: 0.02 });
  }],
  victory: [1000, (d) => {
    for (const [i, f] of [523, 659, 784, 1046, 1318].entries()) tone(d, { freq: f, dur: 0.9, type: 'triangle', gain: 0.14, delay: i * 0.12 });
  }],
  defeat: [1000, (d) => {
    for (const [i, f] of [440, 349, 294, 220].entries()) tone(d, { freq: f, dur: 1, type: 'sawtooth', gain: 0.08, delay: i * 0.18 });
  }],
};
export type SoundName = keyof typeof SOUNDS;

// Menu sounds play any time; everything else needs a running match (the menu's bot match stays silent).
// Positioned sounds fade with distance from the camera and pan left/right.
const MENU = new Set(['click', 'victory', 'defeat']);

export function sfx(name: SoundName, at?: Vec, vol = 1) {
  if (!ac || audio.muted) return;
  const def = SOUNDS[name];
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < def[0]) return;
  if (!audio.gameplay && !MENU.has(name)) return;
  let pan = 0;
  if (at) {
    const L = audio.listener;
    const d = Math.hypot(at.x - L.x, at.y - L.y);
    const fall = 1 - d / (L.halfWidth * 1.6);
    if (fall <= 0.05) return;
    vol *= fall * fall;
    pan = (at.x - L.x) / L.halfWidth;
  }
  const dest = out(pan * 0.8, vol);
  if (!dest) return;
  lastPlayed.set(name, now);
  def[1](dest, vol);
}
