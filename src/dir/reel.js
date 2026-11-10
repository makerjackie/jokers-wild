// 《喂》 v6 — the state of the world at film time t: four kings, the lamp, the two machines, every card, everything
// fed or taken, the ant. The shots (cams.js) then place the camera. Everything here is a pure function of t.
import { KING, SIDE_SIGN, FLOOR_Y, ENTER_DX, LAMP } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, kick, mulberry32 } from '../util.js';
import { at, face, kingRest } from './core.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { basisQ, slerpQ, mulQ, axisQ, downQ } from '../freecards.js';
import { ANT } from '../ant.js';
import { SLOT, HOPPER, TOP, KEY, BTN_AUTO, BTN_CANCEL, CORD, machinePoint } from '../machine.js';
import * as S from './story.js';

const { RED, BLK, DIA, CLB, FINAL, ALL, SLAM, BLACK, FLOOR_T, MOUNT, EGG, OUT } = S;
const sxOf = (id) => SIDE_SIGN[KING[id].side];
const zOf = S.zOf;
export const headAt = (id) => [sxOf(id) * 1.52, 0.68, zOf(id)];
const mAt = (id, t) => S.machineAt(id, t);
const LAMP_TOP = [LAMP.pos[0], LAMP.pos[1] + 0.2, LAMP.pos[2]];
const R1 = at('2-01');

// ---------------------------------------------------------------- a card in a hand, then slapped down on the pile
function handCard(p, t) {
  const sx = sxOf(p.who), rz = S.rzOf(p.who);
  const H0 = [sx * 0.96, 0.36, zOf(p.who) + rz * 0.14], q0 = basisQ([sx, 0.35, 0], [0, 1, 0]);
  if (t <= p.tr) return { pos: H0, q: q0 };
  const u = clamp((t - p.tr) / (p.t - p.tr)), e = Math.pow(u, 1.7);
  const pos = lerp3(H0, p.rest.pos, e); pos[1] += 0.2 * Math.sin(Math.PI * u) * (1 - 0.4 * u);
  return { pos, q: slerpQ(q0, p.rest.q, smooth(u * 1.2)) };
}
const relOf = (p) => p.tr + 0.62 * (p.t - p.tr);
const grip = (p, t) => { const c = handCard(p, Math.min(t, relOf(p))).pos, sx = sxOf(p.who); return [c[0] + sx * 0.08, c[1] + 0.04, c[2]]; };
// a card out of a machine's slot: it leaves flat and fast, turns in the air, lands flat. Big ones turn slowly.
function machineCard(p, t) {
  const m = mAt(p.who, p.tr), from = machinePoint(m, SLOT);
  const u = clamp((t - p.tr) / (p.t - p.tr)), ex = 1 - (1 - u) * (1 - u), ey = u * u;
  const q0 = basisQ([0, 1, 0], [0, 0, -1]);
  const h = p.final ? 0 : p.far ? 4 : m.floor ? 1.7 + 0.15 * m.S : 0.05 * p.cs;
  const pos = [lerp(from[0], p.rest.pos[0], ex), lerp(from[1], p.rest.pos[1], ey) + h * Math.sin(Math.PI * u), lerp(from[2], p.rest.pos[2], ex)];
  const spin = ((1 - u) * (p.i % 2 ? 1 : -1) * 2.6) / (1 + 0.3 * p.cs);
  return { pos, q: mulQ(axisQ([0, 1, 0], spin), slerpQ(q0, p.rest.q, smooth(u))), scale: p.cs * Math.min(1, 0.3 + (0.7 * u) / 0.12) };
}

// ---------------------------------------------------------------- points the hands go to
const hopPt = (id, dy = 0.1) => (t) => { const p = machinePoint(mAt(id, t), HOPPER); return [p[0] + sxOf(id) * 0.03, p[1] + dy, p[2]]; };
// a point on the machine's back, `out` metres off it toward its king
const backPt = (id, P, out = 0.02) => (t) => { const p = machinePoint(mAt(id, t), P); return [p[0] + sxOf(id) * out, p[1], p[2]]; };
const sleeveAt = (t) => [sxOf(RED) * (1.4 + S.pushOf(RED, t)), 0.36, S.rzOf(RED) * 0.07];       // inside the breast of the red king's robe
const SLEEVE = sleeveAt(0);
const CROWN_BASE = (id, t = 0) => [sxOf(id) * (1.5 + S.pushOf(id, t)), 0.79, 0];
// his crown as the machine pulls it off him: up a little, a tug of war, gone
export function crownSuck(id, t) {
  const C = S.CROWN_SUCK[id], b = CROWN_BASE(id, t);
  if (t < C.lift) return null;
  if (t < C.lose) {
    const up = 0.07 * ease(t, C.lift, C.grab) + (t > C.grab ? 0.05 + 0.04 * Math.sin((t - C.grab) * 19) + 0.03 * ((t - C.grab) / (C.lose - C.grab)) : 0);
    return { pos: [b[0] + 0.012 * Math.sin(t * 31), b[1] + up, b[2] + 0.012 * Math.sin(t * 27)], q: axisQ([0.3, 0, 1], 0.12 * Math.sin(t * 23)), k: 0 };
  }
  if (t >= C.gone) return { gone: 1 };
  const u = (t - C.lose) / (C.gone - C.lose), m = mAt(id, t), mouth = machinePoint(m, HOPPER), a = [b[0], b[1] + 0.15, b[2]];
  const pos = lerp3(a, mouth, u * u); pos[1] += 0.25 * Math.sin(Math.PI * u);
  return { pos, q: axisQ([1, 0, 0.4], u * 9), k: u };
}

