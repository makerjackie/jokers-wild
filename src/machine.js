// 《喂》 v5 — the card machines, the chips they are fed, and the small things of the epilogue.
// A machine is a wind-up toy: an enamel box on a brass plinth, a card slot in front, a funnel on top (it is fed there),
// a key in its back, and one little hammer on its side. The hammer falls ("tak"), a card leaves the slot. It has no eye
// and no face, and it never does anything else; it only gets bigger. All sizes come from S = its height in metres.
//   makeMachines(ctx) -> { root, update(st.machines, t) }
//   st.machines = { heart | spade: { show, pos: [x, y, z] (centre of its base), yaw, S, gulp 0..1 (the swallow: squat and
//                     bulge), strike 0..1 (hammer: 0 raised, 1 on the bell), key (rad), glow 0..1 (the slot), lit 0..1
//                     (self-light, for when it stands far above the lamp), lean (rad, tipping back) },
//                   chips: [{ pos, rot: [rx, ry, rz], kind: 'CN' | 'US', s }],
//                   foot: { show, pos (under the ball of the foot), yaw, pitch, roll }, walker: { show, pos, yaw },
//                   plain: 0 | 1 (the endless floor once the hall is gone) }
// Frames: local +z is the machine's front (the slot), +y up; `side` puts the hammer on local -x (-1) or +x (+1).
import * as THREE from 'three';
import { celMaterial, glowMaterial, C } from './materials.js';
import { lathe, roundBox, superEllipsoid } from './geom.js';
import { makeChips } from './chips.js';
import { FLOOR_Y } from './layout.js';

const K = 1 / 0.9;                         // the model is built 0.9 tall; K makes its height exactly 1
export const SLOT = [0, 0.36 * K, 0.34 * K];     // where a card leaves (unit machine, x S)
export const HOPPER = [0, 0.9 * K, -0.08 * K];   // the funnel's mouth
export const TOP = [0, 0.675 * K, 0.12 * K];     // the flat top in front of the funnel (a hand pats it here)
// its back (the side its king sits on): the key, and under it a plate with two buttons, 托管 and 取消
export const KEY = [0, 0.38 * K, -0.46 * K];
export const BTN_AUTO = [0.092 * K, 0.2 * K, -0.335 * K], BTN_CANCEL = [-0.092 * K, 0.2 * K, -0.335 * K];
export const CORD = [0.2 * K, 0.6 * K, -0.33 * K];     // where its power cord comes out
const rotY = (v, yaw) => [v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), v[1], -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)];
// world point of a unit-machine point for a machine state { pos, yaw, S }
export const machinePoint = (m, p) => { const r = rotY(p, m.yaw ?? 0); return [m.pos[0] + r[0] * m.S, m.pos[1] + r[1] * m.S, m.pos[2] + r[2] * m.S]; };

const STYLE = { heart: { body: '#b3261f', side: -1 }, spade: { body: '#2b2e3d', side: 1 } };

