// The final cut in one go, on any machine with Node, ffmpeg and Chrome (set CHROME=/path/to/chrome if it is not found):
//   npm install
//   node tools/final.mjs [--out out/final] [--only 1080]
// build -> the score (out/score.wav) -> the picture at 3840x2160 (about half an hour on a desktop GPU) -> the master
// (crf 15), a lighter 4K (crf 20) and a 1080p made from the master. --only 1080 renders the picture at 1920x1080
// instead (about five minutes) and writes the 1080p alone.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), opt = { out: 'out/final', only: '' };
for (let i = 0; i < a.length; i += 2) opt[a[i].slice(2)] = a[i + 1];
const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`FAILED: ${cmd} (exit ${r.status})`); process.exit(1); }
};
const node = process.execPath, out = (f) => path.join(opt.out, f).replace(/\\/g, '/');
const t0 = Date.now();
fs.mkdirSync(path.join(root, opt.out), { recursive: true });
run(node, ['tools/build.mjs', '--silent']);
run(node, ['tools/render-audio.mjs', '--no-spec']);
const AAC = ['-c:a', 'aac', '-b:a', '320k'], FAST = ['-movflags', '+faststart'], FF = ['-y', '-loglevel', 'error', '-stats'];
if (opt.only === '1080') {
  run(node, ['tools/render.mjs', '--scale', '1', '--w', '1920', '--h', '1080', '--crf', '16', '--wav', 'none', '--out', out('_picture.mp4')]);
  run('ffmpeg', [...FF, '-i', out('_picture.mp4'), '-i', 'out/score.wav', '-c:v', 'copy', ...AAC, ...FAST, out('TOO_SLOW_1080p.mp4')]);
} else {
  run(node, ['tools/render.mjs', '--scale', '2', '--w', '3840', '--h', '2160', '--crf', '15', '--wav', 'none', '--out', out('_picture.mp4')]);
  run('ffmpeg', [...FF, '-i', out('_picture.mp4'), '-i', 'out/score.wav', '-c:v', 'copy', ...AAC, ...FAST, out('TOO_SLOW_4K_master.mp4')]);
  run('ffmpeg', [...FF, '-i', out('TOO_SLOW_4K_master.mp4'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', ...FAST, out('TOO_SLOW_4K.mp4')]);
  run('ffmpeg', [...FF, '-i', out('TOO_SLOW_4K_master.mp4'), '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', ...FAST, out('TOO_SLOW_1080p.mp4')]);
}
fs.rmSync(path.join(root, out('_picture.mp4')), { force: true });
console.log(`\nfinal cut in ${opt.out} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
for (const f of fs.readdirSync(path.join(root, opt.out)).filter((x) => x.endsWith('.mp4'))) console.log(`  ${f}  ${(fs.statSync(path.join(root, opt.out, f)).size / 1048576).toFixed(0)} MB`);
