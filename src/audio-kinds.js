// Sound department — the picture sounds: one synth per event kind. FILM_KINDS (bottom of the file) are the kinds of
// 《失控》 OUT OF CONTROL (docs/SHIKONG.md "Sound: event kinds"); V3_KINDS are the v3 reel's (kept, playable). Each is a pure function of
// (event, seed) and returns a mono Float32Array or a stereo { L, R } (panned: true when it carries its own movement);
// a sound may start BEFORE its event time: { L, R, pre } (seconds), e.g. the air a falling stamp pushes ahead of it.
// Scale: the camera lives at the height of a 5 cm paper person. From there (pov 'ant') a rubber stamp is a pile-driver
// and a card sliding over the linen is a wall coming; from a king's height (pov 'high') they are ordinary desk sounds.
// Palette: wood, rubber, linen, paper, air; the AI's sounds are glassy and tuned to its chord (D, A, E). Nothing
// cartoonish: no boings, no pops, no slide whistles.
import { SR, TAU, SVF, Noise, Drift, Rng, panGains, ping, clamp, smooth, noiseBurst, mtof, nm, drive } from './audio-dsp.js';
import { friction, add, fadeTail, sweep, sfxStormG } from './audio-sfxlib.js';
import { boom } from './audio-inst.js';
import { musicBox } from './audio-voices.js';

const pair = (sec) => ({ L: new Float32Array(Math.ceil(sec * SR)), R: new Float32Array(Math.ceil(sec * SR)) });
const addPan = (S, mono, pan, at = 0, g = 1) => { const [gl, gr] = panGains(pan); for (let i = Math.max(0, -at); i < mono.length && at + i < S.L.length; i++) { S.L[at + i] += mono[i] * gl * g; S.R[at + i] += mono[i] * gr * g; } };
const addMid = (S, mono, at = 0, g = 1) => { for (let i = Math.max(0, -at); i < mono.length && at + i < S.L.length; i++) { const v = mono[i] * g * Math.SQRT1_2; S.L[at + i] += v; S.R[at + i] += v; } };
const US_SIDE = new Set(['US', 'openai', 'anthropic', 'google', 'xai', 'meta', 'spade', 'club']);
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

// the v3 reel's kinds (「批准」): kept, still playable, not scheduled by the film
export const V3_KINDS = {
  paperWave: sfxPaperWave, paperUp: sfxPaperUp, fingerDescend: sfxFingerDescend,
  stampHit: sfxStampHit, stampMiss: sfxStampMiss, stampLift: sfxStampLift, cardSlide: sfxCardSlide, cardFly: sfxCardFly, flock: sfxFlock,
  paperFall: sfxPaperFall, paperStep: sfxPaperStep, paperRun: sfxPaperRun, handTouch: sfxHandTouch, jokerRise: sfxJokerRise, charge: sfxCharge,
  pair: sfxPair, flood: sfxFlood, inhale: sfxInhale, flatten: sfxFlattenKing, riffle: sfxRiffle, cardSnick: sfxCardSnick, cardPlay: sfxCardPlay,
  boardFlip: sfxBoardFlip, grunt: sfxGrunt, stampCreak: sfxStampCreak,
};

// ======================================================================================================================
// 《失控》 OUT OF CONTROL — the film's kinds (docs/SHIKONG.md). Scale and point of view: `pov` 'ant' (the 1-0x shots:
// macro, at the cloth: every impact is enormous and the room is far away), 'table' (hands and cards), 'far' (7-08: the
// camera high above, everything tiny). Palette: paper, linen, wood, hands, breath, iron chains, air; the AI's sounds are
// glassy or vast. Nothing cartoonish: no boings, no pops, no slide whistles.
const chink = (out, at, f, amp, ph = 0, dec = 1) => ping(out, at, f, amp, [[1, 1, 0.05 * dec], [1.83, 0.7, 0.032 * dec], [2.94, 0.45, 0.02 * dec], [4.37, 0.25, 0.012 * dec], [6.1, 0.12, 0.008 * dec]], ph);
const WOOD = [[132, 10, 0.8], [251, 14, 1], [405, 18, 0.7], [680, 22, 0.4], [1090, 26, 0.18]];
const STEELM = [[96, 35, 0.55], [214, 45, 1], [388, 55, 0.8], [652, 65, 0.6], [1043, 75, 0.35]];
// how long before its event time a sound starts (its pre-roll): the vacuums are cut to it (audio.js)
export const preOf = (e) => (e.kind === 'bigSlam' || e.kind === 'endSlam' ? 0.36 : e.kind === 'cardSlap' && e.pov === 'ant' ? 0.32 : 0);

// ANTSTEP {surface 'cloth' | 'card' | 'wood', gain} — one tripod of an ant's feet planting: three tiny dry ticks a
// hair apart (the three feet), the foot on the linen, on a card the card's plate answering, on wood a tiny knock.
// Eight fixed variants per surface (cached; e.variant picks one): the end of the film replays the opening's steps
// and they are the same waveforms.
const antBank = new Map();
export function antTick(surface, v) {
  const s = surface === 'card' ? 1 : surface === 'wood' ? 2 : surface === 'stone' ? 3 : 0, key = `${SR}|${s}|${v}`;
  if (antBank.has(key)) return antBank.get(key);
  const r = new Rng(5100 + s * 37 + v), out = new Float32Array(Math.ceil(0.045 * SR)), F = [[2600, 4300], [4200, 6600], [2000, 3500], [3600, 6400]][s];
  for (let k = 0, t = 0; k < 3; k++, t += r.range(0.0005, 0.0024)) {
    noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.00022, s === 1 ? 0.0004 : 0.00055), f0: r.range(F[0], F[1]), q: 1.05, amp: (k ? 0.7 : 1) * r.range(0.6, 0.9) }, new Noise(5200 + s * 50 + v * 4 + k));
  }
  if (s === 0) { noiseBurst(out, 0, { a: 0.0005, tau: 0.0016, f0: 1300, q: 0.7, mode: 'lp', amp: 0.16 }, new Noise(5300 + v)); if (v % 3 === 0) noiseBurst(out, Math.round(0.004 * SR), { a: 0.001, tau: 0.003, f0: 5200, q: 1.4, amp: 0.05 }, new Noise(5310 + v)); }
  if (s === 1) ping(out, 0, r.range(1500, 2300), 0.04, [[1, 1, 0.009], [2.3, 0.5, 0.005]], r.next() * 6);
  if (s === 2) ping(out, 0, r.range(850, 1300), 0.06, [[1, 1, 0.005], [2.6, 0.4, 0.003]], r.next() * 6);
  if (s === 3) ping(out, 0, r.range(2700, 3700), 0.05, [[1, 1, 0.004], [2.9, 0.4, 0.002]], r.next() * 6);   // stone: hard, a hair of ring
  fadeTail(out, 0.006); antBank.set(key, out);
  return out;
}
export function sfxAntStep(e, seed) { return antTick(e.surface ?? 'cloth', (((e.variant ?? seed) % 8) + 8) % 8); }

// ANTALERT — the startle: a stiff little burst of chitin (the antennae snapping up), a tiny quick intake, then nothing
export function sfxAntAlert(e, seed) {
  const out = new Float32Array(Math.ceil(0.45 * SR)), r = new Rng(seed);
  for (let k = 0, t = 0; k < 16; k++, t += r.range(0.0015, 0.005) * (1 + k * 0.12)) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.00015, 0.0004), f0: r.range(5000, 9000), q: 1.2, amp: r.range(0.15, 0.4) * (1 - k / 20) }, new Noise(seed + 3 + k));
  noiseBurst(out, 0, { a: 0.002, tau: 0.012, f0: 6500, q: 2.5, amp: 0.12 }, new Noise(seed + 1));
  const nz = new Noise(seed + 2), bp = new SVF(2200, 1.4), a0 = Math.round(0.09 * SR), n = Math.round(0.16 * SR);
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 31) === 0) bp.set(1800 + 1600 * u, 1.4); bp.run(nz.white()); out[a0 + i] += bp.bp * 0.13 * smooth(u / 0.5) * (1 - smooth((u - 0.85) / 0.15)); }
  return fadeTail(out, 0.02);
}

// CARDTOSS {who, size, gain, pov} — a lazy card landing on the pile: a soft 嗒 (the last flutter in the air, the flat
// landing, the pile's small knock). pov 'ant': far up the table, heard through the wood: a muffled low "dup".
export function sfxCardToss(e, seed) {
  const size = clamp(e.size ?? 0.6, 0.2, 2), r = new Rng(seed), us = isUS(e.who);
  if (e.pov === 'ant') {
    const out = new Float32Array(Math.ceil(0.5 * SR));
    noiseBurst(out, 0, { a: 0.002, tau: 0.018, f0: 380 + 120 * r.next(), q: 0.7, mode: 'lp', amp: 0.7 }, new Noise(seed));
    ping(out, 0, r.range(105, 150), 0.25, [[1, 1, 0.07], [1.9, 0.5, 0.04], [3.1, 0.25, 0.02]], r.next() * 6);
    sweep(out, 0, 110, 55, 0.02, 0.05, 0.25 * size, 0.002, 0.4);
    return fadeTail(out, 0.05);
  }
  const pre = 0.035, at = Math.round(pre * SR), out = new Float32Array(Math.ceil(0.3 * SR));
  { const nz = new Noise(seed + 5), bp = new SVF(1800, 1.2); for (let i = 0; i < at; i++) { const u = i / at; bp.run(nz.white()); out[i] += bp.bp * 0.08 * u * u * (0.5 + 0.5 * Math.abs(Math.sin(TAU * 22 * i / SR))); } }
  noiseBurst(out, at, { a: 0.0004, tau: 0.006 + 0.004 * size, f0: (us ? 1900 : 1600) * r.range(0.9, 1.1), q: 0.7, mode: 'lp', amp: 0.7 }, new Noise(seed + 1));
  noiseBurst(out, at, { a: 0.0001, tau: 0.0009, f0: 3800 * r.range(0.9, 1.15), q: 0.9, amp: 0.25 }, new Noise(seed + 2));
  ping(out, at, r.range(280, 380) / Math.sqrt(size), 0.08, [[1, 1, 0.018], [2.3, 0.4, 0.009]], r.next() * 6);
  fadeTail(out, 0.03); out.pre = pre;
  return out;
}

// CARDDRAW {who} — a card slid off the top of a deck: card on card ("shhk"), off the edge, the air as it lifts
export function sfxCardDraw(e, seed) {
  const out = new Float32Array(Math.ceil(0.32 * SR)), r = new Rng(seed), n = Math.round(r.range(0.11, 0.16) * SR), nz = new Noise(seed), bp = new SVF(2500, 1.1), lp = new SVF(900, 0.7);
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 31) === 0) bp.set(2200 + 1800 * u, 1.1); const w = nz.white(); bp.run(w); lp.run(w); out[i] += (bp.bp * 0.22 + lp.lp * 0.05) * smooth(u / 0.35) * (1 - 0.3 * u); }
  noiseBurst(out, n, { a: 0.0001, tau: 0.0008, f0: 4600, q: 1, amp: 0.45 }, new Noise(seed + 1));
  noiseBurst(out, n, { a: 0.0005, tau: 0.004, f0: 1400, q: 0.7, mode: 'lp', amp: 0.15 }, new Noise(seed + 2));
  { const nz2 = new Noise(seed + 3), b2 = new SVF(1500, 0.9), m = Math.round(0.1 * SR); for (let i = 0; i < m && n + i < out.length; i++) { const u = i / m; b2.run(nz2.white()); out[n + i] += b2.bp * 0.05 * Math.sin(Math.PI * u); } }
  return fadeTail(out, 0.02);
}

// CARDSLAP {who, size, hard 0..1, gain, pov} — 啪: a card slammed down on the pile. From the table: the palm's fleshy
// "pak", the card's crack, the pile's dull knock, the table's thump (a big card pushes air too); US kings crisper, CN
// rounder. From the ant (1-04): enormous: the air pushed ahead of the card (the pre-roll, heard in the vacuum), the
// table thumping like a drum the size of a hall, the crack like a shot, the ground shaking, crumbs and fibres jumping,
// a ringing in the ear. 'far': small and thin.
export function sfxCardSlap(e, seed) {
  if (e.pov === 'ant') return slapAnt(e, seed);
  const size = clamp(e.size ?? 1, 0.3, 3), hard = clamp(e.hard ?? 0.6), r = new Rng(seed), us = isUS(e.who), far = e.pov === 'far', crisp = us ? 1.15 : 0.95;
  const out = new Float32Array(Math.ceil((0.4 + 0.2 * Math.min(size, 2)) * SR));
  noiseBurst(out, 0, { a: 0.0005, tau: 0.008 + 0.005 * size, f0: (1300 - 260 * Math.min(1.5, Math.max(0, size - 0.5))) * r.range(0.92, 1.08), q: 0.7, mode: 'lp', amp: 0.85 }, new Noise(seed + 1));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0012 + 0.0008 * hard, f0: 4200 * crisp * r.range(0.9, 1.1), q: 0.8, amp: (0.35 + 0.45 * hard) * crisp }, new Noise(seed + 2));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0005, f0: 8500, q: 0.9, amp: 0.2 + 0.2 * hard }, new Noise(seed + 3));
  if (!far) {
    ping(out, 0, r.range(185, 250) / Math.pow(size, 0.3), 0.12 + 0.12 * hard, [[1, 1, 0.05], [2.15, 0.45, 0.025], [3.4, 0.2, 0.012]], r.next() * 6);
    sweep(out, 0, 135, 58, 0.02, 0.05 + 0.03 * size, (0.25 + 0.4 * hard) * Math.min(1.6, 0.7 + 0.3 * size), 0.0015, 0.9);
    if (size > 1.05) noiseBurst(out, 0, { a: 0.002, tau: 0.02 * Math.min(size, 2.5), f0: 300, q: 0.7, mode: 'lp', amp: 0.35 * Math.min(1.5, size - 1) }, new Noise(seed + 4));
  } else { const hp = new SVF(700, 0.7); for (let i = 0; i < out.length; i++) { hp.run(out[i]); out[i] = hp.hp * 0.8; } }
  return fadeTail(out, 0.04);
}
function slapAnt(e, seed) {
  const size = clamp(e.size ?? 1, 0.4, 1.6), hard = clamp(e.hard ?? 1), r = new Rng(seed), pre = preOf(e);
  const S = pair(pre + 2.7), at = Math.round(pre * SR), M = new Float32Array(S.L.length), nz = (k) => new Noise(seed + 10 + k);
  fallAir(S, at, true, Math.min(1, size), seed);
  sweep(M, at, 100, 30, 0.05, 0.42, 0.95, 0.0015, 1.8);
  ping(M, at, 58 * r.range(0.97, 1.03), 0.5, [[1, 1, 0.45], [1.93, 0.75, 0.32], [3.05, 0.5, 0.2], [4.4, 0.32, 0.13], [7.1, 0.15, 0.07]], r.next() * 6);
  noiseBurst(M, at, { a: 0.0008, tau: 0.045, f0: 650, q: 0.7, mode: 'lp', amp: 1.0 }, nz(1));
  noiseBurst(M, at, { a: 0.0001, tau: 0.004, f0: 2600, q: 0.55, amp: 0.95 * hard, hp: 500 }, nz(2));
  noiseBurst(M, at, { a: 0.0001, tau: 0.0012, f0: 6500, q: 0.8, amp: 0.45 }, nz(3));
  noiseBurst(M, at, { a: 0.0004, tau: 0.01, f0: 1500, q: 0.9, amp: 0.35 }, nz(4));
  { const nb = new Noise(seed + 4), lp = new SVF(75, 0.7), len = Math.min(M.length - at, Math.round(1.4 * SR)); for (let i = 0; i < len; i++) { lp.run(nb.brown()); M[at + i] += lp.lp * 1.6 * size * Math.exp(-i / (0.45 * SR)) * Math.min(1, i / 200, (len - i) / (0.25 * SR)); } }
  const rr = new Rng(seed + 5), dens = (t) => 700 * Math.exp(-t / 0.08) + 60 * Math.exp(-t / 0.3);
  for (let t = 0.004; t < 0.6;) {
    const amp = rr.range(0.03, 0.13) * (0.55 + 0.45 * Math.exp(-t / 0.25)), g = new Float32Array(Math.round(0.006 * SR));
    noiseBurst(g, 0, { a: 0.0001, tau: rr.range(0.0003, 0.0012), f0: rr.range(2200, 7000), q: 1.1, amp }, new Noise(seed + 100 + Math.round(t * 1e5)));
    addPan(S, g, rr.range(-0.95, 0.95), at + Math.round(t * SR));
    t += -Math.log(1 - rr.next() * 0.999) / dens(t);
  }
  { let p = 0; const a0 = at + Math.round(0.12 * SR), len = Math.min(M.length - a0, Math.round(1.6 * SR)); for (let i = 0; i < len; i++) { p += 3150 / SR; p -= Math.floor(p); const t = i / SR; M[a0 + i] += Math.sin(TAU * p) * 0.011 * smooth(t / 0.15) * Math.exp(-t / 0.6); } }
  addMid(S, M, 0, Math.SQRT2);
  fadeTail(S.L, 0.1); fadeTail(S.R, 0.1);
  return { L: S.L, R: S.R, pre };
}

// CARDWHOOSH {who, dur, size} — a card through the air just before its slap: the air growing as it comes (the spin's
// flutter in it), from its thrower toward the pile; it ends where the slap begins (t + dur)
export function sfxCardWhoosh(e, seed) {
  const d = Math.max(0.12, e.dur || 0.35), S = pair(d + 0.03), r = new Rng(seed), p0 = clamp(e.pan ?? 0, -1, 1), p1 = clamp(e.pan2 ?? p0 * 0.2, -1, 1), big = clamp(e.size ?? 1, 0.5, 3);
  const nA = new Noise(seed), nB = new Noise(seed + 1), a = new SVF(800, 1.3), b = new SVF(800, 1.3), lo = new SVF(200, 0.7), spin = r.range(14, 24) / Math.sqrt(big);
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 31) === 0) { const f = (600 + 2400 * Math.pow(u, 1.4)) / Math.sqrt(big); a.set(f, 1.3); b.set(f * 1.05, 1.3); lo.set(90 + 200 * u, 0.7); }
    a.run(nA.white()); b.run(nB.white()); lo.run(nA.pink());
    const env = Math.pow(u, 1.6) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.03)), fl = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(Math.PI * spin * t)), 1.5), body = lo.lp * 1.2 * Math.max(0, big - 0.4);
    const [gl, gr] = panGains(p0 + (p1 - p0) * smooth(u));
    S.L[i] = (a.bp * 0.8 * fl + body) * env * gl; S.R[i] = (b.bp * 0.8 * fl + body) * env * gr;
  }
  return { L: S.L, R: S.R, panned: true };
}

