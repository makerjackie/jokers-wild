// JOKERS WILD — the world state at film time t (before any shot adjusts it): kings, props, set, cards, fx, look.
// Sequence modules (s1.js ...) place the camera and refine their own shots on top of this.
import * as THREE from 'three';
import { ROW, CUES } from '../shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT, CASES, JOKER_Y, EU, TABLE, FLOOR_Y } from '../layout.js';
import { AUTO, cancelJabs, LIGHT_ORDER, LIGHT_TIMES, windupPoint, followPoint, releasePoint } from '../plan.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { onTwos, clamp, smooth, ease, lerp, lerp3 } from '../util.js';
import { at, end, inRow, kf, off, sx, AUTO_BTN, kingRest, lerpPose, keys, ring, face } from './core.js';
import { allThrows, pileTop, bigRelease, FIRST, DOUBLE, O1, R1, BOMB, LLAMA } from './throws.js';
import { boardRows, BUSY } from './board.js';

// ---------------------------------------------------------------- impulses: what shakes the lamp and the table
let KICKS = null;
function kicks() {
  if (KICKS) return KICKS;
  const lamp = [], table = [];
  for (const th of allThrows()) {
    if (th.puppet || th.gun) continue;
    const s = th.scale ?? 1;
    lamp.push([th.land, 0.006 + 0.012 * Math.min(1, s / 4.6)]);
    if (s > 2) table.push([th.land, 0.0025 * s / 4.6]);
  }
  lamp.push([at('1-02', 0.1), 0.02], [at('3-03', 0.05), 0.05], [R1.t + R1.flight + 0.1, 0.02], [at('3-08', 0.6), 0.035], [at('3-11', 0.3), 0.04],
    [BOMB.blast, 0.06], [at('6-02', 0.2), 0.03], [at('6-02', 0.8), 0.03], [CUES.crack, 0.03], [CUES.bomb2, 0.13], [at('11-01', 0.05), 0.16]);
  table.push([at('1-03', 8.2), 0.004], [at('2-22', 0.1), 0.003], [at('2-25', 0.05), 0.006], [at('3-08', 1.0), 0.004]);
  // side to side: the first card sets it swinging hard (the opening's light sweeps the two rows), the big slams again
  const side = [[FIRST.t + FIRST.flight, 0.2], [at('2-09', 0.25), 0.12], [DOUBLE.t + DOUBLE.flight, 0.14], [at('3-03', 0.05), 0.06], [BOMB.blast, 0.08],
    [CUES.bomb2, 0.16], [at('11-01', 0.05), 0.2]];
  KICKS = { lamp, table, side };
  return KICKS;
}

