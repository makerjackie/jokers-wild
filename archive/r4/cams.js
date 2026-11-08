// 《失控》 — the cameras, shot by shot (docs/script/shots.txt). @1 is macro (the ant's height, near plane 2.5 mm, a
// shallow depth of field); the rest is the war room at the kings' scale; 6-08 and 7-08 look up into / rise through
// the AI's dark.
import { KING, SIDE_SIGN, SEAT } from '../layout.js';
import { clamp, smooth, lerp, lerp3, ease } from '../util.js';
import { at, uRow, camLook, camPath, M1 } from './core.js';
import * as S from './story.js';
import { fallCard } from './reel.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// a macro camera at the ant's height: focus at `focus` metres, blur strength k (px·m at 720p)
function macro(cam, st, pos, look, fov = 40, focus = 0.08, k = 0.5) {
  camLook(cam, pos, look, fov);
  st.look.near = 0.0025;
  st.look.dof = { focus, k, max: 34 };
}
// the motif wide, brighter than the noir default (the war room is all shadow from back here)
function wide(cam, st, push = 0) { M1(cam, Math.min(1, push + 0.25)); st.look.exposure = 1.9; st.look.lampPow = 1.15; }
// the king's head centre this frame (the kings module solves rise, lean and size): pose them first (pure)
let _posed = null;
const headOf = (id, w, st, t) => {
  if (w?.kings?.update && st && _posed !== st) { w.kings.update(st.kings, t); _posed = st; }
  if (w?.kings?.headWorld) { const v = w.kings.headWorld(id, new (w.camera.position.constructor)()); return [v.x, v.y, v.z]; }
  const k = KING[id]; return [SIDE_SIGN[k.side] * 1.5, 0.72, SEAT.Z[k.seat]];
};
// a face close-up from across the table (the other side), a little below the eyes
function faceCam(cam, st, w, t, id, o = {}) {
  const h = headOf(id, w, st, t), sx = SIDE_SIGN[KING[id].side];
  const d = o.d ?? 0.78, dz = o.dz ?? 0.18, dy = o.dy ?? -0.06;
  camLook(cam, [h[0] - sx * d, h[1] + dy, h[2] + dz], [h[0], h[1] - 0.04 + (o.ly ?? 0), h[2] + (o.lz ?? 0)], o.fov ?? 28);
  st.look.dof = { focus: Math.hypot(d, dz, dy), k: 0.35, max: 8 };
}
// the two of them across the table, from the foot, over the mountain
function twoShot(cam, st, y = 0.95, z = 2.65, fov = 44) { camLook(cam, [0, y, z], [0, 0.44, 0], fov); st.look.exposure = 1.4; }
const shake = (t, t0, amp, f = 70, decay = 10) => (t > t0 ? Math.exp(-(t - t0) * decay) * amp * Math.sin((t - t0) * f) : 0);
const antP = (t) => { const a = S.antAt(t); return a.pos ?? [0.4, 0, 0.4]; };

