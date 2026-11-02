'use strict';
/* =========================================================================
   Hoops: 1v1 full-court basketball. Walk up to the ball to pick it up and
   dribble. Hold SHOOT and release in the green zone; shots from behind
   the arc are worth 3. Jump and press SHOOT near the rim to dunk. On
   defence, SHOOT swipes for a steal, SHOVE knocks a dribbler over, and
   jumping raises your hands to block. Most points in 90 seconds.
   ========================================================================= */

class Hoops extends Sport {
  constructor(host, o) {
    super(host, o);
    this.id = 'hoops';
    this.groundY = 790;
    this.arena = { look: 'indoor', standsTop: 250 };
    this.rimY = 468;
    // rims: back peg near the board, front peg out over the floor
    this.hoops = [
      { board: 70, back: 88, front: 162, dir: 1 },
      { board: W - 70, back: W - 88, front: W - 162, dir: -1 },
    ];
    const hp = this.hoops;
    this.field = {
      groundY: this.groundY, minX: 0, maxX: W, ceil: -900,
      segs: hp.map(h => ({ ax: h.board, ay: 372, bx: h.board, by: 506, w: 5, e: 0.55, tag: 'board' })),
      pegs: hp.flatMap(h => [{ x: h.back, y: this.rimY, r: 4, e: 0.5, tag: 'rim' }, { x: h.front, y: this.rimY, r: 4, e: 0.5, tag: 'rim' }]),
    };
    this.clock = this.demo ? 50 : 90;
    this.overtime = false;
    const bounds = { minX: 30, maxX: W - 30 };
    this.makeAthlete(0, 600, { bounds, speed: 400, jumpV: 1080 });
    this.makeAthlete(1, 1000, { bounds, speed: 400, jumpV: 1080 });
    this.ball = new Ball('basket', W / 2, 300);
    this.netK = [0, 0];
    this.stats = { pts: 0, threes: 0, dunks: 0, steals: 0, blocks: 0 };
    this.reset(true);
  }

  // team 0 attacks the right hoop, team 1 the left
  hoopOf(a) { return this.hoops[a.team === 0 ? 1 : 0]; }
  rimX(h) { return (h.back + h.front) / 2; }
  dirOf(a) { return a.team === 0 ? 1 : -1; }

  reset(first) {
    const [a, b] = this.athletes;
    const b0 = this.ball;
    b0.held = null; b0.shot = null; b0.pickCd = new Map();
    if (first) {
      a.place(600, 1); b.place(1000, -1);
      b0.set(W / 2, 360, 0, -200);   // jump ball
      if (!this.demo) this.hint = 1;
    } else {
      // the team that conceded inbounds from its own end
      const t = 1 - this.lastScorer, att = this.athletes[t], def = this.athletes[1 - t];
      const own = t === 0 ? 260 : W - 260;
      att.place(own, t === 0 ? 1 : -1);
      def.place(W / 2 + (t === 0 ? -60 : 60), t === 0 ? -1 : 1);
      this.give(att);
    }
    for (const t of this.athletes) { t.aiming = null; t.brain.spot = null; }
  }
  give(a) {
    const b = this.ball;
    b.held = a; b.shot = null; b.dribble = 0;
    a.hold = 'dribble';
  }
  drop(vx, vy) {
    const b = this.ball, h = b.held;
    if (!h) return;
    b.held = null;
    b.pickCd.set(h, 0.5);
    b.vx = vx; b.vy = vy;
    if (h.hold === 'dribble' || h.hold === 'aimshot' || h.hold === 'carryball') h.hold = null;
    h.aiming = null;
  }

