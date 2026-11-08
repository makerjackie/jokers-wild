// 《失控》 — the story as data: every card played (who, which hand, when it leaves the hand, when it lands, its face),
// the house of cards and its fall, the giant, the decks and what they fire, the heap they all make, the eliminations,
// the cards standing up and rising, the AI's vast cards, the two that fall at the end, the ant's walk. Pure functions
// of film time; the state (reel.js), the cameras (cams.js) and the sound events all read these. Times come from the
// shot table (ROW / CUES), never hard-coded seconds.
import { KINGS, KING, SEAT, SIDE_SIGN, LAMP } from '../layout.js';
import { CUES, ROW } from '../shots.js';
import { at, end } from './core.js';
import { mulberry32, clamp, lerp, smooth } from '../util.js';
import { MODELS } from '../models.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { DECK } from '../decks.js';
import { buildHeap } from './heap.js';

export const FINAL = ['deepseek', 'openai'];
export const CARD_Y = 0.0036;
export { DECK };
export const DECK_HAND = { deepseek: 'R', openai: 'L' };      // the hand nearer each stand
export const sxOf = (id) => SIDE_SIGN[KING[id].side];
const backOf = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
const cellOf = (id, v) => CELL[`${id}${Math.min(v, MODELS[id].length - 1)}`];

// ---------------------------------------------------------------- the eliminations: the chair starts sliding back
export const OUT = {
  meta: at('3-07', 1.1), doubao: at('3-07', 1.7), xai: at('3-07', 3.1), glm: at('3-07', 3.8),
  google: at('3-08', 1.15), kimi: at('3-08', 2.75), anthropic: at('3-08', 3.45), qwen: at('3-08', 4.05),
};
export const OUT_DUR = 0.9;
export const outAt = (id) => OUT[id] ?? Infinity;

// ---------------------------------------------------------------- the house of cards (the US cards, 3-02 .. 3-04)
// three storeys of A-frames along x on the US half; seen from the foot (M1) every frame is a Λ
export const HOUSE = { x: 0.40, z: -0.56, lean: 1.22 };          // centre of the bottom row; lean from horizontal (rad)
const AH = CARD.H * Math.sin(HOUSE.lean), AW = CARD.H * Math.cos(HOUSE.lean);   // an A-frame's height, half its base
function houseSlots() {
  const S = [];
  const frame = (cx, y) => {
    for (const s of [-1, 1]) {
      // a card leaning in: its bottom edge on the floor of its storey at cx + s*AW, its top at the apex cx
      const bx = cx + s * AW, mid = [(bx + cx) / 2, y + AH / 2, HOUSE.z];
      const up = [-s * Math.cos(HOUSE.lean), Math.sin(HOUSE.lean), 0];        // along the card toward the apex
      const n = [s * Math.sin(HOUSE.lean), Math.cos(HOUSE.lean), 0];           // the face, outward
      S.push({ pos: mid, n, up });
    }
  };
  const roof = (cx, y) => S.push({ pos: [cx, y + CARD.T / 2, HOUSE.z], n: [0, 1, 0], up: [1, 0, 0], roof: true });
  const y0 = CARD_Y * 0.5 - CARD.T / 2, step = AH + CARD.T;
  const X = HOUSE.x, d = 2 * AW + 0.004;
  // bottom: three frames, two roof cards bridging them; second: two frames, one roof; top: one frame
  for (const k of [-1, 0, 1]) frame(X + k * d, y0);
  for (const k of [-0.5, 0.5]) roof(X + k * d, y0 + AH);
  for (const k of [-0.5, 0.5]) frame(X + k * d, y0 + step);
  roof(X, y0 + step + AH);
  frame(X, y0 + 2 * step);
  return S;
}
export const HOUSE_SLOTS = houseSlots();          // 15: frames 0-5, roofs 6-7, frames 8-11, roof 12, frame 13-14
export const FLICK = { put: at('3-04', 1.0), go: at('3-04', 1.35), hit: at('3-04', 2.1), from: [-0.98, -0.52] };

