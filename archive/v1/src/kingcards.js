// JOKERS WILD — the printed court cards the kings are pressed into (10-04 .. 11-05). One card per king, standing where
// the king sat (kings.cardFrame), double-headed: the king's last pose above, the same rotated below, his logo in the
// corners. The portrait is painted at load from a render of the king in that pose (film.js calls setPortrait); until
// then a court-card placeholder is printed. The head two are picked up by the card king's stream, folded face to face
// twice, carried down the table and stuffed under the short leg.
//
//   makeKingCards(ctx, deps: { kings, cardking }) -> { root, update(st, t), setPortrait(id, canvas) }
//   st[id] = { show, pop, lie, carried, pickU, fold 0..2, under: [x,y,z] | null, other }
import * as THREE from 'three';
import { celMaterial } from './materials.js';
import { KINGS, KING, CAMP } from './layout.js';
import { drawLogo, BRAND, WORDS } from './logos.js';

const PW = 512, PH = 744, T = 0.0022;

function paintCard(id, portrait) {
  const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH;
  const c = cv.getContext('2d');
  const camp = CAMP[KING[id].side], brand = BRAND[id] ?? '#222';
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, PW, PH);
  // the two heads: the portrait above, the same rotated 180° below, cut on a diagonal like a court card
  const half = (flip) => {
    c.save();
    if (flip) { c.translate(PW, PH); c.rotate(Math.PI); }
    c.beginPath(); c.moveTo(30, 30); c.lineTo(PW - 30, 30); c.lineTo(PW - 30, PH * 0.47); c.lineTo(30, PH * 0.53); c.closePath(); c.clip();
    if (portrait) c.drawImage(portrait, 30, 30, PW - 60, PH * 0.53 - 30);
    else {
      // placeholder: a court king's bust in flat colours
      c.fillStyle = camp; c.fillRect(60, PH * 0.3, PW - 120, PH * 0.25);
      c.fillStyle = '#f2dcc0'; c.beginPath(); c.ellipse(PW / 2, PH * 0.24, 70, 86, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d9b45a'; c.fillRect(PW / 2 - 80, PH * 0.08, 160, 46);
      drawLogo(c, id, PW / 2, PH * 0.11, 40);
    }
    c.restore();
  };
  half(false); half(true);
  // the dividing line and the frame
  c.strokeStyle = '#16110c'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(30, PH * 0.53); c.lineTo(PW - 30, PH * 0.47); c.stroke();
  c.strokeStyle = camp; c.lineWidth = 10; c.strokeRect(18, 18, PW - 36, PH - 36);
  c.strokeStyle = '#16110c'; c.lineWidth = 2.5; c.strokeRect(30, 30, PW - 60, PH - 60);
  // corner indices: K, the logo
  for (const flip of [false, true]) {
    c.save(); if (flip) { c.translate(PW, PH); c.rotate(Math.PI); }
    c.fillStyle = brand === '#101010' || brand === '#0b0b0d' ? '#16110c' : brand;
    c.font = 'bold 54px Georgia, serif'; c.textAlign = 'center'; c.fillText('K', 62, 92);
    drawLogo(c, id, 62, 130, 40);
    c.font = 'bold 22px Georgia, serif'; c.fillStyle = '#16110c'; c.fillText(WORDS[id] ?? id, PW / 2 + 60, 58);
    c.restore();
  }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.NoColorSpace; tx.anisotropy = 8;
  return tx;
}

