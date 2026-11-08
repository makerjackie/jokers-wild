// Bench for the ant (?bench=ant / node tools/build-bench.mjs ant). The real table, map cloth and lamp from set.js, the
// ant from ant.js. Each integer bench time is one setup; the fraction animates it.
//   0  macro side view, walking across the cloth near the table centre (x ~ 0.05, z ~ 0.1), camera ~4 cm at ant height
//   1  low three-quarter front, walking toward the lens
//   2  from behind and below, looking up past it toward the lamp ("the giants above"): ant sharp, the lamp blurred
//   3  alert, frozen, side close-up (antennae up, trembling)
//   4  the straightening: crumbTilt 0.5 -> 0 over the fraction (the head tugs it back), front three-quarter close
//   5  walking over the table's long edge at x = 1.2 (the body frame pitched down over the lip, feet on the curve)
//   6  top-down from 10 cm, beside a plain 0.18 x 0.26 m card rectangle for scale
//   7  small in a wider macro (25 cm away): the 30-60 px read          8  standing idle, rear three-quarter close
// URL: &style=noir|engrave|poster  &dof=0 (no depth of field)  &cam=x,y,z,lx,ly,lz,fov (camera override)  &crumb=0..1
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeSet } from '../set.js';
import { makeAnt, ANT } from '../ant.js';
import { TABLE } from '../layout.js';
import { smooth, clamp, lerp } from '../util.js';

