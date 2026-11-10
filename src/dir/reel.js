// 《喂》 v5 — the state of the world at film time t: the two kings, the two machines, every card, everything fed, the
// ant. The shots (cams.js) then place the camera. Everything here is a pure function of t.
import { KING, SIDE_SIGN, FLOOR_Y } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, kick, mulberry32 } from '../util.js';
import { at, face, kingRest } from './core.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { basisQ, slerpQ, mulQ, axisQ, downQ } from '../freecards.js';
import { ANT } from '../ant.js';
import { SLOT, HOPPER, TOP, machinePoint } from '../machine.js';
import * as S from './story.js';

const { RED, BLK, FINAL, GHOSTS, SLAM, BLACK, FLOOR_T, MOUNT, EGG } = S;
const sxOf = (id) => SIDE_SIGN[KING[id].side];
export const headAt = (id) => [sxOf(id) * 1.52, 0.68, 0];
const mAt = (id, t) => S.machineAt(id, t);

// ---------------------------------------------------------------- a card in a hand, then slapped down on the pile
function handCard(p, t) {
  const sx = sxOf(p.who), rz = S.rzOf(p.who);
  const H0 = [sx * 0.96, 0.36, rz * 0.14], q0 = basisQ([sx, 0.35, 0], [0, 1, 0]);
  if (t <= p.tr) return { pos: H0, q: q0 };
  const u = clamp((t - p.tr) / (p.t - p.tr)), e = Math.pow(u, 1.7);
  const pos = lerp3(H0, p.rest.pos, e); pos[1] += 0.2 * Math.sin(Math.PI * u) * (1 - 0.4 * u);
  return { pos, q: slerpQ(q0, p.rest.q, smooth(u * 1.2)) };
}
const relOf = (p) => p.tr + 0.62 * (p.t - p.tr);
const grip = (p, t) => { const c = handCard(p, Math.min(t, relOf(p))).pos, sx = sxOf(p.who); return [c[0] + sx * 0.08, c[1] + 0.04, c[2]]; };
// a card out of a machine's slot: it leaves flat and fast, turns in the air, lands flat. Big ones turn slowly.
function machineCard(p, t) {
  const m = mAt(p.who, p.tr), from = machinePoint(m, SLOT), sx = sxOf(p.who);
  const u = clamp((t - p.tr) / (p.t - p.tr)), ex = 1 - (1 - u) * (1 - u), ey = u * u;
  const q0 = basisQ([0, 1, 0], [0, 0, -1]);
  const h = p.final ? 0 : p.far ? 4 : m.floor ? 1.7 + 0.15 * m.S : 0.05 * p.cs;
  const pos = [lerp(from[0], p.rest.pos[0], ex), lerp(from[1], p.rest.pos[1], ey) + h * Math.sin(Math.PI * u), lerp(from[2], p.rest.pos[2], ex)];
  const spin = ((1 - u) * (p.i % 2 ? 1 : -1) * 2.6) / (1 + 0.3 * p.cs);
  return { pos, q: mulQ(axisQ([0, 1, 0], spin), slerpQ(q0, p.rest.q, smooth(u))), scale: p.cs * Math.min(1, 0.3 + (0.7 * u) / 0.12) };
}

