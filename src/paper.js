// JOKERS WILD v3 — the paper people (paper department).
//
// Two protagonists ~5 cm tall (the red one on the CN coast, the blue one on the US coast) and a crowd of ~40 paper
// people a side, all profile cut-outs in the 剪纸 / Lotte Reiniger shadow-puppet tradition: coloured paper 0.3 mm thick,
// printed alike on both sides (fine ink lines, a halftone screen for the dark areas, faint newsprint), the cut edges
// showing the lighter paper core, tiny brass split pins at the joints, a folded tab under each foot. Paper is
// translucent: back-lit by the lamp it glows in its own colour. Each figure casts a crisp lamp shadow on the cloth
// (drawn by the module: the engine's shadow map is too coarse for a 5 cm figure).
//
// How it is drawn: every figure is a jointed puppet of 13 pieces (pelvis, chest, head, two arms of two pieces, two
// legs of two pieces, an accessory (ponytail / cane), a coat skirt), extruded from bezier outlines. All the figures of a
// design share one InstancedMesh; each figure is one row of a float texture holding its 13 piece matrices (in the
// figure's own plane, 175 units = HEIGHT) and its frame (where it stands, how it falls). Material ids: 40 body and head,
// 41 near arm, 42 far arm, 43 near leg, 44 far leg, 46 coat skirt (different ids make the engine ink the overlaps).
//
// API (docs/V3-REEL.md):
//   makePaper(ctx) -> { root, update(st.paper, t), HEIGHT, headWorld(name, out), handWorld(name, side, out),
//                       footWorld(name, out), pairPicture(ctx2d, x, y, w, h), FACES }
//   name: 'red' | 'blue'. side: 'R' (= 'front', the near arm on the figure's right, the one that reaches and waves)
//   | 'L'. The world queries read the pose of the last update(). Put root anywhere (the scene or the tabletop frame).
//   st.paper = { people: { red: P, blue: P }, crowd: { show, hits: [[x, z, t0, strength]], look: [x, y, z], gold,
//                                                      cam?: [x, y, z] } }
//   P = { show, pos: [x, z], dir: [dx, dz], walk, run, look: [x, y, z], wave, down, dive, cower,
//         reach: [x, y, z] | null, hold, shocks: [[t0, s]], wind, gold,
//         face?: 'calm' | 'worried' | 'scared' | 'smile' | 'blink'   (optional: otherwise chosen from the state)
//         scale?: 1 (size multiplier), lean?: rad (extra forward lean, + = forward) }
//   A profile cut-out reads only from the side: keep the camera within ~50 deg of the paper's normal (dir x up).
//   look behind him (relative to dir) turns the head round on its pin (1-03); steep looks bend the paper at the waist.
//   down / dive pivot on the heel / toe, twist the paper flat on the cloth; the same path back to 0 is getting up.
//   hold: stand them ~2.1 cm apart (pos x = -/+0.0105 around the meeting point) and give both the same reach point
//   at hand height, e.g. [0, 0.028, -2.02]; hold > 0.45 smiles. Out of reach they lean a little, then stretch.
//   crowd.cam: the camera position; the crowd's paper planes turn (their paths do not) to stay within ~40 deg of
//   facing it, so nobody is an edge-on black stick. Leave it out and they keep their own facing.
//   0 < show < 1 folds the figure up from the cloth (a pop-up). Poses are held on twos (onTwos(t); walk phase in
//   drawings); pos is used as given (feed it on twos too if you want the slide on twos).
//   Seen small (under SMALL_PX = 64 px tall on screen) a figure writes material id 139 instead of 40..46: uninked
//   and colour-keeping, otherwise the engine's ink outline eats a 30 px figure and it reads black.
import * as THREE from 'three';
import { celMaterial, C } from './materials.js';
import { mulberry32, onTwos, clamp, smooth, lerp } from './util.js';

export const HEIGHT = 0.05;
const UH = 175;                        // design units: a figure is 175 units tall (think centimetres)
const U = HEIGHT / UH;                 // metres per unit
const TH = 1.05;                       // paper thickness in units (0.3 mm)
export const FACES = ['calm', 'worried', 'scared', 'smile', 'blink'];
const RED = '#c62a1f', BLUE = '#2c5cff';
const CARD_RED = '#c8281c', CARD_BLUE = '#2f5fd8';      // the pair picture's paper (printed, not lit)
const SMALL_ID = 139;                  // figures smaller than SMALL_PX on screen: an uninked id that keeps its colour
const SMALL_PX = 64;

// ---------------------------------------------------------------- skeleton (rest pose: x forward, y up, feet at y 0)
const B = { PELVIS: 0, CHEST: 1, HEAD: 2, UARM_R: 3, FARM_R: 4, UARM_L: 5, FARM_L: 6, THIGH_R: 7, SHIN_R: 8, THIGH_L: 9, SHIN_L: 10, ACC: 11, SKIRT: 12 };
const NB = 13;
const ROWW = 3 + 3 * NB + 3;           // texels per figure: 3 params, 13 piece matrices, the frame
const J = { HIP: [0, 92], WAIST: [0, 104], NECK: [1.5, 147], SH: [-0.5, 138], EL: [-0.5, 111.5], KN: [1, 50], HAND: [0.4, 81.6], HEEL: [-6.4, 0], TOE: [19.6, 0], HEADC: [2.5, 160] };
const L1 = Math.hypot(J.EL[0] - J.SH[0], J.EL[1] - J.SH[1]), L2 = Math.hypot(J.HAND[0] - J.EL[0], J.HAND[1] - J.EL[1]);
const REST1 = Math.atan2(J.EL[1] - J.SH[1], J.EL[0] - J.SH[0]), REST2 = Math.atan2(J.HAND[1] - J.EL[1], J.HAND[0] - J.EL[0]);
// sheet layers (z of each sheet's middle, units): far limbs behind, near limbs in front
const k6 = 0.6;
const Z = { FARM_L: -6 * k6, UARM_L: -5 * k6, SHIN_L: -3 * k6, THIGH_L: -2 * k6, PELVIS: 0, THIGH_R: 2 * k6, SHIN_R: 3 * k6, HEAD: 2 * k6, ACC: 1 * k6, CHEST: 4 * k6, SKIRT: 5 * k6, UARM_R: 6 * k6, FARM_R: 7 * k6 };

// ---------------------------------------------------------------- outlines (closed; a third element 'c' = sharp corner)
const NECK_M = [[4.4, 140, 'c'], [-4.2, 140, 'c'], [-5.0, 145.5]];
const NECK_W = [[4.0, 140, 'c'], [-3.8, 140, 'c'], [-4.6, 145.5]];
const FACE_M = [[10.2, 163.6], [10.7, 161.9], [10.4, 160.6], [13.4, 156.8, 'c'], [12.7, 155.6], [11.1, 155.1, 'c'], [11.7, 153.7], [11.0, 152.7, 'c'], [11.5, 151.7], [10.8, 149.2], [9.2, 147.3], [6.2, 146.2], [4.8, 145.0]];
const FACE_W = [[10.0, 163.4], [10.4, 161.8], [10.1, 160.6], [12.4, 157.2, 'c'], [11.9, 156.0], [10.6, 155.5, 'c'], [11.2, 154.0], [10.6, 153.0, 'c'], [11.0, 152.0], [10.2, 149.4], [8.4, 147.6], [5.8, 146.6], [4.6, 145.2]];
const FACE_C = [[9.8, 163.6], [10.4, 161.6], [10.2, 160.4], [11.6, 157.4, 'c'], [11.2, 156.4], [10.4, 155.8, 'c'], [10.9, 154.2], [10.3, 153.2, 'c'], [10.7, 152.2], [10.2, 149.6], [8.2, 147.4], [5.6, 146.4], [4.6, 145.2]];
const HEADS = {
  cap: [[-8.0, 151], [-11.4, 157.5], [-12.4, 164.6, 'c'], [-11.6, 169.8], [-6.5, 174.6], [0.5, 175.6], [7, 173.4], [10.4, 170.0], [17.4, 167.6, 'c'], [17.0, 166.4, 'c'], [10.6, 166.0, 'c'], ...FACE_M, ...NECK_M],
  ponyW: [[-7.4, 151.5], [-10.8, 157.5], [-11.8, 163.4], [-10.6, 169.2], [-6.0, 173.2], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8], ...FACE_W, ...NECK_W],
  short: [[-8.0, 151], [-11.3, 157.4], [-12.0, 163.8], [-10.6, 169.6], [-5.8, 173.6], [1.0, 174.2], [6.8, 172.2], [9.8, 168.8], [10.4, 165.8], ...FACE_M, ...NECK_M],
  fedora: [[-8.0, 151], [-11.3, 157.4], [-11.9, 162.2], [-17.4, 163.6, 'c'], [-17.2, 164.9, 'c'], [-11.2, 165.4, 'c'], [-10.6, 171.6], [-9.2, 177.0, 'c'], [-3.0, 177.4], [0.4, 176.2], [3.2, 177.6], [8.2, 177.0, 'c'], [9.6, 171.4], [10.2, 165.6, 'c'], [17.2, 165.2, 'c'], [17.4, 163.9, 'c'], [10.4, 163.6, 'c'], ...FACE_M.slice(1), ...NECK_M],
  beanie: [[-8.0, 151], [-11.3, 157.4], [-12.4, 163.0], [-12.6, 165.8, 'c'], [-11.4, 171.2], [-6.4, 175.6], [0.6, 176.8], [6.8, 174.6], [10.4, 169.6], [11.0, 166.2, 'c'], [10.2, 164.6, 'c'], ...FACE_M.slice(1), ...NECK_M],
  bun: [[-7.4, 151.5], [-10.8, 157.5], [-11.8, 163.4], [-12.8, 166.6], [-16.2, 167.6], [-17.6, 171.4], [-15.4, 175.0], [-11.2, 174.6], [-6.0, 173.6], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8], ...FACE_W, ...NECK_W],
  long: [[-6.0, 143.0], [-10.6, 140.6, 'c'], [-12.8, 146], [-13.2, 154], [-12.6, 162], [-11.0, 168.6], [-6.0, 173.4], [0.6, 174.4], [6.6, 172.2], [9.6, 168.6], [10.2, 165.6], ...FACE_W, ...NECK_W],
  scarf: [[-7.0, 150.5], [-10.6, 152.6], [-13.0, 158.4], [-13.4, 164.6], [-11.0, 170.6], [-4.6, 174.2], [2.6, 174.0], [8.4, 170.8], [11.4, 166.4, 'c'], [10.4, 165.2, 'c'], ...FACE_W.slice(1), ...NECK_W],
  boy: [[-8.0, 151], [-11.3, 157.4], [-12.0, 163.8], [-10.6, 169.6], [-5.8, 173.6], [1.0, 174.4], [6.8, 172.6], [9.6, 169.6], [9.2, 167.8, 'c'], [9.9, 165.6], ...FACE_C, ...NECK_W],
  girl: [[-7.4, 151.5], [-10.6, 156.0], [-14.6, 154.6], [-16.8, 157.6], [-13.4, 160.2], [-11.9, 163], [-14.8, 165.4], [-16.4, 169.4], [-12.8, 169.8], [-10.6, 170], [-6.0, 173.2], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8], ...FACE_C, ...NECK_W],
};
const CHEST_M = [[-5.6, 147.6, 'c'], [-8.6, 143.2], [-11.0, 138.5], [-11.2, 131], [-10.0, 122], [-9.0, 112], [-9.6, 103], [-10.4, 95.0, 'c'], [10.6, 95.0, 'c'], [10.4, 103], [9.6, 112], [10.6, 121], [11.8, 129], [11.2, 136], [8.8, 141.2], [6.0, 144.4, 'c'], [4.2, 146.8, 'c']];
const CHEST_W = [[-4.8, 147.2, 'c'], [-8.0, 143.4], [-10.2, 138.4], [-10.0, 130], [-8.8, 120], [-7.4, 110], [-7.6, 101.5, 'c'], [8.0, 101.5, 'c'], [8.2, 110], [9.4, 118], [11.0, 126], [10.4, 134], [8.4, 140.6], [5.6, 144.0, 'c'], [3.8, 146.8, 'c']];
const PELVIS_M = [[-8.8, 108, 'c'], [-9.6, 100], [-10.2, 92], [-9.0, 85.0], [-4, 82.5], [3, 82.8], [8.0, 85], [9.0, 92], [8.8, 100], [8.6, 108, 'c']];
const THIGH_M = [[-8.6, 96], [-9.4, 88], [-8.0, 70], [-6.6, 55], [-5.6, 48], [-2, 44.5], [3.2, 44.8], [6.2, 48.5], [6.8, 56], [7.6, 72], [8.8, 88], [8.0, 96], [3, 100], [-4, 100]];
const SHIN_M = [[-4.8, 55], [-5.6, 47], [-5.0, 36], [-4.6, 24], [-4.6, 13], [-5.6, 8.5], [-6.6, 4], [-6.4, 0.6, 'c'], [18.6, 0.6, 'c'], [19.6, 2.6], [18.2, 5.2], [12, 7.4], [5.6, 10.4], [4.6, 14], [4.8, 26], [5.6, 38], [6.6, 47], [5.4, 54], [0.6, 56.5]];
const SHIN_W = [[-4.0, 55], [-4.8, 47], [-4.6, 36], [-3.6, 22], [-3.2, 12], [-3.6, 7], [-4.6, 3.4], [-4.2, 0.6, 'c'], [15.6, 0.6, 'c'], [16.4, 2.2], [14.6, 4.4], [8.6, 6.2], [4.2, 9.4], [3.6, 14], [4.2, 26], [5.4, 38], [6.2, 47], [5.0, 54], [0.6, 56.5]];
const UARM_M = [[-6.2, 142], [-6.8, 134], [-5.6, 122], [-4.8, 113], [-3.4, 108.6], [0.8, 108.0], [3.6, 110], [4.4, 116], [5.0, 126], [6.0, 136], [4, 142.6], [-1, 144.6]];
const FARM_M = [[-4.6, 113.6], [-5.0, 106], [-4.4, 97], [-4.0, 90.8, 'c'], [-3.0, 90.2, 'c'], [-3.3, 86], [-3.2, 81.5], [-1.8, 77.9], [0.6, 77.2], [2.3, 79.4], [2.7, 82.6, 'c'], [4.6, 83.0], [4.3, 85.6], [3.2, 88.4], [3.0, 90.2, 'c'], [4.0, 90.8, 'c'], [4.4, 97], [4.4, 106], [3.6, 113.6], [-0.5, 116]];
const SKIRTS = {
  coatW: [[-7.8, 106, 'c'], [-9.0, 96], [-11.6, 80], [-14.0, 63.5, 'c'], [12.4, 63.5, 'c'], [11.0, 80], [9.4, 96], [8.4, 106, 'c']],
  dress: [[-7.6, 106, 'c'], [-9.4, 96], [-13.6, 74, 'c'], [12.6, 74, 'c'], [9.6, 96], [8.2, 106, 'c']],
  longcoat: [[-9.6, 104, 'c'], [-10.4, 90], [-11.6, 62, 'c'], [11.2, 62, 'c'], [10.6, 90], [9.8, 104, 'c']],
};
const PONY = [[-8.8, 171.6], [-12.6, 171.0], [-16.8, 167.4], [-19.2, 161], [-19.0, 154], [-17.2, 148.6, 'c'], [-16.4, 153.6], [-14.6, 159.4], [-11.6, 164.6], [-8.4, 166.4]];
const CANE = [[1.0, 88.6], [-1.6, 88.8], [-3.6, 87.2], [-3.6, 85.2, 'c'], [-2.4, 85.4], [-1.4, 86.9], [0.6, 86.8], [0.8, 85.8], [0.8, 0.6, 'c'], [2.4, 0.6, 'c'], [2.4, 86.2], [2.0, 88.2]];
const scaleX = (o, k, k2 = k) => o.map(([x, y, c]) => [x * (x < 0 ? k : k2), y, c]);

