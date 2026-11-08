// JOKERS WILD v2 — the world state at film time t (before any shot adjusts it): kings, props, set, cards, fx, look.
// Sequence modules (s1.js ...) place the camera and refine their own shots on top of this.
import * as THREE from 'three';
import { ROW, CUES } from '../shots.js';
import { KINGS, KING, SIDE_SIGN, SEAT, BOXES, BOX, GIANTS, CITY, FLOOR_Y } from '../layout.js';
import { AUTO, cancelJabs, LIGHT_ORDER, LIGHT_TIMES, windupPoint, followPoint, releasePoint } from '../plan.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { MODELS } from '../models.js';
import { cityGrab } from '../props.js';
import { onTwos, clamp, smooth, ease, lerp, lerp3 } from '../util.js';
import { at, end, inRow, kf, off, sx, AUTO_BTN, kingRest, lerpPose, keys, ring, face } from './core.js';
import { allThrows, pileTop, bigRelease, FIRST, DOUBLE, O1, R1, GUN, CLOCK_N, LADDER, DEAL, LAST, growAt, chestAt } from './throws.js';
import { boardRows } from './board.js';
import { enterAt, sizeAt, sweatAt, riseAt, crownTiltAt, boxAt, leakReach, LOCKS, KEY_PRE, STICKERS, HEAD, SLAPPER, KEY_HAND, SLAP_HAND, BOXING, locksGone } from './story.js';

const V = new THREE.Vector3();
// ---------------------------------------------------------------- impulses: what shakes the lamp and the table
let KICKS = null;
function kicks() {
  if (KICKS) return KICKS;
  const lamp = [], table = [];
  for (const th of allThrows()) {
    if (th.puppet || th.gun || th.up || th.deal || th.still) continue;
    const s = th.scale ?? 1;
    lamp.push([th.land, 0.006 + 0.012 * Math.min(1, s / 4.6)]);
    if (s > 2) table.push([th.land, 0.0025 * s / 4.6]);
  }
  lamp.push([CUES.embargo + 0.05, 0.05], [R1.t + R1.flight + 0.1, 0.02], [CUES.avalanche + 0.6, 0.035], [CUES.mad + 0.2, 0.05], [CUES.mad + 1.6, 0.05],
    [CUES.burst, 0.05], [CUES.bomb, 0.13], [LAST.slam + 0.1, 0.03]);
  table.push([CUES.embargo + 0.1, 0.004], [CUES.avalanche + 1.0, 0.004], [CUES.mad + 0.5, 0.004], [CUES.bomb, 0.008], [LAST.slam + 0.1, 0.004]);
  const side = [[FIRST.t + FIRST.flight, 0.2], [at('2-10', 0.1), 0.12], [DOUBLE.t + DOUBLE.flight, 0.14], [CUES.embargo + 0.05, 0.06], [CUES.mad + 0.2, 0.12], [CUES.mad + 2.2, 0.1],
    [CUES.bomb, 0.16], [LAST.slam + 0.1, 0.06]];
  KICKS = { lamp, table, side };
  return KICKS;
}

