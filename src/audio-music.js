// Sound department — the score of 《失控》 OUT OF CONTROL v7, R1 .. R9 (docs/SOUND.md).
// SCORE[cue] scores one cue into its chunk (audio.js renders the film one cue at a time).
//
// ONE THEME. The kings' race theme is eight beats, a sneaky minor march: D E F D | E C# D A (the first half on the
// tonic, the second on the dominant). Every beat is a card slapped down: the slaps ARE the beat.
//   R1  a lazy tuba under the lazy game (1-07): the theme in embryo.
//   R3  the race: pizzicato, then horns, trombones, trumpets, snare, drums; a semitone higher every bar.
//   R4  light, on the dings and slaps of 提示.
//   R5  托管: a release, then the theme in MAJOR, smug, on the hands' beat; cold for the holdouts (a heartbeat, a low
//       E-flat at each 淘汰, a falling glissando for each chair); back for the flock, climbing over the AI's drones
//       (D against E-flat), its third draining out.
//   R8  a music box: three notes of it in major at the smiles, unfinished;
//   R9  the music box finishes it under the title and the credits, coming home to D; then the black and the last card.
// Around it: R2's one warm chord (B-flat major, its third in it) soured by a low A; R6 the drones, two brass roars, a
// wall cut dead; R7 the AI's cold organ rising from its lowest note in open fifths (no third: the third is human).
// Every time comes from the picture's events (the slaps, the 托管 presses, the giant card, the chairs, the smiles) or
// from CUES / ROW: never a hard-coded second.
import { SR, TAU, mtof, put, put2, clamp, smooth, drive, within, Rng } from './audio-dsp.js';
import { section, brass, bowed, snare, warDrum, timpani, crash, cymbalSwell, bassDrum } from './audio-inst.js';
import { musicBox, organNotes, choirVowel, drone, shepardInto, pizzNote } from './audio-voices.js';
import { isUS, preOf } from './audio-kinds.js';
import { SHOTS, CUES, ROW } from './shots.js';

const CUE_NAME = { R1: '蚂蚁 the ant', R2: '横空出世 number one', R3: '争第一 the race', R4: '提示 hint', R5: '托管 auto', R6: '底牌 the red cards', R7: '眼睛 the eye', R8: '结尾 the end', R9: '片尾 title and credits' };
export function cueTable() {
  const out = [];
  for (const s of SHOTS) { const l = out[out.length - 1]; if (l && l.id === s.cue) l.t1 = s.t1; else out.push({ id: s.cue, name: CUE_NAME[s.cue] ?? s.cue, t0: s.t0, t1: s.t1 }); }
  return out;
}
export const LV = { lazy: 1, warm: 1, race: 1, fear: 1, ai: 1, organ: 1, box: 1 };
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'], nn = (m) => NN[((Math.round(m) % 12) + 12) % 12];

// THE THEME: scale steps from the tonic, eight beats; the bass on each beat and the off-beat chord, per half
// ('void': the melody minor, the off-beat chords open fifths: the third, the human, gone from under it)
export const THEME = { min: [0, 2, 3, 0, 2, -1, 0, -5], maj: [0, 2, 4, 0, 2, -1, 0, -5], void: [0, 2, 3, 0, 2, -1, 0, -5] };
const OOM = [[0, -5, 0, -5], [-5, -10, -5, -10]];
const PAH = { min: [[3, 7, 12], [-1, 2, 7]], maj: [[4, 7, 12], [-1, 2, 7]], void: [[7, 12, 19], [-5, 2, 7]] };
// R9: the black before the music box comes in under the title (audio.js gates it to exact zero)
export const TITLE_HOLD = 1.0;

// a pure sub line (sine + a little 2nd harmonic) with a level curve lvl(t) in film seconds
function subTone(G, t0, t1, m, lvl, gain = 0.2, glide = null) {
  const len = Math.ceil((t1 - t0) * SR), out = new Float32Array(len), f0 = mtof(m), fe = Math.round(0.02 * SR);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const t = t0 + i / SR, f = f0 * (glide ? Math.pow(2, glide(t) / 12) : 1); p += f / SR; p -= Math.floor(p);
    out[i] = (Math.sin(TAU * p) + 0.15 * Math.sin(2 * TAU * p)) * lvl(t) * Math.min(1, i / fe, (len - i) / fe);
  }
  put(G, t0, out, { gain, send: 0 });
}

// A kit of players writing into one chunk's (windowed) music group and its sections. DEFERRED: every call takes its
// seed at once and queues the work; scoreCueG plays the queue in order (one step each).
function makeKit(G, seedBase, Q) {
  let seed = seedBase; const S = () => ++seed;
  const mk = () => section(G.n, G.off), sec = { str: mk(), brs: mk(), org: mk(), cho: mk(), ai: mk(), pz: mk() };
  const L = (x) => [].concat(x), q = (f) => { Q.push(f); };
  return {
    G, sec, S,
    BR: (kind, t, d, ms, v, o = {}) => d > 0 && L(ms).forEach((m, i) => { const sd = S(); q(() => brass(o.sec ?? sec.brs, kind, t + i * 0.004, d, m, v, { ...o, seed: sd })); }),
    ST: (t, d, ms, v, o = {}) => d > 0 && L(ms).forEach((m) => { const sd = S(); q(() => bowed(o.sec ?? sec.str, t, d, m, v, { ...o, seed: sd })); }),
    PZ: (t, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => pizzNote(o.sec ?? sec.pz, t, m, v, { ...o, seed: sd })); }),
    DRUM: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, warDrum(v, sd, o), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: o.send ?? 0.35 })); },
    BD: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, bassDrum(v, sd, o), { gain: o.gain ?? 0.8, pan: o.pan ?? 0, send: o.send ?? 0.2 })); },
    TIMP: (t, m, v, ring = 1, o = {}) => { const sd = S(); q(() => put(G, t, timpani(m, v, sd, ring), { gain: o.gain ?? 0.7, pan: o.pan ?? -0.1, send: 0.35 })); },
    CRASH: (t, v, ring = 2.4, o = {}) => { const sd = S(); q(() => put(G, t, crash(v, sd, ring), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.15, send: 0.4 })); },
    SWELL: (tPeak, rise, ring, v, o = {}) => { const sd = S(); if (rise > 0) q(() => put(G, tPeak - rise, cymbalSwell(rise, ring, v, sd), { gain: o.gain ?? 1, pan: o.pan ?? 0.1, send: 0.4 })); },
    SNARE: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, snare(v, sd), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.1, send: o.send ?? 0.2 })); },
    SUB: (t0, t1, m, lvl, gain, glide) => q(() => subTone(G, t0, t1, m, lvl, gain, glide)),
    MB: (t, m, v, o = {}) => { const sd = S(); q(() => put(G, t, musicBox(m, v, { seed: o.seedFix ?? sd, ring: o.ring, detune: o.detune, bright: o.bright }), { gain: (o.gain ?? 0.55) * LV.box, pan: o.pan ?? 0, send: o.send ?? 0.3 })); },
    ORG: (t, d, ms, lvl, o = {}) => { const sd = S(); q(() => organNotes(o.sec ?? sec.org, t, d, ms, lvl, { ...o, seed: sd, gain: (o.gain ?? 0.05) * LV.organ })); },
    CHOIR: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => choirVowel(o.sec ?? sec.cho, t, d, m, v, { ...o, seed: sd })); }),
    DRONE: (t0, t1, fAt, lvl, o = {}) => { const sd = S(); q(() => drone(o.sec ?? sec.ai, t0, t1, fAt, lvl, { ...o, seed: sd })); },
    SHEP: (t0, t1, rate, lvl, o = {}) => { const sd = S(); q(() => shepardInto(o.sec ?? sec.ai, t0, t1, rate, lvl, { ...o, seed: sd })); },
    flush() { put2(G, null, sec.str, { send: 0.36 }); put2(G, null, sec.brs, { send: 0.32 }); put2(G, null, sec.org, { send: 0.55 }); put2(G, null, sec.cho, { send: 0.5 }); put2(G, null, sec.ai, { send: 0.42 }); put2(G, null, sec.pz, { send: 0.3 }); },
  };
}

