// Sound department — synthesis engines for the effects of JOKERS WILD.
// Generic engines (tex, tone, grains, friction, sweep) come from YOUR TURN / THE BIG ONE (same author,
// MIT; they follow LEVIATHAN). One synth per sound-event kind lives below (see src/sound-events.js for
// the kinds): each returns a mono Float32Array, or { L, R } when the sound has its own stereo spread
// (the card storm, split-flap runs). Every sound is a pure function of (event, seed).
// Palette: dry, physical, heavy. Steel, paper, glass, wood and electricity in a stone room. Nothing
// springy, squeaky or cartoonish: no pitch "boings", no pops, no mallet tones.
import { SR, TAU, SVF, Noise, Drift, Rng, panGains, ping, pws, clamp, smooth, noiseBurst, drive } from './audio-dsp.js';
import { warDrum, boom, heart as heartStroke } from './audio-inst.js';

export const K = (keys) => (t) => pws(keys, t);

// ---- tex: filtered stereo noise with f(t), g(t), pan(t) in film seconds, into a (windowed) group
// o: { t0, t1, seed, color w|p|b, mode lp|bp|hp, f, q, g, pan, width 0..1, send, hp }
export function tex(G, o) {
  const off = G.off ?? 0, N = G.dry.n, i0 = Math.max(0, Math.round(o.t0 * SR) - off), i1 = Math.min(N, Math.round(o.t1 * SR) - off);
  if (i1 <= i0) return;
  const a = new Noise(o.seed ?? 1), b = new Noise((o.seed ?? 1) + 7717);
  const color = o.color ?? 'p', mode = o.mode ?? 'lp', q = o.q ?? 0.7, w = o.width ?? 0.8, send = o.send ?? 0.2;
  const src = color === 'w' ? (n) => n.white() : color === 'b' ? (n) => n.brown() : (n) => n.pink();
  const f = typeof o.f === 'function' ? o.f : () => o.f, g = typeof o.g === 'function' ? o.g : () => o.g ?? 1, pan = o.pan;
  const fa = new SVF(f(o.t0), q), fb = new SVF(f(o.t0), q), hpa = o.hp ? new SVF(o.hp, 0.7) : null, hpb = o.hp ? new SVF(o.hp, 0.7) : null;
  let gl = 0, gr = 0, dl = 0, dr = 0;
  const dL = G.dry.L, dR = G.dry.R, sL = G.send.L, sR = G.send.R, fadeN = Math.round(0.004 * SR);
  for (let i = i0; i < i1; i++) {
    if (((i - i0) & 63) === 0) {
      const t = (i + off) / SR, fc = f(t + 32 / SR), v = g(t + 64 / SR) * Math.SQRT2;
      fa.set(fc, q); fb.set(fc, q);
      const [pl, pr] = panGains(pan ? pan(t) : 0);
      dl = (v * pl - gl) / 64; dr = (v * pr - gr) / 64;
    }
    const x = src(a), y = x * (1 - w) + src(b) * w;
    fa.run(x); fb.run(y);
    let vL = mode === 'lp' ? fa.lp : mode === 'hp' ? fa.hp : fa.bp, vR = mode === 'lp' ? fb.lp : mode === 'hp' ? fb.hp : fb.bp;
    if (hpa) { hpa.run(vL); hpb.run(vR); vL = hpa.hp; vR = hpb.hp; }
    gl += dl; gr += dr;
    const end = i1 - i < fadeN ? (i1 - i) / fadeN : 1, l = vL * gl * end, r = vR * gr * end;
    dL[i] += l; dR[i] += r;
    if (send) { sL[i] += l * send; sR[i] += r * send; }
  }
}

// ---- grains: a random event cloud. density(t) per second; ev(mono, at, rng, t, pan, panGain)
export const grains = (t0, t1, density, ev, seed, tail, width) => drive(grainsG(t0, t1, density, ev, seed, tail, width));
export function* grainsG(t0, t1, density, ev, seed, tail = 0.5, width = 0.8) {
  const len = Math.ceil((t1 - t0 + tail) * SR), L = new Float32Array(len), R = new Float32Array(len), r = new Rng(seed);
  let t = t0, k = 0;
  const dmax = (t) => Math.max(0.05, density(t));
  while (t < t1) {
    const d = dmax(t); t += -Math.log(1 - r.next() * 0.9999) / d;
    if (t >= t1) break;
    const pan = r.range(-1, 1), [gl, gr] = panGains(pan * width), at = Math.round((t - t0) * SR), s = r.next() < gl * gl ? L : R;
    ev(s, at, r, t, pan, s === L ? gl : gr);
    if (++k % 256 === 0) yield undefined;
  }
  return { L, R };
}

// ---- friction: stick-slip pulses through resonant modes. Wood and steel creaks, groans, scrapes.
export function friction(dur, o, seed = 1) {
  const len = Math.ceil(dur * SR), out = new Float32Array(len), r = new Rng(seed), dr = new Drift(seed, o.jitHz ?? 17), jit = o.jit ?? 0.45;
  const M = o.modes.map(([f, q, a]) => { const fc = Math.min(f, SR * 0.45), rr = Math.exp(-Math.PI * fc / (q * SR)); return { c1: 2 * rr * Math.cos(TAU * fc / SR), c2: -rr * rr, a, y1: 0, y2: 0, g: (1 - rr) * 12 }; });
  let ph = 0, rate = 1, e = 0, pulse = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    if ((i & 63) === 0) { rate = o.rate(u) * (1 + jit * dr.at(i / SR)); e = o.env(u); }
    ph += rate / SR; pulse *= 0.86;
    if (ph >= 1) { ph -= 1; pulse += r.range(0.4, 1) * (r.next() < 0.5 ? -1 : 1); }
    const ex = pulse * e;
    let s = 0;
    for (const q of M) { const y = q.c1 * q.y1 + q.c2 * q.y2 + ex * q.g; q.y2 = q.y1; q.y1 = y; s += y * q.a; }
    out[i] = Math.tanh(s * (o.drive ?? 1)) * (o.gain ?? 0.5);
  }
  return out;
}
const CHAIRWOOD = [[132, 10, 0.8], [251, 14, 1], [405, 18, 0.7], [680, 22, 0.4], [1090, 26, 0.18]];
const STEEL = [[96, 35, 0.55], [214, 45, 1], [388, 55, 0.8], [652, 65, 0.6], [1043, 75, 0.35], [1612, 85, 0.2], [2477, 95, 0.1]];

export const add = (dst, src, g = 1, at = 0) => { for (let i = Math.max(0, -at); i < src.length && at + i < dst.length; i++) dst[at + i] += src[i] * g; };
export const fadeTail = (b, sec = 0.01) => { const n = Math.min(b.length, Math.round(sec * SR)); for (let i = 0; i < n; i++) b[b.length - 1 - i] *= i / n; return b; };
// a short decaying sine sweep (thuds, bodies)
export function sweep(out, at, f0, f1, tauF, tauA, amp, att = 0.002, drive = 0) {
  const len = Math.min(out.length - at, Math.ceil(tauA * 7 * SR)), kf = Math.exp(-1 / (tauF * SR)), ka = Math.exp(-1 / (tauA * SR));
  let p = 0, ef = 1, ea = 1;
  for (let i = 0; i < len; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * ef; p += f / SR; if (p > 1) p -= 1;
    let x = Math.sin(TAU * p) * ea * (t < att ? t / att : 1);
    if (drive) x = Math.tanh(x * (1 + drive)) / Math.tanh(1 + drive);
    out[at + i] += x * amp; ef *= kf; ea *= ka;
  }
}
const steelPing = (out, at, f, amp, ph = 0, dec = 1) => ping(out, at, f, amp, [[1, 1, 0.05 * dec], [1.83, 0.7, 0.032 * dec], [2.94, 0.45, 0.02 * dec], [4.37, 0.25, 0.012 * dec], [6.1, 0.12, 0.008 * dec]], ph);

// =============================================================== sound-event kinds
// e = { t, kind, gain, pan, pitch (semitones), dur, size 0..1, who }

// TICK: one card flicked: the AI layer's clock. Every tick is the SAME waveform (a machine does not vary):
// a crisp paper-edge snap, no tone. Cached by size bucket.
const tickCache = new Map();
export function sfxTick(e) {
  const b = Math.round(clamp(e.size ?? 0.3) * 4), key = SR * 10 + b;
  if (tickCache.has(key)) return tickCache.get(key);
  const size = b / 4, out = new Float32Array(Math.ceil(0.04 * SR));
  noiseBurst(out, 0, { a: 0.00015, tau: 0.0009, f0: 4600, q: 1.1, amp: 1.0 }, new Noise(7));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.003 + 0.004 * size, f0: 2100, q: 2.0, amp: 0.32 }, new Noise(8));
  noiseBurst(out, 0, { a: 0.0004, tau: 0.004, f0: 700, q: 0.8, mode: 'lp', amp: 0.18 * (0.5 + size) }, new Noise(9));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0007, f0: 9500, q: 0.9, amp: 0.55 }, new Noise(10));   // the edge: sits above the band-limited march
  fadeTail(out, 0.004);
  tickCache.set(key, out);
  return out;
}

// THROW: a card leaving a hand: a short air whip
export function sfxThrow(e, seed) {
  const size = e.size ?? 0.5, d = 0.075 + 0.05 * size, len = Math.ceil((d + 0.02) * SR), out = new Float32Array(len), nz = new Noise(seed), bp = new SVF(900, 1.5), r = new Rng(seed);
  const f0 = r.range(650, 950), f1 = r.range(2400, 3600);
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 15) === 0) bp.set(f0 + (f1 - f0) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 1.3), 1.5);
    bp.run(nz.white());
    out[i] = bp.bp * Math.pow(Math.sin(Math.PI * u), 2) * 0.75;
  }
  return fadeTail(out);
}

// SLAP: a card landing on the pile: a flat paper "thwap" on a stack of cards
export function sfxSlap(e, seed) {
  const size = e.size ?? 0.35, out = new Float32Array(Math.ceil(0.1 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0005, tau: 0.007 + 0.01 * size, f0: 1700 + 700 * r.next(), q: 0.7, mode: 'lp', amp: 0.85 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.002, f0: 4800, q: 0.9, amp: 0.3 }, new Noise(seed + 1));
  ping(out, 0, 360 + 220 * (1 - size), 0.12 * (0.5 + size), [[1, 1, 0.018], [2.3, 0.4, 0.01]], r.next() * 6);
  return fadeTail(out);
}

// STAMP: rubber approval stamp on paper (handle thud, rubber squish, paper slap)
export function sfxStamp(e, seed) {
  const size = e.size ?? 0.5, out = new Float32Array(Math.ceil(0.3 * SR)), r = new Rng(seed);
  ping(out, 0, (125 + 30 * (1 - size)) * r.range(0.97, 1.03), 0.35, [[1, 1, 0.06], [2.2, 0.35, 0.035]], 1);
  noiseBurst(out, 0, { a: 0.0015, tau: 0.02, f0: 650, q: 0.9, mode: 'lp', amp: 0.9 }, new Noise(seed));
  noiseBurst(out, Math.round(0.002 * SR), { a: 0.0008, tau: 0.011, f0: 2100, q: 1.1, amp: 0.5 }, new Noise(seed + 1));
  sweep(out, 0, 120, 70, 0.03, 0.06, 0.3 * (0.4 + size));
  return fadeTail(out);
}

// COVER: the steel safety cover flipped up: a thumbnail on the lip, the spring-loaded plate snapping
// against its stop (steel ring), the hinge
export function sfxCover(e, seed) {
  const out = new Float32Array(Math.ceil(0.35 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.004, tau: 0.01, f0: 2700, q: 1.6, amp: 0.12 }, new Noise(seed));
  const at = Math.round((0.03 + 0.008 * r.next()) * SR);
  ping(out, at, 1810, 0.42, [[1, 1, 0.055], [2.41, 0.6, 0.038], [3.93, 0.35, 0.022], [5.62, 0.18, 0.012]], 0.3);
  ping(out, at, 590, 0.3, [[1, 1, 0.028], [2.7, 0.3, 0.014]], 1.1);
  noiseBurst(out, at, { a: 0.0002, tau: 0.0018, f0: 5200, q: 0.8, amp: 0.65 }, new Noise(seed + 1));
  ping(out, at + Math.round(0.002 * SR), 3340, 0.05, [[1, 1, 0.09]], 2);
  return fadeTail(out);
}

// RELAY: the AUTO button: a fist on the button, a heavy contactor slamming home (steel on steel, a
// moment of 100 Hz coil chatter), then the latch. size = weight.
export function sfxRelay(e, seed) {
  const size = e.size ?? 0.7, out = new Float32Array(Math.ceil(0.45 * SR)), r = new Rng(seed), k = 1.2 - 0.4 * size;
  sweep(out, 0, 210 * k, 92 * k, 0.012, 0.03 + 0.03 * size, 0.5 * (0.5 + size), 0.001, 0.8);
  noiseBurst(out, 0, { a: 0.0008, tau: 0.009, f0: 900, q: 0.7, mode: 'lp', amp: 0.45 }, new Noise(seed));
  const a1 = Math.round((0.012 + 0.006 * r.next()) * SR);
  steelPing(out, a1, 760 * k * r.range(0.97, 1.03), 0.48, r.next() * 6);
  ping(out, a1, 128 * k, 0.45 * size, [[1, 1, 0.055], [2.2, 0.3, 0.028]], 0.7);
  noiseBurst(out, a1, { a: 0.0002, tau: 0.0016, f0: 4200, q: 0.9, amp: 0.75 }, new Noise(seed + 1));
  { const n = Math.round(0.08 * SR); for (let i = 0; i < n && a1 + i < out.length; i++) { const t = i / SR; out[a1 + i] += Math.tanh(4 * Math.sin(TAU * 100 * t)) * 0.05 * size * Math.exp(-t / 0.022) * Math.min(1, t / 0.002); } }
  const a2 = a1 + Math.round((0.045 + 0.015 * r.next()) * SR);
  ping(out, a2, 2350 * k, 0.22, [[1, 1, 0.011], [1.57, 0.5, 0.007], [2.62, 0.3, 0.005]], 0.4);
  noiseBurst(out, a2, { a: 0.0002, tau: 0.0011, f0: 5600, q: 1, amp: 0.35 }, new Noise(seed + 2));
  return fadeTail(out);
}

// STRING: glowing puppet threads snapping taut: a stiff steel wire's low "thrum" (inharmonic partials,
// no pitch glide: a snap, not a boing) over a short fibre hiss
export function sfxString(e, seed) {
  const r = new Rng(seed), f0 = (58 + 24 * r.next()) * Math.pow(2, (e.pitch ?? 0) / 12), out = new Float32Array(Math.ceil(0.8 * SR));
  const B = 0.0022, parts = [];
  for (let n = 1; n <= 26; n++) { const f = n * f0 * Math.sqrt(1 + B * n * n); if (f > 8000) break; parts.push([f / f0, (1 / Math.pow(n, 0.8)) * (n % 6 === 0 ? 0.25 : 1), 0.5 / (1 + 0.22 * n)]); }
  ping(out, 0, f0, 0.26, parts, r.next() * 6);
  noiseBurst(out, 0, { a: 0.002, tau: 0.014, f0: 3000, q: 0.9, amp: 0.35, hp: 1400 }, new Noise(seed + 1));
  noiseBurst(out, 0, { a: 0.0005, tau: 0.006, f0: 500, q: 0.8, mode: 'lp', amp: 0.3 }, new Noise(seed + 2));
  return fadeTail(out, 0.06);
}

// CREAKS: a heavy king leaning back into his chair: carved wood under load and stretched leather
export function sfxCreakS(e, seed) {
  const d = Math.max(0.3, e.dur || 0.75), size = e.size ?? 0.5, k = 1.25 - 0.5 * size;
  const out = friction(d, { modes: CHAIRWOOD.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 16 + 50 * Math.pow(Math.sin(Math.PI * u), 0.8), env: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 1.3), gain: 0.17, drive: 1.6, jit: 0.6 }, seed);
  const lea = friction(d * 0.8, { modes: [[610, 8, 0.6], [1140, 10, 1], [1880, 12, 0.5]], rate: (u) => 38 + 70 * u, env: (u) => Math.pow(Math.sin(Math.PI * u), 2), gain: 0.06, drive: 1.2, jit: 0.8 }, seed + 1);
  add(out, lea, 1, Math.round(0.08 * SR));
  return fadeTail(out);
}

