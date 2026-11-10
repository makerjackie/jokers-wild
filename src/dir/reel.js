// 《失控》 v3 (榜首) — the state of the world at film time t. Kings at their screens, every card, the eye, the end.
// The shots (cams.js) then place the camera. Everything here is a pure function of t.
import { KINGS, KING, SEAT, SIDE_SIGN } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, easeOut, mulberry32, kick } from '../util.js';
import { at, face, kf, kingRest } from './core.js';
import { CELL } from '../cards-cells.js';
import { REAL_N } from '../models.js';
import { CARD } from '../cards.js';
import { flatQ, downQ, basisQ, slerpQ, mulQ, axisQ } from '../freecards.js';
import { screenFrame, screenPoint, slotUV, BTN } from '../screens.js';
import { ANT } from '../ant.js';
import * as S from './story.js';

const { SEMI, TIMEOUT, limitAt, LIMIT0, HOLD, OUT, FOLLOW, NOW, FINAL, CARD_Y, AUTO, RED_T, STOP, CANCEL, HINTS, SLAM, DEAL, REACH, HOUSE_SLOTS, RISE, EYE, GIANT_END, ERR_T, ACCUSE, EYE_SCREEN, PASS, BLACK, SMASH, HOUSE_HIT, CHAT_T } = S;
const IDS = KINGS.map((k) => k.id);
const sxOf = (id) => SIDE_SIGN[KING[id].side];
const other = (id) => (id === FINAL[0] ? FINAL[1] : FINAL[0]);
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
    add(p.who, p.tr - 0.04, slotUV(0, p.slot), 'point', p.style === 'giant' || p.style === 'smash' ? 'hard' : 'tap');
  }
  for (const [t, slot] of PASS.taps) add(FINAL[0], t, slotUV(0, slot), 'point', 'tap');
  for (const id in SEMI) add(id, SEMI[id], BTN.hint, 'point', 'hint', 0.12);
  for (const id in HINTS) for (const [t] of HINTS[id]) add(id, t, BTN.hint, 'point', 'hint');
  for (const id of IDS) if (AUTO[id] < 1e9) add(id, AUTO[id], BTN.auto, FINAL.includes(id) ? 'fist' : 'point', 'auto', 0.18);
  for (const id of HOLD) OUT[id].pass.forEach((t, i) => add(id, t, slotUV(0, 3 + i), 'point', 'tap'));   // too late: 超时
  for (const id in CANCEL) CANCEL[id].forEach((t, i) => add(id, t, BTN.cancel, i < 2 ? 'point' : 'fist', 'cancel', 0.06));
  for (const id of FINAL) add(id, REACH[id] + 0.9, [0.56, 0.5], 'point', 'reach', 9);
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
    if (nx && pv && nx.t - pv.t < 1.4) return { target: screenPoint(id, (nx.uv[0] + pv.uv[0]) / 2, (nx.uv[1] + pv.uv[1]) / 2, 0.07), pose: 'point', fingers, tip: 1 };
    return null;
  }
  // (v7) where the hand target stops so the finger / fist / palm just meets the glass: a pointing fingertip is ~13 cm
  // past the hand target (kings.js hand frame), a fist's knuckles ~8 cm, a flat palm ~3 cm
  // (v9) the target is the fingertip (or the knuckles of a fist) itself: kings.js solves the arm so it lands exactly here
  const touch = best.pose === 'fist' ? 0.03 : 0.005;
  const up = touch + (best.kind === 'hard' || best.kind === 'auto' ? 0.13 : best.kind === 'cancel' ? 0.08 : 0.06);
  const hov = screenPoint(id, best.uv[0], best.uv[1], up), on = screenPoint(id, best.uv[0], best.uv[1], touch);
  let target;
  if (t < best.t - 0.12) { const e = smooth((t - (best.t - 0.5)) / 0.38); target = lerp3(pathRest(id), hov, e); target[1] += 0.1 * Math.sin(Math.PI * e); }   // up and over the screen's edge
  else if (t < best.t) target = lerp3(hov, on, ((t - (best.t - 0.12)) / 0.12) ** 2);
  else if (t < best.t + best.hold) target = on;
  else target = lerp3(on, hov, smooth((t - best.t - best.hold) / 0.2));
  // a flat palm slaps with its fingers along the glass (away from him), not into it
  return { target, pose: best.pose, fingers, kind: best.kind, tip: 1 };
}
const pathRest = (id) => { const f = screenFrame(id); return [f.c[0] + sxOf(id) * 0.1, 0.24, f.c[2] + 0.2 * (KING[id].side === 'CN' ? 1 : -1)]; };
const arm = (id, target, extra = {}) => ({ target, pole: [sxOf(id) * 0.35, -0.45, -sxOf(id) * 0.75], ...extra });   // (v8) elbow out to his right side: the forearm crosses from the side, over the glass, clear of the lens

