# Body Business

A 2D ragdoll physics delivery puzzle: place a few devices, press RUN, and watch floppy employees get the parcel delivered (or not).

**Status: Phase 1, physics proof.** This build is the test room from the design brief: floor, walls, one parcel, one standard ragdoll employee, a spring pad and a rope, with a debug view, reset and an automated stress test. There are no levels, BUILD/RUN states or progression yet (that's Phase 2).

## Run it

Serve the folder and open `index.html`. Phaser is vendored in `lib/`, so the game works offline after the first load.

```bash
python3 -m http.server 8000
```

Add `?selftest` to the URL to run the stress test on load. Add `?vel` to draw velocity vectors in the debug view.

## Test room controls

| Key | Button | What it does |
| --- | --- | --- |
| mouse / touch | | Drag anything (employees, parcel, rope) |
| `R` | RESET | Rebuild the room from level data |
| `1` | DROP | Drop the employee from near the ceiling at a random angle |
| `2` | LAUNCH | Fling the employee in a random direction |
| `3` | ONTO SPRING | Put the employee above the spring pad |
| `4` | TIE ROPE | Tie / untie the rope's end to the employee |
| `E` | + EMPLOYEE | Add employees (up to 4), then clear the extras |
| `Q` | TYPE | Cycle archetypes: Standard, Heavy, Bouncy, Tiny, Floppy |
| `W` | WALK | Experimental walk (see risks below) |
| `P` / `Space` | PAUSE | Pause the simulation |
| `D` / `` ` `` | DEBUG | Body shapes, joints, contact points, limit hits, live stats |
| `T` | STRESS TEST | Run the Phase 1 stability gate |

## Technical decisions

- **Phaser 3.90 + Matter**, as the brief recommends. The repository was empty after the previous prototype was removed, so there was nothing to migrate. 3.90.0 is the last Phaser 3 release; it's vendored (`lib/`, MIT) instead of loaded from a CDN so the game stays playable offline. No build step; plain scripts under a `BB` namespace.
- **Fixed 60 Hz stepping, driven by the scene.** Matter's own runner is off; `TestRoom.update` calls `world.step(16.67)` from an accumulator. That keeps runs repeatable and lets the stress test run 30 steps per frame.
- **The ragdoll** (`src/ragdoll.js`) is 10 bodies: head, torso, upper and lower arms, thighs and shins. They're joined by zero-length pin constraints (stiffness 0.95, damping 0.1). All parts of one employee share a negative collision group, so a body never collides with itself; different employees, the parcel and the rope still collide with it. Rig geometry, joint limits, masses and archetypes are all data in `src/config.js`.
- **Joint limits.** Matter has no angle limits, so each step a capped spring-damper adds corrective relative spin when a joint is past its range. It works on velocity only and its torque is bounded, so a limb jammed against the floor can't shove the whole body along. Limits are measured around the middle of each range, so angles that wrap past ±π are pushed back to the nearest limit.
- **Velocity caps.** Every body is capped at 24 px/step (well under half the 60–80 px wall thickness, so nothing tunnels) and 0.4 rad/step of spin. Bodies that go NaN or leave the room are put back and counted (zero so far).
- **Rest and sleep.** A jointed Matter body never quite stops: constraint and contact corrections leak into velocity and it creeps a few px/s. Matter's built-in sleeping doesn't handle constraints. So:
  - A calm employee first gets extra air damping.
  - After 1 s it sleeps: its parts become static.
  - It wakes when the pointer grabs it, when a device launches it, or just before something moving reaches it, so the impact still sees its real mass.
  - It won't sleep with a strained joint.
  - Matter's cached correction impulses are cleared on sleep and wake; otherwise frozen parts drift apart.
- **Devices launch whole actors.** The spring pad sets the velocity of every part of an employee at once, so it never rips one limb off. Its direction and strength are always drawn (the orange arrow).
- **Level data** (`src/levels.js`): rooms are plain data (static geometry, spawns, devices), so Phase 2 levels reuse the same loader.

## Phase 1 gate: stress test results

The stress test runs 21 scripted scenarios: drops, 12 random launches, max-speed wall and ceiling slams, spring launches, rope tie/swing/untie, a pile of four employees plus the parcel, a 40-launch chaos run, sleeping-body interactions, every archetype, and the walk check. A scenario fails on:

- a NaN position;
- a body escaping the room;
- a joint pulled apart (more than 10 px for more than 12 steps);
- bodies or joints left over after a reset;
- actors that never come to rest.

Current results: **21/21 on 6 of the last 7 full runs**. Per scenario:

- **Joint gap:** worst 2.3 px. The Tiny archetype briefly reaches about 11 px on impacts, then recovers.
- **Resting pose:** at most about 0.4 rad past a joint limit.
- **Settling:** everything comes to rest within 2–7 s.
- **Cost:** about 1.5–2 ms per physics step with 4 employees, a parcel and the rope (51 bodies).

The one miss was a single chaos run that didn't settle in time. I couldn't reproduce it in 45 further chaos runs.

## Known risks and limits

- **Walking.** The experimental puppet walk keeps the torso upright and shuffles forward at about 26 px/s, but it's slow and sometimes tips over. If employees need to move on their own in Phase 2, this needs real tuning, or a different design (for example conveyors, slopes and devices doing the moving).
- **Tiny employees** have thin limbs, so joints visibly stretch for a moment on hard impacts.
- **A sleeping employee on a moving surface** (conveyors, moving platforms in Phase 2) needs those devices to wake what they touch. Not built yet.
- Tested in headless Chromium at 1280×720. Not yet tried on real phones.

## Next: Phase 2 (playable vertical slice), on approval

- BUILD / RUN / RESULT states, a delivery zone (parcel plus at least one employee, held briefly), fail on out of bounds or timeout.
- Conveyor belt device; placement, rotation and removal of devices inside legal build areas, with a budget counter.
- Six data-driven levels that teach spring, conveyor and rope one at a time, then combine them.
- One-click retry that keeps the layout; next-level flow; basic rewards.

## Project layout

```
index.html          page, test tray, debug panel, report
css/style.css       ink / teal / orange UI
lib/                Phaser 3.90.0 (MIT, see PHASER_LICENSE.md)
src/config.js       physics tuning, colours, archetypes, ragdoll rig, rest tracking
src/levels.js       level data (the test room)
src/art.js          textures drawn at boot (employee parts, parcel)
src/ragdoll.js      Employee: bodies, joints, soft limits, launch, rest assist, sleep / wake, walk
src/actors.js       Parcel, SpringPad, Rope
src/testroom.js     Phase 1 scene: build from data, fixed step, caps, wake rules, monitoring, drawing
src/stress.js       automated stability scenarios
src/ui.js           test tray, debug panel, stress report, keyboard
src/main.js         Phaser + Matter config
```
