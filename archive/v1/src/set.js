// JOKERS WILD — the set: the war room and everything fixed in it (module "set", docs/INTERFACES.md).
//
// A near-black stone hall lit by one pendant lamp: the long war-room table (dark carved walnut, cup-and-cover
// legs, one of them short) under an engraved sea-chart cloth, the swinging industrial lamp, the empty throne
// on its three-step dais, the two sealed glass cases on stone pedestals (crack / shatter / spotlight), the
// split-flap scoreboard with its red beacon, and the NVIDIA chip dispenser at the foot.
//
// Material ids: 1 table wood, 2 map cloth, 3 throne, 4 stone (dais, pedestals), 5 brass and gilt, 6 board frame,
// 7 lamp, 8 dispenser, 9 small parts (locks, seals, cushions); 101.. uninked; 141.. glows; 148 glass; 0 room.
// Every animated state is a pure function of (st.set, t).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { celMaterial, C } from './materials.js';
import { G } from './glsl.js';
import { TABLE, FLOOR_Y, THRONE, CASES, JOKER_Y, BOARD, LAMP, SEA_HALF, DISPENSER } from './layout.js';
import { BOARD_CHARS, BOARD_LOGOS, BOARD_GLYPHS, cells } from './board-text.js';
import { drawLogo, BRAND } from './logos.js';
import { CHIP, makeChips } from './chips.js';

// ---------------------------------------------------------------- the room and fixed numbers
export const ROOM = { HEAD_Z: -5.35, FOOT_Z: 13.0, SIDE_X: 5.4, CEIL_Y: 7.4 };
export const LAMP_PIVOT = [LAMP.pos[0], ROOM.CEIL_Y, LAMP.pos[2]];        // the chains' anchor line; the swing pivots here
export const LAMP_CORD = ROOM.CEIL_Y - LAMP.pos[1];                         // pivot -> bulb distance (m)
// the lamp hangs from two heavy chains running from lugs on the shade's flanks out to ceiling anchors at x = +-anchorX,
// so nothing hangs above the lamp's centre: in M1 the chains pass outside the board and the card king's face
export const LAMP_RIG = { anchorX: 4.4, lugX: 0.312 };
export const TABLE_GAP = 0.024;                                             // the short leg stops this far above the floor
// a rocking table pivots about the diagonal through the feet of legs 0 and 3
const DIAG_D = (() => { const [x0, z0] = TABLE.LEGS[0], [x3, z3] = TABLE.LEGS[3], [x2, z2] = TABLE.LEGS[TABLE.SHIM_LEG];
  const dx = x3 - x0, dz = z3 - z0, L = Math.hypot(dx, dz); return Math.abs((x2 - x0) * dz - (z2 - z0) * dx) / L; })();
export const WOBBLE_TOUCH = -TABLE_GAP / DIAG_D;                            // wobble at which the short leg touches the floor

const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lin = (hex) => { const c = C(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const f = (x) => { const s = (+x).toFixed(5); return s.includes('.') ? s : s + '.0'; };
const FADE = 'float mpp = max(length(fwidth(vWorld)), 1e-6);';

// deterministic hashes / value noise for load-time generation
function hashI(a, b, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae3d) ^ Math.imul((d | 0) + 0x27d4eb2f, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vn2(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hashI(ix, iy, s), b = hashI(ix + 1, iy, s), c = hashI(ix, iy + 1, s), d = hashI(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbmJ(x, y, s = 0, oct = 4) { let v = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { v += a * vn2(x, y, s + i * 31); n += a; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return v / n; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- geometry helpers
// rounded polyline: corners [x, y, filletRadius]
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
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    for (let s = 0; s <= seg; s++) { const a = a0 + (da * s) / seg; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  }
  return out;
}
// lathe about +y: profile [[r, y], ...] walked bottom -> top on the outside; theta 0 = +z. Repeat a point to crease.
// mod(theta, y, r) -> radius multiplier (carved lobes); then normals are recomputed.
function lathe(prof, nu = 48, mod = null) {
  const np = prof.length, cols = nu + 1;
  const pos = new Float32Array(cols * np * 3), nrm = new Float32Array(cols * np * 3), uv = new Float32Array(cols * np * 2), idx = [];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  let len = 0; const acc = [0];
  for (let k = 1; k < np; k++) { len += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]); acc.push(len); }
  for (let j = 0; j < np; j++) {
    let a = prof[Math.max(0, j - 1)], b = prof[Math.min(np - 1, j + 1)];
    if (j + 1 < np && same(prof[j], prof[j + 1])) b = prof[j];
    if (j > 0 && same(prof[j], prof[j - 1])) a = prof[j];
    const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy) || 1;
    const nr = dy / L, ny = -dr / L;
    for (let i = 0; i < cols; i++) {
      const th = (TAU * i) / nu, s = Math.sin(th), c = Math.cos(th), k = j * cols + i;
      const r = prof[j][0] * (mod ? mod(th, prof[j][1], prof[j][0]) : 1);
      pos[k * 3] = r * s; pos[k * 3 + 1] = prof[j][1]; pos[k * 3 + 2] = r * c;
      nrm[k * 3] = nr * s; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nr * c;
      uv[k * 2] = i / nu; uv[k * 2 + 1] = acc[j] / (len || 1);
    }
  }
  for (let j = 0; j < np - 1; j++) for (let i = 0; i < nu; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (mod) { g.computeVertexNormals(); }
  return g;
}
// a rounded rectangle (half sizes hx, hz, corner radius rc) as points with outward normals, in lathe order
function rrRing(hx, hz, rc, nc = 8) {
  const pts = [];
  const cs = [[hx - rc, hz - rc, 0], [-(hx - rc), hz - rc, Math.PI / 2], [-(hx - rc), -(hz - rc), Math.PI], [hx - rc, -(hz - rc), Math.PI * 1.5]];
  for (const [cx, cz, a0] of cs) for (let i = 0; i <= nc; i++) { const a = a0 + (Math.PI / 2) * (i / nc); pts.push({ cx, cz, nx: Math.cos(a), nz: Math.sin(a), sx: Math.sign(cx) || 1, sz: Math.sign(cz) || 1, hx, hz, rc }); }
  return pts.reverse();
}
// the ring point offset by o (exact offset curve: an inner offset past the corner radius gives a sharp corner)
function ringAt(p, o) {
  const r = p.rc + o;
  if (r >= 0) return [p.cx + p.nx * r, p.cz + p.nz * r];
  return [p.sx * (p.hx + o), p.sz * (p.hz + o)];
}
// a raised moulding ring's profile [o, height]: width w, height d, walked outer -> over the top -> inner
const bead = (w, d, r = 0.002) => fillet([[0, 0], [0, d * 0.45, r], [-w * 0.3, d, r], [-w * 0.7, d, r], [-w, d * 0.45, r], [-w, 0]], 2);
// sweep a profile [[o, y], ...] (o = outward offset from the rounded rectangle) around it; like lathe()
function rrSweep(hx, hz, rc, prof, nc = 8) {
  const ring = rrRing(hx, hz, rc, nc), n = ring.length, np = prof.length;
  const pos = new Float32Array(n * np * 3), nrm = new Float32Array(n * np * 3), uv = new Float32Array(n * np * 2), idx = [];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  const ul = [0]; for (let i = 1; i < n; i++) { const [px, pz] = ringAt(ring[i], 0), [qx, qz] = ringAt(ring[i - 1], 0); ul.push(ul[i - 1] + Math.hypot(px - qx, pz - qz)); }
  let vl = 0; const vacc = [0];
  for (let k = 1; k < np; k++) { vl += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]); vacc.push(vl); }
  for (let j = 0; j < np; j++) {
    let a = prof[Math.max(0, j - 1)], b = prof[Math.min(np - 1, j + 1)];
    if (j + 1 < np && same(prof[j], prof[j + 1])) b = prof[j];
    if (j > 0 && same(prof[j], prof[j - 1])) a = prof[j];
    const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy) || 1, nr = dy / L, ny = -dr / L;
    for (let i = 0; i < n; i++) {
      const p = ring[i], k = j * n + i, [px, pz] = ringAt(p, prof[j][0]);
      pos[k * 3] = px; pos[k * 3 + 1] = prof[j][1]; pos[k * 3 + 2] = pz;
      nrm[k * 3] = nr * p.nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nr * p.nz;
      uv[k * 2] = ul[i]; uv[k * 2 + 1] = vacc[j];
    }
  }
  for (let j = 0; j < np - 1; j++) for (let i = 0; i < n; i++) { const i1 = (i + 1) % n, a = j * n + i, b = j * n + i1, c = a + n, d = b + n; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// flat cap of a rounded rectangle at height y (o = offset of its rim)
function rrCap(hx, hz, rc, o, y, up = true, nc = 8) {
  const ring = rrRing(hx, hz, rc, nc), n = ring.length;
  const pos = [0, y, 0], nrm = [0, up ? 1 : -1, 0], uv = [0, 0], idx = [];
  for (const p of ring) { const [px, pz] = ringAt(p, o); pos.push(px, y, pz); nrm.push(0, up ? 1 : -1, 0); uv.push(px, pz); }
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); if (up) idx.push(0, a, b); else idx.push(0, b, a); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const rbox = (w, h, d, r = 0.008, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
  return g.applyMatrix4(m);
}
// merge geometries (position, normal, uv only)
function merge(list) {
  return mergeGeometries(list.map((g) => {
    const q = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k);
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (!q.attributes.normal) q.computeVertexNormals();
    q.clearGroups();
    return q;
  }));
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, noShadow = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (noShadow) m.userData.noShadow = true;
  if (parent) parent.add(m);
  return m;
}
function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- shared uniforms and GLSL
// spots: (x, z, radius at the floor, light) for the two glass-case spotlights; board glow; alarm (on, angle)
const SU = {
  uSpotA: { value: new THREE.Vector4(CASES.CN[0], CASES.CN[2], 0.4, 0) },
  uSpotB: { value: new THREE.Vector4(CASES.US[0], CASES.US[2], 0.4, 0) },
  uSpotCol: { value: C('#e9e4da') },
  uBoardLit: { value: 1 },
  uBounceK: { value: 2.6 },
  uKiln: { value: new THREE.Vector4(-1.6, 0.0, 3.4, 0) },      // the kiln's mouth (world xyz) and its fire light
};
const SHARED = /* glsl */ `
float lineAA(float d, float hw, float px){ px = max(px, 1e-6); float w = max(hw, px * 0.5); return clamp((w - d) / px + 0.5, 0.0, 1.0) * clamp(hw / w, 0.0, 1.0); }
// warm light thrown back by the lit map cloth: the table as two big diffuse patches (head half, foot half)
vec3 tableBounce(vec3 w, vec3 n){
  float s = 0.0;
  for(int i = 0; i < 2; i++){
    vec3 c = vec3(0.0, 0.0, i == 0 ? -1.6 : 1.6);
    vec3 d = c - w; float dist = max(length(d), 0.05); vec3 L = d / dist;
    s += lampReach(c) * max(dot(n, L), 0.0) * clamp(-L.y, 0.0, 1.0) * 7.7 / (3.14159 * dist * dist + 7.7);
  }
  return uLampCol * ${lin('#c9b28c')} * s * uBounceK;
}
// red fire light from the CN kiln's mouth (a fake practical, no shadow)
vec3 kilnLight(vec3 w, vec3 n){
  if(uKiln.w <= 0.0) return vec3(0.0);
  vec3 d = uKiln.xyz - w; float dist = max(length(d), 0.02); vec3 L = d / dist;
  float fl = 0.86 + 0.14 * sin(uFxTime * 23.0) * sin(uFxTime * 7.3 + 1.0);
  return ${lin('#ff4a16')} * uKiln.w * fl * max(dot(n, L) * 0.85 + 0.15, 0.0) * 1.8 / (1.0 + dist * dist * 2.4);
}
float spotPool(vec3 w, vec4 s){
  float r = length(w.xz - s.xy);
  float R = s.z * mix(0.12, 1.0, clamp((${f(ROOM.CEIL_Y)} - w.y) / ${f(ROOM.CEIL_Y - FLOOR_Y)}, 0.0, 1.0));
  return s.w * (1.0 - smoothstep(R * 0.72, R, r));
}
vec3 spotLight(vec3 w, vec3 n){ return uSpotCol * (spotPool(w, uSpotA) + spotPool(w, uSpotB)) * (0.25 + 0.75 * max(n.y, 0.0)); }
// amber light thrown by the lit scoreboard onto things near it (its face is the plane z = ${f(BOARD.pos[2])}, toward +z)
vec3 boardSpill(vec3 w, vec3 n){
  vec2 c = vec2(${f(BOARD.pos[0])}, ${f(BOARD.pos[1])});
  vec2 q = max(abs(w.xy - c) - vec2(${f(BOARD.W / 2)}, ${f(BOARD.H / 2)}), 0.0);
  float dz = w.z - ${f(BOARD.pos[2])};
  float d = length(vec3(q, max(dz, 0.0)));
  vec3 L = normalize(vec3(c - w.xy, ${f(BOARD.pos[2])} + 0.5 - w.z));
  return ${lin('#ff9a3a')} * uBoardLit * 0.22 * max(dot(n, L), 0.0) / (1.0 + 1.8 * d * d) * step(-0.25, dz);
}
`;
const sharedU = () => ({ ...SU });
// a cel material with the set's shared uniforms and GLSL
function cel(o) { return celMaterial({ ...o, uniforms: { ...sharedU(), ...(o.uniforms ?? {}) }, fsHead: SHARED + (o.fsHead ?? '') }); }

// ---------------------------------------------------------------- stock materials
function woodGLSL(base, dark, light, along = 'q.z', across = 'q.x + q.y') {
  return /* glsl */ `
    ${FADE}
    vec3 q = vLocal;
    float al = ${along}, ac = ${across};
    float fine = 1.0 - smoothstep(0.0008, 0.004, mpp);
    float warp = fbm2(vec2(al * 0.9, ac * 7.0)) * 2.2;
    float rings = fract(ac * 34.0 + warp);
    float grain = smoothstep(0.5, 0.92, rings) * mix(0.55, 1.0, fine);
    col = mix(${lin(base)}, ${lin(dark)}, grain * 0.75);
    col *= 0.86 + 0.28 * fbm2(vec2(al * 1.1, ac * 4.0) + 3.0);
    col *= 1.0 - 0.18 * fine * smoothstep(0.6, 0.95, vnoise(vec2(al * 160.0, ac * 900.0)));
    float wear = 0.0;
  `;
}

// ---------------------------------------------------------------- the room
function buildRoom() {
  const root = group(null);
  const { HEAD_Z, FOOT_Z, SIDE_X, CEIL_Y } = ROOM;
  // floor: big dark stone flags, worn smooth around the table (id 0, painted)
  const feet = TABLE.LEGS.map(([x, z]) => new THREE.Vector4(x, z, 0, 0));
  const ROOMU = { uKilnShow: { value: 0 }, uTowerStand: { value: 1 } };
  const floorMat = cel({
    color: '#5a5148', id: 0, gloss: 0.0, uniforms: { uFeet: { value: feet }, uKilnShow: ROOMU.uKilnShow, uTowerStand: ROOMU.uTowerStand },
    pattern: /* glsl */ `
      ${FADE}
      specK = 0.0;
      vec2 p = vWorld.xz;
      vec2 g = p / vec2(1.2, 0.9);
      float row = floor(g.y);
      g.x += 0.41 * row;
      vec2 cid = floor(g), fr = fract(g);
      float h = hash12(cid + 7.7);
      col = ${lin('#5b524a')} * (0.72 + 0.4 * h);
      col *= 0.8 + 0.4 * fbm2(p * vec2(1.7, 2.3) + h * 17.0);
      vec2 de = min(fr, 1.0 - fr) * vec2(1.2, 0.9);
      float jd = min(de.x, de.y);
      col *= 1.0 - 0.55 * lineAA(jd, 0.006, mpp);
      col *= 1.0 - 0.16 * (1.0 - smoothstep(0.002, 0.008, mpp)) * smoothstep(0.78, 0.9, vnoise(p * 70.0 + h));
      // a wide border of darker stone around the table area
      vec2 b = abs(p - vec2(0.0, 0.2)) - vec2(2.35, 4.15);
      float band = max(b.x, b.y);
      col *= mix(1.0, 0.6, smoothstep(-0.02, 0.0, band) * (1.0 - smoothstep(0.38, 0.4, band)));
      col *= 1.0 - 0.45 * lineAA(abs(band), 0.008, mpp) - 0.45 * lineAA(abs(band - 0.39), 0.008, mpp);
      // soot and age toward the walls
      col *= mix(1.0, 0.55, smoothstep(2.8, 4.8, abs(p.x)));
      // contact shadows: the table feet (the short leg's is weaker, it does not touch), pedestals, dais, dispenser, walls
      float ao = 1.0;
      for(int i = 0; i < 4; i++){
        vec2 q = abs(p - uFeet[i].xy) - vec2(0.085);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float k = 0.75 / (1.0 + uFeet[i].z * 120.0);
        ao *= 1.0 - k * (1.0 - smoothstep(-0.01, 0.07 + uFeet[i].z * 2.0, d));
      }
      for(int i = 0; i < 2; i++){
        vec2 q = abs(p - vec2(i == 0 ? ${f(CASES.CN[0])} : ${f(CASES.US[0])}, ${f(CASES.CN[2])})) - vec2(0.23);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        ao *= 1.0 - 0.7 * (1.0 - smoothstep(0.0, 0.16, d));
      }
      {
        vec2 q = abs(p - vec2(0.0, ${f(THRONE.pos[2] + 0.03)})) - vec2(1.24, 0.91);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        ao *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.14, d));
        ao *= 1.0 - 0.75 * (1.0 - smoothstep(0.0, 0.45, length(p - vec2(${f(DISPENSER.pos[0])}, ${f(DISPENSER.pos[2])})) - 0.42));
        ao *= mix(0.45, 1.0, smoothstep(0.0, 0.5, min(${f(ROOM.SIDE_X)} - abs(p.x), p.y - ${f(ROOM.HEAD_Z)})));
      }
      ao *= 1.0 - 0.7 * (1.0 - smoothstep(0.0, 0.4, length(p - vec2(-1.95, 3.75)) - 0.6)) * step(0.5, uKilnShow);
      { vec2 q = abs(p - vec2(2.9, 3.0)) - vec2(0.27); float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); ao *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.18, d)) * uTowerStand; }
      col *= ao;
      // light bounced off the lit floor fills the table's shadow a little
      vec3 fill = uLampCol * lampReach(vWorld) * 0.15;
      emis += col * (fill + spotLight(vWorld, N) * 2.0 + boardSpill(vWorld, N) + kilnLight(vWorld, N));
    `,
  });
  const fl = new THREE.PlaneGeometry(SIDE_X * 2, FOOT_Z - HEAD_Z, 1, 1).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, (FOOT_Z + HEAD_Z) / 2);
  mesh(fl, floorMat, root);

  // walls: big ashlar blocks, soot rising into the dark (id 0)
  const wallMat = cel({
    color: '#3e3832', id: 0, gloss: 0.0, rim: 0.4,
    pattern: /* glsl */ `
      ${FADE}
      specK = 0.0;
      vec2 q = vec2(abs(N.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y - ${f(FLOOR_Y)});
      vec2 g = q / vec2(1.05, 0.52);
      float row = floor(g.y);
      g.x += 0.5 * mod(row, 2.0) + 0.13 * hash12(vec2(row, 3.0));
      vec2 cid = floor(g), fr = fract(g);
      float h = hash12(cid + 1.3 + N.x * 7.0);
      col = ${lin('#443d36')} * (0.72 + 0.4 * h);
      col *= 0.8 + 0.4 * fbm2(q * vec2(1.3, 2.1) + h * 9.0);
      vec2 de = min(fr, 1.0 - fr) * vec2(1.05, 0.52);
      col *= 1.0 - 0.55 * lineAA(min(de.x, de.y), 0.007, mpp);
      // block faces are slightly pillowed: the top of each block catches more of the lamp
      litBias += (fr.y - 0.5) * 0.12;
      col *= mix(1.0, 0.5, smoothstep(0.8, 4.4, q.y));
      // plinth course
      col *= mix(0.8, 1.0, step(0.34, q.y));
      emis += col * (boardSpill(vWorld, N) * 2.2 + tableBounce(vWorld, N) + kilnLight(vWorld, N));
    `,
  });
  const H = CEIL_Y - FLOOR_Y, L = FOOT_Z - HEAD_Z, cz = (FOOT_Z + HEAD_Z) / 2;
  mesh(new THREE.PlaneGeometry(L, H).rotateY(Math.PI / 2).translate(-SIDE_X, FLOOR_Y + H / 2, cz), wallMat, root);
  mesh(new THREE.PlaneGeometry(L, H).rotateY(-Math.PI / 2).translate(SIDE_X, FLOOR_Y + H / 2, cz), wallMat, root);
  mesh(new THREE.PlaneGeometry(SIDE_X * 2, H).translate(0, FLOOR_Y + H / 2, HEAD_Z), wallMat, root);
  mesh(new THREE.PlaneGeometry(SIDE_X * 2, H).rotateY(Math.PI).translate(0, FLOOR_Y + H / 2, FOOT_Z), wallMat, root);
  // ceiling and its beams, almost never lit
  const ceilMat = cel({ color: '#1a1816', id: 0, gloss: 0, rim: 0, pattern: 'col *= 0.8 + 0.3 * fbm2(vWorld.xz * 0.7);' });
  mesh(new THREE.PlaneGeometry(SIDE_X * 2, L).rotateX(Math.PI / 2).translate(0, CEIL_Y, cz), ceilMat, root);
  const beams = [];
  for (let z = HEAD_Z + 1.1; z < FOOT_Z - 0.5; z += 2.5) beams.push(xf(rbox(SIDE_X * 2, 0.42, 0.36, 0.02), 0, CEIL_Y - 0.21, z));
  beams.push(xf(rbox(0.36, 0.3, L, 0.02), 0, CEIL_Y - 0.15 - 0.42, cz));
  mesh(merge(beams), ceilMat, root);

  // pilasters along the side walls, engaged columns either side of the throne wall (id 0)
  const stoneBg = cel({
    color: '#4a443d', id: 0, gloss: 0.0, rim: 0.8,
    pattern: /* glsl */ `
      ${FADE}
      specK = 0.0;
      col = ${lin('#4d463f')} * (0.82 + 0.36 * fbm2(vWorld.xy * vec2(2.0, 0.6) + vWorld.z));
      float hy = vWorld.y - ${f(FLOOR_Y)};
      col *= mix(1.0, 0.5, smoothstep(0.8, 4.6, hy));
      col *= 1.0 - 0.4 * lineAA(abs(fract(hy / 0.52 + 0.5) - 0.5) * 0.52, 0.005, mpp) * step(0.5, hy);
      emis += col * (boardSpill(vWorld, N) * 2.2 + tableBounce(vWorld, N) + kilnLight(vWorld, N));
    `,
  });
  const pil = [];
  for (const sx of [-1, 1]) for (let z = HEAD_Z + 1.35; z < FOOT_Z - 0.6; z += 2.5) {
    const x = sx * (SIDE_X - 0.14);
    pil.push(xf(rbox(0.3, H, 0.56, 0.02), x, FLOOR_Y + H / 2, z));
    pil.push(xf(rbox(0.4, 0.3, 0.68, 0.02), x - sx * 0.02, FLOOR_Y + 0.15, z));
    pil.push(xf(rbox(0.38, 0.22, 0.66, 0.02), x - sx * 0.02, CEIL_Y - 0.62, z));
  }
  mesh(merge(pil), stoneBg, root);
  // head-wall columns (round, fluted, with base and capital)
  const colProf = fillet([[0, 0], [0.42, 0, 0.01], [0.42, 0.16, 0.02], [0.38, 0.2, 0.03], [0.39, 0.27, 0.04], [0.33, 0.33, 0.01], [0.32, 0.4],
    [0.3, H - 0.62], [0.33, H - 0.55, 0.02], [0.4, H - 0.47, 0.02], [0.43, H - 0.38, 0.01], [0.43, H - 0.3], [0.2, H - 0.3], [0, H - 0.3]], 4);
  const flute = (th, y) => (y > 0.42 && y < H - 0.64 ? 1 - 0.035 * Math.pow(Math.abs(Math.cos(th * 10)), 6) : 1);
  const colGeo = lathe(colProf, 120, flute);
  for (const sx of [-1, 1]) mesh(colGeo, stoneBg, root, sx * 2.65, FLOOR_Y, HEAD_Z + 0.12);
  // heavy drapes between the side pilasters: vertical folds that catch the lamp at the bottom
  const drapeMat = cel({
    color: '#4a2620', id: 0, gloss: 0.0, rim: 0.9, side: THREE.DoubleSide,
    pattern: /* glsl */ `
      specK = 0.0;
      float hy = vWorld.y - ${f(FLOOR_Y)};
      col = ${lin('#552c24')} * (0.85 + 0.25 * fbm2(vec2(vWorld.z * 3.0, hy * 0.6)));
      col *= mix(1.0, 0.45, smoothstep(1.0, 4.4, hy));
      emis += col * (tableBounce(vWorld, N) * 1.3 + kilnLight(vWorld, N));
    `,
  });
  const drapes = [];
  for (const sx of [-1, 1]) for (let z = HEAD_Z + 1.35 + 1.25; z < FOOT_Z - 1.5; z += 2.5) {
    const w = 1.85, nu = 72, nv = 12, g = new THREE.PlaneGeometry(w, H - 0.75, nu, nv);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i), k = (u / w + 0.5);
      const fold = 0.06 * Math.sin(k * TAU * 6.5 + 0.7 * Math.sin(k * 9.0 + sx)) * (0.6 + 0.4 * Math.sin(k * 3.1 + z));
      p.setXYZ(i, u, v, fold + 0.04);
    }
    g.computeVertexNormals();
    g.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.translate(sx * (SIDE_X - 0.02), FLOOR_Y + (H - 0.75) / 2 + 0.02, z);
    drapes.push(g);
  }
  mesh(merge(drapes), drapeMat, root);
  return { root, feet, U: ROOMU };
}

