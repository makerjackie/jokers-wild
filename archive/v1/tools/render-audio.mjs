// Renders the score of JOKERS WILD and checks it by measurement (nobody here can listen).
//   node tools/render-audio.mjs [--preview] [--twice] [--cues] [--no-spec]
//   --preview   fill every sequence the director has not directed yet (no events of its own) with this
//               tool's SYNTHETIC test events (tools only; never shipped) -> out/score-preview.wav
// writes  out/score.wav (or score-preview.wav)   the whole film, 48 kHz 16-bit stereo
//         out/reel.wav                         the tone reel, exactly REEL.t0 .. REEL.t1
//         out/stem-{music,sfx,amb}.wav         the reel's three layers (pre-glue/limiter, same make-up gain)
//         out/reel-spec.png, out/score-spec.png  ffmpeg showspectrumpic
// prints  per-row levels over the film, loudness (BS.1770 momentary 0.4 s / short-term 3 s) at the sync
//         points, the walls and holes of SCRIPT.md section 7, the march's flatness, the gates (exact zero),
//         sample / true peak, the limiter's worst moments, a click scan, a struck-tone ("mallet") scan,
//         band energies per sequence, an ffmpeg ebur128 cross-check, and with --twice a determinism check.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderScore, encodeWav, gates } from '../src/audio.js';
import { SHOTS, ROW, CUES, REEL, DURATION, SEQS } from '../src/shots.js';
import { soundEvents } from '../src/sound-events.js';
import { loudnessCum, lufs, integrated, loudnessRange, truePeak } from '../src/audio-master.js';
import { mulberry32 } from '../src/util.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), outDir = join(root, 'out');
const SR = 48000, arg = (k) => process.argv.includes(k), C = CUES, at = (id, k = 0) => ROW[id].t0 + k;
const tc = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// ============================================================ synthetic test events (tools only)
// What the director described for each sequence, so every new kind and every cue can be heard and measured
// before the real events arrive. Only used with --preview, and only for sequences with no real events.
function synthetic() {
  const E = [], r = mulberry32(4242), ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, pan: 0, pitch: 0, dur: 0, size: 0.5, ...o, synthetic: true });
  // seq 1: the opening
  ev(0.45, 'tick', { gain: 0.7 }); ev(C.open, 'switch'); ev(C.open + 0.05, 'slam', { size: 0.3, gain: 0.85 }); ev(C.open + 0.6, 'creakL', { dur: 13.5, size: 0.7 });
  ev(at('1-03', 10.2), 'flaps', { dur: 0.7, gain: 0.7 }); for (let i = 0; i < 10; i++) ev(at('1-05', 0.1 + i * 0.2), 'stone', { pan: (i % 2 ? 0.6 : -0.6) * (1 - i / 12), gain: 0.8 });
  ev(at('1-05', 0.7), 'pulse', { dur: 1.8, pan: 0.4 }); ev(at('1-07', 3.6), 'tick', { gain: 0.8 });
  // seq 2: the duel (slams = the drums), the jam, the double slam, the dominoes, the pass, the shim
  [['2-02', 0.3], ['2-05', 0.4], ['2-07', 0.5], ['2-09', 0.6], ['2-11', 0.65], ['2-13', 0.7], ['2-15', 0.75], ['2-17', 0.8]].forEach(([id, s], i) => ev(at(id, 0.05), 'slam', { size: s, gain: 0.8 + 0.05 * i, pan: i % 2 ? 0.3 : -0.3 }));
  ev(at('2-03', 0.1), 'chips', { size: 0.5, pan: -0.3 }); ev(at('2-03', 0.6), 'press', { pan: -0.3 }); ev(at('2-05', 0.4), 'flaps', { dur: 0.4 }); ev(at('2-17', 0.1), 'flaps', { dur: 0.4 });
  for (let i = 0; i < 30; i++) ev(at('2-18', 0.05 + 1.25 * r()), 'pop', { pan: r() * 2 - 1, size: 0.3 + 0.4 * r(), gain: 0.7 });
  ev(C.jam, 'jam', { dur: ROW['2-19'].t1 - C.jam }); ev(at('2-21', 0.03), 'slam', { size: 1, gain: 1.2, pan: -0.4 }); ev(at('2-21', 0.05), 'slam', { size: 1, gain: 1.2, pan: 0.4 });
  for (let i = 0; i < 24; i++) ev(at('2-22', 0.05 + i * 0.065), 'topple', { pan: -0.8 + 1.6 * (i / 23), size: 0.4, gain: 0.8 });
  ev(at('2-24', 0.4), 'tick', { gain: 0.6 }); ev(at('2-24', 0.7), 'flaps', { dur: 0.3 }); ev(at('2-25', 0.1), 'creakT', { dur: 1.2 });
  ev(at('2-26', 0.2), 'fold', { size: 0.9 }); ev(at('2-26', 0.75), 'fold', { size: 1 }); ev(at('2-26', 1.4), 'thud');
  // seq 3: the chokehold
  ev(at('3-01', 0.1), 'chipflow', { dur: 1.9, size: 0.6, pan: 0.3 }); ev(at('3-02', 0.2), 'chains', { dur: 2.6, size: 0.8, pan: 0.4 });
  ev(C.embargo, 'seal', { size: 1, pan: 0.2 }); ev(C.embargo + 0.05, 'crunch', { pan: 0.1 });
  ev(at('3-04', 0.25), 'heart', { pan: -0.5 }); ev(at('3-04', 1.35), 'heart', { pan: -0.5 }); ev(at('3-04', 0.8), 'chips', { size: 0.15, pan: -0.5, gain: 0.6 });
  ev(at('3-05', 0.2), 'chips', { size: 1, pan: 0.4 }); ev(at('3-05', 0.6), 'groan', { dur: 2.2, pan: 0.4 }); ev(at('3-05', 2.2), 'press', { size: 1, pan: 0.4 });
  ev(at('3-06', 0.3), 'chips', { size: 0.1, pan: -0.4, gain: 0.6 }); ev(at('3-06', 0.7), 'press', { size: 0.3, pan: -0.4 }); ev(at('3-06', 1.2), 'tick', { gain: 0.7 });
  ev(C.tiny + 0.03, 'snap'); ev(C.tiny + 0.1, 'collapse'); ev(C.avalanche + 0.05, 'avalanche', { dur: 2.9, size: 1, pan: 0.3 }); ev(at('3-08', 2.4), 'blink', { pan: 0.5 });
  ev(at('3-09', 0.05), 'flaps', { dur: 0.6 }); ev(at('3-09', 0.5), 'hang');
  ev(at('3-10', 0.1), 'gate'); ev(at('3-10', 0.6), 'cart', { dur: 1.3 }); ev(C.reject, 'seal', { size: 1, pan: -0.2 }); ev(C.reject + 0.2, 'cart', { dur: 1.2, pitch: -1 });
  ev(at('3-12', 0.05), 'kiln', { dur: 2.4, pan: -0.4 }); for (let i = 0; i < 8; i++) ev(at('3-12', 0.5 + i * 0.22), 'brick', { pan: -0.4 + 0.05 * i });
  // seq 4: dirty tricks
  ev(at('4-01', 0.1), 'reel', { dur: 1.2, pan: 0.4 }); ev(at('4-01', 1.4), 'zip', { pan: 0.4 }); ev(at('4-02', 0.6), 'brush'); ev(at('4-02', 0.9), 'flaps', { dur: 0.6 });
  ev(at('4-03', 0.1), 'flaps', { dur: 0.9 }); ev(C.bomb + 0.05, 'bomb'); ev(C.bomb + 0.5, 'flaps', { dur: 0.3 });
  [['4-05', 0.4], ['4-06', -0.5], ['4-07', 0.5], ['4-08', 0.4], ['4-09', -0.4], ['4-10', -0.3]].forEach(([id, pan]) => ev(at(id, 0.05), 'point', { pan }));
  ev(at('4-09', 0.1), 'paper', { dur: 0.25, size: 0.3, pan: -0.4 }); ev(at('4-11', 0.5), 'books', { dur: 1.3, pan: 0.3 });
  // seq 4-13 .. 5: the card-maker: the heart at 54 bpm, the presses
  for (let t = at('4-13', 0.25); t < C.rush - 0.1; t += 60 / 54) ev(t, 'heart', { gain: 0.9 });
  ev(at('5-01', 0.35), 'press', { size: 0.5, gain: 0.6 }); for (const k of [0.9, 2.3, 3.7]) ev(at('5-02', k), 'press', { size: 0.4, gain: 0.45 });
  ev(at('5-06', 0.05), 'lever', { pan: -0.3 }); ev(at('5-06', 0.07), 'lever', { pan: 0.3 }); ev(at('5-06', 0.3), 'press', { pan: -0.3, gain: 0.6 }); ev(at('5-06', 0.31), 'press', { pan: 0.3, gain: 0.6 });
  // seq 6: acceleration
  ev(at('6-01', 0.05), 'flaps', { dur: 0.9 }); for (let t = at('6-02'); t < ROW['6-02'].t1; t += 0.07) { const p = r() * 2 - 1; ev(t, 'throw', { pan: p * 0.7, gain: 0.5 }); ev(t + 0.25, 'slap', { pan: p * 0.3, gain: 0.5, size: 0.35 }); }
  ev(at('6-03', 0.05), 'flaps', { dur: 0.7 }); ev(at('6-04', 0.3), 'clank', { pan: 0.4 }); ev(at('6-05', 0.3), 'crumble', { pan: -0.4 }); ev(at('6-06', 0.2), 'crackle', { pan: 0.4 }); ev(at('6-07', 0.15), 'boomL', { pan: -0.3 });
  ev(at('6-08', 0.05), 'paper', { dur: 1.6, size: 0.6 }); ev(at('6-08', 0.1), 'heart', { gain: 0.8 }); ev(at('6-08', 1.55), 'heart', { gain: 0.8 });
  // seq 9: jokers wild
  ev(C.launch, 'storm', { dur: C.pair - C.launch, size: 1, gain: 1 }); ev(C.launch + 0.1, 'whoosh', { size: 1, pan: -0.5 }); ev(C.launch + 0.12, 'whoosh', { size: 1, pan: 0.5 });
  ev(at('9-08', 0.4), 'tick', { gain: 0.6, pan: -0.15 }); ev(at('9-08', 0.75), 'tick', { gain: 0.6, pan: 0.15 });
  ev(at('9-10', 0.15), 'heart', { gain: 1.4, size: 0.8, who: 'openai' }); ev(at('9-10', 1.05), 'heart', { gain: 1.4, size: 0.8, who: 'openai' });
  ev(C.bomb2, 'kingbomb'); ev(C.wave + 0.03, 'wave', { dur: 3.8 });
  // seq 10: the new king
  ev(C.king + 0.08, 'tornado', { dur: 4.4, size: 1 }); ROW['10-04'].cuts.forEach((c, i) => ev(c.t0 + 0.05, 'flatten', { pan: i % 2 ? 0.5 : -0.5, size: 0.8 }));
  for (const [k, p] of [[0.2, -0.4], [0.35, 0.4], [1.3, -0.4], [1.47, 0.4]]) ev(at('10-05', k), 'heart', { pan: p, gain: 1 });
  ev(at('10-06', 0.3), 'flatten', { pan: -0.4, size: 1 }); ev(at('10-06', 0.3), 'flatten', { pan: 0.4, size: 1 });
  // seq 11: the shim; the last heartbeats drift onto the tick grid
  ev(C.tilt + 0.05, 'tilt'); ev(C.tilt + 0.3, 'creakL', { dur: 1.5, size: 1 }); [0.2, 0.8, 1.5].forEach((k) => ev(at('11-02', k), 'fold', { size: 1 }));
  ev(C.shim + 0.15, 'thud'); ev(C.flick + 0.12, 'flick'); for (let i = 0; i < 12; i++) ev(at('11-05', 0.3 + i * 0.45), 'flaps', { dur: 0.12, gain: 0.6 });
  [0.4, 1.45, 2.42, 3.3, 4.08, 4.79, 5.42].forEach((k, i) => ev(Math.round((at('11-05', k)) * 24 / (i < 4 ? 1 : 3)) / 24 * (i < 4 ? 1 : 3), 'heart', { gain: 0.8 - 0.06 * i }));
  // the AI clock outside the reel: every 3rd frame (every 2nd in 5-02 .. 6-09), none inside the gates
  const G = gates();
  for (let f = Math.ceil(0.5 * 24); f < C.credits * 24; f++) {
    const t = f / 24; if ((t >= REEL.t0 && t < REEL.t1) || G.some(([a, b]) => t >= a - 0.01 && t < b)) continue;
    const dens = t >= ROW['5-02'].t0 && t < REEL.t0 ? 2 : 3;
    if (f % dens === 0) ev(t, 'tick', { gain: t >= C.stop && t < C.rush ? 0.2 : 0.3, pan: (r() - 0.5) * 0.6, size: 0.3 });
  }
  return E;
}
function mergePreview(real) {
  // a sequence is "directed" when the real list has any non-tick event in it
  const directed = new Set(); for (const e of real) if (e.kind !== 'tick') { const s = SEQS.find((q) => e.t >= q.t0 && e.t < q.t1); if (s) directed.add(s.num); }
  const syn = synthetic().filter((e) => { const s = SEQS.find((q) => e.t >= q.t0 && e.t < q.t1); return e.kind === 'tick' || !s || !directed.has(s.num); });
  const realTicks = real.some((e) => e.kind === 'tick' && (e.t < REEL.t0 - 0.1 || e.t > REEL.t1 + 0.1));
  return { events: [...real, ...syn.filter((e) => e.kind !== 'tick' || !realTicks)], directed: [...directed].sort((a, b) => a - b) };
}

