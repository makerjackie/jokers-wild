import * as THREE from 'three';

// Uniforms shared by every material: spreading G copies the {value} refs, so one write updates all.
// The war room is lit by one pendant lamp (hard light, hard shadows), a near-black ambient, two faint
// camp-coloured rims from behind each row, and one movable practical light (alarm, kiln, case spot).
export const G = {
  uTime: { value: 0 },
  uFxTime: { value: 0 },            // film time on threes (smoke, drawn FX)
  uPass: { value: 0 },              // 0 main pass, 1 shadow pass (write distance to the lamp)
  uLampPos: { value: new THREE.Vector3(0, 2.6, -0.1) },
  uLampCol: { value: new THREE.Color('#ffe2b0') },
  uLampPow: { value: 1.55 },
  uLampCone: { value: Math.cos((64 * Math.PI) / 180) },   // cos of the light's half-angle
  uLampDir: { value: new THREE.Vector3(0, -1, 0) },        // the lamp's axis (tilts as it swings)
  uLampSoft: { value: 0.08 },
  uAmb: { value: new THREE.Color('#14161f') },             // what shadows fall to
  uBounce: { value: new THREE.Color('#3a2c1e') },          // warm light bounced up from the lit tabletop
  uRimCN: { value: new THREE.Color('#ff5a3c') },           // CN row rim (from behind the -x row)
  uRimUS: { value: new THREE.Color('#5a86ff') },           // US row rim (from behind the +x row)
  uRimK: { value: 0.55 },
  uP2Pos: { value: new THREE.Vector3(0, 3, -5) },          // practical light (alarm beacon etc.)
  uP2Col: { value: new THREE.Color('#000000') },
  uP2Range: { value: 6 },
  uP3Pos: { value: new THREE.Vector3(0, 3, 5) },          // a second practical / fill (director)
  uP3Col: { value: new THREE.Color('#000000') },
  uP3Range: { value: 3 },
  uShadowMap: { value: null },
  uShadowVP: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowFar: { value: 14 },
  uMeterPx: { value: 0.001 },       // metres per pixel at 1 m (for distance fades)
};

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.-2.*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm2(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float fbm3(vec3 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a*vnoise3(p); p = p*2.07 + vec3(1.7, 9.2, 4.1); a *= .5; } return s; }
`;

export const COMMON = /* glsl */ `
uniform float uTime, uFxTime, uPass, uLampPow, uLampCone, uLampSoft, uRimK, uP2Range, uP3Range, uShadowOn, uShadowFar, uMeterPx;
uniform vec3 uLampPos, uLampDir, uLampCol, uAmb, uBounce, uRimCN, uRimUS, uP2Pos, uP2Col, uP3Pos, uP3Col;
uniform sampler2D uShadowMap;
uniform mat4 uShadowVP;
${NOISE}
// hard lamp shadow with a 4-tap soft edge; 1 = lit
float lampShadow(vec3 w, vec3 nW){
  if(uShadowOn < 0.5) return 1.0;
  vec3 wp = w + nW * 0.012;
  vec4 sc = uShadowVP * vec4(wp, 1.0);
  if(sc.w <= 0.0) return 1.0;
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if(p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 1.0;
  float d = distance(wp, uLampPos) / uShadowFar;
  vec2 ts = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for(int k = 0; k < 4; k++){
    vec2 o = (vec2(float(k & 1), float(k >> 1)) - 0.5) * ts * 1.5;
    float ref = texture(uShadowMap, p.xy + o).r;
    s += (d - 0.0025 <= ref) ? 1.0 : 0.0;
  }
  return s * 0.25;
}
// how much lamp light reaches world point w (cone and falloff, no shadow, no N.L)
float lampReach(vec3 w){
  vec3 Lv = uLampPos - w; float dist = length(Lv);
  // cosine of the angle between the lamp's axis and the direction to w
  float cone = smoothstep(uLampCone - uLampSoft, uLampCone + uLampSoft, dot(-Lv, uLampDir) / dist);
  return uLampPow * cone / (1.0 + 0.085 * dist * dist);
}
`;

export const MRT_OUT = /* glsl */ `
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oData;
// data: view normal xy, view depth, material id (0 painted bg, 1..99 inked cel, 100+ cel without ink)
void writeOut(vec3 col, vec3 nView, float viewDepth, float id){
  oColor = vec4(col, id > 0.5 ? 0.0 : 1.0);   // alpha marks painted pixels for the brush pass
  oData = vec4(nView.xy * 0.5 + 0.5, viewDepth, id);
}
// shadow pass: distance to the lamp, normalised
void writeShadow(vec3 w){
  oColor = vec4(distance(w, uLampPos) / uShadowFar, 0.0, 0.0, 1.0);
  oData = vec4(0.0);
}
`;

export const VERT_STD = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vNormalV;
varying float vDepth;
void stdVertex(vec3 pos, vec3 nrm, mat4 mm){
  vec4 wp = mm * vec4(pos, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(mm) * nrm);
  vNormalV = normalize(mat3(viewMatrix) * vNormalW);
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
