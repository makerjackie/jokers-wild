// Sequence 4 — 使绊子 (1:21–1:36): Meta's rod poaches a card-maker for $100M; Llama 4's make-up wiped (#1 -> #32);
// the price war goes negative; Kimi's bomb of four Claude photocopies; the pointing ladder; everyone carries the same
// sack (Claude's leaks books); a montage down to three frames; a dead stop on a paper face.
import { KINGS, KING, SEAT, SIDE_SIGN, makerPos } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, kf, off, face, sx, keys } from './core.js';
import { LLAMA, BOMB, pileTop } from './throws.js';

// who points at whom (4-05 .. 4-12), and from when
const POINT = [
  ['anthropic', 'kimi', at('4-05', 0.15)],
  ...['deepseek', 'qwen', 'kimi', 'glm', 'doubao'].map((id) => [id, 'anthropic', at('4-06', 0.08)]),
  ['xai', 'anthropic', at('4-07', 0.1)],
  ['openai', 'deepseek', at('4-08', 0.06)],
  ['glm', 'qwen', at('4-10', 0.02)], ['qwen', 'glm', at('4-10', 0.02)],
  ['google', 'openai', at('4-11', 0.1)], ['meta', 'google', at('4-11', 0.15)], ['doubao', 'openai', at('4-11', 0.2)],
];
const PRICES = ['¥1.00', '¥0.10', '¥0.01', '¥0', '¥-0.50', '¥-5.00'];

