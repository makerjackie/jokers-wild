// JOKERS WILD — props (module "props", see docs/INTERFACES.md, docs/V3-REEL.md "props", docs/PRODUCTION.md "v2").
// Every frame is a pure function of (st.props, t). Materials: celMaterial / glowMaterial only. Every part draws
// NOTHING when its state is missing: st.props = {} draws nothing at all.
//
// v3 reel API (details at each section below):
//   st.props.stamps = { [id]: { L: S | null, R: S | null } }, S = { press 0..1, wet 0..1, yaw?, at?, show? }
//       big 批准 rubber stamps held in the kings' fists (axis world-vertical, face down). face = palm - (0, STAMP.GRIP, 0)
//       with api.handFrame only; with api.gripFrame the handle runs through the fist's hole (STAMP.FIST / STAMP.KNOB).
//   st.props.ink = [{ pos: [x, y, z], rot, size, k, seed }]     up to INK_MAX (256) red 批准 APPROVED marks on the cloth
//   st.props.plates = { show, turn? }                            brass tent nameplates at the table edge
//   st.props.presses[id] = { lever, slide, shake?, glow?, hopper? }   the cast-iron card presses (slot toward the card spot)
//   exports: STAMP, stampFace(id, side, out), stampFaceFrom(hand, out, grip?), stampDrop(hand, grip?), stampMatrix(...),
//            stampYawFrom(hand), paintStampMark(ctx2d, x, y, w, h, seed), INK_MAX, PLATE, platePos(id), plateYaw(id, turn),
//            plateFace(id, turn, out), PRESS, pressYaw(id)
//   props object: stampFace / stampFrame / stampRot(id, side), platePos(id, out), pressOut / pressFrame / pressRamp /
//            pressLever(id, out), plus the v2 points.
// v2 (kept, drawn only when their state is given): the AUTO launch console with its cancel key, cigars and their brass
// ashtrays, heavy crystal goblets of dark wine, the two national seals hanging from the giants' fists on heavy chains,
// what the presses are fed (chips, gold bars, a data-centre castle, a lit city torn off the map, a smoking power
// plant), the iron keys of the boxes' padlocks, and the turn clocks (斗地主 alarm clocks with a big nixie number).
//
// Frames. A console / clock stands at its layout point on the tabletop; its local +z faces its king (CN things face
// -x, US things face +x). Cancel key and press lever sit on the same world side for both camps (mirror-symmetric
// layout; local x is flipped with the camp sign `s`). The v3 press faces its king's proposal-card spot (pressYaw).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { celMaterial, glowMaterial, C } from './materials.js';
import { KINGS, KING, SEAT, SIDE_SIGN, CITY, buttonPos, pressPos, clockPos, seatPos } from './layout.js';
import { Rng, clamp, smooth, lerp, onThrees } from './util.js';
import { CHIP, chipGeometry, chipMaterial } from './chips.js';

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
// GOLD uses a card id (30..39): inked like a prop but it keeps its colour in every style (gold must read as gold)
const ID = { STEEL: 10, RED: 11, BRASS: 12, IRON: 13, WOOD: 14, LEAF: 15, BAND: 16, ASH: 17, GLASS: 18, WINE: 119, KEY: 11, GOLD: 38, LAMP: 140, DOME: 141, EMBER: 142, PIP: 143 };

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
export const BTN = { W: 0.24, D: 0.15, H: 0.042, CH: 0.03, MX: -0.046, KX: 0.071, Z: -0.016, R: 0.034, COLH: 0.012, TRAVEL: 0.0095, KEY: 0.036, KTRAVEL: 0.0065, HOOD: 0.118, HOODH: 0.047 };
// v2 readability: glowing labels. Masks drawn once (R = letters, G = frame, B = the ✕ of a dead cancel key), coloured in
// the shader: AUTO glows amber (hot when lit), CANCEL glows cream and goes dark grey with a dull red ✕ when dead.
function labelCanvas(wm, hm, draw) {
  const W = 1024, H = Math.max(64, Math.round(1024 * hm / wm));
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const m = Math.min(W, H) * 0.07, r = Math.min(W, H) * 0.12;
  g.strokeStyle = '#0f0'; g.lineWidth = Math.min(W, H) * 0.045;
  g.beginPath(); g.roundRect(m, m, W - 2 * m, H - 2 * m, r); g.stroke();
  g.fillStyle = '#f00';
  draw(g, W, H);
  return tex(c);
}
const spaced = (g, str, x, y, sp) => { const ws = [...str].map((ch) => g.measureText(ch).width); const tot = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1); let cx = x - tot / 2; [...str].forEach((ch, i) => { g.fillText(ch, cx + ws[i] / 2, y); cx += ws[i] + sp; }); };
const xMark = (g, W, H, k = 0.36) => { g.strokeStyle = '#00f'; g.lineCap = 'round'; g.lineWidth = Math.min(W, H) * 0.11; const cx = W / 2, cy = H / 2, d = Math.min(W, H) * k; g.beginPath(); g.moveTo(cx - d, cy - d); g.lineTo(cx + d, cy + d); g.moveTo(cx + d, cy - d); g.lineTo(cx - d, cy + d); g.stroke(); };
function labelMat(t, U, kind) {
  return glowMaterial({
    color: '#ffffff', id: 147, uniforms: { uTex: { value: t }, uLit: U.uLit, uDead: U.uDead },
    pattern: kind === 'auto' ? /* glsl */ `
      vec3 m = texture(uTex, vUv).rgb;
      float ink = max(m.r, m.g * 0.85);
      vec3 c = mix(${lin('#ff5a14')}, ${lin('#ff9a36')}, uLit);
      float k = (1.15 + 1.25 * uLit) * (uLit > 0.0 ? 0.92 + 0.08 * sin(uFxTime * 14.0) : 1.0);
      col = ${lin('#0e0907')} + c * k * ink;
    ` : /* glsl */ `
      vec3 m = texture(uTex, vUv).rgb;
      float ink = max(m.r, m.g * 0.8);
      vec3 c = mix(${lin('#f4e8c8')} * 1.15, ${lin('#625e58')}, uDead);
      col = ${lin('#0e0907')} + c * ink;
      col = mix(col, ${lin('#9a2a1e')} * 0.95, m.b * uDead);
    `,
  });
}
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
  const KB = 0.052, KI = 0.04;
  const bezel = extrude(inset([[-KB / 2, -KB / 2], [KB / 2, -KB / 2], [KB / 2, KB / 2], [-KB / 2, KB / 2]], 0.0012), 0.0075, 0.0012, 2,
    [[[-KI / 2, -KI / 2], [-KI / 2, KI / 2], [KI / 2, KI / 2], [KI / 2, -KI / 2]]]).rotateX(-Math.PI / 2).translate(0, 0.00375, 0);
  const cap = softBox(BTN.KEY, 0.016, BTN.KEY, 0.0032, 3);
  const pipBezel = lathe([[0.0048, 0], [0.0088, 0], [0.0092, 0.0018], [0.0084, 0.0036], [0.0062, 0.0038], [0.0056, 0.003]], 24);
  const pip = new THREE.SphereGeometry(0.0058, 18, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.62, 1);
  const bolt = new THREE.CylinderGeometry(0.0056, 0.0056, 0.0032, 6).translate(0, 0.0016, 0);
  // the glowing labels: on the cover (big 托管 over AUTO), the plates on the front chamfer (toward the king), the back
  // fascia (toward the table and a camera across it), the cancel key's cap
  const LBL = { hood: [0.102, 0.072], front: [0.13, 0.035], cancel: [0.09, 0.035], back: [0.122, 0.0325], backC: [0.084, 0.0325], cap: [0.03, 0.03] };
  const hoodT = labelCanvas(...LBL.hood, (g, W, H) => {
    g.font = `900 ${Math.round(H * 0.5)}px ${FONT_HEI}`; spaced(g, '托管', W / 2, H * 0.4, W * 0.04);
    g.font = `800 ${Math.round(H * 0.25)}px ${FONT_SANS}`; spaced(g, 'AUTO', W / 2, H * 0.78, W * 0.035);
  });
  const frontT = labelCanvas(...LBL.front, (g, W, H) => {
    g.font = `900 ${Math.round(H * 0.66)}px ${FONT_HEI}`; const a = g.measureText('托管').width;
    g.font = `800 ${Math.round(H * 0.56)}px ${FONT_SANS}`; const b = g.measureText('AUTO').width + 3 * H * 0.08;
    const gap = H * 0.35, x0 = W / 2 - (a + gap + b) / 2;
    g.font = `900 ${Math.round(H * 0.66)}px ${FONT_HEI}`; g.fillText('托管', x0 + a / 2, H * 0.53);
    g.font = `800 ${Math.round(H * 0.56)}px ${FONT_SANS}`; spaced(g, 'AUTO', x0 + a + gap + b / 2, H * 0.55, H * 0.08);
  });
  const cancelT = labelCanvas(...LBL.cancel, (g, W, H) => {
    g.font = `900 ${Math.round(H * 0.5)}px ${FONT_HEI}`; spaced(g, '取消', W / 2, H * 0.38, W * 0.03);
    g.font = `800 ${Math.round(H * 0.25)}px ${FONT_SANS}`; spaced(g, 'CANCEL', W / 2, H * 0.77, W * 0.012);
    xMark(g, W, H, 0.34);
  });
  const capT = labelCanvas(...LBL.cap, (g, W, H) => {
    g.font = `900 ${Math.round(H * 0.42)}px ${FONT_HEI}`; g.fillText('取消', W / 2, H * 0.4);
    g.font = `800 ${Math.round(H * 0.17)}px ${FONT_SANS}`; spaced(g, 'CANCEL', W / 2, H * 0.75, W * 0.01);
    xMark(g, W, H, 0.3);
  });
  const lblGeo = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);   // faces +y, text top toward -z
  const plateA = softBox(LBL.front[0] + 0.006, 0.0018, LBL.front[1] + 0.004, 0.0007), plateC = softBox(LBL.cancel[0] + 0.006, 0.0018, LBL.cancel[1] + 0.004, 0.0007);
  const screw = new THREE.CylinderGeometry(0.0017, 0.0017, 0.0012, 10).translate(0, 0.0006, 0);
  return (_consoleShared = {
    plinth, baseMat, collar, collarMat: steelMat({ color: '#8a8d93', seed: 3.1, metal: 0.55 }), ring, domeG, hood, hoodMat, knuckleMid, pin, bracket,
    bezel, cap, pipBezel, pip, bolt, boltMat: steelMat({ color: '#6e7074', seed: 5.5, metal: 0.4 }),
    plateA, plateC, plateMat: ironMat({ color: '#2a2a2c', seed: 2.4, edgeWear: 0.8 }), LBL, hoodT, frontT, cancelT, capT, lblGeo, screw, screwMat: brassMat({ color: '#a8854a' }),
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
    pattern: `col = mix(${lin('#3a0d06')}, ${lin('#ff5a1e')} * 3.4, uLit); col *= 0.75 + 0.5 * vUv.y;`,
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
        vec3 hot = mix(${lin('#e8361a')}, ${lin('#ffc070')}, smoothstep(0.03, 0.004, r));
        emis = hot * uLit * 2.8;
        col *= 1.0 - 0.6 * uLit;
        if(uLit > 0.5) idOut = ${fl(ID.DOME)};
      }
    `,
  }), dome);
  // the hood, hinged at its top back edge
  const hingeZ = Z - HOOD / 2, hingeY = H + HOODH;
  const hood = group(root, 'hood', bx, hingeY, hingeZ);
  mesh(S.hood, S.hoodMat, hood);
  const uDead = { value: 0 }, uPip = { value: 0 }, LU = { uLit, uDead };
  // the cover's label: big 托管 over AUTO on its top, reading from across the table (and upright to that side when the
  // cover is thrown open toward it)
  const autoL = labelMat(S.hoodT, LU, 'auto');
  mesh(S.lblGeo(...S.LBL.hood).rotateY(Math.PI), autoL, hood, 0, 0.0028, 0.045).userData.noShadow = true;
  mesh(S.knuckleMid, S.collarMat, root, bx, hingeY, hingeZ);
  mesh(S.pin, S.boltMat, root, bx, hingeY, hingeZ);
  mesh(S.bracket, S.collarMat, root, bx, H + (HOODH - 0.002) / 2, hingeZ);
  // the cancel key
  const kx = KX * s;
  mesh(S.bezel, S.collarMat, root, kx, H, Z);
  const key = group(root, 'key', kx, H + 0.006, Z);
  // the cap: a backlit cream key printed 取消 CANCEL (reading from across, like the cover); dead = a dull grey stone
  // with the print faded and a dull red ✕
  mesh(S.cap, cel({
    color: '#d6ccb6', id: ID.KEY, gloss: 0.8, uniforms: { uDead, uCap: { value: S.capT } },
    pattern: /* glsl */ `
      ${FADE}
      col = mix(${lin('#e4dbc4')}, ${lin('#4c4a47')}, uDead);
      gloss = mix(0.75, 0.0, uDead);
      if(vLocalN.y > 0.6){
        col *= 0.9 + 0.1 * smoothstep(0.0, 0.013, max(abs(vLocal.x), abs(vLocal.z)));
        vec2 pu = vec2(0.5 - vLocal.x / ${fl(S.LBL.cap[0])}, 0.5 + vLocal.z / ${fl(S.LBL.cap[1])});
        if(pu.x > 0.0 && pu.x < 1.0 && pu.y > 0.0 && pu.y < 1.0){
          vec3 m = texture(uCap, pu).rgb;
          col = mix(col, mix(${lin('#a81c12')}, ${lin('#383633')}, uDead), m.r);
          col = mix(col, ${lin('#7a241a')}, m.b * uDead);
        }
      }
      col *= mix(1.0, 0.82 + 0.26 * vnoise(vLocal.xz * 700.0 + vLocal.y * 300.0), uDead * (1.0 - smoothstep(0.0008, 0.003, mpp)));
      emis += ${lin('#f0e2bc')} * 0.22 * (1.0 - uDead);
      specTh = 0.93;
    `,
  }), key, 0, 0.008, 0);
  mesh(S.pipBezel, S.collarMat, root, kx, H, Z - 0.035);
  mesh(S.pip, glowMaterial({ color: '#ffffff', id: ID.PIP, uniforms: { uPip }, pattern: `col = mix(${lin('#1d1b19')}, ${lin('#ffcf7a')} * 2.0, uPip);` }), root, kx, H + 0.0016, Z - 0.035).userData.noShadow = true;
  // glowing plates on the front chamfer (reading from the king's chair): 托管 AUTO under the button, 取消 CANCEL under the key
  const cz = D / 2 - CH / 2, cy = H - CH / 2, n = 0.0009 / Math.SQRT2;
  const frontL = labelMat(S.frontT, LU, 'auto'), cancelL = labelMat(S.cancelT, LU, 'cancel');
  for (const [px, plate, geo, mat] of [[bx, S.plateA, S.LBL.front, frontL], [kx, S.plateC, S.LBL.cancel, cancelL]]) {
    const pg = group(root, 'plate', px, cy + n, cz + n); pg.rotation.x = Math.PI / 4;
    mesh(plate, S.plateMat, pg);
    mesh(S.lblGeo(...geo), mat, pg, 0, 0.0011, 0).userData.noShadow = true;
    for (const sx of [-1, 1]) mesh(S.screw, S.screwMat, pg, sx * (geo[0] / 2 + 0.0002), 0.0009, 0);
  }
  // the back fascia (toward the table's middle and a camera across it): the same two labels, reading from there
  mesh(new THREE.PlaneGeometry(...S.LBL.back).rotateY(Math.PI), frontL, root, bx, 0.0185, -D / 2 - 0.0006).userData.noShadow = true;
  mesh(new THREE.PlaneGeometry(...S.LBL.backC).rotateY(Math.PI), cancelL, root, kx, 0.0185, -D / 2 - 0.0006).userData.noShadow = true;
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
export function ashtrayPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.96, 0, SEAT.Z[k.seat] - 0.6]; }   // v2: clear of the clock
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
// US: a round Western official seal (turned bronze body, knob handle, a 禁运 EMBARGO band round its drum). CN: a square
// seal with a carved beast knob. Faces are cut in relief and (v2, for the audience) read the right way round when you
// look at the face. Each hangs from a giant's chain of real links (v2: heavy links, ~12 cm pitch).
// Seal frame: origin = centre of the face (the bottom), +y up through the handle to the ring. SCALE: the size in the film.
export const SEAL = { HIDE_Y: 4.3, TOP_Y: 7.2, HOME: { US: [0.62, 0, 0.6], CN: [-0.62, 0, 0.6] }, SCALE: { US: 1.6, CN: 1.6 } };
const LINK = { a: 0.042, b: 0.034, r: 0.0155 };
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
  g.save();                                            // v2: not mirrored, so the face itself reads on screen
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
  const UP = 0.032;   // the drum is taller than v1's: it carries the 禁运 EMBARGO band
  const usBody = lathe([[R, 0], [0.222, 0.004], [0.224, 0.008], [0.224, 0.062], [0.219, 0.068], [0.207, 0.072], ...[[0.2, 0.05], [0.186, 0.06], [0.162, 0.075], [0.15, 0.09], [0.152, 0.1], [0.174, 0.11], [0.18, 0.118], [0.172, 0.13], [0.12, 0.15], [0.086, 0.17], [0.071, 0.19], [0.069, 0.214], [0.085, 0.224], [0.089, 0.234], [0.076, 0.245], [0.061, 0.26], [0.058, 0.29], [0.074, 0.31], [0.094, 0.34], [0.098, 0.37], [0.089, 0.4], [0.062, 0.42], [0.03, 0.43], [0, 0.432]].map(([r, y]) => [r, y + UP])], 72);
  const usFace = new THREE.CircleGeometry(R, 96).rotateX(Math.PI / 2);
  const usRing = new THREE.TorusGeometry(0.042, 0.012, 10, 28);
  const cnSlab = softBox(0.4, 0.12, 0.4, 0.01, 3).translate(0, 0.06, 0);
  const cnStep = softBox(0.31, 0.034, 0.31, 0.007, 2).translate(0, 0.12 + 0.017, 0);
  const cnFace = new THREE.PlaneGeometry(0.39, 0.39).rotateX(Math.PI / 2).translate(0, -0.0006, 0);
  const beast = extrude(inset(outline(BEAST, 5), 0.012), 0.15, 0.012, 3).translate(0, 0.154, 0);
  const cnRing = new THREE.TorusGeometry(0.04, 0.012, 10, 28);
  const usT = sealFaceCanvas('US'), cnT = sealFaceCanvas('CN');
  // the band round the drum: 禁运 · EMBARGO, raised letters (white) on a blackened ground, readable from outside
  const bc = canvas(4096, 160), bg = bc.getContext('2d');
  bg.fillStyle = '#000'; bg.fillRect(0, 0, 4096, 160);
  bg.fillStyle = '#fff'; bg.textBaseline = 'middle'; bg.textAlign = 'center';
  bg.fillRect(0, 6, 4096, 8); bg.fillRect(0, 146, 4096, 8);
  for (let k = 0; k < 3; k++) {
    const x0 = (k * 4096) / 3;
    bg.font = `900 112px ${FONT_SONG}`; bg.fillText('禁运', x0 + 300, 84);
    bg.font = `700 100px ${FONT_SERIF}`; bg.fillText('E M B A R G O', x0 + 860, 84);
    bg.beginPath(); for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + (q / 10) * TAU, rr = q % 2 ? 14 : 34; bg.lineTo(x0 + 1290 + Math.cos(a) * rr, 80 + Math.sin(a) * rr); } bg.closePath(); bg.fill();
  }
  const bandT = tex(bc, { clamp: false }); bandT.wrapS = THREE.RepeatWrapping;
  const bronze = metalMat({ color: '#6e5a40', id: ID.IRON, gloss: 0.9, metal: 0.45, seed: 2.9, mottle: 9, edgeWear: 0, uniforms: { uBand: { value: bandT } }, more: `
    { vec3 rV = normalize(cameraPosition - vWorld); emis += col * 0.6 * smoothstep(0.55, 0.9, 1.0 - abs(dot(N, rV))); litBias += 0.12; }
    float rr = length(vLocal.xz);
    if(vLocal.y > 0.009 && vLocal.y < 0.061 && rr > 0.215 && abs(vLocalN.y) < 0.5){
      float bh = texture(uBand, vec2(atan(vLocal.x, vLocal.z) / 6.28318 + 0.5, (vLocal.y - 0.009) / 0.052)).r;
      col = mix(${lin('#1a130c')}, ${lin('#b8945e')} * (0.85 + 0.25 * fbm2(vLocal.xz * 60.0)), smoothstep(0.3, 0.7, bh));
      gloss = bh; emis += col * 0.12 * bh;
    }
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
    mesh(S.usRing, S.bronze, body, 0, 0.464 + 0.042, 0);
    hang = 0.464 + 0.042 * 2;
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
// v3: a broad, low cast-iron machine whose slot takes a whole proposal card (CARD 0.18 x 0.26, short edge first) and
// faces the king's proposal-card spot (s*0.80, seat z + 0.28): a card leaves the slot, runs down the ramp onto the cloth
// and skids on to the spot. Seen from a paper person's height it is a factory: riveted sand-cast iron, a loading-dock
// slot, a nameplate up on the crown like a works sign.
// Press frame: origin = the middle of the bed on the tabletop, +y up, local +z = out of the slot (toward the card spot),
// local x*L = the lever side (L = SIDE_SIGN: the lever is on the king's side of the press).
// SLOT: the slot's centre (press frame); RAMP: where a card leaving the slot touches the cloth (press frame);
// SLOT_W: the slot's clear width; CARD_SPOT: [dx, dz] from the seat to the proposal-card spot (seat z + 0.28, x 0.80)
export const PRESS = { SLOT: [0, 0.048, 0.077], RAMP: [0, 0.0015, 0.192], SLOT_W: 0.2, W: 0.3, HUB: [0.143, 0.165, -0.004], ARM: 0.17, UP: 0.95, DOWN: -0.36, TRAVEL: 0.03, CARD_SPOT: [0.8, 0.28] };
// the press's yaw: its slot turned toward the king's card spot
export function pressYaw(id) {
  const k = KING[id], s = SIDE_SIGN[k.side], p = pressPos(id);
  return Math.atan2(s * PRESS.CARD_SPOT[0] - p[0], SEAT.Z[k.seat] + PRESS.CARD_SPOT[1] - p[2]);
}
// rivets: squashed domes on surfaces, [[x, y, z, nx, ny, nz, r], ...] merged into one geometry
function rivets(list) {
  const unit = new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2);
  const up = V3(0, 1, 0);
  return merge(list.map(([x, y, z, nx, ny, nz, r0 = 0.0028]) => {
    const r = r0 * 1.3;
    const g = unit.clone().scale(r, r * 0.62, r);
    const q = new THREE.Quaternion().setFromUnitVectors(up, V3(nx, ny, nz).normalize());
    return g.applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), q, V3(1, 1, 1)));
  }));
}
// sand-cast iron: pitted skin, mottled scale, rust bloom low down and in the corners, worn bright on edges
const CAST = /* glsl */ `
  float fineC = 1.0 - smoothstep(0.00025, 0.0011, mpp);
  float pit = smoothstep(0.62, 0.8, vnoise(vLocal.xy * 1400.0 + vLocal.z * 900.0)) * smoothstep(0.55, 0.75, vnoise(vLocal.yz * 600.0 + 3.0));
  col *= 1.0 - 0.55 * pit * fineC;
  // run-down grime and rust: vertical streaks on the walls (heavier low down), oil-dark patches
  float wall = 1.0 - smoothstep(0.4, 0.75, abs(vLocalN.y));
  float hor = dot(vLocal.xz, abs(vLocalN.x) > abs(vLocalN.z) ? vec2(0.0, 1.0) : vec2(1.0, 0.0));
  float streak = smoothstep(0.55, 0.9, vnoise(vec2(hor * 260.0, vLocal.y * 9.0))) * smoothstep(0.35, 0.75, vnoise(vec2(hor * 40.0, vLocal.y * 30.0 + 4.0)));
  col = mix(col, col * 0.55, streak * wall * 0.8 * (1.0 - smoothstep(0.0002, 0.004, mpp) * 0.5));
  col *= 1.0 - 0.25 * smoothstep(0.62, 0.85, fbm2(vLocal.xy * 25.0 + vLocal.z * 17.0 + 9.0));
  float skin = vnoise(vec2(dot(vLocal, vec3(1.0, 0.31, 0.7)) * 2600.0, dot(vLocal, vec3(-0.4, 1.0, 0.2)) * 2600.0));
  col *= mix(1.0, 0.86 + 0.24 * skin, fineC);
  float rust = smoothstep(0.5, 0.78, fbm2(vLocal.xz * 70.0 + vLocal.y * 40.0)) * (0.35 + 0.65 * smoothstep(0.06, 0.0, vLocal.y));
  col = mix(col, ${lin('#5a3626')} * (0.8 + 0.4 * vnoise(vLocal.xz * 900.0)), rust * 0.55);
  gloss *= 1.0 - 0.6 * rust;
`;
let _pressShared = null;
function pressShared() {
  if (_pressShared) return _pressShared;
  const WB = PRESS.W, CX = 0.1225, BX = 0.116;          // bed width, cheek centre x, half width of the slot block
  const bedProf = [[-0.1, 0, 1], [0.1, 0, 1], [0.1, 0.008, 1], [0.095, 0.0115], [0.095, 0.019], [0.089, 0.0255], [0.081, 0.032, 1], [-0.081, 0.032, 1], [-0.089, 0.0255], [-0.095, 0.019], [-0.095, 0.0115], [-0.1, 0.008, 1]];
  const bed = extrude(outline(bedProf, 4), WB, 0.002, 2).rotateY(-Math.PI / 2);
  const block = softBox(BX * 2, 0.058, 0.15, 0.004).translate(0, 0.032 + 0.029, 0);
  const cheekOut = [[-0.076, 0.032, 1], [0.076, 0.032, 1], [0.071, 0.046], [0.052, 0.068], [0.041, 0.108], [0.038, 0.158], [0.046, 0.19], [0.043, 0.206, 1], [-0.043, 0.206, 1], [-0.046, 0.19], [-0.038, 0.158], [-0.041, 0.108], [-0.052, 0.068], [-0.071, 0.046]];
  const lancet = [[-0.017, 0.092, 1], [0.017, 0.092, 1], [0.019, 0.13], [0.0, 0.166, 1], [-0.019, 0.13]];
  const lancetPoly = outline(lancet, 5).reverse();
  const cheek = extrude(outline(cheekOut, 5), 0.013, 0.0018, 2, [lancetPoly]).rotateY(-Math.PI / 2);
  const panelOut = inset(outline(cheekOut, 5), 0.0075);
  const panel = extrude(panelOut, 0.017, 0.0014, 1, [inset(lancetPoly, -0.005)]).rotateY(-Math.PI / 2);
  const crown = merge([
    xf(softBox(2 * CX + 0.025, 0.024, 0.1, 0.004), 0, 0.206 + 0.012, 0),
    xf(softBox(2 * CX + 0.035, 0.008, 0.11, 0.003), 0, 0.206 + 0.024 + 0.002, 0),
  ]);
  // the hopper (v2): a sheet-iron funnel (four-sided lathe, flat facets) with a rolled rim; drawn only with a hopper state
  const hop = lathe([[0.034, 0.234], [0.092, 0.292], [0.0945, 0.2945], [0.0925, 0.2968], [0.089, 0.2945], [0.031, 0.2375]], 4, { th0: Math.PI / 4, th1: Math.PI / 4 + TAU }).toNonIndexed();
  hop.computeVertexNormals();
  const platen = softBox(0.21, 0.022, 0.1, 0.004);
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
  // the slot's brass lip: clear opening SLOT_W x 9 mm
  const sw = PRESS.SLOT_W / 2;
  const slotLip = extrude([[-sw - 0.008, 0.039], [sw + 0.008, 0.039], [sw + 0.008, 0.057], [-sw - 0.008, 0.057]], 0.003, 0.0008, 1, [[[-sw, 0.0435], [-sw, 0.0525], [sw, 0.0525], [sw, 0.0435]]]);
  // the ramp: an iron chute from under the slot down to the cloth, side rails, two feet
  const r0 = [0.0775, 0.0425], r1 = [PRESS.RAMP[2], 0.0015];
  const rl = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]), ra = Math.atan2(r0[1] - r1[1], r1[0] - r0[0]);
  const ramp = merge([
    xf(softBox(2 * sw + 0.004, 0.0028, rl, 0.0008), 0, -0.0014, rl / 2),
    xf(softBox(0.004, 0.009, rl, 0.0012), -sw - 0.004, 0.0031, rl / 2),
    xf(softBox(0.004, 0.009, rl, 0.0012), sw + 0.004, 0.0031, rl / 2),
  ]);
  ramp.applyMatrix4(new THREE.Matrix4().makeRotationX(ra)).translate(0, r0[1], r0[0]);
  const roller = new THREE.CylinderGeometry(0.0068, 0.0068, 2 * sw, 18).rotateZ(Math.PI / 2);
  const rollerCap = new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 16).rotateZ(Math.PI / 2);
  const oilCup = lathe([[0, 0], [0.004, 0], [0.004, 0.006], [0.0065, 0.009], [0.0065, 0.013], [0.003, 0.0145], [0, 0.015]], 12);
  const plateT = plateCanvas(0.09, 0.024, (g, Wc, Hc) => {
    g.font = `900 ${Math.round(Hc * 0.42)}px ${FONT_HEI}`; g.fillText('印 牌 机', Wc / 2, Hc * 0.38);
    g.font = `700 ${Math.round(Hc * 0.26)}px ${FONT_SERIF}`; g.fillText('C A R D   P R E S S', Wc / 2, Hc * 0.72);
  });
  const nplate = softBox(0.09, 0.0016, 0.024, 0.0006);
  // rivets: round the plinth, round the slot (a loading-dock door), along the cheeks, on the crown, on the ramp
  const R = [];
  for (let i = 0; i <= 12; i++) { const x = -0.138 + i * 0.023; R.push([x, 0.0035, 0.1, 0, 0, 1], [x, 0.0035, -0.1, 0, 0, -1]); }
  for (let i = 0; i <= 7; i++) { const z = -0.084 + i * 0.024; R.push([0.15, 0.0035, z, 1, 0, 0], [-0.15, 0.0035, z, -1, 0, 0]); }
  for (let i = 0; i <= 8; i++) { const x = -0.104 + i * 0.026; R.push([x, 0.0715, 0.075, 0, 0, 1, 0.0032], [x, 0.0715, -0.075, 0, 0, -1, 0.0032]); }
  for (const x of [-0.109, 0.109]) for (const y of [0.04, 0.056]) R.push([x, y, 0.075, 0, 0, 1, 0.0032]);
  for (const sx of [-1, 1]) {
    const x = sx * (CX + 0.0085 + 0.0008);
    for (const [z, y] of [[0.062, 0.042], [0.049, 0.064], [0.037, 0.1], [0.034, 0.15], [0.039, 0.19], [-0.062, 0.042], [-0.049, 0.064], [-0.037, 0.1], [-0.034, 0.15], [-0.039, 0.19], [0, 0.198]]) R.push([x, y, z, sx, 0, 0, 0.0026]);
    for (const z of [-0.035, 0, 0.035]) R.push([sx * (CX + 0.004), 0.2385, z, 0, 1, 0, 0.003]);
  }
  for (const x of [-0.06, -0.03, 0.03, 0.06]) R.push([x, 0.218, 0.0505, 0, 0, 1, 0.0024]);
  const rivetGeo = rivets(R);
  const rampRivets = rivets([0.25, 0.75].flatMap((f) => [-1, 1].map((sx) => [sx * (sw + 0.004), 0.0076, f * rl, 0, 1, 0, 0.0022])));
  rampRivets.applyMatrix4(new THREE.Matrix4().makeRotationX(ra)).translate(0, r0[1], r0[0]);
  const wood = cel({ color: '#6a4228', id: ID.WOOD, gloss: 0.7, pattern: `${FADE} col *= 0.85 + 0.25 * step(0.5, fract(vLocal.y * 260.0 + vnoise(vLocal.xz * 400.0) * 1.5)) * (1.0 - smoothstep(0.0008, 0.003, mpp)); specTh = 0.95;` });
  const steelBright = steelMat({ color: '#7c7e82', metal: 0.7, seed: 1.9 });
  return (_pressShared = { bed, block, cheek, panel, crown, hop, platen, rod, hub, arm, ball, grip, slotLip, ramp, roller, rollerCap, oilCup, nplate, nplateMat: plateMat(plateT, 0.09, 0.024), wood, steelBright, brass: brassMat({ color: '#c09a56' }), rivetGeo, rampRivets, CX, BX, rl, ra });
}
// the gold leak (v2): glow 0..1 lights the press from inside (the hopper's throat, the window slits in the cheeks, the
// slot, the seams under the crown and above the bed) and washes its iron with gold
const GOLD_LEAK = '#ffb840';
let _pressGlowShared = null;
function pressGlowShared() {
  if (_pressGlowShared) return _pressGlowShared;
  const core = new THREE.BoxGeometry(0.23, 0.118, 0.094).translate(0, 0.149, -0.002);
  const funnel = lathe([[0.0312, 0.2382], [0.0885, 0.2952]], 4, { th0: Math.PI / 4, th1: Math.PI / 4 + TAU }).toNonIndexed();
  funnel.computeVertexNormals();
  const throat = new THREE.PlaneGeometry(0.046, 0.046).rotateX(-Math.PI / 2).translate(0, 0.2375, 0);
  const slot = new THREE.PlaneGeometry(PRESS.SLOT_W, 0.009).translate(0, 0.048, 0.0759);
  const seams = merge([
    xf(new THREE.BoxGeometry(0.236, 0.0028, 0.0016), 0, 0.0328, 0.0756), xf(new THREE.BoxGeometry(0.236, 0.0028, 0.0016), 0, 0.0328, -0.0756),
    xf(new THREE.BoxGeometry(0.0016, 0.0028, 0.152), 0.117, 0.0328, 0), xf(new THREE.BoxGeometry(0.0016, 0.0028, 0.152), -0.117, 0.0328, 0),
    xf(new THREE.BoxGeometry(0.27, 0.0026, 0.0016), 0, 0.2068, 0.0505), xf(new THREE.BoxGeometry(0.27, 0.0026, 0.0016), 0, 0.2068, -0.0505),
  ]);
  return (_pressGlowShared = { core, funnel, throat, slot, seams });
}
function buildPress(id) {
  const k = KING[id], L = SIDE_SIGN[k.side];
  const S = pressShared(), GS = pressGlowShared();
  const root = group(null, 'press-' + id);
  root.position.set(...pressPos(id));
  root.rotation.y = pressYaw(id);
  // per press: the iron takes the gold wash
  const uGlow = { value: 0 };
  const WASH = `emis += ${lin(GOLD_LEAK)} * uGlow * (0.05 + 0.22 * smoothstep(0.17, 0.3, vLocal.y) + 0.12 * smoothstep(0.04, 0.08, vLocal.z) * step(vLocal.y, 0.07));`;
  const iron = ironMat({ color: '#45454a', edgeWear: 1.0, seed: 3.3, brush: 0.15, uniforms: { uGlow }, more: CAST + WASH });
  const ironP = ironMat({ color: '#48484c', edgeWear: 0.0, seed: 9.1, brush: 0.15, uniforms: { uGlow }, more: `
    ${CAST}
    // a gilt pinstripe round the raised panels (their bevel), worn in places
    float bev = smoothstep(0.25, 0.4, abs(vLocalN.y) + abs(vLocalN.z)) * step(abs(vLocalN.x), 0.93);
    col = mix(col, ${lin('#c8a050')} * (0.8 + 0.4 * vnoise(vLocal.yz * 300.0)), bev * step(0.3, vnoise(vLocal.yz * 90.0 + 2.0)));
    gloss = mix(gloss, 1.0, bev);
    ${WASH}
  ` });
  const rivetMat = ironMat({ color: '#56565a', edgeWear: 0.0, seed: 4.7, brush: 0.0, metal: 0.5, uniforms: { uGlow }, more: `col *= 0.9 + 0.35 * smoothstep(0.3, 0.9, vLocalN.y); ${WASH}` });
  const hopMat = ironMat({ color: '#404044', side: THREE.DoubleSide, seed: 5.2, uniforms: { uGlow }, more: `if(!gl_FrontFacing){ col *= 0.35; emis += ${lin(GOLD_LEAK)} * uGlow * 0.5; } col *= 1.0 + 0.6 * smoothstep(0.287, 0.293, vLocal.y); ${WASH}` });
  mesh(S.bed, iron, root);
  mesh(S.block, iron, root);
  for (const x of [-1, 1]) { mesh(S.cheek, iron, root, x * S.CX); mesh(S.panel, ironP, root, x * S.CX); }
  mesh(S.crown, iron, root);
  mesh(S.rivetGeo, rivetMat, root);
  const hop = mesh(S.hop, hopMat, root);
  for (const x of [-1, 1]) mesh(S.oilCup, S.brass, root, x * 0.112, 0.236, 0.04);
  mesh(S.nplate, S.nplateMat, root, 0, 0.218, 0.0508, Math.PI / 2, 0, 0);
  const platen = group(root, 'platen', 0, 0.135, 0);
  mesh(S.platen, iron, platen);
  mesh(S.rod, S.steelBright, platen);
  mesh(S.slotLip, S.brass, root, 0, 0, 0.0765);
  mesh(S.ramp, iron, root);
  mesh(S.rampRivets, rivetMat, root);
  const roller = group(root, 'roller', 0, 0.064, 0.083);
  mesh(S.roller, S.steelBright, roller);
  for (const x of [-1, 1]) mesh(S.rollerCap, S.brass, root, x * (PRESS.SLOT_W / 2 + 0.004), 0.064, 0.083);
  const [hx, hy, hz] = PRESS.HUB;
  mesh(S.hub, iron, root, hx * L, hy, hz);
  const lever = group(root, 'lever', (hx + 0.014) * L, hy, hz);
  mesh(S.arm, iron, lever);
  mesh(S.ball, iron, lever);
  mesh(S.grip, S.wood, lever, 0, 0, -PRESS.ARM, 0, 0, -L * Math.PI / 2);
  const gripPt = V3(L * 0.026, 0, -PRESS.ARM), slot = V3(...PRESS.SLOT);
  // the slot: a black void that turns to molten gold with the leak
  const slotMat = glowMaterial({ color: '#ffffff', id: 146, uniforms: { uGlow }, pattern: `col = mix(${lin('#050404')}, ${lin('#ffd27a')} * 2.4, smoothstep(0.0, 0.6, uGlow));` });
  mesh(GS.slot, slotMat, root).userData.noShadow = true;
  // the glow inside: a molten core seen through the lancet windows and between the cheeks, the funnel's throat, the seams
  const glowMat = glowMaterial({
    color: '#ffffff', id: 146, side: THREE.DoubleSide, uniforms: { uGlow },
    pattern: /* glsl */ `
      float fl = 0.7 + 0.6 * vnoise(vec2(vUv.x * 5.0 + uFxTime * 0.9, vUv.y * 4.0 - uFxTime * 1.7));
      float up = 0.45 + 0.75 * vUv.y;
      col = mix(${lin('#ff8a14')}, ${lin('#fff0b8')}, smoothstep(0.3, 1.0, uGlow * up)) * uGlow * (1.1 + 1.7 * uGlow) * fl * up;
    `,
  });
  const glow = group(root, 'glow');
  for (const g of [GS.core, GS.funnel, GS.throat, GS.seams]) mesh(g, glowMat, glow).userData.noShadow = true;
  glow.visible = false;
  const home = root.position.clone(), yaw = root.rotation.y;
  // p: { lever, slide, shake, glow, hopper } (missing p: the press is not drawn; a hopper state shows the funnel)
  const update = (p, t = 0) => {
    root.visible = !!p && (p.show ?? 1) > 0;
    if (!root.visible) return;
    const lv = clamp(p.lever ?? 0), sl = clamp(p.slide ?? 0), gl = clamp(p.glow ?? 0), sh = clamp(p.shake ?? 0);
    hop.visible = p.hopper != null;
    lever.rotation.x = lerp(PRESS.UP, PRESS.DOWN, smooth(lv));
    platen.position.y = 0.135 - smooth(clamp((lv - 0.25) / 0.75)) * PRESS.TRAVEL;
    roller.rotation.x = -sl * 4 * Math.PI;
    uGlow.value = gl; glow.visible = gl > 0.004;
    glow.children[1].visible = hop.visible;
    // shake: the press rattles on its own, a new jolt every frame (a mechanism: on ones)
    root.position.copy(home); root.rotation.set(0, yaw, 0);
    if (sh > 0) {
      const f = Math.floor(t * 24 + 1e-6), h = (a) => { const v = Math.sin(f * 12.9898 + a * 78.233 + L * 3.1) * 43758.5453; return v - Math.floor(v); };
      root.position.x += (h(1) - 0.5) * 0.006 * sh; root.position.z += (h(2) - 0.5) * 0.006 * sh; root.position.y += h(3) * 0.004 * sh;
      root.rotation.x = (h(4) - 0.5) * 0.05 * sh; root.rotation.z = (h(5) - 0.5) * 0.05 * sh; root.rotation.y = yaw + (h(6) - 0.5) * 0.04 * sh;
    }
  };
  update(null);
  const ramp = V3(...PRESS.RAMP);
  return {
    root, s: L, update,
    lever: (out) => { lever.updateWorldMatrix(true, false); return out.copy(gripPt).applyMatrix4(lever.matrixWorld); },
    out: (out) => { root.updateWorldMatrix(true, false); return out.copy(slot).applyMatrix4(root.matrixWorld); },
    ramp: (out) => { root.updateWorldMatrix(true, false); return out.copy(ramp).applyMatrix4(root.matrixWorld); },
    frame: (out) => { root.updateWorldMatrix(true, false); out.copy(root.matrixWorld); const p = slot.clone().applyMatrix4(root.matrixWorld); out.setPosition(p); return out; },
  };
}
// ------------------------------------------------------------------ chips beside the presses, the mountain
// Stacks: six columns beside each press (stack 0..1 = how many are left; they shrink from the top, evenly).
// heap 0..1: a loose mountain of chips (OpenAI tips one into his press); kind 'US' (NVIDIA) | 'CN' (kiln clay).
export const STACKS = { N: 22, COLS: [[-0.019, -0.033], [0.019, -0.033], [-0.038, 0], [0, 0], [0.038, 0], [0, 0.033]], HEAP: 380, HEAP_R: 0.13, HEAP_H: 0.11 };
export function stackPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.79, 0, SEAT.Z[k.seat] - 0.37]; }
export function heapPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.68, 0, SEAT.Z[k.seat] - 0.58]; }
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


