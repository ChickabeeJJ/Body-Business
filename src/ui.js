'use strict';
/* =========================================================================
   Test-room UI: a compact top bar of test actions, a debug readout and
   the stress-test report. HTML over the canvas; keyboard shortcuts too.
   ========================================================================= */

(() => {
  const $ = id => document.getElementById(id);
  const M = () => Phaser.Physics.Matter.Matter;
  let scene = null, bound = false, last = 0;

  const ACTIONS = {
    reset: () => scene.reset(),
    drop: () => scene.employee.moveTo(rand(380, 900), 150, rand(-3, 3)),
    launch: () => { const e = scene.employee; e.launch(rand(-22, 22), rand(-22, -8), rand(-0.3, 0.3)); },
    spring: () => scene.employee.moveTo(scene.spring.x, 420, 0),
    rope: () => {
      const r = scene.rope, e = scene.employee;
      if (r.tie) { r.untie(); return; }
      const end = r.end;
      if (Math.hypot(e.center.x - end.x, e.center.y - end.y) > 90) e.moveTo(end.x, end.y + 30, 0);
      r.tieTo(e.torso);
    },
    walk: () => { for (const e of scene.employees) e.walking = !e.walking; },
    type: () => { const i = BB.TYPES.indexOf(scene.type); scene.reset({ type: BB.TYPES[(i + 1) % BB.TYPES.length] }); },
    add: () => {
      if (scene.employees.length >= 4) { scene.employees.slice(1).forEach(e => { e.destroy(); scene.actors.splice(scene.actors.indexOf(e), 1); }); return; }
      scene.actors.push(new BB.Employee(scene, rand(300, 1000), 650, { y: 120, type: scene.type, facing: Math.random() < 0.5 ? 1 : -1 }));
    },
    debug: () => scene.setDebug(!scene.debug),
    pause: () => { scene.paused = !scene.paused; },
    test: () => {
      $('report').classList.remove('hidden');
      $('report').innerHTML = '<h3>Stress test running…</h3>';
      BB.Stress.run(showReport);
    },
  };
  const KEYS = { KeyR: 'reset', Digit1: 'drop', Digit2: 'launch', Digit3: 'spring', Digit4: 'rope', KeyW: 'walk', KeyQ: 'type', KeyE: 'add', KeyD: 'debug', Backquote: 'debug', KeyP: 'pause', Space: 'pause', KeyT: 'test' };
  const rand = (a, b) => a + Math.random() * (b - a);

  function run(name) {
    if (!scene || (scene.runner && name !== 'debug')) return;
    ACTIONS[name] && ACTIONS[name]();
    refresh();
  }

  function bind(s) {
    scene = s;
    if (bound) return;
    bound = true;
    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { run(b.dataset.act); b.blur(); }));
    window.addEventListener('keydown', e => {
      const a = KEYS[e.code];
      if (!a || e.repeat) return;
      e.preventDefault();
      run(a);
    });
    $('report').addEventListener('click', e => { if (e.target.closest('[data-close]')) $('report').classList.add('hidden'); });
    refresh();
    if (/[?&]selftest/.test(location.search)) setTimeout(() => run('test'), 300);
  }

  function refresh() {
    if (!scene) return;
    const set = (act, on, label) => { const b = document.querySelector(`[data-act=${act}]`); if (!b) return; b.classList.toggle('on', !!on); if (label) b.querySelector('b').textContent = label; };
    set('debug', scene.debug);
    set('pause', scene.paused, scene.paused ? 'RESUME' : 'PAUSE');
    set('walk', scene.employees.some(e => e.walking));
    set('rope', scene.rope && scene.rope.tie, scene.rope && scene.rope.tie ? 'UNTIE' : 'TIE ROPE');
    set('type', false, 'TYPE: ' + BB.ARCHETYPES[scene.type].name.toUpperCase());
    set('add', scene.employees.length > 1, scene.employees.length >= 4 ? 'CLEAR EXTRA' : '+ EMPLOYEE');
    $('panel').classList.toggle('hidden', !scene.debug);
  }

  function tick(s) {
    const now = performance.now();
    if (now - last < 150) return;
    last = now;
    refresh();
    if (!s.debug) return;
    const st = s.stats;
    const rows = [
      ['FPS', Math.round(s.game.loop.actualFps)],
      ['Step cost', (st.stepMs || 0).toFixed(2) + ' ms'],
      ['Bodies / joints', s.bodyCount() + ' / ' + s.constraintCount()],
      ['Joint error', (st.err || 0).toFixed(2) + ' px (peak ' + st.peakErr.toFixed(2) + ')'],
      ['Fastest body', (st.maxSpeed || 0).toFixed(1) + ' / ' + BB.PHYS.maxSpeed + ' px/step'],
      ['NaN rescues / escapes', st.nan + ' / ' + st.escapes],
      ['Sim time', s.simTime.toFixed(1) + ' s'],
      ...s.actors.map(a => [a.kind === 'parcel' ? 'Parcel' : 'Employee ' + a.id + ' (' + a.A.name + ')', a.asleep ? 'asleep' : a.settled ? 'settled' : 'moving']),
    ];
    $('panel').innerHTML = '<h3>DEBUG</h3>' + rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  function showReport(out) {
    const rows = out.results.map(r => `<tr class="${r.pass ? 'ok' : 'bad'}"><td>${r.pass ? 'PASS' : 'FAIL'}</td><td>${r.name}</td><td>${r.peakErr.toFixed(2)}</td><td>${r.limitOver.toFixed(2)} / ${r.restOver.toFixed(2)}</td><td>${r.settleT == null ? '–' : r.settleT + ' s'}</td><td>${r.why || r.note || ''}</td></tr>`).join('');
    $('report').innerHTML = `<h3>Stress test: ${out.pass}/${out.total} passed</h3>
      <table><thead><tr><th></th><th>Scenario</th><th>Peak joint gap (px)</th><th>Past limit, peak / at rest (rad)</th><th>Settled after</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <button class="btn" data-close>CLOSE</button>`;
    refresh();
  }

  BB.UI = { bind, tick, run };
})();
