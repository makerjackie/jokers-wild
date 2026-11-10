// Sound department — the score of 《喂》 FEED (v5), cues R1 .. R8 (docs/SOUND.md). TEMP score: measured, not listened to.
// SCORE[chunk] scores one chunk of the film (audio.js renders it chunk by chunk).
//
// ONE SMALL TUNE, and the machines play it. It is a nursery tune in D major (A1 A2 | B END, 8 notes each). Every "tak"
// of a machine is the tune's next note, sung by THAT machine in the voice its size gives it:
//   0.3 m   a music box (D6)                       the toy appears (2-05)
//   0.45 m  a toy piano (D5), a plucked bass        a bigger one (R3): light, pleased with itself
//   0.7 m   pizzicato strings                       the first chips
//   1 m     low strings, marcato; a bass drum
//   1.3 m   horns over them, tuba, timpani          the dead kings' crowns
//   2.2 m   trombones and tuba, war drums (D4, D3)  4-06: a wall
//   3.6 m   the whole orchestra                     their own crowns
//   30 m    the same tune four octaves under the music box, slow: organ and everything (5-01)
// So the music does what the machine does: it never changes what it plays, it only gets bigger and lower. A slow machine's
// card landing is its off-beat (the next note too). 4-07 (his hand on his own crown): nothing. 5-03 (from high above):
// the music box again, tiny, and it runs down with the black machine. R6: no music. R7 (title, credits): the music box
// alone, the whole tune, played through properly. R8: no music.
// Every time comes from the picture's events (the taks, the landings, the gulps, the burst) or from CUES / ROW.
import { SR, TAU, mtof, put, put2, clamp, smooth, drive, within } from './audio-dsp.js';
import { section, brass, bowed, snare, warDrum, timpani, crash, cymbalSwell, bassDrum } from './audio-inst.js';
import { musicBox, organNotes, pizzNote } from './audio-voices.js';
import { isUS } from './audio-kinds.js';
import { SHOTS, CUES, ROW } from './shots.js';

const CUE_NAME = { R1: '蚂蚁 the ant', R2: '要输了 losing', R3: '更大的 a bigger one', R4: '喂 feeding', R5: '山 mountains', R6: '没看见 it did not see', R7: '片名 title and credits', R8: '彩蛋 epilogue' };
export function cueTable() {
  const out = [];
  for (const s of SHOTS) { const l = out[out.length - 1]; if (l && l.id === s.cue) l.t1 = s.t1; else out.push({ id: s.cue, name: CUE_NAME[s.cue] ?? s.cue, t0: s.t0, t1: s.t1 }); }
  return out;
}

// THE TUNE: semitones from the tonic D. The machines loop A1 A2; the credits play all of it.
const A1 = [0, 4, 7, 4, 5, 2, 4, 0], A2 = [0, 4, 7, 4, 5, 2, 0, -5], B = [9, 7, 5, 4, 2, 5, 4, 2], END = [0, 4, 7, 12, 9, 7, 2, 0];
export const TUNE = { loop: [...A1, ...A2], full: [...A1, ...A2, ...B, ...END] };
// the bass under a note: D under D F# A, A under E C# (and the low A), G under G B
const bassOf = (d) => ([0, 4, 7, 12].includes(d) ? 0 : [5, 9].includes(d) ? -7 : -5);
// a machine's voice by its height (m): the tier, and the tune's tonic in that voice
const TIERS = [0.4, 0.65, 0.95, 1.2, 2, 3, 10], TON = [86, 74, 74, 62, 62, 50, 50, 38];
export const tierOf = (size) => { let t = 0; while (t < TIERS.length && size >= TIERS[t]) t++; return t; };
// the music's level per row (the planned loudness of shots.txt; tuned by measurement)
const DYN = { '2-05': 2.2, '2-06': 1.0, '3-01': 1.6, '3-02': 2.0, '3-03': 1.0, '3-04': 2.0, '4-01': 1.6, '4-02': 2.0, '4-03': 0.9, '4-04': 0.9, '4-05': 0.9, '4-06': 1.3, '4-08': 0.6, '4-09': 0.5, '5-01': 1.2, '5-02': 0.8 };
const rowAt = (t) => { for (const id in ROW) if (t >= ROW[id].t0 && t < ROW[id].t1) return id; return ''; };
const dynAt = (t) => DYN[rowAt(t)] ?? 1;

