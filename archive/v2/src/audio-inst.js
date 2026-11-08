// Sound department — the instruments of JOKERS WILD, modelled in pure JS (from YOUR TURN / THE BIG ONE, MIT).
// POWER (the kings, the states): bowed low-string sections (sustained, tremolo, sul ponticello, stepped
//   chromatic climbs), low brass, war drum, timpani, booms, cymbal swells.
// THE STATE BAND (the sarcastic victory march): cornets, trumpets, horns, euphoniums, trombones, tuba,
//   field snare drum, bass drum, clash cymbals.
// Deliberately absent: every mallet / toy instrument of the previous film (xylophone, marimba, kalimba,
// glockenspiel, music box, woodblock, slide whistle, ocarina). See docs/SOUND.md.
// Brass/strings/choir/taiko/timpani/boom/cymbal follow the LEVIATHAN instrument models (MIT).
import { SR, TAU, mtof, SVF, Biquad, Noise, Rng, ping, panGains, clamp, smooth, noiseBurst } from './audio-dsp.js';

const C2F = Math.LN2 / 1200;
const blep = (t, dt) => { if (t < dt) { const x = t / dt; return x + x - x * x - 1; } if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; } return 0; };
// a stereo section buffer (windowed: covers film samples [off, off + n)) that remembers which samples were touched
export const section = (n, off = 0) => ({ L: new Float32Array(n), R: new Float32Array(n), off, i0: n, i1: 0 });
const touch = (sec, a, b) => { if (sec.i0 !== undefined) { sec.i0 = Math.min(sec.i0, Math.max(0, a)); sec.i1 = Math.max(sec.i1, Math.min(sec.L.length, b)); } };

// Unison stack of band-limited saws; each player has detune, vibrato, seat and start lag.
// env(tt) amplitude, pm(tt) pitch offset in semitones, tri 0..1 morphs saw toward triangle.
// Writes into plain arrays L/R starting at index round(t0 * SR) (t0 relative to the arrays).
export function stack(L, R, t0, dur, m, o) {
  const f0 = mtof(m), nv = o.n ?? 4, r = new Rng(o.seed ?? 1);
  const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(L.length, Math.round((t0 + dur) * SR));
  if (i1 <= i0) return;
  const base = (i0 - t0 * SR) / SR, V = [];
  for (let k = 0; k < nv; k++) {
    const u = nv > 1 ? (k / (nv - 1)) * 2 - 1 : 0, [gl, gr] = panGains((o.pan ?? 0) + u * (o.spread ?? 0.5));
    V.push({ ph: r.next(), det: u * (o.det ?? 9) + (r.next() - 0.5) * (o.jit ?? 4) + (o.tune ?? 0), gl, gr, lag: Math.round(r.next() * (o.lag ?? 0.02) * SR), vr: (o.vibHz ?? 5) * (0.9 + 0.2 * r.next()), vp: r.next() * TAU, inc: f0 / SR });
  }
  const vd = o.vib ?? 6, vdel = o.vibDelay ?? 0.3, env = o.env, pm = o.pm, tri = o.tri ?? 0, norm = 1 / Math.sqrt(nv);
  let g = env(base) * norm, dg = 0;
  for (let i = i0; i < i1; i++) {
    const c = i - i0;
    if ((c & 31) === 0) {
      const tt = base + c / SR, p = pm ? pm(tt) * 100 : 0, vb = vd * smooth(tt / vdel);
      for (let v = 0; v < nv; v++) { const q = V[v]; q.inc = f0 * Math.exp((q.det + p + vb * Math.sin(TAU * q.vr * tt + q.vp)) * C2F) / SR; }
      dg = (env(tt + 32 / SR) * norm - g) / 32;
    }
    let sl = 0, sr = 0;
    for (let v = 0; v < nv; v++) {
      const q = V[v]; if (c < q.lag) continue;
      let p = q.ph + q.inc; if (p >= 1) p -= 1; q.ph = p;
      let s = 2 * p - 1 - blep(p, q.inc);
      if (tri) s = s * (1 - tri) + tri * (1 - 2 * Math.abs(2 * p - 1));
      sl += s * q.gl; sr += s * q.gr;
    }
    L[i] += sl * g; R[i] += sr * g; g += dg;
  }
}

