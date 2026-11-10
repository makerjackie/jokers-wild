// JOKERS WILD — director helpers shared by every sequence module.
import * as THREE from 'three';
import { ROW } from '../shots.js';
import { KING, SIDE_SIGN, SEAT, seatPos, M1 as M1CAM } from '../layout.js';
import { clamp, smooth, lerp, lerp3 } from '../util.js';

export const V = new THREE.Vector3();
export const at = (id, k = 0) => ROW[id].t0 + k;
export const end = (id, k = 0) => ROW[id].t1 + k;
export const dur = (id) => ROW[id].t1 - ROW[id].t0;
export const inRow = (t, id) => t >= ROW[id].t0 && t < ROW[id].t1;
export const uRow = (t, id) => clamp((t - ROW[id].t0) / (ROW[id].t1 - ROW[id].t0), 0, 1);
export const sp = (id) => seatPos(id);
export const off = (id, dx, dy, dz) => { const p = sp(id); return [p[0] + dx, p[1] + dy, p[2] + dz]; };
// offsets in a king's own frame: f = toward the table, u = up, s = toward the foot (+z)
export const kf = (id, f, u, s) => { const k = KING[id], p = sp(id), sx = SIDE_SIGN[k.side]; return [p[0] - sx * f, p[1] + u, p[2] + s]; };
export const sideOf = (id) => KING[id].side;
export const sx = (id) => SIDE_SIGN[KING[id].side];
// a king's right hand lies toward the foot for CN (facing +x), toward the head for US (facing -x)
export const rightZ = (id) => (KING[id].side === 'CN' ? 1 : -1);

const _ref = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
export function camLook(cam, pos, look, fov = 40, roll = 0) {
  cam.position.set(...pos);
  const fwd = V.set(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]).normalize();
  if (Math.abs(fwd.y) > 0.98) _ref.set(0, 0, -1); else _ref.set(0, 1, 0);   // straight down: screen-up is -z (the throne)
  _r.crossVectors(fwd, _ref).normalize();
  _u.crossVectors(_r, fwd).normalize().applyAxisAngle(fwd, roll);
  cam.up.copy(_u); cam.lookAt(look[0], look[1], look[2]); cam.fov = fov;
}
// the motif: every wide is this frame; `push` 0..1 dollies in along its axis (0.5 = half way to the table's foot)
export function M1(cam, push = 0, dy = 0) {
  const p = M1CAM.pos, l = M1CAM.look;
  const k = push * 0.62;
  camLook(cam, [p[0], p[1] + dy - k * 0.5, p[2] - k * (p[2] - 3.4)], l, M1CAM.fov);
}
export const lerpPose = (a, b, u) => lerp3(a, b, smooth(u));
// keyed values [[t, value], ...]: hold each, ease to the next over the gap
export function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const a = ks[i - 1][1], b = ks[i][1], u = smooth((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]));
    return Array.isArray(a) ? lerp3(a, b, u) : lerp(a, b, u);
  }
  return ks[ks.length - 1][1];
}
// a damped oscillation summed over impulses: kicks = [[t, amp, freq?, decay?], ...]
export function ring(t, kicks, freq = 1.1, decay = 2.2) {
  let s = 0;
  for (const [t0, a, f = freq, d = decay] of kicks) { const u = t - t0; if (u > 0) s += a * Math.exp(-u / d) * Math.sin(u * f * Math.PI * 2); }
  return s;
}
export const pulse = (t, t0, rise, fall) => (t < t0 ? 0 : t < t0 + rise ? (t - t0) / rise : Math.max(0, 1 - (t - t0 - rise) / fall));
export const AUTO_BTN = (id) => { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.06, 0, SEAT.Z[k.seat] + 0.3]; };
export function kingRest(id, side) {
  const k = KING[id], s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  const along = (side === 'L') === (k.side === 'US') ? 1 : -1;   // which way along z this hand lies
  return [s * 1.1, 0.052, z + along * 0.33];
}
export const FACE = {
  calm: { eyes: 'open', brows: 'flat', mouth: 'flat' },
  smug: { eyes: 'narrow', brows: 'arch', mouth: 'smirk' },
  proud: { eyes: 'narrow', brows: 'raised', mouth: 'grin' },
  sour: { eyes: 'narrow', brows: 'angry', mouth: 'frown' },
  angry: { eyes: 'glare', brows: 'angry', mouth: 'grit' },
  shout: { eyes: 'glare', brows: 'angry', mouth: 'open' },
  worry: { eyes: 'wide', brows: 'worried', mouth: 'flat' },
  shock: { eyes: 'wide', brows: 'raised', mouth: 'o' },
  fear: { eyes: 'wide', brows: 'worried', mouth: 'open' },
  shut: { eyes: 'shut', brows: 'worried', mouth: 'grit' },
  laugh: { eyes: 'closed', brows: 'raised', mouth: 'laugh' },
  side: { eyes: 'side', brows: 'flat', mouth: 'flat' },
  down: { eyes: 'down', brows: 'flat', mouth: 'flat' },
};
export const face = (name, extra = {}) => ({ ...FACE[name], ...extra });

// a camera move through keys [[t, pos, look, fov], ...]: Catmull-Rom through the positions and look points,
// eased in time between the first and last key (holds outside)
const cr = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
export function camPath(cam, t, ks, roll = 0) {
  const n = ks.length;
  if (t <= ks[0][0]) return camLook(cam, ks[0][1], ks[0][2], ks[0][3] ?? 40, roll);
  if (t >= ks[n - 1][0]) return camLook(cam, ks[n - 1][1], ks[n - 1][2], ks[n - 1][3] ?? 40, roll);
  // global ease: map t into a smooth parameter over the whole path, so the move starts and ends gently
  const T0 = ks[0][0], T1 = ks[n - 1][0];
  const g = smooth((t - T0) / (T1 - T0)) * (T1 - T0) + T0;
  let i = 0; while (i < n - 2 && ks[i + 1][0] <= g) i++;
  const u = (g - ks[i][0]) / (ks[i + 1][0] - ks[i][0]);
  const K = (j) => ks[Math.max(0, Math.min(n - 1, j))];
  const pos = [0, 1, 2].map((c) => cr(K(i - 1)[1][c], K(i)[1][c], K(i + 1)[1][c], K(i + 2)[1][c], u));
  const look = [0, 1, 2].map((c) => cr(K(i - 1)[2][c], K(i)[2][c], K(i + 1)[2][c], K(i + 2)[2][c], u));
  const fov = lerp(K(i)[3] ?? 40, K(i + 1)[3] ?? 40, u);
  camLook(cam, pos, look, fov, roll);
}
