'use strict';
/* =========================================================================
   Athlete: an active ragdoll (the same rig as Element Rag's fighters).
   Eleven verlet points joined by bones are pulled toward an animated pose
   by "muscles". Big hits drop muscle strength to zero (tumble): the body
   flies limp until it settles and stands itself back up.
   A light platformer "root" (feet position) drives movement while active.
   Sport poses: kick, slide, jab / hook / uppercut, block, shoot, dunk,
   dribble, bump, set, spike, dive, carry, throw, celebrate.
   ========================================================================= */

const STEP = 1 / 120;
const P = { HEAD: 0, NECK: 1, PELVIS: 2, FELB: 3, FHAND: 4, BELB: 5, BHAND: 6, FKNEE: 7, FFOOT: 8, BKNEE: 9, BFOOT: 10 };
// bones: [a, b, hurt radius]
const SEGS = [
  [1, 0, 0], [1, 2, 10],
  [1, 3, 6], [3, 4, 6], [1, 5, 6], [5, 6, 6],
  [2, 7, 7], [7, 8, 6], [2, 9, 7], [9, 10, 6],
];
const BONE_LEN = [17, 45, 24, 24, 24, 24, 29, 28, 29, 28];
const MUSCLE = [0.15, 0.22, 0.27, 0.16, 0.24, 0.16, 0.23, 0.15, 0.24, 0.15, 0.24];
const MUSCLE_DAMP = 0.22;
// inverse masses: heavy trunk, light extremities, so limbs whip around the body
const INV_MASS = [0.8, 0.35, 0.3, 0.88, 0.92, 0.88, 0.92, 0.75, 1, 0.75, 1];
// soft joint limits [a, b, minLen, maxLen] in unscaled units
const JOINT_LIMITS = [
  [2, 8, 30, 58], [2, 10, 30, 58],     // knees never fold flat
  [1, 4, 18, 49], [1, 6, 18, 49],      // elbows never fold flat
  [1, 7, 52, 80], [1, 9, 52, 80],      // thighs stay below the chest
  [0, 2, 56, 64],                      // head stays on the spine
  [0, 3, 22, 60], [0, 5, 22, 60],      // arms can't fold over the face
];
const HEAD_R = 13;
const ROOT_G = 2700;
const BODY_G = 2700;

// pose timing: [windup, strike, recover] as fractions of the action's duration
const POSE_PHASES = {
  kick: [0.36, 0.26, 0.38], slide: [0.1, 0.6, 0.3], jab: [0.25, 0.3, 0.45], hook: [0.42, 0.25, 0.33],
  uppercut: [0.42, 0.25, 0.33], shoot: [0.15, 0.35, 0.5], dunk: [0.35, 0.3, 0.35], bump: [0.2, 0.4, 0.4],
  set: [0.25, 0.35, 0.4], spike: [0.4, 0.22, 0.38], dive: [0.12, 0.6, 0.28], throw: [0.4, 0.2, 0.4],
  swipe: [0.25, 0.35, 0.4], shove: [0.3, 0.3, 0.4], header: [0.3, 0.3, 0.4],
};

class Athlete {
  constructor(o) {
    this.s = o.scale || 1;
    this.facing = o.facing || 1;
    this.isPlayer = !!o.isPlayer;
    this.team = o.team || 0;
    this.name = o.name || '';
    this.kit = Object.assign({ color: '#ffc933', trim: '#1a1404', shorts: '#232838', skin: '#f2e9da', skinShade: '#d3c5ad', hat: 'none', number: 7, style: 'jersey' }, o.kit || {});
    this.speed = o.speed || 360;
    this.jumpV = o.jumpV || 1000;
    this.root = { x: o.x, y: o.y, vx: 0, vy: 0, grounded: false, jumps: 0 };
    this.bounds = o.bounds || { minX: -1e5, maxX: 1e5 };
    this.groundY = o.groundY != null ? o.groundY : 780;
    this.mode = 'active';           // active | tumble | rising
    this.m = 1;                     // muscle strength 0..1
    this.stunT = 0;
    this.t = Math.random() * 10;
    this.walkPh = 0;
    this.input = { x: 0 };
    this.act = null;                // one-shot pose {id, t, dur, ...}
    this.hold = null;               // held pose: block | charge | dribble | carry | celebrate | sad | ready | aim
    this.holdK = 0;                 // 0..1 charge amount for held poses
    this.dash = null;
    this.flash = 0;
    this.knockT = 0;
    this.landT = 0;
    this.lift = 0;                  // kick height 0..1
    this.pts = []; this.T = []; this.Tp = [];
    for (let i = 0; i < 11; i++) { this.pts.push({ x: o.x, y: o.y, px: o.x, py: o.y }); this.T.push({ x: o.x, y: o.y }); this.Tp.push({ x: o.x, y: o.y }); }
    this.computeTargets();
    this.snapToPose();
  }

