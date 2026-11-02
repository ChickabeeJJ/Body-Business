'use strict';
/* =========================================================================
   Game host: canvas, camera, fixed-step loop, input routing, the current
   sport (a live match or the menu's AI-vs-AI demo) and rendering.
   ========================================================================= */

const Game = (() => {
  let canvas, ctx, dpr = 1;
  const view = { x0: 0, y0: 0, w: W, h: H, scale: 1, ox: 0, oy: 0, cw: 1, ch: 1 };
  const cam = { z: 1, x: W / 2, y: H / 2, k: 1, ox: 0, oy: 0, sx: 0 };
  const fx = new FX();
  let sport = null, sportId = 'soccer', tier = 0, demo = true;
  let paused = false;
  let time = 0, acc = 0, slow = 0, shakeT = 0, flash = 0;
  let shiftX = 0;
  let camOverride = null;   // {z, x, y}: framing for cover art / trailers
  const input = { left: false, right: false, up: false, down: false, joyX: 0, joyY: 0, x: 0, held: {} };
  const hooks = {};

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    startDemo('soccer');
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    // fit the field; allow a slight crop on odd aspect ratios instead of heavy letterboxing
    const scale = Math.min(cw / (W * 0.94), ch / (H * 0.9), Math.max(cw / W, ch / H));
    view.scale = scale; view.cw = cw; view.ch = ch;
    view.ox = (cw - W * scale) / 2; view.oy = (ch - H * scale) / 2;
    view.x0 = -view.ox / scale; view.y0 = -view.oy / scale;
    view.w = cw / scale; view.h = ch / scale;
    updateCam(0, true);
  }
  function setShift(px) { shiftX = px; }

  function worldRect() {
    const wr = sport && sport.world;
    return wr ? { x0: wr.x0, x1: wr.x1 } : { x0: view.x0, x1: view.x0 + view.w };
  }
  function wantZoom() {
    if (camOverride) return camOverride.z;
    if (demo || !sport) return 1;
    if (sport.camZoom) return sport.camZoom(view);
    return clamp(0.6 / view.scale, 1, 1.3);
  }
  function updateCam(dt, snap) {
    const z = wantZoom();
    cam.z = snap ? z : lerp(cam.z, z, Math.min(1, dt * 3));
    let tx = W / 2, ty = H / 2;
    if (camOverride) { tx = camOverride.x; ty = camOverride.y; }
    else if (sport && sport.camTarget) { const t = sport.camTarget(); tx = t.x; ty = t.y; }
    else if (sport && cam.z > 1.001) { const t = sport.focus(); tx = t.x; ty = t.y; }
    const wr = worldRect();
    const vw = view.w / cam.z, vh = view.h / cam.z;
    const cl = () => {
      cam.x = clamp(cam.x, Math.min(wr.x0 + vw / 2, (wr.x0 + wr.x1) / 2), Math.max(wr.x1 - vw / 2, (wr.x0 + wr.x1) / 2));
      cam.y = clamp(cam.y, view.y0 + vh / 2, view.y0 + view.h - vh / 2);
    };
    const f = snap ? 1 : Math.min(1, dt * (sport && sport.camSpeed || 5));
    cam.x = lerp(cam.x, tx, f); cam.y = lerp(cam.y, ty, f);
    cl();
    cam.k = view.scale * cam.z;
    const sx = demo ? shiftX : 0;
    cam.sx = snap ? sx : lerp(cam.sx || 0, sx, Math.min(1, dt * 6));
    cam.ox = view.cw / 2 - cam.x * cam.k + cam.sx;
    cam.oy = view.ch / 2 - cam.y * cam.k;
  }

  /* ---------------------------------------------------------- matches */
  function create(id, o) {
    fx.clear();
    sportId = id;
    sport = SPORTS[id].create(api, o);
    paused = false; acc = 0; slow = 0; flash = 0;
    clearInput();
    updateCam(0, true);
  }
  function startMatch(id, t) {
    demo = false; tier = t;
    create(id, { tier: t });
    Platform.gameplayStart();
    Sfx.crowd(true);
    hooks.onStart && hooks.onStart(sport);
  }
  function restart() { startMatch(sportId, tier); }
  function startDemo(id, t = 2) {
    demo = true;
    create(id || sportId, { demo: true, tier: t });
    Platform.gameplayStop();
    Sfx.crowd(false);
  }
  function demoOver() { startDemo(sportId); }
  function matchOver(res) {
    Platform.gameplayStop();
    Sfx.crowd(false);
    hooks.onEnd && hooks.onEnd(Object.assign({ sport: sportId, tier }, res));
  }
  function setPaused(p) {
    if (demo) return;
    paused = p;
    clearInput();
    if (p) Platform.gameplayStop(); else if (sport && !sport.over) Platform.gameplayStart();
    Sfx.crowd(!p && sport && !sport.over);
  }

  /* ------------------------------------------------------------ input */
  function clearInput() {
    input.left = input.right = input.up = input.down = false; input.joyX = input.joyY = 0;
    for (const k in input.held) if (input.held[k]) { input.held[k] = false; if (sport) sport.hostRelease(k); }
  }
  function setKey(k, v) { input[k] = v; }
  function setJoy(x, y) { input.joyX = x; input.joyY = y; }
  function press(btn) {
    if (!sport || demo || paused) return;
    if (input.held[btn]) return;
    input.held[btn] = true;
    sport.hostPress(btn);
  }
  function release(btn) {
    if (!input.held[btn]) return;
    input.held[btn] = false;
    if (sport) sport.hostRelease(btn);
  }
  function readInput() {
    let x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (Math.abs(input.joyX) > 0.18) x = clamp(input.joyX * 1.25, -1, 1);
    input.x = x;
    input.modHeld = input.down || input.joyY > 0.5;   // DOWN is the modifier: chip, set, uppercut
  }

  /* ------------------------------------------------------------- loop */
  function update(realDt) {
    time += realDt;
    flash = Math.max(0, flash - realDt * 2);
    if (!sport) return;
    readInput();
    if (paused) return;
    shakeT = Math.max(0, shakeT - realDt * 30);
    let scale = 1;
    if (slow > 0) { slow -= realDt; scale = 0.3; }
    acc += realDt * scale;
    let steps = 0;
    while (acc >= STEP && steps < 12) { acc -= STEP; steps++; sport.step(STEP); }
    if (steps >= 12) acc = 0;
    fx.update(realDt * scale);
    updateCam(realDt, false);
  }

  function render() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!sport) { c.fillStyle = '#0c0e15'; c.fillRect(0, 0, canvas.width, canvas.height); return; }
    // screen-space sky so wide fields never show an edge
    Arenas.sky(c, sport, canvas.width, canvas.height);
    const sk = shakeT > 0 && Save.data.settings.shake ? Math.min(14, shakeT) * 0.6 : 0;
    const shx = rand(-sk, sk), shy = rand(-sk, sk);
    const k = cam.k * dpr;
    c.setTransform(k, 0, 0, k, (cam.ox + shx) * dpr, (cam.oy + shy) * dpr);
    const wr = worldRect();
    const st = Arenas.static(sport, { x0: wr.x0, x1: wr.x1, y0: view.y0, y1: view.y0 + view.h }, Math.min(view.scale * dpr * cam.z, 1.5));
    c.drawImage(st.canvas, st.x0, st.y0, st.w, st.h);
    Arenas.live(c, sport, time, { x0: -cam.ox / cam.k, x1: (view.cw - cam.ox) / cam.k });
    sport.draw(c, time);
    fx.draw(c);
    fx.drawTexts(c);
    if (sport.drawOver) sport.drawOver(c, time);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sport.drawScreen) sport.drawScreen(c, view, time);
    if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash * 0.35})`; c.fillRect(0, 0, view.cw, view.ch); }
    // soft vignette
    const g = c.createRadialGradient(view.cw / 2, view.ch / 2, Math.min(view.cw, view.ch) * 0.45, view.cw / 2, view.ch / 2, Math.max(view.cw, view.ch) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, view.cw, view.ch);
  }

  // world -> screen (CSS px), for UI overlays
  function toScreen(x, y) { return { x: x * cam.k + cam.ox, y: y * cam.k + cam.oy }; }

  const api = {
    fx, input,
    get time() { return time; },
    banner(text, kind) { hooks.onBanner && hooks.onBanner(text, kind); },
    shake(n) { shakeT = Math.max(shakeT, n); },
    slowmo(t) { slow = Math.max(slow, t); },
    flash(n) { flash = Math.max(flash, n); },
    matchOver, demoOver,
    onScore(s) { hooks.onScore && hooks.onScore(s); },
  };

  return {
    init, resize, update, render, startMatch, startDemo, restart, setPaused, setShift,
    setKey, setJoy, press, release, clearInput, toScreen, hooks,
    setCamera(o) { camOverride = o; updateCam(0, true); },
    get sport() { return sport; }, get sportId() { return sportId; }, get tier() { return tier; },
    get demo() { return demo; }, get paused() { return paused; }, get view() { return view; },
    get playing() { return !!sport && !demo && !paused && !sport.over; },
  };
})();
