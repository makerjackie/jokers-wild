// Sound department — the score of JOKERS WILD v2. Original music, M1 .. M12 (cue table: docs/SCRIPT.md).
// SCORE[cue] scores one cue into its chunk (audio.js renders the film one cue at a time); buildMusicG is M7 + M8
// (AUTO, the march, the boxes open, the seals), which carries its own band, room and break.
//
// THE KINGS' MOTIF (the power layer, low brass): three notes rising by semitones (x, x+1, x+2).
//   M1 only hints at it (an A-Bb-B cluster creeping in under the chairs). M2 states it on every hand, a semitone
//   higher each time (A-Bb-B .. E-F-F#; the two chair gags, 2-11 and 2-17, are left dry, but the climb counts
//   them); 2-22 hits one higher still (F). The title rests on low A. The kiln lifts it (F-F#-G), the gold lifts it
//   again (F#-G-G#) and the hopper climbs on (A, Bb, B) into the frenzy's C. The march hammers it in unison
//   (Ab-A -> Bb on the burst). After the bomb the brass never comes back: in M10 the CARDS play the motif (A-Bb-B,
//   then sunk to E-F-F#) over an organ the machine hum turns into, and in M11 the cards race through it, a
//   semitone higher and faster every time, until it collapses into a "da-da-da" that runs on into the black.
// THE MARCH (M7, from the cigars): a corny state band, Bb major, 2/4, fitted so its 24th beat lands on the burst:
//   2 bars of vamp, the 8-bar tune (sour in the middle: the flat sixth, E-flat minor), a 2-bar tag that pounds the
//   motif in unison (Ab, Ab, A, A -> Bb). Flat and too loud (compressed hard, a little torn). From the last lock it
//   goes distant, from inside the box muffled; the burst brings it back full on the downbeat, where it skips like a
//   scratched CD, sticks on one Bb, and dies into the hole.
// Every time below comes from CUES / ROW / SHOT or from the picture's sound events (slam, relay, sealSwing): the
// music follows the picture, never a hard-coded second. Where the director has not emitted a cue's events yet, the
// music falls back on the shot table.
import { SR, TAU, mtof, put, put2, clamp, smooth, SVF, Rng, Biquad, panGains, drive, within } from './audio-dsp.js';
import { section, brass, bowed, snare, bassDrum, warDrum, timpani, crash, cymbalSwell, cardTone, cardTap, BRASS } from './audio-inst.js';
import { fdnReverbG, glueG, eqG, sweepLPG } from './audio-master.js';
import { SHOTS, SHOT, CUES, ROW } from './shots.js';

// the music cue table (SCRIPT.md), from the shot table's `cue` column
const CUE_NAME = { M1: '空桌 the empty table', M2: '入局 the arrivals', M3: '两张王 two jokers', M4: '卡脖子 chokehold', M5: '拆锁 the locks', M6: '癫狂 frenzy',
  M7: '托管 AUTO', M8: '开盒 the boxes open', M9: '王炸 jokers wild', M10: '新王 the new king', M11: '还在出牌 still playing', M12: '片尾 credits' };
export function cueTable() {
  const out = [];
  for (const s of SHOTS) { const l = out[out.length - 1]; if (l && l.id === s.cue) l.t1 = s.t1; else out.push({ id: s.cue, name: CUE_NAME[s.cue] ?? s.cue, t0: s.t0, t1: s.t1 }); }
  return out;
}

// section levels (linear), calibrated by measurement against the walls and holes (docs/SOUND.md)
export const LV = { casc: 1.0, march: 1.6, burst: 1.6, rise: 1.0, seals: 1.6, climb: 2.1, fanfare: 0.56 };
const bg = (kind, f) => BRASS[kind].gain * f;   // a brass preset's level, scaled

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

// ---- the band, played too loud and flat: a little presence, torn a little, compressed hard
function* bandChainG(L, R) {
  yield* within(eqG(L, R, () => [Biquad.hp(55, 0.7), Biquad.loshelf(150, -1.5), Biquad.peak(2400, 1.0, 2.5), Biquad.peak(330, 0.8, -1.5), Biquad.lp(Math.min(12000, SR * 0.42), 0.7)]), 0, 0.6);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.75 / Math.max(1e-9, pk), d = 1.7, nd = 1 / Math.tanh(d);
  for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * k * d) * nd; R[i] = Math.tanh(R[i] * k * d) * nd; }
  yield 0.7;
  return yield* within(glueG(L, R, { thr: -16, ratio: 2.8, knee: 6, att: 0.004, rel: 0.12, rms: 0.006, look: 0.002 }), 0.7, 1);
}

// ---- 7-11 .. 7-13: the march goes distant (the dry band darker and ~12 dB down, its room kept): dz(t) 0..1
function distance(B, dz, t0, t1) {
  const off = B.off ?? 0, a = Math.max(0, Math.round(t0 * SR) - off), b = Math.min(B.L.length, Math.round(t1 * SR) - off);
  const lL = new SVF(1100, 0.6), lR = new SVF(1100, 0.6), lL2 = new SVF(1100, 0.6), lR2 = new SVF(1100, 0.6);
  let z = 0;
  for (let i = a; i < b; i++) {
    if (((i - a) & 15) === 0) z = dz((i + off) / SR);
    lL2.run(lL.run(B.L[i])); lR2.run(lR.run(B.R[i]));
    if (z <= 0) continue;
    const g = 1 - 0.94 * z;
    B.L[i] = (B.L[i] + (lL2.lp - B.L[i]) * z) * g; B.R[i] = (B.R[i] + (lR2.lp - B.R[i]) * z) * g;
  }
}

// ---- 7-13: heard from INSIDE the iron box: dull, boxy, the iron answering faintly; crossfaded in and out.
// Used on the march and (audio.js) on the effects.
export function boxMuffle(B, t0, t1, amt = 1) {
  const off = B.off ?? 0, a = Math.round(t0 * SR) - off, b = Math.round(t1 * SR) - off, xf = Math.round(0.012 * SR);
  const i0 = Math.max(0, a - xf - Math.round(0.15 * SR)), i1 = Math.min(B.L.length, b + xf);
  if (i1 <= i0) return;
  const mk = () => [Biquad.hp(80, 0.7), Biquad.lp(520, 0.85), Biquad.lp(520, 0.6), Biquad.peak(260, 1.2, 5), Biquad.peak(640, 1.5, 3)];
  const fL = mk(), fR = mk(), RING = [1350, 2110, 3260];
  const rL = RING.map((f) => new SVF(f, 40)), rR = RING.map((f) => new SVF(f, 40)), hL = new SVF(1500, 0.7), hR = new SVF(1500, 0.7);
  for (let i = i0; i < i1; i++) {
    let yl = B.L[i], yr = B.R[i];
    for (let q = 0; q < fL.length; q++) { yl = fL[q].run(yl); yr = fR[q].run(yr); }
    hL.run(B.L[i]); hR.run(B.R[i]);
    let gl = 0, gr = 0; for (let q = 0; q < 3; q++) { rL[q].run(hL.hp); rR[q].run(hR.hp); gl += rL[q].bp; gr += rR[q].bp; }
    const w = amt * (i < a ? 0 : i < a + xf ? (i - a) / xf : i < b ? 1 : i < b + xf ? 1 - (i - b) / xf : 0);
    B.L[i] += ((yl * 0.7 + gl * 0.02) - B.L[i]) * w; B.R[i] += ((yr * 0.7 + gr * 0.02) - B.R[i]) * w;
  }
}

