// Bench for the card king: ?bench=cardking. The integer part of t picks a setup, the fraction animates it.
// v2 (the old film; stand-in giants and iron boxes):
//   0  M1, grow 1      1  M1, grow 1.4      2  M1, grow 2      3  M1, grow 2.8 (ceiling hidden)
//   4  pulled back ([0, 4.5, 12.6] -> [0, 3.5, -4], fov 40), grow 1.4     5  grow 2     6  grow 2.6     7  grow 3
//   8  the face close-up: the two full jokers side by side (bench stand-ins unless &cj=1: the cards module's jokers)
//   9  absorb: cards arrive in the chest at 9.0 and 9.6 (the fraction is the time), medium from the table
//  10  dealing toward OpenAI's place, M1 (k = the fraction; a stand-in card flies from armTip after the release)
//  11  dealing toward Doubao's place (the foot), camera along the table from the CN side
//  12  build = the fraction (M1): the face window lit before the jokers land
//  13  low angle from the table at grow 1.4 (10-02): it towers over the giants
//  14  the 11-08 move: grow 1.4 -> 3 over the fraction, absorbs firing faster and faster, the camera pulling back and up
//  15  ten deals down the table (fraction = the whole run), camera along the table from the US side
//  16  side view at grow 3 (depth: the wall behind, the head of the table in front)
//  17  the ten deals of 15 seen from M1
// v3 reel (no giants, no boxes; the ten kings at their seats; stand-in paper people and fan cards):
//  20  6-01 low behind DeepSeek looking up at it (grow 1.8)
//  21  6-02 both hands hovering over DeepSeek and OpenAI (grow 1.8); press R at .3, L at .65 (the kings go flat)
//  22  6-03 -> 6-04: deal.on 1 -> 0 while fan.on 0 -> 1 and n 2 -> 11 over the fraction, from mid-table
//  23  6-04 the fan close-up, n 11 (fraction: spread 0 -> 1 over the first half)
//  24  6-06 the same close-up, n 11 -> 12 over the fraction (the new card slides in)
//  25  6-05 the golden fingertip from the ant's view (camera 3 cm over the cloth, near 0.003); out .55 -> 1 over the fraction
//      (25: ant height ~0.45 m back, where the finger reads; 29: the brief's camera, 13 cm away, near 0.003)
//  26  6-05 the reach seen from the side      27  the whole: fan up, finger down, from mid-table
//  28  6-02 close on DeepSeek: the right hand over his head (from the sea, low)
// Query: &grow=x overrides grow, &cam=x,y,z,lx,ly,lz,fov a camera, &ceil=0|1 forces the ceiling, &board=0 hides the board, &cj=1 uses the cards module's
//   jokers, &build=x, &ink=1, &n= &spread= &open= (the fan), &finger= (0..1), &fsize= (arm.fingerSize), &tipl= (the tip light),
//   &beam= &mono= &smoke= &exposure=.
import * as THREE from 'three';
import { G } from '../glsl.js';
import { makeSet } from '../set.js';
import { makeCards, CARD, cardMaterial } from '../cards.js';
import { CELL } from '../cards-cells.js';
import { makeKings } from '../kings.js';
import { makePaper } from '../paper.js';
import { makeCardKing, DEAL_RELEASE } from '../cardking.js';
import { celMaterial, glowMaterial } from '../materials.js';
import { M1, GIANTS, BOARD, KINGS, KING, SIDE_SIGN, SEAT, seatPos } from '../layout.js';
import { smooth, clamp, mulberry32 } from '../util.js';