  /* ---------------------------------------------------------- input */
  press(a, btn) {
    const b = this.ball;
    if (!a.canAct) return;
    if (btn === 'action') {
      if (b.held === a) {
        const h = this.hoopOf(a), rx = this.rimX(h);
        if (!a.root.grounded && Math.abs(a.root.x - rx) < 240 && a.head().y < this.rimY + 170 && !a.act) return this.dunk(a, h);
        if (a.aiming || a.act) return;
        a.aiming = { t: 0 };
        a.hold = 'aimshot';
      } else if (!a.act && this.cool(a, 'swipe')) {
        a.play('swipe', 0.32, { move: 0.6, done: false });
        this.setCd(a, 'swipe', 0.6);
        this.sfx('whiff');
      }
    } else if (btn === 'alt') {
      if (a.act || !this.cool(a, 'alt')) return;
      if (b.held === a) {
        // crossover: a quick burst past the defender
        if (!a.root.grounded) return;
        a.startDash(a.facing * 760, null, 0.2);
        this.setCd(a, 'alt', 1.1);
        this.sfx('swoosh');
        this.fx.dust(a.root.x, this.groundY, 6, '#c58d50', -a.facing);
      } else {
        a.play('shove', 0.4, { move: 0.3, done: false });
        this.setCd(a, 'alt', 1.4);
        this.sfx('whiff');
      }
    }
  }
  release(a, btn) {
    if (btn !== 'action' || !a.aiming) return;
    const k = a.holdK;
    a.aiming = null;
    if (this.ball.held !== a || !a.canAct) { if (a.hold === 'aimshot') a.hold = null; return; }
    this.shoot(a, k);
  }
  meter(t) { const u = (t / 0.85) % 2; return u < 1 ? u : 2 - u; }
  zone(a) {
    const d = Math.abs(a.root.x - this.rimX(this.hoopOf(a)));
    const w = d < 300 ? 0.2 : d < 600 ? 0.14 : 0.1;   // closer shots are easier
    return [0.86 - w / 2 - 0.02, 0.86 + w / 2 - 0.02];
  }

  shoot(a, k) {
    const b = this.ball, h = this.hoopOf(a), rx = this.rimX(h);
    const hand = a.hand();
    const x0 = (a.pts[P.FHAND].x + a.pts[P.BHAND].x) / 2, y0 = Math.min(hand.y, a.head().y - 20) - 6;
    const dist0 = Math.abs(a.root.x - rx);
    const [z0, z1] = this.zone(a);
    let miss = 0;
    if (k < z0) miss = -(z0 - k);
    else if (k > z1) miss = k - z1;
    if (a.ai) miss = this.err(a, 0.5) * (this.rng() < this.skillOf(a) * 0.85 ? 0.15 : 1);
    // aim a hair past the rim centre; a miss lands short or long
    const tx = rx + h.dir * -2 + miss * h.dir * -210 * (0.6 + dist0 / 900);
    const ty = this.rimY - 4;
    const t = 0.72 + 0.32 * clamp(dist0 / 900, 0, 1);
    b.held = null; b.x = x0; b.y = y0;
    let vx = (tx - x0) / t, vy = (ty - y0 - 0.5 * b.g * t * t) / t;
    // correct for drag with a couple of quick simulated passes
    for (let i = 0; i < 3; i++) {
      b.vx = vx; b.vy = vy;
      const r = b.simulate({ groundY: this.groundY }, 3, (x, y, svx, svy) => svy > 0 && y >= ty);
      if (!r) break;
      vx += (tx - r.x) / Math.max(0.3, r.t);
    }
    b.vx = vx; b.vy = vy; b.spin = -h.dir * 10;
    b.shot = { by: a, t: 0, three: dist0 > 470, from: a.root.x };
    b.pickCd.set(a, 0.35);
    a.hold = null;
    a.play('shoot', 0.42, { move: 0.2 });
    this.sfx('swing');
    if (!miss && !a.ai) this.fx.text(a.head().x, a.head().y - 50, 'PERFECT', '#45e08a', 22, { dur: 0.8 });
  }

  dunk(a, h) {
    const b = this.ball, rx = this.rimX(h);
    a.hold = null; a.aiming = null;
    a.play('dunk', 0.45, { lock: true });
    a.startDash((rx - h.dir * 30 - a.root.x) * 3.2, Math.min(a.root.vy, -200), 0.2);
    b.held = null;
    b.dunking = { a, t: 0.16, rx };
    b.shot = { by: a, t: 0, dunk: true };
    this.sfx('swoosh');
  }

