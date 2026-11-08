// Sound department — rooms, bus processing, master bus and meters for JOKERS WILD (pure JS, in place,
// deterministic). From YOUR TURN / THE BIG ONE (same author, MIT); glue / limiter / monoLows / sweepLP /
// carve follow the LEVIATHAN master (MIT).
// Every buffer may be WINDOWED: `off` is the film sample index of its first sample.
// The compressor and the limiter stream (ring buffers only), so the whole 3:21 film can be mastered in
// the browser without allocating extra full-length arrays.
// Every heavy loop is a plain BLOCK function over [c0, c1) that keeps its state in an object; the plain
// export runs it over the whole range at once, the ...G generator runs it BLOCK by BLOCK and yields its
// progress (for renderScoreAsync). Same arithmetic in the same order: bit-identical either way.
import { SR, SVF, Biquad, dbToGain, gainToDb, BLOCK } from './audio-dsp.js';

// run a block function over [i0, i1) in BLOCKs, yielding progress
function* inBlocks(i0, i1, run) {
  for (let c0 = i0; c0 < i1; c0 += BLOCK) { const c1 = Math.min(i1, c0 + BLOCK); run(c0, c1); yield (c1 - i0) / Math.max(1, i1 - i0); }
}

// first / last sample index where a bus carries signal
export function activeRange(L, R, eps = 1e-7) {
  let a = 0, b = L.length - 1;
  while (a < L.length && Math.abs(L[a]) < eps && Math.abs(R[a]) < eps) a++;
  while (b > a && Math.abs(L[b]) < eps && Math.abs(R[b]) < eps) b--;
  return [a, b + 1];
}

