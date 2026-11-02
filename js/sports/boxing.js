'use strict';
/* =========================================================================
   Boxing: three rounds in the ring. Tap PUNCH to jab, hold it to load a
   haymaker (hold DOWN for an uppercut). Hold BLOCK to guard: blocked punches
   barely hurt. Empty a health bar for a knockout. A round that goes the
   distance goes to whoever has more health left. Best of three rounds.
   ========================================================================= */

class Boxing extends Sport {
  constructor(host, o) {
    super(host, o);
    this.id = 'boxing';
    this.groundY = 770;
    this.arena = { look: 'hall', standsTop: 250 };
    this.ropeL = 250; this.ropeR = W - 250;
    this.roundLen = this.demo ? 30 : 45;
    this.round = 1;
    this.startSound = null;   // the bell rings in reset()
    this.rounds = [0, 0];
    this.clock = this.roundLen;
    const bounds = { minX: this.ropeL + 20, maxX: this.ropeR - 20 };
    this.makeAthlete(0, 640, { bounds, speed: 330, jumpV: 820, style: 'boxer', scale: 1.12 });
    this.makeAthlete(1, 960, { bounds, speed: 330, jumpV: 820, style: 'boxer', scale: 1.12 });
    for (const a of this.athletes) a.kit.shorts = a.kit.color;
    for (const a of this.athletes) a.brain.range = 90;
    this.ropeK = [0, 0];
    this.stats = { landed: 0, thrown: 0, kos: 0 };
    this.reset(true);
  }

  reset(first) {
    const [a, b] = this.athletes;
    a.place(640, 1); b.place(960, -1);
    for (const t of this.athletes) { t.hp = 100; t.loading = null; t.guardT = 0; t.koT = 0; }
    this.clock = this.roundLen;
    if (!first) this.round++;
    this.koed = null;
    if (!this.demo) this.sfx('bell');
  }

  /* ---------------------------------------------------------- input */
  press(a, btn) {
    if (!a.canAct) return;
    if (btn === 'action') {
      if (a.act || a.loading || a.hold === 'block') return;
      a.loading = { t: 0 };
    } else if (btn === 'alt') {
      if (a.loading) return;
      a.blocking = true;
    }
  }
  release(a, btn) {
    if (btn === 'alt') { a.blocking = false; return; }
    if (btn !== 'action' || !a.loading) return;
    const t = a.loading.t;
    a.loading = null;
    if (!a.canAct || a.act) return;
    const up = a.ai ? !!a.brain.upper : this.host.input.modHeld;
    if (t < 0.22) {
      a.play('jab', 0.26, { move: 0.5, power: 0, done: false, alt: !a.alt });
      a.alt = !a.alt;
    } else {
      const k = clamp((t - 0.22) / 0.5, 0, 1);
      a.play(up ? 'uppercut' : 'hook', 0.42 + k * 0.08, { move: 0.3, power: 0.5 + k * 0.5, done: false });
    }
    if (a.team === 0) this.stats.thrown++;
    this.sfx('whiff');
  }

  /* ----------------------------------------------------------- tick */
  tick(dt) {
    if (this.live) {
      this.clock -= dt;
      if (this.clock <= 0) this.roundOver(this.athletes[0].hp === this.athletes[1].hp ? -1 : this.athletes[0].hp > this.athletes[1].hp ? 0 : 1, 'decision');
    }
    const [p0, p1] = this.athletes;
    for (const a of this.athletes) {
      if (a.loading) { a.loading.t += dt; if (!a.canAct) a.loading = null; }
      if (a.canAct && !a.act && this.phase !== 'over' && this.phase !== 'point') {
        a.hold = a.blocking ? 'block' : a.loading ? 'charge' : 'guard';
        a.holdK = a.loading ? clamp((a.loading.t - 0.22) / 0.5, 0, 1) : 0;
        if (this.phase === 'play' || this.phase === 'intro') a.facing = this.opp(a).root.x > a.root.x ? 1 : -1;
      }
      a.update(dt);
      // bounce off the ropes
      const r = a.root;
      for (const [side, x] of [[0, this.ropeL + 20], [1, this.ropeR - 20]]) {
        if ((side === 0 && r.x <= x + 1 && r.vx < -260) || (side === 1 && r.x >= x - 1 && r.vx > 260)) {
          r.vx = -r.vx * 0.7; this.ropeK[side] = 1; this.sfx('thump', 0.3);
        }
      }
      if (a.mode === 'tumble') for (const pt of a.pts) {
        if (pt.x < this.ropeL - 8 && pt.y < this.groundY - 30) { this.ropeK[0] = Math.max(this.ropeK[0], 0.7); }
        if (pt.x > this.ropeR + 8 && pt.y < this.groundY - 30) { this.ropeK[1] = Math.max(this.ropeK[1], 0.7); }
      }
    }
    separate(p0, p1, 64);
    // punches connect on their strike frames
    for (const a of this.athletes) {
      const act = a.act, o = this.opp(a);
      if (!act || act.done || (act.id !== 'jab' && act.id !== 'hook' && act.id !== 'uppercut')) continue;
      if (a.phase().ph !== 1) continue;
      const E = a.pts[P.FELB], Hh = a.pts[P.FHAND];
      const hit = o.hitCapsule(E.x, E.y, Hh.x + a.facing * 6, Hh.y, 13);
      if (!hit) continue;
      act.done = true;
      this.land(a, o, act, hit);
    }
    this.ropeK = this.ropeK.map(v => Math.max(0, v - dt * 3));
    if (this.koed) {
      this.koed.t -= dt;
      if (this.koed.t <= 0 && this.phase === 'play') this.roundOver(1 - this.koed.a.team, 'ko');
    }
  }

