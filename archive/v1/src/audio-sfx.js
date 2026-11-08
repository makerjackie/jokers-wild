// Sound department — the effects track and the ambience of JOKERS WILD.
// 1. Every picture event from soundEvents() (owned by the director) is rendered with the synth for its
//    kind (audio-sfxlib.js), at the kind's mix level times the event's gain, panned by pan, sent to the
//    war room. The AI layer (ticks, throws, slaps) is re-mixed per shot like a re-recording mixer would:
//    where the camera is decides how close the cards are (it never stops; it only moves away).
// 2. The ambience: the machine-room hum (the AI layer's floor: 50 Hz with faint 100/150 Hz; it never
//    stops) and, from the alarm event on, a low motor-driven air-raid siren far away in the stone room.
// Nothing here hard-codes a film second: times come from CUES / ROW / the events.
import { SR, TAU, Noise, Drift, SVF, Biquad, panGains, pws, smooth, put, BLOCK, drive } from './audio-dsp.js';
import { SFX_KINDS, SFX_GEN } from './audio-sfxlib.js';

// per-kind mix: [gain, room send]. The cancel key is dry (almost no room); glass and chains ring.
export const MIX = {
  tick: [0.5, 0.05], throw: [0.3, 0.1], slap: [0.36, 0.08], stamp: [0.7, 0.1], cover: [0.85, 0.12], relay: [1.0, 0.16],
  string: [0.8, 0.22], creakS: [0.75, 0.12], lighter: [0.8, 0.1], puff: [0.8, 0.1], clink: [1.0, 0.3], flaps: [0.75, 0.12],
  crackG: [1.6, 0.22], ash: [0.5, 0.05], buzz: [0.55, 0.12], alarm: [0.8, 0.25], click: [1.7, 0.02], chains: [1.2, 0.25],
  strain: [1.2, 0.25], storm: [1.8, 0.18], whoosh: [0.8, 0.15],
  // the rest of the film
  switch: [1.4, 0.15], creakL: [0.45, 0.2], slam: [0.7, 0.25], stone: [0.3, 0.12], pulse: [0.5, 0.1], chips: [1.6, 0.12], press: [0.45, 0.15],
  pop: [2.2, 0.15], jam: [4.5, 0.12], topple: [4.2, 0.15], creakT: [0.3, 0.12], fold: [2.4, 0.08], thud: [0.55, 0.15], chipflow: [1.5, 0.12],
  seal: [1.27, 0.3], crunch: [1.0, 0.2], groan: [0.2, 0.15], snap: [1.5, 0.12], collapse: [0.5, 0.18], avalanche: [4.8, 0.2], blink: [0.8, 0.1],
  hang: [1.4, 0.15], gate: [0.9, 0.15], cart: [1.4, 0.15], kiln: [1.0, 0.15], brick: [1.4, 0.12], reel: [1.8, 0.1], zip: [1.0, 0.12],
  brush: [0.7, 0.05], bomb: [0.7, 0.25], point: [0.8, 0.1], books: [0.8, 0.15], heart: [0.036, 0.04], lever: [0.5, 0.12], clank: [1.6, 0.2],
  crumble: [3.0, 0.2], crackle: [2.5, 0.15], boomL: [0.6, 0.25], paper: [1.5, 0.1], tornado: [1.6, 0.15], flatten: [0.6, 0.18], tilt: [0.5, 0.2],
  flick: [2.4, 0.05], kingbomb: [1.0, 0.25], wave: [2.0, 0.2],
};
const AI = new Set(['tick', 'throw', 'slap']);

