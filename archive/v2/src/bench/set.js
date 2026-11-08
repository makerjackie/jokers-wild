// Bench for the set module (?bench=set). Each integer bench time is one setup; the fraction animates it.
// v2 (iron boxes, giants, the torn map):
//   0  M1 wide: both boxes locked (five padlocks, chains), no stickers; giants hidden
//   1  the US box locked, from the sea-side close camera [0.25, 0.35, -1.25]
//   2  the US box: locks 0, 1 gone, six stickers, the seam leaking gold (same camera)
//   3  the US box: all locks gone, chains off, 14 stickers, lid open with gold light pouring up
//   4  close-up at the sea side: lock 0 springs open and drops (locks[0] = the fraction)
//   5  M1: the giants sunk low (rise 0), eyes open
//   6  M1: the giants standing (rise 1), eyes open
//   7  from the head (4-04): the US giant's fist out over the chip bridge's middle (the seal's chain would hang from it)
//   8  the torn hole in the map at CITY (u = 0.25 .. 1 over the fraction)
//   9  M1 pushed in (5-09): three locks gone on both boxes, 12 stickers, seams leaking, giants leaning in
//  10  the CN box from its sea-side camera (mirror check): three locks gone, 8 stickers
//  11  the burst: the lid punched up from inside (burst = the fraction)
//  12  the stickers slapped on one after another (0 .. 14 over the fraction)
//  13  the US box from above: the lid's stickers, the X of chains
//  14  3-07: from the sea at the height of the table, both boxes locked and leaking, the throne beyond
//  15  7-13: from inside the US box, looking out through the lid's crack
//  16  4-02: from beside OpenAI's seat up at the US giant opening its eyes (eyes = the fraction)
//  17  the CN giant's fist held out over the table, tangled (the tremor)
//  18  the US giant leaning in over its row, looking at the box
//  19  the finale camera: ceiling 0, board show 0, the card king (cardking.js) growing 1 -> 3: the walls rise into black
//  20  the US giant reaching the hardest spot (x 0.3, y 1.6, z 3.5)
//  21  the CN giant's fist from M1 (reach toward the foot)
//  22  the medium shot of the crushed bridge: the 0.65 m 禁运 EMBARGO mark
//  24  the US giant's fist over the bridge, seen from the foot (M1 side)
//  25  the box standing open and empty before the jokers (lid 1, seam 0, locks -1 hanging open, chains 1 heaped beside it)
//  26  the chains slithering off (chains = the fraction)
//  27  3-04 played on the bench: the lid slams, the chains wrap on (chains 1 -> 0), the five padlocks click shut one by one (locks -1 -> 0), a sticker
//  23  the CN giant's upper body, three-quarter front (the design: cuirass, pauldrons, crested helm)
// v1 regression (the rest of the room):
//  30  scoreboard close-up mid-flip  31 dispenser, chips pouring  32 the bridge crushed, EMBARGO  33..36 the chip tower falling
//  37  the kiln lit  38 the lamp switching on  39 the board jammed  40 M1 with the alarm turning  41 the beacon from the table
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeSet } from '../set.js';
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

// row histories: settled texts, a flip around t = 30.9 (bench 30), a fast run then a jam around t = 39 (bench 39),
// and the end of the film from t = 39.95
const NAMES = [['{openai}', 'OpenAI'], ['{deepseek}', 'DeepSeek'], ['{google}', 'Gemini'], ['{qwen}', 'Qwen'], ['{anthropic}', 'Claude'], ['{kimi}', 'Kimi'], ['{xai}', 'Grok'], ['{glm}', 'GLM'], ['{meta}', 'Llama'], ['{doubao}', 'Doubao']];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
function rows() {
  const out = [];
  out.push([{ t: -1, text: '2022·11' }, { t: 30.9, text: '2026·11' }]);
  NAMES.forEach(([logo, name], i) => {
    const r = [{ t: -1, text: `${logo} ${pad(name, 9)} ${(94.6 - i * 0.4).toFixed(1)}` }];
    if (i < 4) r.push({ t: 30.78 + i * 0.05, text: `${NAMES[(i + 1) % 10][0]} ${pad(NAMES[(i + 1) % 10][1], 9)} #${i + 1}` });
    for (let k = 0; k < 8; k++) r.push({ t: 37.9 + k * 0.16 + i * 0.013, text: `${NAMES[(i + k) % 10][0]} ${pad(NAMES[(i + k) % 10][1], 9)} #1` });
    out.push(r);
  });
  out.push([{ t: -1, text: '×1024' }]);
  return out;
}
const BOARD_ROWS = rows();

