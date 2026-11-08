// Sound department — the soundtrack of JOKERS WILD (v2).
// renderScore(SR) synthesizes the whole film's mix in pure JS (no samples, no Web Audio nodes),
// deterministic (seeded noise only: no Math.random, no clock) and identical in Node and the browser.
// renderScoreAsync(SR, opts, onProgress) renders the same thing without blocking the page: it works in
// slices of ~12 ms, gives the event loop back between them and reports its progress 0..1; the result is
// bit-identical to renderScore (both drive the same generator, renderGen, step by step).
// Every time hangs off CUES / ROW / SHOT or off the picture's sound events (soundEvents(), owned by the director).
//
// The film is rendered in CHUNKS, one per music cue (M1, M2, M3, M4, M5, M6, M6b, M7+M8, M9, M9b, M10, M11+M12):
// each chunk gets its own windowed music and effects groups and rooms, is carved, summed into the master and
// released, so the browser never holds a full-length buffer per layer.
//
//   the picture's events -> prepareEvents (remaps, the card cloud, bursts thinned) + the score's ambience events
//   music (audio-music.js: SCORE[cue] / buildMusicG for M7-M8) -> war-room FDN -> carved silences ------\
//   the march (M7) -> band chain -> stone room -> distance, box muffle -> skip / freeze ---------------+
//   effects (audio-sfx.js: every event, by chunk) -> war-room FDN (shorter) ---------------------------+-> sum
//   siren (from the alarm event to the pair) -> far end of the stone room (FDN, mostly wet) ------------+
//   hum (0:00 .. 3:18.35, it turns into the new king's organ in M10 and again in the race) ------------/
//   sum -> 26 Hz high-pass, mono lows, tone EQ -> staging (the march at 7-10 = REF_LUFS) -> glue
//       -> the 9-03 walls driven -> true-peak limiter (-1 dBTP) -> the hard gates (digital zero) -> L, R
import { CUES, ROW, SHOT, DURATION } from './shots.js';
import { soundEvents } from './sound-events.js';
import { setSR, SR, Biquad, groupSpan, addBus, rmsOf, dbToGain, gainToDb, encodeWav, drive } from './audio-dsp.js';
import { fdnReverbG, glueG, limitTPG, truePeakG, monoLowsG, carve, eqG, highpassG, windowLUFS, pull } from './audio-master.js';
import { buildMusicG, scoreCueG, cueTable, boxMuffle, SCORE } from './audio-music.js';
import { buildSfxG, humIntoG, sirenG, organIntoG, prepareEvents, scoreEvents } from './audio-sfx.js';

// the true-peak ceiling: -1 dBTP with 0.2 dB to spare (ffmpeg's ebur128 oversampler reads ~0.1 dB hotter than ours)
export const PEAK_DB = -1.2;
// staging: the march over 7-10 (corny, too loud, flat) lands here before the glue; everything else is placed
// relative to it, so no single hit can move the film's level
export const REF_LUFS = -10.8;
export const HUM_LEVEL = 0.0085, ORGAN_LEVEL = 0.011, WALL_DRIVE_DB = 1.5;
const clock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : null;
const now = () => (clock ? clock() : 0);

