// Find pops: frames where some part of the picture changes far more than in the six frames before
// (cuts excluded, safe with animation on twos/threes).  node tools/pops.mjs [--reel] [--from s --to s]
import { launch } from './browser.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHOTS, FPS, DURATION, REEL } from '../src/shots.js';
const a = process.argv.slice(2), opt = { from: 0, to: DURATION };
for (let i = 0; i < a.length; i++) { if (a[i] === '--reel') { opt.from = REEL.t0; opt.to = REEL.t1; } else { opt[a[i].slice(2)] = +a[i + 1]; i++; } }
const b = await launch();
const p = await b.newPage(); await p.setViewport({ width: 480, height: 260 });
await p.goto(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/jokers_wild.html')).href + '?still=1&w=480&h=260');
await p.waitForFunction('window.__ready === true', { timeout: 180000 });
const f0 = Math.round(opt.from * FPS), f1 = Math.round(opt.to * FPS);
const diffs = await p.evaluate(async (f0, f1, FPS) => {
  const c = document.getElementById('film'), tc = document.getElementById('titles');
  const o = document.createElement('canvas'); o.width = 240; o.height = 130; const x = o.getContext('2d', { willReadFrequently: true });
  let prev = null; const out = [];
  for (let f = f0; f < f1; f++) {
    renderAt((f + 0.5) / FPS);
    x.drawImage(c, 0, 0, 240, 130); x.drawImage(tc, 0, 0, 240, 130);
    const d = x.getImageData(0, 0, 240, 130).data;
    if (prev) {
      let mx = 0;
      for (let by = 0; by < 130 - 12; by += 6) for (let bx = 0; bx < 240 - 12; bx += 6) {
        let s = 0;
        for (let yy = by; yy < by + 12; yy++) for (let xx = bx; xx < bx + 12; xx++) { const i = (yy * 240 + xx) * 4; s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); }
        mx = Math.max(mx, s / 432);
      }
      out.push(mx);
    } else out.push(0);
    prev = d;
  }
  return out;
}, f0, f1, FPS);
const cuts = SHOTS.map((s) => Math.round(s.t0 * FPS));
const rows = diffs.map((d, k) => ({ f: f0 + k, k, t: ((f0 + k + 0.5) / FPS).toFixed(2), d })).filter((r) => !cuts.some((c) => Math.abs(c - r.f) <= 1));
const spikes = rows.filter((r) => { const win = diffs.slice(Math.max(0, r.k - 6), r.k); const mx = Math.max(...win, 0.5); return r.d > 25 && r.d > mx * 1.7; });
console.log(spikes.map((r) => `${r.t}s d=${r.d.toFixed(1)} shot ${SHOTS.find((s) => s.t0 <= +r.t && +r.t < s.t1)?.id}`).join('\n') || 'no pops');
await b.close();