// ---------------------------------------------------------------- the map cloth: coast distance field
const MAP = { HX: TABLE.HALF_W - 0.075, HZ: TABLE.HALF_L - 0.075, NX: 768, NZ: 2048 };
const ISLANDS = [[-0.3, -2.3, 0.045], [-0.26, 1.62, 0.034], [-0.32, 2.66, 0.026], [-0.33, -1.15, 0.02], [-0.27, -1.3, 0.012], [0.29, -1.42, 0.042], [0.31, 0.98, 0.03], [0.27, 1.12, 0.014], [0.25, 2.24, 0.038], [0.33, -2.65, 0.022], [0.3, -2.5, 0.012]];
function landF(x, z) {   // > 0 on land (metres, approximately a distance)
  const side = x < 0 ? 0 : 1, ax = Math.abs(x), s = side ? 51 : 13;
  let c = SEA_HALF
    + 0.11 * (fbmJ(z * 0.42 + s, s * 0.31, s, 3) - 0.5)
    + 0.05 * (fbmJ(z * 2.1 + s, ax * 2.0, s + 5, 3) - 0.5)
    + 0.05 * (1 - sstep(0.25, 0.6, Math.abs(z)));                     // keep the compass rose clear
  let v = ax - c + 0.034 * (fbmJ(x * 9 + s, z * 9, s + 9, 3) - 0.5) + 0.012 * (fbmJ(x * 24 + s, z * 24, s + 19, 2) - 0.5);
  for (let i = 0; i < ISLANDS.length; i++) {
    const [ix, iz, r] = ISLANDS[i], a = hashI(i, 5) * Math.PI, e = 1.6 + 1.6 * hashI(i, 9);
    const dx = x - ix, dz = z - iz, u = dx * Math.cos(a) + dz * Math.sin(a), w = -dx * Math.sin(a) + dz * Math.cos(a);
    const d = Math.hypot(u * e * 0.75, w / e * 1.3) - r * (0.65 + 0.7 * fbmJ(x * 36 + ix * 9, z * 36, 77, 3));
    v = Math.max(v, -d);
  }
  return v;
}
function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt(feature, W, H) {   // feature: Uint8Array (1 = feature); returns squared distance in texels
  const N = Math.max(W, H), fb = new Float64Array(N), db = new Float64Array(N), vb = new Int32Array(N), zb = new Float64Array(N + 1);
  const out = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = feature[i] ? 0 : 1e20;
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) fb[y] = out[y * W + x]; dt1(fb, H, db, vb, zb); for (let y = 0; y < H; y++) out[y * W + x] = db[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) fb[x] = out[y * W + x]; dt1(fb, W, db, vb, zb); for (let x = 0; x < W; x++) out[y * W + x] = db[x]; }
  return out;
}
let MAP_TEX = null;
function mapTexture() {
  if (MAP_TEX) return MAP_TEX;
  const { HX, HZ, NX, NZ } = MAP, W = NZ, H = NX, dz = (2 * HZ) / W, dx = (2 * HX) / H, tx = (dx + dz) / 2;
  const fv = new Float32Array(W * H), land = new Uint8Array(W * H), sea = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) { const x = -HX + (j + 0.5) * dx; for (let i = 0; i < W; i++) { const z = -HZ + (i + 0.5) * dz, v = landF(x, z), k = j * W + i; fv[k] = v; land[k] = v > 0 ? 1 : 0; sea[k] = v > 0 ? 0 : 1; } }
  const dL = edt(land, W, H), dS = edt(sea, W, H);
  // rivers: meandering from inland to the coast
  const riv = new Uint8Array(W * H);
  const rivW = new Float32Array(W * H);
  for (let r = 0; r < 10; r++) {
    const side = r < 5 ? -1 : 1;
    let z = -2.6 + (r % 5) * 1.25 + (hashI(r, 3) - 0.5) * 0.5, x = side * (HX - 0.02), ang = 0;
    for (let s = 0; s < 400; s++) {
      if (landF(x, z) < 0.004) break;
      ang = 0.9 * (fbmJ(s * 0.05, r * 3.1, 91 + r, 2) - 0.5) * 2;
      x -= side * 0.006 * Math.cos(ang); z += 0.006 * Math.sin(ang) * 1.6;
      const i = Math.round((z + HZ) / dz - 0.5), j = Math.round((x + HX) / dx - 0.5);
      if (i >= 0 && i < W && j >= 0 && j < H) { riv[j * W + i] = 1; rivW[j * W + i] = Math.min(1, s / 220); }
    }
  }
  const dR = edt(riv, W, H);
  const data = new Uint16Array(W * H * 4), toH = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < H; j++) {
    const x = -HX + (j + 0.5) * dx;
    for (let i = 0; i < W; i++) {
      const k = j * W + i, z = -HZ + (i + 0.5) * dz;
      let sd = land[k] ? -(Math.sqrt(dS[k]) - 0.5) * tx : (Math.sqrt(dL[k]) - 0.5) * tx;
      if (Math.abs(sd) < 6 * tx) {   // near the coast: the smooth analytic distance, blended into the exact one
        const e = 0.6 * tx, gx = (landF(x + e, z) - landF(x - e, z)) / (2 * e), gz = (landF(x, z + e) - landF(x, z - e)) / (2 * e);
        const sa = -fv[k] / Math.max(0.3, Math.hypot(gx, gz));
        const w = sstep(3 * tx, 6 * tx, Math.abs(sd));
        sd = sa * (1 - w) + sd * w;
      }
      const ax = Math.abs(x);
      const hill = sstep(0.5, 0.7, fbmJ(x * 2.2 + 5, z * 1.4, 33, 3)) * sstep(0.58, 0.78, ax);
      const marsh = sstep(0.55, 0.68, fbmJ(x * 3.1 + 9, z * 2.4, 44, 3)) * sstep(0.5, 0.62, ax) * (1 - hill);
      data[k * 4] = toH(sd); data[k * 4 + 1] = toH(Math.sqrt(dR[k]) * tx); data[k * 4 + 2] = toH(hill); data[k * 4 + 3] = toH(marsh);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
  tex.needsUpdate = true;
  MAP_TEX = tex;
  return tex;
}

function clothMaterial() {
  const { HX, HZ } = MAP;
  return cel({
    color: '#b9a684', id: 2, gloss: 0.0,
    uniforms: { uMap: { value: mapTexture() } },
    pattern: /* glsl */ `
      ${FADE}
      specK = 0.0;
      vec2 p = vLocal.xz;
      vec4 M = texture(uMap, vec2((p.y + ${f(HZ)}) / ${f(2 * HZ)}, (p.x + ${f(HX)}) / ${f(2 * HX)}));
      float fine = 1.0 - smoothstep(0.0006, 0.0025, mpp);
      float sd = M.r + (vnoise(p * 150.0) - 0.5) * 0.0018 * fine + (vnoise(p * 40.0) - 0.5) * 0.002;
      float px = max(fwidth(sd), 1e-6);
      float land = clamp(0.5 - sd / px, 0.0, 1.0);
      vec3 paper = ${lin('#bfac88')};
      vec3 seaP = ${lin('#a49678')};
      col = mix(seaP, paper, land);
      col *= 1.0 - 0.12 * land * (1.0 - smoothstep(0.0, 0.04, -sd));          // hand-tinted coastal band
      col *= 0.93 + 0.12 * fbm2(p * 3.0 + 1.3);                              // age mottling
      col *= 1.0 - 0.09 * smoothstep(0.6, 0.78, fbm2(p * 1.6 + 7.0));          // old stains
      float ink = 0.0;
      // coastline: a firm engraved line
      { float hw = 0.0012, w = max(hw, px * 0.6); ink = max(ink, clamp((w - abs(sd)) / px + 0.5, 0.0, 1.0) * clamp(hw / w * 1.7, 0.0, 1.0)); }
      // water-lining: lines following the coast, spaced wider and fainter out to sea
      {
        float kk = pow(max(sd, 0.0) / 0.0042, 0.8);
        float dk = max(fwidth(kk), 1e-5);
        float dl = abs(fract(kk + 0.5) - 0.5);
        float lc = clamp((0.075 - dl) / dk + 0.5, 0.0, 1.0) * min(1.0, 0.15 / dk);
        float fadeM = smoothstep(0.12, 0.3, dk);
        lc = mix(lc, 0.42 * exp(-kk * 0.3), fadeM);
        ink = max(ink, lc * 0.78 * step(0.5, kk) * (1.0 - smoothstep(4.5, 8.5, kk)));
      }
      // compass rose at the centre (north = the throne, -z)
      float r = length(p);
      float R = 0.27;
      float a = atan(p.x, -p.y);
      if(r < R * 1.2){
        float ringD = min(abs(r - R), abs(r - R * 1.07));
        ink = max(ink, lineAA(ringD, 0.0007, mpp));
        float tick = abs(fract(a / ${f(TAU / 72)} + 0.5) - 0.5) * ${f(TAU / 72)} * r;
        float inBand = step(R, r) * step(r, R * 1.07);
        ink = max(ink, lineAA(tick, 0.00045, mpp) * inBand * mix(1.0, 0.0, smoothstep(0.0015, 0.003, mpp)));
        ink = mix(ink, 0.55, inBand * smoothstep(0.0015, 0.003, mpp) * 0.6);
        // the star: 8 minor points, 4 intercardinal, 4 cardinal (north longest), each half dark / half light
        for(int tier = 0; tier < 3; tier++){
          float n = tier == 0 ? 16.0 : (tier == 1 ? 8.0 : 4.0);
          float off = tier == 0 ? 3.14159265 / 8.0 : (tier == 1 ? 3.14159265 / 4.0 : 0.0);
          float stp = 6.2831853 / (tier == 0 ? 8.0 : 4.0);
          float L = tier == 0 ? R * 0.5 : (tier == 1 ? R * 0.72 : R * 0.98);
          float w = tier == 0 ? R * 0.07 : (tier == 1 ? R * 0.1 : R * 0.13);
          float aq = floor((a - off) / stp + 0.5) * stp + off;
          if(tier == 2 && abs(aq) < 0.1) L = R * 1.16;
          float u = r * cos(a - aq), v = r * sin(a - aq);
          float e = w * (1.0 - u / L) - abs(v);
          if(u > -0.002 && u < L && e > 0.0){
            col = mix(seaP, paper, 0.6);
            ink = v > 0.0 ? 0.82 : 0.06;
          }
          ink = max(ink, lineAA(abs(e), 0.00045, mpp) * step(0.0, u) * step(u, L));
          ink = max(ink, lineAA(abs(v), 0.0003, mpp) * step(0.0, u) * step(u, L) * step(0.0, e));
        }
        ink = max(ink, lineAA(abs(r - R * 0.045), 0.0005, mpp));
        if(r < R * 0.045){ col = paper; ink = 0.0; }
      }
      // rhumb lines from the central rose and two secondary centres
      {
        float rh = 0.0;
        for(int k = 0; k < 3; k++){
          vec2 c = k == 0 ? vec2(0.0) : vec2(0.0, k == 1 ? -2.05 : 2.05);
          vec2 d = p - c; float rr = length(d);
          float aa = atan(d.x, -d.y);
          float stp = 3.14159265 / 16.0;
          float da = aa - floor(aa / stp + 0.5) * stp;
          float dl = rr * abs(sin(da));
          float start = k == 0 ? R * 1.07 : 0.07;
          rh = max(rh, lineAA(dl, 0.0003, mpp) * step(start, rr) * (k == 0 ? 1.0 : 1.0 - smoothstep(1.6, 2.4, rr)));
          if(k > 0){
            float a2 = atan(d.x, -d.y);
            float sp = abs(fract(a2 / (6.2831853 / 8.0)) - 0.5) * 2.0;
            float star = 0.07 * mix(0.35, 1.0, pow(sp, 3.0));
            ink = max(ink, lineAA(abs(rr - star), 0.0004, mpp) * step(rr, 0.075));
            ink = max(ink, lineAA(abs(rr - 0.072), 0.0005, mpp));
          }
        }
        ink = max(ink, rh * 0.42);
      }
      // engraved waves in the open sea
      {
        vec2 wq = vec2(p.y / 0.028, p.x / 0.017);
        float wrow = floor(wq.y);
        wq.x += 0.5 * mod(wrow, 2.0) + 0.3 * hash12(vec2(wrow, 5.0));
        vec2 wf = fract(wq) - 0.5;
        vec2 ac = (wf - vec2(0.0, -0.15)) * vec2(0.028, 0.017);
        float ar = length(ac * vec2(0.7, 1.0)) - 0.0055;
        float arc = lineAA(abs(ar), 0.00035, mpp) * step(0.0, ac.y);
        float waveMask = smoothstep(0.03, 0.055, sd) * smoothstep(R * 1.12, R * 1.2, r) * step(0.35, hash12(floor(wq) + 3.0));
        float far = smoothstep(0.0015, 0.004, mpp);
        ink = max(ink, mix(arc * 0.6, 0.07, far) * waveMask);
      }
      // land: rivers, hill symbols, marsh stipple
      if(sd < 0.0){
        float rw = mix(0.0003, 0.0009, smoothstep(0.7, 0.45, abs(p.x)));
        ink = max(ink, lineAA(M.g + (vnoise(p * 300.0) - 0.5) * 0.0006 * fine, rw, mpp) * 0.75 * smoothstep(0.0, 0.004, -sd));
        vec2 hq = vec2(p.y / 0.042, p.x / 0.03);
        float hrow = floor(hq.y);
        hq.x += 0.5 * mod(hrow, 2.0);
        vec2 hid = floor(hq), hf = (fract(hq) - 0.5) * vec2(0.042, 0.03);
        float hr = hash12(hid + 11.0);
        if(hr < M.b * 0.95){
          hf += (vec2(hash12(hid + 2.0), hash12(hid + 4.0)) - 0.5) * 0.008;
          vec2 e = hf * vec2(1.0, 1.0) / vec2(0.014, 0.011);
          float hd = (length(e) - 1.0) * 0.011;
          float hill = lineAA(abs(hd), 0.00035, mpp) * step(0.0, -hf.y);
          float hatch = lineAA(abs(fract(hf.x / 0.0022) - 0.5) * 0.0022, 0.00028, mpp) * step(hd, 0.0) * step(0.0, hf.x) * step(0.0, -hf.y);
          float far = smoothstep(0.0012, 0.003, mpp);
          ink = max(ink, mix(max(hill, hatch * 0.7) * 0.75, 0.12 * step(hd, 0.0) * step(0.0, -hf.y), far));
        }
        vec2 sq = p / 0.006;
        vec2 sid = floor(sq);
        float st = step(1.0 - M.a * 0.45, hash12(sid)) * (1.0 - smoothstep(0.0, 0.0013, length(fract(sq) - 0.5) * 0.006));
        ink = max(ink, mix(st * 0.6, M.a * 0.1, smoothstep(0.0008, 0.002, mpp)));
      }
      // neat lines and a graduated border
      {
        float de = min(${f(HX)} - abs(p.x), ${f(HZ)} - abs(p.y));
        ink = max(ink, lineAA(abs(de - 0.011), 0.0008, mpp));
        ink = max(ink, lineAA(abs(de - 0.031), 0.0005, mpp));
        float along = abs(p.x) > ${f(HX)} - 0.035 && abs(p.y) < ${f(HZ)} - 0.031 ? p.y : p.x;
        float seg = step(0.5, fract(along / 0.06));
        ink = max(ink, step(0.016, de) * step(de, 0.026) * seg * 0.75);
        ink = max(ink, lineAA(abs(de - 0.016), 0.0003, mpp) + lineAA(abs(de - 0.026), 0.0003, mpp));
        col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.05, de));
      }
      // fold creases (the chart was folded for years)
      {
        float cz = abs(fract(p.y / ${f(HZ / 4)} + 0.5) - 0.5) * ${f(HZ / 4)};
        float cx = min(abs(p.x), abs(abs(p.x) - ${f(HX / 2)}));
        float cr = min(cz, cx);
        float wearC = 0.6 + 0.4 * vnoise(p * 9.0);
        col *= 1.0 - 0.1 * wearC * lineAA(cr, 0.0008, mpp);
        col *= 1.0 + 0.035 * wearC * (1.0 - smoothstep(0.001, 0.006, cr));
      }
      // foxing
      {
        vec2 fq = p / 0.07; vec2 fid = floor(fq);
        float fh = hash12(fid + 21.0);
        vec2 fc = (vec2(hash12(fid + 5.0), hash12(fid + 8.0)) - 0.5) * 0.05;
        float fd = length((fract(fq) - 0.5) * 0.07 - fc);
        col *= 1.0 - 0.16 * step(0.9, fh) * (1.0 - smoothstep(0.0015, 0.004 + 0.003 * fh, fd));
        // a wine ring where somebody put a glass down
        vec2 wr = p - vec2(-0.78, 0.42);
        float ring = abs(length(wr) - 0.036 - 0.002 * sin(atan(wr.y, wr.x) * 3.0));
        col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.0035, ring)) * (0.6 + 0.4 * vnoise(wr * 120.0));
      }
      col = mix(col, ${lin('#3a2a1c')}, clamp(ink, 0.0, 1.0) * 0.86);
      emis += col * kilnLight(vWorld, N) * 0.8;
    `,
  });
}

// ---------------------------------------------------------------- the table
function buildTable() {
  const top = group(null);                           // the rocking frame (identity at rest)
  const HW = TABLE.HALF_W, HL = TABLE.HALF_L, T = TABLE.THICK;
  const woodTop = cel({
    color: '#3e2a1b', id: 1, gloss: 0.55,
    pattern: woodGLSL('#432d1d', '#24160d', '#5a3d27', 'abs(vLocalN.x) > abs(vLocalN.z) || vLocalN.y > 0.6 ? q.z : q.x', 'abs(vLocalN.x) > abs(vLocalN.z) || vLocalN.y > 0.6 ? q.x + q.y : q.z + q.y') + /* glsl */ `
      // the carved edge: polish rubbed through on the top bead, grime in the quirks
      float eh = vLocal.y;
      col = mix(col, ${lin('#6b4a2e')}, 0.35 * smoothstep(-0.02, -0.006, eh) * step(vLocalN.y, 0.95));
      col *= mix(1.0, 0.7, (1.0 - smoothstep(-0.075, -0.06, eh)));
      specTh = 0.968;
      emis += col * (boardSpill(vWorld, N) + kilnLight(vWorld, N));
    `,
  });
  // tabletop: the carved edge profile swept around the top, flat caps above and below
  const prof = fillet([[-0.06, -T], [-0.014, -T, 0.004], [-0.014, -T + 0.012, 0.004], [0.0, -T + 0.026, 0.012], [0.0, -0.042, 0.004],
    [-0.009, -0.036, 0.003], [-0.009, -0.03, 0.004], [0.004, -0.017, 0.013], [-0.006, -0.002, 0.008], [-0.05, -0.002]], 5);
  const RC = 0.07;
  mesh(merge([rrSweep(HW, HL, RC, prof, 10), rrCap(HW, HL, RC, -0.05, -0.002, true, 10), rrCap(HW, HL, RC, -0.06, -T, false, 10)]), woodTop, top);
  // the map cloth: laid on the wood, 2 mm thick, a hemmed edge
  const clothMat = clothMaterial();
  const cloth = new THREE.PlaneGeometry(MAP.HX * 2, MAP.HZ * 2, 1, 1).rotateX(-Math.PI / 2);
  const hem = rrSweep(MAP.HX, MAP.HZ, 0.012, [[0.0, -0.0025], [0.0006, -0.001], [0.0, 0.0]], 4);
  mesh(merge([cloth, hem]), clothMat, top);
  // aprons under the top: a moulded skirt between the legs
  const apronMat = cel({ color: '#3a2618', id: 1, gloss: 0.4, pattern: woodGLSL('#3b2819', '#20140c', '#523823', 'abs(vLocalN.x) > abs(vLocalN.z) ? q.z : q.x', 'q.y') + 'specTh = 0.97; emis += col * kilnLight(vWorld, N);' });
  const ap = fillet([[-0.045, -T], [-0.045, -0.27, 0.004], [-0.01, -0.27, 0.004], [0.0, -0.258, 0.006], [0.008, -0.248, 0.006], [0.0, -0.236, 0.004], [0.0, -0.14, 0.003], [0.006, -0.13, 0.004], [0.0, -0.12, 0.003], [0.0, -T]], 4);
  mesh(rrSweep(1.105, 3.035, 0.03, ap, 4), apronMat, top);
  // the legs: square blocks, a gadrooned cup-and-cover bulb, a square foot. Leg SHIM_LEG is short.
  const legMat = cel({
    color: '#3a2618', id: 1, gloss: 0.5,
    pattern: woodGLSL('#3c2819', '#1f130b', '#553a24', 'q.y', 'atan(q.x, q.z) * 0.06 + q.x * 0.5') + /* glsl */ `
      specTh = 0.965;
      emis += col * kilnLight(vWorld, N);
      // wear on the foot from a century of boots
      col = mix(col, ${lin('#5b4129')}, 0.3 * (1.0 - smoothstep(0.03, 0.09, vLocal.y)) * step(0.5, abs(vLocalN.x) + abs(vLocalN.z)));
    `,
  });
  const legLen = -T - 0.19 - FLOOR_Y;                 // floor -> bottom of the top block
  const lp = [[0, 0.075], [0.07, 0.075], [0.074, 0.088], [0.066, 0.1], [0.056, 0.108], [0.06, 0.12], [0.075, 0.13],
    [0.1, 0.15], [0.116, 0.185], [0.122, 0.225], [0.118, 0.255], [0.122, 0.262], [0.118, 0.27], [0.108, 0.3], [0.088, 0.33], [0.064, 0.345],
    [0.07, 0.352], [0.078, 0.365], [0.07, 0.378], [0.055, 0.388], [0.05, 0.41], [0.054, 0.44], [0.066, 0.46], [0.072, 0.475], [0.074, legLen], [0, legLen + 0.01]];
  const gadroon = (th, y) => { if (y < 0.13 || y > 0.258) return 1; const k = Math.sin(Math.PI * (y - 0.13) / 0.128); return 1 - 0.07 * k * (1 - Math.pow(Math.abs(Math.cos(th * 6)), 0.6)); };
  const turned = lathe(fillet(lp.map(([r, y]) => [r, y, 0.006]), 3), 72, gadroon);
  const legGeo = merge([turned, xf(rbox(0.17, 0.075, 0.17, 0.012), 0, 0.0375, 0), xf(rbox(0.165, 0.2, 0.165, 0.01), 0, legLen + 0.1, 0)]);
  const legs = TABLE.LEGS.map(([x, z], i) => {
    const g = group(top, x, FLOOR_Y + (i === TABLE.SHIM_LEG ? TABLE_GAP : 0), z);
    mesh(legGeo, legMat, g);
    return g;
  });
  return { top, legs };
}

// ---------------------------------------------------------------- the pendant lamp
function buildLamp() {
  const root = group(null, ...LAMP_PIVOT);            // on the chains' anchor line; the whole hanging rig swings about it
  const swing = group(root);
  const Lc = LAMP_CORD, AX = LAMP_RIG.anchorX;
  const iron = cel({ color: '#1b1a19', id: 7, gloss: 0.6, rim: 1.2, pattern: 'specTh = 0.96; col *= 0.9 + 0.2 * vnoise(vLocal.xy * 40.0);' });
  // ceiling anchors (fixed): cast-iron roses with eye bolts
  const anch = [];
  for (const sx of [-1, 1]) {
    anch.push(xf(lathe(fillet([[0, -0.07], [0.06, -0.07, 0.01], [0.15, -0.035, 0.02], [0.16, 0.0], [0, 0.0]], 4), 28), sx * AX, 0, 0));
    anch.push(xf(new THREE.TorusGeometry(0.034, 0.011, 8, 18), sx * AX, -0.11, 0));
  }
  mesh(merge(anch), iron, root, 0, 0, 0, true);
  // a cast-iron cap on the shade's collar; two lugs on its flanks take the chains
  const shadeTop = -Lc + 0.25, lugY = -Lc - 0.075;
  mesh(merge([
    xf(lathe(fillet([[0, 0], [0.06, 0, 0.01], [0.05, 0.04, 0.01], [0.022, 0.06], [0, 0.065]], 3), 20), 0, shadeTop, 0),
    ...[-1, 1].map((sx) => xf(new THREE.TorusGeometry(0.02, 0.0075, 8, 16), sx * (LAMP_RIG.lugX + 0.012), lugY + 0.012, 0)),
    ...[-1, 1].map((sx) => xf(rbox(0.026, 0.05, 0.018, 0.004), sx * (LAMP_RIG.lugX - 0.012), lugY - 0.012, 0, 0, 0, sx * -1.16)),
  ]), iron, swing, 0, 0, 0, true);
  // the chains: oval links from each fixed eye bolt to the lug on the swinging shade (instanced, rebuilt each frame)
  const linkGeo = new THREE.TorusGeometry(0.022, 0.0068, 6, 14).scale(1, 1.45, 1);
  const PL = 0.05;
  const eyes = [-1, 1].map((sx) => V3(sx * AX, -0.13, 0));
  const lugs0 = [-1, 1].map((sx) => V3(sx * (LAMP_RIG.lugX + 0.012), lugY + 0.03, 0));
  const nLinks = eyes.map((a, c) => Math.round(a.distanceTo(lugs0[c]) / PL));
  // the links catch a faint edge light so the chains read as thin lines rising out of the dark
  const linkMat = cel({ color: '#1b1a19', id: 7, gloss: 0.6, rim: 1.2, pattern: `specTh = 0.96; float fr = 1.0 - max(dot(N, normalize(cameraPosition - vWorld)), 0.0); emis += ${lin('#a08a6a')} * (0.05 + 0.3 * smoothstep(0.4, 0.95, fr));` });
  const chain = new THREE.InstancedMesh(linkGeo, linkMat, nLinks[0] + nLinks[1]);
  chain.userData.noShadow = true; chain.frustumCulled = false; root.add(chain);
  const _d = V3(), _p = V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = V3(1, 1, 1), _m = new THREE.Matrix4(), Y = V3(0, 1, 0);
  function updateChains(e) {               // e: the swing (Euler), lugs follow it, eye bolts stay put
    let k = 0;
    for (let c = 0; c < 2; c++) {
      const a = eyes[c], n = nLinks[c];
      _d.copy(lugs0[c]).applyEuler(e).sub(a); const L = _d.length(); _d.divideScalar(L);
      _q.setFromUnitVectors(Y, _d);
      _s.set(1, Math.min(1.25, Math.max(0.8, L / (n * PL))), 1);
      for (let i = 0; i < n; i++) {
        _p.copy(a).addScaledVector(_d, (L * (i + 0.5)) / n);
        _q2.setFromAxisAngle(Y, (i % 2) * Math.PI / 2 + 0.3 * c).premultiply(_q);
        chain.setMatrixAt(k++, _m.compose(_p, _q2, _s));
      }
    }
    chain.instanceMatrix.needsUpdate = true;
  }
  // the shade: a deep enamel cone. Rim 0.30 m at 0.13 below the bulb (the light it lets out ends at ~66 deg)
  const lampAssy = group(swing, 0, -Lc, 0);
  const rimY = -0.132, rimR = 0.296;
  const outer = fillet([[rimR - 0.012, rimY + 0.003], [rimR + 0.006, rimY - 0.004, 0.006], [rimR + 0.01, rimY + 0.004, 0.006], [rimR - 0.004, rimY + 0.014, 0.01],
    [0.095, 0.16, 0.05], [0.072, 0.19, 0.02], [0.055, 0.205, 0.01], [0.055, 0.25], [0.0, 0.25]], 5);
  const LU = { uOn: { value: 1 }, uGlow: { value: 1 }, uBulbW: { value: V3(...LAMP.pos) }, uBulbAx: { value: V3(0, 1, 0) } };
  const shadeMat = cel({
    color: '#262b26', id: 7, gloss: 0.85, rim: 1.6, side: THREE.DoubleSide, uniforms: LU,
    pattern: /* glsl */ `
      specTh = 0.93; specK = 1.6;
      col = ${lin('#283028')};
      // chipped enamel showing iron near the rim
      float chip = step(0.8, vnoise(vec2(atan(vLocal.x, vLocal.z) * 9.0, vLocal.y * 40.0))) * (1.0 - smoothstep(-0.11, -0.06, vLocal.y));
      col = mix(col, ${lin('#4a4038')}, chip * 0.8);
      // glossy enamel mirrors the bright table below: the rolled rim and the lower flank catch it
      vec3 Vv = normalize(cameraPosition - vWorld);
      vec3 R = reflect(-Vv, N);
      float tbl = smoothstep(-0.2, -0.75, R.y) * (gl_FrontFacing ? 1.0 : 0.0);
      emis += ${lin('#e8d2a8')} * uLampCol * 0.5 * tbl * mix(1.0, 0.35, smoothstep(-0.06, 0.12, vLocal.y)) * uOn;
      // and a faint vertical sheen on the flank turned toward the camera
      vec2 nh = normalize(N.xz + 1e-5), vh = normalize(Vv.xz + 1e-5);
      float sd = dot(nh, vec2(vh.x * 0.8 - vh.y * 0.6, vh.x * 0.6 + vh.y * 0.8));
      emis += ${lin('#cbb994')} * 0.11 * smoothstep(0.9, 0.985, sd) * smoothstep(-0.3, 0.2, N.y) * (gl_FrontFacing ? 1.0 : 0.0);
      emis += col * tableBounce(vWorld, N) * 2.0;
    `,
  });
  mesh(lathe(outer, 72), shadeMat, lampAssy);
  // the inner reflector: white enamel, glowing with the bulb
  const innerProf = [[0.064, 0.19], [0.09, 0.155], [rimR - 0.016, rimY + 0.012]].reverse();
  const inner = lathe(innerProf, 72);
  { const n = inner.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); const ix = inner.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } }
  const innerMat = cel({
    color: '#1a1814', id: 141, gloss: 0, rim: 0, side: THREE.DoubleSide, uniforms: LU,
    pattern: /* glsl */ `
      float h = clamp((vLocal.y + 0.13) / 0.32, 0.0, 1.0);
      float o = smoothstep(0.0, 1.0, uOn);
      emis = ${lin('#fff1d2')} * uGlow * o * o * mix(0.22, 1.25, h * h) * (0.94 + 0.06 * vnoise(vLocal.xz * 60.0));
      emis += ${lin('#ff6a1e')} * uGlow * 0.12 * smoothstep(0.02, 0.25, uOn) * (1.0 - o) * h;
      col = ${lin('#d8d0c0')} * 0.08; lampMul = 0.0;
    `,
  });
  mesh(inner, innerMat, lampAssy, 0, 0, 0, true);
  // the bulb: dark glass when off; switching on, the filament (a short coil, seen through the glass) glows first,
  // deep orange, then the whole bulb whitens
  const bulbMat = cel({
    color: '#2a2622', id: 142, gloss: 0.9, rim: 0, uniforms: LU,
    fsHead: /* glsl */ `
      float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out float h){
        vec3 ba = b - a, w0 = a - ro;
        float A = dot(ba, ba), B = dot(ba, rd), D = dot(ba, w0), E = dot(rd, w0);
        float s = clamp((B * E - D) / max(A - B * B, 1e-9), 0.0, 1.0);
        vec3 p = a + ba * s; float t = dot(p - ro, rd);
        h = s; return length(p - (ro + rd * t));
      }
    `,
    pattern: /* glsl */ `
      float on = uOn;
      vec3 rd = normalize(vWorld - cameraPosition);
      float hs;
      float d = raySeg(cameraPosition, rd, uBulbW - uBulbAx * 0.016, uBulbW + uBulbAx * 0.021, hs);
      float coil = 0.5 + 0.5 * sin(hs * 72.0);
      float fil = 1.0 - smoothstep(0.0008 + 0.0009 * coil, 0.002 + 0.0012 * coil, d);
      float stem = 1.0 - smoothstep(0.0005, 0.0012, raySeg(cameraPosition, rd, uBulbW + uBulbAx * 0.021, uBulbW + uBulbAx * 0.055, hs));
      vec3 filC = mix(${lin('#6a1402')}, ${lin('#ffc27a')}, smoothstep(0.08, 0.6, on)) * fil * smoothstep(0.0, 0.1, on) * mix(2.2, 5.0, on);
      vec3 glass = ${lin('#fff3da')} * 3.2 * smoothstep(0.3, 1.0, on) + ${lin('#ff6a1e')} * 0.5 * smoothstep(0.03, 0.3, on) * (1.0 - smoothstep(0.5, 0.95, on));
      emis = (glass + filC) * uGlow + ${lin('#3a3530')} * stem * 0.3 * (1.0 - on);
      col = ${lin('#2a2622')};
      specTh = 0.985; lampMul = 0.0;
    `,
  });
  mesh(lathe(fillet([[0, -0.072], [0.03, -0.068, 0.02], [0.05, -0.035, 0.03], [0.046, 0.0, 0.02], [0.024, 0.035, 0.01], [0.022, 0.06], [0, 0.06]], 5), 32), bulbMat, lampAssy, 0, 0, 0, true);
  mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.08, 16).translate(0, 0.1, 0), iron, lampAssy, 0, 0, 0, true);
  return { root, swing, LU, updateChains };
}

