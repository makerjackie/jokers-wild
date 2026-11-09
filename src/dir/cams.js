// 《失控》 v4 (四王) — the cameras, shot by shot (docs/script/shots.txt).
import { KING, SIDE_SIGN, SEAT } from '../layout.js';
import { clamp, smooth, lerp, lerp3, ease } from '../util.js';
import { at, uRow, camLook, camPath, M1 } from './core.js';
import * as S from './story.js';
import { screenFrame, screenPoint, BTN } from '../screens.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function macro(cam, st, pos, look, fov = 40, focus = 0.08, k = 0.5) { camLook(cam, pos, look, fov); st.look.near = 0.0025; st.look.dof = { focus, k, max: 34 }; }
function wide(cam, st, push = 0) { M1(cam, Math.min(1, push + 0.25)); st.look.exposure = 1.9; st.look.lampPow = 1.15; }
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
  const f = screenFrame(id), p = screenPoint(id, u, v, 0);
  // from beside his head, not through it: pushed sideways along the screen and kept low
  const sd = side + Math.sign(side || 1) * 0.13, dd = d * 0.85;
  const pos = [p[0] + f.n[0] * dd + f.right[0] * sd, p[1] + f.n[1] * dd - 0.01, p[2] + f.n[2] * dd + f.right[2] * sd];
  camLook(cam, pos, p, fov);
  st.look.dof = { focus: d, k: 0.5, max: 10 };
  st.look.exposure = 1.25;
}
function twoShot(cam, st, y = 0.95, z = 2.65, fov = 44) { camLook(cam, [0, y, z], [0, 0.44, 0], fov); st.look.exposure = 1.4; }
const shake = (t, t0, amp, f = 70, decay = 10) => (t > t0 ? Math.exp(-(t - t0) * decay) * amp * Math.sin((t - t0) * f) : 0);
const antP = (t) => { const a = S.antAt(t); return a.pos ?? [S.ANT_CRUSH[0], 0, S.ANT_CRUSH[1]]; };
const AC = [S.ANT_CRUSH[0], 0.002, S.ANT_CRUSH[1]];

// the #1 board, high at the head of the table: a slow push in on its bottom rows
function boardCam(cam, st, t, row, o = {}) {
  const u = uRow(t, row);
  camLook(cam, [o.x ?? 0.06, 4.6, lerp(-1.75, -2.0, smooth(u))], [0, 4.6, -4.9], o.fov ?? 40);
  st.look.exposure = 1.5; st.look.far = 60;
}

const K = S.ANT_KING;
// the long table from its foot, low: the four kings, the pile, the empty places
function tableCam(cam, st, y = 1.1, z = 2.4, fov = 50) { camLook(cam, [0, y, z], [0, 0.45, -0.6], fov); st.look.exposure = 1.45; }
// a king seen across the table, medium
function acrossCam(cam, st, id, fov = 40) {
  const sx = SIDE_SIGN[KING[id].side], z = SEAT.Z[KING[id].seat];
  camLook(cam, [-sx * 0.3, 0.75, z + 0.65], [sx * 1.62, 0.58, z], fov); st.look.exposure = 1.4;
}
const EGGC = [S.EGG.to[0], 0.01, S.EGG.to[1]];

