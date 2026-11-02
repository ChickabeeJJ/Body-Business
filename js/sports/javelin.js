'use strict';
/* =========================================================================
   Javelin: a track-and-field final. Press THROW to start the run-up (you
   speed up the longer you run), then hold THROW to lift the angle and
   release to let it fly. The sweet spot is around 40-46 degrees. Step over the
   line before you let go and it's a foul (and a tumble). Three attempts;
   beat the rivals' marks for gold.
   ========================================================================= */

const JAV_PX = 16;          // pixels per metre
const JAV_LINE = 1250;      // foul line x

class Javelin extends Sport {
  constructor(host, o) {
    super(host, o);
    this.id = 'javelin';
    this.groundY = 790;
    this.arena = { look: 'track', standsTop: 300 };
    this.world = { x0: -360, x1: JAV_LINE + 115 * JAV_PX };
    this.camSpeed = 6;
    this.attempt = 0;
    this.maxAttempts = 3;
    this.marks = [];
    this.best = 0;
    this.makeAthlete(0, -220, { bounds: { minX: -300, maxX: this.world.x1 - 200 }, speed: 300, style: 'singlet' });
    const a = this.player;
    a.kit.style = 'singlet';
    // rivals' marks to beat, scaled by tier
    const lo = [36, 50, 62, 74][this.tierIdx], hi = [56, 67, 78, 87][this.tierIdx];
    const used = new Set();
    this.rivals = [];
    for (let i = 0; i < 5; i++) {
      let n; do { n = pick(RIVAL_NAMES); } while (used.has(n)); used.add(n);
      this.rivals.push({ name: n, mark: +(lo + (hi - lo) * Math.pow(this.rng(), 0.8 - i * 0.05)).toFixed(2), col: RIVAL_KITS[i % RIVAL_KITS.length].color });
    }
    this.rivals.sort((p, q) => q.mark - p.mark);
    this.jav = null;
    this.flags = [];
    this.stats = {};
    this.reset(true);
  }

  reset(first) {
    if (!first) this.attempt++;
    const a = this.player;
    a.place(-220, 1);
    a.speed = 260;
    a.hold = 'carry';
    this.stage = 'ready';
    this.stageT = 0;
    this.runT = 0;
    this.angle = 0;
    this.wind = +(rand(-1.5, 2.5)).toFixed(1);
    this.jav = { x: 0, y: 0, vx: 0, vy: 0, ang: -0.35, held: true, stuck: false };
    this.lastMark = null;
    this.camHold = 0;
  }

  /* ---------------------------------------------------------- input */
  press(a, btn) {
    if (btn !== 'action') { if (btn === 'alt' && this.stage === 'run') this.press(a, 'action'); return; }
    if (this.stage === 'ready') {
      this.stage = 'run'; this.stageT = 0;
      this.sfx('go');
    } else if (this.stage === 'run') {
      this.stage = 'aim'; this.stageT = 0;
      this.angle = 4;
      a.hold = 'aim';
    }
  }
  release(a, btn) {
    if (btn !== 'action' && btn !== 'alt') return;
    if (this.stage === 'aim') this.throwIt(a);
  }

  throwIt(a) {
    const sf = clamp((a.speed - 260) / (720 - 260), 0, 1);
    const th = this.angle * Math.PI / 180;
    const v = 380 + 840 * sf;
    const hd = a.hand();
    const j = this.jav;
    j.held = false;
    j.x = hd.x + 20; j.y = hd.y - 8;
    j.vx = Math.cos(th) * v + this.wind * 14; j.vy = -Math.sin(th) * v;
    j.ang = -th;
    a.hold = null;
    a.play('throw', 0.5, { move: 0.4 });
    this.stage = 'flight'; this.stageT = 0;
    this.sfx('throw');
    this.fx.dust(a.root.x, this.groundY, 8, '#e0a08a', -1);
  }

  foul(a) {
    this.stage = 'foul'; this.stageT = 0;
    a.knock(a.root.vx * 0.6, -260, P.HEAD, 1.6);
    const j = this.jav;
    j.held = false; j.vx = a.root.vx * 0.5; j.vy = -200; j.x = a.hand().x; j.y = a.hand().y;
    this.marks.push(0);
    this.lastMark = 'FOUL';
    this.banner('FOUL!', 'bad');
    this.sfx('foul');
    this.shake(6);
  }