// ---------------------------------------------------------------- every card a king plays
// play = { who, hand, style ('toss' | 'slam' | 'giant' | 'open' | 'flick'), deck (drawn from his stand), tr (release),
//          t (landing), face, back, scale, up (face up), glyph, writhe, dest ('heap' | 'house' | 'cloth'), slot, at: [x, z] }
let PLAYS = null;
const r0 = mulberry32(2024);
function spread(t, sx, rnd) {
  // where a card thrown at time t lands on the pile: a growing mound under the lamp
  const p = clamp((t - at('2-03')) / (at('3-09') - at('2-03')));
  const sig = 0.1 + 0.32 * p;
  const a = rnd() * Math.PI * 2, d = sig * Math.sqrt(-2 * Math.log(1 - rnd() * 0.95)) * 0.75;
  return [sx * 0.03 + Math.cos(a) * d * 1.1, 0.02 + Math.sin(a) * d];
}
function buildPlays() {
  const P = [];
  const add = (o) => {
    const k = KING[o.who], sx = SIDE_SIGN[k.side];
    const style = o.style ?? 'slam';
    const flight = o.flight ?? (style === 'toss' ? 0.62 : style === 'giant' ? 0.17 : 0.27);
    const p = { hand: o.hand ?? (o.deck ? DECK_HAND[o.who] : 'R'), scale: 1, up: true, glyph: 0, writhe: 0, back: backOf(o.who), dest: 'heap', style, ...o, flight };
    if (o.tr == null) p.tr = p.t - flight;
    if (p.dest === 'heap' && !p.at) p.at = spread(p.t, sx, mulberry32(Math.floor(p.t * 977) + 13));
    if (p.yaw == null) p.yaw = mulberry32(Math.floor(p.t * 331) + 7)() * Math.PI * 2;
    P.push(p);
  };
  // ---- @1, @2-01: the lazy game. Old cards lie about already (placed below); a few lazy tosses, mostly face down
  add({ who: 'google', style: 'toss', t: at('1-04', 0.55), face: CELL.old2, up: true, at: [0.2, 0.36], yaw: -Math.PI / 2 - 0.3 });       // AlphaGo, by the ant
  for (const [who, k, up, face] of [['xai', at('1-07', 0.9), false], ['qwen', at('1-07', 2.0), false], ['kimi', at('1-07', 3.1), false],
    ['meta', at('2-01', 0.35), false], ['openai', at('2-01', 1.2), true, CELL.old3], ['glm', at('2-01', 2.1), false], ['anthropic', at('2-01', 2.85), false]])
    add({ who, style: 'toss', t: k, up, face: face ?? cellOf(who, 0), at: up ? [-0.02, -0.16] : [(r0() - 0.5) * 0.3, (r0() - 0.5) * 0.3], yaw: up ? -Math.PI / 2 + 0.15 : undefined });
  // ---- @2: ChatGPT, drawn from OpenAI's stand, raised, slammed face up in the middle (its top edge toward the head)
  add({ who: 'openai', deck: true, t: at('2-03', 0.42), face: CELL.chatFace, chat: true, at: [0.0, 0.0], yaw: -Math.PI / 2, flight: 0.24, raise: [at('2-02', 0.35), at('2-02', 2.2)] });
  // ---- @3: the race
  // 3-01: the CN row scrambles
  for (const [who, k] of [['qwen', 0.45], ['glm', 0.85], ['doubao', 1.3], ['kimi', 1.75], ['deepseek', 2.25]]) add({ who, t: at('3-01', k), face: cellOf(who, 0), deck: who === 'deepseek' });
  // 3-02 .. 3-03: the montage. US cards fly into the house of cards (one slot each, in order); CN cards hit the pile
  const US = [['openai', 1, 0.5], ['anthropic', 0, 0.75], ['xai', 0, 1.15], ['meta', 1, 1.55], ['google', 1, 2.15], ['google', 2, 3.1], ['anthropic', 1, 3.6], ['xai', 1, 3.95],
    ['openai', 2, 4.82], ['anthropic', 2, 5.15], ['meta', 3, 5.5], ['google', 3, 6.1], ['openai', 3, 7.0], ['anthropic', 2, 7.7], ['xai', 1, 8.3]];
  US.forEach(([who, v, k], slot) => add({ who, t: at('3-02', k), face: cellOf(who, v), dest: 'house', slot, deck: who === 'openai', flight: 0.32 }));
  const CN = [['glm', 1, 1.35], ['doubao', 1, 1.95], ['deepseek', 1, 2.92], ['qwen', 1, 4.22], ['kimi', 1, 5.35], ['doubao', 1, 6.4], ['qwen', 2, 7.3], ['glm', 1, 8.0]];
  for (const [who, v, k] of CN) add({ who, t: at('3-02', k), face: cellOf(who, v), deck: who === 'deepseek' });
  // 3-03: Meta throws Llama face up across the table (open weights); Kimi and Doubao grab it
  add({ who: 'meta', style: 'open', t: at('3-03', 1.0), flight: 0.75, face: cellOf('meta', 2), dest: 'cloth', at: [-0.76, 1.86], yaw: Math.PI * 0.55 });
  // 3-04: DeepSeek's little R1 skims across the cloth into the house (see FLICK)
  add({ who: 'deepseek', style: 'flick', deck: true, t: FLICK.hit, tr: FLICK.go, face: cellOf('deepseek', 4), scale: 0.7, dest: 'cloth', at: [0.04, -0.54], yaw: Math.PI / 2 });
  // 3-06: OpenAI's GPT-4.5, door-sized, overhead with both hands
  add({ who: 'openai', style: 'giant', hand: 'B', t: at('3-06', 1.95), face: CELL.gpt45, scale: 3.0, at: [0.04, 0.06], yaw: -Math.PI / 2 + 0.25, hold: [at('3-06', 0.25), at('3-06', 1.55)] });
  // 3-07 .. 3-09: everyone, faster; the faces start to move and stop making sense; bigger cards; then only two
  const t0 = at('3-07'), t1 = at('3-09', 0.22);
  for (const k of KINGS) {
    const id = k.id, rk = mulberry32(k.seat * 53 + (k.side === 'CN' ? 3 : 29));
    let t = t0 + 0.15 + rk() * 0.5, v = 4;
    const stop = Math.min(t1, outAt(id) - 0.55);
    while (t < stop) {
      const p = clamp((t - t0) / (t1 - t0));
      const vv = Math.min(MODELS[id].length - 1, Math.floor(v));
      add({ who: id, t, face: cellOf(id, vv), scale: 1.15 + 0.5 * p, glyph: clamp((p - 0.25) * 1.6), writhe: clamp(p * 1.3), deck: FINAL.includes(id), gcell: CELL[`glyph${Math.floor(rk() * 16)}`] });
      t += (0.95 - 0.5 * p) * (FINAL.includes(id) ? 0.9 : 1.1) + rk() * 0.12;
      v += 0.35;
    }
  }
  // 3-09: the last two slams, then each draws the card he will be afraid of
  add({ who: 'deepseek', deck: true, t: at('3-09', 0.45), face: cellOf('deepseek', 7), scale: 1.7, glyph: 1, writhe: 1, gcell: CELL.glyph5 });
  add({ who: 'openai', deck: true, t: at('3-09', 0.85), face: cellOf('openai', 7), scale: 1.7, glyph: 1, writhe: 1, gcell: CELL.glyph11 });
  P.sort((a, b) => a.t - b.t);
  P.forEach((p, i) => { p.i = i; });
  return P;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }

// the two cards they hold in @4 and lay face down
export const HELD = {
  deepseek: { draw: at('3-09', 1.4), down: at('4-04', 1.55), at: [-0.93, 0.08], gcell: CELL.glyph3 },
  openai: { draw: at('3-09', 1.75), down: at('4-05', 1.6), at: [0.93, 0.08], gcell: CELL.glyph12 },
};

// 4-01, the insert: the lens in front of the card he holds (the card is cheated to face it; his face soft behind)
export const INSERT = { cam: [-0.66, 0.5, 0.5] };
// ---------------------------------------------------------------- the decks: how many cards on each stand, what they fire
export const DECK_N0 = 52;
// 5-01: the twitch; 5-02: the pair (they lift, hang high, and swoop down in 5-03 / 5-04); 5-06 → 6-01: the streams
export const TWITCH = { t: at('5-01', 0.95) };
export const PAIR = { lift: at('5-02', 0.2), CN: at('5-03', 0.55), US: at('5-04', 0.55) };
export const STOP = CUES.stop;
// fire rate (cards per second, per deck) at time t
export function fireRate(t) {
  if (t < at('5-06', 0.4) || t >= STOP) return 0;
  if (t < CUES.blizzard) return lerp(3, 11, clamp((t - at('5-06', 0.4)) / (CUES.blizzard - at('5-06', 0.4))));
  return lerp(11, 42, smooth((t - CUES.blizzard) / (STOP - CUES.blizzard)) ** 1.3);
}
let FIRES = null;
// every card a deck fires: { side, t (leaves the deck), land, at: [x, z], yaw, face, gcell, scale }
function buildFires() {
  const F = [];
  const rnd = mulberry32(777);
  for (const side of ['CN', 'US']) {
    const sx = side === 'CN' ? -1 : 1;
    F.push({ side, t: PAIR.lift, land: PAIR[side], at: [sx * 0.05, 0.05], yaw: rnd() * 6.28, face: CELL[`glyph${side === 'CN' ? 4 : 9}`], scale: 1.6, pair: true });
    let t = at('5-06', 0.4) + (side === 'US' ? 0.13 : 0);
    while (t < STOP) {
      const rate = fireRate(t);
      if (rate <= 0) break;
      const p = clamp((t - at('5-06')) / (STOP - at('5-06')));
      const fl = lerp(0.85, 0.55, p) + rnd() * 0.15;
      const a = rnd() * Math.PI * 2, d = (0.15 + 0.72 * Math.sqrt(rnd())) * (0.85 + 0.3 * p);
      F.push({ side, t, land: t + fl, at: [Math.cos(a) * d * 1.15 + sx * 0.05, 0.02 + Math.sin(a) * d], yaw: rnd() * 6.28, face: CELL[`glyph${Math.floor(rnd() * 16)}`], scale: 1.4 + 0.5 * rnd() * p });
      t += 1 / rate * (0.7 + 0.6 * rnd());
    }
  }
  F.sort((a, b) => a.t - b.t);
  return F;
}
export function fires() { return FIRES ?? (FIRES = buildFires()); }
// the stand's stack: shrinks by the cards drawn, then (5-06 →) grows by itself faster than it fires
export function deckCount(side, t) {
  const who = side === 'CN' ? 'deepseek' : 'openai';
  let n = DECK_N0;
  for (const p of plays()) if (p.who === who && p.deck && t >= p.tr - 0.35) n--;
  if (t >= HELD[who].draw) n--;
  // from 5-06 the stack feeds itself as fast as it fires, and grows on top of that (a tower by the blizzard)
  const g0 = at('5-06', 0.3);
  if (t > g0) n += Math.floor(170 * smooth(clamp((Math.min(t, STOP) - g0) / (STOP - g0))) ** 1.4);
  else for (const f of fires()) if (f.side === side && t >= f.t) n--;
  return Math.max(6, n);
}

