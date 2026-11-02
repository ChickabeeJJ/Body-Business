'use strict';
/* =========================================================================
   Arenas: procedurally painted venues. A static layer (sky, stands, crowd,
   boards, field surface) is cached per view; a live layer draws the front
   row of the crowd, which bounces and throws its arms up on big moments.
   Looks: stadium (soccer), indoor (hoops), beach (volley), hall (boxing),
   track (javelin).
   ========================================================================= */

const LOOKS = {
  stadium: { sky: ['#1b2a52', '#3d5a8f', '#9fb6d6'], stand: '#232a3d', stand2: '#1a2031', board: '#14182a', surf: ['#3f9b4a', '#368a41'], under: '#1e4d25', lights: true },
  indoor: { sky: ['#0c0f1a', '#151a2a', '#1d2336'], stand: '#1c2234', stand2: '#151a29', board: '#0f1320', surf: ['#d29a5c', '#c58d50'], under: '#6b4423', lights: true, roof: true },
  beach: { sky: ['#3d8fe0', '#7cc0f2', '#d9f0ff'], surf: ['#f0d59a', '#e8cb8c'], under: '#d6b571', sea: true },
  hall: { sky: ['#07080d', '#0d1018', '#141824'], stand: '#121622', stand2: '#0e111a', board: '#0b0d15', surf: ['#3b4157', '#353a4f'], under: '#191c28', spot: true },
  track: { sky: ['#ff9a6a', '#ffc58a', '#ffe7c2'], stand: '#3a2e45', stand2: '#2f2539', board: '#221b2b', surf: ['#c9573f', '#bd4f39'], under: '#3e8f45', lights: false, sun: true },
};
const CROWD_COLS = ['#d9dde8', '#9aa3b8', '#6f7891', '#c95a5a', '#5a7fc9', '#e0b74e', '#5fb57a', '#b07ad1', '#e48a4b'];