// a pure sub line (sine + a little 2nd harmonic) with a level curve lvl(t) in film seconds
function subTone(G, t0, t1, m, lvl, gain = 0.2) {
  const len = Math.ceil((t1 - t0) * SR), out = new Float32Array(len), f0 = mtof(m), fe = Math.round(0.02 * SR);
  let p = 0;
  for (let i = 0; i < len; i++) { p += f0 / SR; p -= Math.floor(p); out[i] = (Math.sin(TAU * p) + 0.15 * Math.sin(2 * TAU * p)) * lvl(t0 + i / SR) * Math.min(1, i / fe, (len - i) / fe); }
  put(G, t0, out, { gain, send: 0 });
}

// A kit of players writing into one chunk's (windowed) music group and its sections. DEFERRED: every call takes its
// seed at once and queues the work; scoreCueG plays the queue in order (one step each).
function makeKit(G, seedBase, Q) {
  let seed = seedBase; const S = () => ++seed;
  const mk = () => section(G.n, G.off), sec = { str: mk(), brs: mk(), org: mk(), pz: mk() };
  const L = (x) => [].concat(x), q = (f) => { Q.push(f); };
  return {
    G, sec, S,
    BR: (kind, t, d, ms, v, o = {}) => L(ms).forEach((m, i) => { const sd = S(); q(() => brass(sec.brs, kind, t + i * 0.004, d, m, v, { ...o, seed: sd })); }),
    ST: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => bowed(sec.str, t, d, m, v, { ...o, seed: sd })); }),
    PZ: (t, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => pizzNote(sec.pz, t, m, v, { ...o, seed: sd })); }),
    DRUM: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, warDrum(v, sd, o), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: o.send ?? 0.35 })); },
    BD: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, bassDrum(v, sd, o), { gain: o.gain ?? 0.8, pan: o.pan ?? 0, send: o.send ?? 0.2 })); },
    TIMP: (t, m, v, ring = 1, o = {}) => { const sd = S(); q(() => put(G, t, timpani(m, v, sd, ring), { gain: o.gain ?? 0.7, pan: o.pan ?? -0.1, send: 0.35 })); },
    CRASH: (t, v, ring = 2.4, o = {}) => { const sd = S(); q(() => put(G, t, crash(v, sd, ring), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.15, send: 0.4 })); },
    SWELL: (tPeak, rise, ring, v, o = {}) => { const sd = S(); q(() => put(G, tPeak - rise, cymbalSwell(rise, ring, v, sd), { gain: o.gain ?? 1, pan: o.pan ?? 0.1, send: 0.4 })); },
    SNARE: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, snare(v, sd), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.1, send: o.send ?? 0.2 })); },
    SUB: (t0, t1, m, lvl, gain) => q(() => subTone(G, t0, t1, m, lvl, gain)),
    MB: (t, m, v, o = {}) => { const sd = S(); q(() => put(G, t, musicBox(m, v, { seed: sd, ring: o.ring, detune: o.detune, bright: o.bright }), { gain: o.gain ?? 0.5, pan: o.pan ?? 0, send: o.send ?? 0.3 })); },
    ORG: (t, d, ms, lvl, o = {}) => { const sd = S(); q(() => organNotes(sec.org, t, d, ms, lvl, { ...o, seed: sd, gain: o.gain ?? 0.05 })); },
    flush() { put2(G, null, sec.str, { send: 0.36 }); put2(G, null, sec.brs, { send: 0.32 }); put2(G, null, sec.org, { send: 0.55 }); put2(G, null, sec.pz, { send: 0.3 }); },
  };
}

