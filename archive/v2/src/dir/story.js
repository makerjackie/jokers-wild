// JOKERS WILD v2 — the story's schedule: who arrives when, every padlock, every sticker, how big and sweaty each king
// is. Pure functions of film time, shared by the director (picture) and sound-events (sound).
import { CUES } from '../shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT, BOX } from '../layout.js';
import { clamp, smooth, lerp } from '../util.js';
import { at, end, keys } from './core.js';

export const HEAD = { CN: 'deepseek', US: 'openai' };          // they hold the keys
export const SLAPPER = { CN: 'qwen', US: 'anthropic' };        // they slap the 安全 ✓ stickers
// the hand nearest the box: the box sits toward the foot from the head king, toward the head from the slapper.
// US kings face -x (their LEFT hand lies toward +z = the foot), CN kings face +x (their RIGHT hand toward the foot).
export const KEY_HAND = { openai: 'L', deepseek: 'R' };
export const SLAP_HAND = { anthropic: 'R', qwen: 'L' };
export const sideOfId = (id) => KING[id].side;

// ---------------------------------------------------------------- arrivals: [start, duration] of enter 0 -> 1
// OpenAI and Google sit there from the start. The others creep out of the dark in 1-06 and slide in during seq 2.
export const ENTER = {
  qwen: [at('2-01', 0.15), 1.0], glm: [at('2-01', 1.1), 0.95], doubao: [at('2-01', 2.05), 0.95],
  anthropic: [at('2-02', 0.05), 0.9], meta: [at('2-02', 0.9), 0.9],
  kimi: [at('2-11', -0.05), 0.72], xai: [at('2-17', -0.75), 1.15], deepseek: [at('2-20', 0.15), 1.25],
};
export function enterAt(t, id) {
  const e = ENTER[id];
  if (!e) return 1;
  if (t < CUES.stir) return 0;
  const creep = 0.07 * smooth((t - CUES.stir) / 2.5);          // dark shapes stirring far out
  if (t < e[0]) return creep;
  return lerp(creep, 1, clamp((t - e[0]) / e[1], 0, 1));        // the kings module eases the slide and the bump
}

// ---------------------------------------------------------------- the jokers are boxed (3-04 US, 3-06 CN)
export const BOXING = {
  US: { grab: at('3-04', 0.25), drop: at('3-04', 0.85), slam: at('3-04', 1.05), clicks: [0, 1, 2, 3, 4].map((i) => at('3-04', 1.35 + i * 0.14)) },
  CN: { grab: at('3-06', 0.2), drop: at('3-06', 0.75), slam: at('3-06', 0.95), clicks: [0, 1, 2, 3, 4].map((i) => at('3-06', 1.2 + i * 0.12)) },
};
// ---------------------------------------------------------------- the padlocks: the moment each one springs open
// (the key turns over the 0.35 s before it); index 0 goes first. The last one is turned by the AUTO strings.
export const LOCKS = {
  US: [at('4-03', 1.55), at('5-01', 0.45), at('5-05', 0.3), at('6-05', 0.32), at('7-11', 1.75)],
  CN: [at('4-08', 1.05), at('5-03', 0.45), at('5-07', 0.25), at('6-06', 0.32), at('7-12', 0.55)],
};
export const KEY_PRE = 0.75;                                    // the hand with the key arrives this long before
// 0 locked .. 0.25 shackle sprung .. 1 fallen onto the table; before the boxing the shackles hang open (0.22)
export function lockState(t, side, i) {
  const B = BOXING[side];
  if (t < B.clicks[i] - 0.06) return 0.22;
  const ts = LOCKS[side][i];
  if (t < ts - 0.04) return 0.22 * (1 - clamp((t - (B.clicks[i] - 0.06)) / 0.06, 0, 1));
  if (t < ts + 0.1) return 0.25 * clamp((t - (ts - 0.04)) / 0.14, 0, 1);
  return lerp(0.25, 1, clamp((t - ts - 0.1) / 0.45, 0, 1));
}
export const locksGone = (t, side) => LOCKS[side].filter((ts) => t > ts + 0.1).length;

// ---------------------------------------------------------------- 安全 ✓ stickers: slap times per side (14 each)
const plaster = (row, k0, n, gap) => Array.from({ length: n }, (_, i) => at(row, k0 + i * gap));
export const STICKERS = {
  US: [at('3-04', 2.45), at('4-03', 2.45), at('5-01', 0.78), at('5-05', 0.56), ...plaster('5-09', 0.35, 5, 0.58), at('6-05', 0.62), ...plaster('6-07', 0.4, 4, 0.85)],
  CN: [at('3-06', 2.55), at('4-08', 1.85), at('5-03', 0.78), at('5-07', 0.5), ...plaster('5-09', 0.62, 5, 0.58), at('6-06', 0.62), ...plaster('6-07', 0.75, 4, 0.85)],
};
export const stickersAt = (t, side) => STICKERS[side].filter((ts) => ts - 0.06 < t).map((ts) => clamp((t - ts + 0.06) / 0.16, 0, 1));

