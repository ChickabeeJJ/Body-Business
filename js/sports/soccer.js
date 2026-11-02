'use strict';
/* =========================================================================
   Soccer: 1v1 on a floodlit pitch. Walk into the ball to dribble, hold
   KICK for power (it aims itself at goal when you face it), hold DOWN for a
   chip, jump for headers, SLIDE to tackle. First to 5, or most goals in
   90 seconds (a draw goes to golden goal).
   ========================================================================= */

class Soccer extends Sport {
  constructor(host, o) {
    super(host, o);
    this.id = 'soccer';
    this.groundY = 790;
    this.arena = { look: 'stadium', standsTop: 236 };
    this.goalW = 96;
    this.barY = this.groundY - 196;
    const gw = this.goalW, by = this.barY;
    this.field = {
      groundY: this.groundY, minX: 0, maxX: W, ceil: -1500,
      segs: [
        { ax: 0, ay: by, bx: gw, by, w: 4, e: 0.45, tag: 'bar' },
        { ax: W - gw, ay: by, bx: W, by, w: 4, e: 0.45, tag: 'bar' },
      ],
      pegs: [{ x: gw, y: by, r: 6, e: 0.6, tag: 'post' }, { x: W - gw, y: by, r: 6, e: 0.6, tag: 'post' }],
    };
    this.clock = this.demo ? 60 : 90;
    this.golden = false;
    this.startEvery = true;
    const bounds = { minX: 22, maxX: W - 22 };
    this.makeAthlete(0, 520, { bounds, speed: 380 });
    this.makeAthlete(1, 1080, { bounds, speed: 380 });
    this.ball = new Ball('soccer', W / 2, 420);
    this.stats = { shots: 0, tackles: 0, headers: 0 };
    this.reset(true);
  }

  reset() {
    const [a, b] = this.athletes;
    a.place(520, 1); b.place(1080, -1);
    for (const t of this.athletes) t.charging = null;
    this.ball.set(W / 2, 430, rand(-40, 40), 0);
    this.ball.kicker = null;
    this.stuckT = 0;
  }
  dirOf(a) { return a.team === 0 ? 1 : -1; }

  /* ---------------------------------------------------------- input */
  press(a, btn) {
    if (!a.canAct) return;
    if (btn === 'action') {
      if (a.act || a.charging) return;
      a.charging = { t: 0 };
      a.hold = 'kickcharge';
    } else if (btn === 'alt') {
      if (a.act || !this.cool(a, 'slide') || !a.root.grounded) return;
      a.charging = null; a.hold = null;
      a.play('slide', 0.52, { lock: true, hit: false, touched: false });
      a.startDash(a.facing * 780, null, 0.34);
      this.setCd(a, 'slide', 1.3);
      this.sfx('swoosh');
      this.fx.dust(a.root.x, this.groundY, 8, '#9ccf8a', -a.facing);
    }
  }
  release(a, btn) {
    if (btn !== 'action' || !a.charging) return;
    const k = clamp(a.charging.t / 0.55, 0, 1);
    a.charging = null; a.hold = null;
    if (!a.canAct) return;
    const chip = a.ai ? !!a.brain.chip : !!this.host.input.modHeld;
    a.lift = chip ? 0.9 : 0.15 + k * 0.4;
    a.play('kick', 0.3, { move: 0.25, k, chip, kicked: false });
    this.sfx('swing');
  }

  kickBall(a) {
    const act = a.act, b = this.ball, f = a.facing;
    const k = act.k;
    let power = lerp(980, 1780, k) * (a.ai ? 0.86 + this.skillOf(a) * 0.16 : 1), theta = lerp(0.16, 0.3, k);
    if (act.chip) { power = lerp(950, 1250, k); theta = 0.82; }
    // facing the goal: aim at the middle of the mouth, like a real striker would
    const goalX = f > 0 ? W - this.goalW * 0.5 : this.goalW * 0.5;
    const dx = (goalX - b.x) * f;
    if (!act.chip && f === this.dirOf(a) && dx > 60 && dx < 1250) {
      const ty = this.barY + 78 - (b.y - this.groundY) * 0;
      const g = b.g, v = power, dy = b.y - ty;   // +dy = target above
      const disc = v ** 4 - g * (g * dx * dx + 2 * dy * v * v);
      if (disc > 0) theta = Math.atan((v * v - Math.sqrt(disc)) / (g * dx));
    }
    theta += this.err(a, 0.22) + (a.ai ? 0 : rand(-0.025, 0.025));
    b.vx = Math.cos(theta) * power * f;
    b.vy = -Math.sin(theta) * power;
    b.spin = -f * 8;
    b.last = a;
    act.kicked = true;
    b.kickCd = 0.07;
    b.kicker = a;
    this.stats.shots += a.team === 0 ? 1 : 0;
    this.sfx('kick', k);
    this.shake(2 + k * 4);
    this.fx.ring(b.x, b.y, '#ffffff', 40 + k * 30, 0.25, 4);
    if (k > 0.8) this.fx.burst(b.x, b.y, '#ffffff', 10, 380, { size: 4, life: 0.3 });
  }

