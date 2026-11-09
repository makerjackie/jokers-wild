// 《失控》 v4 (四王) — every picture sound as data: [{ t, kind, ...params }], sorted by t. Built from dir/story.js.
// v4 kinds besides the v3 ones: lightOff {who} (a king's light clicks out), chairBack {who, dur} (his chair dragged
// back into the dark), crownRoll {i, dur} (the egg: metal rim rolling on cloth, wobbling to rest), crownDrag {dur}
// (the ant tugging it: a tiny scrape). who is a suit: heart, diamond, spade, club.
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
  // ---- every play
  for (const p of S.plays()) {
    if (p.crush) continue;
    const auto = p.style === 'auto' || p.style === 'red';
    if (!auto) E(p.tr - 0.04, 'screenTap', { who: p.who, gain: 0.7 });
    if (auto) E(p.tr, 'autoPlay', { who: p.who, red: !!p.red });
    if (p.style === 'chat') { E(p.t - 0.3, 'cardWhoosh', { who: p.who, dur: 0.3 }); E(p.t, 'cardSlap', { who: p.who, size: 1.2, hard: 1, gain: 1, pov: 'table' }); continue; }
    const lead = S.FINAL.includes(p.who);
    const gain = auto ? 0.7 : p.t < CUES.race ? 0.5 : lead ? 0.9 : 0.7;
    E(p.t, p.t < S.CHAT_T ? 'cardToss' : 'cardSlap', { who: p.who, size: p.scale ?? 1, hard: 0.6, gain, pov: 'table' });
  }
  // ---- the board: every new #1
  for (const b of S.boardTops()) if (b.t > 0) E(b.t, 'boardFlip', { dur: 0.35, gain: b.t > CUES.auto ? 0.55 : 0.9 });
  // ---- @2: yawns; the Queen's shockwave, the small cards raining off the table
  E(at('2-01', 0.9), 'yawn', { who: 'club' }); E(at('2-02', 0.4), 'yawn', { who: 'diamond' });
  E(S.CHAT_T, 'blast', { dur: 2.2 });
  E(S.CHAT_T + 0.05, 'lampSwing', { amp: 0.5, dur: 3 });
  E(S.CHAT_T + 0.5, 'cardsFall', { n: 14, dur: 1.4 });
  // ---- 要不起; the two who drop out
  for (const id in S.PASS) for (const [t] of S.PASS[id].taps) E(t + 0.02, 'denied', { who: id });
  for (const id in S.OUT) { const o = S.OUT[id]; E(o.dark, 'lightOff', { who: id }); E(o.slide[0], 'chairBack', { who: id, dur: o.slide[1] - o.slide[0] }); }
  // ---- hints, auto, the dead cancels, 系统异常, the blame, the eye
  for (const id in S.HINTS) for (const [t] of S.HINTS[id]) E(t, 'hintDing', { who: id, gain: 1 });
  for (const id in S.AUTO) E(S.AUTO[id], 'autoOn', { who: id, gain: 1 });
  for (const id in S.CANCEL) S.CANCEL[id].forEach((t, i) => E(t, 'cancelPress', { who: id, hard: i < 2 ? 0.4 : 1 }));
  E(at('5-03', 0.6), 'chuckle', { who: 'spade' });
  for (const id of S.FINAL) E(S.ERR_T, 'errorAlarm', { who: id, gain: id === 'heart' ? 1 : 0.6 });
  E(S.ACCUSE + 0.1, 'rage', { who: 'heart' });
  E(S.ACCUSE + 0.55, 'rage', { who: 'spade' });
  for (const id of S.FINAL) E(S.EYE_SCREEN, 'screenEye', { who: id });
  E(CUES.blizzard, 'blizzard', { dur: S.STOP - CUES.blizzard });
  E(CUES.blizzard, 'lampSwing', { amp: 1, dur: S.STOP - CUES.blizzard });
  E(S.STOP, 'stop');
  // ---- the rise, the eye, the deal, the last card (heard only in the black)
  E(S.RISE.t0, 'rise', { dur: S.RISE.t1 - S.RISE.t0 + 1.2 });
  E(S.RISE.t0 + 0.3, 'lampSpin', { dur: 4.5 });
  for (const id of S.FINAL) { E(S.DEAL, 'screenDeal', { who: id }); E(CUES.smile + 0.5, 'smile', { who: id }); }
  E(S.GIANT_END.t0, 'pressure', { dur: S.BLACK - S.GIANT_END.t0 });
  E(S.SLAM, 'endSlam');
  // ---- after the credits: the crown, the ant
  E(S.EGG.roll0, 'crownRoll', { i: 0, dur: S.EGG.roll1 - S.EGG.roll0 + 0.8 });
  const ES = 0.0072 / 2 / 0.03;
  for (let t = S.EGG.ant0 + 0.1; t < S.EGG.drag1; t += ES) if (t < S.EGG.grab - 0.3 || t > S.EGG.grab) E(t, 'antStep', { surface: 'cloth', gain: 0.8 });
  E(S.EGG.grab + 0.1, 'crownDrag', { dur: S.EGG.drag1 - S.EGG.grab });
  E(at('9-04', 0.4), 'cardTap', { gain: 0.4 });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