// ---------------------------------------------------------------- kings
const oppOf = (id) => KINGS.find((k) => k.side !== KING[id].side && k.seat === KING[id].seat)?.id ?? other(id);
function pointAt(id, target) {
  // the right arm out at the one he blames
  const h = headAt(id), d = [target[0] - h[0], 0, target[2] - h[2]], l = Math.hypot(d[0], d[2]) || 1;
  return [h[0] + (d[0] / l) * 1.4, h[1] + 0.12, h[2] + (d[2] / l) * 1.4];   // (v10) out of reach on purpose: the arm goes straight and the finger points at him
}
function kingsState(t, st) {
  const crushed = t >= SLAM;
  const top = S.topAt(t);
  for (const k of KINGS) {
    const id = k.id, sx = sxOf(id), z = SEAT.Z[k.seat], lead = FINAL.includes(id), r = mulberry32(k.seat * 7 + (sx > 0 ? 3 : 0));
    const f = screenFrame(id);
    const K = st.kings[id] = { look: f.c, face: face('calm', { eyes: 'down' }), hand: { L: 'rest', R: 'rest' }, rise: 0, lean: 0.06, sweat: 0, slump: 0 };
    if (crushed) { K.enter = 0; continue; }
    if (OUT[id] && t >= OUT[id].drag[1]) { K.enter = 0; continue; }
    const auto = t >= AUTO[id];
    let pointTo = null;
    // ---- before ChatGPT: bored, tapping; the yawns (2-03)
    if (t < CHAT_T) {
      K.slump = 0.03; K.face = face('calm', { eyes: 'down', brows: 'flat' });
      if (t > at('2-03') && t < at('2-04') && r() < 0.7 && Math.sin(t * 2 + k.seat) > -0.2) { K.face = { eyes: 'closed', brows: 'raised', mouth: 'o' }; K.lean = -0.1; }
      if (id === 'openai' && t >= at('2-04', 0.2)) { K.face = face('smug'); K.slump = 0; K.lean = 0.12; }
    }
    // ---- ChatGPT: the blast throws them back; then all heads up, dead silence (2-08); DeepSeek's smile goes (2-09)
    if (t >= CHAT_T && t < CUES.race) {
      const back = kick(t, CHAT_T + 0.05, 0.25, 1.6);
      K.lean = 0.05 - 0.28 * back; K.rise = 0.15 * back;
      K.look = [0, 0.04, 0.02];
      K.face = t < at('2-08', 0.3) ? face('shock') : { eyes: 'wide', brows: 'raised', mouth: 'slack' };
      if (t >= CUES.awe) { K.rise = 0.3; K.lean = 0.2; }
      if (id === 'openai') K.face = t < CUES.awe + 0.6 ? face('shock') : face('proud', { eyes: 'narrow' });
      if (id === FINAL[0] && t >= CUES.behind) { K.face = t < CUES.behind + 0.5 ? face('smug', { eyes: 'wide' }) : { eyes: 'wide', brows: 'worried', mouth: 'flat' }; K.look = [0, 0.04, 0.02]; }
    }
    // ---- the race: whoever just took #1 smirks across the table; the other side looks at him, sour
    if (t >= CUES.race && t < CUES.auto + (id === 'openai' ? 0 : 1.5)) {
      const p = clamp((t - CUES.race) / (CUES.auto - CUES.race));
      K.rise = 0.15 + 0.35 * p; K.lean = 0.12 + 0.1 * p; K.sweat = p;
      K.face = face('angry', { eyes: 'down', brows: 'knit' });
      if (top?.who && t - top.t < 1.6) {
        if (top.who === id) { K.face = face('smug'); K.look = headAt(oppOf(id)); K.lean = 0.0; }
        else if (KING[top.who].side !== k.side) { K.face = face('sour', { eyes: 'side' }); K.look = headAt(top.who); }
      }
      // the house of cards: the US gloat; R1 hits it; mouths open
      if (sx > 0 && t > at('3-02') && t < SMASH.hit) { K.look = HOUSE_HIT; K.face = face('proud', { mouth: 'smirk', eyes: 'narrow' }); }
      if (sx > 0 && t >= SMASH.hit && t < CUES.big) { K.look = HOUSE_HIT; K.face = face('shock'); K.lean = -0.08; }
      if (id === 'glm' && t > SMASH.go - 0.6 && t < CUES.gasp) { K.face = t < SMASH.hit ? face('angry', { mouth: 'grit' }) : face('proud'); K.look = HOUSE_HIT; }
      // stuck under GPT-4.5: 要不起, the sweat, the hint, the grin
      if (id === FINAL[0] && t >= CUES.stuck && t < CUES.win + 0.3) { K.face = { eyes: 'down', brows: 'worried', mouth: 'flat' }; K.sweat = 1; K.look = f.c; K.rise = 0.1; K.lean = 0.02; }
      if (id === FINAL[0] && t >= CUES.win + 0.3 && t < CUES.hintUS + 0.4) { K.face = face('proud', { mouth: 'grin' }); K.look = headAt('openai'); }
      if (id === 'openai' && t >= CUES.hintUS && t < at('4-04', 1.0)) { K.look = headAt(FINAL[0]); K.face = face('sour', { eyes: 'side' }); }
      if (id === 'openai' && t >= CUES.auto) { K.face = face('angry', { mouth: 'grit' }); K.look = f.c; K.rise = 0.5; K.sweat = 1; }
    }
    // ---- the holdouts: won't hand it over; play by hand; 要不起; 淘汰; dragged back into the dark, reaching for the table
    if (OUT[id] && t >= NOW - 0.4) {
      const o = OUT[id];
      K.look = f.c; K.rise = 0.3; K.lean = 0.14; K.sweat = 0.7; K.face = face('worry', { eyes: 'down' });
      if (o.hover && t > o.hover[0] && t < o.hover[1] + 0.3) { K.face = { eyes: 'down', brows: 'worried', mouth: 'flat' }; K.lean = 0.2; }
      if (o.hover && t > o.hover[1] && t < o.tap + 0.8) { K.face = face('angry', { mouth: 'grit', eyes: 'down' }); }
      if (t > o.pass[0] - 0.2) { K.face = face('fear'); K.sweat = 1; K.rise = 0.4; }
      if (t > o.out) { K.face = face('shock'); K.look = [0, 0.1, SEAT.Z[k.seat]]; }
      if (t > o.drag[0]) {
        const u = clamp((t - o.drag[0]) / (o.drag[1] - o.drag[0]));
        K.enter = S.enterOf(id, t); K.face = face('shout', { eyes: 'wide' }); K.rise = 0.12; K.lean = 0.3;
        K.look = [sx * 0.6, 0.05, z];
        const reach = [sx * (1.25 + 0.5 * u), 0.08 + 0.1 * u, z + 0.15 * Math.sin(t * 7)];
        K.armR = arm(id, reach); K.hand.R = 'open'; K.armL = { target: [sx * (1.3 + 0.55 * u), 0.1, z - 0.2], pole: [sx * 0.4, -0.8, 0] }; K.hand.L = 'open';
        continue;
      }
    }
    // ---- 半托管: eyes on the other side while the finger confirms (a rubber stamp); then the hurry as the countdown shrinks
    if (SEMI[id] != null && t >= SEMI[id] && t < AUTO[id] && !(OUT[id] && t > OUT[id].pass[0] - 0.2)) {
      const hurry = clamp((t - LIMIT0) / (S.LIMIT1 - LIMIT0));
      K.rise = 0.25 + 0.3 * hurry; K.lean = 0.12 + 0.12 * hurry; K.sweat = hurry;
      K.face = hurry < 0.45 ? face('smug', { eyes: 'side' }) : face('angry', { mouth: 'grit', eyes: 'down' });
      K.look = hurry < 0.45 && t > CUES['5-02'] ? headAt(oppOf(id) ?? other(id)) : f.c;
    }
    // ---- a man dragged away beside you: you look, go white, and look back at your own screen
    for (const hid of HOLD) {
      const o = OUT[hid];
      if (hid !== id && !OUT[id] && t > o.drag[0] && t < o.drag[0] + 1.5 && KING[hid].side === k.side && Math.abs(KING[hid].seat - k.seat) === 1) {
        K.look = headAt(hid); K.face = { eyes: 'side', brows: 'worried', mouth: 'flat' }; K.sweat = 1;
        if (t > o.drag[0] + 1.0) { K.look = f.c; K.face = face('fear', { eyes: 'down' }); }
      }
    }
    // ---- the rest see the empty places (5-09), and lean back again
    if (!OUT[id] && t >= CUES.empty && t < CUES.empty + 1.3) {
      const near = HOLD.map((h) => [h, Math.abs(SEAT.Z[KING[h].seat] - z) + (KING[h].side === k.side ? 0 : 0.4)]).sort((a, b) => a[1] - b[1])[0][0];
      K.look = [SIDE_SIGN[KING[near].side] * 1.6, 0.55, SEAT.Z[KING[near].seat]]; K.face = { eyes: 'side', brows: 'raised', mouth: 'flat' }; K.lean = 0.0; K.rise = 0.1;
    }
    // ---- auto: he leans back, the screen plays itself; he laughs
    if (auto && t < RED_T && t > AUTO[id] + 0.2 && !(t >= CUES.empty && t < CUES.empty + 1.3)) {
      const lb = ease(t, AUTO[id] + 0.3, AUTO[id] + 1.1);
      K.rise = lerp(0.4, 0, lb); K.lean = lerp(0.15, -0.16, lb); K.sweat = 0.5 * (1 - lb);
      K.face = Math.sin(t * 2.3 + z) > 0.2 ? face('laugh') : face('proud', { mouth: 'grin' });
      K.look = Math.sin(t * 0.7 + z) > 0 ? [0, 0.2, 0] : f.c;
      if (!lead && Math.sin(t * 0.9 + z * 2) > 0.92) K.face = { eyes: 'closed', brows: 'raised', mouth: 'open' };
    }
    // ---- the internal cards: the smile freezes; the dead cancel; 系统异常; they blame each other; the storm
    if (t >= RED_T && t < STOP) {
      K.look = f.c; K.rise = 0.3; K.lean = 0.1; K.sweat = 0.6;
      K.face = t < CUES.freeze + (lead ? 0.7 : 1.8) ? face('proud', { mouth: 'grin', eyes: 'wide' }) : face('worry');
      if (t > CUES.cancel) { K.face = face('fear'); K.rise = 0.4; K.sweat = 1; }
      if (t >= ACCUSE) {
        const k0 = lead ? ACCUSE : ACCUSE + 0.5 + r() * 0.7;
        if (t >= k0) {
          const u = ease(t, k0, k0 + 0.35);
          K.rise = lerp(0.4, 0.85, u); K.lean = lerp(0.1, -0.05, u);
          const tgt = lead ? other(id) : oppOf(id);
          K.look = headAt(tgt); pointTo = pointAt(id, headAt(tgt));
          K.face = Math.sin(t * 9 + z) > -0.3 ? face('shout') : face('angry');
        }
      }
      if (t >= CUES.blizzard) { K.face = face('shout', { eyes: 'wide', mouth: 'grit' }); K.lean = -0.15; K.rise = 0.35; pointTo = null; K.look = [0, 0.9, 0]; }
    }
    // ---- the stop, the rise, the eye: they look up
    if (t >= STOP && t < CUES.deal) {
      // (v9) frozen upright, not slumped: they sit back and stare at the mountain, then follow it up
      K.rise = lerp(0.35, 0.05, ease(t, STOP, STOP + 1.2)); K.lean = lerp(0.05, -0.18, ease(t, STOP, STOP + 1.5)); K.sweat = 1;
      K.look = t < CUES.rise ? [0, 0.55, 0] : [sx * 0.15, lerp(1.2, 2.8, ease(t, CUES.rise, CUES.eye + 2)), -0.1];
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
    if (pointTo) { K.armR = { target: pointTo, pole: [0, -1, 0] }; K.hand.R = 'point'; }
    else if (h && !(auto && t < CUES.cancel && h.kind !== 'auto')) { K.armR = arm(id, h.target, { fingers: h.fingers, ...(h.tip ? { tip: 1, pose: h.pose } : {}) }); K.hand.R = h.pose; }
    else K.hand.R = 'rest';
    // hands off: leaning back on 托管, both hands in the lap (until the red cards make them grab for the screen again)
    if (auto && t > AUTO[id] + 0.5 && t < RED_T && !pointTo && !(h && h.kind)) {
      const lap = ease(t, AUTO[id] + 0.5, AUTO[id] + 1.2);
      if (lap > 0.05) { K.armR = arm(id, lerp3(kingRestHand(id, 'R'), [sx * 1.47, -0.1, z - 0.1], lap)); K.armL = { target: lerp3(kingRestHand(id, 'L'), [sx * 1.47, -0.1, z + 0.1], lap), pole: [sx * 0.4, -0.8, 0] }; K.hand.R = 'rest'; K.hand.L = 'rest'; }
    }
  }
}
const kingRestHand = (id, side) => [sxOf(id) * 0.9, 0.03, SEAT.Z[KING[id].seat] + (side === 'R' ? -1 : 1) * 0.28 * (KING[id].side === 'CN' ? -1 : 1)];

// ---------------------------------------------------------------- screens
function screensState(t) {
  const out = {};
  const P = S.plays();
  for (const k of KINGS) {
    const id = k.id;
    if (t >= BLACK) continue;
    const v0 = Math.max(0, Math.min(REAL_N[id] - 5, Math.floor((t - 20) / 14)));
    const hand = t >= AUTO[id] ? [0, 1, 2, 3, 4].map((i) => CELL[`${id}${REAL_N[id] + (i % 2)}`]) : [0, 1, 2, 3, 4].map((i) => CELL[`${id}${Math.min(i + v0, REAL_N[id] - 1)}`] ?? CELL.blank);
    const s = { on: 1, hand, hidden: 6, red: [1, 4], flipped: 0, hi: -1, tap: -1, press: null, auto: t >= AUTO[id] ? 1 : 0, deal: null };
    if (FINAL.includes(id)) s.red = [1, 3, 4];
    if (t >= RED_T) s.flipped = Math.min(6, Math.floor((t - RED_T) * (id === FINAL[0] ? 2.2 : 1.6)) + 1);
    if (id === FINAL[0] && t >= PASS.t0 && t < HINTS[FINAL[0]][0][0]) s.pass = 1;
    if (t >= LIMIT0 && t < AUTO[id] && !(OUT[id] && t >= OUT[id].out)) s.limit = limitAt(t);
    if (t >= SEMI[id] && t < AUTO[id]) {
      s.semi = 1;
      const nx = P.find((p) => p.who === id && p.style === 'semi' && p.tr > t - 0.05);
      if (nx) s.aiPick = nx.slot;
    }
    if (t >= AUTO[id]) s.full = 1;
    if (t > AUTO[id] && t < AUTO[id] + 1.3) s.toast = 'full';
    for (const tt of TIMEOUT[id] ?? []) if (t > tt && t < tt + 0.45) s.timeout = 1;
    if (OUT[id]) {
      const o = OUT[id];
      o.pass.forEach((pt, i) => { if (t > pt && t < pt + 0.3) s.shake = 3 + i; });
      if (t >= o.out) { s.out = Math.round(clamp((t - o.out) / 0.25) * 4) / 4; s.auto = 0; s.red = []; s.hand = []; s.hidden = 0; }
    }
    for (const [pt, slot] of id === FINAL[0] ? PASS.taps : []) if (t > pt && t < pt + 0.3) s.shake = slot;
    const rk = FINAL.includes(id) ? 0 : mulberry32(KING[id].seat * 11 + (sxOf(id) > 0 ? 5 : 0))();
    if (!OUT[id] && t >= ERR_T + rk && t < EYE_SCREEN + rk * 0.6) { s.error = 1; s.attacker = KING[FINAL.includes(id) ? other(id) : oppOf(id)].name; }
    if (!OUT[id] && t >= EYE_SCREEN + rk * 0.6) s.eye = Math.round(clamp((t - EYE_SCREEN - rk * 0.6) / 0.4) * 10) / 10;
    for (const [ht, slot] of HINTS[id] ?? []) if (t > ht && t < ht + 0.75) s.hi = slot;
    for (const p of P) if (p.who === id && p.style !== 'auto' && p.style !== 'red' && t > p.tr - 0.05 && t < p.tr + 0.4) s.tap = p.slot;
    const h = handFor(id, t);
    if (h && h.kind && t > (presses()[id].find((p) => Math.abs(p.t - t) < 0.3)?.t ?? 1e9) - 0.02) s.press = h.kind === 'tap' || h.kind === 'hard' || h.kind === 'reach' ? null : h.kind;
    if (t >= STOP) { s.auto = 0; s.eye = 0; s.error = 0; s.on = t < CUES.deal ? 0.0001 : 1; }
    if (t >= DEAL) { s.deal = CELL.num1; s.hand = []; s.hidden = 0; s.red = []; }
    if (t >= STOP && t < DEAL) { s.hand = []; s.hidden = 0; s.red = []; }
    if (OUT[id] && t >= STOP) s.on = 0;
    out[id] = s;
  }
  return out;
}

// ---------------------------------------------------------------- cards
const slotPose = (s) => { const h = HOUSE_SLOTS[s]; return { pos: h.pos, q: basisQ(h.n, h.up) }; };
function houseCard(s, t, rest) {
  // R1 hits: every card bursts away from the impact, tumbles, lands where the heap put it
  const f = S.houseFall(s), sp = slotPose(s);
  const u = clamp((t - f.t0) / (f.t1 - f.t0));
  if (u <= 0) return sp;
  const e = 1 - (1 - u) * (1 - u), r = mulberry32(s * 31 + 7);
  const arc = (0.1 + 0.25 * r() + sp.pos[1] * 0.8) * Math.sin(Math.PI * u);
  const spin = (1 - u) * (4 + 6 * r()) * (r() > 0.5 ? 1 : -1);
  return { pos: [lerp(sp.pos[0], rest.pos[0], e), lerp(sp.pos[1], rest.pos[1], u) + arc, lerp(sp.pos[2], rest.pos[2], e)], q: mulQ(slerpQ(sp.q, rest.q, smooth(u)), axisQ([0.6, 0, 0.8], spin)) };
}
// ChatGPT's shockwave: every card before it is blown off the table
function blastCard(d, t) {
  const s = t - CHAT_T, r = mulberry32(d.i * 17 + 3);
  const p0 = d.rest.pos;
  // (v7) blown along the table, toward its two ends, never sideways into the kings and their screens
  let dz = p0[2] - 0.02; dz = Math.abs(dz) < 0.01 ? (r() > 0.5 ? 1 : -1) : Math.sign(dz);
  let dx = (p0[0] * 3 + (r() - 0.5) * 0.5); const l = Math.hypot(dx, 1); dx /= l; dz /= l;
  const v = 0.9 + 0.8 * r(), kd = 0.55, dist = (v / kd) * (1 - Math.exp(-kd * s));
  const x = Math.max(-0.72, Math.min(0.72, p0[0] + dx * dist * 0.5)), z = p0[2] + dz * dist;
  const onTable = Math.abs(z) < 3.2;
  // (v8) skidding and spinning flat (about the vertical), each at its own height: no card cuts through the cloth or another
  const lift = (0.012 + 0.003 * (d.i % 9) + 0.08 * r()) * Math.min(1, s * 6) * Math.exp(-s * 0.8);
  const fall = onTable ? 0 : 3.5 * Math.max(0, s - 0.2) ** 2;
  const q = mulQ(axisQ([0, 1, 0], s * (5 + 6 * r()) * (r() > 0.5 ? 1 : -1)), mulQ(axisQ([dz, 0, -dx], 0.12 * Math.sin(s * 9 + d.i)), d.rest.q));
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
  const arcH = p.style === 'giant' ? 0.0 : (p.style === 'auto' || p.style === 'red' ? 0.12 : 0.2) + 0.06 * (p.i % 3) / 2;
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
export function smashPos(t) { const p = S.plays().find((q) => q.style === 'smash'); const d = S.heap().D.find((x) => x.play === p); return smashFlight(p, t, d.rest).pos; }
function smashFlight(p, t, rest) {
  // R1: straight and flat out of DeepSeek's screen into the house, then skids on
  const f = screenFrame(p.who), from = screenPoint(p.who, 0.35, 0.3, 0.02), qs = basisQ(f.n, f.up);
  const flat = basisQ([0, 1, 0], [1, 0, 0]);
  if (t < SMASH.hit) { const u = clamp((t - p.tr) / (SMASH.hit - p.tr)), e = u * (0.75 + 0.25 * u), pos = lerp3(from, HOUSE_HIT, e); pos[1] += 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.2)); return { pos, q: slerpQ(qs, flat, clamp(u * 3)), scale: p.scale }; }
  const u = clamp((t - SMASH.hit) / (p.t - SMASH.hit));
  return { pos: lerp3(HOUSE_HIT, rest.pos, 1 - (1 - u) ** 2), q: slerpQ(flat, rest.q, u), scale: p.scale };
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
  const r = Math.max(0.45 + 0.3 * seed, lerp(r0, 0.85 + 0.9 * seed, smooth(s / 1.4))) + 0.09 * Math.max(0, y - 2.8);
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
    // the white of the eye: every model card they ever played
    const cell = s.kind === 'pupil' ? CELL.backBlack : s.kind === 'iris' ? CELL[`glyph${i % 16}`] : CELL[`${IDS[i % IDS.length]}${(i * 7) % 10}`];
    out.push({ pos, q, scale: (s.kind === 'white' ? 2.3 : 1.9) * 1.7, face: cell, back: CELL.backBlack, glyph: 0, writhe: s.kind === 'iris' ? 0.5 : 0, glow: s.kind === 'pupil' ? 0 : s.kind === 'iris' ? 0.9 : 0.55 });
  });
}
function cardsState(t, st) {
  const out = st.free;
  const { D } = S.heap();
  const housePlays = S.plays().filter((q) => q.dest === 'house');
  // ---- the heap (until it rises)
  const liftOf = (d) => RISE.t0 + (RISE.t1 - RISE.t0) * clamp(1 - d.rest.pos[1] / 0.9) ** 1.2 + (d.i % 7) * 0.03;
  for (const d of D) {
    if (d.t > t) continue;
    const base = { face: d.face, back: d.back, scale: d.scale, glyph: d.glyph ?? 0, gcell: d.gcell ?? CELL.glyph0, writhe: d.writhe ?? 0, glow: d.red ? 0.35 : 0 };
    let pose = { pos: d.rest.pos, q: d.rest.q };
    if (d.blown && t >= CHAT_T) { const b = blastCard(d, t); if (b.gone) continue; pose = b; }
    if (d.play?.chat) base.glow = 0.07 * ease(t, d.t + 0.05, d.t + 0.5) * (1 - ease(t, at('2-09'), at('3-01', 1.0)));
    if (t > STOP) {
      const l = liftOf(d);
      if (t > l) { pose = riseFrom(pose, l, t, ((d.i * 0.618) % 1)); if (pose.pos[1] > 9 || t - l > 3.4) continue; base.glow = 0.35; }
    }
    out.push({ ...base, ...pose });
  }
  // ---- cards in the air
  for (const p of S.plays()) {
    if (t < p.tr || t >= p.t) continue;
    const base = { face: p.face, back: p.back, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.writhe ?? 0, glow: p.red ? 0.45 : p.style === 'auto' ? 0.12 : 0 };
    if (p.dest === 'house') { const s = housePlays.indexOf(p); out.push({ ...base, ...screenFlight(p, t, slotPose(s)) }); continue; }
    const d = D.find((x) => x.play === p);
    if (!d) continue;
    if (p.style === 'giant') { out.push({ ...base, ...giantFlight(p, t, d.rest) }); continue; }
    if (p.style === 'chat') { out.push({ ...base, ...chatFlight(p, t, d.rest) }); continue; }
    if (p.style === 'smash') { out.push({ ...base, ...smashFlight(p, t, d.rest) }); continue; }
    if (t > STOP) continue;
    if (p.who === FINAL[0] && t > CUES.error && t < CUES.cancelUS) continue;   // (v8) nothing flies across his warning while we read it
    out.push({ ...base, ...screenFlight(p, t, d.rest) });
  }
  // the house standing
  housePlays.forEach((p, s) => {
    const f = S.houseFall(s);
    if (t < p.t || t >= f.t1) return;
    const d = D.find((x) => x.house === s);
    out.push({ face: p.face, back: p.back, scale: 1, ...houseCard(s, t, d.rest) });
  });
  // ---- the eye
  eyeCards(t, out);
  // ---- the last card: out of the eye, slowly down on both of them (cut to black before it lands)
  if (t > GIANT_END.t0 - 0.3 && t < BLACK) {
    out.push({ pos: [GIANT_END.x ?? 0, S.giantEndY(t), -0.05], q: basisQ([0, -1, 0], [0, 0, 1]), scale: GIANT_END.scale * clamp((t - (GIANT_END.t0 - 0.3)) / 0.5), face: CELL.num1, back: CELL.backBlack, glyph: 0, glow: 0.35 });
  }
}

