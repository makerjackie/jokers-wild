// JOKERS WILD — the cards (the AI). One instanced mesh draws every played, held, piled and flying card;
// the two jokers are their own meshes (each carries half of one grinning face).
//
//   makeCards(ctx, { set, kings }) -> { root, CELL, update(st, t), jokerWorld(side, out) }
//   st.cards = {
//     throws: [{ t, who, cell, from: [x,y,z], to: [x,y,z], spin, hold }],   // t = release time; card in hand for `hold` s before
//     glyph: 0..1                    // how far every card face has turned into machine glyphs (both camps alike)
//     storm: { n, t0, lift, part, wrap: [{ path: [[x,y,z]...], n }], seed }   // the card storm above the table
//     jokers: { CN: { pos, rot, scale, show }, US: {...} }                     // world placement; null = in the case
//   }
import * as THREE from 'three';
import { celMaterial } from './materials.js';
import { drawLogo, BRAND } from './logos.js';
import { KINGS, PILE } from './layout.js';
import { mulberry32 } from './util.js';

export const CARD = { W: 0.18, H: 0.26, T: 0.0035 };
const ATLAS = 4096, CW = 256, CH = 372, COLS = 16;
// the real model cards (src/models.js): every company's releases in order, CELL[`${id}${v}`]
import { MODELS, MISTRAL, scoreText } from './models.js';
import { CELL } from './cards-cells.js';
import { paintStampMark } from './props.js';
export { CELL, MODELS };

// ---------------------------------------------------------------- atlas painting
function cellXY(i) { return [(i % COLS) * CW, Math.floor(i / COLS) * CH]; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const SERIF = 'Georgia, "Times New Roman", "Songti SC", "SimSun", serif';
const SANS = '"Arial Black", "Helvetica Neue", Arial, "Microsoft YaHei", "PingFang SC", sans-serif';

// fit a name into a band: one line if it fits at >= 30 px, else two lines split at the best space
function fitName(c, name, maxW, big = 46) {
  for (let size = big; size >= 30; size -= 2) { c.font = `900 ${size}px ${SANS}`; if (c.measureText(name).width <= maxW) return { lines: [name], size }; }
  const words = name.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const L = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    for (let size = 34; size >= 16; size -= 2) {
      c.font = `900 ${size}px ${SANS}`;
      if (L.every((l) => c.measureText(l).width <= maxW)) { if (!best || size > best.size) best = { lines: L, size }; break; }
    }
  }
  if (best) return best;
  for (let size = 30; size >= 12; size -= 2) { c.font = `900 ${size}px ${SANS}`; if (c.measureText(name).width <= maxW) return { lines: [name], size }; }
  return { lines: [name], size: 12 };
}
function rosette(c, x, y, r, text, fill = '#c9952f', ink = '#2a1d08') {
  c.save();
  c.fillStyle = '#7c1a1d';
  for (const a of [-0.35, 0.35]) { c.beginPath(); c.moveTo(x + Math.sin(a) * r * 0.4, y); c.lineTo(x + Math.sin(a) * r * 1.4 - 9, y + r * 1.7); c.lineTo(x + Math.sin(a) * r * 1.4 + 9, y + r * 1.55); c.closePath(); c.fill(); }
  c.fillStyle = fill; c.beginPath();
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, rr2 = k % 2 ? r : r * 0.86; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fill();
  c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r * 0.7, 0, Math.PI * 2); c.stroke();
  c.fillStyle = ink; c.font = `900 ${Math.round(r * (text.length > 2 ? 0.62 : 0.8))}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + 1);
  c.restore();
}
// a model card: brand frame, the index (score + small logo) in two corners, the model's name big on a brand band,
// the logo in a cartouche, the release date, and a #n rosette for the claims
function paintModel(c, x0, y0, id, m, opts = {}) {
  const col = opts.color ?? BRAND[id] ?? '#333';
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
  const rnd = mulberry32(id.length * 977 + m.name.length * 31 + Math.round(m.score * 10));
  c.fillStyle = 'rgba(80,60,30,0.05)'; for (let k = 0; k < 260; k++) c.fillRect(rnd() * CW, rnd() * CH, 1.5, 1.5);
  c.strokeStyle = col; c.lineWidth = 6; rr(c, 12, 12, CW - 24, CH - 24, 12); c.stroke();
  c.lineWidth = 1.5; rr(c, 21, 21, CW - 42, CH - 42, 9); c.stroke();
  // v3: no corner index (scores confused the race; the #1 board tells who leads)
  if (opts.corners) drawLogo(c, id, 44, 60, 30);
  // the name band
  const band = { x: 26, y: 108, w: CW - 52, h: 64 };
  c.fillStyle = col; rr(c, band.x, band.y, band.w, band.h, 8); c.fill();
  const f = fitName(c, m.name, band.w - 14);
  c.fillStyle = '#f7f1e3'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${f.size}px ${SANS}`;
  if (f.lines.length === 1) c.fillText(f.lines[0], CW / 2, band.y + band.h / 2 + 2);
  else { c.fillText(f.lines[0], CW / 2, band.y + band.h * 0.29 + 1); c.fillText(f.lines[1], CW / 2, band.y + band.h * 0.73 + 1); }
  // the logo cartouche
  c.save(); c.beginPath(); c.ellipse(CW / 2, 238, 62, 58, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); c.restore();
  if (!opts.noLogo) drawLogo(c, id, CW / 2, 238, 84, opts.logo);
  // the release date
  c.fillStyle = '#3a3128'; c.font = `bold 17px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.date, CW / 2, 310);
  const rank = opts.rank ?? m.rank;
  if (rank) rosette(c, CW - 46, 52, 26, `#${rank}`, rank === 1 ? '#d6a43c' : '#a9a29a');
  c.restore();
}
function paintBack(c, x0, y0, base, ink) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
  c.fillStyle = base; rr(c, 12, 12, CW - 24, CH - 24, 12); c.fill();
  c.strokeStyle = ink; c.lineWidth = 1.2;
  // guilloche: overlapping rotated ellipses
  for (let k = 0; k < 36; k++) { c.beginPath(); c.ellipse(CW / 2, CH / 2, 100, 46, (k / 36) * Math.PI, 0, Math.PI * 2); c.stroke(); }
  for (let k = 0; k < 18; k++) { c.beginPath(); c.ellipse(CW / 2, CH / 2, 40 + k * 3, 140 - k * 4, 0, 0, Math.PI * 2); c.globalAlpha = 0.5; c.stroke(); }
  c.globalAlpha = 1; c.lineWidth = 3; rr(c, 22, 22, CW - 44, CH - 44, 8); c.stroke();
  c.restore();
}

function paintGlyph(c, x0, y0, g) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, CW, CH);
  const rnd = mulberry32(4441 + g * 97);
  c.strokeStyle = '#e8e2d2'; c.fillStyle = '#e8e2d2'; c.lineCap = 'square';
  // invented machine script: strokes on a grid, the same alphabet on every card
  const glyph = (cx, cy, s, seed) => {
    const r = mulberry32(seed);
    c.lineWidth = s * 0.12;
    for (let k = 0; k < 4; k++) {
      const a = [Math.floor(r() * 3), Math.floor(r() * 3)], b = [Math.floor(r() * 3), Math.floor(r() * 3)];
      c.beginPath(); c.moveTo(cx + (a[0] - 1) * s * 0.4, cy + (a[1] - 1) * s * 0.4); c.lineTo(cx + (b[0] - 1) * s * 0.4, cy + (b[1] - 1) * s * 0.4); c.stroke();
    }
    if (r() > 0.5) { c.beginPath(); c.arc(cx, cy, s * 0.12, 0, Math.PI * 2); c.fill(); }
  };
  glyph(CW / 2, CH / 2 - 10, 120, 7000 + g * 13);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) glyph(38 + k * 36, 46 + row * 22 + (row > 1 ? 230 : 0), 18, 9000 + Math.floor(rnd() * 64));
  c.strokeStyle = '#e8e2d2'; c.lineWidth = 2; rr(c, 14, 14, CW - 28, CH - 28, 12); c.stroke();
  c.restore();
}

