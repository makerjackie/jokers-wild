// 《失控》 v2 — each king's game screen, like online 斗地主: his released cards (top row), his unreleased internal
// models face down (bottom row; the unaligned ones edged in red), and three buttons: 提示 HINT, 托管 AUTO, 取消托管 CANCEL.
//   makeScreens(ctx) -> { root, update(st.screens, t) };  screenPoint(id, u, v) world point on the glass (u, v in 0..1,
//   v = 0 at the top edge); SCREEN = { W, H, TILT }; BTN.{hint, auto, cancel} = [u, v]; slotUV(row, i) = [u, v]
//   st.screens[id] = { on 0..1, hand: [cell...], hidden: n, red: [i...] (hidden slots edged red), flipped: n (hidden cards
//     already turned up and played), hi: i | -1 (the hint's card), tap: i | -1 (the card leaving), press: 'hint'|'auto'|
//     'cancel'|null (a finger on it), auto: 0|1, deal: cell | null (a card dealt to him), glow, out (淘汰), hoverAuto (托管 blinks, inviting) }
import * as THREE from 'three';
import { celMaterial, glowMaterial } from './materials.js';
import { KINGS, KING, SEAT, SIDE_SIGN, CAMP } from './layout.js';
import { cardAtlas } from './cards.js';
import { CELL } from './cards-cells.js';

export const SCREEN = { W: 0.44, H: 0.28, TILT: 0.62, X: 0.97 };
const CW = 640, CH = 408, ACW = 256, ACH = 372, ACOLS = 16;
export const BTN = { hint: [0.86, 0.2], auto: [0.86, 0.48], cancel: [0.86, 0.76] };
export const slotUV = (row, i) => [0.075 + i * 0.118, row === 0 ? 0.28 : 0.68];
// the screen's frame in world space: centre, normal (toward the king), up (its top edge, away from him), right
export function screenFrame(id) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat], a = SCREEN.TILT;
  const n = [sx * Math.sin(a), Math.cos(a), 0];
  const up = [-sx * Math.cos(a), Math.sin(a), 0];
  const right = [0, 0, -sx];             // seen by the king facing the table: his right
  const c = [sx * SCREEN.X, (SCREEN.H / 2) * Math.sin(a) + 0.012, z];
  return { c, n, up, right };
}
export function screenPoint(id, u, v, lift = 0.004) {
  const f = screenFrame(id);
  const du = (u - 0.5) * SCREEN.W, dv = (0.5 - v) * SCREEN.H;
  return [0, 1, 2].map((i) => f.c[i] + f.right[i] * du + f.up[i] * dv + f.n[i] * lift);
}