function buildMachine(id) {
  const st = STYLE[id];
  const root = new THREE.Group(); root.name = `machine-${id}`;
  const g = new THREE.Group(); g.scale.setScalar(K); root.add(g);
  const enamel = celMaterial({ color: st.body, id: 12, gloss: 0.75, rim: 1.2, litBias: 0.45, shadeMul: 3.4 });
  const brass = celMaterial({ color: '#c9a25e', id: 5, gloss: 0.9, litBias: 0.3, shadeMul: 2.4 });
  const dark = celMaterial({ color: '#0b0b0c', id: 13, gloss: 0.2 });
  const glow = glowMaterial({ color: '#ffb450', id: 141, gain: 1 });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.SphereGeometry(0.045, 14, 10), brass, sx * 0.23, 0.035, sz * 0.28);
  add(roundBox(0.62, 0.07, 0.74, 0.02), brass, 0, 0.085, 0);
  add(roundBox(0.54, 0.52, 0.64, 0.06), enamel, 0, 0.38, 0);
  add(roundBox(0.56, 0.028, 0.66, 0.01), brass, 0, 0.19, 0);
  add(roundBox(0.56, 0.028, 0.66, 0.01), brass, 0, 0.57, 0);
  add(roundBox(0.5, 0.04, 0.6, 0.015), brass, 0, 0.655, 0);
  // the funnel it is fed through
  add(lathe([[0.065, 0], [0.085, 0], [0.19, 0.2], [0.215, 0.2], [0.215, 0.225], [0.185, 0.225], [0.075, 0.035], [0, 0.035]], 36), brass, 0, 0.675, -0.08);
  add(new THREE.CircleGeometry(0.07, 24).rotateX(-Math.PI / 2), dark, 0, 0.712, -0.08);
  // the slot: a brass lip, a dark slit, a warm light inside
  add(roundBox(0.44, 0.11, 0.05, 0.02), brass, 0, 0.36, 0.31);
  add(new THREE.BoxGeometry(0.37, 0.04, 0.02), dark, 0, 0.36, 0.33);
  const slit = add(new THREE.PlaneGeometry(0.35, 0.022), glow, 0, 0.36, 0.3405);
  // the hammer on its side: a pivot, an arm, a ball; a little bell under it
  const sd = st.side;
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16).rotateZ(Math.PI / 2), brass, sd * 0.295, 0.5, -0.12);
  const arm = new THREE.Group(); arm.position.set(sd * 0.325, 0.5, -0.12); g.add(arm);
  add(roundBox(0.028, 0.028, 0.36, 0.008), brass, 0, 0, 0.18, arm);
  add(new THREE.SphereGeometry(0.05, 16, 12), dark, 0, 0, 0.37, arm);
  add(lathe([[0.0, 0], [0.05, 0.0], [0.06, 0.012], [0.05, 0.04], [0.02, 0.055], [0, 0.058]], 20), brass, sd * 0.325, 0.385, 0.24);
  // the key in its back
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 12).rotateX(Math.PI / 2), brass, 0, 0.38, -0.385);
  const key = new THREE.Group(); key.position.set(0, 0.38, -0.46); g.add(key);
  for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.06, 0.02, 10, 22), brass, sx * 0.075, 0, 0, key);
  add(new THREE.SphereGeometry(0.03, 12, 10), brass, 0, 0, 0, key);
  // the plate on its back: 托管 (lit while it plays by itself) and 取消 (which does nothing)
  const plate = (on) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; const c = cv.getContext('2d');
    c.fillStyle = '#17120d'; c.fillRect(0, 0, 512, 192); c.strokeStyle = '#b48d4c'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 180);
    const btn = (x, zh, lit, col) => { c.beginPath(); c.arc(x, 76, 52, 0, Math.PI * 2); c.fillStyle = lit ? col : '#2b2620'; c.fill(); c.lineWidth = 6; c.strokeStyle = lit ? '#fff3c9' : '#6b5a3a'; c.stroke();
      c.fillStyle = lit ? '#fff7dc' : '#a8997c'; c.font = 'bold 40px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(zh, x, 158); };
    btn(138, '托管', on, '#2fbf55'); btn(374, '取消', false, '#c23a2a');
    const tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return tx;
  };
  const plates = [plate(false), plate(true)];
  const panelMat = glowMaterial({ color: '#ffffff', id: 142, map: plates[0], gain: 0.9 });
  add(new THREE.PlaneGeometry(0.4, 0.15).rotateY(Math.PI), panelMat, 0, 0.2, -0.3215);
  const base = { enamel: C(st.body).clone(), brass: C('#c9a25e').clone() };
  return { root, arm, key, slit, enamel, brass, glow, base, panelMat, plates };
}

