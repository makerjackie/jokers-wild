// JOKERS WILD — props (module "props", see docs/INTERFACES.md).
// The things the kings own and the paper people they spend: the AUTO launch console with its cancel key,
// cigars and their brass ashtrays, heavy crystal goblets of dark wine, the two national seals hanging on
// chains from the dark, the cast-iron card presses, the paper card-makers (hinged like shadow puppets),
// the paper-doll chains along both coasts, and the cardboard Mistral king at the foot.
// Every frame is a pure function of (st.props, t). Materials: celMaterial / glowMaterial only.
//
// Frames. A console / press stands at its layout point on the tabletop; its local +z faces its king
// (CN consoles face -x, US consoles face +x). Cancel key, press lever and maker sit on the same world
// side for both camps (mirror-symmetric layout; local x is flipped with the camp sign `s`).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { celMaterial, glowMaterial, C } from './materials.js';
import { KINGS, KING, SEAT, SIDE_SIGN, SEA_HALF, EU, TABLE, FLOOR_Y, buttonPos, pressPos, makerPos, seatPos, seatYaw } from './layout.js';
import { Rng, clamp, smooth, lerp, onThrees, onTwos } from './util.js';
import { CHIP, chipGeometry, chipMaterial } from './chips.js';
import { drawLogo, BRAND, WORDS } from './logos.js';

