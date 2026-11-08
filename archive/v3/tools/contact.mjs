// Contact sheet of the whole film: one labelled frame per shot (or per given time).
//   node tools/contact.mjs [--out out/contact.jpg] [--w 480] [--cols 6] [--at 0.5] [--extra "&x=1"] [t1 t2 ...]
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHOTS } from '../src/shots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = { out: 'out/contact.jpg', w: 480, cols: 6, at: 0.5, extra: '' };
const times = [];
for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) opt[a[i].slice(2)] = a[++i]; else times.push(+a[i]); }
const W = +opt.w, H = Math.round(W * 9 / 16);
const [r0, r1] = (opt.range ?? `0:${SHOTS.length}`).split(':').map(Number);     // --range 0:30 (shot indices)
const list = times.length ? times.map((t) => ({ t, label: t.toFixed(2) })) : SHOTS.slice(r0, r1).map((s) => ({ t: +(s.t0 + (s.t1 - s.t0) * +opt.at).toFixed(3), label: `${s.id} ${s.t0.toFixed(1)}` }));
const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: W, height: H });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(pathToFileURL(path.join(root, 'dist/jokers_wild.html')).href + `?still=1&w=${W}&h=${H}${opt.extra}`);
await p.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => {});
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
const t0 = Date.now();
const data = await p.evaluate(async (list, W, H, cols) => {
  const rows = Math.ceil(list.length / cols);
  const o = document.createElement('canvas'); o.width = cols * W; o.height = rows * (H + 22);
  const x = o.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, o.width, o.height);
  const c = document.getElementById('film'), tc = document.getElementById('titles');
  list.forEach((it, i) => {
    window.renderAt(it.t);
    const cx = (i % cols) * W, cy = Math.floor(i / cols) * (H + 22);
    x.drawImage(c, cx, cy, W, H); x.drawImage(tc, cx, cy, W, H);
    x.fillStyle = '#ddd'; x.font = '14px sans-serif'; x.fillText(it.label, cx + 6, cy + H + 16);
  });
  return o.toDataURL('image/jpeg', 0.85);
}, list, W, H, +opt.cols);
fs.mkdirSync(path.dirname(path.join(root, opt.out)), { recursive: true });
fs.writeFileSync(path.join(root, opt.out), Buffer.from(data.split(',')[1], 'base64'));
console.log('wrote', opt.out, list.length, 'frames', `${Date.now() - t0} ms`);
if (errs.length > 10) console.log(errs.slice(10, 20).join('\n'));
await b.close();