// CHATWAKE {dur} — the ChatGPT card lighting up: the flick of the light coming on, a soft warm bloom underneath, and a
// glassy shimmer settling onto the chord's tones (B-flat major, its third in it: the film's one warm moment)
export function sfxChatWake(e, seed) {
  const d = Math.max(0.8, e.dur || 2.5), S = pair(d + 1.4), r = new Rng(seed), P = [[82, 1], [86, 0.8], [89, 0.7], [94, 0.45], [98, 0.3]], ph = P.map(() => r.next());
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), hA = new SVF(5200, 0.9), hB = new SVF(5500, 0.9);
  let pl = 0, pl2 = 0;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, en = smooth(t / (0.6 * d)) * (t < d ? 1 : Math.exp(-(t - d) / 0.55)), fl = Math.exp(-t / 0.07) * smooth(t / 0.003);
    let l = 0, rr = 0;
    for (let q = 0; q < P.length; q++) { const f = mtof(P[q][0]) * (1 + 0.002 * Math.sin(TAU * (4.1 + 0.37 * q) * t + q)); ph[q] += f / SR; ph[q] -= Math.floor(ph[q]); const v = Math.sin(TAU * ph[q]) * P[q][1] * smooth((t - 0.12 * q) / 0.6); l += v * (q % 2 ? 0.55 : 1); rr += v * (q % 2 ? 1 : 0.55); }
    hA.run(nA.white()); hB.run(nB.white());
    pl += 58.27 / SR; pl -= Math.floor(pl); pl2 += 116.54 / SR; pl2 -= Math.floor(pl2);
    const bloom = (Math.sin(TAU * pl) + 0.4 * Math.sin(TAU * pl2)) * 0.22 * smooth(t / 0.35) * (t < d ? 1 - 0.5 * smooth(t / d) : 0.5 * Math.exp(-(t - d) / 0.4));
    S.L[i] = l * 0.03 * en + hA.bp * (0.05 * fl + 0.004 * en) + bloom; S.R[i] = rr * 0.03 * en + hB.bp * (0.05 * fl + 0.004 * en) + bloom;
  }
  fadeTail(S.L, 0.2); fadeTail(S.R, 0.2);
  return S;
}

// TYPING {dur, n} — the card's line writing itself: a soft click per character and a tiny glint of light on a tone of
// the warm chord; spaces are pauses; the line runs left to right. "Hello! How can I help you today?" when n fits.
const HELLO = 'Hello! How can I help you today?';
export function sfxTyping(e, seed) {
  const n = Math.max(1, e.n ?? HELLO.length), d = Math.max(0.2, e.dur || n * 0.075), text = n === HELLO.length ? HELLO : null;
  const S = pair(d + 0.5), r = new Rng(seed), G = [70, 74, 77, 82, 86, 89];
  for (let k = 0; k < n; k++) {
    const ch = text ? text[k] : 'x'; if (ch === ' ') continue;
    const at = Math.max(0, Math.round((d * k / n + r.range(-0.006, 0.006)) * SR)), g = new Float32Array(Math.round(0.25 * SR)), punct = ch === '!' || ch === '?';
    noiseBurst(g, 0, { a: 0.0001, tau: 0.0005, f0: r.range(3800, 5200), q: 1, amp: 0.35 }, new Noise(seed + 10 + k));
    noiseBurst(g, 0, { a: 0.0003, tau: 0.002, f0: 1500, q: 0.8, mode: 'lp', amp: 0.08 }, new Noise(seed + 200 + k));
    ping(g, 0, mtof(G[(ch.charCodeAt(0) + k) % G.length] + (punct ? 12 : 0)), punct ? 0.07 : 0.045, [[1, 1, 0.13], [2.01, 0.25, 0.05]], r.next() * 6);
    addPan(S, g, -0.35 + 0.7 * k / n, at);
  }
  return { L: S.L, R: S.R, panned: true };
}

// AWE {dur} — the whole table's indrawn "oh": a dozen kings drawing breath at once through an "o", a few of them voiced,
// staggered, all round the table (wide)
export function sfxAwe(e, seed) {
  const d = Math.max(0.8, e.dur || 2), S = pair(d + 0.8), r = new Rng(seed), NV = 12;
  for (let v = 0; v < NV; v++) {
    const t0 = r.range(0, 0.35), dv = r.range(0.6, 1.0), f0 = r.range(95, 175), voiced = r.range(0.05, 0.3), sc = r.range(0.88, 1.15);
    const mono = new Float32Array(Math.ceil((dv + 0.05) * SR)), nz = new Noise(seed + 10 + v), F1 = new SVF(520 * sc, 3.5), F2 = new SVF(880 * sc, 4.5), F3 = new SVF(2450 * sc, 6), air = new SVF(4200, 0.8);
    let p = 0;
    for (let i = 0; i < mono.length; i++) {
      const t = i / SR, u = t / dv, en = smooth(u / 0.4) * (1 - smooth((u - 0.6) / 0.4));
      p += f0 * (1 + 0.07 * u) / SR; p -= Math.floor(p);
      let x = 0; for (let h = 1; h <= 6; h++) x += Math.sin(TAU * h * p) / h;
      const w = nz.white(), src = nz.pink() * 2.2 + x * voiced;
      F1.run(src); F2.run(src); F3.run(src); air.run(w);
      mono[i] = (F1.bp + 0.55 * F2.bp + 0.15 * F3.bp + air.bp * 0.08) * en * 0.32;
    }
    addPan(S, fadeTail(mono, 0.02), r.range(-0.85, 0.85), Math.round(t0 * SR), r.range(0.6, 1));
  }
  return S;
}

// CHUCKLE {who} — a smug little laugh through the nose: "hn-hn-hn", three nasal pulses falling, a breath out after
const hashW = (s) => { let h = 7; for (const c of String(s ?? '')) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };
export function sfxChuckle(e, seed) {
  const r = new Rng(seed + hashW(e.who)), out = new Float32Array(Math.ceil(0.9 * SR)), f0 = r.range(102, 122), P = [0, 0.155, 0.3];
  const n1 = new SVF(250, 5), n2 = new SVF(1000, 3), n3 = new SVF(2300, 6), br = new SVF(1700, 0.9), nz = new Noise(seed);
  let p = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR; let en = 0;
    for (let k = 0; k < P.length; k++) { const x = t - P[k]; if (x > 0 && x < 0.12) en += Math.pow(Math.sin(Math.PI * x / 0.12), 1.5) * (1 - 0.25 * k); }
    const f = f0 * (1.08 - 0.14 * Math.min(1, t / 0.45)); p += f / SR; p -= Math.floor(p);
    let x = 0; for (let h = 1; h <= 12; h++) x += Math.sin(TAU * h * p) / Math.pow(h, 1.3);
    n1.run(x); n2.run(x); n3.run(x); br.run(nz.white());
    const sigh = t > 0.42 && t < 0.85 ? Math.sin(Math.PI * (t - 0.42) / 0.43) * 0.5 : 0;
    out[i] = (n1.bp * 0.8 + n2.bp * 0.1 + n3.bp * 0.04) * en * 0.45 + br.bp * 0.05 * (en + sigh);
  }
  return fadeTail(out, 0.03);
}

// SCUFFLE {dur} — two hands grabbing the same card: palms slapping the cloth, knuckles knocking, the card crumpling in
// the tug of war, sleeves (the CN side, wide)
export function sfxScuffle(e, seed) {
  const d = Math.max(0.4, e.dur || 1.2), S = pair(d + 0.4), r = new Rng(seed);
  for (let t = 0.02; t < d; t += r.range(0.06, 0.18)) {
    const g = new Float32Array(Math.round(0.16 * SR)), a = r.range(0.5, 1);
    noiseBurst(g, 0, { a: 0.0006, tau: r.range(0.008, 0.016), f0: r.range(700, 1100), q: 0.7, mode: 'lp', amp: 0.7 * a }, new Noise(seed + Math.round(t * 1e4)));
    sweep(g, 0, 140, 70, 0.015, 0.04, 0.25 * a, 0.001, 0.6);
    if (r.next() < 0.4) ping(g, 0, r.range(300, 520), 0.08 * a, [[1, 1, 0.02], [2.3, 0.4, 0.01]], r.next() * 6);
    addPan(S, g, r.range(-0.8, -0.1), Math.round(t * SR));
  }
  for (let t = 0.25 * d; t < 0.9 * d; t += r.range(0.003, 0.014)) { const g = new Float32Array(Math.round(0.006 * SR)); noiseBurst(g, 0, { a: 0.0001, tau: r.range(0.0003, 0.001), f0: r.range(2200, 6500), q: 1, amp: r.range(0.04, 0.14) }, new Noise(seed + 900 + Math.round(t * 1e4))); addPan(S, g, r.range(-0.5, -0.2), Math.round(t * SR)); }
  const nz = new Noise(seed + 1), bp = new SVF(1500, 0.8), n = Math.round(d * SR);
  for (let i = 0; i < n; i++) { const t = i / SR; bp.run(nz.white()); const v = bp.bp * 0.07 * Math.pow(Math.abs(Math.sin(TAU * 2.3 * t)), 2) * smooth(t / 0.1) * (1 - smooth((t - d + 0.15) / 0.15)); S.L[i] += v * 0.9; S.R[i] += v * 0.45; }
  return S;
}

// CARDSKIM {dur} — DeepSeek's little card skimming across the cloth ("嗖"): a fast, light skid on the weave with a thin
// whistle of air, slowing a little, travelling from him toward the tower
export function sfxCardSkim(e, seed) {
  const d = Math.max(0.25, e.dur || 0.9), S = pair(d + 0.15), nz = new Noise(seed), bp = new SVF(2400, 1.4), wv = new SVF(800, 0.9), wh = new SVF(3000, 9), dr = new Drift(seed + 1, 140);
  const p0 = e.pan ?? -0.45, p1 = e.pan2 ?? 0.15;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), sp = 1 - 0.35 * u;
    if ((i & 31) === 0) { bp.set(1800 + 1600 * sp, 1.4); wv.set(500 + 600 * sp, 0.9); wh.set(2600 + 900 * sp, 9); }
    const w = nz.white(); bp.run(w); wv.run(w); wh.run(w);
    const weave = 0.55 + 0.45 * Math.abs(dr.at(t * sp)), en = smooth(t / 0.03) * (t < d ? 0.75 + 0.25 * Math.sin(Math.PI * u) : Math.max(0, 1 - (t - d) / 0.12));
    const v = (bp.bp * 0.35 * weave + wv.bp * 0.2 * weave + wh.bp * 0.12) * en, [gl, gr] = panGains(p0 + (p1 - p0) * u);
    S.L[i] = v * gl; S.R[i] = v * gr;
  }
  return { L: S.L, R: S.R, panned: true };
}

// a small card landing on cards (twelve cached variants: the cascades are made of them)
const hitBank = new Map();
function cardHit(v) {
  const key = SR * 100 + v; if (hitBank.has(key)) return hitBank.get(key);
  const r = new Rng(6100 + v), out = new Float32Array(Math.ceil(0.08 * SR));
  noiseBurst(out, 0, { a: 0.0004, tau: r.range(0.004, 0.008), f0: r.range(1300, 2200), q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(6110 + v));
  noiseBurst(out, 0, { a: 0.0001, tau: r.range(0.0006, 0.0012), f0: r.range(3500, 5500), q: 0.9, amp: 0.3 }, new Noise(6130 + v));
  ping(out, 0, r.range(320, 520), 0.05, [[1, 1, 0.012], [2.3, 0.4, 0.007]], r.next() * 6);
  fadeTail(out, 0.01); hitBank.set(key, out); return out;
}
// TOWERCRASH {n} — the tower of cards toppling ("哗啦"): it gives (a soft paper creak), then the cascade: n cards (and
// their bounces) hitting the pile, quick and then thinning, falling away toward the US side; a slither of paper; a few
// cards skidding off
export function sfxTowerCrash(e, seed) {
  const n = Math.max(6, e.n ?? 16), S = pair(2.0), r = new Rng(seed), d = 0.85 + 0.015 * n;
  addPan(S, fadeTail(friction(0.14, { modes: [[900, 8, 0.6], [1700, 10, 1], [2900, 12, 0.5]], rate: (u) => 60 + 120 * u, env: (u) => Math.sin(Math.PI * u), gain: 0.05, drive: 1.2, jit: 0.8 }, seed), 0.02), -0.1);
  for (let k = 0; k < n * 2.5; k++) {
    const u = Math.pow(r.next(), 1.5), t = 0.1 + d * u, a = r.range(0.35, 1) * (1 - 0.6 * u) * (k < n ? 1 : 0.5);
    addPan(S, cardHit(r.int(0, 11)), clamp(-0.2 + 0.9 * u + r.range(-0.3, 0.3), -1, 1), Math.round(t * SR), a);
  }
  const nz = new Noise(seed + 1), bp = new SVF(2800, 0.9), m = Math.round((d + 0.4) * SR);
  for (let i = 0; i < m; i++) { const t = i / SR, en = smooth((t - 0.08) / 0.06) * Math.exp(-Math.max(0, t - 0.25) / 0.3); bp.run(nz.white()); const v = bp.bp * 0.16 * en, [gl, gr] = panGains(clamp(-0.1 + 0.7 * t / d, -1, 1)); S.L[i] += v * gl; S.R[i] += v * gr; }
  for (let q = 0; q < 3; q++) { const t0 = 0.25 + r.range(0, 0.5), len = Math.round(r.range(0.12, 0.25) * SR), z = new Noise(seed + 20 + q), b = new SVF(2200, 1.1), g = new Float32Array(len); for (let i = 0; i < len; i++) { const u = i / len; b.run(z.white()); g[i] = b.bp * 0.09 * Math.sin(Math.PI * u) * (1 - 0.5 * u); } addPan(S, g, r.range(0.2, 0.9), Math.round(t0 * SR)); }
  fadeTail(S.L, 0.1); fadeTail(S.R, 0.1);
  return S;
}

// BIGSLAM — the giant card (GPT-4.5) slammed down: the wall of air it pushes ahead (the pre-roll: all you hear in the
// vacuum), the table booming like a drum the size of a room, the card's huge flat "whap", the table jumping and landing
// back on its legs, the ground, cups rattling as they settle, the whole pile jumping
export function sfxBigSlam(e, seed) {
  const pre = preOf({ kind: 'bigSlam' }), S = pair(pre + 3.6), at = Math.round(pre * SR), M = new Float32Array(S.L.length), r = new Rng(seed);
  fallAir(S, at, true, 1, seed);
  add(M, boom({ f0: 105, f1: 34, sweep: 0.07, tau: 0.85, dur: 3.2, drive: 2.6, gain: 0.85 }, seed + 1), 1, at);
  ping(M, at, 61, 0.5, [[1, 1, 0.7], [1.93, 0.7, 0.45], [3.05, 0.45, 0.25], [4.4, 0.25, 0.15]], 0.3);
  noiseBurst(M, at, { a: 0.0008, tau: 0.03, f0: 1100, q: 0.6, mode: 'lp', amp: 1.0 }, new Noise(seed + 2));
  noiseBurst(M, at, { a: 0.0002, tau: 0.005, f0: 2800, q: 0.55, amp: 0.8, hp: 400 }, new Noise(seed + 3));
  const j = at + Math.round(0.075 * SR);
  sweep(M, j, 150, 60, 0.02, 0.08, 0.45, 0.001, 1.2); ping(M, j, 92, 0.25, [[1, 1, 0.12], [2.1, 0.4, 0.06]], 0.6);
  { const nb = new Noise(seed + 4), lp = new SVF(70, 0.7), len = Math.min(M.length - at, Math.round(1.8 * SR)); for (let i = 0; i < len; i++) { lp.run(nb.brown()); M[at + i] += lp.lp * 1.8 * Math.exp(-i / (0.55 * SR)) * Math.min(1, i / 200, (len - i) / (0.3 * SR)); } }
  for (let c = 0; c < 3; c++) {
    const f = r.range(1700, 2900), pan = r.range(-0.8, 0.8);
    for (let k = 0, tt = 0.05 + r.range(0, 0.05), gap = r.range(0.08, 0.12), a = r.range(0.07, 0.12); k < 10 && a > 0.004; k++, tt += gap, gap *= 0.74, a *= 0.74) {
      const g = new Float32Array(Math.round(0.22 * SR));
      ping(g, 0, f * r.range(0.995, 1.005), a, [[1, 1, 0.09], [2.32, 0.5, 0.05], [3.86, 0.3, 0.03], [5.4, 0.15, 0.02]], r.next() * 6);
      noiseBurst(g, 0, { a: 0.0001, tau: 0.0006, f0: 5500, q: 1, amp: a * 1.5 }, new Noise(seed + 50 + c * 10 + k));
      addPan(S, g, pan, at + Math.round(tt * SR));
    }
  }
  for (let k = 0; k < 40; k++) { const t = 0.02 + Math.pow(r.next(), 1.5) * 0.7; addPan(S, cardHit(r.int(0, 11)), r.range(-0.9, 0.9), at + Math.round(t * SR), r.range(0.15, 0.5) * (1 - t)); }
  addMid(S, M, 0, Math.SQRT2);
  fadeTail(S.L, 0.15); fadeTail(S.R, 0.15);
  return { L: S.L, R: S.R, pre };
}

// LAMPSWING {amp, dur} — the lamp swinging on its chains: at each end of the swing the links grind (a short iron creak)
// and clink, the swing dying away; it moves left and right
export function sfxLampSwing(e, seed) {
  const d = Math.max(1, e.dur || 6), amp = clamp(e.amp ?? 1, 0.1, 2), S = pair(d + 0.8), r = new Rng(seed), T = 2.6, tau = d / 2.2;
  const M = [[700, 18, 0.6], [1150, 24, 1], [1720, 28, 0.6], [2650, 30, 0.3]];
  for (let k = 0; k * T / 2 < d; k++) {
    const t0 = k * T / 2 + 0.12 + r.range(-0.04, 0.04), a = amp * Math.exp(-t0 / tau), side = k % 2 ? 0.45 : -0.45;
    if (a < 0.04) break;
    const cr = friction(0.26 + 0.12 * r.next(), { modes: M.map(([f, q, g]) => [f * r.range(0.95, 1.05), q, g]), rate: (u) => 25 + 45 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.4), gain: 0.16 * Math.min(1.2, a), drive: 1.3, jit: 0.6 }, seed + k);
    addPan(S, fadeTail(cr, 0.02), side, Math.round(t0 * SR));
    for (let q = 0; q < 2 + Math.round(2 * Math.min(1.5, a)); q++) { const g = new Float32Array(Math.round(0.14 * SR)); chink(g, 0, r.range(700, 1600), 0.07 * Math.min(1.3, a), r.next() * 6, 0.8); addPan(S, g, side * 0.8, Math.max(0, Math.round((t0 + r.range(-0.05, 0.14)) * SR))); }
  }
  return S;
}

