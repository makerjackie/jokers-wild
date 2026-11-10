// Sound department — the score of 《喂》 FEED (v6), cues R1 .. R10 (docs/SOUND.md). Measured, not listened to.
// SCORE[chunk] scores one chunk of the film (audio.js renders it chunk by chunk).
//
// ONE SMALL TUNE, and the machines play it. A nursery tune in D major (A1 A2 | B END, eight notes each). Every "tak" of
// a machine is the tune's next note, sung by THAT machine in the voice its size gives it:
//   0.3 m   a music box (D6)                          the toy's first tak (3-06)
//   0.45 m  a toy piano (D5), a plucked bass           the black king's bigger one (4-02)
//   0.7 m   pizzicato strings                          the first chips
//   1 m     low strings, marcato; a bass drum
//   1.2 m   (the plugs have bitten the lamp: the hall is dark) cellos, basses, soft trombones, tuba: no top at all
//   3 m     trombones, tuba, war drums                 6-08: a wall
//   30 m    the same tune four octaves under the music box, slow: organ and everything (7-01)
// So the music does what the machine does: it never changes what it plays, it only gets bigger and lower. And it goes
// WRONG as the kings lose it: right harmony until the dead kings' crowns are fed (5-09: B-flat under the tonic's notes,
// the first wrong harmony); the tune itself turns minor when the machine first takes for itself (6-02); the mountain
// plays it in minor over a Neapolitan bass. The credits give it back whole, in major, on the music box alone.
// Before the tune there is none: R1 no music; R2 (the rule) a heartbeat and, only once the crown has stopped spinning,
// one low held note. Nothing here is a human voice either: the kings' laughs and shouts are their horns (audio-kinds).
// Every time comes from the picture's events or from CUES / ROW.
import { SR, TAU, mtof, put, put2, clamp, smooth, drive, within } from './audio-dsp.js';
import { section, brass, bowed, snare, warDrum, timpani, crash, cymbalSwell, bassDrum, heart } from './audio-inst.js';
import { musicBox, organNotes, pizzNote } from './audio-voices.js';
import { isUS } from './audio-kinds.js';
import { SHOTS, CUES, ROW } from './shots.js';