  snapToPose() {
    for (let i = 0; i < 11; i++) { const p = this.pts[i]; p.x = p.px = this.T[i].x; p.y = p.py = this.T[i].y; this.Tp[i].x = this.T[i].x; this.Tp[i].y = this.T[i].y; }
  }
  // put the athlete back on its feet at x (between points, rounds, attempts)
  place(x, facing) {
    const r = this.root;
    r.x = x; r.y = this.groundY; r.vx = r.vy = 0; r.grounded = true; r.jumps = 0;
    this.facing = facing || this.facing;
    this.mode = 'active'; this.m = 1; this.stunT = 0; this.act = null; this.hold = null; this.dash = null; this.knockT = 0;
    this.computeTargets(); this.snapToPose();
  }

  get canAct() { return this.mode === 'active' && !this.dash; }
  get pelvis() { return this.pts[P.PELVIS]; }
  get busy() { return !!this.act; }
  center() { const a = this.pts[P.NECK], b = this.pts[P.PELVIS]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  chest() { const a = this.pts[P.NECK], b = this.pts[P.PELVIS]; return { x: lerp(a.x, b.x, 0.3), y: lerp(a.y, b.y, 0.3) }; }
  head() { return this.pts[P.HEAD]; }
  hand() { return this.pts[P.FHAND]; }
  foot() { return this.pts[P.FFOOT]; }
  vel(i) { const p = this.pts[i]; return { x: (p.x - p.px) / STEP, y: (p.y - p.py) / STEP }; }

  /* ------------------------------------------------------------ control */
  jump(mul = 1) {
    const r = this.root;
    if (!this.canAct || !r.grounded) return false;
    r.jumps = 1;
    r.vy = -this.jumpV * mul;
    r.grounded = false;
    return true;
  }
  // start a one-shot pose; phase() reports where it is
  play(id, dur, extra) {
    this.act = Object.assign({ id, t: 0, dur }, extra || {});
    return this.act;
  }
  phase() {
    const a = this.act;
    if (!a) return { ph: -1, u: 0 };
    const pp = POSE_PHASES[a.id] || [0.3, 0.3, 0.4];
    const k = a.t / a.dur;
    if (k < pp[0]) return { ph: 0, u: k / pp[0] };
    if (k < pp[0] + pp[1]) return { ph: 1, u: (k - pp[0]) / pp[1] };
    return { ph: 2, u: clamp((k - pp[0] - pp[1]) / pp[2], 0, 1) };
  }
  startDash(vx, vy, t) { this.dash = { vx, vy, t }; }

  /* -------------------------------------------------------------- hits */
  impulse(idx, vx, vy, spread = 0.45) {
    const dt = STEP;
    for (let i = 0; i < 11; i++) {
      const k = i === idx ? 1 : spread;
      this.pts[i].px -= vx * k * dt;
      this.pts[i].py -= vy * k * dt;
    }
  }
  knock(kx, ky, idx, tumbleFor) {
    const r = this.root;
    if (this.mode === 'active' || this.mode === 'rising') {
      r.vx += kx; r.vy += ky;
      if (ky < -50) r.grounded = false;
      this.knockT = 0.35;
    }
    this.impulse(idx != null ? idx : P.PELVIS, kx * 0.9, ky * 0.9, 0.5);
    if (tumbleFor > 0) this.tumble(tumbleFor, kx, ky);
  }
  tumble(dur, kx = 0, ky = 0) {
    if (this.mode === 'active' || this.mode === 'rising') {
      const dt = STEP, r = this.root;
      for (const p of this.pts) { p.px -= r.vx * dt * 0.6; p.py -= r.vy * dt * 0.6; }
    }
    const kick = Math.hypot(kx, ky);
    if (kick > 300) {
      const dir = Math.sign(kx || 1) * Math.min(1, kick / 1400) * 260 * STEP;
      this.pts[P.HEAD].px -= dir; this.pts[P.NECK].px -= dir * 0.5;
      for (const i of [P.FFOOT, P.BFOOT]) this.pts[i].px += dir;
    }
    this.mode = 'tumble';
    this.stunT = Math.max(this.stunT, dur);
    this.act = null; this.hold = null; this.dash = null;
  }

  /* ------------------------------------------------------------ update */
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.knockT = Math.max(0, this.knockT - dt);
    if (this.act) { this.act.t += dt; if (this.act.t >= this.act.dur) this.act = null; }
    if (this.mode === 'active' || this.mode === 'rising') {
      if (this.mode === 'rising') {
        this.m = Math.min(1, this.m + dt / 0.6);
        if (this.m >= 0.85) this.mode = 'active';
      } else this.m = Math.min(1, this.m + dt * 3);
      this.stepRoot(dt);
      this.t += dt;
      this.computeTargets();
    } else {
      this.m = Math.max(0, this.m - dt * 8);
      this.stunT -= dt;
    }
    this.stepBody(dt);
    if (this.mode === 'tumble') this.followBody(dt);
  }

