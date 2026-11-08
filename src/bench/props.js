// Bench for the props module (?bench=props). Each integer bench time is one setup; the fraction animates it.
// v3 test reel (st.props = { stamps, ink, plates, presses } only; everything else draws nothing):
//   0  MACRO 2-04: DeepSeek's stamp coming down on his proposal card, camera 3 cm above the cloth, a 5 cm red stand-in:
//      .0 high, .25 just above, .5 the hit (press 1, wet), .75 lifted, the wet mark on the card, .9 lifted high
//   1  MACRO from beside the card, looking up at the lifted stamp's face (mirrored 批准, wet) over the fresh mark
//   2  DeepSeek holding stamps, medium from the sea: .0 right fist up, .5 both fists (the frenzy), .75 hit on the card
//   3  INK close (macro, 3 cm above the cloth): marks pressing in (k .05), wet (k .15), dry (k 1); a card painted with
//      paintStampMark; .5 the same from 10 cm above; .75 the paintStampMark card from above
//   4  INK from 1 m: a field of marks on the CN coast (3-06), every k and seed
//   5  NAMEPLATES in the M1 wide (all kings, presses, plates)        6  M1 pushed in to the head kings
//   7  NAMEPLATES medium: DeepSeek from across the sea (~2.4 m)      8  the same for OpenAI
//   9  PRESS macro 2-01: DeepSeek's press from 3 cm above the cloth, a card sliding out (slide = u), the stand-in
//  10  PRESS from the king's shoulder (2-02): the card on its spot, the stamp hanging over it
//  11  FRENZY at ant height (3-06): stamps coming down on both coasts, marks everywhere
//  12  the stamp alone standing on the cloth, product shot; .5 from below the face; .75 the rubber's edge at press 0, .9 press 1
//  13  EMPTY STATE: st.props = {} in M1 (nothing of props may show)    14  the same, close at DeepSeek's place
//  16  every nameplate in turn (KINGS order, one per tenth of the fraction), from across the sea, 1.6 m, fov 30
//  15  the palm-down fist on the knob with api.handFrame only (face = palm - STAMP.GRIP): .0 medium, .5 macro hit
// v2 regression views live at 50 + their old number (50 console ... 67 the console from across).
// URL: &dof=1 macro depth of field; &bp=<x,y,z>&bl=<x,y,z>&bf=<fov> camera override; &nokings=1; &standin=1 (no set)
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial, glowMaterial } from '../materials.js';
import { makeProps, keyRest, KEY_TIP, cityGrab, FEED, STAMP, PRESS, paintStampMark, platePos } from '../props.js';
import { makeKings } from '../kings.js';
import { makeSet } from '../set.js';
import { TABLE, FLOOR_Y, SEA_HALF, KINGS, KING, CITY, M1, SEAT, SIDE_SIGN, pressPos, seatPos } from '../layout.js';
import { smooth, clamp, Rng } from '../util.js';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const vec = (s) => (s ? s.split(',').map(Number) : null);
const CARD = { W: 0.18, H: 0.26, T: 0.0035 };