// ------------------------------------------------------------------ helpers
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lin = (hex) => { const c = C(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const fl = (x) => { const s = (+x).toFixed(5); return s.includes('.') ? s : s + '.0'; };
// canvas textures are uploaded raw (NoColorSpace); tx() maps them like C() maps hex colours
const TX = 'vec3 tx(sampler2D s, vec2 uv){ return pow(texture(s, uv).rgb, vec3(1.22)); }\n';
const FADE = 'float mpp = length(fwidth(vWorld));';
// a cheap reflection of the war room for metals: black room, the lit tabletop below, the lamp above
const ENV = /* glsl */ `
  vec3 eV = normalize(cameraPosition - vWorld);
  vec3 eR = reflect(-eV, N);
  float envT = smoothstep(-0.05, -0.5, eR.y);
  float envL = smoothstep(0.86, 0.975, dot(eR, normalize(uLampPos - vWorld)));
  float env = 0.6 + 0.7 * envT + 1.3 * envL;
`;
const cel = (o) => celMaterial({ ...o, fsHead: TX + (o.fsHead ?? '') });
// thin paper is lit from whichever side faces the lamp (the far side dimmer: light shows through)
const PAPER_LIT = '{ vec3 pL = normalize(uLampPos - vWorld); if(dot(N, pL) < 0.0){ N = -N; col *= 0.62; } }';
const FONT_SERIF = 'Georgia, "Times New Roman", "Bodoni MT", serif';
const FONT_SANS = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const FONT_SONG = '"SimSun", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Microsoft YaHei", serif';
const FONT_HEI = '"Microsoft YaHei", "SimHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  if (o.clamp !== false) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  return t;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (parent) parent.add(m);
  return m;
}
function group(parent, name, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); if (parent) parent.add(g); return g; }
const noShadow = (o) => { o.traverse((m) => { if (m.isMesh) m.userData.noShadow = true; }); return o; };
const xf = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), s?.isVector3 ? s : V3(s, s, s));
  return g.applyMatrix4(m);
};
// merge several geometries into one non-indexed geometry (position, normal, uv only)
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
const softBox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
// lathe about +y: profile [[r, y], ...] walked bottom -> top on the outside; theta 0 = +z. Repeat a point
// to make a crease. o.warp(r, y, th) -> [r, y] bends a ring (notches); normals are then recomputed.
function lathe(prof, nu = 48, o = {}) {
  const np = prof.length, cols = nu + 1;
  const th0 = o.th0 ?? 0, th1 = o.th1 ?? TAU;
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
      const th = th0 + ((th1 - th0) * i) / nu, s = Math.sin(th), c = Math.cos(th), k = j * cols + i;
      let r = Math.max(0, prof[j][0]), y = prof[j][1];
      if (o.warp) [r, y] = o.warp(r, y, th, j);
      pos[k * 3] = r * s; pos[k * 3 + 1] = y; pos[k * 3 + 2] = r * c;
      nrm[k * 3] = nr * s; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nr * c;
      uv[k * 2] = i / nu; uv[k * 2 + 1] = acc[j] / (len || 1);
    }
  }
  for (let j = 0; j < np - 1; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (o.warp) {
    g.computeVertexNormals();
    const n = g.attributes.normal;
    if (Math.abs(th1 - th0 - TAU) < 1e-6) for (let j = 0; j < np; j++) {   // weld the seam
      const a = j * cols, b = j * cols + nu;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return g;
}
// extrude a closed 2D outline [[x, y], ...] (in the xy plane) by depth along z, centred on z = 0, with a bevel
function extrude(pts, depth, bevel = 0, seg = 2, holes = []) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 6 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}
// inset a convex-ish closed polygon by d (for bevelled extrusions that must keep their outer size)
function inset(pts, d) {
  const n = pts.length, out = [];
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1 * sg, e1[0] / l1 * sg], n2 = [-e2[1] / l2 * sg, e2[0] / l2 * sg];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
    const k = d / Math.max(0.35, (m[0] * n1[0] + m[1] * n1[1]) / ml);
    out.push([c[0] + m[0] / ml * k, c[1] + m[1] / ml * k]);
  }
  return out;
}
// a tube along a curve with an optional radius function r(u)
function tubeAlong(points, radius, segs = 24, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs, radius, radial, closed);
}
// sample a smooth closed outline: pts [[x, y, corner?], ...]; corners stay sharp, the rest is rounded
// with quadratic curves through the edge midpoints. Returns a dense polygon [[x, y], ...].
function outline(pts, steps = 6) {
  const n = pts.length, out = [];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    if (c[2]) { out.push([c[0], c[1]]); continue; }
    const a = p[2] ? [p[0], p[1]] : mid(p, c), b = q[2] ? [q[0], q[1]] : mid(c, q);
    for (let k = 0; k < steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
  }
  // drop near-duplicates
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
}
// trace a dense polygon into a canvas path (canvas coords = metres * k + offset, y flipped)
function tracePoly(g, poly, map) {
  g.beginPath();
  poly.forEach((p, i) => { const [x, y] = map(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.closePath();
}
// a flat cut-out: dense outline polygon -> thin slab (front at +t/2, back at -t/2, walls), uv = atlas map
function cutout(poly, t, uvOf) {
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], nor = [], uv = [];
  const push = (x, y, z, nx, ny, nz, u, v) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); };
  for (const [a, b, c] of tris) {
    for (const k of [a, b, c]) { const p = contour[k], w = uvOf(p.x, p.y); push(p.x, p.y, t / 2, 0, 0, 1, w[0], w[1]); }
    for (const k of [a, c, b]) { const p = contour[k], w = uvOf(p.x, p.y); push(p.x, p.y, -t / 2, 0, 0, -1, w[0], w[1]); }
  }
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    const p = contour[i], q = contour[(i + 1) % n];
    const ex = q.x - p.x, ey = q.y - p.y, l = Math.hypot(ex, ey) || 1, nx = ey / l, ny = -ex / l;
    const wp = uvOf(p.x, p.y), wq = uvOf(q.x, q.y);
    push(p.x, p.y, t / 2, nx, ny, 0, wp[0], wp[1]); push(p.x, p.y, -t / 2, nx, ny, 0, wp[0], wp[1]); push(q.x, q.y, t / 2, nx, ny, 0, wq[0], wq[1]);
    push(q.x, q.y, t / 2, nx, ny, 0, wq[0], wq[1]); push(p.x, p.y, -t / 2, nx, ny, 0, wp[0], wp[1]); push(q.x, q.y, -t / 2, nx, ny, 0, wq[0], wq[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// world matrix -> local matrix of obj under its parent
const _pm = new THREE.Matrix4();
function setWorld(obj, M) {
  if (obj.parent) { obj.parent.updateWorldMatrix(true, false); _pm.copy(obj.parent.matrixWorld).invert().multiply(M); } else _pm.copy(M);
  _pm.decompose(obj.position, obj.quaternion, obj.scale);
}
const fit = (g, str, x, y, maxW, size, font, weight = '700') => {
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(str).width;
  if (w > maxW) g.font = `${weight} ${Math.floor(size * maxW / w)}px ${font}`;
  g.fillText(str, x, y);
};
// shared material ids (see the table in materials.js)
const ID = { STEEL: 10, RED: 11, BRASS: 12, IRON: 13, WOOD: 14, LEAF: 15, BAND: 16, ASH: 17, GLASS: 18, WINE: 119, KEY: 11, PAPER: 40, BOARD: 41, DOLL: 42, PRINT: 31, LAMP: 140, DOME: 141, EMBER: 142, PIP: 143 };

// ------------------------------------------------------------------ shared materials
// worn steel / cast iron / brass: mottled, brushed, a few bright scratches, a room reflection, bevels worn bright
function metalMat(o = {}) {
  return cel({
    color: o.color ?? '#5f6166', id: o.id ?? ID.STEEL, gloss: o.gloss ?? 0.9, rim: o.rim ?? 1, uniforms: o.uniforms, side: o.side,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0005, 0.0022, mpp);
      float midd = 1.0 - smoothstep(0.002, 0.008, mpp);
      vec3 q = vLocal + ${fl(o.seed ?? 0)};
      ${ENV}
      vec3 base = col;
      float mott = fbm2(q.xz * ${fl(o.mottle ?? 24)} + q.y * 11.0);
      col *= mix(1.0, 0.84 + 0.3 * mott, midd * ${fl(o.mottleK ?? 1)});
      float br = vnoise(vec2(dot(q, vec3(1.0, 0.0, 0.3)) * 1500.0, dot(q, vec3(0.0, 1.0, 1.0)) * 30.0));
      col *= mix(1.0, 0.9 + 0.2 * br, fine * ${fl(o.brush ?? 1)});
      float scr = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(q.xz * 55.0 + q.y * 20.0) - 0.5));
      scr *= step(0.62, vnoise(q.xz * 9.0 + 3.1));
      col = mix(col, base * 1.7, scr * fine * ${fl(o.scratch ?? 0.5)});
      ${o.edgeWear ? `float ax = max(max(abs(vLocalN.x), abs(vLocalN.y)), abs(vLocalN.z)); col = mix(col, base * 1.45, smoothstep(0.05, 0.16, 1.0 - ax) * ${fl(o.edgeWear)});` : ''}
      col *= mix(1.0, env, ${fl(o.metal ?? 0.4)});
      specTh = ${fl(o.specTh ?? 0.93)};
      ${o.more ?? ''}
    `,
  });
}
const steelMat = (o = {}) => metalMat({ color: '#7a7d82', ...o });
const ironMat = (o = {}) => metalMat({ color: '#4c4c50', id: ID.IRON, gloss: 0.75, metal: 0.3, mottle: 60, scratch: 0.35, specTh: 0.94, ...o });
const brassMat = (o = {}) => metalMat({ color: '#c49c58', id: ID.BRASS, gloss: 1.0, metal: 0.5, mottle: 60, scratch: 0.25, specTh: 0.92, ...o });

// an engraved brass plate: white = brass, black = engraved (blackened) cuts; uv from the plate's local x/z
function plateCanvas(wm, hm, draw) {
  const W = 1024, H = Math.max(64, Math.round(1024 * hm / wm));
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000'; g.fillStyle = '#000';
  const m = H * 0.1; g.lineWidth = Math.max(3, H * 0.03); g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  draw(g, W, H);
  return tex(c);
}
function plateMat(t, wm, hm, o = {}) {
  return cel({
    color: o.color ?? '#c9a462', id: o.id ?? ID.BRASS, gloss: 1.0, uniforms: { uTex: { value: t } },
    pattern: /* glsl */ `
      ${FADE}
      ${ENV}
      float e = 1.0;
      if(vLocalN.y > 0.5){ vec2 pu = vec2(vLocal.x / ${fl(wm)} + 0.5, 0.5 - vLocal.z / ${fl(hm)}); e = texture(uTex, pu).r; }
      vec3 brass = col * (0.86 + 0.26 * fbm2(vLocal.xz * 420.0));
      col = mix(${lin('#130d08')}, brass, smoothstep(0.25, 0.75, e));
      col *= mix(1.0, env, 0.55 * e);
      gloss = e;
      specTh = 0.92;
    `,
  });
}

// ------------------------------------------------------------------ AUTO console (launch button + cancel key)
export const BTN = { W: 0.24, D: 0.15, H: 0.042, CH: 0.03, MX: -0.046, KX: 0.071, Z: -0.016, R: 0.034, COLH: 0.012, TRAVEL: 0.0095, KEY: 0.031, KTRAVEL: 0.0065, HOOD: 0.118, HOODH: 0.047 };
let _consoleShared = null;
function consoleShared() {
  if (_consoleShared) return _consoleShared;
  const { W, D, H, CH, R, COLH, HOOD, HOODH } = BTN;
  const b = 0.0028;
  const prof = [[-D / 2, 0], [D / 2, 0], [D / 2, H - CH], [D / 2 - CH, H], [-D / 2 + 0.006, H], [-D / 2, H - 0.006]];
  const plinth = extrude(inset(prof, b), W, b, 2).rotateY(-Math.PI / 2);
  const baseMat = steelMat({
    color: '#6c6f74', edgeWear: 0.8, seed: 1.3,
    more: /* glsl */ `
      if(vLocalN.y > 0.95){
        float dx = ${fl(W / 2)} - abs(vLocal.x), dz = min(vLocal.z + ${fl(D / 2)}, ${fl(D / 2 - CH)} - vLocal.z);
        float g1 = 1.0 - smoothstep(0.0005, 0.0012 + mpp * 0.8, abs(min(dx, dz) - 0.0085));
        col *= 1.0 - 0.6 * g1 * (1.0 - smoothstep(0.002, 0.006, mpp));
      }
      col *= 0.9 + 0.18 * smoothstep(-0.05, 0.06, vLocal.z);
    `,
  });
  // the collar the mushroom sits in, the lamp ring inside it
  const collar = lathe([[0.0385, 0], [0.05, 0], [0.0512, 0.0016], [0.0512, 0.0085], [0.0498, 0.0112], [0.046, COLH], [0.0418, COLH], [0.0395, 0.0102], [0.0385, 0.0085]], 56);
  const ring = lathe([[0.0346, 0.0035], [0.0388, 0.0035], [0.0392, 0.0062], [0.0386, 0.0088], [0.0346, 0.0088]], 48);
  const domeG = lathe([[0, -0.007], [R * 0.66, -0.007], [R * 0.66, 0.0045], [R * 0.985, 0.0052], [R, 0.0075], [R, 0.0118], [R * 0.965, 0.0158], [R * 0.86, 0.0206], [R * 0.66, 0.0242], [R * 0.36, 0.0263], [0, 0.0268]], 56);
  // the hood (safety cover): a rounded stamped-steel shell, open at the back, hinged at its top back edge;
  // in the hood's frame the hinge is the origin, the shell runs to +z (front) and down to -HOODH
  const t = 0.0032, hw = HOOD / 2, Rr = 0.034, zc = HOOD - Rr;
  const arc = (r, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI / 2; return [zc + r * Math.sin(a), -Rr + r * Math.cos(a)]; });
  const shellPoly = [[0, 0], ...arc(Rr), [HOOD, -HOODH], [HOOD - t, -HOODH], ...arc(Rr - t).reverse(), [0, -t]];
  const sidePoly = [[0, 0], ...arc(Rr), [HOOD, -HOODH], [0.012, -HOODH], [0, -HOODH + 0.012]];
  const hood = merge([
    extrude(shellPoly, HOOD - 2 * t, 0, 1).rotateY(-Math.PI / 2),
    extrude(sidePoly, t, 0.0008, 1).rotateY(-Math.PI / 2).translate(-hw + t / 2, 0, 0),
    extrude(sidePoly, t, 0.0008, 1).rotateY(-Math.PI / 2).translate(hw - t / 2, 0, 0),
    // the thumb lip at the bottom front edge
    xf(softBox(0.05, 0.0034, 0.016, 0.0015), 0, -HOODH + 0.0017, HOOD + 0.006),
    // a pressed stiffening rib along the top
    xf(softBox(0.012, 0.0024, zc - 0.012, 0.001), 0, 0.0004, zc / 2 + 0.006),
    // hinge knuckles (the hood's two)
    xf(new THREE.CylinderGeometry(0.0052, 0.0052, 0.03, 14).rotateZ(Math.PI / 2), -0.04, 0, 0),
    xf(new THREE.CylinderGeometry(0.0052, 0.0052, 0.03, 14).rotateZ(Math.PI / 2), 0.04, 0, 0),
  ]);
  const hoodMat = steelMat({
    color: '#7c8086', edgeWear: 0.6, seed: 7.7, metal: 0.5,
    more: /* glsl */ `
      // warning stripes stencilled on the front, worn through where thumbs lift it
      if(vLocalN.z > 0.8 && vLocal.z > ${fl(HOOD - 0.004)}){
        float st = step(0.5, fract((vLocal.x * 0.8 + vLocal.y) * 55.0));
        float worn = smoothstep(0.35, 0.55, vnoise(vLocal.xy * 700.0)) * (1.0 - 0.8 * smoothstep(0.01, 0.0, abs(vLocal.x)) * smoothstep(${fl(-HOODH + 0.02)}, ${fl(-HOODH)}, vLocal.y));
        col = mix(col, col * 0.18, st * worn);
      }
      vec2 rv = vec2(abs(vLocal.x) - 0.03, vLocal.z - 0.012);
      if(vLocalN.y > 0.5 && length(rv) < 0.0026) col = col * 1.6 + 0.03;
    `,
  });
  const knuckleMid = new THREE.CylinderGeometry(0.0052, 0.0052, 0.046, 14).rotateZ(Math.PI / 2);
  const pin = new THREE.CylinderGeometry(0.0021, 0.0021, HOOD - 0.004, 8).rotateZ(Math.PI / 2);
  const bracket = merge([xf(softBox(0.005, HOODH - 0.002, 0.012, 0.0015), -0.0255, 0, 0), xf(softBox(0.005, HOODH - 0.002, 0.012, 0.0015), 0.0255, 0, 0)]);
  // cancel key: a square bezel, the key cap, a pip lamp behind it
  const KB = 0.046, KI = 0.0345;
  const bezel = extrude(inset([[-KB / 2, -KB / 2], [KB / 2, -KB / 2], [KB / 2, KB / 2], [-KB / 2, KB / 2]], 0.0012), 0.0075, 0.0012, 2,
    [[[-KI / 2, -KI / 2], [-KI / 2, KI / 2], [KI / 2, KI / 2], [KI / 2, -KI / 2]]]).rotateX(-Math.PI / 2).translate(0, 0.00375, 0);
  const cap = softBox(BTN.KEY, 0.016, BTN.KEY, 0.0032, 3);
  const pipBezel = lathe([[0.0048, 0], [0.0088, 0], [0.0092, 0.0018], [0.0084, 0.0036], [0.0062, 0.0038], [0.0056, 0.003]], 24);
  const pip = new THREE.SphereGeometry(0.0058, 18, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.62, 1);
  const bolt = new THREE.CylinderGeometry(0.0056, 0.0056, 0.0032, 6).translate(0, 0.0016, 0);
  // the engraved plates on the chamfer
  const autoT = plateCanvas(0.086, 0.025, (g, Wc, Hc) => {
    g.font = `900 ${Math.round(Hc * 0.62)}px ${FONT_HEI}`;
    const a = g.measureText('托管').width;
    g.font = `800 ${Math.round(Hc * 0.6)}px ${FONT_SANS}`;
    const bw = g.measureText('AUTO').width * 1.12, gap = Hc * 0.3, x0 = Wc / 2 - (a + gap + bw) / 2;
    g.textAlign = 'left';
    g.font = `900 ${Math.round(Hc * 0.62)}px ${FONT_HEI}`; g.fillText('托管', x0, Hc * 0.54);
    g.font = `800 ${Math.round(Hc * 0.6)}px ${FONT_SANS}`;
    let x = x0 + a + gap; for (const ch of 'AUTO') { g.fillText(ch, x, Hc * 0.55); x += g.measureText(ch).width * 1.12; }
  });
  const cancelT = plateCanvas(0.056, 0.025, (g, Wc, Hc) => {
    g.font = `900 ${Math.round(Hc * 0.38)}px ${FONT_HEI}`; g.fillText('取消托管', Wc / 2, Hc * 0.37);
    g.font = `800 ${Math.round(Hc * 0.27)}px ${FONT_SANS}`; g.fillText('C A N C E L', Wc / 2, Hc * 0.72);
  });
  const plateA = softBox(0.086, 0.0018, 0.025, 0.0007), plateC = softBox(0.056, 0.0018, 0.025, 0.0007);
  const screw = new THREE.CylinderGeometry(0.0017, 0.0017, 0.0012, 10).translate(0, 0.0006, 0);
  return (_consoleShared = {
    plinth, baseMat, collar, collarMat: steelMat({ color: '#8a8d93', seed: 3.1, metal: 0.55 }), ring, domeG, hood, hoodMat, knuckleMid, pin, bracket,
    bezel, cap, pipBezel, pip, bolt, boltMat: steelMat({ color: '#6e7074', seed: 5.5, metal: 0.4 }),
    plateA, plateC, plateMatA: plateMat(autoT, 0.086, 0.025), plateMatC: plateMat(cancelT, 0.056, 0.025), screw, screwMat: brassMat({ color: '#a8854a' }),
  });
}
function buildConsole(id) {
  const k = KING[id], s = k.side === 'CN' ? 1 : -1;
  const S = consoleShared();
  const { D, H, CH, MX, KX, Z, COLH, HOOD, HOODH } = BTN;
  const root = group(null, 'console-' + id);
  root.position.set(...buttonPos(id));
  root.rotation.y = k.side === 'CN' ? -Math.PI / 2 : Math.PI / 2;
  mesh(S.plinth, S.baseMat, root);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(S.bolt, S.boltMat, root, x * (BTN.W / 2 - 0.012), H, z < 0 ? -D / 2 + 0.012 : D / 2 - CH - 0.009, 0, x * 0.4 + z * 0.2, 0);
  // the main button
  const bx = MX * s;
  mesh(S.collar, S.collarMat, root, bx, H, Z);
  const uLit = { value: 0 };
  mesh(S.ring, glowMaterial({
    color: '#ffffff', id: ID.LAMP, uniforms: { uLit },
    pattern: `col = mix(${lin('#2c0a06')}, ${lin('#ff4818')} * 2.4, uLit); col *= 0.75 + 0.5 * vUv.y;`,
  }), root, bx, H, Z).userData.noShadow = true;
  const dome = group(root, 'dome', bx, H + COLH, Z);
  mesh(S.domeG, cel({
    color: '#7e1a10', id: ID.RED, gloss: 1.0, uniforms: { uLit },
    pattern: /* glsl */ `
      ${ENV}
      float r = length(vLocal.xz);
      col *= mix(1.0, env, 0.4);
      col *= 0.92 + 0.12 * smoothstep(0.034, 0.02, r);
      specTh = 0.9;
      if(uLit > 0.002){
        vec3 hot = mix(${lin('#e8361a')}, ${lin('#ffb060')}, smoothstep(0.03, 0.004, r));
        emis = hot * uLit * 1.7;
        col *= 1.0 - 0.6 * uLit;
        if(uLit > 0.5) idOut = ${fl(ID.DOME)};
      }
    `,
  }), dome);
  // the hood, hinged at its top back edge
  const hingeZ = Z - HOOD / 2, hingeY = H + HOODH;
  const hood = group(root, 'hood', bx, hingeY, hingeZ);
  mesh(S.hood, S.hoodMat, hood);
  mesh(S.knuckleMid, S.collarMat, root, bx, hingeY, hingeZ);
  mesh(S.pin, S.boltMat, root, bx, hingeY, hingeZ);
  mesh(S.bracket, S.collarMat, root, bx, H + (HOODH - 0.002) / 2, hingeZ);
  // the cancel key
  const kx = KX * s;
  mesh(S.bezel, S.collarMat, root, kx, H, Z);
  const uDead = { value: 0 }, uPip = { value: 0 };
  const key = group(root, 'key', kx, H + 0.006, Z);
  mesh(S.cap, cel({
    color: '#d6ccb6', id: ID.KEY, gloss: 0.8, uniforms: { uDead },
    pattern: /* glsl */ `
      ${FADE}
      col = mix(${lin('#d8cfb9')}, ${lin('#6e6b66')}, uDead);
      gloss = mix(0.75, 0.0, uDead);
      if(vLocalN.y > 0.6) col *= 0.9 + 0.1 * smoothstep(0.0, 0.011, max(abs(vLocal.x), abs(vLocal.z)));
      col *= mix(1.0, 0.82 + 0.26 * vnoise(vLocal.xz * 700.0 + vLocal.y * 300.0), uDead * (1.0 - smoothstep(0.0008, 0.003, mpp)));
      specTh = 0.93;
    `,
  }), key, 0, 0.008, 0);
  mesh(S.pipBezel, S.collarMat, root, kx, H, Z - 0.035);
  mesh(S.pip, glowMaterial({ color: '#ffffff', id: ID.PIP, uniforms: { uPip }, pattern: `col = mix(${lin('#1d1b19')}, ${lin('#ffcf7a')} * 2.0, uPip);` }), root, kx, H + 0.0016, Z - 0.035).userData.noShadow = true;
  // engraved plates on the chamfer (text reads from the king's chair)
  const cz = D / 2 - CH / 2, cy = H - CH / 2, n = 0.0009 / Math.SQRT2;
  mesh(S.plateA, S.plateMatA, root, bx, cy + n, cz + n, Math.PI / 4, 0, 0);
  mesh(S.plateC, S.plateMatC, root, kx, cy + n, cz + n, Math.PI / 4, 0, 0);
  for (const [px, hw] of [[bx, 0.086 / 2], [kx, 0.056 / 2]]) for (const sx of [-1, 1]) {
    const sm = mesh(S.screw, S.screwMat, root, px + sx * (hw - 0.0045), cy + n * 2, cz + n * 2, Math.PI / 4, 0, 0);
    sm.updateMatrix();
  }
  const domeTop = V3(0, 0.0268, 0), tip = V3(0, -HOODH + 0.002, HOOD + 0.013);
  return {
    root, s,
    update(b = {}) {
      const cover = clamp(b.cover ?? 0), press = clamp(b.press ?? 0), lit = clamp(b.lit ?? 0), cancel = clamp(b.cancel ?? 0), dead = clamp(b.dead ?? 0);
      hood.rotation.x = -cover * 1.86;
      dome.position.y = H + COLH - press * BTN.TRAVEL;
      key.position.y = H + 0.006 - cancel * BTN.KTRAVEL;
      uLit.value = lit; uDead.value = dead; uPip.value = lit * (1 - dead);
    },
    buttonTop: (out) => { dome.updateWorldMatrix(true, false); return out.copy(domeTop).applyMatrix4(dome.matrixWorld); },
    cancelTop: (out) => { key.updateWorldMatrix(true, false); return out.set(0, 0.016, 0).applyMatrix4(key.matrixWorld); },
    coverTip: (out) => { hood.updateWorldMatrix(true, false); return out.copy(tip).applyMatrix4(hood.matrixWorld); },
  };
}

// ------------------------------------------------------------------ cigars, brass ashtrays, crystal goblets
// Held props: placed from api.handFrame(id, side) (origin palm centre, +y fingers, +z out of the palm,
// x = y cross z: the thumb side for a right hand). The numbers are exported so the director can tune them.
export const HOLD = {
  cigar: { at: [0, 0.03, 0.012], grip: 0.35 },     // crosses the fingers along hand x, burning end toward the little finger
  glass: { at: [0, 0.055, 0.035], grip: 0.034 },   // stem on the 'hold' fist's grip axis, bowl toward the thumb
  mouth: { inset: 0 },                              // hand 'M': the cigar's butt this far along the mouth frame's +y
  grip: [0, 0.055, 0.035],                          // the 'hold' fist closes round hand x through this point (seals, tags)
};
export const CIGAR = { L: 0.13, R: 0.0101, ASH: 0.034 };
export function ashtrayPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.03, 0, SEAT.Z[k.seat] - 0.38]; }
export function glassPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.02, 0, SEAT.Z[k.seat] + 0.07]; }
const TRAY = { R: 0.067, H: 0.0285, BOWL: 0.0078, NOTCH: 0.0185 };
let _smokeShared = null;
function smokeShared() {
  if (_smokeShared) return _smokeShared;
  const { L, R } = CIGAR;
  // the ashtray: heavy turned brass, two cigar notches cut across the rim (along local x)
  const trayProf = [[0, 0.0016], [0.05, 0.0016], [0.0515, 0], [0.058, 0], [0.0625, 0.0028], [0.0648, 0.012], [0.0665, 0.0225], [0.067, 0.026], [0.0655, 0.0283], [0.0625, 0.0285], [0.0505, 0.0285], [0.048, 0.0272], [0.0458, 0.022], [0.0435, 0.015], [0.038, 0.0102], [0.026, 0.0083], [0, 0.0078]];
  const notch = (th) => { let b = 0; for (const c of [Math.PI / 2, -Math.PI / 2]) { let d = Math.abs(th - c); d = Math.min(d, TAU - d); b = Math.max(b, 1 - smooth((d - 0.1) / 0.13)); } return b; };
  const tray = lathe(trayProf, 112, { warp: (r, y, th) => { const b = notch(th); return [r, y > TRAY.NOTCH ? lerp(y, TRAY.NOTCH + (y - TRAY.NOTCH) * 0.15, b) : y]; } });
  const trayMat = brassMat({
    color: '#b48e50', seed: 2.2, metal: 0.5,
    more: /* glsl */ `
      float rr = length(vLocal.xz);
      // the bowl: soot, grey ash flakes, a dark ring where cigars were stubbed
      if(rr < 0.046 && vLocal.y < 0.024 && vLocalN.y > 0.2){
        float a = fbm2(vLocal.xz * 260.0);
        col = mix(col * 0.3, ${lin('#77736c')} * (0.8 + 0.3 * a), smoothstep(0.5, 0.62, a) * 0.85);
        gloss = 0.2;
      }
      if(vLocal.y < 0.002) col *= 0.5;
    `,
  });
  // the cigar: rounded cap at the head (y = 0), cut flat at the foot (y = L); built along y, laid along +z
  const cp = [[0, 0], [0.0042, 0.0006], [0.0072, 0.0024], [0.0091, 0.0058], [R * 0.985, 0.011], [R, 0.02], [R, L - 0.004], [R * 0.995, L], [R * 0.995, L], [0, L]];
  const body = lathe(cp, 28).rotateX(Math.PI / 2);
  // the cigar band, printed: dark red, gold borders, a cream medallion with a crown
  const bc = canvas(512, 64), bg = bc.getContext('2d');
  bg.fillStyle = '#6e1612'; bg.fillRect(0, 0, 512, 64);
  bg.fillStyle = '#d8b25a'; bg.fillRect(0, 4, 512, 6); bg.fillRect(0, 54, 512, 6);
  for (let x = 0; x < 512; x += 12) { bg.beginPath(); bg.arc(x + 6, 16, 2.4, 0, TAU); bg.fill(); bg.beginPath(); bg.arc(x + 6, 48, 2.4, 0, TAU); bg.fill(); }
  bg.fillStyle = '#efe4c6'; bg.beginPath(); bg.ellipse(128, 32, 46, 24, 0, 0, TAU); bg.fill();
  bg.strokeStyle = '#d8b25a'; bg.lineWidth = 4; bg.stroke();
  bg.fillStyle = '#6e1612'; bg.beginPath(); bg.moveTo(104, 42); bg.lineTo(104, 24); bg.lineTo(114, 32); bg.lineTo(128, 18); bg.lineTo(142, 32); bg.lineTo(152, 24); bg.lineTo(152, 42); bg.closePath(); bg.fill();
  bg.fillStyle = '#d8b25a'; bg.font = `700 26px ${FONT_SERIF}`; bg.textAlign = 'center'; bg.textBaseline = 'middle';
  bg.fillText('T R I U M P H', 330, 33);
  const bandT = tex(bc, { clamp: false });
  bandT.wrapS = THREE.RepeatWrapping;
  const ashUnit = lathe([[0, 0], [R * 0.955, 0], [R * 0.965, 0.35], [R * 0.95, 0.7], [R * 0.88, 0.88], [R * 0.66, 0.97], [R * 0.3, 1.0], [0, 1.0]], 24).rotateX(Math.PI / 2);
  const ashMat = cel({
    color: '#9a958d', id: ID.ASH, gloss: 0.0, rim: 0.6,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0004, 0.0018, mpp);
      float z = vLocal.z, a = atan(vLocal.x, vLocal.y);
      float layers = vnoise(vec2(z * 900.0, a * 2.0));
      col *= 0.78 + 0.34 * mix(0.5, layers, fine);
      float crack = 1.0 - smoothstep(0.0, 0.06, abs(vnoise(vec2(a * 3.0, z * 260.0)) - 0.5));
      col *= 1.0 - 0.45 * crack * fine;
      col *= 0.9 + 0.1 * fbm2(vec2(a * 4.0, z * 120.0));
    `,
  });
  // the burning edge: a short ring of embers between the leaf and the ash, and the foot face
  const emberRing = new THREE.CylinderGeometry(R * 1.018, R * 1.01, 0.0056, 28, 1, true).rotateX(Math.PI / 2);
  const emberFace = new THREE.CircleGeometry(R * 0.99, 28);
  const glassProf = [[0, 0], [0.0375, 0], [0.0385, 0.0028], [0.0352, 0.0062], [0.022, 0.0088], [0.0125, 0.0108], [0.0074, 0.0148], [0.0062, 0.019], [0.0098, 0.0245], [0.0108, 0.0282], [0.0096, 0.0322], [0.0062, 0.037], [0.0056, 0.052], [0.0078, 0.0575], [0.0145, 0.0622], [0.026, 0.0688], [0.0368, 0.0792], [0.0418, 0.0918], [0.0428, 0.1045], [0.0408, 0.1205], [0.0372, 0.1355], [0.0358, 0.1418], [0.0347, 0.1425], [0.0337, 0.1412], [0.035, 0.1352], [0.0386, 0.1205], [0.0404, 0.1045], [0.0393, 0.0925], [0.0346, 0.0812], [0.0245, 0.0718], [0.0128, 0.0668], [0, 0.0658]];
  const goblet = lathe(glassProf, 64);
  const wineProf = [[0, 0.0662], [0.0124, 0.0672], [0.0241, 0.0721], [0.0342, 0.0815], [0.0389, 0.0926], [0.04, 0.1045], [0.0382, 0.1205], [0.0346, 0.1352], [0, 0.1352]];
  const wine = lathe(wineProf, 48);
  const glassMat = cel({
    color: '#e8eef0', id: ID.GLASS, gloss: 1.0, rim: 1.4, side: THREE.DoubleSide,
    pattern: /* glsl */ `
      vec3 gV = normalize(cameraPosition - vWorld);
      float fr = abs(dot(N, gV));
      float ang = atan(vLocal.x, vLocal.z);
      float y = vLocal.y;
      // cut crystal: sixteen flutes round the lower bowl and the knop
      float flute = abs(fract(ang * ${fl(16 / TAU)}) - 0.5);
      float cutZone = (y > 0.061 && y < 0.092) || (y > 0.0215 && y < 0.035) ? 1.0 : 0.0;
      float cutLine = cutZone * (1.0 - smoothstep(0.035, 0.07, 0.5 - flute));
      float streak = smoothstep(0.78, 0.98, vnoise(vec2(ang * 3.0 + 1.7, y * 6.0)));
      bool lip = y > 0.139;
      if(gl_FrontFacing){
        if(fr > 0.5 && cutLine < 0.5 && streak < 0.5 && !lip && y > 0.0122) discard;
        col = ${lin('#f2f5f4')};
        litBias += 0.35; specTh = 0.9; gloss = 1.0;
        col *= 0.75 + 0.35 * (1.0 - fr);
      } else {
        if(fr > 0.62 && !lip) discard;
        col = ${lin('#9aa6a6')};
        litBias += 0.15;
      }
      if(y < 0.0122){ col = ${lin('#cfd8d6')}; }
    `,
  });
  return (_smokeShared = { tray, trayMat, body, bandT, ashUnit, ashMat, emberRing, emberFace, goblet, wine, glassMat });
}
function cigarBodyMat(bandT) {
  const { L, R } = CIGAR;
  return cel({
    color: '#3f2618', id: ID.LEAF, gloss: 0.55, uniforms: { uBand: { value: bandT }, uLit: { value: 0 } },
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0004, 0.0016, mpp);
      float z = vLocal.z, a = atan(vLocal.x, vLocal.y);
      // wrapper leaf: tone patches, a spiral seam, fine diagonal veins
      col *= 0.82 + 0.3 * fbm2(vec2(a * 2.0, z * 60.0));
      float seam = abs(fract(a / 6.2832 + z / 0.046) - 0.5);
      col *= 1.0 - 0.35 * fine * (1.0 - smoothstep(0.004, 0.012, abs(seam - 0.45)));
      float vein = 1.0 - smoothstep(0.0, 0.05, abs(fract(a * 1.6 - z * 95.0 + vnoise(vec2(a, z * 30.0)) * 0.6) - 0.5));
      col *= 1.0 - 0.2 * vein * fine * step(0.55, vnoise(vec2(a * 5.0, z * 140.0)));
      specTh = 0.95;
      // the band near the head
      if(z > 0.019 && z < 0.033 && length(vLocal.xy) > ${fl(R * 0.9)}){
        vec2 bu = vec2(a / 6.2832 + 0.5, (z - 0.019) / 0.014);
        col = tx(uBand, bu);
        idOut = ${fl(ID.BAND)};
        gloss = 0.9; specTh = 0.9;
      }
      // the foot: cut tobacco face when unlit, charred when lit
      if(z > ${fl(L - 0.0005)} && length(vLocal.xy) < ${fl(R * 0.99)}){ col = ${lin('#2a1a10')} * (0.6 + 0.8 * vnoise(vLocal.xy * 3000.0)); gloss = 0.0; }
      if(uLit > 0.0) col *= 1.0 - 0.8 * uLit * smoothstep(${fl(L - 0.009)}, ${fl(L - 0.001)}, z);
    `,
  });
}
function buildCigar(id) {
  const S = smokeShared();
  const root = group(null, 'cigar-' + id);
  const uLit = cigarBodyMat(S.bandT);
  const body = mesh(S.body, uLit, root);
  void body;
  const ash = mesh(S.ashUnit, S.ashMat, root, 0, 0, CIGAR.L);
  const uGlow = { value: 0 }, uFace = { value: 0 }, uSeed = { value: (KINGS.findIndex((k) => k.id === id) + 1) * 1.37 };
  const emberMat = glowMaterial({
    color: '#ffffff', id: ID.EMBER, uniforms: { uGlow, uFace, uSeed },
    pattern: /* glsl */ `
      float n = vnoise(vec2(atan(vUv.x - 0.5, vUv.y - 0.5) * 3.0 + uSeed, uFxTime * 5.0 + vUv.y * 4.0));
      float n2 = vnoise(vUv * 14.0 + uFxTime * 3.0 + uSeed);
      vec3 hot = mix(${lin('#7a1406')}, ${lin('#ff7a22')}, smoothstep(0.25, 0.85, n * 0.6 + n2 * 0.4 + uGlow * 0.35));
      hot = mix(hot, ${lin('#ffd59a')}, smoothstep(0.75, 1.0, n2) * uGlow);
      col = hot * (1.0 + 1.9 * uGlow) * uFace;
    `,
  });
  const ring = mesh(S.emberRing, emberMat, root, 0, 0, CIGAR.L - 0.0022);
  const face = mesh(S.emberFace, emberMat, root, 0, 0, CIGAR.L + 0.0004);
  noShadow(ring); noShadow(face);
  // a piece of ash that falls (its own mesh, so it can leave the cigar)
  const fall = mesh(S.ashUnit, S.ashMat, null);
  fall.name = 'ash-fall-' + id;
  return { root, body, ash, ring, face, fall, mat: uLit, uGlow, uFace };
}
function buildTray(id) {
  const S = smokeShared();
  const root = group(null, 'ashtray-' + id);
  root.position.set(...ashtrayPos(id));
  // the notches point along the table edge so the cigar lies parallel to it
  root.rotation.y = Math.PI / 2 + (KING[id].side === 'CN' ? 0.25 : -0.25);
  mesh(S.tray, S.trayMat, root);
  return root;
}
function buildGlass(id) {
  const S = smokeShared();
  const root = group(null, 'glass-' + id);
  mesh(S.goblet, S.glassMat, root).userData.noShadow = true;
  const uLevel = { value: 0.1 };
  const wine = mesh(S.wine, cel({
    color: '#3a0710', id: ID.WINE, gloss: 1.0, side: THREE.DoubleSide, uniforms: { uLevel },
    pattern: /* glsl */ `
      if(vWorld.y > uLevel) discard;
      if(!gl_FrontFacing){
        N = vec3(0.0, 1.0, 0.0); NV = normalize(mat3(viewMatrix) * N);
        col = ${lin('#2a050c')}; gloss = 1.0; specTh = 0.985;
      } else {
        vec3 wV = normalize(cameraPosition - vWorld);
        float th = abs(dot(N, wV));
        col = mix(${lin('#7a1424')}, ${lin('#26040a')}, smoothstep(0.1, 0.8, th));
        litBias += 0.25; gloss = 0.6;
      }
    `,
  }), root);
  wine.userData.noShadow = true;
  return { root, wine, uLevel };
}

// ------------------------------------------------------------------ the national seals and their chains
// US: a round Western official seal (turned bronze body, knob handle). CN: a square seal with a carved beast
// knob. Faces are cut in relief, mirrored as on a real stamp. Each hangs from a chain of real links.
export const SEAL = { HIDE_Y: 4.3, TOP_Y: 7.2, HOME: { US: [0.62, 0, 0.6], CN: [-0.62, 0, 0.6] } };
const LINK = { a: 0.019, b: 0.0165, r: 0.0085 };
LINK.pitch = 2 * (LINK.a + LINK.b - LINK.r);
function linkGeometry() {
  const { a, b, r } = LINK, NS = 40, NR = 8;
  const L1 = 2 * a, L2 = Math.PI * b, total = 2 * L1 + 2 * L2;
  const at = (s) => {   // centre point, outward in-plane normal, at arc length s
    s = ((s % total) + total) % total;
    if (s < L1) return [b, -a + s, 1, 0];
    s -= L1; if (s < L2) { const t = s / b; return [Math.cos(t) * b, a + Math.sin(t) * b, Math.cos(t), Math.sin(t)]; }
    s -= L2; if (s < L1) return [-b, a - s, -1, 0];
    s -= L1; { const t = Math.PI + s / b; return [Math.cos(t) * b, -a + Math.sin(t) * b, Math.cos(t), Math.sin(t)]; }
  };
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < NS; i++) {
    const [px, py, nx, ny] = at((i / NS) * total);
    for (let j = 0; j < NR; j++) {
      const ph = (j / NR) * TAU, c = Math.cos(ph), s = Math.sin(ph);
      const ox = nx * c, oy = ny * c, oz = s;
      pos.push(px + ox * r, py + oy * r, oz * r); nor.push(ox, oy, oz);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const i1 = (i + 1) % NS, j1 = (j + 1) % NR;
    const A = i * NR + j, B = i1 * NR + j, Cc = i1 * NR + j1, Dd = i * NR + j1;
    idx.push(A, B, Cc, A, Cc, Dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  return g;
}
// face artwork: white = raised (prints), black = cut away. Drawn upright, then mirrored.
function sealFaceCanvas(kind) {
  const N = 1024, c = canvas(N, N), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.save(); g.translate(N, 0); g.scale(-1, 1);          // mirror: the face reads backwards, the print reads right
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = N / 2, cy = N / 2;
  if (kind === 'US') {
    g.lineWidth = 26; g.beginPath(); g.arc(cx, cy, N * 0.47, 0, TAU); g.stroke();
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * N * 0.425, cy + Math.sin(a) * N * 0.425, 9, 0, TAU); g.fill(); }
    g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, N * 0.395, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, N * 0.275, 0, TAU); g.stroke();
    // EMBARGO round the band, three times, separated by stars
    const word = 'EMBARGO', rr = N * 0.335;
    g.font = `700 74px ${FONT_SERIF}`;
    const star = (x, y, R, rot) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = rot + (k / 10) * TAU, q = k % 2 ? R * 0.42 : R; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); };
    for (let rep = 0; rep < 3; rep++) {
      const a0 = -Math.PI / 2 + (rep / 3) * TAU;
      star(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, 30, a0 + Math.PI / 2);
      const span = TAU / 3 - 0.42;
      for (let i = 0; i < word.length; i++) {
        const a = a0 + 0.21 + (i + 0.5) / word.length * span;
        g.save(); g.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.rotate(a + Math.PI / 2); g.fillText(word[i], 0, 4); g.restore();
      }
    }
    // centre: 禁运 heavy, a bar, EMBARGO small
    g.font = `900 236px ${FONT_SONG}`; g.lineWidth = 10; g.lineJoin = 'round';
    g.strokeText('禁运', cx, cy - 30); g.fillText('禁运', cx, cy - 30);
    g.fillRect(cx - 190, cy + 96, 380, 12);
    g.font = `700 64px ${FONT_SERIF}`; g.fillText('E M B A R G O', cx, cy + 156);
  } else {
    g.lineWidth = 46; g.strokeRect(40, 40, N - 80, N - 80);
    g.lineWidth = 10; g.strokeRect(96, 96, N - 192, N - 192);
    g.font = `900 360px ${FONT_SONG}`; g.lineWidth = 16; g.lineJoin = 'round';
    g.strokeText('拒', cx - 182, cy - 70); g.fillText('拒', cx - 182, cy - 70);
    g.strokeText('收', cx + 182, cy - 70); g.fillText('收', cx + 182, cy - 70);
    g.fillRect(150, cy + 168, N - 300, 12);
    g.font = `700 104px ${FONT_SERIF}`; fit(g, 'R E J E C T E D', cx, cy + 290, N - 300, 104, FONT_SERIF, '700');
  }
  g.restore();
  // wear: pits and chipped edges in the relief
  const img = g.getImageData(0, 0, N, N), d = img.data, rng = new Rng(kind === 'US' ? 71 : 93);
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(rng.range(0, N)), y = Math.floor(rng.range(0, N)), r = rng.range(1, 4.5), v = rng.next() < 0.7 ? 0 : 255;
    for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy > r * r) continue;
      const X = x + xx, Y = y + yy; if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
      const k = (Y * N + X) * 4; if (d[k] > 128 && v === 0) { d[k] = d[k + 1] = d[k + 2] = 60; }
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}
function sealFaceMat(t, half, round) {
  return metalMat({
    color: '#6a5640', id: ID.IRON, gloss: 0.8, metal: 0.4, seed: round ? 4.4 : 8.8, uniforms: { uFace: { value: t } },
    more: /* glsl */ `
      if(vLocalN.y < -0.9){
        vec2 fu = vec2(vLocal.x, vLocal.z) / ${fl(half * 2)} + 0.5;
        float h = texture(uFace, fu).r;
        // raised relief: polished, holding old ink; cut-away ground: black
        col = mix(${lin('#0c0a08')}, ${lin('#8a6a44')} * (0.8 + 0.3 * fbm2(fu * 40.0)), smoothstep(0.3, 0.7, h));
        col = mix(col, ${lin('#5a1a12')}, smoothstep(0.6, 0.9, h) * 0.35 * smoothstep(0.35, 0.7, vnoise(fu * 30.0)));
        shadeMul = mix(1.6, 4.5, h);
        gloss = h;
        litBias += 0.2;
        emis += col * mix(0.04, 0.16, h);        // the relief reads even before the practical light finds it
      }
      vec3 rV = normalize(cameraPosition - vWorld);
      emis += col * 0.6 * smoothstep(0.55, 0.9, 1.0 - abs(dot(N, rV)));
    `,
  });
}
// a crouching guardian beast, side profile (head toward +x), base on y = 0
const BEAST = [[0.15, 0, 1], [0.162, 0.016], [0.142, 0.03], [0.124, 0.062], [0.128, 0.1], [0.148, 0.128], [0.172, 0.146], [0.17, 0.176], [0.152, 0.19], [0.142, 0.212], [0.12, 0.228], [0.1, 0.214], [0.078, 0.206], [0.048, 0.19], [0.018, 0.166], [-0.04, 0.152], [-0.09, 0.158], [-0.128, 0.142], [-0.148, 0.11], [-0.147, 0.078], [-0.17, 0.098], [-0.19, 0.128], [-0.207, 0.122], [-0.2, 0.088], [-0.176, 0.058], [-0.156, 0.036], [-0.15, 0, 1]];
let _sealShared = null;
function sealShared() {
  if (_sealShared) return _sealShared;
  const R = 0.216;
  const usBody = lathe([[R, 0], [0.222, 0.004], [0.224, 0.03], [0.219, 0.036], [0.207, 0.04], [0.2, 0.05], [0.186, 0.06], [0.162, 0.075], [0.15, 0.09], [0.152, 0.1], [0.174, 0.11], [0.18, 0.118], [0.172, 0.13], [0.12, 0.15], [0.086, 0.17], [0.071, 0.19], [0.069, 0.214], [0.085, 0.224], [0.089, 0.234], [0.076, 0.245], [0.061, 0.26], [0.058, 0.29], [0.074, 0.31], [0.094, 0.34], [0.098, 0.37], [0.089, 0.4], [0.062, 0.42], [0.03, 0.43], [0, 0.432]], 72);
  const usFace = new THREE.CircleGeometry(R, 96).rotateX(Math.PI / 2);
  const usRing = new THREE.TorusGeometry(0.042, 0.012, 10, 28);
  const cnSlab = softBox(0.4, 0.12, 0.4, 0.01, 3).translate(0, 0.06, 0);
  const cnStep = softBox(0.31, 0.034, 0.31, 0.007, 2).translate(0, 0.12 + 0.017, 0);
  const cnFace = new THREE.PlaneGeometry(0.39, 0.39).rotateX(Math.PI / 2).translate(0, -0.0006, 0);
  const beast = extrude(inset(outline(BEAST, 5), 0.012), 0.15, 0.012, 3).translate(0, 0.154, 0);
  const cnRing = new THREE.TorusGeometry(0.04, 0.012, 10, 28);
  const usT = sealFaceCanvas('US'), cnT = sealFaceCanvas('CN');
  const bronze = metalMat({ color: '#6e5a40', id: ID.IRON, gloss: 0.9, metal: 0.45, seed: 2.9, mottle: 9, edgeWear: 0, more: `
    { vec3 rV = normalize(cameraPosition - vWorld); emis += col * 0.6 * smoothstep(0.55, 0.9, 1.0 - abs(dot(N, rV))); litBias += 0.12; }
    float rr = length(vLocal.xz);
    // turned rings catch the light; verdigris in the coves
    col *= 0.9 + 0.2 * step(0.5, fract(vLocal.y * 160.0)) * (1.0 - smoothstep(0.001, 0.004, mpp));
    col = mix(col, ${lin('#4f5a48')}, smoothstep(0.55, 0.8, fbm2(vec2(atan(vLocal.x, vLocal.z) * 3.0, vLocal.y * 40.0))) * 0.5);
  ` });
  const ironDark = metalMat({ color: '#5a524a', id: ID.IRON, gloss: 0.8, metal: 0.4, seed: 6.1, mottle: 10, edgeWear: 0.7, more: `
    { vec3 rV = normalize(cameraPosition - vWorld); emis += col * 0.6 * smoothstep(0.55, 0.9, 1.0 - abs(dot(N, rV))); litBias += 0.12; }
    // carved fur curls and scrolls on the beast
    if(vLocal.y > 0.15){
      vec2 p = vLocal.xy * 90.0;
      float sw = sin(p.x + 2.0 * sin(p.y * 0.7)) * sin(p.y * 1.1 + 1.5 * sin(p.x * 0.5));
      col *= 0.82 + 0.3 * smoothstep(-0.2, 0.6, sw) * (1.0 - smoothstep(0.0015, 0.005, mpp));
      // the eye
      vec2 e = vLocal.xy - vec2(0.135, 0.196);
      if(abs(vLocalN.z) > 0.7 && length(e * vec2(1.0, 1.6)) < 0.009) col *= 0.3;
    }
  ` });
  return (_sealShared = { usBody, usFace, usRing, cnSlab, cnStep, cnFace, beast, cnRing, faceUS: sealFaceMat(usT, R, true), faceCN: sealFaceMat(cnT, 0.195, false), bronze, ironDark, link: linkGeometry() });
}
function buildSeal(side) {
  const S = sealShared();
  const root = group(null, 'seal-' + side);
  const body = group(root, 'body');
  let hang;
  if (side === 'US') {
    mesh(S.usBody, S.bronze, body);
    mesh(S.usFace, S.faceUS, body);
    mesh(S.usRing, S.bronze, body, 0, 0.432 + 0.042, 0);
    hang = 0.432 + 0.042 * 2;
  } else {
    mesh(S.cnSlab, S.ironDark, body);
    mesh(S.cnStep, S.ironDark, body);
    mesh(S.cnFace, S.faceCN, body);
    mesh(S.beast, S.ironDark, body);
    mesh(S.cnRing, S.ironDark, body, 0, 0.345, 0, 0, Math.PI / 2, 0);
    hang = 0.345 + 0.04;
  }
  return { root, body, hang };
}
// lay instanced links along a list of points (seal end first), returns how many were written
const _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _lm = new THREE.Matrix4(), _lv = V3(), _lt = V3(), _ln = V3(), _lb = V3(), _ly = V3(0, 1, 0), _ls = V3(1, 1, 1);
function layChain(inst, start, pts, maxN, twist0 = 0) {
  const p = LINK.pitch;
  // arc-length along the polyline (points already dense enough)
  let n = 0, seg = 0, segPos = 0, s = p / 2;
  const segLen = [];
  for (let i = 0; i + 1 < pts.length; i++) segLen.push(pts[i].distanceTo(pts[i + 1]));
  const ref = V3(1, 0, 0);
  while (n < maxN) {
    while (seg < segLen.length && s > segPos + segLen[seg]) { segPos += segLen[seg]; seg++; }
    if (seg >= segLen.length) break;
    const u = (s - segPos) / (segLen[seg] || 1);
    _lv.copy(pts[seg]).lerp(pts[seg + 1], u);
    _lt.copy(pts[seg + 1]).sub(pts[seg]).normalize();       // link long axis
    _lq.setFromUnitVectors(_ly, _lt);
    // keep each link's plane near a fixed reference, alternate 90 degrees
    _ln.copy(ref).applyQuaternion(_lq);
    _lb.set(1, 0, 0).applyQuaternion(_lq);
    const ang = (n % 2 ? Math.PI / 2 : 0) + twist0;
    _lq2.setFromAxisAngle(_ly, ang);
    _lq.multiply(_lq2);
    _lm.compose(_lv, _lq, _ls);
    inst.setMatrixAt(start + n, _lm);
    n++; s += p;
  }
  return n;
}

// ------------------------------------------------------------------ card presses (cast iron)
// local +z: the slot side, facing the king; local +x*s: the lever side, toward the paper card-maker
export const PRESS = { SLOT: [0, 0.048, 0.077], HUB: [0.087, 0.165, -0.004], ARM: 0.17, UP: 0.95, DOWN: -0.36, TRAVEL: 0.03 };
let _pressShared = null;
function pressShared() {
  if (_pressShared) return _pressShared;
  const bedProf = [[-0.1, 0, 1], [0.1, 0, 1], [0.1, 0.008, 1], [0.095, 0.0115], [0.095, 0.019], [0.089, 0.0255], [0.081, 0.032, 1], [-0.081, 0.032, 1], [-0.089, 0.0255], [-0.095, 0.019], [-0.095, 0.0115], [-0.1, 0.008, 1]];
  const bed = extrude(outline(bedProf, 4), 0.17, 0.002, 2).rotateY(-Math.PI / 2);
  const block = softBox(0.124, 0.058, 0.15, 0.004).translate(0, 0.032 + 0.029, 0);
  const cheekOut = [[-0.076, 0.032, 1], [0.076, 0.032, 1], [0.071, 0.046], [0.052, 0.068], [0.041, 0.108], [0.038, 0.158], [0.046, 0.19], [0.043, 0.206, 1], [-0.043, 0.206, 1], [-0.046, 0.19], [-0.038, 0.158], [-0.041, 0.108], [-0.052, 0.068], [-0.071, 0.046]];
  const lancet = [[-0.017, 0.092, 1], [0.017, 0.092, 1], [0.019, 0.13], [0.0, 0.166, 1], [-0.019, 0.13]];
  const lancetPoly = outline(lancet, 5).reverse();
  const cheek = extrude(outline(cheekOut, 5), 0.013, 0.0018, 2, [lancetPoly]).rotateY(-Math.PI / 2);
  const panelOut = inset(outline(cheekOut, 5), 0.0075);
  const panel = extrude(panelOut, 0.017, 0.0014, 1, [inset(lancetPoly, -0.005)]).rotateY(-Math.PI / 2);
  const crown = merge([
    xf(softBox(0.176, 0.024, 0.1, 0.004), 0, 0.206 + 0.012, 0),
    xf(softBox(0.186, 0.008, 0.11, 0.003), 0, 0.206 + 0.024 + 0.002, 0),
  ]);
  // the hopper: a sheet-iron funnel (four-sided lathe, flat facets) with a rolled rim
  const hop = lathe([[0.034, 0.234], [0.092, 0.292], [0.0945, 0.2945], [0.0925, 0.2968], [0.089, 0.2945], [0.031, 0.2375]], 4, { th0: Math.PI / 4, th1: Math.PI / 4 + TAU }).toNonIndexed();
  hop.computeVertexNormals();
  const platen = softBox(0.112, 0.022, 0.1, 0.004);
  const rod = new THREE.CylinderGeometry(0.0072, 0.0072, 0.095, 14).translate(0, 0.011 + 0.0475, 0);
  const hub = merge([xf(new THREE.CylinderGeometry(0.017, 0.017, 0.02, 20).rotateZ(Math.PI / 2)), xf(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12).rotateZ(Math.PI / 2))]);
  // the lever arm along -z from the hub (in the lever's frame), a counterweight ball on a stub along +z
  const arm = merge([
    xf(lathe([[0, 0], [0.0062, 0], [0.0052, 0.06], [0.0044, 0.17], [0, 0.17]], 10).rotateX(-Math.PI / 2)),
    xf(new THREE.SphereGeometry(0.0065, 12, 8), 0, 0, -0.17),
    xf(lathe([[0, 0], [0.0055, 0], [0.0045, 0.05], [0, 0.05]], 10).rotateX(Math.PI / 2)),
  ]);
  const ball = new THREE.SphereGeometry(0.0165, 20, 14).translate(0, 0, 0.056);
  const grip = lathe([[0, 0], [0.0056, 0], [0.0056, 0.004], [0.0078, 0.012], [0.0084, 0.026], [0.0072, 0.038], [0.0062, 0.044], [0.0046, 0.047], [0, 0.048]], 14);
  const slotLip = extrude([[-0.059, 0.039], [0.059, 0.039], [0.059, 0.057], [-0.059, 0.057]], 0.003, 0.0008, 1, [[[-0.055, 0.0435], [-0.055, 0.0525], [0.055, 0.0525], [0.055, 0.0435]]]);
  const tray = merge([
    xf(new THREE.BoxGeometry(0.116, 0.0025, 0.056), 0, 0, 0),
    xf(new THREE.BoxGeometry(0.004, 0.008, 0.056), -0.06, 0.003, 0),
    xf(new THREE.BoxGeometry(0.004, 0.008, 0.056), 0.06, 0.003, 0),
  ]);
  const roller = new THREE.CylinderGeometry(0.0068, 0.0068, 0.112, 18).rotateZ(Math.PI / 2);
  const rollerCap = new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 16).rotateZ(Math.PI / 2);
  const oilCup = lathe([[0, 0], [0.004, 0], [0.004, 0.006], [0.0065, 0.009], [0.0065, 0.013], [0.003, 0.0145], [0, 0.015]], 12);
  const plateT = plateCanvas(0.066, 0.022, (g, Wc, Hc) => {
    g.font = `900 ${Math.round(Hc * 0.4)}px ${FONT_HEI}`; g.fillText('印 牌 机', Wc / 2, Hc * 0.37);
    g.font = `700 ${Math.round(Hc * 0.27)}px ${FONT_SERIF}`; g.fillText('C A R D   P R E S S', Wc / 2, Hc * 0.72);
  });
  const nplate = softBox(0.066, 0.0016, 0.022, 0.0006);
  const iron = ironMat({ color: '#434347', edgeWear: 1.0, seed: 3.3 });
  const ironP = ironMat({ color: '#46464a', edgeWear: 0.0, seed: 9.1, more: `
    // a gilt pinstripe round the raised panels (their bevel), worn in places
    float bev = smoothstep(0.25, 0.4, abs(vLocalN.y) + abs(vLocalN.z)) * step(abs(vLocalN.x), 0.93);
    col = mix(col, ${lin('#c8a050')} * (0.8 + 0.4 * vnoise(vLocal.yz * 300.0)), bev * step(0.3, vnoise(vLocal.yz * 90.0 + 2.0)));
    gloss = mix(gloss, 1.0, bev);
  ` });
  const wood = cel({ color: '#6a4228', id: ID.WOOD, gloss: 0.7, pattern: `${FADE} col *= 0.85 + 0.25 * step(0.5, fract(vLocal.y * 260.0 + vnoise(vLocal.xz * 400.0) * 1.5)) * (1.0 - smoothstep(0.0008, 0.003, mpp)); specTh = 0.95;` });
  const steelBright = steelMat({ color: '#7c7e82', metal: 0.7, seed: 1.9 });
  const hopMat = ironMat({ color: '#404044', side: THREE.DoubleSide, seed: 5.2, more: `if(!gl_FrontFacing){ col *= 0.35; } float rr = max(abs(vLocal.x), abs(vLocal.z)); col *= 1.0 + 0.6 * smoothstep(0.287, 0.293, vLocal.y);` });
  return (_pressShared = { bed, block, cheek, panel, crown, hop, platen, rod, hub, arm, ball, grip, slotLip, tray, roller, rollerCap, oilCup, nplate, nplateMat: plateMat(plateT, 0.066, 0.022), iron, ironP, wood, steelBright, hopMat, brass: brassMat({ color: '#c09a56' }) });
}
function buildPress(id) {
  const k = KING[id], s = k.side === 'CN' ? 1 : -1;
  const S = pressShared();
  const root = group(null, 'press-' + id);
  root.position.set(...pressPos(id));
  root.rotation.y = k.side === 'CN' ? -Math.PI / 2 : Math.PI / 2;
  mesh(S.bed, S.iron, root);
  mesh(S.block, S.iron, root);
  for (const x of [-1, 1]) { mesh(S.cheek, S.iron, root, x * 0.0695); mesh(S.panel, S.ironP, root, x * 0.0695); }
  mesh(S.crown, S.iron, root);
  mesh(S.hop, S.hopMat, root);
  for (const x of [-1, 1]) mesh(S.oilCup, S.brass, root, x * 0.074, 0.232, 0.04);
  mesh(S.nplate, S.nplateMat, root, 0, 0.218, 0.0508, Math.PI / 2, 0, 0);
  const platen = group(root, 'platen', 0, 0.135, 0);
  mesh(S.platen, S.iron, platen);
  mesh(S.rod, S.steelBright, platen);
  // slot, delivery tray, exit roller at the front
  mesh(S.slotLip, S.brass, root, 0, 0, 0.0765);
  mesh(S.tray, S.iron, root, 0, 0.0405, 0.104, 0.13, 0, 0);
  const roller = group(root, 'roller', 0, 0.064, 0.083);
  mesh(S.roller, S.steelBright, roller);
  for (const x of [-1, 1]) mesh(S.rollerCap, S.brass, root, x * 0.058, 0.064, 0.083);
  // the lever
  const [hx, hy, hz] = PRESS.HUB;
  mesh(S.hub, S.iron, root, hx * s, hy, hz);
  const lever = group(root, 'lever', (hx + 0.014) * s, hy, hz);
  mesh(S.arm, S.iron, lever);
  mesh(S.ball, S.iron, lever);
  const grip = mesh(S.grip, S.wood, lever, 0, 0, -PRESS.ARM, 0, 0, -s * Math.PI / 2);
  void grip;
  const gripPt = V3(s * 0.026, 0, -PRESS.ARM), slot = V3(...PRESS.SLOT);
  // a black void inside the slot
  mesh(new THREE.PlaneGeometry(0.11, 0.009), cel({ color: '#050505', id: ID.IRON, gloss: 0 }), root, 0, 0.048, 0.0758);
  const update = (p = {}) => {
    const lv = clamp(p.lever ?? 0), sl = clamp(p.slide ?? 0);
    lever.rotation.x = lerp(PRESS.UP, PRESS.DOWN, smooth(lv));
    platen.position.y = 0.135 - smooth(clamp((lv - 0.25) / 0.75)) * PRESS.TRAVEL;
    roller.rotation.x = -sl * 4 * Math.PI;
  };
  update();
  return {
    root, s, update,
    lever: (out) => { lever.updateWorldMatrix(true, false); return out.copy(gripPt).applyMatrix4(lever.matrixWorld); },
    out: (out) => { root.updateWorldMatrix(true, false); return out.copy(slot).applyMatrix4(root.matrixWorld); },
    frame: (out) => { root.updateWorldMatrix(true, false); out.copy(root.matrixWorld); const p = slot.clone().applyMatrix4(root.matrixWorld); out.setPosition(p); return out; },
  };
}

// ------------------------------------------------------------------ the paper card-makers
// A flat paper figure in profile, cut like a shadow puppet and joined with brass split pins: head (with a
// folded printer's cap), torso (with the long apron), two arms, two legs. ~0.22 m tall, printed in engraving
// ink. Local frame: the paper plane is xy, the print faces +z, the figure faces +x (face = -1 mirrors it).
const MK = {
  PAPER: '#ede7d9', INK: '#16110c', T: 0.0005,
  NECK: [0.0005, 0.1675], SHOULDER: [0.0008, 0.1585], HIP: [0.0, 0.1045],
  HEAD: [[-0.0147, 0.1932, 1], [-0.0139, 0.2052, 1], [-0.0118, 0.2086, 1], [0.0072, 0.2098, 1], [0.0098, 0.2068, 1], [0.0128, 0.1952, 1], [0.0114, 0.1942], [0.0126, 0.1912], [0.0108, 0.1886], [0.0127, 0.1862], [0.0176, 0.1806, 1], [0.0136, 0.1792], [0.0129, 0.1777], [0.0114, 0.1767, 1], [0.0123, 0.1756], [0.0106, 0.1741], [0.0119, 0.1719], [0.0072, 0.1702], [0.0042, 0.1688], [0.0042, 0.1625, 1], [-0.0052, 0.1625, 1], [-0.0058, 0.1735], [-0.0108, 0.1818], [-0.0128, 0.1882]],
  TORSO: [[-0.004, 0.1726], [-0.0108, 0.1628], [-0.0136, 0.1505], [-0.0121, 0.1305], [-0.0106, 0.1125], [-0.0136, 0.1005], [-0.0118, 0.0915, 1], [-0.0038, 0.0905, 1], [-0.0032, 0.0605], [0.0002, 0.0558, 1], [0.0192, 0.0558, 1], [0.0194, 0.0805], [0.0172, 0.1005], [0.0162, 0.1125], [0.0172, 0.1305], [0.0182, 0.1425], [0.0152, 0.1552], [0.0092, 0.1632], [0.0058, 0.1682], [0.0046, 0.1742, 1]],
  ARM: [[-0.0062, 0.1612], [0.0002, 0.1658], [0.0068, 0.1612], [0.0062, 0.1452], [0.0064, 0.1322, 1], [0.0056, 0.1272, 1], [0.0062, 0.1122], [0.0069, 0.0962], [0.0091, 0.0902], [0.0084, 0.0832], [0.0046, 0.0772], [0.0004, 0.0788], [-0.0016, 0.0862], [-0.0006, 0.0962], [-0.0026, 0.1122], [-0.0046, 0.1272, 1], [-0.0059, 0.1322, 1], [-0.0056, 0.1452]],
  LEG: [[-0.0096, 0.1085], [0.0072, 0.1092], [0.0076, 0.0852], [0.0061, 0.0582], [0.0052, 0.0302], [0.0042, 0.0102], [0.0106, 0.0078], [0.0176, 0.0032], [0.0178, 0.0, 1], [-0.0062, 0.0, 1], [-0.0066, 0.0042], [-0.0036, 0.0102], [-0.0068, 0.0352], [-0.0062, 0.0502], [-0.0051, 0.0582], [-0.0086, 0.0852]],
};
let _makerShared = null;
const _fp = new THREE.Vector3();
function makerShared() {
  if (_makerShared) return _makerShared;
  const INK = MK.INK;
  // one canvas per part; k = pixels per metre
  const part = (pts, k, draw, steps = 5) => {
    const poly = outline(pts, steps);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = 0.0015; x0 -= m; y0 -= m; x1 += m; y1 += m;
    const W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
    const c = canvas(W, H), g = c.getContext('2d');
    const M = (x, y) => [(x - x0) * k, (y1 - y) * k];
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.save(); tracePoly(g, poly, M); g.clip();
    g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
    const L = (w, ...p) => { g.lineWidth = w * k; g.beginPath(); p.forEach(([x, y], i) => { const [a, b] = M(x, y); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); };
    const Q = (w, a, cpt, b) => { g.lineWidth = w * k; g.beginPath(); g.moveTo(...M(...a)); g.quadraticCurveTo(...M(...cpt), ...M(...b)); g.stroke(); };
    // engraved hatching inside a region: parallel strokes at angle ang, spacing sp (m), clipped by fn(x,y)
    const hatch = (fn, ang, sp, w, bx0 = x0, bx1 = x1, by0 = y0, by1 = y1, wob = 0.15) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.hypot(bx1 - bx0, by1 - by0), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      g.lineWidth = w * k;
      for (let d = -R; d <= R; d += sp) {
        g.beginPath(); let on = false;
        for (let s = -R; s <= R; s += 0.0004) {
          const x = cx + ca * s - sa * d, y = cy + sa * s + ca * d + Math.sin(s * 900 + d * 300) * sp * wob * 0.3;
          if (x < bx0 || x > bx1 || y < by0 || y > by1 || !fn(x, y)) { if (on) g.stroke(); on = false; g.beginPath(); continue; }
          const [a, b] = M(x, y); if (!on) { g.moveTo(a, b); on = true; } else g.lineTo(a, b);
        }
        if (on) g.stroke();
      }
    };
    draw({ g, L, Q, hatch, M, k, poly });
    g.restore();
    g.lineWidth = 0.00045 * k; g.strokeStyle = INK; tracePoly(g, poly, M); g.stroke();
    return { poly, tex: tex(c), uvOf: (x, y) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)] };
  };
  const inPoly = (poly) => (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const head = part(MK.HEAD, 30000, ({ g, L, Q, hatch, M, k }) => {
    // the folded printer's cap: band, side fold, newsprint lines
    L(0.0004, [-0.0145, 0.1988], [0.0127, 0.1998]);
    L(0.00022, [-0.0132, 0.2004], [-0.0024, 0.2088]); L(0.00022, [-0.0024, 0.2088], [0.0096, 0.2008]);
    g.globalAlpha = 0.5;
    for (let y = 0.2011; y < 0.2085; y += 0.00105) for (let x = -0.0125; x < 0.0092; x += 0.0026) { const w = 0.0007 + ((x * 7919 + y * 104729) % 1 + 1) % 1 * 0.0015; L(0.0002, [x, y], [x + w, y]); }
    g.globalAlpha = 1;
    // hair under the cap, hatched; the sideburn
    hatch((x, y) => x < -0.004 && y > 0.1805 && y < 0.1935 && Math.hypot(x + 0.004, y - 0.186) > 0.0045, 1.2, 0.00055, 0.0002);
    // eye: almond, heavy upper lid, pupil looking ahead; the brow
    Q(0.00042, [0.0058, 0.1886], [0.0078, 0.1902], [0.0099, 0.1884]);
    Q(0.00022, [0.0058, 0.1886], [0.0079, 0.1874], [0.0099, 0.1884]);
    g.beginPath(); g.arc(...M(0.0091, 0.1885), 0.00062 * k, 0, TAU); g.fill();
    Q(0.0006, [0.0046, 0.1906], [0.0082, 0.1924], [0.0114, 0.1912]);
    // ear, jaw, nostril, the set mouth, the cheek hollow
    Q(0.00035, [-0.0012, 0.1868], [-0.0052, 0.1835], [-0.0012, 0.1792]);
    Q(0.0002, [-0.0021, 0.1852], [-0.0036, 0.1835], [-0.0021, 0.1812]);
    Q(0.0003, [-0.0018, 0.1772], [0.003, 0.1718], [0.0094, 0.1712]);
    Q(0.0003, [0.0118, 0.1802], [0.0104, 0.1794], [0.0112, 0.1786]);
    Q(0.00032, [0.0118, 0.1767], [0.0102, 0.1764], [0.0088, 0.1757]);
    for (let i = 0; i < 4; i++) L(0.00012, [0.0018 + i * 0.0011, 0.1768 + i * 0.0003], [0.0034 + i * 0.0011, 0.1806 + i * 0.0002]);
    hatch((x, y) => x < 0.0035 && y < 0.1745 && y > 0.163, 0.6, 0.0006, 0.0002);
    L(0.00025, [0.0042, 0.1688], [0.0058, 0.1712]);
  });
  const torso = part(MK.TORSO, 12000, ({ g, L, Q, hatch, M, k }) => {
    const apron = (x, y) => y < 0.1385 && x > -0.0032 + (0.1385 - y) * 0.0 && (y > 0.0558) && x > (y > 0.1125 ? 0.0045 - (0.1385 - y) * 0.0 : -0.0032);
    // shirt: fine pinstripes + cross hatching (darker than the apron)
    hatch((x, y) => !apron(x, y), Math.PI / 2, 0.0011, 0.00028);
    hatch((x, y) => !apron(x, y) && (x < -0.004 || y > 0.15), 0.5, 0.0009, 0.00022);
    // the apron: bib, strap over the shoulder, string at the waist, folds, ink stains
    L(0.0005, [0.0045, 0.1385], [0.0175, 0.1385]); L(0.0005, [0.0045, 0.1385], [0.0045, 0.1125]);
    L(0.0006, [0.0045, 0.1385], [-0.0035, 0.1612]);
    L(0.0005, [-0.0108, 0.1125], [0.0164, 0.1125]); L(0.0003, [-0.0108, 0.1105], [0.0164, 0.1105]);
    Q(0.0005, [-0.0032, 0.1118], [-0.0058, 0.1065], [-0.0049, 0.0975]);
    L(0.0005, [-0.0032, 0.1105], [-0.0032, 0.0605]);
    for (const x of [0.0042, 0.0098, 0.0152]) Q(0.00022, [x, 0.108], [x + 0.0012, 0.085], [x - 0.0004, 0.059]);
    for (const [x, y, r] of [[0.0122, 0.0915, 0.0013], [0.0148, 0.0882, 0.0007], [0.0062, 0.0745, 0.0009], [0.0105, 0.1262, 0.0008]]) { g.beginPath(); g.ellipse(...M(x, y), r * k, r * 0.7 * k, 0.6, 0, TAU); g.fill(); }
    hatch((x, y) => apron(x, y) && x > 0.0158, Math.PI / 2, 0.0009, 0.00018);
    hatch((x, y) => apron(x, y) && y < 0.062, 0.0, 0.0007, 0.00016);
  });
  const arm = part(MK.ARM, 12000, ({ L, Q, hatch }) => {
    hatch((x, y) => y > 0.1322, Math.PI / 2 + 0.1, 0.001, 0.00028);
    hatch((x, y) => y > 0.138 && x < 0.0, 0.6, 0.0008, 0.0002);
    L(0.0005, [-0.0059, 0.1322], [0.0064, 0.1322]); L(0.0003, [-0.0057, 0.1297], [0.006, 0.1297]); L(0.0005, [-0.0046, 0.1272], [0.0056, 0.1272]);
    Q(0.00025, [-0.0044, 0.152], [-0.001, 0.146], [0.002, 0.1405]);
    Q(0.00025, [-0.0016, 0.116], [0.0004, 0.106], [0.0004, 0.098]);
    hatch((x, y) => y < 0.124 && y > 0.098 && x < -0.0006, 0.4, 0.0008, 0.00016);
    Q(0.0003, [0.0068, 0.0952], [0.0036, 0.0945], [-0.0004, 0.0958]);
    for (const [a, b] of [[[0.0072, 0.0892], [0.0042, 0.0798]], [[0.0058, 0.0902], [0.0026, 0.0802]], [[0.0042, 0.0908], [0.001, 0.0818]]]) L(0.00022, a, b);
  });
  const leg = part(MK.LEG, 12000, ({ g, L, Q, hatch, M, k }) => {
    hatch((x, y) => y > 0.012, Math.PI / 2 + 0.06, 0.0009, 0.0003);
    hatch((x, y) => y > 0.012 && (x < -0.002 || y > 0.09), 0.55, 0.0008, 0.00022);
    Q(0.0003, [0.004, 0.106], [0.002, 0.07], [0.0028, 0.016]);
    L(0.0005, [-0.0042, 0.0125], [0.0052, 0.0125]);
    // the shoe: solid black with one highlight
    g.beginPath(); tracePoly(g, outline([[-0.0075, -0.001, 1], [0.019, -0.001, 1], [0.0178, 0.0045], [0.0108, 0.0088], [0.0042, 0.011, 1], [-0.0045, 0.011, 1], [-0.0075, 0.0045]], 4), M); g.fill();
    g.strokeStyle = '#ffffff'; Q(0.00035, [0.006, 0.0082], [0.012, 0.0072], [0.0158, 0.0042]); g.strokeStyle = MK.INK;
  });
  const pt = (o) => cutout(o.poly, MK.T, o.uvOf);
  const mat = (o, tone) => cel({
    color: MK.PAPER, id: ID.PAPER, gloss: 0.12, rim: 0.7, uniforms: { uTex: { value: o.tex }, uTone: { value: tone } },
    pattern: /* glsl */ `
      ${FADE}
      if(abs(vLocalN.z) > 0.5){ col *= tx(uTex, vUv) * uTone; }
      else col *= 0.9;
      ${PAPER_LIT}
      col *= 0.97 + 0.05 * vnoise(vLocal.xy * 2600.0) * (1.0 - smoothstep(0.0003, 0.0012, mpp));
      litBias += 0.18;
    `,
  });
  const pin = lathe([[0, 0], [0.0024, 0], [0.0024, 0.0002], [0.0018, 0.0006], [0, 0.0007]], 16).rotateX(Math.PI / 2);
  // the shovel, in the hand's frame: grip at the origin, the shaft forward-down, the blade at its end
  const SH = [[-0.006, 0.004, 1], [0.004, 0.004, 1], [0.004, 0.0015, 1], [0.05, -0.012, 1], [0.052, -0.008, 1], [0.084, -0.006, 1], [0.088, -0.014, 1], [0.086, -0.026, 1], [0.058, -0.03, 1], [0.05, -0.017, 1], [0.003, -0.0015, 1], [-0.006, -0.0015, 1]];
  const shovelPart = part(SH, 12000, ({ L, hatch }) => {
    hatch((x, y) => x > 0.052, 0.3, 0.0008, 0.00022);
    L(0.0004, [0.054, -0.016], [0.084, -0.012]);
  }, 2);
  const shovelGeo = cutout(shovelPart.poly, MK.T, shovelPart.uvOf);
  return (_makerShared = {
    head: pt(head), torso: pt(torso), arm: pt(arm), leg: pt(leg),
    mHead: mat(head, 1), mTorso: mat(torso, 1), mArmN: mat(arm, 1), mArmF: mat(arm, 0.72), mLegN: mat(leg, 0.95), mLegF: mat(leg, 0.7),
    pin, pinMat: brassMat({ color: '#d8b064', scratch: 0, mottleK: 0.3, metal: 0.3 }),
    shovel: shovelGeo, mShovel: mat(shovelPart, 0.95), BLADE: [0.07, -0.016], chipMat: chipMaterial('US'),
  });
}
function buildMaker(id) {
  const S = makerShared();
  const root = group(null, 'maker-' + id);
  root.position.set(...makerPos(id));
  const fig = group(root, 'figure');           // mirrored for face = -1
  const piv = (parent, name, p, z) => group(parent, name, p[0], p[1], z);
  const add = (geo, m, parent, p, z) => mesh(geo, m, parent, -p[0], -p[1], 0);
  const torsoG = piv(fig, 'torso', MK.HIP, 0);
  add(S.torso, S.mTorso, torsoG, MK.HIP);
  const legN = piv(fig, 'legN', MK.HIP, -0.0008); add(S.leg, S.mLegN, legN, MK.HIP);
  const legF = piv(fig, 'legF', MK.HIP, -0.0016); add(S.leg, S.mLegF, legF, MK.HIP);
  const rel = (p) => [p[0] - MK.HIP[0], p[1] - MK.HIP[1]];
  const headG = piv(torsoG, 'head', rel(MK.NECK), 0.0007); add(S.head, S.mHead, headG, MK.NECK);
  const armN = piv(torsoG, 'armN', rel(MK.SHOULDER), 0.0013); add(S.arm, S.mArmN, armN, MK.SHOULDER);
  const armF = piv(torsoG, 'armF', rel(MK.SHOULDER), -0.0024); add(S.arm, S.mArmF, armF, MK.SHOULDER);
  // brass split pins on both faces at the near joints
  for (const [g, z] of [[armN, 0.0006], [headG, 0.0005], [legN, 0.0006]]) { mesh(S.pin, S.pinMat, g, 0, 0, z); }
  mesh(S.pin, S.pinMat, armF, 0, 0, -0.0006);
  // a paper shovel (a cut-out like him) carried in the near hand, a few real chips on its blade
  const shovel = group(armN, 'shovel', 0.0037, 0.081 - MK.SHOULDER[1], 0.0009);
  mesh(S.shovel, S.mShovel, shovel);
  const shovelChips = [];
  for (let i = 0; i < 6; i++) { const c = mesh(chipGeometry(12), S.chipMat, null); c.scale.setScalar(0.55); shovelChips.push(c); }
  fig.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  const hand = V3(0.0045 - MK.SHOULDER[0], 0.081 - MK.SHOULDER[1], 0);
  return {
    root, fig, torsoG, headG, armN, armF, legN, legF,
    update(m = {}) {
      const show = m.show ?? 1;
      root.visible = show > 0.001;
      const p = m.pose ?? {};
      const face = m.face ?? (KING[id].side === 'CN' ? -1 : 1);
      if (m.at) root.position.set(...m.at); else root.position.set(...makerPos(id));
      root.rotation.set(-(1 - smooth(show)) * Math.PI / 2 * 0.98, m.yaw ?? 0, 0, 'YXZ');
      fig.scale.x = face < 0 ? -1 : 1;
      root.userData.face = face;
      const nearR = face >= 0;
      torsoG.rotation.z = -(p.lean ?? 0);
      headG.rotation.set(0, (m.look ?? 0) * Math.PI, p.head ?? 0, 'YXZ');
      armN.rotation.z = (nearR ? p.armR : p.armL) ?? 0.06;
      armF.rotation.z = (nearR ? p.armL : p.armR) ?? -0.04;
      legN.rotation.z = p.legN ?? 0.045;
      legF.rotation.z = p.legF ?? -0.05;
      shovel.visible = m.hold === 'shovel';
      // shovel 0: loaded, blade level; 1: tipped, blade down
      shovel.rotation.z = -(armN.rotation.z) + 0.25 - smooth(clamp(m.shovel ?? 0)) * 1.3;
    },
    hand(which, out) {
      const a = (which === 'R') === ((root.userData.face ?? 1) >= 0) ? armN : armF;
      a.updateWorldMatrix(true, false); return out.copy(hand).applyMatrix4(a.matrixWorld);
    },
    // the frame a card is held in: origin at the hand, x along the paper plane (root +x), y up, z out of the
    // printed side (root +z); the figure faces along face * x. A proper rotation even when the figure is mirrored.
    frame(which, out) {
      const p = this.hand(which, _fp);
      root.updateWorldMatrix(true, false);
      out.extractRotation(root.matrixWorld);
      return out.setPosition(p);
    },
    shovel, shovelChips,
    blade(out) { shovel.updateWorldMatrix(true, false); return out.set(S.BLADE[0], S.BLADE[1], 0.001).applyMatrix4(shovel.matrixWorld); },
  };
}

// ------------------------------------------------------------------ paper-doll chains along the coasts
// Identical hand-in-hand dolls cut from one folded strip of old printed paper; the strip is creased
// accordion-wise at the hands, which is what lets it stand. show 0..1 unfolds a chain (0 = gone).
export const DOLL = { W: 0.046, H: 0.09, X: 0.525, FOLD: 0.6, TILT: 0.1, GROUPS: [[-2.72, 7], [-1.86, 10], [-0.86, 6], [0.2, 9], [1.3, 7], [2.42, 10]] };
// right half of one doll, top of the head to the crotch: a small head, a long coat, arms down to the hands
// that join the next doll at hip height (the only joins), feet on the table
const DOLL_HALF = [[0, 0.0905], [0.0045, 0.0893], [0.0069, 0.086], [0.0074, 0.0822], [0.0066, 0.0786], [0.0042, 0.0758], [0.0028, 0.0748], [0.003, 0.0728], [0.0062, 0.0712], [0.0092, 0.0695], [0.0116, 0.0618], [0.0156, 0.0538], [0.0204, 0.0494], [0.023, 0.049, 1], [0.023, 0.0438, 1], [0.0192, 0.0442], [0.0142, 0.0494], [0.0109, 0.0562], [0.0097, 0.0602], [0.0089, 0.05], [0.0095, 0.038], [0.0109, 0.0268, 1], [0.0071, 0.0262, 1], [0.0067, 0.012], [0.0071, 0.0034], [0.0099, 0.0019], [0.0103, 0.0, 1], [0.0035, 0.0, 1], [0.0035, 0.006], [0.0027, 0.016], [0.0, 0.0205, 1]];
let _dollShared = null;
function dollShared() {
  if (_dollShared) return _dollShared;
  const pts = [...DOLL_HALF, ...DOLL_HALF.slice(1, -1).reverse().map((p) => [-p[0], p[1], p[2]])];
  const poly = outline(pts, 4);
  const geo = cutout(poly, 0.0004, (x, y) => [x / DOLL.W + 0.5, y / DOLL.H]);
  const mat = cel({
    color: '#e4dccb', id: ID.DOLL, gloss: 0.08, rim: 0.7,
    vsHead: 'varying float vInst;', vertex: 'vInst = float(gl_InstanceID);', fsHead: 'varying float vInst;',
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.00012, 0.0005, mpp);
      vec2 p = vec2(vLocal.x + vInst * ${fl(DOLL.W)}, vLocal.y);
      if(abs(vLocalN.z) > 0.5){
        // they were cut from an old printed page: columns of small type, a rule between the columns
        float rowi = floor(p.y * 640.0);
        float row = fract(p.y * 640.0);
        float word = step(0.38, vnoise(vec2(p.x * 900.0 + rowi * 13.0, rowi * 1.7)));
        float cx = fract(p.x * 11.0 + 0.5);
        col *= 1.0 - 0.2 * step(0.35, row) * step(row, 0.8) * word * step(0.07, cx) * fine;
        col *= 1.0 - 0.25 * (1.0 - smoothstep(0.012, 0.022, abs(cx - 0.035))) * fine * 0.0;
      }
      col *= 0.92 + 0.1 * fbm2(p * 70.0 + vInst);
      ${PAPER_LIT}
    `,
  });
  return (_dollShared = { geo, mat });
}
function buildPeople() {
  const { geo, mat } = dollShared();
  const n = DOLL.GROUPS.reduce((a, g) => a + g[1], 0) * 2;
  const inst = new THREE.InstancedMesh(geo, mat, n);
  inst.frustumCulled = false;
  inst.name = 'paper-dolls';
  const root = group(null, 'people');
  root.add(inst);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), p = V3(), e = V3(), one = V3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const gq = new THREE.Quaternion(), ge = new THREE.Euler();
  const update = (st = {}) => {
    let k = 0;
    for (const side of ['CN', 'US']) {
      const sg = SIDE_SIGN[side];
      const show = st[side]?.show ?? 1;
      DOLL.GROUPS.forEach(([zc, cnt], gi) => {
        const f = smooth(Array.isArray(show) ? (show[gi] ?? 0) : show);
        if (f <= 0.001) { for (let i = 0; i < cnt; i++) inst.setMatrixAt(k++, zero); return; }
        const th = lerp(1.52, DOLL.FOLD, f);
        // chain frame: local +x along the coast, local +z faces the sea, leaning back a little (looking up)
        ge.set(-DOLL.TILT * f, sg < 0 ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ'); gq.setFromEuler(ge);
        const len = cnt * DOLL.W * Math.cos(th);
        const dir = V3(1, 0, 0).applyQuaternion(gq);
        const o = V3(sg * DOLL.X, 0, zc).addScaledVector(dir, -len / 2);
        e.set(0, 0, 0);
        for (let i = 0; i < cnt; i++) {
          const a = i % 2 ? -th : th;
          const d = V3(Math.cos(a), 0, -Math.sin(a));
          p.copy(e).addScaledVector(d, DOLL.W / 2);
          qy.setFromAxisAngle(V3(0, 1, 0), a);
          q.copy(gq).multiply(qy);
          p.applyQuaternion(gq).add(o);
          m.compose(p, q, one);
          inst.setMatrixAt(k++, m);
          e.addScaledVector(d, DOLL.W);
        }
      });
    }
    inst.count = k;
    inst.instanceMatrix.needsUpdate = true;
  };
  update();
  return { root, inst, update };
}

