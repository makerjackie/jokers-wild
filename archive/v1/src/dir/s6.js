// Sequence 6 — 加速 (1:49–2:02): the dates run together; every king fires cards like a machine gun and the pile grows
// into a tower; ×1024; the hoppers eat gold, a castle of servers, a lit city, a smoking power plant, then the paper
// people — the card-maker last, looking back; out comes a card with his face; approvals stamped into a blur.
import { KINGS, KING, SIDE_SIGN, SEAT, pressPos } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, M1, kf, face, keys } from './core.js';
import { HERO } from './s5.js';

// who feeds what, when (row, king, hopper kind)
const FEED = [['6-04', 'openai', 'gold'], ['6-05', 'deepseek', 'castle'], ['6-06', 'google', 'city'], ['6-07', 'kimi', 'plant']];
const PEOPLE = { row: '6-08', who: HERO };
const STAMPERS = ['anthropic', 'openai', 'google', 'xai', 'meta', 'deepseek', 'qwen', 'kimi', 'glm', 'doubao'];

export const RANGE = [at('6-01'), at('6-10')];
export function apply(t, st, w) {
  // ---- everyone is greedy now
  for (const k of KINGS) st.kings[k.id].face = face(t < at('6-04') ? 'laugh' : 'proud', { socket: 0.28 });
  const presses = { ...(st.props.presses ?? {}) };
  // ---- the hoppers: each king shoves his item into the funnel with both hands
  for (const [row, id, kind] of FEED) {
    const t0 = at(row), t1 = end(row);
    if (t < t0 - 0.4 || t > t1 + 0.6) continue;
    const u = ease(t, t0 + 0.5, t1 + 0.05);                       // it sits on the funnel's mouth for half a beat, then goes down
    const pp = pressPos(id), mouth = [pp[0], 0.3, pp[2]];
    presses[id] = { hopper: { show: 1, kind, u, ...(kind === 'city' ? { peel: ease(t, t0 - 0.2, t0 + 0.35) } : {}) }, lever: 0.5 + 0.5 * Math.sin(t * 9) };
    const s = st.kings[id], along = KING[id].side === 'US' ? 1 : -1;
    const push = (dz) => keys(t, [[t0 - 0.2, kf(id, 0.3, 0.2, dz)], [t0 + 0.2, [mouth[0], mouth[1] + 0.12, mouth[2] + dz * 0.5]], [t1 - 0.1, [mouth[0], mouth[1] - 0.05, mouth[2] + dz * 0.4]]]);
    s.armL = { target: push(along * 0.2) }; s.armR = { target: push(-along * 0.2) };
    s.hand = { L: 'open', R: 'open' }; s.lean = 0.2; s.look = mouth; s.face = face('proud', { socket: 0.28 });
  }
  // ---- the paper people: the chains along the CN coast swept into Qwen's hopper, the card-maker last; his face comes out
  {
    const t0 = at(PEOPLE.row), id = PEOPLE.who;
    if (t > t0 - 0.3 && t < at('6-10')) {
      presses[id] = { hopper: { show: 1, kind: 'people', u: ease(t, t0 + 0.1, t0 + 1.45), maker: true, look: ease(t, t0 + 0.75, t0 + 1.0) * (1 - ease(t, t0 + 1.25, t0 + 1.35)) }, lever: ease(t, t0 + 1.4, t0 + 1.5), slide: ease(t, t0 + 1.5, t0 + 1.7) };
      const s = st.kings[id], along = -1;
      s.armL = { target: keys(t, [[t0 - 0.3, kf(id, 0.3, 0.2, along * 0.2)], [t0 + 0.1, [-0.55, 0.12, -1.6]], [t0 + 0.9, [-0.9, 0.25, -1.35]]]) };
      s.hand = { L: 'open' }; s.lean = 0.25; s.look = pressPos(id);
      st.props.makers = { ...(st.props.makers ?? {}), [HERO]: { show: t < t0 + 1.4 ? 1 : 0, swept: ease(t, t0 + 1.0, t0 + 1.4) } };
      // the card with his face, out of the slot
      if (t > t0 + 1.5) st.cards.keyed.push({ cell: CELL.makerFace, back: CELL.backCN, scale: 0.9, attach: { kind: 'press', id, offset: [0, 0.01, 0.06 + 0.1 * ease(t, t0 + 1.5, t0 + 1.75)], rot: [-Math.PI / 2, 0, 0] } });
    }
    // the chains near the swept stretch of each coast are gone from now on (the rest stay, looking up)
    if (t > t0 + 0.2) st.props.people = { CN: { show: [1, 0, 0, 1, 1, 1] }, US: { show: [1, 0, 0, 1, 1, 1] } };
  }
  // ---- approvals: every new card pops a flap, every king stamps it, faster and faster
  if (t > at('6-09') - 0.2) {
    const flaps = {}, stamps = {};
    const t0 = at('6-09');
    STAMPERS.forEach((id, i) => {
      const rate = 2.2 + 9 * ease(t, t0, end('6-09') - 0.3);
      const ph = (t - t0) * rate + i * 0.37;
      const beat = ph - Math.floor(ph);
      const stop = id === 'anthropic' && t > end('6-09') - 0.25;
      flaps[id] = { up: ease(t, t0 + i * 0.05, t0 + 0.2 + i * 0.05), stamp: stop ? 1 : beat };
      stamps[id] = { hand: 'R' };
      const fp = kf(id, 0.62, 0.32, 0.0);
      const s = st.kings[id];
      s.armR = { target: stop ? kf(id, 0.32, 0.38, -0.15) : [fp[0], fp[1] + 0.16 * Math.abs(Math.cos(beat * Math.PI)), fp[2]] };
      s.hand = { R: 'hold' }; s.look = fp; s.face = face('smug', { socket: 0.3 });
    });
    st.props.flaps = flaps; st.props.stamps = stamps;
  }
  st.props.presses = presses;
}

