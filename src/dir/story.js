// 《喂》 v6 — the story as data. Four kings play cards under one lamp. The lamp leans toward whoever played the
// highest card (the #1); the one it never reaches is dragged into the dark with his chair, and his crown stays on the
// table. The red king, next to go, sets a wind-up card machine on the table and presses 托管. The black king brings a
// bigger one; the king who will not use one is dragged out. The two who are left feed their machines: chips (printed
// like silicon), the lamp's power, the dead kings' crowns. Then the machines take for themselves: the chip the red king
// hid, the crowns off their heads. 取消 does nothing; the key cannot be held. They outgrow the table and eat the hall.
// The black machine starves; the red king, seeing he is winning, believes again and cheers; his machine's next card
// lands on him as his landed on the ant. Pure functions of film time: reel.js (state), cams.js and the sound events
// read these. Times come from the shot table (ROW / CUES), never hard-coded seconds.
import { KING, SIDE_SIGN, SEAT, FLOOR_Y } from '../layout.js';
import { CUES } from '../shots.js';
import { at } from './core.js';
import { mulberry32, clamp, lerp, smooth, ease } from '../util.js';
import { RANK_IX } from '../models.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { basisQ } from '../freecards.js';

export const RED = 'heart', BLK = 'spade', DIA = 'diamond', CLB = 'club';
export const FINAL = [RED, BLK], ALL = [RED, DIA, BLK, CLB];
export const sxOf = (id) => SIDE_SIGN[KING[id].side];
export const zOf = (id) => SEAT.Z[KING[id].seat];
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

// ---------------------------------------------------------------- the two who are dragged out
// pull: the chair is yanked back into the dark; crown: his crown hits the table; still: it has stopped spinning
export const OUT = {
  club: { pull: [at('2-04', 0.7), at('2-04', 1.35)], crown: at('2-04', 1.25), still: at('2-04', 2.7) },
  diamond: { pull: [at('4-04', 0.6), at('4-04', 1.25)], crown: at('4-04', 1.15), still: at('4-04', 2.6) },
};
// 1 at the table .. 0 gone (the `enter` of kings.js: the chair's distance out is cubic in it)
export function seated(id, t) {
  const o = OUT[id]; if (!o) return 1;
  const u = clamp((t - o.pull[0]) / (o.pull[1] - o.pull[0]));
  return u >= 1 ? 0 : 1 - Math.cbrt(1 - (1 - u) * (1 - u));
}
export const inGame = (id, t) => !OUT[id] || t < OUT[id].pull[0];
// the crown each of the last two will later feed to his machine: the one left by the king who sat beside him
export const DEAD_OF = { heart: DIA, spade: CLB };
export const deadCrownAt = (id) => [sxOf(id) * 1.0, -0.95];
export const DEAD_HAND = { heart: 'L', spade: 'R' };     // the hand on the head side of the table