export const RANGE = [at('4-01'), at('5-01')];
export function apply(t, st, w) {
  // ---- 4-01: the rod from Meta's crown; the bag over OpenAI's card-maker; he looks up, hugs it, is reeled away
  const r0 = at('4-01');
  if (t < end('4-01') + 0.3) {
    st.props.rod = { show: 1, ext: ease(t, r0, r0 + 0.75), reel: ease(t, r0 + 1.3, r0 + 1.9), to: [makerPos('openai')[0], 0.42, makerPos('openai')[2]] };
    const m = { show: 1, look: t > r0 + 0.8 ? 0.15 : 0, pose: { head: t > r0 + 0.8 && t < r0 + 1.25 ? 0.35 : 0, armL: t > r0 + 1.15 ? 2.2 : 0.06, armR: t > r0 + 1.15 ? 2.0 : -0.04 } };
    if (t > r0 + 1.25) m.reel = ease(t, r0 + 1.25, r0 + 1.4);
    st.props.makers = { openai: m };
    st.kings.meta.face = face('smug', { socket: 0.3 }); st.kings.meta.look = makerPos('openai');
    st.kings.openai.look = makerPos('openai'); if (t > r0 + 1.3) st.kings.openai.face = face('shock', { socket: 0.3 });
  } else st.props.makers = { openai: { show: 0 } };              // he works for Meta now (off the table)
  // ---- 4-02: the brush wipes Llama's make-up
  const [w0, w1] = LLAMA.wipe;
  if (t > w0 - 0.4 && t < w1 + 0.4) st.props.brush = { show: 1, at: [0, pileTop(LLAMA.t + LLAMA.flight) + 0.004, 0], u: ease(t, w0 - 0.05, w1 + 0.05) };
  // ---- 4-03: the price war (Qwen vs Doubao): each king's split-flap price tag stands on the table in front of him;
  // Qwen undercuts, the camera whips down the row to Doubao, who goes to zero and below
  if (t > at('4-03') - 0.2 && t < at('4-04', 0.3)) {
    const t0 = at('4-03');
    const flipQ = clamp((t - (t0 + 0.12)) / 0.3, 0, 1);
    const step = t < t0 + 0.72 ? 0 : t < t0 + 0.92 ? 1 : t < t0 + 1.1 ? 2 : 3;
    const D = ['¥0.10', '¥0.01', '¥0', '¥-0.50'], dT = [t0, t0 + 0.72, t0 + 0.92, t0 + 1.1][step];
    st.props.tags = {
      qwen: { show: 1, prev: '¥1.00', text: '¥0.10', flip: flipQ },
      doubao: { show: 1, prev: D[Math.max(0, step - 1)], text: D[step], flip: step === 0 ? 1 : clamp((t - dT) / 0.17, 0, 1) },
    };
    for (const id of ['qwen', 'doubao']) { st.kings[id].face = face('angry', { socket: 0.3 }); st.kings[id].lean = 0.12; }
    // each glares at his own tag as it drops (the rival's undercut is heard, not watched)
    for (const id of ['qwen', 'doubao']) st.kings[id].look = [-0.98, 0.15, SEAT.Z[KING[id].seat] + 0.08];
  }
  // ---- the pointing
  for (const [who, at_, t0] of POINT) {
    if (t < t0 || t > end('4-12')) continue;
    const s = st.kings[who];
    const tgt = kf(at_, 0, 0.95, 0);
    const k = KING[who], along = k.side === 'US' ? 1 : -1;
    // reach out with the hand nearer the target, arm straight toward him
    const sideHand = (tgt[2] - SEAT.Z[k.seat]) * along > 0 ? 'L' : 'R';
    const sh = kf(who, 0.05, 0.75, (sideHand === 'L' ? along : -along) * 0.22);
    const d = [tgt[0] - sh[0], tgt[1] - sh[1], tgt[2] - sh[2]], n = Math.hypot(...d);
    const jab = 1 + 0.06 * Math.sin((t - t0) * 9) * Math.exp(-(t - t0) * 2.5);
    s['arm' + sideHand] = { target: [sh[0] + d[0] / n * 0.7 * jab, sh[1] + d[1] / n * 0.7 * jab, sh[2] + d[2] / n * 0.7 * jab] };
    s.hand = { ...(s.hand ?? {}), [sideHand]: 'point' };
    s.look = tgt; s.lean = 0.22 * ease(t, t0, t0 + 0.15);
    s.face = face('shout', { socket: 0.32 });
  }
  // ---- the sacks: there all along behind the chairs, revealed by the pull-back; Claude's leaks books
  if (t > at('4-11') - 0.1 && t < at('5-01')) {
    const sacks = {};
    for (const k of KINGS) sacks[k.id] = { show: 1, leak: k.id === 'anthropic' ? ease(t, at('4-11', 0.3), at('4-13')) : 0 };
    st.props.sacks = sacks;
  }
  // ---- Doubao's crib sheet slides out of his sleeve as he puffs his chest
  if (t > at('4-09') && t < at('5-01')) {
    const hs = kf('doubao', 0.35, 0.55, 0.25), fl = [hs[0] + 0.25, 0.004, hs[2] + 0.1];
    st.cards.keyed.push({ cell: CELL.cheat, back: CELL.cheat, scale: 0.55, keys: [[at('4-09', 0.05), hs, [0, Math.PI / 2, 0]], [at('4-09', 0.3), [hs[0] + 0.1, 0.25, hs[2] + 0.05], [-0.9, Math.PI / 2 + 0.4, 0.3]], [at('4-10'), fl, [-Math.PI / 2, 1.9, 0]]] });
    if (t < at('4-10')) { st.kings.doubao.lean = -0.18; st.kings.doubao.face = face('proud', { socket: 0.28 }); }
  }
  // ---- the bomb (4-04): a flash of dust, the kings duck
  if (t > BOMB.blast && t < BOMB.blast + 0.25) st.look.flash = 0.3 * (1 - (t - BOMB.blast) / 0.25);
  if (t > BOMB.blast && t < at('4-05')) for (const k of KINGS) if (k.id !== 'kimi') { st.kings[k.id].face = face('shock', { socket: 0.3 }); st.kings[k.id].lean = -0.1; }
  if (t > at('4-04') - 0.3 && t < BOMB.blast + 0.6) { st.kings.kimi.face = face(t < BOMB.blast ? 'smug' : 'laugh', { socket: 0.3 }); }
}

