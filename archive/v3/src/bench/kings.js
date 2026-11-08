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
//   500..509   the lineup: head-and-shoulders, the same framing for all ten (portrait tiles), order as 100..109
//   520 + 10 j + e   the reel's expressions (SHEET) at a phone-size medium shot (head ~1/4 of the frame): j = 0 OpenAI, 2 DeepSeek
//   600 + u    6-02: DeepSeek and OpenAI pressed flat (flat = u, OpenAI a beat later), from the table's centre line
//   601 + u    the pressed DeepSeek card carried away (cardAt), turning to the camera
//   602 + u    6-03 from M1: the rows pressed flat one after another (u = 0..1 over all ten)
//   603        the stamp grip: both head kings, right fist thumb-up, fingers level (a vertical handle through gripFrame)
//   604        M1 framing, the kings looking across the table, a little extra exposure (to judge the silhouettes)
import * as THREE from 'three';
import { makeKings } from '../kings.js';
import { makeSet } from '../set.js';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { KINGS, KING, M1, SIDE_SIGN, seatPos } from '../layout.js';

// the reel's faces (x: extra king state: sweat, head pitch)
export const SHEET = [
  ['calm', { eyes: 'open', brows: 'flat', mouth: 'flat' }],
  ['read', { eyes: 'down', brows: 'knit', mouth: 'flat' }, { head: { yaw: 0, pitch: -0.32, roll: 0 } }],
  ['nod', { eyes: 'closed', brows: 'flat', mouth: 'flat' }, { head: { yaw: 0, pitch: -0.18, roll: 0 } }],
  ['glare', { eyes: 'glare', brows: 'angry', mouth: 'frown' }],
  ['blank', { eyes: 'blank', brows: 'raised', mouth: 'slack' }],
  ['fear', { eyes: 'wide', brows: 'worried', mouth: 'open' }, { sweat: 1 }],
  ['awe', { eyes: 'up', brows: 'raised', mouth: 'o' }, { head: { yaw: 0, pitch: 0.38, roll: 0 } }],
  ['terror', { eyes: 'wide', brows: 'worried', mouth: 'scream' }, { sweat: 0.6 }],
  ['grit', { eyes: 'narrow', brows: 'angry', mouth: 'grit' }],
  ['smug', { eyes: 'narrow', brows: 'arch', mouth: 'smirk' }],
];
export const EXPR = SHEET;
const IDS = KINGS.map((k) => k.id);
const ORDER = ['openai', 'anthropic', 'google', 'xai', 'meta', 'deepseek', 'qwen', 'kimi', 'glm', 'doubao'];

