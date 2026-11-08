import * as THREE from 'three';
import { G, NOISE } from './glsl.js';

// Frame pipeline:
//   lamp shadow map -> main MRT (colour + data) -> paint (Kuwahara gouache on painted pixels only)
//   -> ink (hand-inked lines on cel pixels) -> atmosphere (lamp beam through smoke, haze, flash,
//   selective colour) -> overlay sprites -> style (engraving / poster, optional) -> bloom
//   -> grade + grain -> canvas.
// Styles (opt.style): 'noir' (default), 'engrave', 'poster'.

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PAINT_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes;
uniform float uRadius, uS;
varying vec2 vUv;
out vec4 o;
${NOISE}
void main(){
  vec4 c0 = texture(tColor, vUv);
  if(c0.a < 0.5){ o = vec4(c0.rgb, 0.0); return; }
  vec2 px = 1.0 / uRes;
  vec2 fc = gl_FragCoord.xy / uS;
  float ang = (fbm2(fc / 140.0) - 0.5) * 3.2 + 0.4;
  vec2 dA = vec2(cos(ang), sin(ang)), dB = vec2(-dA.y, dA.x);
  float rad = uRadius * uS;
  vec3 m[8]; vec3 s[8]; float n[8];
  for(int k = 0; k < 8; k++){ m[k] = c0.rgb; s[k] = c0.rgb * c0.rgb; n[k] = 1.0; }
  for(int r = 1; r <= 3; r++){
    float rr = rad * float(r) / 3.0;
    for(int k = 0; k < 16; k++){
      float a = float(k) * 0.39269908 + (r == 2 ? 0.19634954 : 0.0);
      vec2 off = (dA * cos(a) * 1.45 + dB * sin(a) * 0.8) * rr;
      vec4 t = texture(tColor, vUv + off * px);
      vec3 tc = t.rgb * t.a, tq = t.rgb * t.rgb * t.a;
      if(k / 2 * 2 == k){ int i0 = k / 2; m[i0] += tc; s[i0] += tq; n[i0] += t.a; }
      else { int i0 = (k - 1) / 2, i1 = ((k + 1) / 2) % 8;
        m[i0] += tc * 0.5; s[i0] += tq * 0.5; n[i0] += t.a * 0.5;
        m[i1] += tc * 0.5; s[i1] += tq * 0.5; n[i1] += t.a * 0.5; }
    }
  }
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for(int k = 0; k < 8; k++){
    vec3 mu = m[k] / n[k];
    vec3 v = abs(s[k] / n[k] - mu * mu);
    float sd = sqrt(v.r + v.g + v.b);
    float w = 1.0 / (1.0 + pow(sd * 22.0, 8.0));
    acc += mu * w; wsum += w;
  }
  vec3 col = wsum > 1e-5 ? acc / wsum : c0.rgb;
  mat2 R = mat2(dA.x, dA.y, dB.x, dB.y);
  vec2 sp = R * fc;
  float bristle = vnoise(vec2(sp.x / 26.0, sp.y / 2.2));
  float paper = vnoise(fc / 2.5) * 0.5 + vnoise(fc / 9.0) * 0.5;
  col *= 0.97 + 0.06 * bristle;
  col *= 0.985 + 0.03 * paper;
  o = vec4(col, 1.0);
}
`;

const INK_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes;
uniform float uS, uWidth, uSeed;
uniform vec3 uInk;
varying vec2 vUv;
out vec4 o;
${NOISE}
bool inked(float id){ return id > 0.5 && id < 99.5; }
vec3 nrm(vec4 d){ vec2 xy = d.rg * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
float edgeAt(vec2 uv, vec4 dC, vec3 nC, float w){
  vec2 px = w / uRes;
  float e = 0.0;
  for(int k = 0; k < 8; k++){
    float a = float(k) * 0.78539816;
    vec2 off = vec2(cos(a), sin(a)) * px;
    vec4 dN = texture(tData, uv + off);
    bool cC = inked(dC.a), cN = inked(dN.a);
    if(!cC && !cN) continue;
    float ee = 0.0;
    if(abs(dN.a - dC.a) > 0.5){
      if(cC && cN) ee = 1.0;
      else if(cC) ee = (dC.b < dN.b + min(0.5, 0.06 * dN.b)) ? 1.0 : 0.0;
      else ee = (dN.b < dC.b + min(0.5, 0.06 * dC.b)) ? 1.0 : 0.0;
    } else {
      float rel = abs(dN.b - dC.b) / max(min(dN.b, dC.b), 0.01);
      ee = smoothstep(0.02, 0.045, rel);
      float nd = dot(nC, nrm(dN));
      ee = max(ee, smoothstep(0.72, 0.5, nd) * 0.8);
    }
    e = max(e, ee);
  }
  return e;
}
void main(){
  vec4 col = texture(tColor, vUv);
  vec4 dC = texture(tData, vUv);
  vec3 nC = nrm(dC);
  vec2 fc = gl_FragCoord.xy / uS;
  float press = 0.72 + 0.56 * vnoise(fc / 34.0 + uSeed * 7.0);
  float w = uWidth * uS * press;
  float e = 0.5 * edgeAt(vUv, dC, nC, w) + 0.5 * edgeAt(vUv, dC, nC, w * 0.55);
  float alpha = e * (0.82 + 0.18 * vnoise(fc / 7.0 + uSeed));
  vec3 ink = mix(uInk, col.rgb * 0.25, 0.25);
  o = vec4(mix(col.rgb, ink, clamp(alpha, 0.0, 1.0)), 1.0);
}
`;

