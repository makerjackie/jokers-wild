// Geometry helpers (adapted from YOUR TURN's kings.js, same author, MIT).
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// a parametric surface fn(u, v, outVec3), u wraps around when wrap
export function surface(fn, nu, nv, wrap = true) {
  const cols = wrap ? nu : nu + 1;
  const pos = new Float32Array(cols * (nv + 1) * 3), uv = new Float32Array(cols * (nv + 1) * 2), idx = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    fn(i / nu, j / nv, p);
    const k = j * cols + i;
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i1 = wrap ? (i + 1) % nu : i + 1;
    const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
    idx.push(a, d, b, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function superEllipsoid(a, b, c, p = 2, q = 2, nu = 40, nv = 24) {
  return surface((u, v, o) => {
    const th = -u * TAU, ph = (v - 0.5) * Math.PI;      // theta = 0 at +z (front); the minus keeps the winding outward
    const cp = sgnPow(Math.cos(ph), 2 / q), sp = sgnPow(Math.sin(ph), 2 / q);
    o.set(a * cp * sgnPow(Math.sin(th), 2 / p), b * sp, c * cp * sgnPow(Math.cos(th), 2 / p));
  }, nu, nv);
}

// Hermite curve through [t, v] keys
export function curve(keys) {
  const n = keys.length;
  const m = keys.map((k, i) => { const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)]; return (b[1] - a[1]) / (b[0] - a[0] || 1); });
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (t > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], u = (t - keys[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * keys[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * keys[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
}

// lathe about +y: profile [[r, y], ...] walked bottom -> top on the outside. theta = 0 is +z (front).
// Repeat a point to make a crease.
export function lathe(prof, nu = 48, o = {}) {
  const th0 = o.th0 ?? 0, th1 = o.th1 ?? TAU, np = prof.length, cols = nu + 1;
  const sx = o.sx ?? 1, sz = o.sz ?? 1;
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
      pos[k * 3] = prof[j][0] * s * sx; pos[k * 3 + 1] = prof[j][1]; pos[k * 3 + 2] = prof[j][0] * c * sz;
      const nx = nr * s / sx, nz = nr * c / sz, nl = Math.hypot(nx, ny, nz) || 1;
      nrm[k * 3] = nx / nl; nrm[k * 3 + 1] = ny / nl; nrm[k * 3 + 2] = nz / nl;
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
  return g;
}

// Loft through horizontal cross-sections. sections: [{ y, w, d, z, p, x }] (half-width w along x, half-depth d along z,
// centre (x, z), superellipse exponent p: 2 = ellipse, 4+ = rounded box). n points per ring. Caps optional.
export function sectionLoft(sections, n = 48, o = {}) {
  const rings = sections.map((s) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const sa = Math.sin(a), ca = Math.cos(a);
      const e = 2 / (s.p ?? 2.6);
      const bulge = s.bulge ? s.bulge(a) : 1;
      pts.push([(s.x ?? 0) + s.w * sgnPow(sa, e) * bulge, s.y, (s.z ?? 0) + s.d * sgnPow(ca, e) * bulge]);
    }
    return pts;
  });
  const R = rings.length, pos = [], uv = [], idx = [];
  for (let j = 0; j < R; j++) for (let i = 0; i <= n; i++) { const p = rings[j][i % n]; pos.push(p[0], p[1], p[2]); uv.push(i / n, j / (R - 1)); }
  const cols = n + 1;
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  if (o.caps !== false) {
    for (const [j, flip] of [[0, true], [R - 1, false]]) {
      let cx = 0, cy = 0, cz = 0; for (const p of rings[j]) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const c0 = pos.length / 3; pos.push(cx / n, cy / n, cz / n); uv.push(0.5, j ? 1 : 0);
      for (let i = 0; i < n; i++) { const a = j * cols + i, b = a + 1; if (flip) idx.push(c0, a, b); else idx.push(c0, b, a); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a tube along points (Catmull-Rom), radius r (number or fn(u)), radial segments rs
export function tube(points, r, segs = 32, rs = 10, closed = false) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  const frames = path.computeFrenetFrames(segs, closed);
  const pos = [], nrm = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; path.getPointAt(u, P);
    const rad = typeof r === 'function' ? r(u) : r;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * TAU;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(P.x + N.x * rad, P.y + N.y * rad, P.z + N.z * rad); nrm.push(N.x, N.y, N.z); uv.push(u, j / rs);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rs; j++) {
    const a = i * (rs + 1) + j, b = a + 1, c = a + rs + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// rounded box (bevel radius r)
export function roundBox(w, h, d, r = 0.01, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c); if (v.lengthSq() > 0) v.setLength(r); v.add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  void seg;
  return g;
}