// LIGHTER: flint wheel (a gritty scrape with sparks) and the flame catching (a soft low "fwhp")
export function sfxLighter(e, seed) {
  const out = new Float32Array(Math.ceil(0.55 * SR)), r = new Rng(seed);
  const wl = Math.round(0.05 * SR), nz = new Noise(seed), bp = new SVF(3800, 1.2);
  for (let i = 0; i < wl; i++) { const u = i / wl; bp.run(nz.white()); out[i] += bp.bp * Math.sin(Math.PI * u) * 0.3 * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 140 * i / SR + 7 * u))); }
  for (let k = 0; k < 9; k++) noiseBurst(out, Math.round(r.range(0.004, 0.065) * SR), { a: 0.0001, tau: 0.0005, f0: r.range(5000, 9000), q: 1.5, amp: r.range(0.15, 0.45) }, new Noise(seed + 10 + k));
  const fa = Math.round(0.058 * SR), fn = new Noise(seed + 3), lp = new SVF(700, 0.7), lp2 = new SVF(240, 0.8);
  for (let i = 0; fa + i < out.length; i++) { const t = i / SR, en = smooth(t / 0.03) * Math.exp(-t / 0.15); const w = fn.white(); lp.run(w); lp2.run(w); out[fa + i] += (lp.lp * 0.6 + lp2.lp * 0.9) * en * 0.5; }
  return fadeTail(out);
}

// PUFF: a slow draw on a cigar: breath through the leaf, the tip crackling as it glows
export function sfxPuff(e, seed) {
  const d = 0.55, len = Math.ceil((d + 0.1) * SR), out = new Float32Array(len), nz = new Noise(seed), bp = new SVF(900, 1.1), r = new Rng(seed);
  for (let i = 0; i < len; i++) { const t = i / SR, u = t / d; if ((i & 31) === 0) bp.set(650 + 450 * u, 1.1); bp.run(nz.white()); out[i] = bp.bp * smooth(u / 0.4) * (1 - smooth((u - 0.7) / 0.35)) * 0.2; }
  for (let k = 0; k < 14; k++) noiseBurst(out, Math.round(r.range(0.1, d) * SR), { a: 0.0001, tau: 0.0006, f0: r.range(2500, 6500), q: 1.2, amp: r.range(0.04, 0.14) }, new Noise(seed + 20 + k));
  return fadeTail(out);
}

// CLINK: two lead-crystal glasses touching across the table: two goblets (slightly different, so they
// beat) and the contact. Cold and clean. size = how hard / how full the ring.
export function sfxClink(e, seed) {
  const size = e.size ?? 0.7, r = new Rng(seed), out = new Float32Array(Math.ceil(2.4 * SR));
  const G = [[1, 1, 1.5], [2.32, 0.5, 0.85], [4.08, 0.26, 0.42], [6.3, 0.14, 0.22], [8.9, 0.07, 0.12]];
  const fA = 1270 * r.range(0.98, 1.02), fB = fA * r.range(1.035, 1.055), s = 0.7 + 0.6 * size;
  ping(out, 0, fA, 0.15 * s, G.map(([q, a, d]) => [q, a, d * s]), 0.2);
  ping(out, 0, fB, 0.12 * s, G.map(([q, a, d]) => [q, a, d * 0.85 * s]), 1.4);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0008, f0: 6500, q: 0.9, amp: 0.5 }, new Noise(seed));
  return fadeTail(out, 0.12);
}

// FLAPS: a run of split-flap characters (dur): a dense chatter of small plastic flaps falling across
// the board, a few last ones settling. Stereo (the board is wide).
export function sfxFlaps(e, seed) {
  const d = Math.max(0.12, e.dur || 0.3), g = grains(0, d, (t) => 240 * (t < d * 0.85 ? 1 : 0.25), (s, at, r) => {
    const f = r.range(2100, 3500), a = r.range(0.25, 0.6);
    noiseBurst(s, at, { a: 0.00015, tau: 0.0014, f0: f, q: 1.6, amp: a }, new Noise(at * 3 + 1));
    ping(s, at, r.range(1050, 1650), a * 0.2, [[1, 1, 0.006], [2.1, 0.4, 0.004]], r.next() * 6);
    ping(s, at, r.range(260, 340), a * 0.12, [[1, 1, 0.01]], 0.3);
  }, seed, 0.08, 0.9);
  fadeTail(g.L); fadeTail(g.R);
  return g;
}

// CRACKG: glass cracking. size ~1: a sharp crack (the snap, a run of fracture ticks, the case's glass
// ringing, a thump in its frame, the crack hissing outward). size ~0: a slow creeping crack over dur
// (micro-fractures in bursts, now and then a tiny glass ping): ice on a lake.
export function sfxCrackG(e, seed) {
  const size = e.size ?? 1, r = new Rng(seed);
  if (size >= 0.6) {
    const out = new Float32Array(Math.ceil(2.4 * SR));
    noiseBurst(out, 0, { a: 0.0001, tau: 0.0022, f0: 3200, q: 0.6, amp: 1.0, hp: 700 }, new Noise(seed));
    noiseBurst(out, 0, { a: 0.0003, tau: 0.012, f0: 1300, q: 0.7, mode: 'lp', amp: 0.55 }, new Noise(seed + 1));
    let t = 0.002;
    for (let k = 0; k < 46; k++) { t += 0.0025 * Math.exp(k / 14) * r.range(0.4, 1.6); noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0003, 0.0012), f0: r.range(3500, 9500), q: 1.2, amp: r.range(0.15, 0.6) * Math.exp(-k / 22) }, new Noise(seed + 10 + k)); }
    ping(out, 0, 2080, 0.06 * size, [[1, 1, 0.55], [1.62, 0.7, 0.38], [2.47, 0.5, 0.26], [3.31, 0.3, 0.17], [4.6, 0.18, 0.1]], 0.4);
    ping(out, Math.round(0.003 * SR), 2930, 0.04 * size, [[1, 1, 0.42], [1.71, 0.6, 0.3], [2.83, 0.35, 0.18]], 1.7);
    sweep(out, 0, 150, 68, 0.02, 0.05, 0.45, 0.001, 0.6);
    const nz = new Noise(seed + 5), hp = new SVF(6200, 0.8), n = Math.round(0.7 * SR);
    for (let i = 0; i < n; i++) { const tt = i / SR; hp.run(nz.white()); out[i] += hp.hp * 0.09 * smooth(tt / 0.01) * Math.exp(-tt / 0.18); }
    return fadeTail(out, 0.05);
  }
  // the creeping crack
  const d = Math.max(0.4, e.dur || 1.2), out = new Float32Array(Math.ceil((d + 0.6) * SR));
  let t = r.range(0, 0.05);
  while (t < d) {
    const u = t / d, burst = 0.5 + 0.5 * Math.sin(TAU * (1.7 * u + 0.3 * r.next()));       // it runs in spurts
    const a = r.range(0.04, 0.17) * (0.5 + 0.5 * burst) * (0.6 + 0.6 * u), at = Math.round(t * SR);
    noiseBurst(out, at, { a: 0.0001, tau: r.range(0.0003, 0.0011), f0: r.range(3000, 9000), q: 1.3, amp: a }, new Noise(seed + at));
    if (r.next() < 0.08) ping(out, at, r.range(2200, 4800), a * 0.08, [[1, 1, r.range(0.02, 0.05)], [1.66, 0.5, 0.02]], r.next() * 6);
    t += (0.004 + 0.06 * (1 - burst) * r.next()) * (1.2 - 0.6 * size);
  }
  return fadeTail(out, 0.05);
}

// ASH: cigar ash dropping onto the table: a soft dull tap and a few crumbs
export function sfxAsh(e, seed) {
  const out = new Float32Array(Math.ceil(0.15 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.001, tau: 0.012, f0: 600, q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed));
  for (let k = 0; k < 5; k++) noiseBurst(out, Math.round(r.range(0.003, 0.05) * SR), { a: 0.0001, tau: 0.0006, f0: r.range(2500, 5000), q: 1, amp: r.range(0.05, 0.15) }, new Noise(seed + 3 + k));
  return fadeTail(out);
}

// BUZZ: the lamp's filament stuttering: a 100 Hz arcing buzz gated by an irregular flicker, crackle,
// and the filament's last little "tink"
export function sfxBuzz(e, seed) {
  const d = Math.max(0.1, e.dur || 0.35), len = Math.ceil((d + 0.12) * SR), out = new Float32Array(len), r = new Rng(seed), nz = new Noise(seed), bp = new SVF(1900, 0.9);
  const gate = []; for (let t = 0; t < d;) { const on = r.next() < 0.62, l = r.range(0.012, 0.055); gate.push([t, t + l, on ? r.range(0.5, 1) : 0]); t += l; }
  let gi = 0, gv = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    while (gi < gate.length - 1 && t >= gate[gi][1]) gi++;
    const target = t < d ? gate[gi][2] : 0; gv += (target - gv) * 0.02;
    const b = Math.tanh(5 * Math.sin(TAU * 100 * t)) + 0.35 * Math.tanh(3 * Math.sin(TAU * 200 * t + 0.7));
    bp.run(nz.white());
    out[i] = (b * 0.22 + bp.bp * 0.3 * Math.abs(Math.sin(TAU * 100 * t))) * gv;
  }
  for (let k = 0; k < 12; k++) noiseBurst(out, Math.round(r.range(0, d) * SR), { a: 0.0001, tau: 0.0005, f0: r.range(3000, 8000), q: 1, amp: r.range(0.1, 0.35) }, new Noise(seed + 30 + k));
  ping(out, Math.round(d * SR), 4250, 0.05, [[1, 1, 0.02], [2.3, 0.4, 0.01]], 0.2);
  return fadeTail(out);
}

// ALARM: the alarm beacon switching on: a big knife-switch contactor, then the beacon's motor and
// gears whining up (the siren itself is the ambience, from e.t on)
export function sfxAlarm(e, seed) {
  const out = new Float32Array(Math.ceil(1.3 * SR)), r = new Rng(seed);
  sweep(out, 0, 170, 66, 0.015, 0.07, 0.42, 0.001, 1.0);
  steelPing(out, 0, 610, 0.34, r.next() * 6, 1.6);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.003, f0: 3600, q: 0.8, amp: 0.7 }, new Noise(seed));
  const nz = new Noise(seed + 1), g = new SVF(1500, 2);
  let p = 0, p2 = 0;
  const m0 = Math.round(0.03 * SR);
  for (let i = m0; i < out.length; i++) {
    const t = (i - m0) / SR, sp = 1 - Math.exp(-t / 0.35), f = 90 + 380 * sp;
    p += f / SR; p2 += f * 2.02 / SR; g.set(900 + 1600 * sp, 2); g.run(nz.white());
    const en = smooth(t / 0.05) * (1 - smooth((t - 0.9) / 0.35));
    out[i] += (Math.sin(TAU * p) * 0.12 + Math.sin(TAU * p2) * 0.05 + g.bp * 0.14 * (0.5 + 0.5 * Math.sin(TAU * f * 0.25 * t))) * en * 0.6;
  }
  return fadeTail(out, 0.05);
}

// CLICK: the dead cancel key: a plastic keycap bottoming out on a steel spring. A short hollow "tk",
// no latch, no electrical answer. Dry.
export function sfxClick(e, seed) {
  const out = new Float32Array(Math.ceil(0.1 * SR)), r = new Rng(seed), k = 1 + 0.03 * (r.next() - 0.5);
  ping(out, 0, 2150 * k, 0.38, [[1, 1, 0.008], [1.68, 0.5, 0.005], [2.9, 0.25, 0.0035]], r.next() * 6);
  ping(out, 0, 410 * k, 0.34, [[1, 1, 0.016], [2.3, 0.3, 0.009]], 1.2);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0013, f0: 4800, q: 0.9, amp: 0.6 }, new Noise(seed));
  ping(out, Math.round(0.004 * SR), 5300, 0.03, [[1, 1, 0.016]], 0.5);
  return fadeTail(out, 0.01);
}

// CHAINS (dur, size): iron chain links over dur. size < 0.75 (default 0.5): the box's chains rattling as they are
// wrapped on or slither off (links clinking at an uneven rate, a slither, a few last links settling).
// size >= 0.75: a heavy chain running out fast through a hawse, faster and faster, the drum rumbling, and the
// jolt when it runs out (the seal on the giant's chain).
export function sfxChains(e, seed) {
  const d = Math.max(0.2, e.dur || 0.8), size = e.size ?? 0.5, heavy = size >= 0.75, len = Math.ceil((d + (heavy ? 0.9 : 0.45)) * SR), out = new Float32Array(len), r = new Rng(seed);
  let t = 0;
  while (t < d) {
    const u = t / d, at = Math.round(t * SR);
    const a = r.range(0.1, 0.26) * (heavy ? 0.7 + 0.3 * u : 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92)));
    const f = heavy ? r.range(380, 820) * (1.3 - 0.5 * size) : r.range(640, 1650);
    steelPing(out, at, f, a, r.next() * 6, heavy ? 1 + 0.6 * size : 0.75);
    noiseBurst(out, at, { a: 0.0002, tau: 0.0014, f0: r.range(2800, 6000), q: 1, amp: r.range(0.1, 0.3) }, new Noise(seed + at));
    if (!heavy && r.next() < 0.18) steelPing(out, at + Math.round(0.004 * SR), r.range(300, 480), a * 0.8, r.next() * 6, 1.1);   // a heavier link knocks the box
    t += r.range(0.6, 1.4) / (heavy ? 30 + 75 * u : 34 + 26 * Math.sin(Math.PI * u));
  }
  const nz = new Noise(seed + 1), bp = new SVF(2300, 0.8), lo = new SVF(150, 0.8);
  for (let i = 0; i < Math.round((d + 0.1) * SR); i++) {
    const tt = i / SR, u = tt / d, en = smooth(u / 0.15) * (tt < d ? 1 : Math.max(0, 1 - (tt - d) / 0.1));
    bp.run(nz.white()); lo.run(nz.brown());
    out[i] += (bp.bp * (heavy ? 0.12 : 0.08) * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 40 * tt))) + lo.lp * (heavy ? 0.5 : 0.15) * size) * en;
  }
  const j = Math.round(d * SR);
  if (heavy) {
    steelPing(out, j, 300, 0.28, 0.2, 3.2);
    ping(out, j, 92, 0.25 * size, [[1, 1, 0.12], [2.1, 0.4, 0.06]], 0.6);
    sweep(out, j, 120, 52, 0.03, 0.12, 0.25 * size, 0.001, 1.2);
  } else for (let k = 0; k < 4; k++) steelPing(out, j + Math.round(r.range(0, 0.25) * SR), r.range(500, 1200), r.range(0.04, 0.1) * Math.exp(-k / 2), r.next() * 6, 0.8);
  return fadeTail(out, 0.08);
}

// STRAIN: a chain pulled taut and twisting (dur): heavy steel groaning under torsion (slow stick-slip
// through big metal modes), links grinding, a tick of a link turning now and then
export function sfxStrain(e, seed) {
  const d = Math.max(0.3, e.dur || 1.2), size = e.size ?? 0.8, k = 1.2 - 0.4 * size, r = new Rng(seed);
  const out = friction(d + 0.25, { modes: STEEL.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 8 + 34 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.6) + 10 * Math.sin(TAU * 2.1 * u), env: (u) => smooth(u / 0.12) * (1 - smooth((u - 0.78) / 0.22)), gain: 0.3, drive: 1.8, jit: 0.7, jitHz: 9 }, seed);
  const nz = new Noise(seed + 1), bp = new SVF(1100, 1.2), dr = new Drift(seed + 2, 3);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); bp.run(nz.white()); out[i] += bp.bp * 0.07 * smooth(u / 0.2) * (1 - smooth((u - 0.8) / 0.2)) * (0.5 + 0.5 * dr.at(i / SR)); }
  for (let q = 0; q < 5; q++) steelPing(out, Math.round(r.range(0.1, d) * SR), r.range(500, 900), r.range(0.05, 0.12), r.next() * 6, 1.4);
  return fadeTail(out, 0.06);
}