// ---- the beat: a clean list from slap times. Near-simultaneous slaps merge, flams are dropped, small gaps are filled
// with ghost beats (no slap), long pauses are left as rests. o: merge, minP (no beat closer than this), p0, maxFill
export function beatsFrom(times, o = {}) {
  const T = [...times].sort((a, b) => a - b), M = [];
  for (const t of T) if (!M.length || t - M[M.length - 1] > (o.merge ?? 0.07)) M.push(t);
  const B = [], minP = o.minP ?? 0, maxFill = o.maxFill ?? 1.3;
  let p = o.p0 ?? 0.5;
  for (const t of M) {
    if (!B.length) { B.push({ t, slap: true }); continue; }
    const last = B[B.length - 1].t, gap = t - last;
    if (gap < Math.max(minP, 0.55 * p)) continue;
    const k = Math.max(1, Math.min(Math.round(gap / p), minP > 0 ? Math.floor(gap / minP) : Infinity));
    if (gap <= maxFill) { for (let j = 1; j < k; j++) B.push({ t: last + gap * j / k, slap: false }); p = 0.55 * p + 0.45 * gap / k; }
    B.push({ t, slap: true });
  }
  return B;
}
// a steady, accelerating grid from a crowd of slaps (two players each on his own tempo, a machine spitting cards): the
// slap rate in a sliding window, never slowing down (rising at most `acc` beats/s per second), kept between 1/pMax and
// 1/pMin, integrated into beats; a beat within 40 ms of a slap lands on it. The first beat is t0.
export function gridFrom(times, t0, t1, o = {}) {
  const T = times.filter((t) => t >= t0 - 1 && t < t1 + 1).sort((a, b) => a - b), W = o.win ?? 2.0, dt = 0.005, pMin = o.pMin ?? 0.2, pMax = o.pMax ?? 0.6, acc = o.acc ?? 0.8;
  const rateAt = (t) => { const a = Math.max(t0, Math.min(t - W / 2, t1 - W)), b = a + W; let n = 0; for (const x of T) if (x >= a && x < b) n++; return clamp(n * (o.k ?? 1) / W, 1 / pMax, 1 / pMin); };
  const B = [{ t: t0, slap: T.some((x) => Math.abs(x - t0) < 0.04) }];
  let ph = 0, r = rateAt(t0);
  for (let t = t0; t < t1 - 0.03; t += dt) {
    r = Math.max(r, Math.min(rateAt(t), r + acc * dt));
    ph += r * dt;
    if (ph >= 1) { ph -= 1; const tg = t + dt, near = T.reduce((m, x) => (Math.abs(x - tg) < Math.abs(m - tg) ? x : m), Infinity), snap = Math.abs(near - tg) < 0.04; const tb = snap ? near : tg; if (tb - B[B.length - 1].t > 0.55 / r && tb < t1 - 0.03) B.push({ t: tb, slap: snap }); }
  }
  return B;
}
// a beat list carried on past its last slap (ghost beats), a little faster each beat, until t1
const extend = (B, t1, f = 0.985, pMin = 0.36) => { if (B.length < 2) return B; const out = [...B]; let p = B[B.length - 1].t - B[B.length - 2].t; for (let t = B[B.length - 1].t + (p = Math.max(pMin, p * f)); t < t1 - 0.05; t += (p = Math.max(pMin, p * f))) out.push({ t, slap: false }); return out; };
// the bar of every beat: bars of 4 beats while the beat is slower than `fast`, of 8 when faster (a bar stays ~1.5-2 s)
function barsOf(beats, fast = 0.3, bar0 = 0) {
  const out = []; let bar = bar0, inBar = 0, len = 4;
  beats.forEach((b, i) => { const g = (beats[i + 1]?.t ?? b.t + (i ? b.t - beats[i - 1].t : 0.5)) - b.t; if (inBar === 0) len = g < fast ? 8 : 4; out.push(bar); if (++inBar >= len) { inBar = 0; bar++; } });
  return { bars: out, next: bar + (inBar ? 1 : 0) };
}