// CHAIRSLIDE {who, dur} — a king's chair dragged back across the stone into the dark with him on it: a shove, then the
// two legs' stick-slip through the chair's wood and the stone's grit, sliding on and away: darker, thinner, quieter,
// out toward his end of the table
export function sfxChairBack(e, seed) {
  const d = Math.max(0.4, e.dur || 1.6), len = Math.ceil((d + 0.3) * SR), mono = new Float32Array(len);
  const speed = (u) => 0.55 + 0.45 * Math.exp(-u * 2.5), far = (u) => smooth(Math.min(1, u));
  for (const leg of [0, 1]) add(mono, friction(d, { modes: WOOD.map(([f, q, a]) => [f * (leg ? 1.09 : 1) * 1.05, q, a]), rate: (u) => (20 + 75 * speed(u)) * (leg ? 1.13 : 1), env: (u) => smooth(u / 0.03) * (1 - smooth((u - 0.9) / 0.1)) * (1 - 0.85 * far(u)), gain: 0.17, drive: 1.7, jit: 0.55, jitHz: 23 }, seed + leg * 31), leg ? 0.75 : 1);
  const nz = new Noise(seed + 2), bp = new SVF(2600, 0.9), lo = new SVF(140, 0.7), dist = new SVF(8000, 0.6), S = pair(len / SR), p0 = clamp(e.pan ?? 0, -1, 1), p1 = clamp(p0 + Math.sign(p0 || 1) * 0.5, -1, 1);
  for (let i = 0; i < len; i++) {
    const u = i / (d * SR);
    if ((i & 63) === 0) dist.set(7500 * Math.pow(600 / 7500, far(u)), 0.6);
    const en = smooth(u / 0.03) * (u < 1 ? 1 - 0.85 * far(u) : 0.15 * Math.max(0, 1 - (u - 1) * d / 0.2));
    bp.run(nz.white()); lo.run(nz.brown());
    const v = dist.run(mono[i] + bp.bp * 0.06 * speed(u) * en) + lo.lp * 0.5 * speed(u) * en, [gl, gr] = panGains(p0 + (p1 - p0) * far(u));
    S.L[i] = v * gl * Math.SQRT2; S.R[i] = v * gr * Math.SQRT2;
  }
  const fi = Math.round(0.005 * SR); for (let i = 0; i < fi; i++) { S.L[i] *= i / fi; S.R[i] *= i / fi; }
  fadeTail(S.L, 0.05); fadeTail(S.R, 0.05);
  return { L: S.L, R: S.R, panned: true };
}

// TREMBLE {who, dur} — a card shivering in a hand: its edge buzzing against the fingers in an uneven tremor (~17 Hz)
export function sfxTremble(e, seed) {
  const d = Math.max(0.5, e.dur || 2.5), out = new Float32Array(Math.ceil((d + 0.1) * SR)), nz = new Noise(seed), bp = new SVF(3200, 1.3), b2 = new SVF(1100, 1.0), dr = new Drift(seed + 1, 3), dr2 = new Drift(seed + 2, 0.7);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, u = t / d; ph += (17 + 5 * dr.at(t)) / SR; if (ph >= 1) ph -= 1;
    const w = nz.white(); bp.run(w); b2.run(w);
    const flap = Math.pow(Math.abs(Math.sin(Math.PI * ph)), 6), en = smooth(u / 0.15) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.1)) * (0.6 + 0.4 * dr2.at(t));
    out[i] = (bp.bp * 0.25 + b2.bp * 0.1) * flap * en;
  }
  return fadeTail(out, 0.03);
}

// BREATH {who, dir 'in' | 'out'} (the table's `kind: 'in' | 'out'` arrives as `dir`, see prepareEvents) — one breath,
// close: an intake through mouth and nose, rising; or a long soft breath out, falling. Every king his own size.
export function sfxBreathe(e, seed) {
  const inn = (e.dir ?? 'in') !== 'out', v = hashW(e.who), r = new Rng(seed + v), d = inn ? r.range(0.5, 0.7) : r.range(0.8, 1.1), k = 0.88 + 0.24 * ((v % 7) / 6);
  const out = new Float32Array(Math.ceil((d + 0.1) * SR)), nz = new Noise(seed), f1 = new SVF(700 * k, 1.8), f2 = new SVF(1800 * k, 2.5), air = new SVF(5000, 0.8), lo = new SVF(400, 0.7);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 63) === 0) { const s = inn ? 1 + 0.25 * u : 1 - 0.15 * u; f1.set(700 * k * s, 1.8); f2.set(1800 * k * s, 2.5); }
    const w = nz.white(), p = nz.pink(); f1.run(p); f2.run(w); air.run(w); lo.run(p);
    const en = inn ? smooth(u / 0.7) * (1 - smooth((u - 0.88) / 0.12)) : smooth(u / 0.12) * Math.pow(1 - u, 1.4);
    out[i] = (f1.bp * 0.5 + f2.bp * 0.25 + air.bp * 0.08 + lo.lp * 0.15 * (inn ? 0.5 : 1)) * en * 0.5;
  }
  return fadeTail(out, 0.02);
}

// CARDDOWN {who} — a card laid face down, very softly: its cushion of air, a little slide on the linen, the fingertips
export function sfxCardDown(e, seed) {
  const out = new Float32Array(Math.ceil(0.4 * SR)), nz = new Noise(seed + 2), bp = new SVF(2400, 1), m = Math.round(0.07 * SR), a0 = Math.round(0.02 * SR);
  noiseBurst(out, 0, { a: 0.006, tau: 0.03, f0: 650, q: 0.7, mode: 'lp', amp: 0.45 }, new Noise(seed));
  noiseBurst(out, Math.round(0.004 * SR), { a: 0.0006, tau: 0.003, f0: 2600, q: 0.8, amp: 0.08 }, new Noise(seed + 1));
  for (let i = 0; i < m; i++) { const u = i / m; bp.run(nz.white()); out[a0 + i] += bp.bp * 0.04 * Math.sin(Math.PI * u); }
  noiseBurst(out, Math.round(0.16 * SR), { a: 0.0002, tau: 0.0008, f0: 3600, q: 1, amp: 0.05 }, new Noise(seed + 3));
  return fadeTail(out, 0.03);
}

// DECKTWITCH {who} — the top card of a deck moving by itself: a tiny paper "tk", a hair of slide, settling
export function sfxDeckTwitch(e, seed) {
  const out = new Float32Array(Math.ceil(0.18 * SR)), nz = new Noise(seed + 2), bp = new SVF(3000, 1.2), m = Math.round(0.025 * SR);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0006, f0: 4300, q: 1.1, amp: 0.5 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.0025, f0: 1300, q: 0.8, mode: 'lp', amp: 0.12 }, new Noise(seed + 1));
  for (let i = 0; i < m; i++) { const u = i / m; bp.run(nz.white()); out[i + Math.round(0.003 * SR)] += bp.bp * 0.06 * Math.sin(Math.PI * u); }
  noiseBurst(out, Math.round(0.035 * SR), { a: 0.0001, tau: 0.0005, f0: 5200, q: 1, amp: 0.18 }, new Noise(seed + 3));
  return fadeTail(out, 0.01);
}

// DECKFIRE {who} — a card leaving a deck by itself: the flick off the stack's edge and the whip of air as it goes up
const fireBank = new Map();
function fireSig(v) {
  const key = SR * 100 + v; if (fireBank.has(key)) return fireBank.get(key);
  const r = new Rng(6600 + v), out = new Float32Array(Math.ceil(0.2 * SR)), nz = new Noise(6610 + v), bp = new SVF(900, 1.4), n = Math.round(r.range(0.08, 0.11) * SR), a0 = Math.round(0.004 * SR);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0012, f0: 3000 * r.range(0.9, 1.1), q: 0.9, amp: 0.6 }, new Noise(6620 + v));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.004, f0: 1100, q: 0.7, mode: 'lp', amp: 0.25 }, new Noise(6630 + v));
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 15) === 0) bp.set(900 + 2900 * u, 1.4); bp.run(nz.white()); out[a0 + i] += bp.bp * 0.55 * Math.pow(Math.sin(Math.PI * u), 2); }
  fadeTail(out, 0.02); fireBank.set(key, out); return out;
}
export function sfxDeckFire(e, seed) { return fireSig(((seed % 6) + 6) % 6); }

// STREAM {who, rate, rate1?, dur} — a deck spitting cards by itself: a flick and a whip per card, inhumanly even (rate
// per second, toward rate1 if given); under them the deck's edge chattering and the cards' flight
export function sfxStream(e, seed) {
  const d = Math.max(0.2, e.dur || 1), r0 = Math.max(1, e.rate ?? 8), r1 = Math.max(1, e.rate1 ?? r0), S = pair(d + 0.25), r = new Rng(seed);
  for (let t = 0.005, k = 0; t < d; k++) { addPan(S, fireSig(k % 6), r.range(-0.15, 0.15), Math.round(t * SR), r.range(0.85, 1)); t += (1 / (r0 + (r1 - r0) * t / d)) * r.range(0.97, 1.03); }
  const nz = new Noise(seed + 1), bp = new SVF(2200, 1.2), fl = new SVF(1400, 0.9), n = Math.round(d * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, rate = r0 + (r1 - r0) * t / d; ph += rate / SR; ph -= Math.floor(ph); const w = nz.white(); bp.run(w); fl.run(w); const en = smooth(t / 0.05) * (1 - smooth((t - d + 0.05) / 0.05)); const v = (bp.bp * 0.06 * Math.exp(-ph * 6) + fl.bp * 0.035 * Math.min(1, rate / 10)) * en; S.L[i] += v; S.R[i] += v; }
  return S;
}

// BLIZZARD {dur} — the wall of cards: thousands flapping, a cloud of snaps, the air roaring (the storm engine, full)
export function* sfxBlizzardG(e, seed) { return yield* sfxStormG({ dur: Math.max(1, e.dur || 4), size: e.size ?? 0.9 }, seed); }
export const sfxBlizzard = (e, seed) => drive(sfxBlizzardG(e, seed));

// STOP — everything stops dead: the cut itself is the sound (nothing; the master gates the silence after it)
export function sfxStop() { return new Float32Array(1); }

// CARDSFALL {n, dur} — the cards in the air dropping back onto the table: a rain of small cards and a 哗
export function sfxCardsFall(e, seed) {
  const d = Math.max(0.3, e.dur || 1), n = Math.max(10, e.n ?? 40), S = pair(d + 0.6), r = new Rng(seed);
  for (let k = 0; k < n; k++) { const t = d * Math.pow(r.next(), 1.4); addPan(S, cardHit(r.int(0, 11)), r.range(-0.9, 0.9), Math.round(t * SR), r.range(0.3, 0.9) * (1 - 0.5 * t / d)); }
  const nz = new Noise(seed + 1), bp = new SVF(2600, 0.9), m = Math.round((d + 0.2) * SR);
  for (let i = 0; i < m; i++) { const t = i / SR; bp.run(nz.white()); const v = bp.bp * 0.12 * smooth(t / 0.05) * Math.exp(-t / (0.5 * d)); S.L[i] += v; S.R[i] += v; }
  return S;
}

// CARDSTAND {i} — one card on the mountain standing up on its edge: its edge dragging up over the cards below (a short
// soft scrape), the "tk" as it stands, its edge ringing a hair, a breath of air as it turns toward them
function standTick(v, strong = 1) {
  const r = new Rng(6800 + v), out = new Float32Array(Math.ceil(0.45 * SR)), n = Math.round(r.range(0.08, 0.13) * SR), nz = new Noise(6810 + v), bp = new SVF(3000, 1.3);
  for (let k = 0; k < n; k++) { const u = k / n; if ((k & 31) === 0) bp.set(2600 + 2200 * u, 1.3); bp.run(nz.white()); out[k] += bp.bp * 0.12 * smooth(u / 0.4) * (0.4 + 0.6 * u); }
  noiseBurst(out, n, { a: 0.0001, tau: 0.0007, f0: 4800 * r.range(0.92, 1.08), q: 1, amp: 0.6 * strong }, new Noise(6820 + v));
  noiseBurst(out, n, { a: 0.0003, tau: 0.003, f0: 1500, q: 0.8, mode: 'lp', amp: 0.18 }, new Noise(6830 + v));
  ping(out, n, r.range(1900, 2600), 0.03 * strong, [[1, 1, 0.012]], r.next() * 6);
  const nz2 = new Noise(6840 + v), b2 = new SVF(1400, 0.9), a0 = n + Math.round(0.06 * SR), m = Math.round(0.18 * SR);
  for (let i = 0; i < m && a0 + i < out.length; i++) { b2.run(nz2.white()); out[a0 + i] += b2.bp * 0.035 * Math.sin(Math.PI * i / m); }
  return fadeTail(out, 0.03);
}
export function sfxCardStand(e, seed) { return standTick((e.i ?? 0) * 7 + (((seed % 5) + 5) % 5), (e.i ?? 0) === 0 ? 1.2 : 1); }

// STANDWAVE {dur} — the whole mountain standing up like a crowd turning its head: the ticks thicken into a surge of paper
// ("哗——") sweeping across, and stop at once
const waveBank = new Map();
function waveTick(v) { const key = SR * 100 + v; if (!waveBank.has(key)) waveBank.set(key, standTick(100 + v).subarray(0, Math.round(0.2 * SR))); return waveBank.get(key); }
export function sfxStandWave(e, seed) {
  const d = Math.max(0.8, e.dur || 2.8), S = pair(d + 0.5), r = new Rng(seed), dens = (u) => 4 + 700 * Math.pow(smooth(u / 0.8), 2.2);
  for (let t = 0.02; t < d * 0.985;) { const u = t / d; addPan(S, waveTick(r.int(0, 15)), clamp(-0.9 + 1.8 * u + r.range(-0.5, 0.5), -1, 1), Math.round(t * SR), r.range(0.4, 1) * (0.55 + 0.45 * (1 - u))); t += -Math.log(1 - r.next() * 0.999) / dens(u); }
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), bA = new SVF(3500, 0.8), bB = new SVF(3700, 0.8), n = Math.round(d * SR);
  for (let i = 0; i < n; i++) { const u = i / n, en = Math.pow(smooth(u / 0.85), 2) * (1 - smooth((u - 0.965) / 0.035)); bA.run(nA.white()); bB.run(nB.white()); const [gl, gr] = panGains(clamp(-0.8 + 1.6 * u, -1, 1)); S.L[i] += bA.bp * 0.22 * en * gl * Math.SQRT2; S.R[i] += bB.bp * 0.22 * en * gr * Math.SQRT2; }
  return { L: S.L, R: S.R, panned: true };
}

// RISE {dur} — the cards lifting and spiralling up past the lamp: the wind of the vortex circling the room, thousands of
// cards fluttering up and away into the dark (their flutter climbing, thinning as they go)
export const sfxRise = (e, seed) => drive(sfxRiseG(e, seed));
export function* sfxRiseG(e, seed) {
  const d = Math.max(1, e.dur || 4), S = pair(d + 1.6), r = new Rng(seed), nA = new Noise(seed), nB = new Noise(seed + 1), lA = new SVF(300, 0.7), lB = new SVF(300, 0.7), bA = new SVF(900, 1.1), bB = new SVF(950, 1.1);
  let ph = 0;
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(t / (0.3 * d)) * (t < d ? 1 - 0.55 * smooth((u - 0.6) / 0.4) : 0.45 * Math.exp(-(t - d) / 0.5));
    ph += (0.25 + 0.6 * u) / SR;
    if ((i & 63) === 0) { const f = 260 + 900 * u; lA.set(f, 0.7); lB.set(f * 1.06, 0.7); bA.set(900 + 2200 * u, 1.1); bB.set(980 + 2200 * u, 1.1); }
    lA.run(nA.pink()); lB.run(nB.pink()); bA.run(nA.white()); bB.run(nB.white());
    const [gl, gr] = panGains(0.7 * Math.sin(TAU * ph));
    S.L[i] = (lA.lp * 0.9 + bA.bp * 0.16) * en * (0.6 + 0.55 * gl); S.R[i] = (lB.lp * 0.9 + bB.bp * 0.16) * en * (0.6 + 0.55 * gr);
  }
  yield undefined;
  for (let v = 0; v < 14; v++) {
    yield undefined;
    const nz = new Noise(seed + 100 + v), bp = new SVF(1200, 1.2), rate = r.range(12, 30), p0 = r.next(), a = r.range(0.4, 1) / Math.sqrt(14), st = r.range(0, 0.4) * d;
    let fp = r.next(), q = p0;
    for (let i = Math.round(st * SR); i < S.L.length; i++) {
      const t = i / SR, u = Math.min(1, t / d); fp += rate * (1 + 0.6 * u) / SR; if (fp >= 1) fp -= 1; q += (0.25 + 0.6 * u) / SR;
      if ((i & 63) === 0) bp.set(Math.min(9000, (1200 + 2400 * u) * (1 + v * 0.05)), 1.2);
      bp.run(nz.white());
      const flap = Math.pow(Math.abs(Math.sin(Math.PI * fp)), 3), en = smooth((t - st) / 0.3) * (t < d ? 1 - 0.7 * u : 0.3 * Math.exp(-(t - d) / 0.4)), [gl, gr] = panGains(0.85 * Math.sin(TAU * q));
      const x = bp.bp * flap * a * en * 0.8; S.L[i] += x * gl; S.R[i] += x * gr;
    }
  }
  fadeTail(S.L, 0.2); fadeTail(S.R, 0.2);
  return { L: S.L, R: S.R, panned: true };
}

// LAMPSPIN {dur} — the lamp twisting on its chains in that wind: the chain groaning under torsion, the links clinking
// faster as it spins up, the image turning
export function sfxLampSpin(e, seed) {
  const d = Math.max(1, e.dur || 4), S = pair(d + 0.6), r = new Rng(seed);
  const tw = friction(d, { modes: STEELM.map(([f, q, a]) => [f * 1.6, q, a]), rate: (u) => 6 + 24 * Math.sin(Math.PI * Math.min(1, u * 1.1)), env: (u) => smooth(u / 0.15) * (1 - smooth((u - 0.8) / 0.2)), gain: 0.2, drive: 1.6, jit: 0.7, jitHz: 7 }, seed);
  addPan(S, fadeTail(tw, 0.05), 0, 0, 1.2);
  for (let t = 0.1; t < d * 0.95;) { const g = new Float32Array(Math.round(0.14 * SR)), u = t / d; chink(g, 0, r.range(800, 1700), 0.06 * (0.4 + 0.6 * Math.sin(Math.PI * u)), r.next() * 6, 0.8); addPan(S, g, 0.6 * Math.sin(TAU * 0.6 * t * (1 + u)), Math.round(t * SR)); t += r.range(0.05, 0.22) * (1.25 - 0.7 * Math.sin(Math.PI * u)); }
  return S;
}

