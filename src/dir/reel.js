// 《失控》 v4 (四王) — the state of the world at film time t. Kings at their screens, every card, the eye, the end.
// The shots (cams.js) then place the camera. Everything here is a pure function of t.
import { KINGS, KING, SEAT, SIDE_SIGN, ENTER_DX } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, easeOut, mulberry32, kick } from '../util.js';
import { at, face, kf, kingRest } from './core.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { flatQ, downQ, basisQ, slerpQ, mulQ, axisQ } from '../freecards.js';
import { screenFrame, screenPoint, slotUV, BTN } from '../screens.js';
import { ANT } from '../ant.js';
import * as S from './story.js';

const { FINAL, CARD_Y, AUTO, RED_T, STOP, CANCEL, HINTS, SLAM, DEAL, REACH, RISE, EYE, GIANT_END, ERR_T, ACCUSE, EYE_SCREEN, BLACK, CHAT_T, EGG } = S;
const IDS = KINGS.map((k) => k.id);
const sxOf = (id) => SIDE_SIGN[KING[id].side];
export const headAt = (id) => [sxOf(id) * 1.52, 0.66, SEAT.Z[KING[id].seat]];

// ---------------------------------------------------------------- presses on the screen
// per king: [{ t (contact), uv, pose, kind }] — taps on cards, the hint, the auto, the cancels, the last reach
let PRESS = null;
function presses() {
  if (PRESS) return PRESS;
  PRESS = {};
  const add = (id, t, uv, pose = 'point', kind = 'tap', hold = 0.08) => (PRESS[id] ??= []).push({ t, uv, pose, kind, hold });
  for (const p of S.plays()) {
    if (p.style === 'auto' || p.style === 'red') continue;
    add(p.who, p.tr - 0.04, slotUV(0, p.slot), 'point', p.style === 'giant' ? 'hard' : 'tap');
  }
  for (const id in S.PASS) for (const [t, slot] of S.PASS[id].taps) add(id, t, slotUV(0, slot), 'point', 'tap');
  add('diamond', S.REFUSE.hover, BTN.hint, 'point', 'hover', S.REFUSE.back - S.REFUSE.hover);
  for (const id in HINTS) for (const [t] of HINTS[id]) add(id, t, BTN.hint, 'point', 'hint');
  for (const id in AUTO) add(id, AUTO[id], BTN.auto, 'open', 'auto', 0.18);
  for (const id in CANCEL) CANCEL[id].forEach((t, i) => add(id, t, BTN.cancel, i < 2 ? 'point' : 'fist', 'cancel', 0.06));
  for (const id of FINAL) add(id, REACH[id] + 0.9, [0.36, 0.5], 'point', 'reach', 9);
  for (const id in PRESS) PRESS[id].sort((a, b) => a.t - b.t);
  return PRESS;
}
// the hand at t: hovering over the screen near a press, on the glass at it, else resting
function handFor(id, t) {
  const L = presses()[id] ?? [];
  const f = screenFrame(id);
  const fingers = [-f.n[0], -f.n[1], -f.n[2]];
  let best = null;
  for (const p of L) if (t > p.t - 0.5 && t < p.t + p.hold + 0.45) best = p;
  if (!best) {
    // between presses close together: hover
    const nx = L.find((p) => p.t >= t), pv = [...L].reverse().find((p) => p.t < t);
    if (nx && pv && nx.t - pv.t < 1.4) return { target: screenPoint(id, (nx.uv[0] + pv.uv[0]) / 2, (nx.uv[1] + pv.uv[1]) / 2, 0.16), pose: 'point', fingers };
    return null;
  }
  const up = best.kind === 'hard' || best.kind === 'auto' ? 0.24 : best.kind === 'cancel' ? 0.15 : 0.13;
  const hov = screenPoint(id, best.uv[0], best.uv[1], up), on = screenPoint(id, best.uv[0], best.uv[1], best.kind === 'hover' ? 0.13 : 0.085);
  let target;
  if (t < best.t - 0.12) target = lerp3(pathRest(id), hov, smooth((t - (best.t - 0.5)) / 0.38));
  else if (t < best.t) target = lerp3(hov, on, ((t - (best.t - 0.12)) / 0.12) ** 2);
  else if (t < best.t + best.hold) target = on;
  else target = lerp3(on, hov, smooth((t - best.t - best.hold) / 0.2));
  return { target, pose: best.pose, fingers, kind: best.kind };
}
const pathRest = (id) => { const f = screenFrame(id); return [f.c[0] + sxOf(id) * 0.18, 0.12, f.c[2] + 0.12 * (KING[id].side === 'CN' ? 1 : -1)]; };
const arm = (id, target, extra = {}) => ({ target, pole: [sxOf(id) * 0.4, -0.8, 0], ...extra });