// ---- 8-line feedback delay network with input diffusion, per-line damping and pre-delay.
// Reads the send bus (inL/inR), ADDS the wet signal into outL/outR (same window).
// o = { rt60, damp (Hz, HF damping corner), size, pre (s), wet, lo (Hz high-pass on the input), width }
function fdnSetup(inL, inR, o = {}) {
  const n = inL.length;
  let [i0, i1] = activeRange(inL, inR);
  if (i1 <= i0) return null;
  const rt = o.rt60 ?? 2, size = o.size ?? 1, wet = o.wet ?? 1, k = SR / 48000;
  i1 = Math.min(n, i1 + Math.round((rt * 1.2 + 0.2) * SR));
  const ms = [31.7, 37.3, 41.9, 47.3, 53.1, 59.3, 67.1, 73.7];
  const len = ms.map((m) => Math.round(m * 0.001 * SR * size)), lines = [], gains = new Float64Array(8), lpS = new Float64Array(8);
  let mask = 1; while (mask < Math.max(...len) + 2) mask <<= 1;
  for (let j = 0; j < 8; j++) { lines.push(new Float32Array(mask)); gains[j] = Math.pow(10, -3 * len[j] / (rt * SR)); }
  mask -= 1;
  const da = Math.exp(-2 * Math.PI * (o.damp ?? 5000) / SR);
  const pre = Math.max(1, Math.round((o.pre ?? 0.02) * SR)); let pm = 1; while (pm < pre + 2) pm <<= 1;
  const pL = new Float32Array(pm), pR = new Float32Array(pm); pm -= 1;
  const apLen = [Math.round(142 * k * size), Math.round(379 * k * size), Math.round(107 * k * size), Math.round(277 * k * size)];
  const ap = apLen.map((l) => ({ b: new Float32Array(l), i: 0, l }));
  const hpL = new SVF(o.lo ?? 120, 0.7), hpR = new SVF(o.lo ?? 120, 0.7), w = o.width ?? 1;
  return { i0, i1, len, lines, gains, lpS, mask, da, pre, pm, pL, pR, ap, hpL, hpR, w, wet, s8: 1 / Math.sqrt(8), v: new Float64Array(8), pw: 0, wp: 0 };
}
const apRun = (a, x, g) => { const d = a.b[a.i], y = d - g * x; a.b[a.i] = x + g * y; a.i = a.i + 1 === a.l ? 0 : a.i + 1; return y; };
function fdnBlock(S, inL, inR, outL, outR, c0, c1) {
  const { len, lines, gains, lpS, mask, da, pre, pm, pL, pR, ap, hpL, hpR, w, wet, s8, v } = S;
  let pw = S.pw, wp = S.wp;
  for (let i = c0; i < c1; i++) {
    hpL.run(inL[i]); hpR.run(inR[i]);
    pL[pw] = hpL.hp; pR[pw] = hpR.hp;
    const rd = (pw - pre) & pm, xl0 = pL[rd], xr0 = pR[rd]; pw = (pw + 1) & pm;
    const xl = apRun(ap[1], apRun(ap[0], xl0, 0.62), 0.62), xr = apRun(ap[3], apRun(ap[2], xr0, 0.62), 0.62);
    for (let j = 0; j < 8; j++) { const y = lines[j][(wp - len[j]) & mask]; lpS[j] = y + (lpS[j] - y) * da; v[j] = lpS[j] * gains[j]; }
    const oL = v[0] - v[2] + v[4] - v[6] + 0.5 * (v[1] - v[5]), oR = v[1] - v[3] + v[5] - v[7] + 0.5 * (v[2] - v[6]);
    const mid = (oL + oR) * 0.5, side = (oL - oR) * 0.5 * w;
    outL[i] += (mid + side) * wet * 0.35; outR[i] += (mid - side) * wet * 0.35;
    const a0 = v[0] + v[1], a1 = v[0] - v[1], a2 = v[2] + v[3], a3 = v[2] - v[3], a4 = v[4] + v[5], a5 = v[4] - v[5], a6 = v[6] + v[7], a7 = v[6] - v[7];
    const b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3, b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
    lines[0][wp] = (b0 + b4) * s8 + xl; lines[1][wp] = (b1 + b5) * s8 + xr; lines[2][wp] = (b2 + b6) * s8 + xl * 0.7; lines[3][wp] = (b3 + b7) * s8 - xr * 0.7;
    lines[4][wp] = (b0 - b4) * s8 - xl * 0.5; lines[5][wp] = (b1 - b5) * s8 + xr * 0.5; lines[6][wp] = (b2 - b6) * s8 + xl * 0.3; lines[7][wp] = (b3 - b7) * s8 + xr * 0.3;
    wp = (wp + 1) & mask;
  }
  S.pw = pw; S.wp = wp;
}
export function fdnReverb(inL, inR, outL, outR, o) { const S = fdnSetup(inL, inR, o); if (S) fdnBlock(S, inL, inR, outL, outR, S.i0, S.i1); }
export function* fdnReverbG(inL, inR, outL, outR, o) { const S = fdnSetup(inL, inR, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => fdnBlock(S, inL, inR, outL, outR, c0, c1)); }