// FARSLAP {size, dist} — the AI's vast cards meeting far up in the dark: thunder. The low boom arrives first and long, the
// crack comes softened and late, and the roll rumbles on across the sky
export function sfxFarSlap(e, seed) {
  const size = clamp(e.size ?? 1, 0.3, 2), dist = clamp(e.dist ?? 1, 0.2, 3), S = pair(5.5), r = new Rng(seed), M = new Float32Array(S.L.length);
  add(M, boom({ f0: 72, f1: 28, sweep: 0.15, tau: 1.2, dur: 4.5, drive: 1.6, nf: 160, gain: 0.7 * size }, seed), 1, Math.round(0.02 * SR));
  const cr = new Float32Array(Math.round(1.2 * SR)); noiseBurst(cr, 0, { a: 0.004 * dist, tau: 0.08, f0: 900 / dist, q: 0.6, mode: 'lp', amp: 0.5 * size }, new Noise(seed + 1));
  add(M, cr, 1, Math.round((0.06 + 0.08 * dist) * SR));
  addMid(S, M, 0, Math.SQRT2);
  for (let k = 0, t = 0.05; k < 6; k++, t += r.range(0.3, 0.75) * (1 + 0.25 * k)) {
    const a = Math.exp(-k / 2.3) * size, len = Math.round(r.range(0.6, 1.3) * SR), nz = new Noise(seed + 10 + k), lp = new SVF(r.range(110, 220) / Math.sqrt(dist), 0.8), g = new Float32Array(len);
    for (let i = 0; i < len; i++) { const u = i / len; lp.run(nz.brown()); g[i] = lp.lp * 2.4 * a * smooth(u / 0.12) * Math.pow(1 - u, 1.6); }
    addPan(S, g, r.range(-0.8, 0.8), Math.round(t * SR));
  }
  fadeTail(S.L, 0.3); fadeTail(S.R, 0.3);
  return S;
}

// LEAFFALL {dur} — a card floating down like a leaf: each see-saw swing a soft breath of air (strongest through the
// middle of the swing), the faintest flutter, the sound swinging left and right with it
export function sfxLeafFall(e, seed) {
  const d = Math.max(0.6, e.dur || 3), S = pair(d + 0.3), r = new Rng(seed), T = r.range(0.75, 0.95), ph0 = r.next(), nA = new Noise(seed), bp = new SVF(1200, 1.2), fl = new SVF(3200, 1.6);
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, x = TAU * (t / T + ph0), sp = Math.abs(Math.cos(x));
    if ((i & 63) === 0) bp.set(700 + 900 * sp, 1.2);
    const w = nA.white(); bp.run(w); fl.run(w);
    const en = smooth(t / 0.4) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.3)), flut = 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(Math.PI * 15 * t)), 3);
    const v = (bp.bp * 0.12 * sp * sp + fl.bp * 0.02 * flut * sp) * en, [gl, gr] = panGains(0.5 * Math.sin(x));
    S.L[i] = v * gl; S.R[i] = v * gr;
  }
  return { L: S.L, R: S.R, panned: true };
}

// CARDTAP {who} — it lands, face down: a tiny soft "嗒" on the linen
export function sfxCardTap(e, seed) {
  const out = new Float32Array(Math.ceil(0.2 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0005, tau: 0.005, f0: 1300 * r.range(0.9, 1.1), q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0008, f0: 3500, q: 0.9, amp: 0.18 }, new Noise(seed + 1));
  noiseBurst(out, Math.round(0.002 * SR), { a: 0.003, tau: 0.012, f0: 500, q: 0.7, mode: 'lp', amp: 0.15 }, new Noise(seed + 2));
  return fadeTail(out, 0.02);
}

// PEEK {who} — a card corner lifted: the corner flexing (a little crinkle), coming away from the cloth with a soft "tk"
export function sfxPeek(e, seed) {
  const out = new Float32Array(Math.ceil(0.3 * SR)), r = new Rng(seed), nz = new Noise(seed + 9), bp = new SVF(2000, 1), m = Math.round(0.09 * SR);
  for (let k = 0; k < 5; k++) noiseBurst(out, Math.round(r.range(0, 0.06) * SR), { a: 0.0001, tau: r.range(0.0002, 0.0006), f0: r.range(4000, 7000), q: 1, amp: r.range(0.06, 0.14) }, new Noise(seed + k));
  for (let i = 0; i < m; i++) { bp.run(nz.white()); out[i] += bp.bp * 0.03 * Math.sin(Math.PI * i / m); }
  noiseBurst(out, Math.round(0.075 * SR), { a: 0.0001, tau: 0.0007, f0: 3800, q: 1, amp: 0.25 }, new Noise(seed + 6));
  return fadeTail(out, 0.02);
}

// SMALLSLAP {who, gain, pov} — the kings playing again: a small, light 啪 (paper and a light palm, a small knock); eight
// fixed variants (the same game). 'far': thinner and dry. (7-08: prepareEvents crossfades them into the ant's steps.)
const smallBank = new Map();
export function sfxSmallSlap(e, seed) {
  const far = e.pov === 'far', v = ((seed % 8) + 8) % 8, key = `${SR}|${far}|${v}`;
  if (smallBank.has(key)) return smallBank.get(key);
  const r = new Rng(7000 + v), out = new Float32Array(Math.ceil(0.25 * SR));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0011, f0: 4100 * r.range(0.9, 1.1), q: 0.85, amp: 0.6 }, new Noise(7010 + v));
  noiseBurst(out, 0, { a: 0.0004, tau: 0.007, f0: 1500 * r.range(0.9, 1.1), q: 0.7, mode: 'lp', amp: far ? 0.3 : 0.6 }, new Noise(7020 + v));
  if (!far) ping(out, 0, r.range(280, 340), 0.08, [[1, 1, 0.02], [2.2, 0.4, 0.01]], r.next() * 6);
  if (far) { const hp = new SVF(900, 0.7); for (let i = 0; i < out.length; i++) { hp.run(out[i]); out[i] = hp.hp; } }
  fadeTail(out, 0.02); smallBank.set(key, out);
  return out;
}

// SMILE {who} — nothing to hear: the score puts a music-box note there
export function sfxSilent() { return new Float32Array(1); }

export const FILM_KINDS = {
  antStep: sfxAntStep, antAlert: sfxAntAlert, cardToss: sfxCardToss, cardDraw: sfxCardDraw, cardSlap: sfxCardSlap, cardWhoosh: sfxCardWhoosh,
  chatWake: sfxChatWake, typing: sfxTyping, awe: sfxAwe, chuckle: sfxChuckle, scuffle: sfxScuffle, cardSkim: sfxCardSkim, towerCrash: sfxTowerCrash,
  bigSlam: sfxBigSlam, lampSwing: sfxLampSwing, chairSlide: sfxChairBack, tremble: sfxTremble, breath: sfxBreathe, cardDown: sfxCardDown,
  deckTwitch: sfxDeckTwitch, deckFire: sfxDeckFire, stream: sfxStream, blizzard: sfxBlizzard, stop: sfxStop, cardsFall: sfxCardsFall,
  cardStand: sfxCardStand, standWave: sfxStandWave, rise: sfxRise, lampSpin: sfxLampSpin, farSlap: sfxFarSlap, leafFall: sfxLeafFall,
  cardTap: sfxCardTap, peek: sfxPeek, smallSlap: sfxSmallSlap, smile: sfxSilent, rage: sfxSilent,
};
// the heaviest as generators (the cooperative render)
export const FILM_GEN = { blizzard: sfxBlizzardG, rise: sfxRiseG };
export const REEL_KINDS = FILM_KINDS;

// ---- the score's own ambience kinds (not in the director's table; scheduled by scoreEvents unless the picture has them)
// YAWN {who} — a king's lazy yawn far down the table (1-07): the mouth opening on a long breathy intake, the voice coming
// in at the top and sighing down through "aah" into a closed "mm"
export function sfxYawn(e, seed) {
  const r = new Rng(seed + hashW(e.who)), d = r.range(1.5, 1.8), out = new Float32Array(Math.ceil((d + 0.1) * SR)), nz = new Noise(seed), f0 = r.range(150, 175);
  const F1 = new SVF(500, 3), F2 = new SVF(1100, 4), F3 = new SVF(2500, 5), air = new SVF(4000, 0.8);
  let p = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), open = Math.sin(Math.PI * Math.min(1, u * 1.15)), voice = smooth((u - 0.32) / 0.12) * (1 - smooth((u - 0.88) / 0.12));
    if ((i & 63) === 0) { F1.set(320 + 480 * open, 3); F2.set(800 + 450 * open, 4); }
    const f = f0 * (1.15 - 0.45 * smooth((u - 0.3) / 0.6)); p += f / SR; p -= Math.floor(p);
    let x = 0; for (let h = 1; h <= 10; h++) x += Math.sin(TAU * h * p) / Math.pow(h, 1.25);
    const src = nz.pink() * 2.4 * (1 - 0.6 * voice) + x * 0.5 * voice; F1.run(src); F2.run(src); F3.run(src); air.run(nz.white());
    out[i] = (F1.bp + 0.5 * F2.bp + 0.12 * F3.bp + air.bp * 0.05 * (1 - voice)) * smooth(u / 0.2) * (1 - smooth((u - 0.85) / 0.15)) * 0.3;
  }
  return fadeTail(out, 0.03);
}
export const SCORE_KINDS = { yawn: sfxYawn };

// ======================================================================================================================
// 《失控》 v2 (托管): the screens. Animatic-grade synths built from the kit.
// SCREENTAP {who} — a fingertip on a glass screen: a dull tap and a tiny UI blip
export function sfxScreenTap(e, seed) {
  const out = new Float32Array(Math.ceil(0.12 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0003, tau: 0.003, f0: 1100 * r.range(0.9, 1.1), q: 0.8, mode: 'lp', amp: 0.5 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0006, f0: 4200, q: 1, amp: 0.2 }, new Noise(seed + 1));
  ping(out, Math.round(0.004 * SR), 1760 * (isUS(e.who) ? 1.06 : 1), 0.035, [[1, 1, 0.025], [2, 0.3, 0.012]], 0.2);
  return fadeTail(out, 0.01);
}
// HINTDING {who} — 提示: a clear glassy "ding" (A6 with a fifth above, a little bell)
export function sfxHintDing(e, seed) {
  const out = new Float32Array(Math.ceil(0.9 * SR));
  ping(out, 0, 1760, 0.12, [[1, 1, 0.5], [1.5, 0.35, 0.35], [2.76, 0.15, 0.12], [5.4, 0.06, 0.05]], 0.1);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0005, f0: 6000, q: 1, amp: 0.1 }, new Noise(seed));
  return fadeTail(out, 0.05);
}
// AUTOON {who} — 托管: a palm slapping a big button (a dull thump), the latch, a low electronic confirm (two notes down)
export function sfxAutoOn(e, seed) {
  const out = new Float32Array(Math.ceil(0.8 * SR));
  noiseBurst(out, 0, { a: 0.0008, tau: 0.02, f0: 600, q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(seed));
  sweep(out, 0, 140, 60, 0.02, 0.06, 0.4, 0.001, 1);
  noiseBurst(out, Math.round(0.02 * SR), { a: 0.0001, tau: 0.001, f0: 3200, q: 1, amp: 0.35 }, new Noise(seed + 1));
  ping(out, Math.round(0.09 * SR), 587, 0.06, [[1, 1, 0.14], [3, 0.2, 0.06]], 0); ping(out, Math.round(0.21 * SR), 440, 0.06, [[1, 1, 0.3], [3, 0.2, 0.1]], 0);
  return fadeTail(out, 0.05);
}
// AUTOPLAY {who, red} — a card leaving a screen by itself (a flick and a whip); red: an unaligned card, with a low
// dark glassy tone under it (a tritone, beating)
export function sfxAutoPlay(e, seed) {
  const f = fireSig(((seed % 6) + 6) % 6);
  if (!e.red) return f;
  const out = new Float32Array(Math.ceil(0.6 * SR)); for (let i = 0; i < f.length; i++) out[i] = f[i];
  ping(out, 0, 77.8, 0.18, [[1, 1, 0.4], [1.414, 0.6, 0.35], [2.01, 0.4, 0.2], [2.83, 0.3, 0.15]], seed * 0.1);
  return fadeTail(out, 0.05);
}
// CANCELPRESS {who, hard} — 取消托管: a dead key: plastic bottoming out, a hollow click, nothing answering
export function sfxCancelPress(e, seed) {
  const h = clamp(e.hard ?? 0.5), out = new Float32Array(Math.ceil(0.15 * SR)), r = new Rng(seed);
  ping(out, 0, 2100 * r.range(0.98, 1.02), 0.2 + 0.2 * h, [[1, 1, 0.008], [1.7, 0.5, 0.005]], r.next() * 6);
  ping(out, 0, 400, 0.25 + 0.25 * h, [[1, 1, 0.015], [2.3, 0.3, 0.008]], 1.2);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0012 + 0.002 * h, f0: 4500, q: 0.9, amp: 0.4 + 0.4 * h }, new Noise(seed));
  if (h > 0.7) noiseBurst(out, 0, { a: 0.0005, tau: 0.01, f0: 700, q: 0.7, mode: 'lp', amp: 0.6 * h }, new Noise(seed + 1));
  return fadeTail(out, 0.01);
}
// SCREENDEAL {who} — the screen lighting up with a new card: a soft "ding" a fifth lower, a shimmer
export function sfxScreenDeal(e, seed) {
  const out = new Float32Array(Math.ceil(1.2 * SR));
  ping(out, 0, 1174.7, 0.07, [[1, 1, 0.6], [2, 0.25, 0.3], [3, 0.1, 0.15]], 0.3);
  const nz = new Noise(seed), hp = new SVF(6000, 0.8), n = Math.round(0.8 * SR); for (let i = 0; i < n; i++) { hp.run(nz.white()); out[i] += hp.bp * 0.02 * Math.sin(Math.PI * i / n); }
  return fadeTail(out, 0.05);
}
// CRUMBROLL {dur} — a crumb rolling out from under the card: a few tiny uneven ticks slowing, a last rock
export function sfxCrumbRoll(e, seed) {
  const d = Math.max(0.3, e.dur || 0.8), out = new Float32Array(Math.ceil((d + 0.2) * SR)), r = new Rng(seed);
  for (let t = 0.01, p = 0.03; t < d; t += p, p *= 1.18) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0002, 0.0005), f0: r.range(2500, 4500), q: 1, amp: r.range(0.2, 0.4) * (1 - 0.5 * t / d) }, new Noise(seed + Math.round(t * 1e4)));
  return fadeTail(out, 0.02);
}
// CROWNROLL {i, dur} — a crown rolling out from under the card: metal on cloth (a ringing gold rim), wobbling faster
// and faster as it settles, the last rattle
export function sfxCrownRoll(e, seed) {
  const d = Math.max(0.5, e.dur || 1.4), out = new Float32Array(Math.ceil((d + 1.2) * SR)), r = new Rng(seed + 31 * (e.i ?? 0)), f = r.range(900, 1500);
  for (let t = 0.02, p = 0.16, a = 0.12; t < d && a > 0.005; t += p, p *= 0.82, a *= 0.86) { ping(out, Math.round(t * SR), f * r.range(0.995, 1.005), a, [[1, 1, 0.25], [2.4, 0.5, 0.15], [4.1, 0.3, 0.08], [6.3, 0.15, 0.05]], r.next() * 6); noiseBurst(out, Math.round(t * SR), { a: 0.0003, tau: 0.004, f0: 1200, q: 0.7, mode: 'lp', amp: a * 1.2 }, new Noise(seed + Math.round(t * 1e4))); }
  return fadeTail(out, 0.1);
}
// ENDSLAM — the giant card over the whole table: the biggest hit of the film (the giant card, larger and lower)
export function sfxEndSlam(e, seed) {
  const S = sfxBigSlam(e, seed), at = Math.round(S.pre * SR), M = new Float32Array(S.L.length);
  add(M, boom({ f0: 80, f1: 26, sweep: 0.12, tau: 1.3, dur: 3.4, drive: 3, gain: 0.9 }, seed + 9), 1, at);
  for (let i = 0; i < M.length; i++) { const v = M[i] * Math.SQRT1_2; S.L[i] += v; S.R[i] += v; }
  return S;
}
FILM_KINDS.screenTap = sfxScreenTap; FILM_KINDS.hintDing = sfxHintDing; FILM_KINDS.autoOn = sfxAutoOn; FILM_KINDS.autoPlay = sfxAutoPlay;
FILM_KINDS.cancelPress = sfxCancelPress; FILM_KINDS.screenDeal = sfxScreenDeal; FILM_KINDS.crumbRoll = sfxCrumbRoll; FILM_KINDS.crownRoll = sfxCrownRoll; FILM_KINDS.endSlam = sfxEndSlam;