// ------------------------------------------------------------------ what the presses are fed (v2: medium shots, read big)
// hopper = { kind: 'chips'|'gold'|'castle'|'city'|'plant', show, u, at?, into?, peel?, grab? }
//   at     world [x,y,z] or Matrix4: where the item is before it goes in (in a king's hands); its origin is the item's
//          base centre, +y up (the city: the centre of the flat patch)
//   into   0..1 carries it from `at` (the city: from its home on the cloth) onto the hopper's mouth on a small arc
//          (default 0 when `at` is given or the city has `peel`, else 1 = sitting on the mouth)
//   u      0..1 sinks it into the funnel, squeezed by its walls, gone at 1 (clipped at the mouth: nothing shows below)
//   peel   (city) 0 = lying flat in the cloth at CITY, its lights on .. 1 torn off and curled up (a curl runs across it
//          from the edge facing the owner's seat); the set opens the hole (st.set.clothHole.u)
//   grab   (city) true: `at` is where the grabbed edge is (the hand), not the patch centre
export const FEED = { gold: { H: 0.126, R: 0.11 }, castle: { H: 0.27, R: 0.105 }, city: { H: 0.16, R: 0.15 }, plant: { H: 0.27, R: 0.125 } };
const CITY_HALF = 0.15;
const BEND = { K: 1 / 0.09, PHI: 0.72, LIFT: 0.035, SPAN: 2 * CITY_HALF + 0.02 };
// the city's curl, the same in JS and GLSL: patch-local x across, z along the peel (grabbed edge at +z), y up
function cityBend(x, y, z, peel, out) {
  const zl = CITY_HALF - peel * BEND.SPAN, s = z - zl;
  out.set(x, y, z);
  if (s > 0) {
    const sArc = BEND.PHI / BEND.K, phi = Math.min(s, sArc) * BEND.K, rest = Math.max(0, s - sArc);
    const bx = x, by = (1 - Math.cos(phi)) / BEND.K + Math.sin(phi) * rest, bz = zl + Math.sin(phi) / BEND.K + Math.cos(phi) * rest;
    out.set(bx, by + Math.cos(phi) * y, bz - Math.sin(phi) * y);
  }
  out.y += BEND.LIFT * smooth((peel - 0.8) / 0.2);
  return out;
}
const BEND_GLSL = /* glsl */ `
  {
    float zl = ${fl(CITY_HALF)} - uPeel * ${fl(BEND.SPAN)};
    float s = pos.z - zl;
    if(s > 0.0){
      float sArc = ${fl(BEND.PHI / BEND.K)};
      float phi = min(s, sArc) * ${fl(BEND.K)};
      float rest = max(0.0, s - sArc);
      float c = cos(phi), sn = sin(phi);
      vec3 b = vec3(pos.x, (1.0 - c) / ${fl(BEND.K)} + sn * rest, zl + sn / ${fl(BEND.K)} + c * rest);
      pos = b + vec3(0.0, c, -sn) * pos.y;
      nrm = vec3(nrm.x, nrm.y * c + nrm.z * sn, -nrm.y * sn + nrm.z * c);
    }
    pos.y += ${fl(BEND.LIFT)} * smoothstep(0.8, 1.0, uPeel);
  }
`;
// trapezoid ingot / generic frustum box: bottom L x W, top scaled by k, base on y = 0 (flat-shaded)
function ingot(L, W, H, k) {
  const g = new THREE.BoxGeometry(L, H, W).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g.translate(0, H / 2, 0);
}
let _feedShared = null;
function feedShared() {
  if (_feedShared) return _feedShared;
  const rng = new Rng(77);
  // ---- gold: a pyramid of six fat ingots (3, 2, 1)
  const IL = 0.19, IW = 0.074, IH = 0.042;
  const bars = [];
  [-0.079, 0, 0.079].forEach((z) => bars.push(xf(ingot(IL, IW, IH, 0.8), rng.range(-0.008, 0.008), 0, z, 0, rng.range(-0.05, 0.05), 0)));
  [-0.0395, 0.0395].forEach((z) => bars.push(xf(ingot(IL, IW, IH, 0.8), rng.range(-0.01, 0.01), IH, z, 0, rng.range(-0.06, 0.06), 0)));
  bars.push(xf(ingot(IL, IW, IH, 0.8), 0.005, 2 * IH, 0, 0, -0.07, 0));
  const gold = merge(bars);
  // ---- a stone castle whose windows are server racks (a data centre)
  const stone = [], roofs = [], racks = [], slits = [];
  const KW = 0.15, KH = 0.15, B0 = 0.022;               // the keep: width, height, sitting on a rock B0 thick
  stone.push(xf(softBox(KW, KH, KW, 0.003), 0, B0 + KH / 2, 0));
  const TR = 0.031, TX = KW / 2 + 0.006, TH = 0.205;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    stone.push(xf(new THREE.CylinderGeometry(TR, TR * 1.08, TH, 18), x * TX, B0 + TH / 2, z * TX));
    stone.push(xf(new THREE.CylinderGeometry(TR * 1.18, TR * 1.05, 0.016, 18), x * TX, B0 + TH + 0.008, z * TX));
    roofs.push(xf(new THREE.ConeGeometry(TR * 1.32, 0.085, 18), x * TX, B0 + TH + 0.016 + 0.0425, z * TX));
    // slit windows round each tower (two levels), glowing
    for (let lv = 0; lv < 2; lv++) for (let k = 0; k < 3; k++) {
      const a = Math.atan2(x, z) + (k - 1) * 0.75, w = new THREE.PlaneGeometry(0.011, 0.034);
      w.rotateY(a); w.translate(x * TX + Math.sin(a) * (TR + 0.0006), B0 + 0.07 + lv * 0.075, z * TX + Math.cos(a) * (TR + 0.0006));
      slits.push(w);
    }
  }
  // crenellations round the keep's top
  for (let i = -2; i <= 2; i++) for (const sg of [-1, 1]) {
    stone.push(xf(new THREE.BoxGeometry(0.017, 0.02, 0.012), i * 0.028, B0 + KH + 0.01, sg * (KW / 2 - 0.006)));
    stone.push(xf(new THREE.BoxGeometry(0.012, 0.02, 0.017), sg * (KW / 2 - 0.006), B0 + KH + 0.01, i * 0.028));
  }
  // a central donjon above the keep with its own roof
  stone.push(xf(softBox(0.06, 0.06, 0.06, 0.002), 0, B0 + KH + 0.03, 0));
  roofs.push(xf(new THREE.ConeGeometry(0.05, 0.08, 4).rotateY(Math.PI / 4), 0, B0 + KH + 0.06 + 0.04, 0));
  const castle = merge(stone), roof = merge(roofs), slitGeo = merge(slits);
  // rack windows: two rows of three tall windows on every face of the keep
  for (const [nx, nz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) {
    if (nz > 0 && r === 0 && c === 0) continue;                          // the gate is there
    const w = new THREE.PlaneGeometry(0.026, 0.042);
    w.rotateY(ry);
    const off = c * 0.04;
    w.translate(nx * (KW / 2 + 0.0007) + (nz ? off * nz : 0), B0 + 0.045 + r * 0.06, nz * (KW / 2 + 0.0007) + (nx ? -off * nx : 0));
    racks.push(w);
  }
  const rackGeo = merge(racks);
  const gate = xf(new THREE.PlaneGeometry(0.03, 0.045), 0, B0 + 0.0225, KW / 2 + 0.0008);
  const rock = lathe([[0, 0], [0.122, 0], [0.126, 0.008], [0.116, 0.018], [0.09, B0], [0, B0]], 11, { warp: (r, y, th) => [r * (1 + 0.07 * Math.sin(th * 3 + 1) + 0.04 * Math.sin(th * 7)), y] });
  // ---- a lit city on a patch torn from the map: the patch is a fine grid (it curls), towers stand on it
  const patchGeo = new THREE.PlaneGeometry(2 * CITY_HALF, 2 * CITY_HALF, 40, 40).rotateX(-Math.PI / 2).translate(0, 0.0007, 0);
  const towers = [], rngC = new Rng(404), SP = 0.037;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const d = Math.hypot(i, j);
    if (d > 3.6 || rngC.next() < 0.1) continue;
    const h = 0.018 + Math.pow(Math.max(0, 1 - d / 4), 1.6) * 0.13 + rngC.range(0, 0.02), w = rngC.range(0.022, 0.029), dd = w * rngC.range(0.8, 1.05);
    const ox = rngC.range(-0.003, 0.003), oz = rngC.range(-0.003, 0.003);
    const b = new THREE.BoxGeometry(w, h, dd, 1, Math.max(1, Math.round(h / 0.02)), 1);
    towers.push(xf(b, i * SP + ox, 0.0014 + h / 2, j * SP + oz));
    // setbacks and spires on the tall ones (a skyline that reads)
    if (h > 0.09) { const h2 = h * 0.28; towers.push(xf(new THREE.BoxGeometry(w * 0.62, h2, dd * 0.62, 1, 2, 1), i * SP + ox, 0.0014 + h + h2 / 2, j * SP + oz)); }
    if (h > 0.12) towers.push(xf(new THREE.BoxGeometry(0.003, 0.04, 0.003, 1, 2, 1), i * SP + ox, 0.0014 + h * 1.28 + 0.02, j * SP + oz));
  }
  const city = merge(towers);
  // ---- a power plant: a turbine hall with a sawtooth roof, two banded stacks, a cooling tower; smoke and steam
  const plantParts = [xf(softBox(0.25, 0.012, 0.17, 0.003), 0, 0.006, 0), xf(softBox(0.15, 0.08, 0.085, 0.002), -0.035, 0.012 + 0.04, 0.03)];
  for (let i = 0; i < 4; i++) {
    const tri = new THREE.CylinderGeometry(0.022, 0.022, 0.083, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6);
    plantParts.push(xf(tri, -0.0925 + i * 0.038, 0.092 + 0.011, 0.03));
  }
  const plant = merge(plantParts);
  const STK = [[0.075, -0.04, 0.25], [0.075, 0.03, 0.22]];
  const stackGeo = merge(STK.map(([x, z, h]) => xf(lathe([[0, 0], [0.017, 0], [0.012, h], [0.0135, h + 0.002], [0.0135, h + 0.008], [0.0105, h + 0.008], [0.0105, h - 0.01], [0, h - 0.01]], 18), x, 0.012, z)));
  const TOWER = { x: -0.06, z: -0.045, h: 0.14 };
  const tower = lathe([[0.058, 0], [0.052, 0.025], [0.042, 0.065], [0.039, 0.09], [0.041, 0.115], [0.046, TOWER.h], [0.042, TOWER.h], [0.037, 0.115], [0.035, 0.09], [0.038, 0.065], [0.048, 0.025], [0.0, 0.02]], 32).translate(TOWER.x, 0.012, TOWER.z);
  // lit windows along the hall (front and back), the stack tops glowing like embers
  const hallWin = merge([xf(new THREE.PlaneGeometry(0.13, 0.02), -0.035, 0.05, 0.03 + 0.0428), xf(new THREE.PlaneGeometry(0.13, 0.02), -0.035, 0.05, 0.03 - 0.0428, 0, Math.PI, 0)]);
  const stackGlow = merge(STK.map(([x, z, h]) => xf(new THREE.CircleGeometry(0.0105, 16).rotateX(-Math.PI / 2), x, 0.012 + h + 0.0075, z)));
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const smokeTops = [...STK.map(([x, z, h]) => [x, 0.012 + h + 0.01, z]), [TOWER.x, 0.012 + TOWER.h, TOWER.z]];
  // ---- the canvas for the city's printed streets is procedural (no texture)
  return (_feedShared = { gold, castle, roof, slitGeo, rackGeo, gate, rock, patchGeo, city, plant, stackGeo, tower, hallWin, stackGlow, puff, smokeTops });
}
// materials per press: every press clips its own item at its own mouth (uClip) and curls its own city (uPeel)
function feedMats(U) {
  const CLIP = 'if(vWorld.y < uClip) discard;';
  const gold = cel({
    color: '#eab43c', id: ID.GOLD, gloss: 1.0, rim: 1.3, uniforms: { uClip: U.uClip },
    pattern: /* glsl */ `
      ${CLIP}
      ${FADE}
      ${ENV}
      vec3 base = col;
      float fine = 1.0 - smoothstep(0.0004, 0.0016, mpp);
      col *= mix(1.0, env, 0.6);
      col *= 0.92 + 0.12 * vnoise(vec2(dot(vLocal, vec3(1.0, 0.0, 0.2)) * 900.0, vLocal.y * 40.0)) * fine;
      // a stamped cartouche on every bar's top face
      if(vLocalN.y > 0.9){
        vec2 q = vec2(vLocal.x, mod(vLocal.z + 0.0395, 0.079) - 0.0395);
        float box = max(abs(q.x) / 0.05, abs(q.y) / 0.016);
        col *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.08, abs(box - 1.0))) * fine;
        col *= 1.0 - 0.18 * step(box, 0.85) * step(0.5, fract(q.x * 160.0)) * step(abs(q.y), 0.006) * fine;
      }
      emis += base * 0.24;                     // gold shines even out of the lamp
      specTh = 0.88; specK = 1.4;
    `,
  });
  const stone = cel({
    color: '#a39b8e', id: ID.ASH, gloss: 0.1, rim: 1.2, uniforms: { uClip: U.uClip },
    pattern: /* glsl */ `
      ${CLIP}
      ${FADE}
      float fine = 1.0 - smoothstep(0.0003, 0.0012, mpp);
      vec3 q = vLocal * 110.0;
      float row = floor(q.y);
      float bx = fract((abs(vLocalN.x) > 0.5 ? q.z : q.x) * 0.5 + row * 0.5);
      float mortar = max(1.0 - smoothstep(0.0, 0.08, fract(q.y)), 1.0 - smoothstep(0.0, 0.05, bx));
      col *= 1.0 - 0.3 * mortar * fine * step(abs(vLocalN.y), 0.5);
      col *= 0.82 + 0.3 * vnoise(vLocal.xz * 160.0 + vLocal.y * 120.0);
      emis += col * 0.06;
    `,
  });
  const slate = cel({ color: '#3a3d46', id: ID.IRON, gloss: 0.5, rim: 1.4, uniforms: { uClip: U.uClip }, pattern: `${CLIP} col *= 0.85 + 0.25 * step(0.5, fract(vLocal.y * 90.0)); specTh = 0.95;` });
  // server racks behind the windows: teal-lit slots, blinking LEDs
  const rack = glowMaterial({
    color: '#ffffff', id: 144, uniforms: { uClip: U.uClip },
    pattern: /* glsl */ `
      ${CLIP}
      vec2 u = vUv;
      float rows = 8.0;
      vec2 cell = vec2(u.x * 3.0, u.y * rows);
      float slot = step(0.16, fract(cell.y)) * step(fract(cell.y), 0.9);
      col = mix(${lin('#06201f')}, ${lin('#1f9e92')}, slot);
      vec2 led = fract(cell);
      float on = step(length((led - vec2(0.3, 0.52)) * vec2(1.0, 2.2)), 0.2) * slot;
      float blink = step(0.3, fract(sin(dot(floor(cell) + floor(uFxTime * 4.0), vec2(12.9898, 78.233))) * 43758.5453));
      col += mix(${lin('#9cff7a')}, ${lin('#ffd060')}, step(0.66, fract(u.x * 3.0))) * on * blink * 2.2;
      // a dark window frame with an arched top
      vec2 c = (u - 0.5) * vec2(1.0, 1.6);
      float arch = u.y > 0.7 ? length(vec2(c.x, (u.y - 0.7) * 1.6)) : abs(c.x);
      col *= smoothstep(0.5, 0.42, arch) * smoothstep(0.0, 0.05, u.y);
      col *= 1.25;
    `,
  });
  const slit = glowMaterial({ color: '#ffffff', id: 144, uniforms: { uClip: U.uClip }, pattern: `${CLIP} col = ${lin('#3fd0bf')} * (0.8 + 0.6 * step(0.5, fract(vUv.y * 5.0 + floor(uFxTime * 3.0) * 0.37)));` });
  const gate = cel({ color: '#0c0b0a', id: ID.IRON, gloss: 0.2, uniforms: { uClip: U.uClip }, pattern: `${CLIP} vec2 c = vUv - vec2(0.5, 0.0); if(vUv.y > 0.62 && length(vec2(c.x, (vUv.y - 0.62) * 1.5)) > 0.5) discard; if(abs(c.x) > 0.5) discard; col *= 0.6 + 0.6 * step(0.5, fract(vUv.x * 6.0));` });
  // the map patch: the cloth's paper (same mottling as the cloth at the city's home), the streets lit up
  const patch = cel({
    color: '#bfac88', id: ID.ASH, gloss: 0.0, rim: 0.8, side: THREE.DoubleSide, uniforms: { uClip: U.uClip, uPeel: U.uPeel, uHome: U.uHome },
    vertex: BEND_GLSL,
    pattern: /* glsl */ `
      ${CLIP}
      ${FADE}
      vec2 p0 = vUv * 2.0 - 1.0;                          // -1..1 across the patch (u = x, v = -z)
      vec2 e = abs(p0);
      // the torn edge: ragged, fibrous
      float rag = 0.93 - 0.05 * vnoise(vec2((e.x > e.y ? p0.y : p0.x) * 9.0, e.x > e.y ? sign(p0.x) : 3.0 * sign(p0.y)))
                       - 0.03 * vnoise(vec2((e.x > e.y ? p0.y : p0.x) * 40.0, 7.0));
      if(max(e.x, e.y) > rag) discard;
      vec2 hp = uHome.xy + mat2(uHome.z, -uHome.w, uHome.w, uHome.z) * vec2(p0.x, -p0.y) * ${fl(CITY_HALF)};
      col *= 0.93 + 0.12 * fbm2(hp * 3.0 + 1.3);
      col *= 1.0 - 0.09 * smoothstep(0.6, 0.78, fbm2(hp * 1.6 + 7.0));
      float fibre = smoothstep(rag - 0.03, rag, max(e.x, e.y));
      col = mix(col, col * 1.12, fibre);
      specK = 0.0;
      if(!gl_FrontFacing){ col *= 0.55; }
      else {
        // the city's streets, glowing (a grid between the blocks), fading out at the suburbs
        vec2 q = p0 * ${fl(CITY_HALF)};
        float r = length(q);
        vec2 g = abs(fract(q / ${fl(0.037)} + 0.5) - 0.5) * ${fl(0.037)};
        float w = 0.003 + mpp * 0.6;
        float street = max(1.0 - smoothstep(w * 0.5, w, g.x), 1.0 - smoothstep(w * 0.5, w, g.y));
        float town = 1.0 - smoothstep(0.1, 0.14, r);
        float lamps = 0.65 + 0.35 * step(0.5, fract((g.x < g.y ? q.y : q.x) * 90.0));
        float lit = street * town * lamps;
        col = mix(col, col * 0.55, town * 0.6);
        if(lit > 0.05){ emis += ${lin('#ffc46a')} * 2.6 * lit; col = mix(col, ${lin('#ffc46a')}, lit); idOut = 144.0; }
        emis += ${lin('#ffb050')} * 0.22 * town;
      }
    `,
  });
  const towers = cel({
    color: '#2e2e36', id: ID.IRON, gloss: 0.45, rim: 1.4, uniforms: { uClip: U.uClip, uPeel: U.uPeel },
    vertex: BEND_GLSL,
    pattern: /* glsl */ `
      ${CLIP}
      ${FADE}
      lampMul = 0.4;                                   // a city at night: dark blocks, the light is in the windows
      if(abs(vLocalN.y) < 0.5){
        // lit windows: big enough to read in a medium shot; when they get too small they average into a glow
        vec2 w = vec2((abs(vLocalN.x) > 0.5 ? vLocal.z : vLocal.x) * 95.0, vLocal.y * 80.0);
        vec2 f = fract(w), c = floor(w);
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.2, f.y) * step(f.y, 0.82);
        float on = step(0.24, fract(sin(dot(c + floor(vLocal.xz * 41.0) * 7.0, vec2(12.9898, 78.233))) * 43758.5453));
        float far = smoothstep(0.0016, 0.005, mpp);
        float lit = mix(win * on, 0.5, far);
        vec3 wc = mix(${lin('#ffcf70')}, ${lin('#fff3cc')}, step(0.8, fract(c.x * 0.37 + c.y * 0.61)));
        col = mix(col, wc, lit);
        emis += wc * 2.8 * lit + ${lin('#ff9c40')} * 0.06;
        if(lit > 0.5) idOut = 144.0;
      } else { col *= 0.75; emis += ${lin('#ffb060')} * 0.1; }
    `,
  });
  const concrete = cel({ color: '#99938b', id: ID.ASH, gloss: 0.1, rim: 1.2, uniforms: { uClip: U.uClip }, pattern: `${CLIP} ${FADE} col *= 0.85 + 0.25 * vnoise(vLocal.xz * 300.0 + vLocal.y * 200.0); if(abs(vLocalN.y) < 0.5) col *= 1.0 - 0.2 * step(0.85, fract(vLocal.y * 70.0)) * (1.0 - smoothstep(0.0003, 0.0012, mpp)); emis += col * 0.06;` });
  const stack = cel({ color: '#b3aca4', id: ID.STEEL, gloss: 0.2, rim: 1.2, uniforms: { uClip: U.uClip }, pattern: `${CLIP} float yy = vLocal.y; col *= mix(1.0, 0.32, step(0.5, fract(yy * 22.0)) * step(0.13, yy)); emis += col * 0.06;` });
  const hallWin = glowMaterial({ color: '#ffffff', id: 144, uniforms: { uClip: U.uClip }, pattern: `${CLIP} float m = step(0.18, fract(vUv.x * 9.0)) * step(0.2, vUv.y) * step(vUv.y, 0.8); col = mix(${lin('#120c06')}, ${lin('#ffbe5a')} * 1.6, m);` });
  const ember = glowMaterial({ color: '#ffffff', id: 142, uniforms: { uClip: U.uClip }, pattern: `${CLIP} col = mix(${lin('#ff5a14')}, ${lin('#ffd08a')}, smoothstep(0.6, 0.0, length(vUv - 0.5) * 2.0)) * (1.6 + 0.6 * vnoise(vUv * 6.0 + uFxTime * 4.0));` });
  const smoke = cel({ color: '#8f8b86', id: 117, gloss: 0.0, rim: 0.8, pattern: 'col *= 0.78 + 0.32 * vnoise(vLocal.xy * 3.0 + vLocal.z); litBias += 0.3; emis += col * 0.22;' });
  const steam = cel({ color: '#dcdad6', id: 117, gloss: 0.0, rim: 0.8, pattern: 'col *= 0.85 + 0.2 * vnoise(vLocal.xy * 3.0 + vLocal.z); litBias += 0.35; emis += col * 0.25;' });
  return { gold, stone, slate, rack, slit, gate, patch, towers, concrete, stack, hallWin, ember, smoke, steam };
}
function buildFeed(id) {
  const S = feedShared();
  const U = { uClip: { value: -99 }, uPeel: { value: 0 }, uHome: { value: new THREE.Vector4(CITY[0], CITY[2], 1, 0) } };
  const Mt = feedMats(U);
  const root = group(null, 'feed-' + id);
  const items = {};
  items.gold = group(root, 'gold'); mesh(S.gold, Mt.gold, items.gold);
  items.castle = group(root, 'castle');
  mesh(S.rock, Mt.stone, items.castle); mesh(S.castle, Mt.stone, items.castle); mesh(S.roof, Mt.slate, items.castle); mesh(S.gate, Mt.gate, items.castle);
  noShadow(mesh(S.rackGeo, Mt.rack, items.castle)); noShadow(mesh(S.slitGeo, Mt.slit, items.castle));
  items.city = group(root, 'city');
  mesh(S.patchGeo, Mt.patch, items.city); mesh(S.city, Mt.towers, items.city);
  items.plant = group(root, 'plant');
  mesh(S.plant, Mt.concrete, items.plant); mesh(S.stackGeo, Mt.stack, items.plant); mesh(S.tower, Mt.concrete, items.plant);
  noShadow(mesh(S.hallWin, Mt.hallWin, items.plant)); noShadow(mesh(S.stackGlow, Mt.ember, items.plant));
  const puffs = [];
  for (let i = 0; i < 27; i++) { const m = mesh(S.puff, i < 18 ? Mt.smoke : Mt.steam, items.plant); m.userData.noShadow = true; puffs.push(m); }
  for (const k of Object.keys(items)) items[k].visible = false;
  return {
    root, items, U,
    // smoke and steam: puffs born at the stack tops and the tower mouth, rising, swelling, drifting (on threes)
    smoke(t) {
      const T = onThrees(t);
      puffs.forEach((m, i) => {
        const src = i < 18 ? i % 2 : 2, k = i < 18 ? Math.floor(i / 2) : i - 18, n = i < 18 ? 9 : 9;
        const ph = k / n + src * 0.13;
        const age = (T * (src === 2 ? 0.3 : 0.42) + ph) % 1;
        const [x, y, z] = S.smokeTops[src];
        const big = src === 2 ? 1.25 : 1;
        m.position.set(x + age * 0.11 + Math.sin(k * 7.1 + src) * 0.012 * age, y + age * (src === 2 ? 0.17 : 0.2), z - age * 0.03 + Math.cos(k * 3.3) * 0.01 * age);
        const r = (0.011 + age * 0.042) * big * (0.85 + 0.3 * Math.sin(k * 5.3 + src));
        m.scale.set(r, r * 0.82, r);
        m.rotation.set(k, k * 2.3, 0);
        m.visible = age > 0.02 && age < 0.96;
      });
    },
  };
}
// the city's home on the cloth: at CITY, its grabbed edge (+z) turned toward the owner's seat
function cityYaw(id) { const p = seatPos(id); return Math.atan2(p[0] - CITY[0], p[2] - CITY[2]); }
// world position of the city's grabbed edge (pure: layout + peel, the table at rest)
export function cityGrab(peel = 0, out = V3(), id = 'meta') {
  cityBend(0, 0, CITY_HALF * 0.93, clamp(peel), out);
  return out.applyAxisAngle(V3(0, 1, 0), cityYaw(id)).add(V3(...CITY));
}