// ---------------------------------------------------------------- the heap: everything that lands on the pile
// the relics already lying about at the start (Deep Blue is the ant's plaza), then every landing in order
export const PLAZA = { x: 0.31, z: 0.36, yaw: -Math.PI / 2 + 0.22 };   // Deep Blue: top edge toward -x, tilted a little
let HEAP = null;
function buildHeapData() {
  const D = [];
  const push = (o) => D.push(o);
  const rnd = mulberry32(31337);
  // already there
  push({ t: -1, x: PLAZA.x, z: PLAZA.z, yaw: PLAZA.yaw, scale: 1, up: true, face: CELL.old0, back: CELL.backBlack, air: 0 });
  push({ t: -1, x: -0.14, z: -0.2, yaw: 2.1, scale: 1, up: true, face: CELL.old1, back: CELL.backBlack, air: 0 });
  for (let k = 0; k < 6; k++) push({ t: -1, x: (rnd() - 0.5) * 0.36, z: (rnd() - 0.5) * 0.3, yaw: rnd() * 6.28, scale: 1, up: false, face: CELL.blank, back: rnd() < 0.5 ? CELL.backCN : CELL.backUS, air: 0.0008 });
  for (const p of plays()) {
    if (p.dest === 'heap') push({ t: p.t, x: p.at[0], z: p.at[1], yaw: p.yaw, scale: p.scale, up: p.up, face: p.face, back: p.back, glyph: p.glyph, writhe: p.writhe, gcell: p.gcell, play: p, air: p.style === 'giant' ? 0.004 : p.chat ? 0.009 : 0.0012 + 0.0022 * rnd() });
    if (p.style === 'flick') push({ t: p.t, x: p.at[0], z: p.at[1], yaw: p.yaw, scale: p.scale, up: true, face: p.face, back: p.back, play: p, air: 0 });
  }
  // the house falls: its cards come to rest scattered over the US half (the field learns them when they land)
  for (let s = 0; s < HOUSE_SLOTS.length; s++) {
    const p = plays().find((q) => q.dest === 'house' && q.slot === s);
    const h = HOUSE_SLOTS[s];
    const rr = mulberry32(400 + s * 17);
    const fall = houseFall(s);
    push({ t: fall.t1, x: h.pos[0] + 0.05 + rr() * 0.32, z: HOUSE.z + (rr() - 0.45) * 0.42, yaw: rr() * 6.28, scale: 1, up: rr() < 0.7, face: p.face, back: p.back, play: p, house: s, air: 0.001 });
  }
  for (const f of fires()) push({ t: f.land, x: f.at[0], z: f.at[1], yaw: f.yaw, scale: f.scale, up: true, face: f.face, back: CELL.backBlack, glyph: 1, writhe: 1, gcell: f.face, fire: f, air: 0.0006 + 0.0014 * rnd() });
  D.sort((a, b) => a.t - b.t);
  const { rest, field } = buildHeap(D);
  D.forEach((d, i) => { d.rest = rest[i]; d.i = i; });
  return { D, field };
}
export function heap() { return HEAP ?? (HEAP = buildHeapData()); }
// when house card s starts to fall and lands (the bottom-left frame is hit first; the cascade runs up and right)
export function houseFall(s) {
  const order = [0, 1, 6, 8, 2, 3, 9, 12, 13, 14, 7, 10, 11, 4, 5];
  const k = order.indexOf(s);
  const t0 = FLICK.hit + 0.02 + k * 0.07 + (s >= 13 ? 0.12 : 0);
  return { t0, t1: t0 + 0.55 + (HOUSE_SLOTS[s].pos[1] > 0.3 ? 0.25 : 0.1) };
}

