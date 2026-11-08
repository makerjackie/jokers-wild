// Sound department — the v3 reel's own voices (JOKERS WILD 「批准」). The v2 instruments (brass, bowed strings, drums,
// timpani, cymbals) live in audio-inst.js; these are the new ones:
//   THE PAPER PEOPLE: one small music box (the only tuned struck instrument in the film, and only theirs).
//   THE AI: the jokers' beating drones, a cold pipe organ (wavetable ranks), a formant choir, a Shepard-Risset riser.
//   THE MACHINE: a hard little latch / flap click for the stamps' ostinato and the presses running by themselves.
// Pure functions of their arguments (seeded noise only), the same in Node and the browser.
import { SR, TAU, mtof, SVF, Noise, Rng, Drift, ping, panGains, clamp, smooth, noiseBurst } from './audio-dsp.js';
import { stack } from './audio-inst.js';

// a section remembers which samples were touched (see audio-inst.js)
const touch = (sec, a, b) => { if (sec.i0 !== undefined) { sec.i0 = Math.min(sec.i0, Math.max(0, a)); sec.i1 = Math.max(sec.i1, Math.min(sec.L.length, b)); } };

// ---- the music box (the paper people's motif): a steel comb tine plucked by a pin. A long, almost pure fundamental
// with a second tine a hair off (the slow wobble of a worn comb), the tine's inharmonic second mode (x5.93, fast),
// the pin's tick, a breath of the little wooden box. Mono, peak ~0.35 at vel 1.
// o: ring (decay scale, 1 = a fresh comb), detune (cents: a box running down goes flat), bright 0..1, seed
const mbCache = new Map();
export function musicBox(m, vel = 1, o = {}) {
  const ring = o.ring ?? 1, det = o.detune ?? 0, bright = o.bright ?? 1, seed = o.seed ?? 1;
  const key = `${SR}|${m}|${ring}|${det}|${bright}|${seed}`;
  let base = mbCache.get(key);
  if (!base) {
    const f0 = mtof(m) * Math.pow(2, det / 1200), dk = ring * Math.pow(1000 / f0, 0.35), len = Math.ceil(Math.min(4.2, 2.3 * dk + 0.25) * SR);
    base = new Float32Array(len); const r = new Rng(seed);
    ping(base, 0, f0, 0.3, [[1, 1, 2.0 * dk], [1.0019, 0.32, 1.6 * dk], [2.0, 0.05 * bright, 0.6 * dk], [5.93, 0.2 * bright, 0.15 * dk], [13.4, 0.045 * bright, 0.04 * dk]], r.next() * TAU);
    noiseBurst(base, 0, { a: 0.0001, tau: 0.0011, f0: 5200, q: 0.8, amp: 0.07 }, new Noise(seed + 3));      // the pin
    ping(base, 0, 410 * r.range(0.97, 1.03), 0.012, [[1, 1, 0.05], [2.3, 0.4, 0.02]], 0.5);                 // the box
    const fo = Math.round(0.05 * SR); for (let i = 0; i < fo; i++) base[len - 1 - i] *= i / fo;
    mbCache.set(key, base);
  }
  if (vel === 1) return base;
  const out = new Float32Array(base.length); for (let i = 0; i < out.length; i++) out[i] = base[i] * vel; return out;
}

