// JOKERS WILD — the card king (牌之王): a colossal half-figure of cards seated on the throne (card-king department).
//
//   makeCardKing(ctx, deps) -> { root, overlay, update(st, t, api), pose(st, t), faceFrame(out), armTip(out), headWorld(out), mesh }
//   update(st.cardking, t)  (or the whole st: st.cardking is picked out). A missing state = hidden.
//   pose(st.cardking, t): computes this frame's skeleton and stream tip without drawing, so faceFrame / armTip /
//   headWorld can be read inside the director before update() runs (they otherwise report the last update).
//   st.cardking = {
//     show,                // false / 0 hidden; 0..1 the fraction of the cards present (cross-fade with the storm by count); default 1
//     build,               // 0 a storm of cards over the table (the storm formula of cards.js) .. 1 assembled: the cards
//                          //   spiral up a funnel round the throne and settle bottom up (robe ~0.15, belt ~0.45, crown ~0.95); default 1
//     breathe,             // 0..1 breathing amplitude (the cycle runs on film time, 4.6 s, on twos); the cards ripple with it
//     look: [x, y, z],     // world point the head turns to (yaw +-0.75, pitch -0.7..0.3 rad, the neck takes a third); default ahead
//     lean,                // 0..1 bends forward over the head of the table (face ends ~1 m further forward and ~0.7 m lower)
//     arm: { out, target: [x,y,z], via: [[x,y,z], ...], carry },   // the card stream from the RIGHT hand (-x side):
//                          //   a centripetal Catmull-Rom from the palm (plus a short lead-out) through `via` to `target`;
//                          //   out 0..1 = how far along it the tip is (retracts the same way); carry 0..1 = the tip opens
//                          //   into a cupped hand. The path is kept above the tabletop; route round the lamp and the kings
//                          //   with `via`. Cards flow along it on twos.
//     flick,               // 0..1 the fingertip card (the "nail") bends back (0..0.42), snaps (0.42..0.5), rings out; dust puffs from 0.44
//     glow,                // inner gold light multiplier (default 1); faceGlow: the empty face window's light before the jokers land (default 1.1)
//     ink,                 // 1 = ink the cards' edges like the rest of the film (default 0: clean gold glints)
//   }
// faceFrame(out): world matrix of the face (origin at its centre, +z out of the face, +y up). The jokers go there side by
//   side, scale 3, at local x = -0.27 (CN = left half) and +0.27 (US = right half); a crown band, an oval collar of cards
//   and the hair sit 3-5 cm in front of that plane and hide the cards' corners, so the visible face is an oval.
// armTip(out): world matrix of the stream's tip: origin at the cupped hand's centre (where a carried thing sits),
//   +z = the stream's direction of travel at the tip, +y = the cup's open side (world up made perpendicular to +z).
//   With no stream out it returns the palm's position.
// headWorld(out): world position of the head's centre.
// Lighting: built to be lit by the practical light at its face (G.uP2Pos ~0.25 m in front of faceFrame, warm gold
//   ~(1.4, 0.9, 0.42), range ~5.5) and the lamp; it adds its own glyph glow, a fill from the lit table, glints of the
//   face's light and an amber rim from the board.
//
// Every frame is a pure function of (st, t): the slots are generated once at load (deterministic, ~0.2 s), the update
// only moves instances (~0.4-1 ms). One InstancedMesh (~2000 body cards + up to 430 stream cards, <= 3500) shares the
// film's card atlas; a faint gold core glows through the gaps; the dust of the flick is a few soft sprites in the overlay.
import * as THREE from 'three';
import { CARD, CELL, cardAtlas, CARD_GLSL } from './cards.js';
import { celMaterial, glowMaterial } from './materials.js';
import { THRONE, FLOOR_Y, KINGS } from './layout.js';
import { mulberry32, onTwos, clamp, smooth } from './util.js';

const TAU = Math.PI * 2;
const MAX = 3500, N_STREAM = 400, N_TIP = 30, BODY_MAX = MAX - N_STREAM - N_TIP;
const CW = CARD.W, CH = CARD.H;

// ---------------------------------------------------------------- the rest pose (world metres)
// bones: every slot hangs on one bone (or a blend of two); each bone maps rest-pose world points to the current pose
const B = { ROOT: 0, SPINE: 1, CHEST: 2, NECK: 3, HEAD: 4, UAR: 5, FAR: 6, HAR: 7, UAL: 8, FAL: 9, HAL: 10 };
const NB = 11;
const PIV = { spine: [0, 0.8, -4.2], chest: [0, 1.75, -4.15], neck: [0, 2.78, -4.08], head: [0, 3.0, -4.0] };
// the right arm (figure's right = -x); the left arm mirrors it
const ARM = { S: [-1.13, 2.42, -4.18], E: [-1.34, 1.46, -4.46], W: [-0.88, 0.74, -4.04], palm: [-0.8, 0.6, -3.64] };
const mir = (p) => [-p[0], p[1], p[2]];
// the face window (the jokers go here): centre, half width, half height
export const KING_FACE = { c: [0, 3.36, -3.47], hw: 0.56, hh: 0.41 };
const HEAD_C = [0, 3.38, -3.86];
// the tornado's axis (squashed in z so it never reaches the wall behind the throne)
const AX = { z: -3.95, q: 0.6 };

// ---------------------------------------------------------------- tiny SDF kit (load time only)
function sdEll(p, x, y, z) {
  const cx = (x - p.c[0]) / p.r[0], cy = (y - p.c[1]) / p.r[1], cz = (z - p.c[2]) / p.r[2];
  const k0 = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const k1 = Math.sqrt(cx * cx / (p.r[0] * p.r[0]) + cy * cy / (p.r[1] * p.r[1]) + cz * cz / (p.r[2] * p.r[2]));
  return k1 < 1e-9 ? -Math.min(p.r[0], p.r[1], p.r[2]) : (k0 * (k0 - 1)) / k1;
}
function sdCap(p, x, y, z) {
  const ax = x - p.a[0], ay = y - p.a[1], az = z - p.a[2];
  const h = clamp((ax * p.d[0] + ay * p.d[1] + az * p.d[2]) / p.l2, 0, 1);
  const dx = ax - p.d[0] * h, dy = ay - p.d[1] * h, dz = az - p.d[2] * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.ra + (p.rb - p.ra) * h);
}
function sdBox(p, x, y, z) {
  const qx = Math.abs(x - p.c[0]) - p.h[0] + p.r, qy = Math.abs(y - p.c[1]) - p.h[1] + p.r, qz = Math.abs(z - p.c[2]) - p.h[2] + p.r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - p.r;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sdPrim = (p, x, y, z) => (p.t === 0 ? sdEll(p, x, y, z) : p.t === 1 ? sdCap(p, x, y, z) : sdBox(p, x, y, z));

const ell = (c, r, extra = {}) => ({ t: 0, c, r, ...extra });
const cap = (a, b, ra, rb, extra = {}) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; return { t: 1, a, b, d, l2: d[0] * d[0] + d[1] * d[1] + d[2] * d[2], ra, rb, ...extra }; };
const box = (c, h, r) => ({ t: 2, c, h, r });

// the throne's lower parts (world) that the robe drapes: seat, arms, plinth, three steps (from set.js buildThrone)
const TZ = THRONE.pos[2], TY = FLOOR_Y;
const THRONE_BOXES = [
  box([0, -0.14, TZ + 0.025], [0.62, 0.245, 0.395], 0.02),
  box([-0.73, 0.0175, TZ + 0.025], [0.125, 0.4025, 0.42], 0.02),
  box([0.73, 0.0175, TZ + 0.025], [0.125, 0.4025, 0.42], 0.02),
  box([0, TY + 0.3575, TZ + 0.02], [0.89, 0.0375, 0.47], 0.03),
  box([0, TY + 0.2665, TZ - 0.15], [0.83, 0.0535, 0.65], 0.05),
  box([0, TY + 0.16, TZ - 0.06], [1.03, 0.0535, 0.78], 0.05),
  box([0, TY + 0.0535, TZ + 0.03], [1.24, 0.0535, 0.91], 0.05),
];
// groups: 0 robe (+ hips), 1 torso, 2 right arm, 3 left arm
function makeBody() {
  const torso = [
    ell([0, 0.52, -4.22], [0.78, 0.44, 0.52]),             // hips on the seat
    ell([0, 1.06, -4.17], [0.62, 0.42, 0.45]),             // waist
    ell([0, 1.5, -4.1], [0.78, 0.46, 0.5]),                // belly
    ell([0, 2.04, -4.12], [0.98, 0.62, 0.56]),             // chest
    ell([-0.42, 2.2, -3.84], [0.42, 0.34, 0.3]),           // pectorals
    ell([0.42, 2.2, -3.84], [0.42, 0.34, 0.3]),
    ell([0, 2.56, -4.2], [1.16, 0.36, 0.56]),              // mantle over the shoulders
    cap([0, 2.6, -4.1], [0, 3.05, -4.0], 0.38, 0.32),      // neck (hidden under the head)
  ];
  const arm = (m) => {
    const f = m ? mir : (p) => p;
    return [
      ell(f([-1.13, 2.47, -4.18]), [0.45, 0.43, 0.45], { part: 0 }),               // deltoid
      cap(f(ARM.S), f(ARM.E), 0.37, 0.28, { part: 1 }),                            // upper arm
      cap(f(ARM.E), f(ARM.W), 0.27, 0.21, { part: 2 }),                            // forearm
      ell(f([-0.82, 0.64, -3.86]), [0.2, 0.13, 0.27], { part: 3 }),                // hand on the arm of the throne
    ];
  };
  const pool = ell([0, FLOOR_Y - 0.01, TZ + 0.97], [1.22, 0.1, 0.27]);   // the robe pooling on the floor before the dais
  const armR = arm(false), armL = arm(true);
  const xw = (y) => 0.96 + (0.42 - y) * 0.16;            // never wider than ~1.15 m: the case pedestals start at |x| 1.28
  function robe(x, y, z) {
    let d = 1e9;
    for (const b of THRONE_BOXES) d = Math.min(d, sdBox(b, x, y, z));
    d -= 0.1;
    // keep it in front of the throne's back, below the waist, inside a width that flares toward the floor;
    // beside the arms of the throne it only falls over the front half
    const side = smooth((Math.abs(x) - 0.92) / 0.3);
    const clip = Math.max(Math.abs(x) - xw(y), -0.12 - (z + 4.6) - side * 0.45, y - 0.55);
    d = smax(d, clip, 0.07);
    return smin(d, sdEll(pool, x, y, z), 0.12);
  }
  function groups(x, y, z, out) {
    let t = 1e9;
    for (const p of torso) t = smin(t, sdPrim(p, x, y, z), 0.24);
    let r = 1e9, l = 1e9;
    for (const p of armR) r = smin(r, sdPrim(p, x, y, z), 0.12);
    for (const p of armL) l = smin(l, sdPrim(p, x, y, z), 0.12);
    out[0] = robe(x, y, z); out[1] = t; out[2] = r; out[3] = l;
    return out;
  }
  const G4 = [0, 0, 0, 0];
  function sdf(x, y, z) {
    groups(x, y, z, G4);
    return Math.min(smin(G4[0], G4[1], 0.22), G4[2], G4[3]);
  }
  return { torso, armR, armL, pool, robe, groups, sdf };
}

