// Bench for the set module (?bench=set). Each integer bench time is one setup; the fraction animates it.
// v3 test reel: the map cloth at the paper people's height (st.set.cloth = { cities, gold, flood }), boxes and giants off.
//   0  M1 wide, towns dark (the shimmer check)          1  M1 wide, towns lit (gold 0)        2  M1 wide, towns lit (gold 1)
//   3  macro at the red figure's home spot (-0.56, -2.02), towns dark    4  the same, towns lit (gold 0)    5  gold 1
//   6  macro across the sea from behind the red figure to the US coast, towns lit (gold 0)    7  the same, gold 1
//   8  the flood at r 0.3 from (0, -2.02), the across-the-sea macro     9  the flood at r 1.2, the same camera
//  10  the flood at r 0.3 from above (1.1 m)                           11  the flood at r 1.2 from above
//  12  the flood at r 1.2 in the M1 wide                               13  the flood growing (r = 0 .. 3.4 over the fraction), M1
//  14  the weave close up (1.2 cm above the cloth)                     15  macro looking into the lamp (grazing light on the weave)
//  16  from DeepSeek's shoulder down at the proposal card spot (2-02)  17  the blue figure's home spot (mirror of 4)
//  18  the flood front passing the two figures (r = 0.05 .. 0.7 over the fraction), the across-the-sea macro
//  19  mid height (0.35 m) along the CN coast, towns lit: the fade band between macro and wide
//  20  the ink in the weave: 3 cm above the port town on the CN coast near (-0.45, -2.17), looking down at it, dark
//  21  the same, the town lit (gold 0)      22  the same, the flood (r 0.45) filling its lines with gold
//  23  the shimmer test: M1, towns lit, the camera drifting 4 mm sideways over the fraction (diff consecutive frames)
//  24  the shimmer test close: from 0.35 m (as 19), the camera drifting 2 mm
// URL overrides: &cities= &gold= &flood=r (centre (0, -2.02)) &fw= (front width) &dof=1 (a macro depth of field like the
// director's) &fig=0 (no stand-in figures) &lamp= (the lamp's on, 0..1: a darker room)
// v2 / v1 regression views live at 50 + their old number:
//  50  M1 wide: both boxes locked (five padlocks, chains), no stickers; giants hidden
//  51  the US box locked, from the sea-side close camera [0.25, 0.35, -1.25]
//  52  the US box: locks 0, 1 gone, six stickers, the seam leaking gold (same camera)
//  53  the US box: all locks gone, chains off, 14 stickers, lid open with gold light pouring up
//  54  close-up at the sea side: lock 0 springs open and drops (locks[0] = the fraction)
//  55  M1: the giants sunk low (rise 0), eyes open        56  M1: the giants standing (rise 1), eyes open
//  57  from the head (4-04): the US giant's fist out over the chip bridge's middle
//  58  the torn hole in the map at CITY (u = 0.25 .. 1 over the fraction)
//  59  M1 pushed in (5-09): three locks gone on both boxes, 12 stickers, seams leaking, giants leaning in
//  60  the CN box from its sea-side camera (mirror check)  61  the burst (burst = the fraction)
//  62  the stickers slapped on one after another           63  the US box from above
//  64  3-07: from the sea at the height of the table        65  7-13: from inside the US box
//  66  4-02: the US giant opening its eyes                   67  the CN giant's fist held out over the table, tangled
//  68  the US giant leaning in over its row                  69  the finale camera with the card king growing 1 -> 3
//  70  the US giant reaching the hardest spot               71  the CN giant's fist from M1
//  72  the crushed bridge: the 0.65 m 禁运 EMBARGO mark       73  the CN giant's upper body, three-quarter front
//  74  the US giant's fist over the bridge, from the foot   75  the box standing open and empty before the jokers
//  76  the chains slithering off (chains = the fraction)     77  3-04 played on the bench
//  80  scoreboard close-up mid-flip  81 dispenser, chips pouring  82 the bridge crushed, EMBARGO  83..86 the chip tower falling
//  87  the kiln lit  88 the lamp switching on  89 the board jammed  90 M1 with the alarm turning  91 the beacon from the table
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeSet, TOWNS } from '../set.js';
import { M1, BOXES } from '../layout.js';
import { makeCardKing } from '../cardking.js';

