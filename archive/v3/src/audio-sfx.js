// Sound department — the effects track and the ambience of the JOKERS WILD v3 reel 「批准」.
// 1. Every picture event from soundEvents() (owned by the director) is rendered with the synth for its kind
//    (audio-kinds.js; the v1/v2 kinds of audio-sfxlib.js still work), at the kind's mix level x the event's gain,
//    panned (from `who` when the event has no pan), sent to its room. prepareEvents shapes the director's list for
//    the mix: the eight lesser kings' stamps become the pile-driver BED, stamps on the bare map in the frenzy are
//    rendered as hits on cloth, the head kings' stamps learn how long they had to fall (gap), dense bursts thin out,
//    and the two VACUUMS are marked (the first stamp, 3-07's near miss: the stamp and the paper dive are solo).
// 2. The score's own ambience events (scoreEvents): the old clock, the giant's breathing over the red paper person,
//    the stamp handle's creak. Each family is dropped as soon as the director emits that kind.
// 3. The ambience proper: the 50 Hz room hum, and the organ the card king plays (audio.js schedules both).
// When soundEvents() is empty the reel runs on testEvents() (a stand-in list from the shot table).
// Nothing here hard-codes a film second: times come from CUES / ROW / SHOT / the events.
import { SR, TAU, Noise, Drift, SVF, Rng, panGains, smooth, clamp, put, BLOCK, drive } from './audio-dsp.js';
import { SFX_KINDS as V12_KINDS, SFX_GEN } from './audio-sfxlib.js';
import { REEL_KINDS, isUS } from './audio-kinds.js';

export const SFX_KINDS = { ...V12_KINDS, ...REEL_KINDS };
export { SFX_GEN };

// per-kind mix: [gain, room send, group]. Groups: 's' the effects room (RT60 1.3 s), 'b' the big room (RT60 3.2 s:
// the ant's-eye impacts, the AI's light), 'm' the music's war room (the music box). Solo events (the vacuums) go
// to their own uncarved group with the big room.
export const MIX = {
  stampHit: [1.0, 0.3, 'b'], stampMiss: [2.6, 0.3, 'b'], stampLift: [0.55, 0.08, 's'], cardSlide: [0.8, 0.1, 's'], cardFly: [0.75, 0.14, 's'],
  flock: [0.9, 0.3, 'b'], paperFall: [0.7, 0.06, 's'], paperStep: [0.55, 0.05, 's'], paperRun: [0.6, 0.06, 's'], paperWave: [0.7, 0.06, 's'],
  paperUp: [0.7, 0.06, 's'], handTouch: [1.08, 0.25, 'm'], jokerRise: [2.2, 0.35, 'b'], charge: [1.8, 0.2, 'b'], pair: [1.0, 0.4, 'b'],
  flood: [0.8, 0.35, 'b'], inhale: [2.4, 0.3, 'b'], flatten: [2.4, 0.22, 'b'], riffle: [1.6, 0.1, 's'], cardSnick: [1.4, 0.12, 's'],
  cardPlay: [3.6, 0.14, 's'], boardFlip: [0.9, 0.1, 's'], fingerDescend: [1.3, 0.35, 'b'], grunt: [0.65, 0.1, 's'], stampCreak: [1.0, 0.2, 's'],
  // v1 / v2 kinds the score or the director may still use
  oldClock: [0.9, 0.2, 's'], giantBreath: [1.3, 0.3, 'b'], press: [0.6, 0.15, 's'], breath: [1.6, 0.1, 's'], heart: [0.04, 0.04, 's'],
  tick: [0.5, 0.05, 's'], slap: [0.4, 0.08, 's'], whoosh: [0.8, 0.15, 's'], flaps: [0.8, 0.12, 's'], paper: [1.5, 0.1, 's'], glow: [1.0, 0.3, 'b'],
};
const mixOf = (k) => MIX[k] ?? [1, 0.15, 's'];
export const groupOf = (e) => (e.solo ? 'x' : mixOf(e.kind)[2]);