// ---------------------------------------------------------------- slot generation (load time)
function surfaceCandidates(body, rnd) {
  // points on every primitive's surface (by area), then pushed onto the union surface
  const pts = [];
  const onEll = (p, n) => {
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
      pts.push([p.c[0] + p.r[0] * s * Math.cos(a), p.c[1] + p.r[1] * u, p.c[2] + p.r[2] * s * Math.sin(a)]);
    }
  };
  const onCap = (p, n) => {
    const L = Math.sqrt(p.l2), ax = p.d.map((v) => v / L);
    const up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(ax, up)), e2 = cross(ax, e1);
    for (let i = 0; i < n; i++) {
      const h = rnd() * 1.3 - 0.15, a = rnd() * TAU, hc = clamp(h, 0, 1), r = p.ra + (p.rb - p.ra) * hc;
      const c = [p.a[0] + p.d[0] * hc, p.a[1] + p.d[1] * hc, p.a[2] + p.d[2] * hc];
      const ext = h < 0 ? h * L : h > 1 ? (h - 1) * L : 0;
      pts.push([c[0] + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * r + ax[0] * ext, c[1] + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * r + ax[1] * ext, c[2] + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * r + ax[2] * ext]);
    }
  };
  const onBox = (b, n, infl) => {
    const hx = b.h[0] + infl, hy = b.h[1] + infl, hz = b.h[2] + infl;
    const A = [hy * hz, hx * hz, hx * hy], tot = A[0] + A[1] + A[2];
    for (let i = 0; i < n; i++) {
      const k = rnd() * tot, ax = k < A[0] ? 0 : k < A[0] + A[1] ? 1 : 2, sg = rnd() < 0.5 ? -1 : 1;
      const p = [b.c[0] + (rnd() * 2 - 1) * hx, b.c[1] + (rnd() * 2 - 1) * hy, b.c[2] + (rnd() * 2 - 1) * hz];
      p[ax] = b.c[ax] + sg * [hx, hy, hz][ax];
      pts.push(p);
    }
  };
  const ellArea = (r) => { const p = 1.6075, a = r[0] ** p, b = r[1] ** p, c = r[2] ** p; return 4 * Math.PI * ((a * b + a * c + b * c) / 3) ** (1 / p); };
  const DENS = 520;      // candidates per m2
  for (const p of body.torso) p.t === 0 ? onEll(p, Math.round(ellArea(p.r) * DENS)) : onCap(p, Math.round((Math.PI * (p.ra + p.rb) * Math.sqrt(p.l2) + 2 * Math.PI * (p.ra * p.ra + p.rb * p.rb)) * DENS));
  for (const p of [...body.armR, ...body.armL]) p.t === 0 ? onEll(p, Math.round(ellArea(p.r) * DENS * 1.1)) : onCap(p, Math.round((Math.PI * (p.ra + p.rb) * Math.sqrt(p.l2) + 2 * Math.PI * (p.ra * p.ra + p.rb * p.rb)) * DENS * 1.1));
  for (const b of THRONE_BOXES) onBox(b, Math.round(8 * (b.h[0] * b.h[1] + b.h[0] * b.h[2] + b.h[1] * b.h[2]) * DENS * 0.7), 0.1);
  onEll(body.pool, Math.round(ellArea(body.pool.r) * DENS * 0.5));
  return pts;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerpA = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// a vector made perpendicular to n (fallback when degenerate)
function perp(v, n, fb) { const d = dot(v, n); const p = [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d]; const l = Math.hypot(...p); if (l > 1e-4) return mul(p, 1 / l); return fb ? perp(fb, n) : norm(cross(n, [1, 0, 0])); }

function grad(sdf, x, y, z) {
  const e = 0.004;
  return norm([sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)]);
}

// the cell a slot shows: mostly black-and-gold glyph faces, some backs turned out, a sprinkle of model cards
// by region: [share of model cards, share of backs turned out]; the rest show glyph faces
// kind codes (shader): 0 glyph face, 1 back turned out, 2 model card, 3 gold plate (crown, belt), 4 mantle lining,
// 5 stole (hot glyphs)
const CELLMIX = { body: [0.015, 0.45], robe: [0.01, 0.5], head: [0, 0.55], crown: [0, 0.15], cape: [0, 0.82], ermine: [1, 0], stole: [0, 0.04] };
const KIND_OF = { cape: 4, stole: 5 };
function pickCell(rnd, kind) {
  const r = rnd();
  const glyph = CELL[`glyph${Math.floor(rnd() * 16)}`];
  const [pm, pb] = CELLMIX[kind] ?? CELLMIX.body;
  if (r < pm) { const k = KINGS[Math.floor(rnd() * KINGS.length)]; return [CELL[`${k.id}${Math.floor(rnd() * 4)}`], CELL.backBlack, 0, glyph, 2]; }
  if (r < pm + pb) return [CELL.backBlack, CELL.backBlack, 0, glyph, KIND_OF[kind] ?? 1];
  return [glyph, CELL.backBlack, 0, glyph, KIND_OF[kind] ?? 0];
}

