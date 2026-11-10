// 《喂》 v5 — the story as data. Two kings play cards; two chairs are already empty, their crowns left on the table.
// The red king is losing, so he sets a wind-up card machine on the table. The black king brings a bigger one. The
// machines play each other; the kings only feed them (chips, the dead kings' crowns, their own), and every feeding makes
// a machine bigger. They outgrow the table, the hall, the lamp. The red machine wins; its next card lands on the red
// king, exactly as his card landed on the ant. It did not see him. Pure functions of film time: reel.js (state),
// cams.js and the sound events read these. Times come from the shot table (ROW / CUES), never hard-coded seconds.
import { KING, SIDE_SIGN, FLOOR_Y } from '../layout.js';
import { CUES } from '../shots.js';
import { at } from './core.js';
import { mulberry32, clamp, lerp, smooth } from '../util.js';
import { RANK_IX } from '../models.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { basisQ } from '../freecards.js';

export const RED = 'heart', BLK = 'spade', FINAL = [RED, BLK], GHOSTS = ['diamond', 'club'];
export const sxOf = (id) => SIDE_SIGN[KING[id].side];
export const rzOf = (id) => (KING[id].side === 'CN' ? 1 : -1);     // which way along z his RIGHT hand lies
export const otherOf = (id) => (id === RED ? BLK : RED);
const backOf = (id) => (KING[id].side === 'CN' ? CELL.backCN : CELL.backUS);
export const card = (id, r) => CELL[`${id}${RANK_IX[r]}`];
export const CARD_Y = 0.0036;

// ---------------------------------------------------------------- the ant (it walks under the red king's hand)
export const ANT_SPEED = 0.046;
export const ANT_KING = RED;
export const CRUSH = at('1-05', 0.95);
export const ANT_CRUSH = [-0.29, 0.17];
const ANT_PATH = [[at('1-02'), -0.08, 0.32], [CRUSH, ANT_CRUSH[0], ANT_CRUSH[1]]];
export function antAt(t) {
  if (t < at('1-02') - 0.01 || t >= CRUSH) return { show: 0 };
  const [ta, xa, za] = ANT_PATH[0], [tb, xb, zb] = ANT_PATH[1];
  const u = (t - ta) / (tb - ta), dl = Math.hypot(xb - xa, zb - za);
  return { show: 1, speed: 1, alert: 0, crumb: 1, pos: [lerp(xa, xb, u), 0.0004, lerp(za, zb, u)], dir: [(xb - xa) / dl, (zb - za) / dl], dist: (t - ta) * ANT_SPEED };
}

// ---------------------------------------------------------------- beats
export const PLACE = { heart: { up: at('2-04', 0.6), down: at('2-04', 1.9) }, spade: { up: at('3-01', 0.3), down: at('3-01', 1.25) } };
export const TOY_FIRST = at('2-05', 1.2);            // the first "tak"
export const PAT = [at('2-05', 1.95), at('2-05', 2.25)];
export const BLK_FIRST = at('3-01', 2.0);
export const RED_STOP = at('3-03', 0.7);             // the red toy has run down
export const RED_GO = at('3-04', 2.1);               // fed, it runs again
export const FLOOR_T = CUES['4-06'];                 // (a cut) the machines now stand on the floor behind the kings
export const MOUNT = { t0: at('5-01', 0.5), t1: at('5-01', 4.3), S: 30 };
export const HALL_GONE = at('5-01', 1.1);
export const BLK_STOP = at('5-04', 1.3);             // the black machine starves
export const WIN = at('5-05', 0.35);
export const FINAL_TR = at('6-01', 1.2);             // the last card leaves the slot
export const SLAM = at('6-02', 1.5);
export const RING = { roll0: at('6-03', 0.35), roll1: at('6-03', 1.7) };
export const BLACK = CUES['6-05'];
export const HESITATE = { up: at('4-07', 0.7), on: at('4-07', 1.45), look: at('4-07', 1.95) };

