// Sequence 3 — 卡脖子 (0:55–1:21): the chip dispenser; the US seal crushes the bridge (embargo); the CN stacks run dry;
// OpenAI's giant gold o1, held high for six seconds; DeepSeek's tiny R1 caves it in; the chip tower avalanches;
// SERVER BUSY; the toll gate (25%); the CN seal rejects the cart; the CN kiln lights up.
import * as THREE from 'three';
import * as SET from '../set.js';
import { KINGS, KING, SIDE_SIGN, FLOOR_Y, DISPENSER } from '../layout.js';
import { pressPos } from '../layout.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, camLook, M1, kf, off, face, keys } from './core.js';
import { O1, R1, pileTop } from './throws.js';

const CN = KINGS.filter((k) => k.side === 'CN').map((k) => k.id);
const US = KINGS.filter((k) => k.side === 'US').map((k) => k.id);
const _v = new THREE.Vector3();
const bridge = (w, u) => (w.set?.bridgePoint ? w.set.bridgePoint(u, _v).toArray() : [lerp(0.9, -0.9, u), 0.12, 3.35]);
const KILN_AT = () => (SET.KILN?.mouth && SET.KILN.mouth.some((v) => v !== 0) ? SET.KILN.mouth : SET.KILN?.pos ?? [-DISPENSER.pos[0], FLOOR_Y, DISPENSER.pos[2]]);