// the AI layer's level (dB) by shot: the camera decides how close the cards are
export function aiFocus(ROW) {
  const at = (id) => ROW[id] ? [ROW[id].t0, ROW[id].t1] : [Infinity, Infinity];
  // 8-02 in two halves: while the march is stuck the cards are still near; as it dies, everything recedes
  const f2 = ROW['8-02'] ? ROW['8-02'].t0 + 0.5 * (ROW['8-02'].t1 - ROW['8-02'].t0) : Infinity;
  const Z = [
    // [row or [t0, t1], ticks dB, throws/slaps dB, the strung arm in close-up: who, his dB]
    ['7-10', 0, -4], ['8-01', -3, -6], [[at('8-02')[0], f2], -6, -10], [[f2, at('8-02')[1]], -20, -28], ['8-03', -26, -32], ['8-04', -26, -32],
    ['8-05', -6, -10], ['8-06', -6, -12, 'anthropic', 0], ['8-07', -4, -6], ['8-08', -4, -6],
  ].map(([id, tk, th, who, wdb]) => ({ r: Array.isArray(id) ? id : at(id), tk, th, who, wdb }));
  return (e) => {
    for (const z of Z) if (e.t >= z.r[0] && e.t < z.r[1]) return e.kind === 'tick' ? z.tk : z.who && e.who === z.who ? z.wdb : z.th;
    return 0;
  };
}
// the rest of the film's re-recording mix (dB by kind, for events starting in a shot or a [t0, t1] range):
// the card-maker's hole stays a hole (heart, presses, lever and the clock pulled back; the scoreboard, which
// flips off-screen there, muted), the heartbeat after the 3.5 s of digital silence is quiet (the hole runs
// to the sub swell), the scoreboard is near in its close-ups and gone in the frozen world after the crack
const HOLE5 = ['4-13', '5-01', '5-02', '5-03', '5-04', '5-05'];
export const SCENE = {
  heart: { '3-04': 6, ...Object.fromEntries(HOLE5.map((id) => [id, -3])), '6-08': 4, '9-10': 7, '10-05': -4, '11-05': 4, '11-06': 4 },
  press: Object.fromEntries(HOLE5.slice(1).map((id) => [id, -14])),
  lever: { '5-01': -12, '5-06': -6 },
  paper: { '5-01': -8 },
  slam: { '1-02': 5 },
  tick: { ...Object.fromEntries(HOLE5.map((id) => [id, -10])), '9-08': 6, '10-05': -6, '11-06': 6, '11-07': 10 },
  flaps: { '2-19': 3, '6-01': 6, ...Object.fromEntries(HOLE5.map((id) => [id, -60])), '6-10': -12, '7-01': -6, '8-01': -6, '8-03': -60, '8-04': -60, freeze: -20 },
};
// named ranges besides shots: the frozen world from the freeze to the end of 8-02
const RANGES = { freeze: (C, ROW) => [C.freeze, ROW['8-02'] ? ROW['8-02'].t1 : C.freeze] };
function sceneOf(C, ROW) {
  const out = {};
  for (const [kind, T] of Object.entries(SCENE)) {
    out[kind] = [];
    for (const [id, db] of Object.entries(T)) { const r = RANGES[id] ? RANGES[id](C, ROW) : ROW[id] ? [ROW[id].t0, ROW[id].t1] : null; if (r) out[kind].push([r[0], r[1], db]); }
    out[kind].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));               // the narrowest range wins
  }
  return out;
}
function sceneDb(S, e) {
  const T = S[e.kind]; if (!T) return 0;
  for (const [a, b, db] of T) if (e.t >= a && e.t < b) return db;
  return 0;
}
// long tails pulled back at a cut (a perspective change, not a choke): [kind, film second, dB, ramp s]
export function ducks(C, ROW) {
  const D = [];
  if (ROW['3-04']) D.push(['seal', ROW['3-04'].t0, -12, 0.12], ['crunch', ROW['3-04'].t0, -12, 0.12]);    // EMBARGO -> the CN side: only the heart
  return D;
}

function putEvent(G, e, sig, gain, send, choke, duck) {
  const s0 = Math.round(e.t * SR) - G.off, n = G.dry.n, stereo = !(sig instanceof Float32Array);
  const len = stereo ? sig.L.length : sig.length;
  let [gl, gr] = panGains(e.pan ?? 0);
  if (stereo) { gl *= Math.SQRT2; gr *= Math.SQRT2; if (sig.panned) gl = gr = 1; gl = Math.min(gl, 1.25); gr = Math.min(gr, 1.25); }
  // a hard cut in the picture chokes everything that started before it (8 ms)
  let cut = len;
  for (const h of choke) if (h > e.t && h < e.t + len / SR) cut = Math.min(cut, Math.round((h - e.t) * SR));
  // a duck pulls the rest of the event back from a film second on (ramped)
  let dI = len, dK = 1, dR = 1;
  for (const [kind, t, db, ramp] of duck) if (kind === e.kind && t > e.t && t < e.t + len / SR) { dI = Math.round((t - e.t) * SR); dK = Math.pow(10, db / 20); dR = Math.max(1, Math.round(ramp * SR)); }
  const fo = Math.round(0.008 * SR);
  for (let i = Math.max(0, -s0); i < Math.min(len, cut, n - s0); i++) {
    const j = s0 + i, f = (cut - i < fo ? (cut - i) / fo : 1) * (i < dI ? 1 : 1 + (dK - 1) * Math.min(1, (i - dI) / dR));
    const a = (stereo ? sig.L[i] : sig[i]) * gain * gl * f, b = (stereo ? sig.R[i] : sig[i]) * gain * gr * f;
    G.dry.L[j] += a; G.dry.R[j] += b; G.send.L[j] += a * send; G.send.R[j] += b * send;
  }
}

