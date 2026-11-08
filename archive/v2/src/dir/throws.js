// JOKERS WILD v2 — every card thrown in the film, in one list (the cards module draws it; the director animates the
// throwing arms from it; sound-events reads it). A throw: { t (release), who, side 'L'|'R', both (two-handed),
// cell, back, from, to: [x, y, z] (y = the pile height when it lands), hold (s in hand before t), wind (s of the
// wind-up), flight, scale, yaw, arc, spin, down (lands face down), vanish (gone when it arrives), puppet, gun, tower }.
import { CUES } from '../shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT, THRONE } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { modelAt } from '../models.js';
import { mulberry32, lerp } from '../util.js';
import { puppetThrows, releasePoint } from '../plan.js';
import { at, end } from './core.js';

const back = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
export function bigRelease(id) { const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat]; return [sx * 1.0, 0.95, z]; }
// where a dealt card lies in front of a king (between his press and the sea)
export function dealSpot(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.6, 0, SEAT.Z[k.seat] + 0.06]; }
// the new king's chest, as it grows (cards fly into it): an approximation the card-king department refines
export function chestAt(t) {
  const g = growAt(t);
  return [0, 1.92 + 1.82 * (g - 1), -3.5 + 0.1 * (g - 1)];     // the card king's chestPoint (its report: grow 1, 1.4, 2, 3)
}
export function growAt(t) {
  if (t < CUES.tower) return 1;
  if (t < CUES.flyup) return lerp(1, 1.45, Math.min(1, (t - CUES.tower) / 2.0));
  return 1.45 + 1.35 * Math.min(1, Math.pow((t - CUES.flyup) / (CUES.black - CUES.flyup), 1.25));
}

// The arrivals' ladder (seq 2): [row of the wind-up shot, who, model index, scale, two-handed]; the release falls
// 0.08 s before the cut, the card lands early in the next (top-down) shot.
export const LADDER = [
  ['2-03', 'qwen', 0, 1.25, false],
  ['2-05', 'google', 1, 1.55, false],
  ['2-07', 'glm', 1, 1.9, false],
  ['2-09', 'anthropic', 1, 2.4, true],
  ['2-11', 'kimi', 0, 2.8, true],
  ['2-13', 'meta', 2, 3.2, true],
  ['2-15', 'doubao', 1, 3.6, true],
  ['2-17', 'xai', 1, 4.0, true],
];
export const CLOCK_N = { qwen: 10, google: 9, glm: 7, anthropic: 6, kimi: 5, meta: 4, doubao: 3, xai: 2 };
export const FIRST = { t: at('1-04', 0.02), flight: 0.24 };          // ChatGPT: thrown from the edge of frame, lands in the light
export const DOUBLE = { t: end('2-21', -0.06), flight: 0.22 };     // the two 95s
export const V3 = { t: at('4-01', -0.12), flight: 0.3 };            // DeepSeek-V3 lands at the top of 4-01
export const O1 = { out: at('4-07', 0.6), grab: at('4-07', 1.55), slam: at('4-07', 4.45), land: at('4-07', 4.72) };
export const R1 = { t: at('4-09', 0.95), flight: 0.62 };
// the lock race (seq 5): each lock buys a card that lands in the next top-down shot
export const RACE5 = [['5-01', 'openai', 4], ['5-03', 'qwen', 4], ['5-05', 'google', 4], ['5-07', 'kimi', 2]];
export const GUN = { t0: at('6-07', 0.05), t1: end('6-07', -0.1) };
export const DEAL = { t0: at('10-03', 0.25), gap: 0.29, flight: 0.55 };
export const DEAL_ORDER = ['openai', 'deepseek', 'anthropic', 'qwen', 'google', 'kimi', 'xai', 'glm', 'meta', 'doubao'];
export const LAST = { pick: at('11-04', 0.2), slam: at('11-05', 0.06), up: at('11-06', 0.25), upFlight: 1.15 };
export const RACE = { t0: at('11-07', 0.1), t1: end('11-08', -0.3) };