function buildSlots() {
  const rnd = mulberry32(90210);
  const body = makeBody();
  const slots = [];
  const sdf = body.sdf, G4 = [0, 0, 0, 0];
  // ---- the skin: candidates on the union surface, thinned to an even (blue-noise) spacing
  const cand = surfaceCandidates(body, rnd);
  const keep = [];
  for (const p of cand) {
    let [x, y, z] = p;
    let d0 = sdf(x, y, z);
    if (d0 < -0.03) continue;                         // buried inside another part
    for (let it = 0; it < 3; it++) { const g = grad(sdf, x, y, z), d = sdf(x, y, z); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; if (Math.abs(d) < 0.002) break; }
    if (Math.abs(sdf(x, y, z)) > 0.008) continue;
    const n = grad(sdf, x, y, z);
    // never seen: the back against the throne, under the floor, inside the neck under the head
    if (y < FLOOR_Y + 0.012 || (n[1] < -0.55 && y < FLOOR_Y + 0.12)) continue;
    if (z < -4.5 && n[2] < -0.25) continue;
    if (n[2] < -0.75) continue;
    if (y > 2.86 && Math.abs(x) < 0.62 && z > -4.45) continue;
    body.groups(x, y, z, G4);
    let g = 0; for (let k = 1; k < 4; k++) if (G4[k] < G4[g]) g = k;
    // robe / hips merge into one robe group below the waist
    if (g === 1 && y < 0.62) g = 0;
    keep.push({ p: [x, y, z], n, g, key: rnd() });
  }
  keep.sort((a, b) => a.key - b.key);
  // card scale and spacing by region
  const scaleOf = (c) => {
    if (c.g === 0) return 1.12 + rnd() * 0.22;
    if (c.g === 1) return 0.98 + rnd() * 0.16;
    return 0.92 + rnd() * 0.14;
  };
  const SPACE = 0.5;
  const cell = 0.16, grid = new Map();
  const gk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const skin = [];
  for (const c of keep) {
    c.s = scaleOf(c);
    if (c.g >= 2 && c.p[2] > -3.95 && c.p[1] < 0.8) c.s *= 0.82;    // hands: smaller cards
    const r = SPACE * CW * c.s;
    const [x, y, z] = c.p;
    let ok = true;
    const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) for (let e = -1; e <= 1 && ok; e++) {
      const list = grid.get(`${ix + a},${iy + b},${iz + e}`);
      if (!list) continue;
      for (const o of list) { const dd = Math.hypot(o.p[0] - x, o.p[1] - y, o.p[2] - z); if (dd < (r + o.r) * 0.5) { ok = false; break; } }
    }
    if (!ok) continue;
    c.r = r;
    const k = gk(x, y, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    skin.push(c);
  }
  // ---- turn each skin point into a slot: flow direction, bone, lift
  const armPrims = { 2: body.armR, 3: body.armL };
  for (const c of skin) {
    const [x, y, z] = c.p, n = c.n;
    let flow, bA = B.ROOT, bB = B.ROOT, w = 0, lift = 0.16 + rnd() * 0.22;
    if (c.g === 0) {
      // robe: down the slope; on flat tops, outward from the throne
      const rad = norm([x, 0, z - TZ]);
      const flat = smooth((Math.abs(n[1]) - 0.55) / 0.4);
      flow = perp(lerpA([0, -1, 0], rad, flat), n, rad);
      lift = 0.1 + rnd() * 0.18;
    } else if (c.g === 1) {
      const rad = norm([x, 0, z + 4.12]);
      const flat = smooth((n[1] - 0.45) / 0.45);
      flow = perp(lerpA([0, -1, 0], rad, flat), n, rad);
      // bones by height: robe/hips (root) -> spine -> chest -> neck
      if (y < 0.85) { bA = B.ROOT; }
      else if (y < 1.35) { bA = B.ROOT; bB = B.SPINE; w = smooth((y - 0.85) / 0.5); }
      else if (y < 1.7) { bA = B.SPINE; }
      else if (y < 2.1) { bA = B.SPINE; bB = B.CHEST; w = smooth((y - 1.7) / 0.4); }
      else if (y < 2.7) { bA = B.CHEST; }
      else { bA = B.CHEST; bB = B.NECK; w = smooth((y - 2.7) / 0.3); }
      if (y > 2.3 && n[1] > 0.3) lift += 0.12;                     // shoulders bristle
    } else {
      // arms: along the limb toward the hand (feathers on a wing)
      const prims = armPrims[c.g], right = c.g === 2;
      const [U, F, H] = right ? [B.UAR, B.FAR, B.HAR] : [B.UAL, B.FAL, B.HAL];
      let best = 0, bd = 1e9;
      prims.forEach((p, k) => { const d = sdPrim(p, x, y, z); if (d < bd) { bd = d; best = k; } });
      const S0 = right ? ARM.S : mir(ARM.S), E0 = right ? ARM.E : mir(ARM.E), W0 = right ? ARM.W : mir(ARM.W);
      if (best === 0) { flow = perp(lerpA([0, -1, 0], norm([x - (right ? -0.6 : 0.6), 0, 0]), 0.5), n); bA = B.CHEST; bB = U; w = 0.75; }
      else if (best === 1) {
        const h = clamp(dot(sub([x, y, z], S0), sub(E0, S0)) / dot(sub(E0, S0), sub(E0, S0)), 0, 1);
        flow = perp(norm(sub(E0, S0)), n);
        if (h < 0.2) { bA = B.CHEST; bB = U; w = 0.5 + h * 2.5; } else if (h > 0.82) { bA = U; bB = F; w = smooth((h - 0.82) / 0.36); } else bA = U;
      } else if (best === 2) {
        const h = clamp(dot(sub([x, y, z], E0), sub(W0, E0)) / dot(sub(W0, E0), sub(W0, E0)), 0, 1);
        flow = perp(norm(sub(W0, E0)), n);
        if (h < 0.15) { bA = U; bB = F; w = 0.5 + h * 3.3; } else if (h > 0.9) { bA = F; bB = H; w = 0.5; } else bA = F;
      } else { flow = perp(norm([0, -0.45, 1]), n); bA = H; }
      lift = 0.2 + rnd() * 0.24;
    }
    const stole = false;
    const sl = mkSlot(c.p, n, flow, c.s, lift, bA, bB, w, rnd, c.g === 0 ? 'robe' : stole ? 'stole' : 'body');
    sl.g = c.g;
    slots.push(sl);
  }
  // ---- the head: hair, beard and a crown of cards round the joker face
  headSlots(slots, rnd);
  // ---- the mantle behind the arms, flaring to the floor, its front edges and collar trimmed in ermine
  mantleSlots(slots, rnd);
  // ---- a gold belt of cards on edge round the waist, a diamond for its buckle
  for (let i = 0; i < 15; i++) {
    const a = -1.95 + (i / 14) * 3.9;
    const rx = 0.8, rz = 0.64, c = [0, 1.1, -4.15];
    const p = [c[0] + Math.sin(a) * rx, c[1], c[2] + Math.cos(a) * rz];
    const out = norm([Math.sin(a) / rx, -0.05, Math.cos(a) / rz]), tan = norm([Math.cos(a) * rx, 0, -Math.sin(a) * rz]);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...cross(tan, out)), new THREE.Vector3(...tan), new THREE.Vector3(...out)));
    pushRigid(slots, rnd, p, q, 0.84, B.SPINE, B.ROOT, 0.35, 'crown', 3);
  }
  {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(CW, CH));
    pushRigid(slots, rnd, [0, 1.1, -4.15 + 0.64 + 0.03], q, 0.95, B.SPINE, B.ROOT, 0.35, 'crown', 3);
  }
  // ---- fingers draped over the front of the throne's arms
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = sx * (0.95 - k * 0.085), a = [x, 0.62 - Math.abs(k - 1.5) * 0.015, -3.63];
      const sl = mkSlot(a, norm([sx * 0.15, 0.25, 1]), norm([sx * 0.05 * (k - 1.5), -1, 0.18]), 0.78, 0.12, sx < 0 ? B.HAR : B.HAL, B.ROOT, 0, rnd, 'body');
      sl.g = sx < 0 ? 2 : 3; slots.push(sl);
    }
  }
  // ---- a few cards spilled flat on the floor in front of the dais
  for (let k = 0; k < 34; k++) {
    const a = (rnd() - 0.5) * 2.6, x = Math.sin(a) * (1.05 + rnd() * 0.35), z = TZ + 1.02 + Math.max(0, Math.cos(a)) * (0.12 + rnd() * 0.12) - (1 - Math.cos(a)) * 0.9;
    if (Math.abs(x) > 1.16 || z > -3.06) continue;
    const yaw = rnd() * TAU, f = [Math.sin(yaw), 0, Math.cos(yaw)];
    const sl = mkSlot([x, FLOOR_Y + 0.004 + rnd() * 0.01, z], [0, 1, 0], f, 1.0 + rnd() * 0.2, 0.02 + rnd() * 0.05, B.ROOT, B.ROOT, 0, rnd, 'robe');
    sl.g = 0; slots.push(sl);
  }
  if (slots.length > BODY_MAX) slots.length = BODY_MAX;
  // ---- build order: bottom up (robe first, crown last), a little noise so the layers are ragged
  const yMin = FLOOR_Y, yMax = 4.05;
  for (const s of slots) {
    const h = clamp((s.a[1] - yMin) / (yMax - yMin), 0, 1);
    s.arrive = clamp(0.16 + 0.78 * Math.pow(h, 0.92) + (rnd() - 0.5) * 0.05, 0.12, 0.985);
    s.depart = Math.max(0.0, s.arrive - (0.2 + rnd() * 0.16));
    s.turns = s.a[1] < 0.3 ? 0 : 1;
  }
  return { slots, body };
}

function pushRigid(slots, rnd, ctr, q, s, bA, bB, w, kind, k2) {
  const sl = mkSlot([0, 0, 0], [0, 0, 1], [0, -1, 0], s, 0, bA, bB, w, rnd, kind);
  const up = new THREE.Vector3(0, CH * s * 0.5, 0).applyQuaternion(q);
  sl.a = [ctr[0] + up.x, ctr[1] + up.y, ctr[2] + up.z]; sl.q = q; sl.g = 6; sl.kind = k2; sl.still = true;
  slots.push(sl); return sl;
}
function mkSlot(a, n, flow, s, lift, bA, bB, w, rnd, kind) {
  n = norm(n); const f = perp(flow, n);
  const yv = mul(f, -1), xv = cross(yv, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...xv), new THREE.Vector3(...yv), new THREE.Vector3(...n)));
  const [face, back, mix, gcell, k] = pickCell(rnd, kind);
  return { a, n, f, q, s, lift, bA, bB, w, cell: [face, back, mix, gcell], kind: k, rnd: rnd(), key: rnd(), wave: rnd() };
}

// The head is a court-card king's: the joker pair is the face; a crown of gold cards sits on the face's top edge
// (the empty top of the joker art), an oval collar of cards radiates round the face in front of the jokers' plane (so
// the visible face is an oval, not a screen), hair of hanging cards falls round the sides and back to the shoulders,
// and a spade beard of layered cards hangs onto the chest. The crown's front tops out at CROWN.top (3.97, 4.06 with
// breath) so the board's lower edge stays clear above it in M1; its back points are a little taller.
export const CROWN = { c: [0, 3.64, -3.82], rx: 0.6, rz: 0.4, top: 3.97, back: 0.06 };
function headSlots(slots, rnd) {
  const F = KING_FACE, fz = F.c[2];
  const push = (a, n, f, s, lift, kind, k2, bB = B.HEAD, w = 0) => {
    const sl = mkSlot(a, n, f, s, lift, B.HEAD, bB, w, rnd, kind); sl.g = 4; if (k2 !== undefined) sl.kind = k2; slots.push(sl); return sl;
  };
  // ---- side hair: rows of hanging cards wrapping round the side and back of the head, puffing out at the cheeks
  const HC = [0, fz - 0.42];                     // hair curtain centre (x, z)
  const ROWS = 12;
  for (const sx of [-1, 1]) {
    for (let r = 0; r < ROWS; r++) {
      const y = CROWN.c[1] - 0.02 - r * 0.083;
      const k = r / (ROWS - 1);
      const rx = 0.7 + 0.16 * Math.sin(Math.PI * Math.min(1, k * 1.25)) + 0.2 * smooth((k - 0.65) / 0.35);
      const rz = 0.47 + 0.08 * k;
      const nC = 8;
      for (let i = 0; i < nC; i++) {
        const a = 0.95 + (i / (nC - 1)) * 2.15 + (r % 2) * 0.13;            // angle from the front round to the back
        let x = sx * Math.sin(a) * rx, z = HC[1] + Math.cos(a) * rz;
        const out = norm([Math.sin(a) * sx / rx, 0, Math.cos(a) / rz]);
        const nrm = out;
        const f = norm([out[0] * 0.3, -1, out[2] * 0.3]);
        const low = smooth((3.25 - y) / 0.55);
        push([x, y, z], nrm, f, (0.95 + rnd() * 0.12) * (1 + low * 0.12), 0.22 + rnd() * 0.2 + (i > 1 ? 0.12 : 0), 'head', undefined, B.CHEST, low * 0.55);
      }
    }
  }
  // ---- an oval frame of cards round the face, in front of the jokers' corners: the face reads as an oval
  const OV = { a: 0.455, b: 0.37 };
  // (both rings stay in front of the jokers' plane all the way out, so they cover the cards' corners)
  for (let ring = 0; ring < 2; ring++) {
    const nO = ring ? 30 : 26;
    for (let i = 0; i < nO; i++) {
      const t = ((i + ring * 0.5) / nO) * TAU;
      // the top of the oval belongs to the crown's band
      const tt = ((t % TAU) + TAU) % TAU;
      if (tt > Math.PI * 0.31 && tt < Math.PI * 0.69) continue;
      const ex = Math.cos(t) * OV.a * (1 + ring * 0.18), ey = Math.sin(t) * OV.b * (1 + ring * 0.18);
      const out = norm([Math.cos(t) / OV.a, Math.sin(t) / OV.b, 0]);
      const f = norm([out[0], out[1], ring ? -0.08 : 0.02]);
      const nrm = norm(cross(f, cross([0, 0, 1], f)));
      push([F.c[0] + ex, F.c[1] + ey, fz + 0.04 - ring * 0.012], nrm, f, ring ? 0.92 : 0.8, ring ? 0.1 + rnd() * 0.08 : 0.02, 'head');
    }
  }
  // ---- the beard: a spade of layered cards under the face, over the chest
  for (let r = 0; r < 9; r++) {
    const y = F.c[1] - OV.b - 0.02 - r * 0.08;
    const hw = 0.36 * Math.pow(1 - r / 9.5, 0.7);
    const nC = Math.max(1, Math.round((hw * 2) / 0.1) + 1);
    for (let i = 0; i < nC; i++) {
      const u = nC === 1 ? 0 : (i / (nC - 1)) * 2 - 1;
      const x = u * hw + (r % 2 ? 0.025 : -0.025);
      const z = fz + 0.05 + r * 0.006 - Math.abs(u) * 0.05;
      const f = norm([-u * 0.3, -1, 0.1]);
      push([x, y, z], norm([u * 0.3, 0.12, 1]), f, 0.92 + rnd() * 0.1 + r * 0.015, 0.16 + rnd() * 0.12, 'head', undefined, B.CHEST, smooth(r / 8) * 0.6);
    }
  }
  // ---- a cap of cards closing the top of the head inside the crown
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, rr = i % 2 ? 0.22 : 0.4;
    const p = [CROWN.c[0] + Math.sin(a) * rr, CROWN.c[1] + 0.04 + (0.4 - rr) * 0.15, CROWN.c[2] + Math.cos(a) * rr * 0.7];
    push(p, [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], [Math.sin(a), 0, Math.cos(a)], 0.95, 0.05, 'head');
  }
  // ---- the crown: a ring of cards stood on their corners (their upper halves are the points) behind a band of
  // cards laid on edge. Taller toward the back so it keeps its height seen from below; never above CROWN.top in front.
  const nPts = 14, D = Math.hypot(CW, CH), spin = Math.atan2(CW, CH);
  const bandLo = CROWN.c[1] - 0.005, bandHi = bandLo + CW * 0.76;
  for (let i = 0; i < nPts; i++) {
    const a = ((i + 0.5) / nPts) * TAU;
    const out = norm([Math.sin(a) / CROWN.rx, 0, Math.cos(a) / CROWN.rz]);
    const upv = norm(add([0, 1, 0], mul(out, 0.14)));
    const back = 0.5 - 0.5 * Math.cos(a);
    const topY = CROWN.top + back * CROWN.back;
    const cy = bandHi + 0.02;
    const s = (topY - cy) / ((D / 2) * upv[1]);
    const ctr = [CROWN.c[0] + Math.sin(a) * (CROWN.rx - 0.015), cy, CROWN.c[2] + Math.cos(a) * (CROWN.rz - 0.015)];
    const tan = norm(cross(upv, out));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...tan), new THREE.Vector3(...upv), new THREE.Vector3(...out)));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
    pushQ(ctr, q, s, 'crown', 3);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, out = norm([Math.sin(a) / CROWN.rx, 0, Math.cos(a) / CROWN.rz]);
    const tan = norm([Math.cos(a) * CROWN.rx, 0, -Math.sin(a) * CROWN.rz]);
    const p = [CROWN.c[0] + Math.sin(a) * (CROWN.rx + 0.025), bandHi, CROWN.c[2] + Math.cos(a) * (CROWN.rz + 0.025)];
    // a card laid on its long edge: its top edge is the band's top, it hangs down to the band's foot
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...cross(tan, out)), new THREE.Vector3(...tan), new THREE.Vector3(...out)));
    pushQ([p[0], (bandLo + bandHi) / 2, p[2]], q, 0.76, 'crown', 3);
  }
  function pushQ(ctr, q, s, kind, k2) {
    const sl = mkSlot([0, 0, 0], [0, 0, 1], [0, -1, 0], s, 0, B.HEAD, B.HEAD, 0, rnd, kind);
    const up = new THREE.Vector3(0, CH * s * 0.5, 0).applyQuaternion(q);
    sl.a = [ctr[0] + up.x, ctr[1] + up.y, ctr[2] + up.z]; sl.q = q; sl.g = 4; sl.kind = k2; sl.still = true;
    slots.push(sl); return sl;
  }
}

