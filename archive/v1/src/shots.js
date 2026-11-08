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

// Story beats in film seconds (picture and sound both lock to these).
export const CUES = {
  open: T('1-02'), title: T('1-07'),
  raise: T('2-01'), jam: T('2-19'), pass: T('2-24'), shim0: T('2-26'),
  embargo: T('3-03'), boast: T('3-05'), tiny: T('3-07'), avalanche: T('3-08'), toll: T('3-10'), reject: T('3-11'),
  cheats: T('4-01'), bomb: T('4-04'), sacks: T('4-11'), stop: T('4-13'),
  maker: T('5-01'), look: T('5-03'), levers: T('5-06'),
  rush: T('6-01'), fed: T('6-08'), approve: T('6-09'), button: T('6-10'),
  auto: T('7-01'), cascade: T('7-02'), cigars: T('7-09'), party: T('7-10'), pov: T('7-11'), crack: T('7-12'),
  skip: T('8-01'), freeze: T('8-02'), float1: T('8-03'), float2: T('8-04'), alarm: T('8-05'), cancel: T('8-06'),
  seals: T('8-07'), rise: T('8-08'),
  launch: T('9-01'), pair: T('9-08'), zero: T('9-09'), heart: T('9-10'), bomb2: T('9-11'), wave: T('9-12'),
  king: T('10-01'), shadow: T('10-03'), flatten: T('10-04'), lastTwo: T('10-05'),
  tilt: T('11-01'), fold: T('11-02'), shim: T('11-03'), flick: T('11-04'), last: T('11-05'), humans: T('11-06'), black: T('11-07'),
  credits: T('12-01'), fin: DURATION,
};

// The 27.5 s tone reel (step 3): from Claude looking at the AUTO button to the jokers rising.
export const REEL = { t0: ROW['6-10'].t0, t1: ROW['8-08'].t1 };