// Stereo-linked RMS compressor with soft knee and look-ahead: the glue (streaming: a ring buffer of
// `look` samples instead of a full-length gain array). Returns the deepest gain reduction (dB).
function glueSetup(L, o = {}) {
  return { thr: o.thr ?? -18, ratio: o.ratio ?? 2.5, knee: o.knee ?? 8, n: L.length, mk: o.makeup ?? 0,
    ca: Math.exp(-1 / ((o.att ?? 0.03) * SR)), cr: Math.exp(-1 / ((o.rel ?? 0.3) * SR)),
    rc: Math.exp(-1 / ((o.rms ?? 0.012) * SR)), la: Math.max(1, Math.round((o.look ?? 0.005) * SR)), e: 1e-9, g: 0, maxGr: 0 };
}
function glueBlock(S, L, R, c0, c1) {
  const { thr, ratio, knee, n, mk, ca, cr, rc, la } = S;
  let e = S.e, g = S.g, maxGr = S.maxGr;
  for (let j = c0; j < c1; j++) {
    if (j < n) {
      const p = (L[j] * L[j] + R[j] * R[j]) * 0.5;
      e = p + (e - p) * rc;
      const db = 10 * Math.log10(e + 1e-12), over = db - thr;
      let red = 0;
      if (over > knee / 2) red = over * (1 - 1 / ratio);
      else if (over > -knee / 2) { const x = over + knee / 2; red = (1 - 1 / ratio) * x * x / (2 * knee); }
      g = red > g ? red + (g - red) * ca : red + (g - red) * cr;
      if (g > maxGr) maxGr = g;
    }
    // look-ahead: the gain detected at sample j is applied to sample j - la
    const i = j - la; if (i < 0) continue;
    const k = Math.pow(10, (mk - g) / 20);
    L[i] *= k; R[i] *= k;
  }
  S.e = e; S.g = g; S.maxGr = maxGr;
}
export function glue(L, R, o) { const S = glueSetup(L, o); glueBlock(S, L, R, 0, S.n + S.la); return S.maxGr; }
export function* glueG(L, R, o) { const S = glueSetup(L, o); yield* inBlocks(0, S.n + S.la, (c0, c1) => glueBlock(S, L, R, c0, c1)); return S.maxGr; }

// ---- true peak: 4x band-limited interpolation (windowed sinc, 16 taps per phase)
const TPH = 8, TP_MU = [0.25, 0.5, 0.75];
const TPC = TP_MU.map((mu) => {
  const c = new Float64Array(2 * TPH); let s = 0;
  const I0 = (x) => { let a = 1, t = 1; for (let k = 1; k < 20; k++) { t *= (x / (2 * k)) ** 2; a += t; } return a; };
  for (let k = -TPH + 1; k <= TPH; k++) {
    const x = k - mu, sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x), r = x / (TPH + 0.5);
    const w = Math.abs(r) >= 1 ? 0 : I0(6 * Math.sqrt(1 - r * r)) / I0(6);
    c[k + TPH - 1] = sinc * w; s += sinc * w;
  }
  for (let k = 0; k < c.length; k++) c[k] /= s;
  return c;
});
// largest |x| between samples j and j+1 of one channel (the 3 interpolated points), j in range
function interPeak(X, j) {
  let m = 0;
  for (let p = 0; p < 3; p++) {
    const c = TPC[p]; let y = 0;
    for (let k = 0; k < 2 * TPH; k++) { const q = j - TPH + 1 + k; if (q >= 0 && q < X.length) y += X[q] * c[k]; }
    const a = Math.abs(y); if (a > m) m = a;
  }
  return m;
}
// max(sample peak, inter-sample peak) of a stereo buffer; inter-sample points are only computed where
// the samples are within 6 dB of the running peak (that is where a true peak can be)
function spBlock(S, L, R, c0, c1) { let sp = S.sp; for (let i = c0; i < c1; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > sp) sp = a; if (b > sp) sp = b; } S.sp = sp; }
function tpBlock(S, L, R, c0, c1) {
  const thr = S.thr; let tp = S.tp;
  for (let i = c0; i < c1; i++) {
    if (Math.max(Math.abs(L[i]), Math.abs(L[i + 1])) > thr) { const v = interPeak(L, i); if (v > tp) tp = v; }
    if (Math.max(Math.abs(R[i]), Math.abs(R[i + 1])) > thr) { const v = interPeak(R, i); if (v > tp) tp = v; }
  }
  S.tp = tp;
}
export function truePeak(L, R, i0 = 0, i1 = L.length) {
  const S = { sp: 0, tp: 0, thr: 0 };
  spBlock(S, L, R, i0, i1); S.tp = S.sp; S.thr = S.sp * 0.5; tpBlock(S, L, R, i0, i1 - 1);
  return { sample: S.sp, true: S.tp };
}
export function* truePeakG(L, R, i0 = 0, i1 = L.length) {
  const S = { sp: 0, tp: 0, thr: 0 };
  for (const p of inBlocks(i0, i1, (c0, c1) => spBlock(S, L, R, c0, c1))) yield 0.2 * p;
  S.tp = S.sp; S.thr = S.sp * 0.5;
  for (const p of inBlocks(i0, i1 - 1, (c0, c1) => tpBlock(S, L, R, c0, c1))) yield 0.2 + 0.8 * p;
  return { sample: S.sp, true: S.tp };
}

