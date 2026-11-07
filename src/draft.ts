// Champion select: ban phase (5 bans each, alternating), then a 1-2-2-2-2-1 snake pick, rune page and
// summoner spell choice. Bots ban and pick for their roles. Pure UI + turn logic; main.ts starts the match.
import type { ChampDef } from './data';
import { TREES, runeIcon, savePage, loadPage, isSimulated, SHARDS } from './runes';
import type { RunePage, Tree } from './runes';
import { defaultSums, fixSums, mountSumPicker } from './summoners';
import type { SumPair } from './summoners';

export type DRole = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
export const D_ROLES: DRole[] = ['top', 'jungle', 'mid', 'adc', 'support'];
const ROLE_NAME: Record<DRole, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'Bottom', support: 'Support' };
const ROLE_TAGS: Record<DRole, string[]> = { top: ['Fighter', 'Tank'], jungle: ['Assassin', 'Fighter', 'Tank'], mid: ['Mage', 'Assassin'], adc: ['Marksman'], support: ['Support', 'Tank', 'Mage'] };
const FAMOUS = ['yasuo', 'zed', 'jinx', 'lux', 'ahri', 'thresh', 'leesin', 'ezreal', 'vayne', 'katarina', 'darius', 'garen', 'yone', 'akali', 'caitlyn', 'kaisa', 'jhin', 'sylas', 'kayn', 'viego', 'masteryi', 'twitch', 'irelia', 'rengar', 'yuumi', 'blitzcrank', 'morgana', 'leona'];
export interface DraftResult { blue: string[]; red: string[]; bans: string[]; role: DRole; sums: SumPair; pick: string }
interface Turn { team: 0 | 1; kind: 'ban' | 'pick'; slot: number }

const $ = (id: string) => document.getElementById(id)!;
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const img = (c: ChampDef) => `<img src="${import.meta.env.BASE_URL}img/champ/${c.key ?? c.name}.png" alt="${c.name}" draggable="false" loading="lazy">`;

