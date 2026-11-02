'use strict';
/* =========================================================================
   Save data: coins, per-sport ladder (Rookie -> Legend) and records,
   the locker (kit colour, headwear, shirt number), settings.
   Stored through Platform (CrazyGames data module, else localStorage).
   ========================================================================= */

const KIT_COLORS = [
  { id: 'c_gold', name: 'GOLD', color: '#ffc933', trim: '#1a1404', price: 0 },
  { id: 'c_red', name: 'CRIMSON', color: '#ff4f5e', trim: '#2b0a0f', price: 0 },
  { id: 'c_blue', name: 'COBALT', color: '#4f8dff', trim: '#0d1a33', price: 0 },
  { id: 'c_mint', name: 'MINT', color: '#45e08a', trim: '#06301a', price: 120 },
  { id: 'c_violet', name: 'VIOLET', color: '#b36bff', trim: '#1f0b33', price: 120 },
  { id: 'c_orange', name: 'TANGERINE', color: '#ff8a2a', trim: '#331804', price: 160 },
  { id: 'c_teal', name: 'LAGOON', color: '#2fd3d3', trim: '#05302f', price: 160 },
  { id: 'c_pink', name: 'BUBBLEGUM', color: '#ff7ac6', trim: '#3a0d27', price: 220 },
  { id: 'c_white', name: 'CLASSIC', color: '#eef1f7', trim: '#1b2030', price: 260 },
  { id: 'c_black', name: 'MIDNIGHT', color: '#2a2f42', trim: '#ffc933', price: 320 },
  { id: 'c_lime', name: 'VOLT', color: '#c6f432', trim: '#253006', price: 380 },
];
const HATS = [
  { id: 'h_none', hat: 'none', name: 'NONE', price: 0 },
  { id: 'h_band', hat: 'band', name: 'HEADBAND', price: 0 },
  { id: 'h_cap', hat: 'cap', name: 'CAP', price: 150 },
  { id: 'h_beanie', hat: 'beanie', name: 'BEANIE', price: 200 },
  { id: 'h_shades', hat: 'shades', name: 'SHADES', price: 250 },
  { id: 'h_mohawk', hat: 'mohawk', name: 'MOHAWK', price: 300 },
  { id: 'h_afro', hat: 'afro', name: 'AFRO', price: 350 },
  { id: 'h_helmet', hat: 'helmet', name: 'HELMET', price: 450 },
  { id: 'h_halo', hat: 'halo', name: 'HALO', price: 700 },
  { id: 'h_crown', hat: 'crown', name: 'CROWN', price: 1200 },
];
const NUMBERS = [7, 10, 1, 9, 23, 33, 69, 99];

const Save = (() => {
  const KEY = 'save';
  const fresh = () => ({
    v: 1, coins: 0, last: 'soccer', matches: 0,
    sports: {},
    kit: { color: '#ffc933', trim: '#1a1404', hat: 'band', number: 7, colorId: 'c_gold', hatId: 'h_band' },
    owned: ['c_gold', 'c_red', 'c_blue', 'h_none', 'h_band'],
    settings: { sfx: true, music: true, shake: true },
    seen: {},
  });
  let data = fresh();

  function load() {
    try {
      const raw = Platform.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        data = Object.assign(fresh(), d);
        data.kit = Object.assign(fresh().kit, d.kit || {});
        data.settings = Object.assign(fresh().settings, d.settings || {});
      }
    } catch (e) { data = fresh(); }
  }
  let t = null;
  function save() {
    clearTimeout(t);
    t = setTimeout(() => { try { Platform.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }, 60);
  }

  function sport(id) {
    if (!data.sports[id]) data.sports[id] = { unlocked: 0, tier: 0, wins: 0, losses: 0, draws: 0, best: null, medals: [0, 0, 0, 0] };
    return data.sports[id];
  }

  // record a finished match; returns what changed (coins, new tier...)
  function record(res) {
    const s = sport(res.sport);
    const T = TIERS[res.tier];
    const won = res.winner === 0, draw = res.winner === -1;
    let coins = won ? T.coins : draw ? Math.round(T.coins * 0.4) : Math.round(T.coins * 0.25);
    if (res.bonus) coins += res.bonus;
    if (won) s.wins++; else if (draw) s.draws++; else s.losses++;
    s.medals[res.tier] = Math.max(s.medals[res.tier] || 0, won ? 1 : 0);
    let unlocked = null;
    if (won && res.tier === s.unlocked && s.unlocked < TIERS.length - 1) {
      s.unlocked++;
      unlocked = TIERS[s.unlocked];
      coins += 50;
    }
    if (won && res.tier === TIERS.length - 1 && !s.legendBeat) { s.legendBeat = true; coins += 200; }
    let pb = false;
    if (res.pb != null && (s.best == null || res.pb > s.best)) { s.best = res.pb; pb = true; }
    s.tier = won && unlocked ? s.unlocked : res.tier;
    data.coins += coins;
    data.matches++;
    data.last = res.sport;
    save();
    return { coins, unlocked, pb };
  }

  function spend(n) { if (data.coins < n) return false; data.coins -= n; save(); return true; }
  function owns(id) { return data.owned.includes(id); }
  function buy(id, price) { if (owns(id)) return true; if (!spend(price)) return false; data.owned.push(id); save(); return true; }

  const totalWins = () => Object.values(data.sports).reduce((n, s) => n + s.wins, 0);
  const trophies = () => Object.values(data.sports).reduce((n, s) => n + s.unlocked + (s.legendBeat ? 1 : 0), 0);

  return { load, save, sport, record, spend, owns, buy, totalWins, trophies, get data() { return data; } };
})();