// ============================================================ render
const real = soundEvents(), preview = arg('--preview');
const { events, directed } = preview ? mergePreview(real) : { events: real, directed: [] };
const t0 = performance.now();
const res = renderScore(SR, { report: true, stems: [0, DURATION], events });
const ms = performance.now() - t0;
const { L, R, report } = res;
mkdirSync(outDir, { recursive: true });
const scoreName = preview ? 'score-preview.wav' : 'score.wav';
writeFileSync(join(outDir, scoreName), encodeWav([L, R], SR));
const r0 = Math.round(REEL.t0 * SR), r1 = Math.round(REEL.t1 * SR), rn = r1 - r0;
const RL = L.slice(r0, r1), RR = R.slice(r0, r1);
{ const e = Math.round(0.002 * SR); for (let i = 0; i < e; i++) { const k = i / e; RL[i] *= k; RR[i] *= k; RL[rn - 1 - i] *= k; RR[rn - 1 - i] *= k; } }
if (!preview) {
  writeFileSync(join(outDir, 'reel.wav'), encodeWav([RL, RR], SR));
  for (const [k, b] of Object.entries(res.stems)) writeFileSync(join(outDir, `stem-${k}.wav`), encodeWav([b.L.slice(r0, r1), b.R.slice(r0, r1)], SR));
}
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const f1 = (x) => (x <= -119 ? '  -inf' : x.toFixed(1).padStart(6));
console.log(`${preview ? 'PREVIEW (synthetic events fill the undirected sequences; directed: ' + (directed.join(',') || 'none') + ')' : 'FILM (real events only)'}`);
console.log(`render: ${ms.toFixed(0)} ms  ${JSON.stringify(report.timingsMs)}  events: ${report.events}`);
{ const lb = report.limiterBlocks.slice().sort((a, b) => a[1] - b[1]).slice(0, 8); console.log(`limiter: deepest ${report.limiterGrDb} dB; worst 0.1 s blocks: ${lb.map(([t, g]) => `${tc(t)} ${g}`).join(', ')}; glue ${report.glueGrDb} dB; staging ref (march before the crack, pre-master) ${report.refLufs} LUFS, master gain ${report.masterGainDb} dB`); }
let clip = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.9999 || Math.abs(R[i]) >= 0.9999) clip++;
console.log(`score: ${L.length} samples = ${(L.length / SR).toFixed(3)} s  sample peak ${report.peakDb} dBFS  true peak ${report.truePeakDb} dBTP  clipped ${clip}`);
const tpR = truePeak(RL, RR);
console.log(`reel:  ${rn} samples = ${(rn / SR).toFixed(4)} s  sample peak ${db(tpR.sample).toFixed(3)} dBFS  true peak ${db(tpR.true).toFixed(3)} dBTP`);
if (Object.keys(report.unknown).length) console.log(`UNKNOWN event kinds (silent): ${JSON.stringify(report.unknown)}`);

