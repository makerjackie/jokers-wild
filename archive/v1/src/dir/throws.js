// JOKERS WILD — every card thrown in the film, in one list (the cards module draws it; the director animates the
// throwing arms from it; sound-events reads it). A throw: { t (release), who, side 'L'|'R', both (two-handed),
// cell, back, from, to: [x, y, z] (y = the pile height when it lands), hold (s in hand before t), wind (s of the
// wind-up), flight, scale, yaw, arc, spin, alt / wipe (a second face wiped away) }.
import { CUES } from '../shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { MODELS, modelAt } from '../models.js';
import { mulberry32 } from '../util.js';
import { puppetThrows, releasePoint } from '../plan.js';
import { at, end } from './core.js';

const back = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
const rightOf = (id) => 'R';
// where a two-handed giant card leaves from: high over the table edge in front of the king
export function bigRelease(id) { const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat]; return [sx * 1.0, 0.95, z]; }

// The duel (seq 2): [row of the wind-up shot, who, model index, scale, two-handed]; the release falls 0.08 s before
// the cut, the card lands early in the next (top-down) shot.
export const LADDER = [
  ['2-01', 'qwen', 0, 1.25, false],
  ['2-04', 'google', 1, 1.55, false],
  ['2-06', 'glm', 1, 1.9, false],
  ['2-08', 'anthropic', 1, 2.4, true],
  ['2-10', 'kimi', 0, 2.8, true],
  ['2-12', 'meta', 2, 3.2, true],
  ['2-14', 'doubao', 1, 3.6, true],
  ['2-16', 'xai', 1, 4.0, true],
];
export const FIRST = { t: CUES.open + 0.3, flight: 0.25 };          // ChatGPT, thrown in the dark, lands in the light
export const DOUBLE = { t: end('2-20', -0.06), flight: 0.22 };     // the two 95s
export const O1 = { out: at('3-05', 0.9), grab: at('3-05', 2.0), slam: at('3-05', 5.35), land: at('3-05', 5.62) };
export const R1 = { t: at('3-06', 1.22), flight: 0.62 };
export const LLAMA = { t: at('4-01', 1.55), flight: 0.3, wipe: [at('4-02', 0.55), at('4-02', 0.9)] };
export const BOMB = { t: at('4-04', 0.62), flight: 0.24, blast: at('4-04', 0.9) };
export const GUN = { t0: at('6-02', 0.05), t1: end('6-02', -0.1) };

