'use strict';
/* =========================================================================
   Effects: particles, shockwave rings, arcs, confetti, floating
   score text. Everything lives in world space.
   ========================================================================= */

class FX {
  constructor() { this.p = []; this.texts = []; this.arcs = []; }

  clear() { this.p.length = 0; this.texts.length = 0; this.arcs.length = 0; }

  add(o) {
    if (this.p.length > 900) this.p.shift();
    const p = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.6, size: 6, color: '#fff', kind: 'glow', rot: 0, vr: 0, add: true, grow: 0 }, o);
    p.max = p.life;
    this.p.push(p);
    return p;
  }

  burst(x, y, color, n, speed = 260, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.25, 1) * speed;
      this.add(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life: rand(0.3, 0.7), size: rand(4, 10), drag: 3 }, opts));
    }
  }

  ring(x, y, color, r = 80, life = 0.4, width = 6) {
    this.add({ kind: 'ring', x, y, color, size: r, life, width, add: true });
  }

  chunks(x, y, color, n, speed = 380, size = 7) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), v = rand(0.3, 1) * speed;
      this.add({ kind: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, color, size: rand(0.5, 1) * size, life: rand(0.6, 1.1), vr: rand(-12, 12), add: false });
    }
  }

  confetti(x, y, colors, n = 40, speed = 700) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), v = rand(0.35, 1) * speed;
      this.add({ kind: 'confetti', x: x + rand(-20, 20), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 2.2, color: pick(colors), size: rand(7, 12), life: rand(1.4, 2.4), rot: rand(0, TAU), vr: rand(-9, 9), add: false });
    }
  }

  dust(x, y, n = 6, color = '#d9cfb8', dir = 0) {
    for (let i = 0; i < n; i++) this.add({ kind: 'dust', x: x + rand(-10, 10), y: y - rand(0, 6), vx: rand(-90, 90) + dir * 120, vy: rand(-90, -20), drag: 4, color, size: rand(4, 8), life: rand(0.35, 0.6), add: false });
  }

  arc(x0, y0, x1, y1, color, life = 0.22) {
    const pts = [[x0, y0]];
    const n = Math.max(3, Math.floor(dist(x0, y0, x1, y1) / 26));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([lerp(x0, x1, t) + rand(-16, 16), lerp(y0, y1, t) + rand(-16, 16)]);
    }
    pts.push([x1, y1]);
    this.arcs.push({ pts, color, life, max: life });
  }

  text(x, y, str, color = '#fff', size = 26, opts = {}) {
    this.texts.push(Object.assign({ x, y, str, color, size, life: 1, max: 1, vy: -70 }, opts));
  }

  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.life -= dt;
      if (p.life <= 0) { this.p.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt / (t.dur || 1);
      t.y += t.vy * dt; t.vy *= Math.exp(-2.4 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
  }

  draw(ctx) {
    // normal-blend first, then additive
    for (const p of this.p) {
      if (p.add) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.35 : Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      if (p.kind === 'chunk') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size * 0.8, -p.size * 0.8); ctx.lineTo(p.size, p.size * 0.5); ctx.lineTo(-p.size * 0.4, p.size); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.4, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'bow') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.strokeStyle = p.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 18, 36, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'confetti') {
        // paper flake: flips as it spins so it flutters on the way down
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size * 0.3 * Math.cos(p.rot * 2.3), p.size, p.size * 0.6 * Math.cos(p.rot * 2.3));
        ctx.restore();
      } else if (p.kind === 'dust') {
        ctx.globalAlpha = a * 0.45;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === 'pixel') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'smoke' ? 1 + (1 - a) : 1), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.p) {
      if (!p.add) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'ring') {
        // shockwave: soft filled disc, a wide haze band and a crisp leading edge
        const r = p.size * (1 - a * a) + 4;
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
        g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(0.75, rgba(p.color, 0.1 * a)); g.addColorStop(1, rgba(p.color, 0.32 * a));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.35; ctx.strokeStyle = p.color; ctx.lineWidth = p.width * 2.4 * a + 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, r - p.width * 0.6), 0, TAU); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = p.width * 0.7 * a + 1.5; ctx.strokeStyle = mixHex(p.color, '#ffffff', 0.45);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'flame' || p.kind === 'shard') {
        // oriented along velocity: flame tongues and ice shards
        const ang = Math.atan2(p.vy, p.vx), L = p.size * (p.kind === 'flame' ? 2.6 : 3.2) * (0.5 + a * 0.5), Wd = p.size * (p.kind === 'flame' ? 0.9 : 0.55);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.globalAlpha = a * (p.kind === 'flame' ? 0.65 : 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (p.kind === 'flame') { ctx.moveTo(L, 0); ctx.quadraticCurveTo(0, -Wd * 1.4, -Wd, 0); ctx.quadraticCurveTo(0, Wd * 1.4, L, 0); }
        else { ctx.moveTo(L, 0); ctx.lineTo(0, -Wd); ctx.lineTo(-L * 0.35, 0); ctx.lineTo(0, Wd); ctx.closePath(); }
        ctx.fill();
        ctx.fillStyle = p.kind === 'flame' ? '#ffe08a' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(L * 0.7, 0); ctx.lineTo(0, -Wd * 0.4); ctx.lineTo(-Wd * 0.3, 0); ctx.lineTo(0, Wd * 0.4); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (p.kind === 'ember') {
        // soft translucent flame wisp that shrinks and cools as it rises
        const r = p.size * (0.35 + a * 0.65);
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = a > 0.55 ? p.color : '#ff5a2a';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.7, r * 1.25, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.25, r * 0.3, r * 0.55, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'star') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        const R = p.size * (0.6 + a * 0.4);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const b = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? R * 0.42 : R; ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (p.kind === 'crescent') {
        // wind gust: a curved air blade sweeping outward along p.ang
        const r = p.size * (1.2 - a * 0.6);
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.color; ctx.lineCap = 'round';
        ctx.lineWidth = 2 + a * 7;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, p.ang - 0.75, p.ang + 0.75); ctx.stroke();
        ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1.5 + a * 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72, p.ang - 0.55, p.ang + 0.55); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'beam') {
        const w = p.size * (0.4 + a * 0.6);
        const grd = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
        grd.addColorStop(0, rgba(p.color, 0));
        grd.addColorStop(0.5, rgba(p.color, a * 0.9));
        grd.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = grd;
        ctx.fillRect(p.x - w, -200, w * 2, p.y + 200);
        Glow.draw(ctx, p.color, p.x, p.y, w * 3, a);
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        Glow.draw(ctx, p.color, p.x, p.y, p.size * (0.6 + a * 0.6) * 2, a);
      }
    }
    for (const a of this.arcs) {
      const k = a.life / a.max;
      for (const [w, col, al] of [[9, a.color, 0.35], [3, '#ffffff', 1]]) {
        ctx.globalAlpha = k * al;
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); a.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = clamp(t.life * 2.5, 0, 1);
      const pop = t.life > 0.85 ? easeOutBack((1 - t.life) / 0.15) : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(t.size * pop * 0.9)}px Rubik, Impact, sans-serif`;
      ctx.lineWidth = Math.max(3, t.size * 0.2); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(40,40,40,0.9)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
