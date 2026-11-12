// 《失控》 v8 — the INTELLIGENCE LEADERBOARD: the honours board of an old gambling club, high at the head of the table.
// A dark lacquer panel in a gilt double rule; every model a cream name card slotted into brass rails, #1 a gold-foil card;
// bars are flat ink inlay over a tick ruler; the human line is a vermilion thread; past it the ink turns vermilion.
// It answers one question at a glance: who is #1 right now, by how much, and how close everyone is.
//   makeLeaderboard(ctx) -> { root, update(st.lb, t) }
//   st.lb = { show, lit 0..1, date, rows: [{ who, model, score, y (row position, 0 = top, may be fractional),
//             out (ELIMINATED), glitch 0..1 }], flash 0..1 (a new #1), red 0..1 (the machines' own cards) }
// score: the "intelligence score". 100 = the human line (dashed). Above it the bar goes logarithmic (100 .. 1e6).
import * as THREE from 'three';
import { celMaterial, glowMaterial } from './materials.js';
import { drawLogo } from './logos.js';
import { BOARD } from './layout.js';

const CW = 1600, CH = 844, ROWS = 10;
const SERIF = 'Georgia, "Times New Roman", serif';                                            // the title, the small caps
const NAME = '"Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif';       // model names (lining figures: GPT-30, not GPT-3o)
const NUM = NAME;                                                                             // ranks, scores, the date
const SANS = '"Arial Black", "Segoe UI", Arial, sans-serif';
const INK = '#1c1a17', CREAM = '#e9dfc6', VERM = '#c8281c';   // the paper a shade deeper than the cards': the panel glows
const HEAD = 150, RH = (CH - HEAD - 24) / ROWS;
const X0 = 36, X1 = CW - 36, RANKW = 112;
const BAR0 = 800, BAR1 = 1330, BARMAX = 1.12, HX = BAR0 + (BAR1 - BAR0) * 0.72;
// the bar: 0..100 fills 72 % of it; above the human line it runs on a log scale up to 1e6
export function barFrac(s) {
  if (!Number.isFinite(s)) return 1.25;
  if (s <= 100) return 0.72 * Math.max(0, s) / 100;
  return 0.72 + 0.28 * Math.min(1.3, Math.log10(s / 100) / 4);
}
export function scoreText(s) {
  if (!Number.isFinite(s)) return '∞';
  if (s >= 1e6) return `${(s / 1e6).toFixed(1)}M`;
  if (s >= 1000) return Math.round(s).toLocaleString('en-US');
  if (s >= 100) return String(Math.round(s));
  if (s >= 99) return s.toFixed(2);
  return s.toFixed(1);
}
const GLYPHS = 'ΞΨΩЖЯ∑∂≋⌬⍟⎔◬⟁⧖⨀';
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const foil = (c, x0, y0, x1, y1, hot = 0) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, hot ? '#ffe08a' : '#f7dc8a'); g.addColorStop(0.5, hot ? '#eda63e' : '#d2a744'); g.addColorStop(1, hot ? '#ffd27a' : '#f3d477');
  return g;
};
const goldText = (c, y0, y1, hot) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hot ? '#ffe7a0' : '#fbe9ae'); g.addColorStop(0.55, hot ? '#ffb84a' : '#e6c063'); g.addColorStop(1, hot ? '#f08a2a' : '#b98a2c');
  return g;
};
// small caps: the first letter of each word a size up
function smallCaps(c, text, x, y, big, small, sp, weight = 'bold') {
  c.textAlign = 'left'; c.letterSpacing = `${sp}px`;
  for (const word of text.split(' ')) {
    c.font = `${weight} ${big}px ${SERIF}`; c.fillText(word[0], x, y); x += c.measureText(word[0]).width;
    c.font = `${weight} ${small}px ${SERIF}`; c.fillText(word.slice(1), x, y + (big - small) * 0.36); x += c.measureText(word.slice(1)).width + small * 0.42;
  }
  c.letterSpacing = '0px';
  return x;
}
// the panel itself, painted once per state (calm / red): lacquer, the gilt double rule, the title, the empty brass rails,
// the ruler, the HUMAN LEVEL tag
function panel(red) {
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(CW * 0.5, CH * 0.42, 80, CW * 0.5, CH * 0.5, CW * 0.62);
  g.addColorStop(0, red ? '#6a140e' : '#3d2c1d'); g.addColorStop(1, red ? '#2a0605' : '#1c140d');
  c.fillStyle = g; c.fillRect(0, 0, CW, CH);
  // the lacquer's grain: fine speckle and a few long brush lines
  let sd = red ? 77 : 31; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 5200; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,220,170,0.035)' : 'rgba(0,0,0,0.10)'; c.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 2.5, 1 + rnd() * 1.5); }
  for (let i = 0; i < 46; i++) { c.fillStyle = 'rgba(255,220,170,0.018)'; c.fillRect(0, rnd() * CH, CW, 1 + rnd() * 2); }
  // gilt double rule, a diamond in every corner (the border of a playing card)
  const gold = foil(c, 0, 0, CW, CH, red);
  c.strokeStyle = gold; c.fillStyle = gold;
  c.lineWidth = 6; rr(c, 11, 11, CW - 22, CH - 22, 16); c.stroke();
  c.lineWidth = 1.8; rr(c, 24, 24, CW - 48, CH - 48, 8); c.stroke();
  for (const [x, y] of [[24, 24], [CW - 24, 24], [24, CH - 24], [CW - 24, CH - 24]]) { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.closePath(); c.fill(); }
  // the title, engraved
  c.fillStyle = goldText(c, 30, 96, red); c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowOffsetY = 3; c.shadowBlur = 0;
  const tx = smallCaps(c, 'INTELLIGENCE LEADERBOARD', 56, 62, 66, 50, 5);
  c.shadowColor = 'transparent'; c.shadowOffsetY = 0;
  // a rule under it, the four suits where it ends
  c.fillStyle = gold; c.globalAlpha = 0.9; c.fillRect(58, 108, tx - 58 - 250, 2); c.fillRect(58, 113, tx - 58 - 250, 1);
  c.font = `22px ${SERIF}`; c.textAlign = 'right'; c.letterSpacing = '8px'; c.fillText('♠♥♦♣', tx - 124, 111); c.letterSpacing = '0px'; c.globalAlpha = 1;
  // the rails: ten empty slots waiting for a card
  for (let i = 0; i < ROWS; i++) {
    const y = HEAD + 8 + i * RH;
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(X0, y + 4, X1 - X0, RH - 8);
    c.fillStyle = gold; c.globalAlpha = red ? 0.6 : 0.5; c.fillRect(X0, y + 2, X1 - X0, 1.5); c.fillRect(X0, y + RH - 3.5, X1 - X0, 1.5);
    c.globalAlpha = red ? 0.7 : 0.6; for (const x of [X0 + 10, X1 - 10]) { c.beginPath(); c.arc(x, y + RH / 2, 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
  }
  // the ruler over the bars: 0 .. 100 in tens, then the decades
  c.fillStyle = gold; c.globalAlpha = 0.85;
  c.fillRect(BAR0, HEAD + 2, (BAR1 - BAR0) * BARMAX, 1.5);
  for (let k = 0; k <= 10; k++) { const x = BAR0 + (BAR1 - BAR0) * 0.072 * k, h = k % 5 ? 7 : 13; c.fillRect(x - 1, HEAD + 2 - h, 2, h); }
  for (let k = 1; k <= 4; k++) { const x = BAR0 + (BAR1 - BAR0) * (0.72 + 0.07 * k); c.fillRect(x - 1, HEAD - 6, 2, 8); }
  c.globalAlpha = 1;
  // HUMAN LEVEL: a paper tag the vermilion thread hangs from
  c.font = `bold 30px ${NAME}`; c.letterSpacing = '3px'; c.textAlign = 'center';
  const label = 'HUMAN LEVEL · 100', tw = c.measureText(label).width + 36;
  c.fillStyle = CREAM; rr(c, HX - tw / 2, 99, tw, 44, 4); c.fill();
  c.strokeStyle = VERM; c.lineWidth = 2; rr(c, HX - tw / 2 + 4, 103, tw - 8, 36, 2); c.stroke();
  c.fillStyle = VERM; c.fillText(label, HX + 1.5, 122); c.letterSpacing = '0px';
  return cv;
}

export function makeLeaderboard() {
  const root = new THREE.Group(); root.name = 'leaderboard';
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  const W = BOARD.W, H = BOARD.H;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glowMaterial({ color: '#ffffff', map: tex, id: 161, gain: 0.74, pattern: 'col = pow(col, vec3(1.6));' }));   // paper under a picture light, not a lit screen
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, H + 0.14, 0.08), celMaterial({ color: '#1c130b', id: 161, gloss: 0.5 }));
  frame.position.z = -0.045;
  root.add(frame, glass);
  root.position.set(...BOARD.pos);
  const c = cv.getContext('2d');
  const panels = [null, null];
  let key = '';

  function drawRow(s, r, t, red) {
    const moving = Math.abs(r.y - Math.round(r.y)) > 0.01;
    const y0 = HEAD + 8 + r.y * RH, mid = y0 + RH / 2, top = r.y < 0.5 && !r.out, flash = top ? (s.flash ?? 0) : 0;
    const y = top ? y0 + 1 : y0 + 5, h = top ? RH - 2 : RH - 10, w = X1 - X0;
    c.save();
    c.textBaseline = 'middle';
    // the card: opaque paper (gold foil for #1); one that is moving casts a soft shadow on what it passes over
    c.shadowColor = `rgba(0,0,0,${moving ? 0.75 : 0.5})`; c.shadowBlur = moving ? 22 : 5; c.shadowOffsetY = moving ? 8 : 2;
    c.fillStyle = r.out ? '#a39c8f' : top ? foil(c, X0, y, X1, y + h * 6, red || flash > 0.3) : red ? '#f1e2d2' : CREAM;
    rr(c, X0, y, w, h, 5); c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    if (top) { const sh = c.createLinearGradient(0, y, 0, y + h); sh.addColorStop(0, `rgba(255,250,220,${0.42 + 0.4 * flash})`); sh.addColorStop(0.45, 'rgba(255,250,220,0)'); sh.addColorStop(1, 'rgba(90,50,0,0.22)'); c.fillStyle = sh; rr(c, X0, y, w, h, 5); c.fill(); }
    else { c.fillStyle = 'rgba(60,40,10,0.10)'; c.fillRect(X0 + 3, y + h - 6, w - 6, 6); }
    // the index block at its left end: ink, the rank reversed out of it
    c.fillStyle = r.out ? '#57524a' : INK; c.beginPath(); c.roundRect(X0, y, RANKW, h, [5, 0, 0, 5]); c.fill();
    c.strokeStyle = r.out ? 'rgba(40,36,30,0.5)' : top ? 'rgba(60,36,4,0.8)' : 'rgba(28,26,23,0.6)'; c.lineWidth = 1.5;
    c.strokeRect(X0 + RANKW + 5, y + 4.5, w - RANKW - 10, h - 9);
    c.textAlign = 'center'; c.fillStyle = r.out ? '#a39c8f' : top ? '#f7dc8a' : CREAM; c.font = `bold ${top ? 52 : 44}px ${NUM}`;
    c.fillText(r.out ? '—' : `#${Math.round(r.rank)}`, X0 + RANKW / 2, mid + 2);
    // logo + model name
    const lx = X0 + RANKW + 48;
    if (r.out) c.globalAlpha = 0.45;
    if (r.who === 'ibm') { c.fillStyle = '#1f3f8f'; c.font = `900 28px ${SANS}`; c.fillText('IBM', lx, mid + 2); }
    else drawLogo(c, r.who, lx, mid, top ? 52 : 48, ['openai', 'xai'].includes(r.who) ? { color: INK } : {});
    c.globalAlpha = 1;
    let name = r.model ?? '';
    if (r.glitch > 0) name = [...name].map((ch, i) => (Math.sin(i * 12.9 + Math.floor(t * 12) * 7.3) * 0.5 + 0.5 < r.glitch ? GLYPHS[(i * 7 + Math.floor(t * 9)) % GLYPHS.length] : ch)).join('');
    const nx = lx + 44, nmax = BAR0 - nx - 22;
    c.textAlign = 'left'; c.fillStyle = r.out ? '#5f5a51' : INK; c.font = `bold ${(name.length > 14 ? 38 : 44) + (top ? 4 : 0)}px ${NAME}`;
    c.fillText(name, nx, mid + 1, nmax);
    if (r.out) {
      // struck off, and stamped
      c.fillStyle = '#5f5a51'; c.fillRect(nx - 6, mid, Math.min(nmax, c.measureText(name).width) + 12, 2.5);
      c.translate(BAR0 + 184, mid); c.rotate(-0.07);
      c.strokeStyle = c.fillStyle = VERM; c.lineWidth = 4; rr(c, -168, -24, 336, 48, 5); c.stroke();
      c.lineWidth = 1.4; rr(c, -161, -17.5, 322, 35, 2); c.stroke();
      c.textAlign = 'center'; c.font = `900 30px ${SERIF}`; c.letterSpacing = '6px'; c.fillText('ELIMINATED', 3, 2); c.letterSpacing = '0px';
      c.restore(); return;
    }
    // the bar: a ruled track, flat ink inlay; what lies past the human line is vermilion
    const f = Math.min(BARMAX, barFrac(r.score)), bw = (BAR1 - BAR0) * f, over = r.score > 100, bh = top ? 24 : 18;
    c.fillStyle = top ? 'rgba(60,36,4,0.75)' : 'rgba(28,26,23,0.5)';
    c.fillRect(BAR0, mid + bh / 2 + 5, (BAR1 - BAR0) * BARMAX, 1.5);
    for (let k = 0; k <= 10; k++) { const x = BAR0 + (BAR1 - BAR0) * 0.072 * k; c.fillRect(x - 0.75, mid + bh / 2 + (k % 5 ? 1 : -2), 1.5, k % 5 ? 4 : 7); }
    for (let k = 1; k <= 4; k++) { const x = BAR0 + (BAR1 - BAR0) * (0.72 + 0.07 * k); c.fillRect(x - 0.75, mid + bh / 2 + 1, 1.5, 4); }
    c.fillStyle = INK; c.fillRect(BAR0, mid - bh / 2, Math.min(bw, HX - BAR0), bh);
    if (over) {
      c.fillStyle = top ? '#a3160c' : '#bf2418'; c.fillRect(HX, mid - bh / 2, BAR0 + bw - HX, bh);
      c.beginPath(); c.moveTo(BAR0 + bw, mid - bh / 2); c.lineTo(BAR0 + bw + bh * 0.5, mid); c.lineTo(BAR0 + bw, mid + bh / 2); c.closePath(); c.fill();
    }
    c.textAlign = 'right'; c.fillStyle = over ? (top ? '#8e140c' : '#b3200f') : INK; const inf = !Number.isFinite(r.score); c.font = `bold ${(top ? 52 : 44) * (inf ? 1.5 : 1)}px ${NUM}`;
    c.fillText(scoreText(r.score), X1 - 16, mid + 2, X1 - 16 - (BAR0 + (BAR1 - BAR0) * BARMAX + 22));
    if (top && flash > 0.05) { c.strokeStyle = `rgba(255,244,196,${Math.min(1, flash)})`; c.lineWidth = 4; c.shadowColor = 'rgba(255,214,110,0.9)'; c.shadowBlur = 26 * flash; rr(c, X0, y, w, h, 5); c.stroke(); }
    c.restore();
  }
  function paint(s, t) {
    const red = (s.red ?? 0) > 0.5 ? 1 : 0;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.drawImage(panels[red] ??= panel(red), 0, 0);
    // the date, gold numerals at the right
    c.save(); c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillStyle = goldText(c, 28, 96, red); c.font = `bold 86px ${NUM}`; c.letterSpacing = '2px';
    c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowOffsetY = 3; c.fillText(s.date ?? '', X1 - 8, 60); c.restore();
    // settled rows first (bottom up), then the ones on the move: each on its own opaque card, so it hides what is under it
    const vis = (s.rows ?? []).filter((r) => r.y <= ROWS - 0.05);
    const isMoving = (r) => Math.abs(r.y - Math.round(r.y)) > 0.01;
    for (const r of vis.filter((r) => !isMoving(r)).sort((a, b) => b.y - a.y)) drawRow(s, r, t, red);
    // the human line: a vermilion thread down the board, over the settled cards
    c.save(); c.setLineDash([11, 8]); c.strokeStyle = red ? '#ff4a2e' : '#d9301f'; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(HX, 144); c.lineTo(HX, CH - 30); c.stroke(); c.restore();
    for (const r of vis.filter(isMoving).sort((a, b) => (a.up ?? 0) - (b.up ?? 0) || b.y - a.y)) drawRow(s, r, t, red);
    if ((s.lit ?? 1) < 1) { c.fillStyle = `rgba(0,0,0,${1 - (s.lit ?? 1)})`; c.fillRect(0, 0, CW, CH); }
  }
  function update(s, t = 0) {
    root.visible = !!s && (s.show ?? 1) > 0;
    if (!root.visible) return;
    const k = JSON.stringify(s) + ((s.red ?? 0) > 0 || (s.rows ?? []).some((r) => r.glitch > 0) ? Math.floor(t * 12) : '');
    if (k !== key) { paint(s, t); tex.needsUpdate = true; key = k; }
  }
  return { root, update };
}