// STORM: the card storm (dur, size = density): thousands of cards flapping: many flutter voices (paper
// bands chopped at 14-38 Hz), a cloud of card snaps, and the air itself roaring. It builds to full force
// over its first 3.9 s (or its whole dur if shorter) and then stays there; size >= 0.95 = full blast at once.
export const sfxStorm = (e, seed) => drive(sfxStormG(e, seed));
export function* sfxStormG(e, seed) {
  const d0 = Math.max(0.5, e.dur || 2), size = e.size ?? 0.6, len = Math.ceil((d0 + 0.3) * SR), L = new Float32Array(len), R = new Float32Array(len), r = new Rng(seed);
  const d = size >= 0.95 ? 0.05 : Math.min(d0, 3.9);          // the build time
  const env = (u) => (d < 0.1 ? 1 : smooth(u / 0.3) * (0.55 + 0.45 * u));
  const nv = 14 + Math.round(10 * Math.min(size, 0.8));
  for (let v = 0; v < nv; v++) {
    const nz = new Noise(seed + 100 + v), bp = new SVF(r.range(800, 3600), r.range(0.9, 1.6)), rate = r.range(14, 38), dr = new Drift(seed + 200 + v, r.range(0.4, 1.2));
    const p0 = r.range(-1, 1), p1 = r.range(-1, 1), a = r.range(0.4, 1) / Math.sqrt(nv), st = r.range(0, 0.5) * d;
    stormVoice(L, R, len, d, d0, env, nz, bp, rate, dr, p0, p1, a, st, r.next());
    yield undefined;
  }
  const gr = grains(0, d0, (t) => (60 + 420 * size * Math.min(1, t / d)) * smooth(t / (0.3 * d)), (s, at, rr) => {
    noiseBurst(s, at, { a: 0.0001, tau: rr.range(0.0006, 0.002), f0: rr.range(1500, 6500), q: 1.1, amp: rr.range(0.05, 0.18) }, new Noise(at + 7));
  }, seed + 9, 0.05, 1);
  for (let i = 0; i < len && i < gr.L.length; i++) { L[i] += gr.L[i]; R[i] += gr.R[i]; }
  yield undefined;
  stormRoar(L, R, len, d, env, seed);
  const fo = Math.round(0.25 * SR); for (let i = 0; i < fo; i++) { const k = i / fo; L[len - 1 - i] *= k; R[len - 1 - i] *= k; }
  return { L, R };
}
function stormVoice(L, R, len, d, d0, env, nz, bp, rate, dr, p0, p1, a, st, ph) {
  for (let i = Math.round(st * SR); i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    ph += rate * (1 + 0.15 * dr.at(t)) / SR; if (ph >= 1) ph -= 1;
    bp.run(nz.white());
    const flap = Math.pow(Math.abs(Math.sin(Math.PI * ph)), 3), x = bp.bp * flap * a * env(u) * (0.6 + 0.4 * dr.at(t + 3)) * smooth((t - st) / 0.2);
    const [gl, gr] = panGains(p0 + (p1 - p0) * Math.min(1, t / d0));
    L[i] += x * gl; R[i] += x * gr;
  }
}
function stormRoar(L, R, len, d, env, seed) {
  const nA = new Noise(seed + 3), nB = new Noise(seed + 4), lA = new SVF(400, 0.7), lB = new SVF(420, 0.7), mA = new SVF(900, 1.2), mB = new SVF(950, 1.2), dw = new Drift(seed + 5, 0.9);
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d), f = 260 + 700 * u;
    if ((i & 63) === 0) { lA.set(f, 0.7); lB.set(f * 1.05, 0.7); mA.set(700 + 900 * u + 200 * dw.at(t), 1.2); mB.set(760 + 900 * u - 200 * dw.at(t), 1.2); }
    const a = nA.pink(), b = nB.pink(); lA.run(a); lB.run(b); mA.run(a); mB.run(b);
    const en = env(u) * 0.55;
    L[i] += (lA.lp * 1.2 + mA.bp * 0.5) * en; R[i] += (lB.lp * 1.2 + mB.bp * 0.5) * en;
  }
}

// WHOOSH: something big passing close. size scales how big and low it is; it pans across
export function sfxWhoosh(e, seed) {
  const size = e.size ?? 0.5, d = e.dur || (0.25 + 0.55 * size), len = Math.ceil((d + 0.05) * SR), L = new Float32Array(len), R = new Float32Array(len);
  const nz = new Noise(seed), a = new SVF(800, 1.1), b = new SVF(800, 1.1), nz2 = new Noise(seed + 9), lo = new SVF(200, 0.7), p0 = (e.pan ?? 0) - 0.45, p1 = (e.pan ?? 0) + 0.45;
  const fHi = 2400 - 1300 * size, fLo = 360 - 180 * size;
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 31) === 0) { const f = fLo + (fHi - fLo) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.5); a.set(f, 1.1); b.set(f * 1.04, 1.1); lo.set(90 + 220 * Math.sin(Math.PI * u), 0.7); }
    const w = nz.white(); a.run(w); b.run(nz2.white()); lo.run(nz2.pink());
    const env = Math.pow(Math.sin(Math.PI * u), 2) * (t < d ? 1 : 0), [gl, gr] = panGains(clamp(p0 + (p1 - p0) * u, -1, 1));
    const body = lo.lp * 1.6 * size;
    L[i] = (a.bp * 0.85 + body) * env * gl; R[i] = (b.bp * 0.85 + body) * env * gr;
  }
  return { L, R, panned: true };
}

// =============================================================== the whole film (M1 .. M12)
// small helpers: a stereo pair, a mono burst panned into it
const pair = (sec) => ({ L: new Float32Array(Math.ceil(sec * SR)), R: new Float32Array(Math.ceil(sec * SR)) });
const addPan = (S, mono, pan, at = 0, g = 1) => { const [gl, gr] = panGains(pan); for (let i = Math.max(0, -at); i < mono.length && at + i < S.L.length; i++) { S.L[at + i] += mono[i] * gl * g; S.R[at + i] += mono[i] * gr * g; } };
const WOODTABLE = [[92, 9, 0.8], [176, 12, 1], [288, 15, 0.8], [466, 18, 0.5], [760, 22, 0.25]];
const STONE = [[170, 6, 0.8], [400, 7, 1], [740, 8, 0.7], [1320, 9, 0.4], [2250, 10, 0.2]];

// SWITCH: the pendant lamp clicking on: a heavy rotary switch (the knob against its detent, the snap of
// the contacts), the filament's first faint ping and a breath of mains
export function sfxSwitch(e, seed) {
  const out = new Float32Array(Math.ceil(0.5 * SR));
  noiseBurst(out, 0, { a: 0.006, tau: 0.012, f0: 1800, q: 1.2, amp: 0.1 }, new Noise(seed));
  const at = Math.round(0.035 * SR);
  ping(out, at, 1450, 0.38, [[1, 1, 0.02], [2.3, 0.5, 0.012], [3.7, 0.3, 0.008]], 0.3);
  ping(out, at, 305, 0.35, [[1, 1, 0.03], [2.1, 0.3, 0.015]], 1.2);
  noiseBurst(out, at, { a: 0.0002, tau: 0.0016, f0: 4800, q: 0.9, amp: 0.7 }, new Noise(seed + 1));
  sweep(out, at, 160, 80, 0.01, 0.025, 0.25, 0.001);
  const fa = at + Math.round(0.02 * SR);
  ping(out, fa, 5200, 0.02, [[1, 1, 0.06], [1.41, 0.4, 0.04]], 2);
  for (let i = 0; fa + i < out.length; i++) { const t = i / SR; out[fa + i] += Math.tanh(3 * Math.sin(TAU * 100 * t)) * 0.025 * smooth(t / 0.02) * Math.exp(-t / 0.1); }
  return fadeTail(out);
}

// CREAKL: the lamp's chains creaking as it swings (dur): at each end of the swing the links grind
export function sfxCreakL(e, seed) {
  const d = Math.max(0.5, e.dur || 3), size = e.size ?? 0.5, out = new Float32Array(Math.ceil((d + 0.6) * SR)), r = new Rng(seed);
  const P = 1.8 * (0.8 + 0.4 * size), M = [[690, 18, 0.6], [1120, 24, 1], [1690, 28, 0.6], [2600, 30, 0.3]];
  for (let k = 0; k * P / 2 < d; k++) {
    const t0 = Math.max(0, k * P / 2 + r.range(-0.05, 0.05)), dd = 0.3 + 0.2 * r.next(), amp = (0.6 + 0.4 * r.next()) * Math.exp(-k * P / 2 / Math.max(0.5, d * 0.9));
    add(out, friction(dd, { modes: M.map(([f, q, a]) => [f * r.range(0.95, 1.05), q, a]), rate: (u) => 22 + 50 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.5), gain: 0.16 * amp, drive: 1.3, jit: 0.6 }, seed + k), 1, Math.round(t0 * SR));
  }
  return fadeTail(out, 0.05);
}

// SLAM: a card slammed on the pile: a war drum (bigger card = lower, longer) and the card's flat slap.
// gain = speed (also a harder, brighter stroke); the first one at CUES.open is the film's first drum
export function sfxSlam(e, seed) {
  const size = clamp(e.size ?? 0.5), v = clamp(e.gain ?? 1, 0.2, 1.5), out = new Float32Array(Math.ceil(3.2 * SR));
  add(out, warDrum(clamp(0.55 + 0.4 * v, 0.3, 1), seed, { f: 56 - 14 * size, ring: 0.55 + 0.6 * size }), 0.95);
  noiseBurst(out, 0, { a: 0.0006, tau: 0.008 + 0.03 * size, f0: 1600 - 800 * size, q: 0.7, mode: 'lp', amp: 0.65 }, new Noise(seed + 1));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.003, f0: 4200, q: 0.9, amp: 0.3 }, new Noise(seed + 2));
  ping(out, 0, 230 - 130 * size, 0.22 * size, [[1, 1, 0.06 + 0.12 * size], [1.9, 0.4, 0.04]], 0.5);
  return fadeTail(out, 0.08);
}

// STONE: a king's stone head turning: a dry grinding "ge" (stone on stone, gritty, no tone)
export function sfxStone(e, seed) {
  const d = Math.max(0.12, e.dur || 0.22), size = e.size ?? 0.6, k = 1.2 - 0.4 * size, r = new Rng(seed);
  const out = friction(d, { modes: STONE.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 30 + 70 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 0.8), gain: 0.3, drive: 2, jit: 0.9, jitHz: 40 }, seed);
  const nz = new Noise(seed + 1), bp = new SVF(2600 * k, 0.8);
  for (let i = 0; i < out.length; i++) { const u = i / out.length; bp.run(nz.white()); out[i] += bp.bp * 0.1 * Math.sin(Math.PI * u) * (r.next() < 0.08 ? 2.5 : 0.6); }
  return fadeTail(out, 0.01);
}

// PULSE: Google's crown turning red: a low throb (58 Hz with harmonics so small speakers carry it) beating
// at ~2.2 per second for dur
export function sfxPulse(e, seed) {
  const d = Math.max(0.5, e.dur || 2.5), len = Math.ceil((d + 0.25) * SR), out = new Float32Array(len);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, ph = (t * 2.2) % 1, en = Math.pow(Math.max(0, Math.sin(Math.PI * ph)), 3) * smooth(t / 0.1) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.25));
    p += 58 / SR; p -= Math.floor(p);
    out[i] = (Math.sin(TAU * p) + 0.4 * Math.sin(2 * TAU * p) + 0.22 * Math.sin(3 * TAU * p) + 0.1 * Math.sin(5 * TAU * p)) * en * 0.3;
  }
  return out;
}

// CHIPS: a shovel of clay chips poured (size): a short cascade of chip-on-chip clacks and the shovel
export function sfxChips(e, seed) {
  const size = e.size ?? 0.5, d = 0.35 + 0.6 * size;
  const g = grains(0, d, (t) => (120 + 420 * size) * Math.exp(-t / (d * 0.5)), (s, at, r) => {
    const a = r.range(0.06, 0.25);
    ping(s, at, r.range(2400, 5000), a * 0.45, [[1, 1, 0.011], [1.52, 0.6, 0.007], [2.31, 0.3, 0.005]], r.next() * 6);
    noiseBurst(s, at, { a: 0.0001, tau: 0.0008, f0: r.range(3000, 7000), q: 1, amp: a }, new Noise(at + 3));
  }, seed, 0.12, 0.7);
  const nz = new Noise(seed + 1), bp = new SVF(1300, 0.9);
  for (let i = 0; i < Math.round(0.08 * SR); i++) { bp.run(nz.white()); const v = bp.bp * 0.2 * Math.sin(Math.PI * i / (0.08 * SR)); g.L[i] += v; g.R[i] += v; }
  return g;
}

// PRESS: the card press "dong": the iron ram, the frame ringing dark, the card springing out of the slot
export function sfxPress(e, seed) {
  const size = e.size ?? 0.6, out = new Float32Array(Math.ceil(0.9 * SR)), r = new Rng(seed);
  sweep(out, 0, 150, 58, 0.025, 0.12 + 0.08 * size, 0.7, 0.001, 1.2);
  steelPing(out, 0, 410 * r.range(0.96, 1.04), 0.25, r.next() * 6, 2.0);
  noiseBurst(out, 0, { a: 0.0008, tau: 0.012, f0: 700, q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed));
  const a2 = Math.round(0.11 * SR);
  noiseBurst(out, a2, { a: 0.0003, tau: 0.004, f0: 3800, q: 1, amp: 0.38 }, new Noise(seed + 1));
  ping(out, a2, 2950, 0.04, [[1, 1, 0.025], [2.4, 0.4, 0.012]], 0.8);
  return fadeTail(out, 0.05);
}

// POP: a cardboard standee snapping upright against its strut: a flat cardboard "pa" (no cartoon pop)
export function sfxPop(e, seed) {
  const size = e.size ?? 0.5, out = new Float32Array(Math.ceil(0.18 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0005, tau: 0.009 + 0.008 * size, f0: 1100 + 500 * r.next(), q: 0.8, mode: 'lp', amp: 0.8 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0002, tau: 0.002, f0: 3500, q: 1, amp: 0.38 }, new Noise(seed + 1));
  ping(out, 0, 260 + 140 * r.next(), 0.14, [[1, 1, 0.025], [2.6, 0.3, 0.012]], r.next() * 6);
  ping(out, Math.round(0.012 * SR), 1900, 0.04, [[1, 1, 0.01]], 0.4);
  return fadeTail(out);
}

// JAM: split-flaps stuck mid-flip (dur): every module chattering at its own rate, bouncing ("da-da-da")
export function sfxJam(e, seed) {
  const d = Math.max(0.2, e.dur || 1.5), S = pair(d + 0.1), r = new Rng(seed);
  for (let m = 0; m < 12; m++) {
    const rate = r.range(22, 38), f = r.range(1800, 3400), a = r.range(0.15, 0.35), mono = new Float32Array(S.L.length);
    for (let t = r.range(0, 0.05); t < d; t += (1 / rate) * r.range(0.8, 1.2)) noiseBurst(mono, Math.round(t * SR), { a: 0.0001, tau: 0.0012, f0: f * r.range(0.95, 1.05), q: 1.5, amp: a * r.range(0.6, 1) }, new Noise(seed + m * 977 + Math.round(t * 1e4)));
    addPan(S, mono, r.range(-0.8, 0.8));
  }
  return S;
}

// TOPPLE: a cardboard standee falling flat: a short rush of air and the flat slap on the table
export function sfxTopple(e, seed) {
  const size = e.size ?? 0.5, out = new Float32Array(Math.ceil(0.4 * SR)), r = new Rng(seed);
  const fall = Math.round((0.06 + 0.06 * size) * SR), nz = new Noise(seed), bp = new SVF(700, 0.9);
  for (let i = 0; i < fall; i++) { const u = i / fall; bp.run(nz.white()); out[i] += bp.bp * 0.25 * u * u; }
  noiseBurst(out, fall, { a: 0.0005, tau: 0.014 + 0.012 * size, f0: 900 + 400 * r.next(), q: 0.7, mode: 'lp', amp: 0.9 }, new Noise(seed + 1));
  noiseBurst(out, fall, { a: 0.0002, tau: 0.002, f0: 3000, q: 0.9, amp: 0.28 }, new Noise(seed + 2));
  ping(out, fall, 180 + 80 * r.next(), 0.2 * (0.5 + size), [[1, 1, 0.03]], 0.2);
  return fadeTail(out);
}

// CREAKT: a table leg creaking under the load (dur): big wood, slow stick-slip
export function sfxCreakT(e, seed) {
  const d = Math.max(0.3, e.dur || 0.9), size = e.size ?? 0.6, k = 1.15 - 0.3 * size;
  return fadeTail(friction(d, { modes: WOODTABLE.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 9 + 34 * Math.pow(Math.sin(Math.PI * u), 0.7), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.2), gain: 0.2, drive: 1.6, jit: 0.6 }, seed), 0.02);
}

// FOLD: cardboard or paper folded (size: 1 = thick cardboard): the fibres giving way, then pressed flat
export function sfxFold(e, seed) {
  const size = e.size ?? 0.5, d = 0.18 + 0.3 * size, out = new Float32Array(Math.ceil((d + 0.25) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += r.range(0.002, 0.012)) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0004, 0.0016), f0: r.range(1500, 5500) * (1.2 - 0.5 * size), q: 1, amp: r.range(0.05, 0.22) * Math.sin(Math.PI * t / d) }, new Noise(seed + Math.round(t * 1e4)));
  const nz = new Noise(seed + 1), bp = new SVF(1800 - 900 * size, 0.7);
  for (let i = 0; i < Math.round(d * SR); i++) { bp.run(nz.white()); out[i] += bp.bp * 0.1 * Math.sin(Math.PI * i / (d * SR)); }
  noiseBurst(out, Math.round(d * SR), { a: 0.001, tau: 0.02 + 0.02 * size, f0: 600, q: 0.7, mode: 'lp', amp: 0.45 * (0.4 + size) }, new Noise(seed + 2));
  return fadeTail(out);
}

