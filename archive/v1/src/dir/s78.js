// Sequences 7-8 — 托管 / 破柜 (2:02–2:28): the tone reel's shots (step 3), plus 6-10.
import { KING, SIDE_SIGN, SEAT, CASES, JOKER_Y } from '../layout.js';
import { AUTO } from '../plan.js';
import { ease, lerp, lerp3, smooth } from '../util.js';
import { at, camLook, M1, kf, off, AUTO_BTN, face } from './core.js';

function cascadeCam(cam, id) {
  // the same framing for every king: low, from the table, the button in the foreground, mirrored by camp
  const k = KING[id], s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  camLook(cam, [s * 0.6, 0.12, z + 0.62], [s * 1.42, 0.55, z + 0.02], 42);
}
function caseCam(cam, side, u) {
  const c = CASES[side], s = SIDE_SIGN[side];
  camLook(cam, lerp3([c[0] - s * 0.95, JOKER_Y + 0.25, c[2] + 1.05], [c[0] - s * 0.7, JOKER_Y + 0.2, c[2] + 0.78], smooth(u)), [c[0], JOKER_Y + 0.14, c[2]], 30);
}
function partyCut(t, st, w, i) {
  const cam = w.camera;
  switch (i) {
    case 1: { const h = off('openai', -0.2, 0.92, 0.0); camLook(cam, [h[0] - 0.3, h[1] + 0.03, h[2] - 0.72], [h[0] - 0.1, h[1] - 0.02, h[2]], 28); break; }
    case 2: camLook(cam, [0, 0.62, -0.6], [0, 0.72, -2.4], 58); break;
    case 3: camLook(cam, [0.9, 0.75, 1.5], [0, 2.2, -0.1], 40); break;
    case 4: camLook(cam, [0, 4.45, -1.2], [0, 5.15, -4.9], 32); break;
    case 5: { const h = off('google', -0.1, 0.95, 0); camLook(cam, [h[0] - 0.7, h[1] - 0.1, h[2] + 0.35], h, 32); break; }
    case 6: camLook(cam, [-0.4, 0.45, 1.6], [0.6, 0.9, -1.0], 46); break;
    case 7: camLook(cam, [0.05, 0.55, 0.25], [0.0, 0.1, 0.0], 30); break;
    case 8: { const h = off('deepseek', 0.12, 0.95, 0); camLook(cam, [h[0] + 0.72, h[1] + 0.02, h[2] - 0.5], h, 32); break; }
    case 9: camLook(cam, [0.0, 0.62, 0.35], [0.0, 0.12, -0.05], 24); break;
    case 10: { const h = off('xai', -0.1, 0.95, 0); camLook(cam, [h[0] - 0.6, h[1] + 0.05, h[2] - 0.35], h, 30); break; }
    case 11: camLook(cam, [0, 2.6, 5.2], [0, 0.6, -2.0], 42); break;
    case 12: camLook(cam, [0, 0.9, -0.9], [0, 0.95, -2.5], 40); break;
    case 13: case 14: case 15: camLook(cam, [-1.3, 4.5, -2.0], [-1.25, 5.85, -4.9], 18); break;
    default: { const h = off('anthropic', -0.12, 0.98, 0); camLook(cam, [h[0] - 0.62, h[1] + 0.05, h[2] + 0.58], h, 30); }
  }
  void st;
}