// Look-ahead brickwall limiter on TRUE peaks (in place, streaming): neither the samples nor the 4x
// interpolated points between them exceed `ceiling` (to within the smoothing of the gain).
// Returns the deepest gain reduction in dB; `blocks` (optional array) collects the deepest gain per 0.1 s.
function limSetup(L, ceiling, la = 0.004, rel = 0.12, blocks = null) {
  const W = Math.max(2 * TPH + 2, Math.round(la * SR)), cap = W + 2;
  return { n: L.length, W, cap, dqI: new Float64Array(cap), dqV: new Float32Array(cap), gbox: new Float64Array(W), thr: ceiling * 0.5, ceiling,
    rc: 1 - Math.exp(-1 / (rel * SR)), blocks, h: 0, t: 0, g: 1, acc: 0, gr: 1 };
}
function limBlock(S, L, R, c0, c1) {
  const { n, W, cap, dqI, dqV, gbox, thr, ceiling, rc, blocks } = S;
  let h = S.h, t = S.t, g = S.g, acc = S.acc, gr = S.gr;
  for (let j = c0; j < c1; j++) {
    if (j < n) {
      let p = Math.max(Math.abs(L[j]), Math.abs(R[j]));
      if (j + 1 < n) {
        if (Math.max(Math.abs(L[j]), Math.abs(L[j + 1])) > thr) p = Math.max(p, interPeak(L, j));
        if (Math.max(Math.abs(R[j]), Math.abs(R[j + 1])) > thr) p = Math.max(p, interPeak(R, j));
      }
      const r = p > ceiling ? ceiling / p : 1;
      while (t > h && dqV[(t - 1) % cap] >= r) t--;
      dqI[t % cap] = j; dqV[t % cap] = r; t++;
    }
    const i = j - W; if (i < 0) continue;
    while (dqI[h % cap] < i) h++;
    const target = dqV[h % cap];
    g = target < g ? target : g + (target - g) * rc;
    const bi = i % W; acc += g - gbox[bi]; gbox[bi] = g;
    const k = Math.min(acc / Math.min(i + 1, W), g);
    L[i] *= k; R[i] *= k; if (k < gr) gr = k;
    if (blocks && k < 0.9999) { const b = Math.floor(i / (0.1 * SR)); if (!(blocks[b] <= k)) blocks[b] = k; }
  }
  S.h = h; S.t = t; S.g = g; S.acc = acc; S.gr = gr;
}
export function limitTP(L, R, ceiling, la, rel, blocks) { const S = limSetup(L, ceiling, la, rel, blocks); limBlock(S, L, R, 0, S.n + S.W); return gainToDb(S.gr); }
export function* limitTPG(L, R, ceiling, la, rel, blocks) { const S = limSetup(L, ceiling, la, rel, blocks); yield* inBlocks(0, S.n + S.W, (c0, c1) => limBlock(S, L, R, c0, c1)); return gainToDb(S.gr); }

// the loudness (LUFS) of one window [t0, t1) in film seconds (K-weighting warmed up 0.5 s before it)
export function windowLUFS(L, R, t0, t1, sr = SR) {
  const [pl, rl] = kWeight(sr), [pr, rr] = kWeight(sr), a = Math.max(0, Math.round((t0 - 0.5) * sr)), i0 = Math.round(t0 * sr), i1 = Math.min(L.length, Math.round(t1 * sr));
  let s = 0;
  for (let i = a; i < i1; i++) { const x = rl.run(pl.run(L[i])), y = rr.run(pr.run(R[i])); if (i >= i0) s += x * x + y * y; }
  return -0.691 + 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-30);
}