  /* ----------------------------------------------------------- tick */
  tick(dt) {
    const b = this.ball, [p0, p1] = this.athletes;
    if (this.live) {
      this.clock -= dt;
      if (this.clock <= 0 && !this.overtime) {
        if (this.score[0] !== this.score[1]) { this.sfx('buzzer'); this.finish(this.score[0] > this.score[1] ? 0 : 1); }
        else { this.overtime = true; this.banner('OVERTIME', 'go'); this.sfx('buzzer'); }
      }
    }
    for (const a of this.athletes) {
      if (a.aiming) {
        a.aiming.t += dt;
        a.holdK = this.meter(a.aiming.t);
        if (b.held !== a || !a.canAct) { a.aiming = null; if (a.hold === 'aimshot') a.hold = null; }
      }
      const has = b.held === a;
      if (a.canAct && !a.act) {
        if (has && !a.aiming) a.hold = a.root.grounded ? 'dribble' : 'carryball';
        else if (!has && a.hold !== 'celebrate' && a.hold !== 'sad') a.hold = !a.root.grounded ? 'reach' : null;
      }
      if (this.phase === 'play' || this.phase === 'intro') {
        if (has) { if (!a.aiming) this.autoFace(a, this.rimX(this.hoopOf(a))); else a.facing = this.hoopOf(a).dir * -1; }
        else this.autoFace(a, b.held ? b.held.root.x : b.x);
      }
      a.update(dt);
    }
    separate(p0, p1, 40);
    // swipes and shoves
    const order = this.turnOrder();
    for (const a of order) {
      const act = a.act, o = this.opp(a);
      if (!act || act.done) continue;
      const { ph } = a.phase();
      if (ph !== 1) continue;
      if (act.id === 'swipe') {
        act.done = true;
        if (b.held === o && dist(a.hand().x, a.hand().y, b.x, b.y) < 52 + b.r) {
          if (this.rng() < (a.ai ? 0.35 + this.skillOf(a) * 0.3 : 0.6)) {
            this.drop(a.facing * 260, -320);
            b.pickCd.set(o, 0.7);
            this.sfx('block');
            this.fx.text(b.x, b.y - 40, 'STEAL', '#ffc933', 24, { dur: 0.8 });
            if (a.team === 0) this.stats.steals++;
          }
        }
      } else if (act.id === 'shove') {
        if (o.mode === 'active' && Math.abs(o.root.x - a.root.x) < 78 && Math.abs(o.root.y - a.root.y) < 80 && (o.root.x - a.root.x) * a.facing > -10) {
          act.done = true;
          const had = b.held === o;
          o.knock(a.facing * 430, -200, P.NECK, had ? 0.7 : 0.45);
          if (had) this.drop(a.facing * 120 + rand(-60, 60), -380);
          this.sfx('tackle');
          this.shake(5);
        }
      }
    }
    // the ball
    if (b.dunking) {
      const d = b.dunking, a = d.a;
      d.t -= dt;
      const hd = a.hand();
      b.x = hd.x; b.y = hd.y - 8; b.vx = 0; b.vy = 0;
      if (d.t <= 0) {
        b.dunking = null;
        b.x = d.rx; b.y = this.rimY - 22; b.vx = 0; b.vy = 900;
        this.shake(10); this.host.flash(0.5);
        this.sfx('dunk');
      }
    } else if (b.held) {
      const a = b.held;
      if (a.mode !== 'active' && a.mode !== 'rising') this.drop(a.root.vx * 0.4, -300);
      else {
        const hd = a.hand();
        if (a.hold === 'dribble' && a.root.grounded) {
          const prev = b.dribble || 0;
          b.dribble = prev + dt * (3.4 + Math.abs(a.root.vx) / 260);
          const u = Math.abs(Math.cos(b.dribble * Math.PI));
          if (Math.floor(prev) !== Math.floor(b.dribble)) this.sfx('bounce', 0.25);
          b.x = hd.x + a.facing * 6; b.y = lerp(this.groundY - b.r, hd.y + b.r * 0.7, u);
        } else if (a.aiming) {
          b.x = (a.pts[P.FHAND].x + a.pts[P.BHAND].x) / 2; b.y = Math.min(a.pts[P.FHAND].y, a.pts[P.BHAND].y) - b.r * 0.6;
        } else { b.x = hd.x + a.facing * 8; b.y = hd.y - 2; }
        b.vx = a.root.vx; b.vy = a.root.vy; b.ang += dt * 4;
      }
    } else {
      const py = b.y;
      const hit = b.step(dt, this.field);
      if (hit && hit.v > 120) {
        if (hit.type === 'rim') { this.sfx('rim', clamp(hit.v / 900, 0, 1)); if (b.shot) b.shot.rim = true; }
        else if (hit.type === 'board') this.sfx('board', clamp(hit.v / 900, 0, 1));
        else this.sfx('bounce', clamp(hit.v / 1000, 0.1, 0.8));
      }
      if (b.shot) b.shot.t += dt;
      for (const a of order) {
        if (b.shot && b.shot.by === a && b.shot.t < 0.35) continue;
        const c = b.collideAthlete(a, { cap: 1800 });
        if (c && c.fresh && b.shot && b.shot.by !== a && c.hand && !a.root.grounded && c.v > 200) {
          this.sfx('block'); this.shake(4);
          this.fx.text(b.x, b.y - 40, 'BLOCKED', '#ff8a94', 24, { dur: 0.8 });
          b.vx = this.opp(a) ? -this.dirOf(this.opp(a)) * 380 : b.vx; b.vy = Math.min(b.vy, -100);
          if (a.team === 0) this.stats.blocks++;
          b.shot = null;
        } else if (c && c.fresh && c.v > 200) this.sfx('thump', 0.3);
      }
      // through the hoop, top to bottom
      for (const h of this.hoops) {
        const lo = Math.min(h.back, h.front) + 6, hi = Math.max(h.back, h.front) - 6;
        if (py < this.rimY && b.y >= this.rimY && b.x > lo && b.x < hi && b.vy > 0) this.basket(h);
      }
      // pick up loose balls
      if (this.phase === 'play' || this.phase === 'intro') {
        let best = null, bd = 1e9;
        for (const a of this.athletes) {
          if (!a.canAct || (b.pickCd.get(a) || 0) > 0) continue;
          if (b.shot && b.shot.t < 0.6 && !b.shot.rim) continue;
          const ch = a.chest(), hd = a.hand();
          const d = Math.min(dist(ch.x, ch.y + 30, b.x, b.y), dist(hd.x, hd.y, b.x, b.y));
          if (d < 50 + b.r && d < bd) { bd = d; best = a; }
        }
        if (best) { this.give(best); this.sfx('thump', 0.25); }
      }
    }
    for (const [k, v] of b.pickCd) { if (v - dt <= 0) b.pickCd.delete(k); else b.pickCd.set(k, v - dt); }
    this.netK = this.netK.map(v => Math.max(0, v - dt * 2.5));
  }