// ---------------------------------------------------------------- what the hands do: keyed paths per king and hand
// move = { t0, t1, pose, keys: [[t, point | (t) => point | null (his rest)], ...] }
let MOVES = null;
const REST = null;
const hopPt = (id, dy = 0.1) => (t) => { const p = machinePoint(mAt(id, t), HOPPER); return [p[0] + sxOf(id) * 0.03, p[1] + dy, p[2]]; };
export const crownGrip = (id) => [sxOf(id) * 1.5, 0.93, S.rzOf(id) * 0.09];
function moves() {
  if (MOVES) return MOVES;
  const M = { heart: { L: [], R: [] }, spade: { L: [], R: [] } };
  const add = (id, side, pose, keys) => M[id][side].push({ t0: keys[0][0], t1: keys[keys.length - 1][0], keys, pose });
  for (const id of FINAL) {
    const sx = sxOf(id), rz = S.rzOf(id);
    // cards played by hand
    for (const p of S.plays()) if (p.by === 'hand' && p.who === id) add(id, 'R', 'hold', [[p.tr - 0.4, REST], [p.tr, (t) => grip(p, t)], [relOf(p), (t) => grip(p, t)], [relOf(p) + 0.45, REST]]);
    // he brings his machine up from under the table in both hands
    const P = S.PLACE[id];
    const hold = (dz) => (t) => { const m = mAt(id, Math.max(t, P.up)); return [m.pos[0] + sx * 0.05, m.pos[1] + m.S * 0.6, m.pos[2] + dz * (0.3 * m.S + 0.03)]; };
    for (const [side, dz] of [['R', rz], ['L', -rz]]) add(id, side, 'open', [[P.up - 0.45, REST], [P.up, hold(dz)], [P.down + 0.12, hold(dz)], [P.down + 0.55, REST]]);
    // the last chips are gone: he pats the bare cloth where they were
    const s2 = S.stackAt(id), pat = (t) => [s2[0], 0.03 + 0.06 * Math.abs(Math.sin(t * 9)), s2[1]];
    add(id, 'R', 'open', [[at('4-03', 0.3), REST], [at('4-03', 0.65), pat], [at('4-03', 1.9), pat], [at('4-03', 2.3), REST]]);
    // cheering for his machine: both arms up, waving
    const wave = (dz, ph) => (t) => [sx * 1.5, 1.3 + 0.07 * Math.sin(t * 10 + ph), dz * (0.3 + 0.12 * Math.sin(t * 10 + ph + 1))];
    const w0 = at('5-03', -0.5), w1 = id === BLK ? at('5-04', 0.9) : S.WIN - 0.5;
    for (const [side, dz, ph] of [['R', rz, 0], ['L', -rz, 2]]) add(id, side, 'open', [[w0, REST], [w0 + 0.4, wave(dz, ph)], [w1, wave(dz, ph)], [w1 + 0.4, REST]]);
  }
  // the red king pats his toy
  const topPt = (t) => { const p = machinePoint(mAt(RED, t), TOP); return [p[0], p[1] + 0.03 + 0.07 * Math.abs(Math.sin((Math.PI * (t - S.PAT[0])) / 0.3)), p[2]]; };
  add(RED, 'R', 'open', [[S.PAT[0] - 0.35, REST], [S.PAT[0], topPt], [S.PAT[1] + 0.12, topPt], [S.PAT[1] + 0.5, REST]]);
  // feeding
  for (const f of S.FEEDS) {
    const id = f.who, sx = sxOf(id), rz = S.rzOf(id), g = S.feedGrab(f), r = S.feedRelease(f);
    if (f.kind === 'chip' || f.kind === 'chips') {
      const s = S.stackAt(id), sp = [s[0], 0.1, s[1]];
      add(id, 'R', f.kind === 'chip' ? 'point' : 'hold', [[g - 0.3, REST], [g, sp], [g + 0.06, sp], [r, hopPt(id)], [r + 0.12, hopPt(id)], [r + 0.5, REST]]);
    } else if (f.kind === 'dead') {
      const c = S.deadCrownAt(id), cp = [c[0], 0.08, c[1]], toss = [sx * 1.12, 0.98, -0.3], thru = [sx * 1.02, 1.08, -0.2];
      add(id, S.DEAD_HAND[id], 'hold', [[g - 0.45, REST], [g, cp], [g + 0.1, cp], [r, toss], [r + 0.15, thru], [r + 0.6, REST]]);
    } else {
      const top = crownGrip(id), back = [sx * 1.8, 1.08, rz * 0.12];
      const k0 = id === RED ? [[S.HESITATE.up, REST], [S.HESITATE.on, top]] : [[g - 0.4, REST]];
      add(id, 'R', 'hold', [...k0, [g, top], [g + 0.12, [top[0], top[1] + 0.1, top[2]]], [r, back], [r + 0.15, back], [r + 0.6, REST]]);
    }
  }
  // the black king has nothing left: he pats his robes, then holds out his empty hands
  { const sx = sxOf(BLK), rz = S.rzOf(BLK);
    for (const [side, dz, ph] of [['R', rz, 0], ['L', -rz, 3]]) {
      const pk = (t) => [sx * 1.36, 0.34 + 0.06 * Math.sin(t * 12 + ph), dz * 0.14], out = [sx * 1.14, 0.3, dz * 0.24];
      add(BLK, side, 'open', [[S.BLK_STOP + 0.2, REST], [S.BLK_STOP + 0.5, pk], [at('5-05', 0.2), pk], [at('5-05', 0.7), out], [SLAM - 0.1, out], [SLAM + 0.5, REST]]);
    } }
  // the red king has won: both arms straight up
  { const sx = sxOf(RED), rz = S.rzOf(RED);
    for (const [side, dz] of [['R', rz], ['L', -rz]]) {
      const V = (t) => [sx * 1.5 + 0.02 * Math.sin(t * 13), 1.5 + 0.03 * Math.sin(t * 17 + dz), dz * 0.45];
      add(RED, side, 'open', [[S.WIN - 0.1, REST], [S.WIN + 0.25, V], [SLAM + 0.1, V]]);
    } }
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
// every landing that shakes the room: [t, weight]
let HITS = null;
function hits() {
  if (HITS) return HITS;
  HITS = [[S.PLACE.spade.down, 3]];
  for (const p of S.plays()) if (p.by === 'machine' && p.cs >= 3) HITS.push([p.t, p.final ? 40 : p.far ? 5 : p.cs]);
  return HITS;
}
function kingsState(t, st) {
  // the two who lost before the film began: their chairs pushed back from the table, empty
  for (const id of GHOSTS) st.kings[id] = { empty: 1, enter: id === 'diamond' && t >= SLAM ? 0 : 0.3 };
  const P = S.plays();
  for (const id of FINAL) {
    const sx = sxOf(id), o = S.otherOf(id), red = id === RED;
    const K = st.kings[id] = { look: [0, 0.05, 0], face: face('calm'), hand: { L: 'rest', R: 'rest' }, rise: 0, lean: 0.06, sweat: 0, slump: 0, blown: 0, crown: 1 };
    if ((red && t >= SLAM) || (!red && t >= CUES.egg)) { if (red) K.enter = 0; else K.empty = 1; continue; }
    const cf = feedOf(id, 'crown');
    if (t >= S.feedGrab(cf)) K.crown = 0;
    const m = mAt(id, t), mo = mAt(o, t);
    const mine = m ? machinePoint(m, TOP) : [sx * 0.74, 0.2, 0], theirs = mo ? machinePoint(mo, TOP) : [-sx * 0.74, 0.2, 0];
    const up = (k = 0.5) => (m ? [m.pos[0] * 0.9, m.pos[1] + m.S * k, 0] : mine);
    const fed = lastFeed(id, t), glee = fed && t - fed.t < 0.9 && t - fed.t > 0.15;
    // ---- playing by hand: the red king looks at his opponent, never at the cloth
    if (t < CUES['2-01']) {
      K.look = headAt(o); K.face = red ? face('calm', { brows: 'knit' }) : face('smug');
      for (const p of P) if (p.by === 'hand' && p.who === id && t > p.tr - 0.35 && t < p.t + 0.25) { K.lean = 0.2; K.rise = 0.22; }
    } else if (t < CUES['2-04']) {
      // ---- the King; the red king is losing; the empty chair
      const kt = at('2-01', 0.9);
      if (red) {
        K.look = t < CUES['2-02'] ? [0, 0.05, 0] : t < CUES['2-03'] ? [sx * 1.08, 0.36, -0.16] : [sx * 1.25, 0.25, -1.1];
        K.face = t < kt ? face('calm', { brows: 'knit' }) : t < CUES['2-03'] ? face('worry', { eyes: 'down' }) : { eyes: 'wide', brows: 'worried', mouth: 'flat' };
        K.sweat = ease(t, kt, CUES['2-03']); K.lean = 0.1;
      } else {
        const lb = ease(t, kt + 0.1, kt + 0.7);
        K.rise = t > kt - 0.5 && t < kt + 0.15 ? 0.25 : 0; K.lean = lerp(0.2, -0.14, lb);
        K.look = t < kt ? [0, 0.05, 0] : headAt(o); K.face = t < kt ? face('smug') : face('proud', { mouth: 'grin' });
      }
    } else if (t < CUES['3-01']) {
      // ---- the toy: up from under the table; the first "tak"; an Ace on the King
      const PL = S.PLACE.heart, land = S.TOY_FIRST + 0.43;
      if (red) {
        K.sweat = 1 - ease(t, land, land + 1.5);
        if (t < PL.up + 0.3) { K.look = [sx * 1.2, 0.0, 0.1]; K.face = { eyes: 'down', brows: 'knit', mouth: 'grit' }; K.lean = 0.2; }
        else if (t < land) { K.look = mine; K.face = { eyes: 'wide', brows: 'raised', mouth: 'flat' }; K.lean = t < PL.down ? 0.24 : 0.14; K.rise = t < PL.down ? 0.25 : 0.05; }
        else { K.look = t < S.PAT[1] + 0.3 ? mine : headAt(o); K.face = t < S.PAT[1] + 0.3 ? face('proud', { mouth: 'grin' }) : face('smug'); K.lean = t < S.PAT[1] + 0.4 ? 0.14 : -0.08; }
      } else {
        K.look = t < PL.up + 0.4 ? headAt(o) : t < land ? mine : [0, 0.05, 0];
        K.face = t < PL.up + 0.4 ? face('proud', { mouth: 'grin' }) : t < land ? { eyes: 'narrow', brows: 'raised', mouth: 'flat' } : t < CUES['2-06'] + 0.9 ? { eyes: 'wide', brows: 'worried', mouth: 'flat' } : face('angry', { mouth: 'grit' });
        K.lean = t < land ? -0.1 : 0.14;
        if (t > CUES['2-06'] + 0.9) K.look = headAt(o);
      }
    } else if (t < CUES['3-04']) {
      // ---- a bigger one; the two machines play each other; the red toy runs down
      const PL = S.PLACE.spade;
      const back = ease(t, S.BLK_FIRST + 0.4, S.BLK_FIRST + 1.2);
      if (!red) {
        if (t < PL.down + 0.2) { K.look = t < PL.up + 0.2 ? [sx * 1.2, 0.0, 0.1] : theirs; K.face = face('angry', { mouth: 'grit' }); K.lean = 0.25; K.rise = 0.35; }
        else { K.look = t < S.BLK_FIRST + 0.5 ? mine : headAt(o); K.face = Math.sin(t * 2.6) > 0 ? face('laugh') : face('proud', { mouth: 'grin' }); K.lean = lerp(0.12, -0.16, back); }
      } else {
        const slow = t > S.RED_STOP - 1.6;
        K.look = t < PL.down + 0.5 ? theirs : slow ? mine : Math.sin(t * 0.9) > 0 ? [0, 0.1, 0] : headAt(o);
        K.face = t < S.BLK_FIRST + 0.4 ? { eyes: 'wide', brows: 'worried', mouth: 'flat' } : slow ? face('worry') : Math.sin(t * 2.3 + 1) > 0.1 ? face('laugh') : face('proud', { mouth: 'grin' });
        K.lean = slow ? 0.16 : lerp(0.06, -0.14, back);
      }
    } else if (t < CUES['4-03']) {
      // ---- feeding: chips, more chips. Each watches his own funnel; a grin when it swells; the other one stares
      const act = moves()[id].R.some((x) => t > x.t0 && t < x.t1);
      K.lean = 0.16; K.rise = act ? 0.22 : 0.08; K.sweat = 0.5 * ease(t, CUES['4-01'], CUES['4-03']);
      K.look = act ? (m ? machinePoint(m, HOPPER) : mine) : theirs;
      K.face = glee ? face('proud', { mouth: 'grin', eyes: 'wide' }) : act ? { eyes: 'down', brows: 'knit', mouth: 'grit' } : { eyes: 'wide', brows: 'worried', mouth: 'flat' };
      if (red && t < S.RED_GO - 0.5 && !glee) K.face = t < at('3-04', 0.5) ? face('worry') : { eyes: 'down', brows: 'knit', mouth: 'flat' };
      if (t > at('3-04', 1.5) && t < at('3-04', 2.0) && red) K.face = face('shock');
    } else if (t < FLOOR_T) {
      // ---- no chips left; the crowns of the dead
      const d = feedOf(id, 'dead'), dg = S.feedGrab(d), dc = S.deadCrownAt(id);
      K.sweat = 1; K.lean = 0.14; K.rise = 0.1;
      const s2 = S.stackAt(id);
      K.look = t < at('4-03', 1.9) ? [s2[0], 0, s2[1]] : headAt(o); K.face = face('worry', { eyes: t < at('4-03', 1.9) ? 'down' : 'side' });
      if (t > dg - 1.0) { K.look = [dc[0], 0.05, dc[1]]; K.face = { eyes: 'narrow', brows: 'knit', mouth: 'flat' }; }
      if (t > dg + 0.15) { K.look = m ? machinePoint(m, HOPPER) : mine; K.face = { eyes: 'narrow', brows: 'knit', mouth: 'grit' }; K.rise = 0.3; }
      if (t > d.t + 0.1) { K.look = up(0.8); K.face = face('proud', { mouth: 'grin', eyes: 'wide' }); K.rise = 0.1; K.lean = 0.0; }
      if (red && t > S.feedGrab(feedOf(BLK, 'dead')) && t < CUES['4-05'] + 0.4) { K.look = [1.0, 0.4, -0.6]; K.face = face('shock'); }
    } else if (t < MOUNT.t0) {
      // ---- the machines stand behind them now; cards as big as half the table; then their own crowns
      const big = P.filter((p) => p.by === 'machine' && !p.far && p.cs >= 5 && t > p.t && t < p.t + 1.2).pop();
      K.sweat = 0.6; K.lean = 0.05; K.look = [0, 0.2, 0];
      K.face = Math.sin(t * 2.4 + sx) > 0 ? face('laugh') : face('proud', { mouth: 'grin' });
      if (big) { const d = t - big.t; K.blown = Math.exp(-d * 3.2) * Math.min(1, d / 0.06); if (d < 0.45) K.face = face('shock'); }
      if (red && t >= CUES['4-07']) {
        const H = S.HESITATE, g = S.feedGrab(cf);
        K.lean = 0.04; K.blown *= 0.3;
        K.look = t < H.up ? [sx * 0.9, 0, 0.2] : t < H.look ? [sx * 0.9, 0.0, 0] : t < CUES['4-09'] + 0.3 ? headAt(o) : [sx * 1.0, 0.1, 0];
        K.face = t < H.up ? face('worry', { eyes: 'down' }) : t < H.look ? { eyes: 'down', brows: 'worried', mouth: 'flat' } : t < CUES['4-09'] + 0.3 ? { eyes: 'side', brows: 'worried', mouth: 'flat' } : face('shut');
        K.sweat = 1;
        if (t > cf.t + 0.25) { K.face = { eyes: 'down', brows: 'worried', mouth: 'slack' }; }
        void g;
      }
      if (!red && t >= CUES['4-07']) {
        K.look = [0, 0.3, 0]; K.face = t < cf.t ? { eyes: 'narrow', brows: 'flat', mouth: 'flat' } : face('smug'); K.blown *= 0.3;
      }
    } else if (t < CUES['5-04']) {
      // ---- two mountains. They look up; they cheer
      const aw = ease(t, MOUNT.t0, MOUNT.t0 + 1.0);
      K.look = t < CUES['5-02'] ? up(0.6) : t < CUES['5-03'] ? [sx * 2, 9, -4] : up(0.5);
      K.face = t < MOUNT.t1 - 0.6 ? { eyes: 'up', brows: 'raised', mouth: 'slack' } : t < CUES['5-03'] ? { eyes: 'up', brows: 'raised', mouth: 'grin' } : Math.sin(t * 5 + sx) > -0.3 ? face('laugh') : face('proud', { mouth: 'grin' });
      K.lean = -0.12 * aw; K.rise = t >= at('5-03', -0.4) ? 0.55 : 0;
      if (K.rise) K.lean = -0.3;
    } else if (t < SLAM + 9) {
      // ---- the black machine starves; the red king has won; the last card
      if (!red) {
        const st0 = S.BLK_STOP;
        K.rise = t < st0 - 0.4 ? 0.55 : lerp(0.55, 0, ease(t, st0 - 0.4, st0 + 0.3)); K.lean = K.rise ? -0.3 * (K.rise / 0.55) : 0.05;
        K.look = t < st0 + 0.45 ? up(0.5) : t < CUES['5-05'] + 0.6 ? [sx * 1.3, 0.3, 0] : [sx * 1.0, 0.28, 0];
        K.face = t < st0 - 1.2 ? face('laugh') : t < st0 + 0.45 ? face('worry', { eyes: 'up' }) : t < CUES['5-05'] ? face('fear', { eyes: 'down' }) : { eyes: 'down', brows: 'worried', mouth: 'slack' };
        K.sweat = 1; if (t > CUES['5-05']) K.slump = 0.04 * ease(t, CUES['5-05'], CUES['5-05'] + 1);
        if (t >= SLAM) {
          const d = t - SLAM, rg = ringAt(Math.max(t, S.RING.roll0 + 0.01));
          K.blown = Math.exp(-d * 2.2) * Math.min(1, d / 0.05); K.slump = 0;
          K.look = t < S.RING.roll0 ? [-0.6, 0.5, 0.2] : rg.pos; K.face = { eyes: 'blank', brows: 'worried', mouth: 'o' };
        }
      } else {
        const won = t >= S.WIN, j = ease(t, S.WIN, S.WIN + 0.25);
        K.rise = won ? j : 0.55; K.lean = won ? lerp(-0.3, -0.52, j) : -0.3;
        K.look = !won ? (t > S.BLK_STOP + 0.3 ? headAt(o) : up(0.5)) : t < S.WIN + 1.1 ? headAt(o) : up(0.5);
        K.face = !won && t > S.BLK_STOP + 0.3 ? { eyes: 'wide', brows: 'raised', mouth: 'o' } : Math.sin(t * 7) > -0.5 ? face('laugh') : face('proud', { mouth: 'grin' });
      }
    }
    // ---- the arms
    for (const side of ['L', 'R']) {
      const h = handFor(id, side, t);
      if (h) { K['arm' + side] = { target: h.target, pole: [sx * 0.4, -0.8, 0] }; K.hand[side] = h.pose; }
    }
    // the fan of cards in his left hand, until he lays it down for the machine
    const fd = S.PLACE[id].up - 0.5;
    if (t < fd && !K.armL) { K.armL = { target: [sx * 1.08, 0.36, -S.rzOf(id) * 0.16], pole: [sx * 0.4, -0.8, 0] }; K.hand.L = 'hold'; }
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
    let lit = t >= FLOOR_T ? 0.14 + 0.86 * ease(t, MOUNT.t0, MOUNT.t1) : 0;
    if (id === BLK) lit *= lerp(1, 0.3, ease(t, S.BLK_STOP, S.BLK_STOP + 2));
    out[id] = { show: 1, pos: m.pos, yaw: m.yaw, S: m.S, gulp: S.gulpAt(id, t), strike, key: keyAt(id, t), glow: (run ? 0.4 : 0.04) + 0.6 * flash, lit };
  }
  // ---- chips: each king's stack; the ones in a hand; the ones falling into a funnel
  const CS = 1.8, CH = 0.0046 * CS;
  for (const id of FINAL) {
    const [x, z] = S.stackAt(id), n = S.chipsLeft(id, t), kind = id === RED ? 'CN' : 'US', r = mulberry32(id === RED ? 5 : 9);
    for (let i = 0; i < S.STACK_N; i++) {
      const c = Math.floor(i / 10), j = i % 10, jx = (r() - 0.5) * 0.004, jz = (r() - 0.5) * 0.004, ry = r() * 6.28;
      if (i >= n) continue;
      out.chips.push({ pos: [x + jx, (j + 0.5) * CH, z + (c - 1) * 0.07 + jz], rot: [0, ry, 0], kind, s: CS });
    }
  }
  for (const f of S.FEEDS) {
    if (!f.n) continue;
    const g = S.feedGrab(f), rel = S.feedRelease(f), id = f.who, kind = id === RED ? 'CN' : 'US';
    if (t < g || t > f.t + 0.25) continue;
    const m = mAt(id, t), mouth = machinePoint(m, HOPPER);
    for (let j = 0; j < f.n; j++) {
      const mix = t < rel ? 0 : smooth((t - rel - j * 0.022) / 0.2);
      if (mix >= 1) continue;
      out.chips.push({ hand: { id, side: 'R', off: [0, -0.035 - j * CH, 0], mix, to: [mouth[0], mouth[1] - 0.02 * m.S, mouth[2]] }, rot: [mix * 2 + j, j * 1.3, mix * 3], kind, s: CS });
    }
  }
}

// ---------------------------------------------------------------- cards
const FAN = { heart: ['3', '5', '7'], spade: ['Q', 'J', '9'] };
function cardsState(t, st) {
  const out = st.free;
  // a few small cards already on the cloth
  { const r = mulberry32(77);
    for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = 0.03 + 0.09 * Math.sqrt(r()), id = k % 2 ? RED : BLK; out.push({ pos: [Math.cos(a) * d, 0.0008 + k * 0.0004, Math.sin(a) * d], q: basisQ([0, 1, 0], [Math.cos(a * 3), 0, Math.sin(a * 3)]), scale: 1, face: S.card(id, ['2', '4', '3', '6', '5', '8', '4'][k]), back: id === RED ? CELL.backCN : CELL.backUS }); } }
  for (const p of S.plays()) {
    if (t >= BLACK && t < CUES.egg) break;
    const base = { face: p.face, back: p.back, scale: p.cs, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.glyph ? 0.5 : 0, glow: p.far || p.final ? 0.3 : p.glyph ? 0.15 : 0 };
    if (t >= p.t) { out.push({ ...base, pos: p.rest.pos, q: p.rest.q }); continue; }
    if (p.by === 'hand') { if (t > p.tr - 0.35) out.push({ ...base, ...handCard(p, t) }); continue; }
    if (t >= p.tr) out.push({ ...base, ...machineCard(p, t) });
  }
  // the fans in their left hands; laid face down when the machines come out
  for (const id of FINAL) {
    const sx = sxOf(id), rz = S.rzOf(id), fd = S.PLACE[id].up - 0.5, mix = ease(t, fd, fd + 0.35);
    FAN[id].forEach((r, i) => {
      const to = { pos: [sx * 1.02, 0.003 + i * 0.004, -rz * (0.34 + i * 0.012)], q: downQ(0.2 * (i - 1), -1) };
      const c = { face: S.card(id, r), back: id === RED ? CELL.backCN : CELL.backUS, scale: 1, glow: 0.75 * (1 - mix) };
      if (mix >= 1) out.push({ ...c, ...to }); else out.push({ ...c, hand: { id, side: 'L', fan: i - 1, mix, to } });
    });
  }
}

