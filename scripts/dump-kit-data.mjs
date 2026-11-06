// prints the data keys available to kits: node scripts/dump-kit-data.mjs Lux Zed
import { readFileSync } from 'node:fs';
const fmt = (a) => (a.length > 4 ? a.slice(1, 6) : a).map((x) => +x.toFixed(3)).join('/');
for (const id of process.argv.slice(2)) {
  const c = JSON.parse(readFileSync(`src/champions/data/${id}.json`, 'utf8'));
  console.log(`\n=== ${c.name}  P: ${c.passive.name}`);
  const show = (tag, g) => {
    if (!g || !g.DataValues) return;
    console.log(`  [${tag}] dv: ` + Object.entries(g.DataValues).map(([k, v]) => `${k}=${fmt(v)}`).join(' '));
    const cs = Object.keys(g.calcs || {});
    if (cs.length) console.log(`  [${tag}] calcs: ` + cs.join(' '));
    if (g.missileSpeed || g.lineWidth || g.castRadius) console.log(`  [${tag}] speed=${g.missileSpeed} width=${g.lineWidth} radius=${g.castRadius?.[1]}`);
  };
  for (const [k, g] of Object.entries(c.passive.values || {})) show('P:' + k, g);
  for (const s of c.spells) for (const [k, g] of Object.entries(s.game)) show(s.slot + ':' + k, g);
}
