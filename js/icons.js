'use strict';
/* =========================================================================
   Icons (24x24, currentColor): UI glyphs, one per sport and one per
   action. Any element with data-icon="name" is filled in by Icons.hydrate().
   ========================================================================= */

const Icons = (() => {
  const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const D = 'rgba(0,0,0,.32)';
  const P = {
    // ui
    play: `<path d="M7 4.5v15l12.5-7.5z" ${F}/>`,
    pause: `<path d="M8.5 5v14M15.5 5v14" ${S} stroke-width="3.4"/>`,
    back: `<path d="M15 5l-7 7 7 7" ${S} stroke-width="3"/>`,
    next: `<path d="M5 12h13M13 6l6 6-6 6" ${S} stroke-width="2.8"/>`,
    close: `<path d="M6 6l12 12M18 6 6 18" ${S} stroke-width="3"/>`,
    check: `<path d="m5 12.5 4.5 4.5L19 7.5" ${S} stroke-width="3"/>`,
    gear: `<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" ${S}/><path d="M10.3 2.8h3.4l.6 2.6 2 1.1 2.5-.9 1.7 2.9-1.9 1.8v2.3l1.9 1.8-1.7 2.9-2.5-.9-2 1.1-.6 2.6h-3.4l-.6-2.6-2-1.1-2.5.9-1.7-2.9 1.9-1.8v-2.3L3.5 8.5l1.7-2.9 2.5.9 2-1.1z" ${S} stroke-width="1.9"/>`,
    coin: `<circle cx="12" cy="12" r="9" ${F}/><circle cx="12" cy="12" r="6.2" fill="none" stroke="${D}" stroke-width="1.6"/><path d="M12 8.2v7.6M9.8 10.2h4.4" stroke="${D}" stroke-width="2" stroke-linecap="round"/>`,
    trophy: `<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" ${F}/><path d="M7 5.5H4.2c0 3 1.2 4.6 3.3 5M17 5.5h2.8c0 3-1.2 4.6-3.3 5" ${S} stroke-width="2"/><path d="M10.5 14h3v3.5h-3zM7.5 20.5c0-2 1.8-3 4.5-3s4.5 1 4.5 3z" ${F}/>`,
    medal: `<path d="M7 2.5h4l2 5h-4zM17 2.5h-4l-2 5h4z" ${F} opacity=".7"/><circle cx="12" cy="15" r="6.5" ${F}/><path d="m12 11.6 1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="${D}"/>`,
    star: `<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" ${F}/>`,
    home: `<path d="M3 11.2 12 3.5l9 7.7V20.5H14.5v-6h-5v6H3z" ${F}/>`,
    restart: `<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4v4.5H9" ${S} stroke-width="2.6"/>`,
    shirt: `<path d="M8.5 3.5 3 6.5l2.2 4.3 2.3-1V20.5h9V9.8l2.3 1 2.2-4.3-5.5-3c-.4 1.6-1.8 2.6-3.5 2.6S8.9 5.1 8.5 3.5z" ${F}/>`,
    sound: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" ${F}/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" ${S}/>`,
    music: `<path d="M9 17.5V5.5l10-2v12" ${S}/><circle cx="6.5" cy="17.5" r="2.8" ${F}/><circle cx="16.5" cy="15.5" r="2.8" ${F}/>`,
    shake: `<rect x="7" y="4" width="10" height="16" rx="2" ${F}/><path d="M3.5 8v8M20.5 8v8" ${S}/>`,
    lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.4" ${F}/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
    chart: `<path d="M4 20.5h16" ${S}/><rect x="5" y="11" width="3.6" height="7.5" rx="1" ${F}/><rect x="10.2" y="6" width="3.6" height="12.5" rx="1" ${F}/><rect x="15.4" y="13" width="3.6" height="5.5" rx="1" ${F}/>`,
    shuffle: `<path d="M3.5 7h3.5c4.5 0 5.5 10 10 10h3.5M3.5 17H7c1.6 0 2.7-1.3 3.6-3M14 9.5c.9-1.5 2-2.5 3.5-2.5h3" ${S}/><path d="m18 4 3 3-3 3M18 14l3 3-3 3" ${S}/>`,
    up: `<path d="M12 19V6M6 11.5 12 5.5l6 6" ${S} stroke-width="3"/>`,
    user: `<circle cx="12" cy="8" r="4.2" ${F}/><path d="M4 20.5c.8-4.4 4-6.5 8-6.5s7.2 2.1 8 6.5z" ${F}/>`,
    rotate: `<rect x="4" y="7" width="16" height="10" rx="2" ${S}/><path d="M17 3.5a6 6 0 0 1 3.5 3.5M7 20.5A6 6 0 0 1 3.5 17" ${S}/>`,
    // sports
    soccer: `<circle cx="12" cy="12" r="9.2" ${F}/><path d="m12 8.2 3.4 2.4-1.3 4H9.9l-1.3-4z" fill="${D}"/><path d="M12 2.8v5.4M15.4 10.6l5-1.4M14.1 14.6l3 4.4M9.9 14.6l-3 4.4M8.6 10.6l-5-1.4" stroke="${D}" stroke-width="1.5"/>`,
    hoops: `<circle cx="12" cy="12" r="9.2" ${F}/><path d="M2.8 12h18.4M12 2.8v18.4M5.3 5.5c2.6 2.4 2.6 10.6 0 13M18.7 5.5c-2.6 2.4-2.6 10.6 0 13" fill="none" stroke="${D}" stroke-width="1.6"/>`,
    volley: `<circle cx="12" cy="12" r="9.2" ${F}/><path d="M12 2.8c-1.5 4.2-.8 8 2.4 10.9M20.6 15.3c-4.3.6-7.6-.7-9.9-3.9M5 18c1.9-3.9 5-6 9.4-6.4" fill="none" stroke="${D}" stroke-width="1.7"/>`,
    boxing: `<path d="M6.5 9.5c0-3.6 2.6-6 6.2-6h1.6c3.3 0 5.7 2.6 5.7 6v3.8c0 2.5-1.6 4.3-3.9 4.9v2.8H8.8v-2.9C7.4 17.4 6.5 16 6.5 14.3z" ${F}/><path d="M6.5 11.5c-1.8-.2-3 .9-3 2.6 0 1.5 1.2 2.6 3 2.4" ${F}/><path d="M8.8 17.8h7.3M10 9.5h6" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/>`,
    javelin: `<path d="M3 20 19.5 4.5" ${S} stroke-width="2.4"/><path d="m18 3.5 3.5-1-1 3.5z" ${F}/><path d="M9.2 13.4l1.8 1.8" ${S} stroke-width="4"/><path d="M3.5 13.5c2-5 6-8.5 11-10" ${S} stroke-width="1.4" stroke-dasharray="2 2.5" opacity=".7"/>`,
    // actions
    kick: `<path d="M9.5 2.5 8 11.5l4.5 4.5h7a2 2 0 0 1 0 4h-9.5L5 14.5l2-12z" ${F}/><circle cx="19.5" cy="7.5" r="3" ${F} opacity=".75"/>`,
    slide: `<path d="M3 19.5h18" ${S}/><path d="M4 16.5 9 13l5.5 1.5 6 .5v2.5H6.5z" ${F}/><circle cx="7.5" cy="9" r="2.6" ${F}/><path d="M2.5 13.5h3M2 10.5h2.5" ${S} stroke-width="1.6"/>`,
    shoot: `<circle cx="17" cy="7" r="4" ${F}/><path d="M3.5 20.5c1-6 4.5-10 9-11.5" ${S} stroke-dasharray="2.4 2.6"/>`,
    shove: `<path d="M4 9.5h9.5a2 2 0 0 1 0 4H9M4 14.5h7.5a2 2 0 0 1 0 4H4" ${S} stroke-width="2.4"/><path d="M16.5 7.5l4 4.5-4 4.5" ${S}/>`,
    hit: `<path d="M7.5 21v-6.5L4 10.5a1.8 1.8 0 0 1 2.6-2.4l2.4 2.4V4.8a1.6 1.6 0 0 1 3.2 0V10V3.6a1.6 1.6 0 0 1 3.2 0V10V5a1.6 1.6 0 0 1 3.2 0v9.5c0 3.5-2 6.5-5.5 6.5z" ${F}/>`,
    dive: `<path d="M2.5 20h19" ${S}/><path d="M4.5 16.5 11 12l8.5-1v2.5l-7 1.5-6 3z" ${F}/><circle cx="20" cy="7" r="2.6" ${F}/><circle cx="7" cy="9" r="2.4" ${F} opacity=".75"/>`,
    punch: `<path d="M4 11.5c0-2.6 1.9-4.5 4.5-4.5h7c2.8 0 5 2.2 5 5s-2.2 5-5 5h-6l-1 2H5.5l.2-2.6C4.6 15.6 4 14 4 12.6z" ${F}/><path d="M9.5 7.5v5M13 7.5v5M16.5 8v4.5" stroke="${D}" stroke-width="1.4" stroke-linecap="round"/>`,
    block: `<path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8.2 7.5 9.6 4.3-1.4 7.5-5 7.5-9.6v-6z" ${F}/><path d="M12 6.5v11" stroke="${D}" stroke-width="1.6"/>`,
    jump: `<path d="M12 19V6M6 11.5 12 5.5l6 6" ${S} stroke-width="3"/>`,
  };
  function svg(name) {
    const p = P[name] || P.star;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${p}</svg>`;
  }
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.hydrated === el.dataset.icon) return;
      el.innerHTML = svg(el.dataset.icon);
      el.dataset.hydrated = el.dataset.icon;
    });
  }
  return { svg, hydrate };
})();