// closed Catmull-Rom outline -> points; corners keep their tangent along the chord
function crPt(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
function sampleCurve(pts, closed = true, step = 1.4) {
  const n = pts.length, out = [];
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = P(i), p2 = P(i + 1);
    let p0 = P(i - 1), p3 = P(i + 2);
    if (p1[2] || (!closed && i === 0)) p0 = [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    if (p2[2] || (!closed && i === segs - 1)) p3 = [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) out.push(crPt(p0, p1, p2, p3, s / steps));
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  const clean = [out[0]];
  for (const p of out) { const q = clean[clean.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.08) clean.push(p); }
  if (closed && clean.length > 2) { const a = clean[0], b = clean[clean.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.08) clean.pop(); }
  return clean;
}

// ---------------------------------------------------------------- 2D affine transforms [a, b, c, d, e, f]
const amul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function arot(p, a, sx = 1) {
  const c = Math.cos(a), s = Math.sin(a);
  const m = [c * sx, s * sx, -s, c, 0, 0];
  m[4] = p[0] - (m[0] * p[0] + m[2] * p[1]); m[5] = p[1] - (m[1] * p[0] + m[3] * p[1]);
  return m;
}
const app = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const aang = (m) => Math.atan2(m[1], m[0]);

// ---------------------------------------------------------------- designs
// style: hair / top / legs drive the print; acc: ponytail or cane; skirt: a coat skirt over the legs
const DESIGNS = {
  red: { head: 'cap', face: 'M', chest: CHEST_M, pelvis: PELVIS_M, thigh: THIGH_M, shin: SHIN_M, uarm: UARM_M, farm: FARM_M, top: 'jacket', legs: 'trousers', atlas: 2048, step: 0.9 },
  blue: { head: 'ponyW', face: 'W', chest: CHEST_W, pelvis: scaleX(PELVIS_M, 0.9), thigh: scaleX(THIGH_M, 0.82), shin: SHIN_W, uarm: scaleX(UARM_M, 0.86), farm: scaleX(FARM_M, 0.9), acc: { shape: PONY, parent: 'head', pivot: [-10.5, 168] }, skirt: 'coatW', top: 'coatW', legs: 'tights', atlas: 2048, step: 0.9 },
  man: { head: 'short', face: 'M', chest: CHEST_M, pelvis: PELVIS_M, thigh: THIGH_M, shin: SHIN_M, uarm: UARM_M, farm: FARM_M, top: 'jacket', legs: 'trousers' },
  fedora: { head: 'fedora', face: 'M', chest: CHEST_M, pelvis: PELVIS_M, thigh: THIGH_M, shin: SHIN_M, uarm: UARM_M, farm: FARM_M, skirt: 'longcoat', top: 'longcoat', legs: 'trousers' },
  beanie: { head: 'beanie', face: 'M', chest: scaleX(CHEST_M, 1.12, 1.24), pelvis: scaleX(PELVIS_M, 1.12), thigh: scaleX(THIGH_M, 1.08), shin: SHIN_M, uarm: scaleX(UARM_M, 1.1), farm: FARM_M, top: 'jacket', legs: 'trousers' },
  bun: { head: 'bun', face: 'W', chest: CHEST_W, pelvis: scaleX(PELVIS_M, 0.9), thigh: scaleX(THIGH_M, 0.82), shin: SHIN_W, uarm: scaleX(UARM_M, 0.86), farm: scaleX(FARM_M, 0.9), skirt: 'coatW', top: 'coatW', legs: 'tights' },
  long: { head: 'long', face: 'W', chest: CHEST_W, pelvis: scaleX(PELVIS_M, 0.9), thigh: scaleX(THIGH_M, 0.8), shin: SHIN_W, uarm: scaleX(UARM_M, 0.86), farm: scaleX(FARM_M, 0.9), skirt: 'dress', top: 'dress', legs: 'tights' },
  oldW: { head: 'scarf', face: 'W', chest: scaleX(CHEST_W, 1.05, 1.1), pelvis: scaleX(PELVIS_M, 0.95), thigh: scaleX(THIGH_M, 0.85), shin: SHIN_W, uarm: scaleX(UARM_M, 0.9), farm: scaleX(FARM_M, 0.9), skirt: 'coatW', top: 'coatW', legs: 'tights', acc: { shape: CANE, parent: 'farmR', pivot: [0, 0] }, old: 1 },
  oldM: { head: 'fedora', face: 'M', chest: CHEST_M, pelvis: PELVIS_M, thigh: THIGH_M, shin: SHIN_M, uarm: UARM_M, farm: FARM_M, top: 'jacket', legs: 'trousers', acc: { shape: CANE, parent: 'farmR', pivot: [0, 0] }, old: 1 },
  boy: { head: 'boy', face: 'C', headScale: 1.3, chest: scaleX(CHEST_M, 0.92), pelvis: PELVIS_M, thigh: scaleX(THIGH_M, 0.9), shin: SHIN_M, uarm: scaleX(UARM_M, 0.9), farm: FARM_M, top: 'jacket', legs: 'trousers', child: 1 },
  girl: { head: 'girl', face: 'C', headScale: 1.3, chest: scaleX(CHEST_W, 0.95), pelvis: scaleX(PELVIS_M, 0.9), thigh: scaleX(THIGH_M, 0.82), shin: SHIN_W, uarm: scaleX(UARM_M, 0.86), farm: scaleX(FARM_M, 0.9), skirt: 'dress', top: 'dress', legs: 'tights', child: 1 },
};
const CROWD_KINDS = ['man', 'fedora', 'beanie', 'bun', 'long', 'oldW', 'oldM', 'boy', 'girl'];

// ---------------------------------------------------------------- the print (atlas: R = ink, G = halftone tone)
// A pen draws in design units into two canvases (ink, tone) or, for pairPicture, paints in colour.
class Pen {
  constructor(ink, tone, paint = null) { this.i = ink; this.t = tone; this.p = paint; }
  _path(g, pts, closed) {
    const s = sampleCurve(pts, closed, 0.5);
    g.beginPath(); g.moveTo(s[0][0], s[0][1]); for (let k = 1; k < s.length; k++) g.lineTo(s[k][0], s[k][1]); if (closed) g.closePath();
  }
  line(pts, w, a = 1) { const g = this.i; g.save(); g.globalAlpha = a; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.p ? this.p.ink : '#fff'; this._path(g, pts, false); g.stroke(); g.restore(); }
  loop(pts, w, a = 1) { const g = this.i; g.save(); g.globalAlpha = a; g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = this.p ? this.p.ink : '#fff'; this._path(g, pts, true); g.stroke(); g.restore(); }
  fill(pts, a = 1) { const g = this.i; g.save(); g.globalAlpha = a; g.fillStyle = this.p ? this.p.ink : '#fff'; this._path(g, pts, true); g.fill(); g.restore(); }
  ell(x, y, rx, ry, rot = 0, a = 1) { const g = this.i; g.save(); g.globalAlpha = a; g.fillStyle = this.p ? this.p.ink : '#fff'; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); g.restore(); }
  ring(x, y, rx, ry, w, rot = 0) { const g = this.i; g.save(); g.lineWidth = w; g.strokeStyle = this.p ? this.p.ink : '#fff'; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.stroke(); g.restore(); }
  clear(x, y, rx, ry) { const g = this.i; g.save(); g.fillStyle = this.p ? this.p.paper : '#000'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  tone(pts, v) { const g = this.p ? this.i : this.t; g.save(); if (this.p) { g.fillStyle = this.p.tone(v); } else { const c = Math.round(v * 255); g.fillStyle = `rgb(${c},${c},${c})`; } this._path(g, pts, true); g.fill(); g.restore(); }
  toneEll(x, y, rx, ry, v) { const g = this.p ? this.i : this.t; g.save(); if (this.p) g.fillStyle = this.p.tone(v); else { const c = Math.round(v * 255); g.fillStyle = `rgb(${c},${c},${c})`; } g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
}

// the face (profile, facing +x); E = the eye
function drawFace(pen, d, expr) {
  const W = d.face !== 'M';
  const E = d.face === 'M' ? [6.9, 161.5] : d.face === 'W' ? [6.6, 161.7] : [6.2, 161.4];
  const [ex, ey] = E;
  const browY = ey + 2.7;
  const lw = 0.55;
  // ear (hidden under long hair / scarf)
  if (!['long', 'scarf'].includes(d.head)) {
    pen.line([[-0.6, 161.6], [-2.6, 161.0], [-3.5, 158.6], [-2.4, 156.0], [-0.8, 155.6]], 0.6);
    pen.line([[-1.4, 159.6], [-2.2, 158.4], [-1.4, 157.4]], 0.4);
  }
  // nostril
  pen.line([[ex + 4.4, 155.9], [ex + 3.6, 156.2]], 0.35);
  const mouth = (pts, w = 0.48) => pen.line(pts.map(([x, y]) => [x, y + (d.face === 'C' ? 0.3 : 0)]), w);
  const mx = d.face === 'M' ? 11.0 : 10.6;
  if (expr === 'calm' || expr === 'blink') {
    pen.line([[ex - 2.3, browY - 0.2], [ex + 0.1, browY + 0.45], [ex + 2.4, browY + 0.1]], 0.62);
    if (expr === 'calm') {
      pen.ell(ex + 0.15, ey, 1.05, 0.66, 0.08);
      pen.line([[ex - 1.7, ey + 0.55], [ex - 0.2, ey + 0.82], [ex + 1.3, ey + 0.5]], 0.42);
      if (W) pen.line([[ex + 1.2, ey + 0.55], [ex + 1.9, ey + 1.2]], 0.3);
    } else pen.line([[ex - 1.3, ey + 0.2], [ex, ey - 0.3], [ex + 1.3, ey + 0.1]], 0.48);
    mouth([[mx, 152.75], [mx - 1.4, 152.8], [mx - 2.4, 153.0]]);
  } else if (expr === 'worried') {
    pen.line([[ex - 2.5, browY - 0.6], [ex + 0.0, browY + 0.1], [ex + 2.5, browY + 1.6]], 0.66);
    pen.line([[ex + 1.6, browY + 2.8], [ex + 2.8, browY + 3.2]], 0.3);
    pen.ell(ex + 0.1, ey, 1.0, 0.88, 0);
    pen.clear(ex + 0.55, ey + 0.3, 0.26, 0.26);
    pen.line([[ex - 0.9, ey - 1.5], [ex + 0.7, ey - 1.55]], 0.28);
    mouth([[mx, 152.45], [mx - 1.2, 152.65], [mx - 2.5, 152.05]]);
  } else if (expr === 'scared') {
    pen.line([[ex - 2.4, browY + 0.5], [ex + 0.0, browY + 1.9], [ex + 2.6, browY + 1.6]], 0.6);
    pen.ring(ex + 0.1, ey + 0.1, 1.45, 1.35, 0.42);
    pen.ell(ex + 0.55, ey + 0.05, 0.48, 0.5);
    pen.ell(mx - 0.75, 152.45, 0.85, 1.15);
  } else if (expr === 'smile') {
    pen.line([[ex - 2.3, browY + 0.2], [ex + 0.1, browY + 0.95], [ex + 2.4, browY + 0.6]], 0.6);
    pen.line([[ex - 1.35, ey - 0.35], [ex + 0.1, ey + 0.65], [ex + 1.45, ey - 0.25]], 0.55);
    mouth([[mx + 0.1, 153.15], [mx - 1.0, 152.4], [mx - 2.4, 152.75], [mx - 3.0, 153.5]], 0.5);
  }
}

function drawHeadPrint(pen, d, expr) {
  const h = d.head;
  // hair and hats first (tone), then lines
  if (h === 'cap') {
    pen.tone([[-12.4, 164.6], [-11.6, 169.8], [-6.5, 174.6], [0.5, 175.6], [7, 173.4], [10.4, 170.0], [17.4, 167.6, 'c'], [17.0, 166.4, 'c'], [10.6, 166.0, 'c']], 0.78);
    pen.tone([[-12.3, 164.4], [-11.4, 157.6], [-8.4, 151.4], [-6.0, 152.6], [-4.6, 156.6], [-3.4, 161.0], [-0.8, 163.4], [3.6, 164.5], [7.0, 165.3], [10.5, 165.6], [10.4, 166.4], [-12.2, 166.2]], 0.55);
    pen.line([[-12.2, 166.1], [-2, 166.9], [10.4, 167.4]], 0.45);
    pen.line([[10.5, 166.7], [14, 166.9], [17.0, 167.0]], 0.3);
    pen.line([[-8.6, 166.6], [-6.0, 173.0]], 0.25, 0.7);
    pen.ell(0.4, 175.2, 0.9, 0.5);
  } else if (h === 'short' || h === 'boy') {
    pen.tone([[-8.0, 151], [-11.3, 157.4], [-12.0, 163.8], [-10.6, 169.6], [-5.8, 173.6], [1.0, 174.2], [6.8, 172.2], [9.8, 168.8], [10.2, 166.2], [7.0, 167.0], [3.4, 166.6], [0.2, 164.6], [-1.0, 162.2], [-3.6, 160.4], [-4.6, 156.2], [-6.2, 152.4]], 0.72);
    for (let i = 0; i < 6; i++) pen.line([[-9 + i * 2.6, 170.5 - Math.abs(i - 2) * 0.8], [-6 + i * 2.6, 172.8 - Math.abs(i - 2.5) * 0.6]], 0.2, 0.6);
  } else if (h === 'fedora') {
    pen.tone([[-11.9, 162.2], [-17.4, 163.6, 'c'], [-17.2, 164.9, 'c'], [-11.2, 165.4, 'c'], [-10.6, 171.6], [-9.2, 177.0, 'c'], [-3.0, 177.4], [0.4, 176.2], [3.2, 177.6], [8.2, 177.0, 'c'], [9.6, 171.4], [10.2, 165.6, 'c'], [17.2, 165.2, 'c'], [17.4, 163.9, 'c'], [10.4, 163.6, 'c']], 0.9);
    pen.tone([[-11.9, 162.2], [-11.3, 157.4], [-8.0, 151.2], [-5.8, 152.6], [-4.6, 157.0], [-2.8, 161.4], [3, 163.4], [10.3, 163.6]], 0.55);
    pen.line([[-10.6, 166.6], [9.8, 166.8]], 0.5);
  } else if (h === 'beanie') {
    pen.tone([[-12.4, 163.0], [-12.6, 165.8, 'c'], [-11.4, 171.2], [-6.4, 175.6], [0.6, 176.8], [6.8, 174.6], [10.4, 169.6], [11.0, 166.2, 'c'], [10.2, 164.6, 'c']], 0.7);
    pen.line([[-12.5, 166.6], [-1, 167.4], [10.8, 167.6]], 0.4);
    for (let i = 0; i < 9; i++) pen.line([[-10 + i * 2.4, 167.6], [-9.4 + i * 2.2, 174 - Math.abs(i - 4) * 0.7]], 0.22, 0.7);
    pen.tone([[-12.3, 163.0], [-11.3, 157.5], [-8.2, 151.4], [-6.0, 152.6], [-4.4, 157.4], [-3.0, 161.4], [-1.0, 163.2], [10.2, 164.6]], 0.5);
  } else if (h === 'ponyW' || h === 'bun' || h === 'long' || h === 'girl') {
    const top = h === 'long'
      ? [[-6.0, 143.0], [-10.6, 140.6, 'c'], [-12.8, 146], [-13.2, 154], [-12.6, 162], [-11.0, 168.6], [-6.0, 173.4], [0.6, 174.4], [6.6, 172.2], [9.6, 168.6], [10.2, 165.6]]
      : h === 'bun' ? [[-7.4, 151.5], [-10.8, 157.5], [-11.8, 163.4], [-12.8, 166.6], [-16.2, 167.6], [-17.6, 171.4], [-15.4, 175.0], [-11.2, 174.6], [-6.0, 173.6], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8]]
        : h === 'girl' ? [[-7.4, 151.5], [-10.6, 156.0], [-14.6, 154.6], [-16.8, 157.6], [-13.4, 160.2], [-11.9, 163], [-14.8, 165.4], [-16.4, 169.4], [-12.8, 169.8], [-10.6, 170], [-6.0, 173.2], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8]]
          : [[-7.4, 151.5], [-10.8, 157.5], [-11.8, 163.4], [-10.6, 169.2], [-6.0, 173.2], [0.6, 174.2], [6.4, 172.0], [9.4, 168.6], [10.0, 165.8]];
    const hairline = h === 'long'
      ? [[7.6, 166.8], [4.4, 166.4], [1.2, 164.6], [-0.4, 161.6], [-0.6, 156.4], [-2.4, 151.0], [-4.2, 146.6]]
      : [[7.6, 166.8], [4.4, 166.4], [1.2, 164.6], [-0.4, 161.6], [-0.4, 158.0], [-2.6, 155.0], [-5.0, 153.4]];
    pen.tone([...top, ...hairline], 0.62);
    for (let i = 0; i < 5; i++) pen.line([[8.4 - i * 0.6, 168.6 - i * 0.3], [4 - i * 2.2, 171.8 - i * 0.6], [-3 - i * 1.8, 170.0 - i * 2.4]], 0.22, 0.7);
    if (h === 'ponyW') pen.ell(-10.6, 168.2, 1.3, 1.9, -0.5);
    if (h === 'bun') pen.line([[-12.8, 167.4], [-14.0, 172.6]], 0.4);
  } else if (h === 'scarf') {
    pen.tone([[-7.0, 150.5], [-10.6, 152.6], [-13.0, 158.4], [-13.4, 164.6], [-11.0, 170.6], [-4.6, 174.2], [2.6, 174.0], [8.4, 170.8], [11.4, 166.4, 'c'], [10.4, 165.2, 'c'], [7, 165.8], [2, 164.6], [-1.4, 162], [-2.8, 157], [-4.2, 151.6], [-4.6, 147.4]], 0.6);
    for (let i = 0; i < 7; i++) pen.ell(-9 + i * 2.6, 166 + Math.sin(i) * 3, 0.5, 0.5, 0, 0.8);
    pen.line([[10.4, 165.6], [2, 164.8], [-1.4, 162.2], [-3, 157], [-4.4, 151.4], [-4.8, 147.2]], 0.4);
  }
  if (h === 'girl') pen.tone([[-16.8, 157.6], [-14.6, 154.6], [-13.4, 160.2]], 0.0);
  drawFace(pen, d, expr);
}

function drawChestPrint(pen, d) {
  const t = d.top;
  if (t === 'jacket' || t === 'longcoat') {
    pen.tone([[-11.0, 138.5], [-11.2, 131], [-10.0, 122], [-9.0, 112], [-9.6, 103], [-10.4, 95.0, 'c'], [-7.6, 95.0, 'c'], [-6.6, 104], [-6.4, 116], [-7.8, 128], [-8.4, 137]], 0.22);
    pen.line([[4.2, 146.6], [6.6, 141.0], [8.6, 135.6]], 0.45);
    pen.line([[6.0, 144.2], [3.4, 140.8], [5.2, 139.4], [8.6, 135.6]], 0.36);
    pen.line([[8.9, 135.0], [8.8, 124], [8.4, 112], [8.9, 95.4]], 0.4);
    for (const y of [127, 117.5, 108]) { pen.ring(7.1, y, 0.75, 0.75, 0.3); pen.ell(7.1, y, 0.25, 0.25); }
    pen.line([[0.6, 110.6], [6.6, 110.2]], 0.36);
    pen.line([[0.6, 110.6], [1.0, 108.4], [6.4, 108.0], [6.6, 110.2]], 0.28);
    pen.line([[-5.2, 147.2], [-1.2, 142.6], [3.4, 141.8]], 0.32, 0.8);
    pen.line([[-10.2, 97.4], [10.4, 97.4]], 0.3, 0.8);
    if (t === 'longcoat') pen.line([[8.9, 95], [8.9, 104]], 0.4);
  } else {
    // coat / dress: a knitted scarf, lapels, a double row of buttons
    pen.tone([[-4.8, 147.2], [3.8, 146.8], [6.2, 143.8], [4.4, 141.0], [-1.2, 141.6], [-7.6, 143.6]], t === 'dress' ? 0.0 : 0.58);
    if (t !== 'dress') {
      pen.tone([[4.6, 143.2], [7.4, 139.4], [8.2, 129.4], [6.0, 128.4], [4.4, 138.2]], 0.58);
      for (let i = 0; i < 7; i++) pen.line([[-6 + i * 1.8, 143.0 + (i % 2) * 0.3], [-5 + i * 1.8, 146.6]], 0.2, 0.65);
      for (let i = 0; i < 4; i++) pen.line([[6.0 + i * 0.6, 128.2], [5.9 + i * 0.6, 126.6]], 0.22);
      pen.line([[5.6, 144.0], [8.4, 136.0], [9.6, 128.6]], 0.36);
      for (const y of [124, 116, 108]) { pen.ring(6.4, y, 0.65, 0.65, 0.28); pen.ring(2.8, y, 0.65, 0.65, 0.28); }
    } else {
      pen.line([[3.8, 146.6], [6.0, 143.0], [9.0, 140.8]], 0.36);
      pen.line([[-4.6, 146.8], [-1.0, 143.2], [3.0, 142.6]], 0.3);
      for (let i = 0; i < 4; i++) pen.ell(2 + (i % 2) * 3.4, 132 - i * 7, 0.7, 0.7, 0, 0.9);
    }
    pen.tone([[-10.2, 138.4], [-10.0, 130], [-8.8, 120], [-7.4, 110], [-7.6, 101.5], [-5.0, 101.5], [-4.6, 112], [-6.6, 128]], 0.2);
  }
}
function drawSkirtPrint(pen, d) {
  const s = d.skirt;
  if (s === 'coatW') {
    pen.tone([[-7.8, 106], [8.4, 106], [8.8, 102.6], [-8.2, 102.6]], 0.85);
    pen.ring(6.0, 104.3, 1.1, 1.1, 0.4);
    pen.ring(6.4, 97, 0.65, 0.65, 0.28); pen.ring(7.2, 88, 0.65, 0.65, 0.28); pen.ring(2.8, 97, 0.65, 0.65, 0.28); pen.ring(3.4, 88, 0.65, 0.65, 0.28);
    pen.line([[-1.4, 90.6], [4.4, 89.4]], 0.32);
    pen.line([[-13.4, 66.6], [11.8, 66.6]], 0.28, 0.8);
    pen.line([[8.6, 102], [10.6, 80], [11.8, 64]], 0.32, 0.7);
  } else if (s === 'dress') {
    pen.line([[-7.6, 103.8], [8.2, 103.8]], 0.4);
    for (let i = 0; i < 4; i++) pen.line([[-5 + i * 4, 103], [-8 + i * 6.2, 75]], 0.25, 0.65);
    pen.tone([[-13.4, 76.4], [12.4, 76.4], [12.6, 74.0], [-13.6, 74.0]], 0.6);
  } else {
    pen.line([[8.9, 104], [9.6, 62.6]], 0.4);
    for (const y of [99, 89]) { pen.ring(7.4, y, 0.75, 0.75, 0.3); }
    pen.line([[-1.2, 86.6], [5.6, 86.2]], 0.32);
    pen.tone([[-9.6, 104], [-10.4, 90], [-11.6, 62], [-8.6, 62], [-7.2, 90]], 0.22);
  }
}
function drawLegPrint(pen, d, which) {
  const dark = d.legs === 'tights' ? 0.55 : 0.48;
  if (which === 'pelvis') {
    pen.tone(d.pelvis, dark);
    pen.line([[6.4, 97], [6.6, 89], [5.2, 84.4]], 0.32);
  } else if (which === 'thigh') {
    pen.tone(d.thigh, dark);
    if (d.legs === 'trousers') pen.line([[5.4, 92], [4.6, 72], [3.6, 50]], 0.28, 0.7);
  } else {
    const W = d.shin === SHIN_W;
    const hem = W ? 9.8 : 11.2;
    pen.tone(d.shin, dark);
    pen.tone([[-7, hem, 'c'], [20, hem, 'c'], [20, -1, 'c'], [-7, -1, 'c']], 0.9);
    if (!W) {
      pen.line([[-5.4, hem + 0.6], [5.0, hem + 0.6]], 0.35);
      pen.line([[3.6, 46], [3.2, 30], [3.4, hem + 1]], 0.28, 0.7);
      pen.line([[-6.2, 1.8], [18.6, 1.8]], 0.3, 0.0);
    }
  }
}
function drawArmPrint(pen, d, which) {
  if (which === 'uarm') {
    pen.line([[2.8, 114.4], [1.0, 112.2]], 0.3, 0.7);
    pen.tone([[-6.2, 142], [-6.8, 134], [-5.6, 122], [-4.8, 113], [-3.0, 113], [-3.6, 124], [-4.4, 136]], 0.18);
  } else {
    const W = d.face !== 'M';
    pen.line([[-4.2, 92.6], [4.2, 92.6]], 0.36);
    if (W) pen.tone([[-4.2, 92.6], [4.2, 92.6], [4.4, 96.0], [-4.4, 96.0]], 0.4);
    else pen.ell(-2.4, 91.6, 0.35, 0.35);
    pen.line([[2.7, 82.8], [2.1, 85.6]], 0.3);
    pen.line([[-1.4, 79.4], [0.6, 78.6]], 0.22, 0.6);
  }
}
function drawAccPrint(pen, d) {
  if (d.acc.shape === PONY) {
    pen.tone(PONY, 0.62);
    for (let i = 0; i < 4; i++) pen.line([[-10.6 - i * 0.4, 168.4], [-15.2 - i * 0.6, 163], [-16.4 - i * 0.2, 154.4 + i]], 0.22, 0.7);
    pen.tone([[-9.6, 170.6], [-12.2, 170.2], [-11.6, 166.4], [-9.0, 166.6]], 0.95);
  } else pen.tone(CANE, 0.85);
}

// ---------------------------------------------------------------- geometry
function pieceList(d) {
  const hs = d.headScale ?? 1;
  const head = hs === 1 ? HEADS[d.head] : HEADS[d.head].map(([x, y, c]) => [J.NECK[0] + (x - J.NECK[0]) * hs, J.NECK[1] + (y - J.NECK[1]) * hs, c]);
  const P = [
    { key: 'head', o: head, bone: B.HEAD, z: Z.HEAD, id: 40, kind: 1, cell: 0, pins: [[J.NECK, Z.HEAD, Z.CHEST]] },
    { key: 'chest', o: d.chest, bone: B.CHEST, z: Z.CHEST, id: 40, cell: 5, pins: [[J.SH, Z.CHEST, Z.UARM_R], [J.SH, Z.UARM_L, Z.CHEST]] },
    { key: 'pelvis', o: d.pelvis, bone: B.PELVIS, z: Z.PELVIS, id: 40, cell: 6, pins: [[J.HIP, Z.PELVIS, Z.THIGH_R], [J.HIP, Z.THIGH_L, Z.PELVIS]] },
    { key: 'thigh', o: d.thigh, bone: B.THIGH_R, z: Z.THIGH_R, id: 43, cell: 7, pins: [[J.KN, Z.THIGH_R, Z.SHIN_R, 0.6]] },
    { key: 'thigh', o: d.thigh, bone: B.THIGH_L, z: Z.THIGH_L, id: 44, cell: 7, pins: [[J.KN, Z.SHIN_L, Z.THIGH_L, 0.6]] },
    { key: 'shin', o: d.shin, bone: B.SHIN_R, z: Z.SHIN_R, id: 43, cell: 8, tab: 1 },
    { key: 'shin', o: d.shin, bone: B.SHIN_L, z: Z.SHIN_L, id: 44, cell: 8, tab: -1 },
    { key: 'uarm', o: d.uarm, bone: B.UARM_R, z: Z.UARM_R, id: 41, cell: 9, pins: [[J.EL, Z.UARM_R, Z.FARM_R, 0.6]] },
    { key: 'uarm', o: d.uarm, bone: B.UARM_L, z: Z.UARM_L, id: 42, cell: 9, pins: [[J.EL, Z.FARM_L, Z.UARM_L, 0.6]] },
    { key: 'farm', o: d.farm, bone: B.FARM_R, z: Z.FARM_R, id: 41, cell: 10 },
    { key: 'farm', o: d.farm, bone: B.FARM_L, z: Z.FARM_L, id: 42, cell: 10 },
  ];
  if (d.skirt) P.push({ key: 'skirt', o: SKIRTS[d.skirt], bone: B.SKIRT, z: Z.SKIRT, id: 46, cell: 11 });
  if (d.acc) P.push({ key: 'acc', o: d.acc.shape, bone: B.ACC, z: d.acc.parent === 'head' ? Z.ACC : Z.FARM_R + 0.7, id: d.acc.parent === 'head' ? 40 : 41, cell: 12 });
  for (const p of P) p.pts = sampleCurve(p.o, true, d.step ?? 1.5);
  return P;
}
function bbox(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; }
const GRID = 4;
function cellXform(p, A) {
  const cs = A / GRID, col = p.cell % GRID, row = Math.floor(p.cell / GRID);
  const b = bbox(p.pts), w = b.x1 - b.x0, h = b.y1 - b.y0, k = (cs * 0.92) / Math.max(w, h);
  const ox = col * cs + (cs - w * k) / 2, oy = row * cs + (cs - h * k) / 2;
  return { k, ox, oy, b, px: (x, y) => [ox + (x - b.x0) * k, oy + (b.y1 - y) * k] };
}

function buildDesign(name) {
  const d = DESIGNS[name];
  const A = d.atlas ?? 1024;
  const pieces = pieceList(d);
  // ---- atlas
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = A; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, A, A); return c; };
  const ci = mk(), ct = mk();
  const gi = ci.getContext('2d'), gt = ct.getContext('2d');
  const pen = new Pen(gi, gt);
  const done = new Set();
  const headP = pieces[0];
  const drawCell = (p, cell, fn) => {
    const X = cellXform({ ...p, cell }, A);
    for (const g of [gi, gt]) {
      g.save(); g.setTransform(X.k, 0, 0, -X.k, X.ox - X.b.x0 * X.k, X.oy + X.b.y1 * X.k);
      g.beginPath(); g.moveTo(p.pts[0][0], p.pts[0][1]); for (const q of p.pts) g.lineTo(q[0], q[1]); g.closePath(); g.clip();
    }
    fn();
    gi.restore(); gt.restore();
  };
  FACES.forEach((f, i) => drawCell(headP, i, () => drawHeadPrint(pen, d, f)));
  for (const p of pieces.slice(1)) {
    if (done.has(p.cell)) continue; done.add(p.cell);
    drawCell(p, p.cell, () => {
      if (p.key === 'chest') drawChestPrint(pen, d);
      else if (p.key === 'skirt') drawSkirtPrint(pen, d);
      else if (p.key === 'pelvis' || p.key === 'thigh' || p.key === 'shin') drawLegPrint(pen, d, p.key);
      else if (p.key === 'uarm' || p.key === 'farm') drawArmPrint(pen, d, p.key);
      else if (p.key === 'acc') drawAccPrint(pen, d);
    });
  }
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = A;
  const ga = atlas.getContext('2d');
  const di = gi.getImageData(0, 0, A, A).data, dt = gt.getImageData(0, 0, A, A).data;
  const img = ga.createImageData(A, A), o = img.data;
  for (let i = 0; i < o.length; i += 4) { o[i] = di[i]; o[i + 1] = dt[i]; o[i + 2] = 0; o[i + 3] = 255; }
  ga.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(atlas);
  tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  // ---- geometry: extruded pieces, pins, foot tabs
  const pos = [], nrm = [], uv = [], aBone = [], aId = [], aKind = [], aEdge = [];
  const push = (g, p, kind, edgeOf, uvOf) => {
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos.push(x, y, z); nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      const u = uvOf(x, y); uv.push(u[0], u[1]);
      aBone.push(p.bone); aId.push(p.id); aKind.push(kind); aEdge.push(edgeOf(i));
    }
  };
  for (const p of pieces) {
    const X = cellXform(p, A);
    const uvOf = (x, y) => { const q = X.px(x, y); return [q[0] / A, q[1] / A]; };
    const shape = new THREE.Shape(p.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    let g = new THREE.ExtrudeGeometry(shape, { depth: TH, bevelEnabled: false, curveSegments: 1, steps: 1 });
    g.translate(0, 0, p.z - TH / 2);
    const capN = g.groups[0] ? g.groups[0].count : 0;
    g = g.index ? g.toNonIndexed() : g;
    push(g, p, p.kind ?? 0, (i) => (i < capN ? 0 : 1), uvOf);
    for (const pin of p.pins ?? []) {
      const [pp, za, zb, r = 0.85] = pin;
      const z0 = Math.min(za, zb) - TH / 2 - 0.22, z1 = Math.max(za, zb) + TH / 2 + 0.22;
      let c = new THREE.CylinderGeometry(r, r, z1 - z0, 10, 1).rotateX(Math.PI / 2).translate(pp[0], pp[1], (z0 + z1) / 2);
      c = c.toNonIndexed();
      push(c, p, 2, () => 0, () => [0, 0]);
    }
    if (p.tab) {
      let t = new THREE.BoxGeometry(24, TH * 0.9, 6.5).translate(6.4, TH * 0.45, p.z + p.tab * (TH / 2 + 3.25)).toNonIndexed();
      push(t, p, 3, () => 0, () => [0.001, 0.001]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aBone', new THREE.Float32BufferAttribute(aBone, 1));
  geo.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(aKind, 1));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(aEdge, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return { d, pieces, geo, tex, atlas };
}

// ---------------------------------------------------------------- shaders
const VS_HEAD = /* glsl */ `
attribute float aBone; attribute float aRow; attribute float aEdge; attribute float aKind; attribute float aId;
flat varying float vRow; flat varying float vKind; flat varying float vId; flat varying float vPx; varying vec2 vXY; varying float vEdge;
mat4 boneM(int r, int i){
  vec4 a = texelFetch(uBones, ivec2(i, r), 0), b = texelFetch(uBones, ivec2(i + 1, r), 0), c = texelFetch(uBones, ivec2(i + 2, r), 0);
  return mat4(a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0);
}
`;
const VS_SKIN = /* glsl */ `
  int r = int(aRow + 0.5);
  vRow = aRow; vKind = aKind; vId = aId; vXY = pos.xy; vEdge = aEdge;
  mat4 Bm = boneM(r, 3 + 3 * int(aBone + 0.5));
  pos = (Bm * vec4(pos, 1.0)).xyz; nrm = mat3(Bm) * nrm;
  vec4 P1 = texelFetch(uBones, ivec2(1, r), 0);
  float yy = pos.y / ${UH.toFixed(1)};
  float sn = sin(yy * 7.0 + P1.z), cs = cos(yy * 7.0 + P1.z);
  pos.z += P1.x * yy * yy + P1.y * sn * yy;
  float dzdy = (2.0 * P1.x * yy + P1.y * (cs * 7.0 * yy + sn)) / ${UH.toFixed(1)};
  nrm.y -= dzdy * nrm.z;
  mat4 Fm = boneM(r, ${3 + 3 * NB});
  pos = (Fm * vec4(pos, 1.0)).xyz; nrm = mat3(Fm) * nrm;
  {
    vec4 fo = viewMatrix * (modelMatrix * vec4(Fm[3].xyz, 1.0));
    float fsz = length(Fm[0].xyz) * ${UH.toFixed(1)} * length(modelMatrix[0].xyz);
    vPx = fsz / max(-fo.z, 1e-4) * projectionMatrix[1][1] * uViewH * 0.5;
  }
`;
const FS_HEAD = /* glsl */ `
flat varying float vRow; flat varying float vKind; flat varying float vId; flat varying float vPx; varying vec2 vXY; varying float vEdge;
`;
const FS_PAPER = /* glsl */ `
  int r = int(vRow + 0.5);
  vec4 P0 = texelFetch(uBones, ivec2(0, r), 0);
  vec4 P2 = texelFetch(uBones, ivec2(2, r), 0);
  vec3 Vd = normalize(cameraPosition - vWorld);
  if(dot(N, Vd) < 0.0) N = -N;                       // two-sided paper: the normal faces the viewer
  NV = normalize(mat3(viewMatrix) * N);
  vec3 paper = P0.rgb;
  col = paper;
  idOut = vPx < ${SMALL_PX.toFixed(1)} ? ${SMALL_ID.toFixed(1)} : vId;      // seen small: no ink outline (it would eat the figure)
  vec2 uv = vUv;
  if(vKind > 0.5 && vKind < 1.5) uv += vec2(mod(P0.a, ${GRID}.0), floor(P0.a / ${GRID}.0 + 0.001)) / ${GRID}.0;
  vec4 pr = texture(uAtlas, uv);
  float upx = max(length(fwidth(vXY)), 1e-4);         // design units per pixel
  // the dark areas are printed as a 45-degree halftone screen (~0.3 mm cells), averaged once it is too fine to see
  float cell = 1.2;
  vec2 q = mat2(0.7071, 0.7071, -0.7071, 0.7071) * vXY / cell;
  vec2 gq = fract(q) - 0.5;
  float tone = clamp(pr.g, 0.0, 1.0);
  float rad = sqrt(tone) * 0.66;
  float aa = upx / cell;
  float dotm = 1.0 - smoothstep(rad - aa, rad + aa, length(gq));
  float ht = mix(dotm, tone * 0.85, smoothstep(0.15, 0.4, aa));
  // faint rows of newsprint (the sheet the figure was cut from), only when the camera is very close
  vec2 np = vXY / vec2(0.5, 0.95) + vec2(0.0, 0.37);
  float rowi = floor(np.y);
  float word = step(0.3, hash12(vec2(floor(np.x / 4.0 + hash12(vec2(rowi, 1.0)) * 9.0), rowi)));
  float glyph = step(0.42, hash12(floor(np) + 7.0));
  float fy = fract(np.y);
  float news = word * glyph * smoothstep(0.12, 0.22, fy) * (1.0 - smoothstep(0.62, 0.72, fy)) * (1.0 - smoothstep(0.07, 0.16, upx));
  float ink = max(pr.r, ht * 0.92);
  float grain = vnoise(vXY * 1.7) * 0.55 + vnoise(vXY * 6.0) * 0.45;
  col *= 0.9 + 0.14 * grain;
  col *= 1.0 - news * 0.16;
  col = mix(col, uInk, clamp(ink, 0.0, 1.0));
  gloss = 0.1; specTh = 0.988;
  if(vEdge > 0.5){ col = mix(paper, vec3(0.93, 0.87, 0.78), 0.55); ink = 0.0; }        // the cut edge: the paper's pale core
  if(vKind > 1.5 && vKind < 2.5){ col = vec3(0.62, 0.45, 0.18) * (0.85 + 0.3 * vnoise(vXY * 9.0)); gloss = 0.8; specTh = 0.93; specK = 1.15; ink = 0.0; }   // brass split pins
  if(vKind > 2.5){ ink = 0.0; col = paper * 0.92; }                                      // the folded foot tab
  // translucent paper: lit from behind it glows in its own colour (the ink blocks it)
  vec3 Ld = normalize(uLampPos - vWorld);
  float back = smoothstep(0.0, 0.3, -dot(N, Ld)) * (1.0 - vEdge) * step(vKind, 1.5);
  float shB = lampShadow(vWorld, -N);
  float fib = 0.72 + 0.55 * (vnoise(vXY * 0.9 + 3.0) * 0.6 + vnoise(vXY * 3.1) * 0.4);    // fibres: the glow is a little cloudy
  emis += paper * normalize(paper + 0.02) * uLampCol * lampReach(vWorld) * back * shB * P2.y * fib * (1.0 - 0.95 * clamp(ink, 0.0, 1.0));
  // the lit cloth all around bounces warm light onto a figure standing on it (so it reads at any angle to the lamp)
  vec3 gp = vec3(vWorld.x, 0.001, vWorld.z);
  emis += col * uLampCol * lampReach(gp) * lampShadow(gp, vec3(0.0, 1.0, 0.0)) * 0.13 * step(vKind, 2.5) * (1.0 - smoothstep(0.03, 0.12, vWorld.y - uPlaneY));
  // the gold flood's light
  float gold = P2.x;
  col = mix(col, vec3(1.0, 0.7, 0.26) * 0.8, gold * 0.3);
  emis += vec3(1.0, 0.68, 0.24) * gold * (0.18 + 0.4 * vEdge + 0.25 * back);
`;
const FS_SHADOW = /* glsl */ `
  col = vec3(0.0); gloss = 0.0; specK = 0.0; idOut = 2.0;
  float reach = lampReach(vWorld);
  float shL = lampShadow(vWorld, vec3(0.0, 1.0, 0.0));
  int r = int(vRow + 0.5);
  vec3 paper = texelFetch(uBones, ivec2(0, r), 0).rgb;
  emis = uCloth * uAmb + uCloth * uLampCol * reach * shL * (0.05 + 0.06 * paper);
`;

// ---------------------------------------------------------------- pose
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const sgn = (x) => (x < 0 ? -1 : 1);
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// the shocks a figure feels at film time t: hop (units), flutter (rad), fling 0..1, scare 0..1
function shockState(shocks, tq) {
  let hop = 0, flut = 0, fling = 0, bow = 0, scare = 0;
  for (const s of shocks ?? []) {
    const dt = tq - s[0], k = s[1] ?? 1;
    if (dt < 0 || dt > 2.5) continue;
    if (dt < 0.24) hop += k * 8 * Math.sin((Math.PI * dt) / 0.24);
    const e = Math.exp(-dt * 4.2);
    flut += k * 0.3 * e * Math.sin(dt * Math.PI * 2 * 5.5);
    bow += k * 9 * Math.exp(-dt * 6) * Math.sin(dt * Math.PI * 2 * 8.5);
    fling = Math.max(fling, k * Math.exp(-dt * 3.5));
    if (k > 0.2 && dt < 1.1) scare = Math.max(scare, 1);
  }
  return { hop, flut, fling: Math.min(1, fling), bow, scare };
}

// P (the state) -> pose angles, frame matrix (figure units -> root-local metres), params
function solveFigure(d, P, tq, seed, toLocal, out) {
  const scale = (P.scale ?? 1) * (d.child ? 0.62 : 1);
  const show = clamp(P.show ?? 0);
  const dir = P.dir ?? [1, 0];
  let dl = Math.hypot(dir[0], dir[1]) || 1;
  const dx = dir[0] / dl, dz = dir[1] / dl;
  const px = P.pos?.[0] ?? 0, pz = P.pos?.[1] ?? 0;
  const run = clamp(P.run ?? 0), wave = clamp(P.wave ?? 0), down = clamp(P.down ?? 0), dive = clamp(P.dive ?? 0), cower = clamp(P.cower ?? 0), wind = clamp(P.wind ?? 0), hold = clamp(P.hold ?? 0);
  const sh = shockState(P.shocks, tq);
  // walk phase, held on twos (a drawing every ~1/12 s at a normal pace)
  const wq = lerp(1 / 6, 1 / 4, run);
  const walk = Math.floor((P.walk ?? 0) / wq + 1e-6) * wq;
  const moving = (P.walk ?? 0) !== 0 || run > 0 ? 1 : 0;
  const ph = Math.PI * walk;
  const S = Math.sin(ph), Cc = Math.cos(ph);
  const breathe = Math.sin(tq * Math.PI * 2 * 0.27 + seed * 6.28);
  const a = { pelvis: 0.015, waist: -0.02, neck: 0.03, flip: 1, shR: 0.06, elR: 0.2, shL: -0.05, elL: 0.16, hipR: 0, knR: -0.04, hipL: 0, knL: -0.04, acc: 0, skirt: 0, rootX: 0, rootY: 0 };
  const still = 1 - Math.max(moving, run);
  a.hipR += 0.07 * still; a.hipL -= 0.06 * still; a.knL -= 0.05 * still;
  // walk
  const wk = moving * (1 - run);
  a.hipR += wk * 0.34 * S; a.hipL -= wk * 0.34 * S;
  a.knR -= wk * (0.06 + 0.6 * Math.max(0, Cc)); a.knL -= wk * (0.06 + 0.6 * Math.max(0, -Cc));
  a.shR -= wk * 0.3 * S; a.shL += wk * 0.3 * S;
  a.elR += wk * 0.12 * Math.max(0, -S); a.elL += wk * 0.12 * Math.max(0, S);
  a.pelvis -= wk * 0.03; a.waist += wk * 0.02 * Math.sin(2 * ph);
  a.skirt += wk * 0.04 * S;
  // run
  a.hipR += run * (0.12 + 0.72 * S); a.hipL += run * (0.12 - 0.72 * S);
  a.knR -= run * (0.3 + 1.35 * Math.max(0, Cc)); a.knL -= run * (0.3 + 1.35 * Math.max(0, -Cc));
  a.shR += run * (-0.8 * S); a.shL += run * (0.8 * S);
  a.elR += run * 1.45; a.elL += run * 1.45;
  a.pelvis -= run * 0.2; a.waist -= run * 0.12; a.neck += run * 0.2;
  a.skirt += run * (0.1 * S - 0.15);
  // idle: breathing
  a.waist += 0.012 * breathe * (1 - moving); a.shR += 0.015 * breathe; a.shL -= 0.012 * breathe;
  if (d.old) { a.waist -= 0.26; a.neck += 0.2; a.knR -= 0.14; a.knL -= 0.14; a.hipR += 0.1; a.hipL += 0.1; a.shR += 0.3; a.elR += 0.35; }
  a.pelvis -= P.lean ?? 0;
  // the frame (needed to read world targets in the figure's plane)
  const F = new THREE.Matrix4();
  const frame = (hop, rx) => {
    F.makeBasis(_v.set(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dz, 0, dx));
    F.setPosition(px, 0, pz);
    F.multiply(_m4.makeScale(U * scale, U * scale, U * scale));
    F.multiply(_m4.makeTranslation(0, hop, 0));
    if (rx) F.multiply(_m4.makeRotationX(rx));
  };
  frame(0, 0);
  const Finv = F.clone().invert();
  const toFig = (w) => { _v.set(w[0], w[1], w[2]); if (toLocal) _v.applyMatrix4(toLocal); _v.applyMatrix4(Finv); return [_v.x, _v.y, _v.z]; };
  // look: the head tilts on the neck pin; steep looks bend the paper back at the waist; behind him the head turns
  let lookUp = 0;
  if (P.look) {
    const tg = toFig(P.look);
    const fwd = tg[0] - J.HEADC[0], up = tg[1] - J.HEADC[1];
    const m = clamp(fwd / 70, -1, 1);
    a.flip = Math.abs(m) < 0.6 ? 0.42 * sgn(m) : sgn(m);
    const A = Math.atan2(up, Math.max(Math.abs(fwd), 1));
    lookUp = A;
    const nk = clamp(A, -0.5, 0.62);
    const wb = clamp((A - nk) * 0.9, -0.25, 0.42);
    a.neck += nk + clamp(A - nk - wb, 0, 0.3);
    a.waist += wb;
  }
  // wave: the near arm up, the forearm waving
  if (wave > 0) {
    const w = Math.sin(tq * Math.PI * 2 * 1.9 + seed);
    a.shR = lerp(a.shR, 2.25, wave); a.elR = lerp(a.elR, 0.95 + 0.42 * w, wave); a.waist += 0.04 * wave; a.neck += 0.04 * wave;
  }
  // cower: crouched, arms over the head, trembling
  if (cower > 0) {
    const tr = 0.03 * Math.sin(tq * 91.3 + seed);
    a.hipR = lerp(a.hipR, 1.5, cower); a.hipL = lerp(a.hipL, 1.35, cower); a.knR = lerp(a.knR, -2.3, cower); a.knL = lerp(a.knL, -2.2, cower);
    a.pelvis = lerp(a.pelvis, -0.45, cower); a.waist = lerp(a.waist, -0.5 + tr, cower); a.neck = lerp(a.neck, -0.55, cower);
    a.shR = lerp(a.shR, 2.85, cower); a.elR = lerp(a.elR, 1.95, cower); a.shL = lerp(a.shL, 2.6, cower); a.elL = lerp(a.elL, 2.1, cower);
  }
  // shocks fling the arms up and bend the knees
  if (sh.fling > 0) {
    const f = sh.fling;
    a.shR += f * 1.6; a.shL += f * 1.25; a.elR += f * 0.7; a.elL += f * 0.5; a.knR -= f * 0.3; a.knL -= f * 0.2;
  }
  // down (onto his back) and dive (onto his belly): the limbs during the fall and lying
  if (down > 0) {
    const mid = Math.sin(Math.PI * down);
    a.shR += mid * 1.6 + down * 0.9; a.shL += mid * 1.2 + down * 1.4; a.elR += mid * 0.5; a.hipR += mid * 0.6 + down * 0.2; a.knR -= mid * 0.7 + down * 0.3; a.hipL += mid * 0.3; a.neck += mid * 0.4;
  }
  if (dive > 0) {
    a.shR = lerp(a.shR, 2.95, smooth(dive * 1.6)); a.shL = lerp(a.shL, 2.8, smooth(dive * 1.6)); a.elR *= 1 - dive; a.elL *= 1 - dive;
    a.hipR = lerp(a.hipR, -0.25, dive); a.hipL = lerp(a.hipL, -0.1, dive); a.knR = lerp(a.knR, -0.5, dive); a.knL = lerp(a.knL, -0.2, dive); a.neck += 0.3 * dive;
  }
  // wind: arms and the ponytail flutter
  const flap = Math.sin(tq * Math.PI * 2 * 6.3 + seed * 3.0);
  if (wind > 0) {
    // a gust overhead: he ducks and leans into it, the arms come up, everything loose flaps
    const flap2 = Math.sin(tq * Math.PI * 2 * 4.1 + seed * 5.0);
    a.shR += wind * (1.3 + 0.3 * flap); a.elR += wind * (1.1 + 0.2 * flap2); a.shL += wind * (0.9 - 0.25 * flap); a.elL += wind * 0.9;
    a.waist -= wind * (0.22 + 0.07 * flap2); a.neck -= wind * 0.3; a.pelvis -= wind * 0.06; a.knR -= wind * 0.25; a.knL -= wind * 0.2; a.hipR += wind * 0.12;
    a.acc += wind * (0.9 + 0.35 * flap); a.skirt += wind * 0.3 * flap;
  }
  // the ponytail hangs and swings
  a.acc += -0.15 * a.waist - 0.1 * a.neck + run * (0.5 + 0.2 * Math.sin(2 * ph)) + sh.fling * 0.6 + 0.04 * breathe;
  // ---- bones (two passes: legs to plant the feet, then everything else)
  const bones = new Array(NB);
  const build = (rootY) => {
    const root = [1, 0, 0, 1, a.rootX, rootY];
    const PEL = amul(root, arot(J.HIP, a.pelvis));
    const CH = amul(PEL, arot(J.WAIST, a.waist));
    bones[B.PELVIS] = PEL; bones[B.CHEST] = CH;
    bones[B.HEAD] = amul(CH, arot(J.NECK, a.neck * sgn(a.flip), a.flip));
    bones[B.THIGH_R] = amul(PEL, arot(J.HIP, a.hipR)); bones[B.SHIN_R] = amul(bones[B.THIGH_R], arot(J.KN, a.knR));
    bones[B.THIGH_L] = amul(PEL, arot(J.HIP, a.hipL)); bones[B.SHIN_L] = amul(bones[B.THIGH_L], arot(J.KN, a.knL));
    bones[B.SKIRT] = amul(PEL, arot(J.WAIST, a.skirt));
  };
  build(0);
  let minY = 1e9;
  for (const s of [B.SHIN_R, B.SHIN_L]) for (const p of [J.HEEL, J.TOE, [6, 0]]) minY = Math.min(minY, app(bones[s], p)[1]);
  const flight = run * 3.5 * Math.max(0, -Math.cos(2 * ph));
  build(-minY + flight);
  // arms (reach by two-bone IK in the paper's plane)
  const reachArm = (target, side) => {
    const chestAng = aang(bones[B.CHEST]);
    const shp = app(bones[B.CHEST], J.SH);
    const tg = toFig(target);
    let ddx = tg[0] - shp[0], ddy = tg[1] - shp[1], dd = Math.hypot(ddx, ddy);
    dd = clamp(dd, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.4);
    const th = Math.atan2(ddy, ddx);
    const al = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));
    const be = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dd * dd) / (2 * L1 * L2), -1, 1));
    const d1 = th - al;
    const shA = d1 - REST1 - chestAng, elA = be - REST2 + REST1;
    if (side === 'R') { a.shR = shA; a.elR = elA; } else { a.shL = shA; a.elL = elA; }
  };
  if (P.reach) {
    // out of reach: lean toward it a little (the arm then stretches to its limit)
    const tg = toFig(P.reach), shp = app(bones[B.CHEST], J.SH);
    const over = Math.hypot(tg[0] - shp[0], tg[1] - shp[1]) - (L1 + L2) * 0.96;
    if (over > 0) { a.pelvis -= Math.min(0.14, over / 90); build(-minY + flight); }
    reachArm(P.reach, 'R');
  }
  if (P.reachL) reachArm(P.reachL, 'L');
  const CH = bones[B.CHEST];
  bones[B.UARM_R] = amul(CH, arot(J.SH, a.shR)); bones[B.FARM_R] = amul(bones[B.UARM_R], arot(J.EL, a.elR));
  bones[B.UARM_L] = amul(CH, arot(J.SH, a.shL)); bones[B.FARM_L] = amul(bones[B.UARM_L], arot(J.EL, a.elL));
  if (d.acc?.parent === 'head') bones[B.ACC] = amul(bones[B.HEAD], arot(d.acc.pivot, a.acc));
  else if (d.acc) {
    // the cane: held in the near hand, kept near-vertical, long enough to reach the ground
    const h = app(bones[B.FARM_R], J.HAND);
    const k = Math.max(0.3, (h[1] - 0.6) / (J.HAND[1] - 0.6));
    const tilt = 0.1 + 0.08 * Math.sin(ph) * moving;
    bones[B.ACC] = amul(amul([1, 0, 0, 1, h[0], h[1]], arot([0, 0], tilt)), [1, 0, 0, k, -J.HAND[0], -J.HAND[1] * k]);
  }
  else bones[B.ACC] = [0, 0, 0, 0, 0, 0];
  if (!d.skirt) bones[B.SKIRT] = [0, 0, 0, 0, 0, 0];
  // ---- frame: hop, the rock about the foot tab, the fall
  let rx = sh.flut - wind * (0.32 + 0.08 * flap);
  if (show < 1) rx += (1 - smooth(show)) * Math.PI * 0.5;
  frame(sh.hop + Math.sin(Math.PI * Math.min(1, dive * 1.15)) * 26, rx);
  const lie = (k, sgnD, pivot) => {
    const t1 = k * Math.PI * 0.5 + 0.12 * Math.sin(k * Math.PI * 3) * (1 - k), t2 = smooth(k) * Math.PI * 0.5;
    F.multiply(_m4.makeTranslation(pivot[0], 4.6 * smooth(k), 0));
    F.multiply(_m4.makeRotationZ(sgnD * t1));
    F.multiply(_m4.makeRotationY(sgnD * t2));
    F.multiply(_m4.makeTranslation(-pivot[0], 0, 0));
  };
  if (down > 0) lie(down, 1, [Math.min(app(bones[B.SHIN_R], J.HEEL)[0], app(bones[B.SHIN_L], J.HEEL)[0]), 0]);
  else if (dive > 0) lie(dive, -1, [Math.max(app(bones[B.SHIN_R], J.TOE)[0], app(bones[B.SHIN_L], J.TOE)[0]), 0]);
  // ---- expression
  let face = P.face && FACES.includes(P.face) ? P.face : null;
  if (!face) {
    if (hold > 0.45) face = 'smile';
    else if (cower > 0.25 || sh.scare > 0 || down > 0.15 || dive > 0.15 || run > 0.5) face = 'scared';
    else if (lookUp > 0.32 || wind > 0.4) face = 'worried';
    else face = 'calm';
    if (face === 'calm' && (hash(Math.floor(tq * 12), seed) < 0.02 || ((tq * 0.31 + seed) % 1) < 0.035)) face = 'blink';
  }
  out.bones = bones; out.F = F; out.show = show > 0;
  out.face = FACES.indexOf(face);
  out.bow = sh.bow + wind * (10 + 4 * flap) + moving * (1.6 + 2.4 * run) * Math.sin(2 * ph + 0.7);
  out.flapA = wind * 3.5; out.flapP = tq * 40;
  out.gold = clamp(P.gold ?? 0);
  return out;
}