// ---------------------------------------------------------------- throne and dais
function buildThrone() {
  const root = group(null, ...THRONE.pos);
  const D = THRONE.daisH, step = D / 3;
  const stone = cel({
    color: '#3a3632', id: 4, gloss: 0.6,
    pattern: /* glsl */ `
      ${FADE}
      vec3 p = vWorld;
      col = ${lin('#4a4540')} * (0.85 + 0.3 * fbm2(p.xz * 2.0 + p.y));
      float vein = abs(fbm2(p.xz * 1.6 + vec2(p.y * 2.0, 0.0)) - 0.5);
      col = mix(col, ${lin('#6d665f')}, (1.0 - smoothstep(0.003, 0.012, vein)) * 0.22);
      specTh = 0.98;
      emis += col * (spotLight(vWorld, N) * 2.0 + boardSpill(vWorld, N) + tableBounce(vWorld, N));
    `,
  });
  // three steps, each a slab with a rounded nosing
  const stepProf = (h) => fillet([[-0.05, 0], [-0.01, 0, 0.003], [-0.01, h - 0.03, 0.004], [0.012, h - 0.024, 0.006], [0.012, h - 0.006, 0.006], [-0.004, h, 0.004], [-0.05, h]], 4);
  const steps = [[1.24, -0.88, 0.94], [1.03, -0.84, 0.72], [0.83, -0.8, 0.5]];
  const dg = [];
  steps.forEach(([hx, z0, z1], i) => {
    const hz = (z1 - z0) / 2, cz = (z0 + z1) / 2, y0 = i * step;
    dg.push(xf(rrSweep(hx, hz, 0.05, stepProf(step), 6), 0, y0, cz), xf(rrCap(hx, hz, 0.05, -0.004, step, true, 6), 0, y0, cz));
  });
  mesh(merge(dg), stone, root);
  // a worn carpet runner up the steps to the seat
  const carpet = cel({
    color: '#4a201b', id: 9, gloss: 0.0,
    pattern: /* glsl */ `
      ${FADE}
      float u = vLocal.x;
      col = ${lin('#4b221c')} * (0.85 + 0.25 * fbm2(vWorld.xz * 6.0));
      float b = abs(abs(u) - 0.26);
      col = mix(col, ${lin('#8a6a3a')}, lineAA(b, 0.008, mpp) * 0.7);
      col *= 1.0 - 0.25 * smoothstep(0.24, 0.3, abs(u));
      emis += col * spotLight(vWorld, N);
    `,
  });
  const cp = [];
  for (let i = 0; i < 3; i++) {
    const [, , z1] = steps[i], y0 = (i + 1) * step;
    const zNext = i < 2 ? steps[i + 1][2] : 0.25;
    cp.push(xf(new THREE.BoxGeometry(0.62, 0.008, z1 + 0.012 - zNext), 0, y0 + 0.004, (z1 + 0.012 + zNext) / 2));
    cp.push(xf(new THREE.BoxGeometry(0.62, step + 0.002, 0.008), 0, y0 - step / 2 + 0.003, z1 + 0.016));
  }
  mesh(merge(cp), carpet, root);

  // the throne: black lacquered wood, thin gilt lines
  const wood = cel({
    color: '#1d1713', id: 3, gloss: 0.8, rim: 1.3,
    pattern: /* glsl */ `
      ${FADE}
      col = ${lin('#2c241e')} * (0.86 + 0.24 * fbm2(vLocal.xy * vec2(3.0, 0.8) + vLocal.z * 5.0));
      specTh = 0.955; specK = 1.3;
      emis += col * (boardSpill(vWorld, N) * 3.0 + tableBounce(vWorld, N) * 1.6);
      // the board lights the throne's upper edges from behind
      float up = smoothstep(0.2, 0.9, N.y - N.z * 0.6);
      emis += ${lin('#ff9a3a')} * uBoardLit * 0.2 * up * smoothstep(1.4, 2.6, vWorld.y);
    `,
  });
  const gilt = cel({
    color: '#b48c42', id: 5, gloss: 0.95, rim: 1.4,
    pattern: /* glsl */ `
      col = ${lin('#b38a40')} * (0.8 + 0.35 * fbm2(vLocal.xy * 30.0 + vLocal.z * 20.0));
      specTh = 0.93; specK = 1.4;
      float up = smoothstep(0.1, 0.9, N.y - N.z * 0.5);
      emis += ${lin('#ff9a3a')} * uBoardLit * 0.3 * up * smoothstep(1.4, 2.6, vWorld.y);
      emis += col * (spotLight(vWorld, N) + tableBounce(vWorld, N) * 1.4);
    `,
  });
  const leather = cel({ color: '#3a1f19', id: 9, gloss: 0.5, pattern: 'col *= 0.85 + 0.3 * fbm2(vLocal.xz * 12.0); specTh = 0.95; emis += col * tableBounce(vWorld, N);' });
  const yT = D;                                     // dais top
  const w = 0.62, zb = -0.37, zf = 0.42;            // seat half width, back face, front
  const parts = [], gparts = [];
  // plinth
  const plinth = fillet([[-0.05, 0], [0.02, 0, 0.004], [0.02, 0.03, 0.004], [0.034, 0.045, 0.012], [0.0, 0.075, 0.008], [-0.05, 0.075]], 4);
  parts.push(xf(rrSweep(0.86, 0.44, 0.03, plinth, 4), 0, yT, 0.02), xf(rrCap(0.86, 0.44, 0.03, -0.01, 0.075, true, 4), 0, yT, 0.02));
  // seat box with a recessed front panel
  const ys = yT + 0.075, yc = THRONE.seatY - FLOOR_Y - 0.07;
  parts.push(xf(rbox(w * 2, yc - ys, zf - zb, 0.012), 0, (ys + yc) / 2, (zf + zb) / 2));
  gparts.push(xf(rrSweep(w - 0.08, (yc - ys) / 2 - 0.06, 0.016, bead(0.014, 0.012), 3), 0, 0, 0, Math.PI / 2, 0, 0).translate(0, (ys + yc) / 2, zf));
  // the cushion
  mesh(xf(rbox(w * 2 - 0.08, 0.075, zf - zb - 0.05, 0.03, 3), 0, yc + 0.0375, (zf + zb) / 2 + 0.02), leather, root);
  // arms: heavy blocks, a gilt cap, an orb at the front
  const armTop = yc + 0.36;
  for (const sx of [-1, 1]) {
    parts.push(xf(rbox(0.22, armTop - ys, zf - zb + 0.02, 0.014), sx * (w + 0.11), (ys + armTop) / 2, (zf + zb) / 2));
    gparts.push(xf(rbox(0.25, 0.03, zf - zb + 0.06, 0.01), sx * (w + 0.11), armTop + 0.012, (zf + zb) / 2));
    gparts.push(xf(new THREE.SphereGeometry(0.07, 24, 16), sx * (w + 0.11), armTop + 0.095, zf - 0.04));
    gparts.push(xf(lathe(fillet([[0.0, 0], [0.06, 0, 0.01], [0.04, 0.03, 0.01], [0.03, 0.04], [0, 0.04]], 3), 24), sx * (w + 0.11), armTop + 0.02, zf - 0.04));
    // a recessed gilt panel on the arm's outer face
    gparts.push(xf(xf(rrSweep((zf - zb) / 2 - 0.07, (armTop - ys) / 2 - 0.07, 0.014, bead(0.012, 0.01), 3), 0, 0, 0, Math.PI / 2, 0, 0), sx * (w + 0.22), (ys + armTop) / 2, (zf + zb) / 2, 0, sx * Math.PI / 2, 0));
  }
  // the tall back: a slab with a steep gable, carved frame, gilt sun medallion
  const backTop = THRONE.backTop - FLOOR_Y, shoulder = backTop - 0.34;
  const shape = new THREE.Shape();
  shape.moveTo(-w, yc - 0.05); shape.lineTo(w, yc - 0.05); shape.lineTo(w, shoulder); shape.lineTo(0, backTop); shape.lineTo(-w, shoulder); shape.closePath();
  const back = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 4 });
  parts.push(xf(back, 0, 0, zb - 0.12 + 0.0));
  // gilt frame on the back's face (an inset outline)
  const fr = new THREE.Shape();
  const iw = w - 0.09, ib = yc + 0.12, is = shoulder - 0.06, it = backTop - 0.2;
  fr.moveTo(-iw, ib); fr.lineTo(iw, ib); fr.lineTo(iw, is); fr.lineTo(0, it); fr.lineTo(-iw, is); fr.closePath();
  const hole = new THREE.Path(); const hw2 = iw - 0.03;
  hole.moveTo(-hw2, ib + 0.03); hole.lineTo(-hw2, is - 0.012); hole.lineTo(0, it - 0.045); hole.lineTo(hw2, is - 0.012); hole.lineTo(hw2, ib + 0.03); hole.closePath();
  fr.holes.push(hole);
  gparts.push(xf(new THREE.ExtrudeGeometry(fr, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }), 0, 0, zb + 0.012));
  // sun medallion: a ring and sixteen rays, high on the back
  const sunY = shoulder - 0.32;
  const sun = new THREE.Shape(); const NR = 16;
  for (let i = 0; i < NR * 2; i++) { const a = (i / (NR * 2)) * TAU + Math.PI / 2, r = i % 2 ? 0.12 : (i % 4 ? 0.2 : 0.26); const px = Math.cos(a) * r, py = sunY + Math.sin(a) * r; if (i) sun.lineTo(px, py); else sun.moveTo(px, py); }
  sun.closePath();
  const sh = new THREE.Path(); sh.absarc(0, sunY, 0.085, 0, TAU, true); sun.holes.push(sh);
  gparts.push(xf(new THREE.ExtrudeGeometry(sun, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 24 }), 0, 0, zb + 0.012));
  // side posts with capitals and gilt spires
  const postTop = shoulder + 0.08;
  for (const sx of [-1, 1]) {
    parts.push(xf(rbox(0.17, postTop - ys, 0.2, 0.012), sx * (w + 0.07), (ys + postTop) / 2, zb - 0.06));
    parts.push(xf(rbox(0.21, 0.06, 0.24, 0.01), sx * (w + 0.07), postTop - 0.24, zb - 0.06));
    gparts.push(xf(rbox(0.2, 0.02, 0.23, 0.006), sx * (w + 0.07), postTop + 0.01, zb - 0.06));
    gparts.push(xf(lathe(fillet([[0, 0], [0.05, 0, 0.01], [0.045, 0.03, 0.01], [0.03, 0.04, 0.01], [0.058, 0.1, 0.03], [0.03, 0.16, 0.02], [0.012, 0.2], [0.004, 0.42], [0, 0.44]], 4), 24), sx * (w + 0.07), postTop + 0.02, zb - 0.06));
    // a gilt bead down the post's front, a gilt band at its foot
    gparts.push(xf(rbox(0.022, postTop - ys - 0.42, 0.012, 0.005), sx * (w + 0.07), (ys + postTop - 0.3) / 2 + 0.05, zb - 0.06 + 0.104));
    gparts.push(xf(rbox(0.19, 0.022, 0.222, 0.006), sx * (w + 0.07), ys + 0.12, zb - 0.06));
  }
  // a gilt rail across the back's face, and studs along the gable
  gparts.push(xf(rbox(2 * (w - 0.12), 0.026, 0.016, 0.006), 0, yc + 0.86, zb + 0.016));
  for (let i = 1; i <= 7; i++) for (const sx of [-1, 1]) {
    const u = i / 8, px = sx * w * (1 - u), py = shoulder + (backTop - shoulder) * u;
    gparts.push(xf(new THREE.SphereGeometry(0.013, 10, 8), px, py + 0.012, zb + 0.004));
  }
  // a gilt spike on the gable
  gparts.push(xf(lathe(fillet([[0, 0], [0.035, 0, 0.01], [0.03, 0.03, 0.01], [0.045, 0.07, 0.02], [0.012, 0.11], [0.003, 0.2], [0, 0.21]], 4), 20), 0, backTop - 0.02, zb - 0.06));
  mesh(merge(parts), wood, root);
  mesh(merge(gparts), gilt, root);
  return root;
}

