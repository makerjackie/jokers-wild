// Company marks drawn with canvas paths (no image or font files). Every company gets the same
// treatment: a clean, recognisable approximation of its real mark, and a bold sans wordmark.
//
//   drawLogo(ctx, id, x, y, size, opts?)      mark centred on (x, y), fitting a size x size box
//   drawWordmark(ctx, id, x, y, h, opts?)     name centred on (x, y), cap height h; returns its width
//   opts: { color }  overrides the colour of single-colour marks / wordmarks (e.g. white on dark)
//         { variant: 'g' } (google) draws the four-colour G instead of the Gemini sparkle
//         { align: 'left' } (wordmark) puts x at the left edge instead of the centre

export const BRAND = {
  openai: '#101010', google: '#3186ff', anthropic: '#d97757', xai: '#0b0b0d', meta: '#0866ff',
  deepseek: '#8a2232', qwen: '#5a44d6', kimi: '#a8611f', glm: '#2a72e0', doubao: '#cf3036', mistral: '#fa500f',
  nvidia: '#76b900', joker: '#b8232f',
};
export const WORDS = {
  openai: 'OpenAI', google: 'Gemini', anthropic: 'Claude', xai: 'xAI', meta: 'Meta',
  deepseek: '混沌', qwen: '万问', kimi: '月饼', glm: '大肥鱼', doubao: '豆沙包', mistral: 'Mistral', nvidia: 'NVIDIA',
  spacexai: 'SpaceXAI', spade: 'SPADES', heart: 'HEARTS', diamond: 'DIAMONDS', club: 'CLUBS',
};
const FONT = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif';

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
// a stadium (capsule) centre line: half straight length l, radius r, as a closed path
function stadium(c, l, r) {
  c.beginPath();
  c.moveTo(-l, -r); c.lineTo(l, -r); c.arc(l, 0, r, -Math.PI / 2, Math.PI / 2);
  c.lineTo(-l, r); c.arc(-l, 0, r, Math.PI / 2, Math.PI * 1.5); c.closePath();
}

// ---- OpenAI: six rounded links woven into a hexagonal knot ("blossom"). Each link is split in
// two halves; all first halves are laid down, then all second halves pass over them, which gives
// the symmetric over-under weave.
function openai(c, col) {
  const N = 6, d = 0.19, l = 0.135, r = 0.105, sw = 0.076, gap = 0.028, tilt = 0.2;
  const link = (k, half, w, mode) => {
    c.save();
    const a = (k / N) * Math.PI * 2 - Math.PI / 2;
    c.rotate(a); c.translate(d, 0); c.rotate(Math.PI / 2 + tilt);
    c.beginPath(); c.rect(half > 0 ? 0 : -1, -1, 1, 2); c.clip();
    stadium(c, l, r);
    c.lineWidth = w; c.globalCompositeOperation = mode; c.strokeStyle = col; c.stroke();
    c.restore();
  };
  c.save(); c.scale(1.12, 1.12);
  for (const half of [1, -1]) for (let k = 0; k < N; k++) { link(k, half, sw + gap * 2, 'destination-out'); link(k, half, sw, 'source-over'); }
  c.restore();
}

// ---- Google Gemini: four-point sparkle with concave sides, blue -> violet
function gemini(c) {
  const g = c.createLinearGradient(-0.4, 0.4, 0.4, -0.4);
  g.addColorStop(0, '#2f7ff2'); g.addColorStop(0.5, '#6f7ef0'); g.addColorStop(0.8, '#9a6fd8'); g.addColorStop(1, '#c46ba8');
  c.fillStyle = g;
  const k = 0.035;
  c.beginPath();
  c.moveTo(0, -0.5);
  c.bezierCurveTo(k * 0.4, -0.16, 0.16, -k * 0.4, 0.5, 0);
  c.bezierCurveTo(0.16, k * 0.4, k * 0.4, 0.16, 0, 0.5);
  c.bezierCurveTo(-k * 0.4, 0.16, -0.16, k * 0.4, -0.5, 0);
  c.bezierCurveTo(-0.16, -k * 0.4, -k * 0.4, -0.16, 0, -0.5);
  c.closePath(); c.fill();
}
// ---- Google G in four colours
function googleG(c) {
  const R = 0.35, w = 0.16, P = Math.PI;
  c.lineWidth = w; c.lineCap = 'butt';
  const arc = (a0, a1, col) => { c.beginPath(); c.arc(0, 0, R, a0, a1); c.strokeStyle = col; c.stroke(); };
  arc(1.1 * P, 1.79 * P, '#ea4335');
  arc(0.8 * P, 1.12 * P, '#fbbc05');
  arc(0.25 * P, 0.82 * P, '#34a853');
  arc(-0.01 * P, 0.27 * P, '#4285f4');
  c.fillStyle = '#4285f4';
  c.fillRect(0.0, -w / 2, R + w / 2, w * 0.92);
}