// ---------------------------------------------------------------- the crowd
const CROWD_N = 40;          // a side
const HOMES = { red: [-0.56, -2.02], blue: [0.56, -2.02] };
const AVOID = [[-0.56, -2.02, 0.12], [0.56, -2.02, 0.12], [0, -2.02, 0.12], [-0.9, -2.62, 0.13], [-0.9, -1.37, 0.13], [0.9, -2.62, 0.13], [0.9, -1.37, 0.13]];
const CARDS = [[-0.80, -2.22], [0.80, -2.22]];      // proposal cards: 26 cm along x, 18 cm along z
function placeCrowd() {
  const rng = mulberry32(90210);
  const F = [];
  const ok = (x, z, minD) => {
    for (const [ax, az, r] of AVOID) if (Math.hypot(x - ax, z - az) < r) return false;
    for (const [cx, cz] of CARDS) if (Math.abs(x - cx) < 0.17 && Math.abs(z - cz) < 0.13) return false;
    for (const f of F) if (f.home && Math.hypot(x - f.home[0], z - f.home[1]) < minD) return false;
    return true;
  };
  for (const side of [-1, 1]) {
    const kinds = [];
    // 5 parents with a child, 2 old women, 2 old men, the rest adults
    const adults = ['man', 'fedora', 'beanie', 'bun', 'long', 'man', 'bun', 'fedora', 'long', 'man'];
    for (let i = 0; i < 5; i++) kinds.push({ kind: ['man', 'bun', 'long', 'beanie', 'man'][i], child: i % 2 ? 'girl' : 'boy' });
    kinds.push({ kind: 'oldW' }, { kind: 'oldW' }, { kind: 'oldM' }, { kind: 'oldM' });
    while (kinds.reduce((n, k) => n + (k.child ? 2 : 1), 0) < CROWD_N) kinds.push({ kind: adults[Math.floor(rng() * adults.length)] });
    // clusters along the coast
    const centres = [];
    for (let i = 0; i < 11; i++) centres.push([side * (0.5 + rng() * 0.46), -2.95 + (i + rng() * 0.8) * (2.3 / 11)]);
    let ci = 0;
    for (const k of kinds) {
      let placed = false;
      for (let tries = 0; tries < 400 && !placed; tries++) {
        const c = centres[(ci + Math.floor(tries / 40)) % centres.length];
        const x = clamp(c[0] + (rng() - 0.5) * 0.22, side < 0 ? -1.02 : 0.47, side < 0 ? -0.47 : 1.02);
        const z = clamp(c[1] + (rng() - 0.5) * 0.24, -3.0, -0.6);
        if (!ok(x, z, 0.045)) continue;
        // face roughly toward the sea or along the coast
        const ang = (side < 0 ? 0 : Math.PI) + (rng() - 0.5) * 1.8 + (rng() < 0.3 ? Math.PI : 0);
        const f = { kind: k.kind, side, home: [x, z], dir: [Math.cos(ang), Math.sin(ang)], seed: rng(), speed: k.kind.startsWith('old') ? 0.07 + 0.02 * rng() : 0.12 + 0.06 * rng(), maxRun: 0.45 + 0.4 * rng(), shade: Math.floor(rng() * 4) };
        F.push(f);
        if (k.child) {
          f.speed = 0.11;
          F.push({ kind: k.child, side, parent: f, seed: rng(), shade: Math.floor(rng() * 4) });
        }
        placed = true;
      }
      ci++;
    }
  }
  return F;
}
const KEEP = [[-0.56, -2.02], [0.56, -2.02], [0, -2.02]];
const blocked = (x, z) => KEEP.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 0.13) || CARDS.some(([cx, cz]) => Math.abs(x - cx) < 0.16 && Math.abs(z - cz) < 0.12);
function pathClear(p, d, len) { for (let k = 1; k <= 8; k++) { const s = (len * k) / 8; if (blocked(p[0] + d[0] * s, p[1] + d[1] * s)) return false; } return true; }
function clearLen(p, d, len) { let s = 0; for (let k = 1; k <= 16; k++) { const q = (len * k) / 16; if (blocked(p[0] + d[0] * q, p[1] + d[1] * q)) break; s = q; } return Math.max(0.005, s - 0.01); }
const SHADES = { '-1': ['#b8261e', '#c8382a', '#a82018', '#cc4430'], '1': ['#3e68f0', '#4a76ff', '#3358dc', '#5a84ff'] };
const CHILD_OFF = [17, 5];           // the child: a step ahead, on the parent's right (units of the parent)
const HOLD_PT = [10, 84];            // where parent and child hold hands (parent units)

