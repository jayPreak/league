// Data-driven roster: stats, text, cooldowns, costs and ranges come from the reference database
// (src/champions/data, generated from Riot Data Dragon + CommunityDragon). Only presentation and
// AI hints live in ROSTER below; behaviour lives in src/kits.
import type { AbilityDef, AbilityKind, AimShape, ChampDef } from '../data';
import { REF } from './ref';

interface AbilityHint {
  kind: AbilityKind; // nearest generic kind, used by bot AI and the aim indicator only
  color: string;
  width?: number;
  radius?: number;
  speed?: number;
  selfCenter?: boolean;
  execute?: number; // marks execute-style casts for bot AI
  landRadius?: number;
  once?: boolean; // trap-like: bots cast on top of the target
  ai?: 'self' | 'target'; // 'target': cast on the foe, 'self': cast without aiming
}
interface RosterEntry {
  id: string; // lowercased Data Dragon id
  color: string;
  build: string[];
  hints: [AbilityHint, AbilityHint, AbilityHint, AbilityHint];
}
const B = {
  ad: ['boots', 'sword', 'edge', 'blade', 'edge', 'plate', 'vest'],
  fighter: ['boots', 'sword', 'edge', 'plate', 'blade', 'gem', 'cloak'],
  tank: ['boots', 'vest', 'gem', 'plate', 'cloak', 'plate', 'gem'],
  adc: ['boots', 'dagger', 'bow', 'blade', 'edge', 'bow', 'vest'],
  mage: ['boots', 'tome', 'crown', 'tome', 'gem', 'crown', 'cloak'],
  support: ['boots', 'gem', 'tome', 'crown', 'plate', 'cloak', 'crown'],
};
const h = (kind: AbilityKind, color: string, o: Partial<AbilityHint> = {}): AbilityHint => ({ kind, color, ...o });

