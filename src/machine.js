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
//
// The design: a small cabinet on a stepped brass plinth with bun feet, brass corner posts with rivets, a cornice and a
// deck on top; a square card hopper (the funnel); in front a card mouth (hood, guide rails, a tray tongue, the edge of
// the card stack lit from behind) over a blank maker's cartouche; on one side the striking train (mounting plate, coil
// spring, a lever with a counterweight and a mallet head, a bell on a bracket), louvres on the other; a butterfly key.
// Scale is in the shaders, not the geometry: every machine material knows the machine's own frame (uInv) and its size
// (uS). Small, it shows one recessed panel per face and a little grime; huge, the enamel becomes riveted hull plating
// with seams, drip streaks, a darker foot and rows of rivets of which a few glow like windows. Self-light (`lit`) falls
// off with height, is shaped by a soft key and a rim, and the slot spills warm light onto the mouth, tray and plinth.
import * as THREE from 'three';
import { celMaterial, glowMaterial, C } from './materials.js';
import { lathe, roundBox, superEllipsoid, sectionLoft, tube } from './geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeChips } from './chips.js';
import { FLOOR_Y } from './layout.js';

const K = 1 / 0.9;                         // the model is built 0.9 tall; K makes its height exactly 1
export const SLOT = [0, 0.36 * K, 0.34 * K];     // where a card leaves (unit machine, x S)
export const HOPPER = [0, 0.9 * K, 0.07 * K];    // the funnel's mouth
export const TOP = [0, 0.905 * K, 0.27 * K];     // the funnel's front rim (a hand pats it here)
// its back (the side its king sits on): the key. On its top, along the back edge: a plate with two buttons, 托管 and 取消
export const KEY = [0, 0.38 * K, -0.44 * K];
export const BTN_AUTO = [0.092 * K, 0.682 * K, -0.225 * K], BTN_CANCEL = [-0.092 * K, 0.682 * K, -0.225 * K];
export const CORD = [0.2 * K, 0.6 * K, -0.33 * K];     // where its power cord comes out
const rotY = (v, yaw) => [v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), v[1], -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)];
// world point of a unit-machine point for a machine state { pos, yaw, S }
export const machinePoint = (m, p) => { const r = rotY(p, m.yaw ?? 0); return [m.pos[0] + r[0] * m.S, m.pos[1] + r[1] * m.S, m.pos[2] + r[2] * m.S]; };

const STYLE = { heart: { body: '#b3261f', side: -1 }, spade: { body: '#2b2e3d', side: 1 } };

