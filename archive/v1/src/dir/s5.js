// Sequence 5 — 制牌人 (1:36–1:49): the card-maker prints a card that shows himself at his press; the camera circles him
// (edge-on he is a line); the card prints smaller cards by itself, his press pumps by itself; across the sea his
// counterpart holds the same card; two faces; both pull their levers.
// The protagonist is Qwen's card-maker (CN, seat 1); his counterpart is Anthropic's (US, seat 1): mirror images.
import * as THREE from 'three';
import { KINGS, makerPos, pressPos } from '../layout.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { ease, lerp, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, kf, face } from './core.js';

export const HERO = 'qwen', TWIN = 'anthropic';
const COAST_Z = -1.36;
const coast = (id) => [id === HERO ? -0.47 : 0.47, 0, COAST_Z];
const HEAD_Y = 0.183;

// a card held in a card-maker's hand (drawn in his paper plane, face out of the printed side), bound late by cards.js
const cardInHand = (id, cell, scale, lift = 0) => ({ cell, back: CELL.backBlack, scale, attach: { kind: 'maker', id, which: 'R', offset: [0.004, CARD.H * scale * 0.5 + lift, 0.003] } });

export const RANGE = [at('5-01'), at('6-01')];
export function apply(t, st, w) {
  // the kings: mountains, nobody looks down
  for (const k of KINGS) { st.kings[k.id].look = kf(k.id, 3.2, 0.95, 0); st.kings[k.id].face = face('calm', { socket: 0.3 }); }
  const makers = {}, presses = {};
  // ---- 5-01: he pulls the lever, a card slides out, he holds it up: it is him
  const p0 = at('5-01');
  if (t < at('5-03')) {
    const pull = ease(t, p0 + 0.05, p0 + 0.45) * (1 - ease(t, p0 + 0.55, p0 + 0.8));
    const hold = t > p0 + 0.95;
    const hk = ease(t, p0 + 0.8, p0 + 1.15);
    makers[HERO] = { show: 1, look: 0, pose: { armR: lerp(lerp(0.06, 2.1, pull), 1.55, hk), armL: lerp(0.06, 1.2, hk), head: 0.25 * hk, lean: lerp(0.1 * pull, -0.04, hk) } };
    presses[HERO] = { lever: pull, slide: ease(t, p0 + 0.5, p0 + 0.9) * (hold ? 0 : 1) };
    if (hold) {
      // 5-02: the printed press on the card works by itself; the real press behind him pumps by itself
      const self = t > at('5-02', 0.6) && Math.floor((t - at('5-02', 0.6)) * 4.2) % 2 === 1;
      st.cards.keyed.push(cardInHand(HERO, self ? CELL.makerSelf2 : CELL.makerSelf, 0.32 * (0.3 + 0.7 * ease(t, p0 + 0.95, p0 + 1.12))));
      if (t > at('5-02', 0.9)) presses[HERO].lever = 0.5 - 0.5 * Math.cos((t - at('5-02', 0.9)) * Math.PI * 2 * 0.9);
      // smaller cards come out of the card's face and flutter down to the table
      if (t > at('5-02', 1.0)) for (let k = 0; k < 9; k++) {
        const tk = at('5-02', 1.0) + k * 0.42, age = t - tk;
        if (age < 0) continue;
        const sc = 0.32, out = 0.01 + 0.07 * Math.min(age, 0.5);
        st.cards.keyed.push({ cell: CELL.makerSelf, back: CELL.backBlack, scale: 0.12, attach: { kind: 'maker', id: HERO, which: 'R',
          offset: [0.004 + 0.012 * ((k % 3) - 1), CARD.H * sc * 0.5 + 0.01 * ((k % 2) - 0.5), 0.003 + out], drop: 0.5 * 9.8 * 0.08 * Math.max(0, age - 0.35) ** 2, flat: k * 0.9 } });
      }
    }
  }
  // ---- 5-03 .. 5-05: on the two shores, each holding the same card, facing each other across the sea
  if (t >= at('5-03') && t < at('5-06')) {
    makers[HERO] = { show: 1, at: coast(HERO), face: 1, hold: 'card', pose: { armR: 1.5, armL: 1.15, head: 0.05 } };
    makers[TWIN] = { show: 1, at: coast(TWIN), face: -1, hold: 'card', pose: { armR: 1.5, armL: 1.15, head: 0.05 } };
    for (const id of [HERO, TWIN]) st.cards.keyed.push(cardInHand(id, CELL.makerSelf, 0.32));
  }
  // ---- 5-06: back at their presses, both pull at once
  if (t >= at('5-06')) {
    const pull = ease(t, at('5-06', 0.25), at('5-06', 0.55));
    for (const id of [HERO, TWIN]) {
      makers[id] = { show: 1, pose: { armR: lerp(1.2, 2.2, pull), armL: 0.1, lean: 0.12 * pull } };
      presses[id] = { lever: pull };
    }
  }
  st.props.makers = { ...(st.props.makers ?? {}), ...makers, openai: { show: 0 } };
  st.props.presses = { ...(st.props.presses ?? {}), ...presses };
}

export const SHOTS = {
  // ---- table height, still: lever, card, he looks at it
  '5-01': (t, st, w) => { const m = makerPos(HERO); camLook(w.camera, [m[0] + 0.04, 0.2, m[2] + 0.58], [m[0] - 0.05, 0.13, m[2] - 0.02], 32); },
  // ---- the camera circles him 180°: edge-on, he is a line
  '5-02': (t, st, w) => {
    const m = makerPos(HERO), u = smooth(uRow(t, '5-02'));
    const a = lerp(0.12, Math.PI - 0.12, u), r = 0.52;
    camLook(w.camera, [m[0] + Math.sin(a) * r * 0.9, 0.16 + 0.03 * Math.sin(a), m[2] + Math.cos(a) * r], [m[0], 0.13, m[2]], 34);
  },
  // ---- along the sea at table height: two tiny paper men face each other; the kings stand like mountains
  '5-03': (t, st, w) => camLook(w.camera, [0, 0.055, 0.25], [0, 0.14, COAST_Z], 46),
  // ---- his face; then the other one's, the same frame mirrored
  '5-04': (t, st, w) => { const c = coast(HERO); camLook(w.camera, [c[0] + 0.004, HEAD_Y + 0.004, c[2] + 0.27], [c[0] + 0.004, HEAD_Y + 0.004, c[2]], 20); },
  '5-05': (t, st, w) => { const c = coast(TWIN); camLook(w.camera, [c[0] - 0.004, HEAD_Y + 0.004, c[2] + 0.27], [c[0] - 0.004, HEAD_Y + 0.004, c[2]], 20); },
  // ---- symmetric: both pull their levers at once
  '5-06': (t, st, w) => camLook(w.camera, [0, 0.3, 0.12], [0, 0.12, -1.25], 56),
};
void pressPos; void end; void clamp;
