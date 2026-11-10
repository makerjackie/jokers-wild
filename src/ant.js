// 《失控》 OUT OF CONTROL — the ant (module "ant", owner: ant department).
// A carpenter-ant worker (Camponotus) carrying a bread crumb across the sea-chart cloth, seen from 2-6 cm in extreme
// macro and as a 30-60 px speck in wider macro shots. Every frame is a pure function of (st.ant, t).
//
//   import { makeAnt, ANT } from './ant.js';
//   const ant = makeAnt(ctx);  scene.add(ant.root);  ...  ant.update(st.ant, t);
//   st.ant = { show, pos: [x,y,z], q: [x,y,z,w], walk, speed, alert, look: [x,y,z] | null, crumb, crumbTilt, size,
//              groundBend }   // groundBend (optional, 1/m): curvature of the ground along the body's forward axis,
//                             // + = convex (the table's rounded lip): the feet and the drawn shadow follow it
//   Body frame (q): +z forward (head), +y dorsal, +x the ant's LEFT; pos is the ground point under the thorax.
//   Extras: ant.headPos(out), ant.crumbPos(out) -> world points as of the last update (camera focus / FX).
//
// Built in millimetres inside a group scaled by 0.001 * size. Material ids 170..179 (kept in colour by the noir grade,
// never inked by the engine, so the ant draws its own ink: a contour from the view angle, sutures, segment margins):
//   170 head / mesosoma / petiole, 171 gaster, 172 legs and antennae, 173 eyes, 174 mandibles, 175 crumb, 177 hairs,
//   179 the drawn lamp shadow on the ground (the engine's shadow map is far too coarse for a 15 mm insect).
// Nothing casts into the lamp shadow map (userData.noShadow): the ant draws its own shadow (a union of capsules projected
// from the real lamp position onto the ground plane, drawn as the ground in shade).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { celMaterial, C } from './materials.js';
import { G } from './glsl.js';
import { surface, lathe, tube, superEllipsoid, curve, TAU, sgnPow } from './geom.js';
import { clamp, lerp, smooth, noise1, mulberry32 } from './util.js';

// LEN: mandibles to gaster tip (m) at size 1. STRIDE: ground covered per gait cycle at speed 1 (feet planted).
// HIP_H: height of the thorax's centre line above the ground at rest (the coxae hang from it).
export const ANT = { LEN: 0.015, STRIDE: 0.0072, HIP_H: 0.0024 };

const MM = 0.001;
const STRIDE_MM = ANT.STRIDE / MM, HIP_MM = ANT.HIP_H / MM;
const DUTY = 0.55;                       // stance share of a gait cycle
const LIFT = 0.95;                       // swing foot lift (mm)
const NCAP = 40;                         // shadow capsules
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- deterministic noise (JS side, geometry only)
function hash3(x, y, z, s) {
  let h = Math.imul(x ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(y + 0x3c6ef372, 0x2545f491) ^ Math.imul(z + s * 0x9e3779b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vn3(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c, s);
  const x0 = lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v);
  const x1 = lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v);
  return lerp(x0, x1, w);
}

// ---------------------------------------------------------------- geometry helpers
// A body part lofted along z through keyed cross-sections [s, yc, w, ht, hb, p] (s = 0 at z0, the back .. 1 at z1, the
// front; w half width, ht / hb half heights above / below the centre yc, p the superellipse exponent). Round caps close
// the ends over the first c0 / last c1 of the length (exponents m0 / m1). mod(P, s, a) may edit each point.
// Returns { geo, at(s, a, P), nrm(s, a, N) } (a = 0 on the dorsal midline, + toward +x).
function loft(o) {
  const { z0, z1, keys, nu = 24, nv = 24, c0 = 0.15, c1 = 0.15, m0 = 2, m1 = 2, mod } = o;
  const col = (k) => curve(keys.map((r) => [r[0], r[k]]));
  const fy = col(1), fw = col(2), ft = col(3), fb = col(4), fp = col(5);
  const cap = (x, m) => (x >= 1 ? 1 : x <= 0 ? 0 : Math.pow(1 - Math.pow(1 - x, m), 1 / m));
  const at = (s, a, P) => {
    const env = cap(s / c0, m0) * cap((1 - s) / c1, m1);
    const e = 2 / fp(s), sa = Math.sin(a), ca = Math.cos(a);
    P.set(fw(s) * env * sgnPow(sa, e), fy(s) + (ca >= 0 ? ft(s) : fb(s)) * env * sgnPow(ca, e), lerp(z0, z1, s));
    if (mod) mod(P, s, a);
    return P;
  };
  const sv = (v) => (1 - Math.cos(Math.PI * v)) / 2;          // rings crowd toward the caps
  const geo = surface((u, v, P) => at(sv(v), u * TAU, P), nu, nv);
  const n = geo.attributes.normal;
  for (const j of [0, nv]) {                                   // the caps' pole: one shared normal
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < nu; i++) { const k = j * nu + i; x += n.getX(k); y += n.getY(k); z += n.getZ(k); }
    const l = Math.hypot(x, y, z) || 1;
    for (let i = 0; i < nu; i++) n.setXYZ(j * nu + i, x / l, y / l, z / l);
  }
  const A = V3(), B = V3(), Cc = V3(), D = V3();
  const nrm = (s, a, N) => {
    at(Math.min(1, s + 0.004), a, A); at(Math.max(0, s - 0.004), a, B);
    at(s, a + 0.01, Cc); at(s, a - 0.01, D);
    return N.crossVectors(A.sub(B), Cc.sub(D)).normalize();
  };
  return { geo, at, nrm };
}

// lathe segment along +y (0..len) from a profile [[r, y], ...]
const seg = (prof, nu = 8, o = {}) => lathe(prof, nu, o);
// geom.js tube() winds its faces inward (T x B = -N): flip them so FrontSide shows the outside
function flip(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } return g; }
const otube = (...a) => flip(tube(...a));

// a tube whose uv.y runs 0..1 inside each sub-segment (so the joint tint repeats per tarsomere / funiculus segment)
function beadTube(points, lens, radii, segsPer = 5, rs = 6, pinch = 0.3) {
  const total = lens.reduce((a, b) => a + b, 0);
  const bounds = [0]; for (const l of lens) bounds.push(bounds[bounds.length - 1] + l / total);
  const which = (u) => { let i = 0; while (i < lens.length - 1 && u > bounds[i + 1]) i++; return i; };
  const r = (u) => {
    const i = which(u), f = (u - bounds[i]) / (bounds[i + 1] - bounds[i]);
    const base = radii[i];
    const swell = 0.72 + 0.28 * smooth(f / 0.8);
    const neck = 1 - pinch * smooth((f - 0.86) / 0.14);
    const tip = i === lens.length - 1 ? Math.max(0.15, 1 - smooth((f - 0.55) / 0.45) * 0.85) : 1;
    return Math.max(0.004, base * swell * neck * tip);
  };
  const g = otube(points, r, segsPer * lens.length, rs);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    const u = uv.getX(k), i = which(u);
    uv.setXY(k, (u - bounds[i]) / (bounds[i + 1] - bounds[i]), u);   // x: along the sub-segment, y: along the whole
  }
  // swap so uv.y is along the sub-segment (the chitin shader tints joints from uv.y)
  for (let k = 0; k < uv.count; k++) { const a = uv.getX(k), b = uv.getY(k); uv.setXY(k, b, a); }
  return g;
}

