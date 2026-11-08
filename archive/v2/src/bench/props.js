// Bench for the props module (?bench=props). Each integer bench time is one setup; the fraction animates it.
//   0  the AUTO console, cover closed (Google's, US seat 2), a king's forearm for scale
//   1  cover open, the button pressed and lit, the cancel key greyed out (dead)
//   2  a cigar burning in its ashtray with an ash, a crystal goblet of dark wine; a test right hand holding
//      another cigar (palm down) and another goblet (thumb up)
//   3  KEY close-up (4-03): OpenAI's real 'hold' fist at a stand-in padlock, thumb up; .0-.45 turn 0, .55-1 turn 1
//   4  KEY medium shot of OpenAI from across the table (.0 turn 0, .5 turn 1); .75 holding it up, shown
//   5  KEY in a stand-in fist (a hand frame without a king) with a marker on keyTip; .0 turn 0, .5 turn 1; .75 lying (keyRest)
//   6  CLOCKS: a medium shot of Google from across the table (the clock's back face): .0 n 10, .25 n 5, .5 n 1, .75 ringing at 0
//   7  CLOCK front face from the king's side, close: .0-.5 it pops up (show), .5-1 counting down 15 .. 0 then ringing
//   8  GOLD (6-01): Google feeding his press, medium: .0 held above (at), .3 carried in, .5 on the mouth, .75 half sunk
//   9  CASTLE (6-02): Doubao, the same phases
//  10  CITY (6-03): Meta: .0 flat in the cloth, .2 peel .5, .4 peel 1, .6 carried by the grabbed edge, .8 half sunk
//  11  PLANT (6-04): Kimi, the same phases as 8
//  12  a PRESS GLOWING with the gold leak: .0 glow .2, .33 glow .6, .66 glow 1 (fraction > .9: wide of a row of presses)
//  13  the SEALS on the giants' chains, wide from the head (4-04): fists ~4.6 m up, ~5-6 m of chain, swinging with u
//  14  the US SEAL close / medium: hanging low over the bridge, face and drum band toward the camera; .5 seen from below
//  15  chips: stacks beside the presses (US NVIDIA chips / CN kiln clay), OpenAI's mountain, a heap in a hopper
//  16  AUTO console, medium close-up (~0.75 m) from the king's side (over his shoulder, the king hidden):
//      .0 idle, cover closed; .25 cover open; .5 pressed and lit; .75 lit, the cancel key dead
//  17  the same from across the table (~0.75 m, the king behind it), same phases
// Debug: &bp=<x,y,z>&bl=<x,y,z>&bf=<fov> overrides the camera; &nokings=1 hides the kings.
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial, glowMaterial } from '../materials.js';
import { makeProps, keyRest, KEY_TIP, cityGrab, FEED } from '../props.js';
import { makeKings } from '../kings.js';
import { TABLE, FLOOR_Y, SEA_HALF, KINGS, CITY, pressPos } from '../layout.js';
import { smooth, clamp } from '../util.js';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const vec = (s) => (s ? s.split(',').map(Number) : null);

