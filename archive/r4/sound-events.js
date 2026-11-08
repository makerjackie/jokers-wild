// 《失控》 — every picture sound as data: [{ t, kind, ...params }], sorted by t. Owned by the director; the sound
// department renders them (audio-sfx.js / audio-kinds.js). Kinds: docs/SHIKONG.md "Sound". Built from the same story
// data the picture uses (dir/story.js), so a sound can never drift from its frame.
import { ROW, CUES } from './shots.js';
import * as S from './dir/story.js';

const at = (id, k = 0) => ROW[id].t0 + k;
const inRows = (t, a, b) => t >= ROW[a].t0 && t < ROW[b].t1;
// the plays the camera features in the 3-02 montage (their slaps are the beats); the rest of the room is background
const HERO_3_02 = [0.5, 1.35, 2.15, 2.92, 3.6, 4.22, 4.82, 5.35].map((k) => at('3-02', k));
const isHero = (t) => HERO_3_02.some((h) => Math.abs(h - t) < 0.002);

export function soundEvents() {
  const ev = [];
  const E = (t, kind, o = {}) => ev.push({ t: +t.toFixed(4), kind, ...o });
  // ---- @1: the ant's steps (two tripods a gait cycle), from nothing in the dark; the startle
  const STEP = 0.0072 / 2 / S.ANT_SPEED;
  for (let t = 0.35; t < at('1-02'); t += STEP) E(t, 'antStep', { surface: 'cloth', gain: Math.min(1, (t - 0.35) / 1.65) ** 1.5 });
  let lastK = null;
  for (let t = at('1-02'); t < at('1-07', 0.2); t += 1 / 480) {
    const a = S.antAt(t);
    if (!a.show || a.speed <= 0) { lastK = null; continue; }
    const k = Math.floor((a.dist / 0.0072) * 2);
    if (lastK !== null && k !== lastK) E(t, 'antStep', { surface: a.surface, gain: t > at('1-06') ? Math.max(0, 1 - (t - at('1-06')) / 2.2) : 1 });
    lastK = k;
  }
  E(S.ANT_SLAP + 0.02, 'antAlert');
  // ---- the plays: tosses, draws, whooshes, slaps
  for (const p of S.plays()) {
    const fin = S.FINAL.includes(p.who);
    if (p.deck && p.style !== 'flick') E(p.chat ? p.raise[0] - 0.25 : p.tr - 0.55 * (p.k ?? 1), 'cardDraw', { who: p.who });
    if (p.style === 'toss') {
      if (Math.abs(p.t - S.ANT_SLAP) < 0.01) { E(p.t - 0.32, 'cardWhoosh', { who: p.who, dur: 0.32 }); E(p.t, 'cardSlap', { who: p.who, size: 1, hard: 0.8, gain: 1, pov: 'ant' }); }
      else E(p.t, 'cardToss', { who: p.who, size: 1, gain: 0.45, pov: 'table' });
      continue;
    }
    if (p.style === 'open') { E(p.tr, 'cardWhoosh', { who: p.who, dur: p.t - p.tr }); E(p.t, 'cardToss', { who: p.who, size: 1, gain: 0.8, pov: 'table' }); continue; }
    if (p.style === 'flick') continue;
    if (p.style === 'giant') { E(p.t - 0.3, 'cardWhoosh', { who: p.who, dur: 0.3 }); E(p.t, 'bigSlam'); E(p.t + 0.02, 'lampSwing', { amp: 0.7, dur: 4 }); continue; }
    let gain = 0.5, hard = 0.6;
    if (p.chat) { gain = 1; hard = 1; }
    else if (inRows(p.t, '3-01', '3-01')) gain = 0.9;
    else if (inRows(p.t, '3-02', '3-02')) gain = isHero(p.t) ? 1 : 0.5;
    else if (inRows(p.t, '3-03', '3-06')) gain = 0.5;
    else if (inRows(p.t, '3-07', '3-08')) gain = fin ? 0.9 : 0.5;
    else if (inRows(p.t, '3-09', '3-09')) { gain = 1; hard = 1; }
    if (gain >= 0.9) E(p.t - 0.22, 'cardWhoosh', { who: p.who, dur: 0.22 });
    E(p.t, 'cardSlap', { who: p.who, size: p.scale ?? 1, hard, gain, pov: 'table' });
  }
  // ---- @2: ChatGPT wakes and writes; the room's "oh"; OpenAI's chuckle
  E(at('2-04', 0.15), 'chatWake', { dur: 3.2 });
  E(at('2-04', 0.35), 'typing', { dur: 2.6, n: 29 });
  E(at('2-05', 0.1), 'awe', { dur: 2.4 });
  E(at('2-07', 0.3), 'chuckle', { who: 'openai' });
  // ---- @3: the Llama scuffle; the flick, the skim, the house falling; the chairs
  E(at('3-03', 1.25), 'scuffle', { dur: 1.5 });
  E(S.FLICK.go, 'cardSkim', { dur: S.FLICK.hit - S.FLICK.go });
  E(S.FLICK.hit, 'towerCrash', { n: 15 });
  for (const [who, t] of Object.entries(S.OUT)) E(t, 'chairSlide', { who, dur: S.OUT_DUR + 0.5 });
  // ---- @4: the trembling cards, breaths, the cards laid down
  E(at('4-01', 0.1), 'tremble', { who: 'deepseek', dur: 2.9 });
  E(at('4-03', 0.2), 'tremble', { who: 'openai', dur: 1.9 });
  E(at('4-02', 0.35), 'breath', { who: 'deepseek', phase: 'in' });
  E(at('4-03', 0.9), 'breath', { who: 'openai', phase: 'in' });
  for (const id of S.FINAL) E(S.HELD[id].down, 'cardDown', { who: id });
  E(at('4-05', 2.1), 'breath', { who: 'deepseek', phase: 'out' });
  E(at('4-05', 2.25), 'breath', { who: 'openai', phase: 'out' });
  E(at('4-06', 1.6), 'breath', { who: 'deepseek', phase: 'in' });
  E(at('4-06', 2.9), 'breath', { who: 'deepseek', phase: 'out' });
  // ---- @5: the twitch; the pair lift and hang, then slap down one in each eye-line; the streams; the wall; the stop
  E(S.TWITCH.t, 'deckTwitch', { who: 'deepseek' });
  E(S.PAIR.lift, 'deckFire', { who: 'deepseek' });
  E(S.PAIR.lift + 0.03, 'deckFire', { who: 'openai' });
  E(S.PAIR.CN - 0.38, 'cardWhoosh', { who: 'deepseek', dur: 0.38 });
  E(S.PAIR.CN, 'cardSlap', { who: 'deepseek', size: 1.6, hard: 1, gain: 1, pov: 'table' });
  E(S.PAIR.US - 0.38, 'cardWhoosh', { who: 'openai', dur: 0.38 });
  E(S.PAIR.US, 'cardSlap', { who: 'openai', size: 1.6, hard: 1, gain: 1, pov: 'table' });
  E(at('5-05', 0.08), 'rage', { who: 'openai' });
  E(at('5-05', 0.98), 'rage', { who: 'deepseek' });
  for (const side of ['CN', 'US']) {
    const who = side === 'CN' ? 'deepseek' : 'openai';
    const t0 = at('5-06', 0.4) + (side === 'US' ? 0.13 : 0);
    E(t0, 'stream', { who, rate: 3, rate1: 70, dur: S.STOP - t0 });
  }
  for (const f of S.fires()) if (!f.pair && f.land < S.STOP) E(f.land, 'cardSlap', { who: f.side === 'CN' ? 'deepseek' : 'openai', size: f.scale, hard: 0.7, gain: 0.75, pov: 'table', deck: true });
  E(CUES.blizzard, 'blizzard', { dur: S.STOP - CUES.blizzard });
  E(CUES.blizzard, 'lampSwing', { amp: 1, dur: S.STOP - CUES.blizzard });
  E(S.STOP, 'stop');
  // ---- @6: the cards stand; the wave; the rise; the lamp spinning; the AI's far meetings
  E(S.STAND.first, 'cardStand', { i: 0 });
  E(S.STAND.second, 'cardStand', { i: 1 });
  E(S.STAND.wave0, 'standWave', { dur: S.STAND.wave1 - S.STAND.wave0 + 0.5 });
  E(S.RISE.t0, 'rise', { dur: S.RISE.t1 - S.RISE.t0 + 1.2 });
  E(S.RISE.t0 + 0.3, 'lampSpin', { dur: 4.5 });
  for (const [t, ring] of S.MEET) E(t, 'farSlap', { size: [0.6, 0.8, 1][ring], dist: [0.5, 0.75, 1][ring] });
  // ---- @7: the two that fall; the peeks and the smiles; the slaps again (none once the camera is high)
  for (const id of S.FINAL) {
    const F = S.FALL[id];
    E(F.t0, 'leafFall', { dur: F.land - F.t0 });
    E(F.land, 'cardTap', { who: id });
    E(S.PEEK[id].lift, 'peek', { who: id });
    E(S.PEEK[id].smile, 'smile', { who: id });
    E(S.PLAY2[id], 'smallSlap', { who: id, gain: 1, pov: 'table' });
  }
  const quiet = at('7-08', 5.5);
  for (const f of S.feed()) {
    if (f.slap >= quiet) continue;
    const g = f.slap < at('7-08') ? 0.9 : Math.max(0.05, 0.9 * (1 - (f.slap - at('7-08')) / 5.5));
    E(f.slap, 'smallSlap', { who: f.who, gain: g, pov: f.slap < at('7-08') ? 'table' : 'far' });
  }
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