// the carved edge of the tabletop (a copy of set.js's profile and fillet, read only): [o, y], o = outward offset from x = 1.2
function fillet(cs, seg = 6) {
  const out = [];
  for (let k = 0; k < cs.length; k++) {
    const [x, y, rad = 0] = cs[k];
    if (k === 0 || k === cs.length - 1 || !rad) { out.push([x, y]); continue; }
    const A = cs[k - 1], Cc = cs[k + 1];
    let ux = A[0] - x, uy = A[1] - y; const la = Math.hypot(ux, uy); ux /= la; uy /= la;
    let vx = Cc[0] - x, vy = Cc[1] - y; const lc = Math.hypot(vx, vy); vx /= lc; vy /= lc;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (ang > Math.PI - 1e-3) { out.push([x, y]); continue; }
    const t = Math.min(rad / Math.tan(ang / 2), la * 0.5, lc * 0.5);
    const rr = t * Math.tan(ang / 2);
    let bx = ux + vx, by = uy + vy; const lb = Math.hypot(bx, by); bx /= lb; by /= lb;
    const dc = rr / Math.sin(ang / 2), cx = x + bx * dc, cy = y + by * dc;
    const a0 = Math.atan2(y + uy * t - cy, x + ux * t - cx);
    let da = Math.atan2(y + vy * t - cy, x + vx * t - cx) - a0;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    for (let s = 0; s <= seg; s++) { const a = a0 + (da * s) / seg; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  }
  return out;
}
function edgePath() {
  const T = TABLE.THICK;
  const prof = fillet([[-0.06, -T], [-0.014, -T, 0.004], [-0.014, -T + 0.012, 0.004], [0.0, -T + 0.026, 0.012], [0.0, -0.042, 0.004],
    [-0.009, -0.036, 0.003], [-0.009, -0.03, 0.004], [0.004, -0.017, 0.013], [-0.006, -0.002, 0.008], [-0.05, -0.002]], 12);
  // walk from the top inward edge outward and down: reverse, keep down to the quirk
  const rev = prof.slice().reverse().map(([o, y]) => [TABLE.HALF_W + o, y]);
  const pts = [[1.1, -0.002]];
  for (const p of rev) { if (p[1] < -0.031) break; if (p[0] > 1.1) pts.push(p); }
  // resample by arc length
  const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc[acc.length - 1];
  const at = (s) => {
    s = clamp(s, 0, len);
    let i = 1; while (i < acc.length - 1 && acc[i] < s) i++;
    const f = (s - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1]);
    return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
  };
  return { at, len };
}

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine });
  scene.add(set.root);
  const ant = makeAnt({ scene, overlay, camera, engine });
  scene.add(ant.root);
  window.__ant = ant; window.ANT = ANT;
  const q = new URLSearchParams(location.search);
  // a plain card for scale (view 6)
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.26).rotateX(-Math.PI / 2), celMaterial({ color: '#d9cfb8', id: 110, gloss: 0.1 }));
  card.position.set(0.12, 0.0005, 0.3); scene.add(card);
  const edge = edgePath();
  const V = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
  const POW = G.uLampPow.value;
  const cam = (c, pos, look, fov, up = [0, 1, 0]) => { c.position.set(...pos); c.up.set(...up); c.lookAt(V.set(...look)); c.fov = fov; c.near = 0.004; };
  const yawQ = (dx, dz) => new THREE.Quaternion().setFromAxisAngle(U, Math.atan2(dx, dz)).toArray();
  const basisQ = (fwd, upv) => {
    const Z = new THREE.Vector3(...fwd).normalize(), Y = new THREE.Vector3(...upv).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)).toArray();
  };
  const S = ANT.STRIDE;
  return (t, c) => {
    const k = Math.max(0, Math.floor(t + 1e-6)), u = t - k;
    const look = { style: q.get('style') ?? 'noir', near: 0.004 };
    const st = {
      lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0, alarm: { on: 0, angle: 0 },
      boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
      cloth: { cities: 0, gold: 0, flood: null },
    };
    set.update(st, t);
    set.lampBulb(G.uLampPos.value);
    if (set.lampDir) set.lampDir(G.uLampDir.value);
    G.uLampPow.value = POW;
    G.uP2Col.value.setRGB(0, 0, 0);
    card.visible = k === 6;
    const a = { show: 1, pos: [0.05, 0, 0.1], q: yawQ(1, 0), walk: 0, speed: 0, alert: 0, look: null, crumb: 1, crumbTilt: 0, size: 1 };
    let focusP = null;
    if (k === 0) {
      const d = u * 4 * S;
      a.pos = [0.035 + d, 0, 0.1]; a.walk = u * 4; a.speed = 1;
      cam(c, [a.pos[0] + 0.004, 0.0042, 0.1 + 0.042], [a.pos[0] + 0.004, 0.0028, 0.1], 40);
    } else if (k === 1) {
      const d = u * 4 * S;
      a.pos = [0.03 + d, 0, 0.1]; a.walk = u * 4; a.speed = 1;
      cam(c, [0.086, 0.0058, 0.1 + 0.017], [a.pos[0] + 0.004, 0.003, 0.1], 40);
      focusP = [a.pos[0] + 0.006, 0.003, 0.1];
    } else if (k === 2) {
      const d = u * 3 * S;
      a.pos = [0.05, 0, 1.6 - d]; a.q = yawQ(0, -1); a.walk = u * 3; a.speed = 1;
      const cp = [0.0535, 0.0012, a.pos[2] + 0.03];
      const to = new THREE.Vector3(0.05, 0.0032, a.pos[2]).sub(V.set(...cp)).normalize();
      const toL = G.uLampPos.value.clone().sub(V.set(...cp)).normalize();
      const dir = to.multiplyScalar(0.6).add(toL.multiplyScalar(0.4)).normalize();
      cam(c, cp, [cp[0] + dir.x, cp[1] + dir.y, cp[2] + dir.z], 74);
      focusP = [0.05, 0.003, a.pos[2] + 0.001];
    } else if (k === 3) {
      a.alert = smooth(u / 0.12); a.speed = 1 - smooth(u / 0.1); a.walk = 0.31 + 0.12 * smooth(u / 0.1);
      if (u > 0.5) a.look = [0.06, 0.03, 0.1 - 0.05];     // the slap landed off to its left and above: it looks
      cam(c, [0.05 + 0.007, 0.0058, 0.1 + 0.03], [0.05 + 0.006, 0.0036, 0.1], 40);
      focusP = [0.05 + 0.006, 0.004, 0.1];
    } else if (k === 4) {
      a.crumbTilt = 0.5 * (1 - smooth((u - 0.1) / 0.75)); a.alert = 0.35 * (1 - smooth(u / 0.6)); a.walk = 0.43;
      cam(c, [0.05 + 0.032, 0.0062, 0.1 + 0.02], [0.05 + 0.007, 0.0032, 0.1], 38);
      focusP = [0.05 + 0.008, 0.003, 0.1];
    } else if (k === 5) {
      // over the lip: the ground point travels the profile; the frame is pitched to the chord between the hind and fore feet
      const s = lerp(0.07, edge.len - 0.003, u), h = 0.0045;
      const p0 = edge.at(s), pm = edge.at(s - h), pp = edge.at(s + h);
      const fx = pp[0] - pm[0], fy = pp[1] - pm[1];
      const a1 = Math.atan2(edge.at(s + 0.0015)[1] - edge.at(s - 0.0015)[1], edge.at(s + 0.0015)[0] - edge.at(s - 0.0015)[0]);
      const am = Math.atan2(p0[1] - pm[1], p0[0] - pm[0]), ap = Math.atan2(pp[1] - p0[1], pp[0] - p0[0]);
      void a1;
      a.pos = [p0[0], p0[1], 0.4]; a.q = basisQ([fx, fy, 0], [-fy, fx, 0]);
      a.groundBend = -(ap - am) / h;
      a.walk = s / S; a.speed = 1;
      cam(c, [1.226, -0.006, 0.4 + 0.03], [1.19, -0.002, 0.4], 46);
      focusP = [p0[0], p0[1], 0.4];
    } else if (k === 6) {
      const d = u * 3 * S;
      a.pos = [0.222, 0, 0.34 - d]; a.q = yawQ(0, -1); a.walk = u * 3; a.speed = 1;
      cam(c, [0.205, 0.1, 0.33], [0.205, 0, 0.33], 50, [0, 0, -1]);
      focusP = [0.222, 0, 0.33];
    } else if (k === 7) {
      const d = u * 4 * S;
      a.pos = [0.03 + d, 0, 0.1]; a.walk = u * 4; a.speed = 1;
      cam(c, [0.06, 0.05, 0.1 + 0.24], [0.045, 0.0, 0.1], 40);
      focusP = [a.pos[0], 0.002, 0.1];
    } else if (k === 8) {
      a.walk = 0.2;
      cam(c, [0.05 - 0.03, 0.009, 0.1 + 0.028], [0.05 - 0.002, 0.0025, 0.1], 40);
      focusP = [0.05 - 0.002, 0.003, 0.1];
    } else if (k === 9) {
      // inspection: head close-up from the side (u < .5 with the crumb, else without)
      a.crumb = u < 0.5 ? 1 : 0; a.walk = 0.2;
      cam(c, [0.05 + 0.007, 0.0045, 0.1 + 0.022], [0.05 + 0.007, 0.003, 0.1], 40);
      focusP = [0.05 + 0.007, 0.003, 0.1];
    } else if (k === 10) {
      // inspection: from above, 5 cm (u < .5 standing, else walking)
      a.walk = u < 0.5 ? 0.2 : u * 4; a.speed = u < 0.5 ? 0 : 1;
      cam(c, [0.05, 0.05, 0.1001], [0.05, 0, 0.1], 40, [1, 0, 0]);
      focusP = [0.05, 0.003, 0.1];
    } else if (k === 11) {
      // inspection: straight in front, at head height
      a.crumb = u < 0.5 ? 1 : 0; a.walk = 0.2;
      cam(c, [0.05 + 0.03, 0.004, 0.1], [0.05, 0.003, 0.1], 40);
      focusP = [0.05 + 0.008, 0.003, 0.1];
    }
    if (q.has('cam')) { const v = q.get('cam').split(',').map(Number); cam(c, v.slice(0, 3), v.slice(3, 6), v[6] ?? 40); focusP = v.slice(3, 6); }
    if (q.has('crumb')) a.crumb = +q.get('crumb');
    ant.update(a, t);
    const fp = focusP ?? [a.pos[0] + 0.004, 0.003, a.pos[2]];
    const focus = c.position.distanceTo(V.set(...fp));
    if (q.get('dof') !== '0') look.dof = { focus, k: 1.0, max: 18 };
    return look;
  };
}
