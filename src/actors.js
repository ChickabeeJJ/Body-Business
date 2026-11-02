'use strict';
/* =========================================================================
   Parcel and devices.
   - Parcel: one rigid box, the thing that has to be delivered.
   - SpringPad: a static base with a sensor plate. Anything that lands on
     it is launched as a whole along the pad's arrow (direction and
     strength are always drawn, so nothing is a hidden force).
   - Rope: a chain of light segments hanging from an anchor. It collides
     with employees and the parcel, and its end can be tied to a body.
   ========================================================================= */

(() => {
  const M = Phaser.Physics.Matter.Matter;
  const C = BB.COLORS;

  class Parcel {
    constructor(scene, x, y) {
      this.scene = scene;
      this.kind = 'parcel';
      this.launchCd = 0;
      const P = BB.PARCEL;
      this.img = scene.matter.add.image(x, y, BB.Art.parcel(scene), null, {
        label: 'parcel', shape: { type: 'rectangle', width: P.w, height: P.h }, chamfer: { radius: 3 },
        density: P.density, friction: P.friction, frictionStatic: BB.PHYS.frictionStatic, frictionAir: P.frictionAir, restitution: P.restitution,
        collisionFilter: { category: BB.CAT.PARCEL, mask: BB.CAT.STATIC | BB.CAT.EMPLOYEE | BB.CAT.PARCEL | BB.CAT.ROPE | BB.CAT.SENSOR },
      });
      this.img.setDepth(20);
      this.body = this.img.body;
      this.body.bbActor = this;
    }
    get bodies() { return [this.body]; }
    get center() { return this.body.position; }
    beforeStep(dt) { this.launchCd = Math.max(0, this.launchCd - dt); }
    afterStep(dt) { BB.trackRest(this, dt); }
    get settled() { return !!this.restOK; }
    jointError() { return 0; }
    launch(vx, vy, spin = 0) { M.Body.setVelocity(this.body, { x: vx, y: vy }); M.Body.setAngularVelocity(this.body, spin); BB.resetRest(this); }
    moveTo(x, y, angle = 0) { M.Body.setPosition(this.body, { x, y }); M.Body.setAngle(this.body, angle); this.launch(0, 0); }
    destroy() { this.img.destroy(); }
  }

  class SpringPad {
    constructor(scene, d, floorY) {
      this.scene = scene;
      this.type = 'spring';
      this.x = d.x; this.y = floorY; this.angle = d.angle || 0; this.power = d.power || 18;
      this.w = 66;
      this.squash = 0;     // 0..1 plate animation
      this.fired = 0;
      // the base is solid; the plate above it is a sensor that triggers launches
      const ox = Math.sin(this.angle), oy = -Math.cos(this.angle);
      this.base = scene.matter.add.rectangle(this.x, this.y - 9, this.w, 18, {
        isStatic: true, label: 'spring:base', angle: this.angle, chamfer: { radius: 4 },
        collisionFilter: { category: BB.CAT.STATIC, mask: 0xffff },
      });
      this.plate = scene.matter.add.rectangle(this.x + ox * 22, this.y - 9 + oy * 22, this.w - 6, 22, {
        isStatic: true, isSensor: true, label: 'spring:plate', angle: this.angle,
        collisionFilter: { category: BB.CAT.SENSOR, mask: BB.CAT.EMPLOYEE | BB.CAT.PARCEL },
      });
      this.plate.bbDevice = this;
      this.g = scene.add.graphics().setDepth(5);
    }
    get dir() { return { x: Math.sin(this.angle), y: -Math.cos(this.angle) }; }
    // something touched the plate
    trigger(actor) {
      if (!actor || actor.launchCd > 0 || actor.asleep) return;
      const d = this.dir, p = this.power;
      actor.launch(d.x * p, d.y * p, actor.kind === 'employee' ? 0.04 * Math.sign(d.x || 1) : 0.08);
      actor.launchCd = 0.45;
      this.squash = 1;
      this.fired++;
      this.scene.onImpact && this.scene.onImpact(this.x, this.y - 20, 0.6, 'spring');
    }
    update(dt) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const g = this.g; g.clear();
      const ext = 18 + Math.sin((1 - this.squash) * Math.PI) * 14 * (this.squash > 0 ? 1 : 0);
      g.save();
      g.translateCanvas(this.x, this.y); g.rotateCanvas(this.angle);
      // base
      g.fillStyle(C.ink, 1); g.fillRoundedRect(-this.w / 2, -18, this.w, 18, 4);
      g.fillStyle(C.ink2, 1); g.fillRect(-this.w / 2 + 4, -14, this.w - 8, 4);
      // coil
      g.lineStyle(4, C.teal, 1); g.beginPath();
      const n = 5, top = -18 - ext;
      g.moveTo(-14, -18);
      for (let i = 1; i <= n; i++) g.lineTo(i % 2 ? 14 : -14, -18 - (ext * i) / n);
      g.strokePath();
      // plate
      g.fillStyle(C.ink, 1); g.fillRoundedRect(-this.w / 2 - 2, top - 9, this.w + 4, 11, 5);
      g.fillStyle(C.teal, 1); g.fillRoundedRect(-this.w / 2, top - 7, this.w, 7, 4);
      g.restore();
      // launch arrow: direction and strength, always visible
      const d = this.dir, L = 30 + this.power * 3.2, sx = this.x + d.x * 46, sy = this.y + d.y * 46;
      const ex = sx + d.x * L, ey = sy + d.y * L;
      g.lineStyle(4, C.orange, 0.85); g.lineBetween(sx, sy, ex, ey);
      const a = Math.atan2(d.y, d.x);
      g.fillStyle(C.orange, 0.9);
      g.fillTriangle(ex + Math.cos(a) * 10, ey + Math.sin(a) * 10, ex + Math.cos(a + 2.4) * 10, ey + Math.sin(a + 2.4) * 10, ex + Math.cos(a - 2.4) * 10, ey + Math.sin(a - 2.4) * 10);
    }
    destroy() { const w = this.scene.matter.world; w.remove(this.base); w.remove(this.plate); this.g.destroy(); }
  }

  class Rope {
    constructor(scene, d) {
      this.scene = scene;
      this.type = 'rope';
      this.ax = d.x; this.ay = d.y;
      this.n = d.segments || 12;
      this.segLen = d.length / this.n;
      this.segs = []; this.links = [];
      this.tie = null;
      const group = scene.matter.world.nextGroup(true);
      const filter = { group, category: BB.CAT.ROPE, mask: BB.CAT.STATIC | BB.CAT.EMPLOYEE | BB.CAT.PARCEL };
      for (let i = 0; i < this.n; i++) {
        const b = scene.matter.add.rectangle(this.ax, this.ay + this.segLen * (i + 0.5), 6, this.segLen, {
          label: 'rope', density: 0.0012, friction: 0.9, frictionAir: 0.02, restitution: 0, chamfer: { radius: 3 }, collisionFilter: filter,
        });
        b.bbRope = this;
        this.segs.push(b);
      }
      const h = this.segLen / 2, st = 0.95;
      this.links.push(scene.matter.add.worldConstraint(this.segs[0], 0, st, { pointA: { x: this.ax, y: this.ay }, pointB: { x: 0, y: -h }, damping: 0.05, label: 'rope:anchor' }));
      for (let i = 1; i < this.n; i++) {
        this.links.push(scene.matter.add.constraint(this.segs[i - 1], this.segs[i], 0, st, { pointA: { x: 0, y: h }, pointB: { x: 0, y: -h }, damping: 0.05, label: 'rope:link' }));
      }
      this.g = scene.add.graphics().setDepth(8);
    }
    // ends of a segment in world space (bottom = towards the free end)
    bottomOf(b) { const h = this.segLen / 2; return { x: b.position.x - Math.sin(b.angle) * h, y: b.position.y + Math.cos(b.angle) * h }; }
    topOf(b) { const h = this.segLen / 2; return { x: b.position.x + Math.sin(b.angle) * h, y: b.position.y - Math.cos(b.angle) * h }; }
    get end() { return this.bottomOf(this.segs[this.n - 1]); }
    // tie the free end to a body's centre; the link starts at the current gap and reels in
    tieTo(body) {
      this.untie();
      if (body.bbActor) { body.bbActor.wake && body.bbActor.wake(); body.bbActor.tethered = true; }
      const last = this.segs[this.n - 1], e = this.end, h = this.segLen / 2;
      const gap = Math.hypot(e.x - body.position.x, e.y - body.position.y);
      this.tie = this.scene.matter.add.constraint(last, body, gap, 0.5, { pointA: { x: 0, y: h }, pointB: { x: 0, y: 0 }, damping: 0.1, label: 'rope:tie' });
      this.tiedBody = body;
    }
    untie() {
      if (!this.tie) return;
      if (this.tiedBody && this.tiedBody.bbActor) this.tiedBody.bbActor.tethered = false;
      this.scene.matter.world.removeConstraint(this.tie); this.tie = null; this.tiedBody = null;
    }
    update(dt) {
      if (this.tie && this.tie.length > 0) this.tie.length = Math.max(0, this.tie.length - dt * 120);
      const g = this.g; g.clear();
      const pts = [{ x: this.ax, y: this.ay }];
      for (const b of this.segs) pts.push(this.bottomOf(b));
      // anchor plate
      g.fillStyle(C.ink, 1); g.fillRoundedRect(this.ax - 16, this.ay - 6, 32, 12, 3);
      for (const [w, col] of [[8, C.ink], [4.5, C.rope]]) {
        g.lineStyle(w, col, 1); g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
      }
      // hook at the free end (teal = something you can use)
      const e = pts[pts.length - 1];
      g.lineStyle(4, this.tie ? C.orange : C.teal, 1);
      g.beginPath(); g.arc(e.x, e.y + 6, 6, -Math.PI * 0.1, Math.PI * 1.1, false); g.strokePath();
      if (this.tie && this.tiedBody) { g.lineStyle(3, C.orange, 0.9); g.lineBetween(e.x, e.y, this.tiedBody.position.x, this.tiedBody.position.y); }
    }
    jointError() {
      let worst = 0;
      for (let i = 1; i < this.n; i++) {
        const p = this.bottomOf(this.segs[i - 1]), q = this.topOf(this.segs[i]);
        worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
      }
      return worst;
    }
    destroy() {
      const w = this.scene.matter.world;
      this.untie();
      for (const c of this.links) w.removeConstraint(c);
      for (const b of this.segs) w.remove(b);
      this.g.destroy();
    }
  }

  BB.Parcel = Parcel;
  BB.SpringPad = SpringPad;
  BB.Rope = Rope;
})();