export const SHOTS = {
  // ---- the dates run together
  '6-01': (t, st, w) => camLook(w.camera, [0.0, 5.0, -0.85], [0.0, 5.3, -4.9], 32),
  // ---- machine-gun: everyone throws at once, the pile grows into a tower
  '6-02': (t, st, w) => { const u = uRow(t, '6-02'); camLook(w.camera, [0, 2.15 - 0.2 * u, 4.4 - 0.4 * u], [0, 0.25, -0.6], 50); st.look.smoke = 0.75; },
  // ---- the multiplier: ×4 … ×1024
  '6-03': (t, st, w) => camLook(w.camera, [0.95, 5.85, -2.75], [0.95, 6.0, -4.9], 28),
  // ---- the hoppers, one king each, mirrored
  '6-04': (t, st, w) => feedCam(w.camera, 'openai'),
  '6-05': (t, st, w) => feedCam(w.camera, 'deepseek'),
  '6-06': (t, st, w) => feedCam(w.camera, 'google'),
  '6-07': (t, st, w) => feedCam(w.camera, 'kimi'),
  // ---- the paper people: medium to close on the funnel; he looks back; his face comes out
  '6-08': (t, st, w) => {
    const p = pressPos(HERO), u = smooth(uRow(t, '6-08'));
    camLook(w.camera, lerp3([p[0] + 0.8, 0.5, p[2] + 0.62], [p[0] + 0.45, 0.33, p[2] + 0.34], u), [p[0] - 0.02, lerp(0.22, 0.26, u), p[2]], lerp(46, 38, u));
  },
  // ---- approve, approve, approve
  // close on Claude's flap and stamp, pulling back to the whole row stamping into a blur
  '6-09': (t, st, w) => {
    const u = smooth(uRow(t, '6-09')), f = kf('anthropic', 0.62, 0.32, 0);
    camLook(w.camera, lerp3([f[0] - 0.42, f[1] + 0.16, f[2] + 0.34], [0.2, 0.85, 0.6], u), lerp3([f[0], f[1] + 0.06, f[2]], [1.4, 0.5, -0.6], u), lerp(30, 50, u));
  },
};
function feedCam(cam, id) {
  // from the sea side, a little above the funnel's mouth: the item, the hands, the king's face behind
  const p = pressPos(id), s = SIDE_SIGN[KING[id].side], dz = KING[id].side === 'US' ? 0.5 : -0.5;
  camLook(cam, [p[0] - s * 0.82, 0.58, p[2] + dz], [p[0] + s * 0.18, 0.4, p[2] + dz * 0.15], 44);
}
void SEAT; void CARD; void M1; void clamp; void lerp;