// ---------------------------------------------------------------- the box: lid, seam, chains, burst
export function boxAt(t, side) {
  const B = BOXING[side];
  const gone = locksGone(t, side);
  // open and empty until the joker drops in; slammed; burst open from inside (8-01); lids rise (8-03)
  let lid = t < B.slam ? 1 : lerp(1, 0, clamp((t - B.slam) / 0.12, 0, 1));
  const burst = t > CUES.burst ? clamp((t - CUES.burst) / 0.25, 0, 1) : 0;
  if (t > CUES.burst) lid = Math.max(lid, 0.12 * burst);
  if (t > CUES.rise) lid = lerp(0.12, 1, smooth((t - CUES.rise) / 1.6));
  const filled = t > B.drop;
  const seam = !filled ? 0 : Math.min(1, 0.08 + gone * 0.17 + (t > CUES.party ? 0.1 * smooth((t - CUES.party) / 5) : 0));
  // chains lie on the table while the box stands open, wrap on at the slam, slither off after the last lock
  const last = LOCKS[side][4];
  const chains = t < B.slam ? 1 : t < B.slam + 0.35 ? 1 - (t - B.slam) / 0.35 : t < last + 0.2 ? 0 : clamp((t - last - 0.2) / 0.7, 0, 1);
  return { show: 1, lid, burst, seam, chains, locks: [0, 1, 2, 3, 4].map((i) => lockState(t, side, i)), stickers: stickersAt(t, side) };
}

// ---------------------------------------------------------------- the gold leak: how many of a side's presses it reaches
export function leakReach(t, side) {
  let r = 0;
  LOCKS[side].forEach((ts, i) => { r = Math.max(r, (i + 1) * clamp((t - ts - 0.15) / 0.7, 0, 1)); });
  return r;                                                     // 0..5 (fractional while it runs)
}

// ---------------------------------------------------------------- the kings' bodies over the film
// inflation: the race swells them, OpenAI most; DeepSeek stays the smallest
const SIZE = {
  openai: [[0, 0.86], [CUES.full, 1.0], [CUES.eyes, 1.12], [CUES.boast, 1.32], [CUES.frenzy, 1.4], [CUES.mad, 1.46]],
  google: [[0, 1.1], [CUES.full, 1.12], [CUES.frenzy, 1.22], [CUES.mad, 1.28]],
  anthropic: [[0, 0.98], [CUES.frenzy, 1.08], [CUES.mad, 1.16]],
  deepseek: [[0, 0.8], [CUES.kiln, 0.84], [CUES.frenzy, 0.9], [CUES.mad, 0.96]],
};
export function sizeAt(t, id) {
  const ks = SIZE[id] ?? [[0, 1], [CUES.frenzy, 1.08], [CUES.mad, 1.16]];
  let s = keys(t, ks);
  // the end: as their cards fly into the new king, they shrink
  if (t > CUES.race) s *= lerp(1, 0.78, smooth((t - CUES.race) / 9));
  return s;
}
// sweat: the race heats them up; the party cools them; the end heats them again
export function sweatAt(t, id) {
  let s = 0.15 * smooth((t - CUES.double) / 2) + 0.35 * smooth((t - CUES.eyes) / 6) + 0.5 * smooth((t - CUES.frenzy) / 6);
  if (id === 'google') s = Math.max(s, t > CUES.code ? 0.5 : 0);
  if (t > CUES.auto) s *= 1 - 0.8 * smooth((t - CUES.auto) / 3);
  if (t > CUES.lookup) s = Math.max(s, 0.8);
  if (t > CUES.stare) s = 1;
  return clamp(s, 0, 1);
}
// half-standing: the frenzy and the final race
export function riseAt(t, id) {
  let r = 0;
  if (t > CUES.frenzy - 0.5 && t < CUES.auto + 0.3) r = smooth((t - CUES.frenzy + 0.5) / 1.2) * (1 - smooth((t - CUES.button + 0.5) / 0.8));
  if (t > CUES.race - 0.3) r = Math.max(r, smooth((t - CUES.race + 0.3) / 1.0));
  return r;
}
export function crownTiltAt(t, id) {
  const ph = KINGS.findIndex((k) => k.id === id);
  const k = smooth((t - CUES.frenzy) / 4) * (t < CUES.auto ? 1 : 1 - smooth((t - CUES.auto) / 2)) + (t > CUES.race ? smooth((t - CUES.race) / 3) : 0);
  return (ph % 2 ? 1 : -1) * (0.12 + 0.06 * (ph % 3)) * clamp(k, 0, 1);
}
void SIDE_SIGN; void SEAT; void BOX; void end;