// ---------------------------------------------------------------- @6: they stand up, turn, and rise
// the first two stand alone (6-03); then the wave runs out from the summit (6-04)
export const STAND = { first: at('6-03', 0.6), second: at('6-03', 1.9), wave0: at('6-04', 0.3), wave1: at('6-04', 2.6) };
export const RISE = { t0: at('6-05', 0.25), t1: at('6-05', 3.9), axis: [LAMP.pos[0], LAMP.pos[2]] };
export const CEIL_GONE = at('6-05', 1.6);
let ORDER = null;
// per heap card: when it stands, when it lifts
export function heapTimes() {
  if (ORDER) return ORDER;
  const { D } = heap();
  const live = D.filter((d) => d.t < STOP + 2);
  // the summit: the highest card
  let top = live[0];
  for (const d of live) if (d.rest.pos[1] > top.rest.pos[1]) top = d;
  const dist = (d) => Math.hypot(d.rest.pos[0] - top.rest.pos[0], d.rest.pos[2] - top.rest.pos[2]);
  let maxD = 0; for (const d of live) maxD = Math.max(maxD, dist(d));
  // the first two: high on the slope facing the foot (the camera of 6-03 sees them)
  const near = live.filter((d) => d.rest.pos[1] > top.rest.pos[1] * 0.5 && d.rest.pos[0] < -0.08 && Math.abs(d.rest.pos[2]) < 0.35 && d.scale < 2).sort((a, b) => b.rest.pos[1] - a.rest.pos[1]);
  const first = near[0] ?? top, second = near.find((d) => Math.hypot(d.rest.pos[0] - first.rest.pos[0], d.rest.pos[2] - first.rest.pos[2]) > 0.12) ?? near[1] ?? top;
  const byH = [...live].sort((a, b) => b.rest.pos[1] - a.rest.pos[1]);
  const rank = new Map(byH.map((d, k) => [d, k / byH.length]));
  ORDER = new Map();
  const rnd = mulberry32(99);
  for (const d of live) {
    let stand = STAND.wave0 + (STAND.wave1 - STAND.wave0) * (dist(d) / Math.max(0.01, maxD)) ** 0.8 + (rnd() - 0.5) * 0.18;
    if (d === first) stand = STAND.first;
    if (d === second) stand = STAND.second;
    const lift = RISE.t0 + (RISE.t1 - RISE.t0) * rank.get(d) ** 0.9 + rnd() * 0.15;
    ORDER.set(d, { stand, lift, seed: rnd() });
  }
  ORDER.first = first; ORDER.second = second; ORDER.top = top;
  return ORDER;
}
// which king a standing card turns to face: the nearer one
export function faceTarget(x) { return x < 0 ? 'deepseek' : 'openai'; }