// a placeholder joker card (bench only; the cards module draws the real one at jokerAnchor: card centre = anchor * (0, 0.13, 0))
function placeholderCard(side) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 520;
  const g = c.getContext('2d');
  const hue = side === 'CN' ? '#c4262a' : '#2a54c4';
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 360, 520);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 14; g.strokeRect(10, 10, 340, 500);
  g.fillStyle = hue; g.font = '900 54px Arial'; g.textAlign = 'center'; g.fillText('J', 46, 76);
  g.fillStyle = '#1a1414'; g.beginPath(); g.arc(180, 270, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#efe6d2'; for (const x of [132, 228]) { g.beginPath(); g.ellipse(x, 240, 22, 30, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#efe6d2'; g.lineWidth = 14; g.beginPath(); g.arc(180, 270, 80, 0.2, Math.PI - 0.2); g.stroke();
  g.fillStyle = hue; g.beginPath(); g.moveTo(80, 170); g.lineTo(180, 60); g.lineTo(280, 170); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.26).translate(0, 0.13, 0), celMaterial({ color: '#ffffff', id: 30, gloss: 0.3, uniforms: { uTex: { value: tex } }, pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.22)); emis += col * 0.6;', side: THREE.DoubleSide }));
  return m;
}

// a 5 cm paper stand-in for scale (bench only; the paper module draws the real protagonists): a profile cut-out whose
// paper plane is local xy, facing +x
function standIn(color) {
  const s = new THREE.Shape();
  const P = [[-0.004, 0], [-0.0015, 0.016], [-0.0035, 0.0], [-0.0075, 0.0], [-0.0045, 0.019], [-0.0055, 0.033], [-0.009, 0.026], [-0.0105, 0.027],
    [-0.0065, 0.0375], [-0.002, 0.0395], [-0.001, 0.0405], [0.0025, 0.0395], [0.006, 0.03], [0.0045, 0.029], [0.0035, 0.033], [0.0035, 0.019], [0.0065, 0.0]];
  s.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) s.lineTo(x, y); s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  const head = new THREE.CircleGeometry(0.0052, 20).translate(0.0004, 0.0448, 0);
  const grp = new THREE.Group();
  const mat = celMaterial({ color, id: 40, gloss: 0.1, side: THREE.DoubleSide, pattern: 'col *= 0.9 + 0.1 * vnoise(vLocal.xy * 900.0);' });
  grp.add(new THREE.Mesh(g, mat), new THREE.Mesh(head, mat));
  return grp;
}

// row histories: settled texts, a flip around t = 30.9 (bench 80), a fast run then a jam around t = 39 (bench 89),
// and the end of the film from t = 39.95
const NAMES = [['{openai}', 'OpenAI'], ['{deepseek}', 'DeepSeek'], ['{google}', 'Gemini'], ['{qwen}', 'Qwen'], ['{anthropic}', 'Claude'], ['{kimi}', 'Kimi'], ['{xai}', 'Grok'], ['{glm}', 'GLM'], ['{meta}', 'Llama'], ['{doubao}', 'Doubao']];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
function rows(dt = 0) {
  const out = [];
  out.push([{ t: -1, text: '2022·11' }, { t: 30.9 + dt, text: '2026·11' }]);
  NAMES.forEach(([logo, name], i) => {
    const r = [{ t: -1, text: `${logo} ${pad(name, 9)} ${(94.6 - i * 0.4).toFixed(1)}` }];
    if (i < 4) r.push({ t: 30.78 + dt + i * 0.05, text: `${NAMES[(i + 1) % 10][0]} ${pad(NAMES[(i + 1) % 10][1], 9)} #${i + 1}` });
    for (let k = 0; k < 8; k++) r.push({ t: 37.9 + dt + k * 0.16 + i * 0.013, text: `${NAMES[(i + k) % 10][0]} ${pad(NAMES[(i + k) % 10][1], 9)} #1` });
    out.push(r);
  });
  out.push([{ t: -1, text: '×1024' }]);
  return out;
}
const BOARD_ROWS = rows(50);

