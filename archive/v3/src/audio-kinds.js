// Sound department — the v3 reel's picture sounds: one synth per event kind of docs/V3-REEL.md ("Sound: new event
// kinds"), plus a few the score itself uses for its ambience (grunt, stampCreak). Each is a pure function of
// (event, seed) and returns a mono Float32Array or a stereo { L, R } (panned: true when it carries its own movement);
// a sound may start BEFORE its event time: { L, R, pre } (seconds), e.g. the air a falling stamp pushes ahead of it.
// Scale: the camera lives at the height of a 5 cm paper person. From there (pov 'ant') a rubber stamp is a pile-driver
// and a card sliding over the linen is a wall coming; from a king's height (pov 'high') they are ordinary desk sounds.
// Palette: wood, rubber, linen, paper, air; the AI's sounds are glassy and tuned to its chord (D, A, E). Nothing
// cartoonish: no boings, no pops, no slide whistles.
import { SR, TAU, SVF, Noise, Drift, Rng, panGains, ping, clamp, smooth, noiseBurst, mtof, nm } from './audio-dsp.js';
import { friction, add, fadeTail, sweep } from './audio-sfxlib.js';
import { boom } from './audio-inst.js';
import { musicBox } from './audio-voices.js';

const pair = (sec) => ({ L: new Float32Array(Math.ceil(sec * SR)), R: new Float32Array(Math.ceil(sec * SR)) });
const addPan = (S, mono, pan, at = 0, g = 1) => { const [gl, gr] = panGains(pan); for (let i = Math.max(0, -at); i < mono.length && at + i < S.L.length; i++) { S.L[at + i] += mono[i] * gl * g; S.R[at + i] += mono[i] * gr * g; } };
const addMid = (S, mono, at = 0, g = 1) => { for (let i = Math.max(0, -at); i < mono.length && at + i < S.L.length; i++) { const v = mono[i] * g * Math.SQRT1_2; S.L[at + i] += v; S.R[at + i] += v; } };
const US_SIDE = new Set(['US', 'openai', 'anthropic', 'google', 'xai', 'meta']);
export const isUS = (who) => US_SIDE.has(who);
const fadeIn = (b, sec = 0.002) => { const n = Math.min(b.length, Math.round(sec * SR)); for (let i = 0; i < n; i++) b[i] *= i / n; return b; };
// a stable small integer from a string (who -> timbre variant)
const hashWho = (s) => { let h = 7; for (const c of String(s ?? '')) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };

// ---- the air a falling stamp pushes ahead of it: a low "whoom" rising toward the hit (from the ant: the shadow
// coming down over him). Into S over [0, at).
function fallAir(S, at, ant, size, seed) {
  if (at < 8) return;
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), a = new SVF(150, 0.9), b = new SVF(150, 0.9), sub = ant ? 0.5 * size : 0;
  let p = 0;
  for (let i = 0; i < at; i++) {
    const u = i / at, f = 110 + (ant ? 650 : 1500) * u * u;
    if ((i & 31) === 0) { a.set(f, 0.9); b.set(f * 1.07, 0.9); }
    a.run(nA.pink()); b.run(nB.pink());
    p += (28 + 30 * u) / SR; p -= Math.floor(p);
    const end = Math.min(1, (at - i) / (0.004 * SR)), k = at > 0.3 * SR ? 4.5 : 2.4, en = Math.pow(u, k) * (ant ? (0.9 + 0.6 * size) * (k > 3 ? 1.6 : 1) : 0.35) * end, s = Math.sin(TAU * p) * sub * Math.pow(u, k + 0.6) * end;
    S.L[i] += a.lp * en + s; S.R[i] += b.lp * en + s;
  }
}