// ---- the race theme on a beat list. o: tonic (midi of the bass tonic, D3 = 50), mode, trAt(bar) semitones, pos0 (theme
// position of the first beat), bars (barsOf), lay(t) -> layer levels 0..1, vel(t), skip(t) -> true to rest, fast
function march(k, beats, o) {
  const TH = THEME[o.mode ?? 'min'], PH = PAH[o.mode ?? 'min'], n = beats.length, bars = o.bars ?? barsOf(beats, o.fast).bars, played = [];
  for (let i = 0; i < n; i++) {
    const t = beats[i].t, g = clamp((beats[i + 1]?.t ?? t + (i ? t - beats[i - 1].t : 0.5)) - t, 0.08, 0.9);
    if (o.skip && o.skip(t)) continue;
    const pos = (o.pos0 ?? 0) + i, j = pos % 8, half = j < 4 ? 0 : 1, tonic = o.tonic + o.trAt(bars[i]), Ly = o.lay(t), v = o.vel(t), side = beats[i].pan ?? 0;
    const mel = tonic + 12 + TH[j], bass = tonic - 12 + OOM[half][j % 4], pah = PH[half].map((x) => tonic + x), off = t + g / 2;
    // the melody
    if (Ly.pzMel) k.PZ(t, mel + 12, v, { n: 4, gain: 0.2 * Ly.pzMel, dur: g * 0.9, pan: 0.2, spread: 0.35 });
    if (Ly.hnMel) k.BR('horn', t, g * 0.55, mel, v, { accent: 1, att: 0.006, rel: 0.05, gain: 0.12 * Ly.hnMel * LV.race, pan: 0.15 + 0.2 * side });
    if (Ly.tpMel) k.BR('trumpet', t, g * 0.5, Math.min(86, mel + 12), v * 0.95, { accent: 1, rel: 0.05, gain: 0.075 * Ly.tpMel * LV.race, pan: -0.1 + 0.2 * side, tune: 4 });
    if (Ly.stMel) k.ST(t, g * 0.6, [mel, mel + 12], v, { n: 4, accent: 1, att: 0.004, rel: 0.05, gain: 0.07 * Ly.stMel * LV.race, bright: 5, vib: 0, pan: 0.25 });
    // the oom: the bass on the beat
    if (Ly.tuba) k.BR('tuba', t, g * 0.45, bass, v, { accent: 1, att: 0.006, rel: 0.05, gain: 0.28 * Ly.tuba * LV.race });
    if (Ly.pzBass) k.PZ(t, bass, v, { n: 3, gain: 0.32 * Ly.pzBass, dur: g * 0.85, pan: -0.15, spread: 0.25 });
    // the pah: the off-beat chord
    if (Ly.pzPah && g > 0.16) k.PZ(off, pah, v * 0.85, { n: 2, gain: 0.11 * Ly.pzPah, dur: g * 0.4, pan: 0.05, spread: 0.5 });
    if (Ly.trPah && g > 0.14) k.BR('trombone', off, Math.max(0.06, g * 0.3), pah, v * 0.85, { n: 2, accent: 1, att: 0.005, rel: 0.04, gain: 0.06 * Ly.trPah * LV.race, pan: -0.2 });
    // drums: the snare on the off-beat (a roll when the beat is fast), the bass drum every other beat, a timpani and a
    // crash at the bars, war drums at the top
    if (Ly.snare) { k.SNARE(off, (0.35 + 0.4 * v) * Ly.snare, { gain: 0.5, pan: 0.12 }); if (g < 0.32) { k.SNARE(t + g / 4, 0.25 * Ly.snare, { gain: 0.4, pan: 0.12 }); k.SNARE(t + 3 * g / 4, 0.25 * Ly.snare, { gain: 0.4, pan: 0.12 }); } }
    if (Ly.bd && j % 2 === 0) k.BD(t, (0.6 + 0.4 * v) * Ly.bd, { f: 50, ring: 0.28, gain: 0.75 });
    const barStart = i === 0 || bars[i] !== bars[i - 1];
    if (Ly.timp && barStart) k.TIMP(t, tonic - 12, (0.6 + 0.4 * v) * Ly.timp, 0.7, { gain: 0.55 });
    if (Ly.crash && barStart && (bars[i] % 2 === 0 || Ly.crash > 0.8)) k.CRASH(t + 0.002, 0.8 * Ly.crash, 1.4, { gain: 0.45, pan: bars[i] % 4 ? 0.3 : -0.3 });
    if (Ly.war && j % 4 === 0) k.DRUM(t, 0.7 + 0.3 * v, { f: 44, ring: 0.6, gain: 0.7 * Ly.war });
    // the strings' tremolo under the bar (the frenzy)
    if (Ly.trem && j % 4 === 0) { const d = Math.min(2.2, 4 * g); k.ST(t, d, [tonic, tonic + 12 + PH[half][0], tonic + 12 + PH[half][1]], 0.9, { n: 5, trem: 16, att: 0.02, rel: 0.05, gain: 0.07 * Ly.trem * LV.race, pont: 0.35, bright: 5 }); }
    played.push({ t, g, tonic, mel, bar: bars[i], j });
  }
  return played;
}
// a falling glissando (a chair sliding back into the dark): trombones and tuba slide down an octave and more, the
// basses with them, fading as he goes
function chairGliss(k, t, d, from, side) {
  const bend = (tt) => -14 * Math.pow(clamp(tt / d), 1.25), sw = (u) => 1 - 0.8 * u;
  k.BR('trombone', t, d, [from, from - 12], 0.9, { n: 3, att: 0.02, rel: 0.2, bend, swell: sw, gain: 0.09 * LV.race, pan: 0.5 * side, scoop: 0 });
  k.BR('tuba', t, d, from - 24, 0.85, { att: 0.02, rel: 0.2, bend, swell: sw, gain: 0.2 * LV.race, scoop: 0 });
  k.ST(t, d, from - 12, 0.85, { n: 5, att: 0.02, rel: 0.2, pm: bend, swell: sw, gain: 0.08 * LV.race, bright: 3.5, maxCut: 2500, pan: 0.4 * side });
}
// a full hit: brass, strings, drums on a chord (the giant card, the two last slaps)
function hit(k, t, chord, v, o = {}) {
  const d = o.dur ?? 1, sw = o.swell ?? ((u) => 1 - 0.7 * smooth(u)), rel = o.rel ?? 0.35, g = o.gain ?? 1, root = chord[0];
  k.BR('tuba', t, d, [root - 24, root - 12], v, { accent: 1, att: 0.006, rel, swell: sw, gain: 0.28 * g });
  k.BR('trombone', t, d, chord.map((x) => x - 12), v, { n: 4, accent: 1, att: 0.006, rel, swell: sw, gain: 0.12 * g });
  k.BR('horn', t, d, chord, v, { accent: 1, att: 0.01, rel, swell: sw, gain: 0.12 * g });
  if (o.tpt) k.BR('trumpet', t, d * 0.9, chord.map((x) => x + 12).filter((x) => x <= 88), v * 0.95, { accent: 1, rel, swell: sw, tune: 6, gain: 0.07 * g });
  if (o.str !== false) k.ST(t, d, [root - 24, root - 12, ...chord, chord[chord.length - 1] + 12], v, { n: 5, trem: 15, accent: 1, att: 0.01, rel, gain: 0.15 * g, swell: sw, pont: 0.3 });
  k.DRUM(t, 1, { f: 40, ring: 1.0, gain: 0.85 * (o.drum ?? 1) });
  if (o.drum2) k.DRUM(t + 0.012, 1, { f: 47, ring: 0.9, gain: 0.6 * o.drum2, pan: 0.2 });
  if (o.crash) k.CRASH(t + 0.003, 1, o.crashRing ?? 2.4, { gain: 0.8 * o.crash });
  if (o.timp) k.TIMP(t, root - 12, 1, 1.2, { gain: 0.7 * o.timp });
  if (o.sub) k.SUB(t, t + 2.2, root - 24, (x) => Math.exp(-(x - t) / 0.7), 0.16 * o.sub);
}
const minor = (r) => [r, r + 3, r + 7];
const slapTimes = (E, a, b, minG = 0.6, kinds = ['cardSlap']) => E.filter((e) => kinds.includes(e.kind) && e.t >= a && e.t < b && (e.gain ?? 1) >= minG).map((e) => e.t).sort((x, y) => x - y);
const sideOf = (E, t) => { const e = E.find((x) => x.kind === 'cardSlap' && Math.abs(x.t - t) < 0.04); return e ? (isUS(e.who) ? 1 : -1) : 0; };

