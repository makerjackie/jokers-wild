// Sound department — the soundtrack of 《喂》 FEED (v5) (docs/SOUND.md).
// renderScore(SR) synthesizes the whole film's mix in pure JS (no samples, no Web Audio nodes), deterministic (seeded
// noise only: no Math.random, no clock) and identical in Node and the browser. renderScoreAsync renders the same
// samples without blocking the page. Every time hangs off CUES / ROW or off the picture's sound events (soundEvents(),
// owned by the director); when that list is empty the film runs on testEvents().
//
// The film is rendered in CHUNKS (one per cue, R4 and R6 split where the sound drops out). Each chunk has four groups:
//   music (audio-music.js: SCORE[chunk]) -> music room;  effects -> effects room;  big (the hall, the ant's-eye
//   impacts, the mountains) -> big room;  solo (the vacuums' hits and what brings them) -> big room, never carved
// carved after the rooms (the vacuums), faded where the picture drops to silence (4-07, 6-03), summed.
//   + the lamp's hum (50 Hz; with the picture, gone in the vacuums, gone for good when the hall breaks)
//   sum -> 26 Hz high-pass, mono lows, tone EQ -> staging (5-01 = REF_LUFS) -> glue -> the walls driven
//       -> true-peak limiter (-1.2 dBTP) -> L, R  (no digital-zero gates in this cut: no row plans loudness 0)
import { CUES, ROW, SHOT, DURATION } from './shots.js';
import { soundEvents } from './sound-events.js';
import { setSR, SR, Biquad, groupSpan, addBus, rmsOf, dbToGain, gainToDb, encodeWav, drive } from './audio-dsp.js';
import { fdnReverbG, glueG, limitTPG, truePeakG, monoLowsG, carve, eqG, highpassG, windowLUFS } from './audio-master.js';
import { scoreCueG, cueTable, SCORE } from './audio-music.js';
import { buildSfxG, humIntoG, prepareEvents, scoreEvents, testEvents, groupOf, chokes } from './audio-sfx.js';
import { preOf } from './audio-kinds.js';

