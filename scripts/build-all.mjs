// Builds the "all champions" database: src/champions/generic.json (compact kits derived from Data Dragon +
// CommunityDragon), src/items.json (Summoner's Rift shop), src/runes.json, and downloads icons to public/img.
// Champions with hand-written kits (src/kits) are skipped here; they keep their full data files.
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
const src = readFileSync('src/champions/ref.ts', 'utf8').replace(/const files = import\.meta\.glob[^\n]*\nexport const REF[^\n]*\n/, '');
mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync('node_modules/.cache/ref.mjs', transformSync(src, { loader: 'ts', format: 'esm' }).code);
const { evalCalc } = await import(process.cwd() + '/node_modules/.cache/ref.mjs');
const [ver] = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
const dd = (p) => `https://ddragon.leagueoflegends.com/cdn/${ver}/${p}`;
const CACHE = 'node_modules/.cache/riot';
mkdirSync(CACHE, { recursive: true });
const get = async (u) => {
  const f = CACHE + '/' + u.replace(/[^a-z0-9.]+/gi, '_');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const j = await getNet(u);
  writeFileSync(f, JSON.stringify(j));
  return j;
};
const getNet = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { if (i == 2) throw new Error(u + ' ' + e.message); } } };
const dl = async (u, f) => { if (existsSync(f)) return; try { const r = await fetch(u); if (r.ok) writeFileSync(f, Buffer.from(await r.arrayBuffer())); } catch {} };
const pool = async (arr, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < arr.length) { const x = arr[i++]; await fn(x); } })); };
const plain = (t) => (t ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/%i:[A-Za-z]+%/g, '').replace(/\s+/g, ' ').trim();
const scripted = new Set(readdirSync('src/champions/data').map((f) => f.replace('.json', '')));
const list = await get(dd('data/en_US/champion.json'));
const ids = Object.keys(list.data);
const out = [];
const Z = { level: 1, ap: 0, ad: 0, bonusAd: 0, armor: 0, bonusArmor: 0, mr: 0, bonusMr: 0, maxHp: 0, bonusHp: 0, hp: 0, mana: 0, maxMana: 0 };
await pool(ids, 8, async (id) => {
  await dl(dd(`img/champion/${id}.png`), `public/img/champ/${id}.png`);
  await dl(`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${id}_0.jpg`, `public/img/champ/${id}_load.jpg`);
  const d = (await get(dd(`data/en_US/champion/${id}.json`))).data[id];
  const folder = id.toLowerCase();
  let cd = null;
  try { cd = await get(`https://raw.communitydragon.org/${ver.split('.').slice(0, 2).join('.')}/game/data/characters/${folder}/${folder}.bin.json`); } catch {}
  const groups = cd ? Object.entries(cd).filter(([, v]) => v.mChildSpells) : [];
  const spellGame = (name) => {
    if (!cd) return null;
    const g = groups.find(([, v]) => v.mChildSpells.some((c) => c.toLowerCase().endsWith('/' + name.toLowerCase())));
    if (!g) return null;
    const p = g[1].mChildSpells.find((c) => c.toLowerCase().endsWith('/' + name.toLowerCase()));
    return cd[p]?.mSpell ?? null;
  };
  // every spell record in the same ability group (missiles, recasts, sub-spells) - damage often lives there
  const siblings = (name) => {
    if (!cd) return [];
    const g = groups.find(([, v]) => v.mChildSpells.some((c) => c.toLowerCase().endsWith('/' + name.toLowerCase())));
    const kids = g ? g[1].mChildSpells.map((p) => cd[p]?.mSpell).filter(Boolean) : [];
    // also loose spell records whose path names this spell (e.g. .../FizzQ/FizzQMissile)
    const loose = Object.entries(cd).filter(([k, v]) => v.mSpell && k.toLowerCase().includes('/' + name.toLowerCase())).map(([, v]) => v.mSpell);
    return [...new Set([...kids, ...loose])];
  };
  const S = { level: 9, ap: 100, ad: 150, bonusAd: 60, armor: 80, bonusArmor: 30, mr: 50, bonusMr: 10, maxHp: 2000, bonusHp: 600, hp: 1500, mana: 800, maxMana: 800 };
  const spells = d.spells.map((s, i) => {
    const raw = spellGame(s.id);
    const g = raw && { DataValues: Object.fromEntries((raw.DataValues ?? []).filter((x) => Array.isArray(x.values)).map((x) => [x.name, x.values])), calcs: raw.mSpellCalculations ?? {} };
    const ranks = i === 3 ? 3 : 5;
    const text = plain(s.description);
    // damage: first damage-like calculation that evaluates above zero
    let base = 0, perLvl = 0, adR = 0, apR = 0, dmgType = /physical damage/i.test(text) && !/magic damage/i.test(text) ? 'phys' : /true damage/i.test(text) && !/magic damage/i.test(text) ? 'true' : 'magic';
    let calcName = null;
    let gDmg = g;
    const tryCalcs = (gg) => {
      if (!gg) return null;
      const names = Object.keys(gg.calcs).filter((n) => /damage|dmg/i.test(n) && !/(heal|shield|per|bonus|max|mini|reduc|total|aoe|sec|tick|cap|monster|minion|tooltip|amp|percent)/i.test(n));
      const fallback = Object.keys(gg.calcs).filter((n) => /damage|dmg/i.test(n) && !/(heal|shield|reduc|cap|monster|minion|amp|percent)/i.test(n));
      for (const n of [...names, ...fallback]) {
        try { const v = evalCalc(gg, n, 1, S); if (v > 0 && v < 4000) return n; } catch {}
      }
      return null;
    };
    calcName = tryCalcs(g);
    if (!calcName) {
      for (const sib of siblings(s.id)) {
        if (sib === raw) continue;
        const gg = { DataValues: Object.fromEntries((sib.DataValues ?? []).filter((x) => Array.isArray(x.values)).map((x) => [x.name, x.values])), calcs: sib.mSpellCalculations ?? {} };
        const n = tryCalcs(gg);
        if (n) { calcName = n; gDmg = gg; break; }
      }
    }
    if (calcName) {
      const e = (rank, o = {}) => evalCalc(gDmg, calcName, rank, { ...Z, ...o });
      base = e(1); perLvl = (e(ranks) - e(1)) / (ranks - 1);
      apR = (e(1, { ap: 100 }) - base) / 100; adR = (e(1, { ad: 100, bonusAd: 100 }) - base) / 100;
      if (!isFinite(base) || base > 3000) base = perLvl = 0;
      if (!isFinite(apR) || apR > 5) apR = 0;
      if (!isFinite(adR) || adR > 5) adR = 0;
      if (adR > 2) adR = 1.2;
      if (perLvl < 0) perLvl = 0;
    }
    const dv = (re) => { if (!g) return 0; const k = Object.keys(g.DataValues).find((n) => re.test(n)); return k && g.DataValues[k] ? (g.DataValues[k][1] ?? 0) : 0; };
    // multi-form spells (Hwei, Jayce, Elise, Nidalee...) list no range on the parent: borrow the first sub-spell that has one
    let tRaw = raw;
    let range = Math.min(s.range[0] > 1 ? s.range[0] : 0, 5000);
    const aimedSubs = siblings(s.id).filter((x) => x !== raw && (x.castRange?.[1] ?? 0) > 1 && x.mTargetingTypeData && !/Self/.test(x.mTargetingTypeData.__type));
    if (range <= 1 && (!raw?.mTargetingTypeData || (/Self/.test(raw.mTargetingTypeData.__type) && aimedSubs.length >= 2))) {
      const sub = siblings(s.id).find((x) => x !== raw && (x.castRange?.[1] ?? x.castRange?.[0] ?? 0) > 1 && x.mTargetingTypeData && !/Self/.test(x.mTargetingTypeData.__type));
      if (sub) { tRaw = sub; range = Math.min(sub.castRange[1] ?? sub.castRange[0], 5000); }
    }
    const speed = tRaw?.missileSpeed || 0;
    const width = tRaw?.mLineWidth || 0;
    const radius = (tRaw?.castRadius?.[1] ?? tRaw?.castRadius?.[0] ?? 0) || dv(/^(radius|aoeradius|hitradius)/i);
    const lower = text.toLowerCase();
    // targeting data straight from the client: what the in-game indicator draws
    const tt = tRaw?.mTargetingTypeData?.__type ?? '';
    const tg = tRaw?.mClientData?.mTargeterDefinitions ?? [];
    const lv = (f) => (f && typeof f === 'object' ? (f.mPerLevelValues?.[1] ?? f.mPerLevelValues?.[0] ?? 0) : typeof f === 'number' ? f : 0);
    const lineT = tg.find((x) => /Line/.test(x.__type));
    const aoeT = tg.find((x) => /Aoe/.test(x.__type));
    const coneT = tg.find((x) => /Cone/.test(x.__type) && x.coneAngleDegrees);
    const rngT = tg.find((x) => /Range/.test(x.__type) && x.overrideBaseRange);
    const lineW = lv(lineT?.lineWidth), lineLen = lv(lineT?.overrideBaseRange);
    const aoeR = lv(aoeT?.overrideRadius) || lv(aoeT?.constraintRange) || 0;
    const selfR = lv(rngT?.overrideBaseRange);
    const dashy = /\b(dash|dashes|leap|leaps|jump|jumps|blink|blinks|teleport|teleports|charges)\b/.test(lower.slice(0, 220));
    const rad = aoeR || radius;
    let kind = 'nova', selfCenter = false, aim, cone;
    const dir = /Direction|Location/.test(tt) && !aoeT || lineT;
    if (/^Self/.test(tt) || (!tt && !lineT && !aoeT && !coneT && range <= 1)) {
      kind = 'nova'; selfCenter = true;
      aim = { shape: 'self', r: selfR || radius || (range > 1 ? range : 350), reach: 0 };
    } else if (coneT) {
      kind = 'bolt'; cone = coneT.coneAngleDegrees;
      const reach = lv(coneT.coneRange) || range || 600;
      aim = { shape: 'cone', deg: cone, reach };
    } else if (dashy && range > 1) {
      kind = 'dash';
      aim = { shape: 'line', w: lineW || width || 100, reach: range };
    } else if (/^Target/.test(tt) && !lineT) {
      kind = 'zone';
      aim = { shape: 'target', reach: range || 600 };
    } else if (dir && (speed > 0 || lineT)) {
      kind = 'bolt';
      aim = { shape: 'line', w: lineW || width || 100, reach: lineLen || range || 900 };
    } else if (tt === 'Area' || aoeT || (range > 1 && rad > 0)) {
      kind = 'zone';
      aim = { shape: 'circle', r: rad || 250, reach: range || 800 };
    } else if (speed > 0 && range > 1) {
      kind = 'bolt';
      aim = { shape: 'line', w: width || 100, reach: range };
    } else if (range <= 1 && calcName) {
      kind = 'nova'; selfCenter = true;
      aim = { shape: 'self', r: radius || 350, reach: 0 };
    } else if (!calcName) {
      kind = 'buff';
      aim = { shape: 'none', reach: 0 };
    } else {
      kind = 'bolt';
      aim = { shape: 'line', w: width || 100, reach: range || 800 };
    }
    const stun = dv(/^stun(duration|time|dur)?$/i), slow = dv(/slow(percent|amount|pct)?$/i), root = dv(/^root(duration|time)?$/i), kb = dv(/^(knockup|airborne)/i);
    return {
      name: s.name, desc: text, kind, cds: s.cooldown.slice(0, ranks), costs: s.cost.slice(0, ranks), ranges: s.range.slice(0, ranks),
      costType: (s.costType || '').trim(), range, base: +base.toFixed(2), perLvl: +perLvl.toFixed(2), adR: +adR.toFixed(3), apR: +apR.toFixed(3), dmgType,
      speed: speed || undefined, radius: (aim.shape === 'self' ? aim.r : aim.shape === 'circle' ? aim.r : radius) || undefined, selfCenter: selfCenter || undefined, aim, width: (aim.shape === 'line' ? aim.w : width) || undefined,
      stun: stun > 0 && stun < 5 ? stun : undefined, slow: slow > 0 ? (slow > 1 ? slow / 100 : slow) : undefined, root: root > 0 && root < 5 ? root : undefined, knockup: kb > 0 && kb < 3 ? kb : undefined,
      derived: !!calcName,
    };
  });
  out.push({ id: id.toLowerCase(), key: id, name: d.name, title: d.title, tags: d.tags, resource: d.partype, stats: d.stats, passive: { name: d.passive.name, desc: plain(d.passive.description) }, spells, skin: d.skins?.[0]?.num ?? 0, blurb: d.blurb });
});
out.sort((a, b) => a.name.localeCompare(b.name));
const generic = out.filter((c) => !scripted.has(c.key));
writeFileSync('src/champions/generic.json', JSON.stringify(generic));
// full list incl. scripted (for select screen): id, key, name, title, tags
writeFileSync('src/champions/index.json', JSON.stringify(out.map((c) => ({ id: c.id, key: c.key, name: c.name, title: c.title, tags: c.tags }))));
console.log('champions', out.length, 'generic', generic.length, 'ver', ver);