// ---- the pipe organ (the card king's instrument): each note reads a wavetable of its ranks (16' 8' 4' 2 2/3' 2'
// and a thin mixture: all integer multiples, so one table serves), two ranks a hair apart (the slow chorus of real
// pipes), the speech "chiff" at the onset, a little wind. Notes into a section; lvl(t) in FILM seconds shapes the
// whole chord (swells, cuts). o: reg { sub, p8, p4, p3, p2, mix } rank levels, att, rel, gain, pan, spread, chiff
const ORG_P = 2048;
function organTable(reg) {
  // the mixture is octaves and fifths only (x6, x8, x12): no tierce (x5), so no third ever sounds in the AI's organ
  const T = new Float32Array(ORG_P + 1), H = [[0.5, reg.sub ?? 0], [1, reg.p8 ?? 1], [2, reg.p4 ?? 0.55], [3, reg.p3 ?? 0.25], [4, reg.p2 ?? 0.3], [6, (reg.mix ?? 0) * 0.6], [8, (reg.mix ?? 0) * 0.5], [12, (reg.mix ?? 0) * 0.3]];
  // the table covers TWO periods of the 8' fundamental, so the 16' rank (k = 0.5) fits too
  for (let i = 0; i <= ORG_P; i++) { const x = TAU * i / ORG_P; let v = 0; for (const [k, a] of H) if (a) v += a * Math.sin(2 * k * x + k * 0.7); T[i] = v; }
  let pk = 0; for (let i = 0; i < ORG_P; i++) pk = Math.max(pk, Math.abs(T[i])); for (let i = 0; i <= ORG_P; i++) T[i] /= pk;
  return T;
}
export function organNotes(sec, t0, dur, ms, lvl, o = {}) {
  const reg = o.reg ?? {}, T = organTable(reg), att = o.att ?? 0.08, rel = o.rel ?? 0.25, gain = o.gain ?? 0.05, off = sec.off ?? 0, n = sec.L.length;
  const s0 = Math.round(t0 * SR) - off, len = Math.ceil((dur + rel) * SR), notes = [].concat(ms), r = new Rng(o.seed ?? 1), nz = new Noise((o.seed ?? 1) + 5);
  const lv = typeof lvl === 'function' ? lvl : () => lvl ?? 1, chiff = o.chiff ?? 0.5;
  const V = notes.map((m, k) => {
    const u = notes.length > 1 ? k / (notes.length - 1) * 2 - 1 : 0, [gl, gr] = panGains((o.pan ?? 0) + u * (o.spread ?? 0.4));
    return { f: mtof(m) / 2, pa: r.next(), pb: r.next(), gl, gr, ch: new SVF(Math.min(9000, mtof(m) * 3), 2.5) };
  });
  const wind = new SVF(1200, 0.7), norm = 1 / Math.sqrt(notes.length), envAt = (tt) => (tt < att ? smooth(tt / att) : 1) * (tt > dur ? Math.max(0, 1 - (tt - dur) / rel) : 1) * lv(t0 + tt);
  touch(sec, s0, s0 + len);
  let e = envAt(0), de = 0;
  for (let i = 0; i < len; i++) {
    const j = s0 + i; if (j >= n) break;
    if ((i & 63) === 0) de = (envAt((i + 64) / SR) - e) / 64;
    e += de;
    const w = nz.white(), cE = i < 0.06 * SR ? Math.exp(-i / (0.018 * SR)) * chiff : 0;
    wind.run(w);
    let l = 0, rr = 0;
    for (const q of V) {
      q.pa += q.f / SR; q.pb += q.f * 1.0016 / SR; q.pa -= Math.floor(q.pa); q.pb -= Math.floor(q.pb);
      const xa = q.pa * ORG_P, ia = xa | 0, xb = q.pb * ORG_P, ib = xb | 0;
      let v = (T[ia] + (T[ia + 1] - T[ia]) * (xa - ia)) * 0.6 + (T[ib] + (T[ib + 1] - T[ib]) * (xb - ib)) * 0.4;
      if (cE) { q.ch.run(w); v += q.ch.bp * cE; }
      l += v * q.gl; rr += v * q.gr;
    }
    if (j < 0 || e <= 0) continue;
    const g = gain * e * norm * Math.SQRT2, wv = wind.bp * 0.03;
    sec.L[j] += (l + wv) * g; sec.R[j] += (rr + wv) * g;
  }
}

