// Sequence 9 — 王炸 (2:28–2:43): the two jokers launch from beside the throne like missiles, loop over the storm, nearly
// collide, pass, turn, and settle side by side on the tower of cards: one grin. Straight down, frozen, digital silence.
// OpenAI's eye; a heartbeat; white; the shockwave turns every card to face the kings.
import * as THREE from 'three';
import { KINGS, KING, CASES, JOKER_Y } from '../layout.js';
import { CARD } from '../cards.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, kf, face, keys } from './core.js';
import { pileTop } from './throws.js';

const S = 1.4;                                   // the jokers' scale from the launch on
export const PAIR_LAND = at('9-08', 1.3);         // when they touch down, side by side
const top = () => pileTop(at('9-08')) + 0.006;
// the flight: Catmull-Rom through keys (CN; the US joker is its mirror image)
const crv = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
let KEYS = null;
function flightKeys() {
  if (KEYS) return KEYS;
  const c = CASES.CN, y0 = JOKER_Y + CARD.H / 2 + 0.05 + 1.15, T = top();
  KEYS = [
    [at('9-01'), [c[0] * 0.85, y0, c[2] + 0.1]],
    [at('9-01', 0.5), [-1.5, 2.35, -2.3]],
    [at('9-02', 0.3), [-1.1, 2.75, -0.2]],
    [at('9-03', 0.4), [-0.2, 2.45, 1.6]],
    [at('9-04', 0.3), [0.75, 1.85, 1.2]],
    [at('9-05', 0.3), [0.85, 1.25, 0.1]],
    [at('9-06', 0.2), [0.32, 0.95, -0.12]],
    [at('9-08', 0.15), [-0.02, T + 0.45, 0.0]],      // they pass each other here
    [at('9-08', 0.7), [-0.32, T + 0.3, 0.12]],       // turn
    [PAIR_LAND, [-CARD.W * S * 0.5, T, 0.0]],         // and settle
  ];
  return KEYS;
}
export function jokerFlight(t, side) {
  const K = flightKeys(), n = K.length;
  const m = side === 'CN' ? 1 : -1;
  const P = (j) => { const p = K[Math.max(0, Math.min(n - 1, j))][1]; return [p[0] * m, p[1], p[2]]; };
  if (t >= K[n - 1][0]) return { pos: P(n - 1), vel: [0, -0.01, 0], landed: true };
  let i = 0; while (i < n - 2 && K[i + 1][0] <= t) i++;
  const u = clamp((t - K[i][0]) / (K[i + 1][0] - K[i][0]));
  const pos = [0, 1, 2].map((c) => crv(P(i - 1)[c], P(i)[c], P(i + 1)[c], P(i + 2)[c], u));
  const u2 = Math.min(1, u + 0.02);
  const pos2 = [0, 1, 2].map((c) => crv(P(i - 1)[c], P(i)[c], P(i + 1)[c], P(i + 2)[c], u2));
  return { pos, vel: [pos2[0] - pos[0], pos2[1] - pos[1], pos2[2] - pos[2]] };
}
// a flying card's orientation: its top leads (a dart), banked into the turn; settling: face up, top toward the throne
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
  const t0 = at('9-08', 0.35);
  if (t <= t0 && !f.landed) return flightRot(t, side, f);
  // from the flight attitude at t0 to lying face up, top toward the throne
  const f0 = jokerFlight(t0, side);
  _qa.setFromEuler(_ea.set(...flightRot(t0, side, f0), 'YXZ'));
  _qb.setFromEuler(_ea.set(-Math.PI / 2, 0, 0, 'YXZ'));
  const k = smooth(clamp((t - t0) / (PAIR_LAND - t0)));
  _qa.slerp(_qb, k); _ea.setFromQuaternion(_qa, 'YXZ');
  return [_ea.x, _ea.y, _ea.z];
}

export const RANGE = [at('9-01'), at('10-01')];
export function apply(t, st, w) {
  // ---- the jokers: flying, then side by side on the tower of cards
  for (const side of ['CN', 'US']) {
    const f = jokerFlight(t, side);
    const pos = f.pos.slice();
    if (t > at('9-12')) pos[1] = lerp(pos[1], 0.012, ease(t, at('9-12'), at('9-12', 0.25)));   // the tower under them is gone
    st.cards.jokers[side] = { pos, rot: jokerRot(t, side, f), scale: lerp(1.6, S, ease(t, at('9-01'), at('9-02'))) };
  }
  // the shockwave takes the tower and everything on the table with it (the wave of turned cards replaces them)
  if (t > at('9-12')) st.cards.throws = st.cards.throws.filter((th) => th.land > at('9-12'));
  st.cards.jokerGlow = t < at('9-08') ? 1.0 : lerp(1.0, 0.12, ease(t, at('9-08'), PAIR_LAND));
  // ---- the storm: furious, then slowed (9-08 is slow motion), then frozen dead for 9-09 .. 9-11
  if (st.cards.storm) {
    st.cards.storm.part = 0;
    st.cards.storm.speed = t < at('9-08') ? 1.8 : 0.25;
    st.cards.storm.n = Math.round(st.cards.storm.n * 1.0);
    if (t > at('9-08', 1.2)) st.cards.storm.freeze = at('9-08', 1.2);
    st.cards.storm.clearR = lerp(0.2, 1.0, ease(t, at('9-06'), at('9-08')));
    st.cards.storm.wrap = [];
  }
  // ---- the kings: cower, clutch their heads, shut their eyes; frozen staring at the pair
  for (const k of KINGS) {
    const s = st.kings[k.id];
    if (t < at('9-08')) {
      const cower = ease(t, at('9-01', 0.3), at('9-03'));
      s.lean = 0.25 * cower; s.slump = 0.04 * cower;
      const head = kf(k.id, 0.12, 1.0, 0);
      if (t > at('9-04')) { s.armL = { target: [head[0], head[1] + 0.08, head[2] + 0.13] }; s.armR = { target: [head[0], head[1] + 0.08, head[2] - 0.13] }; s.hand = { L: 'open', R: 'open' }; }
      s.face = face(t > at('9-07') ? 'shut' : 'fear', { socket: 0.35 });
      s.look = t < at('9-04') ? [0, 1.8, 0] : [0, 0.6, 0];
    } else {
      s.lean = 0.12; s.look = [0, top(), 0]; s.face = face('shock', { socket: 0.3 });
    }
  }
  // OpenAI's heartbeat moment: eyes wide, pupil blown
  if (t > at('9-09')) st.kings.openai.face = face('shock', { eyes: 'wide', pupil: ease(t, at('9-10', 0.3), at('9-10', 1.3)), socket: 0.3 });
  // ---- silence is also a look: no beam movement, haze still (the engine's on-threes noise freezes with the storm)
  if (t > at('9-08', 1.2) && t < at('9-11')) st.look.smoke = 0.35;
  // ---- 王炸
  if (t >= at('9-11') && t < end('9-11')) { st.look.flash = 1; st.look.flashCol = '#fff8ea'; }
  st.look.alarmWash = 0;
}

