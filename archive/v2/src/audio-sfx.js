// Sound department — the effects track and the ambience of JOKERS WILD (v2).
// 1. Every picture event from soundEvents() (owned by the director) is rendered with the synth for its kind
//    (audio-sfxlib.js), at the kind's mix level times the event's gain, panned by pan, sent to the room. A
//    re-recording mix per shot (SCENE, HUSH) and ducks at cuts adjust what the picture asks for.
// 2. The score's own ambience events (scoreEvents): the old long-case clock and Google's slow breathing over the
//    empty table (M1), the gold light's "vwoom" on the first card and on the first lock of each side. They are
//    rendered like picture events; each is dropped as soon as the director emits that kind himself.
// 3. The ambience proper: the 50 Hz machine-room hum (it never stops, except in the gates), the air-raid siren
//    (from the alarm event), and the organ the hum turns into for the new king.
// Nothing here hard-codes a film second: times come from CUES / ROW / the events.
import { SR, TAU, Noise, Drift, SVF, Biquad, panGains, pws, smooth, put, BLOCK, drive } from './audio-dsp.js';
import { SFX_KINDS, SFX_GEN } from './audio-sfxlib.js';

// per-kind mix: [gain, room send]. The cancel key and the sticker are dry; iron and the giants ring.
export const MIX = {
  tick: [0.5, 0.05], throw: [0.3, 0.1], slap: [0.36, 0.08], stamp: [0.7, 0.1], cover: [0.85, 0.12], relay: [1.0, 0.16],
  string: [0.8, 0.22], creakS: [0.75, 0.12], lighter: [0.8, 0.1], puff: [0.8, 0.1], clink: [1.0, 0.3], flaps: [0.75, 0.12],
  crackG: [1.6, 0.22], ash: [0.5, 0.05], buzz: [0.55, 0.12], alarm: [0.8, 0.25], click: [1.7, 0.02], chains: [1.1, 0.22],
  strain: [1.2, 0.25], storm: [1.8, 0.18], whoosh: [0.8, 0.15],
  switch: [1.4, 0.15], creakL: [0.45, 0.2], slam: [0.7, 0.25], stone: [0.3, 0.12], pulse: [1.0, 0.1], chips: [1.6, 0.12], press: [0.45, 0.15],
  pop: [2.2, 0.15], jam: [4.5, 0.12], topple: [4.2, 0.15], creakT: [0.3, 0.12], fold: [2.4, 0.08], thud: [0.55, 0.15], chipflow: [1.5, 0.12],
  seal: [0.9, 0.3], crunch: [1.0, 0.2], groan: [0.2, 0.15], snap: [1.5, 0.12], collapse: [0.5, 0.18], avalanche: [4.8, 0.2], blink: [0.8, 0.1],
  hang: [1.4, 0.15], gate: [0.9, 0.15], cart: [1.4, 0.15], kiln: [1.0, 0.15], brick: [1.4, 0.12], reel: [1.8, 0.1], zip: [1.0, 0.12],
  brush: [0.7, 0.05], bomb: [0.7, 0.25], point: [0.8, 0.1], books: [0.8, 0.15], heart: [0.036, 0.04], lever: [0.5, 0.12], clank: [1.6, 0.2],
  crumble: [3.0, 0.2], crackle: [2.5, 0.15], boomL: [0.6, 0.25], paper: [1.5, 0.1], tornado: [1.6, 0.15], flatten: [0.6, 0.18], tilt: [0.5, 0.2],
  flick: [2.4, 0.05], kingbomb: [1.0, 0.25], wave: [2.0, 0.2],
  // v2
  chairSlide: [0.9, 0.15], chairStop: [0.7, 0.15], keyTurn: [1.3, 0.12], lockOpen: [1.4, 0.15], lockShut: [1.2, 0.12], lockDrop: [1.4, 0.2],
  sticker: [2.0, 0.06], lidSlam: [0.6, 0.22], lidBurst: [1.6, 0.25], lidCreak: [0.5, 0.2], jokerHum: [0.5, 0.3], giantBreath: [1.4, 0.3],
  giantEyes: [0.5, 0.25], sealSwing: [1.6, 0.2], deal: [0.8, 0.1], stringsDrop: [2.0, 0.15], flyUp: [1.2, 0.15], absorb: [0.9, 0.25],
  clockTick: [0.6, 0.06], clockRing: [1.2, 0.15], oldClock: [1.3, 0.15], breath: [2.2, 0.1], tear: [2.5, 0.1], glow: [1.0, 0.3],
  leak: [1.0, 0.3], cigarDrop: [5.0, 0.1], cardCloud: [1.4, 0.15],
};