// ---- shader pieces (all coordinates in the unit machine: height 0..1, front +z) ----
const SH_FRAME = /* glsl */ `
  vec3 mp = (uInv * vec4(vWorld, 1.0)).xyz;
  vec3 Nl = normalize(vLocalN);
  float big = smoothstep(2.0, 9.0, uS);                       // 0 as a toy, 1 as a building
  vec3 Vv = normalize(cameraPosition - vWorld);
  float rimE = smoothstep(0.5, 0.95, 1.0 - abs(dot(N, Vv)));
  float face = 0.6 + 0.4 * dot(Nl, normalize(vec3(0.35, 0.55, 0.75)));   // a soft key from front, right, above
  float fall = mix(1.05, 0.38, smoothstep(0.08, 1.0, mp.y));               // self-light falls off with height
  vec3 dsv = (mp - vec3(0.0, 0.37, 0.43)) * vec3(1.05, 1.7, 1.3);
  float spill = exp(-dot(dsv, dsv) * 13.0);                                // the slot's light on what is near it
`;
const SH_ENAMEL = /* glsl */ `
  ${SH_FRAME}
  vec3 an = abs(Nl);
  vec2 fc = an.x > 0.6 ? mp.zy : (an.z > 0.6 ? mp.xy : mp.xz);
  float hY = clamp((mp.y - 0.14) / 0.56, 0.0, 1.0);
  // grime rising from the foot (a little as a toy, a dark base as a mountain)
  col *= mix(1.0, mix(0.74, 0.5, big), 1.0 - smoothstep(0.0, mix(0.3, 0.62, big), hY));
  bool hamSide = Nl.x * uSide > 0.6, offSide = Nl.x * uSide < -0.6, back = Nl.z < -0.6;
  // toy scale: a recessed panel on each side and on the back
  if (an.x > 0.6 || back) {
    vec2 hs = an.x > 0.6 ? vec2(0.27, 0.215) : vec2(0.215, 0.215);
    vec2 q = abs(fc - vec2(0.0, 0.425)) - hs + 0.035;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.035;
    float fw = fwidth(d);
    float groove = 1.0 - smoothstep(0.003, 0.003 + fw * 1.5, abs(d));
    float lip = (1.0 - smoothstep(0.0, fw * 1.5, abs(d + 0.007))) * step(0.0, -d);
    col *= 1.0 - (0.55 * groove - 0.25 * lip) * (1.0 - 0.6 * big);
  }
  // louvres on the side without the hammer
  if (offSide) {
    float ly = (mp.y - 0.3) / 0.05, row = floor(ly), fy = fract(ly);
    float zq = abs(mp.z + 0.02);
    if (row >= 0.0 && row < 5.0 && zq < 0.17) {
      float slat = smoothstep(0.2, 0.32, fy) * (1.0 - smoothstep(0.62, 0.74, fy)) * (1.0 - smoothstep(0.15, 0.17, zq));
      col *= 1.0 - 0.8 * slat; emis += uWarm * slat * uLit * 0.25 * big;
    }
  }
  // building scale: hull plating, seams, drip streaks, rivet rows; a few rivets are lit like windows
  if (big > 0.001) {
    vec2 gg = fc / vec2(0.075, 0.05);
    float row = floor(gg.y);
    gg.x += 0.5 * mod(row, 2.0);
    vec2 cid = floor(gg), fg = fract(gg), fwg = max(fwidth(gg), vec2(1e-4));
    vec2 px = min(fg, 1.0 - fg) / fwg;
    float seam = 1.0 - smoothstep(0.5, 1.5, min(px.x, px.y));
    float tone = 0.86 + 0.24 * hash12(cid + 7.0);
    float rx = fc.x / 0.0125, rfw = fwidth(rx);
    vec2 rq = vec2(fract(rx) - 0.5, (fg.y - 0.16) * 4.0);
    float dr = length(rq);
    float dotm = (1.0 - smoothstep(0.24, 0.24 + rfw * 1.2, dr)) * (1.0 - smoothstep(0.3, 0.7, rfw));
    float n = vnoise(vec2(fc.x * 150.0, fc.y * 5.0)) * vnoise(vec2(fc.x * 37.0, fc.y * 2.0 + 3.0));
    float streak = smoothstep(0.18, 0.6, n) * (1.0 - fg.y * 0.7);
    vec3 k = vec3(tone * (1.0 - 0.5 * seam) * (1.0 - 0.35 * streak) * (1.0 - 0.3 * dotm));
    col *= mix(vec3(1.0), k, big);
    // windows: only some rows of some plates, a few rivets each
    float rowOn = step(0.62, hash12(vec2(floor(gg.x * 0.34), cid.y) + 11.7));
    float win = rowOn * step(0.72, hash12(vec2(floor(rx), cid.y) + 3.1)) * dotm * (1.0 - an.y);
    emis += uWarm * win * (0.4 + uLit) * 1.1 * big;
  }
  emis += col * uLit * (1.2 * face * fall + 0.45 * rimE) + uWarm * spill * (0.2 + 0.8 * uLit) * uGlowK * 0.8;
`;
const SH_BRASS = /* glsl */ `
  ${SH_FRAME}
  col *= mix(1.0, 0.5, (1.0 - smoothstep(0.0, 0.3, mp.y)) * big);       // tarnish low down when it is huge
  emis += col * uLit * (0.5 * face * fall + 0.4 * rimE) + uWarm * spill * (0.3 + 1.0 * uLit) * uGlowK * 1.1;
`;
const SH_DARK = /* glsl */ `
  ${SH_FRAME}
  emis += vec3(0.1, 0.085, 0.07) * uLit * (0.4 * face * fall + rimE) + uWarm * spill * uGlowK * 0.15;
`;