// the re-recording mix: dB by kind for events starting in a row (or a named range); the narrowest wins
export const SCENE = {
  cardSlide: { '2-01': 3, '4-01': 2 },
  cardFly: { '2-04': 3, '2-05': 1, '4-02': 3 },
  paperFall: { '2-04': 2, '3-07': 10 },
  paperRun: { '3-04': 6 },
  boardFlip: { '3-08': 8 },
  stampLift: { '2-04': 3, '2-05': 2 },
  stampMiss: { '4-01': 2 },
  stampHit: { '2-04': 4, '3-01': 4, '3-02': 4, '3-03': 4 },
  grunt: { '2-03': 0 },
};
// whole rows pulled back, all kinds but a few: { row: [dB, [kinds kept]] }
export const HUSH = {
  '4-03': [-40, ['flock', 'paperStep', 'paperUp', 'paperFall', 'paperWave', 'handTouch']], '4-04': [-40, ['flock', 'paperStep', 'paperUp', 'paperFall', 'paperWave', 'handTouch']],
  '4-05': [-40, ['flock', 'paperStep', 'paperUp', 'paperFall', 'paperWave', 'handTouch']], '4-06': [-40, ['flock', 'paperStep', 'paperUp', 'paperFall', 'paperWave', 'handTouch']],
};
// CHOKES: at these film times every effect that started earlier is cut (8 ms), except the kinds kept. 4-03: the
// sound is drained at once ("声音一下子抽空"), only the flock goes on.
export function chokes(C) { return [[C.river, new Set(['flock', 'paperStep', 'paperUp', 'handTouch'])]]; }
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
// level automation (dB over film time, linear between keys, held outside), per kind, optionally only for events
// starting in [from0, from1): [kind, [[t, dB], ...], from0?, from1?]
export function levels(C, ROW) {
  const A = [];
  // the flock: alone in the hole; under the jokers' drones; the river gone into the card king
  // 4-02: the few cards flying off past DeepSeek, close; 4-03: the full flock, far (the wide)
  A.push(['flock', [[C.unneeded, 0], [C.stare - 0.1, 0], [C.stare + 0.3, 15], [C.river - 0.02, 15], [C.river, 0], [C.hands, 0], [C.hands + 0.5, -6], [C.moons, -6], [C.moons + 0.3, 0], [C.moons + 0.6, -4], [C.charge, -6], [C.charge + 0.8, -12], [C.pair, -16], [C.king, -18]]]);
  // the jokers' glow under the drones, louder as they charge
  A.push(['jokerRise', [[C.moons, 0], [C.standUp, 1], [C.charge, 3]]]);
  return A;
}
function autoOf(A, e, len) {
  const out = [], t1 = e.t + len / SR;
  for (const [kind, keys, f0, f1] of A) if (kind === e.kind && (f0 === undefined || (e.t >= f0 && e.t < f1)) && keys[0][0] < t1) out.push(keys);
  return out;
}
const dbAt = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, x] = keys[i - 1], [b, y] = keys[i]; return x + (y - x) * (t - a) / Math.max(1e-9, b - a); } return keys[keys.length - 1][1]; };

// ---- pans: the events carry none. CN kings on the left, US on the right (the table seen from its foot); the two
// head kings nearer the middle, the eight others wider; the biggest stamp dead centre (it is on top of us).
const HEAD = new Set(['deepseek', 'openai']);
const CN_KINGS = new Set(['deepseek', 'qwen', 'kimi', 'glm', 'doubao', 'CN', 'red']);
export function panOf(e) {
  if (e.pan !== undefined) return e.pan;
  const w = e.who;
  if (w === undefined || w === null) return 0;
  if (w === 'red') return -0.25;
  if (w === 'blue') return e.far ? 0.5 : 0.3;
  const side = isUS(w) ? 1 : CN_KINGS.has(w) ? -1 : 0;
  if (!side) return 0;
  const p = side * (HEAD.has(w) ? 0.32 : w === 'CN' || w === 'US' ? 0.55 : 0.68);
  return (e.size ?? 0) >= 0.95 ? p * 0.3 : p;
}