// STAMPHIT {who, size, pov 'ant' | 'high'} — a big rubber stamp slamming the card on the wooden table.
// From the ant: a pile-driver: the fall (pre-roll, shorter when the stamps come thick: e.gap from prepareEvents),
// then the sub thump (a sine diving to 32 Hz, driven so a phone hears its harmonics), the table's wooden boom, the
// rubber's dull smack, the crack of the face on paper, the ground shaking, and a rattle of paper (the cards and the
// paper people jumping) that falls back for half a second. The biggest one (size >= 0.95) leaves a faint ringing
// in the ear. From high: a heavy desk stamp: a wooden "thock", the rubber, a paper slap.
// US kings stamp crisper (shorter boom, harder crack), CN rounder.
// e.bed (prepareEvents: the eight other kings, gain < 1): the pile-driver BED: no fall, a shorter thump, a little
// rattle, darker (farther). e.cloth (a stamp on the bare map in the frenzy): the paper crack is softer.
export function sfxStampHit(e, seed) {
  if (e.bed) return stampBed(e, seed);
  const ant = (e.pov ?? 'ant') !== 'high', size = clamp(e.size ?? 0.7), r = new Rng(seed), us = isUS(e.who), gap = e.gap ?? 1;
  const pre = ant ? clamp(Math.min(0.12 + 0.3 * size, 0.62 * gap), 0.03, 0.42) : clamp(Math.min(0.07, 0.4 * gap), 0.015, 0.07);
  const S = pair(pre + (ant ? 1.3 + 1.4 * size : 0.75)), at = Math.round(pre * SR), M = new Float32Array(S.L.length);
  fallAir(S, at, ant, size, seed);
  const crisp = us ? 0.7 : 1, pk = e.cloth ? 0.45 : 1, nz = (k) => new Noise(seed + 10 + k);
  if (ant) {
    sweep(M, at, 95 + 10 * (1 - size), 32, 0.045, (0.24 + 0.38 * size) * crisp, 0.95 * (0.45 + 0.55 * size), 0.0015, 1.8);
    ping(M, at, (us ? 64 : 57) * r.range(0.97, 1.03), 0.55 * (0.4 + 0.6 * size), [[1, 1, 0.42 * crisp], [1.93, 0.75, 0.3 * crisp], [3.05, 0.5, 0.2 * crisp], [4.4, 0.32, 0.13], [7.1, 0.15, 0.07]], r.next() * 6);
    noiseBurst(M, at, { a: 0.001, tau: 0.03 + 0.02 * size, f0: 600, q: 0.7, mode: 'lp', amp: 1.0 }, nz(1));
    noiseBurst(M, at, { a: 0.0002, tau: 0.0035 * crisp + 0.001, f0: 2400, q: 0.6, amp: (0.55 + (us ? 0.25 : 0)) * pk, hp: 500 }, nz(2));
    noiseBurst(M, at, { a: 0.0005, tau: 0.009, f0: 1500, q: 0.9, amp: 0.3 }, nz(3));
    // the ground shaking (a felt rumble)
    { const nb = new Noise(seed + 4), lp = new SVF(75, 0.7), len = Math.min(M.length - at, Math.round(1.4 * SR)); for (let i = 0; i < len; i++) { lp.run(nb.brown()); M[at + i] += lp.lp * 1.6 * size * Math.exp(-i / (0.45 * SR)) * Math.min(1, i / 200); } }
    // the paper rattle: cards and paper people jumping and falling back (wide)
    const rr = new Rng(seed + 5), dens = (t) => (1100 * Math.exp(-t / 0.1) + 90 * Math.exp(-t / 0.35)) * (0.4 + 0.6 * size);
    for (let t = 0.004; t < 0.65;) {
      const amp = rr.range(0.03, 0.15) * (0.55 + 0.45 * Math.exp(-t / 0.25)), g = new Float32Array(Math.round(0.006 * SR));
      noiseBurst(g, 0, { a: 0.0001, tau: rr.range(0.0003, 0.0014), f0: rr.range(1800, 6500), q: 1.1, amp }, new Noise(seed + 100 + Math.round(t * 1e5)));
      addPan(S, g, rr.range(-0.95, 0.95), at + Math.round(t * SR));
      t += -Math.log(1 - rr.next() * 0.999) / dens(t);
    }
    for (let k = 0; k < 7; k++) { const t = rr.range(0.07, 0.5), g = new Float32Array(Math.round(0.03 * SR)); noiseBurst(g, 0, { a: 0.0004, tau: rr.range(0.003, 0.007), f0: rr.range(900, 1800), q: 0.7, mode: 'lp', amp: rr.range(0.08, 0.2) * size }, new Noise(seed + 300 + k)); addPan(S, g, rr.range(-0.8, 0.8), at + Math.round(t * SR)); }
    // the ear ringing after the biggest one
    if (size >= 0.95) { let p = 0; const a0 = at + Math.round(0.12 * SR), len = Math.min(M.length - a0, Math.round(1.5 * SR)); for (let i = 0; i < len; i++) { p += 3150 / SR; p -= Math.floor(p); const t = i / SR; M[a0 + i] += Math.sin(TAU * p) * 0.01 * smooth(t / 0.15) * Math.exp(-t / 0.55); } }
  } else {
    sweep(M, at, 150, 62, 0.02, 0.08 + 0.05 * size, 0.55 * (0.5 + 0.5 * size), 0.001, 1.0);
    ping(M, at, (us ? 182 : 160) * r.range(0.97, 1.03), 0.32, [[1, 1, 0.09 * crisp], [1.8, 0.6, 0.06 * crisp], [2.9, 0.4, 0.04], [4.6, 0.2, 0.025]], r.next() * 6);
    noiseBurst(M, at, { a: 0.0008, tau: 0.016, f0: 1100, q: 0.7, mode: 'lp', amp: 0.85 }, nz(1));
    noiseBurst(M, at, { a: 0.0002, tau: 0.0025 * crisp + 0.001, f0: 3000, q: 0.7, amp: (0.45 + (us ? 0.2 : 0)) * pk, hp: 700 }, nz(2));
    noiseBurst(M, at + Math.round(0.004 * SR), { a: 0.0005, tau: 0.01, f0: 1900, q: 0.7, mode: 'lp', amp: 0.35 }, nz(3));
  }
  addMid(S, M, 0, Math.SQRT2);
  fadeTail(S.L, 0.08); fadeTail(S.R, 0.08);
  return { L: S.L, R: S.R, pre };
}
const bedCache = new Map();
function stampBed(e, seed) {
  // eight variants per pov (a crowd of identical machines), cached
  const ant = (e.pov ?? 'ant') !== 'high', v = seed % 8, key = `${SR}|${ant}|${v}`;
  if (bedCache.has(key)) return bedCache.get(key);
  const r = new Rng(3100 + v), M = new Float32Array(Math.ceil((ant ? 0.9 : 0.4) * SR)), S = pair(M.length / SR);
  if (ant) {
    sweep(M, 0, 88, 34, 0.04, 0.2, 0.7, 0.0015, 1.6);
    ping(M, 0, 55 * r.range(0.9, 1.15), 0.4, [[1, 1, 0.3], [1.93, 0.7, 0.2], [3.05, 0.45, 0.13]], r.next() * 6);
    noiseBurst(M, 0, { a: 0.001, tau: 0.03, f0: 420, q: 0.7, mode: 'lp', amp: 0.9 }, new Noise(3110 + v));
    noiseBurst(M, 0, { a: 0.0003, tau: 0.004, f0: 1600, q: 0.6, amp: 0.25, hp: 400 }, new Noise(3120 + v));
    for (let k = 0; k < 14; k++) { const g = new Float32Array(Math.round(0.006 * SR)); noiseBurst(g, 0, { a: 0.0001, tau: r.range(0.0004, 0.0012), f0: r.range(1500, 4500), q: 1.1, amp: r.range(0.03, 0.08) }, new Noise(3130 + v * 20 + k)); addPan(S, g, r.range(-0.9, 0.9), Math.round(r.range(0.005, 0.3) * SR)); }
  } else {
    sweep(M, 0, 140, 60, 0.02, 0.07, 0.45, 0.001, 1.0);
    ping(M, 0, 165 * r.range(0.92, 1.1), 0.25, [[1, 1, 0.07], [1.8, 0.6, 0.05], [2.9, 0.4, 0.03]], r.next() * 6);
    noiseBurst(M, 0, { a: 0.0008, tau: 0.014, f0: 900, q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(3110 + v));
    noiseBurst(M, 0, { a: 0.0002, tau: 0.002, f0: 2600, q: 0.7, amp: 0.25, hp: 600 }, new Noise(3120 + v));
  }
  addMid(S, M, 0, Math.SQRT2); fadeTail(S.L, 0.05); fadeTail(S.R, 0.05);
  bedCache.set(key, S);
  return S;
}

// STAMPMISS {size, pov} — the stamp coming down on bare cloth: the same fall (the ear expects the hit), then
// nothing it expects: a soft dead "pomf", a small thump, and one hollow, wrong note (an empty box under the cloth)
// sagging flat. No crack, no paper, no boom.
export function sfxStampMiss(e, seed) {
  const ant = e.pov === 'ant', size = clamp(e.size ?? 0.8), gap = e.gap ?? 1;
  const pre = clamp(Math.min(0.12 + 0.22 * size, 0.62 * gap), 0.03, 0.34), S = pair(pre + 1.8), at = Math.round(pre * SR), M = new Float32Array(S.L.length);
  fallAir(S, at, true, size * (ant ? 1 : 0.6), seed);
  noiseBurst(M, at, { a: 0.003, tau: 0.05, f0: 300, q: 0.6, mode: 'lp', amp: 0.95 }, new Noise(seed + 1));
  sweep(M, at, 72, 46, 0.03, 0.1, 0.5 * size, 0.003, 0.3);
  { let p = 0, q = 0; const len = Math.min(M.length - at, Math.round(1.6 * SR)); for (let i = 0; i < len; i++) { const t = i / SR, f = 152 * (1 - 0.09 * smooth(t / 0.9)); p += f / SR; q += f * 2.71 / SR; p -= Math.floor(p); q -= Math.floor(q); M[at + i] += (Math.sin(TAU * p) + 0.22 * Math.sin(TAU * q) * Math.exp(-t / 0.08)) * 0.2 * size * smooth(t / 0.006) * Math.exp(-t / 0.42); } }
  { const nb = new Noise(seed + 2), bp = new SVF(2200, 0.8), len = Math.round(0.12 * SR); for (let i = 0; i < len; i++) { bp.run(nb.white()); M[at + i] += bp.bp * 0.06 * Math.exp(-i / (0.03 * SR)); } }
  addMid(S, M, 0, Math.SQRT2);
  fadeTail(S.L, 0.1); fadeTail(S.R, 0.1);
  return { L: S.L, R: S.R, pre };
}

// STAMPLIFT {size} — the stamp lifted off the inked card: the tacky ink letting go (a run of tiny crackles
// thickening), then the rubber face comes away: a soft low "tk" (no pop)
export function sfxStampLift(e, seed) {
  const size = clamp(e.size ?? 0.6), d = 0.1 + 0.14 * size, out = new Float32Array(Math.ceil((d + 0.15) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += 1 / (260 + 2400 * Math.pow(t / d, 1.5))) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0002, 0.0007), f0: r.range(1500, 5200), q: 1.2, amp: r.range(0.04, 0.12) * (0.3 + 0.7 * t / d) }, new Noise(seed + 7 + Math.round(t * 1e5)));
  const j = Math.round(d * SR);
  noiseBurst(out, j, { a: 0.0005, tau: 0.007, f0: 650, q: 0.8, mode: 'lp', amp: 0.45 * (0.5 + size) }, new Noise(seed + 1));
  noiseBurst(out, j, { a: 0.0001, tau: 0.0015, f0: 3200, q: 1, amp: 0.15 }, new Noise(seed + 2));
  return fadeTail(out, 0.02);
}

