'use strict';
/* =========================================================================
   Level data. Rooms are plain data: static geometry, spawn points and
   devices. Phase 1 has a single test room; campaign levels arrive in
   Phase 2 using the same format plus a delivery zone and a build budget.
   ========================================================================= */

BB.LEVELS = {
  testRoom: {
    id: 'testRoom',
    name: 'Test Room',
    floorY: 650,
    // static geometry: centre x/y, size, optional angle (radians). Walls are thick on purpose.
    statics: [
      { kind: 'floor', x: 640, y: 700, w: 1400, h: 100 },
      { kind: 'wall', x: -10, y: 360, w: 80, h: 800 },
      { kind: 'wall', x: 1290, y: 360, w: 80, h: 800 },
      { kind: 'ceiling', x: 640, y: -10, w: 1400, h: 80 },
      { kind: 'shelf', x: 1085, y: 452, w: 250, h: 24 },
      // the ramp's top edge meets the floor flush (no lip for limbs to wedge into)
      { kind: 'ramp', x: 1150, y: 622, w: 240, h: 22, angle: -0.32 },
    ],
    employees: [{ x: 210, facing: 1, type: 'standard' }],
    parcel: { x: 330 },
    devices: [
      { type: 'spring', x: 520, angle: 0.32, power: 19 },   // angle 0 = straight up, + leans right
      { type: 'rope', x: 790, y: 30, length: 250, segments: 12 },
    ],
  },
};