// the loudest short-term loudness (3 s windows, 0.1 s hop, K-weighted) of a stereo buffer, streaming
export function maxShortTerm(L, R, sr = SR) {
  const [pl, rl] = kWeight(sr), [pr, rr] = kWeight(sr), B = Math.round(0.1 * sr), nb = Math.floor(L.length / B), e = new Float64Array(nb);
  for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * B; i < (b + 1) * B; i++) { const x = rl.run(pl.run(L[i])), y = rr.run(pr.run(R[i])); s += x * x + y * y; } e[b] = s; }
  let best = -120, at = 0, acc = 0;
  for (let b = 0; b < nb; b++) { acc += e[b]; if (b >= 30) acc -= e[b - 30]; if (b >= 29) { const v = -0.691 + 10 * Math.log10(acc / (30 * B) + 1e-30); if (v > best) { best = v; at = (b + 1) * B / sr; } } }
  return { lufs: best, t: at };
}

// sum everything under fc to mono so the sub is solid and translates
function monoBlock(a, L, R, c0, c1) {
  for (let i = c0; i < c1; i++) {
    const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5;
    a.run(s); const sh = s - a.lp;
    L[i] = m + sh; R[i] = m - sh;
  }
}
export function monoLows(L, R, fc = 110) { monoBlock(new SVF(fc, 0.707), L, R, 0, L.length); }
export function* monoLowsG(L, R, fc = 110) { const a = new SVF(fc, 0.707); yield* inBlocks(0, L.length, (c0, c1) => monoBlock(a, L, R, c0, c1)); }

// time-varying lowpass (4-pole), cutoff fn(t) in film seconds, read every 32 samples; bypassed >= 17 kHz.
function sweepBlock(S, L, R, c0, c1) {
  const { a, b, a2, b2, fn, off, q, i0 } = S;
  let w = S.w;
  for (let i = c0; i < c1; i++) {
    if (((i - i0) & 31) === 0) { const f = fn((i + off) / SR); w = Math.max(0, Math.min(1, (17000 - f) / 6000)); a.set(f, q); b.set(f, q); a2.set(f, q); b2.set(f, q); }
    a2.run(a.run(L[i])); b2.run(b.run(R[i]));
    if (w > 0) { L[i] += (a2.lp - L[i]) * w; R[i] += (b2.lp - R[i]) * w; }
  }
  S.w = w;
}
const sweepSetup = (fn, off, q, i0) => ({ a: new SVF(18000, q), b: new SVF(18000, q), a2: new SVF(18000, q), b2: new SVF(18000, q), fn, off, q, i0, w: 0 });
export function sweepLP(L, R, fn, off = 0, q = 0.6, i0 = 0, i1 = L.length) { sweepBlock(sweepSetup(fn, off, q, i0), L, R, i0, i1); }
export function* sweepLPG(L, R, fn, off = 0, q = 0.6, i0 = 0, i1 = L.length) { const S = sweepSetup(fn, off, q, i0); yield* inBlocks(i0, i1, (c0, c1) => sweepBlock(S, L, R, c0, c1)); }

// gaps: [[t0, t1, db, rampIn, rampOut]] (film seconds) carve a bus after its room so the silence is real
export function carve(L, R, gaps, off = 0) {
  for (const [t0, t1, db, ramp = 0.006, rampOut = ramp] of gaps) {
    const g = dbToGain(db), a = Math.round((t0 - ramp) * SR) - off, b = Math.round(t0 * SR) - off, c = Math.round(t1 * SR) - off, d = Math.round((t1 + rampOut) * SR) - off;
    for (let i = Math.max(0, a); i < Math.min(L.length, d); i++) {
      const k = i < b ? 1 + (g - 1) * (i - a) / Math.max(1, b - a) : i < c ? g : g + (1 - g) * (i - c) / Math.max(1, d - c);
      L[i] *= k; R[i] *= k;
    }
  }
}