// ---------------------------------------------------------------- the AI: vast cards turning in the dark above
// three rings (radius, height, count, scale, angular speed); some of their cards swing out and meet (its game)
export const RINGS = [
  { r: 8.5, y: 15, n: 22, s: 16, w: 0.045, tilt: 0.55 },
  { r: 16, y: 26, n: 30, s: 26, w: -0.03, tilt: 0.35 },
  { r: 27, y: 42, n: 34, s: 40, w: 0.018, tilt: 0.2 },
];
export const AI_ON = at('6-05', 1.0);
// meetings: [t, ring, card i, card j] — two cards swing together, face to face, and part
export const MEET = [[at('6-08', 1.1), 0, 3, 9], [at('6-08', 3.0), 1, 5, 17], [at('7-01', 1.2), 0, 14, 19], [at('7-03', 0.6), 2, 2, 20], [at('7-06', 0.5), 1, 24, 8], [at('7-08', 1.5), 0, 6, 12], [at('7-08', 4.2), 2, 11, 27], [at('7-08', 6.6), 1, 1, 13]];

// ---------------------------------------------------------------- @7: the cards that fall from the dark
// the two (7-01), each to where its king laid his own card down; then the feed: one at a time, caught and played
export const FALL = {
  deepseek: { t0: at('7-01', 0.15), land: at('7-01', 3.05), at: [-0.93, 0.08], gcell: CELL.glyph6 },
  openai: { t0: at('7-01', 0.55), land: at('7-02', 0.45), at: [0.93, 0.08], gcell: CELL.glyph13 },
};
export const PEEK = {
  deepseek: { reach: at('7-04', 0.3), lift: at('7-04', 0.85), smile: at('7-04', 1.4), down: at('7-04', 2.75), grin: at('7-04', 2.2) },
  openai: { glance: at('7-05', 0.1), reach: at('7-05', 0.45), lift: at('7-05', 0.85), smile: at('7-05', 1.25), down: at('7-05', 2.25), grin: at('7-05', 1.9) },
};
// 7-06: each picks his card up and slaps it in the middle; 7-07 →: the feed (falls, catches, slaps), the new pile
export const PLAY2 = { deepseek: at('7-06', 0.7), openai: at('7-06', 1.3) };
let FEED = null;
export function feed() {
  if (FEED) return FEED;
  FEED = [];
  let t = at('7-07', 0.5), k = 0;
  const rnd = mulberry32(5150);
  while (t < CUES.title - 0.2) {
    const who = k % 2 ? 'openai' : 'deepseek';
    const sx = who === 'deepseek' ? -1 : 1;
    FEED.push({ who, k, catch: t, slap: t + 0.38, t0: t - 2.2, from: [sx * (0.6 + rnd() * 0.3), 6.5, (rnd() - 0.5) * 0.6], gcell: CELL[`glyph${(k * 5) % 16}`],
      at: [sx * 0.04 + (rnd() - 0.5) * 0.12, 0.02 + (rnd() - 0.5) * 0.12], yaw: rnd() * 6.28 });
    t += lerp(0.6, 0.48, clamp((t - at('7-07')) / 10)) + rnd() * 0.03;
    k++;
  }
  return FEED;
}

