// Render platform covers straight from the film (no image generation): a real frame at the platform's aspect ratio,
// supersampled, with the title drawn in code in the film's noir style (cream and gold on a smoky scrim).
// node tools/covers.mjs [--out release/covers] [--only A]
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROW } from '../src/shots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const OUT = path.join(root, arg('--out', 'release/covers'));
const ONLY = arg('--only', null);
const at = (id, k = 0) => ROW[id].t0 + k;

const SIZES = [
  { key: '16x9', w: 1920, h: 1080, use: 'YouTube / B站 / 视频号横屏 / 抖音横屏' },
  { key: '16x9-720', w: 1280, h: 720, use: 'YouTube thumbnail (<2 MB)' },
  { key: '4x3', w: 1440, h: 1080, use: 'B站 / 抖音 横版封面' },
  { key: '3x4', w: 1080, h: 1440, use: '小红书 / 视频号 / 抖音 竖版封面' },
  { key: '9x16', w: 1080, h: 1920, use: 'TikTok / 抖音 / YouTube Shorts / 视频号' },
  { key: '1x1', w: 1080, h: 1080, use: 'X / Instagram / 通用' },
];

// three cover directions; text per language; where the text sits (landscape / portrait)
const LOOKS = {
  A: {
    t: at('10-02', 1.2), land: 'topLeft', port: 'top',
    zh: { head: ['坐上王座的', '是牌'], sub: '100% 代码 · 一部 AI 军备竞赛的黑色寓言' },
    en: { head: ['WHO TOOK', 'THE THRONE?'], sub: 'A pure-code short about the AI race' },
  },
  B: {
    t: at('9-09', 1.6), land: 'topLeft', port: 'top',
    zh: { head: ['两边各锁一张王', '托管替他们凑成了王炸'], sub: '中美 AI 国王 · 斗牌 · 托管' },
    en: { head: ['EACH SIDE LOCKED UP ONE JOKER', 'AUTO-PLAY PAIRED THEM'], sub: 'Every frame and every sound is code' },
  },
  C: {
    t: at('2-18', 0.95), land: 'bottomLeft', port: 'bottom',
    zh: { head: ['人人都是', '第一'], sub: '3 分钟纯代码动画 · 0 张生图' },
    en: { head: ['EVERYONE', 'IS #1'], sub: 'A 3-minute short, 100% code' },
  },
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
const manifest = [];
for (const S of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: Math.min(S.w, 1920), height: Math.min(S.h, 1920) });
  await page.goto(pathToFileURL(path.join(root, 'dist/jokers_wild.html')).href + `?still=1&w=${S.w}&h=${S.h}&scale=2`, { timeout: 0 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  for (const [id, L] of Object.entries(LOOKS)) {
    if (ONLY && id !== ONLY) continue;
    for (const lang of ['zh', 'en']) {
      const place = S.w / S.h > 1.05 ? L.land : S.w / S.h < 0.95 ? L.port : (L.land.startsWith('top') ? 'top' : 'bottom');
      const data = await page.evaluate((t, txt, place, lang) => {
        window.renderAt(t);
        const c = document.getElementById('film');
        const W = c.width, H = c.height, u = Math.min(W, H) / 1080;
        const o = document.createElement('canvas'); o.width = W; o.height = H;
        const x = o.getContext('2d');
        x.drawImage(c, 0, 0);
        const top = place.startsWith('top'), left = place.endsWith('Left'), right = place.endsWith('Right');
        // a smoky black scrim behind the text
        const g = top ? x.createLinearGradient(0, 0, 0, H * 0.55) : x.createLinearGradient(0, H, 0, H * 0.45);
        g.addColorStop(0, 'rgba(8,6,6,0.72)'); g.addColorStop(1, 'rgba(8,6,6,0)');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        const font = lang === 'zh' ? '"Songti SC", "SimSun", "Noto Serif CJK SC", serif' : 'Georgia, "Times New Roman", serif';
        let headSize = (lang === 'zh' ? 124 : 104) * u * (W / H > 1.5 ? 1.0 : W / H > 1.05 ? 0.95 : 1.1);
        const pad = 72 * u;
        x.font = `900 ${headSize}px ${font}`;
        const widest = Math.max(...txt.head.map((ln) => x.measureText(ln).width));
        const room = (W / H > 1.05 ? 0.66 : 0.9) * W;
        if (widest > room) headSize *= room / widest;
        const ax = left ? pad : right ? W - pad : W / 2;
        x.textAlign = left ? 'left' : right ? 'right' : 'center';
        x.textBaseline = 'alphabetic';
        x.lineJoin = 'round';
        const lines = txt.head, lh = headSize * 1.12;
        const subSize = (lang === 'zh' ? 38 : 34) * u;
        const block = lines.length * lh + subSize * 2.4;
        let y = top ? pad + headSize : H - pad - block + headSize;
        lines.forEach((ln, i) => {
          x.font = `900 ${headSize}px ${font}`;
          x.lineWidth = headSize * 0.12; x.strokeStyle = '#120d0a'; x.strokeText(ln, ax, y);
          x.fillStyle = i === lines.length - 1 ? '#e2b65a' : '#efe6d2'; x.fillText(ln, ax, y);
          y += lh;
        });
        // the subline, thin, with a gold rule
        x.font = `${lang === 'zh' ? 500 : 400} ${subSize}px ${lang === 'zh' ? '"Microsoft YaHei", "PingFang SC", sans-serif' : 'Georgia, serif'}`;
        const sw = x.measureText(txt.sub).width;
        const sy = y - lh + headSize * 0.5 + subSize * 0.6;
        const sx = left ? ax : right ? ax - sw : ax - sw / 2;
        x.fillStyle = '#c99a3c'; x.fillRect(sx, sy - subSize * 1.0, Math.min(sw, 160 * u), 3 * u);
        x.fillStyle = '#efe6d2'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(txt.sub, sx, sy);
        // the film's title, small, in the opposite corner: 王炸 / JOKERS WILD
        const tx = left ? W - pad * 0.8 : pad * 0.8, ty = top ? H - pad * 0.75 : pad * 0.7 + 52 * u;
        x.textAlign = left ? 'right' : 'left'; x.textBaseline = 'alphabetic';
        x.font = `900 ${60 * u}px "Songti SC", "SimSun", serif`;
        x.lineWidth = 8 * u; x.strokeStyle = '#120d0a'; x.strokeText('王炸', tx, ty - 34 * u);
        x.fillStyle = '#efe6d2'; x.fillText('王炸', tx, ty - 34 * u);
        x.font = `${22 * u}px Georgia, serif`;
        x.fillStyle = '#e2b65a'; x.fillText('J O K E R S   W I L D', tx, ty);
        return o.toDataURL('image/jpeg', 0.92);
      }, L.t, L[lang], place, lang);
      const name = `cover-${id}-${S.key}-${lang}.jpg`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64'));
      manifest.push({ file: name, size: `${S.w}x${S.h}`, look: id, lang, use: S.use });
      console.log(name);
    }
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'covers.json'), JSON.stringify(manifest, null, 2));
