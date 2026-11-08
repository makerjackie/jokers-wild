// Bench for the paper people (?bench=paper): the two protagonists and the crowd on the real table and map cloth, lit
// by the film's lamp. Each integer bench time is one setup; the fraction animates it.
//   0  (a) 1-02: the red one on the CN coast waving, the blue one far across the sea (ant's-eye macro)
//   1  (b) the red one looking up at a point 1.6 m away and 0.8 m up (side macro); .5 the same from behind his shoulder
//   2  (c) knocked down by a shock at 2.1 s (the fraction plays the fall); 2.75.. getting up
//   3  (d) running (side macro, the camera tracking him)
//   4  (e) the two meet at (0, -2.02) and hold hands, side view: .0 reaching, .4 .. holding
//   5  (f) the crowd fleeing a hit at 5.05 s (ant level, wide)
//   6  (g) pairPicture on a card standing on the cloth; .5 the card small (phone-size check)
//   7  (h) from a king's height (1.2 m away, y 0.6): the red one beside an 18 x 26 cm proposal card
//   8  faces: .0 calm .2 worried .4 scared .6 smile .8 blink (both figures, macro)
//   9  poses: .0 cower .25 dive .5 wind .75 gold
//  10  back-lit: looking toward the lamp through the red one (the paper glows)
//  11  the crowd designs in a row (side view); .5 from above
//  12  the crowd at rest from 0.9 m up over the CN coast; .5 the US coast
//  13  walk cycle (side macro): the red one walking out onto the sea
//  14  stamps all around: the red one hit by shocks from both sides while running (3-04)
//  15  2-04: the stamp's shadow swallows him (a stand-in block overhead), the hit, down
//  16  1-03: he looks back over his shoulder and up at the king (.0 toward the sea, .5 back and up)
// URL: &dof=1 (the director's macro depth of field), &cam=x,y,z,lx,ly,lz,fov,near (override the camera)
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeSet } from '../set.js';
import { makePaper } from '../paper.js';
import { smooth, clamp } from '../util.js';

