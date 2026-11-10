// 《喂》 v5 — every picture sound as data: [{ t, kind, ...params }], sorted by t. Built from dir/story.js.
// who is 'heart' (the red king, left) or 'spade' (the black king, right). Sizes are a machine's height in metres
// (0.3 = a toy on the table .. 30 = a mountain): the same "tak" all the way, only bigger, lower, further away.
// Kinds:
//   antStep { surface: 'cloth' | 'stone', gain }      cardWhoosh { who, dur }      cardSlap { who, size, hard, gain, pov }
//   crumbRoll { dur }      lampSwing { amp, dur }      chuckle { who }
//   thud { who, hard }                 a machine set down on the table (the black king's comes down hard)
//   clockwork { who, dur, size }       the spring running: a quiet ratchet under the taks, while a machine runs on the table
//   rundown { who, dur, size }         the spring running down: slower, lower, stop
//   tak { who, size, gain }            the little hammer on its bell, and the card leaving the slot. THE sound of the film
//   slabLand { who, size (card scale 1..45), far 0 | 1, gain }   that card landing: a pat (1) .. a boom that shakes the room (9+);
//                                      far: out on the floor, a long way off
//   pat { who }                        a hand pats the toy
//   chipDrop { who, n }                n chips into the brass funnel
//   crownLift { who }  crownDrop { who }   a crown picked up (a small ring of metal); a crown into the funnel (a clang)
//   gulp { who, size }                 the swallow, and the swell after it (it grows)
//   creak { dur }                      the table groaning under the machines
//   burst { dur }                      the hall breaks: stone, timber, air
//   grow { dur }                       two machines growing into mountains (under the music)
//   cheer { who | 'both', dur, far }   wordless cheering; far: very small, heard from high above
//   pressure { dur }                   air pushed down by something huge coming
//   endSlam                            the last card
//   ringRoll { dur }                   a gold ring rolling on card, spinning down like a coin
//   cloth { dur }  footDown            a robe's hem; a slippered foot set down very gently on stone
import { ROW, CUES } from './shots.js';
import * as S from './dir/story.js';

const at = (id, k = 0) => ROW[id].t0 + k;