// ---- 8-01 / 8-02: the band breaks. From S the "CD" skips: it jumps back one grain (g) and plays it again, 4-6
// times, with tiny digital dropouts; at F it sticks: one grain held (granular overlap-add with a little jitter),
// pulled into a single Bb by a comb resonance; from F2 it fades and darkens into nothing at E. B is the post-room
// band (windowed {L, R, off}), rewritten from S on.
function breakPlayback(B, S, F, F2, E, o = {}) {
  const off = B.off, iS = Math.round(S * SR) - off, iF = Math.round(F * SR) - off, iF2 = Math.round(F2 * SR) - off, iE = Math.round(E * SR) - off;
  const g0 = o.grain ?? 0.12, src = Math.round(0.4 * SR), r = new Rng(o.seed ?? 5);
  const sL = B.L.slice(iS - src, iS), sR = B.R.slice(iS - src, iS);
  for (let i = iS; i < B.L.length; i++) { B.L[i] = 0; B.R[i] = 0; }
  const fade = Math.round(0.0015 * SR), reps = [];
  let p = iS, k = 0, rms = 0, rn = 0;
  const BACK = [1, 1, 0.9, 1, 0.83, 1, 0.75], LEN = [1, 1, 0.84, 1, 0.7, 0.9, 0.6], GAIN = [1, 0.95, 1.03, 0.93, 0.98, 0.9, 0.94], GAP = [0, 0.007, 0, 0.011, 0, 0.005, 0];
  while (p < iF) {
    const back = Math.round(g0 * BACK[k % 7] * SR), gn = GAIN[k % 7];
    let len = Math.min(Math.round(g0 * LEN[k % 7] * SR), iF - p + fade);
    if (iF - (p + len) < Math.round(0.05 * SR)) len = iF - p + fade;
    for (let i = 0; i < len && p + i < B.L.length; i++) {
      const s = src - back + i; if (s < 0 || s >= src) continue;
      const w = Math.min(1, i / fade, (len - i) / fade), l = sL[s] * w * gn, rr = sR[s] * w * gn;
      B.L[p + i] += l; B.R[p + i] += rr; rms += l * l + rr * rr; rn += 2;
    }
    reps.push(+(len / SR).toFixed(3));
    p += len + Math.round(GAP[k % 7] * SR); k++;
  }
  rms = Math.sqrt(rms / Math.max(1, rn));
  const n = iE - iF, gl = Math.round(0.06 * SR), hop = gl >> 2, c0 = src - Math.round(0.05 * SR), jit = Math.round(0.01 * SR);
  const fL = new Float32Array(n + gl), fR = new Float32Array(n + gl);
  for (let st = 0; st < n; st += hop) {
    const rd = c0 - (gl >> 1) + Math.round((r.next() * 2 - 1) * jit);
    for (let i = 0; i < gl; i++) { const w = 0.25 - 0.25 * Math.cos(TAU * i / gl), s = rd + i; if (s >= 0 && s < src) { fL[st + i] += sL[s] * w; fR[st + i] += sR[s] * w; } }
  }
  const f0 = mtof(o.note ?? 46), D = SR / f0, Di = Math.floor(D), fr = D - Di, cap = Di + 4;
  const cL = new Float32Array(cap), cR = new Float32Array(cap); let w = 0;
  const lpA = new SVF(12000, 0.6), lpB = new SVF(12000, 0.6), lpC = new SVF(12000, 0.6), lpD = new SVF(12000, 0.6);
  let e2 = 0, n2 = 0, gainFix = 1;
  const out = (i, l, rr) => { B.L[iF + i] += l; B.R[iF + i] += rr; };
  for (let i = 0; i < n; i++) {
    const t = i / SR, hold = (iF2 - iF) / SR, u = clamp(t / hold), fb = 0.93 * smooth(Math.min(1, u * 1.6)), mix = 0.94 * smooth(Math.min(1, u * 1.6));
    const ra = (w - Di + cap) % cap, rb = (w - Di - 1 + cap) % cap;
    const yl = fL[i] + fb * (cL[ra] * (1 - fr) + cL[rb] * fr), yr = fR[i] + fb * (cR[ra] * (1 - fr) + cR[rb] * fr);
    cL[w] = yl; cR[w] = yr; w = (w + 1) % cap;
    const nrm = Math.sqrt(1 - fb * fb); let l = fL[i] * (1 - mix) + yl * mix * nrm, rr = fR[i] * (1 - mix) + yr * mix * nrm;
    const d = i < iF2 - iF ? 0 : (i - (iF2 - iF)) / Math.max(1, iE - iF2), fc = d > 0 ? 6000 * Math.pow(180 / 6000, smooth(d)) : 12000 * Math.pow(0.5, u);
    if ((i & 31) === 0) { lpA.set(fc, 0.6); lpB.set(fc, 0.6); lpC.set(fc, 0.6); lpD.set(fc, 0.6); }
    lpB.run(lpA.run(l)); lpD.run(lpC.run(rr)); l = lpB.lp; rr = lpD.lp;
    const lv = d > 0 ? Math.pow(10, -60 * Math.pow(d, 0.75) / 20) * (1 - smooth((d - 0.9) / 0.1)) : 1, fin = Math.min(1, i / Math.round(0.015 * SR));
    if (i < Math.round(0.2 * SR)) { e2 += l * l + rr * rr; n2 += 2; }
    if (i === Math.round(0.2 * SR)) gainFix = rms * 0.9 / Math.max(1e-9, Math.sqrt(e2 / n2));
    if (i < Math.round(0.2 * SR)) { fL[i] = l * lv * fin; fR[i] = rr * lv * fin; } else out(i, l * lv * fin * gainFix, rr * lv * fin * gainFix);
  }
  const m0 = Math.min(n, Math.round(0.2 * SR)); for (let i = 0; i < m0; i++) out(i, fL[i] * gainFix, fR[i] * gainFix);
  for (let i = iE; i < B.L.length; i++) { B.L[i] = 0; B.R[i] = 0; }
  return { reps, freezeGainDb: +(20 * Math.log10(gainFix)).toFixed(1) };
}

