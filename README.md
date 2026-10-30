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
