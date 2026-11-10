// 《失控》 v8 — the AI 智力排行榜: a big lit screen high at the head of the table, where the split-flap board was.
// It answers one question at a glance: who is #1 right now, by how much, and how close everyone is.
//   makeLeaderboard(ctx) -> { root, update(st.lb, t) }
//   st.lb = { show, lit 0..1, date, rows: [{ who, model, score, y (row position, 0 = top, may be fractional),
//             out (淘汰), glitch 0..1 }], flash 0..1 (a new #1), red 0..1 (the machines' own cards) }
// score: the "intelligence score". 100 = the human line (dashed). Above it the bar goes logarithmic (100 .. 1e6).
import * as THREE from 'three';
import { celMaterial, glowMaterial } from './materials.js';
import { drawLogo } from './logos.js';
import { BOARD } from './layout.js';

const CW = 1600, CH = 844, ROWS = 10;
const SANS = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif';
const HEAD = 150, RH = (CH - HEAD - 24) / ROWS;
const BAR0 = 820, BAR1 = 1450;
// the bar: 0..100 fills 72 % of it; above the human line it runs on a log scale up to 1e6
export function barFrac(s) {
  if (!Number.isFinite(s)) return 1.25;
  if (s <= 100) return 0.72 * Math.max(0, s) / 100;
  return 0.72 + 0.28 * Math.min(1.3, Math.log10(s / 100) / 4);
}
export function scoreText(s) {
  if (!Number.isFinite(s)) return '∞';
  if (s >= 1e6) return `${(s / 1e6).toFixed(1)}M`;
  if (s >= 1000) return Math.round(s).toLocaleString('en-US');
  if (s >= 100) return String(Math.round(s));
  if (s >= 99) return s.toFixed(2);
  return s.toFixed(1);
}
const GLYPHS = 'ΞΨΩЖЯ∑∂≋⌬⍟⎔◬⟁⧖⨀';

export function makeLeaderboard() {
  const root = new THREE.Group(); root.name = 'leaderboard';
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  const W = BOARD.W, H = BOARD.H;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glowMaterial({ color: '#ffffff', map: tex, id: 161 }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, H + 0.14, 0.08), celMaterial({ color: '#141418', id: 161, gloss: 0.5 }));
  frame.position.z = -0.045;
  root.add(frame, glass);
  root.position.set(...BOARD.pos);
  const c = cv.getContext('2d');
  let key = '';

  function paint(s, t) {
    const red = s.red ?? 0;
    c.fillStyle = '#07080c'; c.fillRect(0, 0, CW, CH);
    const g = c.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, red > 0.5 ? '#2a0606' : '#0f1424'); g.addColorStop(1, '#05060a');
    c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    // header
    c.fillStyle = red > 0.5 ? '#ff5a4a' : '#f2e6c8'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `900 78px ${SANS}`; c.fillText('AI 智力排行榜', 40, 64);
    c.fillStyle = '#8f8a7e'; c.font = `bold 26px ${SANS}`; c.fillText('INTELLIGENCE LEADERBOARD', 44, 120);
    c.textAlign = 'right'; c.fillStyle = red > 0.5 ? '#ff7a6a' : '#ffd36a'; c.font = `900 84px ${SANS}`; c.fillText(s.date ?? '', CW - 40, 72);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(30, HEAD - 8, CW - 60, 3);
    // the human line
    const hx = BAR0 + (BAR1 - BAR0) * 0.72;
    c.save(); c.setLineDash([14, 12]); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(hx, HEAD + 4); c.lineTo(hx, CH - 14); c.stroke(); c.restore();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = `900 32px ${SANS}`; c.fillText('人类水平 100', hx, HEAD - 30);
    // rows, bottom first so a row moving up passes over the others
    // settled rows first, then the ones moving (they pass over the others on solid plates)
    const rows = [...(s.rows ?? [])].sort((a, b) => (Math.abs(a.y - Math.round(a.y)) > 0.01) - (Math.abs(b.y - Math.round(b.y)) > 0.01) || b.y - a.y);
    for (const r of rows) {
      if (r.y > ROWS - 0.05) continue;
      const y = HEAD + 8 + r.y * RH, mid = y + RH / 2, top = r.y < 0.5 && !r.out;
      c.save();
      if (r.out) c.globalAlpha = 0.45;
      // row plate
      c.fillStyle = top ? (s.flash ?? 0) > 0.3 ? '#7a5a12' : '#4a380e' : '#161a26';
      c.beginPath(); c.roundRect(24, y + 5, CW - 48, RH - 10, 14); c.fill();
      if (top) { c.strokeStyle = '#ffc440'; c.lineWidth = 4; c.stroke(); }
      // rank
      c.textAlign = 'center'; c.fillStyle = top ? '#ffd36a' : '#cfc8b8'; c.font = `900 ${top ? 50 : 40}px ${SANS}`;
      c.fillText(r.out ? '—' : `#${Math.round(r.rank)}`, 92, mid + 2);
      // logo + model name
      if (r.who === 'ibm') { c.fillStyle = '#9fb3d8'; c.font = `900 34px ${SANS}`; c.fillText('IBM', 205, mid + 2); }
      else drawLogo(c, r.who, 205, mid, 52, ['openai', 'xai'].includes(r.who) ? { color: '#f2f2f2' } : {});
      let name = r.model ?? '';
      if (r.glitch > 0) name = [...name].map((ch, i) => (Math.sin(i * 12.9 + Math.floor(t * 12) * 7.3) * 0.5 + 0.5 < r.glitch ? GLYPHS[(i * 7 + Math.floor(t * 9)) % GLYPHS.length] : ch)).join('');
      c.textAlign = 'left'; c.fillStyle = r.out ? '#8a8478' : '#f4efe2'; c.font = `bold ${name.length > 14 ? 34 : 40}px ${SANS}`;
      c.fillText(name, 262, mid + 2, BAR0 - 290);
      if (r.out) { c.fillStyle = '#d0c6b4'; c.font = `900 40px ${SANS}`; c.fillText('淘汰', BAR0 + 20, mid + 2); c.restore(); continue; }
      // bar + score
      const f = barFrac(r.score), bw = (BAR1 - BAR0) * Math.min(1.12, f), over = r.score > 100;
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(BAR0, mid - 13, BAR1 - BAR0, 26);
      const bg = c.createLinearGradient(BAR0, 0, BAR0 + bw, 0);
      bg.addColorStop(0, top ? '#c98a1c' : '#3f6fd8'); bg.addColorStop(1, over ? '#ff4a3a' : top ? '#ffd36a' : '#7fa6ff');
      c.fillStyle = bg; c.fillRect(BAR0, mid - 13, bw, 26);
      c.textAlign = 'right'; c.fillStyle = over ? '#ff8a7a' : top ? '#ffe39a' : '#e6e0d2'; c.font = `900 ${top ? 44 : 36}px ${SANS}`;
      c.fillText(scoreText(r.score), CW - 34, mid + 2);
      c.restore();
    }
    if ((s.lit ?? 1) < 1) { c.fillStyle = `rgba(0,0,0,${1 - (s.lit ?? 1)})`; c.fillRect(0, 0, CW, CH); }
  }
  function update(s, t = 0) {
    root.visible = !!s && (s.show ?? 1) > 0;
    if (!root.visible) return;
    const k = JSON.stringify(s) + ((s.red ?? 0) > 0 || (s.rows ?? []).some((r) => r.glitch > 0) ? Math.floor(t * 12) : '');
    if (k !== key) { paint(s, t); tex.needsUpdate = true; key = k; }
  }
  return { root, update };
}