// the re-recording mix (dB by kind, for events starting in a shot or a named [t0, t1] range); the narrowest wins
export const SCENE = {
  switch: { '1-01': -8 },
  chairSlide: { '2-20': -6 }, chairStop: { '2-20': -6 },
  slam: { '6-07': -7 },
  heart: { '9-06': 4, '11-01': 2, '11-02': 2, '11-03': 2, '11-04': 2 },
  giantEyes: { '4-06': -4 }, giantBreath: { '4-06': -4 },
  chains: { '4-04': -4 },
  lidCreak: { '8-03': -16 },
  keyTurn: { '7-11': 2, '7-12': 2 }, lockOpen: { '7-11': 2, '7-12': 2 }, lockDrop: { '7-11': 2, '7-12': 2 },
  // the AI's card ticks (the 滴答): up where the shot list asks for them
  tick: { '2-20': 10, '2-21': 8, '2-23': 8, '6-07': 10, '7-10': 6, '11-07': 8, '11-08': 10, '11-09': 4 },
  clockTick: { '7-10': -4, '7-11': -10, '7-12': -10, '7-13': -14 },
};
// whole shots pulled back, all kinds but a few: { range: [dB, [kinds kept]] }
export const HUSH = {
  '7-11': [-8, ['keyTurn', 'lockOpen', 'lockDrop', 'tick']], '7-12': [-8, ['keyTurn', 'lockOpen', 'lockDrop', 'tick']],
  '8-02': [-16, ['lidBurst', 'ash']],                                   // the frozen world
  '8-03': [-26, ['lidCreak', 'jokerHum']],                              // the hole: near silence
  '8-04': [-14, ['cigarDrop', 'jokerHum']],
  '8-05': [-8, ['click', 'alarm', 'buzz', 'jokerHum', 'sealSwing']],
};
const RANGES = {};
function rangeOf(id, C, ROW) { if (RANGES[id]) return RANGES[id](C, ROW); if (ROW[id]) return [ROW[id].t0, ROW[id].t1]; return null; }
function sceneOf(C, ROW) {
  const out = {};
  for (const [kind, T] of Object.entries(SCENE)) {
    out[kind] = [];
    for (const [id, db] of Object.entries(T)) { const r = rangeOf(id, C, ROW); if (r) out[kind].push([r[0], r[1], db]); }
    out[kind].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  }
  out['*'] = [];
  for (const [id, [db, keep]] of Object.entries(HUSH)) { const r = rangeOf(id, C, ROW); if (r) out['*'].push([r[0], r[1], db, new Set(keep)]); }
  return out;
}
function sceneDb(S, e) {
  let db = 0;
  const T = S[e.kind];
  if (T) for (const [a, b, d] of T) if (e.t >= a && e.t < b) { db = d; break; }
  for (const [a, b, d, keep] of S['*']) if (e.t >= a && e.t < b && !keep.has(e.kind)) { db += d; break; }
  return db;
}
// level automation of the picture's events (dB over film time, linear between keys, held outside them), per kind,
// optionally only for events starting in [from0, from1): long tails pulled back at a cut, a long event shaped
// across shots. [kind, [[t, dB], ...], from0?, from1?]
export function levels(C, ROW) {
  const A = [], r = (id) => ROW[id];
  if (r('4-06')) A.push(['seal', [[r('4-06').t0, 0], [r('4-06').t0 + 0.12, -20]]], ['crunch', [[r('4-06').t0, 0], [r('4-06').t0 + 0.12, -20]]]);   // EMBARGO -> the CN side
  if (r('4-02')) A.push(['slam', [[r('4-02').t0 + 0.2, 0], [r('4-02').t0 + 0.6, -12]], C.v3, C.eyes]);                                     // V3's drum out of the giant's shot
  if (r('2-20')) A.push(['jam', [[r('2-20').t0, 0], [r('2-20').t0 + 0.08, -16], [C.double - 0.1, -16], [C.double, -6]]]);                    // the board off-screen: only the clocks
  if (r('8-03')) A.push(['lidBurst', [[r('8-03').t0 - 0.35, 0], [r('8-03').t0 - 0.05, -45]]]);
  if (r('2-23')) A.push(['slam', [[r('2-23').t0 + 0.6, 0], [r('2-23').t0 + 1.0, -20]], C.double - 0.2, C.full]);                          // 2-23: quiet a beat                                                // the burst's tail out of the hole
  // the jokers rising: their tone barely there in the hole, growing as the kings look up, full by the seals
  A.push(['jokerHum', [[C.rise, -26], [C.lookup - 0.2, -24], [C.lookup + 0.3, -20], [C.cancel, -12], [C.seals, -4]], C.rise - 0.5, C.launch]);
  // the dispenser's long chip flow (EMBARGO .. the frenzy): under the heart, the fanfare and the kiln
  A.push(['chipflow', [[C.embargo + 0.4, 0], [C.starve, -14], [C.boast, -8], [C.avalanche, -10], [C.kiln, -16]], C.embargo - 0.1, C.embargo + 1]);
  return A;
}
function autoOf(A, e, len) {
  const out = [], t1 = e.t + len / SR;
  for (const [kind, keys, f0, f1] of A) if (kind === e.kind && (f0 === undefined || (e.t >= f0 && e.t < f1)) && keys[0][0] < t1) out.push(keys);
  return out;
}
const dbAt = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, x] = keys[i - 1], [b, y] = keys[i]; return x + (y - x) * (t - a) / Math.max(1e-9, b - a); } return keys[keys.length - 1][1]; };

