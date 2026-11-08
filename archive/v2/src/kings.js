// JOKERS WILD — the ten kings: heavy seated court-card statues in high-backed chairs.
// Painted chess-piece busts: a flat, gently curved face plane with a sculpted nose ridge, the features PAINTED in the
// shader in Paris-pattern court-card style (bold ink lines, almond eyes with clear whites and dark irises, strong arched
// brows, the mouth always readable), sculpted moustaches, curled beards and rolled side curls under the crown.
// Rigid sculpted robes, an ermine collar, a chain of office with the company medallion, a crown with the logo plate.
// Arms are rigid sleeves solved by two-bone IK; bare hands with posed fingers (rest, point, fist, open, hold).
//
// v2: every king wears a half-mask (forehead to cheekbones) in his company's brand shape and colours: lacquer and enamel
// with a worn gilt / enamel edge, the brand mark inlaid, holes for the eyes, and a hinged brow plate over each eye that
// acts the brows (the painted brows are gone). Masks keep their colour in the noir grade (material ids 38 / 39).
//
// Frames: a king's local +z faces the table, +y up, local +x is the king's LEFT.
// API (see docs/INTERFACES.md, docs/PRODUCTION.md):
//   makeKings(ctx) -> { root, kings, update(st, t), handFrame(id, side), handWorld(id, side, out), headWorld(id, out),
//                       shoulderWorld(id, side, out), mouthFrame(id), restHand(id, side) -> [x,y,z], aim(id, p),
//                       bodyFrame(id, out), headFrame(id, out), eyeFrame(id, side, out), maskFrame(id, out),
//                       crownTop(id, out), cardFrame(id, out), cardSize(id) -> [w, h] }
//   Every frame is rigid (no scale) in world space; its origin follows the king's size.
//   maskFrame: origin at the centre of the mask's face (between and a little above the eyes), +z out of the face, +y up.
//   st.kings[id] = { enter,                                        // 0..1 (default 1): 0 = not drawn (king and chair);
//                                                                  //   0..1 slides in with his chair from ENTER_DX m further out
//                                                                  //   (decelerating; he lurches forward and back over 0.8..1)
//                    size,                                         // 0.85..1.5 (default 1): scale about the seat point on the
//                                                                  //   floor; the chair scales only up to 1.1 (he overflows it)
//                    rise,                                         // 0..1 half-standing: lifts 0.22 m, pitches 0.55 rad forward
//                                                                  //   (adds to lean); the robe's skirt stays down; rest hands reach
//                                                                  //   the middle of his half of the table
//                    sweat,                                        // 0..1 beads and runs on the face and the mask, damp sheen
//                    crownTilt,                                    // rad, roll of the crown (askew, resting on one side)
//                    lean, turn, slump, blown,                     // body: rad forward, rad yaw, m down, 0..1 thrown back
//                    head: { yaw, pitch, roll } | look: [x,y,z],   // head angles (rad) or a world point to look at
//                    face: { eyes, brows, mouth, look: [x,y], socket, pupil },
//                    hand: { L, R },                               // 'rest' | 'point' | 'fist' | 'open' | 'hold'
//                    armL / armR: { target: [x,y,z] | null, pole: [x,y,z] (elbow direction), palm: [x,y,z] (palm normal) },
//                    crownGlow: 0..1 (Google's red gem), plateFlip: 0..1 (xAI's crown plate turns to SpaceXAI),
//                    flat: 0..1,                                   // pressed into a card (cardFrame): animate it linearly over
//                                                                  //   ~0.3 s; the module shapes the "pfft": paper-thin by 0.4, then
//                                                                  //   a ~12% spread that settles by 1; above 0.42 the robe below the seat is cut
//                    cardAt: Matrix4 | null }                      // world matrix that carries the pressed card (its centre)
//   face.eyes:  open narrow wide closed side down glare shut      face.brows: flat angry worried raised arch (the brow plates)
//   face.mouth: flat smirk grin open grit o frown laugh scream     face.look: [x, y] -1..1 (x > 0: toward the king's left)
//   face.socket: 0..1 lid shading (never black)                   face.pupil: 0..1 dilation (default by expression)
//   Dozing: slump > 0.02 with eyes 'shut' (or 'closed') draws relaxed sleeping lids, drooped brow plates and slow breathing.
import * as THREE from 'three';
import { celMaterial, glowMaterial, C } from './materials.js';
import { lathe, sectionLoft, superEllipsoid, surface, tube, roundBox, sgnPow, TAU } from './geom.js';
import { KINGS, SEAT, FLOOR_Y, ENTER_DX, seatPos, seatYaw } from './layout.js';
import { drawLogo, drawWordmark } from './logos.js';

export const KING_SCALE = 1.22;
const SEAT_H = SEAT.Y - FLOOR_Y;                         // seat surface above the floor (fixed by the chair)
const EYES = ['open', 'narrow', 'wide', 'closed', 'side', 'down', 'glare', 'shut'];
const BROWS = ['flat', 'angry', 'worried', 'raised', 'arch'];
const MOUTHS = ['flat', 'smirk', 'grin', 'open', 'grit', 'o', 'frown', 'laugh', 'scream'];
const HANDS = ['rest', 'point', 'fist', 'open', 'hold'];
export const EXPRESSIONS = { eyes: EYES, brows: BROWS, mouth: MOUTHS, hand: HANDS };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// per company: robe (muted, they are statues), lining/trim, crown kind, metal, hair, logo plate
const STYLE = {
  openai:    { robe: '#26262a', trim: '#cfd2d6', crown: 'tall', metal: '#d4d6da', hair: '#6e6a64', plate: '#141414' },
  anthropic: { robe: '#7a4a37', trim: '#d8c3a5', crown: 'leaf', metal: '#c9a25e', hair: '#a8957c', plate: '#efe6d8' },
  google:    { robe: '#cfc8bb', trim: '#4a5f8f', crown: 'gems', metal: '#c9a25e', hair: '#3a332c', plate: '#f4f1ea' },
  xai:       { robe: '#18181b', trim: '#8e9096', crown: 'spike', metal: '#5b5e66', hair: '#1a1918', plate: '#0b0b0d' },
  meta:      { robe: '#2d4a7c', trim: '#c9cfd9', crown: 'balls', metal: '#c9a25e', hair: '#6a5442', plate: '#f2f4f8' },
  deepseek:  { robe: '#344a86', trim: '#d6cba8', crown: 'fin', metal: '#c9a25e', hair: '#d9d4ca', plate: '#f0f2fb' },
  qwen:      { robe: '#2f3f8a', trim: '#c9c3a8', crown: 'tab', metal: '#c9a25e', hair: '#5a4a3a', plate: '#f2f3fb' },
  kimi:      { robe: '#1d1d22', trim: '#5c7fb8', crown: 'arch', metal: '#8f939c', hair: '#151515', plate: '#16161c' },
  glm:       { robe: '#33363f', trim: '#c9c6ba', crown: 'classic', metal: '#c9a25e', hair: '#8a847a', plate: '#2d2d2d' },
  doubao:    { robe: '#4b3f7a', trim: '#9fd8c8', crown: 'dome', metal: '#c9a25e', hair: '#8c765c', plate: '#f4f2fb' },
};

// per king face: age 0..1 (lines, heavier lids), eye size, eye tilt (cm, outer corner up), lid (heavy upper lid 0..1),
// brow thickness / height, beard and moustache kinds, cheek fullness, nose [length, width], skin, iris, lips
const FACE = {
  openai:    { age: 0.12, eye: 1.06, tilt: 0.18, lid: 0.05, brow: 0.95, browY: 0.15, beard: 'neat', stache: 'curl', cheek: 0.15, nose: [1.0, 0.92], curls: [4, 2.5, -6.2], wide: 0.98, bias: [0, 0.2, 0.08], mbias: [0.02, 0.14], skin: '#ecdcc0' },
  anthropic: { age: 0.6, eye: 0.97, tilt: -0.08, lid: 0.35, brow: 1.15, browY: 0.0, beard: 'full', stache: 'full', cheek: 0.45, nose: [1.02, 1.08], curls: [5, 2.5, -9.6], wide: 1, bias: [0.3, 0.1, -0.12], skin: '#e8d6b8' },
  google:    { age: 0.42, eye: 0.98, tilt: 0.05, lid: 0.2, brow: 1.1, browY: 0.1, beard: 'none', stache: 'handlebar', cheek: 0.9, nose: [0.92, 1.15], curls: [4, 2.7, -6], wide: 1.06, bias: [0.18, 0.18, 0.12], skin: '#ead7b8' },
  xai:       { age: 0.32, eye: 0.95, tilt: 0.28, lid: 0.3, brow: 1.0, browY: -0.1, beard: 'goatee', stache: 'points', cheek: 0.0, nose: [1.08, 0.9], curls: [4, 2.2, -5.6], wide: 0.95, bias: [-0.28, 0, 0.18], mbias: [-0.06, 0.1], skin: '#e6d6bc' },
  meta:      { age: 0.04, eye: 1.08, tilt: 0.02, lid: 0.0, brow: 0.8, browY: 0.2, beard: 'none', stache: 'none', cheek: 0.3, nose: [0.9, 0.95], curls: [3, 2.3, -3.2], wide: 0.98, bias: [0.22, 0.28, 0.2], mbias: [0.14, 0.14], skin: '#eedfc6' },
  deepseek:  { age: 0.9, eye: 0.94, tilt: 0.12, lid: 0.55, brow: 1.25, browY: 0.05, beard: 'fork', stache: 'droop', cheek: 0.2, nose: [1.08, 1.0], curls: [6, 2.35, -13.5], wide: 0.97, bias: [0.05, 0, -0.18], skin: '#e4d3b6' },
  qwen:      { age: 0.5, eye: 0.98, tilt: 0.1, lid: 0.25, brow: 1.2, browY: -0.05, beard: 'square', stache: 'full', cheek: 0.5, nose: [1.0, 1.1], curls: [5, 2.4, -9.4], wide: 1.03, bias: [-0.05, -0.18, -0.05], mbias: [-0.08, -0.08], skin: '#e8d5b6' },
  kimi:      { age: 0.15, eye: 1.03, tilt: 0.22, lid: 0.1, brow: 0.85, browY: 0.15, beard: 'soul', stache: 'pencil', cheek: 0.1, nose: [0.98, 0.88], curls: [3, 2.2, -3.6], wide: 0.94, bias: [-0.05, 0.3, 0.1], skin: '#ecdcc2' },
  glm:       { age: 0.5, eye: 0.97, tilt: 0.0, lid: 0.3, brow: 1.05, browY: 0.0, beard: 'vandyke', stache: 'points', cheek: 0.25, nose: [1.05, 1.0], curls: [4, 2.4, -7], wide: 1, bias: [0, 0, 0], skin: '#e7d6ba' },
  doubao:    { age: 0.3, eye: 1.0, tilt: 0.1, lid: 0.15, brow: 1.05, browY: 0.1, beard: 'round', stache: 'full', cheek: 1.0, nose: [0.9, 1.12], curls: [4, 2.7, -7.6], wide: 1.08, bias: [0.15, 0.15, 0.05], mbias: [0.08, 0.08], skin: '#ecd9bc' },
};

// ---------------------------------------------------------------- face layout (head-local centimetres at scale 1)
const HEAD = { a: 9.3, b: 13.4, c: 10.4, p: 2.3, q: 3.2 };
const EYE_X = 3.55, EYE_Y = 1.7, MOUTH_Y = -6.35;
// the face plane: a gently curved front (z in cm) and the soft relief painted chess pieces have
function faceZ(x, y, F) {
  const ax = Math.abs(x);
  const G = (d2) => Math.exp(-d2);
  let z = 8.9 - 0.038 * x * x - 0.013 * Math.max(0, y - 3.8) ** 2 - 0.012 * Math.max(0, -y - 5) ** 2;
  z += 0.22 * G(((y - 4.2) / 1.0) ** 2) * sstep(7.5, 4.5, ax);                               // brow ridge
  z += 0.3 * (0.7 + 0.6 * F.cheek) * G(((ax - 4.9) / 2.3) ** 2 + ((y + 1.4) / 2.3) ** 2);    // cheeks
  z += 0.1 * G(((ax - EYE_X) / 1.7) ** 2 + ((y - EYE_Y) / 0.9) ** 2);                         // the eyeballs under the lids
  z += 0.32 * G((x / 3.0) ** 2 + ((y - MOUTH_Y) / 1.7) ** 2);                                  // the muzzle
  z += 0.38 * G((x / 2.6) ** 2 + ((y + 10.3) / 1.6) ** 2);                                     // chin
  return z;
}

// ---------------------------------------------------------------- expressions -> shader parameters (cm, eye space: x toward the temple)
// eyes: hu/hl upper/lower lid heights, cut: a straight heavy lid line y = cut + cutS * u (u -1 inner .. 1 outer corner),
// bow: closed-lid curve (+ arched like ^, - hanging like a smile), shut: squeezed wrinkles, ir: iris radius, ix/iy: iris offset,
// crease: lid crease height, pupil: default dilation
const EYE_SHAPES = {
  open:   { hu: 0.86, hl: 0.6, ir: 0.86, iy: 0.03, crease: 1.4, pupil: 0.38 },
  narrow: { hu: 0.86, hl: 0.44, cut: 0.2, cutS: 0.06, ir: 0.84, iy: -0.1, crease: 1.15, pupil: 0.34 },
  wide:   { hu: 1.34, hl: 1.0, ir: 0.72, iy: 0.04, crease: 1.85, pupil: 0.16, tilt: -0.05 },
  closed: { hu: 0, hl: 0, bow: 0.2, crease: 1.1 },
  side:   { hu: 0.82, hl: 0.52, cut: 0.48, ir: 0.82, iy: -0.02, crease: 1.35, pupil: 0.34 },
  down:   { hu: 0.86, hl: 0.52, cut: 0.1, cutS: -0.04, ir: 0.84, iy: -0.42, crease: 1.2, pupil: 0.36, tilt: -0.04 },
  glare:  { hu: 0.9, hl: 0.36, cut: 0.2, cutS: 0.42, ir: 0.78, iy: -0.06, crease: 1.2, pupil: 0.25, tilt: 0.06 },
  shut:   { hu: 0, hl: 0, bow: 0.42, shut: 1, crease: 0.9, tilt: -0.05 },
  sleep:  { hu: 0, hl: 0, bow: -0.34, crease: 0.9, tilt: -0.08 },          // dozing: relaxed lids hanging like ‿
};
// v2: the mask hides the brows, so the eyes and the mouth are drawn bigger and bolder than v1's
const EYE_K = 1.14, EYE_WK = 2.15 / 1.88, MOUTH_K = 1.38;
// brows: quadratic stroke inner p0 -> control c -> outer p2, relative to the eye centre (eye space)
const BROW_SHAPES = {
  flat:    [[-1.95, 2.0], [0.15, 2.75], [2.35, 1.9]],
  angry:   [[-2.15, 0.9], [-0.15, 1.95], [2.35, 2.55]],
  worried: [[-1.95, 2.85], [-0.2, 2.95], [2.25, 1.5]],
  raised:  [[-1.85, 2.95], [0.15, 4.05], [2.45, 3.0]],
  archHi:  [[-1.85, 2.45], [0.25, 4.1], [2.45, 2.65]],
  archLo:  [[-1.95, 1.75], [0.1, 2.2], [2.35, 1.7]],
};
// mouth: W half width, cN/cP corner heights (face -x / +x), bend (+ arched like a frown), ht/hb opening above/below the
// lip line, tt/tb upper/lower teeth, tongue, sq squareness, jaw: the beard drops (cm), smile / frown / chin folds
const MOUTH_SHAPES = {
  flat:   { W: 2.1, cN: 0.0, cP: 0.0, bend: 0.06 },
  smirk:  { W: 2.1, cN: -0.14, cP: 0.46, bend: -0.1, dimP: 1, smile: 0.45 },
  grin:   { W: 2.55, cN: 0.55, cP: 0.55, bend: -0.5, ht: 0.06, hb: 0.88, tt: 0.62, sq: 0.25, jaw: 0.2, smile: 1 },
  open:   { W: 1.45, cN: 0, cP: 0, bend: 0, ht: 0.5, hb: 1.35, tt: 0.24, tongue: 0.45, jaw: 0.6 },
  grit:   { W: 2.3, cN: -0.24, cP: -0.24, bend: 0.12, ht: 0.44, hb: 0.44, tt: 0.44, tb: 0.44, sq: 1, jaw: 0.1, frown: 0.5 },
  o:      { W: 0.75, cN: 0, cP: 0, bend: 0, ht: 0.62, hb: 0.74, jaw: 0.3 },
  frown:  { W: 2.0, cN: -0.62, cP: -0.62, bend: 0.36, chin: 1 },
  laugh:  { W: 2.45, cN: 0.5, cP: 0.5, bend: -0.28, ht: 0.18, hb: 1.95, tt: 0.42, tongue: 0.75, sq: 0.15, jaw: 0.9, smile: 1 },
  scream: { W: 1.75, cN: -0.4, cP: -0.4, bend: 0, ht: 0.95, hb: 2.7, tt: 0.42, tb: 0.34, tongue: 0.8, jaw: 1.8 },
};

// the beard painted on the face plane above the carved one: [top at the centre, top at the sideburns, scallop,
// half-width limit, where it starts to climb] (cm)
const BEARD_PAINT = {
  neat: [-7.3, -3.2, 0.12, 99, 2.2], full: [-7.25, -1.5, 0.26, 99, 1.9], fork: [-7.25, -1.7, 0.24, 99, 1.9],
  square: [-7.25, -1.6, 0.2, 99, 1.9], round: [-7.25, -1.9, 0.28, 99, 1.9],
  goatee: [-7.35, -7.35, 0.08, 1.8, 0], vandyke: [-7.3, -7.3, 0.1, 2.5, 0], soul: [-7.4, -7.4, 0.05, 0.72, 0],
};

// ---------------------------------------------------------------- shared GLSL
// strokes (vertex or fragment shaders)
const STROKE_GLSL = /* glsl */ `
float cov(float d, float aa){ return 1.0 - smoothstep(-aa, aa, d); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 qbz(vec2 a, vec2 c, vec2 b, float t){ float s = 1.0 - t; return s * s * a + 2.0 * s * t * c + t * t * b; }
// a tapered stroke along a quadratic bezier a -> c -> b (half widths w0 at a, w1 at b, fuller in the middle by wm)
float sdStroke(vec2 p, vec2 a, vec2 c, vec2 b, float w0, float w1, float wm){
  float d = 1e5; vec2 pr = a;
  for(int i = 1; i <= 8; i++){
    float t1 = float(i) / 8.0;
    vec2 cu = qbz(a, c, b, t1);
    vec2 pa = p - pr, ba = cu - pr;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float t = (float(i - 1) + h) / 8.0;
    float w = mix(w0, w1, t) + wm * 4.0 * t * (1.0 - t);
    d = min(d, length(pa - ba * h) - w);
    pr = cu;
  }
  return d;
}
`;
const SDF = /* glsl */ `
// carved curls in rows, in face centimetres: x = ink 0..1, y = shade multiplier
vec2 curlTex(vec2 f, float px){
  vec2 g = vec2(f.x / 1.75, f.y / 1.5);
  g.x += 0.5 * mod(floor(g.y), 2.0);
  vec2 cc = fract(g) - 0.5;
  float cr = length(cc);
  float can = atan(cc.y, cc.x * (f.x < 0.0 ? -1.0 : 1.0));
  float csp = abs(fract(can / 6.2832 + cr * 2.3) - 0.5) / 2.3;
  float ink = (1.0 - smoothstep(0.026, 0.055, csp)) * step(cr, 0.44) * smoothstep(0.55, 1.1, 0.07 / px);
  float shade = 0.86 + 0.32 * clamp(0.45 - cr, 0.0, 0.45) + 0.1 * cc.y;
  return vec2(ink, shade);
}
${STROKE_GLSL}
// a height h (world metres) laid over the surface tilts its normal (surface-gradient bump, screen derivatives)
vec3 bumpN(vec3 N, vec3 P, float h){
  vec3 dpdx = dFdx(P), dpdy = dFdy(P);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - g);
}
// sweat at p (cm, +y up): x = drop cover, y = its highlight, z = a wet run above it, w = the drop's dark refracting rim.
// Teardrops slide down columns at their own speeds (t on twos); 'a' 0..1 sets how many cells carry one (more up high);
// px = cm per pixel
vec4 sweatAt(vec2 p, float t, float a, float px){
  vec4 o = vec4(0.0);
  float ah = a * mix(0.45, 1.15, smoothstep(-9.0, 7.0, p.y));
  for(int j = 0; j < 2; j++){
    float fj = float(j);
    vec2 cs = vec2(2.2, 3.3) * (1.0 + 0.4 * fj);
    vec2 g = p / cs + vec2(0.41 * fj, 0.17 * fj);
    float cx = floor(g.x);
    float sp = (0.05 + 0.2 * hash12(vec2(cx, 7.0 + fj))) * smoothstep(0.2, 0.9, a);
    g.y += t * sp;
    vec2 id = floor(g), fr = fract(g) - 0.5;
    if(hash12(id + vec2(13.1 * fj, 3.7)) > ah * 0.5) continue;
    vec2 c = (hash22(id + 1.7 * fj) - 0.5) * vec2(0.4, 0.2);
    vec2 q = (fr - c) * cs;
    float r = (0.24 + 0.2 * hash12(id + 3.3)) * (0.65 + 0.35 * a);
    // a teardrop: round below, drawn up to a point
    float up = max(q.y, 0.0);
    vec2 qq = vec2(q.x * (1.0 + 1.1 * up / r), min(q.y, 0.0) + up * 0.5);
    float d = length(qq) - r;
    float body = 1.0 - smoothstep(-px, px, d);
    float rim = body * smoothstep(-0.32 * r - px, -0.05 * r, d);
    float hl = 1.0 - smoothstep(-px, px, length((q - vec2(-0.3, -0.12) * r) / vec2(0.9, 1.2)) - r * 0.26);
    float run = (1.0 - smoothstep(0.05, 0.05 + px, abs(q.x - 0.03 * sin(q.y * 2.0)))) * step(r * 0.8, q.y) * (1.0 - smoothstep(0.4, cs.y * 0.8, q.y)) * smoothstep(0.3, 0.7, a);
    o = max(o, vec4(body, hl * body, run * (1.0 - body), rim));
  }
  return o;
}
`;
// the eye holes of the mask in face centimetres (both eyes, mirrored): uHoleA = (centre x, centre y, half width, exponent),
// uHoleB = (height above the centre, depth below, tilt (outer corner up), -). Negative inside the hole.
const HOLE_GLSL = /* glsl */ `
float holeSDF(vec2 f){
  vec2 q = vec2(abs(f.x) - uHoleA.x, f.y - uHoleA.y);
  q.y -= uHoleB.z * q.x;
  vec2 r = vec2(uHoleA.z, q.y > 0.0 ? uHoleB.x : uHoleB.y);
  vec2 n = max(abs(q) / r, vec2(1e-4));
  float pe = uHoleA.w;
  vec2 np = pow(n, vec2(pe));
  float s = np.x + np.y;
  float e = pow(s, 1.0 / pe);
  vec2 ge = pow(s, 1.0 / pe - 1.0) * np / n / r;
  return (e - 1.0) / max(length(ge), 1e-3);
}
`;