// ---------------------------------------------------------------- throwing arms
let BY = null;
function throwsBy() {
  if (BY) return BY;
  BY = {};
  for (const th of allThrows()) if (th.who) (BY[th.who] ??= []).push(th);
  return BY;
}
const HOLDP = (id) => kf(id, 0.32, 0.42, 0);
function throwPose(t, th) {
  const id = th.who, s = th.scale ?? 1;
  const t0 = th.t - th.hold, w0 = th.t - (th.wind ?? th.hold * 0.6), stay = th.stay ?? th.t + 0.45;
  const ret = th.ret ?? 0.6;
  if (t < t0 - 0.25 || t > stay + ret) return null;
  const big = th.both;
  const H = big ? kf(id, 0.42, 0.75 + 0.05 * s, 0) : HOLDP(id);
  const W = big ? kf(id, 0.05, 1.25 + 0.06 * s, 0) : windupPoint(id);
  const R = big ? bigRelease(id) : th.slam ? th.from : th.from;
  const F = big ? kf(id, 0.75, 0.45, 0) : th.slam ? [th.to[0], 0.06, th.to[2]] : followPoint(id);
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
function applyThrowArms(t, id, s, skip) {
  const list = throwsBy()[id] ?? [];
  let bestL = null, bestR = null;
  for (const th of list) {
    if (th.puppet || th.still) continue;
    if (t < th.t - th.hold - 0.3 || t > (th.stay ?? th.t + 0.45) + (th.ret ?? 0.6) + 0.05) continue;
    const r = throwPose(t, th); if (!r) continue;
    if (r.big || th.side !== 'L') bestR = { r, th };
    if (r.big || th.side === 'L') bestL = { r, th };
  }
  const k = KING[id], alongL = k.side === 'US' ? 1 : -1;
  for (const [b, side] of [[bestL, 'L'], [bestR, 'R']]) {
    if (!b || skip === side) continue;
    const { r, th } = b;
    let p = r.p;
    if (r.big) { const hw = 0.16 + 0.05 * Math.sqrt(th.scale ?? 1); p = [p[0], p[1], p[2] + (side === 'L' ? alongL : -alongL) * hw]; }
    s['arm' + side] = { target: p, palm: r.big ? [0, 0, side === 'L' ? -alongL : alongL] : undefined };
    s.lean = (s.lean ?? 0) + r.lean;
    s.hand = { ...(s.hand ?? {}), [side]: 'hold' };
  }
}
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

// ---------------------------------------------------------------- where on the box (the set refines these)
export function lockPoint(side, i, world) {
  if (world?.set?.boxLock) return world.set.boxLock(side, i, V).toArray();
  const b = BOXES[side], s = SIDE_SIGN[side];
  return [b[0] - s * (BOX.W * 0.5 + 0.03), BOX.H * 0.8, b[2] + (i - 2) * 0.075];
}
export function stickerPoint(side, i, world) {
  if (world?.set?.boxStickerAt) return world.set.boxStickerAt(side, i, V).toArray();
  const b = BOXES[side];
  return [b[0] + ((i * 37) % 7 - 3) * 0.03, BOX.H + 0.01, b[2] + ((i * 53) % 9 - 4) * 0.035];
}
// the head king's key hand at the padlocks: in KEY_PRE before the spring, the key in it, turned, then away
function keyArm(t, id, world) {
  const side = KING[id].side, hand = KEY_HAND[id];
  for (let i = 0; i < 4; i++) {
    const ts = LOCKS[side][i];
    if (t < ts - KEY_PRE - 0.3 || t > ts + 0.55) continue;
    const L = lockPoint(side, i, world), near = [L[0] - SIDE_SIGN[side] * 0.07, L[1] + 0.14, L[2]];
    const rest = kingRest(id, hand), lift = [lerp(rest[0], near[0], 0.5), near[1] + 0.22, lerp(rest[2], near[2], 0.5)];
    let p;
    if (t < ts - KEY_PRE) p = lerpPose(rest, lift, (t - (ts - KEY_PRE - 0.3)) / 0.3);
    else if (t < ts - 0.35) p = lerpPose(lift, near, (t - (ts - KEY_PRE)) / (KEY_PRE - 0.35));
    else if (t < ts + 0.15) p = near;
    else p = lerpPose(near, rest, (t - ts - 0.15) / 0.4);
    return { hand, p, turn: clamp((t - (ts - 0.35)) / 0.3, 0, 1), look: L, aim: L, aimK: clamp((t - (ts - KEY_PRE + 0.1)) / 0.3, 0, 1) * (1 - clamp((t - ts - 0.15) / 0.2, 0, 1)) };
  }
  return null;
}
// the slapper's flat palm on the box: up, slap, away
function slapArm(t, id, world) {
  const side = KING[id].side, hand = SLAP_HAND[id];
  const list = STICKERS[side];
  for (let i = 0; i < list.length; i++) {
    const ts = list[i];
    if (t < ts - 0.42 || t > ts + 0.35) continue;
    const P = stickerPoint(side, i, world), up = [P[0] + SIDE_SIGN[side] * 0.06, P[1] + 0.2, P[2]], on = [P[0], P[1] + 0.03, P[2]];
    const rest = kingRest(id, hand);
    let p;
    if (t < ts - 0.12) p = lerpPose(rest, up, (t - (ts - 0.42)) / 0.3);
    else if (t < ts) p = lerp3(up, on, ((t - (ts - 0.12)) / 0.12) ** 2);
    else if (t < ts + 0.1) p = on;
    else p = lerpPose(on, rest, (t - ts - 0.1) / 0.25);
    return { hand, p, look: P };
  }
  return null;
}

// ---------------------------------------------------------------- kings
const PILE_LOOK = (id) => [0, 0.08, SEAT.Z[KING[id].seat] * 0.35];
function kingBase(t, id, world) {
  const k = KING[id], a = AUTO[id];
  const ph = KINGS.indexOf(k);
  const tt = onTwos(t);
  const s = { face: face('calm', { socket: 0.3 }), lean: 0.02 * Math.sin(tt * 0.9 + ph), look: PILE_LOOK(id),
    enter: enterAt(t, id), size: sizeAt(t, id), sweat: sweatAt(t, id), rise: riseAt(t, id), crownTilt: crownTiltAt(t, id) };
  // ---- Google dozes over his chips until the first card wakes him
  if (id === 'google' && t < CUES.code + 0.1) { s.slump = 0.06; s.head = { yaw: 0, pitch: 0.42, roll: 0.08 }; s.look = undefined; s.face = face('shut', { eyes: 'shut', mouth: 'flat', socket: 0.35 }); s.lean = 0.16 + 0.015 * Math.sin(t * 1.3); }
  // ---- madness: half-standing, leaning in
  if (s.rise > 0.01) s.lean = (s.lean ?? 0) + 0.12 * s.rise;
  const keyA = KEY_HAND[id] ? keyArm(t, id, world) : null;
  if (keyA) { const ts = LOCKS[k.side].find((x) => t > x - KEY_PRE - 0.3 && t < x + 0.55); const r = ts ? Math.sin(clamp((t - (ts - KEY_PRE - 0.3)) / (KEY_PRE + 0.85), 0, 1) * Math.PI) : 0; s.rise = Math.max(s.rise ?? 0, 0.85 * r); }
  const slapA = SLAP_HAND[id] ? slapArm(t, id, world) : null;
  const special = keyA ?? slapA;
  if (t < at('7-01') - 0.6 || !a) {
    applyThrowArms(t, id, s, special?.hand);
    if (special) {
      s['arm' + special.hand] = { target: special.p, palm: slapA ? [0, -1, 0] : undefined };
      s.hand = { ...(s.hand ?? {}), [special.hand]: keyA ? 'fist' : 'open' };
      s.look = special.look;
    }
    return s;
  }
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
  } else if (t < a.cover - 0.35) applyThrowArms(t, id, s);
  if (t > a.press) { s.face = face('smug', { socket: 0.3 }); s.lean = -0.12 * smooth((t - a.press) / 0.5); }
  const ahead = kf(id, 2.4, 0.95, 0), upv = kf(id, 0.25, 2.3, 0), pile = [0, 0.1, SEAT.Z[k.seat] * 0.4];
  if (t > a.cover - 0.6) s.look = keys(t, [[a.cover - 0.5, ahead], [a.cover - 0.25, btn], [a.press + 0.12, btn], [a.strings + 0.12, upv], [a.strings + 0.55, upv], [a.strings + 0.95, pile]]);
  // ---- strung: the puppet arm throws until the jokers launch, hangs in its threads, and is let go (10-04)
  if (t > a.strings && t < CUES.free + 0.6) {
    let p = t < CUES.launch ? puppetHand(t, id) : lerp3(puppetHand(CUES.launch, id), kf(id, 0.45, 0.75, 0), ease(t, CUES.launch, CUES.launch + 0.8));
    if (t > CUES.free) p = lerp3(p, kingRest(id, puppet), ease(t, CUES.free + 0.1, CUES.free + 0.6));
    s['arm' + puppet] = { target: p, pole: [sx(id) * 0.5, -0.6, 0] };
  }
  // ---- the last lock: the strung hand drifts to the box and turns it while he toasts (7-11 / 7-12)
  if (KEY_HAND[id]) {
    const side = k.side, ts = LOCKS[side][4];
    if (t > ts - 1.5 && t < ts + 0.7) {
      const L = lockPoint(side, 4, world), near = [L[0] - SIDE_SIGN[side] * 0.07, L[1] + 0.14, L[2]];
      const from = puppetHand(ts - 1.5, id);
      const p = t < ts - 0.3 ? lerpPose(from, near, (t - (ts - 1.5)) / 1.2) : t < ts + 0.2 ? near : lerpPose(near, puppetHand(ts + 0.7, id), (t - ts - 0.2) / 0.5);
      s['arm' + puppet] = { target: p, pole: [sx(id) * 0.5, -0.6, 0] };
      s.hand = { ...(s.hand ?? {}), [puppet]: 'fist' };
      s.rise = Math.max(s.rise ?? 0, 0.7 * Math.sin(clamp((t - (ts - 1.5)) / 2.2, 0, 1) * Math.PI));
    }
  }
  // ---- the final race: everyone plays again (their own hands)
  if (t > CUES.free + 0.6) applyThrowArms(t, id, s);
  return s;
}