// the true-peak ceiling: -1 dBTP with 0.2 dB to spare (ffmpeg's ebur128 oversampler reads ~0.1 dB hotter than ours)
export const PEAK_DB = -1.2;
// staging: the race's frenzy (3-07 + 3-08) lands here before the glue; everything else is placed relative to it
export const REF_LUFS = -10.3;
export const HUM_LEVEL = 0.0065, WALL_DRIVE_DB = 1.6;
const clock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : null;
const now = () => (clock ? clock() : 0);
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// a stable seed per event (its content, not its index: adding events elsewhere changes nothing here)
function seedOf(e) {
  let h = 2166136261 >>> 0;
  const s = `${e.kind}|${Math.round(e.t * 1e4)}|${e.who ?? ''}|${Math.round((e.pan ?? 0) * 100)}|${e.pitch ?? 0}|${Math.round((e.size ?? 0) * 100)}|${e.i ?? ''}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h % 999983;
}
// the hard gates (true digital silence): none in this cut
export function gates() { return []; }
// the walls driven into saturation in the master: [t0, t1, drive dB, ramp in, ramp out]
export function wallDrives(C, events) {
  const end = events.find((e) => e.kind === 'endSlam'), tE = end ? end.t : C['6-02'] + 1.5;
  return [[C['4-06'], C['4-07'], WALL_DRIVE_DB, 0.05, 0.05], [C['5-01'] + 1, C['5-02'], WALL_DRIVE_DB, 0.1, 0.3], [tE, C['6-03'], WALL_DRIVE_DB, 0.002, 0.2]];
}
// the chunks: [id, t0, t1, cut] (cut = { at }: everything of the chunk, music, effects and rooms, cut dead there)
const chunks = (C) => [['R1a', 0, C['1-06'], { at: C['1-06'], ramp: 0.25 }], ['R1b', C['1-06'], C['2-01']], ['R2', C['2-01'], C['3-01']], ['R3', C['3-01'], C['4-01']], ['R4a', C['4-01'], C['4-07'], { at: C['4-07'], ramp: 0.15 }], ['R4b', C['4-07'], C['4-08']], ['R4c', C['4-08'], C['5-01']], ['R5a', C['5-01'], C['5-03'], { at: C['5-03'], ramp: 0.12 }], ['R5b', C['5-03'], C['6-01']], ['R6a', C['6-01'], C['6-03'], { at: C['6-03'] + 0.05, ramp: 0.3 }], ['R6b', C['6-03'], C.title], ['R7', C.title, C.egg, { at: C.egg, ramp: 0.3 }], ['R8', C.egg, DURATION]];
const ROOMS = {
  m: { rt60: 2.4, damp: 4500, size: 1.35, pre: 0.022, lo: 90, wet: 0.85 },
  s: { rt60: 1.3, damp: 5200, size: 1.0, pre: 0.012, lo: 160, wet: 0.8 },
  b: { rt60: 3.2, damp: 3600, size: 1.6, pre: 0.03, lo: 70, wet: 0.9 },
};
// per cue: the ant's hall is far away (R1); the dark above is vast once the ceiling is gone (R6, R7)
const ROOMS_AT = {
  R1a: { b: { rt60: 3.6, damp: 3000, size: 1.7, pre: 0.05, lo: 60, wet: 0.95 } },
  R5a: { m: { rt60: 4.2, damp: 3200, size: 1.7, pre: 0.04, lo: 70, wet: 0.95 }, b: { rt60: 5.0, damp: 2600, size: 1.8, pre: 0.06, lo: 55, wet: 1.0 } },
  R6a: { b: { rt60: 5.0, damp: 2600, size: 1.8, pre: 0.06, lo: 55, wet: 1.0 } },
  R6b: { b: { rt60: 5.0, damp: 2600, size: 1.8, pre: 0.06, lo: 55, wet: 1.0 } },
  R8: { b: { rt60: 5.0, damp: 2600, size: 1.8, pre: 0.06, lo: 55, wet: 1.0 } },
};

// The whole render as a generator: every yield is a point where the page may get the event loop back; it yields
// the progress (0..1) or undefined. renderScore drives it straight through.
function* renderGen(sampleRate, opts) {
  setSR(sampleRate);
  const N = Math.ceil(DURATION * SR), C = CUES;
  const picture = opts.events ?? soundEvents(), test = !picture.length || !!opts.test;
  const prep = prepareEvents(test ? testEvents(C, ROW, SHOT) : picture, C, ROW);
  const all = [...prep.events, ...scoreEvents(C, ROW, prep.events)];
  const events = all.map((e) => ({ ...e, seedIndex: seedOf(e) })).sort((a, b) => a.t - b.t || (a.seedIndex - b.seedIndex));
  const vac = prep.vacuums;
  const L = new Float32Array(N), R = new Float32Array(N), out = { L, R, off: 0 };
  const report = [], counts = {}, unknown = {}, X = {};
  report.push([0, 'SFX', test ? `TEST EVENTS (testEvents: the shot table's stand-in list; ${opts.test ? 'forced' : 'soundEvents() is empty'})` : `the director's events: ${picture.length}`]);
  for (const n of prep.notes) report.push([0, 'SFX', n]);
  const stemRange = opts.stems ? (Array.isArray(opts.stems) ? opts.stems : [0, DURATION]) : null;
  let stems = null;
  if (stemRange) { const a = Math.round(stemRange[0] * SR), n = Math.round(stemRange[1] * SR) - a, mk = () => ({ L: new Float32Array(n), R: new Float32Array(n), off: a }); stems = { music: mk(), sfx: mk(), amb: mk() }; }

  // ---- the plan (for progress): weights by length
  const CH = chunks(C), spans = CH.map(([id, t0, t1]) => {
    const evs = events.filter((e) => e.t >= t0 && e.t < t1), tail = Math.max(6, ...evs.map((e) => e.t + (e.dur || 0) + 3.5 - t1));
    return { evs, a: Math.max(0, t0 - 0.7), b: Math.min(DURATION, t1 + tail) };
  });
  const W = { music: 90, sfx: 30, room: 9, mix: 2, hum: 6, master: 60 };
  const total = 20 + CH.reduce((s, c, ci) => { const len = spans[ci].b - spans[ci].a; return s + len * (W.music + W.sfx + 3 * W.room + W.mix); }, 0) + DURATION * (W.hum + W.master);
  let done = 20;
  const units = [];
  function* unit(name, w, g) {
    let ms = 0, top = 0, r;
    for (;;) { const t = now(); r = g.next(); const d = now() - t; ms += d; if (d > top) top = d; if (r.done) break; yield typeof r.value === 'number' ? (done + w * Math.min(1, r.value)) / total : undefined; }
    done += w; units.push([name, ms, top]);
    yield done / total;
    return r.value;
  }
  function* job(name, w, fn) { const t = now(), v = fn(), d = now() - t; done += w; units.push([name, d, d]); yield done / total; return v; }
  yield done / total;
  const CHOKES = chokes(C, events);

  // ---- the chunks
  for (let ci = 0; ci < CH.length; ci++) {
    const [id, t0, t1, cut] = CH[ci], { evs, a, b } = spans[ci], len = b - a;
    const G = { m: groupSpan(a, b, N), s: groupSpan(a, b, N), b: groupSpan(a, b, N) };
    if (evs.some((e) => groupOf(e) === 'x')) G.x = groupSpan(a, b, N);
    let gaps = [];
    if (SCORE[id]) { const r = yield* unit(`music ${id}`, W.music * len, scoreCueG(id, G.m, events, 1000 * (ci + 1), X)); gaps = r.gaps; report.push(...r.report); }
    yield* unit(`sfx ${id}`, W.sfx * len, buildSfxG(C, ROW, G, evs, { counts, unknown, chokes: CHOKES }));
    for (const [k, g] of Object.entries(G)) yield* unit(`rooms ${id}`, W.room * len * 0.75, fdnReverbG(g.send.L, g.send.R, g.dry.L, g.dry.R, ROOMS_AT[id]?.[k === 'x' ? 'b' : k] ?? ROOMS[k === 'x' ? 'b' : k]));
    yield* job(`mix ${id}`, W.mix * len, () => {
      // silence is carved after the rooms so it is real
      carve(G.m.dry.L, G.m.dry.R, gaps.map(([g0, g1, db, ri, ro]) => [g0, g1, db, ri, ro]), G.m.off);
      for (const [g0, g1, , , , l] of gaps) report.push([+g0.toFixed(3), 'GAP', `music ${g0.toFixed(2)}..${Math.min(g1, DURATION).toFixed(2)} (${l})`]);
      for (const [tv, e] of vac) if (tv >= t0 && tv < t1) {
        const pre = preOf(e);
        for (const k of ['m', 's', 'b']) carve(G[k].dry.L, G[k].dry.R, [[tv - pre, tv - 0.002, -90, 0.03, 0.002]], G[k].off);
        report.push([+(tv - pre).toFixed(3), 'GAP', `the vacuum: music, effects and rooms silent ${(tv - pre).toFixed(2)}..${tv.toFixed(2)} but the ${e.kind === 'bigSlam' ? 'giant card' : "ant's slap"} falling (and its whoosh)`]);
      }
      if (cut) {
        for (const [gk, g] of Object.entries(G)) carve(g.dry.L, g.dry.R, [[cut.at, b + 1, -120, cut.ramp ?? 0.002, 0]], g.off);
        report.push([+cut.at.toFixed(3), 'GAP', `${id}: music, effects and rooms ${cut.ramp ? `faded out (${cut.ramp} s)` : 'cut dead'} at ${cut.at.toFixed(2)}`]);
      }
      for (const g of Object.values(G)) addBus(out, g.dry);
      if (stems) { addBus(stems.music, G.m.dry); for (const k of ['s', 'b', 'x']) if (G[k]) addBus(stems.sfx, G[k].dry); }
    });
  }

  // ---- the hum: the lamp, with the picture (1-02); gone in the vacuums; low after the slap that kills the ant; gone
  // for good when the hall breaks (the burst)
  const tGone = (events.find((e) => e.kind === 'burst') ?? { t: C['5-01'] + 1 }).t;
  const humLvl = (t) => {
    if (t > tGone + 0.5) return 0;
    let k = smooth01((t - ROW['1-02'].t0) / 1.5) * (1 - smooth01((t - tGone) / 0.4));
    for (const [tv, e] of vac) { const a = tv - preOf(e); if (t > a - 0.04 && t < tv + 0.15) k *= t < a ? 1 - (t - a + 0.04) / 0.04 : t < tv ? 0 : (t - tv) / 0.15; }
    if (t > C['1-06'] && t < C['2-01']) k *= 0.2 + 0.8 * smooth01((t - C['1-07']) / 1.2);
    return Math.max(0, k);
  };
  for (const [dst, off] of stems ? [[out, 0], [stems.amb, stems.amb.off]] : [[out, 0]]) yield* unit('hum', W.hum * DURATION, humIntoG(dst.L, dst.R, off, 0.02, DURATION, { level: HUM_LEVEL, lvlAt: humLvl }));
  report.push([ROW['1-02'].t0, 'AMB', 'hum: the lamp (50 Hz) with the picture; gone in the vacuums, gone for good when the hall breaks']);
  report.push([0, 'SFX', `events: ${events.length} (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})`]);
  const unk = Object.entries(unknown); if (unk.length) report.push([0, 'SFX', `UNKNOWN kinds skipped (silent): ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`]);

  // ---- master
  const M = W.master * DURATION / 10;
  yield* unit('master hp', M, highpassG(L, R, 26));
  yield* unit('master mono', M * 0.5, monoLowsG(L, R, 110));
  yield* unit('master eq', M, eqG(L, R, () => [Biquad.peak(300, 0.9, -1.0), Biquad.peak(2800, 1.0, 0.8), Biquad.hishelf(11000, -1.0)]));
  let linGain = 1;
  const ref = windowLUFS(L, R, C['5-01'] + 1.1, C['5-02'], SR);
  yield* job('master stage', M * 0.3, () => { const k = dbToGain(REF_LUFS - ref); for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; } linGain *= k; });
  const glueGr = yield* unit('master glue', M * 1.5, glueG(L, R, { thr: -13, ratio: 1.5, knee: 10, att: 0.02, rel: 0.25, look: 0.005 }));
  const WALLS = wallDrives(C, events);
  yield* job('master wall', M * 0.2, () => {
    const top = dbToGain(PEAK_DB + 0.5), nrm = top / Math.tanh(1);
    for (const [t0, t1, d, ri, ro] of WALLS) {
      const g = dbToGain(d), a = Math.round(t0 * SR), b = Math.min(N, Math.round(t1 * SR)), na = Math.max(1, Math.round(ri * SR)), nb = Math.max(1, Math.round(ro * SR));
      for (let i = Math.max(0, a - na); i < Math.min(N, b + nb); i++) {
        const w = i < a ? 1 - (a - i) / na : i < b ? 1 : 1 - (i - b) / nb, l = Math.tanh(L[i] * g / top) * nrm, r = Math.tanh(R[i] * g / top) * nrm;
        L[i] += (l - L[i]) * w; R[i] += (r - R[i]) * w;
      }
    }
  });
  const ceil = dbToGain(PEAK_DB), grBlocks = [];
  const limGr = yield* unit('master limiter', M * 3, limitTPG(L, R, ceil * 0.997, 0.004, 0.12, grBlocks));
  const tp = yield* unit('master true peak', M, truePeakG(L, R));
  yield* job('master normalize', M * 0.3, () => { const k = ceil / Math.max(1e-9, tp.true); for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; } linGain *= k; });
  const GATES = gates(C, events);
  yield* job('master gates', M * 0.2, () => {
    const rmp = Math.max(1, Math.round(0.0015 * SR));
    for (const [g0, g1] of GATES) {
      const a = Math.round(g0 * SR), b = Math.min(N, Math.round(g1 * SR));
      for (let i = Math.max(0, a - rmp); i < a; i++) { const k = (a - i) / rmp; L[i] *= k; R[i] *= k; }
      for (let i = a; i < b; i++) { L[i] = 0; R[i] = 0; }
      for (let i = b; i < Math.min(N, b + rmp); i++) { const k = (i - b) / rmp; L[i] *= k; R[i] *= k; }
    }
    const fi = Math.round(0.02 * SR); for (let i = 0; i < fi; i++) { const k = i / fi; L[i] *= k; R[i] *= k; }
    const fo = Math.round(0.25 * SR); for (let i = 0; i < fo; i++) { const k = i / fo; L[N - 1 - i] *= k; R[N - 1 - i] *= k; }   // the last tak rings out to the end of the file
    if (stems) for (const s of Object.values(stems)) for (let i = 0; i < s.L.length; i++) { s.L[i] *= linGain; s.R[i] *= linGain; }
  });

  const res = { L, R };
  if (opts.report) {
    const tp2 = yield* unit('report true peak', 0, truePeakG(L, R));
    const sum = (re) => Math.round(units.filter(([n]) => re.test(n)).reduce((s, [, ms]) => s + ms, 0));
    res.report = {
      sampleRate: SR, samples: N, peakDb: +gainToDb(tp2.sample).toFixed(3), truePeakDb: +gainToDb(tp2.true).toFixed(3), rmsDb: +gainToDb(rmsOf(L, R)).toFixed(2),
      glueGrDb: +glueGr.toFixed(2), limiterGrDb: +limGr.toFixed(2), masterGainDb: +gainToDb(linGain).toFixed(2), refLufs: +ref.toFixed(2), events: events.length, test,
      counts, unknown, gates: GATES, walls: WALLS, vacuums: vac.map(([t, e]) => [t, preOf(e), e.kind]),
      limiterBlocks: grBlocks.map((k, b) => [+(b * 0.1).toFixed(1), +gainToDb(k).toFixed(2)]).filter((x) => x[1] < -0.05),
      cues: report.sort((a, b) => a[0] - b[0]), cueTable: cueTable(), eventsUsed: events,
      timingsMs: { music: sum(/^music/), sfx: sum(/^sfx/), rooms: sum(/^rooms/), hum: sum(/^hum/), mix: sum(/^mix/), master: sum(/^master/), total: sum(/./) },
      units: units.map(([n, ms, top]) => [n, Math.round(ms), Math.round(top)]),
    };
  }
  if (stems) res.stems = stems;
  return res;
}

// The whole film, synchronously: { L, R } (Float32Array, ceil(DURATION * sampleRate) samples each).
// opts: events (override the picture's), test (true: the stand-in list), report (true: a report object), stems.
export function renderScore(sampleRate = 48000, opts = {}) {
  return drive(renderGen(sampleRate, opts));
}

// The same render without blocking the page: works for opts.sliceMs (default 12) at a time, then gives the event loop
// back and calls onProgress(p) (never decreasing, exactly 1 once at the end). Bit-identical to renderScore.
export async function renderScoreAsync(sampleRate = 48000, opts = {}, onProgress = null) {
  const g = renderGen(sampleRate, opts), slice = opts.sliceMs ?? 12;
  let r, p = 0, t = now(), steps = 0;
  for (;;) {
    r = g.next();
    if (r.done) break;
    if (typeof r.value === 'number' && r.value > p) p = Math.min(r.value, 0.999);
    if (clock ? now() - t >= slice : ++steps % 64 === 0) {
      if (onProgress) onProgress(p);
      await breathe();
      setSR(sampleRate);
      t = now();
    }
  }
  if (onProgress) onProgress(1);
  return r.value;
}
let chan = null; const waiting = [];
function breathe() {
  if (typeof setImmediate === 'function') return new Promise((res) => setImmediate(res));
  if (typeof MessageChannel === 'function') {
    if (!chan) { chan = new MessageChannel(); chan.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); }; }
    return new Promise((res) => { waiting.push(res); chan.port2.postMessage(0); });
  }
  return new Promise((res) => setTimeout(res, 0));
}

export { encodeWav };