// CARDSLIDE {dur, size, clack} — a card skidding over the linen and stopping. size ~1: heard from the ant, a wall
// coming: a coarse low roar of the weave, nearer and nearer, slowing, then a flat soft "pa" and the card settling.
// clack 0..1: the press's "咔嗒" first (its iron latch and a wooden knock), then the card is out.
export function sfxCardSlide(e, seed) {
  const d = Math.max(0.15, e.dur || 0.6), size = clamp(e.size ?? 0.6), clack = clamp(e.clack ?? 0), c0 = clack ? 0.07 : 0;
  const out = new Float32Array(Math.ceil((c0 + d + 0.4) * SR)), r = new Rng(seed);
  if (clack) {
    ping(out, 0, 1900 * r.range(0.97, 1.03), 0.14 * clack, [[1, 1, 0.02], [2.4, 0.5, 0.012], [3.9, 0.3, 0.008]], r.next() * 6);
    noiseBurst(out, 0, { a: 0.0001, tau: 0.0012, f0: 4200, q: 1, amp: 0.45 * clack }, new Noise(seed + 1));
    const b = Math.round(0.045 * SR);
    noiseBurst(out, b, { a: 0.0003, tau: 0.007, f0: 900, q: 0.8, mode: 'lp', amp: 0.6 * clack }, new Noise(seed + 2));
    ping(out, b, 250, 0.2 * clack, [[1, 1, 0.035], [2.2, 0.4, 0.015]], 1);
  }
  const s0 = Math.round(c0 * SR), n = Math.round(d * SR), nz = new Noise(seed + 3), bp = new SVF(900, 0.8), lp = new SVF(300, 0.7), dr = new Drift(seed + 4, 55);
  for (let i = 0; i < n; i++) {
    const u = i / n, speed = 1 - 0.8 * u * u;
    if ((i & 31) === 0) { bp.set((650 + 1900 * speed) * (1 - 0.4 * size), 0.85); lp.set(110 + 280 * speed, 0.7); }
    bp.run(nz.white()); lp.run(nz.brown());
    const weave = 0.5 + 0.5 * Math.abs(dr.at(i / SR * (0.4 + speed))), en = smooth(u / 0.06) * (0.3 + 0.7 * Math.pow(u, 0.55)) * (1 - smooth((u - 0.94) / 0.06));
    out[s0 + i] += (bp.bp * 0.55 * weave + lp.lp * 2.2 * size) * en * (0.45 + 0.55 * speed);
  }
  const j = s0 + n;
  noiseBurst(out, j, { a: 0.0008, tau: 0.012 + 0.014 * size, f0: 1000 + 500 * (1 - size), q: 0.7, mode: 'lp', amp: 0.75 }, new Noise(seed + 5));
  sweep(out, j, 125, 58, 0.02, 0.06 + 0.07 * size, 0.4 * size, 0.002, 0.6);
  noiseBurst(out, j, { a: 0.0002, tau: 0.002, f0: 3000, q: 0.9, amp: 0.2 }, new Noise(seed + 6));
  noiseBurst(out, j + Math.round(0.05 * SR), { a: 0.0006, tau: 0.008, f0: 1400, q: 0.7, mode: 'lp', amp: 0.12 }, new Noise(seed + 7));
  return fadeTail(out, 0.04);
}

// CARDFLY {dur, size, pan, pan2} — a card whipping away: a fast whoosh with the card's flutter in it (it spins),
// loud at once and receding (darker as it goes). The sound travels from pan to pan2 (default: across to the other
// side). size ~1: a big card low overhead (a "fwoomp" of air with a body).
export function sfxCardFly(e, seed) {
  const d = Math.max(0.15, e.dur || 0.5), size = clamp(e.size ?? 0.6), S = pair(d + 0.15), r = new Rng(seed);
  const p0 = clamp(e.pan ?? 0, -1, 1), p1 = clamp(e.pan2 ?? (p0 <= 0 ? p0 + 0.9 : p0 - 0.9), -1, 1);
  const nA = new Noise(seed), nB = new Noise(seed + 1), a = new SVF(1000, 1.2), b = new SVF(1000, 1.2), lo = new SVF(200, 0.7), lo2 = new SVF(200, 0.7);
  const spin = r.range(16, 28) * (1.25 - 0.45 * size), fLo = 520 - 260 * size, fHi = 3600 - 1700 * size;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 31) === 0) { const f = fLo + (fHi - fLo) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.95)), 1.3) * (1 - 0.35 * u); a.set(f, 1.2); b.set(f * 1.05, 1.2); lo.set(70 + 190 * (1 - u), 0.7); lo2.set(72 + 190 * (1 - u), 0.7); }
    a.run(nA.white()); b.run(nB.white()); lo.run(nA.pink()); lo2.run(nB.pink());
    const env = smooth(t / 0.02) * Math.exp(-2.2 * u) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.15)), fl = 0.4 + 0.6 * Math.pow(Math.abs(Math.sin(Math.PI * spin * t)), 1.4);
    const [gl, gr] = panGains(p0 + (p1 - p0) * smooth(u));
    S.L[i] = (a.bp * 0.8 * fl + lo.lp * 1.8 * size) * env * gl; S.R[i] = (b.bp * 0.8 * fl + lo2.lp * 1.8 * size) * env * gr;
  }
  fadeTail(S.L, 0.03); fadeTail(S.R, 0.03);
  return { L: S.L, R: S.R, panned: true };
}

