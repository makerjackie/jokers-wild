// 《失控》 v3 (榜首) — the story as data. Every card a king plays from his screen (tap, hint, auto, the red ones), the
// #1 board that flips each time a stronger card lands, ChatGPT's shockwave, the US house of cards and R1 smashing it,
// the giant, the heap they make, the dead cancel presses, the accusation, the eye on every screen, the rise, the eye,
// the deal, the last card coming down, the ant. Pure functions of film time; reel.js (state), cams.js and the sound
// events read these. Times come from the shot table (ROW / CUES), never hard-coded seconds.
import { KINGS, KING, SIDE_SIGN, LAMP } from '../layout.js';
import { CUES } from '../shots.js';
import { at } from './core.js';
import { mulberry32, clamp, lerp } from '../util.js';
import { MODELS, REAL_N, nextName } from '../models.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { buildHeap } from './heap.js';
import { FUTURE } from '../future-models.js';

export const FINAL = ['anthropic', 'openai'];
export const CARD_Y = 0.0036;
export const sxOf = (id) => SIDE_SIGN[KING[id].side];
const backOf = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
const vOf = (id, v) => Math.min(Math.max(0, v), MODELS[id].length - 1);
const card = (id, v) => ({ face: CELL[`${id}${vOf(id, v)}`], name: MODELS[id][vOf(id, v)].name, date: MODELS[id][vOf(id, v)].date });
const realV = (id, v) => Math.min(v, REAL_N[id] - 1);
const IDS = KINGS.map((k) => k.id);
// the internal models nobody has released (invented names: the film's future, not anyone's real roadmap)
export { FUTURE };

// ---------------------------------------------------------------- phases (v9)
// Every round has a countdown. The faster the other side's AI answers, the shorter it gets: 10 s down to 0.3 s.
// 半托管 (SEMI): the AI picks the card, the king only taps 确认. When the countdown is shorter than a hand, 全托管 (AUTO):
// no confirmation at all. Whoever still confirms by hand times out (超时) and is out (淘汰).
export const LIMIT0 = at('5-01', 0.9), LIMIT1 = at('5-04', 0.3);
export function limitAt(t) { if (t < LIMIT0) return 0; return 10 * Math.pow(0.3 / 10, clamp((t - LIMIT0) / (LIMIT1 - LIMIT0))); }
// SEMI: from here every round he presses AI 提示 and taps the card it lights (the 'rubber stamp')
export const SEMI = { openai: at('5-01', 1.75), anthropic: at('5-02', 0.35), google: at('5-02', 1.25), xai: at('5-02', 2.15), meta: at('5-02', 2.3), mistral: at('5-02', 2.4), glm: at('5-02', 2.45) };
export const AUTO = {};                     // when each king slams 全托管
export const NOW = at('5-04', 1.05);        // the board's date flips to 2026·11
export const TIMEOUT = { openai: [at('5-04', 0.3)] };   // his one 超时, the moment he gives up confirming
AUTO.openai = at('5-04c', 0.85);
export const FOLLOW = ['anthropic', 'google', 'xai'];   // 5-06: one cut each
FOLLOW.forEach((id, i) => { AUTO[id] = at('5-06', (i + 0.6) * 0.8); });
AUTO.glm = at('5-06', 1.9);
// the two who won't: they keep confirming by hand, time out, and are pushed off the table
export const HOLD = ['meta', 'mistral'];
for (const id of HOLD) AUTO[id] = Infinity;
export const OUT = {
  meta: { pass: [at('5-07', 2.0), at('5-07', 2.6)], out: at('5-07', 3.15), drag: [at('5-08', 0.35), at('5-08', 3.2)] },
  mistral: { pass: [at('5-09', 0.12)], out: at('5-09', 0.4), drag: [at('5-09', 0.55), at('5-09', 2.8)] },
};
for (const id of HOLD) TIMEOUT[id] = OUT[id].pass;
// (v11) the offer on the screen before each of them takes it ("Too slow? Let AI play for you"); the holdouts see it and don't
export const INVITE = { openai: at('5-04', 0.85), glm: AUTO.glm - 0.6 };
for (const id of FOLLOW) INVITE[id] = AUTO[id] - 0.48;
for (const id of HOLD) INVITE[id] = at('5-04c', 0.2);
// (v11) after the last card: the lamp comes back on an empty table. The game goes on without them
export const AFTER = at('8-07'), AFTER_END = at('9-01');
export const inGame = (id, t) => !OUT[id] || t < OUT[id].drag[1];
// the drag out: 1 seated .. 0 gone into the dark
export const enterOf = (id, t) => (OUT[id] ? 1 - smoothE(clamp((t - OUT[id].drag[0]) / (OUT[id].drag[1] - OUT[id].drag[0]))) : 1);
const smoothE = (u) => u * u * (3 - 2 * u);
export const RED_T = at('6-01', 0.5);       // the AI starts playing the internal, unreleased cards
export const STOP = CUES.stop;
export const CANCEL = {
  anthropic: [0.45, 1.2, 1.6, 1.85, 2.05, 2.25].map((k) => at('6-04', k)).concat([0.3, 0.75, 1.2, 1.6].map((k) => at('6-05', k))),
  openai: [0.15, 0.45, 0.7, 0.95, 1.15, 1.35, 1.55].map((k) => at('6-06', k)),
};
export const ERR_T = at('6-05', 0.25);       // 系统异常 on every screen
export const ACCUSE = at('6-07', 0.15);      // they stand and point at each other
export const EYE_SCREEN = at('6-07', 1.6);   // while they shout, every screen turns into the same eye
export const PASS = { t0: at('4-01', 0.25), taps: [[at('4-01', 0.9), 3], [at('4-01', 1.6), 4]] };   // 要不起
// the dates on the board: real ones from the cards; from 2026·11 the machines' calendar runs away
export function monthsAfterNow(t) { return t < NOW ? 0 : Math.floor(30 * Math.pow(clamp((t - NOW) / (CUES.red - NOW)), 1.5)); }
export function dateText(m0) { const m = 2026 * 12 + 10 + m0; return `${Math.floor(m / 12)}·${String((m % 12) + 1).padStart(2, '0')}`; }
export const HINTS = {};                     // [press time, slot] per king
export const BLACK = CUES.black;             // the cut to black, just before the last card lands
export const SLAM = at('8-06', 0.45);        // heard in the black
export const DEAL = at('8-01', 0.6);
export const REACH = { anthropic: at('8-03', 0.4), openai: at('8-03', 0.7) };