// ---- Anthropic / Claude: orange radial starburst with irregular rounded rays
const RAYS = [[0, 0.47], [27, 0.4], [58, 0.45], [86, 0.38], [113, 0.46], [142, 0.41], [171, 0.47], [203, 0.39], [232, 0.45], [262, 0.4], [291, 0.47], [322, 0.42]];
function claude(c, col) {
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round';
  for (let i = 0; i < RAYS.length; i++) {
    const [deg, len] = RAYS[i];
    const a = ((deg - 90 + (i % 3) * 2.5) * Math.PI) / 180;
    const w = 0.092 + 0.012 * ((i * 7) % 3) / 2;
    // a slightly tapered ray: draw as a quad + round tip
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const r1 = len - w * 0.42, w0 = w * 0.62, w1 = w * 0.5;
    c.beginPath();
    c.moveTo(nx * w0, ny * w0); c.lineTo(ca * r1 + nx * w1, sa * r1 + ny * w1);
    c.arc(ca * r1, sa * r1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
    c.lineTo(-nx * w0, -ny * w0); c.closePath(); c.fill();
  }
  c.beginPath(); c.arc(0, 0, 0.1, 0, Math.PI * 2); c.fill();
}

// ---- xAI: a bold backslash crossed by a thin, broken forward slash
function xai(c, col) {
  c.fillStyle = col;
  poly(c, [[-0.4, -0.42], [-0.2, -0.42], [0.4, 0.42], [0.2, 0.42]]);
  c.fill();
  const t = 0.05; // half thickness of the thin stroke (measured across x)
  // lower-left piece of the slash, stopping short of the bold bar
  poly(c, [[-0.42, 0.42], [-0.42 + t * 2.2, 0.42], [-0.08 + t, 0.02], [-0.13, 0.02]]);
  c.fill();
  // upper-right piece, running long past the box
  poly(c, [[0.06, -0.06], [0.06 + t * 2.0, -0.06], [0.46, -0.5], [0.46 - t * 2.0, -0.5]]);
  c.fill();
}

// ---- Meta: the infinity loop, blue gradient
function meta(c) {
  const g = c.createLinearGradient(-0.45, 0, 0.45, 0);
  g.addColorStop(0, '#0064e1'); g.addColorStop(0.5, '#0573f0'); g.addColorStop(1, '#0082fb');
  c.strokeStyle = g; c.lineWidth = 0.115; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    // a rounded figure eight, loops a little taller than a lemniscate, slight perspective
    const x = 0.4 * Math.sin(t);
    const y = -0.26 * Math.sin(2 * t) * (1 - 0.12 * Math.cos(t)) * 0.95;
    const yy = y * (1 + 0.1 * Math.sin(t));
    if (i === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
  }
  c.closePath(); c.stroke();
}

// ---- The five domestic kings are played by fictional parody brands (nothing drawn names a real company).
// Each mark is full colour by default; when a caller passes opts.color (e.g. white on a dark crown plate)
// it draws a one-colour version with its details knocked out, so it still reads.
function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
function knock(c, draw) { c.save(); c.globalCompositeOperation = 'destination-out'; draw(); c.restore(); }
function fillSoft(c, fill, w) { c.fillStyle = fill; c.strokeStyle = fill; c.lineWidth = w; c.lineJoin = 'round'; c.fill(); c.stroke(); }

// 大肥鱼 FatFish: a round, almost ball-shaped blue fish, a stubby forked tail, a fin tuft and one big eye
function fatFish(c, col) {
  const fill = col ?? lin(c, 0, -0.34, 0, 0.34, ['#2c6fe0', '#4f9cff', '#8cc8ff']);
  c.save(); c.translate(-0.02, 0.02);
  // tail
  c.beginPath(); c.moveTo(0.16, -0.05); c.quadraticCurveTo(0.33, -0.16, 0.45, -0.27); c.quadraticCurveTo(0.43, -0.08, 0.36, 0.0);
  c.quadraticCurveTo(0.43, 0.08, 0.45, 0.27); c.quadraticCurveTo(0.33, 0.16, 0.16, 0.05); c.closePath(); fillSoft(c, col ?? '#2c6fe0', 0.06);
  // fin tuft on top
  c.beginPath(); c.moveTo(-0.2, -0.22); c.quadraticCurveTo(-0.12, -0.44, 0.07, -0.37); c.quadraticCurveTo(0.04, -0.3, 0.08, -0.24); c.closePath(); fillSoft(c, col ?? '#2c6fe0', 0.05);
  // the ball body
  c.beginPath(); c.ellipse(-0.08, 0.0, 0.34, 0.32, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  // eye, smile
  const ex = -0.2, ey = -0.07;
  if (col) {
    knock(c, () => { c.beginPath(); c.arc(ex, ey, 0.115, 0, Math.PI * 2); c.fill(); c.lineWidth = 0.04; c.lineCap = 'round'; c.beginPath(); c.arc(-0.27, 0.1, 0.07, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); });
    c.fillStyle = col; c.beginPath(); c.arc(ex - 0.03, ey + 0.015, 0.06, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex, ey, 0.115, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0d1d44'; c.beginPath(); c.arc(ex - 0.03, ey + 0.015, 0.065, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex - 0.05, ey - 0.012, 0.022, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0d1d44'; c.lineWidth = 0.035; c.lineCap = 'round';
    c.beginPath(); c.arc(-0.27, 0.1, 0.07, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    c.fillStyle = 'rgba(255,120,150,0.55)'; c.beginPath(); c.ellipse(-0.06, 0.1, 0.06, 0.04, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// 混沌 HUNDUN (wholly fictional): the faceless one of the old fable, a smooth dark-red pebble with one spiral groove
function hundun(c, col) {
  c.save();
  c.beginPath(); c.ellipse(0, 0.02, 0.42, 0.37, -0.12, 0, Math.PI * 2);
  c.fillStyle = col ?? lin(c, -0.3, -0.35, 0.3, 0.4, ['#c2434f', '#8a2232', '#4a0f19']); c.fill();
  const groove = () => { c.lineWidth = 0.075; c.lineCap = 'round'; c.beginPath(); for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 3.1, r = 0.03 + 0.085 * a / Math.PI; const x = Math.cos(a + 0.6) * r, y = 0.03 + Math.sin(a + 0.6) * r * 0.9; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
  if (col) knock(c, groove); else { c.strokeStyle = 'rgba(255,225,215,0.85)'; groove(); }
  if (!col) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-0.17, -0.18, 0.12, 0.06, -0.5, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

// 万问: a fat question mark built from four blocks and a square dot, indigo -> violet
function wanWen(c, col) {
  c.save(); c.translate(0, -0.015);
  c.strokeStyle = col ?? lin(c, -0.3, -0.4, 0.3, 0.3, ['#3b3fe0', '#6a4ae6', '#9a55e8']);
  c.lineWidth = 0.18; c.lineCap = 'round'; c.lineJoin = 'round';
  const cy = -0.17, R = 0.19;
  c.beginPath(); c.arc(0, cy, R, Math.PI, Math.PI * 2.2); c.quadraticCurveTo(0.0, 0.0, 0.0, 0.12); c.stroke();
  knock(c, () => {
    c.lineWidth = 0.045; c.lineCap = 'butt';
    for (const a of [1.36, 1.72, 2.08]) { const t = a * Math.PI; c.beginPath(); c.moveTo(Math.cos(t) * 0.05, cy + Math.sin(t) * 0.05); c.lineTo(Math.cos(t) * 0.4, cy + Math.sin(t) * 0.4); c.stroke(); }
  });
  c.fillStyle = col ?? '#9a55e8'; roundRect(c, -0.095, 0.25, 0.19, 0.19, 0.05); c.fill();
  c.restore();
}

// 月饼: a fluted round mooncake with a stamped flower, one bite taken out (the filling shows at the bite)
function mooncake(c, col) {
  const N = 12, R = 0.44, a = 0.05;
  const cake = () => { c.beginPath(); for (let i = 0; i <= 288; i++) { const t = (i / 288) * Math.PI * 2, r = R - a + a * Math.abs(Math.cos((N * t) / 2)); c.lineTo(Math.cos(t) * r, Math.sin(t) * r); } c.closePath(); };
  const BITE = [[0.33, -0.33, 0.18], [0.4, -0.14, 0.11], [0.14, -0.4, 0.11]];
  const bite = (k) => { c.beginPath(); for (const [x, y, r] of BITE) { c.moveTo(x + r + k, y); c.arc(x, y, r + k, 0, Math.PI * 2); } };
  const petals = () => { c.beginPath(); for (let k = 0; k < 4; k++) { const t = (k * Math.PI) / 2 + Math.PI / 4; c.ellipse(Math.cos(t) * 0.1, Math.sin(t) * 0.1, 0.095, 0.05, t, 0, Math.PI * 2); c.closePath(); } };
  if (col) {
    cake(); c.fillStyle = col; c.fill();
    knock(c, () => { c.lineWidth = 0.035; c.beginPath(); c.arc(0, 0, 0.28, 0, Math.PI * 2); c.stroke(); petals(); c.fill(); bite(0); c.fill(); });
    return;
  }
  cake(); c.fillStyle = '#c27630'; c.fill();
  c.beginPath(); c.arc(0, 0, 0.34, 0, Math.PI * 2); c.fillStyle = lin(c, -0.2, -0.3, 0.2, 0.3, ['#f2c27a', '#dd9a4c']); c.fill();
  c.strokeStyle = '#a65d22'; c.lineWidth = 0.035; c.beginPath(); c.arc(0, 0, 0.27, 0, Math.PI * 2); c.stroke();
  petals(); c.fillStyle = '#b8682a'; c.fill();
  c.beginPath(); c.arc(0, 0, 0.035, 0, Math.PI * 2); c.fillStyle = '#f2c27a'; c.fill();
  // the bite: a lotus-paste rim of filling, then the hole
  c.save(); cake(); c.clip(); bite(0.045); c.fillStyle = '#6e3a1e'; c.fill(); c.restore();
  knock(c, () => { bite(0); c.fill(); });
}

// 智普普: a sleepy slate tile with a stacked "Zzz", big to small, drifting up
function zzz(c, col) {
  c.fillStyle = col ?? lin(c, 0, -0.44, 0, 0.44, ['#56688e', '#2e3953']);
  roundRect(c, -0.44, -0.44, 0.88, 0.88, 0.2); c.fill();
  const Z = (x, y, s, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(x - s / 2, y - s / 2); c.lineTo(x + s / 2, y - s / 2); c.lineTo(x - s / 2, y + s / 2); c.lineTo(x + s / 2, y + s / 2); c.stroke(); };
  const all = () => { c.lineCap = 'round'; c.lineJoin = 'round'; Z(-0.15, 0.15, 0.27, 0.1); Z(0.17, -0.1, 0.16, 0.07); Z(0.32, -0.31, 0.09, 0.05); };
  if (col) knock(c, all); else { c.strokeStyle = '#f2f5fc'; all(); }
}

// 豆沙包: a white steamed bun with a pleated top and one red-bean dot, on a red tile
function bun(c, col) {
  c.fillStyle = col ?? lin(c, 0, -0.44, 0, 0.44, ['#e8473f', '#c52a31']);
  roundRect(c, -0.44, -0.44, 0.88, 0.88, 0.2); c.fill();
  const shape = () => {
    c.beginPath(); c.moveTo(0, -0.25);
    c.bezierCurveTo(0.25, -0.25, 0.39, -0.07, 0.37, 0.1); c.bezierCurveTo(0.36, 0.22, 0.29, 0.26, 0.18, 0.26);
    c.lineTo(-0.18, 0.26); c.bezierCurveTo(-0.29, 0.26, -0.36, 0.22, -0.37, 0.1); c.bezierCurveTo(-0.39, -0.07, -0.25, -0.25, 0, -0.25);
    c.closePath();
  };
  // pleats swirl out from the pinch like a pinwheel
  const DOT = [0, -0.14];
  const pleats = () => {
    c.lineWidth = 0.032; c.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2 - Math.PI / 2, u = t + 0.9, r0 = 0.07, r1 = 0.17;
      c.beginPath(); c.moveTo(DOT[0] + Math.cos(t) * r0, DOT[1] + Math.sin(t) * r0 * 0.7);
      c.quadraticCurveTo(DOT[0] + Math.cos(t + 0.45) * r1, DOT[1] + Math.sin(t + 0.45) * r1 * 0.7, DOT[0] + Math.cos(u) * r1 * 1.05, DOT[1] + Math.sin(u) * r1 * 0.75);
      c.stroke();
    }
  };
  const dot = () => { c.beginPath(); c.arc(DOT[0], DOT[1], 0.065, 0, Math.PI * 2); c.fill(); };
  if (col) {
    knock(c, () => { shape(); c.fill(); });
    c.strokeStyle = col; c.fillStyle = col; pleats(); dot();
    return;
  }
  c.save(); c.translate(0, 0.035); shape(); c.fillStyle = 'rgba(90,0,10,0.35)'; c.fill(); c.restore();
  shape(); c.fillStyle = lin(c, 0, -0.25, 0, 0.26, ['#ffffff', '#fdf8ee', '#ecdcc0']); c.fill();
  c.strokeStyle = '#d9c6a6'; pleats();
  c.fillStyle = '#d42f35'; dot();
}
// ---- precise marks from published path data (see docs/research/ai-race-timeline.md §9). Each draws in a
// unit box centred on the origin ([-0.5, 0.5]), like the hand-built marks above.
const CLAUDE_D = 'm19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z';
function pathMark(c, d, box, col) { c.save(); c.translate(-0.5, -0.5); c.scale(1 / box, 1 / box); c.fillStyle = col; c.fill(new Path2D(d), 'evenodd'); c.restore(); }
function polys100(c, list, col) { c.save(); c.translate(-0.5, -0.5); c.scale(0.01, 0.01); c.fillStyle = col; for (const pts of list) { poly(c, pts); c.fill(); } c.restore(); }
function geminiStar(c) {
  c.save(); c.translate(-0.5, -0.5); c.scale(0.01, 0.01);
  const d = Math.PI / 180; c.beginPath(); c.moveTo(50, 4);
  c.arc(107.7, -7.7, 58.9, 168.5 * d, 101.5 * d, true); c.arc(107.7, 107.7, 58.9, 258.5 * d, 191.5 * d, true);
  c.arc(-7.7, 107.7, 58.9, 348.5 * d, 281.5 * d, true); c.arc(-7.7, -7.7, 58.9, 78.5 * d, 11.5 * d, true); c.closePath();
  c.save(); c.clip(); c.fillStyle = '#3186ff'; c.fillRect(0, 0, 100, 100);
  const blob = (x0, y0, x1, y1, col) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, col); g.addColorStop(1, col + '00'); c.fillStyle = g; c.fillRect(0, 0, 100, 100); };
  blob(29, 65, 46, 50, '#08b962'); blob(33, 23, 48, 46, '#f94543');
  const gy = c.createLinearGradient(15, 56, 73, 50); gy.addColorStop(0, '#fabc12'); gy.addColorStop(0.46, '#fabc1200'); c.fillStyle = gy; c.fillRect(0, 0, 100, 100);
  c.restore(); c.restore();
}
function xaiMark(c, col) {
  polys100(c, [[[4.94, 35.35], [50.21, 100], [70.33, 100], [25.06, 35.35]], [[4.92, 100], [25.05, 100], [35.11, 85.63], [25.05, 71.26]],
    [[95.08, 0], [74.94, 0], [40.15, 49.69], [50.22, 64.07]], [[78.58, 100], [95.08, 100], [95.08, 7.19], [78.58, 30.74]]], col);
}
function mistralM(c) {
  const rows = [[[1, 5], '#ffd800'], [[1, 2, 4, 5], '#ffaf00'], [[1, 2, 3, 4, 5], '#ff8205'], [[1, 3, 5], '#fa500f'], [[0, 1, 2, 4, 5, 6], '#e10500']];
  const s = 1 / 7;
  rows.forEach(([cols, col], r) => { c.fillStyle = col; for (const k of cols) c.fillRect(-0.5 + k * s, -0.5 + 0.1429 + r * s, s + 0.002, s + 0.002); });
}
function nvidiaEye(c) {
  c.save(); c.translate(-0.5, -0.5); c.scale(0.01, 0.01);
  c.fillStyle = '#76b900'; c.fillRect(42.5, 18.75, 57.5, 62.5);
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(42.5, 32); c.quadraticCurveTo(70, 26, 78.6, 44.7); c.quadraticCurveTo(70, 63, 42.5, 60); c.closePath(); c.fill();
  c.fillStyle = '#76b900'; c.beginPath(); c.moveTo(42.5, 38); c.quadraticCurveTo(63, 35, 69, 44.9); c.quadraticCurveTo(63, 55, 42.5, 53); c.closePath(); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(50, 45.5, 5.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#76b900';
  c.beginPath(); c.moveTo(8.3, 44.7); c.quadraticCurveTo(20, 22, 42.5, 22); c.lineTo(42.5, 28); c.quadraticCurveTo(24, 30, 15, 45); c.quadraticCurveTo(24, 60, 42.5, 63); c.lineTo(42.5, 69); c.quadraticCurveTo(20, 68, 8.3, 44.7); c.fill();
  c.restore();
}
function joker(c) {
  // the film's own mark: a jester's grin in a card frame
  c.fillStyle = '#efe6d2'; roundRect(c, -0.36, -0.48, 0.72, 0.96, 0.08); c.fill();
  c.fillStyle = '#b8232f';
  c.beginPath(); c.moveTo(-0.3, -0.18); c.quadraticCurveTo(-0.22, -0.46, -0.04, -0.3); c.quadraticCurveTo(0.0, -0.44, 0.04, -0.3); c.quadraticCurveTo(0.22, -0.46, 0.3, -0.18); c.closePath(); c.fill();
  c.strokeStyle = '#141010'; c.lineWidth = 0.05; c.lineCap = 'round';
  c.beginPath(); c.arc(0, 0.02, 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  c.beginPath(); c.arc(-0.1, -0.08, 0.035, 0, Math.PI * 2); c.arc(0.1, -0.08, 0.035, 0, Math.PI * 2); c.fillStyle = '#141010'; c.fill();
}

// v4: the four suits (unit box, centred), red or black unless a colour is given
export const SUIT_COL = { spade: '#16161a', club: '#16161a', heart: '#b8232f', diamond: '#b8232f' };
export function suitPath(c, id) {
  c.beginPath();
  if (id === 'heart') { c.moveTo(0, 0.42); c.bezierCurveTo(-0.5, 0.05, -0.46, -0.42, -0.2, -0.42); c.bezierCurveTo(-0.06, -0.42, 0, -0.3, 0, -0.22); c.bezierCurveTo(0, -0.3, 0.06, -0.42, 0.2, -0.42); c.bezierCurveTo(0.46, -0.42, 0.5, 0.05, 0, 0.42); }
  else if (id === 'diamond') { c.moveTo(0, -0.46); c.quadraticCurveTo(0.12, -0.16, 0.34, 0); c.quadraticCurveTo(0.12, 0.16, 0, 0.46); c.quadraticCurveTo(-0.12, 0.16, -0.34, 0); c.quadraticCurveTo(-0.12, -0.16, 0, -0.46); }
  else if (id === 'spade') { c.moveTo(0, -0.46); c.bezierCurveTo(0.08, -0.3, 0.46, -0.1, 0.42, 0.12); c.bezierCurveTo(0.38, 0.3, 0.14, 0.32, 0.04, 0.18); c.lineTo(0.12, 0.44); c.lineTo(-0.12, 0.44); c.lineTo(-0.04, 0.18); c.bezierCurveTo(-0.14, 0.32, -0.38, 0.3, -0.42, 0.12); c.bezierCurveTo(-0.46, -0.1, -0.08, -0.3, 0, -0.46); }
  else { c.arc(0, -0.22, 0.17, 0, Math.PI * 2); c.moveTo(-0.08, 0.06); c.arc(-0.21, 0.06, 0.17, 0, Math.PI * 2); c.moveTo(0.38, 0.06); c.arc(0.21, 0.06, 0.17, 0, Math.PI * 2); c.moveTo(-0.05, 0.05); c.lineTo(0.05, 0.05); c.lineTo(0.13, 0.44); c.lineTo(-0.13, 0.44); c.closePath(); }
}
function suitMark(c, id, col) { c.fillStyle = col ?? SUIT_COL[id]; suitPath(c, id); c.fill(); }
export function drawLogo(ctx, id, x, y, size, opts = {}) {
  const S = Math.max(16, Math.ceil(size * 1.25));
  const off = offscreen(S, S);
  const c = off.getContext('2d');
  c.translate(S / 2, S / 2); c.scale(size, size);
  const col = opts.color ?? BRAND[id] ?? '#222';
  switch (id) {
    case 'openai': openai(c, col); break;
    case 'google': if (opts.variant === 'g') googleG(c); else geminiStar(c); break;
    case 'anthropic': pathMark(c, CLAUDE_D, 100, opts.color ?? '#d97757'); break;
    case 'xai': xaiMark(c, col); break;
    case 'meta': meta(c); break;
    case 'deepseek': hundun(c, opts.color); break;
    case 'qwen': wanWen(c, opts.color); break;
    case 'kimi': mooncake(c, opts.color); break;
    case 'glm': fatFish(c, opts.color); break;
    case 'doubao': bun(c, opts.color); break;
    case 'mistral': mistralM(c); break;
    case 'nvidia': nvidiaEye(c); break;
    case 'joker': joker(c); break;
    case 'spade': case 'heart': case 'diamond': case 'club': suitMark(c, id, opts.color); break;
    default: break;
  }
  ctx.drawImage(off, x - S / 2, y - S / 2);
}

const LETTERS_G = ['#4285f4', '#ea4335', '#fbbc05', '#4285f4', '#34a853', '#ea4335'];
export function drawWordmark(ctx, id, x, y, h, opts = {}) {
  const word = WORDS[id] ?? id;
  const px = h / 0.72;
  const weight = id === 'deepseek' || id === 'qwen' ? 700 : id === 'anthropic' ? 600 : 700;
  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const track = id === 'anthropic' ? 0.16 * px : id === 'xai' ? 0.02 * px : -0.01 * px;
  const ws = [...word].map((ch) => ctx.measureText(ch).width);
  const W = ws.reduce((a, b) => a + b, 0) + track * (word.length - 1);
  let cx = opts.align === 'left' ? x : x - W / 2;
  const by = y + h / 2;
  const col = opts.color ?? (id === 'meta' ? '#1c2b33' : id === 'anthropic' ? '#191919' : BRAND[id]);
  [...word].forEach((ch, i) => {
    ctx.fillStyle = id === 'google' && !opts.color ? LETTERS_G[i % 6] : col;
    ctx.fillText(ch, cx, by);
    cx += ws[i] + track;
  });
  ctx.restore();
  return W;
}