// ---------------------------------------------------------------- kings
const oppOf = (id) => (id === 'heart' ? 'spade' : id === 'spade' ? 'heart' : id === 'club' ? 'diamond' : 'club');
function pointAt(id, target) {
  // the right arm out at the one he blames
  const h = headAt(id), d = [target[0] - h[0], 0, target[2] - h[2]], l = Math.hypot(d[0], d[2]) || 1;
  return [h[0] + (d[0] / l) * 0.62, h[1] - 0.02, h[2] + (d[2] / l) * 0.62];
}
const seatOf = (id) => [sxOf(id) * 1.62, 0.62, SEAT.Z[KING[id].seat]];
function kingsState(t, st) {
  const crushed = t >= SLAM;
  const top = S.topAt(t);
  for (const k of KINGS) {
    const id = k.id, sx = sxOf(id), z = SEAT.Z[k.seat], lead = FINAL.includes(id);
    const f = screenFrame(id);
    const K = st.kings[id] = { look: f.c, face: face('calm', { eyes: 'down' }), hand: { L: 'rest', R: 'rest' }, rise: 0, lean: 0.06, sweat: 0, slump: 0 };
    const seat = S.seated(id, t);
    if (crushed || seat <= 0.001) { K.enter = 0; continue; }
    if (seat < 1) K.enter = Math.max(0.002, seat);
    const auto = t >= (AUTO[id] ?? 1e9);
    let pointTo = null;
    // ---- before the Queen: bored, tapping twos and threes; the yawns (2-01, 2-02)
    if (t < CHAT_T) {
      K.slump = 0.03; K.face = face('calm', { eyes: 'down', brows: 'flat' });
      if (t > at('2-01', 0.6) && t < at('2-03') && Math.sin(t * 2 + k.seat * 2 + sx) > -0.1) { K.face = { eyes: 'closed', brows: 'raised', mouth: 'o' }; K.lean = -0.1; }
      if (id === 'heart' && t >= at('2-03', 0.2)) { K.face = face('smug'); K.slump = 0; K.lean = 0.12; }
    }
    // ---- the Queen: the blast throws them back; then all heads up, dead silence (2-07); Spades' smile goes (2-08)
    if (t >= CHAT_T && t < CUES.race) {
      const back = kick(t, CHAT_T + 0.05, 0.25, 1.6);
      K.lean = 0.05 - 0.28 * back; K.rise = 0.15 * back;
      K.look = [0, 0.04, 0.02];
      K.face = t < at('2-07', 0.3) ? face('shock') : { eyes: 'wide', brows: 'raised', mouth: 'slack' };
      if (t >= CUES.awe) { K.rise = 0.3; K.lean = 0.2; }
      if (id === 'heart') K.face = t < CUES.awe + 0.6 ? face('shock') : face('proud', { eyes: 'narrow' });
      if (id === 'spade' && t >= CUES.behind) { K.face = t < CUES.behind + 0.5 ? face('smug', { eyes: 'wide' }) : { eyes: 'wide', brows: 'worried', mouth: 'flat' }; }
    }
    // ---- the race, the two who drop out, the hint, the Ace duel: whoever just took #1 smirks across; the others sour
    if (t >= CUES.race && t < (AUTO[id] ?? 1e9) + 0.2) {
      const p = clamp((t - CUES.race) / (CUES.auto - CUES.race));
      K.rise = 0.15 + 0.3 * p; K.lean = 0.12 + 0.1 * p; K.sweat = p;
      K.face = face('angry', { eyes: 'down', brows: 'knit' });
      if (top?.who && t - top.t < 1.6) {
        if (top.who === id) { K.face = face('smug'); K.look = headAt(oppOf(id)); K.lean = 0.0; }
        else { K.face = face('sour', { eyes: 'side' }); K.look = headAt(top.who); }
      }
      // 要不起: stuck at his screen, sweating
      const ps = S.PASS[id];
      if (ps && t >= ps.t0 && t < ps.t1) { K.face = { eyes: 'down', brows: 'worried', mouth: 'flat' }; K.sweat = 1; K.look = f.c; K.rise = 0.1; K.lean = 0.02; }
      // out: the light goes, he sags, the chair takes him back into the dark
      const o = S.OUT[id];
      if (o && t >= o.t) { K.face = { eyes: 'down', brows: 'worried', mouth: 'slack' }; K.slump = 0.06 * ease(t, o.t, o.t + 0.8); K.rise = 0; K.lean = 0.2; K.look = f.c; K.sweat = 1; }
      // the others watch him go, then look at their own screens
      if (!o || t < o.t) for (const oid in S.OUT) { const oo = S.OUT[oid]; if (oid !== id && t > oo.t + 0.3 && t < oo.slide[1] + 1.4) { K.look = t < oo.slide[1] + 0.4 ? seatOf(oid) : f.c; K.face = face('worry'); K.sweat = 1; } }
      // Spades' hint: the Ace that wasn't in his hand; the grin
      if (id === 'spade' && t >= S.HINT_CARD.spade && t < CUES.boardSA + 1.2) { K.face = face('proud', { mouth: 'grin' }); K.look = t < CUES.boardSA ? f.c : headAt('heart'); }
      if (id === 'heart' && t >= CUES.hintH && t < S.HINT_CARD.heart) { K.look = headAt('spade'); K.face = face('sour', { eyes: 'side' }); }
      // Diamonds won't press it: his hand over HINT, then back; jaw set
      if (id === 'diamond' && t >= CUES.refuse && t < S.OUT.diamond.t) { K.face = face('angry', { eyes: 'down', brows: 'knit', mouth: 'grit' }); K.look = f.c; K.sweat = 1; K.rise = 0.15; }
      if (lead && t >= CUES.duel) { K.rise = 0.45; K.sweat = 1; if (!(top?.who === id && t - top.t < 0.6)) K.face = face('angry', { mouth: 'grit', eyes: 'down' }); K.look = f.c; }
    }
    // ---- auto: he leans back, the screen plays itself; he laughs
    if (auto && t < RED_T && t > AUTO[id] + 0.2) {
      const lb = ease(t, AUTO[id] + 0.3, AUTO[id] + 1.1);
      K.rise = lerp(0.4, 0, lb); K.lean = lerp(0.15, -0.16, lb); K.sweat = 0.5 * (1 - lb);
      K.face = Math.sin(t * 2.3 + z + sx) > 0.2 ? face('laugh') : face('proud', { mouth: 'grin' });
      K.look = Math.sin(t * 0.7 + z + sx) > 0 ? [0, 0.2, 0] : f.c;
    }
    // ---- past the Ace: the smile freezes; the dead cancel; 系统异常; they blame each other; the storm
    if (lead && t >= RED_T && t < STOP) {
      K.look = f.c; K.rise = 0.3; K.lean = 0.1; K.sweat = 0.6;
      K.face = t < CUES.freeze + (id === 'heart' ? 0.7 : 1.8) ? face('proud', { mouth: 'grin', eyes: 'wide' }) : face('worry');
      if (t > CUES.cancel) { K.face = face('fear'); K.rise = 0.4; K.sweat = 1; }
      if (t >= ACCUSE) {
        const u = ease(t, ACCUSE, ACCUSE + 0.35);
        K.rise = lerp(0.4, 1, u); K.lean = lerp(0.1, -0.42, u);
        K.look = headAt(oppOf(id)); pointTo = pointAt(id, headAt(oppOf(id)));
        K.face = Math.sin(t * 9 + sx) > -0.3 ? face('shout') : face('angry');
      }
      if (t >= CUES.blizzard) { K.face = face('shout', { eyes: 'shut', mouth: 'grit' }); K.lean = 0.2; K.rise = 0.6; pointTo = null; K.look = f.c; }
    }
    // ---- the stop, the rise, the eye: they look up
    if (t >= STOP && t < CUES.deal) {
      K.rise = lerp(0.6, 0.1, ease(t, STOP + 0.5, STOP + 3)); K.lean = lerp(0.15, -0.14, ease(t, STOP + 1, STOP + 3)); K.sweat = 1;
      K.look = t < CUES.rise ? [0, 0.3, 0] : [sx * 0.15, lerp(1.0, 2.6, ease(t, CUES.rise, CUES.eye + 2)), -0.1];
      K.face = t < CUES.rise ? { eyes: 'blank', brows: 'raised', mouth: 'slack' } : t < CUES.eye ? face('fear') : { eyes: 'up', brows: 'raised', mouth: 'slack' };
    }
    // ---- the deal: the screen lights; they look; they smile; they reach; they never look up
    if (t >= CUES.deal) {
      K.look = t < CUES.deal + 0.5 ? [sx * 0.15, 2.4, -0.1] : f.c; K.lean = 0.1; K.rise = 0.15; K.sweat = 0.6;
      K.face = t < CUES.smile ? face('worry', { eyes: 'down' }) : t < CUES.smile + 1.2 ? { eyes: 'down', brows: 'flat', mouth: 'smirk' } : { eyes: 'narrow', brows: 'arch', mouth: 'grin' };
      if (t > CUES.shadow) K.face = { eyes: 'narrow', brows: 'arch', mouth: 'grin' };
    }
    // ---- the arm
    const h = handFor(id, t);
    if (pointTo) { K.armR = arm(id, pointTo); K.hand.R = 'point'; }
    else if (h && !(auto && t < CUES.cancel && h.kind !== 'auto')) { K.armR = arm(id, h.target, { fingers: h.fingers }); K.hand.R = h.pose; }
    else K.hand.R = 'rest';
  }
}