export const ROSTER: RosterEntry[] = [
  { id: 'masteryi', color: '#e8c24a', build: B.ad, hints: [h('dash', '#ffe08a'), h('buff', '#7be0a0'), h('buff', '#ffb347'), h('buff', '#ff6a3d')] },
  { id: 'twitch', color: '#8fbf3a', build: B.adc, hints: [h('buff', '#9acd32'), h('zone', '#7ac520', { radius: 285 }), h('nova', '#b6e04a', { selfCenter: true, radius: 1200 }), h('bolt', '#c8f060', { width: 120, speed: 4000 })] },
  { id: 'monkeyking', color: '#e0a030', build: B.fighter, hints: [h('buff', '#ffd27a'), h('dash', '#9fd8ee'), h('dash', '#fff0a8'), h('nova', '#ffc94a', { selfCenter: true, radius: 315 })] },
  { id: 'yuumi', color: '#b78cff', build: B.support, hints: [h('bolt', '#d6b8ff', { width: 100, speed: 1050 }), h('ally', '#ffd6f0'), h('ally', '#ff9fd0', { radius: 500 }), h('beam', '#ffc2f0', { width: 500 })] },
  { id: 'naafiri', color: '#c8453b', build: B.ad, hints: [h('bolt', '#e86a5a', { width: 80, speed: 1500 }), h('buff', '#ff8a6b'), h('dash', '#ff5a4a', { landRadius: 300 }), h('dash', '#ff3a2a', { landRadius: 250 })] },
  { id: 'irelia', color: '#4fb8e8', build: B.fighter, hints: [h('dash', '#8fd8ff'), h('buff', '#cfeeff'), h('bolt', '#6fc8ff', { width: 90, speed: 2000 }), h('bolt', '#4fa8ff', { width: 300, speed: 2000 })] },
  { id: 'lux', color: '#ffe6a8', build: B.mage, hints: [h('bolt', '#fff0b8', { width: 80, speed: 1200 }), h('ally', '#fff6d0', { radius: 400 }), h('zone', '#ffe27a', { radius: 310 }), h('beam', '#fff3a0', { width: 190 })] },
  { id: 'rengar', color: '#c8884a', build: B.ad, hints: [h('buff', '#ffb36b'), h('nova', '#ff9a4a', { selfCenter: true, radius: 450 }), h('bolt', '#d8a46a', { width: 70, speed: 1500 }), h('buff', '#cd90ee')] },
  { id: 'garen', color: '#6fa8ff', build: B.fighter, hints: [h('buff', '#cfe0ff'), h('buff', '#9fc0ff'), h('nova', '#ffd27a', { selfCenter: true, radius: 325 }), h('dash', '#fff0b0', { execute: 0.4 })] },
  { id: 'ashe', color: '#9fe0ff', build: B.adc, hints: [h('buff', '#b8ecff'), h('bolt', '#8fd8ff', { width: 200, speed: 2000 }), h('buff', '#e0f6ff'), h('bolt', '#6fc8ff', { width: 130, speed: 1600 })] },
  { id: 'annie', color: '#ff5a5a', build: B.mage, hints: [h('bolt', '#ff7a4a', { width: 60, speed: 1400 }), h('nova', '#ff6a3a', { radius: 300 }), h('ally', '#ff9a6a', { radius: 100 }), h('nova', '#ff3a2a', { radius: 290 })] },
  { id: 'malphite', color: '#9a8f80', build: B.tank, hints: [h('bolt', '#c8b89a', { width: 60, speed: 1200 }), h('buff', '#d8c8aa'), h('nova', '#b8a888', { selfCenter: true, radius: 400 }), h('dash', '#a89878', { landRadius: 300 })] },
  { id: 'ezreal', color: '#ffd24a', build: B.adc, hints: [h('bolt', '#ffe27a', { width: 120, speed: 2000 }), h('bolt', '#ffa84a', { width: 160, speed: 1700 }), h('dash', '#7fe3ff'), h('beam', '#ffe27a', { width: 320 })] },
  { id: 'jinx', color: '#4fb8ff', build: B.adc, hints: [h('buff', '#ff6ab0'), h('bolt', '#4fd8ff', { width: 120, speed: 3300 }), h('zone', '#ff8a4a', { once: true, radius: 120 }), h('bolt', '#ff4a8a', { width: 280, speed: 1700 })] },
  { id: 'leona', color: '#ffc94a', build: B.tank, hints: [h('buff', '#ffe27a'), h('buff', '#fff0a8'), h('bolt', '#ffd24a', { width: 100, speed: 2000 }), h('nova', '#ffb83a', { radius: 300 })] },
  { id: 'blitzcrank', color: '#c8a46a', build: B.tank, hints: [h('bolt', '#e8c88a', { width: 140, speed: 1800 }), h('buff', '#ffe27a'), h('buff', '#fff0a8'), h('nova', '#7fd8ff', { selfCenter: true, radius: 600 })] },
  { id: 'morgana', color: '#a86bff', build: B.mage, hints: [h('bolt', '#c89bff', { width: 140, speed: 1200 }), h('zone', '#8a4bd8', { radius: 275 }), h('ally', '#d8c0ff', { radius: 100 }), h('nova', '#7a3bd8', { selfCenter: true, radius: 600 })] },
  { id: 'zed', color: '#d83a3a', build: B.ad, hints: [h('bolt', '#ff5a5a', { width: 90, speed: 1700 }), h('dash', '#7a2a2a'), h('nova', '#ff6a6a', { selfCenter: true, radius: 290 }), h('dash', '#ff2a2a', { execute: 0.5 })] },
  { id: 'darius', color: '#b8442a', build: B.fighter, hints: [h('nova', '#ff6a4a', { selfCenter: true, radius: 425 }), h('buff', '#ff8a6a'), h('nova', '#d8c0a0', { selfCenter: true, radius: 535 }), h('dash', '#ff3a1a', { execute: 0.4 })] },
  { id: 'ahri', color: '#ff8ac8', build: B.mage, hints: [h('bolt', '#ffb8e0', { width: 100, speed: 2500 }), h('buff', '#ff9ac8'), h('bolt', '#ff6ab0', { width: 120, speed: 1550 }), h('dash', '#ffc0e8')] },
];


