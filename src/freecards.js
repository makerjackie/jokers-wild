// 《失控》 — every card the director places by hand: the lazy cards, the race, the pile (a mountain of ~1500), the tower,
// the giant, the decks, the blizzard, the cards standing up and rising, the AI's vast cards in the dark, the two that
// fall at the end. One instanced mesh; the director computes each card's world transform (or hangs it on a hand).
//
//   makeFreeCards(ctx) -> { root, update(list, t, look), mesh }
//   list = [{ pos: [x,y,z], q: [x,y,z,w] (or rot: [rx,ry,rz] Euler 'YXZ'), scale (default 1),
//             face (atlas cell), back (cell), glyph 0..1, gcell,
//             glow 0..        self-light of the face (cold for glyph faces)
//             over: cell      an overlay cell painted G = mask, R/G = reading order (CELL.chatText)
//             reveal 0..1     how much of the overlay is written so far
//             writhe 0..1     the face crawls (the cards nobody can read any more)
//             dim 0..1        darkens the whole card (lost in the dark) }]
//   Held cards: the director gives { hand: { id, side, off: [x,y,z], tilt } } instead of pos/q; film.js resolves it on
//   the king's hand after the kings are posed (never from a previous frame).
import * as THREE from 'three';
import { celMaterial } from './materials.js';
import { CARD, cardAtlas, CARD_GLSL } from './cards.js';
import { CELL } from './cards-cells.js';

export const MAX = 4096;

const VS = CARD_GLSL.VS + 'attribute vec4 aFx;   // glow, writhe, dim, overlay cell (-1 none)\nattribute float aReveal;\nvarying vec4 vFx;\nvarying float vReveal;\n';
const FS = CARD_GLSL.FS + 'varying vec4 vFx;\nvarying float vReveal;\n';   // (uT is declared by celMaterial from `uniforms`)
// the face, re-sampled with a crawl when writhe > 0; the overlay text; dim; self-light
const PAT = CARD_GLSL.PAT + /* glsl */ `
  if(side > 0.5){
    if(vFx.y > 0.001){
      vec2 w = uv + vFx.y * vec2(0.012 * sin(uv.y * 31.0 + uT * 5.3 + vCell.w), 0.010 * sin(uv.x * 27.0 - uT * 4.1 + vCell.x));
      vec3 g = texture(uAtlas, cellUV(vCell.w, w)).rgb;
      float flick = 0.5 + 0.5 * sin(uT * 9.0 + uv.y * 12.0 + vCell.x * 3.1);
      col = mix(col, g, clamp(vFx.y, 0.0, 1.0));
      col *= 1.0 - 0.18 * vFx.y * flick;
    }
    if(vFx.w > -0.5){
      vec4 o = texture(uAtlas, cellUV(vFx.w, uv));
      float ord = o.r / max(o.g, 1e-3);
      float vis = smoothstep(0.08, 0.6, o.g) * (1.0 - smoothstep(vReveal - 0.004, vReveal + 0.004, ord));
      col = mix(col, vec3(0.82, 1.0, 0.86), vis);
      emis += vec3(0.55, 1.0, 0.7) * vis * 1.4;
    }
  }
  col *= 1.0 - clamp(vFx.z, 0.0, 1.0);
  emis += col * vFx.x;
`;

export function makeFreeCards() {
  const root = new THREE.Group(); root.name = 'freecards';
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aReveal = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  for (const a of [aCell, aFx, aReveal]) a.setUsage(THREE.DynamicDrawUsage);
  const uT = { value: 0 };
  const mat = celMaterial({ color: '#ffffff', id: 30, gloss: 0.5, uniforms: { uAtlas: { value: cardAtlas() }, uT },
    vsHead: VS, fsHead: FS, vertex: 'vCell = aCell; vFx = aFx; vReveal = aReveal;', pattern: PAT, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T), mat, MAX);
  mesh.geometry.setAttribute('aCell', aCell); mesh.geometry.setAttribute('aFx', aFx); mesh.geometry.setAttribute('aReveal', aReveal);
  mesh.frustumCulled = false; mesh.count = 0;
  root.add(mesh);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
  function update(list = [], t = 0) {
    const n = Math.min(MAX, list.length);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const c = list[i];
      if (!c.pos) continue;                        // a held card whose hand could not be solved
      P.set(...c.pos);
      if (c.q) Q.set(...c.q); else Q.setFromEuler(E.set(...(c.rot ?? [0, 0, 0]), 'YXZ'));
      const s = c.scale ?? 1; S.set(s, s, s);
      mesh.setMatrixAt(k, M.compose(P, Q, S));
      aCell.setXYZW(k, c.face ?? CELL.blank, c.back ?? CELL.backBlack, c.glyph ?? 0, c.gcell ?? CELL.glyph0);
      aFx.setXYZW(k, c.glow ?? 0, c.writhe ?? 0, c.dim ?? 0, c.over ?? -1);
      aReveal.setX(k, c.reveal ?? 0);
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true; aCell.needsUpdate = true; aFx.needsUpdate = true; aReveal.needsUpdate = true;
    uT.value = t;
  }
  return { root, update, mesh };
}

// ---- placement helpers for the director
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
// a quaternion whose local +z is `n` (the face normal) and local +y is `up` (the card's top edge direction)
export function basisQ(n, up) {
  _z.set(...n).normalize(); _y.set(...up); _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-8) { _y.set(0, 0, 1).addScaledVector(_z, -_z.z); if (_y.lengthSq() < 1e-8) _y.set(1, 0, 0); }
  _y.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z); _q.setFromRotationMatrix(_m);
  return [_q.x, _q.y, _q.z, _q.w];
}
// lying face up on the table, its top edge pointing along (dx, dz)
export const flatQ = (dx, dz) => basisQ([0, 1, 0], [dx, 0, dz]);
// face down (the back up), top edge along (dx, dz)
export const downQ = (dx, dz) => basisQ([0, -1, 0], [dx, 0, dz]);
export function slerpQ(a, b, u) { const A = new THREE.Quaternion(...a), B = new THREE.Quaternion(...b); A.slerp(B, u); return [A.x, A.y, A.z, A.w]; }
export function mulQ(a, b) { const A = new THREE.Quaternion(...a), B = new THREE.Quaternion(...b); A.multiply(B); return [A.x, A.y, A.z, A.w]; }
export function axisQ(axis, ang) { const A = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), ang); return [A.x, A.y, A.z, A.w]; }
export function rotV(q, v) { return new THREE.Vector3(...v).applyQuaternion(new THREE.Quaternion(...q)).toArray(); }
export function qFromMatrix(m) { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { pos: p.toArray(), q: [q.x, q.y, q.z, q.w], scale: s.x }; }
