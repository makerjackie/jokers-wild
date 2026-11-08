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
  deepseek: '#4d6bfe', qwen: '#082dff', kimi: '#16161c', glm: '#2d2d2d', doubao: '#1e37fc', mistral: '#fa500f',
  nvidia: '#76b900', joker: '#b8232f',
};
export const WORDS = {
  openai: 'OpenAI', google: 'Gemini', anthropic: 'Claude', xai: 'xAI', meta: 'Meta',
  deepseek: 'deepseek', qwen: 'Qwen', kimi: 'Kimi', glm: 'Z.ai', doubao: '豆包', mistral: 'Mistral', nvidia: 'NVIDIA',
  spacexai: 'SpaceXAI',
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

// ---- DeepSeek: a blue whale with its tail curled up over its back
function deepseek(c, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-0.47, 0.06);                                  // nose
  c.bezierCurveTo(-0.46, -0.14, -0.26, -0.24, -0.06, -0.2); // forehead
  c.bezierCurveTo(0.1, -0.17, 0.2, -0.1, 0.26, -0.15);    // back
  c.bezierCurveTo(0.3, -0.19, 0.3, -0.28, 0.26, -0.34);   // tail stock rising
  c.bezierCurveTo(0.33, -0.36, 0.42, -0.42, 0.47, -0.37); // upper fluke
  c.bezierCurveTo(0.43, -0.32, 0.4, -0.3, 0.37, -0.29);
  c.bezierCurveTo(0.45, -0.24, 0.47, -0.17, 0.45, -0.12); // lower fluke
  c.bezierCurveTo(0.41, -0.18, 0.37, -0.2, 0.34, -0.2);
  c.bezierCurveTo(0.36, 0.02, 0.24, 0.24, -0.02, 0.27);   // belly
  c.bezierCurveTo(-0.22, 0.29, -0.4, 0.24, -0.47, 0.06);
  c.closePath(); c.fill();
  // white belly line and eye knocked out
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.lineWidth = 0.045; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-0.38, 0.1); c.bezierCurveTo(-0.24, 0.2, -0.02, 0.2, 0.16, 0.08); c.stroke();
  c.beginPath(); c.arc(-0.27, -0.06, 0.042, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---- Qwen: three hooked bands folded into a hexagonal knot, purple gradient
function qwen(c) {
  const g = c.createLinearGradient(-0.4, -0.4, 0.4, 0.4);
  g.addColorStop(0, '#6a5cf0'); g.addColorStop(1, '#8a62ea');
  c.strokeStyle = g; c.lineWidth = 0.13; c.lineJoin = 'round'; c.lineCap = 'butt';
  const R = 0.38, V = (i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * R, Math.sin(a) * R]; };
  for (let k = 0; k < 3; k++) {
    const a = V(2 * k), b = V(2 * k + 1), d = V(2 * k + 2), e = V(2 * k + 3);
    const st = [a[0] + (e[0] - a[0]) * 0.45, a[1] + (e[1] - a[1]) * 0.45];
    c.beginPath(); c.moveTo(st[0], st[1]); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    c.lineTo(b[0] + (d[0] - b[0]) * 0.75, b[1] + (d[1] - b[1]) * 0.75); c.stroke();
  }
}

// ---- Kimi: a dark tile with a white K and a blue dot
function kimi(c, col) {
  c.fillStyle = col === '#ffffff' ? '#ffffff' : '#16161c';
  roundRect(c, -0.44, -0.44, 0.88, 0.88, 0.2); c.fill();
  c.fillStyle = col === '#ffffff' ? '#16161c' : '#ffffff';
  c.fillRect(-0.22, -0.25, 0.11, 0.5);
  poly(c, [[-0.13, 0.03], [0.1, -0.25], [0.24, -0.25], [-0.02, 0.06]]); c.fill();
  poly(c, [[-0.07, 0.0], [0.03, -0.06], [0.25, 0.25], [0.11, 0.25]]); c.fill();
  c.fillStyle = '#3a8bff';
  c.beginPath(); c.arc(0.26, -0.27, 0.065, 0, Math.PI * 2); c.fill();
}

