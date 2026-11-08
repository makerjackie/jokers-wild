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

// Story beats in film seconds (picture and sound both lock to these). 《失控》: docs/script/shots.txt
export const CUES = {
  // @1 蚂蚁
  steps: T('1-01'), ant: T('1-02'), plaza: T('1-03'), slap0: T('1-04'), onward: T('1-05'), edge: T('1-06'), table: T('1-07'),
  // @2 会说话的牌
  lazy: T('2-01'), draw: T('2-02'), chat: T('2-03'), hello: T('2-04'), awe: T('2-05'), behind: T('2-06'), smug: T('2-07'),
  // @3 比大
  scramble: T('3-01'), race: T('3-02'), open: T('3-03'), tower: T('3-04'), gasp: T('3-05'), giant: T('3-06'), drop: T('3-07'), frenzy: T('3-08'), two: T('3-09'),
  // @4 停手
  tremble: T('4-01'), fear: T('4-02'), fearUS: T('4-03'), down: T('4-04'), downUS: T('4-05'), quiet: T('4-06'),
  // @5 谁出的牌
  twitch: T('5-01'), fire: T('5-02'), povUS: T('5-03'), povCN: T('5-04'), rage: T('5-05'), resume: T('5-06'), empty: T('5-07'), eyes: T('5-08'), mime: T('5-09'), blizzard: T('5-10'),
  // @6 牌堆
  stop: T('6-01'), frozen: T('6-02'), stand1: T('6-03'), wave: T('6-04'), rise: T('6-05'), bare: T('6-06'), lookUp: T('6-07'), above: T('6-08'),
  // @7 发牌的人
  fall: T('7-01'), land: T('7-02'), stare: T('7-03'), peek: T('7-04'), peekUS: T('7-05'), play: T('7-06'), feed: T('7-07'), climb: T('7-08'), title: T('7-09'),
  fin: DURATION,
};

// the reel is the whole film for now
export const REEL = { t0: 0, t1: DURATION };
