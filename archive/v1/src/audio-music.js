// Sound department — the score of JOKERS WILD. Original music, M1 .. M12 (cue table: SCRIPT.md section 7).
// buildMusic() is the tone reel the user approved (M7, M8: 6-10 .. 8-08); SCORE[cue] is the rest of the
// film (M1 .. M6, M9, M9b, M10, M10b), each cue rendered into its own chunk by audio.js.
//
// THE KINGS' MOTIF (power layer): three notes rising by semitones (x, x+1, x+2). M1 only hints at it (the
//   A-Bb-B cluster, one low A under the title); M2 states it on every hand, a semitone higher each time
//   (A-Bb-B .. E-F-F#); M3's kiln lifts it one more (F-F#-G); M6's low brass climbs on; under the AUTO
//   cascade (M7) the first three kings to press state it in low brass (D - Eb - E) and every further king
//   adds the next semitone to a string cluster; the march ends on it in unison (Ab - A -> Bb); in M10 the
//   cards themselves play it (E - F - F#), and the flattened kings fall by semitones.
// THE VICTORY MARCH (M7, from the cigars): a state band (cornets and trumpets on the tune, euphoniums an
//   octave under, horns on the after-beats, trombones on sustained chords, tuba, field snare, bass
//   drum, clash cymbals), Bb major, 2/4, ~118 bpm, fitted so its 16th beat lands on the crack. Square,
//   pompous, banal, too loud, and sour in the middle: bar 6 lurches to the flat sixth (Gb), bar 7 sinks
//   into E-flat minor. Bar 8 ends with the whole band in unison on the kings' motif (Ab - A -> Bb), and
//   that Bb is the downbeat the glass cracks on. It is heard as a broadcast: through the war room's
//   loudspeakers (band-limited, a little torn, compressed flat) into a big stone room.
//
//     | Bb  F. D | Bb D F  | Bb'  . C" | A  G. Eb | Bb  F. D | Bb D Gb | F  Eb Db | C  Ab A | Bb! (crack)
//       Bb         Bb        Eb          F7         Bb         Bb  Gb    Ebm        F7  unison
//
// M8: the march skips like a scratched CD on that downbeat, freezes into one Bb, darkens and dies. The
//   hole. The siren (ambience). The seals fall in low brass (a whole-tone fall with the chains); the
//   storm swallows them. A low string tremolo cluster climbs chromatically, faster and faster, and is
//   cut dead on the cut to 9-01.
// Every time below comes from CUES / ROW or from the picture's sound events (relay, chains, strain, slam,
// point, flatten): the music follows the picture, never a hard-coded second. Where the director has not
// emitted a cue's events yet, the music falls back on the shot table (and says so in the report).
import { SR, TAU, mtof, put, put2, clamp, smooth, SVF, Rng, Biquad, panGains, drive, within } from './audio-dsp.js';
import { section, brass, bowed, snare, bassDrum, warDrum, timpani, crash, cymbalSwell, cardTone } from './audio-inst.js';
import { fdnReverbG, glueG, eqG, sweepLPG } from './audio-master.js';
import { SHOTS, CUES, ROW } from './shots.js';

// the music cue table (SCRIPT.md section 7), from the shot table's `cue` column
const CUE_NAME = { M1: 'open', M2: 'the hands', M2b: 'pass, the shim', M3: 'chokehold', M4: 'dirty tricks', M5: 'the card-maker', M6: 'acceleration', M7: 'auto, the party', M8: 'the cases break', M9: 'jokers wild', M10: 'the new king', M11: 'the shim', M12: 'credits' };
export function cueTable() {
  const out = [];
  for (const s of SHOTS) { const l = out[out.length - 1]; if (l && l.id === s.cue) l.t1 = s.t1; else out.push({ id: s.cue, name: CUE_NAME[s.cue] ?? s.cue, t0: s.t0, t1: s.t1 }); }
  return out;
}

// section levels (linear), calibrated by measurement against the walls / holes in docs/SOUND.md
export const LV = { casc: 0.42, march: 1.75, seals: 1.9, climb: 2.8 };

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

// ---- the march goes out over the war room's loudspeakers: band-limited, a little torn, compressed flat
function* paChainG(L, R) {
  yield* within(eqG(L, R, () => [Biquad.hp(85, 0.7), Biquad.loshelf(160, -2.5), Biquad.lp(7000, 0.72), Biquad.lp(7000, 0.72), Biquad.peak(2300, 1.0, 3.5), Biquad.peak(1050, 0.9, 1.5), Biquad.peak(330, 0.8, -2)]), 0, 0.6);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.75 / Math.max(1e-9, pk), d = 1.9, nd = 1 / Math.tanh(d);
  for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * k * d) * nd; R[i] = Math.tanh(R[i] * k * d) * nd; }
  yield 0.7;
  return yield* within(glueG(L, R, { thr: -15, ratio: 1.8, knee: 6, att: 0.004, rel: 0.11, rms: 0.006, look: 0.002 }), 0.7, 1);
}

// ---- 7-11: heard from INSIDE a glass case: dull, boxy, a little ring of the glass, crossfaded in and out
export function glassMuffle(B, t0, t1, amt = 1) {
  const off = B.off ?? 0, a = Math.round(t0 * SR) - off, b = Math.round(t1 * SR) - off, xf = Math.round(0.012 * SR);
  const i0 = Math.max(0, a - xf - Math.round(0.15 * SR)), i1 = Math.min(B.L.length, b + xf);
  if (i1 <= i0) return;
  const mk = () => [Biquad.hp(90, 0.7), Biquad.lp(700, 0.85), Biquad.lp(700, 0.6), Biquad.peak(430, 1.3, 5)];
  const fL = mk(), fR = mk(), RING = [2350, 3420, 5100];
  const rL = RING.map((f) => new SVF(f, 45)), rR = RING.map((f) => new SVF(f, 45)), hL = new SVF(1800, 0.7), hR = new SVF(1800, 0.7);
  for (let i = i0; i < i1; i++) {
    let yl = B.L[i], yr = B.R[i];
    for (let q = 0; q < fL.length; q++) { yl = fL[q].run(yl); yr = fR[q].run(yr); }
    hL.run(B.L[i]); hR.run(B.R[i]);
    let gl = 0, gr = 0; for (let q = 0; q < 3; q++) { rL[q].run(hL.hp); rR[q].run(hR.hp); gl += rL[q].bp; gr += rR[q].bp; }
    const w = amt * (i < a ? 0 : i < a + xf ? (i - a) / xf : i < b ? 1 : i < b + xf ? 1 - (i - b) / xf : 0);
    B.L[i] += ((yl * 0.62 + gl * 0.018) - B.L[i]) * w; B.R[i] += ((yr * 0.62 + gr * 0.018) - B.R[i]) * w;
  }
}