// the montage (4-12): eight cuts, 0.22 s down to 0.1 s
function montage(t, st, w, i) {
  const cam = w.camera;
  const h = (id, f, u, s) => kf(id, f, u, s);
  switch (i) {
    case 1: camLook(cam, h('anthropic', 1.25, 0.95, 0.55), h('anthropic', 0.95, 0.88, 0.25), 24); break;     // Claude's finger
    case 2: camLook(cam, h('anthropic', -0.2, 1.4, 0.9), h('anthropic', -0.35, 0.55, 0), 34); break;       // his sack, books falling
    case 3: camLook(cam, [0.0, 5.0, -0.85], [0.0, 5.3, -4.9], 26); break;                                  // the board
    case 4: camLook(cam, h('xai', 0.6, 1.25, 0.35), h('xai', 0, 1.25, 0), 22); break;                      // a crown
    case 5: camLook(cam, h('google', 0.55, 1.2, -0.3), h('google', 0, 1.2, 0), 22); break;                                     // the photocopies, scattered
    case 6: camLook(cam, h('kimi', 1.0, 0.85, -0.35), h('kimi', 0.5, 0.8, -0.1), 26); break;               // Kimi's finger
    case 7: camLook(cam, h('meta', -0.2, 1.4, -0.9), h('meta', -0.35, 0.55, 0), 34); break;                // Meta's sack
    default: camLook(cam, h('openai', 1.0, 0.85, 0.4), h('openai', 0.5, 0.8, 0.1), 24);                     // OpenAI's finger
  }
  void st;
}

export const SHOTS = {
  // ---- from the head end: the $100M bag comes down the US side on Meta's absurdly long rod; the card-maker looks up,
  // hugs it and is yanked out of frame toward the foot
  '4-01': (t, st, w) => { const m = makerPos('openai'); camLook(w.camera, [m[0] - 0.42, 0.5, m[2] - 1.0], [m[0] + 0.05, 0.36, m[2] + 0.45], 48); st.look.p3 = { pos: [m[0] - 0.3, 0.75, m[2] - 0.3], col: [1.5, 1.25, 0.7], range: 1.6 }; },
  '4-02': (t, st, w) => { const y = pileTop(LLAMA.t + LLAMA.flight); camLook(w.camera, [0, y + 1.05, 0.02], [0, y, 0], 25); },
  // ---- the price war: on Qwen's tag, whip down the row to Doubao's
  '4-03': (t, st, w) => {
    const u = clamp((t - at('4-03', 0.5)) / 0.24, 0, 1), e = u * u * (3 - 2 * u);
    const zq = SEAT.Z[KING.qwen.seat] + 0.08, zd = SEAT.Z[KING.doubao.seat] + 0.08;
    camLook(w.camera, [-0.12, 0.42, lerp(zq, zd, e) + 0.18], [-1.05, 0.36, lerp(zq, zd, e)], 40);
  },
  '4-04': (t, st, w) => camLook(w.camera, [0.8, 0.55, 1.05], [-0.55, 0.35, -0.15], 50),
  '4-05': (t, st, w) => camLook(w.camera, kf('anthropic', 1.35, 0.55, 0.85), kf('anthropic', 0.3, 0.95, -0.1), 42),
  '4-06': (t, st, w) => camLook(w.camera, [-0.55, 0.95, 3.6], [-1.35, 0.7, -0.6], 46),
  '4-07': (t, st, w) => camLook(w.camera, kf('xai', 1.25, 0.6, 0.9), kf('xai', 0.2, 0.92, -0.15), 42),
  '4-08': (t, st, w) => camLook(w.camera, kf('openai', 1.25, 0.6, 0.9), kf('openai', 0.25, 0.92, -0.15), 42),
  '4-09': (t, st, w) => camLook(w.camera, kf('doubao', 0.95, 0.62, 0.45), kf('doubao', 0.25, 0.6, 0.12), 34),
  '4-10': (t, st, w) => camLook(w.camera, [-0.45, 1.0, 2.2], [-1.45, 0.72, -0.8], 50),
  // ---- pull back high: everyone pointing at everyone, every one of them carrying the same sack
  '4-11': (t, st, w) => { const u = smooth(uRow(t, '4-11')); camLook(w.camera, lerp3([0, 2.3, 1.6], [0, 3.6, 4.6], u), [0, 0.45, -0.6], lerp(48, 52, u)); },
  '4-12': (t, st, w, shot) => montage(t, st, w, +shot.id.split('.')[1]),
  // ---- dead stop: a card-maker's paper face (DeepSeek's), still
  '4-13': (t, st, w) => { const m = makerPos('qwen'); camLook(w.camera, [m[0] - 0.012, 0.183, m[2] + 0.2], [m[0] - 0.012, 0.183, m[2]], 20); },
};
void SIDE_SIGN; void sx; void off; void keys; void lerp;