// Indicator shapes straight from the in-game casting behaviour (widths/radii from the reference data where
// it lists them): line:<width>:<reach>, circle:<radius>:<reach>, cone:<degrees>:<reach>, self:<radius>,
// target:<reach>, none.
const AIM: Record<string, [string, string, string, string]> = {
  masteryi: ['target:600', 'none', 'none', 'none'],
  twitch: ['none', 'circle:285:950', 'self:1200', 'line:120:850'],
  monkeyking: ['none', 'line:60:300', 'target:650', 'self:315'],
  yuumi: ['line:65:1100', 'target:700', 'self:500', 'line:100:1100'],
  naafiri: ['line:90:900', 'none', 'line:100:450', 'target:900'],
  irelia: ['target:600', 'line:120:825', 'circle:70:775', 'line:160:950'],
  lux: ['line:80:1175', 'line:150:1150', 'circle:295:1100', 'line:190:3340'],
  rengar: ['none', 'self:450', 'line:70:1000', 'none'],
  garen: ['none', 'none', 'self:325', 'target:400'],
  ashe: ['none', 'cone:57:1200', 'none', 'line:130:3000'],
  annie: ['target:625', 'cone:50:600', 'target:800', 'circle:290:600'],
  malphite: ['target:625', 'none', 'self:400', 'circle:300:1000'],
  ezreal: ['line:120:1150', 'line:160:1150', 'circle:60:475', 'line:320:3000'],
  jinx: ['none', 'line:120:1450', 'circle:200:925', 'line:280:3000'],
  leona: ['none', 'self:450', 'line:100:875', 'circle:250:1200'],
  blitzcrank: ['line:140:1079', 'none', 'none', 'self:600'],
  morgana: ['line:140:1250', 'circle:275:900', 'target:800', 'self:600'],
  zed: ['line:100:900', 'line:60:650', 'self:290', 'target:625'],
  darius: ['self:425', 'none', 'cone:70:535', 'target:460'],
  ahri: ['line:100:970', 'self:700', 'line:120:975', 'line:100:450'],
};
const parseAim = (spec: string): AimShape => {
  const [shape, a, b] = spec.split(':');
  const n = (v?: string) => (v ? Number(v) : 0);
  switch (shape) {
    case 'line': return { shape, w: n(a), reach: n(b) };
    case 'circle': return { shape, r: n(a), reach: n(b) };
    case 'cone': return { shape, deg: n(a), reach: n(b) };
    case 'self': return { shape, r: n(a), reach: 0 };
    case 'target': return { shape, reach: n(a) };
    default: return { shape: 'none', reach: 0 };
  }
};

// Data Dragon text carries markup ({{ spell vars }}, <tags>); strip it for plain-text UI.
export const plain = (t: string) =>
  t
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/%i:[A-Za-z]+%/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function buildRoster(): ChampDef[] {
  return ROSTER.map((r) => {
    const ref = REF[r.id];
    if (!ref) throw new Error(`champion data missing: ${r.id}`);
    const st = ref.stats;
    const abilities: AbilityDef[] = ref.spells.map((sp, i) => {
      const hint = r.hints[i];
      const ranks = i === 3 ? 3 : 5;
      const cds = sp.ddCooldown.slice(0, ranks);
      const costs = sp.ddCost.slice(0, ranks);
      const ranges = sp.ddRange.slice(0, ranks);
      return {
        name: sp.name,
        desc: plain(sp.description),
        kind: hint.kind,
        script: true,
        cd: cds[0],
        cds,
        cost: costs[0],
        costs,
        costType: sp.costType,
        range: ranges[0] > 1 ? Math.min(ranges[0], 5000) : 0,
        ranges,
        base: 0,
        perLvl: 0,
        adR: 0,
        apR: 0,
        dmgType: 'magic',
        color: hint.color,
        width: hint.width,
        radius: hint.radius,
        speed: hint.speed,
        selfCenter: hint.selfCenter,
        execute: hint.execute,
        landRadius: hint.landRadius,
        once: hint.once,
        aim: parseAim(AIM[r.id][i]),
      };
    });
    return {
      id: r.id,
      name: ref.name,
      title: ref.title.replace(/^./, (c) => c.toUpperCase()),
      role: ref.tags.join(' / '),
      tags: ref.tags,
      color: r.color,
      hp: st.hp,
      hpL: st.hpperlevel,
      ad: st.attackdamage,
      adL: st.attackdamageperlevel,
      armor: st.armor,
      armorL: st.armorperlevel,
      mr: st.spellblock,
      mrL: st.spellblockperlevel,
      range: st.attackrange,
      as: st.attackspeed,
      asL: st.attackspeedperlevel / 100,
      ms: st.movespeed,
      ranged: st.attackrange > 200,
      mp: st.mp,
      mpL: st.mpperlevel,
      mpRegen: st.mpregen / 5, // Data Dragon lists per-5-seconds
      mpRegenL: st.mpregenperlevel / 5,
      hpRegen: st.hpregen,
      hpRegenL: st.hpregenperlevel,
      resource: ref.resource,
      passive: { name: ref.passive.name, desc: plain(ref.passive.description) },
      wiki: ref.version,
      abilities,
      build: r.build,
    };
  });
}
