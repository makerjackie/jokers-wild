// Bench for the kings: ?bench=kings. The integer part of t picks a setup, the fraction animates some of them.
//   0          M1 (the film's motif wide), everyone neutral
//   1..10      3/4 portraits, neutral, in KINGS order (deepseek qwen kimi glm doubao openai anthropic google xai meta)
//   11..20     frontal portraits, neutral, same order
//   21..31     OpenAI expressions (EXPR below), 41..51 DeepSeek, 61..71 Google, 81..91 Meta
//   200 + 20 k + e   any king k (KINGS order) with expression e (EXPR index), close 3/4 portrait
//   100 + p    OpenAI's eye, extreme close-up for 9-10 (fraction = pupil dilation); 101 wide; 102 narrow; 103 the eye at 3/4
//   110..114   hands: point, fist, open, hold, rest (OpenAI's right hand held out); fraction >= 0.5 seen from the table side
//   115        the pointing chain, medium wide (US side); 116 the same from the foot, everyone pointing
//   120 + u    flattening, u = flat: OpenAI covering his eyes (3/4); 121 + u the same from the side;
//   122 + u    Kimi raising a goblet; 123 + u Claude's finger still on the cancel key
//   124        everyone pressed flat with the debug card outlines (cardFrame/cardSize); 124 + u OpenAI's card carried (cardAt)
//   125        everyone pointing, with debug gizmos: bodyFrame (green sack box), headFrame (blue +z post), crownTop (yellow)
//   130        across the table: the US row with mixed expressions; 131 the CN row; 132 M1 mixed
//   133        the US row low from the head; 134 the CN row low from the foot
import * as THREE from 'three';
import { makeKings } from '../kings.js';
import { makeSet } from '../set.js';
import { G } from '../glsl.js';
import { glowMaterial } from '../materials.js';
import { KINGS, KING, M1, SIDE_SIGN, seatPos } from '../layout.js';

export const EXPR = [
  ['neutral', { eyes: 'open', brows: 'flat', mouth: 'flat' }],
  ['smug', { eyes: 'narrow', brows: 'arch', mouth: 'smirk' }],
  ['angry', { eyes: 'glare', brows: 'angry', mouth: 'grit' }],
  ['fear', { eyes: 'wide', brows: 'worried', mouth: 'scream' }],
  ['shut', { eyes: 'shut', brows: 'worried', mouth: 'grit' }],
  ['laugh', { eyes: 'closed', brows: 'raised', mouth: 'laugh' }],
  ['shock', { eyes: 'wide', brows: 'raised', mouth: 'o' }],
  ['sad', { eyes: 'down', brows: 'worried', mouth: 'frown' }],
  ['side', { eyes: 'side', brows: 'flat', mouth: 'flat', look: [1, 0] }],
  ['grin', { eyes: 'narrow', brows: 'raised', mouth: 'grin' }],
  ['open', { eyes: 'open', brows: 'raised', mouth: 'open' }],
];
const IDS = KINGS.map((k) => k.id);

