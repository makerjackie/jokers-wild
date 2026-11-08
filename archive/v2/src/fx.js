// JOKERS WILD — effects: the glowing puppet threads (and their fall), the gold leaking from the boxes into the
// presses, the ring of light from the first card, cigar smoke, lighter flames.
//   makeFx(ctx) -> { root, overlay, update(st.fx, t, world) }
//   st.fx = { strings: { [id]: { hand, k, fall } }, leaks: { CN: reach 0..5, US }, ring: { t0, at: [x,z], speed },
//             smoke: [id...], flames: [{ id, k }] }
import * as THREE from 'three';
import { glowMaterial, overlayMaterial } from './materials.js';
import { KINGS, KING, SIDE_SIGN, SEAT, BOXES, BOX, pressPos } from './layout.js';
import { mulberry32, onThrees } from './util.js';

const THREADS = 3;

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // a little curl
  x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 6;
  x.beginPath(); x.arc(70, 60, 26, 0.4, 3.6); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function makeFx(ctx = {}) {
  const root = new THREE.Group(), overlay = new THREE.Group();
  // threads: thin glowing boxes stretched between a hand and a point high in the dark
  const tGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const tMat = glowMaterial({ color: '#ffd9a0', id: 146, gain: 1.15 });
  const threads = new THREE.InstancedMesh(tGeo, tMat, KINGS.length * THREADS);
  threads.frustumCulled = false; threads.userData.noShadow = true; threads.count = 0;
  root.add(threads);
  // the gold veins: thin glowing strips lying on the cloth, pulses running from the box toward the presses
  const vGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);
  const vMat = glowMaterial({ color: '#ffc44d', id: 147, gain: 2.2, pattern: 'col *= 0.45 + 1.4 * pow(0.5 + 0.5 * sin(dot(vWorld.xz, vec2(9.0, 9.0)) - uFxTime * 8.0), 3.0);' });
  const veins = new THREE.InstancedMesh(vGeo, vMat, 160);
  veins.frustumCulled = false; veins.userData.noShadow = true; veins.count = 0;
  root.add(veins);
  // the first card's ring of light running out over the map
  const uRing = { value: -1 }, uRingC = { value: new THREE.Vector2() };
  const ringMat = glowMaterial({ color: '#ffd27a', id: 147, gain: 2.0, uniforms: { uRingR: uRing, uRingC },
    pattern: 'float rr = length((vWorld.xz - uRingC) * vec2(1.0, 0.75)); float w = 0.05 + 0.06 * uRingR; float b = 1.0 - smoothstep(0.0, w, abs(rr - uRingR)); if(b < 0.02 || uRingR < 0.0) discard; col *= b * (1.6 - 0.35 * uRingR);' });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.004; ring.userData.noShadow = true; ring.visible = false;
  root.add(ring);
  // smoke puffs and flames (overlay, additive)
  const tex = blobTexture();
  const smokeMat = overlayMaterial({ map: tex, color: '#b9b3a8', opacity: 0.5 });
  const puffs = [];
  for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smokeMat.clone()); m.visible = false; overlay.add(m); puffs.push(m); }
  const flameMat = overlayMaterial({ map: tex, color: '#ffb35c', opacity: 1, additive: true });
  const flames = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameMat.clone()); m.visible = false; overlay.add(m); flames.push(m); }

  const M = new THREE.Matrix4(), A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function update(st = {}, t = 0, world = {}) {
    const cam = world.camera;
    // ---- threads
    let n = 0;
    const strings = st.strings ?? {};
    for (const id in strings) {
      const s = strings[id];
      if (!world.kings) break;
      world.kings.handWorld(id, s.hand, A);
      const fall = s.fall ?? 0;
      for (let k = 0; k < THREADS; k++) {
        const rnd = mulberry32(id.length * 31 + k * 7);
        // the top end: the card that pulls them (s.top, from the director), else high in the dark
        if (s.top) B.set(s.top[0] + (k - 1) * 0.06, s.top[1] - 0.17, s.top[2] + (k - 1) * 0.05);
        else B.set(A.x * 0.55 + (rnd() - 0.5) * 0.5, 3.6 + rnd() * 0.8, A.z + (rnd() - 0.5) * 0.6);
        if (fall > 0) {
          // let go: the hand end slips off and drops to the cloth, the top end comes down after it; they lie there
          const f1 = Math.min(1, fall * 1.6), f2 = Math.max(0, (fall - 0.25) / 0.75);
          const lie = 0.006 + k * 0.002;
          A.set(A.x + (A.x * 0.8 - A.x) * f1, A.y + (lie - A.y) * f1 * f1, A.z + (rnd() - 0.5) * 0.2 * f1);
          B.set(B.x + (A.x * 0.4 + (rnd() - 0.5) * 0.4 - B.x) * f2, B.y + (lie - B.y) * f2 * f2, B.z + (A.z + (rnd() - 0.2) * 0.7 - B.z) * f2);
        }
        // the threads drop from the dark above and snap onto the hand (anchored at the top, growing down)
        const len = A.distanceTo(B) * s.k;
        D.copy(A).sub(B).normalize();
        Q.setFromUnitVectors(UP, D);
        const w = 0.0026 * (cam ? Math.max(1, cam.position.distanceTo(A) / 3.2) : 1);
        M.compose(B, Q, S.set(w, len, w));
        threads.setMatrixAt(n++, M);
      }
    }
    threads.count = n; threads.instanceMatrix.needsUpdate = true;
    // ---- veins: per side, a spine along the land from the box toward the foot and head, a branch to each press
    let nv = 0;
    const seg = (x0, z0, x1, z1, y, w) => {
      if (nv >= 160) return;
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-4) return;
      Q.setFromAxisAngle(UP, -Math.atan2(dz, dx));
      M.compose(A.set(x0, y, z0), Q, S.set(L, 0.004, w)); veins.setMatrixAt(nv++, M);
    };
    for (const side of ['CN', 'US']) {
      const r = st.leaks?.[side] ?? 0; if (r <= 0) continue;
      const sx = SIDE_SIGN[side], bx = BOXES[side][0], bz = BOXES[side][2];
      const spineX = sx * 0.64, w = 0.016;
      // down the box's sea face to the cloth, then to the spine
      if (world.set?.boxSeam) { world.set.boxSeam(side, D); const k = Math.min(1, r * 3); M.compose(A.set(D.x, 0.0, D.z), Q.identity(), S.set(w, Math.max(0.001, D.y * k), w * 0.5)); veins.setMatrixAt(nv++, M.multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0))); }
      seg(bx - sx * BOX.W * 0.5, bz, spineX, bz, 0.003, w);
      const ids = KINGS.filter((k) => k.side === side).sort((a, b) => Math.abs(SEAT.Z[a.seat] - bz) - Math.abs(SEAT.Z[b.seat] - bz));
      ids.forEach((kg, i) => {
        const u = Math.min(1, Math.max(0, r - i)); if (u <= 0) return;
        const p = pressPos(kg.id), zt = p[2];
        const along = Math.min(1, u * 1.6), out = Math.max(0, (u - 0.6) / 0.4);
        seg(spineX, bz, spineX, bz + (zt - bz) * along, 0.003, w);
        if (out > 0) seg(spineX, zt, spineX + (p[0] - spineX) * out, zt, 0.003, w);
      });
    }
    veins.count = nv; veins.instanceMatrix.needsUpdate = true;
    // ---- the ring of light from the first card
    const rg = st.ring;
    if (rg && t > rg.t0) { uRing.value = (t - rg.t0) * (rg.speed ?? 2.4); uRingC.value.set(rg.at?.[0] ?? 0, rg.at?.[1] ?? 0); ring.visible = uRing.value < 4.4; }
    else { ring.visible = false; uRing.value = -1; }
    // ---- smoke: puffs rising from each lit cigar tip, drawn on threes
    for (const p of puffs) p.visible = false;
    const tf = onThrees(t);
    let pi = 0;
    for (const id of st.smoke ?? []) {
      if (!world.props?.cigarTip) break;
      world.props.cigarTip(id, A);
      for (let k = 0; k < 7 && pi < puffs.length; k++) {
        const rnd = mulberry32(id.length * 97 + k * 13);
        const period = 2.2 + rnd() * 0.8;
        const age = ((tf + rnd() * period) % period) / period;
        const m = puffs[pi++];
        m.position.set(A.x + Math.sin(age * 5 + k) * 0.05 * age, A.y + age * 0.55, A.z + Math.cos(age * 4 + k) * 0.05 * age);
        const sc = 0.03 + age * 0.22;
        m.scale.setScalar(sc);
        if (cam) m.quaternion.copy(cam.quaternion);
        m.material.uniforms.uOpacity.value = 0.42 * Math.sin(age * Math.PI) * (1 - age * 0.5);
        m.visible = true;
      }
    }
    // ---- lighter flames
    for (const f of flames) f.visible = false;
    (st.flames ?? []).forEach((fl, i) => {
      if (i >= flames.length || !world.props?.cigarTip) return;
      world.props.cigarTip(fl.id, A);
      const m = flames[i]; m.position.copy(A).add(new THREE.Vector3(0, 0.025, 0)); m.scale.setScalar(0.05 * fl.k);
      if (cam) m.quaternion.copy(cam.quaternion);
      m.material.uniforms.uOpacity.value = fl.k; m.visible = true;
    });
  }
  return { root, overlay, update };
}
