# Modeled mechanics

These rules come from publicly documented League of Legends behaviour (official patch notes, the community wiki and in-game observation). Numbers are simplified.

| System | Model |
| --- | --- |
| Damage reduction | `damage * 100 / (100 + armor or MR)`; true damage ignores resistances |
| Minion waves | First wave at 0:08, then every 30s; 3 melee + 3 casters per lane, a siege minion every 3rd wave; stats scale +4%/min |
| Minion targeting | Nearest enemy within 480 units; champions weighted as 260 units farther, so minions prefer minions |
| Minion damage to champions | 60% |
| Turret targeting | Keeps its target while in range, prefers minions, and switches for 2.5s to a champion that damages an allied champion inside its range |
| Turret damage to minions | Fixed % of max HP (melee 45%, caster 70%, siege 14%) |
| Structure order | Outer turret, then inner turret in the same lane; any inner turret down exposes the Nexus |
| Gold | 2/s passive; melee 21, caster 14, siege 60; kill 300, assist 150, turret 150 to the whole team |
| XP | Shared between enemy champions within 1400 units; level n needs `180 + 100n` XP; max level 18 |
| Respawn | `6 + 1.8 * level` seconds |
| Recall | 4s channel, interrupted by damage, movement or casting |
| Fountain | Heals allies 15% max HP/s and deals 1500 true damage/s to enemies |
| Ability haste | Cooldown `* 100 / (100 + haste)` |
| Summoners | Flash 425 units (180s), Heal 90 + 20/level and 30% move speed (150s) |
