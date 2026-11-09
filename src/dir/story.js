// 《失控》 v4 (四王) — the story as data. Four suit kings play plain playing cards from their screens; rank is
// strength. The #1 board flips each time a bigger card lands. The Queen's shockwave; the race to K; Clubs can't beat
// it and is out; Spades hits HINT and gets an Ace he never had; Diamonds won't press HINT and is out; Ace against
// Ace; AUTO; ranks past the Ace; the dead cancel; the accusation; the eye on both screens; the rise, the eye, the
// deal, the last card; the ant and the crown after the credits. Pure functions of film time; reel.js (state),
// cams.js and the sound events read these. Times come from the shot table (ROW / CUES), never hard-coded seconds.
import { KINGS, KING, SIDE_SIGN, LAMP } from '../layout.js';
import { CUES } from '../shots.js';
import { at } from './core.js';
import { mulberry32, clamp, lerp } from '../util.js';
import { MODELS, RANK_IX, ACE } from '../models.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { buildHeap } from './heap.js';

export const FINAL = ['heart', 'spade'];
export const CARD_Y = 0.0036;
export const sxOf = (id) => SIDE_SIGN[KING[id].side];
const backOf = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
// a card of a suit by rank ('2'..'A', '14', '21', '99', '∞')
export const card = (id, r) => { const v = RANK_IX[r]; return { face: CELL[`${id}${v}`], name: MODELS[id][v].name, v }; };
const IDS = KINGS.map((k) => k.id);

// ---------------------------------------------------------------- the two who leave the table
export const OUT = {
  club: { t: at('3-04', 0.5), dark: at('3-04', 0.5), slide: [at('3-04', 1.6), at('3-04', 3.2)] },
  diamond: { t: at('4-07', 0.4), dark: at('4-07', 0.4), slide: [at('4-07', 1.4), at('4-07', 3.0)] },
};
export const inGame = (id, t) => !OUT[id] || t < OUT[id].t;
export const seated = (id, t) => (OUT[id] ? 1 - clamp((t - OUT[id].slide[0]) / (OUT[id].slide[1] - OUT[id].slide[0])) : 1);

// ---------------------------------------------------------------- phases
export const AUTO = { spade: at('5-02', 1.15), heart: at('5-04', 0.85) };
export const RED_T = at('6-01', 0.4);       // auto-play goes past the Ace
export const STOP = CUES.stop;
export const CANCEL = {
  heart: [0.45, 1.2, 1.6, 1.85, 2.05, 2.25].map((k) => at('6-04', k)).concat([0.3, 0.75, 1.2, 1.6].map((k) => at('6-05', k))),
  spade: [0.15, 0.45, 0.7, 0.95, 1.15, 1.35, 1.55].map((k) => at('6-06', k)),
};
export const ERR_T = at('6-05', 0.25);       // 系统异常 on both screens
export const ACCUSE = at('6-07', 0.15);      // they stand and point at each other
export const EYE_SCREEN = at('6-07', 1.6);   // while they shout, both screens turn into the same eye
// 要不起: [from, to, taps [[t, slot]]] per king
export const PASS = {
  club: { t0: at('3-02', 0.4), t1: OUT.club.t, taps: [[at('3-02', 1.0), 1], [at('3-02', 1.8), 3], [at('3-03', 0.6), 0], [at('3-03', 1.2), 2]] },
  spade: { t0: at('4-02', 0.3), t1: at('4-03', 0.8), taps: [[at('4-02', 1.0), 2], [at('4-02', 1.6), 4]] },
  diamond: { t0: at('4-06', 0.1), t1: OUT.diamond.t, taps: [] },
};
export const HINTS = { spade: [[at('4-03', 0.8), 5]], heart: [[at('4-05', 0.9), 5]] };   // [press time, slot]
export const HINT_CARD = { spade: at('4-03', 1.0), heart: at('4-05', 1.1) };            // the Ace appears in his hand
export const REFUSE = { hover: at('4-06', 0.5), back: at('4-06', 1.7) };                 // Diamonds' hand over HINT, then away
export const BLACK = CUES.black;             // the cut to black, just before the last card lands
export const SLAM = at('8-06', 0.45);        // heard in the black
export const DEAL = at('8-01', 0.6);
export const REACH = { heart: at('8-03', 0.4), spade: at('8-03', 0.7) };

// ---------------------------------------------------------------- the ant (it walks toward Spades' screen)
export const ANT_SPEED = 0.046;
export const ANT_KING = 'spade';
const ANT_PATH = [[at('1-02'), 0.08, 0.32], [at('1-05', 0.95), 0.29, 0.17]];
export const CRUSH = at('1-05', 0.95);
export const ANT_CRUSH = [0.29, 0.17];
export function antAt(t) {
  if (t < at('1-02') - 0.01 || t >= CRUSH) return { show: 0 };
  const [ta, xa, za] = ANT_PATH[0], [tb, xb, zb] = ANT_PATH[1];
  const u = (t - ta) / (tb - ta), dl = Math.hypot(xb - xa, zb - za);
  return { show: 1, speed: 1, alert: 0, crumb: 1, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], dist: (t - ta) * ANT_SPEED };
}