// ======================================================================================================================
// 《失控》 v3 (榜首): the new kinds (animatic grade)
// BLAST {dur} — ChatGPT's shockwave: a deep thump, the air rushing out across the table, old cards torn away in it
export function sfxBlast(e, seed) {
  const d = Math.max(0.6, e.dur || 2), S = pair(d + 1.2), r = new Rng(seed), M = new Float32Array(S.L.length);
  add(M, boom({ f0: 90, f1: 30, sweep: 0.1, tau: 0.6, dur: 2.2, drive: 2.2, gain: 0.7 }, seed), 1, 0);
  addMid(S, M, 0, Math.SQRT2);
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), a = new SVF(800, 0.8), b = new SVF(850, 0.8);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, u = Math.min(1, t / d), en = smooth(t / 0.05) * Math.exp(-2.2 * u) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.8)); if ((i & 63) === 0) { a.set(2500 - 1800 * u, 0.8); b.set(2650 - 1800 * u, 0.8); } a.run(nA.pink()); b.run(nB.pink()); const [gl, gr] = panGains(Math.sin(TAU * 0.4 * t) * 0.6); S.L[i] += a.bp * 0.9 * en * gl * Math.SQRT2; S.R[i] += b.bp * 0.9 * en * gr * Math.SQRT2; }
  for (let k = 0; k < 60; k++) { const t = 0.05 + d * Math.pow(r.next(), 1.3); addPan(S, cardHit(r.int(0, 11)), r.range(-1, 1), Math.round(t * SR), r.range(0.2, 0.6) * (1 - 0.6 * t / d)); }
  fadeTail(S.L, 0.3); fadeTail(S.R, 0.3);
  return S;
}
// DENIED {who} — 要不起: the screen refusing a tap: a dull low two-note "bonk-bonk" falling
export function sfxDenied(e, seed) {
  const out = new Float32Array(Math.ceil(0.45 * SR));
  for (const [at, f] of [[0, 220], [0.11, 165]]) { const j = Math.round(at * SR); for (let i = 0; i < Math.round(0.1 * SR); i++) { const t = i / SR; out[j + i] += Math.tanh(3 * Math.sin(TAU * f * t)) * 0.18 * Math.exp(-t / 0.05) * Math.min(1, i / 48); } }
  return fadeTail(out, 0.02);
}
// ERRORALARM {who} — 系统异常: a harsh alternating two-tone alert, three cycles
export function sfxErrorAlarm(e, seed) {
  const out = new Float32Array(Math.ceil(1.3 * SR));
  for (let k = 0; k < 6; k++) { const j = Math.round(k * 0.2 * SR), f = k % 2 ? 1480 : 1975, n = Math.round(0.17 * SR); for (let i = 0; i < n; i++) { const t = i / SR; out[j + i] += Math.tanh(4 * Math.sin(TAU * f * t)) * 0.12 * Math.min(1, i / 96, (n - i) / 96); } }
  return out;
}
// SCREENEYE {who} — the same eye on both screens: a low glassy swell, two tones a tritone apart, breathing in
export function sfxScreenEye(e, seed) {
  const d = 2.0, S = pair(d + 0.6), P = [[50.5, 1], [71.4, 0.7], [101, 0.4], [142.8, 0.25]], ph = P.map(() => 0);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, en = smooth(t / 1.2) * (t < d ? 1 : Math.exp(-(t - d) / 0.3)); let x = 0; P.forEach(([f, a], q) => { ph[q] += f * 2 / SR; x += Math.sin(TAU * ph[q]) * a; }); S.L[i] = x * 0.08 * en; S.R[i] = x * 0.08 * en; }
  return S;
}
// PRESSURE {dur} — the giant card coming down: a very low air pressure growing (a rising sub, rushing air); stops at dur
export function sfxPressure(e, seed) {
  const d = Math.max(0.5, e.dur || 3), S = pair(d + 0.05), nA = new Noise(seed), nB = new Noise(seed + 1), a = new SVF(120, 0.7), b = new SVF(125, 0.7);
  let p = 0;
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, u = Math.min(1, t / d), en = Math.pow(u, 2) * clamp((d - t) / 0.015); if ((i & 63) === 0) { a.set(90 + 500 * u * u, 0.7); b.set(95 + 500 * u * u, 0.7); } a.run(nA.brown()); b.run(nB.brown()); p += (28 + 20 * u) / SR; const s = Math.sin(TAU * p) * 0.4 * en; S.L[i] = a.lp * 2.2 * en + s; S.R[i] = b.lp * 2.2 * en + s; }
  const fo = Math.round(0.01 * SR); for (let i = 0; i < fo; i++) { S.L[S.L.length - 1 - i] *= i / fo; S.R[S.R.length - 1 - i] *= i / fo; }
  return S;
}
Object.assign(FILM_KINDS, { blast: sfxBlast, denied: sfxDenied, errorAlarm: sfxErrorAlarm, screenEye: sfxScreenEye, pressure: sfxPressure, boardFlip: V3_KINDS.boardFlip });

// ======================================================================================================================
// 《失控》 v4 (四王): a king out
// LIGHTOFF {who} — his screen's light going out: a hard switch click, a tiny electric fizz dying, a low thump
export function sfxLightOff(e, seed) {
  const out = new Float32Array(Math.ceil(0.6 * SR));
  ping(out, 0, 1450, 0.35, [[1, 1, 0.02], [2.3, 0.5, 0.012], [3.7, 0.3, 0.008]], 0.3);
  ping(out, 0, 305, 0.3, [[1, 1, 0.03], [2.1, 0.3, 0.015]], 1.2);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0016, f0: 4800, q: 0.9, amp: 0.6 }, new Noise(seed));
  for (let i = 0; i < Math.round(0.35 * SR); i++) { const t = i / SR; out[i] += Math.tanh(3 * Math.sin(TAU * 100 * t)) * 0.03 * Math.exp(-t / 0.08) * (1 - t / 0.35); }
  return fadeTail(out, 0.05);
}
// CROWNDRAG {dur} — a tiny crown dragged a few steps over the linen by an ant: a gritty little scrape in tugs, its rim ticking
export function sfxCrownDrag(e, seed) {
  const d = Math.max(0.3, e.dur || 2), out = new Float32Array(Math.ceil((d + 0.3) * SR)), r = new Rng(seed), nz = new Noise(seed), bp = new SVF(3800, 1.2);
  for (let i = 0; i < Math.round(d * SR); i++) { const t = i / SR, tug = Math.pow(Math.max(0, Math.sin(Math.PI * 2.2 * t)), 3); bp.run(nz.white()); out[i] += bp.bp * 0.05 * tug * smooth(t / 0.1); }
  for (let t = 0.1; t < d; t += r.range(0.2, 0.5)) ping(out, Math.round(t * SR), r.range(2600, 3400), 0.025, [[1, 1, 0.05], [2.4, 0.4, 0.03]], r.next() * 6);
  return fadeTail(out, 0.05);
}
Object.assign(FILM_KINDS, { lightOff: sfxLightOff, chairBack: sfxChairBack, crownDrag: sfxCrownDrag });

// ======================================================================================================================
// 《喂》 FEED (v5): the machines. THE ONE IDEA: a machine never changes what it does, it only gets bigger. `tak` is the
// same two-part gesture (the hammer on its bell, then the card leaving the slot) from a 0.3 m toy to a 30 m mountain:
// every part of it (pitch, ring, the gap between hammer and card, the card's flick) is a power of the machine's height.
import { sfxCreakT } from './audio-sfxlib.js';
import { bubble } from './audio-dsp.js';

// the bell's note: D7 on the 0.3 m toy, ~0.6 octave lower per doubling of height, always a D or an A (the tune's key);
// the black king's machine sits a little lower than the red king's
export function takNote(size, who) {
  const raw = 98 - 7.2 * Math.log2(clamp(size, 0.2, 40) / 0.3) - (isUS(who) ? 2.5 : 0);
  let best = 0, bd = 99;
  for (let m = Math.round(raw) - 6; m <= Math.round(raw) + 6; m++) { const pc = ((m % 12) + 12) % 12; if ((pc === 2 || pc === 9) && Math.abs(m - raw) < bd) { bd = Math.abs(m - raw); best = m; } }
  return best;
}
// TAK {who, size, gain} — the little hammer on its bell, and the card leaving the slot. size = the machine's height (m)
const takCache = new Map();
export function sfxTak(e) {
  const size = clamp(e.size ?? 0.3, 0.2, 40), us = isUS(e.who), key = `${SR}|${size.toFixed(2)}|${us}`;
  if (takCache.has(key)) return takCache.get(key);
  const k = size / 0.3, f = mtof(takNote(size, e.who)), dec = 0.1 * Math.pow(k, 0.55), gap = 0.014 * Math.pow(k, 0.6), fl = 0.03 * Math.pow(k, 0.55);
  const out = new Float32Array(Math.ceil((Math.max(dec * 1.4, gap + fl * 2) + 0.1) * SR)), sd = 8800 + Math.round(size * 100) + (us ? 5 : 0);
  // the hammer on its bell
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0005 * Math.pow(k, 0.6), f0: 5200 / Math.pow(k, 0.5), q: 0.9, amp: 0.5 }, new Noise(sd));
  ping(out, 0, f, 0.22, [[1, 1, dec], [2.76, 0.45, dec * 0.55], [5.4, 0.22, dec * 0.3], [8.93, 0.1, dec * 0.18]], 0.3);
  if (k > 3) {   // a big hammer has weight: a thump under the bell
    const w = Math.min(1, (k - 3) / 10);
    sweep(out, 0, Math.max(60, f * 1.6), Math.max(30, f * 0.5), 0.03, 0.06 * Math.pow(k, 0.35), 0.5 * w, 0.002, 1.2);
    noiseBurst(out, 0, { a: 0.001, tau: 0.012 * Math.pow(k, 0.35), f0: 900 / Math.pow(k, 0.3), q: 0.7, mode: 'lp', amp: 0.6 * w }, new Noise(sd + 1));
  }
  // the card leaving the slot: a flick (a toy) .. a long rush of air (a card the size of a field)
  const at = Math.round(gap * SR), n = Math.round(fl * SR), nz = new Noise(sd + 2), bp = new SVF(1000, 1.3), lo = new SVF(200, 0.7), f0 = 2400 / Math.pow(k, 0.55), f1 = 5200 / Math.pow(k, 0.55);
  for (let i = 0; i < n && at + i < out.length; i++) {
    const u = i / n; if ((i & 15) === 0) { bp.set(f0 + (f1 - f0) * u, 1.3); lo.set(Math.max(60, f0 * 0.25), 0.7); }
    const w = nz.white(); bp.run(w); lo.run(w);
    out[at + i] += (bp.bp * 0.5 + lo.lp * 0.25 * Math.min(1, k / 20)) * Math.pow(Math.sin(Math.PI * u), 1.5);
  }
  if (at + n < out.length) noiseBurst(out, at + n, { a: 0.0001, tau: 0.0008 * Math.pow(k, 0.5), f0: 4200 / Math.pow(k, 0.5), q: 1, amp: 0.3 }, new Noise(sd + 3));
  if (size >= 8) { const lp = new SVF(2200, 0.7); for (let i = 0; i < out.length; i++) out[i] = lp.run(out[i]); }   // heard from far below
  const g = Math.pow(k, 0.22); for (let i = 0; i < out.length; i++) out[i] *= g;
  fadeTail(out, 0.03); takCache.set(key, out);
  return out;
}

// SLABLAND {who, size (card scale 1..45), far, gain} — that card landing: 1 a pat on the pile; 2-3 a thump; 6-9 a boom
// that shakes the room (the table, the floor, things rattling); far: out on the floor a long way off: thunder
export function sfxSlabLand(e, seed) {
  const s = clamp(e.size ?? 1, 0.5, 60), r = new Rng(seed);
  if (e.far) return sfxFarSlap({ size: 0.9, dist: 1.6 }, seed);
  const out = new Float32Array(Math.ceil((0.3 + 0.38 * Math.min(s, 10)) * SR));
  noiseBurst(out, 0, { a: 0.0005, tau: 0.007 * Math.pow(s, 0.7), f0: 1500 / Math.pow(s, 0.45) * r.range(0.92, 1.08), q: 0.7, mode: 'lp', amp: 0.6 * Math.min(1.6, Math.pow(s, 0.3)) }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.001 * Math.pow(s, 0.5), f0: 4000 / Math.pow(s, 0.35), q: 0.8, amp: 0.3 }, new Noise(seed + 1));
  ping(out, 0, 300 / Math.pow(s, 0.5) * r.range(0.95, 1.05), 0.06 * Math.min(3, s), [[1, 1, 0.02 * Math.pow(s, 0.6)], [2.2, 0.4, 0.01 * Math.pow(s, 0.6)]], r.next() * 6);
  if (s > 1.5) sweep(out, 0, 140 / Math.pow(s, 0.2), Math.max(30, 55 / Math.pow(s, 0.15)), 0.02 + 0.01 * Math.min(s, 6), 0.05 + 0.035 * Math.min(s, 10), 0.6 * Math.min(1, (s - 1) / 4), 0.0015, 1.2);
  if (s >= 5) {
    add(out, boom({ f0: 100, f1: 34, sweep: 0.08, tau: 0.25 + 0.05 * s, dur: Math.min(out.length / SR - 0.05, 1.2 + 0.25 * s), drive: 2.2, gain: 0.45 + 0.04 * Math.min(s, 10) }, seed + 2), 1, 0);
    const nb = new Noise(seed + 3), lp = new SVF(70, 0.7), len = Math.min(out.length, Math.round(1.6 * SR));
    for (let i = 0; i < len; i++) { lp.run(nb.brown()); out[i] += lp.lp * 1.2 * Math.exp(-i / (0.45 * SR)) * Math.min(1, i / 200, (len - i) / (0.3 * SR)); }
    for (let q = 0; q < 14; q++) { const t = 0.03 + Math.pow(r.next(), 1.5) * 0.6, h = cardHit(r.int(0, 11)), at = Math.round(t * SR); for (let i = 0; i < h.length && at + i < out.length; i++) out[at + i] += h[i] * r.range(0.1, 0.3) * (1 - t); }
  }
  return fadeTail(out, 0.08);
}

// THUD {who, hard} — a machine set down on the table: wood under brass, its mechanism jingling; hard: the table jumps
export function sfxThud(e, seed) {
  const h = clamp(e.hard ?? 0.5), out = new Float32Array(Math.ceil((0.5 + 0.7 * h) * SR)), r = new Rng(seed);
  sweep(out, 0, 150 - 30 * h, 58, 0.02, 0.05 + 0.08 * h, 0.3 + 0.6 * h, 0.0015, 1.1);
  noiseBurst(out, 0, { a: 0.0006, tau: 0.012 + 0.015 * h, f0: 520, q: 0.7, mode: 'lp', amp: 0.5 + 0.4 * h }, new Noise(seed));
  ping(out, 0, (132 - 20 * h) * r.range(0.97, 1.03), 0.15 + 0.2 * h, [[1, 1, 0.07], [1.9, 0.6, 0.04], [3.07, 0.4, 0.025]], r.next() * 6);
  ping(out, Math.round(0.004 * SR), mtof(takNote(h > 0.6 ? 0.46 : 0.3, e.who)), 0.02 + 0.02 * h, [[1, 1, 0.25], [2.76, 0.4, 0.12]], 0.2);   // its bell, jarred
  for (let q = 0; q < 4 + Math.round(6 * h); q++) noiseBurst(out, Math.round(r.range(0.01, 0.12 + 0.2 * h) * SR), { a: 0.0001, tau: 0.0006, f0: r.range(3000, 6000), q: 1.2, amp: r.range(0.05, 0.14) }, new Noise(seed + 5 + q));
  if (h > 0.6) { const nb = new Noise(seed + 2), lp = new SVF(80, 0.7), len = Math.round(0.8 * SR); for (let i = 0; i < len && i < out.length; i++) { lp.run(nb.brown()); out[i] += lp.lp * 1.2 * Math.exp(-i / (0.25 * SR)) * Math.min(1, i / 200); } }
  return fadeTail(out, 0.05);
}