  /* ----------------------------------------------------------- tick */
  tick(dt) {
    const a = this.player, j = this.jav;
    this.stageT += dt;
    // ragdoll input is the run itself
    if (this.stage === 'run' || this.stage === 'aim') {
      this.runT += dt;
      a.speed = lerp(260, 720, clamp(this.runT / 1.4, 0, 1)) * (this.stage === 'aim' ? 0.985 : 1);
      a.input.x = 1;
      if (this.stage === 'aim') {
        this.angle = Math.min(80, this.angle + dt * 62);
        a.holdK = this.angle / 80;
      }
      if (a.root.x > JAV_LINE - 4 && a.mode === 'active') this.foul(a);
      if (Math.floor((this.runT - dt) * 5.5) !== Math.floor(this.runT * 5.5)) this.sfx('step');
    } else {
      a.input.x = 0;
      if (this.stage === 'flight' || this.stage === 'landed') { a.speed = 300; }
    }
    a.update(dt);
    // javelin
    if (j.held) {
      const f = a.pts[P.FHAND], b = a.pts[P.BHAND];
      const cx = (f.x + b.x) / 2, cy = (f.y + b.y) / 2;
      const ang = this.stage === 'aim' ? -this.angle * Math.PI / 180 : Math.atan2(b.y - f.y, b.x - f.x) || -0.3;
      j.x = cx; j.y = cy; j.ang = this.stage === 'aim' ? ang : clamp(ang, -1.2, 0.2);
    } else if (!j.stuck) {
      j.vy += 1000 * dt;
      const dk = Math.exp(-0.06 * dt);
      j.vx *= dk; j.vy *= dk;
      j.x += j.vx * dt; j.y += j.vy * dt;
      const want = Math.atan2(j.vy, j.vx);
      j.ang += angDiff(j.ang, want) * Math.min(1, dt * 6);
      const tipX = j.x + Math.cos(j.ang) * 62, tipY = j.y + Math.sin(j.ang) * 62;
      if (tipY >= this.groundY) {
        j.stuck = true;
        const tipDown = j.ang > 0.12;
        if (!tipDown) { j.ang = 0.05; j.y = this.groundY - 4; }
        this.fx.dust(tipX, this.groundY, 10, '#9ccf8a');
        this.sfx('land');
        if (this.stage === 'flight') this.measure(tipX, tipDown);
      }
    }
    if (this.stage === 'landed' || this.stage === 'foul') {
      if (this.stageT > 2.3 && this.phase === 'play') {
        if (this.attempt + 1 >= this.maxAttempts) this.done();
        else { this.reset(false); this.setPhase('intro'); this.phaseT = 0.5; }
      }
    }
  }

  measure(x, clean) {
    const m = Math.max(0, (x - JAV_LINE) / JAV_PX);
    const mark = +m.toFixed(2);
    this.marks.push(mark);
    this.lastMark = mark;
    this.stage = 'landed'; this.stageT = 0;
    const pb = mark > this.best;
    if (pb) this.best = mark;
    this.flags.push({ x, mark, t: this.time });
    const lead = this.rivals[0].mark;
    let label = mark.toFixed(2) + ' m';
    if (pb && mark > lead) { this.banner('NEW LEADER!', 'good'); this.sfx('cheer', 1); this.hype = 1; this.fx.confetti(x, this.groundY - 40, ['#ffc933', '#ffffff', this.player.kit.color], 40); }
    else if (!clean) label += ' · FLAT';
    this.fx.text(x, this.groundY - 120, label, '#ffffff', 34, { dur: 2 });
    if (!this.demo && !(pb && mark > lead)) Sfx.play(mark > this.rivals[2].mark ? 'cheer' : 'groan', 0.6);
  }