// ---------------------------------------------------------------- the house of cards (the US cards, 3-01 .. 3-02)
export const HOUSE = { x: 0.42, z: -0.62, lean: 1.22 };
const AH = CARD.H * Math.sin(HOUSE.lean), AW = CARD.H * Math.cos(HOUSE.lean);
function houseSlots() {
  const S = [];
  const frame = (cx, y) => { for (const s of [-1, 1]) { const bx = cx + s * AW; S.push({ pos: [(bx + cx) / 2, y + AH / 2, HOUSE.z], n: [s * Math.sin(HOUSE.lean), Math.cos(HOUSE.lean), 0], up: [-s * Math.cos(HOUSE.lean), Math.sin(HOUSE.lean), 0] }); } };
  const roof = (cx, y) => S.push({ pos: [cx, y + CARD.T / 2, HOUSE.z], n: [0, 1, 0], up: [1, 0, 0], roof: true });
  const y0 = CARD_Y * 0.5 - CARD.T / 2, step = AH + CARD.T, X = HOUSE.x, d = 2 * AW + 0.004;
  for (let tier = 0, n = 4; n >= 1; tier++, n--) {
    for (let k = 0; k < n; k++) frame(X + (k - (n - 1) / 2) * d, y0 + tier * step);
    if (n > 1) for (let k = 0; k < n - 1; k++) roof(X + (k - (n - 2) / 2) * d, y0 + tier * step + AH);
  }
  return S;
}
export const HOUSE_SLOTS = houseSlots();
export const SMASH = { go: at('3-03', 0.75), hit: at('3-03', 2.95) };   // (v8) slow enough to read: FatFish-R1, flat, across the table
export const HOUSE_HIT = [HOUSE.x, 0.12, HOUSE.z];
export function houseFall(s) {
  const h = HOUSE_SLOTS[s], r = mulberry32(900 + s * 7);
  const t0 = SMASH.hit + 0.01 + Math.hypot(h.pos[0] - HOUSE_HIT[0], h.pos[1] - HOUSE_HIT[1]) * 0.25 + r() * 0.03;
  return { t0, t1: t0 + 0.55 + 0.35 * r() + h.pos[1] * 0.8 };
}