export const SHOTS = {
  // ---- launch: from beside the throne, two missiles
  '9-01': (t, st, w) => { camLook(w.camera, [0, 0.95, 1.6], [0, 1.9, -3.0], 52); st.look.exposure = 1.5; },
  // ---- tracking close: one joker, half a grin (digital silence)
  '9-02': (t, st, w) => trackJoker(w.camera, t, 'CN'),
  '9-03': (t, st, w) => { camLook(w.camera, [0, 2.5, 4.6], [0, 0.7, -0.8], 50); st.look.exposure = 1.55; },
  '9-04': (t, st, w) => trackJoker(w.camera, t, 'US'),
  '9-05': (t, st, w) => { camLook(w.camera, [-0.4, 1.5, 3.0], [0.2, 0.7, -1.2], 54); st.look.exposure = 1.55; },
  // ---- head on: about to collide
  '9-06': (t, st, w) => { const a = jokerFlight(t, 'CN').pos, b = jokerFlight(t, 'US').pos; const m = lerp3(a, b, 0.5); camLook(w.camera, [m[0], m[1] + 0.05, m[2] - 1.1], m, 36); },
  // ---- the kings shut their eyes
  '9-07': (t, st, w) => camLook(w.camera, kf('anthropic', 1.15, 0.75, 0.55), kf('anthropic', 0.1, 0.95, -0.1), 40),
  // ---- slow motion: they pass, turn, and lie down side by side: one face
  '9-08': (t, st, w) => { const T = top(), u = uRow(t, '9-08'); camLook(w.camera, [0.0, T + 0.85 - 0.15 * u, 0.95 - 0.2 * u], [0, T + 0.12 - 0.08 * u, 0], 40); },
  // ---- straight down, perfectly symmetric, everything frozen (3.5 s of digital silence)
  '9-09': (t, st, w) => { const T = top(); camLook(w.camera, [0, T + 1.75, 0.0], [0, T, 0], 70); st.look.smoke = 0.3; st.look.flash = 0; },
  // ---- OpenAI's eye; the first sound is his heartbeat
  '9-10': (t, st, w) => { st.camAttach = { kind: 'eye', id: 'openai', side: 'R', dist: 0.05, fov: 40 }; camLook(w.camera, kf('openai', 0.4, 0.98, 0), kf('openai', 0, 0.98, 0), 24); },
  '9-11': (t, st, w) => camLook(w.camera, [0, 2.5, 4.6], [0, 0.6, -0.8], 50),
  // ---- the shockwave: every card turns to face the kings, who are pinned to their chair backs
  '9-12': (t, st, w) => {
    camLook(w.camera, [0, 3.7, 3.2], [0, 0.2, -0.8], 54);
    const u = clamp((t - at('9-12')) / 1.2, 0, 1);
    for (const k of KINGS) { st.kings[k.id].blown = smooth(u * 2); st.kings[k.id].face = face('fear', { socket: 0.3 }); st.kings[k.id].armL = { target: kf(k.id, 0.1, 1.1, 0.25) }; st.kings[k.id].armR = { target: kf(k.id, 0.1, 1.1, -0.25) }; }
    st.cards.wave = { t0: at('9-12'), n: 650, r0: 0.4, low: true };
    st.look.flash = 0.35 * (1 - u);
    st.look.smoke = 0.8;
    st.look.p2 = { pos: [0, 0.9, 0], col: [2.6 * (1 - 0.5 * u), 1.9 * (1 - 0.5 * u), 0.8], range: 6 };
    st.look.exposure = 1.45;
  },
};
function trackJoker(cam, t, side) {
  const f = jokerFlight(t, side), r = jokerRot(t, side, f);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ'));
  const zf = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yv = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const p = new THREE.Vector3(...f.pos);
  const c = p.clone().addScaledVector(zf, 0.55).addScaledVector(yv, -0.12);
  camLook(cam, c.toArray(), p.clone().addScaledVector(yv, 0.04).toArray(), 34);
}
void KING; void keys; void end;