// The court-card face, painted on the face plane. f: head-local centimetres (scale 1), +y up, +x the king's left.
const FACE_PAT = /* glsl */ `
  vec2 f = vLocal.xy * (100.0 / uS);
  float fz = vLocal.z * (100.0 / uS);
  float front = smoothstep(2.0, 5.0, fz);
  float px = max(length(fwidth(f)), 1e-4);            // cm per pixel
  float aa = px * 0.7;
  vec3 INK = vec3(0.07, 0.055, 0.045);
  float age = uFaceK.x;
  float cu = smoothstep(0.02, 0.007, px);              // extreme close-up: the eye becomes a banknote engraving
  // fine lines only where they are at least ~half a pixel wide; key lines never thinner than ~1 px
  #define THIN(w) smoothstep(0.12, 0.45, (w) / px)
  #define KEEP(w) max((w), px * 0.5)
  // painted modelling: rosy cheeks (a little darker in monochrome), a lighter nose ridge, a little self light
  for(int s = 0; s < 2; s++){
    float sg = s == 0 ? -1.0 : 1.0;
    vec2 c = f - vec2(sg * 4.7, -2.3);
    col = mix(col, col * vec3(0.99, 0.84, 0.8), (0.14 + 0.16 * uFaceK.y) * exp(-dot(c, c) / 3.4) * front);
  }
  col *= 1.0 + 0.06 * exp(-(f.x * f.x) / 0.8) * smoothstep(3.5, -3.0, f.y) * front;
  // engraved shading (court-card woodcut): diagonal hatching toward the face edges, under the nose and brows,
  // in the cheek hollows. Only seen up close; the line weight follows the shade.
  {
    float shd = smoothstep(5.2, 8.2, abs(f.x)) * 0.9;
    shd = max(shd, 0.75 * exp(-pow((abs(f.x) - 5.4) / 1.3, 2.0) - pow((f.y + 4.6) / 1.6, 2.0)));
    shd = max(shd, 0.6 * exp(-pow(f.x / 1.6, 2.0) - pow((f.y + 4.5) / 0.55, 2.0)));
    shd = max(shd, 0.35 * exp(-pow((abs(f.x) - 1.75) / 0.6, 2.0) - pow((f.y - uFaceGeo.y - 1.0) / 0.7, 2.0)));
    shd = max(shd, 0.5 * smoothstep(8.0, 10.5, f.y));
    shd = max(shd, uFaceC.y * 0.7 * smoothstep(-8.4, -11.6, f.y) * smoothstep(0.3, 3.2, abs(f.x)));
    float sp = 0.3;
    vec2 hd = normalize(vec2(1.0, 1.6 * sign(f.x + 1e-4)));
    float hv = abs(fract(dot(f, hd) / sp) - 0.5) * sp;
    float hw = sp * 0.42 * shd;
    col = mix(col, INK, cov(hv - hw, aa) * smoothstep(0.08, 0.25, shd) * smoothstep(0.004, 0.03, hw) * THIN(max(hw, 0.02)) * 0.55 * front * (1.0 - cu));
  }
  col *= 1.0 - 0.06 * cu * vnoise(f * 38.0) - 0.04 * cu * vnoise(f * vec2(5.0, 90.0));   // the painted wood up close
  emis += col * 0.07 * front;
  // the mask sits ~6 mm off the face: the skin seen through its eye holes lies in its shadow near the hole's edge
  float dHole = holeSDF(f);
  float maskSh = smoothstep(-1.15, 0.0, dHole) * (1.0 - smoothstep(1.0, 1.6, dHole));
  col *= 1.0 - 0.72 * maskSh;
  emis *= 1.0 - 0.85 * maskSh;
  if(front > 0.01){
    float lidShade = 0.06 + 0.22 * uSocket;
    float tilt = uEyeA.w;
    // ---------------- eyes
    for(int s = 0; s < 2; s++){
      float sg = s == 0 ? -1.0 : 1.0;
      vec2 q = f - vec2(sg * uFaceGeo.x, uFaceGeo.y);
      q.x *= sg;                                            // eye space: +x toward the temple
      float W = uEyeA.x;
      float u = q.x / W;
      float uc = clamp(u, -1.0, 1.0);
      float base = tilt * uc;
      float bu = (1.0 - uc * uc) * (1.0 - 0.22 * uc);         // upper lid: peaks toward the nose
      float bl = (1.0 - uc * uc) * (1.0 + 0.28 * uc);         // lower lid: lowest toward the temple
      float yU = base + uEyeA.y * bu;
      float yL = base - uEyeA.z * bl;
      float yC = uEyeB.x + uEyeB.y * uc;                       // a heavy lid cuts straight across
      float yT = min(yU, yC);
      float dbu = -2.0 * uc * (1.0 - 0.22 * uc) - 0.22 * (1.0 - uc * uc);
      float slT = (yU < yC ? tilt + uEyeA.y * dbu : uEyeB.y) / W;
      float hasOpen = step(0.03, uEyeA.y + uEyeA.z);
      float open = min(q.y - yL, yT - q.y);
      float mO = smoothstep(-aa * 0.6, aa * 0.6, open) * step(abs(u), 1.0) * hasOpen;
      // the lid and the skin around the eye
      float creaseY = base + uEyeC.x * (1.0 - uc * uc * 0.85);
      float lidZone = smoothstep(-0.05, 0.12, q.y - yT) * smoothstep(0.15, -0.1, q.y - creaseY) * smoothstep(1.2, 0.85, abs(u));
      col *= 1.0 - lidShade * lidZone * hasOpen;
      // sclera: off-white, shaded under the upper lid and toward the corners; a pink inner corner
      vec3 scl = vec3(0.97, 0.955, 0.92);
      scl *= 1.0 - 0.3 * smoothstep(0.42, 0.0, yT - q.y) - 0.14 * smoothstep(0.5, 1.0, abs(u));
      scl = mix(scl, vec3(0.8, 0.55, 0.52), smoothstep(-0.82, -0.97, u) * 0.8);
      vec2 ic = vec2(uIris.x * sg, uIris.y);
      float iR = uIris.z;
      vec2 iq = q - ic;
      float ir = length(iq);
      if(cu > 0.01){
        // the engraved eyeball: fine arcs around the iris, heavier toward the corners and under the lid
        float ev = (ir - iR) / 0.06;
        float ew = 0.1 + 0.32 * smoothstep(0.35, 1.0, abs(u)) + 0.3 * smoothstep(0.5, 0.0, yT - q.y);
        float el = cov(abs(fract(ev) - 0.5) - ew * 0.5, aa / 0.06) * step(0.5, ev);
        scl = mix(scl, scl * 0.45, el * cu * smoothstep(0.3, 0.8, abs(u) + 0.7 * smoothstep(0.5, 0.0, yT - q.y)));
      }
      col = mix(col, scl, mO);
      emis += vec3(0.11, 0.105, 0.1) * mO;
      // iris, pupil, catchlights
      float mI = cov(ir - iR, aa) * mO;
      float det = smoothstep(iR * 0.06, iR * 0.015, px);     // iris detail when it is big on screen
      float ang = atan(iq.y, iq.x * sg);
      float rr = ir / iR;
      vec2 dv = iq / max(ir, 1e-4);
      float fib = vnoise(dv * 9.0 + vec2(rr * 1.5, 3.0)) * 0.6 + vnoise(dv * 31.0 + vec2(5.0, rr * 4.0)) * 0.4;
      float pR = iR * mix(0.28, 0.76, uIris.w);
      vec3 irisC = uIrisCol * (0.8 + 0.85 * det * (fib - 0.45) * smoothstep(pR / iR, pR / iR + 0.15, rr));
      irisC *= 1.0 - 0.6 * smoothstep(0.72, 1.0, rr) * (1.0 - cu);                       // dark limbal ring
      irisC += uIrisCol * 0.55 * det * exp(-pow((ir - mix(pR, iR, 0.3)) / (iR * 0.1), 2.0)) * (1.0 - cu);   // collarette
      if(cu > 0.01){
        // up close the iris is engraved: a lighter ground cut by radial lines, a heavy limbal ring (a banknote eye)
        vec3 irisE = uIrisCol * 2.6 + vec3(0.12, 0.1, 0.08);
        float nR = 96.0;
        float rv = ang * nR / 6.2832 + 0.35 * fib;
        float rl = abs(fract(rv) - 0.5);
        float rw = 0.16 + 0.42 * fib + 0.3 * smoothstep(0.7, 1.0, rr) + 0.25 * smoothstep(pR / iR + 0.25, pR / iR, rr);
        irisE = mix(irisE, INK, cov(rl - rw * 0.5, (px / max(ir, 1e-3)) * nR / 6.2832 * 0.8) * 0.9);
        irisE = mix(irisE, INK, smoothstep(0.84, 0.92, rr));
        irisE = mix(irisE, INK, cov(abs(ir - mix(pR, iR, 0.34)) - 0.012, aa) * 0.85);
        irisC = mix(irisC, irisE, cu);
      }
      // the lid shadow falls on the top of the iris
      irisC *= 1.0 - 0.35 * smoothstep(0.5, 0.0, yT - q.y);
      col = mix(col, irisC, mI);
      col = mix(col, vec3(0.02, 0.016, 0.016), cov(ir - pR, aa) * mO);
      vec2 h1 = ic + vec2(-0.3 * sg, 0.4) * iR;
      float mH = cov(length(q - h1) - iR * 0.15, aa) * mO;
      float mH2 = cov(length(q - ic - vec2(0.32 * sg, -0.38) * iR) - iR * 0.055, aa) * mO * 0.6;
      // a soft reflection of the room in the wet eye (close-ups)
      float arc = exp(-pow((rr - 0.62) / 0.12, 2.0)) * smoothstep(0.2, 0.9, iq.y / iR + 0.3) * smoothstep(0.7, -0.4, iq.x * sg / iR);
      col = mix(col, vec3(0.92), arc * det * 0.22 * mO);
      col = mix(col, vec3(1.0), max(mH, mH2));
      emis += vec3(0.5) * max(mH, mH2);
      gloss *= 1.0 - mO;
      // upper lid: a heavy line with a flick at the outer corner, tapering to the nose
      float wU = KEEP(mix(0.03, 0.19, smoothstep(-0.98, 0.3, u)) * uEyeC.w);
      float dUp = (q.y - yT) / sqrt(1.0 + slT * slT);
      float lineU = cov(abs(dUp - wU * 0.55) - wU, aa) * smoothstep(-1.06, -0.96, u) * step(u, 1.0) * hasOpen;
      float yT86 = min(tilt * 0.86 + uEyeA.y * (1.0 - 0.7396) * (1.0 - 0.1892), uEyeB.x + uEyeB.y * 0.86);
      float flick = sdStroke(q, vec2(W * 0.86, yT86 + 0.05), vec2(W * 1.03, tilt + 0.05), vec2(W + 0.32, tilt + 0.16), wU * 0.85, 0.02, 0.0);
      lineU = max(lineU, cov(flick, aa) * hasOpen);
      col = mix(col, INK, lineU);
      // lower lid: thin, from the middle to the outer corner
      float wL = 0.055;
      float dL = (q.y - yL) / sqrt(1.0 + pow(uEyeA.z * 2.0 * uc / W, 2.0));
      float lineL = cov(abs(dL + wL * 0.4) - KEEP(wL) * 0.8, aa) * smoothstep(-0.55, -0.15, u) * step(u, 1.0) * hasOpen;
      col = mix(col, INK, lineL * 0.85);
      // crease
      float wc = 0.045;
      float lineC = cov(abs(q.y - creaseY) - wc, aa) * smoothstep(-0.8, -0.5, u) * smoothstep(1.0, 0.8, u) * THIN(wc);
      col = mix(col, INK, lineC * 0.7 * step(0.25, creaseY - yT) * hasOpen);
      if(cu > 0.01){
        // contour engraving following the lids: above the eye up to the brow, below toward the cheek
        // the lid curves continue past the corners as gentle arcs so the contours wrap the eye
        float ue = q.x / (W * 1.25);
        float be = exp(-1.6 * ue * ue);
        float tl = tilt * 1.25 * ue * exp(-0.4 * ue * ue);
        float yUe = tl + (uEyeA.y + 0.3) * be * (1.0 - 0.22 * ue * exp(-ue * ue)) - 0.3;
        float yLe = tl - (uEyeA.z + 0.25) * be + 0.25;
        float va = (q.y - yUe) / 0.085;
        float vb = (yLe - q.y) / 0.09;
        float wa = (0.42 - 0.3 * smoothstep(0.0, 22.0, va)) * smoothstep(0.6, 1.4, va);
        float wb = (0.36 - 0.26 * smoothstep(0.0, 14.0, vb)) * smoothstep(0.8, 1.6, vb);
        float span = smoothstep(1.75, 1.15, abs(ue));
        float above = smoothstep(-0.03, 0.03, q.y - 0.5 * (yUe + yLe));
        float ca = cov(abs(fract(va) - 0.5) - wa * 0.5, aa / 0.085) * smoothstep(0.02, 0.08, wa) * smoothstep(26.0, 14.0, va) * span * above;
        float cb = cov(abs(fract(vb) - 0.5) - wb * 0.5, aa / 0.09) * smoothstep(0.02, 0.08, wb) * smoothstep(17.0, 8.0, vb) * span * (1.0 - above);
        col = mix(col, INK, max(ca, cb) * cu * 0.7 * hasOpen);
        // a wet line along the lower lid, fine lashes along the upper lid
        float wet = cov(abs(q.y - (yL + 0.055)) - 0.016, aa) * step(abs(u), 0.85) * mO;
        col = mix(col, vec3(1.0), wet * cu * 0.75);
        emis += vec3(0.3) * wet * cu;
        for(int k = 0; k < 14; k++){
          float lu = -0.35 + 1.32 * float(k) / 13.0;
          float ly = min(tilt * lu + uEyeA.y * (1.0 - lu * lu) * (1.0 - 0.22 * lu), uEyeB.x + uEyeB.y * lu);
          float len = 0.16 + 0.2 * smoothstep(-0.3, 0.75, lu);
          vec2 a0 = vec2(lu * W, ly + 0.08);
          vec2 dir = normalize(vec2(0.12 + 0.95 * max(lu, 0.0), 1.0));
          float dl = sdStroke(q, a0, a0 + dir * len * 0.6, a0 + dir * len + vec2(len * 0.35, -0.03), 0.02, 0.003, 0.0);
          col = mix(col, INK, cov(dl, aa) * cu * hasOpen * uEyeC.y);
        }
      }
      // closed and shut eyes: one bold curved line
      if(hasOpen < 0.5){
        float yCl = base + uEyeB.z * (1.0 - uc * uc) - 0.05;
        float slC = (tilt - 2.0 * uEyeB.z * uc) / W;
        float wCl = KEEP(mix(0.12, 0.17, uEyeB.w));
        float dC = abs(q.y - yCl) / sqrt(1.0 + slC * slC) - wCl * mix(0.55, 1.0, 1.0 - uc * uc);
        col = mix(col, INK, cov(dC, aa) * step(abs(u), 1.04));
        // lashes hanging from a relaxed closed lid
        for(int k = 0; k < 3; k++){
          float lu = 0.25 + 0.3 * float(k);
          vec2 a0 = vec2(lu * W, tilt * lu + uEyeB.z * (1.0 - lu * lu) - 0.1);
          float dl = sdSeg(q, a0, a0 + vec2(0.18 + 0.1 * lu, -0.3)) - 0.035;
          col = mix(col, INK, cov(dl, aa) * THIN(0.04) * (1.0 - uEyeB.w) * step(uEyeB.z, 0.3));
        }
        // squeezed shut: wrinkles fan out from the outer corner, under the eye, at the nose
        if(uEyeB.w > 0.5){
          for(int k = 0; k < 3; k++){
            float an = -0.55 + 0.55 * float(k);
            vec2 o = vec2(W * 1.08, tilt + 0.02);
            vec2 dir = vec2(cos(an), sin(an));
            float dw = sdStroke(q, o + dir * 0.18, o + dir * 0.5, o + dir * 0.85, 0.075, 0.02, 0.0);
            col = mix(col, INK, cov(dw, aa) * 0.9);
          }
          for(int k = 0; k < 2; k++){
            float yy = -0.55 - 0.32 * float(k);
            float dw = sdStroke(q, vec2(-0.55 * W, yy + 0.1), vec2(0.1, yy - 0.12), vec2(0.75 * W, yy + 0.12), 0.05, 0.03, 0.01);
            col = mix(col, INK, cov(dw, aa) * 0.8 * THIN(0.05));
          }
          float din = sdStroke(q, vec2(-W * 1.05, -tilt + 0.05), vec2(-W * 1.3, -tilt + 0.2), vec2(-W * 1.4, -tilt + 0.55), 0.06, 0.02, 0.0);
          col = mix(col, INK, cov(din, aa) * 0.85);
        }
      }
      // age: a bag under the eye, crow's feet
      float yBag = -uEyeA.z * 0.9 - 0.42 - 0.18 * age;
      float dBag = sdStroke(q, vec2(-0.45 * W, yBag + 0.15), vec2(0.15 * W, yBag - 0.12), vec2(0.85 * W, yBag + 0.12 + tilt * 0.6), 0.04, 0.025, 0.0);
      col = mix(col, INK, cov(dBag, aa) * THIN(0.04) * (0.15 + 0.7 * age) * hasOpen * (1.0 - cu));
      for(int k = 0; k < 2; k++){
        float an = -0.35 + 0.5 * float(k);
        vec2 o = vec2(W * 1.32, tilt - 0.05 + 0.15 * float(k));
        float dw = sdSeg(q, o, o + vec2(cos(an), sin(an)) * 0.55) - 0.03;
        col = mix(col, INK, cov(dw, aa) * THIN(0.03) * smoothstep(0.35, 0.8, age) * hasOpen * 0.8);
      }
    }
    // (v2: no painted brows, frown or forehead lines: the mask covers the brow and its plates act it)
    // ---------------- nose: nostril curls on the wings
    for(int s = 0; s < 2; s++){
      float sg = s == 0 ? -1.0 : 1.0;
      vec2 q = vec2(f.x * sg, f.y);
      float nw = uFaceGeo.z;
      float dN = sdStroke(q, vec2(0.35 * nw, -3.9), vec2(1.15 * nw, -4.12), vec2(1.2 * nw, -3.35), 0.05, 0.075, 0.03);
      col = mix(col, INK, cov(dN, aa) * smoothstep(1.2, 0.5, px));
    }
    // ---------------- mouth shape (drawn after the painted beard)
    vec2 m = f - vec2(0.0, uFaceGeo.w);
    float MW = uMouthA.x;
    float mu = m.x / MW;
    float muc = clamp(mu, -1.0, 1.0);
    float yMid = (uMouthA.y + uMouthA.z) * 0.5 + uMouthA.w;
    float yM = mix(uMouthA.y, uMouthA.z, muc * 0.5 + 0.5) + uMouthA.w * (1.0 - muc * muc);
    float slM = ((uMouthA.z - uMouthA.y) * 0.5 - 2.0 * uMouthA.w * muc) / MW;
    float sq = uMouthC.y;
    float envT = pow(max(1.0 - muc * muc, 0.0), mix(0.55, 0.18, sq));
    float envB = pow(max(1.0 - muc * muc, 0.0), mix(0.6, 0.22, sq));
    float yTop = yM + uMouthB.x * envT;
    float yBot = yM - uMouthB.y * envB;
    float isOpen = step(0.05, uMouthB.x + uMouthB.y);
    float inM = min(m.y - yBot, yTop - m.y);
    float mM = smoothstep(-aa * 0.6, aa * 0.6, inM) * step(abs(mu), 1.0) * isOpen;
    float lipBase = isOpen > 0.5 ? yBot : yM;
    float lipH = 0.62 * uFaceK.w;
    float lx = m.x / (MW * 0.78);
    float yLip = lipBase - 0.1 - lipH * pow(max(1.0 - lx * lx, 0.0), 0.6);
    // ---------------- painted beard: the hair growing on the face plane (the carved beard hangs below it)
    if(uBeardP.x > 0.5){
      float ax = abs(f.x);
      float side = smoothstep(uBeardQ.y, 7.8, ax);
      float yb = mix(uBeardP.y, uBeardP.z, pow(side, 1.25));
      // the lower lip and an open mouth push the beard line down
      float lipLow = uFaceGeo.w + (isOpen > 0.5 ? yBot - lipH - 0.6 : -lipH - 0.55);
      float dip = 0.3 * max(1.0 - pow(f.x / (MW + 0.9), 2.0), 0.0);
      yb = min(yb, mix(lipLow - dip, yb, smoothstep(MW * 0.7, MW + 1.1, ax)));
      float sc = uBeardP.w * 1.6 * (0.5 + 0.5 * cos(f.x * 3.3));
      float dEdge = f.y - (yb - sc);
      float wide = smoothstep(uBeardQ.x + 0.3, uBeardQ.x - 0.3, ax);
      float mBd = smoothstep(aa, -aa, dEdge) * wide;
      // curls in rows (the same grid as the carved beard below)
      vec2 cv = curlTex(f, px);
      vec3 bc = mix(uBeardCol * cv.y, INK, cv.x * 0.75);
      col = mix(col, bc, mBd);
      col = mix(col, INK, cov(abs(dEdge + 0.04) - KEEP(0.06), aa) * wide * 0.9);
      emis -= emis * mBd * 0.6;
    }
    // ---------------- lips and mouth
    float mLip = smoothstep(-aa, aa, m.y - yLip) * smoothstep(aa, -aa, m.y - lipBase + 0.06) * step(abs(lx), 1.0);
    col = mix(col, uLipCol, mLip * 0.55);
    float dLipL = abs(m.y - yLip + 0.04) - KEEP(0.05);
    col = mix(col, INK, cov(dLipL, aa) * smoothstep(0.62, 0.2, abs(m.x) / MW) * 0.75);
    // upper lip (only the clean-shaven show it)
    float yUL = yM + (0.38 + 0.1 * uFaceK.w) * pow(max(1.0 - muc * muc, 0.0), 0.5) - 0.13 * exp(-pow(m.x / 0.32, 2.0));
    float mUL = smoothstep(-aa, aa, yUL - m.y) * smoothstep(-aa, aa, m.y - yM) * step(abs(mu), 0.95);
    col = mix(col, uLipCol, mUL * 0.45 * uFaceC.x * (1.0 - isOpen));
    if(isOpen > 0.5){
      // the open mouth: a light lip rim, dark inside, teeth, tongue, a bold outline
      float rimW = max(0.17, px * 0.75);
      float rim = smoothstep(aa, -aa, abs(inM + rimW * 0.5 + 0.04) - rimW * 0.5) * step(abs(mu), 1.08) * (1.0 - mM);
      col = mix(col, uLipCol * 1.12, rim);
      col = mix(col, vec3(0.13, 0.05, 0.045), mM);
      float yTe = yTop - uMouthB.z * envT;
      float mT = mM * smoothstep(-aa, aa, m.y - yTe);
      float mTB = mM * smoothstep(-aa, aa, (yBot + uMouthB.w * envB) - m.y);
      float tgH = max(uMouthC.x, 0.01);
      float mTg = mM * cov(length((m - vec2(0.0, yBot + 0.05)) / vec2(MW * 0.62, tgH)) - 1.0, aa / tgH) * step(0.01, uMouthC.x);
      col = mix(col, vec3(0.62, 0.32, 0.28), mTg * (1.0 - mTB));
      vec3 teeth = vec3(0.95, 0.93, 0.87);
      float gap = abs(fract(m.x / 0.62 + 0.5) - 0.5) * 0.62;
      float sep = cov(gap - 0.03, aa) * THIN(0.03) * 0.8;
      col = mix(col, teeth, max(mT, mTB));
      col = mix(col, INK, max(mT, mTB) * sep);
      emis += vec3(0.06) * max(mT, mTB);
      float dO = abs(inM) / sqrt(1.0 + slM * slM) - KEEP(0.15);
      col = mix(col, INK, cov(dO, aa) * step(abs(mu), 1.02));
    } else {
      // the lip line: fuller in the middle
      float wM = KEEP(mix(0.08, 0.19, 1.0 - muc * muc));
      float dM = abs(m.y - yM) / sqrt(1.0 + slM * slM) - wM;
      col = mix(col, INK, cov(dM, aa) * step(abs(mu), 1.0));
    }
    // corners: small ticks that follow the line (court cards), a dimple on a smirk, smile folds from the nose wings
    for(int s = 0; s < 2; s++){
      float sg = s == 0 ? -1.0 : 1.0;
      float cy = s == 0 ? uMouthA.y : uMouthA.z;
      vec2 mq = vec2(m.x * sg, m.y);
      vec2 cq = vec2(MW, cy);
      float rise = clamp((cy - yMid) * 0.55, -0.24, 0.24);
      float dT = sdStroke(mq, cq + vec2(-0.08, 0.0), cq + vec2(0.16, rise * 0.4), cq + vec2(0.3, rise + 0.01), 0.07, 0.02, 0.0);
      col = mix(col, INK, cov(dT, aa) * THIN(0.06) * 0.85);
      float dim = s == 0 ? uMouthC.z : uMouthC.w;
      float dD = sdStroke(mq, cq + vec2(0.35, 0.55), cq + vec2(0.62, 0.15), cq + vec2(0.45, -0.35), 0.06, 0.03, 0.0);
      col = mix(col, INK, cov(dD, aa) * dim * THIN(0.05));
      vec2 n0 = vec2(1.55 * uFaceGeo.z, -3.75 - uFaceGeo.w);
      float dS = sdStroke(mq, n0, vec2(MW + 1.25, 1.35 - 0.3 * max(cy, 0.0)), vec2(MW + 0.6, cy - 0.75), 0.035, 0.06, 0.02);
      col = mix(col, INK, cov(dS, aa) * THIN(0.045) * clamp(uFold.x + age * 0.55 + 0.1, 0.0, 1.0) * 0.75);
    }
    // chin: a tense crease under a frown
    float dCh = sdStroke(m, vec2(-0.8, -1.55), vec2(0.0, -1.3), vec2(0.8, -1.55), 0.04, 0.04, 0.02);
    col = mix(col, INK, cov(dCh, aa) * uFold.w * THIN(0.04) * 0.8);
  }
  specTh = 0.985;
  // sweat: beads that slide down and catch the lamp, wet runs, a damp sheen
  if(uSweat > 0.0){
    vec4 sw = sweatAt(f, uSweatT, uSweat, px);
    float reach = clamp(lampReach(vWorld), 0.0, 1.5);
    col = mix(col, col * 1.12 + 0.03, (sw.x - sw.w) * 0.6);
    col = mix(col, col * 0.45, sw.w * 0.85);
    col = mix(col, col * 0.72, sw.z * 0.7);
    col = mix(col, vec3(1.0), sw.y);
    emis += vec3(0.9, 0.85, 0.75) * sw.y * (0.4 + 0.6 * reach);
    gloss = mix(gloss, 1.0, max(uSweat * 0.6, max(sw.x, sw.z)));
    specTh = mix(specTh, 0.955, uSweat * 0.8);
  }
`;
// carved hair: wavy strands (the back of the head)
const HAIR_PAT = /* glsl */ `
  vec3 q = vLocal * (100.0 / uS);
  float fw = length(fwidth(q)) + 1e-4;
  float fade = 1.0 - smoothstep(0.15, 0.5, fw);
  float wave = abs(fract(q.x * 0.55 + sin(q.y * 0.45 + q.z * 0.3) * 0.35) - 0.5);
  col *= 1.0 - 0.3 * fade * smoothstep(0.12, 0.02, wave);
  col *= 0.86 + 0.14 * smoothstep(-8.0, 6.0, q.y);
  gloss = 0.35; specTh = 0.985;
`;
// rolled curls (lathe about +y; the +y end cap is the spiral): side curls and beard rolls
const CURL_PAT = /* glsl */ `
  vec3 q = vLocal * (100.0 / uS) / uCurlR;
  float r = length(q.xz);
  float a = atan(q.z, q.x);
  float fw = length(fwidth(q)) + 1e-4;
  float fade = 1.0 - smoothstep(0.08, 0.3, fw);
  float cap = smoothstep(0.35, 0.75, vLocalN.y);
  // a spiral on the end cap, wrapped strands along the barrel
  float sp = abs(fract(a / 6.2832 + r * 2.2) - 0.5) / 2.2;
  float bar = abs(fract(a / 6.2832 * 2.0 + q.y * 0.9) - 0.5);
  float ink = cap * (1.0 - smoothstep(0.035, 0.07, sp)) * step(r, 0.92) * fade;
  ink = max(ink, (1.0 - cap) * (1.0 - smoothstep(0.05, 0.12, bar)) * fade * 0.7);
  col *= 1.0 - 0.75 * ink;
  col *= 0.8 + 0.2 * cap;
  gloss = 0.4; specTh = 0.98;
`;
// beards: rows of carved curls (court-card / Assyrian), each lit from above
const BEARD_PAT = /* glsl */ `
  vec2 f = vLocal.xy * (100.0 / uS);
  vec2 fs = vec2(vLocal.z * (100.0 / uS) * (vLocal.x < 0.0 ? -1.0 : 1.0), f.y);
  float px = max(length(fwidth(f)), 1e-4);
  float side = smoothstep(0.45, 0.85, abs(vLocalN.x));
  vec2 cv = mix(curlTex(f, px), curlTex(fs, px), side);
  col *= cv.y * (0.9 + 0.1 * smoothstep(-24.0, -8.0, f.y));
  col = mix(col, vec3(0.07, 0.055, 0.045), cv.x * 0.75);
  gloss = 0.0;
`;
// moustaches: strands along the tube
const STACHE_PAT = /* glsl */ `
  float fw = length(fwidth(vUv)) + 1e-5;
  float st = abs(fract(vUv.y * 7.0 + vUv.x * 2.0) - 0.5);
  float fade = 1.0 - smoothstep(0.04, 0.12, fw * 7.0);
  col *= 1.0 - 0.35 * fade * smoothstep(0.12, 0.03, st);
  gloss = 0.4; specTh = 0.982;
`;

