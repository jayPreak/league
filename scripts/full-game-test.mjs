import puppeteer from 'puppeteer-core';
import { appendFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2]; const only = process.argv[3] ? process.argv[3].split(',') : null; const CAP = +(process.argv[4] || 1500);
writeFileSync(OUT, '');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000, defaultViewport: { width: 900, height: 600 }, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
const ids = only ?? await page.evaluate(() => window.__rift.CHAMPS.map((c) => c.id));
for (const id of ids) {
  errs.length = 0;
  const t0 = Date.now();
  const r = await page.evaluate((id, CAP) => {
    const R = window.__rift;
    try {
      R.newGame(id);
      const G = R.G, P = G.player, c = P.champ;
      c.isPlayer = false; // the champion plays itself through the bot AI
      let casts = 0; const prev = [0, 0, 0, 0]; let bad = null;
      const maxSteps = CAP * 30;
      for (let i = 0; i < maxSteps && G.over === null; i++) {
        R.update(1 / 30);
        for (let s = 0; s < 4; s++) { if (c.cds[s] > prev[s] + 0.5) casts++; prev[s] = c.cds[s]; }
        if (i % 30 === 0) for (const u of G.units) if (u.champ && (!isFinite(u.hp) || !isFinite(u.x) || !isFinite(u.y) || !isFinite(u.ad) || !isFinite(u.maxHp))) { bad = 'NaN ' + u.champ.def.id; break; }
        if (bad) break;
      }
      const ms = c.ms;
      return { id, name: c.def.name, over: G.over, t: Math.round(G.t), bad, kda: [c.kills, c.deaths, c.assists].join('/'), cs: c.cs, lvl: c.level, items: c.items.length, spent: c.itemLog.length, casts, dmg: Math.round(ms.pc + ms.mc + ms.tc), taken: Math.round(ms.taken), gold: Math.round(ms.gold), ranks: c.ranks.join(''), teamKills: G.kills.join('-'), approx: !!c.def.approx };
    } catch (e) { return { id, crash: String(e && e.stack || e).slice(0, 300) }; }
  }, id, CAP);
  r.err = errs.slice(0, 2); r.wall = Math.round((Date.now() - t0) / 1000);
  appendFileSync(OUT, JSON.stringify(r) + '\n');
  console.log(r.id, r.over, r.t, r.kda, 'dmg', r.dmg, 'casts', r.casts, 'items', r.items, r.crash ?? r.bad ?? '', r.wall + 's');
}
await browser.close();
