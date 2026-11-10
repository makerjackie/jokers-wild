// Sound department — the effects track and the ambience of 《喂》 FEED (v5) (docs/SOUND.md).
// 1. Every picture event from soundEvents() (owned by the director) is rendered with the synth for its kind
//    (audio-kinds.js FILM_KINDS), at the kind's mix level x the event's gain x the row's SCENE dB, panned from `who`
//    (heart = the red king, left; spade = the black king, right; their machines with them), sent to its room.
//    prepareEvents shapes the list for the mix: the two VACUUMS (the slap that kills the ant, the last card), the big
//    machines sent to the hall, 4-07 muffled (his hand on his own crown: only distant low taks).
// 2. The score's own ambience (scoreEvents): the robe as the toy comes out from under the table (2-04).
// 3. The lamp's hum (audio.js schedules it).
// When soundEvents() is empty the film runs on testEvents() (a small stand-in).
// Nothing here hard-codes a film second: times come from CUES / ROW / the events.
import { SR, TAU, Noise, Drift, SVF, Rng, panGains, smooth, clamp, put, BLOCK, drive } from './audio-dsp.js';
import { SFX_KINDS as V12_KINDS, SFX_GEN as V12_GEN } from './audio-sfxlib.js';
import { V3_KINDS, FILM_KINDS, FILM_GEN, SCORE_KINDS, isUS, preOf } from './audio-kinds.js';

export const SFX_KINDS = { ...V12_KINDS, ...V3_KINDS, ...SCORE_KINDS, ...FILM_KINDS };
export const SFX_GEN = { ...V12_GEN, ...FILM_GEN };

// per-kind mix: [gain, room send, group]. Groups: 's' the effects room, 'b' the big room (the hall; the ant's-eye
// impacts; the mountains), 'm' the music's room. Solo events (the vacuums) go to their own uncarved group.
export const MIX = {
  antStep: [0.55, 0.05, 's'], cardWhoosh: [0.5, 0.1, 's'], cardSlap: [0.8, 0.14, 's'], crumbRoll: [0.6, 0.05, 's'], lampSwing: [0.6, 0.22, 'b'], chuckle: [0.45, 0.1, 's'],
  thud: [0.9, 0.2, 's'], clockwork: [0.22, 0.06, 's'], rundown: [0.4, 0.1, 's'], tak: [0.6, 0.16, 's'], slabLand: [0.7, 0.2, 's'], pat: [0.6, 0.08, 's'],
  chipDrop: [0.55, 0.12, 's'], crownLift: [0.7, 0.2, 's'], crownDrop: [0.7, 0.2, 's'], gulp: [0.8, 0.15, 's'], creak: [0.8, 0.2, 's'],
  burst: [1.0, 0.35, 'b'], grow: [0.8, 0.3, 'b'], cheer: [0.6, 0.25, 'b'], pressure: [0.6, 0.2, 'b'], endSlam: [1.7, 0.32, 'b'], ringRoll: [0.8, 0.15, 's'],
  cloth: [0.5, 0.08, 's'], footDown: [0.6, 0.12, 's'],
};
const mixOf = (k) => MIX[k] ?? [1, 0.15, 's'];
const ANT_BIG = new Set(['cardSlap', 'cardWhoosh']);
export const groupOf = (e) => (e.solo ? 'x' : e.group ?? (e.pov === 'ant' && ANT_BIG.has(e.kind) ? 'b' : mixOf(e.kind)[2]));