// robe: vertical folds below the waist (normal bands), a woven border at the hem, a front band
const ROBE_PAT = /* glsl */ `
  if(vLocal.y < uCut) discard;          // pressed into a card: the robe below the seat is gone
  vec3 lp = vLocal / uS;
  float fw = length(fwidth(lp)) + 1e-5;
  float fade = 1.0 - smoothstep(0.004, 0.012, fw);
  float a = atan(lp.x, lp.z - 0.06);
  float skirt = smoothstep(0.08, -0.02, lp.y);
  float fold = sin(a * 9.0 + sin(lp.y * 9.0) * 0.6);
  vec3 tang = normalize(vec3(cos(a), 0.0, -sin(a)));
  N = normalize(N + tang * fold * 0.38 * skirt);
  float drape = sin(lp.x * 26.0 + lp.y * 8.0) * smoothstep(0.08, 0.3, lp.y) * smoothstep(0.62, 0.4, lp.y);
  N = normalize(N + vec3(drape * 0.12, 0.0, 0.0));
  float front = step(0.0, lp.z - 0.02) * (1.0 - smoothstep(0.055, 0.06, abs(lp.x)));
  float hem = 1.0 - smoothstep(0.0, 0.004, lp.y - (uFloorL + 0.07));
  float band = max(front, hem);
  vec2 mq = vec2(a * 3.0, lp.y * 22.0);
  float lozenge = step(abs(fract(mq.x) - 0.5) + abs(fract(mq.y) - 0.5), 0.32) * fade;
  col = mix(col, uTrim, band * 0.9);
  col = mix(col, col * 0.62, band * lozenge * 0.8);
  vec2 g = vec2(a * 4.5, lp.y * 9.0);
  vec2 cell = fract(g) - 0.5;
  float motif = step(abs(cell.x) + abs(cell.y) * 0.7, 0.07) * fade * (1.0 - band);
  col = mix(col, mix(col, uTrim, 0.3), motif * 0.5);
  gloss = 0.15; specTh = 0.99;
`;

// the skirt below the hips keeps hanging straight down to the floor when the torso leans or lifts: uSkirt maps a
// body-local point to where the skirt should be (stretched to the floor, unpitched), blended in below the seat
const SKIRT_VERT = /* glsl */ `
  {
    float b = smoothstep(0.03 * uS, -0.13 * uS, pos.y);
    if(b > 0.0){
      pos = mix(pos, (uSkirt * vec4(pos, 1.0)).xyz, b);
      nrm = normalize(mix(nrm, mat3(uSkirt) * nrm, b));
    }
  }
`;
// ermine: white with black tails
const ERMINE_PAT = /* glsl */ `
  vec2 g = vec2(atan(vLocal.x, vLocal.z) * 5.0, vLocal.y * 60.0);
  vec2 c = fract(g) - 0.5; vec2 id = floor(g);
  c.x += (mod(id.y, 2.0) - 0.5) * 0.5;
  float fw = length(fwidth(g)) + 1e-4;
  float fade = 1.0 - smoothstep(0.25, 0.6, fw);
  float tail = step(abs(c.x) * 2.0 + c.y * 0.6, 0.22) * step(abs(c.y), 0.32);
  col = mix(col, vec3(0.08, 0.07, 0.07), tail * fade);
  float fur = vnoise(vLocal.xy * 900.0) * fade;
  col *= 0.9 + 0.12 * fur;
  gloss = 0.0;
`;

const METAL_PAT = /* glsl */ `
  float fw = length(fwidth(vLocal)) + 1e-5;
  float fade = 1.0 - smoothstep(0.002, 0.008, fw);
  float worn = vnoise(vLocal.xy * 140.0 + vLocal.z * 60.0);
  col *= 0.86 + 0.24 * worn * fade + 0.1 * (1.0 - fade);
  gloss = 0.95; specTh = 0.955;
`;

const WOOD_PAT = /* glsl */ `
  vec3 lp = vLocal;
  float fw = length(fwidth(lp)) + 1e-5;
  float fade = 1.0 - smoothstep(0.003, 0.01, fw);
  float grain = sin((lp.y + vnoise(lp.xz * 9.0) * 0.05) * 160.0);
  col *= 1.0 - 0.18 * fade * smoothstep(0.3, 1.0, grain);
  gloss = 0.5; specTh = 0.982;
`;

// ---------------------------------------------------------------- canvas textures
function logoPlate(id, variant) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const st = STYLE[id];
  const g = x.createRadialGradient(128, 110, 20, 128, 128, 128);
  g.addColorStop(0, st.plate); g.addColorStop(1, shade(st.plate, -0.18));
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 124, 0, TAU); x.fill();
  if (variant === 'spacexai') {
    x.fillStyle = '#f2f2f2';
    x.font = 'bold 44px "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('SPACEX', 128, 112); x.font = 'bold 30px "Helvetica Neue", Arial, sans-serif'; x.fillText('AI', 128, 152);
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 4; x.beginPath(); x.arc(150, 118, 70, -2.4, -0.6); x.stroke();
  } else {
    const light = ['openai', 'xai', 'kimi'].includes(id);
    drawLogo(x, id, 128, 128, 170, light ? { color: '#f2f2f2' } : {});
  }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.NoColorSpace; tx.anisotropy = 8; tx.generateMipmaps = true;
  return tx;
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k)));
  return '#' + c.getHexString();
}
void drawWordmark;

// ---------------------------------------------------------------- geometry helpers
const UNIT_Y = new THREE.Vector3(0, 1, 0);
function mergeGeos(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { if (!g.attributes.normal) g.computeVertexNormals(); nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos[(ov + i) * 3] = P.getX(i); pos[(ov + i) * 3 + 1] = P.getY(i); pos[(ov + i) * 3 + 2] = P.getZ(i);
      nrm[(ov + i) * 3] = N.getX(i); nrm[(ov + i) * 3 + 1] = N.getY(i); nrm[(ov + i) * 3 + 2] = N.getZ(i);
      if (U) { uv[(ov + i) * 2] = U.getX(i); uv[(ov + i) * 2 + 1] = U.getY(i); }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.getX(i) + ov;
    else for (let i = 0; i < P.count; i++) idx[oi + i] = ov + i;
    ov += P.count; oi += g.index ? g.index.count : P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------- the build
function buildBody(s) {
  const fl = -SEAT_H;                                   // floor in local coords (seat at 0)
  const S = (v) => v * s;
  const secs = [
    { y: fl + 0.005, w: S(0.33), d: S(0.37), z: S(0.15), p: 2.8 },
    { y: fl + 0.05, w: S(0.32), d: S(0.36), z: S(0.15), p: 2.8 },
    { y: fl * 0.55, w: S(0.3), d: S(0.34), z: S(0.15), p: 3.0 },
    { y: -0.04, w: S(0.3), d: S(0.36), z: S(0.13), p: 3.2 },
    { y: S(0.035), w: S(0.29), d: S(0.34), z: S(0.11), p: 3.4 },
    { y: S(0.07), w: S(0.215), d: S(0.16), z: S(-0.01), p: 2.6 },
    { y: S(0.16), w: S(0.205), d: S(0.15), z: S(-0.02), p: 2.5 },
    { y: S(0.3), w: S(0.24), d: S(0.165), z: S(-0.02), p: 2.5 },
    { y: S(0.44), w: S(0.27), d: S(0.16), z: S(-0.03), p: 2.6 },
    { y: S(0.53), w: S(0.275), d: S(0.14), z: S(-0.04), p: 2.6 },
    { y: S(0.585), w: S(0.2), d: S(0.115), z: S(-0.04), p: 2.4 },
    { y: S(0.615), w: S(0.07), d: S(0.07), z: S(-0.025), p: 2 },
  ];
  return sectionLoft(secs, 64);
}

function buildChair(s) {
  const g = new THREE.Group();
  const wood = celMaterial({ color: '#2a1d16', id: 22, gloss: 0.6, pattern: WOOD_PAT });
  const fl = -SEAT_H;
  const W = 0.36 * s, D = 0.3 * s;
  const seat = new THREE.Mesh(roundBox(W * 2, 0.06, D * 2 + 0.06, 0.012), wood); seat.position.set(0, -0.035, -0.02); g.add(seat);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(roundBox(0.06, SEAT_H - 0.06, 0.06, 0.01), wood);
    leg.position.set(sx * (W - 0.03), fl + (SEAT_H - 0.06) / 2, sz * D - 0.02); g.add(leg);
  }
  const backH = 1.25 * s;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(roundBox(0.075, backH + SEAT_H, 0.075, 0.012), wood);
    post.position.set(sx * (W - 0.02), fl + (backH + SEAT_H) / 2, -D - 0.03); g.add(post);
    const fin = new THREE.Mesh(lathe([[0, 0], [0.045, 0.01], [0.05, 0.04], [0.03, 0.07], [0.045, 0.11], [0.012, 0.17], [0, 0.19]], 16), wood);
    fin.position.set(sx * (W - 0.02), backH + 0.0, -D - 0.03); g.add(fin);
    const arm = new THREE.Mesh(roundBox(0.07, 0.05, D * 2 + 0.08, 0.015), wood);
    arm.position.set(sx * (W + 0.02), 0.24 * s, 0.0); g.add(arm);
    const armPost = new THREE.Mesh(roundBox(0.05, 0.24 * s, 0.05, 0.01), wood);
    armPost.position.set(sx * (W + 0.02), 0.12 * s, D - 0.02); g.add(armPost);
  }
  const panel = new THREE.Mesh(roundBox(W * 2 - 0.08, backH * 0.82, 0.04, 0.012), wood);
  panel.position.set(0, backH * 0.47, -D - 0.035); g.add(panel);
  const crest = new THREE.Mesh(lathe([[0, 0], [0.16 * s, 0.0], [0.17 * s, 0.03], [0.1 * s, 0.09], [0, 0.16 * s]], 24, { sz: 0.25 }), wood);
  crest.position.set(0, backH * 0.9, -D - 0.035); g.add(crest);
  g.traverse((o) => { if (o.isMesh) o.userData.chair = true; });
  return g;
}

