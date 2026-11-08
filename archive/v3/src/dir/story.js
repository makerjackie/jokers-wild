// JOKERS WILD v3 reel — the story as data: every stamp, every proposal card, the paper people's moves, the river,
// the jokers, the flattening. Pure functions of film time; the director (reel.js), the cameras and the sound events
// all read these. Times come from the shot table (ROW / CUES), never hard-coded seconds.
import { KINGS, KING, SEAT, SIDE_SIGN, pressPos, PILE } from '../layout.js';
import { CUES } from '../shots.js';
import { at, end } from './core.js';
import { mulberry32, clamp } from '../util.js';
import { MODELS } from '../models.js';
import { CELL } from '../cards-cells.js';

export const HEADS = ['deepseek', 'openai'];
export const STAMP_GRIP = 0.121;            // the fist's hole above the rubber face (props STAMP.FIST, the kings' upright grip)
export const CARD_Y = 0.0036;               // a card lying on the cloth: its top face
// the paper people
export const RED_HOME = [-0.56, -2.02], BLUE_HOME = [0.56, -2.02], MEET = [0, -2.02];

// ---------------------------------------------------------------- the stamping spots
// each king has two spots in front of him where proposal cards land: A toward the foot (+z), B toward the head.
// The head kings' spots sit nearer the paper people; the others' in front of their seats.
export function spot(id, which) {
  const k = KING[id], s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  const head = k.seat === 0;
  const dz = which === 'A' ? (head ? 0.39 : 0.08) : (head ? 0.17 : -0.16);
  return [s * 0.80, z + dz];
}
// which hand reaches a spot: A is on the foot side. A CN king faces +x: his right hand is toward +z; a US king's left.
export const handFor = (id, which) => ((which === 'A') === (KING[id].side === 'CN') ? 'R' : 'L');

// ---------------------------------------------------------------- the stamps
// { who, t (contact), which ('A'|'B'), hand, pos [x,z] (the rubber face centre), card (index into CARDS) | null,
//   miss (the card left before the stamp: ink on the cloth), wild, big, desc (descent time) }
let STAMPS = null, CARDS = null;
function build() {
  STAMPS = []; CARDS = [];
  const add = (who, t, which, o = {}) => {
    const [x, z] = o.pos ?? spot(who, which);
    const st = { who, t, which, hand: o.hand ?? handFor(who, which), pos: [x, z], card: null, miss: !!o.miss, wild: !!o.wild, big: !!o.big, desc: o.desc ?? 0.16, look: o.look ?? 1 };
    if (!o.noCard) {
      const out = o.out ?? t - 0.42, land = o.land ?? t - 0.14;
      const fly = o.miss ? t - (o.early ?? 0.1) : (o.fly ?? t + 0.1);
      const sp = spot(who, which);
      CARDS.push({ who, out, land, fly, pos: [sp[0], sp[1]], glyph: o.glyph ?? 1, stamp: o.miss ? null : t, face: o.face, self: !!o.self, big: !!o.big });
      st.card = CARDS.length - 1;
    }
    STAMPS.push(st);
  };
  const D = 'deepseek', O = 'openai';
  const latest = (id, back = 0) => CELL[`${id}${MODELS[id].length - 1 - back}`];
  // ---- @2: the first stamps, slow and read
  add(D, at('2-04', 0.55), 'A', { out: at('2-01', 0.15), land: at('2-01', 0.95), fly: at('2-04', 1.1), glyph: 0, face: latest(D), big: true, desc: 0.55 });
  add(O, at('2-05', 0.45), 'A', { out: at('2-03', 0.2), land: at('2-04', 0.2), fly: at('2-05', 0.75), glyph: 0, face: latest(O), desc: 0.3 });
  // ---- @3: faster; the faces turn to glyphs; the kings stop reading
  add(O, at('3-01', 0.4), 'B', { glyph: 0.1, face: latest(O, 1) });
  add(D, at('3-01', 0.8), 'A', { out: at('3-01', -0.2), land: at('3-01', 0.25), glyph: 0.15, face: latest(D, 1), desc: 0.22 });
  add(D, at('3-02', 0.38), 'B', { glyph: 0.55, face: latest(D, 2) });
  add(O, at('3-03', 0.32), 'A', { glyph: 1 });
  add(O, at('3-03', -0.2), 'B', { glyph: 0.8 });
  // 3-04: he runs between the stamps (A behind him, B ahead)
  for (const [k, w] of [[0.12, 'A'], [0.42, 'B'], [0.72, 'A'], [1.0, 'B']]) add(D, at('3-04', k), w, { glyph: 1 });
  for (const [k, w] of [[0.27, 'B'], [0.57, 'A'], [0.87, 'B']]) add(O, at('3-04', k), w, { glyph: 1 });
  // 3-05 .. 3-08: blind, both hands, faster and faster; more and more cards leave before the stamp (ink on the cloth)
  const r = mulberry32(77);
  for (const who of HEADS) {
    let t = at('3-05', who === D ? 0.08 : 0.17), i = 0;
    const wildT = WILD.t;
    while (t < at('4-01', -0.15)) {
      const which = i % 2 ? 'B' : 'A';
      const p = clamp((t - at('3-05')) / (at('4-01') - at('3-05')));
      const miss = r() < 0.15 + 0.45 * p;
      // 3-07: DeepSeek's blind stamp comes down where the red paper man cowers (added below); his hands are busy
      if (who === D && t > wildT - 0.3 && t < wildT + 0.2) { t = wildT + 0.2; continue; }
      const gap = 0.24 - 0.09 * p;
      add(who, t, which, { miss, glyph: 1, early: 0.05 + 0.1 * r(), out: t - Math.min(0.42, gap * 1.7), land: t - Math.min(0.14, gap * 0.55) });
      t += gap; i++;
    }
  }
  add(D, WILD.t, 'B', { pos: WILD.pos, noCard: true, wild: true, desc: 0.24 });
  // the other eight join in from 3-04: everyone stamps, blind
  for (const k of KINGS) if (!HEADS.includes(k.id)) {
    const rk = mulberry32(k.seat * 31 + (k.side === 'CN' ? 7 : 13));
    let t = at('3-04', 0.2 + rk() * 0.4), i = 0;
    while (t < at('4-01', -0.1)) {
      const p = clamp((t - at('3-04')) / (at('4-01') - at('3-04')));
      add(k.id, t, i % 2 ? 'B' : 'A', { miss: rk() < 0.3 + 0.4 * p, glyph: 1, early: 0.05 + 0.1 * rk() });
      t += 0.34 - 0.14 * p + rk() * 0.06; i++;
    }
  }
  // ---- 4-01: the card leaves by itself before the stamp; the stamp hits bare cloth
  add(D, at('4-01', 1.05), 'A', { out: at('4-01', 0.0), land: at('4-01', 0.3), fly: at('4-01', 0.62), miss: true, glyph: 1, self: true, desc: 0.55 });
  add(O, at('4-01', 1.15), 'B', { out: at('4-01', 0.05), land: at('4-01', 0.35), fly: at('4-01', 0.66), miss: true, glyph: 1, self: true, desc: 0.55 });
  STAMPS.sort((a, b) => a.t - b.t);
}
// 3-07: the blind stamp that nearly gets the red paper man
export const WILD = { t: at('3-07', 0.42), pos: [-0.63, -2.42] };
export function stamps() { if (!STAMPS) build(); return STAMPS; }
export function proposals() { if (!CARDS) build(); return CARDS; }
export const LAST_STAMP = () => Math.max(...stamps().map((s) => s.t));