// ---------------------------------------------------------------- beats
export const PLACE = { heart: { up: at('3-04', 0.6), down: at('3-04', 1.9) }, spade: { up: at('4-01', 0.2), down: at('4-01', 1.1) } };
export const AUTO_PRESS = { heart: at('3-05', 1.3), spade: at('4-01', 1.95) };
export const TOY_FIRST = at('3-06', 0.9);            // the first "tak"
export const PAT = [at('3-06', 2.3), at('3-06', 2.6)];
export const BLK_FIRST = at('4-02', 0.6);
export const RED_STOP = at('5-01', 0.9);             // the red toy has run down
export const RED_GO = at('5-02', 2.1);               // fed, it runs again
export const PALM = { grab: at('5-05', 1.6), hide: at('5-05', 2.45) };       // the last chip goes up his sleeve
export const PLUG = { heart: { throw: at('5-07', 1.5), bite: at('5-07', 2.1) }, spade: { throw: at('5-08', 0.6), bite: at('5-08', 1.2) } };
export const SUCK_CHIP = { out: at('6-02', 1.0), gone: at('6-02', 1.75) };  // it takes the hidden chip by itself
export const CANCEL = { heart: [0.5, 1.05, 1.5, 1.85, 2.15, 2.4, 2.65].map((k) => at('6-03', k)), spade: [0.15, 0.45, 0.7, 0.95].map((k) => at('6-06', k)) };
export const KEYGRAB = { on: at('6-04', 0.5), off: at('6-04', 2.0) };
export const CROWN_SUCK = {
  heart: { lift: at('6-05', 0.4), grab: at('6-05', 0.8), lose: at('6-05', 2.0), gone: at('6-05', 2.4) },
  spade: { lift: at('6-06', 1.1), grab: at('6-06', 1.35), lose: at('6-06', 1.8), gone: at('6-06', 2.15) },
};
export const FLOOR_T = at('6-07', 1.6);              // (a cut) the machines now stand on the floor behind the kings
export const MOUNT = { t0: at('7-01', 0.5), t1: at('7-01', 4.5), S: 30 };
export const HALL_GONE = at('7-01', 1.4);
export const BLK_STOP = at('7-04', 1.7);             // the black machine starves
export const WIN = at('7-05', 2.0);                  // the red king stands and cheers
export const POINT = at('7-06', 0.4);                // the black king points up
export const FINAL_TR = at('8-01', 1.2);             // the last card leaves the slot
export const SLAM = at('8-02', 1.6);
export const GLASSES = { t0: at('8-03', 0.35), t1: at('8-03', 1.3) };
export const BACK = [at('8-05', 1.9), at('8-05', 4.2)];   // the black king pushes his chair back into the dark
export const BLACK = CUES['8-06'];

// ---------------------------------------------------------------- what the machines get: t = swallowed, S = size after
// kinds: chip / chips / dead (a dead king's crown): by the king's hand. power: the lamp's. suck: the hidden chip.
// own: the crown off his head (the machine takes these two itself).
export const FEEDS = [
  { who: RED, kind: 'chip', t: at('5-02', 1.5), S: 0.44, n: 1 },
  { who: BLK, kind: 'chips', t: at('5-03', 1.4), S: 0.68, n: 10 },
  { who: RED, kind: 'chips', t: at('5-04', 0.5), S: 0.62, n: 10 },
  { who: BLK, kind: 'chips', t: at('5-04', 1.4), S: 0.86, n: 10 },
  { who: RED, kind: 'chips', t: at('5-04', 2.3), S: 0.86, n: 10 },
  { who: BLK, kind: 'chips', t: at('5-04', 3.2), S: 1.05, n: 10 },
  { who: RED, kind: 'chips', t: at('5-04', 4.1), S: 1.05, n: 8 },
  { who: RED, kind: 'power', t: PLUG.heart.bite + 0.12, S: 1.2 },
  { who: BLK, kind: 'power', t: PLUG.spade.bite + 0.12, S: 1.2 },
  { who: BLK, kind: 'dead', t: at('5-09', 1.7), S: 1.4 },
  { who: RED, kind: 'dead', t: at('5-10', 1.6), S: 1.4 },
  { who: RED, kind: 'suck', t: SUCK_CHIP.gone, S: 1.45 },
  { who: RED, kind: 'own', t: CROWN_SUCK.heart.gone, S: 1.7 },
  { who: BLK, kind: 'own', t: CROWN_SUCK.spade.gone, S: 1.7 },
];
export const byHand = (f) => f.kind === 'chip' || f.kind === 'chips' || f.kind === 'dead';
// when the hand closes on it, when it lets go (it is swallowed at f.t)
export const feedGrab = (f) => f.t - (f.kind === 'dead' ? 0.95 : 0.72);
export const feedRelease = (f) => f.t - (f.kind === 'dead' ? 0.4 : 0.2);
export const STACK_N = 30;
export const chipsLeft = (id, t) => { let n = STACK_N; for (const f of FEEDS) if (f.who === id && f.n && t >= feedGrab(f)) n -= f.n; if (id === RED && t >= PALM.grab) n -= 1; return Math.max(0, n); };
export const stackAt = (id) => [sxOf(id) * 0.98, rzOf(id) * 0.44];