const ones = (n) => Array.from({ length: n }, () => 1);
const box = (o = {}) => ({ show: 1, lid: 0, burst: 0, seam: 0, locks: [0, 0, 0, 0, 0], chains: 0, stickers: [], ...o });

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine });
  scene.add(set.root);
  const cards = { CN: placeholderCard('CN'), US: placeholderCard('US') };
  set.jokerAnchor.CN.add(cards.CN); set.jokerAnchor.US.add(cards.US);
  const V = new THREE.Vector3();
  window.__set = set; window.__towns = TOWNS;      // bench only: lets tools poke the API
  // the card king, only for the finale check (69): grow 3, the mantle reaching past the walls
  const ck = makeCardKing({ scene, overlay, camera, engine }, {}); scene.add(ck.root); if (ck.overlay) overlay.add(ck.overlay);
  // the two 5 cm stand-ins at their home spots, facing each other across the sea
  const red = standIn('#c8322a'), blue = standIn('#2f55b8');
  red.position.set(-0.56, 0, -2.02); blue.position.set(0.56, 0, -2.02); blue.rotation.y = Math.PI;
  scene.add(red, blue);
  const POW = G.uLampPow.value;
  const q = new URLSearchParams(location.search);
  const cam = (c, pos, look, fov, near = 0.03) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(V.set(...look)); c.fov = fov; c.near = near; };
  const m1 = (c, push = 0) => { const k = push * 0.62; cam(c, [M1.pos[0], M1.pos[1] - k * 0.5, M1.pos[2] - k * (M1.pos[2] - 3.4)], M1.look, M1.fov); };
  const US = BOXES.US;
  return (t, c) => {
    const k = Math.min(91, Math.max(0, Math.floor(t + 1e-6))), u = t - k;
    const look = { style: 'noir' };
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    let st;
    if (k < 50) {
      // ---- v3
      const cloth = { cities: 0, gold: 0, flood: null };
      st = {
        lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0,
        board: { rows: BOARD_ROWS, lit: 1 }, alarm: { on: 0, angle: 0 },
        boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } }, cloth,
      };
      let macro = 0, focus = 0;
      const flood = (r, w = 0.12) => { cloth.flood = { c: [0, -2.02], r, w }; };
      const lit = (g) => { cloth.cities = 1; cloth.gold = g; };
      const cnHome = () => { cam(c, [-0.56, 0.035, -1.85], [-0.56, 0.02, -2.15], 40, 0.003); macro = 1; focus = 0.17; };
      const across = () => { cam(c, [-0.66, 0.032, -1.97], [0.56, 0.03, -2.06], 40, 0.003); macro = 1; focus = 0.12; };
      if (k === 0) m1(c);
      else if (k === 1) { lit(0); m1(c); }
      else if (k === 2) { lit(1); m1(c); }
      else if (k === 3) cnHome();
      else if (k === 4) { lit(0); cnHome(); }
      else if (k === 5) { lit(1); cnHome(); }
      else if (k === 6) { lit(0); across(); }
      else if (k === 7) { lit(1); across(); }
      else if (k === 8) { lit(0); flood(0.3); across(); }
      else if (k === 9) { lit(0); flood(1.2); across(); }
      else if (k === 10) { lit(0); flood(0.3); cam(c, [0.0, 1.1, -0.95], [0, 0, -2.02], 50); }
      else if (k === 11) { lit(0); flood(1.2); cam(c, [0.0, 1.6, -0.2], [0, 0, -2.0], 55); }
      else if (k === 12) { lit(0); flood(1.2, 0.2); m1(c); }
      else if (k === 13) { lit(0); flood(u * 3.4, 0.25); m1(c); }
      else if (k === 14) { lit(0); cam(c, [-0.535, 0.012, -2.05], [-0.50, 0.0, -2.085], 40, 0.002); macro = 1; focus = 0.05; }
      else if (k === 15) { lit(0); cam(c, [-0.58, 0.03, -2.3], [-0.55, 0.035, -1.9], 40, 0.003); macro = 1; focus = 0.25; }
      else if (k === 16) { lit(0); cam(c, [-1.35, 0.95, -2.35], [-0.78, 0.0, -2.2], 40); }
      else if (k === 17) { lit(0); cam(c, [0.56, 0.035, -1.85], [0.56, 0.02, -2.15], 40, 0.003); macro = 1; focus = 0.17; }
      else if (k === 18) { lit(0); flood(0.05 + 0.65 * u, 0.1); across(); }
      else if (k === 19) { lit(0); cam(c, [-0.3, 0.35, -0.9], [-0.55, 0.0, -2.3], 45); }
      else if (k === 23) { lit(0); m1(c); c.position.x += u * 0.004; }
      else if (k === 24) { lit(0); cam(c, [-0.3 + u * 0.002, 0.35, -0.9], [-0.55 + u * 0.002, 0.0, -2.3], 45); }
      else if (k >= 20 && k <= 22) {
        const port = TOWNS.reduce((b, s) => (Math.hypot(s.x + 0.45, s.z + 2.17) < Math.hypot(b.x + 0.45, b.z + 2.17) ? s : b));
        if (k >= 21) lit(0);
        if (k === 22) flood(0.45, 0.08);
        cam(c, [port.x - 0.03, 0.03, port.z + 0.035], [port.x + 0.004, 0, port.z - 0.004], 40, 0.002); macro = 1; focus = 0.05;
      }
      else m1(c);
      if (q.has('cities')) cloth.cities = +q.get('cities');
      if (q.has('gold')) cloth.gold = +q.get('gold');
      if (q.has('flood')) cloth.flood = { c: [0, -2.02], r: +q.get('flood'), w: +(q.get('fw') ?? 0.12) };
      if (macro && q.get('dof') === '1') look.dof = { focus, k: 1.6, max: 12 };
      if (q.has('lamp')) st.lamp.on = +q.get('lamp');
      red.visible = blue.visible = q.get('fig') !== '0';
    } else {
      // ---- the v2 / v1 regression views (old number = k - 50)
      const o = k - 50;
      st = {
        lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0,
        board: { rows: BOARD_ROWS, lit: 1 }, alarm: { on: 0, angle: 0 },
        dispenser: { show: true, flowUS: 0, flowCN: 0, dent: 0, toll: 0, cart: { show: false }, blink: 0 },
        tower: { show: 1, fall: 0 }, kiln: { show: 0, glow: 0, bricks: 0 },
        boxes: { CN: box(), US: box() }, giants: {}, clothHole: { u: 0 },
      };
      red.visible = blue.visible = false;
      const seaCam = (side, dy = 0) => { const s = side === 'CN' ? -1 : 1, b = BOXES[side]; cam(c, [0.25 * s, 0.35 + dy, -1.25], [b[0], 0.15, b[2]], 40); };
      const giantsOn = (x = {}) => { for (const s of ['CN', 'US']) st.giants[s] = { show: 1, rise: 1, eyes: 1, lean: 0, look: [0, 0.4, 0], ...x }; };
      if (o === 0) m1(c);
      else if (o === 1) seaCam('US');
      else if (o === 2) { st.boxes.US = box({ locks: [1, 1, 0, 0, 0], stickers: ones(6), seam: 0.5 }); seaCam('US'); }
      else if (o === 3) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, lid: 0.85 }); cam(c, [0.15, 0.75, -0.95], [US[0], 0.2, US[2]], 42); }
      else if (o === 4) { st.boxes.US = box({ locks: [u, 0, 0, 0, 0], stickers: [1] }); cam(c, [0.36, 0.24, -1.45], [US[0] - 0.19, 0.13, US[2] + 0.12], 34); }
      else if (o === 5) { giantsOn({ rise: 0 }); m1(c); }
      else if (o === 6) { giantsOn(); m1(c); }
      else if (o === 7) {
        giantsOn(); st.giants.CN.show = 0;
        st.giants.US.fist = [0.0, 1.85, 3.0];
        st.dispenser.flowCN = 1;
        cam(c, [-2.6, 3.6, -4.7], [1.4, 1.4, 2.0], 60);
      } else if (o === 8) { st.clothHole = { u: 0.25 + 0.75 * u }; cam(c, [0.95, 0.5, 2.4], [0.72, 0, 2.05], 40); }
      else if (o === 9) {
        for (const s of ['CN', 'US']) st.boxes[s] = box({ locks: [1, 1, 1, 0, 0], stickers: ones(12), seam: 0.7 });
        giantsOn({ lean: 0.6 }); m1(c, 1);
      } else if (o === 10) { st.boxes.CN = box({ locks: [1, 1, 1, 0, 0], stickers: ones(8), seam: 0.6 }); seaCam('CN'); }
      else if (o === 11) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, burst: u }); cam(c, [0.55, 0.42, -1.0], [US[0], 0.2, US[2]], 42); }
      else if (o === 12) { st.boxes.US = box({ stickers: Array.from({ length: 14 }, (_, i) => Math.max(0, Math.min(1, u * 15 - i))), seam: 0.3 }); cam(c, [0.3, 0.55, -1.0], [US[0], 0.16, US[2]], 44); }
      else if (o === 13) { st.boxes.US = box({ stickers: ones(14), seam: 0.3 }); cam(c, [0.5, 1.05, -1.45], [US[0], 0.25, US[2]], 40); }
      else if (o === 14) {
        for (const s of ['CN', 'US']) st.boxes[s] = box({ stickers: [1], seam: 0.35 });
        cam(c, [0, 0.4, -0.35], [0, 0.3, -2.4], 50);
      } else if (o === 15) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, burst: 0.9 }); cam(c, [US[0], 0.17, -1.86], [US[0], 0.28, 0.5], 70); }
      else if (o === 16) { giantsOn({ eyes: u, look: [1.6, 0.6, -2.5] }); st.giants.CN.show = 0; cam(c, [1.0, 0.75, -1.4], [3.4, 3.3, 0.2], 54); }
      else if (o === 24) { giantsOn(); st.giants.CN.show = 0; st.giants.US.fist = [0.0, 1.6, 3.0]; Object.assign(st.dispenser, { flowCN: 1 }); cam(c, [-1.6, 2.4, 8.2], [1.6, 1.9, 1.6], 50); }
      else if (o === 25) { st.boxes.US = box({ lid: 1, seam: 0, locks: [-1, -1, -1, -1, -1], chains: 1 }); cam(c, [0.15, 0.75, -0.95], [US[0], 0.2, US[2]], 42); }
      else if (o === 27) { st.boxes.US = box({ lid: 1 - Math.min(1, u * 4), locks: [0, 1, 2, 3, 4].map((i) => Math.min(0, Math.max(-1, (u - 0.45) * 12 - i * 0.9) - 0.0)), chains: 1 - Math.min(1, Math.max(0, (u - 0.2) * 5)), stickers: [Math.max(0, Math.min(1, (u - 0.85) * 8))] }); cam(c, [0.25, 0.42, -1.2], [US[0], 0.15, US[2]], 42); }
      else if (o === 26) { st.boxes.US = box({ locks: ones(5), chains: u, stickers: ones(8), seam: 0.8 }); cam(c, [0.1, 0.62, -0.85], [US[0] - 0.1, 0.12, US[2]], 46); }
      else if (o === 23) { giantsOn({ look: [0, 1.5, 2] }); st.giants.US.show = 0; cam(c, [-1.2, 3.2, 3.4], [-3.6, 3.6, 0.4], 40); }
      else if (o === 17) { giantsOn({ tangled: 1, fist: [-0.3, 2.3, 1.6], look: [-0.3, 2.0, 1.6] }); st.giants.US.show = 0; cam(c, [1.2, 2.0, 5.6], [-1.6, 2.6, 0.8], 50); }
      else if (o === 18) { giantsOn({ lean: 1, look: [US[0], 0.2, US[2]] }); st.giants.CN.show = 0; cam(c, [-1.8, 1.7, 4.6], [2.6, 2.4, 0.0], 50); }
      else if (o === 19) { st.ceiling = 0; st.board.show = 0; giantsOn(); cam(c, [0, 4.5, 12.6], [0, 5.6, -4.0], 46); }
      else if (o === 20) { giantsOn(); st.giants.CN.show = 0; st.giants.US.fist = [0.3, 1.6, 3.5]; cam(c, [-2.6, 3.4, 6.2], [1.4, 1.6, 2.0], 50); }
      else if (o === 21) { giantsOn(); st.giants.US.show = 0; st.giants.CN.fist = [-0.3, 1.8, 3.2]; m1(c); }
      else if (o === 22) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 0.4, dent: 1 }); cam(c, [-1.0, 0.7, 1.75], [0.0, 0.02, 3.0], 40); }
      else if (o === 30) { st.board.busy = { row: 1, u: 0.32 + u * 0.68 }; cam(c, [0.2, 4.95, -2.55], [-0.62, 5.2, -4.9], 34); }
      else if (o === 31) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 1 }); cam(c, [-0.9, 1.15, 1.4], [1.25, 0.15, 3.25], 46); }
      else if (o === 32) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 0.4, dent: 1 }); cam(c, [0.15, 0.62, 1.95], [0.0, 0.0, 3.0], 42); }
      else if (o >= 33 && o <= 36) { st.tower.fall = [0, 0.3, 0.6, 1][o - 33]; cam(c, [-2.4, 2.4, -0.9], [1.3, 0.35, 2.9], 52); }
      else if (o === 37) { st.kiln = { show: 1, glow: 1, bricks: 1 }; cam(c, [-0.3, 0.8, 1.7], [-2.15, 0.35, 3.45], 46); }
      else if (o === 38) { st.lamp.on = 0.12 + u * 0.4; cam(c, [0.32, 2.25, 0.62], [0, 2.6, -0.1], 30); }
      else if (o === 39) { st.board.jam = { rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], k: 1 }; cam(c, [0.0, 4.9, -1.8], [-0.4, 5.15, -4.9], 40); }
      else if (o === 40) { st.alarm = { on: 1, angle: u * 6 + 2.2 }; st.lamp.flicker = 0.25; m1(c); }
      else if (o === 41) { st.alarm = { on: 1, angle: 1.25 + u * 6 }; cam(c, [0.6, 3.2, 0.9], [0, 5.55, -4.8], 48); }
      else m1(c);
    }
    set.update(st, t);
    if (q.has('hide')) for (const nm of q.get('hide').split(',')) for (const g of Object.values(set._giants)) if (g[nm]) g[nm].visible = false;
    ck.update(k === 69 ? { show: 1, build: 1, grow: 1 + 2 * Math.min(1, u * 1.5) } : { show: 0 }, t, {});
    set.lampBulb(G.uLampPos.value);
    if (G.uLampDir) set.lampDir(G.uLampDir.value);
    // the film scales the lamp's light with on and flicker; the bench does the same
    G.uLampPow.value = POW * st.lamp.on * st.lamp.on * (1 - 0.85 * st.lamp.flicker);
    // the director drives the practical light from the beacon or the kiln; the bench previews it the same way
    const on = st.alarm.on;
    if (on > 0) { set.alarmPos(G.uP2Pos.value); G.uP2Col.value.setRGB(1.0, 0.12, 0.05).multiplyScalar(on * (0.55 + 0.45 * Math.abs(Math.cos(st.alarm.angle)))); G.uP2Range.value = 9; }
    else if (st.kiln?.show > 0) { set.kilnMouth(G.uP2Pos.value); G.uP2Col.value.setRGB(1.0, 0.3, 0.08).multiplyScalar(0.8 * st.kiln.glow); G.uP2Range.value = 4; }
    else G.uP2Col.value.setRGB(0, 0, 0);
    return look;
  };
}