  stepRoot(dt) {
    const r = this.root;
    const control = this.mode === 'active';
    if (this.dash) {
      this.dash.t -= dt;
      r.vx = this.dash.vx; if (this.dash.vy != null) r.vy = this.dash.vy;
      if (this.dash.vy == null) r.vy += ROOT_G * dt;
      if (this.dash.t <= 0) { r.vx *= 0.35; this.dash = null; }
    } else {
      let want = control ? this.input.x * this.speed : 0;
      if (this.act && this.act.lock) want = 0;
      else if (this.act) want *= this.act.move != null ? this.act.move : 0.55;
      if (this.hold === 'charge') want *= 0.5;
      else if (this.hold === 'block') want *= 0.45;
      let acc = r.grounded ? 14 : 6;
      if (this.knockT > 0) acc *= 0.15;
      r.vx += (want - r.vx) * Math.min(1, acc * dt);
      r.vy += ROOT_G * dt;
    }
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    const wasGrounded = r.grounded;
    r.grounded = false;
    if (r.y >= this.groundY && r.vy >= 0) {
      const impact = r.vy;
      r.y = this.groundY; r.vy = 0; r.grounded = true; r.jumps = 0;
      if (!wasGrounded && impact > 700) this.landT = Math.min(1, impact / 1800);
    }
    const b = this.bounds;
    if (r.x < b.minX) { r.x = b.minX; if (r.vx < 0) r.vx = 0; }
    if (r.x > b.maxX) { r.x = b.maxX; if (r.vx > 0) r.vx = 0; }
    if (r.grounded && Math.abs(r.vx) > 20) this.walkPh += Math.abs(r.vx) * dt * 0.05 / this.s;
    if (this.landT) this.landT = Math.max(0, this.landT - dt * 3);
  }