// ---------------------------------------------------------------- what they are fed: t = swallowed, S = size after
export const FEEDS = [
  { who: RED, kind: 'chip', t: at('3-04', 1.5), S: 0.44, n: 1 },
  { who: BLK, kind: 'chips', t: at('4-01', 1.4), S: 0.68, n: 10 },
  { who: RED, kind: 'chips', t: at('4-02', 0.5), S: 0.62, n: 10 },
  { who: BLK, kind: 'chips', t: at('4-02', 1.4), S: 0.86, n: 10 },
  { who: RED, kind: 'chips', t: at('4-02', 2.3), S: 0.86, n: 10 },
  { who: BLK, kind: 'chips', t: at('4-02', 3.2), S: 1.05, n: 10 },
  { who: RED, kind: 'chips', t: at('4-02', 4.1), S: 1.05, n: 9 },
  { who: BLK, kind: 'dead', t: at('4-04', 1.7), S: 1.3 },
  { who: RED, kind: 'dead', t: at('4-05', 1.6), S: 1.3 },
  { who: BLK, kind: 'crown', t: at('4-08', 1.25), S: 4.4 },
  { who: RED, kind: 'crown', t: at('4-09', 1.9), S: 4.4 },
];
// when the hand closes on it, when it lets go (it is swallowed at f.t)
export const feedGrab = (f) => f.t - (f.kind === 'dead' ? 0.95 : f.kind === 'crown' ? 0.7 : 0.72);
export const feedRelease = (f) => f.t - (f.kind === 'dead' ? 0.4 : f.kind === 'crown' ? 0.42 : 0.2);
export const STACK_N = 30;
export const chipsLeft = (id, t) => { let n = STACK_N; for (const f of FEEDS) if (f.who === id && f.n && t >= feedGrab(f)) n -= f.n; return Math.max(0, n); };
// where things lie on the table (x, z): his chip stack by his right hand; the dead kings' crowns at the empty places
export const stackAt = (id) => [sxOf(id) * 0.98, rzOf(id) * 0.44];
export const deadCrownAt = (id) => [sxOf(id) * 1.0, -0.95];
export const DEAD_HAND = { heart: 'L', spade: 'R' };     // the hand on the head side of the table

// ---------------------------------------------------------------- the machines
const S0 = { heart: 0.3, spade: 0.46 }, FLOOR_S = 3.0, TX = 0.74;
export function sizeAt(id, t) {
  let S = t >= FLOOR_T ? FLOOR_S : S0[id];
  for (const f of FEEDS) {
    if (f.who !== id || t < f.t || (t >= FLOOR_T && f.t < FLOOR_T)) continue;
    const u = (t - f.t) / 0.5;
    S += (f.S - S) * (1 - Math.exp(-5 * u) * Math.cos(9 * u));
  }
  if (t > MOUNT.t0) S *= Math.pow(MOUNT.S / 4.4, smooth((t - MOUNT.t0) / (MOUNT.t1 - MOUNT.t0)));
  return S;
}
export function gulpAt(id, t) {
  let g = 0;
  for (const f of FEEDS) if (f.who === id) { const u = (t - (f.t - 0.1)) / 0.32; if (u > 0 && u < 1) g = Math.max(g, Math.sin(Math.PI * u)); }
  if (t > MOUNT.t0 && t < MOUNT.t1) g = Math.max(g, 0.18 * Math.abs(Math.sin((t - MOUNT.t0) * 7)) * Math.sin((Math.PI * (t - MOUNT.t0)) / (MOUNT.t1 - MOUNT.t0)));
  return g;
}
export const floorX = (S) => 2.5 + 0.35 * S + 0.33 * Math.max(0, S - 4.6);
// { show, pos, yaw, S, floor, carried } or null before he brings it out
export function machineAt(id, t) {
  const P = PLACE[id];
  if (t < P.up) return null;
  const sx = sxOf(id), S = sizeAt(id, t), yaw = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
  if (t < P.down) {
    // up from under the table's edge in his hands, over, and down on the cloth (the black king's comes down hard)
    const u = (t - P.up) / (P.down - P.up), a = [sx * 1.36, -0.55, 0], b = [sx * 1.3, 0.36, 0];
    if (u < 0.55) { const e = smooth(u / 0.55); return { show: 1, pos: [lerp(a[0], b[0], e), lerp(a[1], b[1], e), 0], yaw, S, carried: 1 }; }
    const v = (u - 0.55) / 0.45;
    return { show: 1, pos: [lerp(b[0], sx * TX, smooth(v)), id === BLK ? b[1] * (1 - v * v * v) : b[1] * (1 - smooth(v)) + 0.06 * Math.sin(Math.PI * v), 0], yaw, S, carried: 1 };
  }
  if (t < FLOOR_T) return { show: 1, pos: [sx * TX, 0, 0], yaw, S };
  return { show: 1, pos: [sx * floorX(S), FLOOR_Y, 0], yaw, S, floor: 1 };
}
export const running = (id, t) => (id === RED ? (t >= TOY_FIRST - 0.01 && t < RED_STOP) || t >= RED_GO : t >= BLK_FIRST - 0.01 && t < BLK_STOP);
const CS = [[0.3, 1], [0.46, 1.35], [1.05, 3.2], [1.3, 3.8], [3.0, 10], [4.4, 12], [30, 45]];
export function csOf(S) {
  if (S <= CS[0][0]) return CS[0][1];
  for (let i = 1; i < CS.length; i++) if (S <= CS[i][0]) return lerp(CS[i - 1][1], CS[i][1], (S - CS[i - 1][0]) / (CS[i][0] - CS[i - 1][0]));
  return CS[CS.length - 1][1];
}
const period = (S) => (S < 0.6 ? 0.9 : S < 1.5 ? 1.15 : S < 3 ? 1.7 : S < 5 ? 2.1 : 2.7);

