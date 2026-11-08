// Sequences 6-7 — 癫狂 / 托管 (1:42–2:16): gold, a data-centre castle, a city torn off the map, a power plant: into
// the presses. The fourth locks. Everyone on his feet, both hands, ×1024. Claude looks at the AUTO button. He presses;
// the cascade; cigars; toasts across the sea; the backs turn purple. Nobody watches the boxes: the strung hands turn
// the last locks. 2026·11. From inside the box, the party.
import { KINGS, KING, SEAT, SIDE_SIGN, BOXES, BOX, CITY } from '../layout.js';
import { CUES } from '../shots.js';
import { AUTO } from '../plan.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, M1, kf, off, AUTO_BTN, face } from './core.js';
import { LOCKS, sizeAt } from './story.js';
import { hd, pressPt } from './s1.js';
import { cityHand, CITY_T } from './world.js';

function feedCam(cam, id, t, row) {
  const s = sizeAt(t, id), u = uRow(t, row), P = [SIDE_SIGN[KING[id].side] * 0.9, 0.3, SEAT.Z[KING[id].seat] - 0.12];
  camLook(cam, kf(id, 2.0 * s, 1.15, 1.0 - 0.1 * u), lerp3(P, kf(id, 0.25, 0.9 * s, 0), 0.45), 46);
}
function feedAct(st, id, t) { st.kings[id].face = face('glare', { mouth: 'scream', pupil: 0.9, socket: 0.3 }); st.kings[id].look = [SIDE_SIGN[KING[id].side] * 0.9, 0.3, SEAT.Z[KING[id].seat] - 0.12]; st.kings[id].rise = 1; st.kings[id].sweat = 1; }
function lockCamTight(cam, side) { const b = BOXES[side], s = SIDE_SIGN[side]; camLook(cam, [b[0] - s * 0.68, 0.3, b[2] + 0.06], [b[0] - s * 0.05, 0.2, b[2]], 42); }
function cascadeCam(cam, id) {
  // low from the table, the button in the foreground; the head kings from the head side (their box is on the foot side)
  const k = KING[id], s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat], dz = k.seat === 0 ? -0.55 : 0.62;
  camLook(cam, k.seat === 0 ? [s * 0.55, 0.32, z + dz] : [s * 0.6, 0.12, z + dz], [s * 1.42, k.seat === 0 ? 0.7 : 0.55, z + 0.02], 44);
}
function partyCut(t, st, w, i) {
  const cam = w.camera;
  switch (i) {
    case 1: { const h = off('openai', -0.2, 0.92 * sizeAt(t, 'openai'), 0.0); camLook(cam, [h[0] - 0.3, h[1] + 0.03, h[2] - 0.72], [h[0] - 0.1, h[1] - 0.02, h[2]], 28); break; }
    case 2: camLook(cam, [0, 0.62, -0.6], [0, 0.72, -2.4], 58); break;                     // the toast across the sea
    case 3: camLook(cam, [0.9, 0.75, 1.5], [0, 2.2, -0.1], 40); break;                      // smoke rings in the beam
    case 4: camLook(cam, [0.35, 1.25, 1.35], [0.0, 0.35, -0.6], 40); break;                  // cards fly by themselves
    case 5: { const h = off('deepseek', 0.12, 0.95 * sizeAt(t, 'deepseek'), 0); camLook(cam, [h[0] + 0.72, h[1] + 0.02, h[2] - 0.5], h, 32); break; }
    case 6: camLook(cam, [-0.45, 0.95, 1.15], [-0.2, 0.05, 0.6], 36); break;                 // purple backs
    case 7: { const h = off('google', -0.1, 0.95 * sizeAt(t, 'google'), 0); camLook(cam, [h[0] - 0.7, h[1] - 0.1, h[2] + 0.35], h, 32); break; }
    case 8: camLook(cam, [0, 2.6, 5.2], [0, 0.6, -2.0], 42); break;
    case 9: camLook(cam, [0, 0.62, -0.6], [0, 0.72, -2.4], 50); break;
    default: { const h = off('anthropic', -0.12, 0.98 * sizeAt(t, 'anthropic'), 0); camLook(cam, [h[0] - 0.62, h[1] + 0.05, h[2] + 0.58], h, 30); }
  }
  void st;
}

export const RANGE = [at('6-01'), at('8-01')];
export function apply(t, st, w) {
  // the frenzy: everyone on his feet, shouting; the head kings watch the other side's box
  if (t < CUES.auto - 0.6) for (const k of KINGS) {
    const s = st.kings[k.id];
    if (!s.face || s.face.eyes === 'open') s.face = face(((KINGS.indexOf(k) + Math.floor(t * 3)) % 3) ? 'shout' : 'glare', { mouth: ((KINGS.indexOf(k) + Math.floor(t * 2)) % 2) ? 'scream' : 'grit', pupil: 0.85, socket: 0.3 });
  }
}

