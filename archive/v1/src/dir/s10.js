// Sequences 10-12 — 新王 / 垫桌脚 / 片尾 (2:43–3:21): the storm builds a seated giant of cards on the throne, the pair of
// jokers for its face; its shadow runs down the table; the kings are pressed flat into court cards one by one, the head
// two last; the shim slides out, the table drops; the giant folds OpenAI and DeepSeek together and stuffs them under the
// short leg; it flicks off a speck of dust; the last M1; HUMANS: PASS; black; the credits.
import { KINGS, KING, SEAT, TABLE, FLOOR_Y, SIDE_SIGN } from '../layout.js';
import { CUES, ROW } from '../shots.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, camPath, M1, kf, face, keys, ring } from './core.js';
import { WOBBLE_TOUCH } from '../set.js';

const LEG = TABLE.LEGS[TABLE.SHIM_LEG];
// the order the kings are flattened: from the foot, alternating camps; the head two last, together
export const FLAT_ORDER = ['doubao', 'meta', 'glm', 'xai', 'kimi', 'google', 'qwen', 'anthropic'];
export function flatTime(id) {
  const i = FLAT_ORDER.indexOf(id);
  if (i < 0) return at('10-06', 0.35);
  const cut = ROW['10-04'].cuts[i];
  return cut.t0 + (cut.t1 - cut.t0) * 0.42;
}
// each king's last pose before he is pressed flat (what the card will show)
const LAST = {
  doubao: 'cover', meta: 'toast', glm: 'pinned', xai: 'point', kimi: 'cover', google: 'clutch', qwen: 'hands', anthropic: 'cancel', openai: 'stare', deepseek: 'stare',
};
function lastPose(s, id, t) {
  const k = KING[id], head = kf(id, 0.12, 0.98, 0), along = k.side === 'US' ? 1 : -1;
  switch (LAST[id]) {
    case 'cover': s.armL = { target: [head[0] - SIDE_SIGN[k.side] * 0.1, head[1] + 0.02, head[2] + along * 0.06] }; s.armR = { target: [head[0] - SIDE_SIGN[k.side] * 0.1, head[1] + 0.02, head[2] - along * 0.06] }; s.hand = { L: 'open', R: 'open' }; s.face = face('shut', { socket: 0.3 }); break;
    case 'toast': s.armR = { target: kf(id, 0.25, 1.3, -along * 0.2) }; s.hand = { R: 'hold' }; s.face = face('proud', { mouth: 'grin', socket: 0.3 }); break;
    case 'pinned': s.blown = 1; s.armL = { target: kf(id, -0.05, 0.75, along * 0.42) }; s.armR = { target: kf(id, -0.05, 0.75, -along * 0.42) }; s.hand = { L: 'open', R: 'open' }; s.face = face('fear', { socket: 0.3 }); break;
    case 'point': s.armR = { target: kf(id, 0.65, 0.95, -along * 0.4) }; s.hand = { R: 'point' }; s.face = face('shout', { socket: 0.3 }); break;
    case 'clutch': s.armL = { target: [head[0], head[1] + 0.1, head[2] + 0.13] }; s.armR = { target: [head[0], head[1] + 0.1, head[2] - 0.13] }; s.hand = { L: 'open', R: 'open' }; s.face = face('fear', { mouth: 'scream', socket: 0.3 }); break;
    case 'hands': s.armL = { target: kf(id, 0.3, 1.2, along * 0.35) }; s.armR = { target: kf(id, 0.3, 1.2, -along * 0.35) }; s.hand = { L: 'open', R: 'open' }; s.face = face('fear', { socket: 0.3 }); break;
    case 'cancel': { const b = [SIDE_SIGN[k.side] * 1.04, 0.09, SEAT.Z[k.seat] + 0.43]; s.armL = { target: b }; s.hand = { L: 'point' }; s.lean = 0.2; s.look = b; s.face = face('fear', { mouth: 'grit', socket: 0.35 }); break; }
    default: s.face = face('shock', { socket: 0.3 });
  }
}