// a stand-in full joker: a grinning jester in the camp's colour (the cards module draws the real ones)
function jokerTexture(side) {
  const W = 360, H = 520, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const CAMP = side === 'CN' ? '#c4342c' : '#2f56b8', BLK = '#141010', CREAM = '#f1e8d4', GOLD = '#d4a542';
  c.fillStyle = CREAM; c.fillRect(0, 0, W, H);
  c.strokeStyle = CAMP; c.lineWidth = 10; c.strokeRect(16, 16, W - 32, H - 32);
  c.save(); if (side === 'US') { c.translate(W, 0); c.scale(-1, 1); }
  const cx = W / 2, cy = H * 0.52;
  // the cap: three horns with bells
  for (const [dx, col] of [[-1, CAMP], [0, BLK], [1, CAMP]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(cx - 80, cy - 70); c.quadraticCurveTo(cx + dx * 110, cy - 200, cx + dx * 140 + (dx === 0 ? 10 : 0), cy - 190 + (dx === 0 ? -20 : 0));
    c.quadraticCurveTo(cx + dx * 40, cy - 120, cx + 80, cy - 70); c.closePath(); c.fill();
    c.fillStyle = GOLD; c.beginPath(); c.arc(cx + dx * 140 + (dx === 0 ? 10 : 0), cy - 190 + (dx === 0 ? -20 : 0), 16, 0, Math.PI * 2); c.fill();
  }
  // the face
  c.fillStyle = '#f7efe0'; c.beginPath(); c.ellipse(cx, cy, 104, 120, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = BLK; c.lineWidth = 7; c.stroke();
  // laughing eyes (arcs), a diamond on one cheek
  c.lineWidth = 9; c.lineCap = 'round';
  for (const sg of [-1, 1]) { c.beginPath(); c.arc(cx + sg * 42, cy - 24, 22, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  c.fillStyle = CAMP; c.beginPath(); c.moveTo(cx - 62, cy + 6); c.lineTo(cx - 50, cy + 24); c.lineTo(cx - 62, cy + 42); c.lineTo(cx - 74, cy + 24); c.closePath(); c.fill();
  // the grin
  c.fillStyle = BLK; c.beginPath(); c.moveTo(cx - 78, cy + 30); c.quadraticCurveTo(cx, cy + 135, cx + 78, cy + 30); c.quadraticCurveTo(cx, cy + 70, cx - 78, cy + 30); c.fill();
  c.fillStyle = '#f7efe0'; for (let k = -4; k <= 4; k++) c.fillRect(cx + k * 15 - 5, cy + 50 + Math.abs(k) * -2, 10, 14);
  // the ruff
  for (let k = -5; k <= 5; k++) { c.fillStyle = k % 2 ? CAMP : BLK; c.beginPath(); c.moveTo(cx + k * 22 - 14, cy + 112); c.lineTo(cx + k * 22 + 14, cy + 112); c.lineTo(cx + k * 22, cy + 160); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = CAMP; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center';
  'JOKER'.split('').forEach((ch, k) => c.fillText(ch, side === 'CN' ? 44 : W - 44, 76 + k * 38));
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
}
// a stand-in paper person: a profile cut-out facing +x, the front arm reaching forward at hand height
function paperTexture(col) {
  const W = 128, H = 192, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.arc(56, 28, 17, 0, Math.PI * 2); c.fill();                 // head
  c.beginPath(); c.moveTo(44, 50); c.lineTo(70, 50); c.lineTo(74, 112); c.lineTo(40, 112); c.closePath(); c.fill();   // body
  c.lineWidth = 13;
  c.beginPath(); c.moveTo(48, 108); c.lineTo(40, 186); c.stroke();            // legs
  c.beginPath(); c.moveTo(66, 108); c.lineTo(76, 186); c.stroke();
  c.lineWidth = 10;
  c.beginPath(); c.moveTo(64, 60); c.lineTo(96, 86); c.lineTo(126, 92); c.stroke();   // the arm reaching to hold hands
  c.beginPath(); c.moveTo(48, 60); c.lineTo(34, 100); c.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
}

export function setup({ scene, overlay, camera, engine }) {
  const q = new URLSearchParams(location.search);
  const ctx = { scene, overlay, camera, engine };
  const set = makeSet(ctx); scene.add(set.root);
  const cards = makeCards({ scene }, { set }); scene.add(cards.root);
  // other departments' modules may be mid-edit: a module that throws at load is left out (stand-ins draw instead)
  const tryMake = (f, stub) => { try { return f(); } catch (e) { console.warn('cardking bench: ' + e.message); return stub; } };
  const kings = tryMake(() => makeKings(ctx), { root: new THREE.Group(), update() {}, headWorld: (id, o = new THREE.Vector3()) => o });
  scene.add(kings.root);
  const paper = tryMake(() => makePaper(ctx), { root: new THREE.Group(), update() {} });
  scene.add(paper.root);
  const king = makeCardKing(ctx, { set, cards }); scene.add(king.root);
  window.__king = king; window.__makeCardKing = makeCardKing; window.__kings = kings;
  // ---- stand-in jokers
  const jokers = {};
  for (const side of ['CN', 'US']) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD.W, CARD.H), celMaterial({
      color: '#ffffff', id: 30, gloss: 0.3, rim: 0, uniforms: { uTex: { value: jokerTexture(side) } },
      pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.8)); emis = col * 0.55;',
    }));
    m.matrixAutoUpdate = false; m.userData.noShadow = true; scene.add(m); jokers[side] = m;
  }
  // ---- stand-in fan cards (the director draws the kings' court cards there): the ten kings' model cards, then two more
  const FANC = [...KINGS.map((k) => CELL[`${k.id}0`]), CELL.makerFace, CELL.makerSelf];
  const fanGeo = new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T);
  const fanCell = new THREE.InstancedBufferAttribute(new Float32Array(12 * 4), 4);
  for (let i = 0; i < 12; i++) fanCell.setXYZW(i, FANC[i], CELL.backBlack, 0, CELL.glyph0);
  fanGeo.setAttribute('aCell', fanCell);
  const fanMesh = new THREE.InstancedMesh(fanGeo, cardMaterial({ glow: { value: 0.35 } }), 12);
  fanMesh.frustumCulled = false; fanMesh.count = 0; scene.add(fanMesh);
  // ---- stand-in paper people holding hands at the meeting point (until the paper department lands)
  const pp = [];
  for (const [col, sx] of [['#c4342c', -1], ['#3454a0', 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.051), celMaterial({
      color: '#ffffff', id: 40, gloss: 0.1, uniforms: { uTex: { value: paperTexture(col) } }, side: THREE.DoubleSide,
      pattern: 'vec4 tx = texture(uTex, vUv); if(tx.a < 0.5) discard; col = pow(tx.rgb, vec3(2.2));',
    }));
    m.position.set(sx * 0.017, 0.0255, -2.02); if (sx > 0) m.scale.x = -1;
    m.userData.noShadow = false; scene.add(m); pp.push(m);
  }
  // ---- stand-in giants (until the set builds them): 5.4 m dark figures with glowing eyes behind each row
  const giants = [];
  if (!set.giantEyes) {
    const body = celMaterial({ color: '#2a2622', id: 20, gloss: 0.1 });
    for (const side of ['CN', 'US']) {
      const p = GIANTS[side], sg = SIDE_SIGN[side], grp = new THREE.Group();
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.4, 16), body); legs.position.set(0, 1.2, 0);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 2.0, 16), body); torso.position.set(0, 3.3, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), body); head.position.set(0, GIANTS.H - 0.5, 0);
      grp.add(legs, torso, head);
      for (const e of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMaterial({ color: side === 'CN' ? '#ff3020' : '#3a70ff', id: 143 }));
        eye.position.set(-sg * 0.42, GIANTS.H - 0.55, e * 0.17); eye.userData.noShadow = true; grp.add(eye);
      }
      grp.position.set(p[0], p[1], p[2]); scene.add(grp); giants.push(grp);
    }
  }
  // ---- a stand-in dealt card (the cards module flies the real one from armTip)
  const dealt = new THREE.Mesh(new THREE.BoxGeometry(CARD.W, CARD.H, CARD.T), celMaterial({ color: '#16120c', id: 30, gloss: 0.6, emissive: '#3a2a10' }));
  dealt.matrixAutoUpdate = false; scene.add(dealt);
  // ---- the room's ceiling and the board, found once by their bounds (the bench hides them where the film would)
  scene.updateMatrixWorld(true);
  const ceil = [], board = [];
  const bb = new THREE.Box3();
  set.root.traverse((o) => {
    if (!o.isMesh) return;
    bb.setFromObject(o);
    if (bb.isEmpty()) return;
    if (bb.min.y > 6.2) ceil.push(o);
    else if (bb.min.z > BOARD.pos[2] - 0.6 && bb.max.z < BOARD.pos[2] + 0.6 && bb.min.y > BOARD.pos[1] - BOARD.H * 0.5 - 0.5) board.push(o);
  });
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), P = new THREE.Vector3(), P2 = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
  const cam = (c, pos, look, fov, near = 0.03) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(...look); c.fov = fov; c.near = near; c.updateProjectionMatrix(); };
  const place = (id) => { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.92, 0.003, SEAT.Z[k.seat] + 0.12]; };
  const PULL = { pos: [0, 4.5, 12.6], look: [0, 3.5, -4], fov: 40 };
  const ORDER = ['deepseek', 'openai', 'qwen', 'anthropic', 'kimi', 'google', 'glm', 'xai', 'doubao', 'meta'];
  // the reach of 6-05: from the right hand at the throne, round the head king, down onto the two paper people
  // (it arcs over and comes straight down: seen side-on from the ant's camera; the tip stops ~2 cm over their heads)
  const REACH = { target: [0, 0.075, -2.03], via: [[-0.7, 1.6, -2.75], [-0.08, 0.9, -2.1], [0, 0.42, -2.04]] };
  const ease = (u, a, b) => smooth(clamp((u - a) / (b - a), 0, 1));
  return (t, c) => {
    const k = Math.floor(t + 1e-6), u = t - k;
    const v3 = k >= 20;
    const st = { show: 1, build: 1, breathe: 1, look: [0, 1.4, 8], lean: 0, grow: 1 };
    const kst = {};
    for (const kk of KINGS) kst[kk.id] = { enter: v3 ? 1 : 0, look: [0, 0.2, -2.0] };
    let ceilOn = null, flyCard = null, fanView = null, ppOn = false, tipLight = false;
    if (k <= 3) { st.grow = [1, 1.4, 2, 2.8][k]; st.look = [...M1.pos]; cam(c, M1.pos, M1.look, M1.fov); }
    else if (k <= 7) { st.grow = [1.4, 2, 2.6, 3][k - 4]; st.look = [...PULL.pos]; cam(c, PULL.pos, PULL.look, PULL.fov); }
    else if (k === 8) { st.look = [0, 3.1, 1.5]; cam(c, [0.15, 3.05, -1.2], [0, 3.15, -3.45], 34); }
    else if (k === 9) {
      st.grow = 1.4; st.absorb = [9.0, 9.6]; st.look = [0, 1.0, 0];
      st.lean = 0.1; cam(c, [1.7, 1.3, 1.6], [0, 3.0, -3.8], 52);
    } else if (k === 10 || k === 11) {
      st.grow = 1.4;
      const id = k === 10 ? 'openai' : 'doubao';
      st.deal = { k: u, target: place(id) };
      const s = seatPos(id); st.look = [s[0] * 0.3, 1.6, s[2] + 3];
      flyCard = { id, k: u };
      if (k === 10) cam(c, M1.pos, M1.look, M1.fov);
      else cam(c, [-2.9, 1.9, 3.6], [0.2, 2.2, -2.6], 50);
    } else if (k === 12) { st.build = u; cam(c, M1.pos, M1.look, M1.fov); }
    else if (k === 13) { st.grow = 1.4; st.look = [0.2, 0.6, 1.5]; st.lean = 0.25; cam(c, [0.42, 0.3, 2.4], [0, 3.6, -4.1], 58); }
    else if (k === 14) {
      st.grow = 1.4 + 1.6 * smooth(u);
      st.absorb = []; let ta = 14.0, gap = 0.3; while (ta < 15) { st.absorb.push(ta); ta += gap; gap = Math.max(0.05, gap * 0.82); }
      st.look = [0, 1.0, 6];
      const e = smooth(u);
      cam(c, [0, 2.4 + (6.0 - 2.4) * e, 10.5 + (12.8 - 10.5) * e], [0, 1.15 + (4.6 - 1.15) * e, -3.2 - 0.8 * e], 40 + 6 * e);
    } else if (k === 15 || k === 17) {
      st.grow = 1.4;
      const f = u * 10, i = Math.min(9, Math.floor(f)), id = ORDER[i];
      st.deal = { k: f - i, target: place(id) };
      const s = seatPos(id); st.look = [s[0] * 0.3, 1.6, s[2] + 3];
      flyCard = { id, k: f - i };
      if (k === 15) cam(c, [3.0, 2.0, 3.4], [-0.3, 2.0, -2.4], 52); else cam(c, M1.pos, M1.look, M1.fov);
    } else if (k === 16) { st.grow = 3; st.look = [0, 1, 4]; cam(c, [4.6, 1.2, 0.6], [0, 4.4, -3.8], 74); ceilOn = false; }
    // ---------------------------------------------------------------- v3
    else if (k === 20) {
      st.grow = 1.8; st.look = [-0.8, 0.6, -2.3]; st.lean = 0.12;
      king.pose(st, t); king.faceFrame(M); P.setFromMatrixPosition(M);
      cam(c, [-1.9, 0.5, -0.8], [P.x * 0.7, P.y - 0.6, P.z], 60);
    } else if (k === 21 || k === 28) {
      st.grow = 1.8; st.look = [0, 0.6, -2.0];
      const pR = Math.sin(Math.PI * clamp((u - 0.22) / 0.2, 0, 1)), pL = Math.sin(Math.PI * clamp((u - 0.57) / 0.2, 0, 1));
      st.deal = { on: ease(u, 0, 0.15), k: 0, press: { R: pR, L: pL } };
      kst.deepseek.flat = clamp((u - 0.3) / 0.08, 0, 1); kst.openai.flat = clamp((u - 0.65) / 0.08, 0, 1);
      kst.deepseek.look = [-1.4, 2.5, -2.6]; kst.openai.look = [1.4, 2.5, -2.6];
      if (k === 21) cam(c, [0, 1.55, -0.35], [0, 0.95, -2.55], 58);
      else cam(c, [-0.55, 0.62, -1.55], [-1.7, 1.05, -2.55], 58);
    } else if (k === 22) {
      st.grow = 1.8; st.look = [0, 1.2, 1.0];
      st.deal = { on: 1 - ease(u, 0.15, 0.6), k: 0 };
      st.fan = { on: ease(u, 0.3, 0.75), n: 2 + 9 * smooth(u), spread: 1, face: [0, 2.6, 4.2] };
      for (const id of ORDER) kst[id].flat = 1;
      cam(c, [0, 2.6, 4.2], [0, 2.9, -3.0], 52);
      ppOn = true;
    } else if (k === 23 || k === 24) {
      st.grow = 1.8; st.look = [0.3, 1.8, 1.0];
      const n = k === 23 ? 11 : 11 + clamp(u * 1.25, 0, 1);
      st.fan = { on: 1, n, spread: k === 23 ? ease(u, 0, 0.5) : 1, face: [0.8, 2.6, 0.6] };
      for (const id of ORDER) kst[id].flat = 1;
      fanView = true;
    } else if (k === 25 || k === 26 || k === 27 || k === 29) {
      st.grow = 1.6; st.look = [0, 0, -2.0]; st.lean = 0.2;
      const out = k === 25 || k === 29 ? 0.55 + 0.45 * smooth(u) : 1;
      st.arm = { out, target: REACH.target, via: REACH.via, carry: 0, finger: 1 };
      st.fan = { on: 1, n: 11, spread: 1, face: [0, 1.4, 1.5] };
      for (const id of ORDER) kst[id].flat = 1;
      ppOn = true; tipLight = true;
      if (k === 25) cam(c, [0.06, 0.03, -1.6], [-0.02, 0.24, -2.1], 62, 0.003);
      else if (k === 29) cam(c, [0.06, 0.03, -1.9], [-0.06, 0.2, -2.3], 72, 0.003);
      else if (k === 26) cam(c, [1.0, 0.42, -1.85], [-0.45, 0.85, -2.65], 62);
      else cam(c, [0.4, 2.2, 3.4], [-0.2, 2.0, -3.0], 58);
    } else { st.grow = 3; st.look = [0, 1, 4]; cam(c, [4.6, 1.2, 0.6], [0, 4.4, -3.8], 74); ceilOn = false; }
    if (q.has('grow')) st.grow = +q.get('grow');
    if (st.fan) {
      if (q.has('n')) st.fan.n = +q.get('n');
      if (q.has('spread')) st.fan.spread = +q.get('spread');
      if (q.has('open')) st.fan.open = +q.get('open');
    }
    if (st.arm && q.has('finger')) st.arm.finger = +q.get('finger');
    if (st.arm && q.has('fsize')) st.arm.fingerSize = +q.get('fsize');
    if (fanView) {
      // the close-up: in front of the fan, a little to its right and below; the fan faces the camera
      king.pose(st, t); king.fanFrame(5, M); P.setFromMatrixPosition(M);
      king.fanFrame(0, M2); P2.setFromMatrixPosition(M2);
      const g = st.grow;
      const cp = [P.x + 0.55 * g, P.y - 0.35 * g, P.z + 2.0 * g];
      st.fan.face = cp;
      king.pose(st, t); king.fanFrame(5, M); P.setFromMatrixPosition(M);
      cam(c, cp, [P.x, P.y + 0.12 * g, P.z], 40);
    }
    if (q.has('cam')) { const v = q.get('cam').split(',').map(Number); cam(c, v.slice(0, 3), v.slice(3, 6), v[6] ?? 40, v[7] ?? 0.03); }
    if (q.has('build')) st.build = +q.get('build');
    if (q.has('ink')) st.ink = +q.get('ink');
    if (ceilOn === null) ceilOn = st.grow < 1.8;
    if (q.has('ceil')) ceilOn = q.get('ceil') === '1';
    for (const o of ceil) o.visible = ceilOn;
    const boardOn = q.get('board') !== '0';
    for (const o of board) o.visible = boardOn;
    set.update({
      lamp: { swing: [0, 0], flicker: 0 }, wobble: 0,
      cases: { CN: { crack: 1, shatter: 1, light: 0 }, US: { crack: 1, shatter: 1, light: 0 } },
      board: { rows: [], lit: 1 }, alarm: { on: 0, angle: 0 }, dispenser: { show: false }, tower: { show: false },
      giants: v3 ? { CN: { show: 0 }, US: { show: 0 } } : { CN: { show: 1, rise: 1, eyes: 1 }, US: { show: 1, rise: 1, eyes: 1 } },
      boxes: v3 ? { CN: { show: 0 }, US: { show: 0 } } : { CN: { show: 1, lid: 1, locks: [1, 1, 1, 1, 1], chains: 1 }, US: { show: 1, lid: 1, locks: [1, 1, 1, 1, 1], chains: 1 } },
      cloth: v3 ? { cities: 1, gold: 1, flood: { c: [0, -2.02], r: 9, w: 0.3 } } : undefined,
    }, t);
    set.lampBulb(G.uLampPos.value);
    try { kings.update(kst, t); } catch (e) { void e; }
    // the dealt card: posed at the release, then thrown in an arc to the target
    dealt.visible = false;
    if (flyCard && flyCard.k > DEAL_RELEASE) {
      king.pose({ ...st, deal: { ...st.deal, k: DEAL_RELEASE } }, t);
      king.armTip(M); P.setFromMatrixPosition(M);
      const tg = place(flyCard.id), w = clamp((flyCard.k - DEAL_RELEASE) / 0.45, 0, 1), e = 1 - (1 - w) * (1 - w);
      P2.set(tg[0], tg[1] + CARD.T, tg[2]);
      const pos = P.clone().lerp(P2, e); pos.y += Math.sin(Math.PI * e) * 0.35;
      Q.setFromEuler(E.set(-Math.PI / 2 * e + (1 - e) * 0.3, e * 5.5 + (flyCard.id.length), 0, 'YXZ'));
      dealt.matrix.compose(pos, Q, S.setScalar(1 + 0.4 * (1 - e)));
      dealt.matrixWorldNeedsUpdate = true; dealt.visible = true;
    }
    king.update(st, t);
    // the fan's cards at fanFrame (the director's job in the film)
    fanMesh.count = 0;
    if (st.fan && (st.fan.on ?? 1) > 0.02) {
      const N = king.fanCount();
      for (let i = 0; i < N; i++) { king.fanFrame(i, M); fanMesh.setMatrixAt(i, M); }
      fanMesh.count = N; fanMesh.instanceMatrix.needsUpdate = true;
    }
    // the paper people (the module, else the stand-ins)
    try { paper.update(ppOn ? { people: {
      red: { show: 1, pos: [-0.017, -2.02], dir: [1, 0], look: [0, 1, -2.6], reach: [0, 0.026, -2.02], hold: 1, gold: 1 },
      blue: { show: 1, pos: [0.017, -2.02], dir: [-1, 0], look: [0, 1, -2.6], reach: [0, 0.026, -2.02], hold: 1, gold: 1 },
    }, crowd: { show: 0 } } : { people: { red: { show: 0 }, blue: { show: 0 } }, crowd: { show: 0 } }, t); } catch (e) { paper.broken = true; }
    const paperDraws = !paper.broken && paper.root.children.length > 0;
    for (const m of pp) m.visible = ppOn && !paperDraws;
    // the face: two full jokers side by side (stand-ins, or the cards module's with &cj=1)
    const cj = q.get('cj') === '1';
    const faceOn = st.build > 0.93;
    for (const side of ['CN', 'US']) {
      king.jokerFrame(side, jokers[side].matrix); jokers[side].matrixWorldNeedsUpdate = true;
      jokers[side].visible = faceOn && !cj;
    }
    const jk = (side) => { king.jokerFrame(side, M2); M2.decompose(P, Q, S); E.setFromQuaternion(Q, 'YXZ'); return { pos: [P.x, P.y, P.z], rot: [E.x, E.y, E.z], scale: S.x }; };
    cards.update({ jokers: cj && faceOn ? { CN: jk('CN'), US: jk('US') } : { CN: { show: false }, US: { show: false } }, jokerGlow: 0.3 }, t);
    // the face's own light: the practical light in front of the face, warm gold, its reach grown with the king
    king.faceFrame(M);
    P.set(0, -0.1, 0.25).applyMatrix4(M);
    G.uP2Pos.value.copy(P);
    G.uP2Col.value.setRGB(1.0, 0.64, 0.3).multiplyScalar(faceOn ? 1.4 : 0.8);
    G.uP2Range.value = 5.5 * (st.grow ?? 1);
    // 6-05: the fingertip's gold light on the paper people (a suggestion for the director: p3 at armTip)
    if (tipLight) { king.armTip(M); G.uP3Pos.value.setFromMatrixPosition(M); G.uP3Col.value.setRGB(0.5, 0.33, 0.14).multiplyScalar(+(q.get('tipl') ?? 1)); G.uP3Range.value = 0.35; }
    else G.uP3Col.value.setRGB(0, 0, 0);
    const look = { style: 'noir', campTint: 0 };
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    for (const gi of giants) gi.visible = !v3 && k !== 16;
    void mulberry32;
    return look;
  };
}