// THUD: the shim "dong": a dull wooden thud, the table settling on it
export function sfxThud(e, seed) {
  const size = e.size ?? 0.7, out = new Float32Array(Math.ceil(0.6 * SR)), r = new Rng(seed);
  sweep(out, 0, 135 - 40 * size, 58, 0.02, 0.08 + 0.08 * size, 0.75, 0.0015, 1.3);
  noiseBurst(out, 0, { a: 0.001, tau: 0.02 + 0.02 * size, f0: 500, q: 0.7, mode: 'lp', amp: 0.7 }, new Noise(seed));
  ping(out, 0, 210 * r.range(0.96, 1.04), 0.22, [[1, 1, 0.07], [2.45, 0.4, 0.04], [3.9, 0.2, 0.025]], 1);
  return fadeTail(out);
}

// CHIPFLOW: chips pouring down a chute (dur, size): a dense stream of chip clacks, the chute's rattle, a rumble
export const sfxChipflow = (e, seed) => drive(sfxChipflowG(e, seed));
export function* sfxChipflowG(e, seed) {
  const d = Math.max(0.3, e.dur || 2), size = e.size ?? 0.5;
  const g = yield* grainsG(0, d, (t) => (160 + 620 * size) * smooth(t / 0.15) * (t > d - 0.2 ? Math.max(0.05, (d - t) / 0.2) : 1), (s, at, r) => {
    const a = r.range(0.04, 0.16);
    ping(s, at, r.range(2600, 5200), a * 0.4, [[1, 1, 0.01], [1.52, 0.5, 0.006]], r.next() * 6);
    noiseBurst(s, at, { a: 0.0001, tau: 0.0007, f0: r.range(2500, 7000), q: 1, amp: a }, new Noise(at + 11));
  }, seed, 0.15, 0.6);
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), bA = new SVF(1900, 0.9), bB = new SVF(2000, 0.9), lo = new SVF(150, 0.7);
  for (let i = 0; i < g.L.length; i++) {
    const t = i / SR, en = smooth(t / 0.15) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.12));
    bA.run(nA.white()); bB.run(nB.white()); lo.run(nA.brown());
    g.L[i] += (bA.bp * 0.07 + lo.lp * 0.3 * size) * en; g.R[i] += (bB.bp * 0.07 + lo.lp * 0.3 * size) * en;
    if ((i & 32767) === 32767) yield undefined;
  }
  return g;
}

// SEAL: a giant national seal slamming down: the taiko, the boom, the iron rim clanging dark, the crack
// of the impact, debris. The film's first "wall"
export function sfxSeal(e, seed) {
  const size = e.size ?? 1, out = new Float32Array(Math.ceil(3.2 * SR)), r = new Rng(seed);
  add(out, warDrum(1, seed, { f: 40, ring: 1.0 + 0.4 * size }), 1.0);
  add(out, boom({ f0: 95, f1: 32, tau: 0.8 + 0.4 * size, dur: 2.8, drive: 2.4, gain: 0.55 }, seed + 1), 0.8);
  ping(out, 0, 188 * r.range(0.97, 1.03), 0.32, [[1, 1, 0.8], [1.73, 0.7, 0.6], [2.41, 0.55, 0.45], [3.37, 0.4, 0.3], [4.89, 0.25, 0.2], [6.5, 0.15, 0.12]], 0.3);
  ping(out, 0, 610, 0.14, [[1, 1, 0.3], [1.58, 0.6, 0.22], [2.67, 0.4, 0.13]], 1.3);
  noiseBurst(out, 0, { a: 0.0003, tau: 0.03, f0: 2500, q: 0.6, amp: 0.8 }, new Noise(seed + 2));
  noiseBurst(out, 0, { a: 0.002, tau: 0.25, f0: 900, q: 0.6, mode: 'lp', amp: 0.45 }, new Noise(seed + 3));
  return fadeTail(out, 0.1);
}

// CRUNCH: the metal chute crushed: sheet metal buckling (a run of metal crackles over a groan) and a thud
export function sfxCrunch(e, seed) {
  const d = Math.max(0.2, e.dur || 0.45), size = e.size ?? 0.7, out = new Float32Array(Math.ceil((d + 0.5) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += r.range(0.004, 0.025)) { const at = Math.round(t * SR), a = r.range(0.1, 0.32) * (1 - 0.5 * t / d); steelPing(out, at, r.range(700, 2600), a * 0.35, r.next() * 6, 0.6); noiseBurst(out, at, { a: 0.0001, tau: r.range(0.0006, 0.003), f0: r.range(1500, 6000), q: 0.8, amp: a }, new Noise(seed + at)); }
  add(out, friction(d, { modes: STEEL.map(([f, q, a]) => [f * 1.3, q * 0.5, a]), rate: (u) => 20 + 60 * u, env: (u) => Math.sin(Math.PI * u), gain: 0.22, drive: 1.6, jit: 0.8 }, seed + 1), 1);
  sweep(out, 0, 140, 60, 0.02, 0.1, 0.4 * size, 0.001, 1);
  return fadeTail(out, 0.05);
}

// GROAN: a press groaning under too many chips: slow stick-slip through big iron modes (dur)
export function sfxGroan(e, seed) {
  const d = Math.max(0.5, e.dur || 1.5), size = e.size ?? 0.7, k = 1.1 - 0.3 * size;
  return fadeTail(friction(d, { modes: [[62 * k, 18, 0.8], [118 * k, 22, 1], [205 * k, 26, 0.7], [340 * k, 30, 0.4], [560 * k, 35, 0.2]], rate: (u) => 5 + 18 * Math.sin(Math.PI * u), env: (u) => smooth(u / 0.2) * (1 - smooth((u - 0.8) / 0.2)), gain: 0.42, drive: 2, jit: 0.6, jitHz: 4 }, seed), 0.05);
}

// SNAP: the tiny card's "pa": a small, crisp card snap
export function sfxSnap(e, seed) {
  const out = new Float32Array(Math.ceil(0.08 * SR));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0012, f0: 3800, q: 0.9, amp: 1 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0003, tau: 0.006, f0: 1300, q: 0.8, mode: 'lp', amp: 0.45 }, new Noise(seed + 1));
  return fadeTail(out, 0.005);
}

// COLLAPSE: the giant gold card folding in the middle ("gazhi"): a long creak through the board, the gold
// foil tearing at the crease, the halves slapping down
export function sfxCollapse(e, seed) {
  const d = Math.max(0.3, e.dur || 0.7), size = e.size ?? 1, out = new Float32Array(Math.ceil((d + 0.8) * SR)), r = new Rng(seed);
  add(out, fadeTail(friction(d, { modes: [[180, 12, 0.7], [330, 15, 1], [560, 18, 0.8], [940, 22, 0.5], [1600, 26, 0.3]], rate: (u) => 14 + 60 * u * u, env: (u) => smooth(u / 0.1) * (1 - 0.6 * smooth((u - 0.8) / 0.2)), gain: 0.36, drive: 1.8, jit: 0.7 }, seed), 0.03), 1);
  for (let t = d * 0.5; t < d; t += r.range(0.003, 0.015)) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0005, 0.002), f0: r.range(2000, 7000), q: 0.9, amp: r.range(0.08, 0.22) }, new Noise(seed + Math.round(t * 1e4)));
  const j = Math.round(d * SR);
  noiseBurst(out, j, { a: 0.001, tau: 0.04, f0: 800, q: 0.7, mode: 'lp', amp: 0.75 }, new Noise(seed + 5));
  sweep(out, j, 120, 55, 0.02, 0.12, 0.5 * size, 0.001, 1);
  return fadeTail(out, 0.05);
}

// AVALANCHE: the chip tower going down (dur, grows): a cloud of chip clacks from a trickle to a flood
// (the flood comes early: it is a wall), stacks hitting the table, the rumble of thousands of chips. Stereo.
export function sfxAvalanche(e, seed) {
  const d = Math.max(0.8, e.dur || 3), size = e.size ?? 1;
  const g = grains(0, d, (t) => (60 + 1300 * size * Math.pow(t / d, 0.8)) * smooth(t / 0.1), (s, at, r, t) => {
    const u = t / d, a = r.range(0.04, 0.2) * (0.65 + 0.65 * u), big = r.next() < 0.15;
    ping(s, at, r.range(2200, 5200) * (big ? 0.6 : 1), a * 0.32, [[1, 1, 0.01], [1.52, 0.5, 0.006]], r.next() * 6);
    noiseBurst(s, at, { a: 0.0001, tau: r.range(0.0006, 0.0015), f0: r.range(2000, 7500), q: 1, amp: a }, new Noise(at + 5));
    if (big) noiseBurst(s, at, { a: 0.0005, tau: 0.01, f0: 600, q: 0.7, mode: 'lp', amp: a * 1.2 }, new Noise(at + 9));
  }, seed, 0.6, 0.9);
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), lA = new SVF(200, 0.7), lB = new SVF(210, 0.7), mA = new SVF(1500, 0.8), mB = new SVF(1600, 0.8);
  for (let i = 0; i < g.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(t / 0.2) * (0.3 + 0.7 * Math.pow(u, 0.8)) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.6));
    lA.run(nA.brown()); lB.run(nB.brown()); mA.run(nA.white()); mB.run(nB.white());
    g.L[i] += (lA.lp * 1.0 + mA.bp * 0.2) * en * size; g.R[i] += (lB.lp * 1.0 + mB.bp * 0.2) * en * size;
  }
  return g;
}

// BLINK: the dispenser's green eye: a mechanical iris closing and opening, a low electric blip
export function sfxBlink(e, seed) {
  const out = new Float32Array(Math.ceil(0.35 * SR));
  for (const [dt, a] of [[0, 0.5], [0.12, 0.35]]) { const at = Math.round(dt * SR); noiseBurst(out, at, { a: 0.0003, tau: 0.003, f0: 2600, q: 1.4, amp: a }, new Noise(seed + at)); ping(out, at, 1350, a * 0.12, [[1, 1, 0.012]], 0.5); }
  for (let i = 0; i < Math.round(0.28 * SR); i++) { const t = i / SR; out[i] += Math.sin(TAU * 120 * t) * 0.05 * Math.sin(Math.PI * t / 0.28); }
  return fadeTail(out);
}

// HANG: a small plate dropping on little chains (SERVER BUSY): the chains rattle, the plate swings home
export function sfxHang(e, seed) {
  const out = new Float32Array(Math.ceil(0.8 * SR)), r = new Rng(seed);
  for (let t = 0; t < 0.18; t += r.range(0.008, 0.025)) steelPing(out, Math.round(t * SR), r.range(1800, 3600), r.range(0.03, 0.07), r.next() * 6, 0.5);
  const at = Math.round(0.2 * SR);
  ping(out, at, 980, 0.2, [[1, 1, 0.12], [2.32, 0.5, 0.07], [3.9, 0.3, 0.04]], 0.4);
  noiseBurst(out, at, { a: 0.0002, tau: 0.002, f0: 4000, q: 0.9, amp: 0.4 }, new Noise(seed));
  return fadeTail(out, 0.05);
}

// GATE: the toll barrier coming down: a little motor and gears, the arm clacking onto its stop
export function sfxGate(e, seed) {
  const out = new Float32Array(Math.ceil(0.9 * SR)), m = Math.round(0.45 * SR), nz = new Noise(seed), bp = new SVF(900, 2);
  let p = 0;
  for (let i = 0; i < m; i++) { const t = i / SR, u = i / m, f = 140 + 60 * Math.sin(Math.PI * u); p += f / SR; bp.run(nz.white()); out[i] += (Math.sin(TAU * p) * 0.06 + bp.bp * 0.08 * (0.5 + 0.5 * Math.sin(TAU * f * 0.5 * t))) * Math.sin(Math.PI * u); }
  ping(out, m, 820, 0.38, [[1, 1, 0.03], [2.2, 0.5, 0.02], [3.6, 0.3, 0.012]], 0.3);
  noiseBurst(out, m, { a: 0.0002, tau: 0.002, f0: 4200, q: 0.9, amp: 0.55 }, new Noise(seed + 1));
  sweep(out, m, 170, 90, 0.01, 0.03, 0.3, 0.001);
  return fadeTail(out);
}

// CART: an iron cart on the chute (dur): rumble, the rail joints clacking at the wheels' speed, a faint
// squeal. pitch < 0: rolling back, gathering speed as it runs away
export function sfxCart(e, seed) {
  const d = Math.max(0.4, e.dur || 1.5), back = (e.pitch ?? 0) < 0, size = e.size ?? 0.6, out = new Float32Array(Math.ceil((d + 0.3) * SR)), r = new Rng(seed);
  const rate = (u) => (back ? 3 + 9 * u : 6 * (1 - 0.4 * u));
  for (let t = 0; t < d;) {
    const u = t / d, a = 0.32 * (back ? 1 - 0.6 * u : 0.6 + 0.4 * Math.sin(Math.PI * u));
    for (const dt of [0, 0.045]) { const a2 = Math.round((t + dt) * SR); ping(out, a2, r.range(260, 340), a * 0.4, [[1, 1, 0.04], [2.3, 0.4, 0.02]], r.next() * 6); noiseBurst(out, a2, { a: 0.0002, tau: 0.002, f0: 2500, q: 0.8, amp: a * 0.5 }, new Noise(a2 + 1)); }
    t += 1 / rate(u);
  }
  const nz = new Noise(seed + 1), lo = new SVF(120, 0.8), sq = new SVF(2900, 12);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR), en = smooth(u / 0.1) * (1 - smooth((u - 0.85) / 0.15)) * (back ? 1 - 0.5 * u : 1); lo.run(nz.brown()); sq.run(nz.white()); out[i] += (lo.lp * 0.6 * size + sq.bp * 0.012) * en; }
  return fadeTail(out, 0.05);
}

// KILN: the brick kiln taking hold (dur): a low furnace roar with a turbulent flicker, crackles. Stereo.
export function sfxKiln(e, seed) {
  const d = Math.max(0.5, e.dur || 2.5), S = pair(d + 0.4), r = new Rng(seed);
  const nA = new Noise(seed), nB = new Noise(seed + 1), lA = new SVF(220, 0.8), lB = new SVF(230, 0.8), mA = new SVF(700, 0.9), mB = new SVF(740, 0.9), dr = new Drift(seed + 2, 7), dr2 = new Drift(seed + 3, 2.2);
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, fl = 0.65 + 0.35 * dr.at(t), en = smooth(t / 0.6) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.4)) * (0.75 + 0.25 * dr2.at(t)) * fl;
    lA.run(nA.brown()); lB.run(nB.brown()); mA.run(nA.white()); mB.run(nB.white());
    S.L[i] = (lA.lp * 1.1 + mA.bp * 0.1) * en; S.R[i] = (lB.lp * 1.1 + mB.bp * 0.1) * en;
  }
  for (let k = 0; k < Math.round(d * 6); k++) { const tmp = new Float32Array(Math.round(0.01 * SR)); noiseBurst(tmp, 0, { a: 0.0001, tau: 0.0012, f0: r.range(1500, 4500), q: 0.9, amp: r.range(0.05, 0.2) }, new Noise(seed + 50 + k)); addPan(S, tmp, r.range(-0.7, 0.7), Math.round(r.range(0.3, d) * SR)); }
  return S;
}

// BRICK: clay chips stacked like bricks: a dull fired-clay knock
export function sfxBrick(e, seed) {
  const size = e.size ?? 0.6, out = new Float32Array(Math.ceil(0.25 * SR)), r = new Rng(seed);
  ping(out, 0, (380 + 160 * (1 - size)) * r.range(0.95, 1.05), 0.33, [[1, 1, 0.022], [2.15, 0.5, 0.013], [3.6, 0.25, 0.007]], r.next() * 6);
  noiseBurst(out, 0, { a: 0.0004, tau: 0.006, f0: 1400, q: 0.8, amp: 0.5 }, new Noise(seed));
  sweep(out, 0, 150, 90, 0.01, 0.035, 0.25 * size, 0.001);
  return fadeTail(out);
}

// REEL: a fishing reel's pawl clicking as the line is wound in (dur): faster and faster
export function sfxReel(e, seed) {
  const d = Math.max(0.2, e.dur || 1.2), out = new Float32Array(Math.ceil((d + 0.1) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += 1 / (18 + 30 * Math.min(1, t / d))) { const at = Math.round(t * SR); ping(out, at, 3200 * r.range(0.97, 1.03), 0.18, [[1, 1, 0.006], [1.63, 0.5, 0.004]], r.next() * 6); noiseBurst(out, at, { a: 0.0001, tau: 0.0006, f0: 6000, q: 0.8, amp: 0.15 }, new Noise(at + 1)); }
  return fadeTail(out, 0.02);
}

// ZIP: something yanked away fast on a line: a rising rush of air and the line's hiss
export function sfxZip(e, seed) {
  const d = 0.28, S = pair(d + 0.05), nz = new Noise(seed), bp = new SVF(600, 1.2), hs = new SVF(6000, 2), p0 = e.pan ?? 0, p1 = clamp(p0 + (p0 >= 0 ? 0.6 : -0.6), -1, 1);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); if ((i & 31) === 0) bp.set(600 + 3400 * u * u, 1.2); const w = nz.white(); bp.run(w); hs.run(w); const en = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.3)), 2), [gl, gr] = panGains(p0 + (p1 - p0) * u), x = (bp.bp * 0.7 + hs.bp * 0.08) * en; S.L[i] += x * gl; S.R[i] += x * gr; }
  S.panned = true;
  return S;
}

