// 《喂》 v5 — the cameras, shot by shot (docs/script/shots.txt).
// Three framings come back: 1-04 (from above: a small black dot) in 5-03 and 8-04; 1-05 (low, from the side: the
// shadow, the slap) in 6-02; 1-06 (something rolls out from under the card) in 6-03.
import { KING, SIDE_SIGN, FLOOR_Y } from '../layout.js';
import { clamp, smooth, lerp, lerp3, ease } from '../util.js';
import { at, uRow, camLook, camPath, M1 } from './core.js';
import * as S from './story.js';
import { ringAt } from './reel.js';

const { RED, BLK } = S;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function macro(cam, st, pos, look, fov = 40, focus = 0.08, k = 0.5) { camLook(cam, pos, look, fov); st.look.near = 0.0025; st.look.dof = { focus, k, max: 34 }; }
let _posed = null;
const headOf = (id, w, st, t) => {
  if (w?.kings?.update && st && _posed !== st) { w.kings.update(st.kings, t); _posed = st; }
  if (w?.kings?.headWorld) { const v = w.kings.headWorld(id, new (w.camera.position.constructor)()); return [v.x, v.y, v.z]; }
  return [SIDE_SIGN[KING[id].side] * 1.5, 0.72, 0];
};
// a face: from the table side, a little below the eyes (the crown must not hide them)
function faceCam(cam, st, w, t, id, o = {}) {
  const h = headOf(id, w, st, t), sx = SIDE_SIGN[KING[id].side];
  const d = o.d ?? 0.8, dz = o.dz ?? 0.18, dy = o.dy ?? -0.14;
  camLook(cam, [h[0] - sx * d, h[1] + dy, h[2] + dz], [h[0], h[1] - 0.03 + (o.ly ?? 0), h[2] + (o.lz ?? 0)], o.fov ?? 30);
  st.look.dof = { focus: Math.hypot(d, dz, dy), k: 0.35, max: 8 };
  st.look.exposure = 1.4;
}
const shake = (t, t0, amp, f = 70, decay = 10) => (t > t0 ? Math.exp(-(t - t0) * decay) * amp * Math.sin((t - t0) * f) : 0);
const antP = (t) => { const a = S.antAt(t); return a.pos ?? [S.ANT_CRUSH[0], 0, S.ANT_CRUSH[1]]; };
const AC = [S.ANT_CRUSH[0], 0.002, S.ANT_CRUSH[1]];
const K = S.ANT_KING;
// the table from its foot: both kings, the pile between them, the two empty chairs beyond
function tableCam(cam, st, y = 1.1, z = 2.4, fov = 50, ly = 0.3) { camLook(cam, [0, y, z], [0, ly, -0.4], fov); st.look.exposure = 1.45; }
// one king across the pile
function acrossCam(cam, st, id, o = {}) {
  const sx = SIDE_SIGN[KING[id].side];
  camLook(cam, [-sx * (o.x ?? 0.7), o.y ?? 0.62, o.z ?? 0.95], [sx * (o.lx ?? 1.0), o.ly ?? 0.42, o.lz ?? -0.05], o.fov ?? 44); st.look.exposure = 1.4;
}
// from the height of a machine, straight down on the lamp-lit island (the 1-04 framing)
function fromAbove(cam, st, look, fov = 13) { camLook(cam, [look[0], 30, look[2] + 0.6], look, fov); st.look.far = 400; st.look.exposure = 1.7; }

// the crown at the empty place (the 2-03 framing): a hand takes it; then the funnel it goes into
function deadCrownCam(cam, st, id, cut) {
  const sx = SIDE_SIGN[KING[id].side];
  st.look.exposure = 1.6;
  if (cut === 1) return camLook(cam, [sx * 0.2, 0.5, -0.6], [sx * 1.45, 0.2, -1.2], 42);
  camLook(cam, [sx * 0.0, 1.35, 1.25], [sx * 0.82, 0.95, 0], 50);
}