// a stable seed per event (its content, not its index: adding events elsewhere changes nothing here)
function seedOf(e) {
  let h = 2166136261 >>> 0;
  const s = `${e.kind}|${Math.round(e.t * 1e4)}|${e.who ?? ''}|${Math.round((e.pan ?? 0) * 100)}|${e.pitch ?? 0}|${Math.round((e.size ?? 0) * 100)}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h % 999983;
}

// the hard gates: true digital silence (every bus, the hum too) in these film-second ranges
export function gates(C = CUES) {
  const G = [];
  for (const id of ['9-03.02', '9-03.04']) if (SHOT[id]) G.push([SHOT[id].t0, SHOT[id].t1, id]);
  G.push([C.zero, C.heart, '9-05 (3.5 s)'], [C.credits, DURATION, 'credits (12-01)']);
  return G;
}

// the walls driven into saturation in the master: [t0, t1, drive dB, ramp in s, ramp out s]
export function wallDrives(C = CUES) {
  const W = [];
  for (const id of ['9-03.01', '9-03.03', '9-03.05']) if (SHOT[id]) W.push([SHOT[id].t0, SHOT[id].t1, WALL_DRIVE_DB, 0.002, 0.002]);   // between the gates
  W.push([C.jam, ROW['2-19'].t1, 0, 0.005, 0.01]);                // 2-19 the leaderboard jam (a wall in shots.txt)
  W.push([C.double - 0.01, C.full + 0.6, 0.5, 0.005, 0.3]);       // 2-22 the double slam (into the first beat of 2-23)
  W.push([C.embargo - 0.01, C.starve, 0, 0.005, 0.06]);         // 4-05 EMBARGO
  W.push([C.burst - 0.005, C.freeze + 1.0, 0.5, 0.003, 0.3]);     // 8-01 the burst, 8-02 the skip
  return W;
}

// the chunks: [id, t0, t1, cut] (with cut = { at, pull }, everything of the chunk, music, effects and their rooms,
// is cut dead there, or pulled away over `pull` seconds)
const chunks = (C) => [
  ['M1', 0, C.ladder], ['M2', C.ladder, C.press1], ['M3', C.press1, C.v3], ['M4', C.v3, C.locks], ['M5', C.locks, C.frenzy],
  ['M6', C.frenzy, C.button, { at: C.button, pull: 0.3 }], ['M6b', C.button, C.auto], ['M7', C.auto, C.launch],
  ['M9', C.launch, C.pair, { at: C.pair }], ['M9b', C.pair, C.king], ['M10', C.king, C.stare], ['M11', C.stare, DURATION],
];
// the progress bar's weights: the measured cost (ms, Node, 48 kHz) of every work unit; anything not listed is
// estimated from its length. Only the bar's evenness depends on these, never the sound.
const COST = {
  music: { M1: 300, M2: 1100, M3: 250, M4: 1300, M5: 500, M6: 900, M6b: 0, M7: 1700, M9: 450, M9b: 200, M10: 120, M11: 260 },
  sfx: { M1: 120, M2: 250, M3: 150, M4: 400, M5: 120, M6: 350, M6b: 5, M7: 900, M9: 350, M9b: 200, M10: 250, M11: 400 },
  roomPerSec: 7.0, mixPerSec: 1.6, siren: 170, hum: 380, events: 30,
  master: { hp: 120, mono: 60, eq: 170, stage: 40, glue: 260, wall: 10, limit: 560, tp: 140, norm: 40, gates: 10 },
};

// The whole render as a generator: every yield is a point where the page may get the event loop back; it
// yields the film's progress (0..1) or undefined. renderScore drives it straight through.
function* renderGen(sampleRate, opts) {
  setSR(sampleRate);
  const N = Math.ceil(DURATION * SR), C = CUES;
  const prep = prepareEvents(opts.events ?? soundEvents(), C, ROW);
  const all = [...prep.events, ...scoreEvents(C, ROW, prep.events)];
  const events = all.map((e) => ({ ...e, seedIndex: seedOf(e) })).sort((a, b) => a.t - b.t || (a.seedIndex - b.seedIndex));
  const L = new Float32Array(N), R = new Float32Array(N), out = { L, R, off: 0 };
  const report = [], counts = {}, unknown = {};
  for (const n of prep.notes) report.push([0, 'SFX', n]);
  // stems (for balance checks): each layer over a range, scaled like the master's linear gains
  const stemRange = opts.stems ? (Array.isArray(opts.stems) ? opts.stems : [C.cigars, C.launch]) : null;
  let stems = null;
  if (stemRange) { const a = Math.round(stemRange[0] * SR), n = Math.round(stemRange[1] * SR) - a, mk = () => ({ L: new Float32Array(n), R: new Float32Array(n), off: a }); stems = { music: mk(), sfx: mk(), amb: mk() }; }

  // ---- the plan (for progress): every unit's weight, in order
  const CH = chunks(C), spans = CH.map(([id, t0, t1]) => {
    const evs = events.filter((e) => e.t >= t0 && e.t < t1), tail = Math.max(5, ...evs.map((e) => e.t + (e.dur || 0) + 3 - t1));
    return { evs, a: Math.max(0, t0 - 0.6), b: Math.min(DURATION, t1 + tail) };
  });
  const total = COST.events + CH.reduce((s, [id], ci) => { const len = spans[ci].b - spans[ci].a; return s + (COST.music[id] ?? 40 * len) + (COST.sfx[id] ?? 10 * len) + COST.roomPerSec * len + COST.mixPerSec * len; }, 0)
    + COST.siren + COST.hum * (stems ? 2 : 1) + Object.values(COST.master).reduce((x, y) => x + y, 0);
  let done = COST.events;
  const units = [];
  // one work unit (a generator): its own progress is re-mapped into the film's; its compute time is kept
  function* unit(name, w, g) {
    let ms = 0, top = 0, r;
    for (;;) { const t = now(); r = g.next(); const d = now() - t; ms += d; if (d > top) top = d; if (r.done) break; yield typeof r.value === 'number' ? (done + w * Math.min(1, r.value)) / total : undefined; }
    done += w; units.push([name, ms, top]);
    yield done / total;
    return r.value;
  }
  function* job(name, w, fn) { const t = now(), v = fn(), d = now() - t; done += w; units.push([name, d, d]); yield done / total; return v; }
  yield done / total;

  // ---- the chunks (music cue boundaries)
  for (let ci = 0; ci < CH.length; ci++) {
    const [id, t0, t1, cut] = CH[ci], { evs, a, b } = spans[ci], len = b - a;
    const Gm = groupSpan(a, b, N), Gs = groupSpan(a, b, N);
    let gaps = [], march = null;
    if (id === 'M7') { const r = yield* unit('music M7', COST.music.M7, buildMusicG(C, ROW, Gm, N, events)); gaps = r.gaps; march = r.march; report.push(...r.report); }
    else if (SCORE[id]) { const r = yield* unit(`music ${id}`, COST.music[id] ?? 40 * len, scoreCueG(id, Gm, events, 1000 * (ci + 1))); gaps = r.gaps; report.push(...r.report); }
    else yield* job(`music ${id}`, 0, () => 0);
    yield* unit(`sfx ${id}`, COST.sfx[id] ?? 10 * len, buildSfxG(C, ROW, Gs, evs, { counts, unknown }));
    yield* unit(`rooms ${id}`, COST.roomPerSec * len * 0.55, fdnReverbG(Gm.send.L, Gm.send.R, Gm.dry.L, Gm.dry.R, { rt60: 2.4, damp: 4500, size: 1.35, pre: 0.022, lo: 90, wet: 0.85 }));
    yield* unit(`rooms ${id}`, COST.roomPerSec * len * 0.45, fdnReverbG(Gs.send.L, Gs.send.R, Gs.dry.L, Gs.dry.R, { rt60: 1.3, damp: 5200, size: 1.0, pre: 0.012, lo: 160, wet: 0.8 }));
    yield* job(`mix ${id}`, COST.mixPerSec * len, () => {
      // silence is carved after the room so it is real
      carve(Gm.dry.L, Gm.dry.R, gaps.map(([g0, g1, db, ri, ro]) => [g0, g1, db, ri, ro]), Gm.off);
      for (const [g0, g1, , , , l] of gaps) report.push([+g0.toFixed(3), 'GAP', `music silent ${g0.toFixed(2)}..${Math.min(g1, DURATION).toFixed(2)} (${l})`]);
      if (id === 'M7') boxMuffle(Gs.dry, C.pov, C.burst, 0.85);                    // 7-13: the effects too, from inside the box
      if (cut) {
        for (const B of [Gm.dry, Gs.dry]) { if (cut.pull) pull(B.L, B.R, B.off, cut.at, cut.pull); else carve(B.L, B.R, [[cut.at, b + 1, -120, 0.003, 0]], B.off); }
        report.push([+cut.at.toFixed(3), 'GAP', cut.pull ? `${id}: music, effects and rooms pulled away over ${cut.pull} s at ${cut.at.toFixed(2)} (darker and gone)` : `${id}: music, effects and rooms cut dead at ${cut.at.toFixed(2)}`]);
      }
      addBus(out, Gm.dry); addBus(out, Gs.dry); if (march) addBus(out, march);
      if (stems) { addBus(stems.music, Gm.dry); if (march) addBus(stems.music, march); addBus(stems.sfx, Gs.dry); }
    });
  }

  // ---- the siren: from the alarm event until it dies at the pair (louder in the walls of 9-03)
  const alarm = events.find((e) => e.kind === 'alarm' && e.t > C.burst), tSiren = alarm ? alarm.t : C.cancel + 0.2;
  {
    const Ga = groupSpan(tSiren - 0.1, C.pair + 3, N);
    yield* unit('siren', COST.siren * 0.5, sirenG(Ga, tSiren, C.pair + 1.0, { f: 290, period: 3.2, gain: 0.034, send: 1.6, pan: 0.05, stopAt: C.pair, dieSpeed: 0.1, dieLevel: 0.04, gainAt: (tt) => (tt < C.launch ? 1 : 2.5) }));
    yield* unit('siren', COST.siren * 0.5, fdnReverbG(Ga.send.L, Ga.send.R, Ga.dry.L, Ga.dry.R, { rt60: 3.2, damp: 2600, size: 1.6, pre: 0.045, lo: 80, wet: 1.0 }));
    carve(Ga.dry.L, Ga.dry.R, [[C.pair + 0.05, C.pair + 4, -120, 0.04, 0]], Ga.off);
    addBus(out, Ga.dry); if (stems) addBus(stems.amb, Ga.dry);
  }
  report.push([+tSiren.toFixed(3), 'AMB', 'siren: a low two-rotor air-raid siren spins up and wails (period 3.2 s), far end of the stone room']);
  report.push([+C.launch.toFixed(3), 'AMB', 'siren: carries into 9-01, louder (+8 dB) through the walls']);
  report.push([+C.pair.toFixed(3), 'AMB', 'siren: the motor is cut, the rotor coasts down, it dies']);
  // ---- the hum: from nothing in the black (1-01) to the hard cut. Off from the 3.5 s of digital silence until
  // the sub swell (the heartbeat is the first sound). It turns into the new king's organ (M10) and comes back
  // under the stare; in the race the organ rises out of it again and is cut dead on the black.
  const tBack = C.bomb - 0.6;
  const humLvl = (t) => smooth01(t / 1.4) * (t < C.zero ? 1 : smooth01((t - tBack) / 0.6)) * (1 - smooth01((t - C.king) / 3) + smooth01((t - C.free) / 2.4));
  const orgA = { fAt: (t) => (t < C.tower ? 50 * Math.pow(55 / 50, smooth01((t - C.king) / 3)) : 55 * Math.pow(41.2 / 55, smooth01((t - C.tower - 0.2) / 1.8))),
    regAt: (t) => smooth01((t - C.king) / 3.6), lvl: (t) => smooth01((t - C.king) / 3) * (1 + 0.5 * smooth01((t - C.tower) / 0.8)) * (1 - smooth01((t - C.free) / 2.4)), gain: ORGAN_LEVEL };
  const orgB = { fAt: (t) => 50 * Math.pow(55 / 50, smooth01((t - C.race) / 2)), regAt: (t) => smooth01((t - C.race) / 3),
    lvl: (t) => smooth01((t - C.race) / 2.5) * (0.6 + 0.6 * smooth01((t - C.grow) / 6)) * (1 - smooth01((t - C.black + 0.012) / 0.01)), gain: ORGAN_LEVEL };
  for (const [dst, off] of stems ? [[out, 0], [stems.amb, stems.amb.off]] : [[out, 0]]) {
    yield* unit('hum', COST.hum * 0.8, humIntoG(dst.L, dst.R, off, 0.02, C.credits, { level: HUM_LEVEL, lvlAt: humLvl }));
    yield* unit('hum', COST.hum * 0.1, organIntoG(dst.L, dst.R, off, C.king, C.stare + 0.1, orgA));
    yield* unit('hum', COST.hum * 0.1, organIntoG(dst.L, dst.R, off, C.race, C.black, orgB));
  }
  report.push([0.02, 'AMB', `hum: 50 Hz machine room from nothing, until the hard cut at ${C.credits.toFixed(2)}; off from the digital silence until the sub swell (${tBack.toFixed(2)})`]);
  report.push([+C.king.toFixed(3), 'AMB', 'hum -> organ: the mains glide up to A1 (55 Hz) as the ranks come in; it sinks to E1 as the king sits; out with the threads (10-04), the hum back']);
  report.push([+C.race.toFixed(3), 'AMB', `organ: rises out of the hum again on A for the race, growing; cut dead on the black (${C.black.toFixed(2)})`]);
  report.push([0, 'SFX', `events: ${events.length} (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})`]);
  const unk = Object.entries(unknown); if (unk.length) report.push([0, 'SFX', `UNKNOWN kinds skipped (silent): ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`]);

  // ---- master
  const M = COST.master;
  yield* unit('master hp', M.hp, highpassG(L, R, 26));
  yield* unit('master mono', M.mono, monoLowsG(L, R, 110));
  yield* unit('master eq', M.eq, eqG(L, R, () => [Biquad.peak(300, 0.9, -1.0), Biquad.peak(2800, 1.0, 0.6), Biquad.hishelf(11000, -1.0)]));
  let linGain = 1;
  const r7 = ROW['7-10'], ref = windowLUFS(L, R, r7.t0, r7.t1, SR);
  yield* job('master stage', M.stage, () => { const k = dbToGain(REF_LUFS - ref); for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; } linGain *= k; });
  const glueGr = yield* unit('master glue', M.glue, glueG(L, R, { thr: -12, ratio: 1.4, knee: 10, att: 0.025, rel: 0.3, look: 0.005 }));
  // the walls are driven into saturation (dense, not peaky: a wall, not a crescendo), crossfaded in and out
  const WALLS = wallDrives(C);
  yield* job('master wall', M.wall, () => {
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
  const limGr = yield* unit('master limiter', M.limit, limitTPG(L, R, ceil * 0.997, 0.004, 0.12, grBlocks));
  const tp = yield* unit('master true peak', M.tp, truePeakG(L, R));
  yield* job('master normalize', M.norm, () => { const k = ceil / Math.max(1e-9, tp.true); for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; } linGain *= k; });
  // the hard gates: exact zeros inside, 1.5 ms ramps just outside (a switch, not a click)
  const GATES = gates(C);
  yield* job('master gates', M.gates, () => {
    const rmp = Math.max(1, Math.round(0.0015 * SR));
    for (const [g0, g1] of GATES) {
      const a = Math.round(g0 * SR), b = Math.min(N, Math.round(g1 * SR));
      for (let i = Math.max(0, a - rmp); i < a; i++) { const k = (a - i) / rmp; L[i] *= k; R[i] *= k; }
      for (let i = a; i < b; i++) { L[i] = 0; R[i] = 0; }
      for (let i = b; i < Math.min(N, b + rmp); i++) { const k = (i - b) / rmp; L[i] *= k; R[i] *= k; }
    }
    const fi = Math.round(0.02 * SR); for (let i = 0; i < fi; i++) { const k = i / fi; L[i] *= k; R[i] *= k; }
    if (stems) for (const s of Object.values(stems)) for (let i = 0; i < s.L.length; i++) { s.L[i] *= linGain; s.R[i] *= linGain; }
  });

  const res = { L, R };
  if (opts.report) {
    const tp2 = yield* unit('report true peak', 0, truePeakG(L, R));
    const sum = (re) => Math.round(units.filter(([n]) => re.test(n)).reduce((s, [, ms]) => s + ms, 0));
    res.report = {
      sampleRate: SR, samples: N, peakDb: +gainToDb(tp2.sample).toFixed(3), truePeakDb: +gainToDb(tp2.true).toFixed(3), rmsDb: +gainToDb(rmsOf(L, R)).toFixed(2),
      glueGrDb: +glueGr.toFixed(2), limiterGrDb: +limGr.toFixed(2), masterGainDb: +gainToDb(linGain).toFixed(2), refLufs: +ref.toFixed(2), events: events.length,
      counts, unknown, gates: GATES, limiterBlocks: grBlocks.map((k, b) => [+(b * 0.1).toFixed(1), +gainToDb(k).toFixed(2)]).filter((x) => x[1] < -0.05),
      cues: report.sort((a, b) => a[0] - b[0]), cueTable: cueTable(),
      // compute time per stage (not wall time: an async render's waits are not counted)
      timingsMs: { music: sum(/^music/), sfx: sum(/^sfx/), rooms: sum(/^rooms|^siren/), hum: sum(/^hum/), mix: sum(/^mix/), master: sum(/^master/), total: sum(/./) },
      // [unit, compute ms, its longest single step ms] (the longest the page can be held up)
      units: units.map(([n, ms, top]) => [n, Math.round(ms), Math.round(top)]),
    };
  }
  if (stems) res.stems = stems;
  return res;
}
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// The whole film, synchronously: { L, R } (Float32Array, ceil(DURATION * sampleRate) samples each).
// opts: events (override the picture's), report (true: a report object), stems (true or [t0, t1]).
export function renderScore(sampleRate = 48000, opts = {}) {
  return drive(renderGen(sampleRate, opts));
}

// The same render without blocking the page. It works for opts.sliceMs (default 12) at a time, then gives
// the event loop back (setImmediate / MessageChannel / setTimeout, whichever exists) and calls onProgress(p):
// p in [0, 1), never decreasing, and exactly 1 once when the score is done. Resolves to the same { L, R } as
// renderScore(sampleRate, opts), bit for bit. Safe to run beside another render (the module's sample rate is
// set again after every pause).
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
      setSR(sampleRate);                  // another render may have changed the module's rate meanwhile
      t = now();
    }
  }
  if (onProgress) onProgress(1);
  return r.value;
}
// give the event loop back for a moment: a plain macrotask, so input, painting, timers and
// requestAnimationFrame all get their turn (scheduler.yield() is not used: its continuations jump ahead of
// timers, which would starve a setTimeout/setInterval progress display)
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
