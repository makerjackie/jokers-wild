// Bench for the set module (?bench=set). Each integer bench time is one setup; the fraction animates it.
//   0  the motif wide M1 (layout.js), lamp on
//   1  the throne and both glass cases from the head of the table
//   2  close-up of the CN glass case: crack 0.6 (rising), the joker anchor with a placeholder card
//   3  scoreboard close-up: rows mid-flip, the SERVER BUSY plate swinging under row 1, the tall bottom row
//   4  the lamp at the end of a big swing (side view): the hard pool edge tilts across the throne
//   5  low angle at the foot: the legs, the short leg's gap above the floor
//   6  the alarm on, the cases shattering
//   7  dispenser: chips pouring down both chutes
//   8  dispenser: the bridge crushed by the US seal, the 禁运 EMBARGO mark left on it
//   9  dispenser: the toll gate down across the bridge with its 25% plate, a loaded cart waiting at it
//  10  dispenser: the gate raised, the cart crossing; the NVIDIA eye half closed
//  11..14  the chip tower: fall 0, 0.3, 0.6, 1 (the avalanche)
//  15  the CN brick kiln lit, red clay chips stacked like bricks
//  16  M1 after 3-12: the avalanche settled, the kiln lit (symmetric again)
//  17  the lamp switching on (on 0.12): the filament glowing through the bulb
//  18  the board jammed: flaps stuck half-way and chattering after a fast run of entries
//  19  M1 at the end: the board's last line "人类：要不起 HUMANS: PASS" in the tall bottom row
//  20  M1 with the alarm turning, the lamp stuttering, both cases cracked
//  21  the red beacon turning over the board, from the table
//  22  the kiln's mouth: the fire, the red light on the floor, the bricks stacking (0.6 .. 1)
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeSet } from '../set.js';
import { M1 } from '../layout.js';

// a placeholder joker card (bench only; the cards module draws the real one at jokerAnchor)
function placeholderCard(side) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 520;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 360, 520);
  g.strokeStyle = '#b3262a'; g.lineWidth = 10; g.strokeRect(14, 14, 332, 492);
  g.fillStyle = '#b3262a'; g.font = '900 54px Arial'; g.textAlign = 'center'; g.fillText('J', 46, 76);
  g.save(); g.beginPath(); if (side === 'CN') g.rect(0, 0, 180, 520); else g.rect(180, 0, 180, 520); g.clip();
  g.fillStyle = '#1a1414'; g.beginPath(); g.arc(180, 270, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#efe6d2'; g.beginPath(); g.ellipse(side === 'CN' ? 132 : 228, 240, 22, 30, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#efe6d2'; g.lineWidth = 14; g.beginPath(); g.arc(180, 270, 80, 0.2, Math.PI - 0.2); g.stroke();
  g.fillStyle = '#b3262a'; g.beginPath(); g.moveTo(80, 170); g.lineTo(180, 60); g.lineTo(280, 170); g.closePath(); g.fill();
  g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.26), celMaterial({ color: '#ffffff', id: 30, gloss: 0.3, uniforms: { uTex: { value: tex } }, pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.22));', side: THREE.DoubleSide }));
}

// row histories: settled texts, a flip around t = 2.9 (bench 3), a fast run then a jam around t = 18 (bench 18),
// and the end of the film from t = 18.9 (bench 19..21)
const NAMES = [['{openai}', 'OpenAI'], ['{deepseek}', 'DeepSeek'], ['{google}', 'Gemini'], ['{qwen}', 'Qwen'], ['{anthropic}', 'Claude'], ['{kimi}', 'Kimi'], ['{xai}', 'Grok'], ['{glm}', 'GLM'], ['{meta}', 'Llama'], ['{doubao}', 'Doubao']];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
function rows() {
  const out = [];
  out.push([{ t: -1, text: '2022·11' }, { t: 2.9, text: '2026·11' }, { t: 18.45, text: '{g3}{g7}{g1}{g12}·{g5}{g9}' }]);
  NAMES.forEach(([logo, name], i) => {
    const r = [{ t: -1, text: `${logo} ${pad(name, 9)} ${(94.6 - i * 0.4).toFixed(1)}` }];
    if (i < 4) r.push({ t: 2.78 + i * 0.05, text: `${NAMES[(i + 1) % 10][0]} ${pad(NAMES[(i + 1) % 10][1], 9)} #${i + 1}` });
    // the "everyone is #1" run: several texts a second, then the jam
    for (let k = 0; k < 8; k++) r.push({ t: 16.9 + k * 0.16 + i * 0.013, text: `${NAMES[(i + k) % 10][0]} ${pad(NAMES[(i + k) % 10][1], 9)} #1` });
    r.push({ t: 18.45 + i * 0.02, text: i === 0 ? '{joker}{joker}' : '' });
    out.push(r);
  });
  out.push([{ t: -1, text: '×1024' }, { t: 18.45, text: '人类：要不起 HUMANS: PASS' }]);
  return out;
}
const BOARD_ROWS = rows();

