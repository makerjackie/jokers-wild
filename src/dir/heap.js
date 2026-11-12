// 《失控》 — the pile as a heap. Cards are dropped in landing order onto a heightfield; each one comes to rest on what is
// already there (its plane fitted to the highest points under it, tilt capped), then raises the field under its
// footprint. Deterministic, computed once. A card that leaves the heap later (the rise) is just drawn elsewhere: the
// field only matters for where later cards came to rest.
//   buildHeap(drops) -> rest[]   drops: [{ x, z, yaw, scale, air, up (true: face up) }] in landing order
//   rest[i] = { pos: [x, y, z], q, n: [nx, ny, nz] (the face side's normal), top (the field height under its centre after) }
import { CARD } from '../cards.js';
import { basisQ } from '../freecards.js';

const CELL = 0.01, N = 260, X0 = -1.3, Z0 = -1.3;      // a 2.6 m square around the pile, 1 cm cells
const MAX_TILT = 0.62;   // (v9) cards slide and lean on the slopes                                   // rad

export function makeField() {
  const H = new Float32Array(N * N);
  const idx = (x, z) => { const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const get = (x, z) => { const k = idx(x, z); return k < 0 ? 0 : H[k]; };
  return { H, get, idx };
}

// rest one card on the field and raise the field under it
export function dropCard(F, d) {
  const s = d.scale ?? 1, hw = (CARD.W * s) / 2, hh = (CARD.H * s) / 2, T = CARD.T * s;
  const vx = Math.cos(d.yaw), vz = Math.sin(d.yaw);        // the card's top-edge direction on the table
  const ux = -vz, uz = vx;                                  // its width direction
  // sample the footprint on a 9 x 9 grid (a, b in -1..1)
  const S = [];
  for (let ia = 0; ia <= 8; ia++) for (let ib = 0; ib <= 8; ib++) {
    const a = ia / 4 - 1, b = ib / 4 - 1;
    const y = F.get(d.x + ux * a * hw + vx * b * hh, d.z + uz * a * hw + vz * b * hh);
    S.push([a, b, y]);
  }
  // the card settles as low as it can: try slopes within the tilt cap, keep the plane whose centre rests lowest while
  // staying above every sample (it slides off peaks rather than balancing on them)
  const cap = Math.tan(MAX_TILT);
  let best = Infinity, sa = 0, sb = 0;
  for (let ka = -4; ka <= 4; ka++) for (let kb = -4; kb <= 4; kb++) {
    const ta = (ka / 4) * cap, tb = (kb / 4) * cap;
    if (Math.hypot(ta, tb) > cap) continue;
    let y = -Infinity;
    for (const [a, b, h] of S) { const v = h - ta * a * hw - tb * b * hh; if (v > y) y = v; }
    y += 0.0004 * (Math.abs(ka) + Math.abs(kb));          // a slight preference for lying flat
    if (y < best) { best = y; sa = ta; sb = tb; }
  }
  const ga = sa * hw, gb = sb * hh;
  const y0 = best;
  const air = d.air ?? 0;
  const yc = y0 + T / 2 + air;
  // orientation: normal from the slopes, top edge along the slope
  const n = [-(sa * ux + sb * vx), 1, -(sa * uz + sb * vz)];
  const nl = Math.hypot(...n); n[0] /= nl; n[1] /= nl; n[2] /= nl;
  const up = [vx, sb, vz];
  const face = d.up === false ? [-n[0], -n[1], -n[2]] : n;
  const q = basisQ(face, up);
  // raise the field under the card (its top surface plus a little of the air: the heap stays loose)
  const r = Math.hypot(hw, hh);
  const i0 = Math.floor((d.x - r - X0) / CELL), i1 = Math.ceil((d.x + r - X0) / CELL);
  const j0 = Math.floor((d.z - r - Z0) / CELL), j1 = Math.ceil((d.z + r - Z0) / CELL);
  for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
    const px = X0 + (i + 0.5) * CELL - d.x, pz = Z0 + (j + 0.5) * CELL - d.z;
    const a = (px * ux + pz * uz) / hw, b = (px * vx + pz * vz) / hh;
    if (Math.abs(a) > 1 || Math.abs(b) > 1) continue;
    // the high end of a tilted card sags under what lands on it: the field keeps only part of the tilt
    const y = y0 + 0.4 * (ga * a + gb * b) + (d.grow ? T : 0.0012 * s) + air * 0.6;   // cards lying flat overlap: the pile grows by much less than a card's (exaggerated) thickness; (v19) the machines' mountain by all of it
    const k = j * N + i;
    if (y > F.H[k]) F.H[k] = y;
  }
  return { pos: [d.x, yc, d.z], q, n: face, top: F.get(d.x, d.z) };
}

export function buildHeap(drops) {
  const F = makeField();
  return { rest: drops.map((d) => dropCard(F, d)), field: F };
}
