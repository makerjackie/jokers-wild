// 《失控》 v2 — small things that roll out from under a card: the ant's bread crumb (1-06) and the kings' crowns (8-06).
//   makeRollers(ctx) -> { root, update(st.rollers) };  st.rollers = [{ kind: 'crumb' | 'crown', pos, q, scale, side }]
import * as THREE from 'three';
import { celMaterial, glowMaterial } from './materials.js';
import { lathe } from './geom.js';
import { CAMP } from './layout.js';

export const CROWN_R = 0.1;
export function makeRollers() {
  const root = new THREE.Group(); root.name = 'rollers';
  const gold = celMaterial({ color: '#c9a25e', id: 5, gloss: 0.85 });
  const silver = celMaterial({ color: '#d4d6da', id: 5, gloss: 0.85 });
  const crumbMat = celMaterial({ color: '#d9a85a', id: 175, gloss: 0.1 });
  // a crown: a band (lathe), five spikes with balls; a gem in the camp colour
  const crownGeom = (() => {
    const g = new THREE.Group();
    const band = new THREE.Mesh(lathe([[CROWN_R, 0], [CROWN_R * 1.04, 0.012], [CROWN_R, 0.05], [CROWN_R * 0.93, 0.05], [CROWN_R * 0.96, 0.012], [CROWN_R * 0.9, 0]], 32), gold);
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 8), gold); sp.position.set(Math.cos(a) * CROWN_R, 0.078, Math.sin(a) * CROWN_R); g.add(sp);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), gold); b.position.set(Math.cos(a) * CROWN_R, 0.112, Math.sin(a) * CROWN_R); g.add(b);
    }
    return g;
  })();
  const crowns = [];
  for (let i = 0; i < 10; i++) {
    const c = crownGeom.clone(true);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), celMaterial({ color: i < 5 ? CAMP.CN : CAMP.US, id: 160, gloss: 0.9 }));
    gem.position.set(0, 0.03, CROWN_R * 1.03); c.add(gem); c.userData.gem = gem;
    c.visible = false; root.add(c); crowns.push(c);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0022, 10, 28), gold); ring.visible = false; root.add(ring);
  // a pair of round wire spectacles (the red king's), lying flat: lenses in the xz plane
  const wire = celMaterial({ color: '#d8b266', id: 5, gloss: 0.9, litBias: 0.5, shadeMul: 3, emissive: '#7a5a22' });
  const lens = glowMaterial({ color: '#9fb4c8', id: 143, gain: 0.32 });
  const glasses = new THREE.Group(); glasses.visible = false; root.add(glasses);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0022, 8, 28).rotateX(Math.PI / 2), wire); l.position.set(sx * 0.026, 0, 0); glasses.add(l);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 24).rotateX(-Math.PI / 2), lens); d.position.set(sx * 0.026, 0.0004, 0); glasses.add(d);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.09, 6).rotateX(Math.PI / 2), wire); arm.position.set(sx * 0.047, 0, -0.045); glasses.add(arm); }
  { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.012, 6).rotateZ(Math.PI / 2), wire); glasses.add(br); }
  const crumb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0022, 1), crumbMat); crumb.visible = false; root.add(crumb);
  function update(list = []) {
    let ci = 0; crumb.visible = false; ring.visible = false; glasses.visible = false; for (const c of crowns) c.visible = false;
    for (const r of list) {
      if (r.of) continue;                       // a king's own crown: drawn by kings.js (setLoose)
      const o = r.kind === 'crumb' ? crumb : r.kind === 'ring' ? ring : r.kind === 'glasses' ? glasses : crowns[ci++];
      if (!o || !r.pos) continue;
      o.visible = true; o.position.set(...r.pos);
      if (r.q) o.quaternion.set(...r.q);
      o.scale.setScalar(r.scale ?? 1);
      if (r.kind === 'crown') { const mat = r.silver ? silver : gold; if (o.userData.mat !== mat) { o.traverse((m) => { if (m.isMesh && m !== o.userData.gem) m.material = mat; }); o.userData.mat = mat; } o.userData.gem.visible = false; }
      if (r.kind === 'crown' && r.side) o.userData.gem.material.uniforms && 0;
    }
  }
  return { root, update };
}