  basket(h) {
    const b = this.ball, scorer = h === this.hoops[1] ? 0 : 1;
    const shot = b.shot;
    const dunk = shot && shot.dunk && shot.by.team === scorer;
    const three = shot && shot.three && shot.by.team === scorer;
    const swish = shot && !shot.rim && !dunk;
    const pts = three ? 3 : 2;
    this.netK[h === this.hoops[0] ? 0 : 1] = 1;
    this.sfx(swish ? 'swish' : 'net');
    b.vx *= 0.3; b.vy = Math.min(b.vy, 360);
    if (this.phase !== 'play') return;
    if (scorer === 0) { this.stats.pts += pts; if (three) this.stats.threes++; if (dunk) this.stats.dunks++; }
    const label = dunk ? 'SLAM DUNK!' : three ? '3 POINTER!' : swish ? 'SWISH!' : 'BUCKET!';
    this.fx.text(this.rimX(h), this.rimY - 70, '+' + pts, '#ffc933', 34, { dur: 1 });
    this.point(scorer, label, { value: pts, at: { x: this.rimX(h), y: this.rimY }, hold: 1.4, slow: dunk ? 0.6 : 0.3 });
    b.shot = null;
  }
  checkWin() {
    if (this.over) return true;
    const [a, b] = this.score;
    if ((this.overtime || this.clock <= 0) && a !== b) { this.finish(a > b ? 0 : 1); return true; }
    return false;
  }