// ------------------------------------------------------------------ iron keys (4-03, 4-08, 5-xx, 6-05, 7-11, 7-12)
// A big old iron key: an ornate trefoil bow, a moulded collar, a long round shaft, a chunky warded bit.
// Key frame: the shaft runs along +y (the bow centred on the origin, the bit at the far end), the bit sticks out to +x,
// the flats of the bow and the bit lie in the xy plane.
// KEY: the design (built at KEY.S): ~0.24 m long overall, the bow ~0.1 m across
export const KEY = { BOW: 0.046, T: 0.01, SHAFT: 0.0072, L: 0.215, BITW: 0.032, BITL: 0.036, S: 1.12 };
export const KEY_TIP = [0, (KEY.L - 0.006 - KEY.BITL / 2) * KEY.S, 0];   // the bit's centre on the shaft axis (key frame)
// held in a king's 'hold' fist (hand frame: origin palm centre, +y fingers, +z out of the palm, x toward the thumb of a
// right hand): pinched between the thumb and the side of the curled index finger, the bow standing out on the thumb
// side (it reads from the knuckles' side and from the thumb's), the shaft running forward past the fingers, the bit
// pointing out of the palm (down when the palm faces down: the reach for a padlock's vertical keyhole).
// at: the bow's centre (x is mirrored for the left hand); tilt: a pitch of the key about hand x (rad, + = bit forward)
HOLD.key = { at: [0.066, 0.03, 0.028], tilt: 0.0 };
let _keyShared = null;
function keyShared() {
  if (_keyShared) return _keyShared;
  const { BOW, T, SHAFT, L, BITW, BITL } = KEY;
  // the bow: a trefoil outline (lobes down and to the sides; a valley at the top where the collar starts), three holes
  const N = 96, out = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, r = BOW * (0.86 + 0.14 * Math.cos(3 * (a + Math.PI / 2))) * (1 - 0.06 * Math.pow(Math.max(0, Math.sin(a)), 8));
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const holes = [];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * TAU) / 3, cx = Math.cos(a) * BOW * 0.45, cy = Math.sin(a) * BOW * 0.45, rr = BOW * 0.25;
    holes.push(Array.from({ length: 28 }, (_, j) => { const b = (j / 28) * TAU; return [cx + Math.cos(b) * rr, cy + Math.sin(b) * rr]; }));
  }
  const ring = Array.from({ length: 24 }, (_, j) => { const b = (j / 24) * TAU; return [Math.cos(b) * BOW * 0.1, Math.sin(b) * BOW * 0.1]; });
  const bow = extrude(out, T, 0.0022, 2, [...holes]);
  // a boss in the middle of the bow (both faces), the collar: stacked rings where the shaft leaves the bow
  const boss = new THREE.CylinderGeometry(BOW * 0.13, BOW * 0.15, T + 0.006, 18).rotateX(Math.PI / 2);
  void ring;
  const y0 = BOW * 0.78;
  const collar = lathe([[0, y0 - 0.004], [0.011, y0 - 0.004], [0.0135, y0 + 0.002], [0.0135, y0 + 0.007], [0.0098, y0 + 0.011], [0.0098, y0 + 0.016], [0.0122, y0 + 0.02], [0.0122, y0 + 0.025], [0.0088, y0 + 0.03], [SHAFT, y0 + 0.036], [0, y0 + 0.036]], 20);
  const shaft = lathe([[0, y0 + 0.03], [SHAFT, y0 + 0.03], [SHAFT, L - 0.004], [SHAFT * 0.8, L], [0, L]], 18);
  // the bit: a thick warded plate on the +x side near the tip
  const by0 = L - 0.006 - BITL, by1 = L - 0.006, bw = BITW;
  const bitPts = [[0, by0], [bw, by0], [bw, by0 + 0.008], [bw - 0.01, by0 + 0.008], [bw - 0.01, by0 + 0.014], [bw, by0 + 0.014], [bw, by1 - 0.009], [bw - 0.007, by1 - 0.009], [bw - 0.007, by1 - 0.004], [bw, by1 - 0.004], [bw, by1], [0, by1]];
  const bit = extrude(bitPts, T * 0.85, 0.0012, 1);
  const geo = merge([bow, boss, collar, shaft, bit]).scale(KEY.S, KEY.S, KEY.S);
  const mat = metalMat({
    color: '#6b665f', id: ID.IRON, gloss: 0.85, metal: 0.45, mottle: 50, scratch: 0.5, edgeWear: 1.3, seed: 6.6,
    more: /* glsl */ `
      // rust in the hollows, polished where fingers wear it; a rim that holds against black
      col = mix(col, ${lin('#6a3e24')} * 0.8, smoothstep(0.62, 0.82, fbm2(vLocal.xy * 90.0 + 3.0)) * 0.55);
      { vec3 rV = normalize(cameraPosition - vWorld); emis += col * 0.55 * smoothstep(0.5, 0.92, 1.0 - abs(dot(N, rV))); }
      emis += col * 0.08;
      specTh = 0.9; specK = 1.3;
    `,
  });
  return (_keyShared = { geo, mat });
}
function buildKey(id) {
  const S = keyShared();
  const root = group(null, 'key-' + id);
  mesh(S.geo, S.mat, root);
  root.visible = false;
  return { root };
}
// where a key lies when it is in no hand: flat on the table in front of the king, the shaft toward the sea
export function keyRest(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.92, 0, SEAT.Z[k.seat] + 0.15]; }
const _kR = new THREE.Matrix4(), _kT = new THREE.Matrix4(), _kA = V3(), _kY = V3(), _kQ = new THREE.Quaternion();
// pure: the key's world matrix for a hand frame (origin palm centre, +y fingers, +z out of the palm), side, turn.
// aim [x,y,z] (optional): the key pivots in the pinch (about the bow) so its shaft points at that world point (a
// keyhole), by aimK 0..1 (default 1); the bit keeps to the palm side.
export function keyMatrix(hand, side, turn = 0, out = new THREE.Matrix4(), aim = null, aimK = 1) {
  const ts = side === 'L' ? -1 : 1, h = HOLD.key;
  hand.decompose(_p, _q, _s);
  const sc = (_s.x + _s.y + _s.z) / 3 || 1;
  out.compose(_p, _q, _one);
  _kR.makeRotationFromEuler(_e.set(h.tilt, -Math.PI / 2, 0, 'XYZ'));        // key +x (the bit) -> hand +z
  _kR.setPosition(ts * h.at[0] * sc, h.at[1] * sc, h.at[2] * sc);
  out.multiply(_kR);
  if (aim && aimK > 0) {
    _kA.set(aim[0], aim[1], aim[2]).sub(_p.setFromMatrixPosition(out));
    if (_kA.lengthSq() > 1e-8) {
      _kY.setFromMatrixColumn(out, 1).normalize();
      _kQ.setFromUnitVectors(_kY, _kA.normalize());
      _q.identity().slerp(_kQ, clamp(aimK));
      _kT.makeRotationFromQuaternion(_q);
      const px = _p.x, py = _p.y, pz = _p.z;
      out.setPosition(0, 0, 0).premultiply(_kT).setPosition(px, py, pz);
    }
  }
  out.multiply(_kT.makeRotationY(-ts * clamp(turn) * Math.PI / 2));
  if (sc !== 1) out.multiply(_kT.makeScale(sc, sc, sc));
  return out;
}
// pure: the world point of the bit for a hand frame (same arguments)
export function keyTipFrom(hand, side, turn = 0, out = V3(), aim = null, aimK = 1) { return out.set(...KEY_TIP).applyMatrix4(keyMatrix(hand, side, turn, _kT2, aim, aimK)); }
// pure: where the bow sits for a hand frame (the pivot of `aim`): put the hand so |keyhole - keyBowFrom| = KEY_TIP[1]
export function keyBowFrom(hand, side, out = V3()) { const ts = side === 'L' ? -1 : 1, h = HOLD.key; hand.decompose(_p, _q, _s); const sc = (_s.x + _s.y + _s.z) / 3 || 1; return out.set(ts * h.at[0] * sc, h.at[1] * sc, h.at[2] * sc).applyQuaternion(_q).add(_p); }
const _kT2 = new THREE.Matrix4();