// BRUSH: one soft swipe of a make-up brush: bristles dragging (a fine, irregular hiss)
export function sfxBrush(e, seed) {
  const d = 0.4, out = new Float32Array(Math.ceil((d + 0.05) * SR)), nz = new Noise(seed), bp = new SVF(4200, 0.9), dr = new Drift(seed + 1, 60);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); bp.run(nz.white()); out[i] = bp.bp * 0.22 * Math.pow(Math.sin(Math.PI * u), 1.5) * (0.6 + 0.4 * dr.at(i / SR)); }
  return fadeTail(out);
}

// BOMB: four copies make a bomb: a low explosion, the pile blown apart (paper debris fluttering)
export function sfxBomb(e, seed) {
  const size = e.size ?? 0.8, S = pair(2.2);
  addPan(S, boom({ f0: 110, f1: 38, tau: 0.5 + 0.3 * size, dur: 2, drive: 2.6, gain: 0.7 }, seed), 0);
  const n = new Float32Array(Math.round(0.4 * SR)); noiseBurst(n, 0, { a: 0.0005, tau: 0.05, f0: 1800, q: 0.6, amp: 0.6 }, new Noise(seed + 1)); addPan(S, n, 0);
  const g = grains(0.05, 1.0, (t) => 300 * Math.exp(-t / 0.3), (s, at, r) => noiseBurst(s, at, { a: 0.0002, tau: r.range(0.001, 0.003), f0: r.range(1500, 5000), q: 1, amp: r.range(0.03, 0.1) }, new Noise(at + 3)), seed + 2, 0.1, 1);
  const o = Math.round(0.05 * SR); for (let i = 0; i < g.L.length && i + o < S.L.length; i++) { S.L[i + o] += g.L[i]; S.R[i + o] += g.R[i]; }
  return S;
}

// POINT: one king's stone arm swinging out to point: a heavy sleeve's short "fwp" (the brass stab is music)
export function sfxPoint(e, seed) {
  const d = 0.22, out = new Float32Array(Math.ceil((d + 0.05) * SR)), nz = new Noise(seed), bp = new SVF(500, 0.9);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); if ((i & 31) === 0) bp.set(380 + 900 * Math.sin(Math.PI * u), 0.9); bp.run(nz.white()); out[i] = bp.bp * 0.3 * Math.pow(Math.sin(Math.PI * u), 2); }
  return fadeTail(out);
}

// BOOKS: hardbacks thudding down out of a split sack (dur): book after book, pages fluttering
export function sfxBooks(e, seed) {
  const d = Math.max(0.3, e.dur || 1.2), out = new Float32Array(Math.ceil((d + 0.4) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += r.range(0.12, 0.3)) {
    const at = Math.round(t * SR), a = r.range(0.5, 1);
    sweep(out, at, 160, 80, 0.01, 0.04, 0.35 * a, 0.001, 0.6);
    noiseBurst(out, at, { a: 0.0005, tau: 0.012, f0: 1200, q: 0.7, mode: 'lp', amp: 0.45 * a }, new Noise(seed + at));
    for (let k = 0; k < 6; k++) noiseBurst(out, at + Math.round(r.range(0.01, 0.08) * SR), { a: 0.0002, tau: 0.002, f0: r.range(2500, 5000), q: 1, amp: 0.05 * a }, new Noise(at + k));
  }
  return fadeTail(out, 0.05);
}

// HEART: one heartbeat: lub (a soft low stroke) and dub 0.31 s later, lighter. size = body; pitch = semitones
export function sfxHeart(e, seed) {
  const size = e.size ?? 0.6, out = new Float32Array(Math.ceil(0.95 * SR)), f = (50 + 12 * (1 - size)) * Math.pow(2, (e.pitch ?? 0) / 12);
  add(out, heartStroke(f, 0.9, seed), 1);
  add(out, heartStroke(f * 1.12, 0.6, seed + 1), 1, Math.round(0.31 * SR));
  return fadeTail(out, 0.05);
}

// LEVER: the press lever pulled down: its ratchet, then the heavy clunk at the bottom
export function sfxLever(e, seed) {
  const out = new Float32Array(Math.ceil(0.7 * SR)), r = new Rng(seed);
  for (let k = 0; k < 4; k++) { const at = Math.round((0.03 + k * 0.045) * SR); ping(out, at, 2100 * r.range(0.97, 1.03), 0.12, [[1, 1, 0.01], [1.7, 0.4, 0.006]], r.next() * 6); noiseBurst(out, at, { a: 0.0001, tau: 0.001, f0: 4500, q: 0.9, amp: 0.15 }, new Noise(seed + k)); }
  const j = Math.round(0.24 * SR);
  steelPing(out, j, 330, 0.3, 0.4, 2.2); sweep(out, j, 140, 62, 0.015, 0.08, 0.5, 0.001, 1);
  return fadeTail(out, 0.05);
}

// CLANK: gold bars shoved into the hopper: heavy bars knocking together, dense and dark (not bells)
export function sfxClank(e, seed) {
  const out = new Float32Array(Math.ceil(0.9 * SR)), r = new Rng(seed);
  for (let k = 0; k < 6; k++) { const at = Math.round(r.range(0, 0.25) * SR), a = r.range(0.3, 0.6); steelPing(out, at, r.range(330, 720), a * 0.45, r.next() * 6, 1.6); sweep(out, at, 170, 90, 0.01, 0.04, a * 0.3, 0.001); noiseBurst(out, at, { a: 0.0002, tau: 0.0015, f0: 3500, q: 0.8, amp: a * 0.5 }, new Noise(seed + k)); }
  return fadeTail(out, 0.05);
}

// CRUMBLE: a stone castle collapsing into the hopper: stone knocks raining, a rumble, dust
export function sfxCrumble(e, seed) {
  const d = Math.max(0.5, e.dur || 1.2), size = e.size ?? 0.8;
  const g = grains(0, d, (t) => 90 * Math.exp(-t / (d * 0.5)) + 10, (s, at, r) => { const a = r.range(0.1, 0.4); ping(s, at, r.range(180, 900), a * 0.4, [[1, 1, 0.03], [2.1, 0.4, 0.015]], r.next() * 6); noiseBurst(s, at, { a: 0.0003, tau: r.range(0.003, 0.01), f0: r.range(800, 3000), q: 0.8, amp: a * 0.6 }, new Noise(at + 2)); }, seed, 0.3, 0.8);
  const nz = new Noise(seed + 1), lo = new SVF(180, 0.7);
  for (let i = 0; i < g.L.length; i++) { const t = i / SR, en = smooth(t / 0.05) * Math.exp(-t / (d * 0.6)) * size; lo.run(nz.brown()); g.L[i] += lo.lp * 0.7 * en; g.R[i] += lo.lp * 0.7 * en; }
  return g;
}

// CRACKLE: a lit city ripped off the map: electricity arcing (sharp crackles, a 100 Hz buzz in bursts)
export function sfxCrackle(e, seed) {
  const d = Math.max(0.3, e.dur || 0.9), out = new Float32Array(Math.ceil((d + 0.1) * SR)), r = new Rng(seed);
  for (let t = 0; t < d; t += r.range(0.003, 0.03)) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0003, 0.0015), f0: r.range(2000, 9000), q: 0.8, amp: r.range(0.1, 0.45) * (1 - 0.5 * t / d) }, new Noise(seed + Math.round(t * 1e4)));
  for (let i = 0; i < Math.round(d * SR); i++) { const t = i / SR, gate = Math.sin(TAU * 7.3 * t) > 0.2 ? 1 : 0.15; out[i] += Math.tanh(4 * Math.sin(TAU * 100 * t)) * 0.06 * gate * (1 - t / d); }
  return fadeTail(out, 0.02);
}

// BOOML: a power plant swallowed: a deep low boom and its rumble
export function sfxBoomL(e, seed) {
  const size = e.size ?? 1, out = boom({ f0: 75, f1: 30, tau: 1.0 + 0.4 * size, dur: 2.6, drive: 2.2, gain: 0.7 }, seed);
  noiseBurst(out, 0, { a: 0.002, tau: 0.08, f0: 400, q: 0.7, mode: 'lp', amp: 0.5 }, new Noise(seed + 1));
  return out;
}

// PAPER: paper rustle (the paper people swept away, dur): light crinkles and a soft sweep of paper on paper
export function sfxPaper(e, seed) {
  const d = Math.max(0.2, e.dur || 0.8), size = e.size ?? 0.5;
  const g = grains(0, d, (t) => (60 + 160 * size) * Math.sin(Math.PI * Math.min(1, t / d)) + 5, (s, at, r) => noiseBurst(s, at, { a: 0.0002, tau: r.range(0.001, 0.004), f0: r.range(1800, 6000), q: 1, amp: r.range(0.02, 0.08) }, new Noise(at + 4)), seed, 0.1, 0.8);
  const nz = new Noise(seed + 1), bp = new SVF(2500, 0.8);
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); bp.run(nz.white()); const v = bp.bp * 0.05 * Math.sin(Math.PI * u); g.L[i] += v; g.R[i] += v; }
  return g;
}

// TORNADO: the card tornado building the card king (dur): a rotating roar (the image circles the room),
// thousands of cards flapping in it, the vortex's pitch climbing. Stereo.
export const sfxTornado = (e, seed) => drive(sfxTornadoG(e, seed));
export function* sfxTornadoG(e, seed) {
  const d = Math.max(1, e.dur || 4), size = e.size ?? 0.9, S = pair(d + 0.5), r = new Rng(seed), nv = 16;
  for (let v = 0; v < nv; v++) {
    const nz = new Noise(seed + 100 + v), bp = new SVF(r.range(900, 3500), r.range(0.9, 1.5)), rate = r.range(16, 36), a = r.range(0.4, 1) / Math.sqrt(nv), ph0 = r.next() * TAU, rot = r.range(0.35, 0.7);
    tornadoVoice(S, d, nz, bp, rate, a, ph0, rot, r.next());
    yield undefined;
  }
  tornadoRoar(S, d, size, seed);
  return S;
}
function tornadoVoice(S, d, nz, bp, rate, a, ph0, rot, ph) {
  let gl = 0, gr = 0;
  for (let i = 0; i < Math.round(d * SR); i++) {
    const t = i / SR, u = t / d; ph += rate / SR; if (ph >= 1) ph -= 1; bp.run(nz.white());
    if ((i & 31) === 0) [gl, gr] = panGains(0.85 * Math.sin(ph0 + TAU * rot * t * (1 + u)));
    const x = bp.bp * Math.pow(Math.abs(Math.sin(Math.PI * ph)), 3) * a * smooth(u / 0.25) * (0.6 + 0.4 * u);
    S.L[i] += x * gl; S.R[i] += x * gr;
  }
}
function tornadoRoar(S, d, size, seed) {
  const nA = new Noise(seed + 3), nB = new Noise(seed + 4), lA = new SVF(300, 0.8), lB = new SVF(310, 0.8), wA = new SVF(500, 2.5), wB = new SVF(520, 2.5);
  for (let i = 0; i < S.L.length; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(u / 0.3) * (0.4 + 0.6 * u) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.5)) * size, sw = Math.sin(TAU * 0.6 * t * (1 + u));
    if ((i & 63) === 0) { const f = 380 + 900 * u; wA.set(f, 2.5); wB.set(f * 1.06, 2.5); }
    const a = nA.pink(), b = nB.pink(); lA.run(a); lB.run(b); wA.run(a); wB.run(b);
    S.L[i] += (lA.lp * 1.0 + wA.bp * 0.35) * en * (1 + 0.3 * sw); S.R[i] += (lB.lp * 1.0 + wB.bp * 0.35) * en * (1 - 0.3 * sw);
  }
}

// FLATTEN: a king squashed into a card: the air punched out, the stone giving way to paper, a flat slap,
// a low thud (the low brass note is the music's, on the same event)
export function sfxFlatten(e, seed) {
  const size = e.size ?? 0.8, out = new Float32Array(Math.ceil(0.9 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.004, tau: 0.05, f0: 350, q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(seed));
  const at = Math.round(0.035 * SR);
  noiseBurst(out, at, { a: 0.0006, tau: 0.02 + 0.02 * size, f0: 1100, q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(seed + 1));
  noiseBurst(out, at, { a: 0.0002, tau: 0.003, f0: 3600, q: 0.9, amp: 0.3 }, new Noise(seed + 2));
  sweep(out, at, 110, 42, 0.03, 0.12 + 0.1 * size, 0.6, 0.002, 1.2);
  for (let k = 0; k < 8; k++) noiseBurst(out, at + Math.round(r.range(0, 0.06) * SR), { a: 0.0001, tau: 0.0008, f0: r.range(1500, 4000), q: 1, amp: 0.08 }, new Noise(seed + 9 + k));
  return fadeTail(out, 0.05);
}

// TILT: the table dropping onto its short leg: a creak as it gives, then the bang, cards sliding
export function sfxTilt(e, seed) {
  const size = e.size ?? 1, out = new Float32Array(Math.ceil(1.6 * SR)), r = new Rng(seed);
  add(out, fadeTail(friction(0.36, { modes: WOODTABLE, rate: (u) => 12 + 40 * u, env: (u) => smooth(u / 0.3), gain: 0.22, drive: 1.6, jit: 0.6 }, seed), 0.04), 1);
  const j = Math.round(0.35 * SR);
  sweep(out, j, 120, 48, 0.02, 0.18 + 0.1 * size, 0.85, 0.0015, 1.5);
  noiseBurst(out, j, { a: 0.0008, tau: 0.04, f0: 700, q: 0.7, mode: 'lp', amp: 0.8 }, new Noise(seed + 1));
  ping(out, j, 170, 0.3, [[1, 1, 0.12], [2.45, 0.4, 0.07], [3.9, 0.25, 0.04]], 0.6);
  for (let k = 0; k < 30; k++) noiseBurst(out, j + Math.round(r.range(0.02, 0.6) * SR), { a: 0.0003, tau: r.range(0.002, 0.006), f0: r.range(1500, 4500), q: 0.9, amp: r.range(0.02, 0.07) }, new Noise(seed + 20 + k));
  return fadeTail(out, 0.05);
}

// FLICK: one card's "fingertip" flicking off a speck of ash: a crisp flick and the tiniest air
export function sfxFlick(e, seed) {
  const out = new Float32Array(Math.ceil(0.12 * SR));
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0009, f0: 4400, q: 1, amp: 0.9 }, new Noise(seed));
  noiseBurst(out, Math.round(0.004 * SR), { a: 0.004, tau: 0.02, f0: 2500, q: 1.2, amp: 0.12 }, new Noise(seed + 1));
  return fadeTail(out, 0.01);
}

// KINGBOMB: the jokers' bomb: the deepest boom (a sine diving to 24 Hz, saturated, a long tail), the blast's
// crack, the air rushing out, a burst of card shrapnel, the room's iron ringing. Stereo; the biggest sound.
export function sfxKingbomb(e, seed) {
  const size = e.size ?? 1, S = pair(5.6);
  addPan(S, boom({ f0: 78, f1: 24, sweep: 0.22, tau: 1.8, dur: 5.4, drive: 3, gain: 0.7 }, seed), 0);
  const crack = new Float32Array(Math.round(0.3 * SR)); noiseBurst(crack, 0, { a: 0.0002, tau: 0.035, f0: 2200, q: 0.5, amp: 1, hp: 180 }, new Noise(seed + 1)); addPan(S, crack, 0);
  const nA = new Noise(seed + 2), nB = new Noise(seed + 3), lA = new SVF(500, 0.7), lB = new SVF(520, 0.7);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, en = smooth(t / 0.01) * (0.6 * Math.exp(-t / 0.35) + 0.4 * Math.exp(-t / 1.6)) * size; if ((i & 63) === 0) { const f = 1200 * Math.exp(-t / 0.6) + 160; lA.set(f, 0.7); lB.set(f * 1.05, 0.7); } lA.run(nA.white()); lB.run(nB.white()); S.L[i] += lA.lp * 0.55 * en; S.R[i] += lB.lp * 0.55 * en; }
  const g = grains(0.01, 1.2, (t) => 2200 * Math.exp(-t / 0.25) + 40, (s, at, rr) => noiseBurst(s, at, { a: 0.0001, tau: rr.range(0.0006, 0.002), f0: rr.range(1500, 7000), q: 1, amp: rr.range(0.03, 0.12) }, new Noise(at + 13)), seed + 4, 0.1, 1);
  for (let i = 0; i < g.L.length && i < S.L.length; i++) { S.L[i] += g.L[i]; S.R[i] += g.R[i]; }
  const ring = new Float32Array(Math.round(3 * SR)); ping(ring, 0, 96, 0.12, [[1, 1, 2.2], [1.71, 0.7, 1.6], [2.43, 0.5, 1.1], [3.31, 0.3, 0.7]], 0.3); addPan(S, ring, 0.1);
  const fo = Math.round(0.4 * SR); for (let i = 0; i < fo; i++) { const k = i / fo; S.L[S.L.length - 1 - i] *= k; S.R[S.R.length - 1 - i] *= k; }
  return S;
}

