// Bench for the kings: ?bench=kings. The integer part of t picks a setup, the fraction animates some of them.
//   0          M1 (the film's motif wide), everyone masked, neutral            1  M1 pushed in halfway
//   2          the US row across the table (from the CN side)                   3  the CN row across the table
//   4          both rows, a high wide from the foot under the lamp (style_row)  5  both rows from the head, low
//   10..19     close 3/4 portraits, neutral, in KINGS order (deepseek qwen kimi glm doubao openai anthropic google xai meta)
//   20..29     frontal portraits, same order
//   30 + 10 j + e   expression e (SHEET) close up: j = 0 OpenAI, 1 Claude, 2 DeepSeek
//   60 + 10 j + e   the same at a medium shot (head about a fifth of the frame height)
//   89 + u     the CN head end: DeepSeek entering (enter u), Qwen half-standing and sweating, Kimi swollen
//   90 + u     the US head end: OpenAI swollen (size 1.4, rise 1, sweat 1, crownTilt 0.3), Claude entering (enter u), Google dozing
//   91 + u     the US foot end: Google dozing, xAI half-standing, Meta entering (enter u)
//   92         close-up: the swollen OpenAI (size 1.4, rise 1, sweat 1, crownTilt 0.3)
//   93         close-up: Google dozing                                          94  Claude sweating, crown askew (6-08)
//   95         OpenAI from the side, lean 0.35 (forward) and blown (u > 0.5), the skirt check
//   96         OpenAI and DeepSeek face to face across the sea (11-01)
//   97         OpenAI's eye through the mask, extreme close-up (9-06); 97.5 wide eyes
//   98         every king swollen and half-standing (madness, 6-07), from high over the foot
//   100..109   style-frame portraits (portrait-aspect tiles): openai anthropic google xai meta, deepseek qwen kimi glm doubao
//   110 + 10 j + e   style-frame expressions (2:3 tiles), j and e as for 30..
//   200 + 20 k + e   any king k (KINGS order) with expression e (SHEET), close 3/4 portrait
import * as THREE from 'three';
import { makeKings } from '../kings.js';
import { makeSet } from '../set.js';
import { G } from '../glsl.js';
import { KINGS, KING, M1, SIDE_SIGN, seatPos } from '../layout.js';

export const SHEET = [
  ['calm', { eyes: 'open', brows: 'flat', mouth: 'flat' }],
  ['sly', { eyes: 'narrow', brows: 'arch', mouth: 'grin' }],
  ['shock', { eyes: 'wide', brows: 'raised', mouth: 'o' }],
  ['terror', { eyes: 'wide', brows: 'worried', mouth: 'scream' }],
  ['rage', { eyes: 'glare', brows: 'angry', mouth: 'grit' }],
  ['gloom', { eyes: 'down', brows: 'worried', mouth: 'frown' }],
  ['side-eye', { eyes: 'side', brows: 'flat', mouth: 'smirk', look: [1, 0] }],
  ['laugh', { eyes: 'shut', brows: 'raised', mouth: 'laugh' }],
  ['open', { eyes: 'open', brows: 'raised', mouth: 'open' }],
];
export const EXPR = SHEET;
const IDS = KINGS.map((k) => k.id);