// ---------------------------------------------------------------- throwing arms
let BY = null;
function throwsBy() {
  if (BY) return BY;
  BY = {};
  for (const th of allThrows()) (BY[th.who] ??= []).push(th);
  return BY;
}
const HOLDP = (id, s = 1) => kf(id, 0.32, 0.42 + 0.1 * Math.min(s, 3), 0);
// one throw's arm target (the card's centre for two-handed throws), or null if the throw isn't on now
function throwPose(t, th) {
  const id = th.who, s = th.scale ?? 1;
  const t0 = th.t - th.hold, w0 = th.t - (th.wind ?? th.hold * 0.6), stay = th.stay ?? th.t + 0.45;
  const ret = th.ret ?? 0.6;
  if (t < t0 - 0.25 || t > stay + ret) return null;
  const big = th.both;
  const H = big ? kf(id, 0.42, 0.75 + 0.05 * s, 0) : HOLDP(id);
  const W = big ? kf(id, 0.05, 1.25 + 0.06 * s, 0) : windupPoint(id);
  const R = big ? bigRelease(id) : th.from;
  const F = big ? kf(id, 0.75, 0.45, 0) : followPoint(id);
  const rest = big ? kf(id, 0.3, 0.15, 0) : kingRest(id, th.side ?? 'R');
  let p, lean = 0;
  if (t < t0) p = lerpPose(rest, H, (t - (t0 - 0.25)) / 0.25);
  else if (t < w0) p = H;
  else if (t < th.t - 0.12) { const u = (t - w0) / Math.max(0.05, th.t - 0.12 - w0); p = lerpPose(H, W, u); lean = -0.2 * smooth(u); }
  else if (t < th.t) { const u = (t - (th.t - 0.12)) / 0.12; p = lerp3(W, R, u * u); lean = lerp(-0.2, 0.14, u); }
  else if (t < th.t + 0.28) { const u = (t - th.t) / 0.28; p = lerpPose(R, F, u); lean = lerp(0.14, 0.08, u); }
  else if (t < stay) { p = F; lean = 0.08; }
  else { const u = (t - stay) / ret; p = lerpPose(F, rest, u); lean = lerp(0.08, 0, smooth(u)); }
  return { p, lean, big };
}
function applyThrowArms(t, id, s) {
  const list = throwsBy()[id] ?? [];
  let bestL = null, bestR = null;
  for (const th of list) {
    if (th.puppet) continue;
    if (t < th.t - th.hold - 0.3 || t > (th.stay ?? th.t + 0.45) + (th.ret ?? 0.6) + 0.05) continue;
    const r = throwPose(t, th); if (!r) continue;
    if (r.big || th.side !== 'L') bestR = { r, th };
    if (r.big || th.side === 'L') bestL = { r, th };
  }
  const k = KING[id], alongL = k.side === 'US' ? 1 : -1;     // the left hand lies toward +z for US kings, -z for CN
  for (const [b, side] of [[bestL, 'L'], [bestR, 'R']]) {
    if (!b) continue;
    const { r, th } = b;
    let p = r.p;
    if (r.big) { const hw = 0.16 + 0.05 * Math.sqrt(th.scale ?? 1); p = [p[0], p[1], p[2] + (side === 'L' ? alongL : -alongL) * hw]; }
    s['arm' + side] = { target: p, palm: r.big ? [0, 0, side === 'L' ? -alongL : alongL] : undefined };
    s.lean = (s.lean ?? 0) + r.lean;
    s.hand = { ...(s.hand ?? {}), [side]: 'hold' };
  }
}
// puppet arms (seq 7 on): wind up, fling, follow through, dangle
function puppetHand(t, id) {
  const th = (throwsBy()[id] ?? []).filter((x) => x.puppet);
  let i = 0; while (i < th.length && th[i].t < t) i++;
  const next = th[i], prev = th[i - 1];
  const W = windupPoint(id), R = releasePoint(id), F = followPoint(id);
  if (prev && t < prev.t + 0.2) return lerpPose(R, F, (t - prev.t) / 0.2);
  if (next && t > next.t - next.hold) {
    const u = (t - (next.t - next.hold)) / next.hold;
    if (u < 0.65) return lerpPose(F, W, u / 0.65);
    return lerp3(W, R, Math.pow((u - 0.65) / 0.35, 1.6));
  }
  return lerp3(F, W, 0.15 + 0.05 * Math.sin(t * 3));
}

// ---------------------------------------------------------------- kings
const PILE_LOOK = (id) => [0, 0.08, SEAT.Z[KING[id].seat] * 0.35];
function kingBase(t, id) {
  const k = KING[id], a = AUTO[id];
  const ph = KINGS.indexOf(k);
  const tt = onTwos(t);
  const s = { face: face('calm', { socket: 0.3 }), lean: 0.02 * Math.sin(tt * 0.9 + ph), look: PILE_LOOK(id) };
  // ---- before the first card: everyone stares across the table at his rival
  if (t < at('1-05')) s.look = off(id, -sx(id) * 3.2, 0.95, 0);
  if (t < at('6-10')) { applyThrowArms(t, id, s); return s; }
  const freeHand = a.pressHand, puppet = a.puppetHand;
  // ---- the AUTO press: reach to the cover, flip it, wind up, punch, release
  const btn = AUTO_BTN(id);
  if (t > a.cover - 0.35 && t < a.press + 0.35) {
    const quick = a.press - a.cover < 0.25;
    const cover = [btn[0], 0.12, btn[2] - 0.05], up = [btn[0] + sx(id) * 0.06, quick ? 0.24 : 0.42, btn[2]], down = [btn[0], 0.09, btn[2] + 0.02];
    let p;
    if (t < a.cover) p = lerpPose(kingRest(id, freeHand), cover, (t - (a.cover - 0.35)) / 0.35);
    else if (t < a.press - (quick ? 0.07 : 0.12)) p = lerpPose(cover, up, (t - a.cover) / Math.max(0.05, a.press - (quick ? 0.07 : 0.12) - a.cover));
    else if (t < a.press) { const kq = quick ? 0.07 : 0.12; p = lerp3(up, down, Math.pow((t - (a.press - kq)) / kq, 2)); }
    else p = lerpPose(down, kingRest(id, freeHand), (t - a.press - 0.15) / 0.2);
    s['arm' + freeHand] = { target: p };
    s.hand = { [freeHand]: 'fist' };
  }
  if (t > a.press) { s.face = face('smug', { socket: 0.3 }); s.lean = -0.12 * smooth((t - a.press) / 0.5); }
  const ahead = kf(id, 2.4, 0.95, 0), upv = kf(id, 0.25, 2.3, 0), pile = [0, 0.1, SEAT.Z[k.seat] * 0.4];
  s.look = keys(t, [[a.cover - 0.5, ahead], [a.cover - 0.25, btn], [a.press + 0.12, btn], [a.strings + 0.12, upv], [a.strings + 0.55, upv], [a.strings + 0.95, pile]]);
  if (t > a.strings && t < CUES.bomb2) s['arm' + puppet] = { target: puppetHand(t, id), pole: [sx(id) * 0.5, -0.6, 0] };
  return s;
}

