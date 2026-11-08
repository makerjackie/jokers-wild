// Sequence 2 — 斗牌 (0:25–0:55): eight hands, alternating camps, each card bigger, each pair 15% faster; the cardboard
// crowd of #1s; the board jams; the two 95s; Mistral can't follow; Meta and Doubao fold him under the short leg.
import { KINGS, KING, EU, TABLE, FLOOR_Y } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, inRow, camLook, M1, kf, off, sx, face, keys } from './core.js';
import { allThrows, LADDER, DOUBLE, pileTop } from './throws.js';

const CN_FOOT = 'doubao', US_FOOT = 'meta';
const LEG = TABLE.LEGS[TABLE.SHIM_LEG];
const EU_HAND = [0.2, 0.06, EU.pos[2] - 0.05];           // where the standee's printed hand holds his card

// the medium low angle on a thrower (mirrored by camp through kf)
const throwerCam = (cam, id, i) => {
  const near = 1 - i * 0.05, big = i >= 3;
  camLook(cam, kf(id, (big ? 1.25 : 1.5) * near, big ? 0.72 : 0.5, (big ? 1.25 : 0.78) * near), kf(id, 0.1, big ? 1.0 : 0.92, big ? -0.1 : 0.0), big ? 46 : 40);
};
// straight down on the pile, high enough for the card that lands
const pileCam = (cam, scale, dz = 0) => {
  // the camera rises slower than the cards grow: each new card fills more of the frame
  const fov = lerp(42, 58, clamp((scale - 1) / 3.6));
  const h = (0.26 * Math.pow(scale, 0.62)) / (0.62 * 2 * Math.tan((fov * Math.PI) / 360)) + 0.12;
  camLook(cam, [0.0, Math.min(2.2, h), 0.02 + dz], [0, 0, dz], fov);
};

export const RANGE = [at('2-01'), at('3-01')];
export function apply(t, st, w) {
  // everyone watches the thrower wind up, then the card land; the thrower glares at the pile
  for (const th of allThrows()) {
    if (th.t > end('2-21') || th.t < at('2-01') - 1) continue;
    const t0 = th.t - th.hold;
    if (t < t0 || t > th.land + 0.6) continue;
    const thrower = th.who;
    for (const k of KINGS) {
      if (k.id === thrower) { st.kings[k.id].look = [0, 0.1, 0]; st.kings[k.id].face = face(t < th.t ? 'angry' : 'proud', { socket: 0.3 }); continue; }
      st.kings[k.id].look = t < th.t ? kf(thrower, 0, 1.0, 0) : [0, 0.05, 0];
      if (t > th.land) st.kings[k.id].face = face(KING[k.id].side === KING[thrower].side ? 'smug' : 'sour', { socket: 0.3 });
    }
  }
  // the cardboard crowd: up at 2-18, flattened head to foot by the double slam's shockwave
  const land2 = DOUBLE.t + DOUBLE.flight;
  st.props.crowd = { pop: ease(t, at('2-18', 0.05), at('2-18', 0.9)), fall: t < land2 ? 0 : ease(t, land2 + 0.05, land2 + 1.6) };
  // his card: in his hand from 2-23 (head down at it, up at the pile), thrown in 2-24, bounces off the pile and slides off
  const c0 = at('2-24', 0.2), top = pileTop(c0) + 0.01;
  if (t > at('2-23') - 0.5 && t < at('2-25', 0.9)) {
    st.props.eu = { ...st.props.eu, head: keys(t, [[at('2-23', 0.2), 0], [at('2-23', 0.45), 0.6], [at('2-23', 0.95), 0.6], [at('2-23', 1.2), -1], [at('2-24'), -1], [at('2-24', 0.1), 0.4], [at('2-24', 0.6), 0.4], [at('2-24', 0.9), 0]]),
      arm: t < c0 ? ease(t, at('2-24', 0.02), c0) : 1 - ease(t, c0 + 0.25, c0 + 0.8) };
  }
  if (t < c0) st.cards.keyed.push({ cell: CELL.mistral, back: CELL.backBlack, scale: 0.85, attach: { kind: 'eu', offset: [0, CARD.H * 0.85 * 0.5, 0.004] } });
  else {
    const r = w.euRelease ?? EU_HAND;
    st.cards.keyed.push({ cell: CELL.mistral, back: CELL.backBlack, scale: 0.85, keys: [
      [c0, r, [-0.3, Math.PI, 0]],
      [c0 + 0.38, [0.03, top + 0.03, 0.6], [-Math.PI / 2 + 0.25, Math.PI + 0.4, 0]],
      [c0 + 0.5, [0.2, top + 0.13, 0.66], [-Math.PI / 2 - 0.5, Math.PI + 0.9, 0.3]],
      [c0 + 0.78, [0.66, 0.006, 0.74], [-Math.PI / 2, Math.PI + 1.4, 0]],
      [c0 + 1.0, [1.16, 0.004, 0.8], [-Math.PI / 2, Math.PI + 1.6, 0]],
      [c0 + 1.16, [1.3, -0.32, 0.84], [-Math.PI / 2 + 1.2, Math.PI + 1.7, 0.4]],
      [c0 + 1.3, [1.36, FLOOR_Y + 0.003, 0.86], [-Math.PI / 2, Math.PI + 1.8, 0]],
    ] });
  }
}

