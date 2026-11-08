// Sequences 10-12 — 新王 / 还在出牌 / 片尾 (2:42–3:23): the cards build a giant on the throne, the pair for its face;
// it is taller than the giants; it deals every king a card; the threads let go. OpenAI and DeepSeek look at each other
// across the sea, their hands free; they play the card anyway. It flies up into the giant. Everyone plays again, faster;
// the giant grows until it fills the frame. Black; the clicking goes on; hard cut. The title.
import { KINGS, KING, SEAT, SIDE_SIGN, BOXES, THRONE } from '../layout.js';
import { CUES } from '../shots.js';
import { ease, lerp, lerp3, smooth, clamp } from '../util.js';
import { at, end, uRow, camLook, camPath, M1, kf, face, keys } from './core.js';
import { growAt, chestAt, dealSpot, LAST, DEAL } from './throws.js';
import { sizeAt } from './story.js';
import { hd } from './s1.js';

export const RANGE = [at('9-08'), Infinity];
export function apply(t, st, w) {
  // ---- after the wave: the pair lies flat on the cloth (the pile under it is scattered)
  if (t > CUES.wave && t < CUES.king + 1.6) for (const side of ['CN', 'US']) {
    const j = st.cards.jokers[side];
    if (j?.pos) j.pos = [j.pos[0], lerp(j.pos[1], 0.014, ease(t, CUES.wave, CUES.wave + 0.35)), j.pos[2]];
  }
  if (t < CUES.king) return;
  // ---- the giant: builds out of the storm, breathes, looks down the table; deals; grows
  const ck = st.cardking;
  ck.breathe = 0.6 * ease(t, at('10-01', 3.6), at('10-02'));
  ck.glow = t > CUES.flyup ? 0.55 : 0.9;                                  // fed, it glows from within; never a white blow-out
  ck.lean = keys(t, [[at('10-02', 0.3), 0], [at('10-02', 1.8), 0.3], [CUES.stare, 0.3], [CUES.flyup, 0.15], [CUES.grow, 0.05]]);
  if (st.cards.storm) st.cards.storm.n = Math.round(st.cards.storm.n * (1 - ease(t, at('10-01', 0.2), at('10-01', 2.8))));
  // the pair rises from the table into its face
  for (const side of ['CN', 'US']) st.cards.jokers[side] = { pos: [side === 'CN' ? -0.126 : 0.126, 0.014, 0], rot: [-Math.PI / 2, 0, 0], scale: 1.4, face: ease(t, at('10-01', 1.6), at('10-01', 3.9)) };
  st.cards.jokerGlow = lerp(0.25, 0.5, ease(t, at('10-01', 1.6), at('10-01', 4.0)));
  ck.faceGlow = ease(t, at('10-01', 1.0), at('10-01', 2.0)) * (1 - ease(t, at('10-01', 3.0), at('10-01', 3.9)));
  // the AI's gold is the only colour left: the face is the room's second light
  st.look.campTint = 0; st.look.monoTint = '#e9d2a2';
  const g = growAt(t);
  // the face is the room's second light: P2 just in front of it (the card king is posed here so the frame is this frame's)
  let fp = [0, 3.08 + 2.93 * (g - 1), -3.22];
  if (w.cardking?.pose && w.cardking.faceFrame) { w.cardking.pose(ck, t); const M = w.cardking.faceFrame(); const e = M.elements; fp = [e[12] + e[4] * -0.1 + e[8] * 0.25, e[13] + e[5] * -0.1 + e[9] * 0.25, e[14] + e[6] * -0.1 + e[10] * 0.25]; }
  const pk = ck.build / Math.max(1, g * 0.9);
  st.look.p2 = { pos: fp, col: [2.2 * pk, 1.55 * pk, 0.6 * pk], range: 5.5 * g + 3 };
  st.look.exposure = t > CUES.flyup ? 1.15 : 1.35;
  // ---- the kings: pinned back at first, staring up at it; then watching the dealt cards; then the choice; then the race
  for (const k of KINGS) {
    const s = st.kings[k.id];
    if (t < CUES.deal) { s.blown = Math.max(s.blown ?? 0, 0.6 * (1 - ease(t, at('10-01'), at('10-01', 2)))); s.look = [0, 2.6 * g, -4.0]; s.face = face('fear', { socket: 0.3 }); }
    else if (t < CUES.stare) { s.look = dealSpot(k.id); s.face = face('worry', { eyes: 'down', socket: 0.3 }); }
    else if (t < CUES.race) { s.look = dealSpot(k.id); s.face = face('worry', { eyes: 'down', mouth: 'flat', socket: 0.3 }); }
    else { s.face = face(((KINGS.indexOf(k) + Math.floor(t * 3)) % 2) ? 'shout' : 'glare', { mouth: 'scream', pupil: 0.9, socket: 0.3 }); s.look = chestAt(t); }
  }
  // the two at the head: they look at the card, at each other, at the card; the hand goes out; they play it
  if (t > CUES.stare && t < CUES.race + 0.5) for (const [id, other] of [['openai', 'deepseek'], ['deepseek', 'openai']]) {
    const s = st.kings[id];
    const u = (t - CUES.stare) / (CUES.slam - CUES.stare);
    s.look = u < 0.25 ? dealSpot(id) : u < 0.62 ? hd(other, t) : u < 0.8 ? dealSpot(id) : t < CUES.flyup ? dealSpot(id) : chestAt(t);
    s.face = face(u < 0.25 ? 'down' : u < 0.62 ? 'narrow' : u < 1 ? 'glare' : 'shock', { eyes: u < 0.25 ? 'down' : u < 0.62 ? 'narrow' : u < 1 ? 'glare' : 'wide', mouth: u < 1 ? 'grit' : 'o', pupil: u > 0.62 ? 0.95 : 0.5, socket: 0.32 });
    s.sweat = 1; s.lean = 0.1 + 0.1 * smooth(clamp((u - 0.6) * 3, 0, 1));
  }
  st.look.lampPow = 1 - 0.2 * ease(t, at('10-02'), at('10-03')) + 0.15 * ease(t, CUES.stare, CUES.slam);
  // the room gives way to it: the board fades as its crown rises past, the ceiling goes as it grows through
  st.set.board.show = 1 - ease(g, 1.15, 1.35);
  st.set.ceiling = 1 - ease(g, 1.7, 1.85);
  // ---- black: the picture goes, the clicking goes on (the sound department)
  if (t > CUES.black) st.look.fade = 1;
  if (t > CUES.credits) {
    st.look.fade = 1;
    st.titles = { zh: '王炸', en: 'JOKERS WILD', alpha: ease(t, at('12-01', 0.5), at('12-01', 1.3)), y: 0.44, credit: 'MakerJackie' };
  }
}