// ---- choir: voices (a stack of saws) sung through vowel formants. o: vowel 'a' | 'o' | 'u', the stack's options
// (n, det, spread, pan, vib, att, rel, swell(u), gain), bright. Into a section.
const VOWEL = { a: [[730, 1, 6], [1090, 0.5, 8], [2440, 0.25, 10]], o: [[500, 1, 6], [850, 0.45, 8], [2400, 0.15, 10]], u: [[330, 1, 6], [700, 0.3, 8], [2300, 0.1, 10]] };
export function choirVowel(sec, t0, dur, m, vel, o = {}) {
  const rel = o.rel ?? 0.6, tot = dur + rel, len = Math.ceil(tot * SR), tL = new Float32Array(len), tR = new Float32Array(len), att = o.att ?? 0.4;
  const env = (tt) => (tt < att ? smooth(tt / att) : 1) * (tt > dur ? Math.max(0, 1 - (tt - dur) / rel) : 1) * (o.swell ? 0.15 + 0.85 * o.swell(clamp(tt / dur)) : 1);
  stack(tL, tR, 0, tot, m, { n: o.n ?? 6, det: o.det ?? 12, jit: 6, spread: o.spread ?? 0.7, pan: o.pan ?? 0, vib: o.vib ?? 9, vibDelay: 0.6, vibHz: 4.9, lag: 0.06, env, seed: o.seed ?? 1, tri: 0.2 });
  const sh = mtof(m) > 500 ? 1.25 : 1, F = VOWEL[o.vowel ?? 'a'];
  const fl = F.map(([f, , q]) => new SVF(f * sh, q)), fr = F.map(([f, , q]) => new SVF(f * sh * 1.02, q));
  const lp = new SVF(Math.min(8000, 4200 * (o.bright ?? 1)), 0.7), lp2 = new SVF(Math.min(8000, 4200 * (o.bright ?? 1)), 0.7);
  const g = (o.gain ?? 0.1) * vel, s0 = Math.round(t0 * SR) - (sec.off ?? 0), n = sec.L.length;
  touch(sec, s0, s0 + len);
  for (let i = 0; i < len; i++) {
    const j = s0 + i; if (j >= n) break;
    let l = 0, r = 0;
    for (let k = 0; k < F.length; k++) { fl[k].run(tL[i]); fr[k].run(tR[i]); l += fl[k].bp * F[k][1]; r += fr[k].bp * F[k][1]; }
    lp.run(l); lp2.run(r);
    if (j >= 0) { sec.L[j] += lp.lp * g; sec.R[j] += lp2.lp * g; }
  }
}

// ---- a joker's drone: a deep glowing tone (partials a little off the harmonic series, so it beats inside itself),
// a slowly moving vowel (the grin), a sub-octave. fAt(t) in Hz and lvl(t), both in FILM seconds (glides, swells,
// cuts). Two of them a semitone apart beat against each other (the fight). Into a section, panned.
export function drone(sec, t0, t1, fAt, lvl, o = {}) {
  const off = sec.off ?? 0, n = sec.L.length, a = Math.max(0, Math.round(t0 * SR) - off), b = Math.min(n, Math.round(t1 * SR) - off);
  if (b <= a) return;
  const P = [[1, 1], [2.006, 0.6], [2.994, 0.5], [4.012, 0.36], [5.02, 0.3], [6.03, 0.2], [7.05, 0.13], [8.01, 0.1], [0.5, 0.35]];
  const r = new Rng(o.seed ?? 1), [gl, gr] = panGains(o.pan ?? 0), gain = o.gain ?? 0.06, rough = o.rough ?? 0.35;
  touch(sec, a, b);
  for (const [out, pg, sd] of [[sec.L, gl, 1], [sec.R, gr, 2]]) {
    const ph = P.map(() => r.next()), vw = new Drift((o.seed ?? 1) + sd, 0.25), dr = new Drift((o.seed ?? 1) + 10 + sd, 0.6);
    const fA = new SVF(500, 3), fB = new SVF(1200, 4), nz = new Noise((o.seed ?? 1) + 20 + sd), fz = new SVF(3000, 2);
    let f = fAt((a + off) / SR), e = lvl((a + off) / SR), de = 0, det = 1;
    for (let i = a; i < b; i++) {
      const t = (i + off) / SR;
      if (((i - a) & 31) === 0) {
        f = fAt(t); de = (lvl(t + 32 / SR) - e) / 32;
        const v = 0.5 + 0.5 * vw.at(t); fA.set(380 + 380 * v, 3); fB.set(950 + 450 * v, 4);
        det = Math.pow(2, (5 * dr.at(t) + (sd === 1 ? -3 : 3)) / 1200); fz.set(Math.min(6000, f * 24), 2);
      }
      e += de;
      let x = 0;
      for (let q = 0; q < P.length; q++) { ph[q] += f * P[q][0] * det / SR; ph[q] -= Math.floor(ph[q]); x += P[q][1] * Math.sin(TAU * ph[q]); }
      x = Math.tanh(x * (0.8 + rough));
      fA.run(x); fB.run(x); fz.run(nz.white());
      const end = b - i < 64 ? (b - i) / 64 : 1, st = i - a < 64 ? (i - a) / 64 : 1;
      out[i] += (x * 0.5 + fA.bp * 0.8 + fB.bp * 0.45 + fz.bp * 0.03) * e * gain * pg * Math.SQRT2 * end * st;
    }
  }
}

