// JOKERS WILD — the director: for any film time t, the camera and the state of every module.
// The world state comes first (dir/world.js); a sequence module may then adjust its whole stretch (apply), and the
// shot's own function places the camera and refines its moment.
import { shotAt } from './shots.js';
import { base } from './dir/world.js';
import { M1 } from './dir/core.js';
import * as S1 from './dir/s1.js';
import * as S2 from './dir/s2.js';
import * as S3 from './dir/s3.js';
import * as S4 from './dir/s4.js';
import * as S5 from './dir/s5.js';
import * as S6 from './dir/s6.js';
import * as S78 from './dir/s78.js';
import * as S9 from './dir/s9.js';
import * as S10 from './dir/s10.js';

const MODS = [S1, S2, S3, S4, S5, S6, S78, S9, S10];
const SHOTS = Object.assign({}, ...MODS.map((m) => m.SHOTS));

export function direct(t, world) {
  const shot = shotAt(t);
  const st = base(t, world);
  st.shot = shot;
  for (const m of MODS) if (m.apply && t >= m.RANGE[0] && t < m.RANGE[1]) m.apply(t, st, world);
  const fn = SHOTS[shot.row];
  if (fn) fn(t, st, world, shot); else M1(world.camera);
  return st;
}
