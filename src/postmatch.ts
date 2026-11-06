// Post-match screen: scoreboard, damage breakdown, team graphs and per-player item timeline.
export interface PlayerStat {
  name: string; champ: string; icon: string; team: 0 | 1; level: number; kills: number; deaths: number; assists: number; cs: number;
  gold: number; pc: number; mc: number; tc: number; obj: number; mon: number; taken: number; healed: number; wards: number; ctrl: number;
  items: { id: string; name: string; icon: string }[]; itemLog: [number, string][]; icons: Record<string, string>; me: boolean; keystone: string; keystoneIcon: string;
}
export interface PostData {
  won: boolean; time: string; seconds: number; kills: [number, number]; mode: string; rating: string; bans: { icon: string; name: string }[];
  players: PlayerStat[]; tl: { t: number; g: [number, number]; d: [number, number]; k: [number, number] }[]; towers: [number, number];
}
const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const TEAM = ['#3b8cff', '#ff4d4d'];
const dmgOf = (p: PlayerStat) => p.pc + p.mc + p.tc;

function lineChart(title: string, series: [number[], number[]], t: number[], unit = '', minMax = 1): string {
  const W = 420, H = 190, L = 40, B = 24, T = 14, R = 10;
  const pts = Math.max(series[0].length, 2);
  const max = Math.max(minMax, ...series[0], ...series[1]);
  const x = (i: number) => L + ((W - L - R) * i) / (pts - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#2a3340" stroke-width="1"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end" fill="#8a99a8" font-size="10">${fmt(max * f)}${unit}</text>`).join('');
  const xl = t.map((s, i) => (i % Math.ceil(pts / 6) === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="#8a99a8" font-size="10">${Math.round(s / 60)}m</text>` : '')).join('');
  return `<figure><figcaption>${title}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title.replace(/<[^>]+>/g, '')}">${ticks}${xl}
    <path d="${path(series[0])}" fill="none" stroke="${TEAM[0]}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path(series[1])}" fill="none" stroke="${TEAM[1]}" stroke-width="2.5" stroke-linejoin="round"/></svg></figure>`;
}
function goldDiff(tl: PostData['tl']): string {
  const W = 420, H = 190, L = 40, B = 24, T = 14, R = 10;
  const d = tl.map((p) => p.g[0] - p.g[1]);
  const max = Math.max(500, ...d.map(Math.abs));
  const pts = Math.max(d.length, 2);
  const x = (i: number) => L + ((W - L - R) * i) / (pts - 1);
  const y = (v: number) => T + ((H - T - B) / 2) * (1 - v / max);
  const zero = y(0);
  const area = d.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<figure><figcaption>Team gold lead <span class="lg"><i style="background:${TEAM[0]}"></i>Blue ahead <i style="background:${TEAM[1]}"></i>Red ahead</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gold difference over time"><line x1="${L}" x2="${W - R}" y1="${zero}" y2="${zero}" stroke="#516070"/>
    <text x="${L - 6}" y="${y(max) + 4}" text-anchor="end" fill="#8a99a8" font-size="10">+${fmt(max)}</text><text x="${L - 6}" y="${y(-max) + 4}" text-anchor="end" fill="#8a99a8" font-size="10">-${fmt(max)}</text>
    <path d="${area}L${x(d.length - 1)},${zero}L${x(0)},${zero}Z" fill="${d[d.length - 1] >= 0 ? TEAM[0] : TEAM[1]}" fill-opacity="0.25"/>
    <path d="${area}" fill="none" stroke="#c8aa6e" stroke-width="2.5" stroke-linejoin="round"/></svg></figure>`;
}

export function renderPost(d: PostData): string {
  const maxD = Math.max(1, ...d.players.map(dmgOf));
  const maxT = Math.max(1, ...d.players.map((p) => p.taken));
  const maxH = Math.max(1, ...d.players.map((p) => p.healed));
  const sum = (t: number, f: (p: PlayerStat) => number) => d.players.filter((p) => p.team === t).reduce((a, p) => a + f(p), 0);
  const row = (p: PlayerStat) => `<tr class="${p.me ? 'me' : ''}" style="--tc:${TEAM[p.team]}">
    <td class="who"><img src="${p.icon}" alt=""><span class="lv">${p.level}</span><b>${p.champ}</b><small>${p.me ? 'You' : p.name}</small></td>
    <td>${p.kills}/${p.deaths}/${p.assists}</td><td>${p.cs}</td><td>${fmt(p.gold)}</td>
    <td class="items">${p.items.map((i) => `<img src="${i.icon}" title="${i.name}" alt="${i.name}">`).join('')}</td><td>${p.wards}</td></tr>`;
  const team = (t: 0 | 1) => `<section class="pteam ${t ? 'red' : 'blue'}"><h3>${t ? 'Red' : 'Blue'} team <small>${d.kills[t]} kills · ${fmt(sum(t, (p) => p.gold))} gold · ${d.towers[t]} towers</small></h3>
    <table><thead><tr><th></th><th>K/D/A</th><th>CS</th><th>Gold</th><th>Items</th><th>Wards</th></tr></thead><tbody>${d.players.filter((p) => p.team === t).map(row).join('')}</tbody></table></section>`;
  const bar = (p: PlayerStat) => {
    const tot = dmgOf(p) || 1;
    return `<div class="dr ${p.me ? 'me' : ''}" style="--tc:${TEAM[p.team]}"><img src="${p.icon}" alt=""><span class="nm">${p.champ}</span>
      <div class="bars"><div class="track"><i class="p" style="width:${(p.pc / maxD) * 100}%"></i><i class="m" style="width:${(p.mc / maxD) * 100}%"></i><i class="t" style="width:${(p.tc / maxD) * 100}%"></i></div><b>${fmt(dmgOf(p))}</b></div></div>`;
  };
  const sortedBy = (f: (p: PlayerStat) => number) => [...d.players].sort((a, b) => f(b) - f(a));
  const simple = (list: PlayerStat[], f: (p: PlayerStat) => number, max: number, cls: string) =>
    list.map((p) => `<div class="dr ${p.me ? 'me' : ''}" style="--tc:${TEAM[p.team]}"><img src="${p.icon}" alt=""><span class="nm">${p.champ}</span><div class="bars"><div class="track"><i class="${cls}" style="width:${(f(p) / max) * 100}%"></i></div><b>${fmt(f(p))}</b></div></div>`).join('');
  const timeline = (p: PlayerStat) => `<div class="bl"><img src="${p.icon}" alt=""><b>${p.champ}</b><span class="ks">${p.keystoneIcon ? `<img src="${p.keystoneIcon}" alt="" title="${p.keystone}">` : ''}</span><div class="ib">${p.itemLog.map(([t, id]) => {
    return `<span><img src="${p.icons[id] ?? ''}" alt="" onerror="this.style.visibility='hidden'"><small>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</small></span>`;
  }).join('') || '<em>No purchases</em>'}</div></div>`;
  const tl = d.tl;
  const tt = tl.map((p) => p.t);
  return `<div class="ph ${d.won ? 'win' : 'loss'}"><h1>${d.won ? 'VICTORY' : 'DEFEAT'}</h1>
      <p>${d.mode} · ${d.time} · <b class="b">${d.kills[0]}</b> – <b class="r">${d.kills[1]}</b> kills</p><p class="rate">${d.rating}</p></div>
    <nav class="ptabs"><button data-t="score" class="on">Scoreboard</button><button data-t="dmg">Damage</button><button data-t="graph">Graphs</button><button data-t="build">Builds</button></nav>
    <div class="ppanes">
      <div class="pp on" data-p="score">${team(0)}${team(1)}${d.bans.length ? `<div class="pbans"><span>Bans</span>${d.bans.map((b) => `<img src="${b.icon}" title="${b.name}" alt="${b.name}">`).join('')}</div>` : ''}</div>
      <div class="pp" data-p="dmg"><h3>Damage to champions <span class="lg"><i class="p"></i>Physical <i class="m"></i>Magic <i class="t"></i>True</span></h3>${sortedBy(dmgOf).map(bar).join('')}
        <div class="two"><div><h3>Damage taken</h3>${simple(sortedBy((p) => p.taken), (p) => p.taken, maxT, 'x')}</div><div><h3>Healing</h3>${simple(sortedBy((p) => p.healed), (p) => p.healed, maxH, 'h')}</div></div>
        <div class="two"><div><h3>Objective damage</h3>${simple(sortedBy((p) => p.obj), (p) => p.obj, Math.max(1, ...d.players.map((p) => p.obj)), 'o')}</div><div><h3>Minion &amp; monster damage</h3>${simple(sortedBy((p) => p.mon), (p) => p.mon, Math.max(1, ...d.players.map((p) => p.mon)), 'o')}</div></div></div>
      <div class="pp" data-p="graph"><div class="gs">${goldDiff(tl)}${lineChart('Team gold <span class="lg"><i style="background:' + TEAM[0] + '"></i>Blue <i style="background:' + TEAM[1] + '"></i>Red</span>', [tl.map((p) => p.g[0]), tl.map((p) => p.g[1])], tt)}${lineChart('Damage to champions', [tl.map((p) => p.d[0]), tl.map((p) => p.d[1])], tt)}${lineChart('Kills', [tl.map((p) => p.k[0]), tl.map((p) => p.k[1])], tt, '', 4)}</div></div>
      <div class="pp" data-p="build">${d.players.map(timeline).join('')}</div>
    </div>`;
}