export function setup({ scene, camera }) {
  const set = makeSet({ scene, camera }); scene.add(set.root);
  const kings = makeKings({ scene, camera }); scene.add(kings.root);
  const H = new THREE.Vector3(), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  // debug: the card outline each king is pressed into (cardFrame + cardSize)
  const cards = new THREE.Group(); scene.add(cards); cards.visible = false;
  const lineMat = glowMaterial({ color: '#ff3020', id: 141 });
  for (const id of IDS) {
    const [w, h] = kings.cardSize(id);
    const g = new THREE.Group();
    for (const [x, y, sw, sh] of [[0, h / 2, w, 0.008], [0, -h / 2, w, 0.008], [w / 2, 0, 0.008, h], [-w / 2, 0, 0.008, h]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.004), lineMat); b.position.set(x, y, 0.01); g.add(b);
    }
    g.matrixAutoUpdate = false; kings.cardFrame(id, g.matrix);
    cards.add(g);
  }
  // debug: the props frames: a sack-sized box on bodyFrame (+z out of the back), a post on headFrame (+y), a ball at crownTop
  const gizmos = new THREE.Group(); scene.add(gizmos); gizmos.visible = false;
  const gz = {};
  const sackMat = glowMaterial({ color: "#30c050", id: 141 }), headMat = glowMaterial({ color: "#3080ff", id: 141 }), topMat = glowMaterial({ color: "#ffd020", id: 141 });
  for (const id of IDS) {
    const sack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.18).translate(0, 0, 0.09), sackMat); sack.matrixAutoUpdate = false;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.3).translate(0, 0, 0.15), headMat); post.matrixAutoUpdate = false;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), topMat);
    gizmos.add(sack, post, top); gz[id] = { sack, post, top };
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
    for (const id of IDS) st[id] = { face: { eyes: 'open', brows: 'flat', mouth: 'flat', socket: 0.3 } };
    set.update({}, t); set.lampBulb(G.uLampPos.value);
    cam.up.set(0, 1, 0);
    let after = null;
    const look = { style: 'noir' };
    if (i === 0) { cam.fov = M1.fov; cam.position.set(...M1.pos); cam.lookAt(...M1.look); }
    else if (i >= 1 && i <= 10) { const id = IDS[i - 1]; after = () => portrait(cam, id); }
    else if (i >= 11 && i <= 20) { const id = IDS[i - 11]; after = () => portrait(cam, id, { yaw: 0.0, dist: 1.0 }); }
    else if (i >= 21 && i <= 91 && (i % 20) >= 1 && (i % 20) <= 11) {
      const id = ['openai', 'deepseek', 'google', 'meta'][Math.floor((i - 21) / 20)];
      const e = EXPR[(i % 20) - 1][1];
      st[id].face = { ...e, socket: 0.3 };
      after = () => portrait(cam, id, { yaw: 0.22, dist: 1.0 });
    } else if (i >= 100 && i <= 103) {
      const id = 'openai';
      st[id].face = { eyes: ['open', 'wide', 'narrow', 'open'][i - 100], brows: i === 101 ? 'worried' : 'flat', mouth: 'flat', pupil: i === 100 ? u : undefined, socket: 0.3 };
      after = () => {
        kings.eyeFrame(id, 'L', M); M.decompose(P, Q, S);
        const z = new THREE.Vector3(0, 0, 1).applyQuaternion(Q), y = new THREE.Vector3(0, 1, 0).applyQuaternion(Q), x = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
        const d = i === 103 ? 0.09 : 0.052;
        const dir = i === 103 ? z.clone().multiplyScalar(0.8).addScaledVector(x, 0.6).normalize() : z;
        cam.position.copy(P).addScaledVector(dir, d).addScaledVector(y, 0.002);
        cam.up.copy(y); cam.fov = 40; cam.lookAt(P);
      };
      look.campTint = 0;
    } else if (i >= 110 && i <= 114) {
      // the right hand held out toward the table; fraction < 0.5: seen from the side, >= 0.5: from the front
      const id = 'openai';
      const pose = ['point', 'fist', 'open', 'hold', 'rest'][i - 110];
      const left = [0, 0, 1];                                   // the king's left in world (US side)
      const palm = pose === 'hold' ? left : pose === 'open' ? [-0.3, 0.2, 0.9] : [0, -1, 0];
      const p = kf(id, 0.66, 0.36, -0.1);
      st[id].hand = { L: 'rest', R: pose };
      st[id].armR = { target: p, palm, pole: [0, -1, -0.4] };
      st[id].face = { eyes: 'narrow', brows: 'arch', mouth: 'smirk', look: [0, 0] };
      after = () => {
        kings.handWorld(id, 'R', H);
        if (u < 0.5) cam.position.set(H.x - 0.12, H.y + 0.22, H.z - 0.62);
        else cam.position.set(H.x - 0.62, H.y + 0.18, H.z - 0.2);
        cam.fov = 30; cam.lookAt(H);
      };
    } else if (i === 115 || i === 116) {
      // everyone points at someone across the sea (and a few at their own side)
      const pairs = { anthropic: 'kimi', kimi: 'anthropic', qwen: 'anthropic', deepseek: 'openai', openai: 'deepseek', xai: 'anthropic', glm: 'qwen', doubao: 'meta', meta: 'doubao', google: 'qwen' };
      for (const id of IDS) {
        const tgt = kings.headWorld(pairs[id], new THREE.Vector3());
        const sh = kings.shoulderWorld(id, 'R', new THREE.Vector3());
        const d = tgt.clone().sub(sh).normalize();
        const p = sh.clone().addScaledVector(d, 0.62);
        st[id].armR = { target: [p.x, p.y, p.z], palm: [0, -1, 0], pole: [0, -1, 0] };
        st[id].hand = { L: 'fist', R: 'point' };
        st[id].look = [tgt.x, tgt.y, tgt.z];
        st[id].lean = 0.12;
        st[id].face = { eyes: 'glare', brows: 'angry', mouth: id === 'anthropic' || id === 'xai' ? 'open' : 'grit' };
      }
      if (i === 115) { cam.fov = 36; cam.position.set(-0.4, 1.25, 1.9); cam.lookAt(1.4, 0.75, -0.6); }
      else { cam.fov = 34; cam.position.set(0, 1.7, 5.6); cam.lookAt(0, 0.6, -1.0); }
    } else if (i >= 120 && i <= 124) {
      // pressed into a card in his last pose: 120/121 covering his eyes (3/4, side), 122 goblet raised,
      // 123 a finger still on the cancel key, 124 everyone flat with the card outlines (debug)
      const id = ['openai', 'openai', 'kimi', 'anthropic', 'openai'][i - 120];
      const ids = i === 124 ? IDS : [id];
      for (const k of ids) st[k].flat = i === 124 ? 1 : u;
      if (i <= 121) {
        st[id].face = { eyes: 'shut', brows: 'worried', mouth: 'scream' };
        st[id].hand = { L: 'open', R: 'open' };
        st[id].lean = 0.1;
        after = () => {
          for (const side of ['L', 'R']) {
            kings.eyeFrame(id, side, M); P.setFromMatrixPosition(M);
            const n = new THREE.Vector3(0, 0, 1).transformDirection(M);
            const p = P.clone().addScaledVector(n, 0.05);
            st[id]['arm' + side] = { target: [p.x, p.y, p.z], palm: [-n.x, -n.y, -n.z], pole: [0, -1, 0] };
          }
          kings.update(st, t);
          if (i === 120) portrait(cam, id, { yaw: 0.85, dist: 2.5, up: 0.25, fov: 34, dy: -0.2 });
          else portrait(cam, id, { yaw: -1.3, dist: 2.4, up: 0.3, fov: 34, dy: -0.2 });
        };
      } else if (i === 122) {
        st[id].face = { eyes: 'closed', brows: 'raised', mouth: 'laugh' };
        st[id].hand = { L: 'rest', R: 'hold' };
        st[id].armR = { target: kf(id, 0.45, 0.95, -0.25), palm: [0, 0, 1] };
        after = () => portrait(cam, id, { yaw: 0.75, dist: 1.9, up: -0.1, fov: 34, dy: -0.25 });
      } else if (i === 123) {
        const sx = SIDE_SIGN[KING[id].side], z = seatPos(id)[2];
        st[id].face = { eyes: 'wide', brows: 'worried', mouth: 'grit' };
        st[id].hand = { L: 'rest', R: 'point' };
        st[id].lean = 0.18;
        st[id].armR = { target: [sx * 1.06, 0.06, z + 0.42], palm: [0, -1, 0], pole: [0, 0.2, -1] };
        after = () => portrait(cam, id, { yaw: 0.8, dist: 1.9, up: 0.0, fov: 34, dy: -0.3 });
      } else {
        cam.fov = 40; cam.position.set(0, 2.4, 5.0); cam.lookAt(0, 0.5, -1.0);
        if (u > 0) st.openai.cardAt = new THREE.Matrix4().makeRotationY(u * Math.PI).setPosition(0, 0.9, 0.5);   // 124.x: carried
      }
      cards.visible = i === 124;
    } else if (i === 125) {
      // everyone pointing (as in 4-11) with the debug frames, seen from high above the foot
      IDS.forEach((id, n) => { st[id].face = { eyes: "glare", brows: "angry", mouth: "grit" }; st[id].lean = 0.1; st[id].hand = { L: "fist", R: "point" };
        const other = IDS[(n + 5) % 10]; const tg = seatPos(other);
        st[id].armR = { target: kf(id, 0.6, 0.45, (tg[2] - seatPos(id)[2]) * 0.2), palm: [0, -1, 0] }; });
      cam.fov = 40; cam.position.set(0, 4.2, 5.4); cam.lookAt(0, 0.3, -0.6);
      after = () => { for (const id of IDS) { kings.bodyFrame(id, gz[id].sack.matrix); kings.headFrame(id, gz[id].post.matrix); kings.crownTop(id, gz[id].top.position); } };
    } else if (i >= 200 && i < 400) {
      const id = IDS[Math.floor((i - 200) / 20)], e = EXPR[((i - 200) % 20) % EXPR.length][1];
      st[id].face = { ...e, socket: 0.3 };
      after = () => portrait(cam, id, { yaw: 0.3, dist: 1.0 });
    } else if (i >= 130 && i <= 134) {
      IDS.forEach((id, n) => { st[id].face = { ...EXPR[(n * 3 + 1) % EXPR.length][1] }; });
      if (i === 130) { cam.fov = 34; cam.position.set(-1.0, 1.15, 0.3); cam.lookAt(1.6, 0.75, 0.0); }
      if (i === 131) { cam.fov = 34; cam.position.set(1.0, 1.15, -0.3); cam.lookAt(-1.6, 0.75, 0.0); }
      if (i === 132) { cam.fov = M1.fov; cam.position.set(...M1.pos); cam.lookAt(...M1.look); }
      if (i === 133) { cam.fov = 38; cam.position.set(0.3, 0.75, -3.6); cam.lookAt(1.4, 0.6, 1.0); }
      if (i === 134) { cam.fov = 38; cam.position.set(-0.2, 0.8, 3.6); cam.lookAt(-1.4, 0.6, -1.0); }
    }
    gizmos.visible = i === 125;
    kings.update(st, t);
    if (after) { after(); kings.update(st, t); }
    return look;
  };
}