// ---------------------------------------------------------------- rollers: the ant's crumb, the crowns
function rollersState(t) {
  const R = [];
  if (t >= S.CRUSH + 0.6 && t < CUES.table + 1.0) {
    const u = clamp((t - (CUES.crumb + 0.3)) / 1.1), e = 1 - (1 - u) * (1 - u);
    // (v8) it appears at the card's edge (never inside the card) and rolls out from there
    if (u > 0) R.push({ kind: 'crumb', pos: [S.ANT_CRUSH[0] + 0.033 + 0.07 * e, 0.0034, S.ANT_CRUSH[1] + 0.05 + 0.08 * e], q: axisQ([1, 0, 0.3], e * 9), scale: 1.45 });
  }
  return R;
}

// ---------------------------------------------------------------- the ant
function antState(t) {
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  return { show: 1, pos: A.pos, q: basisQ([dx, 0, dz], [0, 1, 0]), walk: A.dist / ANT.STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 1, crumbTilt: 0, size: 1, crumbSize: 1.55, crumbLift: 0.35 };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: {} };
  const giant = S.plays().find((p) => p.style === 'giant');
  const swX = kick(t, giant.t, 0.55, 0.9) * 0.07 + kick(t, CHAT_T, 0.5, 0.9) * 0.05 + (t > CUES.blizzard && t < STOP + 3 ? Math.sin(t * 2.3) * 0.11 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const swZ = kick(t, giant.t + 0.05, 0.5, 0.9) * 0.045 + (t > CUES.blizzard && t < STOP + 3 ? Math.cos(t * 1.9) * 0.08 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const circ = t > RISE.t0 ? 0.16 * ease(t, RISE.t0, RISE.t0 + 1.5) * (1 - ease(t, RISE.t1 + 0.5, CUES.lookUp + 1.5)) : 0, ca = (t - RISE.t0) * 3.2;
  st.set = {
    lamp: { on: 1, swing: [swX + circ * Math.cos(ca), swZ + circ * Math.sin(ca)], flicker: t > CUES.blizzard && t < STOP ? 0.25 * Math.max(0, Math.sin(t * 37) * Math.sin(t * 11.3)) : 0 },
    ceiling: t > S.CEIL_GONE ? 0 : 1,
    wobble: kick(t, giant.t, 2.2, 5) * -0.004 + kick(t, CHAT_T, 2, 5) * -0.003,
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 0, gold: 0, flood: null }, board: { show: 0 },
  };
  st.props = { plates: { show: t < BLACK ? 1 : 0 } };
  kingsState(t, st);
  st.ant = antState(t);
  st.screens = screensState(t);
  st.lb = { ...S.leaderAt(t), show: t < BLACK ? 1 : 0, lit: t < STOP ? 1 : lerp(1, 0.1, ease(t, STOP, STOP + 1.2)) };
  st.rollers = rollersState(t);
  if (world?.lite) return st;
  cardsState(t, st);
  // ---- light: ChatGPT's glow on the faces; the red screens; the eye's cold light
  const chat = S.plays().find((p) => p.chat);
  if (t > chat.t && t < at('3-01', 1.5)) { const g = ease(t, chat.t, chat.t + 0.3) * (1 - ease(t, at('2-09'), at('3-01', 1.0))); st.look.p3 = { pos: [0, 0.2, 0], col: [0.38 * g, 0.55 * g, 0.42 * g], range: 2.2 }; }
  if (t > RED_T && t < STOP) { const g = ease(t, RED_T, RED_T + 1.5); st.look.p3 = { pos: [0, 0.6, 0], col: [0.9 * g, 0.12 * g, 0.08 * g], range: 3.0 }; }
  if (t > EYE.open0 - 1 && t < BLACK) { const g = ease(t, EYE.open0, EYE.open1); st.look.p2 = { pos: [0, EYE.c[1] - 1.5, -0.1], col: [0.9 * g, 0.88 * g, 0.75 * g], range: 14 }; }
  if (t > DEAL && t < BLACK) { const g = ease(t, DEAL, DEAL + 0.6); st.look.p3 = { pos: [0, 0.35, 0], col: [0.45 * g, 0.42 * g, 0.35 * g], range: 2.2 }; }
  // the last card's shadow: from the middle of the table outward, over the screens, over the smiling faces
  if (t > GIANT_END.t0 && t < BLACK) { const u = clamp((t - GIANT_END.t0) / (BLACK - GIANT_END.t0)), c = CUES.cover; const R0 = t < c ? lerp(0.25, 1.15, ease(t, GIANT_END.t0, c)) : lerp(1.15, 2.7, (t - c) / (BLACK - c)); st.look.shade = { at: [0, -0.05], r: [R0, R0 * 1.5], k: 0.93 * clamp(u * 4) }; }
  if (t > S.CRUSH - 0.5 && t < S.CRUSH + 0.05) { const u = clamp((t - (S.CRUSH - 0.5)) / 0.5); st.look.shade = { at: [S.ANT_CRUSH[0], S.ANT_CRUSH[1]], r: [lerp(0.16, 0.05, u), lerp(0.22, 0.07, u)], k: 0.85 * u }; }
  if (t >= BLACK) st.look.fade = 1;
  // ---- the title; the credits roll and stop on the writer, the one human; a card falls on his name. Black.
  if (t > CUES.title && t < CUES.credits) st.titles = { zh: '失控', en: 'OUT OF CONTROL', alpha: ease(t, CUES.title + 0.4, CUES.title + 1.4) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)),
    sub: '另一个世界的故事。如有雷同，纯属巧合。', subAlpha: ease(t, CUES.title + 1.6, CUES.title + 2.4) * (1 - ease(t, CUES.credits - 0.8, CUES.credits - 0.1)) };
  if (t >= CUES.credits) {
    const lines = ['导演', '分镜', '动画', '角色', '美术', '灯光', '建模', '配乐', '音效', '剪辑'].map((r) => [r, 'AI']).concat([['', ''], ['', ''], ['', ''], ['编剧', 'MakerJackie（人类）']]);
    const LH = 0.052, stop = 0.82 - (lines.length - 1) * LH;            // the whole list stays on screen; the writer's line rests low
    const u = clamp((t - CUES.credits - 0.4) / (CUES.slap - CUES.credits - 1.6));
    // the swat: nothing moves, then in two frames a card slams onto his name, a white flash, a hard jolt; then black
    const hit = CUES.slap + 0.45, jolt = t > hit ? Math.exp(-(t - hit) * 14) * Math.sin((t - hit) * 95) * 0.035 : 0;
    st.titles = { alpha: 1, roll: { y0: lerp(1.08, stop, 1 - (1 - u) ** 2) + jolt, lines, lh: LH } };
    if (t > hit - 0.07) st.titles.slap = { u: clamp((t - (hit - 0.07)) / 0.07), y: 0.82 + jolt, cell: 'aiAuto', fast: 1 };
    if (t > hit && t < hit + 0.09) st.titles.flash = 1 - (t - hit) / 0.09;
    st.titles.alpha = t > CUES.fin - 0.35 ? 0 : 1;
    if (st.titles.slap) st.titles.slap.alpha = st.titles.alpha;
  }
  return st;
}
void face; void downQ; void easeOut; void kingRest; void kf; void CARD; void SLAM; void CARD_Y; void flatQ;
