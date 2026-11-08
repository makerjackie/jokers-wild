// Sequence 1 — 开局 (0:00–0:25): black; the lamp clicks on; the first card; one long move back to M1; heads turn; the title.
import { KINGS, SEAT, SIDE_SIGN, M1 as M1CAM } from '../layout.js';
import { ease, lerp, lerp3, smooth } from '../util.js';
import { at, end, camLook, camPath, M1, kf, off, face, sx } from './core.js';
import { FIRST } from './throws.js';

export const SHOTS = {
  '1-01': (t, st, w) => { camLook(w.camera, [0, 1.05, 0.02], [0, 0, 0], 40); st.look.fade = 1; },
  // ---- the lamp clicks on over the sea; the first card slams into the pool of light; the lamp starts to swing
  '1-02': (t, st, w) => {
    camLook(w.camera, [0, 1.05, 0.02], [0, 0, 0], 40);
    st.look.lampCone = 42; st.look.vignette = 0.6;
    st.look.exposure = 1.0 + 0.25 * ease(t, at('1-02'), at('1-02', 0.3));
  },
  // ---- one take: up off the card, the swinging light finds the kings row by row, back to M1; the board wakes up
  '1-03': (t, st, w) => {
    const T = at('1-03');
    camPath(w.camera, t, [
      [T, [0, 1.05, 0.02], [0, 0, 0], 40],
      [T + 2.6, [0, 1.42, 0.95], [0, 0.18, -0.9], 44],
      [T + 5.8, [0, 1.85, 3.9], [0, 0.55, -2.6], 42],
      [T + 10.2, M1CAM.pos, M1CAM.look, M1CAM.fov],
    ]);
    // the spot opens up as we leave the card (the lamp's pool becomes the room's light)
    st.look.lampCone = lerp(42, 64, ease(t, T + 3.5, T + 10));
    st.look.vignette = lerp(0.6, 0.5, ease(t, T, T + 6));
    for (const k of KINGS) st.kings[k.id].face = face(k.id === 'deepseek' ? 'smug' : 'calm', { socket: 0.3 });
  },
  // ---- OpenAI draws back the arm that threw; his eyes slide toward the empty throne
  '1-04': (t, st, w) => {
    const h = kf('openai', 0, 0.98, 0);
    camLook(w.camera, kf('openai', 1.75, 0.3, 0.95), [h[0], h[1] - 0.22, h[2] - 0.12], 36);
    st.kings.openai.look = lerp3(kf('openai', 2.0, 0.6, 0.6), kf('openai', 1.6, 1.0, -1.2), ease(t, at('1-04', 0.7), at('1-04', 1.2)));
    st.kings.openai.face = face('smug', { eyes: t > at('1-04', 0.8) ? 'side' : 'narrow', look: [t > at('1-04', 0.8) ? 1 : 0, 0.2], socket: 0.3 });
  },
  // ---- the wave: every head turns (on twos) to the card, head end first; Google's crown goes red (code red)
  '1-05': (t, st, w) => {
    M1(w.camera, 0.78);
    const u = (t - at('1-05')) / 2.6;
    for (const k of KINGS) {
      const delay = (SEAT.Z[k.seat] + 2.6) / 5.2 * 0.6;
      const lk = ease(u, delay, delay + 0.25);
      st.kings[k.id].look = lerp3(off(k.id, -SIDE_SIGN[k.side] * 3.2, 0.95, 0), [0.02, 0, 0.04], lk);
      st.kings[k.id].face = face(k.id === 'deepseek' ? 'smug' : k.id === 'google' ? 'worry' : 'calm', { socket: 0.32 });
    }
    st.kings.google.crownGlow = 0.6 + 0.4 * Math.sin(t * 12) * Math.sin(t * 12);
    st.kings.openai.face = face('smug', { socket: 0.32 });
  },
  // ---- DeepSeek narrows his eyes
  '1-06': (t, st, w) => {
    const h = kf('deepseek', 0, 0.98, 0);
    camLook(w.camera, kf('deepseek', 0.78, 0.98, 0.08), h, 28);
    st.kings.deepseek.look = [0.02, 0, 0.04];
    st.kings.deepseek.face = face(t > at('1-06', 0.45) ? 'smug' : 'calm', { eyes: t > at('1-06', 0.45) ? 'narrow' : 'open', socket: 0.3 });
    st.kings.google.crownGlow = 0.5;
  },
  // ---- the throne between the two locked cases, backlit; one half-grin in each; the title
  '1-07': (t, st, w) => {
    const u = (t - at('1-07')) / 4;
    camLook(w.camera, [0, 0.82 - 0.04 * u, -0.45 - 0.2 * u], [0, 0.7, -4.1], 42);
    st.titles = { zh: '王炸', en: 'JOKERS WILD', alpha: ease(t, at('1-07', 0.5), at('1-07', 1.3)) * (1 - ease(t, at('1-07', 3.4), at('1-07', 3.95))), y: 0.42 };
    st.look.exposure = 0.95;
  },
};
void end; void sx; void smooth; void FIRST; void lerp;