// ---------------------------------------------------------------- screens
// his hand: what he holds now (cells), by phase
const RK = (id, rs) => rs.map((r) => S.card(id, r).face);
function handOf(id, t) {
  if (t < CHAT_T) return RK(id, ['2', '3', '4', '3', '5']);
  if (t < CUES.race) return RK(id, id === 'heart' ? ['J', '9', '8', '6', '4'] : ['7', '6', '5', '4', '3']);
  if (id === 'club') return RK(id, ['10', '9', '8', '7', '6']);
  if (id === 'diamond') return RK(id, ['K', 'Q', 'J', '10', '9']);
  if (t < (AUTO[id] ?? 1e9)) {
    const base = RK(id, ['K', 'Q', 'J', '10', '9']);
    if (t >= (S.HINT_CARD[id] ?? 1e9)) base.push(S.card(id, 'A').face);
    return base;
  }
  return RK(id, t < RED_T ? ['A', 'A', 'A', 'A', 'A'] : ['14', '21', '99', '∞', '99']);
}
function screensState(t) {
  const out = {};
  const P = S.plays();
  for (const k of KINGS) {
    const id = k.id, lead = FINAL.includes(id);
    if (t >= BLACK) continue;
    const s = { on: 1, hand: handOf(id, t), hidden: 6, red: lead ? [1, 3, 4] : [], flipped: 0, hi: -1, tap: -1, press: null, auto: t >= (AUTO[id] ?? 1e9) ? 1 : 0, deal: null };
    if (lead && t >= RED_T) s.flipped = Math.min(6, Math.floor((t - RED_T) * 2) + 1);
    const ps = S.PASS[id];
    if (ps && t >= ps.t0 && t < ps.t1) s.pass = 1;
    for (const [pt, slot] of ps?.taps ?? []) if (t > pt && t < pt + 0.3) s.shake = slot;
    const o = S.OUT[id];
    if (o && t >= o.t) { s.out = Math.round(clamp((t - o.t) / 0.3) * 10) / 10; s.pass = 0; }
    if (lead && t >= ERR_T && t < EYE_SCREEN) s.error = 1;
    if (lead && t >= EYE_SCREEN) s.eye = Math.round(clamp((t - EYE_SCREEN) / 0.4) * 10) / 10;
    for (const [ht, slot] of HINTS[id] ?? []) if (t > ht && t < ht + 0.75) s.hi = slot;
    if (S.HINT_CARD[id] && t > S.HINT_CARD[id] && t < S.HINT_CARD[id] + 0.9) s.hi = 5;
    for (const p of P) if (p.who === id && p.style !== 'auto' && p.style !== 'red' && t > p.tr - 0.05 && t < p.tr + 0.4) s.tap = p.slot;
    const h = handFor(id, t);
    if (h && h.kind && t > (presses()[id]?.find((p) => Math.abs(p.t - t) < 0.3)?.t ?? 1e9) - 0.02) s.press = h.kind === 'hint' || h.kind === 'auto' || h.kind === 'cancel' ? h.kind : null;
    if (t >= STOP) { s.auto = 0; s.eye = 0; s.error = 0; s.on = t < CUES.deal || !lead ? 0.0001 : 1; }
    if (t >= DEAL) { s.deal = CELL.num1; s.hand = []; s.hidden = 0; s.red = []; }
    if (t >= STOP && t < DEAL) { s.hand = []; s.hidden = 0; s.red = []; }
    out[id] = s;
  }
  return out;
}