// ---- the beat: every tak (near-simultaneous ones merge); a slow machine's card landing is its off-beat
export function beatsOf(E, a, b) {
  const taks = E.filter((e) => e.kind === 'tak' && e.t >= a && e.t < b).sort((x, y) => x.t - y.t), slabs = E.filter((e) => e.kind === 'slabLand' && e.t >= a && e.t < b + 1), B = [], out = [];
  for (const e of taks) if (!B.length || e.t - B[B.length - 1].t >= 0.07) B.push({ t: e.t, who: e.who, size: e.size });
  B.forEach((x, i) => {
    out.push(x);
    const gap = (B[i + 1] ? B[i + 1].t : x.t + 0.9) - x.t;
    if (gap > 0.75) { const s = slabs.find((q) => q.t > x.t + 0.3 && q.t < x.t + Math.min(gap, 1.8) - 0.2 && q.t < b); if (s) out.push({ t: s.t, who: x.who, size: x.size, off: true }); }
  });
  return out;
}
// ---- one note of the tune in a machine's voice. b: { t, who, size }; i: the note's index; g: seconds to the next beat
function voice(k, b, i, g, deg, v, o = {}) {
  const tier = o.tier ?? tierOf(b.size), mel = TON[tier] + deg, bs = bassOf(deg), t = b.t, pan = (isUS(b.who) ? 0.3 : -0.3) * (tier >= 5 ? 0.4 : 1), first = i % 8 === 0, d = clamp(g, 0.12, 1.6);
  if (tier === 0) { k.MB(t, mel, v, { pan, gain: 0.5, detune: o.detune }); return; }
  if (tier === 1) {   // a toy piano: short, bright, a little clangy; a plucked bass on the bar
    k.MB(t, mel, v, { pan, gain: 0.8, ring: 0.35, bright: 2.2, detune: o.detune }); k.MB(t, mel + 12, v * 0.5, { pan, gain: 0.45, ring: 0.3, bright: 2.5 });
    if (i % 2 === 0) k.PZ(t, 50 + bs, 0.6 * v, { n: 2, gain: 0.25, dur: d * 0.8, pan: pan * 0.5 });
    return;
  }
  if (tier === 2) {
    k.PZ(t, [mel, mel - 12], v, { n: 4, gain: 0.32, dur: d * 0.9, pan }); k.MB(t, mel, v * 0.6, { pan, gain: 0.42, ring: 0.35, bright: 2.2 });
    k.PZ(t, 38 + bs + (bs < -6 ? 12 : 0), 0.8 * v, { n: 3, gain: 0.42, dur: d * 0.8 });
    if (i % 2) k.SNARE(t, 0.3 * v, { gain: 0.35 });
    return;
  }
  const bassM = 38 + bs + (bs < -6 ? 12 : 0);
  if (tier === 3 || tier === 4) {
    k.ST(t, d * 0.7, [mel, mel - 12], v, { n: 5, accent: 1, att: 0.006, rel: 0.08, gain: 0.1, bright: 4, vib: 0, pan });
    k.PZ(t, [bassM, bassM + 12], 0.9 * v, { n: 3, gain: 0.3, dur: d * 0.8 });
    k.BR('tuba', t, d * 0.5, bassM, 0.8 * v, { accent: 1, att: 0.006, rel: 0.06, gain: tier === 4 ? 0.26 : 0.16 });
    if (i % 2 === 0) k.BD(t, 0.8 * v, { f: 50, ring: 0.3, gain: 0.7 }); else k.SNARE(t, 0.45 * v, { gain: 0.45 });
    if (tier === 4) { k.BR('horn', t, d * 0.75, mel, v, { accent: 1, att: 0.01, rel: 0.08, gain: 0.11, pan }); if (first) k.TIMP(t, bassM, 0.9 * v, 0.8, { gain: 0.6 }); }
    return;
  }
  if (tier === 5 || tier === 6) {   // trombones and tuba; then everyone
    k.BR('trombone', t, d * 0.92, [mel, mel - 12], v, { n: 4, accent: 1, att: 0.008, rel: 0.12, gain: 0.13, pan });
    k.BR('horn', t, d * 0.9, mel + 12, v, { accent: 1, att: 0.012, rel: 0.12, gain: 0.12, pan: -pan });
    k.BR('tuba', t, d * 0.9, [bassM - 12, bassM], v, { accent: 1, att: 0.008, rel: 0.12, gain: 0.28 });
    k.ST(t, d, [bassM, bassM + 7, mel, mel + 12], v, { n: 5, trem: 15, accent: 0.8, att: 0.01, rel: 0.1, gain: 0.09, pont: 0.3, bright: 5 });
    k.TIMP(t, bassM, v, 1, { gain: 0.65 }); k.DRUM(t, v, { f: 44, ring: 0.7, gain: 0.7 });
    if (first || tier === 6 && i % 4 === 0) k.CRASH(t + 0.003, 0.9 * v, 1.8, { gain: 0.5, pan: first ? 0.3 : -0.3 });
    if (tier === 6) { k.BR('trumpet', t, d * 0.85, mel + 24, 0.95 * v, { accent: 1, rel: 0.1, gain: 0.075, tune: 4 }); k.SUB(t, t + d, bassM - 12, (x) => Math.exp(-(x - t) / 0.5), 0.1 * v); }
    return;
  }
  // tier 7: the mountain: organ and full weight
  const ped = bs === 0 ? 26 : 38 + bs;
  k.ORG(t, d * 0.97, [ped, ped + 12, mel, mel + 12, mel + 24], v, { reg: { sub: 0.8, p8: 1, p4: 0.8, p3: 0.4, p2: 0.5, mix: 0.4 }, att: 0.03, rel: 0.2, gain: 0.16, spread: 0.5, chiff: 0.4 });
  k.BR('trombone', t, d * 0.95, [mel, mel + 12], v, { n: 4, accent: 1, att: 0.01, rel: 0.2, gain: 0.14 });
  k.BR('horn', t, d * 0.95, [mel + 12, mel + 24], v, { accent: 1, att: 0.015, rel: 0.2, gain: 0.12 });
  k.BR('tuba', t, d * 0.95, [ped, ped + 12], v, { accent: 1, att: 0.01, rel: 0.2, gain: 0.3 });
  k.BR('trumpet', t, d * 0.9, mel + 36, 0.9 * v, { accent: 1, rel: 0.15, gain: 0.07, tune: 4 });
  k.ST(t, d, [ped + 12, mel, mel + 12, mel + 24, mel + 36], v, { n: 6, trem: 15, accent: 0.8, att: 0.01, rel: 0.15, gain: 0.1, pont: 0.3, bright: 5 });
  k.TIMP(t, ped + 12, v, 1.3, { gain: 0.7 }); k.DRUM(t, v, { f: 40, ring: 1.0, gain: 0.85 }); if (i % 2 === 0) k.DRUM(t + 0.012, v, { f: 47, ring: 0.9, gain: 0.5, pan: 0.2 });
  if (i % 4 === 0) k.CRASH(t + 0.003, v, 2.6, { gain: 0.7, pan: i % 8 ? -0.3 : 0.3 });
  k.SUB(t, t + d, ped, (x) => Math.exp(-(x - t) / 0.8), 0.14 * v);
}
// the tune on a list of beats, continuing from note X.note; returns the number of notes played
function play(k, B, X, tEnd, o = {}) {
  let i = X.note ?? 0;
  B.forEach((b, j) => { const g = (B[j + 1] ? B[j + 1].t : Math.min(tEnd, b.t + 0.9)) - b.t; voice(k, b, i, g, TUNE.loop[i % 16], (o.vel ?? 0.85) * dynAt(b.t), o.at ? o.at(b, i) : {}); i++; });
  X.note = i;
  return B.length;
}
// a heartbeat: two soft low knocks on D (~77 bpm): timpani and a plucked bass
function heartbeat(k, t0, t1) { for (let t = t0; t < t1 - 0.2; t += 0.78) { k.TIMP(t, 38, 0.6, 0.6, { gain: 0.6 }); k.TIMP(t + 0.24, 38, 0.4, 0.5, { gain: 0.45 }); k.PZ(t, 26, 0.6, { n: 2, gain: 0.3, dur: 0.3 }); } }