  /* ------------------------------------------------------------- AI */
  ai(a, dt) {
    const b = this.ball, br = a.brain, o = this.opp(a), d = this.dirOf(a);
    const h = this.hoopOf(a), rx = this.rimX(h), ownRx = this.rimX(this.hoops[a.team === 0 ? 0 : 1]);
    br.t -= dt;
    if (b.held === a) {
      if (!br.spot) {
        const r = this.rng(), sk = this.skillOf(a);
        br.drive = r < 0.25 + sk * 0.2;
        br.spot = br.drive ? rx - d * 150 : r < 0.55 ? rx - d * rand(500, 600) : rx - d * rand(250, 470);
        br.spotT = 0;
      }
      br.spotT += dt;
      if (!a.aiming) this.walkTo(a, br.spot, 16);
      else a.input.x = 0;
      // blow past a defender standing right in front
      if (Math.abs(o.root.x - a.root.x) < 70 && (o.root.x - a.root.x) * d > 0 && this.cool(a, 'alt') && this.rng() < dt * 1.5 * this.aggrOf(a)) this.press(a, 'alt');
      if (br.drive) {
        const dx = Math.abs(a.root.x - rx);
        if (a.root.grounded && dx < 300 && dx > 150 && a.canAct) { a.facing = -h.dir; a.jump(); }
        if (!a.root.grounded && a.root.vy > -380 && dx < 190) this.press(a, 'action');
        if (br.spotT > 3.5) br.drive = false;
      } else if ((Math.abs(a.root.x - br.spot) < 30 || br.spotT > 3) && !a.aiming && a.root.grounded && a.canAct) {
        a.facing = -h.dir;
        this.press(a, 'action');
        const [z0, z1] = this.zone(a);
        br.relK = clamp((z0 + z1) / 2 + this.err(a, 0.35), 0.06, 0.97);
      }
      if (a.aiming && a.aiming.t > 0.25 && Math.abs(a.holdK - br.relK) < 0.04) this.release(a, 'action');
      if (a.aiming && a.aiming.t > 2.2) this.release(a, 'action');
    } else {
      br.spot = null;
      if (b.held === o) {
        // stay between the dribbler and our hoop
        const side = Math.sign(ownRx - o.root.x) || -d;
        br.tx = o.root.x + side * 62;
        this.walkTo(a, br.tx, 8);
        const close = Math.abs(o.root.x - a.root.x) < 90;
        if (o.aiming && Math.abs(o.root.x - a.root.x) < 150 && a.root.grounded && this.rng() < this.skillOf(a) * dt * 6) a.jump();
        if (close && this.cool(a, 'swipe') && this.rng() < dt * 2.2 * this.aggrOf(a)) { a.facing = Math.sign(o.root.x - a.root.x) || 1; this.press(a, 'action'); }
        if (close && this.cool(a, 'alt') && this.rng() < dt * 0.6 * this.aggrOf(a)) { a.facing = Math.sign(o.root.x - a.root.x) || 1; this.press(a, 'alt'); }
      } else if (!b.dunking) {
        // loose ball: chase where it will come down
        const pr = b.predictAt(this.field, this.groundY - 120, 1.5);
        br.tx = pr ? pr.x : b.x;
        this.walkTo(a, br.tx + this.err(a, 40), 8);
        if (a.root.grounded && Math.abs(b.x - a.root.x) < 80 && b.y < a.root.y - 190 && b.y > a.root.y - 380 && b.vy > -100) a.jump();
      }
    }
  }