export const SHOTS = {};
// the ladder: medium low angle on each thrower, then straight down on the card landing
LADDER.forEach(([row, id, , scale], i) => {
  SHOTS[row] = (t, st, w) => throwerCam(w.camera, id, i);
  const next = { '2-01': '2-02', '2-04': '2-05', '2-06': '2-07', '2-08': '2-09', '2-10': '2-11', '2-12': '2-13', '2-14': '2-15' }[row];
  if (next) SHOTS[next] = (t, st, w) => pileCam(w.camera, scale);
});
Object.assign(SHOTS, {
  // ---- a card-maker shovels chips into the hopper: thump, a new card springs from the slot (Google's, next to throw)
  '2-03': (t, st, w) => {
    const id = 'google';
    camLook(w.camera, [1.02, 0.3, 0.72], [0.8, 0.08, -0.06], 36);
    const u = (t - at('2-03')) / 1.4;
    st.props.makers = { [id]: { hold: 'shovel', shovel: ease(u, 0.1, 0.55), pose: { lean: 0.15 * Math.sin(Math.min(1, u * 1.6) * Math.PI) } } };
    st.props.presses = { [id]: { hopper: { show: 1, kind: 'chips', u: ease(u, 0.35, 0.7) }, lever: ease(u, 0.55, 0.62) * (1 - ease(u, 0.7, 0.9)), slide: ease(u, 0.62, 0.78) } };
    st.kings.google.look = [0.86, 0.1, 0.0];
  },
  // ---- the board: #1 Grok, for a blink
  '2-17': (t, st, w) => camLook(w.camera, [0.0, 5.0, -0.85], [0.0, 5.3, -4.9], 32),
  // ---- the crowd pops up: dozens of cardboard kings, each with a #1
  '2-18': (t, st, w) => { const u = (t - at('2-18')) / 1.1; camLook(w.camera, [0, 1.0 - 0.05 * u, 2.9 - 0.15 * u], [0, 0.12, -1.2], 52); for (const k of KINGS) st.kings[k.id].face = face('shock', { socket: 0.3 }); },
  // ---- the board jams on #1
  '2-19': (t, st, w) => { const u = (t - at('2-19')) / 1.6; camLook(w.camera, [0, 4.9, -0.75 - 0.35 * u], [0, 5.2, -4.9], 32 - 1.5 * u); },
  // ---- both head kings wind up at once
  '2-20': (t, st, w) => {
    camLook(w.camera, [0, 0.8, 0.95], [0, 0.85, -2.5], 50);
    st.kings.openai.face = face('shout', { socket: 0.3 }); st.kings.deepseek.face = face('shout', { socket: 0.3 });
    st.kings.openai.look = kf('deepseek', 0, 1, 0); st.kings.deepseek.look = kf('openai', 0, 1, 0);
  },
  '2-21': (t, st, w) => pileCam(w.camera, 4.6),
  // ---- the shockwave flattens the crowd head to foot; Mistral sways
  '2-22': (t, st, w) => { const u = (t - at('2-22')) / 2; camLook(w.camera, [0, 1.15 + 0.1 * u, 3.1 + 0.25 * u], [0, 0.1, -1.0], 52); st.props.eu.rot = [Math.sin((t - at('2-22', 0.9)) * 9) * 0.06 * Math.max(0, 1 - (t - at('2-22', 0.9)) / 1.1) * (t > at('2-22', 0.9) ? 1 : 0), Math.PI, 0]; },
  // ---- Mistral looks at the pile (95), then at his own card (71)
  '2-23': (t, st, w) => camLook(w.camera, [0.3, 0.07, 2.72], [0.0, 0.12, EU.pos[2]], 32),
  // ---- he throws it; it bounces off the pile and slides off the table: PASS
  '2-24': (t, st, w) => camLook(w.camera, [0.35, 1.45, 0.7], [0.35, 0, 0.55], 50),
  // ---- the table rocks; Meta and Doubao look at each other, then both reach for the cardboard king
  '2-25': (t, st, w) => {
    camLook(w.camera, [0, 0.95, -0.7], [0, 0.2, 3.0], 50);
    const u = (t - at('2-25')) / 1.5;
    st.kings[US_FOOT].look = u < 0.55 ? kf(CN_FOOT, 0, 1.0, 0) : [0, 0.1, EU.pos[2]];
    st.kings[CN_FOOT].look = u < 0.55 ? kf(US_FOOT, 0, 1.0, 0) : [0, 0.1, EU.pos[2]];
    st.kings[US_FOOT].face = face(u < 0.55 ? 'side' : 'smug', { socket: 0.3 }); st.kings[CN_FOOT].face = face(u < 0.55 ? 'side' : 'smug', { socket: 0.3 });
    for (const id of [US_FOOT, CN_FOOT]) {
      const r = ease(u, 0.6, 0.95);
      const k = KING[id], along = (k.side === 'US') ? 1 : -1;
      st.kings[id].armL = { target: lerp3(kf(id, 0.3, 0.1, along * 0.25), [sx(id) * 0.55, 0.15, EU.pos[2] - 0.5], r) };
      st.kings[id].armR = { target: lerp3(kf(id, 0.3, 0.1, -along * 0.25), [sx(id) * 0.6, 0.12, EU.pos[2] - 0.75], r) };
      st.kings[id].lean = 0.25 * r;
      st.kings[id].hand = { L: 'open', R: 'open' };
    }
  },
  // ---- low at the short leg: folded once, twice, stuffed under; the table stops rocking
  '2-26': (t, st, w) => {
    camLook(w.camera, [LEG[0] + 1.25, FLOOR_Y + 0.3, LEG[1] + 1.6], [LEG[0] + 0.2, FLOOR_Y + 0.14, LEG[1] + 0.2], 44);
    st.look.p3 = { pos: [LEG[0] + 0.5, FLOOR_Y + 0.35, LEG[1] + 0.7], col: [1.2, 0.95, 0.65], range: 2.2 };   // spill under the table's edge
  },
  // ---- M1: quiet; the two sit back; a corner of folded cardboard under the leg in the foreground
  '2-27': (t, st, w) => M1(w.camera, 0.4),
});
void off; void inRow; void smooth; void CN_FOOT; void FLOOR_Y;
