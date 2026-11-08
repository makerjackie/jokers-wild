// JOKERS WILD v3 reel — the court cards the kings are pressed into (6-02, 6-03): each king rendered once at load in
// the pose he is pressed flat in (looking up in shock), frontal and flat-lit, printed (posterised, inked) and laid out
// as a double-headed court card in his atlas cell (CELL.court_<id>), with K, his logo and his name.
import * as THREE from 'three';
import { G } from './glsl.js';
import { KINGS, KING, CAMP } from './layout.js';
import { CELL } from './cards-cells.js';
import { atlasPaint } from './cards.js';
import { drawLogo, BRAND, WORDS } from './logos.js';

function printify(img, W, H) {
  const d = img.data, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const bg = d[i * 4 + 3] > 128;                         // the cel pass writes alpha 0 on drawn pixels; the clear is opaque
    let r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    if (bg) { r = 0.937; g = 0.902; b = 0.824; }
    else {
      r = Math.pow(r, 1 / 2.2) * 1.12; g = Math.pow(g, 1 / 2.2) * 1.12; b = Math.pow(b, 1 / 2.2) * 1.12;
      const l = 0.3 * r + 0.55 * g + 0.15 * b;
      r = l + (r - l) * 1.6; g = l + (g - l) * 1.6; b = l + (b - l) * 1.6;
      r = Math.round(r * 6) / 6; g = Math.round(g * 6) / 6; b = Math.round(b * 6) / 6;
    }
    d[i * 4] = Math.max(0, Math.min(255, r * 255)); d[i * 4 + 1] = Math.max(0, Math.min(255, g * 255)); d[i * 4 + 2] = Math.max(0, Math.min(255, b * 255)); d[i * 4 + 3] = 255;
    L[i] = 0.3 * r + 0.55 * g + 0.15 * b;
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = L[i + 1] - L[i - 1] + 0.5 * (L[i - W + 1] - L[i - W - 1] + L[i + W + 1] - L[i + W - 1]);
    const gy = L[i + W] - L[i - W] + 0.5 * (L[i + W - 1] - L[i - W - 1] + L[i + W + 1] - L[i - W + 1]);
    const e = Math.hypot(gx, gy);
    if (e > 0.22) { const k = Math.min(1, (e - 0.22) * 3); for (let c = 0; c < 3; c++) d[i * 4 + c] *= 1 - 0.85 * k; }
  }
}
// lay a portrait out as a double-headed court card in a cell (cw x ch)
function paintCourt(c, x0, y0, cw, ch, id, portrait) {
  const camp = CAMP[KING[id].side];
  c.save(); c.translate(x0, y0);
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, cw, ch);
  const m = 15;
  for (const flip of [false, true]) {
    c.save();
    if (flip) { c.translate(cw, ch); c.rotate(Math.PI); }
    c.beginPath(); c.moveTo(m, m); c.lineTo(cw - m, m); c.lineTo(cw - m, ch * 0.47); c.lineTo(m, ch * 0.53); c.closePath(); c.clip();
    if (portrait) c.drawImage(portrait, m, m, cw - 2 * m, ch * 0.53 - m);
    c.restore();
  }
  c.strokeStyle = '#16110c'; c.lineWidth = 2; c.beginPath(); c.moveTo(m, ch * 0.53); c.lineTo(cw - m, ch * 0.47); c.stroke();
  c.strokeStyle = camp; c.lineWidth = 6; c.strokeRect(8, 8, cw - 16, ch - 16);
  c.strokeStyle = '#16110c'; c.lineWidth = 1.4; c.strokeRect(m, m, cw - 2 * m, ch - 2 * m);
  for (const flip of [false, true]) {
    c.save(); if (flip) { c.translate(cw, ch); c.rotate(Math.PI); }
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(239,230,210,0.88)'; c.fillRect(17, 17, 32, 66);
    c.fillStyle = '#16110c'; c.font = 'bold 30px Georgia, serif'; c.fillText('K', 33, 48);
    drawLogo(c, id, 33, 67, 20);
    // the name on a band beside the index
    c.fillStyle = 'rgba(239,230,210,0.92)'; c.fillRect(cw - 112, 17, 95, 20);
    c.fillStyle = '#16110c'; c.font = 'bold 14px Georgia, serif'; c.fillText(WORDS[id] ?? KING[id].name, cw - 64, 32);
    c.restore();
  }
  c.restore();
  void BRAND;
}
// render every king in his pressed pose; poseAt(id) -> { st: the director's st.kings at that moment, t }
export function paintPortraits({ engine, scene, kings, hide = [], poseAt }) {
  const r = engine?.renderer; if (!r || !kings.cardFrame) return;
  const W = 300, H = 240;
  const rt = new THREE.WebGLRenderTarget(W, H, { count: 2, samples: 0, type: THREE.UnsignedByteType });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 12);
  const save = { pos: G.uLampPos.value.clone(), dir: G.uLampDir.value.clone(), pow: G.uLampPow.value, cone: G.uLampCone.value, sh: G.uShadowOn.value, p2: G.uP2Col.value.clone(), p3: G.uP3Col.value.clone() };
  const hidden = [];
  for (const o of hide) if (o?.visible) { o.visible = false; hidden.push(o); }
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  for (const k of KINGS) {
    const { st, t } = poseAt(k.id);
    kings.update(st, t);
    for (const kk of KINGS) kings.kings[kk.id].seat.visible = kk.id === k.id;
    // the head and shoulders, square on, from the king's front
    kings.cardFrame(k.id, M); M.decompose(P, Q, S);
    const [cw] = kings.cardSize(k.id);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(Q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
    const head = kings.headWorld ? kings.headWorld(k.id, new THREE.Vector3()) : P.clone();
    const c = head.clone().addScaledVector(up, -0.02);
    cam.position.copy(c).addScaledVector(fwd, 4); cam.up.copy(up); cam.lookAt(c);
    const hw = cw * 0.25, hh = hw * H / W;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    G.uLampPos.value.copy(c).addScaledVector(fwd, 2.2).addScaledVector(up, 1.3);
    G.uLampDir.value.copy(c).sub(G.uLampPos.value).normalize();
    G.uLampPow.value = 2.4; G.uLampCone.value = Math.cos(1.25); G.uShadowOn.value = 0; G.uP2Col.value.setRGB(0, 0, 0); G.uP3Col.value.setRGB(0, 0, 0);
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam);
    const buf = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d'), img = c2.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    printify(img, W, H);
    c2.putImageData(img, 0, 0);
    atlasPaint(CELL[`court_${k.id}`], (ctx, x, y, w, h) => paintCourt(ctx, x, y, w, h, k.id, cv));
  }
  for (const kk of KINGS) kings.kings[kk.id].seat.visible = true;
  for (const o of hidden) o.visible = true;
  G.uLampPos.value.copy(save.pos); G.uLampDir.value.copy(save.dir); G.uLampPow.value = save.pow; G.uLampCone.value = save.cone; G.uShadowOn.value = save.sh; G.uP2Col.value.copy(save.p2); G.uP3Col.value.copy(save.p3);
  r.setRenderTarget(null); r.setClearColor(prevClear, prevAlpha); rt.dispose();
}