// ---------------------------------------------------------------- the world
export function base(t, world) {
  const st = { set: {}, props: {}, kings: {}, cards: {}, fx: {}, look: { style: 'noir' }, titles: null };
  const party = CUES.party;
  for (const k of KINGS) st.kings[k.id] = kingBase(t, k.id, world);

  // ---- props: AUTO consoles, cigars, goblets, keys, clocks, chips, presses
  const buttons = {}, cigars = {}, glasses = {}, keysP = {}, clocks = {}, chips = {}, presses = {};
  for (const k of KINGS) {
    const a = AUTO[k.id];
    buttons[k.id] = { cover: ease(t, a.cover, a.cover + 0.12), press: t > a.press && t < a.press + 0.2 ? 1 - (t - a.press) / 0.2 : 0, lit: t > a.press ? 1 : 0, cancel: 0, dead: t > CUES.cancel ? 1 : 0 };
    chips[k.id] = { stack: chipStack(t, k.id) };
    const leak = Math.max(0, Math.min(1, leakReach(t, k.side) - pressRank(k.id)));
    presses[k.id] = { lever: 0, slide: 0, glow: leak * (0.7 + 0.3 * Math.sin(t * 9 + k.seat)) };
  }
  for (const tj of cancelJabs()) if (t >= tj && t < tj + 0.07) buttons.anthropic.cancel = 1 - (t - tj) / 0.07;
  for (const id of ['openai', 'deepseek']) {
    const a = keyArm(t, id, world);
    if (a) keysP[id] = { hand: a.hand, turn: a.turn, aim: a.aim, aimK: a.aimK };
    const ts = LOCKS[KING[id].side][4], puppet = AUTO[id].puppetHand;
    if (t > ts - 1.5 && t < ts + 0.6) { const L = lockPoint(KING[id].side, 4, world); keysP[id] = { hand: puppet, turn: clamp((t - (ts - 0.35)) / 0.3, 0, 1), aim: L, aimK: clamp((t - (ts - 0.7)) / 0.3, 0, 1) * (1 - clamp((t - ts - 0.15) / 0.2, 0, 1)) }; }
  }
  // the turn clocks: in front of each thrower of the ladder, counting down shorter and shorter
  for (const [row, id] of LADDER) if (t > at(row, -0.4) && t < end(row, 0.6)) clocks[id] = { show: ease(t, at(row, -0.4), at(row, -0.2)) * (1 - ease(t, end(row, 0.3), end(row, 0.6))), n: Math.max(0, CLOCK_N[id] - Math.floor((t - at(row)) * 1.0)), ring: 0 };
  for (const id of ['openai', 'deepseek']) if (t > at('2-21', -0.4) && t < end('2-22', 0.4)) clocks[id] = { show: 1, n: 1, ring: t > at('2-21', 0.3) ? 1 : 0 };
  const cig0 = at('7-09');
  if (t > cig0 && t < CUES.lookup + 0.4) for (let i = 0; i < LIGHT_ORDER.length; i++) {
    const id = LIGHT_ORDER[i], tl = cig0 + LIGHT_TIMES[i];
    cigars[id] = { hand: 'M', lit: t > tl ? 1 : 0, glow: t > tl ? 0.4 + 0.6 * Math.max(0, Math.sin((t - tl) * 2.1 + i)) : 0, ash: clamp((t - tl) / 12, 0, 0.6), ashDrop: id === 'google' ? CUES.freeze + 0.1 : null };
    if (t > CUES.lookup) cigars[id].hand = null;                                      // dropped from the mouth
  }
  if (t > party - 0.3 && t < CUES.lookup + 0.2) for (const k of KINGS) {
    const a = AUTO[k.id], free = a.pressHand;
    if (k.id === 'anthropic' && t > CUES.cancel - 0.3) { glasses[k.id] = { hand: null, wine: 0.5 }; continue; }
    glasses[k.id] = { hand: free, wine: 0.6 };
    const s0 = SIDE_SIGN[k.side], z = SEAT.Z[k.seat], ph = KINGS.indexOf(k) * 0.37;
    const frozen = t > CUES.burst;
    const tt = frozen ? CUES.burst : onTwos(t);
    const lift = smooth((tt - party + 0.3) / 0.4);
    const toast = Math.max(0, Math.sin((tt - party) * 2.4 + ph));
    const raised = [s0 * (1.12 - 0.22 * toast), 0.62 + 0.18 * toast, z + (k.side === 'US' ? 0.18 : -0.18)];
    st.kings[k.id]['arm' + free] = { target: lerp3(kingRest(k.id, free), raised, lift), palm: [0, 0, k.side === 'US' ? 1 : -1] };
    st.kings[k.id].hand = { ...(st.kings[k.id].hand ?? {}), [free]: 'hold' };
    if (!frozen) st.kings[k.id].face = face(toast > 0.6 ? 'laugh' : 'proud', { socket: 0.28 });
    else st.kings[k.id].face = { eyes: 'wide', brows: 'flat', mouth: 'grin', socket: 0.28 };
    st.kings[k.id].look = lerp3(st.kings[k.id].look ?? kf(k.id, 2.4, 0.95, 0), kf(k.id, 3.2, 0.9 + 0.15 * toast, 0), smooth((tt - party + 0.3) / 0.5));
  }
  // ---- the jokers rise (8-03 on): every head turns up to them; fear
  if (t > CUES.lookup - 0.2 && t < CUES.launch) for (const k of KINGS) {
    st.kings[k.id].face = face(t > CUES.cancel ? 'fear' : 'shock', { socket: 0.45 });
    st.kings[k.id].look = [BOXES[k.side][0] * 0.8, 1.6, BOXES[k.side][2]];
  }
  if (t > CUES.cancel - 0.25 && t < CUES.seals) {
    const btn = AUTO_BTN('anthropic'), key = [btn[0] - 0.02, 0.08, btn[2] + 0.13];
    let p = [key[0], 0.2, key[2]];
    for (const tj of cancelJabs()) { const d = t - tj; if (d > -0.12 && d < 0.1) p = lerp3([key[0], 0.2, key[2]], key, 1 - Math.abs(d) / 0.12); }
    Object.assign(st.kings.anthropic, { armL: { target: p }, look: [key[0], 0, key[2]], face: face('fear', { mouth: 'grit', socket: 0.4 }), lean: 0.18, hand: { ...(st.kings.anthropic.hand ?? {}), L: 'point' } });
  }
  st.props = { buttons, cigars, glasses, keys: keysP, clocks, chips, presses };
  hopperAt(t, st);
  st.props.seals = sealsAt(t, world);

  // ---- cards
  const throws = allThrows();
  st.cards = { throws, glyph: 0, jokers: {}, specials: [], keyed: [], highGlow: t > CUES.auto && t < CUES.burst ? 0.45 : t > CUES.free ? 0.6 : 0, purple: ease(t, party, party + 4.5), wave: { t0: CUES.wave + 0.05, speed: 3.2 },
    pileGone: ease(t, CUES.king + 0.3, CUES.king + 3.2), jokerGlow: jokerGlowAt(t) };
  o1Special(t, st);
  if (t > party + 1 && t < CUES.king + 4.5) {
    const n = Math.round(lerp(0, 260, ease(t, party + 1, CUES.burst)) + lerp(0, 900, ease(t, CUES.lookup, CUES.launch)));
    st.cards.storm = { n, t0: party + 1, spread: 7, seed: 31, speed: 0.8 + 0.6 * ease(t, CUES.lookup, CUES.launch), part: ease(t, CUES.rise, CUES.rise + 0.8), wrap: [] };
    if (t > CUES.seals + 0.35 && t < CUES.launch + 1) st.cards.storm.wrap = ['CN', 'US'].map((sd) => ({ path: st.props.seals[sd]?.chain ?? [[0, 7, 0], [0, 6, 0]], n: Math.round(120 * ease(t, CUES.seals + 0.35, CUES.seals + 1.2)) }));
  }
  jokersAt(t, st, world);

  // ---- set: lamp, table, boxes, giants, board, alarm, the dispenser, the tower, the kiln, the cloth
  const K = kicks();
  const sideSw = 0.6 * ring(t, K.side, 0.26, 4.6), len = 0.6 * ring(t, K.lamp, 0.24, 4.4);
  const mad = t > CUES.mad && t < CUES.auto ? 0.1 * Math.sin((t - CUES.mad) * 1.7) * smooth((t - CUES.mad) / 0.8) : 0;
  const flick = inRow(t, '8-05') ? (Math.sin(t * 90) > 0.2 ? 0 : 1) * (1 - ease(t, at('8-05', 0.3), at('8-05', 0.6))) : 0;
  st.set.lamp = { on: t < at('1-01', 1.0) ? 0 : t < at('1-02', 0.6) ? 0.8 * (Math.sin((t - 1) * 60) > -0.2 ? 1 : 0.3) : t < FIRST.t + FIRST.flight ? 0.8 : 1, swing: [len, sideSw + mad], flicker: flick };
  st.set.wobble = ring(t, K.table, 2.2, 0.7);
  st.set.boxes = { CN: boxAt(t, 'CN'), US: boxAt(t, 'US') };
  st.set.giants = giantsAt(t);
  st.set.board = { rows: boardRows(), lit: t < FIRST.t + FIRST.flight ? 0.35 : 1 };
  const aOn = t > at('8-05', 0.2) && t < CUES.pair ? 1 : 0;
  st.set.alarm = { on: aOn, angle: aOn ? (t - at('8-05', 0.2)) * 5 : 0 };
  if (aOn) { const sw = Math.max(0, Math.cos(st.set.alarm.angle)) ** 2; st.look.flashCol = '#ff1e0c'; st.look.alarmWash = 0.1 * sw; }
  if (t > end('6-03', 0.3)) st.set.clothHole = { u: 1 };
  dispenserAt(t, st);

  // ---- cardking
  if (t > CUES.king - 0.2) {
    const build = ease(t, CUES.king, CUES.king + 4.2);
    st.cardking = { show: 1, build, breathe: 0.6, grow: growAt(t), look: [0, 0.5, 1.5], lean: 0.15, glow: 1,
      absorb: throws.filter((th, i) => th.up && th.land <= t && (!th.who || th.who === 'openai' || th.who === 'deepseek' || i % 4 === 0)).map((th) => th.land) };
    if (t > CUES.deal - 0.6 && t < CUES.free + 0.6) {
      // both hands out over the head of the table; each deal saws k 0 -> 1 with the snap (0.4) on the throw's release
      const deals = throws.filter((x) => x.deal).sort((a, b) => a.t - b.t);
      const ph = (t - DEAL.t0) / DEAL.gap + 0.4, i = Math.floor(ph);
      const th = deals[Math.max(0, Math.min(deals.length - 1, i))];
      const k = i >= 0 && i < deals.length ? ph - i : 0;
      st.cardking.deal = { on: ease(t, CUES.deal - 0.6, CUES.deal - 0.1) * (1 - ease(t, CUES.free, CUES.free + 0.6)), k, target: th.to };
    }
    st.cardking.look = t < CUES.stare ? [0, 1.6, 1.8] : t < CUES.flyup ? [0, 1.5, -0.6] : [0, 1.8, 2.5];
  }

  // ---- fx
  const strings = {};
  for (const k of KINGS) {
    const a = AUTO[k.id]; if (!(t > a.strings - 0.35 && t < CUES.free + 1.6)) continue;
    const top = puppeteer(t, k.id), ph = KINGS.indexOf(k);
    strings[k.id] = { hand: a.puppetHand, top, k: ease(t, a.strings - 0.05, a.strings + 0.1), fall: ease(t, CUES.free + 0.05 + 0.1 * (ph % 5), CUES.free + 0.9 + 0.1 * (ph % 5)) };
    // the card that pulls his strings: it drops out of the dark over him at AUTO and hangs there, working him;
    // when the new king lets go (10-04) it flies off to the throne
    const yaw = k.side === 'CN' ? 0.55 : -0.55;                     // turned toward the foot (the M1 camera) and a little to the table
    if (t < CUES.free + 0.1) st.cards.keyed.push({ cell: CELL[`${k.id}${Math.max(0, MODELS[k.id].length - 1)}`], back: CELL.backBlack, scale: 1.9, keys: [[t, top, [-0.3, yaw, 0.04 * Math.sin(t * 2 + ph)]]] });
    else st.cards.keyed.push({ cell: CELL[`${k.id}${Math.max(0, MODELS[k.id].length - 1)}`], back: CELL.backBlack, scale: 1.9, keys: [[t, lerp3(top, chestAt(t), ease(t, CUES.free + 0.1, CUES.free + 1.0)), [0.25 + 2 * ease(t, CUES.free + 0.1, CUES.free + 1.0), yaw, 0]]] });
  }
  st.fx.strings = strings;
  st.fx.leaks = { CN: leakReach(t, 'CN'), US: leakReach(t, 'US') };
  if (t > FIRST.t + FIRST.flight - 0.02 && t < at('1-06', 2.5)) st.fx.ring = { t0: FIRST.t + FIRST.flight, at: [0.02, 0.04], speed: 2.2 };
  st.fx.smoke = Object.keys(cigars).filter((id) => cigars[id].lit && cigars[id].hand);
  st.fx.flames = [];
  for (let i = 0; i < LIGHT_ORDER.length; i++) { const tl = cig0 + LIGHT_TIMES[i]; if (t > tl - 0.15 && t < tl + 0.3) st.fx.flames.push({ id: LIGHT_ORDER[i], k: Math.sin(clamp((t - tl + 0.15) / 0.45, 0, 1) * Math.PI) }); }
  st.fx.flash = t >= CUES.burst && t < CUES.burst + 0.15 ? 1 : 0;

  // ---- look: the camps drain out of the shadows from AUTO on; after 王炸 only the AI's gold is left
  st.look.campTint = 1 - 0.55 * ease(t, CUES.auto, CUES.burst) - 0.45 * ease(t, CUES.lookup, CUES.bomb);
  st.look.smoke = t > party ? 0.9 : t > CUES.frenzy ? 0.7 : 0.5;
  st.look.flash = st.fx.flash ? 1 - (t - CUES.burst) / 0.15 * 0.3 : 0;
  if (st.look.alarmWash) st.look.flash = Math.max(st.look.flash, st.look.alarmWash);
  if (flick) st.look.exposure = 0.55;
  if (t < at('1-01', 1.0)) st.look.fade = 1;
  return st;
}