// ---- the director's list, prepared for the mix (documented in docs/SOUND.md):
//  * tick {who: 'clock'} is the old room clock: rendered as the heavy pendulum clock (oldClock, tick / tock by second)
//  * click {who: 'US' | 'CN'} are the boxes' padlocks snapping shut (lockShut); the cancel key keeps 'click'
//  * the many quiet flyUp / absorb events of the race (gain < 0.6) become ONE granular texture (cardCloud)
//  * bursts of the same kind (throw, slap, slam) are thinned in level: gain * sqrt(N0 / n), n = how many in 0.5 s
export const DENSE = { throw: 4, slap: 4, slam: 2, flyUp: 3, absorb: 3 };
function thin(list, N0) {
  const ts = list.map((e) => e.t), g = new Float32Array(list.length);
  for (let i = 0, a = 0, b = 0; i < list.length; i++) {
    while (ts[a] < ts[i] - 0.25) a++;
    while (b < list.length && ts[b] < ts[i] + 0.25) b++;
    g[i] = Math.min(1, Math.sqrt(N0 / Math.max(1, b - a)));
  }
  return g;
}
export function prepareEvents(events, C, ROW) {
  const out = [], fly = [], abs = [], notes = [];
  let nClock = 0, nShut = 0;
  for (const e0 of events) {
    let e = e0;
    if (e.kind === 'tick' && e.who === 'clock') { e = { ...e, kind: 'oldClock', pitch: Math.round(e.t) & 1 }; nClock++; }
    else if (e.kind === 'click' && (e.who === 'US' || e.who === 'CN')) { e = { ...e, kind: 'lockShut' }; nShut++; }
    if ((e.kind === 'flyUp' || e.kind === 'absorb') && (e.gain ?? 1) < 0.6) { (e.kind === 'flyUp' ? fly : abs).push(e); continue; }
    out.push(e);
  }
  for (const [kind, N0] of Object.entries(DENSE)) {
    if (kind === 'flyUp' || kind === 'absorb') continue;
    const idx = []; out.forEach((e, i) => { if (e.kind === kind) idx.push(i); });
    idx.sort((a, b) => out[a].t - out[b].t);
    const g = thin(idx.map((i) => out[i]), N0); let n = 0;
    idx.forEach((i, j) => { if (g[j] < 1) { out[i] = { ...out[i], gain: (out[i].gain ?? 1) * g[j] }; n++; } });
    if (n) notes.push(`${kind}: ${n} thinned in bursts`);
  }
  if (fly.length + abs.length) {
    fly.sort((a, b) => a.t - b.t); abs.sort((a, b) => a.t - b.t);
    const gf = thin(fly, DENSE.flyUp), ga = thin(abs, DENSE.absorb), all = [...fly, ...abs];
    let t0 = Infinity, t1 = -Infinity; for (const e of all) { t0 = Math.min(t0, e.t); t1 = Math.max(t1, e.t + (e.dur || 1)); }
    out.push({ t: t0, kind: 'cardCloud', gain: 1, pan: 0, pitch: 0, dur: t1 - t0, size: 1, who: 'cloud', fly: fly.map((e, i) => [e.t, (e.gain ?? 1) * gf[i], e.pan ?? 0]), abs: abs.map((e, i) => [e.t, (e.gain ?? 1) * ga[i]]) });
    notes.push(`cardCloud: ${fly.length} flyUp + ${abs.length} absorb as one texture (${t0.toFixed(2)} .. ${t1.toFixed(2)})`);
  }
  if (nClock) notes.push(`tick {who: clock} -> oldClock x${nClock}`);
  if (nShut) notes.push(`click {who: US|CN} -> lockShut x${nShut}`);
  return { events: out.sort((a, b) => a.t - b.t), notes };
}

