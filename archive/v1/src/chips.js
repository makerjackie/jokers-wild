// JOKERS WILD — the one poker chip. Chips are chips: every chip in the film is this model, instanced.
//   CHIP = { R, H }               radius and thickness (m). A chip lies flat: its axis is local +y, centred on the origin.
//   chipGeometry(seg = 20)        the shared turned geometry (rounded rim, a shallow recessed face on both sides)
//   chipMaterial(kind, o = {})    kind 'US': black-green, a printed silicon die, edge spots
//                                 kind 'CN': rough red kiln clay, every chip a little lopsided, a crude stamped mark
//                                 o.inked (default true) false = no ink outlines (use it for big piles seen small)
//   makeChips(n, kind, o = {})    -> THREE.InstancedMesh of n chips (identity matrices, frustumCulled off, count = n).
//                                 Set matrices with setMatrixAt(i, m) (+ instanceMatrix.needsUpdate). Each instance gets
//                                 its own print rotation / tone from its instance index.
// Material ids: 19 inked, 118 uninked (props range).
import * as THREE from 'three';
import { celMaterial, C } from './materials.js';

export const CHIP = { R: 0.017, H: 0.0046 };
const lin = (hex) => { const c = C(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const f = (x) => { const s = (+x).toFixed(5); return s.includes('.') ? s : s + '.0'; };

const _geo = {};
export function chipGeometry(seg = 20) {
  if (_geo[seg]) return _geo[seg];
  const { R, H } = CHIP, h = H / 2;
  const prof = [[0, -h + 0.0003], [R * 0.72, -h + 0.0003], [R * 0.74, -h], [R - 0.0011, -h], [R - 0.0003, -h + 0.0006], [R, -h + 0.0015],
    [R, h - 0.0015], [R - 0.0003, h - 0.0006], [R - 0.0011, h], [R * 0.74, h], [R * 0.72, h - 0.0003], [0, h - 0.0003]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.computeVertexNormals();
  return (_geo[seg] = g);
}

const PASS_ID = { vsHead: 'varying float vChip;', vertex: 'vChip = float(gl_InstanceID);', fsHead: 'varying float vChip;' };
export function chipMaterial(kind = 'US', o = {}) {
  const id = o.inked === false ? 118 : 19;
  const R = f(CHIP.R);
  if (kind === 'CN') {
    return celMaterial({
      color: '#9c3c26', id, gloss: 0.15, rim: 0.8, ...PASS_ID,
      // hand-pressed clay: each chip a little lopsided and uneven in thickness
      vertex: /* glsl */ `
        vChip = float(gl_InstanceID);
        float ca = atan(pos.z, pos.x);
        float w = 1.0 + 0.05 * sin(ca * 2.0 + vChip * 1.7) + 0.03 * sin(ca * 5.0 + vChip * 0.9);
        pos.xz *= w;
        pos.y *= 1.0 + 0.18 * sin(vChip * 2.3 + pos.x * 90.0);
      `,
      pattern: /* glsl */ `
        float mpp = length(fwidth(vWorld));
        float fine = 1.0 - smoothstep(0.0003, 0.0012, mpp);
        vec2 p = vLocal.xz;
        float r = length(p) / ${R};
        float tone = fract(sin(vChip * 12.9898) * 43758.5453);
        col *= 0.82 + 0.3 * tone;
        col *= 0.8 + 0.4 * mix(0.5, vnoise(vLocal.xz * 2400.0 + vChip) * 0.6 + vnoise(vLocal.xz * 700.0 + vLocal.y * 900.0) * 0.4, fine);
        if(abs(vLocalN.y) > 0.5){
          // a crude stamped square with a cross in it, pressed in by hand
          float ang = vChip * 2.4;
          vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p / ${R};
          float sq = max(abs(q.x), abs(q.y));
          float mark = (1.0 - smoothstep(0.03, 0.06, abs(sq - 0.38))) + (1.0 - smoothstep(0.025, 0.05, min(abs(q.x), abs(q.y)))) * step(sq, 0.38);
          col *= 1.0 - 0.38 * clamp(mark, 0.0, 1.0) * fine;
          if(r > 0.86) col *= 0.88;
        } else col *= 0.86;
        // kiln scorch
        col = mix(col, col * vec3(0.45, 0.4, 0.38), smoothstep(0.62, 0.85, vnoise(vLocal.xz * 300.0 + vChip * 3.1)) * 0.6);
        specTh = 0.97;
      `,
    });
  }
  return celMaterial({
    color: '#1e2924', id, gloss: 0.85, rim: 1.0, ...PASS_ID,
    pattern: /* glsl */ `
      float mpp = length(fwidth(vWorld));
      float fine = 1.0 - smoothstep(0.00025, 0.001, mpp);
      float mid = 1.0 - smoothstep(0.0008, 0.003, mpp);
      vec2 p = vLocal.xz;
      float r = length(p) / ${R};
      float a = atan(p.y, p.x);
      float sd = fract(sin(vChip * 78.233) * 43758.5453);
      vec3 green = ${lin('#5f9a1c')}, ivory = ${lin('#d9d2bd')}, gold = ${lin('#c79a3c')}, die = ${lin('#262a2c')};
      col *= 0.92 + 0.12 * sd;
      if(abs(vLocalN.y) > 0.5){
        // the classic edge spots of a casino chip
        float spot = step(0.5, fract(a / 6.2832 * 6.0 + sd));
        if(r > 0.8) col = mix(col, mix(green, ivory, step(0.5, fract(a / 6.2832 * 12.0 + sd))) * 0.9, spot * mid);
        if(abs(r - 0.76) < 0.022) col = mix(col, green, mid);
        // a printed silicon die: pins round a dark square, a fine circuit grid on it
        float ang = sd * 6.2832;
        vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p / ${R};
        float sq = max(abs(q.x), abs(q.y));
        if(sq < 0.6 && sq > 0.44){
          float along = abs(q.x) > abs(q.y) ? q.y : q.x;
          col = mix(col, gold, step(0.45, fract(along * 11.0)) * mid);
        }
        if(sq < 0.42){
          col = mix(col, die, mid);
          vec2 gq = fract(q * 9.0);
          float grid = max(1.0 - smoothstep(0.0, 0.12, gq.x), 1.0 - smoothstep(0.0, 0.12, gq.y));
          col = mix(col, green * 0.8, grid * 0.6 * fine);
          if(sq < 0.12) col = mix(col, ivory * 0.8, fine);
        }
      } else {
        // the edge: six ivory blocks on black-green
        col = mix(col, ivory * 0.85, step(0.62, fract(a / 6.2832 * 6.0 + sd)) * mid);
      }
      specTh = 0.93;
    `,
  });
}

export function makeChips(n, kind = 'US', o = {}) {
  const m = new THREE.InstancedMesh(chipGeometry(o.seg ?? 20), chipMaterial(kind, o), Math.max(1, n));
  m.frustumCulled = false;
  m.count = n;
  m.name = `chips-${kind}`;
  return m;
}