// ---------------------------------------------------------------- the world
export function base(t, world) {
  const st = { set: {}, props: {}, kings: {}, cards: {}, fx: {}, look: { style: 'noir' }, titles: null };
  const party = at('7-10');
  for (const k of KINGS) st.kings[k.id] = kingBase(t, k.id);

  // ---- props: AUTO consoles, cigars, goblets
  const buttons = {}, cigars = {}, glasses = {};
  for (const k of KINGS) {
    const a = AUTO[k.id];
    buttons[k.id] = { cover: ease(t, a.cover, a.cover + 0.12), press: t > a.press && t < a.press + 0.2 ? 1 - (t - a.press) / 0.2 : 0, lit: t > a.press ? 1 : 0, cancel: 0, dead: t > at('8-05') ? 1 : 0 };
  }
  for (const tj of cancelJabs()) if (t >= tj && t < tj + 0.07) buttons.anthropic.cancel = 1 - (t - tj) / 0.07;
  const cig0 = at('7-09');
  if (t > cig0 && t < CUES.bomb2) for (let i = 0; i < LIGHT_ORDER.length; i++) {
    const id = LIGHT_ORDER[i], tl = cig0 + LIGHT_TIMES[i];
    cigars[id] = { hand: 'M', lit: t > tl ? 1 : 0, glow: t > tl ? 0.4 + 0.6 * Math.max(0, Math.sin((t - tl) * 2.1 + i)) : 0, ash: clamp((t - tl) / 12, 0, 0.6), ashDrop: id === 'google' ? at('8-01', 0.1) : null };
  }
  if (t > party - 0.3 && t < CUES.wave) for (const k of KINGS) {
    const a = AUTO[k.id], free = a.pressHand;
    if (k.id === 'anthropic' && t > at('8-06') - 0.3) { glasses[k.id] = { hand: null, wine: 0.5 }; continue; }
    glasses[k.id] = { hand: free, wine: 0.6 };
    const s0 = SIDE_SIGN[k.side], z = SEAT.Z[k.seat], ph = KINGS.indexOf(k) * 0.37;
    const frozen = t > CUES.crack;
    const tt = frozen ? CUES.crack : onTwos(t);
    const lift = smooth((tt - party + 0.3) / 0.4);
    const toast = Math.max(0, Math.sin((tt - party) * 2.4 + ph));
    const raised = [s0 * (1.12 - 0.22 * toast), 0.62 + 0.18 * toast, z + (k.side === 'US' ? 0.18 : -0.18)];
    st.kings[k.id]['arm' + free] = { target: lerp3(kingRest(k.id, free), raised, lift), palm: [0, 0, k.side === 'US' ? 1 : -1] };   // thumb up: the goblet stands
    st.kings[k.id].hand = { ...(st.kings[k.id].hand ?? {}), [free]: 'hold' };
    if (!frozen) st.kings[k.id].face = face(toast > 0.6 ? 'laugh' : 'proud', { socket: 0.28 });
    else st.kings[k.id].face = { eyes: 'wide', brows: 'flat', mouth: 'grin', socket: 0.28 };
    st.kings[k.id].look = lerp3(st.kings[k.id].look ?? kf(k.id, 2.4, 0.95, 0), kf(k.id, 3.2, 0.9 + 0.15 * toast, 0), smooth((tt - party + 0.3) / 0.5));
  }
  // ---- the alarm: faces drop, heads turn to the throne end
  if (t > at('8-05') && t < CUES.launch) for (const k of KINGS) {
    st.kings[k.id].face = face(t > at('8-07') ? 'fear' : 'shock', { socket: 0.45 });
    st.kings[k.id].look = t > at('8-07') ? [lerp(SIDE_SIGN[k.side] * -0.4, 0, 0.5), 2.0, -1.2] : [0, 0.6, -4.0];
  }
  if (t > at('8-06') - 0.25 && t < at('8-08')) {
    const btn = AUTO_BTN('anthropic'), key = [btn[0] - 0.02, 0.08, btn[2] + 0.13];
    let p = [key[0], 0.2, key[2]];
    for (const tj of cancelJabs()) { const d = t - tj; if (d > -0.12 && d < 0.1) p = lerp3([key[0], 0.2, key[2]], key, 1 - Math.abs(d) / 0.12); }
    Object.assign(st.kings.anthropic, { armL: { target: p }, look: [key[0], 0, key[2]], face: face('fear', { mouth: 'grit', socket: 0.4 }), lean: 0.18, hand: { L: 'point' } });
  }
  st.props = { buttons, cigars, glasses };
  // ---- Mistral: stands at the foot until Meta and Doubao fold him under the short leg (2-25/2-26); crushed there; squeezed out (11-01)
  st.props.eu = euAt(t);
  // ---- the cardboard crowd lies where it fell until the reverse angle (3-01) clears the table
  if (t > at('3-01')) st.props.crowd = { pop: 0, fall: 1 };

  // ---- seals: 3-02 the US seal comes down on the bridge (embargo), 3-10 lifts; 3-11 the CN seal (rejected); 8-07 both, caught
  st.props.seals = sealsAt(t, world);

  // ---- cards
  const throws = allThrows();
  const c7 = ROW['7-10'].cuts[6], glyph = ease(t, c7.t0 + 0.04, c7.t1 - 0.04);   // on camera, in the party's cut 7
  st.cards = { throws, glyph, jokers: {}, blast: { t0: BOMB.blast, power: 1.3, at: [0, 0, 0] }, specials: [], keyed: [] };
  o1Special(t, st);
  if (t > party - 0.5 && t < CUES.king + 4) {
    const n = Math.round(lerp(0, 420, ease(t, party, CUES.crack)) + lerp(0, 900, ease(t, at('8-05'), at('8-08', 1.5))));
    st.cards.storm = { n, t0: party - 0.5, spread: 7, seed: 31, speed: 0.8 + 0.6 * ease(t, at('8-05'), at('8-08')), part: ease(t, at('8-08'), at('8-08', 0.8)), wrap: [] };
    if (t > at('8-07', 0.35) && t < CUES.launch + 1) st.cards.storm.wrap = ['CN', 'US'].map((s) => ({ path: st.props.seals[s].chain, n: Math.round(120 * ease(t, at('8-07', 0.35), at('8-07', 1.2))) }));
  }
  // jokers: in their cases (bobbing once the glass cracks), then up beside the throne
  for (const side of ['CN', 'US']) {
    const fl = side === 'CN' ? at('8-03') : at('8-04');
    const bob = t > fl ? 0.05 * ease(t, fl, fl + 1.2) + 0.008 * Math.sin((t - fl) * 4) : 0;
    st.cards.jokers[side] = { bob };
    const r0 = at('8-08', 0.1);
    if (t > r0) {
      const u = ease(t, r0, r0 + 1.6), c = CASES[side];
      st.cards.jokers[side] = { pos: [c[0] * (1 - 0.15 * u), JOKER_Y + CARD.H / 2 + 0.05 + u * 1.15, c[2] + 0.1 * u], rot: [0, Math.sin(t * 1.3 + (side === 'CN' ? 0 : 2)) * 0.15, 0], scale: 1 + u * 0.6 };
    }
  }
  st.cards.jokerGlow = 0.12 + 0.9 * ease(t, at('8-03'), at('8-08', 1.0));

  // ---- set: lamp, table, cases, board, alarm, the dispenser, the tower, the kiln
  const K = kicks();
  // swing[0]: along the table (about x), swing[1]: side to side (about z): the pool of light runs from one row to the other
  // (the cord is 4.8 m now: a given angle moves the bulb far, so the kicks are small angles and the swing is slow)
  const side = 0.6 * ring(t, K.side, 0.26, 4.6), len = 0.6 * ring(t, K.lamp, 0.24, 4.4);
  const flick = inRow(t, '8-05') ? (Math.sin(t * 90) > 0.2 ? 0 : 1) * (1 - ease(t, at('8-05', 0.3), at('8-05', 0.6))) : 0;
  const lampOn = t < at('1-02', 0.04) ? 0 : t < at('1-02', 0.2) ? (Math.sin((t - at('1-02')) * 120) > 0 ? 1 : 0.25) : 1;
  st.set.lamp = { on: lampOn, swing: [len, side], flicker: flick };
  st.set.wobble = t > at('2-26', 1.4) && t < at('11-01') ? 0 : ring(t, K.table, 2.2, 0.7);
  st.set.cases = {
    CN: { crack: t > CUES.crack ? (t < at('8-03') ? 0.25 : lerp(0.25, 0.72, ease(t, at('8-03'), at('8-03', 1.8)))) : 0, shatter: ease(t, at('8-08'), at('8-08', 0.5)), light: t < at('1-03', 7) ? ease(t, at('1-03', 5.5), at('1-03', 7)) : 1 },
    US: { crack: t > at('8-04') ? lerp(0.12, 0.72, ease(t, at('8-04'), at('8-04', 1.3))) : 0, shatter: ease(t, at('8-08', 0.05), at('8-08', 0.55)), light: t < at('1-03', 7) ? ease(t, at('1-03', 5.8), at('1-03', 7.3)) : 1 },
  };
  st.set.board = { rows: boardRows(), lit: t < at('1-03', 9.5) ? ease(t, at('1-03', 8.8), at('1-03', 9.6)) : 1 };
  if (t > BUSY.t && t < at('4-01')) st.set.board.busy = { row: BUSY.row, u: ease(t, BUSY.t, BUSY.t + 0.35) };
  if (t > at('2-19', 0.9) && t < DOUBLE.t + DOUBLE.flight + 0.25) st.set.board.jam = { rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], k: ease(t, at('2-19', 0.9), at('2-19', 1.1)) };
  const aOn = t > at('8-05', 0.25) && t < CUES.pair ? 1 : 0;
  st.set.alarm = { on: aOn, angle: aOn ? (t - at('8-05', 0.25)) * 5 : 0 };
  if (aOn) { const sw = Math.max(0, Math.cos(st.set.alarm.angle)) ** 2; st.look.flashCol = '#ff1e0c'; st.look.alarmWash = 0.1 * sw; }
  dispenserAt(t, st);

  // ---- fx
  const strings = {};
  for (const k of KINGS) { const a = AUTO[k.id]; if (t > a.strings - 0.05 && t < at('8-08', 1.0)) strings[k.id] = { hand: a.puppetHand, k: ease(t, a.strings - 0.05, a.strings + 0.1) }; }
  st.fx.strings = strings;
  st.fx.smoke = Object.keys(cigars).filter((id) => cigars[id].lit);
  st.fx.flames = [];
  for (let i = 0; i < LIGHT_ORDER.length; i++) { const tl = cig0 + LIGHT_TIMES[i]; if (t > tl - 0.15 && t < tl + 0.3) st.fx.flames.push({ id: LIGHT_ORDER[i], k: Math.sin(clamp((t - tl + 0.15) / 0.45, 0, 1) * Math.PI) }); }
  st.fx.flash = t >= CUES.crack && t < CUES.crack + 0.12 ? 1 : 0;

  // ---- look: the camps drain out of the shadows from AUTO on; after the 王炸 only the AI's gold is left
  st.look.campTint = 1 - 0.55 * ease(t, CUES.auto, CUES.crack) - 0.45 * ease(t, CUES.alarm, CUES.bomb2);
  st.look.smoke = t > party ? 0.9 : t > at('6-02') ? 0.7 : 0.5;
  st.look.flash = st.fx.flash ? 1 - (t - CUES.crack) / 0.12 * 0.3 : 0;
  if (st.look.alarmWash) st.look.flash = Math.max(st.look.flash, st.look.alarmWash);
  if (flick) st.look.exposure = 0.55;
  if (t < at('1-02')) st.look.fade = 1;
  return st;
}