// every scorer: (kit, C, ROW, ev, cue, X) -> gaps [[t0, t1, db, rampIn, rampOut, label]] carved after the room
// 《失控》 v7: the v3 score (the kit and the race theme), R5 rebuilt around 托管 and the holdouts, R9 new.
export const SCORE = {
  // R1 蚂蚁 — no music: steps, the far game, the hum. 1-05: the vacuum, the crush, then (almost) nothing. 1-07: the theme
  // in embryo, a lazy tuba over soft pizzicato, under the lazy screen-tapping; ends on A, drooping.
  R1(k, C, ROW, ev, cue) {
    const tS = C.table + 0.55, tE = C.draw - 0.35, N = 10, p = (tE - tS) / N, TH = THEME.min, tonic = 38;
    for (let i = 0; i < 8; i++) {
      const t = tS + i * p + 0.03 * (i % 2), half = i < 4 ? 0 : 1, v = 0.5 + 0.06 * (i % 4 === 0);
      k.BR('tuba', t, p * 0.62, tonic + TH[i], v, { att: 0.03, rel: 0.12, gain: 0.3 * LV.lazy, scoop: 0.35 });
      k.PZ(t + p / 2 + 0.02, PAH.min[half].map((x) => 50 + x), 0.5, { n: 2, gain: 0.08 * LV.lazy, dur: p * 0.35, pan: 0.15, spread: 0.4 });
      if (i % 2 === 0) k.PZ(t, tonic + OOM[half][i % 4], 0.45, { n: 2, gain: 0.12 * LV.lazy, dur: p * 0.6, pan: -0.1 });
    }
    const tY = tS + 7 * p + 0.03;
    k.BR('tuba', tY + p, 1.6 * p, tonic - 5, 0.45, { att: 0.08, rel: 0.25, gain: 0.26 * LV.lazy, scoop: 0, bend: (tt) => -1 * smooth((tt - 0.6 * p) / p), swell: (u) => 1 - 0.5 * u });
    cue(tS, `R1: 1-07: the race theme in embryo, a lazy tuba (${(60 / p).toFixed(0)} bpm) over pizzicato; ends on A, drooping`);
    return [];
  },

  // R2 出牌 — 2-03: a thin high A held while OpenAI taps, cut at the ChatGPT slap (a timpani on B-flat under it). 2-05: the
  // warm chord (B-flat major, its third in it); 2-06 a soft choir "o"; 2-07 the low A slides in under DeepSeek, held into R3.
  R2(k, C, ROW, ev, cue, X) {
    const sl = ev('cardSlap', C.chat - 0.3, C.blast + 0.3)[0], tSl = sl ? sl.t : C.chat + 1.0, t0 = C.draw + 0.3;
    k.TIMP(tSl + 0.004, 34, 1, 1.8, { gain: 1.0, pan: 0 }); k.PZ(tSl + 0.004, [34, 46], 0.9, { n: 3, gain: 0.45, pan: 0 }); k.SUB(tSl, tSl + 1.4, 34, (t) => Math.exp(-(t - tSl) / 0.45), 0.12);
    k.ST(t0, tSl - t0 + 0.01, 81, 0.5, { n: 3, att: 0.9, rel: 0.01, vib: 0, pont: 0.5, gain: 0.15 * LV.warm, bright: 1.2, maxCut: 3800, swell: (u) => 0.4 + 0.6 * u });
    k.ST(t0 + 0.2, tSl - t0 - 0.19, [45, 57], 0.5, { n: 4, att: 1.0, rel: 0.01, vib: 0, gain: 0.12 * LV.warm, bright: 2, maxCut: 900, swell: (u) => 0.3 + 0.7 * u });
    k.ST(C.chat, tSl - C.chat + 0.005, [81, 82, 93], 0.9, { n: 5, trem: 18, att: 0.2, rel: 0.003, swell: (u) => 0.3 + 0.7 * u * u, gain: 0.07, pont: 0.6, bright: 5, maxCut: 9000 });
    k.SWELL(tSl, tSl - C.chat, 0.02, 1, { gain: 1.4 });
    hit(k, tSl, [58, 62, 65], 1, { dur: 0.5, tpt: true, crash: 1.2, crashRing: 2.5, timp: 1, sub: 1.5, drum2: 1, gain: 1.2, rel: 0.3 });
    k.ST(tSl + 0.1, C.awe - tSl - 0.2, [46, 47, 58, 59, 70, 71], 0.9, { n: 5, trem: 16, att: 0.05, rel: 0.1, swell: (u) => 1 - 0.85 * u, gain: 0.07, pont: 0.4, bright: 5 });
    const tW = C.awe + 0.9, tE = C.race - 0.6, dW = tE - tW;
    const warm = (x) => smooth(x / 0.22) * (1 - 0.25 * smooth((x - 0.62) / 0.15)) * (1 - smooth((x - 0.84) / 0.16));
    k.ST(tW + 0.05, dW, [46, 53, 58, 62, 65, 70], 0.7, { n: 6, att: 0.5, rel: 0.6, swell: warm, gain: 0.05 * LV.warm, bright: 3.2, maxCut: 3200, vib: 5, spread: 0.7 });
    k.ST(tW + 0.1, dW, [34, 46], 0.65, { n: 5, att: 0.6, rel: 0.6, swell: warm, gain: 0.06 * LV.warm, bright: 2.6, maxCut: 1200 });
    k.BR('horn', tW + 0.35, dW - 0.35, [58, 62, 65], 0.55, { att: 0.7, rel: 0.6, swell: warm, gain: 0.07 * LV.warm, vib: 1.5 });
    k.ST(tW + 0.6, dW - 0.6, [82, 86, 89], 0.5, { n: 4, att: 0.9, rel: 0.6, swell: warm, gain: 0.018 * LV.warm, bright: 1.6, maxCut: 7000, vib: 4, pont: 0.2 });
    k.ST(t0, 0.01, 81, 0.01, { gain: 0 });
    const tB = C.behind + 0.15, tP = (ev('cardSlap', C.race - 0.2, C.tower)[0]?.t ?? C.race + 0.4);
    k.ST(tB, tP - tB + 0.02, [34, 46], 0.8, { n: 6, att: 0.25, rel: 0.02, pm: (tt) => -smooth(tt / 0.9), swell: (u) => 0.5 + 0.5 * Math.min(1, u * 3), gain: 0.07 * LV.warm, bright: 3, maxCut: 1600 });
    k.BR('tuba', tB + 0.05, tP - tB - 0.03, 34, 0.6, { att: 0.3, rel: 0.02, bend: (tt) => -smooth(tt / 0.9), gain: 0.15 * LV.warm, scoop: 0 });
    cue(tW, 'R2: the warm chord (B-flat major) as ChatGPT lights up; 2-07 the low A slides in under DeepSeek');
    return [];
  },

  // R3 比大 — the race on the slaps (3-01's hero slaps, carried on), the skim and the crash, 3-03 half a beat of silence and
  // a dumbfounded chord, 3-04 the raise into the dominant, the vacuum, the giant card's tutti, 3-05 the race tutti on a grid
  // from the slaps, climbing to D an octave up.
  R3(k, C, ROW, ev, cue, X) {
    const gaps = [], E = X.events, T0 = 50;
    const skim = ev('cardSkim', C.tower, C.gasp)[0], crashE = ev('towerCrash', C.tower, C.big)[0];
    const tSkim = skim ? skim.t : C.tower + 2.3, dSkim = skim ? skim.dur || 0.8 : 0.8, tCrash = crashE ? crashE.t : tSkim + dSkim;
    const big = E.find((e) => e.kind === 'bigSlam'), tBig = big ? big.t : C.big + 2.4, tVac = tBig - preOf({ kind: 'bigSlam' });
    const B1 = extend(beatsFrom(slapTimes(E, C.race - 0.08, C.tower, 0.6, ['cardSlap', 'cardToss']), { p0: 0.6, maxFill: 1.0 }), tSkim - 0.05);
    const bar1 = barsOf(B1, 0.3);
    const lay1 = (t) => { const a = smooth((t - C.race) / 1.5), c = t >= C.tower ? 1 : 0; return { pzMel: 1 - 0.4 * a, pzBass: 1, tuba: 1, pzPah: 1, hnMel: 0.9 + 0.1 * a, tpMel: 0.3 + 0.6 * a, trPah: 0.5 + 0.5 * a, snare: 0.8 + 0.2 * a, bd: 1, timp: 0.6, stMel: 0.4 * c }; };
    const P1 = march(k, B1, { tonic: T0, trAt: (b) => b, bars: bar1.bars, lay: lay1, vel: (t) => 0.75 + 0.12 * smooth((t - C.race) / (tSkim - C.race)), skip: (t) => t >= tSkim - 0.02 });
    const trEnd1 = P1.length ? P1[P1.length - 1].tonic - T0 : 0;
    k.ST(tSkim, tCrash - tSkim + 0.03, [T0 + trEnd1 + 31, T0 + trEnd1 + 36], 0.55, { n: 4, trem: 18, att: 0.1, rel: 0.02, pont: 0.6, gain: 0.03, bright: 4, maxCut: 9000 });
    for (let t = tSkim + 0.05; t < tCrash - 0.03; t += 0.05) k.SNARE(t, 0.18 + 0.25 * (t - tSkim) / Math.max(0.2, tCrash - tSkim), { gain: 0.35, pan: 0.1 });
    k.CRASH(tCrash + 0.01, 0.95, 2.0, { gain: 0.7, pan: 0.35 }); hit(k, tCrash, minor(T0 + trEnd1 + 12), 1, { dur: 0.9, tpt: true, crash: 1.2, timp: 1, sub: 1.4, drum2: 1, gain: 1.4, rel: 0.5 }); k.SWELL(tCrash, tCrash - tSkim, 0.02, 1, { gain: 1.3 }); k.TIMP(tCrash, T0 + trEnd1 - 12, 1, 1, { gain: 0.6 });
    for (let i = 0; i < 12; i++) k.PZ(tCrash + 0.03 + 0.045 * i * (1 - 0.02 * i), T0 + trEnd1 + 24 - i * 2 + (i % 2), 0.85 - 0.04 * i, { n: 2, gain: 0.13, dur: 0.12, pan: 0.5 - 0.06 * i });
    gaps.push([C.gasp, C.gasp + 0.32, -60, 0.015, 0.06, '3-03: half a beat of silence']);
    const tD = C.gasp + 0.45, rD = T0 + trEnd1;
    k.BR('trombone', tD, 0.9, [rD - 12, rD - 9, rD - 5], 0.55, { n: 3, att: 0.05, rel: 0.3, bend: (tt) => -smooth((tt - 0.35) / 0.4), swell: (u) => 1 - 0.5 * u, gain: 0.15, scoop: 0 });
    k.BR('tuba', tD, 0.9, rD - 24, 0.55, { att: 0.05, rel: 0.3, bend: (tt) => -smooth((tt - 0.35) / 0.4), gain: 0.32, scoop: 0 });
    // after the giant card: the race tutti, on a grid from the slaps, to 4-01
    const tEnd = C.boardBig - 0.05, B2 = gridFrom(slapTimes(E, tBig + 0.15, tEnd, 0.6), tBig, tEnd, { pMin: 0.22, pMax: 0.5, win: 2.0 }).map((b) => ({ ...b, pan: sideOf(E, b.t) }));
    const bar2 = barsOf(B2, 0.3), nB2 = bar2.next, tr0 = Math.max(trEnd1 + 1, 12 - (nB2 - 1)), trAt2 = (b) => Math.min(12, tr0 + b);
    const tR = Math.max(C.big + 0.2, tD + 1.0), dom = T0 + tr0 + 7, cres = (t) => smooth((t - tR) / (tVac - tR));
    for (let t = tR; t < tVac - 0.01; t += 0.045) k.SNARE(t, 0.3 + 0.6 * cres(t), { gain: 0.65, pan: 0.12 });
    for (let t = tR, q = 0; t < tVac - 0.01; t += 0.07, q++) k.TIMP(t, dom - 24, 0.3 + 0.6 * cres(t), 0.4, { gain: 0.35, pan: q % 2 ? -0.2 : 0 });
    k.ST(tR, tVac - tR + 0.01, [dom - 12, dom - 8, dom - 5, dom, dom + 4], 0.9, { n: 5, trem: 16, att: 0.3, rel: 0.01, pm: (tt) => -2 + 2 * smooth(tt / (0.8 * (tVac - tR))), swell: (u) => 0.5 + 0.5 * u * u, gain: 0.1 * LV.race, pont: 0.4, bright: 5 });
    k.BR('horn', tR + 0.2, tVac - tR - 0.19, [dom, dom + 4], 0.95, { att: 0.5, rel: 0.01, swell: (u) => 0.45 + 0.55 * u * u, gain: 0.12 * LV.race });
    k.BR('trombone', tR + 0.3, tVac - tR - 0.29, [dom - 12, dom - 8, dom - 5], 0.95, { n: 3, att: 0.5, rel: 0.01, swell: (u) => 0.45 + 0.55 * u * u, gain: 0.11 * LV.race });
    k.SWELL(tVac, Math.min(2.2, tVac - tR), 0.02, 0.9, { gain: 1.2 });
    gaps.push([tVac, tBig - 0.002, -90, 0.03, 0.002, `3-04: the vacuum before the giant card (${(tBig - tVac).toFixed(2)} s)`]);
    hit(k, tBig, minor(T0 + 12 + tr0), 1, { dur: 0.8, swell: (u) => 1 - 0.85 * smooth(u), tpt: true, crash: 1.2, crashRing: 3, timp: 1, sub: 1.5, drum2: 1, gain: 1.25 });
    const lay2 = (t) => { const f = smooth((t - C.boardBig) / 1.0); return { pzBass: 0.8, tuba: 1, pzPah: 0.5, trPah: 1, hnMel: 1, tpMel: 1, stMel: 0.6, snare: 1, bd: 1, timp: 0.9, crash: 0.6 + 0.4 * f, trem: 0.6 + 0.4 * f, war: 0.4 + 0.6 * f }; };
    if (B2.length >= 6) march(k, B2.slice(1), { tonic: T0, trAt: trAt2, bars: bar2.bars.slice(1), pos0: 1, lay: lay2, vel: (t) => 0.85 + 0.15 * smooth((t - tBig) / (tEnd - tBig)) });
    const top = T0 + 12 + Math.min(12, trAt2(Math.max(0, nB2 - 1)));
    cue(B1[0]?.t ?? C.race, `R3: the race: ${B1.length} beats to the skim (D up ${trEnd1}); the giant card on ${nn(T0 + tr0)} minor; ${B2.length >= 6 ? `${B2.length} beats tutti to ${nn(top)}` : 'then its ring (no room for the tutti grid before the board)'}`);
    return gaps;
  },

  // R4 提示 — 4-01: a heartbeat-like low pulse (timpani and pizzicato on D) while his finger hovers; the dings are the
  // effects'; 4-05: the ding-slap becomes the beat: the theme light (pizzicato, snare) on a grid from the slaps.
  R4(k, C, ROW, ev, cue, X) {
    for (let t = C.stuck + 0.3, i = 0; t < C.hint + 0.3; t += 0.78, i++) { k.TIMP(t, 38, 0.45, 0.6, { gain: 0.25 }); k.TIMP(t + 0.24, 38, 0.3, 0.5, { gain: 0.2 }); }
    k.ST(C.stuck + 0.2, C.hints - C.stuck, [38, 50], 0.5, { n: 4, att: 0.8, rel: 0.5, gain: 0.04, bright: 2.4, maxCut: 800, swell: (u) => 1 - 0.6 * u });
    const E = X.events, tE = C.auto - 0.05, B = gridFrom(slapTimes(E, C.hints, tE, 0.6), C.hints + 0.1, tE, { pMin: 0.25, pMax: 0.5, win: 1.5 });
    march(k, B, { tonic: 50, trAt: (b) => b, lay: (t) => ({ pzMel: 1, pzBass: 1, pzPah: 0.8, hnMel: 0.5 * smooth((t - C.hints) / 2), snare: 0.6, bd: 0.6, tuba: 0.6 }), vel: () => 0.8 });
    cue(C.stuck, `R4: a heartbeat on D; 4-05 the theme light on ${B.length} beats (the dings and slaps)`);
    return [];
  },

  // R5 托管 — the theme on the machine's grid (the autoPlay slaps), brighter, the kings laughing back in their chairs: brass
  // tutti, cheerful and too fast; 5-05: the AI's drones creep in under it (D against E-flat) as the card faces go strange.
  // v7: R5 carries the turn. 5-01 the hands can't keep up (a roll straining on the dominant, a breath of nothing) -> the
  // 托管 slam is the RELEASE: a warm D-major tutti, the orchestra exhaling; then the theme in MAJOR, smug, on the beat of
  // the five hands (5-04: their five slams are five stabs climbing D F# A D F#). 5-05 Meta's hand over the button: the
  // march far behind, one horn note hanging (G over D), sagging. 5-06 .. 5-08 COLD: the march gone; a heartbeat (R4's)
  // that stops at 淘汰; each 淘汰 a low E-flat (the AI's semitone) on timpani and muted brass; each chair a falling
  // glissando into the dark; cold string harmonics and the organ's low D at the edge of hearing. 5-09 nothing, then the
  // laughs pick the theme back up (three pizzicati, a tuba on A). 5-10 the whole table on auto: the theme tutti on the
  // flock's grid, still major, but a semitone higher every bar over drones that do not move (D against E-flat); 5-11 the
  // third drains out (minor melody, open-fifth chords), the orchestra thins to pizzicato and snare, the drones and a
  // Shepard riser grow: the strange hum.
  R5(k, C, ROW, ev, cue, X) {
    const E = X.events, gaps = [], T0 = 50, TRI = [2, 6, 9];
    const ons = ev('autoOn', C.auto - 0.5, C.holdout), tOn = ons[0]?.t ?? C.auto + 2.0;
    const tDS = (ons.find((e) => e.t >= C.autoCN - 0.2 && e.t < C.autoAll - 0.05) ?? { t: C.autoCN + 0.85 }).t;   // 5-03's hand (混沌)
    // v8: 5-06 opens on the leaderboard (the auto scores racing past 人类 100): the smug march plays on through that insert,
    // and the cold starts on Meta's screen (the row's second cut)
    const tCold = ROW['5-06']?.cuts?.[1]?.t0 ?? C.pass, ins = (t) => smooth((t - C.pass) / 0.15);
    const five = ons.filter((e) => e.t >= C.autoAll - 0.05);
    const p = five.length > 1 ? clamp((five[five.length - 1].t - five[0].t) / (five.length - 1), 0.4, 0.7) : 0.52, a0 = five[0]?.t ?? C.autoAll + 0.3;
    const hes = ev('hesitate', C.holdout - 0.5, C.pass)[0], tH = hes ? hes.t : C.holdout + 0.6;
    const outs = ev('eliminated', C.holdout, C.empty + 0.5), drags = ev('dragOut', C.holdout, C.empty + 0.5);
    const laughs = ev('chuckle', C.empty, C.allAuto), tL = laughs[0]?.t ?? C.empty + 1.2;
    const lastDrag = drags.length ? Math.max(...drags.map((e) => e.t + (e.dur || 1))) : C.empty;
    // ---- 5-01: the hands can't keep up
    const tR0 = C.auto + 0.15, tG = tOn - 0.14, cr = (t) => smooth((t - tR0) / Math.max(0.3, tG - tR0));
    for (let t = tR0; t < tG - 0.01; t += 0.055) k.SNARE(t, 0.12 + 0.6 * Math.pow(cr(t), 1.5), { gain: 0.5, pan: 0.12 });
    for (let t = tR0, q = 0; t < tG - 0.01; t += 0.075, q++) k.TIMP(t, 45, 0.2 + 0.5 * cr(t), 0.4, { gain: 0.3, pan: q % 2 ? -0.2 : 0 });
    k.ST(tR0, tG - tR0, [57, 69, 73, 76], 0.85, { n: 5, trem: 17, att: 0.3, rel: 0.01, swell: (u) => 0.2 + 0.8 * u * u, gain: 0.085, pont: 0.4, bright: 4.5 });
    k.BR('horn', tR0 + 0.4, tG - tR0 - 0.4, [57, 64], 0.85, { att: 0.5, rel: 0.01, swell: (u) => 0.3 + 0.7 * u * u, gain: 0.09 });
    gaps.push([tG, tOn - 0.004, -60, 0.01, 0.004, '5-01: a breath of nothing before the 托管 slam']);
    // ---- the slam: the release (D major, the orchestra exhaling)
    hit(k, tOn, [62, 66, 69], 1, { dur: 1.3, swell: (u) => 1 - 0.75 * smooth(u), crash: 0.3, crashRing: 2.6, timp: 1, sub: 1, gain: 0.4, rel: 0.6 });
    k.BR('horn', tOn + 0.12, 1.9, [66, 69, 74], 0.6, { att: 0.25, rel: 0.7, swell: (u) => 1 - 0.65 * u, gain: 0.06, vib: 2 });
    k.ST(tOn + 0.08, 2.1, [50, 57, 62, 66, 69, 74], 0.65, { n: 6, att: 0.2, rel: 0.8, swell: (u) => 1 - 0.6 * u, gain: 0.045, bright: 3, maxCut: 3500, vib: 5 });
    // ---- the smug march on the five hands' beat (back-filled to after the slam), the theme's downbeat on the first hand
    const kS = Math.ceil((tOn + 0.95 - a0) / p), B = [];
    for (let q = kS; a0 + q * p < tCold - 0.05; q++) B.push({ t: a0 + q * p, slap: false });
    const pos0 = ((kS % 8) + 8) % 8, bars = B.map((_, i) => Math.floor((pos0 + i) / 4));
    const inFive = (t) => five.length && t > a0 - 0.08 && t < a0 + (five.length - 0.5) * p;
    const lay = (t) => {
      const ds = smooth((t - tDS) / 0.5), al = smooth((t - C.autoAll) / 0.5), ho = smooth((t - C.holdout) / 0.4) * (1 - 0.8 * ins(t)), f = 1 - ho;
      const m = 1 - 0.4 * al;
      return { tuba: 0.9 * m * (1 - 0.75 * ho), pzBass: 0.6 * (1 - 0.5 * ho), pzPah: 0.8 * m * (1 - 0.6 * ho), hnMel: inFive(t) ? 0 : 0.9 * m * f, trPah: (0.3 + 0.5 * ds) * m * f, stMel: 0.3 * ds * m * f,
        tpMel: inFive(t) ? 0 : 0.4 * al * f, snare: (0.2 + 0.4 * al) * f, bd: (0.35 + 0.35 * al) * f, timp: 0.3 * al * f };
    };
    march(k, B, { tonic: T0, mode: 'maj', trAt: () => 0, bars, pos0, lay, vel: (t) => 0.78 + 0.08 * smooth((t - C.autoAll) / 1) });
    // 5-03's slam (混沌): a grudging low stab on his side
    k.BR('trombone', tDS, 0.35, [50, 54, 57], 0.9, { n: 3, accent: 1, att: 0.005, rel: 0.12, gain: 0.12, pan: -0.3 });
    k.BR('tuba', tDS, 0.35, 38, 0.9, { accent: 1, att: 0.006, rel: 0.12, gain: 0.25 });
    k.DRUM(tDS, 0.8, { f: 46, ring: 0.5, gain: 0.55, pan: -0.3 }); k.TIMP(tDS, 38, 0.8, 0.8, { gain: 0.45 });
    // 5-04: the five hands, five stabs climbing the D-major chord
    const below = (m) => { for (let x = m - 1; x > m - 12; x--) if (TRI.includes(((x % 12) + 12) % 12)) return x; return m - 5; };
    five.forEach((e, i) => {
      const top = [66, 69, 74, 78, 81][Math.min(i, 4)], v = [top, below(top), below(below(top))], pan = isUS(e.who) ? 0.3 : -0.3;
      k.BR('horn', e.t, 0.3, v, 0.95, { accent: 1, att: 0.005, rel: 0.15, gain: 0.07, pan });
      k.BR('trombone', e.t, 0.3, v.map((x) => x - 12), 0.9, { n: 3, accent: 1, att: 0.005, rel: 0.12, gain: 0.06, pan: -pan * 0.5 });
      if (i >= 2) k.BR('trumpet', e.t, 0.28, top + 12 <= 88 ? top + 12 : top, 0.9, { accent: 1, rel: 0.1, gain: 0.05, tune: 4, pan });
      k.DRUM(e.t, 0.7 + 0.06 * i, { f: 46, ring: 0.45, gain: 0.35, pan });
      if (i === five.length - 1) k.CRASH(e.t + 0.003, 0.9, 1.4, { gain: 0.35 });
    });
    // ---- 5-05: Meta's hand over the button: one horn note hanging (G over D), sagging as he pulls back
    const dH = clamp(C.pass - tH - 0.35, 0.8, 1.8);
    k.BR('horn', tH, dH, 67, 0.5, { att: 0.45, rel: 0.5, vib: 2.5, swell: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.7), bend: (tt) => -0.45 * smooth((tt - 0.6 * dH) / (0.4 * dH)), gain: 0.13, pan: 0.35, scoop: 0 });
    // ---- 5-06 .. 5-08: cold
    const tP = tCold, out0 = outs[0]?.t ?? tP + 2.2;
    for (let t = tP + 0.12; t < out0 - 0.15; t += 0.74) { k.TIMP(t, 38, 0.5, 0.6, { gain: 0.3 }); k.TIMP(t + 0.23, 38, 0.33, 0.5, { gain: 0.22 }); }
    k.ST(tP, lastDrag + 0.4 - tP, [81, 88], 0.4, { n: 3, att: 0.9, rel: 1.0, vib: 0, pont: 0.7, gain: 0.022, bright: 1.6, maxCut: 9000 });
    k.ORG(tP + 0.3, lastDrag - tP, [26, 33], (t) => 0.6 * smooth((t - tP) / 1.5), { reg: { sub: 0.8, p8: 1 }, att: 1.0, rel: 0.9, gain: 0.05, chiff: 0 });
    for (const o of outs) {
      const s = isUS(o.who) ? 1 : -1, sw = (u) => 1 - 0.8 * u;
      k.TIMP(o.t, 39, 0.95, 1.5, { gain: 0.6, pan: 0.3 * s });
      k.BR('trombone', o.t, 0.8, [38, 39, 45], 0.6, { n: 3, att: 0.01, rel: 0.4, swell: sw, gain: 0.09, pan: 0.3 * s });
      k.BR('tuba', o.t, 0.8, 27, 0.7, { att: 0.01, rel: 0.4, swell: sw, gain: 0.2 });
      k.ST(o.t, 0.5, [87, 88], 0.7, { n: 3, att: 0.003, rel: 0.3, pont: 0.8, gain: 0.03, bright: 4 });
    }
    for (const d of drags) chairGliss(k, d.t + 0.1, Math.max(0.8, d.dur || 1.2), 50, isUS(d.who) ? 1 : -1);
    // ---- 5-09: nothing; then the laughs pick the theme back up
    [0, 0.165, 0.33].forEach((x, i) => k.PZ(tL + x, [57, 54, 50][i] + 12, 0.7, { n: 2, gain: 0.16, dur: 0.15, pan: 0.15 }));
    k.BR('tuba', tL + 0.55, Math.max(0.3, C.allAuto - tL - 0.58), 45, 0.55, { att: 0.15, rel: 0.05, gain: 0.2, scoop: 0.3 });
    // ---- 5-10 / 5-11: the flock: the theme tutti on its grid, climbing over the drones; the third draining out
    const tE = C.red - 0.04, B2 = gridFrom(slapTimes(E, C.allAuto - 0.2, tE, 0.6), C.allAuto, tE, { pMin: 0.2, pMax: 0.4, win: 1.5, acc: 1 });
    const bar2 = barsOf(B2, 0.3), iM = B2.findIndex((b) => b.t >= C.mountain), nA = iM < 0 ? B2.length : iM, tr = (b) => Math.min(6, b);
    march(k, B2.slice(0, nA), { tonic: T0, mode: 'maj', trAt: tr, bars: bar2.bars.slice(0, nA), lay: () => ({ tuba: 1, pzBass: 0.8, pzPah: 0.6, trPah: 0.8, hnMel: 1, tpMel: 0.8, stMel: 0.5, snare: 0.9, bd: 1, timp: 0.6, crash: 0.5, trem: 0.3 }), vel: () => 0.88 });
    const lay3 = (t) => { const f = smooth((t - C.mountain) / 1.6); return { tuba: 1 - 0.5 * f, pzBass: 1, pzPah: 1, hnMel: 1 - 0.7 * f, tpMel: 0.6 * (1 - f), trPah: 0.6 * (1 - f), snare: 1, bd: 0.8 - 0.5 * f, trem: 0.6, stMel: 0.4 }; };
    march(k, B2.slice(nA), { tonic: T0, mode: 'void', trAt: tr, bars: bar2.bars.slice(nA), pos0: nA, lay: lay3, vel: () => 0.85 });
    const gD = (t) => (0.3 * smooth((t - C.allAuto - 0.6) / 2.5) + 0.7 * smooth((t - C.mountain) / 2.0)) * (1 - smooth((t - C.red) / 1.5));
    k.DRONE(C.allAuto + 0.6, C.red + 1.6, () => mtof(38), gD, { pan: -0.55, gain: 0.2 * LV.ai, rough: 0.55 });
    k.DRONE(C.allAuto + 0.8, C.red + 1.6, () => mtof(39), gD, { pan: 0.55, gain: 0.2 * LV.ai, rough: 0.55 });
    k.SHEP(C.mountain, C.red + 0.6, (t) => 0.3 + 0.6 * smooth((t - C.mountain) / 2.6), (t) => smooth((t - C.mountain) / 1.5) * (1 - smooth((t - C.red) / 0.6)), { gain: 0.04 * LV.ai, centre: 650 });
    cue(tOn, `R5: 托管 = the release (D major tutti), the smug theme in major on the hands' beat (${B.length} beats, ${p.toFixed(2)} s), ${five.length} stabs`);
    cue(tH, 'R5: 5-05 the hesitant horn (G over D)');
    cue(tCold, `R5: 5-06 (on Meta's screen) cold: heartbeat, ${outs.length} x 淘汰 (E-flat), ${drags.length} chairs falling into the dark`);
    cue(B2[0]?.t ?? C.allAuto, `R5: 5-10 the flock: ${nA} beats major climbing, then ${B2.length - nA} beats with the third gone; drones, riser`);
    return gaps;
  },

  // R6 取消托管 — the drones (D / E-flat) and a low organ hum carry the red cards; the music thins to nothing under the
  // dead keys (6-02 .. 6-05), the drones swelling; 6-06 two brass roars on the rage events; 6-07 the wall, cut at the stop.
  R6(k, C, ROW, ev, cue, X) {
    const gaps = [], tStop = (X.events.find((e) => e.kind === 'stop') ?? { t: C.stop }).t;
    const gD = (t) => (0.3 + 0.2 * smooth((t - C.cancel) / 3) + 1.1 * smooth((t - C.blizzard) / 2.5)) * (1 - 0.7 * smooth((t - C.freeze) / 0.3) * (1 - smooth((t - C.cancel) / 0.4))) * (1 - 0.75 * smooth((t - C.eyes) / 0.2) * (1 - smooth((t - C.blizzard) / 0.3)));
    k.DRONE(C.red, tStop, () => mtof(38), gD, { pan: -0.55, gain: 0.22 * LV.ai, rough: 0.6 });
    k.DRONE(C.red + 0.1, tStop, () => mtof(39), gD, { pan: 0.55, gain: 0.22 * LV.ai, rough: 0.6 });
    k.ORG(C.red, tStop - C.red, [26, 33], (t) => 0.35 + 0.65 * smooth((t - C.blizzard) / 2), { reg: { sub: 0.8, p8: 1, p4: 0.4 }, att: 1.0, rel: 0.01, gain: 0.06, chiff: 0 });
    const rg = ev('rage', C.accuse - 0.3, C.blizzard), roars = rg.length ? rg.map((e) => [e.t, isUS(e.who) ? 39 : 38, isUS(e.who) ? 0.35 : -0.35]) : [[C.accuse + 0.3, 38, -0.35], [C.accuse + 1.2, 39, 0.35]];
    gaps.push([C.eyes + 0.05, C.eyes + 0.75, -60, 0.01, 0.1, '6-08: one beat of silence (the same eye on both screens)']);
    for (const [t, m, pan] of roars) {
      const ch = [m, m + 3, m + 6, m + 12], sw = (u) => 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.3));
      k.BR('trombone', t, 0.75, ch, 1, { n: 4, accent: 1, att: 0.02, rel: 0.15, flutter: 0.5, swell: sw, gain: 0.13, pan, drive: 4.5 });
      k.BR('horn', t, 0.75, ch.map((x) => x + 12), 1, { accent: 1, att: 0.02, rel: 0.15, flutter: 0.4, swell: sw, gain: 0.12, pan });
      k.BR('tuba', t, 0.8, [m - 12, m], 1, { accent: 1, att: 0.02, rel: 0.15, flutter: 0.3, swell: sw, gain: 0.3 });
      k.DRUM(t, 1, { f: 42, ring: 0.8, gain: 0.7, pan });
    }
    const tW = C.blizzard + 0.1, top = 50;
    k.ST(tW, tStop - tW + 0.01, [top - 12, top - 11, top - 10, top, top + 1, top + 2, top + 3, top + 12, top + 13], 1, { n: 5, trem: 17, att: 0.4, rel: 0.01, swell: (u) => 0.4 + 0.6 * u, gain: 0.1 * LV.ai, pont: 0.45, bright: 5 });
    k.BR('trombone', tW, tStop - tW + 0.01, [top - 12, top - 11, top - 7, top - 6], 1, { n: 4, att: 0.5, rel: 0.01, flutter: 0.35, swell: (u) => 0.3 + 0.7 * u, gain: 0.1, drive: 4 });
    k.SHEP(C.blizzard - 1, tStop, (t) => 0.4 + 1.2 * smooth((t - C.blizzard) / 4), () => 1, { gain: 0.06 * LV.ai, centre: 650 });
    k.SWELL(tStop, Math.min(3.5, tStop - tW), 0.05, 1, { gain: 1.4 });
    for (let t = tW; t < tStop - 0.02; t += 0.05) k.SNARE(t, 0.4 + 0.5 * (t - tW) / (tStop - tW), { gain: 0.4, pan: 0.15 });
    cue(C.red, 'R6: the drones and a low organ under the red cards; 6-06 two brass roars; 6-07 the wall, cut dead at the stop');
    return gaps;
  },

  // R7 眼睛 — 7-01 digital zero. 7-02: the cold organ from its lowest note upward as the cards rise (open fifths, no third);
  // 7-03 full as the eye opens; 7-04 the long tone; 7-05 thinning; gone before the screens deal (8-01).
  R7(k, C, ROW, ev, cue) {
    const rs = ev('rise', C.stop, C.eye)[0], tR = rs ? rs.t : C.rise + 0.05, dR = ROW['7-02'].t1 - tR, tEnd = C.deal + 0.3;
    const lvl = (t) => smooth((t - tR) / dR) * (1 + 0.7 * smooth((t - C.eye) / 1.5)) * (1 - 0.35 * smooth((t - C.lookUp) / 1)) * (1 - 0.4 * smooth((t - C.gaze) / 1)) * (1 - smooth((t - C.deal + 1.2) / 1.2));
    const REG = { sub: 0.7, p8: 1, p4: 0.7, p3: 0.4, p2: 0.45, mix: 0.35 }, NOTES = [26, 33, 38, 45, 50, 52, 57, 62, 64, 69, 74, 76];
    NOTES.forEach((m, i) => k.ORG(tR + i * dR * 0.075, tEnd - tR - i * dR * 0.075, m, lvl, { reg: m < 40 ? { ...REG, sub: 0.9 } : REG, att: 0.35, rel: 0.6, gain: m < 40 ? 0.1 : 0.06, spread: 0.3, pan: (i % 2 ? 0.2 : -0.2), chiff: 0.3 }));
    cue(tR, 'R7: the cold organ from its lowest note upward, D A E, no third; full at the eye');
    return [];
  },

  // R8 发牌的人 — 8-01 the screens' dings (effects); 8-02 the smiles: one music-box note, the theme's first (D6) then its
  // second (E6), in D MAJOR; 8-04 the shadow: a low swell; 8-05 the vacuum and the end slam: the biggest hit, all of the kit
  // on D (no third); then nothing (R9 takes the title and the credits).
  R8(k, C, ROW, ev, cue, X) {
    const sm = ev('smile', C.smile - 0.3, C.reach + 0.5), tS = sm[0]?.t ?? C.smile + 0.5;
    k.MB(tS, 86, 0.8, { send: 0.35, gain: 0.2 }); k.MB(tS + 0.55, 88, 0.7, { send: 0.35, gain: 0.17 }); k.MB(tS + 1.1, 90, 0.65, { send: 0.35, gain: 0.15 });
    const end = X.events.find((e) => e.kind === 'endSlam'), tE = end ? end.t : C.black + 0.45, tV = tE - preOf({ kind: 'endSlam' });
    k.ST(C.shadow, tV - C.shadow, [26, 38, 39], 0.9, { n: 6, trem: 14, att: 0.4, rel: 0.01, swell: (u) => 0.2 + 0.8 * u * u, gain: 0.1, bright: 3, maxCut: 1500 });
    k.SUB(C.shadow, tV, 26, (t) => smooth((t - C.shadow) / (tV - C.shadow)), 0.3, (t) => 12 * smooth((t - C.shadow) / (tV - C.shadow)));
    const gaps = [[tV, tE - 0.002, -90, 0.02, 0.002, '8-05: the vacuum before the last card']];
    hit(k, tE, [62, 69, 74], 1, { dur: 1.0, tpt: true, crash: 1.4, crashRing: 2.5, timp: 1, sub: 2, drum2: 1.2, gain: 1.4, rel: 0.2 });
    k.ORG(tE, 1.0, [26, 38, 45, 50, 57, 62, 69, 74], 1, { reg: { sub: 0.8, p8: 1, p4: 0.8, p3: 0.4, p2: 0.5, mix: 0.4 }, att: 0.01, rel: 0.2, gain: 0.12, chiff: 0 });
    cue(tS, 'R8: the smiles: the music box, D6 E6 F#6 (the theme in major, three notes, unfinished)');
    cue(tE, 'R8: the end slam: the biggest hit (D, no third), then nothing');
    return gaps;
  },

  // R9 片尾 — 9-01 the title: a breath of exact black, then the music box from 8-02 finishes what it began (D6 E6 F#6
  // ...): the theme in D major, slow, once with its half close on A, once coming home (... C# A D), a little slower at
  // the end, its comb's low notes on the strong beats. It rings out before 9-03, where the black is exact again until
  // the last card (the effects' creditSlap, alone and dry), then nothing.
  R9(k, C, ROW, ev, cue, X) {
    const t0 = C.title + TITLE_HOLD + 0.1, tEnd = C.slap - 2.2, MEL = [0, 2, 4, 0, 2, -1, 0, -5, 0, 2, 4, 0, 2, -1, -5, 0];
    const W = MEL.map((_, i) => (i < 12 ? 1 : [1.1, 1.22, 1.4, 1.6][i - 12])), sumW = W.slice(0, 15).reduce((s, x) => s + x, 0), p = (tEnd - t0) / sumW;
    let t = t0;
    MEL.forEach((m, i) => {
      const last = i === MEL.length - 1, v = (i % 4 === 0 ? 0.8 : 0.66) * (last ? 1.05 : 1);
      k.MB(t, 86 + m, v, { send: 0.4, gain: 0.18, ring: last ? 1.3 : 1 });
      const half = i % 8 < 4 ? 0 : 1;
      if (i % 4 === 0 || last) k.MB(t + 0.004, 74 + (last ? 0 : OOM[half][0]), 0.5, { send: 0.4, gain: 0.11 });
      if (i % 4 === 2) k.MB(t + 0.004, 74 + OOM[half][2], 0.4, { send: 0.4, gain: 0.08 });
      t += p * W[i];
    });
    cue(t0, `R9: the music box finishes the theme in D major (16 notes, ${(60 / p).toFixed(0)} bpm, home on D at ${tEnd.toFixed(2)}); exact black before and after; the last card alone`);
    return [];
  },
};

// score one cue into its chunk's music group: returns { report, gaps }
export const scoreCue = (id, G, events, seedBase, X) => drive(scoreCueG(id, G, events, seedBase, X));
export function* scoreCueG(id, G, events, seedBase, X = {}) {
  const report = [], cue = (t, l) => report.push([+t.toFixed(3), 'MUSIC', l]);
  const ev = (kind, a = -Infinity, b = Infinity) => events.filter((e) => e.kind === kind && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  X.events = events;
  const Q = [], k = makeKit(G, seedBase, Q), gaps = SCORE[id](k, CUES, ROW, ev, cue, X) ?? [];
  for (let i = 0; i < Q.length; i++) { const r = Q[i](); if (r && typeof r.next === 'function') yield* within(r, i / (Q.length + 1), (i + 1) / (Q.length + 1)); yield (i + 1) / (Q.length + 1); }
  k.flush();
  return { report, gaps };
}