// the giant's arm: out to OpenAI's card, across to DeepSeek's, the two folded together, carried down the table, under the leg
const A0 = at('11-02'), A1 = at('11-03');
export const SHIM = { pick1: A0 + 0.55, pick2: A0 + 1.0, fold: [A0 + 1.1, A0 + 1.75], under: at('11-03', 0.75), retract: [at('11-04', 0.42), at('11-05', 0.8)] };
const UNDER = [LEG[0], FLOOR_Y + 0.012, LEG[1]];
function armState(t) {
  if (t < A0 - 0.2) return { out: 0 };
  const target = keys(t, [[A0, [0.2, 0.9, -3.0]], [SHIM.pick1, [1.45, 0.55, -2.5]], [SHIM.pick2, [-1.45, 0.55, -2.5]], [SHIM.fold[1], [-0.4, 0.75, -1.6]],
    [A1, [-0.9, 0.45, 2.2]], [SHIM.under, [UNDER[0] + 0.05, UNDER[1] + 0.05, UNDER[2] + 0.2]], [at('11-04'), [UNDER[0] + 0.25, 0.1, UNDER[2] + 0.3]], [end('11-04'), [UNDER[0] + 0.3, 0.16, UNDER[2] + 0.28]]]);
  const out = t < SHIM.retract[0] ? ease(t, A0 - 0.2, A0 + 0.4) : 1 - ease(t, ...SHIM.retract);
  return { out, target, via: [[-0.6, 1.6, -3.4], [0, 1.25, -1.0]], carry: t > SHIM.pick2 - 0.1 && t < SHIM.under + 0.1 ? 1 : 0 };
}