// ---------------------------------------------------------------- Mistral, the cardboard king
function euAt(t) {
  const LEG = TABLE.LEGS[TABLE.SHIM_LEG];
  const eu = { show: 1, fold: 0, at: [...EU.pos], rot: [0, Math.PI, 0] };
  const g0 = at('2-25', 0.95), f0 = at('2-26', 0.1), f1 = at('2-26', 1.1), sh = at('2-26', 1.4);
  if (t > g0) {
    eu.fold = ease(t, f0, f1);
    const under = [LEG[0], FLOOR_Y + 0.006, LEG[1]];
    const lifted = [LEG[0] + 0.45, FLOOR_Y + 0.32, LEG[1] + 0.4];
    eu.at = keys(t, [[g0, [...EU.pos]], [f0, lifted], [f1, [LEG[0] + 0.05, FLOOR_Y + 0.03, LEG[1] + 0.25]], [sh, under]]);
    eu.rot = keys(t, [[g0, [0, Math.PI, 0]], [f0, [-0.6, Math.PI * 0.75, 0]], [f1, [-Math.PI / 2, Math.PI * 0.6, 0]], [sh, [-Math.PI / 2, Math.PI * 0.5, 0]]]);
    eu.crushed = ease(t, sh, sh + 0.4) * 0.5 + 0.5 * ease(t, CUES.flatten, CUES.lastTwo);
    if (t > CUES.tilt) eu.slide = ease(t, CUES.tilt, CUES.tilt + 0.5);
  }
  return eu;
}