// ---- the score's own ambience events (M1 and the gold light). Each family is dropped as soon as the director's
// list has that kind in the range (he then owns it).
export function scoreEvents(C, ROW, events) {
  const E = [], has = (kind, a = 0, b = Infinity) => events.some((e) => e.kind === kind && e.t >= a && e.t < b);
  const ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, pan: 0, pitch: 0, dur: 0, size: 0.5, amb: true, ...o });
  // the old long-case clock: tick ... tock, once a second, from the black until the first card
  if (!has('oldClock')) for (let t = 0.5, k = 0; t < C.open - 0.1; t += 1.0, k++) ev(t, 'oldClock', { pitch: k % 2, gain: 0.5, pan: -0.3, who: 'clock' });
  // Google asleep on his chips: slow, heavy breaths (1-02, 1-03), the last one swallowed by the first card
  if (!has('breath', 0, C.code)) for (let t = ROW['1-02'].t0 + 0.3; t < C.open; t += 2.6) ev(t, 'breath', { dur: 2.0, gain: 0.55, size: 0.85, pan: 0.2, who: 'google' });
  // the gold light: a "vwoom" on the first card; and leaking out of each box on its first lock (unless the
  // picture's own 'leak' events are there)
  if (!has('glow')) {
    const first = events.find((e) => e.kind === 'slam' && e.t >= C.open - 0.5 && e.t < C.code);
    ev((first ? first.t : C.open) + 0.02, 'glow', { dur: 2.6, size: 1, who: 'open' });
    if (!has('leak')) for (const [a, b, pan] of [[C.unlockUS, C.giantUS, 0.3], [C.unlockCN, C.tiny, -0.3]]) {
      const d = events.find((e) => e.kind === 'lockDrop' && e.t >= a && e.t < b), t = d ? d.t + 0.12 : a + 1.3;
      ev(t, 'glow', { dur: 2.6, size: 0.6, pan: d ? d.pan ?? pan : pan, pitch: -2, who: 'leak' });
    }
  }
  return E;
}

function putEvent(G, e, sig, gain, send, choke, auto) {
  const s0 = Math.round(e.t * SR) - G.off, n = G.dry.n, stereo = !(sig instanceof Float32Array);
  const len = stereo ? sig.L.length : sig.length;
  let [gl, gr] = panGains(e.pan ?? 0);
  if (stereo) { gl *= Math.SQRT2; gr *= Math.SQRT2; if (sig.panned) gl = gr = 1; gl = Math.min(gl, 1.25); gr = Math.min(gr, 1.25); }
  // a hard cut in the picture chokes everything that started before it (8 ms)
  let cut = len;
  for (const h of choke) if (h > e.t && h < e.t + len / SR) cut = Math.min(cut, Math.round((h - e.t) * SR));
  // level automation (interpolated across 64-sample steps)
  const K = autoOf(auto, e, len), gAt = (i) => { let db = 0; for (const k of K) db += dbAt(k, e.t + i / SR); return Math.pow(10, db / 20); };
  const fo = Math.round(0.008 * SR), i0 = Math.max(0, -s0), i1 = Math.min(len, cut, n - s0);
  let a0 = K.length ? gAt(i0) : 1, a1 = a0;
  for (let i = i0; i < i1; i++) {
    if (K.length && ((i - i0) & 63) === 0) { a0 = gAt(i); a1 = gAt(i + 64); }
    const j = s0 + i, au = K.length ? a0 + (a1 - a0) * (((i - i0) & 63) / 64) : 1, f = (cut - i < fo ? (cut - i) / fo : 1) * au;
    const a = (stereo ? sig.L[i] : sig[i]) * gain * gl * f, b = (stereo ? sig.R[i] : sig[i]) * gain * gr * f;
    G.dry.L[j] += a; G.dry.R[j] += b; G.send.L[j] += a * send; G.send.R[j] += b * send;
  }
}

