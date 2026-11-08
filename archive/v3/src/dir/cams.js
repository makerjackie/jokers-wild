// JOKERS WILD v3 reel — the cameras, shot by shot (docs/script/shots.txt). Most shots live at the paper people's
// height: a macro lens a few centimetres above the cloth (near plane 4 mm, a shallow depth of field). The paper people
// are PROFILE cut-outs facing ±x, so these cameras look roughly along ±z (within ~50 degrees of face-on).
import { KING, SIDE_SIGN, SEAT, BOARD } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, easeOut } from '../util.js';
import { at, end, uRow, camLook, camPath, M1, keys } from './core.js';
import { stamps, proposals, RED_HOME, BLUE_HOME, MEET, WILD, flatTime } from './story.js';
import { FAN_FACE, PAIR_LIFT, pairLand } from './reel.js';

// a macro camera at the paper people's height: focus at `focus` metres, blur strength k (px·m at 720p)
function ant(cam, st, pos, look, fov = 50, focus = 0.25, k = 1.1) {
  camLook(cam, pos, look, fov);
  st.look.near = 0.004;
  st.look.dof = { focus, k, max: 18 };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const red = (st) => { const p = st.paper.people.red.pos; return [p[0], 0.025, p[1]]; };
const blue = (st) => { const p = st.paper.people.blue.pos; return [p[0], 0.025, p[1]]; };
const _hv = { x: 0, y: 0, z: 0 };
// the king's head centre this frame (the kings module solves rise, lean and size); a fixed guess without it
let _posed = null;
const headOf = (id, w, st, t) => {
  // pose the kings for this very moment first (pure: the module's update is a function of st and t), so the head is
  // where it will be drawn, whatever frame was rendered before
  if (w?.kings?.update && st && _posed !== st) { w.kings.update(st.kings, t); _posed = st; }
  if (w?.kings?.headWorld) { const v = w.kings.headWorld(id, new (w.camera.position.constructor)()); return [v.x, v.y, v.z]; }
  const k = KING[id]; return [SIDE_SIGN[k.side] * 1.5, 0.72, SEAT.Z[k.seat]];
};
void _hv;
const firstOf = (id) => stamps().find((s) => s.who === id);

export const SHOTS = {
  '1-01': (t, st, w) => { M1(w.camera); st.look.fade = 1; },
  // the red one on the coast, waving across the sea; a slow pan finds the blue one far away, waving back
  '1-02': (t, st, w) => {
    const u = uRow(t, '1-02');
    const pos = [-0.665 - 0.02 * (1 - u), 0.032, -1.997 + 0.012];
    const look = [0.56, 0.036, -2.02];
    // the focus pulls across the sea to the blue one as she waves back
    const pull = smooth((u - 0.42) / 0.3);
    const b = blue(st);
    ant(w.camera, st, pos, lerp3(look, [b[0], 0.03, b[2]], pull), lerp(32, 11, smooth((u - 0.45) / 0.45)), lerp(dist(pos, red(st)), dist(pos, b), pull), 0.8);
    st.look.p3 = { pos: [b[0] - 0.09, 0.05, b[2] + 0.05], col: [1.1 * pull, 0.8 * pull, 0.5 * pull], range: 0.22 };
    st.look.exposure = 1.25;
  },
  // a shadow falls; he turns and looks up: the giant over him with the stamp in his fist
  '1-03': (t, st, w) => {
    const u = uRow(t, '1-03');
    const r = red(st);
    ant(w.camera, st, [r[0] + 0.045, 0.012, r[2] + 0.1], lerp3([r[0] - 0.03, 0.035, r[2] - 0.06], [-1.0, 0.3, -2.3], smooth(u * 1.5)), 74, 0.11, 0.9);
    st.look.exposure = 1.3;
  },
  // the card skids out of the press and stops at his feet
  '2-01': (t, st, w) => {
    const r = red(st), u = uRow(t, '2-01');
    ant(w.camera, st, [r[0] + 0.05, 0.03, r[2] + 0.2 - 0.03 * u], [r[0] - 0.2, 0.03, r[2] - 0.2], 56, 0.24, 1.0);
  },
  // the king's view: the card with its 批准？ box, the little red figure beside it, the stamp hanging above
  '2-02': (t, st, w) => {
    const s = firstOf('deepseek'), u = uRow(t, '2-02');
    camLook(w.camera, [-1.38, 0.62 - 0.04 * u, -2.2], [s.pos[0] + 0.08, 0.0, s.pos[1] + 0.03], 34 - 3 * u);
    st.look.dof = { focus: 0.75, k: 0.5, max: 8 };
  },
  // DeepSeek reads, and nods
  '2-03': (t, st, w) => {
    const h = headOf('deepseek', w, st, t);
    camLook(w.camera, [h[0] + 0.72, h[1] - 0.42, h[2] + 0.22], [h[0], h[1] - 0.06, h[2]], 30);
    const k = st.kings.deepseek; if (k.look) { const nod = Math.sin(clamp((t - at('2-03', 0.45)) / 0.5) * Math.PI) * 0.18; k.look = [k.look[0], k.look[1] - nod, k.look[2]]; }
  },
  // the stamp comes down out of the sky beside him: the first 咚
  '2-04': (t, st, w) => {
    const s = firstOf('deepseek'), r = red(st);
    const shake = t > s.t ? Math.exp(-(t - s.t) * 9) * 0.006 * Math.sin((t - s.t) * 90) : 0;
    ant(w.camera, st, [r[0] + 0.02, 0.03 + shake, r[2] + 0.24], [lerp(r[0], s.pos[0], 0.55), 0.09, lerp(r[2], s.pos[1], 0.6) - 0.02], 62, 0.3, 1.0);
  },
  // across the sea: OpenAI's stamp beside the blue one, quicker
  '2-05': (t, st, w) => {
    const s = firstOf('openai'), b = blue(st);
    const shake = t > s.t ? Math.exp(-(t - s.t) * 9) * 0.005 * Math.sin((t - s.t) * 90) : 0;
    ant(w.camera, st, [b[0] - 0.02, 0.03 + shake, b[2] + 0.24], [lerp(b[0], s.pos[0], 0.55), 0.09, lerp(b[2], s.pos[1], 0.6) - 0.02], 62, 0.3, 1.0);
  },
  // DeepSeek looks across at OpenAI, frowns, stamps without finishing
  '3-01': (t, st, w) => {
    const h = headOf('deepseek', w, st, t);
    camLook(w.camera, [h[0] + 0.95, h[1] - 0.05, h[2] + 0.55], [h[0] + 0.1, h[1] - 0.18, h[2] + 0.12], 36);
  },
  // the cards, top down: the faces going to glyphs; 咚 批准
  '3-02': (t, st, w) => { topOnCard(w.camera, st, 'deepseek', at('3-02', 0.38), t); },
  '3-03': (t, st, w) => { topOnCard(w.camera, st, 'openai', at('3-03', 0.32), t); },
  // he runs along the coast between the stamps
  '3-04': (t, st, w) => {
    const r = red(st);
    ant(w.camera, st, [r[0] + 0.12, 0.028, r[2] + 0.16], [r[0] - 0.05, 0.04, r[2] - 0.02], 58, 0.2, 1.0);
  },
  // the montage: eyes on each other above, blind hands below
  '3-05': (t, st, w, shot) => {
    const cut = +shot.id.split('.')[1];
    const who = cut % 2 ? 'deepseek' : 'openai';
    const h = headOf(who, w, st, t), s = SIDE_SIGN[KING[who].side];
    if (cut === 1 || cut === 4) camLook(w.camera, [h[0] - s * 0.7, h[1] - 0.02, h[2] + 0.35], [h[0], h[1] - 0.02, h[2]], 28);
    else if (cut === 2 || cut === 5) camLook(w.camera, [h[0] - s * 0.7, h[1] - 0.06, h[2] + 0.3], [h[0], h[1] - 0.02, h[2]], 28);
    else { const sp = stamps().find((x) => x.who === who && x.t > shot.t0 + 0.05) ?? firstOf(who); topOnCard(w.camera, st, who, sp.t, t); }
  },
  // the pile-driver wide: every king stamping along both coasts, the paper crowd running
  '3-06': (t, st, w) => {
    const u = uRow(t, '3-06');
    ant(w.camera, st, [-0.48, 0.05 + 0.03 * u, -0.5 - 0.05 * u], [-0.62, 0.12, -1.9], 54, 0.9, 0.7);
    st.look.exposure = 1.3;
  },
  // the blind stamp right at him
  '3-07': (t, st, w) => {
    const shake = t > WILD.t ? Math.exp(-(t - WILD.t) * 9) * 0.007 * Math.sin((t - WILD.t) * 90) : 0;
    ant(w.camera, st, [-0.52, 0.026 + shake, -2.18], [-0.62, 0.07, -2.46], 60, 0.25, 1.0);
  },
  // the board: 批准率 97 99 100 %
  '3-08': (t, st, w) => { const u = uRow(t, '3-08'); camLook(w.camera, [-0.55, BOARD.pos[1] + 0.42, BOARD.pos[2] + 2.3 - 0.25 * u], [-0.62, BOARD.pos[1] + 0.42, BOARD.pos[2]], 30); },
  // the card leaves by itself; the stamp hits nothing
  '4-01': (t, st, w) => {
    const s = stamps().find((x) => x.who === 'deepseek' && x.t > CUES.unneeded);
    const u = uRow(t, '4-01');
    camLook(w.camera, [-1.18, 0.3, s.pos[1] + 0.55], [s.pos[0] + 0.12, 0.1 + 0.06 * u, s.pos[1] - 0.05], 50);
    st.look.dof = { focus: 0.7, k: 0.4, max: 6 };
  },
  // DeepSeek stares at his stamp, then at the cards going past by themselves
  '4-02': (t, st, w) => {
    const h = headOf('deepseek', w, st, t), u = uRow(t, '4-02');
    camLook(w.camera, [h[0] + 0.75, h[1] - 0.1, h[2] + 0.12 - 0.03 * u], [h[0], h[1] - 0.03, h[2]], 30);
  },
  // the river: cards pour out of every press over the table; the kings lean back
  '4-03': (t, st, w) => { const u = uRow(t, '4-03'); camLook(w.camera, [0, 1.15 + 0.1 * u, 2.4 - 0.2 * u], [0, 1.05 + 0.25 * u, -2.8], 56); st.look.exposure = 1.45; st.look.lampPow = 1.25; },
  // under the river: he gets up and steps onto the sea
  '4-04': (t, st, w) => {
    const r = red(st), u = uRow(t, '4-04');
    ant(w.camera, st, [r[0] + 0.1, 0.022, r[2] + 0.2], [r[0] - 0.02, 0.07 + 0.08 * u, r[2] - 0.08], 60, 0.22, 1.0);
  },
  // the blue one walks out too
  '4-05': (t, st, w) => {
    const b = blue(st);
    ant(w.camera, st, [b[0] - 0.06, 0.024, b[2] + 0.2], [b[0] - 0.02, 0.05, b[2] - 0.05], 56, 0.21, 1.0);
  },
  // the meeting in the middle of the sea; they take hands
  '4-06': (t, st, w) => {
    const u = uRow(t, '4-06');
    ant(w.camera, st, [MEET[0] + 0.008, 0.027, MEET[1] + 0.2 - 0.05 * u], [MEET[0], 0.028, MEET[1]], 30, 0.2 - 0.05 * u, 1.2);
  },
  // two moons over the sea
  '5-01': (t, st, w) => {
    const u = uRow(t, '5-01'), e = smooth((u - 0.3) / 0.6);
    const pos = lerp3([-0.5, 0.04, -2.2], [MEET[0], 0.02, MEET[1] + 0.3], e);
    const look = lerp3([-0.86, 0.2, -2.6], [MEET[0], 0.27, MEET[1] - 0.15], e);
    ant(w.camera, st, pos, look, lerp(48, 66, e), lerp(0.4, 0.3, e), 0.6);
  },
  // both kings on their feet, staring across at each other
  '5-02': (t, st, w) => { camLook(w.camera, [0, 0.95, -0.9], [0, 0.6, -2.5], 52); st.look.exposure = 1.3; },
  // the charge, right over them; the stop; the turn: 王炸
  '5-03': (t, st, w) => { ant(w.camera, st, [MEET[0], 0.02, MEET[1] + 0.34], [MEET[0], 0.2, MEET[1] - 0.06], 66, 0.38, 0.7); },
  '5-04': (t, st, w) => { ant(w.camera, st, [MEET[0], 0.02, MEET[1] + 0.34], [MEET[0], 0.2, MEET[1] - 0.06], 64, 0.38, 0.7); },
  '5-05': (t, st, w) => {
    const u = uRow(t, '5-05');
    ant(w.camera, st, [MEET[0], 0.018, MEET[1] + 0.32 + 0.05 * u], [MEET[0], 0.27, MEET[1] - 0.06], 60 + 6 * u, 0.4, 0.6);
    const f = clamp(1 - Math.abs(t - (CUES.pair + 0.5)) / 0.35);
    st.look.flash = f * 0.9; st.look.flashCol = '#ffe2a0';
  },
  // the gold floods out over the map; the camera rises
  '5-06': (t, st, w) => {
    const u = uRow(t, '5-06'), e = smooth(u);
    const pos = [lerp(0, 0.2, e), lerp(0.03, 1.7, e * e), lerp(MEET[1] + 0.3, 1.1, e)];
    if (e < 0.25) ant(w.camera, st, pos, [0, 0.03, MEET[1] - 0.2], 64, 0.35, 0.6 * (1 - e * 4));
    else camLook(w.camera, pos, [0, 0, -1.6], 64);
    st.look.exposure = 1.3;
  },
  // low behind the kings: the card king assembles over the throne; the kings are the ants now
  '6-01': (t, st, w) => {
    const u = uRow(t, '6-01');
    camLook(w.camera, [0.05, 0.1 + 0.05 * u, -1.15 + 0.1 * u], [0, 2.1 + 0.9 * u, -4.1], 72);
    st.look.exposure = 1.3;
  },
  // its hands over DeepSeek and OpenAI: pressed flat into court cards
  '6-02': (t, st, w) => {
    const a = flatTime('deepseek'), b = flatTime('openai');
    const u = smooth((t - (a + 0.55)) / 0.25);           // hold on DeepSeek until his card is seen, then whip across
    camLook(w.camera, [0, 0.62, -1.55], lerp3([-1.75, 0.62, -2.45], [1.75, 0.62, -2.45], u), 48);
    st.look.exposure = 1.3;
  },
  // every king, one after another; the cards fly up into its hand
  '6-03': (t, st, w) => { const u = uRow(t, '6-03'); camLook(w.camera, [0, 1.1 + 0.2 * u, 0.9], [0, 1.45 + 0.4 * u, -2.9], 64); st.look.exposure = 1.5; st.look.lampPow = 1.35; },
  // the fan: every king on a card
  '6-04': (t, st, w) => { fanCam(w, st, t, '6-04'); },
  // the two of them hand in hand, looking up: a golden fingertip comes down out of the dark
  '6-05': (t, st, w) => {
    const u = uRow(t, '6-05');
    ant(w.camera, st, [0.025, 0.02, -1.78], [-0.005, 0.14 - 0.03 * u + 0.08 * smooth((t - PAIR_LIFT.t) / 0.4), -2.06], 58, 0.25, 0.8);
  },
  // the last card in the fan: the two paper people
  '6-06': (t, st, w) => { fanCam(w, st, t, '6-06', true); },
  // played onto the pile; the next card covers it
  '6-07': (t, st, w) => { const u = uRow(t, '6-07'), L = pairLand(); camLook(w.camera, [L[0] + 0.02, L[1] + 0.5 - 0.06 * u, L[2] + 0.2], [L[0], L[1], L[2] - 0.01], 30); st.look.exposure = 1.3; st.look.fade = ease(t, end('6-07', -0.25), end('6-07')); },
  '6-08': (t, st, w) => { M1(w.camera); st.look.fade = 1; },
};

// top-down onto a proposal card at the moment of its stamp
function topOnCard(cam, st, who, tStamp, t) {
  const s = stamps().find((x) => x.who === who && Math.abs(x.t - tStamp) < 0.02) ?? firstOf(who);
  const sx = SIDE_SIGN[KING[who].side];
  camLook(cam, [s.pos[0] - sx * 0.14, 0.62, s.pos[1] + 0.04], [s.pos[0] + sx * 0.03, 0, s.pos[1]], 36);
  st.look.dof = { focus: 0.6, k: 0.35, max: 6 };
}
// the fan in the card king's left hand, faced square on
function fanCam(w, st, t, row, last = false) {
  const ck = w.cardking;
  let c = [0, 3.0, -3.2], up = null;
  if (ck?.fanFrame) {
    const M = new (w.camera.matrix.constructor)(); ck.fanFrame(last ? 10 : 5, M); c = [M.elements[12], M.elements[13], M.elements[14]];
    if (last) { const e = M.elements, l = Math.hypot(e[4], e[5], e[6]); up = [e[4] / l, e[5] / l, e[6] / l]; }
  }
  const u = uRow(t, row);
  const d = [FAN_FACE[0] - c[0], FAN_FACE[1] - c[1], FAN_FACE[2] - c[2]], l = Math.hypot(...d);
  const back = last ? 1.7 : 1.75 - 0.12 * u;
  camLook(w.camera, [c[0] + d[0] / l * back, c[1] + d[1] / l * back, c[2] + d[2] / l * back], c, last ? 40 : 48);
  // the last card upright on screen: the camera rolls with its slot (part way, so the fan still reads as a fan)
  if (up) { const cu = w.camera.up; cu.set(cu.x + (up[0] - cu.x) * 0.8, cu.y + (up[1] - cu.y) * 0.8, cu.z + (up[2] - cu.z) * 0.8).normalize(); w.camera.lookAt(...c); }
  st.look.exposure = 1.3;
  st.look.p3 = { pos: [c[0] + d[0] / l * 0.8, c[1] + d[1] / l * 0.8, c[2] + d[2] / l * 0.8], col: [0.9, 0.8, 0.6], range: 2.5 };
}