let warned = false;
// render a list of events into a (windowed) group; returns { counts, unknown } (unknown kinds are skipped,
// with one console warning per page). buildSfxG yields after every event.
export const buildSfx = (C, ROW, G, events, o) => drive(buildSfxG(C, ROW, G, events, o));
export function* buildSfxG(C, ROW, G, events, o = {}) {
  const focus = aiFocus(ROW), scene = sceneOf(C, ROW), duck = ducks(C, ROW), choke = o.choke ?? [], counts = o.counts ?? {}, unknown = o.unknown ?? {};
  for (let k = 0; k < events.length; k++) {
    const e = events[k], fn = SFX_KINDS[e.kind];
    if (!fn) { unknown[e.kind] = (unknown[e.kind] || 0) + 1; continue; }
    const gfn = SFX_GEN[e.kind], sig = gfn ? yield* gfn(e, 1000 + (e.seedIndex ?? 0) * 7) : fn(e, 1000 + (e.seedIndex ?? 0) * 7);
    const [g, send] = MIX[e.kind], db = (AI.has(e.kind) ? focus(e) : 0) + sceneDb(scene, e);
    putEvent(G, e, sig, g * (e.gain ?? 1) * Math.pow(10, db / 20), send, choke, duck);
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    yield (k + 1) / events.length;
  }
  const unk = Object.entries(unknown);
  if (unk.length && !warned && typeof console !== 'undefined') { console.warn(`audio: skipped unknown sound-event kinds: ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`); warned = true; }
  return { counts, unknown };
}

// ============================================================ ambience
// The machine room's hum: 50 Hz mains with faint 100 / 150 Hz and a little 200 / 250, a slow drift,
// a breath of fan noise. Written straight into the (windowed) L/R. It never stops.
// Every ambience loop is a plain block function over [c0, c1) with its state in an object: the plain
// export runs it once over the whole range, the ...G generator BLOCK by BLOCK (bit-identical).
function* inBlocks(i0, i1, run) {
  for (let c0 = i0; c0 < i1; c0 += BLOCK) { const c1 = Math.min(i1, c0 + BLOCK); run(c0, c1); yield (c1 - i0) / Math.max(1, i1 - i0); }
}
function humSetup(L, off, t0, t1, o = {}) {
  const lvl = o.level ?? 0.01, lvlAt = o.lvlAt ?? (() => 1), i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(L.length, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  // one period of the hum per channel (all partials are multiples of 50 Hz), read with a drifting phase
  const P = 2048, H = [[1, 1, 0], [2, 0.3, 0.7], [3, 0.17, 1.9], [4, 0.05, 0.4], [5, 0.035, 2.6], [6, 0.018, 1.1]];
  const wL = new Float32Array(P + 1), wR = new Float32Array(P + 1);
  for (let i = 0; i <= P; i++) { const x = TAU * i / P; for (const [k, a, p] of H) { wL[i] += a * Math.sin(k * x + p); wR[i] += a * Math.sin(k * x + p + (k === 2 ? 0.35 : k === 3 ? -0.2 : 0)); } }
  // the room tone: 4.7 s of dark pink noise per channel, looped with a crossfaded seam
  const nl = Math.round(4.7 * SR), xf = Math.round(0.25 * SR), nL = new Float32Array(nl), nR = new Float32Array(nl);
  for (const [buf, sd] of [[nL, 504], [nR, 505]]) {
    const nz = new Noise(sd), lp = new SVF(240, 0.7), hp = new SVF(38, 0.7), tmp = new Float32Array(nl + xf);
    for (let i = 0; i < nl + xf; i++) { lp.run(nz.pink()); hp.run(lp.lp); tmp[i] = hp.hp * 0.9; }
    for (let i = 0; i < nl; i++) buf[i] = i < xf ? tmp[i] * (i / xf) + tmp[nl + i] * (1 - i / xf) : tmp[i];
  }
  return { lvl, lvlAt, i0, i1, off, P, wL, wR, nl, nL, nR, dA: new Drift(501, 0.21), dF: new Drift(502, 0.13), fi: Math.round(0.03 * SR), fo: Math.round(0.006 * SR), ph: 0, a: 1, inc: 50 * P / SR };
}
function humBlock(S, L, R, c0, c1) {
  const { lvl, lvlAt, i0, i1, off, P, wL, wR, nl, nL, nR, dA, dF, fi, fo } = S;
  let ph = S.ph, a = S.a, inc = S.inc;
  for (let i = c0; i < c1; i++) {
    if (((i - i0) & 127) === 0) { const t = (i + off) / SR; a = (1 + 0.08 * dA.at(t)) * lvlAt(t); inc = 50 * (1 + 0.0005 * dF.at(t)) * P / SR; }
    ph += inc; if (ph >= P) ph -= P;
    const j = ph | 0, fr = ph - j, q = (i + off) % nl;
    const e = (i - i0 < fi ? (i - i0) / fi : 1) * (i1 - i < fo ? (i1 - i) / fo : 1) * lvl * a;
    L[i] += (wL[j] + (wL[j + 1] - wL[j]) * fr + nL[q]) * e; R[i] += (wR[j] + (wR[j + 1] - wR[j]) * fr + nR[q]) * e;
  }
  S.ph = ph; S.a = a; S.inc = inc;
}
export function humInto(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) humBlock(S, L, R, S.i0, S.i1); }
export function* humIntoG(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => humBlock(S, L, R, c0, c1)); }

