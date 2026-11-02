'use strict';
/* =========================================================================
   Phase 1 scene: the physics test room. Builds a room from level data,
   steps Matter at a fixed 60 Hz (manual stepping, so the stress test can
   run faster than real time), applies joint limits and velocity caps,
   watches stability (NaNs, escapes, joint separation, settling) and
   exposes test controls: drag, drop, launch, spring, rope, walk, types.
   ========================================================================= */

(() => {
  const M = Phaser.Physics.Matter.Matter;
  const C = BB.COLORS;
  const STEP_MS = 1000 / 60, STEP = 1 / 60;
  const TYPES = Object.keys(BB.ARCHETYPES);

  class TestRoom extends Phaser.Scene {
    constructor() { super('TestRoom'); }

    create() {
      this.level = BB.LEVELS.testRoom;
      this.simTime = 0;
      this.acc = 0;
      this.speed = 1;            // steps per real step (stress test raises it)
      this.paused = false;
      this.type = this.type || 'standard';
      this.debug = false;
      this.actors = []; this.devices = [];
      this.stats = { peakErr: 0, steps: 0, stepMs: 0, maxSpeed: 0, nan: 0, escapes: 0 };
      const W = this.matter.world;
      W.autoUpdate = false;
      W.drawDebug = false;
      this.matter.world.engine.positionIterations = BB.PHYS.positionIterations;
      this.matter.world.engine.velocityIterations = BB.PHYS.velocityIterations;
      this.matter.world.engine.constraintIterations = BB.PHYS.constraintIterations;
      this.matter.world.setGravity(0, BB.PHYS.gravity);

      this.drawRoom();
      for (const s of this.level.statics) {
        const b = this.matter.add.rectangle(s.x, s.y, s.w, s.h, {
          isStatic: true, label: 'static:' + s.kind, angle: s.angle || 0, friction: 0.9, frictionStatic: BB.PHYS.frictionStatic,
          collisionFilter: { category: BB.CAT.STATIC, mask: 0xffff },
        });
        b.bbStatic = s;
      }
      this.fxg = this.add.graphics().setDepth(40);
      this.buildActors();

      // drag anything with the pointer
      this.matter.add.pointerConstraint({ length: 0, stiffness: 0.2, damping: 0.1 });

      W.on('beforeupdate', () => this.beforeStep());
      W.on('afterupdate', () => this.afterStep());
      W.on('dragstart', body => { if (body.bbActor && body.bbActor.wake) body.bbActor.wake(); });
      W.on('collisionstart', ev => this.onContacts(ev.pairs, true));
      W.on('collisionactive', ev => this.onContacts(ev.pairs, false));

      this.setDebug(false);
      BB.UI.bind(this);
      BB.scene = this;
    }

    /* ------------------------------------------------------------ build */
    buildActors(opts = {}) {
      const L = this.level, fy = L.floorY;
      for (const e of L.employees) this.actors.push(new BB.Employee(this, e.x, fy, { facing: e.facing, type: opts.type || this.type }));
      this.parcel = new BB.Parcel(this, L.parcel.x, fy - BB.PARCEL.h / 2 - 1);
      this.actors.push(this.parcel);
      for (const d of L.devices) {
        if (d.type === 'spring') this.devices.push(new BB.SpringPad(this, d, fy));
        else if (d.type === 'rope') this.devices.push(new BB.Rope(this, d));
      }
      this.stats.peakErr = 0;
    }
    clearActors() {
      for (const a of this.actors) a.destroy();
      for (const d of this.devices) d.destroy();
      this.actors = []; this.devices = []; this.parcel = null;
    }
    reset(opts = {}) {
      this.clearActors();
      if (opts.type) this.type = opts.type;
      this.buildActors(opts);
      this.simTime = 0;
    }
    get employees() { return this.actors.filter(a => a.kind === 'employee'); }
    get employee() { return this.employees[0]; }
    get rope() { return this.devices.find(d => d.type === 'rope'); }
    get spring() { return this.devices.find(d => d.type === 'spring'); }
    bodyCount() { return M.Composite.allBodies(this.matter.world.localWorld).length; }
    constraintCount() { return M.Composite.allConstraints(this.matter.world.localWorld).length; }

    /* ------------------------------------------------------ physics hooks */
    beforeStep() {
      this.simTime += STEP;
      this.wakeSleepers();
      for (const a of this.actors) a.beforeStep(STEP);
    }
    boundsOf(a) {
      const box = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
      for (const b of a.bodies) { box.min.x = Math.min(box.min.x, b.bounds.min.x); box.min.y = Math.min(box.min.y, b.bounds.min.y); box.max.x = Math.max(box.max.x, b.bounds.max.x); box.max.y = Math.max(box.max.y, b.bounds.max.y); }
      return box;
    }
    // wake a sleeping employee *before* something moving reaches it, so the impact sees its real
    // mass (waking on the contact itself would make it act like a wall for that one step)
    wakeSleepers() {
      const sleepers = this.actors.filter(a => a.asleep);
      if (!sleepers.length) return;
      // an awake employee with a strained joint is probably wedged against sleeping (static) bodies:
      // wake the sleepers whose bounds touch it so the pile can sort itself out
      for (const e of this.employees) {
        if (e.asleep || e.jointError() < BB.PHYS.breakError * 0.6) continue;
        const eb = this.boundsOf(e);
        for (const a of sleepers) if (overlap(eb, this.boundsOf(a), 6)) a.wake();
      }
      const movers = M.Composite.allBodies(this.matter.world.localWorld).filter(b => !b.isStatic && !b.isSensor && Math.hypot(b.velocity.x, b.velocity.y) > BB.PHYS.wakeSpeed);
      for (const a of sleepers) {
        if (!a.asleep) continue;
        const box = this.boundsOf(a);
        for (const m of movers) {
          const vx = m.velocity.x * 2, vy = m.velocity.y * 2, pad = 4;
          if (Math.max(m.bounds.max.x, m.bounds.max.x + vx) + pad < box.min.x || Math.min(m.bounds.min.x, m.bounds.min.x + vx) - pad > box.max.x) continue;
          if (Math.max(m.bounds.max.y, m.bounds.max.y + vy) + pad < box.min.y || Math.min(m.bounds.min.y, m.bounds.min.y + vy) - pad > box.max.y) continue;
          a.wake(); break;
        }
      }
    }
    afterStep() {
      const P = BB.PHYS, bodies = M.Composite.allBodies(this.matter.world.localWorld);
      let vmax = 0;
      for (const b of bodies) {
        if (b.isStatic) continue;
        const v = b.velocity, sp = Math.hypot(v.x, v.y);
        if (!Number.isFinite(sp) || !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) { this.stats.nan++; this.rescue(b); continue; }
        if (sp > P.maxSpeed) M.Body.setVelocity(b, { x: v.x * P.maxSpeed / sp, y: v.y * P.maxSpeed / sp });
        if (Math.abs(b.angularVelocity) > P.maxAngularSpeed) M.Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * P.maxAngularSpeed);
        vmax = Math.max(vmax, Math.min(sp, P.maxSpeed));
        if (b.position.x < -60 || b.position.x > BB.VIEW.w + 60 || b.position.y < -80 || b.position.y > BB.VIEW.h + 40) { this.stats.escapes++; this.rescue(b); }
      }
      this.stats.maxSpeed = vmax;
      for (const a of this.actors) a.afterStep(STEP);
      let err = 0;
      for (const a of this.actors) err = Math.max(err, a.jointError());
      for (const d of this.devices) if (d.jointError) err = Math.max(err, d.jointError());
      this.stats.err = err;
      this.stats.peakErr = Math.max(this.stats.peakErr, err);
      this.stats.steps++;
      if (this.monitor) this.monitor.sample(this);
    }
    // last-resort safety net: a body that went NaN or left the room puts its actor back in the room
    rescue(b) {
      const a = b.bbActor;
      if (a) a.moveTo(BB.VIEW.w / 2, 200, 0);
      else if (b.bbRope) { const r = b.bbRope; r.untie(); M.Body.setPosition(b, { x: r.ax, y: r.ay + 40 }); M.Body.setVelocity(b, { x: 0, y: 0 }); }
    }

    onContacts(pairs, start) {
      for (const p of pairs) {
        const A = p.bodyA, B = p.bodyB;
        for (const [s, o] of [[A, B], [B, A]]) {
          // something moving bumps a sleeping employee: wake it
          if (s.bbActor && s.bbActor.asleep && !o.isStatic && !o.isSensor && Math.hypot(o.velocity.x, o.velocity.y) > BB.PHYS.wakeSpeed) s.bbActor.wake();
          // spring plates fire on first touch by any employee part or the parcel
          if (s.bbDevice && start) s.bbDevice.trigger(o.bbActor);
          // feet on something solid (for the experimental walk)
          if (o.bbPart && (o.bbPart === 'shinF' || o.bbPart === 'shinB') && !s.isSensor && !s.bbActor) o.bbTouch = this.simTime;
        }
        if (start && !A.isSensor && !B.isSensor) {
          const rv = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
          if (rv > 12 && (A.bbActor || B.bbActor)) this.onImpact((A.position.x + B.position.x) / 2, (A.position.y + B.position.y) / 2, rv / BB.PHYS.maxSpeed, 'hit');
        }
      }
    }
    onImpact(x, y, k) {
      if (this.speed > 1) return;
      this.impacts = this.impacts || [];
      this.impacts.push({ x, y, t: 0, k: Math.min(1, k) });
      if (k > 0.75) this.cameras.main.shake(70, 0.0025 * k);
    }

    /* ------------------------------------------------------------ frame */
    update(time, delta) {
      if (!this.paused) {
        const t0 = performance.now();
        if (this.speed > 1) for (let i = 0; i < this.speed && this.speed > 1; i++) this.stepOnce();
        else {
          this.acc += Math.min(delta, 100);
          let n = 0;
          while (this.acc >= STEP_MS && n++ < 5) { this.acc -= STEP_MS; this.stepOnce(); }
          if (n >= 5) this.acc = 0;
        }
        const dt = performance.now() - t0;
        this.stats.stepMs = lerp(this.stats.stepMs || 0, dt, 0.1);
      }
      for (const d of this.devices) d.update(Math.min(delta / 1000, 0.05));
      this.drawFx(delta / 1000);
      BB.UI.tick(this);
    }
    stepOnce() {
      if (this.runner) this.runner.tick(this);
      this.matter.world.step(STEP_MS);
    }

    setDebug(on) {
      this.debug = on;
      const W = this.matter.world;
      W.drawDebug = on;
      if (W.debugGraphic) { W.debugGraphic.setVisible(on); if (!on) W.debugGraphic.clear(); }
    }

    /* ------------------------------------------------------------- draw */
    drawRoom() {
      const g = this.add.graphics().setDepth(0);
      const w = BB.VIEW.w, h = BB.VIEW.h, fy = this.level.floorY;
      g.fillStyle(C.wall, 1); g.fillRect(0, 0, w, h);
      // wall panels and a wainscot
      g.fillStyle(C.wall2, 1);
      for (let x = 30; x < w; x += 160) g.fillRect(x, 0, 3, fy);
      g.fillRect(0, fy - 120, w, 6);
      g.fillStyle(0xd0d7d2, 1); g.fillRect(0, fy - 114, w, 114);
      // pipes along the ceiling
      g.fillStyle(0xc2cac6, 1); g.fillRect(0, 54, w, 14); g.fillRect(0, 76, w, 8);
      g.fillStyle(0xaab3ae, 1); for (let x = 90; x < w; x += 220) g.fillRect(x, 50, 10, 38);
      // painted sign
      g.fillStyle(C.ink, 0.08); g.fillRoundedRect(70, 120, 300, 70, 8);
      this.add.text(88, 132, 'TEST ROOM', { fontFamily: 'system-ui, Segoe UI, sans-serif', fontSize: '34px', fontStyle: '900', color: '#1b2631' }).setAlpha(0.22).setDepth(0);
      // static geometry: ink bodies, teal top edge on walkable surfaces
      for (const s of this.level.statics) {
        g.save(); g.translateCanvas(s.x, s.y); g.rotateCanvas(s.angle || 0);
        g.fillStyle(s.kind === 'floor' ? C.ink : C.ink2, 1);
        g.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        if (s.kind === 'floor' || s.kind === 'shelf' || s.kind === 'ramp') { g.fillStyle(C.teal, 1); g.fillRect(-s.w / 2, -s.h / 2, s.w, 4); }
        if (s.kind === 'wall' || s.kind === 'ceiling') {
          // hazard stripes on the room edges
          g.fillStyle(C.orange, 0.9);
          const vertical = s.kind === 'wall';
          for (let i = -(vertical ? s.h : s.w) / 2; i < (vertical ? s.h : s.w) / 2; i += 36) {
            if (vertical) g.fillRect(s.x < w / 2 ? s.w / 2 - 8 : -s.w / 2, i, 8, 18);
            else g.fillRect(i, s.h / 2 - 8, 18, 8);
          }
        }
        g.restore();
      }
    }
    drawFx(dt) {
      const g = this.fxg; g.clear();
      if (this.impacts) {
        for (const p of this.impacts) {
          p.t += dt;
          const u = p.t / 0.3;
          g.lineStyle(3, C.ink, (1 - u) * 0.6 * p.k + 0.1 * (1 - u));
          g.strokeCircle(p.x, p.y, 8 + u * 26 * (0.5 + p.k));
        }
        this.impacts = this.impacts.filter(p => p.t < 0.3);
      }
      if (!this.debug) return;
      // debug extras: joints at their limit (orange), actor centres, settled state
      for (const e of this.employees) {
        for (const j of e.joints) {
          const d = Phaser.Math.Angle.Wrap(j.b.angle - j.a.angle - j.mid);
          if (Math.abs(d) >= j.half - 0.01) {
            const p = j.b.position;
            g.fillStyle(C.orange, 1); g.fillCircle(p.x, p.y, 4);
          }
        }
      }
      for (const a of this.actors) {
        const c = a.center;
        g.lineStyle(2, a.settled ? C.teal : C.orange, 1); g.strokeCircle(c.x, c.y, 6);
      }
    }
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const overlap = (p, q, pad) => !(p.max.x + pad < q.min.x || p.min.x - pad > q.max.x || p.max.y + pad < q.min.y || p.min.y - pad > q.max.y);
  BB.TestRoom = TestRoom;
  BB.TYPES = TYPES;
})();