function buildCrown(id, s, mats, plateTex) {
  const st = STYLE[id];
  const g = new THREE.Group();
  const metal = mats.metal;
  const R = 0.108 * s, H0 = 0.055 * s;
  const kind = st.crown;
  const bandH = kind === 'tall' ? 0.12 * s : kind === 'dome' ? 0.05 * s : H0;
  const band = new THREE.Mesh(lathe([[R * 0.96, 0], [R * 1.04, 0.004], [R * 1.05, 0.012], [R * 1.02, 0.016], [R * (kind === 'tall' ? 1.16 : 1.05), bandH - 0.012], [R * (kind === 'tall' ? 1.2 : 1.09), bandH - 0.004], [R * (kind === 'tall' ? 1.16 : 1.06), bandH], [R * 0.95, bandH]], kind === 'tall' ? 6 : 48, kind === 'tall' ? { th0: Math.PI / 6, th1: Math.PI / 6 + TAU } : {}), metal);
  g.add(band);
  if (kind === 'tall') for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * TAU;
    const pt = new THREE.Mesh(lathe([[0.016 * s, 0], [0.0, 0.06 * s]], 4), metal);
    pt.position.set(Math.sin(a) * R * 1.17, bandH, Math.cos(a) * R * 1.17); g.add(pt);
  }
  const pts = { leaf: 7, gems: 8, spike: 7, balls: 7, fin: 6, tab: 8, classic: 8, arch: 0, dome: 0, tall: 0 }[kind];
  const ring = (n, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const m = fn(i, a); m.position.set(Math.sin(a) * R * 1.02, bandH, Math.cos(a) * R * 1.02); m.rotation.y = a; g.add(m); } };
  if (kind === 'leaf') ring(pts, (i) => new THREE.Mesh(lathe([[0.016 * s, 0], [0.018 * s, 0.018 * s], [0.008 * s, 0.045 * s], [0.0, (i % 2 ? 0.05 : 0.075) * s]], 6, { sz: 0.35 }), metal));
  if (kind === 'gems' || kind === 'classic' || kind === 'fin') ring(pts, (i) => {
    const m = new THREE.Mesh(lathe([[0.02 * s, 0], [0.014 * s, 0.03 * s], [0.004 * s, 0.07 * s], [0, 0.075 * s]], 8), metal);
    if (i % 2 === 1) m.scale.setScalar(0.6);
    return m;
  });
  if (kind === 'spike') ring(pts, (i) => new THREE.Mesh(lathe([[0.016 * s, 0], [0.0, (i % 2 ? 0.11 : 0.17) * s]], 4), metal));
  if (kind === 'balls') ring(pts, () => { const m = new THREE.Group(); m.add(new THREE.Mesh(lathe([[0.012 * s, 0], [0.006 * s, 0.05 * s], [0.003 * s, 0.05 * s]], 8), metal)); const b = new THREE.Mesh(superEllipsoid(0.016 * s, 0.016 * s, 0.016 * s, 2, 2, 12, 8), metal); b.position.y = 0.058 * s; m.add(b); return m; });
  if (kind === 'tab') ring(pts, () => new THREE.Mesh(roundBox(0.036 * s, 0.045 * s, 0.012 * s, 0.003).translate(0, 0.022 * s, 0), metal));
  if (kind === 'fin') { const fin = new THREE.Mesh(superEllipsoid(0.008 * s, 0.11 * s, 0.07 * s, 2, 2.2, 10, 12), metal); fin.position.set(0, bandH + 0.06 * s, -0.01 * s); fin.rotation.x = 0.35; g.add(fin); }
  if (kind === 'arch') {
    for (const a of [0, Math.PI / 2]) { const arc = new THREE.Mesh(tube([[-R, bandH, 0], [-R * 0.6, bandH + 0.08 * s, 0], [0, bandH + 0.11 * s, 0], [R * 0.6, bandH + 0.08 * s, 0], [R, bandH, 0]], 0.008 * s, 24, 8), metal); arc.rotation.y = a; g.add(arc); }
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s, 0.009 * s, 8, 20, Math.PI * 1.3), metal); moon.position.set(0, bandH + 0.15 * s, 0); moon.rotation.z = 0.6; g.add(moon);
  }
  if (kind === 'dome') { const dome = new THREE.Mesh(superEllipsoid(R * 0.98, 0.07 * s, R * 0.98, 2, 2, 32, 16), mats.velvet); dome.position.y = bandH; g.add(dome); const knob = new THREE.Mesh(superEllipsoid(0.02 * s, 0.02 * s, 0.02 * s), metal); knob.position.y = bandH + 0.07 * s; g.add(knob); }
  // a velvet cap fills every open crown (no view into an empty ring)
  if (kind !== 'dome') { const cap = new THREE.Mesh(superEllipsoid(R * 0.97, (kind === 'tall' ? 0.05 : 0.045) * s, R * 0.97, 2, 2.4, 32, 12), mats.velvet); cap.position.y = kind === 'tall' ? bandH - 0.03 * s : bandH * 0.55; g.add(cap); }
  let glowGem = null;
  if (kind === 'gems') {
    const cols = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      const gm = new THREE.Mesh(superEllipsoid(0.012 * s, 0.014 * s, 0.008 * s, 2, 2, 10, 8), celMaterial({ color: cols[i % 4], id: 26, gloss: 1, specK: 1 }));
      gm.position.set(Math.sin(a) * R * 1.09, bandH * 0.5, Math.cos(a) * R * 1.09); gm.rotation.y = a; g.add(gm);
    }
    glowGem = new THREE.Mesh(superEllipsoid(0.02 * s, 0.024 * s, 0.012 * s, 2, 2, 12, 10), glowMaterial({ color: '#ff2a1a', id: 147, uniforms: { uOn: { value: 0 } }, pattern: 'col = mix(vec3(0.25, 0.04, 0.03), col * 2.2, uOn);' }));
    glowGem.position.set(0, bandH + 0.035 * s, R * 1.05); g.add(glowGem);
  }
  const plateR = (kind === 'tall' ? 0.055 : 0.042) * s;
  const plateMat = celMaterial({ color: '#ffffff', id: 27, gloss: 0.8, uniforms: { uMap: { value: plateTex } }, pattern: 'col = texture(uMap, vUv).rgb; specTh = 0.97;' });
  const plate = new THREE.Mesh(new THREE.CircleGeometry(plateR, 40), plateMat);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(plateR, 0.005 * s, 8, 40), metal);
  const plateG = new THREE.Group(); plateG.add(plate); plateG.add(rim);
  plateG.position.set(0, kind === 'tall' ? bandH * 0.52 : bandH * 0.55 + 0.02 * s, R * (kind === 'tall' ? 1.14 : 1.08) + 0.004);
  plateG.rotation.x = kind === 'tall' ? -0.05 : -0.12;
  g.add(plateG);
  const top = { tall: 0.19, leaf: 0.13, gems: 0.13, spike: 0.22, balls: 0.13, fin: 0.17, tab: 0.1, classic: 0.13, arch: 0.22, dome: 0.13 }[kind] * s;
  return { group: g, glowGem, plateMat, plateG, top };
}

// the nose: [y, half width, depth] sections from the bridge to the tip (cm, scale 1)
const NOSE_SECS = [[3.4, 0.5, 0.12], [2.4, 0.56, 0.42], [0.6, 0.62, 0.82], [-1.3, 0.7, 1.25], [-2.6, 0.86, 1.68], [-3.25, 1.12, 1.72], [-3.7, 1.08, 1.4], [-4.0, 0.72, 0.85], [-4.12, 0.3, 0.3]];
// ---- the head: a chess-piece bust. A rounded block whose front is a gently curved plane (no eye sockets),
// with a straight sculpted nose ridge. Built in centimetres (scale 1) and scaled by s/100.
function buildHead(s, F) {
  const k = s / 100;
  const { b, c, p, q } = HEAD;
  const a = HEAD.a * (F.wide ?? 1);
  const smin = (x, y, r) => 0.5 * (x + y - Math.sqrt((x - y) * (x - y) + r * r));
  const skull = surface((u, v, o) => {
    const th = -u * TAU, ph = (v - 0.5) * Math.PI;
    const cp = sgnPow(Math.cos(ph), 2 / q), sp = sgnPow(Math.sin(ph), 2 / q);
    let x = a * cp * sgnPow(Math.sin(th), 2 / p), y = b * sp, z = c * cp * sgnPow(Math.cos(th), 2 / p);
    const jaw = sstep(-1, -13, y);
    x *= 1 - (0.17 - 0.09 * F.cheek) * jaw;
    z *= 1 - 0.06 * jaw;
    const zf = faceZ(x, y, F);
    z = z - (z - smin(z, zf, 2.2)) * sstep(-1, 1, z);
    o.set(x * k, y * k, z * k);
  }, 112, 72);
  // the nose: horizontal sections from the bridge to the tip, half buried in the face plane
  const [nl, nw] = F.nose;
  const NS = NOSE_SECS;
  const secs = NS.map(([y, w, d]) => {
    const yy = 3.4 + (y - 3.4) * nl;
    const zf = faceZ(0, yy, F);
    return { y: yy * k, w: w * nw * k, d: d * k * (y < -3.2 ? 1.0 : 1.0), z: (zf - 0.15) * k, p: y > -2.4 ? 1.75 : 2.1 };
  });
  const nose = sectionLoft(secs.reverse(), 28);
  const head = mergeGeos([skull, nose]);
  return head;
}

// moustaches: a tapered tube per side lying on the face plane (cm, the +x side; mirrored for -x)
const STACHES = {
  curl:      { pts: [[0.1, -4.5], [1.2, -4.85], [2.6, -4.85], [3.7, -4.35], [4.25, -3.55], [4.05, -2.95], [3.55, -3.05]], r: [0.52, 0.12] },
  handlebar: { pts: [[0.1, -4.45], [1.6, -5.0], [3.4, -5.05], [5.0, -4.4], [5.85, -3.2], [5.6, -2.35], [4.95, -2.5]], r: [0.6, 0.14] },
  points:    { pts: [[0.1, -4.45], [1.3, -4.7], [2.7, -4.55], [3.9, -3.9], [4.75, -2.95]], r: [0.38, 0.03] },
  droop:     { pts: [[0.1, -4.45], [1.4, -4.85], [2.45, -5.6], [2.95, -7.2], [3.15, -9.6], [3.05, -12.2]], r: [0.46, 0.07] },
  full:      { pts: [[0.1, -4.4], [1.4, -4.8], [2.8, -4.95], [4.0, -4.8], [4.9, -4.4], [5.3, -3.95]], r: [0.74, 0.26] },
  pencil:    { pts: [[0.1, -4.62], [1.2, -4.78], [2.3, -4.78], [2.95, -4.6]], r: [0.17, 0.12] },
};
function buildStache(kind, s, F) {
  const def = STACHES[kind];
  if (!def) return null;
  const k = s / 100;
  const geos = [];
  for (const sx of [-1, 1]) {
    const pts = def.pts.map(([x, y], i) => {
      const r = def.r[0] + (def.r[1] - def.r[0]) * (i / (def.pts.length - 1));
      return [sx * x * k, y * k, (faceZ(x, y, F) + r * 0.55) * k];
    });
    const r0 = def.r[0], r1 = def.r[1];
    const g = tube(pts, (u) => (r1 + (r0 - r1) * Math.pow(1 - u, 0.7)) * k * (u < 0.04 ? 0.6 + 10 * u : 1), 40, 10);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i) / k, y = P.getY(i) / k, fz = faceZ(x, y, F); P.setZ(i, (fz + (P.getZ(i) / k - fz) * 0.62) * k); }
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeos(geos);
}

// beards: lofted horizontal sections [y, half width, front z, back z, squareness] (cm), hanging from under the lower lip,
// coming forward over the ermine collar
const BEARDS = {
  neat:    [[-7.6, 6.0, 8.8, -5, 2.6], [-8.5, 6.7, 9.6, -4, 2.8], [-10.4, 6.6, 10.0, -3, 2.8], [-12.7, 5.6, 9.8, -1, 2.6], [-14.0, 4.1, 9.4, 1, 2.4], [-14.6, 2.0, 8.8, 3.5, 2.2]],
  full:    [[-7.6, 6.3, 8.8, -5, 2.4], [-8.6, 7.3, 9.9, -4, 2.5], [-11, 7.6, 11.2, -2, 2.4], [-15, 6.7, 13.6, 1, 2.3], [-19.5, 5.0, 15.0, 5, 2.2], [-23.5, 3.1, 15.0, 8, 2.1], [-26.4, 1.5, 14.4, 9.5, 2], [-27.4, 0.2, 13.6, 11.5, 2]],
  goatee:  [[-7.6, 1.7, 8.9, 5.5, 2], [-8.4, 2.3, 9.7, 5.5, 2], [-11, 2.4, 10.4, 6, 2], [-14, 1.8, 10.8, 7, 2], [-16.8, 0.75, 10.8, 8.4, 2], [-17.8, 0.1, 10.6, 10.2, 2]],
  vandyke: [[-7.6, 2.4, 8.9, 5, 2], [-8.5, 3.1, 9.8, 5, 2], [-11.4, 3.0, 10.6, 5.5, 2], [-15, 2.1, 11.4, 6.5, 2], [-18.6, 0.9, 11.8, 8.5, 2], [-20.4, 0.1, 11.7, 10.8, 2]],
  fork:    [[-7.6, 6.0, 8.8, -5, 2.3], [-8.5, 6.8, 9.8, -4, 2.4], [-11, 7.0, 11.2, -2, 2.4], [-15.5, 6.2, 13.4, 1, 2.3], [-20, 5.0, 14.6, 5, 2.2], [-22.5, 4.0, 14.8, 7.5, 2.1]],
  square:  [[-7.6, 6.3, 8.8, -5, 2.6], [-8.5, 7.2, 9.9, -4, 2.8], [-11, 7.6, 11.2, -2, 3.0], [-15.5, 7.3, 13.6, 1, 3.2], [-20.5, 6.8, 14.8, 5, 3.4], [-23.4, 6.4, 14.8, 7, 3.4], [-24.1, 5.6, 14.4, 8, 3.2]],
  round:   [[-7.6, 6.5, 8.8, -5, 2.3], [-8.5, 7.6, 9.9, -4, 2.3], [-11, 8.6, 11.6, -2, 2.2], [-15, 8.4, 13.4, 1, 2.2], [-18.6, 6.7, 13.8, 4, 2.1], [-21.2, 3.8, 13.2, 7, 2], [-22.4, 0.6, 12.4, 9.5, 2]],
  soul:    [[-7.6, 0.6, 9.0, 7.6, 2], [-8.1, 0.85, 9.45, 7.6, 2], [-9.3, 0.55, 9.5, 8, 2], [-10.2, 0.08, 9.3, 8.8, 2]],
};
function buildBeard(kind, s, F) {
  const def = BEARDS[kind];
  if (!def) return null;
  const k = s / 100;
  const loft = (rows) => sectionLoft(rows.slice().reverse().map(([y, w, zf, zb, p]) => ({ y: y * k, w: w * k, d: ((zf - zb) / 2) * k, z: ((zf + zb) / 2) * k, p })), 40);
  const top = loft(def);
  const P0 = top.attributes.position;
  for (let i = 0; i < P0.count; i++) {
    const x = P0.getX(i) / k, y = P0.getY(i) / k, z = P0.getZ(i) / k;
    const fz = faceZ(x, y, F);
    if (z < fz - 3.2) continue;
    const hug = 1 - sstep(-8.4, -11.5, y);
    const zs = fz + 0.06 + 0.55 * sstep(-7.6, -10.5, y);
    P0.setZ(i, (z + (zs - z) * hug * sstep(fz - 3.2, fz - 1.2, z)) * k);
  }
  top.computeVertexNormals();
  const geos = [top];
  if (kind === 'fork') for (const sx of [-1, 1]) {
    // two tails from the split
    const rows = [[-20.5, 2.3, 14.4, 8, 2.2], [-25, 2.2, 14.8, 10, 2.1], [-30, 1.6, 14.6, 11.2, 2], [-33.5, 0.8, 14.2, 12.0, 2], [-35, 0.1, 13.9, 13.2, 2]];
    const g = loft(rows); g.translate(sx * 1.9 * k, 0, 0);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i) / k; const spread = sstep(-21, -35, y) * 1.4 * k; P.setX(i, P.getX(i) + sx * spread); }
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeos(geos);
}

// a rolled curl: a rounded cylinder about +y (the +y cap shows the spiral), radius r, length L (metres)
function curlGeo(r, L) {
  const prof = [[0, 0], [r * 0.7, 0.0], [r * 0.95, r * 0.18], [r, r * 0.5], [r, L - r * 0.45], [r * 0.93, L - r * 0.14], [r * 0.7, L], [0, L + r * 0.04]];
  return lathe(prof, 20);
}

// ---- hands: a palm and posed fingers merged per pose (one mesh per hand). Hand frame: +y fingers (continuing the
// forearm), +z out of the palm, the thumb on +x for a right hand. The palm centre sits 0.06*s above the wrist.
const FINGERS = [   // across (toward the thumb), knuckle height, phalanx lengths, radius (all × s)
  { x: 0.03, y: 0.104, L: [0.043, 0.037], r: 0.0108 },
  { x: 0.0095, y: 0.108, L: [0.047, 0.04], r: 0.0112 },
  { x: -0.011, y: 0.105, L: [0.044, 0.037], r: 0.0106 },
  { x: -0.0305, y: 0.098, L: [0.035, 0.03], r: 0.0095 },
];
// per finger [knuckle curl, middle curl, spread]; thumb [abduction (away from the index, in the palm plane),
// opposition (toward the palm side), flexion 1, flexion 2] (radians)
const HAND_POSES = {
  rest:  { f: [[0.32, 0.42, 0.05], [0.38, 0.48, 0], [0.44, 0.52, -0.05], [0.5, 0.56, -0.1]], th: [0.45, 0.35, 0.2, 0.25] },
  open:  { f: [[0.04, 0.03, 0.12], [0.02, 0.02, 0.02], [0.04, 0.03, -0.08], [0.06, 0.05, -0.18]], th: [0.85, 0.1, 0.05, 0.05] },
  fist:  { f: [[1.55, 1.75, 0], [1.6, 1.75, 0], [1.6, 1.75, 0], [1.55, 1.75, 0]], th: [0.2, 1.05, 0.55, 0.55] },
  point: { f: [[0.0, 0.02, 0.02], [1.6, 1.75, 0], [1.6, 1.75, 0], [1.55, 1.75, 0]], th: [0.15, 1.0, 0.5, 0.45] },
  hold:  { f: [[1.12, 1.3, 0.02], [1.18, 1.32, 0], [1.2, 1.32, -0.02], [1.22, 1.3, -0.05]], th: [0.3, 1.15, 0.35, 0.35] },
};
function buildHandGeo(s, side, pose) {
  const P = HAND_POSES[pose] ?? HAND_POSES.rest;
  const ts = side === 'R' ? 1 : -1;                       // thumb side (hand x)
  const geos = [];
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4();
  // palm: a rounded slab, narrower at the wrist; the heel of the thumb
  const palm = superEllipsoid(0.045 * s, 0.05 * s, 0.0185 * s, 3.2, 3.0, 24, 16);
  const pp = palm.attributes.position;
  for (let i = 0; i < pp.count; i++) { const y = pp.getY(i) / (0.05 * s); pp.setX(i, pp.getX(i) * (0.84 + 0.16 * clamp((y + 1) / 1.5))); pp.setZ(i, pp.getZ(i) * (1 - 0.12 * clamp(y))); }
  palm.computeVertexNormals();
  palm.translate(0, 0.058 * s, -0.002 * s);
  geos.push(palm);
  const heel = superEllipsoid(0.021 * s, 0.03 * s, 0.016 * s, 2, 2, 14, 10);
  heel.translate(ts * 0.025 * s, 0.034 * s, 0.009 * s);
  geos.push(heel);
  let ringM = null;
  FINGERS.forEach((fg, i) => {
    const [c1, c2, sp] = P.f[i];
    const r = fg.r * s;
    M.makeTranslation(ts * fg.x * s, fg.y * s, 0.002 * s);
    M.multiply(R.makeRotationZ(-ts * sp));
    M.multiply(R.makeRotationX(c1));
    const g1 = new THREE.CapsuleGeometry(r, fg.L[0] * s, 4, 10); g1.translate(0, fg.L[0] * s / 2, 0); g1.applyMatrix4(M); geos.push(g1);
    if (i === 2) ringM = M.clone().multiply(T.makeTranslation(0, fg.L[0] * s * 0.35, 0));
    M.multiply(T.makeTranslation(0, fg.L[0] * s, 0));
    M.multiply(R.makeRotationX(c2));
    const g2 = new THREE.CapsuleGeometry(r * 0.92, fg.L[1] * s, 4, 10); g2.translate(0, fg.L[1] * s / 2, 0); g2.applyMatrix4(M); geos.push(g2);
  });
  // thumb: from the heel; abducts away from the index, opposes toward the palm, flexes across it
  const [abd, opp, f1, f2] = P.th;
  const ax = new THREE.Vector3(0.55, 0, ts * 0.83).normalize();
  M.makeTranslation(ts * 0.036 * s, 0.03 * s, 0.006 * s);
  M.multiply(R.makeRotationZ(-ts * (0.35 + abd)));
  M.multiply(R.makeRotationX(opp));
  const t1 = new THREE.CapsuleGeometry(0.0128 * s, 0.034 * s, 4, 10); t1.translate(0, 0.017 * s, 0); t1.applyMatrix4(M); geos.push(t1);
  M.multiply(T.makeTranslation(0, 0.034 * s, 0)); M.multiply(R.makeRotationAxis(ax, f1));
  const t2 = new THREE.CapsuleGeometry(0.0118 * s, 0.028 * s, 4, 10); t2.translate(0, 0.014 * s, 0); t2.applyMatrix4(M); geos.push(t2);
  M.multiply(T.makeTranslation(0, 0.028 * s, 0)); M.multiply(R.makeRotationAxis(ax, f2));
  const t3 = new THREE.CapsuleGeometry(0.011 * s, 0.02 * s, 4, 10); t3.translate(0, 0.01 * s, 0); t3.applyMatrix4(M); geos.push(t3);
  return { geo: mergeGeos(geos), ringM };
}
// ---------------------------------------------------------------- masks
// A half-mask per company, forehead to cheekbones: brand silhouette and colours, lacquer / enamel with a worn edge,
// the mark inlaid. Built in a DESIGN space: X = arc length across the mask's face (cm at scale 1, + = the king's left,
// which is the viewer's right when facing him), Y = head-local height (cm). The eyes sit at (±EYE_X, EYE_Y).
// Each design is drawn on canvases: the silhouette (-> a signed distance texture: crisp edges at any size, a rim and
// a rounded bevel from the distance), the paint (albedo), gilt inlays (metal) and raised inlays (relief). The eye holes
// are analytic (holeSDF) so the eyes stay crisp in the extreme close-ups. The mesh is a dense grid wrapped around the
// face ~6 mm off the skin, flaring away from the head where wings and rays reach past it; its edges curl down to the skin.
const MD = { X0: -16, Y0: -8, W: 32, H: 25 };
const SDF_K = 16, PAINT_K = 32, SDF_R = 2.5;            // canvas px per cm; the distance texture spans ±SDF_R cm
const MASK_OFF = 0.62;                                   // cm off the skin
// per brand: rim (edge enamel or gilt) and its width, brow plate colour and edge, lacquer gloss, self light, eye-hole shape
// (superellipse exponent: lower = more pointed corners)
const MASK = {
  openai:    { rim: '#d6e0ff', rimW: 0.5, brow: '#d6e0ff', browRim: '#8f97ad', gloss: 0.28, self: 0.1, pe: 2.7 },
  anthropic: { rim: '#d9b264', rimW: 0.42, brow: '#3b2016', browRim: '#d9b264', gloss: 0.75, self: 0.13, pe: 2.2 },
  google:    { rim: '#d9b264', rimW: 0.4, brow: '#232428', browRim: '#d9b264', gloss: 0.8, self: 0.13, pe: 2.2 },
  xai:       { rim: '#c2cbe0', rimW: 0.3, brow: '#d6e0ff', browRim: '#7d8088', gloss: 1.0, self: 0.07, pe: 1.65 },
  meta:      { rim: '#d6e0ff', rimW: 0.32, brow: '#d6e0ff', browRim: '#8ea8d6', gloss: 0.9, self: 0.14, pe: 2.0 },
  deepseek:  { rim: '#d6e0ff', rimW: 0.36, brow: '#d6e0ff', browRim: '#8fa2f2', gloss: 0.85, self: 0.14, pe: 2.2 },
  qwen:      { rim: '#e4dcff', rimW: 0.34, brow: '#efebff', browRim: '#9d8ee6', gloss: 0.9, self: 0.14, pe: 2.0 },
  kimi:      { rim: '#2f88ff', rimW: 0.44, brow: '#d6e0ff', browRim: '#2f88ff', gloss: 0.95, self: 0.08, pe: 2.4 },
  glm:       { rim: '#d6e0ff', rimW: 0.34, brow: '#d6e0ff', browRim: '#8792bd', gloss: 0.85, self: 0.12, pe: 2.4 },
  doubao:    { rim: '#d6e0ff', rimW: 0.34, brow: '#d6e0ff', browRim: '#a69ce6', gloss: 0.9, self: 0.14, pe: 2.0 },
};