// ---------------------------------------------------------------- the glass cases
const CASE = { hx: 0.2, y0: JOKER_Y - FLOOR_Y - 0.135, h: 0.52 };    // glass box half width, floor (local y), height
// a pane broken into shards around an impact point: polar cells (rays x rings) clipped to the pane rectangle.
// Every polygon vertex carries the tag of the edge that starts at it: [type, rnd] with type 0 radial crack,
// 1 ring crack, 2 pane border.
function shardPane(w, h, ix, iy, seed) {
  const rnd = (a, b = 0) => hashI(seed, a, b, 7);
  const NRay = 12, rays = [];
  for (let k = 0; k < NRay; k++) rays.push((k + 0.7 * (rnd(k) - 0.5)) / NRay * TAU);
  const maxR = Math.hypot(Math.max(Math.abs(ix + w / 2), Math.abs(ix - w / 2)), Math.max(Math.abs(iy + h / 2), Math.abs(iy - h / 2))) + 0.02;
  const rings = [0];
  let r0 = 0.022; while (r0 < maxR) { rings.push(r0); r0 *= 1.6 + 0.25 * rnd(rings.length, 3); }
  rings.push(maxR * 1.5);
  const P = (k, j) => { const a = rays[k % NRay] + (j > 1 ? 0.11 * (rnd(k % NRay, j + 60) - 0.5) : 0), rr = rings[j] * (j && j < rings.length - 1 ? 0.8 + 0.4 * rnd(k % NRay, j + 10) : 1); return [ix + Math.cos(a) * rr, iy + Math.sin(a) * rr]; };
  const clip = (poly) => {
    const edges = [[1, 0, w / 2], [-1, 0, w / 2], [0, 1, h / 2], [0, -1, h / 2]];   // keep n . p <= c
    let out = poly;
    for (const [nx, ny, c] of edges) {
      const inp = out; out = [];
      for (let i = 0; i < inp.length; i++) {
        const A = inp[i], B = inp[(i + 1) % inp.length];
        const da = nx * A[0] + ny * A[1] - c, db = nx * B[0] + ny * B[1] - c;
        if (da <= 0) out.push(A);
        if ((da < 0) !== (db < 0) && Math.abs(da - db) > 1e-12) {
          const t = da / (da - db);
          // leaving the pane: the edge from here runs along the border; entering: it continues A's edge
          out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, da <= 0 ? [2, 0] : A[2]]);
        }
      }
      if (out.length < 3) return null;
    }
    return out;
  };
  const shards = [];
  for (let k = 0; k < NRay; k++) for (let j = 0; j < rings.length - 1; j++) {
    const tR = (kk) => [0, rnd(kk % NRay, 200)], tG = (jj) => [1, rnd(k, 300 + jj)];
    const poly = j === 0
      ? [[ix, iy, tR(k)], [...P(k, 1), tG(1)], [...P(k + 1, 1), tR(k + 1)]]
      : [[...P(k, j), tR(k)], [...P(k, j + 1), tG(j + 1)], [...P(k + 1, j + 1), tR(k + 1)], [...P(k + 1, j), tG(j)]];
    const c = clip(poly);
    if (c) shards.push({ poly: c, ring: j, rnd: rnd(k, j + 40) });
  }
  return shards;
}
// one case's glass: every pane's shards in one mesh with per-vertex shard data (the vertex shader drops them)
function buildCaseGlass(side) {
  const { hx, y0, h } = CASE, yc = y0 + h / 2;
  const sgn = side === 'CN' ? -1 : 1;
  // panes: [centre, u axis, v axis, normal, w, h, impact uv, delay]
  const panes = [
    [V3(0, yc, hx), V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1), 2 * hx, h, [0.03 * sgn, 0.05], 0.0],
    [V3(0, yc, -hx), V3(-1, 0, 0), V3(0, 1, 0), V3(0, 0, -1), 2 * hx, h, [0.0, 0.03], 0.6],
    [V3(-hx, yc, 0), V3(0, 0, 1), V3(0, 1, 0), V3(-1, 0, 0), 2 * hx, h, [hx, 0.06], 0.28],
    [V3(hx, yc, 0), V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0), 2 * hx, h, [-hx, 0.06], 0.28],
    [V3(0, y0 + h, 0), V3(1, 0, 0), V3(0, 0, -1), V3(0, 1, 0), 2 * hx, 2 * hx, [0.0, -hx], 0.38],
  ];
  const pos = [], bary = [], pane = [], shardC = [], shardV = [], info = [], nrm = [], edge = [];
  panes.forEach(([c0, U, Vv, Nn, pw, ph, imp, delay], pi) => {
    const shards = shardPane(pw, ph, imp[0], imp[1], 101 + pi * 7 + (side === 'CN' ? 0 : 50));
    const maxR = Math.hypot(pw, ph);
    for (const s of shards) {
      const n = s.poly.length;
      let cu = 0, cv = 0; for (const [u, v] of s.poly) { cu += u; cv += v; } cu /= n; cv /= n;
      const W = (u, v) => c0.clone().addScaledVector(U, u).addScaledVector(Vv, v);
      const cw = W(cu, cv);
      // initial velocity: out of the case, a little up, random
      const r1 = hashI(pi, n, Math.round(cu * 1e4), Math.round(cv * 1e4));
      const vel = Nn.clone().multiplyScalar(0.25 + 0.6 * r1).add(V3((hashI(pi, 3, Math.round(cu * 1e4)) - 0.5) * 0.4, 0.25 * r1, (hashI(pi, 5, Math.round(cv * 1e4)) - 0.5) * 0.4));
      // code of the polygon edge from vertex a to a+1: -1 = border (hidden), else type + 0.9 * rnd
      const code = (a) => { const tg = s.poly[a][2]; return tg[0] === 2 ? -1 : tg[0] + 0.9 * tg[1]; };
      for (let i = 1; i < n - 1; i++) {
        const tri = [0, i, i + 1];
        // the edge opposite each triangle corner: a polygon edge (crack or border) or a fan diagonal (hidden)
        const opp = [[i, i + 1], [0, i + 1], [0, i]].map(([a, b]) => {
          if (b === a + 1) return code(a);
          if (a === 0 && b === n - 1) return code(n - 1);
          return -1;
        });
        tri.forEach((vi, m) => {
          const [u, v] = s.poly[vi], p = W(u, v);
          pos.push(p.x, p.y, p.z); nrm.push(Nn.x, Nn.y, Nn.z);
          bary.push(m === 0 ? 1 : 0, m === 1 ? 1 : 0, m === 2 ? 1 : 0);
          pane.push(u, v, imp[0], imp[1]);
          shardC.push(cw.x, cw.y, cw.z, s.rnd);
          shardV.push(vel.x, vel.y, vel.z, delay);
          info.push(opp[0] < 0 ? 9 : 0, opp[1] < 0 ? 9 : 0, opp[2] < 0 ? 9 : 0, maxR);
          edge.push(Math.max(0, opp[0]), Math.max(0, opp[1]), Math.max(0, opp[2]));
        });
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
  g.setAttribute('aPane', new THREE.Float32BufferAttribute(pane, 4));
  g.setAttribute('aShardC', new THREE.Float32BufferAttribute(shardC, 4));
  g.setAttribute('aShardV', new THREE.Float32BufferAttribute(shardV, 4));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 3));
  const U = { uCrack: { value: 0 }, uShatter: { value: 0 }, uPedY: { value: y0 - 0.03 } };
  const mat = cel({
    color: '#000000', id: 148, gloss: 0, rim: 0, side: THREE.DoubleSide, uniforms: U,
    vsHead: /* glsl */ `
      attribute vec3 aBary, aEdge; attribute vec4 aPane, aShardC, aShardV, aInfo;
      varying vec3 vBary, vEdge; varying vec4 vPane, vInfo; varying float vLoose, vDelay;
      vec3 rotA(vec3 v, vec3 ax, float a){ float c = cos(a), s = sin(a); return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c); }
    `,
    vertex: /* glsl */ `
      vBary = aBary + aInfo.xyz; vEdge = aEdge; vPane = aPane; vInfo = aInfo; vDelay = aShardV.w;
      float delay = aShardV.w * 0.35 + aShardC.w * 0.25;
      float s = clamp((uShatter - delay) / max(1.0 - delay, 0.05), 0.0, 1.0);
      vLoose = step(0.0001, s);
      if(s > 0.0){
        float T = s * 1.1;
        vec3 c = aShardC.xyz, v0 = aShardV.xyz;
        // landing: on the pedestal top if over it, else on the floor
        float yl = (abs(c.x + v0.x * 0.25) < 0.23 && abs(c.z + v0.z * 0.25) < 0.23) ? uPedY + 0.004 : 0.004;
        float a = 4.9, b = v0.y, h = c.y - yl;
        float tl = (b + sqrt(b * b + 4.0 * a * max(h, 0.0))) / (2.0 * a);
        float Tc = min(T, tl);
        vec3 cp = c + v0 * Tc + vec3(0.0, -a * Tc * Tc, 0.0);
        vec3 ax = normalize(vec3(aShardC.w - 0.5, 0.6, fract(aShardC.w * 7.3) - 0.5));
        vec3 rel = rotA(pos - c, ax, Tc * (6.0 + 10.0 * aShardC.w));
        pos = cp + rel;
        nrm = rotA(nrm, ax, Tc * (6.0 + 10.0 * aShardC.w));
        if(T >= tl){ pos.y = yl + 0.002 + rel.y * 0.04; nrm = vec3(0.0, 1.0, 0.0); }
      }
    `,
    fsHead: 'varying vec3 vBary, vEdge; varying vec4 vPane, vInfo; varying float vLoose, vDelay;',
    pattern: /* glsl */ `
      ${FADE}
      vec2 pu = vPane.xy, imp = vPane.zw;
      float dImp = length(pu - imp);
      float face = gl_FrontFacing ? 1.0 : 0.3;          // seen through the case: dimmer
      float farK = clamp(0.0016 / mpp, 0.3, 1.0);        // hairline cracks thin out with distance
      // the nearest drawn edge of this shard and its kind (radial crack or ring crack)
      vec3 eb = vBary / max(fwidth(vBary), vec3(1e-6));
      float eMin, code;
      if(eb.x < eb.y && eb.x < eb.z){ eMin = eb.x; code = vEdge.x; } else if(eb.y < eb.z){ eMin = eb.y; code = vEdge.y; } else { eMin = eb.z; code = vEdge.z; }
      float typ = floor(code), rnd = fract(code) / 0.9;
      float R = vInfo.w;
      // the crack front grows from the impact; each pane starts a little later
      float cr = clamp((uCrack - vDelay * 0.6) / (1.0 - vDelay * 0.6) * 1.15, 0.0, 1.0) * R;
      float wpx = typ < 0.5 ? mix(1.7, 0.75, clamp(dImp / (R * 0.7), 0.0, 1.0)) : 0.8;
      float line = 1.0 - smoothstep(wpx * 0.5, wpx * 0.5 + 0.9, eMin);
      float len = typ < 0.5 ? cr * (0.45 + 0.7 * rnd) : cr * 0.7 * step(rnd, 0.38);
      float vis = smoothstep(len, len - 0.015, dImp);
      float bright = typ < 0.5 ? mix(1.0, 0.45, clamp(dImp / (R * 0.75), 0.0, 1.0)) : 0.5;
      float crack = line * max(vis * bright, vLoose * 0.8) * farK;
      // a crush of fine fractures right at the impact
      float star = (1.0 - smoothstep(0.004, 0.016, dImp)) * step(0.02, uCrack) * step(0.55, vnoise(vec2(atan(pu.y - imp.y, pu.x - imp.x) * 7.0, dImp * 260.0)));
      // standing reflections: two short parallel glints high on each pane
      float d1 = pu.x * 0.8 + pu.y;
      float along = -0.62 * pu.x + 0.78 * pu.y;
      float span = smoothstep(0.02, 0.06, along) * smoothstep(0.22, 0.14, along);
      float streak = ((1.0 - smoothstep(0.004, 0.0065, abs(d1 - 0.1))) * 0.26 + (1.0 - smoothstep(0.0012, 0.0024, abs(d1 - 0.122))) * 0.2) * span;
      float g = max(max(crack, star * 0.9) * face, streak * step(0.5, face));
      if(g < 0.035) discard;
      col = vec3(0.0);
      emis = ${lin('#f4f1ea')} * g;
      idOut = 148.0;
    `,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noShadow = true;
  m.frustumCulled = false;
  return { mesh: m, U };
}
function buildCase(side) {
  const p = CASES[side], sgn = side === 'CN' ? -1 : 1;
  const root = group(null, ...p);
  const { hx, y0, h } = CASE;
  const stone = cel({
    color: '#3a3632', id: 4, gloss: 0.55,
    pattern: /* glsl */ `
      ${FADE}
      vec3 p = vWorld;
      col = ${lin('#4a4540')} * (0.85 + 0.3 * fbm2(p.xy * vec2(3.0, 1.2) + p.z * 2.0));
      float vein = abs(fbm2(p.xy * vec2(2.5, 1.2) + p.z * 3.0) - 0.5);
      col = mix(col, ${lin('#6d665f')}, (1.0 - smoothstep(0.003, 0.01, vein)) * 0.2);
      specTh = 0.98;
      emis += col * (spotLight(vWorld, N) * 2.4 + tableBounce(vWorld, N));
    `,
  });
  const brass = cel({
    color: '#9c7b3e', id: 5, gloss: 0.95, rim: 1.4,
    pattern: /* glsl */ `
      col = ${lin('#a07f42')} * (0.8 + 0.3 * fbm2(vLocal.xy * 40.0 + vLocal.z * 30.0));
      specTh = 0.93; specK = 1.5;
      emis += col * (spotLight(vWorld, N) * 2.5 + tableBounce(vWorld, N) * 1.2);
    `,
  });
  // pedestal: moulded base, a panelled shaft, a moulded cap
  const pb = fillet([[-0.06, 0], [0.0, 0, 0.004], [0.0, 0.09, 0.004], [0.018, 0.1, 0.008], [0.0, 0.125, 0.012], [-0.04, 0.135, 0.004], [-0.06, 0.135]], 4);
  const pc = fillet([[-0.06, 0], [-0.04, 0, 0.004], [-0.04, 0.012, 0.003], [-0.005, 0.03, 0.014], [0.012, 0.075, 0.016], [0.012, 0.1, 0.004], [-0.06, 0.1]], 4);
  const capY = y0 - 0.03 - 0.1;
  const ped = [
    rrSweep(0.23, 0.23, 0.02, pb, 4), rrCap(0.23, 0.23, 0.02, -0.06, 0.135, true, 4),
    xf(rbox(0.36, capY - 0.13, 0.36, 0.01), 0, (capY + 0.13) / 2, 0),
    xf(rrSweep(0.21, 0.21, 0.02, pc, 4), 0, capY, 0), xf(rrCap(0.21, 0.21, 0.02, 0.012, 0.1, true, 4), 0, capY, 0),
  ];
  // moulded panels on the shaft faces
  for (let k = 0; k < 4; k++) ped.push(xf(rrSweep(0.12, (capY - 0.13) / 2 - 0.08, 0.016, bead(0.014, 0.01), 3), 0, 0, 0, Math.PI / 2, 0, 0).translate(0, (capY + 0.13) / 2, 0.18).rotateY((k * Math.PI) / 2));
  mesh(merge(ped), stone, root);
  // vitrine: a brass-bound plinth, posts, rails, top rim
  const fr = [];
  fr.push(xf(rrSweep(hx + 0.012, hx + 0.012, 0.006, fillet([[-0.03, 0], [0, 0, 0.003], [0, 0.022, 0.004], [-0.006, 0.03, 0.003], [-0.03, 0.03]], 3), 3), 0, y0 - 0.03, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fr.push(xf(rbox(0.02, h, 0.02, 0.003), sx * hx, y0 + h / 2, sz * hx));
  for (const yy of [y0 + 0.012, y0 + h - 0.01]) for (const [sx, sz, rx] of [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]]) {
    const th = yy < y0 + 0.1 ? 0.026 : 0.02;
    fr.push(rx ? xf(rbox(0.016, th, 2 * hx, 0.003), sx * hx, yy, 0) : xf(rbox(2 * hx, th, 0.016, 0.003), 0, yy, sz * hx));
  }
  fr.push(xf(rrSweep(hx + 0.01, hx + 0.01, 0.006, fillet([[-0.016, 0], [0.004, 0, 0.003], [0.004, 0.008, 0.003], [-0.004, 0.016, 0.004], [-0.016, 0.016]], 3), 3), 0, y0 + h - 0.004, 0));
  // the door: an inner frame on the front pane, two hinges on the outer side, a hasp on the inner side
  fr.push(xf(rrSweep(hx - 0.008, h / 2 - 0.012, 0.012, bead(0.01, 0.006), 2), 0, 0, 0, Math.PI / 2, 0, 0).translate(0, y0 + h / 2, hx + 0.002));
  for (const yy of [y0 + 0.1, y0 + h - 0.1]) fr.push(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), -sgn * (hx - 0.004), yy, hx + 0.012));
  const lockY = y0 + h * 0.48;
  fr.push(xf(rbox(0.05, 0.03, 0.006, 0.003), sgn * (hx - 0.01), lockY, hx + 0.012));
  fr.push(xf(new THREE.TorusGeometry(0.008, 0.003, 8, 16), sgn * (hx + 0.004), lockY, hx + 0.02, 0, Math.PI / 2, 0));
  mesh(merge(fr), brass, root);
  // the velvet floor and a brass card rest
  const velvet = cel({ color: '#1c1416', id: 9, gloss: 0.0, pattern: 'col *= 0.8 + 0.3 * fbm2(vLocal.xz * 40.0); emis += col * spotLight(vWorld, N) * 3.0;' });
  mesh(xf(rbox(2 * hx - 0.02, 0.016, 2 * hx - 0.02, 0.006), 0, y0 + 0.008, 0), velvet, root);
  mesh(xf(rbox(0.13, 0.014, 0.03, 0.004), 0, y0 + 0.016 + 0.007, 0.0), brass, root);
  // the padlock: an iron body hanging from the hasp staple, a heavy shackle
  const iron = cel({ color: '#26231f', id: 9, gloss: 0.7, rim: 1.2, pattern: 'specTh = 0.95; col *= 0.85 + 0.3 * vnoise(vLocal.xy * 90.0); emis += col * spotLight(vWorld, N) * 2.0;' });
  const lock = group(root, sgn * (hx + 0.004), lockY - 0.055, hx + 0.03);
  mesh(rbox(0.06, 0.07, 0.03, 0.01, 3), iron, lock);
  mesh(new THREE.TorusGeometry(0.019, 0.0055, 10, 24, Math.PI).translate(0, 0.035, 0), iron, lock);
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10).rotateX(Math.PI / 2).translate(0, -0.012, 0.016), brass, lock);
  // the seal: two cords across the door gap under a disc of wax (CN square, US round)
  const wax = cel({ color: '#5e1a16', id: 9, gloss: 0.6, pattern: /* glsl */ `
    specTh = 0.95;
    vec2 q = vLocal.xy;
    float rr = length(q);
    col = ${lin('#5f1b16')} * (0.85 + 0.3 * vnoise(q * 300.0));
    emis += col * spotLight(vWorld, N) * 2.0;
  ` });
  const sealY = y0 + h * 0.72;
  const cordM = cel({ color: '#6a5a40', id: 9, gloss: 0.1 });
  const cords = [];
  for (const k of [-1, 1]) {
    const a = V3(sgn * (hx - 0.06), sealY + k * 0.05, hx + 0.012), b = V3(sgn * (hx + 0.012), sealY - k * 0.05, hx + 0.012);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const cg = new THREE.CylinderGeometry(0.0018, 0.0018, len, 6).rotateZ(Math.atan2(b.x - a.x, -(b.y - a.y)));
    cords.push(cg.translate(mid.x, mid.y, mid.z));
  }
  mesh(merge(cords), cordM, root, 0, 0, 0, true);
  const sealGeo = side === 'CN'
    ? merge([rbox(0.04, 0.04, 0.008, 0.006, 3), xf(rbox(0.026, 0.026, 0.006, 0.003, 2), 0, 0, 0.004)])
    : merge([new THREE.CylinderGeometry(0.022, 0.024, 0.008, 28).rotateX(Math.PI / 2), new THREE.CylinderGeometry(0.015, 0.015, 0.006, 24).rotateX(Math.PI / 2).translate(0, 0, 0.004)]);
  mesh(sealGeo, wax, root, sgn * (hx - 0.022), sealY, hx + 0.018);
  // the glass
  const glass = buildCaseGlass(side);
  root.add(glass.mesh);
  // the joker anchor: card centre at JOKER_Y, its plane local xy, +z toward the table's foot
  const anchor = new THREE.Object3D(); anchor.position.set(0, JOKER_Y - FLOOR_Y, 0); root.add(anchor);
  return { root, anchor, glass };
}

// ---------------------------------------------------------------- the split-flap scoreboard
// 12 rows x 20 cells. Rows 0..10 are one unit tall; the bottom row (BOARD_BIG_ROW) is two units tall, so the
// multiplier and the film's last line ("人类：要不起 HUMANS: PASS") read from the M1 wide.
export const BOARD_COLS = 20;
export const BOARD_BIG_ROW = BOARD.ROWS - 1;
const BF = { side: 0.13, top: 0.2, bottom: 0.13 };
const BIN = { x0: -BOARD.W / 2 + BF.side, x1: BOARD.W / 2 - BF.side, y0: -BOARD.H / 2 + BF.bottom, y1: BOARD.H / 2 - BF.top };
const PITCH = { x: (BIN.x1 - BIN.x0) / BOARD_COLS, y: (BIN.y1 - BIN.y0) / (BOARD.ROWS + 1) };   // y = one row unit
const rowTop = (r) => r * PITCH.y;                                                         // below BIN.y1
const rowH = (r) => (r === BOARD_BIG_ROW ? 2 : 1) * PITCH.y;
const FLAP = { w: PITCH.x - 0.016, h: PITCH.y - 0.016 };
const FLAP_BIG = { w: FLAP.w, h: 2 * PITCH.y - 0.016 };
const cellLocal = (r, c) => [BIN.x0 + (c + 0.5) * PITCH.x, BIN.y1 - rowTop(r) - rowH(r) / 2];

