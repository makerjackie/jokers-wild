// Stills of one bench: node tools/snap-bench.mjs <name> [--w 1280 --h 720] [--out out/bench] [--sheet name] t1 t2 ...
// (build it first: node tools/build-bench.mjs <name>). The bench decides what each t shows.
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args.shift();
const opt = { w: 1280, h: 720, out: `out/bench/${name}`, extra: '' };
const times = [];
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a.startsWith('--')) { opt[a.slice(2)] = args[++i]; continue; } times.push(+a); }
const outDir = path.join(root, opt.out);
fs.mkdirSync(outDir, { recursive: true });
const browser = await launch(['--enable-webgl', `--window-size=${opt.w},${opt.h}`]);
const page = await browser.newPage();
await page.setViewport({ width: +opt.w, height: +opt.h });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(pathToFileURL(path.join(root, `dist/bench_${name}.html`)).href + `?still=1&w=${opt.w}&h=${opt.h}${opt.extra}`, { timeout: 180000 });
await page.waitForFunction('window.__ready === true', { timeout: 240000 }).catch(() => {});
const files = [];
for (const t of times) {
  const data = await page.evaluate((t) => { window.renderAt(t); return document.getElementById('film').toDataURL('image/jpeg', 0.92); }, t);
  const f = path.join(outDir, `t${t.toFixed(2).padStart(6, '0')}.jpg`);
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  files.push(f); console.log(f);
}
if (errs.length) console.log(errs.slice(0, 20).join('\n'));
await browser.close();
if (opt.sheet && files.length > 1) {
  const cols = Math.min(3, files.length), n = files.length, rows = Math.ceil(n / cols);
  const pads = []; for (let i = n; i < rows * cols; i++) pads.push(`color=black:s=${opt.w}x${opt.h}:d=1[p${i}]`);
  const lab = files.map((_, i) => `[${i}:v]`).join('') + Array.from({ length: rows * cols - n }, (_, k) => `[p${n + k}]`).join('');
  const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) === 0 ? '0' : Array.from({ length: i % cols }, () => 'w0').join('+')}_${Math.floor(i / cols) === 0 ? '0' : Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+')}`).join('|');
  const fc = (pads.length ? pads.join(';') + ';' : '') + `${lab}xstack=inputs=${rows * cols}:layout=${layout},scale=${Math.min(2400, cols * opt.w)}:-2`;
  const sheet = path.join(outDir, `${opt.sheet}.jpg`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-frames:v', '1', sheet]);
  console.log('sheet', sheet);
}
