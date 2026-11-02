'use strict';
/* =========================================================================
   Platform layer: the CrazyGames HTML5 SDK v3, wrapped.
   - init + environment + device info
   - loading / gameplay events, happytime
   - data module for cloud saves (localStorage when standalone)
   - game settings (muteAudio) with a change listener
   - optional account info (never required to play)
   Rag Sports shows NO ads: this file never requests an ad or a banner.
   Every call is guarded so the game runs unchanged offline or elsewhere.
   ========================================================================= */

const Platform = (() => {
  let sdk = null;
  let env = 'standalone';
  let ready = false;
  let inGameplay = false;
  let user = null;
  const PREFIX = 'ragsports_';

  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

  async function init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        sdk = window.CrazyGames.SDK;
        env = sdk.environment || 'crazygames';
        if (env === 'disabled') sdk = null;
      }
    } catch (e) { sdk = null; }
    ready = true;
    if (!sdk) return;
    // the platform's audio setting wins over the in-game toggles
    safe(() => {
      applySettings(sdk.game.settings);
      sdk.game.addSettingsChangeListener(applySettings);
    });
    safe(() => sdk.user.addAuthListener(u => { user = u || null; }));
    if (safe(() => sdk.user.isUserAccountAvailable, false)) {
      try { user = await sdk.user.getUser(); } catch (e) { user = null; }
    }
  }

  function applySettings(s) {
    if (!s) return;
    if (typeof Sfx !== 'undefined' && Sfx.setPlatformMute) Sfx.setPlatformMute(!!s.muteAudio);
  }

  /* ----------------------------------------------------------- storage */
  // CrazyGames' data module mirrors localStorage and syncs to the player's account.
  function store() {
    if (sdk && sdk.data) return sdk.data;
    try { localStorage.setItem(PREFIX + 't', '1'); return localStorage; } catch (e) { return null; }
  }
  const memory = {};
  function getItem(k) {
    const s = store();
    try { return s ? s.getItem(PREFIX + k) : (memory[k] ?? null); } catch (e) { return memory[k] ?? null; }
  }
  function setItem(k, v) {
    const s = store();
    try { if (s) s.setItem(PREFIX + k, v); else memory[k] = v; } catch (e) { memory[k] = v; }
  }

  /* ------------------------------------------------------------ events */
  function loadingStart() { safe(() => sdk && sdk.game.loadingStart()); }
  function loadingStop() { safe(() => sdk && sdk.game.loadingStop()); }
  function gameplayStart() {
    if (inGameplay) return; inGameplay = true;
    safe(() => sdk && sdk.game.gameplayStart());
  }
  function gameplayStop() {
    if (!inGameplay) return; inGameplay = false;
    safe(() => sdk && sdk.game.gameplayStop());
  }
  // a short celebratory moment (match won, new tier, personal best)
  function happytime() { safe(() => sdk && sdk.game.happytime()); }

  function device() {
    const t = safe(() => sdk && sdk.user.systemInfo && sdk.user.systemInfo.device && sdk.user.systemInfo.device.type, null);
    if (t) return t;
    return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  }

  return {
    init, getItem, setItem, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, device,
    get hasSdk() { return !!sdk; }, get ready() { return ready; }, get env() { return env; },
    get user() { return user; }, get inGameplay() { return inGameplay; },
  };
})();