// the re-recording mix: dB by kind for events starting in a row; tuned by measurement against shots.txt's column 9
export const SCENE = {
  cardSlap: { '1-05': 2, '1-07': 8, '2-01': 8 },
  thud: { '2-04': 6, '3-01': 6 },
  tak: { '2-05': 12, '2-06': 6, '3-01': 8, '3-02': 6, '3-03': 4, '3-04': 6, '4-01': 4, '4-02': 4, '4-07': -14, '5-03': -22, '5-04': -12, '6-03': -34, '6-04': -8, '8-05': -9 },
  slabLand: { '2-05': 8, '2-06': 4, '3-01': 6, '3-02': 5, '3-03': 3, '3-04': 5, '4-01': 3, '4-02': 3, '4-07': -18, '5-03': -14, '5-04': -12, '5-05': -6, '6-04': -12 },
  lampSwing: { '4-07': -30 },
  rundown: { '5-03': -12, '5-04': -6 },
  cheer: { '5-03': -4 },
  pressure: { '6-01': 7 },
  ringRoll: { '6-03': -9 },
  pat: { '2-05': 6 },
  gulp: { '3-04': 4, '4-01': 3, '4-02': 3 },
  chipDrop: { '3-04': 4, '4-01': 3, '4-02': 3 },
};
export const HUSH = {};
// CHOKES: [film time, kinds kept, fade s]: every effect that started earlier is cut there, except the kinds kept
export function chokes(C, events = []) {
  const end = events.find((e) => e.kind === 'endSlam');
  return end ? [[end.t, new Set(['endSlam', 'lampSwing']), 0.006]] : [];
}
function sceneOf(C, ROW) {
  const out = {}, rangeOf = (id) => (ROW[id] ? [ROW[id].t0, ROW[id].t1] : null);
  for (const [kind, T] of Object.entries(SCENE)) {
    out[kind] = [];
    for (const [id, db] of Object.entries(T)) { const r = rangeOf(id); if (r) out[kind].push([r[0], r[1], db]); }
    out[kind].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  }
  out['*'] = [];
  for (const [id, [db, keep]] of Object.entries(HUSH)) { const r = rangeOf(id); if (r) out['*'].push([r[0], r[1], db, new Set(keep)]); }
  return out;
}
function sceneDb(S, e) {
  let db = 0;
  const T = S[e.kind];
  if (T) for (const [a, b, d] of T) if (e.t >= a && e.t < b) { db = d; break; }
  for (const [a, b, d, keep] of S['*']) if (e.t >= a && e.t < b && !keep.has(e.kind)) { db += d; break; }
  return db;
}
// level automation (dB over film time), per kind: [kind, [[t, dB], ...], from0?, from1?]
export function levels(C, ROW) {
  // the spring's ratchet sinks under the music as the machines grow
  return [['clockwork', [[C['3-01'], 0], [C['4-02'], -6], [C['4-06'], -14]]]];
}
function autoOf(A, e, len) {
  const out = [], t1 = e.t + len / SR;
  for (const [kind, keys, f0, f1] of A) if (kind === e.kind && (f0 === undefined || (e.t >= f0 && e.t < f1)) && keys[0][0] < t1) out.push(keys);
  return out;
}
const dbAt = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, x] = keys[i - 1], [b, y] = keys[i]; return x + (y - x) * (t - a) / Math.max(1e-9, b - a); } return keys[keys.length - 1][1]; };

// ---- pans: heart (the red king and his machine) left, spade right, seen from the table's foot
export function panOf(e) {
  if (e.pan !== undefined) return e.pan;
  if (e.who === 'heart') return -0.35;
  if (e.who === 'spade') return 0.35;
  return 0;
}

// the vacuums: the slap that kills the ant (the first cardSlap from the ant's eye) and the last card
export function findVacuums(events) {
  const ant = events.filter((e) => e.kind === 'cardSlap' && e.pov === 'ant').sort((a, b) => a.t - b.t)[0];
  return [ant, events.find((e) => e.kind === 'endSlam')].filter(Boolean);
}
export function prepareEvents(events, C, ROW) {
  const notes = [], out = events.map((e) => ({ ...e, gain: e.gain ?? 1 }));
  // the vacuums: the hit and what brings it are solo (their own uncarved group): the whoosh; under the last card the
  // air pressing down and the red king still cheering. audio.js carves everything else over the hit's pre-roll.
  const vac = findVacuums(out);
  for (const v of vac) {
    v.solo = true;
    for (const e of out) {
      if (e.kind === 'cardWhoosh' && e.t < v.t && e.t + (e.dur || 0.35) > v.t - preOf(v) - 0.05 && e.t > v.t - 1.5) e.solo = true;
      if (v.kind === 'endSlam' && (e.kind === 'pressure' || e.kind === 'cheer') && e.t < v.t && e.t + (e.dur || 0) > v.t - 0.5) e.solo = true;
    }
  }
  // 4-07 (his hand on his own crown): everything is far away and dull
  const h0 = ROW['4-07'].t0, h1 = ROW['4-08'].t0; let nM = 0;
  for (const e of out) if (e.t >= h0 && e.t < h1) { e.muff = 220; nM++; }
  if (nM) notes.push(`4-07: ${nM} events muffled (220 Hz) and pulled far back`);
  // 5-03 (from high above): the mountains' taks are small from up here
  for (const e of out) if (e.t >= ROW['5-03'].t0 && e.t < ROW['5-04'].t0 && (e.kind === 'tak' || e.kind === 'slabLand')) e.muff = 900;
  // 6-03 (the ring): the machine goes on, far above
  for (const e of out) if (e.t >= ROW['6-03'].t0 && e.t < ROW['6-04'].t0 && e.kind === 'tak') e.muff = 400;
  for (const e of out) {
    if ((e.kind === 'tak' && (e.size ?? 0) >= 2) || (e.kind === 'slabLand' && ((e.size ?? 0) >= 5 || e.far))) e.group = 'b';   // the hall
    if (e.kind === 'antStep' && e.variant === undefined) e.variant = ((Math.round(e.t * 1000) * 5 + 3) % 8 + 8) % 8;
    e.pan = panOf(e) * (e.kind === 'tak' && (e.size ?? 0) >= 10 ? 0.5 : 1);
  }
  if (vac.length) notes.push(`vacuums before ${vac.map((v) => `${v.kind} ${v.t.toFixed(2)}`).join(', ')} (solo: ${out.filter((e) => e.solo).map((e) => e.kind).join(', ')})`);
  return { events: out.sort((a, b) => a.t - b.t), notes, vacuums: vac.map((v) => [v.t, v]) };
}