// one tooth of the ratchet (cached by size bucket and tick / tock)
const tickBank = new Map();
function ratchetTick(size, v) {
  const key = `${SR}|${size.toFixed(1)}|${v}`; if (tickBank.has(key)) return tickBank.get(key);
  const k = size / 0.3, out = new Float32Array(Math.ceil((0.02 + 0.012 * Math.pow(k, 0.5)) * SR)), f = (v ? 2700 : 3300) / Math.pow(k, 0.6);
  ping(out, 0, f, 0.2, [[1, 1, 0.004 * Math.pow(k, 0.5)], [2.3, 0.4, 0.002 * Math.pow(k, 0.5)]], 0.4 + v);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0004 * Math.pow(k, 0.5), f0: 5000 / Math.pow(k, 0.5), q: 1, amp: 0.25 }, new Noise(9100 + v + Math.round(size * 10)));
  if (k > 20) sweep(out, 0, 160, 60, 0.02, 0.05, 0.5, 0.002, 0.8);
  fadeTail(out, 0.003); tickBank.set(key, out); return out;
}
// CLOCKWORK {who, dur, size} — the spring running: a quiet, even ratchet (tick-tock) and the whirr of the governor
export function sfxClockwork(e, seed) {
  const d = Math.max(0.3, e.dur || 2), size = e.size ?? 0.3, rate = 15 / Math.pow(size / 0.3, 0.35), out = new Float32Array(Math.ceil((d + 0.1) * SR));
  for (let t = 0, q = 0; t < d; t += 1 / rate, q++) add(out, ratchetTick(size, q & 1), (q & 1 ? 0.7 : 1) * Math.min(1, t / 0.3, (d - t) / 0.3 + 0.1), Math.round(t * SR));
  const nz = new Noise(seed), bp = new SVF(2600 / Math.pow(size / 0.3, 0.4), 3), n = Math.round(d * SR);
  for (let i = 0; i < n; i++) { bp.run(nz.white()); out[i] += bp.bp * 0.012 * Math.min(1, i / 4800, (n - i) / 4800); }
  return out;
}
// RUNDOWN {who, dur, size} — the spring running down: the ratchet slower and slower, sagging, a last tooth, stop.
// size 30: the same, enormous: slow low knocks and the mechanism groaning
export function sfxRundown(e, seed) {
  const d = Math.max(0.5, e.dur || 2), size = e.size ?? 0.3, k = size / 0.3, r0 = 15 / Math.pow(k, 0.35), out = new Float32Array(Math.ceil((d + 0.6) * SR)), big = size > 5;
  let ph = 0, q = 0;
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); ph += r0 * Math.pow(1 - u, 1.3) / SR; if (ph >= 1) { ph -= 1; add(out, ratchetTick(size, q & 1), (0.6 + 0.4 * (1 - u)) * (big ? 2.2 : 1), i); q++; } }
  if (big) add(out, fadeTail(friction(d, { modes: STEELM.map(([f, qq, a]) => [f * 0.6, qq, a]), rate: (u) => 3 + 16 * Math.pow(1 - u, 1.5), env: (u) => smooth(u / 0.1) * (1 - smooth((u - 0.85) / 0.15)), gain: 0.25, drive: 1.6, jit: 0.7, jitHz: 5 }, seed), 0.05), 1, 0);
  const j = Math.round(d * SR); sweep(out, j, 180 / Math.pow(k, 0.3), 70 / Math.pow(k, 0.15), 0.02, 0.05 * Math.pow(k, 0.3), 0.3 * (big ? 2 : 1), 0.002, 0.6);   // the hammer drooping onto its rest
  return fadeTail(out, 0.03);
}
// PAT {who} — a hand pats the toy: a soft palm on brass, the bell answering faintly
export function sfxPat(e, seed) {
  const out = new Float32Array(Math.ceil(0.3 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.001, tau: 0.007, f0: 900, q: 0.7, mode: 'lp', amp: 0.5 }, new Noise(seed));
  ping(out, 0, r.range(480, 560), 0.06, [[1, 1, 0.02], [2.4, 0.4, 0.01]], r.next() * 6);
  ping(out, Math.round(0.003 * SR), mtof(takNote(0.3, e.who)), 0.012, [[1, 1, 0.2]], 0.1);
  return fadeTail(out, 0.03);
}
// CHIPDROP {who, n} — n chips into the brass funnel: each a clay clink on brass, the funnel ringing, a rattle down its
// throat. n = 1: "ding, d-d-dng"; n = 10: a cascade
export function sfxChipDrop(e, seed) {
  const n = clamp(e.n ?? 1, 1, 30), out = new Float32Array(Math.ceil((0.7 + 0.04 * n) * SR)), r = new Rng(seed), fun = r.range(700, 860);
  const chip = (t, a) => { const at = Math.round(t * SR); ping(out, at, r.range(3000, 4800), 0.12 * a, [[1, 1, 0.03], [2.6, 0.5, 0.015]], r.next() * 6); noiseBurst(out, at, { a: 0.0001, tau: 0.0007, f0: 5500, q: 1, amp: 0.25 * a }, new Noise(seed + Math.round(t * 1e4))); ping(out, at, fun, 0.035 * a, [[1, 1, 0.3], [2.32, 0.5, 0.18], [3.9, 0.25, 0.1]], r.next() * 6); };
  for (let i = 0, t = 0; i < n; i++, t += r.range(0.02, 0.05)) { chip(t, r.range(0.6, 1)); for (let b = 1, tb = t + 0.07, a = 0.5; b <= 3; b++, tb += 0.05 / b + 0.02, a *= 0.55) chip(tb, a * (n > 1 ? 0.5 : 1)); }
  return fadeTail(out, 0.05);
}
// CROWNLIFT {who} — a crown picked up off the table: a small ring of gold, a hair of scrape
export function sfxCrownLift(e, seed) {
  const out = new Float32Array(Math.ceil(0.9 * SR)), r = new Rng(seed), nz = new Noise(seed), bp = new SVF(4200, 1.5), m = Math.round(0.07 * SR);
  for (let i = 0; i < m; i++) { bp.run(nz.white()); out[i] += bp.bp * 0.04 * Math.sin(Math.PI * i / m); }
  ping(out, Math.round(0.05 * SR), r.range(1550, 1750), 0.05, [[1, 1, 0.55], [1.52, 0.6, 0.4], [2.41, 0.4, 0.22], [3.3, 0.2, 0.12]], r.next() * 6);
  return fadeTail(out, 0.05);
}
// CROWNDROP {who} — a crown into the funnel: a clang (gold on brass), the funnel ringing, it rattles down
export function sfxCrownDrop(e, seed) {
  const out = new Float32Array(Math.ceil(1.4 * SR)), r = new Rng(seed);
  ping(out, 0, r.range(1050, 1200), 0.22, [[1, 1, 0.8], [1.52, 0.7, 0.55], [2.41, 0.5, 0.3], [3.3, 0.3, 0.18], [4.7, 0.15, 0.1]], r.next() * 6);
  ping(out, 0, r.range(500, 560), 0.18, [[1, 1, 0.6], [2.32, 0.5, 0.35], [3.9, 0.25, 0.2]], r.next() * 6);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.002, f0: 4500, q: 0.8, amp: 0.6 }, new Noise(seed));
  for (let q = 0, t = 0.09, a = 0.5; q < 5; q++, t += 0.06 + 0.02 * q, a *= 0.6) { const at = Math.round(t * SR); ping(out, at, r.range(900, 1500), 0.1 * a, [[1, 1, 0.15], [2.4, 0.4, 0.08]], r.next() * 6); noiseBurst(out, at, { a: 0.0001, tau: 0.001, f0: 3500, q: 1, amp: 0.3 * a }, new Noise(seed + 3 + q)); }
  return fadeTail(out, 0.08);
}
// GULP {who, size} — the swallow (a throat closing and opening: "glp"), then the swell: metal stretching, air drawn in
// as it grows. Bigger machines swallow lower and longer.
export function sfxGulp(e, seed) {
  const size = clamp(e.size ?? 0.5, 0.2, 40), k = size / 0.3, f0 = 300 / Math.pow(k, 0.45), d1 = 0.07 * Math.pow(k, 0.3), d2 = 0.11 * Math.pow(k, 0.3), sw = 0.45 + 0.3 * Math.pow(k, 0.4);
  const out = new Float32Array(Math.ceil((d1 + d2 + sw + 0.3) * SR)), body = new SVF(f0 * 2.2, 3), nz = new Noise(seed), n = Math.round((d1 + d2) * SR);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = t < d1 ? f0 * (1 - 0.45 * t / d1) : f0 * (0.55 + 0.4 * smooth((t - d1) / d2)); p += f / SR; p -= Math.floor(p);
    const en = Math.sin(Math.PI * Math.min(1, t / (d1 + d2))) * (t < d1 ? 1 - 0.5 * (t / d1) * (t / d1) : 0.5 + 0.5 * Math.sin(Math.PI * (t - d1) / d2));
    body.run(Math.sin(TAU * p) + 0.3 * Math.sin(2 * TAU * p) + nz.pink() * 0.3);
    out[i] += (Math.sin(TAU * p) * 0.5 + body.bp * 0.25) * en * 0.5;
  }
  bubble(out, Math.round(d1 * SR), f0 * 1.8, 0.2, 0.1);
  // the swell
  const a0 = n, m = Math.round(sw * SR), nz2 = new Noise(seed + 1), lp = new SVF(300, 0.8);
  for (let i = 0; i < m; i++) { const u = i / m; if ((i & 63) === 0) lp.set((250 + 900 * u) / Math.pow(k, 0.35), 0.8); lp.run(nz2.pink()); out[a0 + i] += lp.lp * 1.2 * Math.pow(Math.sin(Math.PI * u), 1.3); }
  add(out, fadeTail(friction(sw, { modes: STEELM.map(([f, q, a]) => [f * 2.4 / Math.pow(k, 0.35), q * 0.5, a]), rate: (u) => 30 + 60 * u, env: (u) => Math.pow(Math.sin(Math.PI * u), 1.2), gain: 0.12, drive: 1.4, jit: 0.7 }, seed + 2), 0.03), 1, a0);
  const g = Math.pow(k, 0.3); for (let i = 0; i < out.length; i++) out[i] *= g;
  return fadeTail(out, 0.05);
}
// CREAK {dur} — the table groaning under the machines (big wood, slow stick-slip)
export function sfxCreak(e, seed) { return sfxCreakT({ ...e, size: 0.9 }, seed); }
// BURST {dur} — the hall breaks: a deep crack, stone raining, timbers splitting, the air rushing out
export function sfxBurst(e, seed) {
  const d = Math.max(1, e.dur || 2.4), S = pair(d + 2.2), r = new Rng(seed), M = new Float32Array(S.L.length);
  add(M, boom({ f0: 120, f1: 30, sweep: 0.12, tau: 1.1, dur: Math.min(d + 1.8, 4), drive: 2.6, gain: 0.85 }, seed), 1, 0);
  noiseBurst(M, 0, { a: 0.0003, tau: 0.03, f0: 2200, q: 0.5, amp: 0.9, hp: 300 }, new Noise(seed + 1));
  addMid(S, M, 0, Math.SQRT2);
  for (let t = 0.02; t < d + 0.8;) {   // stone
    const g = new Float32Array(Math.round(0.25 * SR)), a = r.range(0.15, 0.6) * Math.exp(-t / (0.8 * d));
    ping(g, 0, r.range(140, 900), a * 0.4, [[1, 1, r.range(0.02, 0.08)], [1.7, 0.6, 0.03], [2.9, 0.4, 0.02]], r.next() * 6);
    noiseBurst(g, 0, { a: 0.0005, tau: r.range(0.006, 0.02), f0: r.range(400, 1600), q: 0.7, mode: 'lp', amp: a }, new Noise(seed + 10 + Math.round(t * 1e4)));
    addPan(S, g, r.range(-0.95, 0.95), Math.round(t * SR));
    t += -Math.log(1 - r.next() * 0.999) / (70 * Math.exp(-t / (0.5 * d)) + 6);
  }
  for (let q = 0; q < 7; q++) {   // timber
    const t = r.range(0.05, d), cr = friction(r.range(0.15, 0.35), { modes: WOOD.map(([f, qq, a]) => [f * r.range(0.8, 1.6), qq, a]), rate: (u) => 40 + 100 * u, env: (u) => Math.pow(Math.sin(Math.PI * u), 0.8), gain: 0.25, drive: 2, jit: 0.8 }, seed + 50 + q);
    noiseBurst(cr, cr.length - Math.round(0.03 * SR), { a: 0.0001, tau: 0.004, f0: 2800, q: 0.6, amp: 0.7 }, new Noise(seed + 60 + q));
    addPan(S, fadeTail(cr, 0.005), r.range(-0.8, 0.8), Math.round(t * SR));
  }
  const nA = new Noise(seed + 2), nB = new Noise(seed + 3), a = new SVF(500, 0.7), b = new SVF(520, 0.7);   // air and dust
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, en = smooth(t / 0.15) * Math.exp(-t / (0.7 * d)); if ((i & 63) === 0) { const f = 300 + 2200 * Math.exp(-t / 0.6); a.set(f, 0.7); b.set(f * 1.06, 0.7); } a.run(nA.pink()); b.run(nB.pink()); S.L[i] += a.lp * 0.8 * en; S.R[i] += b.lp * 0.8 * en; }
  fadeTail(S.L, 0.3); fadeTail(S.R, 0.3);
  return S;
}
// GROW {dur} — two machines growing into mountains: the ground rumbling up, iron groaning lower and lower, stone trickling
export function sfxGrow(e, seed) {
  const d = Math.max(1, e.dur || 3.8), S = pair(d + 1.0), r = new Rng(seed);
  for (const [out, sd, side] of [[S.L, 1, 0.9], [S.R, 2, 1.1]]) {
    const nb = new Noise(seed + sd), lp = new SVF(60, 0.7);
    for (let i = 0; i < out.length; i++) { const t = i / SR, u = Math.min(1, t / d); if ((i & 127) === 0) lp.set(50 + 60 * u, 0.7); lp.run(nb.brown()); out[i] += lp.lp * 2.4 * Math.pow(u, 1.5) * (t < d ? 1 : Math.exp(-(t - d) / 0.4)); }
    const gr = friction(d, { modes: STEELM.map(([f, q, a]) => [f * side * 0.9, q, a]), rate: (u) => 30 - 22 * u, env: (u) => smooth(u / 0.2) * (0.5 + 0.5 * u) * (1 - smooth((u - 0.92) / 0.08)), gain: 0.22, drive: 1.8, jit: 0.7, jitHz: 6 }, seed + 10 + sd);
    for (let i = 0; i < gr.length && i < out.length; i++) out[i] += gr[i];
  }
  for (let t = 0.2; t < d; t += r.range(0.02, 0.12)) { const g = new Float32Array(Math.round(0.02 * SR)); noiseBurst(g, 0, { a: 0.0003, tau: r.range(0.002, 0.006), f0: r.range(500, 2400), q: 0.8, mode: 'lp', amp: r.range(0.05, 0.2) * (t / d) }, new Noise(seed + 100 + Math.round(t * 1e4))); addPan(S, g, r.range(-0.95, 0.95), Math.round(t * SR)); }
  fadeTail(S.L, 0.2); fadeTail(S.R, 0.2);
  return S;
}
// CHEER {who | 'both', dur, far} — wordless cheering: open-mouthed whoops ("waah!", "haa-ha!") and short laughs, a man's
// voice; 'both': two of them, left and right; far: very small and thin, heard from high above
export function sfxCheer(e, seed) {
  const d = Math.max(0.5, e.dur || 2), S = pair(d + 0.3), far = !!e.far, voices = e.who === 'both' ? [['heart', -0.4], ['spade', 0.4]] : [[e.who, 0]];
  voices.forEach(([who, pan], vi) => {
    const r = new Rng(seed + 17 * vi + hashW(who)), base = 150 * (0.92 + 0.2 * ((hashW(who) % 5) / 4)), mono = new Float32Array(S.L.length);
    const F1 = new SVF(760, 5), F2 = new SVF(1150, 7), F3 = new SVF(2500, 8), air = new SVF(3800, 0.8), nz = new Noise(seed + vi);
    let t = r.range(0.02, 0.2), p = 0;
    while (t < d - 0.25) {
      const laugh = r.next() < 0.35, len = laugh ? r.range(0.5, 0.8) : r.range(0.45, 0.85), a0 = Math.round(t * SR), n = Math.min(Math.round(len * SR), mono.length - a0), peak = r.range(1.5, 2.1);
      for (let i = 0; i < n; i++) {
        const u = i / n, f = base * (1 + (peak - 1) * Math.sin(Math.PI * Math.min(1, u * 1.25)) * (laugh ? 0.6 : 1)) * (1 - 0.15 * u); p += f / SR; p -= Math.floor(p);
        let x = 0; for (let h = 1; h <= 14; h++) x += Math.sin(TAU * h * p) / Math.pow(h, 1.05);
        const en = laugh ? Math.pow(Math.abs(Math.sin(Math.PI * 5.2 * u * len)), 1.5) * (1 - 0.6 * u) : Math.pow(Math.sin(Math.PI * u), 0.6);
        const w = nz.white(); F1.run(x); F2.run(x); F3.run(x); air.run(w);
        mono[a0 + i] += (F1.bp * 0.5 + F2.bp * 0.35 + F3.bp * 0.12 + air.bp * 0.05) * en * 0.22;
      }
      t += len + r.range(0.1, 0.4);
    }
    if (far) { const hp = new SVF(900, 0.7), lp = new SVF(2600, 0.7); for (let i = 0; i < mono.length; i++) { hp.run(mono[i]); mono[i] = lp.run(hp.hp) * 0.25; } }
    addPan(S, fadeTail(mono, 0.03), pan * (far ? 0.3 : 1), 0);
  });
  return S;
}
// RINGROLL {dur} — a gold ring rolling out on card, then spinning down like a coin: faster and faster, and flat
export function sfxRingRoll(e, seed) {
  const d = Math.max(0.8, e.dur || 2.2), out = new Float32Array(Math.ceil((d + 0.6) * SR)), r = new Rng(seed), f = r.range(3900, 4500), dr = 0.4 * d;
  const nz = new Noise(seed), b1 = new SVF(f, 12), b2 = new SVF(f * 1.47, 14), n = Math.round(dr * SR);
  for (let i = 0; i < n; i++) { const u = i / n, w = nz.white(); b1.run(w); b2.run(w); out[i] += (b1.bp * 0.05 + b2.bp * 0.03) * smooth(u / 0.1) * (0.6 + 0.4 * Math.abs(Math.sin(TAU * (16 - 6 * u) * i / SR))); }
  for (let t = dr, p = 0.15, a = 0.07; t < d && p > 0.012; t += p, p *= 0.87, a *= 0.94) { ping(out, Math.round(t * SR), f * r.range(0.99, 1.01), a, [[1, 1, 0.12], [1.47, 0.6, 0.08], [2.6, 0.3, 0.04]], r.next() * 6); noiseBurst(out, Math.round(t * SR), { a: 0.0002, tau: 0.002, f0: 1800, q: 0.8, mode: 'lp', amp: a * 0.8 }, new Noise(seed + Math.round(t * 1e4))); }
  noiseBurst(out, Math.round(d * SR), { a: 0.0005, tau: 0.004, f0: 1500, q: 0.7, mode: 'lp', amp: 0.08 }, new Noise(seed + 2));
  return fadeTail(out, 0.1);
}
// CLOTH {dur} — a robe's hem moving: a soft swish of heavy cloth
export function sfxCloth(e, seed) {
  const d = Math.max(0.2, e.dur || 0.7), out = new Float32Array(Math.ceil((d + 0.05) * SR)), nz = new Noise(seed), bp = new SVF(1400, 0.8), lo = new SVF(500, 0.7), n = Math.round(d * SR), dr = new Drift(seed + 1, 9);
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 63) === 0) bp.set(1000 + 1400 * Math.sin(Math.PI * u), 0.8); const w = nz.pink(); bp.run(w); lo.run(w); out[i] = (bp.bp * 0.5 + lo.lp * 0.25) * Math.pow(Math.sin(Math.PI * u), 1.4) * (0.7 + 0.3 * dr.at(i / SR)) * 0.5; }
  return out;
}
// FOOTDOWN — a slippered foot set down very gently on stone: the softest pad, a grain of grit
export function sfxFootDown(e, seed) {
  const out = new Float32Array(Math.ceil(0.35 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.012, tau: 0.045, f0: 260, q: 0.7, mode: 'lp', amp: 0.5 }, new Noise(seed));
  sweep(out, 0, 85, 50, 0.03, 0.06, 0.12, 0.01, 0);
  for (let q = 0; q < 3; q++) noiseBurst(out, Math.round(r.range(0.01, 0.07) * SR), { a: 0.0001, tau: 0.0005, f0: r.range(3000, 5500), q: 1.2, amp: r.range(0.02, 0.05) }, new Noise(seed + 2 + q));
  return fadeTail(out, 0.05);
}
Object.assign(FILM_KINDS, { tak: sfxTak, slabLand: sfxSlabLand, thud: sfxThud, clockwork: sfxClockwork, rundown: sfxRundown, pat: sfxPat, chipDrop: sfxChipDrop,
  crownLift: sfxCrownLift, crownDrop: sfxCrownDrop, gulp: sfxGulp, creak: sfxCreak, burst: sfxBurst, grow: sfxGrow, cheer: sfxCheer, ringRoll: sfxRingRoll,
  cloth: sfxCloth, footDown: sfxFootDown });

// ======================================================================================================================
// 《喂》 FEED v6: four kings, the lamp, the buttons, the plug, the funnel that takes for itself.
import { brass as brassI, section as sectionI } from './audio-inst.js';