// ---------------------------------------------------------------- the card over each king that works his strings (after AUTO)
export function puppeteer(t, id) {
  const k = KING[id], a = AUTO[id], s = SIDE_SIGN[k.side], z = SEAT.Z[k.seat], ph = KINGS.indexOf(k);
  const hang = [s * 1.05, 1.62 + 0.05 * Math.sin(t * 1.3 + ph), z + 0.05 * Math.sin(t * 0.9 + ph * 2)];
  return lerp3([hang[0] * 0.6, 3.4, hang[2]], hang, ease(t, a.strings - 0.35, a.strings + 0.05));
}
// ---------------------------------------------------------------- the presses a side's leak reaches: nearest the box first
function pressRank(id) {
  const k = KING[id], bz = BOXES[k.side][2];
  return KINGS.filter((x) => x.side === k.side).sort((a, b) => Math.abs(SEAT.Z[a.seat] - bz) - Math.abs(SEAT.Z[b.seat] - bz)).findIndex((x) => x.id === id);
}
// ---------------------------------------------------------------- chips: how tall each king's stack is
function chipStack(t, id) {
  const k = KING[id];
  if (id === 'google') return t < CUES.code ? 1 : t < CUES.code + 0.4 ? lerp(1, 0.8, (t - CUES.code) / 0.4) : 0.8;
  let s = 0.55;
  if (k.side === 'CN') {
    if (t > CUES.starve - 0.3) s = lerp(0.55, 0.06, ease(t, CUES.starve - 0.3, CUES.starve + 1.6));
    if (t > CUES.kiln) s = lerp(s, 0.5, ease(t, CUES.kiln + 0.5, CUES.kiln + 2.2));
    if (id === 'deepseek' && t > at('4-09') && t < CUES.kiln) s = 0.03;
  } else if (id === 'openai') {
    if (t > CUES.boast - 1) s = lerp(0.55, 1.0, ease(t, CUES.giantUS, CUES.boast));
    if (t > CUES.boast) s = lerp(1.0, 0.25, ease(t, at('4-07', 0.1), at('4-07', 0.9)));
  }
  if (t > CUES.frenzy) s *= 1 - 0.7 * ease(t, CUES.frenzy, CUES.mad + 2);
  return s;
}
// ---------------------------------------------------------------- the hoppers of the frenzy (6-01 .. 6-04)
export const CITY_T = { reach: at('6-03', 0.0), peel0: at('6-03', 0.35), peel1: at('6-03', 1.15), carry: at('6-03', 1.15), into0: at('6-03', 1.4), into1: at('6-03', 1.8), sink: end('6-03', -0.05) };
export function cityHand(t) {
  const C = CITY_T, peel = ease(t, C.peel0, C.peel1);
  const g = cityGrab(peel, new THREE.Vector3()).toArray();
  const P = [0.9, 0.36, SEAT.Z[4] - 0.12];
  return t < C.carry ? g : lerp3(g, [P[0], P[1] + 0.22, P[2]], ease(t, C.carry, C.into0));
}
function hopperAt(t, st) {
  if (t > CUES.city - 0.3 && t < end('6-03', 0.4)) {
    const C = CITY_T, peel = ease(t, C.peel0, C.peel1);
    st.props.presses.meta = { ...st.props.presses.meta, hopper: { kind: 'city', show: 1, peel, grab: t > C.carry, at: t > C.carry ? cityHand(t) : undefined, into: ease(t, C.into0, C.into1), u: ease(t, C.into1, C.sink) },
      lever: Math.max(0, Math.sin(clamp((t - (C.sink - 0.4)) / 0.4, 0, 1) * Math.PI)) };
    st.set.clothHole = { u: peel };
  }
  const feeds = [['6-01', 'google', 'gold'], ['6-02', 'doubao', 'castle'], ['6-04', 'kimi', 'plant']];
  for (const [row, id, kind] of feeds) {
    if (t < at(row, -0.3) || t > end(row, 0.4)) continue;
    const u = ease(t, at(row, 0.5), end(row, -0.2));
    st.props.presses[id] = { ...st.props.presses[id], hopper: { kind, u, show: 1 }, lever: Math.max(0, Math.sin(clamp((t - end(row, -0.4)) / 0.4, 0, 1) * Math.PI)) };
  }
}
// ---------------------------------------------------------------- the jokers' glow
function jokerGlowAt(t) {
  if (t < CUES.joker1) return 0.2;
  if (t < CUES.title) return 0.55;
  if (t < CUES.rise) return 0.2;
  return 0.22 + 0.2 * ease(t, CUES.rise, CUES.rise + 1.0);
}
// ---------------------------------------------------------------- the jokers: born in the presses, boxed, risen; (seq 9-10 in s9/s10)
function jokersAt(t, st, world) {
  for (const side of ['CN', 'US']) {
    const id = side === 'US' ? 'openai' : 'deepseek', B = BOXING[side], born = side === 'US' ? CUES.joker1 : at('3-06', 0.05);
    const P = world?.props?.pressOut ? world.props.pressOut(id, V).toArray() : [SIDE_SIGN[side] * 0.9, 0.3, SEAT.Z[0] - 0.12];
    if (t < born) { st.cards.jokers[side] = { show: false }; continue; }
    if (t < B.grab) {
      // pushes itself out of the slot and stands up, swaying, alive
      const u = ease(t, born, born + (side === 'US' ? 1.8 : 0.9));
      st.cards.jokers[side] = { pos: [P[0], P[1] + 0.05 + 0.42 * u, P[2]], rot: [0, (side === 'US' ? -Math.PI / 2 : Math.PI / 2) + 0.15 * Math.sin(t * 2.3), 0.06 * Math.sin(t * 3.1)], scale: 0.6 + 0.4 * u };
      continue;
    }
    if (t < B.drop) { st.cards.jokers[side] = { attach: { kind: 'king', id, which: KEY_HAND[id], offset: [0, 0.1, 0.03] }, scale: 1 }; continue; }
    if (t < CUES.rise) { st.cards.jokers[side] = { bob: t > CUES.burst ? 0.02 * Math.sin((t - CUES.burst) * 9) : 0 }; continue; }
    // 8-03: up out of the open box, turning
    const u = ease(t, CUES.rise + 0.4, CUES.rise + 2.4), b = BOXES[side];
    st.cards.jokers[side] = { pos: [b[0], 0.15 + u * 1.15, b[2]], rot: [0, Math.sin(t * 1.3 + (side === 'CN' ? 0 : 2)) * 0.5, 0], scale: 1 + u * 0.8 };
  }
}
// ---------------------------------------------------------------- the giants
function giantsAt(t) {
  const out = {};
  for (const side of ['CN', 'US']) {
    const reveal = side === 'US' ? CUES.eyes + 0.8 : CUES.starve + 0.6;
    if (t < reveal - 0.5) { out[side] = { show: 0 }; continue; }
    const g = { show: ease(t, reveal - 0.5, reveal + 0.5), rise: 0.35, eyes: ease(t, reveal, reveal + 0.6), lean: 0.2, look: [0, 0.4, 0], fist: null, tangled: 0 };
    if (side === 'US') g.rise = lerp(0.35, 1, ease(t, CUES.giantUS, CUES.giantUS + 1.6));
    else g.rise = lerp(0.35, 1, ease(t, CUES.kiln, CUES.kiln + 1.8));
    // pressure: they lean in over their head king at every lock
    for (const ts of LOCKS[side]) if (t > ts - 1.2 && t < ts + 0.8) g.lean = Math.max(g.lean, 0.2 + 0.5 * Math.sin(clamp((t - ts + 1.2) / 2, 0, 1) * Math.PI));
    if (t > CUES.frenzy) g.lean = Math.max(g.lean, 0.55);
    if (t > CUES.auto) g.lean = lerp(g.lean, 0.2, ease(t, CUES.auto, CUES.auto + 2));
    // the embargo (US): the fist rises with the seal, swings down onto the bridge
    if (side === 'US' && t > CUES.giantUS && t < CUES.starve + 1.5) {
      g.fistK = ease(t, CUES.giantUS + 0.1, CUES.giantUS + 0.9) * (1 - ease(t, CUES.starve + 0.6, CUES.starve + 1.4));
      g.fist = keys(t, [[CUES.giantUS + 0.4, [2.7, 2.6, 1.0]], [CUES.embargo - 0.4, [1.7, 4.4, 2.2]], [CUES.embargo + 0.02, [0.9, 2.15, 2.95]], [CUES.embargo + 0.8, [0.95, 2.25, 2.95]], [CUES.starve + 1.2, [2.6, 2.6, 1.2]]]);
      g.look = [0.2, 0.2, 2.9];
    }
    // 8-06: both lunge at the jokers; caught in the storm
    if (t > CUES.seals - 0.3 && t < CUES.king + 2) {
      const s = SIDE_SIGN[side];
      g.fist = keys(t, [[CUES.seals - 0.3, [s * 2.6, 3.0, 0.2]], [CUES.seals + 0.4, [s * 0.9, 3.1, -1.1]]]);
      g.fistK = ease(t, CUES.seals - 0.6, CUES.seals - 0.2);
      g.tangled = ease(t, CUES.seals + 0.4, CUES.seals + 0.9);
      g.look = [s * 0.6, 1.6, -1.8];
    }
    // after 王炸 they shrink back into the dark (the new king is taller)
    if (t > CUES.wave) { g.rise = lerp(g.rise, 0.5, ease(t, CUES.wave, CUES.tower + 1)); g.eyes *= 1 - 0.6 * ease(t, CUES.wave, CUES.tower); g.fist = t < CUES.king ? g.fist : null; g.tangled = t < CUES.king ? g.tangled : 0; }
    out[side] = g;
  }
  return out;
}
// ---------------------------------------------------------------- the seals: on the giants' chains
function sealsAt(t, world) {
  const out = {};
  const giants = giantsAt(t);
  const chainFrom = (fist, end2) => { const c = []; for (let i = 0; i <= 10; i++) { const u = i / 10; c.push([lerp(fist[0], end2[0], u), lerp(fist[1], end2[1], u) - Math.sin(u * Math.PI) * 0.05, lerp(fist[2], end2[2], u)]); } return c; };
  const g = giants.US;
  if (g?.fist && t > CUES.giantUS && t < CUES.starve + 1.5) {
    const b = world?.set?.bridgePoint ? world.set.bridgePoint(0.5, V).toArray() : [0, 0.05, 2.95];
    const f = g.fist;
    // the seal hangs ~1.6 m below the fist; at the slam it lands flat on the bridge
    const slam = ease(t, CUES.embargo - 0.25, CUES.embargo + 0.02);
    const hang = [f[0] - 0.05, f[1] - 1.6, f[2] + 0.05];
    const pos = t < CUES.embargo + 0.02 ? lerp3(hang, [b[0], b[1] + 0.02, b[2]], slam ** 2) : t < CUES.embargo + 0.8 ? [b[0], b[1] + 0.02, b[2]] : lerp3([b[0], b[1] + 0.02, b[2]], hang, ease(t, CUES.embargo + 0.8, CUES.embargo + 1.6));
    out.US = { drop: 1, spin: t < CUES.embargo ? 0.4 * Math.sin(t * 2.2) * (1 - slam) : 0, chain: chainFrom(f, [pos[0], pos[1] + 0.88, pos[2]]), pos };
  }
  // 8-06: both seals swing at the jokers; the storm catches their chains and twists them in mid-air
  const s0 = CUES.seals, caught = s0 + 0.5;
  if (t > s0 - 0.3 && t < CUES.king + 2) for (const side of ['CN', 'US']) {
    const G2 = giants[side]; if (!G2?.fist) continue;
    const f = G2.fist, x = f[0], z = f[2];
    const drop = ease(t, s0, caught);
    const y = lerp(f[1] - 0.6, 1.5, Math.pow(drop, 1.8)) + (t > caught ? 0.06 * Math.sin((t - caught) * 3) : 0);
    const twist = t > caught ? (t - caught) * 1.6 : 0;
    const chain = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10, r = 0.18 * Math.sin(u * Math.PI) * clamp(twist, 0, 1); chain.push([x + Math.cos(u * 9 + twist * 3) * r, lerp(f[1], y + 0.25, u), lerp(z, z + 0.1, u) + Math.sin(u * 9 + twist * 3) * r]); }
    out[side] = { drop, spin: twist * 1.4 * SIDE_SIGN[side], chain, pos: [x, y, z + 0.1] };
  }
  return out;
}
// ---------------------------------------------------------------- the dispenser, the tower, the kiln
function dispenserAt(t, st) {
  const d = { show: 1, flowUS: 0, flowCN: 0, dent: 0, toll: 0, cart: { show: 0, u: 0, load: 0 }, blink: 0 };
  if (t > CUES.giantUS && t < CUES.frenzy) {
    d.flowUS = ease(t, CUES.giantUS, CUES.giantUS + 0.4);
    d.flowCN = t < CUES.embargo ? d.flowUS : 0;
    d.dent = t < CUES.embargo + 0.02 ? 0 : 1;
  }
  if (t > CUES.avalanche && t < CUES.avalanche + 2.6) d.blink = Math.max(0, Math.sin((t - CUES.avalanche - 1.9) * Math.PI / 0.25)) * (t > CUES.avalanche + 1.9 && t < CUES.avalanche + 2.15 ? 1 : 0);
  st.set.dispenser = d;
  st.set.tower = { fall: t < CUES.avalanche ? 0 : ease(t, CUES.avalanche + 0.2, CUES.avalanche + 2.8) ** 0.85, show: t < CUES.kiln + 0.2 ? 1 : 0 };
  const k0 = CUES.kiln + 0.4;
  st.set.kiln = { show: t > k0 ? 1 : 0, glow: t > k0 ? ease(t, k0, k0 + 0.6) * (1 - ease(t, CUES.bomb, CUES.bomb + 0.4)) * (0.85 + 0.15 * Math.sin(t * 7.1) * Math.sin(t * 3.3)) : 0, bricks: ease(t, k0 + 0.4, k0 + 2.0) };
}
// ---------------------------------------------------------------- the giant o1 (4-07 .. 4-10): out of the press, held high, slammed, caved in by R1
function o1Special(t, st) {
  if (t < O1.out || t > CUES.locks - 0.1) return;              // crushed; gone with the avalanche's flood
  const id = 'openai', yaw = -Math.PI / 2;
  const pileY = pileTop(O1.land) + 0.004;
  let pos, rot, scale;
  if (t < O1.grab) { const u = ease(t, O1.out, O1.grab); pos = kf(id, 0.55, lerp(0.37, 0.81, u), 0.05); rot = [0, yaw, 0]; scale = lerp(0.6, 6.0, u); }
  else if (t < O1.slam) { const u = ease(t, O1.grab, O1.grab + 0.5); pos = lerp3(kf(id, 0.55, 0.81, 0.05), kf(id, 0.18, 2.0, 0), u); rot = [0, yaw, 0]; scale = 6.0; }
  else { const u = ease(t, O1.slam, O1.land); pos = lerp3(kf(id, 0.18, 2.0, 0), [0.04, pileY, -0.05], u); rot = [lerp(0, -Math.PI / 2, u), yaw * (1 - u) - 0.08 * u, 0]; scale = 6.0; }
  const cave = ease(t, R1.t + R1.flight + 0.05, R1.t + R1.flight + 0.35);
  // after 王炸 it lies flipped with the rest (its back turns black-gold with the wave: the shader does it by radius)
  if (t > CUES.wave + 0.05) { const f = clamp((t - CUES.wave - 0.05) * 3.2 / 0.6, 0, 1); rot = [rot[0] + Math.PI * f, rot[1], rot[2]]; pos = [pos[0], pos[1] + Math.sin(f * Math.PI) * 0.4, pos[2]]; }
  st.cards.specials.push({ pos, rot, scale, cell: CELL.o1gold, back: CELL.backUS, fold: cave * 0.6, crumple: 0 });
  st.cards.specGlow = t < O1.land ? 0.45 : 0.12;
}
void ROW; void CARD; void GIANTS; void CITY; void FLOOR_Y; void off; void GUN; void chestAt; void HEAD; void SLAPPER; void locksGone; void DOUBLE;