// ---- loudness
const E = loudnessCum(L, R, SR), iAt = (t) => Math.round(t * SR);
const M = (t) => lufs(E, iAt(t - 0.4), iAt(t)), ST = (t) => lufs(E, iAt(t - 3), iAt(t)), STc = (t) => lufs(E, iAt(t - 1.5), iAt(t + 1.5));
console.log(`film integrated ${integrated(E, 0, L.length, SR).toFixed(1)} LUFS, LRA ${loudnessRange(E, 0, L.length, SR).toFixed(1)} LU | reel integrated ${integrated(E, r0, r1, SR).toFixed(1)} LUFS, LRA ${loudnessRange(E, r0, r1, SR).toFixed(1)} LU`);

// ---- per row over the film
console.log('\nrow     film t0   dur  cue  |  peak  LUFS: M max  M min  mean  | edge jump / local');
const jump = (t) => { const i0 = Math.max(1, iAt(t - 0.03)), i1 = Math.min(L.length, iAt(t + 0.03)); let j = 0, e = 0; for (let i = i0; i < i1; i++) { j = Math.max(j, Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1])); e += L[i] * L[i] + R[i] * R[i]; } return [db(j), db(Math.sqrt(e / (2 * (i1 - i0))))]; };
const rows = [...new Set(SHOTS.map((s) => s.row))];
for (const id of rows) {
  const a = ROW[id].t0, b = ROW[id].t1, cue = SHOTS.find((s) => s.row === id).cue;
  let p = 0; for (let i = iAt(a); i < Math.min(L.length, iAt(b)); i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  let mM = -120, mm = 120; for (let t = a + 0.05; t <= b + 1e-9; t += 0.05) { const v = lufs(E, iAt(Math.max(a, t - 0.4)), iAt(t)); mM = Math.max(mM, v); mm = Math.min(mm, v); }
  const [j, jr] = jump(a);
  console.log(`${id.padEnd(6)} ${tc(a)} ${(b - a).toFixed(2).padStart(5)} ${cue.padEnd(4)} | ${f1(db(p))}  ${f1(mM)} ${f1(mm)} ${f1(lufs(E, iAt(a), iAt(b)))} | ${f1(j)} / ${f1(jr)}`);
}

// ---- sync points
console.log('\nsync point              film time   LUFS-M (0.4 s)   LUFS-S (3 s, trailing)   LUFS-S (centred)');
const SP = [['CUES.open', C.open], ['CUES.title', C.title], ['CUES.jam', C.jam], ['2-21 double slam', ROW['2-21'].t0], ['CUES.embargo', C.embargo], ['CUES.tiny (fanfare cut)', C.tiny],
  ['CUES.avalanche', C.avalanche], ['CUES.reject', C.reject], ['CUES.sacks', C.sacks], ['CUES.stop', C.stop], ['CUES.look', C.look], ['CUES.fed', C.fed], ['CUES.button', C.button],
  ['CUES.cigars (march in)', C.cigars], ['CUES.crack', C.crack], ["ROW['8-02'].t0 (freeze)", ROW['8-02'].t0], ["ROW['8-03'].t0 (hole)", ROW['8-03'].t0], ["ROW['8-06'].t0 (cancel)", ROW['8-06'].t0],
  ["ROW['8-08'].t0 (rise)", ROW['8-08'].t0], ['REEL.t1 - 0.1', REEL.t1 - 0.1], ['CUES.pair', C.pair], ['CUES.heart', C.heart], ['CUES.bomb2 (JOKERS WILD)', C.bomb2], ['CUES.wave', C.wave],
  ['CUES.king', C.king], ['CUES.flatten', C.flatten], ['CUES.lastTwo', C.lastTwo], ['CUES.tilt', C.tilt], ['CUES.last', C.last], ['CUES.credits', C.credits]];
for (const [k, t] of SP) console.log(`${k.padEnd(24)} ${tc(t)}     ${f1(M(t))}            ${f1(ST(t))}                 ${f1(STc(t))}`);

// ---- walls and holes (SCRIPT.md section 7)
console.log('\nwalls (>= -12 LUFS-S; the loudest 3 s window ending inside the span) and holes (<= -40; the loudest 3 s window inside the span, or for a short span its own average and loudest 0.4 s)');
// point walls: the 3 s windows ending from the hit to 2.5 s after it; spans: windows ending inside the span
const WALLS = [['0:42-0:45', 42, 45], ['0:59', C.embargo, C.embargo + 2.5], ['1:11', C.avalanche, ROW['3-08'].t1 + 0.5], ['1:17', C.reject, C.reject + 2.5], ['1:33', ROW['4-12'].t0, C.stop], ['1:50-1:57', 110, 117], ['2:15', C.crack, C.crack + 0.5], ['2:29-2:32', ROW['9-03'].t0, C.pair], ['2:38-2:43', C.bomb2, 163]];
for (const [k, a, b] of WALLS) { let m = -120; for (let t = a; t <= b + 1e-9; t += 0.05) m = Math.max(m, ST(t)); console.log(`  wall ${k.padEnd(10)} max LUFS-S ${f1(m)}  ${m >= -12 ? 'ok' : 'LOW'}`); }
// 2:32-2:38 (SCRIPT section 7) runs through the heartbeat of 9-10 up to the sub swell (0.7 s before the flash)
const HOLES = [['1:34-1:48', C.stop, C.levers], ['2:17-2:20', C.float1, ROW['8-04'].t1], ['2:32-2:38', C.pair, C.bomb2 - 0.7], ['2:56', C.lastTwo, ROW['10-06'].t0]];
for (const [k, a, b] of HOLES) {
  let m = -120; if (b - a >= 3) for (let t = a + 3; t <= b + 1e-9; t += 0.05) m = Math.max(m, ST(t));
  let mM = -120; for (let t = a + 0.4; t <= b + 1e-9; t += 0.02) mM = Math.max(mM, M(t));
  const avg = lufs(E, iAt(a), iAt(b)); console.log(`  hole ${k.padEnd(10)} ${b - a >= 3 ? `max LUFS-S ${f1(m)}` : `(short span) average ${f1(avg)}`}  loudest 0.4 s ${f1(mM)}  ${(b - a >= 3 ? m : avg) <= -40 ? 'ok' : 'HIGH'}`);
}
{ const v = []; for (let t = ROW['7-10'].t0 + 0.4; t <= ROW['7-10'].t1; t += 0.05) v.push(M(t)); v.sort((a, b) => a - b); const q = (p) => v[Math.round(p * (v.length - 1))];
  console.log(`march flatness over 7-10: LUFS-M p10 ${q(0.1).toFixed(1)} p90 ${q(0.9).toFixed(1)} -> range ${(q(0.9) - q(0.1)).toFixed(1)} dB`); }
// ---- every shot against its planned loudness (shots.txt column 9: 0 digital zero, 1 hole <= -40, 2 light,
// 3 medium, 4 loud, 5 wall >= -12; tools/shotlist.py draws them at -70/-42/-30/-22/-16/-11 LUFS):
// walls and holes are judged on the shot's own loudness (mean K-weighted power over the shot); 2-4 are
// listed when the shot is more than 6 LU off its class
{
  const PLAN = { 0: -70, 1: -42, 2: -30, 3: -22, 4: -16, 5: -11 }, rowsP = {};
  for (const s of SHOTS) { const r = rowsP[s.row] ?? (rowsP[s.row] = { id: s.row, t0: ROW[s.row].t0, t1: ROW[s.row].t1, loud: s.loud }); r.loud = Math.max(r.loud, s.loud); }
  const walls = [], holes = [], off = [];
  for (const r of Object.values(rowsP)) {
    // a hole shot is judged from 0.1 s after its cut (the cut itself ends the shot before it), and 9-10 up to the
    // sub swell (the swell pre-laps the bomb by 0.7 s by design)
    const h0 = r.loud === 1 && r.t0 > 0 ? r.t0 + 0.1 : r.t0, h1 = r.loud === 1 && r.t0 < C.bomb2 && r.t1 > C.bomb2 - 0.7 ? C.bomb2 - 0.7 : r.t1;
    const mean = lufs(E, iAt(h0), iAt(h1)), d = mean - PLAN[r.loud];
    if (r.loud === 5) walls.push(`${r.id} ${f1(mean).trim()}${mean >= -12 ? '' : ' LOW'}`);
    else if (r.loud === 1) holes.push(`${r.id} ${f1(mean).trim()}${mean <= -40 ? '' : ' HIGH'}`);
    else if (r.loud >= 2 && Math.abs(d) > 6) off.push(`${r.id} ${d > 0 ? '+' : ''}${d.toFixed(1)} (${r.loud}: ${f1(mean).trim()})`);
  }
  console.log(`\nplanned loudness per shot (shots.txt):\n  wall shots (>= -12, own mean): ${walls.join(', ')}\n  hole shots (<= -40, own mean): ${holes.join(', ')}\n  light/medium/loud shots > 6 LU off their class: ${off.join(', ') || 'none'}`);
}
// ---- the gates: exact digital zero
{ const bad = report.gates.map(([a, b, id]) => { let nz = 0; for (let i = iAt(a); i < Math.min(L.length, iAt(b)); i++) if (L[i] !== 0 || R[i] !== 0) nz++; return `${id} ${tc(a)}..${tc(b)}: ${nz ? nz + ' NON-ZERO samples' : 'exact zero'}`; });
  console.log(`\ngates: ${bad.join(' | ')}`); }

// ---- click scan: one sample jump far bigger than every other jump within 5 ms before AND after
const clickScan = (A, B, off = 0) => {
  const w = Math.round(0.005 * SR), hits = [];
  for (const X of [A, B]) {
    for (let i = w + 1; i + w < X.length; i++) {
      const d = Math.abs(X[i] - X[i - 1]); if (d < 0.004) continue;
      let a = 0, b = 0; for (let k = 2; k <= w; k++) { a = Math.max(a, Math.abs(X[i - k] - X[i - k - 1])); b = Math.max(b, Math.abs(X[i + k] - X[i + k - 1])); }
      if (d > 4 * Math.max(a, b) + 1e-4) { hits.push([(i + off) / SR, d, Math.max(a, b)]); i += w; }
    }
  }
  return hits.sort((x, y) => x[0] - y[0]);
};
{ const h = clickScan(L, R), edges = report.gates.flatMap(([a, b]) => [a, b]), intended = (t) => edges.some((g) => Math.abs(g - t) < 0.004);
  const bad = h.filter(([t]) => !intended(t));
  console.log(`click scan (whole film): ${h.length} discontinuities, ${h.length - bad.length} at gate edges (intended)` + (bad.length ? `; OTHER: ${bad.slice(0, 16).map(([t, d, r]) => `${tc(t)} ${d.toFixed(3)}/${r.toFixed(4)}`).join(', ')}` : '; no others')); }

// ---- struck-tone scan (xylophone / glockenspiel / music-box territory) over the whole film
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
function strikes(A, B, off, evs) {
  const Nf = 2048, hop = 256, b0 = Math.round(700 * Nf / SR), b1 = Math.round(8000 * Nf / SR), win = Float64Array.from({ length: Nf }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf));
  const re = new Float64Array(Nf), im = new Float64Array(Nf), out = []; let open = new Map(), prev = [];
  const hist = [];
  for (let s = 0, f = 0; s + Nf <= A.length; s += hop, f++) {
    for (let i = 0; i < Nf; i++) { re[i] = (A[s + i] + B[s + i]) * 0.5 * win[i]; im[i] = 0; }
    fft(re, im); const m = new Float32Array(b1 + 3); for (let k = 0; k < b1 + 3; k++) m[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-20);
    hist.push(m); if (hist.length > 4) hist.shift();
    const nopen = new Map();
    for (let k = b0; k <= b1; k++) {
      if (!(m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] > m[k - 2] && m[k] > m[k + 2])) continue;
      const nb = []; for (let q = k - 24; q <= k + 24; q += 3) if (q > 0) nb.push(m[q]); nb.sort((x, y) => x - y);
      if (m[k] - nb[nb.length >> 1] <= 18 || m[k] <= -75) continue;
      let tr = null; for (const d of [0, -1, 1, -2, 2]) if (open.has(k + d)) { tr = open.get(k + d); open.delete(k + d); break; }
      if (!tr) { tr = { f0: f, k, lv: [], pre: hist.length >= 4 ? hist[0][k] : -120 }; }
      tr.lv.push(m[k]); tr.k = k; nopen.set(k, tr);
    }
    for (const tr of open.values()) done(tr);
    open = nopen;
  }
  for (const tr of open.values()) done(tr);
  function done(tr) {
    if (tr.lv.length < 15) return;
    const mx = Math.max(...tr.lv), ix = tr.lv.indexOf(mx);
    if (ix > 1 || mx - tr.pre < 20) return;
    let mono = 0; for (let i = ix + 1; i < tr.lv.length; i++) if (tr.lv[i] <= tr.lv[i - 1] + 0.3) mono++;
    if (mono < 0.8 * (tr.lv.length - ix - 1) || mx - tr.lv[Math.min(tr.lv.length - 1, ix + 10)] < 4) return;
    const t = (off + tr.f0 * hop + Nf / 2) / SR; let near = null, nd = 1e9; for (const e of evs) { const d = Math.abs(e.t - t); if (d < nd && e.kind !== 'tick') { nd = d; near = e; } }
    out.push({ t, f: tr.k * SR / Nf, ev: nd < 0.06 ? near.kind : null });
  }
  out.sort((a, b) => a.t - b.t);
  const S = []; for (const s of out) { const l = S[S.length - 1]; if (l && s.t - l.t < 0.02) { if (s.f < l.f) l.f = s.f; } else S.push({ ...s }); }
  return S;
}
{ const nm = (f) => { const m = Math.round(69 + 12 * Math.log2(f / 440)); return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1); };
  const sMus = strikes(res.stems.music.L, res.stems.music.R, 0, events), sMix = strikes(L, R, 0, events);
  const by = {}; for (const s of sMix) { const k = s.ev ?? 'NO EVENT'; by[k] = (by[k] || 0) + 1; }
  console.log(`\nstruck-tone scan (700 Hz-8 kHz, attack <= 5 ms, free decay >= 80 ms), whole film:`);
  console.log(`  music stem: ${sMus.length} strikes` + (sMus.length ? ': ' + sMus.slice(0, 12).map((s) => `${tc(s.t)} ${s.f.toFixed(0)}Hz (${nm(s.f)})`).join(', ') : ' (no mallet-like tone anywhere in the music)'));
  console.log(`  full mix:   ${sMix.length} strikes, by nearest picture event: ${JSON.stringify(by)}`);
  const METAL = ['clink', 'cover', 'relay', 'chains', 'strain', 'crackG', 'alarm', 'click', 'buzz', 'string', 'switch', 'hang', 'clank', 'seal', 'crunch', 'gate', 'cart', 'press', 'lever', 'kingbomb', 'chips', 'chipflow', 'avalanche', 'brick', 'reel'];
  const ok = sMix.filter((s) => !METAL.includes(s.ev)); let runs = 0;
  for (let i = 0; i < ok.length; i++) { const w = ok.filter((s) => s.t >= ok[i].t && s.t < ok[i].t + 1.5), p = new Set(w.map((s) => nm(s.f))); if (w.length >= 3 && p.size >= 3) runs++; }
  console.log(`  melodic struck runs outside glass / metal / chip events: ${runs}`); }