// FLOCK {dur, density} — hundreds of cards flapping overhead like birds: every card a "bird" with its own wingbeat
// (7..13 Hz), flying in bursts of flaps with glides between, drifting across; under them a soft bed of moving air.
// Wide, overhead. density 0..1: how many.
const flapBank = new Map();
function wingFlap(v) {
  const key = SR * 10 + v; if (flapBank.has(key)) return flapBank.get(key);
  const r = new Rng(1200 + v), out = new Float32Array(Math.ceil(0.045 * SR)), f = r.range(900, 2600);
  noiseBurst(out, 0, { a: 0.003, tau: 0.007, f0: f, q: 1.0, amp: 0.6 }, new Noise(1210 + v));                         // the down-stroke "frr"
  noiseBurst(out, Math.round(0.002 * SR), { a: 0.0001, tau: 0.0007, f0: r.range(3500, 6000), q: 1, amp: 0.25 }, new Noise(1220 + v));   // the paper edge
  noiseBurst(out, Math.round(0.016 * SR), { a: 0.002, tau: 0.005, f0: f * 0.8, q: 1.0, amp: 0.25 }, new Noise(1230 + v));   // the up-stroke
  fadeTail(out, 0.006); flapBank.set(key, out); return out;
}
// e.rise (film seconds, optional): until then only the first few cards (a thin flutter), swelling to the full flock there
export function sfxFlock(e, seed) {
  const d = Math.max(0.5, e.dur || 4), dens = clamp(e.density ?? 0.7), S = pair(d + 0.7), r = new Rng(seed), nb = Math.round(10 + 34 * dens);
  const tr = e.rise !== undefined ? e.rise - e.t : 0, swell = (t) => (tr > 0 ? 0.3 + 0.7 * smooth((t - tr) / 0.8) : 1);
  const env = (t) => smooth(t / 0.5) * (1 - smooth((t - d + 0.6) / 0.6)) * swell(t);
  for (let k = 0; k < nb; k++) {
    const rate = r.range(7, 13), p0 = r.range(-0.95, 0.95), p1 = clamp(p0 + r.range(-0.7, 0.7), -1, 1), a = r.range(0.25, 1) / Math.sqrt(nb) * 2.2;
    let t = r.range(0, 0.9);
    while (t < d) {
      const nf = r.int(2, 7), v = r.int(0, 11);
      for (let q = 0; q < nf && t < d; q++) { const u = t / d, [gl, gr] = panGains(p0 + (p1 - p0) * u), g = a * env(t) * r.range(0.6, 1), s = wingFlap(v + (q & 1) * 12), at = Math.round(t * SR); for (let i = 0; i < s.length && at + i < S.L.length; i++) { S.L[at + i] += s[i] * g * gl; S.R[at + i] += s[i] * g * gr; } t += (1 / rate) * r.range(0.92, 1.08); }
      t += r.range(0.12, 0.65);
    }
  }
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), a = new SVF(700, 0.8), b = new SVF(760, 0.8), dr = new Drift(seed + 3, 0.4);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR; if ((i & 63) === 0) { const f = 600 + 400 * dr.at(t); a.set(f, 0.8); b.set(f * 1.1, 0.8); } a.run(nA.pink()); b.run(nB.pink()); const g = 0.12 * (0.4 + 0.6 * dens) * env(t); S.L[i] += a.bp * g; S.R[i] += b.bp * g; }
  return { L: S.L, R: S.R, panned: true };
}

// PAPERFALL {size} — a paper figure falling flat on the linen: a tiny crisp slap and a crinkle
export function sfxPaperFall(e, seed) {
  const size = clamp(e.size ?? 0.5), out = new Float32Array(Math.ceil(0.2 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0025, f0: 3200, q: 0.8, amp: 0.55 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0004, tau: 0.008 + 0.008 * size, f0: 1500, q: 0.7, mode: 'lp', amp: 0.5 }, new Noise(seed + 1));
  for (let k = 0; k < 6; k++) noiseBurst(out, Math.round(r.range(0.004, 0.07) * SR), { a: 0.0001, tau: r.range(0.0003, 0.001), f0: r.range(2500, 7000), q: 1, amp: r.range(0.05, 0.14) }, new Noise(seed + 3 + k));
  return fadeTail(out, 0.02);
}

// PAPERSTEP {size, dur?, rate?} — one tiny paper step on the linen (a soft high "tk" and the foot's paper giving);
// with dur > 0 a walk of steps (rate per second, default 3)
const stepBank = new Map();
function step(v) {
  const key = SR * 10 + v; if (stepBank.has(key)) return stepBank.get(key);
  const r = new Rng(1400 + v), out = new Float32Array(Math.ceil(0.04 * SR));
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0012, f0: r.range(2600, 4200), q: 1.1, amp: 0.45 }, new Noise(1410 + v));
  noiseBurst(out, 0, { a: 0.0006, tau: 0.004, f0: r.range(900, 1300), q: 0.7, mode: 'lp', amp: 0.3 }, new Noise(1420 + v));
  noiseBurst(out, Math.round(r.range(0.006, 0.012) * SR), { a: 0.0001, tau: 0.0005, f0: r.range(4000, 7000), q: 1, amp: 0.1 }, new Noise(1430 + v));
  fadeTail(out, 0.005); stepBank.set(key, out); return out;
}
export function sfxPaperStep(e, seed) {
  const size = clamp(e.size ?? 0.5), g = 0.6 + 0.6 * size, r = new Rng(seed);
  if (!(e.dur > 0)) { const s = step(r.int(0, 7)), out = new Float32Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s[i] * g; return out; }
  const rate = e.rate ?? 3, out = new Float32Array(Math.ceil((e.dur + 0.05) * SR));
  for (let t = 0, k = 0; t < e.dur; t += (1 / rate) * r.range(0.93, 1.07), k++) add(out, step(r.int(0, 7)), g * (k % 2 ? 0.85 : 1), Math.round(t * SR));
  return out;
}

