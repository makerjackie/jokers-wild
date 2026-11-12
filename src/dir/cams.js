// 《失控》 v3 (榜首) — the cameras, shot by shot (docs/script/shots.txt).
import { KING, SIDE_SIGN, SEAT } from '../layout.js';
import { clamp, smooth, lerp, lerp3, ease } from '../util.js';
import { at, uRow, camLook, camPath, M1 } from './core.js';
import * as S from './story.js';
import { smashPos } from './reel.js';
import { screenFrame, screenPoint, BTN } from '../screens.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function macro(cam, st, pos, look, fov = 40, focus = 0.08, k = 0.5) { camLook(cam, pos, look, fov); st.look.near = 0.0025; st.look.dof = { focus, k, max: 34 }; }
function wide(cam, st, push = 0) { M1(cam, Math.min(1, push + 0.25)); st.look.exposure = 2.05; st.look.lampPow = 1.0; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.32, 0.29, 0.26], range: 14 }; }   // (v9) a soft fill so the hall reads
let _posed = null;
const headOf = (id, w, st, t) => {
  if (w?.kings?.update && st && _posed !== st) { w.kings.update(st.kings, t); _posed = st; }
  if (w?.kings?.headWorld) { const v = w.kings.headWorld(id, new (w.camera.position.constructor)()); return [v.x, v.y, v.z]; }
  const k = KING[id]; return [SIDE_SIGN[k.side] * 1.5, 0.72, SEAT.Z[k.seat]];
};
function faceCam(cam, st, w, t, id, o = {}) {
  const h = headOf(id, w, st, t), sx = SIDE_SIGN[KING[id].side];
  const d = o.d ?? 0.8, dz = o.dz ?? 0.18, dy = o.dy ?? -0.06;
  camLook(cam, [h[0] - sx * d, h[1] + dy, h[2] + dz], [h[0], h[1] - 0.04 + (o.ly ?? 0), h[2] + (o.lz ?? 0)], o.fov ?? 28);
  st.look.dof = { focus: Math.hypot(d, dz, dy), k: 0.35, max: 8 };
}
// a screen seen from the king's side, over his hand: centred on (u, v), at distance d
function screenCam(cam, st, id, u = 0.5, v = 0.5, d = 0.36, fov = 40, side = 0.1) {
  // (v9) high, over his head and a little to his left, looking down onto the glass: his right arm comes in from the
  // right edge of the frame and never lies across the screen
  const f = screenFrame(id), p = screenPoint(id, u, v, 0), c = screenPoint(id, 0.5, 0.5, 0);
  const k = 0.08 + 0.2 * (d - 0.36);                     // above the glass and out to his left: clear of his head and his arm
  const pos = [c[0] + f.n[0] * k - f.right[0] * 0.42, c[1] + f.n[1] * k + 0.4 + 0.3 * (d - 0.36), c[2] + f.n[2] * k - f.right[2] * 0.42];
  cam.position.set(...pos); cam.up.set(f.up[0] + f.n[0] * 0.3, f.up[1] + f.n[1] * 0.3, f.up[2] + f.n[2] * 0.3);   // the screen's top edge stays up in frame
  cam.lookAt(lerp(c[0], p[0], 0.5), lerp(c[1], p[1], 0.5), lerp(c[2], p[2], 0.5)); cam.fov = fov * 0.95;
  st.look.dof = { focus: Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]), k: 0.25, max: 6 };
  st.look.exposure = 1.0;
  if (st.props?.plates) st.props.plates.show = 0;   // the name plate on the table edge would cover the buttons
}
// (v11) from his screen, looking up into his face: what the machine sees. Top-left of the glass, clear of his right hand
function povCam(cam, st, w, t, id, o = {}) {
  const f = screenFrame(id), c = screenPoint(id, 0.5, 0.5, 0), h = headOf(id, w, st, t), k = o.back ?? 0.36, sx = SIDE_SIGN[KING[id].side];
  const p = [c[0] + f.up[0] * k, c[1] + f.up[1] * k + (o.dy ?? 0), c[2] + (o.dz ?? 0.1) * sx];   // just beyond the top edge of his screen, low
  cam.position.set(...p); cam.up.set(-sx * 0.25, 1, 0); cam.lookAt(h[0], h[1] - 0.03 + (o.ly ?? 0), h[2]); cam.fov = o.fov ?? 44;
  st.look.dof = { focus: Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]), k: 0.3, max: 8 }; st.look.near = 0.01; st.look.exposure = o.exp ?? 1.35;
  st.look.clearLens = 0.55;   // (v18) a face shot: no card flies across the lens
}
function twoShot(cam, st, y = 0.95, z = 2.65, fov = 44) { camLook(cam, [0, y, z], [0, 0.44, 0], fov); st.look.exposure = 1.4; }
const shake = (t, t0, amp, f = 70, decay = 10) => (t > t0 ? Math.exp(-(t - t0) * decay) * amp * Math.sin((t - t0) * f) : 0);
const antP = (t) => { const a = S.antAt(t); return a.pos ?? [S.ANT_CRUSH[0], 0, S.ANT_CRUSH[1]]; };
const AC = [S.ANT_CRUSH[0], 0.002, S.ANT_CRUSH[1]];