// ---------- items ----------
const it = (await get(dd('data/en_US/item.json'))).data;
const items = [];
for (const [id, v] of Object.entries(it)) {
  if (!v.gold?.purchasable || !v.maps?.['11'] || v.requiredChampion || v.requiredAlly || v.hideFromAll || v.inStore === false) continue;
  if (v.tags?.includes('Trinket') && id !== '3340') continue;
  if (v.consumed && !['2003', '2031', '2055'].includes(id)) continue;
  items.push({ id, name: v.name, cost: v.gold.total, base: v.gold.base, sell: v.gold.sell, from: v.from ?? [], into: v.into ?? [], tags: v.tags ?? [], stats: v.stats, desc: plain(v.description), depth: v.depth ?? 1 });
}
writeFileSync('src/items.json', JSON.stringify(items));
console.log('items', items.length);
await pool(items, 8, (x) => dl(dd(`img/item/${x.id}.png`), `public/img/item/${x.id}.png`));

// ---------- runes ----------
const runes = await get(dd('data/en_US/runesReforged.json'));
writeFileSync('src/runes.json', JSON.stringify(runes.map((t) => ({ id: t.id, key: t.key, name: t.name, icon: t.icon, slots: t.slots.map((s) => s.runes.map((r) => ({ id: r.id, key: r.key, name: r.name, icon: r.icon, desc: plain(r.shortDesc) }))) }))));
const ricons = runes.flatMap((t) => [t.icon, ...t.slots.flatMap((s) => s.runes.map((r) => r.icon))]);
await pool(ricons, 8, (p) => { mkdirSync('public/img/rune/' + p.split('/').slice(0, -1).join('/'), { recursive: true }); return dl(`https://ddragon.leagueoflegends.com/cdn/img/${p}`, 'public/img/rune/' + p); });
console.log('runes', runes.length);

