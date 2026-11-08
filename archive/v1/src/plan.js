// JOKERS WILD — rule-replayed world plans shared by the director (picture) and sound-events (sound).
// Everything here is a pure function of the shot table, so picture and sound can never drift apart.
import { ROW, CUES } from './shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT, buttonPos } from './layout.js';
import { mulberry32 } from './util.js';
import { CELL } from './cards-cells.js';
import { MODELS, modelAt } from './models.js';

const at = (id, k) => ROW[id].t0 + k;

// ---- AUTO: who presses when (7-01 .. 7-08), which hand presses (the one on the button's side) and which
// hand the threads take over (the other one)
export const AUTO = (() => {
  const list = [['7-01', 0.55, 'anthropic'], ['7-02', 0.45, 'openai'], ['7-03', 0.35, 'deepseek'], ['7-04', 0.28, 'google'],
    ['7-05', 0.22, 'qwen'], ['7-06', 0.17, 'xai'], ['7-07', 0.15, 'kimi'], ['7-08', 0.05, 'meta'], ['7-08', 0.12, 'glm'], ['7-08', 0.18, 'doubao']];
  const o = {};
  for (const [row, k, id] of list) {
    const press = at(row, k);
    const side = KING[id].side;
    // US kings face -x: their LEFT hand is toward +z (the foot), where the button is. CN kings: their RIGHT hand.
    const pressHand = side === 'US' ? 'L' : 'R';
    o[id] = { press, cover: press - (id === 'anthropic' ? 0.3 : 0.16), strings: press + 0.17, auto: press + (id === 'anthropic' ? 0.35 : 0.25), pressHand, puppetHand: pressHand === 'L' ? 'R' : 'L' };
  }
  return o;
})();

// ---- the puppet throws: every strung arm keeps throwing cards at the pile until the jokers rise
const THROW_END = () => at('8-08', 0.6);
export function releasePoint(id) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  return [sx * 1.02, 0.5, z + (k.side === 'US' ? -0.12 : 0.12)];
}
export function windupPoint(id) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  return [sx * 1.42, 1.02, z + (k.side === 'US' ? -0.28 : 0.28)];
}
export function followPoint(id) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  return [sx * 0.95, 0.24, z + (k.side === 'US' ? -0.02 : 0.02)];
}
let _throws = null;
export function puppetThrows() {
  if (_throws) return _throws;
  const out = [];
  const rnd = mulberry32(1701);
  for (const kg of KINGS) {
    let t = AUTO[kg.id].auto + 0.35 + rnd() * 0.3;
    let gap = 1.25, n = 0;
    while (t < THROW_END()) {
      const glyphAfter = CUES.party + 2.2;
      out.push({
        t, who: kg.id, side: AUTO[kg.id].puppetHand, from: releasePoint(kg.id), hold: Math.min(0.4, gap * 0.45), flight: 0.32,
        cell: t > glyphAfter ? CELL[`glyph${(n * 5 + kg.seat) % 16}`] : CELL[`${kg.id}${Math.max(0, modelAt(kg.id, '2026·09') - (n % 2))}`],
        back: kg.side === 'CN' ? CELL.backCN : CELL.backUS, spin: 8 + rnd() * 6, arc: 0.18 + rnd() * 0.12,
      });
      gap = Math.max(0.42, gap * 0.93);
      t += gap * (0.85 + 0.3 * rnd());
      n++;
    }
  }
  _throws = out.sort((a, b) => a.t - b.t);
  return _throws;
}

// ---- the cancel key (8-06): 13 jabs, faster and faster
export function cancelJabs() {
  const out = []; let tc = at('8-06', 0.15), g = 0.3;
  for (let i = 0; i < 13; i++) { out.push(tc); tc += g; g = Math.max(0.08, g * 0.84); }
  return out;
}

// ---- cigars lit (7-09) in this order
export const LIGHT_ORDER = ['openai', 'deepseek', 'google', 'qwen', 'anthropic', 'kimi', 'xai', 'glm'];
export const LIGHT_TIMES = [0.3, 0.52, 0.71, 0.93, 1.12, 1.28, 1.44, 1.58];

export function buttonOf(id) { return buttonPos(id); }
