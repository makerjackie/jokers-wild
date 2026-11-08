// JOKERS WILD — timing. The shot table is generated from docs/script/shots.txt (python -X utf8
// tools/shotlist.py writes src/shots-data.js). Never hard-code seconds elsewhere: use SHOT ids or CUES.
import { DURATION, SHOT_ROWS, SEQS } from './shots-data.js';

export const FPS = 24;
export { DURATION, SEQS };
// one entry per camera cut; `name` = id so the generic tools (snap s:<id>, contact) work
export const SHOTS = SHOT_ROWS.map((r) => ({ ...r, name: r.id }));
export const SHOT = Object.fromEntries(SHOTS.map((s) => [s.id, s]));
// rows (montages kept whole): the director plans montages per row and picks the cut inside
export const ROW = {};
for (const s of SHOTS) {
  const r = ROW[s.row] || (ROW[s.row] = { id: s.row, t0: s.t0, t1: s.t1, cuts: [] });
  r.t1 = s.t1; r.cuts.push(s);
}
export function shotAt(t) {
  let lo = 0, hi = SHOTS.length - 1;
  if (t < SHOTS[0].t0) return SHOTS[0];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SHOTS[m].t0 <= t) lo = m; else hi = m - 1; }
  return SHOTS[lo];
}
const T = (id, k = 0) => ROW[id].t0 + k;

// Story beats in film seconds (picture and sound both lock to these). v3 test reel: docs/V3-REEL.md, docs/script/shots.txt
export const CUES = {
  hum: T('1-01'), coast: T('1-02'), shadow: T('1-03'),
  slide: T('2-01'), read: T('2-02'), nod: T('2-03'), stamp1: T('2-04'), stampUS: T('2-05'),
  faster: T('3-01'), glyph: T('3-02'), glyphUS: T('3-03'), run: T('3-04'), blind: T('3-05'), piles: T('3-06'), near: T('3-07'), hundred: T('3-08'),
  unneeded: T('4-01'), stare: T('4-02'), river: T('4-03'), walk: T('4-04'), walkUS: T('4-05'), hands: T('4-06'),
  moons: T('5-01'), standUp: T('5-02'), charge: T('5-03'), faceoff: T('5-04'), pair: T('5-05'), flood: T('5-06'),
  king: T('6-01'), press: T('6-02'), rows: T('6-03'), fan: T('6-04'), finger: T('6-05'), us: T('6-06'), play: T('6-07'), black: T('6-08'),
  fin: DURATION,
};

// the reel is the whole film for now
export const REEL = { t0: 0, t1: DURATION };
