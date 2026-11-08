// Bundle one department bench on its own (no film): node tools/build-bench.mjs <name>  ->  dist/bench_<name>.html
// The bench file is src/bench/<name>.js and must export setup({ scene, overlay, camera, engine }) -> update(t, cam) -> look.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) { console.error('usage: node tools/build-bench.mjs <name>'); process.exit(1); }
const benchFile = path.join(root, 'src/bench', `${name}.js`);
if (!fs.existsSync(benchFile)) { console.error(`no bench ${benchFile}`); process.exit(1); }
const alias = { name: 'bench-alias', setup(b) { b.onResolve({ filter: /^BENCH$/ }, () => ({ path: benchFile })); } };
const res = await build({
  entryPoints: [path.join(root, 'src/bench-main.js')], bundle: true, format: 'iife', write: false, target: 'es2020',
  legalComments: 'none', logLevel: 'warning', plugins: [alias],
});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, `dist/bench_${name}.html`);
fs.writeFileSync(out, html);
console.log(`wrote ${out} ${(html.length / 1024).toFixed(0)} KB`);
