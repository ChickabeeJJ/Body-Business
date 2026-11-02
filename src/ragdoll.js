'use strict';
/* =========================================================================
   Employee: an articulated ragdoll built from ten Matter bodies (head,
   torso, upper/lower arms, thighs, shins) pinned together at the joints.
   - All parts of one employee share a negative collision group, so the
     body never fights itself; different employees still collide.
   - Matter has no joint angle limits, so soft limits are applied every
     step: overshoot is corrected through angular velocity, weighted by
     each part's inertia, and the relative spin is damped.
   - launch() moves the whole body as one, so devices never yank a single
     limb off its joints.
   ========================================================================= */

(() => {
  const M = Phaser.Physics.Matter.Matter;
  const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; };

  let nextId = 1;
  // Matter caches position / constraint correction impulses on each body and keeps applying them
  // (decaying) on later steps, even to static bodies; clear them when a body freezes or thaws
  const clearImpulses = b => {
    b.positionImpulse.x = b.positionImpulse.y = 0;
    b.constraintImpulse.x = b.constraintImpulse.y = b.constraintImpulse.angle = 0;
  };

  class Employee {
    constructor(scene, x, floorY, opts = {}) {
      this.scene = scene;
      this.id = nextId++;
      this.kind = 'employee';
      this.type = opts.type || 'standard';
      this.A = BB.ARCHETYPES[this.type] || BB.ARCHETYPES.standard;
      this.facing = opts.facing || 1;
      this.s = this.A.scale;
      this.parts = {};
      this.images = [];
      this.joints = [];
      this.launchCd = 0;
      this.walking = false;
      this.walkPh = 0;
      this.group = scene.matter.world.nextGroup(true);
      this.build(x, (opts.y != null ? opts.y : floorY - BB.RIG.feet * this.s - 1));
    }

    build(ox, oy) {
      const s = this.s, f = this.facing, A = this.A, sc = this.scene;
      const filter = { group: this.group, category: BB.CAT.EMPLOYEE, mask: BB.CAT.STATIC | BB.CAT.EMPLOYEE | BB.CAT.PARCEL | BB.CAT.ROPE | BB.CAT.SENSOR };
      for (const [key, shape, w, h, cx, cy, dens, depth] of BB.RIG.parts) {
        const opts = {
          label: 'emp:' + key,
          density: 0.001 * dens * A.density,
          friction: A.friction, frictionStatic: BB.PHYS.frictionStatic, frictionAir: A.frictionAir, restitution: A.restitution,
          collisionFilter: filter,
          shape: shape === 'circle' ? { type: 'circle', radius: w * s } : { type: 'rectangle', width: w * s, height: h * s },
          chamfer: shape === 'circle' ? null : { radius: Math.min(w, h) * s * 0.42 },
        };
        const tex = BB.Art.part(sc, key, this.type);
        const img = sc.matter.add.image(ox + cx * s * f, oy + cy * s, tex, null, opts);
        img.setScale(s).setDepth(10 + depth + this.id * 0.01);
        if (f < 0) img.setFlipX(true);
        if (key.endsWith('B')) img.setTint(0xb9c0c8);
        img.body.bbActor = this;
        img.body.bbPart = key;
        this.parts[key] = img.body;
        this.images.push(img);
      }
      const J = BB.PHYS.joint;
      for (const [pa, pb, jx, jy, lo, hi] of BB.RIG.joints) {
        const A0 = this.parts[pa], B0 = this.parts[pb];
        const wx = ox + jx * s * f, wy = oy + jy * s;
        const pA = { x: wx - A0.position.x, y: wy - A0.position.y };
        const pB = { x: wx - B0.position.x, y: wy - B0.position.y };
        const c = sc.matter.add.constraint(A0, B0, 0, A.jointStiffness * J.stiffness / 0.95, { pointA: { x: pA.x, y: pA.y }, pointB: { x: pB.x, y: pB.y }, damping: J.damping, label: 'joint:' + pb });
        // limits mirror for a left-facing body
        const k = A.limitScale, cap = Math.PI - 0.15;
        const min = Math.max(-cap, (f > 0 ? lo : -hi) * k), max = Math.min(cap, (f > 0 ? hi : -lo) * k);
        this.joints.push({ c, a: A0, b: B0, la: pA, lb: pB, min, max, mid: (min + max) / 2, half: (max - min) / 2 });
      }
    }

    get bodies() { return Object.values(this.parts); }
    get torso() { return this.parts.torso; }
    get center() { return this.torso.position; }
    get mass() { return this.bodies.reduce((m, b) => m + b.mass, 0); }

    /* --------------------------------------------------- per-step physics */
    beforeStep(dt) {
      if (this.asleep) return;
      const P = BB.PHYS;
      const ls = P.limitStiffness * (this.type === 'floppy' ? 0.5 : 1);
      // Soft joint limits: a capped spring-damper on the relative spin, velocity only. It never moves a
      // body directly, and its torque is bounded, so a limb jammed against the floor past its limit is
      // simply held there by friction instead of pushing the whole body along.
      this.limitOver = 0;
      for (const j of this.joints) {
        // measured around the middle of the allowed range, so an angle that wraps past +-PI is still
        // pushed back to the *nearest* limit (not the long way round through the forbidden side)
        const d = wrap(j.b.angle - j.a.angle - j.mid);
        const over = d > j.half ? j.half - d : d < -j.half ? -j.half - d : 0;
        if (!over) continue;
        this.limitOver = Math.max(this.limitOver, Math.abs(over));
        const relW = j.b.angularVelocity - j.a.angularVelocity;
        const beyond = Math.abs(over) <= P.limitSlack ? 0 : over - Math.sign(over) * P.limitSlack;
        const outward = relW * over < 0 ? relW : 0;
        const dw = Phaser.Math.Clamp(beyond * ls - outward * P.limitDamping, -P.limitMaxTorque, P.limitMaxTorque);
        if (!dw) continue;
        const ia = j.a.inertia, ib = j.b.inertia, tot = ia + ib;
        M.Body.setAngularVelocity(j.b, j.b.angularVelocity + dw * (ia / tot));
        M.Body.setAngularVelocity(j.a, j.a.angularVelocity - dw * (ib / tot));
      }
      if (this.walking) this.walkStep(dt);
      this.launchCd = Math.max(0, this.launchCd - dt);
    }

    afterStep(dt) {
      BB.trackRest(this, dt);
      if (this.asleep) return;
      // rest assist: once every part has been nearly still for a moment, damp the body so contact
      // jitter dies out; after a little longer it falls asleep. Any real motion resets both.
      const P = BB.PHYS;
      let vmax = 0;
      for (const b of this.bodies) vmax = Math.max(vmax, Math.hypot(b.velocity.x, b.velocity.y));
      // calm = slow, or vibrating in place without getting anywhere (wedged limbs jitter but don't travel)
      this.calmT = (vmax < P.restAssistSpeed || this.restOK) && !this.walking ? (this.calmT || 0) + dt : 0;
      const damp = this.calmT > P.restAssistDelay;
      if (damp !== this.damped) {
        this.damped = damp;
        for (const b of this.bodies) b.frictionAir = damp ? P.restAssistAir : this.A.frictionAir;
      }
      // never freeze a strained pose (a limb wedged in a pile would keep its stretched joint forever)
      if (this.calmT > P.sleepDelay && !this.tethered && this.jointError() < P.sleepMaxJointError) this.sleep();
    }

    /* Sleep: a jointed Matter body never quite stops (constraint and contact corrections leak into
       velocity and it creeps a few px/s), and Matter's own sleeping does not handle constraints.
       So a calm employee turns its parts static. It wakes on launch / move, when the pointer
       grabs it, or when something moving hits it (see TestRoom.onContacts). */
    sleep() {
      if (this.asleep) return;
      this.asleep = true;
      for (const b of this.bodies) { M.Body.setStatic(b, true); clearImpulses(b); }
    }
    wake() {
      if (!this.asleep) return;
      this.asleep = false;
      for (const b of this.bodies) { M.Body.setStatic(b, false); clearImpulses(b); M.Body.setVelocity(b, { x: 0, y: 0 }); M.Body.setAngularVelocity(b, 0); b.frictionAir = this.A.frictionAir; }
      this.calmT = 0; this.damped = false;
    }
    get settled() { return this.asleep || !!this.restOK; }

    // worst joint-limit violation in the current pose (radians)
    poseOver() {
      let worst = 0;
      for (const j of this.joints) worst = Math.max(worst, Math.abs(wrap(j.b.angle - j.a.angle - j.mid)) - j.half);
      return Math.max(0, worst);
    }

    // largest gap between two halves of a joint (0 when the rig is intact)
    jointError() {
      let worst = 0;
      for (const j of this.joints) {
        const pa = rot(j.la.x, j.la.y, j.a.angle), pb = rot(j.lb.x, j.lb.y, j.b.angle);
        const ax = j.a.position.x + pa.x, ay = j.a.position.y + pa.y;
        const bx = j.b.position.x + pb.x, by = j.b.position.y + pb.y;
        worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
      }
      return worst;
    }

    /* ------------------------------------------------------------ control */
    // move the whole body at once (devices, test launches)
    launch(vx, vy, spin = 0) {
      this.wake();
      for (const b of this.bodies) {
        M.Body.setVelocity(b, { x: vx, y: vy });
        M.Body.setAngularVelocity(b, spin);
      }
      this.calmT = 0; this.damped = false;
      for (const b of this.bodies) b.frictionAir = this.A.frictionAir;
      BB.resetRest(this);
    }
    // teleport the whole body so the torso sits at (x, y) turned to `angle`; keeps the pose, zeroes motion
    moveTo(x, y, angle = 0) {
      this.wake();
      const c = { x: this.torso.position.x, y: this.torso.position.y }, da = angle - this.torso.angle;
      for (const b of this.bodies) {
        const r = rot(b.position.x - c.x, b.position.y - c.y, da);
        M.Body.setPosition(b, { x: x + r.x, y: y + r.y });
        M.Body.setAngle(b, b.angle + da);
        M.Body.setVelocity(b, { x: 0, y: 0 });
        M.Body.setAngularVelocity(b, 0);
      }
      BB.resetRest(this);
    }

    /* EXPERIMENTAL (Phase 1 feasibility check for Phase 2): a puppet walk.
       Keeps the torso upright with a PD torque while a foot is on something,
       swings the thighs out of phase and nudges the body forward. */
    walkStep(dt) {
      const t = this.torso, f = this.facing, now = this.scene.simTime;
      const grounded = ['shinF', 'shinB'].some(k => now - (this.parts[k].bbTouch || -1) < 0.12);
      const upright = Math.abs(wrap(t.angle)) < 0.75;
      if (!grounded || !upright) return;
      const aw = -wrap(t.angle) * 0.06 - t.angularVelocity * 0.35;
      M.Body.setAngularVelocity(t, t.angularVelocity + aw);
      this.walkPh += dt * 7;
      const swing = [['thighF', 0], ['thighB', Math.PI]];
      for (const [k, ph] of swing) {
        const th = this.parts[k];
        const target = wrap(t.angle) + -f * Math.sin(this.walkPh + ph) * 0.55;
        const err = wrap(target - th.angle);
        M.Body.setAngularVelocity(th, th.angularVelocity + err * 0.08 - (th.angularVelocity - t.angularVelocity) * 0.1);
      }
      const want = 2.0 * f;
      for (const b of this.bodies) M.Body.setVelocity(b, { x: b.velocity.x + (want - t.velocity.x) * 0.06, y: b.velocity.y });
      // a little lift so the trailing foot clears the floor
      M.Body.setVelocity(t, { x: t.velocity.x, y: t.velocity.y - 0.05 });
    }

    destroy() {
      const w = this.scene.matter.world;
      for (const j of this.joints) w.removeConstraint(j.c);
      for (const img of this.images) img.destroy();
      this.joints = []; this.images = []; this.parts = {};
    }
  }

  BB.Employee = Employee;
})();