// a plain war-room tabletop: dark wood with a parchment chart cloth, a stone floor (fallback when the set is off)
function tabletop(scene) {
  const g = new THREE.Group();
  const cloth = celMaterial({
    color: '#b59c74', id: 1, gloss: 0.15,
    pattern: /* glsl */ `
      float mpp = length(fwidth(vWorld));
      vec2 p = vWorld.xz;
      float sea = 1.0 - smoothstep(${SEA_HALF.toFixed(3)} - 0.01, ${SEA_HALF.toFixed(3)} + 0.01, abs(p.x));
      col = mix(col, col * vec3(0.86, 0.9, 0.92), sea);
      float waves = step(0.82, fract(p.y * 18.0 + sin(p.x * 30.0) * 0.4)) * sea * (1.0 - smoothstep(0.001, 0.004, mpp));
      col *= 1.0 - 0.18 * waves;
      float coast = 1.0 - smoothstep(0.0, 0.004 + mpp, abs(abs(p.x) - ${SEA_HALF.toFixed(3)} - 0.01 * sin(p.y * 7.0)));
      col *= 1.0 - 0.5 * coast;
      col *= 0.88 + 0.2 * fbm2(p * 3.0);
      if(vLocalN.y < 0.5) col = vec3(0.09, 0.06, 0.04);
    `,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.HALF_W * 2, TABLE.THICK, TABLE.HALF_L * 2).translate(0, -TABLE.THICK / 2, 0), cloth);
  g.add(top);
  const legM = celMaterial({ color: '#2a1d14', id: 2, gloss: 0.4 });
  TABLE.LEGS.forEach(([x, z]) => { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, -FLOOR_Y - TABLE.THICK, 0.14).translate(x, (FLOOR_Y - TABLE.THICK) / 2, z), legM)); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, 0), celMaterial({ color: '#2b2622', id: 3, gloss: 0.1, pattern: 'col *= 0.8 + 0.3 * fbm2(vWorld.xz * 1.5); float j = step(0.97, fract(vWorld.x * 1.6)) + step(0.97, fract(vWorld.z * 1.6)); col *= 1.0 - 0.3 * min(j, 1.0);' }));
  g.add(floor);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27).rotateX(-Math.PI / 2), celMaterial({ color: '#120c08', id: 1, gloss: 0 }));
  hole.position.set(CITY[0], 0.0003, CITY[2]); hole.visible = false; g.add(hole);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.06).translate(0, 0.015, 3.0), celMaterial({ color: '#3a3936', id: 1, gloss: 0.5 }));
  g.add(bridge);
  scene.add(g);
  return { g, hole, bridge };
}
// a king's sleeve and mitten, only for scale
function forearm(scene, from, to) {
  const g = new THREE.Group();
  const robe = celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 });
  const skin = celMaterial({ color: '#b8a48e', id: 21, gloss: 0.3 });
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a), L = d.length();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, L, 18).translate(0, L / 2, 0), robe);
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); sleeve.position.copy(a); g.add(sleeve);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 12).scale(1.0, 0.62, 1.25), skin);
  hand.position.copy(b).addScaledVector(d.normalize(), 0.03); hand.quaternion.copy(sleeve.quaternion); g.add(hand);
  scene.add(g);
  return g;
}
// test hand frames (origin palm centre, +y fingers, +z out of the palm, x = y cross z)
function handFrame(pos, fingers, palm) {
  const y = new THREE.Vector3(...fingers).normalize(), z = new THREE.Vector3(...palm);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...pos);
}
function standInFist(skin) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.04).translate(0, 0.0, -0.002), skin));
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.015, 10, 20, Math.PI * 1.25).rotateY(Math.PI / 2).rotateX(-Math.PI * 0.62).scale(2.6, 1, 1), skin);
  roll.position.set(0, 0.045, 0.04); g.add(roll);
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.05, 4, 10).rotateZ(-0.5).rotateX(0.7).translate(0.05, 0.025, 0.035), skin));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 16).translate(0, -0.16, -0.004), celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 })));
  return g;
}
function standInLock(scene, pos) {
  const g = new THREE.Group();
  const iron = celMaterial({ color: '#3a3733', id: 9, gloss: 0.7, rim: 1.2, pattern: 'specTh = 0.95; col *= 0.85 + 0.3 * vnoise(vLocal.xy * 90.0);' });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.07), iron));
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 10, 24, Math.PI).rotateY(Math.PI / 2).translate(0, 0.04, 0), iron); g.add(sh);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.03).rotateY(Math.PI / 2).translate(0.0155, -0.005, 0), celMaterial({ color: '#000000', id: 9, gloss: 0 }));
  g.add(hole);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.42).translate(-0.17, -0.1, 0), celMaterial({ color: '#2c2a28', id: 9, gloss: 0.5, rim: 1.0 })));
  g.position.set(...pos);
  scene.add(g);
  return g;
}
function chainPath(fist, ring, bow = 0.25, n = 12) {
  const A = new THREE.Vector3(...fist), B = new THREE.Vector3(...ring), d = B.clone().sub(A), side = new THREE.Vector3(d.z, 0, -d.x).normalize();
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push(A.clone().lerp(B, u).addScaledVector(side, Math.sin(Math.PI * u) * bow).add(new THREE.Vector3(0, -Math.sin(Math.PI * u) * 0.15, 0)).toArray()); }
  return pts;
}
// ---- v3 stand-ins (bench only: the cards and paper modules draw the real ones)
// a 5 cm paper person in profile (paper plane = local xy, facing +x)
function standInPerson(color) {
  const s = new THREE.Shape();
  const P = [[-0.004, 0], [-0.0015, 0.016], [-0.0035, 0.0], [-0.0075, 0.0], [-0.0045, 0.019], [-0.0055, 0.033], [-0.009, 0.026], [-0.0105, 0.027],
    [-0.0065, 0.0375], [-0.002, 0.0395], [-0.001, 0.0405], [0.0025, 0.0395], [0.006, 0.03], [0.0045, 0.029], [0.0035, 0.033], [0.0035, 0.019], [0.0065, 0.0]];
  s.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) s.lineTo(x, y); s.closePath();
  const grp = new THREE.Group();
  const mat = celMaterial({ color, id: 40, gloss: 0.1, side: THREE.DoubleSide, pattern: 'col *= 0.9 + 0.1 * vnoise(vLocal.xy * 900.0);' });
  grp.add(new THREE.Mesh(new THREE.ShapeGeometry(s, 4), mat), new THREE.Mesh(new THREE.CircleGeometry(0.0052, 20).translate(0.0004, 0.0448, 0), mat));
  return grp;
}
// a proposal card lying face up (the cards module prints the real one); stamped: paintStampMark on its face
function proposalCard(stamped) {
  const c = document.createElement('canvas'); c.width = 540; c.height = 780;
  const g = c.getContext('2d');
  g.fillStyle = '#efe7d6'; g.fillRect(0, 0, 540, 780);
  g.strokeStyle = '#2a2622'; g.lineWidth = 6; g.strokeRect(18, 18, 504, 744);
  g.fillStyle = '#2a2622'; g.textAlign = 'center'; g.font = '900 58px "Microsoft YaHei", sans-serif'; g.fillText('提 案', 270, 100);
  g.font = '700 30px Georgia, serif'; g.fillText('P R O P O S A L', 270, 145);
  const rng = new Rng(11);
  for (let i = 0; i < 9; i++) { g.fillRect(70, 200 + i * 42, rng.range(250, 400), 14); }
  g.fillStyle = '#c11a22'; g.fillRect(150, 620, 240, 92);
  g.fillStyle = '#f4ead8'; g.font = '900 62px "Microsoft YaHei", sans-serif'; g.fillText('批准？', 270, 688);
  if (stamped) paintStampMark(g, 60, 240, 420, 280, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  const geo = new THREE.BoxGeometry(CARD.W, CARD.T, CARD.H).translate(0, CARD.T / 2, 0);
  const m = new THREE.Mesh(geo, celMaterial({ color: '#ffffff', id: 30, gloss: 0.3, uniforms: { uTex: { value: t } }, pattern: `
    if(vLocalN.y > 0.5){ col = pow(texture(uTex, vec2(vLocal.x / ${CARD.W.toFixed(3)} + 0.5, 0.5 - vLocal.z / ${CARD.H.toFixed(3)})).rgb, vec3(1.22)); } else col = vec3(0.9, 0.86, 0.78);
  ` }));
  return m;
}

export function setup({ scene, overlay, camera, engine }) {
  let set = null;
  if (!q.get('standin')) { try { set = makeSet({ scene, overlay, camera, engine }); scene.add(set.root); } catch (e) { console.warn('props bench: set failed, using the stand-in table', e); set = null; } }
  const T = set ? { hole: { visible: false }, bridge: null } : tabletop(scene);
  const P = makeProps({ scene, camera });
  if (typeof window !== 'undefined') window.__props = P;   // debug handle for probes
  scene.add(P.root);
  if (set?.tableTop) { set.root.updateMatrixWorld(true); set.tableTop.attach(P.tableRoot); }
  const arm = forearm(scene, [1.6, 0.13, 0.02], [1.27, 0.055, 0.14]);
  const skin = celMaterial({ color: '#a8968a', id: 21, gloss: 0.3 }), robe = celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 });
  const hands = {
    google: handFrame([1.16, 0.2, -0.16], [-1, 0.25, 0.08], [0.1, -1, 0.15]),
    xai: handFrame([1.1, 0.17, -0.66], [-1, 0.12, 0.05], [0, 0, 1]),
  };
  const handProxy = [];
  for (const id of Object.keys(hands)) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12).scale(0.95, 1.15, 0.5).translate(0, 0.012, -0.006), skin));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1.6, 1).translate(0.032, 0.0, 0.004), skin));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.2, 16).translate(0, -0.13, -0.004), robe));
    g.matrixAutoUpdate = false; g.matrix.copy(hands[id]); scene.add(g); handProxy.push(g);
  }
  const fistM = handFrame([0.15, 0.32, 1.0], [-1, -0.15, 0], [0, -1, 0]);
  const fist = standInFist(skin); fist.matrixAutoUpdate = false; fist.matrix.copy(fistM); scene.add(fist);
  const tipMark = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), glowMaterial({ color: '#30ff60', id: 141 })); tipMark.userData.noShadow = true; scene.add(tipMark);
  const LOCK = [0.98, 0.26, -2.42];
  const lock = standInLock(scene, LOCK);
  const K = makeKings({ scene, camera }); scene.add(K.root);
  if (typeof window !== 'undefined') window.__propsKings = K;   // debug handle
  const kingApi = { handFrame: (id, side) => (side === 'M' ? K.mouthFrame(id) : K.handFrame(id, side)) };
  const stampApi = { handFrame: (id, side) => K.handFrame(id, side), ...(K.gripFrame ? { gripFrame: (id, side, out) => K.gripFrame(id, side, out) } : {}) };
  // v3 stand-ins: the two head kings' proposal cards on their spots, a stamped card, the two paper people
  const spot = (id) => { const k = KING[id], s = SIDE_SIGN[k.side]; return [s * PRESS.CARD_SPOT[0], 0, SEAT.Z[k.seat] + PRESS.CARD_SPOT[1]]; };
  const cards = {};
  for (const id of ['deepseek', 'openai']) { const m = proposalCard(false); const [x, , z] = spot(id); m.position.set(x, 0, z); m.rotation.y = SIDE_SIGN[KING[id].side] < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(m); cards[id] = m; }
  const stampedCard = proposalCard(true); stampedCard.position.set(-0.62, 0, -2.5); stampedCard.rotation.y = 0.25; scene.add(stampedCard);
  const slideCard = proposalCard(false); scene.add(slideCard);
  const red = standInPerson('#c8322a'), blue = standInPerson('#2f55b8');
  scene.add(red, blue);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), GM = new THREE.Matrix4();
  const cam = (c, pos, look, fov, near = 0.03) => {
    c.position.set(...(vec(q.get('bp')) ?? pos)); c.up.set(0, 1, 0); c.lookAt(V.set(...(vec(q.get('bl')) ?? look))); c.fov = +(q.get('bf') ?? fov); c.near = near;
  };
  const both = (p, w = 0.1, axis = 'z') => {
    const a = axis === 'z' ? [0, 0, w] : [w, 0, 0];
    return { hand: { L: 'open', R: 'open' }, armL: { target: [p[0] + a[0], p[1] + 0.02, p[2] + a[2]], palm: [-a[0], 0, -a[2]] }, armR: { target: [p[0] - a[0], p[1] + 0.02, p[2] - a[2]], palm: [a[0], 0, a[2]] }, rise: 0.5 };
  };
  // a fist holding a stamp so that its face centre lands on `face` [x, y, z]: the kings' stamp grip (thumb up, fingers
  // level toward the table, palm toward his middle), the fist's hole on the handle's grip point. The arm target is the
  // palm; the hole sits off the palm, so the target is corrected twice from the measured hole (pure: same every frame).
  const fwd = (id) => -SIDE_SIGN[KING[id].side];
  const stampArm = (id, side, face) => {
    const fx = fwd(id), palmZ = (side === 'R' ? 1 : -1) * (KING[id].side === 'US' ? 1 : -1);
    return { target: [face[0], face[1] + STAMP.FIST, face[2]], pole: [0, -0.6, 0], fingers: [fx, 0, 0], palm: [0, 0, palmZ] };
  };
  const aimStamps = (kst, list) => {
    if (!K.gripFrame) return;
    for (let it = 0; it < 2; it++) {
      K.update(kst, 0);
      for (const [id, side, face] of list) {
        K.gripFrame(id, side, GM); V.setFromMatrixPosition(GM);
        const a = kst[id]['arm' + side];
        a.target = [a.target[0] + face[0] - V.x, a.target[1] + face[1] + STAMP.FIST - V.y, a.target[2] + face[2] - V.z];
      }
    }
  };
  const look0 = () => ({ style: 'noir' });
  const macroDof = (look, focus) => { if (q.get('dof') === '1') look.dof = { focus, k: 1.6, max: 12 }; };
  const setState = (cities = 0) => ({ lamp: { swing: [0, 0], flicker: 0, on: 1 }, wobble: 0, board: { rows: [[{ t: -1, text: '' }]], lit: 0 }, alarm: { on: 0, angle: 0 }, boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } }, cloth: { cities, gold: 0, flood: null } });
  const allPresses = () => Object.fromEntries(KINGS.map((k) => [k.id, { lever: 0, slide: 0 }]));
  // a field of marks on the CN coast (deterministic)
  const field = (() => {
    const rng = new Rng(77), out = [];
    for (let i = 0; i < 60; i++) out.push({ pos: [rng.range(-1.05, -0.45), 0, rng.range(-2.9, -1.0)], rot: Math.PI / 2 + rng.range(-0.5, 0.5), size: 1, k: rng.next() < 0.25 ? 0.15 : rng.range(0.3, 1), seed: i * 3 + 1 });
    for (let i = 0; i < 60; i++) out.push({ pos: [rng.range(0.45, 1.05), 0, rng.range(-2.9, -1.0)], rot: -Math.PI / 2 + rng.range(-0.5, 0.5), size: 1, k: rng.next() < 0.25 ? 0.15 : rng.range(0.3, 1), seed: 500 + i });
    return out;
  })();

  return (t, c) => {
    const K0 = Math.max(0, Math.floor(t + 1e-6)), u = t - K0;
    G.uLampPos.value.set(0, 2.6, -0.1); G.uP2Col.value.setRGB(0, 0, 0);
    arm.visible = false; for (const m of handProxy) m.visible = false; fist.visible = tipMark.visible = false; lock.visible = false;
    for (const m of Object.values(cards)) m.visible = false;
    stampedCard.visible = slideCard.visible = red.visible = blue.visible = false;
    c.near = 0.03;
    if (set) set.update(setState(), t);
    let look = look0();
    if (K0 >= 50) {
      look = v2(K0 - 50, u, c, t);
    } else {
      const st = {}, kst = {};
      let kingsOn = true, api = stampApi;
      const ds = spot('deepseek'), oa = spot('openai');
      const dsFace = (y) => [ds[0], CARD.T + y, ds[2]];
      // red at his home spot on the CN coast, blue across the sea
      const people = (rx = -0.56, rz = -2.02) => { red.visible = blue.visible = true; red.position.set(rx, 0, rz); red.rotation.y = Math.PI; blue.position.set(0.56, 0, -2.02); blue.rotation.y = 0; };
      if (K0 === 0 || K0 === 1) {
        cards.deepseek.visible = true; people(-0.6, -1.99);
        const ph = u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.75 ? 2 : u < 0.9 ? 3 : 4;
        const h = [0.24, 0.035, 0, 0.07, 0.28][ph];
        st.stamps = { deepseek: { R: { press: ph === 2 ? 1 : 0, wet: ph === 2 ? 1 : ph >= 3 ? 0.85 : 1 } } };
        st.presses = { deepseek: { lever: 0, slide: 0 } };
        st.plates = { show: 1, turn: +(q.get('turn') ?? 0) };
        if (ph >= 3 || K0 === 1) st.ink = [{ pos: [ds[0], CARD.T, ds[2]], rot: Math.PI / 2, size: 1, k: ph === 4 ? 0.4 : 0.15, seed: 3 }];
        if (ph === 2) st.ink = [{ pos: [ds[0], CARD.T, ds[2]], rot: Math.PI / 2, size: 1, k: 0.06, seed: 3 }];
        kst.deepseek = { hand: { L: 'rest', R: 'fist' }, armR: stampArm('deepseek', 'R', dsFace(K0 === 1 ? 0.075 : h)), rise: 0.55, look: ds, face: { eyes: 'narrow', mouth: 'flat' } };
        aimStamps(kst, [['deepseek', 'R', dsFace(K0 === 1 ? 0.075 : h)]]);
        if (K0 === 0) { cam(c, [-0.49, 0.03, -2.0], [-0.79, 0.07, -2.24], 46, 0.003); macroDof(look, 0.3); }
        else { cam(c, [-0.66, 0.012, -2.12], [-0.79, 0.08, -2.22], 50, 0.003); macroDof(look, 0.15); st.stamps.deepseek.R = { press: 0, wet: 0.9 }; }
      } else if (K0 === 2) {
        cards.deepseek.visible = true;
        const L = [ds[0] + 0.02, CARD.T + (u >= 0.5 ? 0.2 : 0.35), ds[2] - 0.48];
        const R = u >= 0.75 ? dsFace(0) : [ds[0], CARD.T + 0.3, ds[2]];
        st.stamps = { deepseek: { R: { press: u >= 0.75 ? 1 : 0, wet: 1 }, ...(u >= 0.5 ? { L: { press: 0, wet: 0.6 } } : {}) } };
        st.presses = { deepseek: { lever: 0, slide: 0 } }; st.plates = { show: 1, turn: +(q.get('turn') ?? 0) };
        kst.deepseek = { hand: { L: u >= 0.5 ? 'fist' : 'rest', R: 'fist' }, armR: stampArm('deepseek', 'R', R), rise: 0.55, look: ds, face: { eyes: 'narrow', brows: 'angry', mouth: 'grit' } };
        if (u >= 0.5) kst.deepseek.armL = stampArm('deepseek', 'L', L);
        aimStamps(kst, [['deepseek', 'R', R], ...(u >= 0.5 ? [['deepseek', 'L', L]] : [])]);
        cam(c, [-0.15, 0.62, -1.75], [-1.1, 0.3, -2.4], 40);
      } else if (K0 === 3) {
        kingsOn = false; stampedCard.visible = true;
        st.ink = [
          { pos: [-0.62, 0, -2.2], rot: 0.1, size: 1, k: 0.05 + 0.0 * u, seed: 1 },
          { pos: [-0.62, 0, -2.07], rot: -0.08, size: 1, k: 0.15, seed: 2 },
          { pos: [-0.62, 0, -1.94], rot: 0.05, size: 1, k: 1, seed: 7 },
        ];
        if (u < 0.5) cam(c, [-0.47, 0.03, -2.0], [-0.62, 0.0, -2.1], 50, 0.003);
        else if (u < 0.75) cam(c, [-0.47, 0.11, -2.08], [-0.62, 0.0, -2.12], 50, 0.003);
        else cam(c, [-0.58, 0.32, -2.42], [-0.62, 0.0, -2.5], 45);           // the card painted with paintStampMark
        macroDof(look, 0.22);
      } else if (K0 === 4) {
        st.ink = field; st.plates = { show: 1, turn: +(q.get('turn') ?? 0) }; st.presses = allPresses();
        cam(c, [-0.2, 0.75, -1.35], [-0.75, 0.0, -2.1], 45);
      } else if (K0 === 5 || K0 === 6) {
        st.plates = { show: 1, turn: +(q.get('turn') ?? 0) }; st.presses = allPresses();
        if (K0 === 5) cam(c, M1.pos, M1.look, M1.fov);
        else cam(c, [0, 1.7, 4.0], [0, 0.7, -2.4], 40);
      } else if (K0 === 7 || K0 === 8) {
        const id = K0 === 7 ? 'deepseek' : 'openai', s = SIDE_SIGN[KING[id].side], p = seatPos(id);
        st.plates = { show: 1, turn: +(q.get('turn') ?? 0) }; st.presses = allPresses();
        cards[id].visible = true;
        kst[id] = { look: [-s * 1.5, 0.6, p[2]] };
        cam(c, [-s * 0.75, 0.55, p[2] + 0.35], [s * 1.25, 0.25, p[2] - 0.05], 40);
      } else if (K0 === 9) {
        people(-0.66, -2.3);
        red.rotation.y = 0.6;
        st.presses = { deepseek: { lever: smooth(u * 3) * (1 - smooth((u - 0.4) * 3)), slide: u } };
        st.plates = { show: 1, turn: +(q.get('turn') ?? 0) };
        // the card leaving the slot, down the ramp, out onto the cloth (short edge first)
        P.update(st, t, api);
        const F = P.pressFrame('deepseek', M4);
        const d = u * (CARD.H + 0.16);
        const local = new THREE.Vector3(0, 0, 0), ramp = new THREE.Vector3(...PRESS.RAMP).sub(new THREE.Vector3(...PRESS.SLOT));
        const rl = Math.hypot(ramp.y, ramp.z), along = d - CARD.H / 2;
        if (along < 0) local.set(0, 0, along); else if (along < rl) local.set(0, ramp.y * along / rl, ramp.z * along / rl); else local.set(0, ramp.y, ramp.z + along - rl);
        V.copy(local).applyMatrix4(F);
        slideCard.visible = true; slideCard.position.set(V.x, Math.max(0, V.y - 0.002), V.z);
        slideCard.rotation.set(along < rl ? Math.atan2(-ramp.y, ramp.z) * (along > 0 ? 1 : 0) : 0, Math.atan2(F.elements[8], F.elements[10]), 0, 'YXZ');
        cam(c, [-0.66, 0.03, -2.08], [-0.88, 0.07, -2.55], 52, 0.003);
        macroDof(look, 0.3);
      } else if (K0 === 10) {
        cards.deepseek.visible = true; people(-0.6, -2.06);
        st.presses = { deepseek: { lever: 0, slide: 0 } }; st.plates = { show: 1, turn: +(q.get('turn') ?? 0) };
        st.stamps = { deepseek: { R: { press: 0, wet: 1 } } };
        kst.deepseek = { hand: { L: 'rest', R: 'fist' }, armR: stampArm('deepseek', 'R', dsFace(0.16)), rise: 0.55, look: ds, face: { eyes: 'narrow', mouth: 'flat' } };
        aimStamps(kst, [['deepseek', 'R', dsFace(0.16)]]);
        cam(c, [-1.22, 1.3, -1.72], [-0.82, 0.0, -2.32], 40);
      } else if (K0 === 11) {
        st.ink = field.filter((m, i) => i % 2 === 0 || u > 0.5); st.presses = allPresses(); st.plates = { show: 1, turn: +(q.get('turn') ?? 0) };
        st.stamps = {};
        const hits = [];
        for (const k of KINGS) {
          const s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat] + 0.28, ph = (u * 3 + k.seat * 0.37 + (s > 0 ? 0.5 : 0)) % 1;
          const y = ph < 0.5 ? 0.25 * (1 - ph * 2) : ph < 0.6 ? 0 : (ph - 0.6) * 0.6;
          const face = [s * 0.8, y, z];
          st.stamps[k.id] = { R: { press: ph >= 0.5 && ph < 0.6 ? 1 : 0, wet: 1 } };
          kst[k.id] = { hand: { L: 'rest', R: 'fist' }, armR: stampArm(k.id, 'R', face), rise: 0.55, look: [s * 0.8, 0, z] };
          hits.push([k.id, 'R', face]);
        }
        aimStamps(kst, hits);
        people(-0.54, -1.75); red.rotation.y = -0.4;
        cam(c, [-0.5, 0.035, -1.55], [-0.85, 0.09, -2.4], 56, 0.003);
        macroDof(look, 0.35);
      } else if (K0 === 12) {
        kingsOn = false; people(-0.5, -2.2);
        st.stamps = { deepseek: { R: { at: [-0.62, 0, -2.08], yaw: Math.PI / 2 - 0.5, press: 0, wet: 0.2 } } };
        st.ink = [{ pos: [-0.66, 0, -2.25], rot: Math.PI / 2 - 0.3, size: 1, k: 1, seed: 9 }];
        if (u < 0.5) cam(c, [-0.36, 0.09, -1.86], [-0.62, 0.1, -2.08], 50, 0.003);
        else if (u < 0.75) {
          // the face from below: the stamp lifted, camera on the cloth
          st.stamps.deepseek.R.at = [-0.62, 0.09, -2.08];
          cam(c, [-0.5, 0.012, -2.02], [-0.62, 0.08, -2.08], 50, 0.003);
        } else {
          // the squash: the rubber's edge at the cloth, .75 press 0, .9 press 1 (wet)
          st.stamps.deepseek.R.press = u >= 0.9 ? 1 : 0; st.stamps.deepseek.R.wet = 1;
          cam(c, [-0.535, 0.012, -1.995], [-0.6, 0.008, -2.06], 40, 0.003);
        }
        api = { handFrame: () => null };
      } else if (K0 === 15) {
        // the palm-down fist on the knob, api.handFrame only (face = palm - STAMP.GRIP): .0 medium, .5 macro at the hit
        cards.deepseek.visible = true; people(-0.6, -1.99);
        const hit = u >= 0.5, face = dsFace(hit ? 0 : 0.12);
        st.stamps = { deepseek: { R: { press: hit ? 1 : 0, wet: 1 } } }; st.presses = { deepseek: { lever: 0, slide: 0 } }; st.plates = { show: 1 };
        kst.deepseek = { hand: { L: 'rest', R: 'fist' }, armR: { target: [face[0], face[1] + STAMP.GRIP, face[2]], palm: [0, -1, 0] }, rise: 0.55, look: ds, face: { eyes: 'narrow', mouth: 'flat' } };
        api = { handFrame: (id, side) => K.handFrame(id, side) };
        if (!hit) cam(c, [-0.15, 0.55, -1.8], [-0.95, 0.2, -2.35], 38);
        else cam(c, [-0.49, 0.03, -2.0], [-0.79, 0.09, -2.24], 46, 0.003);
      } else if (K0 === 16) {
        // every nameplate, one per tenth (KINGS order), from across the sea at 1.6 m, fov 30
        const k = KINGS[Math.min(9, Math.floor(u * 10 + 1e-6))], s = SIDE_SIGN[k.side], p = platePos(k.id);
        st.plates = { show: 1, turn: +(q.get('turn') ?? 0) }; st.presses = allPresses();
        cam(c, [p[0] - s * 1.55, 0.42, p[2] + 0.3], [p[0], 0.1, p[2]], 30);
      } else if (K0 === 13) {
        cam(c, M1.pos, M1.look, M1.fov);
      } else if (K0 === 14) {
        cam(c, [-0.2, 0.6, -1.6], [-1.0, 0.15, -2.4], 42);
      }
      if (q.get('nokings')) kingsOn = false;
      K.root.visible = kingsOn;
      K.update(kst, t);
      P.update(st, t, api);
    }
    return look;
  };

  // ---- v2 regression views (old bench numbers)
  function v2(k, u, c, t) {
    const st = { buttons: {}, cigars: {}, glasses: {}, seals: {}, presses: {}, chips: {}, keys: {}, clocks: {} };
    const kst = {};
    arm.visible = k <= 1;
    for (const m of handProxy) m.visible = k === 2;
    fist.visible = tipMark.visible = k === 5;
    lock.visible = k === 3 || k === 4;
    T.hole.visible = false;
    let kingsOn = k >= 3 && k !== 5 && k !== 7 && k !== 13;
    const look = { style: 'noir' };
    let api = kingApi;
    if (k === 0) {
      st.buttons.google = { cover: 0, press: 0, lit: 0, cancel: 0, dead: 0 };
      cam(c, [1.44, 0.17, 0.56], [1.06, 0.045, 0.29], 30);
    } else if (k === 1) {
      const open = smooth(u / 0.3), push = smooth((u - 0.4) / 0.1) * (1 - smooth((u - 0.6) / 0.15));
      st.buttons.google = { cover: u > 0 ? open : 1, press: u > 0 ? push : 1, lit: u > 0 ? (u > 0.5 ? 1 : 0) : 1, cancel: 0, dead: 1 };
      cam(c, [1.44, 0.17, 0.56], [1.06, 0.045, 0.29], 30);
    } else if (k === 2) {
      st.cigars.google = { hand: null, lit: 1, glow: 0.35 + 0.65 * Math.max(0, Math.sin(u * 6)), ash: 0.75, ashDrop: u > 0.5 ? 2.5 : null };
      st.cigars.xai = { hand: 'R', lit: 1, glow: 0.2, ash: 0.4, ashDrop: null };
      st.glasses.openai = { hand: null, wine: 0.62, at: [0.97, 0, -0.44] };
      st.glasses.google = { hand: 'R', wine: 0.5 };
      cam(c, [1.56, 0.3, -0.3], [1.05, 0.09, -0.56], 40);
      api = { handFrame: (id) => (id === 'xai' ? hands.google : id === 'google' ? hands.xai : M4) };
    } else if (k === 3 || k === 4) {
      const turn = k === 3 ? smooth((u - 0.45) / 0.1) : (u >= 0.5 && u < 0.75 ? 1 : 0);
      const tgt = k === 4 && u >= 0.75 ? [1.3, 0.55, -2.35] : [LOCK[0] + 0.016 + 0.235, LOCK[1] + 0.01, LOCK[2] - 0.03];
      kst.openai = { hand: { R: 'hold' }, armR: { target: tgt, palm: k === 4 && u >= 0.75 ? [-1, 0, 0] : [0, -1, 0], pole: [0.5, -0.6, -0.6] }, look: LOCK, face: { eyes: 'narrow', mouth: 'flat' } };
      st.keys.openai = { hand: 'R', turn, aim: k === 4 && u >= 0.75 ? null : [LOCK[0] + 0.016, LOCK[1] - 0.005, LOCK[2]] };
      if (k === 3) cam(c, u > 0.8 ? [0.75, 0.4, -2.05] : [1.12, 0.36, -1.82], [1.1, 0.24, -2.43], 36);
      else cam(c, [0.2, 0.8, -1.55], [1.35, 0.4, -2.45], 38);
    } else if (k === 5) {
      api = { handFrame: () => fistM };
      st.keys.openai = { hand: u < 0.75 ? 'R' : null, turn: u >= 0.5 && u < 0.75 ? 1 : 0 };
      if (u >= 0.75) cam(c, [0.55, 0.5, -2.05], [0.85, 0.0, -2.35], 40);
      else cam(c, [-0.25, 0.42, 1.38], [0.0, 0.3, 1.0], 36);
    } else if (k === 6) {
      const ph = Math.min(3, Math.floor(u * 4 + 1e-6));
      st.clocks.google = { show: 1, n: [10, 5, 1, 0][ph], ring: ph === 3 ? 1 : 0, at: [1.1, 0, -0.42] };
      st.clocks.anthropic = { show: 1, n: 12, at: [1.1, 0, -1.67] };
      kst.google = { look: [-0.5, 0.6, 0.0], face: ph === 3 ? { eyes: 'wide', mouth: 'o' } : { eyes: 'narrow', mouth: 'flat' } };
      cam(c, [-0.6, 0.78, -0.05], [1.3, 0.4, -0.15], 36);
    } else if (k === 7) {
      const show = u < 0.5 ? u / 0.4 : 1, n = u < 0.5 ? 15 : Math.max(0, 15 - (u - 0.5) * 34);
      st.clocks.google = { show: clamp(show), n, ring: u > 0.94 ? 1 : 0 };
      cam(c, [1.62, 0.3, -0.42], [1.1, 0.16, -0.3], 34);
    } else if (k >= 8 && k <= 11) {
      const who = { 8: 'google', 9: 'doubao', 10: 'meta', 11: 'kimi' }[k], kind = { 8: 'gold', 9: 'castle', 10: 'city', 11: 'plant' }[k];
      const pp = pressPos(who), sgn = KINGS.find((x) => x.id === who).side === 'CN' ? -1 : 1;
      const above = [pp[0] + sgn * 0.12, 0.47, pp[2] + 0.04];
      let hp;
      if (kind === 'city') {
        if (u < 0.5) { const peel = u < 0.15 ? 0 : clamp((u - 0.15) / 0.25); hp = { kind, peel, u: 0 }; T.hole.visible = peel > 0.05; }
        else if (u < 0.7) { hp = { kind, peel: 1, grab: true, at: [pp[0] + 0.1, 0.62, pp[2] - 0.05], into: 0 }; T.hole.visible = true; }
        else { hp = { kind, peel: 1, into: 1, u: 0.45 }; T.hole.visible = true; }
        const g = cityGrab(hp.peel, new THREE.Vector3(), who);
        kst[who] = { hand: { R: 'hold', L: 'open' }, armR: { target: u >= 0.5 && u < 0.7 ? hp.at : g.toArray(), palm: [0, -1, 0] }, rise: 0.6, look: CITY };
      } else {
        if (u < 0.25) hp = { kind, at: above, into: 0 };
        else if (u < 0.45) hp = { kind, at: above, into: 0.5 };
        else if (u < 0.7) hp = { kind, u: 0 };
        else hp = { kind, u: 0.5 };
        kst[who] = u < 0.45 ? both([above[0], above[1] + FEED[kind].H * 0.4, above[2]], FEED[kind].R + 0.03) : { rise: 0.4, look: [pp[0], 0.3, pp[2]] };
      }
      st.presses[who] = { hopper: hp, lever: 0 };
      const camAt = { google: [[-0.25, 0.72, 0.42], [1.2, 0.4, -0.12]], doubao: [[0.35, 0.72, 2.85], [-1.2, 0.4, 2.4]], meta: [[-0.3, 0.75, 2.85], [1.15, 0.35, 2.2]], kimi: [[0.35, 0.72, 0.42], [-1.2, 0.4, -0.12]] }[who];
      cam(c, camAt[0], camAt[1], 34);
    } else if (k === 12) {
      const gl = u > 0.9 ? 1 : [0.2, 0.6, 1][Math.min(2, Math.floor(u * 3 + 1e-6))];
      for (const kk of KINGS) if (kk.side === 'US') st.presses[kk.id] = { glow: u > 0.9 ? 0.5 : 0 };
      st.presses.google = { glow: gl, lever: 0.3, hopper: {} };
      if (u > 0.9) cam(c, [-0.6, 0.9, 1.6], [0.9, 0.15, -0.6], 40);
      else cam(c, [0.35, 0.42, 0.32], [0.9, 0.17, -0.12], 34);
      look.beam = 0.6;
    } else if (k === 13) {
      const sw = Math.sin(u * Math.PI * 2) * 0.6;
      const fUS = [3.2, 4.6, 1.6], rUS = [0.1 + sw, 1.3, 3.0 - sw * 0.3];
      const fCN = [-3.2, 4.6, 1.2], rCN = [-0.2 - sw * 0.8, 1.6, 2.2];
      st.seals.US = { chain: chainPath(fUS, rUS, 0.2 * Math.cos(u * Math.PI * 2)), spin: 0.4 };
      st.seals.CN = { chain: chainPath(fCN, rCN, -0.2 * Math.cos(u * Math.PI * 2)), spin: -0.3 };
      cam(c, [0.0, 2.7, -5.6], [0.4, 1.6, 2.4], 46);
      look.beam = 0.8;
    } else if (k === 14) {
      const sw = Math.sin(u * Math.PI * 2) * 0.12;
      st.seals.US = { chain: chainPath([3.2, 4.6, 1.6], [0.1 + sw, 1.55, 3.0], 0.1), spin: -1.2 };
      if (u < 0.5) cam(c, [-0.9, 0.95, 4.5], [0.05, 0.85, 3.0], 34);
      else if (u < 0.75) cam(c, [-0.55, 0.12, 4.05], [0.05, 0.75, 3.0], 40);
      else cam(c, [-1.6, 1.2, 6.2], [0.6, 1.9, 2.6], 46);
      G.uP2Pos.value.set(-0.6, 0.3, 4.0); G.uP2Col.value.setRGB(0.5, 0.45, 0.4); G.uP2Range.value = 3;
    } else if (k === 15) {
      for (const kk of KINGS) st.chips[kk.id] = { stack: kk.side === 'CN' ? 0.55 : 1, kind: kk.id === 'kimi' ? 'CN' : 'US' };
      st.chips.openai = { stack: 1, heap: u > 0 ? 1 - u : 1 };
      st.presses.qwen = { hopper: { kind: 'chips', u: 0.2 } };
      cam(c, [-0.35, 0.42, -0.45], [-0.75, 0.08, -1.4], 40);
      if (u > 0.4) cam(c, [0.45, 0.32, -2.15], [0.72, 0.05, -2.95], 40);
    } else if (k === 16 || k === 17) {
      const ph = Math.min(3, Math.floor(u * 4 + 1e-6));
      st.buttons.anthropic = { cover: ph >= 1 ? 1 : 0, press: ph === 2 ? 0.8 : 0, lit: ph >= 2 ? 1 : 0, cancel: 0, dead: ph === 3 ? 1 : 0 };
      if (k === 16) { kingsOn = false; cam(c, [1.5, 0.52, -0.55], [1.05, 0.04, -0.95], 34); }
      else cam(c, [0.38, 0.42, -1.12], [1.06, 0.05, -0.95], 34);
    }
    if (q.get('nokings')) kingsOn = false;
    K.root.visible = kingsOn;
    K.update(kst, t);
    P.update(st, t, api);
    if (k === 5) P.keyTip('openai', tipMark.position);
    void KEY_TIP; void keyRest;
    return look;
  }
}