// ------------------------------------------------------------------ Mistral: the cardboard court-card king
// A standee at the foot (EU.pos), front printed like a court card (keeps its colour, card ids), grey
// cardboard back with a fold-out strut and printed fold lines. fold 0..1: strut in, folded in half, in half again.
export const STANDEE = { H: 1.272, W: 0.62, T: 0.0045, STRUT_Y: 0.55, STRUT_L: 0.585, STRUT_A: 0.33, LEAN: 0.05, SCALE: 0.86, SLIDE: [-0.2, 0, 0.36] };   // design units; the sheet is scaled by SCALE
const EU_OUTLINE = [[-0.285, 0, 1], [0.285, 0, 1], [0.282, 0.12], [0.27, 0.36], [0.252, 0.56], [0.262, 0.68], [0.282, 0.78], [0.298, 0.845], [0.29, 0.885], [0.255, 0.905], [0.185, 0.925], [0.13, 0.94], [0.14, 0.99], [0.138, 1.04], [0.125, 1.085], [0.128, 1.12, 1], [0.131, 1.166, 1], [0.138, 1.214], [0.134, 1.232], [0.12, 1.226], [0.094, 1.176, 1], [0.068, 1.238], [0.06, 1.252], [0.05, 1.238], [0.03, 1.182, 1], [0.008, 1.262], [0, 1.272], [-0.008, 1.262], [-0.03, 1.182, 1], [-0.05, 1.238], [-0.06, 1.252], [-0.068, 1.238], [-0.094, 1.176, 1], [-0.12, 1.226], [-0.134, 1.232], [-0.138, 1.214], [-0.131, 1.166, 1], [-0.128, 1.12, 1], [-0.125, 1.085], [-0.138, 1.04], [-0.14, 0.99], [-0.13, 0.94], [-0.185, 0.925], [-0.255, 0.905], [-0.263, 0.935], [-0.276, 1.14], [-0.287, 1.188, 1], [-0.297, 1.14], [-0.285, 0.935], [-0.279, 0.902, 1], [-0.312, 0.894, 1], [-0.314, 0.874, 1], [-0.292, 0.872], [-0.306, 0.84], [-0.3, 0.8], [-0.282, 0.75], [-0.262, 0.68], [-0.252, 0.56], [-0.27, 0.36], [-0.282, 0.12]];
// the acting cut: body (head and card arm cut away), the head flap (pinned at the neck), the card arm (pinned at the shoulder)
const EU_NECK = [0, 0.935], EU_SHOULDER = [0.245, 0.865], EU_HANDPT = [0.19, 0.565];
const EU_BODY_ACT = [[-0.285, 0, 1], [0.285, 0, 1], [0.282, 0.12], [0.27, 0.36], [0.252, 0.56], [0.236, 0.62], [0.232, 0.72], [0.236, 0.82], [0.215, 0.895], [0.185, 0.925], [0.13, 0.94], [0.06, 0.952, 1], [-0.06, 0.952, 1], [-0.13, 0.94], [-0.185, 0.925], [-0.255, 0.905], [-0.263, 0.935], [-0.276, 1.14], [-0.287, 1.188, 1], [-0.297, 1.14], [-0.285, 0.935], [-0.279, 0.902, 1], [-0.312, 0.894, 1], [-0.314, 0.874, 1], [-0.292, 0.872], [-0.306, 0.84], [-0.3, 0.8], [-0.282, 0.75], [-0.262, 0.68], [-0.252, 0.56], [-0.27, 0.36], [-0.282, 0.12]];
const EU_HEAD_ACT = [[0.13, 0.94], [0.14, 0.99], [0.138, 1.04], [0.125, 1.085], [0.128, 1.12, 1], [0.131, 1.166, 1], [0.138, 1.214], [0.134, 1.232], [0.12, 1.226], [0.094, 1.176, 1], [0.068, 1.238], [0.06, 1.252], [0.05, 1.238], [0.03, 1.182, 1], [0.008, 1.262], [0, 1.272], [-0.008, 1.262], [-0.03, 1.182, 1], [-0.05, 1.238], [-0.06, 1.252], [-0.068, 1.238], [-0.094, 1.176, 1], [-0.12, 1.226], [-0.134, 1.232], [-0.138, 1.214], [-0.131, 1.166, 1], [-0.128, 1.12, 1], [-0.125, 1.085], [-0.138, 1.04], [-0.14, 0.99], [-0.13, 0.94], [-0.07, 0.93], [-0.05, 0.94], [-0.018, 0.905], [0, 0.93], [0.018, 0.905], [0.05, 0.94], [0.07, 0.93]];
const EU_ARM_ACT = [[0.2, 0.895, 1], [0.255, 0.905], [0.29, 0.885], [0.298, 0.845], [0.282, 0.78], [0.27, 0.7], [0.262, 0.62], [0.245, 0.585], [0.232, 0.538], [0.17, 0.533], [0.145, 0.56], [0.15, 0.6], [0.19, 0.615], [0.215, 0.7], [0.22, 0.8], [0.205, 0.86]];
// Sutherland-Hodgman clip of a polygon to an axis-aligned box
function clipBox(poly, x0, x1, y0, y1) {
  const edge = (pts, inside, cut) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } return out; };
  const lx = (x) => (a, b) => { const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + (b[1] - a[1]) * t]; };
  const ly = (y) => (a, b) => { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y]; };
  let p = edge(poly, (q) => q[0] >= x0, lx(x0));
  p = edge(p, (q) => q[0] <= x1, lx(x1));
  p = edge(p, (q) => q[1] >= y0, ly(y0));
  p = edge(p, (q) => q[1] <= y1, ly(y1));
  return p;
}
function drawPixelM(g, cx, cy, cell) {
  const rows = [[1, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5], [1, 3, 5], [0, 1, 2, 4, 5, 6]];
  const cols = ['#FFD800', '#FFAF00', '#FF8205', '#FA500F', '#E10500'];
  rows.forEach((r, j) => { g.fillStyle = cols[j]; for (const i of r) g.fillRect(cx + (i - 3.5) * cell, cy + (j - 2.5) * cell, cell + 0.5, cell + 0.5); });
}
function standeeCanvases(poly) {
  const { H, W } = STANDEE, k = 1700, X0 = -0.33, Y1 = H + 0.01;
  const CW = Math.ceil(0.66 * k), CH = Math.ceil((H + 0.02) * k);
  const M = (x, y) => [(x - X0) * k, (Y1 - y) * k];
  const uvOf = (x, y) => [(x - X0) / 0.66, (y - (Y1 - (H + 0.02))) / (H + 0.02)];
  // ---- the printed front
  const f = canvas(CW, CH), g = f.getContext('2d');
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, CW, CH);
  g.save(); tracePoly(g, poly, M); g.clip();
  g.fillStyle = '#f2ecdf'; g.fillRect(0, 0, CW, CH);
  const P = (pts, fill, w = 0.004) => { g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = M(x, y); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (w) { g.lineWidth = w * k; g.strokeStyle = '#141010'; g.stroke(); } };
  const E = (x, y, rx, ry, fill, w = 0.004, rot = 0) => { g.beginPath(); g.ellipse(...M(x, y), rx * k, ry * k, rot, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (w) { g.lineWidth = w * k; g.strokeStyle = '#141010'; g.stroke(); } };
  const RED = '#b3232a', BLUE = '#23428a', YEL = '#e2b13a', FLESH = '#efcfa4', INKC = '#141010';
  // robe: red, a blue front panel, yellow hem and belt, diamonds on the panel
  P([[-0.29, 0], [0.29, 0], [0.27, 0.36], [0.253, 0.56], [0.265, 0.7], [0.29, 0.86], [-0.29, 0.86], [-0.265, 0.7], [-0.253, 0.56], [-0.27, 0.36]], RED, 0);
  P([[-0.085, 0], [0.085, 0], [0.07, 0.55], [0.06, 0.88], [-0.06, 0.88], [-0.07, 0.55]], BLUE);
  for (let y = 0.08; y < 0.85; y += 0.05) for (const x of [-0.035, 0.0, 0.035]) { if (Math.abs(x) > 0.07 - y * 0.012) continue; P([[x, y - 0.016], [x + 0.012, y], [x, y + 0.016], [x - 0.012, y]], YEL, 0.0022); }
  P([[-0.29, 0], [0.29, 0], [0.288, 0.075], [-0.288, 0.075]], YEL);
  for (let x = -0.27; x < 0.28; x += 0.04) E(x, 0.0375, 0.011, 0.011, RED, 0.002);
  P([[-0.26, 0.5], [0.26, 0.5], [0.258, 0.54], [-0.258, 0.54]], YEL);
  for (const s of [-1, 1]) for (let y = 0.11; y < 0.48; y += 0.07) P([[s * 0.11, y], [s * 0.2, y + 0.035], [s * 0.11, y + 0.07]], null, 0.003);
  // the sleeves and hands: right hand (viewer's left) grips the sword, left hand on the belt
  P([[-0.29, 0.86], [-0.2, 0.86], [-0.2, 0.7], [-0.26, 0.68], [-0.3, 0.78]], YEL);
  for (let y = 0.71; y < 0.86; y += 0.03) P([[-0.295, y], [-0.205, y + 0.004]], null, 0.003);
  P([[0.255, 0.905], [0.29, 0.885], [0.298, 0.845], [0.282, 0.78], [0.27, 0.7], [0.262, 0.62], [0.245, 0.585], [0.19, 0.615], [0.215, 0.7], [0.22, 0.8], [0.205, 0.86]], YEL);
  for (let y = 0.64; y < 0.86; y += 0.035) P([[0.214, y], [0.28, y + 0.01]], null, 0.003);
  E(0.19, 0.565, 0.042, 0.03, FLESH);
  // the sword: blade up past the shoulder, gold guard and grip
  P([[-0.262, 0.93], [-0.276, 1.14], [-0.287, 1.186], [-0.297, 1.14], [-0.285, 0.93]], '#c4c7ca');
  P([[-0.2805, 0.95], [-0.2862, 1.15]], null, 0.0022);
  P([[-0.31, 0.875], [-0.21, 0.885], [-0.21, 0.9], [-0.31, 0.893]], YEL);
  P([[-0.282, 0.7], [-0.268, 0.7], [-0.268, 0.88], [-0.282, 0.88]], YEL, 0.003);
  E(-0.262, 0.755, 0.045, 0.034, FLESH);
  for (let i = 0; i < 3; i++) P([[-0.29 + i * 0.018, 0.735], [-0.285 + i * 0.018, 0.77]], null, 0.0022);
  // ermine collar
  P([[-0.29, 0.86], [0.29, 0.86], [0.255, 0.906], [0.185, 0.926], [-0.185, 0.926], [-0.255, 0.906]], '#f6f2ea');
  for (let x = -0.25; x < 0.26; x += 0.045) P([[x, 0.875], [x + 0.008, 0.9], [x - 0.008, 0.9]], INKC, 0);
  // head: yellow hair and forked beard, flat court-card face with a side glance
  P([[-0.135, 0.94], [-0.14, 1.04], [-0.12, 1.095], [0.12, 1.095], [0.14, 1.04], [0.135, 0.94], [0.08, 0.93], [-0.08, 0.93]], YEL);
  for (const s of [-1, 1]) for (let y = 0.96; y < 1.08; y += 0.028) E(s * 0.112, y, 0.022, 0.013, YEL, 0.003, s * 0.4);
  P([[-0.08, 1.09], [0.08, 1.09], [0.085, 1.0], [0.06, 0.965], [-0.06, 0.965], [-0.085, 1.0]], FLESH);
  P([[-0.07, 0.985], [0.07, 0.985], [0.05, 0.94], [0.018, 0.905], [0.0, 0.93], [-0.018, 0.905], [-0.05, 0.94]], YEL);
  for (let x = -0.05; x <= 0.05; x += 0.02) P([[x, 0.98], [x * 0.7, 0.93]], null, 0.0022);
  P([[-0.05, 0.993], [-0.022, 1.0], [0.0, 0.994], [0.022, 1.0], [0.05, 0.993], [0.06, 1.004], [0.03, 1.012], [0.0, 1.004], [-0.03, 1.012], [-0.06, 1.004]], YEL, 0.0028);
  P([[-0.016, 1.072], [-0.006, 1.03], [0.004, 1.016]], null, 0.0028);
  for (const s of [-1, 1]) { E(s * 0.036, 1.056, 0.019, 0.0085, '#ffffff', 0.0028); E(s * 0.036 + 0.009, 1.056, 0.0058, 0.0062, INKC, 0); P([[s * 0.015, 1.073], [s * 0.035, 1.079], [s * 0.058, 1.073]], null, 0.004); }
  // the crown: gold band and points, red jewels, the Mistral pixel M on a black cartouche
  P([[-0.128, 1.12], [0.128, 1.12], [0.131, 1.166], [0.138, 1.214], [0.094, 1.176], [0.06, 1.25], [0.03, 1.182], [0, 1.268], [-0.03, 1.182], [-0.06, 1.25], [-0.094, 1.176], [-0.138, 1.214], [-0.131, 1.166]], YEL);
  for (const [x, y] of [[0.135, 1.222], [0.06, 1.252], [0, 1.268], [-0.06, 1.252], [-0.135, 1.222]]) E(x, y - 0.006, 0.0085, 0.0085, YEL, 0.0026);
  P([[-0.129, 1.166], [0.129, 1.166]], null, 0.003);
  for (const x of [-0.105, 0.105]) E(x, 1.143, 0.011, 0.014, RED, 0.0028);
  P([[-0.056, 1.118], [0.056, 1.118], [0.056, 1.188], [-0.056, 1.188]], '#111111', 0.003);
  { const [cx, cy] = M(0, 1.153); drawPixelM(g, cx, cy, 0.0136 * k); }
  // a printed index in the corner, like the card it is
  g.fillStyle = INKC; g.font = `700 ${Math.round(0.07 * k)}px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('K', ...M(0.21, 0.27)); g.fillStyle = RED; g.font = `700 ${Math.round(0.05 * k)}px ${FONT_SERIF}`; g.fillText('♥', ...M(0.21, 0.205));
  g.restore();
  g.lineWidth = 0.004 * k; g.strokeStyle = '#141010'; tracePoly(g, poly, M); g.stroke();
  // ---- the grey cardboard back (drawn mirrored so its print reads from behind)
  const b = canvas(Math.ceil(CW / 2), Math.ceil(CH / 2)), h = b.getContext('2d');
  const kb = k / 2;
  h.fillStyle = '#8e897f'; h.fillRect(0, 0, b.width, b.height);
  const rng = new Rng(17);
  for (let i = 0; i < 900; i++) { h.fillStyle = `rgba(${rng.next() < 0.5 ? '255,255,255' : '40,36,30'},${rng.range(0.03, 0.08)})`; h.fillRect(rng.range(0, b.width), rng.range(0, b.height), rng.range(2, 30), rng.range(1, 3)); }
  // seen from behind, local +x is on the viewer's left: draw in a flipped context, x' = mirX(x)
  const mirX = (x) => (-x - X0) * kb;
  const yB = (y) => (Y1 - y) * kb;
  h.save(); h.translate(b.width, 0); h.scale(-1, 1);
  h.strokeStyle = '#2b2824'; h.fillStyle = '#2b2824'; h.lineWidth = 3; h.setLineDash([16, 10]);
  h.beginPath(); h.moveTo(mirX(-0.3), yB(H / 2)); h.lineTo(mirX(0.3), yB(H / 2)); h.stroke();
  h.beginPath(); h.moveTo(mirX(0), yB(0.02)); h.lineTo(mirX(0), yB(H - 0.02)); h.stroke();
  h.setLineDash([]);
  h.font = `700 ${Math.round(0.018 * kb)}px ${FONT_SANS}`; h.textAlign = 'left'; h.textBaseline = 'bottom';
  h.fillText('✂  PLIER ICI · FOLD HERE · HIER FALTEN', mirX(0.27), yB(H / 2 + 0.006));
  h.save(); h.translate(mirX(0) - 6, yB(0.2)); h.rotate(-Math.PI / 2); h.fillText('✂  PLIER ICI · FOLD HERE', 0, 0); h.restore();
  // a maker's label: name, a barcode, the CE mark
  const lx = mirX(0.24), ly = yB(0.2);
  h.strokeStyle = '#2b2824'; h.lineWidth = 2; h.strokeRect(lx, ly, 0.2 * kb, 0.1 * kb);
  h.font = `700 ${Math.round(0.016 * kb)}px ${FONT_SANS}`; h.textBaseline = 'top';
  h.fillText('MISTRAL AI · PARIS', lx + 8, ly + 6); h.font = `400 ${Math.round(0.011 * kb)}px ${FONT_SANS}`; h.fillText('PRÉSENTOIR / STANDEE  1:1', lx + 8, ly + 6 + 0.02 * kb);
  for (let i = 0; i < 34; i++) h.fillRect(lx + 8 + i * 0.0032 * kb, ly + 0.05 * kb, (i * 7 % 3 + 1) * 1.2, 0.035 * kb);
  h.font = `700 ${Math.round(0.03 * kb)}px ${FONT_SERIF}`; h.fillText('CE', lx + 0.15 * kb, ly + 0.055 * kb);
  h.restore();
  return { front: tex(f), back: tex(b), uvOf };
}
let _standeeShared = null;
function standeeShared() {
  if (_standeeShared) return _standeeShared;
  const { H, T } = STANDEE;
  const poly = outline(EU_OUTLINE, 4);
  const cv = standeeCanvases(poly);
  const quad = (x0, x1, y0, y1) => cutout(clipBox(poly, x0, x1, y0, y1), T, cv.uvOf);
  const mat = cel({
    color: '#ffffff', id: ID.BOARD, gloss: 0.25, rim: 0.8, uniforms: { uFront: { value: cv.front }, uBack: { value: cv.back } },
    pattern: /* glsl */ `
      ${FADE}
      if(vLocalN.z > 0.5){ col = tx(uFront, vUv); idOut = ${fl(ID.PRINT)}; litBias += 0.08; gloss = 0.35; }
      else if(vLocalN.z < -0.5){ col = tx(uBack, vUv); gloss = 0.05; emis = col * 0.07; }
      else { float c = step(0.5, fract((vLocal.x + vLocal.y) * 520.0)); col = mix(${lin('#7a6e5c')}, ${lin('#a39477')}, mix(0.5, c, 1.0 - smoothstep(0.0004, 0.0015, mpp))); }
    `,
  });
  const strut = merge([xf(softBox(0.08, STANDEE.STRUT_L, 0.004, 0.0015), 0, -STANDEE.STRUT_L / 2, -0.002), xf(new THREE.BoxGeometry(0.08, 0.04, 0.001), 0, -0.02, 0.0005)]);
  const strutMat = cel({ color: '#8e897f', id: ID.BOARD, gloss: 0.05, pattern: `${FADE} col *= 0.92 + 0.12 * vnoise(vLocal.xy * vec2(40.0, 900.0)) * (1.0 - smoothstep(0.0005, 0.002, mpp)); emis = col * 0.07;` });
  const half = H / 2, BIG = 1;
  // for acting (unfolded only): the body without its head and card arm, and those two as flaps on split pins
  const actBody = cutout(outline(EU_BODY_ACT, 4), T, cv.uvOf), actHead = cutout(outline(EU_HEAD_ACT, 4), T, cv.uvOf), actArm = cutout(outline(EU_ARM_ACT, 4), T, cv.uvOf);
  const pin = lathe([[0, 0], [0.011, 0], [0.011, 0.001], [0.008, 0.003], [0, 0.0035]], 16).rotateX(Math.PI / 2);
  return (_standeeShared = { q00: quad(-BIG, 0, -0.01, half), q10: quad(0, BIG, -0.01, half), q01: quad(-BIG, 0, half, H + 0.1), q11: quad(0, BIG, half, H + 0.1), mat, strut, strutMat, actBody, actHead, actArm, pin, pinMat: brassMat({ color: '#c8a050', scratch: 0, mottleK: 0.3 }) });
}
export function makeMistral() {
  const S = standeeShared(), { H, T } = STANDEE;
  const root = group(null, 'mistral');
  const sheet = group(root, 'sheet');
  sheet.scale.setScalar(STANDEE.SCALE);
  const z1 = -T / 2 - 0.0008, z2 = -1.5 * T - 0.0024;
  mesh(S.q00, S.mat, sheet);
  const h1L = group(sheet, 'h1L', 0, H / 2, z1); mesh(S.q01, S.mat, h1L, 0, -H / 2, -z1);
  const h2 = group(sheet, 'h2', 0, 0, z2); mesh(S.q10, S.mat, h2, 0, 0, -z2);
  const h1R = group(h2, 'h1R', 0, H / 2, z1 - z2); mesh(S.q11, S.mat, h1R, 0, -H / 2, -z1);
  const strut = group(sheet, 'strut', -0.1, STANDEE.STRUT_Y, -T / 2 - 0.0004);
  mesh(S.strut, S.strutMat, strut);
  // the acting set (shown while he is unfolded): body + head flap + card-arm flap, each on a brass split pin
  const panels = sheet.children.filter((c) => c !== strut);
  const act = group(sheet, 'act');
  mesh(S.actBody, S.mat, act);
  const headG = group(act, 'head', EU_NECK[0], EU_NECK[1], T + 0.0006); mesh(S.actHead, S.mat, headG, -EU_NECK[0], -EU_NECK[1], 0); mesh(S.pin, S.pinMat, headG, 0, 0, T / 2);
  const armG = group(act, 'arm', EU_SHOULDER[0], EU_SHOULDER[1], T * 2 + 0.0012); mesh(S.actArm, S.mat, armG, -EU_SHOULDER[0], -EU_SHOULDER[1], 0); mesh(S.pin, S.pinMat, armG, 0, 0, T / 2);
  const handPt = V3(EU_HANDPT[0] - EU_SHOULDER[0], EU_HANDPT[1] - EU_SHOULDER[1], T / 2 + 0.002);
  sheet.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  const update = (eu = {}) => {
    const show = eu.show ?? 1, f = clamp(eu.fold ?? 0);
    root.visible = show > 0.001;
    const at = eu.at ?? EU.pos, rot = eu.rot ?? [0, Math.PI, 0];
    const sl = smooth(clamp(eu.slide ?? 0)), cr = clamp(eu.crushed ?? 0);
    // squeezed out from under the short leg: slides out toward the foot and outward, turning
    root.position.set(at[0] + STANDEE.SLIDE[0] * sl, at[1], at[2] + STANDEE.SLIDE[2] * sl);
    root.rotation.set(rot[0], rot[1] + 0.7 * sl, rot[2], 'YXZ');
    // crushed: the folded wad squashed flat (its thickness is the sheet's local z)
    sheet.scale.set(STANDEE.SCALE * (1 + 0.05 * cr), STANDEE.SCALE * (1 + 0.05 * cr), STANDEE.SCALE * (1 - 0.7 * cr));
    // as he is folded, the anchor moves to the middle of the wad, and the wad's back layers rise above the
    // root plane: folded flat with rot [-PI/2, yaw, 0], eu.at is the centre of the wad's underside
    const fw = smooth(f);
    sheet.position.set(STANDEE.W / 4 * STANDEE.SCALE * fw, -STANDEE.H / 4 * STANDEE.SCALE * fw, 0.0168 * STANDEE.SCALE * (1 - 0.7 * cr) * smooth(clamp((f - 0.55) / 0.45)));
    const fs = smooth(f / 0.15), f1 = smooth((f - 0.1) / 0.45), f2 = smooth((f - 0.55) / 0.45);
    strut.rotation.x = STANDEE.STRUT_A * (1 - fs);
    sheet.rotation.x = -STANDEE.LEAN * (1 - fs) - (1 - smooth(show)) * Math.PI / 2 * 0.97;
    h1L.rotation.x = h1R.rotation.x = -Math.PI * f1 * 0.995;
    h2.rotation.y = Math.PI * f2 * 0.995;
    // acting: head -1 tilts toward the card in his hand .. +1 tips up; arm 0..1 swings the card up and forward
    const acting = f < 1e-3 && cr < 1e-3;
    act.visible = acting; for (const p of panels) p.visible = !acting;
    const hd = clamp(eu.head ?? 0, -1, 1), ar = smooth(clamp(eu.arm ?? 0));
    headG.rotation.set(0, 0, 0.3 * hd);
    armG.rotation.set(-0.35 * ar, 0, 2.3 * ar, 'XYZ');
  };
  update();
  return {
    root, update,
    // the card in his printed hand: origin at the hand, x along the sheet, y up the sheet, z out of the printed
    // front (toward the table); draw the card in its xy plane facing +z
    hand(out) { armG.updateWorldMatrix(true, false); out.extractRotation(armG.matrixWorld); return out.setPosition(handPt.clone().applyMatrix4(armG.matrixWorld)); },
  };
}

// ------------------------------------------------------------------ chips beside the presses, the mountain
// Stacks: six columns beside each press (stack 0..1 = how many are left; they shrink from the top, evenly).
// heap 0..1: a loose mountain of chips (OpenAI tips one into his press); kind 'US' (NVIDIA) | 'CN' (kiln clay).
export const STACKS = { N: 22, COLS: [[-0.019, -0.033], [0.019, -0.033], [-0.038, 0], [0, 0], [0.038, 0], [0, 0.033]], HEAP: 380, HEAP_R: 0.13, HEAP_H: 0.11 };
export function stackPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.79, 0, SEAT.Z[k.seat] - 0.37]; }
export function heapPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.68, 0, SEAT.Z[k.seat] - 0.58]; }
export function cityHome(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.68, 0, SEAT.Z[k.seat] + 0.47]; }
// press-local centre of the hopper's mouth (the top of the funnel)
const MOUTH = [0, 0.2968, 0];
function chipLayouts(seed) {
  const rng = new Rng(seed);
  const stack = [];
  STACKS.COLS.forEach(([cx, cz]) => { for (let j = 0; j < STACKS.N; j++) stack.push([cx + rng.range(-1.3, 1.3) * 1e-3, CHIP.H * (j + 0.5), cz + rng.range(-1.3, 1.3) * 1e-3, rng.range(-0.04, 0.04), rng.range(0, TAU), rng.range(-0.04, 0.04)]); });
  // the mountain: chips over a cone, most of them near its surface, sorted bottom-up (the top goes first)
  const heap = [];
  for (let i = 0; i < STACKS.HEAP; i++) {
    const r = STACKS.HEAP_R * Math.sqrt(rng.next()), a = rng.range(0, TAU);
    const h = STACKS.HEAP_H * Math.pow(1 - r / STACKS.HEAP_R, 0.85);
    const y = Math.max(CHIP.H * 0.5, h - Math.abs(rng.range(-1, 1)) * 0.018);
    heap.push([Math.cos(a) * r, y, Math.sin(a) * r, rng.range(-0.5, 0.5), rng.range(0, TAU), rng.range(-0.5, 0.5)]);
  }
  heap.sort((a, b) => a[1] - b[1]);
  // a heap of chips in a hopper's mouth (press-local, around MOUTH)
  const mouth = [];
  for (let i = 0; i < 64; i++) {
    const y = rng.range(-0.035, 0.04), lim = Math.max(0.008, 0.052 - Math.max(0, y) * 1.1);
    const r = lim * Math.sqrt(rng.next()), a = rng.range(0, TAU);
    mouth.push([Math.cos(a) * r, MOUTH[1] + y, Math.sin(a) * r, rng.range(-0.7, 0.7), rng.range(0, TAU), rng.range(-0.7, 0.7)]);
  }
  mouth.sort((a, b) => a[1] - b[1]);
  return { stack, heap, mouth };
}

// ------------------------------------------------------------------ what the presses are fed
// Every item sits on the hopper's mouth at u = 0 (its local origin at the mouth, +y up) and sinks into the
// funnel, squeezed, until it is gone at u = 1. hopper.at (world [x,y,z] or a Matrix4) carries it elsewhere first
// (e.g. in a king's hand); hopper.peel 0..1 lifts the city's patch off the map at its home (cityHome(id)).
let _feedShared = null;
function feedShared() {
  if (_feedShared) return _feedShared;
  // ---- gold bars: trapezoid ingots, three across and two on top
  const bar = new THREE.CylinderGeometry(0.707, 0.834, 1, 4, 1).rotateY(Math.PI / 4).toNonIndexed();
  bar.scale(0.034 / 0.834, 0.02, 0.016 / 0.834); bar.computeVertexNormals();
  const gold = merge([xf(bar.clone(), 0, 0.01, -0.034), xf(bar.clone(), 0, 0.01, 0), xf(bar.clone(), 0, 0.01, 0.034), xf(bar.clone(), -0.017, 0.03, 0, 0, Math.PI / 2 + 0.06, 0), xf(bar.clone(), 0.017, 0.03, 0.002, 0, Math.PI / 2 - 0.05, 0)]);
  const goldMat = brassMat({ color: '#e0b443', metal: 0.65, scratch: 0.15, mottleK: 0.4, more: `if(vLocalN.y > 0.9){ vec2 s = abs(fract(vLocal.xz * vec2(14.7, 31.0)) - 0.5); col *= 1.0 - 0.25 * step(0.42, max(s.x, s.y)); }` });
  // ---- a stone castle whose windows are server racks
  const stone = [];
  stone.push(xf(softBox(0.066, 0.08, 0.066, 0.002), 0, 0.04, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    stone.push(xf(new THREE.CylinderGeometry(0.0165, 0.018, 0.1, 14), x * 0.045, 0.05, z * 0.045));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; stone.push(xf(new THREE.BoxGeometry(0.008, 0.009, 0.006), x * 0.045 + Math.cos(a) * 0.0145, 0.1045, z * 0.045 + Math.sin(a) * 0.0145, 0, -a, 0)); }
  }
  for (const [x, z, ry] of [[0, -0.045, 0], [0, 0.045, 0], [-0.045, 0, Math.PI / 2], [0.045, 0, Math.PI / 2]]) {
    stone.push(xf(new THREE.BoxGeometry(0.06, 0.05, 0.011), x, 0.025, z, 0, ry, 0));
    for (let i = -2; i <= 2; i++) stone.push(xf(new THREE.BoxGeometry(0.007, 0.008, 0.012), x + (ry ? 0 : i * 0.012), 0.054, z + (ry ? i * 0.012 : 0), 0, ry, 0));
  }
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { stone.push(xf(new THREE.BoxGeometry(0.008, 0.009, 0.006), i * 0.013, 0.0845, s * 0.03)); stone.push(xf(new THREE.BoxGeometry(0.006, 0.009, 0.008), s * 0.03, 0.0845, i * 0.013)); }
  const castle = merge(stone);
  const stoneMat = cel({
    color: '#8d877c', id: ID.ASH, gloss: 0.1, rim: 1,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0002, 0.0009, mpp);
      vec3 q = vLocal * 260.0;
      float row = floor(q.y);
      float bx = fract((abs(vLocalN.x) > 0.5 ? q.z : q.x) * 0.5 + row * 0.5);
      float mortar = max(1.0 - smoothstep(0.0, 0.08, fract(q.y)), 1.0 - smoothstep(0.0, 0.06, bx));
      col *= 1.0 - 0.35 * mortar * fine * step(abs(vLocalN.y), 0.5);
      col *= 0.82 + 0.3 * vnoise(vLocal.xz * 300.0 + vLocal.y * 200.0);
      // the gate
      if(vLocalN.z > 0.5 && abs(vLocal.x) < 0.009 && vLocal.y < 0.028 && length(vec2(vLocal.x, max(vLocal.y - 0.019, 0.0))) < 0.009 && vLocal.z > 0.04) col *= 0.12;
    `,
  });
  const racks = [];
  for (const [nx, nz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) {
    const w = new THREE.PlaneGeometry(0.0115, 0.017);
    w.rotateY(ry); w.translate(nx * 0.0332 + (nz ? c * 0.02 : 0), 0.05 + r * 0.022, nz * 0.0332 + (nx ? -c * 0.02 * nx : 0));
    racks.push(w);
  }
  const rackGeo = merge(racks);
  const rackMat = glowMaterial({
    color: '#ffffff', id: 144,
    pattern: /* glsl */ `
      vec2 u = vUv;
      col = vec3(0.012, 0.014, 0.016);
      float slot = step(0.18, fract(u.y * 9.0));
      vec2 led = vec2(fract(u.x * 3.0), fract(u.y * 9.0));
      float on = step(length((led - vec2(0.35, 0.55)) * vec2(1.0, 2.2)), 0.22) * slot;
      float blink = step(0.35, fract(sin(dot(floor(vec2(u.x * 3.0, u.y * 9.0)) + floor(uFxTime * 4.0), vec2(12.9898, 78.233))) * 43758.5453));
      col += mix(${lin('#7cff6a')}, ${lin('#ffc04a')}, step(0.66, fract(u.x * 3.0))) * on * blink * 1.6;
      col += vec3(0.05, 0.05, 0.06) * (1.0 - slot);
    `,
  });
  const rock = lathe([[0, 0], [0.072, 0], [0.074, 0.004], [0.066, 0.009], [0, 0.01]], 9, { warp: (r, y, th) => [r * (1 + 0.08 * Math.sin(th * 3 + 1)), y] });
  // ---- a lit city block on a patch torn from the map
  const PATCH = [[-0.078, -0.072], [-0.04, -0.079], [0.0, -0.074], [0.045, -0.08], [0.079, -0.071], [0.074, -0.03], [0.08, 0.01], [0.073, 0.05], [0.078, 0.077], [0.03, 0.073], [-0.01, 0.08], [-0.05, 0.072], [-0.077, 0.078], [-0.073, 0.035], [-0.08, -0.01], [-0.072, -0.04]];
  const patchGeo = cutout(PATCH, 0.0016, (x, y) => [x / 0.16 + 0.5, y / 0.16 + 0.5]).rotateX(-Math.PI / 2).translate(0, 0.0008, 0);
  const holeGeo = new THREE.ShapeGeometry(new THREE.Shape(PATCH.map(([x, y]) => new THREE.Vector2(x * 1.04, y * 1.04)))).rotateX(-Math.PI / 2);
  const towers = [], rngC = new Rng(404);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    if (rngC.next() < 0.18) continue;
    const d = Math.hypot(i, j), h = 0.016 + (3 - Math.min(3, d)) * 0.017 + rngC.range(0, 0.016), w = rngC.range(0.016, 0.022);
    towers.push(xf(new THREE.BoxGeometry(w, h, w * rngC.range(0.8, 1.1)), i * 0.027, 0.0016 + h / 2, j * 0.027));
  }
  const city = merge(towers);
  const cityMat = cel({
    color: '#4a4844', id: ID.IRON, gloss: 0.3, rim: 1,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.00015, 0.0007, mpp);
      if(abs(vLocalN.y) < 0.5){
        vec2 w = vec2((abs(vLocalN.x) > 0.5 ? vLocal.z : vLocal.x) * 330.0, vLocal.y * 420.0);
        vec2 f = fract(w), c = floor(w);
        float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
        float lit = step(0.42, fract(sin(dot(c + floor(vLocal.xz * 70.0), vec2(12.9898, 78.233))) * 43758.5453));
        if(win * lit > 0.5){ col = ${lin('#ffd890')}; emis = col * 0.9; idOut = 144.0; }
        else col *= mix(1.0, 0.7, win * fine);
      } else col *= 0.75;
    `,
  });
  const patchMat = cel({
    color: '#c2aa80', id: ID.BOARD, gloss: 0.1, rim: 1,
    pattern: /* glsl */ `
      ${FADE}
      if(abs(vLocalN.y) > 0.5){
        vec2 p = vLocal.xz;
        float st = max(1.0 - smoothstep(0.0, 0.0012 + mpp, abs(fract(p.x * 37.0 + 0.5) - 0.5) / 37.0), 1.0 - smoothstep(0.0, 0.0012 + mpp, abs(fract(p.y * 37.0 + 0.5) - 0.5) / 37.0));
        col *= 1.0 - 0.3 * st;
        col *= 0.85 + 0.2 * fbm2(p * 40.0);
      } else col *= 0.7;
    `,
  });
  const holeMat = cel({ color: '#140e0a', id: 101, gloss: 0.2, pattern: 'col *= 0.8 + 0.4 * vnoise(vLocal.xz * 400.0);' });
  // ---- a power plant: turbine hall with a sawtooth roof, two stacks, a cooling tower, smoke
  const plantParts = [xf(new THREE.BoxGeometry(0.13, 0.006, 0.1), 0, 0.003, 0), xf(new THREE.BoxGeometry(0.075, 0.04, 0.05), -0.012, 0.026, -0.012)];
  for (let i = 0; i < 3; i++) {
    const tri = new THREE.CylinderGeometry(0.0145, 0.0145, 0.05, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6);
    plantParts.push(xf(tri, -0.037 + i * 0.025, 0.051, -0.012));
  }
  const plant = merge(plantParts);
  const stackGeo = merge([xf(lathe([[0, 0], [0.0095, 0], [0.0068, 0.13], [0.0074, 0.132], [0.0074, 0.136], [0.0058, 0.136], [0.0058, 0.12], [0, 0.12]], 16), 0.04, 0.006, -0.026), xf(lathe([[0, 0], [0.0085, 0], [0.006, 0.112], [0.0066, 0.114], [0.0066, 0.118], [0.005, 0.118], [0.005, 0.1], [0, 0.1]], 16), 0.04, 0.006, 0.008)]);
  const tower = lathe([[0.03, 0], [0.027, 0.012], [0.02, 0.038], [0.019, 0.05], [0.0215, 0.068], [0.0205, 0.068], [0.0178, 0.05], [0.0182, 0.038], [0.0, 0.03]], 24).translate(0.0, 0.006, 0.033);
  const concrete = cel({ color: '#8a8580', id: ID.ASH, gloss: 0.1, rim: 1, pattern: `${FADE} col *= 0.85 + 0.25 * vnoise(vLocal.xz * 500.0 + vLocal.y * 300.0); if(abs(vLocalN.y) < 0.5) col *= 1.0 - 0.25 * step(0.85, fract(vLocal.y * 120.0)) * (1.0 - smoothstep(0.0003, 0.001, mpp));` });
  const stackMat = cel({ color: '#77736e', id: ID.STEEL, gloss: 0.2, rim: 1, pattern: `col *= mix(1.0, 0.35, step(0.8, fract(vLocal.y * 30.0)) * step(0.08, vLocal.y));` });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const smokeMat = cel({ color: '#6c6a68', id: 117, gloss: 0.0, rim: 0.6, pattern: 'col *= 0.8 + 0.3 * vnoise(vLocal.xy * 3.0 + vLocal.z); litBias += 0.25;' });
  return (_feedShared = { gold, goldMat, castle, stoneMat, rackGeo, rackMat, rock, patchGeo, holeGeo, city, cityMat, patchMat, holeMat, plant, stackGeo, tower, concrete, stackMat, puff, smokeMat });
}
// one set of feed items per press (only the current kind is shown)
function buildFeed(id) {
  const S = feedShared();
  const root = group(null, 'feed-' + id);
  const items = {};
  items.gold = group(root, 'gold'); mesh(S.gold, S.goldMat, items.gold);
  items.castle = group(root, 'castle'); mesh(S.rock, S.stoneMat, items.castle); const ck = mesh(S.castle, S.stoneMat, items.castle, 0, 0.008, 0); mesh(S.rackGeo, S.rackMat, ck).userData.noShadow = true;
  items.city = group(root, 'city');
  const lift = group(items.city, 'lift');           // pivot at the patch's back edge (peeling)
  const patch = group(lift, 'patch', 0, 0, 0.078);
  mesh(S.patchGeo, S.patchMat, patch); mesh(S.city, S.cityMat, patch);
  items.plant = group(root, 'plant'); mesh(S.plant, S.concrete, items.plant); mesh(S.stackGeo, S.stackMat, items.plant); mesh(S.tower, S.concrete, items.plant);
  const puffs = [];
  for (let i = 0; i < 12; i++) { const m = mesh(S.puff, S.smokeMat, items.plant); m.userData.noShadow = true; puffs.push(m); }
  const hole = mesh(S.holeGeo, S.holeMat, null); hole.name = 'city-hole-' + id; hole.position.set(...cityHome(id)); hole.position.y = 0.0006;
  for (const k of Object.keys(items)) items[k].visible = false;
  const tops = [[0.04, 0.142, -0.026], [0.04, 0.124, 0.008]];
  return {
    root, items, hole, lift, patch,
    smoke(t) {
      const T = onThrees(t);
      puffs.forEach((m, i) => {
        const s = i % 2, k = Math.floor(i / 2), ph = [0, 0.21, 0.37, 0.55, 0.71, 0.86][k] + s * 0.11;
        const age = (T * 0.35 + ph) % 1;
        const [x, y, z] = tops[s];
        m.position.set(x + age * 0.07 + Math.sin(k * 7.1 + s) * 0.01 * age, y + age * 0.12, z - age * 0.03 + Math.cos(k * 3.3) * 0.008 * age);
        m.scale.set(0.007 + age * 0.03, (0.007 + age * 0.03) * (0.7 + 0.2 * Math.sin(k * 2.1)), 0.007 + age * 0.026);
        m.rotation.set(k, k * 2.3, 0);
        m.visible = age > 0.03 && age < 0.97;
      });
    },
  };
}

// ------------------------------------------------------------------ the cardboard crowd (百模大战)
// Dozens of small cardboard court-card kings of the smaller labs, each holding up a "#1" placard, standing on
// both continents (more, and more crowded, on the CN side). pop 0..1 snaps them up (staggered, with a little
// overshoot); fall 0..1 knocks them over row by row from the head end to the foot end, face down toward the foot.
export const CROWD = {
  CN: ['文心 ERNIE', '混元 Hunyuan', 'MiniMax', '阶跃 Step', '零一 Yi', '百川 Baichuan', '星火 Spark', '商汤 SenseNova', '360 智脑', '天工 Skywork', '盘古 Pangu', '书生 InternLM', '面壁 MiniCPM', '紫东太初'],
  US: ['Cohere', 'Inflection', 'Perplexity', 'Reka', 'AI21', 'Nova', 'Phi', 'Granite', 'Nemotron', 'Character'],
  W: 0.074, H: 0.178, T: 0.0022, SCALE: 1.3,
};
const CROWD_OUTLINE = [[-0.034, 0, 1], [0.034, 0, 1], [0.033, 0.03], [0.03, 0.06], [0.033, 0.085], [0.036, 0.1], [0.04, 0.112, 1], [0.036, 0.12], [0.03, 0.124], [0.026, 0.128, 1], [0.0285, 0.168, 1], [0.0295, 0.172, 1], [0.022, 0.172, 1], [0.0225, 0.168, 1], [0.02, 0.13], [0.014, 0.126], [0.012, 0.132], [0.0125, 0.142, 1], [0.008, 0.138, 1], [0.004, 0.146, 1], [0.0, 0.138, 1], [-0.004, 0.146, 1], [-0.008, 0.138, 1], [-0.0125, 0.142, 1], [-0.012, 0.132], [-0.015, 0.126], [-0.026, 0.124], [-0.034, 0.112], [-0.036, 0.095], [-0.033, 0.06], [-0.035, 0.03]];
// the #1 placard on its stick, held up in the king's left hand (viewer's right)
const PLACARD = [[0.0255, 0.128, 1], [0.0278, 0.128, 1], [0.0278, 0.142, 1], [0.046, 0.142, 1], [0.046, 0.176, 1], [0.008, 0.176, 1], [0.008, 0.142, 1], [0.0255, 0.142, 1]];
function crowdAtlas(names) {
  const CW = 168, CHt = 404, cols = 8, rows = Math.ceil(names.length / cols);
  const c = canvas(CW * cols, CHt * rows), g = c.getContext('2d');
  const k = CW / 0.084;   // px per metre (cells are 0.084 x 0.2 m)
  const robes = ['#b3232a', '#23428a', '#2f6a44', '#6a2f6e', '#a8642a', '#2c5d78'];
  names.forEach((name, i) => {
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * CHt;
    const M = (x, y) => [ox + (x + 0.042) * k, oy + (0.19 - y) * k];
    const P = (pts, fill, w = 0.0012) => { g.beginPath(); pts.forEach(([x, y], j) => { const [a, b] = M(x, y); if (j) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (w) { g.lineWidth = w * k; g.strokeStyle = '#141010'; g.stroke(); } };
    g.fillStyle = '#f0eadc'; g.fillRect(ox, oy, CW, CHt);
    const robe = robes[(i * 5) % robes.length], YEL = '#e2b13a';
    P([[-0.036, 0], [0.036, 0], [0.034, 0.06], [0.04, 0.112], [0.026, 0.124], [-0.026, 0.124], [-0.04, 0.112], [-0.034, 0.06]], robe);
    P([[-0.01, 0], [0.01, 0], [0.008, 0.11], [-0.008, 0.11]], YEL, 0.001);
    P([[-0.03, 0.1], [0.03, 0.1], [0.027, 0.112], [-0.027, 0.112]], '#f6f2ea', 0.0008);
    P([[-0.012, 0.112], [0.012, 0.112], [0.013, 0.128], [-0.013, 0.128]], '#efcfa4', 0.0009);
    P([[-0.0125, 0.128], [0.0125, 0.128], [0.0125, 0.142], [0.008, 0.138], [0.004, 0.146], [0, 0.138], [-0.004, 0.146], [-0.008, 0.138], [-0.0125, 0.142]], YEL, 0.0009);
    g.fillStyle = '#141010';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(...M(s * 0.005, 0.121), 0.0011 * k, 0, TAU); g.fill(); }
    P([[-0.004, 0.116], [0.004, 0.116]], null, 0.0007);
    // the raised arm and the placard
    P([[0.018, 0.112], [0.024, 0.13], [0.03, 0.128], [0.028, 0.11]], robe, 0.0009);
    P([[0.008, 0.142], [0.046, 0.142], [0.046, 0.176], [0.008, 0.176]], '#ffffff', 0.0012);
    g.fillStyle = '#b3141a'; g.font = `900 ${Math.round(0.026 * k)}px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('#1', ...M(0.027, 0.1585));
    // the name band at the foot of the robe
    P([[-0.036, 0.008], [0.036, 0.008], [0.036, 0.03], [-0.036, 0.03]], '#f6f2ea', 0.0008);
    g.fillStyle = '#141010';
    const [zh, en] = name.includes(' ') && /[^\x00-\x7f]/.test(name) ? name.split(' ') : [name, ''];
    if (en) { fit(g, zh, ...M(0, 0.0225), 0.068 * k, Math.round(0.011 * k), FONT_HEI, '900'); fit(g, en, ...M(0, 0.0135), 0.068 * k, Math.round(0.0075 * k), FONT_SANS, '700'); }
    else fit(g, zh, ...M(0, 0.019), 0.068 * k, Math.round(0.012 * k), /[^\x00-\x7f]/.test(zh) ? FONT_HEI : FONT_SANS, '900');
  });
  return { tex: tex(c), cols, rows };
}
function buildCrowd() {
  const names = [...CROWD.CN, ...CROWD.US];
  const atlas = crowdAtlas(names);
  const poly = outline(CROWD_OUTLINE, 3);
  // the placard is part of the same cut-out: union by tracing both (placard drawn as a separate slab)
  const uvOf = (x, y) => [(x + 0.042) / 0.084, (y - 0.19 + 0.2) / 0.2];
  const body = cutout(poly, CROWD.T, uvOf), card = cutout(outline(PLACARD, 1), CROWD.T, uvOf);
  const geo = merge([body, xf(card, 0, 0, 0.0004)]);
  // positions: rows along each coast's continent band; CN two crowded rows, US one and a half
  const rng = new Rng(2024), spots = [];
  const add = (side, x, z) => spots.push({ side, x: SIDE_SIGN[side] * x + rng.range(-0.008, 0.008), z: z + rng.range(-0.02, 0.02), yaw: rng.range(-0.25, 0.25), cell: side === 'CN' ? rng.int(0, CROWD.CN.length - 1) : CROWD.CN.length + rng.int(0, CROWD.US.length - 1), delay: rng.range(0, 0.62) });
  for (let z = -2.95; z <= 2.96; z += 0.15) { add('CN', 0.592, z); add('CN', 0.672, z + 0.075); }
  for (let i = 0, z = -2.9; z <= 2.91; i++, z += 0.2) { add('US', 0.6, z); if (i % 2 === 0) add('US', 0.675, z + 0.1); }
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(spots.map((s) => s.cell)), 1);
  geo.setAttribute('aCell', cellAttr);
  const mat = cel({
    color: '#ffffff', id: ID.BOARD, gloss: 0.2, rim: 0.8, uniforms: { uAtlas: { value: atlas.tex } },
    vsHead: 'attribute float aCell; varying float vCell;', vertex: 'vCell = aCell;', fsHead: 'varying float vCell;',
    pattern: /* glsl */ `
      ${FADE}
      vec2 cell = vec2(mod(vCell, ${fl(atlas.cols)}), floor(vCell / ${fl(atlas.cols)}));
      vec2 auv = (cell + vec2(vUv.x, vUv.y)) / vec2(${fl(atlas.cols)}, ${fl(atlas.rows)});
      auv.y = 1.0 - ((cell.y + (1.0 - vUv.y)) / ${fl(atlas.rows)});
      if(vLocalN.z > 0.5){ col = tx(uAtlas, auv); idOut = ${fl(ID.PRINT)}; litBias += 0.1; emis = col * 0.32; }
      else if(vLocalN.z < -0.5){ col = ${lin('#8e897f')} * (0.9 + 0.15 * vnoise(vLocal.xy * vec2(60.0, 900.0))); emis = col * 0.06; }
      else col = ${lin('#9b8e78')};
    `,
  });
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  inst.frustumCulled = false; inst.name = 'cardboard-crowd';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = V3(), one = V3(CROWD.SCALE, CROWD.SCALE, CROWD.SCALE), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const back = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const update = (st) => {
    const pop = st?.pop ?? 0, fall = st?.fall ?? 0;
    inst.visible = !!st && pop > 0;
    if (!inst.visible) return;
    spots.forEach((s, i) => {
      const pp = clamp((pop - s.delay) / 0.3);
      if (pp <= 0) { inst.setMatrixAt(i, zero); return; }
      // standing up out of the table (lying on its back at 0), overshooting a little
      let ang = -Math.PI / 2 * (1 - back(pp));
      // dominoes: the head end goes first, each tips forward over its toes toward the foot
      const zn = (s.z + 3.1) / 6.2;
      const fq = clamp((fall * 1.25 - zn) * 4.5);
      if (fq > 0) ang = Math.PI / 2 * Math.min(1, fq * fq * 1.08) - 0.06 * Math.sin(Math.PI * clamp((fq - 0.85) / 0.15));
      e.set(ang, s.yaw, 0, 'YXZ'); q.setFromEuler(e);
      p.set(s.x, 0, s.z);
      m4.compose(p, q, one);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  return { root: inst, spots, update };
}

// ------------------------------------------------------------------ Meta's telescopic fishing rod and the $100M sack
// rod = { show, ext, reel, from, to }: the butt at `from` (his crown), eight telescoping sections arcing up the
// table; ext 0..1 the length out (1 = the tip right above `to`); a gold sack "$100M" hangs on the line;
// reel 0..1 winds it back: the rod retracts and the sack (with whoever hugs it) comes home.
export const ROD = { SECTIONS: 8, R0: 0.019, R1: 0.0048, RISE: 0.95, TIP_UP: 0.78, LINE: 0.5 };
function bagTexture() {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#b8902e'; g.fillRect(0, 0, 512, 256);
  const rng = new Rng(9);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rng.next() < 0.5 ? '255,236,170' : '90,60,10'},${rng.range(0.05, 0.16)})`; g.fillRect(rng.range(0, 512), rng.range(0, 256), rng.range(2, 9), 1.5); }
  g.fillStyle = '#2a1a08'; g.font = `900 92px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [128, 384]) { g.save(); g.translate(x, 132); g.scale(0.82, 1); g.fillText('$100M', 0, 0); g.restore(); }
  return tex(c, { clamp: false });
}
function buildRod() {
  const root = group(null, 'rod');
  const NS = 160, NR = 10;
  const pos = new Float32Array((NS + 1) * (NR + 1) * 3), nor = new Float32Array(pos.length), uv = new Float32Array((NS + 1) * (NR + 1) * 2), idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const rodMat = cel({
    color: '#b89c62', id: ID.WOOD, gloss: 1.0, rim: 1.2,
    pattern: /* glsl */ `
      // varnished split cane. vUv.x: 0 at the butt .. 1 at the tip; vUv.y: section index / 8
      float sec = vUv.y;
      col *= 0.85 + 0.2 * vnoise(vec2(vUv.x * 900.0, atan(vLocal.x, vLocal.z)));
      litBias += 0.45;   // a thin varnished cane catches the lamp all round: it must read against the dark
      ${ENV}
      col *= mix(1.0, env, 0.5);
      // a cork grip near the butt, gilt ferrules at every joint
      if(vUv.x < 0.03) col = ${lin('#a07850')} * (0.8 + 0.3 * vnoise(vLocal.xz * 900.0));
      float jn = fract(sec * 8.0);
      if(jn > 0.93) { col = ${lin('#c9a24e')}; gloss = 1.0; }
      specTh = 0.9;
    `,
  });
  const rod = mesh(geo, rodMat, root); rod.frustumCulled = false; rod.userData.noShadow = false;
  const line = mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 1, 5).translate(0, -0.5, 0), cel({ color: '#d8d4c8', id: 110, gloss: 0.4 }), root);
  line.userData.noShadow = true;
  const reelG = group(root, 'reel');
  mesh(merge([xf(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 20).rotateZ(Math.PI / 2)), xf(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), 0.0, -0.026, 0), xf(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 8).rotateZ(Math.PI / 2), 0.012, 0.0, 0.0), xf(new THREE.SphereGeometry(0.005, 8, 6), 0.026, 0, 0)]), brassMat({ color: '#b08a48' }), reelG);
  // the sack: fat burlap-gold body, a tied neck, a tuft
  const bag = group(root, 'bag');
  const bagGeo = lathe([[0, 0], [0.026, 0.002], [0.045, 0.016], [0.054, 0.04], [0.052, 0.066], [0.04, 0.088], [0.016, 0.1], [0.012, 0.104], [0.014, 0.112], [0.022, 0.124], [0.012, 0.128], [0, 0.126]], 28, { warp: (r, y, th) => [r * (1 + 0.06 * Math.sin(th * 3 + y * 40) * Math.sin(y * 30)), y] });
  mesh(bagGeo, cel({ color: '#c8a040', id: ID.BRASS, gloss: 0.3, rim: 1, uniforms: { uBag: { value: bagTexture() } }, pattern: `if(vLocal.y < 0.1){ col = tx(uBag, vec2(vUv.x * 2.0, clamp((vLocal.y - 0.012) / 0.08, 0.0, 1.0))); } else col *= 0.8;` }), bag, 0, -0.128, 0);
  mesh(new THREE.TorusGeometry(0.0135, 0.0025, 6, 16).rotateX(Math.PI / 2), cel({ color: '#5a3a1a', id: ID.WOOD, gloss: 0.2 }), bag, 0, -0.022, 0);
  const P0 = V3(), P1 = V3(), P2 = V3(), tmp = V3(), T = V3(), N = V3(), B = V3(), tip = V3(), bagPt = V3();
  const bez = (u, out) => { const a = 1 - u; return out.set(0, 0, 0).addScaledVector(P0, a * a).addScaledVector(P1, 2 * a * u).addScaledVector(P2, u * u); };
  let len = 0;
  const update = (st, t) => {
    root.visible = !!st && (st.show ?? 1) > 0;
    if (!root.visible) return;
    const from = st.from ?? [1.56, 0.78, 2.46], to = st.to ?? [...makerPos('openai')];
    P0.set(...from); P2.set(to[0], to[1] + ROD.TIP_UP, to[2]);
    P1.copy(P0).lerp(P2, 0.38); P1.y = Math.max(P0.y, P2.y) + ROD.RISE;
    const reel = clamp(st.reel ?? 0), ext = clamp(st.ext ?? 1) * (1 - 0.86 * smooth(reel));
    // lay the rod: arc-length is close enough to the bezier parameter for a gentle arc
    const uMax = Math.max(0.004, ext);
    len = 0;
    let prev = bez(0, V3());
    N.set(0, 1, 0);
    for (let i = 0; i <= NS; i++) {
      const u = (i / NS) * uMax;
      const p = bez(u, tmp.clone());
      bez(Math.min(1, u + 0.002), T).sub(bez(Math.max(0, u - 0.002), B)).normalize();
      if (i) len += p.distanceTo(prev);
      prev = p;
      N.sub(B.copy(T).multiplyScalar(N.dot(T))).normalize();
      B.crossVectors(T, N);
      // section index: sections out so far, each thinner than the last
      const fs = (u / Math.max(uMax, 1e-4)) * Math.max(1, Math.ceil(ext * ROD.SECTIONS - 1e-6));
      const sec = Math.min(ROD.SECTIONS - 1, Math.floor(fs));
      const r = lerp(ROD.R0, ROD.R1, sec / (ROD.SECTIONS - 1)) * (fract1(fs) > 0.94 ? 1.25 : 1);
      for (let j = 0; j <= NR; j++) {
        const a = (j / NR) * TAU, c = Math.cos(a), s = Math.sin(a);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s, k = (i * (NR + 1) + j);
        pos[k * 3] = p.x + nx * r; pos[k * 3 + 1] = p.y + ny * r; pos[k * 3 + 2] = p.z + nz * r;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        uv[k * 2] = u; uv[k * 2 + 1] = fs / ROD.SECTIONS;
      }
      if (i === NS) tip.copy(p);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
    geo.computeBoundingSphere();
    reelG.position.copy(bez(0.012, tmp)); reelG.position.y -= 0.02;
    // the line and the sack, swinging a little
    const L = ROD.LINE * (1 - 0.55 * smooth(reel)) + 0.06;
    const sw = 0.12 * Math.sin(t * 2.1) * (0.3 + reel), sw2 = 0.06 * Math.sin(t * 1.3 + 1);
    bagPt.set(tip.x + Math.sin(sw) * L, tip.y - Math.cos(sw) * L, tip.z + Math.sin(sw2) * L * 0.5);
    line.position.copy(tip);
    line.scale.set(1, tip.distanceTo(bagPt), 1);
    line.quaternion.setFromUnitVectors(V3(0, -1, 0), tmp.copy(bagPt).sub(tip).normalize());
    bag.position.copy(bagPt);
    bag.rotation.set(sw2 * 0.5, t * 0.4, sw * 0.6);
  };
  return { root, update, bagPoint: (out) => out.copy(bagPt).add(V3(0, -0.07, 0)), tip: (out) => out.copy(tip) };
}
const fract1 = (x) => x - Math.floor(x);