// ---- the director's list, prepared for the mix (documented in docs/SOUND.md)
export const DENSE = { stampBed: 4, cardSlide: 3, cardFly: 3, stampLift: 3 };
function thin(list, N0) {
  const ts = list.map((e) => e.t), g = new Float32Array(list.length);
  for (let i = 0, a = 0, b = 0; i < list.length; i++) {
    while (ts[a] < ts[i] - 0.25) a++;
    while (b < list.length && ts[b] < ts[i] + 0.25) b++;
    g[i] = Math.min(1, Math.sqrt(N0 / Math.max(1, b - a)));
  }
  return g;
}
const isStamp = (e) => e.kind === 'stampHit' || e.kind === 'stampMiss';
export function prepareEvents(events, C, ROW) {
  const notes = [];
  let out = events.map((e) => ({ ...e, gain: e.gain ?? 1 }));
  // the eight lesser kings' stamps (gain < 1): the pile-driver bed (hits and map-stamps alike)
  let nBed = 0, nCloth = 0;
  out = out.map((e) => {
    if (!isStamp(e)) return e;
    if (e.gain < 0.95) { nBed++; return { ...e, kind: 'stampHit', bed: true, size: e.size ?? 0.55 }; }
    // a head king's stamp on the bare map before the stamps stop mattering: a hit on cloth (the hollow miss is 4-01's)
    if (e.kind === 'stampMiss' && e.t < C.unneeded - 0.05) { nCloth++; return { ...e, kind: 'stampHit', cloth: true }; }
    return e;
  });
  // how long each head stamp had to fall (its pre-roll can't reach back past the previous one)
  const heads = out.filter((e) => isStamp(e) && !e.bed).sort((a, b) => a.t - b.t);
  heads.forEach((e, i) => { e.gap = i ? e.t - heads[i - 1].t : 10; });
  // the vacuums: the first big stamp (size >= 0.95) and the near miss (wild): the stamp and any paper fall in its
  // fall window are solo (their own uncarved group); audio.js carves everything else over the window
  const vac = [];
  for (const e of heads) if ((e.size ?? 0) >= 0.95 || e.wild) { e.solo = true; e.gap = 10; vac.push(e); }   // a full fall
  for (const v of vac) for (const e of out) if ((e.kind === 'paperFall' || e.kind === 'paperStep') && e.t >= v.t - 0.45 && e.t <= v.t + 0.05) e.solo = true;
  // the hole (4-03 ..): the flock and the paper people are all that is left; they survive the drain
  for (const e of out) if (e.kind === 'flock' || (/^paper/.test(e.kind) && e.t >= C.river - 0.05 && e.t < C.moons)) e.solo = true;
  // the first card out of a press (2-01, from the ant: a wall coming) and the cards of 4-01 (the press runs itself):
  // the press's clack first; sizes by point of view
  for (const e of out) {
    if (e.kind === 'cardSlide') { const first = e.t < C.read; if (e.size === undefined) e.size = first ? 1 : 0.35; if (e.clack === undefined) e.clack = first ? 1 : (e.t >= C.unneeded && e.t < C.stare ? 0.7 : 0); }
    if (e.kind === 'cardFly' && e.size === undefined) e.size = e.t < C.faster ? 0.9 : e.self ? 0.7 : 0.4;
    if (e.kind === 'paperWave' && e.far) e.gain *= 0.8;
  }
  // bursts thinned in level: gain * sqrt(N0 / n), n = how many of the kind within 0.5 s
  for (const [kind, N0] of Object.entries(DENSE)) {
    const L = out.filter((e) => (kind === 'stampBed' ? e.bed : e.kind === kind && !e.bed)).sort((a, b) => a.t - b.t);
    const g = thin(L, N0); let n = 0;
    L.forEach((e, j) => { if (g[j] < 1) { e.gain *= g[j]; n++; } });
    if (n) notes.push(`${kind}: ${n} of ${L.length} thinned in bursts`);
  }
  for (const e of out) e.pan = panOf(e);
  if (nBed) notes.push(`the pile-driver bed: ${nBed} stamps of the eight lesser kings`);
  if (nCloth) notes.push(`${nCloth} head-king stamps on the bare map (before 4-01) rendered as hits on cloth`);
  if (vac.length) notes.push(`vacuums before ${vac.map((v) => v.t.toFixed(2)).join(', ')} (solo: ${out.filter((e) => e.solo).map((e) => e.kind).join(', ')})`);
  return { events: out.sort((a, b) => a.t - b.t), notes, vacuums: vac.map((v) => [v.t, v]) };
}

// ---- the score's own ambience events (R1 / R2). Each family is dropped as soon as the director's list has that kind.
export function scoreEvents(C, ROW, events) {
  const E = [], has = (kind) => events.some((e) => e.kind === kind);
  const ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, pan: 0, pitch: 0, dur: 0, size: 0.5, amb: true, ...o });
  const first = events.find((e) => isStamp(e) && (e.size ?? 0) >= 0.95) ?? events.find(isStamp), tHit = first ? first.t : C.stamp1 + 0.5;
  // the old long-case clock, far off in the dark: tick ... tock, once a second, until the stamp starts to fall
  if (!has('oldClock')) for (let t = 0.45, k = 0; t < tHit - 0.75; t += 1.0, k++) ev(t, 'oldClock', { pitch: k % 2, gain: 0.55, pan: -0.35, who: 'clock' });
  // the giant leaning over the red paper person: his breath from high above (1-03), again while he reads (2-02)
  if (!has('giantBreath')) {
    ev(ROW['1-03'].t0 + 0.2, 'giantBreath', { dur: 2.9, gain: 0.9, size: 0.9, who: 'CN', pan: 0.05 });
    ev(ROW['2-02'].t0 + 0.1, 'giantBreath', { dur: 2.4, gain: 0.5, size: 0.6, who: 'CN', pan: 0.05 });
  }
  // the stamp handle tightening in his grip ("吱"), late in 1-03 as the stamp comes into view
  if (!has('stampCreak')) ev(ROW['1-03'].t0 + 1.9, 'stampCreak', { dur: 0.6, size: 0.9, gain: 0.9, pan: 0.1 });
  return E;
}

