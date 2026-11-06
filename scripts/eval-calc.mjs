// node scripts/eval-calc.mjs Twitch E TwitchExpunge 3   -> evaluates every calc of that spell at that rank
// (transpiles src/champions/ref.ts on the fly; fake stats: level 9, AD 100 (40 bonus), AP 100, armor 60, HP 2000)
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync('src/champions/ref.ts', 'utf8').replace(/const files = import\.meta\.glob[\s\S]*?\n(export const REF[^\n]*\n)/, 'export const REF = {};\n');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const dir = mkdtempSync(join(tmpdir(), 'calc-'));
writeFileSync(join(dir, 'ref.mjs'), out);
const { evalCalc, UNSUPPORTED } = await import(join(dir, 'ref.mjs'));
const [champ, slot, key, rank = '3'] = process.argv.slice(2);
const c = JSON.parse(readFileSync(`src/champions/data/${champ}.json`, 'utf8'));
const g = slot === 'P' ? c.passive.values[key] : c.spells['QWER'.indexOf(slot)].game[key];
const s = { level: 9, ap: 100, ad: 100, bonusAd: 40, armor: 60, bonusArmor: 20, mr: 40, bonusMr: 10, maxHp: 2000, bonusHp: 700, hp: 1500, mana: 300, maxMana: 500 };
for (const name of Object.keys(g.calcs)) console.log(name.padEnd(28), +evalCalc(g, name, +rank, s).toFixed(3));
if (UNSUPPORTED.size) console.log('UNSUPPORTED:', [...UNSUPPORTED]);