let ALL = null;
export function allThrows() {
  if (ALL) return ALL;
  const out = [];
  const rnd = mulberry32(2024);
  // ---- Google's old cards lying in front of him at the start (landed long ago)
  for (let k = 0; k < 3; k++) {
    const to = [0.62 + k * 0.09, 0, 0.12 - k * 0.11];
    out.push({ t: -20 - k, who: 'google', cell: CELL.google0, back: back('google'), from: to, to, hold: 0, flight: 0.01, scale: 0.9, yaw: 1.2 + k * 0.5, keep: true, still: true });
  }
  // ---- 1-04: ChatGPT, the first card (OpenAI's right hand)
  out.push({ t: FIRST.t, who: 'openai', side: 'R', cell: CELL.openai0, back: back('openai'), from: releasePoint('openai'), to: [0.02, 0, 0.04], hold: 2.4, wind: 0.5, flight: FIRST.flight, yaw: 0.06, arc: 0.12, spin: 5, scale: 1, stay: at('1-05', 0.3), ret: 1.2 });
  // ---- seq 2: the ladder, each card bigger
  LADDER.forEach(([row, id, v, scale, both], i) => {
    const t = end(row, -0.08), fl = 0.3 - i * 0.012;
    const hold = Math.max(0.35, 1.25 - i * 0.12);
    out.push({ t, who: id, side: 'R', both, cell: CELL[`${id}${v}`], back: back(id), from: both ? bigRelease(id) : releasePoint(id), to: [(i % 3 - 1) * 0.05, 0, (i % 2 - 0.5) * 0.06], hold, wind: hold * 0.7, flight: fl, scale, yaw: (rnd() - 0.5) * 0.5, arc: 0.12 + scale * 0.05, spin: both ? 1.2 : 4 });
  });
  // ---- 2-22: the two 95s, both head kings at once
  out.push({ t: DOUBLE.t, who: 'openai', side: 'R', both: true, cell: CELL.openai2, back: back('openai'), from: bigRelease('openai'), to: [0.07, 0, -0.06], hold: 0.75, wind: 0.6, flight: DOUBLE.flight, scale: 4.6, yaw: 0.12, arc: 0.3, spin: 0.6 });
  out.push({ t: DOUBLE.t, who: 'deepseek', side: 'R', both: true, cell: CELL.deepseek2, back: back('deepseek'), from: bigRelease('deepseek'), to: [-0.07, 0, 0.06], hold: 0.75, wind: 0.6, flight: DOUBLE.flight, scale: 4.6, yaw: -0.1, arc: 0.3, spin: 0.6 });
  // ---- 4-01: DeepSeek-V3 on the two 95s
  out.push({ t: V3.t, who: 'deepseek', side: 'R', both: true, cell: CELL.deepseek3, back: back('deepseek'), from: bigRelease('deepseek'), to: [-0.02, 0, 0.0], hold: 0.7, wind: 0.5, flight: V3.flight, scale: 4.7, yaw: 0.25, arc: 0.3, spin: 0.8 });
  // ---- 4-09/4-10: DeepSeek flicks the tiny R1 onto the giant o1
  out.push({ t: R1.t, who: 'deepseek', side: 'R', cell: CELL.deepseek4, back: back('deepseek'), from: releasePoint('deepseek'), to: [0.03, 0, 0.02], hold: 0.55, wind: 0.25, flight: R1.flight, scale: 1.05, yaw: 0.9, arc: 0.35, spin: 14, r1: true });
  // ---- seq 5: each lock buys a card
  for (const [row, id, v] of RACE5) out.push({ t: end(row, -0.07), who: id, side: 'R', both: true, cell: CELL[`${id}${v}`], back: back(id), from: bigRelease(id), to: [(rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.1], hold: 0.6, wind: 0.4, flight: 0.24, scale: 4.8 + rnd() * 0.4, yaw: (rnd() - 0.5) * 0.6, arc: 0.3, spin: 0.8 });
  // ---- 6-07: the frenzy: every king on his feet, both hands, cards bigger than he is
  for (const kg of KINGS) {
    let t = GUN.t0 + rnd() * 0.15, n = 0;
    while (t < GUN.t1) {
      const v = Math.max(0, modelAt(kg.id, '2026·06') - (n % 3 === 2 ? 1 : 0));
      const big = n % 4 === 3;
      out.push({ t, who: kg.id, side: n % 2 ? 'L' : 'R', both: big, gun: !big, cell: CELL[`${kg.id}${v}`], back: back(kg.id), from: big ? bigRelease(kg.id) : releasePoint(kg.id), hold: big ? 0.3 : 0.13, wind: big ? 0.22 : 0.08, flight: 0.2 + rnd() * 0.08, scale: big ? 2.4 + rnd() * 1.2 : 1.2 + rnd() * 0.6, yaw: rnd() * 6.28, arc: 0.12 + rnd() * 0.1, spin: big ? 1 : 10 + rnd() * 8, tower: true });
      t += (big ? 0.34 : 0.16) + rnd() * 0.07; n++;
    }
  }
  // ---- seq 7 on: the strung arms (plan.js)
  for (const th of puppetThrows()) out.push({ ...th, wind: Math.min(th.hold, 0.3), puppet: true, ring: true });
  // ---- 10-03: the new king deals a card to every king, face down (the next model each is waiting for)
  DEAL_ORDER.forEach((id, i) => {
    const v = MODEL_LAST(id);
    out.push({ t: DEAL.t0 + i * DEAL.gap, who: null, cell: CELL[`${id}${v}`], back: CELL.backBlack, from: [Math.sign(dealSpot(id)[0]) * 0.95, 1.75, -2.75], to: dealSpot(id), hold: 0, flight: DEAL.flight, scale: 1.15, yaw: KING[id].side === 'CN' ? Math.PI / 2 : -Math.PI / 2, arc: 0.35, spin: 9, down: true, deal: true, keep: true, until: id === 'openai' || id === 'deepseek' ? LAST.pick : RACE.t0 + 0.4 * (i % 5) });
  });
  // ---- 11-05/11-06: the two head kings slam their dealt cards; the cards lift off and fly into the new king
  for (const id of ['openai', 'deepseek']) {
    const spot = dealSpot(id);
    out.push({ t: LAST.slam, who: id, side: id === 'openai' ? 'L' : 'R', cell: CELL[`${id}${MODEL_LAST(id)}`], back: CELL.backBlack, from: [spot[0] * 1.15, 0.3, spot[2]], to: spot, hold: LAST.slam - LAST.pick, wind: 0.25, flight: 0.1, scale: 1.15, yaw: KING[id].side === 'CN' ? Math.PI / 2 : -Math.PI / 2, arc: 0.02, spin: 0, slam: true, until: LAST.up });
    out.push({ t: LAST.up, who: null, cell: CELL[`${id}${MODEL_LAST(id)}`], back: CELL.backBlack, from: spot, to: chestAt(LAST.up + LAST.upFlight), hold: 0, flight: LAST.upFlight, scale: 1.15, yaw: 0, arc: 0.9, spin: 3, vanish: true, up: true });
  }
  // ---- 11-07/11-08: everyone plays again, faster and faster; every card flies up into the new king
  for (const kg of KINGS) {
    if (kg.id === 'openai' || kg.id === 'deepseek') continue;
    let t = RACE.t0 + rnd() * 0.5, gap = 0.9, n = 0;
    while (t < RACE.t1) {
      const v = Math.max(0, MODEL_LAST(kg.id) - (n % 3));
      out.push({ t, who: kg.id, side: n % 2 ? 'L' : 'R', cell: CELL[`${kg.id}${v}`], back: CELL.backBlack, from: releasePoint(kg.id), to: chestAt(t + 1.1), hold: Math.min(0.35, gap * 0.5), wind: Math.min(0.2, gap * 0.3), flight: 1.0 + rnd() * 0.3, scale: 1.1, yaw: rnd() * 6.28, arc: 0.6 + rnd() * 0.5, spin: 6 + rnd() * 6, vanish: true, up: true });
      gap = Math.max(0.16, gap * 0.86); t += gap * (0.85 + 0.3 * rnd()); n++;
    }
  }
  for (const id of ['openai', 'deepseek']) {
    let t = LAST.up + 0.9 + rnd() * 0.3, gap = 0.7, n = 0;
    while (t < RACE.t1) {
      const v = Math.max(0, MODEL_LAST(id) - (n % 3));
      out.push({ t, who: id, side: n % 2 ? 'L' : 'R', cell: CELL[`${id}${v}`], back: CELL.backBlack, from: releasePoint(id), to: chestAt(t + 1.1), hold: Math.min(0.35, gap * 0.5), wind: Math.min(0.2, gap * 0.3), flight: 1.0 + rnd() * 0.3, scale: 1.1, yaw: rnd() * 6.28, arc: 0.6 + rnd() * 0.5, spin: 6 + rnd() * 6, vanish: true, up: true });
      gap = Math.max(0.15, gap * 0.86); t += gap * (0.85 + 0.3 * rnd()); n++;
    }
  }
  out.sort((a, b) => a.t + a.flight - (b.t + b.flight));
  // ---- the pile: where each card lands, and how high the pile stands by then
  let h = 0, towerH = 0;
  for (const th of out) {
    const land = th.t + th.flight;
    if (th.still || th.deal || th.slam || th.up) { /* placed exactly */ }
    else if (th.tower) {
      const r = 0.04 + rnd() * 0.12, a = rnd() * 6.28;
      th.to = [Math.cos(a) * r * 0.8, towerH, Math.sin(a) * r]; th.flat = true;
      towerH += 0.0016 * Math.min(2, th.scale ?? 1);
    } else if (th.ring) {
      const sgn = KING[th.who].side === 'CN' ? -1 : 1, r = 0.22 + rnd() * 0.42, a = rnd() * 6.28;
      th.to = [sgn * Math.abs(Math.cos(a)) * r * 0.75, 0.002 + rnd() * 0.01, Math.sin(a) * r * 1.6];
    } else {
      th.to = th.to ?? [0, 0, 0];
      if (th.r1) h += CARD.T * 6.0 + 0.004;   // the giant o1 lies there now
      th.to = [th.to[0], h, th.to[2]];
      h += CARD.T * (th.scale ?? 1) * 0.9;
      towerH = h;
    }
    th.land = land;
  }
  ALL = out;
  return out;
}
// each company's newest card (the one the new king deals them)
function MODEL_LAST(id) { return modelAt(id, '2026·12'); }
// the top of the pile at film time t (for things that land on it later: the jokers)
export function pileTop(t) {
  let y = 0;
  for (const th of allThrows()) if (th.land <= t && !th.up && !th.deal && !th.slam && !th.still && !th.ring) y = Math.max(y, th.to[1] + CARD.T * (th.scale ?? 1));
  return y;
}