// PAPERRUN {dur, size} — a paper person running: quick light steps (~7.5 a second, uneven), the paper body
// flapping with the stride. size ~1: a crowd of them scurrying (three runners, spread wide).
export function sfxPaperRun(e, seed) {
  const d = Math.max(0.2, e.dur || 1), size = clamp(e.size ?? 0.4), S = pair(d + 0.1), r = new Rng(seed), runners = size > 0.7 ? 4 : 1;
  for (let q = 0; q < runners; q++) {
    const pan = runners > 1 ? r.range(-0.8, 0.8) : 0, rate = r.range(6.8, 8.2), t0 = r.range(0, 0.1), mono = new Float32Array(S.L.length);
    for (let t = t0, k = 0; t < d; t += (1 / rate) * r.range(0.85, 1.15), k++) add(mono, step(r.int(0, 7)), (k % 2 ? 0.7 : 1) * r.range(0.7, 1), Math.round(t * SR));
    const nz = new Noise(seed + 9 + q), bp = new SVF(2800, 1.0);
    for (let i = 0; i < Math.round(d * SR); i++) { const t = i / SR; bp.run(nz.white()); mono[i] += bp.bp * 0.05 * Math.pow(Math.abs(Math.sin(Math.PI * rate * 0.5 * (t - t0))), 2) * smooth(t / 0.08) * (1 - smooth((t - d + 0.1) / 0.1)); }
    addPan(S, mono, pan, 0, runners > 1 ? 0.75 : 1);
  }
  return { L: S.L, R: S.R };
}

// HANDTOUCH {pitch} — the two paper hands meet: the paper people's music box sounds the motif's fifth note (D6;
// pitch = semitones from it) and the two papers touch (the faintest brush). The warmth under it is the score's.
export const TOUCH_NOTE = nm('D6');
export function sfxHandTouch(e, seed) {
  const s = musicBox(TOUCH_NOTE + (e.pitch ?? 0), 1, { seed: 77, ring: 1.25 }), out = new Float32Array(s.length + Math.round(0.02 * SR));
  noiseBurst(out, 0, { a: 0.004, tau: 0.012, f0: 3800, q: 0.9, amp: 0.025 }, new Noise(seed));
  add(out, s, 1, Math.round(0.012 * SR));
  return out;
}

// JOKERRISE {who, dur} — a joker lifting out of the river of cards like a moon coming up: the cards whirl up around
// it (a flutter climbing and quickening), its light swells (a glassy chord on its own note, CN A, US B-flat, high
// and soft, blooming), a breath of air rising. The drone that stays is the score's.
export function sfxJokerRise(e, seed) {
  const d = Math.max(0.5, e.dur || 1.5), us = isUS(e.who), S = pair(d + 1.2), r = new Rng(seed), root = us ? 70 : 69;
  // the whirl of cards
  for (let t = 0.02, k = 0; t < d * 0.9; k++) {
    const u = t / d, s = wingFlap(r.int(0, 23)), g = 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.1)), [gl, gr] = panGains(0.6 * Math.sin(TAU * 1.3 * t + r.next())), at = Math.round(t * SR);
    for (let i = 0; i < s.length && at + i < S.L.length; i++) { S.L[at + i] += s[i] * g * gl; S.R[at + i] += s[i] * g * gr; }
    t += 1 / (14 + 40 * u) * r.range(0.8, 1.2);
  }
  // the glow: a soft glassy chord (root, fifth, octave, ninth up high) blooming
  const P = [[root + 12, 1], [root + 19, 0.6], [root + 24, 0.5], [root + 26, 0.25]], ph = P.map(() => r.next() * 2), nA = new Noise(seed + 3), hp = new SVF(5000, 0.7);
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, en = Math.pow(smooth(t / (0.85 * d)), 1.5) * (t < d ? 1 : Math.exp(-(t - d) / 0.45));
    let l = 0, rr = 0;
    for (let q = 0; q < P.length; q++) { const f = mtof(P[q][0]) * (1 + 0.012 * (1 - smooth(t / d))); ph[q] += f / SR; const v = Math.sin(TAU * ph[q]) * P[q][1]; l += v * (q % 2 ? 0.7 : 1); rr += v * (q % 2 ? 1 : 0.7); }
    hp.run(nA.white());
    S.L[i] += (l * 0.05 + hp.hp * 0.01) * en; S.R[i] += (rr * 0.05 + hp.hp * 0.01) * en;
  }
  return { L: fadeTail(S.L, 0.1), R: fadeTail(S.R, 0.1) };
}

// CHARGE {dur} — the two jokers rushing at each other: a roar of air building to the end (noise opening upward), the
// cards' flutter in it quickening, a Doppler whine climbing, the pressure (a sub rising); the two sides converge to
// the middle. It ends exactly at dur (the score's digital silence follows).
export function sfxCharge(e, seed) {
  const d = Math.max(0.3, e.dur || 1.2), S = pair(d + 0.02), nA = new Noise(seed), nB = new Noise(seed + 1), a = new SVF(300, 0.9), b = new SVF(300, 0.9), lo = new SVF(80, 0.7);
  let pw = 0, ps = 0, pf = 0;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = Math.pow(u, 1.6) * smooth(t / 0.05) * (t < d ? 1 : 0);
    if ((i & 31) === 0) { const f = 220 + 3200 * Math.pow(u, 1.8); a.set(f, 0.9); b.set(f * 1.06, 0.9); lo.set(60 + 80 * u, 0.7); }
    a.run(nA.white()); b.run(nB.white()); lo.run(nA.brown());
    pf += (18 + 50 * u) / SR; pf -= Math.floor(pf); pw += (180 + 520 * u * u) / SR; pw -= Math.floor(pw); ps += (30 + 34 * u) / SR; ps -= Math.floor(ps);
    const fl = 0.6 + 0.4 * Math.abs(Math.sin(Math.PI * pf)), whine = (Math.sin(TAU * pw) + 0.35 * Math.sin(2 * TAU * pw)) * 0.12 * u, sub = Math.sin(TAU * ps) * 0.35 * u;
    const conv = 1 - u, [l1, r1] = panGains(-0.9 * conv), [l2, r2] = panGains(0.9 * conv);
    S.L[i] = (a.bp * fl * 0.55 * (l1 + l2) + whine + sub + lo.lp * 1.2 * u) * en; S.R[i] = (b.bp * fl * 0.55 * (r1 + r2) + whine + sub + lo.lp * 1.2 * u) * en;
  }
  const fo = Math.round(0.006 * SR); for (let i = 0; i < fo; i++) { const k = i / fo; S.L[S.L.length - 1 - i] *= k; S.R[S.R.length - 1 - i] *= k; }
  return { L: S.L, R: S.R, panned: true };
}