// ---- Shepard-Risset glissando: octave-spaced tones gliding up forever under a fixed bell-shaped spectrum (the rise
// that never arrives). rate(t) octaves per second and lvl(t) in FILM seconds; centre (Hz) / width (octaves) of the
// bell. A little 2nd / 3rd harmonic in each voice so a phone hears it. Into a section, wide.
const SHP = 4096, SHT = new Float32Array(SHP + 1);
for (let i = 0; i <= SHP; i++) { const x = TAU * i / SHP; SHT[i] = Math.sin(x) + 0.18 * Math.sin(2 * x) + 0.08 * Math.sin(3 * x); }
export function shepardInto(sec, t0, t1, rate, lvl, o = {}) {
  const off = sec.off ?? 0, n = sec.L.length, a = Math.max(0, Math.round(t0 * SR) - off), b = Math.min(n, Math.round(t1 * SR) - off);
  if (b <= a) return;
  const NV = 8, f0 = o.fLow ?? 40, c = Math.log2((o.centre ?? 520) / f0), w = o.width ?? 1.15, gain = o.gain ?? 0.05, dir = o.down ? -1 : 1;
  const ph = new Float64Array(NV * 2), r = new Rng(o.seed ?? 1); for (let k = 0; k < ph.length; k++) ph[k] = r.next();
  let pos = 0, e = lvl((a + off) / SR), de = 0, rt = rate((a + off) / SR);
  touch(sec, a, b);
  for (let i = a; i < b; i++) {
    const t = (i + off) / SR;
    if (((i - a) & 31) === 0) { rt = rate(t); de = (lvl(t + 32 / SR) - e) / 32; }
    e += de; pos += dir * rt / SR; pos -= Math.floor(pos);
    let l = 0, rr = 0;
    for (let k = 0; k < NV; k++) {
      const oc = (k + pos) % NV, f = f0 * Math.pow(2, oc), amp = Math.exp(-0.5 * ((oc - c) / w) ** 2);
      if (amp < 0.002 || f > SR * 0.4) continue;
      ph[k] += f / SR; ph[k] -= Math.floor(ph[k]); ph[k + NV] += f * 1.003 / SR; ph[k + NV] -= Math.floor(ph[k + NV]);
      const xa = ph[k] * SHP, ia = xa | 0, xb = ph[k + NV] * SHP, ib = xb | 0;
      l += (SHT[ia] + (SHT[ia + 1] - SHT[ia]) * (xa - ia)) * amp;
      rr += (SHT[ib] + (SHT[ib + 1] - SHT[ib]) * (xb - ib)) * amp;
    }
    const end = b - i < 128 ? (b - i) / 128 : 1, st = i - a < 128 ? (i - a) / 128 : 1;
    sec.L[i] += l * e * gain * end * st; sec.R[i] += rr * e * gain * end * st;
  }
}

// ---- the machine's tick (R3's ostinato, the presses running by themselves in 4-01): a hard little split-flap /
// latch click, six fixed variants (a machine does not vary), cached. Mono, peak ~0.5.
const flapCache = new Map();
export function flapClick(variant = 0) {
  const v = ((variant % 6) + 6) % 6, key = SR * 10 + v;
  if (flapCache.has(key)) return flapCache.get(key);
  const r = new Rng(950 + v), out = new Float32Array(Math.ceil(0.05 * SR));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0011, f0: 2600 + 900 * r.next(), q: 1.4, amp: 0.55 }, new Noise(960 + v));
  ping(out, 0, 1200 + 400 * r.next(), 0.1, [[1, 1, 0.006], [2.1, 0.4, 0.004]], r.next() * 6);
  ping(out, 0, 290 + 40 * r.next(), 0.08, [[1, 1, 0.012]], 0.3);
  const fo = Math.round(0.006 * SR); for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  flapCache.set(key, out);
  return out;
}