// ---------------------------------------------------------------- the seals
const sealDrop = (t, t0, t1) => ease(t, t0, t1) ** 1.8;
function sealsAt(t, world) {
  const out = {};
  const bp = (u) => (world?.set?.bridgePoint ? world.set.bridgePoint(u, new THREE.Vector3()) : null);
  // ---- the embargo (US): comes down slowly out of the dark onto the bridge, lifts again at 3-10
  if (t > at('3-02') && t < at('3-10', 1.2)) {
    const b = bp(0.5), home = b ? [b.x, 0, b.z] : [0, 0, 3.0];
    const drop = t < at('3-03') ? 0.55 * ease(t, at('3-02'), at('3-03')) : t < at('3-10') ? lerp(0.55, 1, ease(t, at('3-03'), at('3-03', 0.12))) : lerp(1, 0, ease(t, at('3-10', 0.05), at('3-10', 1.1)));
    out.US = { drop, spin: 0, at: home };
  }
  // ---- rejected (CN): slams down in front of the cart at the CN end of the bridge
  if (t > at('3-11', -0.4) && t < at('3-12', 1.5)) {
    const b = bp(0.82), home = b ? [b.x, 0, b.z] : [-0.4, 0, 3.0];
    out.CN = { drop: t < at('3-12') ? sealDrop(t, at('3-11', -0.25), at('3-11', 0.05)) : lerp(1, 0, ease(t, at('3-12', 0.3), at('3-12', 1.4))), spin: 0, at: home };
  }
  // ---- 8-07: both drop to hold down the storm; the cards catch their chains and twist them in mid-air
  const s0 = at('8-07'), caught = s0 + 0.5;
  if (t > s0 - 0.1 && t < CUES.king) for (const side of ['CN', 'US']) {
    const x = SIDE_SIGN[side] * 0.75, z = -0.7;
    const drop = ease(t, s0, caught);
    const y = lerp(6.2, 1.55, Math.pow(drop, 1.8)) + (t > caught ? 0.06 * Math.sin((t - caught) * 3) : 0);
    const twist = t > caught ? (t - caught) * 1.6 : 0;
    const chain = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10, r = 0.18 * Math.sin(u * Math.PI) * clamp(twist, 0, 1); chain.push([x + Math.cos(u * 9 + twist * 3) * r, lerp(7.5, y + 0.25, u), z + Math.sin(u * 9 + twist * 3) * r]); }
    out[side] = { drop, spin: twist * 1.4 * SIDE_SIGN[side], chain, pos: [x, y, z] };
  }
  return out;
}

