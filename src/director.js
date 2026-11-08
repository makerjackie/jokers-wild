// 《失控》 — the director: for any film time t, the camera and the state of every module. The world state comes first
// (dir/reel.js, from the story data in dir/story.js); the shot's own function (dir/cams.js) places the camera and
// refines its moment.
import { shotAt } from './shots.js';
import { base } from './dir/reel.js';
import { SHOTS } from './dir/cams.js';
import { M1 } from './dir/core.js';

export function direct(t, world) {
  const shot = shotAt(t);
  const st = base(t, world);
  st.shot = shot;
  const fn = SHOTS[shot.row];
  if (fn) fn(t, st, world, shot); else M1(world.camera);
  // phones: a notch brighter and less vignetted than the noir default
  st.look.exposure = (st.look.exposure ?? 1.28) * 1.32;
  st.look.vignette = Math.min(st.look.vignette ?? 0.45, 0.5);
  world.camera.near = st.look.near ?? 0.03;
  world.camera.far = st.look.far ?? 200;
  return st;
}
export const SHOT_FNS = SHOTS;
