// Render the film (or a window of it) frame by frame (deterministic) and mux it with the synthesized score.
//   node tools/render.mjs [--scale 2] [--out dist/jokers_wild.mp4] [--wav out/score.wav]
//   node tools/render.mjs --reel [--style noir]        the tone reel: REEL.t0..REEL.t1 with out/reel.wav -> out/reel-<style>.mp4
//   node tools/render.mjs --from 120 --to 128 --out out/clip.mp4 [--wav none]
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FPS, DURATION, REEL } from '../src/shots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = { scale: 2, out: 'dist/jokers_wild.mp4', wav: 'out/score.wav', from: 0, to: DURATION, style: '', crf: 16, w: 1920, h: 1080 };
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--reel') { opt.reel = true; continue; }
  opt[a[i].slice(2)] = a[i + 1]; i++;
}
if (opt.reel) {
  opt.from = REEL.t0; opt.to = REEL.t1; opt.wav = opt.wav === 'out/score.wav' ? 'out/reel.wav' : opt.wav;
  if (opt.out === 'dist/jokers_wild.mp4') opt.out = `out/reel-${opt.style || 'noir'}.mp4`;
}
const from = +opt.from, to = +opt.to;
const W = +opt.w, H = +opt.h, N = Math.round((to - from) * FPS);
const b = await launch();
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(pathToFileURL(path.join(root, 'dist/jokers_wild.html')).href + `?still=1&w=${W}&h=${H}&scale=${opt.scale}${opt.style ? `&style=${opt.style}` : ''}`);
await p.waitForFunction('window.__ready === true', { timeout: 180000 });
if (errs.length) console.log(errs.join('\n'));
const wavPath = path.join(root, opt.wav);
const hasWav = opt.wav !== 'none' && fs.existsSync(wavPath);
fs.mkdirSync(path.dirname(path.join(root, opt.out)), { recursive: true });
const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-'];
if (hasWav) args.push('-i', wavPath);
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt.crf), '-pix_fmt', 'yuv420p');
if (hasWav) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
args.push(path.join(root, opt.out));
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const data = await p.evaluate((t) => {
    window.renderAt(t);
    const c = document.getElementById('film'), tc = document.getElementById('titles');
    const o = window.__o || (window.__o = document.createElement('canvas')); o.width = c.width; o.height = c.height;
    const x = o.getContext('2d'); x.drawImage(c, 0, 0); x.drawImage(tc, 0, 0);
    return o.toDataURL('image/jpeg', 0.95);
  }, from + (f + 0.5) / FPS);
  if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 48 === 0) process.stdout.write(`frame ${f}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await b.close();
console.log('wrote', opt.out, hasWav ? `(with ${opt.wav})` : '(no score)', `${N} frames`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
