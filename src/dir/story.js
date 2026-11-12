import { basisQ } from '../freecards.js';
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
// (v19) the cards that stay in his hand all film (slots 0..3 when nothing else is there): his small, older models
export const MINOR = {
  openai: ['GPT-3.5', 'GPT-4 Turbo', 'GPT-4o mini', 'o1-mini'], anthropic: ['Claude Instant', 'Claude 2', 'Claude 3 Haiku', 'Claude 3 Sonnet'],
  google: ['PaLM 2', 'Gemini Nano', 'Gemini 1.0 Pro', 'Gemini 1.5 Flash'], xai: ['Grok-0', 'Grok-1.5', 'Grok-2 mini', 'Grok-1.5V'],
  meta: ['Llama 2 7B', 'Code Llama', 'Llama 3 8B', 'Llama 3.2'], mistral: ['Mistral Tiny', 'Mistral Small', 'Codestral', 'Mistral NeMo'],
  glm: ['FatFish Lite', 'FatFish Mini', 'FatFish Air', 'FatFish Flash'],
};
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
export function limitAt(t) { if (t < CUES.chat) return 60; if (t < CUES.race) return 30; if (t < LIMIT0) return 30 * Math.pow(10 / 30, clamp((t - CUES.race) / (LIMIT0 - CUES.race))); return 10 * Math.pow(0.3 / 10, clamp((t - LIMIT0) / (LIMIT1 - LIMIT0))); }
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
  meta: { pass: [at('5-07', 2.0), at('5-07', 2.6)], out: at('5-07', 3.15), drag: [at('5-08', 0.35), at('5-08', 2.7)] },
  mistral: { pass: [at('5-09', 0.12)], out: at('5-09', 0.4), drag: [at('5-09', 0.45), at('5-09', 2.15)] },
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
export const PASS = { t0: at('4-01', 0.85), taps: [[at('4-01', 0.85), 2], [at('4-01', 1.6), 3]] };   // 要不起: it shows when he tries a card
// the dates on the board: real ones from the cards; from 2026·11 the machines' calendar runs away
export function monthsAfterNow(t) { return t < NOW ? 0 : Math.floor(30 * Math.pow(clamp((t - NOW) / (CUES.red - NOW)), 1.5)); }
export function dateText(m0) { const m = 2026 * 12 + 10 + m0; return `${Math.floor(m / 12)}·${String((m % 12) + 1).padStart(2, '0')}`; }
export const HINTS = {};                     // [press time, slot] per king
export const BLACK = CUES.black;             // the cut to black, just before the last card lands
export const SLAM = at('8-06', 0.45);        // heard in the black
// (v19) the credits: the list prints (a line every `step`); the round timer's three ticks; the time-out; the last card
export const CREDITS = { list0: at('9-02', 0.15), step: 0.1, n: 10, count: [0, 0.38, 0.76].map((k) => at('9-03', k)), out: at('9-03', 1.14), hit: at('9-03', 1.9) };
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
export const SMASH = { go: at('3-03', 0.75), hit: at('3-03', 3.3) };   // (v8) slow enough to read: FatFish-R1, flat, across the table
export const TOWER = [0.05, 0.03];
export const HOUSE_HIT = [0.05, 0.075, 0.03];   // (v13) no house: FatFish-R1 lands on top of the pile
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
    return { show: 1, speed: 1, alert: 0, crumb: 0, crumbTilt: 0, size: 1, look: null, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], pitch: 0, dist: (t - ta) * (dl / (tb - ta)), surface: 'cloth' };
  }
  if (t < at('1-02') - 0.01 || t >= CRUSH) return { show: 0 };
  const [ta, xa, za] = ANT_PATH[0], [tb, xb, zb] = ANT_PATH[1];
  const u = (t - ta) / (tb - ta), dl = Math.hypot(xb - xa, zb - za);
  return { show: 1, speed: 1, alert: 0, crumb: 0, crumbTilt: 0, size: 1, look: null, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], pitch: 0, dist: (t - ta) * ANT_SPEED, surface: 'cloth' };
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
  const sig = t < AUTO.openai ? 0.03 + 0.05 * clamp((t - at('3-05')) / 10) : 0.13 + 0.2 * Math.sqrt(auto);   // (v19) a mound that climbs, not a carpet
  const a = rnd() * Math.PI * 2, d = t < AUTO.openai ? sig * Math.sqrt(rnd()) : sig * Math.pow(rnd(), 0.8);   // denser in the middle: a mound
  return [sx * 0.02 + Math.max(-0.45, Math.min(0.45, Math.cos(a) * d * 0.95)), 0.02 + Math.sin(a) * d * (t < AUTO.openai ? 1.9 : 1.45)];
}
export const CHAT_T = at('2-05', 1.0);       // ChatGPT lands; the shockwave
function buildPlays() {
  const P = [], slotK = {};
  const add = (o) => {
    const sx = sxOf(o.who), style = o.style ?? 'tap';
    const flight = o.flight ?? (style === 'auto' || style === 'red' ? 0.5 : style === 'giant' ? 0.75 : 0.6);
    // (v19) his hand: slots 0..3 his own cards (he plays from 2..4, the right half: the arm never crosses the glass);
    // slot 4 is where the card the AI suggests appears (every hint, every AI pick)
    const man = style !== 'auto' && style !== 'red';
    const k = man && o.slot == null && !o.fresh ? (slotK[o.who] = (slotK[o.who] ?? -1) + 1) : 0; r0();
    const p = { slot: o.fresh ? 4 : 2 + (k % 3), scale: 1, glyph: 0, writhe: 0, back: backOf(o.who), dest: 'heap', ...o, style, flight };
    if (p.tr == null) p.tr = p.t - flight;
    if (p.dest === 'heap' && !p.at) p.at = spot(p.t, sx, mulberry32(Math.floor(p.t * 977) + 13));
    if (p.yaw == null) p.yaw = p.t < AUTO.openai ? -Math.PI / 2 + (mulberry32(Math.floor(p.t * 331))() - 0.5) * 0.5 : mulberry32(Math.floor(p.t * 331))() * Math.PI * 2;
    P.push(p);
    return p;
  };
  // ---- @1: old cards, lazily. OpenAI's lands on the ant
  // (v13) dates only go forward: AlphaGo 2016 (Google) .. GPT-2 2019 (OpenAI, on the ant) .. GPT-3 2020 .. LaMDA 2021 .. ChatGPT 2022
  add({ who: 'google', t: at('1-02', 1.4), face: CELL.old0, name: 'AlphaGo', flight: 0.7, slot: 3 });
  add({ who: 'openai', t: at('1-07', 1.4), face: CELL.old2, name: 'GPT-3', flight: 0.7, slot: 3 });
  add({ who: ANT_KING, t: CRUSH, face: CELL.old3, name: 'GPT-2', slot: 2, at: ANT_CRUSH.slice(), yaw: -Math.PI / 2 + 0.3, flight: 0.75, crush: true });
  // ---- @2: Google's LaMDA (2-01, 2-02); OpenAI's ChatGPT (2-04 .. 2-05)
  add({ who: 'google', t: at('2-02', 0.5), tr: at('2-01', 2.0), face: CELL.old1, name: 'LaMDA', slot: 4, at: [0.02, 0.03], yaw: -Math.PI / 2 + 0.15 });
  add({ who: 'openai', style: 'chat', t: CHAT_T, tr: at('2-04', 1.55), ...card('openai', 0), chat: true, slot: 2, at: [0, 0.02], yaw: -Math.PI / 2 });
  // ---- @3: the race (v19): every model of 2023 and 2024, each played once, in the order they were released. One card
  // on the tower every quarter second; nobody plays two within half a second. 3-01 cut 1 is OpenAI's tap (GPT-4), cut 5
  // Claude's (Claude 3); cuts 3 and 7 are the board
  const RACE = [['meta', 0], ['openai', 1], ['anthropic', 0], ['google', 0], ['meta', 1], ['mistral', 0], ['xai', 0], ['glm', 0], ['google', 1], ['mistral', 1], ['google', 2],
    ['mistral', 2], ['anthropic', 1], ['meta', 2], ['glm', 1], ['anthropic', 2], ['meta', 3], ['mistral', 3], ['xai', 1], ['openai', 2], ['google', 3], ['glm', 2], ['openai', 3]];
  const iG = 1, iC = 12, iN = RACE.length - 1, T_G = 0.55, T_C = 3.5, T_N = 5.9;
  const raceT = (i) => (i <= iC ? T_G + ((i - iG) * (T_C - T_G)) / (iC - iG) : T_C + ((i - iC) * (T_N - T_C)) / (iN - iC));
  const raceTop = { 'openai1': at('3-01', 1.55), 'google2': true, 'anthropic1': at('3-01', 4.15), 'anthropic2': true, 'openai2': true, 'openai3': true };
  RACE.forEach(([who, v], i) => { const tr = at('3-01', raceT(i)); add({ who, tr, t: tr + 0.65, ...card(who, v), top: raceTop[who + v] ?? false, fill: i === iG || i === iC ? 0 : 1 }); });
  // FatFish-R1 out of 大肥鱼's screen, flat across the table, through the tower
  add({ who: 'glm', style: 'smash', tr: SMASH.go, t: SMASH.hit + 0.35, ...card('glm', 3), scale: 1.6, slot: 3, at: [0.05, 0.03], yaw: -Math.PI / 2 + 0.2, top: at('3-04', 0.3) });
  // GPT-4.5: door-sized, out of OpenAI's screen, down on the pile
  add({ who: 'openai', style: 'giant', t: at('3-06', 2.2), tr: at('3-06', 0.75), face: CELL.gpt45, name: 'GPT-4.5', date: '2025·02', scale: 3.0, slot: 3, at: [0.04, 0.06], yaw: -Math.PI / 2 + 0.25, flight: 1.0, top: at('3-07', 0.3) });
  // (v19) after the smash nobody plays: they stare; OpenAI answers with the giant; Claude has nothing that beats it (4-01)
  // ---- @4: the hint does not light a card he had: it makes one. It appears, glowing, in the empty slot; he taps it
  add({ who: 'anthropic', style: 'hint', hintT: at('4-02', 0.7), fresh: 1, tr: at('4-02', 1.45), t: at('4-03', 0.25), ...card('anthropic', 3), scale: 1.1, top: at('4-03', 0.45) });
  add({ who: 'openai', style: 'hint', hintT: at('4-04', 1.0), fresh: 1, tr: at('4-04', 1.5), t: at('4-04', 2.0), ...card('openai', 4), scale: 1.1, top: true });
  const hintV = { anthropic: 0, openai: 1 };
  for (const id of IDS) {
    let tt = at('4-05', (FINAL.includes(id) ? 0.55 : 0.25) + r0() * 0.6);
    while (tt < SEMI[id] - 0.6) {
      r0();
      hintV[id] = (hintV[id] ?? 0) + 1;
      add({ who: id, style: 'hint', hintT: tt - 0.45, fresh: 1, tr: tt, t: tt + 0.55, ...card(id, Math.min(REAL_N[id] - 1, 3 + hintV[id])), scale: 1.15, top: true, fill: 1 });
      tt += lerp(1.35, 0.9, clamp((tt - at('4-05')) / 4)) + r0() * 0.3;
    }
  }
  // ---- @5: 半托管. The AI picks (its card appears in the AI slot), he taps it; faster as the countdown shrinks. The
  // holdouts never stop confirming
  for (const id of IDS) {
    const end = id === 'openai' ? TIMEOUT.openai[0] - 0.15 : AUTO[id] < 1e9 ? AUTO[id] - 0.6 : OUT[id].pass[0] - 0.35;   // (v11) nothing flies over the offer while we read it
    let tt = SEMI[id] + 0.45, k = 0;
    while (tt < end) {
      add({ who: id, style: 'semi', fresh: 1, tr: tt, t: tt + 0.55, ...card(id, realV(id, REAL_N[id] - 1 - (k % 2))), scale: 1.1, top: HOLD.includes(id) ? tt < NOW - 2 && r0() < 0.2 : FINAL.includes(id) ? k % 2 === 0 : r0() < 0.25 });
      tt += clamp(limitAt(tt) * 0.28 + 0.36, 0.5, 1.9) * (0.85 + 0.3 * r0()); k++;
    }
  }
  // ---- @5 →: auto. Each screen plays by itself, faster and faster; from RED_T the internal ones (red stamps), out of
  // the bottom row, one slot after another
  const nextK = {}, redK = {};
  for (const id of IDS) {
    if (HOLD.includes(id)) continue;
    let tt = AUTO[id] + 0.35, n = 0;
    const lead = FINAL.includes(id);
    while (tt < STOP) {
      const p = clamp((tt - AUTO.openai) / (STOP - AUTO.openai));
      const red = tt > RED_T && (lead || r0() < 0.6);
      const f = Math.floor(r0() * 2);
      const c = red ? { face: CELL[`future_${id}_${f}`], name: FUTURE[id][f] } : { ...card(id, REAL_N[id] + (n % 2)), name: nextName(id, (nextK[id] = (nextK[id] ?? -1) + 1)) };
      const sl = Math.floor(r0() * 5); r0();
      const calm = id === FINAL[0] && tt > CUES.red - 0.7 && tt <= RED_T;
      // (v19) clean faces (no machine script on them), all one size
      if (!calm) add({ who: id, style: red ? 'red' : 'auto', tr: tt, t: tt + 0.45 + 0.1 * r0(), slot: red ? (redK[id] = (redK[id] ?? -1) + 1) % 6 : sl, ...c, red, scale: 1.12, top: lead || r0() < 0.3 });
      if (!calm && tt > CUES.allAuto - 1) { const dt = 0.07 + 0.1 * r0(); add({ who: id, style: red ? 'red' : 'auto', ghost: 1, tr: tt + dt, t: tt + dt + 0.45 + 0.1 * r0(), slot: red ? (redK[id] % 6) : sl, ...c, red, scale: 1.12, top: false }); }
      const rate = (lead ? 1.2 : 0.55) + p * p * (lead ? 5 : 1.4) + (tt > CUES.blizzard ? (lead ? 4 : 0.8) : 0);
      tt += (1 / rate) * (0.7 + 0.6 * r0()); n++;
    }
  }
  // (v19) one press, one card: a filler that would need the hand again too soon is not played at all
  const NEAR = 0.38, man = (p) => p.style !== 'auto' && p.style !== 'red';
  const keep = [];
  for (const p of P.filter(man).sort((x, y) => (x.fill ?? 0) - (y.fill ?? 0) || x.tr - y.tr)) {
    const t0 = (p.hintT ?? p.tr) - 0.04, t1 = p.tr;
    const clash = keep.some((q) => q.who === p.who && t0 < q.tr + NEAR && (q.hintT ?? q.tr) - 0.04 < t1 + NEAR);
    // 大肥鱼 plays nothing for a moment before his jab
    const quiet = p.who === 'glm' && p.tr > SMASH.go - 1.6 && p.tr < SMASH.hit;
    if (p.fill && (clash || quiet)) { p.drop = 1; continue; }
    keep.push(p);
  }
  const Q = P.filter((p) => !p.drop);
  // (v19) the machines' mountain: a cone that widens as it grows (its foot goes as the cube root of the cards in it), the
  // cards thickest in the middle. Slopes a card can lie on, not a column
  { const rm = mulberry32(4242); let n = 0;
    for (const p of Q.filter((q) => q.style === 'auto' || q.style === 'red').sort((x, y) => x.t - y.t)) {
      const A = 0.07 * Math.cbrt(n + 25), u = [rm(), rm(), rm()].sort((x, y) => x - y)[1], ang = rm() * Math.PI * 2; n++;
      p.at = [0.03 + Math.cos(ang) * u * A, 0.03 + Math.sin(ang) * u * A * 1.5]; p.cone = { A, u, ang };
    } }
  for (const id in HINTS) delete HINTS[id];
  for (const p of Q) if (p.hintT != null) (HINTS[p.who] ??= []).push([p.hintT, p.slot]);
  for (const id in HINTS) HINTS[id].sort((x, y) => x[0] - y[0]);
  Q.sort((x, y) => x.t - y.t);
  Q.forEach((p, i) => { p.i = i; });
  return Q;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }

// ---------------------------------------------------------------- the #1 board
// rows: the big bottom row is the current #1; the rows above it, the ones it pushed off (most recent lowest)
export const BOARD_ROWS = 12;
let BOARDH = null;
export function boardTops() {
  if (BOARDH) return BOARDH;
  const E = [{ t: -10, name: 'Deep Blue', date: '1997·05' }, { t: -9, name: 'Watson', date: '2011·02' }];
  E.push({ t: at('1-02', 1.5), name: 'AlphaGo', who: 'google', date: '2016·03' }, { t: CRUSH + 0.1, name: 'GPT-2', who: 'openai', date: '2019·02' }, { t: at('1-07', 1.5), name: 'GPT-3', who: 'openai', date: '2020·06' },
    { t: at('2-03', 0.35), name: 'LaMDA', who: 'google', date: '2021·05' }, { t: at('2-07', 0.3), name: 'ChatGPT', who: 'openai', date: '2022·11' });
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
  pre.push({ t: -1, x: 0.02, z: 0.01, yaw: -Math.PI / 2 + 0.2, scale: 1, up: true, face: CELL.old4, back: CELL.backBlack, air: 0 });
  pre.push({ t: -1, x: -0.03, z: 0.03, yaw: -Math.PI / 2 - 0.15, scale: 1, up: true, face: CELL.old5, back: CELL.backBlack, air: 0 });
  { const ro = mulberry32(77); for (let k = 0; k < 16; k++) { const a = ro() * 6.28, d = 0.03 + 0.11 * Math.sqrt(ro()); pre.push({ t: -1 + k * 0.01, x: Math.cos(a) * d, z: 0.02 + Math.sin(a) * d, yaw: ro() * 6.28, scale: 1, up: ro() > 0.2, face: CELL[`old${4 + (k % 2)}`], back: CELL.backBlack, air: 0.0004 }); } }
  // (v14) the race: every card of it goes on one tower on top of ChatGPT (a crooked stack of #1s). FatFish-R1 goes
  // through it flat; the cards fly (most toward the foot of the table, some off it) and land where the heap puts them
  const tower = [], cone = [];
  let lx = 0, lz = 0;
  for (const p of plays()) {
    if (p.dest !== 'heap') continue;
    const d = { t: p.t, x: p.at[0], z: p.at[1], yaw: p.yaw, scale: p.scale, up: p.style === 'auto' || p.style === 'red' ? rnd() > 0.22 : true, face: p.face, back: p.back, glyph: p.glyph, writhe: p.writhe, gcell: p.gcell, red: p.red, play: p, air: p.chat ? 0.0 : 0.0004, grow: p.style === 'auto' || p.style === 'red' ? 1 : 0 };
    if (p.t > CHAT_T && p.t < SMASH.hit && !p.chat) { d.towerK = tower.length; tower.push(d); continue; }
    if (p.cone) {
      // (v19) the mountain: where the cone's surface is when this card lands, lying on its slope (28 degrees, less near the top)
      const { A, u, ang } = p.cone, K = 0.53, rr = mulberry32(7000 + cone.length * 13), k = Math.min(1, u / 0.22) * K;
      const n = [k * Math.cos(ang) + (rr() - 0.5) * 0.24, 1, (k * Math.sin(ang)) / 1.5 + (rr() - 0.5) * 0.24], nl = Math.hypot(...n), nn = n.map((v) => v / nl), face = d.up ? nn : nn.map((v) => -v);
      const yw = rr() * Math.PI * 2;
      d.rest = { pos: [d.x, 0.014 + K * A * (1 - u) + 0.004 * rr() + (CARD.T * d.scale) / 2, d.z], q: basisQ(face, [Math.cos(yw), 0, Math.sin(yw)]), n: face };
      cone.push(d); continue;
    }
    (p.t < CHAT_T ? pre : D).push(d);
  }
  tower.sort((a, b) => a.t - b.t);
  tower.forEach((d, k) => {
    const rr = mulberry32(600 + k * 31), N = tower.length;
    lx += (rr() - 0.5) * 0.005; lz += (rr() - 0.5) * 0.005;
    const yaw = -Math.PI / 2 + (rr() - 0.5) * 0.7;
    d.restTower = { pos: [TOWER[0] + lx + (rr() - 0.5) * 0.022, CARD_Y + CARD.T * 1.6 + k * 0.0043, TOWER[1] + lz + (rr() - 0.5) * 0.022], q: basisQ([0, 1, 0], [Math.cos(yaw), 0, Math.sin(yaw)]) };
    const gone = k % 4 === 3, ang = Math.PI / 2 + (rr() - 0.5) * (gone ? 1.1 : 2.6), dist = gone ? 2.6 + 1.6 * rr() : 0.22 + 0.5 * rr() + 0.3 * (k / N);
    const x1 = gone ? TOWER[0] + Math.cos(ang) * dist : Math.max(-0.62, Math.min(0.62, TOWER[0] + Math.cos(ang) * dist)), z1 = TOWER[1] + Math.sin(ang) * dist * (gone ? 1 : 1.35);
    const t0 = SMASH.hit + 0.012 + 0.0025 * k, dur = gone ? 1.1 + 0.4 * rr() : 0.5 + 0.4 * rr();
    d.sc = { t0, t1: t0 + dur, h: (gone ? 0.35 : 0.14) + 0.3 * rr() + 0.22 * (k / N), turns: (1 + Math.floor(rr() * 3)) * (rr() > 0.5 ? 1 : -1), axis: [Math.sin(ang), 0, -Math.cos(ang)], gone, end: [x1, gone ? -0.6 : 0, z1] };
    if (!gone) D.push({ t: d.sc.t1, x: x1, z: z1, yaw: rr() * 6.28, scale: 1, up: rr() > 0.35, air: 0.001, proxyOf: d });
  });
  const housePlays = plays().filter((q) => q.dest === 'house');
  for (let s = 0; s < (housePlays.length ? HOUSE_SLOTS.length : 0); s++) {
    const p = housePlays[s] ?? housePlays[housePlays.length - 1];
    const h = HOUSE_SLOTS[s], rr = mulberry32(400 + s * 17), f = houseFall(s);
    const dx = h.pos[0] - HOUSE_HIT[0] + 0.25, dz = h.pos[2] - HOUSE_HIT[2] + (rr() - 0.5) * 0.5, dl = Math.hypot(dx, dz) || 1;
    const go = 0.12 + rr() * 0.3 + h.pos[1] * 0.6;
    D.push({ t: f.t1, x: Math.min(0.62, h.pos[0] + (dx / dl) * go * 0.6), z: HOUSE.z + (dz / dl) * go, yaw: rr() * 6.28, scale: 1, up: rr() > 0.3, face: p.face, back: p.back, play: p, house: s, air: 0.001 });
  }
  pre.sort((a, b) => a.t - b.t); D.sort((a, b) => a.t - b.t);
  const r1 = buildHeap(pre).rest, r2 = buildHeap(D).rest;
  pre.forEach((d, i) => { d.rest = r1[i]; d.i = i; d.blown = true; });
  D.forEach((d, i) => { d.rest = r2[i]; if (d.proxyOf) d.proxyOf.rest = d.rest; });
  for (const d of tower) if (!d.rest) d.rest = d.restTower;
  const D2 = D.filter((d) => !d.proxyOf).concat(tower, cone).sort((a, b) => a.t - b.t);
  D2.forEach((d, i) => { d.i = i + pre.length; });
  return { D: pre.concat(D2) };
}
export function heap() { return HEAP ?? (HEAP = buildHeapData()); }