// ---------------------------------------------------------------- cards
// ChatGPT's shockwave: every card before it is blown off the table
function blastCard(d, t) {
  const s = t - CHAT_T, r = mulberry32(d.i * 17 + 3);
  const p0 = d.rest.pos;
  let dx = p0[0], dz = p0[2] - 0.02; const l = Math.hypot(dx, dz);
  if (l < 0.03) { const a = r() * 6.28; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; }
  const v = 0.95 + 0.8 * r(), kd = 0.6, dist = (v / kd) * (1 - Math.exp(-kd * s));
  const x = p0[0] + dx * dist, z = p0[2] + dz * dist;
  const onTable = Math.abs(x) < 1.18 && Math.abs(z) < 3.2;
  const lift = (0.04 + 0.14 * r()) * Math.sin(Math.min(Math.PI, s * 4));
  const fall = onTable ? 0 : 3.5 * Math.max(0, s - 0.2) ** 2;
  const q = mulQ(d.rest.q, axisQ([dz, 0.3, -dx], s * (9 + 8 * r())));
  const y = p0[1] + lift - fall;
  return { pos: [x, Math.max(onTable ? CARD_Y : -2, y), z], q, gone: s > 2.4 || y < -0.9 };
}
// a card out of the screen: through the glass, up, over to its rest
function screenFlight(p, t, rest) {
  const f = screenFrame(p.who);
  const [u0, v0] = slotUV(0, p.slot);
  const from = screenPoint(p.who, u0, v0, 0.01);
  const qs = basisQ(f.n, f.up);
  const emerge = 0.14, dur = p.t - p.tr;
  const s = t - p.tr;
  if (s < emerge) { const e = s / emerge; return { pos: [from[0] + f.n[0] * 0.06 * e, from[1] + f.n[1] * 0.06 * e, from[2] + f.n[2] * 0.06 * e], q: qs, scale: (p.scale ?? 1) * (0.35 + 0.65 * e) }; }
  const u = clamp((s - emerge) / (dur - emerge)), e = u * (1.3 - 0.3 * u);
  const a = [from[0] + f.n[0] * 0.06, from[1] + f.n[1] * 0.06, from[2] + f.n[2] * 0.06];
  const arcH = p.style === 'giant' ? 0.0 : (p.style === 'auto' || p.style === 'red' ? 0.35 : 0.25) + 0.15 * (p.i % 3) / 2;
  const pos = [lerp(a[0], rest.pos[0], e), lerp(a[1], rest.pos[1], e) + Math.sin(Math.PI * u) * arcH, lerp(a[2], rest.pos[2], e)];
  const spin = (1 - u) * 1.4 * (p.i % 2 ? 1 : -1);
  return { pos, q: mulQ(slerpQ(qs, rest.q, smooth(u)), axisQ([0, 0, 1], spin)), scale: p.scale ?? 1 };
}
function chatFlight(p, t, rest) {
  // ChatGPT: out of OpenAI's screen, up over the middle of the table, hangs, then slaps down
  const f = screenFrame(p.who), from = screenPoint(p.who, 0.3, 0.3, 0.01), qs = basisQ(f.n, f.up);
  const top = [0.05, 0.42, 0.02], hang = p.t - 0.28;
  if (t < hang) { const e = smooth((t - p.tr) / (hang - p.tr)); return { pos: [lerp(from[0], top[0], e), lerp(from[1], top[1], Math.sqrt(e)), lerp(from[2], top[2], e)], q: slerpQ(qs, rest.q, e), scale: lerp(0.5, 1.15, e) }; }
  const u = clamp((t - hang) / 0.28);
  return { pos: lerp3(top, rest.pos, u * u * u), q: rest.q, scale: lerp(1.15, 1, u) };
}
function giantFlight(p, t, rest) {
  // GPT-4.5: rises out of OpenAI's screen, swells overhead, comes down on the pile
  const f = screenFrame(p.who), from = screenPoint(p.who, 0.3, 0.3, 0.01);
  const qs = basisQ(f.n, f.up), up = p.tr + 0.55;
  if (t < up) { const e = smooth((t - p.tr) / 0.55); return { pos: [from[0] - sxOf(p.who) * 0.25 * e, from[1] + 0.85 * e, from[2]], q: slerpQ(qs, basisQ([-sxOf(p.who), 0.3, 0], [0, 1, 0]), e), scale: lerp(0.4, p.scale, e) }; }
  const u = clamp((t - up) / (p.t - up)), e = u * u;
  const a = [from[0] - sxOf(p.who) * 0.25, from[1] + 0.85, from[2]];
  return { pos: lerp3(a, rest.pos, e), q: slerpQ(basisQ([-sxOf(p.who), 0.3, 0], [0, 1, 0]), rest.q, smooth(u)), scale: p.scale };
}
function riseFrom(stood, t0, t, seed) {
  const a0 = Math.atan2(stood.pos[2] - RISE.axis[1], stood.pos[0] - RISE.axis[0]), r0 = Math.hypot(stood.pos[0] - RISE.axis[0], stood.pos[2] - RISE.axis[1]);
  const s = t - t0;
  if (s <= 0) return stood;
  const y = stood.pos[1] + 1.4 * s * s + 0.2 * s, ang = a0 + (1.2 + seed) * s * s * 0.9 + s * 0.8;
  const r = lerp(r0, 0.75 + 0.9 * seed, smooth(s / 1.4)) + 0.09 * Math.max(0, y - 2.8);
  const fl = s * (5 + seed * 4);
  const q = mulQ(basisQ([Math.cos(ang), 0.2, Math.sin(ang)], [0, 1, 0]), axisQ([0, 1, 0], Math.sin(fl) * 0.8));
  return { pos: [RISE.axis[0] + Math.cos(ang) * r, y, RISE.axis[1] + Math.sin(ang) * r], q: slerpQ(stood.q, q, smooth(s / 0.5)) };
}
function eyeCards(t, out) {
  if (t < EYE.open0 - 1.6 || t >= BLACK) return;
  const open = smooth((t - EYE.open0) / (EYE.open1 - EYE.open0));
  const gather = (s, i) => clamp((t - (EYE.open0 - 1.6 + (i % 37) * 0.025)) / 1.2);
  const look = 0.25 * Math.sin((t - EYE.open1) * 0.5) * clamp((t - EYE.open1) / 2);
  S.eyeSlots().forEach((s, i) => {
    const r = mulberry32(i * 13 + 5), g = smooth(gather(s, i));
    if (g <= 0) return;
    const zOpen = s.kind === 'white' ? Math.sign(s.z) * Math.max(Math.abs(s.z) * open, 0.02) : s.z * (0.2 + 0.8 * open);
    const shift = s.kind === 'white' ? 0 : look;
    const K = 1.7, slot = [EYE.c[0] + (s.x + shift) * K, EYE.c[1] + (s.kind === 'pupil' ? -0.05 : s.kind === 'iris' ? 0 : 0.05), EYE.c[2] + zOpen * K];
    const from = [RISE.axis[0] + (r() - 0.5) * 3, 6 + r() * 2, RISE.axis[1] + (r() - 0.5) * 3];
    const pos = lerp3(from, slot, g);
    const q = basisQ([0, -1, 0], [Math.cos(s.yaw), 0, Math.sin(s.yaw)]);
    const visible = s.kind !== 'white' || Math.abs(s.z) <= s.lid * Math.max(0.05, open) + 0.01;
    if (!visible) return;
    const cell = s.kind === 'pupil' ? CELL.backBlack : s.kind === 'iris' ? CELL[`glyph${i % 16}`] : CELL.blank;
    out.push({ pos, q, scale: (s.kind === 'white' ? 2.3 : 1.9) * 1.7, face: cell, back: CELL.backBlack, glyph: 0, writhe: s.kind === 'iris' ? 0.5 : 0, glow: s.kind === 'pupil' ? 0 : s.kind === 'iris' ? 0.9 : 0.55 });
  });
}
function cardsState(t, st) {
  const out = st.free;
  const { D } = S.heap();
  // ---- the heap (until it rises)
  const liftOf = (d) => RISE.t0 + (RISE.t1 - RISE.t0) * clamp(1 - d.rest.pos[1] / 0.9) ** 1.2 + (d.i % 7) * 0.03;
  for (const d of D) {
    if (d.t > t) continue;
    const base = { face: d.face, back: d.back, scale: d.scale, glyph: d.glyph ?? 0, gcell: d.gcell ?? CELL.glyph0, writhe: d.writhe ?? 0, glow: d.red ? 0.35 : 0 };
    let pose = { pos: d.rest.pos, q: d.rest.q };
    if (d.blown && t >= CHAT_T) { const b = blastCard(d, t); if (b.gone) continue; pose = b; }
    if (d.play?.chat) base.glow = 0.3 * ease(t, d.t + 0.05, d.t + 0.5) * (1 - ease(t, at('2-08'), at('3-01', 1.0)));
    if (t > STOP) {
      const l = liftOf(d);
      if (t > l) { pose = riseFrom(pose, l, t, ((d.i * 0.618) % 1)); if (pose.pos[1] > 9 || t - l > 3.4) continue; base.glow = 0.15; }
    }
    out.push({ ...base, ...pose });
  }
  // ---- cards in the air
  for (const p of S.plays()) {
    if (t < p.tr || t >= p.t) continue;
    const base = { face: p.face, back: p.back, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.writhe ?? 0, glow: p.red ? 0.45 : p.style === 'auto' ? 0.12 : 0 };
    const d = D.find((x) => x.play === p);
    if (!d) continue;
    if (p.style === 'giant') { out.push({ ...base, ...giantFlight(p, t, d.rest) }); continue; }
    if (p.style === 'chat') { out.push({ ...base, ...chatFlight(p, t, d.rest) }); continue; }
    if (t > STOP) continue;
    out.push({ ...base, ...screenFlight(p, t, d.rest) });
  }
  // ---- the eye
  eyeCards(t, out);
  // ---- the last card: out of the eye, slowly down on both of them (cut to black before it lands)
  if (t >= CUES.egg) out.push({ pos: [0, EGG.rest, -0.05], q: basisQ([0, -1, 0], [1, 0, 0]), scale: GIANT_END.scale, face: CELL.glyph0, back: CELL.backBlack, glyph: 1, gcell: CELL.glyph9, glow: 0 });
  if (t > GIANT_END.t0 - 0.3 && t < BLACK) {
    out.push({ pos: [0, S.giantEndY(t), -0.05], q: basisQ([0, -1, 0], [1, 0, 0]), scale: GIANT_END.scale * clamp((t - (GIANT_END.t0 - 0.3)) / 0.5), face: CELL.glyph0, back: CELL.backBlack, glyph: 1, gcell: CELL.glyph9, glow: 0.12 });
  }
}