// ---- canvas helpers in design space (cm, +Y up)
function designCanvas(k, opaque, A = MD) {
  const c = document.createElement('canvas'); c.width = Math.round(A.W * k); c.height = Math.round(A.H * k);
  const x = c.getContext('2d', { willReadFrequently: true });
  if (opaque) { x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); }
  x.setTransform(k, 0, 0, -k, -A.X0 * k, (A.Y0 + A.H) * k);
  x.area = A;
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineCap = 'round';
  return { c, x };
}
const fillAll = (x, col) => { const A = x.area ?? MD; x.fillStyle = col; x.fillRect(A.X0, A.Y0, A.W, A.H); };
function polyP(x, P) { x.beginPath(); x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]); x.closePath(); }
function roundPoly(x, P, r) {
  const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(P[n - 1], P[0]);
  x.beginPath(); x.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const a = P[i], m = mid(a, P[(i + 1) % n]); x.arcTo(a[0], a[1], m[0], m[1], r); }
  x.closePath();
}
function superEll(x, cx, cy, rx, ry, n) {
  x.beginPath();
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * TAU, c = Math.cos(a), s = Math.sin(a);
    const px = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), py = cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
}
function ell(x, cx, cy, rx, ry, rot = 0) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); }
// a straight bar from (x0, y0) to (x1, y1), half width hw
function bar(x, x0, y0, x1, y1, hw) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = (-dy / l) * hw, ny = (dx / l) * hw;
  polyP(x, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
}
// a logo from logos.js, centred at (X, Y), size S cm (drawn in pixels: drawLogo rasterises offscreen)
function logoAt(x, id, X, Y, S, opts) {
  const m = x.getTransform();
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  drawLogo(x, id, m.a * X + m.e, m.d * Y + m.f, S * m.a, opts);
  x.restore();
}
function cutOut(x, fn) { x.save(); x.globalCompositeOperation = 'destination-out'; fn(); x.fill(); x.restore(); }
// every mask: the nose (from the bridge's lower half down) stays free; nothing climbs in front of the crown's plate
function standardCuts(x) {
  cutOut(x, () => { x.beginPath(); x.moveTo(2.6, -9); x.lineTo(2.6, -3.4); x.quadraticCurveTo(1.3, -0.95, 0, -0.95); x.quadraticCurveTo(-1.3, -0.95, -2.6, -3.4); x.lineTo(-2.6, -9); x.closePath(); });
  cutOut(x, () => { x.beginPath(); x.rect(-5.8, 9.9, 11.6, 9); });
}

// ---- the ten designs. L: 'shape' (white silhouette), 'paint' (albedo, bleeds past the silhouette), 'metal' (white = gilt),
// 'relief' (white = raised)
const DESIGN = {
  // OpenAI: a matte black hexagon with a white enamel edge, the white knot inlaid on the brow
  openai(x, L) {
    const P = [[-5.5, 10.4], [5.5, 10.4], [11.1, 3.6], [6.1, -3.5], [-6.1, -3.5], [-11.1, 3.6]];
    if (L === 'shape') { roundPoly(x, P, 1.2); x.fill(); return; }
    if (L === 'paint') {
      fillAll(x, '#171717');
      x.lineWidth = 0.09; x.strokeStyle = '#262626';
      for (const f of [0.78, 0.56]) { roundPoly(x, P.map(([a, b]) => [a * f, 3.4 + (b - 3.4) * f]), 1.2 * f); x.stroke(); }
      logoAt(x, 'openai', 0, 6.45, 4.9, { color: '#d6e0ff' });
    }
    if (L === 'relief') logoAt(x, 'openai', 0, 6.45, 4.9, { color: '#ffffff' });
  },
  // Claude: a terracotta sun whose outline is the Claude starburst: twelve tapering rounded rays radiating around the eyes,
  // long and short in turn (mirror-symmetric, so the face stays calm); none climbs in front of the crown or hangs past the mouth
  anthropic(x, L) {
    const c = [0, 2.5];
    const rays = (grow = 0) => {
      for (let i = 0; i < 12; i++) {
        const a = ((i * 30 + 15) * Math.PI) / 180, long = i % 2 === 0;
        const len = (long ? 12.6 : 10.4) + (Math.abs(Math.cos(a)) > 0.8 ? 0.8 : 0) + grow;
        const w0 = 1.55 + grow, w1 = (long ? 0.85 : 0.72) + grow;
        const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
        const r1 = len - w1;
        x.beginPath();
        x.moveTo(c[0] + nx * w0, c[1] + ny * w0);
        x.lineTo(c[0] + ca * r1 + nx * w1, c[1] + sa * r1 + ny * w1);
        x.arc(c[0] + ca * r1, c[1] + sa * r1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
        x.lineTo(c[0] - nx * w0, c[1] - ny * w0);
        x.closePath(); x.fill();
      }
    };
    const body = () => ell(x, c[0], c[1], 8.6, 5.6);
    if (L === 'shape') {
      rays(); body(); x.fill();
      cutOut(x, () => { x.beginPath(); x.rect(-7.0, -12, 14.0, 8.7); x.rect(-16, -12, 32, 6.2); });
      return;
    }
    if (L === 'paint') {
      fillAll(x, '#b9593a');
      x.fillStyle = '#dd7a55'; rays(-0.18);
      x.fillStyle = '#d4704c'; body(); x.fill();
      const g = x.createRadialGradient(c[0], c[1], 1.5, c[0], c[1], 14);
      g.addColorStop(0, 'rgba(245,170,130,0.5)'); g.addColorStop(0.5, 'rgba(217,119,87,0)'); g.addColorStop(1, 'rgba(110,40,18,0.45)');
      x.fillStyle = g; x.fillRect(MD.X0, MD.Y0, MD.W, MD.H);
      // a ring of short engraved rays round each eye (a sun around a sun)
      x.strokeStyle = 'rgba(120,45,20,0.55)'; x.lineWidth = 0.12;
      for (const sx of [-1, 1]) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        x.beginPath(); x.moveTo(sx * 3.6 + Math.cos(a) * 3.4, 1.8 + Math.sin(a) * 2.6); x.lineTo(sx * 3.6 + Math.cos(a) * 4.1, 1.8 + Math.sin(a) * 3.2); x.stroke();
      }
    }
    if (L === 'relief') { x.fillStyle = '#ffffff'; rays(-0.18); }
  },
  // Google: four colour panels (blue, red, yellow, green) quartered by gilt lines
  google(x, L) {
    const c = [0, 2.5], D2R = Math.PI / 180;
    if (L === 'shape') { superEll(x, 0, 3.05, 10.5, 6.7, 2.7); x.fill(); return; }
    const sect = (a0, a1, col) => { x.beginPath(); x.moveTo(c[0], c[1]); x.arc(c[0], c[1], 30, a0 * D2R, a1 * D2R); x.closePath(); x.fillStyle = col; x.fill(); };
    const lines = () => { for (const a of [38, 142, 218, 318]) bar(x, c[0], c[1], c[0] + 30 * Math.cos(a * D2R), c[1] + 30 * Math.sin(a * D2R), 0.2), x.fill(); ell(x, c[0], c[1], 0.62, 0.62); x.fill(); };
    if (L === 'paint') { sect(-42, 38, '#4285f4'); sect(38, 142, '#ea4335'); sect(142, 218, '#fbbc05'); sect(218, 318, '#34a853'); }
    if (L === 'metal' || L === 'relief') lines();
  },
  // xAI: glossy black, sharp swept wings, a big white X slash (a bold backslash, a thin broken slash)
  xai(x, L) {
    const P = [[-13.6, 12.4], [-8.2, 8.9], [-2.7, 9.8], [0, 9.2], [2.7, 9.8], [8.2, 8.9], [13.6, 12.4], [10.8, 4.6], [9.8, 0.2], [7.3, -3.8], [2.6, -2.6], [-2.6, -2.6], [-7.3, -3.8], [-9.8, 0.2], [-10.8, 4.6]];
    if (L === 'shape') { roundPoly(x, P, 0.22); x.fill(); return; }
    const X = () => { bar(x, -9.9, 9.7, 8.3, -3.7, 1.35); x.fill(); bar(x, -8.2, -3.7, -1.55, 1.1, 0.5); x.fill(); bar(x, 1.65, 3.45, 11.8, 10.8, 0.5); x.fill(); };
    if (L === 'paint') { fillAll(x, '#0e0e11'); x.fillStyle = '#d6e0ff'; X(); }
    if (L === 'relief') X();
  },
  // Meta: a navy half-mask carrying the blue infinity loop, whose two loops ARE the eye rings
  meta(x, L) {
    const yc = 1.85;
    const loop = (sx) => {
      x.beginPath(); x.moveTo(0, yc);
      x.bezierCurveTo(sx * 1.1, yc + 1.9, sx * 2.7, yc + 4.2, sx * 5.2, yc + 4.2);
      x.bezierCurveTo(sx * 8.1, yc + 4.2, sx * 9.8, yc + 2.4, sx * 9.8, yc);
      x.bezierCurveTo(sx * 9.8, yc - 2.4, sx * 8.1, yc - 4.2, sx * 5.2, yc - 4.2);
      x.bezierCurveTo(sx * 2.7, yc - 4.2, sx * 1.1, yc - 1.9, 0, yc);
    };
    const W = 2.6;
    if (L === 'shape') { superEll(x, 0, 3.6, 9.0, 6.0, 2.4); x.fill(); x.lineWidth = W; loop(-1); x.stroke(); loop(1); x.stroke(); return; }
    if (L === 'paint') {
      fillAll(x, '#152a80');
      const g = x.createLinearGradient(-11, -2, 11, 6); g.addColorStop(0, '#1a4ce6'); g.addColorStop(0.5, '#2460ff'); g.addColorStop(1, '#3876ff');
      x.lineWidth = W; x.strokeStyle = g; loop(-1); x.stroke();
      // the strand from the right loop passes over the left one at the crossing: a dark gap under it
      x.save(); x.beginPath(); x.rect(-2.0, yc - 4, 4.0, 8); x.clip();
      x.strokeStyle = '#05193e'; x.lineWidth = W + 0.7; x.beginPath(); x.moveTo(-1.9, yc - 2.6); x.lineTo(1.9, yc + 2.6); x.stroke();
      x.restore();
      x.strokeStyle = g; x.lineWidth = W; loop(1); x.stroke();
      x.save(); x.beginPath(); x.rect(-2.0, yc - 4, 4.0, 8); x.clip(); x.lineWidth = W; x.strokeStyle = '#2258f4'; x.beginPath(); x.moveTo(-1.6, yc - 2.3); x.lineTo(1.6, yc + 2.3); x.stroke(); x.restore();
      x.lineWidth = 0.28; x.strokeStyle = 'rgba(190,220,255,0.55)';
      x.save(); x.translate(0, 0.55); loop(-1); x.stroke(); loop(1); x.stroke(); x.restore();
    }
    if (L === 'relief') { x.lineWidth = W; loop(-1); x.stroke(); loop(1); x.stroke(); }
  },
  // DeepSeek: a blue whale lies across the eyes, its tail flaring up beside the crown on his right (the camera side in M1)
  deepseek(x, L) {
    const whale = () => {
      x.beginPath();
      x.moveTo(11.3, 1.4);
      x.bezierCurveTo(11.3, 5.4, 8.7, 7.7, 4.6, 8.0);
      x.bezierCurveTo(0.8, 8.3, -4.2, 7.9, -7.0, 7.3);
      x.bezierCurveTo(-8.2, 8.7, -8.4, 10.7, -7.6, 12.5);
      x.bezierCurveTo(-6.7, 13.7, -6.4, 14.9, -6.8, 15.6);
      x.bezierCurveTo(-8.4, 14.8, -9.6, 13.8, -10.4, 13.0);
      x.bezierCurveTo(-11.6, 14.0, -13.5, 14.7, -14.8, 14.5);
      x.bezierCurveTo(-13.9, 12.7, -12.5, 11.1, -11.5, 9.6);
      x.bezierCurveTo(-11.3, 7.0, -10.9, 4.4, -10.1, 2.0);
      x.bezierCurveTo(-9.1, -1.3, -5.6, -3.3, -1.0, -3.1);
      x.bezierCurveTo(4.0, -2.9, 8.4, -2.5, 10.5, -0.6);
      x.bezierCurveTo(11.1, 0.0, 11.3, 0.6, 11.3, 1.4);
      x.closePath();
    };
    const belly = () => { x.beginPath(); x.moveTo(10.4, -0.4); x.bezierCurveTo(6.0, -2.3, -2.0, -2.6, -9.2, -0.6); };
    if (L === 'shape') { whale(); x.fill(); return; }
    if (L === 'paint') {
      fillAll(x, '#4d6bfe');
      const g = x.createLinearGradient(0, -3, 0, 15); g.addColorStop(0, 'rgba(120,150,255,0.5)'); g.addColorStop(0.45, 'rgba(77,107,254,0)'); g.addColorStop(1, 'rgba(25,45,170,0.55)');
      x.fillStyle = g; x.fillRect(MD.X0, MD.Y0, MD.W, MD.H);
      x.lineWidth = 0.95; x.strokeStyle = '#f4f6ff'; belly(); x.stroke();
      x.lineWidth = 0.22; x.strokeStyle = '#1d2f8a'; x.beginPath(); x.moveTo(11.2, 0.9); x.quadraticCurveTo(10.0, 0.2, 8.6, 0.55); x.stroke();
      ell(x, 9.35, 2.7, 0.42, 0.42); x.fillStyle = '#f4f6ff'; x.fill();
      ell(x, 9.42, 2.66, 0.2, 0.2); x.fillStyle = '#101b55'; x.fill();
    }
    if (L === 'relief') { x.lineWidth = 0.95; belly(); x.stroke(); ell(x, 9.35, 2.7, 0.42, 0.42); x.fill(); }
  },
  // Qwen: an indigo-violet gem of triangular facets (the facets are cut in the shader), the Qwen mark on the brow
  qwen(x, L) {
    const P = [[0, 10.3], [5.3, 9.9], [10.7, 6.9], [11.5, 2.6], [8.7, -2.7], [4.3, -3.3], [-4.3, -3.3], [-8.7, -2.7], [-11.5, 2.6], [-10.7, 6.9], [-5.3, 9.9]];
    if (L === 'shape') { roundPoly(x, P, 0.3); x.fill(); return; }
    if (L === 'paint') {
      fillAll(x, '#5b40d9');
      const g = x.createLinearGradient(-11, 9, 11, -3); g.addColorStop(0, '#7b5cf2'); g.addColorStop(1, '#3f2bb0');
      x.fillStyle = g; x.fillRect(MD.X0, MD.Y0, MD.W, MD.H);
      logoAt(x, 'qwen', 0, 6.55, 4.3, { color: '#ece8ff' });
    }
    if (L === 'relief') logoAt(x, 'qwen', 0, 6.55, 4.3, { color: '#ffffff' });
  },
  // Kimi: a black lacquer tile with a white K and a bright blue jewel, a blue enamel edge
  kimi(x, L) {
    const tile = () => { x.beginPath(); x.roundRect(-10.3, -3.1, 20.6, 12.9, 3.4); };
    const S = 7.4, cx = 0.3, cy = 6.4;
    const K = () => {
      const m = (u, v) => [cx + u * S, cy - v * S];
      polyP(x, [m(-0.22, -0.25), m(-0.11, -0.25), m(-0.11, 0.25), m(-0.22, 0.25)]); x.fill();
      polyP(x, [m(-0.13, 0.03), m(0.1, -0.25), m(0.24, -0.25), m(-0.02, 0.06)]); x.fill();
      polyP(x, [m(-0.07, 0.0), m(0.03, -0.06), m(0.25, 0.25), m(0.11, 0.25)]); x.fill();
    };
    const dot = () => ell(x, cx + 0.3 * S, cy + 0.3 * S, 0.78, 0.78);
    if (L === 'shape') { tile(); x.fill(); return; }
    if (L === 'paint') { fillAll(x, '#131317'); x.fillStyle = '#d6e0ff'; K(); dot(); x.fillStyle = '#2f8bff'; x.fill(); }
    if (L === 'relief') { K(); dot(); x.fill(); }
  },
  // Zhipu GLM: a dark navy chamfered tile, a bold white Z (top bar, a steep diagonal between the eyes, bottom bar)
  glm(x, L) {
    const P = [[-8.0, 9.8], [8.0, 9.8], [10.9, 6.9], [10.9, 0.0], [8.4, -2.9], [-8.4, -2.9], [-10.9, 0.0], [-10.9, 6.9]];
    const Z = () => {
      polyP(x, [[-8.0, 7.3], [3.4, 7.3], [3.4, 9.3], [-8.0, 9.3]]); x.fill();
      polyP(x, [[3.4, 7.3], [3.4, 9.3], [1.2, 9.3], [-3.4, -0.9], [-3.4, -2.6], [-1.2, -2.6]]); x.fill();
      polyP(x, [[-3.4, -2.6], [8.0, -2.6], [8.0, -0.6], [-3.4, -0.6]]); x.fill();
    };
    if (L === 'shape') { roundPoly(x, P, 0.35); x.fill(); return; }
    if (L === 'paint') { fillAll(x, '#1a2a80'); x.fillStyle = '#d6e0ff'; Z(); }
    if (L === 'relief') Z();
  },
  // Doubao: rounded layered beans: violet over the brow, teal and blue under the eyes
  doubao(x, L) {
    const teal = () => ell(x, -4.5, 1.5, 5.7, 4.4, 0.22), blue = () => ell(x, 4.5, 1.5, 5.7, 4.4, -0.22), violet = () => ell(x, 0, 6.5, 8.9, 3.3);
    if (L === 'shape') { teal(); x.fill(); blue(); x.fill(); violet(); x.fill(); ell(x, 0, 2.4, 2.4, 3.2); x.fill(); return; }
    if (L === 'paint') {
      fillAll(x, '#2b3cf2');
      teal(); x.fillStyle = '#1fc4d6'; x.fill();
      blue(); x.fillStyle = '#2440f0'; x.fill();
      x.lineWidth = 0.22; x.strokeStyle = 'rgba(10,20,80,0.6)'; violet(); x.stroke();
      violet(); x.fillStyle = '#9d5fff'; x.fill();
      ell(x, -3.4, 7.5, 2.3, 0.7, 0.15); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fill();
    }
    if (L === 'relief') { x.fillStyle = '#7f7f7f'; teal(); x.fill(); blue(); x.fill(); x.fillStyle = '#ffffff'; violet(); x.fill(); }
  },
};