// ---- a stand-in picture list from the shot table, for when soundEvents() is empty (and for `--test`)
export function testEvents(C, ROW, SHOT) {
  const E = [], ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, ...o }), at = (id, k = 0) => ROW[id].t0 + k;
  ev(at('1-02', 1.45), 'paperWave', { who: 'red' }); ev(at('1-02', 2.45), 'paperWave', { who: 'blue', far: true });
  ev(at('2-01', 0.15), 'cardSlide', { who: 'deepseek', dur: 0.8 });
  ev(at('2-04', 0.55), 'stampHit', { who: 'deepseek', size: 1, pov: 'ant' }); ev(at('2-04', 0.57), 'paperFall', { who: 'red' });
  ev(at('2-04', 0.64), 'stampLift', { who: 'deepseek', gain: 0.6 }); ev(at('2-04', 1.1), 'cardFly', { who: 'deepseek' });
  ev(at('2-05', 0.45), 'stampHit', { who: 'openai', size: 0.8, pov: 'ant' }); ev(at('2-05', 0.47), 'paperFall', { who: 'blue', gain: 0.7 }); ev(at('2-05', 0.75), 'cardFly', { who: 'openai' });
  // the race: DeepSeek on the beat, OpenAI answering, the beat tightening from 0.5 s to 0.17 s; the bed from 3-04
  const t0 = at('3-01', 0.4), tW = at('3-07', 0.42), tD = at('3-08', 0.6);
  for (let t = t0, d = 0.5, k = 0; t < tD - 0.05; t += d, d = Math.max(0.17, d * 0.95), k++) {
    if (Math.abs(t - tW) < d * 0.6) continue;
    const ant = t >= at('3-04') && t < at('3-05') || t >= at('3-06') && t < at('3-08');
    ev(t, 'stampHit', { who: 'deepseek', size: 0.8, pov: ant ? 'ant' : 'high' }); ev(t + Math.min(0.09, d * 0.45), 'stampHit', { who: 'openai', size: 0.8, pov: ant ? 'ant' : 'high' });
    ev(t - 0.25, 'cardSlide', { who: 'deepseek', dur: 0.24 }); ev(t + 0.09, 'cardFly', { who: 'deepseek' }); ev(t + 0.09, 'stampLift', { who: 'deepseek', gain: 0.6 });
  }
  const KS = ['qwen', 'kimi', 'glm', 'doubao', 'anthropic', 'google', 'xai', 'meta'], r = new Rng(77);
  for (let t = at('3-04', 0.2); t < tD; t += r.range(0.03, 0.09)) if (Math.abs(t - tW) > 0.35) ev(t, r.next() < 0.5 ? 'stampHit' : 'stampMiss', { who: r.pick(KS), size: 0.55, pov: r.next() < 0.6 ? 'ant' : 'high', gain: 0.5 });
  ev(at('3-04'), 'paperRun', { who: 'red', dur: ROW['3-04'].t1 - ROW['3-04'].t0 });
  ev(tW - 0.06, 'paperFall', { who: 'red', dive: true }); ev(tW, 'stampHit', { who: 'deepseek', size: 0.8, pov: 'ant', wild: true });
  [0.05, 0.3, 0.55].forEach((k) => ev(at('3-08', k), 'boardFlip', { n: 6 }));
  ev(at('4-01', 0.05), 'cardSlide', { who: 'deepseek', dur: 0.35 }); ev(at('4-01', 0.4), 'cardFly', { who: 'deepseek', self: true });
  ev(at('4-01', 0.85), 'stampMiss', { who: 'deepseek', size: 0.8, pov: 'high' }); ev(at('4-01', 1.04), 'stampLift', { who: 'deepseek', gain: 0.6 });
  [0.1, 0.5, 0.9].forEach((k) => ev(at('4-02', k), 'cardFly', { who: 'deepseek', self: true }));
  ev(at('4-01', 0.5), 'flock', { dur: C.king + 1.6 - at('4-01', 0.5), density: 0.3, rise: C.river });
  ev(at('4-04', 0.25), 'paperUp', { who: 'red' });
  for (let i = 0; i < 4; i++) ev(at('4-04', 0.95 + 0.42 * i), 'paperStep', { who: 'red', i });
  for (let i = 0; i < 3; i++) ev(at('4-05', 0.05 + 0.42 * i), 'paperStep', { who: 'blue', i });
  for (let i = 0; i < 3; i++) { ev(at('4-06', 0.05 + 0.4 * i), 'paperStep', { who: 'red', i }); ev(at('4-06', 0.2 + 0.4 * i), 'paperStep', { who: 'blue', i }); }
  ev(at('4-06', 1.62), 'handTouch');
  ev(C.moons, 'jokerRise', { who: 'CN', dur: C.faceoff - C.moons }); ev(C.moons + 0.15, 'jokerRise', { who: 'US', dur: C.faceoff - C.moons - 0.15 });
  ev(C.charge, 'charge', { dur: C.faceoff - C.charge }); ev(C.pair + 0.5, 'pair'); ev(C.flood, 'flood', { dur: C.king - C.flood });
  ev(C.king + 0.1, 'inhale', { dur: 2 });
  ev(at('6-02', 0.55), 'flatten', { who: 'deepseek' }); ev(at('6-02', 1.05), 'flatten', { who: 'openai' });
  KS.forEach((w, i) => ev(at('6-03', 0.1) + 0.8 * (1 - Math.pow(0.82, i)) / 0.18 * 0.18, 'flatten', { who: w, gain: 0.7 }));
  ev(at('6-03', 0.4), 'riffle', { dur: 1.2 }); ev(at('6-05', 0.15), 'fingerDescend', { dur: 1.5 });
  ev(at('6-06', 0.3), 'cardSnick'); ev(at('6-07', 0.35), 'cardPlay', { size: 1 }); ev(at('6-07', 0.85), 'cardPlay', { size: 0.8, cover: true });
  return E.sort((a, b) => a.t - b.t);
}