const CUE_NAME = { R1: '蚂蚁 the ant', R2: '规矩 the rule', R3: '托管 auto', R4: '不用机器的人 the one without a machine', R5: '喂 feeding', R6: '夺不回来 no taking it back', R7: '山 mountains', R8: '没看见 it did not see', R9: '片名 title and credits', R10: '彩蛋 epilogue' };
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
// how wrong it has gone. 0: right. 1: B-flat under the tonic's notes. 2: the tune in minor (F, B-flat), B-flat for G in
// the bass. 3 (the mountain): minor, E-flat (the Neapolitan) under the subdominant's notes.
const minorOf = (d) => (d === 4 ? 3 : d === 9 ? 8 : d);
const bassFor = (d, mode) => { const b = bassOf(d); return mode === 1 ? (b === 0 ? -4 : b) : mode === 2 ? (b === -7 ? -4 : b) : mode === 3 ? (b === -7 ? 1 : b) : b; };
// a machine's voice by its height (m): the tier, and the tune's tonic in that voice
const TIERS = [0.4, 0.65, 0.95, 1.2, 2, 3, 10], TON = [86, 74, 74, 62, 62, 50, 50, 38];
export const tierOf = (size) => { let t = 0; while (t < TIERS.length && size >= TIERS[t]) t++; return t; };
// the music's level per row (shots.txt's planned loudness; tuned by measurement)
const DYN = { '3-06': 2.2, '3-07': 1.0, '4-01': 1.6, '4-02': 2.0, '4-03': 1.8, '4-04': 2.0, '4-05': 2.0, '5-01': 1.2, '5-02': 2.0, '5-03': 2.0, '5-04': 2.5, '5-06': 0.9, '5-07': 1.1,
  '5-08': 0.8, '5-09': 0.8, '5-10': 0.8, '6-01': 0.35, '6-02': 0.35, '6-04': 0.6, '6-05': 0.9, '6-06': 0.9, '6-08': 1.1, '7-01': 1.2, '7-02': 0.8 };
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
    HEART: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, heart(o.f ?? 52, v, sd), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: 0.08 })); },
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
// ---- one note of the tune in a machine's voice. b: { t, who, size }; i: the note's index; g: seconds to the next
// beat; d0: the note (major degrees); o.mode: how wrong the harmony has gone
function voice(k, b, i, g, d0, v, o = {}) {
  const tier = o.tier ?? tierOf(b.size), mode = o.mode ?? 0, deg = mode >= 2 ? minorOf(d0) : d0, mel = TON[tier] + deg, bs = bassFor(d0, mode), t = b.t;
  const pan = (isUS(b.who) ? 0.3 : -0.3) * (tier >= 5 ? 0.4 : 1), first = i % 8 === 0, d = clamp(g, 0.12, 1.6);
  if (tier === 0) { k.MB(t, mel, v, { pan, gain: 0.5, detune: o.detune }); return; }
  if (tier === 1) {   // a toy piano: short, bright, a little clangy; a plucked bass on the bar
    k.MB(t, mel, v, { pan, gain: 0.8, ring: 0.35, bright: 2.2, detune: o.detune }); k.MB(t, mel + 12, v * 0.5, { pan, gain: 0.45, ring: 0.3, bright: 2.5 });
    if (i % 2 === 0) k.PZ(t, 50 + bs, 0.6 * v, { n: 2, gain: 0.25, dur: d * 0.8, pan: pan * 0.5 });
    return;
  }
  const bassM = 38 + bs + (bs < -6 ? 12 : 0);
  if (tier === 2) {
    k.PZ(t, [mel, mel - 12], v, { n: 4, gain: 0.32, dur: d * 0.9, pan }); k.MB(t, mel, v * 0.6, { pan, gain: 0.42, ring: 0.35, bright: 2.2 });
    k.PZ(t, bassM, 0.8 * v, { n: 3, gain: 0.42, dur: d * 0.8 });
    if (i % 2) k.SNARE(t, 0.3 * v, { gain: 0.35 });
    return;
  }
  if (tier === 3) {
    k.ST(t, d * 0.7, [mel, mel - 12], v, { n: 5, accent: 1, att: 0.006, rel: 0.08, gain: 0.1, bright: 4, vib: 0, pan });
    k.PZ(t, [bassM, bassM + 12], 0.9 * v, { n: 3, gain: 0.3, dur: d * 0.8 });
    k.BR('tuba', t, d * 0.5, bassM, 0.8 * v, { accent: 1, att: 0.006, rel: 0.06, gain: 0.16 });
    if (i % 2 === 0) k.BD(t, 0.8 * v, { f: 50, ring: 0.3, gain: 0.7 }); else k.SNARE(t, 0.45 * v, { gain: 0.45 });
    return;
  }
  if (tier === 4 || tier === 5) {   // the hall is dark: no top at all
    k.ST(t, d * 0.8, [mel - 12, mel - 24], v, { n: 6, accent: 1, att: 0.008, rel: 0.1, gain: 0.14, bright: 3, maxCut: 1700, vib: 0, pan });
    k.BR('trombone', t, d * 0.7, mel - 12, 0.8 * v, { n: 3, accent: 0.8, att: 0.012, rel: 0.1, gain: 0.1, maxCut: 1400, pan });
    k.BR('tuba', t, d * 0.7, [bassM - 12, bassM], 0.85 * v, { accent: 1, att: 0.008, rel: 0.1, gain: 0.24 });
    k.BD(t, 0.8 * v, { f: 46, ring: 0.36, gain: 0.7 });
    if (first) k.TIMP(t, bassM, 0.9 * v, 0.9, { gain: 0.6 });
    return;
  }
  if (tier === 6) {   // trombones and tuba, war drums
    k.BR('trombone', t, d * 0.92, [mel, mel - 12], v, { n: 4, accent: 1, att: 0.008, rel: 0.12, gain: 0.13, pan });
    k.BR('horn', t, d * 0.9, mel + 12, v, { accent: 1, att: 0.012, rel: 0.12, gain: 0.12, pan: -pan });
    k.BR('tuba', t, d * 0.9, [bassM - 12, bassM], v, { accent: 1, att: 0.008, rel: 0.12, gain: 0.28 });
    k.ST(t, d, [bassM, bassM + 7, mel, mel + 12], v, { n: 5, trem: 15, accent: 0.8, att: 0.01, rel: 0.1, gain: 0.09, pont: 0.3, bright: 5 });
    k.TIMP(t, bassM, v, 1, { gain: 0.65 }); k.DRUM(t, v, { f: 44, ring: 0.7, gain: 0.7 });
    if (i % 2 === 0) k.CRASH(t + 0.003, 0.9 * v, 1.8, { gain: 0.5, pan: first ? 0.3 : -0.3 });
    k.SUB(t, t + d, bassM - 12, (x) => Math.exp(-(x - t) / 0.5), 0.1 * v);
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
// the tune on a list of beats, continuing from note X.note. o.at(b, i) -> voice options; o.mute(t): the machine plays
// on but the music is not heard (the note still counts)
function play(k, B, X, tEnd, o = {}) {
  let i = X.note ?? 0, n = 0;
  B.forEach((b, j) => {
    const g = (B[j + 1] ? B[j + 1].t : Math.min(tEnd, b.t + 0.9)) - b.t;
    if (!(o.mute && o.mute(b.t))) { voice(k, b, i, g, TUNE.loop[i % 16], (o.vel ?? 0.85) * dynAt(b.t), o.at ? o.at(b, i) : {}); n++; }
    i++;
  });
  X.note = i;
  return n;
}
// a heartbeat (lub, dub), its period going from p0 to p1 seconds
function heartbeat(k, t0, t1, p0 = 0.86, p1 = 0.72, v = 0.9) { for (let t = t0; t < t1 - 0.25;) { const u = (t - t0) / Math.max(0.1, t1 - t0); k.HEART(t, v * (0.8 + 0.2 * u), { f: 54 }); k.HEART(t + 0.26, 0.65 * v * (0.8 + 0.2 * u), { f: 47 }); t += p0 + (p1 - p0) * u; } }
// one low held note: basses and cellos on D, no vibrato, at the edge of hearing (the dread)
function pedal(k, t0, t1, lvl = 1, o = {}) {
  if (t1 - t0 < 0.4) return;
  k.ST(t0, t1 - t0, [26, 38], 0.5, { n: 5, att: o.att ?? 1.2, rel: o.rel ?? 0.8, vib: 0, gain: 0.045 * lvl, bright: 2.4, maxCut: 520, swell: o.swell });
  k.SUB(t0, t1 + 0.3, 26, (t) => smooth((t - t0) / 1.2) * (1 - smooth((t - t1) / 0.3)), 0.05 * lvl);
}
// a hit of the dark orchestra on a chord (no trumpets)
function hit(k, t, chord, v, o = {}) {
  const d = o.dur ?? 1, sw = o.swell ?? ((u) => 1 - 0.7 * smooth(u)), rel = o.rel ?? 0.35, g = o.gain ?? 1, root = chord[0];
  k.BR('tuba', t, d, [root - 24, root - 12], v, { accent: 1, att: 0.006, rel, swell: sw, gain: 0.28 * g });
  k.BR('trombone', t, d, chord.map((x) => x - 12), v, { n: 4, accent: 1, att: 0.006, rel, swell: sw, gain: 0.12 * g });
  k.BR('horn', t, d, chord, v, { accent: 1, att: 0.01, rel, swell: sw, gain: 0.12 * g });
  k.ST(t, d, [root - 24, root - 12, ...chord], v, { n: 5, trem: 15, accent: 1, att: 0.01, rel, gain: 0.14 * g, swell: sw, pont: 0.3 });
  k.DRUM(t, 1, { f: 40, ring: 1.0, gain: 0.85 * g }); k.TIMP(t, root - 12, 1, 1.2, { gain: 0.7 * g });
  if (o.crash) k.CRASH(t + 0.003, 1, 2.4, { gain: 0.7 * o.crash });
  if (o.sub) k.SUB(t, t + 2.2, root - 24, (x) => Math.exp(-(x - t) / 0.7), 0.16 * o.sub);
}

// every scorer: (kit, C, ROW, ev, cue, X) -> gaps [[t0, t1, db, rampIn, rampOut, label, 'all'?]] carved after the room
// (music only; with 'all' the chunk's effects too)
export const SCORE = {
  // R2 规矩 — no music. 2-03: a heartbeat as the light leaves the club king, quickening until the chair goes. Only
  // when the crown has stopped spinning: one low held note, at the edge of hearing (the dread; it stays into R3).
  R2(k, C, ROW, ev, cue) {
    const ll = ev('lightLeaves', C['2-03'], C['2-04'])[0], dg = ev('dragOut', C['2-03'], C['3-01'])[0], cs = ev('crownSpin', C['2-04'], C['3-01'])[0];
    const t0 = (ll ? ll.t : C['2-03']) + 0.5, t1 = dg ? dg.t - 0.1 : C['2-04'] + 0.6, tN = cs ? cs.t + (cs.dur || 1.45) + 0.45 : C['2-05'];
    heartbeat(k, t0, t1, 0.86, 0.66);
    pedal(k, tN, C['3-01'] + 0.9, 1, { rel: 1.0 });
    cue(t0, `R2: no music: a heartbeat ${t0.toFixed(2)}..${t1.toFixed(2)} (the light has left him); the crown stops, then one low held D from ${tN.toFixed(2)}`);
    return [];
  },

  // R3 托管 — the low note holds; 3-02 the heartbeat again (the dark is on the red king now); 3-03 only the note. 3-04
  // the note lets go as he brings out the toy. 3-06: the first tak: THE TUNE, on a music box, a note on each tak and
  // on each card's landing. 3-07: it goes on; a low B-flat slides down to A under the black king.
  R3(k, C, ROW, ev, cue, X) {
    const E = X.events, th = ev('thud', C['3-04'], C['3-06'])[0], tT = th ? th.t : C['3-04'] + 1.9, ll = ev('lightLeaves', C['3-01'], C['3-04'])[0];
    pedal(k, C['3-01'], tT - 0.4, 0.7, { att: 1.0, rel: 0.8 });
    heartbeat(k, (ll ? ll.t : C['3-02']) + 0.4, C['3-03'] - 0.45, 0.84, 0.7);
    X.note = 0;
    const B = beatsOf(E, C['3-04'], C['4-01']), n = play(k, B, X, C['4-01']);
    const tB = C['3-07'] + 0.2, th2 = ev('thud', C['4-01'], C['4-02']).find((e) => (e.hard ?? 0) > 0.6), tE = th2 ? th2.t : C['4-01'] + 1.1;
    k.ST(tB, tE - tB, [34, 46], 0.7, { n: 6, att: 0.5, rel: 0.05, pm: (tt) => -smooth((tt - 0.3) / 1.2), swell: (u) => Math.min(1, u * 2.5), gain: 0.06, bright: 3, maxCut: 1400 });
    cue(B[0]?.t ?? C['3-06'], `R3: the tune begins on the first tak: a music box, ${n} notes; 3-07 a low B-flat slides down to A`);
    return [];
  },

  // R4 不用机器的人 — the black king's machine comes down with a low thump of the orchestra; from its first tak two
  // voices answer each other (music box left, toy piano an octave lower right). The diamond king plays by hand: the
  // music ducks after his slap (the lean that does not come). He is dragged out and THE TUNE DOES NOT NOTICE. 4-05 the
  // duel; the red one's notes sag as its spring runs down.
  R4(k, C, ROW, ev, cue, X) {
    const E = X.events, gaps = [], th = ev('thud', C['4-01'], C['4-02']).find((e) => (e.hard ?? 0) > 0.6);
    if (th) { k.TIMP(th.t, 38, 1, 1.4, { gain: 0.9, pan: 0.2 }); k.PZ(th.t, [26, 38], 1, { n: 4, gain: 0.6, dur: 0.6, pan: 0.2 }); k.BR('tuba', th.t, 0.35, 26, 0.9, { accent: 1, att: 0.006, rel: 0.2, gain: 0.3 }); k.BD(th.t, 1, { f: 46, ring: 0.4, gain: 0.9 }); }
    const rd = ev('rundown', C['4-01'], C['5-02'])[0]; X.rd = rd;
    const sag = (b) => (rd && !isUS(b.who) && b.t >= rd.t && b.t < rd.t + rd.dur + 1 ? { detune: -90 * clamp((b.t - rd.t) / rd.dur) } : {});
    const B = beatsOf(E, C['4-01'], C['5-01']), n = play(k, B, X, C['5-01'], { at: sag });
    const hs = E.find((e) => e.kind === 'cardSlap' && e.who === 'diamond' && e.t >= C['4-03'] && e.t < C['4-04']);
    if (hs) gaps.push([hs.t + 0.04, hs.t + 0.8, -12, 0.03, 0.25, '4-03: the music ducks after the diamond king\'s slap (the lamp does not move)']);
    cue(B[0]?.t ?? C['4-01'], `R4: ${n} notes; two machines, two voices from the black one's first tak; the tune goes on through the second dragging-out`);
    return gaps;
  },

  // R5a 喂 (5-01 .. 5-04) — the red machine stops (its last notes flat): the low note and the heartbeat are back on him
  // until his first chip. Then the tune fed: each tak in its machine's voice, lower and heavier at every gulp (a
  // timpani stroke and a small cymbal on each). Faded out at 5-05 (audio.js).
  R5a(k, C, ROW, ev, cue, X) {
    const E = X.events, rd = X.rd, sag = (b) => (rd && !isUS(b.who) && b.t >= rd.t && b.t < rd.t + rd.dur + 1 ? { detune: -90 * clamp((b.t - rd.t) / rd.dur) } : {});
    const B = beatsOf(E, C['5-01'], C['5-05']), n = play(k, B, X, C['5-05'], { at: sag });
    const ll = ev('lightLeaves', C['5-01'], C['5-02'])[0], g1 = ev('gulp', C['5-01'], C['5-03'])[0];
    if (ll && g1) { pedal(k, ll.t + 0.1, g1.t, 1.2, { att: 0.6, rel: 0.2 }); heartbeat(k, ll.t + 0.4, g1.t - 0.5, 0.8, 0.66, 0.8); }
    for (const g of ev('gulp', C['5-01'], C['5-05'])) { const tr = tierOf(g.size); k.TIMP(g.t, 38, 0.8, 0.8, { gain: 0.5 + 0.06 * tr }); if (tr >= 2) k.CRASH(g.t + 0.05, 0.5 + 0.08 * tr, 1.0, { gain: 0.3 }); }
    cue(B[0]?.t ?? C['5-01'], `R5: the tune fed: ${n} notes, the voices sinking with every gulp`);
    return [];
  },
  // R5c (5-06 .. 5-10) — low strings; the table groans (a low held D). The plugs bite the lamp: a low sforzando each
  // time, and from then on the hall is dark and so is the tune: cellos, basses, soft trombones, tuba, no top. The dead
  // kings' crowns go in (5-09): from that gulp B-flat is under the tonic's notes: the first wrong harmony.
  R5c(k, C, ROW, ev, cue, X) {
    const E = X.events, cd = ev('crownDrop', C['5-06'], C['6-01'])[0], tW = cd ? cd.t : C['5-09'] + 1.6; X.tWrong = tW;
    const B = beatsOf(E, C['5-06'], C['6-01']), n = play(k, B, X, C['6-01'], { at: (b) => ({ mode: b.t >= tW ? 1 : 0 }) });
    k.ST(C['5-06'], C['5-07'] - C['5-06'] + 1, [26, 38], 0.6, { n: 5, trem: 12, att: 0.5, rel: 0.3, gain: 0.05, bright: 3, maxCut: 900, swell: (u) => 0.4 + 0.6 * u });
    for (const p of ev('plugBite', C['5-06'], C['6-01'])) {
      k.BR('tuba', p.t, 0.9, [26, 38], 1, { accent: 1, att: 0.008, rel: 0.4, swell: (u) => 1 - 0.7 * u, gain: 0.3 }); k.BR('trombone', p.t, 0.9, [38, 45], 0.95, { n: 3, accent: 1, att: 0.008, rel: 0.4, swell: (u) => 1 - 0.7 * u, gain: 0.11, maxCut: 1600 });
      k.TIMP(p.t, 38, 1, 1.4, { gain: 0.8 }); k.BD(p.t, 1, { f: 44, ring: 0.5, gain: 0.9 });
      k.ST(p.t, 1.4, [86, 93], 0.6, { n: 3, att: 0.01, rel: 0.2, vib: 0, pont: 0.6, pm: (tt) => -3 * smooth(tt / 1.4), swell: (u) => 1 - u, gain: 0.03, bright: 2, maxCut: 8000 });   // the light going
    }
    for (const g of ev('gulp', C['5-06'], C['6-01'])) { k.TIMP(g.t, g.t >= tW ? 34 : 38, 0.9, 1, { gain: 0.6 }); }
    cue(B[0]?.t ?? C['5-06'], `R5: 5-06 on: ${n} notes; the plugs bite (a low sforzando each); dark voices; from ${tW.toFixed(2)} (the first dead king's crown) B-flat under the tonic: the first wrong harmony`);
    return [];
  },

  // R6 夺不回来 — 6-01 the tune is still there but far down (plucked basses, a breath of low strings), wrong bass. 6-02:
  // the machine takes his hidden chip by itself: from that swallow the tune is in MINOR. 6-03: he presses 取消: the
  // music is taken away so the dead clicks are heard (the taks go on in tempo; the tune counts on, unheard). 6-04 it
  // comes back under him as he fights the key. 6-05 / 6-06: each crown torn off: a tremolo cluster swelling with the
  // funnel's breath, a hit of the dark orchestra on the swallow. 6-07: a roll and a swell into the two machines landing
  // on the floor: D minor with its E-flat, held: a wall. 6-08: the tune in trombones, tuba, war drums, slow: a wall.
  R6(k, C, ROW, ev, cue, X) {
    const E = X.events, gaps = [], sk = ev('suck', C['6-01'], C['6-04'])[0], gm = sk ? ev('gulp', sk.t, C['6-04'])[0] : null, tMin = gm ? gm.t : C['6-02'] + 1.7;
    const B = beatsOf(E, C['6-01'], C['7-01']), mute = (t) => t >= C['6-03'] - 0.05 && t < C['6-04'] - 0.05;
    const n = play(k, B, X, C['7-01'], { at: (b) => ({ mode: b.t >= tMin ? 2 : 1 }), mute });
    gaps.push([C['6-03'], C['6-04'] - 0.1, -24, 0.25, 0.15, '6-03: the music taken away under the dead button']);
    for (const s of ev('suck', C['6-04'], C['6-07'])) {
      const g = ev('gulp', s.t, s.t + (s.dur || 1) + 0.6)[0], tG = g ? g.t : s.t + (s.dur || 1), d = tG - s.t;
      k.ST(s.t, d + 0.02, [38, 39, 45, 50, 51, 57], 0.95, { n: 5, trem: 17, att: 0.3, rel: 0.02, swell: (u) => 0.1 + 0.9 * u * u, gain: 0.1, pont: 0.5, bright: 5, pm: (tt) => 2 * smooth(tt / d) });
      for (let t = s.t + 0.2; t < tG - 0.02; t += 0.06) k.TIMP(t, 38, 0.2 + 0.6 * (t - s.t) / d, 0.4, { gain: 0.3 });
      hit(k, tG, [50, 53, 57], 1, { dur: 0.7, gain: 0.9, sub: 0.8, rel: 0.3 });
    }
    // 6-07: onto the floor
    const th = ev('thud', C['6-07'], C['6-08'])[0], tT = th ? th.t : C['6-07'] + 1.6, t7 = C['6-07'] + 0.05, up = (t) => smooth((t - t7) / (tT - t7));
    for (let t = t7; t < tT - 0.01; t += 0.05) { k.TIMP(t, 38, 0.3 + 0.65 * up(t), 0.4, { gain: 0.4 }); k.SNARE(t + 0.02, 0.15 + 0.5 * up(t), { gain: 0.4 }); }
    k.ST(t7, tT - t7 + 0.01, [26, 38, 39, 45, 50, 51, 57, 62, 63], 1, { n: 5, trem: 16, att: 0.1, rel: 0.01, swell: (u) => 0.75 + 0.25 * u * u, gain: 0.12, pont: 0.45, bright: 5 });
    k.BR('trombone', t7, tT - t7 + 0.01, [38, 39, 45], 1, { n: 4, att: 0.15, rel: 0.01, swell: (u) => 0.75 + 0.25 * u * u, gain: 0.12, flutter: 0.3 });
    k.BR('horn', t7, tT - t7 + 0.01, [50, 51, 57], 1, { att: 0.15, rel: 0.01, swell: (u) => 0.75 + 0.25 * u * u, gain: 0.12 });
    k.BR('tuba', t7, tT - t7 + 0.01, [26], 1, { att: 0.3, rel: 0.01, swell: (u) => 0.4 + 0.6 * u, gain: 0.3 });
    k.SWELL(tT, Math.min(1.4, tT - t7), 0.05, 1, { gain: 1.5 });
    const dH = C['6-08'] + 0.35 - tT;
    hit(k, tT, [50, 51, 53, 57], 1, { dur: dH, gain: 0.95, crash: 1.0, sub: 1.2, rel: 0.1, swell: (u) => 1 - 0.3 * u });
    for (let t = tT + 0.25; t < tT + dH - 0.05; t += 0.07) k.TIMP(t, 38, 0.7 * (1 - 0.4 * (t - tT) / dH), 0.4, { gain: 0.4 });
    k.CRASH(tT + 0.04, 1, 3, { gain: 0.6, pan: -0.3 });
    cue(B[0]?.t ?? C['6-01'], `R6: ${n} notes heard; minor from ${tMin.toFixed(2)} (the machine takes for itself); 6-03 no music under the dead button; the crowns: clusters and hits; 6-07 the machines on the floor at ${tT.toFixed(2)}: a held D minor with E-flat; 6-08 the tune in trombones and war drums`);
    return gaps;
  },

  // R7a 山 (7-01, 7-02) — the organ from its lowest note as the machines eat the hall; when it breaks (the burst) THE
  // TUNE, four octaves under the music box, in minor over a Neapolitan bass, slow: organ, brass, strings, drums: the
  // biggest music of the film. Its beat is the mountains' own: the taks fall on every other note. Faded out at 7-03.
  R7a(k, C, ROW, ev, cue, X) {
    const t0 = C['7-01'], bu = ev('burst', t0, C['7-02'])[0], tB = bu ? bu.t : t0 + 1.4;
    const taks = ev('tak', t0, C['8-01']).map((e) => e.t), gs = taks.slice(1).map((t, i) => t - taks[i]).filter((g) => g > 0.3).sort((a, b) => a - b), per = clamp((gs[0] ?? 1.35) / 2, 0.45, 0.9), anchor = taks[0] ?? tB;
    const up = (t) => smooth((t - t0) / (tB - t0));
    k.ORG(t0 + 0.05, tB - t0, [26], up, { reg: { sub: 1, p8: 1, p4: 0.5 }, att: 0.3, rel: 0.3, gain: 0.2, chiff: 0 });
    k.ORG(t0 + 0.4, tB - t0 - 0.35, [33, 38, 39], up, { reg: { sub: 0.6, p8: 1, p4: 0.6, p2: 0.3 }, att: 0.3, rel: 0.3, gain: 0.14, chiff: 0 });
    for (let t = t0 + 0.2; t < tB - 0.02; t += 0.055) k.TIMP(t, 38, 0.25 + 0.6 * up(t), 0.4, { gain: 0.35 });
    k.SWELL(tB, Math.min(1.2, tB - t0), 0.05, 1, { gain: 1.5 }); k.SUB(t0, tB, 26, up, 0.25);
    const G = []; for (let t = anchor - per * Math.floor((anchor - tB + 0.05) / per); t < C['7-03'] - 0.05; t += per) G.push({ t, who: G.length % 2 ? 'heart' : 'spade', size: 30 });
    X.note = 0;
    const n = play(k, G, X, C['7-03'], { at: () => ({ mode: 3, tier: 7 }) });
    cue(t0, `R7: the organ from its lowest note; at the burst (${tB.toFixed(2)}) the tune four octaves down, minor, a note every ${per.toFixed(3)} s (${n} notes; the mountains' taks fall on every other one)`);
    return [];
  },
  // R7c (7-04 .. 7-06) — no tune. The low held note under the black machine starving; it stops with the red king's
  // shouting; ONE BEAT OF REAL SILENCE (everything carved away); then he cheers. From there no music: two horns.
  R7c(k, C, ROW, ev, cue) {
    const ch = ev('cheer', C['7-04'], C['8-01'])[0], sh = ev('shout', C['7-05'] - 0.2, C['7-06']).find((e) => !isUS(e.who) && e.who !== 'both'), gaps = [];
    const tQ = sh ? sh.t + (sh.dur || 0.75) + 0.05 : C['7-05'] + 0.9, tC = ch ? ch.t : C['7-05'] + 2;
    pedal(k, C['7-04'] + 0.2, tQ - 0.25, 1.4, { att: 0.8, rel: 0.2 });
    if (tC - tQ > 0.3) gaps.push([tQ + 0.12, tC - 0.012, -50, 0.12, 0.01, '7-05: one beat of real silence before he cheers', 'all']);
    cue(tQ, `R7: 7-05: silence ${(tQ + 0.12).toFixed(2)}..${tC.toFixed(2)} (${(tC - tQ - 0.12).toFixed(2)} s: music, effects, rooms), then the cheer`);
    return gaps;
  },

  // R8b (8-03 ..) — 8-05: the black king alone between two mountains: a low pedal (organ and basses on D and A), no
  // third, under the far booms; gone by the black.
  R8b(k, C, ROW, ev, cue) {
    const t0 = C['8-05'] + 0.1, t1 = C['8-06'] - 0.1, lv = (t) => smooth((t - t0) / 1.5) * (1 - smooth((t - t1 + 1.0) / 1.0));
    k.ORG(t0, t1 - t0, [26, 33, 38], lv, { reg: { sub: 0.9, p8: 1, p4: 0.4 }, att: 0.5, rel: 0.3, gain: 0.2, chiff: 0 });
    k.ST(t0, t1 - t0, [26, 38, 45], 0.6, { n: 5, att: 1.2, rel: 0.6, vib: 0, gain: 0.05, bright: 2.5, maxCut: 700, swell: (u) => Math.sin(Math.PI * Math.min(1, u * 1.1)) });
    cue(t0, 'R8: 8-05: a low pedal (D and A, organ and basses) under the far booms');
    return [];
  },

  // R9 片名 — the title and the credits: the music box alone, the whole tune in major (A A' B and its ending), its own
  // bass tines under it, simply played, slowing into the last chord; over before 10-01.
  R9(k, C, ROW, ev, cue) {
    const t0 = C.title + 0.6, N = TUNE.full.length, p = (C.egg - 1.9 - t0) / (N + 2.2);
    let t = t0;
    TUNE.full.forEach((deg, i) => {
      const last4 = i >= N - 4, v = 0.8 + 0.1 * (i % 8 === 0), bs = bassOf(deg);
      k.MB(t, 86 + deg, v, { gain: 0.5, send: 0.35 });
      if (i % 4 === 0) k.MB(t, 62 + bs + (bs < -6 ? 12 : 0), 0.6, { gain: 0.4, send: 0.35, pan: -0.15 });
      if (i % 4 === 2) k.MB(t, 74 + bs + 4 + (bs < -6 ? 12 : 0), 0.45, { gain: 0.32, send: 0.35, pan: 0.15 });
      t += p * (last4 ? 1 + 0.18 * (i - (N - 5)) : 1);
    });
    k.MB(t, 86, 0.7, { gain: 0.45, send: 0.4 }); k.MB(t + 0.06, 78, 0.6, { gain: 0.4, send: 0.4 }); k.MB(t + 0.12, 74, 0.6, { gain: 0.4, send: 0.4 }); k.MB(t + 0.18, 62, 0.6, { gain: 0.4, send: 0.4 });
    cue(t0, `R9: the music box alone: the whole tune in major (${N} notes, one every ${p.toFixed(3)} s), slowing; the last chord at ${t.toFixed(2)}`);
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