// ---- the score's own ambience events (dropped when the director's list has the kind there)
export function scoreEvents(C, ROW, events) {
  const E = [], has = (kind, a, b) => events.some((e) => e.kind === kind && e.t >= a && e.t < b);
  // 2-04: the red king reaches under the table: his robe
  if (!has('cloth', ROW['2-04'].t0, ROW['2-05'].t0)) E.push({ t: ROW['2-04'].t0 + 0.35, kind: 'cloth', dur: 1.3, gain: 1.6, pan: -0.35, amb: true });
  return E;
}

// ---- a small stand-in picture list for when soundEvents() is empty (and for `--test`)
export function testEvents(C, ROW) {
  const E = [], ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, ...o }), at = (id, k = 0) => ROW[id].t0 + k;
  for (let t = 0.3; t < at('1-05', 0.9); t += 0.106) ev(t, 'antStep', { surface: 'cloth', gain: Math.min(1, t / 1.5) });
  ev(at('1-05', 0.6), 'cardWhoosh', { who: 'heart', dur: 0.35 }); ev(at('1-05', 0.95), 'cardSlap', { who: 'heart', size: 1, hard: 1, pov: 'ant' });
  for (let t = at('2-05', 1.2), i = 0; t < at('4-07'); t += 0.6, i++) { const s = 0.3 * Math.pow(1.07, i); ev(t, 'tak', { who: i % 2 ? 'spade' : 'heart', size: +s.toFixed(2), gain: 0.8 }); ev(t + 0.45, 'slabLand', { who: i % 2 ? 'spade' : 'heart', size: +(s * 3).toFixed(2), gain: 0.8 }); }
  ev(at('5-01', 1.1), 'burst', { dur: 2.4 });
  for (let t = at('5-01', 4.5); t < at('6-01'); t += 1.35) ev(t, 'tak', { who: 'heart', size: 30, gain: 0.8 });
  ev(at('6-02', 1.5), 'endSlam');
  return E.sort((a, b) => a.t - b.t);
}

// a low-passed copy of a signal (4-07, 5-03: far away): mono or stereo, keeps pre / panned
function muffled(sig, fc) {
  const f = (x) => { const a = new SVF(fc, 0.6), b = new SVF(fc, 0.6), o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = b.run(a.run(x[i])); return o; };
  if (sig instanceof Float32Array) { const o = f(sig); if (sig.pre) o.pre = sig.pre; return o; }
  return { ...sig, L: f(sig.L), R: f(sig.R) };
}

// ---- one event into its group: pre-roll (sig.pre), pan, level automation, chokes
function putEvent(G, e, sig, gain, send, chk, auto) {
  const stereo = !(sig instanceof Float32Array), len = stereo ? sig.L.length : sig.length, pre = sig.pre ?? 0, tS = e.t - pre;
  const s0 = Math.round(tS * SR) - G.off, n = G.dry.n;
  let [gl, gr] = panGains(e.pan ?? 0);
  if (stereo) { gl *= Math.SQRT2; gr *= Math.SQRT2; if (sig.panned) gl = gr = 1; gl = Math.min(gl, 1.25); gr = Math.min(gr, 1.25); }
  let cut = len, cf = 0.008;
  for (const [h, keep, fd] of chk) if (h > tS && h < tS + len / SR && !keep.has(e.kind)) { const c = Math.round((h - tS) * SR); if (c < cut) { cut = c; cf = fd ?? 0.008; } }
  const K = autoOf(auto, e, len), gAt = (i) => { let db = 0; for (const k of K) db += dbAt(k, tS + i / SR); return Math.pow(10, db / 20); };
  const fo = Math.max(1, Math.round(cf * SR)), i0 = Math.max(0, -s0), i1 = Math.min(len, cut, n - s0);
  let a0 = K.length ? gAt(i0) : 1, a1 = a0;
  for (let i = i0; i < i1; i++) {
    if (K.length && ((i - i0) & 63) === 0) { a0 = gAt(i); a1 = gAt(i + 64); }
    const j = s0 + i, au = K.length ? a0 + (a1 - a0) * (((i - i0) & 63) / 64) : 1, f = (cut - i < fo ? (cut - i) / fo : 1) * au;
    const a = (stereo ? sig.L[i] : sig[i]) * gain * gl * f, b = (stereo ? sig.R[i] : sig[i]) * gain * gr * f;
    G.dry.L[j] += a; G.dry.R[j] += b; G.send.L[j] += a * send; G.send.R[j] += b * send;
  }
}