export function setup({ scene, overlay, camera, engine }) {
  const set = makeSet({ scene, overlay, camera, engine });
  scene.add(set.root);
  const cards = { CN: placeholderCard('CN'), US: placeholderCard('US') };
  set.jokerAnchor.CN.add(cards.CN); set.jokerAnchor.US.add(cards.US);
  const V = new THREE.Vector3();
  window.__set = set;      // bench only: lets tools poke the API
  const POW = G.uLampPow.value;
  const cam = (c, pos, look, fov) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(V.set(...look)); c.fov = fov; };
  const m1 = (c) => cam(c, M1.pos, M1.look, M1.fov);
  return (t, c) => {
    const k = Math.min(22, Math.max(0, Math.floor(t + 1e-6))), u = t - k;
    const st = {
      lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0,
      cases: { CN: { crack: 0, shatter: 0, light: 1 }, US: { crack: 0, shatter: 0, light: 1 } },
      board: { rows: BOARD_ROWS, lit: 1 }, alarm: { on: 0, angle: 0 },
      dispenser: { show: true, flowUS: 0, flowCN: 0, dent: 0, toll: 0, cart: { show: false }, blink: 0 },
      tower: { fall: 0 }, kiln: { show: 0, glow: 0, bricks: 0 },
    };
    const look = { style: 'noir' };
    const q = new URLSearchParams(location.search);
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    if (k === 0) m1(c);
    else if (k === 1) cam(c, [0, 1.12, 0.5], [0, 1.12, -4.3], 42);
    else if (k === 2) { st.cases.CN.crack = Math.min(1, 0.6 + u * 0.4); cam(c, [-1.16, 0.6, -2.82], [-1.55, 0.5, -3.95], 34); }
    else if (k === 3) { st.board.busy = { row: 1, u: 0.32 + u * 0.68 }; cam(c, [0.2, 4.95, -2.55], [-0.62, 5.2, -4.9], 34); }
    else if (k === 4) { const ph = u / 3.3 * Math.PI * 2; st.lamp.swing = [0.03 * Math.sin(ph), 0.13 * Math.cos(ph)]; cam(c, [-3.1, 1.35, 2.3], [0.45, 1.05, -0.9], 52); }
    else if (k === 5) cam(c, [-0.28, -0.6, 4.02], [-1.0, -0.715, 2.95], 38);
    else if (k === 6) {
      st.alarm = { on: 1, angle: u * 6 + 0.7 };
      st.cases.CN = { crack: 1, shatter: Math.min(1, 0.35 + u), light: 1 };
      st.cases.US = { crack: 1, shatter: Math.min(1, 0.2 + u), light: 1 };
      st.lamp.flicker = 0.3;
      cam(c, [0, 1.05, 0.3], [0, 1.3, -4.3], 44);
    } else if (k === 7) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 1 }); cam(c, [-0.9, 1.15, 1.4], [1.25, 0.15, 3.25], 46); }
    else if (k === 8) { Object.assign(st.dispenser, { flowUS: 1, flowCN: 0.4, dent: 1 }); cam(c, [0.15, 0.62, 1.95], [0.0, 0.0, 3.0], 42); }
    else if (k === 9) { Object.assign(st.dispenser, { toll: 1, cart: { show: true, u: 0.12, load: 1 } }); cam(c, [1.75, 0.34, 3.32], [0.35, 0.03, 2.98], 38); }
    else if (k === 10) { Object.assign(st.dispenser, { toll: 0.45, cart: { show: true, u: 0.45 + u * 0.3, load: 1 }, blink: 0.6 }); cam(c, [0.6, 0.55, 1.6], [0.9, 0.35, 3.3], 48); }
    else if (k >= 11 && k <= 14) { st.tower.fall = [0, 0.3, 0.6, 1][k - 11]; cam(c, [-2.4, 2.4, -0.9], [1.3, 0.35, 2.9], 52); }
    else if (k === 15) { st.kiln = { show: 1, glow: 1, bricks: 1 }; cam(c, [-0.3, 0.8, 1.7], [-2.15, 0.35, 3.45], 46); }
    else if (k === 16) { st.kiln = { show: 1, glow: 1, bricks: 1 }; st.tower.fall = 1; Object.assign(st.dispenser, { toll: 1 }); m1(c); }
    else if (k === 17) { st.lamp.on = 0.12 + u * 0.4; cam(c, [0.32, 2.25, 0.62], [0, 2.6, -0.1], 30); }
    else if (k === 18) { st.board.jam = { rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], k: 1 }; cam(c, [0.0, 4.9, -1.8], [-0.4, 5.15, -4.9], 40); }
    else if (k === 19) { st.tower.fall = 1; st.dispenser.show = false; m1(c); }
    else if (k === 20) {
      st.alarm = { on: 1, angle: u * 6 + 2.2 };
      st.lamp.flicker = 0.25; st.cases.CN.crack = 1; st.cases.US.crack = 1;
      m1(c);
    } else if (k === 21) { st.alarm = { on: 1, angle: 1.25 + u * 6 }; cam(c, [0.6, 3.2, 0.9], [0, 5.55, -4.8], 48); }
    else { st.kiln = { show: 1, glow: 1, bricks: 0.6 + u * 0.4 }; cam(c, [-0.55, 0.35, 5.6], [-1.75, -0.35, 4.05], 44); }
    set.update(st, t);
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
