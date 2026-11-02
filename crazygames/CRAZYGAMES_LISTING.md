# Rag Sports: CrazyGames listing

## Title
Rag Sports

## Short description (one line)
A wobbly ragdoll sports hub: soccer, hoops, beach volley, boxing and javelin, one tap from the menu.

## Description
Rag Sports is a physics sports party where every athlete is an active ragdoll. Bodies wobble and stumble, slide tackles flatten people, knockouts send boxers flopping onto the canvas, and the ball bounces off every arm, leg and head, so headers, blocks and lucky deflections all happen for real.

Pick a sport from the hub and you're playing a second later. Score screamers and chips in 1v1 **Soccer**, drain threes and slam dunks in **Hoops**, set and spike on the sand in **Beach Volley**, trade jabs and haymakers over three rounds of **Boxing**, and time your run-up and release in the **Javelin** final.

Every sport has its own ladder, from Rookie to Pro, All-Star and Legend, with smarter and faster opponents at each step. Win coins, unlock new tiers and dress your athlete in the Locker with kit colours, headwear and a shirt number.

**Features**
- 5 sports with active ragdoll physics: soccer, basketball, beach volleyball, boxing and javelin
- Instant play: one tap from the sports hub into a match, instant rematch
- A Rookie to Legend ladder in every sport, with AI that gets better each tier
- Slide tackles, headers, chips, dunks, steals, spikes, digs, uppercuts and fouls
- Cosmetic Locker: 11 kit colours, 10 headwear items and shirt numbers
- Full desktop and mobile touch controls
- No ads

## Controls

**Desktop**
- A / D or arrow keys: move
- W / Space / Up: jump
- J / left click: action (kick, shoot, hit, punch, throw)
- K / right click: second action (slide, shove, dive, block)
- Hold S / Down: modifier (chip, set, uppercut)
- P: pause (Esc also opens and closes the pause menu)

**Mobile**
- Left joystick: move (pull down for the modifier)
- Right buttons: action, second action, jump

## Tags
Suggested (pick the ones the portal offers):
`ragdoll`, `physics`, `sports`, `soccer`, `basketball`, `volleyball`, `boxing`, `funny`, `2d`, `mobile`, `1 player`

**Category:** Sports

## SDK features used
- `SDK.init`, `game.loadingStart` / `game.loadingStop`
- `game.gameplayStart` / `game.gameplayStop` (match start and resume; pause, match end and menus)
- `game.happytime` (wins, new tiers, personal bests)
- `data` module for saves (progress follows logged-in players; no login needed to play)
- `game.settings.muteAudio` with `addSettingsChangeListener`
- No ad calls of any kind (no midgame, rewarded or banner ads)

## Assets (in this folder)

| File | Size | Use |
| --- | --- | --- |
| `cover-landscape-1920x1080.png` | 1920×1080 (16:9) | Landscape cover |
| `cover-portrait-800x1200.png` | 800×1200 (2:3) | Portrait cover |
| `cover-square-800x800.png` | 800×800 (1:1) | Square cover |

All three are rendered from the game itself.