// ---------------------------------------------------------------- every card played
// play = { who, by ('hand' | 'machine'), tr (leaves the hand / the slot: the "tak"), t (lands), face, back, cs (scale),
//          at [x, z], yaw, glyph, gcell, far (lands out on the floor, far from the table), final, crush, rest { pos, q } }
export const FINAL_CS = 45, FINAL_XR = -0.45;       // the last card: its right edge comes down this close to the black king
const FAR = [[3.5, -13], [-4, 14], [5, 16.5], [-5.5, -15], [1.5, 19], [-2, -19.5], [6.5, -17], [-6, 18]];
let PLAYS = null;
function buildPlays() {
  const P = [], rnd = mulberry32(55);
  let nf = 0;
  const hand = (who, t, r, o = {}) => P.push({ who, by: 'hand', tr: t - 0.55, t, face: card(who, r), back: backOf(who), cs: 1,
    at: [sxOf(who) * 0.02 + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06], yaw: -Math.PI / 2 + (rnd() - 0.5) * 0.5, ...o });
  const mplay = (who, tr, o = {}) => {
    const S = sizeAt(who, tr), cs = csOf(S), far = tr >= MOUNT.t0;
    const fl = o.fl ?? (far ? 2.3 : S < 1.4 ? 0.4 + 0.1 * S : 0.6 + 0.08 * S);
    const rank = S < 0.5 ? 'A' : S < 0.9 ? '14' : S < 1.35 ? '21' : S < 3.5 ? '99' : '∞';
    P.push({ who, by: 'machine', tr, t: tr + fl, S, cs, face: card(who, rank), back: backOf(who), glyph: far ? 1 : S > 3.5 ? 0.5 : 0, gcell: CELL[`glyph${Math.floor(rnd() * 16)}`], far,
      at: far ? FAR[nf++ % FAR.length] : [(rnd() - 0.5) * 0.05 * cs, (rnd() - 0.5) * 0.06 * cs], yaw: -Math.PI / 2 + (rnd() - 0.5) * (far ? 1.2 : 0.4), ...o });
  };
  // ---- by hand: the card that lands on the ant; a few more; the black king's King
  hand(RED, CRUSH, '7', { at: ANT_CRUSH.slice(), yaw: -Math.PI / 2 - 0.3, crush: true, tr: CRUSH - 0.75 });
  hand(BLK, at('1-07', 1.4), '10');
  hand(RED, at('1-07', 2.7), 'J');
  hand(BLK, at('2-01', 0.9), 'K', { at: [0.02, 0.0], yaw: -Math.PI / 2 + 0.12, cs: 1.1 });
  // ---- the machines: one "tak", one card; in turn when both run; slower as they grow, and as they run down
  const skip = (t) => (t > FLOOR_T - 0.6 && t < FLOOR_T + 3.0) || (t > at('5-01', 0.2) && t < at('5-01', 3.4)) || t > FINAL_TR - 2.2;
  let tt = TOY_FIRST, who = RED;
  while (tt < CUES.title) {
    if (!running(who, tt)) {
      const o = otherOf(who);
      if (running(o, tt)) who = o; else { tt += 0.05; continue; }
    }
    let per = period(sizeAt(who, tt));
    if (who === RED && tt < RED_STOP) per *= 1 + 1.8 * clamp((tt - (RED_STOP - 2.4)) / 2.4);
    if (who === BLK && tt > BLK_STOP - 3.4) per *= 1 + 1.6 * clamp((tt - (BLK_STOP - 3.4)) / 3.4);
    if (!skip(tt)) mplay(who, tt);
    const both = running(RED, tt) && running(BLK, tt);
    tt += both ? per / 2 : per;
    if (running(otherOf(who), tt)) who = otherOf(who);
  }
  // the first cards as big as half the table (4-06): each one throws both kings back
  mplay(RED, at('4-06', 0.45), { fl: 0.75, at: [0, 0], yaw: -Math.PI / 2 + 0.05 });
  mplay(BLK, at('4-06', 1.9), { fl: 0.75, at: [0.06, -0.12], yaw: -Math.PI / 2 - 0.08 });
  // after it, as if nothing had happened: tak, tak (6-04), and once more in the black (6-05)
  for (const tr of [at('6-04', 0.6), at('6-04', 2.0), at('6-05', 0.6)]) mplay(RED, tr);
  // the last one
  P.push({ who: RED, by: 'machine', final: true, tr: FINAL_TR, t: SLAM, S: MOUNT.S, cs: FINAL_CS, face: card(RED, '∞'), back: backOf(RED), glyph: 1, gcell: CELL.glyph9, at: [0, 0.3], yaw: -Math.PI / 2 });
  P.sort((a, b) => a.t - b.t);
  // ---- where each comes to rest: the pile on the table grows card by card; the far ones lie on the floor
  let top = 0.003, k = 0;
  for (const p of P) {
    const T = CARD.T * p.cs, up = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
    p.i = k++;
    if (p.final) {
      const W = CARD.W * p.cs, yr = top + T / 2, yl = FLOOR_Y + T / 2 + 0.02, a = Math.asin((yr - yl) / W);
      p.rest = { pos: [FINAL_XR - (W / 2) * Math.cos(a), (yr + yl) / 2, p.at[1]], q: basisQ([-Math.sin(a), Math.cos(a), 0], [0, 0, -1]) };
      p.edgeY = top;
    } else if (p.far) p.rest = { pos: [p.at[0], FLOOR_Y + T / 2 + 0.004 * (p.i % 5), p.at[1]], q: basisQ([0, 1, 0], up) };
    else if (p.crush) p.rest = { pos: [p.at[0], CARD_Y, p.at[1]], q: basisQ([0, 1, 0], up) };
    else {
      const tl = 0.05 / p.cs;
      p.rest = { pos: [p.at[0], top + T / 2, p.at[1]], q: basisQ([(rnd() - 0.5) * tl, 1, (rnd() - 0.5) * tl], up) };
      top += T * 0.35; p.top = top;
    }
  }
  return P;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }
// the top of the pile on the table at t
export function pileTop(t) { let y = 0.003; for (const p of plays()) { if (p.t > t) break; if (p.top) y = p.top; } return y; }
export const finalPlay = () => plays().find((p) => p.final);

// ---------------------------------------------------------------- after the credits: the ant on the stone floor; a foot; from above
export const EGG = {
  from: [2.95, 1.45], dir: [-1, 0], speed: 0.03, t0: at('8-02', -0.6),
  foot: { in: at('8-03', 0.35), hover: at('8-03', 1.15), shift: at('8-03', 2.55), down: at('8-03', 3.25), lift: at('8-03', 3.95) },
  walk: { from: [3.5, 1.9], dir: [0.8, 0.6], speed: 0.42, t0: CUES['8-04'] },
  shadow: at('8-04', 1.5),
};
// the ant stops while the foot hangs over it, then goes on
export function eggAnt(t) {
  const F = EGG.foot, p0 = F.hover - 0.15, p1 = F.shift + 0.5;
  const walked = Math.max(0, Math.min(t, p0) - EGG.t0) + Math.max(0, t - p1);
  const d = walked * EGG.speed;
  return { pos: [EGG.from[0] + EGG.dir[0] * d, FLOOR_Y + 0.0004, EGG.from[1] + EGG.dir[1] * d], dir: EGG.dir, dist: d, stopped: t > p0 && t < p1 };
}
export const eggWalker = (t) => { const W = EGG.walk, d = Math.max(0, t - W.t0) * W.speed; return [W.from[0] + W.dir[0] * d, FLOOR_Y, W.from[1] + W.dir[1] * d]; };