// ------------------------------------------------------------------ the make-up brush (4-02)
// brush = { show, at, u }: a big powder brush makes one swipe across the card lying at `at` (world), u 0..1.
function buildBrush() {
  const root = group(null, 'brush');
  const handle = lathe([[0, 0], [0.006, 0], [0.0085, 0.03], [0.0095, 0.12], [0.0088, 0.2], [0.0062, 0.235], [0.0, 0.238]], 18);
  const ferrule = lathe([[0.0095, -0.03], [0.012, -0.03], [0.0115, 0.002], [0.0095, 0.004]], 18);
  const head = lathe([[0, -0.062], [0.012, -0.06], [0.022, -0.052], [0.027, -0.04], [0.025, -0.02], [0.017, -0.004], [0.012, 0], [0, 0]], 28, { warp: (r, y, th) => [r * (1 + 0.04 * Math.sin(th * 13 + y * 200)), y] });
  const stick = group(root, 'stick');
  mesh(handle, cel({ color: '#1c1714', id: ID.WOOD, gloss: 1.0, rim: 1, pattern: `${ENV} col *= mix(1.0, env, 0.5); specTh = 0.88; if(vLocal.y > 0.2) col = ${lin('#c9a24e')};` }), stick);
  mesh(ferrule, brassMat({ color: '#c9a24e' }), stick);
  const bristle = group(stick, 'head', 0, -0.03, 0);
  mesh(head, cel({ color: '#5a4434', id: ID.LEAF, gloss: 0.05, rim: 1, pattern: `${FADE} float a = atan(vLocal.x, vLocal.z); col *= 0.8 + 0.3 * vnoise(vec2(a * 30.0, vLocal.y * 60.0)) ; col = mix(col, ${lin('#e8d2c0')}, smoothstep(-0.03, -0.058, vLocal.y) * 0.8);` }), bristle);
  const A = V3(), Bv = V3(), Cc = V3();
  const update = (st) => {
    root.visible = !!st && (st.show ?? 1) > 0;
    if (!root.visible) return;
    const at = st.at ?? [0, 0.01, 0];
    const u = clamp(st.u ?? 0);
    // approach high on the left, press down on the card, drag right, lift
    const x = lerp(-0.16, 0.16, smooth(u)), down = Math.sin(Math.PI * clamp((u - 0.12) / 0.76));
    const th = 0.75 - 0.25 * down;   // the bristle tip sits 0.092 down the handle's axis
    A.set(at[0] + x - Math.sin(th) * 0.092, at[1] + 0.004 + Math.cos(th) * 0.092 + 0.05 * (1 - down), at[2] - 0.01);
    stick.position.copy(A);
    stick.rotation.set(0.0, 0, th, 'YXZ');
    bristle.scale.set(1 + 0.18 * down, 1 - 0.2 * down, 1 + 0.12 * down);
    void Bv; void Cc;
  };
  return { root, update };
}

