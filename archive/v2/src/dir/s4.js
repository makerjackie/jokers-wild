// Sequences 4-5 — 卡脖子 / 拆锁 (1:02–1:42): beaten, OpenAI looks at his box; the US giant opens its eyes; the first
// lock comes off and gold runs into his press. The giant slams a seal onto the chip bridge (禁运). The giant o1, the tiny
// R1, the avalanche, the kiln. Then the lock race: you take one off, I take one off, faster; the boxes plastered with 安全 ✓.
import { KINGS, KING, SEAT, SIDE_SIGN, BOXES, BOX, GIANTS } from '../layout.js';
import { CUES } from '../shots.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, camPath, M1, kf, face, keys } from './core.js';
import { O1, R1, V3, RACE5 } from './throws.js';
import { LOCKS, locksGone, sizeAt } from './story.js';
import { hd, pileCam, pressPt } from './s1.js';

// the lock close-up: low from the sea, the padlocks in front, the head king's hand coming in, his mask behind
// the same frame for every lock, so the row can be counted down: square on to the sea face where the padlocks hang,
// low, the table in front where the opened ones fall and pile up, the head king looming behind the box
export function lockCam(cam, side, t, row, tight = 0) {
  const b = BOXES[side], s = SIDE_SIGN[side], u = uRow(t, row);
  camLook(cam, [b[0] - s * (0.78 - 0.1 * tight - 0.04 * u), 0.3, b[2] + 0.06], [b[0] - s * 0.05, 0.2 + 0.02 * u, b[2]], 46 - 5 * tight);
}
function lockLight(st, side) { const b = BOXES[side], s = SIDE_SIGN[side]; st.look.p3 = { pos: [b[0] - s * 0.45, 0.6, b[2] + 0.35], col: [1.1, 0.95, 0.75], range: 1.6 }; }

export const RANGE = [at('4-01'), at('6-01')];
export function apply(t, st, w) {
  // the head kings stare at each other between the beats; everyone sweats more
  for (const side of ['CN', 'US']) {
    for (const ts of LOCKS[side].slice(0, 3)) if (t > ts - 1.4 && t < ts + 0.6) {
      // the other side sees it happen
      const other = side === 'US' ? 'deepseek' : 'openai';
      st.kings[other].look = [BOXES[side][0], 0.3, BOXES[side][2]];
      st.kings[other].face = face('glare', { mouth: 'grit', socket: 0.3 });
    }
  }
}

