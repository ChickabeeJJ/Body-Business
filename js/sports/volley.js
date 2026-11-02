'use strict';
/* =========================================================================
   Volley: 1v1 beach volleyball. HIT bumps the ball over the net in a safe
   arc, or spikes it down hard when you are in the air near the net. Hold
   DOWN to set it up high by the net. DIVE saves a ball that's dropping out of reach. Let
   it land on your side (or hit it out) and the point goes over. First to 7.
   ========================================================================= */

class Volley extends Sport {
  constructor(host, o) {
    super(host, o);
    this.id = 'volley';
    this.groundY = 800;
    this.arena = { look: 'beach' };
    this.netX = W / 2;
    this.netTop = this.groundY - 236;
    this.courtL = 70; this.courtR = W - 70;
    this.field = {
      groundY: this.groundY, ceil: -1600,
      segs: [{ ax: this.netX, ay: this.netTop, bx: this.netX, by: this.groundY, w: 3, e: 0.25, fr: 0.5, tag: 'net' }],
      pegs: [{ x: this.netX, y: this.netTop, r: 5, e: 0.35, tag: 'tape' }],
    };
    this.target = this.demo ? 5 : 7;
    this.makeAthlete(0, 400, { bounds: { minX: 34, maxX: this.netX - 34 }, speed: 420, jumpV: 1060, style: 'beach' });
    this.makeAthlete(1, 1200, { bounds: { minX: this.netX + 34, maxX: W - 34 }, speed: 420, jumpV: 1060, style: 'beach' });
    for (const a of this.athletes) { a.kit.style = 'singlet'; }
    this.ball = new Ball('volley', 400, 500);
    this.server = 0;
    this.netK = 0;
    this.stats = { aces: 0, spikes: 0, digs: 0 };
    this.allowIntroPress = false;
    this.reset(true);
  }
  dirOf(a) { return a.team === 0 ? 1 : -1; }
  sideOf(x) { return x < this.netX ? 0 : 1; }

  reset(first) {
    if (!first) this.server = this.lastScorer;
    const s = this.athletes[this.server], r = this.athletes[1 - this.server];
    s.place(this.server === 0 ? 170 : W - 170, this.dirOf(s));
    r.place(this.server === 0 ? W - 400 : 400, this.dirOf(r));
    this.serving = { a: s, t: 0 };
    this.ball.frozen = true;
    this.ball.last = null;
    this.touches = { team: -1, n: 0 };
    this.rally = 0;
    this.placeServeBall();
  }
  placeServeBall() {
    const a = this.serving.a, b = this.ball;
    const hd = a.hand();
    b.set(hd.x + a.facing * 10, hd.y - 6);
    a.hold = 'carryball';
  }

  /* ---------------------------------------------------------- input */
  press(a, btn) {
    if (!a.canAct) return;
    if (btn === 'action') {
      if (this.serving) { if (this.serving.a === a) this.serve(a); return; }
      if (a.act || !this.cool(a, 'hit')) return;
      this.setCd(a, 'hit', 0.32);
      const air = !a.root.grounded;
      const lob = a.ai ? !!a.brain.lob : this.host.input.modHeld;
      if (air) a.play('spike', 0.3, { move: 0.8, done: false, lob });
      else a.play('bump', 0.34, { move: 0.5, done: false, lob });
      this.tryHit(a);   // a ball already in reach is played on the first frame
    } else if (btn === 'alt') {
      if (this.serving || a.act || !this.cool(a, 'dive') || !a.root.grounded) return;
      this.setCd(a, 'dive', 1.1);
      a.play('dive', 0.6, { lock: true, done: false });
      a.startDash(a.facing * 760, -260, 0.3);
      this.sfx('sand');
      this.fx.dust(a.root.x, this.groundY, 10, '#e8cb8c', -a.facing);
    }
  }

  serve(a) {
    const b = this.ball, d = this.dirOf(a);
    this.serving = null;
    a.hold = null;
    a.play('spike', 0.32, { move: 0, done: true });
    b.frozen = false;
    const tx = this.netX + d * (a.ai ? lerp(280, 600, this.rng()) : rand(300, 620));
    this.launchArc(b, tx, this.netTop - 170 - rand(0, 80));
    this.touch(a);
    this.sfx('serve'); this.sfx('bump', 0.7);
  }