  /* ----------------------------------------------------------- tick */
  tick(dt) {
    const b = this.ball, [p0, p1] = this.athletes;
    if (this.live) {
      this.clock -= dt;
      if (this.clock <= 0 && !this.golden) {
        if (this.score[0] !== this.score[1]) { this.finish(this.score[0] > this.score[1] ? 0 : 1); }
        else { this.golden = true; this.banner('GOLDEN GOAL', 'go'); this.sfx('whistle'); }
      }
    }
    for (const a of this.athletes) {
      if (a.charging) {
        a.charging.t += dt;
        a.holdK = clamp(a.charging.t / 0.55, 0, 1);
        if (!a.canAct) { a.charging = null; if (a.hold === 'kickcharge') a.hold = null; }
      }
      if (this.phase === 'play' || this.phase === 'intro') this.autoFace(a, b.x);
      a.update(dt);
    }
    separate(p0, p1, 38);
    const order = this.turnOrder();
    for (const a of order) {
      const act = a.act;
      if (!act) continue;
      if (act.id === 'kick' && !act.kicked && this.phase !== 'over') {
        const { ph } = a.phase();
        if (ph === 1 && !(b.kickCd > 0)) {
          const zx = a.root.x + a.facing * 30, zy = a.root.y - 28 - a.lift * 30;
          const ft = a.foot();
          if (dist(zx, zy, b.x, b.y) < 46 + b.r || dist(ft.x, ft.y, b.x, b.y) < b.r + 26) this.kickBall(a);
        }
      }
      if (act.id === 'slide') {
        const o = this.opp(a);
        if (!act.hit && o.mode === 'active' && Math.abs(o.root.x - a.root.x) < 58 && Math.abs(o.root.y - a.root.y) < 70) {
          act.hit = true;
          o.knock(a.facing * 360, -330, P.FFOOT, 0.9);
          o.charging = null;
          this.shake(6);
          this.sfx('tackle');
          this.fx.dust(o.root.x, this.groundY, 10, '#9ccf8a', a.facing);
          if (a.team === 0) this.stats.tackles++;
        }
        if (!act.touched && dist(a.foot().x, a.foot().y, b.x, b.y) < b.r + 30) {
          act.touched = true;
          b.vx = a.facing * 760 + a.root.vx * 0.3; b.vy = -260; b.last = a;
          this.sfx('kick', 0.3);
        }
      }
    }
    b.kickCd = Math.max(0, (b.kickCd || 0) - dt);
    const hit = b.step(dt, this.field);
    if (hit && hit.v > 160) this.sfx(hit.type === 'bar' || hit.type === 'post' ? 'post' : 'bounce', clamp(hit.v / 1200, 0.1, 1));
    if (hit && (hit.type === 'bar' || hit.type === 'post') && hit.v > 400) { this.shake(4); this.hype = Math.max(this.hype, 0.6); }
    for (const a of order) {
      const c = b.collideAthlete(a, { cap: 1100 });
      if (!c) continue;
      if (c.fresh && c.v > 220) this.sfx('thump', clamp(c.v / 1400, 0.1, 1));
      if (c.head && c.fresh && !a.root.grounded && this.phase === 'play') {
        // headers get a nudge toward goal so they feel deliberate
        const d = this.dirOf(a);
        b.vx = b.vx * 0.5 + d * 520; b.vy = Math.min(b.vy, 0) - 160;
        this.sfx('header');
        if (a.team === 0) this.stats.headers++;
      }
    }
    // ball stuck resting on a crossbar: roll it off the back
    if (b.y < this.barY && (b.x < this.goalW + 8 || b.x > W - this.goalW - 8) && b.speed < 60) {
      this.stuckT += dt;
      if (this.stuckT > 0.8) { b.vx = b.x < W / 2 ? 160 : -160; b.vy = -120; this.stuckT = 0; }
    } else this.stuckT = 0;
    if (this.live) {
      if (b.x < this.goalW - b.r * 0.4 && b.y > this.barY + 4) this.goal(1);
      else if (b.x > W - this.goalW + b.r * 0.4 && b.y > this.barY + 4) this.goal(0);
    }
  }
  goal(team) {
    this.ownGoals = (this.ownGoals || 0) + (this.ball.kicker && this.ball.kicker.team !== team ? 1 : 0);
    this.noKick = (this.noKick || 0) + (this.ball.kicker ? 0 : 1);
    this.point(team, 'GOAL!', { at: { x: this.ball.x, y: this.ball.y } });
    this.sfx('net');
    this.shake(8);
    if (this.golden) this.pointHold = 2.0;
  }
  checkWin() {
    if (this.over) return true;
    const [a, b] = this.score;
    if (a >= 5 || b >= 5 || (this.golden && a !== b) || (this.clock <= 0 && a !== b)) { this.finish(a > b ? 0 : 1); return true; }
    return false;
  }