export function setup({ scene, camera }) {
  const set = makeSet({ scene, camera }); scene.add(set.root);
  const kings = makeKings({ scene, camera }); scene.add(kings.root);
  const H = new THREE.Vector3(), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  // the king's own frame: f toward the table, u up, s toward the foot (+z)
  const kf = (id, f, u, s) => { const p = seatPos(id), sx = SIDE_SIGN[KING[id].side]; return [p[0] - sx * f, p[1] + u, p[2] + s]; };
  const fwd = (id) => -SIDE_SIGN[KING[id].side];
  function portrait(cam, id, { dist = 1.15, yaw = 0.55, up = 0.04, fov = 22, dy = 0.0 } = {}) {
    kings.headWorld(id, H);
    const fx = fwd(id), c = Math.cos(yaw), s = Math.sin(yaw);
    cam.position.set(H.x + fx * c * dist, H.y + up, H.z + s * dist);
    cam.up.set(0, 1, 0); cam.fov = fov; cam.lookAt(H.x, H.y + dy, H.z);
  }
  return (t, cam) => {
    const i = Math.floor(t + 1e-6), u = t - i;
    const st = {};
    for (const id of IDS) st[id] = { face: { eyes: 'open', brows: 'flat', mouth: 'flat', socket: 0.3 }, look: [0, 0.25, seatPos(id)[2] * 0.6] };
    set.update({}, t); set.lampBulb(G.uLampPos.value);
    cam.up.set(0, 1, 0);
    let after = null;
    const look = { style: 'noir', exposure: 1.3 };
    const mixed = () => IDS.forEach((id, n) => { st[id].face = { ...SHEET[(n * 3 + 1) % 8][1] }; });
    if (i === 0) { cam.fov = M1.fov; cam.position.set(...M1.pos); cam.lookAt(...M1.look); }
    else if (i === 1) { cam.fov = M1.fov; cam.position.set(0, 2.0, 6.6); cam.lookAt(0, 0.85, -2.2); }
    else if (i === 2) { mixed(); cam.fov = 38; cam.position.set(-1.0, 1.2, 0.2); cam.lookAt(1.6, 0.72, 0.0); }
    else if (i === 3) { mixed(); cam.fov = 38; cam.position.set(1.0, 1.2, -0.2); cam.lookAt(-1.6, 0.72, 0.0); }
    else if (i === 4) { if (u > 0.4) mixed(); cam.fov = 46; cam.position.set(0, 2.55, 5.35); cam.lookAt(0, 0.42, -0.75); }
    else if (i === 5) { mixed(); cam.fov = 40; cam.position.set(0, 1.05, -3.9); cam.lookAt(0, 0.5, 1.0); }
    else if (i >= 10 && i <= 19) { const id = IDS[i - 10]; st[id].look = undefined; after = () => portrait(cam, id, { yaw: 0.42, dist: 1.05, up: 0.03, fov: 24, dy: 0.01 }); }
    else if (i >= 20 && i <= 29) { const id = IDS[i - 20]; after = () => portrait(cam, id, { yaw: 0.0, dist: 1.0 }); }
    else if (i >= 30 && i < 90) {
      const medium = i >= 60, j = Math.floor(((i - 30) % 30) / 10), e = (i - 30) % 10;
      const id = ['openai', 'anthropic', 'deepseek'][j];
      if (e < SHEET.length) st[id].face = { ...SHEET[e][1], socket: 0.3 };
      st[id].look = undefined;
      after = () => (medium ? portrait(cam, id, { yaw: 0.32, dist: 3.1, fov: 30, up: 0.05, dy: -0.12 }) : portrait(cam, id, { yaw: 0.2, dist: 1.25, fov: 24, up: 0.02, dy: 0.02 }));
    } else if (i === 89 || i === 90 || i === 91) {
      if (i === 90) {
        // (d) one frame: OpenAI swollen and half-standing, Claude sliding in with his chair, Google dozing
        Object.assign(st.openai, { size: 1.4, rise: 1, sweat: 1, crownTilt: 0.3, look: undefined, face: { eyes: 'wide', brows: 'angry', mouth: 'scream' }, hand: { L: 'fist', R: 'open' } });
        Object.assign(st.anthropic, { enter: u || 0.55, look: undefined, face: { eyes: 'narrow', brows: 'flat', mouth: 'smirk' } });
        Object.assign(st.google, { slump: 0.06, head: { yaw: 0, pitch: -0.42, roll: 0.08 }, look: undefined, lean: 0.16, face: { eyes: 'shut', brows: 'flat', mouth: 'o' } });
        cam.fov = 60; cam.position.set(-0.95, 1.5, -0.55); cam.lookAt(1.6, 0.8, -1.35);
      } else if (i === 91) {
        Object.assign(st.google, { slump: 0.06, head: { yaw: 0, pitch: -0.42, roll: 0.08 }, look: undefined, lean: 0.16, face: { eyes: 'shut', brows: 'flat', mouth: 'o' } });
        Object.assign(st.meta, { enter: u || 0.6 });
        Object.assign(st.xai, { rise: 0.6, sweat: 0.6, crownTilt: -0.2, face: { eyes: 'glare', brows: 'angry', mouth: 'grit' } });
        cam.fov = 56; cam.position.set(-0.85, 1.42, 1.45); cam.lookAt(1.6, 0.68, 1.25);
      } else {
        Object.assign(st.deepseek, { enter: u || 0.6, face: { eyes: 'narrow', brows: 'flat', mouth: 'flat' } });
        Object.assign(st.qwen, { rise: 1, sweat: 1, size: 1.2, crownTilt: 0.25, face: { eyes: 'wide', brows: 'worried', mouth: 'open' } });
        Object.assign(st.kimi, { size: 1.15, face: { eyes: 'glare', brows: 'angry', mouth: 'grin' } });
        cam.fov = 56; cam.position.set(0.85, 1.42, -0.95); cam.lookAt(-1.6, 0.68, -1.15);
      }
    } else if (i === 92) {
      Object.assign(st.openai, { size: 1.4, rise: 1, sweat: 1, crownTilt: 0.3, look: undefined, face: { eyes: 'wide', brows: 'angry', mouth: 'scream' }, hand: { L: 'fist', R: 'open' } });
      after = () => portrait(cam, 'openai', { yaw: 0.35, dist: 1.5, fov: 28, up: 0.0, dy: -0.06 });
    } else if (i === 93) {
      Object.assign(st.google, { slump: 0.06, head: { yaw: 0, pitch: -0.42, roll: 0.08 }, look: undefined, lean: 0.16, face: { eyes: 'shut', brows: 'flat', mouth: 'o' } });
      after = () => portrait(cam, 'google', { yaw: 0.45, dist: 1.25, fov: 28, up: 0.12, dy: -0.04 });
    } else if (i === 94) {
      Object.assign(st.anthropic, { rise: 0.3, sweat: 1, crownTilt: 0.32, lean: 0.12, look: undefined, head: { yaw: 0, pitch: -0.1, roll: 0 }, face: { eyes: 'down', brows: 'worried', mouth: 'open', socket: 0.35 } });
      after = () => portrait(cam, 'anthropic', { yaw: 0.28, dist: 0.95, fov: 26, up: -0.02, dy: -0.02 });
    } else if (i === 95) {
      Object.assign(st.openai, u < 0.5 ? { lean: 0.35, rise: 0 } : { blown: 1 });
      st.openai.look = undefined; st.anthropic.enter = 0; st.google.enter = 0;
      const p = seatPos('openai');
      cam.fov = 34; cam.position.set(p[0] + 0.3, 0.55, p[2] + 2.8); cam.lookAt(p[0], 0.3, p[2]);
    } else if (i === 96) {
      st.openai.look = kings.headWorld('deepseek', new THREE.Vector3()).toArray();
      st.deepseek.look = kings.headWorld('openai', new THREE.Vector3()).toArray();
      st.openai.face = { eyes: 'narrow', brows: 'angry', mouth: 'flat' }; st.deepseek.face = { eyes: 'narrow', brows: 'flat', mouth: 'flat' };
      st.openai.size = 1.35; st.deepseek.size = 0.9;
      cam.fov = 46; cam.position.set(0, 0.9, 0.9); cam.lookAt(0, 0.6, -2.5);
    } else if (i === 97) {
      const id = 'openai';
      st[id].face = { eyes: u < 0.5 ? 'open' : 'wide', brows: u < 0.5 ? 'flat' : 'raised', mouth: 'flat', socket: 0.3 };
      st[id].look = undefined;
      after = () => {
        kings.eyeFrame(id, 'L', M); M.decompose(P, Q, S);
        const z = new THREE.Vector3(0, 0, 1).applyQuaternion(Q), y = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
        cam.position.copy(P).addScaledVector(z, 0.1).addScaledVector(y, 0.003);
        cam.up.copy(y); cam.fov = 40; cam.lookAt(P);
      };
    } else if (i === 98) {
      for (const id of IDS) Object.assign(st[id], { size: id === 'deepseek' ? 1.0 : id === 'openai' ? 1.5 : 1.3, rise: 1, sweat: 0.7, crownTilt: 0.2 * Math.sin(IDS.indexOf(id) * 2.3), face: { eyes: 'wide', brows: 'angry', mouth: 'scream' } });
      cam.fov = 48; cam.position.set(0, 2.75, 5.9); cam.lookAt(0, 0.5, -1.6);
    } else if (i >= 100 && i <= 109) {
      // style frame portraits (portrait-aspect tiles): US on top, CN below; eyes to the lens
      const id = ['openai', 'anthropic', 'google', 'xai', 'meta', 'deepseek', 'qwen', 'kimi', 'glm', 'doubao'][i - 100];
      const tow = KING[id].side === 'US' ? 1 : -1;
      st[id].look = undefined;
      st[id].face = { eyes: 'open', brows: 'flat', mouth: 'flat', look: [0.32 * tow, 0.05], socket: 0.3 };
      after = () => portrait(cam, id, { yaw: 0.34, dist: 1.5, fov: 25, up: 0.04, dy: 0.035 });
    } else if (i >= 110 && i < 140) {
      // style frame expressions (2:3 tiles): j = 0 OpenAI, 1 Claude, 2 DeepSeek; e = SHEET index
      const j = Math.floor((i - 110) / 10), e = (i - 110) % 10, id = ['openai', 'anthropic', 'deepseek'][j];
      if (e < SHEET.length) st[id].face = { ...SHEET[e][1], socket: 0.3 };
      st[id].look = undefined;
      after = () => portrait(cam, id, { yaw: 0.22, dist: 1.5, fov: 25, up: 0.03, dy: 0.045 });
    } else if (i >= 200 && i < 400) {
      const id = IDS[Math.floor((i - 200) / 20)], e = SHEET[((i - 200) % 20) % SHEET.length][1];
      st[id].face = { ...e, socket: 0.3 }; st[id].look = undefined;
      after = () => portrait(cam, id, { yaw: 0.3, dist: 1.0 });
    }
    kings.update(st, t);
    if (after) { after(); kings.update(st, t); }
    return look;
  };
}
