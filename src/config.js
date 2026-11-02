'use strict';
/* =========================================================================
   Body Business: tunable data. Physics values, colours, employee
   archetypes and the ragdoll rig all live here so they can be tuned
   without touching gameplay code.
   ========================================================================= */

window.BB = window.BB || {};

BB.VIEW = { w: 1280, h: 720 };

BB.PHYS = {
  gravity: 1.05,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 6,
  // per-step caps (Matter velocities are px per 60 Hz step). maxSpeed stays well under
  // half the thinnest static wall (60 px) so nothing tunnels through the room.
  maxSpeed: 24,
  maxAngularSpeed: 0.4,
  joint: { stiffness: 0.95, damping: 0.1 },
  limitStiffness: 0.5,      // corrective spin per step, per radian past a joint limit
  limitDamping: 0.6,        // share of outward relative spin removed while past a limit
  limitMaxTorque: 0.25,     // cap on the corrective spin added per step (keeps a jammed limb from shoving the body)
  limitSlack: 0.08,         // radians a joint may rest past its limit before it is pushed back
  frictionStatic: 1.5,      // Matter's static friction multiplier (resting bodies are held by sleep, not by sticky friction)
  breakError: 10,           // px a joint may drift apart before we call it broken
  restAssistSpeed: 0.9,     // px/step: below this for restAssistDelay s, an employee gets extra air damping
  restAssistDelay: 0.4,
  restAssistAir: 0.12,
  sleepDelay: 1.0,          // s of calm before an employee sleeps (its parts turn static until disturbed)
  sleepMaxJointError: 2,    // px: an employee with a strained joint is not allowed to sleep
  wakeSpeed: 1.2,           // px/step: a moving body hitting a sleeping employee faster than this wakes it
  // "settled" = every body moved less than settleMove px and turned less than settleTurn
  // over the last settleTime seconds (velocity alone is noisy for resting Matter bodies)
  settleMove: 2,
  settleTurn: 0.05,
  settleTime: 0.75,
};

/* rest tracking shared by every actor: compare each body with where it was settleTime ago */
BB.trackRest = (actor, dt) => {
  const P = BB.PHYS;
  actor.restClock = (actor.restClock || 0) + dt;
  if (actor.restClock < P.settleTime / 3) return;
  actor.restClock = 0;
  const now = actor.bodies.map(b => [b.position.x, b.position.y, b.angle]);
  const hist = actor.restHist || (actor.restHist = []);
  hist.push(now);
  if (hist.length > 4) hist.shift();
  if (hist.length < 4) { actor.restOK = false; return; }
  const old = hist[0];
  actor.restOK = now.every((p, i) => old[i] && Math.hypot(p[0] - old[i][0], p[1] - old[i][1]) < P.settleMove && Math.abs(p[2] - old[i][2]) < P.settleTurn);
};
BB.resetRest = actor => { actor.restHist = []; actor.restOK = false; actor.restClock = 0; };

BB.CAT = { STATIC: 0x0001, EMPLOYEE: 0x0002, PARCEL: 0x0004, ROPE: 0x0008, SENSOR: 0x0010 };

BB.COLORS = {
  ink: 0x1b2631, ink2: 0x2a3846, teal: 0x1fa39a, tealHi: 0x5fd6cb, orange: 0xf28c3b, orangeHi: 0xffb26b,
  wall: 0xe4e8e4, wall2: 0xd6dcd8, shirt: 0xf6f3ec, skin: 0xf0c49c, pants: 0x2f4058, hair: 0x2a2018,
  box: 0xd29a5c, tape: 0xeccb8e, rope: 0xb48a5a,
};

/* employee archetypes (Phase 1 tunes Standard; the others are here to stress the rig) */
BB.ARCHETYPES = {
  standard: { name: 'Standard', scale: 1, density: 1, restitution: 0.04, friction: 0.7, frictionAir: 0.012, limitScale: 1, jointStiffness: 0.95, shirt: 0xf6f3ec },
  heavy: { name: 'Heavy', scale: 1.14, density: 2.4, restitution: 0.02, friction: 0.85, frictionAir: 0.01, limitScale: 0.9, jointStiffness: 0.95, shirt: 0xc9d6e6 },
  bouncy: { name: 'Bouncy', scale: 1, density: 0.9, restitution: 0.72, friction: 0.4, frictionAir: 0.008, limitScale: 1, jointStiffness: 0.95, shirt: 0xffe08a },
  tiny: { name: 'Tiny', scale: 0.7, density: 0.85, restitution: 0.06, friction: 0.7, frictionAir: 0.014, limitScale: 1, jointStiffness: 0.95, shirt: 0xbfe8d6 },
  floppy: { name: 'Floppy', scale: 1, density: 0.9, restitution: 0.05, friction: 0.6, frictionAir: 0.01, limitScale: 1.6, jointStiffness: 0.8, shirt: 0xf3c6d8 },
};

/* The rig, facing right, in px with the hips at (0, 0). Feet end at y = 44. The back arm and leg
   sit a few px off the front ones so a standing employee reads as two legs and two arms.
   Parts: [key, shape, w (or r), h, centre x, centre y, density multiplier, depth]
   Joints: [parent, child, joint x, joint y, minAngle, maxAngle] (child angle relative to parent;
   positive = clockwise on screen, so for a right-facing body a positive knee bends the foot back). */
BB.RIG = {
  feet: 44,
  parts: [
    ['thighB', 'rect', 11, 28, -4, 5, 1, 1],
    ['shinB', 'rect', 10, 28, -4, 30, 1, 1],
    ['uarmB', 'rect', 9, 24, 4, -31, 0.9, 2],
    ['larmB', 'rect', 8, 22, 4, -10, 0.8, 2],
    ['torso', 'rect', 26, 44, 0, -24, 1.4, 3],
    ['thighF', 'rect', 11, 28, 0, 5, 1, 4],
    ['shinF', 'rect', 10, 28, 0, 30, 1, 4],
    ['head', 'circle', 13, 0, 0, -60, 1.1, 5],
    ['uarmF', 'rect', 9, 24, 0, -31, 0.9, 6],
    ['larmF', 'rect', 8, 22, 0, -10, 0.8, 6],
  ],
  joints: [
    ['torso', 'head', 0, -46, -0.55, 0.55],
    ['torso', 'uarmF', 0, -40, -3.0, 1.5],
    ['torso', 'uarmB', 4, -40, -3.0, 1.5],
    ['uarmF', 'larmF', 0, -20, -2.5, 0.05],
    ['uarmB', 'larmB', 4, -20, -2.5, 0.05],
    ['torso', 'thighF', 0, -6, -2.0, 0.6],
    ['torso', 'thighB', -4, -6, -2.0, 0.6],
    ['thighF', 'shinF', 0, 18, -0.05, 2.4],
    ['thighB', 'shinB', -4, 18, -0.05, 2.4],
  ],
};

BB.PARCEL = { w: 36, h: 30, density: 0.0016, friction: 0.8, frictionAir: 0.01, restitution: 0.08 };
