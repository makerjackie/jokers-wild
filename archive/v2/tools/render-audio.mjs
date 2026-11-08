// Renders the score of JOKERS WILD v2 and checks it by measurement (nobody here can listen).
//   node tools/render-audio.mjs [--twice] [--async] [--cues] [--no-spec] [--kinds]
//   --twice     render again and compare bit for bit (determinism)
//   --async     render with renderScoreAsync too and compare bit for bit
//   --kinds     only the event-kind sheet: every kind once, solo, at its mix level -> out/kinds.wav (+ stats)
// writes  out/score.wav                         the whole film with the director's events, 48 kHz 16-bit stereo
//         out/reel.wav                          the tone reel (REEL: Claude at the button .. the jokers rising)
//         out/stem-{music,sfx,amb}.wav          the three layers over M7 .. M8 (pre-glue/limiter, same make-up gain)
//         out/score-spec.png, out/reel-spec.png ffmpeg showspectrumpic
//         out/levels.txt                        this report
// prints  per-row levels, loudness at the sync points, the walls and holes of SCRIPT.md, every shot against its
//         planned loudness (shots.txt), the march's flatness, the gates (exact zero), sample / true peak, the
//         limiter's worst moments, a click scan, a struck-tone ("mallet") scan, band energies per sequence, an ffmpeg
//         ebur128 cross-check.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderScore, renderScoreAsync, encodeWav, gates } from '../src/audio.js';
import { SHOTS, SHOT, ROW, CUES, REEL, DURATION, SEQS } from '../src/shots.js';
import { soundEvents } from '../src/sound-events.js';
import { loudnessCum, lufs, integrated, loudnessRange, truePeak } from '../src/audio-master.js';
import { SFX_KINDS } from '../src/audio-sfxlib.js';
import { MIX } from '../src/audio-sfx.js';
import { setSR } from '../src/audio-dsp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), outDir = join(root, 'out');
const SR = 48000, arg = (k) => process.argv.includes(k), C = CUES;
const tc = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const f1 = (x) => (x <= -119 ? '  -inf' : x.toFixed(1).padStart(6));
const LOG = []; const log = (...a) => { const s = a.join(' '); LOG.push(s); console.log(s); };
mkdirSync(outDir, { recursive: true });

// ============================================================ the kind sheet
if (arg('--kinds')) {
  setSR(SR);
  const kinds = Object.keys(SFX_KINDS).filter((k) => k !== 'cardCloud'), gap = 2.6, n = Math.ceil((kinds.length * gap + 2) * SR), L = new Float32Array(n), R = new Float32Array(n);
  log('kind          mix  | peak dBFS  LUFS-M max  dur s   (each at gain 1 x its MIX level, dur 1.2, size 0.6, solo)');
  kinds.forEach((k, i) => {
    const e = { t: 1 + i * gap, kind: k, gain: 1, pan: 0, pitch: 0, dur: 1.2, size: 0.6, who: 'US' }, s = SFX_KINDS[k](e, 4321 + i), g = (MIX[k] ?? [1])[0];
    const a = s instanceof Float32Array ? s : s.L, b = s instanceof Float32Array ? s : s.R, at = Math.round(e.t * SR), m = Math.round(gap * SR) - 10;
    for (let j = 0; j < Math.min(a.length, m); j++) { L[at + j] += a[j] * g * (s instanceof Float32Array ? Math.SQRT1_2 : 1); R[at + j] += b[j] * g * (s instanceof Float32Array ? Math.SQRT1_2 : 1); }
    const E = loudnessCum(L, R, SR, at, at + m); let mm = -120; for (let q = Math.round(0.4 * SR); q < m; q += Math.round(0.02 * SR)) mm = Math.max(mm, lufs(E, q - Math.round(0.4 * SR), q));
    let pk = 0; for (let j = at; j < at + m; j++) pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j]));
    log(`${k.padEnd(13)} ${g.toFixed(2).padStart(4)} | ${f1(db(pk))}    ${f1(mm)}     ${(a.length / SR).toFixed(2)}`);
  });
  writeFileSync(join(outDir, 'kinds.wav'), encodeWav([L, R], SR));
  writeFileSync(join(outDir, 'kinds.txt'), LOG.join('\n') + '\n');
  log(`wrote ${join(outDir, 'kinds.wav')}`);
  process.exit(0);
}

