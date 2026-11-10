// 《喂》 v6 — every picture sound as data: [{ t, kind, ...params }], sorted by t. Built from dir/story.js.
// who is a king: 'heart' (red, front left), 'diamond' (back left), 'spade' (black, front right), 'club' (back right).
// Sizes are a machine's height in metres (0.3 = a toy on the table .. 30 = a mountain): the same "tak" all the way,
// only bigger, lower, further away.
// Kinds (v5's, unchanged): antStep { surface, gain }  cardWhoosh { who, dur }  cardSlap { who, size, hard, gain, pov }
//   crumbRoll { dur }  lampSwing { amp, dur }  chuckle { who }  thud { who, hard }  clockwork { who, dur, size }
//   rundown { who, dur, size }  tak { who, size, gain }  slabLand { who, size, far, gain }  pat { who }
//   chipDrop { who, n }  crownLift { who }  crownDrop { who }  gulp { who, size }  creak { dur }  burst { dur }
//   grow { dur }  pressure { dur }  endSlam  cloth { dur }  footDown
// New in v6:
//   lampLean { who, amp }      the lamp swings over to whoever now holds the highest card: a chain's creak and a low
//                              swoosh of light; `amp` 0..1 (the machines' duel makes many small ones)
//   lightLeaves { who }        the light slides off a king: the room tone on his side drops, a held breath
//   dragOut { who, dur }       a chair with a man in it yanked back across stone into the dark: scrape, a cut-off cry
//   crownSpin { who, dur }     a crown hits the cloth, spins on its rim like a coin, settles
//   button { who, mode: 'auto' | 'cancel', hard 0..1 }   'auto': one clean click and a small rising chime (it works);
//                              'cancel': the same click, dead, nothing after it; harder and harder
//   plugBite { who }           a plug bites the lamp: a spark, mains hum rising, the room's light dropping
//   suck { who, dur, gain }    the funnel inhaling by itself
//   keyStrain { dur }          a man holding a turning key: metal creak, a grunt, thrown back
//   shout { who | 'both', dur, far }   wordless shouting ("stop!"), far: from high above, tiny
//   cheer { who, dur, far }    (kept) one man cheering
//   glassSlide { dur }         wire spectacles sliding out over card and rocking still
//   chairBack { who, dur }     a chair pushed slowly back over stone
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
    if (p.by === 'hand') { E(p.t, 'cardSlap', { who: p.who, size: p.cs, hard: p.hard ? 1 : p.cs > 1 ? 0.9 : 0.6, gain: p.cs > 1 ? 0.9 : 0.6, pov: 'table' }); continue; }
    E(p.tr, 'tak', { who: p.who, size: +p.S.toFixed(2), gain: p.final ? 1 : 0.8 });
    if (p.final || p.t >= S.BLACK) continue;
    E(p.t, 'slabLand', { who: p.who, size: +p.cs.toFixed(2), far: p.far ? 1 : 0, gain: p.far ? 0.6 : 0.8 });
  }
  // ---- the lamp follows the highest card; the light leaves the one who is last
  const L = S.leaderEvents();
  L.forEach((e, i) => { if (i && L[i - 1].who === e.who) return; E(e.t + 0.05, 'lampLean', { who: e.who, amp: e.t < S.TOY_FIRST ? 1 : 0.45 }); });
  E(at('2-03', 0.2), 'lightLeaves', { who: 'club' });
  E(at('3-02', 0.2), 'lightLeaves', { who: 'heart' });
  E(at('4-03', 0.1), 'lightLeaves', { who: 'diamond' });
  E(S.RED_STOP + 0.2, 'lightLeaves', { who: 'heart' });
  for (const id in S.OUT) { const o = S.OUT[id]; E(o.pull[0], 'dragOut', { who: id, dur: o.pull[1] - o.pull[0] + 0.5 }); E(o.crown, 'crownSpin', { who: id, dur: o.still - o.crown }); }
  // ---- the machines: set down; 托管; the spring; running down
  E(S.PLACE.heart.down, 'thud', { who: 'heart', hard: 0.3 });
  E(S.PLACE.spade.down, 'thud', { who: 'spade', hard: 1 });
  E(S.AUTO_PRESS.heart, 'button', { who: 'heart', mode: 'auto', hard: 0.3 });
  E(S.AUTO_PRESS.spade, 'button', { who: 'spade', mode: 'auto', hard: 1 });
  E(S.AUTO_PRESS.heart + 0.1, 'clockwork', { who: 'heart', dur: S.RED_STOP - 2.2 - (S.AUTO_PRESS.heart + 0.1), size: 0.3 });
  E(S.RED_STOP - 2.2, 'rundown', { who: 'heart', dur: 2.2, size: 0.3 });
  E(S.RED_GO - 0.4, 'clockwork', { who: 'heart', dur: S.PLUG.heart.bite - S.RED_GO + 0.4, size: 0.6 });
  E(S.AUTO_PRESS.spade + 0.1, 'clockwork', { who: 'spade', dur: S.PLUG.spade.bite - S.AUTO_PRESS.spade - 0.1, size: 0.6 });
  E(S.BLK_STOP - 3.4, 'rundown', { who: 'spade', dur: 3.4, size: 30 });
  for (const t of S.PAT) E(t, 'pat', { who: 'heart' });
  E(at('4-05', 1.4), 'chuckle', { who: 'spade' }); E(at('4-05', 2.0), 'chuckle', { who: 'heart' });
  // ---- feeding: chips, the lamp's power, the dead kings' crowns
  for (const f of S.FEEDS) {
    if (f.n) E(S.feedRelease(f) + 0.06, 'chipDrop', { who: f.who, n: f.n });
    if (f.kind === 'dead') { E(S.feedGrab(f), 'crownLift', { who: f.who }); E(f.t - 0.04, 'crownDrop', { who: f.who }); }
    E(f.t, 'gulp', { who: f.who, size: f.S });
  }
  E(S.PALM.hide - 0.3, 'cloth', { dur: 0.6 });
  E(at('5-06', 0.2), 'creak', { dur: 2.2 });
  for (const id in S.PLUG) E(S.PLUG[id].bite, 'plugBite', { who: id });
  // ---- it takes for itself; 取消 does nothing; the key; the crowns
  E(S.SUCK_CHIP.out - 0.25, 'suck', { who: 'heart', dur: S.SUCK_CHIP.gone - S.SUCK_CHIP.out + 0.25, gain: 0.5 });
  E(S.SUCK_CHIP.gone - 0.03, 'chipDrop', { who: 'heart', n: 1 });
  for (const id in S.CANCEL) S.CANCEL[id].forEach((t, i, a) => E(t, 'button', { who: id, mode: 'cancel', hard: Math.min(1, 0.3 + (0.7 * i) / (a.length - 1)) }));
  E(S.KEYGRAB.on, 'keyStrain', { dur: S.KEYGRAB.off - S.KEYGRAB.on + 0.3 });
  for (const id in S.CROWN_SUCK) { const c = S.CROWN_SUCK[id]; E(c.lift, 'suck', { who: id, dur: c.gone - c.lift, gain: 1 }); E(c.gone - 0.04, 'crownDrop', { who: id }); }
  E(at('6-07', 0.2), 'creak', { dur: 1.4 });
  E(S.FLOOR_T, 'thud', { who: 'heart', hard: 1 }); E(S.FLOOR_T + 0.04, 'thud', { who: 'spade', hard: 1 });
  // ---- two mountains: the hall is eaten; they shout up at them
  E(S.MOUNT.t0 - 0.3, 'suck', { who: 'both', dur: S.MOUNT.t1 - S.MOUNT.t0, gain: 1 });
  E(S.MOUNT.t0, 'grow', { dur: S.MOUNT.t1 - S.MOUNT.t0 });
  E(S.HALL_GONE, 'burst', { dur: 2.4 });
  E(at('7-02', 1.9), 'shout', { who: 'both', dur: at('7-03') - at('7-02', 1.9), far: 0 });
  E(at('7-03', 0.05), 'shout', { who: 'both', dur: 2.7, far: 1 });
  E(at('7-04', 0.05), 'shout', { who: 'spade', dur: S.BLK_STOP - at('7-04', 0.05), far: 0 });
  E(at('7-05', 0.05), 'shout', { who: 'heart', dur: 0.75, far: 0 });
  E(S.WIN, 'cheer', { who: 'heart', dur: S.SLAM - S.WIN, far: 0 });
  E(S.POINT, 'shout', { who: 'spade', dur: S.SLAM - S.POINT, far: 0 });
  // ---- the last card; the glasses; the black king alone
  E(S.SLAM - 1.7, 'pressure', { dur: 1.7 });
  E(S.SLAM, 'endSlam');
  E(S.GLASSES.t0, 'glassSlide', { dur: S.GLASSES.t1 - S.GLASSES.t0 + 0.9 });
  E(S.BACK[0], 'chairBack', { who: 'spade', dur: S.BACK[1] - S.BACK[0] });
  // ---- after the credits: the ant on stone; the foot that does not come down on it; from above; one more "tak"
  const Ft = S.EGG.foot, ES = 0.0072 / 2 / S.EGG.speed;
  for (let t = at('10-01', 0.2); t < CUES['10-04']; t += ES) if (t < Ft.hover - 0.15 || t > Ft.shift + 0.5) E(t, 'antStep', { surface: 'stone', gain: Math.min(1, (t - at('10-01', 0.2)) / 0.8) * 0.9 });
  E(Ft.in, 'cloth', { dur: Ft.hover - Ft.in });
  E(Ft.shift, 'cloth', { dur: Ft.down - Ft.shift });
  E(Ft.down, 'footDown');
  E(Ft.lift, 'cloth', { dur: 0.7 });
  E(at('10-04', 1.6), 'tak', { who: 'heart', size: 30, gain: 0.35 });
  E(at('10-05', 0.4), 'tak', { who: 'heart', size: 30, gain: 0.8 });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
