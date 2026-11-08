// Sequences 1-3 — 空桌 / 入局 / 两张王 (0:00–1:02): an empty table, a dozing Google, a small newcomer throws the first
// card; the others slide in out of the dark and throw bigger and bigger cards; the presses spit out two jokers and
// each side locks one in an iron box; the title.
import { KINGS, KING, SEAT, SIDE_SIGN, BOXES, BOX, M1 as M1CAM } from '../layout.js';
import { CUES } from '../shots.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, camPath, M1, kf, face, keys } from './core.js';
import { allThrows, LADDER, DOUBLE, FIRST, pileTop } from './throws.js';
import { BOXING, sizeAt } from './story.js';

export const hd = (id, t, up = 0.98) => kf(id, 0, up * sizeAt(t, id), 0);
// the medium low angle on a thrower (mirrored by camp through kf)
const throwerCam = (cam, id, i, t) => {
  const near = 1 - i * 0.05, big = i >= 3, s = sizeAt(t, id);
  camLook(cam, kf(id, (big ? 1.25 : 1.5) * near * s, big ? 0.72 : 0.5, (big ? 1.25 : 0.78) * near), kf(id, 0.1, (big ? 1.0 : 0.92) * s, big ? -0.1 : 0.0), big ? 46 : 40);
};
// straight down on the pile, high enough for the card that lands
export const pileCam = (cam, scale, t, dz = 0) => {
  const fov = lerp(42, 58, clamp((scale - 1) / 3.6));
  const base = pileTop(t);
  const h = (0.26 * Math.pow(scale, 0.62)) / (0.62 * 2 * Math.tan((fov * Math.PI) / 360)) + 0.12 + base;
  camLook(cam, [0.0, Math.min(2.4, h), 0.02 + dz], [0, base, dz], fov);
};

export const RANGE = [0, at('4-01')];
export function apply(t, st, w) {
  // seq 2: everyone watches the thrower wind up, then the card land; the thrower glares at the pile
  if (t > at('2-01') && t < at('3-01')) for (const th of allThrows()) {
    if (th.t > end('2-22') || th.t < at('2-01') - 1 || !th.who) continue;
    const t0 = th.t - th.hold;
    if (t < t0 || t > th.land + 0.6) continue;
    const thrower = th.who;
    for (const k of KINGS) {
      if (k.id === thrower) { st.kings[k.id].look = [0, 0.1, 0]; st.kings[k.id].face = face(t < th.t ? 'angry' : 'proud', { socket: 0.3 }); continue; }
      st.kings[k.id].look = t < th.t ? hd(thrower, t) : [0, 0.05, 0];
      if (t > th.land) st.kings[k.id].face = face(KING[k.id].side === KING[thrower].side ? 'smug' : 'sour', { socket: 0.3 });
    }
  }
  // after the first card: Google glares at the newcomer, sweating
  if (t > CUES.code + 0.8 && t < at('2-03')) { st.kings.google.look = hd('openai', t); st.kings.google.face = face('glare', { mouth: 'grit', socket: 0.3 }); }
  // seq 3: the boxing of the jokers
  if (t > at('3-01') && t < at('4-01')) {
    for (const side of ['US', 'CN']) {
      const id = side === 'US' ? 'openai' : 'deepseek', B = BOXING[side], hand = side === 'US' ? 'L' : 'R';
      const born = side === 'US' ? CUES.joker1 : at('3-06', 0.05);
      const P = pressPt(w, id);
      const box = BOXES[side], inBox = [box[0], BOX.H + 0.12, box[2]], over = [box[0], BOX.H + 0.35, box[2]];
      if (t > born - 0.3 && t < B.slam + 0.6) {
        let p;
        if (t < B.grab) p = lerp3(kf(id, 0.3, 0.2, 0), [P[0], P[1] + 0.2, P[2]], ease(t, born + 0.4, B.grab));
        else if (t < B.drop - 0.25) p = lerp3([P[0], P[1] + 0.2, P[2]], over, ease(t, B.grab, B.drop - 0.25));
        else if (t < B.drop) p = lerp3(over, inBox, ease(t, B.drop - 0.25, B.drop));
        else p = lerp3(inBox, kf(id, 0.3, 0.2, 0), ease(t, B.slam, B.slam + 0.5));
        st.kings[id]['arm' + hand] = { target: p };
        st.kings[id].hand = { ...(st.kings[id].hand ?? {}), [hand]: t > B.grab && t < B.drop ? 'hold' : 'open' };
        st.kings[id].lean = 0.2;
        st.kings[id].look = t < B.drop ? (t < B.grab ? P : over) : box;
        st.kings[id].face = face(t < B.grab ? 'shock' : t < B.slam + 0.3 ? 'fear' : 'calm', { socket: 0.3 });
      }
      // the press shudders before the joker comes out
      if (t > born - 2.4 && t < B.grab) st.props.presses[id] = { ...st.props.presses[id], glow: 0.6 + 0.4 * Math.sin(t * 31), shake: 1, lever: 0.15 * Math.sin(t * 41) + 0.15 };
    }
  }
}

