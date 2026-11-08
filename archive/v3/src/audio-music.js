// Sound department — the score of the JOKERS WILD v3 reel 「批准 / APPROVED」, R1 .. R6 (docs/SOUND.md).
// SCORE[cue] scores one cue into its chunk (audio.js renders the reel one cue at a time).
//
// THREE MUSICS, three owners:
//   THE PAPER PEOPLE: a small music box. Their motif is four notes, A5 F#6 E6 B5 (sol mi re la in D): a call and an
//     echo across the sea, left open. When their hands meet (4-06) it gets its fifth note, D6, with the only warm
//     chord in the reel (D major, the third in it). At the end (6-05) the box runs down, slower and flatter, and the
//     fifth note is taken by the card king's cold organ: the same D, the third gone.
//   THE KINGS: low brass (the v2 motif: three notes rising by semitones), war drums, low strings. It creeps in on the
//     clock under the reading (A Bb B), the first stamp lands on C, OpenAI's answer on C#; in the race every
//     DeepSeek stamp IS a note of it (a semitone higher every bar of three), OpenAI's stamps bite back a semitone
//     above; the 100 % downbeat lands one step past the top; then the kings fall silent for good.
//   THE AI: the jokers' two drones (A and B-flat, a semitone apart, beating), a Shepard riser that never arrives, the
//     王炸 chord (D A E, open fifths, no third: organ, brass, choir), then only the organ.
// Every time comes from the picture's events (the head kings' stamps, the clock, the board, the hands, the jokers,
// the flash, the king) or from CUES / ROW: never a hard-coded second.
import { SR, TAU, mtof, put, put2, clamp, smooth, drive, within, Rng } from './audio-dsp.js';
import { section, brass, bowed, snare, warDrum, timpani, crash, cymbalSwell } from './audio-inst.js';
import { musicBox, organNotes, choirVowel, drone, shepardInto, flapClick } from './audio-voices.js';
import { isUS, TOUCH_NOTE } from './audio-kinds.js';
import { SHOTS, SHOT, CUES, ROW } from './shots.js';

const CUE_NAME = { R1: '小人 the paper people', R2: '批准 approved', R3: '更快 faster', R4: '不用盖了 no longer needed', R5: '王炸 jokers wild', R6: '牌 cards' };
export function cueTable() {
  const out = [];
  for (const s of SHOTS) { const l = out[out.length - 1]; if (l && l.id === s.cue) l.t1 = s.t1; else out.push({ id: s.cue, name: CUE_NAME[s.cue] ?? s.cue, t0: s.t0, t1: s.t1 }); }
  return out;
}

// the paper people's motif (music box) and its fifth note; the 王炸 chord
export const PAPER = [81, 90, 88, 83];      // A5 F#6 E6 B5
export const FIFTH = TOUCH_NOTE;            // D6
const WANGZHA = [26, 38, 45, 50, 57, 64, 69];   // D1 D2 A2 D3 A3 E4 A4
export const LV = { box: 1.0, kings: 1.0, race: 1.0, ai: 1.0, organ: 1.0 };

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
  const mk = () => section(G.n, G.off), sec = { str: mk(), brs: mk(), org: mk(), cho: mk(), ai: mk() };
  const L = (x) => [].concat(x), q = (f) => { Q.push(f); };
  return {
    G, sec, S,
    BR: (kind, t, d, ms, v, o = {}) => L(ms).forEach((m, i) => { const sd = S(); q(() => brass(o.sec ?? sec.brs, kind, t + i * 0.004, d, m, v, { ...o, seed: sd })); }),
    ST: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => bowed(o.sec ?? sec.str, t, d, m, v, { ...o, seed: sd })); }),
    DRUM: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, warDrum(v, sd, o), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: o.send ?? 0.35 })); },
    TIMP: (t, m, v, ring = 1, o = {}) => { const sd = S(); q(() => put(G, t, timpani(m, v, sd, ring), { gain: o.gain ?? 0.7, pan: o.pan ?? -0.1, send: 0.35 })); },
    CRASH: (t, v, ring = 2.4, o = {}) => { const sd = S(); q(() => put(G, t, crash(v, sd, ring), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.15, send: 0.4 })); },
    SWELL: (tPeak, rise, ring, v, o = {}) => { const sd = S(); q(() => put(G, tPeak - rise, cymbalSwell(rise, ring, v, sd), { gain: o.gain ?? 1, pan: o.pan ?? 0.1, send: 0.4 })); },
    SNARE: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, snare(v, sd), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.1, send: 0.2 })); },
    SUB: (t0, t1, m, lvl, gain, glide) => q(() => subTone(G, t0, t1, m, lvl, gain, glide)),
    MB: (t, m, v, o = {}) => { const sd = S(); q(() => put(G, t, musicBox(m, v, { seed: sd, ring: o.ring, detune: o.detune, bright: o.bright }), { gain: (o.gain ?? 0.55) * LV.box, pan: o.pan ?? 0, send: o.send ?? 0.3 })); },
    ORG: (t, d, ms, lvl, o = {}) => { const sd = S(); q(() => organNotes(o.sec ?? sec.org, t, d, ms, lvl, { ...o, seed: sd, gain: (o.gain ?? 0.05) * LV.organ })); },
    CHOIR: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => choirVowel(o.sec ?? sec.cho, t, d, m, v, { ...o, seed: sd })); }),
    DRONE: (t0, t1, fAt, lvl, o = {}) => { const sd = S(); q(() => drone(o.sec ?? sec.ai, t0, t1, fAt, lvl, { ...o, seed: sd })); },
    SHEP: (t0, t1, rate, lvl, o = {}) => { const sd = S(); q(() => shepardInto(o.sec ?? sec.ai, t0, t1, rate, lvl, { ...o, seed: sd })); },
    CLICK: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, flapClick(o.variant ?? sd), { gain: v * (o.gain ?? 1), pan: o.pan ?? 0, send: o.send ?? 0.06 })); },
    flush() { put2(G, null, sec.str, { send: 0.36 }); put2(G, null, sec.brs, { send: 0.32 }); put2(G, null, sec.org, { send: 0.5 }); put2(G, null, sec.cho, { send: 0.5 }); put2(G, null, sec.ai, { send: 0.42 }); },
  };
}