  land(a, o, act, hit) {
    const pw = act.power, f = a.facing;
    const facingIn = o.facing === -f;
    const blocked = o.blocking && o.canAct && facingIn;
    let dmg = act.id === 'jab' ? 5 : lerp(10, 19, (pw - 0.5) * 2);
    if (hit.head) dmg *= 1.3;
    if (blocked) dmg *= 0.18;
    dmg = Math.round(dmg * (a.ai ? 0.8 + this.T.skill * 0.35 : 1));
    if (this.phase !== 'play') dmg = 0;
    o.hp = Math.max(0, o.hp - dmg);
    o.flash = 1;
    const kx = f * (act.id === 'jab' ? 220 : 380 + pw * 380) * (blocked ? 0.45 : 1);
    const ky = act.id === 'uppercut' ? -520 * pw : -60;
    if (a.team === 0 && !blocked) this.stats.landed++;
    if (o.hp <= 0 && this.phase === 'play') {
      o.knock(kx * 1.6, ky - 420, hit.idx, 5);
      o.loading = null; o.blocking = false;
      this.koed = { a: o, t: 1.6 };
      this.host.slowmo(0.7); this.host.flash(0.6); this.shake(14);
      this.sfx('ko');
      this.fx.text(o.head().x, o.head().y - 50, 'K.O.!', '#ff4f5e', 46, { dur: 1.4 });
      if (a.team === 0) this.stats.kos++;
    } else if (blocked) {
      o.knock(kx, -30, P.FHAND, 0);
      this.sfx('block');
      this.fx.burst(hit.px, hit.py, '#a9c9ff', 6, 220, { size: 4, life: 0.25 });
    } else {
      const tumble = act.id !== 'jab' && pw > 0.85 && o.hp < 40 ? 1.1 : 0;
      o.knock(kx, ky, hit.idx, tumble);
      o.loading = null;
      if (act.id !== 'jab') { this.shake(4 + pw * 6); this.host.slowmo(0.06 + pw * 0.08); }
      this.sfx('punch', act.id === 'jab' ? 0.2 : pw);
      this.fx.burst(hit.px, hit.py, '#ffffff', act.id === 'jab' ? 5 : 12, 300, { size: 5, life: 0.25 });
      this.fx.text(hit.px, hit.py - 30, String(dmg), act.id === 'jab' ? '#ffffff' : '#ffc933', act.id === 'jab' ? 18 : 26, { dur: 0.6 });
      this.hype = Math.max(this.hype, act.id === 'jab' ? 0.15 : 0.5);
    }
  }

  roundOver(winner, how) {
    if (this.phase !== 'play') return;
    if (winner >= 0) this.rounds[winner]++;
    const label = how === 'ko' ? 'KNOCKOUT!' : winner === -1 ? 'ROUND DRAWN' : 'ROUND TO ' + this.athletes[winner].name;
    if (how !== 'ko') this.sfx('bell');
    // score shows rounds won
    this.score = this.rounds.slice();
    if (winner === -1) {
      this.setPhase('point'); this.pointHold = 1.8; this.banner(label, '');
      for (const a of this.athletes) if (a.mode === 'active') a.hold = null;
      return;
    }
    this.score[winner]--;   // point() adds it back
    this.point(winner, label, { hold: how === 'ko' ? 2.6 : 1.9, slow: how === 'ko' ? 0.2 : 0.1, at: this.athletes[winner].head() });
  }
  checkWin() {
    if (this.over) return true;
    const [a, b] = this.rounds;
    if (a >= 2 || b >= 2) { this.finish(a > b ? 0 : 1); return true; }
    if (this.round >= 3 && this.phase === 'point') { this.finish(a === b ? -1 : a > b ? 0 : 1); return true; }
    return false;
  }

