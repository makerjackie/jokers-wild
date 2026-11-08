// 《失控》 — the two finalists' card stands: a slender dark-walnut pedestal beside and a little behind each of them, a
// brass-rimmed tray on top where his deck lies (the cards themselves are free cards placed by the director).
//   makeDecks(ctx) -> { root, update(st.decks, t) };  DECK = { CN: [x, y, z], US: [x, y, z] } the tray's top centre
//   st.decks = { CN: { show }, US: { show } }   (missing: not drawn)
import * as THREE from 'three';
import { celMaterial } from './materials.js';
import { lathe } from './geom.js';
import { FLOOR_Y } from './layout.js';

export const DECK = { CN: [-2.04, 0.4, 0.56], US: [2.04, 0.4, 0.56], TRAY: [0.24, 0.31] };

export function makeDecks() {
  const root = new THREE.Group(); root.name = 'decks';
  const wood = celMaterial({ color: '#3a2618', id: 1, gloss: 0.35 });
  const brass = celMaterial({ color: '#a8823e', id: 5, gloss: 0.8 });
  const felt = celMaterial({ color: '#1f3a2b', id: 1, gloss: 0.05 });
  const stands = {};
  for (const side of ['CN', 'US']) {
    const g = new THREE.Group(); g.name = `deck-${side}`;
    const [x, y, z] = DECK[side];
    g.position.set(x, 0, z);
    const H = y - FLOOR_Y;                                   // floor to tray top
    // a turned column: a wide foot, a slim waist, a collar under the tray
    const prof = [[0.0, 0], [0.17, 0], [0.17, 0.03], [0.12, 0.05], [0.06, 0.09], [0.045, 0.2], [0.035, H * 0.45], [0.05, H * 0.5], [0.032, H * 0.56],
      [0.03, H - 0.09], [0.06, H - 0.06], [0.07, H - 0.035], [0.0, H - 0.035]].map(([r, h]) => [r, h + FLOOR_Y]);
    const col = new THREE.Mesh(lathe(prof, 28), wood); col.castShadow = true; g.add(col);
    // the tray: a dark board with a brass rim and a felt bed
    const [tw, td] = DECK.TRAY;
    const board = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.03, 0.025, td + 0.03), wood); board.position.set(0, y - 0.0125 - 0.006, 0); board.castShadow = true; g.add(board);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.004, td), felt); bed.position.set(0, y - 0.004, 0); g.add(bed);
    const rimG = [[tw + 0.03, 0.012, 0.008, 0, (td + 0.03) / 2], [tw + 0.03, 0.012, 0.008, 0, -(td + 0.03) / 2], [0.008, 0.012, td + 0.03, (tw + 0.03) / 2, 0], [0.008, 0.012, td + 0.03, -(tw + 0.03) / 2, 0]];
    for (const [w, h, d, ox, oz] of rimG) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), brass); m.position.set(ox, y - 0.002, oz); g.add(m); }
    root.add(g); stands[side] = g;
  }
  function update(st = {}) {
    for (const side of ['CN', 'US']) stands[side].visible = (st[side]?.show ?? 0) > 0;
  }
  update({});
  return { root, update };
}
