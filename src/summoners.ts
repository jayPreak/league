// Summoner spells (D/F). Numbers from Data Dragon summoner.json (cooldowns, ranges) and the League wiki
// (level-scaled values); "a - b (based on level)" values are interpolated linearly by level, see
// docs/CHAMPIONS.md. Pure data + helpers; the effects live in main.ts (castSum).

export type SumId = 'flash' | 'ignite' | 'exhaust' | 'teleport' | 'ghost' | 'barrier' | 'cleanse' | 'heal' | 'smite';
export type SumPair = [SumId, SumId];
export type SumRole = 'top' | 'jungle' | 'mid' | 'adc' | 'support';

export interface SumDef {
  id: SumId;
  name: string;
  img: string; // Data Dragon image name, served from public/img/spell
  cd: number; // seconds
  range: number; // 0 = self cast
  aim: boolean; // location-targeted (Flash, Teleport) - hold to aim
  color: string;
  desc: string;
}

export const SUMS: Record<SumId, SumDef> = {
  flash: { id: 'flash', name: 'Flash', img: 'SummonerFlash', cd: 300, range: 400, aim: true, color: '#fff6a8', desc: 'Teleports you a short distance (400) toward your cursor.' },
  ignite: { id: 'ignite', name: 'Ignite', img: 'SummonerDot', cd: 180, range: 600, aim: false, color: '#ff8a3d', desc: 'Burns the target enemy champion for 70-525 (by level) true damage over 5s, reveals them and applies 40% Grievous Wounds.' },
  exhaust: { id: 'exhaust', name: 'Exhaust', img: 'SummonerExhaust', cd: 240, range: 650, aim: false, color: '#c9a36b', desc: 'Slows the target enemy champion by 40% and reduces their damage dealt by 35% for 3s.' },
  teleport: { id: 'teleport', name: 'Teleport', img: 'SummonerTeleport', cd: 300, range: 0, aim: true, color: '#c77dff', desc: 'After channeling for 3s, travel to the allied turret, minion or ward nearest the cursor, untargetable. Upgrades to Unleashed Teleport at 10:00 (faster travel, 50% Move Speed for 3s on arrival, 330-240s cooldown).' },
  ghost: { id: 'ghost', name: 'Ghost', img: 'SummonerHaste', cd: 240, range: 0, aim: false, color: '#7fd7ff', desc: 'Gain 24-50.8% (by level) Move Speed and ignore unit collision for 10s.' },
  barrier: { id: 'barrier', name: 'Barrier', img: 'SummonerBarrier', cd: 180, range: 0, aim: false, color: '#ffe08a', desc: 'Gain a 100-502 (by level) damage shield for 2.5s.' },
  cleanse: { id: 'cleanse', name: 'Cleanse', img: 'SummonerBoost', cd: 240, range: 0, aim: false, color: '#9ff3ff', desc: 'Removes all disables (except airborne) and summoner spell debuffs, and grants 75% Tenacity for 3s.' },
  heal: { id: 'heal', name: 'Heal', img: 'SummonerHeal', cd: 240, range: 900, aim: false, color: '#7dff9c', desc: 'Heals you and the most wounded nearby ally (or the ally at the cursor) for 80-346 (by level) and grants 30% Move Speed for 1s. Halved on champions healed by Heal in the last 35s.' },
  smite: { id: 'smite', name: 'Smite', img: 'SummonerSmite', cd: 15, range: 500, aim: false, color: '#ffcf6a', desc: 'Deals 600 true damage to a monster or enemy minion (hover it, or the nearest is chosen). 2 charges, 90s recharge; starts with 1, the second begins recharging at 0:48.' },
};
export const SUM_IDS = Object.keys(SUMS) as SumId[];

// "a - b (based on level)" -> value at a level, linear between levels 1 and 18
export const byLevel = (a: number, b: number, level: number) => a + ((b - a) * (Math.min(18, Math.max(1, level)) - 1)) / 17;