// WAVE: the shock wave turning every card over (dur): two fronts of card flips running from the centre
// out to both sides (each flip a double paper tick), an air front travelling with them. Stereo.
export function sfxWave(e, seed) {
  const d = Math.max(0.6, e.dur || 3.5), size = e.size ?? 1, S = pair(d + 0.6), r = new Rng(seed);
  const flip = (dst, at, a, f) => { noiseBurst(dst, at, { a: 0.0001, tau: 0.0012, f0: f, q: 1.1, amp: a }, new Noise(at + 17)); noiseBurst(dst, at + Math.round(0.011 * SR), { a: 0.0001, tau: 0.0018, f0: f * 0.7, q: 1, amp: a * 0.7 }, new Noise(at + 29)); };
  const mL = new Float32Array(S.L.length), mR = new Float32Array(S.L.length), mC = new Float32Array(S.L.length);
  for (let t = 0; t < d;) {
    const u = t / d, dens = (2400 * Math.exp(-u * 2.2) + 80) * size, front = Math.min(1, u * 1.4);
    const dst = r.next() < 0.5 ? (front > 0.15 ? mL : mC) : (front > 0.15 ? mR : mC);
    flip(dst, Math.round(t * SR), r.range(0.12, 0.45) * (1 - 0.5 * u), r.range(1800, 5200));
    t += -Math.log(1 - r.next() * 0.9999) / dens;
  }
  for (let i = 0; i < S.L.length; i++) { const p = Math.min(1, i / (d * SR) * 1.4); const [l1, r1] = panGains(-p), [l2, r2] = panGains(p); S.L[i] += mL[i] * l1 + mR[i] * l2 + mC[i] * 0.7; S.R[i] += mL[i] * r1 + mR[i] * r2 + mC[i] * 0.7; }
  const nA = new Noise(seed + 2), nB = new Noise(seed + 3), bA = new SVF(700, 0.8), bB = new SVF(720, 0.8);
  for (let i = 0; i < S.L.length; i++) { const t = i / SR, p = Math.min(1, t / d * 1.4), en = smooth(t / 0.03) * Math.exp(-t / (d * 0.45)) * 1.2 * size; bA.run(nA.white()); bB.run(nB.white()); S.L[i] += bA.bp * en * (0.6 + 0.4 * p); S.R[i] += bB.bp * en * (0.6 + 0.4 * p); }
  return S;
}

// =============================================================== v2: the boxes, the giants, the new king
// Iron box, hinge and padlock modes: dark, heavy, inharmonic (foley, never a tuned bar)
const IRON = [[168, 30, 1], [265, 38, 0.8], [376, 45, 0.7], [521, 52, 0.5], [734, 60, 0.35], [991, 70, 0.2]];
const HINGE = [[310, 40, 0.7], [520, 55, 1], [880, 70, 0.8], [1420, 80, 0.5], [2310, 90, 0.25]];
const IRONP = [[1, 1, 0.5], [1.58, 0.8, 0.38], [2.24, 0.6, 0.3], [3.1, 0.45, 0.2], [4.37, 0.3, 0.12], [5.9, 0.15, 0.07]];
const fadeIn = (b, sec = 0.002) => { const n = Math.min(b.length, Math.round(sec * SR)); for (let i = 0; i < n; i++) b[i] *= i / n; return b; };

// CHAIRSLIDE (who, dur, size): a heavy carved chair, its king on it, scraping in over the stone floor out of the
// dark: two legs' stick-slip through the chair's wood, stone grit, the weight's rumble. It comes in from far
// (dark, thin) to near (full) and slows down, the slips getting slower and coarser as it stops. size = weight.
export function sfxChairSlide(e, seed) {
  const d = Math.max(0.3, e.dur || 1.2), size = e.size ?? 0.6, k = 1.2 - 0.35 * size, len = Math.ceil((d + 0.15) * SR);
  const speed = (u) => Math.pow(Math.max(0, 1 - Math.min(1, u)), 0.55), near = (u) => smooth(u / 0.55);
  const out = new Float32Array(len);
  for (const leg of [0, 1]) {
    const f = friction(d, { modes: CHAIRWOOD.map(([f, q, a]) => [f * k * (leg ? 1.09 : 1), q, a]), rate: (u) => (13 + 80 * speed(u)) * (leg ? 1.13 : 1),
      env: (u) => (0.3 + 0.7 * near(u)) * smooth(u / 0.05) * (1 - smooth((u - 0.94) / 0.06)) * (0.55 + 0.45 * speed(u)), gain: 0.17, drive: 1.7, jit: 0.55, jitHz: 23 }, seed + leg * 31);
    add(out, f, leg ? 0.75 : 1);
  }
  const nz = new Noise(seed + 2), bp = new SVF(2600, 0.9), lo = new SVF(140, 0.7), dist = new SVF(1500, 0.6), r = new Rng(seed + 3);
  for (let i = 0; i < len; i++) {
    const u = i / (d * SR);
    if ((i & 63) === 0) dist.set(900 + 7500 * near(u), 0.6);
    const sp = speed(u), en = smooth(u / 0.05) * (u < 1 ? 1 : Math.max(0, 1 - (u - 1) * d / 0.1));
    bp.run(nz.white()); lo.run(nz.brown());
    const grit = bp.bp * 0.07 * sp * (r.next() < 0.02 + 0.03 * sp ? 3.5 : 1) * en;
    out[i] = dist.run(out[i] + grit) + lo.lp * 0.45 * (0.4 + size) * sp * en * (0.4 + 0.6 * near(u));
  }
  return fadeTail(fadeIn(out, 0.01), 0.03);
}

// CHAIRSTOP (who, size): the chair catching at the table: a thud of the legs on stone, the carved wood knocking,
// the king's weight settling a moment later (a small bump), a short creak of the seat
export function sfxChairStop(e, seed) {
  const size = e.size ?? 0.6, out = new Float32Array(Math.ceil(0.7 * SR)), r = new Rng(seed), k = 1.15 - 0.3 * size;
  sweep(out, 0, 150 - 30 * size, 60, 0.018, 0.07 + 0.05 * size, 0.7, 0.0015, 1.2);
  ping(out, 0, 132 * k * r.range(0.96, 1.04), 0.32, [[1, 1, 0.06], [1.9, 0.6, 0.04], [3.07, 0.4, 0.025], [5.15, 0.2, 0.015]], r.next() * 6);
  noiseBurst(out, 0, { a: 0.0006, tau: 0.018, f0: 520, q: 0.7, mode: 'lp', amp: 0.7 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.0002, tau: 0.0018, f0: 3600, q: 0.9, amp: 0.3 }, new Noise(seed + 1));
  const b = Math.round((0.085 + 0.02 * r.next()) * SR);
  sweep(out, b, 120, 58, 0.02, 0.06, 0.28 * (0.5 + size), 0.002, 1);
  add(out, fadeTail(friction(0.18, { modes: CHAIRWOOD.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 30 + 40 * Math.sin(Math.PI * u), env: (u) => Math.sin(Math.PI * u), gain: 0.07, drive: 1.4, jit: 0.6 }, seed + 2), 0.02), 1, b + Math.round(0.03 * SR));
  return fadeTail(out, 0.05);
}

// KEYTURN (who, size): a big old iron key: it goes in (a short gritty slide), turns (a grinding twist through the
// wards, two or three clicks) and the bolt goes over with a deep clunk
export function sfxKeyTurn(e, seed) {
  const size = e.size ?? 0.7, out = new Float32Array(Math.ceil(0.8 * SR)), r = new Rng(seed);
  add(out, fadeTail(friction(0.11, { modes: STEEL.map(([f, q, a]) => [f * 2.2, q, a]), rate: (u) => 90 + 60 * u, env: (u) => Math.sin(Math.PI * u), gain: 0.06, drive: 1.3, jit: 0.8, jitHz: 60 }, seed), 0.01), 1);
  const t0 = 0.14, td = 0.26;
  add(out, fadeTail(friction(td, { modes: STEEL.map(([f, q, a]) => [f * 1.4, q, a]), rate: (u) => 12 + 22 * Math.sin(Math.PI * u), env: (u) => smooth(u / 0.2) * (1 - smooth((u - 0.8) / 0.2)), gain: 0.14, drive: 1.6, jit: 0.7, jitHz: 14 }, seed + 1), 0.02), 1, Math.round(t0 * SR));
  for (const [dt, f, a] of [[0.05, 1650, 0.12], [0.13, 1980, 0.1], [0.2, 1720, 0.14]]) {
    const at = Math.round((t0 + dt + r.range(-0.01, 0.01)) * SR);
    steelPing(out, at, f * r.range(0.97, 1.03), a, r.next() * 6, 0.8);
    noiseBurst(out, at, { a: 0.0001, tau: 0.0008, f0: 5200, q: 0.9, amp: a * 1.5 }, new Noise(seed + at));
  }
  const j = Math.round((t0 + td + 0.01) * SR);
  sweep(out, j, 190, 95, 0.012, 0.045, 0.45 * (0.6 + 0.4 * size), 0.001, 1);
  steelPing(out, j, 430 * r.range(0.97, 1.03), 0.3, 0.6, 1.6);
  noiseBurst(out, j, { a: 0.0002, tau: 0.002, f0: 3600, q: 0.8, amp: 0.5 }, new Noise(seed + 9));
  return fadeTail(out, 0.05);
}

// LOCKOPEN: the padlock's shackle springs ("ka"): a hard steel click and the shackle knocking its stop twice
export function sfxLockOpen(e, seed) {
  const out = new Float32Array(Math.ceil(0.35 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0011, f0: 4600, q: 0.9, amp: 1 }, new Noise(seed));
  steelPing(out, 0, 2350 * r.range(0.97, 1.03), 0.35, r.next() * 6, 0.9);
  ping(out, 0, 760 * r.range(0.97, 1.03), 0.25, [[1, 1, 0.03], [2.4, 0.4, 0.015]], 1);
  const a2 = Math.round(0.016 * SR);
  steelPing(out, a2, 3100 * r.range(0.97, 1.03), 0.18, r.next() * 6, 1.6);
  noiseBurst(out, a2, { a: 0.0001, tau: 0.0007, f0: 6500, q: 1, amp: 0.4 }, new Noise(seed + 1));
  steelPing(out, Math.round(0.05 * SR), 2900, 0.06, 0.4, 1.2);
  return fadeTail(out, 0.03);
}

// LOCKSHUT: a padlock snapped shut ("ka-da"): the shackle pushed home, the latch catching
export function sfxLockShut(e, seed) {
  const out = new Float32Array(Math.ceil(0.3 * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.0003, tau: 0.002, f0: 3000, q: 1, amp: 0.45 }, new Noise(seed));
  steelPing(out, 0, 1850 * r.range(0.97, 1.03), 0.18, r.next() * 6, 0.7);
  const a2 = Math.round((0.028 + 0.006 * r.next()) * SR);
  noiseBurst(out, a2, { a: 0.0001, tau: 0.001, f0: 5200, q: 0.9, amp: 0.9 }, new Noise(seed + 1));
  steelPing(out, a2, 2600 * r.range(0.97, 1.03), 0.3, r.next() * 6, 1);
  ping(out, a2, 640, 0.22, [[1, 1, 0.03], [2.3, 0.4, 0.016]], 0.5);
  return fadeTail(out, 0.03);
}

// LOCKDROP (size): a heavy padlock dropping onto the wooden table ("dang"): the table's thud, the lock's body
// ringing dark, a small bounce and a last knock, the shackle rattling
export function sfxLockDrop(e, seed) {
  const size = e.size ?? 0.8, out = new Float32Array(Math.ceil(1.3 * SR)), r = new Rng(seed), f0 = 690 * r.range(0.96, 1.04) * (1.15 - 0.3 * size);
  const LOCK = [[1, 1, 0.42], [1.53, 0.5, 0.3], [2.31, 0.55, 0.22], [3.12, 0.3, 0.14], [4.4, 0.18, 0.08]];
  const hit = (at, a) => {
    sweep(out, at, 170, 80, 0.012, 0.05, 0.45 * a, 0.001, 1);
    ping(out, at, 176 * r.range(0.97, 1.03), 0.22 * a, [[1, 1, 0.07], [1.64, 0.6, 0.05], [2.66, 0.4, 0.03]], r.next() * 6);
    ping(out, at, f0, 0.16 * a, LOCK.map(([q, aa, dd]) => [q, aa, dd * (0.6 + 0.6 * size)]), r.next() * 6);
    noiseBurst(out, at, { a: 0.0002, tau: 0.003, f0: 3800, q: 0.8, amp: 0.55 * a }, new Noise(seed + at));
  };
  hit(0, 1); hit(Math.round(0.085 * SR), 0.28); hit(Math.round(0.135 * SR), 0.1);
  for (let k = 0; k < 4; k++) steelPing(out, Math.round(r.range(0.01, 0.2) * SR), r.range(2400, 4200), r.range(0.02, 0.05), r.next() * 6, 0.7);
  return fadeTail(out, 0.1);
}

// STICKER: a "安全 ✓" sticker: the backing peeled off (a quick dry rip), then slapped flat on the iron lid with
// the palm ("pa"); the lid answers faintly. The same gag every time, so it sounds nearly the same every time.
export function sfxSticker(e, seed) {
  const out = new Float32Array(Math.ceil(0.34 * SR)), r = new Rng(seed % 7 + 3), pd = 0.06;
  for (let t = 0; t < pd; t += r.range(0.0015, 0.004)) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0003, 0.0009), f0: r.range(3000, 7500), q: 1.1, amp: r.range(0.05, 0.14) * Math.sin(Math.PI * t / pd) }, new Noise(seed + Math.round(t * 1e5)));
  const at = Math.round((pd + 0.045) * SR);
  noiseBurst(out, at, { a: 0.0004, tau: 0.011, f0: 1500, q: 0.7, mode: 'lp', amp: 0.9 }, new Noise(seed + 1));
  noiseBurst(out, at, { a: 0.0001, tau: 0.0018, f0: 3900, q: 0.8, amp: 0.55 }, new Noise(seed + 2));
  ping(out, at, 240 * r.range(0.97, 1.03), 0.1, [[1, 1, 0.05], [1.58, 0.6, 0.035], [2.24, 0.4, 0.025]], 0.3);
  return fadeTail(out, 0.02);
}

// LIDSLAM (size): the iron lid banged shut: a thump, the box's body clanging dark, the hasp and the lid rattling
export function sfxLidSlam(e, seed) {
  const size = e.size ?? 0.8, out = new Float32Array(Math.ceil(1.6 * SR)), r = new Rng(seed);
  sweep(out, 0, 130, 52, 0.02, 0.09 + 0.06 * size, 0.85, 0.001, 1.6);
  ping(out, 0, 168 * r.range(0.97, 1.03), 0.3, IRONP, 0.4);
  ping(out, 0, 610 * r.range(0.97, 1.03), 0.12, [[1, 1, 0.2], [1.71, 0.6, 0.14], [2.63, 0.35, 0.08]], 1.3);
  noiseBurst(out, 0, { a: 0.0002, tau: 0.008, f0: 2600, q: 0.7, amp: 0.8 }, new Noise(seed));
  noiseBurst(out, 0, { a: 0.001, tau: 0.04, f0: 600, q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed + 1));
  for (let k = 0; k < 5; k++) steelPing(out, Math.round((0.03 + k * 0.022 + r.range(0, 0.01)) * SR), r.range(1300, 2600), 0.08 * Math.exp(-k / 2), r.next() * 6, 0.8);
  return fadeTail(out, 0.1);
}

// LIDBURST (size): the lid punched open from inside ("beng"): a boom inside the iron box, its body ringing torn,
// rivets and the hasp flying, the light escaping as a bright hiss. Stereo. A wall.
export function sfxLidBurst(e, seed) {
  const size = e.size ?? 1, S = pair(2.6), r = new Rng(seed), m = new Float32Array(S.L.length);
  add(m, boom({ f0: 150, f1: 42, sweep: 0.06, tau: 0.45 + 0.25 * size, dur: 2.4, drive: 3, gain: 0.75 }, seed), 1);
  ping(m, 0, 150 * r.range(0.97, 1.03), 0.42, IRONP.map(([q, a, dd]) => [q, a, dd * 1.4]), 0.2);
  noiseBurst(m, 0, { a: 0.0001, tau: 0.02, f0: 2200, q: 0.5, amp: 1, hp: 300 }, new Noise(seed + 1));
  for (let i = 0; i < m.length; i++) m[i] = Math.tanh(m[i] * 1.6) * 0.7;
  addPan(S, m, 0);
  for (let k = 0; k < 18; k++) {
    const tmp = new Float32Array(Math.round(0.08 * SR));
    steelPing(tmp, 0, r.range(1500, 4500), r.range(0.05, 0.15), r.next() * 6, 0.6);
    noiseBurst(tmp, 0, { a: 0.0001, tau: 0.0008, f0: r.range(4000, 8000), q: 1, amp: r.range(0.1, 0.3) }, new Noise(seed + 50 + k));
    addPan(S, tmp, r.range(-0.9, 0.9), Math.round(r.range(0.002, 0.18) * SR), size);
  }
  const nA = new Noise(seed + 3), nB = new Noise(seed + 4), hA = new SVF(5000, 0.7), hB = new SVF(5200, 0.7);
  for (let i = 0; i < Math.round(1.2 * SR); i++) { const t = i / SR, en = smooth(t / 0.01) * Math.exp(-t / 0.3) * 0.25 * size; hA.run(nA.white()); hB.run(nB.white()); S.L[i] += hA.hp * en; S.R[i] += hB.hp * en; }
  fadeTail(S.L, 0.2); fadeTail(S.R, 0.2);
  return S;
}

