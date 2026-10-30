# Rift Clash

A 3v3 browser MOBA modeled on the lane-pushing mechanics of League of Legends. Plain TypeScript + Canvas, built with Vite.

This is an original game: the champions, abilities, items, art and code are all new. It contains no Riot Games code, assets, names or data. Mechanics were modeled from publicly documented game behaviour; see [docs/MECHANICS.md](docs/MECHANICS.md).

## Play

- **Right or left click**: move or attack (hold to keep moving)
- **Q W E R**: abilities, cast at the cursor (R unlocks at level 6)
- **D** Flash · **F** Heal · **B** Recall · **S** Stop
- **P**: shop (in your fountain only) · **Y**: camera lock · **Space**: center camera · **wheel**: zoom
- Minimap: click to move (or pan when the camera is unlocked)

### Mobile (touch)

Touch devices get a twin-stick layout modeled on Wild Rift's public control scheme (open `?touch=1` to force it on desktop):

- **Left thumb**: drag anywhere on the left side for a floating move joystick; let go to stop
- **ATTACK**: attacks the nearest enemy, champions first; hold to keep attacking. **Minion** and **Turret** buttons target only that type
- **Abilities** (arced around ATTACK): tap to quick-cast at the best nearby target, drag to aim, drag onto **✕** to cancel
- **Flash / Heal** above the arc; **Shop** and **Recall** under the minimap
- Landscape recommended; the game asks for fullscreen and landscape lock where the browser allows it

You play mid lane on Blue. AI bots play top and bot for you, and all three Red champions are AI. Destroy an inner turret to expose the enemy Nexus, then destroy it to win.

Pick **Easy**, **Normal** or **Hard** on the menu. Difficulty only tunes the Red bots: how much HP lead they want before fighting, how fast they react, how often they use abilities, and their damage and gold. Your choice is remembered in the browser.

## Develop

```bash
npm install
npm run dev
npm run build
```