// ---------- summoner spell icons (numbers live in src/summoners.ts) ----------
const summ = await get(dd('data/en_US/summoner.json'));
mkdirSync('public/img/spell', { recursive: true });
const sids = Object.values(summ.data).filter((s) => s.modes.includes('CLASSIC')).map((s) => s.image.full);
await pool(sids, 8, (f) => dl(dd(`img/spell/${f}`), `public/img/spell/${f}`));
console.log('summoner spells', sids.length);

// ---------- champion ability + passive icons (HUD ability bar, tooltips) ----------
// src/champions/icons.json: { ChampKey: [passive, Q, W, E, R] } file names under public/img/ability
mkdirSync('public/img/ability', { recursive: true });
const icons = {};
for (const id of ids) {
  const d = (await get(dd(`data/en_US/champion/${id}.json`))).data[id];
  icons[id] = [d.passive.image.full, ...d.spells.map((s) => s.image.full)];
}
writeFileSync('src/champions/icons.json', JSON.stringify(icons));
const aimgs = Object.entries(icons).flatMap(([, [p, ...s]]) => [['passive', p], ...s.map((f) => ['spell', f])]);
await pool(aimgs, 8, ([kind, f]) => dl(dd(`img/${kind}/${f}`), `public/img/ability/${f}`));
console.log('ability icons', aimgs.length);
