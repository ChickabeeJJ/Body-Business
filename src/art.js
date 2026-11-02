'use strict';
/* =========================================================================
   Art: every texture is drawn at boot with Phaser Graphics (no image
   files). Clean cartoon-industrial: ink outlines, flat fills, one accent.
   Employees: white shirt, orange tie, navy trousers, simple face.
   ========================================================================= */

(() => {
  const C = BB.COLORS;
  const OUT = 2;   // outline px (texture is padded by this on every side)

  function make(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return key;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g, OUT, OUT, w, h);
    g.generateTexture(key, w + OUT * 2, h + OUT * 2);
    g.destroy();
    return key;
  }
  function capsule(g, x, y, w, h, fill) {
    const r = Math.min(w, h) * 0.45;
    g.fillStyle(C.ink, 1); g.fillRoundedRect(x - OUT, y - OUT, w + OUT * 2, h + OUT * 2, r + OUT);
    g.fillStyle(fill, 1); g.fillRoundedRect(x, y, w, h, r);
  }

  // one texture per rig part (front and back share it; back parts get tinted)
  function part(scene, key, type) {
    const A = BB.ARCHETYPES[type] || BB.ARCHETYPES.standard;
    const base = key.replace(/[FB]$/, '');
    const id = 'bb_' + type + '_' + base;
    const R = BB.RIG.parts.find(p => p[0] === key);
    const [, shape, w, h] = R;
    if (shape === 'circle') {
      return make(scene, id, w * 2, w * 2, (g, x, y, W) => {
        const r = W / 2, cx = x + r, cy = y + r;
        g.fillStyle(C.ink, 1); g.fillCircle(cx, cy, r + OUT);
        g.fillStyle(C.skin, 1); g.fillCircle(cx, cy, r);
        // hair: a cap over the top and back
        g.fillStyle(C.hair, 1);
        g.slice(cx, cy, r, Math.PI * 0.95, Math.PI * 1.85, false); g.fillPath();
        // face looks right: eye, brow, ear
        g.fillStyle(C.ink, 1); g.fillCircle(cx + r * 0.42, cy - r * 0.05, r * 0.14);
        g.fillRect(cx + r * 0.22, cy - r * 0.38, r * 0.42, r * 0.1);
        g.fillStyle(0xd9a77f, 1); g.fillCircle(cx - r * 0.1, cy + r * 0.05, r * 0.2);
        g.fillStyle(C.ink, 1); g.fillRect(cx + r * 0.3, cy + r * 0.42, r * 0.36, r * 0.08);
      });
    }
    return make(scene, id, w, h, (g, x, y, W, Hh) => {
      if (base === 'torso') {
        capsule(g, x, y, W, Hh, A.shirt);
        // trousers waist and belt
        g.fillStyle(C.pants, 1); g.fillRoundedRect(x, y + Hh * 0.8, W, Hh * 0.2, { tl: 0, tr: 0, bl: 6, br: 6 });
        g.fillStyle(C.ink, 1); g.fillRect(x, y + Hh * 0.78, W, 2);
        // collar and tie (the orange accent)
        g.fillStyle(C.orange, 1);
        g.fillTriangle(x + W * 0.5, y + 2, x + W * 0.66, y + Hh * 0.12, x + W * 0.34, y + Hh * 0.12);
        g.fillTriangle(x + W * 0.42, y + Hh * 0.12, x + W * 0.58, y + Hh * 0.12, x + W * 0.5, y + Hh * 0.62);
        g.fillStyle(C.ink, 0.25); g.fillRect(x + W * 0.12, y + Hh * 0.42, W * 0.18, 2);
      } else if (base === 'uarm') {
        capsule(g, x, y, W, Hh, A.shirt);
      } else if (base === 'larm') {
        capsule(g, x, y, W, Hh, A.shirt);
        g.fillStyle(C.skin, 1); g.fillRoundedRect(x, y + Hh * 0.62, W, Hh * 0.38, 3);
      } else if (base === 'thigh') {
        capsule(g, x, y, W, Hh, C.pants);
      } else if (base === 'shin') {
        capsule(g, x, y, W, Hh, C.pants);
        g.fillStyle(C.ink, 1); g.fillRoundedRect(x - 1, y + Hh * 0.74, W + 2, Hh * 0.26 + 1, 3);
      }
    });
  }

  function parcel(scene) {
    const P = BB.PARCEL;
    return make(scene, 'bb_parcel', P.w, P.h, (g, x, y, W, Hh) => {
      g.fillStyle(C.ink, 1); g.fillRoundedRect(x - OUT, y - OUT, W + OUT * 2, Hh + OUT * 2, 4);
      g.fillStyle(C.box, 1); g.fillRoundedRect(x, y, W, Hh, 3);
      g.fillStyle(0xb98348, 1); g.fillRect(x, y + Hh - 5, W, 5);
      g.fillStyle(C.tape, 1); g.fillRect(x + W * 0.42, y, W * 0.16, Hh);
      g.fillStyle(0xf8f4ea, 1); g.fillRect(x + 4, y + 6, W * 0.28, Hh * 0.3);
      g.fillStyle(C.ink, 0.6); g.fillRect(x + 6, y + 9, W * 0.18, 2); g.fillRect(x + 6, y + 13, W * 0.12, 2);
    });
  }

  BB.Art = { part, parcel };
})();