  // where am I allowed to reach the ball from
  inReach(a, b) {
    const ch = a.chest(), hd = a.head();
    const fast = clamp((b.speed - 950) / 700, 0, 1);
    const r = (!a.root.grounded ? 92 : 80) - fast * 42;
    return Math.min(dist(ch.x, ch.y, b.x, b.y), dist(hd.x, hd.y - 30, b.x, b.y)) < r + b.r;
  }
  tryHit(a) {
    const act = a.act, b = this.ball;
    if (!act || act.done || b.frozen) return false;
    if (!this.inReach(a, b)) return false;
    act.done = true;
    const d = this.dirOf(a);
    const nearNet = Math.abs(b.x - this.netX) < 430;
    if (act.id === 'spike' && !act.lob && b.y < this.netTop + 20 && nearNet && this.sideOf(b.x) === a.team) {
      // spike: a hard straight line into the far court, if it clears the tape
      const tx = this.netX + d * (a.ai ? lerp(180, 560, this.rng()) : rand(200, 560));
      const dx = tx - b.x, dy = this.groundY - b.y;
      const L = Math.hypot(dx, dy), sp = 1500 + this.skillOf(a) * 200;
      const k = (this.netX - b.x) / dx, yAtNet = b.y + dy * k;
      if (yAtNet < this.netTop - b.r - 6) {
        b.vx = dx / L * sp; b.vy = dy / L * sp;
        this.sfx('spike'); this.shake(6);
        this.fx.ring(b.x, b.y, '#ffffff', 60, 0.25, 5);
        if (a.team === 0) this.stats.spikes++;
        this.touch(a);
        return true;
      }
    }
    // set: pop it up high by the net on your own side, ready to spike
    if (act.lob && this.sideOf(b.x) === a.team && Math.abs(b.x - this.netX) < 700) {
      this.launchArc(b, this.netX - d * (a.ai ? 120 : 130), this.netTop - 330, true);
      b.vx *= 1; this.sfx('bump', 0.4);
      this.fx.text(b.x, b.y - 40, 'SET', '#ffffff', 18, { dur: 0.6 });
      this.touch(a);
      return true;
    }
    // bump: an arc over the net, aimed away from the other player when we can
    const o = this.opp(a);
    let tx = this.netX + d * (a.ai ? lerp(240, 660, this.rng()) : rand(260, 640));
    if (a.ai && this.rng() < this.skillOf(a)) tx = Math.abs(o.root.x - (this.netX + d * 230)) > Math.abs(o.root.x - (this.netX + d * 660)) ? this.netX + d * 230 : this.netX + d * 660;
    if (this.sideOf(b.x) !== a.team) tx = this.netX + d * 420;   // reaching over: just push it deep
    this.launchArc(b, tx, this.netTop - 130 - rand(0, 90));
    this.sfx('bump', 0.6);
    this.touch(a);
    return true;
  }
  launchArc(b, tx, apexY, noNet) {
    const g = b.g;
    for (let i = 0; i < 8; i++) {
      apexY = Math.min(apexY, b.y - 40);
      const vy0 = -Math.sqrt(2 * g * Math.max(20, b.y - apexY));
      const tUp = -vy0 / g, tDown = Math.sqrt(2 * Math.max(10, this.groundY - b.r - apexY) / g);
      const vx = (tx - b.x) / (tUp + tDown);
      // drag slows it a little; aim long by a touch
      const vxa = vx * 1.08;
      const tn = (this.netX - b.x) / (vxa || 1e-3);
      const yn = b.y + vy0 * tn + 0.5 * g * tn * tn;
      b.vx = vxa; b.vy = vy0 * 1.03;
      if (noNet || tn < 0 || tn > tUp + tDown || yn < this.netTop - b.r - 14) return;
      apexY -= 70;
    }
  }
  touch(a) {
    this.ball.last = a;
    if (this.touches.team === a.team) this.touches.n++; else this.touches = { team: a.team, n: 1 };
    this.rally++;
  }