// ------------------------------------------------------------------ the turn clocks (斗地主 出牌倒计时)
// A heavy brass twin-bell alarm clock standing on the table at clockPos(id): a drum with a face front (toward the king)
// and back (toward the table and a camera across it); each face is a black dial whose centre is a big glowing nixie
// window showing n (0..15). Clock frame: base centre on the tabletop, +z = the front face (toward the king), +y up.
// design units, built at CLOCK.S: ~0.31 m tall to the bells, the number window 0.14 x 0.1 m
export const CLOCK = { R: 0.084, D: 0.062, FOOT: 0.026, WIN: [0.112, 0.08], S: 1.25 };
CLOCK.Y = CLOCK.FOOT + CLOCK.R;                        // drum centre height (design units)
let _clockShared = null;
function digitAtlas() {
  // 16 cells (0..15), 4 x 4, each cell the window's aspect: an orange nixie numeral with its halo
  const CW = 320, CH = Math.round(CW * CLOCK.WIN[1] / CLOCK.WIN[0]);
  const c = canvas(CW * 4, CH * 4), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let n = 0; n < 16; n++) {
    const x = (n % 4) * CW + CW / 2, y = Math.floor(n / 4) * CH + CH / 2 + CH * 0.04;
    const s = String(n), size = Math.round(CH * 0.92);
    g.font = `700 ${size}px ${FONT_SANS}`;
    const w = g.measureText(s).width, k = Math.min(1, (CW * 0.86) / w);
    g.save(); g.translate(x, y); g.scale(k, 1);
    g.shadowColor = 'rgba(255, 70, 10, 1)'; g.shadowBlur = CH * 0.16;
    g.fillStyle = '#ff5a14'; g.fillText(s, 0, 0); g.fillText(s, 0, 0);
    g.shadowBlur = CH * 0.05; g.shadowColor = 'rgba(255, 170, 80, 1)';
    g.fillStyle = '#ffd2a0'; g.fillText(s, 0, 0);
    g.restore();
  }
  return { tex: tex(c), CW, CH };
}
function clockShared() {
  if (_clockShared) return _clockShared;
  const { R, D, FOOT, WIN } = CLOCK;
  const h = D / 2;
  // the drum and both bezels, one turned profile about z
  const drum = lathe([[R * 0.86, -h - 0.007], [R + 0.005, -h - 0.007], [R + 0.008, -h - 0.0035], [R + 0.008, -h + 0.004], [R, -h + 0.008], [R, h - 0.008], [R + 0.008, h - 0.004], [R + 0.008, h + 0.0035], [R + 0.005, h + 0.007], [R * 0.86, h + 0.007], [R * 0.845, h + 0.002]], 64).rotateX(Math.PI / 2);
  const back = drum.clone();
  void back;
  // the inner lip of the back bezel (the lathe above runs from the back rim round to the front lip only)
  const lipB = lathe([[R * 0.845, -h - 0.002], [R * 0.86, -h - 0.007]], 64).rotateX(Math.PI / 2);
  const dial = new THREE.CircleGeometry(R * 0.865, 64);
  const win = new THREE.PlaneGeometry(WIN[0], WIN[1]);
  // twin bells on top (domes, open below), leaning out; a hammer between; a carrying bow; two splayed feet
  const bell = lathe([[0.0375, 0.0], [0.0405, 0.0], [0.0385, 0.007], [0.033, 0.019], [0.024, 0.029], [0.012, 0.0335], [0.0, 0.034], [0.0, 0.029], [0.021, 0.025], [0.03, 0.016], [0.035, 0.006], [0.0375, 0.0]], 32);
  const bellPost = new THREE.CylinderGeometry(0.0042, 0.0042, 0.03, 10).translate(0, -0.015, 0);
  const knob = new THREE.SphereGeometry(0.0062, 12, 8).translate(0, 0.0355, 0);
  const handle = new THREE.TorusGeometry(0.036, 0.005, 10, 32, Math.PI);
  const hammer = merge([new THREE.CylinderGeometry(0.0026, 0.0026, 0.046, 8).translate(0, 0.023, 0), new THREE.SphereGeometry(0.0072, 12, 8).translate(0, 0.047, 0)]);
  const leg = merge([lathe([[0, 0], [0.0065, 0], [0.0055, 0.05], [0, 0.05]], 10).translate(0, -0.05, 0), new THREE.SphereGeometry(0.0115, 14, 10).scale(1, 0.8, 1.9).translate(0, -0.05, 0)]);
  const brass = brassMat({
    color: '#c9a259', seed: 3.7, metal: 0.55, edgeWear: 0.4,
    more: `{ vec3 rV = normalize(cameraPosition - vWorld); emis += col * 0.45 * smoothstep(0.55, 0.92, 1.0 - abs(dot(N, rV))); } emis += col * 0.05;`,
  });
  // the dial: black enamel, a brass minute ring and twelve bold hour bars round the window; a red sweep marker
  const dialMat = cel({
    color: '#0d0c0b', id: ID.IRON, gloss: 0.9, rim: 0.6,
    pattern: /* glsl */ `
      ${FADE}
      vec2 q = vLocal.xy; float r = length(q), a = atan(q.x, q.y);
      float rr = ${fl(R * 0.865)};
      float minute = abs(fract(a / ${fl(TAU / 60)} + 0.5) - 0.5) * ${fl(TAU / 60)} * r;
      float hour = abs(fract(a / ${fl(TAU / 12)} + 0.5) - 0.5) * ${fl(TAU / 12)} * r;
      float band = step(rr * 0.86, r) * step(r, rr * 0.97);
      float tk = max((1.0 - smoothstep(0.0006, 0.0012 + mpp, minute)) * step(rr * 0.9, r), (1.0 - smoothstep(0.0018, 0.0026 + mpp, hour)) * step(rr * 0.82, r)) * step(r, rr * 0.96);
      col = mix(col, ${lin('#c9a259')}, tk);
      col = mix(col, ${lin('#c9a259')}, (1.0 - smoothstep(0.0005, 0.0011 + mpp, abs(r - rr * 0.975))));
      // the sweep marker: a red wedge stepping round the rim once a second-tick
      float sa = floor(uTime) * ${fl(TAU / 60)};
      float da = abs(mod(a - sa + 3.14159, 6.28318) - 3.14159);
      if(r > rr * 0.8 && r < rr * 0.95 && da * r < 0.0045 * (r - rr * 0.78) / (rr * 0.17)){ col = ${lin('#d0281c')}; emis += col * 0.6; }
      gloss = 0.9; specTh = 0.93;
      emis += col * 0.04;
    `,
  });
  const atlas = digitAtlas();
  return (_clockShared = { drum, lipB, dial, win, bell, bellPost, knob, handle, hammer, leg, brass, dialMat, atlas });
}
function buildClock(id) {
  const S = clockShared(), { R, D, FOOT, WIN } = CLOCK, Y = CLOCK.Y, h = D / 2;
  const k = KING[id];
  const root = group(null, 'clock-' + id);
  root.position.set(...clockPos(id));
  root.rotation.y = k.side === 'CN' ? -Math.PI / 2 : Math.PI / 2;
  const home = root.position.clone();
  const body = group(root, 'body');                    // pops (scale about the base) and rattles
  mesh(S.drum, S.brass, body, 0, Y, 0); mesh(S.lipB, S.brass, body, 0, Y, 0);
  mesh(S.dial, S.dialMat, body, 0, Y, h + 0.0005);
  mesh(S.dial, S.dialMat, body, 0, Y, -h - 0.0005, 0, Math.PI, 0);
  const uN = { value: 0 }, uOn = { value: 1 }, uFlash = { value: 0 };
  const winMat = glowMaterial({
    color: '#ffffff', id: 145, uniforms: { uDig: { value: S.atlas.tex }, uN, uOn, uFlash },
    pattern: /* glsl */ `
      vec2 c = abs(vUv - 0.5) * vec2(${fl(WIN[0])}, ${fl(WIN[1])});
      vec2 hb = vec2(${fl(WIN[0] / 2 - 0.009)}, ${fl(WIN[1] / 2 - 0.009)});
      float d = length(max(c - hb, 0.0)) - 0.009;
      if(d > 0.0) discard;
      vec2 cell = vec2(mod(uN, 4.0), 3.0 - floor(uN / 4.0));
      vec3 dg = pow(texture(uDig, (cell + vUv) / 4.0).rgb, vec3(1.22));
      // the nixie's anode mesh over a smoky glass, a dark brass rim
      vec2 hx = vUv * vec2(${fl(WIN[0] / 0.0032)}, ${fl(WIN[1] / 0.0032)});
      float mesh = 0.86 + 0.14 * step(0.18, abs(fract(hx.x + 0.5 * step(0.5, fract(hx.y * 0.5))) - 0.5)) * step(0.2, abs(fract(hx.y) - 0.5));
      col = ${lin('#120806')} + dg * 2.1 * uOn * (1.0 + 0.7 * uFlash) * mesh;
      col = mix(col, ${lin('#3a2a14')}, smoothstep(-0.0025, 0.0, d));
    `,
  });
  mesh(S.win, winMat, body, 0, Y, h + 0.0012).userData.noShadow = true;
  mesh(S.win, winMat, body, 0, Y, -h - 0.0012, 0, Math.PI, 0).userData.noShadow = true;
  // bells, hammer, handle, feet
  const top = Y + R + 0.004;
  const bells = [];
  for (const sx of [-1, 1]) {
    const bg = group(body, 'bell', sx * 0.042, top + 0.012, 0);
    bg.rotation.z = -sx * 0.5;
    mesh(S.bell, S.brass, bg); mesh(S.knob, S.brass, bg); mesh(S.bellPost, S.brass, bg);
    bells.push(bg);
  }
  const hammer = group(body, 'hammer', 0, top - 0.004, 0);
  mesh(S.hammer, S.brass, hammer);
  mesh(S.handle, S.brass, body, 0, top + 0.004, 0);
  for (const sx of [-1, 1]) { const lg = mesh(S.leg, S.brass, body, sx * 0.05, FOOT + 0.047, 0, 0, 0, sx * 0.62); void lg; }
  root.visible = false;
  const update = (c, t) => {
    const show = clamp(c?.show ?? (c ? 1 : 0));
    root.visible = show > 0.001;
    if (!root.visible) return;
    // pop: a small spring (overshoot, then settle), scaled about the base
    const x = show, s = 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
    const sq = 1 + 0.12 * Math.sin(Math.PI * x) * (1 - x);
    body.scale.set(s / Math.sqrt(sq), s * sq, s / Math.sqrt(sq)).multiplyScalar(CLOCK.S);
    if (c.at) root.position.set(c.at[0], c.at[1] ?? 0, c.at[2]); else root.position.copy(home);
    const n = Math.max(0, Math.min(15, Math.ceil((c.n ?? 0) - 1e-6)));
    uN.value = n;
    const ring = clamp(c.ring ?? 0), f = Math.floor(t * 24 + 1e-6);
    const hsh = (a) => { const v = Math.sin(f * 12.9898 + a * 78.233) * 43758.5453; return v - Math.floor(v); };
    body.position.set((hsh(1) - 0.5) * 0.004 * ring, Math.abs(Math.sin(f * 2.1)) * 0.007 * ring * hsh(2), (hsh(3) - 0.5) * 0.003 * ring);
    body.rotation.set((hsh(4) - 0.5) * 0.05 * ring, (hsh(5) - 0.5) * 0.12 * ring, (hsh(6) - 0.5) * 0.09 * ring);
    hammer.rotation.z = ring > 0.01 ? (f % 2 ? 0.48 : -0.48) * Math.min(1, ring * 2) : 0;
    bells.forEach((b, i) => { const v = 1 + 0.05 * ring * (hsh(7 + i) - 0.5); b.scale.set(v, 1 / v, v); });
    uFlash.value = ring > 0.01 ? ring * (Math.floor(t * 8 + 1e-6) % 2) : 0;
    uOn.value = 0.35 + 0.65 * smooth(show * 1.5) - 0.25 * (ring > 0.01 ? (1 - (Math.floor(t * 8 + 1e-6) % 2)) * ring : 0);
  };
  return { root, body, update };
}
// world centre of a clock's number window (pure: layout, the table at rest); back = the face toward the table
export function clockFace(id, back = false, out = V3(), at = null) {
  const [x, , z] = at ?? clockPos(id), s = SIDE_SIGN[KING[id].side];
  return out.set(x + (back ? -1 : 1) * s * (CLOCK.D / 2 + 0.0012) * CLOCK.S, CLOCK.Y * CLOCK.S, z);
}