// ============================================================ render
const events = soundEvents();
const t0 = performance.now();
const res = renderScore(SR, { report: true, stems: [C.auto, C.launch], events });
const ms = performance.now() - t0;
const { L, R, report } = res;
writeFileSync(join(outDir, 'score.wav'), encodeWav([L, R], SR));
const r0 = Math.round(REEL.t0 * SR), r1 = Math.round(REEL.t1 * SR), rn = r1 - r0;
const RL = L.slice(r0, r1), RR = R.slice(r0, r1);
{ const e = Math.round(0.002 * SR); for (let i = 0; i < e; i++) { const k = i / e; RL[i] *= k; RR[i] *= k; RL[rn - 1 - i] *= k; RR[rn - 1 - i] *= k; } }
writeFileSync(join(outDir, 'reel.wav'), encodeWav([RL, RR], SR));
for (const [k, b] of Object.entries(res.stems)) writeFileSync(join(outDir, `stem-${k}.wav`), encodeWav([b.L, b.R], SR));
log(`FILM: the director's events (${events.length}) + the score's own ambience; ${report.events} rendered`);
log(`render: ${ms.toFixed(0)} ms  ${JSON.stringify(report.timingsMs)}`);
{ const lb = report.limiterBlocks.slice().sort((a, b) => a[1] - b[1]).slice(0, 8); log(`limiter: deepest ${report.limiterGrDb} dB; worst 0.1 s blocks: ${lb.map(([t, g]) => `${tc(t)} ${g}`).join(', ')}; glue ${report.glueGrDb} dB; staging ref (the march over 7-10, pre-master) ${report.refLufs} LUFS, master gain ${report.masterGainDb} dB`); }
let clip = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.9999 || Math.abs(R[i]) >= 0.9999) clip++;
log(`score: ${L.length} samples = ${(L.length / SR).toFixed(3)} s  sample peak ${report.peakDb} dBFS  true peak ${report.truePeakDb} dBTP  clipped ${clip}`);
if (Object.keys(report.unknown).length) log(`UNKNOWN event kinds (silent): ${JSON.stringify(report.unknown)}`);
for (const [, k, l] of report.cues.filter(([, k]) => k === 'SFX')) log(`  ${k} ${l}`);

// ---- loudness
const E = loudnessCum(L, R, SR), iAt = (t) => Math.round(t * SR);
const M = (t) => lufs(E, iAt(t - 0.4), iAt(t)), ST = (t) => lufs(E, iAt(t - 3), iAt(t)), STc = (t) => lufs(E, iAt(t - 1.5), iAt(t + 1.5));
const I = integrated(E, 0, L.length, SR);
log(`film integrated ${I.toFixed(1)} LUFS, LRA ${loudnessRange(E, 0, L.length, SR).toFixed(1)} LU | reel integrated ${integrated(E, r0, r1, SR).toFixed(1)} LUFS`);