export function setup({ scene, camera }) {
  const set = makeSet({ scene, camera }); scene.add(set.root);
  const kings = makeKings({ scene, camera }); scene.add(kings.root);
  const H = new THREE.Vector3(), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  // stand-in stamp handles for the grip check (a wooden dowel 4 cm thick, 16 cm long)
  const handles = {};
  for (const id of ['deepseek', 'openai']) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.16, 16), celMaterial({ color: "#8a5a30", id: 10, gloss: 0.3 }));
    h.visible = false; scene.add(h); handles[id] = h;
  }
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
    G.uP3Col.value.setRGB(0, 0, 0);
    const gold = () => { G.uP3Pos.value.set(0, 2.4, -3.4); G.uP3Col.value.setRGB(2.2, 1.6, 0.7); G.uP3Range.value = 6.0; };   // the card king's gold
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
      if (e < SHEET.length) { st[id].face = { ...SHEET[e][1], socket: 0.3 }; Object.assign(st[id], SHEET[e][2] ?? {}); }
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
      if (e < SHEET.length) { st[id].face = { ...SHEET[e][1], socket: 0.3 }; Object.assign(st[id], SHEET[e][2] ?? {}); }
      st[id].look = undefined;
      after = () => portrait(cam, id, { yaw: 0.22, dist: 1.5, fov: 25, up: 0.03, dy: 0.045 });
    } else if (i >= 200 && i < 400) {
      const id = IDS[Math.floor((i - 200) / 20)], E = SHEET[((i - 200) % 20) % SHEET.length];
      st[id].face = { ...E[1], socket: 0.3 }; Object.assign(st[id], E[2] ?? {}); st[id].look = undefined;
      after = () => portrait(cam, id, { yaw: 0.3, dist: 1.0 });
    }
    else if (i >= 500 && i <= 509) {
      // the lineup: the same head-and-shoulders framing for every king, eyes to the lens
      const id = ORDER[i - 500], tow = KING[id].side === 'US' ? 1 : -1;
      st[id].look = undefined;
      st[id].face = { eyes: 'open', brows: 'flat', mouth: 'flat', look: [0.3 * tow, 0.04], socket: 0.3 };
      after = () => portrait(cam, id, { yaw: 0.3, dist: 1.25, fov: 26, up: 0.03, dy: -0.02 });
    } else if (i >= 520 && i < 550) {
      const j = Math.floor((i - 520) / 10), e = (i - 520) % 10, id = ['openai', 'anthropic', 'deepseek'][j];
      st[id].face = { ...SHEET[e][1], socket: 0.3 }; Object.assign(st[id], SHEET[e][2] ?? {});
      st[id].look = undefined;
      after = () => portrait(cam, id, { yaw: 0.3, dist: 1.9, fov: 28, up: 0.05, dy: -0.07 });
    } else if (i >= 600 && i <= 602 && !(i === 601 || i === 602) || (i >= 605 && i <= 607)) {
      // 6-02: both head kings pressed flat, OpenAI a beat after DeepSeek (gold light from the card king above).
      // 600: both from the sea; 605: DeepSeek face-on; 606: OpenAI face-on; 607: both, from behind DeepSeek's shoulder
      for (const id of ['deepseek', 'openai']) Object.assign(st[id], { look: [0, 2.6, -4.2], face: { eyes: 'up', brows: 'worried', mouth: 'o' }, sweat: 0.6 });
      st.deepseek.flat = Math.min(1, u * 1.6);
      st.openai.flat = Math.max(0, Math.min(1, u * 1.6 - 0.5));
      if (i === 600) { cam.fov = 64; cam.position.set(0, 1.3, -0.5); cam.lookAt(0, 0.6, -2.6); }
      else if (i === 605) { cam.fov = 40; cam.position.set(-0.25, 1.0, -2.05); cam.lookAt(-1.62, 0.62, -2.55); }
      else if (i === 606) { cam.fov = 40; cam.position.set(0.25, 1.0, -2.05); cam.lookAt(1.62, 0.62, -2.55); }
      else { cam.fov = 40; cam.position.set(-0.75, 1.15, -1.45); cam.lookAt(-1.62, 0.62, -2.5); }
      gold();
    } else if (i === 601) {
      // the pressed card carried up toward the throne, turning to face the camera
      st.deepseek.flat = 1; st.deepseek.face = { eyes: 'up', brows: 'worried', mouth: 'o' }; st.deepseek.look = [0, 2.6, -4.2];
      kings.update(st, t);
      const M0 = kings.cardFrame('deepseek', new THREE.Matrix4());
      const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(); M0.decompose(p0, q0, s0);
      const p1 = new THREE.Vector3(-0.35, 1.45, -2.7), q1 = new THREE.Quaternion();
      const e = u * u * (3 - 2 * u);
      st.deepseek.cardAt = new THREE.Matrix4().compose(p0.clone().lerp(p1, e), q0.clone().slerp(q1, e), new THREE.Vector3(1, 1, 1));
      cam.fov = 40; cam.position.set(-0.3, 1.3, -0.6); cam.lookAt(-0.5, 1.15, -2.6);
      gold();
    } else if (i === 602) {
      // 6-03: one after another, head to foot, alternating sides
      const order = ['deepseek', 'openai', 'qwen', 'anthropic', 'kimi', 'google', 'glm', 'xai', 'doubao', 'meta'];
      order.forEach((id, n) => { st[id].flat = Math.max(0, Math.min(1, (u * 11 - n) / 1.2)); st[id].face = { eyes: 'up', brows: 'worried', mouth: 'o' }; st[id].look = [0, 2.6, -4.2]; });
      cam.fov = M1.fov; cam.position.set(...M1.pos); cam.lookAt(...M1.look);
    } else if (i === 603) {
      // the stamp grip: right fist, thumb up, fingers level toward the table, the palm facing his middle
      for (const id of ['deepseek', 'openai']) {
        const p = seatPos(id), fx = fwd(id);
        st[id].hand = { L: 'rest', R: 'fist' };
        st[id].look = undefined; st[id].head = { yaw: 0, pitch: -0.3, roll: 0 };
        st[id].face = { eyes: 'down', brows: 'knit', mouth: 'flat' };
        st[id].armR = { target: [p[0] + fx * 0.62, 0.2, p[2] + (KING[id].side === 'US' ? -1 : 1) * -0.05], pole: [0, -0.6, 0], fingers: [fx, 0, 0], palm: [0, 0, KING[id].side === 'US' ? 1 : -1] };
      }
      cam.fov = 34; cam.position.set(-0.55, 0.85, -1.2); cam.lookAt(-1.05, 0.35, -2.4);
      if (u > 0.5) { cam.position.set(0.55, 0.85, -1.2); cam.lookAt(1.05, 0.35, -2.4); }
      after = () => {
        // a stand-in handle through each fist's hole (props draws the real stamp)
        for (const id of ['deepseek', 'openai']) {
          kings.gripFrame(id, 'R', M); M.decompose(P, Q, S);
          const h = handles[id]; h.position.copy(P); h.quaternion.copy(Q); h.visible = true;
        }
      };
    } else if (i === 604) {
      for (const id of IDS) st[id].look = kings.headWorld(IDS.find((o) => KING[o].side !== KING[id].side && KING[o].seat === KING[id].seat), new THREE.Vector3()).toArray();
      cam.fov = M1.fov; cam.position.set(...M1.pos); cam.lookAt(...M1.look);
      look.exposure = 2.2;
    }
    for (const h of Object.values(handles)) if (i !== 603) h.visible = false;
    kings.update(st, t);
    if (after) { after(); kings.update(st, t); }
    return look;
  };
}