function xfg(g, m) { return g.applyMatrix4(m); }
const M4 = () => new THREE.Matrix4();

// thin hairs (setae): a 3-sided needle per hair; uv.x = the hair's own random (for the distance fade), uv.y 0 base .. 1 tip
function hairGeo(list) {
  const pos = [], nrm = [], uv = [];
  const a = V3(), b = V3(), tip = V3(), P = V3();
  for (const h of list) {
    a.set(0, 1, 0); if (Math.abs(h.d.y) > 0.9) a.set(1, 0, 0);
    a.crossVectors(h.d, a).normalize(); b.crossVectors(h.d, a).normalize();
    tip.copy(h.p).addScaledVector(h.d, h.len);
    const ring = [0, 1, 2].map((i) => { const th = (i / 3) * TAU; return V3().copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)); });
    for (let i = 0; i < 3; i++) {
      const r0 = ring[i], r1 = ring[(i + 1) % 3];
      for (const [rr, isTip] of [[r0, false], [r1, false], [null, true]]) {
        if (isTip) { pos.push(tip.x, tip.y, tip.z); nrm.push(h.d.x, h.d.y, h.d.z); uv.push(h.k, 1); }
        else { P.copy(h.p).addScaledVector(rr, h.r); pos.push(P.x, P.y, P.z); nrm.push(rr.x, rr.y, rr.z); uv.push(h.k, 0); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// sample hairs on a loft: rows near each band (or spread), tilted back along -z, a little random
function loftHairs(L, n, seed, o) {
  const rnd = mulberry32(seed), out = [], P = V3(), N = V3();
  for (let i = 0; i < n; i++) {
    const s = o.s0 + (o.s1 - o.s0) * (o.rows ? o.rows[i % o.rows.length] + (rnd() - 0.5) * 0.03 : rnd());
    const a = (rnd() * 2 - 1) * o.amax;
    L.at(s, a, P); L.nrm(s, a, N);
    const d = V3().copy(N).multiplyScalar(1).add(V3(0, 0, -(o.back ?? 0.8))).add(V3((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.3)).normalize();
    out.push({ p: P.clone().addScaledVector(N, -0.01), d, len: o.len[0] + rnd() * (o.len[1] - o.len[0]), r: o.r ?? 0.011, k: rnd() });
  }
  return out;
}

// ---------------------------------------------------------------- materials
const lin = (hex) => { const c = C(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

// chitin: deep warm brown-black, hard glossy lamp highlight with a soft sheen round it, amber where thin (joints,
// margins) glowing when back-lit, the lit cloth reflected in the lower flanks, an ink contour from the view angle
function chitinPattern(extra = '', micro = 0) {
  return /* glsl */ `
    vec3 Vv = normalize(cameraPosition - vWorld);
    vec3 Ll = normalize(uLampPos - vWorld);
    float aaW = max(length(fwidth(vWorld)), 1e-8);
    float inkL = 0.0, amb = 0.0, darkK = 0.0;
    float jt = uJointK * (smoothstep(0.17, 0.0, vUv.y) + smoothstep(0.83, 1.0, vUv.y));
    ${micro ? `{ float fk = (1.0 - smoothstep(0.00003, 0.00009, aaW)) * ${micro.toFixed(3)};
      vec3 q = vLocal * 21.0;
      vec3 gN = vec3(vnoise3(q), vnoise3(q + 19.1), vnoise3(q + 41.7)) - 0.5;
      N = normalize(N + gN * 0.09 * fk); }` : ''}
    ${extra}
    float fres = clamp(1.0 - abs(dot(N, Vv)), 0.0, 1.0);
    col = mix(col, uAmberCol, clamp(jt * 0.7 + amb, 0.0, 1.0));
    col *= 1.0 - darkK;
    float reachA = lampReach(vWorld);
    float shd = smoothstep(-0.02, 0.05, dot(N, Ll)) * lampShadow(vWorld, N);
    float dn = smoothstep(0.35, -0.8, N.y);
    float gR = lampReach(vec3(vWorld.x, 0.0, vWorld.z));
    emis += uGroundCol * gR * uRefl * (dn * (0.025 + 0.42 * fres * fres) + 0.035 * fres);
    float back = smoothstep(0.3, -0.75, dot(Vv, Ll)) * lampShadow(vWorld, Ll);
    emis += uAmberCol * (uThin + jt * 0.8 + amb) * back * reachA * 0.6;
    vec3 Hh = normalize(Ll + Vv);
    emis += uLampCol * smoothstep(0.87, 0.95, dot(N, Hh)) * shd * reachA * 0.11 * gloss;
    float ink = max(smoothstep(0.74, 0.91, fres) * uInk, inkL);
    col *= 1.0 - 0.94 * ink; emis *= 1.0 - 0.9 * ink; specK *= 1.0 - ink;
    specTh = uSpecTh;
  `;
}
function chitin(o) {
  return celMaterial({
    color: o.color, id: o.id, gloss: o.gloss ?? 0.9, rim: 0, side: o.side, fsHead: LINE,
    uniforms: {
      uAmberCol: { value: C(o.amber ?? '#9c5a22') }, uGroundCol: { value: C('#d6c29a') }, uThin: { value: o.thin ?? 0 },
      uJointK: { value: o.joint ?? 0 }, uSpecTh: { value: o.specTh ?? 0.982 }, uRefl: { value: o.refl ?? 1 }, uInk: { value: o.ink ?? 1 },
    },
    pattern: chitinPattern(o.extra ?? '', o.micro ?? 0),
  });
}
// an ink line of half width w (local units) on distance d, antialiased, fading out once it is far below a pixel
const LINE = /* glsl */ `
  float inkLine(float d, float w){ float fw = max(fwidth(d), 1e-6); return (1.0 - smoothstep(w, w + 1.5 * fw, abs(d))) * smoothstep(0.09, 0.03, fw); }
`;

// ---------------------------------------------------------------- the build
export function makeAnt(ctx = {}) {
  const root = new THREE.Group(); root.name = 'ant';
  const mm = new THREE.Group(); root.add(mm);
  const body = new THREE.Group(); mm.add(body);
  const screenH = ctx.engine?.IH ?? ctx.engine?.H ?? 720;
  const meshes = [];
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.userData.noShadow = true; parent.add(m); meshes.push(m); return m;
  };

  // ---- materials
  const headLines = /* glsl */ `
    { float xx = vLocal.x, yy = vLocal.y, zz = vLocal.z;
      float top = smoothstep(0.8, 1.15, yy);
      float clyp = inkLine(zz - (2.36 - 0.4 * xx * xx), 0.014) * step(abs(xx), 0.8) * top;            // clypeus hind margin
      float clypS = inkLine(abs(xx) - (0.8 - 0.14 * (zz - 2.1)), 0.012) * step(2.1, zz) * step(zz, 3.0) * top;
      float xf = 0.32 + 0.1 * (2.3 - zz);
      float car = inkLine(abs(xx) - xf, 0.013) * smoothstep(0.9, 1.2, zz) * step(zz, 2.3) * top;      // frontal carinae
      float med = inkLine(xx, 0.007) * smoothstep(1.0, 1.3, zz) * step(zz, 2.34) * top * 0.7;            // frontal line
      inkL = max(inkL, max(max(clyp, clypS), max(car, med)));
      // the occipital lobes a shade darker, the clypeus a little warmer
      amb += 0.12 * step(2.36 - 0.4 * xx * xx, zz) * step(abs(xx), 0.8) * top;
    }`;
  const mesoLines = /* glsl */ `
    { float yy = vLocal.y, zz = vLocal.z;
      float up = smoothstep(-0.5, 0.0, yy);
      inkL = max(inkL, inkLine(zz - (0.98 - 0.42 * yy), 0.016) * up);               // promesonotal suture
      inkL = max(inkL, inkLine(zz - (-0.62 - 0.3 * yy), 0.013) * up * 0.85);       // metanotal groove (faint in Camponotus)
      inkL = max(inkL, inkLine(yy - (-0.28 + 0.06 * zz), 0.012) * step(-1.6, zz) * step(zz, 2.2) * 0.7);   // pleural line
      float sp = length(vec2((zz + 1.25) / 0.09, (yy - 0.05) / 0.06)) - 1.0;       // propodeal spiracle
      inkL = max(inkL, (1.0 - smoothstep(0.0, 0.25, sp)) * step(0.3, abs(vLocal.x)) * smoothstep(0.09, 0.03, fwidth(zz)));
    }`;
  const gasterBands = /* glsl */ `
    { float yy = vLocal.y, zz = vLocal.z;
      float zbs[4] = float[4](-0.9, -2.0, -3.0, -3.85);
      for(int i = 0; i < 4; i++){
        float d = zz - (zbs[i] + 0.2 * (yy - 0.45) * (1.0 - 0.3 * float(i) / 3.0));
        inkL = max(inkL, inkLine(d, 0.012) * 0.75);
        amb = max(amb, smoothstep(0.0, 0.035, d) * (1.0 - smoothstep(0.08, 0.17, d)) * 0.5);   // the translucent hind margin
        darkK = max(darkK, smoothstep(-0.14, -0.02, d) * (1.0 - step(0.0, d)) * 0.3);          // the shadowed overlap
      }
      // the acidopore at the tip: a dark ring
      float tipR = length(vec2(vLocal.x, yy - 0.12)) ;
      inkL = max(inkL, inkLine(tipR - 0.13, 0.02) * smoothstep(-4.65, -4.8, zz));
    }`;
  const matHead = chitin({ color: '#2c1a10', id: 170, gloss: 1, specTh: 0.995, micro: 1, extra: headLines });
  const matMeso = chitin({ color: '#2d1b10', id: 170, gloss: 1, specTh: 0.991, micro: 0.8, extra: mesoLines });
  const matPet = chitin({ color: '#2d1b10', id: 170, gloss: 1, specTh: 0.988, thin: 0.15, micro: 0.6 });
  const matGaster = chitin({ color: '#27160d', id: 171, gloss: 1, specTh: 0.993, extra: gasterBands, micro: 0.25 });
  const matLeg = chitin({ color: '#2f1c10', id: 172, gloss: 0.85, specTh: 0.984, thin: 0.32, joint: 1, amber: '#a8642a' });
  const matAnt = chitin({ color: '#33200f', id: 172, gloss: 0.7, specTh: 0.978, thin: 0.45, joint: 1, amber: '#b06c2c' });
  const matMand = chitin({
    color: '#2a170c', id: 174, gloss: 0.55, specTh: 0.997, thin: 0.3, amber: '#a8652a',
    extra: /* glsl */ `amb += 0.4 * smoothstep(1.0, 1.35, length(vLocal.xz));`,
  });
  const matEye = celMaterial({
    color: '#120c08', id: 173, gloss: 1, rim: 0,
    uniforms: { uGroundCol: { value: C('#d6c29a') } },
    pattern: /* glsl */ `
      vec3 Vv = normalize(cameraPosition - vWorld);
      float fres = clamp(1.0 - abs(dot(N, Vv)), 0.0, 1.0);
      float aaW = max(length(fwidth(vWorld)), 1e-8);
      // ommatidia: a hex grid of tiny domes over the eye (seen only up close)
      vec2 q = vLocal.yz / 0.036;
      vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
      vec2 a = mod(q, r) - h, b = mod(q - h, r) - h;
      vec2 g = dot(a, a) < dot(b, b) ? a : b;
      float fk = 1.0 - smoothstep(0.000014, 0.00003, aaW);
      float edge = smoothstep(0.32, 0.5, length(g));
      col *= 1.0 - 0.5 * edge * fk;
      col += vec3(0.05, 0.035, 0.02) * (1.0 - edge) * fk;
      specK *= 1.0 - 0.75 * edge * fk;
      float dn = smoothstep(0.35, -0.8, N.y);
      float gR = lampReach(vec3(vWorld.x, 0.0, vWorld.z));
      emis += uGroundCol * gR * (dn * (0.05 + 0.5 * fres * fres) + 0.05 * fres);
      vec3 Ll = normalize(uLampPos - vWorld), Hh = normalize(Ll + Vv);
      emis += uLampCol * smoothstep(0.84, 0.93, dot(N, Hh)) * smoothstep(-0.02, 0.05, dot(N, Ll)) * lampReach(vWorld) * 0.3;
      emis += vec3(0.05, 0.03, 0.012) * smoothstep(-0.3, 0.6, dot(N, Ll)) * lampReach(vWorld) * (1.0 - edge * fk);
      float ink = smoothstep(0.78, 0.93, fres);
      col *= 1.0 - 0.9 * ink; emis *= 1.0 - 0.85 * ink;
      specTh = 0.95;
    `,
  });
  // the bread crumb: pale golden crumb full of pores, a darker baked crust on one side
  const CRUMB_HALF = [1.85, 1.45, 1.7];
  const crustDir = V3(0.9, -0.25, 0.35).normalize();
  const matCrumb = celMaterial({
    color: '#e8d29a', id: 175, gloss: 0.0, rim: 0,
    uniforms: { uCrustDir: { value: crustDir.clone() }, uInvHalf: { value: V3(1 / CRUMB_HALF[0], 1 / CRUMB_HALF[1], 1 / CRUMB_HALF[2]) } },
    pattern: /* glsl */ `
      vec3 p = vLocal;
      float aaL = max(length(fwidth(p)), 1e-6);                 // mm per pixel on the crumb
      float crust = smoothstep(0.42, 0.6, dot(normalize(p * uInvHalf), uCrustDir));
      // bread foam: two scales of Voronoi cells; bright cell walls (F2 - F1 small) round darker cavities, faded below a pixel
      float cav = 0.0, wall = 0.0;
      for(int o = 0; o < 2; o++){
        float sc = o == 0 ? 3.0 : 7.0;
        vec3 q = p * sc + float(o) * 7.3 + vec3(0.0, 0.0, vnoise3(p * 2.0) * 0.6); vec3 iq = floor(q), fq = fract(q);
        float F1 = 9.0, F2 = 9.0;
        for(int x = -1; x <= 1; x++) for(int y = -1; y <= 1; y++) for(int z = -1; z <= 1; z++){
          vec3 gg = vec3(float(x), float(y), float(z));
          vec3 oo = vec3(hash13(iq + gg), hash13(iq + gg + 17.1), hash13(iq + gg + 31.7));
          vec3 rr = gg + oo - fq; float d2 = dot(rr, rr);
          if(d2 < F1){ F2 = F1; F1 = d2; } else if(d2 < F2) F2 = d2;
        }
        float e = sqrt(F2) - sqrt(F1);
        float fadeP = 1.0 - smoothstep(0.3 / sc, 0.8 / sc, aaL);
        float w = o == 0 ? 1.0 : 0.6;
        cav = max(cav, smoothstep(0.12, 0.55, e) * fadeP * w * step(0.35, hash13(iq + floor(fq + 0.5) * 0.0 + 3.3)));
        wall = max(wall, (1.0 - smoothstep(0.03, 0.1, e)) * fadeP * w);
      }
      vec3 cr = mix(${lin('#f1eadb')}, ${lin('#e3d3b0')}, smoothstep(0.3, 0.75, vnoise3(p * 1.7)));
      vec3 crustC = mix(${lin('#b47a42')}, ${lin('#87532b')}, smoothstep(0.3, 0.8, vnoise3(p * 3.1 + 4.0)));
      col = mix(cr, crustC, crust);
      col *= 1.0 - 0.32 * cav * (1.0 - crust);
      col = mix(col, ${lin('#fbf6ea')}, wall * 0.35 * (1.0 - crust));
      // a thin golden band where the crust meets the crumb
      col = mix(col, ${lin('#d9a95e')}, smoothstep(0.32, 0.42, dot(normalize(p * uInvHalf), uCrustDir)) * (1.0 - crust) * 0.45);
      N = normalize(N + (vec3(vnoise3(p * 6.0), vnoise3(p * 6.0 + 5.0), vnoise3(p * 6.0 + 9.0)) - 0.5) * 0.18 * (1.0 - smoothstep(0.02, 0.06, aaL)));
      vec3 Vv = normalize(cameraPosition - vWorld);
      float fres = clamp(1.0 - abs(dot(N, Vv)), 0.0, 1.0);
      float ink = smoothstep(0.8, 0.95, fres) * 0.6;
      col *= 1.0 - ink;
      litBias = 0.22;
      shadeMul = 1.6;
      specK = 0.0;
    `,
  });
  const matHair = celMaterial({
    color: '#3a2412', id: 177, gloss: 0.4, rim: 0, side: THREE.DoubleSide,
    uniforms: { uScreenH: { value: screenH } },
    vsHead: 'varying float vMpp;',
    vertex: 'vec4 mvH = modelViewMatrix * vec4(pos, 1.0); vMpp = 2.0 * max(-mvH.z, 1e-5) / (projectionMatrix[1][1] * uScreenH);',
    fsHead: 'varying float vMpp;',
    pattern: /* glsl */ `
      if(vMpp > mix(0.00003, 0.000075, vUv.x)) discard;         // a hair vanishes once it is well under a pixel
      vec3 Vv = normalize(cameraPosition - vWorld), Ll = normalize(uLampPos - vWorld);
      col = mix(col, ${lin('#b98a4a')}, smoothstep(0.2, 1.0, vUv.y) * 0.55);
      float back = smoothstep(0.3, -0.7, dot(Vv, Ll));
      emis += ${lin('#d49a52')} * back * lampReach(vWorld) * 0.55 * vUv.y;
      litBias = 0.25;
      specTh = 0.9;
    `,
  });
  const capA = Array.from({ length: NCAP }, () => new THREE.Vector4());
  const capR = Array.from({ length: NCAP }, () => new THREE.Vector4(-1, 0, 0, 0));
  const matShadow = celMaterial({
    color: '#b9a684', id: 179, gloss: 0, rim: 0,
    uniforms: { uCapA: { value: capA }, uCapR: { value: capR }, uBend: { value: 0 } },
    vertex: 'pos.y -= uBend * pos.z * pos.z * 0.5;',
    pattern: /* glsl */ `
      vec2 p = vLocal.xz;
      float d = 1e9;
      for(int i = 0; i < ${NCAP}; i++){
        vec4 c = uCapA[i]; float r = uCapR[i].x;
        if(r <= 0.0) continue;
        vec2 pa = p - c.xy, ba = c.zw - c.xy;
        float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
        d = min(d, length(pa - ba * hh) - r);
      }
      if(d > 0.0) discard;
      litBias = -4.0; specK = 0.0; shadeMul = 1.0;
    `,
  });

  // ---- mesosoma (thorax): an evenly arched dorsum (Camponotus), a narrow neck collar in front, the propodeum behind
  const meso = loft({
    z0: -2.05, z1: 2.75, nu: 22, nv: 22, c0: 0.12, c1: 0.1, m0: 2.0, m1: 1.7,
    keys: [[0, -0.32, 0.42, 0.38, 0.38, 2.1], [0.1, -0.2, 0.52, 0.6, 0.5, 2.2], [0.25, -0.06, 0.58, 0.8, 0.58, 2.2], [0.42, 0.04, 0.64, 0.94, 0.65, 2.2],
      [0.6, 0.12, 0.8, 1.03, 0.72, 2.25], [0.75, 0.12, 0.92, 0.98, 0.72, 2.3], [0.88, 0.08, 0.8, 0.72, 0.6, 2.2], [1, 0.05, 0.32, 0.3, 0.3, 2.0]],
    mod: (P, s) => { if (s > 0.87) { const k = smooth((s - 0.87) / 0.13); P.x *= 1 - 0.3 * k; } },
  });
  mk(meso.geo, matMeso, body);
  // ---- petiole: a short stalk and an upright scale
  const petStalk = seg([[0, 0], [0.17, 0.02], [0.21, 0.2], [0.2, 0.6], [0.23, 0.85], [0, 0.9]], 10).rotateX(Math.PI / 2 + 0.06);
  mk(petStalk, matPet, body, 0, -0.5, -2.85);
  const petNode = superEllipsoid(0.5, 0.55, 0.19, 2.6, 2.2, 18, 12);
  const node = mk(petNode, matPet, body, 0, 0.0, -2.33); node.rotation.x = 0.15;
  // ---- gaster: a big glossy oval of overlapping tergites; pivots at the petiole joint
  const gasterG = new THREE.Group(); gasterG.position.set(0, -0.5, -2.68); body.add(gasterG);
  const BANDS = [0.8, 0.58, 0.38, 0.21];
  const gaster = loft({
    z0: -4.9, z1: 0.1, nu: 24, nv: 40, c0: 0.36, c1: 0.2, m0: 2.0, m1: 2.5,
    keys: [[0, 0.3, 0.8, 0.7, 0.7, 2.0], [0.25, 0.45, 1.55, 1.4, 1.2, 2.05], [0.5, 0.5, 1.78, 1.55, 1.35, 2.1], [0.75, 0.48, 1.68, 1.42, 1.2, 2.1], [1, 0.38, 1.3, 1.05, 0.9, 2.1]],
    mod: (P, s) => {
      let k = 0;
      for (const b of BANDS) { const d = s - b; if (d >= 0 && d < 0.12) k = Math.max(k, Math.pow(1 - d / 0.12, 2)); }
      const yc = 0.46; P.x *= 1 + 0.016 * k; P.y = yc + (P.y - yc) * (1 + 0.016 * k);
    },
  });
  const gasterM = mk(gaster.geo, matGaster, gasterG);
  void gasterM;

  // ---- head: heart-shaped in full face (broad occipital lobes, a notch behind), the clypeus in front; the head frame's
  // origin is the neck joint, +z along the head capsule
  const headG = new THREE.Group(); headG.position.set(0, 0.12, 2.62); body.add(headG);
  headG.rotation.order = 'YXZ';
  const head = loft({
    z0: -0.3, z1: 3.1, nu: 28, nv: 24, c0: 0.26, c1: 0.14, m0: 2.2, m1: 3.0,
    keys: [[0, 0.58, 1.42, 0.95, 0.9, 2.4], [0.3, 0.58, 1.7, 1.15, 1.05, 2.5], [0.55, 0.52, 1.62, 1.1, 1.0, 2.6], [0.8, 0.4, 1.32, 0.88, 0.85, 2.7], [1, 0.22, 0.98, 0.55, 0.6, 2.8]],
    mod: (P, s, a) => {
      // the posterior notch: the midline of the back pushed forward between the occipital lobes
      const k = smooth((0.3 - s) / 0.3);
      P.x *= 1 + 0.13 * Math.cos(a) - 0.04;
      P.z += 0.5 * Math.exp(-(P.x * P.x) / 0.32) * k;
      // the cheeks bulge a touch below the eyes; the clypeus is a little raised plate in front
      if (s > 0.7) { const c = smooth((s - 0.7) / 0.12) * Math.exp(-(P.x * P.x) / 0.45); if (P.y > 0.4) P.y += 0.07 * c; }
    },
  });
  mk(head.geo, matHead, headG);
  // compound eyes: oval, on the sides behind the middle of the head
  const eyeGeo = superEllipsoid(0.24, 0.36, 0.5, 2, 2, 16, 10);
  for (const s of [1, -1]) { const e = mk(eyeGeo, matEye, headG, s * 1.5, 1.0, 1.05); e.rotation.set(0, s * 0.22, s * -0.3); }
  // toruli: the little raised rings the antennae sit in
  const torGeo = new THREE.TorusGeometry(0.13, 0.045, 6, 12).rotateX(Math.PI / 2);
  const SOCKET = [0.52, 1.36, 2.15];
  for (const s of [1, -1]) mk(torGeo, matHead, headG, s * SOCKET[0], SOCKET[1] - 0.04, SOCKET[2]).rotation.set(-0.35, 0, s * 0.3);
  // mandibles: toothed triangular blades, curving down at the tips; pivots at the front corners of the head
  function mandibleGeo(sg) {
    const T = [-0.74, 1.44], B = [-0.2, 0.42];
    const pts = [[0.14, -0.08], [0.22, 0.32], [0.14, 0.82], [-0.08, 1.18], [-0.42, 1.42], T];
    const nT = 5, dx = B[0] - T[0], dz = B[1] - T[1], l = Math.hypot(dx, dz), px = dz / l, pz = -dx / l;   // inward normal
    for (let i = 1; i <= nT * 2; i++) {
      const f = i / (nT * 2 + 0.6), tooth = i % 2 === 0 && i < nT * 2;
      const h = tooth ? 0.11 * (1 - f * 0.4) : 0;
      pts.push([T[0] + dx * f + px * h, T[1] + dz * f + pz * h]);
    }
    pts.push(B, [-0.27, 0.2], [-0.15, -0.02], [0.0, -0.12]);
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(sg * x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 2 });
    g.rotateX(Math.PI / 2).translate(0, 0.13, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 0.78, z = p.getZ(i) * 0.78, y = p.getY(i) * 0.9;
      const dome = y > 0.05 ? 0.07 * Math.max(0, 1 - Math.pow((Math.abs(x) - 0.2) / 0.45, 2)) : 0;
      p.setXYZ(i, x, y + dome - 0.3 * Math.pow(Math.max(0, z) / 1.12, 2), z);
    }
    g.computeVertexNormals();
    return g;
  }
  const mand = [1, -1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.66, -0.12, 2.8); headG.add(g);
    mk(mandibleGeo(s), matMand, g);
    return g;
  });
  // antennae: a long scape from the torulus, an elbow, an 11-segment funiculus thickening a little to the tip
  const SCAPE = 3.3;
  const scapeGeo = seg([[0, 0], [0.11, 0.02], [0.125, 0.12], [0.08, 0.26], [0.072, 0.9], [0.08, 2.2], [0.1, SCAPE - 0.22], [0.115, SCAPE - 0.06], [0.07, SCAPE], [0, SCAPE + 0.01]], 8);
  const FUN_L = [0.55, 0.42, 0.4, 0.4, 0.4, 0.4, 0.4, 0.41, 0.42, 0.43, 0.56];
  const FUN_R = FUN_L.map((_, i) => 0.072 + 0.026 * (i / 10));
  const funTot = FUN_L.reduce((a, b) => a + b, 0);
  const funPts = []; for (let i = 0; i <= 12; i++) { const l = (i / 12) * funTot, th = 0.42 * Math.pow(l / funTot, 1.6); funPts.push([0, Math.sin(th) * 0 + l * Math.cos(th * 0.5), l * Math.sin(th * 0.5) * 0.9]); }
  const funGeo = beadTube(funPts, FUN_L, FUN_R, 4, 6, 0.32);
  const ants = [1, -1].map((s) => {
    const sc = new THREE.Group(); sc.position.set(s * SOCKET[0], SOCKET[1], SOCKET[2]); headG.add(sc);
    mk(scapeGeo, matAnt, sc);
    const fu = new THREE.Group(); fu.position.set(0, SCAPE, 0); sc.add(fu);
    mk(funGeo, matAnt, fu);
    return { s, sc, fu };
  });

  // ---- legs: coxa, trochanter, femur, tibia (with its spur), the five-segment tarsus with two claws
  const LEGS = [
    { k: 0, hip: [0.42, -0.58, 1.78], cdir: [0.32, -0.78, 0.52], cl: 1.25, tl: 0.42, fl: 3.5, bl: 3.0, tar: [1.2, 0.5, 0.42, 0.36, 0.58], rest: [6.4, 5.7], pole: [0.55, 1.0, 0.35] },
    { k: 1, hip: [0.5, -0.62, 0.15], cdir: [0.52, -0.85, 0.02], cl: 0.85, tl: 0.42, fl: 3.95, bl: 3.45, tar: [1.5, 0.55, 0.45, 0.38, 0.6], rest: [8.9, 0.1], pole: [0.55, 1.0, 0.25] },
    { k: 2, hip: [0.55, -0.56, -0.95], cdir: [0.52, -0.8, -0.3], cl: 1.0, tl: 0.48, fl: 4.6, bl: 4.25, tar: [1.8, 0.65, 0.5, 0.42, 0.65], rest: [7.9, -6.4], pole: [0.55, 1.0, -0.25] },
  ];
  function tarsusGeo(L) {
    // local frame: origin at the ankle, +x outward along the ground, +y up; the basitarsus slopes down, the rest lie low
    const pts = [[0, 0, 0]]; let x = 0, y = 0;
    const ang = [0.62, 0.26, 0.17, 0.1, 0.04];
    L.tar.forEach((l, i) => { x += l * Math.cos(ang[i]); y -= l * Math.sin(ang[i]); pts.push([x, y, 0]); });
    const g = beadTube(pts, L.tar, [0.095, 0.08, 0.075, 0.07, 0.068], 4, 5, 0.34);
    const claws = [1, -1].map((s) => {
      const c = otube([[x - 0.04, y + 0.01, 0], [x + 0.1, y + 0.0, s * 0.05], [x + 0.17, y - 0.08, s * 0.07], [x + 0.15, y - 0.16, s * 0.06]], (u) => 0.03 * (1 - u) + 0.006, 5, 4);
      return c;
    });
    return { geo: mergeGeometries([g, ...claws]), chord: [x, -y] };
  }
  const legs = [];
  for (const s of [1, -1]) for (const L of LEGS) {
    const tg = tarsusGeo(L);
    const coxa = seg([[0, 0], [0.3, 0.02], [0.4, 0.2], [0.42, L.cl * 0.5], [0.33, L.cl - 0.12], [0.24, L.cl], [0, L.cl + 0.01]], 10);
    const troch = seg([[0, 0], [0.16, 0.02], [0.2, 0.14], [0.19, L.tl - 0.08], [0.16, L.tl], [0, L.tl + 0.01]], 8);
    const fem = seg([[0, -0.02], [0.13, 0.0], [0.19, 0.14], [0.25, 0.5], [0.27, L.fl * 0.36], [0.24, L.fl * 0.7], [0.2, L.fl - 0.3], [0.17, L.fl - 0.08], [0.1, L.fl], [0, L.fl + 0.01]], 10, { sx: 0.8 });
    const tib = seg([[0, -0.02], [0.1, 0.0], [0.12, 0.15], [0.13, L.bl * 0.4], [0.155, L.bl - 0.25], [0.175, L.bl - 0.06], [0.12, L.bl], [0, L.bl + 0.01]], 8);
    const spur = seg([[0.045, 0], [0.03, 0.18], [0, L.k === 0 ? 0.42 : 0.3]], 5);
    xfg(spur, M4().makeRotationZ(0.35 * s).setPosition(0.07 * s, L.bl - 0.32, 0.07));
    const tibG = mergeGeometries([tib, spur]);
    const leg = {
      s, L, chord: tg.chord,
      coxa: mk(coxa, matLeg, mm), troch: mk(troch, matLeg, mm), fem: mk(fem, matLeg, mm), tib: mk(tibG, matLeg, mm), tar: mk(tg.geo, matLeg, mm),
      tripod: (s > 0) === (L.k !== 1) ? 0 : 0.5,          // L1 R2 L3 | R1 L2 R3
      lag: [0.035, 0.018, 0][L.k],                        // a slight wave from the hind leg forward
      hipW: V3(), C: V3(), K: V3(), A: V3(), F: V3(), T: V3(),
    };
    legs.push(leg);
  }

  // ---- hairs (setae): erect rows on the gaster's tergites, a few on the mesosoma, the head, the petiole, the acidopore fringe
  {
    const gh = [];
    gh.push(...loftHairs(gaster, 54, 11, { s0: 0.0, s1: 1.0, rows: BANDS.map((b) => b + 0.07).concat([0.12]), amax: 1.9, len: [0.32, 0.5], back: 0.9 }));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, P = V3(Math.cos(a) * 0.17, 0.12 + Math.sin(a) * 0.17, -4.87); gh.push({ p: P, d: V3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -1).normalize(), len: 0.24, r: 0.01, k: (i * 0.37) % 1 }); }
    mk(hairGeo(gh), matHair, gasterG);
    const mh = loftHairs(meso, 16, 23, { s0: 0.25, s1: 0.85, amax: 0.7, len: [0.3, 0.5], back: 0.5 });
    for (const [x, y, z] of [[0.1, 0.42, -2.33], [-0.1, 0.42, -2.33], [0.26, 0.36, -2.33], [-0.26, 0.36, -2.33]]) mh.push({ p: V3(x, y, z), d: V3(x * 0.6, 1, -0.5).normalize(), len: 0.3, r: 0.01, k: 0.5 });
    mk(hairGeo(mh), matHair, body);
    const hh = loftHairs(head, 18, 37, { s0: 0.1, s1: 0.7, amax: 1.0, len: [0.18, 0.34], back: 0.4 });
    for (let i = 0; i < 4; i++) { const x = -0.45 + (i / 3) * 0.9; hh.push({ p: V3(x, 0.62, 3.05), d: V3(x * 0.4, 0.15, 1).normalize(), len: 0.26, r: 0.009, k: (i * 0.61) % 1 }); }
    mk(hairGeo(hh), matHair, headG);
  }

  // ---- the crumb: a torn lump of bread, flat fracture faces, a smooth crust cap
  function crumbGeo() {
    let g = new THREE.IcosahedronGeometry(1, 4);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const P = g.attributes.position, v = V3();
    const rnd = mulberry32(917);
    const planes = Array.from({ length: 7 }, () => ({ n: V3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), d: 0.7 + rnd() * 0.22 }));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).normalize();
      const cd = v.dot(crustDir);
      let r = 1 + 0.2 * (vn3(v.x * 2.2 + 5, v.y * 2.2, v.z * 2.2, 3) - 0.5) * 2 + 0.07 * (vn3(v.x * 6.5, v.y * 6.5, v.z * 6.5, 9) - 0.5) * 2;
      const crustK = smooth((cd - 0.3) / 0.3);
      for (const pl of planes) { const c = v.dot(pl.n); if (c > 0.05 && pl.n.dot(crustDir) < 0.4) r = Math.min(r, lerp(pl.d / c, r, crustK)); }
      r = lerp(r, 1 + 0.05 * (vn3(v.x * 3, v.y * 3, v.z * 3, 4) - 0.5), crustK * 0.6);
      v.multiplyScalar(r);
      P.setXYZ(i, v.x * CRUMB_HALF[0], v.y * CRUMB_HALF[1], v.z * CRUMB_HALF[2]);
    }
    g.computeVertexNormals();
    return g;
  }
  const crumbG = new THREE.Group(); headG.add(crumbG);
  const crumbIn = new THREE.Group(); crumbG.add(crumbIn);
  crumbIn.rotation.set(0.35, 0.6, -0.2);
  mk(crumbGeo(), matCrumb, crumbIn);

  // ---- the drawn lamp shadow: a patch on the ground under the ant (bends with groundBend)
  const shadowGeo = new THREE.PlaneGeometry(34, 44, 2, 40).rotateX(-Math.PI / 2).translate(0, 0.025, -1);
  const shadow = mk(shadowGeo, matShadow, mm);
  shadow.frustumCulled = false;

  // ---------------------------------------------------------------- per-frame pose
  const tmpM = new THREE.Matrix4(), invMM = new THREE.Matrix4(), bodyM = new THREE.Matrix4(), bodyInv = new THREE.Matrix4();
  const bodyQ = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  const vA = V3(), vB = V3(), vC = V3(), vD = V3(), vE = V3(), up = V3(0, 1, 0), lampL = V3(), look = V3();
  const X = V3(), Y = V3(), Z = V3(), basis = new THREE.Matrix4();
  // orient a +y segment mesh from P along dir (ref picks the roll)
  function aim(m, P, dir, ref) {
    Y.copy(dir).normalize();
    X.crossVectors(Y, ref); if (X.lengthSq() < 1e-8) X.crossVectors(Y, V3(1, 0, 0)); X.normalize();
    Z.crossVectors(X, Y);
    basis.makeBasis(X, Y, Z);
    m.quaternion.setFromRotationMatrix(basis);
    m.position.copy(P);
  }
  // a direction in a frame from yaw (outward, signed by side) and pitch (up)
  const dirYP = (out, yaw, pitch) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

  // shadow casters as capsules (in the mm frame): filled per frame
  let nCap = 0;
  const lampProj = (p, out) => {   // project a point (mm frame) from the lamp onto the ground y = 0
    const dy = lampL.y - p.y;
    if (dy < 1e-3) return out.copy(p).setY(0);
    const k = p.y / dy;
    return out.set(p.x + (p.x - lampL.x) * k, 0, p.z + (p.z - lampL.z) * k);
  };
  const pa = V3(), pb = V3();
  function addCap(a, b, r) {
    if (nCap >= NCAP) return;
    lampProj(a, pa); lampProj(b, pb);
    capA[nCap].set(pa.x, pa.z, pb.x, pb.z); capR[nCap].set(r, 0, 0, 0); nCap++;
  }
  const local = (obj, x, y, z, out) => out.set(x, y, z).applyMatrix4(tmpM.copy(mm.matrixWorld).invert().multiply(obj.matrixWorld));

  const api = {
    root,
    headPos(out = V3()) { return headG.localToWorld(out.set(0, 0.6, 1.4)); },
    crumbPos(out = V3()) { return crumbG.localToWorld(out.set(0, 0, 0)); },
    update(st, t = 0) {
      const show = !!st && (st.show ?? 0) > 0;
      root.visible = show;
      if (!show) return;
      const size = st.size ?? 1;
      root.position.fromArray(st.pos ?? [0, 0, 0]);
      if (st.q) root.quaternion.fromArray(st.q).normalize(); else root.quaternion.identity();
      mm.scale.setScalar(MM * size);
      root.updateMatrixWorld(true);
      invMM.copy(mm.matrixWorld).invert();
      lampL.copy(G.uLampPos.value).applyMatrix4(invMM);

      const alert = clamp(st.alert ?? 0), speed = clamp(st.speed ?? 0), walk = st.walk ?? 0;
      const cr = clamp(st.crumb ?? 0), tilt = st.crumbTilt ?? 0;
      const bend = (st.groundBend ?? 0) * MM * size;           // 1/mm in the mm frame
      const groundY = (z) => -bend * z * z * 0.5;
      const gait = speed * (1 - smooth((alert - 0.6) / 0.4));
      const freeze = smooth(alert / 0.8);                        // idle motion stops as it freezes
      const ph = walk * TAU;
      const idle = (1 - gait) * (1 - freeze);
      // tremble: fine and fast, only while startled
      const trem = (seed) => (noise1(t * 41 + seed, seed) - 0.5) * 2 * alert;

      // ---- body: height, bob, sway
      const breath = Math.sin(t * 2.1) * 0.5 + 0.5;
      const bob = gait * 0.07 * Math.cos(2 * ph + 0.6);
      body.position.set(0, HIP_MM * (1 + 0.3 * alert) + bob - 0.05 * cr, 0);
      body.rotation.set(-0.06 * alert + gait * 0.012 * Math.sin(2 * ph), gait * 0.018 * Math.sin(ph + 0.4), gait * 0.022 * Math.sin(ph));
      body.updateMatrix();
      bodyM.copy(body.matrix); bodyInv.copy(bodyM).invert();
      bodyQ.setFromRotationMatrix(bodyM);
      // gaster: sways a touch while walking, lifts when startled, pumps slowly at rest
      gasterG.rotation.set(-0.13 + 0.12 * alert + gait * 0.025 * Math.cos(2 * ph + 1.2) + idle * 0.012 * breath, gait * 0.05 * Math.sin(ph - 0.9), gait * 0.02 * Math.sin(ph - 0.5));

      // ---- head: carried crumb lifts it, alert raises it, a look turns it, a skewed crumb gets a corrective tug
      let yaw = gait * 0.035 * Math.sin(ph + 1.1) + idle * 0.06 * (noise1(t * 0.35, 7) - 0.5);
      let pitch = 0.36 - 0.34 * cr - 0.2 * alert + gait * 0.02 * Math.cos(2 * ph) + idle * 0.04 * (noise1(t * 0.3, 8) - 0.5);
      let roll = 0;
      if (st.look) {
        look.fromArray(st.look).applyMatrix4(invMM).applyMatrix4(bodyInv).sub(headG.position);
        const ly = Math.atan2(look.x, look.z), lp = Math.atan2(-look.y, Math.hypot(look.x, look.z));
        yaw = clamp(ly, -0.7, 0.7);
        pitch = clamp(lp + 0.15 - 0.2 * cr, -0.7, 0.7);
      }
      pitch += 0.14 * Math.abs(tilt);
      roll += -0.32 * tilt;
      yaw += 0.12 * tilt;
      headG.rotation.set(pitch, yaw, roll);
      headG.updateMatrix();

      // ---- mandibles grip the crumb
      const open = cr > 0.01 ? 0.42 : 0.04 + idle * 0.03 * Math.max(0, Math.sin(t * 1.3) * 2 - 1.2);
      mand[0].rotation.y = open; mand[1].rotation.y = -open;
      // ---- the crumb: in front of the head, rear wall between the mandible tips; knocked askew it rolls and slides sideways
      crumbG.visible = cr > 0.01;
      const R = CRUMB_HALF[2];
      // (v7) crumbSize: a bigger crumb than the ant (it reads at a glance); crumbLift: held up in front of the head
      const csz = st.crumbSize ?? 1, clift = st.crumbLift ?? 0;
      crumbG.position.set(0.75 * Math.sin(tilt), -0.3 - 0.25 * Math.abs(Math.sin(tilt)) + clift * R * csz, 3.75 + R * 0.86 * cr * csz - clift * R * 0.4);
      crumbG.rotation.set(0, 0.25 * Math.sin(tilt), tilt);
      crumbG.scale.setScalar(Math.max(0.001, cr * csz));

      // ---- antennae
      for (const A of ants) {
        const s = A.s, sw = ph * 0.5 + (s > 0 ? 0 : Math.PI);
        const tw = (k) => (noise1(t * 0.55 + k * 3.1 + (s > 0 ? 0 : 11), 21 + k) - 0.5);
        let sYaw = 0.7 + 0.14 * cr + gait * 0.16 * Math.sin(sw) + idle * 0.22 * tw(0);
        let sPit = 0.62 + gait * 0.08 * Math.cos(sw) + idle * 0.18 * tw(1);
        let fYaw = 0.18 + 0.12 * cr + gait * 0.32 * Math.sin(sw + 0.5) + idle * 0.3 * tw(2);
        let fPit = -0.62 + 0.2 * cr + gait * 0.24 * Math.cos(sw + 0.5) + idle * 0.3 * tw(3);
        // startled: up and apart, trembling
        sYaw = lerp(sYaw, 0.5, alert) + 0.015 * trem(1 + s);
        sPit = lerp(sPit, 1.0, alert) + 0.02 * trem(3 + s);
        fYaw = lerp(fYaw, 0.62, alert) + 0.05 * trem(5 + s);
        fPit = lerp(fPit, 0.95, alert) + 0.06 * trem(7 + s);
        dirYP(vA, sYaw, sPit); vA.x *= s;
        aim(A.sc, A.sc.position, vA, vB.set(0, -1, 0));
        // funiculus: aimed in the head frame, then expressed in the scape's frame
        dirYP(vC, fYaw, fPit); vC.x *= s;
        Y.copy(vC).normalize(); X.crossVectors(Y, vD.set(0, -1, 0)).normalize(); Z.crossVectors(X, Y);
        basis.makeBasis(X, Y, Z); qA.setFromRotationMatrix(basis);
        A.fu.quaternion.copy(A.sc.quaternion).invert().multiply(qA);
      }

      // ---- legs: gait foot targets (mm frame, ground), coxa, two-bone IK for femur + tibia, the tarsus laid on the ground
      nCap = 0;
      const stroke = DUTY * STRIDE_MM * gait;
      for (const g of legs) {
        const L = g.L, s = g.s;
        let p = walk + g.tripod + g.lag; p -= Math.floor(p);
        let fz = L.rest[1], fx = s * L.rest[0], fy = 0, curl = 0;
        if (p < DUTY) fz += stroke * (0.5 - p / DUTY);
        else {
          const q = (p - DUTY) / (1 - DUTY), sq = Math.sin(Math.PI * q);
          fz += stroke * (-0.5 + smooth(q));
          fy = LIFT * gait * Math.pow(sq, 0.8) * (1 + 0.25 * (1 - q));
          fx += s * 0.25 * gait * sq;
          curl = 0.55 * gait * sq;
        }
        // standing tall when startled: feet a little wider
        fx += s * 0.35 * alert;
        g.F.set(fx, groundY(fz) + fy, fz);
        // hip and coxa (follow the body)
        g.hipW.set(s * L.hip[0], L.hip[1], L.hip[2]).applyMatrix4(bodyM);
        vA.set(s * L.cdir[0], L.cdir[1], L.cdir[2]).normalize();
        const swingYaw = clamp((fz - L.rest[1]) / Math.max(1, STRIDE_MM * DUTY)) * 0.3 * s * (L.k === 1 ? 1 : 0.6);
        vA.applyAxisAngle(up, swingYaw).applyQuaternion(bodyQ);
        g.C.copy(g.hipW).addScaledVector(vA, L.cl);
        // the tarsus chord from the ankle to the tip, in the vertical plane toward the foot, curled while in the air
        vB.set(g.F.x - g.C.x, 0, g.F.z - g.C.z).normalize();             // outward along the ground
        vC.crossVectors(vB, up).normalize();                                // horizontal, across
        vD.copy(vB).multiplyScalar(g.chord[0]).addScaledVector(up, -g.chord[1]);
        vD.applyAxisAngle(vC, -curl);
        g.A.copy(g.F).sub(vD);
        // two-bone IK: C -> knee -> A
        const L1 = L.tl + L.fl, L2 = L.bl;
        vE.copy(g.A).sub(g.C);
        let d = vE.length(); vE.normalize();
        d = clamp(d, Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.02);
        g.A.copy(g.C).addScaledVector(vE, d);
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        X.copy(up).multiplyScalar(L.pole[0]).addScaledVector(vB, L.pole[1]); // the knee goes out, then up
        vD.set(0, 0, 1).applyQuaternion(bodyQ); X.addScaledVector(vD, L.pole[2]);
        X.addScaledVector(vE, -X.dot(vE)).normalize();
        g.K.copy(g.C).addScaledVector(vE, a).addScaledVector(X, h);
        // place the segments
        aim(g.coxa, g.hipW, vA, vB);
        vE.copy(g.K).sub(g.C).normalize();
        aim(g.troch, g.C, vE, vC);
        g.T.copy(g.C).addScaledVector(vE, L.tl);
        aim(g.fem, g.T, vE, vC);
        aim(g.tib, g.K, vD.copy(g.A).sub(g.K), vC);
        // tarsus: local +x outward, +y up, rotated by the curl about the across axis
        X.copy(vB); Y.copy(up); Z.crossVectors(X, Y);
        basis.makeBasis(X, Y, Z); g.tar.quaternion.setFromRotationMatrix(basis);
        qB.setFromAxisAngle(vC, -curl); g.tar.quaternion.premultiply(qB);
        g.tar.position.copy(g.A);
        // shadow casters: femur, tibia, tarsus
        addCap(g.T, g.K, 0.2); addCap(g.K, g.A, 0.13); addCap(g.A, g.F, 0.08);
      }

      // ---- shadow capsules for the body parts (projected from the lamp)
      body.updateMatrixWorld(true);
      const bodyCap = (obj, a, b, r) => { local(obj, ...a, vA); local(obj, ...b, vB); addCap(vA, vB, r); };
      bodyCap(body, [0, 0.05, 2.3], [0, -0.1, -1.6], 0.72);
      bodyCap(body, [0, -0.2, -2.1], [0, -0.3, -2.6], 0.32);
      bodyCap(gasterG, [0, 0.45, -1.0], [0, 0.4, -3.9], 1.5);
      bodyCap(headG, [0, 0.5, 0.3], [0, 0.4, 2.2], 1.22);
      bodyCap(headG, [0.6, 0.0, 3.1], [-0.6, 0.0, 3.1], 0.35);
      if (crumbG.visible) bodyCap(crumbG, [-0.5, 0, 0], [0.5, 0, 0], 1.45 * cr);
      for (const A of ants) { local(A.sc, 0, 0, 0, vA); local(A.sc, 0, SCAPE, 0, vB); addCap(vA, vB, 0.08); local(A.fu, 0, funTot * 0.97, 0.8, vC); addCap(vB, vC, 0.075); }
      for (let i = nCap; i < NCAP; i++) capR[i].set(-1, 0, 0, 0);
      shadow.visible = lampL.y > 0.5;
      matShadow.uniforms.uBend.value = bend;
    },
  };
  return api;
}