let warned = false;
// render a list of events into the chunk's groups { s, b, m, x } (windowed); buildSfxG yields after every event
export const buildSfx = (C, ROW, groups, events, o) => drive(buildSfxG(C, ROW, groups, events, o));
export function* buildSfxG(C, ROW, groups, events, o = {}) {
  const scene = sceneOf(C, ROW), auto = levels(C, ROW), chk = o.chokes ?? chokes(C, events), counts = o.counts ?? {}, unknown = o.unknown ?? {};
  for (let k = 0; k < events.length; k++) {
    const e = events[k], fn = SFX_KINDS[e.kind];
    if (!fn) { unknown[e.kind] = (unknown[e.kind] || 0) + 1; continue; }
    const [g, send] = mixOf(e.kind), db = sceneDb(scene, e), G = groups[groupOf(e)] ?? groups.s;
    if (g * (e.gain ?? 1) > 0) {
      const gfn = SFX_GEN[e.kind], sig = gfn ? yield* gfn(e, 1000 + (e.seedIndex ?? 0) * 7) : fn(e, 1000 + (e.seedIndex ?? 0) * 7);
      putEvent(G, e, e.muff ? muffled(sig, e.muff) : sig, g * (e.gain ?? 1) * Math.pow(10, db / 20), send, chk, auto);
    }
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    yield (k + 1) / events.length;
  }
  const unk = Object.entries(unknown);
  if (unk.length && !warned && typeof console !== 'undefined') { console.warn(`audio: skipped unknown sound-event kinds: ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`); warned = true; }
  return { counts, unknown };
}

// ============================================================ ambience
// The lamp's hum: 50 Hz mains with faint 100 / 150 Hz and a little 200 / 250, a slow drift, a breath of dark room
// tone. Written straight into the (windowed) L/R. Plain block functions, run straight or BLOCK by BLOCK (identical).
function* inBlocks(i0, i1, run) {
  for (let c0 = i0; c0 < i1; c0 += BLOCK) { const c1 = Math.min(i1, c0 + BLOCK); run(c0, c1); yield (c1 - i0) / Math.max(1, i1 - i0); }
}
function humSetup(L, off, t0, t1, o = {}) {
  const lvl = o.level ?? 0.01, lvlAt = o.lvlAt ?? (() => 1), i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(L.length, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  const P = 2048, H = [[1, 1, 0], [2, 0.3, 0.7], [3, 0.17, 1.9], [4, 0.05, 0.4], [5, 0.035, 2.6], [6, 0.018, 1.1]];
  const wL = new Float32Array(P + 1), wR = new Float32Array(P + 1);
  for (let i = 0; i <= P; i++) { const x = TAU * i / P; for (const [k, a, p] of H) { wL[i] += a * Math.sin(k * x + p); wR[i] += a * Math.sin(k * x + p + (k === 2 ? 0.35 : k === 3 ? -0.2 : 0)); } }
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
  let ph = S.ph, a = S.a, inc = S.inc, da = S.da ?? 0;
  for (let i = c0; i < c1; i++) {
    if (((i - i0) & 127) === 0) { const t = (i + off) / SR, tn = (i + 128 + off) / SR; const a1 = (1 + 0.08 * dA.at(tn)) * lvlAt(tn); if (i === i0) a = (1 + 0.08 * dA.at(t)) * lvlAt(t); da = (a1 - a) / 128; inc = 50 * (1 + 0.0005 * dF.at(t)) * P / SR; }
    a += da; ph += inc; if (ph >= P) ph -= P;
    const j = ph | 0, fr = ph - j, q = (i + off) % nl;
    const e = (i - i0 < fi ? (i - i0) / fi : 1) * (i1 - i < fo ? (i1 - i) / fo : 1) * lvl * a;
    L[i] += (wL[j] + (wL[j + 1] - wL[j]) * fr + nL[q]) * e; R[i] += (wR[j] + (wR[j + 1] - wR[j]) * fr + nR[q]) * e;
  }
  S.ph = ph; S.a = a; S.inc = inc; S.da = da;
}
export function humInto(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) humBlock(S, L, R, S.i0, S.i1); }
export function* humIntoG(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => humBlock(S, L, R, c0, c1)); }
export { put, clamp, smooth, Rng };
