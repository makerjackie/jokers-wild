// Renders the score of 《失控》 OUT OF CONTROL and checks it by measurement (nobody here can listen).
//   node tools/render-audio.mjs [--test] [--twice] [--async] [--cues] [--stems] [--no-spec] [--kinds]
//   --test      render on testEvents() (the shot table's stand-in list) instead of the director's soundEvents()
//   --twice     render again and compare bit for bit (determinism)
//   --async     render with renderScoreAsync too and compare bit for bit
//   --cues      print the score's cue report (every musical decision with its time)
//   --stems     also write out/stem-{music,sfx,amb}.wav (pre-glue/limiter, same make-up gain)
//   --kinds     only the event-kind sheet: every film kind once, solo, at its mix level -> out/kinds.wav (+ kinds.txt)
// writes  out/score.wav (48 kHz 16-bit stereo, TPDF dither; exact zeros stay zero), out/score-spec.png, out/levels.txt
//         (with --test: out/score-test.wav, out/score-test-spec.png, out/levels-test.txt)
// prints  integrated loudness / LRA, true peak, every shot against its planned loudness (shots.txt: 0 digital zero,
//         1 hole <= -40, 2 light, 3 medium, 4 loud, 5 wall >= -12), the gates, the vacuums, the sync points, the
//         limiter's worst moments, a click scan, band energies per sequence, an ffmpeg ebur128 cross-check.
// If src/sound-events.js cannot be loaded (the director is mid-edit), it says so and renders on the stand-in list.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';

let SE_BROKEN = null;
try { await import('../src/sound-events.js'); } catch (e) { SE_BROKEN = e.message; }
if (SE_BROKEN) registerHooks({ resolve(spec, ctx, next) { if (/sound-events\.js$/.test(spec)) return { url: 'data:text/javascript,export function soundEvents(){return []}', shortCircuit: true }; return next(spec, ctx); } });
const { renderScore, renderScoreAsync, encodeWav } = await import('../src/audio.js');
const { SHOTS, ROW, CUES, DURATION, SEQS } = await import('../src/shots.js');
const { soundEvents } = await import('../src/sound-events.js');
const { loudnessCum, lufs, integrated, loudnessRange } = await import('../src/audio-master.js');
const { FILM_KINDS, SCORE_KINDS } = await import('../src/audio-kinds.js');
const { MIX } = await import('../src/audio-sfx.js');
const { setSR } = await import('../src/audio-dsp.js');

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
  const KS = { ...FILM_KINDS, ...SCORE_KINDS }, kinds = Object.keys(KS).filter((k) => !['stop', 'smile', 'rage'].includes(k)), gap = 3.0, n = Math.ceil((kinds.length * gap + 2) * SR), L = new Float32Array(n), R = new Float32Array(n);
  const PAR = { antStep: { surface: 'cloth' }, cardToss: { size: 0.7, pov: 'table' }, cardSlap: { size: 1.2, hard: 0.8, pov: 'table', who: 'openai' }, cardWhoosh: { dur: 0.35 },
    chatWake: { dur: 2.4 }, typing: { dur: 2.4, n: 32 }, awe: { dur: 2 }, chuckle: { who: 'openai' }, scuffle: { dur: 1.3 }, cardSkim: { dur: 0.8 }, towerCrash: { n: 16 },
    lampSwing: { amp: 1, dur: 2.6 }, chairSlide: { who: 'glm', dur: 1.6, pan: -0.6 }, tremble: { dur: 2.2 }, breath: { dir: 'in' }, stream: { rate: 10, dur: 1.5 }, blizzard: { dur: 2.6 },
    cardsFall: { n: 40, dur: 1 }, cardStand: { i: 0 }, standWave: { dur: 2.6 }, rise: { dur: 2.2 }, lampSpin: { dur: 2.2 }, farSlap: { size: 1, dist: 1 }, leafFall: { dur: 2.4 }, smallSlap: { pov: 'table' }, yawn: { who: 'kimi' } };
  log('kind          mix  | peak dBFS  LUFS-M max  len s   (each at gain 1 x its MIX level, solo, centred)');
  kinds.forEach((k, i) => {
    const e = { t: 1 + i * gap, kind: k, gain: 1, pan: 0, pitch: 0, dur: 1.2, size: 0.6, who: 'US', ...PAR[k] }, s = KS[k](e, 4321 + i), g = (MIX[k] ?? [1])[0];
    const mono = s instanceof Float32Array, a = mono ? s : s.L, b = mono ? s : s.R, at = Math.round((e.t - (s.pre ?? 0)) * SR), m = Math.min(a.length, Math.round(gap * SR) - 10);
    for (let j = 0; j < m; j++) { L[at + j] += a[j] * g * (mono ? Math.SQRT1_2 : 1); R[at + j] += b[j] * g * (mono ? Math.SQRT1_2 : 1); }
    const E = loudnessCum(L, R, SR, at, at + m); let mm = -120; for (let q = Math.round(0.4 * SR); q < m; q += Math.round(0.02 * SR)) mm = Math.max(mm, lufs(E, q - Math.round(0.4 * SR), q));
    let pk = 0; for (let j = at; j < at + m; j++) pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j]));
    log(`${k.padEnd(13)} ${g.toFixed(2).padStart(4)} | ${f1(db(pk))}    ${f1(mm)}     ${(a.length / SR).toFixed(2)}   @ ${(e.t).toFixed(1)} s`);
  });
  writeFileSync(join(outDir, 'kinds.wav'), encodeWav([L, R], SR));
  writeFileSync(join(outDir, 'kinds.txt'), LOG.join('\n') + '\n');
  log(`wrote ${join(outDir, 'kinds.wav')}`);
  process.exit(0);
}