// ---------------------------------------------------------------- the dispenser, the tower, the kiln
function dispenserAt(t, st) {
  const d = { show: 1, flowUS: 0, flowCN: 0, dent: 0, toll: 0, cart: { show: 0, u: 0, load: 0 }, blink: 0 };
  if (t > at('3-01') && t < at('4-01')) {
    d.flowUS = ease(t, at('3-01'), at('3-01', 0.4));
    d.flowCN = t < at('3-03') ? d.flowUS : 0;
    d.dent = t < at('3-03') ? 0 : t < at('3-10') ? 1 : 1 - ease(t, at('3-10', 0.3), at('3-10', 0.8));
    // the toll: the gate drops in, the boom comes down with its 25% plate; the cart pays, the boom lifts, the cart rolls
    d.toll = t < at('3-10', 0.45) ? 0 : t < at('3-10', 1.25) ? ease(t, at('3-10', 0.45), at('3-10', 1.05)) : lerp(1, 0.45, ease(t, at('3-10', 1.15), at('3-10', 1.75)));
    if (t > at('3-10', 0.3)) {
      const go = ease(t, at('3-10', 1.45), at('3-11', 0.2)), back = ease(t, at('3-11', 0.2), at('3-11', 1.4));
      d.cart = { show: 1, u: 0.15 + 0.63 * go * (1 - back) - 0.15 * back, load: 1, back: t > at('3-11', 0.2) };
    }
  }
  if (t > at('3-08') && t < at('3-08', 2.6)) d.blink = Math.max(0, Math.sin((t - at('3-08', 1.9)) * Math.PI / 0.25)) * (t > at('3-08', 1.9) && t < at('3-08', 2.15) ? 1 : 0);
  st.set.dispenser = d;
  st.set.tower = { fall: t < at('3-08') ? 0 : ease(t, at('3-08', 0.2), at('3-08', 2.8)) ** 0.85, show: t < at('3-10') ? 1 : 0 };   // the flood is cleared after the board cut (3-09): the bridge has to read
  const k0 = at('3-12', 0.2);
  st.set.kiln = { show: t > k0 ? 1 : 0, glow: t > k0 ? ease(t, k0, k0 + 0.6) * (1 - ease(t, CUES.bomb2, CUES.bomb2 + 0.4)) * (0.85 + 0.15 * Math.sin(t * 7.1) * Math.sin(t * 3.3)) : 0, bricks: ease(t, k0 + 0.4, k0 + 2.2) };
}