// ------------------------------------------------------------------ split-flap price tags (4-03)
// tags[id] = { show, text, prev, flip, hand }: a little black paddle with a six-cell split-flap window,
// held in the king's hand ('L'|'R') or standing on the table in front of him. flip 0..1 animates prev -> text.
const TAG_CHARS = ' 0123456789.¥-';
let _tagShared = null;
function tagShared() {
  if (_tagShared) return _tagShared;
  const G = 96, c = canvas(G * TAG_CHARS.length, G * 2), g = c.getContext('2d');
  g.fillStyle = '#121212'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#efe6d0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [...TAG_CHARS].forEach((ch, i) => { g.font = `700 ${ch === '¥' ? 142 : 156}px ${ch === '¥' ? FONT_HEI : FONT_SANS}`; g.save(); g.translate(i * G + G / 2, G); g.scale(0.82, 1); g.fillText(ch, 0, 8); g.restore(); });
  g.fillStyle = '#000'; g.fillRect(0, G - 2, c.width, 4);
  const atlas = tex(c);
  const body = merge([xf(softBox(0.135, 0.05, 0.022, 0.004)), xf(new THREE.CylinderGeometry(0.0055, 0.0065, 0.09, 12), 0, -0.07, 0)]);
  return (_tagShared = { atlas, body, bodyMat: cel({ color: '#1a1a1c', id: ID.STEEL, gloss: 0.9, rim: 1, pattern: `${ENV} col *= mix(1.0, env, 0.5); if(vLocal.y < -0.026) col = ${lin('#3a2a1c')};` }), cell: new THREE.PlaneGeometry(0.0168, 0.0155) });
}
function buildTag(id) {
  const S = tagShared();
  const root = group(null, 'tag-' + id);
  mesh(S.body, S.bodyMat, root);
  const cells = [];
  for (let c = 0; c < 6; c++) {
    const x = -0.0525 + c * 0.021, mk = (half, ch) => {
      const u = { uCh: { value: 0 }, uHalf: { value: half } };
      const m = glowMaterial({ color: '#ffffff', id: 145, map: null, uniforms: { uAtlas: { value: S.atlas }, ...u }, side: THREE.DoubleSide,
        pattern: `vec2 uv = vec2((uCh + vUv.x) / ${fl(TAG_CHARS.length)}, uHalf > 0.5 ? vUv.y * 0.5 : 0.5 + vUv.y * 0.5); col = pow(texture(uAtlas, uv).rgb, vec3(1.22)) * 0.9; if(!gl_FrontFacing) col *= 0.7;` });
      return { m, u };
    };
    const topS = mk(0), botS = mk(1), flapF = mk(0), flapB = mk(1);
    const ts = mesh(S.cell, topS.m, root, x, 0.0078, 0.0112), bs = mesh(S.cell, botS.m, root, x, -0.0078, 0.0112);
    const hinge = group(root, 'hinge', x, 0, 0.0116);
    const ff = mesh(S.cell, flapF.m, hinge, 0, 0.0078, 0.0002), fb = mesh(S.cell, flapB.m, hinge, 0, 0.0078, 0.0001, 0, Math.PI, Math.PI);
    for (const q of [ts, bs, ff, fb]) q.userData.noShadow = true;
    cells.push({ topS, botS, flapF, flapB, hinge, ff, fb });
  }
  const glyph = (str, i) => { const s = (str ?? '').padStart(6, ' ').slice(-6); const k = TAG_CHARS.indexOf(s[i]); return k < 0 ? 0 : k; };
  return {
    root,
    update(tg) {
      root.visible = !!tg && (tg.show ?? 1) > 0;
      if (!root.visible) return;
      const flip = clamp(tg.flip ?? 1), prev = tg.prev ?? tg.text;
      cells.forEach((c, i) => {
        const a = glyph(prev, i), b = glyph(tg.text, i);
        const f = a === b ? 1 : clamp((flip * 1.5 - (5 - i) * 0.1) / 1.0);
        c.topS.u.uCh.value = f > 0 ? b : a;      // behind the falling flap: the new top
        c.botS.u.uCh.value = f >= 1 ? b : a;     // until covered: the old bottom
        c.flapF.u.uCh.value = a; c.flapB.u.uCh.value = b;
        c.hinge.rotation.x = Math.PI * (f >= 1 ? 1 : smooth(f));
        const moving = f > 0 && f < 1;
        c.hinge.visible = moving;
      });
    },
  };
}