// ---------------------------------------------------------------- the ant (it walks toward OpenAI's screen)
export const ANT_SPEED = 0.046;
const ANT_PATH = [[at('1-02'), 0.1, 0.44], [at('1-05', 0.95), 0.36, 0.27]];   // (v7) clear of the old pile: the card lands flat
export const CRUSH = at('1-05', 0.95);
export const ANT_CRUSH = [0.36, 0.27];
export const ANT_KING = 'openai';
const ANT2 = [[at('8-08') - 0.3, -0.2, 0.78], [at('9-01') + 0.3, 0.08, 0.66]];   // clear of the new pile
export function antAt(t) {
  if (t >= ANT2[0][0] && t < ANT2[1][0]) {
    const [ta, xa, za] = ANT2[0], [tb, xb, zb] = ANT2[1], u = (t - ta) / (tb - ta), dl = Math.hypot(xb - xa, zb - za);
    return { show: 1, speed: 1, alert: 0, crumb: 1, crumbTilt: 0, size: 1, look: null, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], pitch: 0, dist: (t - ta) * (dl / (tb - ta)), surface: 'cloth' };
  }
  if (t < at('1-02') - 0.01 || t >= CRUSH) return { show: 0 };
  const [ta, xa, za] = ANT_PATH[0], [tb, xb, zb] = ANT_PATH[1];
  const u = (t - ta) / (tb - ta), dl = Math.hypot(xb - xa, zb - za);
  return { show: 1, speed: 1, alert: 0, crumb: 1, crumbTilt: 0, size: 1, look: null, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], pitch: 0, dist: (t - ta) * ANT_SPEED, surface: 'cloth' };
}

