// Bench for the card king: ?bench=cardking. The integer part of t picks a setup, the fraction animates it.
//   0  M1 (layout.js), the king complete, breathing, the jokers as its face, lit by its face (P2) and the lamp
//   1  low angle from the table (10-02): the lamp hanging in front of it, the king towering
//   2  build 0     3  build 0.25     4  build 0.5     5  build 0.75     (wide, low, from the foot: 10-01)
//   6  M1, the arm stream reaching down under the foot leg with a cupped hand (11-02 / 11-03)
//   7  close-up of the fingertip flick (flick = the fraction; the dust puffs at ~0.5)
//   8  lean 1, looking down the table (side view: clear of the table, the chairs and the lamp)
//   9  the stream carrying (carry 1) along the table, three-quarter view
//  10  medium shot of the head turned toward the CN head king, breathing
//  11  M1 with the build at 0.9..1 (the crown arriving; the jokers land at the face from 0.93)
//  12  from the floor beside the head of the table: the robe spilling down the dais steps
import * as THREE from 'three';
import { G } from '../glsl.js';
import { makeSet } from '../set.js';
import { makeCards } from '../cards.js';
import { makeCardKing } from '../cardking.js';
import { celMaterial } from '../materials.js';
import { M1, TABLE, FLOOR_Y, seatPos } from '../layout.js';

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine }); scene.add(set.root);
  const cards = makeCards({ scene }, { set }); scene.add(cards.root);
  const king = makeCardKing({ scene, overlay, camera, engine }, { set, cards }); scene.add(king.root);
  window.__king = king; window.__makeCardKing = makeCardKing;
  // a stand-in for what the director puts in the cupped hand (the folded kings), placed with armTip()
  const carried = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.46), celMaterial({ color: '#8a7a62', id: 20, gloss: 0.3 }));
  carried.matrixAutoUpdate = false; scene.add(carried);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const cam = (c, pos, look, fov) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(...look); c.fov = fov; };
  const leg = TABLE.LEGS[2];
  return (t, c) => {
    const k = Math.floor(t + 1e-6), u = t - k;
    const st = { show: 1, build: 1, breathe: 1, look: [0, 1.4, 8], lean: 0, arm: { out: 0 }, flick: 0 };
    let jokersAtFace = true;
    const q = new URLSearchParams(location.search);
    if (k === 0) { st.look = [...M1.pos]; cam(c, M1.pos, M1.look, M1.fov); }
    else if (k === 1) { st.look = [0.2, 0.6, 1.5]; st.lean = 0.25; cam(c, [0.42, 0.3, 2.4], [0, 2.3, -4.1], 50); }
    else if (k >= 2 && k <= 5) {
      st.build = (k - 2) * 0.25 + u * 0.25;
      jokersAtFace = false;
      cam(c, [0.0, 0.85, 7.6], [0, 1.75, -3.6], 46);
    } else if (k === 6) {
      st.arm = { out: 1, carry: 1, target: [leg[0], FLOOR_Y + 0.06, leg[1]], via: [[-1.15, 1.25, -2.3], [-0.95, 0.75, 0.6], [-0.9, 0.42, 3.5], [-1.0, -0.45, 3.42]] };
      st.look = [-0.9, 0, 2.5]; st.lean = 0.35;
      cam(c, M1.pos, M1.look, M1.fov);
    } else if (k === 7) {
      st.arm = { out: 1, carry: 0, target: [-0.55, 0.32, 2.1], via: [[-1.1, 1.2, -2.2], [-0.8, 0.7, 0.6]] };
      st.flick = u; st.look = [-0.55, 0.3, 2.1]; st.lean = 0.3;
      cam(c, [-0.05, 0.42, 2.72], [-0.5, 0.33, 2.15], 30);
    } else if (k === 8) {
      st.lean = 1; st.look = [0, 0, 0.5];
      cam(c, [4.6, 1.7, -1.4], [0, 1.9, -3.4], 46);
    } else if (k === 9) {
      st.arm = { out: 0.35 + 0.65 * Math.min(1, u * 1.5), carry: 1, target: [-0.4, 0.42, 0.4], via: [[-1.1, 1.3, -2.4]] };
      st.look = [-0.4, 0.3, 0.4]; st.lean = 0.45;
      cam(c, [2.7, 2.1, 2.2], [-0.6, 1.0, -2.0], 44);
    } else if (k === 10) {
      const s = seatPos('deepseek');
      st.look = [s[0], s[1] + 1.0, s[2]]; st.lean = 0.2;
      cam(c, [0.9, 2.6, -0.6], [0, 3.1, -3.6], 34);
    } else if (k === 11) {
      st.build = 0.9 + u * 0.1;
      cam(c, M1.pos, M1.look, M1.fov);
    } else {
      // 12: from the floor beside the table's head end: the robe spilling down the dais
      cam(c, [2.3, -0.45, -1.7], [0, 0.3, -4.0], 50);
    }
    if (q.has('build')) st.build = +q.get('build');
    set.update({
      lamp: { swing: [0, 0], flicker: 0 }, wobble: 0,
      cases: { CN: { crack: 1, shatter: 1, light: 0 }, US: { crack: 1, shatter: 1, light: 0 } },
      board: { rows: [], lit: 1 }, alarm: { on: 0, angle: 0 }, dispenser: { show: false },
    }, t);
    set.lampBulb(G.uLampPos.value);
    if (q.has('ink')) st.ink = +q.get('ink');
    king.update(st, t);
    carried.visible = (st.arm?.carry ?? 0) > 0.5 && (st.arm?.out ?? 0) > 0.3;
    if (carried.visible) { king.armTip(carried.matrix); carried.matrixWorldNeedsUpdate = true; }
    // the jokers as its face (the director does this in the film), else lying on the pile
    king.faceFrame(M);
    const jk = (dx) => { P.set(dx, 0, 0).applyMatrix4(M); Q.setFromRotationMatrix(M); E.setFromQuaternion(Q, 'YXZ'); return { pos: [P.x, P.y, P.z], rot: [E.x, E.y, E.z], scale: 3 }; };
    const faceOn = jokersAtFace || st.build > 0.93;
    cards.update({ jokers: faceOn ? { CN: jk(-0.27), US: jk(0.27) } : { CN: { pos: [-0.09, 0.012, 0], rot: [-Math.PI / 2, 0, 0] }, US: { pos: [0.09, 0.012, 0], rot: [-Math.PI / 2, 0, 0] } }, jokerGlow: 0.3 }, t);
    // the face's own light: the practical light at the face, warm gold
    P.set(0, -0.1, 0.25).applyMatrix4(M);
    G.uP2Pos.value.copy(P);
    G.uP2Col.value.setRGB(1.0, 0.64, 0.3).multiplyScalar(faceOn ? 1.4 : 0.8);
    G.uP2Range.value = 5.5;
    const look = { style: 'noir', campTint: 0 };
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    return look;
  };
}