// ---- the cockades: where the mask's ties meet at each temple, a big enamel badge of the company's mark stands over the
// side curls, facing out and a little forward. Seated at the table the kings show the side of the head to the long
// wides (M1 looks down the rows almost along them), so these carry the identity there; up close they frame the face.
const BD = { X0: -7.5, Y0: -7.5, W: 15, H: 15 };
const BADGE_RIM = { openai: '#b9bcc4', anthropic: '#d9b264', google: '#d9b264', xai: '#16161a', meta: '#e6eefc', deepseek: '#eef1ff', qwen: '#e4dcff', kimi: '#2f88ff', glm: '#e8ebf4', doubao: '#eef0ff' };
const BADGE = {
  openai(x, L) {
    const P = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return [Math.cos(a) * 6.4, Math.sin(a) * 6.4]; });
    if (L === 'shape') { roundPoly(x, P, 1.0); x.fill(); return; }
    if (L === 'paint') { fillAll(x, '#d6e0ff'); logoAt(x, 'openai', 0, 0, 9.6, { color: '#121212' }); }
    if (L === 'relief') { x.fillStyle = '#7f7f7f'; roundPoly(x, P, 1.0); x.fill(); logoAt(x, 'openai', 0, 0, 9.6, { color: '#ffffff' }); }
  },
  anthropic(x, L) {
    if (L === 'shape') { logoAt(x, 'anthropic', 0, 0, 14.2, { color: '#ffffff' }); ell(x, 0, 0, 2.2, 2.2); x.fill(); return; }
    if (L === 'paint') {
      fillAll(x, '#d97757');
      const g = x.createRadialGradient(0, 0, 0.5, 0, 0, 7.5); g.addColorStop(0, '#eb9572'); g.addColorStop(1, '#b9582f');
      x.fillStyle = g; x.fillRect(BD.X0, BD.Y0, BD.W, BD.H);
    }
    if (L === 'relief') { ell(x, 0, 0, 1.6, 1.6); x.fill(); }
  },
  google(x, L) {
    const D2R = Math.PI / 180;
    if (L === 'shape') { ell(x, 0, 0, 6.4, 6.4); x.fill(); return; }
    const sect = (a0, a1, col) => { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 9, a0 * D2R, a1 * D2R); x.closePath(); x.fillStyle = col; x.fill(); };
    if (L === 'paint') { sect(-45, 45, '#4285f4'); sect(45, 135, '#ea4335'); sect(135, 225, '#fbbc05'); sect(225, 315, '#34a853'); }
    if (L === 'metal' || L === 'relief') { for (const a of [45, 135, 225, 315]) { bar(x, 0, 0, 9 * Math.cos(a * D2R), 9 * Math.sin(a * D2R), 0.22); x.fill(); } ell(x, 0, 0, 1.0, 1.0); x.fill(); }
  },
  xai(x, L) {
    const X = () => { bar(x, -5.0, 5.6, 5.0, -5.6, 1.45); x.fill(); bar(x, -5.0, -5.6, -1.2, -1.35, 0.6); x.fill(); bar(x, 1.2, 1.35, 5.6, 6.3, 0.6); x.fill(); };
    if (L === 'shape') { X(); return; }
    if (L === 'paint') fillAll(x, '#d6e0ff');
  },
  meta(x, L) {
    const loop = (sx) => {
      x.beginPath(); x.moveTo(0, 0);
      x.bezierCurveTo(sx * 0.8, 1.6, sx * 1.9, 3.3, sx * 3.6, 3.3);
      x.bezierCurveTo(sx * 5.6, 3.3, sx * 6.5, 1.8, sx * 6.5, 0);
      x.bezierCurveTo(sx * 6.5, -1.8, sx * 5.6, -3.3, sx * 3.6, -3.3);
      x.bezierCurveTo(sx * 1.9, -3.3, sx * 0.8, -1.6, 0, 0);
    };
    if (L === 'shape' || L === 'relief') { x.lineWidth = 2.1; loop(-1); x.stroke(); loop(1); x.stroke(); return; }
    if (L === 'paint') { const g = x.createLinearGradient(-7, -2, 7, 3); g.addColorStop(0, '#1a4ce6'); g.addColorStop(1, '#3876ff'); x.fillStyle = g; x.fillRect(BD.X0, BD.Y0, BD.W, BD.H); }
  },
  deepseek(x, L) {
    if (L === 'shape') { logoAt(x, 'deepseek', 0, 0.3, 14.4, { color: '#ffffff' }); return; }
    if (L === 'paint') { fillAll(x, '#4d6bfe'); const g = x.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, 'rgba(140,165,255,0.6)'); g.addColorStop(1, 'rgba(30,50,180,0.5)'); x.fillStyle = g; x.fillRect(BD.X0, BD.Y0, BD.W, BD.H); }
  },
  qwen(x, L) {
    if (L === 'shape' || L === 'relief') { logoAt(x, 'qwen', 0, 0, 13.6, { color: '#ffffff' }); return; }
    if (L === 'paint') { const g = x.createLinearGradient(-6, 6, 6, -6); g.addColorStop(0, '#8a66f6'); g.addColorStop(1, '#4b30c8'); x.fillStyle = g; x.fillRect(BD.X0, BD.Y0, BD.W, BD.H); }
  },
  kimi(x, L) {
    const S = 10.5;
    const m = (u, v) => [u * S, -v * S];
    const K = () => {
      polyP(x, [m(-0.22, -0.25), m(-0.11, -0.25), m(-0.11, 0.25), m(-0.22, 0.25)]); x.fill();
      polyP(x, [m(-0.13, 0.03), m(0.1, -0.25), m(0.24, -0.25), m(-0.02, 0.06)]); x.fill();
      polyP(x, [m(-0.07, 0.0), m(0.03, -0.06), m(0.25, 0.25), m(0.11, 0.25)]); x.fill();
    };
    const dot = () => ell(x, 0.27 * S, 0.27 * S, 1.05, 1.05);
    if (L === 'shape') { x.beginPath(); x.roundRect(-5.8, -5.8, 11.6, 11.6, 2.6); x.fill(); return; }
    if (L === 'paint') { fillAll(x, '#141418'); x.fillStyle = '#d6e0ff'; K(); dot(); x.fillStyle = '#2f8bff'; x.fill(); }
    if (L === 'relief') { K(); dot(); x.fill(); }
  },
  glm(x, L) {
    const Z = () => { polyP(x, [[-3.8, 3.9], [3.9, 3.9], [3.9, 2.5], [-1.1, -2.5], [3.8, -2.5], [3.8, -3.9], [-3.9, -3.9], [-3.9, -2.5], [1.1, 2.5], [-3.8, 2.5]]); x.fill(); };
    if (L === 'shape') { x.beginPath(); x.roundRect(-5.8, -5.8, 11.6, 11.6, 1.8); x.fill(); return; }
    if (L === 'paint') { fillAll(x, '#1a2a80'); x.fillStyle = '#d6e0ff'; Z(); }
    if (L === 'relief') Z();
  },
  doubao(x, L) {
    if (L === 'shape') { logoAt(x, 'doubao', 0, 0, 13.8, {}); return; }
    if (L === 'paint') { fillAll(x, '#2440f0'); logoAt(x, 'doubao', 0, 0, 13.8, {}); }
    if (L === 'relief') { x.save(); x.globalAlpha = 0.5; logoAt(x, 'doubao', 0, 0, 13.8, {}); x.restore(); }
  },
};

// the two cockades of one king (head frame, metres): a domed enamel plate over each temple
function buildBadges(id, F, s) {
  const k = s / 100, M = MASK[id], kb = k * 1.22;                // drawn 15 cm wide on a design 12 cm wide
  const tex = designTextures(BADGE[id], BD, null, 24, 48);
  const bb = tex.bbox;
  const R = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2;
  const geo = designGrid(bb.x0 - 0.4, bb.x1 + 0.4, bb.y0 - 0.4, bb.y1 + 0.4, 0.16, (X, Y) => ({ p: [X, Y, 0.9 * Math.max(0, 1 - (X * X + Y * Y) / (R * R * 1.4))], h: [0, -100] }),
    (X, Y) => tex.sample(X, Y), kb, (X, Y) => [(X - BD.X0) / BD.W, (Y - BD.Y0) / BD.H]);
  const mat = celMaterial({
    color: '#ffffff', id: 38, gloss: M.gloss, litBias: 0.45, shadeMul: 2.6, side: THREE.DoubleSide,
    uniforms: {
      uMaskT: { value: tex.sdfTex }, uMaskA: { value: tex.paintTex }, uDesign: { value: new THREE.Vector4(BD.X0, BD.Y0, BD.W, BD.H) },
      uHoleA: { value: new THREE.Vector4(0, 500, 0.01, 2) }, uHoleB: { value: new THREE.Vector4(0.01, 0.01, 0, 0) },        // no holes
      uMaskK: { value: new THREE.Vector4(kb, 0.45 * kb, 0.55, 0) },
      uMaskP: { value: new THREE.Vector4(0, Math.max(M.gloss, 0.7), M.self + 0.04, 0.36) },
      uRimC: { value: C(BADGE_RIM[id]) }, uSweat: { value: 0 }, uSweatT: { value: 0 },
    },
    vsHead: 'attribute vec2 aHead; varying vec2 vHead;\n' + HOLE_GLSL,
    fsHead: 'varying vec2 vHead;\n' + SDF + HOLE_GLSL,
    vertex: MASK_VERT, pattern: MASK_PAT,
  });
  // past the side curls: the outermost curl surface, plus a gap
  const [, rC] = F.curls;
  const xOut = 9.95 + rC + 0.55;
  const out = [];
  for (const sg of [1, -1]) {
    const m = new THREE.Mesh(geo, mat);
    // badge +X runs toward the back of the head on his left side (+x), toward the face on his right; +Z out; turned 17° forward
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -sg), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sg, 0, 0));
    m.quaternion.setFromRotationMatrix(basis).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sg * 0.3));
    m.position.set(sg * xOut * k, 3.0 * k, -2.0 * k);
    out.push(m);
  }
  return out;
}

// exact Euclidean distance transform (Felzenszwalb): distance (px) from every pixel to the nearest pixel with on[i] = 1
function edt(on, w, h) {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = on[i] ? 0 : INF;
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; pass(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; pass(w); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}

// build a design's textures over area A: sdf (R distance, G gilt, B relief; rows bottom-up so v = (Y - Y0) / H) and
// paint (canvas); sdfK / paintK px per cm
function designTextures(draw, AREA = MD, cuts = null, sdfK = SDF_K, paintK = PAINT_K) {
  const MD = AREA, SDF_K = sdfK, A0 = AREA;
  const shape = designCanvas(SDF_K, false, A0); draw(shape.x, 'shape'); if (cuts) cuts(shape.x);
  const metal = designCanvas(SDF_K, true, A0); draw(metal.x, 'metal');
  const relief = designCanvas(SDF_K, true, A0); draw(relief.x, 'relief');
  const w = shape.c.width, h = shape.c.height;
  const A = shape.x.getImageData(0, 0, w, h).data, Mt = metal.x.getImageData(0, 0, w, h).data, Rl = relief.x.getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h), outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const a = A[i * 4 + 3] > 127; inside[i] = a ? 1 : 0; outside[i] = a ? 0 : 1; }
  const dOut = edt(inside, w, h), dIn = edt(outside, w, h);
  const sd = new Float32Array(w * h);
  const data = new Uint8Array(w * h * 4);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    const dpx = inside[i] ? -(dIn[i] - 0.5) : dOut[i] - 0.5;
    const dcm = dpx / SDF_K;
    const row = h - 1 - r;                                   // bottom-up
    const j = row * w + c;
    sd[j] = dcm;
    data[j * 4] = Math.round(255 * clamp(0.5 + dcm / (2 * SDF_R)));
    data[j * 4 + 1] = Mt[i * 4];
    data[j * 4 + 2] = Rl[i * 4];
    data[j * 4 + 3] = 255;
    if (inside[i]) { const X = MD.X0 + (c + 0.5) / SDF_K, Y = MD.Y0 + (row + 0.5) / SDF_K; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
  }
  const sdfTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  sdfTex.magFilter = THREE.LinearFilter; sdfTex.minFilter = THREE.LinearFilter; sdfTex.generateMipmaps = false;
  sdfTex.colorSpace = THREE.NoColorSpace; sdfTex.needsUpdate = true;
  const paint = designCanvas(paintK, true, A0); draw(paint.x, 'paint');
  const paintTex = new THREE.CanvasTexture(paint.c);
  paintTex.colorSpace = THREE.NoColorSpace; paintTex.anisotropy = 8; paintTex.generateMipmaps = true; paintTex.minFilter = THREE.LinearMipmapLinearFilter;
  // CPU lookup of the silhouette distance (bilinear), cm
  const sample = (X, Y) => {
    const fx = (X - MD.X0) * SDF_K - 0.5, fy = (Y - MD.Y0) * SDF_K - 0.5;
    const cx = Math.max(0, Math.min(w - 2, Math.floor(fx))), cy = Math.max(0, Math.min(h - 2, Math.floor(fy)));
    const tx = clamp(fx - cx), ty = clamp(fy - cy);
    const a = sd[cy * w + cx], b = sd[cy * w + cx + 1], c2 = sd[(cy + 1) * w + cx], d2 = sd[(cy + 1) * w + cx + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d2 * tx) * ty;
  };
  return { sdfTex, paintTex, bbox: { x0, x1, y0, y1 }, sample };
}

// the eye holes (JS twin of holeSDF): hole = [cx, cy, rx, pe, top, bottom, tilt]
function holeSDFjs(hole, fx, fy) {
  const [cx, cy, rx, pe, top, bot, tilt] = hole;
  const qx = Math.abs(fx) - cx; let qy = fy - cy; qy -= tilt * qx;
  const ry = qy > 0 ? top : bot;
  const nx = Math.max(Math.abs(qx) / rx, 1e-4), ny = Math.max(Math.abs(qy) / ry, 1e-4);
  const px = Math.pow(nx, pe), py = Math.pow(ny, pe), s = px + py, e = Math.pow(s, 1 / pe);
  const k = Math.pow(s, 1 / pe - 1), gx = (k * px) / nx / rx, gy = (k * py) / ny / ry;
  return (e - 1) / Math.max(Math.hypot(gx, gy), 1e-3);
}
function sdStrokeJS(px, py, A, Cc, B, w0, w1, wm) {
  let d = 1e5, prx = A[0], pry = A[1];
  for (let i = 1; i <= 8; i++) {
    const t1 = i / 8, s1 = 1 - t1;
    const cx = s1 * s1 * A[0] + 2 * s1 * t1 * Cc[0] + t1 * t1 * B[0], cy = s1 * s1 * A[1] + 2 * s1 * t1 * Cc[1] + t1 * t1 * B[1];
    const pax = px - prx, pay = py - pry, bax = cx - prx, bay = cy - pry;
    const hh = clamp((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8));
    const t = (i - 1 + hh) / 8, w = w0 + (w1 - w0) * t + wm * 4 * t * (1 - t);
    d = Math.min(d, Math.hypot(pax - bax * hh, pay - bay * hh) - w);
    prx = cx; pry = cy;
  }
  return d;
}

// The mask's surface for one head: S(X, Y) -> { p: mask point (cm, head frame), h: [x, y] the face point under it }.
// Each height Y gets a horizontal section around the head (the skull's superellipse clipped by the face plane, the nose
// draped), pushed MASK_OFF out, flaring away above the brow (past the crown band), at the temples (past the curls) and
// low on the cheeks; X is the arc length along that section.
function maskSurface(F) {
  const a = HEAD.a * (F.wide ?? 1), { b, c, p, q } = HEAD;
  const [nl, nw] = F.nose;
  const NSy = NOSE_SECS.map(([y, w, d]) => [3.4 + (y - 3.4) * nl, w * nw, d]);
  const noseAt = (y) => {
    if (y > NSy[0][0] || y < NSy[NSy.length - 1][0]) return null;
    for (let i = 0; i < NSy.length - 1; i++) if (y <= NSy[i][0] && y >= NSy[i + 1][0]) {
      const t = (NSy[i][0] - y) / (NSy[i][0] - NSy[i + 1][0]);
      return [NSy[i][1] + (NSy[i + 1][1] - NSy[i][1]) * t, NSy[i][2] + (NSy[i + 1][2] - NSy[i][2]) * t];
    }
    return null;
  };
  const faceZm = (x, y) => { let z = faceZ(x, y, F); const n = noseAt(y); if (n) z += Math.max(0, n[1] + 0.1) * Math.exp(-((x / (n[0] * 1.6)) ** 2)); return z; };
  const headR = (phi, y) => {
    const yc = clamp(y, -6.5, 7.5);
    const ky = Math.pow(Math.max(1e-4, 1 - Math.pow(Math.abs(yc / b), q)), 1 / q);
    const jaw = sstep(-1, -13, yc);
    const ax = a * (1 - (0.17 - 0.09 * F.cheek) * jaw), cz = c * (1 - 0.06 * jaw);
    const sp = Math.abs(Math.sin(phi)), cp = Math.abs(Math.cos(phi));
    let r = ky / Math.pow(Math.pow(sp / ax, p) + Math.pow(cp / cz, p), 1 / p);
    const cph = Math.cos(phi);
    if (cph > 0.08) { let rf = r; for (let i = 0; i < 10; i++) rf = faceZm(rf * Math.sin(phi), yc) / cph; r = Math.min(r, rf); }
    return r;
  };
  const N = 351, PH = 1.75, mid = (N - 1) / 2;
  const cache = new Map();
  function section(Y) {
    const key = Math.round(Y * 1000);
    let sec = cache.get(key);
    if (sec) return sec;
    const phi = new Float64Array(N), rm = new Float64Array(N), rh = new Float64Array(N), s = new Float64Array(N);
    const up = 0.36 * Math.pow(Math.max(0, Y - 7.4), 1.3), down = 0.12 * Math.pow(Math.max(0, -3.2 - Y), 1.3);
    for (let i = 0; i < N; i++) {
      const ph = -PH + (2 * PH * i) / (N - 1);
      phi[i] = ph; rh[i] = headR(ph, Y);
      rm[i] = rh[i] + MASK_OFF + up + down + 3.1 * sstep(0.88, 1.32, Math.abs(ph));
    }
    for (let i = mid + 1; i < N; i++) s[i] = s[i - 1] + Math.hypot(rm[i] * Math.sin(phi[i]) - rm[i - 1] * Math.sin(phi[i - 1]), rm[i] * Math.cos(phi[i]) - rm[i - 1] * Math.cos(phi[i - 1]));
    for (let i = mid - 1; i >= 0; i--) s[i] = s[i + 1] - Math.hypot(rm[i] * Math.sin(phi[i]) - rm[i + 1] * Math.sin(phi[i + 1]), rm[i] * Math.cos(phi[i]) - rm[i + 1] * Math.cos(phi[i + 1]));
    sec = { phi, rm, rh, s };
    cache.set(key, sec);
    return sec;
  }
  return function S(X, Y) {
    const { phi, rm, rh, s } = section(Y);
    let lo = 0, hi = N - 1;
    if (X <= s[0]) hi = 1; else if (X >= s[N - 1]) lo = N - 2;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= X) lo = m; else hi = m; }
    const t = (X - s[lo]) / (s[hi] - s[lo]);
    const ph = phi[lo] + (phi[hi] - phi[lo]) * t, r = rm[lo] + (rm[hi] - rm[lo]) * t, r0 = rh[lo] + (rh[hi] - rh[lo]) * t;
    return { p: [r * Math.sin(ph), Y, r * Math.cos(ph)], h: [r0 * Math.sin(ph), Y] };
  };
}
const surfNormal = (S, X, Y) => {
  const e = 0.05;
  const a = S(X + e, Y).p, b = S(X - e, Y).p, c = S(X, Y + e).p, d = S(X, Y - e).p;
  return new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]).cross(new THREE.Vector3(c[0] - d[0], c[1] - d[1], c[2] - d[2])).normalize();
};

// a grid over [x0, x1] x [y0, y1] (design cm) mapped by place(X, Y) -> { p: [x,y,z] cm, h? }; triangles whose corners are
// all outside (inside(X, Y) > 0.25 cm) are dropped
function designGrid(x0, x1, y0, y1, step, place, dist, k, uvOf) {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), ny = Math.max(2, Math.ceil((y1 - y0) / step));
  const cols = nx + 1, n = cols * (ny + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), hd = new Float32Array(n * 2), dd = new Float32Array(n);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const X = x0 + ((x1 - x0) * i) / nx, Y = y0 + ((y1 - y0) * j) / ny, v = j * cols + i;
    const P = place(X, Y);
    pos[v * 3] = P.p[0] * k; pos[v * 3 + 1] = P.p[1] * k; pos[v * 3 + 2] = P.p[2] * k;
    const [u0, u1] = uvOf(X, Y); uv[v * 2] = u0; uv[v * 2 + 1] = u1;
    if (P.h) { hd[v * 2] = P.h[0]; hd[v * 2 + 1] = P.h[1]; }
    dd[v] = dist(X, Y, P);
  }
  const idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * cols + i, b2 = a + 1, c = a + cols, d = c + 1;
    if (Math.min(dd[a], dd[b2], dd[d]) < 0.3) idx.push(a, b2, d);
    if (Math.min(dd[a], dd[d], dd[c]) < 0.3) idx.push(a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aHead', new THREE.BufferAttribute(hd, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const MASK_VERT = /* glsl */ `
  vHead = aHead;
  {
    vec4 T = textureLod(uMaskT, uv, 0.0);
    float dS = (T.r - 0.5) * ${(2 * SDF_R).toFixed(1)};
    float d = max(dS, -holeSDF(aHead));
    pos -= nrm * uMaskK.y * smoothstep(-uMaskK.z, 0.06, d);
  }
`;
const MASK_PAT = /* glsl */ `
  vec2 D = vUv * uDesign.zw + uDesign.xy;
  vec4 T = texture(uMaskT, vUv);
  float dS = (T.r - 0.5) * ${(2 * SDF_R).toFixed(1)};
  float dH = holeSDF(vHead);
  float d = max(dS, -dH);
  if(d > 0.0) discard;
  float px = max(length(fwidth(D)), 1e-4);
  float aa = px * 0.75;
  float cu = smoothstep(0.035, 0.01, px);
  col = pow(texture(uMaskA, vUv).rgb, vec3(1.22));
  float h = 0.0;
  // facets (Qwen): a triangular lattice, every facet tilted and shaded on its own, fine silver seams
  if(uMaskP.x > 0.5){
    float Sf = 2.7;
    float lv = D.y / (0.866 * Sf), lu = D.x / Sf - 0.5 * lv;
    vec2 fr = fract(vec2(lu, lv));
    float up = step(1.0, fr.x + fr.y);
    vec2 tid = floor(vec2(lu, lv)) * vec2(2.0, 1.0) + vec2(up, 0.0);
    float h1 = hash12(tid + 11.0), h2 = hash12(tid + 47.0), h3 = hash12(tid + 83.0);
    float inlay = smoothstep(0.2, 0.5, T.b);
    col *= mix(0.74 + 0.5 * h1, 1.0, inlay);
    col = mix(col, col * vec3(1.15, 0.9, 1.12), h3 * 0.5 * (1.0 - inlay));
    h += dot(D, (vec2(h2, h3) - 0.5) * 0.5) * (1.0 - inlay);
    float e1 = min(fract(lu), 1.0 - fract(lu)), e2 = min(fract(lv), 1.0 - fract(lv)), e3 = min(fract(lu + lv), 1.0 - fract(lu + lv));
    float e = min(e1, min(e2, e3)) * Sf * 0.866;
    col = mix(col, uRimC * 0.85, cov(e - max(0.025, px * 0.4), aa) * smoothstep(0.12, 0.04, px) * 0.45 * (1.0 - inlay));
  }
  // the rim: a rounded bead of enamel / gilt along the outline and around the eye holes, a groove inside it
  float rimW = uMaskP.w, rimWh = rimW * 0.72;
  float rimO = smoothstep(-rimW - aa, -rimW + aa, dS);
  float rimH = smoothstep(-rimWh - aa, -rimWh + aa, -dH);
  float rim = max(rimO, rimH);
  h += 0.15 * sin(3.1416 * clamp(-dS / rimW, 0.0, 1.0)) * rimO;
  h += 0.12 * sin(3.1416 * clamp(dH / rimWh, 0.0, 1.0)) * rimH;
  h += 0.13 * smoothstep(0.15, 0.85, T.b);                 // raised inlays
  col = mix(col, uRimC, rimO);
  col = mix(col, mix(col * 0.5, uRimC, uMaskK.w), rimH * (1.0 - rimO));      // the eye holes: a darker bevel (or the rim)
  float groove = max(cov(abs(dS + rimW) - 0.035, aa) * (1.0 - rimH), cov(abs(dH - rimWh) - 0.03, aa) * (1.0 - rimO));
  col *= 1.0 - 0.5 * groove * smoothstep(0.12, 0.04, px);
  // gilt inlays
  vec3 gilt = vec3(0.79, 0.6, 0.27);
  col = mix(col, gilt, T.g);
  float metal = max(rim, T.g);
  // old lacquer: craquelure and a little wear, only up close; the edge rubbed through the enamel / gilt to dark bole
  if(cu > 0.01){
    vec2 cc = D * 1.6;
    vec2 ci = floor(cc), cf = fract(cc);
    float m1 = 9.0, m2 = 9.0;
    for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 pt = o + hash22(ci + o) - cf;
      float dd = dot(pt, pt);
      if(dd < m1){ m2 = m1; m1 = dd; } else if(dd < m2){ m2 = dd; }
    }
    float crack = 1.0 - smoothstep(0.0, 0.06, sqrt(m2) - sqrt(m1));
    col *= 1.0 - 0.28 * crack * cu * (1.0 - metal);
  }
  float wear = smoothstep(0.62, 0.85, vnoise(D * 2.1)) * rimO * smoothstep(-0.12, -0.02, d);
  col = mix(col, vec3(0.2, 0.09, 0.05), wear * 0.55);
  col *= 0.94 + 0.08 * vnoise(D * 0.9);
  gloss = mix(uMaskP.y, 1.0, max(metal, smoothstep(0.3, 0.8, T.b) * 0.8));
  specTh = mix(0.968, 0.952, metal);
  N = bumpN(N, vWorld, h * uMaskK.x);
  // seen small (the wides) the enamel holds its colour like a lit badge, so the ten masks read across the room
  emis += col * (uMaskP.z + 0.45 * smoothstep(0.06, 0.5, px));
  // sweat on the lacquer
  if(uSweat > 0.0){
    vec4 sw = sweatAt(D, uSweatT, uSweat, px);
    float reach = clamp(lampReach(vWorld), 0.0, 1.5);
    col = mix(col, col * 1.15 + 0.03, (sw.x - sw.w) * 0.5);
    col = mix(col, col * 0.45, sw.w * 0.8);
    col = mix(col, col * 0.75, sw.z * 0.6);
    col = mix(col, vec3(1.0), sw.y);
    emis += vec3(0.95, 0.9, 0.8) * sw.y * (0.45 + 0.6 * reach);
    gloss = mix(gloss, 1.0, max(sw.x, sw.z) * 0.8);
  }
  if(!gl_FrontFacing){ col = vec3(0.1, 0.07, 0.055); emis = vec3(0.0); gloss = 0.05; }