// PAIR — 王炸: the flash as the two jokers become a pair: the deepest boom (a sine diving to 26 Hz, saturated, long),
// the crack of the light, the air blasting out and down, a burst of glassy gold glints tuned to the chord (D, A, E).
// The chord itself is the score's.
export function sfxPair(e, seed) {
  const size = e.size ?? 1, S = pair(4.6), r = new Rng(seed);
  addMid(S, boom({ f0: 92, f1: 26, sweep: 0.16, tau: 1.5, dur: 4.4, drive: 2.6, gain: 0.8 }, seed), 0, Math.SQRT2 * size);
  const crack = new Float32Array(Math.round(0.35 * SR)); noiseBurst(crack, 0, { a: 0.0002, tau: 0.03, f0: 2400, q: 0.5, amp: 0.9, hp: 250 }, new Noise(seed + 1)); addMid(S, crack, 0, Math.SQRT2);
  const nA = new Noise(seed + 2), nB = new Noise(seed + 3), lA = new SVF(4000, 0.7), lB = new SVF(4000, 0.7);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, en = smooth(t / 0.008) * (0.55 * Math.exp(-t / 0.3) + 0.45 * Math.exp(-t / 1.4)) * size; if ((i & 63) === 0) { const f = 200 + 4500 * Math.exp(-t / 0.45); lA.set(f, 0.7); lB.set(f * 1.05, 0.7); } lA.run(nA.white()); lB.run(nB.white()); S.L[i] += lA.lp * 0.5 * en; S.R[i] += lB.lp * 0.5 * en; }
  const G = [74, 81, 86, 88, 93, 98, 100, 105];
  for (let k = 0; k < 36; k++) { const t = 0.01 + Math.pow(r.next(), 1.8) * 1.6, g = new Float32Array(Math.round(1.2 * SR)); ping(g, 0, mtof(r.pick(G)), 0.03 * Math.exp(-t / 0.8), [[1, 1, r.range(0.25, 0.7)], [2.76, 0.2, 0.1]], r.next() * 6); addPan(S, g, r.range(-0.9, 0.9), Math.round(t * SR)); }
  fadeTail(S.L, 0.3); fadeTail(S.R, 0.3);
  return S;
}

// FLOOD {dur} — the gold flooding out over the map: a rising shimmer (glints of gold tuned to the chord, climbing in
// register and thickening as it spreads), a soft rushing front, and in its wake the cards flipping over (a ripple of
// tiny double ticks running outward, left and right). Stereo, widening.
export function sfxFlood(e, seed) {
  const d = Math.max(0.6, e.dur || 2.4), S = pair(d + 1.0), r = new Rng(seed), G = [62, 69, 74, 76, 81, 86, 88, 93, 98, 100];
  for (let t = 0.01; t < d;) {
    const u = t / d, lo = Math.floor(u * 5), m = G[Math.min(G.length - 1, lo + r.int(0, 5))], g = new Float32Array(Math.round(0.9 * SR));
    ping(g, 0, mtof(m), 0.02 * (0.5 + 0.5 * u), [[1, 1, r.range(0.2, 0.6)], [2.76, 0.15, 0.08]], r.next() * 6);
    addPan(S, g, r.range(-1, 1) * (0.3 + 0.7 * u), Math.round(t * SR));
    t += 1 / (12 + 70 * u) * r.range(0.6, 1.4);
  }
  const flip = (at, a, f, pan) => { const g = new Float32Array(Math.round(0.03 * SR)); noiseBurst(g, 0, { a: 0.0001, tau: 0.001, f0: f, q: 1.1, amp: a }, new Noise(at + 17)); noiseBurst(g, Math.round(0.011 * SR), { a: 0.0001, tau: 0.0015, f0: f * 0.7, q: 1, amp: a * 0.7 }, new Noise(at + 29)); addPan(S, g, pan, at); };
  for (let t = 0.15; t < d; t += 1 / (40 + 260 * Math.sin(Math.PI * Math.min(1, t / d))) * r.range(0.5, 1.5)) { const u = t / d; flip(Math.round(t * SR), r.range(0.05, 0.16) * (1 - 0.4 * u), r.range(2000, 5200), r.sign() * Math.min(1, 0.15 + u * 1.1) * r.range(0.6, 1)); }
  const nA = new Noise(seed + 2), nB = new Noise(seed + 3), bA = new SVF(400, 0.9), bB = new SVF(420, 0.9);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, u = Math.min(1, t / d), en = smooth(t / 0.2) * (t < d ? 0.6 + 0.4 * Math.sin(Math.PI * u) : Math.exp(-(t - d) / 0.35)); if ((i & 63) === 0) { const f = 350 + 2200 * u; bA.set(f, 0.9); bB.set(f * 1.07, 0.9); } bA.run(nA.pink()); bB.run(nB.pink()); S.L[i] += bA.bp * 0.22 * en; S.R[i] += bB.bp * 0.22 * en; }
  fadeTail(S.L, 0.2); fadeTail(S.R, 0.2);
  return S;
}

// INHALE {dur} — the card king's deep inhale (6-01): a cavernous intake whose formants rise, thousands of cards
// sucked in with it (a rustle accelerating toward the throne), the pressure swelling underneath; it stops full, held
// (no exhale).
export function sfxInhale(e, seed) {
  const d = Math.max(0.6, e.dur || 1.8), S = pair(d + 0.5), r = new Rng(seed);
  for (const [out, sd] of [[S.L, 1], [S.R, 2]]) {
    const nz = new Noise(seed + sd), f1 = new SVF(150, 4), f2 = new SVF(450, 5), f3 = new SVF(1100, 6), lo = new SVF(60, 0.7);
    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR, u = Math.min(1, t / d), en = Math.pow(smooth(u / 0.9), 1.4) * (t < d ? 1 : Math.exp(-(t - d) / 0.06));
      if ((i & 63) === 0) { const k = 1 + 1.6 * Math.pow(u, 1.3) + (sd - 1.5) * 0.04; f1.set(150 * k, 4); f2.set(450 * k, 5); f3.set(1100 * k, 6); }
      const w = nz.white(), pk = nz.pink(); f1.run(pk); f2.run(pk); f3.run(w * 0.5 + pk * 0.5); lo.run(nz.brown());
      p += (24 + 20 * u) / SR; p -= Math.floor(p);
      out[i] += ((f1.bp * 1.1 + f2.bp * 0.7 + f3.bp * 0.35) * 0.55 + lo.lp * 1.4 * u + Math.sin(TAU * p) * 0.12 * u * u) * en;
    }
  }
  for (let t = 0.1; t < d; t += 1 / (30 + 260 * Math.pow(t / d, 2)) * r.range(0.6, 1.4)) { const s = wingFlap(r.int(0, 23)), g = 0.12 * Math.pow(t / d, 1.2), [gl, gr] = panGains(r.range(-0.9, 0.9) * (1 - 0.6 * t / d)), at = Math.round(t * SR); for (let i = 0; i < s.length && at + i < S.L.length; i++) { S.L[at + i] += s[i] * g * gl; S.R[at + i] += s[i] * g * gr; } }
  fadeTail(S.L, 0.1); fadeTail(S.R, 0.1);
  return S;
}

