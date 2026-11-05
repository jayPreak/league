// Pulls official Riot Data Dragon data for the playable roster into src/champions/raw/.
import { mkdirSync, writeFileSync } from 'node:fs';
const IDS = ['MasterYi','Twitch','MonkeyKing','Yuumi','Naafiri','Irelia','Lux','Rengar','Garen','Ashe','Annie','Malphite','Ezreal','Jinx','Leona','Blitzcrank','Morgana','Zed','Darius','Ahri'];
const [ver] = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
mkdirSync('src/champions/raw', { recursive: true });
for (const id of IDS) {
  const j = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${id}.json`)).json();
  writeFileSync(`src/champions/raw/${id}.json`, JSON.stringify({ version: ver, ...j.data[id] }, null, 1));
}
console.log('done', ver);