  /* ------------------------------------------------------------- AI */
  ai(a, dt) {
    const b = this.ball, br = a.brain, d = this.dirOf(a), o = this.opp(a);
    const ownX = d > 0 ? 0 : W;
    br.t -= dt;
    if (br.t <= 0) {
      br.t = this.reactOf(a) + rand(0, 0.08);
      const sk = this.skillOf(a);
      const lead = 0.12 + sk * 0.2;
      const px = clamp(b.x + b.vx * lead, 40, W - 40);
      const ahead = (px - a.root.x) * d > -8;
      const oppBall = o.mode === 'active' && Math.abs(o.root.x - b.x) < 80 && b.y > this.groundY - 90 && Math.abs(o.root.x - b.x) + 20 < Math.abs(a.root.x - b.x);
      const danger = Math.abs(b.x - ownX) < 560;
      br.defend = false;
      if (oppBall && this.rng() < 0.3 + sk * 0.6) {
        // jockey: stay goal-side of the dribbler instead of diving in
        br.tx = b.x - d * (90 + (1 - sk) * 60);
        br.defend = true;
      } else if (ahead) br.tx = px - d * 24;
      else br.tx = danger ? Math.max(0, (px - ownX) * d - 90) * d + ownX + d * 0 : px - d * 80;
      // keeper instinct: a fast shot at our goal (better players read it more often)
      br.keeperJump = 0;
      if (b.vx * d < -500 && Math.abs(b.x - ownX) < 700 && this.rng() < 0.25 + sk * 0.75) {
        const pr = b.simulate(this.field, 1.2, (x) => Math.abs(x - (ownX + d * 140)) < 20);
        if (pr) { br.tx = ownX + d * 140; br.keeperJump = pr.y < this.groundY - 150 && pr.y > this.groundY - 330 ? pr.t : 0; }
      }
      br.tx += this.err(a, 90);
    }
    this.walkTo(a, br.tx, 10);
    // face where we walk, or toward the attack when standing behind the ball
    if (a.canAct && !a.act) {
      if (Math.abs(a.input.x) > 0.2) a.facing = a.input.x > 0 ? 1 : -1;
      else a.facing = d;
    }
    if (!a.canAct || a.act) return;
    const rx = (b.x - a.root.x) * a.facing, hy = a.root.y - b.y;
    // jump over the ball when it sits between us and where we're going
    // jump over the ball when it sits between us and where we're going (never dribble it into our own net)
    const toward = (b.x - a.root.x) * a.input.x > 0;
    if (a.root.grounded && toward && (b.x - a.root.x) * (br.tx - a.root.x) > 0 && Math.abs(b.x - a.root.x) < 100 && Math.abs(b.x - a.root.x) > 40 && hy < 60 && Math.sign(br.tx - a.root.x) !== d && Math.abs(br.tx - b.x) > 20) a.jump();
    // headers and keeper jumps
    if (a.root.grounded && Math.abs(b.x - a.root.x) < 90 && hy > 150 && hy < 340 && b.vy > -200) a.jump();
    if (br.keeperJump && br.keeperJump < 0.45 && a.root.grounded) { a.jump(); br.keeperJump = 0; }
    if (br.keeperJump) br.keeperJump -= dt;
    // kick
    if (!a.charging && a.facing === d && rx > -12 && rx < 64 && hy < 120 && hy > -10 && this.cool(a, 'kickTry')) {
      this.setCd(a, 'kickTry', 0.25);
      const toGoal = Math.abs((d > 0 ? W : 0) - b.x);
      const sk = this.skillOf(a);
      const blocker = (o.root.x - b.x) * d > 0 && Math.abs(o.root.x - b.x) < 240 && o.mode === 'active';
      // good players don't blast it into a body at point blank: they chip it or keep dribbling
      if (blocker && Math.abs(o.root.x - b.x) < 150 && this.rng() < sk * 0.8 && !(this.rng() < sk * 0.7)) { this.setCd(a, 'kickTry', 0.35); return; }
      br.chip = toGoal > 330 && toGoal < 1000 && blocker && this.rng() < sk * 0.85;
      br.chargeT = clamp(lerp(0.1, 0.18, sk) + toGoal / 1500 + this.err(a, 0.2), 0.05, 0.55);
      this.press(a, 'action');
    }
    if (a.charging && a.charging.t >= br.chargeT) this.release(a, 'action');
    // slide tackle the human when they have the ball
    if (this.cool(a, 'slide') && o.mode === 'active' && Math.abs(o.root.x - b.x) < 60 && Math.abs(a.root.x - o.root.x) < 170 && Math.abs(a.root.x - o.root.x) > 60 && this.cool(a, 'slideTry')) {
      this.setCd(a, 'slideTry', 0.6);
      if (this.rng() < this.aggrOf(a) * (br.defend ? 0.7 : 0.3)) { a.facing = o.root.x > a.root.x ? 1 : -1; this.press(a, 'alt'); }
    }
  }