// ---------------------------------------------------------------- the rise (7-02) and the eye (7-03 →)
export const RISE = { t0: at('7-02', 0.2), t1: at('7-02', 3.4), axis: [LAMP.pos[0], LAMP.pos[2]] };
export const CEIL_GONE = at('7-02', 1.4);
export const EYE = { c: [0, 8.6, -0.1], open0: at('7-03', 1.6), open1: at('7-03', 3.0), R: 5.2 };   // (v19) it gathers shut, then opens
export const eyeLid = (x) => 2.6 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / 5.6, 1.7)), 0.85);
let EYE_SLOTS = null;
// every card of the eye: pupil (black, face down), iris (glyph rings), the white (blank cards inside an almond)
export function eyeSlots() {
  if (EYE_SLOTS) return EYE_SLOTS;
  const S = [];
  const rnd = mulberry32(808);
  for (let i = 0; i < 34; i++) { const a = rnd() * Math.PI * 2, r = 0.74 * Math.sqrt(rnd()); S.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: rnd() * 6.28, kind: 'pupil', r }); }
  for (const [gx, gz] of [[-0.36, -0.3], [-0.12, -0.42], [-0.44, -0.08]]) S.push({ x: gx, z: gz, yaw: 0.5, kind: 'glint', r: 0.4 });
  for (const r of [1.02, 1.36, 1.7, 2.04]) { const n = Math.round((Math.PI * 2 * r) / 0.4); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r; S.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a + Math.PI / 2, kind: 'iris', r }); } }
  for (let gx = -5.5; gx <= 5.5; gx += 0.42) for (let gz = -2.6; gz <= 2.6; gz += 0.58) {
    const x = gx + (rnd() - 0.5) * 0.08, z = gz + (rnd() - 0.5) * 0.08, r = Math.hypot(x, z);
    const lid = eyeLid(x);
    if (r > 1.85 && Math.abs(z) < lid - 0.12) S.push({ x, z, yaw: Math.PI / 2 + (rnd() - 0.5) * 0.14, kind: 'white', r, lid });
  }
  for (let x = -5.6; x <= 5.61; x += 0.36) for (const sg of [-1, 1]) { const sl = (eyeLid(x + 0.05) - eyeLid(x - 0.05)) / 0.1; S.push({ x, z: sg, yaw: Math.atan2(sg * sl, 1), kind: 'rim', r: 9, lid: eyeLid(x) }); }
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
  if (mo < 0) return max + 7;                                   // AlphaGo over Watson
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
  for (const p of plays()) if (p.t > CUES.race && p.t < RED_T && !p.top && !p.chat && !p.ghost && p.dest !== 'house' && p.date && p.who) events.push({ t: p.t + 0.1, who: p.who, kind: 'play', name: p.name, date: p.date, auto: p.style === 'auto' });
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
      // (v18) a company's row never goes back to an older model: an old card only lifts the score
      const mi = (n) => (MODELS[e.who] ?? []).findIndex((m) => m.name === n), older = mi(e.name) >= 0 && mi(e.name) < mi(S[e.who].model);
      if (sc > S[e.who].score) { S[e.who] = { ...S[e.who], model: older ? S[e.who].model : e.name, score: sc }; snap(e.t); }
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
  const cur = L[k], prev = L[Math.max(0, k - 1)], u = clamp((t - cur.t) / 0.28), e = u * u * (3 - 2 * u);
  const rows = cur.order.map((id, i) => {
    const pi = prev.order.indexOf(id), d = cur.data[id], pd = prev.data[id];
    const score = pd && Number.isFinite(d.score) && Number.isFinite(pd.score) ? lerp(pd.score, d.score, clamp(u * 1.6)) : d.score;
    // (v18) where the row is drawn: its place averaged over the last 0.3 s, so it slides however fast the board changes
    const W = 0.3; let acc = 0, tt = t;
    for (let j = k; j >= 0 && tt > t - W; j--) { const a0 = Math.max(L[j].t, t - W), ix = L[j].order.indexOf(id); acc += (ix < 0 ? i : ix) * (tt - a0); tt = a0; }
    if (tt > t - W) acc += i * (tt - (t - W));
    const y = Math.abs(acc / W - i) < 0.004 ? i : acc / W;
    return { who: id, model: d.model, score, y, rank: i + 1, up: y > i ? 1 : 0, out: d.out ? 1 : 0, glitch: 0 };
  });
  const top = cur.order[0], prevTop = prev.order[0];
  return { rows, date: topAt(t).date, flash: top !== prevTop ? (1 - u) : 0, red: t >= RED_T ? 1 : 0 };
}
