// Bench for the props module (?bench=props). Each integer bench time is one setup; the fraction animates it.
//   0  the AUTO console, cover closed (Google's, US seat 2), a king's forearm for scale
//   1  cover open, the button pressed and lit, the cancel key greyed out (dead)
//   2  a cigar burning in its ashtray with an ash, a crystal goblet of dark wine; a test right hand holding
//      another cigar (palm down) and another goblet (thumb up)
//   3  the two national seals hanging on their chains from the dark: US mid-drop, CN on a curved chain path
//   4  a card press with its paper card-maker beside it, close and low; lever pulled, a card sliding out
//   5  the paper-doll chains along the US coast, the press and maker behind
//   6  the cardboard Mistral king from behind (grey back, strut) at EU.pos, a second one facing us
//   7  chips: stacks beside the presses (US NVIDIA chips / CN kiln clay), OpenAI's mountain, a heap in a hopper
//   8  the six hopper items, one per sixth of the second: chips, gold, castle, city (peeling), plant, people + maker
//   9  the cardboard crowd from M1: .0 popped, .5 half fallen (dominoes from the head end)
//  10  Meta's rod from M1: .0 extended over the table to OpenAI's maker, .6 reeling him home hugging the sack
//  11  sacks on every king's back (the reveal), Claude's leaking books
//  12  approval flaps popping up, stamps in the kings' hands, a red check landing
//  13  price tags flipping (Qwen, Doubao) and the make-up brush swiping a card on the pile
//  14  Mistral folded, crushed under the short leg, sliding out (.0 under, .5 crushed, .9 sliding out)
//  15  card-maker actions: shovel loaded -> tipped into the hopper; holding a card; swept into the hopper
//  16  Mistral acting: .0 head down at the card in his hand, .5 arm up throwing, head tipped up
//  17  Claude's sack splitting: books dropping and piling behind his chair (.0 .. .9)
//  18  .0-.5 the doll chain fed to Kimi's press, the card-maker last, looking back; .5-1 the power plant smoking
//  19  Kimi's 'hold' fist raising a goblet (HOLD.glass on the kings' grip axis); .5 seen from the table side
// Debug: &bp=<x,y,z>&bl=<x,y,z>&bf=<fov> overrides the camera.
import * as THREE from 'three';
import { G } from '../glsl.js';
import { celMaterial } from '../materials.js';
import { makeProps, makeMistral, STANDEE } from '../props.js';
import { makeKings } from '../kings.js';
import { TABLE, FLOOR_Y, EU, SEA_HALF, M1, KINGS, deg, makerPos } from '../layout.js';
import { smooth, clamp } from '../util.js';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const vec = (s) => (s ? s.split(',').map(Number) : null);

// a plain war-room tabletop: dark wood with a parchment chart cloth, a stone floor (the set module is separate)
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
  TABLE.LEGS.forEach(([x, z], i) => { const gap = i === TABLE.SHIM_LEG ? 0.024 : 0; g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, -FLOOR_Y - TABLE.THICK - gap, 0.14).translate(x, (FLOOR_Y + gap - TABLE.THICK) / 2, z), legM)); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, 0), celMaterial({ color: '#2b2622', id: 3, gloss: 0.1, pattern: 'col *= 0.8 + 0.3 * fbm2(vWorld.xz * 1.5); float j = step(0.97, fract(vWorld.x * 1.6)) + step(0.97, fract(vWorld.z * 1.6)); col *= 1.0 - 0.3 * min(j, 1.0);' }));
  g.add(floor);
  scene.add(g);
  return g;
}
// a king's sleeve and mitten, only for scale (a 0.6 m king's forearm is ~0.2 m)
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
// a placeholder card for the press slot (the cards module draws the real ones)
function placeholderCard() {
  const c = document.createElement('canvas'); c.width = 252; c.height = 352;
  const g = c.getContext('2d');
  g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 252, 352);
  g.strokeStyle = '#b3262a'; g.lineWidth = 8; g.strokeRect(10, 10, 232, 332);
  g.fillStyle = '#b3262a'; g.font = '900 120px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('97', 126, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.063, 0.088).rotateX(-Math.PI / 2), celMaterial({ color: '#ffffff', id: 30, gloss: 0.3, uniforms: { uTex: { value: t } }, pattern: 'col = pow(texture(uTex, vUv).rgb, vec3(1.22));', side: THREE.DoubleSide }));
}