// ---- THE KINGS' VOICES. No synthetic human voice in this film: every vocal sound a king makes (a laugh, a cry, a
// grunt, a shout, a cheer) is his own BRASS instrument played through a plunger mute, the "wah" of a talking horn:
//   heart (the red king)   a trumpet        spade (the black king)  a trombone
//   diamond                a cornet, higher  club                    a euphonium
// One timbre per king, always. A syllable is a note whose pitch bends and whose plunger opens or closes.
export const KING = {
  heart: { inst: 'trumpet', base: 62, wah: [450, 2300], pan: -0.4 }, spade: { inst: 'trombone', base: 50, wah: [280, 1500], pan: 0.4 },
  diamond: { inst: 'cornet', base: 69, wah: [600, 2800], pan: -0.62 }, club: { inst: 'euph', base: 57, wah: [320, 1700], pan: 0.62 },
};
// syl: [t, dur, semitones from his base at the start, at the end, vel, plunger open 0..1 at the start, at the end, growl]
export function kingVoice(who, syl, seed) {
  const K = KING[who] ?? KING.heart, end = Math.max(...syl.map((s) => s[0] + s[1])) + 0.15, n = Math.ceil(end * SR), sec = sectionI(n, 0);
  syl.forEach(([t, d, p0, p1, v, , , gr], i) => brassI(sec, K.inst, t, d, K.base + p0, clamp(v, 0.2, 1), { n: 1, det: 0, spread: 0, lag: 0, vib: 0, att: 0.012, rel: 0.035, accent: 0.5, scoop: 0.6, bend: (tt) => (p1 - p0) * smooth(tt / d), flutter: gr ?? 0, gain: 0.45, seed: seed + i }));
  const out = new Float32Array(n), f = new SVF(K.wah[0], 2.2), env = new Float32Array(n);
  for (const [t, d, , , , o0, o1] of syl) { const a = Math.round(t * SR), m = Math.round((d + 0.05) * SR); for (let i = 0; i < m && a + i < n; i++) env[a + i] = Math.max(env[a + i], o0 + (o1 - o0) * Math.min(1, i / (d * SR))); }
  let o = 0;
  for (let i = 0; i < n; i++) { o += (env[i] - o) * 0.004; if ((i & 15) === 0) f.set(K.wah[0] * Math.pow(K.wah[1] / K.wah[0], o), 2.2); f.run((sec.L[i] + sec.R[i]) * 0.5); out[i] = f.lp * 0.9 + f.bp * 0.5; }
  return fadeTail(out, 0.01);
}
// what they say
const SAY = {
  laugh: (t0, n = 4, top = 7) => Array.from({ length: n }, (_, i) => [t0 + i * 0.135, 0.075, top - 2 * i, top - 2 * i - 1, 0.85 - 0.08 * i, 0.2, 1, 0]),
  whoop: (r, t0) => [[t0, 0.1, 0, 0, 0.8, 0, 0.5, 0], [t0 + 0.13, r.range(0.4, 0.6), 5, 12, 1, 0.3, 1, 0.15]],
  fanfare: (t0) => [[t0, 0.11, 0, 0, 0.9, 0.3, 1, 0], [t0 + 0.15, 0.11, 4, 4, 0.9, 0.3, 1, 0], [t0 + 0.3, 0.55, 7, 7, 1, 0.3, 1, 0.1]],   // the tune's first three notes
  stop: (r, t0, up = 0) => [[t0, 0.09, 7 + up, 7 + up, 0.9, 0.5, 1, 0.3], [t0 + 0.11, r.range(0.25, 0.4), 12 + up, 5 + up, 1, 1, 0.15, 0.45]],
  cry: (t0) => [[t0, 0.42, 3, 12, 1, 0.2, 1, 0.25]],
  grunt: (t0, deep = 0, v = 0.75) => [[t0, 0.16, -5 - deep, -9 - deep, v, 0, 0.35, 0.3]],
};
const endOf = (syl) => Math.max(...syl.map((s) => s[0] + s[1]));
const thin = (x) => { const hp = new SVF(900, 0.7), lp = new SVF(2600, 0.7); for (let i = 0; i < x.length; i++) { hp.run(x[i]); x[i] = lp.run(hp.hp) * 0.2; } return x; };
const kings = (who) => (who === 'both' ? ['heart', 'spade'] : [who ?? 'heart']);
const voiced = (e, dur, make) => { const S = pair(dur + 0.5); kings(e.who).forEach((w, i) => { const m = make(w, i); addPan(S, e.far ? thin(m) : m, (KING[w]?.pan ?? 0) * (e.far ? 0.3 : 1)); }); return { L: S.L, R: S.R, panned: true }; };

// CHUCKLE {who} — a short laugh down his horn: "wa-ha-ha"
export function sfxChuckleB(e, seed) { return kingVoice(e.who, SAY.laugh(0.02, 3 + (seed % 2), 5), seed); }
// SHOUT {who | 'both', dur, far} — wordless shouting ("stop!"): a short pick-up and a hard falling note, again and
// again, more often and higher as it goes on; far: tiny and thin
export function sfxShout(e, seed) {
  const d = Math.max(0.4, e.dur || 1);
  return voiced(e, d, (w, i) => { const r = new Rng(seed + 31 * i), syl = []; for (let t = 0.02 + 0.2 * i; t < d - 0.3 || !syl.length; t += r.range(0.55, 0.8) * (1 - 0.4 * t / Math.max(d, 3))) syl.push(...SAY.stop(r, t, Math.round(3 * t / Math.max(d, 3)))); return kingVoice(w, syl, seed + i); });
}
// CHEER {who, dur, far} — one man cheering: whoops, laughs, and the tune's first three notes as a fanfare
export function sfxCheerB(e, seed) {
  const d = Math.max(0.5, e.dur || 2);
  return voiced(e, d, (w, i) => {
    const r = new Rng(seed + 17 * i), syl = [];
    for (let t = 0.02, q = 0; t < d - 0.5; q++) { const p = q % 3 === 0 ? SAY.whoop(r, t) : q % 3 === 1 ? SAY.fanfare(t) : SAY.laugh(t, 4, 9); syl.push(...p); t = endOf(p) + r.range(0.2, 0.45); }
    return kingVoice(w, syl, seed + i);
  });
}

// LAMPLEAN {who, amp} — the lamp swings over to a king: its chain creaks (iron links grinding), links clink, and the
// light crosses the table with a low soft swoosh. Small ones (the machines' duel: amp < 0.7) are one short creak,
// lower to the left, higher to the right: a metronome made of chain (four cached)
const leanBank = new Map();
export function sfxLampLean(e, seed) {
  const amp = clamp(e.amp ?? 1, 0.1, 1), dir = isUS(e.who) ? 1 : -1, r = new Rng(seed);
  const M = [[700, 18, 0.6], [1150, 24, 1], [1720, 28, 0.6], [2650, 30, 0.3]];
  if (amp < 0.7) {
    const v = ((seed % 2) + 2) % 2, key = `${SR}|${dir}|${v}`; if (leanBank.has(key)) return leanBank.get(key);
    const k = dir > 0 ? 1.18 : 0.92, rr = new Rng(7700 + v + (dir > 0 ? 10 : 0)), out = new Float32Array(Math.ceil(0.22 * SR));
    add(out, fadeTail(friction(0.09, { modes: M.map(([f, q, g]) => [f * k * rr.range(0.98, 1.02), q, g]), rate: (u) => 30 + 40 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.3), gain: 0.14, drive: 1.3, jit: 0.5 }, 7710 + v), 0.01), 1, 0);
    chink(out, Math.round(0.07 * SR), 1100 * k * rr.range(0.95, 1.05), 0.05, rr.next() * 6, 0.7);
    fadeTail(out, 0.02); leanBank.set(key, out); return out;
  }
  const S = pair(1.5), cr = friction(0.42, { modes: M.map(([f, q, g]) => [f * r.range(0.93, 1.07), q, g]), rate: (u) => 18 + 50 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.2), gain: 0.2, drive: 1.4, jit: 0.6 }, seed);
  addPan(S, fadeTail(cr, 0.02), 0.2 * dir, Math.round(0.02 * SR));
  addPan(S, fadeTail(friction(0.2, { modes: M.map(([f, q, g]) => [f * 1.1, q, g]), rate: (u) => 40 - 20 * u, env: (u) => Math.sin(Math.PI * u), gain: 0.1, drive: 1.2, jit: 0.6 }, seed + 1), 0.02), 0.4 * dir, Math.round(0.62 * SR));
  for (let q = 0; q < 4; q++) { const g = new Float32Array(Math.round(0.14 * SR)); chink(g, 0, r.range(800, 1600), r.range(0.04, 0.08), r.next() * 6, 0.8); addPan(S, g, 0.3 * dir, Math.round(r.range(0.05, 0.8) * SR)); }
  const nA = new Noise(seed + 2), lp = new SVF(300, 0.7), n = Math.round(0.7 * SR);   // the light crossing the table
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 63) === 0) lp.set(180 + 420 * Math.sin(Math.PI * u), 0.7); lp.run(nA.pink()); const v = lp.lp * 1.6 * Math.pow(Math.sin(Math.PI * u), 1.5), [gl, gr] = panGains(dir * (-0.3 + 0.9 * u)); S.L[i] += v * gl; S.R[i] += v * gr; }
  return { L: S.L, R: S.R, panned: true };
}
// LIGHTLEAVES {who} — the light slides off a king: the air on his side goes dull (a soft falling sweep), and he holds
// his breath (a small intake, then nothing)
export function sfxLightLeaves(e, seed) {
  const out = new Float32Array(Math.ceil(1.6 * SR)), nz = new Noise(seed), bp = new SVF(1800, 1.0), n = Math.round(1.0 * SR);
  for (let i = 0; i < n; i++) { const u = i / n; if ((i & 63) === 0) bp.set(2000 * Math.pow(0.14, u), 1.0); bp.run(nz.pink()); out[i] += bp.bp * 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - 0.5 * u); }
  add(out, sfxBreathe({ who: e.who, dir: 'in' }, seed + 1), 0.6, Math.round(0.75 * SR));
  return fadeTail(out, 0.05);
}
// DRAGOUT {who, dur} — a chair with a man in it yanked back across stone into the dark: the jolt, both legs scraping,
// away and gone; his cry (his horn, rising) cut off
export function sfxDragOut(e, seed) {
  const d = Math.max(0.5, e.dur || 1.15), pan = KING[e.who]?.pan ?? 0, ch = sfxChairBack({ who: e.who, dur: d, pan }, seed), S = pair(ch.L.length / SR + 0.1), M = new Float32Array(Math.round(0.5 * SR));
  for (let i = 0; i < ch.L.length; i++) { S.L[i] = ch.L[i] * 1.5; S.R[i] = ch.R[i] * 1.5; }
  sweep(M, 0, 170, 60, 0.02, 0.07, 0.9, 0.001, 1.2); noiseBurst(M, 0, { a: 0.0005, tau: 0.015, f0: 700, q: 0.7, mode: 'lp', amp: 0.9 }, new Noise(seed + 3)); ping(M, 0, 140, 0.3, [[1, 1, 0.06], [1.9, 0.6, 0.04], [3.1, 0.4, 0.02]], 0.5);
  addPan(S, M, pan);
  const cry = kingVoice(e.who, SAY.cry(0.03), seed + 7), cut = Math.round(0.4 * SR), fo = Math.round(0.004 * SR);
  for (let i = 0; i < cry.length; i++) cry[i] *= i < cut - fo ? 1 : i < cut ? (cut - i) / fo : 0;   // cut off
  addPan(S, cry, pan, 0, 1.3);
  return { L: S.L, R: S.R, panned: true };
}
// CROWNSPIN {who, dur} — a crown hits the cloth (a clang the cloth swallows), spins on its rim like a coin, faster and
// lower as it settles, and stops with a small flat knock
export function sfxCrownSpin(e, seed) {
  const d = Math.max(0.6, e.dur || 1.45), out = new Float32Array(Math.ceil((d + 0.7) * SR)), r = new Rng(seed + hashW(e.who)), f = r.range(1150, 1400);
  ping(out, 0, f, 0.2, [[1, 1, 0.3], [1.52, 0.7, 0.2], [2.41, 0.5, 0.12], [3.3, 0.3, 0.08]], r.next() * 6);
  noiseBurst(out, 0, { a: 0.0008, tau: 0.012, f0: 600, q: 0.7, mode: 'lp', amp: 0.5 }, new Noise(seed)); noiseBurst(out, 0, { a: 0.0001, tau: 0.0015, f0: 4200, q: 0.8, amp: 0.35 }, new Noise(seed + 1));
  for (let t = 0.14, p = 0.17, a = 0.09; t < d; t += p, p = Math.max(0.018, p * 0.885), a *= (t > 0.8 * d ? 0.8 : 0.97)) {
    const at = Math.round(t * SR), ff = f * (1 - 0.12 * t / d) * r.range(0.995, 1.005);
    ping(out, at, ff, a, [[1, 1, 0.1], [1.52, 0.6, 0.07], [2.41, 0.35, 0.04]], r.next() * 6);
    noiseBurst(out, at, { a: 0.0003, tau: 0.003, f0: 1000, q: 0.7, mode: 'lp', amp: a * 1.5 }, new Noise(seed + 5 + Math.round(t * 1e4)));
  }
  noiseBurst(out, Math.round(d * SR), { a: 0.0005, tau: 0.008, f0: 700, q: 0.7, mode: 'lp', amp: 0.2 }, new Noise(seed + 2)); ping(out, Math.round(d * SR), f * 0.85, 0.03, [[1, 1, 0.08]], 0.4);
  return fadeTail(out, 0.1);
}
// BUTTON {who, mode 'auto' | 'cancel', hard} — one push-button, one click (down, then the spring's little answer). 托管
// ('auto'): after the click a small rising chime: it works. 取消 ('cancel'): THE SAME click, and nothing. Harder: a
// fist comes with it (flesh, the machine's body); the click itself never changes.
function btnClick(out, at) {
  ping(out, at, 2350, 0.3, [[1, 1, 0.008], [1.68, 0.5, 0.005]], 0.4); ping(out, at, 520, 0.28, [[1, 1, 0.016], [2.3, 0.3, 0.009]], 1.2);
  noiseBurst(out, at, { a: 0.0002, tau: 0.0013, f0: 4800, q: 0.9, amp: 0.6 }, new Noise(71));
  const up = at + Math.round(0.055 * SR); ping(out, up, 2900, 0.12, [[1, 1, 0.006]], 0.2); noiseBurst(out, up, { a: 0.0001, tau: 0.0008, f0: 5600, q: 1, amp: 0.25 }, new Noise(72));
}
export function sfxButton(e, seed) {
  const hard = clamp(e.hard ?? 0.5), auto = e.mode !== 'cancel', out = new Float32Array(Math.ceil((auto ? 1.4 : 0.4) * SR));
  btnClick(out, 0);
  if (hard > 0.35) { const h = (hard - 0.35) / 0.65; noiseBurst(out, 0, { a: 0.0008, tau: 0.012 + 0.02 * h, f0: 520, q: 0.7, mode: 'lp', amp: 1.1 * h }, new Noise(seed)); sweep(out, 0, 135, 55, 0.02, 0.05 + 0.04 * h, 0.7 * h, 0.0015, 1); ping(out, 0, 210, 0.12 * h, [[1, 1, 0.05], [2.6, 0.4, 0.03]], 0.7); }
  if (auto) { const a = isUS(e.who) ? 88 : 93; ping(out, Math.round(0.12 * SR), mtof(a), 0.06, [[1, 1, 0.35], [2.76, 0.3, 0.16]], 0.2); ping(out, Math.round(0.27 * SR), mtof(a + 5), 0.075, [[1, 1, 0.55], [2.76, 0.3, 0.25]], 0.2); }
  return fadeTail(out, 0.02);
}
// PLUGBITE {who} — a plug bites the lamp: brass teeth, a spark (a burst of crackle, an arc's buzz), the mains hum
// swelling up out of it, the lamp's own tone sagging away
export function sfxPlugBite(e, seed) {
  const out = new Float32Array(Math.ceil(2.8 * SR)), r = new Rng(seed);
  ping(out, 0, 1900, 0.22, [[1, 1, 0.03], [2.4, 0.5, 0.02]], 0.3); noiseBurst(out, 0, { a: 0.0002, tau: 0.002, f0: 3600, q: 0.8, amp: 0.5 }, new Noise(seed));
  for (let q = 0; q < 11; q++) noiseBurst(out, Math.round(r.range(0.008, 0.16) * SR), { a: 0.0001, tau: r.range(0.0004, 0.002), f0: r.range(3500, 9000), q: 0.8, amp: r.range(0.4, 0.95), hp: 2000 }, new Noise(seed + 2 + q));
  const dr = new Drift(seed + 1, 45), n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR, arc = Math.tanh(6 * Math.sin(TAU * 100 * t)) * 0.3 * Math.exp(-t / 0.12) * (0.4 + 0.6 * Math.abs(dr.at(t)));
    const hum = (Math.tanh(3 * Math.sin(TAU * 50 * t)) * 0.5 + Math.tanh(4 * Math.sin(TAU * 100 * t + 0.6)) * 0.4 + Math.sin(TAU * 150 * t) * 0.2) * 0.2 * smooth(t / 0.9) * (1 - smooth((t - 1.5) / 1.2));
    const sag = Math.sin(TAU * (700 - 420 * smooth(t / 0.8)) * t) * 0.03 * smooth(t / 0.03) * (1 - smooth(t / 0.9));
    out[i] += arc + hum + sag;
  }
  return fadeTail(out, 0.05);
}
// SUCK {who | 'both', dur, gain} — the funnel inhaling by itself: a throat of brass drawing air, its vowel rising,
// louder and louder, shut at the end. 'both' (7-01): the two machines eating the hall: the same, enormous
export function sfxSuck(e, seed) {
  const d = Math.max(0.3, e.dur || 1), both = e.who === 'both', k = both ? 0.4 : 1, S = pair(d + 0.4);
  for (const [out, sd] of [[S.L, 1], [S.R, 2]]) {
    const nz = new Noise(seed + sd), f1 = new SVF(300, 3), f2 = new SVF(900, 4), lo = new SVF(120, 0.7);
    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR, u = Math.min(1, t / d), en = Math.pow(u, 2.0) * (t < d ? 1 : Math.exp(-(t - d) / 0.025));
      if ((i & 63) === 0) { const s = (1 + 2.0 * Math.pow(u, 1.2) + (sd - 1.5) * 0.06) * k; f1.set(300 * s, 3); f2.set(900 * s, 4); lo.set(100 + 300 * u, 0.7); }
      const pk = nz.pink(); f1.run(pk); f2.run(pk * 0.6 + nz.white() * 0.4); lo.run(nz.brown());
      p += (38 + 34 * u) / SR; p -= Math.floor(p);
      out[i] = ((f1.bp * 1.0 + f2.bp * 0.6) * 0.6 + (both ? lo.lp * 2.6 * Math.pow(u, 1.5) + Math.sin(TAU * p) * 0.3 * u * u : lo.lp * 0.5 * u)) * en;
    }
  }
  const M = new Float32Array(Math.round(0.3 * SR)); sweep(M, 0, 130 * (both ? 0.6 : 1), 50, 0.02, 0.05, both ? 0.9 : 0.35, 0.001, 0.8); addMid(S, M, Math.round(d * SR), Math.SQRT2);
  return { L: S.L, R: S.R };
}
// KEYSTRAIN {dur} — a man holding a turning key: the spring's steel groaning against his hands, the ratchet forcing
// tooth after tooth, his grunt (his horn, low), and at the end he is thrown back: a second grunt, the chair's knock
export function sfxKeyStrain(e, seed) {
  const d = Math.max(0.6, e.dur || 1.8), out = new Float32Array(Math.ceil((d + 0.6) * SR)), r = new Rng(seed);
  add(out, fadeTail(friction(d, { modes: STEELM.map(([f, q, a]) => [f * 2.6, q, a]), rate: (u) => 7 + 16 * u + 6 * Math.sin(TAU * 2.3 * u), env: (u) => smooth(u / 0.1) * (0.6 + 0.4 * u) * (1 - smooth((u - 0.95) / 0.05)), gain: 0.22, drive: 1.9, jit: 0.8, jitHz: 9 }, seed), 0.01), 1, 0);
  for (let t = 0.15; t < d; t += r.range(0.12, 0.3)) add(out, ratchetTick(0.6, Math.round(t * 10) & 1), 1.6, Math.round(t * SR));
  add(out, kingVoice(e.who ?? 'heart', [...SAY.grunt(0, 0, 0.7), ...SAY.grunt(0.5 * d, 2, 0.8)], seed + 3), 0.7, Math.round(0.25 * SR));
  const j = Math.round(d * SR);
  add(out, kingVoice(e.who ?? 'heart', [[0, 0.22, -2, -10, 1, 0.6, 0, 0.3]], seed + 4), 0.9, j);
  sweep(out, j + Math.round(0.12 * SR), 150, 60, 0.02, 0.07, 0.6, 0.0015, 1); ping(out, j + Math.round(0.12 * SR), 132, 0.25, [[1, 1, 0.06], [1.9, 0.6, 0.04], [3.07, 0.4, 0.025]], 0.8);
  return fadeTail(out, 0.05);
}
// GLASSSLIDE {dur} — wire spectacles sliding out over card: a thin dry hiss of wire on paper, then they rock on
// their rims, twice, three times, each softer, and are still
export function sfxGlassSlide(e, seed) {
  const d = Math.max(0.6, e.dur || 1.85), out = new Float32Array(Math.ceil((d + 0.3) * SR)), r = new Rng(seed), nz = new Noise(seed), b1 = new SVF(5200, 4), b2 = new SVF(2200, 1.2), ds = 0.5 * d, n = Math.round(ds * SR);
  for (let i = 0; i < n; i++) { const u = i / n, w = nz.white(); b1.run(w); b2.run(w); out[i] += (b1.bp * 0.05 + b2.bp * 0.04) * smooth(u / 0.1) * Math.pow(1 - u, 0.7); }
  for (let t = ds, p = 0.26, a = 0.05; t < d && a > 0.004; t += p, p *= 0.8, a *= 0.6) { const at = Math.round(t * SR); ping(out, at, r.range(4600, 5200), a, [[1, 1, 0.05], [1.37, 0.6, 0.035]], r.next() * 6); ping(out, at + Math.round(0.03 * SR), r.range(5800, 6500), a * 0.6, [[1, 1, 0.04]], r.next() * 6); noiseBurst(out, at, { a: 0.0002, tau: 0.001, f0: 3000, q: 1, amp: a * 1.5 }, new Noise(seed + Math.round(t * 1e4))); }
  return fadeTail(out, 0.05);
}
// CHAIRBACK {who, dur} — a chair pushed slowly back over stone by the man in it: two heavy, careful pushes
export function sfxChairPush(e, seed) {
  const d = Math.max(0.6, e.dur || 2.3), out = new Float32Array(Math.ceil((d + 0.2) * SR)), lp = new SVF(1600, 0.6);
  const f = friction(d, { modes: WOOD.map(([ff, q, a]) => [ff * 0.95, q, a]), rate: (u) => 8 + 16 * Math.pow(Math.abs(Math.sin(Math.PI * 2 * u)), 0.7), env: (u) => Math.pow(Math.abs(Math.sin(Math.PI * 2 * u)), 0.8) * (1 - 0.4 * u), gain: 0.2, drive: 1.6, jit: 0.6, jitHz: 11 }, seed);
  const nz = new Noise(seed + 1), lo = new SVF(130, 0.7);
  for (let i = 0; i < f.length; i++) { const u = i / f.length; lo.run(nz.brown()); out[i] = lp.run(f[i]) + lo.lp * 0.4 * Math.pow(Math.abs(Math.sin(Math.PI * 2 * u)), 0.8); }
  return fadeTail(out, 0.05);
}
Object.assign(FILM_KINDS, { lampLean: sfxLampLean, lightLeaves: sfxLightLeaves, dragOut: sfxDragOut, crownSpin: sfxCrownSpin, button: sfxButton, plugBite: sfxPlugBite,
  suck: sfxSuck, keyStrain: sfxKeyStrain, shout: sfxShout, cheer: sfxCheerB, chuckle: sfxChuckleB, glassSlide: sfxGlassSlide, chairBack: sfxChairPush });