// ------------------------------------------------------------------ v3: the 批准 rubber stamps
// A heavy old office rubber stamp scaled up for the kings: a turned dark wooden knob, a brass ferrule, a thick lacquered
// wooden mount (an index label 批准 APPROVED on both long sides, ink smeared on its lower edge), a grey cushion, and the
// red rubber die cut in relief with 批准 big and APPROVED small inside a double rectangular border, mirrored on the
// rubber (it prints the right way round); dried ink caked round the strokes and the die's edge.
// The handle is turned for a FIST: a brass ferrule on the mount, a 10 cm grip (the fist's hole, ~3.8 cm), a knob cap
// standing above the thumb.
// Stamp frame: origin = the centre of the rubber face (the tops of the raised strokes), +y up the handle, local +z = the
// print's up (the top of the text), local -x = the print's reading direction (seen from above).
//   STAMP.W x STAMP.D   the face (m)          STAMP.H   face to the top of the knob
//   STAMP.GRIP          face to the PALM CENTRE (api.handFrame's origin): a palm-down fist on the knob (knob top 1 cm
//                       under the palm). This is the contract: without gripFrame, face centre = palm - (0, GRIP, 0).
//   STAMP.FIST          face to the fist's hole centre when the hole is vertical (the kings' stamp grip: thumb up,
//                       fingers level toward the table, palm toward his middle; the hole grips the handle's middle)
//   STAMP.KNOB          face to the fist's hole centre when the hole is horizontal (a palm-down fist round the knob)
//   STAMP.SINK          how far the mount comes down on the squashed rubber at press 1 (the face stays put)
// Held: st.props.stamps[id][side] = { press, wet, yaw?, at?, show? }: the axis stays world-vertical, face down.
//   api.handFrame only:       face centre = palm centre - (0, GRIP, 0)
//   api.gripFrame passed too: face centre = hole centre - (0, FIST .. KNOB, 0) (by how upright the hole is; the handle
//                             runs through the 'fist' hole, the knob above the thumb)
// stampDrop(hand, grip) gives the drop used, stampFaceFrom(hand, out, grip) the face. Turned with the hand: the print's
// up = the horizontal heading of the hand's fingers (+y) blended with (hand x) x (world up): a fist held with the
// fingers toward the table prints upright for its king.
// yaw (rad, optional) overrides the hand's heading (same convention as an ink mark's rot: the print's up =
// (sin yaw, 0, cos yaw)); at ([x, y, z], optional) puts the face centre there instead of in the hand.
export const STAMP = { W: 0.12, D: 0.08, H: 0.23, GRIP: 0.242, FIST: 0.121, KNOB: 0.207, RELIEF: 0.0022, DIE: 0.007, CUSH: 0.004, BW: 0.132, BH: 0.038, BD: 0.092, SINK: 0.3 * 0.007 + 0.4 * 0.004 };
const STAMP_BT = STAMP.DIE + STAMP.CUSH + STAMP.BH;                 // the mount's top (stamp frame y)
const DIE_PX = [1536, 1024];
const LABEL = { W: 0.104, H: 0.0235, Y: STAMP.DIE + STAMP.CUSH + STAMP.BH * 0.47 };
// the die's art, drawn as it PRINTS (read on the paper, text up = canvas up). R: the crisp art (white = a raised,
// printing stroke), G: R softened by ~0.5 mm (stroke edges, the rubber's sloped walls), B: R spread by ~2 mm (ink halo,
// ink caked round the strokes). Rubber, prints, decals and paintStampMark all read this one drawing.
let _dieArt = null;
function dieArt() {
  if (_dieArt) return _dieArt;
  const [PW, PH] = DIE_PX, mm = PW / (STAMP.W * 1000);
  const c = canvas(PW, PH), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round';
  const frame = (inset, lw, r) => { g.lineWidth = lw * mm; g.beginPath(); g.roundRect(inset * mm, inset * mm, PW - 2 * inset * mm, PH - 2 * inset * mm, r * mm); g.stroke(); };
  frame(3.4, 3.2, 3.0);
  frame(7.5, 1.1, 1.2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(43 * mm)}px ${FONT_HEI}`;
  g.lineWidth = 1.2 * mm;
  const cw = g.measureText('批').width;
  for (const [ch, dx] of [['批', -1], ['准', 1]]) { const x = PW / 2 + dx * (cw / 2 + 2.4 * mm); g.fillText(ch, x, 31 * mm); g.strokeText(ch, x, 31 * mm); }
  g.fillRect(17 * mm, 55 * mm, PW - 34 * mm, 0.9 * mm);
  g.font = `700 ${Math.round(11.4 * mm)}px ${FONT_SERIF}`;
  g.lineWidth = 0.25 * mm;
  const aw = [...'APPROVED'].map((ch) => g.measureText(ch).width), sp = 2.3 * mm, tot = aw.reduce((a, b) => a + b, 0) + sp * 7;
  let ax = PW / 2 - tot / 2;
  [...'APPROVED'].forEach((ch, i) => { g.fillText(ch, ax + aw[i] / 2, 64.8 * mm); g.strokeText(ch, ax + aw[i] / 2, 64.8 * mm); ax += aw[i] + sp; });
  // a worn die: nicks in the strokes, two cracks across the outer border
  const rng = new Rng(4242);
  g.fillStyle = '#000';
  for (let i = 0; i < 46; i++) { g.beginPath(); g.arc(rng.range(9, 111) * mm, rng.range(9, 71) * mm, rng.range(0.12, 0.42) * mm, 0, TAU); g.fill(); }
  g.save(); g.translate(43 * mm, 3.4 * mm); g.rotate(0.3); g.fillRect(-0.25 * mm, -2.5 * mm, 0.5 * mm, 5 * mm); g.restore();
  g.save(); g.translate(PW - 3.4 * mm, 52 * mm); g.rotate(1.2); g.fillRect(-0.2 * mm, -2.5 * mm, 0.4 * mm, 5 * mm); g.restore();
  const blurred = (px) => { const b = canvas(PW, PH), bg = b.getContext('2d'); bg.fillStyle = '#000'; bg.fillRect(0, 0, PW, PH); bg.filter = `blur(${px}px)`; bg.drawImage(c, 0, 0); return bg.getImageData(0, 0, PW, PH).data; };
  const R = g.getImageData(0, 0, PW, PH).data, Gb = blurred(6), Bb = blurred(26);
  const out = canvas(PW, PH), og = out.getContext('2d'), img = og.createImageData(PW, PH), d = img.data;
  for (let i = 0; i < PW * PH; i++) { d[i * 4] = R[i * 4]; d[i * 4 + 1] = Gb[i * 4]; d[i * 4 + 2] = Bb[i * 4]; d[i * 4 + 3] = 255; }
  og.putImageData(img, 0, 0);
  const t = tex(out);
  return (_dieArt = { canvas: out, data: d, PW, PH, tex: t });
}
// bilinear read of the art: u 0..1 left -> right, v 0..1 top -> bottom of the print; ch 0 R, 1 G, 2 B
function dieSample(u, v, ch) {
  const { data, PW, PH } = dieArt();
  const x = u * PW - 0.5, y = v * PH - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx, yy) => data[((Math.max(0, Math.min(PH - 1, yy)) * PW) + Math.max(0, Math.min(PW - 1, xx))) * 4 + ch] / 255;
  return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
}
// deterministic value noise for the 2D painter
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul((y | 0) + 0x7f4a7c15, 0x85ebca77) ^ Math.imul((s | 0) + 0x165667b1, 0xc2b2ae3d); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
function vnJ(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbmJ = (x, y, s = 0) => { let v = 0, a = 0.5; for (let i = 0; i < 4; i++) { v += a * vnJ(x, y, s + i * 31); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return v / 0.9375; };
const seed01 = (s) => { const v = Math.sin((+s || 0) * 12.9898 + 4.1414) * 43758.5453; return v - Math.floor(v); };
// The same mark as the cloth decals, dry, painted into a 2D canvas: the whole die (STAMP.W : STAMP.D = 3 : 2) fills
// the box (x, y, w, h), text up = canvas up. Ink multiplies onto what is there (red ink on a printed card).
const _marks = new Map();
export function paintStampMark(g, x, y, w, h, seed = 1) {
  const W = Math.max(2, Math.round(Math.abs(w))), H = Math.max(2, Math.round(Math.abs(h)));
  const key = `${W}x${H}:${seed}`;
  let cv = _marks.get(key);
  if (!cv) {
    cv = canvas(W, H);
    const cg = cv.getContext('2d'), img = cg.createImageData(W, H), d = img.data;
    const sd = seed01(seed), si = Math.floor(sd * 9973), ang = sd * TAU, ca = Math.cos(ang), sa = Math.sin(ang), tk = 0.3 + 0.55 * ((sd * 7.31) % 1);
    const px = DIE_PX[0] / W;                      // die pixels per output pixel (> ~2.5: a small print, average it)
    const small = clamp((px - 1.5) / 2);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = (j + 0.5) / H;
      const mg = dieSample(u, v, 1), mr = dieSample(u, v, 0);
      if (mg < 0.01 && mr < 0.01) continue;
      const tx = u * DIE_PX[0], ty = v * DIE_PX[1];
      const qx = u * 1.5, qy = 1 - v;
      const pr = 0.74 + 0.8 * (fbmJ(qx * 4, qy * 4, si) - 0.5) + 0.25 * (vnJ(qx * 22, qy * 22, si + 11) - 0.5) - tk * ((qx - 0.75) * ca + (qy - 0.5) * sa);
      const rag = ((vnJ(tx * 0.3, ty * 0.3, si + 5) - 0.5) * 0.22 + (vnJ(tx * 1.1, ty * 1.1, si + 3) - 0.5) * 0.1) * (1 - small);
      const shape = sstep01(0.45 + rag, 0.55 + rag + 0.1 * small, lerp(mg, 0.5 * (mr + mg), small));
      const tooth = vnJ(tx * 0.45, ty * 0.45, si + 91) * 0.55 + vnJ(tx * 1.3, ty * 1.3, si + 13) * 0.3 + vnJ(tx * 0.12, ty * 0.12, si + 4) * 0.15;
      const cover = lerp(clamp((pr - 0.12 - tooth * 0.72) * 5), clamp((pr - 0.25) * 2), small);
      const a = shape * cover;
      if (a <= 0.003) continue;
      const rim = 1 - sstep01(0.5, 0.9, mg), heavy = sstep01(0.35, 1.1, pr);
      const k = lerp(1.18, 0.86, heavy) * (1 - 0.42 * rim * (1 - small)) * (0.88 + 0.2 * vnJ(tx * 0.08, ty * 0.08, si + 3));
      const o = (j * W + i) * 4;
      d[o] = Math.min(255, 188 * k + 42 * (1 - heavy)); d[o + 1] = Math.min(255, 42 * k + 6 * (1 - heavy)); d[o + 2] = Math.min(255, 48 * k + 6 * (1 - heavy));
      d[o + 3] = Math.round(255 * Math.min(1, a));
    }
    cg.putImageData(img, 0, 0);
    _marks.set(key, cv);
  }
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.drawImage(cv, x, y, w, h);
  g.restore();
}
const sstep01 = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// the rubber squashing (press 0..1): the die and the cushion shorten and bulge; the face stays where it is
const SQUASH_DIE = /* glsl */ `
  {
    float m = sin(3.14159 * clamp(pos.y / ${fl(STAMP.DIE)}, 0.0, 1.0));
    pos.x *= 1.0 + 0.022 * m * uPress;
    pos.z *= 1.0 + 0.032 * m * uPress;
    pos.y *= 1.0 - 0.3 * uPress;
  }
`;
const SQUASH_CUSH = /* glsl */ `
  {
    float a = clamp((pos.y - ${fl(STAMP.DIE)}) / ${fl(STAMP.CUSH)}, 0.0, 1.0);
    float m = sin(3.14159 * a);
    pos.x *= 1.0 + 0.026 * m * uPress;
    pos.z *= 1.0 + 0.036 * m * uPress;
    pos.y = ${fl(STAMP.DIE)} * (1.0 - 0.3 * uPress) + (pos.y - ${fl(STAMP.DIE)}) * (1.0 - 0.4 * uPress);
  }
`;
// the four side walls of a w x d box between y0 and y1 (normals out, `rows` bands for the bulge)
function ringWall(w, d, y0, y1, rows = 6, cols = 10) {
  const pos = [], nrm = [], uv = [], idx = [];
  const sides = [[[-w / 2, d / 2], [w / 2, d / 2], [0, 1]], [[w / 2, d / 2], [w / 2, -d / 2], [1, 0]], [[w / 2, -d / 2], [-w / 2, -d / 2], [0, -1]], [[-w / 2, -d / 2], [-w / 2, d / 2], [-1, 0]]];
  for (const [a, b, n] of sides) {
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const t = i / cols, y = y0 + ((y1 - y0) * j) / rows;
      pos.push(a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t); nrm.push(n[0], 0, n[1]); uv.push(t, j / rows);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const A = base + j * (cols + 1) + i, B = A + 1, Cc = A + cols + 1, Dd = Cc + 1; idx.push(A, B, Cc, B, Dd, Cc); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
let _stampShared = null;
function stampShared() {
  if (_stampShared) return _stampShared;
  const { W, D, RELIEF, DIE, CUSH, BW, BH, BD } = STAMP;
  const art = dieArt();
  // the relief: a fine grid on the face, raised strokes at y 0, the cut ground at y RELIEF (sloped walls between)
  const NX = 240, NZ = 160;
  const face = new THREE.PlaneGeometry(W, D, NX, NZ).rotateX(Math.PI / 2);
  { const p = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), u = 0.5 - x / W, v = 0.5 + z / D;
      const h = sstep01(0.3, 0.7, dieSample(u, 1 - v, 1));
      p.setY(i, (1 - h) * RELIEF); uv.setXY(i, u, v);
    }
    face.computeVertexNormals(); }
  const wall = ringWall(W, D, RELIEF, DIE, 6, 12);
  const cushion = new THREE.BoxGeometry(W + 0.004, CUSH, D + 0.004, 4, 4, 4).translate(0, DIE + CUSH / 2, 0);
  // the mount and the turned handle (one wood), the brass ferrule
  const block = softBox(BW, BH, BD, 0.0045, 3).translate(0, DIE + CUSH + BH / 2, 0);
  const B = STAMP_BT;
  const handle = lathe([[0, B - 0.0004], [0.0272, B - 0.0004], [0.0276, B + 0.0012], [0.0276, B + 0.0034], [0.0255, B + 0.0054], [0.0215, B + 0.0066], [0.0196, B + 0.0068], [0.0196, B + 0.022],
    [0.0172, B + 0.022], [0.0178, B + 0.03], [0.0187, B + 0.05], [0.0191, B + 0.07], [0.0187, B + 0.09], [0.0178, B + 0.11], [0.0166, B + 0.1215], [0.0181, B + 0.1245], [0.0184, B + 0.1275], [0.0163, B + 0.1305],
    [0.0172, B + 0.1335], [0.0226, B + 0.1405], [0.0277, B + 0.1485], [0.0304, B + 0.1575], [0.0305, B + 0.1635], [0.0284, B + 0.1705], [0.0229, B + 0.176], [0.014, B + 0.1795], [0, B + 0.181]], 48);
  const ferrule = lathe([[0.0194, B + 0.0062], [0.0206, B + 0.0064], [0.021, B + 0.0074], [0.0206, B + 0.0086], [0.0204, B + 0.0196], [0.0209, B + 0.0206], [0.0207, B + 0.0218], [0.0172, B + 0.0224]], 40);
  const wood = merge([block, handle]);
  // the index label printed for the side of the mount
  const lc = canvas(1024, Math.round(1024 * LABEL.H / LABEL.W)), lg = lc.getContext('2d'), LW = lc.width, LH = lc.height;
  lg.fillStyle = '#ece3cc'; lg.fillRect(0, 0, LW, LH);
  lg.strokeStyle = '#a81e28'; lg.lineWidth = 7; lg.strokeRect(16, 16, LW - 32, LH - 32);
  lg.lineWidth = 2; lg.strokeRect(30, 30, LW - 60, LH - 60);
  lg.fillStyle = '#a81e28'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
  lg.font = `900 ${Math.round(LH * 0.62)}px ${FONT_HEI}`; const za = lg.measureText('批准').width;
  lg.font = `700 ${Math.round(LH * 0.36)}px ${FONT_SERIF}`; const ea = lg.measureText('A P P R O V E D').width;
  const gap = LH * 0.35, lx = LW / 2 - (za + gap + ea) / 2;
  lg.font = `900 ${Math.round(LH * 0.62)}px ${FONT_HEI}`; lg.fillText('批准', lx + za / 2, LH * 0.53);
  lg.font = `700 ${Math.round(LH * 0.36)}px ${FONT_SERIF}`; lg.fillText('A P P R O V E D', lx + za + gap + ea / 2, LH * 0.55);
  const labelT = tex(lc);
  const woodMat = cel({
    color: '#ffffff', id: ID.WOOD, gloss: 0.9, rim: 0.9, uniforms: { uLabel: { value: labelT } },
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0002, 0.0011, mpp);
      float midd = 1.0 - smoothstep(0.0008, 0.004, mpp);
      vec3 p = vLocal;
      float isB = step(p.y, ${fl(B - 0.0006)});
      // growth rings of the log: along x in the mount, along y in the turned handle (off-centre: they show as stripes)
      vec2 rc = isB > 0.5 ? vec2(p.y - 0.17, p.z + 0.06) : vec2(p.x + 0.11, p.z - 0.05);
      float along = isB > 0.5 ? p.x : p.y;
      float r = length(rc);
      float wob = (fbm2(vec2(along * 7.0, r * 30.0)) - 0.5) * 0.01 + (vnoise(vec2(along * 45.0, r * 260.0)) - 0.5) * 0.0016;
      float ring = fract((r + wob) * 230.0);
      float late = smoothstep(0.45, 0.8, ring) * (1.0 - smoothstep(0.88, 1.0, ring));
      float pores = step(0.8, vnoise(vec2(along * 1100.0, r * 5200.0))) * fine;
      vec3 wood = mix(${lin('#6e4026')}, ${lin('#2a1409')}, late * mix(0.35, 0.8, midd));
      wood *= 1.0 - 0.3 * pores;
      wood *= 0.8 + 0.32 * fbm2(vec2(along * 3.0, r * 22.0) + 4.0);
      // old lacquer: dark and deep, worn through to pale wood on the mount's edges and where the palm grips the knob
      float ax = max(max(abs(vLocalN.x), abs(vLocalN.y)), abs(vLocalN.z));
      float edgeB = smoothstep(0.05, 0.22, 1.0 - ax) * isB;
      float knob = (1.0 - isB) * (smoothstep(${fl(B + 0.03)}, ${fl(B + 0.045)}, p.y) * (1.0 - smoothstep(${fl(B + 0.11)}, ${fl(B + 0.12)}, p.y)) + smoothstep(${fl(B + 0.168)}, ${fl(B + 0.18)}, p.y));
      float wn = vnoise(p.xz * 150.0 + p.y * 110.0) * 0.6 + vnoise(p.xz * 600.0 + p.y * 500.0) * 0.4;
      float wear = clamp((edgeB * 1.15 + knob * 0.8) * smoothstep(0.25, 0.65, wn + 0.15), 0.0, 1.0);
      col = mix(wood * 0.78, wood * 1.6 + ${lin('#24160c')} * 0.25, wear);
      gloss = mix(0.95, 0.2, wear);
      // hairline scratches in the lacquer, dents
      float scr = (1.0 - smoothstep(0.0, 0.035, abs(vnoise(vec2(dot(p, vec3(1.0, 0.3, 0.6)) * 70.0, dot(p, vec3(-0.2, 0.5, 1.0)) * 4.0)) - 0.5))) * step(0.62, vnoise(p.xz * 30.0 + p.y * 9.0 + 7.0));
      col = mix(col, col * 1.7 + 0.01, scr * fine * 0.55);
      col *= 1.0 - 0.18 * smoothstep(0.7, 0.9, vnoise(p.xz * 210.0 + p.y * 170.0 + 3.0)) * midd;
      // turning marks round the handle
      col *= 1.0 - (1.0 - isB) * 0.07 * step(0.5, fract(p.y * 1400.0 + vnoise(p.xz * 300.0))) * fine;
      if(isB > 0.5){
        // a groove round the mount's sides near the top
        float grv = (1.0 - smoothstep(0.0004, 0.0009 + mpp, abs(p.y - ${fl(B - 0.0072)}))) * step(abs(vLocalN.y), 0.5);
        col *= 1.0 - 0.65 * grv;
        // ink smeared on the mount's lower edge and underside
        float smear = (1.0 - smoothstep(${fl(STAMP.DIE + STAMP.CUSH)}, ${fl(STAMP.DIE + STAMP.CUSH + 0.007)}, p.y)) * smoothstep(0.35, 0.72, vnoise(p.xz * 90.0 + p.y * 40.0));
        col = mix(col, ${lin('#4a0c0e')}, smear * 0.75);
        // the index label, both long sides, reading from outside
        if(abs(vLocalN.z) > 0.9){
          vec2 lu = vec2(0.5 + sign(vLocalN.z) * p.x / ${fl(LABEL.W)}, (p.y - ${fl(LABEL.Y)}) / ${fl(LABEL.H)} + 0.5);
          if(lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0){
            vec3 lb = tx(uLabel, lu);
            lb *= 0.9 + 0.12 * vnoise(lu * vec2(420.0, 95.0));
            lb = mix(lb, lb * ${lin('#c4a070')}, 0.4 * smoothstep(0.35, 0.8, fbm2(lu * vec2(5.0, 1.3) + 2.0)));
            lb *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.05, min(min(lu.x, 1.0 - lu.x) * 4.4, min(lu.y, 1.0 - lu.y))));
            col = lb; gloss = 0.12; idOut = 36.0;
          }
        }
      }
      specTh = 0.93;
    `,
  });
  const brassF = brassMat({ color: '#b8914e', seed: 6.2, edgeWear: 0.7, more: `col = mix(col, ${lin('#4c4a36')}, smoothstep(0.55, 0.8, fbm2(vec2(atan(vLocal.x, vLocal.z) * 2.0, vLocal.y * 300.0))) * 0.5); col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0003, 0.0007 + mpp, abs(vLocal.y - ${fl(B + 0.0142)}))); emis += col * 0.05;` });
  return (_stampShared = { art, face, wall, cushion, wood, ferrule, woodMat, brassF });
}
// per stamp: the rubber and cushion (they squash: uPress) and the ink (uWet)
function stampMats(U) {
  const art = dieArt();
  const { W, D, RELIEF } = STAMP;
  const face = cel({
    color: '#7a2418', id: 36, gloss: 0.4, rim: 0.6, uniforms: { uPress: U.uPress, uWet: U.uWet, uDie: { value: art.tex } },
    vertex: SQUASH_DIE,
    pattern: /* glsl */ `
      ${FADE}
      float fine = 1.0 - smoothstep(0.0002, 0.0012, mpp);
      vec2 uv = vec2(0.5 - vLocal.x / ${fl(W)}, 0.5 + vLocal.z / ${fl(D)});
      vec3 m = texture(uDie, uv).rgb;
      float raised = smoothstep(0.38, 0.62, m.r);
      vec2 tq = uv * vec2(${fl(DIE_PX[0])}, ${fl(DIE_PX[1])});
      vec3 rub = ${lin('#7c2a1c')} * (0.85 + 0.25 * vnoise(tq * 0.05));
      // dried ink caked in the ground round the strokes and along the die's edge; fresh ink on the stroke tops
      vec2 e2 = abs(uv - 0.5) * 2.0;
      float rimE = smoothstep(0.9, 1.0, max(e2.x, e2.y));
      float cake = clamp(smoothstep(0.08, 0.5, m.b) * (1.0 - raised) * (0.45 + 0.55 * vnoise(tq * 0.12)) + rimE * 0.8, 0.0, 1.0);
      vec3 crust = ${lin('#3e080a')} * (0.65 + 0.6 * vnoise(tq * 0.6)) ;
      col = mix(rub, crust, cake * 0.9);
      vec3 inkC = mix(${lin('#5a0a10')} * (0.8 + 0.4 * vnoise(tq * 0.3)), ${lin('#9c0c18')}, uWet);
      col = mix(col, inkC, raised * (0.8 + 0.2 * uWet));
      gloss = mix(0.12, 1.0, uWet * raised);
      specTh = 0.9;
      // face down: what light it gets comes up off the lit card and cloth below
      float below = lampReach(vec3(vWorld.x, 0.0, vWorld.z));
      emis += col * (0.42 + 0.4 * raised) * below * 0.7;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - abs(dot(N, V)), 3.0);
      emis += uWet * raised * (0.25 + fres) * ${lin('#f4d4bc')} * below * 0.45;
    `,
  });
  const wall = cel({
    color: '#7c2a1c', id: 36, gloss: 0.35, rim: 0.8, uniforms: { uPress: U.uPress, uWet: U.uWet },
    vertex: SQUASH_DIE,
    pattern: /* glsl */ `
      ${FADE}
      vec2 sq = vec2(vLocal.x * 900.0 + vLocal.z * 900.0, vLocal.y * 2000.0);
      col *= 0.85 + 0.25 * vnoise(sq * 0.3);
      // the knife's cut: faint horizontal tearing; ink crust thick at the bottom edge, runs and drips up the sides
      float drip = smoothstep(0.55, 0.85, vnoise(vec2((vLocal.x + vLocal.z) * 260.0, 1.0)));
      float crustH = ${fl(RELIEF)} + 0.0012 + 0.0022 * drip;
      float crust = 1.0 - smoothstep(crustH - 0.0005, crustH + 0.0003, vLocal.y / (1.0 - 0.3 * uPress));
      col = mix(col, ${lin('#3c080a')} * (0.7 + 0.6 * vnoise(sq)), crust * 0.9);
      col = mix(col, ${lin('#9c0c18')}, crust * uWet * 0.7);
      gloss = mix(0.3, 1.0, crust * uWet);
      float below = lampReach(vec3(vWorld.x, 0.0, vWorld.z));
      emis += col * 0.12 * below;
      specTh = 0.92;
    `,
  });
  const cushion = cel({
    color: '#2e2b29', id: ID.STEEL, gloss: 0.1, rim: 0.7, uniforms: { uPress: U.uPress },
    vertex: SQUASH_CUSH,
    pattern: /* glsl */ `
      ${FADE}
      col *= 0.8 + 0.35 * vnoise(vec2(vLocal.x * 1600.0 + vLocal.z * 1600.0, vLocal.y * 2400.0)) * (1.0 - smoothstep(0.0003, 0.0012, mpp));
      col = mix(col, ${lin('#3a0a0c')}, 0.5 * (1.0 - smoothstep(${fl(STAMP.DIE)}, ${fl(STAMP.DIE + 0.0015)}, vLocal.y)) * step(0.4, vnoise(vLocal.xz * 300.0)));
      emis += col * 0.1 * lampReach(vec3(vWorld.x, 0.0, vWorld.z));
    `,
  });
  return { face, wall, cushion };
}
function buildStamp(name) {
  const S = stampShared();
  const U = { uPress: { value: 0 }, uWet: { value: 0 } };
  const M = stampMats(U);
  const root = group(null, name);
  mesh(S.face, M.face, root);
  mesh(S.wall, M.wall, root);
  mesh(S.cushion, M.cushion, root);
  const upper = group(root, 'mount');
  mesh(S.wood, S.woodMat, upper);
  mesh(S.ferrule, S.brassF, upper);
  root.visible = false;
  return { root, upper, U };
}
// pure: the print's heading (rad, ink rot convention) for a hand frame
const _hx = V3(), _hy = V3();
export function stampYawFrom(hand) {
  _hx.setFromMatrixColumn(hand, 0); _hy.setFromMatrixColumn(hand, 1);
  const fx = _hy.x - _hx.z, fz = _hy.z + _hx.x;
  return Math.abs(fx) + Math.abs(fz) < 1e-6 ? 0 : Math.atan2(fx, fz);
}
// pure: how far below the grip point the face hangs (see STAMP): GRIP below the palm, or FIST..KNOB below the hole
const _gy = V3();
export function stampDrop(hand, grip = null) {
  if (!grip) return STAMP.GRIP;
  _gy.setFromMatrixColumn(grip, 1).normalize();
  return lerp(STAMP.KNOB, STAMP.FIST, sstep01(0.55, 0.85, Math.abs(_gy.y)));
}
// pure: the stamp frame (origin = face centre) for a hand frame, a stamp state ({ yaw?, at? } may override) and
// optionally the fist's grip frame (its origin is then the grip point instead of the palm centre)
const _sq = new THREE.Quaternion(), _sY = V3(0, 1, 0), _sp = V3();
export function stampMatrix(hand, out = new THREE.Matrix4(), s = {}, grip = null) {
  if (s.at) _sp.set(s.at[0], s.at[1], s.at[2]);
  else _sp.setFromMatrixPosition(grip ?? hand).y -= stampDrop(hand, grip);
  const yaw = s.yaw ?? (hand ? stampYawFrom(hand) : 0);
  _sq.setFromAxisAngle(_sY, yaw);
  return out.compose(_sp, _sq, _one);
}
// pure: the face centre for a hand frame (and optionally the fist's grip frame)
export function stampFaceFrom(hand, out = V3(), grip = null) { out.setFromMatrixPosition(grip ?? hand); out.y -= stampDrop(hand, grip); return out; }
let _lastProps = null;
// the world centre of a held stamp's rubber face (after the last props.update)
export function stampFace(id, side, out = V3()) { return _lastProps ? _lastProps.stampFace(id, side, out) : out.set(0, 0, 0); }