// LIDCREAK (dur, size): the lid slowly lifting on its hinge: a long iron groan (slow stick-slip through the hinge
// and the lid's own body), uneven, in swells
export function sfxLidCreak(e, seed) {
  const d = Math.max(0.5, e.dur || 2.5), size = e.size ?? 0.7, k = 1.15 - 0.3 * size;
  const out = friction(d + 0.2, { modes: HINGE.map(([f, q, a]) => [f * k, q, a]), rate: (u) => 4 + 16 * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7) + 5 * Math.sin(TAU * 1.3 * u), env: (u) => smooth(u / 0.15) * (1 - smooth((u - 0.85) / 0.15)), gain: 0.22, drive: 1.6, jit: 0.8, jitHz: 5 }, seed);
  add(out, friction(d + 0.2, { modes: IRON.slice(0, 3), rate: (u) => 3 + 8 * Math.sin(Math.PI * Math.min(1, u)), env: (u) => smooth(u / 0.2) * (1 - smooth((u - 0.8) / 0.2)), gain: 0.12, drive: 1.3, jit: 0.9, jitHz: 3 }, seed + 1), 1);
  return fadeTail(fadeIn(out, 0.02), 0.08);
}

// JOKERHUM (dur, pitch, size): the joker's tone. Not an instrument: a low hum whose partials sit a little off the
// harmonic series (they beat slowly), through a slowly moving vowel (o -> a: a grin), now and then shaken by a
// suppressed chuckle (a few quick pulses), a sub-octave under it and a faint glassy fizz over it. pitch 0 = A1.
// Stereo (the two sides drift apart).
export const sfxJokerHum = (e, seed) => drive(sfxJokerHumG(e, seed));
export function* sfxJokerHumG(e, seed) {
  const d = Math.max(0.6, e.dur || 3), f0 = 55 * Math.pow(2, (e.pitch ?? 0) / 12), size = e.size ?? 0.8, len = Math.ceil((d + 0.8) * SR), S = pair(d + 0.8), r = new Rng(seed);
  const P = [[1, 1], [2.012, 0.55], [2.968, 0.42], [4.07, 0.3], [5.23, 0.22], [6.61, 0.12], [0.5, 0.32 * size]];
  const chuck = []; for (let t = r.range(0.5, 0.9); t < d - 0.3; t += r.range(1.1, 1.8)) chuck.push([t, r.int(3, 5), r.range(4.2, 5.2)]);
  const chuckle = (t) => { let v = 0; for (const [c, n, f] of chuck) { const x = (t - c) * f; if (x > 0 && x < n) v = Math.max(v, Math.pow(Math.sin(Math.PI * (x % 1)), 2) * (1 - x / (n + 1))); } return v; };
  const env = (t) => smooth(t / 0.35) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.6));
  for (const [ch, out, sd] of [[0, S.L, 1], [1, S.R, 2]]) {
    const dr = new Drift(seed + sd, 0.7), vw = new Drift(seed + 10 + sd, 0.22), ph = P.map(() => r.next());
    const fA = new SVF(450, 3), fB = new SVF(1100, 4), nz = new Noise(seed + 20 + sd), br = new SVF(300, 0.7), fz = new SVF(7200, 4);
    let ck = 0, det = 1, e0 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      if ((i & 31) === 0) { const v = 0.5 + 0.5 * vw.at(t); fA.set(380 + 420 * v, 3); fB.set(950 + 500 * v, 4); ck = chuckle(t); det = Math.pow(2, (7 * dr.at(t) + (ch ? 4 : -4)) / 1200); e0 = env(t); }
      let x = 0;
      for (let q = 0; q < P.length; q++) { ph[q] += f0 * P[q][0] * det / SR; ph[q] -= Math.floor(ph[q]); x += P[q][1] * Math.sin(TAU * ph[q]); }
      x = Math.tanh(x * 0.9);
      fA.run(x); fB.run(x);
      br.run(nz.pink());
      fz.run(nz.white());
      const vox = x * 0.55 + fA.bp * 0.9 + fB.bp * 0.5;
      out[i] = (vox * (1 - 0.32 * ck) + br.lp * 0.4 * ck + fz.bp * 0.012) * e0 * 0.32;
      if ((i & 16383) === 16383) yield undefined;
    }
  }
  return S;
}

// GIANTBREATH (who 'CN' | 'US', dur, size): a national giant breathing in the dark behind the kings: a slow
// inhale, a held moment, a long exhale, air through a cavern of a throat with a low growl. CN a little deeper.
export function sfxGiantBreath(e, seed) {
  const d = Math.max(1, e.dur || 3), k = e.who === 'CN' ? 0.88 : 1, size = e.size ?? 1, len = Math.ceil((d + 0.3) * SR), S = pair(d + 0.3);
  const ENV = [[0, 0], [0.3, 0.5], [0.38, 0.6], [0.42, 0], [0.48, 0], [0.56, 1], [0.75, 0.7], [1, 0]];
  for (const [out, sd] of [[S.L, 1], [S.R, 2]]) {
    const nz = new Noise(seed + sd), f1 = new SVF(260, 4), f2 = new SVF(620, 5), f3 = new SVF(1300, 6), gr = new SVF(85, 0.8), dr = new Drift(seed + 5 + sd, 3);
    let en = 0, inh = 1;
    for (let i = 0; i < len; i++) {
      const u = i / (d * SR);
      if ((i & 63) === 0) { en = pws(ENV, Math.min(1, u)) * (u < 1 ? 1 : 0); inh = u < 0.45 ? 1 : 0; const s = inh ? 1 + 0.15 * u : 1 - 0.15 * (u - 0.5); f1.set(260 * k * s, 4); f2.set(620 * k * s, 5); f3.set(1300 * k * s, 6); }
      const w = nz.white(), p = nz.pink(); f1.run(p); f2.run(p); f3.run(w * 0.4 + p * 0.6); gr.run(nz.brown());
      const air = f1.bp * 1.0 + f2.bp * 0.6 + f3.bp * (inh ? 0.45 : 0.25);
      const growl = inh ? 0 : gr.lp * 2.2 * size * (0.55 + 0.45 * Math.sin(TAU * (19 + 3 * dr.at(i / SR)) * i / SR));
      out[i] = (air * (0.8 + 0.2 * dr.at(i / SR + 3)) + growl) * en * 0.35;
    }
  }
  return S;
}

// GIANTEYES (who, dur): the giant's eyes opening: a low swell (CN on F1, US on E1, two tones beating), and the
// glow fizzing faintly as it comes on
export function sfxGiantEyes(e, seed) {
  const f0 = e.who === 'CN' ? 43.65 : 41.2, d = Math.max(0.8, e.dur || 1.6), len = Math.ceil((d + 1.4) * SR), out = new Float32Array(len), nz = new Noise(seed), fz = new SVF(2400, 2);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, rise = 0.55 * d, en = t < rise ? Math.pow(t / rise, 1.6) : Math.exp(-(t - rise) / 0.55) * (i > len - 1200 ? (len - i) / 1200 : 1);
    p1 += f0 / SR; p2 += f0 * 1.007 / SR; p1 -= Math.floor(p1); p2 -= Math.floor(p2);
    fz.run(nz.white());
    const x = Math.sin(TAU * p1) + 0.5 * Math.sin(2 * TAU * p2) + 0.28 * Math.sin(3 * TAU * p1 + 0.4) + 0.12 * Math.sin(5 * TAU * p2);
    out[i] = (x * 0.42 + fz.bp * 0.05 * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 100 * t)))) * en;
  }
  return out;
}

// SEALSWING (dur, size): a giant seal swung on its chain: a huge low whoosh passing across, the chain's links
// clinking faster as it speeds up, the pivot creaking at the top
export function sfxSealSwing(e, seed) {
  const d = Math.max(0.4, e.dur || 0.9), size = e.size ?? 1, len = Math.ceil((d + 0.5) * SR), L = new Float32Array(len), R = new Float32Array(len), r = new Rng(seed);
  const nA = new Noise(seed), nB = new Noise(seed + 1), a = new SVF(200, 1), b = new SVF(200, 1), lo = new SVF(120, 0.7), p0 = (e.pan ?? 0) - 0.45, p1 = (e.pan ?? 0) + 0.45;
  const sh = (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u)), 2) * (0.4 + 0.6 * u);
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    if ((i & 31) === 0) { const f = 110 + 650 * sh(u); a.set(f, 1); b.set(f * 1.05, 1); lo.set(70 + 140 * sh(u), 0.7); }
    a.run(nA.white()); b.run(nB.white()); lo.run(nA.brown());
    const env = sh(u) * (t < d ? 1 : 0), [gl, gr] = panGains(clamp(p0 + (p1 - p0) * u, -1, 1)), body = lo.lp * 2.4 * size;
    L[i] = (a.bp * 0.9 + body) * env * gl; R[i] = (b.bp * 0.9 + body) * env * gr;
  }
  const ch = new Float32Array(len);
  for (let t = 0.05; t < d; t += 1 / (12 + 40 * sh(t / d))) steelPing(ch, Math.round(t * SR), r.range(700, 1500), 0.05 + 0.08 * sh(t / d), r.next() * 6, 0.9);
  add(ch, fadeTail(friction(0.25, { modes: STEEL, rate: (u) => 10 + 20 * u, env: (u) => Math.sin(Math.PI * u), gain: 0.1, drive: 1.4, jit: 0.7 }, seed + 3), 0.03), 1);
  addPan({ L, R }, ch, e.pan ?? 0);
  return { L: fadeTail(L, 0.05), R: fadeTail(R, 0.05), panned: true };
}

// DEAL (dur): one card dealt by the card king: a thin spinning swish ("sou") and a soft landing face down ("da")
export function sfxDeal(e, seed) {
  const d = Math.max(0.12, e.dur || 0.35), out = new Float32Array(Math.ceil((d + 0.15) * SR)), nz = new Noise(seed), bp = new SVF(1600, 1.4), r = new Rng(seed), spin = r.range(24, 34);
  for (let i = 0; i < Math.round(d * SR); i++) {
    const t = i / SR, u = t / d;
    if ((i & 15) === 0) bp.set(1600 + 2600 * Math.sin(Math.PI * Math.min(1, u * 1.2)), 1.4);
    bp.run(nz.white());
    out[i] = bp.bp * Math.pow(Math.sin(Math.PI * u), 2) * (0.5 + 0.5 * Math.pow(Math.abs(Math.sin(TAU * spin * t)), 2)) * 0.55;
  }
  const j = Math.round(d * SR);
  noiseBurst(out, j, { a: 0.0004, tau: 0.006, f0: 1400, q: 0.7, mode: 'lp', amp: 0.6 }, new Noise(seed + 1));
  noiseBurst(out, j, { a: 0.0001, tau: 0.0012, f0: 3800, q: 0.9, amp: 0.25 }, new Noise(seed + 2));
  ping(out, j, 300 * r.range(0.95, 1.05), 0.05, [[1, 1, 0.02]], 0.4);
  return fadeTail(out, 0.02);
}

// STRINGSDROP (dur): the glowing threads let go: a faint high release (a breath of air and a short shimmer of
// fine wire, no pitch glide), then the slack threads settling on the table (tiny soft ticks)
export function sfxStringsDrop(e, seed) {
  const d = Math.max(0.3, e.dur || 0.9), out = new Float32Array(Math.ceil((d + 0.25) * SR)), r = new Rng(seed);
  noiseBurst(out, 0, { a: 0.002, tau: 0.06, f0: 7500, f1: 3500, q: 1.5, amp: 0.25 }, new Noise(seed));
  for (let k = 0; k < 6; k++) ping(out, Math.round(r.range(0, 0.02) * SR), r.range(3000, 8000), r.range(0.01, 0.025), [[1, 1, r.range(0.05, 0.14)]], r.next() * 6);
  for (let k = 0; k < 8; k++) noiseBurst(out, Math.round(r.range(0.25, d) * SR), { a: 0.0001, tau: 0.0008, f0: r.range(2500, 5000), q: 1, amp: r.range(0.03, 0.08) }, new Noise(seed + 3 + k));
  return fadeTail(out, 0.03);
}

// FLYUP (dur): a card lifting off the table and rising away to the throne: a flick, then a spinning swish whose
// pitch climbs while it recedes (quieter and darker as it goes)
export function sfxFlyUp(e, seed) {
  const d = Math.max(0.3, e.dur || 1.0), out = new Float32Array(Math.ceil((d + 0.1) * SR)), nz = new Noise(seed), bp = new SVF(1200, 1.3), lp = new SVF(9000, 0.7), r = new Rng(seed), spin = r.range(26, 34);
  for (let i = 0; i < Math.round(d * SR); i++) {
    const t = i / SR, u = t / d;
    if ((i & 15) === 0) { bp.set(1200 + 3600 * Math.pow(u, 0.7), 1.3); lp.set(9000 - 6500 * u, 0.7); }
    bp.run(nz.white());
    const en = smooth(t / 0.04) * Math.exp(-u * 2.4) * Math.sqrt(1 - u), fl = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(TAU * (spin - 12 * u) * t)), 1.5);
    out[i] = lp.run(bp.bp * en * fl) * 0.6;
  }
  noiseBurst(out, 0, { a: 0.0001, tau: 0.002, f0: 3000, q: 0.9, amp: 0.35 }, new Noise(seed + 1));
  return fadeTail(out, 0.02);
}

// ABSORB (dur, size): the card king breathing a card in: a cavernous inhale rising (it accelerates), then the
// card arrives in its chest: a deep "thoom" and a soft golden hiss rippling out
export function sfxAbsorb(e, seed) {
  const d = Math.max(0.4, e.dur || 1.1), size = e.size ?? 1, len = Math.ceil((d + 1.4) * SR), out = new Float32Array(len), nz = new Noise(seed), f1 = new SVF(200, 3.5), f2 = new SVF(500, 4), hs = new SVF(6000, 0.7);
  const nd = Math.round(d * SR);
  for (let i = 0; i < nd; i++) {
    const u = i / nd;
    if ((i & 31) === 0) { f1.set(200 + 320 * Math.pow(u, 1.5), 3.5); f2.set(500 + 650 * u, 4); }
    const p = nz.pink(); f1.run(p); f2.run(p);
    out[i] = (f1.bp + 0.6 * f2.bp) * u * u * (1 - smooth((u - 0.97) / 0.03)) * 0.9 * size;
  }
  sweep(out, nd, 75, 34, 0.06, 0.5, 0.8 * size, 0.003, 1.5);
  for (let i = nd; i < len; i++) { const t = (i - nd) / SR; hs.run(nz.white()); out[i] += hs.hp * 0.05 * smooth(t / 0.02) * Math.exp(-t / 0.45) * size; }
  return fadeTail(out, 0.05);
}

// CLOCKTICK (size, pitch): the brass turn clock's escapement: a crisp tick, the next one a "tock" (pitch 1, or
// odd video frames when pitch is 0); identical every time (a machine), cached
const clockCache = new Map();
export function sfxClockTick(e) {
  const tock = e.pitch ? e.pitch > 0 : (Math.round(e.t * 24) & 1) === 1, b = Math.round(clamp(e.size ?? 0.5) * 2), key = SR * 10 + (tock ? 5 : 0) + b;
  if (clockCache.has(key)) return clockCache.get(key);
  const out = new Float32Array(Math.ceil(0.06 * SR)), k = tock ? 0.87 : 1;
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0006, f0: 6200 * k, q: 1, amp: 0.8 }, new Noise(21));
  ping(out, 0, 3050 * k, 0.22, [[1, 1, 0.014], [1.73, 0.5, 0.009], [2.9, 0.25, 0.006]], 0.7);
  ping(out, 0, 820 * k, 0.12 * (0.6 + 0.4 * b), [[1, 1, 0.01]], 0.2);
  fadeTail(out, 0.006);
  clockCache.set(key, out);
  return out;
}

