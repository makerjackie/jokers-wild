// JOKERS WILD v2 — the director: for any film time t, the camera and the state of every module.
// The world state comes first (dir/world.js); a sequence module may then adjust its whole stretch (apply), and the
// shot's own function places the camera and refines its moment.
import { shotAt } from './shots.js';
import { base } from './dir/world.js';
import { M1 } from './dir/core.js';
import * as S1 from './dir/s1.js';
import * as S4 from './dir/s4.js';
import * as S6 from './dir/s6.js';
import * as S8 from './dir/s8.js';
import * as S10 from './dir/s10.js';

const MODS = [S1, S4, S6, S8, S10];
const SHOTS = Object.assign({}, ...MODS.map((m) => m.SHOTS));

export function direct(t, world) {
  const shot = shotAt(t);
  const st = base(t, world);
  st.shot = shot;
  for (const m of MODS) if (m.apply && t >= m.RANGE[0] && t < m.RANGE[1]) m.apply(t, st, world);
  const fn = SHOTS[shot.row];
  if (fn) fn(t, st, world, shot); else M1(world.camera);
  // v2 readability: the whole film a notch brighter and less vignetted than v1's noir (phones)
  st.look.exposure = (st.look.exposure ?? 1.28) * 1.2;
  const cp = world.camera.position;
  if (!st.look.p3 && Math.hypot(cp.x, cp.z) > 6.5 && !st.look.fade) st.look.p3 = { pos: [0, 3.2, Math.min(cp.z, 8)], col: [0.8, 0.72, 0.62], range: 14 };
  st.look.vignette = Math.min(st.look.vignette ?? 0.45, 0.6);
  return st;
}
export const SHOT_FNS = SHOTS;