export const SHOTS = {
  // ---------------------------------------------------------------- @1 蚂蚁
  '1-01': (t, st, w) => { macro(w.camera, st, [0.47, 0.011, 0.452], [0.6, 0.004, 0.42], 30, 0.15); st.look.fade = 1; },
  // the ant walks in across the engraved cloth, toward the lens, in the lamp's warm pool; the pile a blur behind it
  '1-02': (t, st, w) => {
    const a = antP(t), g = smooth((t - at('1-02', 2.2)) / 1.4), f = smooth((t - at('1-02', 2.4)) / 2.2);
    const pos = [lerp(0.535, a[0] + 0.012, f), 0.0095, 0.472];
    macro(w.camera, st, pos, [lerp(0.535, a[0], g), 0.0055, 0.405], 30, dist(pos, a), 3.4);
    st.look.fade = 1 - ease(t, at('1-02'), at('1-02', 1.4));
    st.look.exposure = 1.2;
  },
  // behind and below it, looking up past it: the card a plaza, the giants far above in the blur
  '1-03': (t, st, w) => {
    const u = uRow(t, '1-03'), a = antP(t);
    const pos = [a[0] + 0.034 - 0.004 * u, 0.0072, a[2] + 0.009];
    macro(w.camera, st, pos, lerp3([a[0] - 0.1, 0.022, a[2] - 0.006], [-1.45, 0.66, -0.05], smooth(u * 1.3)), 62, dist(pos, a), 0.9);
    st.look.exposure = 1.3;
  },
  // side on, further back: the ant on its plaza (right), the card coming down beside it (left); the slap; the freeze
  '1-04': (t, st, w) => {
    const a = antP(t), hit = S.ANT_SLAP;
    const pos = [0.392, 0.026 + shake(t, hit, 0.002), 0.452];
    macro(w.camera, st, pos, [0.28, 0.004, 0.352], 50, dist(pos, a), 1.3);
    if (t > hit && t < hit + 0.08) st.look.flash = 0.16 * (1 - (t - hit) / 0.08);
  },
  // in close: it straightens its crumb and goes on
  '1-05': (t, st, w) => {
    const a = antP(t), u = uRow(t, '1-05');
    const pos = lerp3([0.395, 0.0115, 0.44], [0.385, 0.0105, 0.425], smooth(u));
    macro(w.camera, st, pos, [a[0] - 0.006, a[1] + 0.004, a[2]], 34, dist(pos, a), 2.0);
  },
  // the foot of the table: up to the end, over the lip, into the dark
  '1-06': (t, st, w) => {
    const a = antP(t), u = uRow(t, '1-06');
    const pos = [0.168, 0.009 - 0.012 * u, 3.125];
    macro(w.camera, st, pos, [0.11, Math.max(-0.03, a[1]) + 0.002, 3.185], 38, dist(pos, a), 0.8);
    st.look.exposure = 1.9;
    st.look.p3 = { pos: [0.17, 0.1, 3.08], col: [0.8, 0.6, 0.42], range: 0.45 };
  },
  // from where it vanished, up and back to the whole table
  '1-07': (t, st, w) => {
    const u = uRow(t, '1-07');
    camPath(w.camera, t, [[at('1-07'), [0.11, 0.02, 3.34], [0.05, 0.05, 1.0], 44], [at('1-07', 1.6), [0.06, 0.55, 5.2], [0.02, 0.45, -0.8], 42], [at('1-07', 4.0), [0, 2.4, 10.5], [0, 1.15, -3.2], 40]]);
    st.look.near = lerp(0.004, 0.03, smooth(u * 2));
    if (u < 0.45) st.look.dof = { focus: lerp(0.4, 3, u / 0.45), k: 0.6 * (1 - u / 0.45), max: 16 };
    st.look.exposure = lerp(1.3, 1.55, smooth(u));
  },
  // ---------------------------------------------------------------- @2 会说话的牌
  '2-01': (t, st, w) => { const u = uRow(t, '2-01'); camLook(w.camera, [0.08 + 0.05 * u, 0.82 - 0.06 * u, 1.05 - 0.08 * u], [0.04, 0.0, 0.08], 34); st.look.dof = { focus: 1.3, k: 0.25, max: 5 }; },
  '2-02': (t, st, w) => faceCam(w.camera, st, w, t, 'openai', { d: 1.0, dz: -0.42, dy: -0.06, lz: 0.12, fov: 34 }),
  // top down: SLAP
  '2-03': (t, st, w) => {
    const p = S.plays().find((x) => x.chat);
    camLook(w.camera, [0.0 + shake(t, p.t, 0.01), 1.0 + shake(t, p.t, 0.015, 55), 0.02], [0, 0, 0.0], 32);
  },
  // the face of the card: it lights up and writes
  '2-04': (t, st, w) => { const u = uRow(t, '2-04'); camLook(w.camera, [0.0, 0.64 - 0.12 * u, 0.0], [0, 0, 0], 30); },
  // the faces round the table, lit from below: a slow arc from the US row, past the head, to the CN row
  '2-05': (t, st, w) => {
    const th = Math.PI * smooth(uRow(t, '2-05'));
    camLook(w.camera, [0.0, 0.2, 0.55], [1.6 * Math.cos(th), 0.78, -0.25 - 1.7 * Math.sin(th)], 52);
    st.look.exposure = 1.35;
  },
  '2-06': (t, st, w) => faceCam(w.camera, st, w, t, 'deepseek', { d: 0.8, dz: 0.2 }),
  '2-07': (t, st, w) => faceCam(w.camera, st, w, t, 'openai', { d: 0.9, dz: -0.15, fov: 30 }),
  // ---------------------------------------------------------------- @3 比大
  '3-01': (t, st, w) => { const u = uRow(t, '3-01'); camLook(w.camera, [0.95 - 0.1 * u, 0.9, 1.75], [-1.45, 0.5, 0.35], 44); },
  '3-02': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    const us = [3, 5, 7].includes(cut);
    const u = clamp((t - shot.t0) / (shot.t1 - shot.t0));
    if (cut === 1) { faceCam(w.camera, st, w, t, 'openai', { d: 1.15, dz: 0.4, dy: -0.12, ly: -0.15, fov: 38 }); return; }
    if (us) { camLook(w.camera, [-0.42 + 0.05 * u, 0.42, 0.05], [0.42, 0.3, -0.56], 42); return; }
    const hero = ['glm', 'deepseek', 'qwen', 'kimi'][(cut - 2) / 2];
    const z = SEAT.Z[KING[hero].seat];
    camLook(w.camera, [-0.35, 0.78, z + (z > 0.1 ? -0.55 : 0.55)], [-1.35, 0.42 - 0.05 * u, z], 40);
  },
  // Meta throws Llama across; two CN hands grab it
  '3-03': (t, st, w) => { const u = uRow(t, '3-03'); camLook(w.camera, [-0.08, 0.8 - 0.05 * u, 2.8 - 0.1 * u], [-0.85, 0.3, 1.9], 44); },
  // the house of cards and the little card that knocks it down
  '3-04': (t, st, w) => {
    const hit = S.FLICK.hit;
    camLook(w.camera, [-0.18 + shake(t, hit, 0.004), 0.3, -1.55], [-0.12, 0.2, -0.45], 58);
    st.look.dof = { focus: 1.0, k: 0.2, max: 4 };
  },
  '3-05': (t, st, w) => { camLook(w.camera, [-0.55, 0.78, -0.25], [1.6, 0.72, -0.55], 40); },
  // OpenAI's door-sized card overhead, and down
  '3-06': (t, st, w) => {
    const g = S.plays().find((p) => p.style === 'giant');
    const u = uRow(t, '3-06');
    camLook(w.camera, [-0.95 + shake(t, g.t, 0.02), 0.5 + 0.05 * u + shake(t, g.t, 0.02, 50), 0.95], [1.25, 0.95 - 0.35 * smooth((t - g.tr) / 0.6), 0.0], 48);
  },
  '3-07': (t, st, w) => wide(w.camera, st, 0.3 + 0.12 * uRow(t, '3-07')),
  '3-08': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    const u = clamp((t - shot.t0) / (shot.t1 - shot.t0));
    if (cut === 1) faceCam(w.camera, st, w, t, 'deepseek', { d: 1.0, dz: 0.35, dy: -0.1, ly: -0.12, fov: 36 });
    else if (cut === 2) camLook(w.camera, [-0.35, 0.9, 2.1], [1.6, 0.55, 1.25], 42);
    else if (cut === 3) camLook(w.camera, [0.04, 0.78 - 0.08 * u, 0.06], [0, 0.12, 0], 30);
    else if (cut === 4) camLook(w.camera, [0.4, 0.9, 1.95], [-1.6, 0.55, 1.25], 42);
    else if (cut === 5) camLook(w.camera, [-0.35, 0.9, -0.35], [1.6, 0.55, -1.25], 42);
    else camLook(w.camera, [0.55, 0.75, 0.55], [-1.3, 0.42, -0.95], 44);
  },
  '3-09': (t, st, w) => wide(w.camera, st, 0.5 + 0.12 * uRow(t, '3-09')),
  // ---------------------------------------------------------------- @4 停手
  // from beside his head: the card in his hand, crawling, trembling
  '4-01': (t, st, w) => {
    const h = headOf('deepseek', w, st, t);
    const card = [-1.12, 0.4, 0.24];
    camLook(w.camera, S.INSERT.cam, [card[0], card[1] + 0.06, card[2]], 30); void h;
    st.look.dof = { focus: 0.6, k: 0.7, max: 12 };
  },
  '4-02': (t, st, w) => faceCam(w.camera, st, w, t, 'deepseek', { d: 0.8, dz: -0.15, fov: 30 }),
  '4-03': (t, st, w) => faceCam(w.camera, st, w, t, 'openai', { d: 0.8, dz: -0.15, fov: 30 }),
  '4-04': (t, st, w) => twoShot(w.camera, st),
  '4-05': (t, st, w) => twoShot(w.camera, st),
  '4-06': (t, st, w) => wide(w.camera, st, 0.72),
  // ---------------------------------------------------------------- @5 谁出的牌
  '5-01': (t, st, w) => { const u = uRow(t, '5-01'); camLook(w.camera, [-2.3, 0.82, 1.3 - 0.05 * u], [-1.82, 0.46, 0.6], 34); st.look.dof = { focus: 0.85, k: 0.4, max: 8 }; },
  '5-02': (t, st, w) => { camLook(w.camera, [0, 0.72, 2.75], [0, 1.3, 0.1], 58); st.look.exposure = 1.5; },
  '5-03': (t, st, w) => { camLook(w.camera, [2.2, 1.3, -0.62], [-1.35, 0.8, 0.25], 36); st.look.dof = { focus: 3.5, k: 0.3, max: 6 }; },
  '5-04': (t, st, w) => { camLook(w.camera, [-2.2, 1.3, -0.62], [1.35, 0.8, 0.25], 36); st.look.dof = { focus: 3.5, k: 0.3, max: 6 }; },
  '5-05': (t, st, w, shot) => { const cut = +shot.id.split('.')[1]; faceCam(w.camera, st, w, t, cut === 1 ? 'openai' : 'deepseek', { d: 0.7, dz: cut === 1 ? 0.1 : -0.1, fov: 26 }); },
  '5-06': (t, st, w) => wide(w.camera, st, 0.45 + 0.1 * uRow(t, '5-06')),
  '5-07': (t, st, w) => { faceCam(w.camera, st, w, t, 'deepseek', { d: 1.05, dz: 0.38, dy: -0.22, ly: -0.2, fov: 36 }); },
  '5-08': (t, st, w) => { camLook(w.camera, [-1.95, 0.98, -0.95], [1.5, 0.82, 0.05], 30); st.look.dof = { focus: 3.6, k: 0.3, max: 6 }; st.look.exposure = 1.45; },
  '5-09': (t, st, w) => { camLook(w.camera, [1.95, 0.98, -0.95], [-1.5, 0.82, 0.05], 30); st.look.dof = { focus: 3.6, k: 0.3, max: 6 }; st.look.exposure = 1.45; },
  '5-10': (t, st, w) => { camPath(w.camera, t, [[at('5-10'), [0, 0.9, 3.4], [0, 0.6, 0], 50], [at('6-01', 1.4), [0, 2.7, 4.9], [0, 0.8, 0], 48]]); st.look.exposure = 1.45; },
  // ---------------------------------------------------------------- @6 牌堆
  '6-01': (t, st, w) => { camLook(w.camera, [0, 2.7, 4.9], [0, 0.8, 0], 48); st.look.exposure = 1.45; },
  // frozen mid-swing: over OpenAI's raised arm, across the top of the mountain, DeepSeek frozen too
  '6-02': (t, st, w) => { const h = headOf('deepseek', w, st, t); camLook(w.camera, [2.25, 1.5, -0.6], [h[0], h[1] - 0.05, h[2]], 36); st.look.dof = { focus: 3.8, k: 0.25, max: 5 }; st.look.exposure = 1.5; },
  // the first card stands up and turns to them
  '6-03': (t, st, w) => {
    const H = S.heapTimes(), f = H.first.rest.pos, s2 = H.second.rest.pos;
    const u = uRow(t, '6-03');
    const c = lerp3(f, s2, smooth((u - 0.45) / 0.4));
    const h = headOf('deepseek', w, st, t);
    camLook(w.camera, [h[0] + 0.14, h[1] + 0.02, h[2] - 0.44], [c[0], c[1] + 0.12, c[2]], 30);
    st.look.dof = { focus: dist([h[0], h[1], h[2]], c), k: 0.3, max: 8 };
    st.look.exposure = 1.45;
  },
  '6-04': (t, st, w) => { const u = uRow(t, '6-04'); camLook(w.camera, [0, 0.9 + 0.05 * u, 2.1 - 0.1 * u], [0, 0.38, 0], 44); st.look.exposure = 1.4; },
  // they lift, spiral up past the lamp into the dark
  '6-05': (t, st, w) => { const u = uRow(t, '6-05'); camLook(w.camera, [0.2, 0.32, 1.25], lerp3([0, 0.9, -0.1], [0, 4.0, -0.1], smooth(u)), 64); st.look.exposure = 1.4; },
  '6-06': (t, st, w) => wide(w.camera, st, 0.35),
  // the ant's view: low on the bare cloth, the two giants looking up into the dark
  '6-07': (t, st, w) => {
    const u = uRow(t, '6-07'), A = S.ANT_BACK, h = headOf('deepseek', w, st, t);
    const up = smooth((u - 0.38) / 0.55);
    const pos = lerp3([A.x + 0.04, 0.0075, A.z + 0.01], [-0.42, 0.66, 0.34], up);
    const look = lerp3([-1.5, 0.17 + 0.12 * smooth(u / 0.38), -0.04], [h[0], h[1] - 0.04, h[2]], up);
    camLook(w.camera, pos, look, lerp(68, 34, up));
    st.look.near = lerp(0.0025, 0.03, up);
    st.look.dof = { focus: lerp(0.045, dist(pos, h), up), k: lerp(1.0, 0.3, up), max: 24 };
    st.look.exposure = 1.4;
    return;
    camLook(w.camera, [-0.3 + 0.03 * u, 0.2, 0.36], [-1.5, 0.8 + 0.04 * u, 0.0], 34);
    st.look.near = 0.006;
    st.look.dof = { focus: 1.45, k: 0.3, max: 8 };
    st.look.exposure = 1.4;
  },
  // up there: the vast cards turning, fitting together, parting
  '6-08': (t, st, w) => {
    const u = uRow(t, '6-08');
    const a = 0.3 + 0.25 * u;
    camLook(w.camera, [Math.sin(a) * 0.6, 0.9, Math.cos(a) * 0.6], [Math.sin(a) * -3, 15, Math.cos(a) * -3], 72);
    st.look.far = 400;
  },
  // ---------------------------------------------------------------- @7 发牌的人
  '7-01': (t, st, w) => {
    const c = fallCard('deepseek', t)?.pos ?? [0, 3, 0];
    camLook(w.camera, [0, 0.42, 2.3], [0, clamp(c[1] * 0.85 + 0.2, 0.5, 3.4), -0.1], 62);
    st.look.exposure = 1.4;
  },
  '7-02': (t, st, w) => { camLook(w.camera, [0, 2.25, 0.02], [0, 0, 0], 58); },
  '7-03': (t, st, w) => twoShot(w.camera, st),
  '7-04': (t, st, w) => { camLook(w.camera, [-0.4, 0.44, 0.46], [-1.18, 0.3, 0.04], 48); st.look.dof = { focus: 0.95, k: 0.3, max: 6 }; st.look.exposure = 1.4; },
  '7-05': (t, st, w) => { camLook(w.camera, [0.4, 0.44, 0.46], [1.18, 0.3, 0.04], 48); st.look.dof = { focus: 0.95, k: 0.3, max: 6 }; st.look.exposure = 1.4; },
  '7-06': (t, st, w) => twoShot(w.camera, st, 1.1, 2.9, 46),
  '7-07': (t, st, w) => { const u = uRow(t, '7-07'); camLook(w.camera, [0, 0.95, 2.3 - 0.15 * u], [0, 0.65, 0], 46); st.look.exposure = 1.4; },
  // up and away: the table a speck of warm light in the dark among the vast turning cards
  '7-08': (t, st, w) => {
    camPath(w.camera, t, [[at('7-08'), [0.95, 1.7, 1.45], [0, 0.25, 0], 52], [at('7-08', 3.0), [0.35, 13, 0.7], [0, 0, 0], 46], [at('7-08', 9.0), [0, 95, 0.5], [0, 0, 0], 38]]);
    st.look.far = 600;
    st.look.fade = ease(t, at('7-08', 7.4), at('7-09', 0.1));
  },
  '7-09': (t, st, w) => { camLook(w.camera, [0, 95, 0.55], [0, 0, 0], 38); st.look.fade = 1; st.look.far = 600; },
};
