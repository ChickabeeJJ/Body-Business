'use strict';
/* =========================================================================
   Ball physics. A ball bounces off the ground, the side walls, static
   segments (crossbars, backboards, nets) and pegs (rims), and off every
   bone of every ragdoll, taking the bone's own velocity into account, so
   a swinging foot, a jumping head or a falling body all move it naturally.
   ========================================================================= */

const BALLS = {
  soccer: { r: 17, e: 0.62, fr: 0.012, roll: 0.55, g: 1700, drag: 0.12, bodyE: 0.32 },
  basket: { r: 18, e: 0.74, fr: 0.02, roll: 0.9, g: 1900, drag: 0.08, bodyE: 0.45 },
  volley: { r: 20, e: 0.5, fr: 0.05, roll: 1.5, g: 1150, drag: 0.25, bodyE: 0.6 },
};

class Ball {
  constructor(kind, x, y) {
    const k = BALLS[kind];
    this.kind = kind;
    this.r = k.r; this.e = k.e; this.fr = k.fr; this.roll = k.roll; this.g = k.g; this.drag = k.drag; this.bodyE = k.bodyE;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.ang = 0; this.spin = 0;
    this.held = null;          // athlete holding / dribbling it
    this.last = null;          // last athlete to touch it
    this.touchCd = new Map();  // athlete -> seconds until body contact can report again
    this.grounded = false;
    this.frozen = false;
    this.trail = [];
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  set(x, y, vx = 0, vy = 0) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.spin = 0; this.trail.length = 0; }

  step(dt, arena) {
    for (const [k, v] of this.touchCd) { if (v - dt <= 0) this.touchCd.delete(k); else this.touchCd.set(k, v - dt); }
    if (this.held || this.frozen) return null;
    let hit = null;
    this.vy += this.g * dt;
    const dk = Math.exp(-this.drag * dt);
    this.vx *= dk; this.vy *= dk;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.grounded = false;
    const gy = arena.groundY;
    if (this.y + this.r > gy) {
      this.y = gy - this.r;
      if (this.vy > 0) {
        if (this.vy > 120) hit = { type: 'ground', v: this.vy };
        this.vy = -this.vy * this.e;
        if (Math.abs(this.vy) < 70) this.vy = 0;
      }
      this.vx *= 1 - Math.min(1, this.roll * dt * 2);
      this.grounded = true;
      this.spin = this.vx / this.r;
    }
    if (arena.minX != null && this.x - this.r < arena.minX) { this.x = arena.minX + this.r; if (this.vx < 0) { hit = hit || { type: 'wall', v: -this.vx }; this.vx = -this.vx * 0.7; } }
    if (arena.maxX != null && this.x + this.r > arena.maxX) { this.x = arena.maxX - this.r; if (this.vx > 0) { hit = hit || { type: 'wall', v: this.vx }; this.vx = -this.vx * 0.7; } }
    if (arena.ceil != null && this.y - this.r < arena.ceil) { this.y = arena.ceil + this.r; if (this.vy < 0) this.vy = -this.vy * 0.5; }
    if (arena.segs) for (const sg of arena.segs) { const h = this.collideSeg(sg); if (h) hit = h; }
    if (arena.pegs) for (const pg of arena.pegs) { const h = this.collidePeg(pg); if (h) hit = h; }
    if (!this.grounded) this.spin *= Math.exp(-0.4 * dt);
    this.ang += this.spin * dt;
    return hit;
  }

  bounce(nx, ny, e, fr, tag) {
    const vn = this.vx * nx + this.vy * ny;
    if (vn >= 0) return null;
    const tx = -ny, ty = nx, vt = this.vx * tx + this.vy * ty;
    this.vx = -vn * e * nx + vt * fr * tx;
    this.vy = -vn * e * ny + vt * fr * ty;
    this.spin = vt / this.r;
    return { type: tag || 'seg', v: -vn };
  }
  collideSeg(sg) {
    const r = segPointDist(sg.ax, sg.ay, sg.bx, sg.by, this.x, this.y);
    const rad = this.r + (sg.w || 0);
    if (r.d >= rad) return null;
    const cx = lerp(sg.ax, sg.bx, r.t), cy = lerp(sg.ay, sg.by, r.t);
    let nx = this.x - cx, ny = this.y - cy;
    const d = Math.hypot(nx, ny) || 1e-4; nx /= d; ny /= d;
    this.x = cx + nx * rad; this.y = cy + ny * rad;
    const h = this.bounce(nx, ny, sg.e != null ? sg.e : 0.55, sg.fr != null ? sg.fr : 0.9, sg.tag);
    if (h) h.seg = sg;
    return h;
  }
  collidePeg(pg) {
    const dx = this.x - pg.x, dy = this.y - pg.y, d = Math.hypot(dx, dy) || 1e-4, rad = this.r + pg.r;
    if (d >= rad) return null;
    const nx = dx / d, ny = dy / d;
    this.x = pg.x + nx * rad; this.y = pg.y + ny * rad;
    const h = this.bounce(nx, ny, pg.e != null ? pg.e : 0.6, 0.85, pg.tag || 'peg');
    if (h) h.peg = pg;
    return h;
  }

