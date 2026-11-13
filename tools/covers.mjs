// The covers: two designs x four sizes x two languages, composed from two stills of the film.
//   node tools/covers.mjs [--out out/covers] [--only A_16x9_zh]
// A "standoff": the kings blaming each other over the mountain of cards (16:9 full bleed; the taller sizes put the black
//               of the hall above it, and the eye of cards where there is room).
// B "eye":      the eye of cards alone on black.
// The stills come from the film itself (tools/snap.mjs at 3840x2160); the type is Noto Sans SC (SIL OFL) and Arial Black.
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), opt = { out: 'out/covers', only: '' };
for (let i = 0; i < a.length; i += 2) opt[a[i].slice(2)] = a[i + 1];
const outDir = path.join(root, opt.out), srcDir = path.join(outDir, 'src');
fs.mkdirSync(srcDir, { recursive: true });
const STILLS = { scene: 107.6, eye: 122.9 };
const still = (t) => path.join(srcDir, `t${t.toFixed(2).padStart(6, '0')}.jpg`);
if (!Object.values(STILLS).every((t) => fs.existsSync(still(t)))) {
  const r = spawnSync(process.execPath, ['tools/snap.mjs', '--w', '3840', '--h', '2160', '--scale', '2', '--out', path.relative(root, srcDir), ...Object.values(STILLS).map(String)], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

const SIZES = { '16x9': [1920, 1080], '4x3': [1600, 1200], '3x4': [1080, 1440], '9x16': [1080, 1920] };
const TEXT = {
  zh: { kicker: 'TOO SLOW', big: ['人类', '太慢了'], sub: '所以这部短片，是 AI 做的', badge: 'Claude Fable 5.2 纯代码制作 · 黑色幽默短片' },
  en: { kicker: 'A SHORT FILM', big: ['TOO', 'SLOW'], sub: 'Humans were too slow. So an AI made this film.', badge: 'A dark comedy made entirely in code by Claude Fable 5.2' },
};
// every box in pixels of its canvas. eye: [left, top, width]; scene: [left, top, width, crop] (crop = the share of the
// still's width that is shown, centred); text: top / size; cols = 2 puts the big line on two lines, left aligned at x.
const LAYOUT = {
  A: {
    '16x9': { scene: [0, 0, 1920, 1], shade: [0, 500], kicker: [22, 28], big: [50, { zh: 166, en: 186 }], sub: [{ zh: 238, en: 250 }, { zh: 52, en: 40 }], badge: 1010 },
    '4x3': { scene: [0, 300, 1600, 1], shade: [0, 760], kicker: [70, 32], big: [118, { zh: 196, en: 220 }], sub: [{ zh: 366, en: 384 }, { zh: 62, en: 46 }], badge: 1130 },
    '3x4': { eye: [250, 36, 580], scene: [0, 717, 1080, 0.84], shade: [560, 420], kicker: [470, 26], big: [508, { zh: 150, en: 146 }], sub: [{ zh: 690, en: 684 }, { zh: 50, en: 37 }], badge: 1376 },
    '9x16': { eye: [130, 110, 820], scene: [0, 1090, 1080, 0.84], shade: [900, 460], kicker: [752, 30], big: [800, { zh: 176, en: 150 }], sub: [{ zh: 1012, en: 990 }, { zh: 58, en: 37 }], badge: 1846 },
  },
  B: {
    '16x9': { eye: [800, 166, 1070], cols: 2, x: 96, kicker: [250, 30], big: [300, { zh: 212, en: 196 }], sub: [{ zh: 770, en: 736 }, { zh: 48, en: 38 }], subW: 680, badge: 960 },
    '4x3': { eye: [300, 44, 1000], kicker: [770, 30], big: [812, { zh: 176, en: 196 }], sub: [{ zh: 1022, en: 1034 }, { zh: 56, en: 42 }], badge: 1126 },
    '3x4': { eye: [50, 110, 980], kicker: [850, 28], big: [896, { zh: 164, en: 150 }], sub: [{ zh: 1094, en: 1080 }, { zh: 54, en: 40 }], badge: 1330 },
    '9x16': { eye: [40, 330, 1000], kicker: [1090, 30], big: [1140, { zh: 180, en: 150 }], sub: [{ zh: 1356, en: 1326 }, { zh: 58, en: 37 }], badge: 1530 },
  },
};
const pick = (v, l) => (typeof v === 'object' && !Array.isArray(v) ? v[l] : v);

function page(d, r, l) {
  const [W, H] = SIZES[r], L = LAYOUT[d][r], T = TEXT[l], two = L.cols === 2, x0 = L.x ?? 0;
  const eyeCrop = { x: 0.105, y: 0.0, w: 0.79, h: 0.93 };   // the eye inside its still
  const eye = L.eye ? (() => { const [x, y, w] = L.eye, h = w * (eyeCrop.h * 2160) / (eyeCrop.w * 3840), iw = w / eyeCrop.w, ih = iw * 2160 / 3840;
    return `<div class="eye" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${pathToFileURL(still(STILLS.eye)).href}" style="width:${iw}px;height:${ih}px;left:${-eyeCrop.x * iw}px;top:${-eyeCrop.y * ih}px"></div>`; })() : '';
  const scene = L.scene ? (() => { const [x, y, w, crop] = L.scene, iw = w / crop, ih = iw * 2160 / 3840, h = ih;
    return `<div class="scene" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${pathToFileURL(still(STILLS.scene)).href}" style="width:${iw}px;height:${ih}px;left:${-(iw - w) / 2}px;top:0"></div>`; })() : '';
  const shade = L.shade ? `<div class="shade" style="top:${L.shade[0]}px;height:${L.shade[1]}px"></div>` : '';
  const bigSize = pick(L.big[1], l), subTop = pick(L.sub[0], l), subSize = pick(L.sub[1], l);
  const align = two ? `left:${x0}px;text-align:left` : 'left:0;width:100%;text-align:center';
  const bigHtml = l === 'zh'
    ? (two ? `<span>${T.big[0]}</span><br><span class="hot">${T.big[1]}</span>` : `<span>${T.big[0]}</span><span class="hot">${T.big[1]}</span>`)
    : (two ? `<span>${T.big[0]}</span><br><span class="hot">${T.big[1]}</span>` : `<span>${T.big[0]}</span> <span class="hot">${T.big[1]}</span>`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;width:${W}px;height:${H}px;overflow:hidden}
  body{position:relative;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#fff}
  .eye,.scene{position:absolute;overflow:hidden}.eye img,.scene img{position:absolute;display:block}.eye img{filter:contrast(1.28)}
  .eye{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 5%,#000 95%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 3%,#000 93%,transparent 100%);-webkit-mask-composite:source-in;mask-composite:intersect}
  .scene.fade{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16%,#000 100%)}
  .shade{position:absolute;left:0;width:100%;background:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.92) 28%,rgba(0,0,0,.92) 52%,rgba(0,0,0,0) 100%)}
  .shade.top{background:linear-gradient(to bottom,rgba(0,0,0,.94) 0,rgba(0,0,0,.72) 42%,rgba(0,0,0,0) 100%)}
  .t{position:absolute;white-space:nowrap}
  .kicker{font-family:Georgia,"Times New Roman",serif;letter-spacing:.62em;color:#e9c766;font-weight:700;text-indent:.62em}
  .big{font-weight:900;line-height:1.06;letter-spacing:${l === 'zh' ? '.02em' : '.01em'};text-shadow:0 6px 0 rgba(0,0,0,.55),0 0 46px rgba(0,0,0,.9)}
  .big.en{font-family:"Arial Black","Noto Sans SC",sans-serif}
  .hot{color:#ffd23a}
  .sub{font-weight:700;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.6),0 0 24px rgba(0,0,0,.95)}
  .sub.en{font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:700}
  .badge{position:absolute;left:0;width:100%;text-align:center}
  .badge span{display:inline-block;font-weight:700;color:#f0d68a;background:rgba(8,6,3,.82);border:2px solid #b8943c;border-radius:999px;padding:.42em 1.2em;letter-spacing:.06em}
  .badge.l{text-align:left}
  </style></head><body>
  ${scene.replace('class="scene"', `class="scene${d === 'A' && L.scene[1] > 0 ? ' fade' : ''}"`)}${eye}
  ${shade.replace('class="shade"', `class="shade${L.shade && L.shade[0] === 0 ? ' top' : ''}"`)}
  <div class="t kicker" style="${align};top:${L.kicker[0]}px;font-size:${L.kicker[1]}px">${T.kicker}</div>
  <div class="t big ${l}" style="${align};top:${L.big[0]}px;font-size:${bigSize}px">${bigHtml}</div>
  <div class="t sub ${l}" style="${align};top:${subTop}px;font-size:${subSize}px;${two ? `white-space:normal;width:${L.subW}px;line-height:1.3` : ''}">${T.sub}</div>
  <div class="badge${two ? ' l' : ''}" style="top:${L.badge}px;${two ? `left:${x0}px` : ''}"><span style="font-size:${Math.round((r === '16x9' || r === '4x3' ? 27 : 25) * (l === 'en' ? 0.92 : 1))}px">${T.badge}</span></div>
  </body></html>`;
}

const b = await launch();
const p = await b.newPage();
const made = [];
for (const d of Object.keys(LAYOUT)) for (const r of Object.keys(SIZES)) for (const l of Object.keys(TEXT)) {
  const name = `${d}_${r}_${l}`;
  if (opt.only && !name.includes(opt.only)) continue;
  const [W, H] = SIZES[r], html = path.join(srcDir, `_${name}.html`);
  fs.writeFileSync(html, page(d, r, l));
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(html).href);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((res) => { i.onload = i.onerror = res; })))); });
  const dir = path.join(outDir, l); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${d === 'A' ? 'A_standoff' : 'B_eye'}_${r}.jpg`);
  await p.screenshot({ path: file, type: 'jpeg', quality: 93 });
  fs.rmSync(html);
  made.push(path.relative(root, file));
}
await b.close();
console.log(made.join('\n'));
