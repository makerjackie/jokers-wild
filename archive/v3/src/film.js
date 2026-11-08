// The film: builds the world (set, props, kings, cards, fx), runs the director, applies its state.
import * as THREE from 'three';
import { G } from './glsl.js';
import { makeSet, LAMP_PIVOT } from './set.js';
import { makeProps } from './props.js';
import { makeKings } from './kings.js';
import { makeCards } from './cards.js';
import { makeFx } from './fx.js';
import { makeCardKing } from './cardking.js';
import { makePaper } from './paper.js';
import { makeFreeCards } from './freecards.js';
import { atlasPaint } from './cards.js';
import { CELL } from './cards-cells.js';
import { KINGS, SEAT } from './layout.js';
import { direct } from './director.js';
import { shotAt } from './shots.js';
import { smooth } from './util.js';
import { paintPortraits } from './portraits.js';
import { flatTime } from './dir/story.js';

const LAMP_POW = G.uLampPow.value;
const _pivot = new THREE.Vector3();

const _hf = new THREE.Matrix4(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
export function makeFilm({ scene, overlay, camera, engine }) {
  // the 9-10 eye close-up: the camera sits right in front of one eye of a king, wherever his head is this frame
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
  if (set.tableTop) set.tableTop.attach(cards.root);                      // landed cards rock with the table
  const fx = makeFx(ctx); scene.add(fx.root); overlay.add(fx.overlay);
  const paper = makePaper(ctx); scene.add(paper.root); if (paper.overlay) overlay.add(paper.overlay);
  const free = makeFreeCards(ctx); scene.add(free.root);
  const world = { set, props, kings, cards, fx, camera, cardking, paper, free };
  // the card with the two paper people holding hands (6-06): printed from the paper department's own drawing
  if (paper.pairPicture) atlasPaint(CELL.pair, (c, x, y, w, h) => { c.fillStyle = '#efe6d2'; c.fillRect(x, y, w, h); paper.pairPicture(c, x, y, w, h); });
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
    ...(kings.gripFrame ? { gripFrame: (id, side, out) => kings.gripFrame(id, side, out) } : {}),
  };
  // the court cards: each king printed in the pose he is pressed flat in
  try {
    paintPortraits({ engine, scene, kings, hide: [set.root, props.root, cards.root, fx.root, cardking.root, paper.root, free.root],
      poseAt: (id) => {
        // his last moment, but square to the card: head level, looking straight out, the awe-struck face kept
        const t = flatTime(id) - 0.15; const st = direct(t, { ...world, lite: true });
        const K = st.kings[id], k = KINGS.find((x) => x.id === id), sx = k.side === 'CN' ? -1 : 1;
        K.look = [sx * -0.2, 0.62, SEAT.Z[k.seat]]; K.rise = 0; K.lean = 0; K.armL = null; K.armR = null; K.hand = { L: 'rest', R: 'rest' }; K.flat = 0; K.gone = false;
        K.face = { eyes: 'wide', brows: 'raised', mouth: 'o' };
        return { st: st.kings, t };
      } });
  } catch (e) { console.warn('portraits failed', e); }
  // ---- inertialization: when a king's hand target or look target jumps (a new action starts), carry the old value
  // into the new motion and let the difference decay. Pure function of t: the director is re-run at the previous
  // sub-frames (within the shot) to find the jump. Fast but continuous motions (a whip) are left alone: only a step
  // much bigger than its neighbours counts as a jump.
  const ghost = { ...world, camera: new THREE.PerspectiveCamera(), lite: true };   // (only the kings matter here)
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
      paper.update(st.paper, t);
      free.update(st.free, t, st.freeLook);
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
      if (tt.credit) { c.globalAlpha = (tt.alpha ?? 1) * 0.7; c.font = `${Math.round(H * 0.022)}px Georgia, "Times New Roman", serif`; c.letterSpacing = `${Math.round(H * 0.004)}px`; c.fillText(tt.credit, W / 2, H * 0.86); }
      c.restore();
    },
  };
}