// ---------------------------------------------------------------- the machines
const S0 = { heart: 0.3, spade: 0.46 }, FLOOR_S = 3.0, TX = 0.74;
export function sizeAt(id, t) {
  let S = t >= FLOOR_T ? FLOOR_S : S0[id];
  for (const f of FEEDS) {
    if (f.who !== id || t < f.t || (t >= FLOOR_T && f.t < FLOOR_T)) continue;
    const u = (t - f.t) / 0.5;
    S += (f.S - S) * (1 - Math.exp(-5 * u) * Math.cos(9 * u));
  }
  if (t < FLOOR_T) S *= 1 + 0.2 * ease(t, at('6-07', 0.2), FLOOR_T);          // swelling until the table cannot hold them
  if (t > MOUNT.t0) S *= Math.pow(MOUNT.S / FLOOR_S, smooth((t - MOUNT.t0) / (MOUNT.t1 - MOUNT.t0)));
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
export const autoOn = (id, t) => t >= AUTO_PRESS[id];
// a machine grown too deep for the table's edge pushes its king back from the table (metres)
export function pushOf(id, t) { const m = machineAt(id, t); return !m || m.floor || m.carried ? 0 : clamp(0.74 + 0.51 * m.S - 1.3, 0, 0.7); }
export const running = (id, t) => (id === RED ? (t >= TOY_FIRST - 0.01 && t < RED_STOP) || t >= RED_GO : t >= BLK_FIRST - 0.01 && t < BLK_STOP);
const CS = [[0.3, 1], [0.46, 1.35], [1.05, 3.2], [1.4, 4.2], [1.7, 5], [3.0, 10], [30, 45]];
export function csOf(S) {
  if (S <= CS[0][0]) return CS[0][1];
  for (let i = 1; i < CS.length; i++) if (S <= CS[i][0]) return lerp(CS[i - 1][1], CS[i][1], (S - CS[i - 1][0]) / (CS[i][0] - CS[i - 1][0]));
  return CS[CS.length - 1][1];
}
const period = (S) => (S < 0.6 ? 0.9 : S < 1.15 ? 1.15 : S < 3.5 ? 1.8 : S < 5 ? 2.1 : 2.7);

// ---------------------------------------------------------------- every card played
// play = { who, by ('hand' | 'machine'), tr (leaves the hand / the slot: the "tak"), t (lands), face, back, cs (scale),
//          at [x, z], yaw, glyph, gcell, far (lands out on the floor, far from the table), final, crush, rest { pos, q } }
export const FINAL_CS = 45, FINAL_XR = -0.45;       // the last card: its right edge comes down this close to the black king
const FAR = [[3.5, -13], [-4, 14], [5, 16.5], [-5.5, -15], [1.5, 19], [-2, -19.5], [6.5, -17], [-6, 18]];
const R1 = at('2-01');
// the four cards of the first round, one a cut: [who, rank, lands]
export const ROUND1 = [[CLB, '5', R1 + 0.65], [DIA, '9', R1 + 1.75], [RED, 'J', R1 + 2.85], [BLK, 'Q', R1 + 3.95]];
let PLAYS = null;
function buildPlays() {
  const P = [], rnd = mulberry32(55);
  let nf = 0;
  const hand = (who, t, r, o = {}) => P.push({ who, by: 'hand', tr: t - 0.55, t, face: card(who, r), back: backOf(who), cs: 1, rank: r,
    at: [sxOf(who) * 0.03 + (rnd() - 0.5) * 0.05, zOf(who) * 0.1 + (rnd() - 0.5) * 0.05], yaw: -Math.PI / 2 + (rnd() - 0.5) * 0.5, ...o });
  const mplay = (who, tr, o = {}) => {
    const S = sizeAt(who, tr), cs = csOf(S), far = tr >= MOUNT.t0;
    const fl = o.fl ?? (far ? 2.3 : S < 1.4 ? 0.4 + 0.1 * S : 0.55 + 0.08 * S);
    const rank = S < 0.4 ? 'A' : S < 0.7 ? '14' : S < 1.0 ? '21' : S < 1.25 ? '99' : '∞';
    P.push({ who, by: 'machine', tr, t: tr + fl, S, cs, rank, face: card(who, rank), back: backOf(who), glyph: far || S >= 1.35 ? 1 : 0, gcell: CELL[`glyph${Math.floor(rnd() * 16)}`], far,
      at: far ? FAR[nf++ % FAR.length] : [(rnd() - 0.5) * 0.05 * cs, (rnd() - 0.5) * 0.06 * cs], yaw: -Math.PI / 2 + (rnd() - 0.5) * (far ? 1.2 : 0.4), ...o });
  };
  // ---- by hand: the card that lands on the ant; the first round; the second; the diamond king's last
  hand(RED, CRUSH, '7', { at: ANT_CRUSH.slice(), yaw: -Math.PI / 2 - 0.3, crush: true, tr: CRUSH - 0.75 });
  for (const [who, r, t] of ROUND1) hand(who, t, r);
  hand(DIA, at('3-01', 0.8), 'Q');
  hand(BLK, at('3-01', 1.9), 'K', { at: [0.02, 0.0], yaw: -Math.PI / 2 + 0.12, cs: 1.1 });
  hand(DIA, at('4-03', 2.2), 'K', { cs: 1.1, hard: 1 });
  // ---- the machines: one "tak", one card; in turn when both run; slower as they grow, and as they run down
  const skip = (t) => (t > FLOOR_T - 1.7 && t < at('6-08', 3.0)) || (t > at('7-01', 0.2) && t < at('7-01', 3.6)) || t > FINAL_TR - 2.2;
  let tt = TOY_FIRST, who = RED;
  while (tt < FINAL_TR) {
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
  // the first cards as big as half the table (6-08): each one throws both kings back
  mplay(RED, at('6-08', 0.4), { fl: 0.75, at: [0, 0], yaw: -Math.PI / 2 + 0.05 });
  mplay(BLK, at('6-08', 1.85), { fl: 0.75, at: [0.06, -0.12], yaw: -Math.PI / 2 - 0.08 });
  // after the last one, as if nothing had happened: tak, tak, and once more in the black
  for (const tr of [at('8-04', 0.7), at('8-04', 2.2), at('8-05', 1.0), at('8-05', 3.0), at('8-06', 0.6)]) mplay(RED, tr);
  // the last one
  P.push({ who: RED, by: 'machine', final: true, tr: FINAL_TR, t: SLAM, S: MOUNT.S, cs: FINAL_CS, face: card(RED, '∞'), back: backOf(RED), glyph: 1, gcell: CELL.glyph9, at: [0, 0.3], yaw: -Math.PI / 2 });
  P.sort((a, b) => a.t - b.t);
  // ---- where each comes to rest: the pile on the table grows card by card; the far ones lie on the floor
  let top = 0.003, surf = 0.003, k = 0;      // top: where the next card's underside goes; surf: the highest face so far
  for (const p of P) {
    const T = CARD.T * p.cs, up = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
    p.i = k++;
    if (p.final) {
      const W = CARD.W * p.cs, yr = surf + T / 2, yl = FLOOR_Y + T / 2 + 0.02, a = Math.asin((yr - yl) / W);
      p.rest = { pos: [FINAL_XR - (W / 2) * Math.cos(a), (yr + yl) / 2, p.at[1]], q: basisQ([-Math.sin(a), Math.cos(a), 0], [0, 0, -1]) };
      p.edgeY = surf;
    } else if (p.far) p.rest = { pos: [p.at[0], FLOOR_Y + T / 2 + 0.004 * (p.i % 5), p.at[1]], q: basisQ([0, 1, 0], up) };
    else if (p.crush) p.rest = { pos: [p.at[0], CARD_Y, p.at[1]], q: basisQ([0, 1, 0], up) };
    else {
      const tl = 0.05 / p.cs;
      p.rest = { pos: [p.at[0], top + T / 2, p.at[1]], q: basisQ([(rnd() - 0.5) * tl, 1, (rnd() - 0.5) * tl], up) };
      surf = Math.max(surf, top + T); top += T * 0.3; p.top = surf;
    }
  }
  return P;
}
export function plays() { return PLAYS ?? (PLAYS = buildPlays()); }
export function pileTop(t) { let y = 0.003; for (const p of plays()) { if (p.t > t) break; if (p.top) y = p.top; } return y; }
export const finalPlay = () => plays().find((p) => p.final);

// ---------------------------------------------------------------- the lamp: it leans toward the #1
// every time the highest card changes hands: [{ t, who }]
let LEAD = null;
export function leaderEvents() {
  if (LEAD) return LEAD;
  const E = ROUND1.map(([who, , t]) => ({ t, who }));
  E.push({ t: at('3-01', 0.8), who: DIA }, { t: at('3-01', 1.9), who: BLK });
  for (const p of plays()) if (p.by === 'machine' && p.t < PLUG.spade.bite) E.push({ t: p.t, who: p.who });
  E.sort((a, b) => a.t - b.t);
  return (LEAD = E);
}
export function leaderAt(t) { let w = null; for (const e of leaderEvents()) { if (e.t > t) break; w = e.who; } return w; }
// the swing [about x, about z] that hangs the bulb toward a king (the chains are 4.8 m)
const lampTarget = (who) => (who ? [(-zOf(who) * 0.8) / 4.8, (sxOf(who) * 1.2) / 4.8] : [0, 0]);
export function lampSwingAt(t) {
  let T = [0, 0], v0 = [0, 0], t0 = -10;
  const val = (tt) => { const d = tt - t0, r = d <= 0 ? 1 : Math.exp(-3.0 * d) * Math.cos(5.2 * d); return [T[0] + (v0[0] - T[0]) * r, T[1] + (v0[1] - T[1]) * r]; };
  for (const e of leaderEvents()) { if (e.t > t) break; const v = val(e.t); T = lampTarget(e.who); v0 = v; t0 = e.t; }
  if (t > PLUG.spade.bite) { const v = val(PLUG.spade.bite); T = [0, 0]; v0 = v; t0 = PLUG.spade.bite; }
  return val(t);
}
// the lamp's power: full, then half (the red machine drinks it), then an ember
// (when the machines outgrow the hall their cords tear off it, and it burns as before: a small light between two mountains)
export const lampOnAt = (t) => lerp(lerp(lerp(1, 0.5, ease(t, PLUG.heart.bite, PLUG.heart.bite + 0.4)), 0.16, ease(t, PLUG.spade.bite, PLUG.spade.bite + 0.5)), 1, ease(t, MOUNT.t0 + 0.5, MOUNT.t0 + 1.5));
// who sits in the dark, and how deep: the light has left him
const DARK = [
  { who: CLB, t0: R1 + 4.1, t1: OUT.club.pull[1] + 0.5 },
  { who: RED, t0: at('3-01', 2.1), t1: TOY_FIRST + 0.7 },
  { who: DIA, t0: BLK_FIRST + 0.7, t1: OUT.diamond.pull[1] + 0.5 },
  { who: RED, t0: RED_STOP - 0.2, t1: RED_GO + 0.6 },
];
export function darkAt(t) { for (const d of DARK) if (t > d.t0 && t < d.t1) return { who: d.who, k: ease(t, d.t0, d.t0 + 0.8) * (1 - ease(t, d.t1 - 0.4, d.t1)) }; return null; }

// ---------------------------------------------------------------- after the credits: the ant on the stone floor; a foot; from above
export const EGG = {
  from: [2.95, 1.45], dir: [-1, 0], speed: 0.03, t0: at('10-02', -0.6),
  foot: { in: at('10-03', 0.35), hover: at('10-03', 1.15), shift: at('10-03', 2.55), down: at('10-03', 3.25), lift: at('10-03', 3.95) },
  walk: { from: [3.5, 1.9], dir: [0.8, 0.6], speed: 0.42, t0: CUES['10-04'] },
  shadow: at('10-04', 1.5),
};
// the ant stops while the foot hangs over it, then goes on
export function eggAnt(t) {
  const F = EGG.foot, p0 = F.hover - 0.15, p1 = F.shift + 0.5;
  const walked = Math.max(0, Math.min(t, p0) - EGG.t0) + Math.max(0, t - p1);
  const d = walked * EGG.speed;
  return { pos: [EGG.from[0] + EGG.dir[0] * d, FLOOR_Y + 0.0004, EGG.from[1] + EGG.dir[1] * d], dir: EGG.dir, dist: d, stopped: t > p0 && t < p1 };
}
export const eggWalker = (t) => { const W = EGG.walk, d = Math.max(0, t - W.t0) * W.speed; return [W.from[0] + W.dir[0] * d, FLOOR_Y, W.from[1] + W.dir[1] * d]; };
