# Rift Clash

A 3v3 browser MOBA modeled on the lane-pushing mechanics of League of Legends. Plain TypeScript + Canvas, built with Vite.

This is an original game: the champions, abilities, items, art and code are all new. It contains no Riot Games code, assets, names or data. Mechanics were modeled from publicly documented game behaviour; see [docs/MECHANICS.md](docs/MECHANICS.md).

## Play

- **Right or left click**: move or attack (hold to keep moving)
- **Q W E R**: abilities, cast at the cursor (R unlocks at level 6)
- **D** Flash · **F** Heal · **B** Recall · **S** Stop
- **P**: shop (in your fountain only) · **Y**: camera lock · **Space**: center camera · **wheel**: zoom
- Minimap: click to move (or pan when the camera is unlocked)

You play mid lane on Blue. AI bots play top and bot for you, and all three Red champions are AI. Destroy an inner turret to expose the enemy Nexus, then destroy it to win.

## Develop

```bash
npm install
npm run dev
npm run build
```