// the crowd's reaction to the hits: knocked down (stay down), flee (keep running), or flinch and look
function crowdSim(f, hits, t) {
  const st = { mode: 0, p: f.home, d: f.dir, t0: -1e9, hit: null, lookT: -1e9, look: null, tf: 0, dirRun: null, max: f.maxRun };
  const runDist = (s, tt) => {
    const tau = tt - s.tf;
    if (tau <= 0) return 0;
    const raw = tau < 0.3 ? (f.speed * tau * tau) / 0.6 : f.speed * (tau - 0.15);
    return s.max * (1 - Math.exp(-raw / s.max));
  };
  const posAt = (s, tt) => {
    if (s.mode !== 1) return s.p;
    const r = runDist(s, tt);
    return [clamp(s.p[0] + s.dirRun[0] * r, -1.12, 1.12), clamp(s.p[1] + s.dirRun[1] * r, -3.12, 1.2)];
  };
  hits.forEach((h, i) => {
    if (h[2] > t || st.mode === 2) return;
    const cur = posAt(st, h[2]);
    const k = h[3] ?? 1;
    const ddx = cur[0] - h[0], ddz = cur[1] - h[1], dist = Math.hypot(ddx, ddz) || 1e-4;
    const away = [ddx / dist, ddz / dist];
    if (dist < 0.06 * Math.sqrt(k)) {
      Object.assign(st, { mode: 2, p: cur, d: [-away[0], -away[1]], t0: h[2], hit: h });
    } else if (dist < 0.35 * Math.sqrt(k)) {
      if (st.mode === 1) st.max = Math.max(0.05, st.max - runDist(st, h[2]));
      const j = (hash(f.seed * 99, i) - 0.5) * 0.9;
      const c = Math.cos(j), s = Math.sin(j);
      let rd = [away[0] * c - away[1] * s, away[0] * s + away[1] * c];
      // stay on the table: shorten the run to the edge
      let mx = st.mode === 1 ? st.max : f.maxRun;
      const lim = (p, v, lo, hi) => (v > 1e-4 ? (hi - p) / v : v < -1e-4 ? (lo - p) / v : 1e9);
      mx = Math.max(0.02, Math.min(mx, lim(cur[0], rd[0], -1.1, 1.1) - 0.02, lim(cur[1], rd[1], -3.1, 1.2) - 0.02));
      // never come to rest on the protagonists' spots, the meeting point or the proposal cards: turn aside, else stop short
      for (let tryA = 0; tryA < 7; tryA++) {
        const a = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5][tryA];
        const c2 = Math.cos(a), s2 = Math.sin(a);
        const r2 = [rd[0] * c2 - rd[1] * s2, rd[0] * s2 + rd[1] * c2];
        if (pathClear(cur, r2, mx)) { rd = r2; break; }
        if (tryA === 6) mx = clearLen(cur, rd, mx);
      }
      Object.assign(st, { mode: 1, p: cur, dirRun: rd, d: rd, tf: h[2] + 0.06 + 0.14 * hash(f.seed * 7, i), t0: h[2], hit: h, max: mx });
    } else if (dist < 1.4) {
      st.look = [h[0], 0.04, h[1]]; st.lookT = h[2];
    }
  });
  const pos = posAt(st, t);
  const shocks = [];
  for (const h of hits) {
    if (h[2] > t + 0.01) continue;
    const dist = Math.hypot(pos[0] - h[0], pos[1] - h[1]);
    const k = (h[3] ?? 1) * Math.pow(clamp(1 - dist / 1.0), 2);
    if (k > 0.02) shocks.push([h[2] + dist * 0.15, Math.min(1, k * 1.4)]);
  }
  const out = { pos, dir: st.d, shocks, walk: 0, run: 0, down: 0, look: null, face: null };
  if (st.mode === 2) {
    out.down = smooth((t - st.t0) / 0.32);
  } else if (st.mode === 1) {
    const r = runDist(st, t), r2 = runDist(st, t - 0.08);
    const v = (r - r2) / 0.08;
    out.run = clamp(v / 0.09);
    out.walk = r / (out.run > 0.5 ? 0.034 : 0.02);
    // a glance back over the shoulder for some of them
    const tau = t - st.tf;
    if (hash(f.seed, 3) < 0.5 && tau > 0.9 && tau < 1.4) out.look = [st.hit[0], 0.05, st.hit[1]];
    if (v < 0.02 && tau > 1) out.look = [st.hit[0], 0.05, st.hit[1]];
    out.face = 'scared';
  } else if (st.look && t - st.lookT < 3.5) {
    out.look = st.look;
  }
  return out;
}

