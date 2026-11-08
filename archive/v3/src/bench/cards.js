// Bench for the cards: ?bench=cards  (0: a spread of model cards and backs, 1: the two jokers apart, 2: together,
// 3: thrown cards and a pile, 4: the storm, 5: glyph faces)
import * as THREE from 'three';
import { makeCards, CELL, CARD, cardAtlas } from '../cards.js';
import { makeSet } from '../set.js';
import { G } from '../glsl.js';
import { KINGS } from '../layout.js';

export function setup({ scene, camera }) {
  const set = makeSet({ scene, camera }); scene.add(set.root);
  const cards = makeCards({ scene }, { set }); scene.add(cards.root);
  window.__cardAtlas = cardAtlas().image;     // tools/atlas.mjs dumps it
  return (t, cam) => {
    const i = Math.floor(t);
    set.update({}, t); set.lampBulb(G.uLampPos.value);
    const st = { throws: [], jokers: {} };
    cam.up.set(0, 1, 0);
    if (i === 0 || i === 5) {
      // a spread on the table: one card per company, plus the two backs
      KINGS.forEach((k, j) => st.throws.push({ t: -10, who: null, cell: CELL[`${k.id}${j % 4}`], from: [0, 1, 0], to: [-0.95 + (j % 6) * 0.38, 0, -0.25 + Math.floor(j / 6) * 0.42], yaw: 0, back: CELL.backCN }));
      st.throws.push({ t: -10, cell: CELL.backCN, from: [0, 1, 0], to: [1.33, 0, 0.17], yaw: Math.PI, back: CELL.backCN });
      st.glyph = i === 5 ? 1 : 0;
      cam.fov = 30; cam.position.set(0.1, 1.45, 1.1); cam.lookAt(0.1, 0, -0.05);
    }
    if (i === 1 || i === 2) {
      const gap = i === 1 ? 0.6 : CARD.W;
      st.jokers.CN = { pos: [-gap / 2, 0.45, 0], rot: [0, 0, 0] };
      st.jokers.US = { pos: [gap / 2, 0.45, 0], rot: [0, 0, 0] };
      cam.fov = 26; cam.position.set(0, 0.55, 1.1); cam.lookAt(0, 0.45, 0);
    }
    if (i === 3) {
      for (let k = 0; k < 40; k++) st.throws.push({ t: -5 + k * 0.1 + (k > 36 ? 5.1 + (t % 1) * 0 : 0), cell: CELL[`${KINGS[k % 10].id}${k % 4}`], from: [k % 2 ? 1.0 : -1.0, 0.4, (k % 5) - 2], back: k % 2 ? CELL.backUS : CELL.backCN });
      cam.fov = 34; cam.position.set(0.6, 0.9, 1.4); cam.lookAt(0, 0.05, 0);
    }
    if (i === 4) {
      st.storm = { n: 900, t0: t - 6, spread: 4, seed: 9 };
      cam.fov = 40; cam.position.set(0, 1.95, 6.8); cam.lookAt(0, 0.8, -3.2);
    }
    cards.update(st, t);
    return { style: 'noir' };
  };
}