export function openDraft(opts: {
  champs: ChampDef[]; role: DRole | 'fill'; sums: SumPair | null; onDone: (r: DraftResult) => void; onCancel: () => void; sfx: (n: string) => void;
}) {
  const { champs } = opts;
  const byId = new Map(champs.map((c) => [c.id, c]));
  const el = $('draft');
  el.classList.remove('hidden');
  const myRole: DRole = opts.role === 'fill' ? D_ROLES[Math.floor(Math.random() * 5)] : opts.role;
  const orders = [shuffle(D_ROLES), shuffle(D_ROLES)]; // pick order of positions per team
  // blue picks first; 1-2-2-2-2-1 snake
  const pickTeams: (0 | 1)[] = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  const turns: Turn[] = [];
  for (let i = 0; i < 10; i++) turns.push({ team: (i % 2) as 0 | 1, kind: 'ban', slot: i >> 1 });
  const cnt = [0, 0];
  for (const t of pickTeams) turns.push({ team: t, kind: 'pick', slot: cnt[t]++ });
  const bans: (string | null)[] = Array(10).fill(null);
  const picks: (string | null)[][] = [Array(5).fill(null), Array(5).fill(null)]; // indexed by D_ROLES position
  const hover: (string | null)[] = [null, null];
  let turn = 0;
  let timer = 0;
  let timerId = 0;
  let ended = false;
  let filter = 'All';
  let query = '';
  let runeFor: string | null = null;
  const unavailable = (id: string) => bans.includes(id) || picks[0].includes(id) || picks[1].includes(id);
  const roleIdx = (team: 0 | 1, slot: number) => D_ROLES.indexOf(orders[team][slot]);
  const isMine = (t: Turn) => t.team === 0 && t.kind === 'pick' && orders[0][t.slot] === myRole;
  // in the ban phase the human bans with blue's whole ban row (blue's bans are all "mine")
  const humanActs = () => {
    const t = turns[turn];
    if (!t) return false;
    return t.team === 0 && (t.kind === 'ban' || isMine(t));
  };

  el.innerHTML = `
    <div class="dtop"><button id="dback">‹ Leave</button><div id="dphase"></div><div id="dtimer">30</div></div>
    <div class="dbody">
      <div class="dteam blue" id="dblue"></div>
      <div class="dmid">
        <div class="dbans" id="dbans"></div>
        <div class="dfilters"><input id="dsearch" placeholder="Search champions" autocomplete="off" spellcheck="false"><div id="dtabs"></div></div>
        <div id="dgrid"></div>
      </div>
      <div class="dteam red" id="dred"></div>
    </div>
    <div class="dbot">
      <div id="dspells"></div>
      <button id="drunes">Runes</button>
      <button id="dlock" disabled>Select a champion</button>
    </div>
    <div id="drunepanel" class="hidden"></div>`;
  const tabs = ['All', 'Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support'];
  $('dtabs').innerHTML = tabs.map((k) => `<button data-k="${k}" class="${k === filter ? 'on' : ''}">${k}</button>`).join('');
  // summoner spells: start from the saved pair (role-bound: junglers carry Smite) or the role default
  const myTags = () => byId.get(hover[0] ?? picks[0][D_ROLES.indexOf(myRole)] ?? '')?.tags ?? [];
  let sums: SumPair = fixSums(opts.sums ?? defaultSums(myRole), myRole);
  mountSumPicker($('dspells'), {
    get: () => sums,
    fallback: () => defaultSums(myRole, myTags()),
    onChange: (p) => {
      if (p) sums = fixSums(p, myRole, myTags());
    },
    allowAuto: false,
    sfx: () => opts.sfx('click'),
  });

  const grid = $('dgrid');
  grid.innerHTML = champs
    .map((c) => `<button class="dc" data-id="${c.id}" data-tags="${(c.tags ?? []).join(' ')}" data-n="${c.name.toLowerCase()}" title="${c.name}">${img(c)}<span>${c.name}</span></button>`)
    .join('');

  function renderTeams() {
    for (const team of [0, 1] as const) {
      const box = $(team ? 'dred' : 'dblue');
      box.innerHTML = D_ROLES.map((r, pos) => {
        const id = picks[team][pos];
        const c = id ? byId.get(id) : null;
        const slot = orders[team].indexOf(r);
        const cur = turns[turn]?.kind === 'pick' && turns[turn].team === team && turns[turn].slot === slot;
        const hv = !c && cur && hover[team] ? byId.get(hover[team]!) : null;
        const me = team === 0 && r === myRole;
        return `<div class="ds ${cur ? 'cur' : ''} ${c ? 'locked' : ''} ${me ? 'me' : ''}">
          <div class="dp">${c ? img(c) : hv ? `<i class="ghost">${img(hv)}</i>` : ''}</div>
          <div class="di"><b>${c ? c.name : hv ? hv.name : cur ? 'Picking…' : ' '}</b><small>${ROLE_NAME[r]}${me ? ' · You' : ''}</small></div>
        </div>`;
      }).join('');
    }
    $('dbans').innerHTML = [0, 1]
      .map((team) => `<div class="bt ${team ? 'red' : 'blue'}">${Array.from({ length: 5 }, (_, i) => {
        const idx = i * 2 + team;
        const id = bans[idx];
        const c = id ? byId.get(id) : null;
        return `<span class="bn ${turn === idx && turns[turn]?.kind === 'ban' ? 'cur' : ''}">${c ? img(c) : ''}</span>`;
      }).join('')}</div>`)
      .join('<em>BANS</em>');
  }
  function renderGrid() {
    grid.querySelectorAll<HTMLElement>('.dc').forEach((b) => {
      const id = b.dataset.id!;
      const c = byId.get(id)!;
      const match = (filter === 'All' || (c.tags ?? []).includes(filter)) && (!query || b.dataset.n!.includes(query));
      b.hidden = !match;
      b.classList.toggle('gone', unavailable(id));
      b.classList.toggle('sel', hover[0] === id && humanActs());
      b.classList.toggle('banned', bans.includes(id));
    });
  }
  function renderPhase() {
    const t = turns[turn];
    if (!t) return;
    const who = t.team === 0 ? 'Your team' : 'Enemy team';
    const mine = humanActs();
    $('dphase').innerHTML = `<small>${t.kind === 'ban' ? 'BAN PHASE' : 'PICK PHASE'}</small><b>${mine ? (t.kind === 'ban' ? 'Ban a champion' : 'Your pick') : `${who} is ${t.kind === 'ban' ? 'banning' : 'picking'}…`}</b>`;
    const lock = $('dlock') as HTMLButtonElement;
    lock.textContent = !mine ? 'Waiting…' : hover[0] ? (t.kind === 'ban' ? `Ban ${byId.get(hover[0])!.name}` : `Lock in ${byId.get(hover[0])!.name}`) : t.kind === 'ban' ? 'Select a ban' : 'Select a champion';
    lock.disabled = !mine || !hover[0];
    lock.classList.toggle('ban', t.kind === 'ban');
  }
  function renderAll() {
    renderTeams();
    renderGrid();
    renderPhase();
  }

  function botChoose(t: Turn): string {
    const avail = champs.filter((c) => !unavailable(c.id));
    if (t.kind === 'ban') {
      const f = avail.filter((c) => FAMOUS.includes(c.id));
      const pool = Math.random() < 0.7 && f.length ? f : avail;
      return pool[Math.floor(Math.random() * pool.length)].id;
    }
    const role = orders[t.team][t.slot];
    const good = avail.filter((c) => ROLE_TAGS[role].includes(c.tags?.[0] ?? ''));
    const pool = good.length ? good : avail;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  function commit(id: string) {
    const t = turns[turn];
    if (t.kind === 'ban') bans[turn] = id;
    else picks[t.team][roleIdx(t.team, t.slot)] = id;
    hover[0] = null;
    opts.sfx(t.kind === 'ban' ? 'click' : 'buy');
    turn++;
    startTurn();
  }
  function startTurn() {
    clearInterval(timerId);
    if (turn >= turns.length) return finish();
    renderAll();
    const t = turns[turn];
    timer = t.kind === 'ban' ? 20 : 30;
    const mine = humanActs();
    const botDelay = 1.0 + Math.random() * 1.6;
    const botAt = timer - botDelay;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      timer -= (now - last) / 1000;
      last = now;
      $('dtimer').textContent = String(Math.max(0, Math.ceil(timer)));
      $('dtimer').classList.toggle('low', timer <= 5);
      if (!mine && timer <= botAt) {
        clearInterval(timerId);
        commit(botChoose(t));
        return;
      }
      if (timer <= 0) {
        clearInterval(timerId);
        // out of time: take the hovered champion, else a random sensible one
        const h = hover[0] && !unavailable(hover[0]) ? hover[0] : botChoose(t);
        commit(h);
        return;
      }
    };
    timerId = window.setInterval(tick, 100);
  }
  function finish() {
    if (ended) return;
    ended = true;
    clearInterval(timerId);
    const pos = D_ROLES.indexOf(myRole);
    const pick = picks[0][pos]!;
    $('dphase').innerHTML = `<small>LOADING</small><b>Entering the Rift…</b>`;
    ($('dlock') as HTMLButtonElement).disabled = true;
    setTimeout(() => {
      el.classList.add('hidden');
      opts.onDone({ blue: picks[0] as string[], red: picks[1] as string[], bans: bans as string[], role: myRole, sums, pick });
    }, 900);
  }

  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.dc');
    if (!b || b.classList.contains('gone') || !humanActs()) return;
    hover[0] = b.dataset.id!;
    opts.sfx('click');
    renderAll();
  });
  $('dlock').addEventListener('click', () => {
    if (!humanActs() || !hover[0] || unavailable(hover[0])) return;
    commit(hover[0]);
  });
  $('dtabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    filter = b.dataset.k!;
    $('dtabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderGrid();
  });
  $('dsearch').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value.trim().toLowerCase();
    renderGrid();
  });
  $('dback').addEventListener('click', () => {
    ended = true;
    clearInterval(timerId);
    el.classList.add('hidden');
    opts.onCancel();
  });
  $('drunes').addEventListener('click', () => {
    const id = picks[0][D_ROLES.indexOf(myRole)] ?? hover[0] ?? champs[0].id;
    runeFor = id;
    renderRunes();
  });

  // ---------- rune editor ----------
  function renderRunes() {
    const panel = $('drunepanel');
    if (!runeFor) return panel.classList.add('hidden');
    const c = byId.get(runeFor)!;
    const page: RunePage = loadPage(c.id, c.tags ?? []);
    const prim = TREES.find((t) => t.key === page.primary) ?? TREES[0];
    const sec = TREES.find((t) => t.key === page.secondary && t.key !== prim.key) ?? TREES.find((t) => t.key !== prim.key)!;
    page.primary = prim.key;
    page.secondary = sec.key;
    const rune = (k: string, name: string, icon: string, desc: string, on: boolean, kind: string, idx: number, big = false) =>
      `<button class="rn ${on ? 'on' : ''} ${big ? 'big' : ''} ${isSimulated(k) ? '' : 'flat'}" data-kind="${kind}" data-i="${idx}" data-k="${k}" title="${name}: ${desc}${isSimulated(k) ? '' : ' (selectable; effect not simulated)'}"><img src="${runeIcon(icon)}" alt="${name}" draggable="false"></button>`;
    const treeTabs = (sel: string, kind: string, skip?: string) =>
      TREES.filter((t) => t.key !== skip).map((t) => `<button class="tt ${t.key === sel ? 'on' : ''}" data-kind="${kind}" data-k="${t.key}"><img src="${runeIcon(t.icon)}" alt=""><span>${t.name}</span></button>`).join('');
    const row = (t: Tree, r: number, sel: string[], kind: string, big = false) => `<div class="rrow">${t.slots[r].map((x) => rune(x.key, x.name, x.icon, x.desc, sel.includes(x.key), kind, r, big)).join('')}</div>`;
    const kname = (k: string) => TREES.flatMap((t) => t.slots.flat()).find((x) => x.key === k);
    panel.innerHTML = `<div class="rbox">
      <div class="rh"><h3>${c.name} · Runes</h3><button id="rclose">Done</button></div>
      <div class="rcols">
        <div><h4>Primary</h4><div class="tts">${treeTabs(prim.key, 'prim')}</div>
          ${row(prim, 0, [page.keystone], 'key', true)}
          ${[1, 2, 3].map((r) => row(prim, r, page.minors, 'min')).join('')}
          <p class="rdesc"><b>${kname(page.keystone)?.name ?? ''}</b> ${kname(page.keystone)?.desc ?? ''}</p></div>
        <div><h4>Secondary</h4><div class="tts">${treeTabs(sec.key, 'sec', prim.key)}</div>
          ${[1, 2, 3].map((r) => row(sec, r, page.picks, 'pick')).join('')}
          <h4>Stat shards</h4>
          ${SHARDS.map((rowS, i) => `<div class="rrow shard">${rowS.map((s, j) => `<button class="rn sh ${page.shards[i] === j ? 'on' : ''}" data-kind="shard" data-i="${i}" data-j="${j}">${s.label}</button>`).join('')}</div>`).join('')}</div>
      </div>
      <p class="rnote">Highlighted runes with a bright border are simulated in matches; dimmed ones can be chosen but have no gameplay effect yet.</p></div>`;
    panel.classList.remove('hidden');
    panel.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.id === 'rclose') { runeFor = null; panel.classList.add('hidden'); return; }
      const kind = b.dataset.kind;
      const k = b.dataset.k!;
      const i = Number(b.dataset.i);
      if (kind === 'prim') {
        const t = TREES.find((x) => x.key === k)!;
        page.primary = k; page.keystone = t.slots[0][0].key; page.minors = [1, 2, 3].map((r) => t.slots[r][0].key);
        if (page.secondary === k) page.secondary = TREES.find((x) => x.key !== k)!.key;
        const s2 = TREES.find((x) => x.key === page.secondary)!;
        page.picks = [s2.slots[1][0].key, s2.slots[2][0].key];
      } else if (kind === 'key') page.keystone = k;
      else if (kind === 'min') page.minors[i - 1] = k;
      else if (kind === 'sec') { const t = TREES.find((x) => x.key === k)!; page.secondary = k; page.picks = [t.slots[1][0].key, t.slots[2][0].key]; }
      else if (kind === 'pick') {
        const t = TREES.find((x) => x.key === page.secondary)!;
        const rowOf = (key: string) => t.slots.findIndex((s) => s.some((r) => r.key === key));
        const kept = page.picks.filter((p) => rowOf(p) !== i);
        page.picks = [...kept.slice(-1), k].sort((a, b2) => rowOf(a) - rowOf(b2));
      } else if (kind === 'shard') page.shards[i] = Number(b.dataset.j);
      savePage(c.id, page);
      opts.sfx('click');
      renderRunes();
    };
  }
  startTurn();
}