// ---- brass: the filter opens with the breath, the tone tears at ff (tanh), a lip "blat" at the onset.
// o: n players, det, spread, pan, vib, scoop (semitones under the note at the onset), att, rel, maxCut,
//    drive, gain, swell(u), bend(tt), tune (cents), formant [[f, q, db], ...] (the bell), flutter (0..1,
//    a nervous 11 Hz tremble), accent (0..1: marcato overshoot of level and brightness)
export function brassNote(sec, t0, dur, m, vel, o = {}) {
  const f0 = mtof(m), rel = o.rel ?? 0.32, att = o.att ?? (0.045 + 0.14 * (1 - vel)), tot = dur + rel + 0.04;
  const swell = o.swell, len = Math.ceil(tot * SR), tL = new Float32Array(len), tR = new Float32Array(len), seed = o.seed ?? 1;
  const acc = o.accent ?? 0, fl = o.flutter ?? 0;
  const dyn = (tt) => (swell ? swell(clamp(tt / dur)) : 1) * (1 + acc * 0.6 * Math.exp(-Math.max(0, tt - att) / 0.07));
  const env = (tt) => (tt < att ? tt / att : 1) * (tt > dur ? Math.exp(-(tt - dur) / (rel * 0.4)) : 1) * (0.55 + 0.45 * dyn(tt)) * (tt > dur + rel ? Math.max(0, 1 - (tt - dur - rel) / 0.04) : 1)
    * (fl ? 1 - fl * (0.5 + 0.5 * Math.sin(TAU * 11.3 * tt)) : 1);
  stack(tL, tR, 0, tot, m, { n: o.n ?? 5, det: o.det ?? 7, spread: o.spread ?? 0.35, pan: o.pan ?? 0, vib: o.vib ?? 3.5, vibDelay: 0.6, vibHz: 4.6, lag: o.lag ?? 0.03, env, seed, tune: o.tune ?? 0, pm: (tt) => -(o.scoop ?? 0.55) * Math.exp(-tt / 0.045) + (o.bend ? o.bend(tt) : 0) });
  const fc = clamp(f0 * (1.7 + 8 * vel * vel), 260, o.maxCut ?? 6200), floor = f0 * 1.15;
  const a = new SVF(fc, 0.8), b = new SVF(fc, 0.8), drive = 1.1 + (o.drive ?? 3.2) * vel * vel, nd = 1 / Math.tanh(drive);
  const out = (o.gain ?? 0.13) * vel, s0 = Math.round(t0 * SR) - (sec.off ?? 0), n = sec.L.length;
  const nz = new Noise(seed + 31), blat = new SVF(Math.min(5000, f0 * 3.2), 1.6), blatN = Math.round(0.06 * SR);
  const fL = (o.formant ?? []).map(([f, q, db]) => Biquad.peak(f, q, db)), fR = (o.formant ?? []).map(([f, q, db]) => Biquad.peak(f, q, db));
  touch(sec, s0, s0 + len);
  for (let i = 0; i < len; i++) {
    const j = s0 + i; if (j >= n) break;
    if ((i & 63) === 0) {
      const tt = i / SR;
      let k = tt < att * 1.5 ? Math.pow(tt / (att * 1.5), 1.4) : 1 - 0.22 * smooth((tt - att * 1.5) / 0.7);
      k *= 0.45 + 0.55 * Math.min(1.25, dyn(tt));
      if (tt > dur) k *= Math.exp(-(tt - dur) / (rel * 0.6));
      const f = floor + (fc - floor) * k; a.set(f, 0.8); b.set(f, 0.8);
    }
    let bl = 0;
    if (i < blatN) { blat.run(nz.white()); bl = blat.bp * 0.5 * vel * Math.exp(-i / (0.016 * SR)); }
    a.run(tL[i] + bl); b.run(tR[i] + bl);
    let yl = Math.tanh(a.lp * drive) * nd * out, yr = Math.tanh(b.lp * drive) * nd * out;
    for (let q = 0; q < fL.length; q++) { yl = fL[q].run(yl); yr = fR[q].run(yr); }
    if (j >= 0) { sec.L[j] += yl; sec.R[j] += yr; }
  }
}