  /* ----------------------------------------------------------- draw */
  paintStatic(g) {
    const gy = this.groundY, top = gy - 44, bot = gy + 46;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2 - 8, top + 2); g.lineTo(W / 2 + 8, bot - 2); g.stroke();
    g.beginPath(); g.ellipse(W / 2, gy, 100, 30, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,201,51,0.22)';
    g.beginPath(); g.ellipse(W / 2, gy, 98, 28, 0, 0, TAU); g.fill();
    for (const h of this.hoops) {
      const rx = this.rimX(h), s = h.dir;
      // the key (paint) and the three point arc on the floor
      g.fillStyle = 'rgba(79,141,255,0.25)';
      g.beginPath(); g.moveTo(h.board, top + 4); g.lineTo(h.board + s * 270, top + 4); g.lineTo(h.board + s * 300, bot - 4); g.lineTo(h.board, bot - 4); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
      // three point line: a stripe across the floor at the arc's distance
      const tx = rx + s * 470;
      g.beginPath(); g.moveTo(tx - 6 * s, top + 2); g.lineTo(tx + 6 * s, bot - 2); g.stroke();
      g.font = '900 15px Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('3PT', tx - s * 34, bot - 12);
    }
  }
  drawStanchion(c, h) {
    const s = h.dir, px = h.board - s * 36, gy = this.groundY;
    c.fillStyle = '#2a3046'; c.fillRect(px - 9, 500, 18, gy - 500);
    c.fillStyle = '#ff4f5e'; c.fillRect(px - 18, gy - 64, 36, 64);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(px - 18, gy - 64, 36, 6);
    c.strokeStyle = '#2a3046'; c.lineWidth = 10; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px, 506); c.lineTo(h.board, 470); c.stroke();
  }
  drawHoop(c, h, i) {
    const s = h.dir, rx = this.rimX(h);
    // backboard
    c.fillStyle = 'rgba(230,240,255,0.85)'; c.fillRect(h.board - 5, 372, 10, 134);
    c.fillStyle = '#ff4f5e'; c.fillRect(h.board - 6, 444, 12, 4);
    // net
    const nk = this.netK[i], sway = Math.sin(this.time * 30) * 4 * nk;
    const l = Math.min(h.back, h.front), r = Math.max(h.back, h.front);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.6;
    const ny = this.rimY + 52 + nk * 14;
    for (let j = 0; j <= 5; j++) {
      const u = j / 5;
      c.beginPath(); c.moveTo(lerp(l, r, u), this.rimY); c.lineTo(lerp(l + 14, r - 14, u) + sway, ny); c.stroke();
    }
    for (let k = 1; k <= 3; k++) {
      const u = k / 4, y = lerp(this.rimY, ny, u);
      c.beginPath(); c.moveTo(lerp(l, l + 14, u) + sway * u, y); c.lineTo(lerp(r, r - 14, u) + sway * u, y); c.stroke();
    }
    // rim
    c.strokeStyle = '#ff7a2a'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(h.back - s * 6, this.rimY); c.lineTo(h.front, this.rimY); c.stroke();
  }
  draw(c, time) {
    const b = this.ball;
    for (const h of this.hoops) this.drawStanchion(c, h);
    if (!b.held) b.drawShadow(c, this.groundY);
    this.drawAthletes(c, time);
    b.draw(c);
    this.hoops.forEach((h, i) => this.drawHoop(c, h, i));
    this.drawMarker(c);
    const p = this.player;
    if (p && p.aiming && !p.ai) this.drawCharge(c, p, p.holdK, { zone: this.zone(p) });
    // which side is the arc on
    if (p && !p.ai && b.held === p && !this.demo) {
      const far = Math.abs(p.root.x - this.rimX(this.hoopOf(p))) > 470;
      if (far) { c.fillStyle = '#ffc933'; c.font = '900 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('3PT', p.root.x, this.groundY + 30); }
    }
  }
  focus() { const b = this.ball; return { x: (b.x * 2 + this.player.root.x) / 3, y: Math.min(b.y, this.groundY - 200) }; }

  hud() { return { clock: this.overtime ? 'OT' : this.clockText(this.clock), sub: this.overtime ? 'NEXT BASKET WINS' : 'MOST POINTS' }; }
  result() {
    const [a, b] = this.score;
    return {
      winner: this.winner, score: [a, b], line: `${a} - ${b}`,
      stats: [[this.stats.threes, '3 POINTERS'], [this.stats.dunks, 'DUNKS'], [this.stats.steals + this.stats.blocks, 'STEALS + BLOCKS']],
    };
  }
}

SPORTS.hoops = {
  id: 'hoops', name: 'HOOPS', color: '#ff8a2a', icon: 'hoops',
  blurb: '1v1 basketball. Shoot in the green, dunk from the air.',
  controls: { action: 'SHOOT', alt: 'SHOVE', actionIcon: 'shoot', altIcon: 'shove' },
  hint: 'HOLD SHOOT, RELEASE IN THE GREEN · JUMP + SHOOT NEAR THE RIM TO DUNK · NO BALL: SHOOT STEALS',
  create: (host, o) => new Hoops(host, o),
};
