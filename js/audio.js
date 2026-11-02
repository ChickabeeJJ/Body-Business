'use strict';
/* =========================================================================
   Audio: every sound is synthesized with WebAudio (no files): kicks,
   bounces, whistles, punches, bells, swishes, a crowd bed that swells on
   big moments, and a light looping stadium groove.
   ========================================================================= */

const Sfx = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, crowdBus = null, noiseBuf = null;
  let sfxOn = true, musicOn = true, platMuted = false, suspended = false;
  let crowdOn = false, crowdSrc = null, crowdGain = null;
  let musicTimer = null, nextNote = 0, step16 = 0, inMatch = false;

  function ensure() {
    if (ac) { if (ac.state === 'suspended' && !suspended) ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { ac = null; return false; }
    master = ac.createGain(); master.gain.value = platMuted ? 0 : 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.6 : 0; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    crowdBus = ac.createGain(); crowdBus.gain.value = sfxOn ? 1 : 0; crowdBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startCrowdBed();
    startMusic();
    applyMusic();
    return true;
  }

  function env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, bus = null) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.3, filt = 1200, type = 'lowpass', q = 1, delay = 0, sweep = 0, bus = null, attack = 0.004) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = rand(0.8, 1.2);
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filt, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, filt * sweep), t + dur);
    const g = ac.createGain();
    env(g, t, attack, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + attack + 0.05);
  }

  /* ------------------------------------------------------------- sfx */
  const S = {
    kick: k => { tone(150, 0.12, 'sine', 0.5, 0.35); noise(0.06, 0.25 + k * 0.2, 2200, 'lowpass'); },
    thump: v => { tone(110, 0.1, 'sine', 0.15 + v * 0.3, 0.5); noise(0.04, 0.12 * v, 1200); },
    bounce: v => { tone(200, 0.08, 'sine', 0.06 + v * 0.22, 0.6); },
    post: v => { tone(880, 0.45, 'triangle', 0.18 + v * 0.15, 0.98); tone(1320, 0.3, 'sine', 0.08, 0.98); tone(150, 0.1, 'sine', 0.3, 0.5); },
    net: () => { noise(0.4, 0.22, 3200, 'highpass', 0.7, 0, 0.4); },
    header: () => { tone(260, 0.1, 'sine', 0.35, 0.6); noise(0.05, 0.15, 1800); },
    swoosh: () => noise(0.25, 0.2, 1800, 'bandpass', 1.2, 0, 0.4),
    swing: () => noise(0.12, 0.08, 2600, 'bandpass', 1.5, 0, 0.6),
    tackle: () => { tone(90, 0.18, 'sine', 0.45, 0.5); noise(0.18, 0.3, 900, 'lowpass', 1, 0, 0.4); },
    whistle: () => { for (const [d, dur] of [[0, 0.16], [0.2, 0.32]]) { tone(2350, dur, 'sine', 0.12, 1.0, d); tone(2480, dur, 'sine', 0.08, 1.0, d); noise(dur, 0.04, 2400, 'bandpass', 6, d); } },
    cheer: lvl => { const v = 0.18 * (lvl || 1); noise(1.8, v, 900, 'bandpass', 0.7, 0, 1.3, crowdBus, 0.25); noise(1.4, v * 0.5, 2400, 'bandpass', 1.2, 0.05, 0.8, crowdBus, 0.2); for (let i = 0; i < 4; i++) tone(rand(500, 900), 0.5, 'triangle', 0.015 * (lvl || 1), rand(1.2, 1.6), rand(0, 0.4), crowdBus); },
    groan: () => noise(1.2, 0.12, 380, 'bandpass', 0.8, 0, 0.6, crowdBus, 0.15),
    win: () => [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.28, 'triangle', 0.16, 1, i * 0.1); tone(f * 2, 0.2, 'sine', 0.05, 1, i * 0.1); }),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.32, 'triangle', 0.14, 0.97, i * 0.14)),
    jump: () => tone(300, 0.1, 'sine', 0.08, 1.6),
    punch: k => { tone(120 - k * 30, 0.14, 'sine', 0.45 + k * 0.2, 0.5); noise(0.08, 0.3 + k * 0.2, 1500 - k * 600, 'lowpass'); },
    whiff: () => noise(0.1, 0.07, 3000, 'bandpass', 1.4, 0, 0.6),
    block: () => { tone(320, 0.08, 'square', 0.06, 0.7); noise(0.06, 0.18, 2600, 'bandpass', 2); },
    bell: () => { for (const d of [0, 0.32, 0.64]) { tone(1180, 0.9, 'sine', 0.2, 1, d); tone(2950, 0.5, 'sine', 0.06, 1, d); tone(590, 0.7, 'triangle', 0.06, 1, d); } },
    ko: () => { tone(80, 0.7, 'sine', 0.5, 0.4); noise(0.5, 0.3, 600, 'lowpass', 1, 0, 0.3); },
    swish: () => { noise(0.3, 0.2, 5200, 'highpass', 0.8, 0, 0.5); },
    rim: v => { tone(520, 0.25, 'square', 0.04 + v * 0.05, 0.97); tone(780, 0.2, 'triangle', 0.05 + v * 0.05, 0.98); },
    board: v => { tone(140, 0.14, 'square', 0.06 + v * 0.06, 0.7); noise(0.06, 0.12, 900); },
    dunk: () => { tone(70, 0.4, 'sine', 0.5, 0.5); noise(0.3, 0.3, 700, 'lowpass', 1, 0, 0.4); tone(480, 0.35, 'square', 0.06, 0.95); },
    buzzer: () => { tone(185, 0.9, 'sawtooth', 0.12, 1); tone(190, 0.9, 'square', 0.08, 1); },
    bump: v => { tone(240, 0.12, 'sine', 0.2 + v * 0.2, 0.6); noise(0.05, 0.15, 1600); },
    spike: () => { tone(160, 0.16, 'sine', 0.5, 0.4); noise(0.12, 0.35, 2600, 'lowpass', 1, 0, 0.4); },
    sand: () => noise(0.22, 0.18, 1400, 'lowpass', 0.7, 0, 0.5),
    serve: () => tone(330, 0.1, 'sine', 0.12, 1.4),
    step: () => noise(0.03, 0.05, 900),
    throw: () => { noise(0.35, 0.25, 1200, 'bandpass', 1.4, 0, 2.2); tone(200, 0.2, 'sine', 0.12, 2); },
    land: () => { tone(90, 0.2, 'sine', 0.35, 0.6); noise(0.14, 0.2, 700); },
    foul: () => { tone(220, 0.25, 'square', 0.08, 1); tone(170, 0.4, 'square', 0.08, 1, 0.25); },
    tick: () => tone(1500, 0.05, 'square', 0.04),
    go: () => { tone(880, 0.2, 'triangle', 0.15); tone(1320, 0.25, 'triangle', 0.08, 1, 0.02); },
    click: () => tone(720, 0.05, 'triangle', 0.08, 1.2),
    buy: () => [660, 990, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, 1, i * 0.06)),
    error: () => tone(160, 0.18, 'square', 0.08, 0.8),
    coin: () => { tone(1320, 0.08, 'square', 0.05); tone(1760, 0.18, 'square', 0.05, 1, 0.07); },
  };
  function play(name, arg) {
    if (!ac || !sfxOn) return;
    const fn = S[name];
    if (fn) { try { fn(arg == null ? 0.5 : arg); } catch (e) { /* ignore */ } }
  }

  /* ---------------------------------------------------------- crowd bed */
  function startCrowdBed() {
    crowdSrc = ac.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
    crowdGain = ac.createGain(); crowdGain.gain.value = 0;
    crowdSrc.connect(f); f.connect(crowdGain); crowdGain.connect(crowdBus);
    crowdSrc.start();
  }
  function crowd(on) {
    crowdOn = on;
    inMatch = on;
    if (!ac) return;
    crowdGain.gain.setTargetAtTime(on ? 0.045 : 0.0, ac.currentTime, 0.4);
    applyMusic();
  }

  /* -------------------------------------------------------------- music */
  // a light I-V-vi-IV groove; quieter during matches
  const PROG = [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function startMusic() {
    if (musicTimer) return;
    nextNote = ac.currentTime + 0.1;
    musicTimer = setInterval(schedule, 90);
  }
  function schedule() {
    if (!ac || suspended) return;
    const spb = 60 / 112 / 4;   // 16th notes at 112 bpm
    while (nextNote < ac.currentTime + 0.25) {
      const bar = Math.floor(step16 / 16) % 4, s = step16 % 16, ch = PROG[bar];
      const t = nextNote - ac.currentTime;
      if (s % 4 === 0) { tone(110, 0.16, 'sine', 0.22, 0.4, t, musicBus); }                    // kick
      if (s === 4 || s === 12) noise(0.12, 0.09, 1800, 'bandpass', 0.8, t, 0, musicBus);          // clap
      if (s % 2 === 1) noise(0.03, 0.03, 7000, 'highpass', 1, t, 0, musicBus);                    // hat
      if (s === 0 || s === 6 || s === 10) tone(midi(ch[0] - 12), 0.28, 'triangle', 0.16, 1, t, musicBus);   // bass
      if (s % 4 === 2) tone(midi(ch[1 + ((s >> 2) % 3)] + 12), 0.12, 'square', 0.022, 1, t, musicBus);       // pluck
      nextNote += spb; step16++;
    }
  }
  function applyMusic() {
    if (!ac) return;
    const v = musicOn && !platMuted ? (inMatch ? 0.1 : 0.22) : 0;
    musicBus.gain.setTargetAtTime(v, ac.currentTime, 0.3);
  }

  function setSfx(on) { sfxOn = on; if (sfxBus) { sfxBus.gain.value = on ? 0.6 : 0; crowdBus.gain.value = on ? 1 : 0; } }
  function setMusic(on) { musicOn = on; applyMusic(); }
  function setPlatformMute(m) { platMuted = m; if (master) master.gain.value = m ? 0 : 0.8; applyMusic(); }
  function suspend(s) {
    suspended = s;
    if (!ac) return;
    try { if (s) ac.suspend(); else ac.resume(); } catch (e) { /* ignore */ }
  }

  return { ensure, play, crowd, setSfx, setMusic, setPlatformMute, suspend };
})();