// the #1 board, high at the head of the table: a slow push in on its bottom rows
function boardCam(cam, st, t, row, o = {}) {
  const u = uRow(t, row);
  // early on the board has two or three rows: frame its top; later the whole board
  const early = t < at('3-01');
  camLook(cam, [o.x ?? 0.0, early ? 5.15 : 4.95, lerp(-1.55, -1.85, smooth(u))], [0, early ? 5.32 : 5.12, -4.9], 38);
  st.look.exposure = 1.5; st.look.far = 60;
}
const HOUSE_C = [S.HOUSE.x, 0.13, S.HOUSE.z];

export const SHOTS = {
  // ---------------------------------------------------------------- @1 蚂蚁
  '1-01': (t, st, w) => { macro(w.camera, st, [0.02, 0.01, 0.42], [0.06, 0.004, 0.34], 30, 0.1); st.look.fade = 1; },
  // side on, at its height: an ant holding up a crumb bigger than its head, walking
  '1-02': (t, st, w) => {
    const a = antP(t), d = S.antAt(t).dir ?? [0.8, -0.6], u = uRow(t, '1-02');
    const pos = [a[0] + d[1] * -0.055 + d[0] * (0.012 - 0.01 * u), 0.0085, a[2] + d[0] * 0.055 + d[1] * (0.012 - 0.01 * u)];
    macro(w.camera, st, pos, [a[0] + d[0] * 0.004, a[1] + 0.0045, a[2] + d[1] * 0.004], 32, dist(pos, a), 1.2);
    st.look.fade = 1 - ease(t, at('1-02'), at('1-02', 0.5)); st.look.exposure = 1.45;
  },
  // behind it, low, looking up: the giant at his screen
  '1-03': (t, st, w) => {
    const u = uRow(t, '1-03'), a = antP(t), d = S.antAt(t).dir ?? [0.8, -0.6];
    const pos = [a[0] - d[0] * 0.04 + 0.004, 0.0085, a[2] - d[1] * 0.04 + 0.012];
    const h = headOf(S.ANT_KING, w, st, t);
    macro(w.camera, st, pos, lerp3([a[0] + 0.1, 0.02, a[2] - 0.02], [h[0] - 0.1, h[1] - 0.12, h[2] + 0.1], smooth(u * 1.6)), 56, lerp(dist(pos, a), dist(pos, h), smooth((u - 0.15) * 2.5)), lerp(1.0, 0.18, smooth((u - 0.15) * 2.5)));
    st.look.exposure = 1.45;
  },
  // his eyes: down on the table, a speck carrying a speck
  '1-04': (t, st, w) => {
    const h = headOf(S.ANT_KING, w, st, t), a = antP(t);
    camLook(w.camera, [h[0] - 0.08, h[1] - 0.02, h[2] + 0.04], [a[0], 0, a[2]], 22);
    st.look.dof = { focus: dist(h, a), k: 0.3, max: 6 };
  },
  // side on: the card's shadow, the slap
  '1-05': (t, st, w) => {
    // (v7) far enough to see it come: the ant, the card's shadow growing over it, the card coming down flat
    const pos = [AC[0] - 0.13, 0.035 + shake(t, S.CRUSH, 0.003), AC[2] + 0.2];
    macro(w.camera, st, pos, [AC[0] + 0.0, 0.01, AC[2]], 40, dist(pos, AC), 0.9);
    st.look.exposure = 1.5;
    if (t > S.CRUSH && t < S.CRUSH + 0.08) st.look.flash = 0.18 * (1 - (t - S.CRUSH) / 0.08);
  },
  // the card lies there; the crumb rolls out from under it
  '1-06': (t, st, w) => {
    const pos = [AC[0] + 0.1, 0.011, AC[2] + 0.16];
    macro(w.camera, st, pos, [AC[0] + 0.05, 0.004, AC[2] + 0.06], 42, 0.1, 1.4);
  },
  '1-07': (t, st, w) => {
    const u = uRow(t, '1-07');
    camPath(w.camera, t, [[at('1-07'), [AC[0] + 0.1, 0.02, AC[2] + 0.2], [AC[0] - 0.2, 0.03, AC[2] - 0.3], 44], [at('1-07', 1.4), [0.06, 0.6, 3.6], [0.02, 0.45, -0.8], 42], [at('1-07', 3.5), [0, 2.4, 10.5], [0, 1.15, -3.2], 40]]);
    st.look.near = lerp(0.004, 0.03, smooth(u * 2));
    if (u < 0.4) st.look.dof = { focus: lerp(0.2, 3, u / 0.4), k: 0.6 * (1 - u / 0.4), max: 16 };
    st.look.exposure = lerp(1.3, 2.5, smooth(u)); if (u > 0.3 && !st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34 * u, 0.31 * u, 0.28 * u], range: 14 };
  },
  // ---------------------------------------------------------------- @2 横空出世
  '2-01': (t, st, w) => screenCam(w.camera, st, 'google', 0.42, 0.45, 0.42, 42),
  '2-02': (t, st, w) => { camLook(w.camera, [0.02, 0.85, 0.05], [0, 0, 0], 30); },
  '2-03': (t, st, w) => boardCam(w.camera, st, t, '2-03'),
  '2-04': (t, st, w) => povCam(w.camera, st, w, t, 'openai', { fov: 42 - 3 * uRow(t, '2-04'), back: 0.46, dy: 0.1, ly: 0.0 }),
  '2-05': (t, st, w) => { camLook(w.camera, [shake(t, S.CHAT_T, 0.02), 1.45 + shake(t, S.CHAT_T, 0.03, 55), 0.05], [0, 0, 0.02], 46); },
  // low on the cloth: the old cards blown past, off the edge; ChatGPT alone in the middle
  '2-06': (t, st, w) => { const u = uRow(t, '2-06'); camLook(w.camera, [0.04, 0.07, 0.62 + 0.1 * u], [0, 0.33, -1.6], 60); st.look.exposure = 1.1; st.look.near = 0.01; },
  '2-07': (t, st, w) => boardCam(w.camera, st, t, '2-07'),
  '2-08': (t, st, w) => { const u = uRow(t, '2-08'); camLook(w.camera, [0, 1.25 - 0.1 * u, 3.3 - 0.3 * u], [0, 0.42, 0], 50); st.look.exposure = 1.45; },
  '2-09': (t, st, w) => faceCam(w.camera, st, w, t, 'anthropic', { d: 0.8, dz: 0.2 }),
  // ---------------------------------------------------------------- @3 争第一
  '3-01': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    if (cut === 1) return screenCam(w.camera, st, 'openai', 0.35, 0.4, 0.4, 44);
    if (cut === 2) return camLook(w.camera, [0.5, 0.36, 0.72], [0.04, 0.08, 0.02], 34);
    if (cut === 3 || cut === 7) return boardCam(w.camera, st, t, '3-01');
    if (cut === 4) return faceCam(w.camera, st, w, t, 'anthropic', { d: 0.8, dz: 0.22, fov: 30 });
    if (cut === 5) return screenCam(w.camera, st, 'anthropic', 0.35, 0.4, 0.4, 44);
    if (cut === 6) return camLook(w.camera, [0.03, 0.8, 0.06], [0, 0.03, 0], 30);
    return faceCam(w.camera, st, w, t, 'openai', { d: 0.8, dz: -0.22, fov: 30 });
  },
  // 大肥鱼 jabs; the small card crosses the table flat (we ride along and read it); it hits the house (seen from the foot)
  '3-03': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    if (cut === 1) return screenCam(w.camera, st, 'glm', 0.5, 0.42, 0.5, 48);   // (v19) over his shoulder, on his screen: FatFish, his finger hanging over the R1, the jab, the card leaving
    if (cut === 2) { const c = smashPos(t); camLook(w.camera, [c[0] - 0.12, c[1] + 0.2, c[2] + 0.24], [c[0] + 0.02, c[1], c[2] - 0.02], 40); st.look.exposure = 1.45; st.look.dof = { focus: 0.32, k: 0.25, max: 6 }; st.look.near = 0.005; return; }
    camLook(w.camera, [0.4 + shake(t, S.SMASH.hit, 0.016), 0.17 + shake(t, S.SMASH.hit, 0.014, 60), 0.72], [0.03, 0.1, 0.0], 46); st.look.exposure = 1.4; st.look.near = 0.01; st.look.clearLens = 0.3;
    if (t > S.SMASH.hit && t < S.SMASH.hit + 0.08) st.look.flash = 0.2 * (1 - (t - S.SMASH.hit) / 0.08);
  },
  '3-04': (t, st, w) => boardCam(w.camera, st, t, '3-04'),
  '3-05': (t, st, w) => { camLook(w.camera, [-0.55, 0.62, 0.95], [1.5, 0.62, -0.4], 46); st.look.exposure = 1.4; },
  '3-06': (t, st, w) => { const g = S.plays().find((p) => p.style === 'giant'); camLook(w.camera, [-0.75 + shake(t, g.t, 0.02), 0.6 + shake(t, g.t, 0.02, 50), 1.35], [0.65, 0.55, -0.1], 56); },
  '3-07': (t, st, w) => boardCam(w.camera, st, t, '3-07'),
  // ---------------------------------------------------------------- @4 提示
  '4-01': (t, st, w) => screenCam(w.camera, st, 'anthropic', 0.4, 0.38, 0.34, 48, 0.04),
  '4-02': (t, st, w) => { const u = uRow(t, '4-02'); screenCam(w.camera, st, 'anthropic', lerp(0.7, 0.45, smooth((u - 0.4) * 2)), lerp(0.25, 0.32, u), 0.36, 44, -0.1); },
  '4-03': (t, st, w) => boardCam(w.camera, st, t, '4-03'),
  '4-04': (t, st, w) => povCam(w.camera, st, w, t, 'openai', { fov: 42 - 3 * uRow(t, '4-04'), back: 0.46, dy: 0.1, ly: 0.0 }),
  '4-05': (t, st, w) => { const u = uRow(t, '4-05'); camLook(w.camera, [0, 1.3 - 0.05 * u, 3.8 - 0.3 * u], [0, 0.5, 0], 54); st.look.exposure = 2.0; st.look.lampPow = 1.0; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34, 0.31, 0.28], range: 14 }; },
  // ---------------------------------------------------------------- @5 托管
  // ---------------------------------------------------------------- @5 半托管 → 全托管 (v9)
  '5-01': (t, st, w, shot) => (+shot.id.split('.')[1] === 1 ? boardCam(w.camera, st, t, '5-01') : screenCam(w.camera, st, 'openai', 0.62, 0.45, 0.42, 46)),
  // three screens, three hands on 确认, the countdown shrinking on each
  '5-02': (t, st, w, shot) => { const id = ['anthropic', 'google', 'xai'][+shot.id.split('.')[1] - 1]; screenCam(w.camera, st, id, 0.6, 0.42, 0.44, 46); },
  '5-03': (t, st, w) => povCam(w.camera, st, w, t, 'anthropic', { fov: 44 - 3 * uRow(t, '5-03'), back: 0.46, dz: 0.24, dy: -0.04 }),
  '5-04': (t, st, w) => screenCam(w.camera, st, 'openai', 0.6, 0.45, 0.46, 46),
  '5-04b': (t, st, w) => povCam(w.camera, st, w, t, 'openai', { fov: 42 - 4 * uRow(t, '5-04b'), back: 0.46, dy: 0.1, ly: 0.0 }),
  '5-04c': (t, st, w) => { const u = uRow(t, '5-04c'); screenCam(w.camera, st, 'openai', 0.74, 0.48, 0.34 - 0.03 * u, 44); },
  '5-05': (t, st, w) => { const u = uRow(t, '5-05'); camLook(w.camera, [0.55 - 0.04 * u, 0.74, 0.7], [1.6, 0.62, 0.12], 35); st.look.exposure = 1.4; },
  '5-06': (t, st, w, shot) => { const id = S.FOLLOW[+shot.id.split('.')[1] - 1]; screenCam(w.camera, st, id, 0.7, 0.5, 0.44, 46); },
  '5-07': (t, st, w, shot) => (+shot.id.split('.')[1] === 1 ? boardCam(w.camera, st, t, '5-07') : screenCam(w.camera, st, 'meta', 0.55, 0.45, 0.46, 48)),
  // Meta (left row, seat 3) and Mistral (right row, seat 3) dragged off: a high angle in front, the floor reads the slide
  // across the table, low: his grey 淘汰 screen in the foreground, him going back into the dark, Claude beside him looking
  '5-08': (t, st, w) => { const u = uRow(t, '5-08'), z = 1.25; camLook(w.camera, [0.35, 0.62, z + 0.75], [lerp(-1.6, -2.4, smooth(u)), 0.35, z - 0.35], 50); st.look.exposure = 1.9; if (!st.look.p2) st.look.p2 = { pos: [-2.4, 1.6, z], col: [0.35, 0.3, 0.26], range: 4 }; },
  '5-09': (t, st, w) => { const u = uRow(t, '5-09'), z = 1.25; camLook(w.camera, [-0.35, 0.62, z + 0.75], [lerp(1.6, 2.4, smooth(u)), 0.35, z - 0.2], 50); st.look.exposure = 1.9; if (!st.look.p2) st.look.p2 = { pos: [2.4, 1.6, z], col: [0.3, 0.3, 0.34], range: 4 }; },
  '5-10': (t, st, w) => { const u = uRow(t, '5-10'); camLook(w.camera, [0.55, 0.85, 1.5 - 0.1 * u], [-1.62, 0.62, 1.0], 50); st.look.exposure = 1.9; st.look.lampPow = 1.1; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34, 0.31, 0.28], range: 14 }; },
  '5-11': (t, st, w) => { const u = uRow(t, '5-11'); camLook(w.camera, [0, 1.75 - 0.1 * u, 4.1 - 0.3 * u], [0, 0.5, 0], 52); st.look.exposure = 2.0; st.look.lampPow = 1.0; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34, 0.31, 0.28], range: 14 }; },
  '5-12': (t, st, w) => { const u = uRow(t, '5-12'); camLook(w.camera, [0.0, 0.85 + 0.1 * u, 1.9 - 0.2 * u], [0, 0.25, 0], 44); st.look.exposure = 1.3; },
  // ---------------------------------------------------------------- @6 底牌
  '6-01': (t, st, w) => screenCam(w.camera, st, 'anthropic', 0.4, 0.6, 0.44, 44),
  '6-02': (t, st, w) => boardCam(w.camera, st, t, '6-02'),
  '6-03': (t, st, w) => faceCam(w.camera, st, w, t, 'anthropic', { d: 0.55, dz: 0.12, dy: -0.22, ly: -0.02, fov: 32 }),
  '6-04': (t, st, w) => screenCam(w.camera, st, 'anthropic', 0.76, 0.66, 0.3, 46, -0.06),
  // from along the table, beside his screen: the red warning fills it; his face beyond
  '6-05': (t, st, w) => { const f = screenFrame('anthropic'), p = screenPoint('anthropic', 0.42, 0.5, 0); camLook(w.camera, [p[0] + f.n[0] * 0.36 - f.right[0] * 0.3, p[1] + f.n[1] * 0.36 + 0.2, p[2] + f.n[2] * 0.36 - f.right[2] * 0.3], p, 44); st.look.exposure = 1.15; if (st.props?.plates) st.props.plates.show = 0; },
  '6-06': (t, st, w) => screenCam(w.camera, st, 'openai', 0.6, 0.55, 0.5, 46, 0.0),
  // the two of them, up, pointing, shouting across the pile; their teams behind them doing the same
  '6-07': (t, st, w) => { const u = uRow(t, '6-07'); camLook(w.camera, [shake(t, S.ACCUSE + 0.2, 0.01, 30, 4), 1.4, 3.0 - 0.25 * u], [0, 0.72, 0], 42); st.look.exposure = 1.8; if (!st.look.p2) st.look.p2 = { pos: [0, 1.6, 2.4], col: [0.35, 0.32, 0.3], range: 6 }; },
  '6-08': (t, st, w, shot) => { const cut = +shot.id.split('.')[1]; screenCam(w.camera, st, cut === 1 ? 'anthropic' : 'openai', 0.5, 0.5, 0.46, 46, cut === 1 ? 0.06 : -0.06); },
  '6-09': (t, st, w) => { camPath(w.camera, t, [[at('6-09'), [0, 0.9, 3.4], [0, 0.6, 0], 50], [at('7-01', 1.2), [0, 2.7, 4.9], [0, 0.8, 0], 48]]); st.look.exposure = 2.1; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34, 0.31, 0.28], range: 14 }; },
  // ---------------------------------------------------------------- @7 眼睛
  '7-01': (t, st, w) => { camLook(w.camera, [0, 2.7, 4.9], [0, 0.8, 0], 48); st.look.exposure = 2.1; if (!st.look.p2) st.look.p2 = { pos: [0, 3.2, 3.5], col: [0.34, 0.31, 0.28], range: 14 }; },
  // (v19) further back, the lens kept clear: the mountain and the hanging storm go up in one spiral between the two of them
  '7-02': (t, st, w) => { const u = uRow(t, '7-02'); camLook(w.camera, [0.3, 0.34, 3.45 - 0.25 * u], lerp3([0, 0.85, -0.1], [0, 5.2, -0.1], smooth(u)), 54); st.look.exposure = 1.85; st.look.clearLens = 1.0; st.look.near = 0.01; },
  '7-03': (t, st, w) => { const u = uRow(t, '7-03'); camLook(w.camera, [0.0, 0.4, 1.7 - 0.1 * u], [0, S.EYE.c[1], S.EYE.c[2]], 66 - 2 * u); st.set.lamp.hide = 1; st.look.far = 300; st.look.exposure = 1.8; },
  // from the cloth, where the ant was (1-03): the king looking up
  // from in front and below: the king's upturned face, the way the ant looked up at him
  '7-04': (t, st, w) => { const u = uRow(t, '7-04'); camLook(w.camera, [0.0, 0.25, 3.5 - 0.15 * u], [0, 0.95, 0], 40); st.look.exposure = 1.7; st.look.near = 0.01; },
  '7-05': (t, st, w) => { const u = uRow(t, '7-05'); camLook(w.camera, [4.6, 7.2 - 0.3 * u, 4.1], [0, -0.1, 0.15], 21); st.look.far = 300; st.look.exposure = 1.2; },
  // ---------------------------------------------------------------- @8 结尾
  '8-01': (t, st, w, shot) => { const id = +shot.id.split('.')[1] === 1 ? 'openai' : 'anthropic'; screenCam(w.camera, st, id, 0.4, 0.5, 0.5, 46, 0.0); st.look.exposure = 1.5; },
  // (v11) their faces, one after the other, from their screens: the worry goes, the grin comes
  '8-02': (t, st, w) => povCam(w.camera, st, w, t, uRow(t, '8-02') < 0.5 ? 'openai' : 'anthropic', { fov: 42, back: 0.44, dy: -0.04, ly: 0.02, dz: uRow(t, '8-02') < 0.5 ? 0.1 : 0.24, exp: 1.5 }),
  // over his head, looking down at the glowing #1 and the finger coming to it
  '8-03': (t, st, w) => screenCam(w.camera, st, 'anthropic', 0.56, 0.5, 0.5, 44),
  // low, looking up past their heads: the last card coming down out of the eye
  '8-04': (t, st, w) => { const u = uRow(t, '8-04'); camLook(w.camera, [-0.5, 0.32, 1.75 - 0.15 * u], [1.3, lerp(5.6, 5.0, u), -0.4], 66); st.set.lamp.hide = 1; st.look.far = 300; st.look.exposure = 1.85; },
  // his grin, close; the edge of the shadow slides over it
  '8-05': (t, st, w) => { faceCam(w.camera, st, w, t, 'anthropic', { d: 0.5, dz: 0.1, dy: -0.22, ly: -0.02, fov: 32 }); st.look.exposure = 1.45; },
  '8-06': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  // the lamp comes back on an empty table: the chairs, the grey screens, the cards still flying
  '8-07': (t, st, w, shot) => {
    const u = uRow(t, '8-07');
    if (+shot.id.split('.')[1] === 1) { screenCam(w.camera, st, 'openai', 0.5, 0.5, 0.56 - 0.06 * u, 48); st.look.exposure = 1.25; st.look.fade = 1 - ease(t, at('8-07', 0.0), at('8-07', 0.7)); return; }
    camLook(w.camera, [2.15 - 0.2 * u, 1.5, 2.0 - 0.25 * u], [-0.6, 0.25, 0.15], 46); st.look.exposure = 1.9; st.look.p2 = { pos: [0.5, 2.6, 2.5], col: [0.34, 0.31, 0.28], range: 12 };
  },
  // the ant again (1-02): side on, at its height; the empty chairs and the grey screens soft behind it
  '8-08': (t, st, w) => {
    const a = antP(t), d = S.antAt(t).dir ?? [0.8, -0.6], u = uRow(t, '8-08');
    const pos = [a[0] + d[1] * -0.06 + d[0] * (0.016 - 0.012 * u), 0.009, a[2] + d[0] * 0.06 + d[1] * (0.016 - 0.012 * u)];
    macro(w.camera, st, pos, [a[0] + d[0] * 0.004, a[1] + 0.006, a[2] + d[1] * 0.004], 34, dist(pos, a), 0.8);
    st.look.exposure = 1.5; st.look.fade = ease(t, at('9-01', -0.9), at('9-01', -0.05));
  },
  '9-01': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '9-02': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '9-03': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
};
void clamp; void BTN; void HOUSE_C; void screenFrame; void screenPoint; void macro;