// ------------------------------------------------------------------ v3: ink marks on the cloth
// st.props.ink = [{ pos: [x, y, z], rot, size, k, seed }] (up to INK_MAX): red 批准 APPROVED marks lying flat at
// y + 0.0004 (+ 1.5 um per list index: later marks lie over earlier ones). rot: the print's up = (sin rot, 0, cos rot) (a held stamp prints with rot = stampRot(id, side));
// size: scale of the mark (1 = what STAMP prints, 0.12 x 0.08 m); k: 0 none, 0..0.15 the ink presses in (spreads from
// the hard spots, ragged), 0.15..1 drying (wet and dark and glossy at 0.15, dry and matte at 1); seed: any number.
// Material id 136 (cards, uninked: keeps its red in noir, no ink outline round the strokes). The marks report a view
// depth 6.5% nearer than they are, so the ink pass draws no outline where they meet the cloth.
export const INK_MAX = 256;
const INK_OUT = /* glsl */ `
varying vec2 vInk;
void writeOutDecal(vec3 col, vec3 nView, float viewDepth, float id){
  oColor = vec4(col, 0.0);
  oData = vec4(nView.xy * 0.5 + 0.5, viewDepth * 0.935, id);
}
#define writeOut(a, b, c, d) writeOutDecal(a, b, c, d)
`;
function buildInk() {
  const art = dieArt();
  const { W, D } = STAMP;
  const geo = new THREE.PlaneGeometry(W * 1.08, D * 1.1).rotateX(-Math.PI / 2);
  const aInk = new THREE.InstancedBufferAttribute(new Float32Array(INK_MAX * 2), 2);
  aInk.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInk', aInk);
  const mat = cel({
    color: '#b8262c', id: 136, gloss: 0.2, rim: 0.0, uniforms: { uDie: { value: art.tex } },
    vsHead: 'attribute vec2 aInk; varying vec2 vInk;', vertex: 'vInk = aInk;', fsHead: INK_OUT,
    pattern: /* glsl */ `
      ${FADE}
      float k = vInk.x, sd = vInk.y;
      vec2 uv = vec2(0.5 - vLocal.x / ${fl(W)}, 0.5 + vLocal.z / ${fl(D)});
      vec3 m = texture(uDie, uv).rgb;
      if(max(m.g, m.b) < 0.004) discard;
      float pressIn = smoothstep(0.0, 0.15, k);
      float wet = 1.0 - smoothstep(0.15, 1.0, k);
      float far = smoothstep(0.00025, 0.0011, mpp);
      vec2 q = vec2(uv.x * 1.5, uv.y);
      // how hard the rubber met the paper: a tilt (one side heavier) and blotches; every mark its own
      float ang = sd * 6.2832;
      float tilt = dot(q - vec2(0.75, 0.5), vec2(cos(ang), sin(ang)));
      float pr = 0.74 + 0.8 * (fbm2(q * 4.0 + sd * 37.0) - 0.5) + 0.25 * (vnoise(q * 22.0 + sd * 11.0) - 0.5) - (0.3 + 0.55 * fract(sd * 7.31)) * tilt;
      pr -= (1.0 - pressIn) * 0.9;                                  // the ink presses in from the hard spots first
      vec2 tq = uv * vec2(${fl(DIE_PX[0])}, ${fl(DIE_PX[1])});
      float tooth = vnoise(tq * 0.45 + sd * 91.0) * 0.55 + vnoise(tq * 1.3 + sd * 13.0) * 0.3 + vnoise(tq * 0.12 + sd * 4.0) * 0.15;
      // the stroke: the softened art thresholded with noise: ragged, a little fatter while wet (it squeezes out)
      float rag = ((vnoise(tq * 0.3 + sd * 5.0) - 0.5) * 0.22 + (vnoise(tq * 1.1 + sd * 3.0) - 0.5) * 0.1) * (1.0 - far);
      float th = 0.5 + rag - 0.07 * wet * pressIn;
      float shape = smoothstep(th - 0.05, th + 0.05, mix(m.g, 0.5 * (m.r + m.g), far));
      // coverage: the paper's tooth shows through where the rubber met it lightly (speckle, then a broken, starved print)
      float cover = clamp((pr - 0.12 - tooth * 0.72) * 5.0, 0.0, 1.0);
      cover = mix(cover, clamp((pr - 0.25) * 2.0, 0.0, 1.0), far);
      float a = shape * cover;
      if(a < mix(0.5, 0.32, far)) discard;
      // wet: deep crimson and glossy; dry: lighter, matte; more ink where it was pressed hard; pooled at the strokes' edges
      float rim = 1.0 - smoothstep(0.5, 0.9, m.g);
      vec3 c = mix(${lin('#bc2a30')}, ${lin('#8a0a16')}, wet);
      c = mix(c * 1.18 + ${lin('#2a0606')}, c * 0.86, smoothstep(0.35, 1.1, pr));
      c *= 1.0 - 0.42 * rim * (1.0 - far);
      c *= 0.88 + 0.2 * vnoise(tq * 0.08 + sd * 3.0);
      col = c;
      gloss = mix(0.08, 1.0, wet);
      specTh = mix(0.985, 0.9, wet);
      vec3 V = normalize(cameraPosition - vWorld);
      emis += wet * shape * pow(1.0 - max(dot(N, V), 0.0), 4.0) * ${lin('#ffe6cc')} * 0.4 * lampReach(vWorld);
    `,
  });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
  const inst = new THREE.InstancedMesh(geo, mat, INK_MAX);
  inst.count = 0; inst.frustumCulled = false; inst.userData.noShadow = true; inst.name = 'ink-marks';
  return { inst, aInk };
}