const ones = (n) => Array.from({ length: n }, () => 1);
const box = (o = {}) => ({ show: 1, lid: 0, burst: 0, seam: 0, locks: [0, 0, 0, 0, 0], chains: 0, stickers: [], ...o });

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine });
  scene.add(set.root);
  const cards = { CN: placeholderCard('CN'), US: placeholderCard('US') };
  set.jokerAnchor.CN.add(cards.CN); set.jokerAnchor.US.add(cards.US);
  const V = new THREE.Vector3();
  window.__set = set;      // bench only: lets tools poke the API
  // the card king, only for the finale check (19): grow 3, the mantle reaching past the walls
  const ck = makeCardKing({ scene, overlay, camera, engine }, {}); scene.add(ck.root); if (ck.overlay) overlay.add(ck.overlay);
  const POW = G.uLampPow.value;
  const cam = (c, pos, look, fov) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(V.set(...look)); c.fov = fov; };
  const m1 = (c, push = 0) => { const k = push * 0.62; cam(c, [M1.pos[0], M1.pos[1] - k * 0.5, M1.pos[2] - k * (M1.pos[2] - 3.4)], M1.look, M1.fov); };
  const US = BOXES.US, CNb = BOXES.CN;
  return (t, c) => {
    const k = Math.min(41, Math.max(0, Math.floor(t + 1e-6))), u = t - k;
    const st = {
      lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0,
      board: { rows: BOARD_ROWS, lit: 1 }, alarm: { on: 0, angle: 0 },
      dispenser: { show: true, flowUS: 0, flowCN: 0, dent: 0, toll: 0, cart: { show: false }, blink: 0 },
      tower: { fall: 0 }, kiln: { show: 0, glow: 0, bricks: 0 },
      boxes: { CN: box(), US: box() }, giants: {}, clothHole: { u: 0 },
    };
    const look = { style: 'noir' };
    const q = new URLSearchParams(location.search);
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    const seaCam = (side, dy = 0) => { const s = side === 'CN' ? -1 : 1, b = BOXES[side]; cam(c, [0.25 * s, 0.35 + dy, -1.25], [b[0], 0.15, b[2]], 40); };
    const giantsOn = (o = {}) => { for (const s of ['CN', 'US']) st.giants[s] = { show: 1, rise: 1, eyes: 1, lean: 0, look: [0, 0.4, 0], ...o }; };
    if (k === 0) m1(c);
    else if (k === 1) seaCam('US');
    else if (k === 2) { st.boxes.US = box({ locks: [1, 1, 0, 0, 0], stickers: ones(6), seam: 0.5 }); seaCam('US'); }
    else if (k === 3) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, lid: 0.85 }); cam(c, [0.15, 0.75, -0.95], [US[0], 0.2, US[2]], 42); }
    else if (k === 4) { st.boxes.US = box({ locks: [u, 0, 0, 0, 0], stickers: [1] }); cam(c, [0.36, 0.24, -1.45], [US[0] - 0.19, 0.13, US[2] + 0.12], 34); }
    else if (k === 5) { giantsOn({ rise: 0 }); m1(c); }
    else if (k === 6) { giantsOn(); m1(c); }
    else if (k === 7) {
      giantsOn(); st.giants.CN.show = 0;
      st.giants.US.fist = [0.0, 1.85, 3.0];
      st.dispenser.flowCN = 1;
      cam(c, [-2.6, 3.6, -4.7], [1.4, 1.4, 2.0], 60);
    } else if (k === 8) { st.clothHole = { u: 0.25 + 0.75 * u }; cam(c, [0.95, 0.5, 2.4], [0.72, 0, 2.05], 40); }
    else if (k === 9) {
      for (const s of ['CN', 'US']) st.boxes[s] = box({ locks: [1, 1, 1, 0, 0], stickers: ones(12), seam: 0.7 });
      giantsOn({ lean: 0.6 }); m1(c, 1);
    } else if (k === 10) { st.boxes.CN = box({ locks: [1, 1, 1, 0, 0], stickers: ones(8), seam: 0.6 }); seaCam('CN'); }
    else if (k === 11) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, burst: u }); cam(c, [0.55, 0.42, -1.0], [US[0], 0.2, US[2]], 42); }
    else if (k === 12) { st.boxes.US = box({ stickers: Array.from({ length: 14 }, (_, i) => Math.max(0, Math.min(1, u * 15 - i))), seam: 0.3 }); cam(c, [0.3, 0.55, -1.0], [US[0], 0.16, US[2]], 44); }
    else if (k === 13) { st.boxes.US = box({ stickers: ones(14), seam: 0.3 }); cam(c, [0.5, 1.05, -1.45], [US[0], 0.25, US[2]], 40); }
    else if (k === 14) {
      for (const s of ['CN', 'US']) st.boxes[s] = box({ stickers: [1], seam: 0.35 });
      cam(c, [0, 0.4, -0.35], [0, 0.3, -2.4], 50);
    } else if (k === 15) { st.boxes.US = box({ locks: ones(5), chains: 1, stickers: ones(14), seam: 1, burst: 0.9 }); cam(c, [US[0], 0.17, -1.86], [US[0], 0.28, 0.5], 70); }
    else if (k === 16) { giantsOn({ eyes: u, look: [1.6, 0.6, -2.5] }); st.giants.CN.show = 0; cam(c, [1.0, 0.75, -1.4], [3.4, 3.3, 0.2], 54); }
    else if (k === 24) { giantsOn(); st.giants.CN.show = 0; st.giants.US.fist = [0.0, 1.6, 3.0]; Object.assign(st.dispenser, { flowCN: 1 }); cam(c, [-1.6, 2.4, 8.2], [1.6, 1.9, 1.6], 50); }
    else if (k === 25) { st.boxes.US = box({ lid: 1, seam: 0, locks: [-1, -1, -1, -1, -1], chains: 1 }); cam(c, [0.15, 0.75, -0.95], [US[0], 0.2, US[2]], 42); }
    else if (k === 27) { st.boxes.US = box({ lid: 1 - Math.min(1, u * 4), locks: [0, 1, 2, 3, 4].map((i) => Math.min(0, Math.max(-1, (u - 0.45) * 12 - i * 0.9) - 0.0)), chains: 1 - Math.min(1, Math.max(0, (u - 0.2) * 5)), stickers: [Math.max(0, Math.min(1, (u - 0.85) * 8))] }); cam(c, [0.25, 0.42, -1.2], [US[0], 0.15, US[2]], 42); }
    else if (k === 26) { st.boxes.US = box({ locks: ones(5), chains: u, stickers: ones(8), seam: 0.8 }); cam(c, [0.1, 0.62, -0.85], [US[0] - 0.1, 0.12, US[2]], 46); }
    else if (k === 23) { giantsOn({ look: [0, 1.5, 2] }); st.giants.US.show = 0; cam(c, [-1.2, 3.2, 3.4], [-3.6, 3.6, 0.4], 40); }
    else if (k === 17) { giantsOn({ tangled: 1, fist: [-0.3, 2.3, 1.6], look: [-0.3, 2.0, 1.6] }); st.giants.US.show = 0; cam(c, [1.2, 2.0, 5.6], [-1.6, 2.6, 0.8], 50); }
    else if (k === 18) { giantsOn({ lean: 1, look: [US[0], 0.2, US[2]] }); st.giants.CN.show = 0; cam(c, [-1.8, 1.7, 4.6], [2.6, 2.4, 0.0], 50); }
    else if (k === 19) { st.ceiling = 0; st.board.show = 0; giantsOn(); cam(c, [0, 4.5, 12.6], [0, 5.6, -4.0], 46); }
    else if (k === 20) { giantsOn(); st.giants.CN.show = 0; st.giants.US.fist = [0.3, 1.6, 3.5]; cam(c, [-2.6, 3.4, 6.2], [1.4, 1.6, 2.0], 50); }
    else if (k === 21) { giantsOn(); st.giants.US.show = 0; st.giants.CN.fist = [-0.3, 1.8, 3.2]; m1(c); }
    else if (k === 22) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 0.4, dent: 1 }); cam(c, [-1.0, 0.7, 1.75], [0.0, 0.02, 3.0], 40); }
    else if (k === 30) { st.board.busy = { row: 1, u: 0.32 + u * 0.68 }; cam(c, [0.2, 4.95, -2.55], [-0.62, 5.2, -4.9], 34); }
    else if (k === 31) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 1 }); cam(c, [-0.9, 1.15, 1.4], [1.25, 0.15, 3.25], 46); }
    else if (k === 32) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 0.4, dent: 1 }); cam(c, [0.15, 0.62, 1.95], [0.0, 0.0, 3.0], 42); }
    else if (k >= 33 && k <= 36) { st.tower.fall = [0, 0.3, 0.6, 1][k - 33]; cam(c, [-2.4, 2.4, -0.9], [1.3, 0.35, 2.9], 52); }
    else if (k === 37) { st.kiln = { show: 1, glow: 1, bricks: 1 }; cam(c, [-0.3, 0.8, 1.7], [-2.15, 0.35, 3.45], 46); }
    else if (k === 38) { st.lamp.on = 0.12 + u * 0.4; cam(c, [0.32, 2.25, 0.62], [0, 2.6, -0.1], 30); }
    else if (k === 39) { st.board.jam = { rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], k: 1 }; cam(c, [0.0, 4.9, -1.8], [-0.4, 5.15, -4.9], 40); }
    else if (k === 40) { st.alarm = { on: 1, angle: u * 6 + 2.2 }; st.lamp.flicker = 0.25; m1(c); }
    else if (k === 41) { st.alarm = { on: 1, angle: 1.25 + u * 6 }; cam(c, [0.6, 3.2, 0.9], [0, 5.55, -4.8], 48); }
    else m1(c);
    set.update(st, t);
    if (q.has('hide')) for (const nm of q.get('hide').split(',')) for (const g of Object.values(set._giants)) if (g[nm]) g[nm].visible = false;
    ck.update(k === 19 ? { show: 1, build: 1, grow: 1 + 2 * Math.min(1, u * 1.5) } : { show: 0 }, t, {});
    set.lampBulb(G.uLampPos.value);
    if (G.uLampDir) set.lampDir(G.uLampDir.value);
    // the film scales the lamp's light with on and flicker; the bench does the same
    G.uLampPow.value = POW * st.lamp.on * st.lamp.on * (1 - 0.85 * st.lamp.flicker);
    // the director drives the practical light from the beacon or the kiln; the bench previews it the same way
    const on = st.alarm.on;
    if (on > 0) { set.alarmPos(G.uP2Pos.value); G.uP2Col.value.setRGB(1.0, 0.12, 0.05).multiplyScalar(on * (0.55 + 0.45 * Math.abs(Math.cos(st.alarm.angle)))); G.uP2Range.value = 9; }
    else if (st.kiln.show > 0) { set.kilnMouth(G.uP2Pos.value); G.uP2Col.value.setRGB(1.0, 0.3, 0.08).multiplyScalar(0.8 * st.kiln.glow); G.uP2Range.value = 4; }
    else G.uP2Col.value.setRGB(0, 0, 0);
    return look;
  };
}