  /* ball vs every bone of a ragdoll. Returns the contact (which part, how hard) or null. */
  collideAthlete(a, opts = {}) {
    if (this.held || this.frozen) return null;
    const s = a.s, pts = a.pts;
    let best = null;
    // head
    {
      const h = pts[P.HEAD], dx = this.x - h.x, dy = this.y - h.y, d = Math.hypot(dx, dy), rad = this.r + HEAD_R * s;
      if (d < rad) best = { idx: P.HEAD, head: true, cx: h.x, cy: h.y, d, rad, A: P.HEAD, B: P.HEAD, t: 0 };
    }
    if (!best) {
      for (let i = 1; i < SEGS.length; i++) {
        const [ia, ib, br] = SEGS[i];
        const A = pts[ia], B = pts[ib];
        const r = segPointDist(A.x, A.y, B.x, B.y, this.x, this.y);
        const rad = this.r + (br + 2) * s;
        if (r.d < rad && (!best || r.d - rad < best.d - best.rad)) {
          best = { idx: r.t > 0.5 ? ib : ia, head: false, cx: lerp(A.x, B.x, r.t), cy: lerp(A.y, B.y, r.t), d: r.d, rad, A: ia, B: ib, t: r.t };
        }
      }
    }
    if (!best) return null;
    let nx = this.x - best.cx, ny = this.y - best.cy;
    const d = Math.hypot(nx, ny) || 1e-4; nx /= d; ny /= d;
    if (d < 1e-3) { nx = a.facing; ny = -0.3; }
    this.x = best.cx + nx * best.rad; this.y = best.cy + ny * best.rad;
    const va = a.vel(best.A), vb = a.vel(best.B);
    const bvx = lerp(va.x, vb.x, best.t), bvy = lerp(va.y, vb.y, best.t);
    const rvx = this.vx - bvx, rvy = this.vy - bvy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = (best.head ? 0.75 : this.bodyE) * (opts.e || 1);
      this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
      // the tangential part is mostly carried along by the limb
      const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
      this.vx -= vt * 0.25 * tx; this.vy -= vt * 0.25 * ty;
      this.spin = vt / this.r * 0.5;
      // nudge the body a little: balls are light, bodies are heavy
      const push = Math.min(5, -vn * 0.004);
      const p = pts[best.idx]; p.x -= nx * push; p.y -= ny * push;
      const sp = Math.hypot(this.vx, this.vy);
      const cap = opts.cap || 2600;
      if (sp > cap) { this.vx *= cap / sp; this.vy *= cap / sp; }
    }
    const fresh = !this.touchCd.has(a);
    this.touchCd.set(a, 0.12);
    this.last = a;
    return { athlete: a, idx: best.idx, head: best.head, foot: best.idx === P.FFOOT || best.idx === P.BFOOT || best.idx === P.FKNEE || best.idx === P.BKNEE, hand: best.idx === P.FHAND || best.idx === P.BHAND || best.idx === P.FELB || best.idx === P.BELB, v: Math.max(0, -vn), fresh, nx, ny };
  }

  /* fly the ball forward with no bodies in the way. cb(x, y, vx, vy, t) returning true stops it. */
  simulate(arena, tMax, cb, dt = 1 / 60) {
    const b = new Ball(this.kind, this.x, this.y);
    b.vx = this.vx; b.vy = this.vy;
    for (let t = 0; t < tMax; t += dt) {
      b.step(dt, arena);
      if (cb(b.x, b.y, b.vx, b.vy, t + dt)) return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, t: t + dt };
    }
    return null;
  }
  // where the ball will next be at height y on the way down (or touch the ground)
  predictAt(arena, y, tMax = 3) {
    if (this.held) return { x: this.x, y: this.y, t: 0 };
    return this.simulate(arena, tMax, (x, yy, vx, vy) => (vy > 0 && yy >= y) || yy + this.r >= arena.groundY - 1) || { x: this.x, y: this.y, t: tMax };
  }

  /* --------------------------------------------------------------- draw */
  drawShadow(ctx, gy) {
    const h = clamp((gy - this.y) / 500, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - h * 0.7)})`;
    ctx.beginPath(); ctx.ellipse(this.x, gy + 2, this.r * (1.1 - h * 0.4), this.r * 0.28 * (1 - h * 0.4), 0, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    const r = this.r, x = this.x, y = this.y;
    // speed streak
    const sp = this.speed;
    if (sp > 900 && !this.held) {
      ctx.globalAlpha = clamp((sp - 900) / 1400, 0, 0.5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - this.vx * 0.05, y - this.vy * 0.05); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.ang);
    if (this.kind === 'soccer') {
      ctx.fillStyle = '#f7f7f2'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20232e';
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); } ctx.closePath(); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + Math.PI / 2, cx = Math.cos(a) * r * 0.92, cy = Math.sin(a) * r * 0.92;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(32,35,46,0.45)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.stroke(); }
    } else if (this.kind === 'basket') {
      ctx.fillStyle = '#ef7d2c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a1d0c'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.85, 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();
    } else {
      ctx.fillStyle = '#f6f3ea'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
      ctx.fillStyle = '#ffc933'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.9, r * 1.3, r * 0.55, 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3c7bff'; ctx.beginPath(); ctx.ellipse(r * 0.5, r * 0.8, r * 1.2, r * 0.5, -0.6, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(40,40,60,0.35)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    }
    // soft top-left highlight
    ctx.rotate(-this.ang);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.36, r * 0.42, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* keep two upright athletes from walking through each other */
function separate(a, b, minD = 40) {
  if (a.mode !== 'active' && a.mode !== 'rising') return false;
  if (b.mode !== 'active' && b.mode !== 'rising') return false;
  const ra = a.root, rb = b.root;
  if (Math.abs(ra.y - rb.y) > 110) return false;
  const dx = rb.x - ra.x, ad = Math.abs(dx);
  if (ad >= minD) return false;
  const push = (minD - ad) / 2, sgn = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
  ra.x -= sgn * push; rb.x += sgn * push;
  const rel = (ra.vx - rb.vx) * sgn;
  if (rel > 0) { ra.vx -= rel * 0.5 * sgn; rb.vx += rel * 0.5 * sgn; }
  return true;
}