// ======================================================================================================================
// 《失控》 v7: the holdouts, the lying alarm, the last card. (The v3 chuckle is the film's again, not FEED's horn laugh.)
// HESITATE {who} — Meta's hand going out over 托管 and coming back: a sleeve's soft rustle out, a held breath (a short
// nasal intake that stops), the sleeve back, slower
export function sfxHesitate(e, seed) {
  const out = new Float32Array(Math.ceil(1.5 * SR)), nz = new Noise(seed), bp = new SVF(1600, 0.9), lp = new SVF(700, 0.7), br = new SVF(1900, 2.2), dr = new Drift(seed + 1, 9);
  const seg = (t, a, d) => { const x = (t - a) / d; return x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.3) : 0; };
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, w = nz.white(); bp.run(w); lp.run(w); br.run(nz.white());
    const cloth = (seg(t, 0, 0.32) + 0.75 * seg(t, 0.78, 0.5)) * (0.55 + 0.45 * Math.abs(dr.at(t)));
    const held = t > 0.26 && t < 0.62 ? smooth((t - 0.26) / 0.25) * (t < 0.6 ? 1 : (0.62 - t) / 0.02) : 0;
    out[i] = (bp.bp * 0.11 + lp.lp * 0.05) * cloth + br.bp * 0.045 * held;
  }
  return fadeTail(out, 0.03);
}
// ELIMINATED {who} — 淘汰: his screen goes grey. The game's flat verdict (two dull square-ish tones falling a tritone,
// A3 then E-flat3), then the panel dying: the backlight's click, a falling whine, a little electric fizz, nothing
export function sfxEliminated(e, seed) {
  const out = new Float32Array(Math.ceil(1.6 * SR));
  for (const [at, f, d, a] of [[0, 220, 0.16, 0.16], [0.2, 155.56, 0.42, 0.18]]) {
    const j = Math.round(at * SR), n = Math.round(d * SR), lp = new SVF(1400, 0.7);
    for (let i = 0; i < n; i++) { const t = i / SR; lp.run(Math.tanh(2.5 * Math.sin(TAU * f * t))); out[j + i] += lp.lp * a * Math.min(1, i / 96) * Math.exp(-t / (0.5 * d)) * Math.min(1, (n - i) / 240); }
  }
  const off = sfxLightOff(e, seed + 3), j = Math.round(0.68 * SR);
  for (let i = 0; i < off.length && j + i < out.length; i++) out[j + i] += off[i] * 0.55;
  sweep(out, j, 1900, 70, 0.09, 0.16, 0.05, 0.002, 0);
  return fadeTail(out, 0.05);
}
// DRAGOUT {who, dur} — a king and his heavy throne-like chair dragged back over stone into the dark, his hands still on
// the table: first his nails across the linen, catching on the wood edge and slipping off (a dry "tk"); the jolt of the
// weight; the oak legs juddering on the stone (stick-slip), one leg squealing, grating; away into the dark (darker,
// thinner, outward), gone
export function sfxDragOutV7(e, seed) {
  const d = Math.max(0.6, e.dur || 1.5), pan = clamp(e.pan ?? 0, -1, 1), side = Math.sign(pan || 1), S = pair(d + 0.5), r = new Rng(seed);
  const far = (u) => smooth(clamp(u)), speed = (u) => 0.6 + 0.4 * Math.exp(-u * 2.2);
  // the chair: two heavy legs (lower, slower than the v3 chair), the squealing one, the stone's grit
  const legs = new Float32Array(Math.ceil((d + 0.3) * SR));
  for (const leg of [0, 1]) add(legs, friction(d, { modes: WOOD.map(([f, q, a]) => [f * 0.72 * (leg ? 1.11 : 1), q, a]), rate: (u) => (14 + 55 * speed(u)) * (leg ? 1.17 : 1), env: (u) => smooth(u / 0.03) * (1 - smooth((u - 0.88) / 0.12)), gain: 0.22, drive: 2.0, jit: 0.7, jitHz: 19 }, seed + 11 + leg * 31), leg ? 0.8 : 1);
  add(legs, friction(d * 0.85, { modes: [[760, 70, 1], [1530, 80, 0.55], [2290, 90, 0.3], [3050, 95, 0.12]], rate: (u) => 38 + 30 * u, env: (u) => Math.pow(Math.max(0, Math.sin(Math.PI * (1.6 * u + 0.1))), 2) * (1 - 0.6 * u), gain: 0.07, drive: 1.5, jit: 0.5, jitHz: 7 }, seed + 50), 1);
  const nz = new Noise(seed + 2), grit = new SVF(3000, 0.8), lo = new SVF(110, 0.7), dist = new SVF(8000, 0.6), n = legs.length;
  for (let i = 0; i < n; i++) {
    const u = i / (d * SR);
    if ((i & 63) === 0) dist.set(8000 * Math.pow(500 / 8000, far(u)), 0.6);
    const en = smooth(u / 0.02) * (u < 1 ? 1 - 0.88 * far(u) : 0.12 * Math.max(0, 1 - (u - 1) * d / 0.25));
    grit.run(nz.white()); lo.run(nz.brown());
    const v = dist.run((legs[i] + grit.bp * 0.05 * speed(u)) * en) + lo.lp * 0.7 * speed(u) * en, [gl, gr] = panGains(pan + (clamp(pan + side * 0.55, -1, 1) - pan) * far(u));
    S.L[i] += v * gl * Math.SQRT2; S.R[i] += v * gr * Math.SQRT2;
  }
  // the jolt: the weight lurching back, a low knock through the floor
  const J = new Float32Array(Math.round(0.6 * SR));
  sweep(J, 0, 120, 42, 0.03, 0.09, 0.8, 0.002, 1.4); noiseBurst(J, 0, { a: 0.001, tau: 0.02, f0: 500, q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed + 4));
  ping(J, 0, 96, 0.22, [[1, 1, 0.08], [2.1, 0.5, 0.04]], 0.4);
  addPan(S, J, pan * 0.8, 0, 0.9);
  // his nails across the linen, catching on the edge, slipping off: a dry tick (centre: the table)
  const nd = Math.min(0.55, 0.35 * d), N = new Float32Array(Math.round((nd + 0.1) * SR)), nzN = new Noise(seed + 7), bN = new SVF(4200, 1.6), bW = new SVF(1900, 3);
  for (let i = 0; i < Math.round(nd * SR); i++) { const t = i / SR, u = t / nd, jud = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(Math.PI * 31 * t)), 3); bN.run(nzN.white()); bW.run(nzN.white()); N[i] = (bN.bp * 0.12 + (u > 0.7 ? bW.bp * 0.08 * (u - 0.7) / 0.3 : 0)) * jud * smooth(u / 0.1); }
  noiseBurst(N, Math.round(nd * SR), { a: 0.0001, tau: 0.0012, f0: 3600, q: 0.9, amp: 0.4 }, new Noise(seed + 8)); ping(N, Math.round(nd * SR), r.range(900, 1100), 0.06, [[1, 1, 0.02], [2.4, 0.4, 0.01]], 0.3);
  addPan(S, N, pan * 0.35, Math.round(0.02 * SR));
  fadeTail(S.L, 0.08); fadeTail(S.R, 0.08);
  return { L: S.L, R: S.R, panned: true };
}
// ATTACKALARM {who} (errorAlarm) — "⚠ 您正遭受对方攻击": the system warning him, calm and official, which is the lie: a
// clean announcement chime (A6 down to D6, a fifth, glass-pure: the AI's own interval, no third), twice, over a
// steady piercing pulse (A5, a soft square, six beats a second) and a low throb. Polished, not broken.
export function sfxAttackAlarm(e, seed) {
  const d = 1.25, out = new Float32Array(Math.ceil((d + 0.9) * SR));
  for (const [at, m] of [[0, 93], [0.22, 86], [0.62, 93], [0.84, 86]]) ping(out, Math.round(at * SR), mtof(m), 0.11, [[1, 1, 0.55], [2, 0.18, 0.3], [3, 0.12, 0.18], [4.2, 0.05, 0.08]], 0.1);
  const lp = new SVF(4200, 0.7), n = Math.round(d * SR);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, gate = Math.pow(Math.max(0, Math.sin(Math.PI * 6 * t)), 0.6); p += 880 / SR; p -= Math.floor(p);
    lp.run(Math.tanh(1.6 * Math.sin(TAU * p)));
    const throb = Math.sin(TAU * 73.4 * t) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * 3 * t - 1.5));
    out[i] += (lp.lp * 0.035 * gate + throb * 0.05) * smooth(t / 0.02) * Math.min(1, (n - i) / (0.05 * SR));
  }
  return fadeTail(out, 0.1);
}
// CREDITSLAP (v8) — the last sound, a mosquito swat: in two frames a palm slams the card flat on the desk right at the
// lens. No whoosh before it, no room, no tail: a hard sharp crack (skin and card), the desk's short low thump under it,
// driven dense so it lands about as loud as the end slam, but tight (gone in a quarter second)
export function sfxCreditSlap(e, seed) {
  const out = new Float32Array(Math.ceil(0.3 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.012, f0: 3200, q: 0.55, amp: 4.0, hp: 700 }, new Noise(seed + 2));          // the crack
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0007, f0: 7500, q: 0.8, amp: 1.2 }, new Noise(seed + 3));                  // the edge
  noiseBurst(out, 0, { a: 0.0003, tau: 0.02, f0: 2200, q: 0.7, mode: 'lp', amp: 3.0 }, new Noise(seed + 1));         // the palm
  ping(out, 0, r.range(215, 235), 0.3, [[1, 1, 0.035], [2.2, 0.45, 0.018], [3.5, 0.2, 0.009]], 0.7);                 // the desk top
  sweep(out, 0, 170, 75, 0.01, 0.025, 0.5, 0.0008, 1.4);                                                             // the thump
  // driven hard (dense, loud for its peak), then shut: nothing rings past ~0.1 s
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = Math.tanh(out[i] * 5) / Math.tanh(5) * (t < 0.04 ? 1 : Math.exp(-(t - 0.04) / 0.02)); }
  fadeTail(out, 0.06);
  return out;
}
// BOARDFLIP (v8: the AI 智力排行榜, a big digital screen) — no flaps: a soft UI tick and a short airy slide (the rows
// moving up and down); e.chime (prepareEvents: the #1 changed hands): a bright little glass chime on top (A6 then E7,
// the AI's fifth). e.dateOnly (only the year·month changed): the tick alone.
// e.big (the board fills the frame): the whole table of rows reshuffles: five slides cascading across the screen.
export function sfxBoardTick(e, seed) {
  const r = new Rng(seed), d = 0.16, nS = e.big && !e.dateOnly ? 5 : e.dateOnly ? 0 : 1, len = (e.chime ? 0.9 : 0.3) + (nS - 1) * 0.045, S = pair(len);
  const tick = new Float32Array(Math.round(0.06 * SR));
  noiseBurst(tick, 0, { a: 0.0001, tau: 0.0009, f0: 3000 * r.range(0.95, 1.05), q: 1.2, amp: 0.4 }, new Noise(seed));
  ping(tick, 0, 1320 * r.range(0.98, 1.02), 0.06, [[1, 1, 0.018], [2.01, 0.3, 0.01]], 0.2);
  addMid(S, tick, 0, 1);
  for (let k = 0; k < nS; k++) {
    const nz = new Noise(seed + 1 + 7 * k), bp = new SVF(1500, 1.4), j = Math.round((0.012 + 0.045 * k) * SR), n = Math.round(d * SR), g = new Float32Array(n + Math.round(0.03 * SR)), f0 = 1400 * (1 + 0.12 * k);
    for (let i = 0; i < n; i++) { const u = i / n; if ((i & 31) === 0) bp.set(f0 + 2600 * u, 1.4); bp.run(nz.white()); g[i] = bp.bp * 0.13 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - 0.4 * u); }
    noiseBurst(g, n, { a: 0.0001, tau: 0.0007, f0: 4200, q: 1.2, amp: 0.18 }, new Noise(seed + 2 + 7 * k));   // the row settling
    addPan(S, g, nS > 1 ? -0.6 + 0.3 * k : 0, j, nS > 1 ? 0.85 : 1);
  }
  if (e.chime) {
    const c = new Float32Array(Math.round(0.8 * SR)), j = Math.round((0.09 + 0.045 * (nS > 1 ? nS - 1 : 0)) * SR);
    ping(c, 0, mtof(93), 0.09, [[1, 1, 0.45], [2.0, 0.15, 0.2], [3.0, 0.06, 0.1]], 0.1); ping(c, Math.round(0.07 * SR), mtof(100), 0.07, [[1, 1, 0.4], [2.0, 0.12, 0.18]], 0.4);
    addMid(S, c, j, nS > 1 ? 1.4 : 1);
  }
  fadeTail(S.L, 0.04); fadeTail(S.R, 0.04);
  return S;
}
// COUNTUP {dur} (the score's own, 5-06's leaderboard insert) — the auto scores racing up: a soft digital ticker,
// faster and faster and a little higher, a short bright blip as they pass "人类 100" (two thirds in), then on
export function sfxCountUp(e, seed) {
  const d = Math.max(0.4, e.dur || 1.6), out = new Float32Array(Math.ceil((d + 0.6) * SR)), r = new Rng(seed);
  for (let t = 0.02, k = 0; t < d; k++) {
    const u = t / d, f = 2200 + 1400 * u;
    noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: 0.0005, f0: f * r.range(0.97, 1.03), q: 1.6, amp: 0.16 + 0.1 * u }, new Noise(seed + k));
    ping(out, Math.round(t * SR), 880 * Math.pow(2, Math.round(12 * u) / 12), 0.02, [[1, 1, 0.012]], 0.2);
    t += 0.075 * (1 - 0.6 * u);
  }
  const j = Math.round(0.66 * d * SR); ping(out, j, mtof(93), 0.08, [[1, 1, 0.3], [2, 0.2, 0.12]], 0.1); ping(out, j, mtof(100), 0.05, [[1, 1, 0.25]], 0.5);
  return fadeTail(out, 0.05);
}
Object.assign(FILM_KINDS, { hesitate: sfxHesitate, eliminated: sfxEliminated, dragOut: sfxDragOutV7, errorAlarm: sfxAttackAlarm, creditSlap: sfxCreditSlap, chuckle: sfxChuckle, boardFlip: sfxBoardTick, countUp: sfxCountUp });