// The mantle: a heavy cloak hanging from the shoulders round the outside of the arms and down to the floor, a U open
// to the front. Seen from the front it is the dark lining behind the arms that turns the figure into a pyramid; its
// front edges and a standing collar are trimmed in ermine (the companies' own model cards, cream with dark logos).
function mantleSlots(slots, rnd) {
  const ROWS = 27, phB = Math.PI * 0.8;
  const S = (sx, v, ph) => {
    const A = 1.04 + 0.62 * smooth(v / 0.16) + 0.52 * v, Bz = 0.56 + 0.14 * v, zc = -4.52 + 0.1 * v;
    const y = 2.96 - v * (2.96 - FLOOR_Y - 0.03);
    const fold = 0.045 * Math.sin(ph * 10 + v * 2.5) * smooth(v / 0.3) * (0.4 + v);
    const ox = Math.sin(ph) / A, oz = Math.cos(ph) / Bz, ol = Math.hypot(ox, oz);
    return [sx * (A * Math.sin(ph) + (ox / ol) * fold), y, zc + Bz * Math.cos(ph) + (oz / ol) * fold];
  };
  const phF = (v) => Math.PI * (0.47 + 0.05 * v);
  for (const sx of [-1, 1]) {
    for (let r = 0; r < ROWS; r++) {
      const v = r / (ROWS - 1);
      const p0 = S(sx, v, phF(v)), p1 = S(sx, v, phB);
      const arc = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 1.15;
      const nC = Math.max(3, Math.round(arc / 0.15));
      for (let i = 0; i <= nC; i++) {
        const ph = phF(v) + ((i + (r % 2) * 0.5) / (nC + 0.5)) * (phB - phF(v));
        const p = S(sx, v, ph);
        // the surface's own frame: down the cloth, and outward
        const pv = S(sx, Math.min(1, v + 0.01), ph), pp = S(sx, v, ph + 0.01);
        const down = norm(sub(pv, p)), along = norm(sub(pp, p));
        let n = norm(cross(down, along));
        if (dot(n, [p[0], 0, p[2] + 4.3]) < 0) n = mul(n, -1);
        // the hem rests on the dais where it crosses it
        const dt = daisTop(p[0], p[2]);
        if (p[1] < dt + 0.02) p[1] = dt + 0.02;
        // hidden behind the throne's back: skip
        if (Math.abs(p[0]) < 0.86 && p[2] < -4.58) continue;
        const ermine = i === 0;
        const nn = ermine ? norm(add(n, [0, 0, 0.9])) : n;
        if (!ermine) { p[0] += (rnd() - 0.5) * 0.07; p[1] += (rnd() - 0.5) * 0.06; p[2] += (rnd() - 0.5) * 0.04; }
        const dn = ermine ? down : norm(add(down, mul(along, (rnd() - 0.5) * 0.5)));
        const sl = mkSlot(p, nn, dn, ermine ? 0.9 : 0.95 + rnd() * 0.3, ermine ? 0.08 : 0.1 + rnd() * 0.3, B.CHEST, B.ROOT, smooth(v * 1.4), rnd, ermine ? 'ermine' : 'cape');
        sl.g = 5; slots.push(sl);
      }
    }
  }
  // the standing collar: ermine cards round the back of the neck, rising behind the shoulders
  for (let i = 0; i < 24; i++) {
    const u = i / 23, a = Math.PI * (0.08 + 0.84 * u);      // round the back of the neck, shoulder to shoulder
    const x = Math.cos(a) * 1.0, z = -4.15 - Math.sin(a) * 0.42;
    const out = norm([Math.cos(a) / 1.0, 0.0, -Math.sin(a) / 0.42 * 0.5]);
    const upv = norm([out[0] * 0.35, 1, out[2] * 0.35]);
    const top = [x + upv[0] * CH * 0.95, 2.86 + upv[1] * CH * 0.95, z + upv[2] * CH * 0.95];
    const sl = mkSlot(top, out, mul(upv, -1), 0.95, 0.05, B.CHEST, B.CHEST, 0, rnd, 'ermine');
    sl.g = 5; slots.push(sl);
  }
}
// top of the dais (or the floor) under a point
function daisTop(x, z) {
  const ax = Math.abs(x), lz = z - TZ;
  if (ax <= 0.89 && lz > -0.45 && lz < 0.49) return TY + 0.395;
  if (ax <= 0.83 && lz > -0.8 && lz < 0.5) return TY + 0.32;
  if (ax <= 1.03 && lz > -0.84 && lz < 0.72) return TY + 0.2135;
  if (ax <= 1.24 && lz > -0.88 && lz < 0.94) return TY + 0.107;
  return FLOOR_Y;
}