// a cut-out seen edge-on is a black stick: turn the paper (not the path) so it stays within ~40 deg of facing the camera
function faceCam(d, pos, cam, seed, w = 1) {
  if (!cam || w <= 0) return d;
  let vx = cam[0] - pos[0], vz = cam[2] - pos[1];
  const vl = Math.hypot(vx, vz); if (vl < 1e-5) return d;
  vx /= vl; vz /= vl;
  const dv = d[0] * vx + d[1] * vz, lim = 0.64;
  if (Math.abs(dv) <= lim) return d;
  const px = -vz, pz = vx;
  const dp = d[0] * px + d[1] * pz;
  const sg = Math.abs(dp) > 1e-4 ? Math.sign(dp) : (seed < 0.5 ? -1 : 1);
  const c = Math.sqrt(1 - lim * lim), sv = Math.sign(dv) * lim;
  const nd = [sg * c * px + sv * vx, sg * c * pz + sv * vz];
  const m = [d[0] + (nd[0] - d[0]) * w, d[1] + (nd[1] - d[1]) * w], ml = Math.hypot(m[0], m[1]) || 1;
  return [m[0] / ml, m[1] / ml];
}

// ---------------------------------------------------------------- the module
export function makePaper(ctx = {}) {
  const root = new THREE.Group(); root.name = 'paper';
  const crowd = placeCrowd();
  const NROW = 2 + crowd.length;
  const data = new Float32Array(ROWW * NROW * 4);
  const boneTex = new THREE.DataTexture(data, ROWW, NROW, THREE.RGBAFormat, THREE.FloatType);
  boneTex.minFilter = boneTex.magFilter = THREE.NearestFilter; boneTex.generateMipmaps = false; boneTex.needsUpdate = true;
  const uBones = { value: boneTex };
  const uPlaneY = { value: 0 };
  const uViewH = { value: ctx.engine?.H ?? 1080 };
  const designs = {};
  const meshes = [];
  const rowMeshes = [];
  const kindsUsed = ['red', 'blue', ...new Set(crowd.map((f) => f.kind))];
  const rowsOf = { red: [0], blue: [1] };
  crowd.forEach((f, i) => { f.row = 2 + i; (rowsOf[f.kind] ??= []).push(f.row); });
  const inkC = C('#150c0a');
  for (const name of kindsUsed) {
    const D = buildDesign(name);
    designs[name] = D;
    const rows = rowsOf[name] ?? [];
    if (!rows.length) continue;
    D.geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(new Float32Array(rows), 1));
    const mat = celMaterial({
      color: '#ffffff', id: 40, gloss: 0.1, rim: 0.35, side: THREE.DoubleSide,
      uniforms: { uBones, uViewH, uPlaneY, uAtlas: { value: D.tex }, uInk: { value: inkC } },
      vsHead: VS_HEAD, vertex: VS_SKIN, fsHead: FS_HEAD, pattern: FS_PAPER,
    });
    const m = new THREE.InstancedMesh(D.geo, mat, rows.length);
    for (let i = 0; i < rows.length; i++) m.setMatrixAt(i, new THREE.Matrix4());
    m.frustumCulled = false; m.userData.noShadow = true; m.name = 'paper-' + name;
    root.add(m); meshes.push(m);
    const smat = celMaterial({
      color: '#000000', id: 2, gloss: 0, rim: 0, side: THREE.DoubleSide,
      uniforms: { uBones, uViewH, uPlaneY, uCloth: { value: C('#b4a27f') } },
      vsHead: VS_HEAD + 'uniform vec3 uLampPos;', fsHead: FS_HEAD, pattern: FS_SHADOW,
      vertex: VS_SKIN + /* glsl */ `
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        float kk = (uLampPos.y - uPlaneY) / max(uLampPos.y - wp.y, 1e-4);
        vec3 sp = uLampPos + (wp.xyz - uLampPos) * kk;
        sp.y = uPlaneY;
        pos = (inverse(modelMatrix) * vec4(sp, 1.0)).xyz;
        nrm = vec3(0.0, 1.0, 0.0);
      `,
    });
    smat.polygonOffset = true; smat.polygonOffsetFactor = -1; smat.polygonOffsetUnits = -4;
    const sm = new THREE.InstancedMesh(D.geo, smat, rows.length);
    for (let i = 0; i < rows.length; i++) sm.setMatrixAt(i, new THREE.Matrix4());
    sm.frustumCulled = false; sm.userData.noShadow = true; sm.name = 'paper-shadow-' + name; sm.renderOrder = -1;
    root.add(sm); meshes.push(sm);
    rowMeshes.push({ rows, m, sm });
  }
  const SEED = { red: 0.17, blue: 0.61 };
  const LINE = [];          // bench: one of each design, CN then US
  for (const side of [-1, 1]) for (const kd of CROWD_KINDS) { const f = crowd.find((g) => g.kind === kd && g.side === side); if (f) LINE.push(f); }
  const last = { red: null, blue: null };
  const colRed = C(RED), colBlue = C(BLUE);
  const shadeCols = { '-1': SHADES['-1'].map(C), '1': SHADES['1'].map(C) };
  const _inv = new THREE.Matrix4();

  function writeRow(row, sol, colour, trans = 1) {
    const o = row * ROWW * 4;
    if (!sol || !sol.show) { data.fill(0, o, o + ROWW * 4); return; }
    data[o] = colour.r; data[o + 1] = colour.g; data[o + 2] = colour.b; data[o + 3] = sol.face;
    data[o + 4] = sol.bow; data[o + 5] = sol.flapA; data[o + 6] = sol.flapP % 6.2831853; data[o + 7] = 1;
    data[o + 8] = sol.gold; data[o + 9] = trans; data[o + 10] = 0; data[o + 11] = 0;
    for (let b = 0; b < NB; b++) {
      const m = sol.bones[b], q = o + (3 + 3 * b) * 4;
      data[q] = m[0]; data[q + 1] = m[2]; data[q + 2] = 0; data[q + 3] = m[4];
      data[q + 4] = m[1]; data[q + 5] = m[3]; data[q + 6] = 0; data[q + 7] = m[5];
      const zk = m[0] === 0 && m[1] === 0 ? 0 : 1;
      data[q + 8] = 0; data[q + 9] = 0; data[q + 10] = zk; data[q + 11] = 0;
    }
    const e = sol.F.elements, q = o + (3 + 3 * NB) * 4;
    data[q] = e[0]; data[q + 1] = e[4]; data[q + 2] = e[8]; data[q + 3] = e[12];
    data[q + 4] = e[1]; data[q + 5] = e[5]; data[q + 6] = e[9]; data[q + 7] = e[13];
    data[q + 8] = e[2]; data[q + 9] = e[6]; data[q + 10] = e[10]; data[q + 11] = e[14];
  }

  function update(stIn = {}, t = 0) {
    const st = stIn.paper ?? stIn;
    const tq = onTwos(t);
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    uPlaneY.value = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld).y + 0.00002;
    if (ctx.engine?.H) uViewH.value = ctx.engine.H;
    for (const name of ['red', 'blue']) {
      const P = st.people?.[name];
      const row = name === 'red' ? 0 : 1;
      if (!P || !((P.show ?? 0) > 0)) { writeRow(row, null); last[name] = null; continue; }
      const sol = solveFigure(DESIGNS[name], P, tq, SEED[name], _inv, {});
      writeRow(row, sol, name === 'red' ? colRed : colBlue);
      last[name] = sol;
    }
    const cs = st.crowd ?? {};
    const show = cs.show ?? 0;
    const hits = (cs.hits ?? []).slice().sort((a, b) => a[2] - b[2]);
    const lineup = cs.lineup ?? null;   // bench only: all the designs in a row
    const sims = new Map();
    crowd.forEach((f, i) => {
      if (!(show > 0)) { writeRow(f.row, null); return; }
      const d = DESIGNS[f.kind];
      let P;
      if (lineup) {
        const slot = LINE.indexOf(f);
        if (slot < 0) { writeRow(f.row, null); return; }
        P = { show: 1, pos: [lineup[0] + (slot - (LINE.length - 1) / 2) * 0.03, lineup[1]], dir: [1, 0], look: cs.look ?? null, gold: cs.gold ?? 0, face: cs.face ?? null };
      } else if (f.parent) {
        const ps = sims.get(f.parent);
        const pd = ps.dir, pp = ps.pos;
        const sc = 1;
        const off = [CHILD_OFF[0] * U * sc, CHILD_OFF[1] * U * sc];
        const pos = [pp[0] + pd[0] * off[0] - pd[1] * off[1], pp[1] + pd[1] * off[0] + pd[0] * off[1]];
        const holdW = [pp[0] + pd[0] * HOLD_PT[0] * U - pd[1] * 3 * U, HOLD_PT[1] * U, pp[1] + pd[1] * HOLD_PT[0] * U + pd[0] * 3 * U];
        P = { show, pos, dir: pd, walk: ps.dist / 0.022, run: ps.run, down: ps.down, shocks: ps.shocks, look: ps.look, face: ps.face, gold: cs.gold ?? 0, reachL: ps.down > 0.05 ? null : holdW };
      } else {
        const s = crowdSim(f, hits, t);
        s.dir = faceCam(s.dir, s.pos, cs.cam, f.seed, 1 - smooth(s.down));
        const dist = s.walk * (s.run > 0.5 ? 0.034 : 0.02);
        const hasChild = crowd[i + 1]?.parent === f;
        let look = s.look ?? (cs.look ?? null);
        const holdW = hasChild && s.down < 0.05 ? [s.pos[0] + s.dir[0] * HOLD_PT[0] * U - s.dir[1] * 3 * U, HOLD_PT[1] * U, s.pos[1] + s.dir[1] * HOLD_PT[0] * U + s.dir[0] * 3 * U] : null;
        P = { show, pos: s.pos, dir: s.dir, walk: s.walk, run: s.run, down: s.down, shocks: s.shocks, look, face: s.face, gold: cs.gold ?? 0, reach: holdW };
        sims.set(f, { ...s, dist, look });
      }
      const sol = solveFigure(d, P, tq, f.seed, _inv, {});
      writeRow(f.row, sol, shadeCols[f.side][f.shade], 0.85);
    });
    boneTex.needsUpdate = true;
    for (const { rows, m, sm } of rowMeshes) { const on = rows.some((r) => data[(r * ROWW + 1) * 4 + 3] > 0); m.visible = sm.visible = on; }
  }

  // world points of the last pose
  const toWorld = (sol, bone, p, out) => {
    const m = sol.bones[bone];
    const q = app(m, p);
    out.set(q[0], q[1], (bone === B.UARM_R || bone === B.FARM_R) ? Z.FARM_R : 0);
    out.applyMatrix4(sol.F);
    return out.applyMatrix4(root.matrixWorld);
  };
  function headWorld(name, out = new THREE.Vector3()) { const s = last[name]; if (!s) return out.set(...(HOMES[name] ? [HOMES[name][0], HEIGHT * 0.9, HOMES[name][1]] : [0, 0, 0])); return toWorld(s, B.HEAD, J.HEADC, out); }
  function handWorld(name, side = 'R', out = new THREE.Vector3()) {
    const s = last[name]; if (!s) return out.set(0, 0, 0);
    const R = side === 'R' || side === 'front';
    return toWorld(s, R ? B.FARM_R : B.FARM_L, J.HAND, out);
  }
  function footWorld(name, out = new THREE.Vector3()) { const s = last[name]; if (!s) return out.set(0, 0, 0); return toWorld(s, B.SHIN_R, [6, 0], out); }

  // ---------------------------------------------------------------- the card picture (6-06)
  function pairPicture(g, x, y, w, h) {
    const sols = {};
    // the two of them in figure units, facing each other, holding hands at the middle
    const gap = 50;
    for (const [name, sx] of [['red', -1], ['blue', 1]]) {
      const P = { show: 1, pos: [0, 0], dir: [1, 0], hold: 1 };
      // reach: in this flat drawing the target is at (gap/2, 86) of each figure's own frame
      const Pr = { ...P, reach: [(gap / 2) * U, 86 * U, 0] };
      sols[name] = solveFigure(DESIGNS[name], Pr, 0.5, SEED[name], null, {});
      sols[name].sx = sx;
    }
    const figH = 182, figW = gap + 60;
    const k = Math.min((h * 0.8) / figH, (w * 0.86) / figW);
    const cx = x + w / 2, by = y + h * 0.86;
    g.save();
    // the sea under their feet: a few engraved wave lines
    g.strokeStyle = 'rgba(40,28,20,0.75)'; g.lineWidth = Math.max(1, h * 0.006); g.lineCap = 'round';
    for (let r = 0; r < 3; r++) {
      const yy = by + h * (0.025 + r * 0.032), n = 5 - r;
      for (let i = 0; i < n; i++) {
        const xx = cx + (i - (n - 1) / 2) * w * 0.15 + (r % 2) * w * 0.04;
        g.beginPath(); g.arc(xx, yy + w * 0.03, w * 0.045, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
      }
    }
    const order = [['red', 'body'], ['blue', 'body'], ['red', 'arm'], ['blue', 'arm']];
    for (const [name, part] of order) {
      const D = designs[name], sol = sols[name];
      const paper = name === 'red' ? CARD_RED : CARD_BLUE;
      const s = sol.sx;               // red stands on the left facing right; blue mirrored on the right
      const base = [k * -s, 0, 0, -k, cx + s * k * (gap / 2) * 1, by];
      // pieces back to front (seen from the figure's right side)
      const pcs = D.pieces.slice().sort((a, b) => a.z - b.z).filter((p) => (part === 'arm') === (p.bone === B.UARM_R || p.bone === B.FARM_R));
      for (const p of pcs) {
        const m = amul(base, sol.bones[p.bone]);
        g.save();
        g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const path = () => { g.beginPath(); g.moveTo(p.pts[0][0], p.pts[0][1]); for (const q of p.pts) g.lineTo(q[0], q[1]); g.closePath(); };
        // pasted paper: a soft shadow, the paper, then its print, then a fine ink edge
        g.shadowColor = 'rgba(30,16,10,0.45)'; g.shadowBlur = h * 0.006; g.shadowOffsetX = h * 0.003; g.shadowOffsetY = h * 0.003;
        path(); g.fillStyle = paper; g.fill();
        g.shadowColor = 'transparent';
        g.save(); path(); g.clip();
        const pen = new Pen(g, g, { ink: '#160c0a', paper, tone: (v) => `rgba(22,12,10,${(v * 0.6).toFixed(3)})` });
        const expr = 'smile';
        if (p.key === 'head') drawHeadPrint(pen, D.d, expr);
        else if (p.key === 'chest') drawChestPrint(pen, D.d);
        else if (p.key === 'skirt') drawSkirtPrint(pen, D.d);
        else if (p.key === 'pelvis' || p.key === 'thigh' || p.key === 'shin') drawLegPrint(pen, D.d, p.key);
        else if (p.key === 'uarm' || p.key === 'farm') drawArmPrint(pen, D.d, p.key);
        else if (p.key === 'acc') drawAccPrint(pen, D.d);
        g.restore();
        path(); g.lineWidth = 0.55; g.strokeStyle = 'rgba(22,12,10,0.9)'; g.stroke();
        g.restore();
      }
    }
    g.restore();
  }

  return { root, update, HEIGHT, headWorld, handWorld, footWorld, pairPicture, FACES, _designs: designs, _crowd: crowd };
}