// ---------------------------------------------------------------- rollers: the ant's crumb; the crown after the credits
function rollersState(t) {
  const R = [];
  if (t >= S.CRUSH + 0.6 && t < CUES.table + 1.0) {
    const u = clamp((t - (CUES.crumb + 0.3)) / 1.1), e = 1 - (1 - u) * (1 - u);
    R.push({ kind: 'crumb', pos: [S.ANT_CRUSH[0] + 0.02 + 0.07 * e, 0.0022, S.ANT_CRUSH[1] + 0.05 + 0.08 * e], q: axisQ([1, 0, 0.3], e * 9), scale: 1 });
  }
  const c = eggCrown(t);
  if (c) R.push(c);
  return R;
}
// the crown rolls out from under the last card on its rim, wobbles down onto its side; later the ant drags it a little
function eggCrown(t) {
  if (t < EGG.roll0) return null;
  const sc = S.EGG_CROWN, rr = 0.1 * sc;
  const u = clamp((t - EGG.roll0) / (EGG.roll1 - EGG.roll0)), e = 1 - (1 - u) * (1 - u);
  const dx = EGG.to[0] - EGG.from[0], dz = EGG.to[1] - EGG.from[1], L = Math.hypot(dx, dz);
  let x = EGG.from[0] + dx * e, z = EGG.from[1] + dz * e;
  const drag = clamp((t - EGG.grab) / (EGG.drag1 - EGG.grab));
  z += 0.018 * drag;
  const heading = Math.atan2(dx, dz);
  const roll = (L * e) / rr;
  const tilt = smooth((u - 0.7) / 0.3) * (Math.PI / 2 - 0.12);
  const wob = u >= 1 ? Math.exp(-(t - EGG.roll1) * 3) * Math.sin((t - EGG.roll1) * 16) * 0.2 : 0;
  // the band stands on its rim (axis horizontal, across the rolling direction), then falls onto its side
  const q = mulQ(axisQ([0, 1, 0], heading), mulQ(axisQ([0, 0, 1], -(tilt + wob)), mulQ(axisQ([1, 0, 0], roll), axisQ([0, 0, 1], Math.PI / 2))));
  return { kind: 'crown', pos: [x, rr * (1 - tilt / (Math.PI / 2)) + 0.0005, z], q, scale: sc };
}

