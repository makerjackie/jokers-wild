// 失控 OUT OF CONTROL — timing. The shot table is generated from docs/script/shots.txt (python -X utf8
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

// Story beats in film seconds. 《失控》 v7: docs/script/shots.txt. Every row is a cue under its own id (CUES['5-06']),
// and the story's names for them.
export const CUES = Object.fromEntries(Object.keys(ROW).map((id) => [id, ROW[id].t0]));
Object.assign(CUES, {
  steps: T('1-01'), ant: T('1-02'), giant: T('1-03'), crush: T('1-05'), crumb: T('1-06'), table: T('1-07'),
  screen: T('2-01'), stack: T('2-02'), board0: T('2-03'), draw: T('2-04'), chat: T('2-05'), blast: T('2-06'), boardChat: T('2-07'), awe: T('2-08'), behind: T('2-09'),
  race: T('3-01'), tower: T('3-03'), smash: T('3-03'), boardR1: T('3-04'), gasp: T('3-05'), big: T('3-06'), boardBig: T('3-07'),
  stuck: T('4-01'), hint: T('4-02'), win: T('4-03'), hintUS: T('4-04'), hints: T('4-05'),
  auto: T('5-01'), semi: T('5-01'), stamps: T('5-02'), hurry: T('5-03'), full: T('5-04'), lean: T('5-05'), autoAll: T('5-06'), holdout: T('5-07'), pass: T('5-07'), drag: T('5-08'), outs: T('5-09'), empty: T('5-10'), allAuto: T('5-11'), mountain: T('5-12'),
  red: T('6-01'), boardFuture: T('6-02'), freeze: T('6-03'), cancel: T('6-04'), error: T('6-05'), cancelUS: T('6-06'), accuse: T('6-07'), eyes: T('6-08'), blizzard: T('6-09'),
  stop: T('7-01'), rise: T('7-02'), eye: T('7-03'), lookUp: T('7-04'), gaze: T('7-05'),
  deal: T('8-01'), smile: T('8-02'), reach: T('8-03'), shadow: T('8-04'), cover: T('8-05'), black: T('8-06'), after: T('8-07'), antEnd: T('8-08'),
  invite: T('5-04'), decide: T('5-04b'), pressAuto: T('5-04c'),
  title: T('9-01'), credits: T('9-02'), slap: T('9-03'), fin: DURATION,
});

// the reel is the whole film for now
export const REEL = { t0: 0, t1: DURATION };