// ---- per row over the film
log('\nrow     film t0   dur  cue  | plan |  peak  LUFS: M max  M min  mean  | edge jump / local');
const jump = (t) => { const i0 = Math.max(1, iAt(t - 0.03)), i1 = Math.min(L.length, iAt(t + 0.03)); let j = 0, e = 0; for (let i = i0; i < i1; i++) { j = Math.max(j, Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1])); e += L[i] * L[i] + R[i] * R[i]; } return [db(j), db(Math.sqrt(e / (2 * (i1 - i0))))]; };
const rows = [...new Set(SHOTS.map((s) => s.row))];
for (const id of rows) {
  const a = ROW[id].t0, b = ROW[id].t1, s0 = SHOTS.find((s) => s.row === id), loud = Math.max(...ROW[id].cuts.map((c) => c.loud));
  let p = 0; for (let i = iAt(a); i < Math.min(L.length, iAt(b)); i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  let mM = -120, mm = 120; for (let t = a + 0.05; t <= b + 1e-9; t += 0.05) { const v = lufs(E, iAt(Math.max(a, t - 0.4)), iAt(t)); mM = Math.max(mM, v); mm = Math.min(mm, v); }
  const [j, jr] = jump(a);
  log(`${id.padEnd(6)} ${tc(a)} ${(b - a).toFixed(2).padStart(5)} ${s0.cue.padEnd(4)} |  ${loud}   | ${f1(db(p))}  ${f1(mM)} ${f1(mm)} ${f1(lufs(E, iAt(a), iAt(b)))} | ${f1(j)} / ${f1(jr)}`);
}

// ---- sync points
log('\nsync point                 film time   LUFS-M (0.4 s)   LUFS-S (3 s, trailing)   LUFS-S (centred)');
const SP = ['open', 'code', 'stir', 'arrive', 'ladder', 'jam', 'last', 'double', 'full', 'joker1', 'lock1', 'title', 'eyes', 'unlockUS', 'embargo', 'starve', 'boast', 'unlockCN', 'r1', 'avalanche', 'kiln',
  'locks', 'plaster', 'dates', 'frenzy', 'mad', 'button', 'auto', 'cigars', 'party', 'lastLock', 'pov', 'burst', 'freeze', 'rise', 'lookup', 'cancel', 'seals', 'launch', 'collide', 'pair', 'zero', 'heart',
  'bomb', 'wave', 'king', 'tower', 'deal', 'free', 'stare', 'slam', 'flyup', 'race', 'grow', 'black', 'credits'];
for (const k of SP) log(`CUES.${k.padEnd(22)} ${tc(C[k])}     ${f1(M(C[k]))}            ${f1(ST(C[k]))}                 ${f1(STc(C[k]))}`);

// ---- walls and holes (SCRIPT.md)
log('\nwalls (>= -12 LUFS-S: the loudest 3 s window ending inside the span) and holes (<= -40: the loudest 3 s window inside the span; a span under 3 s: its own average)');
const WALLS = [['2-19 the jam (shots.txt)', C.jam, ROW['2-19'].t1 + 0.5], ['2-22 double slam', C.double, C.double + 2.5], ['4-05 EMBARGO', C.embargo, C.embargo + 2.5], ['4-11 avalanche', C.avalanche + 1, ROW['4-11'].t1 + 0.5],
  ['6-07 the frenzy', C.mad, C.button], ['8-01 the burst', C.burst, ROW['8-02'].t1], ['9-03 the walls', ROW['9-03'].t0 + 1, C.pair], ['9-07/9-08 bomb, wave', C.bomb, ROW['9-08'].t1]];
const wallRes = [];
for (const [k, a, b] of WALLS) { let m = -120, at = a; for (let t = a; t <= b + 1e-9; t += 0.05) { const v = ST(t); if (v > m) { m = v; at = t; } } wallRes.push([k, m]); log(`  wall ${k.padEnd(24)} max LUFS-S ${f1(m)} (window ending ${tc(at)})  ${m >= -12 ? 'ok' : 'LOW'}`); }
const HOLES = [['6-08 Claude, the button', C.button + 0.1, C.auto], ['8-03 the jokers rise', C.rise + 0.1, C.lookup], ['9-06 the heartbeat', C.heart + 0.02, C.bomb - 0.6], ['11-01..11-04 the stare', C.stare + 0.1, C.slam]];
const holeRes = [];
for (const [k, a, b] of HOLES) {
  let m = -120; if (b - a >= 3) for (let t = a + 3; t <= b + 1e-9; t += 0.05) m = Math.max(m, ST(t));
  let mM = -120; for (let t = a + 0.4; t <= b + 1e-9; t += 0.02) mM = Math.max(mM, M(t));
  const avg = lufs(E, iAt(a), iAt(b)), v = b - a >= 3 ? m : avg; holeRes.push([k, v]);
  log(`  hole ${k.padEnd(24)} ${b - a >= 3 ? `max LUFS-S ${f1(m)}` : `(short) average ${f1(avg)}`}  loudest 0.4 s ${f1(mM)}  ${v <= -40 ? 'ok' : 'HIGH'}`);
}
{ const v = []; for (let t = ROW['7-10'].t0 + 0.4; t <= ROW['7-10'].t1; t += 0.05) v.push(M(t)); v.sort((a, b) => a - b); const q = (p) => v[Math.round(p * (v.length - 1))];
  log(`march over 7-10: LUFS-M p10 ${q(0.1).toFixed(1)} p90 ${q(0.9).toFixed(1)} -> flatness ${(q(0.9) - q(0.1)).toFixed(1)} dB; LUFS-S at its end ${ST(ROW['7-10'].t1).toFixed(1)}`); }
// ---- every shot against its planned loudness (shots.txt column 9: 0 digital zero, 1 hole <= -40, 2 light,
// 3 medium, 4 loud, 5 wall >= -12; drawn at -70/-42/-30/-22/-16/-11 LUFS): walls and holes on the shot's own mean
// (holes from 0.1 s after the cut), 2-4 listed when more than 6 LU off their class
{
  const PLAN = { 0: -70, 1: -42, 2: -30, 3: -22, 4: -16, 5: -11 }, walls = [], holes = [], off = [];
  const G = gates();
  for (const s of SHOTS) {
    if (s.loud === 0 || G.some(([a, b]) => s.t0 >= a - 1e-6 && s.t1 <= b + 1e-6)) continue;   // the gates are digital zero by design
    const h0 = s.loud === 1 && s.t0 > 0 ? s.t0 + 0.1 : s.t0, h1 = s.loud === 1 && s.t0 < C.bomb && s.t1 > C.bomb - 0.6 ? C.bomb - 0.6 : s.t1;
    const mean = lufs(E, iAt(h0), iAt(h1)), d = mean - PLAN[s.loud];
    if (s.loud === 5) walls.push(`${s.id} ${f1(mean).trim()}${mean >= -12 ? '' : ' LOW'}`);
    else if (s.loud === 1) holes.push(`${s.id} ${f1(mean).trim()}${mean <= -40 ? '' : ' HIGH'}`);
    else if (Math.abs(d) > 6) off.push(`${s.id} ${d > 0 ? '+' : ''}${d.toFixed(1)} (${s.loud}: ${f1(mean).trim()})`);
  }
  log(`\nplanned loudness per shot (shots.txt):\n  wall shots (>= -12, own mean): ${walls.join(', ')}\n  hole shots (<= -40, own mean): ${holes.join(', ')}\n  light/medium/loud shots > 6 LU off their class: ${off.join(', ') || 'none'}`);
}
// ---- the gates: exact digital zero
{ const bad = report.gates.map(([a, b, id]) => { let nz = 0; for (let i = iAt(a); i < Math.min(L.length, iAt(b)); i++) if (L[i] !== 0 || R[i] !== 0) nz++; return `${id} ${tc(a)}..${tc(b)}: ${nz ? nz + ' NON-ZERO samples' : 'exact zero'}`; });
  log(`\ngates: ${bad.join(' | ')}`); }

// ---- click scan: one sample jump far bigger than every other jump within 5 ms before AND after
const clickScan = (A, B) => {
  const w = Math.round(0.005 * SR), hits = [];
  for (const X of [A, B]) for (let i = w + 1; i + w < X.length; i++) {
    const d = Math.abs(X[i] - X[i - 1]); if (d < 0.004) continue;
    let a = 0, b = 0; for (let k = 2; k <= w; k++) { a = Math.max(a, Math.abs(X[i - k] - X[i - k - 1])); b = Math.max(b, Math.abs(X[i + k] - X[i + k - 1])); }
    if (d > 4 * Math.max(a, b) + 1e-4) { hits.push([i / SR, d, Math.max(a, b)]); i += w; }
  }
  return hits.sort((x, y) => x[0] - y[0]);
};
{ const h = clickScan(L, R), edges = report.gates.flatMap(([a, b]) => [a, b]), intended = (t) => edges.some((g) => Math.abs(g - t) < 0.004);
  const bad = h.filter(([t]) => !intended(t));
  log(`click scan (whole film): ${h.length} discontinuities, ${h.length - bad.length} at gate edges (intended)` + (bad.length ? `; OTHER: ${bad.slice(0, 16).map(([t, d, r]) => `${tc(t)} ${d.toFixed(3)}/${r.toFixed(4)}`).join(', ')}` : '; no others')); }

// ---- struck-tone scan (xylophone / glockenspiel / music-box territory) over the music stem and the mix
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
function strikes(A, B, off, evs) {
  const Nf = 2048, hop = 256, b0 = Math.round(700 * Nf / SR), b1 = Math.round(8000 * Nf / SR), win = Float64Array.from({ length: Nf }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf));
  const re = new Float64Array(Nf), im = new Float64Array(Nf), out = []; let open = new Map();
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
      if (!tr) tr = { f0: f, k, lv: [], pre: hist.length >= 4 ? hist[0][k] : -120 };
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
  const st = res.stems.music, sMus = strikes(st.L, st.R, st.off, events), sMix = strikes(L, R, 0, events);
  const by = {}; for (const s of sMix) { const k = s.ev ?? 'NO EVENT'; by[k] = (by[k] || 0) + 1; }
  log(`\nstruck-tone scan (700 Hz-8 kHz, attack <= 5 ms, free decay >= 80 ms):`);
  log(`  music stem (M7-M8): ${sMus.length} strikes` + (sMus.length ? ': ' + sMus.slice(0, 12).map((s) => `${tc(s.t)} ${s.f.toFixed(0)}Hz (${nm(s.f)})`).join(', ') : ' (no mallet-like tone in the music)'));
  log(`  full mix: ${sMix.length} strikes, by nearest picture event: ${JSON.stringify(by)}`);
  const METAL = ['clink', 'cover', 'relay', 'chains', 'strain', 'alarm', 'click', 'buzz', 'string', 'switch', 'clank', 'seal', 'crunch', 'press', 'chips', 'chipflow', 'avalanche', 'brick', 'kingbomb',
    'keyTurn', 'lockOpen', 'lockShut', 'lockDrop', 'lidSlam', 'lidBurst', 'lidCreak', 'clockTick', 'clockRing', 'oldClock', 'sealSwing', 'sticker', 'chairStop', 'cigarDrop', 'leak', 'deal', 'stringsDrop'];
  const ok = sMix.filter((s) => !METAL.includes(s.ev)); let runs = 0;
  for (let i = 0; i < ok.length; i++) { const w = ok.filter((s) => s.t >= ok[i].t && s.t < ok[i].t + 1.5), p = new Set(w.map((s) => nm(s.f))); if (w.length >= 3 && p.size >= 3) runs++; }
  log(`  melodic struck runs outside metal / glass / chip events: ${runs}`); }