// ---------------------------------------------------------------- every card played
// play = { who, style ('tap'|'hint'|'auto'|'red'|'smash'|'giant'|'chat'), tr (leaves the screen), t (lands), slot (0..5),
//          face, name, back, scale, glyph, writhe, gcell, red, dest ('heap'|'house'), at [x, z], yaw, top (flips the board) }
let PLAYS = null;
const r0 = mulberry32(2026);
function spot(t, sx, rnd) {
  // a neat pile while men play; a mound once the machines do
  const auto = clamp((t - AUTO.openai) / (STOP - AUTO.openai));
  // (v7) a mound, not a carpet: it stays between the screens (|x| < 0.5) and grows along the table and upward
  const sig = t < AUTO.openai ? 0.03 + 0.05 * clamp((t - at('3-05')) / 10) : 0.24 + 0.46 * auto;   // (v9) a wide, low mountain, not a column
  const a = rnd() * Math.PI * 2, d = t < AUTO.openai ? sig * Math.sqrt(rnd()) : sig * Math.pow(rnd(), 0.8);   // denser in the middle: a mound
  return [sx * 0.02 + Math.max(-0.45, Math.min(0.45, Math.cos(a) * d * 0.9)), 0.02 + Math.sin(a) * d * 1.9];
}
export const CHAT_T = at('2-05', 1.0);       // ChatGPT lands; the shockwave
function buildPlays() {
  const P = [];
  const add = (o) => {
    const sx = sxOf(o.who), style = o.style ?? 'tap';
    const flight = o.flight ?? (style === 'auto' || style === 'red' ? 0.5 : style === 'giant' ? 0.75 : 0.6);
    // (v8) cards he taps sit on the right half of his screen: his right hand never reaches across it (and the lens)
    const p = { slot: 2 + Math.floor(r0() * 3), scale: 1, glyph: 0, writhe: 0, back: backOf(o.who), dest: 'heap', ...o, style, flight };
    if (p.tr == null) p.tr = p.t - flight;
    if (p.dest === 'heap' && !p.at) p.at = spot(p.t, sx, mulberry32(Math.floor(p.t * 977) + 13));
    if (p.yaw == null) p.yaw = p.t < AUTO.openai ? -Math.PI / 2 + (mulberry32(Math.floor(p.t * 331))() - 0.5) * 0.5 : mulberry32(Math.floor(p.t * 331))() * Math.PI * 2;
    P.push(p);
    return p;
  };
  // ---- @1: old cards, lazily. OpenAI's lands on the ant
  for (const [who, k, face] of [['meta', at('1-02', 1.4), CELL.old3], ['mistral', at('1-03', 0.8), CELL.old0], ['xai', at('1-07', 1.2), CELL.old1], ['google', at('1-07', 2.6), CELL.old0]])
    add({ who, t: k, face, name: 'old', flight: 0.7 });
  add({ who: ANT_KING, t: CRUSH, face: CELL.old3, name: 'GPT-2', at: ANT_CRUSH.slice(), yaw: -Math.PI / 2 + 0.3, flight: 0.75, crush: true });
  // ---- @2: Google's AlphaGo (2-01, 2-02); OpenAI's ChatGPT (2-04 .. 2-05)
  add({ who: 'google', t: at('2-02', 0.5), tr: at('2-01', 2.0), face: CELL.old2, name: 'AlphaGo', slot: 4, at: [0.02, 0.03], yaw: -Math.PI / 2 + 0.15 });
  add({ who: 'openai', style: 'chat', t: CHAT_T, tr: at('2-04', 1.55), ...card('openai', 0), chat: true, slot: 0, at: [0, 0.02], yaw: -Math.PI / 2 });
  // ---- @3: the race. Each landing that claims #1 flips the board. US cards build the house; CN cards go to the pile
  const US = ['openai', 'xai', 'mistral'], CN = ['anthropic', 'google', 'meta', 'glm'];   // the right row builds the house
  const montage = [   // [who, v, tap time] — 3-01 cut 1 / 5 show the taps, cuts 2 / 6 the landings, cuts 3 / 7 the board
    ['openai', 1, at('3-01', 0.55), at('3-01', 1.55)], ['xai', 0, at('3-01', 2.55)], ['google', 1, at('3-01', 2.8)],
    ['anthropic', 1, at('3-01', 3.5), at('3-01', 4.15)], ['mistral', 1, at('3-01', 4.35)],
  ];
  const usV = { openai: 2, xai: 1, mistral: 2 };
  for (const [who, v, tr, top] of montage) add({ who, tr, t: tr + 0.65, ...card(who, v), top: top ?? true, dest: KING[who].side === 'US' ? 'house' : 'heap' });
  // the rest of the house, one card at a time; a run of #1s for the US (3-02)
  const nHouse = HOUSE_SLOTS.length - montage.filter((m) => KING[m[0]].side === 'US').length;
  const houseT0 = at('3-01', 0.2), houseT1 = at('3-02', 2.2);
  const usTops = { [Math.round(nHouse * 0.62)]: 1, [Math.round(nHouse * 0.74)]: 1, [Math.round(nHouse * 0.86)]: 1, [nHouse - 1]: 1 };
  for (let s = 0; s < nHouse; s++) {
    const who = US[s % 3], t_ = lerp(houseT0, houseT1, (s + 0.5) / nHouse);
    const t = t_ + (montage.some((m) => Math.abs(m[2] + 0.65 - t_) < 0.2) ? 0.22 : 0);
    const v = usTops[s] ? usV[who]++ : 1 + Math.floor(s / 10);
    add({ who, t, ...card(who, v), dest: 'house', top: !!usTops[s] });
  }
  for (let s = 0; s < 7; s++) { const who = CN[s % 4]; add({ who, t: at('3-01', 0.8 + s * 0.95), ...card(who, 1 + Math.floor(s / 5)) }); }
  // FatFish-R1 out of 大肥鱼's screen, straight into OpenAI's house
  add({ who: 'glm', style: 'smash', tr: SMASH.go, t: SMASH.hit + 0.35, ...card('glm', 3), scale: 1.35, at: [HOUSE.x + 0.2, HOUSE.z + 0.06], yaw: 0.2, top: at('3-04', 0.3) });
  // GPT-4.5: door-sized, out of OpenAI's screen, down on the pile
  add({ who: 'openai', style: 'giant', t: at('3-06', 2.2), tr: at('3-06', 0.75), face: CELL.gpt45, name: 'GPT-4.5', scale: 3.0, at: [0.04, 0.06], yaw: -Math.PI / 2 + 0.25, flight: 1.0, top: at('3-07', 0.3) });
  for (const id of IDS) { let tt = at('3-05', 0.1 + r0() * 0.4); while (tt < at('3-06', 0.3) || (tt > at('3-07') && tt < at('4-01', 0.2))) { add({ who: id, t: tt + 0.6, tr: tt, ...card(id, 2 + Math.floor(r0() * 2)) }); tt += 0.8 + r0() * 0.5; if (tt > at('3-06', 0.3) && tt < at('3-07')) tt = at('3-07', 0.1); } }
  // ---- @4: DeepSeek can't beat it (要不起); the hint (4-02, 4-03); OpenAI's hint (4-04); everyone's (4-05)
  HINTS.anthropic = [[at('4-02', 0.7), 4]]; HINTS.openai = [[at('4-04', 1.0), 3]];
  add({ who: 'anthropic', style: 'hint', tr: at('4-02', 1.45), t: at('4-03', 0.25), slot: 4, ...card('anthropic', 3), scale: 1.1, top: at('4-03', 0.45) });
  add({ who: 'openai', style: 'hint', tr: at('4-04', 1.5), t: at('4-04', 2.0), slot: 3, ...card('openai', 4), scale: 1.1, top: true });
  const hintV = {};
  for (const id of IDS) {
    let tt = at('4-05', 0.2 + r0() * 0.6);
    while (tt < SEMI[id] - 0.6) {
      const slot = 2 + Math.floor(r0() * 3); (HINTS[id] ??= []).push([tt - 0.42, slot]);
      hintV[id] = (hintV[id] ?? 0) + 1;
      add({ who: id, style: 'hint', tr: tt, t: tt + 0.55, slot, ...card(id, realV(id, 3 + (hintV[id] % (REAL_N[id] - 3)))), scale: 1.15, top: true });
      tt += lerp(1.3, 0.6, clamp((tt - at('4-05')) / 4)) + r0() * 0.3;
    }
  }
  // ---- @5: 半托管. The AI picks, he taps 确认; faster as the countdown shrinks. The holdouts never stop confirming
  for (const id of IDS) {
    const end = id === 'openai' ? TIMEOUT.openai[0] - 0.15 : AUTO[id] < 1e9 ? AUTO[id] - 0.6 : OUT[id].pass[0] - 0.35;   // (v11) nothing flies over the offer while we read it
    let tt = SEMI[id] + 0.45, k = 0;
    while (tt < end) {
      add({ who: id, style: 'semi', tr: tt, t: tt + 0.55, ...card(id, realV(id, REAL_N[id] - 1 - (k % 2))), scale: 1.1, top: HOLD.includes(id) ? tt < NOW - 2 && r0() < 0.2 : FINAL.includes(id) ? k % 2 === 0 : r0() < 0.25 });
      tt += clamp(limitAt(tt) * 0.28 + 0.36, 0.42, 1.9) * (0.85 + 0.3 * r0()); k++;
    }
  }
  // ---- @5 →: auto. Each screen plays by itself, faster and faster; from RED_T the internal ones (red stamps)
  const nextK = {};
  for (const id of IDS) {
    if (HOLD.includes(id)) continue;
    let tt = AUTO[id] + 0.35, n = 0;
    const lead = FINAL.includes(id), L = MODELS[id].length;
    while (tt < STOP) {
      const p = clamp((tt - AUTO.openai) / (STOP - AUTO.openai));
      const red = tt > RED_T && (lead || r0() < 0.6);
      const f = Math.floor(r0() * 2);
      const c = red ? { face: CELL[`future_${id}_${f}`], name: FUTURE[id][f] } : { ...card(id, REAL_N[id] + (n % 2)), name: nextName(id, Math.floor((nextK[id] = (nextK[id] ?? -1) + 1) / 3)) };
      add({ who: id, style: red ? 'red' : 'auto', tr: tt, t: tt + 0.45 + 0.1 * r0(), slot: Math.floor(r0() * 5), ...c, red,
        scale: 1.15 + 0.45 * p, glyph: red ? clamp((tt - CUES.blizzard) / 2.5) : 0, writhe: red ? 0.6 : clamp(p * 1.2), gcell: CELL[`glyph${Math.floor(r0() * 16)}`], top: lead || r0() < 0.3 });
      const rate = (lead ? 1.2 : 0.55) + p * p * (lead ? 5 : 1.4) + (tt > CUES.blizzard ? (lead ? 4 : 0.8) : 0);
      tt += (1 / rate) * (0.7 + 0.6 * r0()); n++;
    }
  }
  P.sort((a, b) => a.t - b.t);
  P.forEach((p, i) => { p.i = i; });
  return P;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }

// ---------------------------------------------------------------- the #1 board
// rows: the big bottom row is the current #1; the rows above it, the ones it pushed off (most recent lowest)
export const BOARD_ROWS = 12;
let BOARDH = null;
export function boardTops() {
  if (BOARDH) return BOARDH;
  const E = [{ t: -10, name: 'Deep Blue', date: '1997·05' }, { t: -9, name: 'Watson', date: '2011·02' }];
  E.push({ t: at('2-03', 0.35), name: 'AlphaGo', who: 'google', date: '2016·03' }, { t: at('2-07', 0.3), name: 'ChatGPT', who: 'openai', date: '2022·11' });
  let last = -1;
  for (const p of plays()) {
    if (!p.top || p.chat) continue;
    let t = typeof p.top === 'number' ? p.top : p.t + 0.12;
    if (t >= STOP) continue;
    const gap = t > RED_T ? 0.8 : t > AUTO.openai ? 0.6 : 0.3;
    if (t - last < gap) { if (typeof p.top === 'number') t = last + 0.3; else continue; }
    if (t > at('6-02', -0.6) && t < at('6-03', 0.2)) continue;
    if (E[E.length - 1].name === p.name) continue;
    E.push({ t, name: p.name, who: p.who, date: t >= NOW ? dateText(monthsAfterNow(t)) : p.date }); last = t;
  }
  E.push({ t: at('6-02', 0.05), name: FUTURE.openai[0], who: 'openai' }, { t: at('6-02', 0.85), name: FUTURE.anthropic[0], who: 'anthropic' });
  E.push({ t: NOW, name: null, date: dateText(0) });
  E.sort((a, b) => a.t - b.t);
  // the date never goes back (the cards' own dates are not in order); a date-only entry keeps the last #1
  let d = '1997·05', nm = 'Deep Blue';
  for (const e of E) { if (e.date && e.date > d) d = e.date; if (e.t >= CUES.red) d = dateText(30); e.date = d; if (e.name == null) { e.name = nm; e.dateOnly = 1; } nm = e.name; }
  BOARDH = E;
  return E;
}
let BOARDROWS = null;
export function boardRows() {
  if (BOARDROWS) return BOARDROWS;
  const E = boardTops(), R = Array.from({ length: BOARD_ROWS }, () => []);
  // row 0: the date; rows 1 .. 10: the #1s it pushed off (most recent lowest); row 11: the #1
  const L = E.filter((e) => !e.dateOnly);
  E.forEach((e) => { R[0].push({ t: e.t, text: `      ${e.date}` }); });
  L.forEach((e, k) => {
    R[BOARD_ROWS - 1].push({ t: e.t, text: `#1 ${e.name}` });
    for (let r = 1; r < BOARD_ROWS - 1; r++) { const j = k - (BOARD_ROWS - 1 - r); R[r].push({ t: e.t + 0.03 * (BOARD_ROWS - 1 - r), text: j >= 0 ? `   ${L[j].name}` : '' }); }
  });
  BOARDROWS = R;
  return R;
}

