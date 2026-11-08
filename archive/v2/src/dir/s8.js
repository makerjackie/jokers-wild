// Sequences 8-9 — 开盒 / 王炸 (2:16–2:42): the lids are punched open from inside; the march sticks; the jokers rise;
// heads go up; the cancel key is grey; the giants swing their seals and the storm catches the chains. The jokers launch
// like missiles at each other, everyone cowers — at the last instant they pass, turn and lie down side by side: a pair.
// Straight down, still, digital silence. OpenAI's eye, a heartbeat. 王炸. Every card on the table flips to the AI's back.
import * as THREE from 'three';
import { KINGS, KING, BOXES, BOX, SIDE_SIGN } from '../layout.js';
import { CUES } from '../shots.js';
import { CARD } from '../cards.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, M1, kf, face, AUTO_BTN } from './core.js';
import { pileTop } from './throws.js';
import { sizeAt } from './story.js';
import { hd } from './s1.js';

const S = 1.4;                                    // the jokers' scale from the launch on
export const PAIR_LAND = at('9-04', 1.2);         // when they touch down, side by side
const top = () => pileTop(at('9-04')) + 0.05;
const crv = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
let KEYS = null;
function flightKeys() {
  if (KEYS) return KEYS;
  const b = BOXES.CN, T = top();
  KEYS = [
    [at('9-01'), [b[0], 1.32, b[2]]],
    [at('9-01', 0.45), [-1.35, 2.25, -1.0]],
    [at('9-02', 0.45), [-1.05, 2.7, 0.7]],
    [at('9-03', 0.7), [-0.35, 2.35, 1.5]],
    [at('9-03', 1.7), [0.55, 1.75, 0.9]],
    [at('9-03', 2.6), [0.38, 1.0, 0.1]],
    [at('9-04', 0.15), [-0.02, T + 0.45, 0.0]],    // they pass each other here
    [at('9-04', 0.7), [-0.32, T + 0.3, 0.12]],     // turn
    [PAIR_LAND, [-CARD.W * S * 0.5, T, 0.0]],       // and settle
  ];
  return KEYS;
}
export function jokerFlight(t, side) {
  const K = flightKeys(), n = K.length;
  const m = side === 'CN' ? 1 : -1;
  const P = (j) => { const p = K[Math.max(0, Math.min(n - 1, j))][1]; return [p[0] * m, p[1], p[2]]; };
  if (t >= K[n - 1][0]) return { pos: P(n - 1), vel: [0, -0.01, 0], landed: true };
  let i = 0; while (i < n - 2 && K[i + 1][0] <= t) i++;
  const u = clamp((t - K[i][0]) / (K[i + 1][0] - K[i][0]), 0, 1);
  const pos = [0, 1, 2].map((c) => crv(P(i - 1)[c], P(i)[c], P(i + 1)[c], P(i + 2)[c], u));
  const u2 = Math.min(1, u + 0.02);
  const pos2 = [0, 1, 2].map((c) => crv(P(i - 1)[c], P(i)[c], P(i + 1)[c], P(i + 2)[c], u2));
  return { pos, vel: [pos2[0] - pos[0], pos2[1] - pos[1], pos2[2] - pos[2]] };
}
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function flightRot(t, side, f) {
  const v = new THREE.Vector3(...f.vel).normalize(), up = new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3().crossVectors(v, up).normalize();
  if (side === 'US') z.negate();
  const x = new THREE.Vector3().crossVectors(v, z).normalize();
  _m.makeBasis(x, v, z); _q.setFromRotationMatrix(_m); _e.setFromQuaternion(_q, 'YXZ');
  return [_e.x, _e.y, _e.z + Math.sin(t * 7 + (side === 'CN' ? 0 : 1.7)) * 0.15];
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ea = new THREE.Euler();
function jokerRot(t, side, f) {
  const t0 = at('9-04', 0.35);
  if (t <= t0 && !f.landed) return flightRot(t, side, f);
  const f0 = jokerFlight(t0, side);
  _qa.setFromEuler(_ea.set(...flightRot(t0, side, f0), 'YXZ'));
  _qb.setFromEuler(_ea.set(-Math.PI / 2, 0, 0, 'YXZ'));
  const k = smooth(clamp((t - t0) / (PAIR_LAND - t0), 0, 1));
  _qa.slerp(_qb, k); _ea.setFromQuaternion(_qa, 'YXZ');
  return [_ea.x, _ea.y, _ea.z];
}
function trackJoker(cam, t, side) {
  const f = jokerFlight(t, side), r = jokerRot(t, side, f);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ'));
  const zf = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yv = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const p = new THREE.Vector3(...f.pos);
  const c = p.clone().addScaledVector(zf, 0.62).addScaledVector(yv, -0.12);
  camLook(cam, c.toArray(), p.clone().addScaledVector(yv, 0.04).toArray(), 36);
}

export const RANGE = [at('8-01'), at('10-01')];
export function apply(t, st, w) {
  // ---- seq 8: the march sticks, the arms freeze mid-toast, ash falls
  if (t < at('9-01')) {
    if (st.cards.storm) st.cards.storm.keepOut = 1.4;
    return;
  }
  // ---- seq 9: the jokers fly, then side by side on the pile
  for (const side of ['CN', 'US']) {
    const f = jokerFlight(t, side);
    st.cards.jokers[side] = { pos: f.pos.slice(), rot: jokerRot(t, side, f), scale: lerp(1.8, S, ease(t, at('9-01'), at('9-02'))) };
  }
  st.cards.jokerGlow = t < at('9-04') ? 0.42 : lerp(0.42, 0.25, ease(t, at('9-04'), PAIR_LAND));
  // the storm: furious, slowed for the pass, then frozen dead for the silence
  if (st.cards.storm) {
    st.cards.storm.part = 0; st.cards.storm.wrap = [];
    st.cards.storm.speed = t < at('9-04') ? 1.8 : 0.25;
    if (t > at('9-04', 1.1)) st.cards.storm.freeze = at('9-04', 1.1);
    st.cards.storm.clearR = lerp(0.2, 1.0, ease(t, at('9-03', 2.0), at('9-04')));
    if (t > CUES.wave) st.cards.storm.n = Math.round(st.cards.storm.n * (1 - 0.5 * ease(t, CUES.wave, CUES.wave + 1)));
  }
  // the kings cower, clutch their heads, shut their eyes; then frozen, staring at the pair
  for (const k of KINGS) {
    const s = st.kings[k.id];
    if (t < at('9-04')) {
      const cower = ease(t, at('9-01', 0.3), at('9-03'));
      s.lean = 0.25 * cower; s.slump = 0.04 * cower;
      const head = kf(k.id, 0.12, 1.0 * sizeAt(t, k.id), 0);
      if (t > at('9-03', 0.5)) { s.armL = { target: [head[0], head[1] + 0.08, head[2] + 0.13] }; s.armR = { target: [head[0], head[1] + 0.08, head[2] - 0.13] }; s.hand = { L: 'open', R: 'open' }; }
      s.face = face(t > at('9-03', 2.2) ? 'shut' : 'fear', { socket: 0.35 });
      s.look = t < at('9-03') ? [0, 1.8, 0] : [0, 0.6, 0];
    } else if (t < CUES.wave) {
      s.lean = 0.12; s.look = [0, top(), 0]; s.face = face('shock', { socket: 0.3 });
    }
  }
  if (t > at('9-05')) st.kings.openai.face = face('shock', { eyes: 'wide', pupil: ease(t, at('9-06', 0.2), at('9-06', 0.9)), socket: 0.3 });
  if (t > at('9-04', 1.1) && t < CUES.bomb) st.look.smoke = 0.35;
  if (t >= CUES.bomb && t < end('9-07')) { st.look.flash = 1 - 0.75 * ease(t, CUES.bomb + 0.15, end('9-07')); st.look.flashCol = '#fff8ea'; }
  st.look.alarmWash = 0;
}

export const SHOTS = {
  // ---- the lid punched up from inside: white
  '8-01': (t, st, w) => { M1(w.camera, 0.6); st.look.flash = 1; st.look.flashCol = '#fff6e0'; },
  // ---- the march sticks on one note; arms frozen mid-toast; ash drops
  '8-02': (t, st, w) => { const h = hd('google', t); camLook(w.camera, [h[0] - 0.9, h[1] + 0.05, h[2] + 0.75], [h[0] - 0.06, h[1] - 0.12, h[2] + 0.02], 40); },
  // ---- both lids lift from inside; gold pours up; the jokers rise and hang, turning
  '8-03': (t, st, w) => { const u = uRow(t, '8-03'); camLook(w.camera, [0, 1.15 + 0.15 * u, 1.6 - 0.5 * u], [0, 0.85 + 0.35 * u, -2.0], 52); st.look.exposure = 1.4; st.look.p2 = { pos: [0, 0.7, -1.2], col: [1.1, 0.85, 0.45].map((c) => c * ease(t, at('8-03', 0.3), at('8-03', 1.5))), range: 4.5 }; },
  // ---- heads go up; cigars fall from mouths; eyes wide behind the masks
  '8-04': (t, st, w) => { camLook(w.camera, [-0.45, 1.35, 0.9], [1.5, 0.9, -1.5], 50); st.look.exposure = 1.35; },
  // ---- the beacon turns; Claude jabs CANCEL a dozen times; it is grey; his strung arm keeps throwing
  '8-05': (t, st, w) => { const b = AUTO_BTN('anthropic'); camLook(w.camera, [b[0] - 0.08, 0.42, b[2] + 0.62], [b[0] + 0.1, 0.12, b[2] + 0.02], 48); st.look.p3 = { pos: [b[0] - 0.3, 0.5, b[2] + 0.3], col: [1.2, 0.5, 0.4], range: 1.4 }; },
  // ---- the giants swing their seals at the jokers; the storm catches the chains and holds them in mid-air
  '8-06': (t, st, w) => {
    const u = uRow(t, '8-06');
    camLook(w.camera, [0, 0.9 + 0.1 * u, 2.6 - 0.2 * u], [0, lerp(2.9, 2.0, Math.min(1, u * 1.6)), -0.9], 60); st.look.exposure = 1.5;
    if (st.cards.storm) st.cards.storm.keepOut = 1.3;
    const us = st.props.seals?.US?.pos, cn = st.props.seals?.CN?.pos;
    if (us) st.look.p2 = { pos: [us[0] - 0.4, us[1] - 0.5, us[2] + 0.9], col: [1.6, 1.5, 1.3], range: 2.4 };
    if (cn) st.look.p3 = { pos: [cn[0] + 0.4, cn[1] - 0.5, cn[2] + 0.9], col: [1.6, 1.5, 1.3], range: 2.4 };
  },
  // ---- seq 9: launch
  '9-01': (t, st, w) => { trackJoker(w.camera, t, 'CN'); st.look.exposure = 1.5; },
  '9-02': (t, st, w) => { trackJoker(w.camera, t, 'US'); st.look.exposure = 1.5; },
  // ---- the approach: wide, kings ducking, head-on (5 cuts)
  '9-03': (t, st, w, shot) => {
    const i = +shot.id.split('.')[1];
    if (i === 1) camLook(w.camera, [0, 2.5, 4.6], [0, 0.9, -0.8], 50);
    else if (i === 2) trackJoker(w.camera, t, 'CN');
    else if (i === 3) camLook(w.camera, kf('anthropic', 1.15, 0.75, 0.55), kf('anthropic', 0.1, 0.95, -0.1), 40);
    else if (i === 4) trackJoker(w.camera, t, 'US');
    else { const a = jokerFlight(t, 'CN').pos, b = jokerFlight(t, 'US').pos; const m = lerp3(a, b, 0.5); camLook(w.camera, [m[0], m[1] + 0.05, m[2] - 1.15], m, 38); }
    st.look.exposure = 1.5;
  },
  // ---- slow: they pass, turn, and lie down side by side
  '9-04': (t, st, w) => { const T = top(), u = uRow(t, '9-04'); camLook(w.camera, [0.0, T + 0.6 - 0.15 * u, 0.75 - 0.2 * u], [0, T + 0.1 - 0.06 * u, 0], 42); st.look.exposure = 1.4; },
  // ---- straight down, perfectly symmetric, everything frozen (3.5 s of digital silence)
  '9-05': (t, st, w) => { const T = top(); camLook(w.camera, [0, T + 0.62, 0.0], [0, T, 0], 50); st.look.smoke = 0.3; st.look.flash = 0; st.look.exposure = 1.35; },
  // ---- OpenAI's eye; the first sound is his heartbeat
  '9-06': (t, st, w) => { st.camAttach = { kind: 'eye', id: 'openai', side: 'R', dist: 0.2, fov: 40 }; camLook(w.camera, kf('openai', 0.4, 0.98, 0), hd('openai', t), 24); },
  '9-07': (t, st, w) => camLook(w.camera, [0, 2.5, 4.6], [0, 0.6, -0.8], 50),
  // ---- the shockwave: every card flips to the AI's black and gold; the kings pinned to their chair backs
  '9-08': (t, st, w) => {
    const u = clamp((t - at('9-08')) / 1.2, 0, 1);
    camLook(w.camera, [0, 2.7, 2.6], [0, 0.1, -0.6], 56); st.look.p3 = { pos: [0, 2.2, 2.2], col: [0.9, 0.8, 0.6], range: 6 };
    for (const k of KINGS) { st.kings[k.id].blown = smooth(u * 2); st.kings[k.id].face = face('fear', { socket: 0.3 }); st.kings[k.id].look = [0, 0.4, 0]; st.kings[k.id].armL = { target: kf(k.id, 0.1, 1.1, 0.25) }; st.kings[k.id].armR = { target: kf(k.id, 0.1, 1.1, -0.25) }; }
    st.look.flash = 0.35 * (1 - u);
    st.look.smoke = 0.8;
    st.look.p2 = { pos: [0, 0.9, 0], col: [2.6 * (1 - 0.5 * u), 1.9 * (1 - 0.5 * u), 0.8], range: 6 };
    st.look.exposure = 1.45;
  },
};
void KING; void BOX; void SIDE_SIGN; void end;