// a plain war-room tabletop: dark wood with a parchment chart cloth, a stone floor (the set module is separate)
function tabletop(scene) {
  const g = new THREE.Group();
  const cloth = celMaterial({
    color: '#b59c74', id: 1, gloss: 0.15,
    pattern: /* glsl */ `
      float mpp = length(fwidth(vWorld));
      vec2 p = vWorld.xz;
      float sea = 1.0 - smoothstep(${SEA_HALF.toFixed(3)} - 0.01, ${SEA_HALF.toFixed(3)} + 0.01, abs(p.x));
      col = mix(col, col * vec3(0.86, 0.9, 0.92), sea);
      float waves = step(0.82, fract(p.y * 18.0 + sin(p.x * 30.0) * 0.4)) * sea * (1.0 - smoothstep(0.001, 0.004, mpp));
      col *= 1.0 - 0.18 * waves;
      float coast = 1.0 - smoothstep(0.0, 0.004 + mpp, abs(abs(p.x) - ${SEA_HALF.toFixed(3)} - 0.01 * sin(p.y * 7.0)));
      col *= 1.0 - 0.5 * coast;
      col *= 0.88 + 0.2 * fbm2(p * 3.0);
      if(vLocalN.y < 0.5) col = vec3(0.09, 0.06, 0.04);
    `,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.HALF_W * 2, TABLE.THICK, TABLE.HALF_L * 2).translate(0, -TABLE.THICK / 2, 0), cloth);
  g.add(top);
  const legM = celMaterial({ color: '#2a1d14', id: 2, gloss: 0.4 });
  TABLE.LEGS.forEach(([x, z]) => { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, -FLOOR_Y - TABLE.THICK, 0.14).translate(x, (FLOOR_Y - TABLE.THICK) / 2, z), legM)); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, 0), celMaterial({ color: '#2b2622', id: 3, gloss: 0.1, pattern: 'col *= 0.8 + 0.3 * fbm2(vWorld.xz * 1.5); float j = step(0.97, fract(vWorld.x * 1.6)) + step(0.97, fract(vWorld.z * 1.6)); col *= 1.0 - 0.3 * min(j, 1.0);' }));
  g.add(floor);
  // the hole the set will open where the city is torn off (stand-in)
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27).rotateX(-Math.PI / 2), celMaterial({ color: '#120c08', id: 1, gloss: 0 }));
  hole.position.set(CITY[0], 0.0003, CITY[2]); hole.visible = false; g.add(hole);
  // a stand-in for the chip bridge across the sea (z = 3.0)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.06).translate(0, 0.015, 3.0), celMaterial({ color: '#3a3936', id: 1, gloss: 0.5 }));
  g.add(bridge);
  scene.add(g);
  return { g, hole, bridge };
}
// a king's sleeve and mitten, only for scale
function forearm(scene, from, to) {
  const g = new THREE.Group();
  const robe = celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 });
  const skin = celMaterial({ color: '#b8a48e', id: 21, gloss: 0.3 });
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a), L = d.length();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, L, 18).translate(0, L / 2, 0), robe);
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); sleeve.position.copy(a); g.add(sleeve);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 12).scale(1.0, 0.62, 1.25), skin);
  hand.position.copy(b).addScaledVector(d.normalize(), 0.03); hand.quaternion.copy(sleeve.quaternion); g.add(hand);
  scene.add(g);
  return g;
}
// test hand frames (origin palm centre, +y fingers, +z out of the palm, x = y cross z)
function handFrame(pos, fingers, palm) {
  const y = new THREE.Vector3(...fingers).normalize(), z = new THREE.Vector3(...palm);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...pos);
}
// a stand-in fist in the 'hold' pose (a palm, a roll of curled fingers round hand x, a thumb), right hand, s ~ 1.3
function standInFist(skin) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.04).translate(0, 0.0, -0.002), skin));
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.015, 10, 20, Math.PI * 1.25).rotateY(Math.PI / 2).rotateX(-Math.PI * 0.62).scale(2.6, 1, 1), skin);
  roll.position.set(0, 0.045, 0.04); g.add(roll);
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.05, 4, 10).rotateZ(-0.5).rotateX(0.7).translate(0.05, 0.025, 0.035), skin));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 16).translate(0, -0.16, -0.004), celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 })));
  return g;
}
// a stand-in padlock (the set builds the real ones on the boxes): body facing -x, keyhole at its centre
function standInLock(scene, pos) {
  const g = new THREE.Group();
  const iron = celMaterial({ color: '#3a3733', id: 9, gloss: 0.7, rim: 1.2, pattern: 'specTh = 0.95; col *= 0.85 + 0.3 * vnoise(vLocal.xy * 90.0);' });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.07), iron));
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 10, 24, Math.PI).rotateY(Math.PI / 2).translate(0, 0.04, 0), iron); g.add(sh);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.03).rotateY(Math.PI / 2).translate(0.0155, -0.005, 0), celMaterial({ color: '#000000', id: 9, gloss: 0 }));
  g.add(hole);
  // a slab of iron box behind it (toward the sea); the keyhole faces the king (+x)
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.42).translate(-0.17, -0.1, 0), celMaterial({ color: '#2c2a28', id: 9, gloss: 0.5, rim: 1.0 })));
  g.position.set(...pos);
  scene.add(g);
  return g;
}
// a chain path from a fist to the seal's ring: nearly straight (the seal is heavy), bowed by the swing's lag
function chainPath(fist, ring, bow = 0.25, n = 12) {
  const A = new THREE.Vector3(...fist), B = new THREE.Vector3(...ring), d = B.clone().sub(A), side = new THREE.Vector3(d.z, 0, -d.x).normalize();
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push(A.clone().lerp(B, u).addScaledVector(side, Math.sin(Math.PI * u) * bow).add(new THREE.Vector3(0, -Math.sin(Math.PI * u) * 0.15, 0)).toArray()); }
  return pts;
}