function cardCanvas(paper, w = 720, h = 1040) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a1c14'; g.lineWidth = w * 0.012; g.strokeRect(w * 0.05, w * 0.05, w * 0.9, h - w * 0.1);
  paper.pairPicture(g, w * 0.08, h * 0.1, w * 0.84, h * 0.8);
  return c;
}
function proposalCanvas() {
  const c = document.createElement('canvas'); c.width = 520; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#ece2cc'; g.fillRect(0, 0, 520, 360);
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 6; g.strokeRect(10, 10, 500, 340);
  g.fillStyle = '#3a2a1c'; for (let i = 0; i < 7; i++) g.fillRect(40, 50 + i * 30, 300 + (i * 37) % 120, 9);
  g.fillStyle = '#c4262a'; g.fillRect(360, 240, 130, 80);
  return c;
}
function plane(canvas, w, h, id = 30) {
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), celMaterial({ color: '#ffffff', id, gloss: 0.2, uniforms: { uTex: { value: tex } }, pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.22));', side: THREE.DoubleSide }));
}

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine });
  scene.add(set.root);
  const paper = makePaper({ scene, overlay, camera, engine });
  scene.add(paper.root);
  window.__paper = paper; window.__paperMake = () => makePaper({ scene, overlay, camera, engine });
  const q = new URLSearchParams(location.search);
  // (g) the pair picture on a card standing on the cloth
  const card = plane(cardCanvas(paper), 0.09, 0.13);
  card.position.set(-0.3, 0.065, -1.6); card.rotation.y = 0.15; card.rotation.x = -0.08;
  scene.add(card);
  // (h) an 18 x 26 cm proposal card lying face up, its top edge toward the sea
  const prop = plane(proposalCanvas(), 0.26, 0.18);
  prop.rotation.x = -Math.PI / 2; prop.position.set(-0.8, 0.0006, -2.22);
  scene.add(prop);
  // a stand-in for a stamp overhead (2-04)
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.07), celMaterial({ color: '#4a3020', id: 10, gloss: 0.3 }));
  scene.add(stamp);
  const V = new THREE.Vector3();
  const POW = G.uLampPow.value;
  const cam = (c, pos, look, fov, near = 0.003) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(V.set(...look)); c.fov = fov; c.near = near; };
  const RED = [-0.56, -2.02], BLUE = [0.56, -2.02];
  // (f) the hit lands next to the densest knot of the CN crowd
  let HIT = [-0.75, -1.65], best = -1;
  for (const f of paper._crowd) {
    if (!f.home || f.side > 0) continue;
    const n = paper._crowd.filter((g) => g.home && Math.hypot(g.home[0] - f.home[0], g.home[1] - f.home[1]) < 0.3).length;
    if (n > best) { best = n; HIT = [f.home[0] + 0.03, f.home[1] + 0.02]; }
  }
  return (t, c) => {
    const k = Math.max(0, Math.floor(t + 1e-6)), u = t - k;
    const look = { style: 'noir' };
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    const st = {
      lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0, alarm: { on: 0, angle: 0 },
      boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
      cloth: { cities: 0, gold: 0, flood: null },
    };
    const red = { show: 1, pos: RED.slice(), dir: [1, 0] }, blue = { show: 1, pos: BLUE.slice(), dir: [-1, 0] };
    const crowd = { show: 0, hits: [] };
    card.visible = k === 6; prop.visible = k === 7 || k === 12; stamp.visible = k === 15;
    let focus = 0.06;
    if (k === 0) {
      red.dir = [0.8, 0.6]; red.wave = smooth(u * 3) * (1 - smooth((u - 0.85) * 6)); red.look = [0.56, 0.03, -2.02];
      blue.dir = [-0.8, -0.6]; blue.wave = smooth((u - 0.3) * 3); blue.look = [-0.56, 0.03, -2.02];
      cam(c, [-0.665, 0.032, -1.997], [0.56, 0.036, -2.02], 40); focus = 0.105;
    } else if (k === 1) {
      red.dir = [-1, 0];
      red.look = [-0.56 - 1.6, 0.8, -2.02];
      if (u < 0.5) cam(c, [-0.575, 0.025, -1.955], [-0.565, 0.03, -2.02], 40);
      else cam(c, [-0.53, 0.022, -1.985], [-0.9, 0.2, -2.12], 46);
    } else if (k === 2) {
      red.dir = [1, 0];
      red.shocks = [[2.1, 1]];
      const tt = t - 2.1;
      red.down = u < 0.75 ? smooth(tt / 0.3) : 1 - smooth((u - 0.8) / 0.18);
      red.look = [-0.3, 0.01, -2.02];
      cam(c, [-0.565, 0.028, -1.93], [-0.575, 0.015, -2.02], 44);
    } else if (k === 3) {
      const x = -0.75 + u * 0.15;
      red.pos = [x, -2.02]; red.dir = [1, 0]; red.run = 1; red.walk = (u * 0.15) / 0.034;
      cam(c, [x + 0.012, 0.026, -1.915], [x + 0.012, 0.024, -2.02], 42); focus = 0.105;
    } else if (k === 4) {
      red.pos = [-0.0105, -2.0205]; blue.pos = [0.0105, -2.0195];
      const r = smooth(u / 0.35);
      red.reach = [lerpN(-0.008, 0, r), lerpN(0.022, 0.028, r), -2.02]; blue.reach = [lerpN(0.008, 0, r), lerpN(0.022, 0.028, r), -2.02];
      if (r < 0.05) red.reach = blue.reach = null;
      red.hold = blue.hold = smooth((u - 0.35) / 0.15);
      red.look = [0.02, 0.045, -2.02]; blue.look = [-0.02, 0.045, -2.02];
      cam(c, [0, 0.026, -1.935], [0, 0.024, -2.02], 40); focus = 0.085;
    } else if (k === 5) {
      red.show = blue.show = 0;
      crowd.show = 1; crowd.hits = [[HIT[0], HIT[1], 5.05, 1]];
      cam(c, [HIT[0] + 0.22, 0.075, HIT[1] + 0.26], [HIT[0] - 0.03, 0.0, HIT[1] - 0.04], 50, 0.01); focus = 0.33;
    } else if (k === 6) {
      red.show = blue.show = 0;
      if (u < 0.5) cam(c, [-0.3, 0.07, -1.47], [-0.3, 0.065, -1.6], 40, 0.01);
      else cam(c, [-0.3, 0.2, -0.3], [-0.3, 0.06, -1.6], 40, 0.01);
    } else if (k === 7) {
      red.dir = [0.6, -0.8]; red.look = [-1.5, 0.6, -2.6];
      blue.show = 0;
      cam(c, [-1.5, 0.6, -2.6], [-0.68, 0.0, -2.12], 40, 0.03);
    } else if (k === 8) {
      const f = ['calm', 'worried', 'scared', 'smile', 'blink'][Math.min(4, Math.floor(u * 5))];
      red.face = blue.face = f;
      red.pos = [-0.57, -2.02]; blue.pos = [-0.548, -2.02]; blue.dir = [-1, 0];
      cam(c, [-0.559, 0.044, -1.995], [-0.559, 0.044, -2.02], 40);
    } else if (k === 9) {
      const p = Math.floor(u * 4);
      red.pos = [-0.57, -2.02]; blue.pos = [-0.53, -2.02]; blue.dir = [-1, 0];
      if (p === 0) { red.cower = 1; blue.cower = 0.6; }
      else if (p === 1) { red.dive = 0.55; blue.dive = 1; }
      else if (p === 2) { red.wind = 1; blue.wind = 0.7; }
      else { red.gold = 1; blue.gold = 0.6; }
      cam(c, [-0.55, 0.035, -1.93], [-0.55, 0.018, -2.02], 46);
    } else if (k === 10) {
      red.dir = [1, 0];
      cam(c, [-0.565, 0.02, -2.08], [-0.555, 0.03, -2.02], 46);
    } else if (k === 11) {
      red.show = blue.show = 0;
      crowd.show = 1; crowd.lineup = [-0.62, -2.4];
      if (u < 0.5) cam(c, [-0.62, 0.035, -2.17], [-0.62, 0.024, -2.4], 64, 0.003);
      else cam(c, [-0.62, 0.35, -2.25], [-0.62, 0.0, -2.38], 50, 0.01);
    } else if (k === 12) {
      crowd.show = 1;
      if (u < 0.5) cam(c, [-0.2, 0.9, -0.9], [-0.75, 0.0, -1.85], 50, 0.03);
      else cam(c, [0.2, 0.9, -0.9], [0.75, 0.0, -1.85], 50, 0.03);
    } else if (k === 13) {
      const x = -0.6 + u * 0.08;
      red.pos = [x, -2.02]; red.dir = [1, 0]; red.walk = (u * 0.08) / 0.02;
      cam(c, [-0.56, 0.026, -1.94], [-0.56, 0.02, -2.02], 46);
    } else if (k === 14) {
      const x = -0.7 + u * 0.15;
      red.pos = [x, -2.02]; red.dir = [1, 0]; red.run = 1; red.walk = (u * 0.15) / 0.034;
      red.shocks = [[14.15, 0.8], [14.45, 1], [14.7, 0.9]];
      crowd.show = 1; crowd.hits = [[-0.66, -2.12, 14.15, 1], [-0.6, -1.88, 14.45, 1], [-0.52, -2.15, 14.7, 1]];
      cam(c, [x + 0.01, 0.03, -1.93], [x + 0.01, 0.02, -2.02], 46);
    } else if (k === 16) {
      // 1-03: he faces the sea; a shadow falls; he looks back and up at the king behind him (the head turns on its pin)
      red.dir = [1, 0];
      red.look = u < 0.4 ? [0.56, 0.03, -2.02] : [-1.62, 0.95, -2.3];
      cam(c, [-0.5, 0.018, -1.97], [-0.62, 0.05, -2.06], 50);
    } else if (k === 15) {
      red.dir = [1, 0];
      const drop = clamp((u - 0.2) / 0.25);
      stamp.position.set(-0.6, 0.04 + 0.5 * (1 - drop * drop), -2.13);
      if (u > 0.45) { red.shocks = [[15.45, 1]]; red.down = smooth((u - 0.45) / 0.25); }
      red.look = [-0.6, 0.4, -2.1];
      cam(c, [-0.565, 0.02, -1.92], [-0.57, 0.035, -2.03], 50);
    }
    if (q.has('cam')) { const a = q.get('cam').split(',').map(Number); cam(c, a.slice(0, 3), a.slice(3, 6), a[6] ?? 40, a[7] ?? 0.003); }
    if (crowd.show && q.get('cheat') !== '0') crowd.cam = c.position.toArray();
    paper.update({ people: { red, blue }, crowd }, t);
    set.update(st, t);
    set.lampBulb(G.uLampPos.value);
    if (G.uLampDir && set.lampDir) set.lampDir(G.uLampDir.value);
    G.uLampPow.value = POW;
    G.uP2Col.value.setRGB(0, 0, 0);
    if (q.get('dof') === '1') look.dof = { focus, k: 1.6, max: 12 };
    return look;
  };
}
function lerpN(a, b, t) { return a + (b - a) * t; }