export const sumIcon = (id: SumId) => `${import.meta.env.BASE_URL}img/spell/${SUMS[id].img}.png`;

// What players usually take per role (Flash on D). Junglers must take Smite (role binding).
export function defaultSums(role: SumRole, tags: string[] = []): SumPair {
  const t0 = tags[0] ?? '';
  if (role === 'jungle') return ['flash', 'smite'];
  if (role === 'adc') return ['flash', 'heal'];
  if (role === 'support') return ['flash', t0 === 'Support' || t0 === 'Mage' ? 'exhaust' : 'ignite'];
  if (role === 'mid') return ['flash', t0 === 'Assassin' ? 'ignite' : 'teleport'];
  return ['flash', 'teleport'];
}

// Role binding: junglers always carry Smite, nobody else may.
export function fixSums(p: SumPair, role: SumRole, tags: string[] = []): SumPair {
  const out: SumPair = [p[0], p[1]];
  if (out[0] === out[1]) out[1] = defaultSums(role, tags).find((s) => s !== out[0]) ?? 'heal';
  if (role === 'jungle' && !out.includes('smite')) out[1] = 'smite';
  if (role !== 'jungle')
    for (let i = 0; i < 2; i++)
      if (out[i] === 'smite') out[i] = defaultSums(role, tags).find((s) => !out.includes(s)) ?? 'heal';
  return out;
}

export function parseSums(s: string | null): SumPair | null {
  if (!s) return null;
  const p = s.split(',');
  return p.length === 2 && p.every((x) => x in SUMS) && p[0] !== p[1] ? (p as SumPair) : null;
}

// D/F picker used by the menu and champion select: two slots; clicking one opens the spell grid.
// Picking the spell already in the other slot swaps them, like the League client.
export function mountSumPicker(
  el: HTMLElement,
  opts: { get: () => SumPair | null; fallback: () => SumPair; onChange: (p: SumPair | null) => void; allowAuto: boolean; sfx?: () => void },
) {
  let open = -1;
  const render = () => {
    const cur = opts.get();
    const p = cur ?? opts.fallback();
    el.innerHTML =
      `<span>Spells</span>` +
      (opts.allowAuto ? `<button class="sauto ${cur ? '' : 'on'}" data-a="1" title="Role default (Smite for junglers)">Auto</button>` : '') +
      p
        .map(
          (id, i) =>
            `<button class="sslot ${open === i ? 'open' : ''} ${cur ? '' : 'dim'}" data-i="${i}" title="${'DF'[i]}: ${SUMS[id].name} - ${SUMS[id].desc}"><img src="${sumIcon(id)}" alt="${SUMS[id].name}" draggable="false"><b>${'DF'[i]}</b></button>`,
        )
        .join('') +
      (open >= 0
        ? `<div class="sgrid">${SUM_IDS.map(
            (id) =>
              `<button data-s="${id}" class="${p[open] === id ? 'on' : ''}" title="${SUMS[id].name} (${SUMS[id].cd}s) - ${SUMS[id].desc}"><img src="${sumIcon(id)}" alt="" draggable="false"><span>${SUMS[id].name}</span></button>`,
          ).join('')}</div>`
        : '');
  };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const cur = opts.get();
    if (b.dataset.a) {
      open = -1;
      opts.onChange(null);
    } else if (b.dataset.i) {
      const i = Number(b.dataset.i);
      open = open === i ? -1 : i;
    } else if (b.dataset.s && open >= 0) {
      const p: SumPair = [...(cur ?? opts.fallback())] as SumPair;
      const id = b.dataset.s as SumId;
      const other = 1 - open;
      if (p[other] === id) p[other] = p[open];
      p[open] = id;
      open = -1;
      opts.onChange(p);
    }
    opts.sfx?.();
    render();
  });
  render();
  return { refresh: render };
}