// ---- 8-01 / 8-02: the broadcast breaks. From S the "CD" skips: it jumps back one grain (g) and
// plays it again, 4-6 times, with tiny digital dropouts; at F it sticks: one grain held (granular
// overlap-add with a little jitter), pulled into a single Bb by a comb resonance; from F2 it fades and
// darkens into nothing at E. B is the post-room broadcast (windowed {L, R, off}), rewritten from S on.
function breakPlayback(B, S, F, F2, E, o = {}) {
  const off = B.off, iS = Math.round(S * SR) - off, iF = Math.round(F * SR) - off, iF2 = Math.round(F2 * SR) - off, iE = Math.round(E * SR) - off;
  const g0 = o.grain ?? 0.12, src = Math.round(0.4 * SR), r = new Rng(o.seed ?? 5);
  const sL = B.L.slice(iS - src, iS), sR = B.R.slice(iS - src, iS);
  for (let i = iS; i < B.L.length; i++) { B.L[i] = 0; B.R[i] = 0; }
  // 1) the skip
  const fade = Math.round(0.0015 * SR), reps = [];
  let p = iS, k = 0, rms = 0, rn = 0;
  const BACK = [1, 1, 0.9, 1, 0.83, 1, 0.75], LEN = [1, 1, 0.84, 1, 0.7, 0.9, 0.6], GAIN = [1, 0.95, 1.03, 0.93, 0.98, 0.9, 0.94], GAP = [0, 0.007, 0, 0.011, 0, 0.005, 0];
  while (p < iF) {
    const back = Math.round(g0 * BACK[k % 7] * SR), gn = GAIN[k % 7];
    let len = Math.min(Math.round(g0 * LEN[k % 7] * SR), iF - p + fade);
    if (iF - (p + len) < Math.round(0.05 * SR)) len = iF - p + fade;          // the last repeat runs into the freeze (no sliver)
    for (let i = 0; i < len && p + i < B.L.length; i++) {
      const s = src - back + i; if (s < 0 || s >= src) continue;
      const w = Math.min(1, i / fade, (len - i) / fade), l = sL[s] * w * gn, rr = sR[s] * w * gn;
      B.L[p + i] += l; B.R[p + i] += rr; rms += l * l + rr * rr; rn += 2;
    }
    reps.push(+(len / SR).toFixed(3));
    p += len + Math.round(GAP[k % 7] * SR); k++;
  }
  rms = Math.sqrt(rms / Math.max(1, rn));
  // 2) the freeze: grains from just after the downbeat's attack (the band's unison Bb + the cymbal's wash)
  const n = iE - iF, gl = Math.round(0.06 * SR), hop = gl >> 2, c0 = src - Math.round(0.05 * SR), jit = Math.round(0.01 * SR);
  const fL = new Float32Array(n + gl), fR = new Float32Array(n + gl);
  for (let st = 0; st < n; st += hop) {
    const rd = c0 - (gl >> 1) + Math.round((r.next() * 2 - 1) * jit);
    for (let i = 0; i < gl; i++) { const w = 0.25 - 0.25 * Math.cos(TAU * i / gl), s = rd + i; if (s >= 0 && s < src) { fL[st + i] += sL[s] * w; fR[st + i] += sR[s] * w; } }
  }
  // one note: a feedback comb tuned to Bb2 rises over the hold (all the Bb partials ring, the rest fades)
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
    // 3) the decay: from F2 the level falls ~60 dB and the cutoff sinks from 9 kHz to 180 Hz by E
    const d = i < iF2 - iF ? 0 : (i - (iF2 - iF)) / Math.max(1, iE - iF2), fc = d > 0 ? 6000 * Math.pow(180 / 6000, smooth(d)) : 12000 * Math.pow(0.5, u);
    if ((i & 31) === 0) { lpA.set(fc, 0.6); lpB.set(fc, 0.6); lpC.set(fc, 0.6); lpD.set(fc, 0.6); }
    lpB.run(lpA.run(l)); lpD.run(lpC.run(rr)); l = lpB.lp; rr = lpD.lp;
    const lv = d > 0 ? Math.pow(10, -60 * Math.pow(d, 0.75) / 20) * (1 - smooth((d - 0.9) / 0.1)) : 1, fin = Math.min(1, i / Math.round(0.015 * SR));
    if (i < Math.round(0.2 * SR)) { e2 += l * l + rr * rr; n2 += 2; }
    if (i === Math.round(0.2 * SR)) gainFix = rms * 0.9 / Math.max(1e-9, Math.sqrt(e2 / n2));
    // the first 0.2 s are written once the level is known (below); after that, straight out
    if (i < Math.round(0.2 * SR)) { fL[i] = l * lv * fin; fR[i] = rr * lv * fin; } else out(i, l * lv * fin * gainFix, rr * lv * fin * gainFix);
  }
  const m0 = Math.min(n, Math.round(0.2 * SR)); for (let i = 0; i < m0; i++) out(i, fL[i] * gainFix, fR[i] * gainFix);
  return { reps, freezeGainDb: +(20 * Math.log10(gainFix)).toFixed(1) };
}