export const SHOTS = {
  // ---------------------------------------------------------------- @1 蚂蚁
  '1-01': (t, st, w) => { macro(w.camera, st, [0.04, 0.01, 0.4], [0.08, 0.004, 0.32], 30, 0.1); st.look.fade = 1; },
  '1-02': (t, st, w) => {
    const a = antP(t);
    const pos = [a[0] + 0.012, 0.0095, a[2] + 0.07];
    macro(w.camera, st, pos, [a[0] + 0.006, a[1] + 0.004, a[2]], 30, dist(pos, a), 3.0);
    st.look.fade = 1 - ease(t, at('1-02'), at('1-02', 0.8)); st.look.exposure = 1.25;
  },
  '1-03': (t, st, w) => {
    const u = uRow(t, '1-03'), a = antP(t), d = S.antAt(t).dir ?? [0.8, -0.6];
    const pos = [a[0] - d[0] * 0.036 + 0.004, 0.0075, a[2] - d[1] * 0.036 + 0.012];
    const h = headOf(K, w, st, t);
    macro(w.camera, st, pos, lerp3([a[0] + 0.12, 0.03, a[2] - 0.02], [h[0], h[1] - 0.05, h[2]], smooth(u * 1.4)), 62, dist(pos, a), 1.0);
    st.look.exposure = 1.3;
  },
  '1-04': (t, st, w) => {
    const h = headOf(K, w, st, t), a = antP(t);
    camLook(w.camera, [h[0] - 0.08, h[1] - 0.02, h[2] + 0.04], [a[0], 0, a[2]], 22);
    st.look.dof = { focus: dist(h, a), k: 0.3, max: 6 };
  },
  '1-05': (t, st, w) => {
    const pos = [AC[0] - 0.05, 0.012 + shake(t, S.CRUSH, 0.002), AC[2] + 0.09];
    macro(w.camera, st, pos, [AC[0] + 0.01, 0.006, AC[2]], 46, dist(pos, AC), 1.6);
    if (t > S.CRUSH && t < S.CRUSH + 0.08) st.look.flash = 0.18 * (1 - (t - S.CRUSH) / 0.08);
  },
  '1-06': (t, st, w) => {
    const pos = [AC[0] + 0.1, 0.011, AC[2] + 0.16];
    macro(w.camera, st, pos, [AC[0] + 0.05, 0.004, AC[2] + 0.06], 42, 0.1, 1.4);
  },
  '1-07': (t, st, w) => {
    const u = uRow(t, '1-07');
    camPath(w.camera, t, [[at('1-07'), [AC[0] + 0.1, 0.02, AC[2] + 0.2], [AC[0] - 0.2, 0.03, AC[2] - 0.3], 44], [at('1-07', 1.3), [0.06, 0.6, 3.2], [0.02, 0.45, -0.8], 42], [at('1-07', 3.2), [0, 2.2, 8.5], [0, 1.4, -3.2], 40]]);
    st.look.near = lerp(0.004, 0.03, smooth(u * 2));
    if (u < 0.4) st.look.dof = { focus: lerp(0.2, 3, u / 0.4), k: 0.6 * (1 - u / 0.4), max: 16 };
    st.look.exposure = lerp(1.3, 1.9, smooth(u));
  },
  // ---------------------------------------------------------------- @2 横空出世
  '2-01': (t, st, w) => boardCam(w.camera, st, t, '2-01'),
  '2-02': (t, st, w) => tableCam(w.camera, st, 1.1 - 0.05 * uRow(t, '2-02'), 2.4),
  '2-03': (t, st, w) => faceCam(w.camera, st, w, t, 'heart', { d: 0.75, dz: 0.3, dy: -0.24, ly: -0.04, fov: 32 }),
  '2-04': (t, st, w) => { camLook(w.camera, [shake(t, S.CHAT_T, 0.02), 1.45 + shake(t, S.CHAT_T, 0.03, 55), 0.05], [0, 0, 0.02], 46); },
  '2-05': (t, st, w) => { const u = uRow(t, '2-05'); camLook(w.camera, [0.04, 0.07, 0.5 + 0.1 * u], [0, 0.04, -1.6], 58); st.look.exposure = 1.35; st.look.near = 0.01; },
  '2-06': (t, st, w) => boardCam(w.camera, st, t, '2-06'),
  '2-07': (t, st, w) => tableCam(w.camera, st, 1.2 - 0.1 * uRow(t, '2-07'), 2.7, 48),
  '2-08': (t, st, w) => faceCam(w.camera, st, w, t, 'spade', { d: 0.7, dz: -0.2, dy: -0.16, fov: 32 }),
  // ---------------------------------------------------------------- @3 出局
  '3-01': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    if (cut === 1) return screenCam(w.camera, st, 'spade', 0.35, 0.4, 0.38, 44);
    if (cut === 2 || cut === 5) return camLook(w.camera, [0.03, 0.8, 0.06], [0, 0.03, 0], 30);
    if (cut === 3 || cut === 6) return boardCam(w.camera, st, t, '3-01', { fov: 40 });
    if (cut === 4) return faceCam(w.camera, st, w, t, 'heart', { d: 0.7, dz: 0.2, dy: -0.16, fov: 32 });
    return faceCam(w.camera, st, w, t, 'spade', { d: 0.7, dz: -0.2, dy: -0.16, fov: 32 });
  },
  '3-02': (t, st, w) => screenCam(w.camera, st, 'club', 0.4, 0.38, 0.34, 48, 0.04),
  '3-03': (t, st, w) => faceCam(w.camera, st, w, t, 'club', { d: 0.62, dz: -0.15, dy: -0.18, fov: 32 }),
  '3-04': (t, st, w) => acrossCam(w.camera, st, 'club', 42),
  '3-05': (t, st, w) => { const u = uRow(t, '3-05'); camLook(w.camera, [0.55, 0.95, -2.9 + 0.15 * u], [0.1, 0.5, -0.5], 50); st.look.exposure = 1.45; },
  // ---------------------------------------------------------------- @4 提示
  '4-01': (t, st, w) => boardCam(w.camera, st, t, '4-01'),
  '4-02': (t, st, w) => screenCam(w.camera, st, 'spade', 0.42, 0.38, 0.36, 48, -0.04),
  '4-03': (t, st, w) => { const u = uRow(t, '4-03'); screenCam(w.camera, st, 'spade', lerp(0.78, 0.62, smooth((u - 0.4) * 2)), lerp(0.25, 0.3, u), 0.32, 46, -0.04); },
  '4-04': (t, st, w) => boardCam(w.camera, st, t, '4-04'),
  '4-05': (t, st, w) => faceCam(w.camera, st, w, t, 'heart', { d: 0.85, dz: 0.38, dy: -0.12, ly: -0.08, fov: 36 }),
  '4-06': (t, st, w) => { const z = SEAT.Z[KING.diamond.seat]; camLook(w.camera, [-0.55, 0.5, z + 0.55], [-1.15, 0.38, z], 46); st.look.exposure = 1.4; },
  '4-07': (t, st, w) => acrossCam(w.camera, st, 'diamond', 42),
  // ---------------------------------------------------------------- @5 托管
  '5-01': (t, st, w) => wide(w.camera, st, 0.4 + 0.15 * uRow(t, '5-01')),
  '5-02': (t, st, w) => screenCam(w.camera, st, 'spade', 0.7, 0.48, 0.38, 44),
  '5-03': (t, st, w) => { camLook(w.camera, [-0.4, 0.5, 0.9], [1.4, 0.55, 0.0], 46); st.look.exposure = 1.4; },
  '5-04': (t, st, w) => faceCam(w.camera, st, w, t, 'heart', { d: 0.75, dz: 0.3, dy: -0.25, ly: -0.04, fov: 34 }),
  '5-05': (t, st, w) => wide(w.camera, st, 0.35 + 0.15 * uRow(t, '5-05')),
  '5-06': (t, st, w) => { const u = uRow(t, '5-06'); camLook(w.camera, [0.0, 0.85 + 0.1 * u, 1.9 - 0.2 * u], [0, 0.25, 0], 44); st.look.exposure = 1.4; },
  // ---------------------------------------------------------------- @6 A 以上
  '6-01': (t, st, w) => screenCam(w.camera, st, 'heart', 0.4, 0.5, 0.44, 46),
  '6-02': (t, st, w) => boardCam(w.camera, st, t, '6-02'),
  '6-03': (t, st, w) => faceCam(w.camera, st, w, t, 'heart', { d: 0.55, dz: 0.12, dy: -0.22, ly: -0.02, fov: 32 }),
  '6-04': (t, st, w) => screenCam(w.camera, st, 'heart', 0.76, 0.66, 0.3, 46, -0.06),
  '6-05': (t, st, w) => screenCam(w.camera, st, 'heart', 0.5, 0.48, 0.36, 50, 0.05),
  '6-06': (t, st, w) => screenCam(w.camera, st, 'spade', 0.7, 0.6, 0.38, 46),
  '6-07': (t, st, w) => { const u = uRow(t, '6-07'); camLook(w.camera, [shake(t, S.ACCUSE + 0.2, 0.01, 30, 4), 1.0, 2.6 - 0.3 * u], [0, 0.78, 0], 50); st.look.exposure = 1.45; },
  '6-08': (t, st, w, shot) => { const cut = +shot.id.split('.')[1]; screenCam(w.camera, st, cut === 1 ? 'heart' : 'spade', 0.5, 0.5, 0.46, 46, cut === 1 ? 0.06 : -0.06); },
  '6-09': (t, st, w) => { camPath(w.camera, t, [[at('6-09'), [0, 0.9, 3.4], [0, 0.6, 0], 50], [at('7-01', 1.2), [0, 2.7, 4.9], [0, 0.8, 0], 48]]); st.look.exposure = 1.5; },
  // ---------------------------------------------------------------- @7 眼睛
  '7-01': (t, st, w) => { camLook(w.camera, [0, 2.7, 4.9], [0, 0.8, 0], 48); st.look.exposure = 1.5; },
  '7-02': (t, st, w) => { const u = uRow(t, '7-02'); camLook(w.camera, [0.2, 0.32, 1.25], lerp3([0, 0.9, -0.1], [0, 4.0, -0.1], smooth(u)), 64); st.look.exposure = 1.4; },
  '7-03': (t, st, w) => { const u = uRow(t, '7-03'); camLook(w.camera, [1.1, 0.5, 2.2], [0.2, S.EYE.c[1], -0.6 - 0.3 * u], 78); st.look.far = 300; st.look.exposure = 1.3; },
  '7-04': (t, st, w) => {
    const h = headOf(K, w, st, t), u = uRow(t, '7-04'), pos = [0.5 - 0.02 * u, 0.22, 0.8];
    camLook(w.camera, pos, [h[0], h[1] + 0.05, h[2]], 40);
    st.look.near = 0.01; st.look.dof = { focus: dist(pos, h), k: 0.3, max: 6 }; st.look.exposure = 1.4;
  },
  '7-05': (t, st, w) => { const u = uRow(t, '7-05'); camLook(w.camera, [0.9, S.EYE.c[1] - 0.3 - 0.4 * u, 0.6], [0, 0, -0.1], 30); st.look.far = 300; st.look.exposure = 1.6; },
  // ---------------------------------------------------------------- @8 结尾
  '8-01': (t, st, w) => twoShot(w.camera, st, 0.9, 2.5, 46),
  '8-02': (t, st, w) => { camLook(w.camera, [0, 0.72, -1.7], [0, 0.55, 0.15], 52); st.look.exposure = 1.45; },
  '8-03': (t, st, w) => screenCam(w.camera, st, 'heart', 0.38, 0.5, 0.4, 44),
  '8-04': (t, st, w) => { const u = uRow(t, '8-04'); camLook(w.camera, [0, 0.32, 1.75 - 0.15 * u], [0, lerp(3.4, 2.4, u), -0.4], 74); st.look.far = 300; st.look.exposure = 1.45; },
  '8-05': (t, st, w) => { faceCam(w.camera, st, w, t, 'spade', { d: 0.5, dz: -0.1, dy: -0.22, ly: -0.02, fov: 32 }); st.look.exposure = 1.45; },
  '8-06': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '8-07': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '8-08': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  // ---------------------------------------------------------------- @9 彩蛋
  '9-01': (t, st, w) => { macro(w.camera, st, [0.5, 0.03, 3.0], [0.33, 0.015, 2.66], 40, 0.4, 1.0); st.look.fade = 1; },
  '9-02': (t, st, w) => { const u = uRow(t, '9-02'); macro(w.camera, st, [0.5 - 0.02 * u, 0.03, 3.0], [0.33, 0.015, 2.7 + 0.06 * u], 40, dist([0.5, 0.03, 3.0], EGGC), 1.0); st.look.exposure = 1.5; },
  '9-03': (t, st, w) => { const u = uRow(t, '9-03'); const pos = [0.43 - 0.01 * u, 0.014, 2.97]; macro(w.camera, st, pos, [0.345, 0.006, 2.85], 36, dist(pos, [0.345, 0, 2.85]), 1.4); st.look.exposure = 1.5; },
  '9-04': (t, st, w) => { macro(w.camera, st, [0.43, 0.014, 2.97], [0.345, 0.006, 2.85], 36, 0.15, 1.4); st.look.fade = 1; },
};
void clamp; void BTN; void screenFrame; void screenPoint;