export function makeMachines() {
  const root = new THREE.Group(); root.name = 'machines';
  const M = { heart: buildMachine('heart'), spade: buildMachine('spade') };
  for (const id in M) { M[id].root.visible = false; root.add(M[id].root); }
  // chips, fed and flying
  const chips = { CN: makeChips(600, 'CN'), US: makeChips(600, 'US') };
  root.add(chips.CN, chips.US);
  // the epilogue: a slippered foot under a robe's hem; the same man from very far above; the floor without walls
  const robe = celMaterial({ color: '#2a2a33', id: 20, gloss: 0.1, litBias: 0.3, shadeMul: 3 }), trim = celMaterial({ color: '#cfd2d6', id: 21, gloss: 0.3, litBias: 0.3, shadeMul: 3 });
  const shoe = celMaterial({ color: '#8a3f2c', id: 22, gloss: 0.35, litBias: 0.4, shadeMul: 3 });
  const skin = celMaterial({ color: '#c59a78', id: 23, gloss: 0.2 });
  const foot = new THREE.Group(); foot.visible = false; root.add(foot);
  { // origin under the ball of the foot; the toe points along +z
    const sole = new THREE.Mesh(superEllipsoid(0.048, 0.02, 0.135, 2.6, 2.2, 28, 14), shoe); sole.position.set(0, 0.02, -0.055); foot.add(sole);
    const upper = new THREE.Mesh(superEllipsoid(0.044, 0.034, 0.1, 2.2, 2, 28, 14), shoe); upper.position.set(0, 0.042, -0.03); foot.add(upper);
    const toe = new THREE.Mesh(superEllipsoid(0.03, 0.022, 0.06, 2, 2, 20, 12), shoe); toe.position.set(0, 0.03, 0.075); toe.rotation.x = -0.35; foot.add(toe);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 24).rotateX(Math.PI / 2), trim); band.position.set(0, 0.066, -0.06); foot.add(band);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.2, 16), skin); ankle.position.set(0, 0.16, -0.085); foot.add(ankle);
    const hem = new THREE.Mesh(lathe([[0.2, 0], [0.21, 0.012], [0.19, 0.03], [0.15, 0.5], [0.13, 0.5]], 40), robe); hem.position.set(0.05, 0.2, -0.12); foot.add(hem);
    const hemTrim = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.011, 8, 40).rotateX(Math.PI / 2), trim); hemTrim.position.set(0.05, 0.212, -0.12); foot.add(hemTrim);
  }
  const walker = new THREE.Group(); walker.visible = false; root.add(walker);
  {
    walker.add(new THREE.Mesh(lathe([[0.3, 0], [0.31, 0.02], [0.2, 0.9], [0.17, 1.12], [0, 1.14]], 24), robe));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin); head.position.y = 1.24; walker.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), celMaterial({ color: '#2a211b', id: 24, gloss: 0.2 })); hair.position.y = 1.25; walker.add(hair);
  }
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), celMaterial({ color: '#4d463f', id: 0, gloss: 0 }));
  plain.position.y = FLOOR_Y - 0.004; plain.visible = false; root.add(plain);

  // each machine's power cord: a dark cable from its back to wherever its plug is (thrown up at the lamp)
  const cordMat = celMaterial({ color: '#1a1714', id: 14, gloss: 0.3, emissive: '#2a1a0c' });
  const plugMat = celMaterial({ color: '#c9a25e', id: 5, gloss: 0.9, litBias: 0.3, shadeMul: 2.4 });
  const cords = {};
  for (const id in M) { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), cordMat); mesh.frustumCulled = false; mesh.visible = false; const plug = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), plugMat); plug.visible = false; root.add(mesh, plug); cords[id] = { mesh, plug }; }
  const _a = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s3 = new THREE.Vector3();
  function update(st = {}, t = 0) {
    void t;
    for (const id in M) {
      const m = M[id], s = st[id];
      m.root.visible = !!s && (s.show ?? 1) > 0;
      const cd = cords[id];
      cd.mesh.visible = cd.plug.visible = false;
      if (!m.root.visible) continue;
      const S = s.S ?? 0.3, gl = s.gulp ?? 0;
      m.root.position.set(...s.pos);
      m.root.rotation.set(-(s.lean ?? 0), s.yaw ?? 0, 0, 'YXZ');
      m.root.scale.set(S * (1 + 0.14 * gl), S * (1 - 0.2 * gl), S * (1 + 0.14 * gl));
      m.arm.rotation.x = -0.95 + 1.1 * Math.min(1, Math.max(0, s.strike ?? 0));
      m.key.rotation.z = s.key ?? 0;
      const lit = s.lit ?? 0;
      m.enamel.uniforms.uEmissive.value.copy(m.base.enamel).multiplyScalar(0.55 * lit);
      m.brass.uniforms.uEmissive.value.copy(m.base.brass).multiplyScalar(0.5 * lit);
      m.glow.uniforms.uGain.value = 0.25 + 2.2 * (s.glow ?? 0.4);
      m.panelMat.uniforms.uMap.value = m.plates[s.auto ? 1 : 0];
      if (s.cord) {
        m.root.updateMatrixWorld(true);
        _a.set(...CORD).applyMatrix4(m.root.matrixWorld);
        const b = s.cord.to, sag = s.cord.sag ?? 0.3, pts = [];
        for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(_a.x + (b[0] - _a.x) * u, _a.y + (b[1] - _a.y) * u - sag * 4 * u * (1 - u), _a.z + (b[2] - _a.z) * u)); }
        cd.mesh.geometry.dispose();
        cd.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, s.cord.r ?? 0.014, 6);
        cd.mesh.visible = cd.plug.visible = true; cd.plug.position.set(b[0], b[1], b[2]);
      }
    }
    const n = { CN: 0, US: 0 };
    for (const c of st.chips ?? []) {
      const kd = c.kind === 'CN' ? 'CN' : 'US', mesh = chips[kd];
      if (n[kd] >= 600) continue;
      e.set(...(c.rot ?? [0, 0, 0])); q.setFromEuler(e); p.set(...c.pos); s3.setScalar(c.s ?? 1);
      mesh.setMatrixAt(n[kd]++, m4.compose(p, q, s3));
    }
    for (const kd of ['CN', 'US']) { chips[kd].count = n[kd]; chips[kd].instanceMatrix.needsUpdate = true; }
    const f = st.foot;
    foot.visible = !!f && (f.show ?? 0) > 0;
    if (foot.visible) { foot.position.set(...f.pos); foot.rotation.set(f.pitch ?? 0, f.yaw ?? 0, f.roll ?? 0, 'YXZ'); }
    const w = st.walker;
    walker.visible = !!w && (w.show ?? 0) > 0;
    if (walker.visible) { walker.position.set(...w.pos); walker.rotation.y = w.yaw ?? 0; }
    plain.visible = (st.plain ?? 0) > 0;
  }
  return { root, update, machines: M };
}