// ================================================================ M7 + M8: AUTO, the march, the boxes, the seals
export const buildMusic = (C, ROW, G, N, events) => drive(buildMusicG(C, ROW, G, N, events));
export function* buildMusicG(C, ROW, G, N, events) {
  let seed = 100; const S = () => ++seed;
  const report = [], cue = (t, l) => report.push([+t.toFixed(3), 'MUSIC', l]);
  const ev = (kind, a, b) => events.filter((e) => e.kind === kind && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  const sec = { str: section(G.n, G.off), brs: section(G.n, G.off) };
  const CUT = C.launch, HOLE = ROW['8-03'].t0;

  // ---- M7a (7-01 .. 7-08): the relays carry the cascade, dry. Under them, from Claude's press, one held breath:
  // a contrabass D (and a sub), growing a little with every king who gives in
  const relays = ev('relay', C.auto - 0.05, C.cigars - 0.005), tA = relays.length ? relays[0].t : C.auto + 0.45;
  const grow = (t) => 0.25 + 0.75 * Math.pow(clamp((t - tA) / (C.cigars - tA)), 1.6);
  bowed(sec.str, tA, C.cigars - tA + 0.02, 26, 0.75, { n: 5, det: 7, att: 0.5, rel: 0.02, swell: (u) => grow(tA + u * (C.cigars - tA)), gain: 0.07 * LV.casc, bright: 3, maxCut: 900, spread: 0.2, noise: 0.03, seed: S() });
  bowed(sec.str, tA + 0.3, C.cigars - tA - 0.28, 38, 0.7, { n: 5, det: 8, att: 0.8, rel: 0.02, swell: (u) => grow(tA + 0.3 + u * (C.cigars - tA - 0.3)), gain: 0.035 * LV.casc, bright: 3.4, maxCut: 1400, spread: 0.35, seed: S() });
  subTone(G, tA, C.cigars + 0.01, 26, grow, 0.045 * LV.casc);
  cue(tA, `M7: AUTO: the relays dry (${relays.length}); under them a contrabass D pedal and a sub, growing with every king who presses`);
  yield 0.05;

  // ---- M7b: the march (cigars .. burst): 24 beats, the 24th on the burst
  const nb = 24, beat = (C.burst - C.cigars) / nb, T = (p) => C.cigars + p * beat;
  const mOff = Math.max(0, Math.round((C.cigars - 0.35) * SR)), mN = Math.min(N, Math.round((HOLE + 1.2) * SR)) - mOff;
  const band = section(mN, mOff), pL = new Float32Array(mN), pR = new Float32Array(mN);
  const rh = new Rng(S()), jit = (p) => (p >= nb ? 0 : rh.range(-0.004, 0.004));
  const NOTE = (kind, p, d, m, v, o = {}) => { const art = d <= 0.26 ? 0.72 : d <= 0.5 ? 0.82 : 0.9; brass(band, kind, T(p) + jit(p), d * beat * art, m, v, { rel: 0.14, ...o, seed: S() }); };
  function* CHORD(p, d, v, acc, voices) { for (const [kind, m, o] of voices) NOTE(kind, p, d, m, v, { accent: acc, ...o }); yield undefined; }
  const PERC = (t, sig, g = 1, pan = 0) => { const s0 = Math.round(t * SR) - mOff, [gl, gr] = panGains(pan); for (let i = Math.max(0, -s0); i < sig.length && s0 + i < mN; i++) { pL[s0 + i] += sig[i] * g * gl; pR[s0 + i] += sig[i] * g * gr; } };
  const C_ = { pan: -0.18, tune: 7 }, TP = { pan: 0.2, tune: 3 }, EU = { pan: -0.08 }, HN = { pan: -0.3 }, TB = { pan: 0.25 };
  const TUTTI = (m) => [['cornet', m + 24, C_], ['trumpet', m + 36, TP], ['euph', m + 12, EU], ['horn', m + 12, HN], ['horn', m, HN], ['trombone', m, TB], ['trombone', m - 12, TB], ['tuba', m - 12, {}]];
  // the vamp (beats 0-3): the band crashes in on a Bb chord, oom-pah, a cornet call
  yield* CHORD(0, 0.75, 1, 1, [['cornet', 70, C_], ['cornet', 74, C_], ['trumpet', 77, TP], ['euph', 58, EU], ['horn', 53, HN], ['horn', 58, HN], ['horn', 62, HN], ['trombone', 46, TB], ['trombone', 50, TB], ['trombone', 53, TB], ['tuba', 34, {}]]);
  [[2, 77, 0.5], [2.5, 77, 0.25], [2.75, 77, 0.25], [3, 82, 1]].forEach(([p, m, d]) => { NOTE('cornet', p, d, m, 0.95, { accent: 0.8, ...C_ }); NOTE('trumpet', p, d, m, 0.9, { accent: 0.8, ...TP }); NOTE('euph', p, d, m - 12, 0.85, { accent: 0.6, ...EU }); });
  [[1, 29], [2, 34], [3, 29]].forEach(([p, m]) => NOTE('tuba', p, 0.8, m, 0.95, { accent: 0.6 }));
  [2].forEach((p) => [46, 50, 53].forEach((m, i) => NOTE('trombone', p, 2, m, 0.9, { accent: 0.75, pan: 0.15 + 0.1 * i })));
  yield 0.1;
  // the tune (beats 4-19): [beat, midi, beats]
  const MEL = [[0, 70, 1], [1, 77, 0.75], [1.75, 74, 0.25], [2, 70, 0.5], [2.5, 74, 0.5], [3, 77, 1], [4, 82, 1.5], [5.5, 84, 0.5],
    [6, 81, 1], [7, 79, 0.75], [7.75, 75, 0.25], [8, 70, 1], [9, 77, 0.75], [9.75, 74, 0.25], [10, 70, 0.5], [10.5, 74, 0.5], [11, 78, 1],
    [12, 77, 1], [13, 75, 0.5], [13.5, 73, 0.5], [14, 72, 1], [15, 68, 0.5], [15.5, 69, 0.5]];
  for (let q = 0; q < MEL.length; q++) {
    const [x, m, d] = MEL[q], p = x + 4, acc = d >= 1 || x % 1 === 0 ? 0.85 : 0.5;
    NOTE('cornet', p, d, m, 0.95, { accent: acc, ...C_ });
    NOTE('trumpet', p, d, x >= 15 ? m + 12 : m, 0.95, { accent: acc, ...TP });
    NOTE('euph', p, d, m - 12, 0.9, { accent: acc * 0.7, ...EU });
    if (q % 2 === 1) yield 0.1 + 0.15 * (q + 1) / MEL.length;
  }
  [[0, 34], [1, 29], [2, 34], [3, 38], [4, 39], [5, 34], [6, 29], [7, 33], [8, 34], [9, 29], [10, 34], [11, 30], [12, 27], [13, 34], [14, 29]].forEach(([x, m]) => NOTE('tuba', x + 4, 0.8, m, 0.95, { accent: 0.6, pan: 0.02 }));
  NOTE('tuba', 19, 0.5, 32, 0.95, { accent: 0.6 }); NOTE('tuba', 19.5, 0.5, 33, 0.95, { accent: 0.7 });
  for (const [x, d, v] of [[0, 2, [46, 50, 53]], [2, 2, [46, 50, 53]], [4, 2, [46, 51, 55]], [6, 2, [45, 51, 53]], [8, 2, [46, 50, 53]], [10, 1, [46, 50, 53]], [11, 1, [46, 49, 54]], [12, 2, [46, 51, 54]], [14, 1, [45, 51, 53]]]) v.forEach((m, i) => NOTE('trombone', x + 4, d, m, 0.9, { accent: 0.75, pan: 0.15 + 0.1 * i }));
  yield 0.3;
  const HARM = (x) => (x < 4 ? [53, 58, 62] : x < 6 ? [55, 58, 63] : x < 8 ? [53, 57, 63] : x < 11 ? [53, 58, 62] : x < 12 ? [54, 58, 61] : x < 14 ? [54, 58, 63] : [53, 57, 63]);
  for (const p of [0.5, 1.5, 2.5, 3.5]) [53, 58, 62].forEach((m, i) => NOTE('horn', p, 0.32, m, 0.82, { accent: 0.4, pan: -0.32 + 0.06 * i }));
  for (let x = 0.5; x < 15; x += 1) if (x < 12 || x > 14) HARM(x).forEach((m, i) => NOTE('horn', x + 4, 0.32, m, 0.82, { accent: 0.4, pan: -0.32 + 0.06 * i }));   // bar 7: the after-beats fall silent
  // bar 8, beat 2: the band in unison on the motif, Ab - A ... -> Bb (the tune's cadence, beat 20)
  [[19, 0], [19.5, 1]].forEach(([p, k]) => { [56, 44].forEach((m) => NOTE('horn', p, 0.5, m + k, 0.95, { accent: 0.9, ...HN })); [44, 32].forEach((m) => NOTE('trombone', p, 0.5, m + k, 0.95, { accent: 0.9, ...TB })); });
  yield 0.34;
  // the tag (beats 20-23): the cadence on Bb, a bar of oom-pah, then the motif pounded in unison: Ab Ab A A -> Bb
  yield* CHORD(20, 1, 1, 1, TUTTI(46));
  [[21, 29]].forEach(([p, m]) => NOTE('tuba', p, 0.8, m, 0.95, { accent: 0.6 }));
  for (const p of [20.5, 21.5]) [53, 58, 62].forEach((m, i) => NOTE('horn', p, 0.32, m, 0.85, { accent: 0.5, pan: -0.32 + 0.06 * i }));
  [[21, 77], [21.5, 77]].forEach(([p, m]) => { NOTE('cornet', p, 0.5, m, 0.95, { accent: 0.9, ...C_ }); NOTE('trumpet', p, 0.5, m + 5, 0.9, { accent: 0.9, ...TP }); });
  for (const [p, k] of [[22, 0], [22.5, 0], [23, 1], [23.5, 1]]) yield* CHORD(p, 0.5, 1, 1, TUTTI(44 + k));
  // beat 24, on the burst: Bb in every octave, fff (the band will skip and stick on it)
  yield* CHORD(nb, 2, 1, 1, TUTTI(46));
  yield 0.4;
  // percussion: bass drum on every beat, clash cymbals on the bars, a field-drum street beat, the rolls
  for (let p = 0; p <= nb; p++) { PERC(T(p), bassDrum(p % 2 ? 0.8 : 1, S(), { ring: 0.3 }), p === nb ? 1.25 : 1, 0); if (p % 4 === 3) yield undefined; }
  for (let p = 0; p <= nb; p += 2) { if (p !== 16) { const big = p % 4 === 0; PERC(T(p) + 0.003, crash(big ? 0.95 : 0.65, S(), big ? 1.7 : 0.9), p === nb ? 1.3 : big ? 1 : 0.8, -0.12); } yield undefined; }
  const SN_A = [[0, 1, 1], [0.5, 0.42], [0.75, 0.4], [1, 0.92], [1.25, 0.4], [1.5, 0.5, 0, 1], [1.75, 0.95]];
  const SN_B = [[0, 1], [0.25, 0.36], [0.5, 0.42], [0.75, 0.36], [1, 0.9, 1], [1.5, 0.42], [1.75, 0.46]];
  const hitS = (t, v, flam) => { if (flam) PERC(t - 0.024, snare(v * 0.32, S()), 1, 0.12); PERC(t, snare(v, S()), 1, 0.12); };
  function* bars(b0, b1) { for (let bar = b0; bar < b1; bar++) { (bar % 2 ? SN_B : SN_A).forEach(([x, v, flam, roll]) => { const p = bar * 2 + x; if (roll) for (let q = 0; q < 4; q++) hitS(T(p) + q * beat / 16, v * (0.55 + 0.1 * q)); else hitS(T(p), v, flam); }); yield undefined; } }
  yield* bars(0, 9);
  hitS(T(18), 1); hitS(T(18.5), 0.45); hitS(T(18.75), 0.5);
  for (let q = 0; q < 8; q++) hitS(T(19) + q * beat / 8, 0.5 + 0.4 * q / 7);
  yield* bars(10, 11);
  hitS(T(22), 1, 1); hitS(T(22.5), 0.9); hitS(T(23), 1, 1);
  for (let q = 0; q < 8; q++) hitS(T(23.5) + q * beat / 16, 0.55 + 0.4 * q / 7);
  hitS(T(nb), 1.1, 1);
  yield 0.47;
  // the band, too loud and flat, into its stone room. The room's send is taken before the distance, so when the
  // band goes distant (7-11) the room keeps more of it than the dry does.
  for (let i = 0; i < mN; i++) { band.L[i] += pL[i] * 0.95; band.R[i] += pR[i] * 0.95; }
  const chGr = yield* within(bandChainG(band.L, band.R), 0.47, 0.55);
  const dz = (t) => (t >= C.burst - 0.004 ? 0 : smooth((t - C.lastLock) / 0.7));
  const sendL = new Float32Array(mN), sendR = new Float32Array(mN);
  for (let i = 0; i < mN; i++) { const g = 0.5 * (1 - 0.8 * dz((i + mOff) / SR)); sendL[i] = band.L[i] * g; sendR[i] = band.R[i] * g; }
  distance(band, dz, C.lastLock - 0.05, C.burst + 0.01);
  yield undefined;
  yield* within(fdnReverbG(sendL, sendR, band.L, band.R, { rt60: 2.5, damp: 4200, size: 1.5, pre: 0.03, lo: 140, wet: 1, width: 1 }), 0.55, 0.66);
  for (let i = 0; i < mN; i++) { band.L[i] *= LV.march; band.R[i] *= LV.march; }
  cue(C.cigars, `M7: the march crashes in on the cut: Bb major, 2/4, ${nb} beats of ${beat.toFixed(4)} s (${(60 / beat).toFixed(1)} bpm), beat ${nb} = the burst; flat and too loud (chain GR ${chGr.toFixed(1)} dB)`);
  cue(T(14), 'M7: the tune lurches to the flat sixth (Gb), then sinks into E-flat minor'); cue(T(22), "M7: the tag pounds the kings' motif in unison: Ab Ab A A -> Bb");
  cue(C.lastLock, 'M7: the last lock: the march goes distant (darker, ~24 dB down, its room kept)');
  boxMuffle(band, C.pov, C.burst);
  cue(C.pov, 'M7: heard from inside the iron box (muffled, boxy)');
  // 8-01 .. 8-02: the burst brings it back full on the downbeat; it skips, sticks on one Bb, dies into the hole
  const sK = C.burst + 0.13, fK = C.freeze + 0.5, f2K = fK + 0.55, eK = HOLE - 0.02;
  const brk = breakPlayback(band, sK, fK, f2K, eK, { grain: 0.12, note: 46, seed: S() });
  { const a = Math.round((C.burst - 0.004) * SR) - mOff; for (let i = Math.max(0, a); i < mN; i++) { const k = i - a < 192 ? 1 + (LV.burst - 1) * (i - a) / 192 : LV.burst; band.L[i] *= k; band.R[i] *= k; } }   // back FULL: louder than ever
  yield 0.7;
  cue(sK, `M8: the burst: the band back full on its Bb, then it skips like a scratched CD: ${brk.reps.length} repeats (${brk.reps.join(', ')} s)`);
  cue(fK, `M8: it sticks: one grain held, pulled into a single Bb (freeze ${brk.freezeGainDb} dB); from ${f2K.toFixed(2)} it darkens and dies by ${eK.toFixed(2)}`);

  // ---- M8 (8-03 .. 8-05): near silence. One high string tremolo creeps upward (sul ponticello, pp); with the
  // siren a second one rubs a semitone above it
  const tR = HOLE + 0.4, tSl = C.seals;
  bowed(sec.str, tR, tSl - tR + 0.25, 76, 0.5, { n: 4, trem: 15, att: 1.6, rel: 0.25, pm: (tt) => 5 * smooth(tt / (tSl - tR)), swell: (u) => 0.25 + 0.75 * u, pont: 0.55, gain: 0.018 * LV.rise, bright: 5, maxCut: 9000, pan: -0.2, spread: 0.3, seed: S() });
  bowed(sec.str, C.cancel, tSl - C.cancel + 0.25, 77, 0.5, { n: 4, trem: 16, att: 0.8, rel: 0.25, pm: (tt) => 3 * smooth(tt / (tSl - C.cancel)), swell: (u) => 0.3 + 0.7 * u, pont: 0.6, gain: 0.03 * LV.rise, bright: 5, maxCut: 9000, pan: 0.2, spread: 0.3, seed: S() });
  cue(tR, 'M8: the hole: the hum and one high string tremolo creeping upward (pp); with the siren a second one a semitone above');
  yield 0.74;

  // ---- M8 (8-06): the seals swing down in low brass (E -> D), the chains catch and the D strains; the cards
  // swarm: a low string tremolo cluster climbs chromatically, faster and faster; cut dead on the cut to 9-01
  const sw = ev('sealSwing', C.seals - 0.2, CUT), tS = sw.length ? sw[0].t : C.seals + 0.1, dS = sw.length ? Math.max(0.5, ...sw.map((e) => e.dur || 0.9)) : 0.9;
  const tCatch = Math.min(CUT - 0.6, tS + dS);
  [[40, tS, tCatch - tS, 0.05, undefined], [38, tCatch, CUT - tCatch + 0.01, 0.01, (u) => 0.75 + 0.25 * u]].forEach(([m, t, d, rel, swl], i) => {
    brass(sec.brs, 'trombone', t, d, m, 0.95, { accent: 0.95, rel, swell: swl, flutter: i ? 0.25 : 0, n: 4, gain: 0.14 * LV.seals, pan: -0.15, seed: S() });
    brass(sec.brs, 'trombone', t, d, m + 12, 0.9, { accent: 0.9, rel, swell: swl, flutter: i ? 0.25 : 0, n: 3, gain: 0.12 * LV.seals, pan: 0.15, seed: S() });
    brass(sec.brs, 'tuba', t, d, m - 12, 0.95, { accent: 0.7, rel, swell: swl, gain: 0.25 * LV.seals, seed: S() });
    brass(sec.brs, 'horn', t, d, m + 12, 0.85, { accent: 0.8, rel, swell: swl, gain: 0.11 * LV.seals, seed: S() });
  });
  put(G, tCatch, warDrum(0.9, S(), { ring: 1.1 }), { gain: 0.9, send: 0.4 });
  cue(tS, `M8: the seals swing down: low brass E -> D (the chains catch at ${tCatch.toFixed(2)}, the D strains)`);
  yield 0.8;
  const tC0 = tS + 0.25, steps = []; { let t = tC0, d = 0.3; while (t + d < CUT - 0.04) { t += d; steps.push(t); d = Math.max(0.08, d * 0.88); } }
  const climb = (t0) => (tt) => { const t = t0 + tt; let k = 0; while (k < steps.length && steps[k] <= t) k++; return k; };
  const cr8 = (t) => Math.pow(clamp((t - tC0) / (CUT - tC0)), 1.5), sw8 = (t0) => (u) => 0.08 + 0.92 * cr8(t0 + u * (CUT - t0));
  for (const [m, who, pan] of [[40, 'vc', -0.25], [41, 'vc', 0.25], [42, 'vc', -0.1], [43, 'vc', 0.1], [28, 'cb', -0.05], [29, 'cb', 0.05]]) {
    bowed(sec.str, tC0, CUT - tC0 + 0.01, m, 0.92, { n: who === 'cb' ? 5 : 6, trem: who === 'cb' ? 12 : 14, pm: climb(tC0), swell: sw8(tC0), att: 0.25, rel: 0.01, pont: who === 'cb' ? 0.15 : 0.42, gain: (who === 'cb' ? 0.15 : 0.17) * LV.climb, bright: 6, maxCut: 6000, pan, spread: 0.35, seed: S() });
    yield undefined;
  }
  const tV = 0.5 * (tC0 + CUT);
  for (const [m, pan] of [[52, -0.35], [53, 0.35], [54, 0]]) { bowed(sec.str, tV, CUT - tV + 0.01, m, 0.92, { n: 5, trem: 16, pm: climb(tV), swell: sw8(tV), att: 0.15, rel: 0.01, pont: 0.5, gain: 0.2 * LV.climb, bright: 6, maxCut: 7000, pan, spread: 0.4, seed: S() }); yield undefined; }
  for (let t = tC0, q = 0; t < CUT - 0.03; t += 1 / 13, q++) { put(G, t, warDrum(0.2 + 0.8 * cr8(t), S(), { ring: 0.22, f: q % 2 ? 58 : 52 }), { gain: 0.3 * LV.climb, pan: q % 2 ? 0.15 : -0.15, send: 0.3 }); if (q % 6 === 5) yield undefined; }
  put(G, CUT - 1.6, cymbalSwell(1.6, 0.6, 0.9, S()), { gain: LV.climb, pan: 0.1, send: 0.4 });
  subTone(G, tC0, CUT + 0.01, 28, cr8, 0.09 * LV.climb, (t) => climb(tC0)(t - tC0));
  cue(tC0, `M8: a low string tremolo cluster climbs chromatically: ${steps.length} semitone steps, ${steps.length > 1 ? (steps[1] - steps[0]).toFixed(2) : '-'} -> ${steps.length > 1 ? (steps[steps.length - 1] - steps[steps.length - 2]).toFixed(2) : '-'} s; violas from ${tV.toFixed(2)}, a war-drum roll, a cymbal swell into the cut`);
  cue(CUT, 'M8: CUT DEAD on the cut to 9-01 (no tail)');
  yield 0.97;
  put2(G, null, sec.str, { gain: 1, send: 0.36 });
  put2(G, null, sec.brs, { gain: 1, send: 0.32 });
  const gaps = [
    [C.cigars, HOLE + 0.1, -90, 0.004, 0.02, 'the march takes over: the power layer is cut dead on the cigars cut'],
    [CUT, CUT + 8, -90, 0.003, 0.003, 'cut dead on the cut to 9-01'],
  ];
  return { report, gaps, march: band, cut: CUT };
}

// ================================================================ the rest of the film (M1 .. M6, M9, M10, M11)
// A kit of players writing into one chunk's (windowed) music group and its sections. Every cue has its own seed
// base, so editing one cue never changes the noise of another. With a queue Q the kit is DEFERRED: every call takes
// its seed at once (so the seeds are those of a straight run) and queues the note; scoreCueG plays the queue in
// order, one note per step. k.do(fn) queues any direct work on a section.
function makeKit(G, seedBase, Q = null) {
  let seed = seedBase; const S = () => ++seed;
  const mk = () => section(G.n, G.off), sec = { str: mk(), brs: mk() }, extra = [];
  const L = (x) => [].concat(x), q = Q ? (f) => { Q.push(f); } : (f) => { const r = f(); if (r && typeof r.next === 'function') drive(r); };
  return {
    G, sec, S, extra, newSec: mk, do: q,
    BR: (kind, t, d, ms, v, o = {}) => L(ms).forEach((m, i) => { const sd = S(); q(() => brass(o.sec ?? sec.brs, kind, t + i * 0.004, d, m, v, { ...o, seed: sd })); }),
    ST: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => bowed(o.sec ?? sec.str, t, d, m, v, { ...o, seed: sd })); }),
    CARD: (t, d, m, v, o = {}) => { const sd = S(); q(() => cardTone(o.sec ?? sec.brs, t, d, m, v, { ...o, seed: sd })); },
    TAP: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, cardTap(o.variant ?? sd), { gain: v * (o.gain ?? 1), pan: o.pan ?? 0, send: o.send ?? 0.12 })); },
    DRUM: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, warDrum(v, sd, o), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: o.send ?? 0.35 })); },
    TIMP: (t, m, v, ring = 1, o = {}) => { const sd = S(); q(() => put(G, t, timpani(m, v, sd, ring), { gain: o.gain ?? 0.7, pan: o.pan ?? -0.1, send: 0.35 })); },
    CRASH: (t, v, ring = 2.4, o = {}) => { const sd = S(); q(() => put(G, t, crash(v, sd, ring), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.15, send: 0.4 })); },
    SWELL: (tPeak, rise, ring, v, o = {}) => { const sd = S(); q(() => put(G, tPeak - rise, cymbalSwell(rise, ring, v, sd), { gain: o.gain ?? 1, pan: o.pan ?? 0.1, send: 0.4 })); },
    SNARE: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, snare(v, sd), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.1, send: 0.2 })); },
    SUB: (t0, t1, m, lvl, gain, glide) => q(() => subTone(G, t0, t1, m, lvl, gain, glide)),
    flush() { put2(G, null, sec.str, { send: 0.36 }); put2(G, null, sec.brs, { send: 0.32 }); for (const [x, send] of extra) put2(G, null, x, { send }); },
  };
}
const fadeOut = (u) => 1 - 0.75 * smooth(u);
const cresc = (u) => u * u * (3 - 2 * u);
// the kings' motif in low brass: three notes from m0 (x, x+1, x+2), s apart, the third held `hold`; h = how many
// hands in (horns join from the 4th, trumpets from the 7th)
function motif(k, t, s, hold, m0, v, h, o = {}) {
  [0, 1, 2].forEach((j) => {
    const tj = t + j * s, dj = j < 2 ? s * 0.92 : hold, sw = j < 2 ? undefined : (u) => 0.5 + 0.5 * u;
    k.BR('trombone', tj, dj, m0 + j, v, { n: 4, accent: 0.85, att: 0.03, rel: o.rel ?? 0.12, swell: sw, pan: o.pan ?? 0, gain: o.tbn });
    k.BR('tuba', tj, dj, m0 + j - 12, v, { accent: 0.6, att: 0.025, rel: o.rel ?? 0.12, swell: sw, gain: o.tuba });
    if (h >= 3) k.BR('horn', tj, dj, m0 + j + 12, v * 0.9, { accent: 0.7, rel: o.rel ?? 0.12, swell: sw, pan: -(o.pan ?? 0) });
    if (h >= 6) k.BR('trumpet', tj, dj, m0 + j + 24, v * 0.85, { accent: 0.8, rel: 0.1, swell: sw });
    if (o.drum) k.DRUM(tj, 0.6 + 0.1 * j, { f: 46, ring: 0.8, gain: o.drum });
  });
}