`;
// the brow plate: a tapered enamel crescent riding the mask over each eye (vUv = design cm at rest)
const BROW_VERT = /* glsl */ `
  {
    vec2 Q = vec2(abs(uv.x), uv.y);
    float d = sdStroke(Q, uBrowA.xy, uBrowA.zw, uBrowB.xy, uBrowB.z, uBrowB.w, uBrowC.x);
    pos -= nrm * uBrowC.z * smoothstep(-0.32, 0.06, d);
  }
`;
const BROW_PAT = /* glsl */ `
  vec2 Q = vec2(abs(vUv.x), vUv.y);
  float d = sdStroke(Q, uBrowA.xy, uBrowA.zw, uBrowB.xy, uBrowB.z, uBrowB.w, uBrowC.x);
  if(d > 0.0) discard;
  float px = max(length(fwidth(vUv)), 1e-4), aa = px * 0.75;
  float edge = smoothstep(-0.2 - aa, -0.2 + aa, d);
  col = mix(col, uBrowRim, edge);
  col *= 1.0 - 0.4 * cov(abs(d + 0.2) - 0.03, aa) * smoothstep(0.12, 0.04, px);
  float h = 0.16 * sqrt(clamp(-d / 0.45, 0.0, 1.0));
  N = bumpN(N, vWorld, h * uBrowC.y);
  gloss = 0.95; specTh = 0.96;
  emis += col * (0.12 + 0.4 * smoothstep(0.06, 0.5, px));
  if(uSweat > 0.0){
    vec4 sw = sweatAt(vUv + vec2(0.3, 0.0), uSweatT, uSweat, px);
    col = mix(col, col * 0.5, sw.w * 0.7);
    col = mix(col, vec3(1.0), sw.y); emis += vec3(0.9) * sw.y * 0.6;
  }
  if(!gl_FrontFacing){ col = vec3(0.1, 0.07, 0.055); emis = vec3(0.0); }