// ---- Zhipu GLM: a blue tile with a bold geometric Z
function glm(c, col) {
  c.fillStyle = col;
  roundRect(c, -0.44, -0.44, 0.88, 0.88, 0.2); c.fill();
  c.fillStyle = '#ffffff';
  poly(c, [[-0.24, -0.25], [0.25, -0.25], [0.25, -0.13], [-0.06, 0.13], [0.25, 0.13], [0.25, 0.25], [-0.25, 0.25], [-0.25, 0.13], [0.06, -0.13], [-0.24, -0.13]]);
  c.fill();
  c.beginPath(); c.arc(0.0, 0.0, 0.0, 0, 0); c.fill();
}

// ---- precise marks from published path data (see docs/research/ai-race-timeline.md §9). Each draws in a
// unit box centred on the origin ([-0.5, 0.5]), like the hand-built marks above.
const CLAUDE_D = 'm19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z';
const DEEPSEEK_D = 'M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z';
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
function qwenBlocks(c, col) {
  c.save(); c.translate(-0.5, -0.5); c.scale(0.01, 0.01); c.fillStyle = col;
  const B = [[38.1, 0], [51.7, 0], [58.5, 11.75], [85.65, 11.75], [92.45, 23.5], [85.65, 35.3], [31.3, 35.3], [24.5, 23.5]];
  for (let k = 0; k < 3; k++) { c.save(); c.translate(50, 50); c.rotate((k * 2 * Math.PI) / 3); c.translate(-50, -50); poly(c, B); c.fill(); c.restore(); }
  c.restore();
}
function zaiZ(c) {
  c.save(); c.translate(-0.5, -0.5); c.scale(0.01, 0.01);
  c.fillStyle = '#2d2d2d'; roundRect(c, 5, 5, 90, 90, 13.3); c.fill();
  c.fillStyle = '#ffffff';
  for (const pts of [[[20.5, 23.7], [51.6, 23.7], [47.2, 29.8], [44.2, 31.4], [20.6, 31.4]], [[81, 23.7], [56.2, 23.7], [19, 76.4], [43.8, 76.4]],
    [[48.4, 76.4], [52.8, 70.2], [55.8, 68.6], [79.4, 68.6], [79.4, 76.4]]]) { poly(c, pts); c.fill(); }
  c.restore();
}
function mistralM(c) {
  const rows = [[[1, 5], '#ffd800'], [[1, 2, 4, 5], '#ffaf00'], [[1, 2, 3, 4, 5], '#ff8205'], [[1, 3, 5], '#fa500f'], [[0, 1, 2, 4, 5, 6], '#e10500']];
  const s = 1 / 7;
  rows.forEach(([cols, col], r) => { c.fillStyle = col; for (const k of cols) c.fillRect(-0.5 + k * s, -0.5 + 0.1429 + r * s, s + 0.002, s + 0.002); });
}
function doubaoBean(c) {
  // Doubao's model mark: a rounded bean of three colour blocks around a white window (approximation)
  c.save(); c.scale(0.92, 0.92);
  c.fillStyle = '#a569ff'; c.beginPath(); c.ellipse(0, -0.12, 0.42, 0.3, 0, Math.PI, 0); c.closePath(); c.fill();
  c.fillStyle = '#1e37fc'; c.beginPath(); c.ellipse(-0.06, 0.06, 0.4, 0.36, 0.35, Math.PI * 0.45, Math.PI * 1.25); c.closePath(); c.fill();
  c.fillStyle = '#37e1be'; c.beginPath(); c.ellipse(0.12, 0.08, 0.32, 0.3, -0.3, -Math.PI * 0.3, Math.PI * 0.55); c.closePath(); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0.02, 0.02, 0.17, 0.13, 0.2, 0, Math.PI * 2); c.fill();
  c.restore();
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
    case 'deepseek': pathMark(c, DEEPSEEK_D, 24, opts.color ?? '#4d6bfe'); break;
    case 'qwen': qwenBlocks(c, opts.color ?? '#082dff'); break;
    case 'kimi': kimi(c, opts.color ?? '#16161c'); break;
    case 'glm': zaiZ(c); break;
    case 'doubao': doubaoBean(c); break;
    case 'mistral': mistralM(c); break;
    case 'nvidia': nvidiaEye(c); break;
    case 'joker': joker(c); break;
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
