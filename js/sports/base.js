'use strict';
/* =========================================================================
   Sport base: match flow shared by every sport.
   intro (get ready) -> play -> point (celebrate, reset) -> ... -> over
   Each sport fills in: setup(), reset(), tick(dt), ai(a, dt), draw(c),
   press(a, btn) / release(a, btn), hud(), result().
   ========================================================================= */

const TIERS = [
  { id: 'rookie', name: 'ROOKIE', react: 0.4, speed: 0.74, skill: 0.4, aggr: 0.3, coins: 40 },
  { id: 'pro', name: 'PRO', react: 0.26, speed: 0.87, skill: 0.62, aggr: 0.5, coins: 70 },
  { id: 'star', name: 'ALL-STAR', react: 0.16, speed: 0.97, skill: 0.8, aggr: 0.65, coins: 110 },
  { id: 'legend', name: 'LEGEND', react: 0.09, speed: 1.07, skill: 0.94, aggr: 0.8, coins: 160 },
];

const RIVAL_NAMES = ['RICO', 'BJORN', 'KENJI', 'LULU', 'MOOSE', 'ZARA', 'DEX', 'PIP', 'TANK', 'NOVA', 'OTTO', 'MAYA', 'BRUNO', 'IKE', 'SASHA', 'JUNO', 'GUS', 'TEO', 'WREN', 'BOLT'];
const RIVAL_KITS = [
  { color: '#4f8dff', trim: '#0d1a33', shorts: '#e9edf6' },
  { color: '#ff4f5e', trim: '#2b0a0f', shorts: '#232838' },
  { color: '#45e08a', trim: '#06301a', shorts: '#232838' },
  { color: '#b36bff', trim: '#1f0b33', shorts: '#e9edf6' },
  { color: '#ff8a2a', trim: '#331804', shorts: '#232838' },
  { color: '#2fd3d3', trim: '#05302f', shorts: '#e9edf6' },
];
const RIVAL_HATS = ['none', 'band', 'cap', 'beanie', 'mohawk', 'shades', 'afro'];

class Sport {
  constructor(host, o) {
    this.host = host;
    this.fx = host.fx;
    this.demo = !!o.demo;
    this.tierIdx = o.tier || 0;
    this.T = TIERS[this.tierIdx];
    this.time = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.score = [0, 0];
    this.athletes = [];
    this.stats = {};
    this.over = false;
    this.winner = -1;
    this.hype = 0;              // crowd excitement 0..1
    this.startSound = 'whistle';  // played when play (re)starts
    this.startEvery = false;      // ...after every point too (soccer kick-offs)
    this.cam = { x: W / 2, y: H / 2, z: 1 };
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    const rk = pick(RIVAL_KITS.filter(k => k.color.toLowerCase() !== (Save.data.kit.color || '').toLowerCase()));
    this.rival = { name: pick(RIVAL_NAMES), kit: Object.assign({}, rk, { hat: pick(RIVAL_HATS), number: randi(2, 99) }) };
  }