  /* ----------------------------------------------------------- tick */
  tick(dt) {
    const b = this.ball;
    for (const a of this.athletes) {
      if (this.phase === 'play' || this.phase === 'intro') {
        if (a.canAct && !a.act) {
          a.facing = Math.abs(a.input.x) > 0.2 && Math.abs(b.x - a.root.x) > 160 ? (a.input.x > 0 ? 1 : -1) : this.dirOf(a);
          if (!this.serving || this.serving.a !== a) a.hold = this.sideOf(b.x) === a.team && !b.frozen ? 'ready' : null;
        }
      }
      a.update(dt);
    }
    if (this.serving) {
      this.placeServeBall();
      this.serving.t += dt;
      if (this.phase === 'play') {
        const s = this.serving.a;
        if (s.ai && this.serving.t > 0.8 + this.rng() * 0.05) this.serve(s);
        else if (!s.ai && this.serving.t > 5) this.serve(s);   // never stall: serve for the player
      }
      return;
    }
    // hits land on whichever frame the ball comes into reach
    const order = this.turnOrder();
    for (const a of order) {
      const act = a.act;
      if (!act || act.done) continue;
      if (act.id === 'dive') {
        const hd = a.hand();
        if (dist(hd.x, hd.y, b.x, b.y) < 70 + b.r || this.inReach(a, b)) {
          act.done = true;
          b.vx = this.dirOf(a) * 240; b.vy = -980;
          this.sfx('bump', 0.8);
          this.fx.text(b.x, b.y - 40, 'DIG!', '#45e08a', 22, { dur: 0.7 });
          if (a.team === 0) this.stats.digs++;
          this.touch(a);
        }
      } else if (a.phase().ph >= 0) this.tryHit(a);
    }
    const hit = b.step(dt, this.field);
    if (hit && hit.type === 'net' || hit && hit.type === 'tape') { this.netK = 1; this.sfx('thump', 0.3); }
    for (const a of order) {
      const c = b.collideAthlete(a);
      if (c && c.fresh) { this.sfx('thump', clamp(c.v / 1200, 0.1, 0.6)); this.touch(a); }
    }
    this.netK = Math.max(0, this.netK - dt * 2);
    if (this.live && b.grounded) this.landed(b);
    // a ball that drifts far off-screen is out
    if (this.live && (b.x < -500 || b.x > W + 500)) this.landed(b);
  }
  landed(b) {
    const inside = b.x > this.courtL && b.x < this.courtR;
    let winner;
    if (inside) winner = 1 - this.sideOf(b.x);
    else winner = b.last ? 1 - b.last.team : 1 - this.sideOf(b.x);
    this.fx.dust(b.x, this.groundY, 12, '#e8cb8c');
    this.sfx('sand');
    if (winner === 0 && this.rally <= 1 && b.last && b.last.team === 0) this.stats.aces++;
    this.point(winner, inside ? (this.rally <= 1 ? 'ACE!' : 'POINT!') : 'OUT!', { at: { x: clamp(b.x, 100, W - 100), y: this.groundY - 40 }, hold: 1.5 });
    b.vx *= 0.3;
  }
  checkWin() {
    if (this.over) return true;
    const [a, b] = this.score;
    if (a >= this.target || b >= this.target) { this.finish(a > b ? 0 : 1); return true; }
    return false;
  }

  /* ------------------------------------------------------------- AI */
  ai(a, dt) {
    const b = this.ball, br = a.brain, d = this.dirOf(a);
    if (this.serving) { a.input.x = 0; return; }
    br.t -= dt;
    const home = this.netX - d * 380;
    const mine = this.sideOf(b.x) === a.team || (b.vx * d < 0 && Math.abs(b.x - this.netX) < 500);
    if (br.t <= 0) {
      br.t = this.reactOf(a) * 0.8 + rand(0, 0.05);
      if (mine) {
        const pr = b.predictAt(this.field, this.groundY - 130, 3);
        br.land = pr;
        br.tx = pr ? pr.x - d * 22 : b.x;
        br.tx += this.err(a, 260) * (0.6 + clamp(b.speed / 1500, 0, 1));
        // spike chance: the ball will drop near the net on our side
        const hi = b.predictAt(this.field, this.netTop - 70, 3);
        br.spike = hi && this.sideOf(hi.x) === a.team && Math.abs(hi.x - this.netX) < 300 && this.rng() < 0.25 + this.skillOf(a) * 0.6;
        if (br.spike) { br.tx = hi.x - d * 30; br.spikeT = hi.t; }
        // first touch on our side: sometimes set up a spike
        br.lob = this.touches.team !== a.team && this.sideOf(pr ? pr.x : b.x) === a.team && this.rng() < this.skillOf(a) * 0.65;
      } else br.tx = home + this.err(a, 60);
    }
    const tx = clamp(br.tx, a.bounds.minX, a.bounds.maxX);
    this.walkTo(a, tx, 10);
    if (!a.canAct || a.act) return;
    if (mine) {
      if (br.spike && a.root.grounded && br.spikeT != null) {
        br.spikeT -= dt;
        if (br.spikeT < 0.36 && Math.abs(a.root.x - tx) < 70) { a.jump(); br.spikeT = null; }
      }
      if (this.inReach(a, b) && this.cool(a, 'hit') && b.vy > -300) this.press(a, 'action');
      // dive for one that's about to land out of reach
      if (br.land && br.land.t < 0.42 && Math.abs(br.land.x - a.root.x) > 120 && Math.abs(br.land.x - a.root.x) < 330 && this.cool(a, 'dive') && this.rng() < this.skillOf(a)) {
        a.facing = br.land.x > a.root.x ? 1 : -1;
        this.press(a, 'alt');
      }
    }
  }