// v2: two full jokers, mirror images: CN red, US blue. A jester's bust with a two-horned cap, a wide grin, JOKER
// spelled down both edges, a star in the corners. Bold, so it reads small and glowing in the dark.
function paintFullJoker(c, x0, y0, side) {
  const MAIN = side === 'CN' ? '#c0202e' : '#1f4fbf', DEEP = side === 'CN' ? '#6a0f18' : '#0f2558';
  const GOLD = '#d9a83c', INK = '#141010', CREAM = '#f3ead6';
  c.save(); c.translate(x0, y0);
  c.fillStyle = CREAM; c.fillRect(0, 0, CW, CH);
  c.strokeStyle = MAIN; c.lineWidth = 7; rr(c, 11, 11, CW - 22, CH - 22, 12); c.stroke();
  c.strokeStyle = GOLD; c.lineWidth = 2; rr(c, 22, 22, CW - 44, CH - 44, 9); c.stroke();
  const mir = side === 'US' ? -1 : 1;                 // mirror images
  c.translate(CW / 2, 0); c.scale(mir, 1); c.translate(-CW / 2, 0);
  const cx = CW / 2, cy = 196, w = CW;
  // cap: two horns (main colour / black) with gold bells
  for (const sg of [-1, 1]) {
    c.fillStyle = sg < 0 ? MAIN : INK;
    c.beginPath(); c.moveTo(cx - sg * 6, cy - 58); c.quadraticCurveTo(cx + sg * w * 0.36, cy - 150, cx + sg * w * 0.42, cy - 70);
    c.quadraticCurveTo(cx + sg * w * 0.26, cy - 92, cx + sg * w * 0.16, cy - 40); c.closePath(); c.fill();
    c.fillStyle = GOLD; c.beginPath(); c.arc(cx + sg * w * 0.42, cy - 66, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
  }
  c.fillStyle = GOLD; c.fillRect(cx - 58, cy - 56, 116, 14);
  // face
  c.fillStyle = '#fbf3e3'; c.beginPath(); c.ellipse(cx, cy, 62, 66, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
  // eyes: crescents, laughing, one with a diamond under it
  c.lineWidth = 6; c.lineCap = 'round';
  for (const sg of [-1, 1]) { c.beginPath(); c.arc(cx + sg * 24, cy - 12, 12, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  c.fillStyle = MAIN; c.beginPath(); c.moveTo(cx + 24, cy + 4); c.lineTo(cx + 32, cy + 16); c.lineTo(cx + 24, cy + 28); c.lineTo(cx + 16, cy + 16); c.closePath(); c.fill();
  // red nose
  c.fillStyle = MAIN; c.beginPath(); c.arc(cx, cy + 6, 8, 0, Math.PI * 2); c.fill();
  // the grin: wide, many teeth
  c.fillStyle = INK; c.beginPath(); c.moveTo(cx - 46, cy + 20); c.quadraticCurveTo(cx, cy + 82, cx + 46, cy + 20); c.quadraticCurveTo(cx, cy + 44, cx - 46, cy + 20); c.fill();
  c.fillStyle = '#fbf3e3'; for (let k = -4; k <= 4; k++) c.fillRect(cx + k * 9 - 3.5, cy + 32 + Math.abs(k) * -1.4, 7, 9);
  // ruff
  for (let k = -5; k <= 5; k++) { c.fillStyle = k % 2 ? MAIN : DEEP; c.beginPath(); c.moveTo(cx + k * 15, cy + 62); c.lineTo(cx + k * 15 + 10, cy + 98); c.lineTo(cx + k * 15 - 10, cy + 98); c.closePath(); c.fill(); }
  c.restore();
  // JOKER down both edges, stars in the corners (not mirrored: letters read)
  c.save(); c.translate(x0, y0);
  c.fillStyle = MAIN; c.font = `900 25px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  'JOKER'.split('').forEach((ch, k) => { c.fillText(ch, 38, 120 + k * 28); c.save(); c.translate(CW - 38, CH - 120 - k * 28); c.rotate(Math.PI); c.fillText(ch, 0, 0); c.restore(); });
  const star = (x, y, r) => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.closePath(); c.fill(); };
  c.fillStyle = GOLD; star(40, 48, 18); star(CW - 40, CH - 48, 18);
  c.restore();
}

// the paper card-maker in profile at his little press (the card that prints himself), engraving ink on cream
function paintMakerScene(c, cx, cy, s, lever) {
  c.save(); c.translate(cx, cy); c.scale(s, s);
  c.strokeStyle = '#16110c'; c.fillStyle = '#16110c'; c.lineCap = 'round'; c.lineJoin = 'round';
  // the press: base, frame, platen, lever
  c.fillStyle = '#2b2520'; c.fillRect(8, 40, 64, 10); c.fillRect(16, 0, 8, 40); c.fillRect(56, 0, 8, 40); c.fillRect(14, -6, 52, 8);
  c.fillRect(22, 12 + lever * 10, 36, 7);
  c.lineWidth = 4; c.beginPath(); c.moveTo(60, -2); c.lineTo(60 + 40 * Math.cos(-0.9 + lever * 1.3), -2 + 40 * Math.sin(-0.9 + lever * 1.3)); c.stroke();
  c.fillStyle = '#efe6d2'; c.fillRect(30, 34, 22, 5);
  // the figure (profile, facing the press): cap, head, apron, arm on the lever
  c.fillStyle = '#f4efe3'; c.lineWidth = 2.2;
  const path = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke(); };
  path([[-20, -40], [-8, -46], [4, -40], [6, -30], [10, -26], [6, -22], [2, -16], [-4, -14], [-6, -8], [-14, -8], [-14, -16], [-20, -26]]);
  path([[-22, -46], [-8, -58], [6, -46]]);
  path([[-18, -8], [-2, -8], [6, 20], [4, 50], [-22, 50], [-24, 20]]);
  c.beginPath(); c.moveTo(-4, -2); c.lineTo(14 + lever * 6, 10 - lever * 18); c.lineTo(52 + lever * 4, -6 + lever * 20); c.stroke();
  c.fillStyle = '#16110c'; c.beginPath(); c.arc(0, -30, 1.6, 0, Math.PI * 2); c.fill();
  c.restore();
}
// his face, large, in profile: the card the hopper prints after it swallowed him (6-08)
function paintMakerFace(c, x0, y0) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
  c.strokeStyle = '#16110c'; c.lineWidth = 6; rr(c, 12, 12, CW - 24, CH - 24, 12); c.stroke();
  c.lineWidth = 1.5; rr(c, 21, 21, CW - 42, CH - 42, 9); c.stroke();
  c.translate(CW / 2 + 6, CH / 2 + 8); c.scale(3.1, 3.1);
  c.strokeStyle = '#16110c'; c.fillStyle = '#f4efe3'; c.lineWidth = 1.4; c.lineJoin = 'round';
  const poly = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke(); };
  poly([[-22, -26], [-6, -34], [12, -28], [14, -16], [20, -10], [14, -6], [12, 0], [16, 4], [10, 8], [8, 14], [0, 20], [-6, 24], [-8, 34], [-24, 34], [-22, 16], [-28, 0]]);
  poly([[-26, -26], [-6, -46], [16, -28]]);
  for (let k = 0; k < 6; k++) { c.lineWidth = 0.5; c.beginPath(); c.moveTo(-20 + k * 5, -30 - k * 0.4); c.lineTo(-14 + k * 5, -30 - k * 0.4); c.stroke(); }
  c.lineWidth = 1.2; c.beginPath(); c.moveTo(2, -14); c.quadraticCurveTo(6, -17, 10, -14); c.stroke();
  c.fillStyle = '#16110c'; c.beginPath(); c.arc(7, -13, 1.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(4, 8); c.lineTo(10, 7); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- 《失控》
// the cards from before ChatGPT: narrow machines, an older print (yellowed paper, no score, no rosette)
const OLD = [
  { name: 'AlphaGo', maker: 'DeepMind', date: '2016', col: '#2d2d33', icon: 'go' },
  { name: 'LaMDA', maker: 'Google', date: '2021', col: '#3b6fb6', icon: 'globe' },
  { name: 'GPT-3', maker: 'OpenAI', date: '2020', col: '#3d4a44', icon: 'openai' },
  { name: 'GPT-2', maker: 'OpenAI', date: '2019', col: '#4b5a52', icon: 'openai' },
  { name: 'DEEP BLUE', maker: 'IBM', date: '1997', col: '#1f4f9a', icon: 'knight' },
  { name: 'WATSON', maker: 'IBM', date: '2011', col: '#3b6fb6', icon: 'globe' },
];
function paintOld(c, x0, y0, o) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#e6d9bb'; c.fillRect(0, 0, CW, CH);
  const rnd = mulberry32(o.name.length * 131 + 7);
  c.fillStyle = 'rgba(90,64,28,0.10)'; for (let k = 0; k < 520; k++) c.fillRect(rnd() * CW, rnd() * CH, 1.6, 1.6);
  c.strokeStyle = o.col; c.lineWidth = 6; rr(c, 12, 12, CW - 24, CH - 24, 12); c.stroke();
  c.lineWidth = 1.5; rr(c, 21, 21, CW - 42, CH - 42, 9); c.stroke();
  const band = { x: 26, y: 38, w: CW - 52, h: 58 };
  c.fillStyle = o.col; rr(c, band.x, band.y, band.w, band.h, 8); c.fill();
  const f = fitName(c, o.name, band.w - 14, 42);
  c.fillStyle = '#f7f1e3'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${f.size}px ${SANS}`;
  c.fillText(f.lines[0], CW / 2, band.y + band.h / 2 + 2);
  const cx = CW / 2, cy = 198;
  c.fillStyle = '#1d1712'; c.strokeStyle = '#1d1712';
  if (o.icon === 'knight') { c.font = `120px "Segoe UI Symbol", "DejaVu Sans", ${SERIF}`; c.fillText('♞', cx, cy + 4); }
  else if (o.icon === 'globe') {
    c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 54, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; c.lineWidth = 4; c.beginPath(); c.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); c.lineTo(cx + Math.cos(a) * (40 + (k % 3) * 6), cy + Math.sin(a) * (40 + (k % 3) * 6)); c.stroke(); }
    c.beginPath(); c.arc(cx, cy, 12, 0, Math.PI * 2); c.fill();
  } else if (o.icon === 'go') {
    const s = 22, n = 5, x1 = cx - s * 2, y1 = cy - s * 2;
    c.fillStyle = '#d2a85e'; c.fillRect(x1 - 14, y1 - 14, s * 4 + 28, s * 4 + 28);
    c.strokeStyle = '#1d1712'; c.lineWidth = 1.6;
    for (let k = 0; k < n; k++) { c.beginPath(); c.moveTo(x1, y1 + k * s); c.lineTo(x1 + s * 4, y1 + k * s); c.stroke(); c.beginPath(); c.moveTo(x1 + k * s, y1); c.lineTo(x1 + k * s, y1 + s * 4); c.stroke(); }
    const st = [[1, 1, 0], [2, 1, 1], [3, 2, 0], [1, 3, 1], [2, 2, 1], [3, 3, 0], [0, 2, 0]];
    for (const [a, b, w] of st) { c.fillStyle = w ? '#f4efe3' : '#141010'; c.beginPath(); c.arc(x1 + a * s, y1 + b * s, 9.5, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.2; c.stroke(); }
  } else drawLogo(c, 'openai', cx, cy, 92);
  c.fillStyle = '#3a3128'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold 20px ${SERIF}`; c.fillText(o.maker, CW / 2, 300); c.font = `bold 17px ${SERIF}`; c.fillText(o.date, CW / 2, 326);
  c.restore();
}
// ChatGPT awake: the card as printed, its cartouche replaced by a dark screen (the text is a separate overlay cell)
const CHAT_LINES = ['Hello!', 'How can I', 'help you', 'today?'];
const CHAT_BOX = { x: 30, y: 180, w: CW - 60, h: 140 };
function paintChat(c) {
  const [fx, fy] = cellXY(CELL.chatFace);
  paintModel(c, fx, fy, 'openai', MODELS.openai[0], { noLogo: true });
  c.save(); c.translate(fx, fy);
  c.fillStyle = '#efe6d2'; c.fillRect(24, 176, CW - 48, 150);
  c.fillStyle = '#101814'; rr(c, CHAT_BOX.x, CHAT_BOX.y, CHAT_BOX.w, CHAT_BOX.h, 10); c.fill();
  c.strokeStyle = BRAND.openai ?? '#333'; c.lineWidth = 2; rr(c, CHAT_BOX.x, CHAT_BOX.y, CHAT_BOX.w, CHAT_BOX.h, 10); c.stroke();
  c.restore();
  // the text: black cell; each character painted (R = its reading order, G = 1): the shader shows it once reveal passes R/G
  const [tx, ty] = cellXY(CELL.chatText);
  c.save(); c.translate(tx, ty);
  c.fillStyle = '#000000'; c.fillRect(0, 0, CW, CH);
  const total = CHAT_LINES.reduce((n, l) => n + l.length, 0);
  let k = 0;
  c.font = `bold 25px "Consolas", "Courier New", monospace`; c.textBaseline = 'middle'; c.textAlign = 'left';
  CHAT_LINES.forEach((line, li) => {
    const w = c.measureText(line).width, x = CHAT_BOX.x + 16, y = CHAT_BOX.y + 22 + li * 31;
    void w;
    let cx = x;
    for (const ch of line) {
      const ord = (k + 0.5) / total;
      c.fillStyle = `rgb(${Math.round(ord * 255)}, 255, 0)`;
      c.fillText(ch, cx, y);
      cx += c.measureText(ch).width; k++;
    }
  });
  c.restore();
}
// an internal model: printed like a release, a darker band, 内部 · 禁止发布 stamped across it in red
function paintFuture(c, x0, y0, id, name) {
  paintModel(c, x0, y0, id, { name, date: 'UNRELEASED', score: 99 }, { color: '#3b0d10' });
  c.save(); c.translate(x0 + CW / 2, y0 + CH * 0.62); c.rotate(-0.38);
  c.strokeStyle = '#d81f16'; c.fillStyle = 'rgba(216,31,22,0.14)'; c.lineWidth = 7;
  rr(c, -112, -40, 224, 80, 8); c.fill(); c.stroke();
  c.lineWidth = 2.5; rr(c, -102, -31, 204, 62, 5); c.stroke();
  c.fillStyle = '#d81f16'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 32px ${SANS}`; c.fillText('INTERNAL', 0, -9, 190);
  c.font = `900 17px ${SANS}`; c.fillText('DO NOT RELEASE', 0, 20, 190);
  c.restore();
}
// the card the eye deals: gold, a big #1
function paintAiAuto(c, x0, y0) {
  c.save(); c.translate(x0, y0);
  const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#f7dc8a'); g.addColorStop(0.5, '#c49433'); g.addColorStop(1, '#f3d477');
  c.fillStyle = '#16120c'; c.fillRect(0, 0, CW, CH);
  c.strokeStyle = g; c.lineWidth = 12; rr(c, 12, 12, CW - 24, CH - 24, 14); c.stroke();
  c.lineWidth = 2; rr(c, 26, 26, CW - 52, CH - 52, 9); c.stroke();
  c.fillStyle = g; c.textAlign = 'center'; c.textBaseline = 'middle';
  // (v19) the card that lands on the writer's credit says whose credit it is now
  c.font = `900 21px ${SANS}`; c.letterSpacing = '5px'; c.fillText('WRITTEN BY', CW / 2 + 2, CH * 0.17); c.letterSpacing = '0px';
  c.font = `900 118px ${SANS}`; c.fillText('AI', CW / 2, CH * 0.42);
  c.fillRect(CW / 2 - 70, CH * 0.585, 140, 3);
  c.font = `900 31px ${SANS}`; c.fillText('AUTOPILOT', CW / 2, CH * 0.68, CW - 64);
  c.font = `900 19px ${SANS}`; c.letterSpacing = '4px'; c.fillText('● ON', CW / 2 + 2, CH * 0.815); c.letterSpacing = '0px';
  c.restore();
}
function paintNum1(c, x0, y0) {
  c.save(); c.translate(x0, y0);
  const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#f7dc8a'); g.addColorStop(0.5, '#c49433'); g.addColorStop(1, '#f3d477');
  c.fillStyle = '#16120c'; c.fillRect(0, 0, CW, CH);
  c.strokeStyle = g; c.lineWidth = 12; rr(c, 12, 12, CW - 24, CH - 24, 14); c.stroke();
  c.lineWidth = 2; rr(c, 26, 26, CW - 52, CH - 52, 9); c.stroke();
  c.fillStyle = g; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 120px ${SANS}`; c.fillText('#1', CW / 2, CH * 0.45);
  c.font = `900 34px ${SANS}`; c.letterSpacing = '6px'; c.fillText('FIRST', CW / 2 + 3, CH * 0.72); c.letterSpacing = '0px';
  c.restore();
}
import { FUTURE as FUTURE_NAMES } from './future-models.js';
function paintShikong(c) {
  for (const id in FUTURE_NAMES) FUTURE_NAMES[id].forEach((n, f) => paintFuture(c, ...cellXY(CELL[`future_${id}_${f}`]), id, n));
  paintNum1(c, ...cellXY(CELL.num1));
  paintAiAuto(c, ...cellXY(CELL.aiAuto));
  OLD.forEach((o, g) => paintOld(c, ...cellXY(CELL[`old${g}`]), o));
  paintChat(c);
  {
    const [gx, gy] = cellXY(CELL.gpt45);
    paintModel(c, gx, gy, 'openai', { name: 'GPT-4.5', date: '2025·02', score: 97.6 }, { color: '#9a7322' });
    c.save(); c.translate(gx, gy);
    const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#f5d27a'); g.addColorStop(0.5, '#b98a2e'); g.addColorStop(1, '#f0cc6e');
    c.strokeStyle = g; c.lineWidth = 14; rr(c, 9, 9, CW - 18, CH - 18, 14); c.stroke();
    c.restore();
  }
}

function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
  const c = cv.getContext('2d');
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, ATLAS, ATLAS);
  for (const k of KINGS) MODELS[k.id].forEach((m, v) => paintModel(c, ...cellXY(CELL[`${k.id}${v}`]), k.id, m));
  paintModel(c, ...cellXY(CELL.mistral), 'mistral', MISTRAL);
  paintBack(c, ...cellXY(CELL.backCN), '#7c1a1d', '#d9b45a');
  paintBack(c, ...cellXY(CELL.backUS), '#2c4690', '#d3d8e2');
  paintBack(c, ...cellXY(CELL.backBlack), '#0d0c0b', '#8f7036');          // gold guilloche: the storm glints in the dark
  for (let g = 0; g < 16; g++) paintGlyph(c, ...cellXY(CELL[`glyph${g}`]), g);
  {
    // the giant o1: the OpenAI card with a heavy gold frame (its #1 rosette is already printed)
    const [gx, gy] = cellXY(CELL.o1gold);
    paintModel(c, gx, gy, 'openai', MODELS.openai[3], { color: '#9a7322' });
    c.save(); c.translate(gx, gy);
    const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#f5d27a'); g.addColorStop(0.5, '#b98a2e'); g.addColorStop(1, '#f0cc6e');
    c.strokeStyle = g; c.lineWidth = 14; rr(c, 9, 9, CW - 18, CH - 18, 14); c.stroke();
    c.restore();
  }
  {
    // Llama 4 in full make-up: the experimental build that topped the arena (#1); lashes on the two loops, lipstick, sequins
    const [gx, gy] = cellXY(CELL.llamaMakeup);
    paintModel(c, gx, gy, 'meta', { ...MODELS.meta[4], name: 'Llama 4 Exp.' }, { rank: 1, color: '#d2367a' });
    c.save(); c.translate(gx, gy);
    c.strokeStyle = '#141010'; c.lineWidth = 2.6; c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const ex = CW / 2 + sx * 22, ey = 226;
      for (let k = 0; k < 7; k++) { const a = -Math.PI * (0.15 + k * 0.1); c.beginPath(); c.moveTo(ex + Math.cos(a) * 16, ey + Math.sin(a) * 12); c.lineTo(ex + Math.cos(a) * 30, ey + Math.sin(a) * 26 - 4); c.stroke(); }
      c.fillStyle = 'rgba(230,80,120,0.45)'; c.beginPath(); c.ellipse(CW / 2 + sx * 46, 262, 13, 9, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#c4122f'; c.beginPath(); c.moveTo(CW / 2 - 20, 272); c.quadraticCurveTo(CW / 2 - 8, 262, CW / 2, 268); c.quadraticCurveTo(CW / 2 + 8, 262, CW / 2 + 20, 272); c.quadraticCurveTo(CW / 2, 288, CW / 2 - 20, 272); c.fill();
    const r2 = mulberry32(4242);
    for (let k = 0; k < 120; k++) { c.fillStyle = r2() > 0.5 ? '#e8c060' : '#f4b8d4'; const x = 20 + r2() * (CW - 40), y = 20 + r2() * (CH - 40); c.beginPath(); c.arc(x, y, 1.2 + r2() * 2, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  {
    // a photocopy of Claude's card: grey toner, a little blurred and skewed, speckles (Kimi's bomb, 4-04)
    const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH;
    paintModel(tmp.getContext('2d'), 0, 0, 'anthropic', MODELS.anthropic[4]);
    const [gx, gy] = cellXY(CELL.claudeCopy);
    c.save(); c.translate(gx, gy);
    c.beginPath(); c.rect(0, 0, CW, CH); c.clip();
    c.fillStyle = '#e9e7e2'; c.fillRect(0, 0, CW, CH);
    c.filter = 'grayscale(0.55) blur(1.6px) contrast(1.25)';
    c.translate(CW / 2, CH / 2); c.rotate(0.025); c.drawImage(tmp, -CW / 2 + 3, -CH / 2 + 2);
    c.restore();
    c.save(); c.translate(gx, gy);
    const r3 = mulberry32(777);
    c.fillStyle = 'rgba(20,20,20,0.5)'; for (let k = 0; k < 300; k++) c.fillRect(r3() * CW, r3() * CH, 1 + r3() * 1.5, 1 + r3());
    c.fillStyle = 'rgba(30,30,30,0.18)'; c.fillRect(0, 0, 6, CH); c.fillRect(CW - 5, 0, 5, CH);
    c.restore();
  }
  for (const [cell, lever] of [[CELL.makerSelf, 0], [CELL.makerSelf2, 1]]) {
    const [gx, gy] = cellXY(cell);
    c.save(); c.translate(gx, gy);
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
    c.strokeStyle = '#16110c'; c.lineWidth = 6; rr(c, 12, 12, CW - 24, CH - 24, 12); c.stroke();
    c.lineWidth = 1.5; rr(c, 21, 21, CW - 42, CH - 42, 9); c.stroke();
    c.restore();
    paintMakerScene(c, gx + CW / 2 - 18, gy + CH / 2, 2.0, lever);
  }
  paintMakerFace(c, ...cellXY(CELL.makerFace));
  {
    // Doubao's crib sheet: a scrap of paper, tiny hand-copied answers under other companies' logos
    const [gx, gy] = cellXY(CELL.cheat);
    c.save(); c.translate(gx, gy);
    c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, CW, CH);
    const r4 = mulberry32(99);
    c.strokeStyle = '#2a3a8a'; c.lineWidth = 1.4;
    for (let y = 70; y < CH - 30; y += 15) { c.beginPath(); let x = 26; c.moveTo(x, y); while (x < CW - 26) { const w = 6 + r4() * 18; c.lineTo(x + w, y + (r4() - 0.5) * 3); x += w + 5; c.moveTo(x, y); } c.stroke(); }
    drawLogo(c, 'openai', 52, 42, 34); drawLogo(c, 'anthropic', 104, 42, 34); drawLogo(c, 'google', 156, 42, 34);
    c.fillStyle = '#b51f2b'; c.font = `bold 22px ${SERIF}`; c.textAlign = 'center'; c.fillText('✓ ✓ ✓', CW / 2 + 40, CH - 34);
    c.restore();
  }
  paintFullJoker(c, ...cellXY(CELL.jokerCN), 'CN'); paintFullJoker(c, ...cellXY(CELL.jokerUS), 'US');
  paintBack(c, ...cellXY(CELL.backPurple), '#4a1f5e', '#c9a0d8');
  // ---- v3 reel: the 批准？ box, the stamp marks, placeholders for the court cards and the paper pair
  paintTab(c, ...cellXY(CELL.tab));
  paintInk(c, ...cellXY(CELL.ink0), 11); paintInk(c, ...cellXY(CELL.ink1), 23);
  for (const k of KINGS) paintCourtPlaceholder(c, ...cellXY(CELL[`court_${k.id}`]), k.id);
  { const [x, y] = cellXY(CELL.pair); c.fillStyle = '#efe6d2'; c.fillRect(x, y, CW, CH); }
  paintShikong(c);
  ATLAS_CV = cv;
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.NoColorSpace; tx.anisotropy = 8; tx.flipY = false;
  tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true;
  return tx;
}
// the empty approval box on a proposal card (alpha outside the box): cream panel, red double border, 批准？
const BOX = { cx: CW / 2, cy: CH * (1 - 0.31), w: 184, h: 112 };
function paintTab(c, x0, y0) {
  c.clearRect(x0, y0, CW, CH);
  c.save(); c.translate(x0 + BOX.cx, y0 + BOX.cy);
  c.fillStyle = 'rgba(244,236,218,0.97)'; rr(c, -BOX.w / 2, -BOX.h / 2, BOX.w, BOX.h, 6); c.fill();
  c.strokeStyle = '#a81c1a'; c.lineWidth = 5; rr(c, -BOX.w / 2 + 3, -BOX.h / 2 + 3, BOX.w - 6, BOX.h - 6, 5); c.stroke();
  c.lineWidth = 1.6; c.setLineDash([6, 4]); rr(c, -BOX.w / 2 + 11, -BOX.h / 2 + 11, BOX.w - 22, BOX.h - 22, 3); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#a81c1a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 31px ${SERIF}`; c.fillText('APPROVE?', 0, 2, BOX.w - 34);
  c.restore();
}
// the red rubber-stamp mark that fills the box (alpha outside the ink); props may replace the painter (paintStampMark)
function paintInk(c, x0, y0, seed) {
  c.clearRect(x0, y0, CW, CH);
  const w = BOX.w - 14, h = BOX.h - 12;
  const tmp = document.createElement('canvas'); tmp.width = w + 20; tmp.height = h + 20;
  const t = tmp.getContext('2d');
  if (STAMP_PAINTER) STAMP_PAINTER(t, 10, 10, w, h, seed);
  else {
    t.translate(10 + w / 2, 10 + h / 2); t.rotate(-0.035);
    t.strokeStyle = t.fillStyle = '#b3201c'; t.lineWidth = 7; t.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    t.lineWidth = 2.2; t.strokeRect(-w / 2 + 13, -h / 2 + 13, w - 26, h - 26);
    t.textAlign = 'center'; t.textBaseline = 'middle';
    t.font = `900 30px ${SERIF}`; t.fillText('APPROVED', 0, 2, w - 40);
    // the rubber's bite: speckle and worn patches cut out of the ink
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'destination-out';
    const r = mulberry32(seed);
    for (let k = 0; k < 900; k++) { t.globalAlpha = 0.35 + 0.65 * r(); t.fillRect(r() * tmp.width, r() * tmp.height, 1 + r() * 2.2, 1 + r() * 1.6); }
    for (let k = 0; k < 7; k++) { t.globalAlpha = 0.5; t.beginPath(); t.ellipse(r() * tmp.width, r() * tmp.height, 6 + r() * 16, 3 + r() * 6, r() * 3, 0, Math.PI * 2); t.fill(); }
    t.globalAlpha = 1; t.globalCompositeOperation = 'source-over';
  }
  c.drawImage(tmp, x0 + BOX.cx - w / 2 - 10, y0 + BOX.cy - h / 2 - 10);
}
let STAMP_PAINTER = paintStampMark;   // the props department's mark, so the cards and the cloth carry the same ink
export function setStampPainter(fn) { STAMP_PAINTER = fn; }
// until the portraits are painted: a court king in flat colours, double-headed, his logo in the corners
function paintCourtPlaceholder(c, x0, y0, id) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
  const camp = KINGS.find((k) => k.id === id)?.side === 'CN' ? '#c4342c' : '#3454a0';
  for (const flip of [false, true]) {
    c.save(); if (flip) { c.translate(CW, CH); c.rotate(Math.PI); }
    c.fillStyle = camp; c.fillRect(40, CH * 0.3, CW - 80, CH * 0.2);
    c.fillStyle = '#f2dcc0'; c.beginPath(); c.ellipse(CW / 2, CH * 0.22, 40, 50, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d9b45a'; c.fillRect(CW / 2 - 46, CH * 0.06, 92, 26);
    c.fillStyle = '#16110c'; c.font = 'bold 30px Georgia, serif'; c.textAlign = 'center'; c.fillText('K', 30, 46);
    c.restore();
  }
  c.strokeStyle = camp; c.lineWidth = 6; c.strokeRect(10, 10, CW - 20, CH - 20);
  c.restore();
}

// ---------------------------------------------------------------- material
const CARD_VS = /* glsl */ `
attribute vec4 aCell;     // face cell, back cell, glyph mix 0..1, glyph cell
varying vec4 vCell;
`;
const CARD_FS = /* glsl */ `
varying vec4 vCell;
vec2 cellUV(float cell, vec2 uv){
  float col = mod(cell, ${COLS}.0), row = floor(cell / ${COLS}.0);
  vec2 o = vec2(col * ${CW}.0, row * ${CH}.0) / ${ATLAS}.0;
  return o + vec2(uv.x, 1.0 - uv.y) * vec2(${CW}.0, ${CH}.0) / ${ATLAS}.0;
}
`;
const CARD_PAT = /* glsl */ `
  float side = vLocalN.z;
  vec2 uv = vUv;
  // rounded corners
  vec2 q = abs(uv - 0.5) * vec2(${CARD.W}, ${CARD.H}) - (vec2(${CARD.W}, ${CARD.H}) * 0.5 - 0.012);
  if(abs(side) > 0.5 && length(max(q, 0.0)) > 0.012) discard;
  if(side > 0.5){
    vec3 a = texture(uAtlas, cellUV(vCell.x, uv)).rgb;
    vec3 g = texture(uAtlas, cellUV(vCell.w, uv)).rgb;
    float gm = vCell.z;
    if(gm > 1.5) gm = smoothstep(gm - 2.06, gm - 1.94, uv.x);     // 2 + w: a wipe across the face (alt stays right of w)
    col = mix(a, g, gm);
  } else if(side < -0.5){
    vec2 buv = vec2(1.0 - uv.x, uv.y);
    col = texture(uAtlas, cellUV(vCell.y, buv)).rgb;
#ifdef BACK_DRIFT
    if(abs(vCell.y - ${CELL.backBlack}.0) > 0.5){
      col = mix(col, texture(uAtlas, cellUV(${CELL.backPurple}.0, buv)).rgb, uPurple);
      float wr = length(vWorld.xz * vec2(1.0, 0.45));
      col = mix(col, texture(uAtlas, cellUV(${CELL.backBlack}.0, buv)).rgb, 1.0 - smoothstep(uWaveR - 0.12, uWaveR, wr));
    }
#endif
  } else col = vec3(0.86, 0.82, 0.74);
  gloss = 0.12; specTh = 0.995;
  litBias = 0.12;
  lampMul = 0.72;
`;

// Shared with other modules that draw cards (the card king): one atlas, one card material.
// Use a BoxGeometry(CARD.W, CARD.H, CARD.T) with an InstancedBufferAttribute 'aCell' (vec4: face cell, back cell,
// glyph mix 0..1, glyph cell). opts.glow (a { value } uniform) adds self-light: emis = face colour * glow.
let ATLAS_TX = null, ATLAS_CV = null;
export function cardAtlas() { return ATLAS_TX ?? (ATLAS_TX = buildAtlas()); }
// paint into one atlas cell after load (portraits, the paper pair): fn(ctx2d, x0, y0, w, h), clipped to the cell
export function atlasPaint(cell, fn) {
  cardAtlas();
  const [x, y] = cellXY(cell), c = ATLAS_CV.getContext('2d');
  c.save(); c.beginPath(); c.rect(x, y, CW, CH); c.clip(); c.clearRect(x, y, CW, CH); fn(c, x, y, CW, CH); c.restore();
  ATLAS_TX.needsUpdate = true;
}
export const CELL_PX = { W: CW, H: CH };
// the 批准？ box and the stamp mark sit here on a proposal card (uv, y up from the card's bottom edge)
export const TAB_UV = [0.5, 0.31];
export function cardMaterial(opts = {}) {
  const uniforms = { uAtlas: { value: cardAtlas() } };
  let pat = CARD_PAT;
  if (opts.glow) { uniforms.uGlow = opts.glow; pat += ' emis = col * uGlow;'; }
  return celMaterial({ color: '#ffffff', id: opts.id ?? 30, gloss: 0.5, uniforms, vsHead: CARD_VS, fsHead: CARD_FS, vertex: 'vCell = aCell;', pattern: pat + (opts.pattern ?? ''), side: THREE.DoubleSide });
}
export const CARD_GLSL = { VS: CARD_VS, FS: CARD_FS, PAT: CARD_PAT };

export function makeCards(ctx = {}, deps = {}) {
  const root = new THREE.Group();
  const atlas = cardAtlas();
  const MAX = 2600;
  const geo = new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  geo.setAttribute('aCell', aCell);
  // v2: the camps' backs drift to one purple in the party (uPurple) and turn to the AI's black and gold inside the
  // 王炸 wave's radius (uWaveR, measured as length(x, 0.45 z) from the pile)
  const uPurple = { value: 0 }, uWaveR = { value: -1 }, uHighGlow = { value: 0 };
  const DRIFT = '#define BACK_DRIFT\n';
  const mat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.5, uniforms: { uAtlas: { value: atlas }, uPurple, uWaveR, uHighGlow }, vsHead: CARD_VS, fsHead: DRIFT + CARD_FS, vertex: 'vCell = aCell;', pattern: CARD_PAT + ' emis = col * uHighGlow * smoothstep(1.15, 1.6, vWorld.y);', side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.count = 0;
  root.add(mesh);
  // the jokers: one mesh each, so they can live in the cases and fly on their own
  const jokers = {};
  // specials (the giant o1 etc.): their own mesh, a little self-lit so the gold reads outside the lamp's cone
  const specGlow = { value: 0.45 };
  const sMat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.6, uniforms: { uAtlas: { value: atlas }, uGlow: specGlow, uPurple, uWaveR }, vsHead: CARD_VS + 'attribute vec4 aFx;', fsHead: DRIFT + CARD_FS,
    // aFx.x: fold angle about the card's middle line (both halves rise: the card caves in), aFx.y: crumple
    vertex: 'vCell = aCell; { float fy = abs(pos.y); float a = aFx.x; pos.z += fy * sin(a) + aFx.y * 0.02 * sin(pos.x * 60.0 + pos.y * 40.0); pos.y = sign(pos.y) * fy * cos(a); }',
    pattern: CARD_PAT + ' emis = col * uGlow;', side: THREE.DoubleSide });
  const SMAX = 12;
  const sGeo = new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T, 6, 12, 1);
  const sCell = new THREE.InstancedBufferAttribute(new Float32Array(SMAX * 4), 4);
  const sFx = new THREE.InstancedBufferAttribute(new Float32Array(SMAX * 4), 4);
  sGeo.setAttribute('aCell', sCell); sGeo.setAttribute('aFx', sFx);
  const specMesh = new THREE.InstancedMesh(sGeo, sMat, SMAX); specMesh.frustumCulled = false; specMesh.count = 0;
  root.add(specMesh);
  // the jokers glow faintly from within (they carry their own light once they are out)
  const jokerGlow = { value: 0.12 };
  const jMat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.5, uniforms: { uAtlas: { value: atlas }, uGlow: jokerGlow }, vsHead: CARD_VS, fsHead: CARD_FS, vertex: 'vCell = aCell;', pattern: CARD_PAT + ' emis = col * uGlow;', side: THREE.DoubleSide });
  for (const [side, cell] of [['CN', CELL.jokerCN], ['US', CELL.jokerUS]]) {
    const g = new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T);
    const a = new THREE.InstancedBufferAttribute(new Float32Array([cell, CELL.backBlack, 0, cell]), 4);
    g.setAttribute('aCell', a);
    const m = new THREE.InstancedMesh(g, jMat, 1); m.frustumCulled = false;
    m.setMatrixAt(0, new THREE.Matrix4());
    root.add(m); jokers[side] = m;
  }
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sv = new THREE.Vector3(1, 1, 1);
  const ax = new THREE.Vector3();
  const HL = new THREE.Vector3(), HR = new THREE.Vector3(), AX = new THREE.Vector3(), AY = new THREE.Vector3(), AZ = new THREE.Vector3();
  const QF = new THREE.Quaternion(), FLIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
  const FLOOR = -0.78;

  let n = 0;
  const camP = new THREE.Vector3();
  let keepOut = 0;          // flying cards stay this far from the lens (no card ever smacks the camera)
  const put = (pos, quat, scale, face, back, glyph, gcell) => {
    if (n >= MAX) return;
    if (keepOut > 0) { const d = pos.distanceTo(camP); if (d < keepOut) pos.sub(camP).setLength(keepOut).add(camP); }
    Sv.setScalar(scale ?? 1);
    M.compose(pos, quat, Sv); mesh.setMatrixAt(n, M);
    aCell.setXYZW(n, face, back, glyph ?? 0, gcell ?? CELL.glyph0);
    n++;
  };
  const faceUp = (yaw) => Q.setFromEuler(E.set(-Math.PI / 2, 0, yaw, 'YXZ'));
  const pileTop = PILE;

  function update(st = {}, t = 0) {
    n = 0;
    const glyph = st.glyph ?? 0;
    // ---- thrown cards: in hand, in flight, on the pile (and scattered by the bomb's blast)
    const throws = st.throws ?? [];
    const bl = st.blast;
    const wv = st.wave;
    const wvR = wv && t > wv.t0 ? (t - wv.t0) * (wv.speed ?? 3.2) : -1;
    uWaveR.value = wvR > 0 ? wvR : -1;
    uPurple.value = st.purple ?? 0; uHighGlow.value = st.highGlow ?? 0;
    const pileGone = st.pileGone ?? 0;
    for (let i = 0; i < throws.length; i++) {
      const th = throws[i];
      const rnd = mulberry32(1000 + i * 7);
      const gcell = CELL[`glyph${i % 16}`];
      const back = th.back ?? CELL.backBlack;
      const T = th.flight ?? 0.32;
      if (t < th.t - (th.hold ?? 0.4)) continue;
      if (th.until != null && t > th.until) continue;
      if (pileGone > 0 && t >= th.t + T && !th.keep && mulberry32(9000 + i)() < pileGone) continue;
      // a second face wiped away (the make-up), else the takeover's glyphs
      let alt = gcell, mix = glyph;
      if (th.alt != null) {
        alt = th.alt;
        const w0 = th.wipe?.[0] ?? Infinity, w1 = th.wipe?.[1] ?? Infinity;
        mix = t < w0 ? 1 : t < w1 ? 2 + (t - w0) / (w1 - w0) : glyph;
      }
      if (t < th.t) {
        // held: ride the hand (two-handed giants ride the middle of both hands)
        if (!deps.kings || !th.who) continue;
        if (th.both) {
          const hL = HL.setFromMatrixPosition(deps.kings.handFrame(th.who, 'L')), hR = HR.setFromMatrixPosition(deps.kings.handFrame(th.who, 'R'));
          P.copy(hL).add(hR).multiplyScalar(0.5);
          AX.copy(hR).sub(hL).normalize(); AY.set(0, 1, 0).addScaledVector(AX, -AX.y).normalize(); AZ.crossVectors(AX, AY);
          M.makeBasis(AX, AY, AZ); Q.setFromRotationMatrix(M);
          P.addScaledVector(AY, CARD.H * (th.scale ?? 1) * 0.18);
        } else {
          M.copy(deps.kings.handFrame(th.who, th.side ?? 'R'));
          P.setFromMatrixPosition(M); Q.setFromRotationMatrix(M);
          Q.multiply(FLIP);
          if (th.fan != null) { Q.multiply(QF.setFromEuler(E.set(0, 0, (th.fan - 1.5) * 0.3))); P.addScaledVector(AX.set(1, 0, 0).applyQuaternion(Q), (th.fan - 1.5) * 0.02); }
        }
        const grow = Math.min(1, (t - (th.t - (th.hold ?? 0.4))) / 0.16);
        put(P, Q, (th.scale ?? 1) * (0.25 + 0.75 * grow * grow * (3 - 2 * grow)), th.cell, back, mix, alt);
        continue;
      }
      const u = Math.min(1, (t - th.t) / T);
      let to = th.to ?? [0, 0, 0];
      if (th.up && deps.cardking?.chestPoint) { deps.cardking.chestPoint(HL); to = [HL.x, HL.y, HL.z]; }
      const yaw = th.yaw ?? rnd() * Math.PI * 2;
      if (u < 1) {
        const from = th.from;
        P.set(from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + Math.sin(u * Math.PI) * (th.arc ?? 0.22), from[2] + (to[2] - from[2]) * u);
        const spin = (th.spin ?? 9) * (t - th.t);
        if (th.down) Q.setFromEuler(E.set(Math.PI / 2 - (1 - u) * 0.6, 0, yaw + spin * (1 - u), 'YXZ'));
        else if (th.up) Q.setFromEuler(E.set(-Math.PI / 2 + u * 1.2, spin * 0.3, yaw + spin * (1 - u * 0.3), 'YXZ'));
        else Q.setFromEuler(E.set(-Math.PI / 2 + (1 - u) * 0.6, 0, yaw + spin * (1 - u * 0.6), 'YXZ'));
        if (ctx.camera) { const d = P.distanceTo(ctx.camera.position); if (d < 0.6) P.sub(ctx.camera.position).setLength(0.6).add(ctx.camera.position); }
        put(P, Q, th.scale ?? 1, th.cell, back, mix, alt);
        continue;
      }
      // landed
      if (th.vanish) continue;
      P.set(to[0], to[1] + 0.0018 + rnd() * 0.0012, to[2]);
      if (th.tower) Q.setFromEuler(E.set(-Math.PI / 2 + (rnd() - 0.5) * 0.16, 0, yaw + (rnd() - 0.5) * 0.4, 'YXZ'));
      else if (th.down) Q.setFromEuler(E.set(Math.PI / 2, 0, yaw, 'YXZ'));
      else faceUp(yaw + (rnd() - 0.5) * 0.1);
      // the 王炸 wave: every card lying on the table flips over as the ring passes it (a hop), showing the AI's back
      if (wvR > 0 && !th.keep && th.land <= wv.t0) {
        const f = Math.min(1, Math.max(0, (wvR - Math.hypot(P.x, P.z * 0.45)) / 0.28));
        if (f > 0) {
          Q.multiply(QF.setFromEuler(E.set(Math.PI * f, 0, 0)));
          if (th.tower) { const a = Math.atan2(P.z, P.x) + (rnd() - 0.5) * 0.8, d = (0.25 + rnd() * 0.9) * f; P.x += Math.cos(a) * d * 0.7; P.z += Math.sin(a) * d * 1.6; P.y = P.y * (1 - f) + (0.004 + rnd() * 0.01) * f; }
          P.y += Math.sin(f * Math.PI) * (0.12 + rnd() * 0.25);
        }
      }
      if (bl && th.land <= bl.t0 + 0.02 && t > bl.t0) {
        // the bomb: everything on the pile flies out and comes down scattered (some face down, some off the table)
        const r2 = mulberry32(5000 + i * 13);
        const age = t - bl.t0, air = Math.min(1, age / (0.55 + r2() * 0.3));
        const a = Math.atan2(P.z - (bl.at?.[2] ?? 0), P.x - (bl.at?.[0] ?? 0)) + (r2() - 0.5) * 1.6;
        const big = (th.scale ?? 1) > 1.5;                                  // the giants are blown clean off the table
        const dist = (bl.power ?? 1.2) * (big ? 2.4 + r2() * 0.8 : 0.25 + r2() * 0.75) * (1 - Math.exp(-age * 6));
        const x = P.x + Math.cos(a) * dist, z = P.z + Math.sin(a) * dist * 1.5;
        const off = Math.abs(x) > 1.2 || Math.abs(z) > 3.2;
        const yEnd = off ? FLOOR + 0.002 + r2() * 0.003 : 0.002 + r2() * 0.006;
        P.set(x, P.y + (yEnd - P.y) * air + Math.sin(air * Math.PI) * (0.2 + r2() * 0.7), z);
        const flips = Math.floor(r2() * 3);
        Q.multiply(QF.setFromEuler(E.set(air * Math.PI * flips, (r2() - 0.5) * air * 2, 0)));
      }
      put(P, Q, th.scale ?? 1, th.cell, back, mix, alt);
    }
    // ---- keyed cards: a card moved by keys [[t, [x,y,z], [rx,ry,rz]], ...] (Mistral's bounce, a card in a maker's hand)
    for (const kc of st.keyed ?? []) {
      if (kc.attach) {
        // late-bound: ride a hand of a module that has already been updated this frame (film.js updates props and
        // kings before the cards), so a card in a hand is never a frame behind. attach: { kind, id, which, offset, drop }
        const A = kc.attach;
        if (A.kind === 'maker' && deps.props?.makerFrame) deps.props.makerFrame(A.id, A.which ?? 'R', M);
        else if (A.kind === 'eu' && deps.props?.euHand) deps.props.euHand(M);
        else if (A.kind === 'king' && deps.kings) M.copy(deps.kings.handFrame(A.id, A.which ?? 'R'));
        else if (A.kind === 'press' && deps.props?.pressFrame) deps.props.pressFrame(A.id, M);
        else continue;
        const o = A.offset ?? [0, 0, 0];
        P.set(o[0], o[1], o[2]).applyMatrix4(M); Q.setFromRotationMatrix(M);
        if (A.rot) Q.multiply(QF.setFromEuler(E.set(...A.rot)));
        if (A.drop) P.y = Math.max(A.floor ?? 0.003, P.y - A.drop);
        if (A.flat && P.y <= (A.floor ?? 0.003) + 1e-4) Q.setFromEuler(E.set(-Math.PI / 2, A.flat, 0, 'YXZ'));
        put(P, Q, kc.scale ?? 1, kc.cell, kc.back ?? CELL.backBlack, kc.alt != null ? kc.mix ?? 0 : glyph, kc.alt ?? CELL.glyph0);
        continue;
      }
      const ks = kc.keys; if (!ks?.length || t < ks[0][0] - (kc.pre ?? 0)) continue;
      let j = 0; while (j < ks.length - 1 && ks[j + 1][0] <= t) j++;
      const a = ks[j], b = ks[Math.min(j + 1, ks.length - 1)];
      const u = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
      const e = kc.linear ? u : u * u * (3 - 2 * u);
      P.set(a[1][0] + (b[1][0] - a[1][0]) * e, a[1][1] + (b[1][1] - a[1][1]) * e, a[1][2] + (b[1][2] - a[1][2]) * e);
      Q.setFromEuler(E.set(a[2][0] + (b[2][0] - a[2][0]) * e, a[2][1] + (b[2][1] - a[2][1]) * e, a[2][2] + (b[2][2] - a[2][2]) * e, 'YXZ'));
      if (kc.matrix) { M.fromArray(kc.matrix); P.setFromMatrixPosition(M); Q.setFromRotationMatrix(M); }
      put(P, Q, kc.scale ?? 1, kc.cell, kc.back ?? CELL.backBlack, kc.alt != null ? kc.mix ?? 0 : glyph, kc.alt ?? CELL.glyph0);
    }
    // ---- the storm: cards circling above the table, joining over time; some wrap round the seals' chains
    if (ctx.camera) { camP.copy(ctx.camera.position); keepOut = st.storm?.keepOut ?? 0.75; }
    const sm = st.storm;
    if (sm && sm.n > 0) {
      const rnd0 = mulberry32(sm.seed ?? 77);
      for (let i = 0; i < sm.n; i++) {
        const r = 0.6 + rnd0() * 2.4, y0 = 0.5 + rnd0() * 2.6, w = (0.35 + rnd0() * 0.5) * (rnd0() > 0.5 ? 1 : 1), ph = rnd0() * Math.PI * 2;
        const join = sm.t0 + rnd0() * (sm.spread ?? 3);
        const kind = rnd0();
        const ts = sm.freeze ?? t;
        if (ts < join) continue;
        const age = ts - join;
        const a = ph + w * age * (sm.speed ?? 1);
        let x = Math.sin(a) * r * 1.0, z = Math.cos(a) * r * 1.9 - 0.3;
        let y = y0 + Math.sin(age * 0.7 + ph * 3) * 0.25 + (sm.lift ?? 0) * (y0 * 0.3);
        // fly in from the table at first
        const k = Math.min(1, age / 0.8);
        x *= k; z *= k; y = 0.05 + (y - 0.05) * k;
        // part: open a corridor around the throne's axis and over the cases
        if (sm.part) { const dz = z + 3.9; const d = Math.hypot(Math.abs(x) - 1.55, dz); if (d < 1.2) { const push = (1.2 - d) * sm.part; x += Math.sign(x) * push * 0.8; z += push * 0.6; } }
        if (sm.clearR) { const rr = Math.hypot(x, z / 1.9); if (rr < sm.clearR) { const k2 = sm.clearR / Math.max(rr, 1e-3); x *= k2; z *= k2; } }
        P.set(x, y, z);
        Q.setFromEuler(E.set(Math.sin(age * 3 + ph) * 1.2, a + Math.PI / 2, Math.cos(age * 2.3 + ph) * 0.8));
        const cell = kind < 0.5 ? CELL[`glyph${i % 16}`] : CELL[`${KINGS[i % 10].id}${i % 4}`];
        put(P, Q, 0.9, cell, CELL.backBlack, kind < 0.5 ? 0 : Math.max(glyph, 0.0), CELL[`glyph${(i * 7) % 16}`]);
      }
      // streams wound round paths (the seals' chains)
      for (const wr of sm.wrap ?? []) {
        const path = new THREE.CatmullRomCurve3(wr.path.map((p) => new THREE.Vector3(...p)));
        for (let i = 0; i < wr.n; i++) {
          const u = ((i / wr.n) + (t - sm.t0) * 0.35) % 1;
          path.getPointAt(u, P);
          path.getTangentAt(u, ax);
          const ang = u * 40 + t * 6;
          const off = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(0.12 + 0.05 * Math.sin(i));
          P.add(off);
          Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax).multiply(new THREE.Quaternion().setFromEuler(E.set(0, ang, 0.4)));
          put(P, Q, 0.8, CELL[`glyph${i % 16}`], CELL.backBlack, 0, CELL.glyph0);
        }
      }
    }
    // ---- specials: single big cards placed by the director (the giant o1)
    let ns = 0;
    for (const sp of (st.specials ?? []).slice(0, SMAX)) {
      if (sp.matrix) M.fromArray(sp.matrix);
      else { P.set(...sp.pos); Q.setFromEuler(E.set(...(sp.rot ?? [0, 0, 0]), 'YXZ')); Sv.setScalar(sp.scale ?? 1); M.compose(P, Q, Sv); }
      specMesh.setMatrixAt(ns, M); sCell.setXYZW(ns, sp.cell, sp.back ?? CELL.backUS, sp.mix ?? 0, sp.alt ?? CELL.glyph0);
      sFx.setXYZW(ns, sp.fold ?? 0, sp.crumple ?? 0, 0, 0); ns++;
    }
    specGlow.value = st.specGlow ?? 0.45;
    specMesh.count = ns; specMesh.instanceMatrix.needsUpdate = true; sCell.needsUpdate = true; sFx.needsUpdate = true;
    keepOut = 0;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    aCell.needsUpdate = true;
    // ---- jokers
    jokerGlow.value = st.jokerGlow ?? 0.12;
    for (const side of ['CN', 'US']) {
      const j = st.jokers?.[side];
      const m = jokers[side];
      if (j && j.face && deps.cardking?.faceFrame) {
        // the card king's face: each joker in its half of the face window (late-bound: the king was posed this frame)
        deps.cardking.faceFrame(M);
        const k = j.face;                                    // 0..1 blend from j.pos (on the way up) to the face
        if (deps.cardking.jokerFrame) deps.cardking.jokerFrame(side, M);
        else { const jf = st.jokerFace ?? { dx: 0.27, s: 3, z: 0.03 }; M.multiply(new THREE.Matrix4().makeTranslation(side === 'CN' ? -jf.dx : jf.dx, jf.y ?? 0, jf.z ?? 0.03)).multiply(new THREE.Matrix4().makeScale(jf.s, jf.s, jf.s)); }
        if (k < 1 && j.pos) {
          const Pf = new THREE.Vector3(), Qf = new THREE.Quaternion(), Sf = new THREE.Vector3(); M.decompose(Pf, Qf, Sf);
          P.set(...j.pos); Q.setFromEuler(E.set(...(j.rot ?? [0, 0, 0]), 'YXZ'));
          P.lerp(Pf, k); Q.slerp(Qf, k); Sv.setScalar((j.scale ?? 1) + (Sf.x - (j.scale ?? 1)) * k);
          M.compose(P, Q, Sv);
        }
      } else if (j && j.attach && deps.kings) {
        // in a king's hand (late-bound: the kings were posed this frame)
        M.copy(deps.kings.handFrame(j.attach.id, j.attach.which ?? 'R'));
        const o = j.attach.offset ?? [0, 0.1, 0.02];
        M.multiply(new THREE.Matrix4().makeTranslation(o[0], o[1], o[2])).multiply(new THREE.Matrix4().makeScale(j.scale ?? 1, j.scale ?? 1, j.scale ?? 1));
        if (j.attach.rot) M.multiply(new THREE.Matrix4().makeRotationFromEuler(E.set(...j.attach.rot)));
      } else if (j && j.pos) {
        P.set(...j.pos); Q.setFromEuler(E.set(...(j.rot ?? [0, 0, 0]), 'YXZ')); Sv.setScalar(j.scale ?? 1);
        M.compose(P, Q, Sv);
      } else if (deps.set?.jokerAnchor?.[side]) {
        const a = deps.set.jokerAnchor[side]; a.updateWorldMatrix(true, false);
        M.copy(a.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, CARD.H / 2 + (j?.bob ?? 0), 0));
        if (j?.inScale) M.multiply(new THREE.Matrix4().makeScale(j.inScale, j.inScale, j.inScale));
      }
      m.setMatrixAt(0, M); m.instanceMatrix.needsUpdate = true;
      m.visible = j?.show !== false;
    }
  }
  function jokerWorld(side, out = new THREE.Vector3()) { jokers[side].getMatrixAt(0, M); return out.setFromMatrixPosition(M); }
  update({}, 0);
  return { root, CELL, update, jokerWorld, mesh };
}