let ALL = null;
export function allThrows() {
  if (ALL) return ALL;
  const out = [];
  const rnd = mulberry32(2024);
  // ---- 1-02: ChatGPT, the first card (OpenAI's right hand, from the dark)
  out.push({ t: FIRST.t, who: 'openai', side: 'R', cell: CELL.openai0, back: back('openai'), from: releasePoint('openai'), to: [0.02, 0, 0.04], hold: 0.9, wind: 0.5, flight: FIRST.flight, yaw: 0.06, arc: 0.12, spin: 5, scale: 1, stay: at('1-04', 0.1), ret: 1.35 });
  // ---- seq 2: the ladder, each card bigger
  LADDER.forEach(([row, id, v, scale, both], i) => {
    const t = end(row, -0.08), fl = 0.3 - i * 0.012;
    const hold = Math.max(0.35, 1.45 - i * 0.16);
    out.push({ t, who: id, side: 'R', both, cell: CELL[`${id}${v}`], back: back(id), from: both ? bigRelease(id) : releasePoint(id), to: [(i % 3 - 1) * 0.05, 0, (i % 2 - 0.5) * 0.06], hold, wind: hold * 0.7, flight: fl, scale, yaw: (rnd() - 0.5) * 0.5, arc: 0.12 + scale * 0.05, spin: both ? 1.2 : 4 });
  });
  // ---- 2-21: the two 95s, both head kings at once
  out.push({ t: DOUBLE.t, who: 'openai', side: 'R', both: true, cell: CELL.openai2, back: back('openai'), from: bigRelease('openai'), to: [0.07, 0, -0.06], hold: 0.75, wind: 0.6, flight: DOUBLE.flight, scale: 4.6, yaw: 0.12, arc: 0.3, spin: 0.6 });
  out.push({ t: DOUBLE.t, who: 'deepseek', side: 'R', both: true, cell: CELL.deepseek2, back: back('deepseek'), from: bigRelease('deepseek'), to: [-0.07, 0, 0.06], hold: 0.75, wind: 0.6, flight: DOUBLE.flight, scale: 4.6, yaw: -0.1, arc: 0.3, spin: 0.6 });
  // ---- 3-06/3-07: DeepSeek flicks the tiny R1 onto the giant o1
  out.push({ t: R1.t, who: 'deepseek', side: 'R', cell: CELL.deepseek4, back: back('deepseek'), from: releasePoint('deepseek'), to: [0.03, 0, 0.02], hold: 0.5, wind: 0.25, flight: R1.flight, scale: 0.7, yaw: 0.9, arc: 0.35, spin: 14 });
  // ---- 4-01/4-02: Meta's Llama 4, in make-up (wiped in 4-02)
  out.push({ t: LLAMA.t, who: 'meta', side: 'R', cell: CELL.meta4, alt: CELL.llamaMakeup, wipe: LLAMA.wipe, back: back('meta'), from: releasePoint('meta'), to: [0.0, 0, 0.0], hold: 0.4, wind: 0.3, flight: LLAMA.flight, scale: 1.6, yaw: 0.02, arc: 0.18, spin: 3 });
  // ---- 4-04: Kimi fans out four photocopies of Claude's card: a bomb
  for (let k = 0; k < 4; k++) out.push({ t: BOMB.t + k * 0.012, who: 'kimi', side: 'R', fan: k, cell: CELL.claudeCopy, back: back('kimi'), from: releasePoint('kimi'), to: [-0.12 + (k % 2) * 0.24, 0, -0.17 + Math.floor(k / 2) * 0.34], hold: 0.5, wind: 0.35, flight: BOMB.flight, scale: 1.5, yaw: (k - 1.5) * 0.12, arc: 0.2, spin: 2 });
  // ---- 6-02: the machine gun: every king, both hands, as fast as he can; the pile grows into a tower
  for (const kg of KINGS) {
    let t = GUN.t0 + rnd() * 0.12, n = 0;
    while (t < GUN.t1) {
      const v = modelAt(kg.id, '2026·05') - (n % 3 === 2 ? 1 : 0);
      out.push({ t, who: kg.id, side: n % 2 ? 'L' : 'R', gun: true, cell: CELL[`${kg.id}${Math.max(0, v)}`], back: back(kg.id), from: releasePoint(kg.id), hold: 0.12, wind: 0.08, flight: 0.2 + rnd() * 0.08, scale: 1, yaw: rnd() * 6.28, arc: 0.1 + rnd() * 0.1, spin: 10 + rnd() * 8, tower: true });
      t += 0.11 + rnd() * 0.06; n++;
    }
  }
  // ---- seq 7 on: the strung arms (plan.js)
  for (const th of puppetThrows()) out.push({ ...th, wind: Math.min(th.hold, 0.3), puppet: true, ring: true });
  out.sort((a, b) => a.t + a.flight - (b.t + b.flight));
  // ---- the pile: where each card lands, and how high the pile stands by then
  let h = 0, towerH = 0;
  for (const th of out) {
    const land = th.t + th.flight;
    if (land > BOMB.blast && th.t < BOMB.blast && !th.blasted) { /* the four copies land just before the blast */ }
    if (th.tower) {
      // the tower: cards land on its top, which rises (it never quite stays neat)
      const r = 0.04 + rnd() * 0.1, a = rnd() * 6.28;
      th.to = [Math.cos(a) * r * 0.8, towerH, Math.sin(a) * r];
      towerH += 0.0038;
    } else if (th.ring) {
      // the strung arms' cards pile up around the tower's foot, toward the thrower's side
      const sgn = KING[th.who].side === 'CN' ? -1 : 1, r = 0.22 + rnd() * 0.42, a = rnd() * 6.28;
      th.to = [sgn * Math.abs(Math.cos(a)) * r * 0.75, 0.002 + rnd() * 0.01, Math.sin(a) * r * 1.6];
    } else {
      th.to = th.to ?? [0, 0, 0];
      if (th.t >= R1.t - 0.01 && th.t < R1.t + 0.01 && th.who === 'deepseek') h += CARD.T * 6.0 + 0.004;   // the giant o1 lies there now
      th.to = [th.to[0], h, th.to[2]];
      h += CARD.T * (th.scale ?? 1) * 0.9;
    }
    th.land = land;
  }
  ALL = out;
  return out;
}
// the top of the pile at film time t (for things that land on it later: the jokers)
export function pileTop(t) {
  let y = 0;
  for (const th of allThrows()) if (th.land <= t) y = Math.max(y, th.to[1] + CARD.T * (th.scale ?? 1));
  return y;
}
void rightOf; void MODELS;
