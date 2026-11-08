// JOKERS WILD — effects: the glowing puppet threads, cigar smoke, lighter flames.
//   makeFx(ctx) -> { root, overlay, update(st.fx, t, world) }
//   st.fx = { strings: { [id]: { hand, k } }, smoke: [id...], flames: [{ id, k }] }
import * as THREE from 'three';
import { glowMaterial, overlayMaterial } from './materials.js';
import { KINGS } from './layout.js';
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
  const tMat = glowMaterial({ color: '#ffd9a0', id: 146, gain: 1.6 });
  const threads = new THREE.InstancedMesh(tGeo, tMat, KINGS.length * THREADS);
  threads.frustumCulled = false; threads.userData.noShadow = true; threads.count = 0;
  root.add(threads);
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
      for (let k = 0; k < THREADS; k++) {
        const rnd = mulberry32(id.length * 31 + k * 7);
        // the top end: high in the dark, a little toward the table's centre line
        B.set(A.x * 0.55 + (rnd() - 0.5) * 0.5, 3.6 + rnd() * 0.8, A.z + (rnd() - 0.5) * 0.6);
        // the threads drop from the dark above and snap onto the hand (anchored at the top, growing down)
        const len = A.distanceTo(B) * s.k;
        D.copy(A).sub(B).normalize();
        Q.setFromUnitVectors(UP, D);
        const w = 0.0035 * (cam ? Math.max(1, cam.position.distanceTo(A) / 2.5) : 1);
        M.compose(B, Q, S.set(w, len, w));
        threads.setMatrixAt(n++, M);
      }
    }
    threads.count = n; threads.instanceMatrix.needsUpdate = true;
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