// ---------------------------------------------------------------- the ant
// 1-02 .. 1-05 on the cloth by the pile, over Deep Blue (the plaza); 1-06 at the foot of the table, over the edge
export const ANT_SPEED = 0.034;     // m/s (a little over two body lengths a second)
const ANT_PATH = [
  // [t, x, z]: the walk; it stops (alert) for the slap and goes on
  [at('1-02', 0.0), 0.62, 0.43], [at('1-03', 0.0), 0.47, 0.375], [at('1-04', 0.5), 0.355, 0.36],
];
export const ANT_EDGE = { t0: at('1-06', 0.0), x: 0.11, z0: 3.15, edge: 3.2 };
export const ANT_SLAP = at('1-04', 0.55);
export const ANT_BACK = { x: -0.64, z: 0.17 };
export function antAt(t) {
  if (t >= at('6-07') && t < at('6-08')) {
    return { show: 1, speed: 0, alert: 0.9, crumb: 1, crumbTilt: 0, size: 1, look: [-1.5, 1.9, 0.0], pos: [ANT_BACK.x, 0.0004, ANT_BACK.z], dir: [-1, 0], pitch: 0, dist: 0, surface: 'cloth' };
  }
  if (t < at('1-02') - 0.01 || t > at('1-07', 0.2)) return { show: 0 };
  const A = { show: 1, speed: 1, alert: 0, crumb: 1, crumbTilt: 0, size: 1, look: null };
  let x, z, dir = [-1, 0], pitch = 0, y = CARD_Y * 0 + 0.0;
  if (t < at('1-06')) {
    // along the path; held still from the slap until it goes on (1-05)
    const go = at('1-05', 0.75);
    const tt = t < ANT_SLAP ? t : t < go ? ANT_SLAP : t - (go - ANT_SLAP);
    let i = 0; while (i < ANT_PATH.length - 2 && ANT_PATH[i + 1][0] <= tt) i++;
    const [ta, xa, za] = ANT_PATH[i], [tb, xb, zb] = ANT_PATH[i + 1];
    const u = (tt - ta) / (tb - ta);
    x = lerp(xa, xb, u); z = lerp(za, zb, u);
    const dl = Math.hypot(xb - xa, zb - za) || 1; dir = [(xb - xa) / dl, (zb - za) / dl];
    // on Deep Blue it walks on the card's top (a step up of one card's thickness)
    const onCard = Math.abs((x - PLAZA.x) * Math.cos(PLAZA.yaw) + (z - PLAZA.z) * Math.sin(PLAZA.yaw)) < CARD.H / 2 && Math.abs(-(x - PLAZA.x) * Math.sin(PLAZA.yaw) + (z - PLAZA.z) * Math.cos(PLAZA.yaw)) < CARD.W / 2;
    y = onCard ? CARD.T + 0.0002 : 0.0004;
    A.surface = onCard ? 'card' : 'cloth';
    // the walk phase: distance / stride
    A.dist = tt * ANT_SPEED;
    A.speed = t >= ANT_SLAP && t < go ? 0 : 1;
    A.alert = clamp((t - ANT_SLAP) / 0.12) * (1 - clamp((t - at('1-05', 0.45)) / 0.4));
    A.crumbTilt = t < ANT_SLAP ? 0 : 0.55 * clamp((t - ANT_SLAP) / 0.08) * (1 - smooth((t - at('1-05', 0.05)) / 0.6));
    A.look = t > ANT_SLAP && t < at('1-05', 0.4) ? [0.06, 0.06, 0.37] : null;
  } else {
    // the foot of the table: up to the edge, over it, down the end grain into the dark
    const e = ANT_EDGE, s = (t - e.t0) * ANT_SPEED * 1.1;
    const toEdge = e.edge - e.z0;
    x = e.x; dir = [0, 1];
    if (s < toEdge) { z = e.z0 + s; y = 0.0004; pitch = 0; }
    else { const d = s - toEdge; z = e.edge + 0.004; y = -d * 0.95; pitch = Math.min(1, d / 0.008) * Math.PI / 2; }
    A.surface = 'wood';
    A.dist = (t - e.t0) * ANT_SPEED * 1.1 + 2;
  }
  A.pos = [x, y, z]; A.dir = dir; A.pitch = pitch;
  return A;
}
void end; void SEAT; void smooth; void ROW;