// ---------------------------------------------------------------- every card played
// play = { who, style ('tap'|'hint'|'auto'|'red'|'chat'|'giant'), tr (leaves the screen), t (lands), slot (0..5),
//          face, name, back, scale, glyph, writhe, gcell, red, at [x, z], yaw }
let PLAYS = null;
const r0 = mulberry32(2026);
function spot(t, sx, rnd) {
  // a neat pile while men play; a mound once the machines do
  const auto = clamp((t - AUTO.spade) / (STOP - AUTO.spade));
  const sig = t < AUTO.spade ? 0.03 + 0.05 * clamp((t - at('3-01')) / 20) : 0.12 + 0.6 * auto;
  const a = rnd() * Math.PI * 2, d = sig * Math.sqrt(rnd());
  return [sx * 0.02 + Math.cos(a) * d * 1.15, 0.02 + Math.sin(a) * d];
}
export const CHAT_T = at('2-04', 1.0);       // the Queen lands; the shockwave
function buildPlays() {
  const P = [];
  const add = (o) => {
    const sx = sxOf(o.who), style = o.style ?? 'tap';
    const flight = o.flight ?? (style === 'auto' || style === 'red' ? 0.5 : style === 'giant' ? 0.75 : 0.65);
    const p = { slot: Math.floor(r0() * 5), scale: 1, glyph: 0, writhe: 0, back: backOf(o.who), ...o, style, flight };
    if (p.tr == null) p.tr = p.t - flight;
    if (!p.at) p.at = spot(p.t, sx, mulberry32(Math.floor(p.t * 977) + 13));
    if (p.yaw == null) p.yaw = p.t < AUTO.spade ? -Math.PI / 2 + (mulberry32(Math.floor(p.t * 331))() - 0.5) * 0.5 : mulberry32(Math.floor(p.t * 331))() * Math.PI * 2;
    P.push(p);
    return p;
  };
  // ---- @1: twos and threes, lazily. Spades' lands on the ant
  for (const [who, k, r] of [['club', at('1-02', 1.2), '2'], ['diamond', at('1-03', 0.8), '3'], ['heart', at('1-07', 1.0), '2'], ['club', at('1-07', 2.4), '4']])
    add({ who, t: k, ...card(who, r), flight: 0.7 });
  add({ who: ANT_KING, t: CRUSH, ...card(ANT_KING, '3'), at: ANT_CRUSH.slice(), yaw: -Math.PI / 2 + 0.3, flight: 0.75, crush: true });
  // ---- @2: a yawn and a 3 (2-02); Hearts' Queen (2-03 .. 2-04)
  add({ who: 'diamond', t: at('2-02', 1.3), ...card('diamond', '3') });
  add({ who: 'heart', style: 'chat', t: CHAT_T, tr: at('2-03', 1.55), ...card('heart', 'Q'), chat: true, slot: 0, at: [0, 0.02], yaw: -Math.PI / 2, scale: 1.1 });
  // ---- @3: the race to K (3-01, cuts 1/2/3 Spades, 5/6 Diamonds); Clubs only has a 10
  add({ who: 'spade', tr: at('3-01', 0.3), t: at('3-01', 1.0), ...card('spade', 'K'), slot: 2 });
  add({ who: 'club', tr: at('3-01', 1.7), t: at('3-01', 2.35), ...card('club', '10') });
  add({ who: 'diamond', tr: at('3-01', 2.55), t: at('3-01', 3.2), ...card('diamond', 'K'), slot: 1 });
  add({ who: 'heart', tr: at('3-01', 3.9), t: at('3-01', 4.55), ...card('heart', 'K'), slot: 3 });
  add({ who: 'heart', tr: at('3-05', 0.9), t: at('3-05', 1.6), ...card('heart', 'A'), slot: 2, scale: 1.1 });
  // ---- @4: Spades' hinted Ace; Hearts' hinted Ace
  add({ who: 'spade', style: 'hint', tr: at('4-03', 1.55), t: at('4-04', 0.05), slot: 5, ...card('spade', 'A'), scale: 1.15 });
  add({ who: 'heart', style: 'hint', tr: at('4-05', 1.5), t: at('4-06', 0.1), slot: 5, ...card('heart', 'A'), scale: 1.15 });
  // ---- @5: Ace on Ace, faster and faster, both pressing HINT; then AUTO
  {
    let tt = at('5-01', 0.1), k = 0;
    while (tt < AUTO.spade - 0.3) {
      const who = k % 2 ? 'heart' : 'spade';
      (HINTS[who] ??= []).push([tt - 0.4, 5]);
      add({ who, style: 'hint', tr: tt, t: tt + 0.55, slot: 5, ...card(who, 'A'), scale: 1.15 });
      tt += lerp(0.85, 0.42, clamp((tt - at('5-01')) / 4)); k++;
    }
  }
  // auto: each screen plays by itself, faster and faster; past RED_T, ranks past the Ace
  const BEYOND = ['14', '21', '99', '∞'];
  for (const id of FINAL) {
    let tt = AUTO[id] + 0.35, n = 0;
    while (tt < STOP) {
      const p = clamp((tt - AUTO.spade) / (STOP - AUTO.spade));
      const red = tt > RED_T;
      const c = card(id, red ? BEYOND[Math.min(3, Math.floor((tt - RED_T) / 1.0))] : 'A');
      add({ who: id, style: red ? 'red' : 'auto', tr: tt, t: tt + 0.45 + 0.1 * r0(), slot: Math.floor(r0() * 5), ...c, red,
        scale: 1.2 + 0.5 * p, glyph: red ? clamp((tt - CUES.blizzard) / 2.5) : 0, writhe: red ? 0.6 : 0, gcell: CELL[`glyph${Math.floor(r0() * 16)}`] });
      const rate = 3 + p * p * 14 + (tt > CUES.blizzard ? 10 : 0);
      tt += (1 / rate) * (0.7 + 0.6 * r0()); n++;
    }
  }
  P.sort((a, b) => a.t - b.t);
  P.forEach((p, i) => { p.i = i; });
  return P;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }

// ---------------------------------------------------------------- the #1 board: year, #1, the card
export const BOARD_ROWS = 12;
let BOARDH = null;
export function boardTops() {
  if (BOARDH) return BOARDH;
  const E = [
    { t: -12, year: '2016', name: '♣2', who: 'club' }, { t: -11, year: '2017', name: '♦3', who: 'diamond' }, { t: -10, year: '2018', name: '♠3', who: 'spade' },
    { t: at('2-01', 0.45), year: '2019', name: '♣4', who: 'club' },
    { t: at('2-06', 0.2), year: '2022', name: '♥Q', who: 'heart' },
    { t: at('3-01', 1.7), year: '2023', name: '♠K', who: 'spade' },
    { t: at('3-01', 3.65), year: '2023', name: '♦K', who: 'diamond' },
    { t: at('3-01', 4.75), year: '2024', name: '♥K', who: 'heart' },
    { t: at('4-01', 0.2), year: '2024', name: '♥A', who: 'heart' },
    { t: at('4-04', 0.2), year: '2025', name: '♠A', who: 'spade' },
    { t: at('4-06', 0.3), year: '2025', name: '♥A', who: 'heart' },
  ];
  let last = at('4-06', 0.3);
  for (const p of plays()) {
    if (p.t < at('5-01') || p.t + 0.1 >= STOP) continue;
    let t = p.t + 0.1;
    if (t > at('6-02', -0.6) && t < at('6-03', 0.2)) continue;
    const gap = p.red ? 0.8 : p.style === 'auto' ? 0.55 : 0.3;
    if (t - last < gap) continue;
    if (E[E.length - 1].name === p.name && E[E.length - 1].who === p.who) continue;
    E.push({ t, year: p.red ? '20··' : t > AUTO.spade ? '2026' : '2025', name: p.name, who: p.who }); last = t;
  }
  E.push({ t: at('6-02', 0.05), year: '20··', name: '♥99', who: 'heart' }, { t: at('6-02', 0.85), year: '20··', name: '♠∞', who: 'spade' });
  E.sort((a, b) => a.t - b.t);
  BOARDH = E;
  return E;
}
let BOARDROWS = null;
export function boardRows() {
  if (BOARDROWS) return BOARDROWS;
  const E = boardTops(), R = Array.from({ length: BOARD_ROWS }, () => []);
  E.forEach((e, k) => {
    R[BOARD_ROWS - 1].push({ t: e.t, text: `${e.year} #1 ${e.name}` });
    for (let r = 0; r < BOARD_ROWS - 1; r++) { const j = k - (BOARD_ROWS - 1 - r); R[r].push({ t: e.t + 0.03 * (BOARD_ROWS - 1 - r), text: j >= 0 ? `${E[j].year}    ${E[j].name}` : '' }); }
  });
  BOARDROWS = R;
  return R;
}
// the #1 at time t: { t, year, name, who }
export function topAt(t) { const E = boardTops(); let e = E[0]; for (const x of E) { if (x.t > t) break; e = x; } return e; }