export function soundEvents() {
  const ev = [];
  const E = (t, kind, o = {}) => ev.push({ t: +t.toFixed(4), kind, ...o });
  // ---- the ant: steps from nothing; the slap that kills it; the crumb
  const STEP = 0.0072 / 2 / S.ANT_SPEED;
  for (let t = 0.3; t < S.CRUSH - 0.05; t += STEP) E(t, 'antStep', { surface: 'cloth', gain: Math.min(1, (t - 0.3) / 1.4) ** 1.5 });
  E(S.CRUSH - 0.35, 'cardWhoosh', { who: S.ANT_KING, dur: 0.35 });
  E(S.CRUSH, 'cardSlap', { who: S.ANT_KING, size: 1, hard: 1, gain: 1, pov: 'ant' });
  E(at('1-06', 0.3), 'crumbRoll', { dur: 1.0 });
  // ---- every card: by hand a slap; by machine a "tak" and a landing
  for (const p of S.plays()) {
    if (p.crush) continue;
    if (p.by === 'hand') { E(p.t, 'cardSlap', { who: p.who, size: p.cs, hard: p.cs > 1 ? 0.9 : 0.6, gain: p.cs > 1 ? 0.9 : 0.55, pov: 'table' }); continue; }
    E(p.tr, 'tak', { who: p.who, size: +p.S.toFixed(2), gain: p.final ? 1 : 0.8 });
    if (p.final || p.t >= S.BLACK) continue;
    E(p.t, 'slabLand', { who: p.who, size: +p.cs.toFixed(2), far: p.far ? 1 : 0, gain: p.far ? 0.6 : 0.8 });
    if (p.cs >= 5 && !p.far) E(p.t + 0.03, 'lampSwing', { amp: 0.4, dur: 2 });
  }
  // ---- the machines: set down; the spring; running down
  E(S.PLACE.heart.down, 'thud', { who: 'heart', hard: 0.3 });
  E(S.PLACE.spade.down, 'thud', { who: 'spade', hard: 1 });
  E(S.PLACE.spade.down + 0.03, 'lampSwing', { amp: 0.3, dur: 2 });
  E(S.TOY_FIRST - 0.7, 'clockwork', { who: 'heart', dur: S.RED_STOP - 2.2 - (S.TOY_FIRST - 0.7), size: 0.3 });
  E(S.RED_STOP - 2.2, 'rundown', { who: 'heart', dur: 2.2, size: 0.3 });
  E(S.RED_GO - 0.4, 'clockwork', { who: 'heart', dur: S.FLOOR_T - S.RED_GO + 0.4, size: 0.6 });
  E(S.BLK_FIRST - 0.6, 'clockwork', { who: 'spade', dur: S.FLOOR_T - S.BLK_FIRST + 0.6, size: 0.6 });
  E(S.BLK_STOP - 3.4, 'rundown', { who: 'spade', dur: 3.4, size: 30 });
  for (const t of S.PAT) E(t, 'pat', { who: 'heart' });
  // ---- feeding
  for (const f of S.FEEDS) {
    if (f.n) E(S.feedRelease(f) + 0.06, 'chipDrop', { who: f.who, n: f.n });
    else { E(S.feedGrab(f), 'crownLift', { who: f.who }); E(f.t - 0.04, 'crownDrop', { who: f.who }); }
    E(f.t, 'gulp', { who: f.who, size: f.S });
  }
  E(at('3-02', 0.9), 'chuckle', { who: 'spade' }); E(at('3-02', 1.5), 'chuckle', { who: 'heart' });
  E(at('4-03', 0.2), 'creak', { dur: 2.2 });
  E(at('4-06', 1.9), 'chuckle', { who: 'heart' }); E(at('4-06', 2.1), 'chuckle', { who: 'spade' });
  // ---- two mountains
  E(S.MOUNT.t0, 'grow', { dur: S.MOUNT.t1 - S.MOUNT.t0 });
  E(S.HALL_GONE, 'burst', { dur: 2.4 });
  E(S.HALL_GONE, 'lampSwing', { amp: 1, dur: 4 });
  E(at('5-03', 0.1), 'cheer', { who: 'both', dur: 2.4, far: 1 });
  E(S.WIN, 'cheer', { who: 'heart', dur: S.SLAM - S.WIN, far: 0 });
  // ---- the last card; the ring
  E(S.SLAM - 1.7, 'pressure', { dur: 1.7 });
  E(S.SLAM, 'endSlam');
  E(S.SLAM + 0.02, 'lampSwing', { amp: 1, dur: 5 });
  E(S.RING.roll0, 'ringRoll', { dur: S.RING.roll1 - S.RING.roll0 + 0.9 });
  // ---- after the credits: the ant on stone; the foot that does not come down on it; from above; one more "tak"
  const F = S.EGG.foot, ES = 0.0072 / 2 / S.EGG.speed;
  for (let t = at('8-01', 0.2); t < CUES['8-04']; t += ES) if (t < F.hover - 0.15 || t > F.shift + 0.5) E(t, 'antStep', { surface: 'stone', gain: Math.min(1, (t - at('8-01', 0.2)) / 0.8) * 0.9 });
  E(F.in, 'cloth', { dur: F.hover - F.in });
  E(F.shift, 'cloth', { dur: F.down - F.shift });
  E(F.down, 'footDown');
  E(F.lift, 'cloth', { dur: 0.7 });
  E(S.EGG.shadow, 'pressure', { dur: CUES.end - S.EGG.shadow });
  E(at('8-05', 0.4), 'tak', { who: 'heart', size: 30, gain: 0.8 });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