const VS = '';                                      // (celMaterial declares the uniforms itself)
// fold 0..1: the top half folds down over the bottom half (about y = 0); 1..2: the left half folds over the right (x = 0)
const VX = /* glsl */ `
  { float f1 = clamp(uFold, 0.0, 1.0) * 3.14159, f2 = clamp(uFold - 1.0, 0.0, 1.0) * 3.14159;
    if(pos.y > 0.0){ float r = pos.y; pos.y = r * cos(f1); pos.z = pos.z + r * sin(f1) + 0.0014 * step(0.001, f1); }
    if(pos.x < 0.0){ float r = -pos.x; pos.x = -r * cos(f2); pos.z = pos.z + r * sin(f2) + 0.0028 * step(0.001, f2); } }
`;
const PAT = /* glsl */ `
  float side = vLocalN.z;
  if(side > 0.5) col = texture(uMap, vUv).rgb;
  else if(side < -0.5){ vec2 q = vUv * vec2(9.0, 13.0); col = mix(vec3(0.42, 0.08, 0.09), vec3(0.85, 0.7, 0.35), step(0.82, fract(q.x + q.y)) * 0.6); }
  else col = vec3(0.85, 0.8, 0.72);
  gloss = 0.1; litBias = 0.18; lampMul = 0.8;
`;

export function makeKingCards(ctx = {}, deps = {}) {
  const root = new THREE.Group();
  const cards = {};
  for (const k of KINGS) {
    const [w, h] = deps.kings?.cardSize ? deps.kings.cardSize(k.id) : [0.8, 1.16];
    const geo = new THREE.BoxGeometry(w, h, T, 10, 14, 1);
    const map = { value: paintCard(k.id, null) };
    const mat = celMaterial({ color: '#ffffff', id: 31, gloss: 0.2, uniforms: { uMap: map, uFold: { value: 0 }, uW: { value: w }, uH: { value: h } }, vsHead: VS, fsHead: '', vertex: VX, pattern: PAT, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    root.add(mesh);
    cards[k.id] = { mesh, mat, map, w, h };
  }
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P2 = new THREE.Vector3(), Q2 = new THREE.Quaternion();
  function update(st = {}, t = 0) {
    for (const k of KINGS) {
      const c = cards[k.id], s = st[k.id];
      c.mesh.visible = !!(s && s.show);
      if (!c.mesh.visible) continue;
      c.mat.uniforms.uFold.value = s.fold ?? 0;
      // where the king sat: his card frame (origin at the card's centre, +z toward the table)
      if (deps.kings?.cardFrame) deps.kings.cardFrame(k.id, M); else M.identity();
      M.multiply(M2.makeTranslation(0, 0, 0.03));                          // just in front of the pressed king
      const pop = s.pop ?? 1, sc = 0.6 + 0.4 * pop + 0.08 * Math.sin(Math.min(1, pop) * Math.PI);
      // lying back on the chair: rotate about the card's bottom edge
      const lie = s.lie ?? 0;
      M2.makeTranslation(0, -c.h / 2, 0).multiply(new THREE.Matrix4().makeRotationX(-lie * 1.35)).multiply(new THREE.Matrix4().makeTranslation(0, c.h / 2, 0));
      M.multiply(M2).multiply(new THREE.Matrix4().makeScale(sc, sc, 1));
      if (s.carried) {
        // on the stream's tip (face to face with the other one), or under the leg
        M.decompose(P, Q, S);
        if (s.under) {
          P2.set(...s.under); P2.y += (k.id === 'deepseek' ? 0.0 : T * 1.2); Q2.setFromEuler(new THREE.Euler(-Math.PI / 2, 0.35, k.id === 'deepseek' ? Math.PI : 0, 'YXZ'));
        } else if (deps.cardking?.armTip) {
          deps.cardking.armTip(M2); M2.decompose(P2, Q2, new THREE.Vector3());
          Q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, k.id === 'deepseek' ? Math.PI : 0)));
          P2.add(new THREE.Vector3(0, 0, (k.id === 'deepseek' ? -1 : 1) * T * 0.7).applyQuaternion(Q2));
        } else { P2.copy(P); Q2.copy(Q); }
        const u = s.pickU ?? 1;
        P.lerp(P2, u); Q.slerp(Q2, u);
        M.compose(P, Q, S.set(1, 1, 1));
      }
      c.mesh.matrix.copy(M); c.mesh.matrixWorldNeedsUpdate = true;
    }
  }
  function setPortrait(id, canvas) { const c = cards[id]; if (!c) return; c.map.value.dispose(); c.map.value = paintCard(id, canvas); c.mat.uniforms.uMap.value = c.map.value; }
  return { root, update, setPortrait, cards };
}