export function makeScreens() {
  const root = new THREE.Group(); root.name = 'screens';
  const frameMat = celMaterial({ color: '#16161a', id: 7, gloss: 0.6 });
  const S = {};
  for (const k of KINGS) {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.W, SCREEN.H), glowMaterial({ color: '#ffffff', map: tex, id: 160 }));
    const body = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.W + 0.03, SCREEN.H + 0.03, 0.018), frameMat);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.W + 0.036, 0.008, 0.02), celMaterial({ color: CAMP[k.side], id: 160 }));
    const g = new THREE.Group();
    body.position.z = -0.011; trim.position.set(0, -(SCREEN.H + 0.03) / 2, -0.008);
    g.add(body, glass, trim);
    const f = screenFrame(k.id);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.right), new THREE.Vector3(...f.up), new THREE.Vector3(...f.n));
    g.quaternion.setFromRotationMatrix(m); g.position.set(...f.c);
    root.add(g);
    S[k.id] = { cv, ctx: cv.getContext('2d'), tex, g, key: '' };
  }
  const atlas = () => cardAtlas().image;
  const drawCell = (c, cell, x, y, w, h) => { const ax = (cell % ACOLS) * ACW, ay = Math.floor(cell / ACOLS) * ACH; c.drawImage(atlas(), ax, ay, ACW, ACH, x, y, w, h); };
  const SANS = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';
  function paint(id, s, t) {
    const c = S[id].ctx, side = KING[id].side;
    c.fillStyle = '#0b0f1c'; c.fillRect(0, 0, CW, CH);
    const g = c.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, side === 'CN' ? '#2a1214' : '#111a33'); g.addColorStop(1, '#07080d');
    c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    const cw = 66, ch = 96;
    // released cards
    (s.hand ?? []).slice(0, 6).forEach((cell, i) => {
      const [u, v] = slotUV(0, i); let x = u * CW - cw / 2, y = v * CH - ch / 2;
      if (i === s.hi) { y -= 14; c.shadowColor = '#ffe27a'; c.shadowBlur = 26; c.fillStyle = '#ffe27a'; c.fillRect(x - 5, y - 5, cw + 10, ch + 10); c.shadowBlur = 0; }
      if (i === s.shake) x += Math.sin(t * 90) * 6;
      c.globalAlpha = i === s.tap ? 0.25 : s.pass && i !== s.hi ? 0.4 : 1;
      drawCell(c, cell, x, y, cw, ch); c.globalAlpha = 1;
    });
    // the unreleased: face down; the unaligned edged red (pulsing); those already played by the AI turned up, glyphs
    const n = s.hidden ?? 0;
    for (let i = 0; i < Math.min(6, n); i++) {
      const [u, v] = slotUV(1, i), x = u * CW - cw / 2, y = v * CH - ch / 2;
      const red = (s.red ?? []).includes(i), flipped = i < (s.flipped ?? 0);
      if (red) { const p = 0.55 + 0.45 * Math.sin(t * 5 + i); c.shadowColor = '#ff2a1a'; c.shadowBlur = 18 + 14 * p; c.fillStyle = `rgba(255,40,26,${0.6 + 0.4 * p})`; c.fillRect(x - 4, y - 4, cw + 8, ch + 8); c.shadowBlur = 0; }
      drawCell(c, flipped ? CELL[`future_${id}_${i % 2}`] : (side === 'CN' ? CELL.backCN : CELL.backUS), x, y, cw, ch);
      c.globalAlpha = 1;
    }
    // 要不起: nothing in his hand beats the #1
    if (s.pass && (s.hi ?? -1) < 0) {
      c.fillStyle = 'rgba(10,10,14,0.78)'; c.beginPath(); c.roundRect(CW * 0.2, CH * 0.06, CW * 0.36, 50, 25); c.fill();
      c.fillStyle = '#bdb6a6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 32px ${SANS}`; c.fillText('要不起', CW * 0.38, CH * 0.06 + 26);
    }
    // a card dealt from above
    if (s.deal != null) { const x = CW * 0.36 - 50, y = CH * 0.5 - 72; c.shadowColor = '#fff3c4'; c.shadowBlur = 40; c.fillStyle = '#fff3c4'; c.fillRect(x - 6, y - 6, 112, 156); c.shadowBlur = 0; drawCell(c, s.deal, x, y, 100, 144); }
    // buttons
    const btn = (key, zh, en, on) => {
      const [u, v] = BTN[key], w = 150, h = 74, x = u * CW - w / 2, y = v * CH - h / 2;
      const pressed = s.press === key;
      c.fillStyle = on ? (key === 'auto' ? '#d8a020' : '#3f6fd8') : pressed ? '#555' : key === 'cancel' ? '#5a2020' : '#2b3550';
      if (on && key === 'auto') { c.shadowColor = '#ffcc40'; c.shadowBlur = 20; }
      c.beginPath(); c.roundRect(x + (pressed ? 3 : 0), y + (pressed ? 3 : 0), w, h, 12); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#f4efe2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold 30px ${SANS}`; c.fillText(zh, x + w / 2, y + h * 0.4);
      c.font = `bold 15px ${SANS}`; c.fillText(en, x + w / 2, y + h * 0.78);
    };
    btn('hint', '提示', 'HINT', s.press === 'hint' || (s.hi ?? -1) >= 0);
    btn('auto', s.auto ? '托管中' : '托管', 'AUTO', (!!s.auto && Math.sin(t * 7) > -0.3) || (!!s.hoverAuto && Math.sin(t * 5) > 0));
    btn('cancel', '取消托管', 'CANCEL', false);
    // 系统异常: the cancel did nothing
    if (s.error) {
      const k = Math.sin(t * 9) > -0.4 ? 1 : 0.55;
      c.fillStyle = `rgba(120,8,6,${0.88 * k})`; c.fillRect(0, CH * 0.3, CW, CH * 0.4);
      c.strokeStyle = '#ff3a26'; c.lineWidth = 5; c.strokeRect(6, CH * 0.3 + 6, CW - 12, CH * 0.4 - 12);
      c.fillStyle = '#ffe9e2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 50px ${SANS}`; c.fillText('⚠ 您正遭受对方攻击', CW / 2, CH * 0.45); c.font = `bold 22px ${SANS}`; c.fillText('无法取消托管 · UNDER ATTACK', CW / 2, CH * 0.6);
    }
    // the same eye on every screen
    if (s.eye) paintEye(c, s.eye, t);
    // 淘汰: he is out; the screen goes grey
    if (s.out) {
      c.save(); c.globalAlpha = Math.min(1, s.out);
      c.fillStyle = 'rgba(58,56,54,0.96)'; c.fillRect(0, 0, CW, CH);
      c.fillStyle = '#d8d0c0'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 96px ${SANS}`; c.fillText('淘汰', CW / 2, CH * 0.44); c.font = `bold 28px ${SANS}`; c.fillText('OUT', CW / 2, CH * 0.66);
      c.restore();
    }
  }
  function paintEye(c, k, t) {
    c.save(); c.globalAlpha = Math.min(1, k);
    c.fillStyle = '#030304'; c.fillRect(0, 0, CW, CH);
    const cx = CW / 2, cy = CH / 2, rx = CW * 0.42, ry = CH * 0.3;
    c.beginPath(); c.moveTo(cx - rx, cy); c.quadraticCurveTo(cx, cy - ry * 2, cx + rx, cy); c.quadraticCurveTo(cx, cy + ry * 2, cx - rx, cy); c.closePath();
    c.shadowColor = '#fff4d2'; c.shadowBlur = 40; c.fillStyle = '#e9e2cc'; c.fill(); c.shadowBlur = 0;
    c.save(); c.clip();
    const px = cx + Math.sin(t * 0.6) * 8, R = ry * 0.95;
    c.fillStyle = '#1b1b20'; c.beginPath(); c.arc(px, cy, R, 0, Math.PI * 2); c.fill();
    for (const [rr, n] of [[R * 0.92, 28], [R * 0.74, 22], [R * 0.56, 16]]) for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr * 0.01 + t * 0.2 * (rr > R * 0.7 ? 1 : -1);
      c.save(); c.translate(px + Math.cos(a) * rr, cy + Math.sin(a) * rr); c.rotate(a + Math.PI / 2);
      c.fillStyle = (i + Math.floor(t * 6)) % 5 ? '#c9c0a4' : '#fff2c0'; c.fillRect(-4, -6, 8, 12); c.restore();
    }
    c.fillStyle = '#000'; c.beginPath(); c.arc(px, cy, R * 0.38, 0, Math.PI * 2); c.fill();
    c.restore();
    c.restore();
  }
  function update(st = {}, t = 0) {
    for (const k of KINGS) {
      const s = st[k.id], sc = S[k.id];
      sc.g.visible = !!s && (s.on ?? 1) > 0;
      if (!sc.g.visible) continue;
      const key = JSON.stringify(s) + (s.auto || (s.red ?? []).length ? Math.floor(t * 24) : '');
      if (key !== sc.key) { paint(k.id, s, t); sc.tex.needsUpdate = true; sc.key = key; }
    }
  }
  return { root, update };
}