// a stab of the kings' brass on note m (trombones, tuba; horns from layer 1, trumpets from layer 2)
function stab(k, t, d, m, v, layer, o = {}) {
  const sw = o.swell, G = o.g ?? 1;
  k.BR('trombone', t, d, [m, m], v, { n: 3, accent: 1, att: 0.006, rel: o.rel ?? 0.08, swell: sw, gain: 0.13 * LV.race * G, pan: o.pan ?? -0.1 });
  k.BR('tuba', t, d, m - 12, v, { accent: 0.9, att: 0.006, rel: o.rel ?? 0.08, swell: sw, gain: 0.3 * LV.race * G });
  if (layer >= 1) k.BR('horn', t, d, m + 12, v * 0.92, { accent: 1, att: 0.008, rel: o.rel ?? 0.08, swell: sw, gain: 0.11 * LV.race, pan: 0.15 });
  if (layer >= 2) k.BR('trumpet', t, d * 0.9, Math.min(84, m + 24), v * 0.85, { accent: 1, rel: o.rel ?? 0.06, swell: sw, tune: 5, gain: 0.07 * LV.race });
}
// a full hit of the kings: everything on root (with the semitone above it: their dissonance)
function hit(k, t, root, v, o = {}) {
  const d = o.dur ?? 1, sw = o.swell ?? ((u) => 1 - 0.7 * smooth(u)), rel = o.rel ?? 0.35, g = o.gain ?? 1;
  k.BR('tuba', t, d, [root - 24, root - 12], v, { accent: 1, att: 0.006, rel, swell: sw, gain: 0.3 * g });
  k.BR('trombone', t, d, [root - 12, root - 5, root, root + 1], v, { n: 4, accent: 1, att: 0.006, rel, swell: sw, gain: 0.15 * g });
  k.BR('horn', t, d, [root + 12, root + 13], v, { accent: 1, att: 0.01, rel, swell: sw, gain: 0.13 * g });
  if (o.tpt) k.BR('trumpet', t, d * 0.9, [root + 24, root + 25], v * 0.95, { accent: 1, rel, swell: sw, tune: 6, gain: 0.08 * g });
  if (o.str !== false) k.ST(t, d, [root - 24, root - 12, root, root + 1, root + 12], v, { n: 5, trem: 15, accent: 1, att: 0.01, rel, gain: 0.2 * g, swell: sw, pont: 0.35 });
  k.DRUM(t, 1, { f: 40, ring: 1.0, gain: 0.85 * (o.drum ?? 1) });
  if (o.drum2) k.DRUM(t + 0.012, 1, { f: 47, ring: 0.9, gain: 0.6 * o.drum2, pan: 0.2 });
  if (o.crash) k.CRASH(t + 0.003, 1, o.crashRing ?? 2.4, { gain: 0.8 * o.crash });
  if (o.timp) k.TIMP(t, root - 12, 1, 1.2, { gain: 0.7 * o.timp });
  if (o.sub) k.SUB(t, t + 2.2, root - 24, (x) => Math.exp(-(x - t) / 0.7), 0.16 * o.sub);
}