  /* ------------------------------------------------------------- AI */
  ai(a, dt) {
    const o = this.opp(a), br = a.brain;
    const dx = o.root.x - a.root.x, ad = Math.abs(dx), dir = Math.sign(dx) || 1;
    br.t -= dt;
    if (br.t <= 0) {
      br.t = this.reactOf(a) + rand(0, 0.12);
      const hurt = a.hp < 35 && o.hp > a.hp + 20;
      br.range = hurt ? 150 : o.mode !== 'active' ? 70 : 82 + this.err(a, 30);
      // see a haymaker coming: guard up (skill)
      const threat = (o.loading && o.loading.t > 0.25) || (o.act && o.act.id !== 'jab' && o.phase().ph === 0);
      a.blocking = threat && ad < 140 && this.rng() < this.skillOf(a) * 0.9;
      if (!threat && a.blocking && this.rng() < 0.6) a.blocking = false;
      br.upper = this.rng() < 0.3;
    }
    this.walkTo(a, o.root.x - dir * br.range, 10);
    if (a.blocking) { if (this.rng() < dt * 1.2) a.blocking = false; return; }
    if (!a.canAct || a.act) return;
    if (a.loading) {
      if (a.loading.t > br.loadFor) this.release(a, 'action');
      return;
    }
    if (ad < 105 && o.mode !== 'tumble' && this.cool(a, 'punch')) {
      this.setCd(a, 'punch', lerp(0.75, 0.32, this.aggrOf(a)) + rand(0, 0.25));
      br.loadFor = this.rng() < 0.3 + this.aggrOf(a) * 0.3 ? rand(0.45, 0.75) : 0.05;
      this.press(a, 'action');
    }
    if (a.root.grounded && ad < 120 && o.loading && this.rng() < dt * 0.5) a.jump();
  }

  /* ----------------------------------------------------------- draw */
  paintStatic(g) {
    const gy = this.groundY;
    // ring apron and canvas
    g.fillStyle = '#d9dde8'; g.fillRect(this.ropeL - 40, gy - 44, this.ropeR - this.ropeL + 80, 90);
    g.fillStyle = '#c7ccd9'; g.fillRect(this.ropeL - 40, gy - 44, this.ropeR - this.ropeL + 80, 8);
    g.fillStyle = '#23283a'; g.fillRect(this.ropeL - 52, gy + 46, this.ropeR - this.ropeL + 104, 70);
    g.fillStyle = '#ffc933'; g.font = '900 30px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RAG SPORTS', W / 2, gy + 82);
    g.fillStyle = 'rgba(79,141,255,0.35)'; g.beginPath(); g.ellipse(W / 2, gy, 110, 30, 0, 0, TAU); g.fill();
    // back posts and back ropes
    for (const x of [this.ropeL + 18, this.ropeR - 18]) { g.fillStyle = '#8b93a8'; g.fillRect(x - 6, gy - 250, 12, 210); }
    for (let i = 0; i < 3; i++) {
      const y = gy - 238 + i * 62;
      g.strokeStyle = ['#ff4f5e', '#f6f7fb', '#4f8dff'][i]; g.lineWidth = 4; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(this.ropeL + 18, y); g.lineTo(this.ropeR - 18, y); g.stroke();
      g.globalAlpha = 1;
    }
  }
  draw(c, time) {
    this.drawAthletes(c, time);
    // front posts and ropes over the fighters, flexing when someone bounces
    const gy = this.groundY;
    for (const x of [this.ropeL - 18, this.ropeR + 18]) {
      c.fillStyle = '#b6bdcf'; c.fillRect(x - 8, gy - 230, 16, 230);
      c.fillStyle = '#ff4f5e'; c.fillRect(x - 10, gy - 238, 20, 14);
    }
    for (let i = 0; i < 3; i++) {
      const y = gy - 200 + i * 62;
      c.strokeStyle = ['#ff4f5e', '#f6f7fb', '#4f8dff'][i]; c.lineWidth = 6; c.lineCap = 'round';
      c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(this.ropeL - 18, y);
      c.quadraticCurveTo(W / 2, y + 6 + (this.ropeK[0] + this.ropeK[1]) * 8, this.ropeR + 18, y); c.stroke();
      c.globalAlpha = 1;
    }
    this.drawMarker(c);
    const p = this.player;
    if (p && p.loading && !p.ai && p.loading.t > 0.12) this.drawCharge(c, p, p.holdK, { color: '#ff8a2a' });
  }
  focus() { const [a, b] = this.athletes; return { x: (a.root.x + b.root.x) / 2, y: this.groundY - 190 }; }
  camZoom(view) { return clamp(0.78 / view.scale, 1.22, 1.5); }

  hud() {
    const [a, b] = this.athletes;
    return { clock: this.clockText(this.clock), sub: 'ROUND ' + Math.min(3, this.round) + ' OF 3', hp: [a.hp / 100, b.hp / 100], dots: this.rounds };
  }
  result() {
    const [a, b] = this.rounds;
    return { winner: this.winner, score: [a, b], line: `${a} - ${b}`, stats: [[this.stats.landed, 'PUNCHES LANDED'], [this.stats.thrown ? Math.round(this.stats.landed / this.stats.thrown * 100) + '%' : '0%', 'ACCURACY'], [this.stats.kos, 'KNOCKOUTS']] };
  }
}

SPORTS.boxing = {
  id: 'boxing', name: 'BOXING', color: '#ff4f5e', icon: 'boxing',
  blurb: 'Three rounds in the ring. Knock them out or win on points.',
  controls: { action: 'PUNCH', alt: 'BLOCK', mod: 'UPPERCUT', actionIcon: 'punch', altIcon: 'block' },
  hint: 'TAP PUNCH TO JAB · HOLD PUNCH FOR A HAYMAKER (DOWN = UPPERCUT) · HOLD BLOCK TO GUARD',
  create: (host, o) => new Boxing(host, o),
};