  /* pose targets: hands relative to the neck, feet relative to the root, both in "facing" space (+x = forward) */
  computeTargets() {
    const s = this.s, f = this.facing, r = this.root, T = this.T, Tp = this.Tp;
    for (let i = 0; i < 11; i++) { Tp[i].x = T[i].x; Tp[i].y = T[i].y; }
    const air = !r.grounded;
    const moving = r.grounded && Math.abs(r.vx) > 40;
    const bob = Math.sin(this.t * 3) * 1.4;
    let lean = clamp(r.vx * 0.012 * f, -7, 7);   // forward lean in facing space
    let crouch = (this.landT || 0) * 14;
    let hands = null;   // [fx, fy, bx, by] relative to neck, facing space
    let ffoot = null, bfoot = null;   // feet relative to root, facing space
    let headTilt = 0;
    const guard = [23, 20 + bob, -13, 18 + bob];
    const L = (from, to, k) => from.map((v, i) => lerp(v, to[i], k));
    const a = this.act;
    if (a) {
      const { ph, u } = this.phase();
      const three = (wind, strike, rest = guard) => ph === 0 ? L(rest, wind, easeInOut(u)) : ph === 1 ? L(wind, strike, easeOut(clamp(u / 0.5, 0, 1))) : L(strike, rest, easeInOut(u));
      switch (a.id) {
        case 'kick': {
          const lift = this.lift;
          const back = [-24, -18], strike = [40, -18 - lift * 42];
          ffoot = ph === 0 ? L([15, 0], back, easeInOut(u)) : ph === 1 ? L(back, strike, easeOut(clamp(u / 0.6, 0, 1))) : L(strike, [15, 0], easeInOut(u));
          hands = three([30, 6, -26, 2], [-8, 14, 34, -4]);
          lean += ph === 0 ? -4 : ph === 1 ? -7 - lift * 4 : 0;
          break;
        }
        case 'header': {
          hands = three([20, 24, -20, 22], [-10, 20, -24, 16]);
          headTilt = ph === 1 ? 10 : 0;
          lean += ph === 0 ? -6 : ph === 1 ? 9 : 0;
          break;
        }
        case 'slide': {
          ffoot = [46, -4]; bfoot = [6, 0];
          hands = [-20, 18, -34, 10];
          lean += 16; crouch += 34;
          break;
        }
        case 'jab': hands = three([16, -2, 14, -6], [46, -2, 14, -6], [16, -2, 14, -6]); lean += ph === 1 ? 6 : 0; break;
        case 'hook': hands = three([-6, -6, 14, -6], [44, -10, 14, -6], [16, -2, 14, -6]); lean += ph === 0 ? -5 : ph === 1 ? 10 : 2; crouch += ph === 0 ? 4 : 0; break;
        case 'uppercut': hands = three([10, 20, 14, -6], [24, -36, 14, -6], [16, -2, 14, -6]); crouch += ph === 0 ? 10 : 0; lean += ph === 1 ? 6 : 0; break;
        case 'shove': hands = three([10, 10, 6, 12], [44, 4, 40, 8]); lean += ph === 1 ? 10 : -2; break;
        case 'swipe': hands = three([10, -10, -12, 16], [42, 26, -12, 16]); lean += ph === 1 ? 8 : 0; crouch += ph === 1 ? 8 : 0; break;
        case 'shoot': hands = three([10, -40, 2, -36], [26, -48, 18, -42], [20, -6, 4, 10]); break;
        case 'dunk': hands = three([-4, -46, -12, -44], [40, -6, 34, -2]); lean += ph === 1 ? 12 : -4; break;
        case 'bump': hands = three([22, 24, 20, 26], [34, 14, 32, 16]); crouch += ph === 2 ? 0 : 16; lean += 4; break;
        case 'set': hands = three([6, -38, 0, -36], [12, -48, 6, -46]); crouch += ph === 0 ? 8 : 0; break;
        case 'spike': hands = three([-14, -44, 22, -18], [40, -6, 6, 18]); lean += ph === 0 ? -6 : ph === 1 ? 12 : 3; break;
        case 'dive': {
          hands = [44, 14, 40, 20];
          ffoot = [-30, -10]; bfoot = [-40, -20];
          lean += 22; crouch += 30;
          break;
        }
        case 'throw': {
          hands = three([-42, -4, 26, -2], [40, -34, -10, 24], [26, 10, -12, 18]);
          lean += ph === 0 ? -8 : ph === 1 ? 12 : 6;
          if (ph >= 1) ffoot = [26, 0];
          break;
        }
        default: break;
      }
    } else if (this.hold) {
      const k = this.holdK;
      switch (this.hold) {
        case 'block': hands = [18, -10 + bob, 13, -4 + bob]; crouch += 4; break;
        case 'guard': hands = [20, -4 + bob, 14, -2 + bob]; break;
        case 'charge': hands = [lerp(14, -8, k), lerp(-20, -30, k), lerp(4, -14, k), lerp(-14, -24, k)]; crouch += 6 + k * 10; lean -= k * 3; break;
        case 'aimshot': hands = [12, -38, 4, -34]; crouch += 6 + k * 12; break;
        case 'kickcharge': ffoot = [lerp(15, -22, k), lerp(0, -16, k)]; hands = [30, 6, -26, 2]; lean -= 4 * k; break;
        case 'dribble': hands = [30, 34 + Math.sin(this.t * 9) * 3, -12, 16 + bob]; lean += 3; crouch += 4; break;
        case 'reach': hands = [16, -46, 6, -44]; break;
        case 'carryball': hands = [22, 8, 18, 12]; break;
        case 'ready': hands = [26, 22, 22, 24]; crouch += 12; lean += 3; break;
        case 'carry': hands = [-12, -14, 22, 6]; break;
        case 'aim': hands = [lerp(-20, -42, k), lerp(-12, -4, k), 26, lerp(4, -6, k)]; lean -= k * 6; crouch += k * 6; break;
        case 'celebrate': { const w = Math.sin(this.t * 9) * 6; hands = [10 + w, -46, -10 - w, -44]; break; }
        case 'sad': hands = [10, 36, -8, 36]; headTilt = 6; crouch += 6; lean += 4; break;
        default: break;
      }
    }

    const gx = r.x, gy = r.y;
    let ff, bf;
    if (ffoot && bfoot) { ff = [gx + f * ffoot[0] * s, gy + ffoot[1] * s]; bf = [gx + f * bfoot[0] * s, gy + bfoot[1] * s]; }
    else if (air) {
      const tuck = clamp(-r.vy * 0.01, -6, 14);
      ff = [gx + f * 13 * s, gy - (12 + tuck) * s];
      bf = [gx - f * 11 * s, gy - (4 + tuck * 0.5) * s];
    } else if (moving) {
      const dir = Math.sign(r.vx), a1 = this.walkPh;
      ff = [gx + dir * Math.sin(a1) * 19 * s, gy - Math.max(0, Math.cos(a1)) * 14 * s];
      bf = [gx + dir * Math.sin(a1 + Math.PI) * 19 * s, gy - Math.max(0, Math.cos(a1 + Math.PI)) * 14 * s];
    } else {
      ff = [gx + f * 15 * s, gy];
      bf = [gx - f * 13 * s, gy];
    }
    if (ffoot && !bfoot) ff = [gx + f * ffoot[0] * s, gy + ffoot[1] * s];
    const px = gx + f * lean * 0.35 * s, py = gy - (52 - bob - crouch) * s;
    const nx = px + f * lean * s, ny = py - 45 * s;
    T[P.PELVIS].x = px; T[P.PELVIS].y = py;
    T[P.NECK].x = nx; T[P.NECK].y = ny;
    T[P.HEAD].x = nx + f * (2 + lean * 0.3 + headTilt) * s; T[P.HEAD].y = ny - (17 - headTilt * 0.4) * s;
    T[P.FFOOT].x = ff[0]; T[P.FFOOT].y = Math.min(ff[1], this.groundY);
    T[P.BFOOT].x = bf[0]; T[P.BFOOT].y = Math.min(bf[1], this.groundY);
    T[P.FKNEE].x = (px + ff[0]) / 2 + f * 9 * s; T[P.FKNEE].y = (py + ff[1]) / 2;
    T[P.BKNEE].x = (px + bf[0]) / 2 + f * 9 * s; T[P.BKNEE].y = (py + bf[1]) / 2;

    if (!hands) {
      const sw = moving ? Math.sin(this.walkPh) * 8 : 0;
      hands = air
        ? [12 + Math.sin(this.t * 3.2) * 2, 30, -10 - Math.sin(this.t * 2.6) * 1.5, 29]
        : [23 + sw, 20 + bob, -13 - sw * 0.45, 18 + bob];
    }
    const setArm = (hi, ei, hx, hy, lead) => {
      hx *= f * s; hy *= s;
      const rawLen = Math.hypot(hx, hy) || 1, maxReach = 47.5 * s;
      if (rawLen > maxReach) { const k = maxReach / rawLen; hx *= k; hy *= k; }
      T[hi].x = nx + hx; T[hi].y = ny + hy;
      const mx = nx + hx / 2, my = ny + hy / 2;
      const l = Math.hypot(hx, hy) || 1;
      let bx = -hy / l, by = hx / l;
      // elbows bend down and out: lead elbow forward-down, rear elbow back-down
      const prefX = lead ? f * 0.4 : -f, prefY = 0.9;
      if (bx * prefX + by * prefY < 0) { bx = -bx; by = -by; }
      const armLen = 24 * s, half = Math.min(armLen, l / 2);
      const bend = Math.sqrt(Math.max(0, armLen * armLen - half * half));
      T[ei].x = mx + bx * bend; T[ei].y = my + by * bend;
    };
    setArm(P.FHAND, P.FELB, hands[0], hands[1], true);
    setArm(P.BHAND, P.BELB, hands[2], hands[3], false);
  }

