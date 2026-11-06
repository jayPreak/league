// Builds src/champions/data/<id>.json (reference database) from
//  - Riot Data Dragon (official): names, titles, tags, resource, base stats, ability text
//  - CommunityDragon (client game data export): exact per-rank DataValues, calculations, cooldowns, costs, ranges
// Nothing here is hand-typed; anything missing is recorded under "unverified".
import { mkdirSync, writeFileSync } from 'node:fs';
const IDS = process.env.ONLY ? process.env.ONLY.split(',') : ['MasterYi','Twitch','MonkeyKing','Yuumi','Naafiri','Irelia','Lux','Rengar','Garen','Ashe','Annie','Malphite','Ezreal','Jinx','Leona','Blitzcrank','Morgana','Zed','Darius','Ahri'];
const [ver] = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
mkdirSync('src/champions/data', { recursive: true });
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const trim = (s) => ({
  DataValues: Object.fromEntries((s.DataValues ?? []).map((d) => [d.name, d.values])),
  calcs: s.mSpellCalculations ?? {},
  cooldown: s.cooldownTime, castRange: s.castRange, castRadius: s.castRadius, mana: s.mana,
  missileSpeed: s.missileSpeed, castTime: s.mCastTime, channelDuration: s.mChannelDuration,
  lineWidth: s.mLineWidth, maxAmmo: s.mMaxAmmo, ammoRechargeTime: s.mAmmoRechargeTime, tags: s.mSpellTags,
});
for (const id of IDS) {
  const dd = (await get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${id}.json`)).data[id];
  const folder = id.toLowerCase();
  const cd = await get(`https://raw.communitydragon.org/${ver.split('.').slice(0,2).join('.')}/game/data/characters/${folder}/${folder}.bin.json`);
  const rec = Object.entries(cd).find(([k]) => /CharacterRecords\/Root$/i.test(k))[1];
  const groups = Object.entries(cd).filter(([, v]) => v.mChildSpells);
  const spellOf = (name) => {
    const g = groups.find(([, v]) => v.mChildSpells.some((c) => c.toLowerCase().endsWith('/' + name.toLowerCase())));
    const list = g ? g[1].mChildSpells : [];
    return Object.fromEntries(list.map((p) => [p.split('/').pop(), cd[p]?.mSpell ? trim(cd[p].mSpell) : cd[p]?.mBuff ? { buff: true } : null]));
  };
  const slots = dd.spells.map((s) => spellOf(s.id));
  // everything that isn't one of the four ability groups or a basic attack (passives, summons, markers)
  const inSlots = new Set(dd.spells.flatMap((sp) => Object.keys(spellOf(sp.id)).map((n) => n.toLowerCase())));
  const extras = {};
  for (const [k, v] of Object.entries(cd)) {
    const n = k.split('/').pop();
    if (!v.mSpell || inSlots.has(n.toLowerCase()) || /BasicAttack|CritAttack/i.test(n)) continue;
    const t = trim(v.mSpell);
    if (Object.keys(t.DataValues).length || Object.keys(t.calcs).length) extras[n] = t;
  }
  const out = {
    id, version: ver, sources: { text: 'Riot Data Dragon', numbers: 'CommunityDragon client export' },
    name: dd.name, title: dd.title, tags: dd.tags, resource: dd.partype, stats: dd.stats,
    basicAttack: { range: dd.stats.attackrange, attackSpeed: dd.stats.attackspeed, asRatio: rec.attackSpeedRatioModifiable, windup: rec.basicAttack?.mAttackDelayCastOffsetPercent },
    passive: { name: dd.passive.name, description: dd.passive.description, values: extras },
    spells: dd.spells.map((s, i) => ({
      slot: 'QWER'[i], name: s.name, description: s.description, tooltip: s.tooltip,
      ddCooldown: s.cooldown, ddCost: s.cost, ddRange: s.range, costType: s.costType.trim(), maxrank: s.maxrank,
      leveltip: s.leveltip, game: slots[i] ?? {},
    })),
  };
  writeFileSync(`src/champions/data/${id}.json`, JSON.stringify(out, null, 1));
  console.log(id, rec.spellNames.join(','), Object.keys(out.spells[0].game).join('|'));
}