let warned = false;
// render a list of events into a (windowed) group; returns { counts, unknown } (unknown kinds are skipped,
// with one console warning per page). buildSfxG yields after every event.
export const buildSfx = (C, ROW, G, events, o) => drive(buildSfxG(C, ROW, G, events, o));
export function* buildSfxG(C, ROW, G, events, o = {}) {
  const scene = sceneOf(C, ROW), auto = levels(C, ROW), choke = o.choke ?? [], counts = o.counts ?? {}, unknown = o.unknown ?? {};
  for (let k = 0; k < events.length; k++) {
    const e = events[k], fn = SFX_KINDS[e.kind];
    if (!fn) { unknown[e.kind] = (unknown[e.kind] || 0) + 1; continue; }
    const gfn = SFX_GEN[e.kind], sig = gfn ? yield* gfn(e, 1000 + (e.seedIndex ?? 0) * 7) : fn(e, 1000 + (e.seedIndex ?? 0) * 7);
    const [g, send] = MIX[e.kind] ?? [1, 0.15], db = sceneDb(scene, e);
    putEvent(G, e, sig, g * (e.gain ?? 1) * Math.pow(10, db / 20), send, choke, auto);
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

// The organ (M10, M11): the machine room's hum turns into an organ-like drone for the new king. o.fAt(t) is its
// pitch in Hz (film seconds: it starts on the mains' 50 Hz and goes where the score sends it), o.regAt(t) 0..1 the
// registration (the upper ranks 8', 4', 2 2/3', 2' coming in), o.lvl(t) its level; two slightly detuned ranks
// breathe against each other, a little wind. Straight into L/R.
function organSetup(L, off, t0, t1, o = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(L.length, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  return { i0, i1, off, fAt: o.fAt ?? (() => 50), regAt: o.regAt ?? (() => 1), lvl: o.lvl ?? (() => 1), gain: o.gain ?? 0.01,
    RANK: [[1, 1, 0], [2, 0.6, 0.5], [3, 0.32, 1], [4, 0.36, 1.5], [6, 0.16, 2.2], [8, 0.18, 2.6], [10, 0.06, 3.2]],
    nz: new Noise(901), wind: new SVF(900, 0.8), dw: new Drift(902, 0.4), pA: 0, pB: 0, e: 0, f: 50, reg: 0 };
}
function organBlock(S, L, R, c0, c1) {
  const { i0, i1, off, fAt, regAt, lvl, gain, RANK, nz, wind, dw } = S;
  let pA = S.pA, pB = S.pB, e = S.e, f = S.f, reg = S.reg, de = S.de ?? 0;
  for (let i = c0; i < c1; i++) {
    const t = (i + off) / SR;
    if (((i - i0) & 63) === 0) { f = fAt(t); reg = regAt(t); if (i === i0) e = lvl(t) * gain; de = (lvl(t + 64 / SR) * gain - e) / 64; }
    e += de;
    pA += f / SR; pB += f * 1.0021 / SR; pA -= Math.floor(pA); pB -= Math.floor(pB);
    let a = 0, b = 0;
    for (const [k, amp, d] of RANK) { if (k * f > SR * 0.4) break; const w = k === 1 ? 1 : reg * smooth((reg * 4 - d * 0.4)); a += amp * w * Math.sin(TAU * k * pA); b += amp * w * Math.sin(TAU * k * pB + 0.7); }
    wind.run(nz.white());
    const v = (i1 - i < 256 ? (i1 - i) / 256 : 1) * Math.min(1, (i - i0) / 256);
    L[i] += (a * 0.7 + b * 0.3 + wind.bp * 0.04 * reg * (0.6 + 0.4 * dw.at(t))) * e * v; R[i] += (a * 0.3 + b * 0.7 + wind.bp * 0.04 * reg * (0.6 + 0.4 * dw.at(t + 5))) * e * v;
  }
  S.pA = pA; S.pB = pB; S.e = e; S.f = f; S.reg = reg; S.de = de;
}
export function organInto(L, R, off, t0, t1, o) { const S = organSetup(L, off, t0, t1, o); if (S) organBlock(S, L, R, S.i0, S.i1); }
export function* organIntoG(L, R, off, t0, t1, o) { const S = organSetup(L, off, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => organBlock(S, L, R, c0, c1)); }
export { put };