// ---------------------------------------------------------------- what the hands do: keyed paths per king and hand
// move = { t0, t1, pose, keys: [[t, point | (t) => point | null (his rest)], ...] }
let MOVES = null;
const REST = null;
function moves() {
  if (MOVES) return MOVES;
  const M = {}; for (const id of ALL) M[id] = { L: [], R: [] };
  const add = (id, side, pose, keys) => M[id][side].push({ t0: keys[0][0], t1: keys[keys.length - 1][0], keys, pose });
  // cards played by hand
  for (const p of S.plays()) if (p.by === 'hand') add(p.who, 'R', 'hold', [[p.tr - 0.4, REST], [p.tr, (t) => grip(p, t)], [relOf(p), (t) => grip(p, t)], [relOf(p) + 0.45, REST]]);
  for (const id of FINAL) {
    const sx = sxOf(id), rz = S.rzOf(id);
    // he brings his machine up from under the table in both hands
    const P = S.PLACE[id];
    const hold = (dz) => (t) => { const m = mAt(id, Math.max(t, P.up)); return [m.pos[0] + sx * 0.05, m.pos[1] + m.S * 0.6, m.pos[2] + dz * (0.3 * m.S + 0.03)]; };
    for (const [side, dz] of [['R', rz], ['L', -rz]]) add(id, side, 'open', [[P.up - 0.45, REST], [P.up, hold(dz)], [P.down + 0.1, hold(dz)], [P.down + 0.42, REST]]);
    // 托管: a finger for the red king, a fist for the black
    const upPt = (P, dy) => (t) => { const p = machinePoint(mAt(id, t), P); return [p[0], p[1] + dy, p[2]]; };
    const tp = S.AUTO_PRESS[id], btn = upPt(BTN_AUTO, 0.015), over = upPt(BTN_AUTO, 0.13);
    add(id, 'R', id === RED ? 'point' : 'fist', [[tp - 0.36, REST], [tp - 0.1, over], [tp, btn], [tp + 0.14, btn], [tp + 0.5, REST]]);
    // the chips are gone: he pats the bare cloth where they were
    const s2 = S.stackAt(id), pat = (t) => [s2[0], 0.03 + 0.06 * Math.abs(Math.sin(t * 9)), s2[1]];
    add(id, 'R', 'open', [[at('5-06', 0.3), REST], [at('5-06', 0.65), pat], [at('5-06', 1.9), pat], [at('5-06', 2.3), REST]]);
    // the cord: out of the machine's back, and thrown up at the lamp
    const G = S.PLUG[id], cordAt = backPt(id, CORD, 0.05), up = [sx * 1.15, 1.3, 0];
    add(id, 'R', 'hold', [[G.throw - 0.9, REST], [G.throw - 0.4, cordAt], [G.throw - 0.25, cordAt], [G.throw, up], [G.throw + 0.25, up], [G.throw + 0.7, REST]]);
    // shouting up at it to stop: both arms
    const wave = (dz, ph) => (t) => [sx * 1.5, 1.3 + 0.07 * Math.sin(t * 10 + ph), dz * (0.3 + 0.12 * Math.sin(t * 10 + ph + 1))];
    const w0 = at('7-02', 1.9), w1 = id === BLK ? S.BLK_STOP + 0.2 : at('7-05', 1.0);
    for (const [side, dz, ph] of [['R', rz, 0], ['L', -rz, 2]]) add(id, side, 'open', [[w0, REST], [w0 + 0.4, wave(dz, ph)], [w1, wave(dz, ph)], [w1 + 0.5, REST]]);
    // 取消: nothing happens. A finger, then the fist, harder and harder
    const C = S.CANCEL[id], pressAt = (t) => { let d = 9; for (const c of C) d = Math.min(d, Math.abs(t - c)); const p = machinePoint(mAt(id, t), BTN_CANCEL); return [p[0], p[1] + 0.015 + Math.min(0.13, d * 0.8), p[2]]; };
    const last = C[C.length - 1];
    if (id === RED) { add(id, 'R', 'point', [[C[0] - 0.4, REST], [C[0] - 0.1, pressAt], [C[1] + 0.2, pressAt]]); add(id, 'R', 'fist', [[C[1] + 0.2, pressAt], [last + 0.1, pressAt], [last + 0.45, REST]]); }
    else add(id, 'R', 'fist', [[C[0] - 0.36, REST], [C[0] - 0.08, pressAt], [last + 0.1, pressAt], [last + 0.45, REST]]);
    // his crown is going: both hands on it; then on his bare head
    const U = S.CROWN_SUCK[id], b = CROWN_BASE(id, U.grab);
    for (const [side, dz] of [['R', rz], ['L', -rz]]) {
      const onIt = (t) => { const c = crownSuck(id, clamp(t, U.lift + 0.001, U.lose - 0.01)); return [c.pos[0], c.pos[1] + 0.03, c.pos[2] + dz * 0.1]; };
      add(id, side, 'hold', [[U.grab - 0.3, REST], [U.grab, onIt], [U.lose, onIt], [U.lose + 0.2, [b[0], b[1] + 0.2, dz * 0.12]], [U.lose + 0.6, [b[0], b[1] - 0.02, dz * 0.1]], [U.gone + 0.7, [b[0], b[1] - 0.02, dz * 0.1]], [U.gone + 1.2, REST]]);
    }
  }
  // the red king pats his toy
  const topPt = (t) => { const p = machinePoint(mAt(RED, t), TOP); return [p[0], p[1] + 0.03 + 0.07 * Math.abs(Math.sin((Math.PI * (t - S.PAT[0])) / 0.3)), p[2]]; };
  add(RED, 'R', 'open', [[S.PAT[0] - 0.35, REST], [S.PAT[0], topPt], [S.PAT[1] + 0.12, topPt], [S.PAT[1] + 0.5, REST]]);
  // feeding by hand
  for (const f of S.FEEDS) {
    if (!S.byHand(f)) continue;
    const id = f.who, sx = sxOf(id), g = S.feedGrab(f), r = S.feedRelease(f);
    if (f.kind === 'dead') {
      const c = S.deadCrownAt(id), cp = [c[0], 0.08, c[1]], toss = [sx * 1.12, 0.98, -0.3], thru = [sx * 1.02, 1.08, -0.2];
      add(id, S.DEAD_HAND[id], 'hold', [[g - 0.45, REST], [g, cp], [g + 0.1, cp], [r, toss], [r + 0.15, thru], [r + 0.6, REST]]);
    } else {
      const s = S.stackAt(id), sp = [s[0], 0.1, s[1]];
      add(id, 'R', 'hold', [[g - 0.3, REST], [g, sp], [g + 0.06, sp], [r, hopPt(id)], [r + 0.12, hopPt(id)], [r + 0.5, REST]]);
    }
  }
  // the red king keeps the last chip: off the cloth, up his left sleeve
  { const s = S.stackAt(RED), sp = [s[0], 0.06, s[1]], P = S.PALM;
    add(RED, 'R', 'hold', [[P.grab - 0.4, REST], [P.grab, sp], [P.grab + 0.25, [s[0], 0.2, s[1]]], [P.hide, [SLEEVE[0] + 0.07, SLEEVE[1], SLEEVE[2]]], [P.hide + 0.25, [SLEEVE[0] + 0.07, SLEEVE[1], SLEEVE[2]]], [P.hide + 0.7, REST]]); }
  // he tries to hold the key: it goes on turning, lifts him, throws him off
  { const G = S.KEYGRAB;
    for (const [side, ph] of [['R', 0], ['L', Math.PI]]) {
      const onKey = (t) => { const p = machinePoint(mAt(RED, t), KEY), a = (Math.max(t, G.on) - G.on) * 5.5 + ph; return [p[0] + sxOf(RED) * 0.04, p[1] + 0.1 * Math.cos(a), p[2] + 0.1 * Math.sin(a)]; };
      add(RED, side, 'fist', [[G.on - 0.4, REST], [G.on, onKey], [G.off, onKey], [G.off + 0.45, REST]]);
    } }
  // the red king has won: both arms straight up; he waves the black king off
  { const sx = sxOf(RED), rz = S.rzOf(RED);
    const V = (dz) => (t) => [sx * 1.5 + 0.02 * Math.sin(t * 13), 1.5 + 0.03 * Math.sin(t * 17 + dz), dz * 0.45];
    const off = (t) => [sx * 1.05, 0.98 + 0.05 * Math.sin(t * 16), rz * 0.25 + 0.08 * Math.sin(t * 16)];
    add(RED, 'L', 'open', [[S.WIN - 0.1, REST], [S.WIN + 0.25, V(-rz)], [SLAM + 0.1, V(-rz)]]);
    add(RED, 'R', 'open', [[S.WIN - 0.1, REST], [S.WIN + 0.25, V(rz)], [at('8-02', 1.5), V(rz)], [at('8-02', 1.75), off], [at('8-02', 2.15), off], [SLAM + 0.1, V(rz)]]); }
  // the black king points up at what is coming
  { const sx = sxOf(BLK), up = (t) => [sx * 1.1 + 0.02 * Math.sin(t * 15), 1.38 + 0.03 * Math.sin(t * 19), 0.05];
    add(BLK, 'R', 'point', [[S.POINT - 0.3, REST], [S.POINT, up], [SLAM, up], [SLAM + 0.6, REST]]); }
  return (MOVES = M);
}
function handFor(id, side, t) {
  const L = moves()[id]?.[side] ?? [];
  let m = null;
  for (const x of L) if (t >= x.t0 && t <= x.t1) m = x;
  if (!m) return null;
  const rest = kingRest(id, side), ev = (p) => (p === REST ? rest : typeof p === 'function' ? p(t) : p);
  const ks = m.keys;
  let i = 0; while (i < ks.length - 2 && t > ks[i + 1][0]) i++;
  const u = smooth((t - ks[i][0]) / Math.max(1e-6, ks[i + 1][0] - ks[i][0]));
  return { target: lerp3(ev(ks[i][1]), ev(ks[i + 1][1]), u), pose: m.pose };
}