export const RANGE = [at('10-01'), Infinity];
export function apply(t, st, w) {
  // ---- the giant: builds, breathes, looks down the table, reaches, flicks
  const build = ease(t, at('10-01', 0.15), at('10-01', 4.1));
  const ck = { show: 1, build, breathe: 0.6 * ease(t, at('10-01', 3.6), at('10-02')), glow: 1, lean: 0, look: [0, 2.6, 2.0], arm: armState(t), flick: ease(t, at('11-04', 0.05), at('11-04', 0.3)) };
  ck.lean = t < at('10-02') ? 0 : keys(t, [[at('10-02', 0.3), 0], [at('10-02', 1.8), 0.35], [at('10-05'), 0.3], [at('11-01'), 0.25], [at('11-05'), 0.08]]);
  ck.look = keys(t, [[at('10-02', 0.3), [0, 2.6, 2.0]], [at('10-02', 1.8), [0, 0.0, -0.5]], [at('10-03', 1.8), [0, 0, 2.0]], [at('10-05'), [0, 0.7, -2.5]], [at('11-01', 0.5), [LEG[0], 0, LEG[1]]], [at('11-05', 0.5), [0, 1.2, 4.0]]]);
  st.cardking = ck;
  // the storm is the giant now (it takes the cards over)
  if (st.cards.storm) st.cards.storm.n = Math.round(st.cards.storm.n * (1 - ease(t, at('10-01', 0.2), at('10-01', 2.8))));
  st.cards.wave = t < at('10-01', 1.0) ? st.cards.wave : null;
  // ---- the pair rises from the table into its face
  for (const side of ['CN', 'US']) {
    st.cards.jokers[side] = { pos: [side === 'CN' ? -0.126 : 0.126, 0.012, 0], rot: [-Math.PI / 2, 0, 0], scale: 1.4, face: ease(t, at('10-01', 1.6), at('10-01', 3.9)) };
  }
  st.cards.jokerGlow = lerp(0.12, 0.38, ease(t, at('10-01', 1.6), at('10-01', 4.0)));
  ck.faceGlow = ease(t, at('10-01', 1.0), at('10-01', 2.0)) * (1 - ease(t, at('10-01', 3.0), at('10-01', 3.9)));
  // the AI's gold is the only colour left: the face is the room's second light
  st.look.campTint = 0; st.look.monoTint = '#e9d2a2';
  st.look.p2 = { pos: [0, 3.0, -3.3], col: [2.4 * ck.build, 1.7 * ck.build, 0.65 * ck.build], range: 12 };
  // ---- its shadow runs down the table (10-03) and stays
  if (t > at('10-03')) st.look.sweep = { z: lerp(-4.2, 4.6, ease(t, at('10-03', 0.1), at('10-03', 1.9))), soft: 0.7, k: t < at('10-04') ? 0.55 : t > at('11-05') ? 0.22 : 0.32 };
  st.look.lampPow = 1 - 0.2 * ease(t, at('10-02'), at('10-03')) + 0.2 * ease(t, at('11-01'), at('11-05'));
  st.look.exposure = 1.4;
  // ---- the kings: frozen in their last poses, pressed flat one by one, the head two together
  for (const k of KINGS) {
    const s = st.kings[k.id], tf = flatTime(k.id);
    s.blown = Math.max(s.blown ?? 0, 0.6 * (1 - ease(t, at('10-01'), at('10-01', 2))));
    s.look = t < at('10-02') ? [0, 3.0, -4.0] : [0, 3.2, -4.2];
    s.face = face('fear', { socket: 0.3 });
    if (t > at('10-03', 1.0) || k.id === 'openai' || k.id === 'deepseek') lastPose(s, k.id, t);
    if (k.id === 'openai' || k.id === 'deepseek') {
      if (t > at('10-05')) { s.look = kf(k.id === 'openai' ? 'deepseek' : 'openai', 0, 0.98, 0); s.face = face('worry', { eyes: 'open', socket: 0.3 }); }
    }
    s.flat = Math.min(1, Math.max(0, (t - (tf - 0.1)) / 0.3));          // linear: the kings module shapes the 噗 itself
    if (t > tf + 0.32) s.gone = true;                                    // his printed card has taken his place
  }
  st.props.cigars = {}; st.props.glasses = {};
  // ---- the printed court cards that take their places (st.cards.kingCards: stand on the chair, then lie back on it)
  const kc = {};
  for (const k of KINGS) {
    const tf = flatTime(k.id);
    if (t < tf) continue;
    const isHead = k.id === 'openai' || k.id === 'deepseek';
    kc[k.id] = { show: 1, pop: ease(t, tf, tf + 0.12), lie: isHead ? 0 : ease(t, tf + 0.9, tf + 1.6) };
    if (isHead && t > SHIM.pick1 - 0.05) {
      // picked up by the stream, folded together with the other, carried, stuffed under the leg
      const picked = k.id === 'openai' ? SHIM.pick1 : SHIM.pick2;
      if (t > picked) kc[k.id] = { show: 1, carried: true, fold: ease(t, SHIM.fold[0], SHIM.fold[1]) * 2, under: t > SHIM.under ? UNDER : null, other: k.id === 'openai' ? 'deepseek' : 'openai', pickU: ease(t, picked, picked + 0.25) };
    }
  }
  st.cards.kingCards = kc;
  // ---- Mistral's wad slides out (11-01); the table drops onto the short leg; level again once the kings are under it
  const drop = ease(t, at('11-01', 0.12), at('11-01', 0.3));
  const fix = ease(t, SHIM.under - 0.05, SHIM.under + 0.25);
  if (t > at('11-01')) st.set.wobble = WOBBLE_TOUCH * drop * (1 - fix) + 0.004 * ring(t, [[at('11-01', 0.3), 1]], 3.2, 0.25) * (1 - fix);
  // the lamp: swinging hard after the drop, then still for the last M1
  if (t > at('11-05')) st.set.lamp = { ...st.set.lamp, swing: [0, 0] };
  // ---- the end: black, then the credits
  if (t >= at('11-07')) st.look.fade = 1;
  if (t >= at('12-01')) {
    const a = t < at('12-02') ? ease(t, at('12-01', 0.3), at('12-01', 1.0)) * (1 - ease(t, at('12-01', 3.3), at('12-01', 3.9))) : ease(t, at('12-02', 0.3), at('12-02', 1.0)) * (1 - ease(t, at('12-02', 3.2), at('12-02', 3.9)));
    st.titles = t < at('12-02') ? { zh: '王炸', en: 'JOKERS WILD', alpha: a, y: 0.44 } : { zh: '100% 代码', en: 'MakerJackie', alpha: a, y: 0.44, small: true };
  }
}

