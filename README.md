# Rift Clash

A 3v3 browser MOBA modeled on the lane-pushing mechanics of League of Legends. Plain TypeScript + Canvas, built with Vite.

This is an original game: the champions, abilities, items, art and code are all new. It contains no Riot Games code, assets, names or data. Mechanics were modeled from publicly documented game behaviour; see [docs/MECHANICS.md](docs/MECHANICS.md).

## Play

- **Right or left click**: move or attack (hold to keep moving)
- **Q W E R**: abilities, cast at the cursor (R unlocks at level 6)
- **D** Flash · **F** Heal · **B** Recall · **S** Stop · **M** mute
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

## Feel and effects

Effects follow a small set of rules (see `src/fx.ts`):

- **Layered, tiered feedback**: hits get directional sparks, a squash and a damage number that pops with overshoot; kills, turrets and the Nexus step up to bursts, debris, screen shake and a short hit-stop. Big moments get banners (First Blood, Double Kill, turret destroyed) and the Nexus explodes in slow motion.
- **Trauma screen shake**: events add trauma, shake is `trauma²` driven by summed sines, and it always decays to rest.
- **Anticipation**: attacks lunge toward the target, dashes leave afterimages, cooldowns glow when ready, health bars show a lagging damage chunk.
- **Cheap to draw**: pooled particles with a cap (lower on touch devices), cached glow sprites instead of `shadowBlur`, only the visible part of the map is drawn, and the low-health vignette is a CSS layer that only changes opacity.
- **Reduced motion**: follows the OS setting and can be toggled on the menu; it removes shake, hit-stop and slow motion, halves particles and drops UI movement while keeping the information.

A live all-bot match plays behind the main menu.

## Sound

All sound is synthesized at runtime with the Web Audio API (`src/audio.ts`); there are no audio files. Each effect is built from a pitched oscillator and filtered noise, with slight random pitch so repeats don't drone. World sounds are panned and faded by their position relative to the camera, each sound has a minimum replay gap, and the total number of voices is capped. The bot match behind the menu stays silent. Toggle sound with **M** or the Sound button (remembered in the browser).

## 3D

The match renders in 3D with Three.js: an orthographic camera tilted 56° like a MOBA camera, a painted ground texture, instanced jungle trees, rocks and brush, an animated river, and turrets, Nexus and fountains built from primitives. Ground decals (telegraphs, range rings, selection circles) are painted on a canvas laid on the ground under the units; health bars, numbers and air effects sit on a 2D overlay.

Characters are the free **CC0** [KayKit Adventurers and Skeletons packs by Kay Lousberg](https://kaylousberg.com): Mage, Barbarian and Rogue for the champions, skeleton warriors, mages and brutes for team-coloured minions. All share one rig, so `scripts/prune-models.mjs` ships the meshes without animations plus two small clip libraries (1.8 MB total, meshopt-compressed). No Riot assets are used.

## Co-op multiplayer (PvE)

Up to 3 players team up on Blue against Red bots.

1. One player picks a champion and clicks **Create co-op lobby**. They get a 5-letter code and a **Copy invite link** button.
2. Friends type the code and click **Join**, or just open the invite link (`?lobby=CODE`).
3. Everyone picks a champion. The host chooses the difficulty and clicks **Start match**. Empty slots are filled by bots.

How it works: the host's browser runs the whole match. Guests connect to it directly over WebRTC (PeerJS; the lobby code is the host's id on the free PeerJS signalling server, so there is no game server). Guests send their inputs as commands, and the host sends a snapshot of the match 15 times a second, along with the sounds, particles and announcements it made. If a guest leaves, a bot takes over their champion; if the host leaves, the match ends for everyone. The host should keep the game tab in front: a background tab only updates about once a second.

## LoL systems

Mana with per-ability costs, ability ranks (one point per level, R at 6/11/16; **Ctrl+Q/W/E/R** or the **+** button), inhibitors that respawn after 150 seconds, two Nexus turrets, and super minions in a lane whose enemy inhibitor is down.