  stepBody(dt) {
    const m = this.m, pts = this.pts, T = this.T, Tp = this.Tp;
    const g = BODY_G * dt * dt * (1 - 0.9 * m);
    const air = m < 0.5 ? 0.998 : 0.99;
    for (let i = 0; i < 11; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * air, vy = (p.y - p.py) * air;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      if (m > 0.01) {
        let k = MUSCLE[i] * m, damping = MUSCLE_DAMP;
        const isArm = i === P.FELB || i === P.FHAND || i === P.BELB || i === P.BHAND;
        const isLeg = i === P.FFOOT || i === P.FKNEE;
        if (this.mode === 'active' && (isArm || (isLeg && this.act))) {
          const control = this.act ? 2.1 : !this.root.grounded ? 1.65 : 1.3;
          k = Math.min(this.act ? 0.56 : 0.46, k * control);
          damping += this.act ? 0.12 : 0.05;
        }
        const tvx = T[i].x - Tp[i].x, tvy = T[i].y - Tp[i].y;
        p.x += (T[i].x - p.x) * k - (vx - tvx) * damping * m;
        p.y += (T[i].y - p.y) * k - (vy - tvy) * damping * m;
      }
    }
    const s = this.s;
    const solve = (A, B, wa, wb, d0, d1, stiff) => {
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const target = d < d0 ? d0 : d > d1 ? d1 : d;
      if (target === d) return;
      const k = ((d - target) / d) * stiff / (wa + wb);
      A.x += dx * k * wa; A.y += dy * k * wa;
      B.x -= dx * k * wb; B.y -= dy * k * wb;
    };
    const gy = this.groundY, b = this.bounds;
    const loose = this.mode !== 'active';
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < SEGS.length; k++) {
        const ia = SEGS[k][0], ib = SEGS[k][1], Lb = BONE_LEN[k] * s;
        solve(pts[ia], pts[ib], INV_MASS[ia], INV_MASS[ib], Lb, Lb, 1);
      }
      for (const [ia, ib, lo, hi] of JOINT_LIMITS) solve(pts[ia], pts[ib], INV_MASS[ia], INV_MASS[ib], lo * s, hi * s, 0.6);
      if (loose) for (const p of pts) groundPoint(p, gy, b);
    }
    if (!loose) for (const i of [P.FFOOT, P.BFOOT, P.FKNEE, P.BKNEE]) groundPoint(pts[i], gy, null);
  }

  followBody(dt) {
    const r = this.root, pv = this.pelvis;
    r.vx = (pv.x - pv.px) / dt; r.vy = (pv.y - pv.py) / dt;
    r.x = pv.x; r.y = pv.y + 50 * this.s;
    r.grounded = false;
    if (this.stunT > 0) return;
    const speed = Math.hypot(r.vx, r.vy);
    if (speed > 240 && this.stunT > -2) return;
    if (this.groundY - pv.y > 70 * this.s) return;   // still in the air
    r.x = clamp(pv.x, this.bounds.minX, this.bounds.maxX); r.y = this.groundY; r.vx = 0; r.vy = 0;
    r.grounded = true; r.jumps = 0;
    this.mode = 'rising';
    this.m = 0.05;
  }

  /* ---------------------------------------------------------- hurtbox */
  hitCapsule(ax, ay, bx, by, rad) {
    const s = this.s, pts = this.pts;
    const h = pts[P.HEAD];
    const hr = segPointDist(ax, ay, bx, by, h.x, h.y);
    if (hr.d < HEAD_R * s + rad) return { seg: 0, idx: P.HEAD, head: true, px: h.x, py: h.y, t: hr.t };
    let best = null;
    for (let i = 1; i < SEGS.length; i++) {
      const [a, b, br] = SEGS[i];
      const A = pts[a], B = pts[b];
      const res = segSegDist(ax, ay, bx, by, A.x, A.y, B.x, B.y);
      if (res.d < br * s + rad && (!best || res.t < best.t)) best = { seg: i, idx: res.u > 0.5 ? b : a, head: false, px: lerp(A.x, B.x, res.u), py: lerp(A.y, B.y, res.u), t: res.t };
    }
    return best;
  }
  hitCircle(x, y, r) { return this.hitCapsule(x, y, x + 0.01, y, r); }

  /* --------------------------------------------------------------- draw */
  // flat, chunky mannequin: thick rounded limbs, no outlines, no faces, plus a kit
  draw(ctx, time) {
    const s = this.s, pts = this.pts, kit = this.kit;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const fl = this.flash;
    const tint = c => (fl > 0 ? mixHex(c, '#ffffff', fl) : c);
    const skin = tint(kit.skin), skinShade = tint(kit.skinShade);
    const jersey = tint(kit.color), jerseyShade = tint(mixHex(kit.color, '#000000', 0.25));
    const shorts = tint(kit.shorts), shortsShade = tint(mixHex(kit.shorts, '#000000', 0.25));
    const seg = (a, b, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
    };
    const part = (a, b, t0, t1, w, col) => {
      const A = pts[a], B = pts[b];
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(lerp(A.x, B.x, t0), lerp(A.y, B.y, t0)); ctx.lineTo(lerp(A.x, B.x, t1), lerp(A.y, B.y, t1)); ctx.stroke();
    };
    const boxer = kit.style === 'boxer';
    const sleeve = kit.style === 'jersey';
    // back limbs in the shade tone
    seg(2, 9, 13, skinShade); seg(9, 10, 11, skinShade);
    part(2, 9, 0, 0.62, 14.5, shortsShade);
    this.drawShoe(ctx, P.BKNEE, P.BFOOT, '#20242f');
    seg(1, 5, 11, skinShade); seg(5, 6, 9.5, skinShade);
    if (sleeve) part(1, 5, 0, 0.7, 12.5, jerseyShade);
    if (boxer) this.drawGlove(ctx, P.BELB, P.BHAND, jerseyShade);
    else { ctx.fillStyle = skinShade; ctx.beginPath(); ctx.arc(pts[P.BHAND].x, pts[P.BHAND].y, 5.3 * s, 0, TAU); ctx.fill(); }
    // torso: jersey (or bare skin for boxers)
    seg(1, 2, 22, boxer ? skin : jersey);
    part(1, 2, 0.72, 1, 23, shorts);
    if (kit.style === 'jersey' || kit.style === 'singlet') {
      // a trim stripe across the chest and the shirt number
      part(1, 2, 0.06, 0.13, 22.5, tint(kit.trim));
      this.drawNumber(ctx, kit.number, tint(kit.trim));
    }
    if (boxer) part(1, 2, 0.7, 0.76, 23.5, tint(kit.color));   // waistband
    // front leg
    seg(2, 7, 13.5, skin); seg(7, 8, 11.5, skin);
    part(2, 7, 0, 0.62, 15, shorts);
    this.drawShoe(ctx, P.FKNEE, P.FFOOT, '#2b3040');
    // head: rounded block
    const hd = pts[P.HEAD], hr = HEAD_R * s;
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.roundRect(hd.x - hr, hd.y - hr * 1.05, hr * 2, hr * 2.1, hr * 0.8); ctx.fill();
    this.drawHeadgear(ctx, hd, time);
    // front arm on top
    seg(1, 3, 11, skin); seg(3, 4, 9.5, skin);
    if (sleeve) part(1, 3, 0, 0.7, 12.5, jersey);
    if (boxer) this.drawGlove(ctx, P.FELB, P.FHAND, jersey);
    else { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(pts[P.FHAND].x, pts[P.FHAND].y, 5.8 * s, 0, TAU); ctx.fill(); }
  }

  drawShoe(ctx, k, f, col) {
    const s = this.s, F = this.pts[f];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(F.x + this.facing * 3 * s, F.y + 1 * s, 8 * s, 5.5 * s, 0, 0, TAU); ctx.fill();
  }

  drawGlove(ctx, e, h, col) {
    const s = this.s, E = this.pts[e], Hh = this.pts[h];
    ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 10 * s;
    ctx.beginPath(); ctx.moveTo(lerp(E.x, Hh.x, 0.55), lerp(E.y, Hh.y, 0.55)); ctx.lineTo(lerp(E.x, Hh.x, 0.75), lerp(E.y, Hh.y, 0.75)); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(Hh.x, Hh.y, 11 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.arc(Hh.x - 3 * s, Hh.y - 4 * s, 4 * s, 0, TAU); ctx.fill();
  }

  drawNumber(ctx, n, col) {
    const s = this.s, A = this.pts[P.NECK], B = this.pts[P.PELVIS];
    const x = lerp(A.x, B.x, 0.42), y = lerp(A.y, B.y, 0.42);
    const ang = Math.atan2(B.y - A.y, B.x - A.x) - Math.PI / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.globalAlpha *= 0.85;
    ctx.font = `900 ${Math.round(15 * s)}px Rubik, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 1);
    ctx.restore();
  }

  drawHeadgear(ctx, hd, time) {
    const s = this.s, f = this.facing, hr = HEAD_R * s, kit = this.kit;
    const col = kit.hatColor || kit.color;
    switch (kit.hat) {
      case 'band': {
        ctx.fillStyle = col;
        ctx.fillRect(hd.x - hr, hd.y - hr * 0.55, hr * 2, 5 * s);
        ctx.strokeStyle = col; ctx.lineWidth = 3.5 * s; ctx.lineCap = 'round';
        const wave = Math.sin(time * 6 + this.t) * 3 * s;
        ctx.beginPath();
        ctx.moveTo(hd.x - f * hr, hd.y - hr * 0.45);
        ctx.quadraticCurveTo(hd.x - f * (hr + 10 * s), hd.y - hr * 0.5 + wave, hd.x - f * (hr + 18 * s), hd.y - hr * 0.1 + wave);
        ctx.stroke();
        break;
      }
      case 'cap': {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(hd.x - hr - 1 * s, hd.y - hr * 1.15, hr * 2 + 2 * s, hr * 0.95, [hr, hr, 2 * s, 2 * s]); ctx.fill();
        ctx.fillRect(f > 0 ? hd.x : hd.x - hr * 1.9, hd.y - hr * 0.32, hr * 1.9, 4 * s);
        break;
      }
      case 'beanie': {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(hd.x - hr - 1.5 * s, hd.y - hr * 1.2, hr * 2 + 3 * s, hr * 1.05, [hr, hr, 3 * s, 3 * s]); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(hd.x, hd.y - hr * 1.25, 4.5 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = mixHex(col, '#000000', 0.25);
        ctx.fillRect(hd.x - hr - 1.5 * s, hd.y - hr * 0.35, hr * 2 + 3 * s, 4 * s);
        break;
      }
      case 'mohawk': {
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) {
          const x = hd.x + (i - 2) * 4.2 * s * -f, y = hd.y - hr * 0.95;
          ctx.beginPath(); ctx.moveTo(x - 3 * s, y); ctx.lineTo(x - f * 3 * s, y - (9 + (i % 2) * 3) * s); ctx.lineTo(x + 3 * s, y); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'helmet': {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(hd.x - hr - 2 * s, hd.y - hr * 1.2, hr * 2 + 4 * s, hr * 1.5, [hr, hr, 3 * s, 3 * s]); ctx.fill();
        ctx.strokeStyle = '#e8ebf2'; ctx.lineWidth = 2.2 * s;
        ctx.beginPath(); ctx.moveTo(hd.x + f * hr * 0.2, hd.y + hr * 0.1); ctx.lineTo(hd.x + f * (hr + 4 * s), hd.y + hr * 0.1); ctx.lineTo(hd.x + f * (hr + 4 * s), hd.y + hr * 0.75); ctx.stroke();
        break;
      }
      case 'crown': {
        ctx.fillStyle = '#ffd34d';
        const y = hd.y - hr * 1.0;
        ctx.beginPath(); ctx.moveTo(hd.x - hr * 0.85, y); ctx.lineTo(hd.x - hr * 0.85, y - 9 * s); ctx.lineTo(hd.x - hr * 0.42, y - 4 * s); ctx.lineTo(hd.x, y - 12 * s); ctx.lineTo(hd.x + hr * 0.42, y - 4 * s); ctx.lineTo(hd.x + hr * 0.85, y - 9 * s); ctx.lineTo(hd.x + hr * 0.85, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff4f5e'; ctx.beginPath(); ctx.arc(hd.x, y - 3.5 * s, 2.2 * s, 0, TAU); ctx.fill();
        break;
      }
      case 'halo': {
        ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 3 * s; ctx.globalAlpha *= 0.95;
        ctx.beginPath(); ctx.ellipse(hd.x, hd.y - hr * 1.7 + Math.sin(time * 3) * 1.5 * s, hr * 1.05, hr * 0.32, 0, 0, TAU); ctx.stroke();
        break;
      }
      case 'shades': {
        ctx.fillStyle = '#12151f';
        ctx.beginPath(); ctx.roundRect(hd.x - f * 2 * s - (f > 0 ? 0 : hr * 1.2), hd.y - hr * 0.35, hr * 1.2 + 2 * s, 6 * s, 2 * s); ctx.fill();
        ctx.fillRect(hd.x - hr, hd.y - hr * 0.3, hr * 2, 2 * s);
        break;
      }
      case 'afro': {
        ctx.fillStyle = col === kit.color ? '#2a2018' : col;
        for (const [dx, dy, r] of [[0, -1.0, 0.9], [-0.7, -0.75, 0.7], [0.7, -0.75, 0.7], [-0.95, -0.2, 0.55], [0.95, -0.2, 0.55], [-0.35, -1.25, 0.6], [0.35, -1.25, 0.6]]) {
          ctx.beginPath(); ctx.arc(hd.x + dx * hr, hd.y + dy * hr, r * hr, 0, TAU); ctx.fill();
        }
        break;
      }
      default: break;
    }
  }
}

/* keep a loose point above the ground and inside the side walls */
function groundPoint(p, gy, b) {
  if (p.y > gy) {
    p.y = gy;
    p.px = lerp(p.px, p.x, 0.5);           // friction
    p.py = p.y + Math.min(0, p.py - p.y) * 0.15;
  }
  if (b) {
    const lo = b.minX - 24, hi = b.maxX + 24;
    if (p.x < lo) { p.x = lo; p.px = p.x + Math.max(0, p.px - p.x) * 0.3; }
    if (p.x > hi) { p.x = hi; p.px = p.x + Math.min(0, p.px - p.x) * 0.3; }
  }
}
