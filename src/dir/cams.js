// 《失控》 v3 (榜首) — the cameras, shot by shot (docs/script/shots.txt).
import { KING, SIDE_SIGN, SEAT } from '../layout.js';
import { clamp, smooth, lerp, lerp3, ease } from '../util.js';
import { at, uRow, camLook, camPath, M1 } from './core.js';
import * as S from './story.js';
import { smashPos } from './reel.js';
import { screenFrame, screenPoint, BTN } from '../screens.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function macro(cam, st, pos, look, fov = 40, focus = 0.08, k = 0.5) { camLook(cam, pos, look, fov); st.look.near = 0.0025; st.look.dof = { focus, k, max: 34 }; }
function wide(cam, st, push = 0) { M1(cam, Math.min(1, push + 0.25)); st.look.exposure = 1.75; st.look.lampPow = 1.0; }
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
  side = -Math.abs(side) - 0.04;   // (v8) always over his LEFT shoulder: the pressing right arm never crosses the lens
  const f = screenFrame(id), p = screenPoint(id, u, v, 0);
  d += 0.05;
  const pos = [p[0] + f.n[0] * d + f.right[0] * side + f.up[0] * 0.04, p[1] + f.n[1] * d + 0.04, p[2] + f.n[2] * d + f.right[2] * side];
  camLook(cam, pos, p, fov);
  st.look.dof = { focus: d, k: 0.5, max: 10 };
  st.look.exposure = 1.1;
  if (st.props?.plates) st.props.plates.show = 0;   // the name plate on the table edge would cover the buttons
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
  camLook(cam, [o.x ?? 0.06, early ? 5.35 : 4.95, lerp(-1.55, -1.85, smooth(u))], [0, early ? 5.58 : 5.12, -4.9], early ? 34 : 37);
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
    st.look.exposure = lerp(1.3, 1.9, smooth(u));
  },
  // ---------------------------------------------------------------- @2 横空出世
  '2-01': (t, st, w) => screenCam(w.camera, st, 'google', 0.42, 0.45, 0.42, 42),
  '2-02': (t, st, w) => { camLook(w.camera, [0.02, 0.85, 0.05], [0, 0, 0], 30); },
  '2-03': (t, st, w) => boardCam(w.camera, st, t, '2-03'),
  '2-04': (t, st, w) => faceCam(w.camera, st, w, t, 'openai', { d: 1.05, dz: -0.4, dy: -0.02, ly: -0.12, fov: 36 }),
  '2-05': (t, st, w) => { camLook(w.camera, [shake(t, S.CHAT_T, 0.02), 1.45 + shake(t, S.CHAT_T, 0.03, 55), 0.05], [0, 0, 0.02], 46); },
  // low on the cloth: the old cards blown past, off the edge; ChatGPT alone in the middle
  '2-06': (t, st, w) => { const u = uRow(t, '2-06'); camLook(w.camera, [0.04, 0.07, 0.5 + 0.1 * u], [0, 0.04, -1.6], 58); st.look.exposure = 1.1; st.look.near = 0.01; },
  '2-07': (t, st, w) => boardCam(w.camera, st, t, '2-07'),
  '2-08': (t, st, w) => { const u = uRow(t, '2-08'); camLook(w.camera, [0, 1.25 - 0.1 * u, 3.3 - 0.3 * u], [0, 0.42, 0], 50); st.look.exposure = 1.45; },
  '2-09': (t, st, w) => faceCam(w.camera, st, w, t, 'deepseek', { d: 0.8, dz: 0.2 }),
  // ---------------------------------------------------------------- @3 争第一
  '3-01': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    if (cut === 1) return screenCam(w.camera, st, 'openai', 0.35, 0.4, 0.4, 44);
    if (cut === 2) { camLook(w.camera, [0.2, 0.36, -0.2], [0.42, 0.06, -0.62], 42); st.look.exposure = 1.35; return; }
    if (cut === 3 || cut === 7) return boardCam(w.camera, st, t, '3-01');
    if (cut === 4) return faceCam(w.camera, st, w, t, 'deepseek', { d: 0.8, dz: 0.22, fov: 30 });
    if (cut === 5) return screenCam(w.camera, st, 'deepseek', 0.35, 0.4, 0.4, 44);
    if (cut === 6) return camLook(w.camera, [0.03, 0.8, 0.06], [0, 0.03, 0], 30);
    return faceCam(w.camera, st, w, t, 'openai', { d: 0.8, dz: -0.22, fov: 30 });
  },
  '3-02': (t, st, w) => { const u = uRow(t, '3-02'); camLook(w.camera, [0.1 - 0.04 * u, 0.22, 0.55], [0.4, 0.14, -0.62], 46); st.look.dof = { focus: 1.0, k: 0.2, max: 4 }; st.look.exposure = 1.35; },
  // 大肥鱼 jabs; the small card crosses the table flat (we ride along and read it); it hits the house (seen from the foot)
  '3-03': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    if (cut === 1) return screenCam(w.camera, st, 'glm', 0.35, 0.32, 0.42, 46, 0.1);
    if (cut === 2) { const c = smashPos(t); camLook(w.camera, [c[0] - 0.12, c[1] + 0.2, c[2] + 0.24], [c[0] + 0.02, c[1], c[2] - 0.02], 40); st.look.exposure = 1.45; st.look.dof = { focus: 0.32, k: 0.25, max: 6 }; st.look.near = 0.005; return; }
    camLook(w.camera, [0.02 + shake(t, S.SMASH.hit, 0.01), 0.22 + shake(t, S.SMASH.hit, 0.008, 60), 0.6], [0.36, 0.14, -0.62], 50); st.look.exposure = 1.4;
  },
  '3-04': (t, st, w) => boardCam(w.camera, st, t, '3-04'),
  '3-05': (t, st, w) => { camLook(w.camera, [-0.55, 0.62, 0.95], [1.5, 0.62, -0.4], 46); st.look.exposure = 1.4; },
  '3-06': (t, st, w) => { const g = S.plays().find((p) => p.style === 'giant'); camLook(w.camera, [-0.75 + shake(t, g.t, 0.02), 0.6 + shake(t, g.t, 0.02, 50), 1.35], [0.65, 0.55, -0.1], 56); },
  '3-07': (t, st, w) => boardCam(w.camera, st, t, '3-07'),
  // ---------------------------------------------------------------- @4 提示
  '4-01': (t, st, w) => screenCam(w.camera, st, 'deepseek', 0.4, 0.38, 0.34, 48, 0.04),
  '4-02': (t, st, w) => { const u = uRow(t, '4-02'); screenCam(w.camera, st, 'deepseek', lerp(0.7, 0.45, smooth((u - 0.4) * 2)), lerp(0.25, 0.32, u), 0.36, 44, -0.1); },
  '4-03': (t, st, w) => boardCam(w.camera, st, t, '4-03'),
  '4-04': (t, st, w) => faceCam(w.camera, st, w, t, 'openai', { d: 1.0, dz: -0.38, dy: -0.06, ly: -0.15, fov: 36 }),
  '4-05': (t, st, w) => wide(w.camera, st, 0.4 + 0.1 * uRow(t, '4-05')),
  // ---------------------------------------------------------------- @5 托管
  '5-01': (t, st, w, shot) => (+shot.id.split('.')[1] === 1 ? boardCam(w.camera, st, t, '5-01', { fov: 44 }) : screenCam(w.camera, st, 'openai', 0.7, 0.48, 0.38, 44)),
  '5-02': (t, st, w) => { camLook(w.camera, [-0.4, 0.5, 0.9], [1.4, 0.55, 0.0], 46); st.look.exposure = 1.4; },
  '5-03': (t, st, w) => faceCam(w.camera, st, w, t, 'deepseek', { d: 1.0, dz: 0.4, dy: -0.06, ly: -0.15, fov: 36 }),
  // one hand after another slaps 托管 (one cut each)
  '5-04': (t, st, w, shot) => { const id = S.FOLLOW[+shot.id.split('.')[1] - 1]; screenCam(w.camera, st, id, 0.7, 0.46, 0.44, 46, -0.12); },
  // Meta: his hand hangs over 托管, and comes back; he plays a card himself
  '5-05': (t, st, w) => screenCam(w.camera, st, 'meta', 0.62, 0.45, 0.55, 50, 0.12),
  '5-06': (t, st, w, shot) => (+shot.id.split('.')[1] === 1 ? boardCam(w.camera, st, t, '5-06', { fov: 44 }) : screenCam(w.camera, st, 'meta', 0.45, 0.42, 0.46, 48, -0.14)),
  // from across the table: he goes back into the dark with his chair, reaching for it
  // from the side, along the table's edge: he goes back, away from the table, with his chair, into the dark
  '5-07': (t, st, w) => { const u = uRow(t, '5-07'); camLook(w.camera, [2.5, 1.15, 4.75], [lerp(2.0, 2.9, smooth(u)), 0.3, 2.45], 46); st.look.exposure = 1.8; },
  '5-08': (t, st, w, shot) => { const cut = +shot.id.split('.')[1], z = cut === 1 ? 1.25 : 2.5, u = clamp((t - (cut === 1 ? at('5-08') : at('5-08', 1.8))) / 1.8); camLook(w.camera, [-0.75, 1.95, z + 0.95], [lerp(-1.9, -3.0, smooth(u)), 0.05, z], 50); st.look.exposure = 1.8; },
  '5-09': (t, st, w) => { const u = uRow(t, '5-09'); camLook(w.camera, [0.0, 1.35 - 0.05 * u, 5.0 - 0.25 * u], [0, 0.35, 0.8], 50); st.look.exposure = 1.95; st.look.lampPow = 1.2; },
  '5-10': (t, st, w) => wide(w.camera, st, 0.35 + 0.15 * uRow(t, '5-10')),
  '5-11': (t, st, w) => { const u = uRow(t, '5-11'); camLook(w.camera, [0.0, 0.85 + 0.1 * u, 1.9 - 0.2 * u], [0, 0.25, 0], 44); st.look.exposure = 1.4; },
  // ---------------------------------------------------------------- @6 底牌
  '6-01': (t, st, w) => screenCam(w.camera, st, 'deepseek', 0.4, 0.6, 0.44, 44),
  '6-02': (t, st, w) => boardCam(w.camera, st, t, '6-02'),
  '6-03': (t, st, w) => faceCam(w.camera, st, w, t, 'deepseek', { d: 0.55, dz: 0.12, dy: -0.22, ly: -0.02, fov: 32 }),
  '6-04': (t, st, w) => screenCam(w.camera, st, 'deepseek', 0.76, 0.66, 0.3, 46, -0.06),
  '6-05': (t, st, w) => screenCam(w.camera, st, 'deepseek', 0.5, 0.48, 0.36, 50, 0.05),
  '6-06': (t, st, w) => screenCam(w.camera, st, 'openai', 0.6, 0.55, 0.5, 46, 0.0),
  // the two of them, up, pointing, shouting across the pile; their teams behind them doing the same
  '6-07': (t, st, w) => { const u = uRow(t, '6-07'); camLook(w.camera, [shake(t, S.ACCUSE + 0.2, 0.01, 30, 4), 1.0, 2.9 - 0.3 * u], [0, 0.78, 0], 52); st.look.exposure = 1.45; },
  '6-08': (t, st, w, shot) => { const cut = +shot.id.split('.')[1]; screenCam(w.camera, st, cut === 1 ? 'deepseek' : 'openai', 0.5, 0.5, 0.46, 46, cut === 1 ? 0.06 : -0.06); },
  '6-09': (t, st, w) => { camPath(w.camera, t, [[at('6-09'), [0, 0.9, 3.4], [0, 0.6, 0], 50], [at('7-01', 1.2), [0, 2.7, 4.9], [0, 0.8, 0], 48]]); st.look.exposure = 1.6; },
  // ---------------------------------------------------------------- @7 眼睛
  '7-01': (t, st, w) => { camLook(w.camera, [0, 2.7, 4.9], [0, 0.8, 0], 48); st.look.exposure = 1.6; },
  '7-02': (t, st, w) => { const u = uRow(t, '7-02'); camLook(w.camera, [0.2, 0.32, 1.25], lerp3([0, 0.9, -0.1], [0, 4.0, -0.1], smooth(u)), 64); st.look.exposure = 1.85; },
  '7-03': (t, st, w) => { const u = uRow(t, '7-03'); camLook(w.camera, [1.1, 0.5, 2.2], [0.2, S.EYE.c[1], -0.6 - 0.3 * u], 78); st.look.far = 300; st.look.exposure = 1.8; },
  // from the cloth, where the ant was (1-03): the king looking up
  '7-04': (t, st, w) => {
    // at the ant's height, near where it died, looking up past the screen's side at the king
    const h = headOf(S.ANT_KING, w, st, t), u = uRow(t, '7-04'), pos = [0.32, 0.011 + 0.004 * u, 0.64];
    macro(w.camera, st, pos, [h[0] - 0.1, h[1] + 0.02, h[2] + 0.06], 48, dist(pos, h), 0.18);
    st.look.exposure = 1.45;
  },
  '7-05': (t, st, w) => { const u = uRow(t, '7-05'); camLook(w.camera, [4.6, 7.2 - 0.3 * u, 4.1], [0, -0.1, 0.15], 21); st.look.far = 300; st.look.exposure = 1.6; },
  // ---------------------------------------------------------------- @8 结尾
  '8-01': (t, st, w, shot) => { const id = +shot.id.split('.')[1] === 1 ? 'openai' : 'deepseek'; screenCam(w.camera, st, id, 0.4, 0.5, 0.5, 46, 0.0); st.look.exposure = 1.5; },
  '8-02': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.75], [0, 0.55, -0.1], 52); st.look.exposure = 1.3; },
  '8-03': (t, st, w) => screenCam(w.camera, st, 'deepseek', 0.38, 0.5, 0.4, 44),
  // low, looking up past their heads: the last card coming down out of the eye
  '8-04': (t, st, w) => { const u = uRow(t, '8-04'); camLook(w.camera, [0.42, 0.32, 1.75 - 0.15 * u], [-0.12, lerp(3.4, 2.4, u), -0.4], 70); st.look.far = 300; st.look.exposure = 1.85; },
  // his grin, close; the edge of the shadow slides over it
  '8-05': (t, st, w) => { faceCam(w.camera, st, w, t, 'deepseek', { d: 0.5, dz: 0.1, dy: -0.22, ly: -0.02, fov: 32 }); st.look.exposure = 1.45; },
  '8-06': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '9-01': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '9-02': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '9-03': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
};
void clamp; void BTN; void HOUSE_C; void screenFrame; void screenPoint; void macro;