// The air-raid siren: a motor-driven, two-rotor siren (a minor third apart) spinning up from the alarm
// event, then wailing (rising and falling over ~3 s), with its motor rumble and the air chopped by the
// rotors; heard from the far end of the stone room. Its horn carries upper harmonics (to ~5 kHz, a
// presence peak at 1.6 kHz) so it reads on a phone speaker. o.gainAt(t) shapes its level in film seconds;
// from o.stopAt the motor is cut: the rotor coasts down (the pitch falls) and the siren dies.
function sirenSetup(G, t0, t1, o = {}) {
  const off = G.off, i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(G.dry.n, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  const fMax = o.f ?? 290, P = o.period ?? 3.2, stop = (o.stopAt ?? Infinity) - t0, up = o.spinUp ?? 2.3;
  const run = (t) => { if (t < up) return pws([[0, 0], [0.35, 0.18], [1.1, 0.66], [up * 0.85, 0.95], [up, 1]], t); const u = (t - up) / P; return 1 - 0.3 * (0.5 - 0.5 * Math.cos(TAU * u)); };
  const s0 = Number.isFinite(stop) ? run(stop) : 1;
  const speed = (t) => (t < stop ? run(t) : s0 * Math.exp(-(t - stop) / (o.dieSpeed ?? 0.5)));
  const [gl, gr] = panGains(o.pan ?? 0);
  return { G, t0, off, i0, i1, fMax, gain: o.gain ?? 0.1, send: o.send ?? 0.9, stop, gAt: o.gainAt ?? (() => 1), dieLevel: o.dieLevel ?? 0.45, speed,
    HK: [1, 0.5, 0.42, 0.28, 0.24, 0.16, 0.14, 0.09, 0.08, 0.05, 0.05, 0.03],
    nz: new Noise(611), air: new SVF(700, 3), nzm: new Noise(612), mot: new SVF(110, 0.7), lp: new SVF(4200, 0.7), lp2: new SVF(5000, 0.7), hp: new SVF(70, 0.7), dr: new Drift(613, 0.5),
    pres: Biquad.peak(1600, 0.9, 4), gl, gr, p1: 0, p2: 0, pm: 0, s: 0, g: 0 };
}
function sirenBlock(S, c0, c1) {
  const { G, t0, off, i0, i1, fMax, gain, send, stop, gAt, dieLevel, speed, HK, nz, air, nzm, mot, lp, lp2, hp, dr, pres, gl, gr } = S;
  let p1 = S.p1, p2 = S.p2, pm = S.pm, s = S.s, g = S.g;
  for (let i = c0; i < c1; i++) {
    const t = (i + off) / SR - t0;
    if (((i - i0) & 31) === 0) { s = speed(t); air.set(Math.max(80, fMax * s * 2.6), 3); g = gAt(t + t0) * (t < stop ? 1 : Math.exp(-(t - stop) / dieLevel)); }
    const f1 = fMax * s * (1 + 0.002 * dr.at(t)), f2 = f1 * 1.19;
    p1 += f1 / SR; p2 += f2 / SR; pm += f1 / 6 / SR; p1 -= Math.floor(p1); p2 -= Math.floor(p2); pm -= Math.floor(pm);
    let x = 0;
    for (let k = 0; k < HK.length; k++) { if ((k + 1) * f2 > SR * 0.4) break; x += HK[k] * (Math.sin(TAU * (k + 1) * p1) + 0.8 * Math.sin(TAU * (k + 1) * p2)); }
    air.run(nz.white()); mot.run(nzm.brown());
    const chop = 0.5 + 0.5 * Math.sin(TAU * p1);
    x = x * smooth(s * 1.6) + air.bp * 0.5 * chop * s + (mot.lp * 2.2 + 0.25 * Math.sin(TAU * pm)) * Math.min(1, s * 1.5);
    x *= 1 - 0.22 * (0.5 + 0.5 * Math.sin(TAU * 0.29 * t));                  // the rotating horn
    lp.run(x); lp2.run(lp.lp); hp.run(lp2.lp);
    const e = gain * g * smooth(t / 0.08) * (i1 - i < 64 ? (i1 - i) / 64 : 1), v = pres.run(hp.hp) * e;
    G.dry.L[i] += v * gl; G.dry.R[i] += v * gr; G.send.L[i] += v * gl * send; G.send.R[i] += v * gr * send;
  }
  S.p1 = p1; S.p2 = p2; S.pm = pm; S.s = s; S.g = g;
}
export function siren(G, t0, t1, o) { const S = sirenSetup(G, t0, t1, o); if (S) sirenBlock(S, S.i0, S.i1); }
export function* sirenG(G, t0, t1, o) { const S = sirenSetup(G, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => sirenBlock(S, c0, c1)); }

// The organ (M10): the machine room's hum sinks into an organ-like drone. Its pitch glides from the mains'
// 50 Hz down to E1 over `glide` s while the upper ranks (8', 4', 2 2/3', 2') come in, two slightly detuned
// ranks breathing against each other, a little wind. lvl(t) (film seconds) is its level. Straight into L/R.
function organSetup(L, off, t0, t1, o = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(L.length, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  return { i0, i1, off, t0, fA: 50, fB: o.f ?? 41.2, gl: o.glide ?? 4, lvl: o.lvl ?? (() => 1), gain: o.gain ?? 0.01,
    RANK: [[1, 1, 0], [2, 0.6, 0.5], [3, 0.32, 1], [4, 0.36, 1.5], [6, 0.16, 2.2], [8, 0.18, 2.6], [10, 0.06, 3.2]],
    nz: new Noise(901), wind: new SVF(900, 0.8), dw: new Drift(902, 0.4), pA: 0, pB: 0, e: 0, f: 50, reg: 0 };
}
function organBlock(S, L, R, c0, c1) {
  const { i0, i1, off, t0, fA, fB, gl, lvl, gain, RANK, nz, wind, dw } = S;
  let pA = S.pA, pB = S.pB, e = S.e, f = S.f, reg = S.reg;
  for (let i = c0; i < c1; i++) {
    const t = (i + off) / SR, u = t - t0;
    if (((i - i0) & 63) === 0) { f = fA * Math.pow(fB / fA, smooth(u / gl)); e = lvl(t) * gain; reg = smooth(u / (gl * 1.2)); }
    pA += f / SR; pB += f * 1.0021 / SR; pA -= Math.floor(pA); pB -= Math.floor(pB);
    let a = 0, b = 0;
    for (const [k, amp, d] of RANK) { const w = k === 1 ? 1 : reg * smooth((reg * 4 - d * 0.4)); a += amp * w * Math.sin(TAU * k * pA); b += amp * w * Math.sin(TAU * k * pB + 0.7); }
    wind.run(nz.white());
    const v = (i1 - i < 256 ? (i1 - i) / 256 : 1) * Math.min(1, (i - i0) / 256);
    L[i] += (a * 0.7 + b * 0.3 + wind.bp * 0.04 * reg * (0.6 + 0.4 * dw.at(t))) * e * v; R[i] += (a * 0.3 + b * 0.7 + wind.bp * 0.04 * reg * (0.6 + 0.4 * dw.at(t + 5))) * e * v;
  }
  S.pA = pA; S.pB = pB; S.e = e; S.f = f; S.reg = reg;
}
export function organInto(L, R, off, t0, t1, o) { const S = organSetup(L, off, t0, t1, o); if (S) organBlock(S, L, R, S.i0, S.i1); }
export function* organIntoG(L, R, off, t0, t1, o) { const S = organSetup(L, off, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => organBlock(S, L, R, c0, c1)); }
export { put };
