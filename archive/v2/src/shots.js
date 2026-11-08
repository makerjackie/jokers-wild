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

// Story beats in film seconds (picture and sound both lock to these). v2: docs/SCRIPT.md, docs/script/shots.txt
export const CUES = {
  hum: T('1-01'), wide: T('1-02'), newcomer: T('1-03'), open: T('1-04'), code: T('1-05'), stir: T('1-06'),
  arrive: T('2-01'), arriveUS: T('2-02'), ladder: T('2-03'), jam: T('2-19'), last: T('2-20'), double: T('2-22'), full: T('2-23'),
  press1: T('3-01'), joker1: T('3-02'), eyes1: T('3-03'), lock1: T('3-04'), watch: T('3-05'), joker2: T('3-06'), title: T('3-07'),
  v3: T('4-01'), eyes: T('4-02'), unlockUS: T('4-03'), giantUS: T('4-04'), embargo: T('4-05'), starve: T('4-06'), boast: T('4-07'),
  unlockCN: T('4-08'), tiny: T('4-09'), r1: T('4-10'), avalanche: T('4-11'), kiln: T('4-12'),
  locks: T('5-01'), plaster: T('5-09'), dates: T('5-10'),
  frenzy: T('6-01'), castle: T('6-02'), city: T('6-03'), plant: T('6-04'), lock4: T('6-05'), mad: T('6-07'), button: T('6-08'),
  auto: T('7-01'), cascade: T('7-02'), cigars: T('7-09'), party: T('7-10'), lastLock: T('7-11'), lastLockCN: T('7-12'), pov: T('7-13'),
  burst: T('8-01'), freeze: T('8-02'), rise: T('8-03'), lookup: T('8-04'), cancel: T('8-05'), seals: T('8-06'),
  launch: T('9-01'), collide: T('9-03'), pair: T('9-04'), zero: T('9-05'), heart: T('9-06'), bomb: T('9-07'), wave: T('9-08'),
  king: T('10-01'), tower: T('10-02'), deal: T('10-03'), free: T('10-04'),
  stare: T('11-01'), reach: T('11-04'), slam: T('11-05'), flyup: T('11-06'), race: T('11-07'), grow: T('11-08'), black: T('11-09'),
  credits: T('12-01'), fin: DURATION,
};

// a 28 s tone reel: from Claude at the AUTO button to the jokers rising
export const REEL = { t0: ROW['6-08'].t0, t1: ROW['8-03'].t1 };
