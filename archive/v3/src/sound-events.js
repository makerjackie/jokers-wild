// JOKERS WILD v3 reel — every picture sound as data: [{ t, kind, ...params }], sorted by t. Owned by the director;
// the sound department renders them (audio-sfx.js). Kinds: docs/V3-REEL.md "Sound". Built from the same story data
// the picture uses (dir/story.js), so a sound can never drift from its frame.
import { ROW, CUES } from './shots.js';
import { stamps, proposals, RIVER, flatTime, FAN_ORDER, WILD, PLAY } from './dir/story.js';

const at = (id, k = 0) => ROW[id].t0 + k;
// which shots are seen from the paper people's height (the stamps there are pile-drivers)
const ANT = new Set(['1-02', '1-03', '2-01', '2-04', '2-05', '3-04', '3-06', '3-07', '4-04', '4-05', '4-06', '5-01', '5-03', '5-04', '5-05', '6-05']);
const rowAt = (t) => { for (const id in ROW) if (t >= ROW[id].t0 && t < ROW[id].t1) return id; return null; };

export function soundEvents() {
  const ev = [];
  const E = (t, kind, o = {}) => ev.push({ t, kind, ...o });
  // ---- the stamps: contact, lift; the hollow ones
  for (const s of stamps()) {
    const pov = ANT.has(rowAt(s.t)) ? 'ant' : 'high';
    const head = s.who === 'deepseek' || s.who === 'openai';
    const size = s.big ? 1 : head ? 0.8 : 0.55;
    if (s.miss && !s.wild) E(s.t, 'stampMiss', { who: s.who, size, pov, gain: head ? 1 : 0.5 });
    else E(s.t, 'stampHit', { who: s.who, size, pov, gain: head ? 1 : 0.5, wild: s.wild || undefined });
    if (head) E(s.t + 0.09, 'stampLift', { who: s.who, gain: 0.6 });
  }
  // ---- the proposal cards: out of the press, a skid, the flight to the pile
  for (const c of proposals()) {
    const head = c.who === 'deepseek' || c.who === 'openai';
    if (!head && c.out > at('3-06')) continue;          // the wide is all stamps: no per-card slides for the others
    E(c.out, 'cardSlide', { who: c.who, dur: c.land - c.out, gain: head ? 1 : 0.4 });
    E(c.fly, 'cardFly', { who: c.who, self: c.self || undefined, gain: head ? 1 : 0.4 });
  }
  // ---- the paper people
  E(at('1-02', 1.45), 'paperWave', { who: 'red' });
  E(at('1-02', 2.45), 'paperWave', { who: 'blue', far: true });
  const s1 = stamps().find((s) => s.who === 'deepseek'), o1 = stamps().find((s) => s.who === 'openai');
  E(s1.t + 0.02, 'paperFall', { who: 'red' });
  E(o1.t + 0.02, 'paperFall', { who: 'blue', gain: 0.7 });
  E(CUES.run, 'paperRun', { who: 'red', dur: ROW['3-04'].t1 - CUES.run });
  E(WILD.t - 0.06, 'paperFall', { who: 'red', dive: true });
  E(at('4-04', 0.25), 'paperUp', { who: 'red' });
  for (let k = 0; k < 4; k++) E(at('4-04', 0.95 + k * 0.42), 'paperStep', { who: 'red', i: k });
  for (let k = 0; k < 3; k++) E(at('4-05', 0.05 + k * 0.42), 'paperStep', { who: 'blue', i: k });
  for (let k = 0; k < 3; k++) { E(at('4-06', 0.05 + k * 0.4), 'paperStep', { who: 'red', i: k }); E(at('4-06', 0.2 + k * 0.4), 'paperStep', { who: 'blue', i: k }); }
  E(at('4-06', 1.62), 'handTouch');
  // ---- the river: the flock of cards playing themselves
  E(RIVER.t0, 'flock', { dur: CUES.king + 1.6 - RIVER.t0, density: 0.3, rise: CUES.river });
  // ---- the board
  for (const k of [0.05, 0.3, 0.55]) E(at('3-08', k), 'boardFlip', { n: 6 });
  // ---- 王炸
  E(CUES.moons, 'jokerRise', { who: 'CN', dur: CUES.faceoff - CUES.moons });
  E(CUES.moons + 0.15, 'jokerRise', { who: 'US', dur: CUES.faceoff - CUES.moons - 0.15 });
  E(CUES.charge, 'charge', { dur: CUES.faceoff - CUES.charge });
  E(CUES.pair + 0.5, 'pair');
  E(CUES.flood, 'flood', { dur: ROW['5-06'].t1 - CUES.flood });
  // ---- the card king; the kings pressed flat; the fan; the finger; the last card
  E(CUES.king + 0.1, 'inhale', { dur: 2.0 });
  for (const id of FAN_ORDER) E(flatTime(id), 'flatten', { who: id, gain: id === 'deepseek' || id === 'openai' ? 1 : 0.7 });
  E(CUES.rows + 0.4, 'riffle', { dur: 1.2 });
  E(CUES.finger + 0.15, 'fingerDescend', { dur: 1.5 });
  E(CUES.us + 0.3, 'cardSnick');
  E(PLAY.land, 'cardPlay', { size: 1 });
  E(PLAY.cover, 'cardPlay', { size: 0.8, cover: true });
  E(PLAY.cover2, 'cardPlay', { size: 0.65, cover: true });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