// ---- the band's brass, as presets over brassNote. [n, det, maxCut, drive, gain, scoop, formants]
export const BRASS = {
  cornet: { n: 4, det: 6, maxCut: 6800, drive: 3.0, gain: 0.105, scoop: 0.18, vib: 1.2, att: 0.022, formant: [[1250, 1.1, 3.5], [2600, 1.4, 2]], spread: 0.3 },
  trumpet: { n: 3, det: 5, maxCut: 8200, drive: 3.6, gain: 0.08, scoop: 0.14, vib: 0.6, att: 0.018, formant: [[1450, 1.2, 4], [3000, 1.5, 2.5]], spread: 0.25 },
  euph: { n: 2, det: 5, maxCut: 2600, drive: 1.8, gain: 0.12, scoop: 0.2, vib: 1.5, att: 0.03, formant: [[520, 1, 3]], spread: 0.2 },
  horn: { n: 4, det: 7, maxCut: 1900, drive: 1.4, gain: 0.1, scoop: 0.25, vib: 0.8, att: 0.035, formant: [[420, 0.9, 3]], spread: 0.35 },
  trombone: { n: 3, det: 6, maxCut: 3800, drive: 3.2, gain: 0.11, scoop: 0.3, vib: 0.4, att: 0.03, formant: [[560, 1, 3], [1150, 1.2, 2]], spread: 0.3 },
  tuba: { n: 2, det: 5, maxCut: 950, drive: 1.6, gain: 0.26, scoop: 0.25, vib: 0.3, att: 0.022, formant: [[230, 1, 2]], spread: 0.1 },
};
export const brass = (sec, kind, t0, dur, m, vel, o = {}) => brassNote(sec, t0, dur, m, vel, { ...BRASS[kind], ...o });