// FLATTEN {who, size} — 噗: a king pressed flat into a card: the air punched out of him (a soft low plosive "pu"),
// a dull thump as he gives way, a short dry crunch, then the card's flat slap. Bigger kings lower; every king his
// own variant.
export function sfxFlattenKing(e, seed) {
  const size = clamp(e.size ?? 0.8), v = hashWho(e.who), r = new Rng(seed + v), k = 0.85 + 0.3 * ((v % 7) / 6), out = new Float32Array(Math.ceil(0.8 * SR));
  noiseBurst(out, 0, { a: 0.0025, tau: 0.045, f0: 700 * k, q: 0.75, mode: 'lp', amp: 1.0 }, new Noise(seed));            // "pu"
  noiseBurst(out, 0, { a: 0.0015, tau: 0.02, f0: 1700 * k, q: 1.2, amp: 0.25 }, new Noise(seed + 1));
  sweep(out, Math.round(0.006 * SR), 115 * k, 44, 0.03, 0.1 + 0.08 * size, 0.7 * (0.6 + 0.4 * size), 0.002, 1.3);           // the body giving way
  for (let q = 0; q < 14; q++) noiseBurst(out, Math.round(r.range(0.012, 0.06) * SR), { a: 0.0001, tau: r.range(0.0005, 0.0015), f0: r.range(900, 3500), q: 1, amp: r.range(0.05, 0.13) }, new Noise(seed + 9 + q));
  const j = Math.round(0.065 * SR);                                                                                           // the card's slap
  noiseBurst(out, j, { a: 0.0004, tau: 0.008, f0: 1800, q: 0.7, mode: 'lp', amp: 0.45 }, new Noise(seed + 30));
  noiseBurst(out, j, { a: 0.0001, tau: 0.0015, f0: 4200, q: 0.9, amp: 0.2 }, new Noise(seed + 31));
  return fadeTail(out, 0.05);
}

// RIFFLE {dur, n} — a hand of cards spread into a fan: a quick run of card edges snapping past each other, fast in
// the middle and easing at the ends, sweeping left to right, with the soft slide under it
export function sfxRiffle(e, seed) {
  const d = Math.max(0.2, e.dur || 0.55), n = Math.max(4, e.n ?? 12), S = pair(d + 0.15), r = new Rng(seed);
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), t = d * (u - Math.sin(TAU * u) / (TAU * 1.25)) * 0.95, g = new Float32Array(Math.round(0.02 * SR));
    noiseBurst(g, 0, { a: 0.0001, tau: 0.0011, f0: r.range(2800, 4600), q: 1.0, amp: 0.5 }, new Noise(seed + 3 + k));
    noiseBurst(g, 0, { a: 0.0003, tau: 0.004, f0: 1400, q: 0.7, mode: 'lp', amp: 0.25 }, new Noise(seed + 40 + k));
    addPan(S, g, -0.6 + 1.2 * u, Math.round(t * SR), r.range(0.75, 1));
  }
  const nz = new Noise(seed + 1), bp = new SVF(2500, 0.9), len = Math.round(d * SR);
  for (let i = 0; i < len; i++) { const u = i / len; bp.run(nz.white()); const v = bp.bp * 0.08 * Math.sin(Math.PI * u), [gl, gr] = panGains(-0.6 + 1.2 * u); S.L[i] += v * gl; S.R[i] += v * gr; }
  return { L: S.L, R: S.R, panned: true };
}

// CARDSNICK — a card slid into the fan: a short rising slide of card on card, then a crisp little "snick" as it seats
export function sfxCardSnick(e, seed) {
  const out = new Float32Array(Math.ceil(0.3 * SR)), nz = new Noise(seed), bp = new SVF(2000, 1.0), d = Math.round(0.12 * SR);
  for (let i = 0; i < d; i++) { const u = i / d; if ((i & 31) === 0) bp.set(1800 + 2400 * u, 1.0); bp.run(nz.white()); out[i] += bp.bp * 0.2 * smooth(u / 0.3) * (0.4 + 0.6 * u); }
  noiseBurst(out, d, { a: 0.0001, tau: 0.0009, f0: 4800, q: 1, amp: 0.7 }, new Noise(seed + 1));
  noiseBurst(out, d, { a: 0.0003, tau: 0.004, f0: 1600, q: 0.7, mode: 'lp', amp: 0.25 }, new Noise(seed + 2));
  return fadeTail(out, 0.03);
}

// CARDPLAY {size} — 嗒: a card played onto the pile: a crisp flat slap, the stack under it answering (a short dull
// knock), a breath of air pushed out. IDENTICAL every time (the machine does not vary), cached.
const playCache = new Map();
export function sfxCardPlay(e) {
  const b = Math.round(clamp(e.size ?? 0.6) * 2), key = SR * 10 + b;
  if (playCache.has(key)) return playCache.get(key);
  const size = b / 2, out = new Float32Array(Math.ceil(0.35 * SR));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0009, f0: 3800, q: 0.8, amp: 0.8 }, new Noise(51));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.007 + 0.004 * size, f0: 1700, q: 0.7, mode: 'lp', amp: 0.85 }, new Noise(52));
  ping(out, 0, 255, 0.16 * (0.6 + size), [[1, 1, 0.035], [2.3, 0.4, 0.015], [3.7, 0.2, 0.008]], 0.4);
  sweep(out, 0, 110, 60, 0.015, 0.045, 0.22 * (0.5 + size), 0.001, 0.5);
  noiseBurst(out, Math.round(0.002 * SR), { a: 0.002, tau: 0.02, f0: 900, q: 0.7, mode: 'lp', amp: 0.08 }, new Noise(53));
  fadeTail(out, 0.05); playCache.set(key, out);
  return out;
}

// BOARDFLIP {dur} — the scoreboard's split-flap digits turning (97% -> 99% -> 100%): a dense chatter of small hard
// flaps across the cells, the last ones settling with a clack. Stereo (the board is wide).
export function sfxBoardFlip(e, seed) {
  const d = Math.max(0.08, e.dur || 0.25), S = pair(d + 0.12), r = new Rng(seed);
  for (let t = 0; t < d;) {
    const g = new Float32Array(Math.round(0.02 * SR)), a = r.range(0.25, 0.6);
    noiseBurst(g, 0, { a: 0.00015, tau: 0.0013, f0: r.range(2100, 3500), q: 1.6, amp: a }, new Noise(seed + Math.round(t * 1e5)));
    ping(g, 0, r.range(1050, 1650), a * 0.2, [[1, 1, 0.006], [2.1, 0.4, 0.004]], r.next() * 6);
    ping(g, 0, r.range(260, 340), a * 0.15, [[1, 1, 0.01]], 0.3);
    addPan(S, g, r.range(-0.5, 0.5), Math.round(t * SR));
    t += 1 / 220 * r.range(0.5, 1.5);
  }
  const j = Math.round(d * SR), g = new Float32Array(Math.round(0.08 * SR));
  noiseBurst(g, 0, { a: 0.0002, tau: 0.003, f0: 2200, q: 1, amp: 0.7 }, new Noise(seed + 1)); ping(g, 0, 300, 0.25, [[1, 1, 0.02], [2.2, 0.4, 0.01]], 0.2);
  addMid(S, g, j, 1.2);
  return { L: S.L, R: S.R };
}