// ---------------------------------------------------------------- small things: the crumb, the crowns, the ring
export function ringAt(t) {
  const R = S.RING, fp = S.finalPlay(), sc = 2.2, rr = 0.0117 * sc;
  const A = [S.FINAL_XR + 0.01, 0.26], B = [S.FINAL_XR + 0.42, 0.42];
  const u = clamp((t - R.roll0) / (R.roll1 - R.roll0)), e = 1 - (1 - u) * (1 - u);
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), d = [dx / L, 0, dz / L];
  const tilt = smooth((u - 0.6) / 0.4) * (Math.PI / 2 - 0.06);
  const wob = u >= 1 ? Math.exp(-(t - R.roll1) * 4) * Math.sin((t - R.roll1) * 24) * 0.12 : 0;
  const q = mulQ(axisQ(d, tilt + wob), mulQ(axisQ([0, 1, 0], Math.atan2(dx, dz) + Math.PI / 2), axisQ([0, 0, 1], -(L * e) / rr)));
  return { kind: 'ring', pos: [A[0] + dx * e, fp.edgeY + rr * Math.cos(tilt) + 0.0026 * sc, A[1] + dz * e], q, scale: sc };
}
function rollersState(t) {
  const R = [];
  if (t >= S.CRUSH + 0.6 && t < CUES['1-07'] + 1.0) {
    const u = clamp((t - (CUES['1-06'] + 0.3)) / 1.1), e = 1 - (1 - u) * (1 - u);
    R.push({ kind: 'crumb', pos: [S.ANT_CRUSH[0] - 0.02 - 0.07 * e, 0.0022, S.ANT_CRUSH[1] + 0.05 + 0.08 * e], q: axisQ([1, 0, -0.3], e * 9), scale: 1 });
  }
  for (const id of FINAL) {
    // the dead king's crown at the empty place beside him; then his own
    for (const kind of ['dead', 'crown']) {
      const f = S.FEEDS.find((x) => x.who === id && x.kind === kind), g = S.feedGrab(f), rel = S.feedRelease(f);
      if (t >= f.t) continue;
      const side = kind === 'dead' ? S.DEAD_HAND[id] : 'R', sc = 1.15, silver = id === BLK && kind === 'crown';
      if (kind === 'dead') {
        const c = S.deadCrownAt(id), rest = [c[0], 0.002, c[1]];
        if (t < g) { R.push({ kind: 'crown', pos: rest, q: axisQ([0, 1, 0], id === RED ? 0.6 : 2.2), scale: sc }); continue; }
        if (t < rel) { R.push({ kind: 'crown', hand: { id, side, off: [0, -0.07, 0], mix: 1 - ease(t, g, g + 0.16), to: rest }, q: axisQ([0, 1, 0], 0.6), scale: sc }); continue; }
      } else if (t < g) continue;
      else if (t < rel) { R.push({ kind: 'crown', silver, hand: { id, side, off: [0, -0.08, 0], mix: 1 - ease(t, g, g + 0.1), to: [headAt(id)[0], 0.82, 0] }, q: axisQ([0, 1, 0], 0), scale: sc }); continue; }
      // thrown: up and into the funnel
      const u = clamp((t - rel) / (f.t - rel)), m = mAt(id, t), mouth = machinePoint(m, HOPPER);
      R.push({ kind: 'crown', silver, hand: { id, side, off: [0, -0.07, 0], mix: Math.pow(u, 0.8), to: [mouth[0], mouth[1] + (0.25 + 0.2 * m.S) * Math.sin(Math.PI * u) * (1 - u) * 2, mouth[2]] }, q: axisQ([1, 0, 0.4], u * 7), scale: sc * (1 - 0.3 * u * u) });
    }
  }
  if (t >= S.RING.roll0 && t < BLACK) R.push(ringAt(t));
  return R;
}