// ---- bowed string section (cellos, basses, violas): every player has his own detune, vibrato and, with
// o.trem, his own unsynchronized tremolo strokes (a section tremolo shimmers instead of gating), plus
// rosin noise and a body resonance. o: n, det (cents), spread, pan, att, rel, swell(u) 0..1, trem
// (strokes/s), pm(tt) pitch offset in semitones (steps allowed: a chromatic climb), bright, maxCut,
// pont 0..1 (sul ponticello glassiness), noise, body [[f,q,db]], accent (0..1 sforzando bite), gain, seed
export function bowed(sec, t0, dur, m, vel, o = {}) {
  const nv = o.n ?? 6, r = new Rng(o.seed ?? 1), f0 = mtof(m), att = o.att ?? 0.12, rel = o.rel ?? 0.35, tot = dur + rel;
  const s0 = Math.round(t0 * SR) - (sec.off ?? 0), len = Math.ceil(tot * SR), n = sec.L.length;
  if (s0 >= n || s0 + len <= 0) return;
  const trem = o.trem ?? 0, swell = o.swell, acc = o.accent ?? 0, pm = o.pm, vib = o.vib ?? (trem ? 3 : 8);
  const V = [];
  for (let k = 0; k < nv; k++) {
    const u = nv > 1 ? (k / (nv - 1)) * 2 - 1 : 0, [gl, gr] = panGains((o.pan ?? 0) + u * (o.spread ?? 0.5));
    V.push({ ph: r.next(), det: u * (o.det ?? 9) + r.range(-3, 3), gl, gr, vr: r.range(4.8, 6.0), vp: r.next() * TAU, vd: r.range(0.6, 1.3),
      tr: trem * r.range(0.88, 1.14), tp: r.next(), lag: Math.round(r.range(0, att < 0.05 ? 0.008 : 0.04) * SR), inc: f0 / SR });
  }
  const env = (tt) => {
    let e = tt < att ? Math.max(smooth(tt / att), acc * Math.min(1, tt / 0.012)) : 1;   // an accent bites at once
    if (tt > dur) e *= Math.max(0, 1 - (tt - dur) / rel);
    if (acc) e *= 1 + acc * 0.9 * Math.exp(-tt / 0.09);                                // sforzando, then the sustain
    if (swell) e *= 0.12 + 0.88 * swell(clamp(tt / dur));
    return e;
  };
  const fc = clamp(f0 * (o.bright ?? 4.5) * (0.6 + 0.6 * vel), 300, o.maxCut ?? 6000);
  const aL = new SVF(fc, 0.72), aR = new SVF(fc, 0.72), pont = o.pont ?? 0, pL = new SVF(3200, 1.1), pR = new SVF(3200, 1.1);
  const nz = new Noise((o.seed ?? 1) + 77), bn = new SVF(2400, 0.8), noise = o.noise ?? 0.04;
  const body = o.body ?? [[f0 < 90 ? 105 : 230, 1.1, 3], [480, 1.3, -2]];
  const bL = body.map(([f, q, db]) => Biquad.peak(f, q, db)), bR = body.map(([f, q, db]) => Biquad.peak(f, q, db));
  const g = (o.gain ?? 0.09) * vel, norm = 1 / Math.sqrt(nv);
  touch(sec, s0, s0 + len);
  let e = env(0), de = 0;
  for (let i = 0; i < len; i++) {
    const j = s0 + i; if (j >= n) break;
    const tt = i / SR;
    if ((i & 31) === 0) {
      const p = pm ? pm(tt) * 100 : 0, vb = vib * smooth((tt - 0.15) / 0.4);
      for (let v = 0; v < nv; v++) { const q = V[v]; q.inc = f0 * Math.exp((q.det + p + vb * q.vd * Math.sin(TAU * q.vr * tt + q.vp)) * C2F) / SR; }
      de = (env(tt + 32 / SR) - e) / 32;
    }
    let sl = 0, sr = 0;
    for (let v = 0; v < nv; v++) {
      const q = V[v]; if (i < q.lag) continue;
      let ph = q.ph + q.inc; if (ph >= 1) ph -= 1; q.ph = ph;
      let s = 2 * ph - 1 - blep(ph, q.inc);
      if (trem) { q.tp += q.tr / SR; if (q.tp >= 1) q.tp -= 1; s *= 0.45 + 0.55 * Math.exp(-q.tp * 3.4) * Math.min(1, q.tp * 30); }
      sl += s * q.gl; sr += s * q.gr;
    }
    bn.run(nz.white());
    const h = bn.bp * noise * (1 + (trem ? 0.8 : 0));
    aL.run(sl * norm + h); aR.run(sr * norm + h);
    let yl = aL.lp, yr = aR.lp;
    if (pont) { pL.run(sl * norm); pR.run(sr * norm); yl += pL.bp * pont * 1.6; yr += pR.bp * pont * 1.6; }
    for (let q = 0; q < bL.length; q++) { yl = bL[q].run(yl); yr = bR[q].run(yr); }
    if (j >= 0) { sec.L[j] += yl * e * g; sec.R[j] += yr * e * g; }
    e += de;
  }
}