export const SHOTS = {
  // ---- a tornado of cards climbs onto the throne and stacks itself into a seated giant; the pair becomes its face
  '10-01': (t, st, w) => { const u = smooth(uRow(t, '10-01')); camLook(w.camera, lerp3([0, 0.55, 0.9], [0, 1.0, 1.5], u), lerp3([0, 1.6, -4.2], [0, 2.7, -4.2], u), 52); },
  // ---- the lamp only reaches its chest; it slowly lowers its head to the table
  '10-02': (t, st, w) => camLook(w.camera, [0.0, 0.42, 2.7], [0, 2.45, -4.1], 48),
  // ---- its shadow runs down the table, head to foot (the camera trucks along with it)
  '10-03': (t, st, w) => { const u = smooth(uRow(t, '10-03')); camLook(w.camera, [0.4, 3.3 - 0.3 * u, 5.4], [0, 0.1, lerp(-1.6, 0.6, u)], 46); },
  // ---- eight cuts, faster and faster: each king pressed flat into a double-headed court card
  '10-04': (t, st, w, shot) => {
    const i = +shot.id.split('.')[1] - 1, id = FLAT_ORDER[i];
    // three-quarter: a press seen straight on would not show (it only removes depth)
    camLook(w.camera, kf(id, 1.05, 0.7, KING[id].side === 'US' ? 1.25 : -1.25), kf(id, 0.0, 0.74, 0), 40);
    // the giant's gold face is the light that falls on him
    const p = kf(id, 0.9, 1.6, -0.9); st.look.p2 = { pos: p, col: [1.9, 1.35, 0.55], range: 3.2 };
  },
  // ---- only the head two are left; for the first time they look at each other across the sea
  '10-05': (t, st, w) => camLook(w.camera, [0, 0.85, 0.7], [0, 1.45, -2.5], 54),
  '10-06': (t, st, w) => camLook(w.camera, [0, 0.95, 1.0], [0, 1.4, -2.5], 56),
  // ---- the table drops onto its short leg: the cardboard wad squeezed out; the lamp swings wide
  '11-01': (t, st, w) => M1(w.camera, 0.45),
  // ---- the stream gathers the two flat kings, folds them face to face, twice, carries them down the table
  '11-02': (t, st, w) => { const u = smooth(uRow(t, '11-02')); camLook(w.camera, lerp3([1.9, 1.6, -0.8], [1.6, 1.25, 1.6], u), lerp3([0, 0.6, -2.3], [-0.6, 0.3, 1.8], u), 50); },
  // ---- low at the leg: the wad goes under; the table is level again
  '11-03': (t, st, w) => {
    camLook(w.camera, [LEG[0] + 0.62, FLOOR_Y + 0.14, LEG[1] + 1.05], [LEG[0] - 0.05, FLOOR_Y + 0.12, LEG[1]], 40);
    st.look.p3 = { pos: [LEG[0] + 0.5, FLOOR_Y + 0.4, LEG[1] + 0.75], col: [1.3, 1.0, 0.65], range: 2.2 };
  },
  // ---- its fingertip card flicks off a speck of dust
  '11-04': (t, st, w) => camLook(w.camera, [LEG[0] + 0.9, 0.12, LEG[1] + 0.9], [LEG[0] + 0.3, 0.13, LEG[1] + 0.28], 30),
  // ---- the last M1: everything we started with, changed
  '11-05': (t, st, w) => {
    M1(w.camera, 0);
    st.look.p2 = { pos: [0, 3.0, -3.3], col: [2.4, 1.7, 0.65], range: 12 };
    st.look.p3 = { pos: [LEG[0] + 0.2, FLOOR_Y + 0.55, LEG[1] + 1.1], col: [1.6, 1.25, 0.8], range: 2.4 };   // the stack under the leg
  },
  // ---- the board, close: everything blank but the pair on top; the last line flips in: HUMANS: PASS
  '11-06': (t, st, w) => { const u = uRow(t, '11-06'); camLook(w.camera, [0, 4.95, -0.95 - 0.25 * u], [0, 5.08, -4.9], 31); },
  '11-07': (t, st, w) => M1(w.camera, 0),
  '12-01': (t, st, w) => M1(w.camera, 0),
  '12-02': (t, st, w) => M1(w.camera, 0),
};
void CUES; void camPath; void clamp;