export const SHOTS = {
  '1-01': (t, st, w) => { M1(w.camera, 0.1, 0.4); st.look.fade = 1; },
  // ---- the dim war room: only Google, asleep on his chips; the head of the table in shadow
  '1-02': (t, st, w) => {
    // high over the empty CN side: the long bare table, and in the pool of light one king asleep on his chips
    const u = uRow(t, '1-02');
    camLook(w.camera, [-1.9, 2.5 - 0.3 * u, 3.1 - 0.5 * u], [0.9, 0.35, -0.4], 46);
    st.set.lamp.on = 1; st.look.lampCone = 50; st.look.exposure = 1.35;
  },
  // ---- the newcomer at the head: small, upright, a card in his hand; a glance at the sleeper, a little smile
  '1-03': (t, st, w) => {
    const h = hd('openai', t);
    camLook(w.camera, kf('openai', 1.6, 0.72, 0.05), [h[0], h[1] - 0.12, h[2] + 0.05], 38);
    const u = uRow(t, '1-03');
    st.kings.openai.look = u < 0.45 ? hd('google', t) : [0, 0.05, 0];
    st.kings.openai.face = face(u < 0.45 ? 'side' : 'smug', { eyes: u < 0.45 ? 'side' : 'narrow', mouth: u > 0.3 ? 'smirk' : 'flat', look: [u < 0.45 ? 1 : 0, 0], socket: 0.3 });
    st.look.lampCone = 56; st.look.exposure = 1.25;
    st.look.p3 = { pos: kf('openai', 0.9, 1.0, 0.5), col: [0.5, 0.45, 0.4], range: 2.0 };
  },
  // ---- the first card slams into the compass: a ring of gold runs out over the map
  '1-04': (t, st, w) => {
    camLook(w.camera, [0, 1.15, 0.02], [0, 0, 0], 42);
    st.look.vignette = 0.6;
    st.look.exposure = 1.0 + 0.3 * ease(t, FIRST.t + FIRST.flight, FIRST.t + FIRST.flight + 0.15);
  },
  // ---- Google jolts awake; his crown flashes red (code red)
  '1-05': (t, st, w) => {
    const h = hd('google', t);
    camLook(w.camera, kf('google', 1.3, 0.25, 0.35), [h[0], h[1] - 0.05, h[2]], 34);
    const u = uRow(t, '1-05');
    st.kings.google.face = face(u < 0.15 ? 'shut' : 'shock', { eyes: u < 0.15 ? 'shut' : 'wide', mouth: u < 0.15 ? 'flat' : 'o', pupil: 0.1, socket: 0.3 });
    if (u > 0.12) { st.kings.google.head = undefined; st.kings.google.look = [0.02, 0, 0.04]; st.kings.google.slump = 0; st.kings.google.lean = lerp(0.16, -0.05, ease(u, 0.12, 0.3)); }
    st.kings.google.crownGlow = u > 0.25 ? 0.6 + 0.4 * Math.sin(t * 12) ** 2 : 0;
    st.look.exposure = 1.25;
  },
  // ---- M1: the gold runs to the table's edges; in the dark all round, chairs scrape: something stirs
  '1-06': (t, st, w) => { M1(w.camera, 0.55); st.look.lampPow = 1.3; st.look.exposure = 1.5; st.kings.google.crownGlow = 0.6 + 0.4 * Math.sin(t * 12) ** 2; st.kings.google.face = face('worry', { socket: 0.3 }); },
  // ---- seq 2: the CN side fills: chairs slide in out of the dark, one after another
  '2-01': (t, st, w) => { const u = uRow(t, '2-01'); camLook(w.camera, [0.9, 2.1 - 0.15 * u, -3.7], [-2.1, 0.25, 0.4 - 0.4 * u], 52); st.look.exposure = 1.35; },
  // ---- the US side: Claude and Meta slide in; Google, awake and sweating, glares at the newcomer
  '2-02': (t, st, w) => { const u = uRow(t, '2-02'); camLook(w.camera, [-0.9, 2.0, 3.9 - 0.2 * u], [2.0, 0.25, -0.6], 52); st.look.exposure = 1.35; },
  // ---- the board: the #1 changes hands, then every row claims #1
  '2-19': (t, st, w) => { const u = uRow(t, '2-19'); camLook(w.camera, [0, 5.2, -1.75 - 0.25 * u], [0, 5.2, -4.9], 36); },
  // ---- the last empty chair, at the CN head: the smallest king slides in; he and OpenAI look at each other across the sea
  '2-20': (t, st, w) => {
    const u = uRow(t, '2-20');
    camLook(w.camera, [0.45, 0.75, -1.55], lerp3([-2.6, 0.55, -2.5], hd('deepseek', t), ease(u, 0.1, 0.65)), 42);
    st.kings.deepseek.look = u > 0.6 ? hd('openai', t) : [0, 0.1, 0]; st.kings.openai.look = hd('deepseek', t);
    st.kings.deepseek.face = face(u > 0.6 ? 'narrow' : 'calm', { eyes: u > 0.6 ? 'narrow' : 'open', socket: 0.3 });
    st.look.exposure = 1.3;
  },
  // ---- both head kings wind up at once
  '2-21': (t, st, w) => {
    camLook(w.camera, [0, 0.82, 0.9], [0, 0.85, -2.5], 50);
    st.kings.openai.face = face('shout', { socket: 0.3 }); st.kings.deepseek.face = face('shout', { socket: 0.3 });
    st.kings.openai.look = hd('deepseek', t); st.kings.deepseek.look = hd('openai', t);
  },
  '2-22': (t, st, w) => pileCam(w.camera, 4.6, t),
  // ---- the table is full: ten kings; a beat of quiet
  '2-23': (t, st, w) => { M1(w.camera, 0.5 + 0.1 * uRow(t, '2-23')); st.look.lampPow = 1.3; st.look.exposure = 1.5; },
  // ---- seq 3: OpenAI's press shudders by itself; a light in its mouth; he leans in
  '3-01': (t, st, w) => {
    const P = pressPt(w, 'openai');
    camLook(w.camera, [P[0] - 0.85, P[1] + 0.32, P[2] + 0.55], [P[0] + 0.2, P[1] + 0.25, P[2] - 0.05], 42);
    st.kings.openai.lean = 0.25; st.kings.openai.look = P; st.kings.openai.face = face('worry', { eyes: 'wide', socket: 0.3 });
    st.look.p3 = { pos: [P[0] - 0.1, P[1] + 0.15, P[2] + 0.1], col: [1.4, 1.05, 0.5].map((c) => c * (0.6 + 0.4 * Math.sin(t * 23))), range: 1.2 };
  },
  // ---- the slot: a card pushes itself out: a joker, glowing, grinning, standing up by itself
  '3-02': (t, st, w) => {
    const P = pressPt(w, 'openai'), u = smooth(uRow(t, '3-02'));
    camLook(w.camera, [P[0] - 0.62, P[1] + 0.22 + 0.12 * u, P[2] + 0.28], [P[0], P[1] + 0.12 + 0.32 * u, P[2]], 42);
    st.look.p3 = { pos: [P[0] - 0.12, P[1] + 0.2, P[2] + 0.05], col: [1.3, 1.0, 0.6], range: 1.0 };
    st.look.exposure = 1.3;
  },
  // ---- his eye, through the mask: wide
  '3-03': (t, st, w) => { st.camAttach = { kind: 'eye', id: 'openai', side: 'L', dist: 0.22, fov: 40 }; camLook(w.camera, kf('openai', 0.4, 0.98, 0), hd('openai', t), 24); st.kings.openai.face = face('shock', { eyes: 'wide', pupil: 0.1, socket: 0.3 }); },
  // ---- into the iron box: the lid slams, chains, five padlocks click shut; Claude slaps on a 安全 ✓; relief
  '3-04': (t, st, w) => {
    camLook(w.camera, [-0.05, 0.95, -0.85], [1.0, 0.35, -2.05], 46);
    const B = BOXING.US;
    if (t > B.clicks[4] + 0.2) { st.kings.openai.face = face('calm', { eyes: 'closed', mouth: 'smirk', socket: 0.3 }); st.kings.anthropic.face = face('proud', { socket: 0.3 }); st.kings.openai.look = hd('anthropic', t); st.kings.anthropic.look = hd('openai', t); }
    st.look.exposure = 1.3;
  },
  // ---- across the sea, DeepSeek has watched it all; his own press begins to shudder
  '3-05': (t, st, w) => {
    const h = hd('deepseek', t);
    camLook(w.camera, kf('deepseek', 1.4, 0.4, -0.75), [h[0], h[1] - 0.12, h[2]], 38);
    st.kings.deepseek.look = [BOXES.US[0], 0.3, BOXES.US[2]]; st.kings.deepseek.face = face('narrow', { eyes: 'narrow', socket: 0.3 });
    st.props.presses.deepseek = { ...st.props.presses.deepseek, glow: 0.5 + 0.4 * Math.sin(t * 31), shake: 1 };
  },
  // ---- the same on the CN side, faster: a red joker, the box, five clicks, Qwen's 安全 ✓
  '3-06': (t, st, w) => { camLook(w.camera, [0.05, 0.95, -0.85], [-1.0, 0.35, -2.05], 46); st.look.exposure = 1.3; },
  // ---- the title: low and frontal from the sea, the two locked boxes either side, the empty throne far behind
  '3-07': (t, st, w) => {
    const u = uRow(t, '3-07');
    camLook(w.camera, [0, 0.42 + 0.03 * u, 0.95 - 0.25 * u], [0, 0.6, -3.6], 42);
    st.titles = { zh: '王炸', en: 'JOKERS WILD', alpha: ease(t, at('3-07', 0.6), at('3-07', 1.4)) * (1 - ease(t, at('3-07', 3.7), at('3-07', 4.3))), y: 0.3 };
    st.look.exposure = 1.2;
    for (const k of KINGS) if (SEAT.Z[k.seat] < -1) st.kings[k.id].look = [BOXES[k.side][0], 0.3, BOXES[k.side][2]];
  },
};
// the ladder: medium low angle on each thrower, then straight down on the card landing
LADDER.forEach(([row, id, , scale], i) => {
  SHOTS[row] = (t, st, w) => throwerCam(w.camera, id, i, t);
  const next = row.replace(/-(\d+)$/, (m, n) => '-' + String(+n + 1).padStart(2, '0'));
  SHOTS[next] = (t, st, w) => pileCam(w.camera, scale, t);
});
export function pressPt(w, id) {
  if (w.props?.pressOut) { const v = w.camera.position.clone(); return w.props.pressOut(id, v).toArray(); }
  const k = KING[id]; return [SIDE_SIGN[k.side] * 0.9, 0.25, SEAT.Z[k.seat] - 0.12];
}
void M1CAM; void camPath; void keys; void DOUBLE; void end;