// ---- the card instrument (M10): the king's motif played BY THE CARDS. A note is a riffle of card snaps
// fired at the note's own frequency (a pitched, papery buzz), with octave layers and a paper body; each
// side of the stereo field riffles on its own (a little detuned), so it is wide and alive.
// o: att, rel, swell(u), gain, pan, seed
export function cardTone(sec, t0, dur, m, vel, o = {}) {
  const f0 = mtof(m), att = o.att ?? 0.12, rel = o.rel ?? 0.35, tot = dur + rel, len = Math.ceil(tot * SR), s0 = Math.round(t0 * SR) - (sec.off ?? 0), n = sec.L.length;
  if (s0 >= n || s0 + len <= 0) return;
  const r = new Rng(o.seed ?? 1), g = new Float32Array(Math.round(0.004 * SR));
  noiseBurst(g, 0, { a: 0.0001, tau: 0.0007, f0: 2700, q: 1.1, amp: 1 }, new Noise(o.seed ?? 1));
  noiseBurst(g, 0, { a: 0.0002, tau: 0.0012, f0: 900, q: 0.8, mode: 'lp', amp: 0.5 }, new Noise((o.seed ?? 1) + 1));
  const env = (tt) => (tt < att ? smooth(tt / att) : 1) * (tt > dur ? Math.max(0, 1 - (tt - dur) / rel) : 1) * (o.swell ? 0.2 + 0.8 * o.swell(clamp(tt / dur)) : 1);
  const [pl, pr] = panGains(o.pan ?? 0), amp = (o.gain ?? 0.2) * vel;
  for (const [side, det] of [[0, 1], [1, 1.004]]) {
    const out = side ? sec.R : sec.L, sg = side ? pr : pl;
    for (const [mul, a] of [[1, 1], [2, 0.55], [4, 0.3]]) {
      const per = SR / (f0 * mul * det);
      for (let t = r.next() * per; t < len; t += per * (1 + 0.01 * (r.next() - 0.5))) {
        const i = Math.round(t), e = env(i / SR) * a * amp * sg * Math.SQRT2; if (e < 1e-5) continue;
        for (let k = 0; k < g.length && s0 + i + k < n; k++) if (s0 + i + k >= 0) out[s0 + i + k] += g[k] * e;
      }
    }
  }
  touch(sec, s0, s0 + len);
}

// ---- a card slapped flat on the table ("da"): the race of M11, the AI's pulse. Six fixed variants (cached), so a
// dense run is a texture of the same few cards, not a crowd of different sounds. Mono, peak ~0.5.
const tapCache = new Map();
export function cardTap(variant = 0) {
  const v = ((variant % 6) + 6) % 6, key = SR * 10 + v;
  if (tapCache.has(key)) return tapCache.get(key);
  const r = new Rng(700 + v), out = new Float32Array(Math.ceil(0.09 * SR));
  noiseBurst(out, 0, { a: 0.0004, tau: 0.006 + 0.003 * r.next(), f0: 1500 + 600 * r.next(), q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(710 + v));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0014, f0: 3800 + 900 * r.next(), q: 0.9, amp: 0.35 }, new Noise(720 + v));
  ping(out, 0, 290 + 90 * r.next(), 0.07, [[1, 1, 0.022], [2.2, 0.3, 0.01]], r.next() * 6);
  const fo = Math.round(0.01 * SR); for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  tapCache.set(key, out);
  return out;
}

// ---- choir: voices into a section buffer; choirFormants() then makes them sing a vowel (kept for M10)
export function choirNote(sec, t0, dur, m, vel, o = {}) {
  const att = o.att ?? 0.5, rel = o.rel ?? 0.7, tot = dur + rel, swell = o.swell, off = (sec.off ?? 0) / SR;
  const env = (tt) => (o.gain ?? 0.11) * vel * (tt < att ? smooth(tt / att) : 1) * (tt > dur ? Math.max(0, 1 - (tt - dur) / rel) : 1) * (swell ? 0.2 + 0.8 * swell(clamp(tt / dur)) : 1);
  touch(sec, Math.round((t0 - off) * SR), Math.round((t0 - off + tot) * SR));
  stack(sec.L, sec.R, t0 - off, tot, m, { n: o.n ?? 5, det: o.det ?? 14, jit: 7, spread: o.spread ?? 0.7, pan: o.pan ?? 0, vib: o.vib ?? 16, vibDelay: 0.5, vibHz: 5.1, lag: 0.08, env, seed: o.seed ?? 1, tri: 0.15 });
}