// every scorer: (kit, C, ROW, ev, cue, X) -> gaps [[t0, t1, db, rampIn, rampOut, label]] carved after the room
export const SCORE = {
  // R1 蚂蚁 — no music.
  R1(k, C, ROW, ev, cue) { cue(0, 'R1: no music (the steps, the slap, the room)'); return []; },

  // R2 要输了 — 2-01: the black king's K: two plucked low notes after the slap (a swagger). 2-02: a heartbeat. 2-03:
  // nothing. 2-05: the toy: the music box, one note on each tak and one on each card's landing. 2-06: the box goes on;
  // a low note slides in under the black king (B-flat sliding down to A: foreign to the tune).
  R2(k, C, ROW, ev, cue, X) {
    const E = X.events, sl = ev('cardSlap', C['2-01'], C['2-02'])[0];
    if (sl) { k.PZ(sl.t + 0.004, [26, 38], 0.9, { n: 3, gain: 0.5, dur: 0.5, pan: 0.2 }); k.TIMP(sl.t + 0.004, 38, 0.8, 1.2, { gain: 0.8, pan: 0.2 }); k.PZ(sl.t + 0.42, [33, 45], 0.7, { n: 3, gain: 0.4, dur: 0.6, pan: 0.2 }); }
    heartbeat(k, C['2-02'] + 0.15, C['2-03'] + 0.1);
    X.note = 0;
    const B = beatsOf(E, C['2-04'], C['3-01']), n = play(k, B, X, C['3-01']);
    const tB = C['2-06'] + 0.2, tE = C['3-01'] + 1.2;
    k.ST(tB, tE - tB, [34, 46], 0.7, { n: 6, att: 0.5, rel: 0.3, pm: (tt) => -smooth((tt - 0.3) / 1.2), swell: (u) => Math.min(1, u * 2.5), gain: 0.06, bright: 3, maxCut: 1400 });
    cue(B[0]?.t ?? C['2-05'], `R2: the music box when the toy starts: ${n} notes on the taks and the landings; 2-06 a low B-flat slides down to A`);
    return [];
  },

  // R3 更大的 — 3-01: the black king's machine comes down: a low thump of the orchestra with it; then two machines
  // answer each other: the music box (red) and a toy piano an octave lower (black), a plucked bass: light, pleased
  // with itself. 3-03: the red one runs down: its notes sag and stop; the black one plays on alone. 3-04: a chip, a
  // gulp: red comes back as a toy piano too.
  R3(k, C, ROW, ev, cue, X) {
    const E = X.events, th = ev('thud', C['3-01'], C['3-02']).find((e) => (e.hard ?? 0) > 0.6);
    if (th) { k.TIMP(th.t, 26 + 12, 1, 1.4, { gain: 0.9, pan: 0.2 }); k.PZ(th.t, [26, 38], 1, { n: 4, gain: 0.6, dur: 0.6, pan: 0.2 }); k.BR('tuba', th.t, 0.35, 26, 0.9, { accent: 1, att: 0.006, rel: 0.2, gain: 0.3 }); k.BD(th.t, 1, { f: 46, ring: 0.4, gain: 0.9 }); }
    const rd = ev('rundown', C['3-01'], C['4-01'])[0], B = beatsOf(E, C['3-01'], C['4-01']);
    const sag = (b) => (rd && !isUS(b.who) && b.t >= rd.t && b.t < rd.t + rd.dur + 1 ? { detune: -90 * clamp((b.t - rd.t) / rd.dur) } : {});
    const n = play(k, B, X, C['4-01'], { at: sag });
    for (const g of ev('gulp', C['3-01'], C['4-01'])) k.TIMP(g.t, 38, 0.6, 0.7, { gain: 0.5 });
    cue(B[0]?.t ?? C['3-01'], `R3: two machines, two voices (music box, toy piano an octave lower): ${n} notes; the red one's notes sag and stop as it runs down`);
    return [];
  },

  // R4a 喂 (4-01 .. 4-06) — the same tune, each tak in the voice of its machine's size: every gulp makes it lower and
  // heavier (pizzicato, low strings, horns, trombones); a timpani stroke and a small cymbal on each gulp. 4-06: the
  // machines on the floor, the tune slow and enormous in trombones and tuba: a wall. Cut at 4-07 (audio.js).
  R4a(k, C, ROW, ev, cue, X) {
    const E = X.events, B = beatsOf(E, C['4-01'], C['4-07']), n = play(k, B, X, C['4-07']);
    for (const g of ev('gulp', C['4-01'], C['4-07'])) { const tr = tierOf(g.size); k.TIMP(g.t, 38, 0.8, 0.8, { gain: 0.5 + 0.06 * tr }); if (tr >= 2) k.CRASH(g.t + 0.05, 0.5 + 0.08 * tr, 1.0, { gain: 0.3 }); }
    // 4-03: the table groans: a low held D under it
    k.ST(C['4-03'], C['4-06'] - C['4-03'], [26, 38], 0.6, { n: 5, trem: 12, att: 0.5, rel: 0.2, gain: 0.05, bright: 3, maxCut: 900, swell: (u) => 0.4 + 0.6 * u });
    k.SWELL(C['4-06'] + 0.4, 1.2, 0.3, 0.8, { gain: 1 });
    cue(B[0]?.t ?? C['4-01'], `R4: the tune fed: ${n} notes, the voices sinking tier by tier (to trombones and tuba, D4/D3, at 4-06)`);
    return [];
  },
  // R4c (4-08, 4-09) — after the silence the tune comes back held down (their own crowns go in): the same heavy
  // voices, quieter, a roll growing into 5-01.
  R4c(k, C, ROW, ev, cue, X) {
    const E = X.events, B = beatsOf(E, C['4-08'], C['5-01']), n = play(k, B, X, C['5-01']);
    for (const g of ev('gulp', C['4-08'], C['5-01'])) { k.TIMP(g.t, 26 + 12, 0.9, 1, { gain: 0.6 }); k.CRASH(g.t + 0.05, 0.7, 1.2, { gain: 0.3 }); }
    for (let t = C['4-09'] + 1.2; t < C['5-01'] - 0.02; t += 0.06) k.TIMP(t, 38, 0.2 + 0.5 * (t - C['4-09'] - 1.2) / 1.4, 0.4, { gain: 0.3 });
    cue(B[0]?.t ?? C['4-08'], `R4: 4-08 / 4-09: the tune back, held down: ${n} notes; a timpani roll into 5-01`);
    return [];
  },

  // R5 山 — 5-01: the organ from its lowest note; when the hall breaks (the burst) THE TUNE, four octaves under the
  // music box, slow: organ, brass, strings, drums: the biggest music of the film. Its beat is the mountains' own: the
  // taks fall on every other note. 5-02: on, a little under the far booms. 5-03 (from high above): the music box
  // again, tiny, the same notes on the same beat; 5-04: it runs down with the black machine (later, flatter) and stops.
  // 5-05: nothing (he cheers).
  R5a(k, C, ROW, ev, cue, X) {
    const E = X.events, t0 = C['5-01'], bu = ev('burst', t0, C['5-02'])[0], tB = bu ? bu.t : t0 + 1.1;
    const taks = ev('tak', t0, C['6-01']).map((e) => e.t), gaps = taks.slice(1).map((t, i) => t - taks[i]).sort((a, b) => a - b), per = clamp((gaps[0] ?? 1.35) / 2, 0.45, 0.9), anchor = taks[0] ?? tB;
    // the organ from its lowest note
    const up = (t) => smooth((t - t0) / (tB - t0));
    k.ORG(t0 + 0.05, tB - t0, [26], up, { reg: { sub: 1, p8: 1, p4: 0.5 }, att: 0.3, rel: 0.3, gain: 0.2, chiff: 0 });
    k.ORG(t0 + 0.4, tB - t0 - 0.35, [33, 38], up, { reg: { sub: 0.6, p8: 1, p4: 0.6, p2: 0.3 }, att: 0.3, rel: 0.3, gain: 0.14, chiff: 0 });
    for (let t = t0 + 0.2; t < tB - 0.02; t += 0.055) k.TIMP(t, 38, 0.25 + 0.6 * up(t), 0.4, { gain: 0.35 });
    k.SWELL(tB, Math.min(1, tB - t0), 0.05, 1, { gain: 1.5 }); k.SUB(t0, tB, 26, up, 0.25);
    // the grid: the first tak is on it
    const G = []; for (let t = anchor - per * Math.floor((anchor - tB + 0.05) / per); t < C['5-03'] - 0.05; t += per) G.push({ t, who: G.length % 2 ? 'heart' : 'spade', size: 30 });
    X.note = 0;
    const n = play(k, G, X, C['5-03']);
    X.r5 = { per, next: (G[G.length - 1]?.t ?? C['5-03'] - per) + per };
    cue(t0, `R5: the organ from its lowest note; at the burst (${tB.toFixed(2)}) the tune four octaves down, a note every ${per.toFixed(3)} s (${n} notes; the taks fall on every other one)`);
    return [];
  },
  // R5b (5-03 ..) — from high above: the music box again, tiny, the same tune on the same beat; in 5-04 it runs down
  // with the black machine (later, flatter) and stops. 5-05: nothing (he cheers).
  R5b(k, C, ROW, ev, cue, X) {
    const rd = ev('rundown', C['5-01'], C['6-01'])[0], tStop = rd ? rd.t + rd.dur : C['5-05'] - 1.3, per = X.r5?.per ?? 0.675;
    let t = X.r5?.next ?? C['5-03'], p = per, i = X.note ?? 0, m = 0;
    for (; t < tStop - 0.05 && m < 24; m++, i++) {
      const u = clamp((t - C['5-04']) / Math.max(0.5, tStop - C['5-04']));
      k.MB(t, 86 + TUNE.loop[i % 16], 0.7 * (1 - 0.6 * u), { gain: 0.3, send: 0.6, detune: -60 * u * u });
      if (t >= C['5-04']) p *= 1.22; t += p;
    }
    cue(C['5-03'], `R5: 5-03 the music box, tiny (${m} notes), running down with the black machine by ${tStop.toFixed(2)}; 5-05 no music`);
    return [];
  },

  // R7 片名 — the title and the credits: the music box alone, the whole tune (A A' B and its ending), its own bass
  // tines under it, slowing into the last note; over before 8-01.
  R7(k, C, ROW, ev, cue) {
    const t0 = C.title + 0.6, N = TUNE.full.length, p = (C.egg - 1.9 - t0) / (N + 2.2);
    let t = t0;
    TUNE.full.forEach((deg, i) => {
      const last4 = i >= N - 4, v = 0.8 + 0.1 * (i % 8 === 0);
      k.MB(t, 86 + deg, v, { gain: 0.5, send: 0.35 });
      if (i % 4 === 0) k.MB(t, 62 + bassOf(deg) + (bassOf(deg) < -6 ? 12 : 0), 0.6, { gain: 0.4, send: 0.35, pan: -0.15 });
      if (i % 4 === 2) k.MB(t, 74 + bassOf(deg) + 4 + (bassOf(deg) < -6 ? 12 : 0), 0.45, { gain: 0.32, send: 0.35, pan: 0.15 });
      t += p * (last4 ? 1 + 0.18 * (i - (N - 5)) : 1);
    });
    k.MB(t, 86, 0.7, { gain: 0.45, send: 0.4 }); k.MB(t + 0.06, 78, 0.6, { gain: 0.4, send: 0.4 }); k.MB(t + 0.12, 74, 0.6, { gain: 0.4, send: 0.4 }); k.MB(t + 0.18, 62, 0.6, { gain: 0.4, send: 0.4 });
    cue(t0, `R7: the music box alone: the whole tune (${N} notes, one every ${p.toFixed(3)} s), slowing; the last chord at ${t.toFixed(2)}`);
    return [];
  },
};

// score one chunk into its music group: returns { report, gaps }
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
