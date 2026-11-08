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
  // corner index: the score (decimals smaller underneath) and a small logo; mirrored bottom right
  const sc = scoreText(m.score), [whole, dec] = sc.split('.');
  for (const flip of [false, true]) {
    c.save(); if (flip) { c.translate(CW, CH); c.rotate(Math.PI); }
    c.fillStyle = '#1a1512'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = `900 ${whole.length > 2 ? 30 : 38}px ${SANS}`; c.fillText(whole, 44, 66);
    let y = 66;
    if (dec) { c.font = `900 18px ${SANS}`; c.fillText('.' + dec, 44, 86); y = 86; }
    drawLogo(c, id, 44, y + 22, 26);
    c.restore();
  }
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

// the joker: one grinning jester's face drawn whole, each card keeps one half (L = left half, R = right half)
function paintJokerFace(w, h) {
  const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h;
  const c = cv.getContext('2d');
  const RED = '#b51f2b', BLK = '#141010', CREAM = '#efe6d2', GOLD = '#c99a3c';
  c.fillStyle = CREAM; c.fillRect(0, 0, w * 2, h);
  const cx = w, cy = h * 0.56;
  // jester's cap: two horns with bells
  for (const sg of [-1, 1]) {
    c.fillStyle = sg < 0 ? RED : BLK;
    c.beginPath(); c.moveTo(cx, cy - h * 0.22); c.quadraticCurveTo(cx + sg * w * 0.55, cy - h * 0.5, cx + sg * w * 0.72, cy - h * 0.2);
    c.quadraticCurveTo(cx + sg * w * 0.45, cy - h * 0.28, cx + sg * w * 0.3, cy - h * 0.12); c.closePath(); c.fill();
    c.fillStyle = GOLD; c.beginPath(); c.arc(cx + sg * w * 0.72, cy - h * 0.19, w * 0.05, 0, Math.PI * 2); c.fill();
  }
  // face
  c.fillStyle = '#f4ecdc'; c.beginPath(); c.ellipse(cx, cy, w * 0.36, h * 0.27, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = BLK; c.lineWidth = w * 0.02; c.stroke();
  // diamond eyes, laughing
  for (const sg of [-1, 1]) {
    c.fillStyle = BLK;
    c.beginPath(); c.moveTo(cx + sg * w * 0.14, cy - h * 0.1); c.lineTo(cx + sg * w * 0.2, cy - h * 0.05); c.lineTo(cx + sg * w * 0.14, cy - h * 0.02); c.lineTo(cx + sg * w * 0.08, cy - h * 0.05); c.closePath(); c.fill();
    c.fillStyle = RED; c.beginPath(); c.moveTo(cx + sg * w * 0.14, cy + h * 0.0); c.lineTo(cx + sg * w * 0.18, cy + h * 0.07); c.lineTo(cx + sg * w * 0.14, cy + h * 0.14); c.lineTo(cx + sg * w * 0.1, cy + h * 0.07); c.closePath(); c.fill();
  }
  // the grin: wide, many teeth
  c.fillStyle = BLK; c.beginPath(); c.moveTo(cx - w * 0.26, cy + h * 0.04); c.quadraticCurveTo(cx, cy + h * 0.28, cx + w * 0.26, cy + h * 0.04); c.quadraticCurveTo(cx, cy + h * 0.15, cx - w * 0.26, cy + h * 0.04); c.fill();
  c.fillStyle = '#f4ecdc'; for (let k = -5; k <= 5; k++) { const x = cx + k * w * 0.042; c.fillRect(x - w * 0.016, cy + h * 0.1 + Math.abs(k) * -h * 0.006, w * 0.03, h * 0.035); }
  // ruff collar
  for (let k = -4; k <= 4; k++) { c.fillStyle = k % 2 ? RED : BLK; c.beginPath(); c.moveTo(cx + k * w * 0.09, cy + h * 0.26); c.lineTo(cx + k * w * 0.09 + w * 0.045, cy + h * 0.38); c.lineTo(cx + k * w * 0.09 - w * 0.045, cy + h * 0.38); c.closePath(); c.fill(); }
  return cv;
}
function paintJoker(c, x0, y0, half, face) {
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, CW, CH);
  c.drawImage(face, half === 'L' ? 0 : CW, 0, CW, CH, 0, 0, CW, CH);
  // the frame runs round three sides; the cut edge has none (the two halves meet there)
  c.strokeStyle = '#141010'; c.lineWidth = 4;
  c.beginPath();
  if (half === 'L') { c.moveTo(CW, 16); c.lineTo(16, 16); c.lineTo(16, CH - 16); c.lineTo(CW, CH - 16); }
  else { c.moveTo(0, 16); c.lineTo(CW - 16, 16); c.lineTo(CW - 16, CH - 16); c.lineTo(0, CH - 16); }
  c.stroke();
  // JOKER spelled down the outer edge
  c.fillStyle = '#b51f2b'; c.font = `bold 26px ${SERIF}`; c.textAlign = 'center';
  'JOKER'.split('').forEach((ch, k) => c.fillText(ch, half === 'L' ? 36 : CW - 36, 60 + k * 30));
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

function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
  const c = cv.getContext('2d');
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, ATLAS, ATLAS);
  for (const k of KINGS) MODELS[k.id].forEach((m, v) => paintModel(c, ...cellXY(CELL[`${k.id}${v}`]), k.id, m));
  paintModel(c, ...cellXY(CELL.mistral), 'mistral', MISTRAL);
  paintBack(c, ...cellXY(CELL.backCN), '#7c1a1d', '#d9b45a');
  paintBack(c, ...cellXY(CELL.backUS), '#1d2c5c', '#c7ccd6');
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
  const face = paintJokerFace(CW, CH);
  paintJoker(c, ...cellXY(CELL.jokerL), 'L', face); paintJoker(c, ...cellXY(CELL.jokerR), 'R', face);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.NoColorSpace; tx.anisotropy = 8; tx.flipY = false;
  tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true;
  return tx;
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
    col = texture(uAtlas, cellUV(vCell.y, vec2(1.0 - uv.x, uv.y))).rgb;
  } else col = vec3(0.86, 0.82, 0.74);
  gloss = 0.12; specTh = 0.995;
  litBias = 0.12;
  lampMul = 0.72;