// ---------------------------------------------------------------- the ant (the first one; and the one on the floor, after)
function antState(t) {
  if (t >= CUES.egg) {
    const a = S.eggAnt(t);
    return { show: t < CUES['8-04'] ? 1 : 0, pos: a.pos, q: basisQ([a.dir[0], 0, a.dir[1]], [0, 1, 0]), walk: a.dist / ANT.STRIDE, speed: a.stopped ? 0 : 1, alert: a.stopped ? 1 : 0, crumb: 1, crumbTilt: 0, size: 1 };
  }
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  return { show: 1, pos: A.pos, q: basisQ([dx, 0, dz], [0, 1, 0]), walk: A.dist / ANT.STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 1, crumbTilt: 0, size: 1 };
}
// the foot: it swings in over the ant, hangs, moves aside, comes down softly, walks on
function footState(t) {
  const F = EGG.foot;
  if (t < F.in || t > F.lift + 0.9) return { show: 0 };
  const A = S.eggAnt(F.hover).pos, y0 = FLOOR_Y;
  const P0 = [A[0] - 0.46, y0 + 0.2, A[2] - 0.02], P1 = [A[0] - 0.035, y0 + 0.062, A[2] - 0.012], P2 = [A[0] - 0.02, y0, A[2] - 0.17], P3 = [A[0] + 0.5, y0 + 0.14, A[2] - 0.17];
  let pos, pitch;
  if (t < F.hover) { const u = (t - F.in) / (F.hover - F.in), e = 1 - (1 - u) ** 3; pos = lerp3(P0, P1, e); pos[1] += 0.05 * Math.sin(Math.PI * e); pitch = lerp(0.45, -0.28, e); }
  else if (t < F.shift) { const w = 0.0025 * Math.sin((t - F.hover) * 21); pos = [P1[0], P1[1] + w, P1[2]]; pitch = -0.28 + 0.02 * Math.sin((t - F.hover) * 17); }
  else if (t < F.down) { const e = smooth((t - F.shift) / (F.down - F.shift)); pos = lerp3(P1, P2, e); pos[1] += 0.035 * Math.sin(Math.PI * e); pitch = lerp(-0.28, 0, e); }
  else if (t < F.lift) { pos = P2; pitch = 0; }
  else { const u = clamp((t - F.lift) / 0.8), e = u * u; pos = lerp3(P2, P3, e); pitch = 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.2)); }
  return { show: 1, pos, yaw: Math.PI / 2, pitch };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: {}, screens: {} };
  let swX = 0, swZ = 0, wob = 0;
  for (const [ht, w] of hits()) { if (ht > t) continue; const d = t - ht; if (d > 6) continue; swX += kick(t, ht, 0.55, 0.9) * 0.009 * Math.min(w, 22); swZ += kick(t, ht + 0.05, 0.5, 0.9) * 0.005 * Math.min(w, 22); wob += kick(t, ht, 2.2, 5) * -0.0007 * Math.min(w, 9); }
  const sag = t < FLOOR_T ? -0.0035 * ease(t, CUES['4-02'], CUES['4-03'] + 1) : 0;
  const gone = t >= S.HALL_GONE;
  st.set = {
    lamp: { on: 1, swing: [swX, swZ], flicker: t > S.HALL_GONE - 0.3 && t < S.HALL_GONE + 0.7 ? 0.5 * Math.max(0, Math.sin(t * 41) * Math.sin(t * 13)) : 0 },
    ceiling: t >= at('5-01', 0.7) ? 0 : 1, hall: gone ? 0 : 1,
    wobble: wob + sag + (t > CUES['4-03'] && t < FLOOR_T ? 0.0006 * Math.sin(t * 5.3) : 0),
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
    st.machines.walker = { show: t >= CUES['8-04'] ? 1 : 0, pos: S.eggWalker(t), yaw: Math.atan2(EGG.walk.dir[0], EGG.walk.dir[1]) };
  }
  if (world?.lite) return st;
  cardsState(t, st);
  // ---- light
  if (t > S.HALL_GONE && t < S.HALL_GONE + 0.2) st.look.flash = 0.3 * (1 - (t - S.HALL_GONE) / 0.2);
  if (t > SLAM && t < SLAM + 0.1) st.look.flash = 0.25 * (1 - (t - SLAM) / 0.1);
  // the last card's shadow comes over the red king
  if (t > SLAM - 1.0 && t < SLAM) { const u = (t - (SLAM - 1.0)) / 1.0; st.look.shade = { at: [-1.5, 0.1], r: [lerp(0.5, 3.4, u * u), lerp(0.7, 4.5, u * u)], k: 0.93 * clamp(u * 2.2) }; }
  if (t >= CUES.egg) {
    const F = EGG.foot, a = S.eggAnt(t).pos;
    if (t > F.in + 0.3 && t < F.down) st.look.shade = { at: [a[0], a[2]], r: [0.11, 0.07], k: 0.8 * ease(t, F.in + 0.3, F.hover) * (1 - ease(t, F.shift + 0.2, F.down)) };
    st.look.p3 = { pos: [a[0], FLOOR_Y + 0.4, a[2] + 0.35], col: [1.25, 1.05, 0.75], range: 1.4 };
    if (t > EGG.shadow) { const w = S.eggWalker(t), u = clamp((t - EGG.shadow) / (CUES.end - EGG.shadow)); st.look.shade = { at: [w[0], w[2]], r: [lerp(0.4, 7, u * u), lerp(0.5, 9, u * u)], k: 0.95 * clamp(u * 2.5) }; }
  }
  if (t >= BLACK && t < CUES['8-02']) st.look.fade = 1;
  if (t >= CUES['8-02']) st.look.fade = 1 - ease(t, CUES['8-02'], CUES['8-02'] + 0.7);
  if (t >= CUES.end) st.look.fade = 1;
  // ---- the title, then the credits; the human last
  if (t > CUES.title && t < CUES.credits) st.titles = { zh: '喂', en: 'FEED', alpha: ease(t, CUES.title + 0.4, CUES.title + 1.4) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)) };
  if (t >= CUES.credits && t < CUES.egg) {
    const lines = ['编剧', '导演', '分镜', '动画', '角色', '美术', '灯光', '配乐', '音效', '剪辑', '调色', '程序'].map((r) => [r, 'Claude']).concat([['', ''], ['人类', 'MakerJackie']]);
    const u = clamp((t - CUES.credits - 0.4) / (CUES.egg - CUES.credits - 2.6));
    st.titles = { alpha: 1 - ease(t, CUES.egg - 0.8, CUES.egg - 0.1), roll: { y0: lerp(1.08, 0.5 - (lines.length - 1) * 0.075, u), lines } };
  }
  return st;
}
void CARD;