// ------------------------------------------------------------------ sacks on every king's back (4-11)
// sacks[id] = { show, leak }: one identical fat burlap sack between each king's back and his chair, its
// mouth over his right shoulder, other companies' cards poking out. Placed from api.bodyFrame(id, out)
// (origin = seat centre, +z front, +y up, x = the king's left; scaled by the king's size), or from the seat.
// leak 0..1 (Claude's): old hardbacks drop out of a split seam one by one and pile up on the floor.
// HOLE / PILE: where the seam splits and where the books land, in the leaking king's body frame (x left, z front, x size)
// the slung sack's bend: from height yb (m, in the sack's frame) to its top the neck turns forward through `bend`
const SLUNG = { yb: 0.33, bend: 1.15 };
export const SACK = {
  at: [-0.22, 0.44, -0.19], rot: [0.5, 0.15, 0.48], SCALE: 1.3, BOOKS: 40, HOLE: [-0.46, 0.42, -0.2], PILE: [-0.58, 0.02],
  // with api.bodyFrame (upper back, +z out of the back, +x his right): position (x, y scaled by size; z in metres),
  // rotation, scale (x, y by size; z absolute): a pack 13 cm deep pressed between his back and the chair
  // the slung sack's bottom in the body frame (x, y scaled by size): over the shoulder that faces the foot (the
  // CN king's right, the US king's left: mirror-symmetric for M1), out over the shoulder tip, above the collar
  BACK: { at: [0.18, -0.25, 0.062], rot: [0.04, 0, -0.2] },
};
function cardLogoAtlas() {
  const W = 192, H = 270, c = canvas(W * KINGS.length, H), g = c.getContext('2d');
  KINGS.forEach((k, i) => {
    const x0 = i * W, brand = BRAND[k.id] ?? '#b3262a';
    g.fillStyle = brand; g.fillRect(x0, 0, W, H);
    g.fillStyle = '#f7f2e6'; g.fillRect(x0 + 14, 14, W - 28, H - 28);
    g.strokeStyle = brand; g.lineWidth = 5; g.strokeRect(x0 + 22, 22, W - 44, H - 44);
    try { drawLogo(g, k.id, x0 + W / 2, H * 0.44, 118); } catch (e) { g.fillStyle = '#222'; g.font = `900 90px ${FONT_SANS}`; g.textAlign = 'center'; g.fillText(k.name[0], x0 + W / 2, H * 0.5); }
    g.fillStyle = '#141010'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, WORDS[k.id] ?? k.name, x0 + W / 2, H * 0.82, W - 56, 30, FONT_SANS, '900');
  });
  return tex(c);
}
let _sackShared = null;
function sackShared() {
  if (_sackShared) return _sackShared;
  const prof = [[0, 0], [0.07, 0.006], [0.115, 0.04], [0.135, 0.11], [0.138, 0.2], [0.128, 0.29], [0.1, 0.35], [0.06, 0.385], [0.042, 0.4], [0.04, 0.415], [0.058, 0.44], [0.062, 0.455], [0.05, 0.458], [0.03, 0.45], [0, 0.445]];
  const body = lathe(prof, 40, { warp: (r, y, th) => [r * 1.22 * (1 + 0.07 * Math.sin(th * 3 + y * 11) * Math.sin(y * 9) + 0.05 * Math.sin(th * 7 + 2)), y] });
  const mat = cel({
    color: '#6a5232', id: ID.WOOD, gloss: 0.05, rim: 2.0,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0003, 0.0012, mpp);
      float a = atan(vLocal.x, vLocal.z);
      vec2 w = vec2(a * 70.0, vLocal.y * 520.0);
      float weave = (step(0.5, fract(w.x)) == step(0.5, fract(w.y))) ? 1.0 : 0.0;
      col *= 1.0 - 0.18 * weave * fine;
      col *= 0.85 + 0.25 * fbm2(vec2(a * 3.0, vLocal.y * 12.0));
      // a stencilled sack mark, faded
      if(vLocal.y > 0.12 && vLocal.y < 0.22 && abs(a) < 0.5) col *= 1.0 - 0.3 * step(0.55, vnoise(vec2(a * 30.0, vLocal.y * 120.0))) * step(abs(a), 0.42) * step(abs(vLocal.y - 0.17), 0.03);
      // the rope tie
      if(vLocal.y > 0.398 && vLocal.y < 0.418) { col = ${lin('#c8b088')}; col *= 0.8 + 0.4 * step(0.5, fract(a * 6.0 + vLocal.y * 300.0)); }
      // a hard warm rim: the sack's silhouette must read against the dark chair in a high wide
      vec3 sV = normalize(cameraPosition - vWorld);
      float rimS = smoothstep(0.5, 0.85, 1.0 - abs(dot(N, sV)));
      emis += ${lin('#e8c890')} * rimS * 0.55;
      litBias += 0.15;
    `,
  });
  const atlas = cardLogoAtlas();
  const cardMat = cel({ color: '#ffffff', id: 30, gloss: 0.3, side: THREE.DoubleSide, uniforms: { uAtlas: { value: atlas } }, pattern: 'col = tx(uAtlas, vUv); if(!gl_FrontFacing) col = vec3(0.6, 0.12, 0.12); litBias += 0.25; emis = col * 0.28;' });
  const card = (cell) => { const g = new THREE.PlaneGeometry(0.11, 0.155); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / KINGS.length); return g; };
  const book = new THREE.BoxGeometry(1, 1, 1);
  const bookMat = cel({
    color: '#ffffff', id: ID.LEAF, gloss: 0.3, rim: 1,
    pattern: /* glsl */ `
      ${FADE}
      vec3 n = vLocalN;
      if(abs(n.y) > 0.5){ col *= 0.95 + 0.1 * vnoise(vLocal.xz * 40.0); }                 // boards
      else if(n.x < -0.5){ if(abs(fract(vLocal.z * 6.0 + 0.5) - 0.5) < 0.06) col = ${lin('#c9a24e')}; }   // the spine, gilt bands
      else { col = ${lin('#e2d8bf')} * (0.9 + 0.1 * step(0.5, fract(vLocal.y * 90.0))); }      // the page block
      // they fall into the chairs' shadow: a rim and a little lift so the pile still reads
      vec3 bV = normalize(cameraPosition - vWorld);
      emis += col * (0.22 + 0.9 * smoothstep(0.55, 0.9, 1.0 - abs(dot(N, bV))));
    `,
  });
  // slung: the same sack flattened to a 11 cm deep pack (for a nominal king), its top bent forward through
  // SLUNG.bend rad so the neck lies over the right shoulder (its local -z is forward)
  const slung = body.clone();
  { const P = slung.attributes.position, { yb, bend } = SLUNG; const top = 0.458 * 1.25, k = bend / (top - yb);
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i) * 1.07, y = P.getY(i) * 1.25, z = P.getZ(i) * 0.33;
      if (y > yb) { const a = (y - yb) * k, d = y - yb; const ny = yb + d * Math.cos(a) + z * Math.sin(a); z = -d * Math.sin(a) + z * Math.cos(a); y = ny; }
      P.setXYZ(i, x, y, z);
    }
    slung.computeVertexNormals(); }
  return (_sackShared = { body, slung, mat, card, cardMat, book, bookMat });
}
function buildSack(id, idx) {
  const S = sackShared();
  const root = group(null, 'sack-' + id);
  const tilt = group(root, 'tilt');
  const upright = mesh(S.body, S.mat, tilt), slung = mesh(S.slung, S.mat, tilt); slung.visible = false;
  // three of the others' cards poking out of the mouth, fanned
  const others = [1, 3, 6].map((d) => (idx + d) % KINGS.length);
  const cards = group(null, 'sack-cards-' + id);
  others.forEach((ci, j) => { const c = mesh(S.card(ci), S.cardMat, cards, (j - 1) * 0.045, 0.07 + 0.015 * (1 - Math.abs(j - 1)), 0.012 * (j - 1), -0.25, 0.25 * (j - 1), -(j - 1) * 0.36); c.userData.noShadow = true; });
  return { root, tilt, cards, upright, slung, hole: V3(0.12, 0.08, 0) };
}
function buildBooks() {
  const S = sackShared();
  const n = SACK.BOOKS, rng = new Rng(77);
  const inst = new THREE.InstancedMesh(S.book, S.bookMat, n);
  inst.frustumCulled = false; inst.name = 'leaking-books';
  const COVERS = ['#5a1c18', '#1f3a2a', '#3a2a1a', '#1c2a4a', '#4a3a20', '#2a1a2a'];
  const books = [];
  // rest spots in a heap around the pile centre (floor frame), stacked as they land
  const heights = [];
  for (let i = 0; i < n; i++) {
    const r = 0.13 * Math.sqrt(rng.next()), a = rng.range(0, TAU);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let h = 0; for (const [hx, hz, hy] of heights) if (Math.hypot(hx - x, hz - z) < 0.065) h = Math.max(h, hy);
    const size = [rng.range(0.055, 0.07), rng.range(0.014, 0.022), rng.range(0.075, 0.095)];
    const y = h + size[1] / 2;
    heights.push([x, z, y + size[1] / 2]);
    books.push({ rest: [x, y, z], yaw: rng.range(0, TAU), tilt: [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)], size, spin: [rng.range(-9, 9), rng.range(-9, 9), rng.range(-6, 6)], kick: [rng.range(-0.25, 0.25), rng.range(0.05, 0.25)] });
    inst.setColorAt(i, new THREE.Color(C(COVERS[i % COVERS.length])));
  }
  inst.instanceColor.needsUpdate = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = V3(), sc = V3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // leak 0..1; hole: world point of the split seam; pile: world floor point under it
  const update = (leak, hole, pile) => {
    inst.visible = leak > 0;
    if (!inst.visible) return;
    books.forEach((b, i) => {
      const r = (i / n) * 0.9, qq = (leak - r) / 0.07;
      if (qq <= 0) { inst.setMatrixAt(i, zero); return; }
      const f = Math.min(1, qq);
      const tx = pile.x + b.rest[0], tz = pile.z + b.rest[2], ty = pile.y + b.rest[1];
      // fall: horizontal glide out of the seam, vertical under gravity
      p.set(lerp(hole.x, tx, f) + b.kick[0] * Math.sin(Math.PI * f) * 0.3, lerp(hole.y, ty, f * f), lerp(hole.z, tz, f) + b.kick[1] * Math.sin(Math.PI * f) * 0.3);
      const tumble = 1 - f;
      e.set(b.tilt[0] + b.spin[0] * tumble, b.yaw + b.spin[2] * tumble, b.tilt[1] + b.spin[1] * tumble, 'YXZ'); q.setFromEuler(e);
      sc.set(...b.size);
      m.compose(p, q, sc);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  return { root: inst, update };
}

// ------------------------------------------------------------------ approval flaps and personal stamps (6-09)
// flaps[id] = { up, stamp }: a small "批准？ APPROVE?" card flips up in front of the king (hinged at its foot,
// printed on both sides, a card: it keeps its colour); stamp 0..1: the seal comes down, at 0.5 a red ✓ is there.
// stamps[id] = { hand }: a small personal seal in the king's hand ('L'|'R', across the palm, face toward the
// little finger) or, with no hand, standing on the table beside the flap.
export function flapPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.11, 0, SEAT.Z[k.seat] - 0.02]; }
let _flapShared = null;
function flapShared() {
  if (_flapShared) return _flapShared;
  const mk = (check) => {
    const c = canvas(384, 256), g = c.getContext('2d');
    g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, 384, 256);
    g.strokeStyle = '#1a1414'; g.lineWidth = 8; g.strokeRect(10, 10, 364, 236);
    g.fillStyle = '#1a1414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 104px ${FONT_HEI}`; g.fillText('批准？', 192, 104);
    g.font = `700 40px ${FONT_SANS}`; g.fillText('A P P R O V E ?', 192, 196);
    if (check) {
      g.save(); g.translate(270, 132); g.rotate(-0.12);
      g.strokeStyle = 'rgba(196,26,22,0.92)'; g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 86, 0, TAU); g.stroke();
      g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-46, 4); g.lineTo(-10, 42); g.lineTo(52, -44); g.stroke();
      g.restore();
    }
    return tex(c);
  };
  const plain = mk(false), checked = mk(true);
  const geo = new THREE.BoxGeometry(0.13, 0.088, 0.003).translate(0, 0.044, 0);
  const base = softBox(0.14, 0.008, 0.026, 0.002).translate(0, 0.004, 0);
  const seal = merge([xf(lathe([[0, 0], [0.012, 0], [0.012, 0.006], [0.009, 0.01], [0.0075, 0.03], [0.011, 0.045], [0.0085, 0.054], [0, 0.056]], 16))]);
  return { plain, checked, geo, base, seal };
}
function buildFlap(id) {
  const S = flapShared();
  const root = group(null, 'flap-' + id);
  root.position.set(...flapPos(id));
  root.rotation.y = KING[id].side === 'CN' ? -Math.PI / 2 : Math.PI / 2;     // its front faces the king
  mesh(S.base, steelMat({ color: '#5a5c60' }), root);
  const hinge = group(root, 'hinge', 0, 0.007, 0);
  const uChk = { value: 0 };
  mesh(S.geo, cel({ color: '#ffffff', id: 30, gloss: 0.25, uniforms: { uA: { value: S.plain }, uB: { value: S.checked }, uChk },
    pattern: `vec2 u = vec2(vLocal.x / 0.13 + 0.5, vLocal.y / 0.088); if(vLocalN.z < -0.5) u.x = 1.0 - u.x; col = abs(vLocalN.z) > 0.5 ? mix(tx(uA, u), tx(uB, u), vLocalN.z > 0.5 ? uChk : 0.0) : vec3(0.8, 0.76, 0.68); litBias += 0.12;` }), hinge);
  const seal = mesh(S.seal, cel({ color: '#5a3a24', id: ID.WOOD, gloss: 0.6, pattern: `if(vLocal.y < 0.007) col = ${lin('#a11814')}; ${ENV} col *= mix(1.0, env, 0.3);` }), null);
  return {
    root, seal,
    update(f) {
      root.visible = !!f && (f.up ?? 0) > 0;
      if (!root.visible) return;
      const up = clamp(f.up), st = clamp(f.stamp ?? 0);
      const c1 = 1.70158, back = (x) => 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      const hit = Math.exp(-Math.max(0, st - 0.5) * 18) * (st > 0.5 ? 1 : 0);
      hinge.rotation.x = -(Math.PI / 2) * (1 - back(up)) - 0.22 * hit;
      uChk.value = st >= 0.5 ? 1 : 0;
    },
  };
}
// @@NEW@@