// CLOCKRING (dur): the turn clock's alarm, short: the clapper between its two little bells, the clock rattling
// on the table
export function sfxClockRing(e, seed) {
  const d = Math.max(0.15, e.dur || 0.6), out = new Float32Array(Math.ceil((d + 0.7) * SR)), r = new Rng(seed);
  const BELL = [[1, 1, 0.3], [2.76, 0.45, 0.17], [5.4, 0.25, 0.09], [8.93, 0.12, 0.05]];
  for (let t = 0, k = 0; t < d; t += 1 / 23, k++) {
    const at = Math.round(t * SR), a = 0.07 * (0.8 + 0.2 * r.next());
    ping(out, at, (k % 2 ? 2280 : 2610) * r.range(0.998, 1.002), a, BELL, r.next() * 6);
    noiseBurst(out, at, { a: 0.0001, tau: 0.0006, f0: 5000, q: 1, amp: a * 1.5 }, new Noise(seed + at));
    if (k % 2 === 0) noiseBurst(out, at, { a: 0.0003, tau: 0.004, f0: 700, q: 0.8, mode: 'lp', amp: 0.12 }, new Noise(seed + at + 1));
  }
  return fadeTail(out, 0.1);
}

// OLDCLOCK (pitch 0 tick / 1 tock): the old long-case clock in the dark room: a wooden tick-tock, the
// escapement and the case answering. Identical every time, cached.
const oldCache = new Map();
export function sfxOldClock(e) {
  const tock = (e.pitch ?? 0) > 0, key = SR * 10 + (tock ? 1 : 0);
  if (oldCache.has(key)) return oldCache.get(key);
  const out = new Float32Array(Math.ceil(0.3 * SR)), k = tock ? 0.89 : 1;
  noiseBurst(out, 0, { a: 0.0001, tau: 0.0008, f0: 4200 * k, q: 1, amp: 0.5 }, new Noise(31));
  ping(out, 0, 1260 * k, 0.2, [[1, 1, 0.025], [2.3, 0.5, 0.015], [3.6, 0.2, 0.01]], 0.4);
  ping(out, 0, 212 * k, 0.2, [[1, 1, 0.09], [2.2, 0.3, 0.05]], 1.1);
  noiseBurst(out, Math.round(0.008 * SR), { a: 0.0001, tau: 0.0006, f0: 3000 * k, q: 1, amp: 0.15 }, new Noise(32));
  fadeTail(out, 0.02);
  oldCache.set(key, out);
  return out;
}

// BREATH (who, dur, size): a king breathing heavily (Google asleep on his chips; size = how heavy): a nasal
// inhale, a long exhale with a soft snore fluttering in it
export function sfxBreath(e, seed) {
  const d = Math.max(0.6, e.dur || 3.6), size = e.size ?? 0.7, len = Math.ceil((d + 0.2) * SR), out = new Float32Array(len), nz = new Noise(seed);
  const n1 = new SVF(1100, 1.2), n2 = new SVF(2600, 2), ex = new SVF(700, 0.7), sn = new SVF(260, 1.5), dr = new Drift(seed + 1, 0.8);
  const ENV_I = [[0, 0], [0.15, 0.5], [0.38, 0.7], [0.43, 0]], ENV_E = [[0.45, 0], [0.55, 1], [0.8, 0.6], [1, 0]];
  for (let i = 0; i < len; i++) {
    const u = i / (d * SR), w = nz.white(), p = nz.pink();
    n1.run(w); n2.run(w); ex.run(p); sn.run(nz.brown());
    const ei = u < 0.43 ? pws(ENV_I, u) : 0, ee = u >= 0.45 && u < 1 ? pws(ENV_E, u) : 0;
    const flutter = 0.5 + 0.5 * Math.sin(TAU * (27 + 4 * dr.at(i / SR)) * i / SR);
    out[i] = ((n1.bp * 0.5 + n2.bp * 0.12) * ei + (ex.lp * 0.7 + sn.bp * 1.6 * size * flutter) * ee) * 0.4;
  }
  return fadeTail(out, 0.02);
}

// TEAR (dur): cloth ripping (a city peeled off the map): fibres snapping in a run, in spurts, the cloth's body
export function sfxTear(e, seed) {
  const d = Math.max(0.2, e.dur || 0.8), out = new Float32Array(Math.ceil((d + 0.2) * SR)), r = new Rng(seed), nz = new Noise(seed + 1), bp = new SVF(900, 0.9);
  const spurt = (u) => 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(Math.PI * (2.6 * u + 0.2))), 0.6);
  for (let t = 0; t < d; t += 1 / ((250 + 400 * r.next()) * spurt(t / d))) noiseBurst(out, Math.round(t * SR), { a: 0.0001, tau: r.range(0.0004, 0.0012), f0: r.range(1800, 6500), q: 1, amp: r.range(0.06, 0.2) * spurt(t / d) }, new Noise(seed + Math.round(t * 1e5)));
  for (let i = 0; i < Math.round(d * SR); i++) { const u = i / (d * SR); bp.run(nz.white()); out[i] += bp.bp * 0.14 * spurt(u) * smooth(u / 0.05) * (1 - smooth((u - 0.9) / 0.1)); }
  return fadeTail(out, 0.02);
}

// GLOW (dur, size, pitch): the gold light (the joker's power leaking): a soft deep "vwoom" that blooms and runs
// outward (the stereo image widens as it goes), a faint high shimmer. pitch 0 = A1.
export function sfxGlow(e, seed) {
  const d = Math.max(0.5, e.dur || 2.4), size = e.size ?? 0.8, f0 = 55 * Math.pow(2, (e.pitch ?? 0) / 12), len = Math.ceil((d + 0.4) * SR), S = pair(d + 0.4);
  const P = [[1, 1], [2, 0.5], [3.01, 0.32], [4.02, 0.2], [6.03, 0.1]], nz = new Noise(seed), hA = new SVF(7000, 0.7), hB = new SVF(7300, 0.7);
  const ph = new Float64Array(P.length * 2);
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(t / 0.06) * Math.exp(-2.2 * u) * (t < d ? 1 : Math.max(0, 1 - (t - d) / 0.4)), w = 1 + 0.004 * u;
    let l = 0, rr = 0;
    for (let q = 0; q < P.length; q++) { const a = q + P.length; ph[q] += f0 * P[q][0] / w / SR; ph[a] += f0 * P[q][0] * w / SR; ph[q] -= Math.floor(ph[q]); ph[a] -= Math.floor(ph[a]); l += P[q][1] * Math.sin(TAU * ph[q]); rr += P[q][1] * Math.sin(TAU * ph[a]); }
    hA.run(nz.white()); hB.run(nz.white());
    S.L[i] = (l * 0.3 + hA.hp * 0.03 * u) * en * size; S.R[i] = (rr * 0.3 + hB.hp * 0.03 * u) * en * size;
  }
  return S;
}

// LEAK (dur, size = how many locks are gone / 5): gold light seeping out of a box after a lock comes off: a fizz at
// the seam that swells into a short low glow; the more locks gone, the louder and the lower
export function sfxLeak(e, seed) {
  const d = Math.max(0.3, e.dur || 0.9), size = clamp(e.size ?? 0.4), f0 = 55 * Math.pow(2, (-1 - 3 * size) / 12), len = Math.ceil((d + 0.5) * SR), S = pair(d + 0.5);
  const nz = new Noise(seed), sA = new SVF(4200, 3), sB = new SVF(4500, 3), dr = new Drift(seed + 1, 9), ph = [0, 0.3, 0.6, 0.1];
  for (let i = 0; i < len; i++) {
    const t = i / SR, u = Math.min(1, t / d), en = smooth(t / (0.35 * d)) * (t < d ? 1 - 0.5 * smooth((u - 0.6) / 0.4) : 0.5 * Math.max(0, 1 - (t - d) / 0.5));
    let x = 0; [1, 2, 3.01, 4.03].forEach((k, q) => { ph[q] += f0 * k / SR; ph[q] -= Math.floor(ph[q]); x += Math.sin(TAU * ph[q]) / (1 + q); });
    const w = nz.white(); sA.run(w); sB.run(nz.white());
    const fz = (0.5 + 0.5 * dr.at(t)) * (1 - 0.6 * u) * 0.05;
    S.L[i] = (x * 0.22 * (0.5 + size) * smooth(u / 0.5) + sA.bp * fz) * en; S.R[i] = (x * 0.22 * (0.5 + size) * smooth(u / 0.5) + sB.bp * fz) * en;
  }
  return S;
}

// CIGARDROP: the cigars falling out of the kings' mouths onto the table: three or four soft tumbling knocks on wood,
// a little bounce each, a few sparks of ember
export function sfxCigarDrop(e, seed) {
  const out = new Float32Array(Math.ceil(1.0 * SR)), r = new Rng(seed);
  for (let k = 0, t = 0; k < 4; k++, t += r.range(0.08, 0.2)) {
    const at = Math.round(t * SR), a = r.range(0.6, 1);
    noiseBurst(out, at, { a: 0.0005, tau: 0.012, f0: 520, q: 0.7, mode: 'lp', amp: 0.6 * a }, new Noise(seed + at));
    ping(out, at, r.range(210, 280), 0.18 * a, [[1, 1, 0.04], [2.3, 0.4, 0.02]], r.next() * 6);
    const b = at + Math.round(r.range(0.05, 0.08) * SR);
    noiseBurst(out, b, { a: 0.0004, tau: 0.008, f0: 600, q: 0.7, mode: 'lp', amp: 0.2 * a }, new Noise(seed + b));
    for (let s = 0; s < 3; s++) noiseBurst(out, at + Math.round(r.range(0, 0.06) * SR), { a: 0.0001, tau: 0.0005, f0: r.range(3000, 6000), q: 1, amp: r.range(0.03, 0.08) }, new Noise(seed + at + s + 7));
  }
  return fadeTail(out, 0.05);
}

// CARDCLOUD: (made by audio-sfx.js from the many quiet flyUp / absorb events of the race, 11-06 .. 11-08) the cards
// streaming up into the king as ONE granular texture instead of hundreds of hits: e.fly = [[t, gain, pan], ...] are
// short rising swishes from a small bank; e.abs = [[t, gain], ...] drive a breathing bed (the king inhaling it all,
// its formants rising as he grows) and a golden hiss; every few absorbs a soft low "thoom". Stereo, panned.
const swishBank = new Map();
function swish(v) {
  const key = SR * 10 + v; if (swishBank.has(key)) return swishBank.get(key);
  const r = new Rng(800 + v), d = 0.22 + 0.12 * r.next(), out = new Float32Array(Math.ceil(d * SR)), nz = new Noise(810 + v), bp = new SVF(1500, 1.3), spin = r.range(24, 36), f0 = r.range(1300, 1900), f1 = r.range(3800, 5600);
  for (let i = 0; i < out.length; i++) { const t = i / SR, u = t / d; if ((i & 15) === 0) bp.set(f0 + (f1 - f0) * Math.pow(u, 0.7), 1.3); bp.run(nz.white()); out[i] = bp.bp * smooth(t / 0.02) * Math.pow(1 - u, 1.5) * (0.4 + 0.6 * Math.pow(Math.abs(Math.sin(TAU * spin * t)), 1.5)); }
  swishBank.set(key, out); return out;
}
export function sfxCardCloud(e, seed) {
  const fly = e.fly ?? [], abs = e.abs ?? [], t0 = e.t, d = Math.max(0.5, e.dur || 2), len = Math.ceil((d + 1.5) * SR), L = new Float32Array(len), R = new Float32Array(len), r = new Rng(seed);
  for (const [t, g, pan] of fly) { const s = swish(r.int(0, 7)), [gl, gr] = panGains(pan), at = Math.round((t - t0) * SR); for (let i = 0; i < s.length && at + i < len; i++) if (at + i >= 0) { L[at + i] += s[i] * g * gl; R[at + i] += s[i] * g * gr; } }
  // the absorb rate, smoothed (per 0.05 s, ~0.4 s window): the bed's level
  const B = Math.round(0.05 * SR), nb = Math.ceil(len / B), rate = new Float32Array(nb);
  for (const [t, g] of abs) { const b = Math.floor((t - t0) * SR / B); if (b >= 0 && b < nb) rate[b] += g; }
  const sm = new Float32Array(nb); let acc = 0; for (let b = 0; b < nb; b++) { acc = acc * 0.88 + rate[b]; sm[b] = acc * 0.12 / 0.05; }
  let mx = 1e-9; for (const v of sm) mx = Math.max(mx, v);
  const nA = new Noise(seed + 1), nB = new Noise(seed + 2), aA = new SVF(220, 3), aB = new SVF(240, 3), bA = new SVF(600, 4), bB = new SVF(640, 4), hA = new SVF(6500, 0.7), hB = new SVF(6800, 0.7);
  let lv = 0;
  for (let i = 0; i < len; i++) {
    const u = Math.min(1, i / (d * SR));
    if ((i & 63) === 0) { const b = Math.min(nb - 1, Math.floor(i / B)); lv = Math.pow(sm[b] / mx, 0.7); const f = 220 + 380 * u; aA.set(f, 3); aB.set(f * 1.08, 3); bA.set(2.6 * f, 4); bB.set(2.75 * f, 4); }
    const pa = nA.pink(), pb = nB.pink(); aA.run(pa); aB.run(pb); bA.run(pa); bB.run(pb); hA.run(nA.white()); hB.run(nB.white());
    L[i] += ((aA.bp + 0.5 * bA.bp) * 0.5 + hA.hp * 0.025) * lv; R[i] += ((aB.bp + 0.5 * bB.bp) * 0.5 + hB.hp * 0.025) * lv;
  }
  const th = new Float32Array(Math.round(0.9 * SR)); sweep(th, 0, 70, 36, 0.06, 0.35, 1, 0.003, 1.2);
  abs.forEach(([t, g], k) => { if (k % 6) return; const at = Math.round((t - t0) * SR); for (let i = 0; i < th.length && at + i < len; i++) if (at + i >= 0) { const v = th[i] * g * 0.5; L[at + i] += v; R[at + i] += v; } });
  fadeTail(L, 0.3); fadeTail(R, 0.3);
  return { L, R, panned: true };
}

// the heaviest synths also come as generators (one step per voice) for the cooperative render
export const SFX_GEN = { storm: sfxStormG, tornado: sfxTornadoG, jokerHum: sfxJokerHumG, chipflow: sfxChipflowG };
export const SFX_KINDS = {
  tick: sfxTick, throw: sfxThrow, slap: sfxSlap, stamp: sfxStamp, cover: sfxCover, relay: sfxRelay, string: sfxString,
  creakS: sfxCreakS, lighter: sfxLighter, puff: sfxPuff, clink: sfxClink, flaps: sfxFlaps, crackG: sfxCrackG, ash: sfxAsh,
  buzz: sfxBuzz, alarm: sfxAlarm, click: sfxClick, chains: sfxChains, strain: sfxStrain, storm: sfxStorm, whoosh: sfxWhoosh,
  switch: sfxSwitch, creakL: sfxCreakL, slam: sfxSlam, stone: sfxStone, pulse: sfxPulse, chips: sfxChips, press: sfxPress, pop: sfxPop,
  jam: sfxJam, topple: sfxTopple, creakT: sfxCreakT, fold: sfxFold, thud: sfxThud, chipflow: sfxChipflow, seal: sfxSeal, crunch: sfxCrunch,
  groan: sfxGroan, snap: sfxSnap, collapse: sfxCollapse, avalanche: sfxAvalanche, blink: sfxBlink, hang: sfxHang, gate: sfxGate, cart: sfxCart,
  kiln: sfxKiln, brick: sfxBrick, reel: sfxReel, zip: sfxZip, brush: sfxBrush, bomb: sfxBomb, point: sfxPoint, books: sfxBooks, heart: sfxHeart,
  lever: sfxLever, clank: sfxClank, crumble: sfxCrumble, crackle: sfxCrackle, boomL: sfxBoomL, paper: sfxPaper, tornado: sfxTornado,
  flatten: sfxFlatten, tilt: sfxTilt, flick: sfxFlick, kingbomb: sfxKingbomb, wave: sfxWave,
  // v2
  chairSlide: sfxChairSlide, chairStop: sfxChairStop, keyTurn: sfxKeyTurn, lockOpen: sfxLockOpen, lockShut: sfxLockShut, lockDrop: sfxLockDrop,
  sticker: sfxSticker, lidSlam: sfxLidSlam, lidBurst: sfxLidBurst, lidCreak: sfxLidCreak, jokerHum: sfxJokerHum, giantBreath: sfxGiantBreath,
  giantEyes: sfxGiantEyes, sealSwing: sfxSealSwing, deal: sfxDeal, stringsDrop: sfxStringsDrop, flyUp: sfxFlyUp, absorb: sfxAbsorb,
  clockTick: sfxClockTick, clockRing: sfxClockRing, oldClock: sfxOldClock, breath: sfxBreath, tear: sfxTear, glow: sfxGlow,
  leak: sfxLeak, cigarDrop: sfxCigarDrop, cardCloud: sfxCardCloud,
};