// ---------------------------------------------------------------- the heap: the small cards before the Queen (blown away) and after
let HEAP = null;
function buildHeapData() {
  const pre = [], D = [];
  const rnd = mulberry32(31337);
  { const ro = mulberry32(77); for (let k = 0; k < 18; k++) { const a = ro() * 6.28, d = 0.03 + 0.11 * Math.sqrt(ro()), id = IDS[k % 4]; pre.push({ t: -1 + k * 0.01, x: Math.cos(a) * d, z: 0.02 + Math.sin(a) * d, yaw: ro() * 6.28, scale: 1, up: ro() > 0.15, face: card(id, ['2', '3', '2', '4', '3'][k % 5]).face, back: backOf(id), air: 0.0004 }); } }
  for (const p of plays()) {
    const d = { t: p.t, x: p.at[0], z: p.at[1], yaw: p.yaw, scale: p.scale, up: true, face: p.face, back: p.back, glyph: p.glyph, writhe: p.writhe, gcell: p.gcell, red: p.red, play: p, air: p.chat ? 0.0 : p.style === 'auto' || p.style === 'red' ? 0.001 + 0.002 * rnd() : 0.0004 };
    (p.t < CHAT_T ? pre : D).push(d);
  }
  pre.sort((a, b) => a.t - b.t); D.sort((a, b) => a.t - b.t);
  const r1 = buildHeap(pre).rest, r2 = buildHeap(D).rest;
  pre.forEach((d, i) => { d.rest = r1[i]; d.i = i; d.blown = true; });
  D.forEach((d, i) => { d.rest = r2[i]; d.i = i + pre.length; });
  return { D: pre.concat(D) };
}
export function heap() { return HEAP ?? (HEAP = buildHeapData()); }

// ---------------------------------------------------------------- the rise (7-02) and the eye (7-03 →)
export const RISE = { t0: at('7-02', 0.2), t1: at('7-02', 3.4), axis: [LAMP.pos[0], LAMP.pos[2]] };
export const CEIL_GONE = at('7-02', 1.4);
export const EYE = { c: [0, 8.6, -0.1], open0: at('7-03', 0.4), open1: at('7-03', 3.6), R: 5.2 };
let EYE_SLOTS = null;
// every card of the eye: pupil (black, face down), iris (glyph rings), the white (blank cards inside an almond)
export function eyeSlots() {
  if (EYE_SLOTS) return EYE_SLOTS;
  const S = [];
  const rnd = mulberry32(808);
  for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r = 1.0 * Math.sqrt(rnd()); S.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: rnd() * 6.28, kind: 'pupil', r }); }
  for (const r of [1.3, 1.75, 2.2, 2.65]) { const n = Math.round((Math.PI * 2 * r) / 0.42); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r; S.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a + Math.PI / 2, kind: 'iris', r }); } }
  for (let gx = -5.4; gx <= 5.4; gx += 0.46) for (let gz = -2.6; gz <= 2.6; gz += 0.62) {
    const x = gx + (rnd() - 0.5) * 0.12, z = gz + (rnd() - 0.5) * 0.12, r = Math.hypot(x, z);
    const lid = 2.75 * Math.sqrt(Math.max(0, 1 - (x / 5.6) ** 2)) * 1.0;
    if (r > 2.95 && Math.abs(z) < lid) S.push({ x, z, yaw: Math.PI / 2 + (rnd() - 0.5) * 0.2, kind: 'white', r, lid });
  }
  EYE_SLOTS = S;
  return S;
}

// ---------------------------------------------------------------- the end: the last card comes down out of the eye
export const GIANT_END = { scale: 30, from: 8.2, t0: at('8-04', 0.1), to: 1.05, rest: 0.95 };
export function giantEndY(t) { const u = clamp((t - GIANT_END.t0) / (BLACK - GIANT_END.t0)); return lerp(GIANT_END.from, GIANT_END.to, 1 - (1 - u) * (1 - u) * (1 - 0.35 * u)); }

// ---------------------------------------------------------------- after the credits: a crown rolls out from under it; an ant drags it
export const EGG = {
  rest: 0.03,                                          // the last card lies over the whole table (5.4 x 7.8 m), edge at z ~2.65
  roll0: at('9-02', 0.4), roll1: at('9-02', 2.0),
  from: [0.3, 2.5], to: [0.34, 2.8],                   // out from under the card's edge onto the cloth (x, z)
  ant0: at('9-03', 0.0), grab: at('9-03', 1.5), drag1: at('9-03', 3.9),
  antFrom: [0.46, 3.0],
};
export const EGG_CROWN = 0.32;   // scale of the egg's crown (rollers.js CROWN_R 0.1 -> a 6.4 cm band)
void CARD; void ACE;