  place() {
    const all = this.rivals.map(r => r.mark).concat([this.best]).sort((p, q) => q - p);
    return all.indexOf(this.best) + 1;
  }
  done() {
    const pl = this.place();
    this.finishPlace = pl;
    this.finish(pl === 1 ? 0 : pl <= 3 ? -1 : 1);
    if (!this.demo) this.banner(pl === 1 ? 'GOLD!' : pl === 2 ? 'SILVER' : pl === 3 ? 'BRONZE' : pl + 'TH PLACE', pl <= 3 ? 'good' : 'bad');
  }

  /* ------------------------------------------------------------- AI (menu demo) */
  ai(a, dt) {
    const br = a.brain;
    br.t -= dt;
    if (this.stage === 'ready' && this.stageT > 0.6) this.press(a, 'action');
    if (this.stage === 'run' && this.runT > (br.runFor || (br.runFor = rand(1.4, 1.75)))) this.press(a, 'action');
    if (this.stage === 'aim' && this.angle >= (br.ang || (br.ang = rand(36, 46)))) { this.release(a, 'action'); br.runFor = 0; br.ang = 0; }
  }

  /* ----------------------------------------------------------- draw */
  paintStatic(g, R) {
    const gy = this.groundY, top = gy - 44, bot = gy + 46;
    // grass landing sector beyond the line
    const sf = g.createLinearGradient(0, top, 0, bot);
    sf.addColorStop(0, '#378c41'); sf.addColorStop(1, '#43a24d');
    g.fillStyle = sf; g.fillRect(JAV_LINE, top, R.x1 - JAV_LINE, bot - top);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = JAV_LINE; x < R.x1; x += 160) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 80, top); g.lineTo(x + 92, bot); g.lineTo(x + 12, bot); g.closePath(); g.fill(); }
    // runway lanes
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
    for (const y of [top + 14, bot - 14]) { g.beginPath(); g.moveTo(R.x0, y); g.lineTo(JAV_LINE, y); g.stroke(); }
    // foul line (curved arc in real life, a bold stripe here)
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(JAV_LINE - 4, top); g.lineTo(JAV_LINE + 4, top); g.lineTo(JAV_LINE + 10, bot); g.lineTo(JAV_LINE + 2, bot); g.closePath(); g.fill();
    // distance arcs every 10 m
    g.font = '900 18px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = 10; m <= 110; m += 10) {
      const x = JAV_LINE + m * JAV_PX;
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x - 4, top + 2); g.lineTo(x + 6, bot - 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(m + 'm', x + 22, bot - 16);
    }
    // rival marks as small flags planted in the grass
    this.rivals.forEach((r, i) => {
      const x = JAV_LINE + r.mark * JAV_PX, y = gy - 30;
      g.strokeStyle = '#e9edf6'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x, y - 46); g.stroke();
      g.fillStyle = r.col; g.beginPath(); g.moveTo(x, y - 46); g.lineTo(x + 30, y - 38); g.lineTo(x, y - 30); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '800 12px Rubik, sans-serif'; g.fillText(r.name, x + 2, y - 58 - i * 14);
    });
  }
  drawJav(c, j) {
    c.save(); c.translate(j.x, j.y); c.rotate(j.ang);
    c.strokeStyle = '#dfe4ee'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-62, 0); c.lineTo(52, 0); c.stroke();
    c.strokeStyle = '#ff4f5e'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(10, 0); c.stroke();
    c.fillStyle = '#7d8699';
    c.beginPath(); c.moveTo(52, -3); c.lineTo(66, 0); c.lineTo(52, 3); c.closePath(); c.fill();
    c.restore();
  }
  draw(c, time) {
    const a = this.player, j = this.jav;
    // previous throws: small yellow pegs
    for (const f of this.flags) {
      c.fillStyle = '#ffc933'; c.fillRect(f.x - 3, this.groundY - 24, 6, 26);
      c.fillStyle = '#ffffff'; c.font = '900 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(f.mark.toFixed(1), f.x, this.groundY - 32);
    }
    if (!j.held && !j.stuck) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(j.x, this.groundY + 3, 50, 5, 0, 0, TAU); c.fill(); }
    this.drawAthletes(c, time);
    this.drawJav(c, j);
    this.drawMarker(c);
    if (this.stage === 'aim' && !a.ai) {
      // angle gauge at the hand
      const ch = a.chest(), x = ch.x - 70, y = ch.y - 40, R = 54;
      c.lineCap = 'butt';
      c.strokeStyle = 'rgba(10,12,18,0.65)'; c.lineWidth = 10;
      c.beginPath(); c.arc(x, y, R, -80 * Math.PI / 180, 0); c.stroke();
      c.strokeStyle = '#45e08a';
      c.beginPath(); c.arc(x, y, R, -47 * Math.PI / 180, -39 * Math.PI / 180); c.stroke();
      const th = -this.angle * Math.PI / 180;
      c.strokeStyle = '#ffc933'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(th) * (R + 8), y + Math.sin(th) * (R + 8)); c.stroke();
      c.fillStyle = '#ffffff'; c.font = '900 16px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(Math.round(this.angle) + '°', x - 18, y + 22);
    }
    if ((this.stage === 'run' || this.stage === 'aim') && !a.ai) {
      // speed bar under the runner
      const k = clamp((a.speed - 260) / 460, 0, 1);
      c.fillStyle = 'rgba(10,12,18,0.65)'; c.fillRect(a.root.x - 40, this.groundY + 16, 80, 8);
      c.fillStyle = k > 0.92 ? '#45e08a' : '#ffc933'; c.fillRect(a.root.x - 40, this.groundY + 16, 80 * k, 8);
    }
    if (this.stage === 'ready' && !a.ai && this.live) {
      const h = a.head();
      c.font = '900 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
      c.fillText('THROW TO START YOUR RUN', h.x + 40, h.y - 70);
    }
  }
  camTarget() {
    const a = this.player, j = this.jav;
    if (this.stage === 'flight' || (this.stage === 'landed' && this.stageT < 2)) return { x: j.x + 120, y: Math.min(H / 2, j.y + 120) };
    return { x: a.root.x + 380, y: H / 2 };
  }
  camZoom(view) { return clamp(0.66 / view.scale, 1, 1.25); }
  focus() { return this.camTarget(); }

  hud() {
    const lead = this.rivals[0];
    return {
      clock: 'ATTEMPT ' + Math.min(this.maxAttempts, this.attempt + 1) + '/' + this.maxAttempts,
      sub: 'WIND ' + (this.wind > 0 ? '+' : '') + this.wind.toFixed(1),
      scores: [this.best ? this.best.toFixed(2) : '-', lead.mark.toFixed(2)],
      names: ['YOU', lead.name],
      board: this.rivals.map(r => ({ name: r.name, mark: r.mark, col: r.col })).concat([{ name: 'YOU', mark: this.best, you: true, col: Save.data.kit.color }]).sort((p, q) => q.mark - p.mark),
    };
  }
  result() {
    const pl = this.finishPlace || this.place();
    const medal = pl === 1 ? 'GOLD' : pl === 2 ? 'SILVER' : pl === 3 ? 'BRONZE' : pl + 'TH';
    const valid = this.marks.filter(m => m > 0);
    return {
      winner: this.winner, title: pl === 1 ? 'GOLD MEDAL' : pl <= 3 ? medal + ' MEDAL' : pl + 'TH PLACE', line: medal + ' · ' + this.best.toFixed(2) + ' m',
      pb: this.best, place: pl, bonus: pl === 2 ? 10 : 0,
      stats: [[this.best.toFixed(1) + 'm', 'BEST THROW'], [valid.length + '/' + this.maxAttempts, 'VALID THROWS'], [this.rivals[0].mark.toFixed(1) + 'm', 'TOP RIVAL']],
    };
  }
}

SPORTS.javelin = {
  id: 'javelin', name: 'JAVELIN', color: '#b36bff', icon: 'javelin', solo: true,
  blurb: 'Three throws to beat the field. Speed + angle = distance.',
  controls: { action: 'THROW', alt: 'THROW', actionIcon: 'javelin', altIcon: 'javelin' },
  hint: 'PRESS THROW TO RUN · HOLD THROW TO RAISE THE ANGLE · RELEASE BEFORE THE LINE',
  create: (host, o) => new Javelin(host, o),
};