// ---------------------------------------------------------------- the ant (the first one; and the one after the credits)
function antState(t) {
  if (t >= EGG.ant0) {
    const cz = EGG.to[1] + 0.034, cx = EGG.to[0] + 0.004;               // the crown's rim, on the far side
    const walkIn = clamp((t - EGG.ant0) / (EGG.grab - 0.25 - EGG.ant0));
    const drag = clamp((t - EGG.grab) / (EGG.drag1 - EGG.grab));
    let pos, dir, dist;
    if (t < EGG.grab - 0.25) {
      pos = [lerp(EGG.antFrom[0], cx, walkIn), 0.0004, lerp(EGG.antFrom[1], cz, walkIn)];
      const dx = cx - EGG.antFrom[0], dz = cz - EGG.antFrom[1], l = Math.hypot(dx, dz); dir = [dx / l, dz / l];
      dist = walkIn * l;
    } else {
      pos = [cx, 0.0004, cz + 0.018 * drag]; dir = [0, -1];                // facing the crown, walking backwards
      dist = Math.hypot(cx - EGG.antFrom[0], cz - EGG.antFrom[1]) - 0.018 * drag;
    }
    const sniff = t > EGG.grab - 0.25 && t < EGG.grab;
    return { show: t < CUES.end ? 1 : 0, pos, q: basisQ([dir[0], 0, dir[1]], [0, 1, 0]), walk: dist / ANT.STRIDE, speed: sniff ? 0 : 1, alert: sniff ? 1 : 0, crumb: 0, crumbTilt: 0, size: 1 };
  }
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  return { show: 1, pos: A.pos, q: basisQ([dx, 0, dz], [0, 1, 0]), walk: A.dist / ANT.STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 1, crumbTilt: 0, size: 1 };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: {} };
  const giant = S.plays().find((p) => p.style === 'giant') ?? { t: -99 };
  const swX = kick(t, giant.t, 0.55, 0.9) * 0.07 + kick(t, CHAT_T, 0.5, 0.9) * 0.05 + (t > CUES.blizzard && t < STOP + 3 ? Math.sin(t * 2.3) * 0.11 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const swZ = kick(t, giant.t + 0.05, 0.5, 0.9) * 0.045 + (t > CUES.blizzard && t < STOP + 3 ? Math.cos(t * 1.9) * 0.08 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const circ = t > RISE.t0 ? 0.16 * ease(t, RISE.t0, RISE.t0 + 1.5) * (1 - ease(t, RISE.t1 + 0.5, CUES.lookUp + 1.5)) : 0, ca = (t - RISE.t0) * 3.2;
  st.set = {
    lamp: { on: 1, swing: [swX + circ * Math.cos(ca), swZ + circ * Math.sin(ca)], flicker: t > CUES.blizzard && t < STOP ? 0.25 * Math.max(0, Math.sin(t * 37) * Math.sin(t * 11.3)) : 0 },
    ceiling: t > S.CEIL_GONE ? 0 : 1,
    wobble: kick(t, giant.t, 2.2, 5) * -0.004 + kick(t, CHAT_T, 2, 5) * -0.003,
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 0, gold: 0, flood: null }, board: { show: 1, rows: S.boardRows(), lit: t < STOP ? 1 : lerp(1, 0.12, ease(t, STOP, STOP + 1.2)) },
  };
  st.props = { plates: { show: t < BLACK ? 1 : 0 } };
  if (t >= BLACK) st.set.lamp.on = t >= CUES.egg ? 1 : 0;
  kingsState(t, st);
  st.ant = antState(t);
  st.screens = screensState(t);
  st.rollers = rollersState(t);
  if (world?.lite) return st;
  cardsState(t, st);
  // ---- light: ChatGPT's glow on the faces; the red screens; the eye's cold light
  const chat = S.plays().find((p) => p.chat);
  if (t > chat.t && t < at('3-01', 1.5)) { const g = ease(t, chat.t, chat.t + 0.3) * (1 - ease(t, at('2-08'), at('3-01', 1.0))); st.look.p3 = { pos: [0, 0.2, 0], col: [0.8 * g, 1.15 * g, 0.88 * g], range: 2.5 }; }
  if (t > RED_T && t < STOP) { const g = ease(t, RED_T, RED_T + 1.5); st.look.p3 = { pos: [0, 0.6, 0], col: [1.4 * g, 0.18 * g, 0.12 * g], range: 3.2 }; }
  if (t > EYE.open0 - 1 && t < BLACK) { const g = ease(t, EYE.open0, EYE.open1); st.look.p2 = { pos: [0, EYE.c[1] - 1.5, -0.1], col: [0.9 * g, 0.88 * g, 0.75 * g], range: 14 }; }
  if (t > DEAL && t < BLACK) { const g = ease(t, DEAL, DEAL + 0.6); st.look.p3 = { pos: [0, 0.35, 0], col: [0.9 * g, 0.85 * g, 0.7 * g], range: 2.6 }; }
  // the last card's shadow: from the middle of the table outward, over the screens, over the smiling faces
  if (t > GIANT_END.t0 && t < BLACK) { const u = clamp((t - GIANT_END.t0) / (BLACK - GIANT_END.t0)), c = CUES.cover; const R0 = t < c ? lerp(0.25, 1.15, ease(t, GIANT_END.t0, c)) : lerp(1.15, 2.7, (t - c) / (BLACK - c)); st.look.shade = { at: [0, -0.05], r: [R0, R0 * 1.5], k: 0.93 * clamp(u * 4) }; }
  // the light goes out over a king who drops out; his place stays dark while his chair goes
  for (const id in S.OUT) { const o = S.OUT[id]; if (t > o.dark && t < o.slide[1] + 0.6) { const k = 0.88 * ease(t, o.dark, o.dark + 0.25) * (1 - ease(t, o.slide[1], o.slide[1] + 0.6)); st.look.shade = { at: [sxOf(id) * (1.55 + ENTER_DX * (1 - S.seated(id, t))), SEAT.Z[KING[id].seat]], r: [0.95, 0.95], k }; } }
  if (t >= BLACK && t < CUES.egg) st.look.fade = 1;
  if (t >= CUES.egg) st.look.p3 = { pos: [0.42, 0.22, 3.0], col: [1.3, 1.1, 0.8], range: 0.9 };
  if (t >= CUES.egg) st.look.fade = 1 - ease(t, at('9-02', 0.1), at('9-02', 0.9)) * (1 - ease(t, at('9-03', 3.6), CUES.end));
  if (t >= CUES.end) st.look.fade = 1;
  // ---- the title, then every credit, slowly; the human last
  if (t > CUES.title && t < CUES.credits) st.titles = { zh: '失控', en: 'OUT OF CONTROL', alpha: ease(t, CUES.title + 0.4, CUES.title + 1.4) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)) };
  if (t >= CUES.credits && t < CUES.egg) {
    const lines = ['编剧', '导演', '分镜', '动画', '角色', '美术', '灯光', '配乐', '音效', '剪辑', '调色', '程序'].map((r) => [r, 'Claude']).concat([['', ''], ['人类', 'MakerJackie']]);
    const u = clamp((t - CUES.credits - 0.5) / (CUES.egg - CUES.credits - 3.0));
    st.titles = { alpha: 1 - ease(t, CUES.egg - 0.8, CUES.egg - 0.1), roll: { y0: lerp(1.08, 0.5 - (lines.length - 1) * 0.075, u), lines } };
  }
  return st;
}
void face; void downQ; void easeOut; void kingRest; void kf; void CARD; void SLAM; void CARD_Y; void flatQ; void IDS; void mulberry32;