export function setup({ scene, camera }) {
  const T = tabletop(scene);
  const P = makeProps({ scene, camera });
  if (typeof window !== 'undefined') window.__props = P;   // debug handle for probes
  scene.add(P.root);
  const arm = forearm(scene, [1.6, 0.13, 0.02], [1.27, 0.055, 0.14]);
  const skin = celMaterial({ color: '#a8968a', id: 21, gloss: 0.3 }), robe = celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 });
  // test hands for setup 2
  const hands = {
    google: handFrame([1.16, 0.2, -0.16], [-1, 0.25, 0.08], [0.1, -1, 0.15]),
    xai: handFrame([1.1, 0.17, -0.66], [-1, 0.12, 0.05], [0, 0, 1]),
  };
  const handProxy = [];
  for (const id of Object.keys(hands)) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12).scale(0.95, 1.15, 0.5).translate(0, 0.012, -0.006), skin));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1.6, 1).translate(0.032, 0.0, 0.004), skin));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.2, 16).translate(0, -0.13, -0.004), robe));
    g.matrixAutoUpdate = false; g.matrix.copy(hands[id]); scene.add(g); handProxy.push(g);
  }
  // setup 5: the stand-in fist and a marker on keyTip
  const fistM = handFrame([0.15, 0.32, 1.0], [-1, -0.15, 0], [0, -1, 0]);
  const fist = standInFist(skin); fist.matrixAutoUpdate = false; fist.matrix.copy(fistM); scene.add(fist);
  const tipMark = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), glowMaterial({ color: '#30ff60', id: 141 })); tipMark.userData.noShadow = true; scene.add(tipMark);
  // setups 3/4: a stand-in padlock within OpenAI's reach
  const LOCK = [0.98, 0.26, -2.42];
  const lock = standInLock(scene, LOCK);
  const K = makeKings({ scene, camera }); scene.add(K.root);
  const kingApi = { handFrame: (id, side) => (side === 'M' ? K.mouthFrame(id) : K.handFrame(id, side)) };
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4();
  const cam = (c, pos, look, fov) => {
    c.position.set(...(vec(q.get('bp')) ?? pos)); c.up.set(0, 1, 0); c.lookAt(V.set(...(vec(q.get('bl')) ?? look))); c.fov = +(q.get('bf') ?? fov);
  };
  // a king offering an item with both hands (palms in) at p, his press's mouth below
  const both = (p, w = 0.1, axis = 'z') => {
    const a = axis === 'z' ? [0, 0, w] : [w, 0, 0];
    return { hand: { L: 'open', R: 'open' }, armL: { target: [p[0] + a[0], p[1] + 0.02, p[2] + a[2]], palm: [-a[0], 0, -a[2]] }, armR: { target: [p[0] - a[0], p[1] + 0.02, p[2] - a[2]], palm: [a[0], 0, a[2]] }, rise: 0.5 };
  };
  return (t, c) => {
    const k = Math.min(17, Math.max(0, Math.floor(t + 1e-6))), u = t - k;
    G.uLampPos.value.set(0, 2.6, -0.1); G.uP2Col.value.setRGB(0, 0, 0);
    const st = { buttons: {}, cigars: {}, glasses: {}, seals: {}, presses: {}, chips: {}, keys: {}, clocks: {} };
    const kst = {};
    arm.visible = k <= 1;
    for (const m of handProxy) m.visible = k === 2;
    fist.visible = tipMark.visible = k === 5;
    lock.visible = k === 3 || k === 4;
    T.hole.visible = false;
    let kingsOn = k >= 3 && k !== 5 && k !== 7 && k !== 13;
    const look = { style: 'noir' };
    let api = kingApi;
    if (k === 0) {
      st.buttons.google = { cover: 0, press: 0, lit: 0, cancel: 0, dead: 0 };
      cam(c, [1.44, 0.17, 0.56], [1.06, 0.045, 0.29], 30);
    } else if (k === 1) {
      const open = smooth(u / 0.3), push = smooth((u - 0.4) / 0.1) * (1 - smooth((u - 0.6) / 0.15));
      st.buttons.google = { cover: u > 0 ? open : 1, press: u > 0 ? push : 1, lit: u > 0 ? (u > 0.5 ? 1 : 0) : 1, cancel: 0, dead: 1 };
      cam(c, [1.44, 0.17, 0.56], [1.06, 0.045, 0.29], 30);
    } else if (k === 2) {
      st.cigars.google = { hand: null, lit: 1, glow: 0.35 + 0.65 * Math.max(0, Math.sin(u * 6)), ash: 0.75, ashDrop: u > 0.5 ? 2.5 : null };
      st.cigars.xai = { hand: 'R', lit: 1, glow: 0.2, ash: 0.4, ashDrop: null };
      st.glasses.openai = { hand: null, wine: 0.62, at: [0.97, 0, -0.44] };
      st.glasses.google = { hand: 'R', wine: 0.5 };
      cam(c, [1.56, 0.3, -0.3], [1.05, 0.09, -0.56], 40);
      api = { handFrame: (id) => (id === 'xai' ? hands.google : id === 'google' ? hands.xai : M4) };
    } else if (k === 3 || k === 4) {
      // OpenAI (US seat 0): right fist at the padlock, thumb up (palm toward +z), the key's bit down into the keyhole
      const turn = k === 3 ? smooth((u - 0.45) / 0.1) : (u >= 0.5 && u < 0.75 ? 1 : 0);
      const tgt = k === 4 && u >= 0.75 ? [1.3, 0.55, -2.35] : [LOCK[0] + 0.016 + 0.235, LOCK[1] + 0.01, LOCK[2] - 0.03];
      kst.openai = { hand: { R: 'hold' }, armR: { target: tgt, palm: k === 4 && u >= 0.75 ? [-1, 0, 0] : [0, -1, 0], pole: [0.5, -0.6, -0.6] }, look: LOCK, face: { eyes: 'narrow', mouth: 'flat' } };
      st.keys.openai = { hand: 'R', turn, aim: k === 4 && u >= 0.75 ? null : [LOCK[0] + 0.016, LOCK[1] - 0.005, LOCK[2]] };
      if (k === 3) cam(c, u > 0.8 ? [0.75, 0.4, -2.05] : [1.12, 0.36, -1.82], [1.1, 0.24, -2.43], 36);
      else cam(c, [0.2, 0.8, -1.55], [1.35, 0.4, -2.45], 38);
    } else if (k === 5) {
      api = { handFrame: () => fistM };
      st.keys.openai = { hand: u < 0.75 ? 'R' : null, turn: u >= 0.5 && u < 0.75 ? 1 : 0 };
      if (u >= 0.75) cam(c, [0.55, 0.5, -2.05], [0.85, 0.0, -2.35], 40);
      else cam(c, [-0.25, 0.42, 1.38], [0.0, 0.3, 1.0], 36);
    } else if (k === 6) {
      const ph = Math.min(3, Math.floor(u * 4 + 1e-6));
      const alt = q.get('clockz') ? +q.get('clockz') : -0.42;     // a proposed clockPos: z = seat z - 0.42
      st.clocks.google = { show: 1, n: [10, 5, 1, 0][ph], ring: ph === 3 ? 1 : 0, at: [1.1, 0, alt] };
      st.clocks.anthropic = { show: 1, n: 12, at: [1.1, 0, -1.25 + alt] };
      kst.google = { look: [-0.5, 0.6, 0.0], face: ph === 3 ? { eyes: 'wide', mouth: 'o' } : { eyes: 'narrow', mouth: 'flat' } };
      cam(c, [-0.6, 0.78, -0.05], [1.3, 0.4, -0.15], 36);
    } else if (k === 7) {
      const show = u < 0.5 ? u / 0.4 : 1, n = u < 0.5 ? 15 : Math.max(0, 15 - (u - 0.5) * 34);
      st.clocks.google = { show: clamp(show), n, ring: u > 0.94 ? 1 : 0 };
      cam(c, [1.62, 0.3, -0.42], [1.1, 0.16, -0.3], 34);
    } else if (k >= 8 && k <= 11) {
      const who = { 8: 'google', 9: 'doubao', 10: 'meta', 11: 'kimi' }[k], kind = { 8: 'gold', 9: 'castle', 10: 'city', 11: 'plant' }[k];
      const pp = pressPos(who), sgn = KINGS.find((x) => x.id === who).side === 'CN' ? -1 : 1;
      const above = [pp[0] + sgn * 0.12, 0.47, pp[2] + 0.04];
      let hp;
      if (kind === 'city') {
        if (u < 0.5) { const peel = u < 0.15 ? 0 : clamp((u - 0.15) / 0.25); hp = { kind, peel, u: 0 }; T.hole.visible = peel > 0.05; }
        else if (u < 0.7) { hp = { kind, peel: 1, grab: true, at: [pp[0] + 0.1, 0.62, pp[2] - 0.05], into: 0 }; T.hole.visible = true; }
        else { hp = { kind, peel: 1, into: 1, u: 0.45 }; T.hole.visible = true; }
        const g = cityGrab(hp.peel, new THREE.Vector3(), who);
        kst[who] = { hand: { R: 'hold', L: 'open' }, armR: { target: u >= 0.5 && u < 0.7 ? hp.at : g.toArray(), palm: [0, -1, 0] }, rise: 0.6, look: CITY };
      } else {
        if (u < 0.25) hp = { kind, at: above, into: 0 };
        else if (u < 0.45) hp = { kind, at: above, into: 0.5 };
        else if (u < 0.7) hp = { kind, u: 0 };
        else hp = { kind, u: 0.5 };
        kst[who] = u < 0.45 ? both([above[0], above[1] + FEED[kind].H * 0.4, above[2]], FEED[kind].R + 0.03) : { rise: 0.4, look: [pp[0], 0.3, pp[2]] };
      }
      st.presses[who] = { hopper: hp, lever: 0 };
      const camAt = { google: [[-0.25, 0.72, 0.42], [1.2, 0.4, -0.12]], doubao: [[0.35, 0.72, 2.85], [-1.2, 0.4, 2.4]], meta: [[-0.3, 0.75, 2.85], [1.15, 0.35, 2.2]], kimi: [[0.35, 0.72, 0.42], [-1.2, 0.4, -0.12]] }[who];
      cam(c, camAt[0], camAt[1], 34);
    } else if (k === 12) {
      const gl = u > 0.9 ? 1 : [0.2, 0.6, 1][Math.min(2, Math.floor(u * 3 + 1e-6))];
      for (const kk of KINGS) if (kk.side === 'US') st.presses[kk.id] = { glow: u > 0.9 ? 0.5 : 0 };
      st.presses.google = { glow: gl, lever: 0.3 };
      if (u > 0.9) cam(c, [-0.6, 0.9, 1.6], [0.9, 0.15, -0.6], 40);
      else cam(c, [0.35, 0.42, 0.32], [0.9, 0.17, -0.12], 34);
      look.beam = 0.6;
    } else if (k === 13) {
      // both giants' seals swinging (8-06 / 4-04 scale); fists ~4.6 m up behind each row
      const sw = Math.sin(u * Math.PI * 2) * 0.6;
      const fUS = [3.2, 4.6, 1.6], rUS = [0.1 + sw, 1.3, 3.0 - sw * 0.3];
      const fCN = [-3.2, 4.6, 1.2], rCN = [-0.2 - sw * 0.8, 1.6, 2.2];
      st.seals.US = { chain: chainPath(fUS, rUS, 0.2 * Math.cos(u * Math.PI * 2)), spin: 0.4 };
      st.seals.CN = { chain: chainPath(fCN, rCN, -0.2 * Math.cos(u * Math.PI * 2)), spin: -0.3 };
      cam(c, [0.0, 2.7, -5.6], [0.4, 1.6, 2.4], 46);
      look.beam = 0.8;
    } else if (k === 14) {
      const sw = Math.sin(u * Math.PI * 2) * 0.12;
      const ring = [0.1 + sw, 1.55, 3.0];
      st.seals.US = { chain: chainPath([3.2, 4.6, 1.6], ring, 0.1), spin: -1.2 };
      if (u < 0.5) cam(c, [-0.9, 0.95, 4.5], [0.05, 0.85, 3.0], 34);
      else if (u < 0.75) cam(c, [-0.55, 0.12, 4.05], [0.05, 0.75, 3.0], 40);
      else cam(c, [-1.6, 1.2, 6.2], [0.6, 1.9, 2.6], 46);          // medium-wide: the chain up to the fist
      G.uP2Pos.value.set(-0.6, 0.3, 4.0); G.uP2Col.value.setRGB(0.5, 0.45, 0.4); G.uP2Range.value = 3;
    } else if (k === 15) {
      for (const kk of KINGS) st.chips[kk.id] = { stack: kk.side === 'CN' ? 0.55 : 1, kind: kk.id === 'kimi' ? 'CN' : 'US' };
      st.chips.openai = { stack: 1, heap: u > 0 ? 1 - u : 1 };
      st.presses.qwen = { hopper: { kind: 'chips', u: 0.2 } };
      cam(c, [-0.35, 0.42, -0.45], [-0.75, 0.08, -1.4], 40);
      if (u > 0.4) cam(c, [0.45, 0.32, -2.15], [0.72, 0.05, -2.95], 40);
    } else if (k === 16 || k === 17) {
      // Claude's console (US seat 1): buttonPos = [1.06, 0, -0.95]
      const ph = Math.min(3, Math.floor(u * 4 + 1e-6));
      st.buttons.anthropic = { cover: ph >= 1 ? 1 : 0, press: ph === 2 ? 0.8 : 0, lit: ph >= 2 ? 1 : 0, cancel: 0, dead: ph === 3 ? 1 : 0 };
      if (k === 16) { kingsOn = false; cam(c, [1.5, 0.52, -0.55], [1.05, 0.04, -0.95], 34); }
      else cam(c, [0.38, 0.42, -1.12], [1.06, 0.05, -0.95], 34);
    }
    if (q.get('nokings')) kingsOn = false;
    K.root.visible = kingsOn;
    K.update(kst, t);
    P.update(st, t, api);
    if (k === 5) P.keyTip('openai', tipMark.position);
    void KEY_TIP; void keyRest;
    return look;
  };
}