// ---------------------------------------------------------------- GLSL
const KING_FS = /* glsl */ `
varying vec4 vK;
// warm light thrown up by the lit tabletop: two diffuse patches over the head half of the table
vec3 kingTableFill(vec3 w, vec3 n){
  float s = 0.0;
  for(int i = 0; i < 2; i++){
    vec3 c = vec3(0.0, 0.0, i == 0 ? -2.2 : -0.4);
    vec3 d = c - w; float dist = max(length(d), 0.05); vec3 L = d / dist;
    s += lampReach(c) * max(dot(n, L), 0.0) * clamp(-L.y + 0.25, 0.0, 1.0) * 7.0 / (3.14159 * dist * dist + 7.0);
  }
  return uLampCol * vec3(0.79, 0.66, 0.48) * s;
}
`;
const KING_PAT = /* glsl */ `
  vec3 GOLD = vec3(1.0, 0.74, 0.34);
  float lum0 = dot(col, vec3(0.3, 0.55, 0.15));
  float inkS = smoothstep(0.14, 0.5, lum0);
  float kind = vK.y, spark = vK.z;
  bool model = kind > 1.5 && kind < 2.5;
  bool crown = kind > 2.5 && kind < 3.5;
  bool cape = kind > 3.5 && kind < 4.5, stole = kind > 4.5;
  if(crown) col = mix(GOLD * 0.9, GOLD * 0.16, inkS);                 // gold plate, the glyphs engraved dark
  else if(!model) col = mix(col * 0.5, GOLD * (0.42 + 0.5 * lum0), inkS);
  else col *= 0.78;
  if(cape) col *= 0.5 * mix(0.72, 1.0, smoothstep(-0.2, 1.6, vWorld.y));
  if(abs(side) < 0.5) col = GOLD * 0.35;
  // the inner light: glyph strokes glow and pulse up the body (a few cards burn brighter); lifted undersides
  // and gilt edges catch it from inside
  float vein = 0.5 + 0.5 * sin(vWorld.y * 2.4 - uKTime * 1.8 + spark * 6.283);
  float pulse = mix(0.3, 1.0, vein * vein) * (1.0 + 0.3 * uKBreath);
  float hot = (0.3 + 1.6 * smoothstep(0.8, 1.0, spark)) * (cape ? 0.45 : 1.0) + (stole ? 1.1 : 0.0);
  if(crown) emis += col * uKCrown * (0.7 + 0.3 * vein);
  else emis += GOLD * inkS * (uKGlyph * pulse * hot + vK.x * 3.0) * step(0.5, side) * (model ? 0.0 : 1.0);
  if(side < -0.5) emis += GOLD * uKGap * (0.3 + 0.7 * vein);
  if(abs(side) < 0.5) emis += GOLD * uKGap * 0.6;
  // front-low fill from the lit table, and glints of the face's own light on the glossy cards
  emis += col * kingTableFill(vWorld, N) * uKBounce;
  vec3 Lf = uKFaceP - vWorld; float df = length(Lf); Lf /= max(df, 1e-3);
  vec3 Vv = normalize(cameraPosition - vWorld);
  float gl = pow(max(dot(N, normalize(Lf + Vv)), 0.0), 36.0) * smoothstep(-0.05, 0.25, dot(N, Lf));
  emis += mix(vec3(1.0, 0.85, 0.6), GOLD, 0.5) * gl * uKFaceK / (1.0 + df * df * 0.35) * (0.4 + 0.6 * inkS + (model ? 0.4 : 0.0));
  // the board's amber light from behind and above rims the crown and the shoulders
  vec3 Lb = normalize(vec3(0.0, 5.2, -4.9) - vWorld);
  emis += col * vec3(1.0, 0.55, 0.2) * uBoardRim * pow(max(dot(N, Lb), 0.0), 2.0) * smoothstep(1.8, 3.6, vWorld.y);
  gloss = 0.7; specTh = 0.965;
  idOut = uKId;
`;
const CORE_PAT = /* glsl */ `
  if(vWorld.y > uBuildY) discard;
  vec3 Vv = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vNormalW), Vv));
  float vein = 0.5 + 0.5 * sin(vWorld.y * 2.4 - uKTime * 1.8);
  float nz = vnoise(vWorld.xy * 5.0 + vWorld.z * 3.0);
  col = uColor * (uCoreK * (0.35 + 0.65 * vein) * (0.45 + 0.55 * nz) * (0.25 + 0.75 * facing * facing) + uSeamK * exp(-(uBuildY - vWorld.y) * 5.0));
`;
const DUST_VS = /* glsl */ `
attribute vec4 aDust;      // xyz world position, w size
attribute float aAlpha;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv; vA = aAlpha;
  vec4 mv = viewMatrix * vec4(aDust.xyz, 1.0);
  mv.xy += position.xy * aDust.w;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv; varying float vA;
out vec4 oc;
void main(){ float r = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA; if(a < 0.003) discard; oc = vec4(uColor, a); }`;