// a butterfly key: two pierced wings either side of the shaft, in the xy plane
function butterflyKey() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.02);
  s.bezierCurveTo(0.045, -0.02, 0.07, -0.078, 0.112, -0.066);
  s.bezierCurveTo(0.15, -0.052, 0.15, 0.052, 0.112, 0.066);
  s.bezierCurveTo(0.07, 0.078, 0.045, 0.02, 0, 0.02);
  s.bezierCurveTo(-0.045, 0.02, -0.07, 0.078, -0.112, 0.066);
  s.bezierCurveTo(-0.15, 0.052, -0.15, -0.052, -0.112, -0.066);
  s.bezierCurveTo(-0.07, -0.078, -0.045, -0.02, 0, -0.02);
  for (const sx of [-1, 1]) s.holes.push(new THREE.Path().absarc(sx * 0.098, 0, 0.022, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -0.005);
}

function buildMachine(id) {
  const st = STYLE[id], sd = st.side;
  const root = new THREE.Group(); root.name = `machine-${id}`;
  const g = new THREE.Group(); g.scale.setScalar(K); root.add(g);
  // shared per machine: its frame, its size, its self-light and slot glow
  const U = { uInv: { value: new THREE.Matrix4() }, uS: { value: 0.3 }, uLit: { value: 0 }, uGlowK: { value: 0.4 }, uSide: { value: sd }, uWarm: { value: C('#ff9a3c') } };
  const enamel = celMaterial({ color: st.body, id: 12, gloss: 0.75, rim: 1.2, litBias: 0.45, shadeMul: 3.4, uniforms: U, pattern: SH_ENAMEL });
  const brass = celMaterial({ color: '#c9a25e', id: 5, gloss: 0.9, litBias: 0.3, shadeMul: 2.4, uniforms: U, pattern: SH_BRASS });
  const rivetM = celMaterial({ color: '#d4b06a', id: 105, gloss: 0.9, litBias: 0.3, shadeMul: 2.4, uniforms: U, pattern: SH_BRASS });
  const dark = celMaterial({ color: '#0b0b0c', id: 13, gloss: 0.35, uniforms: U, pattern: SH_DARK });
  const cards = celMaterial({ color: '#e9dcbc', id: 110, gloss: 0, litBias: 0.3, shadeMul: 2, uniforms: U,
    pattern: 'col *= 0.62 + 0.38 * step(0.35, fract(vLocal.y * 380.0)); emis += uWarm * uGlowK * 0.55 * (0.5 + 0.5 * step(0.35, fract(vLocal.y * 380.0)));' });
  const glow = glowMaterial({ color: '#ffb450', id: 141, gain: 1, uniforms: { uGlowK: U.uGlowK },
    pattern: `vec2 q = vUv - 0.5; float ex = 1.0 - smoothstep(0.28, 0.5, abs(q.x)); float ey = exp(-q.y * q.y * 14.0);
      float core = exp(-pow((q.y - 0.12) * 9.0, 2.0)) * (1.0 - smoothstep(0.2, 0.48, abs(q.x)));
      col = col * (0.3 + 0.7 * ex) * (0.3 + 0.7 * ey) + vec3(1.0, 0.86, 0.62) * core * (0.35 + 0.9 * smoothstep(0.55, 1.0, uGlowK));` });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const rivets = [];
  const rivet = (x, y, z, r = 0.0075) => rivets.push(new THREE.SphereGeometry(r, 6, 4).translate(x, y, z));

  // feet, plinth (two steps), body, waist bands, corner posts, cornice, deck
  const footG = lathe([[0, 0], [0.028, 0], [0.042, 0.012], [0.044, 0.026], [0.032, 0.04], [0.036, 0.05], [0, 0.05]], 16);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(footG, brass, sx * 0.25, 0, sz * 0.3);
  add(roundBox(0.66, 0.05, 0.78, 0.016), brass, 0, 0.075, 0);
  add(roundBox(0.6, 0.03, 0.71, 0.01), brass, 0, 0.115, 0);
  add(roundBox(0.54, 0.5, 0.64, 0.035), enamel, 0, 0.38, 0);
  for (const y of [0.19, 0.57]) add(roundBox(0.556, 0.024, 0.656, 0.008), brass, 0, y, 0);
  const postG = roundBox(0.05, 0.5, 0.05, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(postG, brass, sx * 0.262, 0.38, sz * 0.312);
    for (let i = 0; i < 7; i++) { const y = 0.165 + i * 0.072; rivet(sx * 0.262, y, sz * 0.338); rivet(sx * 0.288, y, sz * 0.312); }
  }
  add(roundBox(0.6, 0.03, 0.7, 0.012), brass, 0, 0.645, 0);
  add(roundBox(0.5, 0.02, 0.6, 0.008), brass, 0, 0.666, 0);
  // the hopper it is fed through: square, flared, a rolled rim, a collar where it meets the deck
  const sec = (y, w, d) => ({ y, w, d, p: 5 });
  add(sectionLoft([sec(0.676, 0.088, 0.088), sec(0.7, 0.096, 0.096), sec(0.88, 0.196, 0.196), sec(0.893, 0.206, 0.206), sec(0.905, 0.2, 0.2),
    sec(0.9, 0.188, 0.188), sec(0.712, 0.07, 0.07)], 40, { caps: false }), brass, 0, 0, 0.07);
  add(roundBox(0.22, 0.03, 0.22, 0.01), brass, 0, 0.69, 0.07);
  add(new THREE.PlaneGeometry(0.15, 0.15).rotateX(-Math.PI / 2), dark, 0, 0.713, 0.07);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rivet(x * 0.095, 0.705, 0.07 + z * 0.095, 0.007);

  // the card mouth: a hood, two guide rails, a tray tongue; inside, the edge of the stack, lit from behind
  add(roundBox(0.44, 0.026, 0.066, 0.008), brass, 0, 0.3975, 0.352);
  for (const sx of [-1, 1]) add(roundBox(0.036, 0.098, 0.056, 0.008), brass, sx * 0.188, 0.36, 0.347);
  add(roundBox(0.42, 0.02, 0.09, 0.007).rotateX(0.12), brass, 0, 0.322, 0.362);
  add(new THREE.BoxGeometry(0.34, 0.016, 0.03), cards, 0, 0.342, 0.335);
  const slit = add(new THREE.PlaneGeometry(0.34, 0.052), glow, 0, 0.361, 0.3212);
  for (const sx of [-1, 1]) { rivet(sx * 0.188, 0.395, 0.376); rivet(sx * 0.188, 0.33, 0.376); }
  // a blank maker's cartouche under the mouth
  add(roundBox(0.25, 0.066, 0.014, 0.005), brass, 0, 0.255, 0.322);
  add(roundBox(0.214, 0.04, 0.01, 0.004), brass, 0, 0.255, 0.327);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rivet(sx * 0.113, 0.255 + sy * 0.022, 0.329, 0.0055);

  // the striking train on its side: mounting plate, coil spring, a lever with a counterweight and a mallet, a bell
  add(roundBox(0.014, 0.13, 0.12, 0.005), brass, sd * 0.276, 0.5, -0.12);
  for (const [y, z] of [[0.45, -0.17], [0.55, -0.17], [0.45, -0.07], [0.55, -0.07]]) rivet(sd * 0.284, y, z, 0.006);
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 18).rotateZ(Math.PI / 2), brass, sd * 0.29, 0.5, -0.12);
  const coil = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2 * 4.5; coil.push([sd * (0.298 + 0.012 * i / 64), 0.5 + 0.026 * Math.sin(a), -0.12 + 0.026 * Math.cos(a)]); }
  add(tube(coil, 0.0045, 96, 5), dark);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10).rotateZ(Math.PI / 2), brass, sd * 0.325, 0.5, -0.12);
  add(new THREE.CylinderGeometry(0.02, 0.016, 0.012, 12).rotateZ(Math.PI / 2), brass, sd * 0.37, 0.5, -0.12);
  const arm = new THREE.Group(); arm.position.set(sd * 0.325, 0.5, -0.12); g.add(arm);
  add(sectionLoft([{ y: -0.09, w: 0.012, d: 0.012, p: 4 }, { y: 0.0, w: 0.016, d: 0.016, p: 4 }, { y: 0.33, w: 0.01, d: 0.011, p: 4 }], 12).rotateX(Math.PI / 2), brass, 0, 0, 0, arm);
  add(new THREE.SphereGeometry(0.026, 12, 8), brass, 0, 0, -0.095, arm);
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.034, 14).rotateZ(Math.PI / 2), brass, 0, 0, 0, arm);
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.062, 18), dark, 0, 0, 0.37, arm);
  for (const y of [-0.026, 0.026]) add(new THREE.CylinderGeometry(0.039, 0.039, 0.01, 18), brass, 0, y, 0.37, arm);
  add(roundBox(0.09, 0.014, 0.05, 0.005), brass, sd * 0.315, 0.322, 0.24);
  add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8), brass, sd * 0.325, 0.338, 0.24);
  add(lathe([[0.0, 0], [0.05, 0.0], [0.062, 0.006], [0.058, 0.016], [0.05, 0.036], [0.034, 0.052], [0.012, 0.058], [0.012, 0.066], [0, 0.068]], 24), brass, sd * 0.325, 0.35, 0.24);

  // the key in its back: escutcheon, shaft, butterfly key
  add(lathe([[0, 0.01], [0.04, 0.01], [0.054, 0.005], [0.056, 0]], 24).rotateX(-Math.PI / 2), brass, 0, 0.38, -0.32);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 12).rotateX(Math.PI / 2), brass, 0, 0.38, -0.385);
  const key = new THREE.Group(); key.position.set(0, 0.38, -0.44); g.add(key);
  add(butterflyKey(), brass, 0, 0, 0, key);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 14).rotateX(Math.PI / 2), brass, 0, 0, 0.004, key);
  // where the cord leaves: a grommet and a strain relief
  add(new THREE.TorusGeometry(0.02, 0.006, 6, 16), brass, 0.2, 0.6, -0.322);
  add(new THREE.CylinderGeometry(0.013, 0.016, 0.03, 10).rotateX(Math.PI / 2), dark, 0.2, 0.6, -0.335);

  // the plate on its top, back edge: 托管 (lit while it plays by itself) and 取消 (which does nothing); a brass bezel
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
  add(new THREE.PlaneGeometry(0.4, 0.15).rotateX(-Math.PI / 2).rotateY(Math.PI), panelMat, 0, 0.6765, -0.225);
  for (const z of [-0.305, -0.145]) add(roundBox(0.42, 0.007, 0.01, 0.003), brass, 0, 0.678, z);
  for (const sx of [-1, 1]) add(roundBox(0.01, 0.007, 0.17, 0.003), brass, sx * 0.205, 0.678, -0.225);

  add(mergeGeometries(rivets), rivetM);
  return { root, arm, key, slit, U, panelMat, plates };
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
      m.root.updateMatrixWorld(true);
      m.U.uInv.value.copy(m.root.matrixWorld).invert();
      m.U.uS.value = S;
      m.U.uLit.value = s.lit ?? 0;
      m.U.uGlowK.value = Math.min(1.5, Math.max(0, s.glow ?? 0.4));
      m.slit.material.uniforms.uGain.value = 0.25 + 2.2 * (s.glow ?? 0.4);
      m.panelMat.uniforms.uMap.value = m.plates[s.auto ? 1 : 0];
      if (s.cord) {
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