export const SHOTS = {
  // ---- the storm spirals up onto the throne and builds a seated giant; the pair rises to be its face
  '10-01': (t, st, w) => { const u = uRow(t, '10-01'); M1(w.camera, 0.55 - 0.25 * u, 0.2 * u); st.look.exposure = 1.5; },
  // ---- low, up at it: its head is above the giants'; it looks down the table
  '10-02': (t, st, w) => { const u = uRow(t, '10-02'); camLook(w.camera, [0, 0.45, 2.6 - 0.3 * u], [0, 2.7 + 0.4 * u, -3.6], 62); },
  // ---- it deals: a card skims to every king, face down, head to foot
  '10-03': (t, st, w) => { const u = uRow(t, '10-03'); camLook(w.camera, [0.0, 1.15 + 0.1 * u, 3.7 - 0.3 * u], [0, 1.1, -2.2], 50); },
  // ---- the threads let go of the kings' arms and fall onto the table; they look at their free hands
  // the threads slip off his wrist and fall; the card that worked him flies away to the throne; he looks at his free hand
  '10-04': (t, st, w) => {
    const u = uRow(t, '10-04'), id = 'google';
    camLook(w.camera, kf(id, 1.05, 0.62, -0.75), lerp3(kf(id, 0.42, 0.75, -0.3), kf(id, 0.3, 0.62, -0.2), smooth(u)), 46);
    for (const k of ['google', 'anthropic', 'xai']) { st.kings[k].look = kf(k, 0.4, 0.4, -0.25); st.kings[k].face = face('down', { eyes: 'down', mouth: 'o', socket: 0.3 }); }
    st.kings.google.armR = { target: lerp3(kf(id, 0.45, 0.55, -0.28), kf(id, 0.42, 0.62, -0.2), smooth(u)) }; st.kings.google.hand = { R: 'open' };
  },
  // ---- across the sea, face to face; the dealt cards in front of them; heartbeats
  '11-01': (t, st, w) => { const u = uRow(t, '11-01'); camLook(w.camera, [0, 0.62, -0.25 + 0.3 * u], [0, 0.5, -2.5], 48); },
  '11-02': (t, st, w) => { st.camAttach = { kind: 'eye', id: 'openai', side: 'L', dist: 0.24, fov: 40 }; camLook(w.camera, kf('openai', 0.4, 0.98, 0), hd('openai', t), 24); },
  '11-03': (t, st, w) => { st.camAttach = { kind: 'eye', id: 'deepseek', side: 'R', dist: 0.24, fov: 40 }; camLook(w.camera, kf('deepseek', 0.4, 0.98, 0), hd('deepseek', t), 24); },
  // ---- both hands go out, slowly, to the cards
  '11-04': (t, st, w) => camLook(w.camera, [0, 0.95, -0.6], [0, 0.15, -2.45], 54),
  // ---- straight down: two cards slammed at the same instant
  '11-05': (t, st, w) => camLook(w.camera, [0, 0.3, -1.25], [0, 0.04, -2.45], 64),
  // ---- the cards lift off, fly up the table and into the giant's chest; it glows, it grows
  '11-06': (t, st, w) => { const u = uRow(t, '11-06'); camLook(w.camera, [0, 0.45, -1.0 + 0.2 * u], [0, lerp(0.6, 2.6, smooth(u)), -3.4], 62); },
  // ---- everyone plays again, faster; every card flies up to the throne
  '11-07': (t, st, w) => { const u = uRow(t, '11-07'); camLook(w.camera, [0, 1.3, 2.6 - 0.4 * u], [0, 1.7, -3.0], 56); },
  // ---- pull back and up: the giant grows until it fills the frame; tiny kings still playing; the cards rise like sparks
  '11-08': (t, st, w) => {
    const T = at('11-08');
    camPath(w.camera, t, [[T, [0, 2.0, 6.5], [0, 2.4, -3.4], 44], [T + 6, [0, 3.9, 11.4], [0, 5.2, -4.0], 50]]);
    st.look.lampPow = 1.45; st.look.exposure = 1.3;
    st.look.campTint = 0;
  },
  '11-09': (t, st, w) => { camLook(w.camera, [0, 4.5, 12.6], [0, 5.6, -4.0], 46); st.look.fade = 1; },
  '12-01': (t, st, w) => { camLook(w.camera, [0, 4.5, 12.6], [0, 5.6, -4.0], 46); st.look.fade = 1; },
};
void KING; void SEAT; void SIDE_SIGN; void BOXES; void LAST; void DEAL; void sizeAt; void lerp3; void end;