// ---------------------------------------------------------------- the kings
const feedOf = (id, kind) => S.FEEDS.find((f) => f.who === id && f.kind === kind);
const lastFeed = (id, t) => { let r = null; for (const f of S.FEEDS) if (f.who === id && f.t <= t) r = f; return r; };
const F = (eyes, brows, mouth) => ({ eyes, brows, mouth });
const LAMP_PT = [0, 2.5, -0.1], PILE = [0, 0.05, 0];
// every landing that shakes the room: [t, weight]
let HITS = null;
function hits() {
  if (HITS) return HITS;
  HITS = [[S.PLACE.spade.down, 3]];
  for (const p of S.plays()) if (p.by === 'machine' && p.cs >= 3) HITS.push([p.t, p.final ? 40 : p.far ? 5 : p.cs]);
  return HITS;
}
// the first round and the two who go: what each of the four does until the machines take over (t < 5-01)
function earlyKing(id, t, K) {
  const sx = sxOf(id), red = id === RED, blk = id === BLK, o = OUT[id];
  const lead = S.leaderAt(t), dark = S.darkAt(t), mine = lead === id, fan = [sx * 1.08, 0.36, zOf(id) - S.rzOf(id) * 0.16];
  const myPlay = S.plays().find((p) => p.by === 'hand' && p.who === id && t > p.tr - 0.35 && t < p.t + 0.3);
  K.look = fan; K.face = F('down', 'flat', 'flat');
  // lit: pleased with himself; just lost the light: sour; in the dark: afraid
  if (lead) { K.look = mine ? PILE : headAt(lead); K.face = mine ? face('proud', { mouth: 'grin' }) : F('side', 'knit', 'frown'); if (mine) K.lean = -0.06; }
  if (myPlay) { K.lean = 0.2; K.rise = 0.22; K.look = PILE; K.face = F('down', 'knit', myPlay.hard ? 'grit' : 'flat'); }
  if (dark?.who === id) { K.sweat = dark.k; K.face = F('wide', 'worried', 'flat'); K.look = t % 2.2 < 1.2 ? PILE : lead && lead !== id ? headAt(lead) : fan; K.lean = 0.1; }
  // someone is being dragged out: everyone watches; then the crown; then the lamp; then their own cards
  for (const d of [CLB, DIA]) {
    const O = OUT[d]; if (d === id) continue;
    if (t > O.pull[0] - 0.5 && t < O.still + 2.6) {
      const seatX = sxOf(d) * (1.55 + ENTER_DX * Math.pow(1 - S.seated(d, t), 3)), cr = S.deadCrownAt(sxOf(d) < 0 ? RED : BLK);
      K.look = t < O.pull[1] + 0.3 ? [seatX, 0.6, zOf(d)] : t < O.still + 0.9 ? [cr[0], 0.05, cr[1]] : t < O.still + 1.8 ? LAMP_PT : fan;
      K.face = t < O.pull[1] + 0.6 ? face('shock') : t < O.still + 1.8 ? F('wide', 'worried', 'flat') : F('down', 'worried', 'flat');
      K.sweat = Math.max(K.sweat, 0.7 * ease(t, O.pull[0], O.still)); K.lean = t < O.pull[1] + 0.6 ? -0.08 : 0.06;
      if (blk && d === DIA && t > O.still) { K.face = face('smug'); K.look = headAt(RED); }
    }
  }
  // dragged out: the light is gone, he looks from face to face; the chair goes
  if (o) {
    if (t > o.pull[0] - 0.9) { K.look = t % 0.5 < 0.25 ? headAt(BLK) : headAt(RED); K.face = face('fear'); K.sweat = 1; }
    if (t >= o.pull[0]) { K.blown = 1; K.face = F('wide', 'worried', 'scream'); K.crown = t > o.pull[0] + 0.12 ? 0 : 1; K.look = PILE; }
  }
  if (id === DIA && t > CUES['3-04'] && t < S.BLK_FIRST + 0.7) { const m = mAt(RED, t) ?? { pos: [-0.74, 0.2, 0] }; K.look = t > CUES['4-01'] ? [0.74, 0.3, 0] : [m.pos[0], 0.2, 0]; K.face = F('narrow', 'knit', 'frown'); }
  if (id === DIA && t > CUES['4-03'] && t < OUT.diamond.pull[0] - 0.9) {
    const u = t - CUES['4-03'];
    K.look = u < 0.7 ? [-0.74, 0.25, 0] : u < 1.4 ? [0.74, 0.3, 0] : u < 2.5 ? PILE : LAMP_PT; K.sweat = 0.6;
    K.face = u < 1.4 ? F('narrow', 'knit', 'frown') : u < 2.5 ? F('down', 'angry', 'grit') : F('up', 'raised', 'flat');
    if (t > CUES['4-04']) K.face = F('up', 'worried', 'slack');
  }
  void red;
}
function kingsState(t, st) {
  const P = S.plays();
  for (const id of ALL) {
    const sx = sxOf(id), red = id === RED, fin = FINAL.includes(id), o = fin ? S.otherOf(id) : null;
    const K = st.kings[id] = { look: PILE, face: face('calm'), hand: { L: 'rest', R: 'rest' }, rise: 0, lean: 0.06, sweat: 0, slump: 0, blown: 0, crown: 1 };
    const seat = S.seated(id, t);
    if (seat <= 0) { K.enter = 0; continue; }
    if (seat < 1) K.enter = Math.max(0.002, seat);
    if (red && t >= SLAM) { K.enter = 0; continue; }
    if (id === BLK && t >= S.BACK[0]) K.enter = lerp(1, 0.03, ease(t, S.BACK[0], S.BACK[1]));
    if (id === BLK && t >= CUES.egg) { K.empty = 1; continue; }
    if (fin && t >= S.CROWN_SUCK[id].lift) K.crown = 0;
    if (fin) { const push = S.pushOf(id, t); if (push > 0.0005) K.enter = 1 - Math.cbrt(push / ENTER_DX); }
    const m = fin ? mAt(id, t) : null, mo = fin ? mAt(o, t) : null;
    const mine = m ? machinePoint(m, TOP) : [sx * 0.74, 0.2, 0], theirs = mo ? machinePoint(mo, TOP) : [-sx * 0.74, 0.2, 0];
    const up = (k = 0.5) => (m ? [m.pos[0] * 0.9, m.pos[1] + m.S * k, 0] : mine);
    const fed = fin ? lastFeed(id, t) : null, glee = fed && t - fed.t < 0.9 && t - fed.t > 0.15;
    if (t < CUES['5-01']) {
      earlyKing(id, t, K);
      // ---- the red king's toy: up from under the table; 托管; the first "tak"; an Ace on the King
      if (red && t >= CUES['3-02'] && t < CUES['3-04']) { K.look = t < CUES['3-03'] ? [sx * 1.08, 0.36, 0.16] : [1.0, 0.05, -0.95]; K.face = t < CUES['3-03'] ? face('worry', { eyes: 'down' }) : F('wide', 'worried', 'flat'); }
      if (red && t >= CUES['3-04']) {
        const PL = S.PLACE.heart, land = S.TOY_FIRST + 0.43;
        K.sweat = 1 - ease(t, land, land + 1.5);
        if (t < PL.up + 0.3) { K.look = [sx * 1.2, 0.0, 0.1]; K.face = F('down', 'knit', 'grit'); K.lean = 0.2; }
        else if (t < land) { K.look = t > S.AUTO_PRESS.heart - 0.6 && t < S.AUTO_PRESS.heart + 0.3 ? machinePoint(m, BTN_AUTO) : mine; K.face = F('wide', 'raised', 'flat'); K.lean = t < PL.down ? 0.24 : t > S.AUTO_PRESS.heart - 0.9 && t < S.AUTO_PRESS.heart + 0.5 ? 0.0 : 0.14; K.rise = t < PL.down ? 0.25 : 0.05; }
        else if (t < CUES['4-01']) { K.look = t < S.PAT[1] + 0.3 ? mine : headAt(BLK); K.face = t < S.PAT[1] + 0.3 ? face('proud', { mouth: 'grin' }) : face('smug'); K.lean = t < S.PAT[1] + 0.4 ? 0.14 : -0.08; }
        else if (t < S.BLK_FIRST + 0.6) { K.look = theirs; K.face = F('wide', 'worried', 'flat'); }
        else if (t >= CUES['4-05']) { K.look = Math.sin(t * 0.9) > 0 ? PILE : headAt(BLK); K.face = Math.sin(t * 2.3 + 1) > 0.1 ? face('laugh') : face('proud', { mouth: 'grin' }); K.lean = -0.14; }
      }
      // ---- the black king: his smile goes; a bigger one; a fist on 托管
      if (id === BLK && t >= CUES['3-04']) {
        const PL = S.PLACE.spade, land = S.TOY_FIRST + 0.43;
        if (t < land) { K.look = mAt(RED, t) ? theirs : headAt(RED); K.face = F('narrow', 'raised', 'flat'); K.lean = -0.08; }
        else if (t < PL.up - 0.3) { K.look = t < CUES['3-07'] + 0.9 ? PILE : headAt(RED); K.face = t < CUES['3-07'] + 0.9 ? F('wide', 'worried', 'flat') : face('angry', { mouth: 'grit' }); K.lean = 0.12; }
        else if (t < S.AUTO_PRESS.spade + 0.3) { K.look = t < PL.up + 0.2 ? [sx * 1.2, 0, 0.1] : mine; K.face = face('angry', { mouth: 'grit' }); K.lean = 0.25; K.rise = 0.35; }
        else if (t < CUES['4-03']) { K.look = t < S.BLK_FIRST + 0.5 ? mine : headAt(RED); K.face = face('proud', { mouth: 'grin' }); K.lean = -0.1; }
        else if (t < CUES['4-05']) { if (t < OUT.diamond.pull[0] - 0.5) { K.look = headAt(DIA); K.face = face('smug'); } }
        else { K.look = Math.sin(t * 0.9 + 2) > 0 ? PILE : headAt(RED); K.face = Math.sin(t * 2.6) > 0 ? face('laugh') : face('proud', { mouth: 'grin' }); K.lean = -0.16; }
      }
    } else if (t < CUES['5-05']) {
      // ---- feeding: chips, more chips. Each watches his own funnel; a grin when it swells; the other one stares
      const act = moves()[id].R.some((x) => t > x.t0 && t < x.t1);
      K.lean = 0.16; K.rise = act ? 0.22 : 0.08; K.sweat = 0.5 * ease(t, CUES['5-03'], CUES['5-05']);
      K.look = act ? (m ? machinePoint(m, HOPPER) : mine) : theirs;
      K.face = glee ? face('proud', { mouth: 'grin', eyes: 'wide' }) : act ? F('down', 'knit', 'grit') : F('wide', 'worried', 'flat');
      if (t < CUES['5-02']) { K.look = red ? mine : headAt(RED); K.face = red ? face('worry') : face('laugh'); K.lean = red ? 0.16 : -0.14; K.rise = 0; }
      if (red && t >= CUES['5-02'] && t < S.RED_GO - 0.5 && !glee) K.face = F('down', 'knit', 'flat');
      if (red && t > at('5-02', 1.5) && t < at('5-02', 2.0)) K.face = face('shock');
    } else if (t < CUES['5-07']) {
      // ---- the last chip goes up the red king's sleeve; nothing left to feed
      K.sweat = 0.8; K.lean = 0.12;
      const s2 = S.stackAt(id);
      if (t < CUES['5-06']) {
        if (red) { K.look = t < at('5-05', 0.35) ? [s2[0], 0, s2[1]] : t < at('5-05', 1.3) ? headAt(BLK) : SLEEVE; K.face = t < at('5-05', 0.35) ? F('down', 'worried', 'flat') : F('side', 'arch', 'smirk'); }
        else { K.look = mine; K.face = F('down', 'knit', 'flat'); }
      } else { K.look = t < at('5-06', 1.9) ? [s2[0], 0, s2[1]] : LAMP_PT; K.face = face('worry', { eyes: t < at('5-06', 1.9) ? 'down' : 'up' }); K.sweat = 1; }
    } else if (t < CUES['5-09']) {
      // ---- the lamp: he throws the cord up at it. The hall goes dark; the machines shine
      const G = S.PLUG[id];
      K.sweat = 1;
      if (t < G.throw - 0.9) { K.look = LAMP_PT; K.face = red || t > S.PLUG.heart.bite ? F('up', 'knit', 'flat') : F('up', 'worried', 'flat'); if (!red && t > S.PLUG.heart.bite + 0.2) K.face = F('up', 'angry', 'grit'); }
      else if (t < G.bite) { K.look = t < G.throw - 0.3 ? machinePoint(m, CORD) : LAMP_PT; K.face = F('up', 'knit', 'grit'); K.rise = 0.4 * ease(t, G.throw - 0.4, G.throw); K.lean = -0.1; }
      else { K.look = t < G.bite + 0.5 ? LAMP_PT : mine; K.face = face('proud', { mouth: 'grin', eyes: 'wide' }); K.lean = 0.05; }
    } else if (t < CUES['6-01']) {
      // ---- the crowns of the dead
      const d = feedOf(id, 'dead'), dg = S.feedGrab(d), dc = S.deadCrownAt(id);
      K.sweat = 1; K.lean = 0.14; K.rise = 0.1; K.look = mine; K.face = F('down', 'knit', 'flat');
      if (t > dg - 1.0) { K.look = [dc[0], 0.05, dc[1]]; K.face = F('narrow', 'knit', 'flat'); }
      if (t > dg + 0.15) { K.look = machinePoint(m, HOPPER); K.face = F('narrow', 'knit', 'grit'); K.rise = 0.3; }
      if (t > d.t + 0.1) { K.look = up(0.8); K.face = face('proud', { mouth: 'grin', eyes: 'wide' }); K.rise = 0.1; K.lean = 0.0; }
      if (red && t > S.feedGrab(feedOf(BLK, 'dead')) && t < CUES['5-10'] + 0.3) { K.look = [1.0, 0.4, -0.6]; K.face = face('shock'); }
    } else if (t < FLOOR_T) {
      // ---- cards nobody can read; then the machines take for themselves
      const u6 = t - CUES['6-01'];
      K.sweat = 1; K.lean = 0.1;
      if (t < CUES['6-02']) { K.look = u6 < 1.3 ? PILE : headAt(o); K.face = u6 < 1.3 ? F('narrow', 'knit', 'flat') : u6 < 1.9 ? F('side', 'raised', 'flat') : face('proud', { mouth: 'grin' }); K.lean = u6 < 1.3 ? 0.24 : 0.04; }
      else if (red) {
        const SC = S.SUCK_CHIP, U = S.CROWN_SUCK.heart, G = S.KEYGRAB;
        if (t < CUES['6-03']) { K.look = t < SC.out - 0.25 ? PILE : t < SC.out + 0.1 ? sleeveAt(t) : t < SC.gone + 0.2 ? machinePoint(m, HOPPER) : sleeveAt(t); K.face = t < SC.out - 0.25 ? face('proud', { mouth: 'grin' }) : t < SC.gone + 0.3 ? face('shock') : F('down', 'worried', 'slack'); }
        else if (t < CUES['6-04']) { K.look = machinePoint(m, BTN_CANCEL); K.face = t < S.CANCEL.heart[2] ? F('down', 'worried', 'flat') : face('fear', { eyes: 'down' }); K.lean = 0.2; K.rise = 0.15; }
        else if (t < CUES['6-05']) { const lift = ease(t, G.on, G.on + 0.5) * (1 - ease(t, G.off, G.off + 0.12)); K.look = machinePoint(m, KEY); K.face = F('glare', 'angry', 'grit'); K.rise = 0.2 + 0.7 * lift; K.lean = 0.2; if (t > G.off) { K.blown = Math.exp(-(t - G.off) * 3); K.face = face('shock'); K.rise = 0; } }
        else if (t < U.gone + 0.5) { const c = crownSuck(RED, t); K.look = c?.pos ?? machinePoint(m, HOPPER); K.face = t < U.grab ? F('up', 'raised', 'slack') : t < U.lose ? F('up', 'worried', 'grit') : face('shock'); K.rise = t > U.grab && t < U.lose ? 0.35 : 0; K.lean = -0.05; }
        else { K.look = up(0.8); K.face = face('fear'); K.blown = 0.5 * ease(t, at('6-07', 0.2), FLOOR_T); }
      } else {
        const U = S.CROWN_SUCK.spade, C = S.CANCEL.spade;
        if (t < CUES['6-06']) { K.look = t < CUES['6-03'] ? PILE : t < CUES['6-05'] ? theirs : mine; K.face = t < CUES['6-03'] ? face('proud', { mouth: 'grin' }) : F('wide', 'worried', 'flat'); if (t > CUES['6-05'] + 1.9) K.face = face('fear'); }
        else if (t < U.lift) { K.look = machinePoint(m, BTN_CANCEL); K.face = face('fear', { eyes: 'down' }); K.lean = 0.2; K.rise = 0.15; void C; }
        else if (t < U.gone + 0.4) { const c = crownSuck(BLK, t); K.look = c?.pos ?? machinePoint(m, HOPPER); K.face = t < U.lose ? F('up', 'worried', 'grit') : face('shock'); K.rise = t > U.grab && t < U.lose ? 0.3 : 0; }
        else { K.look = up(0.8); K.face = face('fear'); K.blown = 0.5 * ease(t, at('6-07', 0.2), FLOOR_T); }
      }
    } else if (t < MOUNT.t0) {
      // ---- the machines stand behind them now; a card as big as half the table; nobody laughs
      const big = P.filter((p) => p.by === 'machine' && !p.far && p.cs >= 5 && t > p.t && t < p.t + 1.4).pop();
      K.sweat = 1; K.lean = 0.12; K.slump = 0.02; K.look = t < CUES['6-08'] ? up(0.7) : PILE; K.face = face('fear', { eyes: t < CUES['6-08'] ? 'up' : 'wide' });
      if (big) { const d = t - big.t; K.blown = Math.exp(-d * 2.6) * Math.min(1, d / 0.06); K.face = d < 0.5 ? face('shock') : face('shut'); }
    } else if (t < CUES['7-04']) {
      // ---- two mountains. They look up; then they shout at them to stop
      K.sweat = 1; K.look = t < CUES['7-02'] ? up(0.6) : t < at('7-02', 1.6) ? [sx * 2, 9, -4] : up(0.5);
      K.face = t < at('7-02', 1.6) ? F('up', 'worried', 'slack') : Math.sin(t * 6 + sx) > -0.4 ? F('wide', 'worried', 'scream') : F('wide', 'worried', 'open');
      K.lean = -0.1; K.rise = t >= at('7-02', 1.9) ? 0.55 : 0; if (K.rise) K.lean = -0.3;
      if (t > CUES['7-02'] && t < at('7-02', 1.6)) { const far = P.filter((p) => p.far && t > p.t && t < p.t + 0.8).pop(); if (far) K.blown = 0.3 * Math.exp(-(t - far.t) * 4); }
    } else {
      // ---- the black machine starves; the red king believes again; the last card
      K.sweat = 1;
      if (!red) {
        const s0 = S.BLK_STOP, dead = [sx * 9, 9, 0];
        K.rise = t < s0 + 0.2 ? 0.55 : lerp(0.55, 0, ease(t, s0 + 0.2, s0 + 0.9)); K.lean = K.rise > 0.01 ? -0.3 * (K.rise / 0.55) : 0.05;
        K.look = t < S.POINT - 0.8 ? dead : [-7.5, 13, 0];
        K.face = t < s0 ? (Math.sin(t * 6 + 1) > -0.4 ? F('wide', 'worried', 'scream') : F('wide', 'worried', 'open')) : t < s0 + 1.0 ? F('up', 'raised', 'slack') : t < S.POINT - 0.8 ? F('up', 'worried', 'flat') : t < S.POINT ? face('fear', { eyes: 'up' }) : F('wide', 'worried', 'scream');
        if (t > S.POINT + 0.5 && t < SLAM) { K.look = t % 0.9 < 0.5 ? headAt(RED) : [-7.5, 13, 0]; K.rise = 0.5; K.lean = -0.1; }
        if (t >= SLAM) {
          const d = t - SLAM, g = glassesAt(Math.max(t, S.GLASSES.t0 + 0.01));
          K.blown = Math.exp(-d * 2.2) * Math.min(1, d / 0.05); K.rise = 0; K.lean = 0.02;
          K.look = t < S.GLASSES.t0 ? [-0.6, 0.5, 0.2] : t < CUES['8-05'] ? g.pos : t < CUES['8-05'] + 1.4 ? [-8, 14, 0] : [0, 0.3, 0.2];
          K.face = t < CUES['8-05'] ? F('blank', 'worried', 'o') : F('wide', 'worried', 'flat');
          if (t > CUES['8-05']) { const far = P.filter((p) => p.far && t > p.t && t < p.t + 0.8).pop(); if (far) K.blown = 0.35 * Math.exp(-(t - far.t) * 4); }
        }
      } else {
        const u = t - CUES['7-05'], won = t >= S.WIN, j = ease(t, S.WIN, S.WIN + 0.25), theirDead = [9, 9, 0];
        K.rise = won ? j : u < 1.0 ? 0.55 : lerp(0.55, 0.1, ease(u, 1.0, 1.4)); K.lean = won ? lerp(-0.05, -0.52, j) : u < 1.0 ? -0.3 : -0.05;
        K.look = u < 1.0 ? [1.2, 1.5, 0.3] : u < 2.5 ? theirDead : !won ? headAt(BLK) : t < S.WIN + 1.2 ? headAt(BLK) : [-0.4, 6, 0.3];
        K.face = u < 1.0 ? (Math.sin(t * 6) > -0.4 ? F('wide', 'worried', 'scream') : F('wide', 'worried', 'open')) : u < 2.5 ? F('wide', 'raised', 'flat') : u < 2.7 ? F('side', 'raised', 'flat') : !won ? F('narrow', 'arch', 'smirk') : Math.sin(t * 7) > -0.5 ? face('laugh') : face('proud', { mouth: 'grin' });
        if (t < CUES['7-05']) { K.rise = 0.55; K.lean = -0.3; K.look = up(0.5); K.face = Math.sin(t * 6) > -0.4 ? F('wide', 'worried', 'scream') : F('wide', 'worried', 'open'); }
      }
    }
    // ---- the arms
    for (const side of ['L', 'R']) {
      const h = handFor(id, side, t);
      if (h) { K['arm' + side] = { target: h.target, pole: [sx * 0.4, -0.8, 0] }; K.hand[side] = h.pose; }
    }
    // dragged away: both hands out for the table's edge
    if (OUT[id] && t >= OUT[id].pull[0] - 0.12) { const z = zOf(id); K.armL = { target: [sx * 1.12, 0.12, z - 0.2], pole: [sx * 0.4, -0.8, 0] }; K.armR = { target: [sx * 1.12, 0.12, z + 0.2], pole: [sx * 0.4, -0.8, 0] }; K.hand = { L: 'open', R: 'open' }; }
    // the fan of cards in his left hand, until he lays it down for the machine (or is dragged off with it)
    const fd = fin ? S.PLACE[id].up - 0.5 : 1e9;
    if (t < fd && !K.armL && S.inGame(id, t)) { K.armL = { target: [sx * 1.08, 0.36, zOf(id) - S.rzOf(id) * 0.16], pole: [sx * 0.4, -0.8, 0] }; K.hand.L = 'hold'; }
  }
}

