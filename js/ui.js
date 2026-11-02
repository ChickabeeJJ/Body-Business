'use strict';
/* =========================================================================
   UI: the sports hub (home), HUD, touch controls, pause / result sheets,
   locker, records and settings. Built for minimum friction: one tap from
   the hub into a match, rematch on Enter, no logins, no ads, no waiting.
   ========================================================================= */

const UI = (() => {
  const $ = id => document.getElementById(id);
  const ORDER = ['soccer', 'hoops', 'volley', 'boxing', 'javelin'];
  let screen = 'home';
  let modalKind = null;
  let selected = 'soccer';
  let demoTimer = null;
  let coachT = 0, keysT = 0, bannerTimer = null;
  let primaryAction = null;
  let lastHud = {};

  /* ------------------------------------------------------------ helpers */
  const icon = (name, cls = '') => `<span class="ic ${cls}" data-icon="${name}"></span>`;
  function hydrate(root) { Icons.hydrate(root || document); }
  function coins() { document.querySelectorAll('.coin-val').forEach(e => { e.textContent = fmt(Save.data.coins); }); }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }
  function setAccent(color) {
    const r = document.documentElement;
    r.style.setProperty('--acc', color);
    r.style.setProperty('--acc-hi', mixHex(color, '#ffffff', 0.25));
    const [cr, cg, cb] = hexToRgb(color);
    const lum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
    r.style.setProperty('--acc-ink', lum > 0.55 ? '#14110a' : '#ffffff');
  }
  const tierOf = id => Save.sport(id).tier;

  /* --------------------------------------------------------------- init */
  function init() {
    if (ORDER.includes(Save.data.last)) selected = Save.data.last;
    applySettings();
    setAccent(Save.data.kit.color);
    hydrate();
    buildHome();
    bind();
    initTouch();
    Game.hooks.onBanner = banner;
    Game.hooks.onEnd = showResult;
    Game.hooks.onStart = onStart;
    applyUiScale();
    checkRotate();
    show('home');
  }

  function bind() {
    $('btnPlay').addEventListener('click', () => { Sfx.ensure(); play(selected); });
    $('btnPause').addEventListener('click', () => openPause());
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      Sfx.ensure(); Sfx.play('click');
      const k = b.dataset.open;
      if (k === 'locker') show('locker');
      else if (k === 'records') openRecords();
      else if (k === 'settings') openSettings();
      else if (k === 'random') play(pick(ORDER.filter(x => x !== selected)));
    }));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sfx.play('click'); show('home'); }));
    $('modal').addEventListener('pointerdown', e => {
      if (e.target === $('modal') && (modalKind === 'settings' || modalKind === 'records')) closeModal();
    });
    $('btnRotateOk').addEventListener('click', () => { document.body.classList.add('rotate-ok'); checkRotate(); });
  }

  /* --------------------------------------------------------------- home */
  function buildHome() {
    const grid = $('sportsGrid');
    grid.innerHTML = ORDER.map(id => {
      const S = SPORTS[id];
      return `<div class="sport-card" role="listitem" data-sport="${id}" style="--c:${S.color}" tabindex="0">
        <span class="sc-ic">${icon(S.icon)}</span>
        <b class="sc-name">${S.name}</b>
        <small class="sc-tier"></small>
        <span class="sc-pips"></span>
      </div>`;
    }).join('');
    grid.querySelectorAll('.sport-card').forEach(card => {
      const id = card.dataset.sport;
      card.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') preview(id); });
      card.addEventListener('focus', () => preview(id));
      card.addEventListener('click', e => {
        Sfx.ensure();
        const pip = e.target.closest('[data-tier]');
        if (pip) {
          const t = +pip.dataset.tier, s = Save.sport(id);
          if (t <= s.unlocked) { s.tier = t; Save.save(); Sfx.play('click'); preview(id, true); renderHome(); }
          else { Sfx.play('error'); toast('WIN ' + TIERS[t - 1].name + ' ' + SPORTS[id].name + ' TO UNLOCK'); }
          return;
        }
        play(id);
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(id); } });
    });
    hydrate(grid);
    renderHome();
  }
  function renderHome() {
    coins();
    $('homeTrophies').textContent = Save.trophies();
    document.querySelectorAll('.sport-card').forEach(card => {
      const id = card.dataset.sport, s = Save.sport(id);
      card.classList.toggle('sel', id === selected);
      card.querySelector('.sc-tier').textContent = TIERS[s.tier].name;
      card.querySelector('.sc-pips').innerHTML = TIERS.map((T, i) => {
        const st = i > s.unlocked ? 'locked' : s.medals[i] ? 'won' : 'open';
        return `<i data-tier="${i}" class="${st}${i === s.tier ? ' cur' : ''}" title="${T.name}"></i>`;
      }).join('');
    });
    const S = SPORTS[selected];
    $('playSub').textContent = S.name + ' · ' + TIERS[tierOf(selected)].name;
    // a dot on the locker when something new is affordable
    const cheapest = KIT_COLORS.concat(HATS).filter(i => !Save.owns(i.id)).reduce((m, i) => Math.min(m, i.price), Infinity);
    $('lockerNote').classList.toggle('hidden', !(Save.data.coins >= cheapest));
  }
  function preview(id, force) {
    if (id === selected && !force) return;
    selected = id;
    renderHome();
    clearTimeout(demoTimer);
    demoTimer = setTimeout(() => { if (screen === 'home' && Game.demo && Game.sportId !== id) Game.startDemo(id); }, 140);
  }

  /* ------------------------------------------------------------ screens */
  function show(name) {
    screen = name;
    for (const s of ['home', 'locker']) $(s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', name !== null);
    document.body.classList.toggle('playing', name === null);
    if (name === 'home') {
      if (!Game.demo || Game.sportId !== selected) Game.startDemo(selected);
      renderHome();
      updateShift();
    }
    if (name === 'locker') { Game.setShift(0); renderLocker(); }
    if (name !== null) closeModal();
  }
  function updateShift() {
    const p = document.querySelector('.home-panel');
    const w = p ? p.getBoundingClientRect().width : 0;
    Game.setShift(screen === 'home' ? Math.min(w * 0.5, innerWidth * 0.3) : 0);
  }

  /* ------------------------------------------------------------- match */
  function play(id, tier) {
    Sfx.ensure();
    selected = id;
    const s = Save.sport(id);
    const t = tier != null ? tier : s.tier;
    s.tier = t; Save.data.last = id; Save.save();
    closeModal();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    screen = null;
    for (const sc of ['home', 'locker']) $(sc).classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.add('playing');
    Game.startMatch(id, t);
  }
  function onStart(sport) {
    const S = SPORTS[sport.id];
    $('sportTag').innerHTML = `${icon(S.icon)}<b>${S.name}</b><small>${sport.T.name}</small>`;
    $('sportTag').style.setProperty('--c', S.color);
    hydrate($('sportTag'));
    // controls on the touch orbs and the key strip
    const orbMain = document.querySelector('.orb-main'), orbAlt = document.querySelector('.orb-alt');
    orbMain.querySelector('.orb-icon').innerHTML = Icons.svg(S.controls.actionIcon);
    orbMain.querySelector('.orb-lbl').textContent = S.controls.action;
    orbAlt.querySelector('.orb-icon').innerHTML = Icons.svg(S.controls.altIcon);
    orbAlt.querySelector('.orb-lbl').textContent = S.controls.alt;
    orbAlt.classList.toggle('hidden', !!S.solo);
    const k = (keys, label) => `<span class="key">${keys.map(x => `<kbd>${x}</kbd>`).join('')}<small>${label}</small></span>`;
    $('keys').innerHTML = [
      S.solo ? '' : k(['A', 'D'], 'MOVE'),
      S.solo ? '' : k(['W'], 'JUMP'),
      k(['J'], S.controls.action + (S.solo ? '' : ' / CLICK')),
      S.solo ? '' : k(['K'], S.controls.alt),
      S.controls.mod ? k(['S'], 'HOLD: ' + S.controls.mod) : '',
    ].join('');
    keysT = 7;
    $('keys').classList.remove('fade');
    const seen = Save.data.seen[sport.id] || 0;
    coachT = seen < 2 ? 9 : 0;
    Save.data.seen[sport.id] = seen + 1; Save.save();
    $('coachText').textContent = S.hint;
    $('coach').classList.toggle('hidden', coachT <= 0);
    $('board').classList.toggle('hidden', sport.id !== 'javelin');
    const [a, b] = sport.athletes;
    $('sbChipL').style.setProperty('--c', a.kit.color);
    $('sbChipR').style.setProperty('--c', b ? b.kit.color : '#c9a227');
    lastHud = {};
  }

  function banner(text, kind) {
    const el = $('banner'), sp = $('bannerText');
    el.classList.remove('hidden');
    el.className = 'banner ' + (kind || '');
    sp.textContent = text;
    sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  /* --------------------------------------------------------------- tick */
  function tick(dt) {
    const s = Game.sport;
    if (screen === 'locker') lockerTick(dt);
    if (!s || Game.demo || screen !== null) return;
    if (s.over && coachT > 0) { coachT = 0; $('coach').classList.add('hidden'); }
    if (s.over && keysT > 0) { keysT = 0; $('keys').classList.add('fade'); }
    const h = s.hud();
    const names = h.names || [s.athletes[0].name, s.athletes[1] ? s.athletes[1].name : ''];
    const scores = h.scores || s.score;
    set('sbNameL', names[0]); set('sbNameR', names[1]);
    set('sbScoreL', scores[0]); set('sbScoreR', scores[1]);
    set('sbClock', h.clock); set('sbSub', h.sub);
    $('sbHpWrapL').classList.toggle('hidden', !h.hp); $('sbHpWrapR').classList.toggle('hidden', !h.hp);
    if (h.hp) {
      $('sbHpL').style.width = (h.hp[0] * 100).toFixed(1) + '%';
      $('sbHpR').style.width = (h.hp[1] * 100).toFixed(1) + '%';
    }
    if (h.board) {
      const key = h.board.map(r => r.name + r.mark).join();
      if (key !== lastHud.board) {
        lastHud.board = key;
        $('board').innerHTML = h.board.map((r, i) => `<li class="${r.you ? 'you' : ''}" style="--c:${r.col}"><i>${i + 1}</i><b>${r.name}</b><span>${r.mark ? r.mark.toFixed(2) : '—'}</span></li>`).join('');
      }
    }
    if (keysT > 0) { keysT -= dt; if (keysT <= 0) $('keys').classList.add('fade'); }
    if (coachT > 0) { coachT -= dt; if (coachT <= 0) $('coach').classList.add('hidden'); }
  }
  function set(id, v) {
    v = String(v);
    if (lastHud[id] === v) return;
    if ((id === 'sbScoreL' || id === 'sbScoreR') && lastHud[id] != null) {
      const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    lastHud[id] = v;
    $(id).textContent = v;
  }

  /* -------------------------------------------------------------- modal */
  function openModal(kind, html, wide) {
    modalKind = kind;
    const sh = $('sheet');
    sh.className = 'sheet ' + kind + (wide ? ' wide' : '');
    sh.innerHTML = html;
    hydrate(sh);
    $('modal').classList.remove('hidden');
    primaryAction = null;
    const pb = sh.querySelector('.btn.primary');
    if (pb) { primaryAction = () => pb.click(); setTimeout(() => { try { pb.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30); }
  }
  function closeModal() {
    if (!modalKind) return;
    modalKind = null;
    $('modal').classList.add('hidden');
    primaryAction = null;
  }
  const modalOpen = () => !!modalKind;

  function toggles() {
    const st = Save.data.settings;
    const t = (k, label, ic) => `<button class="toggle ${st[k] ? 'on' : ''}" data-set="${k}">${icon(ic)}<span>${label}</span><i class="sw"></i></button>`;
    return `<div class="toggles">${t('sfx', 'SOUND', 'sound')}${t('music', 'MUSIC', 'music')}${t('shake', 'SHAKE', 'shake')}</div>`;
  }
  function bindToggles(root) {
    root.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.set, st = Save.data.settings;
      st[k] = !st[k]; Save.save();
      b.classList.toggle('on', st[k]);
      applySettings();
      Sfx.play('click');
    }));
  }
  function applySettings() {
    const st = Save.data.settings;
    Sfx.setSfx(st.sfx); Sfx.setMusic(st.music);
  }

  function openPause() {
    if (screen !== null || modalKind || !Game.sport || Game.sport.over) return;
    Game.setPaused(true);
    const S = SPORTS[Game.sportId];
    openModal('pause', `
      <h2>PAUSED</h2>
      <p class="sub">${S.name} · ${TIERS[Game.tier].name}</p>
      <p class="tip">${S.hint}</p>
      <div class="actions col">
        <button class="btn primary" data-a="resume">${icon('play')}<b>RESUME</b></button>
        <button class="btn" data-a="restart">${icon('restart')}<b>RESTART</b></button>
        <button class="btn" data-a="hub">${icon('home')}<b>SPORTS HUB</b></button>
      </div>
      ${toggles()}`);
    const sh = $('sheet');
    sh.querySelector('[data-a=resume]').addEventListener('click', resume);
    sh.querySelector('[data-a=restart]').addEventListener('click', () => { closeModal(); Game.restart(); });
    sh.querySelector('[data-a=hub]').addEventListener('click', () => { Game.setPaused(false); show('home'); });
    bindToggles(sh);
  }
  function resume() {
    if (modalKind !== 'pause') return;
    closeModal();
    Game.setPaused(false);
  }

  function showResult(res) {
    const S = SPORTS[res.sport];
    const out = Save.record(res);
    const won = res.winner === 0, draw = res.winner === -1;
    if (won || out.unlocked || out.pb) Platform.happytime();
    const title = res.title || (won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT');
    const tierNow = res.tier;
    const s = Save.sport(res.sport);
    const next = ORDER[(ORDER.indexOf(res.sport) + 1) % ORDER.length];
    let primary;
    if (won && tierNow < TIERS.length - 1 && tierNow + 1 <= s.unlocked) primary = { a: 'up', label: 'NEXT: ' + TIERS[tierNow + 1].name, ic: 'next' };
    else primary = { a: 'again', label: won ? 'PLAY AGAIN' : 'REMATCH', ic: 'restart' };
    const easier = !won && tierNow > 0 ? `<button class="btn" data-a="down">${icon('back')}<b>${TIERS[tierNow - 1].name}</b></button>` : '';
    openModal('result', `
      <div class="res-head" style="--c:${S.color}">${icon(S.icon)}<span>${S.name} · ${TIERS[tierNow].name}</span></div>
      <h2 class="${won ? 'win' : draw ? '' : 'lose'}">${title}</h2>
      <div class="res-line">${res.line}</div>
      <div class="stat-tiles">${res.stats.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
      <div class="payout">${icon('coin', 'coin')}<b>+${out.coins}</b><small>COINS</small>${out.pb && res.sport === 'javelin' ? '<em>NEW BEST</em>' : ''}</div>
      ${out.unlocked ? `<div class="unlock" style="--c:${S.color}">${icon('trophy')}<div><small>NEW TIER UNLOCKED</small><b>${S.name} · ${out.unlocked.name}</b></div></div>` : ''}
      <div class="actions">
        <button class="btn primary" data-a="${primary.a}">${icon(primary.ic)}<b>${primary.label}</b></button>
        ${primary.a === 'up' ? `<button class="btn" data-a="again">${icon('restart')}<b>REMATCH</b></button>` : ''}
        ${easier}
        <button class="btn" data-a="next">${icon(SPORTS[next].icon)}<b>${SPORTS[next].name}</b></button>
        <button class="btn" data-a="hub">${icon('home')}<b>HUB</b></button>
      </div>`);
    Sfx.play('coin');
    const sh = $('sheet');
    sh.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      Sfx.play('click');
      const a = b.dataset.a;
      if (a === 'again') play(res.sport, tierNow);
      else if (a === 'up') play(res.sport, tierNow + 1);
      else if (a === 'down') play(res.sport, tierNow - 1);
      else if (a === 'next') play(next);
      else if (a === 'hub') show('home');
    }));
  }

  function openSettings() {
    const acc = Platform.user ? `<p class="sub">SIGNED IN AS ${String(Platform.user.username || '').toUpperCase()}: PROGRESS SAVES TO YOUR ACCOUNT</p>` : '';
    openModal('settings', `
      <h2>SETTINGS</h2>
      ${toggles()}
      <div class="controls-ref">
        <div><b>KEYBOARD</b><p><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd> / <kbd>SPACE</kbd> jump · <kbd>J</kbd> / click action · <kbd>K</kbd> / right click second action · hold <kbd>S</kbd> modifier (chip, set, uppercut) · <kbd>P</kbd> pause</p></div>
        <div><b>TOUCH</b><p>Left stick moves (pull down for the modifier). Right buttons: action, second action, jump.</p></div>
      </div>
      ${acc}
      <div class="actions"><button class="btn primary" data-a="close">${icon('check')}<b>DONE</b></button></div>`);
    const sh = $('sheet');
    bindToggles(sh);
    sh.querySelector('[data-a=close]').addEventListener('click', () => { Sfx.play('click'); closeModal(); });
  }

  function openRecords() {
    const rows = ORDER.map(id => {
      const S = SPORTS[id], s = Save.sport(id);
      const pips = TIERS.map((T, i) => `<i class="${i > s.unlocked ? 'locked' : s.medals[i] ? 'won' : 'open'}" title="${T.name}"></i>`).join('');
      const extra = id === 'javelin' ? (s.best ? s.best.toFixed(2) + ' m' : '—') : `${s.wins}W ${s.losses}L${s.draws ? ' ' + s.draws + 'D' : ''}`;
      return `<div class="rec" style="--c:${S.color}"><span class="sc-ic">${icon(S.icon)}</span><b>${S.name}</b><span class="sc-pips">${pips}</span><small>${TIERS[s.unlocked].name}</small><em>${extra}</em></div>`;
    }).join('');
    openModal('records', `
      <h2>RECORDS</h2>
      <div class="stat-tiles"><div><b>${Save.data.matches}</b><small>MATCHES</small></div><div><b>${Save.totalWins()}</b><small>WINS</small></div><div><b>${Save.trophies()}</b><small>TROPHIES</small></div></div>
      <div class="recs">${rows}</div>
      <p class="tip">Win a tier to unlock the next one: Rookie, Pro, All-Star, Legend. Each first unlock is a trophy.</p>
      <div class="actions"><button class="btn primary" data-a="close">${icon('check')}<b>DONE</b></button></div>`, true);
    $('sheet').querySelector('[data-a=close]').addEventListener('click', () => { Sfx.play('click'); closeModal(); });
  }

  /* ------------------------------------------------------------- locker */
  let lockerAth = null, lockerTab = 'color', lockerT = 0;
  function renderLocker() {
    coins();
    const k = Save.data.kit;
    const tabs = [['color', 'COLOUR'], ['hat', 'HEADWEAR'], ['number', 'NUMBER']];
    let items = '';
    if (lockerTab === 'color') items = KIT_COLORS.map(c => item(c.id, c.name, c.price, k.colorId === c.id, `<i class="swatch" style="--c:${c.color}"></i>`)).join('');
    else if (lockerTab === 'hat') items = HATS.map(h => item(h.id, h.name, h.price, k.hatId === h.id, `<i class="hat-ic">${hatGlyph(h.hat)}</i>`)).join('');
    else items = NUMBERS.map(n => item('n' + n, '#' + n, 0, k.number === n, `<i class="num">${n}</i>`)).join('');
    $('lockerShop').innerHTML = `<nav class="seg">${tabs.map(([t, l]) => `<button data-tab="${t}" class="${t === lockerTab ? 'active' : ''}">${l}</button>`).join('')}</nav><div class="items">${items}</div>`;
    hydrate($('lockerShop'));
    $('lockerShop').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { lockerTab = b.dataset.tab; Sfx.play('click'); renderLocker(); }));
    $('lockerShop').querySelectorAll('.item').forEach(b => b.addEventListener('click', () => pickItem(b.dataset.id)));
    $('lockerName').textContent = (KIT_COLORS.find(c => c.id === k.colorId) || {}).name + ' · #' + k.number;
    lockerAth = null;
  }
  function item(id, name, price, on, vis) {
    const owned = price === 0 || Save.owns(id);
    const can = Save.data.coins >= price;
    return `<button class="item ${on ? 'on' : ''} ${owned ? 'owned' : can ? 'buyable' : 'locked'}" data-id="${id}">${vis}<b>${name}</b><small>${on ? 'EQUIPPED' : owned ? 'EQUIP' : icon('coin', 'coin') + price}</small></button>`;
  }
  function hatGlyph(h) {
    return h === 'none' ? '—' : `<canvas width="44" height="44" data-hat="${h}"></canvas>`;
  }
  function pickItem(id) {
    const k = Save.data.kit;
    if (id[0] === 'n') { k.number = +id.slice(1); Save.save(); Sfx.play('click'); renderLocker(); return; }
    const c = KIT_COLORS.find(x => x.id === id), h = HATS.find(x => x.id === id);
    const it = c || h;
    if (!Save.owns(id) && it.price > 0) {
      if (!Save.buy(id, it.price)) { Sfx.play('error'); toast('NEED ' + (it.price - Save.data.coins) + ' MORE COINS · WIN MATCHES TO EARN'); return; }
      Sfx.play('buy'); toast(it.name + ' UNLOCKED');
    } else Sfx.play('click');
    if (c) { k.color = c.color; k.trim = c.trim; k.colorId = c.id; setAccent(c.color); }
    if (h) { k.hat = h.hat; k.hatId = h.id; }
    Save.save();
    renderLocker();
  }
  function lockerTick(dt) {
    const cv = $('lockerCanvas');
    if (!cv) return;
    const c = cv.getContext('2d');
    const k = Save.data.kit;
    if (!lockerAth) {
      lockerAth = new Athlete({ x: 160, y: 300, groundY: 300, isPlayer: true, scale: 1.7, kit: { color: k.color, trim: k.trim, hat: k.hat, number: k.number, style: 'jersey' } });
      lockerT = 0;
      // draw the little hat previews too
      document.querySelectorAll('canvas[data-hat]').forEach(hc => {
        const g = hc.getContext('2d'); g.clearRect(0, 0, 44, 44);
        const a = new Athlete({ x: 22, y: 130, groundY: 130, kit: { hat: hc.dataset.hat, color: k.color } });
        g.save(); g.translate(0, 0);
        const hd = { x: 22, y: 26 };
        g.fillStyle = '#f2e9da'; g.beginPath(); g.roundRect(hd.x - 13, hd.y - 13.6, 26, 27.3, 10.4); g.fill();
        a.drawHeadgear(g, hd, 0);
        g.restore();
      });
    }
    lockerT += dt;
    const a = lockerAth;
    a.hold = (lockerT % 5) > 3.6 ? 'celebrate' : null;
    a.facing = 1;
    let steps = Math.min(8, Math.round(dt / STEP));
    while (steps-- > 0) a.update(STEP);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const g = c.createRadialGradient(160, 220, 10, 160, 220, 200);
    g.addColorStop(0, rgba(k.color, 0.22)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(160, 302, 70, 12, 0, 0, TAU); c.fill();
    a.draw(c, lockerT);
  }

  /* -------------------------------------------------------------- touch */
  function initTouch() {
    const joy = $('joy'), knob = $('joyKnob'), base = joy.querySelector('.joy-base');
    let jid = null, ox = 0, oy = 0;
    const R = () => Math.max(40, base.offsetWidth / 2 || 60);
    joy.addEventListener('pointerdown', e => {
      Sfx.ensure();
      jid = e.pointerId; ox = e.clientX; oy = e.clientY;
      joy.setPointerCapture(jid);
      joy.classList.add('on');
      const r = joy.getBoundingClientRect();
      for (const el of [base, knob]) { el.style.left = (ox - r.left) + 'px'; el.style.top = (oy - r.top) + 'px'; }
      e.preventDefault();
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== jid) return;
      const r = R();
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      const jr = joy.getBoundingClientRect();
      knob.style.left = (ox - jr.left + dx) + 'px'; knob.style.top = (oy - jr.top + dy) + 'px';
      Game.setJoy(dx / r, dy / r);
    });
    const end = e => {
      if (e.pointerId !== jid) return;
      jid = null; joy.classList.remove('on'); Game.setJoy(0, 0);
      knob.style.left = base.style.left = ''; knob.style.top = base.style.top = '';
    };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    document.querySelectorAll('.orb').forEach(o => {
      const act = o.dataset.act;
      o.addEventListener('pointerdown', e => { Sfx.ensure(); e.preventDefault(); o.setPointerCapture(e.pointerId); o.classList.add('down'); Game.press(act); });
      const up = () => { o.classList.remove('down'); Game.release(act); };
      o.addEventListener('pointerup', up); o.addEventListener('pointercancel', up); o.addEventListener('lostpointercapture', up);
      o.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  function checkRotate() {
    const portrait = innerHeight > innerWidth && innerWidth < 760;
    const touch = matchMedia('(pointer: coarse)').matches;
    $('rotate').classList.toggle('hidden', !(portrait && touch && !document.body.classList.contains('rotate-ok')));
  }
  function applyUiScale() {
    const k = clamp(Math.min(innerHeight / 720, innerWidth / 1100), 0.72, 1.25);
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
    updateShift();
  }

  return {
    init, tick, show, play, playSelected: () => play(selected), openPause, resume, closeModal, modalOpen, checkRotate, applyUiScale, toast,
    get screen() { return screen; }, get modalKind() { return modalKind; },
    primary() { if (primaryAction) { primaryAction(); return true; } return false; },
  };
})();
