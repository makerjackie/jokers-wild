// Evaluate an expression in the built film at given times: node tools/probe.mjs "<js expr using st, film, w>" t1 t2 ...
// st = the director's state returned by renderAt(t); film = window.__film; w = film.world. Prints JSON.
import { launch } from './browser.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [expr, ...ts] = process.argv.slice(2);
const b = await launch(['--enable-webgl']);
const p = await b.newPage(); await p.setViewport({ width: 320, height: 180 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(pathToFileURL(path.join(root, 'dist/jokers_wild.html')).href + '?still=1&w=320&h=180', { timeout: 180000 });
await p.waitForFunction('window.__ready === true', { timeout: 240000 });
for (const t of ts) {
  const out = await p.evaluate((expr, t) => { const st = window.renderAt(t); const film = window.__film, w = film.world; try { return JSON.stringify(eval(expr)); } catch (e) { return 'ERR ' + e.message; } }, expr, +t);
  console.log(t, out);
}
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
await b.close();