// ---------------------------------------------------------------- the machines
let MP = null, KEYS = null;
const myPlays = (id) => (MP ??= { heart: S.plays().filter((p) => p.by === 'machine' && p.who === RED), spade: S.plays().filter((p) => p.by === 'machine' && p.who === BLK) })[id];
const tsOf = (Sz) => clamp(0.7 + 0.3 * Sz, 1, 8);
function keyAt(id, t) {
  if (!KEYS) {
    KEYS = {};
    for (const k of FINAL) {
      const a = [0]; let v = 0;
      for (let i = 1; i * 0.05 < CUES.fin + 1; i++) {
        const tt = i * 0.05;
        let r = S.running(k, tt) ? 7 / (1 + 0.5 * S.sizeAt(k, tt)) : 0;
        const stop = k === RED ? S.RED_STOP : S.BLK_STOP;
        if (tt < stop) r *= 1 - 0.85 * clamp((tt - (stop - 2.2)) / 2.2);
        v += r * 0.05; a.push(v);
      }
      KEYS[k] = a;
    }
  }
  const a = KEYS[id], x = clamp(t / 0.05, 0, a.length - 1.001), i = Math.floor(x);
  return lerp(a[i], a[i + 1], x - i);
}
// the plug of a machine's cord: in his hand, thrown, biting the lamp
function plugAt(id, t) {
  const G = S.PLUG[id];
  if (t < G.throw - 0.4 || t > MOUNT.t0 + 0.4) return null;
  const hand = [sxOf(id) * 1.15, 1.3, 0];
  if (t < G.throw) { const m = mAt(id, t), a = machinePoint(m, CORD); return { to: lerp3([a[0] + sxOf(id) * 0.06, a[1], a[2]], hand, ease(t, G.throw - 0.25, G.throw)), sag: 0.05 }; }
  if (t < G.bite) { const u = (t - G.throw) / (G.bite - G.throw), p = lerp3(hand, LAMP_TOP, u); p[1] += 0.35 * Math.sin(Math.PI * u); return { to: p, sag: 0.15 }; }
  return { to: LAMP_TOP, sag: 0.28 + 0.04 * Math.exp(-(t - G.bite) * 3) * Math.sin((t - G.bite) * 14) };
}
function machinesState(t, st) {
  const out = st.machines = { chips: [] };
  for (const id of FINAL) {
    const m = mAt(id, t);
    if (!m) continue;
    const ts = tsOf(m.S), fall = 0.07 * ts, up = 0.28 * ts, run = S.running(id, t);
    let strike = run ? 0 : 1, flash = 0;
    for (const p of myPlays(id)) {
      const d = t - p.tr;
      if (d < -fall) break;
      if (d <= 0) strike = Math.max(strike, ((d + fall) / fall) ** 2);
      else if (d < up) strike = Math.max(strike, 1 - smooth(d / up));
      if (d > 0 && d < 0.6 * ts) flash = Math.max(flash, Math.exp((-d * 6) / ts));
    }
    const pw = ease(t, S.PLUG[id].bite, S.PLUG[id].bite + 0.4);
    let lit = Math.max(0.16 * pw, t >= FLOOR_T ? 0.22 + 0.33 * ease(t, MOUNT.t0, MOUNT.t1) : 0);
    if (id === BLK) lit *= lerp(1, 0.22, ease(t, S.BLK_STOP, S.BLK_STOP + 1.6));
    const glow = (run ? 0.4 + 0.5 * pw : 0.03) + 0.6 * flash;
    out[id] = { show: 1, pos: m.pos, yaw: m.yaw, S: m.S, gulp: S.gulpAt(id, t), strike, key: keyAt(id, t), glow, lit, auto: S.autoOn(id, t) ? 1 : 0 };
    const pl = plugAt(id, t);
    if (pl) out[id].cord = { ...pl, r: 0.026 };
    // the light out of its slot: once the lamp is its food, this is what the kings are lit by
    if (pw > 0) {
      const sp = machinePoint(m, SLOT), sx = sxOf(id), k = pw * (0.45 + 0.9 * glow) * (id === BLK ? lerp(1, 0, ease(t, S.BLK_STOP, S.BLK_STOP + 1.6)) : 1);
      st.look[id === RED ? 'p2' : 'p3'] = { pos: [sp[0] - sx * (0.25 + 0.4 * m.S), sp[1] + 0.25 * m.S, 0], col: id === RED ? [0.8 * k, 0.46 * k, 0.2 * k] : [0.55 * k, 0.5 * k, 0.44 * k], range: Math.min(70, 2.6 + 2.0 * m.S) };
    }
  }
  // ---- chips: each king's stack; the ones in a hand; the ones falling into a funnel
  const CS = 2.7, CH = 0.0046 * CS;
  for (const id of FINAL) {
    const [x, z] = S.stackAt(id), n = S.chipsLeft(id, t), kind = 'GOLD', r = mulberry32(id === RED ? 5 : 9);
    for (let i = 0; i < S.STACK_N; i++) {
      const c = Math.floor(i / 10), j = i % 10, jx = (r() - 0.5) * 0.004, jz = (r() - 0.5) * 0.004, ry = r() * 6.28;
      if (i >= n) continue;
      out.chips.push({ pos: [x + jx, (j + 0.5) * CH, z + (c - 1) * 0.1 + jz], rot: [0, ry, 0], kind, s: CS });
    }
  }
  for (const f of S.FEEDS) {
    if (!f.n) continue;
    const g = S.feedGrab(f), rel = S.feedRelease(f), id = f.who, kind = 'GOLD';
    if (t < g || t > f.t + 0.25) continue;
    const m = mAt(id, t), mouth = machinePoint(m, HOPPER);
    for (let j = 0; j < f.n; j++) {
      const mix = t < rel ? 0 : smooth((t - rel - j * 0.022) / 0.2);
      if (mix >= 1) continue;
      out.chips.push({ hand: { id, side: 'R', off: [0, -0.035 - j * CH, 0], mix, to: [mouth[0], mouth[1] - 0.02 * m.S, mouth[2]] }, rot: [mix * 2 + j, j * 1.3, mix * 3], kind, s: CS });
    }
  }
  // the chip the red king keeps: in his fingers, up his sleeve; later it comes out by itself
  { const P = S.PALM, C = S.SUCK_CHIP;
    if (t >= P.grab && t < P.hide + 0.2) out.chips.push({ hand: { id: RED, side: 'R', off: [0, -0.04, 0], mix: ease(t, P.hide, P.hide + 0.2), to: SLEEVE }, rot: [1.2, 0.4, 0], kind: 'GOLD', s: CS });
    if (t >= C.out && t < C.gone) { const u = (t - C.out) / (C.gone - C.out), m = mAt(RED, t), mouth = machinePoint(m, HOPPER), p = lerp3(sleeveAt(t), mouth, u * u * (3 - 2 * u)); p[1] += 0.3 * Math.sin(Math.PI * u); out.chips.push({ pos: p, rot: [u * 9, u * 5, 1.2], kind: 'GOLD', s: CS }); } }
  // the hall, eaten: stone and cloth streaming up into the two funnels
  if (t > S.HALL_GONE - 0.9 && t < MOUNT.t1 + 0.3) {
    const r = mulberry32(4242);
    for (let i = 0; i < 150; i++) {
      const id = i % 2 ? RED : BLK, sx = sxOf(id), t0 = S.HALL_GONE - 0.9 + r() * 3.0, from = [sx * (2.6 + r() * 2.9), FLOOR_Y + r() * 7, -5.2 + r() * 15], sc = 5 + r() * 11, ph = r() * 6.28;
      const u = (t - t0) / 1.25;
      if (u <= 0 || u >= 1) continue;
      const m = mAt(id, t), mouth = machinePoint(m, HOPPER), e = u * u, p = lerp3(from, mouth, e), sw = (1 - e) * 1.6;
      out.chips.push({ pos: [p[0] + Math.cos(ph + u * 7) * sw, p[1] + m.S * 0.5 * Math.sin(Math.PI * u), p[2] + Math.sin(ph + u * 7) * sw], rot: [u * 8 + ph, ph, u * 6], kind: 'CN', s: sc * (1 - 0.5 * e) });
    }
  }
}

