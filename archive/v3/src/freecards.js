// JOKERS WILD v3 reel — every card the director places by hand: the proposal cards (with their 批准？ box and the red
// stamp mark), the cards the AI plays by itself, the river, the pile, the two jokers, the kings' court cards and the
// card with the two paper people. One instanced mesh; the director computes each card's world transform.
//
//   makeFreeCards(ctx) -> { root, update(list, t, look) }
//   list = [{ pos: [x,y,z], q: [x,y,z,w] (or rot: [rx,ry,rz] Euler 'YXZ'), scale (default 1),
//             face (atlas cell), back (cell), glyph 0..1, gcell, tab 0..1, ink 0..1, inkCell, inkRot, glow }]
//   look = { waveC: [x,z], waveR }   // the gold flood: card backs inside waveR of waveC turn black-and-gold
import * as THREE from 'three';
import { celMaterial } from './materials.js';
import { CARD, cardAtlas, CARD_GLSL, TAB_UV } from './cards.js';
import { CELL } from './cards-cells.js';

const MAX = 1600;

const VS = CARD_GLSL.VS + 'attribute vec4 aFx;   // tab, ink, glow, ink rotation\nattribute float aInkCell;\nvarying vec4 vFx;\nvarying float vInkCell;\n';
const FS = CARD_GLSL.FS + 'varying vec4 vFx;\nvarying float vInkCell;\n';
const PAT = CARD_GLSL.PAT + /* glsl */ `
  if(side > 0.5){
    vec4 tb = texture(uAtlas, cellUV(${CELL.tab}.0, uv));
    col = mix(col, tb.rgb, tb.a * vFx.x);
    // the stamp mark: rotated a little about the box centre (in card metres, so the turn is not squashed)
    vec2 m = (uv - vec2(${TAB_UV[0]}, ${TAB_UV[1]})) * vec2(${CARD.W}, ${CARD.H});
    float ca = cos(vFx.w), sa = sin(vFx.w);
    m = vec2(ca * m.x - sa * m.y, sa * m.x + ca * m.y) / vec2(${CARD.W}, ${CARD.H}) + vec2(${TAB_UV[0]}, ${TAB_UV[1]});
    if(m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0){
      vec4 ik = texture(uAtlas, cellUV(vInkCell, m));
      float wet = smoothstep(0.0, 0.25, vFx.y);
      col = mix(col, ik.rgb * (1.0 - 0.15 * (1.0 - smoothstep(0.25, 1.0, vFx.y))), ik.a * wet);
    }
  } else if(side < -0.5){
    float wr = length(vWorld.xz - uWaveC);
    col = mix(col, texture(uAtlas, cellUV(${CELL.backBlack}.0, vec2(1.0 - uv.x, uv.y))).rgb, 1.0 - smoothstep(uWaveR - 0.1, uWaveR, wr));
  }
  emis = col * vFx.z;
`;

export function makeFreeCards() {
  const root = new THREE.Group(); root.name = 'freecards';
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aInk = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  for (const a of [aCell, aFx, aInk]) a.setUsage(THREE.DynamicDrawUsage);
  const uWaveC = { value: new THREE.Vector2(0, 0) }, uWaveR = { value: -1 };
  const mat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.5, uniforms: { uAtlas: { value: cardAtlas() }, uWaveC, uWaveR },
    vsHead: VS, fsHead: FS, vertex: 'vCell = aCell; vFx = aFx; vInkCell = aInkCell;', pattern: PAT, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T), mat, MAX);
  mesh.geometry.setAttribute('aCell', aCell); mesh.geometry.setAttribute('aFx', aFx); mesh.geometry.setAttribute('aInkCell', aInk);
  mesh.frustumCulled = false; mesh.count = 0;
  root.add(mesh);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
  function update(list = [], t = 0, look = {}) {
    const n = Math.min(MAX, list.length);
    for (let i = 0; i < n; i++) {
      const c = list[i];
      P.set(...c.pos);
      if (c.q) Q.set(...c.q); else Q.setFromEuler(E.set(...(c.rot ?? [0, 0, 0]), 'YXZ'));
      const s = c.scale ?? 1; S.set(s, s, s);
      mesh.setMatrixAt(i, M.compose(P, Q, S));
      aCell.setXYZW(i, c.face ?? CELL.blank, c.back ?? CELL.backBlack, c.glyph ?? 0, c.gcell ?? CELL.glyph0);
      aFx.setXYZW(i, c.tab ?? 0, c.ink ?? 0, c.glow ?? 0, c.inkRot ?? 0);
      aInk.setX(i, c.inkCell ?? CELL.ink0);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true; aCell.needsUpdate = true; aFx.needsUpdate = true; aInk.needsUpdate = true;
    uWaveC.value.set(...(look.waveC ?? [0, 0])); uWaveR.value = look.waveR ?? -1;
  }
  return { root, update, mesh };
}

// ---- placement helpers for the director
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
// a quaternion whose local +z is `n` (the face normal) and local +y is `up` (the card's top edge direction)
export function basisQ(n, up) {
  _z.set(...n).normalize(); _y.set(...up); _y.addScaledVector(_z, -_y.dot(_z)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z); _q.setFromRotationMatrix(_m);
  return [_q.x, _q.y, _q.z, _q.w];
}
// lying face up on the table, its top edge pointing along (dx, dz)
export const flatQ = (dx, dz) => basisQ([0, 1, 0], [dx, 0, dz]);
// face down (the back up), top edge along (dx, dz)
export const downQ = (dx, dz) => basisQ([0, -1, 0], [dx, 0, dz]);
export function slerpQ(a, b, u) { const A = new THREE.Quaternion(...a), B = new THREE.Quaternion(...b); A.slerp(B, u); return [A.x, A.y, A.z, A.w]; }
export function qFromMatrix(m) { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { pos: p.toArray(), q: [q.x, q.y, q.z, q.w], scale: s.x }; }
