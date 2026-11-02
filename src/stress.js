'use strict';
/* =========================================================================
   Stability stress test (the Phase 1 success gate, automated).
   Each scenario resets the room, scripts a few events and runs the
   simulation 30x faster than real time. It fails on: NaN positions,
   bodies escaping the room, a joint pulled apart for more than a few
   steps, a body leak after reset, or actors that never come to rest.
   Run it from the TEST button, with ?selftest in the URL, or BB.Stress.run().
   ========================================================================= */

(() => {
  const STEP = 1 / 60;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const torsoAt = (s, x, y, ang = 0) => s.employee.moveTo(x, y, ang);

  const SCENARIOS = [
    { name: 'Stand and settle', run: 1, setup() {} },
    { name: 'Drop from the ceiling, upside down', run: 1, setup: s => torsoAt(s, 640, 140, Math.PI) },
    { name: 'Drop onto the parcel', run: 1, setup: s => { s.parcel.moveTo(640, 600); torsoAt(s, 640, 300, 0.4); } },
    {
      name: '12 random launches', run: 12,
      events: Array.from({ length: 12 }, (_, i) => ({ at: i * 0.95, fn: s => { const e = s.employee; e.launch(rnd(-24, 24), rnd(-24, -6), rnd(-0.3, 0.3)); } })),
    },
    { name: 'Max-speed wall slam', run: 1.5, events: [{ at: 0.1, fn: s => { torsoAt(s, 900, 520); s.employee.launch(24, -4, 0.2); } }] },
    { name: 'Max-speed ceiling slam', run: 1.5, events: [{ at: 0.1, fn: s => { torsoAt(s, 300, 500); s.employee.launch(3, -24, 0.3); } }] },
    {
      name: 'Spring launch (employee)', run: 1.5,
      setup: s => torsoAt(s, s.spring.x, 420),
      expect: (s, r) => (r.minY < 380 ? null : 'spring did not launch the employee (top y ' + Math.round(r.minY) + ')'),
      track: (s, r) => { r.minY = Math.min(r.minY == null ? 1e9 : r.minY, s.employee.center.y); },
    },
    {
      name: 'Spring launch (parcel)', run: 1.5,
      setup: s => { s.parcel.moveTo(s.spring.x, 480); torsoAt(s, 150, 590); },
      expect: (s, r) => (r.minY < 420 ? null : 'spring did not launch the parcel'),
      track: (s, r) => { r.minY = Math.min(r.minY == null ? 1e9 : r.minY, s.parcel.center.y); },
    },
    {
      name: 'Rope: tie, swing, untie', run: 6,
      setup: s => { const e = s.rope.end; torsoAt(s, e.x, e.y + 30); s.rope.tieTo(s.employee.torso); },
      events: [{ at: 0.8, fn: s => s.employee.launch(16, 0, 0) }, { at: 2.4, fn: s => s.employee.launch(-18, -4, 0) }, { at: 4.5, fn: s => s.rope.untie() }],
    },
    { name: 'Rope: tie the parcel and swing it', run: 4, setup: s => { const e = s.rope.end; s.parcel.moveTo(e.x, e.y + 20); s.rope.tieTo(s.parcel.body); }, events: [{ at: 0.5, fn: s => s.parcel.launch(20, -2, 0) }, { at: 3, fn: s => s.rope.untie() }] },
    { name: 'Rope: run through it', run: 2, events: [{ at: 0.1, fn: s => { torsoAt(s, 560, 520); s.employee.launch(18, -6, 0); } }] },
    { name: 'Parcel thrown at full speed', run: 1.5, setup: s => torsoAt(s, 640, 590), events: [{ at: 0.6, fn: s => { s.parcel.moveTo(250, 560); s.parcel.launch(24, -2, 0.3); } }] },
    {
      name: 'Pile of four employees + parcel', run: 2,
      setup: s => {
        for (let i = 0; i < 3; i++) s.actors.push(new BB.Employee(s, 540 + i * 100, 650, { y: 140 + (i % 2) * 90, type: s.type }));
        torsoAt(s, 600, 420, 1.2); s.parcel.moveTo(640, 90);
      },
    },
    {
      name: 'Sleeping employee knocked by the parcel', run: 4,
      setup: s => torsoAt(s, 700, 560),
      events: [{ at: 3.6, fn: s => { s.sleptBefore = s.employee.asleep; s.x0 = s.employee.center.x; const t = s.employee.center, sx = t.x + 170, sy = t.y - 120, L = Math.hypot(t.x - sx, t.y - sy); s.parcel.moveTo(sx, sy); s.parcel.launch((t.x - sx) / L * 22, (t.y - sy) / L * 22, 0); } }],
      track: (s, r) => { if (s.sleptBefore != null) r.hitV = Math.max(r.hitV || 0, ...s.employee.bodies.map(b => Math.hypot(b.velocity.x, b.velocity.y))); },
      expect: (s, r) => (!s.sleptBefore ? 'employee had not fallen asleep yet' : !(r.hitV > 2) ? 'sleeping employee did not react to the hit' : null),
    },
    {
      name: 'Parcel dropped on a sleeping employee', run: 4,
      setup: s => torsoAt(s, 640, 560),
      events: [{ at: 3.6, fn: s => s.parcel.moveTo(640, 200) }],
      expect: s => (s.parcel.center.y > 640 ? 'parcel sank through the employee' : null),
    },
    {
      name: 'Chaos: 4 employees, 40 launches', run: 22,
      setup: s => { for (let i = 0; i < 3; i++) s.actors.push(new BB.Employee(s, 400 + i * 220, 650, { type: s.type, facing: i % 2 ? -1 : 1 })); },
      events: Array.from({ length: 40 }, (_, i) => ({ at: 0.3 + i * 0.5, fn: s => { const a = s.actors[(Math.random() * s.actors.length) | 0]; a.launch(rnd(-24, 24), rnd(-24, -4), rnd(-0.3, 0.3)); } })),
    },
    ...['heavy', 'bouncy', 'tiny', 'floppy'].map(t => ({
      name: 'Archetype: ' + BB.ARCHETYPES[t].name + ' (drop + launches)', type: t, run: 4,
      setup: s => torsoAt(s, 600, 160, 2),
      events: [{ at: 1.2, fn: s => s.employee.launch(20, -14, 0.2) }, { at: 2.4, fn: s => s.employee.launch(-22, -10, -0.3) }],
    })),
    {
      name: 'Walk (experimental, informational)', run: 4, info: true,
      setup: s => { s.employee.walking = true; s.walkX0 = s.employee.center.x; },
      events: [{ at: 4, fn: s => { s.employee.walking = false; } }],
      expect: (s, r) => { r.note = 'walked ' + Math.round(s.employee.center.x - s.walkX0) + ' px in 4 s, torso ' + (Math.abs(Phaser.Math.Angle.Wrap(s.employee.torso.angle)) < 0.8 ? 'upright' : 'fallen'); return null; },
    },
  ];

  class Runner {
    constructor(list, done) {
      this.list = list; this.i = -1; this.done = done; this.results = [];
      this.baseline = null;
    }
    begin(s) {
      this.i++;
      const sc = this.list[this.i];
      if (!sc) return this.finish(s);
      s.reset({ type: sc.type || 'standard' });
      const bodies = s.bodyCount(), cons = s.constraintCount();
      if (!this.baseline) this.baseline = { bodies, cons };
      this.cur = { sc, t: 0, fired: new Set(), r: { name: sc.name, peakErr: 0, over: 0, overRun: 0, nan: s.stats.nan, esc: s.stats.escapes, settleT: null, leak: bodies !== this.baseline.bodies || cons !== this.baseline.cons ? `${bodies - this.baseline.bodies} bodies / ${cons - this.baseline.cons} joints` : 0 } };
      if (sc.setup) sc.setup(s);
    }
    tick(s) {
      if (!this.cur) return this.begin(s);
      const c = this.cur, sc = c.sc;
      c.t += STEP;
      for (const [k, ev] of (sc.events || []).entries()) if (!c.fired.has(k) && c.t >= ev.at) { c.fired.add(k); ev.fn(s); }
      if (sc.track) sc.track(s, c.r);
      const lastEvent = Math.max(0, ...(sc.events || []).map(e => e.at));
      const settled = s.actors.every(a => a.settled);
      if (c.t > lastEvent && settled && c.r.settleT == null && c.t >= sc.run) c.r.settleT = c.t - lastEvent;
      const limit = sc.run + 8;
      if ((c.t >= sc.run && settled) || c.t >= limit) this.end(s);
    }
    sample(s) {
      if (!this.cur) return;
      const r = this.cur.r, e = s.stats.err || 0;
      for (const a of s.employees) r.limitOver = Math.max(r.limitOver || 0, a.limitOver || 0);
      r.peakErr = Math.max(r.peakErr, e);
      if (e > BB.PHYS.breakError) { r.over++; this.curRun = (this.curRun || 0) + 1; r.overRun = Math.max(r.overRun, this.curRun); }
      else this.curRun = 0;
    }
    end(s) {
      const c = this.cur, r = c.r, sc = c.sc;
      r.nan = s.stats.nan - r.nan; r.esc = s.stats.escapes - r.esc;
      const why = [];
      if (r.nan) why.push(r.nan + ' NaN bodies');
      if (r.esc) why.push(r.esc + ' escaped the room');
      if (r.overRun > 12) why.push('a joint pulled apart for ' + r.overRun + ' steps');
      if (r.leak) why.push('leak after reset: ' + r.leak);
      if (!s.actors.every(a => a.settled)) why.push('never settled');
      const ex = sc.expect && sc.expect(s, r);
      if (ex) why.push(ex);
      r.pass = sc.info ? !why.some(w => !w.startsWith('never settled')) : !why.length;
      r.why = why.join('; ');
      r.peakErr = +r.peakErr.toFixed(2);
      r.limitOver = +(r.limitOver || 0).toFixed(2);
      // how far past its limits the final resting pose is (what the player actually looks at)
      r.restOver = +Math.max(0, ...s.employees.map(e => e.poseOver())).toFixed(2);
      r.settleT = r.settleT != null ? +r.settleT.toFixed(2) : null;
      this.results.push(r);
      this.curRun = 0;
      this.cur = null;
      s.employee && (s.employee.walking = false);
    }
    finish(s) {
      s.runner = null; s.monitor = null; s.speed = 1;
      s.reset({ type: 'standard' });
      const pass = this.results.filter(r => r.pass).length;
      const out = { pass, total: this.results.length, results: this.results, baseline: this.baseline };
      BB.lastStress = out;
      console.log('[stress] ' + pass + '/' + this.results.length + ' passed');
      console.table && console.table(this.results.map(r => ({ scenario: r.name, pass: r.pass, peakJointErr: r.peakErr, limitOverRad: r.limitOver, settleSec: r.settleT, note: r.why || r.note || '' })));
      this.done && this.done(out);
    }
  }

  BB.Stress = {
    SCENARIOS,
    run(done) {
      const s = BB.scene;
      if (!s || s.runner) return;
      const r = new Runner(SCENARIOS, done);
      s.runner = r; s.monitor = r; s.speed = 30;
      return r;
    },
  };
})();
