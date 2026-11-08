import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';

// This pipeline shows shader values without an sRGB encode, so colours are fed display-referred:
// C('#a08060') shows on screen as roughly that hex under full lamp light.
export function C(h) {
  if (h?.isColor) return h;
  const c = new THREE.Color(h).convertLinearToSRGB();
  c.r **= 1.22; c.g **= 1.22; c.b **= 1.22;
  return c;
}

// Inked cel under one pendant lamp: a hard lit/shade split (the shade falls almost to black), a crisp
// highlight, faint camp-coloured rims (red behind the CN row at -x, blue behind the US row at +x),
// hard lamp shadows, and one practical light (alarm beacon, kiln, case spot).
//
// o: { color, id, gloss, rim, emissive, shadeMul, litBias, uniforms, pattern, vertex, vsHead, fsHead, side }
// o.pattern: GLSL run before lighting; may edit col (albedo), gloss, emis, idOut, litBias, shadeMul,
//   specK, specTh, lampMul, and read vLocal / vLocalN / vUv / vWorld / N. It may `discard`.
// o.vertex: GLSL that may edit `pos` / `nrm` before stdVertex (runs in the shadow pass too).
// Objects that should not cast lamp shadows: set mesh.userData.noShadow = true.
export function celMaterial(o = {}) {
  const u = {
    ...G,
    uColor: { value: C(o.color ?? '#cccccc') },
    uId: { value: o.id ?? 1 },
    uGloss: { value: o.gloss ?? 0.5 },
    uRim: { value: o.rim ?? 1 },
    uEmissive: { value: C(o.emissive ?? '#000000') },
    uShadeMul: { value: o.shadeMul ?? 1 },
    uLitBias: { value: o.litBias ?? 0 },
    uOpacity: { value: 1 },
    ...(o.uniforms ?? {}),
  };
  const decl = Object.keys(o.uniforms ?? {}).map((k) => {
    const v = o.uniforms[k].value;
    if (Array.isArray(v)) return `uniform vec4 ${k}[${v.length}];`;
    const t = typeof v === 'number' ? 'float' : v?.isColor || v?.isVector3 ? 'vec3' : v?.isVector2 ? 'vec2' : v?.isVector4 ? 'vec4' : v?.isMatrix4 ? 'mat4' : v?.isTexture || v === null ? 'sampler2D' : 'float';
    return `uniform ${t} ${k};`;
  }).join('\n');
  const vs = /* glsl */ `
    ${decl}
    ${o.vsHead ?? ''}
    uniform float uTime, uFxTime;
    varying vec3 vLocal;
    varying vec3 vLocalN;
    varying vec2 vUv;
    varying vec3 vInstColor;
    ${VERT_STD}
    void main(){
      vec3 pos = position; vec3 nrm = normal;
      vUv = uv;
      #ifdef USE_INSTANCING_COLOR
      vInstColor = instanceColor;
      #else
      vInstColor = vec3(1.0);
      #endif
      ${o.vertex ?? ''}
      vLocal = pos; vLocalN = nrm;
      mat4 mm = modelMatrix;
      #ifdef USE_INSTANCING
      mm = modelMatrix * instanceMatrix;
      #endif
      stdVertex(pos, nrm, mm);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${decl}
    uniform vec3 uColor, uEmissive;
    uniform float uId, uGloss, uRim, uShadeMul, uLitBias, uOpacity;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal, vLocalN;
    varying float vDepth;
    varying vec2 vUv;
    varying vec3 vInstColor;
    ${o.fsHead ?? ''}
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 col = uColor * vInstColor;
      float gloss = uGloss;
      vec3 emis = uEmissive;
      float idOut = uId;
      float litBias = uLitBias;
      float shadeMul = uShadeMul;
      float lampMul = 1.0;
      float specK = 1.0;
      float specTh = 0.975;
      { ${o.pattern ?? ''} }
      if(uPass > 0.5){ writeShadow(vWorld); return; }
      vec3 Lv = uLampPos - vWorld; float dist = length(Lv); vec3 L = Lv / dist;
      float reach = lampReach(vWorld) * lampMul;
      float ndl = dot(N, L) + litBias;
      float sh = lampShadow(vWorld, N);
      float lit = smoothstep(-0.02, 0.05, ndl) * sh;
      vec3 lampC = uLampCol * reach;
      // shade: near-black ambient, plus warm light bounced up from the lit tabletop onto down-facing faces
      float down = smoothstep(0.15, -0.75, N.y) * smoothstep(1.6, 0.0, vWorld.y);
      vec3 bounce = uBounce * lampReach(vec3(vWorld.x, 0.0, vWorld.z)) * down;
      vec3 shadeCol = col * (uAmb + bounce) * shadeMul;
      vec3 outc = mix(shadeCol, col * lampC, lit);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 H = normalize(L + V);
      float spec = step(specTh, dot(N, H)) * lit * gloss * specK;
      outc = mix(outc, uLampCol * 1.15, spec * clamp(reach, 0.0, 1.0));
      // camp rims: a thin coloured edge from behind each row, each only on its own half of the room
      float fres = 1.0 - max(dot(N, V), 0.0);
      float edge = smoothstep(0.6, 0.72, fres) * uRim * uRimK;
      float rCN = max(dot(N, normalize(vec3(-1.0, 0.4, -0.35))), 0.0) * smoothstep(0.4, -0.4, vWorld.x);
      float rUS = max(dot(N, normalize(vec3(1.0, 0.4, -0.35))), 0.0) * smoothstep(-0.4, 0.4, vWorld.x);
      outc += (uRimCN * rCN + uRimUS * rUS) * edge * mix(col, vec3(1.0), 0.6) * 0.5;
      // practical light (no shadow)
      vec3 L2v = uP2Pos - vWorld; float d2 = length(L2v);
      outc += col * uP2Col * max(dot(N, L2v / d2), 0.0) * smoothstep(uP2Range, 0.0, d2);
      { vec3 L3v = uP3Pos - vWorld; float d3 = length(L3v); outc += col * uP3Col * max(dot(N, L3v / d3), 0.0) * smoothstep(uP3Range, 0.0, d3); }
      outc += emis;
      writeOut(outc, NV, vDepth, idOut);
    }
  `;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs,
    side: o.side ?? THREE.FrontSide,
  });
}

