// The film: builds the world (set, props, kings, cards, fx), runs the director, applies its state.
import * as THREE from 'three';
import { G } from './glsl.js';
import { makeSet, LAMP_PIVOT } from './set.js';
import { makeProps } from './props.js';
import { makeKings } from './kings.js';
import { makeCards } from './cards.js';
import { makeFx } from './fx.js';
import { makeCardKing } from './cardking.js';
import { makeKingCards } from './kingcards.js';
import { flatTime } from './dir/s10.js';
import { KINGS } from './layout.js';
import { direct } from './director.js';
import { shotAt } from './shots.js';
import { smooth } from './util.js';

const LAMP_POW = G.uLampPow.value;
const _pivot = new THREE.Vector3();

const _hf = new THREE.Matrix4(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
export function makeFilm({ scene, overlay, camera, engine }) {
  // the 9-10 eye close-up: the camera sits right in front of one eye of a king, wherever his head is this frame
  // ---- the court cards' portraits: each king rendered once at load, in the pose he is pressed flat in (10-04 ..),
  // frontal, flat-lit, then printed (posterised, inked) onto his double-headed card
  function printify(img, W, H) {
    const d = img.data, L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const bg = d[i * 4 + 3] > 128;                         // the cel pass writes alpha 0 on drawn pixels; the clear is opaque
      let r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
      if (bg) { r = 0.937; g = 0.902; b = 0.824; }
      else {
        r = Math.pow(r, 1 / 2.2) * 1.1; g = Math.pow(g, 1 / 2.2) * 1.1; b = Math.pow(b, 1 / 2.2) * 1.1;
        const l = 0.3 * r + 0.55 * g + 0.15 * b;
        r = l + (r - l) * 1.7; g = l + (g - l) * 1.7; b = l + (b - l) * 1.7;           // court cards are bold
        r = Math.round(r * 5) / 5; g = Math.round(g * 5) / 5; b = Math.round(b * 5) / 5;
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
  function paintPortraits() {
    const r = engine?.renderer; if (!r || !kings.cardFrame) return;
    const W = 384, H = 300;
    const rt = new THREE.WebGLRenderTarget(W, H, { count: 2, samples: 0, type: THREE.UnsignedByteType });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 12);
    const save = { pos: G.uLampPos.value.clone(), dir: G.uLampDir.value.clone(), pow: G.uLampPow.value, cone: G.uLampCone.value, sh: G.uShadowOn.value, p2: G.uP2Col.value.clone() };
    const hidden = [];
    for (const o of [set.root, props.root, cards.root, fx.root, cardking.root, kingcards.root]) if (o?.visible) { o.visible = false; hidden.push(o); }
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    for (const k of KINGS) {
      const t = flatTime(k.id) - 0.12;
      const st = direct(t, world);
      kings.update(st.kings, t);
      for (const kk of KINGS) kings.kings[kk.id].seat.visible = kk.id === k.id;
      kings.cardFrame(k.id, M); M.decompose(P, Q, S);
      const [cw, ch] = kings.cardSize(k.id);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(Q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
      const c = P.clone().addScaledVector(up, ch * 0.2);
      cam.position.copy(c).addScaledVector(fwd, 4); cam.up.copy(up); cam.lookAt(c);
      const hw = cw * 0.52, hh = hw * H / W;
      cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      G.uLampPos.value.copy(c).addScaledVector(fwd, 2.2).addScaledVector(up, 1.3);
      G.uLampDir.value.copy(c).sub(G.uLampPos.value).normalize();
      G.uLampPow.value = 2.4; G.uLampCone.value = Math.cos(1.25); G.uShadowOn.value = 0; G.uP2Col.value.setRGB(0, 0, 0);
      r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam);
      const buf = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c2 = cv.getContext('2d'), img = c2.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      printify(img, W, H);
      c2.putImageData(img, 0, 0);
      kingcards.setPortrait(k.id, cv); (world.portraits ??= {})[k.id] = cv;
      { let n = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] < 128) n++; (world.portraitPx ??= {})[k.id] = n; }
    }
    for (const kk of KINGS) kings.kings[kk.id].seat.visible = true;
    for (const o of hidden) o.visible = true;
    G.uLampPos.value.copy(save.pos); G.uLampDir.value.copy(save.dir); G.uLampPow.value = save.pow; G.uLampCone.value = save.cone; G.uShadowOn.value = save.sh; G.uP2Col.value.copy(save.p2);
    r.setRenderTarget(null); r.setClearColor(prevClear, prevAlpha); rt.dispose();
  }
  function placeOnEye(cam, a) {
    if (kings.eyeFrame) kings.eyeFrame(a.id, a.side ?? 'R', _hf);
    else if (kings.headFrame) { kings.headFrame(a.id, _hf); _hf.multiply(new THREE.Matrix4().makeTranslation((a.side === 'L' ? 1 : -1) * 0.04, 0.02, 0.11)); }
    else return;
    _e.setFromMatrixPosition(_hf); _f.set(0, 0, 1).transformDirection(_hf); _u.set(0, 1, 0).transformDirection(_hf);
    cam.position.copy(_e).addScaledVector(_f, a.dist ?? 0.06);
    cam.up.copy(_u); cam.lookAt(_e); cam.fov = a.fov ?? 24; cam.updateProjectionMatrix();
  }
  const ctx = { scene, overlay, camera, engine };
  const set = makeSet(ctx); scene.add(set.root);
  const props = makeProps(ctx); scene.add(props.root);
  if (props.tableRoot && set.tableTop) { set.root.updateMatrixWorld(true); set.tableTop.attach(props.tableRoot); }   // things on the table follow its wobble
  const kings = makeKings(ctx); scene.add(kings.root);
  const cardking = makeCardKing(ctx, {}); scene.add(cardking.root); if (cardking.overlay) overlay.add(cardking.overlay);
  const cards = makeCards(ctx, { set, kings, props, cardking }); scene.add(cards.root);
  const kingcards = makeKingCards(ctx, { kings, cardking }); scene.add(kingcards.root);
  if (set.tableTop) set.tableTop.attach(cards.root);                      // landed cards rock with the table
  const fx = makeFx(ctx); scene.add(fx.root); overlay.add(fx.overlay);
  const world = { set, props, kings, cards, fx, camera, cardking, kingcards };
  // measured once at load (never from a previous frame): where Mistral's thrown-up hand lets go of his card
  if (props.euHand) {
    props.update({ eu: { show: 1, arm: 1, head: 0 } }, 0, { handFrame: () => new THREE.Matrix4(), mouthFrame: () => new THREE.Matrix4() });
    const m = new THREE.Matrix4(); props.euHand(m);
    world.euRelease = new THREE.Vector3().setFromMatrixPosition(m).toArray();
  }
  const api = {
    handFrame: (id, side) => (side === 'M' ? kings.mouthFrame(id) : kings.handFrame(id, side)), mouthFrame: (id) => kings.mouthFrame(id),
    ...(kings.bodyFrame ? { bodyFrame: (id, out) => kings.bodyFrame(id, out) } : {}),
    ...(kings.headFrame ? { headFrame: (id, out) => kings.headFrame(id, out) } : {}),
  };
  paintPortraits();
  // ---- inertialization: when a king's hand target or look target jumps (a new action starts), carry the old value
  // into the new motion and let the difference decay. Pure function of t: the director is re-run at the previous
  // sub-frames (within the shot) to find the jump. Fast but continuous motions (a whip) are left alone: only a step
  // much bigger than its neighbours counts as a jump.
  const ghost = { ...world, camera: new THREE.PerspectiveCamera() };
  const DT = 1 / 48, NS = 14;
  const REST = {}; for (const k of KINGS) REST[k.id] = { L: kings.restHand(k.id, 'L'), R: kings.restHand(k.id, 'R') };
  const keyOf = (s, id) => { const P = s.kings[id] ?? {}; return { L: P.armL?.target ?? REST[id].L, R: P.armR?.target ?? REST[id].R, look: P.look ?? null }; };
  const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
  function inertialize(t, st) {
    const t0 = shotAt(t).t0;
    const S = [{}];
    for (const k of KINGS) S[0][k.id] = keyOf(st, k.id);
    for (let i = 1; i <= NS + 1 && t - i * DT >= t0; i++) { const s = direct(t - i * DT, ghost); S[i] = {}; for (const k of KINGS) S[i][k.id] = keyOf(s, k.id); }
    for (const k of KINGS) for (const ch of ['L', 'R', 'look']) {
      const span = ch === 'look' ? 0.32 : 0.22, thr = ch === 'look' ? 0.25 : 0.07;
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i][k.id][ch], b = S[i + 1][k.id][ch]; if (!a || !b) break;
        const d = dist(a, b);
        const nb = Math.max(i > 0 ? dist(S[i - 1][k.id][ch], a) : 0, i + 2 < S.length ? dist(b, S[i + 2][k.id][ch]) : 0);
        if (d > thr && d > 4 * nb) {
          const wgt = 1 - smooth((i * DT) / span);
          const cur = S[0][k.id][ch];
          const v = [cur[0] + (b[0] - a[0]) * wgt, cur[1] + (b[1] - a[1]) * wgt, cur[2] + (b[2] - a[2]) * wgt];
          if (ch === 'look') st.kings[k.id].look = v;
          else st.kings[k.id]['arm' + ch] = { ...(st.kings[k.id]['arm' + ch] || {}), target: v };
          break;
        }
      }
    }
  }
  return {
    world,
    update(t, cam) {
      const st = direct(t, world);
      inertialize(t, st);
      set.update(st.set, t);
      set.lampBulb(G.uLampPos.value);
      // the lamp's axis tilts with its swing (the pool of light runs over the table and the kings)
      if (set.lampDir) set.lampDir(G.uLampDir.value);
      else G.uLampDir.value.copy(G.uLampPos.value).sub(_pivot.set(...LAMP_PIVOT)).normalize();
      G.uLampCone.value = Math.cos(((st.look.lampCone ?? 64) * Math.PI) / 180);
      // switched on (1-02), the filament's stutter, a director's dimmer
      G.uLampPow.value = LAMP_POW * (st.set.lamp?.on ?? 1) * (1 - 0.85 * (st.set.lamp?.flicker ?? 0)) * (st.look.lampPow ?? 1);
      // the practical light: whatever the director names (kiln, the jokers' gold), else the alarm beacon
      const al = st.set.alarm, p2 = st.look.p2;
      if (p2) {
        G.uP2Pos.value.set(...p2.pos); G.uP2Col.value.setRGB(...p2.col); G.uP2Range.value = p2.range ?? 6;
      } else if (al?.on > 0 && set.alarmPos) {
        set.alarmPos(G.uP2Pos.value);
        const sweep = Math.max(0, Math.cos(al.angle)) ** 2;
        G.uP2Col.value.setRGB(2.6, 0.16, 0.1).multiplyScalar(al.on * (0.3 + 1.6 * sweep));
        G.uP2Range.value = 9;
      } else G.uP2Col.value.setRGB(0, 0, 0);
      const p3 = st.look.p3;
      if (p3) { G.uP3Pos.value.set(...p3.pos); G.uP3Col.value.setRGB(...p3.col); G.uP3Range.value = p3.range ?? 3; } else G.uP3Col.value.setRGB(0, 0, 0);
      kings.update(st.kings, t);
      // a king pressed into his printed card is gone: the card has taken his place (the chair stays)
      for (const k of KINGS) { const q = kings.kings[k.id]?.squash; if (q) q.visible = !st.kings[k.id]?.gone; }
      if (st.camAttach?.kind === 'eye') placeOnEye(cam ?? camera, st.camAttach);
      props.update(st.props, t, api);
      cardking.update(st.cardking ?? { show: 0 }, t, api);
      cards.update(st.cards, t);
      kingcards.update(st.cards.kingCards ?? {}, t);
      fx.update(st.fx, t, world);
      return st;
    },
    drawTitles(c, W, H, st) {
      c.clearRect(0, 0, W, H);
      const tt = st.titles;
      if (!tt) return;
      c.save();
      c.globalAlpha = tt.alpha ?? 1;
      c.fillStyle = tt.color ?? '#efe6d2';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `${Math.round(H * 0.11)}px "Songti SC", "SimSun", "Noto Serif CJK SC", serif`;
      if (tt.zh) c.fillText(tt.zh, W / 2, H * (tt.y ?? 0.46));
      c.font = `${Math.round(H * 0.032)}px Georgia, "Times New Roman", serif`;
      if (tt.en) { c.letterSpacing = `${Math.round(H * 0.012)}px`; c.fillText(tt.en, W / 2, H * ((tt.y ?? 0.46) + 0.1)); }
      c.restore();
    },
  };
}