`;

// Shared with other modules that draw cards (the card king): one atlas, one card material.
// Use a BoxGeometry(CARD.W, CARD.H, CARD.T) with an InstancedBufferAttribute 'aCell' (vec4: face cell, back cell,
// glyph mix 0..1, glyph cell). opts.glow (a { value } uniform) adds self-light: emis = face colour * glow.
let ATLAS_TX = null;
export function cardAtlas() { return ATLAS_TX ?? (ATLAS_TX = buildAtlas()); }
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
  const mat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.5, uniforms: { uAtlas: { value: atlas } }, vsHead: CARD_VS, fsHead: CARD_FS, vertex: 'vCell = aCell;', pattern: CARD_PAT, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.count = 0;
  root.add(mesh);
  // the jokers: one mesh each, so they can live in the cases and fly on their own
  const jokers = {};
  // specials (the giant o1 etc.): their own mesh, a little self-lit so the gold reads outside the lamp's cone
  const specGlow = { value: 0.45 };
  const sMat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.6, uniforms: { uAtlas: { value: atlas }, uGlow: specGlow }, vsHead: CARD_VS + 'attribute vec4 aFx;', fsHead: CARD_FS,
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
  for (const [side, cell] of [['CN', CELL.jokerL], ['US', CELL.jokerR]]) {
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
    for (let i = 0; i < throws.length; i++) {
      const th = throws[i];
      const rnd = mulberry32(1000 + i * 7);
      const gcell = CELL[`glyph${i % 16}`];
      const back = th.back ?? CELL.backBlack;
      const T = th.flight ?? 0.32;
      if (t < th.t - (th.hold ?? 0.4)) continue;
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
      const to = th.to ?? [0, 0, 0];
      const yaw = th.yaw ?? rnd() * Math.PI * 2;
      if (u < 1) {
        const from = th.from;
        P.set(from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + Math.sin(u * Math.PI) * (th.arc ?? 0.22), from[2] + (to[2] - from[2]) * u);
        const spin = (th.spin ?? 9) * (t - th.t);
        Q.setFromEuler(E.set(-Math.PI / 2 + (1 - u) * 0.6, 0, yaw + spin * (1 - u * 0.6), 'YXZ'));
        if (ctx.camera) { const d = P.distanceTo(ctx.camera.position); if (d < 0.6) P.sub(ctx.camera.position).setLength(0.6).add(ctx.camera.position); }
        put(P, Q, th.scale ?? 1, th.cell, back, mix, alt);
        continue;
      }
      // landed
      P.set(to[0], to[1] + 0.0018 + rnd() * 0.0012, to[2]);
      if (th.tower) Q.setFromEuler(E.set(-Math.PI / 2 + (rnd() - 0.5) * 0.45, 0, yaw + (rnd() - 0.5) * 0.4, 'YXZ'));
      else faceUp(yaw + (rnd() - 0.5) * 0.1);
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
    // ---- the shockwave: a ring of cards thrown out from the pile, each turning its face to the nearest row of kings
    const wv = st.wave;
    if (wv && t > wv.t0) {
      const rw = mulberry32(555);
      const age = t - wv.t0;
      for (let i = 0; i < wv.n; i++) {
        const a = rw() * Math.PI * 2, sp0 = 1.2 + rw() * 2.4, rise = (wv.low ? 0.1 + rw() * 0.7 : 0.2 + rw() * 1.6), d0 = rw() * 0.25;
        const u = Math.min(1, Math.max(0, (age - d0) * 1.6));
        const r = (wv.r0 ?? 0.3) + sp0 * (1 - Math.pow(1 - u, 2.2)) * 0.9;
        P.set(Math.sin(a) * r * 0.7, 0.05 + rise * Math.sin(Math.min(1, u) * Math.PI * 0.5), Math.cos(a) * r * 1.6);
        const face = P.x < 0 ? -Math.PI / 2 : Math.PI / 2;      // turn to look at the kings of that side
        const flip = Math.min(1, u * 1.8);
        Q.setFromEuler(E.set(-Math.PI / 2 * (1 - flip), face * flip + a * (1 - flip), (rw() - 0.5) * 0.3 * (1 - flip), 'YXZ'));
        put(P, Q, 0.9, CELL[`glyph${i % 16}`], CELL.backBlack, 0, CELL.glyph0);
      }
    }
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
        M.multiply(new THREE.Matrix4().makeTranslation(side === 'CN' ? -0.27 : 0.27, 0, 0.03)).multiply(new THREE.Matrix4().makeScale(3, 3, 3));
        if (k < 1 && j.pos) {
          const Pf = new THREE.Vector3(), Qf = new THREE.Quaternion(), Sf = new THREE.Vector3(); M.decompose(Pf, Qf, Sf);
          P.set(...j.pos); Q.setFromEuler(E.set(...(j.rot ?? [0, 0, 0]), 'YXZ'));
          P.lerp(Pf, k); Q.slerp(Qf, k); Sv.setScalar((j.scale ?? 1) + (3 - (j.scale ?? 1)) * k);
          M.compose(P, Q, Sv);
        }
      } else if (j && j.pos) {
        P.set(...j.pos); Q.setFromEuler(E.set(...(j.rot ?? [0, 0, 0]), 'YXZ')); Sv.setScalar(j.scale ?? 1);
        M.compose(P, Q, Sv);
      } else if (deps.set?.jokerAnchor?.[side]) {
        const a = deps.set.jokerAnchor[side]; a.updateWorldMatrix(true, false);
        M.copy(a.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, CARD.H / 2 + (j?.bob ?? 0), 0));
      }
      m.setMatrixAt(0, M); m.instanceMatrix.needsUpdate = true;
      m.visible = j?.show !== false;
    }
  }
  function jokerWorld(side, out = new THREE.Vector3()) { jokers[side].getMatrixAt(0, M); return out.setFromMatrixPosition(M); }
  update({}, 0);
  return { root, CELL, update, jokerWorld, mesh };
}