// Lamp beam through drifting smoke, haze, flash, and (noir) selective colour: everything goes to a warm
// monochrome except the cards (ids 30..39, 130..139) and glows (140+), which keep their colour.
const ATMOS_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec3 uCamPos;
uniform mat4 uInvProj, uCamWorld;
uniform float uTime, uFxTime, uHaze, uFlash, uBeam, uSmoke, uMono, uSteps;
uniform vec3 uHazeCol, uFlashCol, uMonoTint, uCampCN, uCampUS;
uniform float uCamp;
// drawn shadows the lamp can't make: a blob (a thing coming down out of the dark) and a sweep (the card king's
// shadow running down the table from the head): uShade = (x, z, rx, rz), uShadeK; uSweep = (front z, soft), uSweepK
uniform vec4 uShade; uniform float uShadeK; uniform vec2 uSweep; uniform float uSweepK;
uniform vec2 uRes;
uniform float uLampPow, uLampCone, uLampSoft, uShadowOn, uShadowFar;
uniform vec3 uLampPos, uLampDir, uLampCol;
uniform sampler2D uShadowMap;
uniform mat4 uShadowVP;
varying vec2 vUv;
out vec4 o;
${NOISE}
vec3 viewDir(vec2 uv){
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(mat3(uCamWorld) * normalize(vp.xyz / vp.w));
}
float reachAt(vec3 w){
  vec3 Lv = uLampPos - w; float dist = length(Lv);
  float cone = smoothstep(uLampCone - uLampSoft, uLampCone + uLampSoft, dot(-Lv, uLampDir) / dist);
  return uLampPow * cone / (1.0 + 0.085 * dist * dist);
}
float shadowAt(vec3 w){
  if(uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowVP * vec4(w, 1.0);
  if(sc.w <= 0.0) return 1.0;
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if(p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 1.0;
  return (distance(w, uLampPos) / uShadowFar - 0.004 <= texture(uShadowMap, p.xy).r) ? 1.0 : 0.0;
}
bool keepsColour(float id){ return (id > 29.5 && id < 39.5) || id > 129.5; }
void main(){
  vec3 c = texture(tColor, vUv).rgb;
  vec4 d = texture(tData, vUv);
  float depth = d.b;
  vec3 wd = viewDir(vUv);
  vec3 fwd = -normalize(uCamWorld[2].xyz);
  float hitT = depth > 0.0 ? depth / max(dot(wd, fwd), 1e-3) : 30.0;
  // selective colour first (the beam and haze are part of the monochrome world)
  if(uMono > 0.0 && !keepsColour(d.a)){
    // split-toned monochrome: the lamp's light stays warm cream; the shadows take the camp of the half of the room
    // they are in (China red-black at -x, America blue-black at +x), fading to a neutral black as uCamp drains to 0
    float l = dot(c, vec3(0.3, 0.55, 0.15));
    vec3 w = uCamPos + wd * hitT;
    float us = smoothstep(-0.32, 0.32, w.x);
    vec3 campT = mix(uCampCN, uCampUS, us);
    vec3 shade = mix(vec3(0.8, 0.8, 0.86), campT, uCamp);
    vec3 hi = mix(uMonoTint * 1.1, campT * 1.1, 0.16 * uCamp);
    vec3 tone = mix(shade, hi, smoothstep(0.04, 0.55, l));
    c = mix(c, l * tone, uMono);
  }
  // lamp beam: march the view ray through the lamp's cone, smoke density from slow 3D noise
  if(uBeam > 0.0){
    float tMax = min(hitT, 16.0);
    float n = uSteps;
    float jit = hash12(gl_FragCoord.xy + fract(uFxTime * 0.0)) ;
    float dt = tMax / n;
    vec3 acc = vec3(0.0);
    for(int i = 0; i < 40; i++){
      if(float(i) >= n) break;
      float t = (float(i) + jit) * dt;
      vec3 p = uCamPos + wd * t;
      if(p.y > uLampPos.y - 0.05) continue;
      float r = reachAt(p);
      if(r < 0.002) continue;
      float smoke = fbm3(p * vec3(1.3, 0.9, 1.3) + vec3(0.0, -uFxTime * 0.06, uFxTime * 0.025));
      float dens = (0.04 + uSmoke * 1.4 * smoothstep(0.42, 0.85, smoke)) * smoothstep(-0.8, 0.4, p.y);
      acc += r * dens * shadowAt(p) * dt;
    }
    c += uLampCol * acc * uBeam * 0.06;
  }
  if(depth > 0.0){
    float f = 1.0 - exp(-hitT * uHaze);
    c = mix(c, uHazeCol, clamp(f, 0.0, 0.9));
  }
  if((uShadeK > 0.0 || uSweepK > 0.0) && depth > 0.0){
    vec3 w = uCamPos + wd * hitT;
    float low = 1.0 - smoothstep(0.4, 1.6, w.y);                      // falls on the table, the floor, the seated kings
    if(uShadeK > 0.0){ vec2 q = (w.xz - uShade.xy) / uShade.zw; c *= 1.0 - uShadeK * low * (1.0 - smoothstep(0.55, 1.0, length(q))); }
    if(uSweepK > 0.0){ float k = 1.0 - smoothstep(uSweep.x - uSweep.y, uSweep.x + uSweep.y, w.z); c *= 1.0 - uSweepK * k * (1.0 - smoothstep(2.6, 4.2, w.y)); }
  }
  c = mix(c, uFlashCol, uFlash);
  o = vec4(c, 1.0);
}
`;

// Optional print styles. engrave: line engraving on cream paper, cards hand-coloured. poster: a two-ink
// Cold-War silkscreen, red on the CN half, blue on the US half, black in the middle, halftone mids.
const STYLE_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes;
uniform float uS, uFrame, uStyle;
uniform vec3 uCamPos;
uniform mat4 uInvProj, uCamWorld;
varying vec2 vUv;
out vec4 o;
${NOISE}
vec3 nrm(vec4 d){ vec2 xy = d.rg * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
bool isCard(float id){ return (id > 29.5 && id < 39.5) || (id > 129.5 && id < 139.5); }
bool isGlow(float id){ return id > 139.5; }
float lum(vec3 c){ return dot(c, vec3(0.3, 0.55, 0.15)); }
vec3 viewDir(vec2 uv){
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(mat3(uCamWorld) * normalize(vp.xyz / vp.w));
}
// one family of engraved lines: 0 paper .. 1 ink
float hatch(vec2 fc, float ang, float spacing, float tone, float wob){
  vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * fc;
  float v = q.y / spacing + wob;
  float t = abs(fract(v) - 0.5) * 2.0;                 // 0 at a line centre, 1 between lines
  float w = clamp(tone, 0.0, 1.0);                       // line width as a fraction of the gap
  float aa = 1.6 / spacing;
  return 1.0 - smoothstep(w - aa, w + aa, t);
}
void main(){
  vec3 c = texture(tColor, vUv).rgb;
  vec4 d = texture(tData, vUv);
  float id = d.a;
  vec2 fc = gl_FragCoord.xy / uS;
  float boil = floor(uFrame / 2.0);
  float l = lum(c);
  if(uStyle < 1.5){
    // ---- engraving
    vec3 PAPER = vec3(0.93, 0.89, 0.8), INK = vec3(0.12, 0.09, 0.07);
    vec3 n = nrm(d);
    float base = id < 0.5 ? 0.785 : atan(n.y, n.x) + 1.5708;
    base = floor(base / 0.2618 + 0.5) * 0.2618;           // quantise line angles (15 deg) so they read as cut
    float wob = 0.18 * vnoise(fc * 0.035 + boil * 3.1);
    float tone = 1.0 - smoothstep(0.02, 0.9, l);           // 0 bright .. 1 dark
    float a = hatch(fc, base, 5.0, tone * 1.1 - 0.05, wob);
    float b = hatch(fc, base + 1.0472, 5.0, (tone - 0.45) * 1.6, wob * 0.7);
    float e = hatch(fc, base - 1.0472, 3.6, (tone - 0.75) * 2.2, wob * 0.5);
    float ink = max(a, max(b, e));
    ink = max(ink, smoothstep(0.11, 0.045, l));            // scratchboard: the dark is solid black, light is cut out of it
    vec3 outc = mix(PAPER, INK, ink);
    if(isCard(id) || isGlow(id)){
      // hand-coloured: flat watercolour of the card's hue over the paper, lines only in the darks
      vec3 hue = c / max(max(c.r, max(c.g, c.b)), 0.05);
      float band = floor(clamp(l * 1.6, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
      vec3 wash = mix(PAPER, PAPER * hue, 0.8) * (0.55 + 0.45 * band);
      outc = mix(wash, INK, max(a, b) * 0.85 * smoothstep(0.55, 0.15, l));
      if(isGlow(id)) outc = mix(outc, c, 0.5);
    }
    // paper fibre
    outc *= 0.97 + 0.03 * vnoise(fc * 0.7);
    o = vec4(outc, 1.0);
  } else {
    // ---- poster: two inks plus black on cream, halftone mids, slight misregistration
    vec3 PAPER = vec3(0.94, 0.89, 0.78), BLACK = vec3(0.1, 0.085, 0.08);
    vec3 RED = vec3(0.77, 0.2, 0.17), BLUE = vec3(0.17, 0.29, 0.6);
    vec3 wd = viewDir(vUv);
    vec3 fwd = -normalize(uCamWorld[2].xyz);
    float hitT = d.b > 0.0 ? d.b / max(dot(wd, fwd), 1e-3) : 30.0;
    vec3 wp = uCamPos + wd * hitT;
    float camp = smoothstep(-0.55, -0.15, wp.x) - smoothstep(0.15, 0.55, wp.x) ; // 1 in the middle band
    vec3 INKC = wp.x < 0.0 ? RED : BLUE;
    INKC = mix(INKC, BLACK, clamp(camp, 0.0, 1.0) * 0.85);
    // misregistered second sample for the colour plate
    vec3 c2 = texture(tColor, vUv + vec2(1.6, -1.1) / uRes * uS).rgb;
    float l2 = lum(c2);
    // halftone on a 45-degree grid
    float cell = 6.0;
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * fc / cell;
    vec2 g = fract(q) - 0.5;
    float tone = 1.0 - smoothstep(0.03, 0.85, l2);
    float dotR = sqrt(clamp(tone, 0.0, 1.0)) * 0.62;
    float dotM = 1.0 - smoothstep(dotR - 0.07, dotR + 0.07, length(g));
    float solid = smoothstep(0.62, 0.8, tone);
    float plate = max(dotM, solid);
    vec3 outc = mix(PAPER, INKC, plate * (tone > 0.08 ? 1.0 : 0.0));
    // the key (black) plate: deepest shadows and ink lines, on register
    float key = smoothstep(0.1, 0.03, l);
    outc = mix(outc, BLACK, key);
    if(isCard(id) || isGlow(id)){
      vec3 flat3 = floor(c * 3.0 + 0.5) / 3.0;
      outc = mix(flat3, BLACK, key * 0.8);
    }
    outc *= 0.97 + 0.03 * vnoise(fc * 0.9);
    o = vec4(outc, 1.0);
  }
}
`;

const BRIGHT_FS = /* glsl */ `
uniform sampler2D tColor; uniform float uThreshold;
varying vec2 vUv; out vec4 o;
void main(){ vec3 c = texture(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(uThreshold, uThreshold + 0.4, l), 1.0); }
`;
const BLUR_FS = /* glsl */ `
uniform sampler2D tColor; uniform vec2 uDir;
varying vec2 vUv; out vec4 o;
void main(){
  vec3 s = texture(tColor, vUv).rgb * 0.227;
  s += texture(tColor, vUv + uDir * 1.385).rgb * 0.316; s += texture(tColor, vUv - uDir * 1.385).rgb * 0.316;
  s += texture(tColor, vUv + uDir * 3.231).rgb * 0.070; s += texture(tColor, vUv - uDir * 3.231).rgb * 0.070;
  o = vec4(s, 1.0);
}
`;

const FINAL_FS = /* glsl */ `
uniform sampler2D tColor, tBloom1, tBloom2;
uniform vec2 uRes;
uniform float uS, uFrame, uBloom, uVignette, uGrain, uFade, uSat, uExposure, uGamma, uContrast, uWarp;
uniform vec3 uLift, uGain, uFadeColor;
varying vec2 vUv;
out vec4 o;
${NOISE}
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c;
  vec2 vUv = vUv;
  if(uWarp > 0.0){
    // looking out through old glass: barrel bulge, a slow ripple, the edges smeared
    vec2 d = vUv - 0.5; float r2 = dot(d, d);
    vUv = 0.5 + d * (1.0 - uWarp * 0.18 * r2) + uWarp * vec2(sin(vUv.y * 38.0) * 0.004, sin(vUv.x * 23.0) * 0.003);
  }
  if(uS > 1.5){
    c = (texture(tColor, vUv + px * vec2(-0.5, -0.5)).rgb + texture(tColor, vUv + px * vec2(0.5, -0.5)).rgb +
         texture(tColor, vUv + px * vec2(-0.5, 0.5)).rgb + texture(tColor, vUv + px * vec2(0.5, 0.5)).rgb) * 0.25;
  } else c = texture(tColor, vUv).rgb;
  vec3 b = texture(tBloom1, vUv).rgb * 0.6 + texture(tBloom2, vUv).rgb * 0.8;
  c += b * uBloom;
  c = c / (1.0 + max(c - 1.0, 0.0) * 0.6);
  c *= uExposure;
  c = pow(max(c, 0.0), vec3(uGamma));
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = uLift + c * (uGain - uLift);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.6;
  float g = hash12(gl_FragCoord.xy + floor(uFrame / 2.0) * 17.31) - 0.5;
  c += g * uGrain;
  c = mix(c, uFadeColor, uFade);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

function fsMat(fs, uniforms) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}

// per-style defaults; anything here can be overridden per frame by the director's look
export const STYLES = {
  noir: { mono: 0.86, monoTint: '#e6d6bd', campTint: 1.0, beam: 1.0, smoke: 0.5, haze: 0.0, exposure: 1.28, gamma: 0.9, contrast: 1.12, sat: 1.0, vignette: 0.55, grain: 0.035, bloom: 0.45, bloomThreshold: 1.05, lift: '#0b0a0c', gain: '#fff4e6', ink: '#100c0a', inkWidth: 1.15, styleId: 0 },
  engrave: { mono: 0.0, beam: 0.55, smoke: 0.3, haze: 0.0, exposure: 1.12, gamma: 0.9, contrast: 1.05, sat: 1.0, vignette: 0.25, grain: 0.0, bloom: 0.15, lift: '#000000', gain: '#ffffff', ink: '#120d0a', inkWidth: 1.3, styleId: 1 },
  poster: { mono: 0.0, beam: 0.7, smoke: 0.4, haze: 0.0, exposure: 1.1, gamma: 0.92, contrast: 1.05, sat: 1.0, vignette: 0.18, grain: 0.0, bloom: 0.1, lift: '#000000', gain: '#ffffff', ink: '#120d0a', inkWidth: 1.4, styleId: 2 },
};

export class Engine {
  constructor(canvas, W, H, S) {
    this.W = W; this.H = H; this.S = S;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.autoClear = false;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    const IW = this.IW = Math.round(W * S), IH = this.IH = Math.round(H * S);
    const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtMain = new THREE.WebGLRenderTarget(IW, IH, {
      count: 2, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(IW, IH, THREE.FloatType),
    });
    this.rtMain.textures[0].minFilter = this.rtMain.textures[0].magFilter = THREE.LinearFilter;
    const SH = 2048;
    this.rtShadow = new THREE.WebGLRenderTarget(SH, SH, {
      count: 2, type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(SH, SH, THREE.FloatType),
    });
    this.shadowCam = new THREE.PerspectiveCamera(132, 1, 0.15, 14);
    this.rtA = new THREE.WebGLRenderTarget(IW, IH, half);
    this.rtB = new THREE.WebGLRenderTarget(IW, IH, half);
    const bw = Math.round(IW / 4), bh = Math.round(IH / 4);
    this.rtBl = [0, 1, 2, 3].map((i) => new THREE.WebGLRenderTarget(i < 2 ? bw : bw >> 1, i < 2 ? bh : bh >> 1, half));
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const res = new THREE.Vector2(IW, IH);
    this.mPaint = fsMat(PAINT_FS, { tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uRadius: { value: 4 }, uS: { value: S } });
    this.mInk = fsMat(INK_FS, { tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uS: { value: S }, uWidth: { value: 1.2 }, uSeed: { value: 0 }, uInk: { value: new THREE.Color('#100c0a') } });
    this.mAtmos = fsMat(ATMOS_FS, {
      tColor: { value: null }, tData: { value: null }, uCamPos: { value: new THREE.Vector3() }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uTime: G.uTime, uFxTime: G.uFxTime, uRes: { value: res },
      uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color('#0a0a0e') }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color('#ffffff') },
      uBeam: { value: 1 }, uSmoke: { value: 0.5 }, uSteps: { value: 28 }, uMono: { value: 0 }, uMonoTint: { value: new THREE.Color('#e6d6bd') },
      uCamp: { value: 0 }, uShade: { value: new THREE.Vector4(0, 0, 1, 1) }, uShadeK: { value: 0 }, uSweep: { value: new THREE.Vector2(-9, 0.5) }, uSweepK: { value: 0 }, uCampCN: { value: new THREE.Vector3(1.7, 0.5, 0.42) }, uCampUS: { value: new THREE.Vector3(0.42, 0.72, 2.0) },
      uLampPos: G.uLampPos, uLampDir: G.uLampDir, uLampCol: G.uLampCol, uLampPow: G.uLampPow, uLampCone: G.uLampCone, uLampSoft: G.uLampSoft,
      uShadowMap: G.uShadowMap, uShadowVP: G.uShadowVP, uShadowOn: G.uShadowOn, uShadowFar: G.uShadowFar,
    });
    this.mStyle = fsMat(STYLE_FS, {
      tColor: { value: null }, tData: { value: null }, uRes: { value: res }, uS: { value: S }, uFrame: { value: 0 }, uStyle: { value: 0 },
      uCamPos: { value: new THREE.Vector3() }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    });
    this.mBright = fsMat(BRIGHT_FS, { tColor: { value: null }, uThreshold: { value: 1.0 } });
    this.mBlur = fsMat(BLUR_FS, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mFinal = fsMat(FINAL_FS, {
      tColor: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, uRes: { value: res }, uS: { value: S },
      uFrame: { value: 0 }, uBloom: { value: 0.6 }, uVignette: { value: 0.4 }, uGrain: { value: 0.03 }, uFade: { value: 0 }, uWarp: { value: 0 },
      uExposure: { value: 1.05 }, uGamma: { value: 0.92 }, uSat: { value: 1 }, uContrast: { value: 1.1 },
      uLift: { value: new THREE.Color('#07070a') }, uGain: { value: new THREE.Color('#fff4e6') }, uFadeColor: { value: new THREE.Color('#000000') },
    });
    this._v = new THREE.Vector3();
    this._hidden = [];
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // lamp shadow map: everything drawn with a cel material casts, unless mesh.userData.noShadow
  renderShadow(scene) {
    const r = this.renderer, sc = this.shadowCam;
    sc.position.copy(G.uLampPos.value);
    sc.up.set(0, 0, -1);
    const ld = G.uLampDir.value;
    sc.lookAt(G.uLampPos.value.x + ld.x * 10, G.uLampPos.value.y + ld.y * 10, G.uLampPos.value.z + ld.z * 10);
    sc.far = G.uShadowFar.value;
    sc.updateProjectionMatrix(); sc.updateMatrixWorld();
    const hid = this._hidden; hid.length = 0;
    scene.traverseVisible((o) => {
      if ((o.isMesh || o.isInstancedMesh || o.isLine || o.isPoints) && (o.userData.noShadow || !o.material?.uniforms?.uPass)) { hid.push(o); }
    });
    for (const o of hid) o.visible = false;
    G.uPass.value = 1; G.uShadowOn.value = 0;
    r.setRenderTarget(this.rtShadow);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, false);
    r.render(scene, sc);
    G.uPass.value = 0;
    for (const o of hid) o.visible = true;
    G.uShadowMap.value = this.rtShadow.textures[0];
    G.uShadowVP.value.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
    G.uShadowOn.value = 1;
  }

  render(scene, overlay, cam, opt = {}) {
    const st = { ...STYLES[opt.style ?? 'noir'], ...opt };
    const r = this.renderer;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    if (st.shadows !== false) this.renderShadow(scene); else G.uShadowOn.value = 0;
    r.setRenderTarget(this.rtMain);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, cam);

    this.mPaint.uniforms.tColor.value = this.rtMain.textures[0];
    this.mPaint.uniforms.tData.value = this.rtMain.textures[1];
    this.mPaint.uniforms.uRadius.value = st.paintRadius ?? 4;
    this.pass(this.mPaint, this.rtA);
    const ink = this.mInk.uniforms;
    ink.tColor.value = this.rtA.texture; ink.tData.value = this.rtMain.textures[1];
    ink.uSeed.value = st.inkSeed ?? Math.floor((st.frame ?? 0) / 2) * 0.37;
    ink.uWidth.value = st.inkWidth ?? 1.2;
    ink.uInk.value.set(st.ink ?? '#100c0a');
    this.pass(this.mInk, this.rtB);

    const a = this.mAtmos.uniforms;
    a.tColor.value = this.rtB.texture; a.tData.value = this.rtMain.textures[1];
    a.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    a.uInvProj.value.copy(cam.projectionMatrixInverse); a.uCamWorld.value.copy(cam.matrixWorld);
    a.uHaze.value = st.haze ?? 0;
    a.uFlash.value = st.flash ?? 0;
    a.uFlashCol.value.set(st.flashCol ?? '#ffffff');
    a.uBeam.value = st.beam ?? 1; a.uSmoke.value = st.smoke ?? 0.5; a.uSteps.value = st.beamSteps ?? 28;
    a.uMono.value = st.mono ?? 0; a.uMonoTint.value.set(st.monoTint ?? '#e6d6bd');
    a.uCamp.value = st.campTint ?? 0;
    if (st.shade) { a.uShade.value.set(...st.shade.at, ...(st.shade.r ?? [0.6, 0.6])); a.uShadeK.value = st.shade.k ?? 0.8; } else a.uShadeK.value = 0;
    if (st.sweep) { a.uSweep.value.set(st.sweep.z, st.sweep.soft ?? 0.5); a.uSweepK.value = st.sweep.k ?? 0.85; } else a.uSweepK.value = 0;
    this.pass(this.mAtmos, this.rtA);
    if (overlay) { r.setRenderTarget(this.rtA); r.render(overlay, cam); }
    let src = this.rtA;
    if ((st.styleId ?? 0) > 0) {
      const s = this.mStyle.uniforms;
      s.tColor.value = this.rtA.texture; s.tData.value = this.rtMain.textures[1];
      s.uFrame.value = st.frame ?? 0; s.uStyle.value = st.styleId;
      s.uCamPos.value.copy(a.uCamPos.value); s.uInvProj.value.copy(cam.projectionMatrixInverse); s.uCamWorld.value.copy(cam.matrixWorld);
      this.pass(this.mStyle, this.rtB);
      src = this.rtB;
    }

    this.mBright.uniforms.tColor.value = src.texture;
    this.mBright.uniforms.uThreshold.value = st.bloomThreshold ?? 0.9;
    this.pass(this.mBright, this.rtBl[0]);
    const blur = (s0, dst, dx, dy, tw, th) => { this.mBlur.uniforms.tColor.value = s0.texture; this.mBlur.uniforms.uDir.value.set(dx / tw, dy / th); this.pass(this.mBlur, dst); };
    const [b0, b1, b2, b3] = this.rtBl;
    blur(b0, b1, 1, 0, b0.width, b0.height); blur(b1, b0, 0, 1, b0.width, b0.height);
    blur(b0, b2, 1, 0, b0.width, b0.height); blur(b2, b3, 0, 1, b2.width, b2.height);
    blur(b3, b2, 2, 0, b2.width, b2.height); blur(b2, b3, 0, 2, b2.width, b2.height);
    const f = this.mFinal.uniforms;
    f.tColor.value = src.texture; f.tBloom1.value = b0.texture; f.tBloom2.value = b3.texture;
    f.uFrame.value = st.frame ?? 0;
    f.uFade.value = st.fade ?? 0;
    f.uFadeColor.value.set(st.fadeColor ?? '#000000');
    f.uExposure.value = st.exposure ?? 1.05;
    f.uGamma.value = st.gamma ?? 0.92;
    f.uContrast.value = st.contrast ?? 1.1;
    f.uSat.value = st.sat ?? 1;
    f.uBloom.value = st.bloom ?? 0.6;
    f.uVignette.value = st.vignette ?? 0.4;
    f.uGrain.value = st.grain ?? 0.03;
    f.uWarp.value = st.warp ?? 0;
    f.uLift.value.set(st.lift ?? '#07070a'); f.uGain.value.set(st.gain ?? '#fff4e6');
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.W, this.H);
    this.quad.material = this.mFinal;
    r.render(this.quadScene, this.quadCam);
  }
}