// ---- band energies per sequence
{ const BANDS = [[20, 60], [60, 250], [250, 2000], [2000, 8000], [8000, 20000]], Nf = 4096;
  log('\nseq  name        sub<60  low   mid   high  air>8k   (dB, mean power per band)');
  for (const q of SEQS) {
    const a = iAt(q.t0), b = iAt(q.t1), acc = BANDS.map(() => 0); let nfr = 0;
    for (let s = a; s + Nf <= b; s += Nf) { const re = new Float64Array(Nf), im = new Float64Array(Nf); for (let i = 0; i < Nf; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf)); fft(re, im);
      BANDS.forEach(([lo, hi], j) => { for (let k = Math.ceil(lo * Nf / SR); k < Math.min(Nf / 2, hi * Nf / SR); k++) acc[j] += (re[k] * re[k] + im[k] * im[k]) / (Nf * Nf / 4); }); nfr++; }
    log(`${String(q.num).padEnd(4)} ${q.name.padEnd(5)}\t${acc.map((x) => f1(10 * Math.log10(x / Math.max(1, nfr) + 1e-20))).join(' ')}`);
  } }

if (arg('--twice')) { const b = renderScore(SR, { events }); let diff = 0; for (let i = 0; i < L.length; i++) if (L[i] !== b.L[i] || R[i] !== b.R[i]) diff++; log(`\ndeterminism: second render ${diff === 0 ? 'BIT-IDENTICAL' : `differs in ${diff} samples`}`); }
if (arg('--async')) { let calls = 0, last = -1, mono = true; const b = await renderScoreAsync(SR, { events }, (p) => { calls++; if (p < last) mono = false; last = p; }); let diff = 0; for (let i = 0; i < L.length; i++) if (L[i] !== b.L[i] || R[i] !== b.R[i]) diff++; log(`renderScoreAsync: ${diff === 0 ? 'BIT-IDENTICAL to renderScore' : `differs in ${diff} samples`}; ${calls} progress calls, monotonic ${mono}, last ${last}`); }
if (arg('--cues')) { log('\ncues:'); for (const [t, k, l] of report.cues) log(`  ${tc(t)}  ${k.padEnd(5)} ${l}`); }
const ff = (a) => spawnSync('ffmpeg', a, { encoding: 'utf8' });
const chk = ff(['-hide_banner', '-nostats', '-i', join(outDir, 'score.wav'), '-af', 'ebur128=peak=true+sample', '-f', 'null', '-']);
if (!chk.error) {
  const s = chk.stderr.split('Summary:')[1] ?? '', g = (re) => (s.match(re) ?? [])[1];
  log(`\nffmpeg ebur128 (score.wav): I ${g(/I:\s+(-?[\d.]+) LUFS/)} LUFS  LRA ${g(/LRA:\s+([\d.]+) LU/)} LU  sample peak ${g(/Sample peak:\s+Peak:\s+(-?[\d.]+)/)} dBFS  true peak ${g(/True peak:\s+Peak:\s+(-?[\d.]+)/)} dBTP`);
  if (!arg('--no-spec')) {
    ff(['-v', 'error', '-y', '-i', join(outDir, 'reel.wav'), '-lavfi', 'showspectrumpic=s=1800x900:legend=1:color=intensity:scale=log', join(outDir, 'reel-spec.png')]);
    ff(['-v', 'error', '-y', '-i', join(outDir, 'score.wav'), '-lavfi', 'showspectrumpic=s=2400x900:legend=1:color=intensity:scale=log', join(outDir, 'score-spec.png')]);
    log('wrote the spectrograms');
  }
} else log('\n(ffmpeg not found: no cross-check, no spectrogram)');
writeFileSync(join(outDir, 'levels.txt'), LOG.join('\n') + '\n');
log(`wrote ${join(outDir, 'score.wav')}, reel.wav, stem-music.wav, stem-sfx.wav, stem-amb.wav, levels.txt`);