  /* --------------------------------------------------------- helpers */
  playerKit(style) {
    const k = Save.data.kit;
    return { color: k.color, trim: k.trim || '#14161f', shorts: k.shorts || '#232838', hat: k.hat, number: k.number, style };
  }
  makeAthlete(team, x, o = {}) {
    const isPlayer = team === 0 && !this.demo;
    const kit = team === 0 ? (this.demo ? Object.assign({}, RIVAL_KITS[2], { hat: 'band', number: 10 }) : this.playerKit(o.style)) : Object.assign({}, this.rival.kit);
    kit.style = o.style || 'jersey';
    if (this.demo && team === 0) kit.color = Save.data.kit.color;
    const a = new Athlete(Object.assign({ x, y: this.groundY, facing: team === 0 ? 1 : -1, team, isPlayer, kit, groundY: this.groundY }, o));
    a.ai = !isPlayer;
    a.brain = { t: rand(0, 0.2), tx: x, want: null, hold: 0 };
    a.cd = {};
    if (a.ai) a.speed *= team === 1 ? this.T.speed : 0.95;
    a.name = team === 0 ? (this.demo ? 'HOME' : 'YOU') : this.rival.name;
    this.athletes.push(a);
    return a;
  }
  get player() { return this.athletes[0]; }
  // contested moments (two kicks on one ball) resolve in a fair, alternating order
  turnOrder() { this.flip = !this.flip; return this.flip ? this.athletes.slice().reverse() : this.athletes; }
  opp(a) { return this.athletes[a === this.athletes[0] ? 1 : 0]; }
  setPhase(p) { this.phase = p; this.phaseT = 0; }
  get live() { return this.phase === 'play'; }
  cool(a, k) { return (a.cd[k] || 0) <= 0; }
  setCd(a, k, t) { a.cd[k] = t; }
  // skill-scaled random error for AI decisions (0 for the human)
  err(a, scale) { return a.ai ? (this.rng() * 2 - 1) * scale * (1 - (a.team === 1 ? this.T.skill : 0.75)) : 0; }
  skillOf(a) { return a.team === 1 ? this.T.skill : 0.75; }
  reactOf(a) { return a.team === 1 ? this.T.react : 0.2; }
  aggrOf(a) { return a.team === 1 ? this.T.aggr : 0.55; }

  banner(text, kind) { if (!this.demo) this.host.banner(text, kind); }
  sfx(name, arg) { if (!this.demo) Sfx.play(name, arg); }
  shake(n) { this.host.shake(n); }

  /* point scored: celebrate, then reset. team = who scored */
  point(team, label, opts = {}) {
    if (this.phase !== 'play') return;
    this.score[team] += opts.value || 1;
    this.lastScorer = team;
    this.setPhase('point');
    this.pointHold = opts.hold || 1.9;
    this.hype = 1;
    const a = this.athletes[team], b = this.athletes[1 - team];
    if (a && a.mode === 'active') a.hold = 'celebrate';
    if (b && b.mode === 'active' && opts.sad !== false) b.hold = 'sad';
    if (!this.demo) {
      this.host.slowmo(opts.slow || 0.45);
      this.banner(label, team === 0 ? 'good' : 'bad');
      Sfx.play('cheer', team === 0 ? 1 : 0.6);
    }
    const at = opts.at || (a ? a.center() : { x: W / 2, y: H / 2 });
    this.fx.confetti(at.x, at.y, [a ? a.kit.color : '#ffffff', '#ffffff', '#ffc933'], this.demo ? 18 : 46);
    this.host.onScore && this.host.onScore(this);
  }

  finish(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.setPhase('over');
    for (const a of this.athletes) {
      if (a.mode !== 'active') continue;
      a.hold = winner === -1 ? null : a.team === winner ? 'celebrate' : 'sad';
      a.input.x = 0;
    }
    if (!this.demo) {
      this.banner(winner === 0 ? 'VICTORY' : winner === 1 ? 'DEFEAT' : 'DRAW', winner === 0 ? 'good' : winner === 1 ? 'bad' : '');
      Sfx.play(winner === 0 ? 'win' : 'lose');
      if (winner === 0) Sfx.play('cheer', 1.2);
    }
  }

  /* ---------------------------------------------------------- frame */
  step(dt) {
    this.time += dt;
    this.phaseT += dt;
    this.hype = Math.max(0, this.hype - dt * 0.35);
    for (const a of this.athletes) for (const k in a.cd) a.cd[k] = Math.max(0, a.cd[k] - dt);
    if (this.phase === 'intro' && this.phaseT > (this.demo ? 0.2 : 0.9)) {
      this.setPhase('play');
      if (!this.demo) {
        if (!this.started) this.banner('GO!', 'go');
        if (this.startSound && (!this.started || this.startEvery)) Sfx.play(this.startSound);
      }
      this.started = true;
    }
    if (this.phase === 'point' && this.phaseT > this.pointHold) {
      if (this.checkWin && this.checkWin()) return;
      this.reset(false);
      this.setPhase('intro');
      this.phaseT = 0.35;
    }
    if (this.phase === 'over' && this.phaseT > 2.2 && !this.reported) {
      this.reported = true;
      if (this.demo) { this.host.demoOver(); return; }
      this.host.matchOver(this.result());
    }
    // controls: AI for computer athletes, the host's input for the player
    for (const a of this.athletes) {
      if (a.ai) {
        if (this.phase === 'play') this.ai(a, dt);
        else { a.input.x = 0; this.aiIdle && this.aiIdle(a, dt); }
      } else {
        a.input.x = this.phase === 'play' || this.phase === 'intro' ? this.host.input.x : 0;
        if (this.phase !== 'play' && this.phase !== 'intro') a.input.x = 0;
      }
    }
    this.tick(dt);
  }