// ------------------------------------------------------------------ v3: brass nameplates
// A bent brass tent plate (an A-frame) on the cloth at the table edge in front of each king, both faces engraved with
// the company's name in black-filled letters, the front face toward the table's long axis (st.props.plates.turn, rad,
// turns every plate toward the foot; up to ~0.2 keeps clear of the press). It stands at the king's right front, between
// his press (seat z - 0.12, which hides the middle of his front from the sea) and his right rest hand (seat z + 0.27),
// 13 cm outside his proposal card's far edge, under the stamping arm's forearm (plate top 0.09 m). Plate frame: origin = the middle of its footprint on the tabletop, +y up, local +z = the
// front face's heading, the name reads along local +x seen from the front.
export const PLATE = { L: 0.25, S: 0.115, A: 1.15, T: 0.0028, X: 1.1, DZ: 0.08 };
const PLATE_NAMES = { spade: ['♠ SPADES'], heart: ['♥ HEARTS'], diamond: ['♦ DIAMONDS'], club: ['♣ CLUBS'], openai: ['OpenAI'], anthropic: ['Claude'], mistral: ['Mistral'], google: ['Google'], xai: ['xAI'], meta: ['Meta'], deepseek: ['Hundun', '混沌'], qwen: ['WanWen', '万问'], kimi: ['Mooncake', '月饼'], glm: ['FatFish', '大肥鱼'], doubao: ['Dousha', '豆沙包'] };
export function platePos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * PLATE.X, 0, SEAT.Z[k.seat] + PLATE.DZ]; }
export function plateYaw(id, turn = 0) { const s = SIDE_SIGN[KING[id].side]; return -s * Math.PI / 2 + s * turn; }
// the world point at the middle of a plate's front face (for framing)
export function plateFace(id, turn = 0, out = V3()) { const p = platePos(id), y = plateYaw(id, turn), d = PLATE.S * Math.cos(PLATE.A) * 0.5; return out.set(p[0] + Math.sin(y) * d, PLATE.S * Math.sin(PLATE.A) * 0.5, p[2] + Math.cos(y) * d); }
let _plateShared = null;
function plateShared() {
  if (_plateShared) return _plateShared;
  const { S, A, T, L } = PLATE;
  const ca = Math.cos(A), sa = Math.sin(A), a = S * ca, h = S * sa;
  const ro = 0.0045, ri = ro - T, yc = h - ro / ca;
  const arc = (r, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const th = Math.PI / 2 + A - (i / n) * 2 * A; return [r * Math.cos(th), yc + r * Math.sin(th)]; });
  const legT = T / sa;
  const pts = [[-a, 0], ...arc(ro), [a, 0], [a - legT, 0], ...arc(ri).reverse(), [-a + legT, 0]];
  const geo = extrude(pts, L, 0.0006, 1).rotateY(Math.PI / 2);
  return (_plateShared = { geo, h });
}
function plateArt(lines) {
  const Wc = 2048, Hc = Math.round(2048 * PLATE.S / PLATE.L);
  const c = canvas(Wc, Hc), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, Wc, Hc);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = 9; g.strokeRect(40, 40, Wc - 80, Hc - 80);
  g.lineWidth = 3; g.strokeRect(62, 62, Wc - 124, Hc - 124);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const maxW = Wc - 200, CX = 0.8;          // the Latin name is cut a little condensed: taller letters in a short plate
  const latin = (str, size, y) => {
    g.font = `700 ${size}px ${FONT_SERIF}`; const w = g.measureText(str).width * CX; const s = Math.min(1, maxW / w);
    g.font = `700 ${Math.floor(size * s)}px ${FONT_SERIF}`;
    g.save(); g.translate(Wc / 2, y); g.scale(CX, 1); g.fillText(str, 0, 0); g.restore();
  };
  if (lines.length === 1) latin(lines[0], Math.round(Hc * 0.64), Hc * 0.71);
  else {
    latin(lines[0], Math.round(Hc * 0.45), Hc * 0.52);
    g.font = `700 ${Math.round(Hc * 0.3)}px ${FONT_HEI}`; spaced(g, lines[1], Wc / 2, Hc * 0.86, Hc * 0.035);
  }
  // R: the cut (black-filled), G: the cut spread (the bright bevel round it)
  const b = canvas(Wc, Hc), bg = b.getContext('2d'); bg.filter = 'blur(5px)'; bg.drawImage(c, 0, 0);
  const R = g.getImageData(0, 0, Wc, Hc), Gd = bg.getImageData(0, 0, Wc, Hc).data;
  for (let i = 0; i < Wc * Hc; i++) R.data[i * 4 + 1] = Gd[i * 4];
  g.putImageData(R, 0, 0);
  return tex(c);
}
function buildPlate(id) {
  const P = plateShared();
  const root = group(null, 'plate-' + id);
  root.position.set(...platePos(id));
  root.rotation.y = plateYaw(id);
  const t = plateArt(PLATE_NAMES[id] ?? [KING[id].name]);
  mesh(P.geo, cel({
    color: '#c9a462', id: ID.BRASS, gloss: 0.85, rim: 1.0, uniforms: { uName: { value: t } },
    pattern: /* glsl */ `
      ${FADE}
      ${ENV}
      float fine = 1.0 - smoothstep(0.0003, 0.0015, mpp);
      vec3 base = col;
      // polished brass, brushed along the plate, tarnished low down and in blotches, fingerprints
      col *= 0.9 + 0.16 * vnoise(vec2(vLocal.x * 30.0, vLocal.y * 2400.0)) * fine;
      col = mix(col, ${lin('#6e5a34')}, 0.45 * smoothstep(0.5, 0.78, fbm2(vLocal.xy * 40.0 + vLocal.z * 30.0)));
      col *= 0.82 + 0.18 * smoothstep(0.0, ${fl(P.h * 0.5)}, vLocal.y);
      col *= mix(1.0, env, 0.45);
      gloss = 0.85;
      // the engraving on both faces (front reads along +x, back along -x), filled black, a bright cut edge round it
      float fz = vLocalN.z;
      if(abs(fz) > 0.3 && vLocalN.y > 0.15){
        vec2 pu = vec2(0.5 + sign(fz) * vLocal.x / ${fl(PLATE.L)}, vLocal.y / ${fl(P.h)});
        if(pu.x > 0.0 && pu.x < 1.0 && pu.y > 0.0 && pu.y < 1.0){
          vec2 m = texture(uName, pu).rg;
          float cut = smoothstep(0.35, 0.65, m.r);
          float bev = smoothstep(0.08, 0.35, m.g) * (1.0 - cut) * fine;
          col = mix(col, base * 1.45 + 0.04, bev * 0.6);
          col = mix(col, ${lin('#120d09')} * (0.8 + 0.3 * vnoise(pu * vec2(900.0, 320.0))), cut);
          gloss = mix(gloss, 0.1, cut);
        }
      }
      specTh = 0.965;
      emis += col * 0.05;
    `,
  }), root);
  root.visible = false;
  return { root };
}