// ---- one event into its group: pre-roll (sig.pre), pan, level automation, chokes, ducks
function putEvent(G, e, sig, gain, send, chk, auto) {
  const stereo = !(sig instanceof Float32Array), len = stereo ? sig.L.length : sig.length, pre = stereo ? sig.pre ?? 0 : 0, tS = e.t - pre;
  const s0 = Math.round(tS * SR) - G.off, n = G.dry.n;
  let [gl, gr] = panGains(e.pan ?? 0);
  if (stereo) { gl *= Math.SQRT2; gr *= Math.SQRT2; if (sig.panned) gl = gr = 1; gl = Math.min(gl, 1.25); gr = Math.min(gr, 1.25); }
  let cut = len;
  for (const [h, keep] of chk) if (h > tS && h < tS + len / SR && !keep.has(e.kind)) cut = Math.min(cut, Math.round((h - tS) * SR));
  const K = autoOf(auto, e, len), gAt = (i) => { let db = 0; for (const k of K) db += dbAt(k, tS + i / SR); return Math.pow(10, db / 20); };
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
// render a list of events into the chunk's groups { s, b, m, x } (windowed); buildSfxG yields after every event
export const buildSfx = (C, ROW, groups, events, o) => drive(buildSfxG(C, ROW, groups, events, o));
export function* buildSfxG(C, ROW, groups, events, o = {}) {
  const scene = sceneOf(C, ROW), auto = levels(C, ROW), chk = o.chokes ?? chokes(C), counts = o.counts ?? {}, unknown = o.unknown ?? {};
  for (let k = 0; k < events.length; k++) {
    const e = events[k], fn = SFX_KINDS[e.kind];
    if (!fn) { unknown[e.kind] = (unknown[e.kind] || 0) + 1; continue; }
    const gfn = SFX_GEN[e.kind], sig = gfn ? yield* gfn(e, 1000 + (e.seedIndex ?? 0) * 7) : fn(e, 1000 + (e.seedIndex ?? 0) * 7);
    const [g, send] = mixOf(e.kind), db = sceneDb(scene, e), G = groups[groupOf(e)] ?? groups.s;
    putEvent(G, e, sig, g * (e.gain ?? 1) * Math.pow(10, db / 20), send, chk, auto);
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    yield (k + 1) / events.length;
  }
  const unk = Object.entries(unknown);
  if (unk.length && !warned && typeof console !== 'undefined') { console.warn(`audio: skipped unknown sound-event kinds: ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`); warned = true; }
  return { counts, unknown };
}

// ============================================================ ambience
// The room's hum: 50 Hz mains with faint 100 / 150 Hz and a little 200 / 250, a slow drift, a breath of dark room
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