// ---------------------------------------------------------------- where every played card ends: the pile
// the n-th card to land on the pile: a loose heap round the compass rose, growing
export function pileSpot(n) {
  const r = mulberry32(5000 + n * 7);
  const a = r() * Math.PI * 2, d = 0.06 + 0.36 * Math.sqrt(r()) * Math.min(1, 0.4 + n / 160);
  return { pos: [PILE[0] + Math.cos(a) * d * 1.2, CARD_Y * 0.5 + 0.0016 * Math.min(n, 220) * (1 - d / 0.5) + 0.001, PILE[2] + Math.sin(a) * d], yaw: r() * Math.PI * 2 };
}

// ---------------------------------------------------------------- the river (4-01 →): the cards play themselves
// every press throws its cards up and over the table into a slow vortex above the throne (the card king's body)
export const RIVER = { t0: at('4-01', 0.5), rate: 6.5, flight: 2.6, vortex: [0, 2.6, -4.05] };
export function riverCards(t) {
  const out = [];
  if (t < RIVER.t0) return out;
  for (const k of KINGS) {
    const p = pressPos(k.id), s = SIDE_SIGN[k.side];
    const r = mulberry32(900 + k.seat * 17 + (k.side === 'CN' ? 0 : 101));
    const start = RIVER.t0 + (k.seat === 0 ? 0 : 2.4 + k.seat * 0.25 + r() * 0.3);
    const tEnd = Math.min(t, CUES.king + 1.6);
    for (let i = 0; ; i++) {
      const rate = RIVER.rate * (k.seat === 0 && i < 6 ? 0.45 : 1);
      const t0 = start + i / rate + (r() - 0.5) * 0.08;
      if (t0 > tEnd) break;
      out.push({ who: k.id, t0, s, p, seed: r(), i });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the flattening (6-02, 6-03)
const FLAT_ORDER = ['qwen', 'anthropic', 'kimi', 'google', 'glm', 'xai', 'doubao', 'meta'];
export function flatTime(id) {
  if (id === 'deepseek') return at('6-02', 0.45);
  if (id === 'openai') return at('6-02', 1.4);
  const i = FLAT_ORDER.indexOf(id);
  return at('6-03', 0.1) + i * (0.17 - 0.008 * i);
}
// fan slot of each court card (seen from the front, left to right) and the pair's
export const FAN_ORDER = ['doubao', 'glm', 'kimi', 'qwen', 'deepseek', 'openai', 'anthropic', 'google', 'xai', 'meta'];
export const FAN_PAIR = 10;
// the card with the two paper people lands on the pile (6-07); the next card covers it
export const PLAY = { land: at('6-07', 0.35), cover: at('6-07', 0.8), cover2: at('6-07', 1.15) };
void end; void CUES;