// Unlit, emissive surface that still writes the MRT data (screens, flaps lit from inside, glows).
// Never casts a shadow. o: { color, map, id, pattern }
export function glowMaterial(o = {}) {
  const u = { ...G, uColor: { value: C(o.color ?? '#ffffff') }, uMap: { value: o.map ?? null }, uId: { value: o.id ?? 120 }, uGain: { value: o.gain ?? 1 }, ...(o.uniforms ?? {}) };
  const decl = Object.keys(o.uniforms ?? {}).map((k) => { const v = o.uniforms[k].value; const t = typeof v === 'number' ? 'float' : v?.isColor || v?.isVector3 ? 'vec3' : v?.isVector2 ? 'vec2' : v?.isTexture || v === null ? 'sampler2D' : 'float'; return `uniform ${t} ${k};`; }).join('\n');
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: u, side: o.side ?? THREE.FrontSide,
    vertexShader: `varying vec2 vUv; ${VERT_STD} void main(){ vUv = uv; mat4 mm = modelMatrix;
      #ifdef USE_INSTANCING
      mm = modelMatrix * instanceMatrix;
      #endif
      stdVertex(position, normal, mm); }`,
    fragmentShader: `${COMMON} ${MRT_OUT} ${decl} uniform vec3 uColor; uniform sampler2D uMap; uniform float uId, uGain;
      varying vec2 vUv; varying vec3 vWorld, vNormalW, vNormalV; varying float vDepth;
      void main(){ vec3 col = uColor; ${o.map ? 'col *= texture(uMap, vUv).rgb;' : ''} float idOut = uId; { ${o.pattern ?? ''} }
        if(uPass > 0.5) discard; writeOut(col * uGain, normalize(vNormalV), vDepth, idOut); }`,
  });
}

// Overlay sprites: drawn after atmosphere onto the composited image (glows, flashes, marks).
export function overlayMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uTex: { value: o.map ?? null }, uColor: { value: new THREE.Color(o.color ?? '#ffffff') }, uOpacity: { value: o.opacity ?? 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; out vec4 oc;
      void main(){ vec4 t = texture(uTex, vUv); oc = vec4(t.rgb * uColor, t.a * uOpacity); if(oc.a < 0.003) discard; }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// Material id ranges (decide inking and the style passes):
//   0          painted background (Kuwahara brush, no ink): walls, far floor, drapes
//   1..9       set (table, cloth, throne, cases' frames, scoreboard frame, lamp)
//   10..19     props (presses, buttons, seals, glasses, cigars, chips)
//   20..29     kings (body, head, crown, arms, chairs)
//   30..39     cards, inked (these keep their colour in every style)
//   40..49     paper people and card-makers
//   100..119   uninked versions of the above (same order: 100 set, 110 props, 120 kings ...)
//   130..139   cards, uninked (storm cards seen small)
//   140+       glows (lamp bulb, screens, flaps, buttons, cigar tips), glass
export const ID = { SET: 1, PROP: 10, KING: 20, CARD: 30, PAPER: 40, CARD_FLAT: 130, GLOW: 140 };
