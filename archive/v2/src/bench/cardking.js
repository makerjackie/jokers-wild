// Bench for the card king v2: ?bench=cardking. The integer part of t picks a setup, the fraction animates it.
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
// Query: &grow=x overrides grow, &cam=x,y,z,lx,ly,lz,fov a camera, &ceil=0|1 forces the ceiling, &board=0 hides the board, &cj=1 uses the cards module's
//   jokers, &build=x, &ink=1, &beam= &mono= &smoke= &exposure=.
import * as THREE from 'three';
import { G } from '../glsl.js';
import { makeSet } from '../set.js';
import { makeCards, CARD } from '../cards.js';
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

export function setup({ scene, overlay, camera, engine }) {
  const q = new URLSearchParams(location.search);
  const set = makeSet({ scene, overlay, camera, engine }); scene.add(set.root);
  const cards = makeCards({ scene }, { set }); scene.add(cards.root);
  const king = makeCardKing({ scene, overlay, camera, engine }, { set, cards }); scene.add(king.root);
  window.__king = king; window.__makeCardKing = makeCardKing;
  // ---- stand-in jokers
  const jokers = {};
  for (const side of ['CN', 'US']) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD.W, CARD.H), celMaterial({
      color: '#ffffff', id: 30, gloss: 0.3, rim: 0, uniforms: { uTex: { value: jokerTexture(side) } },
      pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.8)); emis = col * 0.55;',
    }));
    m.matrixAutoUpdate = false; m.userData.noShadow = true; scene.add(m); jokers[side] = m;
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
  const cam = (c, pos, look, fov) => { c.position.set(...pos); c.up.set(0, 1, 0); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix(); };
  const place = (id) => { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.92, 0.003, SEAT.Z[k.seat] + 0.12]; };
  const PULL = { pos: [0, 4.5, 12.6], look: [0, 3.5, -4], fov: 40 };
  const ORDER = ['deepseek', 'openai', 'qwen', 'anthropic', 'kimi', 'google', 'glm', 'xai', 'doubao', 'meta'];
  return (t, c) => {
    const k = Math.floor(t + 1e-6), u = t - k;
    const st = { show: 1, build: 1, breathe: 1, look: [0, 1.4, 8], lean: 0, grow: 1 };
    let ceilOn = null, flyCard = null;
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
    } else { st.grow = 3; st.look = [0, 1, 4]; cam(c, [4.6, 1.2, 0.6], [0, 4.4, -3.8], 74); ceilOn = false; }
    if (q.has('grow')) st.grow = +q.get('grow');
    if (q.has('cam')) { const v = q.get('cam').split(',').map(Number); cam(c, v.slice(0, 3), v.slice(3, 6), v[6] ?? 40); }
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
      giants: { CN: { show: 1, rise: 1, eyes: 1 }, US: { show: 1, rise: 1, eyes: 1 } },
      boxes: { CN: { show: 1, lid: 1, locks: [1, 1, 1, 1, 1], chains: 1 }, US: { show: 1, lid: 1, locks: [1, 1, 1, 1, 1], chains: 1 } },
    }, t);
    set.lampBulb(G.uLampPos.value);
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
    const look = { style: 'noir', campTint: 0 };
    for (const key of ['beam', 'mono', 'smoke', 'exposure']) if (q.has(key)) look[key] = +q.get(key);
    for (const gi of giants) gi.visible = k !== 16;
    void KINGS; void mulberry32;
    return look;
  };
}