// ---------------------------------------------------------------- cards
const FAN = { heart: ['3', '5', '6'], spade: ['10', '8', '6'], diamond: ['7', '4', '2'], club: ['4', '3', '2'] };
function cardsState(t, st) {
  const out = st.free;
  // a few small cards already on the cloth
  { const r = mulberry32(77);
    for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = 0.03 + 0.09 * Math.sqrt(r()), id = ALL[k % 4]; out.push({ pos: [Math.cos(a) * d, 0.0008 + k * 0.0004, Math.sin(a) * d], q: basisQ([0, 1, 0], [Math.cos(a * 3), 0, Math.sin(a * 3)]), scale: 1, face: S.card(id, ['2', '4', '3', '6', '5', '8', '4'][k]), back: sxOf(id) < 0 ? CELL.backCN : CELL.backUS }); } }
  for (const p of S.plays()) {
    if (t >= BLACK && t < CUES.egg) break;
    const base = { face: p.face, back: p.back, scale: p.cs, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.glyph ? 0.5 : 0, glow: p.far || p.final ? 0.3 : p.glyph ? 0.22 : p.by === 'machine' ? 0.12 : 0 };
    if (t >= p.t) { out.push({ ...base, pos: p.rest.pos, q: p.rest.q }); continue; }
    if (p.by === 'hand') { if (t > p.tr - 0.35) out.push({ ...base, ...handCard(p, t) }); continue; }
    if (t >= p.tr) out.push({ ...base, ...machineCard(p, t) });
  }
  // after the credits: the shadow that comes over the man has the shape of a card
  if (t > EGG.shadow && t < CUES.end) { const w = S.eggWalker(t), u = clamp((t - EGG.shadow) / (CUES.end - EGG.shadow)), sc = 34;
    out.push({ pos: [w[0] - CARD.W * sc * (1.05 - 0.75 * u * u), FLOOR_Y + 0.012, w[2] - 0.6], q: basisQ([0, 1, 0], [0.12, 0, -1]), scale: sc, face: CELL.backBlack, back: CELL.backBlack, dim: 1 }); }
  // the fans in their left hands; laid face down when the machines come out; gone with a king who is dragged off
  for (const id of ALL) {
    if (!S.inGame(id, t)) continue;
    const sx = sxOf(id), rz = S.rzOf(id), fin = FINAL.includes(id), fd = fin ? S.PLACE[id].up - 0.5 : 1e9, mix = ease(t, fd, fd + 0.35);
    FAN[id].forEach((r, i) => {
      const to = { pos: [sx * 1.02, 0.003 + i * 0.004, zOf(id) - rz * (0.34 + i * 0.012)], q: downQ(0.2 * (i - 1), -1) };
      const c = { face: S.card(id, r), back: sx < 0 ? CELL.backCN : CELL.backUS, scale: 1, glow: 0.75 * (1 - mix) };
      if (mix >= 1) { if (t < FLOOR_T) out.push({ ...c, ...to }); } else out.push({ ...c, hand: { id, side: 'L', fan: i - 1, mix, to } });
    });
  }
}