// ------------------------------------------------------------------ assembly
// root
//   tableRoot  everything standing on the tabletop (consoles, presses, makers, ashtrays, paper dolls):
//              reparent it under set.tableTop and it follows the wobble (its frame equals the world at rest)
//   roomRoot   the seals and their chains, the Mistral standee on the floor
//   heldRoot   cigars and glasses, placed in world space every frame (in a hand, an ashtray, on the table)
const _H = new THREE.Matrix4(), _R = new THREE.Matrix4(), _M = new THREE.Matrix4(), _A = new THREE.Matrix4();
const _p = V3(), _q = new THREE.Quaternion(), _s = V3(), _e = new THREE.Euler(), _one = V3(1, 1, 1), _v = V3(), _w = V3();
function handMatrix(api, id, side, out) {
  const m = api?.handFrame?.(id, side);
  if (!m) return false;
  m.decompose(_p, _q, _s);
  out.compose(_p, _q, _one);
  return true;
}
// a king's body frame: api.bodyFrame(id, out) if the kings module offers it, else his seat (origin at the seat
// centre, +z toward the table, x = his left), scaled by his size
const KING_S = (id) => 1.22 * KING[id].size;
function bodyMatrix(api, id, out) {
  if (api?.bodyFrame) { const m = api.bodyFrame(id, out); if (m && m !== out) out.copy(m); out.decompose(_p, _q, _s); return out.compose(_p, _q, _one); }
  return out.compose(V3(...seatPos(id)), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), seatYaw(id)), _one);
}
const asMatrix = (at, out) => (at?.isMatrix4 ? out.copy(at) : out.makeTranslation(at[0], at[1], at[2]));
export function makeProps(ctx = {}) {
  void ctx;
  const root = group(null, 'props');
  const tableRoot = group(root, 'props-table');
  const roomRoot = group(root, 'props-room');
  const heldRoot = group(root, 'props-held');
  const consoles = {}, presses = {}, makers = {}, trays = {}, cigars = {}, glasses = {}, feeds = {}, tags = {}, sacks = {}, flaps = {}, layouts = {};
  KINGS.forEach((k, i) => {
    const id = k.id;
    consoles[id] = buildConsole(id); tableRoot.add(consoles[id].root);
    presses[id] = buildPress(id); tableRoot.add(presses[id].root);
    makers[id] = buildMaker(id); tableRoot.add(makers[id].root);
    trays[id] = buildTray(id); tableRoot.add(trays[id]);
    cigars[id] = buildCigar(id); heldRoot.add(cigars[id].root); heldRoot.add(cigars[id].fall);
    glasses[id] = buildGlass(id); heldRoot.add(glasses[id].root);
    feeds[id] = buildFeed(id); presses[id].root.add(feeds[id].root); feeds[id].root.position.set(...MOUTH); tableRoot.add(feeds[id].hole); feeds[id].hole.visible = false;
    for (const c of makers[id].shovelChips) heldRoot.add(c);
    tags[id] = buildTag(id); heldRoot.add(tags[id].root);
    sacks[id] = buildSack(id, i); heldRoot.add(sacks[id].root); heldRoot.add(sacks[id].cards);
    flaps[id] = buildFlap(id); tableRoot.add(flaps[id].root); heldRoot.add(flaps[id].seal);
    layouts[id] = chipLayouts(1000 + i * 17);
  });
  const seals = { US: buildSeal('US'), CN: buildSeal('CN') };
  roomRoot.add(seals.US.root, seals.CN.root);
  const chainMat = ironMat({ color: '#353331', seed: 4.0, scratch: 0.15, mottleK: 0.5, metal: 0.55 });
  const chain = new THREE.InstancedMesh(sealShared().link, chainMat, 2 * 170);
  chain.frustumCulled = false; chain.count = 0; chain.name = 'seal-chains';
  roomRoot.add(chain);
  const people = buildPeople(); tableRoot.add(people.root);
  const eu = makeMistral(); roomRoot.add(eu.root);
  // chips: one instanced mesh per kind for every stack, mountain and hopper heap on the table
  const chipMesh = { US: new THREE.InstancedMesh(chipGeometry(16), chipMaterial('US'), 3200), CN: new THREE.InstancedMesh(chipGeometry(16), chipMaterial('CN'), 3200) };
  for (const m of Object.values(chipMesh)) { m.frustumCulled = false; m.count = 0; tableRoot.add(m); }
  // the doll chains being fed to the hoppers
  const hopDolls = new THREE.InstancedMesh(dollShared().geo, dollShared().mat, 160);
  hopDolls.frustumCulled = false; hopDolls.count = 0; hopDolls.name = 'hopper-dolls'; tableRoot.add(hopDolls);
  const crowd = buildCrowd(); tableRoot.add(crowd.root);
  const rod = buildRod(); roomRoot.add(rod.root);
  const brush = buildBrush(); roomRoot.add(brush.root);
  const books = buildBooks(); roomRoot.add(books.root);

  function placeCigar(id, c, t, api) {
    const cg = cigars[id];
    cg.root.visible = !!c; cg.fall.visible = false;
    if (!c) return;
    const side = c.hand === 'L' || c.hand === 'R' || c.hand === 'M' ? c.hand : null;
    if (side === 'M' && handMatrix(api, id, 'M', _H)) {
      // clenched in the teeth: mouth frame origin = the lips, +y out along the cigar, +z up; butt at the lips
      _R.makeRotationX(-Math.PI / 2);
      _R.setPosition(0, HOLD.mouth.inset, 0);
      _M.multiplyMatrices(_H, _R);
    } else if (side && side !== 'M' && handMatrix(api, id, side, _H)) {
      const dir = side === 'R' ? -1 : 1, h = HOLD.cigar;
      _R.makeRotationY(dir < 0 ? -Math.PI / 2 : Math.PI / 2);
      _R.setPosition(h.at[0] - dir * h.grip * CIGAR.L, h.at[1], h.at[2]);
      _M.multiplyMatrices(_H, _R);
    } else {
      // resting across the tray's +x notch, the foot dipping over the bowl
      trays[id].updateWorldMatrix(true, false);
      const tilt = 0.07, f = 0.4;
      _R.makeRotationFromEuler(_e.set(tilt, -Math.PI / 2, 0, 'YXZ'));
      _R.setPosition(0.057 + f * CIGAR.L * Math.cos(tilt), TRAY.NOTCH + CIGAR.R * 0.95 + f * CIGAR.L * Math.sin(tilt), 0);
      _M.multiplyMatrices(trays[id].matrixWorld, _R);
    }
    setWorld(cg.root, _M);
    const lit = clamp(c.lit ?? 0), glow = clamp(c.glow ?? 0);
    const dropped = c.ashDrop != null && t >= c.ashDrop;
    const len = dropped ? 0 : clamp(c.ash ?? 0) * CIGAR.ASH;
    cg.ash.visible = len > 0.0006; cg.ash.scale.set(1, 1, Math.max(len, 1e-4));
    cg.mat.uniforms.uLit.value = lit;
    cg.uFace.value = lit; cg.uGlow.value = glow;
    cg.ring.visible = lit > 0.001; cg.face.visible = lit > 0.001 && len <= 0.0006;
    if (!dropped) return;
    // the ash falls from where it sat on the cigar, tumbles, lands and crumbles
    const dt = t - c.ashDrop, flen = Math.max(0.008, clamp(c.ash ?? 0.6) * CIGAR.ASH);
    _A.makeTranslation(0, 0, CIGAR.L); _A.premultiply(_M);
    _A.decompose(_p, _q, _s);
    _v.set(0, 0, flen / 2).applyQuaternion(_q).add(_p);
    trays[id].updateWorldMatrix(true, false);
    _w.setFromMatrixPosition(trays[id].matrixWorld);
    tableRoot.updateWorldMatrix(true, false);
    const tableY = _s.setFromMatrixPosition(tableRoot.matrixWorld).y;
    const overTray = Math.hypot(_v.x - _w.x, _v.z - _w.z) < 0.046;
    const landY = (overTray ? _w.y + TRAY.BOWL + 0.002 : tableY) + 0.003;
    const fallD = 0.5 * 9.8 * dt * dt, tl = Math.sqrt(Math.max(0, (_v.y - landY) * 2 / 9.8));
    const fall = cg.fall;
    fall.visible = true;
    if (dt < tl) {
      fall.position.set(_v.x, _v.y - fallD, _v.z);
      fall.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), dt * 6));
      fall.scale.set(1, 1, flen);
      fall.position.addScaledVector(V3(0, 0, -flen / 2).applyQuaternion(fall.quaternion), 1);
    } else {
      const along = V3(0, 0, 1).applyQuaternion(_q); along.y = 0; if (along.lengthSq() < 1e-6) along.set(1, 0, 0); along.normalize();
      fall.quaternion.setFromUnitVectors(V3(0, 0, 1), along);
      fall.scale.set(1.35, 0.5, flen * 0.8);
      fall.position.set(_v.x, landY - 0.0005, _v.z).addScaledVector(along, -flen * 0.4);
    }
  }
  function placeGlass(id, gs, api) {
    const G = glasses[id];
    G.root.visible = !!gs;
    if (!gs) return;
    const side = gs.hand === 'L' || gs.hand === 'R' ? gs.hand : null;
    if (side && handMatrix(api, id, side, _H)) {
      const dir = side === 'R' ? 1 : -1, h = HOLD.glass;
      _R.makeRotationZ(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      _R.setPosition(h.at[0] - dir * h.grip, h.at[1], h.at[2]);
      _M.multiplyMatrices(_H, _R);
    } else {
      tableRoot.updateWorldMatrix(true, false);
      _M.makeTranslation(...(gs.at ?? glassPos(id))).premultiply(tableRoot.matrixWorld);
    }
    setWorld(G.root, _M);
    const wine = clamp(gs.wine ?? 0.6);
    G.wine.visible = wine > 0.005;
    G.uLevel.value = _v.set(0, 0.0662 + wine * (0.1352 - 0.0662 - 0.003), 0).applyMatrix4(_M).y;
  }
  function updateSeals(st = {}) {
    let n = 0;
    for (const side of ['US', 'CN']) {
      const s = st[side], sl = seals[side];
      sl.root.visible = !!s;
      if (!s) continue;
      const home = s.at ?? SEAL.HOME[side];
      if (s.chain && s.chain.length >= 2) {
        const pts = s.chain.map((p) => (p.isVector3 ? p.clone() : V3(...p)));
        const end = pts[pts.length - 1];
        sl.root.position.set(end.x, end.y - sl.hang, end.z);
        const curve = new THREE.CatmullRomCurve3(pts.reverse(), false, 'centripetal');
        const dense = curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / 0.02)));
        n += layChain(chain, n, dense, 170);
      } else {
        const y = lerp(SEAL.HIDE_Y, home[1] ?? 0, clamp(s.drop ?? 0));
        sl.root.position.set(home[0], y, home[2]);
        n += layChain(chain, n, [V3(home[0], y + sl.hang, home[2]), V3(home[0], SEAL.TOP_Y, home[2])], 170);
      }
      sl.body.rotation.y = s.spin ?? 0;
    }
    chain.count = n;
    chain.instanceMatrix.needsUpdate = true;
  }
  // ---- chips on the table: stacks, mountains, heaps in the hoppers
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), ce = new THREE.Euler(), cp = V3(), cs = V3(1, 1, 1), pm = new THREE.Matrix4();
  function updateChips(st, pr) {
    const n = { US: 0, CN: 0 };
    const put = (kind, x, y, z, rx, ry, rz) => {
      const m = chipMesh[kind]; if (n[kind] >= m.instanceMatrix.count) return;
      ce.set(rx, ry, rz); cq.setFromEuler(ce); cp.set(x, y, z); cm.compose(cp, cq, cs); m.setMatrixAt(n[kind]++, cm);
    };
    for (const k of KINGS) {
      const id = k.id, c = st?.[id], L = layouts[id];
      const kind = c?.kind === 'CN' ? 'CN' : 'US';
      if (c && (c.stack ?? 0) > 0) {
        const [sx, , sz] = stackPos(id), total = Math.round(clamp(c.stack) * L.stack.length), per = STACKS.COLS.length;
        for (let col = 0; col < per; col++) {
          const cnt = Math.floor(total / per) + (col < total % per ? 1 : 0);
          for (let j = 0; j < cnt; j++) { const ch = L.stack[col * STACKS.N + j]; put(kind, sx + ch[0], ch[1], sz + ch[2], ch[3], ch[4], ch[5]); }
        }
      }
      if (c && (c.heap ?? 0) > 0) {
        // the mountain shrinks as a whole (a cone, smaller and lower) as it is tipped into the press
        const [hx, , hz] = heapPos(id), h = clamp(c.heap), sc = Math.cbrt(h), cnt = Math.round(h * L.heap.length);
        for (let j = 0; j < L.heap.length; j++) {
          if ((j * 7919) % L.heap.length >= cnt) continue;
          const ch = L.heap[j]; put(kind, hx + ch[0] * sc, Math.max(CHIP.H * 0.5, ch[1] * sc), hz + ch[2] * sc, ch[3], ch[4], ch[5]);
        }
      }
      const hp = pr?.[id]?.hopper;
      if (hp && hp.kind === 'chips' && (hp.show ?? 1) && (hp.u ?? 0) < 0.99) {
        const u = clamp(hp.u ?? 0), sink = smooth(u) * 0.075, kd = hp.chips === 'CN' ? 'CN' : kind;
        pm.copy(presses[id].root.matrix);
        for (const ch of L.mouth) {
          const y = ch[1] - sink;
          if (y < MOUTH[1] - 0.045) continue;
          _v.set(ch[0] * (1 - 0.4 * u), y, ch[2] * (1 - 0.4 * u)).applyMatrix4(pm);
          put(kd, _v.x, _v.y, _v.z, ch[3], ch[4], ch[5]);
        }
      }
    }
    for (const kd of ['US', 'CN']) { chipMesh[kd].count = n[kd]; chipMesh[kd].instanceMatrix.needsUpdate = true; }
  }
  // ---- what the hoppers swallow
  function feedPath(id) {
    const P = presses[id].root.matrix, S = SIDE_SIGN[KING[id].side], Z = SEAT.Z[KING[id].seat];
    const loc = (x, y, z) => V3(x, y, z).applyMatrix4(P);
    const pts = [V3(S * 0.53, 0.0, Z + 0.44), V3(S * 0.6, 0.0, Z + 0.2), loc(0, 0.0, -0.13), loc(0, 0.17, -0.125), loc(0, 0.318, -0.09), loc(0, 0.3, -0.02), loc(0, 0.2, 0.0)];
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }
  const pathCache = {};
  let nDolls = 0;
  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dp = V3(), dt = V3(), one = V3(1, 1, 1), up = V3(0, 1, 0);
  function updateFeed(id, hp, t, st) {
    const F = feeds[id];
    const kind = hp && (hp.show ?? 1) ? hp.kind : null;
    for (const k of Object.keys(F.items)) F.items[k].visible = k === kind && (hp.u ?? 0) < 0.985;
    F.hole.visible = kind === 'city' || !!st.holes?.[id];
    if (!kind || kind === 'chips') return;
    const u = clamp(hp.u ?? 0);
    if (kind === 'people') return chainToHopper(id, hp, u);
    const item = F.items[kind];
    if (kind === 'plant') F.smoke(t);
    if (kind === 'city') { F.lift.rotation.x = -0.85 * smooth(clamp(hp.peel ?? 0)); }
    if (hp.at) { setWorld(item, asMatrix(hp.at, _M)); }
    else if (kind === 'city' && hp.peel != null && u <= 0) {
      tableRoot.updateWorldMatrix(true, false);
      _M.makeTranslation(...cityHome(id)).premultiply(tableRoot.matrixWorld);
      _M.multiply(_A.makeTranslation(0, 0, -0.078));
      setWorld(item, _M);
    } else { item.position.set(0, 0, 0); item.quaternion.identity(); item.scale.set(1, 1, 1); }
    // sinking into the funnel, squeezed by its walls
    const su = smooth(u);
    item.position.y -= su * 0.11;
    item.scale.set(1 - 0.45 * su, 1 - 0.25 * su, 1 - 0.45 * su);
  }
  function chainToHopper(id, hp, u) {
    const curve = pathCache[id] || (pathCache[id] = feedPath(id));
    const Lp = curve.getLength(), N = 12, sp = DOLL.W * 0.97;
    const sFront = Lp - 0.03 + u * (N * sp + 0.25);
    const at = (s, out, tan) => {
      if (s <= 0) { curve.getPointAt(0, out); curve.getTangentAt(0, tan); return out.addScaledVector(tan, s); }
      const f = Math.min(1, s / Lp); curve.getPointAt(f, out); curve.getTangentAt(Math.min(0.999, f), tan); return out;
    };
    for (let i = 0; i < N; i++) {
      const s = sFront - i * sp;
      if (s > Lp - 0.01 || nDolls >= hopDolls.instanceMatrix.count) continue;
      at(s, dp, dt);
      // on the steep climb up the press side the strip lies flat against it (along the press's local x)
      const side = V3(1, 0, 0).applyQuaternion(presses[id].root.quaternion);
      const hz = V3(dt.x, 0, dt.z);
      const steep = smooth((Math.abs(dt.y) - 0.5) / 0.3);
      if (hz.lengthSq() < 1e-6) hz.copy(side); hz.normalize();
      if (hz.dot(side) < 0) side.negate();
      hz.lerp(side, steep).normalize();
      // the doll faces sideways to its path (it is cut from the strip), flutters a little as it is pulled;
      // where the path climbs or dives it is dragged head first
      const yaw = Math.atan2(-hz.z, hz.x);
      dq.setFromEuler(_e.set(0.12 * Math.sin(i * 1.7 + u * 20), yaw, 0.08 * Math.sin(i * 2.3 + u * 17), 'YXZ'));
      if (Math.abs(dt.y) > 0.35) { _q.setFromUnitVectors(up, dt.clone().normalize()); const w = smooth((Math.abs(dt.y) - 0.35) / 0.4); dq.slerp(_q.multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw)), w); }
      dm.compose(dp, dq, one);
      hopDolls.setMatrixAt(nDolls++, dm);
    }
    // the protagonist, last in the chain, looking back over his shoulder
    if (hp.maker) {
      const mk = makers[id];
      const s = sFront - N * sp - 0.05;
      mk.root.visible = s < Lp - 0.03;
      if (mk.root.visible) {
        at(s, dp, dt);
        const side = V3(1, 0, 0).applyQuaternion(presses[id].root.quaternion);
        const hz = V3(dt.x, 0, dt.z), steep = smooth((Math.abs(dt.y) - 0.5) / 0.3);
        if (hz.lengthSq() < 1e-6) hz.copy(side); hz.normalize();
        if (hz.dot(side) < 0) side.negate();
        hz.lerp(side, steep).normalize();
        mk.root.position.copy(dp);
        // his paper plane contains the path; he faces along it (face +1 = local +x)
        mk.root.rotation.set(0, Math.atan2(-hz.z, hz.x), 0, 'YXZ');
        mk.fig.scale.x = 1; mk.root.userData.face = 1;
        mk.armN.rotation.z = 1.35; mk.armF.rotation.z = 0.2; mk.torsoG.rotation.z = 0.12;
        mk.headG.rotation.set(0, smooth(clamp(hp.look ?? 0)) * Math.PI, -0.05, 'YXZ');
      }
    }
  }
  // ---- card-makers: shovel chips, reeled off on the rod, swept into the hopper
  function makerExtras(id, m, t) {
    const mk = makers[id];
    const hold = m?.hold === 'shovel';
    mk.shovelChips.forEach((c) => { c.visible = false; });
    if (hold && mk.root.visible) {
      const sh = clamp(m.shovel ?? 0);
      mk.shovel.updateWorldMatrix(true, false);
      const face = mk.root.userData.face ?? 1;
      _w.set(face, 0, 0).transformDirection(mk.root.matrixWorld);
      mk.shovelChips.forEach((c, i) => {
        const rel = 0.5 + i * 0.07;
        _v.set(0.062 + (i % 3) * 0.008, -0.006 + Math.floor(i / 3) * 0.0028, 0.0).applyMatrix4(mk.shovel.matrixWorld);
        let ok = true;
        if (sh > rel) { const d = (sh - rel) * 0.9; _v.addScaledVector(_w, 0.12 * d); _v.y -= 4.9 * d * d; ok = d < 0.32; }
        c.visible = ok;
        c.position.copy(_v); c.rotation.set(0.4 * i + sh * 3, i, 0.3 * i);
      });
    }
    const reel = clamp(m?.reel ?? 0);
    if (reel > 0 && rod.root.visible) {
      // hugging the sack: hanging below it, arms up round it, legs dangling
      rod.bagPoint(_v);
      tableRoot.updateWorldMatrix(true, false);
      _M.makeTranslation(_v.x, _v.y - 0.19, _v.z);
      setWorld(mk.root, _M);
      mk.root.rotation.set(0.05 * Math.sin(t * 2.3), m.yaw ?? 0, 0.06 * Math.sin(t * 1.7), 'YXZ');
      mk.armN.rotation.z = 2.75; mk.armF.rotation.z = 2.6;
      mk.legN.rotation.z = 0.25 + 0.1 * Math.sin(t * 5); mk.legF.rotation.z = -0.2 + 0.1 * Math.sin(t * 5 + 1);
      mk.headG.rotation.z = 0.3;
    }
    const sw = clamp(m?.swept ?? 0);
    if (sw > 0) {
      const curve = pathCache[id] || (pathCache[id] = feedPath(id));
      const f = smooth(sw);
      const p0 = V3(...(m.at ?? makerPos(id)));
      const p1 = curve.getPointAt(0.999);
      const p = p0.clone().lerp(p1, f); p.y += Math.sin(Math.PI * f) * 0.18;
      mk.root.position.copy(p);
      mk.root.rotation.set(-f * 1.2, (m.yaw ?? 0) + f * 2.4, f * 0.8, 'YXZ');
      mk.root.scale.setScalar(1 - 0.5 * f);
      mk.root.visible = sw < 0.97;
    } else mk.root.scale.setScalar(1);
  }
  function placeStampSeal(id, s, api) {
    const seal = flaps[id].seal;
    seal.visible = !!s;
    if (!s) return;
    const side = s.hand === 'L' || s.hand === 'R' ? s.hand : null;
    if (side && handMatrix(api, id, side, _H)) {
      // across the palm, the inked face toward the little finger (-x for a right hand)
      const dir = side === 'R' ? 1 : -1;
      _R.makeRotationZ(-dir * Math.PI / 2);
      _R.setPosition(-dir * 0.03 + HOLD.grip[0], HOLD.grip[1], HOLD.grip[2]);
      _M.multiplyMatrices(_H, _R);
    } else {
      tableRoot.updateWorldMatrix(true, false);
      const [x, , z] = flapPos(id);
      _M.makeTranslation(x, 0, z - 0.11).premultiply(tableRoot.matrixWorld);
    }
    setWorld(seal, _M);
  }
  function placeTag(id, tg, api) {
    const T = tags[id];
    T.update(tg);
    if (!tg || !T.root.visible) return;
    const side = tg.hand === 'L' || tg.hand === 'R' ? tg.hand : null;
    if (side && handMatrix(api, id, side, _H)) {
      // the stick through the fist (along hand x: up when the thumb is up), the window facing out of the back of the hand
      const dir = side === 'R' ? 1 : -1;
      _R.makeBasis(V3(0, dir, 0), V3(dir, 0, 0), V3(0, 0, -1)); _R.setPosition(0.08 * dir + HOLD.grip[0], HOLD.grip[1], HOLD.grip[2]);
      _M.multiplyMatrices(_H, _R);
    } else {
      tableRoot.updateWorldMatrix(true, false);
      const k = KING[id], S = SIDE_SIGN[k.side];
      // standing on its stick in front of him, the window toward the table (the other camp, the camera)
      _M.compose(V3(S * 0.98, 0.118, SEAT.Z[k.seat] + 0.08), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), S < 0 ? Math.PI / 2 : -Math.PI / 2), _one).premultiply(tableRoot.matrixWorld);
    }
    setWorld(T.root, _M);
  }
  const _sq = new THREE.Quaternion(), _sc = V3();
  function placeSack(id, sk, api, t) {
    const S = sacks[id];
    S.root.visible = S.cards.visible = !!sk && (sk.show ?? 1) > 0;
    if (!S.root.visible) return;
    const s = KING_S(id);
    // the seat frame (x = the king's left, z = front): the book pile is laid out in it
    S.body = (S.body || new THREE.Matrix4()).compose(V3(...seatPos(id)), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), seatYaw(id)), _one);
    if (api?.bodyFrame) {
      // the kings' body frame: origin on the upper back, +z out of the back, +x the king's right, +y up.
      // The chair back stands ~13-17 cm behind it, so the sack is squashed flat like a pack between back and
      // chair (depth <= 13 cm), wide, its mouth rising beside his head over the right shoulder
      const m = api.bodyFrame(id, _H); if (m && m !== _H) _H.copy(m);
      _H.decompose(_p, _q, _s);
      _H.compose(_p, _q, _one);
      const side = KING[id].side === 'CN' ? 1 : -1;   // body x is the king's right: +1 on the CN side faces the foot
      _R.compose(V3(side * SACK.BACK.at[0] * s, SACK.BACK.at[1] * s, SACK.BACK.at[2]), new THREE.Quaternion().setFromEuler(_e.set(SACK.BACK.rot[0], SACK.BACK.rot[1], side * SACK.BACK.rot[2], 'XYZ')), V3(s, s, s));
      S.upright.visible = false; S.slung.visible = true;
    } else {
      S.upright.visible = true; S.slung.visible = false;
      _H.copy(S.body);
      const ss = s * SACK.SCALE;
      _R.compose(V3(SACK.at[0] * s, SACK.at[1] * s, SACK.at[2] * s), new THREE.Quaternion().setFromEuler(_e.set(...SACK.rot, 'YXZ')), V3(ss, ss, ss));
    }
    _M.multiplyMatrices(_H, _R);
    setWorld(S.root, _M);
    S.tilt.rotation.z = 0.03 * Math.sin(t * 1.3 + id.length);
    // the cards ride in the mouth (unscaled by the sack's own squash)
    S.tilt.updateWorldMatrix(true, false);
    S.tilt.matrixWorld.decompose(_p, _sq, _sc);
    if (S.slung.visible) {
      // the mouth of the bent neck: its point and its axis (forward and a little up); the cards lie in it face up
      const top = 0.458 * 1.25, R = (top - SLUNG.yb) / SLUNG.bend, a = SLUNG.bend;
      _v.set(0, SLUNG.yb + R * Math.sin(a), -R * (1 - Math.cos(a))).applyMatrix4(S.tilt.matrixWorld);
      _sq.multiply(new THREE.Quaternion().setFromAxisAngle(V3(-1, 0, 0), a));
    } else _v.set(0, 0.45, 0).applyMatrix4(S.tilt.matrixWorld);
    _A.compose(_v, _sq, V3(s, s, s));
    setWorld(S.cards, _A);
  }
  const bookHole = V3(), bookPile = V3();
  const api0 = {};
  return {
    root, tableRoot, roomRoot, heldRoot,
    items: { consoles, presses, makers, trays, cigars, glasses, seals, chain, people, eu, feeds, chipMesh, hopDolls, crowd, rod, brush, tags, sacks, books, flaps },
    update(st = {}, t = 0, api = api0) {
      root.updateWorldMatrix(true, true);
      tableRoot.updateWorldMatrix(true, true);
      rod.update(st.rod, t);
      nDolls = 0;
      for (const k of KINGS) {
        const id = k.id;
        consoles[id].update(st.buttons?.[id]);
        presses[id].update(st.presses?.[id]);
        makers[id].update(st.makers?.[id]);
        makerExtras(id, st.makers?.[id], t);
        updateFeed(id, st.presses?.[id]?.hopper, t, st);
        placeCigar(id, st.cigars?.[id], t, api);
        placeGlass(id, st.glasses?.[id], api);
        placeTag(id, st.tags?.[id], api);
        placeSack(id, st.sacks?.[id], api, t);
        flaps[id].update(st.flaps?.[id]);
        placeStampSeal(id, st.stamps?.[id], api);
      }
      hopDolls.count = nDolls; hopDolls.instanceMatrix.needsUpdate = true;
      updateChips(st.chips, st.presses);
      updateSeals(st.seals);
      people.update(st.people);
      crowd.update(st.crowd);
      brush.update(st.brush);
      eu.update(st.eu);
      // Claude's sack splits: books out of the seam, piling on the floor behind his chair
      const leaker = KINGS.find((k) => (st.sacks?.[k.id]?.leak ?? 0) > 0 && sacks[k.id].root.visible);
      if (leaker) {
        const S = sacks[leaker.id];
        S.tilt.updateWorldMatrix(true, false);
        // the seam splits on the sack's outer side, over his right shoulder; the books drop past the chair's
        // side and pile on the floor beside it (body frame: x = the king's left)
        const s = KING_S(leaker.id);
        bookHole.copy(S.hole).applyMatrix4(S.tilt.matrixWorld); void s;
        bookPile.set(SACK.PILE[0] * s, 0, SACK.PILE[1] * s).applyMatrix4(S.body); bookPile.y = FLOOR_Y;   // between the chairs
        books.update(clamp(st.sacks[leaker.id].leak), bookHole, bookPile);
      } else books.update(0, bookHole, bookPile);
    },
    buttonTop: (id, out = V3()) => consoles[id].buttonTop(out),
    cancelTop: (id, out = V3()) => consoles[id].cancelTop(out),
    coverTip: (id, out = V3()) => consoles[id].coverTip(out),
    cigarTip: (id, out = V3()) => {
      const cg = cigars[id];
      cg.root.updateWorldMatrix(true, false);
      return out.set(0, 0, CIGAR.L + (cg.ash.visible ? cg.ash.scale.z : 0)).applyMatrix4(cg.root.matrixWorld);
    },
    pressLever: (id, out = V3()) => presses[id].lever(out),
    pressOut: (id, out = V3()) => presses[id].out(out),
    // additions
    pressFrame: (id, out = new THREE.Matrix4()) => presses[id].frame(out),        // slot frame: +z out toward the king, +y up
    makerHand: (id, which = 'R', out = V3()) => makers[id].hand(which, out),      // a card-maker's hand (world point)
    makerFrame: (id, which = 'R', out = new THREE.Matrix4()) => makers[id].frame(which, out),   // a card held in that hand
    hopperMouth: (id, out = V3()) => { presses[id].root.updateWorldMatrix(true, false); return out.set(...MOUTH).applyMatrix4(presses[id].root.matrixWorld); },
    cityPatch: (out = V3(), id = 'google') => { tableRoot.updateWorldMatrix(true, false); return out.set(...cityHome(id)).applyMatrix4(tableRoot.matrixWorld); },
    rodBag: (out = V3()) => rod.bagPoint(out),
    euHand: (out = new THREE.Matrix4()) => eu.hand(out),
    rodTip: (out = V3()) => rod.tip(out),
    sealFace: (side, out = V3()) => { seals[side].body.updateWorldMatrix(true, false); return out.set(0, 0, 0).applyMatrix4(seals[side].body.matrixWorld); },
    sealHang: (side, out = V3()) => { seals[side].body.updateWorldMatrix(true, false); return out.set(0, seals[side].hang, 0).applyMatrix4(seals[side].body.matrixWorld); },
    flapFace: (id, out = V3()) => { flaps[id].root.updateWorldMatrix(true, true); return out.set(0, 0.05, 0.002).applyMatrix4(flaps[id].root.children[1].matrixWorld); },
  };
}
