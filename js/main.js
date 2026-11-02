'use strict';
/* =========================================================================
   Boot, main loop and keyboard / mouse input. Touch controls live in ui.js.
   ========================================================================= */

(async function boot() {
  const canvas = document.getElementById('stage');
  // SDK order: init, loadingStart, load everything, loadingStop, then the UI
  await Platform.init();
  Platform.loadingStart();
  Save.load();
  try { await Promise.all([document.fonts.load('900 20px Rubik'), document.fonts.load('600 20px Rubik')]); } catch (e) { /* fonts are optional */ }
  Game.init(canvas);
  Platform.loadingStop();
  UI.init();

  const inMatch = () => UI.screen === null && !UI.modalOpen() && !Game.demo;

  /* ------------------------------------------------------------ mouse */
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    if (e.pointerType !== 'mouse') { document.body.classList.add('touch'); return; }
    document.body.classList.remove('touch');
    if (!inMatch()) return;
    if (e.button === 0) Game.press('action');
    else if (e.button === 2) Game.press('alt');
  });
  window.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) Game.release('action');
    else if (e.button === 2) Game.release('alt');
  });
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, true);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* --------------------------------------------------------- keyboard */
  const MOVE = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyS: 'down', ArrowDown: 'down' };
  const BTN = { KeyJ: 'action', KeyF: 'action', Enter: 'action', KeyK: 'alt', KeyL: 'alt', ShiftLeft: 'alt', KeyW: 'jump', ArrowUp: 'jump', Space: 'jump' };
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    Sfx.ensure();
    document.body.classList.remove('touch');
    // P pauses; Escape stays free for leaving fullscreen but also closes the pause menu
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (UI.modalKind === 'pause') { UI.resume(); e.preventDefault(); return; }
      if (UI.modalKind === 'settings' || UI.modalKind === 'records') { UI.closeModal(); return; }
      if (e.code === 'KeyP' && inMatch()) { UI.openPause(); return; }
      if (e.code === 'Escape' && inMatch()) { UI.openPause(); return; }
      return;
    }
    // Enter / Space on a sheet triggers its main button (rematch, resume...)
    if (UI.modalOpen() && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;   // the focused button handles it
      if (UI.primary()) e.preventDefault();
      return;
    }
    // on the hub, Enter / Space is PLAY (unless a card or button has focus and handles it)
    if (UI.screen === 'home' && !UI.modalOpen() && (e.code === 'Enter' || e.code === 'Space')) {
      const el = document.activeElement;
      if (!el || (el.tagName !== 'BUTTON' && !el.classList.contains('sport-card'))) { e.preventDefault(); UI.playSelected(); }
      return;
    }
    if (!inMatch()) return;
    if (MOVE[e.code]) { Game.setKey(MOVE[e.code], true); e.preventDefault(); return; }
    if (BTN[e.code]) { e.preventDefault(); if (!e.repeat) Game.press(BTN[e.code]); }
  });
  window.addEventListener('keyup', e => {
    if (MOVE[e.code]) Game.setKey(MOVE[e.code], false);
    if (BTN[e.code]) Game.release(BTN[e.code]);
  });
  window.addEventListener('blur', () => Game.clearInput());

  window.addEventListener('resize', () => { Game.resize(); UI.checkRotate(); UI.applyUiScale(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (inMatch()) UI.openPause();
      Sfx.suspend(true);
    } else Sfx.suspend(false);
  });

  /* ------------------------------------------------------------- loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Game.update(dt);
    Game.render();
    UI.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