// ---------------------------------------------------------------- small things: the crumb, the crowns, the glasses
export function glassesAt(t) {
  const G = S.GLASSES, fp = S.finalPlay();
  const A = [S.FINAL_XR - 0.03, 0.27], B = [S.FINAL_XR + 0.33, 0.4];
  const u = clamp((t - G.t0) / (G.t1 - G.t0)), e = 1 - (1 - u) ** 3;
  const rock = u >= 1 ? Math.exp(-(t - G.t1) * 3.5) * Math.sin((t - G.t1) * 15) * 0.22 : 0.12 * Math.sin(u * 16);
  return { kind: 'glasses', pos: [lerp(A[0], B[0], e), fp.edgeY + 0.006 + Math.abs(rock) * 0.012, lerp(A[1], B[1], e)], q: mulQ(axisQ([0, 1, 0], 0.5 + 1.5 * e), axisQ([0, 0, 1], rock)), scale: 1.5 };
}
function rollersState(t) {
  const R = [];
  if (t >= S.CRUSH + 0.6 && t < CUES['1-07'] + 1.0) {
    const u = clamp((t - (CUES['1-06'] + 0.3)) / 1.1), e = 1 - (1 - u) * (1 - u);
    R.push({ kind: 'crumb', pos: [S.ANT_CRUSH[0] - 0.02 - 0.07 * e, 0.0022, S.ANT_CRUSH[1] + 0.05 + 0.08 * e], q: axisQ([1, 0, -0.3], e * 9), scale: 1 });
  }
  for (const id of FINAL) {
    const d = S.DEAD_OF[id], O = OUT[d], f = S.FEEDS.find((x) => x.who === id && x.kind === 'dead'), g = S.feedGrab(f), rel = S.feedRelease(f);
    const c = S.deadCrownAt(id), rest = [c[0], 0.002, c[1]], sc = 1, side = S.DEAD_HAND[id];
    // the dead king's crown: off his head as he is dragged away, down on the cloth, spinning to a stop; later fed
    if (t >= O.pull[0] + 0.12 && t < f.t) {
      if (t < O.crown) {
        const u = (t - (O.pull[0] + 0.12)) / (O.crown - O.pull[0] - 0.12), h = [sxOf(d) * 1.5, 0.82, zOf(d)], p = lerp3(h, rest, u); p[1] += 0.25 * Math.sin(Math.PI * u);
        R.push({ kind: 'crown', of: d, pos: p, q: axisQ([0.4, 0, 1], u * 5 * sxOf(d)), scale: sc });
      } else if (t < g) {
        const s = clamp((t - O.crown) / (O.still - O.crown)), wob = (1 - s) * (1 - s) * 0.55 * Math.abs(Math.sin((t - O.crown) * (9 + 9 * s)));
        R.push({ kind: 'crown', of: d, pos: [rest[0], rest[1] + wob * 0.05, rest[2]], q: mulQ(axisQ([0, 1, 0], (t - O.crown) * 9 * (1 - s) * (1 - s) + 1), axisQ([1, 0, 0], wob)), scale: sc });
      } else if (t < rel) R.push({ kind: 'crown', of: d, hand: { id, side, off: [0, -0.07, 0], mix: 1 - ease(t, g, g + 0.16), to: rest }, q: axisQ([0, 1, 0], 0.6), scale: sc });
      else {
        const u = clamp((t - rel) / (f.t - rel)), m = mAt(id, t), mouth = machinePoint(m, HOPPER);
        R.push({ kind: 'crown', of: d, hand: { id, side, off: [0, -0.07, 0], mix: Math.pow(u, 0.8), to: [mouth[0], mouth[1] + (0.25 + 0.2 * m.S) * Math.sin(Math.PI * u) * (1 - u) * 2, mouth[2]] }, q: axisQ([1, 0, 0.4], u * 7), scale: sc * (1 - 0.3 * u * u) });
      }
    }
    // his own: the machine takes it
    const cs = crownSuck(id, t);
    if (cs && !cs.gone) R.push({ kind: 'crown', of: id, pos: cs.pos, q: cs.q, scale: sc * (1 - 0.35 * cs.k) });
  }
  if (t >= S.GLASSES.t0 && t < BLACK) R.push(glassesAt(t));
  return R;
}