// ---------------------------------------------------------------- the module
export function makeCardKing(ctx = {}, deps = {}) {
  void deps;
  const root = new THREE.Group(); root.name = 'cardking';
  const overlay = new THREE.Group(); overlay.name = 'cardking-overlay';
  if (ctx.overlay) ctx.overlay.add(overlay);
  const { slots } = buildSlots();
  const NS = slots.length;

  // ---- packed slot data
  const A = new Float32Array(NS * 3), QR = new Float32Array(NS * 4), SC = new Float32Array(NS), LIFT = new Float32Array(NS);
  const BA = new Uint8Array(NS), BB = new Uint8Array(NS), BW = new Float32Array(NS);
  const ARR = new Float32Array(NS), DEP = new Float32Array(NS), TURN = new Float32Array(NS), WAVE = new Float32Array(NS), KEY = new Float32Array(NS), RIPA = new Float32Array(NS);
  const CELLS = new Float32Array(MAX * 4), KIND = new Float32Array(MAX), RND = new Float32Array(MAX);
  const STR = new Float32Array(NS * 4);       // storm: r, y0, w, ph
  const srnd = mulberry32(4243);
  slots.forEach((s, i) => {
    A.set(s.a, i * 3); QR.set([s.q.x, s.q.y, s.q.z, s.q.w], i * 4); SC[i] = s.s; LIFT[i] = s.lift;
    BA[i] = s.bA; BB[i] = s.bB; BW[i] = s.w; ARR[i] = s.arrive; DEP[i] = s.depart; TURN[i] = s.turns; WAVE[i] = s.wave; KEY[i] = s.key; RIPA[i] = s.still ? 0 : 1;
    CELLS.set(s.cell, i * 4); KIND[i] = s.kind; RND[i] = s.rnd;
    STR.set([0.6 + srnd() * 2.4, 0.5 + srnd() * 2.6, 0.35 + srnd() * 0.5, srnd() * TAU], i * 4);
  });
  // stream and tip cards: their cells
  const crnd = mulberry32(777);
  for (let k = NS; k < MAX; k++) {
    const g = CELL[`glyph${Math.floor(crnd() * 16)}`];
    const r = crnd();
    // the stream is a river of hot glyphs (kind 5), a few backs and model cards tumbling in it
    if (r < 0.05) { const kk = KINGS[Math.floor(crnd() * 10)]; CELLS.set([CELL[`${kk.id}${Math.floor(crnd() * 4)}`], CELL.backBlack, 0, g], k * 4); KIND[k] = 2; }
    else if (r < 0.18) { CELLS.set([CELL.backBlack, CELL.backBlack, 0, g], k * 4); KIND[k] = 1; }
    else if (r < 0.44) { CELLS.set([g, CELL.backBlack, 0, g], k * 4); KIND[k] = 3; }      // gold plates glinting in it
    else { CELLS.set([g, CELL.backBlack, 0, g], k * 4); KIND[k] = 5; }
    RND[k] = crnd();
  }

  // ---- the instanced cards
  const geo = new THREE.BoxGeometry(CW, CH, CARD.T);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aK = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  geo.setAttribute('aCell', aCell); geo.setAttribute('aK', aK);
  const U = {
    uKGlyph: { value: 0.16 }, uKGap: { value: 0.22 }, uKTime: { value: 0 }, uKBreath: { value: 0 }, uKBounce: { value: 2.2 },
    uKFaceP: { value: new THREE.Vector3(...KING_FACE.c) }, uKFaceK: { value: 0.9 }, uBoardRim: { value: 0.35 }, uKCrown: { value: 0.75 }, uKId: { value: 130 },
  };
  const mat = celMaterial({
    color: '#ffffff', id: 130, gloss: 0.7, rim: 0, uniforms: { uAtlas: { value: cardAtlas() }, ...U },
    vsHead: CARD_GLSL.VS + 'attribute vec4 aK; varying vec4 vK;', fsHead: CARD_GLSL.FS + KING_FS,
    vertex: 'vCell = aCell; vK = aK;', pattern: CARD_GLSL.PAT + KING_PAT, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.count = 0;
  root.add(mesh);

  // ---- the gold core (seen through the gaps) and the glowing face window (before the jokers arrive)
  const CU = { uBuildY: { value: 10 }, uCoreK: { value: 0.32 }, uSeamK: { value: 0 }, uKTime: U.uKTime };
  const coreMat = glowMaterial({ color: '#ffb35a', id: 141, uniforms: CU, pattern: CORE_PAT });
  const boneObj = Array.from({ length: NB }, () => { const o = new THREE.Object3D(); o.matrixAutoUpdate = false; root.add(o); return o; });
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const addCore = (bone, c, r, quat) => {
    const m = new THREE.Mesh(sph, coreMat); m.position.set(...c); m.scale.set(...r); if (quat) m.quaternion.copy(quat);
    m.userData.noShadow = true; m.frustumCulled = false; boneObj[bone].add(m); return m;
  };
  {
    const body = makeBody();
    const tb = [B.ROOT, B.SPINE, B.SPINE, B.CHEST, B.CHEST, B.CHEST, B.CHEST, B.NECK];
    body.torso.forEach((p, k) => { if (p.t === 0) addCore(tb[k], p.c, p.r.map((v) => v * 0.9)); });
    for (const [prims, U2, F2, H2] of [[body.armR, B.UAR, B.FAR, B.HAR], [body.armL, B.UAL, B.FAL, B.HAL]]) {
      prims.forEach((p) => {
        if (p.t === 0) { addCore(p.part === 3 ? H2 : U2, p.c, p.r.map((v) => v * 0.88)); return; }
        const L = Math.sqrt(p.l2), mid = lerpA(p.a, p.b, 0.5), r = (p.ra + p.rb) * 0.5 * 0.88;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...p.d).normalize());
        addCore(p.part === 1 ? U2 : F2, mid, [r, L * 0.5 + r * 0.5, r], q);
      });
    }
    addCore(B.HEAD, [HEAD_C[0], HEAD_C[1], HEAD_C[2] - 0.05], [0.6, 0.5, 0.42]);
  }
  const faceGlowU = { uFaceGlow: { value: 1.0 }, uBuildY: CU.uBuildY, uKTime: U.uKTime };
  const faceMat = glowMaterial({
    color: '#ffc46e', id: 142, uniforms: faceGlowU,
    pattern: 'if(vWorld.y > uBuildY) discard; float r = length((vUv - 0.5) * 2.0); col = uColor * uFaceGlow * (0.55 + 0.45 * (1.0 - r * r)) * (0.85 + 0.15 * sin(uKTime * 3.0));',
  });
  const faceDisc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), faceMat);
  faceDisc.scale.set(KING_FACE.hw * 1.9, KING_FACE.hh * 1.9, 1); faceDisc.position.set(KING_FACE.c[0], KING_FACE.c[1], KING_FACE.c[2] - 0.05);
  faceDisc.userData.noShadow = true; faceDisc.frustumCulled = false;
  boneObj[B.HEAD].add(faceDisc);

  // ---- dust of the flick (overlay sprites)
  const ND = 40;
  const dGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  dGeo.setIndex(quad.index); dGeo.setAttribute('position', quad.attributes.position); dGeo.setAttribute('uv', quad.attributes.uv);
  const aDust = new THREE.InstancedBufferAttribute(new Float32Array(ND * 4), 4), aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(ND), 1);
  dGeo.setAttribute('aDust', aDust); dGeo.setAttribute('aAlpha', aAlpha); dGeo.instanceCount = 0;
  const dustMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { uColor: { value: new THREE.Color('#c9b896') } }, vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthTest: false, depthWrite: false });
  const dust = new THREE.Mesh(dGeo, dustMat); dust.frustumCulled = false; overlay.add(dust);

  // ---------------------------------------------------------------- per-frame state
  const boneM = Array.from({ length: NB }, () => new THREE.Matrix4());
  const boneQ = Array.from({ length: NB }, () => new THREE.Quaternion());
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), Mt = new THREE.Matrix4();
  const P = new THREE.Vector3(), P2 = new THREE.Vector3(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
  const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), Ql = new THREE.Quaternion();
  const E = new THREE.Euler(), Sv = new THREE.Vector3(1, 1, 1), ONE = new THREE.Vector3(1, 1, 1);
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const pv = (a) => V3.set(a[0], a[1], a[2]);
  // T(p) R S T(-p)
  function about(out, p, q, s) { out.compose(V.set(p[0], p[1], p[2]), q, s ?? ONE); return out.multiply(Mt.makeTranslation(-p[0], -p[1], -p[2])); }
  const armState = { R: { S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3() }, L: { S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3() } };
  const ARM0 = {
    R: { S: new THREE.Vector3(...ARM.S), E: new THREE.Vector3(...ARM.E), W: new THREE.Vector3(...ARM.W) },
    L: { S: new THREE.Vector3(...mir(ARM.S)), E: new THREE.Vector3(...mir(ARM.E)), W: new THREE.Vector3(...mir(ARM.W)) },
  };
  for (const s of ['R', 'L']) { const a = ARM0[s]; a.L1 = a.S.distanceTo(a.E); a.L2 = a.E.distanceTo(a.W); a.pole = new THREE.Vector3().subVectors(a.E, a.S).cross(new THREE.Vector3().subVectors(a.W, a.E)).normalize(); }
  // a frame (x = along, y = plane normal, z = x cross y) as a rotation matrix
  function frameQ(out, along, pn) {
    V.copy(along).normalize(); V2.copy(pn).addScaledVector(V, -pn.dot(V)).normalize(); V3.crossVectors(V, V2);
    M2.makeBasis(V, V2, V3); return out.setFromRotationMatrix(M2);
  }
  const restQ = { R: {}, L: {} };
  for (const s of ['R', 'L']) {
    const a = ARM0[s];
    restQ[s].U = frameQ(new THREE.Quaternion(), new THREE.Vector3().subVectors(a.E, a.S), a.pole);
    restQ[s].F = frameQ(new THREE.Quaternion(), new THREE.Vector3().subVectors(a.W, a.E), a.pole);
  }
  const lookV = new THREE.Vector3(), PN = new THREE.Vector3();
  let gesture = 0;        // the right hand lifting for the stream (0..1)

  function computeBones(st, tb) {
    const lean = clamp(st.lean ?? 0, 0, 1);
    const br = (st.breathe ?? 0) * Math.sin((TAU * tb) / 4.6);
    for (let b = 0; b < NB; b++) { boneM[b].identity(); boneQ[b].identity(); }
    // spine and chest bend forward; the chest breathes
    Q.setFromAxisAngle(X, lean * 0.3);
    about(boneM[B.SPINE], PIV.spine, Q); boneQ[B.SPINE].copy(Q);
    Q2.setFromAxisAngle(X, lean * 0.2);
    Sv.set(1 + 0.022 * br, 1 + 0.005 * br, 1 + 0.03 * br);
    about(M, PIV.chest, Q2, Sv); M.premultiply(Mt.makeTranslation(0, 0.01 * br, 0.01 * br));
    boneM[B.CHEST].multiplyMatrices(boneM[B.SPINE], M); boneQ[B.CHEST].multiplyQuaternions(boneQ[B.SPINE], Q2);
    // the head turns to `look` (in the chest's frame), the neck takes a third
    const lk = st.look ?? [0, 2.0, 8.0];
    P.set(...PIV.head).applyMatrix4(boneM[B.CHEST]);
    lookV.set(lk[0], lk[1], lk[2]).sub(P).applyQuaternion(Q3.copy(boneQ[B.CHEST]).invert());
    const yaw = clamp(Math.atan2(lookV.x, Math.max(0.2, lookV.z)), -0.75, 0.75);
    const pitch = clamp(Math.atan2(lookV.y, Math.hypot(lookV.x, lookV.z)), -0.7, 0.3);
    const headRot = (out, k) => out.setFromEuler(E.set(-pitch * k, yaw * k, 0, 'YXZ'));
    headRot(Q, 0.35); about(M, PIV.neck, Q);
    boneM[B.NECK].multiplyMatrices(boneM[B.CHEST], M); boneQ[B.NECK].multiplyQuaternions(boneQ[B.CHEST], Q);
    headRot(Q2, 0.65); about(M, PIV.head, Q2);
    boneM[B.HEAD].multiplyMatrices(boneM[B.NECK], M); boneQ[B.HEAD].multiplyQuaternions(boneQ[B.NECK], Q2);
    // arms: shoulders ride the chest, the hands stay on the throne (the right one lifts for the stream)
    gesture = smooth(clamp((st.arm?.out ?? 0) * 5, 0, 1));
    for (const s of ['R', 'L']) {
      const a0 = ARM0[s], a = armState[s];
      a.S.copy(a0.S).applyMatrix4(boneM[B.CHEST]);
      a.W.copy(a0.W);
      if (s === 'R' && gesture > 0) a.W.add(V.set(0.06, 0.42, 0.34).multiplyScalar(gesture));
      // two-bone IK, elbow toward the rest pole (turned with the chest)
      V.subVectors(a.W, a.S); let d = V.length(); V.normalize();
      const dc = clamp(d, Math.abs(a0.L1 - a0.L2) + 0.01, a0.L1 + a0.L2 - 0.002);
      if (dc < d) a.W.copy(a.S).addScaledVector(V, dc);
      d = dc;
      const ca = (a0.L1 * a0.L1 - a0.L2 * a0.L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a0.L1 * a0.L1 - ca * ca));
      // the elbow's side: rest elbow offset from the shoulder-wrist line, turned with the chest
      V2.subVectors(a0.E, a0.S); V3.subVectors(a0.W, a0.S).normalize(); V2.addScaledVector(V3, -V2.dot(V3));
      V2.applyQuaternion(boneQ[B.CHEST]); V2.addScaledVector(V, -V2.dot(V)).normalize();
      a.E.copy(a.S).addScaledVector(V, ca).addScaledVector(V2, h);
      // bone rotations from frames (along the segment, arm-plane normal)
      P.subVectors(a.E, a.S); P2.subVectors(a.W, a.E);
      const pn = PN.crossVectors(P, P2).normalize();
      const [U, F, H] = s === 'R' ? [B.UAR, B.FAR, B.HAR] : [B.UAL, B.FAL, B.HAL];
      frameQ(Q, P, pn); Q.multiply(Q3.copy(restQ[s].U).invert()); boneQ[U].copy(Q);
      boneM[U].compose(a.S, Q, ONE).multiply(Mt.makeTranslation(-a0.S.x, -a0.S.y, -a0.S.z));
      frameQ(Q, P2, pn); Q.multiply(Q3.copy(restQ[s].F).invert()); boneQ[F].copy(Q);
      boneM[F].compose(a.E, Q, ONE).multiply(Mt.makeTranslation(-a0.E.x, -a0.E.y, -a0.E.z));
      // the hand follows the forearm; the right one tips up and opens toward the stream
      Q2.copy(Q);
      if (s === 'R' && gesture > 0) { Q3.setFromAxisAngle(X, -0.75 * gesture); Q2.multiply(Q3); }
      boneQ[H].copy(Q2);
      boneM[H].compose(a.W, Q2, ONE).multiply(Mt.makeTranslation(-a0.W.x, -a0.W.y, -a0.W.z));
    }
  }

  // ---- slot transform at the current pose: centre and quaternion of card i
  const outP = new THREE.Vector3(), outQ = new THREE.Quaternion(), half = new THREE.Vector3();
  function slotPose(i, lift) {
    const a = BA[i], b = BB[i], w = BW[i];
    P.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]);
    if (w > 0.001 && a !== b) {
      P2.copy(P).applyMatrix4(boneM[b]); P.applyMatrix4(boneM[a]); P.lerp(P2, w);
      Q.copy(boneQ[a]).slerp(boneQ[b], w);
    } else { P.applyMatrix4(boneM[a]); Q.copy(boneQ[a]); }
    Q2.set(QR[i * 4], QR[i * 4 + 1], QR[i * 4 + 2], QR[i * 4 + 3]);
    Q.multiply(Q2);
    const hl = -lift * 0.5; Ql.set(Math.sin(hl), 0, 0, Math.cos(hl));
    Q.multiply(Ql);
    half.set(0, -CH * SC[i] * 0.5, 0).applyQuaternion(Q);
    outP.copy(P).add(half); outQ.copy(Q);
  }

  // ---- the storm (same distribution as the card storm in cards.js), drawn toward the throne as the build runs
  const stormP = new THREE.Vector3(), stormQ = new THREE.Quaternion();
  let stormA = 0;
  function stormPose(i, t, b) {
    const r = STR[i * 4], y0 = STR[i * 4 + 1], w = STR[i * 4 + 2], ph = STR[i * 4 + 3];
    const suck = smooth(clamp(b / 0.8, 0, 1)) * 0.55;
    const a = ph + w * t + b * 5.5;
    stormA = a;
    const rr = r * (1 - 0.35 * suck), zs = 1.9 - 0.7 * suck, cz = -0.3 + (AX.z + 1.2 + 0.3) * suck;
    stormP.set(Math.sin(a) * rr, y0 + Math.sin(t * 0.7 + ph * 3) * 0.25 + suck * (0.4 + y0 * 0.2), Math.cos(a) * rr * zs + cz);
    stormQ.setFromEuler(E.set(Math.sin(t * 3 + ph) * 1.2, a + Math.PI / 2, Math.cos(t * 2.3 + ph) * 0.8));
  }

  // ---- flying cards never smack into the lens
  const camP = new THREE.Vector3();
  let camOn = false;
  function keepOut(p) { if (!camOn) return; const d = p.distanceTo(camP); if (d < 0.9) p.sub(camP).setLength(0.9).add(camP); }
  // ---- writing instances
  let n = 0;
  function put(p, q, s, cellIdx, boost) {
    if (n >= MAX) return;
    Sv.setScalar(s); M.compose(p, q, Sv); mesh.setMatrixAt(n, M);
    aCell.setXYZW(n, CELLS[cellIdx * 4], CELLS[cellIdx * 4 + 1], CELLS[cellIdx * 4 + 2], CELLS[cellIdx * 4 + 3]);
    aK.setXYZW(n, boost, KIND[cellIdx], RND[cellIdx], 0);
    n++;
  }

  // ---------------------------------------------------------------- the stream (right hand -> via -> target)
  const NSMP = 220;
  const sp = new Float32Array((NSMP + 1) * 3), sl = new Float32Array(NSMP + 1);
  const fT = new Float32Array((NSMP + 1) * 3), fN = new Float32Array((NSMP + 1) * 3);
  let streamL = 0;
  const tip = { p: new THREE.Vector3(), t: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(1, 0, 0), ok: false, carry: 0 };
  const CUP = { r: 0.25, lift: 0.14, n0: 11 };
  const PA = new THREE.Vector3(), PB = new THREE.Vector3();
  // the nail's angle about its top edge: bend back (load), snap, ring out
  function flickAngle(f) {
    if (f <= 0) return 0;
    if (f < 0.42) return -1.05 * smooth(f / 0.42);
    if (f < 0.5) return -1.05 + 1.55 * smooth((f - 0.42) / 0.08);
    return 0.5 * Math.exp(-(f - 0.5) * 9) * Math.cos((f - 0.5) * 26);
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], false, 'centripetal', 0.5);
  function buildStream(arm) {
    // control points: the palm, a lead-out along the hand, the director's via points, the target
    const pts = [];
    const palm = new THREE.Vector3(...ARM.palm).applyMatrix4(boneM[B.HAR]);
    const dir = V.set(0, 0.35, 1).normalize().applyQuaternion(boneQ[B.HAR]);
    pts.push(palm, palm.clone().addScaledVector(dir, 0.45));
    for (const v of arm.via ?? []) pts.push(new THREE.Vector3(v[0], v[1], v[2]));
    const tg = arm.target ?? [0, 0.4, -1.5];
    pts.push(new THREE.Vector3(tg[0], tg[1], tg[2]));
    const clean = [pts[0]];
    for (let k = 1; k < pts.length; k++) if (pts[k].distanceTo(clean[clean.length - 1]) > 0.04) clean.push(pts[k]);
    if (clean.length < 2) clean.push(pts[0].clone().add(dir));
    curve.points = clean;
    let L = 0;
    for (let k = 0; k <= NSMP; k++) {
      curve.getPoint(k / NSMP, P);
      // never through the tabletop
      if (Math.abs(P.x) < 1.24 && Math.abs(P.z) < 3.24 && P.y < 0.07 && P.y > -0.14) P.y = 0.07;
      sp[k * 3] = P.x; sp[k * 3 + 1] = P.y; sp[k * 3 + 2] = P.z;
      if (k) L += Math.hypot(P.x - sp[k * 3 - 3], P.y - sp[k * 3 - 2], P.z - sp[k * 3 - 1]);
      sl[k] = L;
    }
    streamL = L;
    // tangents and a rotation-minimising normal, started from the hand's up
    for (let k = 0; k <= NSMP; k++) {
      const a = Math.max(0, k - 1), b = Math.min(NSMP, k + 1);
      V.set(sp[b * 3] - sp[a * 3], sp[b * 3 + 1] - sp[a * 3 + 1], sp[b * 3 + 2] - sp[a * 3 + 2]).normalize();
      fT[k * 3] = V.x; fT[k * 3 + 1] = V.y; fT[k * 3 + 2] = V.z;
    }
    V2.set(0, 1, 0).applyQuaternion(boneQ[B.HAR]);
    for (let k = 0; k <= NSMP; k++) {
      V.set(fT[k * 3], fT[k * 3 + 1], fT[k * 3 + 2]);
      V2.addScaledVector(V, -V2.dot(V));
      if (V2.lengthSq() < 1e-6) V2.set(0, 1, 0).addScaledVector(V, -V.y);
      V2.normalize();
      fN[k * 3] = V2.x; fN[k * 3 + 1] = V2.y; fN[k * 3 + 2] = V2.z;
    }
  }
  // point, tangent and normal at arc length s
  const sP = new THREE.Vector3(), sT = new THREE.Vector3(), sN = new THREE.Vector3();
  function sampleStream(s) {
    s = clamp(s, 0, streamL);
    let lo = 0, hi = NSMP;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sl[m] < s) lo = m; else hi = m; }
    const f = sl[hi] > sl[lo] ? (s - sl[lo]) / (sl[hi] - sl[lo]) : 0;
    sP.set(sp[lo * 3] + (sp[hi * 3] - sp[lo * 3]) * f, sp[lo * 3 + 1] + (sp[hi * 3 + 1] - sp[lo * 3 + 1]) * f, sp[lo * 3 + 2] + (sp[hi * 3 + 2] - sp[lo * 3 + 2]) * f);
    sT.set(fT[lo * 3] + (fT[hi * 3] - fT[lo * 3]) * f, fT[lo * 3 + 1] + (fT[hi * 3 + 1] - fT[lo * 3 + 1]) * f, fT[lo * 3 + 2] + (fT[hi * 3 + 2] - fT[lo * 3 + 2]) * f).normalize();
    sN.set(fN[lo * 3] + (fN[hi * 3] - fN[lo * 3]) * f, fN[lo * 3 + 1] + (fN[hi * 3 + 1] - fN[lo * 3 + 1]) * f, fN[lo * 3 + 2] + (fN[hi * 3 + 2] - fN[lo * 3 + 2]) * f);
    sN.addScaledVector(sT, -sN.dot(sT)).normalize();
  }
  const FO = new THREE.Vector3(), FA = new THREE.Vector3();
  const cardQ = (out, along, nrm) => { // card frame: top edge back along `along`, face toward nrm
    V.copy(along).negate(); V2.copy(nrm).addScaledVector(V, -nrm.dot(V)).normalize(); V3.crossVectors(V, V2);
    M2.makeBasis(V3, V, V2); return out.setFromRotationMatrix(M2);
  };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const QA = new THREE.Quaternion(), QB = new THREE.Quaternion();
  // the tip's frame at visible length Lv
  function tipFrame(Lv, carry) {
    sampleStream(Lv);
    tip.p.copy(sP); tip.t.copy(sT);
    tip.up.set(0, 1, 0).addScaledVector(sT, -sT.y);
    if (tip.up.lengthSq() < 1e-4) tip.up.copy(sN);
    tip.up.normalize();
    tip.side.crossVectors(tip.up, tip.t).normalize();
    tip.carry = carry; tip.ok = true;
  }
  function drawStream(arm, tf, flick) {
    tip.ok = false;
    const out = clamp(arm?.out ?? 0, 0, 1);
    if (!arm || out <= 0.0005) { dGeo.instanceCount = 0; return; }
    buildStream(arm);
    const Lv = streamL * out, carry = clamp(arm.carry ?? 0, 0, 1);
    const LMAX = Math.max(11.5, Lv + 0.5), step = LMAX / N_STREAM, v = 0.85;     // longer streams thin out, never gap
    // ribbon cards flowing from the palm to the tip
    for (let k = 0; k < N_STREAM; k++) {
      const idx = NS + k;
      const s = (((k + 0.5) * step + v * tf) % LMAX + LMAX) % LMAX;
      if (s > Lv - 0.05) continue;
      sampleStream(s);
      const g0 = smooth(s / 0.4), g1 = smooth((Lv - s) / 0.7);
      const width = 0.06 + 0.2 * g0 * g1;
      const lane = ((k * 0.6180339) % 1) * 2 - 1;
      const tw = s * 0.85 + tf * 0.7;
      // ribbon axes: across (twisting) and its normal
      tmpA.crossVectors(sT, sN);                                         // binormal
      tmpB.copy(sN).multiplyScalar(Math.cos(tw)).addScaledVector(tmpA, Math.sin(tw));   // across
      tmpC.copy(sN).multiplyScalar(-Math.sin(tw)).addScaledVector(tmpA, Math.cos(tw));  // ribbon normal
      const und = 0.07 * Math.sin(s * 2.6 - tf * 4.2) * g0 * g1;
      P.copy(sP).addScaledVector(tmpB, lane * width).addScaledVector(tmpC, und + (k % 3 - 1) * 0.012);
      const flip = (k % 7) === 3 ? -1 : 1;
      cardQ(Q, sT, tmpC.multiplyScalar(flip));
      const lift = 0.3 + 0.25 * Math.sin(tf * 7.0 + k * 1.7) * 0.5 + Math.abs(lane) * 0.25;
      Ql.set(Math.sin(-lift * 0.5), 0, 0, Math.cos(-lift * 0.5)); Q.multiply(Ql);
      Q3.setFromAxisAngle(Z, lane * 0.35 + Math.sin(k * 3.1) * 0.2); Q.multiply(Q3);
      const sc = 0.9 * (0.35 + 0.65 * g0) * (0.45 + 0.55 * g1);
      half.set(0, -CH * sc * 0.5, 0).applyQuaternion(Q);
      P.add(half);
      put(P, Q, sc, idx, 0);
    }
    // the tip: a pointed finger of cards ending in one "nail" (carry 0), or a cupped hand of petals (carry 1)
    tipFrame(Lv, carry);
    const grow = smooth(Lv / 0.5);
    const cupC = tmpB.copy(tip.p).addScaledVector(tip.up, CUP.lift * carry);
    for (let j = 0; j < N_TIP; j++) {
      const idx = NS + N_STREAM + j;
      // ---- finger pose: anchor PA (top edge), orientation QA, scale scA
      let scA;
      if (j === 0) {
        // the nail rides the very end; the flick bends it back about its top edge and snaps it
        PA.copy(tip.p).addScaledVector(tip.t, -0.05);
        cardQ(QA, tip.t, tip.up);
        Ql.setFromAxisAngle(X, flickAngle(flick)); QA.multiply(Ql);
        scA = 0.85 * grow;
      } else {
        // the finger: two lanes of overlapping cards, faces up, tapering to the nail
        const u = j / N_TIP, lane = j % 2 ? 1 : -1;
        sampleStream(Math.max(0, Lv - 0.06 - u * 0.62));
        V.copy(tip.up).addScaledVector(sT, -tip.up.dot(sT)).normalize();           // up, here
        tmpA.crossVectors(V, sT).normalize();                                         // side, here
        PA.copy(sP).addScaledVector(tmpA, lane * (0.02 + 0.075 * u)).addScaledVector(V, 0.014 * (1 - u));
        V3.copy(V).addScaledVector(tmpA, lane * 0.4).normalize();
        cardQ(QA, sT, V3);
        Ql.set(Math.sin(-0.06), 0, 0, Math.cos(-0.06)); QA.multiply(Ql);
        scA = 0.76 * (0.85 + 0.15 * u) * grow;
      }
      // ---- cup pose: petals on a bowl round cupC opening along tip.up; each petal's anchor low on the bowl,
      // its body running up the meridian toward the rim, face outward
      const ring = j < CUP.n0 ? 0 : 1, m = ring ? N_TIP - CUP.n0 : CUP.n0, jj = ring ? j - CUP.n0 : j;
      const ca = (jj / m) * TAU + ring * 0.31;
      const pol = ring ? 0.95 : 0.32;
      V.copy(tip.side).multiplyScalar(Math.cos(ca)).addScaledVector(tip.t, Math.sin(ca));          // azimuth direction
      PB.copy(cupC).addScaledVector(tip.up, -Math.cos(pol) * CUP.r).addScaledVector(V, Math.sin(pol) * CUP.r);
      V3.copy(V).multiplyScalar(Math.sin(pol)).addScaledVector(tip.up, -Math.cos(pol)).normalize(); // outward normal
      P2.copy(V).multiplyScalar(Math.cos(pol)).addScaledVector(tip.up, Math.sin(pol)).normalize();  // up the meridian
      cardQ(QB, P2, V3);
      const scB = 0.82 * grow;
      // ---- blend (the nail joins the cup last)
      const cw = j === 0 ? smooth((carry - 0.4) / 0.6) : carry;
      PA.lerp(PB, cw); QA.slerp(QB, cw);
      const sc = scA + (scB - scA) * cw;
      half.set(0, -CH * sc * 0.5, 0).applyQuaternion(QA);
      PA.add(half);
      put(PA, QA, sc, idx, 0);
    }
    // dust off the nail
    if (flick > 0.44 && flick < 1) {
      const u = (flick - 0.44) / 0.56;
      const nail = P2.copy(tip.p).addScaledVector(tip.t, CH * 0.85 * 0.85);
      const dr = mulberry32(31337);
      for (let k = 0; k < ND; k++) {
        const a = dr() * TAU, sp0 = 0.06 + dr() * 0.22, cone = 0.35 + dr() * 0.7;
        V.copy(tip.t).multiplyScalar(Math.cos(cone)).addScaledVector(tip.up, Math.sin(cone) * Math.cos(a) * 0.8 + 0.3).addScaledVector(tip.side, Math.sin(cone) * Math.sin(a));
        const dd = sp0 * (1 - Math.exp(-u * 4));
        aDust.setXYZW(k, nail.x + V.x * dd, nail.y + V.y * dd + 0.02 * u * u, nail.z + V.z * dd, (0.004 + 0.022 * u) * (0.5 + dr()));
        aAlpha.setX(k, 0.5 * (1 - smooth(u)) * smooth(u * 10) * (0.35 + dr() * 0.65));
      }
      dGeo.instanceCount = ND; aDust.needsUpdate = true; aAlpha.needsUpdate = true;
    } else dGeo.instanceCount = 0;
  }

  // ---------------------------------------------------------------- update
  function update(st0, t = 0, api) {
    void api;
    // update(st.cardking, t) or update(st, t); no state = not in this shot = hidden
    const whole = st0 && typeof st0 === 'object' && ('cardking' in st0 || 'set' in st0 || 'kings' in st0 || 'cards' in st0);
    const st = whole ? st0.cardking : st0;
    const show = !st ? 0 : st.show === undefined ? 1 : st.show === true ? 1 : st.show === false ? 0 : +st.show;
    root.visible = show > 0; overlay.visible = show > 0;
    if (show <= 0) { mesh.count = 0; dGeo.instanceCount = 0; return; }
    const tb = onTwos(t);
    const build = clamp(st.build ?? 1, 0, 1);
    camOn = !!ctx.camera; if (camOn) camP.copy(ctx.camera.position);
    const glow = st.glow ?? 1;
    computeBones(st, tb);
    for (let b = 0; b < NB; b++) { boneObj[b].matrix.copy(boneM[b]); boneObj[b].matrixWorldNeedsUpdate = true; }
    // uniforms
    U.uKTime.value = tb; U.uKBreath.value = (st.breathe ?? 0) * Math.sin((TAU * tb) / 4.6);
    U.uKGlyph.value = 0.16 * glow; U.uKGap.value = 0.22 * glow; U.uKCrown.value = 1.05 * glow;
    U.uKId.value = st.ink ? 30 : 130;
    faceFrame(M); U.uKFaceP.value.setFromMatrixPosition(M).add(V.set(0, 0, 0.35).applyQuaternion(Q.setFromRotationMatrix(M)));
    const yLo = FLOOR_Y, yHi = 4.05;
    const front = build >= 0.999 ? 10 : yLo + (yHi - yLo) * Math.pow(clamp((build - 0.16) / 0.78, 0, 1), 1 / 0.92);
    CU.uBuildY.value = build >= 0.999 ? 10 : front - 0.05;
    CU.uSeamK.value = build < 0.999 ? 0.9 * glow : 0;
    CU.uCoreK.value = 0.32 * glow;
    faceGlowU.uFaceGlow.value = (st.faceGlow ?? 1.1) * glow;
    // cards
    n = 0;
    const breathe = st.breathe ?? 0;
    const ph = (TAU * tb) / 4.6;
    for (let i = 0; i < NS; i++) {
      if (KEY[i] >= show) continue;
      const ar = ARR[i], de = DEP[i];
      const rip = RIPA[i] * (breathe * 0.1 * Math.sin(ph - A[i * 3 + 1] * 1.4 - WAVE[i] * 0.6) + 0.035 * Math.sin(tb * 1.9 + WAVE[i] * TAU));
      if (build >= ar) {
        const settle = clamp((build - ar) / 0.07, 0, 1);
        slotPose(i, LIFT[i] + rip + (1 - smooth(settle)) * 0.8 * RIPA[i]);
        put(outP, outQ, SC[i], i, (1 - settle) * 0.9 * glow);
        continue;
      }
      stormPose(i, t, build);
      if (build <= de) { keepOut(stormP); put(stormP, stormQ, 0.9, i, 0); continue; }
      // in flight: drawn into a funnel round the throne's axis, one turn up it, then down into the slot. Positions
      // blend in Cartesian space and the swirl is a whole number of turns, so the path is continuous in t and build.
      const u = (build - de) / (ar - de);
      slotPose(i, LIFT[i] + 0.8);
      const e = smooth(u);
      const bx = stormP.x + (outP.x - stormP.x) * e, by = stormP.y + (outP.y - stormP.y) * e, bz = stormP.z + (outP.z - stormP.z) * e;
      const zx = bx, zz = (bz - AX.z) / AX.q;
      let rho = Math.hypot(zx, zz), th = Math.atan2(zx, zz);
      const turns = TURN[i];
      const sw = Math.pow(Math.sin(Math.PI * u), 0.7);
      const yy = by + sw * (0.3 + 0.3 * turns);                     // the cards climb as they turn
      const R = 1.3 + 0.26 * Math.max(0, yy);                       // the funnel widens upward
      rho += (R - rho) * sw * Math.min(1, turns + 0.25);
      th += turns * TAU * smooth(u * 1.15 - 0.05);
      const sn = Math.sin(th), cs = Math.cos(th);
      P.set(sn * rho, yy, AX.z + cs * rho * AX.q);
      // orientation: tumbling (as in the storm) -> riding the vortex (face out, long side along the flow) -> the slot
      Q2.setFromEuler(E.set(Math.sin(t * 3 + STR[i * 4 + 3]) * 1.2, stormA + Math.PI / 2 + turns * TAU * smooth(u * 1.15 - 0.05), Math.cos(t * 2.3 + STR[i * 4 + 3]) * 0.8));
      if (turns > 0) {
        FO.set(sn, 0, cs / AX.q).normalize();                       // outward
        FA.set(-cs, -0.35, AX.q * sn).normalize();                  // against the flow (the card's top leads)
        cardQ(Q3, FA, FO);
        Q2.slerp(Q3, smooth(Math.min(1, u * 4)));
      }
      Q2.slerp(outQ, smooth((u - 0.62) / 0.38));
      keepOut(P);
      put(P, Q2, 0.9 + (SC[i] - 0.9) * e, i, 0.25 * smooth((u - 0.6) / 0.4) * glow);
    }
    drawStream(st.arm, tb, clamp(st.flick ?? 0, 0, 1));
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true; aCell.needsUpdate = true; aK.needsUpdate = true;
    root.updateMatrixWorld(true);
  }

  // pose(st, t): the skeleton and the stream's tip only (no instances): call it inside the director before reading
  // faceFrame / armTip / headWorld for this frame; update() does the same work again and draws.
  function pose(st0, t = 0) {
    const whole = st0 && typeof st0 === 'object' && ('cardking' in st0 || 'set' in st0 || 'kings' in st0 || 'cards' in st0);
    const st = (whole ? st0.cardking : st0) ?? {};
    computeBones(st, onTwos(t));
    tip.ok = false;
    const arm = st.arm, out = clamp(arm?.out ?? 0, 0, 1);
    if (arm && out > 0.0005) { buildStream(arm); tipFrame(streamL * out, clamp(arm.carry ?? 0, 0, 1)); }
  }

  // ---------------------------------------------------------------- API
  const FACE_M = new THREE.Matrix4().makeTranslation(KING_FACE.c[0], KING_FACE.c[1], KING_FACE.c[2] + 0.012);
  function faceFrame(out = new THREE.Matrix4()) { return out.multiplyMatrices(boneM[B.HEAD], FACE_M); }
  function headWorld(out = new THREE.Vector3()) { return out.set(HEAD_C[0], HEAD_C[1], HEAD_C[2]).applyMatrix4(boneM[B.HEAD]); }
  function armTip(out = new THREE.Matrix4()) {
    if (!tip.ok) { P.set(...ARM.palm).applyMatrix4(boneM[B.HAR]); return out.makeTranslation(P.x, P.y, P.z); }
    V.copy(tip.up); V2.copy(tip.t); V3.crossVectors(V, V2).normalize();
    out.makeBasis(V3, V, V2);
    P.copy(tip.p).addScaledVector(tip.up, 0.13 * tip.carry);
    out.setPosition(P);
    return out;
  }
  computeBones({}, 0);
  update({ show: 0 }, 0);
  return { root, overlay, update, pose, faceFrame, armTip, headWorld, mesh, slotsCount: NS };
}