export const buildMusic = (C, ROW, G, N, events) => drive(buildMusicG(C, ROW, G, N, events));
export function* buildMusicG(C, ROW, G, N, events) {
  let seed = 100; const S = () => ++seed;
  const report = [], cue = (t, l) => report.push([+t.toFixed(3), 'MUSIC', l]);
  const ev = (kind, a, b) => events.filter((e) => e.kind === kind && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  const sec = { str: section(G.n, G.off), brs: section(G.n, G.off) };
  const CUT = C.launch;                                  // the reel's last frame: the cut to 9-01

  // ============================================================ M7a — AUTO, the cascade (auto .. cigars)
  const relays = ev('relay', C.auto - 0.05, C.cigars - 0.005);
  let RT = relays.map((e) => e.t);
  if (RT.length < 3) { RT = []; for (let k = 0, t = C.auto + 0.55; k < 10 && t < C.cigars - 0.05; k++, t += 1.4 * Math.pow(0.7, k)) RT.push(t); }
  const tA = RT[0], tZ = C.cigars, cr = (t) => Math.pow(clamp((t - tA) / (tZ - tA)), 1.5);
  const panOf = (k) => (relays[k]?.pan ?? 0) * 1.6;
  // the pedal: contrabasses on D1 and cellos on D2 from Claude's press: a sforzando, then it grows
  bowed(sec.str, tA, tZ - tA + 0.02, 26, 0.85, { n: 6, det: 8, accent: 0.6, att: 0.04, rel: 0.02, swell: (u) => 0.3 + 0.7 * cr(tA + u * (tZ - tA)), gain: 0.14 * LV.casc, bright: 3.2, maxCut: 1400, pan: -0.05, spread: 0.3, noise: 0.03, seed: S() });
  bowed(sec.str, tA, tZ - tA + 0.02, 38, 0.85, { n: 6, det: 9, accent: 0.7, att: 0.04, rel: 0.02, swell: (u) => 0.3 + 0.7 * cr(tA + u * (tZ - tA)), gain: 0.11 * LV.casc, bright: 4, maxCut: 2200, pan: 0.05, spread: 0.4, seed: S() });
  subTone(G, tA, tZ + 0.01, 26, (t) => 0.2 + 0.8 * cr(t), 0.09 * LV.casc);
  yield 0.03;
  for (let k = 0; k < RT.length; k++) {
    const t = RT[k];
    const u = (t - tA) / (tZ - tA), d = tZ - t + 0.02, sw = (uu) => 0.3 + 0.7 * cr(t + uu * (tZ - t));
    put(G, t, warDrum(0.5 + 0.5 * u, S(), { ring: 0.75 + 0.2 * u }), { gain: 0.8 * LV.casc, pan: panOf(k) * 0.4, send: 0.32 });
    if (k > 0) bowed(sec.str, t, d, 38 + k + (k >= 3 && k % 2 === 1 ? 12 : 0), 0.8, { n: 5, accent: 0.85, att: 0.03, rel: 0.02, swell: sw, gain: 0.1 * LV.casc, pan: panOf(k), spread: 0.3, seed: S() });
    if (k < 3) {                                          // the kings' motif, D - Eb - E: low brass, nervous
      brass(sec.brs, 'trombone', t, d, 50 + k, 0.72, { accent: 0.9, flutter: 0.2, swell: sw, rel: 0.02, n: 3, gain: 0.14 * LV.casc, pan: panOf(k) * 0.6, seed: S() });
      brass(sec.brs, 'tuba', t, d, 38 + k, 0.72, { accent: 0.6, swell: sw, rel: 0.02, gain: 0.18 * LV.casc, seed: S() });
    }
    yield 0.03 + 0.09 * (k + 1) / RT.length;
  }
  cue(tA, `M7: AUTO pressed: D pedal (basses, cellos, sub), war drum on every relay (${RT.length})`);
  cue(RT[2] ?? tA, "M7: the kings' motif D-Eb-E stated once in low brass on the first three presses; each further king adds a semitone to the string cluster");

  // ============================================================ M7b — the victory march (cigars .. crack)
  const nb = Math.max(4, Math.round((C.crack - C.cigars) / 0.5)), beat = (C.crack - C.cigars) / nb;
  const T = (p) => C.cigars + (p - (16 - nb)) * beat;  // phrase beat -> film time; phrase beat 16 = the crack
  const mOff = Math.max(0, Math.round((C.cigars - 0.35) * SR)), mN = Math.min(N, Math.round((C.float1 + 1.2) * SR)) - mOff;
  const band = section(mN, mOff), pL = new Float32Array(mN), pR = new Float32Array(mN);
  const rh = new Rng(S()), jit = () => rh.range(-0.004, 0.004);
  // flat, but not dead: bars 3-4 brag, the Gb / E-flat-minor bars sink a little, bar 8 climbs to the crack
  const BARDYN = [0.82, 0.78, 1.0, 0.76, 0.76, 1.0, 0.8, 1.0, 1.0], DYN = (p) => (p < 0.5 ? 1 : BARDYN[clamp(Math.floor(p / 2), 0, 8)]);   // the entry downbeat: full blast
  const NOTE = (kind, p, d, m, v, o = {}) => { if (T(p) < C.cigars - 1e-6) return; const art = d <= 0.26 ? 0.72 : d <= 0.5 ? 0.82 : 0.9; brass(band, kind, T(p) + jit(), d * beat * art, m, v * DYN(p), { rel: 0.14, ...o, seed: S() }); };
  const PERC = (t, sig, g = 1, pan = 0) => { const s0 = Math.round(t * SR) - mOff, [gl, gr] = panGains(pan); for (let i = Math.max(0, -s0); i < sig.length && s0 + i < mN; i++) { pL[s0 + i] += sig[i] * g * gl; pR[s0 + i] += sig[i] * g * gr; } };
  // the tune (cornets + trumpets, euphoniums an octave under); [phrase beat, midi, beats]
  const MEL = [[0, 70, 1], [1, 77, 0.75], [1.75, 74, 0.25], [2, 70, 0.5], [2.5, 74, 0.5], [3, 77, 1], [4, 82, 1.5], [5.5, 84, 0.5],
    [6, 81, 1], [7, 79, 0.75], [7.75, 75, 0.25], [8, 70, 1], [9, 77, 0.75], [9.75, 74, 0.25], [10, 70, 0.5], [10.5, 74, 0.5], [11, 78, 1],
    [12, 77, 1], [13, 75, 0.5], [13.5, 73, 0.5], [14, 72, 1], [15, 68, 0.5], [15.5, 69, 0.5]];
  for (let q = 0; q < MEL.length; q++) {
    const [p, m, d] = MEL[q];
    const acc = d >= 1 || p % 1 === 0 ? 0.85 : 0.5;
    NOTE('cornet', p, d, m, 0.95, { accent: acc, pan: -0.18, tune: 7 });
    NOTE('trumpet', p, d, p >= 15 ? m + 12 : m, 0.95, { accent: acc, pan: 0.2, tune: 3 });
    NOTE('euph', p, d, m - 12, 0.9, { accent: acc * 0.7, pan: -0.08 });
    yield 0.12 + 0.13 * (q + 1) / MEL.length;
  }
  // the bass (tuba): root on the beat, a step to the next; [beat, midi, beats]
  [[0, 34], [1, 29], [2, 34], [3, 38], [4, 39], [5, 34], [6, 29], [7, 33], [8, 34], [9, 29], [10, 34], [11, 30], [12, 27], [13, 34], [14, 29]]
    .forEach(([p, m]) => NOTE('tuba', p, 0.8, m, 0.95, { accent: 0.6, pan: 0.02 }));
  NOTE('tuba', 15, 0.5, 32, 0.95, { accent: 0.6 }); NOTE('tuba', 15.5, 0.5, 33, 0.95, { accent: 0.7 });
  yield 0.28;
  // trombones: sustained, re-struck chords (pomp); [beat, beats, voicing]
  for (const [p, d, v] of [[0, 2, [46, 50, 53]], [2, 2, [46, 50, 53]], [4, 2, [46, 51, 55]], [6, 2, [45, 51, 53]], [8, 2, [46, 50, 53]], [10, 1, [46, 50, 53]], [11, 1, [46, 49, 54]],
    [12, 2, [46, 51, 54]], [14, 1, [45, 51, 53]]]) { v.forEach((m, i) => NOTE('trombone', p, d, m, 0.9, { accent: 0.75, pan: 0.15 + 0.1 * i })); yield undefined; }
  yield 0.33;
  // horns on the after-beats
  const HARM = (p) => (p < 4 ? [53, 58, 62] : p < 6 ? [55, 58, 63] : p < 8 ? [53, 57, 63] : p < 11 ? [53, 58, 62] : p < 12 ? [54, 58, 61] : p < 14 ? [54, 58, 63] : [53, 57, 63]);
  for (let p = 0.5; p < 15; p += 1) if (p < 12 || p > 14) HARM(p).forEach((m, i) => NOTE('horn', p, 0.32, m, 0.82, { accent: 0.4, pan: -0.32 + 0.06 * i }));   // bar 7: the after-beats fall silent
  yield 0.37;
  // bar 8, beat 2: the whole band in unison on the kings' motif, Ab - A -> Bb (the crack)
  [[15, 0], [15.5, 1]].forEach(([p, k]) => {
    [56, 44].forEach((m) => NOTE('horn', p, 0.5, m + k, 0.95, { accent: 0.9, pan: -0.3 }));
    [44, 32].forEach((m) => NOTE('trombone', p, 0.5, m + k, 0.95, { accent: 0.9, pan: 0.25 }));
  });
  // bar 9 downbeat, on the crack: Bb in every octave, fff (the CD will stick on it)
  const BB = 16, bbD = 2;
  NOTE('cornet', BB, bbD, 70, 1, { accent: 1, pan: -0.18, tune: 7 }); NOTE('trumpet', BB, bbD, 82, 1, { accent: 1, pan: 0.2, tune: 3 });
  NOTE('euph', BB, bbD, 58, 1, { accent: 1 }); NOTE('horn', BB, bbD, 58, 1, { accent: 1, pan: -0.3 }); NOTE('horn', BB, bbD, 46, 1, { accent: 1, pan: -0.25 });
  NOTE('trombone', BB, bbD, 46, 1, { accent: 1, pan: 0.25 }); NOTE('trombone', BB, bbD, 34, 1, { accent: 1, pan: 0.3 }); NOTE('tuba', BB, bbD, 34, 1, { accent: 1 });
  yield 0.4;
  // percussion: bass drum on every beat, clash cymbals on every downbeat, a field-drum street beat
  for (let p = 0; p <= 16; p++) { if (T(p) >= C.cigars - 1e-6) PERC(T(p), bassDrum((p % 2 ? 0.78 : 1) * DYN(p), S(), { ring: 0.3 }), p === 16 ? 1.25 : 1, 0); if (p % 4 === 3) yield undefined; }
  for (let p = 0; p <= 16; p += 2) { if (T(p) >= C.cigars - 1e-6 && p !== 12) { const big = p % 4 === 0; PERC(T(p) + 0.003, crash((big ? 0.95 : 0.6) * DYN(p), S(), big ? 1.7 : 0.9), p === 16 ? 1.3 : big ? 1 : 0.8, -0.12); } yield undefined; }
  const SN_A = [[0, 1, 1], [0.5, 0.42], [0.75, 0.4], [1, 0.92], [1.25, 0.4], [1.5, 0.5, 0, 1], [1.75, 0.95]];
  const SN_B = [[0, 1], [0.25, 0.36], [0.5, 0.42], [0.75, 0.36], [1, 0.9, 1], [1.5, 0.42], [1.75, 0.46]];
  const hitS = (t, v, flam) => { if (t < C.cigars - 1e-6) return; v *= DYN((t - C.cigars) / beat + 16 - nb); if (flam) PERC(t - 0.024, snare(v * 0.32, S()), 1, 0.12); PERC(t, snare(v, S()), 1, 0.12); };
  for (let bar = 0; bar < 7; bar++) {
    (bar % 2 ? SN_B : SN_A).forEach(([x, v, flam, roll]) => {
      const p = bar * 2 + x;
      if (roll) for (let q = 0; q < 4; q++) hitS(T(p) + q * beat / 16, v * (0.55 + 0.1 * q)); else hitS(T(p), v, flam);
    });
    yield undefined;
  }
  hitS(T(14), 1); hitS(T(14.5), 0.45); hitS(T(14.75), 0.5);
  for (let q = 0; q < 16; q++) hitS(T(15) + q * beat / 16, 0.45 + 0.5 * q / 15);               // the roll into the crack
  yield undefined;
  hitS(T(16), 1.1, 1);
  for (let p = 16 - nb; p < 0; p += 0.125) hitS(T(p), 0.5 + 0.4 * (p - 16 + nb) / Math.max(1, nb - 16)); // (only if the shot ever grows: a roll-off)
  yield 0.47;
  // mix the band, broadcast it, and put it in the stone room
  for (let i = 0; i < mN; i++) { band.L[i] += pL[i] * 0.95; band.R[i] += pR[i] * 0.95; }
  const paGr = yield* within(paChainG(band.L, band.R), 0.47, 0.55);
  const sendL = new Float32Array(mN), sendR = new Float32Array(mN);
  for (let i = 0; i < mN; i++) { sendL[i] = band.L[i] * 0.55; sendR[i] = band.R[i] * 0.55; }
  yield undefined;
  yield* within(fdnReverbG(sendL, sendR, band.L, band.R, { rt60: 2.7, damp: 4000, size: 1.5, pre: 0.035, lo: 150, wet: 1, width: 1 }), 0.55, 0.66);
  for (let i = 0; i < mN; i++) { band.L[i] *= LV.march; band.R[i] *= LV.march; }
  cue(C.cigars, `M7: the victory march enters on the cut: Bb major, 2/4, ${nb} beats of ${beat.toFixed(4)} s (${(60 / beat).toFixed(1)} bpm), beat 16 = the crack; PA chain GR ${paGr.toFixed(1)} dB`);
  cue(T(10), 'M7: bar 6: the march lurches to the flat sixth (Gb), bar 7 sinks into E-flat minor');
  cue(T(15), "M7: the band in unison on the kings' motif Ab-A -> Bb");
  // 7-11: from inside the glass case
  glassMuffle(band, C.pov, C.crack);
  cue(C.pov, 'M7: heard from inside the glass case (muffled, boxy, the glass ringing faintly)');
  // 8-01 .. 8-02: the broadcast breaks
  const F2 = C.freeze + 0.5 * (C.float1 - C.freeze);
  const brk = breakPlayback(band, C.skip, C.freeze, F2, C.float1, { grain: 0.12, note: 46, seed: S() });
  yield 0.7;
  cue(C.skip, `M8: the march skips like a scratched CD on the crack's downbeat: ${brk.reps.length} repeats (${brk.reps.join(', ')} s)`);
  cue(C.freeze, `M8: it sticks: one grain held, pulled into a single Bb (freeze ${brk.freezeGainDb} dB), from ${F2.toFixed(2)} it darkens and dies into the hole at ${C.float1.toFixed(2)}`);

  // ============================================================ M8 — the seals (8-07): low brass falls with the chains
  const chains = ev('chains', C.seals - 0.2, C.rise), tS = chains.length ? chains[0].t : C.seals;
  const dS = chains.length ? Math.max(...chains.map((e) => e.dur || 0.5)) : 0.55;
  const strains = ev('strain', C.seals, C.rise), tC0 = strains.length ? strains[0].t : tS + 0.6;
  const FALL = [52, 50, 48, 46], st = dS / FALL.length, holdEnd = tC0 + 0.9;
  for (let i = 0; i < FALL.length; i++) {
    const m = FALL[i];
    const t = tS + i * st, last = i === FALL.length - 1, d = last ? holdEnd - t : st * 0.9, rel = last ? 0.45 : 0.05;
    const sw = last ? (u) => 1 - 0.9 * smooth((u - 0.3) * 1.5) : undefined;
    brass(sec.brs, 'trombone', t, d, m, 0.95, { accent: 0.95, rel, swell: sw, n: 4, gain: 0.14 * LV.seals, pan: -0.15, seed: S() });
    brass(sec.brs, 'trombone', t, d, m - 12, 0.95, { accent: 0.95, rel, swell: sw, n: 3, gain: 0.13 * LV.seals, pan: 0.15, seed: S() });
    brass(sec.brs, 'horn', t, d, m + 12, 0.9, { accent: 0.8, rel, swell: sw, gain: 0.12 * LV.seals, seed: S() });
    brass(sec.brs, 'tuba', t, d, m - 12, 0.95, { accent: 0.7, rel, swell: sw, gain: 0.25 * LV.seals, seed: S() });
    yield 0.7 + 0.06 * (i + 1) / FALL.length;
  }
  put(G, tS, warDrum(0.9, S(), { ring: 1.15 }), { gain: 1.1, send: 0.42 });
  yield undefined;
  put(G, tS + dS, timpani(46, 0.7, S(), 1.1), { gain: 0.3 * LV.seals, send: 0.35 });   // the chains catch (their own jolt is the hit)
  cue(tS, 'M8: the seals drop: a whole-tone fall E-D-C-Bb in low brass with the chains, war drum; the held Bb is swallowed by the storm');

  // ============================================================ M8 — the climb (8-07 strain .. 8-08 end): cut dead at the cut
  const steps = []; { let t = tC0, d = 0.42; while (t + d < CUT - 0.04) { t += d; steps.push(t); d = Math.max(0.1, d * 0.91); } }
  const climb = (t0) => (tt) => { const t = t0 + tt; let k = 0; while (k < steps.length && steps[k] <= t) k++; return k; };
  const cr8 = (t) => Math.pow(clamp((t - tC0) / (CUT - tC0)), 1.6);
  const sw8 = (t0) => (u) => 0.06 + 0.94 * cr8(t0 + u * (CUT - t0));
  for (const [m, who, pan] of [[40, 'vc', -0.25], [41, 'vc', 0.25], [42, 'vc', -0.1], [43, 'vc', 0.1], [28, 'cb', -0.05], [29, 'cb', 0.05]]) {
    bowed(sec.str, tC0, CUT - tC0 + 0.01, m, 0.92, { n: who === 'cb' ? 5 : 6, trem: who === 'cb' ? 12 : 14, pm: climb(tC0), swell: sw8(tC0), att: 0.3, rel: 0.01, pont: who === 'cb' ? 0.15 : 0.42, gain: (who === 'cb' ? 0.15 : 0.17) * LV.climb, bright: 6, maxCut: 6000, pan, spread: 0.35, seed: S() });
    yield undefined;
  }
  yield 0.86;
  for (const [m, pan] of [[52, -0.35], [53, 0.35], [54, 0]]) {
    bowed(sec.str, C.rise, CUT - C.rise + 0.01, m, 0.92, { n: 5, trem: 16, pm: climb(C.rise), swell: sw8(C.rise), att: 0.2, rel: 0.01, pont: 0.5, gain: 0.2 * LV.climb, bright: 6, maxCut: 7000, pan, spread: 0.4, seed: S() });
    yield undefined;
  }
  yield 0.92;
  // a war-drum roll (unpitched, so nothing anchors the climbing cluster), alternating hands, crescendo
  for (let t = C.rise, q = 0; t < CUT - 0.03; t += 1 / 13, q++) { put(G, t, warDrum(0.2 + 0.8 * cr8(t), S(), { ring: 0.22, f: q % 2 ? 58 : 52 }), { gain: 0.32 * LV.climb, pan: q % 2 ? 0.15 : -0.15, send: 0.3 }); if (q % 6 === 5) yield undefined; }
  yield undefined;
  put(G, CUT - 2.0, cymbalSwell(2.0, 0.6, 0.9, S()), { gain: 1 * LV.climb, pan: 0.1, send: 0.4 });
  yield undefined;
  subTone(G, tC0, CUT + 0.01, 28, (t) => cr8(t), 0.09 * LV.climb, (t) => climb(tC0)(t - tC0));
  cue(tC0, `M8: low string tremolo cluster (E1-F1, E2-G2) climbs chromatically: ${steps.length} semitone steps, ${(steps[1] - steps[0]).toFixed(2)} -> ${(steps[steps.length - 1] - steps[steps.length - 2]).toFixed(2)} s`);
  cue(C.rise, 'M8: violas join the climb (sul ponticello); a war-drum roll; a cymbal swell peaks on the cut');
  cue(CUT, 'M8: CUT DEAD on the cut to 9-01 (no tail)');

  yield 0.97;
  // ---------------------------------------------------------- render sections into the music group
  put2(G, null, sec.str, { gain: 1, send: 0.36 });
  put2(G, null, sec.brs, { gain: 1, send: 0.32 });
  // where the music group must be truly silent (carved after its room by audio.js)
  const gaps = [
    [tZ, tS - 0.03, -90, 0.004, 0.02, 'the march takes over: the power layer is cut dead on the cigars cut'],
    [CUT, CUT + 8, -90, 0.003, 0.003, 'cut dead on the cut to 9-01'],
  ];
  return { report, gaps, march: band, cut: CUT };
}

// ================================================================ the rest of the film (M1 .. M6, M9, M10)
// A kit of players writing into one chunk's (windowed) music group and its sections. Every cue has its own
// seed base, so editing one cue never changes the noise of another.
// With a queue Q the kit is DEFERRED: every call takes its seed at once (so the seeds are those of a
// straight run) and queues the note; scoreCueG then plays the queue in order, one note per step.
// k.do(fn) queues any direct work on a section (it runs after the notes queued before it).
function makeKit(G, seedBase, Q = null) {
  let seed = seedBase; const S = () => ++seed;
  const mk = () => section(G.n, G.off), sec = { str: mk(), brs: mk() }, extra = [];
  const L = (x) => [].concat(x), q = Q ? (f) => { Q.push(f); } : (f) => { const r = f(); if (r && typeof r.next === 'function') drive(r); };
  return {
    G, sec, S, extra, newSec: mk, do: q,
    BR: (kind, t, d, ms, v, o = {}) => L(ms).forEach((m, i) => { const sd = S(); q(() => brass(o.sec ?? sec.brs, kind, t + i * 0.004, d, m, v, { ...o, seed: sd })); }),
    ST: (t, d, ms, v, o = {}) => L(ms).forEach((m) => { const sd = S(); q(() => bowed(o.sec ?? sec.str, t, d, m, v, { ...o, seed: sd })); }),
    CARD: (t, d, m, v, o = {}) => { const sd = S(); q(() => cardTone(o.sec ?? sec.brs, t, d, m, v, { ...o, seed: sd })); },
    DRUM: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, warDrum(v, sd, o), { gain: o.gain ?? 0.9, pan: o.pan ?? 0, send: o.send ?? 0.35 })); },
    TIMP: (t, m, v, ring = 1, o = {}) => { const sd = S(); q(() => put(G, t, timpani(m, v, sd, ring), { gain: o.gain ?? 0.7, pan: o.pan ?? -0.1, send: 0.35 })); },
    CRASH: (t, v, ring = 2.4, o = {}) => { const sd = S(); q(() => put(G, t, crash(v, sd, ring), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.15, send: 0.4 })); },
    SWELL: (tPeak, rise, ring, v, o = {}) => { const sd = S(); q(() => put(G, tPeak - rise, cymbalSwell(rise, ring, v, sd), { gain: o.gain ?? 1, pan: o.pan ?? 0.1, send: 0.4 })); },
    SNARE: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, snare(v, sd), { gain: o.gain ?? 0.8, pan: o.pan ?? 0.1, send: 0.2 })); },
    BD: (t, v, o = {}) => { const sd = S(); q(() => put(G, t, bassDrum(v, sd, o), { gain: o.gain ?? 0.9, send: 0.25 })); },
    SUB: (t0, t1, m, lvl, gain, glide) => q(() => subTone(G, t0, t1, m, lvl, gain, glide)),
    flush() { put2(G, null, sec.str, { send: 0.36 }); put2(G, null, sec.brs, { send: 0.32 }); for (const [x, send] of extra) put2(G, null, x, { send }); },
  };
}
const fadeOut = (u) => 1 - 0.75 * smooth(u);
const cresc = (u) => u * u * (3 - 2 * u);