// ---------------------------------------------------------------- the ant (the first one; and the one on the floor, after)
function antState(t) {
  if (t >= CUES.egg) {
    const a = S.eggAnt(t);
    return { show: t < CUES['10-04'] ? 1 : 0, pos: a.pos, q: basisQ([a.dir[0], 0, a.dir[1]], [0, 1, 0]), walk: a.dist / ANT.STRIDE, speed: a.stopped ? 0 : 1, alert: a.stopped ? 1 : 0, crumb: 1, crumbTilt: 0, size: 1 };
  }
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  return { show: 1, pos: A.pos, q: basisQ([dx, 0, dz], [0, 1, 0]), walk: A.dist / ANT.STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 1, crumbTilt: 0, size: 1 };
}
// the foot: it swings in over the ant, hangs, moves aside, comes down softly, walks on
function footState(t) {
  const Ft = EGG.foot;
  if (t < Ft.in || t > Ft.lift + 0.9) return { show: 0 };
  const A = S.eggAnt(Ft.hover).pos, y0 = FLOOR_Y;
  const P0 = [A[0] - 0.46, y0 + 0.2, A[2] - 0.02], P1 = [A[0] - 0.035, y0 + 0.062, A[2] - 0.012], P2 = [A[0] - 0.02, y0, A[2] - 0.17], P3 = [A[0] + 0.5, y0 + 0.14, A[2] - 0.17];
  let pos, pitch;
  if (t < Ft.hover) { const u = (t - Ft.in) / (Ft.hover - Ft.in), e = 1 - (1 - u) ** 3; pos = lerp3(P0, P1, e); pos[1] += 0.05 * Math.sin(Math.PI * e); pitch = lerp(0.45, -0.28, e); }
  else if (t < Ft.shift) { const w = 0.0025 * Math.sin((t - Ft.hover) * 21); pos = [P1[0], P1[1] + w, P1[2]]; pitch = -0.28 + 0.02 * Math.sin((t - Ft.hover) * 17); }
  else if (t < Ft.down) { const e = smooth((t - Ft.shift) / (Ft.down - Ft.shift)); pos = lerp3(P1, P2, e); pos[1] += 0.035 * Math.sin(Math.PI * e); pitch = lerp(-0.28, 0, e); }
  else if (t < Ft.lift) { pos = P2; pitch = 0; }
  else { const u = clamp((t - Ft.lift) / 0.8), e = u * u; pos = lerp3(P2, P3, e); pitch = 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.2)); }
  return { show: 1, pos, yaw: Math.PI / 2, pitch };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: {}, screens: {} };
  const sw = S.lampSwingAt(t);
  let swX = sw[0], swZ = sw[1], wob = 0;
  for (const [ht, w] of hits()) { if (ht > t) continue; const d = t - ht; if (d > 6) continue; swX += kick(t, ht, 0.55, 0.9) * 0.009 * Math.min(w, 22); swZ += kick(t, ht + 0.05, 0.5, 0.9) * 0.005 * Math.min(w, 22); wob += kick(t, ht, 2.2, 5) * -0.0007 * Math.min(w, 9); }
  const sag = t < FLOOR_T ? -0.0035 * ease(t, CUES['5-04'], CUES['5-06'] + 1) - 0.004 * ease(t, at('6-07', 0.2), FLOOR_T) : 0;
  const gone = t >= S.HALL_GONE;
  const bites = [S.PLUG.heart.bite, S.PLUG.spade.bite];
  let flick = t > S.HALL_GONE - 0.3 && t < S.HALL_GONE + 0.7 ? 0.5 * Math.max(0, Math.sin(t * 41) * Math.sin(t * 13)) : 0;
  for (const b of bites) if (t > b && t < b + 0.6) flick = Math.max(flick, 0.7 * (1 - (t - b) / 0.6) * Math.abs(Math.sin(t * 47)));
  st.set = {
    lamp: { on: S.lampOnAt(t), swing: [swX, swZ], flicker: flick },
    ceiling: t >= at('7-01', 0.9) ? 0 : 1, hall: gone ? 0 : 1,
    wobble: wob + sag + (t > CUES['5-06'] && t < FLOOR_T ? 0.0006 * Math.sin(t * 5.3) : 0),
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 0, gold: 0, flood: null }, board: { show: 0, rows: [], lit: 0 },
  };
  st.props = { plates: { show: 0 } };
  kingsState(t, st);
  st.ant = antState(t);
  machinesState(t, st);
  st.machines.plain = gone ? 1 : 0;
  st.rollers = rollersState(t);
  if (t >= CUES.egg) {
    st.machines.foot = footState(t);
    st.machines.walker = { show: t >= CUES['10-04'] ? 1 : 0, pos: S.eggWalker(t), yaw: Math.atan2(EGG.walk.dir[0], EGG.walk.dir[1]) };
  }
  if (world?.lite) return st;
  cardsState(t, st);
  // ---- light and dark
  // while the lamp is the game its light is a pool, not a room: whoever it leans away from sits in the dark
  { const game = ease(t, CUES['1-07'], CUES['2-01']) * (1 - ease(t, S.PLUG.spade.bite, S.PLUG.spade.bite + 1));
    st.look.lampCone = lerp(64, 47, game); st.look.lampSoft = lerp(0.08, 0.3, game);
    const duel = ease(t, S.BLK_FIRST + 1, S.BLK_FIRST + 3);
    if (t < S.PLUG.heart.bite) st.look.p3 = { pos: [0, 1.5, 0.6], col: [(0.2 + 0.16 * duel) * game, (0.18 + 0.14 * duel) * game, (0.17 + 0.13 * duel) * game], range: 6 }; }
  if (t > S.HALL_GONE && t < S.HALL_GONE + 0.2) st.look.flash = 0.3 * (1 - (t - S.HALL_GONE) / 0.2);
  if (t > SLAM && t < SLAM + 0.1) st.look.flash = 0.25 * (1 - (t - SLAM) / 0.1);
  // the light has left him: the dark over a king's place (it goes with his chair when he is dragged off)
  const dk = S.darkAt(t);
  if (dk) { const id = dk.who, out = ENTER_DX * Math.pow(1 - S.seated(id, t), 3); st.look.shade = { at: [sxOf(id) * (1.6 + out), zOf(id)], r: [0.95, 0.85], k: 0.66 * dk.k * (1 - 0.45 * Math.min(1, out / 1.2)) }; }
  // the last card's shadow comes over the red king
  if (t > SLAM - 1.0 && t < SLAM) { const u = (t - (SLAM - 1.0)) / 1.0; st.look.shade = { at: [-1.5, 0.1], r: [lerp(0.5, 3.4, u * u), lerp(0.7, 4.5, u * u)], k: 0.93 * clamp(u * 2.2) }; }
  if (t >= CUES.egg) {
    const Ft = EGG.foot, a = S.eggAnt(t).pos;
    if (t > Ft.in + 0.3 && t < Ft.down) st.look.shade = { at: [a[0], a[2]], r: [0.11, 0.07], k: 0.8 * ease(t, Ft.in + 0.3, Ft.hover) * (1 - ease(t, Ft.shift + 0.2, Ft.down)) };
    if (t < CUES['10-04']) st.look.p3 = { pos: [a[0], FLOOR_Y + 0.55, a[2] + 0.45], col: [1.7, 1.4, 1.0], range: 2.4 };
    // the card-shaped shadow (a black card sliding over the floor, cardsState) reaches him: he goes dark with it
    if (t > EGG.shadow) { const w = S.eggWalker(t), u = clamp((t - EGG.shadow) / (CUES.end - EGG.shadow)); st.look.shade = { at: [w[0], w[2]], r: [0.8, 0.8], k: 0.95 * ease(u, 0.78, 0.93) }; }
  }
  if (t >= BLACK && t < CUES['10-02']) st.look.fade = 1;
  if (t >= CUES['10-02']) st.look.fade = 1 - ease(t, CUES['10-02'], CUES['10-02'] + 0.7);
  if (t >= CUES.end) st.look.fade = 1;
  // ---- the title, then the credits; the human last
  if (t > CUES.title && t < CUES.credits) st.titles = { zh: '喂', en: 'FEED', alpha: ease(t, CUES.title + 0.4, CUES.title + 1.4) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)),
    sub: '另一个世界的故事。如有雷同，纯属巧合。', subAlpha: ease(t, CUES.title + 1.9, CUES.title + 2.7) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)) };
  if (t >= CUES.credits && t < CUES.egg) {
    // ordinary end credits: three still cards
    const CARDS = [
      [0.3, 4.3, { label: '作者', main: 'MakerJackie' }],
      [4.6, 9.3, { label: '制作', main: 'Claude Fable 5.2  ·  Claude Opus 5.5', size: 0.05, small: '画面与声音全部由代码生成' }],
      [9.6, 13.4, { label: '谨以此片致敬', main: '《打，打个大西瓜》', zh: 1, small: '导演 饺子，2008' }],
    ];
    for (const [a0, a1, card] of CARDS) { const u = t - CUES.credits; if (u > a0 && u < a1) st.titles = { alpha: ease(u, a0, a0 + 0.6) * (1 - ease(u, a1 - 0.6, a1)), card }; }
  }
  return st;
}
void CARD; void R1;