  /* ----------------------------------------------------------- draw */
  paintStatic(g) {
    const gy = this.groundY, top = gy - 44, bot = gy + 46;
    g.strokeStyle = 'rgba(30,90,170,0.65)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(this.courtL + 20, top + 6); g.lineTo(this.courtR - 20, top + 6); g.lineTo(this.courtR + 10, bot - 6); g.lineTo(this.courtL - 10, bot - 6); g.closePath(); g.stroke();
    // net poles' shadows and the far pole
    g.fillStyle = 'rgba(120,90,40,0.25)';
    g.beginPath(); g.ellipse(this.netX + 30, gy + 4, 70, 9, 0, 0, TAU); g.fill();
  }
  draw(c, time) {
    const b = this.ball, nx = this.netX, sway = Math.sin(time * 28) * 5 * this.netK;
    // the net in light perspective: far pole to the right, near pole to the left
    const fx0 = nx + 16, nx0 = nx - 16, fb = this.groundY - 40, nb = this.groundY + 40, h = this.groundY - this.netTop;
    c.fillStyle = '#c9cfdc'; c.fillRect(fx0 - 4, fb - h - 10, 8, h + 10);
    c.fillStyle = 'rgba(20,26,40,0.38)';
    c.beginPath(); c.moveTo(fx0, fb - h); c.lineTo(nx0 + sway, nb - h); c.lineTo(nx0 + sway, nb - h + 140); c.lineTo(fx0, fb - h + 140); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
    for (let k = 0; k <= 14; k++) { const y = k * 10; c.beginPath(); c.moveTo(fx0, fb - h + y); c.lineTo(nx0 + sway, nb - h + y); c.stroke(); }
    for (let k = 0; k <= 4; k++) { const u = k / 4; c.beginPath(); c.moveTo(lerp(fx0, nx0 + sway, u), lerp(fb, nb, u) - h); c.lineTo(lerp(fx0, nx0 + sway, u), lerp(fb, nb, u) - h + 140); c.stroke(); }
    c.strokeStyle = '#ffffff'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(fx0, fb - h); c.lineTo(nx0 + sway, nb - h); c.stroke();
    b.drawShadow(c, this.groundY);
    this.drawAthletes(c, time);
    b.draw(c);
    c.fillStyle = '#e9edf6'; c.fillRect(nx0 - 5, nb - h - 10, 10, h + 10);
    this.drawMarker(c);
    // where the ball will come down
    if (!b.frozen && this.live && !this.demo && this.sideOf(b.x) === 0 || (!b.frozen && this.live && !this.demo && b.vx < 0 && b.x < this.netX + 400)) {
      const pr = b.predictAt(this.field, this.groundY - b.r, 3);
      if (pr && pr.x < this.netX) {
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(pr.x, this.groundY + 4, 22, 6, 0, 0, TAU); c.stroke();
      }
    }
    if (this.serving && this.serving.a === this.player && !this.player.ai && this.live) {
      const h = this.player.head();
      c.font = '900 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
      c.fillText('HIT TO SERVE', h.x, h.y - 70);
    }
  }
  focus() { const b = this.ball; return { x: (b.x * 2 + this.player.root.x) / 3, y: Math.min(b.y, this.groundY - 200) }; }

  hud() { return { clock: 'TO ' + this.target, sub: this.serving ? (this.serving.a === this.player ? 'YOUR SERVE' : 'THEIR SERVE') : 'RALLY ' + Math.max(0, this.rally) }; }
  result() {
    const [a, b] = this.score;
    return { winner: this.winner, score: [a, b], line: `${a} - ${b}`, stats: [[this.stats.spikes, 'SPIKES'], [this.stats.digs, 'DIGS'], [this.stats.aces, 'ACES']] };
  }
}

SPORTS.volley = {
  id: 'volley', name: 'VOLLEY', color: '#4fc3ff', icon: 'volley',
  blurb: '1v1 beach volleyball. Keep it off your sand. First to 7.',
  controls: { action: 'HIT', alt: 'DIVE', mod: 'SET', actionIcon: 'hit', altIcon: 'dive' },
  hint: 'HIT BUMPS IT OVER · DOWN + HIT SETS IT UP · JUMP + HIT AT THE NET TO SPIKE · DIVE TO SAVE',
  create: (host, o) => new Volley(host, o),
};