// ---------------------------------------------------------------- the heap: before ChatGPT (blown away) and after
export const PLAZA = { x: 0.04, z: -0.02 };
let HEAP = null;
function buildHeapData() {
  const pre = [], D = [];
  const rnd = mulberry32(31337);
  pre.push({ t: -1, x: 0.02, z: 0.01, yaw: -Math.PI / 2 + 0.2, scale: 1, up: true, face: CELL.old0, back: CELL.backBlack, air: 0 });
  pre.push({ t: -1, x: -0.03, z: 0.03, yaw: -Math.PI / 2 - 0.15, scale: 1, up: true, face: CELL.old1, back: CELL.backBlack, air: 0 });
  { const ro = mulberry32(77); for (let k = 0; k < 16; k++) { const a = ro() * 6.28, d = 0.03 + 0.11 * Math.sqrt(ro()); pre.push({ t: -1 + k * 0.01, x: Math.cos(a) * d, z: 0.02 + Math.sin(a) * d, yaw: ro() * 6.28, scale: 1, up: ro() > 0.2, face: CELL[`old${k % 4}`], back: CELL.backBlack, air: 0.0004 }); } }
  for (const p of plays()) {
    if (p.dest !== 'heap') continue;
    const d = { t: p.t, x: p.at[0], z: p.at[1], yaw: p.yaw, scale: p.scale, up: true, face: p.face, back: p.back, glyph: p.glyph, writhe: p.writhe, gcell: p.gcell, red: p.red, play: p, air: p.chat ? 0.0 : p.style === 'auto' || p.style === 'red' ? 0.001 + 0.002 * rnd() : 0.0004 };
    (p.t < CHAT_T ? pre : D).push(d);
  }
  const housePlays = plays().filter((q) => q.dest === 'house');
  for (let s = 0; s < HOUSE_SLOTS.length; s++) {
    const p = housePlays[s] ?? housePlays[housePlays.length - 1];
    const h = HOUSE_SLOTS[s], rr = mulberry32(400 + s * 17), f = houseFall(s);
    const dx = h.pos[0] - HOUSE_HIT[0] + 0.25, dz = h.pos[2] - HOUSE_HIT[2] + (rr() - 0.5) * 0.5, dl = Math.hypot(dx, dz) || 1;
    const go = 0.12 + rr() * 0.3 + h.pos[1] * 0.6;
    D.push({ t: f.t1, x: Math.min(0.62, h.pos[0] + (dx / dl) * go * 0.6), z: HOUSE.z + (dz / dl) * go, yaw: rr() * 6.28, scale: 1, up: rr() > 0.3, face: p.face, back: p.back, play: p, house: s, air: 0.001 });
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
export const GIANT_END = { scale: 30, from: 9.0, t0: at('8-04', 0.1), to: 4.7, x: 1.15 };   // (v9) above the lamp chain, off its axis   // (v8) we cut to black while it is still above the lamp
export function giantEndY(t) { const u = clamp((t - GIANT_END.t0) / (BLACK - GIANT_END.t0)); return lerp(GIANT_END.from, GIANT_END.to, 1 - (1 - u) * (1 - u) * (1 - 0.35 * u)); }
// the #1 at time t: { t, name, who } (who is undefined before the kings play)
export function topAt(t) { const E = boardTops(); let e = E[0]; for (const x of E) { if (x.t > t) break; e = x; } return e; }

// ---------------------------------------------------------------- (v8) the AI 智力排行榜
// Every #1 on the old board is now a row overtaking the others on a scored leaderboard. A new #1 scores just above the
// best: by whole points at first, by hundredths by 2026 (the fight over decimals); from 2026·11 (托管) the machines'
// own cards jump far past the human line (100); their internal cards read ∞.
let LB = null;
function bump(date, max, t) {
  if (t >= RED_T) return Infinity;
  if (t >= NOW) return max * (1.18 + 0.5 * clamp((t - NOW) / (RED_T - NOW))) + 3;
  const [y, m] = date.split('·').map(Number), mo = (y - 2022) * 12 + (m || 1) - 11;
  if (mo < 0) return max + 13;                                   // AlphaGo over Watson
  const target = 100 - 30 * Math.pow(0.5, mo / 7);               // 70 at ChatGPT .. 99.7 by 2026·10
  const eps = y < 2024 ? 1.2 : y < 2025 ? 0.4 : y < 2026 ? 0.08 : 0.01 + 0.01 * ((Math.round(max * 1000) % 3));
  return Math.min(99.99, Math.max(max + eps, target));
}
export function leaderTimeline() {
  if (LB) return LB;
  const E = boardTops().filter((e) => !e.dateOnly);
  const S = { ibm: { model: 'Watson', score: 35 } };
  const snaps = [];
  const order = () => Object.keys(S).sort((a, b) => (S[a].out ? 1 : 0) - (S[b].out ? 1 : 0) || S[b].score - S[a].score);
  const snap = (t) => snaps.push({ t, order: order(), data: JSON.parse(JSON.stringify(S, (k, v) => (v === Infinity ? 'Infinity' : v))) });
  snap(-20);
  // everyone at the table joins the board when the race starts (below ChatGPT, in seat order)
  let joined = false;
  const events = E.map((e) => ({ ...e, kind: 'top' }));
  for (const id of HOLD) events.push({ t: OUT[id].out, who: id, kind: 'out' });
  // every other card laid down also moves its company up the board (never past the #1): the field bunches up
  for (const p of plays()) if (p.t > CUES.race && p.t < RED_T && !p.top && !p.chat && p.dest !== 'house' && p.date && p.who) events.push({ t: p.t + 0.1, who: p.who, kind: 'play', name: p.name, date: p.date, auto: p.style === 'auto' });
  events.push({ t: CUES.race - 0.2, kind: 'join' });
  events.sort((a, b) => a.t - b.t);
  for (const e of events) {
    if (e.kind === 'join') {
      if (!joined) { joined = true; IDS.forEach((id, i) => { if (!S[id]) S[id] = { model: MODELS[id][0].name, score: 52 + ((i * 7) % 11) }; }); delete S.ibm; }
      snap(e.t); continue;
    }
    if (e.kind === 'out') { if (S[e.who]) S[e.who].out = 1; snap(e.t); continue; }
    if (e.kind === 'play') {
      if (!joined || !S[e.who] || S[e.who].out || (e.t >= NOW && HOLD.includes(e.who))) continue;   // by hand you stay under the line
      const max = Math.max(...Object.values(S).filter((x) => !x.out).map((x) => x.score)), r = mulberry32(Math.floor(e.t * 97))();
      const sc = e.t >= NOW ? max * (0.25 + 0.6 * r) : Math.min(max - 0.03 - 0.3 * r * (100 - max) / 10, bump(e.date, 0, e.t) - 0.5 - 2 * r);
      if (sc > S[e.who].score) { S[e.who] = { ...S[e.who], model: e.name, score: sc }; snap(e.t); }
      continue;
    }
    if (e.t < -5) continue;
    const who = e.who ?? 'ibm';
    const max = Math.max(...Object.values(S).filter((x) => !x.out).map((x) => x.score));
    S[who] = { ...(S[who] ?? {}), model: e.name, score: bump(e.date ?? '2016', max, e.t) };
    snap(e.t);
  }
  for (const s of snaps) for (const id in s.data) if (s.data[id].score === 'Infinity') s.data[id].score = Infinity;
  LB = snaps;
  return LB;
}
export function leaderAt(t) {
  const L = leaderTimeline();
  let k = 0; for (let i = 0; i < L.length; i++) if (L[i].t <= t) k = i;
  const cur = L[k], prev = L[Math.max(0, k - 1)], u = clamp((t - cur.t) / 0.12), e = u * u * (3 - 2 * u);
  const rows = cur.order.map((id, i) => {
    const pi = prev.order.indexOf(id), d = cur.data[id], pd = prev.data[id];
    const score = pd && Number.isFinite(d.score) && Number.isFinite(pd.score) ? lerp(pd.score, d.score, clamp(u * 1.6)) : d.score;
    const mover = pi > i && cur.order[i] === cur.order.find((x, j) => prev.order.indexOf(x) - j === Math.max(...cur.order.map((y, jj) => prev.order.indexOf(y) - jj)));
    return { who: id, model: d.model, score, y: pi < 0 || !mover ? i : lerp(pi, i, e), rank: i + 1, out: d.out ? 1 : 0, glitch: 0 };
  });
  const top = cur.order[0], prevTop = prev.order[0];
  return { rows, date: topAt(t).date, flash: top !== prevTop ? (1 - u) : 0, red: t >= RED_T ? 1 : 0 };
}