export const SHOTS = {
  '6-10': (t, st, w) => {
    const u = (t - at('6-10')) / 1.5;
    camLook(w.camera, lerp3([0.55, 0.52, -0.66], [0.62, 0.54, -0.72], u), [1.36, 0.62, -1.12], 34);
    st.kings.anthropic.face = face('down', { socket: 0.28 });
    st.kings.anthropic.look = AUTO_BTN('anthropic');
  },
  '7-01': (t, st, w) => {
    camLook(w.camera, [0.55, 0.06, -0.5], [1.38, 0.52, -1.12], 42);
    if (t < AUTO.anthropic.press) st.kings.anthropic.look = AUTO_BTN('anthropic');
  },
  '7-02': (t, st, w) => cascadeCam(w.camera, 'openai'),
  '7-03': (t, st, w) => cascadeCam(w.camera, 'deepseek'),
  '7-04': (t, st, w) => cascadeCam(w.camera, 'google'),
  '7-05': (t, st, w) => cascadeCam(w.camera, 'qwen'),
  '7-06': (t, st, w) => { cascadeCam(w.camera, 'xai'); st.kings.xai.plateFlip = ease(t, at('7-06', 0.15), at('7-06', 0.32)); },
  '7-07': (t, st, w) => cascadeCam(w.camera, 'kimi'),
  '7-08': (t, st, w) => camLook(w.camera, [0, 0.55, 4.6], [0, 0.35, 2.0], 50),
  '7-09': (t, st, w) => M1(w.camera, 0.5),
  '7-10': (t, st, w, shot) => partyCut(t, st, w, +shot.id.split('.')[1]),
  '7-11': (t, st, w) => { const c = CASES.CN; camLook(w.camera, [c[0] + 0.02, JOKER_Y + 0.13, c[2] + 0.05], [c[0] + 1.6, 0.55, c[2] + 3.2], 52); st.look.warp = 0.6; st.cards.jokers.CN = { show: false }; },
  '7-12': (t, st, w) => { const c = CASES.CN; camLook(w.camera, [c[0] + 0.02, JOKER_Y + 0.13, c[2] + 0.05], [c[0] + 1.6, 0.55, c[2] + 3.2], 52); st.cards.jokers.CN = { show: false }; },
  '8-01': (t, st, w) => { const h = off('google', -0.2, 0.9, 0.0); camLook(w.camera, [h[0] - 0.62, h[1] + 0.08, h[2] - 0.5], [h[0] - 0.06, h[1] - 0.04, h[2] + 0.02], 30); },
  '8-02': (t, st, w) => camLook(w.camera, [0.65, 0.55, 1.55], kf('meta', 0.35, 0.72, -0.15), 34),
  '8-03': (t, st, w) => { caseCam(w.camera, 'CN', (t - at('8-03')) / 2.0); if (st.cards.storm) st.cards.storm.keepOut = 1.6; },
  '8-04': (t, st, w) => { caseCam(w.camera, 'US', (t - at('8-04')) / 1.5); if (st.cards.storm) st.cards.storm.keepOut = 1.6; },
  '8-05': (t, st, w) => { camLook(w.camera, [0, 2.0, 1.2], [0, 5.3, -4.8], 50); st.look.exposure = 1.45; },
  '8-06': (t, st, w) => { const b = AUTO_BTN('anthropic'); camLook(w.camera, [b[0] - 0.75, 0.42, b[2] + 0.62], [b[0] + 0.12, 0.28, b[2] - 0.12], 40); },
  '8-07': (t, st, w) => {
    const u = (t - at('8-07')) / 2;
    camLook(w.camera, [0, 1.05 + 0.1 * u, 2.3 - 0.2 * u], [0, lerp(2.6, 1.65, Math.min(1, u * 1.6)), -0.7], 56); st.look.exposure = 1.5;
    if (st.cards.storm) st.cards.storm.keepOut = 1.3;
    // the two seals catch the light as the cards wind round their chains
    const us = st.props.seals?.US?.pos, cn = st.props.seals?.CN?.pos;
    if (us) st.look.p2 = { pos: [us[0] - 0.4, us[1] - 0.5, us[2] + 0.9], col: [1.6, 1.5, 1.3], range: 2.4 };
    if (cn) st.look.p3 = { pos: [cn[0] + 0.4, cn[1] - 0.5, cn[2] + 0.9], col: [1.6, 1.5, 1.3], range: 2.4 };
  },
  '8-08': (t, st, w) => { camLook(w.camera, lerp3([0, 0.85, -1.0], [0, 0.95, -1.5], (t - at('8-08')) / 2.2), [0, 1.45, -4.1], 40); st.look.exposure = 1.45; },
};