  // human input from the host
  hostPress(btn) {
    const a = this.player;
    if (!a || a.ai || this.over) return;
    if (btn === 'jump') { if (this.phase === 'play' && this.jump) this.jump(a); else if (this.phase === 'play') { if (a.jump()) Sfx.play('jump'); } return; }
    if (this.phase === 'play' || (this.allowIntroPress && this.phase === 'intro')) this.press(a, btn);
  }
  hostRelease(btn) {
    const a = this.player;
    if (!a || a.ai) return;
    this.release && this.release(a, btn);
  }

  // default face: movement direction, else toward a point of interest
  autoFace(a, lookX) {
    if (!a.canAct || a.act) return;
    if (a.input.x > 0.2) a.facing = 1;
    else if (a.input.x < -0.2) a.facing = -1;
    else if (lookX != null && Math.abs(lookX - a.root.x) > 12) a.facing = lookX > a.root.x ? 1 : -1;
  }

  // AI walk toward x with a little deadzone
  walkTo(a, x, dead = 14) {
    const dx = x - a.root.x;
    a.input.x = Math.abs(dx) < dead ? 0 : clamp(dx / 60, -1, 1);
  }

  // shared clock text
  clockText(t) {
    t = Math.max(0, Math.ceil(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  focus() { return { x: W / 2, y: H / 2 }; }
  drawAthletes(c, time) {
    // shadows first, then bodies (player last so it reads on top)
    for (const a of this.athletes) {
      const pv = a.pelvis, h = clamp((this.groundY - pv.y - 50) / 300, 0, 1);
      c.fillStyle = `rgba(0,0,0,${0.22 * (1 - h * 0.6)})`;
      c.beginPath(); c.ellipse(pv.x, this.groundY + 3, 34 * (1 - h * 0.4), 7 * (1 - h * 0.4), 0, 0, TAU); c.fill();
    }
    const order = this.athletes.slice().sort((p, q) => (p.isPlayer ? 1 : 0) - (q.isPlayer ? 1 : 0));
    for (const a of order) a.draw(c, time);
  }
  // little marker over the human's head
  drawMarker(c) {
    const a = this.player;
    if (!a || a.ai || this.demo) return;
    const h = a.head();
    const y = h.y - 34 + Math.sin(this.time * 5) * 2;
    c.fillStyle = Save.data.kit.color;
    c.beginPath(); c.moveTo(h.x - 8, y - 8); c.lineTo(h.x + 8, y - 8); c.lineTo(h.x, y + 2); c.closePath(); c.fill();
  }
  // radial charge meter beside an athlete
  drawCharge(c, a, k, opts = {}) {
    const ch = a.chest(), x = ch.x + (opts.dx != null ? opts.dx : -a.facing * 46), y = ch.y - 30;
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(10,12,18,0.7)'; c.lineWidth = 9;
    c.beginPath(); c.arc(x, y, 16, 0, TAU); c.stroke();
    if (opts.zone) {
      c.strokeStyle = '#45e08a'; c.lineWidth = 9;
      c.beginPath(); c.arc(x, y, 16, -Math.PI / 2 + opts.zone[0] * TAU, -Math.PI / 2 + opts.zone[1] * TAU); c.stroke();
    }
    c.strokeStyle = opts.color || '#ffc933'; c.lineWidth = 5;
    c.beginPath(); c.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + clamp(k, 0, 1) * TAU); c.stroke();
    c.lineCap = 'round';
  }
}

const SPORTS = {};   // filled by each sport file: SPORTS.soccer = { id, name, ..., create(host, o) }