// ---------------------------------------------------------------- the giant o1 (3-05 .. 3-07): out of the press, held high, slammed, caved in by the tiny R1
function o1Special(t, st) {
  if (t < O1.out || t > at('4-04', 0.9)) return;
  const id = 'openai', yaw = -Math.PI / 2;
  const pileY = pileTop(O1.land) + 0.004;
  let pos, rot, scale;
  if (t < O1.grab) {
    // it slides out of the little press and keeps on coming (much bigger than the press)
    const u = ease(t, O1.out, O1.grab);
    pos = kf(id, 0.55, lerp(0.37, 0.81, u), 0.05); rot = [0, yaw, 0]; scale = lerp(0.6, 6.0, u);
  } else if (t < O1.slam) {
    const p = kf(id, 0.18, 2.0, 0);
    const u = ease(t, O1.grab, O1.grab + 0.5);
    pos = lerp3(kf(id, 0.55, 0.81, 0.05), p, u); rot = [0, yaw, 0]; scale = 6.0;
  } else {
    const u = ease(t, O1.slam, O1.land);
    pos = lerp3(kf(id, 0.18, 2.0, 0), [0.04, pileY, -0.05], u);
    rot = [lerp(0, -Math.PI / 2, u), yaw * (1 - u) - 0.08 * u, 0];
    scale = 6.0;
  }
  const cave = ease(t, R1.t + R1.flight + 0.05, R1.t + R1.flight + 0.35);
  st.cards.specials.push({ pos, rot, scale, cell: CELL.o1gold, back: CELL.backUS, fold: cave * 0.55, crumple: cave });
  st.cards.specGlow = t < O1.land ? 0.45 : 0.12;
}
void FIRST; void LLAMA; void end; void ROW;
