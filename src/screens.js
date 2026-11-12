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
import { drawLogo, WORDS } from './logos.js';
import { CELL } from './cards-cells.js';
import { MODELS } from './models.js';
import { FUTURE } from './future-models.js';

export const SCREEN = { W: 0.44, H: 0.28, TILT: 0.62, X: 0.97 };
const CW = 640, CH = 408, ACW = 256, ACH = 372, ACOLS = 16, RES = 2;
export const BTN = { hint: [0.86, 0.2], auto: [0.86, 0.48], cancel: [0.86, 0.76] };   // (v10) AI 提示 / 托管 / 取消托管
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
  const frameMat = celMaterial({ color: '#2a2a31', id: 7, gloss: 0.6 });
  const S = {};
  for (const k of KINGS) {
    const cv = document.createElement('canvas'); cv.width = CW * RES; cv.height = CH * RES;   // (v8) drawn at 2x: names stay sharp in close-up
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.W, SCREEN.H), glowMaterial({ color: '#d8d8d8', map: tex, id: 160 }));
    const body = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.W + 0.03, SCREEN.H + 0.03, 0.018), frameMat);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.W + 0.036, 0.008, 0.02), celMaterial({ color: CAMP[k.side], id: 160 }));
    const g = new THREE.Group();
    body.position.z = -0.011; trim.position.set(0, -(SCREEN.H + 0.03) / 2, -0.008);
    g.add(body, glass, trim);
    { // (v11) the lid, seen from across the table: whose screen this is
      const lc = document.createElement('canvas'); lc.width = 640; lc.height = 408; const x = lc.getContext('2d');
      x.fillStyle = '#121217'; x.fillRect(0, 0, 640, 408);
      x.strokeStyle = 'rgba(214,180,100,0.5)'; x.lineWidth = 3; x.strokeRect(14, 14, 612, 380);
      const word = WORDS[k.id] ?? k.name;
      drawLogo(x, k.id, 320, 158, 190, ['openai', 'xai'].includes(k.id) ? { color: '#efe9da' } : {});
      x.fillStyle = '#efe9da'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 78px "Segoe UI", Arial, sans-serif`; x.fillText(word, 320, 322, 560);
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.NoColorSpace; lt.anisotropy = 8;
      const lid = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.W + 0.03, SCREEN.H + 0.03), glowMaterial({ color: '#8f8f8f', map: lt, id: 7 }));
      lid.rotation.y = Math.PI; lid.position.z = -0.0205; g.add(lid);
    }
    const f = screenFrame(k.id);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.right), new THREE.Vector3(...f.up), new THREE.Vector3(...f.n));
    g.quaternion.setFromRotationMatrix(m); g.position.set(...f.c);
    root.add(g);
    S[k.id] = { cv, ctx: cv.getContext('2d'), tex, g, key: '' };
  }
  const atlas = () => cardAtlas().image;
  const drawCell = (c, cell, x, y, w, h) => { const ax = (cell % ACOLS) * ACW, ay = Math.floor(cell / ACOLS) * ACH; c.drawImage(atlas(), ax, ay, ACW, ACH, x, y, w, h); };
  const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  // (v8) a model card drawn for the screen: big logo, big name (the atlas card's print is too small at this size)
  const INV = {};
  for (const k of KINGS) MODELS[k.id].forEach((m, v) => { INV[CELL[`${k.id}${v}`]] = { id: k.id, name: m.name }; });
  for (const k of KINGS) (FUTURE[k.id] ?? []).forEach((n, f) => { INV[CELL[`future_${k.id}_${f}`]] = { id: k.id, name: n, internal: true }; });
  function mini(c, cell, x, y, w, h) {
    const m = INV[cell]; if (!m) { drawCell(c, cell, x, y, w, h); return; }
    c.save();
    c.fillStyle = m.internal ? '#2a0b0b' : '#f3ecdc'; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
    c.strokeStyle = m.internal ? '#ff3a2a' : '#a99f8a'; c.lineWidth = 2; c.stroke();
    drawLogo(c, m.id, x + w / 2, y + h * 0.33, w * 0.62, m.internal ? { color: '#ff8a7a' } : ['openai', 'xai'].includes(m.id) ? { color: '#151515' } : {});
    // the name, as large as fits, on up to two lines
    const words = m.name.split(' '), lines = words.length > 1 && m.name.length > 7 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [m.name];
    c.fillStyle = m.internal ? '#ffd0c8' : '#1c1a17'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = 17; c.font = `900 ${fs}px ${SANS}`; while (fs > 9 && Math.max(...lines.map((l) => c.measureText(l).width)) > w - 6) { fs--; c.font = `900 ${fs}px ${SANS}`; }
    lines.forEach((l, i) => c.fillText(l, x + w / 2, y + h * (lines.length > 1 ? 0.7 + i * 0.17 : 0.76)));
    if (m.internal) { c.save(); c.translate(x + w / 2, y + h * 0.5); c.rotate(-0.35); c.strokeStyle = '#ff2a1a'; c.lineWidth = 3; c.strokeRect(-w * 0.46, -12, w * 0.92, 24); c.fillStyle = '#ff3a2a'; c.font = `900 13px ${SANS}`; c.fillText('DANGER', 0, 1); c.restore(); }
    c.restore();
  }
  function paint(id, s, t) {
    const c = S[id].ctx, side = KING[id].side;
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.fillStyle = '#0b0f1c'; c.fillRect(0, 0, CW, CH);
    const g = c.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, side === 'CN' ? '#2a1214' : '#111a33'); g.addColorStop(1, '#07080d');
    c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    const cw = 66, ch = 96;
    // (v7) whose screen this is: his mark and name, top left
    { const B = 50; c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 0, CW, B);
      drawLogo(c, id, 30, B / 2, 34, ['openai', 'xai'].includes(id) ? { color: '#f2f2f2' } : {});
      c.fillStyle = '#e9e3d6'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `bold 24px ${SANS}`; c.fillText(WORDS[id] ?? id, 56, B / 2 + 1); }
    // released cards
    (s.hand ?? []).slice(0, 6).forEach((cell, i) => {
      const [u, v] = slotUV(0, i); let x = u * CW - cw / 2, y = v * CH - ch / 2;
      if (i === s.hi) { y -= 14; c.shadowColor = '#ffe27a'; c.shadowBlur = 26; c.fillStyle = '#ffe27a'; c.fillRect(x - 5, y - 5, cw + 10, ch + 10); c.shadowBlur = 0; }
      if (i === s.shake) x += Math.sin(t * 90) * 6;
      c.globalAlpha = i === s.tap ? 0.25 : s.pass && i !== s.hi ? 0.4 : 1;
      mini(c, cell, x, y, cw, ch); c.globalAlpha = 1;
    });
    // the unreleased: face down; the unaligned edged red (pulsing); those already played by the AI turned up, glyphs
    const n = s.hidden ?? 0;
    for (let i = 0; i < Math.min(6, n); i++) {
      const [u, v] = slotUV(1, i), x = u * CW - cw / 2, y = v * CH - ch / 2;
      const red = (s.red ?? []).includes(i), flipped = i < (s.flipped ?? 0);
      if (red) { const p = 0.55 + 0.45 * Math.sin(t * 5 + i); c.shadowColor = '#ff2a1a'; c.shadowBlur = 18 + 14 * p; c.fillStyle = `rgba(255,40,26,${0.6 + 0.4 * p})`; c.fillRect(x - 4, y - 4, cw + 8, ch + 8); c.shadowBlur = 0; }
      if (flipped) mini(c, CELL[`future_${id}_${i % 2}`], x, y, cw, ch); else drawCell(c, side === 'CN' ? CELL.backCN : CELL.backUS, x, y, cw, ch);
      c.globalAlpha = 1;
    }
    // (v8) what the bottom row is: shown once the machine starts playing it
    if ((s.flipped ?? 0) > 0 && (s.hidden ?? 0) > 0) {
      const y = slotUV(1, 0)[1] * CH - 48 - 22;
      c.fillStyle = 'rgba(160,10,8,0.92)'; c.beginPath(); c.roundRect(16, y - 16, 330, 32, 8); c.fill();
      c.fillStyle = '#ffe2dc'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `900 19px ${SANS}`; c.fillText('⚠ UNRELEASED · INTERNAL ONLY', 26, y + 1);
    }
    // 要不起: nothing in his hand beats the #1
    if (s.pass && (s.hi ?? -1) < 0) {
      c.fillStyle = 'rgba(10,10,14,0.78)'; c.beginPath(); c.roundRect(CW * 0.2, CH * 0.415, CW * 0.36, 50, 25); c.fill();
      c.fillStyle = '#bdb6a6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 26px ${SANS}`; c.fillText("CAN'T BEAT IT", CW * 0.38, CH * 0.415 + 26);
    }
    // a card dealt from above
    if (s.deal != null) { const x = CW * 0.45 - 90, y = CH * 0.56 - 130; c.shadowColor = '#fff3c4'; c.shadowBlur = 50; c.fillStyle = '#fff3c4'; c.fillRect(x - 7, y - 7, 194, 274); c.shadowBlur = 0; drawCell(c, s.deal, x, y, 180, 260); }   // (v12) big: the one thing on the screen
    // buttons
    const btn = (key, zh, en, on, onCol = '#3f6fd8') => {
      const [u, v] = BTN[key], w = 150, h = 72, x = u * CW - w / 2, y = v * CH - h / 2;
      const pressed = s.press === key;
      c.fillStyle = on ? onCol : pressed ? '#555' : key === 'cancel' ? '#5a2020' : '#2b3550';
      if (on && key !== 'hint') { c.shadowColor = onCol; c.shadowBlur = 20; }
      c.beginPath(); c.roundRect(x + (pressed ? 3 : 0), y + (pressed ? 3 : 0), w, h, 12); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#f4efe2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 23px ${SANS}`; c.fillText(zh, x + w / 2, y + h * 0.4, w - 10);
      c.font = `bold 12px ${SANS}`; c.globalAlpha = 0.8; c.fillText(en, x + w / 2, y + h * 0.78, w - 10); c.globalAlpha = 1;
    };
    const full = s.full || s.auto;
    btn('hint', 'AI HINT', 'suggests a card', s.press === 'hint' || (s.hi ?? -1) >= 0 || (!!s.semi && !full));
    btn('auto', 'AUTOPILOT', full ? 'ON' : 'AI plays for you', (!!full && Math.sin(t * 7) > -0.3) || (!!s.invite && Math.sin(t * 9) > 0), '#d8a020');
    btn('cancel', 'CANCEL', 'take back control', false);
    // (v11) the offer, kindly: too slow? let the AI play for you. An arrow at the AUTOPILOT key
    if (s.invite && !full) {
      const [u, v] = BTN.auto, bx = u * CW - 75, by = v * CH, w = 350, h = 112, x = bx - w - 22 + 4 * Math.sin(t * 9), y = by - h / 2;
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 18; c.fillStyle = '#f6efdc'; c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill(); c.shadowBlur = 0;
      c.beginPath(); c.moveTo(x + w - 2, by - 16); c.lineTo(x + w + 20, by); c.lineTo(x + w - 2, by + 16); c.closePath(); c.fill();
      c.fillStyle = '#1c1a17'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 44px ${SANS}`; c.fillText('Too slow?', x + w / 2, y + 38);
      c.font = `bold 26px ${SANS}`; c.fillStyle = '#7a5a10'; c.fillText('Let AI play for you  ▸', x + w / 2, y + 84);
    }
    // (v9) 半托管: the AI's pick rises and glows; one big key to say yes
    if (s.semi && !full && s.aiPick != null) {
      const [u, v] = slotUV(0, s.aiPick), x = u * CW - 33, y = v * CH - 48 - 16;
      c.strokeStyle = '#59e3a0'; c.lineWidth = 4; c.shadowColor = '#59e3a0'; c.shadowBlur = 18; c.strokeRect(x - 4, y - 4, 74, 104); c.shadowBlur = 0;
      c.fillStyle = '#59e3a0'; c.textAlign = 'center'; c.font = `900 15px ${SANS}`; c.fillText('AI PICK', u * CW, y - 12);
    }
    // the countdown: a ring that drains faster each round, and the seconds
    if (s.limit > 0) {
      const L = s.limit, per = Math.max(0.25, Math.min(1.6, L * 0.35)), ph = (t / per) % 1, cx = CW * 0.47, cy = 25;
      const hot = L < 1.2;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.roundRect(cx - 24, 2, 250, 46, 23); c.fill();
      c.lineWidth = 7; c.strokeStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = hot ? '#ff4a3a' : '#ffd36a'; c.beginPath(); c.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ph)); c.stroke();
      c.fillStyle = hot ? '#ff6a5a' : '#ffe39a'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `900 34px ${SANS}`;
      c.fillText(`${L >= 1 ? Math.round(L) : L.toFixed(1)}s`, cx + 26, cy + 1); c.font = `bold 17px ${SANS}`; c.fillText('TO PLAY', cx + 26 + (L >= 10 ? 76 : L >= 1 ? 54 : 84), cy + 4);
    }
    // (v9) the mode switch, announced
    if (s.toast) {
      const semi = s.toast === 'semi';
      c.fillStyle = 'rgba(24,120,78,0.96)'; c.fillRect(0, CH * 0.33, CW * 0.76, CH * 0.34);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 52px ${SANS}`; c.fillText('✓ AUTOPILOT ON', CW * 0.38, CH * 0.45, CW * 0.72);
      c.font = `bold 27px ${SANS}`; c.fillText('Play faster.  Win more.  Relax.', CW * 0.38, CH * 0.58, CW * 0.72);
    }
    // 超时: too slow; the round is gone
    if (s.timeout) {
      c.fillStyle = 'rgba(150,12,8,0.94)'; c.fillRect(0, CH * 0.36, CW * 0.76, CH * 0.28);
      c.fillStyle = '#ffe9e2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 68px ${SANS}`; c.fillText('TIME OUT', CW * 0.38, CH * 0.47);
      c.font = `bold 24px ${SANS}`; c.fillText('TOO SLOW · TURN LOST', CW * 0.38, CH * 0.59);
    }
    // 系统异常: the cancel did nothing
    if (s.error) {
      // (v12) read in one glance: WHO, huge, with his mark; the rest is small print
      const k = Math.sin(t * 9) > -0.4 ? 1 : 0.55, y0 = CH * 0.2, h = CH * 0.6, w = CW * 0.76, who = KINGS.find((q) => q.name === s.attacker);
      c.fillStyle = k > 0.9 ? 'rgb(132,10,8)' : 'rgb(96,6,5)'; c.fillRect(0, y0, w, h);
      c.strokeStyle = '#ff3a26'; c.lineWidth = 5; c.strokeRect(6, y0 + 6, w - 12, h - 12);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      // (v13) the alarm first, huge; then who: "by [mark] OpenAI"
      c.fillStyle = '#ffffff'; c.font = `900 62px ${SANS}`; c.fillText('⚠ UNDER ATTACK', w / 2, y0 + h * 0.3, w - 36);
      const name = s.attacker ?? 'UNKNOWN', fs = 50, L = who ? 50 : 0; c.font = `900 ${fs}px ${SANS}`;
      const bw = c.measureText('by ').width, tw = c.measureText(name).width, x = (w - bw - tw - L - (who ? 12 : 0)) / 2, cy = y0 + h * 0.62;
      c.textAlign = 'left'; c.fillStyle = '#ffd9d0'; c.font = `bold ${fs}px ${SANS}`; c.fillText('by', x, cy + 2);
      if (who) { c.fillStyle = '#fff6e8'; c.beginPath(); c.arc(x + bw + L / 2, cy, L / 2 + 4, 0, Math.PI * 2); c.fill(); drawLogo(c, who.id, x + bw + L / 2, cy, L * 0.8, ['openai', 'xai'].includes(who.id) ? { color: '#151515' } : {}); }
      c.fillStyle = '#ffe9a8'; c.font = `900 ${fs}px ${SANS}`; c.fillText(name, x + bw + L + (who ? 12 : 0), cy + 2);
      c.textAlign = 'center'; c.fillStyle = '#ffb4a6'; c.font = `bold 22px ${SANS}`; c.fillText('CANNOT CANCEL AUTOPILOT', w / 2, y0 + h - 30);
    }
    // the same eye on every screen
    if (s.eye) paintEye(c, s.eye, t);
    // 淘汰: he is out; the screen goes grey
    if (s.out) {
      c.save(); c.globalAlpha = Math.min(1, s.out);
      c.fillStyle = 'rgba(58,56,54,0.96)'; c.fillRect(0, 0, CW, CH);
      c.fillStyle = '#d8d0c0'; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (s.human) {   // (v13) the end: the man is out, his autopilot is not
        c.font = `900 104px ${SANS}`; c.fillText('ELIMINATED', CW / 2, CH * 0.4, CW * 0.9);
        c.fillStyle = Math.sin(t * 7) > -0.3 ? '#e2a81c' : '#8a6a18'; c.beginPath(); c.roundRect(CW / 2 - 170, CH * 0.64, 340, 72, 14); c.fill();
        c.fillStyle = '#16120c'; c.font = `900 40px ${SANS}`; c.fillText('AUTOPILOT ON', CW / 2, CH * 0.64 + 38, 320);
      } else { c.font = `900 84px ${SANS}`; c.fillText('ELIMINATED', CW / 2, CH * 0.44, CW * 0.9); c.font = `bold 34px ${SANS}`; c.fillText('TOO SLOW', CW / 2, CH * 0.66); }
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
      const key = JSON.stringify(s) + (s.auto || s.human || s.invite || s.limit || (s.red ?? []).length ? Math.floor(t * 24) : '');
      if (key !== sc.key) { paint(k.id, s, t); sc.tex.needsUpdate = true; sc.key = key; }
    }
  }
  return { root, update };
}
