// The covers: seven designs x four sizes x two languages, composed from stills of the film.
//   node tools/covers.mjs [--out out/covers] [--only C_fable]
// A_standoff  the kings blaming each other over the mountain of cards        "humans were too slow"
// B_eye       the eye of cards alone on black                                same line
// C_fable     the standoff again, the line is who made it                    "made by Fable 5.2"
// D_offer     the screen's offer and the finger over AUTOPILOT               "too slow? let AI play for you"
// E_out       the grey screen: TOO SLOW, ELIMINATED                          "keep up or you're out"
// F_first     the giant #1 card coming down out of the eye                   "everyone wants to be #1"
// G_stamp     type only: the film's red stamp on black
// The stills come from the film itself (tools/snap.mjs at 3840x2160); the type is Noto Sans SC (SIL OFL), Arial Black
// and Georgia.
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
const STILLS = { scene: 107.6, eye: 122.9, offer: 68.35, out: 142.2, first: 137.2 };
const still = (t) => path.join(srcDir, `t${t.toFixed(2).padStart(6, '0')}.jpg`);
const src = (k) => pathToFileURL(still(STILLS[k])).href;
if (!Object.values(STILLS).every((t) => fs.existsSync(still(t)))) {
  const r = spawnSync(process.execPath, ['tools/snap.mjs', '--w', '3840', '--h', '2160', '--scale', '2', '--out', path.relative(root, srcDir), ...Object.values(STILLS).map(String)], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

const SIZES = { '16x9': [1920, 1080], '4x3': [1600, 1200], '3x4': [1080, 1440], '9x16': [1080, 1920] };
const STD = { zh: 'Claude Fable 5.2 纯代码制作 · 黑色幽默短片', en: 'A dark comedy made entirely in code by Claude Fable 5.2' };
// big: [line 1, line 2]; hot: which of the two is yellow; k2: the size of line 2 against line 1 (flow designs)
const TEXT = {
  human: {
    zh: { kicker: 'TOO SLOW', big: ['人类', '太慢了'], hot: 1, sub: '所以这部短片，是 AI 做的', badge: STD.zh },
    en: { kicker: 'A SHORT FILM', big: ['TOO', 'SLOW'], hot: 1, sub: 'Humans were too slow. So an AI made this film.', badge: STD.en },
  },
  fable: {
    zh: { kicker: 'CLAUDE', big: ['Fable 5.2', '做的短片'], hot: 0, sub: '编剧是人类，其余 2.3 万行代码全是它写的', badge: 'TOO SLOW · 黑色幽默短片 · 零素材 · 零视频模型' },
    en: { kicker: 'CLAUDE', big: ['FABLE 5.2', 'MADE THIS'], hot: 0, sub: 'Written by a human. The other 23,000 lines are its code.', badge: 'TOO SLOW · a dark comedy · no video model · no assets' },
  },
  offer: {
    zh: { kicker: 'TOO SLOW', big: ['太慢了？', '让 AI 替你出牌'], hot: 0, k2: 0.56, sub: '一部 AI 用代码做的黑色幽默短片', badge: 'Claude Fable 5.2 纯代码制作' },
    en: { kicker: 'A SHORT FILM', big: ['TOO SLOW?', 'Let AI play for you.'], hot: 0, k2: 0.5, sub: 'A dark comedy made entirely in code by an AI', badge: 'Made by Claude Fable 5.2' },
  },
  out: {
    zh: { kicker: 'TOO SLOW', big: ['不够快', '就出局'], hot: 1, k2: 1, sub: '没人想交出控制权，可谁也不敢慢', badge: STD.zh },
    en: { kicker: 'TOO SLOW', big: ['KEEP UP', 'OR YOU’RE OUT'], hot: 1, k2: 0.62, sub: 'Nobody wanted to hand over control. Nobody could afford to be slower.', badge: STD.en },
  },
  first: {
    zh: { kicker: 'TOO SLOW', big: ['人人都想', '当第一'], hot: 1, k2: 1, sub: '于是，他们按下了"托管"', badge: STD.zh },
    en: { kicker: 'TOO SLOW', big: ['EVERYONE', 'WANTS #1'], hot: 1, k2: 1, sub: 'So they pressed AUTOPILOT.', badge: STD.en },
  },
  stamp: {
    zh: { stamp: 'TOO SLOW', big: ['人类，', '太慢了'], hot: 1, k2: 1, one: 1, sub: '所以这部短片，是 AI 做的', badge: STD.zh },
    en: { stamp: 'TOO SLOW', big: ['Humans were', 'too slow.'], hot: 1, k2: 1, one: 1, sub: 'So an AI made this film.', badge: STD.en },
  },
};
const DESIGNS = {
  A_standoff: { engine: 'abs', lay: 'A', text: 'human' },
  B_eye: { engine: 'abs', lay: 'B', text: 'human' },
  C_fable: { engine: 'abs', lay: 'C', text: 'fable' },
  D_offer: { engine: 'flow', text: 'offer', img: 'offer', fx: { '16x9': 0.44, '3x4': 0.44, '9x16': 0.45 }, zh: 150, en: 104 },
  E_out: { engine: 'flow', text: 'out', img: 'out', fx: { '16x9': 0.45, '3x4': 0.44, '9x16': 0.44 }, zh: 168, en: 130 },
  F_first: { engine: 'flow', text: 'first', img: 'first', fx: { '16x9': 0.56, '3x4': 0.55, '9x16': 0.54 }, zh: 150, en: 104 },
  G_stamp: { engine: 'flow', text: 'stamp', zh: 150, en: 104 },
};

// ---------------------------------------------------------------- the absolute designs (A, B, C)
// every box in pixels of its canvas. eye: [left, top, width]; scene: [left, top, width, crop] (crop = the share of the
// still's width that is shown, centred); text: top / size; cols = 2 puts the big line on two lines, left aligned at x;
// stack = the two halves of the big line on two centred lines.
const A = {
  '16x9': { scene: [0, 0, 1920, 1], shade: [0, 500], kicker: [22, 28], big: [50, { zh: 166, en: 186 }], sub: [{ zh: 238, en: 250 }, { zh: 52, en: 40 }], badge: 1010 },
  '4x3': { scene: [0, 300, 1600, 1], shade: [0, 760], kicker: [70, 32], big: [118, { zh: 196, en: 220 }], sub: [{ zh: 366, en: 384 }, { zh: 62, en: 46 }], badge: 1130 },
  '3x4': { eye: [250, 36, 580], scene: [0, 717, 1080, 0.84], shade: [560, 420], kicker: [470, 26], big: [508, { zh: 150, en: 146 }], sub: [{ zh: 690, en: 684 }, { zh: 50, en: 37 }], badge: 1376 },
  '9x16': { eye: [130, 110, 820], scene: [0, 1090, 1080, 0.84], shade: [900, 460], kicker: [752, 30], big: [800, { zh: 176, en: 150 }], sub: [{ zh: 1012, en: 990 }, { zh: 58, en: 37 }], badge: 1846 },
};
const LAYOUT = {
  A,
  B: {
    '16x9': { eye: [800, 166, 1070], cols: 2, x: 96, kicker: [250, 30], big: [300, { zh: 212, en: 196 }], sub: [{ zh: 770, en: 736 }, { zh: 48, en: 38 }], subW: 680, badge: 960 },
    '4x3': { eye: [300, 44, 1000], kicker: [770, 30], big: [812, { zh: 176, en: 196 }], sub: [{ zh: 1022, en: 1034 }, { zh: 56, en: 42 }], badge: 1126 },
    '3x4': { eye: [50, 110, 980], kicker: [850, 28], big: [896, { zh: 164, en: 150 }], sub: [{ zh: 1094, en: 1080 }, { zh: 54, en: 40 }], badge: 1330 },
    '9x16': { eye: [40, 330, 1000], kicker: [1090, 30], big: [1140, { zh: 180, en: 150 }], sub: [{ zh: 1356, en: 1326 }, { zh: 58, en: 37 }], badge: 1530 },
  },
  // the standoff's boxes; the line is longer, so it is smaller on the wide sizes and on two lines on the tall ones
  C: {
    '16x9': { ...A['16x9'], kicker: [26, 30], big: [62, { zh: 150, en: 132 }], sub: [{ zh: 240, en: 230 }, { zh: 46, en: 38 }] },
    '4x3': { ...A['4x3'], kicker: [78, 32], big: [126, { zh: 150, en: 128 }], sub: [{ zh: 316, en: 296 }, { zh: 50, en: 40 }] },
    '3x4': { ...A['3x4'], stack: 1, kicker: [456, 26], big: [490, { zh: 150, en: 136 }], sub: [{ zh: 818, en: 790 }, { zh: 40, en: 31 }] },
    '9x16': { ...A['9x16'], stack: 1, kicker: [744, 30], big: [786, { zh: 170, en: 150 }], sub: [{ zh: 1156, en: 1116 }, { zh: 44, en: 33 }] },
  },
};
const pick = (v, l) => (typeof v === 'object' && !Array.isArray(v) ? v[l] : v);
const CSS = (W, H, l) => `
  html,body{margin:0;background:#000;width:${W}px;height:${H}px;overflow:hidden}
  body{position:relative;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#fff}
  .eye,.scene,.pic{position:absolute;overflow:hidden}.eye img,.scene img,.pic img{position:absolute;display:block}.eye img{filter:contrast(1.28)}
  .eye{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 5%,#000 95%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 3%,#000 93%,transparent 100%);-webkit-mask-composite:source-in;mask-composite:intersect}
  .scene.fade{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16%,#000 100%)}
  .shade{position:absolute;left:0;width:100%;background:linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,.92) 28%,rgba(0,0,0,.92) 52%,rgba(0,0,0,0) 100%)}
  .shade.top{background:linear-gradient(to bottom,rgba(0,0,0,.94) 0,rgba(0,0,0,.72) 42%,rgba(0,0,0,0) 100%)}
  .t{position:absolute;white-space:nowrap}
  .kicker{font-family:Georgia,"Times New Roman",serif;letter-spacing:.62em;color:#e9c766;font-weight:700;text-indent:.62em}
  .big{font-weight:900;line-height:1.06;letter-spacing:${l === 'zh' ? '.02em' : '.01em'};text-shadow:0 6px 0 rgba(0,0,0,.55),0 0 46px rgba(0,0,0,.9)}
  .big.en,.big .lat{font-family:"Arial Black","Noto Sans SC",sans-serif}
  .hot{color:#ffd23a}
  .sub{font-weight:700;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.6),0 0 24px rgba(0,0,0,.95)}
  .sub.en{font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:700}
  .badge{position:absolute;left:0;width:100%;text-align:center}
  .badge span,.pill{display:inline-block;font-weight:700;color:#f0d68a;background:rgba(8,6,3,.82);border:2px solid #b8943c;border-radius:999px;padding:.42em 1.2em;letter-spacing:.06em;white-space:nowrap}
  .badge.l{text-align:left}`;
const lat = (s) => s.replace(/([A-Za-z0-9.#’'?]+(?: [A-Za-z0-9.#’'?]+)*)/g, '<span class="lat">$1</span>');

function pageAbs(d, r, l) {
  const D = DESIGNS[d], [W, H] = SIZES[r], L = LAYOUT[D.lay][r], T = TEXT[D.text][l], two = L.cols === 2, x0 = L.x ?? 0;
  const eyeCrop = { x: 0.105, y: 0.0, w: 0.79, h: 0.93 };   // the eye inside its still
  const eye = L.eye ? (() => { const [x, y, w] = L.eye, h = w * (eyeCrop.h * 2160) / (eyeCrop.w * 3840), iw = w / eyeCrop.w, ih = iw * 2160 / 3840;
    return `<div class="eye" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${src('eye')}" style="width:${iw}px;height:${ih}px;left:${-eyeCrop.x * iw}px;top:${-eyeCrop.y * ih}px"></div>`; })() : '';
  const scene = L.scene ? (() => { const [x, y, w, crop] = L.scene, iw = w / crop, ih = iw * 2160 / 3840;
    return `<div class="scene${L.scene[1] > 0 ? ' fade' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${ih}px"><img src="${src('scene')}" style="width:${iw}px;height:${ih}px;left:${-(iw - w) / 2}px;top:0"></div>`; })() : '';
  const shade = L.shade ? `<div class="shade${L.shade[0] === 0 ? ' top' : ''}" style="top:${L.shade[0]}px;height:${L.shade[1]}px"></div>` : '';
  const bigSize = pick(L.big[1], l), subTop = pick(L.sub[0], l), subSize = pick(L.sub[1], l);
  const align = two ? `left:${x0}px;text-align:left` : 'left:0;width:100%;text-align:center';
  const part = (i) => `<span${T.hot === i ? ' class="hot"' : ''}>${l === 'zh' ? lat(T.big[i]) : T.big[i]}</span>`;
  const join = two || L.stack ? '<br>' : l === 'zh' && D.text === 'human' ? '' : ' ';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(W, H, l)}</style></head><body>
  ${scene}${eye}${shade}
  <div class="t kicker" style="${align};top:${L.kicker[0]}px;font-size:${L.kicker[1]}px">${T.kicker}</div>
  <div class="t big ${l}" style="${align};top:${L.big[0]}px;font-size:${bigSize}px">${part(0)}${join}${part(1)}</div>
  <div class="t sub ${l}" style="${align};top:${subTop}px;font-size:${subSize}px;${two ? `white-space:normal;width:${L.subW}px;line-height:1.3` : ''}">${T.sub}</div>
  <div class="badge${two ? ' l' : ''}" style="top:${L.badge}px;${two ? `left:${x0}px` : ''}"><span style="font-size:${Math.round((r === '16x9' || r === '4x3' ? 27 : 25) * (l === 'en' ? 0.92 : 1))}px">${T.badge}</span></div>
  </body></html>`;
}

// ---------------------------------------------------------------- the flow designs (D .. G): a column of type and one picture
// txt / pic: [left, top, width, height]; the type is centred in its box (left aligned on 16:9); the picture shows the
// still at full height of its box, centred on fx (0..1 across the still); k = the type's size against the design's
const FLOW = {
  '16x9': { txt: [84, 0, 700, 1080], pic: [700, 0, 1220, 1080], fade: 'left', left: 1, k: 1, sub: 40, kick: 28, pill: 24, wrap: 620 },
  '4x3': { txt: [0, 18, 1600, 372], pic: [0, 360, 1600, 840], fade: 'top', k: 0.82, row: 1, sub: 40, kick: 26, pill: 24, pillAt: 1126 },
  '3x4': { txt: [0, 40, 1080, 520], pic: [0, 540, 1080, 760], fade: 'top', k: 0.92, sub: 40, kick: 26, pill: 24, pillAt: 1340 },
  '9x16': { txt: [0, 150, 1080, 640], pic: [0, 800, 1080, 860], fade: 'both', k: 1.02, sub: 44, kick: 30, pill: 26, pillAt: 1720 },
};
const FLOW_G = {
  '16x9': { txt: [0, 0, 1920, 1080], k: 1.1, sub: 56, pill: 28, stamp: 250 },
  '4x3': { txt: [0, 0, 1600, 1200], k: 1.0, sub: 54, pill: 27, stamp: 230 },
  '3x4': { txt: [0, 0, 1080, 1440], k: 0.9, sub: 50, pill: 25, stamp: 142, enTwo: 1 },
  '9x16': { txt: [0, 0, 1080, 1920], k: 0.9, sub: 52, pill: 26, stamp: 142, enTwo: 1 },
};
function pageFlow(d, r, l) {
  const D = DESIGNS[d], [W, H] = SIZES[r], T = TEXT[D.text][l], G = !D.img, L = (G ? FLOW_G : FLOW)[r];
  const s1 = Math.round(D[l] * L.k), s2 = Math.round(s1 * (T.k2 ?? 1)), left = !!L.left;
  const [tx, ty, tw, th] = L.txt;
  let pic = '';
  if (D.img) {
    const [x, y, w, h] = L.pic, ih = Math.max(h, w * 2160 / 3840), iw = ih * 3840 / 2160, fx = D.fx[r] ?? 0.5;
    const ox = Math.min(0, Math.max(w - iw, w / 2 - fx * iw)), oy = -(ih - h) / 2;
    const mask = L.fade === 'left' ? 'linear-gradient(to right,transparent 0,#000 22%)' : L.fade === 'both' ? 'linear-gradient(to bottom,transparent 0,#000 12%,#000 88%,transparent 100%)' : 'linear-gradient(to bottom,transparent 0,#000 14%)';
    pic = `<div class="pic" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;-webkit-mask-image:${mask}"><img src="${src(D.img)}" style="width:${iw}px;height:${ih}px;left:${ox}px;top:${oy}px"></div>`;
  }
  const part = (i, size) => `<div class="big ${l}" style="font-size:${size}px;${T.hot === i ? 'color:#ffd23a' : ''}">${l === 'zh' ? lat(T.big[i]) : T.big[i]}</div>`;
  const one = (T.one || L.row) && !left && !(L.enTwo && l === 'en');   // both halves on one line
  const big = one ? `<div class="big ${l}" style="font-size:${Math.round(s1 * (L.row && !T.one ? 0.9 : 1))}px;white-space:nowrap"><span${T.hot === 0 ? ' class="hot"' : ''}>${l === 'zh' ? lat(T.big[0]) : T.big[0]}</span>${l === 'zh' ? '' : ' '}<span${T.hot === 1 ? ' class="hot"' : ''} style="font-size:${T.k2 && T.k2 < 1 ? Math.round(T.k2 * 130) : 100}%">${l === 'zh' ? lat(T.big[1]) : T.big[1]}</span></div>` : part(0, s1) + part(1, s2);
  const stamp = T.stamp ? `<div class="stamp" style="font-size:${L.stamp}px">${T.stamp}</div>` : '';
  const kicker = T.kicker ? `<div class="kicker" style="font-size:${L.kick}px;${left ? 'text-indent:0' : ''}">${T.kicker}</div>` : '';
  const pill = `<div class="pill" style="font-size:${Math.round(L.pill * (l === 'en' ? 0.92 : 1))}px">${T.badge}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(W, H, l)}
  .col{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:${left ? 'flex-start' : 'center'};text-align:${left ? 'left' : 'center'};gap:${Math.round(s1 * 0.1)}px}
  .col .big{white-space:nowrap}.col .sub{white-space:normal;text-wrap:balance;line-height:1.3;max-width:${left ? L.wrap : tw - 150}px}
  .col .kicker{margin-bottom:${Math.round(s1 * 0.04)}px}
  .stamp{font-family:"Arial Black",sans-serif;font-weight:900;color:#fff;background:#d42a20;border:${G ? 10 : 6}px solid #fff;outline:${G ? 12 : 8}px solid #d42a20;border-radius:.16em;padding:.02em .22em;line-height:1.1;white-space:nowrap;transform:rotate(-5deg);letter-spacing:.01em;margin-bottom:.34em;box-shadow:0 0 0 2px #d42a20}
  .foot{position:absolute;left:0;width:100%;text-align:center}
  </style></head><body>
  ${pic}
  <div class="col" style="left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px">${stamp}${kicker}${big}<div class="sub ${l}" style="font-size:${Math.round(L.sub * (l === 'en' ? 0.84 : 1))}px">${T.sub}</div>${L.pillAt ? '' : `<div style="height:${Math.round(s1 * 0.12)}px"></div>${pill}`}</div>
  ${L.pillAt ? `<div class="foot" style="top:${L.pillAt}px">${pill}</div>` : ''}
  </body></html>`;
}

const b = await launch();
const p = await b.newPage();
const made = [];
for (const d of Object.keys(DESIGNS)) for (const r of Object.keys(SIZES)) for (const l of ['zh', 'en']) {
  if (opt.only && !`${d}_${r}_${l}`.includes(opt.only)) continue;
  const [W, H] = SIZES[r], html = path.join(srcDir, `_${d}_${r}_${l}.html`);
  fs.writeFileSync(html, DESIGNS[d].engine === 'abs' ? pageAbs(d, r, l) : pageFlow(d, r, l));
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(html).href);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((res) => { i.onload = i.onerror = res; })))); });
  const dir = path.join(outDir, l); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${d}_${r}.jpg`);
  await p.screenshot({ path: file, type: 'jpeg', quality: 93 });
  fs.rmSync(html);
  made.push(path.relative(root, file));
}
await b.close();
console.log(made.join('\n'));