export const SHOTS = {
  '4-01': (t, st, w) => pileCam(w.camera, 4.7, t),
  // ---- OpenAI, beaten, swollen, sweating; his eyes slide to the box; high behind him two cold blue eyes open
  '4-02': (t, st, w) => {
    // his face (eyes sliding to the box), then the camera tilts up and over to the two blue eyes opening behind him
    const h = hd('openai', t), u = uRow(t, '4-02');
    const E = w.set?.giantEyes ? w.set.giantEyes('US', new (w.camera.position.constructor)(), st.set.giants.US, t).toArray() : [3.7, 4.0, 0.4];
    camLook(w.camera, [0.3, 0.72, -2.45], lerp3([h[0], h[1] - 0.05, h[2]], E, smooth(clamp((u - 0.42) / 0.5, 0, 1))), lerp(36, 50, smooth(clamp((u - 0.42) / 0.5, 0, 1))));
    st.kings.openai.look = u < 0.45 ? [0, 0.1, 0] : [BOXES.US[0], 0.3, BOXES.US[2]];
    st.kings.openai.face = face(u < 0.45 ? 'sour' : 'narrow', { eyes: u < 0.45 ? 'down' : 'side', mouth: 'grit', look: [u < 0.45 ? 0 : 1, -0.2], socket: 0.3 });
    st.look.exposure = 1.3;
  },
  // ---- the first lock: key, turn, the padlock springs and drops; the gold runs along the cloth into his press;
  //      Claude's palm slaps a 安全 ✓ beside the empty hasp
  '4-03': (t, st, w) => { lockCam(w.camera, 'US', t, '4-03'); lockLight(st, 'US'); st.kings.anthropic.face = face('proud', { socket: 0.3 }); },
  // ---- reverse, from the head: the dispenser pours chips down two chutes, one across the sea; the giant stands, a seal on its chain
  '4-04': (t, st, w) => {
    const u = uRow(t, '4-04'); camLook(w.camera, [-0.6, 2.2 - 0.2 * u, -3.9], [1.1, 1.3 + 0.5 * u, 2.4], 56); st.look.exposure = 1.45;
    st.look.p3 = { pos: [1.4, 1.2, 3.2], col: [1.3, 1.15, 0.9], range: 3.2 };                 // the dispenser and the chip bridge
    st.look.p2 = { pos: [2.4, 3.6, 0.0], col: [0.55, 0.7, 1.2], range: 4.0 };                 // a cold edge on the giant
  },
  // ---- the seal slams the bridge: 禁运 EMBARGO
  '4-05': (t, st, w) => { camLook(w.camera, [-1.0, 0.7, 1.75], [0.15, 0.35, 2.95], 46); st.look.exposure = 1.35; },
  // ---- the CN side: the chips run low; DeepSeek and Qwen look at their empty hands; red eyes open behind them
  '4-06': (t, st, w) => {
    camLook(w.camera, [0.95, 0.85, -0.25], [-2.2, 1.75, -1.35], 54);
    for (const id of ['deepseek', 'qwen']) { st.kings[id].look = kf(id, 0.45, 0.25, 0); st.kings[id].face = face('worry', { eyes: 'down', mouth: 'frown', socket: 0.3 }); }
    st.look.exposure = 1.35;
  },
  // ---- the giant o1: out of the press and out of it, held high, the US kings lean back (the camera circles)
  '4-07': (t, st, w) => {
    const T = at('4-07'), id = 'openai', s = sizeAt(t, id);
    camPath(w.camera, t, [
      [T, kf(id, 1.35, 0.4, -0.9), kf(id, 0.4, 0.7 * s, 0.0), 44],
      [T + 2.5, kf(id, 1.75, 0.25, -0.35), kf(id, 0.3, 1.4 * s, 0.0), 52],
      [T + 4.4, kf(id, 1.65, 0.3, 0.05), kf(id, 0.2, 1.5 * s, 0.0), 54],
    ]);
    if (t > O1.grab) { st.kings.openai.face = face('proud', { mouth: 'laugh', socket: 0.3 }); st.kings.openai.look = kf(id, 0.3, 1.8, 0); }
    if (t > O1.grab + 0.6) for (const k of ['anthropic', 'google', 'xai', 'meta']) { st.kings[k].lean = -0.15; st.kings[k].face = face('smug', { socket: 0.3 }); st.kings[k].look = kf('openai', 0.2, 1.6, 0); }
    st.look.exposure = 1.3;
    // the giant card reads in the lamp: a little gold of its own
    st.look.p3 = { pos: kf(id, 0.9, 1.7, 0.4), col: [1.3, 1.05, 0.6], range: 2.4 };
  },
  // ---- the CN box: DeepSeek takes his first lock off too; Qwen's 安全 ✓
  '4-08': (t, st, w) => { lockCam(w.camera, 'CN', t, '4-08'); lockLight(st, 'CN'); st.kings.deepseek.face = face('narrow', { mouth: 'grit', socket: 0.3 }); },
  // ---- a handful of chips, a little card, flicked
  '4-09': (t, st, w) => {
    const id = 'deepseek', h = hd(id, t);
    camLook(w.camera, kf(id, 1.3, 0.38, -0.8), [h[0] - SIDE_SIGN.CN * 0.25, h[1] - 0.25, h[2] + 0.05], 42);
    st.kings.deepseek.face = face(t < R1.t ? 'narrow' : 'smug', { socket: 0.3 });
    st.kings.deepseek.look = t < R1.t ? [0, 0.4, 0] : [0, 0.1, 0];
  },
  // ---- the little card lands on the giant: R1, 97; the giant caves in
  // three-quarter low on the impact: the little card lands on the giant one, and the giant one folds up round it
  '4-10': (t, st, w) => { const u = uRow(t, '4-10'); camLook(w.camera, [0.05, 0.62 + 0.25 * u, 1.05 + 0.3 * u], [0.03, 0.18, 0.0], 44); st.look.exposure = 1.45; st.look.p3 = { pos: [0.2, 0.9, 0.8], col: [1.0, 0.9, 0.7], range: 2.5 }; },
  // ---- the chip tower by the dispenser topples into an avalanche; the green eye blinks
  '4-11': (t, st, w) => { const u = uRow(t, '4-11'); camLook(w.camera, [0.3, 1.9, 0.9 + 0.3 * u], [2.6, 0.6 + 0.4 * (1 - u), 3.1], 54); st.look.exposure = 1.45; st.look.p3 = { pos: [1.6, 2.2, 2.2], col: [1.5, 1.3, 1.0], range: 4.5 }; },
  // ---- the red giant's eyes flare; a brick kiln roars up at the CN foot; red chips stack; symmetric again
  '4-12': (t, st, w) => { const u = uRow(t, '4-12'); camLook(w.camera, [-0.55, 0.5 + 0.6 * u, 5.0], [-2.05, -0.2 + 1.2 * u, 3.5 - 0.8 * u], 54);
    if (t > CUES.kiln + 0.4) st.look.p3 = { pos: [-1.6, -0.25, 3.35], col: [2.4, 0.8, 0.25].map((c) => c * ease(t, CUES.kiln + 0.4, CUES.kiln + 1.0) * (0.85 + 0.15 * Math.sin(t * 7.1))), range: 3.4 }; st.look.exposure = 1.4; for (const k of KINGS) if (k.side === 'CN') st.kings[k.id].face = face('proud', { socket: 0.3 }); },
  // ---- seq 5: the lock race (close-ups get tighter, the top-down cards bigger)
  '5-01': (t, st, w) => { lockCam(w.camera, 'US', t, '5-01', 0.3); lockLight(st, 'US'); },
  '5-03': (t, st, w) => { lockCam(w.camera, 'CN', t, '5-03', 0.3); lockLight(st, 'CN'); },
  '5-05': (t, st, w) => { lockCam(w.camera, 'US', t, '5-05', 0.6); lockLight(st, 'US'); },
  '5-07': (t, st, w) => { lockCam(w.camera, 'CN', t, '5-07', 0.6); lockLight(st, 'CN'); },
  // ---- M1: two locks left each, the boxes plastered; the gold veins pulse; the giants lean in
  '5-09': (t, st, w) => { const u = smooth(uRow(t, '5-09')); camLook(w.camera, [0, 1.75 - 0.25 * u, 1.4 - 0.5 * u], [0, 0.35, -2.2], 50); st.look.exposure = 1.4; },
  // ---- the board: the dates race, the multiplier doubles
  '5-10': (t, st, w) => camLook(w.camera, [0, 5.25, -1.8], [0, 5.3, -4.9], 36),
};
for (const [row] of RACE5) { const next = row.replace(/-(\d+)$/, (m, n) => '-' + String(+n + 1).padStart(2, '0')); SHOTS[next] = (t, st, w) => pileCam(w.camera, 5.0, t); }
void KING; void SEAT; void BOX; void GIANTS; void lerp; void smooth; void clamp; void keys; void end; void V3; void locksGone; void pressPt; void CUES;