// ---- band energies per sequence
{ const BANDS = [[20, 60], [60, 250], [250, 2000], [2000, 8000], [8000, 20000]], Nf = 4096;
  console.log('\nseq  name        sub<60  low   mid   high  air>8k   (dB, mean power per band)');
  for (const q of SEQS) {
    const a = iAt(q.t0), b = iAt(q.t1), acc = BANDS.map(() => 0); let nfr = 0;
    for (let s = a; s + Nf <= b; s += Nf) { const re = new Float64Array(Nf), im = new Float64Array(Nf); for (let i = 0; i < Nf; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf)); fft(re, im);
      BANDS.forEach(([lo, hi], j) => { for (let k = Math.ceil(lo * Nf / SR); k < Math.min(Nf / 2, hi * Nf / SR); k++) acc[j] += (re[k] * re[k] + im[k] * im[k]) / (Nf * Nf / 4); }); nfr++; }
    console.log(`${String(q.num).padEnd(4)} ${q.name.padEnd(5)}\t${acc.map((x) => f1(10 * Math.log10(x / Math.max(1, nfr) + 1e-20))).join(' ')}`);
  } }

if (arg('--twice')) { const b = renderScore(SR, { events }); let diff = 0; for (let i = 0; i < L.length; i++) if (L[i] !== b.L[i] || R[i] !== b.R[i]) diff++; console.log(`\ndeterminism: second render ${diff === 0 ? 'BIT-IDENTICAL' : `differs in ${diff} samples`}`); }
if (arg('--cues')) { console.log('\ncues:'); for (const [t, k, l] of report.cues) console.log(`  ${tc(t)}  ${k.padEnd(5)} ${l}`); }
const ff = (a) => spawnSync('ffmpeg', a, { encoding: 'utf8' });
const chk = ff(['-hide_banner', '-nostats', '-i', join(outDir, scoreName), '-af', 'ebur128=peak=true+sample', '-f', 'null', '-']);
if (!chk.error) {
  const s = chk.stderr.split('Summary:')[1] ?? '', g = (re) => (s.match(re) ?? [])[1];
  console.log(`\nffmpeg ebur128 (${scoreName}): I ${g(/I:\s+(-?[\d.]+) LUFS/)} LUFS  LRA ${g(/LRA:\s+([\d.]+) LU/)} LU  sample peak ${g(/Sample peak:\s+Peak:\s+(-?[\d.]+)/)} dBFS  true peak ${g(/True peak:\s+Peak:\s+(-?[\d.]+)/)} dBTP`);
  if (!arg('--no-spec')) {
    if (!preview) ff(['-v', 'error', '-y', '-i', join(outDir, 'reel.wav'), '-lavfi', 'showspectrumpic=s=1800x900:legend=1:color=intensity:scale=log', join(outDir, 'reel-spec.png')]);
    ff(['-v', 'error', '-y', '-i', join(outDir, scoreName), '-lavfi', 'showspectrumpic=s=2400x900:legend=1:color=intensity:scale=log', join(outDir, preview ? 'score-preview-spec.png' : 'score-spec.png')]);
    console.log('wrote the spectrograms');
  }
} else console.log('\n(ffmpeg not found: no cross-check, no spectrogram)');
console.log(`wrote ${join(outDir, scoreName)}${preview ? '' : ', reel.wav, stem-music.wav, stem-sfx.wav, stem-amb.wav'}`);