export function setup({ scene, camera }) {
  tabletop(scene);
  const P = makeProps({ scene, camera });
  if (typeof window !== 'undefined') window.__props = P;   // debug handle for probes
  scene.add(P.root);
  const eu2 = makeMistral(); scene.add(eu2.root);
  const arm = forearm(scene, [1.6, 0.13, 0.02], [1.27, 0.055, 0.14]);
  const card = placeholderCard(); scene.add(card);
  // test hands: Google's right hand palm-down with a cigar, xAI's right hand thumb-up with a goblet
  const hands = {
    google: handFrame([1.16, 0.2, -0.16], [-1, 0.25, 0.08], [0.1, -1, 0.15]),     // palm down: holds a cigar
    xai: handFrame([1.1, 0.17, -0.66], [-1, 0.12, 0.05], [0, 0, 1]),             // thumb up: holds a goblet
  };
  const handProxy = [];
  const skin = celMaterial({ color: '#a8968a', id: 21, gloss: 0.3 }), robe = celMaterial({ color: '#4e4656', id: 20, gloss: 0.3 });
  for (const id of Object.keys(hands)) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12).scale(0.95, 1.15, 0.5).translate(0, 0.012, -0.006), skin));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1.6, 1).translate(0.032, 0.0, 0.004), skin));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.2, 16).translate(0, -0.13, -0.004), robe));
    g.matrixAutoUpdate = false; g.matrix.copy(hands[id]); scene.add(g); handProxy.push(g);
  }
  const api = { handFrame: (id, side) => hands[id] ?? new THREE.Matrix4() };
  // the real kings, for context in the wide setups (sacks, stamps, rod, crowd)
  const K = makeKings({ scene, camera }); scene.add(K.root);
  const kingApi = { handFrame: (id, side) => (side === 'M' ? K.mouthFrame(id) : K.handFrame(id, side)) };
  const card2 = placeholderCard(); scene.add(card2);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4();
  const cam = (c, pos, look, fov) => {
    c.position.set(...(vec(q.get('bp')) ?? pos)); c.up.set(0, 1, 0); c.lookAt(V.set(...(vec(q.get('bl')) ?? look))); c.fov = +(q.get('bf') ?? fov);
  };
  return (t, c) => {
    const k = Math.min(19, Math.max(0, Math.floor(t + 1e-6))), u = t - k;
    G.uLampPos.value.set(0, 2.6, -0.1); G.uP2Col.value.setRGB(0, 0, 0);
    const st = { buttons: {}, cigars: {}, glasses: {}, seals: {}, presses: {}, makers: {}, people: { CN: { show: 1 }, US: { show: 1 } }, eu: { show: 1, fold: 0 }, chips: {}, tags: {}, sacks: {}, flaps: {}, stamps: {} };
    arm.visible = k <= 1; card.visible = k === 4; eu2.root.visible = k === 6;
    for (const m of handProxy) m.visible = k === 2;
    const look = { style: 'noir' };
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
      st.cigars.meta = { hand: null, lit: 0, glow: 0, ash: 0, ashDrop: null };
      st.glasses.openai = { hand: null, wine: 0.62, at: [0.97, 0, -0.44] };
      st.glasses.google = { hand: 'R', wine: 0.5 };
      P.items.trays.google.position.set(1.02, 0, -0.3);
      cam(c, [1.56, 0.3, -0.3], [1.05, 0.09, -0.36], 36);
      // swap: xAI's hand frame holds the cigar (palm down), Google's holds the goblet (thumb up)
      api.handFrame = (id, side) => (id === 'xai' ? hands.google : id === 'google' ? hands.xai : M4);
    } else if (k === 3) {
      st.seals.US = { drop: 0.62 + 0.08 * u, spin: 0.5 + u * 0.4 };
      const hy = 2.0;
      st.seals.CN = { drop: 0.5, spin: -0.7, chain: [[-1.7, 7.0, 1.2], [-1.1, 4.8, 0.9], [-0.8, 3.3, 0.7], [-0.62, hy + 0.385 * 0.86 + 0.06, 0.6]] };
      cam(c, [0.15, 0.95, -2.2], [0.0, 1.6, 0.6], 50);
      if (q.get('below')) { cam(c, [0.3, 0.35, 2.4], [0.2, 1.5, 0.6], 50); G.uP2Pos.value.set(0.2, 0.3, 1.6); G.uP2Col.value.setRGB(1.6, 1.3, 1.0); G.uP2Range.value = 4; }
      look.beam = 1.0;
    } else if (k === 4) {
      const lv = u > 0 ? smooth(u / 0.5) : 0.72;
      st.presses.google = { lever: lv, slide: 0.55 };
      st.makers.google = { show: 1, pose: { lean: 0.08, armR: 0.95, armL: 0.35, head: -0.06 } };
      P.pressFrame('google', M4);
      card.matrixAutoUpdate = false;
      card.matrix.copy(M4).multiply(new THREE.Matrix4().makeTranslation(0, -0.004, 0.044 * 0.55 - 0.03));
      cam(c, [0.66, 0.075, 0.72], [0.83, 0.12, -0.04], 34);
    } else if (k === 5) {
      st.presses.google = { lever: 0, slide: 0 };
      st.people.US = { show: u > 0 ? [1, 1, 1, smooth(u * 2), 1, 1] : 1 };
      cam(c, [0.3, 0.1, 0.95], [0.6, 0.07, -0.25], 40);
    } else {
      st.eu = { show: 1, fold: u > 0 ? u : 0 };
      // the film's standee shows its printed front to the table; a second one, turned round, shows the back
      eu2.update({ show: 1, fold: 0, at: [-0.85, FLOOR_Y, EU.pos[2] + 0.25], rot: [0, deg(160), 0] });
      cam(c, [1.15, 0.45, 2.05], [-0.2, -0.25, 3.7], 44);
      look.beam = 0.6;
    }
    let useApi = api;
    K.root.visible = (k >= 9 && k <= 12) || k === 17 || k === 19; card2.visible = false;
    if (k >= 7) { arm.visible = false; card.visible = false; eu2.root.visible = false; for (const m of handProxy) m.visible = false; }
    if (k === 7) {
      for (const kk of KINGS) st.chips[kk.id] = { stack: kk.side === 'CN' ? 0.55 : 1, kind: kk.id === 'kimi' ? 'CN' : 'US' };
      st.chips.openai = { stack: 1, heap: u > 0 ? 1 - u : 1 };
      st.presses.qwen = { hopper: { kind: 'chips', u: 0.2 } };
      cam(c, [-0.35, 0.42, -0.45], [-0.75, 0.08, -1.4], 40);
      if (u > 0.4) cam(c, [0.45, 0.32, -2.15], [0.72, 0.05, -2.95], 40);
    } else if (k === 8) {
      const kinds = ['chips', 'gold', 'castle', 'city', 'plant', 'people'];
      const slot = Math.min(5, Math.floor(u * 6 + 1e-6)), kind = kinds[slot];
      const id = kind === 'people' ? 'kimi' : 'google', f = u * 6 - slot;
      st.presses[id] = { hopper: { kind, u: kind === 'people' ? 0.25 + f * 0.3 : f * 0.4, maker: true, look: f > 0.3 ? 1 : 0, peel: kind === 'city' ? 0 : undefined } };
      st.makers[id] = { show: 1 };
      if (kind === 'city') { st.presses[id].hopper.u = 0; st.presses[id].hopper.peel = undefined; }
      if (id === 'google') cam(c, [0.55, 0.45, 0.3], [0.9, 0.24, -0.12], 34);
      else cam(c, [-0.32, 0.36, 0.55], [-0.82, 0.16, -0.06], 40);
    } else if (k === 9) {
      st.crowd = { pop: 1, fall: u > 0 ? u : 0 };
      cam(c, M1.pos, M1.look, M1.fov);
      if (q.get('close')) cam(c, [0.0, 1.0, 3.6], [-0.6, 0.1, 0.0], 42);
      useApi = kingApi;
    } else if (k === 10) {
      const reel = u > 0.5 ? smooth((u - 0.5) / 0.5) : 0;
      st.rod = { show: 1, ext: u > 0 ? Math.min(1, u * 2) : 1, reel, from: [1.58, 0.92, 2.5], to: makerPos('openai') };
      st.makers.openai = { show: 1, reel: reel > 0 ? 1 : 0 };
      cam(c, M1.pos, M1.look, M1.fov);
      if (q.get('close')) cam(c, [1.2, 0.9, -1.2], [0.75, 0.4, -2.3], 40);
      useApi = kingApi;
    } else if (k === 11) {
      for (const kk of KINGS) st.sacks[kk.id] = { show: 1 };
      st.sacks.anthropic = { show: 1, leak: u > 0 ? u : 0.55 };
      cam(c, [-0.3, 1.25, 3.2], [1.3, 0.55, 0.6], 44);
      useApi = kingApi;
    } else if (k === 12) {
      KINGS.forEach((kk, i) => { st.flaps[kk.id] = { up: 1, stamp: i % 3 === 0 ? 1 : (i % 3 === 1 ? 0.3 : 0) }; st.stamps[kk.id] = { hand: i % 2 ? 'R' : null }; });
      cam(c, [0.15, 0.55, 1.6], [1.15, 0.12, -0.3], 42);
      useApi = kingApi;
    } else if (k === 13) {
      const f = u > 0 ? u : 0.5;
      st.tags.qwen = { show: 1, prev: '¥0.10', text: '¥0.01', flip: f };
      st.tags.doubao = { show: 1, prev: '¥0', text: '¥-0.50', flip: f };
      st.brush = { show: 1, at: [0.0, 0.004, 0.0], u: f };
      card2.visible = true; card2.matrixAutoUpdate = false; card2.matrix.makeTranslation(0, 0.003, 0);
      cam(c, [-0.55, 0.3, -0.62], [-0.98, 0.13, -1.2], 40);
      if (q.get('brush')) cam(c, [0.25, 0.25, 0.32], [0, 0.02, 0], 40);
    } else if (k === 14) {
      // bench only: a practical light near the camera so the floor under the table can be judged
      G.uP2Pos.value.set(-0.45, -0.45, 3.5); G.uP2Col.value.setRGB(1.3, 1.15, 0.95); G.uP2Range.value = 3;
      const [lx, lz] = TABLE.LEGS[TABLE.SHIM_LEG];
      st.eu = { show: 1, fold: 1, at: [lx + 0.02, FLOOR_Y + 0.001, lz + 0.02], rot: [-Math.PI / 2, 0.35, 0], crushed: u > 0.4 ? 1 : (u > 0 ? u / 0.4 : 0), slide: u > 0.6 ? (u - 0.6) / 0.4 : 0 };
      cam(c, [-0.25, -0.5, 3.75], [-1.02, -0.77, 2.95], 46);
    } else if (k === 15) {
      const id = 'google';
      const ph = u > 0 ? u : 0;
      if (ph < 0.5) st.makers[id] = { show: 1, at: [0.83, 0, 0.12], hold: 'shovel', shovel: ph * 2, pose: { armR: 1.8 + ph * 0.6, armL: 0.3, lean: 0.1 } };
      else if (ph < 0.8) { st.makers[id] = { show: 1, hold: 'card', pose: { armR: 1.0, armL: 0.9, head: 0.1 } }; P.makerFrame(id, 'R', M4); card2.visible = true; card2.matrixAutoUpdate = false; card2.matrix.copy(M4).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0.02, 0.03, 0.003)); }
      else st.makers[id] = { show: 1, swept: (ph - 0.8) / 0.2 };
      st.presses[id] = { hopper: { kind: 'chips', u: 0 } };
      cam(c, [0.66, 0.2, 0.8], [0.84, 0.17, -0.05], 36);
    }
    if (k === 16) {
      const ph = u;
      st.eu = { show: 1, fold: 0, head: ph < 0.5 ? -1 : 1, arm: ph < 0.5 ? 0 : Math.min(1, (ph - 0.5) * 3) };
      cam(c, [0.62, 0.5, 2.55], [0.0, -0.12, 3.62], 44);
    } else if (k === 17) {
      st.sacks.anthropic = { show: 1, leak: u > 0 ? u : 0.6 };
      for (const kk of KINGS) if (kk.side === 'US' && kk.id !== 'anthropic') st.sacks[kk.id] = { show: 1 };
      cam(c, [2.9, 0.6, -0.4], [1.7, -0.5, -1.9], 46);
      if (q.get('wide')) cam(c, [0.0, 2.3, 5.2], [0.0, 0.25, -0.6], 44);
      useApi = kingApi;
    } else if (k === 18) {
      if (u < 0.5) {
        st.presses.kimi = { hopper: { kind: 'people', u: 0.05 + u * 0.7, maker: true, look: smooth((u - 0.15) / 0.2) } };
        st.makers.kimi = { show: 1 };
        cam(c, [-0.2, 0.36, 0.42], [-0.76, 0.14, -0.12], 46);
      } else {
        st.presses.google = { hopper: { kind: 'plant', u: 0 } };
        cam(c, [0.6, 0.42, 0.22], [0.9, 0.38, -0.12], 36);
      }
    }
    let kst = {};
    if (k === 19) {
      kst = { kimi: { hand: { R: 'hold' }, armR: { target: [-1.24, 0.5, 0.16], palm: [0, 0, -1] } } };   // thumb up, palm inward
      st.glasses.kimi = { hand: 'R', wine: 0.6 };
      if (u < 0.5) cam(c, [-1.0, 0.62, 0.62], [-1.26, 0.48, 0.14], 34); else cam(c, [-0.55, 0.55, 0.2], [-1.25, 0.5, 0.15], 30);
      useApi = kingApi;
    }
    K.update(kst, t);
    P.update(st, t, useApi);
    if (k === 16) { P.euHand(M4); card2.visible = true; card2.matrixAutoUpdate = false; card2.matrix.copy(M4).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)); }
    void STANDEE; void clamp;
    return look;
  };
}