export const RANGE = [at('3-01'), at('4-01')];
export function apply(t, st, w) {
  // ---- chips: every king has his stack; the CN stacks run dry after the embargo; kiln chips refill them after 3-12
  const chips = {};
  const dry = ease(t, at('3-04', 0.1), at('3-04', 1.7));
  const kiln = ease(t, at('3-12', 0.9), at('3-12', 2.4));
  for (const id of US) chips[id] = { stack: 1, kind: 'US' };
  for (const id of CN) chips[id] = t < at('3-12', 0.9) ? { stack: lerp(1, 0.08, dry), kind: 'US' } : { stack: lerp(0.0, 0.85, kiln), kind: 'CN' };
  // OpenAI's mountain, pushed into his press at the start of 3-05
  chips.openai = { stack: 1, heap: t < at('3-05') ? 1 : 1 - ease(t, at('3-05', 0.05), at('3-05', 0.85)), kind: 'US' };
  st.props.chips = chips;
  // ---- faces: the CN row darkens as the chips run out, brightens at the kiln; the US row preens through the boast
  for (const id of CN) {
    if (t > at('3-03') && t < at('3-07')) st.kings[id].face = face('sour', { socket: 0.42 });
    if (t > at('3-07', 0.3)) st.kings[id].face = face('smug', { socket: 0.3 });
  }
  for (const id of US) if (t > at('3-05', 2.0) && t < at('3-07', 0.3)) st.kings[id].face = face('proud', { socket: 0.28 });
  if (t > at('3-07', 0.3) && t < at('3-09')) for (const id of US) st.kings[id].face = face('shock', { socket: 0.3 });
  // ---- OpenAI's hands: shove the mountain in, watch the card rise, grab it, hold it high, slam it down
  {
    const s = st.kings.openai, pp = pressPos('openai');
    if (t > at('3-05') - 0.3 && t < O1.land + 0.4) {
      const hop = [pp[0] + 0.04, 0.32, pp[2]];
      const L = keys(t, [[at('3-05') - 0.3, kf('openai', 0.3, 0.1, 0.25)], [at('3-05', 0.15), [hop[0], hop[1], hop[2] + 0.18]], [at('3-05', 0.85), [hop[0], 0.2, hop[2] + 0.12]],
        [O1.grab - 0.25, kf('openai', 0.35, 0.55, 0.3)], [O1.grab, kf('openai', 0.24, 1.2, 0.5)], [O1.slam, kf('openai', 0.24, 1.25, 0.5)], [O1.land, [0.62, 0.12, -2.0]]]);
      const R = keys(t, [[at('3-05') - 0.3, kf('openai', 0.3, 0.1, -0.25)], [at('3-05', 0.15), [hop[0], hop[1], hop[2] - 0.18]], [at('3-05', 0.85), [hop[0], 0.2, hop[2] - 0.12]],
        [O1.grab - 0.25, kf('openai', 0.35, 0.55, -0.3)], [O1.grab, kf('openai', 0.24, 1.2, -0.5)], [O1.slam, kf('openai', 0.24, 1.25, -0.5)], [O1.land, [0.62, 0.12, -3.0]]]);
      s.armL = { target: L }; s.armR = { target: R }; s.hand = { L: t > O1.grab - 0.1 ? 'hold' : 'open', R: t > O1.grab - 0.1 ? 'hold' : 'open' };
      s.look = t < O1.grab ? off('openai', -0.75, 0.6, -0.12) : t < O1.slam ? (t < O1.grab + 0.8 ? kf('openai', 0.18, 1.7, 0) : [-1.6, 0.95, -1.4]) : [0, 0, -0.1];   // admires it, then shows it to the rivals
      s.lean = t < O1.grab ? 0.12 : t < O1.slam ? -0.1 : 0.2;
      s.face = face(t < O1.grab ? 'smug' : 'proud', { socket: 0.28 });
    }
  }
  // ---- DeepSeek's maker drops a small handful into the hopper; the press puffs out a tiny card; the king flicks it
  {
    const id = 'deepseek', u0 = at('3-06');
    if (t > u0 - 0.2 && t < end('3-06')) {
      st.props.makers = { ...(st.props.makers ?? {}), [id]: { hold: 'shovel', shovel: ease(t, u0 + 0.1, u0 + 0.5), pose: { lean: 0.1 } } };
      st.props.presses = { ...(st.props.presses ?? {}), [id]: { hopper: { show: 1, kind: 'chips', u: ease(t, u0 + 0.35, u0 + 0.6), chips: 6 }, lever: ease(t, u0 + 0.55, u0 + 0.62) * (1 - ease(t, u0 + 0.7, u0 + 0.85)), slide: ease(t, u0 + 0.62, u0 + 0.75) } };
      st.kings[id].look = pressPos(id);
      st.kings[id].face = face(t > u0 + 0.8 ? 'smug' : 'calm', { socket: 0.3 });
    }
  }
  // ---- 3-04: the last CN chips swept into a hopper
  {
    const id = 'qwen', u0 = at('3-04');
    if (t > u0 && t < end('3-04')) {
      st.props.makers = { ...(st.props.makers ?? {}), [id]: { hold: 'shovel', shovel: ease(t, u0 + 0.9, u0 + 1.5), pose: { lean: 0.12 } } };
      st.props.presses = { ...(st.props.presses ?? {}), [id]: { hopper: { show: 1, kind: 'chips', u: ease(t, u0 + 1.3, u0 + 1.8), chips: 4 } } };
    }
  }
  // ---- everyone looks where the noise is
  if (t > at('3-02') && t < at('3-04')) for (const k of KINGS) st.kings[k.id].look = [0.3, 2.4, 2.8];
  if (t > at('3-08') && t < at('3-09')) for (const k of KINGS) st.kings[k.id].look = [1.6, 0.8, 3.6];
  if (t > at('3-10') && t < at('3-12')) for (const k of KINGS) st.kings[k.id].look = bridge(w, 0.6);
  if (t > at('3-12')) for (const k of KINGS) { st.kings[k.id].look = KILN_AT(); if (KING[k.id].side === 'US') st.kings[k.id].face = face('sour', { socket: 0.35 }); }
  // ---- light: the kiln's fire is the practical light from 3-12 on (until the rush)
  const kl = st.set.kiln?.glow ?? 0;
  if (kl > 0) { const p = KILN_AT(); st.look.p2 = { pos: [p[0] + 0.25, p[1] + 0.35, p[2] - 0.25], col: [2.4 * kl, 0.7 * kl, 0.2 * kl], range: 4.5 }; }
}