// biquad chain per channel, in place: make = () => [Biquad, ...] (all of L first, then all of R)
function eqBlock(c, x, c0, c1) { for (let i = c0; i < c1; i++) { let v = x[i]; for (let k = 0; k < c.length; k++) v = c[k].run(v); x[i] = v; } }
export function eq(L, R, make, i0 = 0, i1 = L.length) { for (const x of [L, R]) eqBlock(make(), x, i0, i1); }
export function* eqG(L, R, make, i0 = 0, i1 = L.length) {
  let ch = 0;
  for (const x of [L, R]) { const c = make(); for (const p of inBlocks(i0, i1, (c0, c1) => eqBlock(c, x, c0, c1))) yield (ch + p) / 2; ch++; }
}
export const highpass = (L, R, f) => eq(L, R, () => [Biquad.hp(f, 0.54), Biquad.hp(f, 1.31)]);
export const highpassG = (L, R, f) => eqG(L, R, () => [Biquad.hp(f, 0.54), Biquad.hp(f, 1.31)]);

// ============================================================== meters (ITU-R BS.1770-4 / EBU R128)
// K-weighting for any sample rate (the libebur128 analog-prototype formulas)
export function kWeight(sr) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr); const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const pre = new Biquad((Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr); a0 = 1 + K / Q + K * K;
  const rlb = new Biquad(1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  return [pre, rlb];
}
// cumulative K-weighted energy (sum over channels of z^2): E[i] = sum of samples < i, so any window's
// mean square is (E[b] - E[a]) / (b - a)
export function loudnessCum(L, R, sr = SR, i0 = 0, i1 = L.length) {
  const E = new Float64Array(i1 - i0 + 1), [pl, rl] = kWeight(sr), [pr, rr] = kWeight(sr);
  for (let i = i0; i < i1; i++) { const a = rl.run(pl.run(L[i])), b = rr.run(pr.run(R[i])); E[i - i0 + 1] = E[i - i0] + a * a + b * b; }
  return E;
}
// loudness (LUFS) of the window [a, b) of a cumulative energy array
export function lufs(E, a, b) { a = Math.max(0, a); b = Math.min(E.length - 1, b); if (b <= a) return -120; const ms = (E[b] - E[a]) / (b - a); return ms > 1e-13 ? -0.691 + 10 * Math.log10(ms) : -120; }
// integrated loudness (gated) and loudness range over [a, b)
export function integrated(E, a, b, sr = SR) {
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
  for (let s = a; s + blk <= b; s += hop) z.push((E[s + blk] - E[s]) / blk);
  const abs = z.filter((m) => -0.691 + 10 * Math.log10(m + 1e-30) > -70);
  if (!abs.length) return -120;
  const rel = -0.691 + 10 * Math.log10(abs.reduce((x, y) => x + y, 0) / abs.length) - 10;
  const g = abs.filter((m) => -0.691 + 10 * Math.log10(m) > rel);
  return -0.691 + 10 * Math.log10(g.reduce((x, y) => x + y, 0) / Math.max(1, g.length));
}
export function loudnessRange(E, a, b, sr = SR) {
  const blk = Math.round(3 * sr), hop = Math.round(0.1 * sr), st = [];
  for (let s = a; s + blk <= b; s += hop) { const v = lufs(E, s, s + blk); if (v > -70) st.push(v); }
  if (!st.length) return 0;
  const mean = -0.691 + 10 * Math.log10(st.map((v) => Math.pow(10, (v + 0.691) / 10)).reduce((x, y) => x + y, 0) / st.length);
  const g = st.filter((v) => v > mean - 20).sort((x, y) => x - y);
  const q = (p) => g[Math.min(g.length - 1, Math.max(0, Math.round(p * (g.length - 1))))];
  return q(0.95) - q(0.1);
}
