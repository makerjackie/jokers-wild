// Bundle src/ (three.js included) into one self-contained offline HTML file: dist/jokers_wild.html
// While the sound department has not written src/audio.js yet, a silent stand-in is bundled instead.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silentAudio = {
  name: 'silent-audio',
  setup(b) {
    b.onResolve({ filter: /^\.\/audio\.js$/ }, (a) => (fs.existsSync(path.join(a.resolveDir, 'audio.js')) ? undefined : { path: 'silent-audio', namespace: 'silent' }));
    b.onLoad({ filter: /.*/, namespace: 'silent' }, () => ({ contents: 'export function renderScore(sr){ const n = Math.round(sr * 2); return { L: new Float32Array(n), R: new Float32Array(n) }; }', loader: 'js' }));
  },
};
const res = await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', minify: process.argv.includes('--min'),
  write: false, target: 'es2020', legalComments: 'none', logLevel: 'warning', plugins: [silentAudio],
});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\/script');
const html = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/jokers_wild.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} ${(html.length / 1024).toFixed(0)} KB`);