// the head kings' stamps of a range, split by side (the director's stamps of gain 1; the bed is not music)
function headStamps(events, a, b) {
  const s = events.filter((e) => (e.kind === 'stampHit' || e.kind === 'stampMiss') && !e.bed && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  const merge = (l) => { const o = []; for (const e of l) if (!o.length || e.t - o[o.length - 1].t > 0.06) o.push(e); return o; };
  return { all: s, CN: merge(s.filter((e) => !isUS(e.who))), US: merge(s.filter((e) => isUS(e.who))) };
}
// the fall of a solo stamp (the vacuum before it): the same formula as the stamp's own pre-roll (audio-kinds.js)
export const soloPre = (e) => ((e.pov ?? 'ant') !== 'high' ? clamp(0.12 + 0.3 * clamp(e.size ?? 0.7), 0.03, 0.42) : 0.07);
const firstBig = (ev) => ev('stampHit', 0, Infinity).find((e) => (e.size ?? 0) >= 0.95 && !e.bed) ?? null;

// every scorer: (kit, C, ROW, ev, cue, X) -> gaps [[t0, t1, db, rampIn, rampOut, label]] carved after the room
export const SCORE = {
  // R1 0:00-0:07.6 — the hum and the clock (audio.js / scoreEvents). 1-02: the music box, tiny: two notes when the
  // red paper person waves, the other two when the blue one waves back from far across the sea (softer, farther).
  // 1-03: a shadow: a low swell (basses and cellos on A and B-flat, a sub, the tuba), pp to mp, into 2-01.
  R1(k, C, ROW, ev, cue) {
    const waves = ev('paperWave', ROW['1-02'].t0 - 0.2, ROW['1-03'].t0);
    const red = waves.find((e) => e.who === 'red' || !e.far)?.t ?? ROW['1-02'].t0 + 1.45, blue = waves.find((e) => e.who === 'blue' || e.far)?.t ?? red + 1.0;
    k.MB(red + 0.03, PAPER[0], 1.0, { pan: -0.2, send: 0.22, gain: 0.36 }); k.MB(red + 0.41, PAPER[1], 0.9, { pan: -0.2, send: 0.22, gain: 0.36 });
    k.MB(blue + 0.03, PAPER[2], 0.62, { pan: 0.45, send: 0.5, bright: 0.6, gain: 0.36 }); k.MB(blue + 0.43, PAPER[3], 0.55, { pan: 0.45, send: 0.5, bright: 0.6, gain: 0.36 });
    const t0 = ROW['1-03'].t0 + 0.15, t1 = ROW['2-01'].t0 + 0.5, d = t1 - t0, sw = (u) => 0.08 + 0.92 * Math.pow(smooth(u * 1.15), 1.4);
    k.ST(t0, d, [33, 34], 0.8, { n: 6, att: 0.9, rel: 0.6, swell: sw, gain: 0.11 * LV.kings, bright: 3, maxCut: 1300, spread: 0.3, noise: 0.05 });
    k.ST(t0 + 0.4, d - 0.4, 45, 0.7, { n: 6, att: 1.0, rel: 0.6, swell: sw, gain: 0.07 * LV.kings, bright: 3.4, maxCut: 1800, pan: 0.1, spread: 0.4 });
    k.BR('tuba', t0 + 0.6, d - 0.6, 33, 0.55, { att: 0.8, rel: 0.6, swell: sw, gain: 0.16 * LV.kings });
    k.SUB(t0, t1 + 0.6, 33, (t) => 0.1 + 0.9 * smooth((t - t0) / d) * (1 - smooth((t - t1) / 0.6)), 0.12);
    cue(red, `R1: the music box, tiny: A5 F#6 as the red paper person waves; E6 B5 from far away as the blue one waves back (${blue.toFixed(2)})`);
    cue(t0, 'R1: the shadow: a low swell, basses and cellos on A and B-flat, a sub, the tuba, pp -> mp');
    return [];
  },

  // R2 0:07.6-0:15.3 — the card slides in; the swell becomes a pedal. The kings' motif creeps in on the clock while
  // DeepSeek reads (A, B-flat, B, the last held and growing), a thin high tremolo over it; then the VACUUM (the
  // music, the room, the hum all gone while the stamp falls), then the first stamp: everything on C (with its
  // semitone), war drums, timpani, crash, a sub: the biggest sound so far. OpenAI answers on C#, quicker, drier.
  R2(k, C, ROW, ev, cue) {
    const gaps = [], h1 = firstBig(ev), tH = h1 ? h1.t : ROW['2-04'].t0 + 0.55, tV = tH - (h1 ? soloPre(h1) : 0.42);
    const p0 = ROW['2-01'].t0, sw = (u) => 0.35 + 0.65 * u;
    k.ST(p0, tV - p0 + 0.02, [33, 34], 0.7, { n: 6, att: 0.6, rel: 0.02, swell: sw, gain: 0.1 * LV.kings, bright: 3, maxCut: 1300, spread: 0.3 });
    k.SUB(p0, tV + 0.01, 33, (t) => 0.4 + 0.6 * smooth((t - p0) / (tV - p0)), 0.1);
    // the motif on the clock's ticks
    const ticks = ev('oldClock', ROW['2-02'].t0 - 0.15, tV - 0.45), T = ticks.length >= 3 ? ticks.slice(0, 3).map((e) => e.t) : [0, 1, 2].map((i) => ROW['2-02'].t0 + 0.25 + i * 0.85);
    [45, 46, 47].forEach((m, j) => {
      const t = T[j], d = j < 2 ? T[j + 1] - t - 0.04 : tV - t + 0.02, s = j < 2 ? undefined : (u) => 0.45 + 0.55 * u * u, v = 0.5 + 0.08 * j;
      k.BR('trombone', t, d, [m, m], v, { n: 4, accent: 0.5, att: 0.07, rel: j < 2 ? 0.15 : 0.02, swell: s, gain: 0.14 * LV.kings, pan: -0.1 });
      k.BR('tuba', t, d, m - 12, v, { accent: 0.4, att: 0.07, rel: j < 2 ? 0.15 : 0.02, swell: s, gain: 0.3 * LV.kings });
      if (j === 2) k.BR('horn', t + 0.1, d - 0.1, m + 12, v * 0.8, { att: 0.3, rel: 0.02, swell: (u) => u * u, gain: 0.1 * LV.kings });
    });
    k.ST(T[1], tV - T[1] + 0.02, [81, 82], 0.5, { n: 4, trem: 14, att: 0.8, rel: 0.02, swell: (u) => 0.2 + 0.8 * u * u, pont: 0.7, gain: 0.025, bright: 5, maxCut: 9000, pan: 0.2 });
    gaps.push([tV, tH - 0.002, -90, 0.03, 0.002, `the vacuum: everything but the falling stamp is gone (${(tH - tV).toFixed(2)} s)`]);
    // the first stamp
    hit(k, tH, 48, 1, { dur: 1.3, tpt: true, crash: 1.3, crashRing: 3, timp: 1, sub: 1.4, drum2: 1, gain: 1.3, swell: (u) => 1 - 0.6 * smooth(u) });
    // OpenAI's answer
    const h2 = ev('stampHit', tH + 0.5, C.faster - 0.05).find((e) => !e.bed), t2 = h2 ? h2.t : ROW['2-05'].t0 + 0.45;
    hit(k, t2, 49, 0.95, { dur: 0.55, crash: 0.6, crashRing: 1.6, sub: 0.7, str: true, rel: 0.25, swell: (u) => 1 - 0.8 * smooth(u) });
    cue(T[0], "R2: the kings' motif creeps in on the clock while DeepSeek reads: A, B-flat, B (held, growing); a thin high tremolo");
    cue(tV, `R2: the vacuum: music, room and hum gone while the stamp falls (${(tH - tV).toFixed(2)} s)`);
    cue(tH, 'R2: THE FIRST STAMP: everything on C (with C#), trumpets, war drums, timpani, crash, sub: the biggest sound so far');
    cue(t2, 'R2: OpenAI answers on C#: quicker, drier');
    return gaps;
  },

  // R3 0:15.3-0:24.1 — the race. Every DeepSeek stamp is a note of the kings' motif, a semitone higher each bar of
  // three (D Eb E | Eb E F | ...); every OpenAI stamp bites back a semitone above. Between the beats the machine's
  // ostinato (low spiccato, a hard click) subdivides; a contrabass pedal climbs with the bars; a Shepard riser
  // that never arrives; from 3-06 every beat is a pile-driver tutti over a sustained tremolo cluster. 3-07: the
  // vacuum, then the near miss hits with everything. 3-08: the board flips, and on 100 % one huge downbeat a step
  // past the top. audio.js cuts it all dead on the cut to 4-01.
  R3(k, C, ROW, ev, cue, X) {
    const gaps = [], t0 = C.faster - 0.3, tEnd = C.unneeded, H = headStamps(X.events, t0, tEnd);
    // the downbeat: when the board's last flip lands (snapped onto a DeepSeek stamp right there)
    const flips = ev('boardFlip', ROW['3-08'].t0 - 0.1, tEnd), tF = flips.length ? flips[flips.length - 1].t + 0.08 : ROW['3-08'].t0 + 0.6;
    const snap = H.CN.find((e) => Math.abs(e.t - tF) < 0.1), tD = snap ? snap.t : tF;
    const wild = H.all.find((e) => e.wild), tW = wild ? wild.t : null, tWV = wild ? tW - soloPre(wild) : null;
    let beats = H.CN.filter((e) => e.t < tD - 0.04).map((e) => e.t);
    if (beats.length < 4) { beats = []; for (let t = C.faster + 0.4, d = 0.5; t < tD - 0.1; t += d, d = Math.max(0.17, d * 0.93)) beats.push(t); }
    const inVac = (t) => tWV !== null && t > tWV - 0.01 && t < tW;
    const note = (i) => 50 + Math.floor(i / 3) + (i % 3), nBars = Math.ceil(beats.length / 3), top = 50 + nBars;
    const barAt = (t) => { let i = 0; while (i < beats.length && beats[i] <= t + 1e-6) i++; return Math.max(0, Math.floor((i - 1) / 3)); };
    const iAt = (t) => { let i = -1; while (i + 1 < beats.length && beats[i + 1] <= t + 0.02) i++; return Math.max(0, i); };
    const u = (t) => clamp((t - beats[0]) / (tD - beats[0]));
    // the beats (DeepSeek)
    beats.forEach((t, i) => {
      if (inVac(t) || (tW !== null && Math.abs(t - tW) < 0.03)) return;
      const nx = i + 1 < beats.length ? beats[i + 1] : tD, gap = nx - t, m = note(i), piles = t >= C.piles - 0.02, v = 0.72 + 0.28 * u(t);
      const layer = t < C.run ? 0 : t < C.blind ? 1 : 2;
      if (piles) hit(k, t, m, v, { dur: Math.min(0.32, gap * 0.95), rel: 0.06, str: false, drum: 0.9, crash: i % 2 ? 0 : 0.45, crashRing: 1.0, sub: 0.6, tpt: true, swell: (x) => 1 - 0.5 * x, gain: 0.85 });
      else { stab(k, t, Math.min(0.55, gap * 0.9), m, v, layer, { g: t < C.run ? 1.5 : 1 }); k.DRUM(t, 0.75 + 0.25 * u(t), { f: 44, ring: 0.55, gain: t < C.run ? 0.95 : 0.7 }); }
      if (i % 3 === 0) k.TIMP(t, m - 24 + 12, 0.8 + 0.2 * u(t), 0.6, { gain: 0.5 });
      // the machine between the beats: a low spiccato on the bar's root and a hard click, subdividing
      const ns = clamp(Math.round(gap / 0.1), 1, 4);
      for (let s = 1; s < ns; s++) { const ts = t + s * gap / ns; if (inVac(ts) || ts >= tD - 0.02) continue; k.ST(ts, 0.045, m - 12 - (s % 2 ? 5 : 0), 0.6 + 0.35 * u(ts), { n: 4, att: 0.003, rel: 0.04, accent: 1, gain: 0.09, bright: 5, vib: 0, pan: -0.1, spread: 0.3 }); k.CLICK(ts, 0.35 + 0.4 * u(ts), { pan: s % 2 ? 0.25 : -0.25 }); }
      k.CLICK(t, 0.5 + 0.4 * u(t), { pan: 0 });
    });
    // OpenAI bites back: a horn a semitone above DeepSeek's current note, a snare
    for (const e of H.US) {
      if (e.t < beats[0] - 0.5 || e.t >= tD - 0.02 || inVac(e.t)) continue;
      const m = note(iAt(e.t)) + 1, v = 0.7 + 0.3 * u(e.t);
      k.BR('horn', e.t, 0.12, [m + 12], v, { accent: 1, att: 0.005, rel: 0.05, gain: 0.12 * LV.race, pan: 0.3 });
      k.BR('trombone', e.t, 0.1, m, v * 0.9, { n: 2, accent: 1, att: 0.005, rel: 0.04, gain: 0.08 * LV.race, pan: 0.3 });
      k.SNARE(e.t, 0.5 + 0.45 * u(e.t), { gain: 0.6, pan: 0.25 });
    }
    // the climbing pedal (contrabasses, tremolo) and the Shepard riser
    const pmBar = (t0b) => (tt) => barAt(t0b + tt);
    for (let bb = 0; bb < nBars; bb++) {          // re-bowed every bar, a semitone higher
      const a0 = beats[3 * bb], a1 = Math.min(tD, beats[3 * bb + 3] ?? tD), x = u(a0);
      if (a1 - a0 > 0.05) k.ST(a0, a1 - a0 + 0.02, 38 + bb, 0.8, { n: 5, trem: 12, att: 0.04, rel: 0.03, accent: 0.6, swell: () => 0.3 + 0.7 * x, gain: 0.1 * LV.race, bright: 3.5, maxCut: 1500, spread: 0.3 });
    }
    const sEnd = tWV ?? tD;
    k.SHEP(C.faster, sEnd + 0.01, (t) => 0.12 + 0.5 * u(t), (t) => 0.15 + 0.85 * Math.pow(u(t), 1.3), { gain: 0.045 * LV.ai, centre: 600 });
    if (tW !== null) k.SHEP(tW + 0.05, tD + 0.01, () => 0.8, (t) => 0.8 + 0.2 * smooth((t - tW) / (tD - tW)), { gain: 0.05 * LV.ai, centre: 760, seed: 9 });
    // 3-05: a crash on the montage; 3-06: the pile-drivers over a sustained tremolo cluster
    k.CRASH(C.blind + 0.003, 0.9, 1.4, { gain: 0.55 });
    const tP = C.piles, rP = note(iAt(tP)), pEnd = (tWV ?? C.near) + 0.01;
    k.ST(tP, pEnd - tP, [rP - 12, rP, rP + 1, rP + 12, rP + 13], 0.95, { n: 5, trem: 16, att: 0.05, rel: 0.01, pm: pmBar(tP), swell: (x) => 0.7 + 0.3 * x, gain: 0.12 * LV.race, pont: 0.4, bright: 5 });
    // 3-07: the vacuum, then the near miss with everything
    if (tW !== null) {
      gaps.push([tWV, tW - 0.002, -90, 0.025, 0.002, `3-07 the vacuum before the near miss (${(tW - tWV).toFixed(2)} s)`]);
      const m = note(iAt(tW)) + 1;
      hit(k, tW, m, 1, { dur: 0.7, tpt: true, crash: 1.1, crashRing: 2.2, timp: 1, sub: 1.3, drum2: 1, swell: (x) => 1 - 0.7 * smooth(x) });
      k.ST(tW + 0.05, tD - tW - 0.05, [m - 12, m, m + 1, m + 12], 0.95, { n: 5, trem: 17, att: 0.1, rel: 0.01, swell: (x) => 0.6 + 0.4 * x, gain: 0.12 * LV.race, pont: 0.45, bright: 5 });
      cue(tWV, `R3: 3-07 the vacuum (${(tW - tWV).toFixed(2)} s: only the paper person's dive and the falling stamp), then the near miss with everything, on ${m}`);
    }
    // 3-08: 100 %: one huge downbeat a step past the top, held until the cut
    const dD = tEnd - tD + 0.02;
    hit(k, tD, top, 1, { dur: dD, tpt: true, crash: 1.2, crashRing: 3, timp: 1, sub: 1.5, drum2: 1.2, rel: 0.01, swell: (x) => 1 - 0.25 * x });
    k.CRASH(tD + 0.02, 0.95, 2.2, { gain: 0.6, pan: -0.3 });
    k.ST(tD, dD, [top - 24, top - 12, top - 5, top, top + 1, top + 12, top + 13, top + 24], 1, { n: 5, trem: 16, accent: 1, att: 0.006, rel: 0.01, gain: 0.2 * LV.race, pont: 0.4 });
    cue(beats[0], `R3: the race: ${beats.length} DeepSeek stamps carry the kings' motif (${nBars} bars, D up to ${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][(top - 1) % 12]}), ${H.US.length} OpenAI stamps bite back a semitone above; the machine subdivides; a Shepard riser`);
    cue(tP, 'R3: 3-06: every beat a pile-driver tutti over a sustained tremolo cluster');
    cue(tD, `R3: 3-08: 100 %: one huge downbeat on ${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][top % 12]} (with its semitone), held until the cut`);
    X.lastBeat = beats.length > 1 ? beats[beats.length - 1] - beats[beats.length - 2] : 0.17; X.top = top;
    return gaps;
  },

  // R4 0:24.1-0:34.5 — no longer needed. 4-01 / 4-02: the kings' music is gone; the presses tick on by themselves at
  // the race's last tempo (dry, small), the stamp lands on bare cloth (the picture's hollow miss) and a high glassy
  // tone hangs over the emptiness. 4-03: everything drains at once (audio.js chokes the effects too): only the flock.
  // 4-06: the music box comes back: the four notes as they meet, and on the hand-hold the fifth note (the picture's
  // handTouch) with the only warm chord in the reel: D major, its third in it (the box's bass tines, soft strings).
  R4(k, C, ROW, ev, cue, X) {
    const gaps = [], tR = C.river, dT = clamp(X.lastBeat ?? 0.17, 0.14, 0.3);
    for (let t = C.unneeded + 0.06, q = 0; t < tR - 0.02; t += dT, q++) k.CLICK(t, 0.42 * (1 - 0.35 * (t - C.unneeded) / (tR - C.unneeded)), { pan: q % 2 ? 0.12 : -0.12, send: 0.03, variant: q % 3 });
    const miss = ev('stampMiss', C.unneeded, tR).find((e) => !e.bed), tM = miss ? miss.t + 0.05 : C.unneeded + 0.9, hi = 81;
    k.ST(tM, tR - tM + 0.02, [hi, hi + 7], 0.45, { n: 3, att: 0.7, rel: 0.02, vib: 0, pont: 0.35, gain: 0.07, bright: 1.3, maxCut: 3200, swell: (x) => 0.6 + 0.4 * x });
    k.ST(tM, tR - tM + 0.02, 33, 0.5, { n: 4, att: 0.9, rel: 0.02, gain: 0.05, bright: 2.5, maxCut: 700 });
    gaps.push([tR, (ev('handTouch', tR, C.moons)[0]?.t ?? ROW['4-06'].t0 + 1.62) - 1.75, -90, 0.004, 0.004, '4-03: drained at once: only the flock (the effects are choked too)']);
    // 4-06: the four notes as they meet, the fifth on the hand-hold (the picture's handTouch event plays it)
    const tT = ev('handTouch', tR, C.moons)[0]?.t ?? ROW['4-06'].t0 + 1.62;
    [1.6, 1.2, 0.8, 0.4].forEach((dt, j) => k.MB(tT - dt, PAPER[j], [0.85, 0.8, 0.75, 0.7][j], { pan: j % 2 ? 0.12 : -0.12, send: 0.28, gain: 0.63 }));
    if (!X.events.some((e) => e.kind === 'handTouch')) k.MB(tT, FIFTH, 0.9, { send: 0.3, gain: 1.2 });
    // the warm chord: the box's bass tines (D4, A4, F#5) and soft strings (D3, A3, F#4; cellos D2), gone as the jokers rise
    [[62, 0.03], [69, 0.2], [78, 0.38]].forEach(([m, dt]) => k.MB(tT + dt, m, 0.45, { pan: 0, send: 0.3, ring: 1.3, gain: 0.53 }));
    const tE = C.moons + 0.25, dW = tE - tT, warm = (x) => Math.min(1, x * 2.2) * (1 - smooth((x - 0.82) / 0.18));
    k.ST(tT + 0.05, dW, [50, 57, 66], 0.55, { n: 5, att: 0.7, rel: 0.3, swell: warm, gain: 0.043, bright: 3, maxCut: 2600, vib: 5, spread: 0.6 });
    k.ST(tT + 0.1, dW, 38, 0.5, { n: 5, att: 0.8, rel: 0.3, swell: warm, gain: 0.038, bright: 2.8, maxCut: 1200 });
    cue(C.unneeded, `R4: the kings' music gone; the presses tick on alone every ${dT.toFixed(3)} s; the hollow miss; a high glassy tone over the emptiness`);
    cue(tR, '4-03: drained at once: only the flock of cards overhead');
    cue(tT - 1.6, `R4: 4-06: the music box comes back: the four notes as they meet, the fifth (D6) on the hand-hold at ${tT.toFixed(2)}, and the only warm chord (D major)`);
    return gaps;
  },

  // R5 0:34.5-0:42.9 — 王炸. The jokers' drones (CN on A, US on B-flat, a semitone apart: they beat, they fight) rise
  // with the jokers; a low string cluster as the kings stand; the charge: both drones glide up four semitones (still
  // a semitone apart), a Shepard riser racing, the strings climbing, a war-drum roll, a cymbal swell, all CUT into
  // the digital silence (5-04). 5-05: the jokers turn (a breath drawn in: a reverse swell, a sub rising) and on the
  // flash ONE enormous cold chord: D A E in open fifths, no third, organ + brass + choir + strings, the drones
  // resolved into its D. 5-06: the long tone rises as the gold floods: the choir's top line steps up A D E A.
  R5(k, C, ROW, ev, cue) {
    const gaps = [], jr = ev('jokerRise', C.moons - 0.3, C.faceoff), cn = jr.find((e) => e.who === 'CN') ?? jr[0], us = jr.find((e) => e.who === 'US') ?? jr[1];
    const tC = cn ? cn.t : C.moons, tU = us ? us.t : C.moons + 0.15, ch = ev('charge', C.standUp, C.faceoff)[0], tK = ch ? ch.t : C.charge, dK = ch ? (ch.dur || C.faceoff - tK) : C.faceoff - tK, tZ = C.faceoff;
    const fl = ev('pair', C.pair - 0.2, C.flood)[0], tF = fl ? fl.t : C.pair + 0.5;
    const glide = (t) => 4 * smooth(clamp((t - tK) / dK)), grow = (t0) => (t) => smooth((t - t0) / 0.8) * (0.85 + 0.25 * smooth((t - C.standUp) / 0.8) + 0.8 * Math.pow(clamp((t - tK) / dK), 1.5));
    k.DRONE(tC, tZ, (t) => 55 * Math.pow(2, glide(t) / 12), grow(tC), { pan: -0.55, gain: 0.3 * LV.ai, rough: 0.6 });
    k.DRONE(tU, tZ, (t) => 58.27 * Math.pow(2, glide(t) / 12), grow(tU), { pan: 0.55, gain: 0.3 * LV.ai, rough: 0.6 });
    k.SUB(tC, tZ, 33, (t) => smooth((t - tC) / 2) * (0.5 + 0.5 * clamp((t - tK) / dK)), 0.06, glide);
    // the kings stand: a low cluster (fear)
    k.ST(C.standUp, tZ - C.standUp + 0.01, [33, 34, 35], 0.75, { n: 5, trem: 13, att: 0.5, rel: 0.01, swell: (x) => 0.3 + 0.7 * x, gain: 0.14 * LV.kings, bright: 3.5, maxCut: 1600, pm: (tt) => glide(C.standUp + tt) });
    // the charge
    k.SHEP(tK, tZ, (t) => 0.5 + 1.4 * clamp((t - tK) / dK), (t) => 0.2 + 0.8 * clamp((t - tK) / dK), { gain: 0.11 * LV.ai, centre: 700 });
    k.ST(tK, tZ - tK + 0.01, [45, 46, 57, 58], 0.9, { n: 5, trem: 16, att: 0.15, rel: 0.01, pm: (tt) => 7 * Math.pow(clamp(tt / dK), 1.3), swell: (x) => 0.3 + 0.7 * x * x, gain: 0.15 * LV.ai, pont: 0.5, bright: 5 });
    for (let t = tK, q = 0; t < tZ - 0.02; q++) { const x = (t - tK) / dK; k.DRUM(t, 0.3 + 0.6 * x, { f: q % 2 ? 56 : 50, ring: 0.2, gain: 0.45, pan: q % 2 ? 0.2 : -0.2 }); t += 0.12 * Math.pow(0.35, x); }
    k.SWELL(tZ, Math.min(1.2, dK), 0.1, 0.9);
    gaps.push([tZ, C.pair - 0.002, -90, 0.002, 0.002, '5-04: digital silence (the master gates it to exact zero)']);
    // 5-05: the turn (a breath in) and the flash
    const tB = C.pair;
    k.SWELL(tF, tF - tB, 0.05, 1.0, { gain: 2.6 });
    k.SUB(tB, tF + 0.02, 26, (t) => Math.pow(clamp((t - tB) / (tF - tB)), 2), 0.5, (t) => 12 * clamp((t - tB) / (tF - tB)));
    k.CHOIR(tB, tF - tB, [57, 62], 0.8, { vowel: 'u', att: tF - tB, rel: 0.02, gain: 0.22, swell: (x) => x * x });
    const dC = C.king + 1.2 - tF;
    k.ORG(tF, dC, WANGZHA, (t) => 1 - 0.35 * smooth((t - tF) / dC), { reg: { sub: 0.7, p8: 1, p4: 0.75, p3: 0.4, p2: 0.45, mix: 0.35 }, att: 0.02, rel: 0.8, gain: 0.14, spread: 0.5 });
    k.BR('tuba', tF, 1.3, [26, 38], 1, { accent: 1, att: 0.006, rel: 0.6, swell: (x) => 1 - 0.6 * smooth(x), gain: 0.32 * LV.ai });
    k.BR('trombone', tF, 1.3, [45, 50, 57], 1, { n: 4, accent: 1, att: 0.006, rel: 0.6, swell: (x) => 1 - 0.6 * smooth(x), gain: 0.15 * LV.ai });
    k.BR('horn', tF, 1.4, [57, 62, 64, 69], 1, { accent: 1, att: 0.01, rel: 0.7, swell: (x) => 1 - 0.55 * smooth(x), gain: 0.12 * LV.ai });
    k.BR('trumpet', tF, 1.1, [69, 74], 0.95, { accent: 1, att: 0.006, rel: 0.6, swell: (x) => 1 - 0.6 * smooth(x), gain: 0.08 * LV.ai });
    k.CHOIR(tF, dC, [62, 69, 76], 1, { vowel: 'a', att: 0.04, rel: 0.8, gain: 0.16, swell: (x) => 1 - 0.3 * smooth(x), vib: 4 });
    k.CHOIR(tF, dC, [50, 57], 1, { vowel: 'o', att: 0.04, rel: 0.8, gain: 0.12, swell: (x) => 1 - 0.3 * smooth(x), vib: 3 });
    k.ST(tF, dC, [26, 38, 45, 50], 1, { n: 6, trem: 14, accent: 1, att: 0.01, rel: 0.8, gain: 0.15 * LV.ai, swell: (x) => 1 - 0.5 * smooth(x), pont: 0.2 });
    k.ST(tF, dC, [81, 88], 0.8, { n: 5, att: 0.3, rel: 0.8, gain: 0.04, bright: 5, maxCut: 10000, vib: 0, pont: 0.6, swell: (x) => 0.6 + 0.4 * x });
    k.DRUM(tF, 1, { f: 38, ring: 1.5, gain: 0.8 }); k.DRUM(tF + 0.012, 1, { f: 45, ring: 1.2, gain: 0.55, pan: 0.2 }); k.TIMP(tF, 38, 1, 1.5);
    k.CRASH(tF + 0.003, 1, 3.4, { gain: 0.9 }); k.CRASH(tF + 0.02, 0.9, 3, { gain: 0.7, pan: -0.3 });
    k.SUB(tF, tF + 3.5, 26, (t) => 0.4 + 0.6 * Math.exp(-(t - tF) / 1.0), 0.16);
    // 5-06: the long tone rises as the gold floods
    const fd = ev('flood', C.pair, C.king)[0], t6 = fd ? fd.t : C.flood, d6 = fd ? (fd.dur || C.king - t6) : C.king - t6, st = d6 / 4;
    [69, 74, 76, 81].forEach((m, j) => { const t = t6 + j * st, d = j < 3 ? st + 0.15 : C.king + 1.0 - t; k.CHOIR(t, d, [m, m + 12], 0.85 + 0.05 * j, { vowel: 'a', att: 0.25, rel: j < 3 ? 0.3 : 0.9, gain: 0.1, vib: 5 }); k.ST(t, d, m, 0.7 + 0.05 * j, { n: 6, att: 0.25, rel: j < 3 ? 0.3 : 0.9, gain: 0.07, bright: 4.5, maxCut: 9000, vib: 4 }); });
    cue(tC, "R5: the jokers' drones rise: CN on A, US on B-flat, a semitone apart (they beat, they fight)");
    cue(tK, 'R5: the charge: both drones glide up four semitones, a Shepard riser racing, strings climbing, a war-drum roll, a cymbal swell');
    cue(tZ, '5-04: cut into digital silence');
    cue(tB, '5-05: the jokers turn: a breath drawn in (a reverse swell, a sub rising, the choir on "u")');
    cue(tF, '5-05: 王炸: one enormous cold chord on the flash: D A E in open fifths, no third (organ, brass, choir, strings, drums, two crashes)');
    cue(t6, '5-06: the long tone rises as the gold floods: the choir and violins step up A D E A');
    return gaps;
  },

  // R6 0:42.9-0:56.7 — the card king. Only the organ now (the brass of the kings never returns): a pedal on D that
  // swells with its inhale and stays under the "噗" of the kings pressed flat; as they go faster an E-flat creeps in
  // above (dread), gone when the fan opens. 6-05: the paper people's music box, slowed, running down (later and
  // flatter every note), the organ almost nothing. 6-06: the fifth note comes, but the card king's organ plays it:
  // D, cold, the third gone. 6-07: it holds under the two 嗒; the master cuts everything dead into the black.
  R6(k, C, ROW, ev, cue) {
    const inh = ev('inhale', C.king - 0.2, C.press)[0], tI = inh ? inh.t : C.king + 0.1, dI = inh ? (inh.dur || 2) : 2, tIe = tI + dI;
    const tFan = C.fan, t5 = C.finger, t6 = C.us, tBk = C.black;
    const ped = (t) => smooth((t - C.king) / Math.max(0.5, tIe - C.king)) * (0.35 + 0.65 * smooth((t - tI) / dI)) * (1 - 0.6 * smooth((t - t5) / 0.6)) * (1 + 0.6 * smooth((t - t6) / 0.5)) * (1 + 0.2 * smooth((t - C.play) / 1.0));
    k.ORG(C.king, tBk - C.king + 0.02, [26, 38, 45, 50], ped, { reg: { sub: 0.6, p8: 1, p4: 0.8, p3: 0.45, p2: 0.45, mix: 0.25 }, att: 0.3, rel: 0.01, gain: 0.4, spread: 0.35, chiff: 0 });
    // the kings pressed flat, faster and faster: an E-flat creeps in above the pedal
    const fl = ev('flatten', C.press - 0.2, C.fan + 0.5), tE0 = fl.length > 2 ? fl[2].t - 0.4 : C.rows, tE1 = tFan + 0.3;
    k.ORG(tE0, tE1 - tE0, [51, 63], (t) => smooth((t - tE0) / (tE1 - tE0) * 1.4) * (1 - smooth((t - tE1 + 0.35) / 0.35)), { reg: { p8: 0.6, p4: 1, p2: 0.3 }, att: 0.2, rel: 0.2, gain: 0.13, spread: 0.4, chiff: 0.2 });
    // 6-05: the box runs down: later, flatter, softer every note
    const T5 = [0.05, 0.47, 0.95, 1.5].map((x) => t5 + x * (ROW['6-05'].t1 - ROW['6-05'].t0) / 1.8);
    PAPER.forEach((m, j) => k.MB(T5[j], m, [0.8, 0.7, 0.62, 0.52][j], { detune: [0, -7, -16, -28][j], ring: 0.9, pan: 0, send: 0.36 }));
    // 6-06: the fifth note, taken by the cold organ: D, no third
    k.ORG(t6, tBk - t6 + 0.02, [50, 57, 62, 74], (t) => 0.7 + 0.3 * smooth((t - C.play) / 0.8), { reg: { p8: 1, p4: 0.7, p3: 0.35, p2: 0.55, mix: 0.45 }, att: 0.12, rel: 0.01, gain: 0.16, spread: 0.5, chiff: 0.6 });
    cue(C.king, 'R6: only the organ now: a pedal on D swelling with the inhale (the kings\' brass never returns)');
    cue(tE0, 'R6: the kings pressed flat faster and faster: an E-flat creeps in above the pedal; gone when the fan opens');
    cue(T5[0], 'R6: 6-05: the music box runs down: later, flatter, softer every note');
    cue(t6, '6-06: the fifth note comes, but the card king\'s organ plays it: D, cold, the third gone; held under the two 嗒, cut dead into the black');
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