const Arenas = (() => {
  let cache = null, key = '';

  function sky(c, sport, cw, ch) {
    const L = LOOKS[sport.arena.look];
    const g = c.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, L.sky[0]); g.addColorStop(0.55, L.sky[1]); g.addColorStop(1, L.sky[2]);
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  }

  function crowdFor(sport) {
    const a = sport.arena;
    if (a.crowd) return a.crowd;
    const L = LOOKS[a.look];
    a.crowd = [];
    if (!L.stand) return a.crowd;
    const wr = sport.world || { x0: -400, x1: W + 400 };
    const rng = mulberry32(a.look.length * 131 + 7);
    const kitCols = sport.athletes.map(t => t.kit.color);
    for (let x = wr.x0 + 6; x < wr.x1; x += 21 + rng() * 6) {
      const team = rng() < 0.5 ? 0 : 1;
      a.crowd.push({ x, ph: rng() * TAU, col: rng() < 0.35 ? kitCols[team] || pick(CROWD_COLS) : CROWD_COLS[(rng() * CROWD_COLS.length) | 0], team, s: 0.85 + rng() * 0.3, fan: rng() });
    }
    return a.crowd;
  }

  function stat(sport, rect, pxScale) {
    const a = sport.arena;
    const wpx = (rect.x1 - rect.x0) * pxScale;
    if (wpx > 7800) pxScale *= 7800 / wpx;
    const k = a.look + sport.id + rect.x0.toFixed(1) + rect.x1.toFixed(1) + rect.y0.toFixed(1) + rect.y1.toFixed(1) + pxScale.toFixed(3) + (sport.staticKey || '');
    if (k === key && cache) return cache;
    key = k;
    const cv = (cache && cache.canvas) || document.createElement('canvas');
    const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
    cv.width = Math.max(1, Math.ceil(w * pxScale)); cv.height = Math.max(1, Math.ceil(h * pxScale));
    const g = cv.getContext('2d');
    g.setTransform(pxScale, 0, 0, pxScale, -rect.x0 * pxScale, -rect.y0 * pxScale);
    paint(g, sport, rect);
    if (sport.paintStatic) sport.paintStatic(g, rect);
    cache = { canvas: cv, x0: rect.x0, y0: rect.y0, w, h };
    return cache;
  }

  function paint(g, sport, R) {
    const a = sport.arena, L = LOOKS[a.look], gy = sport.groundY;
    const x0 = R.x0, x1 = R.x1, y0 = R.y0, y1 = R.y1, w = x1 - x0;
    const rng = mulberry32(a.look.length * 977 + 3);
    // sky
    const sk = g.createLinearGradient(0, y0, 0, gy);
    sk.addColorStop(0, L.sky[0]); sk.addColorStop(0.55, L.sky[1]); sk.addColorStop(1, L.sky[2]);
    g.fillStyle = sk; g.fillRect(x0, y0, w, y1 - y0);

    if (L.sun) {
      const sx = W * 0.72, sy = 250;
      const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 420);
      sun.addColorStop(0, 'rgba(255,240,200,0.95)'); sun.addColorStop(0.12, 'rgba(255,214,150,0.6)'); sun.addColorStop(0.5, 'rgba(255,170,110,0.12)'); sun.addColorStop(1, 'rgba(255,170,110,0)');
      g.fillStyle = sun; g.fillRect(x0, y0, w, y1 - y0);
      g.fillStyle = '#fff1cf'; g.beginPath(); g.arc(sx, sy, 52, 0, TAU); g.fill();
    }
    if (a.look === 'stadium') {
      // a few stars and a moon over the night stadium
      for (let i = 0; i < 90; i++) { g.globalAlpha = 0.2 + rng() * 0.5; g.fillStyle = '#fff'; g.fillRect(lerp(x0, x1, rng()), lerp(y0, 220, rng()), 1.6, 1.6); }
      g.globalAlpha = 1;
    }

    if (L.sea) paintBeach(g, sport, R, rng);
    else paintStands(g, sport, R, rng, L);

    // field surface: a band seen slightly from above
    const top = gy - 44, bot = gy + 46;
    const sf = g.createLinearGradient(0, top, 0, bot);
    sf.addColorStop(0, mixHex(L.surf[0], '#000000', 0.12)); sf.addColorStop(1, L.surf[0]);
    g.fillStyle = sf; g.fillRect(x0, top, w, bot - top);
    if (a.look === 'stadium' || a.look === 'track') {
      // mown stripes
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = Math.floor(x0 / 160) * 160; x < x1; x += 160) {
        g.beginPath(); g.moveTo(x, top); g.lineTo(x + 80, top); g.lineTo(x + 92, bot); g.lineTo(x + 12, bot); g.closePath(); g.fill();
      }
    }
    if (a.look === 'indoor') {
      g.strokeStyle = 'rgba(80,45,15,0.25)'; g.lineWidth = 1.2;
      for (let y = top + 9; y < bot; y += 9) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
      for (let i = 0; i < 140; i++) { const x = lerp(x0, x1, rng()), y = top + Math.floor(rng() * 10) * 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 9); g.stroke(); }
      // glossy reflection
      const gl = g.createLinearGradient(0, top, 0, bot);
      gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(x0, top, w, bot - top);
    }
    if (a.look === 'beach') {
      for (let i = 0; i < 260; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(160,120,60,0.18)' : 'rgba(255,255,255,0.25)'; g.fillRect(lerp(x0, x1, rng()), lerp(top, y1, rng()), 2, 2); }
    }
    // foreground under the field
    const ug = g.createLinearGradient(0, bot, 0, y1);
    ug.addColorStop(0, L.under); ug.addColorStop(1, mixHex(L.under, '#000000', 0.55));
    g.fillStyle = ug; g.fillRect(x0, bot, w, Math.max(0, y1 - bot));
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x0, bot, w, 3);
  }

  function paintStands(g, sport, R, rng, L) {
    const a = sport.arena, gy = sport.groundY;
    const x0 = R.x0, x1 = R.x1, w = x1 - x0;
    const sTop = a.standsTop || 250, sBot = gy - 70;
    if (L.roof) {
      // arena roof truss and a hanging scoreboard
      g.fillStyle = '#0a0d16'; g.fillRect(x0, R.y0, w, sTop - 40 - R.y0);
      g.strokeStyle = '#1c2236'; g.lineWidth = 3;
      for (let x = Math.floor(x0 / 80) * 80; x < x1; x += 80) { g.beginPath(); g.moveTo(x, sTop - 120); g.lineTo(x + 40, sTop - 60); g.lineTo(x + 80, sTop - 120); g.stroke(); }
      g.beginPath(); g.moveTo(x0, sTop - 120); g.lineTo(x1, sTop - 120); g.moveTo(x0, sTop - 60); g.lineTo(x1, sTop - 60); g.stroke();
    }
    // tiers
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const ty = lerp(sTop, sBot, t / tiers), by = lerp(sTop, sBot, (t + 1) / tiers);
      g.fillStyle = t % 2 ? L.stand2 : L.stand; g.fillRect(x0, ty, w, by - ty);
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x0, ty, w, 3);
      // crowd dots, row by row
      for (let ry = ty + 10; ry < by - 6; ry += 13) {
        for (let x = x0 + rng() * 10; x < x1; x += 10 + rng() * 5) {
          if (rng() < 0.12) continue;
          const col = CROWD_COLS[(rng() * CROWD_COLS.length) | 0];
          g.fillStyle = mixHex(col, L.stand, 0.66 + t * 0.06);
          g.beginPath(); g.arc(x, ry + rng() * 3, 3.6, 0, TAU); g.fill();
          g.fillRect(x - 3.6, ry + 3, 7.2, 5);
        }
      }
    }
    if (L.spot) {
      // darkness over the far crowd, light cone on the ring
      g.fillStyle = 'rgba(4,5,9,0.55)'; g.fillRect(x0, sTop, w, sBot - sTop);
      const cx = W / 2;
      const cone = g.createLinearGradient(0, R.y0, 0, gy);
      cone.addColorStop(0, 'rgba(255,240,210,0.0)'); cone.addColorStop(1, 'rgba(255,240,210,0.16)');
      g.fillStyle = cone;
      g.beginPath(); g.moveTo(cx - 90, R.y0); g.lineTo(cx + 90, R.y0); g.lineTo(cx + 700, gy + 40); g.lineTo(cx - 700, gy + 40); g.closePath(); g.fill();
    }
    // boards along the field edge
    g.fillStyle = L.board; g.fillRect(x0, sBot, w, gy - 44 - sBot);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x0, sBot, w, 2);
    g.font = '900 22px Rubik, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    const by = (sBot + gy - 44) / 2;
    for (let x = Math.floor(x0 / 340) * 340 + 170; x < x1; x += 340) {
      g.fillStyle = 'rgba(255,201,51,0.85)'; g.fillRect(x - 120, by - 11, 6, 22);
      g.fillStyle = 'rgba(246,247,251,0.55)'; g.fillText('RAG SPORTS', x, by + 1);
    }
    if (L.lights) {
      // floodlight towers / rigs
      for (const lx of [W * 0.12, W * 0.88]) {
        if (lx < x0 - 100 || lx > x1 + 100) continue;
        g.fillStyle = '#10131d'; g.fillRect(lx - 4, sTop - 140, 8, 140);
        g.fillStyle = '#2a3046'; g.fillRect(lx - 46, sTop - 168, 92, 34);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
          const bx = lx - 36 + i * 24, by2 = sTop - 160 + j * 15;
          g.fillStyle = '#fffbe6'; g.fillRect(bx - 7, by2, 14, 10);
        }
        const gl = g.createRadialGradient(lx, sTop - 150, 0, lx, sTop - 150, 260);
        gl.addColorStop(0, 'rgba(255,250,220,0.5)'); gl.addColorStop(1, 'rgba(255,250,220,0)');
        g.fillStyle = gl; g.fillRect(lx - 260, sTop - 410, 520, 520);
      }
    }
  }

  function paintBeach(g, sport, R, rng) {
    const gy = sport.groundY, x0 = R.x0, x1 = R.x1, w = x1 - x0;
    // sun
    const sx = W * 0.2, sy = 170;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 300);
    sun.addColorStop(0, 'rgba(255,252,230,0.95)'); sun.addColorStop(0.15, 'rgba(255,245,200,0.5)'); sun.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = sun; g.fillRect(x0, R.y0, w, gy - R.y0);
    // clouds
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 6; i++) {
      const cx = lerp(x0, x1, rng()), cy = 120 + rng() * 180, s = 0.6 + rng() * 0.8;
      for (const [dx, dy, r] of [[0, 0, 34], [36, 8, 26], [-34, 10, 24], [12, -16, 26]]) { g.beginPath(); g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU); g.fill(); }
    }
    // sea
    const seaTop = gy - 250;
    const sea = g.createLinearGradient(0, seaTop, 0, gy - 44);
    sea.addColorStop(0, '#2f7fc4'); sea.addColorStop(1, '#5fc2df');
    g.fillStyle = sea; g.fillRect(x0, seaTop, w, gy - 44 - seaTop);
    // far island
    g.fillStyle = '#2b6a8f';
    g.beginPath(); g.moveTo(W * 0.62, seaTop); g.quadraticCurveTo(W * 0.72, seaTop - 70, W * 0.84, seaTop); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = lerp(x0, x1, rng()), y = lerp(seaTop + 20, gy - 60, rng()); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 + rng() * 20, y); g.stroke(); }
    // foam line
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.moveTo(x0, gy - 44);
    for (let x = x0; x <= x1 + 20; x += 20) g.lineTo(x, gy - 48 - Math.sin(x * 0.03) * 3);
    g.lineTo(x1, gy - 40); g.lineTo(x0, gy - 40); g.closePath(); g.fill();
    // palms
    for (const px of [W * 0.04, W * 0.96]) {
      g.strokeStyle = '#7a5530'; g.lineWidth = 16; g.lineCap = 'round';
      const lean = px < W / 2 ? 1 : -1;
      g.beginPath(); g.moveTo(px, gy - 30); g.quadraticCurveTo(px + lean * 30, gy - 220, px + lean * 70, gy - 380); g.stroke();
      g.fillStyle = '#2f8f4e';
      const tx = px + lean * 70, ty = gy - 380;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + Math.cos(a) * 90, ty + Math.sin(a) * 90 - 30, tx + Math.cos(a) * 150, ty + Math.sin(a) * 150 + 40);
        g.quadraticCurveTo(tx + Math.cos(a) * 80, ty + Math.sin(a) * 80, tx, ty); g.fill();
      }
    }
  }

  // front row of fans along the boards, drawn every frame
  function live(c, sport, time, vis) {
    const L = LOOKS[sport.arena.look];
    if (!L.stand) return;
    const crowd = crowdFor(sport);
    const gy = sport.groundY, base = gy - 94;
    const hype = sport.hype || 0;
    const lead = sport.lastScorer;
    for (const f of crowd) {
      if (vis && (f.x < vis.x0 - 20 || f.x > vis.x1 + 20)) continue;
      const cheer = hype * (lead == null || f.team === lead ? 1 : 0.25) * (0.5 + f.fan * 0.5);
      const bounce = Math.abs(Math.sin(time * (2 + f.fan * 3) + f.ph)) * (2 + cheer * 16);
      const y = base - bounce, s = f.s;
      c.fillStyle = mixHex(f.col, L.stand, 0.3);
      c.beginPath(); c.roundRect(f.x - 9 * s, y - 2, 18 * s, 24, 6); c.fill();
      c.beginPath(); c.arc(f.x, y - 9 * s, 7.5 * s, 0, TAU); c.fill();
      if (cheer > 0.25) {
        c.strokeStyle = mixHex(f.col, L.stand, 0.3); c.lineWidth = 5 * s; c.lineCap = 'round';
        const wv = Math.sin(time * 8 + f.ph) * 4;
        c.beginPath(); c.moveTo(f.x - 7 * s, y + 2); c.lineTo(f.x - 13 * s + wv, y - 20 * s); c.moveTo(f.x + 7 * s, y + 2); c.lineTo(f.x + 13 * s - wv, y - 20 * s); c.stroke();
      }
    }
  }

  return { sky, static: stat, live };
})();