  /* ----------------------------------------------------------- draw */
  paintStatic(g) {
    const gy = this.groundY, top = gy - 44, bot = gy + 46;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    // halfway line and centre circle, in perspective
    g.beginPath(); g.moveTo(W / 2 - 10, top + 2); g.lineTo(W / 2 + 10, bot - 2); g.stroke();
    g.beginPath(); g.ellipse(W / 2, gy, 120, 36, 0, 0, TAU); g.stroke();
    // boxes
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 0 : W;
      g.beginPath(); g.moveTo(x0, top + 6); g.lineTo(x0 + s * 250, top + 6); g.lineTo(x0 + s * 290, bot - 6); g.lineTo(x0, bot - 6); g.stroke();
    }
    // goal nets (behind the players)
    for (const s of [1, -1]) {
      const xa = s > 0 ? 6 : W - 6, xb = s > 0 ? this.goalW : W - this.goalW;
      g.fillStyle = 'rgba(10,14,26,0.35)'; g.fillRect(Math.min(xa, xb), this.barY, Math.abs(xb - xa), gy - this.barY);
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1.2;
      for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x += 12) { g.beginPath(); g.moveTo(x, this.barY); g.lineTo(x, gy); g.stroke(); }
      for (let y = this.barY; y <= gy; y += 12) { g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke(); }
      g.strokeStyle = '#d9dde6'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(xa, gy); g.lineTo(xa, this.barY); g.stroke();
    }
  }
  draw(c, time) {
    const b = this.ball;
    b.drawShadow(c, this.groundY);
    this.drawAthletes(c, time);
    b.draw(c);
    // front of the goals over everything
    for (const s of [1, -1]) {
      const xa = s > 0 ? 4 : W - 4, xb = s > 0 ? this.goalW : W - this.goalW;
      c.strokeStyle = '#f6f7fb'; c.lineWidth = 8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(xa, this.barY); c.lineTo(xb, this.barY); c.lineTo(xb, this.groundY); c.stroke();
    }
    this.drawMarker(c);
    const p = this.player;
    if (p && p.charging && !p.ai) this.drawCharge(c, p, p.holdK);
  }
  focus() { return { x: (this.ball.x * 2 + this.player.root.x) / 3, y: Math.min(this.ball.y, this.groundY - 160) }; }

  hud() {
    return {
      clock: this.golden ? 'GOLDEN' : this.clockText(this.clock),
      sub: this.golden ? 'NEXT GOAL WINS' : 'FIRST TO 5',
    };
  }
  result() {
    const [a, b] = this.score;
    return {
      winner: this.winner, score: [a, b], line: `${a} - ${b}`,
      stats: [[a, 'GOALS'], [this.stats.shots, 'SHOTS'], [this.stats.tackles + this.stats.headers, 'TACKLES + HEADERS']],
    };
  }
}

SPORTS.soccer = {
  id: 'soccer', name: 'SOCCER', color: '#45e08a', icon: 'soccer',
  blurb: '1v1 football. First to 5, or most goals in 90 seconds.',
  controls: { action: 'KICK', alt: 'SLIDE', mod: 'CHIP', actionIcon: 'kick', altIcon: 'slide' },
  hint: 'HOLD KICK FOR POWER · DOWN + KICK TO CHIP · JUMP FOR HEADERS',
  create: (host, o) => new Soccer(host, o),
};