export const SHOTS = {
  '6-01': (t, st, w) => { feedCam(w.camera, 'google', t, '6-01'); feedAct(st, 'google', t); st.look.exposure = 1.3; },
  '6-02': (t, st, w) => { feedCam(w.camera, 'doubao', t, '6-02'); feedAct(st, 'doubao', t); st.look.exposure = 1.3; },
  // ---- Meta tears a whole lit city off the map
  '6-03': (t, st, w) => {
    camLook(w.camera, [-0.15, 0.85, 1.3], [CITY[0] + 0.25, 0.3, CITY[2] + 0.2], 48);
    feedAct(st, 'meta', t); st.kings.meta.look = [CITY[0], 0.2, CITY[2]];
    const id = 'meta', p = cityHand(t);
    const rest = kf(id, 0.3, 0.25, 0), k = ease(t, CITY_T.reach, CITY_T.peel0), off = 1 - ease(t, CITY_T.into1, CITY_T.into1 + 0.3);
    const q = lerp3(rest, p, k * off);
    st.kings[id].armL = { target: [q[0] + 0.04, q[1] + 0.02, q[2] + 0.07] }; st.kings[id].armR = { target: [q[0] + 0.04, q[1] + 0.02, q[2] - 0.07] }; st.kings[id].hand = { L: 'hold', R: 'hold' };
    st.look.exposure = 1.3;
  },
  '6-04': (t, st, w) => { feedCam(w.camera, 'kimi', t, '6-04'); feedAct(st, 'kimi', t); st.look.exposure = 1.3; },
  '6-05': (t, st, w) => { lockCamTight(w.camera, 'US'); st.look.p3 = { pos: [0.3, 0.6, -1.5], col: [1.1, 0.95, 0.75], range: 1.4 }; },
  '6-06': (t, st, w) => { lockCamTight(w.camera, 'CN'); st.look.p3 = { pos: [-0.3, 0.6, -1.5], col: [1.1, 0.95, 0.75], range: 1.4 }; },
  // ---- everyone on his feet, both hands, cards bigger than men; the lamp swings wild; ×1024
  '6-07': (t, st, w) => { const u = uRow(t, '6-07'); camLook(w.camera, [0.0, 2.2 - 0.2 * u, 4.4 - 0.5 * u], [0, 0.55, -1.4], 54); st.look.exposure = 1.4; st.look.p3 = { pos: [0, 2.6, 3.0], col: [0.8, 0.72, 0.6], range: 9 }; },
  // ---- Claude, spent, sweat running down his mask, crown askew; his eyes find the AUTO button; the noise goes away
  '6-08': (t, st, w) => {
    const u = uRow(t, '6-08'), h = hd('anthropic', t), b = AUTO_BTN('anthropic');
    // his sweating face above; the AUTO console with its glowing label rising into the bottom of the frame as his eyes drop to it
    camLook(w.camera, lerp3([0.66, 0.5, -0.5], [0.62, 0.42, -0.5], smooth(u)), lerp3([1.4, 0.68, -1.12], [1.12, 0.22, -0.95], smooth(u)), lerp(46, 54, smooth(u)));
    Object.assign(st.kings.anthropic, { rise: 0.3 * (1 - u), sweat: 0.5, crownTilt: 0.32, lean: 0.12, look: u < 0.4 ? [0, 0.3, 0] : b, face: face(u < 0.4 ? 'worry' : 'down', { eyes: u < 0.4 ? 'wide' : 'down', mouth: 'open', socket: 0.35 }) });
    st.look.exposure = 1.3;
  },
  // ---- seq 7: AUTO
  '7-01': (t, st, w) => { camLook(w.camera, [0.55, 0.06, -0.5], [1.38, 0.52, -1.12], 42); if (t < AUTO.anthropic.press) st.kings.anthropic.look = AUTO_BTN('anthropic'); },
  '7-02': (t, st, w) => camLook(w.camera, [-0.1, 1.1, -3.65], [1.4, 0.92, -2.35], 54),
  '7-03': (t, st, w) => camLook(w.camera, [-0.45, 0.62, -3.0], [-1.35, 0.42, -2.2], 44),
  '7-04': (t, st, w) => cascadeCam(w.camera, 'google'),
  '7-05': (t, st, w) => cascadeCam(w.camera, 'qwen'),
  '7-06': (t, st, w) => cascadeCam(w.camera, 'xai'),
  '7-07': (t, st, w) => cascadeCam(w.camera, 'kimi'),
  '7-08': (t, st, w) => camLook(w.camera, [0, 0.55, 4.6], [0, 0.35, 2.0], 50),
  '7-09': (t, st, w) => M1(w.camera, 0.5),
  '7-10': (t, st, w, shot) => partyCut(t, st, w, +shot.id.split('.')[1]),
  // ---- nobody watches the box: OpenAI's strung hand drifts over on its threads and turns the last lock; the date holds at 2026·11
  '7-11': (t, st, w) => {
    const b = BOXES.US, u = uRow(t, '7-11');
    camLook(w.camera, [b[0] - 0.74, 0.32, b[2] + 0.06], [b[0] - 0.05, 0.22 + 0.04 * u, b[2]], 46);
    st.kings.openai.face = face('laugh', { socket: 0.3 }); st.kings.openai.look = kf('openai', 3.2, 1.0, 0);
    st.look.p3 = { pos: [0.3, 0.6, -1.3], col: [1.0, 0.85, 0.65], range: 1.6 };
  },
  '7-12': (t, st, w) => {
    const b = BOXES.CN;
    camLook(w.camera, [b[0] + 0.74, 0.32, b[2] + 0.06], [b[0] + 0.05, 0.22, b[2]], 46);
    st.kings.deepseek.face = face('laugh', { socket: 0.3 }); st.kings.deepseek.look = kf('deepseek', 3.2, 1.0, 0);
    st.look.p3 = { pos: [-0.3, 0.6, -1.3], col: [1.0, 0.85, 0.65], range: 1.6 };
  },
  // ---- from inside the box, through the crack of the lid: the party, warped, warm
  '7-13': (t, st, w) => { const b = BOXES.US; camLook(w.camera, [b[0] - 0.05, 0.32, b[2] + 0.42], [b[0], 0.26, b[2]], 40); st.set.boxes.US.seam = 1; st.set.boxes.US.glow = 1; st.look.p3 = { pos: [b[0], 0.35, b[2] + 0.2], col: [2.2, 1.6, 0.6], range: 1.2 }; },
};
void LOCKS; void BOX; void smooth; void clamp; void end; void pressPt; void lerp;
