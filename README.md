# Rag Sports

A physics ragdoll **sports hub**. Every athlete is an **active ragdoll** (the same rig as [Element Rag](https://github.com/ChickabeeJJ/Elements)): a verlet skeleton held upright by muscle springs, so bodies wobble, stumble, get flattened by a slide tackle and pick themselves back up. Balls bounce off every bone, so headers, chest traps, blocked shots and lucky deflections all just happen.

Five sports, one tap from the hub into a match, no logins and **no ads**. It's pure HTML5 and vanilla JS with no build step and no dependencies. All art is drawn procedurally and every sound is synthesized.

To play locally, serve the folder (for example `python3 -m http.server`) and open `index.html`.

## Sports

| Sport | Format | Action | Second action | Hold DOWN |
| --- | --- | --- | --- | --- |
| **Soccer** | 1v1, first to 5 or most goals in 90 s (a draw goes to golden goal) | KICK: hold for power; facing the goal it aims itself | SLIDE tackle | chip |
| **Hoops** | 1v1 full court, most points in 90 s (a tie goes to "next basket wins") | SHOOT: hold and release in the green zone; jump + SHOOT near the rim to dunk; without the ball it swipes for a steal | SHOVE (with the ball: a crossover burst) | |
| **Volley** | 1v1 beach volleyball, first to 7 | HIT: bumps it over; in the air near the net it spikes | DIVE to dig a ball out | set it up high by the net |
| **Boxing** | Best of three 45 s rounds, knockout or points | PUNCH: tap to jab, hold for a haymaker | BLOCK (hold) | uppercut |
| **Javelin** | Three throws against five rivals' marks | THROW: tap to start the run-up, then hold to raise the angle and release before the line | | |

Shots from behind the 3PT stripe are worth 3. In volley, a ball that lands inside the lines scores for the other side; a ball hit out scores against whoever touched it last. In javelin the sweet spot is around 40-46 degrees (the green band on the gauge), a longer run-up adds distance, wind changes every throw, and stepping over the line is a foul (with a tumble).

## The hub and progression

- **PLAY** starts the selected sport straight away. Hovering a sport card switches the live AI-vs-AI match behind the menu to that sport; clicking a card plays it. **RANDOM** picks another sport.
- Every sport has a four-tier ladder: **Rookie, Pro, All-Star, Legend**. Winning a tier unlocks the next one (and pays a bonus). The pips on each card show the ladder; click an unlocked pip to pick that tier. In javelin, gold counts as a win; silver and bronze pay part of the coins.
- AI opponents get faster, react sooner, aim better, defend smarter and play more aggressively with each tier.
- Matches pay **coins** (more for higher tiers and wins). Spend them in the **Locker** on kit colours and headwear, and pick a shirt number. Everything is cosmetic.
- After a match: Enter / Space or the yellow button goes straight to the next tier or a rematch. There's also a one-tap button to the next sport, and one back to the hub.
- **Records** lists wins, losses, ladder progress and your javelin best. Each first tier unlock is a trophy.
- First time in each sport, a short controls hint shows over the match (no tutorial screens).

## Controls

| Desktop | Action |
| --- | --- |
| `A` / `D` (or arrows) | Move |
| `W` / `Space` / `Up` | Jump |
| `J` / left click (or `F` / `Enter`) | Action (kick, shoot, hit, punch, throw) |
| `K` / right click (or `L` / `Shift`) | Second action (slide, shove, dive, block) |
| hold `S` / `Down` | Modifier (chip, set, uppercut) |
| `P` (or `Esc`) | Pause |

On touch screens a floating joystick on the left moves (pull it down for the modifier) and the action, second action and jump buttons sit on the right. Small screens zoom the camera in and follow the play.

## CrazyGames

The CrazyGames HTML5 SDK v3 is always included and every call is guarded, so the game also runs offline or on any other host (progress then falls back to `localStorage`).

- `init` is awaited first, then `loadingStart` / `loadingStop` wrap the boot.
- `gameplayStart` when a match starts or resumes, `gameplayStop` on pause, at the end of a match and in menus.
- `happytime` on a win, a new tier or a javelin personal best.
- Saves go through the **data** module, so progress follows a logged-in player. Accounts are never required.
- The platform's **mute** setting overrides the in-game sound toggles.
- **No ads of any kind**: the game never requests a midgame, rewarded ad or banner (`js/platform.js` has no ad code at all).

Listing text and three covers are in `crazygames/` (see `crazygames/CRAZYGAMES_LISTING.md`).

## Project layout

```
index.html
css/style.css        UI: ink panels with cut corners, sport cards, scoreboard, touch orbs
js/util.js           math, seeded RNG, glow sprite cache
js/platform.js       CrazyGames SDK v3 wrapper: events, data, settings (no ads)
js/audio.js          synthesized SFX, crowd bed and a light looping groove
js/progress.js       save data: coins, per-sport ladders, records, locker
js/ragdoll.js        Athlete: active ragdoll, sport poses, tumble/recover, kits and headwear
js/physics.js        Ball: ground, walls, rims, nets and per-bone ragdoll collisions
js/fx.js             particles, rings, confetti, dust, score text
js/arenas.js         venues: stadium, indoor court, beach, boxing hall, athletics track, live crowd
js/sports/base.js    match flow (intro, play, point, over), tiers, AI helpers
js/sports/*.js       soccer, hoops, volley, boxing, javelin
js/game.js           canvas, camera, fixed-step loop, input routing, rendering
js/icons.js          UI, sport and action icons
js/ui.js             sports hub, HUD, touch controls, pause / result sheets, locker, records, settings
js/main.js           boot, loop, keyboard / mouse
assets/fonts/        Rubik (SIL Open Font License)
crazygames/          listing text and covers
```

### Adding a sport

Create `js/sports/<id>.js` with a class extending `Sport` (see `base.js`): set `groundY` and an `arena` look, build athletes with `makeAthlete`, and implement `reset`, `tick`, `ai`, `press` / `release`, `draw`, `hud` and `result`. Register it as `SPORTS.<id> = { id, name, color, icon, blurb, controls, hint, create }`, add the script to `index.html` and the id to `ORDER` in `js/ui.js`.

## Credits

Font: [Rubik](https://fonts.google.com/specimen/Rubik) by Hubert and Fischer, under the SIL Open Font License 1.1.