`;
// brow plate poses: [angle (rad, + = the inner end down), lift (cm)]
const BROW_POSE = { flat: [0, 0], angry: [0.36, -0.42], worried: [-0.3, 0.32], raised: [-0.04, 0.95], archHi: [-0.06, 1.05], archLo: [0.12, -0.28], sleep: [-0.1, -0.42] };

// the mask, its two brow plates and their materials for one king (head frame, metres)
function buildMask(id, F, s, faceU) {
  const M = MASK[id];
  const k = s / 100;
  const tex = designTextures(DESIGN[id], MD, standardCuts);
  const S = maskSurface(F);
  const ex = EYE_X * (0.97 + 0.03 * F.eye), ey = EYE_Y;
  const Wn = 1.88 * F.eye * EYE_WK;                                       // the painted eye's half width
  const hole = [ex, ey + 0.05, Wn + 0.66, M.pe, 1.5 * F.eye * EYE_K + 0.42, 1.15 * F.eye * EYE_K + 0.4, (F.tilt ?? 0) / Wn * 0.9];
  faceU.uHoleA.value.set(hole[0], hole[1], hole[2], hole[3]);
  faceU.uHoleB.value.set(hole[4], hole[5], hole[6], 0);
  const bb = tex.bbox;
  const geo = designGrid(Math.max(MD.X0, bb.x0 - 0.5), Math.min(MD.X0 + MD.W, bb.x1 + 0.5), Math.max(MD.Y0, bb.y0 - 0.5), Math.min(MD.Y0 + MD.H, bb.y1 + 0.5), 0.2,
    S, (X, Y, P) => Math.max(tex.sample(X, Y), -holeSDFjs(hole, P.h[0], P.h[1])), k, (X, Y) => [(X - MD.X0) / MD.W, (Y - MD.Y0) / MD.H]);
  const mat = celMaterial({
    color: '#ffffff', id: 38, gloss: M.gloss, litBias: 0.42, shadeMul: 2.6, side: THREE.DoubleSide,
    uniforms: {
      uMaskT: { value: tex.sdfTex }, uMaskA: { value: tex.paintTex }, uDesign: { value: new THREE.Vector4(MD.X0, MD.Y0, MD.W, MD.H) },
      uHoleA: faceU.uHoleA, uHoleB: faceU.uHoleB,
      uMaskK: { value: new THREE.Vector4(k, (MASK_OFF - 0.06) * k, 0.7, 0) },
      uMaskP: { value: new THREE.Vector4(id === 'qwen' ? 1 : 0, M.gloss, M.self, M.rimW) },
      uRimC: { value: C(M.rim) }, uSweat: faceU.uSweat, uSweatT: faceU.uSweatT,
    },
    vsHead: 'attribute vec2 aHead; varying vec2 vHead;\n' + HOLE_GLSL,
    fsHead: 'varying vec2 vHead;\n' + SDF + HOLE_GLSL,
    vertex: MASK_VERT, pattern: MASK_PAT,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // brow plates over the hole tops: a tapered crescent, inner end thick (+X plate; the other is its mirror)
  const top = hole[1] + hole[4];
  const A = [ex - hole[2] + 0.75, top + 0.12], B = [ex + hole[2] + 0.15, hole[1] + hole[4] * 0.62 + hole[6] * hole[2] + 0.25], Cc = [ex - 0.35, top + 1.3];
  const wid = [0.62, 0.2, 0.16];
  const browMat = celMaterial({
    color: M.brow, id: 39, gloss: 0.95, litBias: 0.4, shadeMul: 2.4, side: THREE.DoubleSide,
    uniforms: {
      uBrowA: { value: new THREE.Vector4(A[0], A[1], Cc[0], Cc[1]) }, uBrowB: { value: new THREE.Vector4(B[0], B[1], wid[0], wid[1]) },
      uBrowC: { value: new THREE.Vector4(wid[2], k, 0.3 * k, 0) }, uBrowRim: { value: C(M.browRim) },
      uSweat: faceU.uSweat, uSweatT: faceU.uSweatT,
    },
    vsHead: STROKE_GLSL, fsHead: SDF, vertex: BROW_VERT, pattern: BROW_PAT,
  });
  const brows = {};
  for (const sg of [1, -1]) {
    const pv = [sg * (A[0] + B[0] + Cc[0]) / 3, (A[1] + B[1] + Cc[1]) / 3];
    const n0 = surfNormal(S, pv[0], pv[1]);
    const P0 = S(pv[0], pv[1]).p;
    const origin = new THREE.Vector3(...P0).addScaledVector(n0, 0.42);
    const yA = new THREE.Vector3(0, 1, 0).addScaledVector(n0, -n0.y).normalize(), xA = new THREE.Vector3().crossVectors(yA, n0);
    const basis = new THREE.Matrix4().makeBasis(xA, yA, n0), inv = basis.clone().transpose();
    const tmp = new THREE.Vector3();
    const x0 = sg > 0 ? A[0] - 1.0 : -(B[0] + 1.0), x1 = sg > 0 ? B[0] + 1.0 : -(A[0] - 1.0);
    const g = designGrid(x0, x1, Math.min(A[1], B[1]) - 1.0, Cc[1] + 0.9, 0.12, (X, Y) => {
      const p = S(X, Y).p, n = surfNormal(S, X, Y);
      tmp.set(p[0], p[1], p[2]).addScaledVector(n, 0.42).sub(origin).applyMatrix4(inv);
      return { p: [tmp.x, tmp.y, tmp.z] };
    }, (X, Y) => sdStrokeJS(Math.abs(X), Y, A, Cc, B, wid[0], wid[1], wid[2]), k, (X, Y) => [X, Y]);
    const plate = new THREE.Mesh(g, browMat);
    const grp = new THREE.Group();
    grp.position.copy(origin).multiplyScalar(k);
    grp.quaternion.setFromRotationMatrix(basis);
    grp.add(plate);
    brows[sg > 0 ? 'P' : 'N'] = { group: grp, base: grp.quaternion.clone(), origin: grp.position.clone(), up: yA.clone(), sg };
  }
  // the mask centre for maskFrame: between and a little above the eyes, on the mask's face
  const centre = S(0, ey + 1.2).p.map((v) => v * k);
  const badges = buildBadges(id, F, s);
  return { mesh, mat, browMat, brows, badges, centre, hole };
}

// ---------------------------------------------------------------- per-king face uniforms from an expression
function faceUniforms(F) {
  const v4 = () => new THREE.Vector4();
  return {
    uEyeA: { value: v4() }, uEyeB: { value: v4() }, uEyeC: { value: v4() }, uIris: { value: v4() },
    uBrowN0: { value: v4() }, uBrowN1: { value: v4() }, uBrowP0: { value: v4() }, uBrowP1: { value: v4() },
    uMouthA: { value: v4() }, uMouthB: { value: v4() }, uMouthC: { value: v4() }, uFold: { value: v4() },
    uFaceGeo: { value: new THREE.Vector4(EYE_X * (0.97 + 0.03 * F.eye), EYE_Y, F.nose[1], MOUTH_Y) },
    uFaceK: { value: new THREE.Vector4(F.age, F.cheek, F.browOutline ?? 0, 1) },
    uFaceC: { value: new THREE.Vector4(F.stache === 'none' || F.stache === 'pencil' ? 1 : 0, F.beard === 'none' ? 1 : 0, 0, 0) },
    uBrowCol: { value: C(F.browCol) }, uLipCol: { value: C(F.lip ?? '#c98c7c') }, uIrisCol: { value: C(F.iris ?? '#2e2119') },
    uBeardP: { value: new THREE.Vector4(BEARD_PAINT[F.beard] ? 1 : 0, ...(BEARD_PAINT[F.beard] ?? [0, 0, 0])) },
    uBeardQ: { value: new THREE.Vector4(BEARD_PAINT[F.beard]?.[3] ?? 0, BEARD_PAINT[F.beard]?.[4] ?? 0, 0, 0) },
    uBeardCol: { value: C(F.beardCol) },
    uSocket: { value: 0.3 },
    uHoleA: { value: new THREE.Vector4(EYE_X, EYE_Y, 2.8, 2.2) }, uHoleB: { value: new THREE.Vector4(2.1, 1.7, 0, 0) },
    uSweat: { value: 0 }, uSweatT: { value: 0 },
  };
}
function setFace(U, F, f = {}, sleepy = false) {
  const eyes = sleepy ? 'sleep' : f.eyes;
  const E = EYE_SHAPES[eyes] ?? EYE_SHAPES.open;
  const ey = F.eye * EYE_K;
  const W = 1.88 * F.eye * EYE_WK;
  const heavy = F.lid * 0.22;                                       // heavy-lidded kings: the lid sits lower
  const cut = (E.cut ?? 9) * EYE_K;
  U.uEyeA.value.set(W, E.hu * ey, E.hl * ey, (F.tilt + (E.tilt ?? 0)) * ey);
  U.uEyeB.value.set(Math.min(cut, E.hu * ey - heavy) , E.cutS ?? 0, (E.bow ?? 0) * ey, E.shut ?? 0);
  U.uEyeC.value.set((E.crease ?? 1.4) * ey + 0.12 * F.lid, eyes === 'closed' || eyes === 'shut' || eyes === 'sleep' ? 0 : 1, 1, 1.4);
  const lk = f.look ?? [0, 0];
  let ix = (E.ix ?? 0) + clamp(lk[0], -1, 1) * 0.5 * W, iy = ((E.iy ?? 0) + clamp(lk[1], -1, 1) * 0.28) * EYE_K;
  if (eyes === 'side') ix = (lk[0] >= 0 ? 1 : -1) * 0.56 * W;
  U.uIris.value.set(ix, iy, (E.ir ?? 0.8) * ey * 1.04, clamp(f.pupil ?? E.pupil ?? 0.36));
  // brows
  const by = F.browY, bt = F.brow;
  const setBrow = (U0, U1, shape) => {
    const [p0, c, p2] = shape;
    const [bi, bm, bo] = F.bias ?? [0, 0, 0];
    U0.value.set(p0[0], p0[1] + by + bi, c[0], c[1] + by + bm);
    U1.value.set(p2[0], p2[1] + by + bo, 0.38 * bt, 0.075 * bt);
  };
  const bname = f.brows ?? 'flat';
  if (bname === 'arch') { setBrow(U.uBrowN0, U.uBrowN1, BROW_SHAPES.archLo); setBrow(U.uBrowP0, U.uBrowP1, BROW_SHAPES.archHi); }
  else { const sh = BROW_SHAPES[bname] ?? BROW_SHAPES.flat; setBrow(U.uBrowN0, U.uBrowN1, sh); setBrow(U.uBrowP0, U.uBrowP1, sh); }
  // mouth
  const Mo = MOUTH_SHAPES[f.mouth] ?? MOUTH_SHAPES.flat;
  const [mbN, mbP] = F.mbias ?? [0, 0];
  const mk = MOUTH_K;
  U.uMouthA.value.set(Mo.W * mk, (Mo.cN + mbN) * mk, (Mo.cP + mbP) * mk, Mo.bend * mk);
  U.uMouthB.value.set((Mo.ht ?? 0) * mk, (Mo.hb ?? 0) * mk, (Mo.tt ?? 0) * mk, (Mo.tb ?? 0) * mk);
  U.uMouthC.value.set(Mo.tongue ?? 0, Mo.sq ?? 0, Mo.dimN ?? 0, Mo.dimP ?? 0);
  // folds: smile, frown (between the brows), forehead, chin
  const frownL = { angry: 1 }[bname] ?? 0, fore = { worried: 1, raised: 0.85 }[bname] ?? 0;
  U.uFold.value.set(Mo.smile ?? 0, Math.max(frownL, f.eyes === 'glare' ? 0.6 : 0, f.eyes === 'shut' ? 0.9 : 0, Mo.frown ?? 0), Math.max(fore, f.eyes === 'wide' ? 0.35 : 0), Mo.chin ?? 0);
  U.uSocket.value = clamp(f.socket ?? 0.3);
  return Mo.jaw ?? 0;
}

export function makeKings(ctx = {}) {
  void ctx;
  const root = new THREE.Group();
  const kings = {};
  const handCache = {};
  for (const K of KINGS) {
    const st = STYLE[K.id];
    const F = { ...FACE[K.id] };
    F.browCol = F.browCol ?? shade(st.hair, -0.12);
    F.browOutline = new THREE.Color(st.hair).getHSL({}).l > 0.5 ? 1 : 0;
    F.beardCol = st.hair;
    const s = KING_SCALE * K.size;
    const robeU = { uS: { value: s }, uTrim: { value: C(st.trim) }, uFloorL: { value: -SEAT_H / s }, uCut: { value: -99 } };
    const robeMat = celMaterial({ color: st.robe, id: 20, gloss: 0.15, uniforms: robeU, pattern: ROBE_PAT });
    // the robe itself: below the hips its skirt stays hanging to the floor when he leans or half-stands (uSkirt)
    const skirtU = { uSkirt: { value: new THREE.Matrix4() } };
    const robeBodyMat = celMaterial({ color: st.robe, id: 20, gloss: 0.15, uniforms: { ...robeU, ...skirtU }, pattern: ROBE_PAT, vertex: SKIRT_VERT });
    const metal = celMaterial({ color: st.metal, id: 24, gloss: 1, pattern: METAL_PAT });
    const ermine = celMaterial({ color: '#e9e2d2', id: 23, gloss: 0, pattern: ERMINE_PAT });
    const hairMat = celMaterial({ color: st.hair, id: 25, gloss: 0.4, litBias: 0.2, shadeMul: 2.0, uniforms: { uS: { value: s } }, pattern: HAIR_PAT });
    const curlMat = (r) => celMaterial({ color: st.hair, id: 25, gloss: 0.4, litBias: 0.25, shadeMul: 2.0, uniforms: { uS: { value: s }, uCurlR: { value: r } }, pattern: CURL_PAT });
    const beardU = { uS: { value: s }, uJaw: { value: 0 } };
    const beardMat = celMaterial({ color: st.hair, id: 25, gloss: 0.35, litBias: 0.4, shadeMul: 2.4, uniforms: beardU, fsHead: SDF, pattern: BEARD_PAT });
    const stacheMat = celMaterial({ color: shade(st.hair, -0.04), id: 25, gloss: 0.4, litBias: 0.3, shadeMul: 2.0, pattern: STACHE_PAT });
    const face = { uS: { value: s }, ...faceUniforms(F) };
    const headMat = celMaterial({ color: F.skin, id: 21, gloss: 0.22, litBias: 0.75, shadeMul: 3.2, uniforms: face, fsHead: SDF + HOLE_GLSL, pattern: FACE_PAT });
    const skinMat = celMaterial({ color: F.skin, id: 21, gloss: 0.25, litBias: 0.2, shadeMul: 1.7 });
    const velvet = celMaterial({ color: st.robe, id: 20, gloss: 0.1 });
    const mats = { robe: robeMat, velvet, metal, ermine, hair: hairMat, head: headMat, skin: skinMat };

    const seat = new THREE.Group();
    const sp = seatPos(K.id); seat.position.set(...sp); seat.rotation.y = seatYaw(K.id);
    root.add(seat);
    const chair = buildChair(s); seat.add(chair);
    // everything that flattens (the chair stays): its matrix is the press onto the card plane
    const squash = new THREE.Group(); squash.matrixAutoUpdate = false; seat.add(squash);
    const body = new THREE.Group(); squash.add(body);          // lean / turn pivot at the hips
    const robe = new THREE.Mesh(buildBody(s), robeBodyMat); body.add(robe);
    const collar = new THREE.Mesh(tube(Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU; return [Math.sin(a) * 0.17 * s, (0.585 + 0.012 * Math.cos(a)) * s, Math.cos(a) * 0.115 * s - 0.035 * s]; }), 0.05 * s, 64, 12, true), ermine);
    body.add(collar);
    const chain = new THREE.Mesh(tube([[-0.15 * s, 0.57 * s, 0.02 * s], [-0.09 * s, 0.47 * s, 0.11 * s], [0, 0.43 * s, 0.14 * s], [0.09 * s, 0.47 * s, 0.11 * s], [0.15 * s, 0.57 * s, 0.02 * s]], 0.011 * s, 40, 8), metal);
    body.add(chain);
    const plateTex = logoPlate(K.id);
    const medal = new THREE.Group();
    const medalMat = celMaterial({ color: '#ffffff', id: 27, gloss: 0.7, uniforms: { uMap: { value: plateTex } }, pattern: 'col = texture(uMap, vUv).rgb;' });
    medal.add(new THREE.Mesh(new THREE.CircleGeometry(0.052 * s, 36), medalMat));
    medal.add(new THREE.Mesh(new THREE.TorusGeometry(0.052 * s, 0.008 * s, 8, 36), metal));
    medal.position.set(0, 0.385 * s, 0.155 * s); medal.rotation.x = -0.2; body.add(medal);
    // head assembly
    const neck = new THREE.Group(); neck.position.set(0, 0.62 * s, -0.025 * s); body.add(neck);
    const headPivot = new THREE.Group(); neck.add(headPivot);
    const headC = new THREE.Group(); headC.position.set(0, 0.16 * s, 0.01 * s); headPivot.add(headC);
    const neckMat = celMaterial({ color: shade(F.skin, -0.2), id: 21, gloss: 0.1, litBias: -0.1, shadeMul: 1.4 });
    const neckMesh = new THREE.Mesh(lathe([[0.055 * s, -0.02 * s], [0.052 * s, 0.06 * s], [0.05 * s, 0.13 * s]], 20), neckMat); neck.add(neckMesh);
    const head = new THREE.Mesh(buildHead(s, F), headMat); headC.add(head);
    const k = s / 100;
    // hair: a bob behind, rolled curls framing the face at the sides under the crown, a row at the nape
    const hair = new THREE.Mesh(superEllipsoid(10.3 * k, 12.4 * k, 9.4 * k, 2.4, 2.6, 36, 22), hairMat);
    hair.position.set(0, -0.8 * k, -4.4 * k); headC.add(hair);
    const [nC, rC, yLow] = F.curls;
    const matC = curlMat(rC);
    for (const sx of [-1, 1]) for (let i = 0; i < nC; i++) {
      const v = nC > 1 ? i / (nC - 1) : 0;
      const y = 7.0 + (yLow - 7.0) * v, r = rC * (i === 0 ? 0.9 : 1) * (1 - 0.06 * Math.sin(i * 2.1 + sx));
      const zf = 2.6 + 0.3 * Math.sin(i * 1.7) - 0.6 * sstep(-6, -14, y);
      const L = 8.5 * k;
      const m = new THREE.Mesh(curlGeo(r * k, L), matC);
      m.rotation.x = Math.PI / 2;                        // lathe +y -> +z (the spiral faces front)
      m.position.set(sx * (9.2 + 0.25 * Math.sin(i * 1.3) + 0.5 * sstep(-6, -14, y)) * k, y * k, (zf + 0.3) * k - L);
      headC.add(m);
    }
    const yNape = Math.min(yLow - 0.8, -5.5);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.62 + (i / 6) * 0.76);
      const r = Math.min(2.3, rC) * k, L = 4.5 * k;
      const m = new THREE.Mesh(curlGeo(r, L), matC);
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      m.quaternion.setFromUnitVectors(UNIT_Y, dir);
      m.position.set(Math.sin(a) * 6.8 * k, yNape * k, Math.cos(a) * 5.6 * k - 3.6 * k);
      headC.add(m);
    }
    const beardG = buildBeard(F.beard, s, F);
    const beard = beardG ? new THREE.Mesh(beardG, beardMat) : null;
    if (beard) headC.add(beard);
    const stacheG = buildStache(F.stache, s, F);
    if (stacheG) headC.add(new THREE.Mesh(stacheG, stacheMat));
    const crown = buildCrown(K.id, s, mats, plateTex);
    crown.group.position.set(0, 0.093 * s, -0.008 * s); crown.group.rotation.x = -0.05; headC.add(crown.group);
    // the mask and its brow plates
    const mask = buildMask(K.id, F, s, face);
    headC.add(mask.mesh);
    for (const b of Object.values(mask.brows)) headC.add(b.group);
    for (const b of mask.badges) headC.add(b);
    // the crown must not throw a hard lamp shadow across the eyes; nor may the head black itself out
    crown.group.traverse((o) => { if (o.isMesh) o.userData.noShadow = true; });
    headC.traverse((o) => { if (o.isMesh) o.userData.noShadow = true; });
    // arms: rigid sleeves with ermine cuffs, bare hands
    const arm = (side) => {
      const sx = side === 'L' ? 1 : -1;
      const upper = new THREE.Mesh(lathe([[0.058 * s, 0], [0.062 * s, 0.05 * s], [0.052 * s, 0.25 * s], [0.048 * s, 0.3 * s]], 20), robeMat);
      const lowerG = new THREE.Group();
      const sleeve = new THREE.Mesh(lathe([[0.046 * s, 0], [0.052 * s, 0.06 * s], [0.066 * s, 0.18 * s], [0.082 * s, 0.25 * s]], 24), robeMat);
      const lining = new THREE.Mesh(lathe([[0.08 * s, 0.25 * s], [0.064 * s, 0.17 * s], [0.04 * s, 0.1 * s]], 24), celMaterial({ color: '#0e0c0b', id: 20, gloss: 0 }));
      const cuff = new THREE.Mesh(tube(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return [Math.sin(a) * 0.078 * s, 0.24 * s, Math.cos(a) * 0.078 * s]; }), 0.013 * s, 36, 8, true), ermine);
      lowerG.add(sleeve); lowerG.add(lining); lowerG.add(cuff);
      const hand = new THREE.Group();
      const geos = {};
      for (const p of HANDS) { const key = `${s.toFixed(4)}${side}${p}`; geos[p] = handCache[key] ?? (handCache[key] = buildHandGeo(s, side, p)); }
      const handMesh = new THREE.Mesh(geos.rest.geo, skinMat); hand.add(handMesh);
      const wrist = new THREE.Mesh(lathe([[0.034 * s, -0.03 * s], [0.036 * s, 0.0], [0.04 * s, 0.03 * s]], 16, { sz: 0.7 }), skinMat); hand.add(wrist);
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.0128 * s, 0.0042 * s, 6, 16).rotateX(Math.PI / 2), metal);
      ringMesh.matrixAutoUpdate = false; hand.add(ringMesh);
      squash.add(upper); squash.add(lowerG); squash.add(hand);
      return { side, sx, upper, lower: lowerG, hand, handMesh, ringMesh, geos, pose: null, LU: 0.3 * s, LF: 0.3 * s };
    };
    kings[K.id] = { K, s, st, F, robeU, skirtU, seat, chair, squash, body, neck, headPivot, headC, crown, face, beard, beardU, mask,
      sp, yaw: seatYaw(K.id), side: K.side === 'CN' ? -1 : 1, cur: { size: 1, rise: 0 },
      arms: { L: arm('L'), R: arm('R') }, frames: {}, card: null };
  }

  // ---------------------------------------------------------------- per-frame state
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  const SH = new THREE.Vector3(), EL = new THREE.Vector3(), TG = new THREE.Vector3(), PO = new THREE.Vector3();
  const shoulderLocal = (k, side) => new THREE.Vector3((side === 'L' ? 1 : -1) * 0.255 * k.s, 0.545 * k.s, -0.03 * k.s);

  function shoulderWorld(id, side, out = new THREE.Vector3()) {
    const k = kings[id]; k.body.updateWorldMatrix(true, false);
    return out.copy(shoulderLocal(k, side)).applyMatrix4(k.body.matrixWorld);
  }
  // rest: hands on the table edge in front of the king; half-standing (rise 1) they reach the middle of his half of the table
  function restHand(id, side) {
    const k = kings[id]; k.seat.updateWorldMatrix(true, false);
    const sz = k.cur.size, r = k.cur.rise;
    const near = 0.42 * k.s * sz, fwd = near + r * Math.max(0, 1.02 - near);
    const p = new THREE.Vector3((side === 'L' ? 1 : -1) * (0.21 * k.s * sz + 0.05 * r), -SEAT.Y + 0.03, fwd).applyMatrix4(k.seat.matrixWorld);
    return [p.x, p.y, p.z];
  }
  const placeSeg = (mesh, a, b) => {           // orient a +y-up segment mesh from a to b (in the seat's frame)
    const dir = tmpV.copy(b).sub(a); const len = dir.length();
    tmpQ.setFromUnitVectors(UNIT_Y, dir.normalize());
    mesh.position.copy(a); mesh.quaternion.copy(tmpQ); mesh.scale.set(1, 1, 1);
    return len;
  };
  const INV = new THREE.Matrix4();
  function solveArm(k, a, o) {
    const seatInv = INV.copy(k.squash.matrixWorld).invert();                // the king's own frame (scaled by size)
    SH.copy(shoulderLocal(k, a.side)).applyMatrix4(k.body.matrix);         // shoulder in that frame
    if (o?.target) TG.set(...o.target).applyMatrix4(seatInv);
    else { const r = restHand(k.K.id, a.side); TG.set(...r).applyMatrix4(seatInv); }
    if (o?.pole) PO.set(...o.pole).transformDirection(seatInv); else PO.set(a.sx * 0.8, -0.35, -0.5).normalize();
    const L1 = a.LU, L2 = a.LF;
    const d = tmpV2.copy(TG).sub(SH);
    let dist = d.length();
    const maxR = (L1 + L2) * 0.998;
    if (dist > maxR) { d.setLength(maxR); TG.copy(SH).add(d); dist = maxR; }
    dist = Math.max(dist, 0.05);
    const dir = d.clone().normalize();
    const aLen = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - aLen * aLen));
    const perp = PO.clone().addScaledVector(dir, -PO.dot(dir)).normalize();
    EL.copy(SH).addScaledVector(dir, aLen).addScaledVector(perp, h);
    placeSeg(a.upper, SH, EL);
    placeSeg(a.lower, EL, TG);
    // hand: fingers continue the forearm; palm normal from o.palm (world) or facing down/in
    const fwd = tmpV.copy(TG).sub(EL).normalize();
    a.hand.position.copy(TG);
    const palmN = o?.palm ? new THREE.Vector3(...o.palm).transformDirection(seatInv) : new THREE.Vector3(0, -1, 0);
    const zA = palmN.addScaledVector(fwd, -palmN.dot(fwd)).normalize();
    const xA = new THREE.Vector3().crossVectors(fwd, zA).normalize();
    tmpM.makeBasis(xA, fwd, zA);
    a.hand.quaternion.setFromRotationMatrix(tmpM);
    a.hand.position.addScaledVector(fwd, -0.05 * k.s);
  }
  function setPose(a, pose) {
    if (a.pose === pose) return;
    const g = a.geos[pose] ?? a.geos.rest;
    a.handMesh.geometry = g.geo;
    a.ringMesh.matrix.copy(g.ringM);
    a.pose = pose;
  }
  // the press: depth goes to paper fast (by flat ~0.4), the figure spreads and settles with a little overshoot
  const CARD_Z = 0;                                       // the card plane (seat frame): through the king's middle
  function squashMatrix(k, flat, out) {
    if (!(flat > 0)) return out.identity();
    const f = clamp(flat);
    const press = sstep(0, 1, Math.pow(clamp(f / 0.4), 1.6));
    const d = 1 - (1 - 0.012) * press;
    const after = Math.max(0, f - 0.38);
    const spread = 0.12 * sstep(0.1, 0.4, f) * Math.exp(-5 * after) * Math.cos(after * 15) * (1 - sstep(0.88, 1, f));
    const yc = k.cardY;
    out.makeTranslation(0, yc, CARD_Z);
    out.multiply(tmpM.makeScale(1 + spread, 1 + spread * 0.55, d));
    out.multiply(tmpM.makeTranslation(0, -yc, -CARD_Z));
    return out;
  }
  const SQ = new THREE.Matrix4(), SQF = new THREE.Matrix4(), M1_ = new THREE.Matrix4(), M2_ = new THREE.Matrix4();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  function update(stk = {}, t = 0) {
    const t2 = Math.floor(t * 12 + 1e-6) / 12;                 // characters on twos
    for (const id in kings) {
      const k = kings[id], s = stk[id] ?? {};
      // entering: he slides in with his chair from ENTER_DX further out, decelerating; at the stop (0.8..1) he lurches
      const enter = s.enter ?? 1;
      k.seat.visible = enter > 0;
      const e = clamp(enter), slide = 1 - Math.pow(1 - e, 3);
      const bump = e > 0.8 && e < 1 ? Math.sin((Math.PI * (e - 0.8)) / 0.2) : 0;
      k.seat.position.set(k.sp[0] + k.side * ENTER_DX * (1 - slide), k.sp[1], k.sp[2]);
      k.seat.rotation.set(0, k.yaw - k.side * 0.22 * (1 - slide) * (1 - slide), 0);
      // size: about the seat point on the floor; the chair only up to 1.1 (a fat king overflows it)
      const size = clamp(s.size ?? 1, 0.5, 2), cs = Math.min(size, 1.1);
      const rise = clamp(s.rise ?? 0);
      k.cur.size = size; k.cur.rise = rise;
      k.chair.scale.setScalar(cs); k.chair.position.set(0, SEAT_H * (cs - 1), 0);
      k.chair.rotation.set(0.04 * bump, 0, 0);
      const f = s.face ?? {};
      const doze = (s.slump ?? 0) > 0.02 && (f.eyes === 'shut' || f.eyes === 'closed');
      const breath = doze ? 0.006 * Math.sin((t2 * TAU) / 3.4) : 0;
      const blown = s.blown ?? 0;
      // body: + pitch = forward over the table (lean, half-standing, the lurch); blown throws him back
      k.body.position.set(0, (-(s.slump ?? 0) + 0.22 * rise + breath) / size, -0.06 * blown * k.s + (0.1 * rise) / size);
      const pitchF = (s.lean ?? 0) + 0.55 * rise + 0.12 * bump - 0.22 * blown;
      k.body.rotation.set(pitchF, s.turn ?? 0, 0);
      k.body.updateMatrix();
      k.squash.matrix.makeTranslation(0, -SEAT_H, 0).multiply(M1_.makeScale(size, size, size)).multiply(M2_.makeTranslation(0, SEAT_H, 0));
      k.seat.updateMatrixWorld(true);
      // the skirt keeps hanging to the floor: body-local -> (hips position, yaw only, stretched down to the floor)
      const P = k.body.position, ky = (SEAT_H + P.y) / SEAT_H;
      k.skirtU.uSkirt.value.copy(k.body.matrix).invert().multiply(M1_.makeTranslation(P.x, P.y, P.z)).multiply(M2_.makeRotationY(s.turn ?? 0)).multiply(SQ.makeScale(1, ky, 1));
      // head: angles, or look at a world point; half-standing he still looks across the table
      let yaw = s.head?.yaw ?? 0, pitch = s.head?.pitch ?? 0;
      if (s.look) { const a = aim(id, s.look); yaw = a.yaw; pitch = a.pitch; }
      else pitch += 0.28 * rise;
      k.headPivot.rotation.set(-pitch - blown * 0.3 - 0.08 * bump, yaw, s.head?.roll ?? 0, 'YXZ');
      // face, mask brow plates, sweat
      const jaw = setFace(k.face, k.F, f, doze);
      if (k.beard) { k.beard.position.y = -jaw * k.s / 100; k.beardU.uJaw.value = jaw; }
      const bn = doze ? 'sleep' : (f.brows ?? 'flat');
      for (const b of [k.mask.brows.P, k.mask.brows.N]) {
        const pose = BROW_POSE[bn === 'arch' ? (b.sg > 0 ? 'archHi' : 'archLo') : bn] ?? BROW_POSE.flat;
        tmpQ.setFromAxisAngle(Z_AXIS, b.sg * pose[0]);
        b.group.quaternion.copy(b.base).multiply(tmpQ);
        b.group.position.copy(b.origin).addScaledVector(b.up, (pose[1] * k.s) / 100);
      }
      k.face.uSweat.value = clamp(s.sweat ?? 0);
      k.face.uSweatT.value = t2;
      // the crown: its gem, xAI's plate, askew
      if (k.crown.glowGem) k.crown.glowGem.material.uniforms.uOn.value = s.crownGlow ?? 0;
      if (id === 'xai') {
        const fl = s.plateFlip ?? 0;
        if (fl > 0.5 && !k.flipped) { k.crown.plateMat.uniforms.uMap.value = logoPlate('xai', 'spacexai'); k.flipped = true; }
        if (fl <= 0.5 && k.flipped) { k.crown.plateMat.uniforms.uMap.value = logoPlate('xai'); k.flipped = false; }
        k.crown.plateG.rotation.x = -0.12 + Math.sin(Math.min(1, fl) * Math.PI) * 1.4;
      }
      const ct = s.crownTilt ?? 0, CR = 0.108 * k.s;
      k.crown.group.rotation.set(-0.05, 0, ct);
      k.crown.group.position.set(-Math.sin(ct) * CR * 0.5, 0.093 * k.s + Math.abs(Math.sin(ct)) * CR * 0.22, -0.008 * k.s);
      k.seat.updateMatrixWorld(true);
      for (const side of ['L', 'R']) { solveArm(k, k.arms[side], s['arm' + side]); setPose(k.arms[side], s.hand?.[side] ?? 'rest'); }
      // (v1) pressed into a card
      k.squash.matrix.multiply(squashMatrix(k, s.flat ?? 0, SQF));
      k.robeU.uCut.value = (s.flat ?? 0) > 0.42 ? -0.03 : -99;
      if (s.cardAt) {
        // carried away: the card plane (seat frame T(0, cardY, CARD_Z)) is placed at the given world matrix
        SQ.copy(k.seat.matrixWorld).invert().multiply(s.cardAt).multiply(tmpM.makeTranslation(0, -k.cardY, -CARD_Z));
        k.squash.matrix.premultiply(SQ);
      }
      k.seat.updateMatrixWorld(true);
    }
  }

  // frames are rigid (no scale): props placed with them keep their own size on a swollen king
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  const rigid = (m) => { m.decompose(_p, _q, _s); return m.compose(_p, _q, ONE); };

  function handFrame(id, side) {
    const k = kings[id]; const h = k.arms[side].hand;
    h.updateWorldMatrix(true, false);
    const m = k.frames[side] || (k.frames[side] = new THREE.Matrix4());
    // origin = palm centre, +y fingers, +z out of the palm
    return rigid(m.copy(h.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0.06 * k.s, 0)));
  }
  function handWorld(id, side, out = new THREE.Vector3()) { return out.setFromMatrixPosition(handFrame(id, side)); }
  function headWorld(id, out = new THREE.Vector3()) { const k = kings[id]; k.headC.updateWorldMatrix(true, false); return out.setFromMatrixPosition(k.headC.matrixWorld); }
  // a frame at the mouth corner (for a cigar clenched in the teeth): +y out of the mouth, +z up
  function mouthFrame(id) {
    const k = kings[id]; k.headC.updateWorldMatrix(true, false);
    const m = k.frames.M || (k.frames.M = new THREE.Matrix4());
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.25, -0.15, 1).normalize(), new THREE.Vector3(0, 1, 0.15).normalize());
    local.setPosition(0.016 * k.s, (MOUTH_Y / 100) * k.s, 0.085 * k.s);
    return rigid(m.multiplyMatrices(k.headC.matrixWorld, local));
  }
  // head yaw/pitch (relative to the body) that face a world point
  function aim(id, p) {
    const k = kings[id]; k.neck.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(k.neck.matrixWorld).invert();
    const v = new THREE.Vector3(...p).applyMatrix4(inv).sub(new THREE.Vector3(0, 0.16 * k.s, 0));
    return { yaw: Math.atan2(v.x, v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) };
  }
  // the upper back (for the sacks): origin on the back surface between the shoulder blades, +y up, +z out of the back
  const BACK = new THREE.Matrix4().makeRotationY(Math.PI);
  function bodyFrame(id, out = new THREE.Matrix4()) {
    const k = kings[id]; k.body.updateWorldMatrix(true, false);
    BACK.setPosition(0, 0.45 * k.s, -0.2 * k.s);
    return rigid(out.multiplyMatrices(k.body.matrixWorld, BACK));
  }
  // the head: origin at the head centre, +y up through the crown, +z out of the face (face plane at z ~ 0.089 * s)
  function headFrame(id, out = new THREE.Matrix4()) { const k = kings[id]; k.headC.updateWorldMatrix(true, false); return rigid(out.copy(k.headC.matrixWorld)); }
  // an eye (for the extreme close-up): origin at the eye centre on the face, +z out of the face; side 'L' | 'R' (the king's own)
  function eyeFrame(id, side = 'R', out = new THREE.Matrix4()) {
    const k = kings[id]; k.headC.updateWorldMatrix(true, false);
    const x = (side === 'L' ? 1 : -1) * EYE_X, y = EYE_Y;
    tmpM.makeTranslation((x / 100) * k.s, (y / 100) * k.s, ((faceZ(x, y, k.F) + 0.05) / 100) * k.s);
    return rigid(out.multiplyMatrices(k.headC.matrixWorld, tmpM));
  }
  // the mask: origin at its centre (between and a little above the eyes, on its face), +z out of the face, +y up
  function maskFrame(id, out = new THREE.Matrix4()) {
    const k = kings[id]; k.headC.updateWorldMatrix(true, false);
    tmpM.makeTranslation(...k.mask.centre);
    return rigid(out.multiplyMatrices(k.headC.matrixWorld, tmpM));
  }
  function crownTop(id, out = new THREE.Vector3()) {
    const k = kings[id]; k.crown.group.updateWorldMatrix(true, false);
    return out.set(0, k.crown.top, 0).applyMatrix4(k.crown.group.matrixWorld);
  }
  // the card plane he is pressed into: origin at the card centre, +z toward the table, +y up (seat frame, chair stays)
  function cardFrame(id, out = new THREE.Matrix4()) {
    const k = kings[id]; k.seat.updateWorldMatrix(true, false);
    tmpM.makeTranslation(0, k.cardY, CARD_Z);
    return out.multiplyMatrices(k.seat.matrixWorld, tmpM);
  }
  const cardSize = (id) => kings[id].cardWH.slice();

  // card extents from the rest pose: from the seat up to the crown, and as wide as a court card
  update({}, 0);
  for (const id in kings) {
    const k = kings[id];
    const top = new THREE.Vector3(); crownTop(id, top);
    const inv = new THREE.Matrix4().copy(k.seat.matrixWorld).invert();
    top.applyMatrix4(inv);
    const h = top.y + 0.05, w = h * 0.68;
    k.cardY = h / 2 - 0.02; k.cardWH = [w, h];
  }
  return { root, kings, update, handFrame, handWorld, headWorld, shoulderWorld, mouthFrame, restHand, aim, bodyFrame, headFrame, eyeFrame, maskFrame, crownTop, cardFrame, cardSize };
}