// GRUNT {who} — 闷哼: a king's closed-mouth "hm" (reading, nodding): a short voiced nasal murmur with a falling pitch
export function sfxGrunt(e, seed) {
  const v = hashWho(e.who), f0 = 92 * (0.9 + 0.2 * ((v % 5) / 4)), d = 0.32, out = new Float32Array(Math.ceil((d + 0.1) * SR)), nz = new Noise(seed);
  const n1 = new SVF(260, 5), n2 = new SVF(1050, 3), n3 = new SVF(2400, 6), br = new SVF(1800, 0.8);
  let p = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), f = f0 * (1.12 - 0.22 * smooth(u)), en = smooth(t / 0.035) * (t < d ? 1 - 0.6 * u : Math.max(0, 0.4 - (t - d) * 6));
    p += f / SR; p -= Math.floor(p);
    let x = 0; for (let k = 1; k <= 14; k++) x += Math.sin(TAU * k * p) / Math.pow(k, 1.2);
    n1.run(x); n2.run(x); n3.run(x); br.run(nz.white());
    out[i] = (n1.bp * 0.9 + n2.bp * 0.08 + n3.bp * 0.05 + br.bp * 0.04) * en * 0.5;
  }
  return fadeTail(out, 0.02);
}

// STAMPCREAK {dur, size} — the wooden stamp handle tightening in a giant's grip ("吱"): a slow strained creak of
// hard wood, stick-slip quickening, its body answering
export function sfxStampCreak(e, seed) {
  const d = Math.max(0.2, e.dur || 0.55), size = clamp(e.size ?? 0.8), k = 1.15 - 0.35 * size;
  const out = friction(d, { modes: [[180 * k, 14, 0.7], [330 * k, 18, 1], [560 * k, 22, 0.8], [910 * k, 26, 0.45], [1500 * k, 30, 0.2]], rate: (u) => 14 + 46 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.9), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.2), gain: 0.22, drive: 1.7, jit: 0.55 }, seed);
  return fadeIn(fadeTail(out, 0.03), 0.01);
}

// PAPERWAVE {who, far} — a paper person waving: two or three soft flutters of a paper arm (far: fainter, duller)
export function sfxPaperWave(e, seed) {
  const far = !!e.far, out = new Float32Array(Math.ceil(0.9 * SR)), r = new Rng(seed), g = far ? 0.45 : 1;
  for (let k = 0, t = 0.02; k < 3; k++, t += r.range(0.2, 0.28)) {
    noiseBurst(out, Math.round(t * SR), { a: 0.012, tau: 0.03, f0: far ? 2000 : 2800, q: 0.9, amp: 0.12 * g }, new Noise(seed + k));
    for (let q = 0; q < 3; q++) noiseBurst(out, Math.round((t + r.range(0, 0.05)) * SR), { a: 0.0001, tau: 0.0006, f0: r.range(3000, far ? 4500 : 7000), q: 1, amp: r.range(0.03, 0.07) * g }, new Noise(seed + 10 + k * 3 + q));
  }
  return fadeTail(out, 0.05);
}

// PAPERUP {who} — a paper person getting up off the linen: the paper peeling from the cloth, a crinkle, a soft settle
export function sfxPaperUp(e, seed) {
  const out = new Float32Array(Math.ceil(0.7 * SR)), r = new Rng(seed), nz = new Noise(seed), bp = new SVF(2600, 0.9), d = Math.round(0.35 * SR);
  for (let i = 0; i < d; i++) { const u = i / d; bp.run(nz.white()); out[i] += bp.bp * 0.08 * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(TAU * 9 * i / SR)); }
  for (let k = 0; k < 9; k++) noiseBurst(out, Math.round(r.range(0.03, 0.4) * SR), { a: 0.0001, tau: r.range(0.0004, 0.0012), f0: r.range(2500, 6500), q: 1, amp: r.range(0.04, 0.1) }, new Noise(seed + 5 + k));
  add(out, step(r.int(0, 7)), 0.8, Math.round(0.45 * SR));
  return fadeTail(out, 0.05);
}

// FINGERDESCEND {dur} — the card king's golden fingertip coming down out of the sky: a low cold tone sinking (pure,
// no vibrato, two partials beating very slowly), a faint glassy shimmer of gold above it, air pressing down
export function sfxFingerDescend(e, seed) {
  const d = Math.max(0.5, e.dur || 1.5), S = pair(d + 0.6), nA = new Noise(seed), nB = new Noise(seed + 1), lA = new SVF(300, 0.7), lB = new SVF(300, 0.7), hA = new SVF(6000, 3), hB = new SVF(6400, 3);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(t / (0.4 * d)) * (t < d ? 1 : Math.exp(-(t - d) / 0.25));
    const f = mtof(57 - 7 * smooth(u));                                  // A3 sinking to D3
    p1 += f / SR; p2 += f * 1.0035 / SR; p3 += f * 2 / SR; p1 -= Math.floor(p1); p2 -= Math.floor(p2); p3 -= Math.floor(p3);
    if ((i & 63) === 0) { lA.set(120 + 300 * (1 - u), 0.7); lB.set(130 + 300 * (1 - u), 0.7); }
    lA.run(nA.pink()); lB.run(nB.pink()); hA.run(nA.white()); hB.run(nB.white());
    const tone = (Math.sin(TAU * p1) + Math.sin(TAU * p2) * 0.8 + 0.25 * Math.sin(TAU * p3)) * 0.09, sh = 0.012 * (0.5 + 0.5 * Math.sin(TAU * 0.7 * t));
    S.L[i] = (tone + lA.lp * 0.5 * u + hA.bp * sh) * en; S.R[i] = (tone + lB.lp * 0.5 * u + hB.bp * sh) * en;
  }
  return { L: fadeTail(S.L, 0.1), R: fadeTail(S.R, 0.1) };
}

export const REEL_KINDS = {
  paperWave: sfxPaperWave, paperUp: sfxPaperUp, fingerDescend: sfxFingerDescend,
  stampHit: sfxStampHit, stampMiss: sfxStampMiss, stampLift: sfxStampLift, cardSlide: sfxCardSlide, cardFly: sfxCardFly, flock: sfxFlock,
  paperFall: sfxPaperFall, paperStep: sfxPaperStep, paperRun: sfxPaperRun, handTouch: sfxHandTouch, jokerRise: sfxJokerRise, charge: sfxCharge,
  pair: sfxPair, flood: sfxFlood, inhale: sfxInhale, flatten: sfxFlattenKing, riffle: sfxRiffle, cardSnick: sfxCardSnick, cardPlay: sfxCardPlay,
  boardFlip: sfxBoardFlip, grunt: sfxGrunt, stampCreak: sfxStampCreak,
};