export const SHOTS = {
  // ---------------------------------------------------------------- @1 蚂蚁
  '1-01': (t, st, w) => { macro(w.camera, st, [-0.04, 0.01, 0.4], [-0.08, 0.004, 0.32], 30, 0.1); st.look.fade = 1; },
  '1-02': (t, st, w) => {
    const a = antP(t), pos = [a[0] - 0.012, 0.0095, a[2] + 0.07];
    macro(w.camera, st, pos, [a[0] - 0.006, a[1] + 0.004, a[2]], 30, dist(pos, a), 3.0);
    st.look.fade = 1 - ease(t, at('1-02'), at('1-02', 0.8)); st.look.exposure = 1.25;
  },
  '1-03': (t, st, w) => {
    const u = uRow(t, '1-03'), a = antP(t), d = S.antAt(t).dir ?? [-0.8, -0.6];
    const pos = [a[0] - d[0] * 0.036 - 0.004, 0.0075, a[2] - d[1] * 0.036 + 0.012];
    const h = headOf(K, w, st, t);
    macro(w.camera, st, pos, lerp3([a[0] - 0.12, 0.03, a[2] - 0.02], [h[0], h[1] - 0.05, h[2]], smooth(u * 1.4)), 62, dist(pos, a), 1.0);
    st.look.exposure = 1.3;
  },
  '1-04': (t, st, w) => {
    const h = headOf(K, w, st, t), a = antP(t);
    camLook(w.camera, [h[0] + 0.3, h[1] + 0.12, h[2] + 0.16], [a[0], 0, a[2]], 20);
    st.look.dof = { focus: dist(h, a), k: 0.3, max: 6 };
  },
  '1-05': (t, st, w) => {
    const pos = [AC[0] + 0.05, 0.012 + shake(t, S.CRUSH, 0.002), AC[2] + 0.09];
    macro(w.camera, st, pos, [AC[0] - 0.01, 0.006, AC[2]], 46, dist(pos, AC), 1.6);
    if (t > S.CRUSH && t < S.CRUSH + 0.08) st.look.flash = 0.18 * (1 - (t - S.CRUSH) / 0.08);
  },
  '1-06': (t, st, w) => { const pos = [AC[0] - 0.1, 0.011, AC[2] + 0.16]; macro(w.camera, st, pos, [AC[0] - 0.05, 0.004, AC[2] + 0.06], 42, 0.1, 1.4); },
  '1-07': (t, st, w) => {
    const u = uRow(t, '1-07');
    camPath(w.camera, t, [[at('1-07'), [AC[0] - 0.1, 0.02, AC[2] + 0.2], [AC[0] + 0.2, 0.03, AC[2] - 0.3], 44], [at('1-07', 1.3), [-0.06, 0.6, 3.0], [0, 0.4, -0.6], 44], [at('1-07', 3.2), [0, 1.9, 6.4], [0, 0.7, -1.2], 40]]);
    st.look.near = lerp(0.004, 0.03, smooth(u * 2));
    if (u < 0.4) st.look.dof = { focus: lerp(0.2, 3, u / 0.4), k: 0.6 * (1 - u / 0.4), max: 16 };
    st.look.exposure = lerp(1.3, 1.9, smooth(u));
  },
  // ---------------------------------------------------------------- @2 要输了
  '2-01': (t, st, w) => acrossCam(w.camera, st, BLK, { x: 0.8, y: 0.85, z: 1.05, lx: 0.75, ly: 0.28, fov: 46 }),
  '2-02': (t, st, w, shot) => {
    if (+shot.id.split('.')[1] === 1) { camLook(w.camera, [-1.62, 0.98, -0.72], [-1.02, 0.42, -0.1], 36); st.look.exposure = 1.4; st.look.dof = { focus: 0.9, k: 0.3, max: 8 }; return; }
    faceCam(w.camera, st, w, t, RED, { d: 0.7, dz: 0.24, fov: 30 });
  },
  '2-03': (t, st, w) => { const u = uRow(t, '2-03'); camLook(w.camera, [-0.1 - 0.04 * u, 0.6, -0.1], [-1.5, 0.3, -1.15], 44); st.look.exposure = 1.7; },
  '2-04': (t, st, w) => acrossCam(w.camera, st, RED, { x: 0.5, y: 0.6, z: 1.0, lx: 1.05, ly: 0.3, lz: 0, fov: 46 }),
  '2-05': (t, st, w) => { const u = uRow(t, '2-05'); camLook(w.camera, [-0.12, 0.26 + 0.02 * u, 0.86], [-0.3, 0.07, -0.02], 48); st.look.exposure = 1.4; st.look.near = 0.01; },
  '2-06': (t, st, w) => faceCam(w.camera, st, w, t, BLK, { d: 0.7, dz: -0.2, fov: 30 }),
  // ---------------------------------------------------------------- @3 更大的
  '3-01': (t, st, w) => { acrossCam(w.camera, st, BLK, { x: 0.55, y: 0.62 + shake(t, S.PLACE.spade.down, 0.012, 50, 7), z: 1.0, lx: 1.0, ly: 0.34, lz: 0, fov: 46 }); },
  '3-02': (t, st, w) => tableCam(w.camera, st, 1.15, 3.0, 50, 0.35),
  '3-03': (t, st, w) => { const u = uRow(t, '3-03'); camLook(w.camera, [-0.42 - 0.03 * u, 0.24, 0.62], [-0.72, 0.17, 0], 34); st.look.exposure = 1.4; st.look.near = 0.01; st.look.dof = { focus: 0.7, k: 0.4, max: 10 }; },
  '3-04': (t, st, w) => { camLook(w.camera, [-0.36, 0.46, 0.72], [-0.8, 0.24, 0.1], 42); st.look.exposure = 1.4; st.look.near = 0.01; },
  // ---------------------------------------------------------------- @4 喂
  '4-01': (t, st, w) => { camLook(w.camera, [-0.3, 0.62, -1.0], [0.86, 0.3, -0.12], 46); st.look.exposure = 1.4; },
  '4-02': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    st.look.exposure = 1.4;
    if (cut === 1) return camLook(w.camera, [-0.3, 0.62, 0.95], [-0.82, 0.36, 0.1], 46);
    if (cut === 2) return camLook(w.camera, [0.28, 0.66, -0.98], [0.82, 0.42, -0.1], 46);
    if (cut === 3) return camLook(w.camera, [0.03, 1.75 + shake(t, at('4-02', 2.3), 0.01), 0.14], [0, 0, 0], 50);
    if (cut === 4) return camLook(w.camera, [0.1, 0.8, -1.3], [0.8, 0.55, -0.05], 50);
    return camLook(w.camera, [-0.05, 0.85, 1.55], [-0.78, 0.55, 0.05], 50);
  },
  '4-03': (t, st, w) => { const u = uRow(t, '4-03'); camLook(w.camera, [0, 1.7, 4.4 - 0.2 * u], [0, 0.55, 0], 46); st.look.exposure = 1.7; st.look.lampPow = 1.15; },
  '4-04': (t, st, w, shot) => deadCrownCam(w.camera, st, BLK, +shot.id.split('.')[1]),
  '4-05': (t, st, w, shot) => deadCrownCam(w.camera, st, RED, +shot.id.split('.')[1]),
  '4-06': (t, st, w) => {
    const sh = S.plays().filter((p) => p.cs >= 5 && !p.far && t > p.t && t < p.t + 1).reduce((s, p) => s + shake(t, p.t, 0.03, 44, 6), 0);
    camLook(w.camera, [0, 2.0 + sh, 4.5], [0, 0.55, 0], 60); st.look.exposure = 1.6;
  },
  '4-07': (t, st, w) => { const u = uRow(t, '4-07'); faceCam(w.camera, st, w, t, RED, { d: 0.92 - 0.1 * u, dz: 0.3, dy: -0.1, ly: 0.07, fov: 34 }); },
  '4-08': (t, st, w) => { camLook(w.camera, [0.15, 0.62, 1.15], [2.2, 1.0, 0], 54); st.look.exposure = 1.5; },
  '4-09': (t, st, w) => { const u = uRow(t, '4-09'); camLook(w.camera, [-0.15, 0.62, lerp(0.95, 1.2, smooth(u * 1.6 - 0.5))], lerp3([-1.6, 0.8, 0], [-2.2, 1.05, 0], smooth(u * 1.6 - 0.5)), lerp(40, 54, smooth(u * 1.6 - 0.5))); st.look.exposure = 1.5; },
  // ---------------------------------------------------------------- @5 山
  '5-01': (t, st, w) => {
    camPath(w.camera, t, [[at('5-01'), [0, 1.0, 5.2], [0, 1.5, 0], 58], [at('5-01', 2.0), [0, 3.2, 17], [0, 4.5, 0], 56], [at('5-01', 4.6), [0, 2.4, 45], [0, 12.5, 0], 62]]);
    w.camera.position.y += shake(t, S.HALL_GONE, 0.12, 30, 2.5);
    st.look.far = 500; st.look.exposure = 1.6;
  },
  '5-02': (t, st, w) => { const u = uRow(t, '5-02'); camLook(w.camera, [0.1, 0.42, 1.5], [0, 8 + u, -3], 76); st.look.far = 500; st.look.exposure = 1.5; },
  '5-03': (t, st, w) => fromAbove(w.camera, st, [0, 0.3, 0], 17),
  '5-04': (t, st, w) => { const u = uRow(t, '5-04'); camLook(w.camera, [-0.9, 0.55, 2.3 - 0.1 * u], lerp3([4.5, 6.0, 0], [1.9, 0.9, 0], smooth((u - 0.5) * 2.6)), lerp(66, 40, smooth((u - 0.5) * 2.6))); st.look.far = 500; st.look.exposure = 1.5; },
  '5-05': (t, st, w) => { camLook(w.camera, [0.35, 0.5, 1.4], [-1.55, 0.98, 0], 48); st.look.exposure = 1.5; st.look.far = 500; },
  // ---------------------------------------------------------------- @6 没看见
  '6-01': (t, st, w) => { const m = S.machineAt(RED, t); camLook(w.camera, [-1.5, 0.5, 9.0], [m.pos[0] + 7, m.S * 0.45, 0], 60); st.look.far = 500; st.look.exposure = 1.6; },
  '6-02': (t, st, w) => {
    const y = S.finalPlay().edgeY;
    camLook(w.camera, [0.55, y + 0.22 + shake(t, S.SLAM, 0.03, 40, 5), 1.25], [-1.5, 0.92, 0], 46); st.look.exposure = 1.5; st.look.far = 500;
  },
  '6-03': (t, st, w) => {
    const r = ringAt(S.RING.roll1 + 2).pos, u = uRow(t, '6-03');
    const pos = [r[0] + 0.3, r[1] + 0.09, r[2] + 0.42 - 0.03 * u];
    camLook(w.camera, pos, [r[0] - 0.08, r[1] + 0.01, r[2] - 0.02], 34); st.look.near = 0.01; st.look.dof = { focus: dist(pos, r), k: 0.6, max: 16 }; st.look.exposure = 1.5; st.look.far = 500;
  },
  '6-04': (t, st, w) => { const u = uRow(t, '6-04'); faceCam(w.camera, st, w, t, BLK, { d: 0.95 - 0.12 * u, dz: 0.3, dy: -0.12, fov: 32 }); st.look.far = 500; },
  '6-05': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  // ---------------------------------------------------------------- @7 片名
  '7-01': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  '7-02': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
  // ---------------------------------------------------------------- @8 彩蛋
  '8-01': (t, st, w) => { camLook(w.camera, [3.4, FLOOR_Y + 0.01, 2.4], [3.4, FLOOR_Y, 2.3], 30); st.look.fade = 1; },
  '8-02': (t, st, w) => {
    const a = S.eggAnt(t).pos, pos = [a[0] - 0.02, a[1] + 0.0095, a[2] + 0.075];
    macro(w.camera, st, pos, [a[0] - 0.008, a[1] + 0.004, a[2]], 30, dist(pos, a), 3.0); st.look.exposure = 1.7; st.look.far = 500;
  },
  '8-03': (t, st, w, shot) => {
    if (+shot.id.split('.')[1] === 2) { const b = S.eggAnt(t).pos, p2 = [b[0] - 0.035, b[1] + 0.006, b[2] + 0.062]; macro(w.camera, st, p2, [b[0], b[1] + 0.012, b[2]], 44, dist(p2, b), 2.0); st.look.exposure = 1.9; st.look.far = 500; return; }
    const a = S.eggAnt(S.EGG.foot.hover).pos, pos = [a[0] + 0.03, a[1] + 0.03, a[2] + 0.34];
    macro(w.camera, st, pos, [a[0] + 0.01, a[1] + 0.05, a[2] - 0.05], 38, 0.35, 0.8); st.look.exposure = 1.7; st.look.far = 500;
  },
  '8-04': (t, st, w) => { const p = S.eggWalker(at('8-04', 1.6)); fromAbove(w.camera, st, [p[0], FLOOR_Y, p[2]], 11); },
  '8-05': (t, st, w) => { camLook(w.camera, [0, 0.74, 1.2], [0, 0.64, 0], 74); st.look.fade = 1; },
};
void clamp;
