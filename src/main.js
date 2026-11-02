'use strict';
/* =========================================================================
   Boot: Phaser 3 with Matter physics. The scene steps Matter itself at a
   fixed 60 Hz, so the world's own runner is switched off.
   ========================================================================= */

(() => {
  const params = new URLSearchParams(location.search);
  BB.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: BB.VIEW.w,
    height: BB.VIEW.h,
    backgroundColor: '#e4e8e4',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: BB.PHYS.gravity },
        enableSleeping: false,
        autoUpdate: false,
        // the debug view is built up front and toggled at runtime (D)
        debug: {
          showBody: true, showStaticBody: true, showJoint: true, showCollisions: true, showVelocity: params.has('vel'),
          renderFill: false, lineThickness: 1.5, lineColor: 0x1fa39a, staticLineColor: 0x1b2631,
          jointColor: 0xf28c3b, jointLineThickness: 2, collisionColor: 0xf28c3b,
        },
      },
    },
    scene: [BB.TestRoom],
  });
})();
