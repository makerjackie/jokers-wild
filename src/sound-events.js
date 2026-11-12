// 《失控》 v7 (from v3 榜首) — every picture sound as data: [{ t, kind, ...params }], sorted by t. Built from dir/story.js.
// Kinds from v1/v2 (docs/SHIKONG.md) plus v3: blast {dur} (ChatGPT's shockwave), denied {who} (要不起: the tapped card
// shakes, a dull refusal), errorAlarm {who} (系统异常), screenEye {who} (the screen turns into the eye: a low glassy
// tone), pressure {dur} (the last card coming down: air pushed ahead of it, growing). boardFlip {dur, gain} is the #1 board.
// v9: semiOn {who} (半托管 switched on), countdown {dur, from, to} (the round timer: ticks that speed up from a 10 s round to a
// 0.3 s round), timeout {who} (超时: the round is lost). v7: eliminated {who} (淘汰: his screen goes grey), dragOut {who, dur}
// (he and his chair scrape back into the dark), creditSlap (the last card landing on the writer's name, in the black).
import { ROW, CUES } from './shots.js';
import * as S from './dir/story.js';

const at = (id, k = 0) => ROW[id].t0 + k;

export function soundEvents() {
  const ev = [];
  const E = (t, kind, o = {}) => ev.push({ t: +t.toFixed(4), kind, ...o });
  // ---- the ant: steps from nothing; the slap that kills it; the crumb
  const STEP = 0.0072 / 2 / S.ANT_SPEED;
  for (let t = 0.35; t < S.CRUSH - 0.05; t += STEP) E(t, 'antStep', { surface: 'cloth', gain: Math.min(1, (t - 0.35) / 1.65) ** 1.5 });
  E(S.CRUSH - 0.35, 'cardWhoosh', { who: S.ANT_KING, dur: 0.35 });
  E(S.CRUSH, 'cardSlap', { who: S.ANT_KING, size: 1, hard: 1, gain: 1, pov: 'ant' });
  // ---- every play
  for (const p of S.plays()) {
    if (p.crush || p.ghost) continue;
    const auto = p.style === 'auto' || p.style === 'red';
    if (!auto) E(p.tr - 0.04, 'screenTap', { who: p.who, gain: p.style === 'smash' || p.style === 'giant' ? 1 : 0.7 });
    if (auto) E(p.tr, 'autoPlay', { who: p.who, red: !!p.red });
    if (p.style === 'smash') continue;
    if (p.style === 'giant') { E(p.t - 0.3, 'cardWhoosh', { who: p.who, dur: 0.3 }); E(p.t, 'bigSlam'); E(p.t + 0.02, 'lampSwing', { amp: 0.7, dur: 4 }); continue; }
    if (p.style === 'chat') { E(p.t - 0.3, 'cardWhoosh', { who: p.who, dur: 0.3 }); E(p.t, 'cardSlap', { who: p.who, size: 1.2, hard: 1, gain: 1, pov: 'table' }); continue; }
    if (p.dest === 'house') { E(p.t, 'cardToss', { who: p.who, size: 1, gain: 0.5, pov: 'table' }); continue; }
    const lead = S.FINAL.includes(p.who);
    const gain = auto ? (lead ? 0.7 : 0.45) : p.t < CUES.race ? 0.5 : lead ? 0.9 : 0.6;
    E(p.t, p.t < S.CHAT_T ? 'cardToss' : 'cardSlap', { who: p.who, size: p.scale ?? 1, hard: 0.6, gain, pov: 'table' });
  }
  // ---- the board: every new #1
  for (const b of S.boardTops()) if (b.t > 0) E(b.t, 'boardFlip', { dur: 0.35, gain: b.t > CUES.auto ? 0.55 : 0.9 });
  // ---- @2: yawns; ChatGPT's shockwave, the old cards raining off the table; silence; the chord is the score's
  E(at('2-03', 0.4), 'yawn', { who: 'meta' }); E(at('2-03', 0.9), 'yawn', { who: 'mistral' });
  E(S.CHAT_T, 'blast', { dur: 2.2 });
  E(S.CHAT_T + 0.05, 'lampSwing', { amp: 0.5, dur: 3 });
  E(S.CHAT_T + 0.5, 'cardsFall', { n: 12, dur: 1.4 });
  // ---- @3: R1 into the house
  E(S.SMASH.go, 'cardSkim', { dur: S.SMASH.hit - S.SMASH.go });
  E(S.SMASH.hit, 'cardSlap', { who: 'glm', size: 1.6, hard: 1, gain: 1, pov: 'table' });
  E(S.SMASH.hit, 'towerCrash', { n: 30 });
  // ---- @4: 要不起; the hints; @5 auto; @6 the dead cancels, 系统异常, the blame, the eye
  for (const [t] of S.PASS.taps) E(t + 0.02, 'denied', { who: S.FINAL[0] });
  for (const id in S.HINTS) for (const [t] of S.HINTS[id]) E(t, 'hintDing', { who: id, gain: S.FINAL.includes(id) ? 1 : 0.4 });
  for (const id in S.AUTO) if (S.AUTO[id] < 1e9) E(S.AUTO[id], 'autoOn', { who: id, gain: S.FINAL.includes(id) || S.FOLLOW.includes(id) ? 1 : 0.4 });
  // ---- @5: the three who won't hand it over
  // (v9) 半托管 on; the countdown (one long event, faster and faster); every 超时
  for (const id in S.SEMI) E(S.SEMI[id], 'semiOn', { who: id, gain: S.FINAL.includes(id) ? 1 : 0.5 });
  E(S.LIMIT0, 'countdown', { dur: S.LIMIT1 - S.LIMIT0 + 0.4, from: 10, to: 0.3 });
  for (const id in S.TIMEOUT) for (const t of S.TIMEOUT[id]) E(t, 'timeout', { who: id });
  for (const id of S.HOLD) {
    const o = S.OUT[id];
    E(o.out, 'eliminated', { who: id });
    E(o.drag[0], 'dragOut', { who: id, dur: o.drag[1] - o.drag[0] });
  }
  for (const id of ['openai', 'anthropic', 'google', 'xai']) E(CUES.empty + 1.2 + (id.length % 4) * 0.12, 'chuckle', { who: id });
  for (const id in S.CANCEL) S.CANCEL[id].forEach((t, i) => E(t, 'cancelPress', { who: id, hard: i < 2 ? 0.4 : 1 }));
  E(at('5-05', 0.5), 'chuckle', { who: 'openai' });
  for (const id of S.FINAL) E(S.ERR_T, 'errorAlarm', { who: id, gain: id === S.FINAL[0] ? 1 : 0.6 });
  E(S.ACCUSE + 0.1, 'rage', { who: S.FINAL[0] });
  E(S.ACCUSE + 0.55, 'rage', { who: 'openai' });
  E(S.ACCUSE + 1.0, 'scuffle', { dur: 1.6 });
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
  // (v11) the offer ("Too slow? Let AI play for you"): a sweet ding on each screen before he takes it
  for (const id in S.INVITE) if (S.AUTO[id] < 1e9) E(S.INVITE[id], 'hintDing', { who: id, gain: id === 'openai' ? 1 : 0.35 });
  // (v11) after: the empty table. Every screen goes grey at once; the machines play on, fast and even; the ant walks
  E(S.AFTER + 0.25, 'eliminated', { who: 'openai' }); E(S.AFTER + 0.25, 'eliminated', { who: 'anthropic' });
  { const ids = ['anthropic', 'google', 'meta', 'glm', 'openai', 'xai', 'mistral']; let i = 0;
    for (let t = S.AFTER + 0.3; t < S.AFTER_END - 0.6; t += 0.13, i++) { const who = ids[(i * 3) % ids.length], g = 0.3 * Math.min(1, (S.AFTER_END - 0.6 - t) / 1.5); E(t, 'autoPlay', { who, red: false, gain: g }); E(t + 0.5, 'cardSlap', { who, size: 1, hard: 0.4, gain: g, pov: 'table' }); } }
  for (let t = CUES.antEnd - 0.2; t < S.AFTER_END - 0.1; t += STEP) E(t, 'antStep', { surface: 'cloth', gain: Math.min(1, (t - CUES.antEnd + 0.4) / 1.2) * Math.min(1, (S.AFTER_END - t) / 0.8) });
  // (v19) the credits: every line of the list ticks in; the round timer's three ticks under the writer's name; the buzzer;
  // then the swat (no fall, no whoosh; one instant hit)
  for (let i = 0; i < S.CREDITS.n; i++) E(S.CREDITS.list0 + i * S.CREDITS.step, 'creditTick', { i, soft: 1 });
  S.CREDITS.count.forEach((t, i) => E(t, 'creditTick', { i }));
  E(S.CREDITS.out, 'timeout', { who: 'credits' });
  E(S.CREDITS.hit, 'creditSlap');
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