// ------------------------------------------------------------------ assembly
// root
//   tableRoot  everything standing on the tabletop (consoles, presses and what they are fed, clocks, ashtrays, chips):
//              reparent it under set.tableTop and it follows the wobble (its frame equals the world at rest)
//   roomRoot   the seals and their chains
//   heldRoot   stamps, cigars, glasses and keys, placed in world space every frame (in a hand, an ashtray, on the table)
// Every part draws NOTHING when its state is missing (st.props = {} draws nothing at all): consoles need
// st.buttons[id], presses st.presses[id] (the funnel only with a hopper), ashtrays st.cigars[id], stamps
// st.stamps[id][side], ink st.ink, nameplates st.plates.show > 0; clocks, keys, seals, chips, glasses likewise.
const _H = new THREE.Matrix4(), _R = new THREE.Matrix4(), _M = new THREE.Matrix4(), _A = new THREE.Matrix4(), _B = new THREE.Matrix4();
const _p = V3(), _q = new THREE.Quaternion(), _s = V3(), _e = new THREE.Euler(), _one = V3(1, 1, 1), _v = V3(), _w = V3();
const _p2 = V3(), _q2 = new THREE.Quaternion(), _s2 = V3();
function handMatrix(api, id, side, out) {
  const m = api?.handFrame?.(id, side);
  if (!m) return false;
  m.decompose(_p, _q, _s);
  out.compose(_p, _q, _one);
  return true;
}
const asMatrix = (at, out) => (at?.isMatrix4 ? out.copy(at) : out.makeTranslation(at[0], at[1], at[2]));
const FEED_KINDS = ['gold', 'castle', 'city', 'plant'];
export function makeProps(ctx = {}) {
  void ctx;
  const root = group(null, 'props');
  const tableRoot = group(root, 'props-table');
  const roomRoot = group(root, 'props-room');
  const heldRoot = group(root, 'props-held');
  const consoles = {}, presses = {}, trays = {}, cigars = {}, glasses = {}, feeds = {}, clocks = {}, keys = {}, layouts = {}, stamps = {}, plates = {};
  KINGS.forEach((k, i) => {
    const id = k.id;
    consoles[id] = buildConsole(id); tableRoot.add(consoles[id].root);
    presses[id] = buildPress(id); tableRoot.add(presses[id].root);
    trays[id] = buildTray(id); tableRoot.add(trays[id]);
    cigars[id] = buildCigar(id); heldRoot.add(cigars[id].root); heldRoot.add(cigars[id].fall);
    glasses[id] = buildGlass(id); heldRoot.add(glasses[id].root);
    feeds[id] = buildFeed(id); presses[id].root.add(feeds[id].root); feeds[id].root.position.set(...MOUTH);
    clocks[id] = buildClock(id); tableRoot.add(clocks[id].root);
    keys[id] = buildKey(id); heldRoot.add(keys[id].root);
    layouts[id] = chipLayouts(1000 + i * 17);
    stamps[id] = { L: buildStamp(`stamp-${id}-L`), R: buildStamp(`stamp-${id}-R`) }; heldRoot.add(stamps[id].L.root, stamps[id].R.root);
    plates[id] = buildPlate(id); tableRoot.add(plates[id].root);
    consoles[id].root.visible = false; trays[id].visible = false;
  });
  const ink = buildInk(); tableRoot.add(ink.inst);
  const seals = { US: buildSeal('US'), CN: buildSeal('CN') };
  roomRoot.add(seals.US.root, seals.CN.root);
  // the giants' chain: dark iron that still draws a line against the black (worn bright crowns, a strong rim)
  const chainMat = ironMat({
    color: '#77716a', seed: 4.0, scratch: 0.3, mottleK: 0.6, metal: 0.55, edgeWear: 0.6,
    more: `{ vec3 rV = normalize(cameraPosition - vWorld); float fr = 1.0 - abs(dot(N, rV)); emis += col * (0.22 + 1.3 * smoothstep(0.35, 0.9, fr)); } litBias += 0.15; specTh = 0.9;`,
  });
  const chain = new THREE.InstancedMesh(sealShared().link, chainMat, 2 * 170);
  chain.frustumCulled = false; chain.count = 0; chain.name = 'seal-chains';
  roomRoot.add(chain);
  // chips: one instanced mesh per kind for every stack, mountain and hopper heap on the table
  const chipMesh = { US: new THREE.InstancedMesh(chipGeometry(16), chipMaterial('US'), 3200), CN: new THREE.InstancedMesh(chipGeometry(16), chipMaterial('CN'), 3200) };
  for (const m of Object.values(chipMesh)) { m.frustumCulled = false; m.count = 0; tableRoot.add(m); }

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
  // ---- the keys: in a fist (HOLD.key), or lying on the table (keyRest / at)
  function placeKey(id, ks, api) {
    const K = keys[id];
    K.root.visible = !!ks && (ks.show ?? 1) > 0;
    if (!K.root.visible) return;
    const side = ks.hand === 'L' || ks.hand === 'R' ? ks.hand : null;
    const m = side ? api?.handFrame?.(id, side) : null;
    if (m) keyMatrix(m, side, ks.turn ?? 0, _M, ks.aim ?? null, ks.aimK ?? 1);
    else if (ks.at) asMatrix(ks.at, _M);
    else {
      // flat on the table, bow toward the king, the shaft toward the sea, the bit along the table
      const s = SIDE_SIGN[KING[id].side];
      tableRoot.updateWorldMatrix(true, false);
      _M.makeBasis(V3(0, 0, -s), V3(-s, 0, 0), V3(0, 1, 0)).setPosition(V3(...keyRest(id)).setY((KEY.T / 2 + 0.0022) * KEY.S));
      _M.premultiply(tableRoot.matrixWorld);
    }
    setWorld(K.root, _M);
  }
  // ---- the seals: hanging from a chain (the director's path, fist first, the seal's ring last) or dropped from the dark
  const _up = V3(0, 1, 0), _dir = V3(), _qs = new THREE.Quaternion();
  function updateSeals(st = {}) {
    let n = 0;
    for (const side of ['US', 'CN']) {
      const s = st[side], sl = seals[side];
      sl.root.visible = !!s && (s.show ?? 1) > 0;
      if (!sl.root.visible) continue;
      const sc = s.scale ?? SEAL.SCALE[side];
      sl.root.scale.setScalar(sc);
      const hang = sl.hang * sc;
      if (s.chain && s.chain.length >= 2) {
        const pts = s.chain.map((p) => (p.isVector3 ? p.clone() : V3(...p)));
        let end = pts[pts.length - 1];
        // the seal hangs on the chain's last stretch: its axis points back up the chain (tilt 0 = always upright)
        const prev = pts.length > 2 ? pts[pts.length - 3] : pts[0];
        if (s.pos) {
          // pos = the seal's face centre: the seal sits there, the chain ends at its ring
          const P = V3(...s.pos);
          _dir.copy(prev).sub(P); if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0); _dir.normalize();
          _dir.lerp(_up, 1 - clamp(s.tilt ?? 1)).normalize();
          end = P.clone().addScaledVector(_dir, hang);
          pts[pts.length - 1] = end;
          while (pts.length > 2 && pts[pts.length - 2].distanceTo(pts[0]) > end.distanceTo(pts[0]) - 0.05) pts.splice(pts.length - 2, 1);
        } else {
          _dir.copy(prev).sub(end); if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0); _dir.normalize();
          _dir.lerp(_up, 1 - clamp(s.tilt ?? 1)).normalize();
        }
        const curve = new THREE.CatmullRomCurve3(pts.slice().reverse(), false, 'centripetal');
        const dense = curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / 0.03)));
        _qs.setFromUnitVectors(_up, _dir);
        sl.root.quaternion.copy(_qs);
        sl.root.position.copy(end).addScaledVector(_dir, -hang);
        n += layChain(chain, n, dense, 170);
      } else {
        const home = s.at ?? SEAL.HOME[side];
        const y = lerp(SEAL.HIDE_Y, home[1] ?? 0, clamp(s.drop ?? 0));
        sl.root.quaternion.identity();
        sl.root.position.set(home[0], y, home[2]);
        n += layChain(chain, n, [V3(home[0], y + hang, home[2]), V3(home[0], SEAL.TOP_Y, home[2])], 170);
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
  const _g = V3();
  function updateFeed(id, hp, t) {
    const F = feeds[id];
    const kind = hp && (hp.show ?? 1) > 0 && FEED_KINDS.includes(hp.kind) ? hp.kind : null;
    const u = clamp(hp?.u ?? 0);
    for (const k of FEED_KINDS) F.items[k].visible = k === kind && u < 0.995;
    F.U.uClip.value = -99;
    if (!kind) return;
    const item = F.items[kind], dim = FEED[kind];
    const peel = clamp(hp.peel ?? 0);
    if (kind === 'plant') F.smoke(t);
    if (kind === 'city') { const y = cityYaw(id); F.U.uPeel.value = peel; F.U.uHome.value.set(CITY[0], CITY[2], Math.cos(y), Math.sin(y)); }
    // B: sitting on the hopper's mouth (press frame: +z toward the king)
    presses[id].root.updateWorldMatrix(true, false);
    _B.copy(presses[id].root.matrixWorld).multiply(_R.makeTranslation(...MOUTH));
    // A: where it is before it goes in
    let hasA = false;
    if (hp.at) {
      if (hp.at.isMatrix4) _A.copy(hp.at);
      else {
        // a point: keep the heading the item will have on the mouth (the city: its heading on the cloth)
        if (kind === 'city') _A.makeRotationY(cityYaw(id)); else _A.extractRotation(_B);
        _A.setPosition(hp.at[0], hp.at[1], hp.at[2]);
      }
      hasA = true;
      if (kind === 'city' && hp.grab) { cityBend(0, 0, CITY_HALF * 0.93, peel, _g); _A.multiply(_R.makeTranslation(-_g.x, -_g.y, -_g.z)); }
    } else if (kind === 'city' && hp.peel != null) {
      tableRoot.updateWorldMatrix(true, false);
      _A.makeRotationY(cityYaw(id)).setPosition(...CITY).premultiply(tableRoot.matrixWorld); hasA = true;
    }
    const into = hasA ? clamp(hp.into ?? 0) : 1;
    if (into >= 1) _M.copy(_B);
    else if (into <= 0) _M.copy(_A);
    else {
      _A.decompose(_p, _q, _s); _B.decompose(_p2, _q2, _s2);
      const f = smooth(into);
      _p.lerp(_p2, f); _p.y += Math.sin(Math.PI * f) * 0.14; _q.slerp(_q2, f);
      _M.compose(_p, _q, _one);
    }
    // sinking into the funnel, squeezed by its walls; nothing shows below the mouth
    const su = smooth(u);
    if (su > 0) {
      const sq = lerp(1, Math.min(1, 0.06 / dim.R), smooth(u * 1.6));
      _M.multiply(_R.makeTranslation(0, -su * (dim.H * 0.85 + 0.03), 0)).multiply(_A.makeScale(sq, 1 - 0.3 * su, sq));
      F.U.uClip.value = _w.setFromMatrixPosition(_B).y - 0.003;
    }
    setWorld(item, _M);
  }
  // ---- v3: the stamps (in the kings' fists), the ink marks on the cloth, the nameplates
  function updateStamps(sst, api) {
    for (const k of KINGS) for (const side of ['L', 'R']) {
      const s = sst?.[k.id]?.[side], o = stamps[k.id][side];
      o.root.visible = false;
      if (!s || (s.show ?? 1) <= 0) continue;
      const hand = api?.handFrame?.(k.id, side) ?? null;
      if (!s.at && !hand) continue;
      const grip = !s.at && api?.gripFrame ? api.gripFrame(k.id, side, _G) : null;
      setWorld(o.root, stampMatrix(hand, _M, s, grip));
      o.root.visible = true;
      const press = clamp(s.press ?? 0);
      o.U.uPress.value = press; o.U.uWet.value = clamp(s.wet ?? 0);
      o.upper.position.y = -STAMP.SINK * press;
    }
  }
  const _iq = new THREE.Quaternion(), _iy = V3(0, 1, 0), _G = new THREE.Matrix4();
  function updateInk(list) {
    let n = 0;
    if (Array.isArray(list)) for (const m of list) {
      if (n >= INK_MAX) break;
      const k = m?.k ?? 1;
      if (!m?.pos || !(k > 0)) continue;
      const sz = m.size ?? 1;
      _iq.setFromAxisAngle(_iy, m.rot ?? 0);
      // a later mark lies a hair above an earlier one (overlaps layer in list order, never z-fight)
      _M.compose(_p.set(m.pos[0], (m.pos[1] ?? 0) + 0.0004 + n * 1.5e-6, m.pos[2]), _iq, _s.set(sz, 1, sz));
      ink.inst.setMatrixAt(n, _M);
      ink.aInk.setXY(n, clamp(k), seed01(m.seed ?? n));
      n++;
    }
    ink.inst.count = n;
    ink.inst.instanceMatrix.needsUpdate = true; ink.aInk.needsUpdate = true;
  }
  function updatePlates(ps) {
    const show = (ps?.show ?? 0) > 0;
    for (const k of KINGS) {
      const P = plates[k.id];
      P.root.visible = show;
      if (show) P.root.rotation.y = plateYaw(k.id, ps.turn ?? 0);
    }
  }
  const api0 = {};
  const self = {
    root, tableRoot, roomRoot, heldRoot,
    items: { consoles, presses, trays, cigars, glasses, seals, chain, feeds, chipMesh, clocks, keys, stamps, plates, ink },
    update(st = {}, t = 0, api = api0) {
      st = st ?? {};
      root.updateWorldMatrix(true, true);
      tableRoot.updateWorldMatrix(true, true);
      for (const k of KINGS) {
        const id = k.id;
        consoles[id].root.visible = !!st.buttons?.[id];
        if (st.buttons?.[id]) consoles[id].update(st.buttons[id]);
        trays[id].visible = !!st.cigars?.[id];
        presses[id].update(st.presses?.[id], t);
        updateFeed(id, st.presses?.[id]?.hopper, t);
        placeCigar(id, st.cigars?.[id], t, api);
        placeGlass(id, st.glasses?.[id], api);
        clocks[id].update(st.clocks?.[id], t);
        placeKey(id, st.keys?.[id], api);
      }
      updateChips(st.chips, st.presses);
      updateSeals(st.seals);
      updateStamps(st.stamps, api);
      updateInk(st.ink);
      updatePlates(st.plates);
    },
    // v3
    stampFace: (id, side, out = V3()) => { const r = stamps[id][side].root; r.updateWorldMatrix(true, false); return out.setFromMatrixPosition(r.matrixWorld); },
    stampFrame: (id, side, out = new THREE.Matrix4()) => { const r = stamps[id][side].root; r.updateWorldMatrix(true, false); return out.copy(r.matrixWorld); },
    stampRot: (id, side) => { const r = stamps[id][side].root; r.updateWorldMatrix(true, false); const e = r.matrixWorld.elements; return Math.atan2(e[8], e[10]); },
    platePos: (id, out = V3()) => out.set(...platePos(id)),
    pressRamp: (id, out = V3()) => presses[id].ramp(out),
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
    pressFrame: (id, out = new THREE.Matrix4()) => presses[id].frame(out),        // slot frame: +z out of the slot (toward the card spot), +y up
    hopperMouth: (id, out = V3()) => { presses[id].root.updateWorldMatrix(true, false); return out.set(...MOUTH).applyMatrix4(presses[id].root.matrixWorld); },
    cityPatch: (out = V3()) => out.set(...CITY),
    cityGrab: (peel = 0, out = V3(), id = 'meta') => cityGrab(peel, out, id),
    // the key (after update): world point of the bit, and its frame (origin the bit centre, +y the insert direction, +x the bit)
    keyTip: (id, out = V3()) => { const r = keys[id].root; r.updateWorldMatrix(true, false); return out.set(...KEY_TIP).applyMatrix4(r.matrixWorld); },
    keyFrame: (id, out = new THREE.Matrix4()) => { const r = keys[id].root; r.updateWorldMatrix(true, false); return out.copy(r.matrixWorld).multiply(_R.makeTranslation(...KEY_TIP)); },
    clockFace: (id, back = false, out = V3()) => clockFace(id, back, out),
    sealFace: (side, out = V3()) => { seals[side].body.updateWorldMatrix(true, false); return out.set(0, 0, 0).applyMatrix4(seals[side].body.matrixWorld); },
    sealHang: (side, out = V3()) => { seals[side].body.updateWorldMatrix(true, false); return out.set(0, seals[side].hang, 0).applyMatrix4(seals[side].body.matrixWorld); },
  };
  _lastProps = self;
  return self;
}