export const SHOTS = {
  // ---- reverse angle from the head: the dispenser at the far foot corner spitting chips down two chutes
  '3-01': (t, st, w) => { const u = (t - at('3-01')) / 2; camLook(w.camera, [-0.45, 1.65 - 0.1 * u, -2.3 + 0.3 * u], [1.45, 0.05, 3.55], 32); },
  // ---- low, looking up: the US seal comes down out of the dark on its chain; its shadow reaches the table first
  '3-02': (t, st, w) => {
    const u = (t - at('3-02')) / 3, b = bridge(w, 0.5);
    const drop = st.props.seals?.US?.drop ?? 0, sf = [b[0], lerp(4.3, 0.3, drop), b[2]];     // where the seal is (never ask a module: it may hold another frame's state)
    camLook(w.camera, [-0.9 + 0.12 * u, 0.45, b[2] - 2.6 + 0.35 * u], [b[0] * 0.5, 1.3 - 0.2 * u, b[2]], 58);
    // a cold glint catches it in the dark; its shadow reaches the table before it does
    st.look.p2 = { pos: [sf[0] - 0.8, sf[1] - 0.7, sf[2] - 1.0], col: [2.6, 2.9, 3.6], range: 3.4 };
    st.look.exposure = 1.4;
    st.look.shade = { at: [b[0], b[2]], r: [0.18 + 0.5 * drop, 0.18 + 0.5 * drop], k: 0.25 + 0.6 * drop };
  },
  // ---- it slams onto the bridge: EMBARGO
  '3-03': (t, st, w) => {
    const b = bridge(w, 0.5);
    camLook(w.camera, [b[0] - 0.75, 0.42, b[2] - 1.15], [b[0], 0.2, b[2]], 40);
    st.look.p2 = { pos: [b[0] - 0.4, 0.9, b[2] - 0.8], col: [0.9, 0.8, 0.65], range: 2.5 };
  },
  // ---- the CN row: stacks shrink, the last chips swept into a hopper, faces darken
  '3-04': (t, st, w) => { const u = (t - at('3-04')) / 2; camLook(w.camera, [0.45, 0.55, -1.95 + 0.15 * u], [-1.0, 0.4, -0.6], 44); },
  // ---- the boast: OpenAI shoves a mountain of chips in; the press groans out the giant gold o1; he holds it high
  '3-05': (t, st, w) => {
    const u = (t - at('3-05')) / 6;
    const c = off('openai', -0.2, 0.0, 0);
    const a = 0.35 + smooth(u) * 0.9;
    camLook(w.camera, [c[0] - 2.95 * Math.cos(a), 0.66 + 0.1 * u, c[2] + 2.95 * Math.sin(a)], [c[0] - 0.25, lerp(0.55, 1.15, ease(u, 0.1, 0.4)), c[2]], 46);
    const top = kf('openai', 0.3, 1.75, 0);
    for (const id of ['anthropic', 'google', 'xai', 'meta']) if (t > O1.grab) { st.kings[id].lean = -0.14; st.kings[id].look = top; }
  },
  // ---- DeepSeek: a pinch of chips, a tiny card, a flick
  '3-06': (t, st, w) => camLook(w.camera, [0.05, 0.75, -1.25], kf('deepseek', 0.45, 0.7, -0.2), 44),
  // ---- straight down: the tiny card spins onto the giant one, which caves in
  '3-07': (t, st, w) => { const y = pileTop(R1.t) + 1.25; camLook(w.camera, [0.03, y, -0.03], [0.03, 0, -0.05], 54); },
  // ---- the chip skyscraper by the dispenser falls like dominoes; a flood of chips; the green eye blinks
  '3-08': (t, st, w) => { const u = (t - at('3-08')) / 3; camLook(w.camera, [-1.0, 1.85 - 0.2 * u, -1.2 + 0.4 * u], [1.25, 0.55, 3.3], 48); st.look.p2 = { pos: [1.6, 2.2, 1.6], col: [0.8, 0.95, 1.2], range: 4.5 }; st.look.exposure = 1.45; },
  // ---- the board: 2025·01, #1 DeepSeek; SERVER BUSY drops under his row
  '3-09': (t, st, w) => camLook(w.camera, [0.0, 5.0, -0.85], [0.0, 5.3, -4.9], 32),
  // ---- the seal lifts, the bridge springs back, a toll bar drops (25%), a cart of chips rolls toward China
  '3-10': (t, st, w) => { const b0 = bridge(w, 0.04), b = bridge(w, 0.6); camLook(w.camera, [b0[0] + 0.15, b0[1] + 0.32, b0[2] + 0.62], [b[0], b[1] + 0.04, b[2]], 38); st.look.p2 = { pos: [b[0] + 0.2, 1.1, b[2] - 0.7], col: [1.1, 1.0, 0.85], range: 2.6 }; },
  // ---- the CN bridgehead: REJECTED slams down in front of the cart; it rolls back the way it came
  '3-11': (t, st, w) => {
    const b = bridge(w, 0.8), e = bridge(w, 0.99), m = bridge(w, 0.55);
    camLook(w.camera, [e[0] - 0.12, e[1] + 0.34, e[2] + 0.7], [m[0], m[1] + 0.1, m[2]], 40);
    st.look.p2 = { pos: [b[0] - 0.5, 0.95, b[2] - 0.7], col: [1.2, 1.0, 0.8], range: 2.6 };
  },
  // ---- slow push in M1: the kiln lights the CN corner red; rough red chips stack up; the frame is symmetric again
  // the two corners at the foot, mirrored: the dispenser (US) and the kiln lighting up (CN)
  '3-12': (t, st, w) => { const u = (t - at('3-12')) / 2.5; camLook(w.camera, [0.0, 0.95 - 0.05 * u, 7.7 - 0.4 * u], [0, 0.05, 2.1], 52); },
};
void SIDE_SIGN; void smooth; void clamp; void lerp3;