// every scorer: (kit, C, ROW, ev, cue) -> gaps [[t0, t1, db, rampIn, rampOut, label]] carved after the room
export const SCORE = {
  // M1 0:00-0:24.6 — the world, the weight: a chromatic cluster from nothing; under the title one low brass note
  M1(k, C, ROW, ev, cue) {
    const t0 = ROW['1-03'].t0, tFull = ROW['1-04'].t0, tDim = ROW['1-06'].t0, tT = C.title, cl = k.newSec();
    const grow = (t) => cresc(clamp((t - t0) / (tFull - t0))) * (t < tDim ? 1 : 1 - 0.65 * smooth((t - tDim) / (tT - tDim)));
    [[33, 0.13, -0.25], [34, 0.13, 0.05], [35, 0.13, 0.3], [45, 0.09, -0.3], [46, 0.09, 0], [47, 0.09, 0.3]].forEach(([m, g, pan], i) => {
      const ts = t0 + i * 0.4, dd = tT - ts;
      k.ST(ts, dd, m, 0.75, { sec: cl, n: 5, att: 2.5, rel: 0.3, swell: (u) => 0.02 + 0.98 * grow(ts + u * dd), gain: g, bright: 3.2, maxCut: 2400, pan, spread: 0.3, vib: 3, noise: 0.05 });
    });
    // the cluster opens slowly (low-pass 250 Hz -> 1.6 kHz across the long take), then is pressed down
    k.do(() => sweepLPG(cl.L, cl.R, (t) => 250 * Math.pow(6.4, cresc(clamp((t - t0) / (tFull - t0)))) * (t < tDim ? 1 : 1 - 0.5 * smooth((t - tDim) / (tT - tDim))), cl.off, 0.6));
    k.extra.push([cl, 0.4]);
    // the title: the strings are gone; one long low brass A presses on a war drum, then dies into the hum
    const hold = Math.max(1.5, Math.min(3.4, ROW['1-07'].t1 - tT - 0.4));
    k.BR('tuba', tT, hold, 33, 0.85, { accent: 0.7, att: 0.06, rel: 0.7, swell: fadeOut, gain: 0.2 });
    k.BR('trombone', tT, hold, [45, 45], 0.82, { n: 4, accent: 0.8, att: 0.06, rel: 0.7, swell: fadeOut, pan: 0.1, gain: 0.088 });
    k.BR('horn', tT + 0.02, hold - 0.1, 57, 0.7, { accent: 0.5, att: 0.1, rel: 0.7, swell: fadeOut, pan: -0.15 });
    k.DRUM(tT, 0.95, { f: 44, ring: 1.3, gain: 1.0 });
    k.SUB(tT, tT + hold + 0.6, 33, (t) => Math.exp(-(t - tT) / 1.4), 0.12);
    cue(t0, 'M1: a chromatic cluster A-Bb-B (basses, cellos) grows from nothing across the long take, opening slowly');
    cue(tT, 'M1: the title: strings out, one long low brass A over a war drum');
    return [];
  },

  // M2 0:24.6-0:46.7 — the duel: the kings' motif a semitone higher every hand (the drums are the slams);
  // the jam: stuck on one chord; an empty beat; the double slam with a crash
  M2(k, C, ROW, ev, cue) {
    const gaps = [], RAISE = ['2-01', '2-04', '2-06', '2-08', '2-10', '2-12', '2-14', '2-16'].filter((id) => ROW[id]);
    const slams = ev('slam', C.raise, C.jam);
    RAISE.forEach((id, h) => {
      const t = ROW[id].t0, d = ROW[id].t1 - t, s = clamp(d * 0.26, 0.09, 0.42);
      const land = slams.find((e) => e.t > t + 0.05)?.t ?? ROW[id].t1 + 0.05;
      const m0 = 45 + h, v = 0.68 + 0.035 * h, hold = Math.max(0.2, land + 0.3 - (t + 2 * s));
      [0, 1, 2].forEach((j) => {
        const tj = t + j * s, dj = j < 2 ? s * 0.92 : hold, sw = j < 2 ? undefined : (u) => 0.5 + 0.5 * u;
        k.BR('trombone', tj, dj, m0 + j, v, { n: 4, accent: 0.85, att: 0.03, rel: 0.12, swell: sw, pan: h % 2 ? 0.2 : -0.2 });
        k.BR('tuba', tj, dj, m0 + j - 12, v, { accent: 0.6, att: 0.025, rel: 0.12, swell: sw });
        if (h >= 3) k.BR('horn', tj, dj, m0 + j + 12, v * 0.9, { accent: 0.7, rel: 0.12, swell: sw, pan: h % 2 ? -0.25 : 0.25 });
        if (h >= 6) k.BR('trumpet', tj, dj, m0 + j + 24, v * 0.85, { accent: 0.8, rel: 0.1, swell: sw });
      });
      const next = RAISE[h + 1] ? ROW[RAISE[h + 1]].t0 : ROW['2-17']?.t0 ?? C.jam;
      k.ST(t, next - t + 0.05, [m0 - 12, m0 - 24], 0.6 + 0.04 * h, { n: 5, trem: 12, att: 0.08, rel: 0.1, gain: 0.08, pont: 0.2 });
    });
    const lastM = 45 + RAISE.length - 1, b0 = ROW['2-17'] ? ROW['2-17'].t0 : C.jam - 1.9;
    // 2-17 .. 2-18: the build: tremolo strings on the last motif, crescendo, a timpani roll
    k.ST(b0, C.jam - b0, [lastM - 12, lastM, lastM + 1, lastM + 2], 0.85, { n: 5, trem: 14, att: 0.2, rel: 0.02, swell: cresc, gain: 0.09, pont: 0.3 });
    for (let t = b0; t < C.jam - 0.02; t += 1 / 14) k.TIMP(t, lastM - 12, 0.15 + 0.6 * (t - b0) / (C.jam - b0), 0.3, { gain: 0.5 });
    // 2-19 the jam: the band stuck on one chord, re-struck ~11 times a second, slightly uneven
    const jEnd = ROW['2-19'].t1, chord = [lastM - 24, lastM - 12, lastM - 5, lastM, lastM + 1, lastM + 2];
    for (let t = C.jam, q = 0; t < jEnd - 0.05; t += 0.09 * (q % 3 === 2 ? 1.18 : 0.94), q++) {
      const v = 0.85 + 0.15 * (t - C.jam) / (jEnd - C.jam);
      chord.forEach((m, i) => k.BR(i < 2 ? 'tuba' : 'trombone', t, 0.06, m, v, { n: 2, accent: 1, att: 0.006, rel: 0.04, gain: i < 2 ? 0.45 : 0.19 }));
      k.BR('horn', t, 0.06, [lastM + 12, lastM + 13], v * 0.9, { n: 2, accent: 1, att: 0.006, rel: 0.04, gain: 0.155 });
    }
    k.ST(C.jam, jEnd - C.jam, chord.slice(1), 0.95, { n: 5, trem: 11, att: 0.01, rel: 0.02, gain: 0.16, pont: 0.4 });
    const tD = ROW['2-21'] ? ROW['2-21'].t0 : jEnd + 0.8;
    gaps.push([jEnd, tD - 0.004, -90, 0.003, 0.003, 'the empty beat before the double slam (2-20)']);
    // 2-21: the double slam: a crash, the brass a semitone higher still, falling away under the dominoes
    const m1 = lastM + 1;
    k.CRASH(tD + 0.005, 1, 2.8, { gain: 0.9 });
    [m1 - 24, m1 - 12, m1 - 5, m1, m1 + 1].forEach((m, i) => k.BR(i < 1 ? 'tuba' : 'trombone', tD, 1.6, m, 1, { accent: 1, att: 0.01, rel: 0.6, swell: (u) => 1 - 0.35 * smooth(u), gain: i < 1 ? 0.35 : 0.145 }));
    k.BR('horn', tD, 1.5, [m1 + 12, m1 + 13], 0.95, { accent: 1, rel: 0.6, swell: (u) => 1 - 0.7 * smooth(u) });
    k.TIMP(tD, m1 - 12, 1, 1.2);
    cue(C.raise, `M2: the kings' motif a semitone higher every hand: ${RAISE.length} hands, A-Bb-B up to ${['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F'][RAISE.length - 1]}; the drums are the slam events (${slams.length})`);
    cue(C.jam, 'M2: the jam: the band stuck on one chord, re-struck 11 times a second'); cue(tD, 'M2: the double slam: a crash, the brass a semitone higher, falling away');
    return gaps;
  },

  // M3 0:54.5-1:21 — the chokehold: the seal comes down in low brass; EMBARGO; the heart alone; the o1
  // fanfare (major, too bright, a little sour) cut dead by the tiny card; REJECTED; the kiln: the motif up
  M3(k, C, ROW, ev, cue) {
    const gaps = [], tA = ROW['3-02'].t0 - 0.5, tE = C.embargo, FALL = [43, 42, 41, 40, 39, 38], st = (tE - tA) / FALL.length;
    FALL.forEach((m, i) => { const t = tA + i * st, v = 0.6 + 0.08 * i; k.BR('trombone', t, st * 0.95, [m, m + 12], v, { n: 3, accent: 0.6, att: 0.05, rel: 0.1, gain: 0.13 + 0.013 * i }); k.BR('tuba', t, st * 0.95, m - 12, v, { accent: 0.5, rel: 0.1, gain: 0.3 }); });
    k.ST(tA, tE - tA, [31, 43], 0.7, { n: 5, trem: 13, att: 0.4, rel: 0.02, swell: cresc, gain: 0.1, pm: (tt) => -Math.min(FALL.length - 1, Math.floor(tt / st)) });
    k.SWELL(tE, tE - tA, 0.2, 0.7);
    const dEm = Math.max(0.6, ROW['3-04'].t0 - tE);
    [26, 38, 45, 50, 51].forEach((m, i) => k.BR(i ? 'trombone' : 'tuba', tE, dEm, m, 1, { accent: 1, att: 0.008, rel: 0.3, swell: (u) => 1 - 0.12 * smooth(u), gain: i ? 0.165 : 0.35 }));
    k.BR('horn', tE, dEm, [62, 63], 1, { accent: 1, rel: 0.3, gain: 0.13 });
    k.ST(tE, dEm, [38, 50, 51, 62], 1, { n: 5, accent: 1, att: 0.01, rel: 0.25, gain: 0.22, trem: 14 });
    k.CRASH(tE + 0.004, 1, 2.2); k.SUB(tE, tE + 1.4, 26, (t) => Math.exp(-(t - tE) / 0.5), 0.14);
    gaps.push([ROW['3-04'].t0 + 0.06, C.boast - 0.003, -90, 0.08, 0.003, 'only the heartbeat while the CN chips run out (3-04)']);
    // the o1 fanfare: D major, then a too-bright E major (Lydian), then an augmented D; trumpets a hair sharp
    const F0 = C.boast, bt = Math.min(0.5, (C.tiny - F0) / 15), T = (x) => F0 + x * bt;
    const TPT = [[0, 74, 1 / 3], [1 / 3, 74, 1 / 3], [2 / 3, 74, 1 / 3], [1, 81, 2], [3, 78, 1], [4, 76, 1 / 3], [4 + 1 / 3, 76, 1 / 3], [4 + 2 / 3, 76, 1 / 3], [5, 83, 2], [7, 80, 1],
      [8, 81, 1 / 3], [8 + 1 / 3, 81, 1 / 3], [8 + 2 / 3, 81, 1 / 3], [9, 86, 3]];
    TPT.forEach(([x, m, d]) => { const long = d >= 1; k.BR('trumpet', T(x), d * bt * (long ? 0.92 : 0.7), [m, m - 12], 0.95, { tune: 10, accent: long ? 0.9 : 0.6, rel: 0.12, pan: 0.15 }); });
    [[0, [62, 66, 69], [50, 57], 38], [4, [64, 68, 71], [52, 59], 40], [8, [62, 66, 70], [50, 58], 38]].forEach(([x, hn, tb, tu]) => {
      k.BR('horn', T(x), 4 * bt * 0.96, hn, 0.9, { accent: 0.7, rel: 0.15, pan: -0.25 }); k.BR('trombone', T(x), 4 * bt * 0.96, tb, 0.9, { accent: 0.7, rel: 0.15, pan: 0.2 });
      k.BR('tuba', T(x), 4 * bt * 0.96, tu, 0.9, { accent: 0.6, rel: 0.15 }); k.TIMP(T(x), tu, 0.9, 1);
    });
    const H = T(12), dH = C.tiny - H + 0.05;
    k.BR('trumpet', H, dH, [86, 81, 74], 1, { tune: 10, accent: 0.8, rel: 0.02 }); k.BR('horn', H, dH, [62, 66, 69, 74], 0.95, { rel: 0.02 });
    k.BR('trombone', H, dH, [50, 57, 62], 0.95, { rel: 0.02 }); k.BR('tuba', H, dH, 38, 0.95, { rel: 0.02 });
    for (let t = T(10); t < C.tiny - 0.02; t += 1 / 15) k.TIMP(t, 38, 0.3 + 0.6 * (t - T(10)) / (C.tiny - T(10)), 0.35, { gain: 0.5 });
    k.CRASH(T(0) + 0.004, 0.9, 2.4); k.CRASH(T(8) + 0.004, 0.95, 2.4); k.SWELL(H, 1.0, 0.1, 0.7);
    gaps.push([C.tiny, C.reject - 0.003, -90, 0.003, 0.003, 'the fanfare cut dead by the tiny card']);
    // REJECTED: the CN seal: brass on Bb with a tritone, a war drum, a crash
    const tR = C.reject;
    const dR = Math.max(0.6, ROW['3-12'].t0 - tR - 0.05);
    [34, 46, 53, 58, 64].forEach((m, i) => k.BR(i ? 'trombone' : 'tuba', tR, dR, m, 1, { accent: 1, att: 0.008, rel: 0.3, swell: (u) => 1 - 0.12 * smooth(u), gain: i ? 0.165 : 0.35 }));
    k.BR('horn', tR, dR, [70, 76], 0.95, { accent: 1, rel: 0.3, gain: 0.14 }); k.ST(tR, dR, [46, 52, 58, 70], 1, { n: 5, accent: 1, att: 0.01, rel: 0.25, gain: 0.22, trem: 14 });
    k.CRASH(tR + 0.004, 1, 2.2); k.DRUM(tR, 1, { f: 42, ring: 1.0, gain: 0.5 });
    // the kiln: the motif a semitone higher (F - F# - G), slow and heavy, a low string pedal under it
    const tK = ROW['3-12'].t0, dK = C.cheats - tK, sK = Math.min(0.55, dK / 4.5);
    [0, 1, 2].forEach((j) => {
      const t = tK + 0.15 + j * sK, d = j < 2 ? sK * 0.95 : C.cheats - t, sw = j < 2 ? undefined : (u) => 0.6 + 0.4 * u;
      k.BR('trombone', t, d, [53 + j, 41 + j], 0.85, { n: 4, accent: 0.8, rel: 0.25, swell: sw, gain: 0.14 }); k.BR('tuba', t, d, 29 + j, 0.85, { rel: 0.25, swell: sw, gain: 0.33 });
      k.BR('horn', t, d, 65 + j, 0.75, { rel: 0.25, swell: sw, gain: 0.125 }); k.DRUM(t, 0.6 + 0.1 * j, { f: 46, ring: 0.8, gain: 0.55 });
    });
    k.ST(tK, dK + 0.1, [29, 41], 0.7, { n: 5, trem: 12, att: 0.6, rel: 0.3, swell: cresc, gain: 0.1 });
    cue(tA, 'M3: the US seal comes down: a slow chromatic fall in low brass (ahead of the picture), cymbal swell into EMBARGO');
    cue(F0, `M3: the o1 fanfare: D, a too-bright E (Lydian), an augmented D; beat ${bt.toFixed(3)} s; held to the tiny card`);
    cue(C.tiny, 'M3: the fanfare cut dead'); cue(tR, 'M3: REJECTED: brass on Bb with a tritone'); cue(tK, "M3: the kiln: the kings' motif up a semitone, F-F#-G");
    return gaps;
  },

  // M4 1:21-1:34.05 — dirty tricks: a low spiccato ostinato (accelerating), snare; a brass stab on every
  // pointing finger; the sacks: one long sour chord that breaks off; the montage in 32nds; CUT
  M4(k, C, ROW, ev, cue) {
    const gaps = [], t0 = C.cheats, tS = C.sacks, tM = ROW['4-12'].t0, tE = C.stop;
    const G16 = []; for (let t = t0; t < tM - 0.01;) { G16.push(t); t += 0.12 * Math.pow(0.075 / 0.12, clamp((t - t0) / (tS - t0))); }
    const G32 = []; for (let t = tM; t < tE - 0.01;) { G32.push(t); t += 0.05 * Math.pow(0.6, (t - tM) / (tE - tM)); }
    const KEY = (t) => (t < C.bomb ? 0 : t < (ROW['4-07']?.t0 ?? tS) ? 1 : t < tS ? 2 : 3), PAT = [0, 0, 1, 0, 3, 0, 1, 0], sp = k.newSec();
    G16.forEach((t, i) => {
      const r = KEY(t), u = clamp((t - t0) / (tM - t0)), v = 0.65 + 0.3 * u + (i % 4 === 0 ? 0.1 : 0);
      k.ST(t, 0.055, 40 + r + PAT[i % 8], v, { sec: sp, n: 4, att: 0.004, rel: 0.05, accent: 1, gain: 0.11, bright: 5, vib: 0, pan: -0.1, spread: 0.3 });
      if (i % 4 === 0) k.ST(t, 0.07, 28 + r, v, { sec: sp, n: 4, att: 0.004, rel: 0.06, accent: 1, gain: 0.14, bright: 4, vib: 0, pan: 0.1 });
    });
    G32.forEach((t, i) => {
      const v = 0.9 + 0.1 * (t - tM) / (tE - tM);
      k.ST(t, 0.035, 44 + PAT[i % 8], v, { sec: sp, n: 4, att: 0.003, rel: 0.035, accent: 1, gain: 0.18, bright: 5.5, vib: 0 });
      if (i % 4 === 0) { k.ST(t, 0.05, 32, v, { sec: sp, n: 4, att: 0.003, rel: 0.04, accent: 1, gain: 0.22, vib: 0 }); k.DRUM(t, 0.6 + 0.3 * (t - tM) / (tE - tM), { f: 50, ring: 0.25, gain: 0.7, pan: i % 8 ? 0.25 : -0.25 }); }
    });
    k.extra.push([sp, 0.25]);
    G16.forEach((t, i) => { const u = clamp((t - t0) / (tM - t0)); if (i % 4 === 0) k.SNARE(t, 0.35 + 0.5 * u, { gain: 0.6 }); else if (u > 0.4 && i % 2 === 0) k.SNARE(t, 0.2 + 0.25 * u, { gain: 0.5 }); });
    G32.forEach((t) => k.SNARE(t, 0.45 + 0.5 * (t - tM) / (tE - tM), { gain: 0.95 }));
    if (ROW['4-03']) k.BD(ROW['4-03'].t0 + 0.85, 0.9, { ring: 0.5, gain: 0.8 });
    k.DRUM(C.bomb, 0.9, { f: 46, ring: 0.9, gain: 0.8 }); k.CRASH(C.bomb + 0.004, 0.7, 1.8, { gain: 0.6 });
    let P = ev('point', (ROW['4-05']?.t0 ?? tS - 3) - 0.05, tS - 0.05).map((e) => [e.t, e.pan ?? 0]);
    if (!P.length) P = ['4-05', '4-06', '4-07', '4-08', '4-09', '4-10'].filter((id) => ROW[id]).map((id, i) => [ROW[id].t0 + 0.05, i % 2 ? -0.5 : 0.5]);
    P.forEach(([t, pan], j) => {
      const b = 52 + j, ch = [b - 12, b - 6, b, b + 1, b + 6, b + 13], o = { accent: 1, att: 0.006, rel: 0.12, pan: pan * 0.6 };
      k.BR('trombone', t, 0.16, ch.slice(0, 3), 1, o); k.BR('horn', t, 0.16, ch.slice(2, 5), 1, o); k.BR('trumpet', t, 0.14, ch[5], 0.95, { ...o, tune: 8 });
    });
    const ac = k.newSec(), dS = tM - tS;
    [[28, 'tuba'], [35, 'tuba'], [41, 'trombone'], [46, 'trombone'], [52, 'trombone'], [53, 'horn'], [57, 'horn'], [63, 'horn'], [68, 'trumpet'], [74, 'trumpet']].forEach(([m, kind], i) =>
      k.BR(kind, tS + 0.012 * i, dS - 0.012 * i, m, 0.95, { sec: ac, att: 0.15, rel: 0.03, swell: (u) => 0.45 + 0.55 * u, tune: kind === 'trumpet' ? 12 : 0 }));
    k.extra.push([ac, 0.3]);
    gaps.push([tE, ROW['5-01'].t0 + 0.4, -90, 0.003, 0.05, "cut to silence on the card-maker's face (4-13)"]);
    cue(t0, `M4: low spiccato ostinato in E (16ths ${(G16[1] - G16[0]).toFixed(3)} -> ${(G16[G16.length - 1] - G16[G16.length - 2]).toFixed(3)} s), snare`);
    cue(P[0]?.[0] ?? tS, `M4: a dissonant brass stab on every pointing finger (${P.length}), each a semitone higher`);
    cue(tS, 'M4: the sacks: every brass in one long sour chord, then it breaks off'); cue(tM, 'M4: the montage: spiccato in 32nds, a snare roll'); cue(tE, 'M4: CUT to the heartbeat');
    return gaps;
  },

  // M5 1:34-1:49 — the card-maker: one double bass holds a long A under the heart; it falls a minor second
  // when the two card-makers look at each other
  M5(k, C, ROW, ev, cue) {
    const t0 = ROW['5-01'].t0 + 0.6, tL = C.look, t1 = C.rush, db = k.newSec();
    k.ST(t0, t1 - t0, 33, 0.55, { sec: db, n: 2, det: 3, att: 1.6, rel: 0.4, gain: 0.026, bright: 2.6, maxCut: 1600, vib: 6, noise: 0.07, pan: 0.05, spread: 0.1,
      pm: (tt) => -smooth((t0 + tt - tL) / 0.45),
      swell: (u) => { const t = t0 + u * (t1 - t0); return 0.55 + 0.25 * Math.sin(Math.PI * clamp((t - t0) / (tL - t0))) + 0.2 * smooth((t - C.levers) / 1.2); } });
    k.extra.push([db, 0.45]);
    cue(t0, 'M5: a solo double bass holds a long A (sul tasto) under the heart'); cue(tL, 'M5: the bass falls a minor second (A -> Ab): the two card-makers look at each other');
    return [];
  },

  // M6 1:49-2:00.45 — acceleration: war drums in sixteenths, the low brass climbing one step per thing fed to
  // the hopper; the music steps aside for the card-maker; the approvals build; cut dead into 6-10
  M6(k, C, ROW, ev, cue) {
    const gaps = [], t0 = C.rush, tMG = ROW['6-02'].t0, tFed = C.fed, tAp = C.approve, tB = C.button;
    k.ST(t0, tFed - t0, [31, 43], 0.75, { n: 5, trem: 13, att: 0.4, rel: 0.05, swell: (u) => 0.4 + 0.6 * u, gain: 0.1, pont: 0.25 });
    for (let t = tMG, q = 0; t < tFed - 0.02; t += 0.1, q++) { const u = (t - tMG) / (tFed - tMG); k.DRUM(t, 0.66 + 0.16 * u + (q % 4 === 0 ? 0.16 : 0), { f: q % 2 ? 58 : 50, ring: 0.25, gain: 0.55, pan: q % 2 ? 0.25 : -0.25 }); }
    const STEPS = ['6-04', '6-05', '6-06', '6-07'].filter((id) => ROW[id]);
    // 6-02: the machine-gun hand is a wall from its first frame: the low brass bursts in on F# (a step under
    // the climb) with a war drum and a crash, held and growing through the multiplier (6-03)
    const dS = (STEPS.length ? ROW[STEPS[0]].t0 : tFed) - tMG;
    k.BR('trombone', tMG, dS, [42, 49], 0.92, { n: 4, accent: 1, att: 0.01, rel: 0.1, swell: (u) => 0.8 + 0.2 * u });
    k.BR('tuba', tMG, dS, 30, 0.92, { accent: 0.9, rel: 0.1 });
    k.BR('horn', tMG, dS, [54, 55], 0.85, { accent: 0.9, rel: 0.1, swell: (u) => 0.85 + 0.15 * u });
    k.DRUM(tMG, 1, { f: 44, ring: 1.0, gain: 0.8 }); k.CRASH(tMG + 0.004, 0.85, 2);
    STEPS.forEach((id, j) => {
      const t = ROW[id].t0, d = (STEPS[j + 1] ? ROW[STEPS[j + 1]].t0 : tFed) - t, m = 43 + j, v = 0.86 + 0.045 * j;
      k.BR('trombone', t, d, [m, m + 7], v, { n: 4, accent: 0.9, rel: 0.1, swell: (u) => 0.7 + 0.3 * u });
      k.BR('tuba', t, d, m - 12, v, { accent: 0.8, rel: 0.1 });
      k.BR('horn', t, d, [m + 12, m + 13], v * (j ? 0.9 : 0.8), { accent: 0.8, rel: 0.1 });
      if (j >= 2) k.BR('trumpet', t, d, m + 24, v * 0.85, { accent: 0.8, rel: 0.1, tune: 6 });
      k.DRUM(t, 1, { f: 42 - 2 * j, ring: 1.0, gain: 0.8 }); if (j === STEPS.length - 1) k.CRASH(t + 0.004, 0.9, 2);
    });
    gaps.push([tFed, tAp - 0.003, -90, 0.05, 0.003, 'the music steps aside: the card-maker fed to the hopper']);
    k.ST(tAp, tB - tAp + 0.02, [35, 47, 48], 0.9, { n: 5, trem: 15, att: 0.2, rel: 0.01, swell: cresc, gain: 0.11, pont: 0.35 });
    k.BR('trombone', tAp, tB - tAp + 0.02, [47, 48], 0.8, { n: 4, att: 0.3, rel: 0.01, swell: cresc });
    for (let t = tAp; t < tB - 0.02; t += 1 / 16) k.DRUM(t, 0.2 + 0.6 * (t - tAp) / (tB - tAp), { f: 52, ring: 0.2, gain: 0.45 });
    gaps.push([tB, tB + 6, -90, 0.003, 0.003, 'the stamps stop: cut dead into 6-10']);
    cue(t0, 'M6: tremolo strings'); cue(tMG, 'M6: the machine-gun hand: war drums in sixteenths, low brass bursts in on F# with a crash (a wall from 6-02)'); cue(ROW[STEPS[0]].t0, `M6: the low brass climbs one step per thing fed to the hopper (${STEPS.length})`);
    cue(tFed, 'M6: the music steps aside (paper, the skipped heartbeat)'); cue(tAp, 'M6: the approvals: strings, brass, a drum roll build; cut dead at 6-10');
    return gaps;
  },

  // M9 2:27.97-2:42.6 — jokers wild: the strings fly up; three noise walls between the master's digital
  // gates; nothing; the sub swells 0.7 s before the flash; the bomb; an open E held over the wave
  M9(k, C, ROW, ev, cue) {
    const t0 = C.launch, d1 = ROW['9-01'].t1 - t0 + 0.02;
    [[43, -0.3], [44, 0.3], [55, -0.3], [56, 0.3], [67, -0.3], [68, 0.3]].forEach(([m, pan]) =>
      k.ST(t0, d1, m, 0.95, { n: 5, trem: 15, att: 0.05, rel: 0.01, gain: 0.12, bright: 6, pont: 0.4, pm: (tt) => 14 * cresc(clamp(tt / d1)), swell: (u) => 0.5 + 0.5 * u, pan }));
    const WALLS = ['9-03', '9-05', '9-07'].filter((id) => ROW[id]);
    WALLS.forEach((id, j) => {
      const t = ROW[id].t0, d = ROW[id].t1 - t + 0.01, b = 57 + 2 * j;
      k.ST(t, d, [b - 24, b - 12, b, b + 1, b + 2, b + 12, b + 13], 1, { n: 5, trem: 16, att: 0.004, rel: 0.01, accent: 1, gain: 0.19, bright: 6, pont: 0.5 });
      k.BR('trombone', t, d, [b - 12, b - 11], 1, { accent: 1, att: 0.006, rel: 0.01, gain: 0.19 });
      for (let tt = t, q = 0; tt < t + d - 0.02; tt += 1 / 20, q++) k.DRUM(tt, 0.7 + 0.1 * j, { f: 50, ring: 0.2, gain: 0.6, pan: q % 2 ? 0.3 : -0.3 });
      k.CRASH(t + 0.002, 0.9, 1.0, { gain: 0.7 });
    });
    cue(t0, 'M9: the strings fly up an octave and more'); cue(ROW[WALLS[0]].t0, 'M9: three noise walls (tremolo cluster a step higher each time, drum rolls), the master gates between them; all cut dead at CUES.pair');
    return [];
  },

  // M9 from CUES.pair: nothing (9-08, the gate, the heartbeat); the sub swells 0.7 s before the flash; the
  // bomb: a tutti hit; an open E held over the wave, its dissonances fading first
  M9b(k, C, ROW, ev, cue) {
    const tB = C.bomb2, tW = C.wave, dW = C.king - tW + 0.6;
    k.SUB(tB - 0.7, tB + 0.02, 28, (t) => Math.pow(clamp((t - tB + 0.7) / 0.7), 2), 0.3, (t) => 12 * clamp((t - tB + 0.7) / 0.7));
    k.SWELL(tB, 0.7, 0.05, 1.0);
    [28, 35, 40, 47, 52, 53, 58].forEach((m, i) => k.BR(i < 2 ? 'tuba' : 'trombone', tB, 0.5, m, 1, { accent: 1, att: 0.004, rel: 0.4, swell: (u) => 1 - 0.5 * u }));
    k.BR('horn', tB, 0.5, [64, 65, 70], 1, { accent: 1, att: 0.006, rel: 0.4 }); k.BR('trumpet', tB, 0.4, [76, 77], 1, { accent: 1, att: 0.004, rel: 0.3 });
    k.DRUM(tB, 1, { f: 38, ring: 1.4, gain: 0.6 }); k.DRUM(tB + 0.01, 1, { f: 44, ring: 1.2, gain: 0.45, pan: 0.2 });
    k.CRASH(tB + 0.004, 1, 3.5, { gain: 1 }); k.CRASH(tB + 0.02, 0.9, 3, { gain: 0.8, pan: -0.3 }); k.TIMP(tB, 40, 1, 1.4);
    [[28, 'tuba'], [35, 'tuba'], [40, 'trombone'], [47, 'trombone'], [52, 'trombone']].forEach(([m, kind]) => k.BR(kind, tW, dW, m, 0.95, { att: 0.3, rel: 1.2, swell: (u) => 1 - 0.7 * smooth(u), gain: kind === 'tuba' ? 0.33 : 0.14 }));
    k.ST(tW, dW, [28, 40, 47, 52], 0.9, { n: 6, att: 0.2, rel: 1.2, gain: 0.13, swell: (u) => 1 - 0.65 * smooth(u) });
    k.ST(tW, dW * 0.5, [53, 58], 0.8, { n: 5, att: 0.2, rel: 0.8, gain: 0.08, swell: (u) => 1 - smooth(u) });    // the semitone and the tritone go first
    cue(tB - 0.7, 'M9: the sub swells 0.7 s before the flash'); cue(tB, 'M9: JOKERS WILD: a tutti hit; then an open E held over the wave, its dissonances fading first');
    return [];
  },

  // M10 2:42.6-2:58.6 — the new king: the kings' motif played by the cards; the shadow's cluster; a low brass
  // note for every flattened king, falling; the last two: only their hearts; together: a minor second
  M10(k, C, ROW, ev, cue) {
    const gaps = [], t0 = C.king, t2 = ROW['10-02'].t0, tSh = C.shadow, tF = C.flatten, tL = C.lastTwo, t6 = ROW['10-06'].t0, tEnd = C.tilt;
    const sN = (t2 - t0 - 0.4) / 3.2;
    [0, 1, 2].forEach((j) => {
      const t = t0 + 0.4 + j * sN, d = j < 2 ? sN * 0.95 : tSh - t, sw = j < 2 ? undefined : (u) => 1 - 0.5 * u;
      k.CARD(t, d, 40 + j, 0.9, { gain: 0.35, att: 0.15, rel: 0.5, swell: sw, pan: -0.15 }); k.CARD(t, d, 52 + j, 0.8, { gain: 0.22, att: 0.15, rel: 0.5, swell: sw, pan: 0.2 });
    });
    k.ST(tSh, tL - tSh, [28, 40, 41, 42, 43], 0.85, { n: 5, trem: 13, att: 0.5, rel: 0.2, swell: (u) => 0.4 + 0.6 * u, gain: 0.19, pont: 0.3 });
    let FL = ev('flatten', tF - 0.05, tL).map((e) => [e.t, e.pan ?? 0]);
    if (!FL.length) FL = (ROW['10-04']?.cuts ?? []).map((c, i) => [c.t0 + 0.05, i % 2 ? 0.5 : -0.5]);
    FL.forEach(([t, pan], j) => { const m = 40 - j; k.BR('trombone', t, 0.45, [m, m + 12], 0.95, { accent: 1, att: 0.01, rel: 0.4, pan: pan * 0.7 }); k.BR('tuba', t, 0.45, m - 12, 0.95, { accent: 0.9, rel: 0.4, pan: pan * 0.5 }); });
    // 10-02: the king settles (queued last, so the notes above keep their seeds) and looks down: a low pedal on E (tuba, trombones pp-mf-p, a sub) into the shadow
    const dP = tSh - t2 + 0.4, pSw = (u) => 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    k.BR('tuba', t2, dP, 28, 0.8, { att: 0.5, rel: 0.6, swell: pSw, gain: 0.32 }); k.BR('trombone', t2 + 0.15, dP - 0.15, [40, 47], 0.7, { n: 3, att: 0.6, rel: 0.6, swell: pSw, gain: 0.11 });
    k.SUB(t2, tSh + 0.6, 28, (t) => smooth(clamp((t - t2) / 0.8)) * (1 - smooth(clamp((t - tSh) / 0.6))), 0.1);
    cue(t0, "M10: the kings' motif (E-F-F#) played by the cards; the hum sinks into an organ drone on E1");
    cue(t2, 'M10: the king settles: a low pedal on E (tuba, trombones, sub), the organ swells'); cue(tSh, 'M10: the shadow: a low tremolo cluster'); cue(tF, `M10: a low brass note on every flattened king (${FL.length}), falling by semitones; all cut dead at the last two`);
    return gaps;
  },

  // M10 from CUES.lastTwo: only the last two kings' hearts (no music); flattened together: a low minor second
  M10b(k, C, ROW, ev, cue) {
    const t6 = ROW['10-06'].t0, nFL = Math.max(1, ev('flatten', C.flatten - 0.05, C.lastTwo).length || (ROW['10-04']?.cuts.length ?? 8));
    const F6 = ev('flatten', t6 - 0.05, C.tilt), t66 = F6.length ? F6[0].t : t6 + 0.3, m6 = 40 - nFL;
    k.BR('trombone', t66, 0.7, [m6, m6 + 1, m6 + 12], 1, { accent: 1, rel: 0.6 }); k.BR('tuba', t66, 0.7, [m6 - 12, m6 - 11], 1, { accent: 1, rel: 0.6 });
    cue(C.lastTwo, 'M10: the last two kings: only their heartbeats'); cue(t66, 'M10: the last two flattened together: a low minor second');
    return [];
  },
};

// score one cue into its chunk's music group: returns { report, gaps }. scoreCueG lets the score function
// queue its notes, then plays them one per step.
export const scoreCue = (id, G, events, seedBase) => drive(scoreCueG(id, G, events, seedBase));
export function* scoreCueG(id, G, events, seedBase) {
  const report = [], cue = (t, l) => report.push([+t.toFixed(3), 'MUSIC', l]);
  const ev = (kind, a, b) => events.filter((e) => e.kind === kind && e.t >= a && e.t < b).sort((x, y) => x.t - y.t);
  const Q = [], k = makeKit(G, seedBase, Q), gaps = SCORE[id](k, CUES, ROW, ev, cue);
  for (let i = 0; i < Q.length; i++) { const r = Q[i](); if (r && typeof r.next === 'function') yield* within(r, i / (Q.length + 1), (i + 1) / (Q.length + 1)); yield (i + 1) / (Q.length + 1); }
  k.flush();
  return { report, gaps };
}