// ============================================================== percussion (mono buffers)
// ---- field snare drum (military, gut snares): head modes with a pitch drop, stick, snare-wire sizzle.
// vel 0..1 (taps ~0.35, accents 1); o.f head pitch, o.wire sizzle length
export function snare(vel, seed = 1, o = {}) {
  const len = Math.ceil(0.5 * SR), out = new Float32Array(len), nz = new Noise(seed), r = new Rng(seed + 3);
  const f1 = (o.f ?? 168) * r.range(0.985, 1.015), D = (tau) => Math.exp(-1 / (tau * SR));
  const hp = new SVF(1500, 0.7), lp = new SVF(8500, 0.7), bp2 = new SVF(4200, 1.4), stk = new SVF(5200, 0.9);
  const wire = (o.wire ?? 0.085) * (0.75 + 0.45 * vel);
  let p1 = r.next(), p2 = r.next(), p3 = r.next(), e1 = 1, e2 = 1, e3 = 1, ew = 1, ew2 = 1, es = 1, ep = 1;
  const k1 = D(0.085), k2 = D(0.045), k3 = D(0.03), kw = D(wire), kw2 = D(0.018), ks = D(0.0012), kp = D(0.007);
  const drv = 1.2 + 1.3 * vel;
  for (let i = 0; i < len; i++) {
    const bend = 1 + 0.12 * vel * ep;
    p1 += f1 * bend / SR; p2 += f1 * 1.59 * bend / SR; p3 += f1 * 2.14 / SR;
    if (p1 > 1) p1 -= 1; if (p2 > 1) p2 -= 1; if (p3 > 1) p3 -= 1;
    const head = Math.sin(TAU * p1) * e1 + 0.55 * Math.sin(TAU * p2) * e2 + 0.3 * Math.sin(TAU * p3) * e3;
    const w = nz.white(); hp.run(w); lp.run(hp.hp); bp2.run(w); stk.run(w);
    const sizzle = (lp.lp * 0.8 + bp2.bp * 0.35) * (0.62 * ew + 0.38 * ew2) * (0.55 + 0.45 * Math.abs(head));
    const x = head * 0.55 + sizzle * 1.15 + stk.hp * es * 0.9;
    out[i] = Math.tanh(x * drv) / Math.tanh(drv) * vel * 0.5 * (i < 24 ? i / 24 : 1) * (i > len - 600 ? (len - i) / 600 : 1);
    e1 *= k1; e2 *= k2; e3 *= k3; ew *= kw; ew2 *= kw2; es *= ks; ep *= kp;
  }
  return out;
}
// ---- band bass drum (felt beater, a little muffled): membrane with a pitch drop + beater thump
export function bassDrum(vel, seed = 1, o = {}) {
  const ring = o.ring ?? 0.32, len = Math.ceil((ring * 4 + 0.1) * SR), out = new Float32Array(len), nz = new Noise(seed), r = new Rng(seed + 1);
  const f0 = (o.f ?? 54) * r.range(0.99, 1.01), D = (tau) => Math.exp(-1 / (tau * SR)), lo = new SVF(320, 0.7), mid = new SVF(140, 2.5);
  let p1 = 0, p2 = r.next(), e1 = 1, e2 = 1, eb = 1, ef = 1;
  const k1 = D(ring), k2 = D(ring * 0.35), kb = D(0.012), kf = D(0.022), drv = 1 + vel * 1.4;
  for (let i = 0; i < len; i++) {
    p1 += f0 * (1 + 0.45 * ef) / SR; p2 += f0 * 1.48 * (1 + 0.3 * ef) / SR; if (p1 > 1) p1 -= 1; if (p2 > 1) p2 -= 1;
    const w = nz.white(); lo.run(w); mid.run(w);
    const x = Math.sin(TAU * p1) * e1 + 0.4 * Math.sin(TAU * p2) * e2 + lo.lp * 2.2 * eb + mid.bp * 0.6 * eb;
    out[i] = Math.tanh(x * drv) / Math.tanh(drv) * vel * 0.7 * Math.min(1, i / 40) * (i > len - 1200 ? (len - i) / 1200 : 1);
    e1 *= k1; e2 *= k2; eb *= kb; ef *= kf;
  }
  return out;
}
// ---- war drum: a big low drum (odaiko / gran cassa) for the power layer: deep membrane, long bloom,
// stick crack and skin slap
export function warDrum(vel, seed = 1, o = {}) {
  const ring = o.ring ?? 0.85, len = Math.ceil((ring * 3.2 + 0.1) * SR), out = new Float32Array(len), nz = new Noise(seed), r = new Rng(seed + 9);
  const f0 = (o.f ?? 47) * r.range(0.985, 1.015), D = (tau) => Math.exp(-1 / (tau * SR));
  const crack = new SVF(1700 + 900 * vel, 0.9), skin = new SVF(520, 0.7);
  let p1 = 0, p2 = r.next(), p3 = r.next(), e1 = 1, e2 = 1, e3 = 1, ec = 1, es = 1, ef = 1;
  const k1 = D(ring), k2 = D(ring * 0.3), k3 = D(0.09), kc = D(0.006), ks = D(0.035), kf = D(0.04), drv = 1.2 + 1.2 * vel;
  for (let i = 0; i < len; i++) {
    p1 += f0 * (1 + 0.7 * ef) / SR; p2 += f0 * 1.52 * (1 + 0.4 * ef) / SR; p3 += f0 * 2.31 / SR;
    if (p1 > 1) p1 -= 1; if (p2 > 1) p2 -= 1; if (p3 > 1) p3 -= 1;
    const w = nz.white(); crack.run(w); skin.run(w);
    const x = Math.sin(TAU * p1) * e1 + 0.45 * Math.sin(TAU * p2) * e2 + 0.25 * Math.sin(TAU * p3) * e3 + crack.bp * 0.5 * ec + skin.lp * 1.4 * es;
    out[i] = Math.tanh(x * drv) / Math.tanh(drv) * vel * 0.75 * Math.min(1, i / 30) * (i > len - 2400 ? (len - i) / 2400 : 1);
    e1 *= k1; e2 *= k2; e3 *= k3; ec *= kc; es *= ks; ef *= kf;
  }
  return out;
}
export function timpani(m, vel, seed = 1, ring = 1) {
  const f0 = mtof(m), out = new Float32Array(Math.ceil(2.9 * ring * SR));
  ping(out, 0, f0, 0.6 * vel, [[0.62, 0.5, 0.3], [1, 1, 2.6 * ring], [1.5, 0.55, 1.7 * ring], [1.98, 0.35, 1.25 * ring], [2.44, 0.22, 0.9 * ring], [2.9, 0.12, 0.6 * ring]], seed * 0.37);
  const nz = new Noise(seed), f = new SVF(900 + vel * 1500, 0.7), n = Math.round(0.03 * SR);
  for (let i = 0; i < n; i++) { f.run(nz.white()); out[i] += f.lp * 0.3 * vel * Math.exp(-i / (0.0055 * SR)); }
  const fo = Math.round(0.02 * SR); for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  return out;
}
// ---- trailer boom: sweeping sine, saturated, long sub tail
export function boom(o = {}, seed = 1) {
  const dur = o.dur ?? 3.5, len = Math.ceil(dur * SR), out = new Float32Array(len), f0 = o.f0 ?? 110, f1 = Math.max(o.f1 ?? 43, 34), sw = o.sweep ?? 0.09, tau = o.tau ?? 0.9, drive = o.drive ?? 2.2;
  const nz = new Noise(seed), lo = new SVF(o.nf ?? 260, 0.7), ks = Math.exp(-1 / (sw * SR)), ke = Math.exp(-1 / (tau * SR)), kn = Math.exp(-1 / (0.06 * SR)), nN = Math.round(0.5 * SR), g = o.gain ?? 0.8;
  let p = 0, es = 1, ee = 1, en = 1;
  for (let i = 0; i < len; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * es; p += f / SR; if (p > 1) p -= 1;
    const e = ee * (t < 0.003 ? t / 0.003 : 1) * (i > len - 2400 ? (len - i) / 2400 : 1);
    let x = Math.sin(TAU * p) * drive * e;
    if (i < nN) { lo.run(nz.white()); x += lo.lp * 1.7 * en; }
    out[i] = Math.tanh(x) * g * Math.min(1, e * 2.5);
    es *= ks; ee *= ke; en *= kn;
  }
  return out;
}
// ---- heart: a soft low stroke with a fast thud and a body that breathes out (the human layer; not in the reel)
export function heart(f0, vel, seed = 1) {
  const len = Math.ceil(0.62 * SR), out = new Float32Array(len), nz = new Noise(seed), lo = new SVF(170, 0.8);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, f = f0 * (1 + 0.32 * Math.exp(-t / 0.02)); p += f / SR;
    lo.run(nz.white());
    const a = smooth(t / 0.022), e = a * (0.72 * Math.exp(-t / 0.13) + 0.28 * Math.exp(-t / 0.42)), s = Math.sin(TAU * p);
    const x = (s + 0.42 * Math.sin(2 * TAU * p) + 0.2 * Math.sin(3 * TAU * p + 0.6)) * e * (1.2 + 1.1 * vel) + lo.lp * 1.3 * Math.exp(-t / 0.03);
    out[i] = Math.tanh(x) * 0.62 * vel * (i > len - 1600 ? (len - i) / 1600 : 1);
  }
  return out;
}
// ---- clash cymbals / crash: dense inharmonic shimmer over filtered noise
export function crash(vel, seed = 1, ring = 3.4) {
  const len = Math.ceil(ring * 1.25 * SR), out = new Float32Array(len), nz = new Noise(seed), r = new Rng(seed);
  const hp = new SVF(3400, 0.7), b1 = new SVF(5200, 2.2), b2 = new SVF(8700, 2.6), b3 = new SVF(2900, 2);
  for (let i = 0; i < len; i++) {
    const t = i / SR, w = nz.white();
    hp.run(w); b1.run(w); b2.run(w); b3.run(w);
    const e = Math.exp(-t / (ring * 0.28)), a = t < 0.002 ? t / 0.002 : 1;
    out[i] = (hp.hp * (0.28 * e + 0.5 * Math.exp(-t / 0.05)) + (b1.bp * 0.6 + b2.bp * 0.5) * e + b3.bp * 0.4 * Math.exp(-t / (ring * 0.15))) * a * vel * 0.34 * (i > len - 2400 ? (len - i) / 2400 : 1);
  }
  for (let k = 0; k < 24; k++) ping(out, Math.round(r.next() * 200), r.range(900, 9000), 0.012 * vel, [[1, 1, r.range(0.3, ring * 0.5)]], r.next() * 6);
  return out;
}
// ---- suspended cymbal swell peaking `rise` seconds in
export function cymbalSwell(rise, ring, vel, seed = 1) {
  const len = Math.ceil((rise + ring) * SR), out = new Float32Array(len);
  const nz = new Noise(seed), b1 = new SVF(4300, 3), b2 = new SVF(6900, 4), b3 = new SVF(9600, 2), hp = new SVF(2800, 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / SR, w = nz.white();
    b1.run(w); b2.run(w); b3.run(w); hp.run(w);
    const e = t < rise ? (Math.exp(3.2 * t / rise) - 1) / (Math.exp(3.2) - 1) : Math.exp(-(t - rise) / (ring * 0.3));
    out[i] = (b1.bp * 0.6 + b2.bp * 0.5 + b3.bp * 0.35 + hp.hp * 0.12) * e * vel * 0.22 * (i > len - 1200 ? (len - i) / 1200 : 1);
  }
  return out;
}