// every scorer: (kit, C, ROW, ev, cue) -> gaps [[t0, t1, db, rampIn, rampOut, label]] carved after the room
export const SCORE = {
  // M1 0:00-0:23 — the hum, the old clock, Google's breathing (ambience, audio-sfx.js) and nothing else until the
  // gold light runs out to the edge of the table: then, under the chairs scraping in the dark, an A-Bb-B cluster
  // creeps in from nothing; at 2-03 it resolves onto the A where the motif begins
  M1(k, C, ROW, ev, cue) {
    const t0 = C.stir, tA = C.arrive, tL = C.ladder, cl = k.newSec();
    const grow = (t) => 0.02 + 0.6 * cresc(clamp((t - t0) / (tA - t0))) + 0.38 * cresc(clamp((t - tA) / (tL - tA)));
    [[33, 0.12, -0.25, 1], [34, 0.12, 0.05, 0], [45, 0.08, -0.3, 1], [46, 0.08, 0, 0], [47, 0.08, 0.3, 0]].forEach(([m, g, pan, keep], i) => {
      const ts = t0 + 0.3 + i * 0.45, dd = (keep ? tL + 0.9 : tL - 0.15) - ts;
      k.ST(ts, dd, m, 0.75, { sec: cl, n: 5, att: 2.5, rel: keep ? 0.6 : 0.4, swell: (u) => grow(ts + u * dd), gain: g, bright: 3.2, maxCut: 2400, pan, spread: 0.3, vib: 3, noise: 0.05 });
    });
    k.do(() => sweepLPG(cl.L, cl.R, (t) => 250 * Math.pow(5, cresc(clamp((t - t0) / (tL - t0)))), cl.off, 0.6));
    k.extra.push([cl, 0.4]);
    cue(t0, 'M1: under the chairs in the dark, a chromatic cluster A-Bb-B (basses, cellos) creeps in from nothing, opening slowly');
    cue(tL - 0.15, 'M1: the cluster resolves onto A, where the motif begins');
    return [];
  },

  // M2 0:23-0:44.1 — the arrivals: the kings' motif a semitone higher every hand (the drums are the slams); the two
  // chair gags (2-11, 2-17) dry; the leaderboard jam; only the clocks; an empty beat; the double slam
  M2(k, C, ROW, ev, cue) {
    const gaps = [], RAISE = ['2-03', '2-05', '2-07', '2-09', '2-11', '2-13', '2-15', '2-17'].filter((id) => ROW[id]), DRY = new Set(['2-11', '2-17']);
    const slams = ev('slam', C.ladder, C.jam);
    RAISE.forEach((id, h) => {
      if (DRY.has(id)) return;
      const t = ROW[id].t0 + 0.02, d = ROW[id].t1 - t, s = clamp(d * 0.26, 0.09, 0.4);
      const land = slams.find((e) => e.t > t + 0.05)?.t ?? ROW[id].t1 + 0.05;
      const m0 = 45 + h, v = 0.68 + 0.035 * h, hold = Math.max(0.2, land + 0.3 - (t + 2 * s));
      motif(k, t, s, hold, m0, v, h, { pan: h % 2 ? 0.2 : -0.2 });
      const next = RAISE[h + 1] ? ROW[RAISE[h + 1]].t0 : C.jam;
      k.ST(t, next - t + 0.05, [m0 - 12, m0 - 24], 0.6 + 0.04 * h, { n: 5, trem: 12, att: 0.08, rel: 0.1, gain: 0.08, pont: 0.2 });
    });
    const lastM = 45 + RAISE.length - 1, b0 = ROW['2-17'] ? ROW['2-17'].t0 + 0.4 : C.jam - 1.0;
    // 2-17 (after the chair) .. 2-18: the build: tremolo strings on the last motif, crescendo, a timpani roll
    k.ST(b0, C.jam - b0, [lastM - 12, lastM, lastM + 1, lastM + 2], 0.85, { n: 5, trem: 14, att: 0.15, rel: 0.02, swell: cresc, gain: 0.09, pont: 0.3 });
    for (let t = b0; t < C.jam - 0.02; t += 1 / 14) k.TIMP(t, lastM - 12, 0.15 + 0.6 * (t - b0) / (C.jam - b0), 0.3, { gain: 0.5 });
    // 2-19 the jam: the band stuck on one chord, re-struck ~11 times a second, slightly uneven (a machine gun)
    const jEnd = ROW['2-19'].t1, chord = [lastM - 24, lastM - 12, lastM - 5, lastM, lastM + 1, lastM + 2];
    for (let t = C.jam, q = 0; t < jEnd - 0.05; t += 0.09 * (q % 3 === 2 ? 1.18 : 0.94), q++) {
      const v = 0.85 + 0.15 * (t - C.jam) / (jEnd - C.jam);
      chord.forEach((m, i) => k.BR(i < 2 ? 'tuba' : 'trombone', t, 0.06, m, v, { n: 2, accent: 1, att: 0.006, rel: 0.04, gain: i < 2 ? 0.45 : 0.19 }));
      k.BR('horn', t, 0.06, [lastM + 12, lastM + 13], v * 0.9, { n: 2, accent: 1, att: 0.006, rel: 0.04, gain: 0.155 });
      if (q % 2 === 0) k.SNARE(t, 0.6 + 0.3 * v, { gain: 0.7 });
    }
    k.ST(C.jam, jEnd - C.jam, chord.slice(1), 0.95, { n: 5, trem: 11, att: 0.01, rel: 0.02, gain: 0.16, pont: 0.4 });
    k.CRASH(C.jam + 0.004, 0.8, 1.4, { gain: 0.6 });
    const tD = C.double;
    gaps.push([jEnd, tD - 0.004, -90, 0.003, 0.003, '2-20 / 2-21: only the clocks; an empty beat before the double slam']);
    // 2-22: the double slam: a crash, the brass a semitone higher still, falling away fast (2-23 is quiet)
    const m1 = lastM + 1;
    k.CRASH(tD + 0.005, 1, 2.6, { gain: 1.0 }); k.CRASH(tD + 0.03, 0.9, 2.0, { gain: 0.6, pan: -0.3 });
    const dHit = C.full - tD + 0.6, fall = (u) => 1 - 0.7 * smooth((u - 0.55) / 0.45);
    [m1 - 24, m1 - 12, m1 - 5, m1, m1 + 1].forEach((m, i) => k.BR(i < 1 ? 'tuba' : 'trombone', tD, dHit, m, 1, { accent: 1, att: 0.008, rel: 0.4, swell: fall, gain: i < 1 ? 0.55 : 0.24 }));
    k.BR('tuba', tD, dHit, m1 - 12, 1, { accent: 1, att: 0.008, rel: 0.5, swell: fall, gain: 0.3 });
    k.BR('horn', tD, dHit, [m1 + 12, m1 + 13, m1 + 7], 1, { accent: 1, rel: 0.5, swell: fall, gain: 0.15 });
    k.BR('trumpet', tD, dHit * 0.8, [m1 + 24, m1 + 25], 0.95, { accent: 1, rel: 0.4, tune: 6, swell: fall });
    k.ST(tD, dHit, [m1 - 12, m1, m1 + 1, m1 + 12, m1 + 13], 1, { n: 5, accent: 1, att: 0.01, rel: 0.4, gain: 0.26, trem: 15, swell: fall });
    k.TIMP(tD, m1 - 12, 1, 1.2); k.DRUM(tD + 0.01, 1, { f: 42, ring: 1.0, gain: 0.7 }); k.SUB(tD, tD + 1.4, m1 - 24, (t) => Math.exp(-(t - tD) / 0.6), 0.16);
    gaps.push([C.full + 0.7, C.press1 + 4, -90, 0.35, 0.003, '2-23: then quiet a beat (hum and the clocks)']);
    cue(C.ladder, `M2: the kings' motif a semitone higher every hand: ${RAISE.length} hands (${RAISE.length - DRY.size} stated, the chair gags dry), A-Bb-B up to E-F-F#; the drums are the slam events (${slams.length})`);
    cue(C.jam, 'M2: the leaderboard jam: the band stuck on one chord, re-struck 11 times a second'); cue(tD, 'M2: the double slam: two crashes, the brass a semitone higher (F), gone by 2-23');
    return gaps;
  },

  // M3 0:44.1-1:02.2 — two jokers: a thread of high cello tremolo while the press groans, cut when the joker's own
  // tone appears (an event: jokerHum); the boxes and the stickers dry; the title: one low brass A on a war drum
  M3(k, C, ROW, ev, cue) {
    const gaps = [], t0 = C.press1 + 0.3, t1 = C.joker1;
    k.ST(t0, t1 - t0 + 0.3, [52, 53], 0.5, { n: 4, trem: 13, att: 1.2, rel: 0.02, swell: (u) => 0.2 + 0.8 * u * u, gain: 0.03, pont: 0.7, bright: 5, pan: 0.3 });
    gaps.push([t1 + 0.05, C.title - 0.003, -90, 0.25, 0.003, "the joker's tone replaces the music; the boxes and the stickers are dry"]);
    const tT = C.title, hold = Math.max(1.5, Math.min(3.4, ROW['3-07'].t1 - tT - 0.6));
    k.BR('tuba', tT, hold, 33, 0.85, { accent: 0.7, att: 0.06, rel: 0.7, swell: fadeOut, gain: 0.16 });
    k.BR('trombone', tT, hold, [45, 45], 0.82, { n: 4, accent: 0.8, att: 0.06, rel: 0.7, swell: fadeOut, pan: 0.1, gain: 0.068 });
    k.BR('horn', tT + 0.02, hold - 0.1, 57, 0.7, { accent: 0.5, att: 0.1, rel: 0.7, swell: fadeOut, pan: -0.15, gain: bg('horn', 0.7) });
    k.DRUM(tT, 0.95, { f: 44, ring: 1.3, gain: 0.75 });
    k.SUB(tT, tT + hold + 0.6, 33, (t) => Math.exp(-(t - tT) / 1.4), 0.09);
    cue(t0, 'M3: a thread of high cello tremolo while the press groans'); cue(t1, "M3: cut: the joker's own tone (jokerHum) takes over; then only foley");
    cue(tT, 'M3: the title: one long low brass A pressing on a war drum, then only the hum');
    return gaps;
  },

  // M4 1:02.2-1:30.9 — chokehold: a low string semitone cluster under the giant's eyes; the first lock dry; the seal
  // lifted in a slow chromatic brass fall; EMBARGO; the heart alone; the o1 fanfare cut dead by R1; the avalanche
  // dry; the kiln: the motif a semitone up
  M4(k, C, ROW, ev, cue) {
    const gaps = [], tE = C.embargo;
    k.ST(C.eyes + 0.1, C.unlockUS - C.eyes - 0.05, [28, 29], 0.7, { n: 5, att: 1.0, rel: 0.25, swell: (u) => 0.3 + 0.7 * u, gain: 0.075, bright: 3, maxCut: 1400, pan: -0.1, spread: 0.3 });
    k.ST(C.eyes + 0.4, C.unlockUS - C.eyes - 0.35, [40, 41], 0.65, { n: 5, att: 1.0, rel: 0.25, swell: (u) => 0.2 + 0.8 * u, gain: 0.07, bright: 3.4, maxCut: 1800, pan: 0.1, spread: 0.4 });
    // 4-04: the giant lifts the seal: a slow chromatic fall in low brass into EMBARGO, a cymbal swell
    const tA = C.giantUS + 0.15, FALL = [47, 46, 45, 44, 43, 42], st = (tE - tA) / FALL.length;
    FALL.forEach((m, i) => { const t = tA + i * st, v = 0.42 + 0.1 * i, c = 0.3 + 0.14 * i; k.BR('trombone', t, st * 0.95, [m, m + 12], v, { n: 3, accent: 0.6, att: 0.05, rel: 0.1, gain: 0.13 * c }); k.BR('tuba', t, st * 0.95, m - 12, v, { accent: 0.5, rel: 0.1, gain: 0.3 * c }); });
    k.ST(tA, tE - tA, [35, 47], 0.7, { n: 5, trem: 13, att: 0.4, rel: 0.02, swell: (u) => 0.1 + 0.9 * u * u, gain: 0.08, pm: (tt) => -Math.min(FALL.length - 1, Math.floor(tt / st)) });
    k.SWELL(tE, tE - tA, 0.2, 0.7);
    // EMBARGO: brass and strings sforzando on D (with an Eb in it), a crash, a sub
    const dEm = Math.max(0.6, C.starve - tE);
    [26, 38, 45, 50, 51].forEach((m, i) => k.BR(i ? 'trombone' : 'tuba', tE, dEm, m, 1, { accent: 1, att: 0.008, rel: 0.3, swell: (u) => 1 - 0.12 * smooth(u), gain: i ? 0.22 : 0.45 }));
    k.BR('horn', tE, dEm, [62, 63, 57], 1, { accent: 1, rel: 0.3, gain: 0.16 }); k.BR('trumpet', tE, dEm, [74, 75], 0.95, { accent: 1, rel: 0.3, tune: 6 });
    k.ST(tE, dEm, [38, 50, 51, 62, 63], 1, { n: 5, accent: 1, att: 0.01, rel: 0.25, gain: 0.28, trem: 14 });
    k.CRASH(tE + 0.004, 1, 2.2); k.SUB(tE, tE + 1.4, 26, (t) => Math.exp(-(t - tE) / 0.5), 0.14);
    gaps.push([C.starve + 0.06, C.boast - 0.003, -90, 0.08, 0.003, 'only the heartbeat while the CN chips run out (4-06)']);
    // the o1 fanfare: D major, a too-bright E major (Lydian), an augmented D; trumpets 10 cents sharp. Its last
    // chord is held (fading a little, so the second lock reads) until the tiny card lands on it: CUT DEAD
    const F0 = C.boast, bt = Math.min(0.5, (C.r1 - F0) / 15), T = (x) => F0 + x * bt;
    const TPT = [[0, 74, 1 / 3], [1 / 3, 74, 1 / 3], [2 / 3, 74, 1 / 3], [1, 81, 2], [3, 78, 1], [4, 76, 1 / 3], [4 + 1 / 3, 76, 1 / 3], [4 + 2 / 3, 76, 1 / 3], [5, 83, 2], [7, 80, 1],
      [8, 81, 1 / 3], [8 + 1 / 3, 81, 1 / 3], [8 + 2 / 3, 81, 1 / 3], [9, 86, 3]];
    const F = LV.fanfare;
    TPT.forEach(([x, m, d]) => { const long = d >= 1; k.BR('trumpet', T(x), d * bt * (long ? 0.92 : 0.7), [m, m - 12], 0.95, { tune: 10, accent: long ? 0.9 : 0.6, rel: 0.12, pan: 0.15, gain: bg('trumpet', F) }); });
    [[0, [62, 66, 69], [50, 57], 38], [4, [64, 68, 71], [52, 59], 40], [8, [62, 66, 70], [50, 58], 38]].forEach(([x, hn, tb, tu]) => {
      k.BR('horn', T(x), 4 * bt * 0.96, hn, 0.9, { accent: 0.7, rel: 0.15, pan: -0.25, gain: bg('horn', F) }); k.BR('trombone', T(x), 4 * bt * 0.96, tb, 0.9, { accent: 0.7, rel: 0.15, pan: 0.2, gain: bg('trombone', F) });
      k.BR('tuba', T(x), 4 * bt * 0.96, tu, 0.9, { accent: 0.6, rel: 0.15, gain: bg('tuba', F) }); k.TIMP(T(x), tu, 0.9, 1, { gain: 0.7 * F });
    });
    const H = T(12), dH = C.r1 - H + 0.05, sag = (u) => 1 - 0.72 * smooth(u * 1.5);
    k.BR('trumpet', H, dH, [86, 81, 74], 1, { tune: 10, accent: 0.8, rel: 0.02, swell: sag, gain: bg('trumpet', F) }); k.BR('horn', H, dH, [62, 66, 69, 74], 0.95, { rel: 0.02, swell: sag, gain: bg('horn', F) });
    k.BR('trombone', H, dH, [50, 57, 62], 0.95, { rel: 0.02, swell: sag, gain: bg('trombone', F) }); k.BR('tuba', H, dH, 38, 0.95, { rel: 0.02, swell: sag, gain: bg('tuba', F) });
    k.CRASH(T(0) + 0.004, 0.9, 2.4, { gain: 0.8 * F }); k.CRASH(T(8) + 0.004, 0.95, 2.4, { gain: 0.8 * F });
    gaps.push([C.r1, C.kiln - 0.003, -90, 0.003, 0.003, 'the fanfare cut dead by the tiny card; the avalanche is dry']);
    // the kiln: the motif a semitone higher (F - F# - G), slow and heavy, a low string pedal under it
    const tK = C.kiln, dK = C.locks - tK, sK = Math.min(0.55, dK / 4.5);
    motif(k, tK + 0.15, sK, C.locks - 0.05 - (tK + 0.15 + 2 * sK), 53, 0.85, 3, { rel: 0.25, drum: 0.55, tbn: 0.13, tuba: 0.33 });
    k.ST(tK, dK, [29, 41], 0.7, { n: 5, trem: 12, att: 0.6, rel: 0.25, swell: cresc, gain: 0.1 });
    cue(C.eyes, 'M4: a low string semitone cluster (E-F) under the giant; it leaves before the key turns'); cue(tA, 'M4: the seal lifted: a slow chromatic fall in low brass into EMBARGO');
    cue(F0, `M4: the o1 fanfare: D, a too-bright E (Lydian), an augmented D; beat ${bt.toFixed(3)} s; its last chord held and sagging`);
    cue(C.r1, 'M4: the fanfare cut dead'); cue(tK, "M4: the kiln: the kings' motif up a semitone, F-F#-G");
    return gaps;
  },

  // M5 1:30.9-1:42.3 — the locks: under the "ka, dang, pa" and the drums, a low spiccato ostinato (16ths, faster
  // and faster) rising a semitone with every lock; the boxes plastered: denser, a low brass swell; the dates fly
  M5(k, C, ROW, ev, cue) {
    const t0 = C.locks, tP = C.plaster, tD = C.dates, t1 = C.frenzy, LOCKS = ['5-01', '5-03', '5-05', '5-07'].filter((id) => ROW[id]).map((id) => ROW[id].t0);
    const root = (t) => 40 + Math.max(0, LOCKS.filter((x) => x <= t + 1e-6).length - 1) + (t >= tP ? 1 : 0), sp = k.newSec(), PAT = [0, 0, 1, 0, 3, 0, 1, 0];
    const G16 = []; for (let t = t0 + 0.05; t < t1 - 0.01;) { G16.push(t); t += t < tP ? 0.15 * Math.pow(0.075 / 0.15, (t - t0) / (tP - t0)) : t < tD ? 0.075 * Math.pow(0.06 / 0.075, (t - tP) / (tD - tP)) : 0.06 * Math.pow(0.045 / 0.06, (t - tD) / (t1 - tD)); }
    G16.forEach((t, i) => {
      const r = root(t), u = clamp((t - t0) / (t1 - t0)), v = 0.55 + 0.4 * u + (i % 4 === 0 ? 0.1 : 0), g = t < tP ? 0.6 : 1;
      k.ST(t, 0.05, r + PAT[i % 8], v, { sec: sp, n: 4, att: 0.004, rel: 0.05, accent: 1, gain: 0.11 * g, bright: 5, vib: 0, pan: -0.1, spread: 0.3 });
      if (i % 4 === 0) k.ST(t, 0.07, r - 12, v, { sec: sp, n: 4, att: 0.004, rel: 0.06, accent: 1, gain: 0.14 * g, bright: 4, vib: 0, pan: 0.1 });
      if (t >= tD && i % 2 === 0) k.SNARE(t, 0.4 + 0.5 * (t - tD) / (t1 - tD), { gain: 0.7 });
    });
    k.extra.push([sp, 0.25]);
    const rP = root(tP);
    k.BR('trombone', tP, t1 - tP + 0.02, [rP, rP + 7], 0.8, { n: 4, att: 0.4, rel: 0.02, swell: cresc, gain: 0.12 });
    k.BR('tuba', tP, t1 - tP + 0.02, rP - 12, 0.8, { att: 0.4, rel: 0.02, swell: cresc, gain: 0.3 });
    k.ST(tP, t1 - tP + 0.02, [rP - 12, rP], 0.85, { n: 5, trem: 14, att: 0.3, rel: 0.02, swell: cresc, gain: 0.1, pont: 0.3 });
    for (let t = tD; t < t1 - 0.02; t += 1 / 12) k.DRUM(t, 0.3 + 0.5 * (t - tD) / (t1 - tD), { f: 52, ring: 0.2, gain: 0.45, pan: Math.sin(t * 40) * 0.3 });
    cue(t0, `M5: low spiccato 16ths under the lock foley (${(G16[1] - G16[0]).toFixed(3)} -> ${(G16[G16.length - 1] - G16[G16.length - 2]).toFixed(3)} s), a semitone up with every lock`);
    cue(tP, 'M5: the plastered boxes: the spiccato denser, a low brass swell'); cue(tD, 'M5: the dates fly: a snare and a war-drum roll into the frenzy');
    return [];
  },

  // M6 1:42.3-1:59.1 — frenzy: the motif up again (F#-G-G#) as the gold goes in, the low brass climbing a step per
  // thing fed to the hopper (A, Bb, B), the fourth locks over a held chord, then the wall: everyone throwing, war
  // drums in sixteenths then thirty-seconds, the brass on C. audio.js pulls it all away at 6-08 (the heartbeat)
  M6(k, C, ROW, ev, cue) {
    const t0 = C.frenzy, tLk = C.lock4, tM = C.mad, tB = C.button, STEPS = [[C.castle, 57], [C.city, 58], [C.plant, 59]];
    const s = 0.2;
    motif(k, t0 + 0.1, s, C.castle - (t0 + 0.1 + 2 * s), 54, 0.9, 6, { drum: 0.75, tbn: 0.13, tuba: 0.33 });
    k.ST(t0, tM - t0, [42, 54], 0.75, { n: 5, trem: 13, att: 0.3, rel: 0.05, swell: (u) => 0.5 + 0.5 * u, gain: 0.1, pont: 0.25 });
    STEPS.forEach(([t, m], j) => {
      const d = (STEPS[j + 1] ? STEPS[j + 1][0] : tLk) - t, v = 0.88 + 0.04 * j;
      k.BR('trombone', t + 0.05, d, [m - 12, m - 5, m], v, { n: 4, accent: 0.9, rel: 0.1, swell: (u) => 0.75 + 0.25 * u, gain: 0.12 });
      k.BR('tuba', t + 0.05, d, m - 24, v, { accent: 0.8, rel: 0.1, gain: 0.32 });
      k.BR('horn', t + 0.05, d, [m + 12, m + 13], v * 0.9, { accent: 0.8, rel: 0.1, gain: 0.12 });
      if (j >= 1) k.BR('trumpet', t + 0.05, d, m + 24, v * 0.85, { accent: 0.8, rel: 0.1, tune: 6 });
      k.DRUM(t + 0.05, 1, { f: 42 - 2 * j, ring: 1.0, gain: 0.8 }); if (j === STEPS.length - 1) k.CRASH(t + 0.054, 0.9, 2);
    });
    // 6-05 / 6-06: the fourth locks over a held chord, quiet enough for the foley
    k.BR('trombone', tLk, tM - tLk + 0.02, [47, 54], 0.6, { n: 3, att: 0.1, rel: 0.02, gain: 0.08 });
    k.ST(tLk, tM - tLk + 0.02, [35, 47], 0.6, { n: 5, trem: 15, att: 0.05, rel: 0.02, gain: 0.07, pont: 0.4 });
    // 6-07: the wall: everyone throwing. Brass on C (with a C# in it), strings ff, war drums 16ths -> 32nds, snare
    const dM = tB - tM + 0.02;
    [[36, 'tuba'], [37, 'tuba'], [48, 'trombone'], [55, 'trombone'], [60, 'trombone'], [61, 'trombone']].forEach(([m, kind]) => k.BR(kind, tM, dM, m, 1, { accent: 1, att: 0.008, rel: 0.02, swell: (u) => 0.85 + 0.15 * u, gain: kind === 'tuba' ? 0.34 : 0.15 }));
    k.BR('horn', tM, dM, [60, 61, 67], 1, { accent: 1, rel: 0.02, gain: 0.13 }); k.BR('trumpet', tM, dM, [72, 73], 0.95, { accent: 1, rel: 0.02, tune: 8 });
    k.ST(tM, dM, [36, 48, 49, 60, 61], 1, { n: 5, trem: 16, att: 0.01, rel: 0.02, gain: 0.18, pont: 0.45, accent: 0.8 });
    k.CRASH(tM + 0.004, 1, 2.4, { gain: 0.9 }); k.DRUM(tM, 1, { f: 40, ring: 1.0, gain: 0.8 });
    for (let t = tM, q = 0; t < tB - 0.015; q++) { const u = (t - tM) / (tB - tM); k.DRUM(t, 0.62 + 0.25 * u + (q % 4 === 0 ? 0.13 : 0), { f: q % 2 ? 58 : 50, ring: 0.22, gain: 0.55, pan: q % 2 ? 0.25 : -0.25 }); k.SNARE(t, 0.45 + 0.45 * u, { gain: 0.75 }); t += 0.11 * Math.pow(0.5, u); }
    cue(t0, "M6: the gold: the kings' motif up a semitone (F#-G-G#), war drums"); cue(C.castle, 'M6: the low brass climbs a step per thing fed to the hopper (A, Bb, B)');
    cue(tLk, 'M6: the fourth locks over a held chord'); cue(tM, 'M6: THE WALL: brass on C, strings ff, war drums and snare from 16ths to 32nds'); cue(tB, 'M6: pulled away (audio.js): only the heartbeat');
    return [];
  },

  // M9 2:27.15-2:31.75 — the jokers fly: the strings fly up an octave and more under the tearing wind; three noise
  // walls (tremolo cluster a step higher each time, trombones, a drum roll, a crash) with the master's digital
  // silences between them; all cut dead at the pair (audio.js)
  M9(k, C, ROW, ev, cue) {
    const t0 = C.launch, d1 = C.collide - t0 + 0.02;
    [[43, -0.3], [44, 0.3], [55, -0.3], [56, 0.3], [67, -0.3], [68, 0.3]].forEach(([m, pan]) =>
      k.ST(t0, d1, m, 0.9, { n: 5, trem: 15, att: 0.05, rel: 0.01, gain: 0.1, bright: 6, pont: 0.4, pm: (tt) => 14 * cresc(clamp(tt / d1)), swell: (u) => 0.4 + 0.6 * u, pan }));
    const WALLS = ['9-03.01', '9-03.03', '9-03.05'].filter((id) => SHOT[id]);
    WALLS.forEach((id, j) => {
      const t = SHOT[id].t0, d = SHOT[id].t1 - t + 0.01, b = 57 + 2 * j;
      k.ST(t, d, [b - 24, b - 12, b, b + 1, b + 2, b + 12, b + 13], 1, { n: 5, trem: 16, att: 0.004, rel: 0.01, accent: 1, gain: 0.19, bright: 6, pont: 0.5 });
      k.BR('trombone', t, d, [b - 12, b - 11], 1, { accent: 1, att: 0.006, rel: 0.01, gain: 0.19 });
      k.BR('tuba', t, d, b - 24, 1, { accent: 1, att: 0.006, rel: 0.01, gain: 0.3 });
      for (let tt = t, q = 0; tt < t + d - 0.02; tt += 1 / 20, q++) k.DRUM(tt, 0.7 + 0.1 * j, { f: 50, ring: 0.2, gain: 0.6, pan: q % 2 ? 0.3 : -0.3 });
      k.CRASH(t + 0.002, 0.9, 1.0, { gain: 0.7 });
    });
    cue(t0, 'M9: the strings fly up an octave and more'); cue(SHOT[WALLS[0]].t0, 'M9: three noise walls, a step higher each time, the master gates between them; all cut dead at the pair');
    return [];
  },

  // M9 from the pair: nothing (9-04's two soft "da", 3.5 s of digital silence, the heartbeat); the sub swells 0.6 s
  // before the flash; JOKERS WILD: a tutti hit; an open E held over the wave, its dissonances fading first. The
  // last time the brass is heard.
  M9b(k, C, ROW, ev, cue) {
    const tB = C.bomb, tW = C.wave, dW = C.king - tW + 0.6;
    k.SUB(tB - 0.6, tB + 0.02, 28, (t) => Math.pow(clamp((t - tB + 0.6) / 0.6), 2), 0.3, (t) => 12 * clamp((t - tB + 0.6) / 0.6));
    k.SWELL(tB, 0.6, 0.05, 1.0);
    [28, 35, 40, 47, 52, 53, 58].forEach((m, i) => k.BR(i < 2 ? 'tuba' : 'trombone', tB, 0.5, m, 1, { accent: 1, att: 0.004, rel: 0.4, swell: (u) => 1 - 0.5 * u }));
    k.BR('horn', tB, 0.5, [64, 65, 70], 1, { accent: 1, att: 0.006, rel: 0.4 }); k.BR('trumpet', tB, 0.4, [76, 77], 1, { accent: 1, att: 0.004, rel: 0.3 });
    k.DRUM(tB, 1, { f: 38, ring: 1.4, gain: 0.6 }); k.DRUM(tB + 0.01, 1, { f: 44, ring: 1.2, gain: 0.45, pan: 0.2 });
    k.CRASH(tB + 0.004, 1, 3.5, { gain: 1 }); k.CRASH(tB + 0.02, 0.9, 3, { gain: 0.8, pan: -0.3 }); k.TIMP(tB, 40, 1, 1.4);
    [[28, 'tuba'], [35, 'tuba'], [40, 'trombone'], [47, 'trombone'], [52, 'trombone']].forEach(([m, kind]) => k.BR(kind, tW, dW, m, 0.95, { att: 0.3, rel: 1.2, swell: (u) => 1 - 0.7 * smooth(u), gain: kind === 'tuba' ? 0.33 : 0.14 }));
    k.ST(tW, dW, [28, 40, 47, 52], 0.9, { n: 6, att: 0.2, rel: 1.2, gain: 0.13, swell: (u) => 1 - 0.65 * smooth(u) });
    k.ST(tW, dW * 0.5, [53, 58], 0.8, { n: 5, att: 0.2, rel: 0.8, gain: 0.08, swell: (u) => 1 - smooth(u) });
    cue(tB - 0.6, 'M9: the sub swells 0.6 s before the flash'); cue(tB, 'M9: JOKERS WILD: a tutti hit; an open E held over the wave, its dissonances fading first (the last of the brass)');
    return [];
  },

  // M10 2:42.05-2:55.05 — the new king: the hum turns into an organ (audio.js); the CARDS play the kings' motif,
  // A-Bb-B as the king builds, then sunk to E-F-F# as he sits and looks down; the deals and the threads are foley
  M10(k, C, ROW, ev, cue) {
    const t0 = C.king + 0.5, t2 = C.tower, sN = (t2 - t0 - 0.4) / 3.2;
    [0, 1, 2].forEach((j) => {
      const t = t0 + j * sN, d = j < 2 ? sN * 0.95 : t2 + 0.5 - t, sw = j < 2 ? undefined : (u) => 1 - 0.4 * u;
      k.CARD(t, d, 45 + j, 0.9, { gain: 0.35, att: 0.15, rel: 0.5, swell: sw, pan: -0.15 }); k.CARD(t, d, 57 + j, 0.8, { gain: 0.22, att: 0.15, rel: 0.5, swell: sw, pan: 0.2 });
    });
    const t3 = C.deal, sL = (t3 - t2 - 0.3) / 3.3;
    [0, 1, 2].forEach((j) => {
      const t = t2 + 0.3 + j * sL, d = j < 2 ? sL * 0.95 : t3 + 0.8 - t, sw = j < 2 ? undefined : (u) => 1 - 0.6 * smooth(u);
      k.CARD(t, d, 40 + j, 0.85, { gain: 0.4, att: 0.2, rel: 0.7, swell: sw, pan: 0.1 }); k.CARD(t, d, 52 + j, 0.7, { gain: 0.2, att: 0.2, rel: 0.7, swell: sw, pan: -0.2 });
    });
    cue(t0, "M10: the kings' motif played by the cards (A-Bb-B); the hum becomes an organ on A"); cue(t2 + 0.3, 'M10: the king sits: the organ sinks to E, the cards play the motif low (E-F-F#)');
    return [];
  },

  // M11 2:55.05-3:23.35 — still playing: nothing under the stare (the hearts are the picture's); the double "da" and
  // the cards flying up are foley; then the race: the cards play the motif a semitone higher and faster every time,
  // until it collapses into a denser and denser "da-da-da" that runs on into the black; the hard cut is the gate
  M11(k, C, ROW, ev, cue) {
    let t = C.race + 0.15, sN = 0.3, root = 45, n = 0;
    const tEnd = C.grow + 1.6;
    while (t < tEnd) {
      const v = 0.72 + 0.25 * clamp((t - C.race) / (tEnd - C.race));
      [0, 1, 2].forEach((j) => {
        const tj = t + j * sN, d = j < 2 ? sN * 0.9 : sN * 2.4;
        k.CARD(tj, d, root + j, v, { gain: 0.34, att: 0.03, rel: 0.2, pan: n % 2 ? 0.25 : -0.25 }); k.CARD(tj, d, root + 12 + j, v * 0.8, { gain: 0.2, att: 0.03, rel: 0.2, pan: n % 2 ? -0.3 : 0.3 });
      });
      t += 3.5 * sN; sN = Math.max(0.07, sN * 0.86); root++; n++;
    }
    const tA = C.grow + 0.3, tBk = C.black, tC = C.credits, r = new Rng(9119);
    const rate = (x) => (x < tBk ? 7 * Math.pow(22 / 7, (x - tA) / (tBk - tA)) : 22 * Math.pow(46 / 22, (x - tBk) / (tC - tBk)));
    const lvl = (x) => (x < tBk ? 0.5 + 0.5 * smooth((x - tA) / (tBk - tA)) : 0.42 + 0.18 * (x - tBk) / (tC - tBk));
    let taps = 0;
    for (let p = 0; p < 3; p++) for (let x = tA + p * 0.05; x < tC; x += (3 / rate(x)) * (1 + 0.16 * (r.next() - 0.5))) { k.TAP(x, lvl(x) * (0.8 + 0.2 * r.next()), { gain: 1.25, pan: r.range(-0.7, 0.7), variant: r.int(0, 5), send: x < tBk ? 0.15 : 0.08 }); taps++; }
    cue(C.race + 0.15, `M11: the race: the cards play the motif, a semitone higher and faster every time (${n} statements, A up to ${['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#'][(n - 1) % 12]})`);
    cue(tA, `M11: everything collapses into "da-da-da" (${taps} card taps, 7 -> 22/s), on into the black (-> 46/s); the hard cut at ${tC.toFixed(2)} is the gate`);
    return [];
  },
};

// score one cue into its chunk's music group: returns { report, gaps }. scoreCueG lets the score function queue
// its notes, then plays them one per step.
export const scoreCue = (id, G, events, seedBase) => drive(scoreCueG(id, G, events, seedBase));
export function* scoreCueG(id, G, events, seedBase) {
  const report = [], cue = (t, l) => report.push([+t.toFixed(3), 'MUSIC', l]);
  const ev = (kind, a, b) => events.filter((e) => e.kind === kind && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  const Q = [], k = makeKit(G, seedBase, Q), gaps = SCORE[id](k, CUES, ROW, ev, cue);
  for (let i = 0; i < Q.length; i++) { const r = Q[i](); if (r && typeof r.next === 'function') yield* within(r, i / (Q.length + 1), (i + 1) / (Q.length + 1)); yield (i + 1) / (Q.length + 1); }
  k.flush();
  return { report, gaps };
}