const ATLAS = {};
const CJK = /[⺀-鿿＀-￯]/;
function drawAlien(g, i, x, y, w, h) {
  // invented machine glyphs: strokes between nodes of a 3x4 lattice, a ring or a dot
  const nx = (k) => x + w * (0.3 + 0.2 * (k % 3)), ny = (k) => y + h * (0.2 + 0.2 * Math.floor(k / 3));
  g.lineWidth = Math.min(w, h) * 0.1; g.lineCap = 'square'; g.lineJoin = 'miter';
  g.beginPath();
  const n = 3 + Math.floor(hashI(i, 1) * 3);
  let a = Math.floor(hashI(i, 2) * 12);
  g.moveTo(nx(a), ny(a));
  for (let s = 0; s < n; s++) {
    let b = Math.floor(hashI(i, 10 + s) * 12);
    if (b === a) b = (b + 4) % 12;
    if (hashI(i, 30 + s) < 0.3) g.moveTo(nx(b), ny(b)); else g.lineTo(nx(b), ny(b));
    a = b;
  }
  g.stroke();
  const r = hashI(i, 50), m = Math.min(w, h);
  if (r < 0.4) { g.beginPath(); g.arc(nx(4), ny(4), m * 0.13, 0, TAU); g.stroke(); }
  else if (r < 0.75) { g.beginPath(); g.arc(nx(Math.floor(hashI(i, 51) * 12)), ny(Math.floor(hashI(i, 52) * 12)), m * 0.07, 0, TAU); g.fill(); }
}
function glyphList() {
  const list = [...BOARD_CHARS].map((ch) => ({ key: ch, kind: 'char', ch }));
  for (const id of BOARD_LOGOS) list.push({ key: `{${id}}`, kind: 'logo', id });
  for (let i = 0; i < BOARD_GLYPHS; i++) list.push({ key: `{g${i}}`, kind: 'glyph', i });
  return list;
}
// kind 'n': the normal cells; 't': the tall cells of the bottom row (same glyph indices)
function boardAtlas(kind = 'n') {
  if (ATLAS[kind]) return ATLAS[kind];
  const tall = kind === 't';
  const SW = tall ? 176 : 256, SH = Math.round(SW * (tall ? FLAP_BIG.h / FLAP_BIG.w : FLAP.h / FLAP.w)), COLS = 16;
  const list = glyphList();
  const ROWS = Math.ceil(list.length / COLS);
  const cv = canvas(SW * COLS, SH * ROWS), g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const LAT = '"Arial Black", "Helvetica Neue", Arial, sans-serif', HAN = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Heiti SC", sans-serif';
  list.forEach((e, i) => {
    const x0 = (i % COLS) * SW, y0 = Math.floor(i / COLS) * SH;
    g.save();
    g.beginPath(); g.rect(x0 + 2, y0 + 2, SW - 4, SH - 4); g.clip();
    if (e.kind === 'char') {
      g.fillStyle = '#fff'; g.textAlign = 'center';
      const cjk = CJK.test(e.ch);
      const px = cjk ? (tall ? SW * 0.92 : SH * 0.8) : SH * (tall ? 0.74 : 0.94);
      g.font = `${cjk ? 700 : 900} ${px}px ${cjk ? HAN : LAT}`;
      const m = g.measureText(e.ch);
      const sx = Math.min(1, (SW * (tall ? 0.86 : 0.78)) / Math.max(1, m.width)) * (cjk ? 1 : 0.88);
      const asc = m.actualBoundingBoxAscent ?? px * 0.7, desc = m.actualBoundingBoxDescent ?? 0;
      g.translate(x0 + SW / 2, y0 + SH / 2); g.scale(sx, 1);
      g.textBaseline = 'alphabetic';
      g.strokeStyle = '#fff'; g.lineWidth = px * (cjk ? 0.04 : 0.022); g.lineJoin = 'round';
      g.strokeText(e.ch, 0, (asc - desc) / 2);
      g.fillText(e.ch, 0, (asc - desc) / 2);
    } else if (e.kind === 'logo') {
      // printed logo flap: cream card, the mark in brand colour
      g.fillStyle = '#e9e1cf';
      const mg = Math.round(SW * 0.04);
      g.beginPath(); if (g.roundRect) g.roundRect(x0 + mg, y0 + mg, SW - 2 * mg, SH - 2 * mg, SW * 0.055); else g.rect(x0 + mg, y0 + mg, SW - 2 * mg, SH - 2 * mg); g.fill();
      const size = Math.min(SW, SH) * 0.74;
      if (Object.prototype.hasOwnProperty.call(BRAND, e.id) || e.id === 'joker') drawLogo(g, e.id, x0 + SW / 2, y0 + SH / 2, size);
      else {
        g.fillStyle = '#6a6460'; g.beginPath(); g.arc(x0 + SW / 2, y0 + SH / 2, size * 0.44, 0, TAU); g.fill();
        g.fillStyle = '#e9e1cf'; g.font = `900 ${size * 0.55}px ${LAT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(e.id[0].toUpperCase(), x0 + SW / 2, y0 + SH / 2 + size * 0.03);
      }
    } else {
      g.strokeStyle = '#fff'; g.fillStyle = '#fff';
      if (tall) drawAlien(g, e.i, x0 + SW * 0.12, y0 + SH * 0.2, SW * 0.76, SH * 0.6);
      else drawAlien(g, e.i, x0 + SW * 0.15, y0 + SH * 0.05, SW * 0.7, SH * 0.9);
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const index = new Map(list.map((e, i) => [e.key, i]));
  ATLAS[kind] = { tex, index, COLS, ROWS, n: list.length, nChar: [...BOARD_CHARS].length, nLogo: BOARD_LOGOS.length, blank: index.get(' ') };
  return ATLAS[kind];
}
// the glyph index without drawing (works in Node for the sound tools)
function boardAtlasIndexOnly() {
  if (ATLAS.n) return ATLAS.n;
  const keys = glyphList().map((e) => e.key);
  const index = new Map(keys.map((k, i) => [k, i]));
  return { index, nChar: [...BOARD_CHARS].length, nLogo: BOARD_LOGOS.length, blank: index.get(' ') };
}

// ---- the flip model (pure). Every cell is a little mechanism that drops one flap at a time (FLIP_T each).
// A row's history entry asks each cell for a new glyph; the cell's flaps queue: the next flap starts when the previous
// one has landed. Between two entries that come close together the cell keeps rattling through intermediate glyphs,
// so a fast run of entries animates as one continuous rattle instead of snapping.
const FLIP_T = 0.072;
function rowGlyphs(text, A) {
  const cs = cells(text ?? ''), out = new Array(BOARD_COLS).fill(A.blank);
  for (let i = 0; i < Math.min(BOARD_COLS, cs.length); i++) out[i] = A.index.get(cs[i]) ?? A.blank;
  return out;
}
const flipDelay = (r, c, j) => c * 0.011 + hashI(r, c, j, 5) * 0.05;
function pickGlyph(r, c, j, i, logoish, A) {
  const h = hashI(r * 31 + c, j, i, 9);
  return logoish ? A.nChar + Math.floor(h * A.nLogo) : Math.floor(h * 62);     // logos cycle through logos, else letters and digits
}
// the flaps of one cell over the whole history: Float64Array [start, from, to] * n (sorted by start)
function cellSchedule(hist, glyphs, r, c, A) {
  const out = [];
  const logo = (g) => g >= A.nChar && g < A.nChar + A.nLogo;
  let shown = A.blank, tFree = -1e9;
  for (let j = 0; j < hist.length; j++) {
    const to = glyphs[j][c];
    const start = Math.max(hist[j].t + flipDelay(r, c, j), tFree);
    const tNext = j + 1 < hist.length ? hist[j + 1].t + flipDelay(r, c, j + 1) : Infinity;
    if (to === shown) continue;                                            // this cell keeps its glyph
    // how many flaps: a few random intermediates; when the next entry comes soon, exactly enough to rattle until it
    let n = 1 + Math.floor(hashI(r, c, j, 3) * 4);
    const gap = tNext - start;
    if (gap < 0.6) n = Math.max(0, Math.floor(gap / FLIP_T) - 1);
    else if (gap < Infinity) n = Math.max(0, Math.min(n, Math.floor(gap / FLIP_T) - 1));
    const seq = [shown];
    for (let i = 0; i < n; i++) { let g = pickGlyph(r, c, j, i, logo(to) || logo(shown), A); if (g === seq[seq.length - 1]) g = (g + 1) % A.nChar; seq.push(g); }
    if (seq[seq.length - 1] !== to || seq.length === 1) seq.push(to);
    for (let m = 0; m + 1 < seq.length; m++) out.push(start + m * FLIP_T, seq[m], seq[m + 1]);
    tFree = start + (seq.length - 1) * FLIP_T;
    shown = to;
  }
  return Float64Array.from(out);
}
// [a, b, phase]: phase < 0 = still showing b; else the flap of glyph a is falling to reveal b
function cellAt(sched, t, A) {
  const n = sched.length / 3;
  if (!n || t < sched[0]) return [A.blank, A.blank, -1];
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (sched[m * 3] <= t) lo = m; else hi = m - 1; }
  const s = sched[lo * 3], a = sched[lo * 3 + 1], b = sched[lo * 3 + 2], ph = (t - s) / FLIP_T;
  return ph >= 1 ? [a, b, -1] : [a, b, ph];
}
// every flap fall (for the sound department): [{ t, row, col }], the same model as the picture
export function boardFlipEvents(rows, t0 = -Infinity, t1 = Infinity) {
  const A = boardAtlasIndexOnly();
  const out = [];
  (rows ?? []).forEach((hist, r) => {
    if (!hist?.length) return;
    const glyphs = hist.map((e) => rowGlyphs(e.text, A));
    for (let c = 0; c < BOARD_COLS; c++) {
      const s = cellSchedule(hist, glyphs, r, c, A);
      for (let k = 0; k < s.length; k += 3) if (s[k] >= t0 && s[k] < t1) out.push({ t: s[k], row: r, col: c });
    }
  });
  return out.sort((a, b) => a.t - b.t);
}
// flap angle for a falling phase: a gravity drop, a small bounce on the stop
const fallAngle = (ph) => (ph < 0.82 ? Math.PI * (ph / 0.82) ** 2 : Math.PI - 0.16 * Math.sin(Math.PI * (ph - 0.82) / 0.18));

function flapMaterials(A, BU) {
  const atlasGLSL = /* glsl */ `
    vec3 glyphAt(float gi, vec2 uv, vec2 dx, vec2 dy){
      vec2 slot = vec2(mod(gi, ${f(A.COLS)}), floor(gi / ${f(A.COLS)}));
      vec2 q = clamp(uv, vec2(0.012), vec2(0.988));
      vec2 auv = vec2((slot.x + q.x) / ${f(A.COLS)}, 1.0 - (slot.y + 1.0 - q.y) / ${f(A.ROWS)});
      vec3 t = pow(textureGrad(uAtlas, auv, dx / vec2(${f(A.COLS)}, ${f(A.ROWS)}), dy / vec2(${f(A.COLS)}, ${f(A.ROWS)})).rgb, vec3(1.22));
      bool logo = gi > ${f(A.nChar - 0.5)} && gi < ${f(A.nChar + A.nLogo - 0.5)};
      return logo ? t * 0.62 : mix(uFlapK, uAmber, t.r);
    }
  `;
  const flapShade = `float lit = uBoardLit * (0.82 + 0.18 * smoothstep(${f(BIN.y0)}, ${f(BIN.y1)}, vWorld.y - ${f(BOARD.pos[1])}));`;
  const U = { ...BU, uAtlas: { value: A.tex } };
  const staticMat = cel({
    color: '#000', id: 145, gloss: 0.2, rim: 0, uniforms: U,
    vsHead: 'attribute vec2 aG; varying vec2 vG;',
    vertex: 'vG = aG;',
    fsHead: 'varying vec2 vG;' + atlasGLSL,
    pattern: /* glsl */ `
      ${flapShade}
      vec2 uv = vUv;
      float top = step(0.5, uv.y);
      float gi = floor((top > 0.5 ? vG.x : vG.y) + 0.5);
      vec3 gc = glyphAt(gi, uv, dFdx(uv), dFdy(uv));
      float split = 1.0 - smoothstep(0.012, 0.026, abs(uv.y - 0.5));
      float edge = smoothstep(0.0, 0.03, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
      float sheen = top > 0.5 ? mix(1.0, 0.86, (uv.y - 0.5) * 2.0) : mix(0.8, 1.0, uv.y * 2.0);
      gc *= sheen * mix(0.5, 1.0, edge);
      gc = mix(gc, vec3(0.0), split);
      col = gc * 0.25;
      emis = gc * lit;
    `,
  });
  const flapMat = cel({
    color: '#000', id: 145, gloss: 0.2, rim: 0, side: THREE.DoubleSide, uniforms: U,
    vsHead: 'attribute vec3 aF; varying vec3 vF;',
    vertex: /* glsl */ `
      vF = aF;
      if(aF.z < 0.0){ pos = vec3(0.0); }
      else { float c = cos(aF.z), s = sin(aF.z);
        pos = vec3(pos.x, pos.y * c - pos.z * s, pos.y * s + pos.z * c);
        nrm = vec3(nrm.x, nrm.y * c - nrm.z * s, nrm.y * s + nrm.z * c); }
    `,
    fsHead: 'varying vec3 vF;' + atlasGLSL,
    pattern: /* glsl */ `
      ${flapShade}
      vec2 uv = vUv;
      bool front = gl_FrontFacing;
      vec2 guv = front ? vec2(uv.x, 0.5 + 0.5 * uv.y) : vec2(uv.x, 0.5 - 0.5 * uv.y);
      float gi = floor((front ? vF.x : vF.y) + 0.5);
      vec3 gc = glyphAt(gi, guv, dFdx(guv), dFdy(guv));
      float edge = smoothstep(0.0, 0.03, min(min(uv.x, 1.0 - uv.x), 1.0 - uv.y));
      float split = 1.0 - smoothstep(0.024, 0.05, uv.y);
      // while falling the flap turns away from the board light: darker mid-fall
      float turn = abs(cos(vF.z));
      gc *= mix(0.45, 1.0, turn) * mix(0.5, 1.0, edge);
      gc = mix(gc, vec3(0.0), split);
      col = gc * 0.25;
      emis = gc * lit;
    `,
  });
  return { staticMat, flapMat };
}
// a bank of cells (static quad + falling flap per cell) as two instanced meshes
function flapBank(root, A, BU, flap, cellsList) {
  const { staticMat, flapMat } = flapMaterials(A, BU);
  const N = cellsList.length;
  const qStatic = new THREE.PlaneGeometry(flap.w, flap.h);
  const qFlap = new THREE.PlaneGeometry(flap.w, flap.h / 2).translate(0, flap.h / 4, 0);
  const iS = new THREE.InstancedMesh(qStatic, staticMat, N), iF = new THREE.InstancedMesh(qFlap, flapMat, N);
  const aG = new Float32Array(N * 2), aF = new Float32Array(N * 3), M4 = new THREE.Matrix4();
  cellsList.forEach(([r, c], i) => {
    const [x, y] = cellLocal(r, c);
    iS.setMatrixAt(i, M4.makeTranslation(x, y, 0.0)); iF.setMatrixAt(i, M4.makeTranslation(x, y, 0.003));
    aG[i * 2] = aG[i * 2 + 1] = A.blank; aF[i * 3 + 2] = -1;
  });
  const attG = new THREE.InstancedBufferAttribute(aG, 2), attF = new THREE.InstancedBufferAttribute(aF, 3);
  attG.setUsage(THREE.DynamicDrawUsage); attF.setUsage(THREE.DynamicDrawUsage);
  qStatic.setAttribute('aG', attG); qFlap.setAttribute('aF', attF);
  for (const m of [iS, iF]) { m.userData.noShadow = true; m.frustumCulled = false; root.add(m); }
  return { attG, attF };
}

function buildBoard() {
  const root = group(null, ...BOARD.pos);
  const A = boardAtlas('n'), AT = boardAtlas('t');
  const hw = BOARD.W / 2, hh = BOARD.H / 2;
  const frameMat = cel({
    color: '#1e1b18', id: 6, gloss: 0.7, rim: 1.4,
    pattern: /* glsl */ `
      ${FADE}
      col = ${lin('#211d19')} * (0.85 + 0.25 * fbm2(vLocal.xy * vec2(2.0, 8.0)));
      specTh = 0.95;
      // amber spill from the flaps on the frame's inner faces
      vec2 q = abs(vLocal.xy - vec2(0.0, ${f((BIN.y0 + BIN.y1) / 2)})) - vec2(${f((BIN.x1 - BIN.x0) / 2)}, ${f((BIN.y1 - BIN.y0) / 2)});
      float d = max(q.x, q.y);
      emis += ${lin('#ff9a3a')} * uBoardLit * 0.3 * (1.0 - smoothstep(0.0, 0.14, d)) * step(-0.02, d);
      emis += col * tableBounce(vWorld, N);
    `,
  });
  const brass = cel({ color: '#8e6f38', id: 5, gloss: 0.9, rim: 1.4, pattern: `col *= 0.8 + 0.3 * fbm2(vLocal.xy * 30.0); specTh = 0.93; emis += ${lin('#ff9a3a')} * uBoardLit * 0.05;` });
  // the frame: a heavy bolection moulding around, a deep top rail that carries the beacon
  const fp = fillet([[-0.35, -0.3], [0.0, -0.3, 0.004], [0.0, -0.02, 0.01], [0.018, 0.0, 0.012], [0.01, 0.045, 0.014], [-0.03, 0.065, 0.02], [-0.07, 0.05, 0.012], [-0.09, 0.03, 0.006], [-0.1, 0.0], [-0.11, 0.0], [-0.11, -0.3]], 4);
  const frame = [xf(rrSweep(hw, hh, 0.02, fp, 4), 0, 0, 0, Math.PI / 2, 0, 0)];
  frame.push(xf(rbox(BOARD.W - 0.2, BF.top - 0.1 + 0.02, 0.05, 0.006), 0, hh - 0.1 - (BF.top - 0.1) / 2, -0.005));
  frame.push(xf(rbox(BOARD.W - 0.2, BF.bottom - 0.1 + 0.02, 0.05, 0.006), 0, -hh + 0.1 + (BF.bottom - 0.1) / 2, -0.005));
  for (const sx of [-1, 1]) frame.push(xf(rbox(BF.side - 0.1 + 0.02, BOARD.H - 0.2, 0.05, 0.006), sx * (hw - 0.1 - (BF.side - 0.1) / 2), 0, -0.005));
  frame.push(xf(new THREE.BoxGeometry(BOARD.W - 0.1, BOARD.H - 0.1, 0.02), 0, 0, -0.3));
  mesh(merge(frame), frameMat, root, 0, 0, 0, true);
  // brass corner plates and rivets along the frame
  const br = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    br.push(xf(rbox(0.16, 0.035, 0.012, 0.004), sx * (hw - 0.09), sy * (hh - 0.03), 0.07));
    br.push(xf(rbox(0.035, 0.16, 0.012, 0.004), sx * (hw - 0.03), sy * (hh - 0.09), 0.07));
  }
  for (let i = 0; i <= 18; i++) for (const sy of [-1, 1]) br.push(xf(new THREE.SphereGeometry(0.009, 8, 6), -hw + 0.2 + (i * (BOARD.W - 0.4)) / 18, sy * (hh - 0.055), 0.05));
  mesh(merge(br), brass, root, 0, 0, 0, true);
  // backing and the row rails (uninked dark metal); a brass rail sets the big bottom row apart
  const back = cel({ color: '#0b0b0b', id: 106, gloss: 0.2, rim: 0, pattern: `emis += ${lin('#ff9a3a')} * uBoardLit * 0.01;` });
  const rails = [xf(new THREE.BoxGeometry(BIN.x1 - BIN.x0 + 0.02, BIN.y1 - BIN.y0 + 0.02, 0.01), 0, (BIN.y0 + BIN.y1) / 2, -0.03)];
  for (let r = 0; r <= BOARD.ROWS; r++) rails.push(xf(new THREE.BoxGeometry(BIN.x1 - BIN.x0, 0.006, 0.02), 0, BIN.y1 - (r < BOARD.ROWS ? rowTop(r) : BIN.y1 - BIN.y0), -0.005));
  mesh(merge(rails), back, root, 0, 0, 0, true);
  mesh(xf(rbox(BIN.x1 - BIN.x0 + 0.02, 0.012, 0.022, 0.004), 0, BIN.y1 - rowTop(BOARD_BIG_ROW), 0.004), brass, root, 0, 0, 0, true);
  // hooded lamps along the top rail that light the flaps (their glowing slits face down)
  const hood = [], slit = [];
  for (let i = 0; i < 6; i++) {
    const x = BIN.x0 + (i + 0.5) * (BIN.x1 - BIN.x0) / 6;
    hood.push(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 16, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), x, BIN.y1 + 0.035, 0.14));
    hood.push(xf(rbox(0.02, 0.02, 0.12, 0.004), x, BIN.y1 + 0.07, 0.07));
    slit.push(xf(new THREE.PlaneGeometry(0.28, 0.05).rotateX(Math.PI / 2), x, BIN.y1 + 0.03, 0.14));
  }
  mesh(merge(hood), frameMat, root, 0, 0, 0, true);
  const slitMat = cel({ color: '#000', id: 147, gloss: 0, rim: 0, pattern: `col = vec3(0.0); emis = ${lin('#ffc98a')} * uBoardLit * 0.5;`, side: THREE.DoubleSide });
  mesh(merge(slit), slitMat, root, 0, 0, 0, true);

  // the flaps: rows 0..10 (normal cells) and the tall bottom row, each cell a static quad plus a falling flap
  const BU = { uAmber: { value: C('#ffb444') }, uFlapK: { value: C('#2c2925') } };
  const normalCells = [], bigCells = [];
  for (let r = 0; r < BOARD.ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) (r === BOARD_BIG_ROW ? bigCells : normalCells).push([r, c]);
  const bankN = flapBank(root, A, BU, FLAP, normalCells);
  const bankT = flapBank(root, AT, BU, FLAP_BIG, bigCells);

  // 服务器繁忙 SERVER BUSY: an enamel plate that drops on two short chains under a row and swings
  const pcv = canvas(1024, 108), pg = pcv.getContext('2d');
  pg.fillStyle = '#e4dac6'; pg.fillRect(0, 0, 1024, 108);
  pg.strokeStyle = '#7c1d16'; pg.lineWidth = 10; pg.strokeRect(9, 9, 1006, 90);
  pg.fillStyle = '#141210'; pg.textBaseline = 'middle'; pg.textAlign = 'center';
  pg.font = '700 62px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'; pg.fillText('服务器繁忙', 290, 56);
  pg.font = '900 50px "Arial Black", Arial, sans-serif'; pg.fillText('SERVER BUSY', 742, 58);
  for (const x of [26, 998]) { pg.fillStyle = '#4a4440'; pg.beginPath(); pg.arc(x, 54, 7, 0, TAU); pg.fill(); }
  const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.NoColorSpace; ptex.anisotropy = 8;
  const plateMat = cel({ color: '#ffffff', id: 9, gloss: 0.6, rim: 0.8, uniforms: { uPlate: { value: ptex } },
    pattern: 'col = pow(texture(uPlate, vUv).rgb, vec3(1.22)); specTh = 0.95; emis += col * uBoardLit * 0.42;' });
  const busy = group(root); busy.visible = false;
  const PW = 1.05, PHt = 0.11, CH = 0.14;
  const busyHang = group(busy);
  const busyPlate = mesh(new THREE.PlaneGeometry(PW, PHt), plateMat, busyHang, 0, -CH - PHt / 2, 0.004, true);
  mesh(xf(rbox(PW + 0.01, PHt + 0.01, 0.006, 0.003), 0, -CH - PHt / 2, 0), frameMat, busyHang, 0, 0, 0, true);
  const bLinks = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) bLinks.push(xf(new THREE.TorusGeometry(0.011, 0.0028, 5, 10).scale(1, 1.4, 1), sx * 0.44, -0.016 - k * 0.026, 0, 0, (k % 2) * Math.PI / 2, 0));
  const busyChains = mesh(merge(bLinks), brass, busy, 0, 0, 0, true);

  // the alarm beacon on the top rail: iron base, red glass dome with a turning reflector, a wire cage
  const beacon = group(root, 0, hh - BF.top / 2 + 0.005, 0.1);
  beacon.scale.setScalar(1.3);
  const iron = cel({ color: '#1c1a18', id: 6, gloss: 0.7, rim: 1.3, pattern: 'specTh = 0.95;' });
  mesh(merge([
    xf(rbox(0.2, 0.12, 0.12, 0.01), 0, 0, -0.05),
    lathe(fillet([[0, -0.07], [0.075, -0.07, 0.01], [0.08, -0.04, 0.01], [0.07, -0.03], [0, -0.03]], 3), 28),
    ...[0, 1, 2, 3, 4, 5].map((k) => xf(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 6), Math.cos((k * TAU) / 6) * 0.078, 0.03, Math.sin((k * TAU) / 6) * 0.078)),
    xf(new THREE.TorusGeometry(0.078, 0.005, 6, 32).rotateX(Math.PI / 2), 0, 0.03, 0),
    xf(lathe(fillet([[0, 0.09], [0.05, 0.09, 0.01], [0.055, 0.1], [0, 0.105]], 2), 20), 0, 0, 0),
  ]), iron, beacon, 0, 0, 0, true);
  const AU = { uAlarm: { value: new THREE.Vector2(0, 0) } };
  const domeMat = cel({
    color: '#3a0806', id: 146, gloss: 0.9, rim: 0, uniforms: AU,
    pattern: /* glsl */ `
      vec2 d = normalize(vLocal.xz + 1e-5);
      vec2 b = vec2(cos(uAlarm.y), sin(uAlarm.y));
      float hot = pow(max(dot(d, b), 0.0), 6.0) + pow(max(-dot(d, b), 0.0), 6.0);
      float on = uAlarm.x;
      col = ${lin('#3a0a08')};
      emis = ${lin('#ff2a14')} * on * (0.35 + 2.6 * hot) + ${lin('#2a0604')} * (1.0 - on);
      specTh = 0.9;
    `,
  });
  mesh(lathe(fillet([[0, -0.03], [0.062, -0.03], [0.064, 0.02, 0.03], [0.05, 0.075, 0.03], [0.0, 0.088]], 5), 32), domeMat, beacon, 0, 0, 0, true);
  return {
    root, A, AU, beacon, bankN, bankT,
    busy: { group: busy, hang: busyHang, chains: busyChains, plate: busyPlate, CH },
    cellWorld(r, c, out) { const [x, y] = cellLocal(r, c); return out.set(x, y, 0.0).applyMatrix4(root.matrixWorld); },
  };
}

// ---------------------------------------------------------------- overlay light shafts (spot cones, alarm beams)
// Drawn additively after the atmosphere pass, depth-tested by hand against the main pass's view depth.
function shaftMaterial(engine, color, kind) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      tData: { value: engine?.rtMain?.textures?.[1] ?? null }, uRes: { value: new THREE.Vector2(engine?.IW ?? 1920, engine?.IH ?? 1080) },
      uCol: { value: new THREE.Color(color) }, uK: { value: 0 }, uFx: G.uFxTime, uHasData: { value: engine ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      out vec3 vL; out vec3 vNv; out vec3 vVv; out float vD;
      void main(){ vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; vNv = normalize(normalMatrix * normal); vVv = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tData; uniform vec2 uRes; uniform vec3 uCol; uniform float uK, uFx, uHasData;
      in vec3 vL; in vec3 vNv; in vec3 vVv; in float vD;
      out vec4 oc;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
      void main(){
        if(uK <= 0.001) discard;
        float sceneD = uHasData > 0.5 ? texture(tData, gl_FragCoord.xy / uRes).b : 0.0;
        float occl = sceneD > 0.0 ? smoothstep(0.0, 0.25, sceneD - vD) : 1.0;
        if(occl <= 0.0) discard;
        float facing = abs(dot(normalize(vNv), normalize(vVv)));
        float body = pow(facing, 2.2);
        ${kind === 'spot'
    ? 'float along = clamp(vL.y, 0.0, 1.0); float k = body * smoothstep(1.0, 0.55, along) * (0.6 + 0.4 * along) * (0.75 + 0.5 * vn(vec2(vL.y * 3.0 - uFx * 0.05, atan(vL.x, vL.z) * 2.0 + uFx * 0.03)));'
    : 'float along = clamp(vL.y, 0.0, 1.0); float k = (body + 1.4 * pow(facing, 10.0)) * pow(1.0 - along, 1.4) * (0.75 + 0.5 * vn(vec2(vL.y * 6.0 - uFx * 0.1, atan(vL.x, vL.z) * 2.0)));'}
        oc = vec4(uCol * k * uK * occl, 1.0);
      }
    `,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}
// an open cone along local +y from apex (y = 0... it is built apex at y = 1 for spots, apex at y = 0 for beams)
function coneGeo(r0, r1, seg = 48) { const g = new THREE.CylinderGeometry(r1, r0, 1, seg, 8, true).translate(0, 0.5, 0); return g; }

// ---------------------------------------------------------------- chip stacks
// Loose chips are the one chip model (src/chips.js, instanced). Tall stacks are drawn as stack segments: one cylinder
// per SEG_N chips, the chips' rims, edge blocks and seams painted on (cheap enough for a 3 m tower).
const SEG_N = 20, SEG_H = SEG_N * CHIP.H;
let STACK_GEO = null;
function stackGeometry() { return STACK_GEO ?? (STACK_GEO = new THREE.CylinderGeometry(CHIP.R, CHIP.R, SEG_H, 22, 1)); }
function stackMaterial(kind, o = {}) {
  const cn = kind === 'CN';
  return cel({
    color: cn ? '#9c3c26' : '#1e2924', id: 19, gloss: cn ? 0.15 : 0.8, rim: 1.0,
    vsHead: 'varying float vInst;', vertex: 'vInst = float(gl_InstanceID);', fsHead: 'varying float vInst;',
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0004, 0.0016, mpp);
      float mid = 1.0 - smoothstep(0.001, 0.0035, mpp);
      float seamK = 1.0 - smoothstep(0.0012, 0.0028, mpp);
      float ky = (vLocal.y + ${f(SEG_H / 2)}) / ${f(CHIP.H)};
      float k = floor(ky), fy = fract(ky);
      float sd = fract(sin((k + vInst * 37.0) * 78.233) * 43758.5453);
      float a = atan(vLocal.z, vLocal.x);
      ${cn ? `
      col = ${lin('#9c3c26')} * (0.78 + 0.32 * sd) * (0.85 + 0.3 * vnoise(vec2(a * 6.0, ky * 2.0)));
      col = mix(col, col * vec3(0.45, 0.4, 0.38), smoothstep(0.62, 0.85, vnoise(vec2(a * 9.0, ky * 1.3 + vInst))) * 0.5);
      if(abs(vLocalN.y) < 0.5) col *= 1.0 - 0.5 * seamK * (1.0 - smoothstep(0.0, 0.22, min(fy, 1.0 - fy)));
      specTh = 0.97;
      ` : `
      vec3 green = ${lin('#5f9a1c')}, ivory = ${lin('#d9d2bd')}, die = ${lin('#262a2c')};
      col *= 0.92 + 0.12 * sd;
      if(abs(vLocalN.y) < 0.5){
        col = mix(col, ivory * 0.85, step(0.62, fract(a / 6.2832 * 6.0 + sd)) * mid);
        col *= 1.0 - 0.6 * seamK * (1.0 - smoothstep(0.0, 0.2, min(fy, 1.0 - fy)));
      } else {
        vec2 p = vLocal.xz; float r = length(p) / ${f(CHIP.R)};
        if(r > 0.8) col = mix(col, mix(green, ivory, step(0.5, fract(a / 6.2832 * 12.0 + sd))) * 0.9, step(0.5, fract(a / 6.2832 * 6.0 + sd)) * mid);
        if(abs(r - 0.76) < 0.022) col = mix(col, green, mid);
        float sq = max(abs(p.x), abs(p.y)) / ${f(CHIP.R)};
        if(sq < 0.42) col = mix(col, die, mid);
      }
      specTh = 0.93;
      `}
      emis += col * (tableBounce(vWorld, N) * 0.6 + kilnLight(vWorld, N));
      ${o.tower ? `
      // the skyscraper at night: a few lit "windows" (whole segments' edge blocks glowing), and its column edges
      // catching a kicker so the tower reads standing in the dark corner beyond the lamp's cone
      float win = step(0.9, fract(sin(vInst * 12.9898 + 4.1) * 43758.5453)) * step(abs(vLocalN.y), 0.5);
      emis += ${lin('#c8e6a0')} * 0.3 * win * step(0.62, fract(a / 6.2832 * 6.0 + sd)) * (0.7 + 0.3 * sd);
      float fr = 1.0 - max(dot(N, normalize(cameraPosition - vWorld)), 0.0);
      emis += ${lin('#9a968a')} * 0.07 * smoothstep(0.55, 0.95, fr) + col * 0.5;
      ` : ''}
    `,
  });
}

// ---------------------------------------------------------------- the NVIDIA chip dispenser and its chutes
// Chutes are built in the table frame (they rock with it); the feeds from the spout and the flowing chips are world-frame.
const DENT = { u: 0.5, r: 0.14 };                       // where the US seal crushes the bridge (bridge u) and how wide
const GATE = { x: 0.62, z: 3.16, postH: 0.115, boomL: 0.4, plateAt: 0.16 };
function buildDispenser() {
  const p = DISPENSER.pos;
  const root = group(null, ...p);
  root.rotation.y = Math.atan2(-p[0], -(p[2] - 2.6));        // faces the table's foot
  root.updateMatrixWorld(true);
  const castIron = cel({
    color: '#3a3631', id: 8, gloss: 0.6, rim: 1.3,
    pattern: /* glsl */ `
      ${FADE}
      col = ${lin('#3b3732')} * (0.82 + 0.3 * fbm2(vLocal.xy * vec2(6.0, 9.0) + vLocal.z * 4.0));
      col *= 1.0 - 0.15 * (1.0 - smoothstep(0.001, 0.004, mpp)) * step(0.75, vnoise(vLocal.xy * 260.0 + vLocal.z * 90.0));
      specTh = 0.95;
      emis += col * tableBounce(vWorld, N);
    `,
  });
  const brass = cel({ color: '#8e6f38', id: 5, gloss: 0.9, rim: 1.3, pattern: 'col *= 0.8 + 0.3 * fbm2(vLocal.xy * 30.0); specTh = 0.93; emis += col * tableBounce(vWorld, N);' });
  const W = 0.86, D = 0.62, H = 1.62, zf = D / 2;
  const parts = [], bparts = [];
  parts.push(xf(rrSweep(W / 2 + 0.04, D / 2 + 0.04, 0.02, fillet([[-0.05, 0], [0, 0, 0.004], [0, 0.07, 0.004], [0.012, 0.08, 0.006], [-0.02, 0.1, 0.004], [-0.05, 0.1]], 3), 4), 0, 0, 0));
  parts.push(xf(rbox(W, H - 0.32, D, 0.02), 0, 0.1 + (H - 0.32) / 2, 0));
  parts.push(xf(rrSweep(W / 2 + 0.02, D / 2 + 0.02, 0.02, fillet([[-0.05, 0], [0, 0, 0.003], [0.03, 0.04, 0.01], [0.05, 0.07, 0.006], [0.05, 0.1, 0.004], [-0.05, 0.1]], 3), 4), 0, H - 0.22, 0));
  parts.push(xf(rrCap(W / 2 + 0.02, D / 2 + 0.02, 0.02, 0.05, 0.1, true, 4), 0, H - 0.22, 0));
  parts.push(xf(lathe(fillet([[0, 0], [0.3, 0, 0.02], [0.27, 0.06, 0.05], [0.16, 0.14, 0.04], [0.06, 0.17, 0.02], [0.05, 0.22], [0, 0.23]], 4), 40, null).scale(1.2, 1, 0.85), 0, H - 0.12, 0));
  for (const sx of [-1, 1]) parts.push(xf(rbox(0.09, H - 0.36, 0.05, 0.01), sx * (W / 2 - 0.02), 0.12 + (H - 0.36) / 2, zf + 0.01));
  for (const sx of [-1, 1]) bparts.push(xf(xf(rrSweep(D / 2 - 0.09, 0.42, 0.02, bead(0.016, 0.012), 3), 0, 0, 0, Math.PI / 2, 0, 0), sx * W / 2, 0.78, 0, 0, sx * Math.PI / 2, 0));
  bparts.push(xf(rrSweep(W / 2 - 0.13, 0.11, 0.02, bead(0.014, 0.01), 3), 0, 0, 0, Math.PI / 2, 0, 0).translate(0, 0.24, zf));
  for (let i = 0; i < 9; i++) parts.push(xf(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 6), -0.24 + i * 0.06, 0.84, zf + 0.03));
  bparts.push(xf(rbox(0.6, 0.026, 0.06, 0.008), 0, 0.66, zf + 0.03), xf(rbox(0.6, 0.026, 0.06, 0.008), 0, 1.02, zf + 0.03));
  parts.push(xf(rbox(0.5, 0.06, 0.2, 0.01), 0, 0.44, zf + 0.08));
  bparts.push(xf(rbox(0.52, 0.016, 0.02, 0.005), 0, 0.475, zf + 0.18));
  bparts.push(xf(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 20).rotateX(Math.PI / 2), -0.25, 0.97, zf + 0.06));
  bparts.push(xf(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 24).rotateZ(Math.PI / 2), W / 2 + 0.025, 0.95, 0.02));
  bparts.push(xf(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 12), W / 2 + 0.065, 1.19, 0.02));
  mesh(new THREE.SphereGeometry(0.048, 20, 14), cel({ color: '#151312', id: 9, gloss: 0.9, rim: 1.4, pattern: 'specTh = 0.92; specK = 1.5;' }), root, W / 2 + 0.065, 1.47, 0.02);
  mesh(merge(parts), castIron, root);
  mesh(merge(bparts), brass, root);
  // the NVIDIA eye (logos.js) on a lit glass plaque; blink closes two iron lids over it
  const cv = canvas(512, 232), g = cv.getContext('2d');
  g.fillStyle = '#050605'; g.fillRect(0, 0, 512, 232);
  drawLogo(g, 'nvidia', 256, 116, 210);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  const DU = { uEye: { value: tex }, uBlink: { value: 0 } };
  const eyeMat = cel({
    color: '#000', id: 149, gloss: 0, rim: 0, uniforms: DU,
    pattern: /* glsl */ `
      vec2 uv = vUv;
      vec3 t = pow(texture(uEye, uv).rgb, vec3(1.22));
      float x = (uv.x - 0.5) * 2.0;
      float lid = 0.5 * (1.0 - uBlink) * (1.0 - 0.45 * x * x);          // half-height of the opening
      float d = abs(uv.y - 0.5) - lid;
      float open = 1.0 - smoothstep(-0.006, 0.006, d);
      col = mix(${lin('#1a1816')}, t * 0.2, open);
      emis = t * 1.4 * open + ${lin('#5a4a32')} * (1.0 - smoothstep(0.0, 0.03, abs(d))) * 0.25 * step(0.01, uBlink);
    `,
  });
  mesh(new THREE.PlaneGeometry(0.44, 0.2), eyeMat, root, 0, 1.24, zf + 0.012, true);
  mesh(xf(rrSweep(0.23, 0.11, 0.02, bead(0.018, 0.012), 3), 0, 0, 0, Math.PI / 2, 0, 0), brass, root, 0, 1.24, zf + 0.004);

  // ---- chutes: trough sections carry their path coordinate and section offsets (the bridge uses them to crumple)
  const troughGeo = (curve, w, hWall) => {
    const n = Math.max(8, Math.ceil(curve.getLength() / 0.02));
    const sh = [[-w / 2 - 0.004, hWall], [-w / 2, hWall], [-w / 2, 0.004], [-w / 2 + 0.008, 0.0], [w / 2 - 0.008, 0.0], [w / 2, 0.004], [w / 2, hWall], [w / 2 + 0.004, hWall]];
    const pos = [], au = [], asec = [], aside = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = curve.getPointAt(t), T = curve.getTangentAt(t), side = V3(0, 1, 0).cross(T).normalize(), up = T.clone().cross(side).normalize();
      for (const [sx, sy] of sh) { const q = c.clone().addScaledVector(side, sx).addScaledVector(up, sy); pos.push(q.x, q.y, q.z); au.push(t); asec.push(sx, sy); aside.push(side.x, side.y, side.z); }
    }
    const m = sh.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c2 = a + m, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1));
    geo.setAttribute('aSec', new THREE.Float32BufferAttribute(asec, 2));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(aside, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const chuteMat = cel({
    color: '#8a6c38', id: 5, gloss: 0.9, rim: 1.2, side: THREE.DoubleSide,
    pattern: 'specTh = 0.94; col = ' + lin('#8d6f3a') + ' * (0.8 + 0.3 * fbm2(vWorld.xz * 14.0)); if(!gl_FrontFacing) col *= 0.45; emis += col * kilnLight(vWorld, N);',
  });
  const BRU = { uDent: { value: 0 } };
  const bridgeMat = cel({
    color: '#8a6c38', id: 5, gloss: 0.9, rim: 1.2, side: THREE.DoubleSide, uniforms: BRU,
    vsHead: 'attribute float aU; attribute vec2 aSec; attribute vec3 aSide; varying float vCrush;',
    vertex: /* glsl */ `
      float w = uDent * (1.0 - smoothstep(0.3, 1.0, abs(aU - ${f(DENT.u)}) / ${f(DENT.r)}));
      float crum = sin(aU * 173.0 + aSec.x * 410.0) * 0.5 + sin(aU * 97.0 - aSec.y * 300.0) * 0.5;
      pos.y = mix(pos.y, 0.0026 + aSec.y * 0.09 + 0.0016 * crum, w);
      pos.xz += aSide.xz * aSec.x * (0.95 + 0.3 * crum) * w;
      nrm = normalize(mix(nrm, vec3(0.35 * crum, 1.0, 0.3 * sin(aU * 61.0)), w * 0.8));
      vCrush = w;
    `,
    fsHead: 'varying float vCrush;',
    pattern: 'specTh = 0.94; col = ' + lin('#8d6f3a') + ' * (0.8 + 0.3 * fbm2(vWorld.xz * 14.0)) * (1.0 - 0.35 * vCrush); if(!gl_FrontFacing) col *= 0.45; emis += col * kilnLight(vWorld, N);',
  });
  const chutes = new THREE.Group();     // in the table frame (parented to the rocking tabletop by makeSet)
  const feeds = new THREE.Group();      // world frame: the feeds from the spout, the flowing chips
  const gutterC = new THREE.CatmullRomCurve3([V3(1.27, -0.012, 2.95), V3(1.27, -0.02, 1.2), V3(1.27, -0.028, -0.6), V3(1.27, -0.035, -2.6)], false, 'centripetal');
  const bridgeC = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return V3(1.12 - 2.22 * u, 0.008 + 0.016 * Math.sin(Math.PI * u), 3.0); }), false, 'centripetal');
  mesh(troughGeo(gutterC, 0.055, 0.03), chuteMat, chutes);
  mesh(troughGeo(bridgeC, 0.06, 0.028), bridgeMat, chutes);
  // little brass abutments at both bridge ends, hangers for the gutter, end stops
  const hang = [];
  for (const z of [2.4, 1.0, -0.4, -1.8]) hang.push(xf(rbox(0.07, 0.012, 0.02, 0.003), 1.23, -0.004, z));
  hang.push(xf(rbox(0.012, 0.035, 0.07, 0.003), -1.11, 0.022, 3.0), xf(rbox(0.06, 0.035, 0.012, 0.003), 1.27, -0.02, -2.61));
  for (const x of [1.1, -1.08]) hang.push(xf(rbox(0.05, 0.016, 0.09, 0.004), x, 0.008, 3.0));
  mesh(merge(hang), chuteMat, chutes);
  const zf2 = zf + 0.12;
  const outW = root.localToWorld(V3(-0.25, 0.97, zf2));
  const mid = (a, b, k, dy) => V3(a.x + (b[0] - a.x) * k, a.y + (b[1] - a.y) * k + dy, a.z + (b[2] - a.z) * k);
  const feedCN = [outW.clone(), mid(outW, [1.3, 0.02, 3.02], 0.55, 0.02), V3(1.3, 0.02, 3.02), V3(1.12, 0.012, 3.0)];
  const feedUS = [outW.clone().add(V3(0.02, -0.04, -0.03)), mid(outW, [1.29, -0.004, 3.05], 0.5, 0.0), V3(1.29, -0.004, 3.05), V3(1.27, -0.012, 2.95)];
  mesh(troughGeo(new THREE.CatmullRomCurve3(feedCN, false, 'centripetal'), 0.06, 0.03), chuteMat, feeds);
  mesh(troughGeo(new THREE.CatmullRomCurve3(feedUS, false, 'centripetal'), 0.055, 0.03), chuteMat, feeds);
  // the chip flow: each path runs spout -> chute end
  const flowPath = {
    US: new THREE.CatmullRomCurve3([...feedUS, ...gutterC.points.slice(1)], false, 'centripetal'),
    CN: new THREE.CatmullRomCurve3([...feedCN, ...Array.from({ length: 8 }, (_, i) => bridgeC.getPointAt((i + 1) / 8))], false, 'centripetal'),
  };
  const bridgeStartU = (() => { const L = flowPath.CN.getLength(), Lb = bridgeC.getLength(); return 1 - Lb / L; })();
  const flow = { US: makeChips(260, 'US'), CN: makeChips(160, 'US') };
  for (const s of ['US', 'CN']) { flow[s].count = 0; feeds.add(flow[s]); }

  // ---- the 禁运 EMBARGO mark the US seal leaves on the crushed bridge (a round stamp, red ink)
  const mcv = canvas(512, 512), mg = mcv.getContext('2d');
  mg.clearRect(0, 0, 512, 512);
  mg.strokeStyle = mg.fillStyle = '#9a1c14';
  mg.lineWidth = 22; mg.beginPath(); mg.arc(256, 256, 232, 0, TAU); mg.stroke();
  mg.lineWidth = 7; mg.beginPath(); mg.arc(256, 256, 198, 0, TAU); mg.stroke();
  mg.textAlign = 'center'; mg.textBaseline = 'middle';
  mg.font = '900 150px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", serif'; mg.fillText('禁运', 256, 222);
  mg.font = '900 62px "Arial Black", Arial, sans-serif'; mg.fillText('EMBARGO', 256, 338);
  // worn ink: knock holes out of it
  mg.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { const x = hashI(i, 1, 9) * 512, y = hashI(i, 2, 9) * 512, r = 1 + hashI(i, 3, 9) * 5; mg.beginPath(); mg.arc(x, y, r, 0, TAU); mg.fill(); }
  mg.globalCompositeOperation = 'source-over';
  const mtex = new THREE.CanvasTexture(mcv); mtex.colorSpace = THREE.NoColorSpace; mtex.anisotropy = 8;
  const MU = { uMarkTex: { value: mtex }, uMark: { value: 0 } };
  const markMat = cel({
    color: '#7a1a12', id: 102, gloss: 0.1, rim: 0, uniforms: MU,
    pattern: 'vec4 tm = texture(uMarkTex, vUv); if(tm.a * uMark < 0.4) discard; col = pow(tm.rgb, vec3(1.22)) * 0.8; specK = 0.0; emis += col * kilnLight(vWorld, N);',
  });
  const mark = mesh(new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2), markMat, chutes, 0, 0, 0, true);
  { const c = bridgeC.getPointAt(DENT.u); mark.position.set(c.x, 0.0045, c.z); }

  // ---- the toll gate: an iron post with a red-white boom and a "25%" plate, dropped onto the bridge's US end
  const gate = group(chutes, GATE.x, 0, GATE.z); gate.visible = false;
  const gateIron = cel({ color: '#26231f', id: 9, gloss: 0.7, rim: 1.2, pattern: 'specTh = 0.95; emis += col * tableBounce(vWorld, N);' });
  mesh(merge([xf(rbox(0.06, 0.01, 0.06, 0.003), 0, 0.005, 0), xf(new THREE.CylinderGeometry(0.011, 0.013, GATE.postH, 12), 0, GATE.postH / 2, 0), xf(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 14).rotateZ(Math.PI / 2), 0, GATE.postH, 0)]), gateIron, gate);
  const boom = group(gate, 0, GATE.postH, 0);
  const boomMat = cel({
    color: '#d8d2c4', id: 9, gloss: 0.6, rim: 1.0,
    pattern: `float st = step(0.5, fract(vLocal.y / 0.05)); col = mix(${lin('#d9d1c0')}, ${lin('#a3241a')}, st * step(0.0, vLocal.y)); specTh = 0.95; emis += col * tableBounce(vWorld, N);`,
  });
  mesh(xf(rbox(0.016, GATE.boomL, 0.016, 0.004), 0, GATE.boomL / 2, 0), boomMat, boom);
  mesh(xf(rbox(0.03, 0.05, 0.026, 0.004), 0, -0.035, 0), gateIron, boom);
  const pcv = canvas(256, 192), pg = pcv.getContext('2d');
  pg.fillStyle = '#e8e0cc'; pg.fillRect(0, 0, 256, 192);
  pg.strokeStyle = '#a3241a'; pg.lineWidth = 14; pg.strokeRect(10, 10, 236, 172);
  pg.fillStyle = '#141210'; pg.font = '900 96px "Arial Black", Arial, sans-serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle'; pg.fillText('25%', 128, 100);
  const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.NoColorSpace; ptex.anisotropy = 8;
  const plateHang = group(boom, 0, GATE.plateAt, 0);
  const tollPlateMat = cel({ color: '#fff', id: 9, gloss: 0.5, uniforms: { uTP: { value: ptex } }, side: THREE.DoubleSide, pattern: 'col = pow(texture(uTP, vUv).rgb, vec3(1.22)); specTh = 0.95; emis += col * tableBounce(vWorld, N) * 0.6;' });
  // the plate hangs below the boom when the boom lies flat (boom-local -z is world down then) and faces the US end (+x)
  // (plateHang is counter-rotated against the boom, so its frame stays upright: the plate hangs straight down)
  mesh(new THREE.PlaneGeometry(0.075, 0.056).rotateY(Math.PI / 2).translate(0.006, -0.05, 0), tollPlateMat, plateHang);
  mesh(merge([xf(new THREE.TorusGeometry(0.008, 0.002, 5, 10), 0.003, -0.014, -0.016, 0, Math.PI / 2, 0), xf(new THREE.TorusGeometry(0.008, 0.002, 5, 10), 0.003, -0.014, 0.016, 0, Math.PI / 2, 0)]), gateIron, plateHang);

  // ---- the cart: a small iron mine cart heaped with chips, running in the bridge trough
  const cart = group(chutes); cart.visible = false;
  const cartBody = group(cart);
  const tub = new THREE.CylinderGeometry(0.075, 0.056, 0.045, 4, 1, true).rotateY(Math.PI / 4).scale(1.15, 1, 0.7).translate(0, 0.0225, 0);
  const tubBottom = new THREE.BoxGeometry(0.086, 0.004, 0.056).translate(0, 0.002, 0);
  const cartIron = cel({ color: '#2e2a26', id: 9, gloss: 0.6, rim: 1.2, side: THREE.DoubleSide, pattern: 'specTh = 0.95; col *= 0.85 + 0.25 * vnoise(vLocal.xz * 300.0); emis += col * tableBounce(vWorld, N);' });
  mesh(merge([tub, tubBottom,
    xf(new THREE.TorusGeometry(0.001, 0.001, 3, 4), 0, 0, 0),
    xf(rbox(0.125, 0.006, 0.004, 0.002), 0, 0.044, 0.0375), xf(rbox(0.125, 0.006, 0.004, 0.002), 0, 0.044, -0.0375),
    xf(rbox(0.004, 0.006, 0.08, 0.002), 0.0615, 0.044, 0), xf(rbox(0.004, 0.006, 0.08, 0.002), -0.0615, 0.044, 0),
  ]), cartIron, cartBody, 0, 0.0, 0);
  cartBody.position.y = 0.015;
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wg = group(cart, sx * 0.034, 0.0, sz * 0.021);
    mesh(merge([new THREE.CylinderGeometry(0.013, 0.013, 0.005, 14).rotateX(Math.PI / 2), xf(rbox(0.02, 0.003, 0.006, 0.001), 0, 0, 0)]), cartIron, wg);
    wheels.push(wg);
  }
  const cartChips = makeChips(42, 'US');
  cartChips.count = 0;
  cartBody.add(cartChips);
  const heap = [];
  { let k = 0; for (const [n, y, rx, rz] of [[12, 0.008, 0.032, 0.018], [11, 0.02, 0.03, 0.017], [9, 0.032, 0.026, 0.015], [6, 0.044, 0.02, 0.012], [3, 0.054, 0.012, 0.008], [1, 0.062, 0, 0]]) for (let i = 0; i < n; i++, k++) {
    const a = (i / n) * TAU + hashI(k, 4) * 0.5;
    const m = new THREE.Matrix4().compose(V3(Math.cos(a) * rx * (0.6 + 0.4 * hashI(k, 5)), y, Math.sin(a) * rz * (0.6 + 0.4 * hashI(k, 6))), new THREE.Quaternion().setFromEuler(new THREE.Euler((hashI(k, 7) - 0.5) * 0.9, hashI(k, 8) * TAU, (hashI(k, 9) - 0.5) * 0.9)), V3(1, 1, 1));
    heap.push(m); cartChips.setMatrixAt(k, m);
  } }
  cartChips.instanceMatrix.needsUpdate = true;
  return { root, chutes, feeds, DU, BRU, MU, gate, boom, plateHang, cart, cartBody, wheels, cartChips, heap, flow, flowPath, bridgeStartU, paths: { US: gutterC, CN: bridgeC } };
}

// ---------------------------------------------------------------- the chip tower and its avalanche
// A stepped skyscraper of chip-stack columns (hollow walls, solid roofs) beside the dispenser. Its fall is simulated
// once at load with a fixed seed (a rocking sway, an inverted-pendulum topple toward the table, segments breaking off,
// ballistic tumbling with bounces and friction on the floor and the tabletop, hard hits bursting segments into loose
// chips that flood across), recorded as keyframes; `fall` only scrubs them.
export const TOWER = { pos: [2.9, FLOOR_Y, 3.0], dir: [-1, 0, -0.1], H: 0 };
const TSIM = { DT: 1 / 200, S: 4.4, SWAY: 0.75, KF: 6, NC: 2600 };
let TOWER_DATA = null;
function towerSim() {
  if (TOWER_DATA) return TOWER_DATA;
  const R = CHIP.R, PC = 2 * R + 0.0012;
  const segs = [];
  const tiers = [[15, 13], [11, 10], [7, 7], [1, 3]];
  let y0 = 0;
  for (const [nc, ns] of tiers) {
    for (let i = 0; i < nc; i++) for (let j = 0; j < nc; j++) {
      const edge = i === 0 || j === 0 || i === nc - 1 || j === nc - 1;
      const x = (i - (nc - 1) / 2) * PC, z = (j - (nc - 1) / 2) * PC;
      for (let k = 0; k < ns; k++) if (edge || k === ns - 1) segs.push([x + (hashI(i, j, k, 1) - 0.5) * 0.002, y0 + (k + 0.5) * SEG_H, z + (hashI(i, j, k, 2) - 0.5) * 0.002]);
    }
    y0 += ns * SEG_H;
  }
  const H = (TOWER.H = y0);
  const NS = segs.length, NC = TSIM.NC, NB = NS + NC;
  const { DT, S, SWAY, KF } = TSIM, STEPS = Math.round(S / DT), NK = Math.floor(STEPS / KF) + 1;
  const [bx, by, bz] = TOWER.pos;
  const dl = Math.hypot(TOWER.dir[0], TOWER.dir[2]), Dx = TOWER.dir[0] / dl, Dz = TOWER.dir[2] / dl;
  const Ax = Dz, Az = -Dx;                                    // tipping axis = up x D (horizontal)
  const half = 7 * PC + R;
  const pvF = [bx + Dx * half, by, bz + Dz * half], pvB = [bx - Dx * half, by, bz - Dz * half];
  const P = new Float64Array(NB * 3), V = new Float64Array(NB * 3), Q = new Float64Array(NB * 4), Wv = new Float64Array(NB * 3);
  const st = new Uint8Array(NB), contact = new Uint8Array(NB), burst = new Uint8Array(NB);
  const thD = new Float64Array(NS), spawnK = new Int32Array(NB).fill(0), hideK = new Int32Array(NB).fill(1 << 30);
  for (let i = NS; i < NB; i++) spawnK[i] = 1 << 30;
  for (let i = 0; i < NS; i++) {
    const [x, y, z] = segs[i];
    P[i * 3] = bx + x; P[i * 3 + 1] = by + y; P[i * 3 + 2] = bz + z; Q[i * 4 + 3] = 1;
    thD[i] = 0.42 + 0.55 * Math.pow(1 - y / H, 1.2) + 0.18 * hashI(i, 11, 3);
  }
  for (let i = NS; i < NB; i++) { P[i * 3 + 1] = -100; Q[i * 4 + 3] = 1; }
  const rest = new Float64Array(NS * 3); rest.set(P.subarray(0, NS * 3));
  const kpos = new Float32Array(NK * NB * 3), kq = new Int16Array(NK * NB * 4);
  const surf = (x, z) => (Math.abs(x) < TABLE.HALF_W && Math.abs(z) < TABLE.HALF_L ? 0 : FLOOR_Y);
  const inRect = (x, z) => Math.abs(x) < TABLE.HALF_W && Math.abs(z) < TABLE.HALF_L;
  // quaternion helpers (x, y, z, w)
  const qAxis = (ax, ay, az, a, o, k) => { const s = Math.sin(a / 2); o[k] = ax * s; o[k + 1] = ay * s; o[k + 2] = az * s; o[k + 3] = Math.cos(a / 2); };
  const rot = (q, k, vx, vy, vz) => {          // rotate v by q[k..k+3] -> [x, y, z]
    const x = q[k], y = q[k + 1], z = q[k + 2], w = q[k + 3];
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
  };
  let theta = 0, omega = 0, pool = NS;
  const rnd = (i, s) => hashI(i, s, 77);
  const k3 = (3 * 9.81) / (2 * H);
  const record = (kk) => {
    const o3 = kk * NB * 3, o4 = kk * NB * 4;
    for (let i = 0; i < NB; i++) {
      kpos[o3 + i * 3] = P[i * 3]; kpos[o3 + i * 3 + 1] = P[i * 3 + 1]; kpos[o3 + i * 3 + 2] = P[i * 3 + 2];
      const n = Math.hypot(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]) || 1;
      for (let c = 0; c < 4; c++) kq[o4 + i * 4 + c] = Math.round((Q[i * 4 + c] / n) * 32767);
    }
  };
  record(0);
  for (let step = 1; step <= STEPS; step++) {
    const s = step * DT;
    // the tower body (still standing segments follow it)
    let thPrev = theta;
    if (s < SWAY) theta = -0.04 * Math.pow(s / SWAY, 1.2) * Math.sin(4 * Math.PI * s);
    else { omega += (k3 * Math.sin(Math.max(theta, 0)) + (theta < 0 ? 0 : 0)) * DT; theta += omega * DT; }
    if (s < SWAY) omega = (theta - thPrev) / DT;
    const pv = theta >= 0 ? pvF : pvB;
    const ca = Math.cos(theta), sa = Math.sin(theta);
    for (let i = 0; i < NS; i++) {
      if (st[i] !== 0) continue;
      // attached: rotate the rest position about the pivot edge
      const rx = rest[i * 3] - pv[0], ry = rest[i * 3 + 1] - pv[1], rz = rest[i * 3 + 2] - pv[2];
      const dot = rx * Ax + rz * Az, cx = -Az * ry, cy = Az * rx - Ax * rz, cz = Ax * ry;   // A x r with A = (Ax, 0, Az)
      const nx = rx * ca + cx * sa + Ax * dot * (1 - ca), ny = ry * ca + cy * sa, nz = rz * ca + cz * sa + Az * dot * (1 - ca);
      P[i * 3] = pv[0] + nx; P[i * 3 + 1] = pv[1] + ny; P[i * 3 + 2] = pv[2] + nz;
      qAxis(Ax, 0, Az, theta, Q, i * 4);
      const hitSurf = P[i * 3 + 1] - 0.02 < surf(P[i * 3], P[i * 3 + 2]);
      if (s >= SWAY && (theta > thD[i] || theta > 1.45 || (theta > 0.25 && hitSurf))) {
        st[i] = 1;
        // tangential velocity omega * (A x r_new) + a little scatter
        const tx = -Az * ny, ty = Az * nx - Ax * nz, tz = Ax * ny;
        V[i * 3] = omega * tx + (rnd(i, 1) - 0.5) * 0.3; V[i * 3 + 1] = omega * ty + (rnd(i, 2) - 0.5) * 0.2; V[i * 3 + 2] = omega * tz + (rnd(i, 3) - 0.5) * 0.3;
        Wv[i * 3] = Ax * omega + (rnd(i, 4) - 0.5) * 6; Wv[i * 3 + 1] = (rnd(i, 5) - 0.5) * 4; Wv[i * 3 + 2] = Az * omega + (rnd(i, 6) - 0.5) * 6;
      }
    }
    // free bodies
    for (let i = 0; i < NB; i++) {
      if (st[i] !== 1) continue;
      const seg = i < NS, re = seg ? 0.02 : 0.0025;
      const ox = P[i * 3], oz = P[i * 3 + 2], wasIn = inRect(ox, oz);
      V[i * 3 + 1] -= 9.81 * DT;
      P[i * 3] += V[i * 3] * DT; P[i * 3 + 1] += V[i * 3 + 1] * DT; P[i * 3 + 2] += V[i * 3 + 2] * DT;
      const x = P[i * 3], z = P[i * 3 + 2];
      contact[i] = 0;
      if (!wasIn && inRect(x, z) && P[i * 3 + 1] < -0.015) {
        // hit the table's side: bounce back out
        const px = TABLE.HALF_W - Math.abs(x), pz = TABLE.HALF_L - Math.abs(z);
        if (px < pz) { P[i * 3] = Math.sign(x) * (TABLE.HALF_W + 0.002); V[i * 3] *= -0.3; } else { P[i * 3 + 2] = Math.sign(z) * (TABLE.HALF_L + 0.002); V[i * 3 + 2] *= -0.3; }
      }
      const sf = surf(P[i * 3], P[i * 3 + 2]);
      if (P[i * 3 + 1] - re < sf) {
        P[i * 3 + 1] = sf + re; contact[i] = 1;
        const imp = -V[i * 3 + 1];
        if (imp > 0) V[i * 3 + 1] = imp * (seg ? 0.16 : 0.24);
        // hard hits break segments into loose chips
        if (seg && !burst[i] && imp > 1.5 && rnd(i, 9) < 0.6 && pool + 7 <= NB) {
          burst[i] = 1; st[i] = 2; hideK[i] = Math.ceil(step / KF);
          const ax = rot(Q, i * 4, 0, 1, 0);
          for (let c = 0; c < 7; c++, pool++) {
            const j = pool, u = (c / 6 - 0.5) * SEG_H;
            P[j * 3] = P[i * 3] + ax[0] * u; P[j * 3 + 1] = sf + 0.01 + Math.abs(ax[1] * u); P[j * 3 + 2] = P[i * 3 + 2] + ax[2] * u;
            const ang = rnd(j, 1) * TAU, sp = 0.4 + 1.6 * rnd(j, 2);
            V[j * 3] = V[i * 3] * 0.8 + Math.cos(ang) * sp; V[j * 3 + 1] = 0.5 + 1.2 * rnd(j, 3); V[j * 3 + 2] = V[i * 3 + 2] * 0.8 + Math.sin(ang) * sp;
            Wv[j * 3] = (rnd(j, 4) - 0.5) * 50; Wv[j * 3 + 1] = (rnd(j, 5) - 0.5) * 20; Wv[j * 3 + 2] = (rnd(j, 6) - 0.5) * 50;
            qAxis(...(() => { const a = rnd(j, 7) * TAU, b = rnd(j, 8) * 2 - 1, r2 = Math.sqrt(1 - b * b); return [r2 * Math.cos(a), b, r2 * Math.sin(a)]; })(), rnd(j, 9) * TAU, Q, j * 4);
            st[j] = 1; spawnK[j] = Math.ceil(step / KF);
          }
          continue;
        }
        // sliding friction (chips slide far on the cloth), rolling damp
        const hv = Math.hypot(V[i * 3], V[i * 3 + 2]);
        if (hv > 1e-6) { const k = Math.max(0, hv - (seg ? 4.2 : (sf === 0 ? 1.7 : 2.6)) * DT) / hv; V[i * 3] *= k; V[i * 3 + 2] *= k; }
        Wv[i * 3] *= 0.93; Wv[i * 3 + 1] *= 0.93; Wv[i * 3 + 2] *= 0.93;
      }
      // integrate the spin
      const wx = Wv[i * 3], wy = Wv[i * 3 + 1], wz = Wv[i * 3 + 2], k4 = i * 4;
      const qx = Q[k4], qy = Q[k4 + 1], qz = Q[k4 + 2], qw = Q[k4 + 3], h = 0.5 * DT;
      Q[k4] += h * (wx * qw + wy * qz - wz * qy); Q[k4 + 1] += h * (wy * qw + wz * qx - wx * qz);
      Q[k4 + 2] += h * (wz * qw + wx * qy - wy * qx); Q[k4 + 3] += h * (-wx * qx - wy * qy - wz * qz);
      const qn = Math.hypot(Q[k4], Q[k4 + 1], Q[k4 + 2], Q[k4 + 3]); Q[k4] /= qn; Q[k4 + 1] /= qn; Q[k4 + 2] /= qn; Q[k4 + 3] /= qn;
      // settle: lie down (segments on their side unless nearly upright, chips flat)
      const spd = Math.hypot(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
      if (contact[i] && spd < 0.6) {
        const ax = rot(Q, k4, 0, 1, 0);
        let tx, ty, tz;
        if (!seg || Math.abs(ax[1]) > 0.75) { tx = 0; ty = Math.sign(ax[1]) || 1; tz = 0; } else { const l = Math.hypot(ax[0], ax[2]) || 1; tx = ax[0] / l; ty = 0; tz = ax[2] / l; }
        // rotate by part of the angle between ax and the target
        const cx = ax[1] * tz - ax[2] * ty, cy = ax[2] * tx - ax[0] * tz, cz = ax[0] * ty - ax[1] * tx;
        const sn = Math.hypot(cx, cy, cz), cs = ax[0] * tx + ax[1] * ty + ax[2] * tz;
        if (sn > 1e-5) {
          const ang = Math.atan2(sn, cs) * Math.min(1, 10 * DT), s2 = Math.sin(ang / 2) / sn, c2 = Math.cos(ang / 2);
          const rx = cx * s2, ry = cy * s2, rz = cz * s2;
          const nx = c2 * qx + rx * qw + ry * qz - rz * qy, ny = c2 * qy + ry * qw + rz * qx - rx * qz, nz = c2 * qz + rz * qw + rx * qy - ry * qx, nw = c2 * qw - rx * qx - ry * qy - rz * qz;
          Q[k4] = nx; Q[k4 + 1] = ny; Q[k4 + 2] = nz; Q[k4 + 3] = nw;
        }
        Wv[i * 3] *= 0.85; Wv[i * 3 + 1] *= 0.85; Wv[i * 3 + 2] *= 0.85;
        if (spd < 0.03) { V[i * 3] = V[i * 3 + 1] = V[i * 3 + 2] = 0; }
      }
    }
    if (step % KF === 0) record(step / KF);
  }
  TOWER_DATA = { NS, NC, NB, NK, kpos, kq, spawnK, hideK, H };
  return TOWER_DATA;
}
function buildTower() {
  const T = towerSim();
  const root = new THREE.Group();
  const segMesh = new THREE.InstancedMesh(stackGeometry(), stackMaterial('US', { tower: true }), T.NS);
  const chipMesh = makeChips(T.NC, 'US');
  segMesh.frustumCulled = false; chipMesh.count = T.NC;
  root.add(segMesh, chipMesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q1 = new THREE.Quaternion(), p = V3(), p1 = V3(), one = V3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let last = -1;
  function evalFall(fall) {
    const fl = Math.min(1, Math.max(0, fall));
    if (fl === last) return;
    last = fl;
    const kf = (fl * TSIM.S) / (TSIM.DT * TSIM.KF);
    const k0 = Math.min(T.NK - 1, Math.floor(kf)), k1 = Math.min(T.NK - 1, k0 + 1), a = Math.min(1, kf - k0);
    for (let i = 0; i < T.NB; i++) {
      const vis = i < T.NS ? T.hideK[i] > kf : T.spawnK[i] <= kf;
      const target = i < T.NS ? segMesh : chipMesh, j = i < T.NS ? i : i - T.NS;
      if (!vis) { target.setMatrixAt(j, zero); continue; }
      const useA = i >= T.NS && T.spawnK[i] > k0 ? 1 : a;
      const o0 = (k0 * T.NB + i), o1 = (k1 * T.NB + i);
      p.set(T.kpos[o0 * 3], T.kpos[o0 * 3 + 1], T.kpos[o0 * 3 + 2]);
      p1.set(T.kpos[o1 * 3], T.kpos[o1 * 3 + 1], T.kpos[o1 * 3 + 2]);
      p.lerp(p1, useA);
      q.set(T.kq[o0 * 4], T.kq[o0 * 4 + 1], T.kq[o0 * 4 + 2], T.kq[o0 * 4 + 3]);
      q1.set(T.kq[o1 * 4], T.kq[o1 * 4 + 1], T.kq[o1 * 4 + 2], T.kq[o1 * 4 + 3]);
      if (q.dot(q1) < 0) q1.set(-q1.x, -q1.y, -q1.z, -q1.w);
      q.set(q.x + (q1.x - q.x) * useA, q.y + (q1.y - q.y) * useA, q.z + (q1.z - q.z) * useA, q.w + (q1.w - q.w) * useA).normalize();
      target.setMatrixAt(j, m.compose(p, q, one));
    }
    segMesh.instanceMatrix.needsUpdate = true; chipMesh.instanceMatrix.needsUpdate = true;
  }
  evalFall(0);
  return { root, evalFall };
}

// ---------------------------------------------------------------- the CN brick kiln (foot-left corner, the mirror of the dispenser)
// A brick beehive kiln with a chimney and an arched stoke porch facing the table. Dark until `show`; `glow` lights the fire
// in its mouth and throws red light around (kilnLight in every set material); `bricks` stacks rough red clay chips
// beside it like bricks on two pallets.
export const KILN = { pos: [-1.95, FLOOR_Y, 3.75], yaw: Math.PI / 6, bricks: [-2.85, FLOOR_Y, 3.05], mouth: [0, 0, 0] };
function buildKiln() {
  const p = KILN.pos;
  const root = group(null, ...p);
  // the fire door faces the foot of the room, turned 30 degrees toward the table: M1 sees the fire, and its light
  // falls on the floor in front and on the table's foot-left corner
  root.rotation.y = KILN.yaw;
  root.updateMatrixWorld(true);
  const KU = { uShow: { value: 0 }, uFire: { value: 0 } };
  const brickGLSL = /* glsl */ `
    ${FADE}
    vec3 q = vLocal;
    float rr = length(q.xz), an = atan(q.x, q.z);
    vec2 b = abs(vLocalN.y) > 0.85 ? q.xz / vec2(0.13, 0.065) : (abs(vLocalN.x) > 0.7 ? vec2(q.z, q.y) / vec2(0.13, 0.065) : (abs(vLocalN.z) > 0.7 && rr > 0.62 ? vec2(q.x, q.y) / vec2(0.13, 0.065) : vec2(an * max(rr, 0.05) / 0.13, q.y / 0.065)));
    float row = floor(b.y); b.x += 0.5 * mod(row, 2.0);
    vec2 bid = floor(b), fr = fract(b);
    float h = hash12(bid + 3.0);
    col = ${lin('#6e3020')} * (0.68 + 0.5 * h) * (0.85 + 0.3 * vnoise(q.xy * 40.0 + q.z * 20.0));
    vec2 de = min(fr, 1.0 - fr) * vec2(0.13, 0.065);
    col = mix(col, ${lin('#3e3631')}, lineAA(min(de.x, de.y), 0.005, mpp) * 0.85);
    // soot from the fire up the front and over the dome, darker toward the chimney
    col *= mix(1.0, 0.45, smoothstep(0.7, 1.15, q.y) * 0.8 + smoothstep(0.1, 0.6, q.z) * smoothstep(0.35, 0.75, q.y) * 0.5);
    lampMul *= uShow; shadeMul *= uShow;
    emis += col * (kilnLight(vWorld, N) * uShow + tableBounce(vWorld, N) * 0.6 * uShow);
  `;
  const brick = cel({ color: '#6e3020', id: 8, gloss: 0.05, rim: 0.8, uniforms: KU, pattern: brickGLSL });
  const kIron = cel({ color: '#26231f', id: 9, gloss: 0.6, rim: 1.0, uniforms: KU, pattern: 'specTh = 0.95; lampMul *= uShow; shadeMul *= uShow; emis += col * kilnLight(vWorld, N) * uShow;' });
  // plinth, beehive body, chimney
  const body = [
    xf(rbox(1.3, 0.12, 1.2, 0.02), 0, 0.06, -0.02),
    lathe(fillet([[0, 0.12], [0.56, 0.12], [0.56, 0.52, 0.06], [0.52, 0.7, 0.1], [0.43, 0.88, 0.1], [0.3, 1.02, 0.08], [0.15, 1.11, 0.04], [0, 1.14]], 4), 48).translate(0, 0, -0.02),
    xf(rbox(0.26, 1.24, 0.26, 0.01), 0, 1.38, -0.36),
    xf(rbox(0.32, 0.07, 0.32, 0.01), 0, 2.02, -0.36),
  ];
  // the stoke porch: an arched brick vault on the front with the fire opening in it
  const arch = (w, h, seg = 16) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s; };
  const hole = arch(0.34, 0.4);
  const porch = new THREE.Shape();
  { const R0 = 0.31, r0 = 0.17;
    porch.moveTo(-R0, 0); porch.lineTo(-r0, 0); porch.lineTo(-r0, 0.4 - r0); porch.absarc(0, 0.4 - r0, r0, Math.PI, 0, true);
    porch.lineTo(r0, 0); porch.lineTo(R0, 0); porch.lineTo(R0, 0.62 - R0); porch.absarc(0, 0.62 - R0, R0, 0, Math.PI, false); porch.lineTo(-R0, 0); }
  body.push(new THREE.ExtrudeGeometry(porch, { depth: 0.26, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 20 }).translate(0, 0.12, 0.36));
  mesh(merge(body), brick, root);
  // an iron band round the opening, the fire door hanging open, a few glowing coals
  const band = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hole.getPoints(24).map((v) => V3(v.x, v.y + 0.12, 0.63))), 40, 0.009, 6, false);
  mesh(merge([band, xf(rbox(0.36, 0.4, 0.012, 0.004), -0.36, 0.33, 0.66, 0, -1.9, 0)]), kIron, root);
  const fireMat = cel({
    color: '#000', id: 143, gloss: 0, rim: 0, uniforms: KU,
    pattern: /* glsl */ `
      vec2 pq = vLocal.xy;
      float u = (pq.x + 0.17) / 0.34, v = (pq.y - 0.12) / 0.4;
      float tt = uFxTime;
      float n1 = fbm2(vec2(u * 3.5, v * 2.4 - tt * 1.8)), n2 = vnoise(vec2(u * 9.0 + 3.0, v * 6.0 - tt * 3.1));
      float flame = clamp((1.0 - v) * 1.3 - 0.22 + (n1 - 0.5) * 1.1 + (n2 - 0.5) * 0.35, 0.0, 1.0);
      vec3 c = mix(${lin('#2a0402')}, ${lin('#ff5a12')}, smoothstep(0.1, 0.7, flame));
      c = mix(c, ${lin('#ffd38a')}, smoothstep(0.78, 1.0, flame));
      emis = c * uFire * 2.4 + ${lin('#0c0806')} * (1.0 - uFire);
      col = vec3(0.0);
    `,
  });
  // (the fire sits in the porch, just in front of the dome's curved face, which would otherwise wall it off)
  mesh(new THREE.ShapeGeometry(hole, 16).translate(0, 0.12, 0.565), fireMat, root, 0, 0, 0, true);
  const coals = [];
  for (let i = 0; i < 9; i++) coals.push(xf(new THREE.IcosahedronGeometry(0.018 + 0.01 * hashI(i, 3), 0), (hashI(i, 1) - 0.5) * 0.26, 0.135, 0.575 + hashI(i, 2) * 0.04));
  const coalMat = cel({ color: '#140c08', id: 143, gloss: 0, rim: 0, uniforms: KU, pattern: `emis = ${lin('#ff3c0a')} * uFire * (0.6 + 0.8 * vnoise(vLocal.xy * 90.0 + uFxTime * 2.0)); col = vec3(0.02);` });
  mesh(merge(coals), coalMat, root, 0, 0, 0, true);
  const mouthW = root.localToWorld(V3(0, 0.3, 0.62));
  KILN.mouth = [mouthW.x, mouthW.y, mouthW.z];
  // the red clay chips, stacked like bricks on two pallets: layers cross-laid, each brick a stack lying on its side
  const bricksRoot = group(null, ...KILN.bricks);
  const palletMat = cel({ color: '#3a2a1c', id: 9, gloss: 0.1, uniforms: KU, pattern: 'col *= 0.85 + 0.3 * vnoise(vLocal.xz * 60.0); lampMul *= uShow; shadeMul *= uShow; emis += col * kilnLight(vWorld, N) * uShow;' });
  const pal = [];
  for (const ox of [-0.15, 0.15]) for (const dz of [-0.1, 0, 0.1]) pal.push(xf(rbox(0.26, 0.03, 0.06, 0.004), ox, 0.015, dz));
  mesh(merge(pal), palletMat, bricksRoot);
  const brickSlots = [];
  const L = SEG_H, D2 = 2 * CHIP.R + 0.002;
  for (const ox of [-0.15, 0.15]) for (let layer = 0; layer < 9; layer++) {
    const y = 0.03 + CHIP.R + layer * (2 * CHIP.R + 0.001), alongX = layer % 2 === 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 6; b++) {
      const o1 = (a - 0.5) * (L + 0.006), o2 = (b - 2.5) * D2;
      brickSlots.push({ p: alongX ? V3(ox + o1, y, o2) : V3(ox + o2 * 0.9, y, o1), alongX });
    }
  }
  brickSlots.sort((A, B) => A.p.y - B.p.y || A.p.x - B.p.x);
  const brickMesh = new THREE.InstancedMesh(stackGeometry(), stackMaterial('CN'), brickSlots.length);
  brickMesh.frustumCulled = false;
  bricksRoot.add(brickMesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bp = V3(), one = V3(1, 1, 1);
  function setBricks(u) {
    const n = brickSlots.length, shown = Math.min(n, Math.max(0, u * n));
    for (let i = 0; i < n; i++) {
      if (i >= shown) { brickMesh.setMatrixAt(i, zero); continue; }
      const s = brickSlots[i], fr = Math.min(1, shown - i);
      bq.setFromEuler(new THREE.Euler(s.alongX ? 0 : Math.PI / 2, 0, s.alongX ? Math.PI / 2 : 0));
      bp.copy(s.p); bp.y += 0.12 * (1 - fr) * (1 - fr);
      brickMesh.setMatrixAt(i, bm.compose(bp, bq, one));
    }
    brickMesh.instanceMatrix.needsUpdate = true;
  }
  setBricks(0);
  return { root, bricksRoot, KU, setBricks };
}

// ---------------------------------------------------------------- the set
export function makeSet(ctx = {}) {
  const root = new THREE.Group();
  root.name = 'set';
  const overlay = new THREE.Group();
  if (ctx.overlay) ctx.overlay.add(overlay);
  const room = buildRoom();
  root.add(room.root);
  const table = buildTable();
  root.add(table.top);
  const lamp = buildLamp();
  root.add(lamp.root);
  root.add(buildThrone());
  const cases = { CN: buildCase('CN'), US: buildCase('US') };
  root.add(cases.CN.root, cases.US.root);
  const board = buildBoard();
  root.add(board.root);
  const disp = buildDispenser();
  root.add(disp.root, disp.feeds);
  table.top.add(disp.chutes);
  const tower = buildTower();
  root.add(tower.root);
  const kiln = buildKiln();
  root.add(kiln.root, kiln.bricksRoot);
  root.updateMatrixWorld(true);

  // light shafts: the thin spotlight on each case, the beacon's two turning beams
  const spots = {};
  for (const s of ['CN', 'US']) {
    const p = CASES[s];
    const m = new THREE.Mesh(coneGeo(0.42, 0.03), shaftMaterial(ctx.engine, '#cfc8ba', 'spot'));
    m.position.set(p[0], FLOOR_Y, p[2]); m.scale.set(1, ROOM.CEIL_Y - FLOOR_Y - 0.3, 1);
    m.frustumCulled = false; overlay.add(m); spots[s] = m;
  }
  const beamGeo = new THREE.CylinderGeometry(0.6, 0.06, 1, 32, 6, true).translate(0, 0.5, 0);
  const beams = [0, 1].map(() => { const m = new THREE.Mesh(beamGeo, shaftMaterial(ctx.engine, '#ff2814', 'beam')); m.frustumCulled = false; m.scale.set(1, 7.5, 1); overlay.add(m); return m; });

  const jokerAnchor = { CN: cases.CN.anchor, US: cases.US.anchor };
  const pivot = V3(...LAMP_PIVOT);
  const eul = new THREE.Euler(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), tmp = V3(), tmp2 = V3(), tmp3 = V3();
  const diagA = V3(TABLE.LEGS[0][0], FLOOR_Y, TABLE.LEGS[0][1]), diagB = V3(TABLE.LEGS[3][0], FLOOR_Y, TABLE.LEGS[3][1]);
  const diagDir = diagB.clone().sub(diagA).normalize();
  const footLocal = TABLE.LEGS.map(([x, z], i) => V3(x, FLOOR_Y + (i === TABLE.SHIM_LEG ? TABLE_GAP : 0), z));
  const state = { swing: [0, 0] };
  const histCache = new WeakMap();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), q5 = new THREE.Quaternion(), one = V3(1, 1, 1), Yax = V3(0, 1, 0);

  // wobble < 0: the table rocks onto its short leg about the diagonal through feet 0 and 3 (touches at WOBBLE_TOUCH);
  // wobble > 0: the shim corner is lifted, the table hinging on its two US-side feet (1 and 3)
  const hingeUS = V3(TABLE.LEGS[1][0], FLOOR_Y, 0), zAxis = V3(0, 0, 1);
  function setWobble(w) {
    const pivotP = w < 0 ? diagA : hingeUS;
    Q.setFromAxisAngle(w < 0 ? diagDir : zAxis, -w);
    M.makeTranslation(-pivotP.x, -pivotP.y, -pivotP.z);
    M.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(Q));
    M.premultiply(new THREE.Matrix4().makeTranslation(pivotP.x, pivotP.y, pivotP.z));
    M.decompose(table.top.position, table.top.quaternion, tmp2);
    table.top.updateMatrixWorld(true);
  }

  // ---- the board: the flap queue per cell, a jam that holds flaps half-way and makes them chatter
  function rowData(hist, r, A) {
    let d = histCache.get(hist);
    if (!d || d.n !== hist.length || d.r !== r) {
      const glyphs = hist.map((e) => rowGlyphs(e.text, A));
      d = { n: hist.length, r, sched: Array.from({ length: BOARD_COLS }, (_, c) => cellSchedule(hist, glyphs, r, c, A)) };
      histCache.set(hist, d);
    }
    return d;
  }
  function updateBoard(bst, t) {
    const A = board.A, rows = bst?.rows ?? [];
    SU.uBoardLit.value = bst?.lit ?? 1;
    const jamK = Math.max(0, Math.min(1, bst?.jam?.k ?? 0)), jamRows = bst?.jam?.rows ?? [];
    const frame = Math.floor(t * 24 + 1e-6);
    for (let r = 0; r < BOARD.ROWS; r++) {
      const hist = rows[r];
      const d = hist?.length ? rowData(hist, r, A) : null;
      const bank = r === BOARD_BIG_ROW ? board.bankT : board.bankN, base = r === BOARD_BIG_ROW ? 0 : r * BOARD_COLS;
      const aG = bank.attG.array, aF = bank.attF.array;
      const jam = jamK > 0 && jamRows.includes(r) ? jamK : 0;
      for (let c = 0; c < BOARD_COLS; c++) {
        const i = base + c;
        let [a, b, ph] = d ? cellAt(d.sched[c], t, A) : [A.blank, A.blank, -1];
        if (jam > 0) {
          // a stuck mechanism: the upper flap hangs near 90 degrees and chatters, and lets go when the jam clears
          let ang0 = Math.PI;
          if (ph >= 0) ang0 = fallAngle(ph); else a = b;
          const amp = 0.17 + 0.18 * hashI(r, c, 77);
          const chatter = amp * (0.55 * Math.sin(t * TAU * (6 + 5 * hashI(r, c, 78)) + hashI(r, c, 79) * TAU) + 0.45 * (hashI(r * 20 + c, frame, 80) * 2 - 1));
          aG[i * 2] = b; aG[i * 2 + 1] = a; aF[i * 3] = a; aF[i * 3 + 1] = b;
          aF[i * 3 + 2] = ang0 + (Math.PI / 2 + chatter - ang0) * jam;
          continue;
        }
        if (ph < 0) { aG[i * 2] = aG[i * 2 + 1] = b; aF[i * 3 + 2] = -1; continue; }
        aG[i * 2] = b; aG[i * 2 + 1] = a;                // top: the revealed glyph; bottom: the old one until the flap lands
        aF[i * 3] = a; aF[i * 3 + 1] = b;                // flap front: old top half; back: new bottom half
        aF[i * 3 + 2] = fallAngle(ph);
      }
    }
    board.bankN.attG.needsUpdate = board.bankN.attF.needsUpdate = board.bankT.attG.needsUpdate = board.bankT.attF.needsUpdate = true;
    // the SERVER BUSY plate: drops to the end of its chains, then swings out
    const bz = bst?.busy, bu = bz ? Math.max(0, Math.min(1, bz.u ?? 0)) : 0;
    const bb = board.busy;
    bb.group.visible = bu > 0 && bz.row >= 0 && bz.row < BOARD.ROWS;
    if (bb.group.visible) {
      bb.group.position.set(BIN.x0 + 2 * PITCH.x + 0.525 + 0.02, BIN.y1 - rowTop(bz.row) - rowH(bz.row), 0.045);
      const dr = Math.min(1, bu / 0.12), drop = dr * dr;
      bb.hang.position.y = bb.CH * (1 - drop);
      bb.chains.scale.set(1, Math.max(0.05, drop), 1);
      const s = Math.max(0, bu - 0.12);
      // it can only swing out from the board face (it knocks against the flaps on the way back)
      bb.group.rotation.set(-0.55 * Math.exp(-4.5 * s) * Math.abs(Math.sin(13 * s)) * Math.min(1, s * 40), 0, 0.05 * Math.exp(-3 * s) * Math.sin(17 * s));
    }
  }

  // ---- the dispenser
  const flowTmp = { p: V3(), t: V3(), n: V3() };
  function updateFlow(side, rate, t, dent) {
    const fm = disp.flow[side], path = disp.flowPath[side], L = path.getLength(), N = Math.min(fm.instanceMatrix.count, Math.round(L / 0.03)), speed = 0.85;
    fm.count = N;
    const dentU = side === 'CN' && dent > 0.3 ? disp.bridgeStartU + (1 - disp.bridgeStartU) * (DENT.u - DENT.r * 0.8) : 2;
    for (let i = 0; i < N; i++) {
      const ph = (t * speed) / L + i / N, cyc = Math.floor(ph), u = ph - cyc;
      if (rate <= 0 || hashI(i, cyc, side === 'US' ? 1 : 2) >= rate || u > dentU) { fm.setMatrixAt(i, zeroM); continue; }
      path.getPointAt(u, flowTmp.p); path.getTangentAt(u, flowTmp.t);
      // lying flat on the trough floor, tilted with the slope, spinning slowly as it slides
      flowTmp.n.set(-flowTmp.t.x * flowTmp.t.y, 1 - flowTmp.t.y * flowTmp.t.y, -flowTmp.t.z * flowTmp.t.y).normalize();
      q4.setFromUnitVectors(Yax, flowTmp.n);
      q5.setFromAxisAngle(Yax, hashI(i, cyc, 3) * TAU + u * 9);
      q4.multiply(q5);
      flowTmp.p.addScaledVector(flowTmp.n, CHIP.H / 2 + 0.001 + 0.002 * Math.max(0, Math.sin(u * 60 + i)));
      const sc = Math.min(1, u / 0.015, (1 - u) / 0.02);
      fm.setMatrixAt(i, m4.compose(flowTmp.p, q4, tmp3.set(sc, sc, sc)));
    }
    fm.instanceMatrix.needsUpdate = true;
  }
  function updateDispenser(ds, t) {
    const show = ds?.show ?? true;
    const vis = show !== false && show !== 0;
    disp.root.visible = disp.feeds.visible = disp.chutes.visible = vis;
    if (!vis) return;
    const dent = Math.max(0, Math.min(1, ds?.dent ?? 0));
    disp.BRU.uDent.value = dent;
    disp.MU.uMark.value = Math.max(0, Math.min(1, (dent - 0.55) / 0.3));
    disp.DU.uBlink.value = Math.max(0, Math.min(1, ds?.blink ?? 0));
    updateFlow('US', ds?.flowUS ?? 0, t, 0);
    updateFlow('CN', ds?.flowCN ?? 0, t, dent);
    // the toll gate: drops in from the dark (0..0.45), the boom swings down across the bridge (0.45..0.8), the plate swings (0.8..1)
    const toll = Math.max(0, Math.min(1, ds?.toll ?? 0));
    disp.gate.visible = toll > 0;
    if (toll > 0) {
      const dq = Math.min(1, toll / 0.4);
      disp.gate.position.y = toll < 0.4 ? 1.3 * (1 - dq * dq) : 0.012 * Math.max(0, Math.sin(Math.PI * Math.min(1, (toll - 0.4) / 0.05)));
      const bq = Math.max(0, Math.min(1, (toll - 0.45) / 0.3));
      let boomA = -Math.PI / 2 * bq * bq;
      if (toll > 0.75) boomA = -Math.PI / 2 + 0.1 * Math.sin(Math.PI * Math.min(1, (toll - 0.75) / 0.06)) * Math.exp(-(toll - 0.75) * 30);
      disp.boom.rotation.x = boomA;
      const ps = Math.max(0, toll - 0.75);
      disp.plateHang.rotation.set(-boomA + 0.45 * Math.exp(-7 * ps) * Math.sin(38 * ps), 0, 0);
    }
    // the cart: rides the bridge (u 0 dispenser end .. 1 CN end); rolling back it rears up a little
    const cart = ds?.cart;
    disp.cart.visible = !!cart?.show;
    if (disp.cart.visible) {
      const u = Math.max(0, Math.min(1, cart.u ?? 0)), bc = disp.paths.CN;
      bc.getPointAt(u, tmp); bc.getTangentAt(u, tmp2);
      disp.cart.position.set(tmp.x, tmp.y + 0.013, tmp.z);
      disp.cart.rotation.set(0, Math.atan2(-tmp2.z, tmp2.x), Math.asin(Math.max(-1, Math.min(1, tmp2.y))));
      const back = cart.back ? 1 : 0;
      disp.cartBody.rotation.set(0, 0, back * 0.09);
      disp.cartBody.position.y = 0.015 + back * 0.004;
      const spin = -(u * bc.getLength()) / 0.013;
      for (const w of disp.wheels) w.rotation.z = spin;
      disp.cartChips.count = Math.round(Math.max(0, Math.min(1, cart.load ?? 1)) * disp.heap.length);
    }
  }

  const api = {
    root, overlay, tableTop: table.top, jokerAnchor,
    lampBulb(out = V3()) {
      eul.set(state.swing[0], 0, state.swing[1]);
      return out.set(0, -LAMP_CORD, 0).applyEuler(eul).add(pivot);
    },
    // the lamp's axis after the swing: unit vector from the shade down through the bulb
    lampDir(out = V3()) { eul.set(state.swing[0], 0, state.swing[1]); return out.set(0, -1, 0).applyEuler(eul); },
    legFoot(i, out = V3()) { return out.copy(footLocal[i]).applyMatrix4(table.top.matrixWorld); },
    legGap(i) { const v = tmp.copy(footLocal[i]).applyMatrix4(table.top.matrixWorld); return v.y - FLOOR_Y; },
    boardCell(r, c, out = V3()) { return board.cellWorld(r, c, out); },
    alarmPos(out = V3()) { board.beacon.getWorldPosition(out); out.y += 0.03; return out; },
    caseSpot(side, out = V3()) { const p = CASES[side]; return out.set(p[0], ROOM.CEIL_Y - 0.3, p[2]); },
    // a point along a chip chute (side 'US' = the gutter down the US edge, 'CN' = the bridge to the CN side), u 0..1 from the dispenser end
    chutePoint(side, u, out = V3()) { return out.copy(disp.paths[side].getPointAt(Math.min(1, Math.max(0, u)))).applyMatrix4(table.top.matrixWorld); },
    // the sea-crossing bridge: u 0 at the dispenser (US) end .. 1 at the CN end; DENT.u is where the seal crushes it
    bridgePoint(u, out = V3()) { return api.chutePoint('CN', u, out); },
    chuteEnd(side, out = V3()) { return api.chutePoint(side, 1, out); },
    kilnMouth(out = V3()) { return out.set(...KILN.mouth); },
    update(st = {}, t = 0) {
      // lamp
      const sw = st.lamp?.swing ?? [0, 0];
      state.swing[0] = sw[0] ?? 0; state.swing[1] = sw[1] ?? 0;
      lamp.swing.rotation.set(state.swing[0], 0, state.swing[1]);
      lamp.LU.uGlow.value = 1 - 0.88 * (st.lamp?.flicker ?? 0);
      lamp.LU.uOn.value = Math.max(0, Math.min(1, st.lamp?.on ?? 1));
      api.lampBulb(lamp.LU.uBulbW.value);
      api.lampDir(lamp.LU.uBulbAx.value).negate();
      lamp.updateChains(eul);
      // table (and the feet's contact shadows on the floor)
      setWobble(st.wobble ?? 0);
      for (let i = 0; i < 4; i++) { api.legFoot(i, tmp); room.feet[i].set(tmp.x, tmp.z, Math.max(0, tmp.y - FLOOR_Y), 0); }
      // cases
      for (const s of ['CN', 'US']) {
        const cs = st.cases?.[s] ?? {};
        cases[s].glass.U.uCrack.value = cs.crack ?? 0;
        cases[s].glass.U.uShatter.value = cs.shatter ?? 0;
        const light = cs.light ?? 0;
        (s === 'CN' ? SU.uSpotA : SU.uSpotB).value.w = light;
        spots[s].material.uniforms.uK.value = light * 0.11;
      }
      // board and beacon
      updateBoard(st.board, t);
      const on = st.alarm?.on ?? 0, ang = st.alarm?.angle ?? 0;
      board.AU.uAlarm.value.set(on, ang);
      const bp = api.alarmPos(tmp);
      beams.forEach((m, k) => {
        const a = ang + k * Math.PI;
        m.position.copy(bp);
        m.quaternion.setFromUnitVectors(V3(0, 1, 0), tmp2.set(Math.cos(a), -0.12, Math.sin(a)).normalize());
        m.material.uniforms.uK.value = on * 0.3;
      });
      // the dispenser, the chip tower, the kiln
      updateDispenser(st.dispenser, t);
      const towerShow = st.tower?.show ?? (st.dispenser?.show ?? true);
      tower.root.visible = towerShow !== false && towerShow !== 0;
      tower.evalFall(st.tower?.fall ?? 0);
      room.U.uTowerStand.value = tower.root.visible ? 1 - Math.min(1, (st.tower?.fall ?? 0) * 3) : 0;
      const ks = Math.max(0, Math.min(1, st.kiln?.show ?? 0)), kg = Math.max(0, Math.min(1, st.kiln?.glow ?? 0));
      kiln.root.visible = kiln.bricksRoot.visible = ks > 0;
      kiln.KU.uShow.value = ks; kiln.KU.uFire.value = kg * ks;
      room.U.uKilnShow.value = ks;
      SU.uKiln.value.set(KILN.mouth[0], KILN.mouth[1], KILN.mouth[2], kg * ks);
      kiln.setBricks(Math.max(0, Math.min(1, st.kiln?.bricks ?? 0)));
      root.updateMatrixWorld(true);
    },
  };
  api.update({}, 0);
  return api;
}