// ============================================================ render
if (SE_BROKEN) log(`src/sound-events.js does not load (${SE_BROKEN}): rendering on the stand-in list`);
const events = arg('--test') ? [] : soundEvents();
const t0 = performance.now();
const res = renderScore(SR, { report: true, events, test: arg('--test'), stems: arg('--stems') ? [0, DURATION] : null });
const ms = performance.now() - t0;
const { L, R, report } = res;
const OUT = arg('--test') ? 'score-test' : 'score';
writeFileSync(join(outDir, `${OUT}.wav`), encodeWav([L, R], SR));
if (res.stems) for (const [k, b] of Object.entries(res.stems)) writeFileSync(join(outDir, `stem-${k}.wav`), encodeWav([b.L, b.R], SR));
log(`《喂》 FEED ${DURATION.toFixed(2)} s: ${report.test ? 'TEST events (stand-in list)' : `the director's events (${events.length})`} + the score's own ambience; ${report.events} rendered`);
log(`render: ${ms.toFixed(0)} ms  ${JSON.stringify(report.timingsMs)}`);
{ const lb = report.limiterBlocks.slice().sort((a, b) => a[1] - b[1]).slice(0, 8); log(`limiter: deepest ${report.limiterGrDb} dB; worst 0.1 s blocks: ${lb.map(([t, g]) => `${tc(t)} ${g}`).join(', ')}; glue ${report.glueGrDb} dB; staging ref (7-01, pre-master) ${report.refLufs} LUFS, master gain ${report.masterGainDb} dB`); }
let clip = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.9999 || Math.abs(R[i]) >= 0.9999) clip++;
log(`score: ${L.length} samples = ${(L.length / SR).toFixed(3)} s  sample peak ${report.peakDb} dBFS  true peak ${report.truePeakDb} dBTP  clipped ${clip}`);
if (Object.keys(report.unknown).length) log(`UNKNOWN event kinds (silent): ${JSON.stringify(report.unknown)}`);
for (const [, k, l] of report.cues.filter(([, k]) => k === 'SFX')) log(`  ${k} ${l}`);

// ---- loudness
const E = loudnessCum(L, R, SR), iAt = (t) => Math.round(t * SR);
const M = (t) => lufs(E, iAt(t - 0.4), iAt(t)), ST = (t) => lufs(E, iAt(t - 3), iAt(t));
const I = integrated(E, 0, L.length, SR);
log(`integrated ${I.toFixed(1)} LUFS, LRA ${loudnessRange(E, 0, L.length, SR).toFixed(1)} LU`);

// ---- every shot against its planned loudness
const PLAN = { 0: -70, 1: -42, 2: -30, 3: -22, 4: -16, 5: -11 }, NAME = { 0: 'zero', 1: 'hole', 2: 'light', 3: 'med', 4: 'loud', 5: 'WALL' };
log('\nshot      t0     dur  cue | plan  | peak   M max  M min  mean (own) | verdict');
const verdicts = [];
for (const s of SHOTS) {
  const h0 = s.loud === 1 && s.t0 > 0 ? s.t0 + 0.1 : s.t0, a = iAt(h0), b = Math.min(L.length, iAt(s.t1));
  let p = 0, nz = 0; for (let i = iAt(s.t0); i < b; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > p) p = v; if (v !== 0) nz++; }
  let mM = -120, mm = 120; for (let t = s.t0 + 0.05; t <= s.t1 + 1e-9; t += 0.05) { const v = lufs(E, iAt(Math.max(s.t0, t - 0.4)), iAt(t)); mM = Math.max(mM, v); mm = Math.min(mm, v); }
  const mean = lufs(E, a, b);
  let v;
  if (s.loud === 0) v = nz ? `${nz} NON-ZERO samples` : 'exact zero';
  else if (s.loud === 5) v = mean >= -12 ? 'wall ok' : `wall LOW (${(mean + 12).toFixed(1)})`;
  else if (s.loud === 1) v = mean <= -40 ? 'hole ok' : `hole HIGH (+${(mean + 40).toFixed(1)})`;
  else { const d = mean - PLAN[s.loud]; v = Math.abs(d) <= 6 ? `ok (${d >= 0 ? '+' : ''}${d.toFixed(1)})` : `OFF ${d >= 0 ? '+' : ''}${d.toFixed(1)}`; }
  verdicts.push([s.id, v]);
  log(`${s.id.padEnd(8)} ${s.t0.toFixed(2).padStart(6)} ${(s.t1 - s.t0).toFixed(2).padStart(5)} ${s.cue.padEnd(3)} | ${s.loud} ${NAME[s.loud].padEnd(5)}| ${f1(db(p))} ${f1(mM)} ${f1(mm)} ${f1(mean)} | ${v}`);
}
{ const bad = verdicts.filter(([, v]) => /LOW|HIGH|NON-ZERO|OFF/.test(v)); log(`\nplanned loudness: ${verdicts.length - bad.length}/${verdicts.length} shots in their class${bad.length ? '; off: ' + bad.map(([id, v]) => `${id} ${v}`).join(', ') : ''}`); }
// the rows as a whole (montages)
{ const rows = [...new Set(SHOTS.map((s) => s.row))].filter((id) => ROW[id].cuts.length > 1); for (const id of rows) log(`row ${id} (${ROW[id].cuts.length} cuts): mean ${f1(lufs(E, iAt(ROW[id].t0), iAt(ROW[id].t1))).trim()} LUFS`); }

// ---- the gates, the vacuums
{ const g = report.gates.map(([a, b, id]) => { let nz = 0; for (let i = iAt(a); i < Math.min(L.length, iAt(b)); i++) if (L[i] !== 0 || R[i] !== 0) nz++; return `${id} ${tc(a)}..${tc(b)}: ${nz ? nz + ' NON-ZERO samples' : 'exact zero'}`; });
  log(`\ngates: ${g.join(' | ')}`); }
for (const [t, pre, kind] of report.vacuums) {
  const a = t - pre, h = (a + t) / 2, before = lufs(E, iAt(a - 0.45), iAt(a - 0.05)), in1 = lufs(E, iAt(a + 0.03), iAt(h)), in2 = lufs(E, iAt(h), iAt(t - 0.01)), after = lufs(E, iAt(t), iAt(t + 0.4));
  log(`vacuum (${kind}) ${tc(a)}..${tc(t)} (${pre.toFixed(2)} s): before ${f1(before).trim()}  inside: first half ${f1(in1).trim()}, second half ${f1(in2).trim()} (the fall rushing in)  the hit ${f1(after).trim()} LUFS -> ${(after - in1).toFixed(1)} LU over the silence`);
}

// ---- sync points
log('\nsync point          film time   LUFS-M (0.4 s after)   LUFS-S (3 s, trailing)');
for (const k of Object.keys(C)) if (k !== 'fin') log(`CUES.${k.padEnd(14)} ${tc(C[k])}      ${f1(lufs(E, iAt(C[k]), iAt(C[k] + 0.4)))}               ${f1(ST(C[k] + 0.4))}`);

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
  log(`\nclick scan: ${h.length} discontinuities, ${h.length - bad.length} at gate edges (intended)` + (bad.length ? `; OTHER: ${bad.slice(0, 16).map(([t, d, r]) => `${tc(t)} ${d.toFixed(3)}/${r.toFixed(4)}`).join(', ')}` : '; no others')); }

// ---- band energies per sequence
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
{ const BANDS = [[20, 60], [60, 250], [250, 2000], [2000, 8000], [8000, 20000]], Nf = 4096;
  log('\nseq  name        sub<60  low   mid   high  air>8k   (dB, mean power per band)');
  for (const q of SEQS) {
    const a = iAt(q.t0), b = iAt(q.t1), acc = BANDS.map(() => 0); let nfr = 0;
    for (let s = a; s + Nf <= b; s += Nf) { const re = new Float64Array(Nf), im = new Float64Array(Nf); for (let i = 0; i < Nf; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Nf)); fft(re, im);
      BANDS.forEach(([lo, hi], j) => { for (let k = Math.ceil(lo * Nf / SR); k < Math.min(Nf / 2, hi * Nf / SR); k++) acc[j] += (re[k] * re[k] + im[k] * im[k]) / (Nf * Nf / 4); }); nfr++; }
    log(`${String(q.num).padEnd(4)} ${q.name.padEnd(5)}\t${acc.map((x) => f1(10 * Math.log10(x / Math.max(1, nfr) + 1e-20))).join(' ')}`);
  } }

if (arg('--twice')) { const b = renderScore(SR, { events, test: arg('--test') }); let diff = 0; for (let i = 0; i < L.length; i++) if (L[i] !== b.L[i] || R[i] !== b.R[i]) diff++; log(`\ndeterminism: second render ${diff === 0 ? 'BIT-IDENTICAL' : `differs in ${diff} samples`}`); }
if (arg('--async')) { let calls = 0, last = -1, mono = true; const b = await renderScoreAsync(SR, { events, test: arg('--test') }, (p) => { calls++; if (p < last) mono = false; last = p; }); let diff = 0; for (let i = 0; i < L.length; i++) if (L[i] !== b.L[i] || R[i] !== b.R[i]) diff++; log(`renderScoreAsync: ${diff === 0 ? 'BIT-IDENTICAL to renderScore' : `differs in ${diff} samples`}; ${calls} progress calls, monotonic ${mono}, last ${last}; longest step ${Math.max(...report.units.map((u) => u[2]))} ms`); }
if (arg('--cues')) { log('\ncues:'); for (const [t, k, l] of report.cues) log(`  ${tc(t)}  ${k.padEnd(5)} ${l}`); }
const ff = (a) => spawnSync('ffmpeg', a, { encoding: 'utf8' });
const chk = ff(['-hide_banner', '-nostats', '-i', join(outDir, `${OUT}.wav`), '-af', 'ebur128=peak=true+sample', '-f', 'null', '-']);
if (!chk.error) {
  const s = chk.stderr.split('Summary:')[1] ?? '', g = (re) => (s.match(re) ?? [])[1];
  log(`\nffmpeg ebur128 (${OUT}.wav): I ${g(/I:\s+(-?[\d.]+) LUFS/)} LUFS  LRA ${g(/LRA:\s+([\d.]+) LU/)} LU  sample peak ${g(/Sample peak:\s+Peak:\s+(-?[\d.]+)/)} dBFS  true peak ${g(/True peak:\s+Peak:\s+(-?[\d.]+)/)} dBTP`);
  if (!arg('--no-spec')) { ff(['-v', 'error', '-y', '-i', join(outDir, `${OUT}.wav`), '-lavfi', 'showspectrumpic=s=2400x900:legend=1:color=intensity:scale=log', join(outDir, `${OUT}-spec.png`)]); log(`wrote out/${OUT}-spec.png`); }
} else log('\n(ffmpeg not found: no cross-check, no spectrogram)');
const LV_FILE = arg('--test') ? 'levels-test.txt' : 'levels.txt';
writeFileSync(join(outDir, LV_FILE), LOG.join('\n') + '\n');
log(`wrote ${join(outDir, `${OUT}.wav`)}, ${LV_FILE}`);
