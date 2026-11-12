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

const { INVITE, AFTER, SEMI, TIMEOUT, limitAt, LIMIT0, HOLD, OUT, FOLLOW, NOW, FINAL, CARD_Y, AUTO, RED_T, STOP, CANCEL, HINTS, SLAM, DEAL, REACH, HOUSE_SLOTS, RISE, EYE, GIANT_END, ERR_T, ACCUSE, EYE_SCREEN, PASS, BLACK, SMASH, HOUSE_HIT, CHAT_T } = S;
const IDS = KINGS.map((k) => k.id);
const sxOf = (id) => SIDE_SIGN[KING[id].side];
const other = (id) => (id === FINAL[0] ? FINAL[1] : FINAL[0]);
export const headAt = (id) => [sxOf(id) * 1.52, 0.66, SEAT.Z[KING[id].seat]];

// ---------------------------------------------------------------- presses on the screen
// per king: [{ t (contact), uv, pose, kind }] — taps on cards, the hint, the auto, the cancels, the last reach
let PRESS = null;
// (v19) the two taps a holdout makes too late: on the AI's card, waiting in its slot
const AI_SLOT = 4;
function presses() {
  if (PRESS) return PRESS;
  PRESS = {};
  const add = (id, t, uv, pose = 'point', kind = 'tap', hold = 0.08, lead = 0.5) => (PRESS[id] ??= []).push({ t, uv, pose, kind, hold, lead });
  for (const p of S.plays()) {
    if (p.style === 'auto' || p.style === 'red') continue;
    const hard = p.style === 'giant' || p.style === 'smash';   // the hand hangs over the card, then stabs
    add(p.who, p.tr - 0.04, slotUV(0, p.slot), 'point', hard ? 'hard' : 'tap', hard ? 0.14 : 0.08, hard ? 0.95 : 0.5);
  }
  for (const [t, slot] of PASS.taps) add(FINAL[0], t, slotUV(0, slot), 'point', 'tap');
  for (const id in SEMI) add(id, SEMI[id], BTN.hint, 'point', 'hint', 0.12);
  for (const id in HINTS) for (const [t] of HINTS[id]) add(id, t, BTN.hint, 'point', 'hint');
  for (const id of IDS) if (AUTO[id] < 1e9) add(id, AUTO[id], BTN.auto, 'point', 'auto', id === 'openai' ? 0.5 : 0.25, id === 'openai' ? 1.25 : 0.5);   // (v11) his own finger, on purpose: it hangs over the key, then presses
  for (const id of HOLD) OUT[id].pass.forEach((t) => add(id, t, slotUV(0, AI_SLOT), 'point', 'tap'));   // too late: 超时
  for (const id in CANCEL) CANCEL[id].forEach((t, i) => add(id, t, BTN.cancel, i < 2 ? 'point' : 'fist', 'cancel', 0.06));
  for (const id of FINAL) add(id, REACH[id] + 0.9, [0.6, 0.56], 'point', 'reach', 9);
  for (const id in PRESS) PRESS[id].sort((a, b) => a.t - b.t);
  return PRESS;
}
export const pressList = () => presses();
// the hand at t: on its way to a press, on the glass at it, leaving it; else resting (null)
// (v19) one press at a time, each one finished before the next begins: every card that leaves a screen was touched
const REL = 0.16, HOME = 0.42;
function handFor(id, t, rise = 0) {
  const L = presses()[id] ?? [];
  const f = screenFrame(id);
  const sxo = sxOf(id), rl = Math.hypot(1, 0.16, 0.3), rf = [-sxo / rl, -0.16 / rl, (sxo * 0.3) / rl];
  // (v17) the finger meets the glass at a slant, as a finger does, not straight down into it
  const fingers = [-f.n[0] * 0.62 + rf[0] * 0.5, -f.n[1] * 0.62 + rf[1] * 0.5, -f.n[2] * 0.62 + rf[2] * 0.5];
  const chained = (a, b) => !!a && !!b && b.t - b.lead < a.t + a.hold + REL + HOME;   // the hand has no time to go home between them
  let bi = -1;
  for (let i = 0; i < L.length; i++) {
    const p = L[i], t0 = chained(L[i - 1], p) ? L[i - 1].t + L[i - 1].hold : p.t - p.lead, t1 = chained(p, L[i + 1]) ? p.t + p.hold : p.t + p.hold + REL + HOME;
    if (t >= t0 && t < t1) { bi = i; break; }
  }
  if (bi < 0) return null;
  const p = L[bi], prev = L[bi - 1];
  // (v16) the hand leaves from where it rests and goes back there: no pop between resting and pressing
  // (v17) at rest the hand lies level on the cloth, fingers toward the middle of the table: the finger direction turns with the move
  const tipL = 0.177 * KING[id].size, rh = kingRestHand(id, 'R', rise), home = [rh[0] + rf[0] * tipL, 0.035, rh[2] + rf[2] * tipL];
  // (v9) the target is the fingertip (or the knuckles of a fist) itself: kings.js solves the arm so it lands exactly here
  const touchOf = (q) => (q.pose === 'fist' ? 0.03 : 0.005);
  const upOf = (q) => touchOf(q) + (q.kind === 'hard' || q.kind === 'auto' ? 0.13 : q.kind === 'cancel' ? 0.08 : 0.06);
  const at_ = (q, lift) => screenPoint(id, q.uv[0], q.uv[1], lift);
  const hov = at_(p, upOf(p)), on = at_(p, touchOf(p));
  let target, pose = p.pose, fg = fingers;
  if (t < p.t) {
    if (chained(prev, p)) {
      // straight from the last press: off the glass, across, down
      const t0 = prev.t + prev.hold, D = p.t - t0, tA = t0 + Math.min(REL, D * 0.35), tC = p.t - Math.min(0.12, D * 0.35), ph = at_(prev, upOf(prev));
      if (t < tA) { target = lerp3(at_(prev, touchOf(prev)), ph, smooth((t - t0) / (tA - t0))); pose = prev.pose; }
      else if (t < tC) { const e = smooth((t - tA) / Math.max(1e-3, tC - tA)); target = lerp3(ph, hov, e); target[1] += 0.025 * Math.sin(Math.PI * e) * Math.min(1, Math.hypot(ph[0] - hov[0], ph[2] - hov[2]) / 0.08); }
      else target = lerp3(hov, on, ((t - tC) / (p.t - tC)) ** 2);
    } else if (t < p.t - 0.12) {
      const e = smooth(clamp((t - (p.t - p.lead)) / 0.38)); target = lerp3(home, hov, e); target[1] += 0.1 * Math.sin(Math.PI * e); fg = lerp3(rf, fingers, e);   // up and over the screen's edge
      if (p.lead > 0.6 && e >= 1) { const w = t - (p.t - p.lead + 0.38); target = [target[0], target[1] + 0.006 * Math.sin(w * 9), target[2] + 0.01 * Math.sin(w * 5.3)]; }
    } else target = lerp3(hov, on, ((t - (p.t - 0.12)) / 0.12) ** 2);
  } else if (t < p.t + p.hold) target = on;
  else {
    const u = t - p.t - p.hold;
    if (u < REL) target = lerp3(on, hov, smooth(u / REL));
    else { const e = smooth(clamp((u - REL) / HOME)); target = lerp3(hov, home, e); target[1] += 0.07 * Math.sin(Math.PI * e); fg = lerp3(fingers, rf, e); if (e > 0.55) pose = 'rest'; }
  }
  return { target, pose, fingers: fg, kind: p.kind, tip: 1, on: t >= p.t - 0.02 && t < p.t + p.hold + 0.1 };
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
    if (t >= AFTER) { K.empty = 1; continue; }
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
      K.rise = 0.08 + 0.17 * p; K.lean = 0.1 + 0.06 * p; K.sweat = p;
      K.face = face('angry', { eyes: 'down', brows: 'knit' });
      if (top?.who && t - top.t < 1.6) {
        if (top.who === id) { K.face = face('smug'); K.look = headAt(oppOf(id)); K.lean = 0.0; }
        else if (KING[top.who].side !== k.side) { K.face = face('sour', { eyes: 'side' }); K.look = headAt(top.who); }
      }
      // the house of cards: the US gloat; R1 hits it; mouths open
      if (id === 'openai' && t > at('3-03') && t < SMASH.hit) { K.look = headAt(FINAL[0]); K.face = face('proud', { mouth: 'smirk', eyes: 'narrow' }); }
      if (id !== 'glm' && t > SMASH.go + 0.5 && t < SMASH.hit) K.look = smashPos(t);
      if (id !== 'glm' && t >= SMASH.hit && t < CUES.big) { const kb = kick(t, SMASH.hit + 0.03, 0.25, 1.4); K.look = HOUSE_HIT; K.face = face('shock'); K.lean = 0.0 - 0.3 * kb; K.rise = 0.1 + 0.12 * kb; }
      if (id === 'glm' && t > SMASH.go - 0.6 && t < CUES.gasp) { K.face = t < SMASH.hit ? face('angry', { mouth: 'grit' }) : face('proud'); K.look = HOUSE_HIT; }
      { const g = S.plays().find((q) => q.style === 'giant'); if (id !== 'openai' && id !== 'glm' && t >= CUES.big - 0.2 && t <= g.tr + 0.15) { K.look = headAt('openai'); K.face = face('sour', { eyes: 'side' }); K.lean = 0.02; K.rise = 0.05; }
      if (t > g.tr + 0.15 && t < g.t + 0.9) {
        const up = ease(t, g.tr + 0.15, g.tr + 0.7), dn = ease(t, g.t - 0.5, g.t);
        K.look = lerp3(lerp3(f.c, [0.75, 1.25, 0], up), [0.04, 0.1, 0.06], dn);
        K.face = id === 'openai' ? face('proud', { mouth: 'grit', eyes: 'narrow' }) : t < g.t ? { eyes: 'wide', brows: 'raised', mouth: 'slack' } : face('shock');
        K.lean = id === 'openai' ? 0.1 : -0.06 - 0.2 * kick(t, g.t + 0.03, 0.25, 1.4); K.rise = id === 'openai' ? 0.2 : 0.08;
      } }
      // stuck under GPT-4.5: 要不起, the sweat, the hint, the grin
      if (id === FINAL[0] && t >= CUES.stuck && t < CUES.win + 0.3) { K.face = { eyes: 'down', brows: 'worried', mouth: 'flat' }; K.sweat = 1; K.look = f.c; K.rise = 0.1; K.lean = 0.02; }
      if (id === FINAL[0] && t >= CUES.win + 0.3 && t < CUES.hintUS + 0.4) { K.face = face('proud', { mouth: 'grin' }); K.look = headAt('openai'); }
      if (id === 'openai' && t >= CUES.hintUS && t < at('4-04', 1.0)) { K.look = headAt(FINAL[0]); K.face = face('sour', { eyes: 'side' }); }
      if (id === 'openai' && t >= CUES.auto) { K.face = face('angry', { mouth: 'grit' }); K.look = f.c; K.rise = 0.3; K.sweat = 1; }
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
        K.enter = S.enterOf(id, t); K.face = face('shout', { eyes: 'wide' });
        const gone = 2.3 * (1 - K.enter) ** 3, off = ease(gone, 0.1, 0.45), rz = k.side === 'CN' ? -1 : 1;   // how far the chair has gone; the hands come off
        K.rise = lerp(0.3, 0.15, off); K.lean = lerp(0.2 + 1.6 * Math.min(gone, 0.12), 0.3, off);
        K.look = [sx * 0.6, 0.05, z];
        const grab = (s) => [sx * Math.min(1.16, 1.06 + gone), 0.03, z + s * rz * 0.26], away = (s, y) => [sx * 0.9, y + 0.05 * Math.sin(t * 8 + s), z + s * rz * (0.16 + 0.05 * Math.sin(t * 6 + s))];
        K.armR = { target: lerp3(grab(-1), away(-1, 0.42), off), pole: [sx * 0.35, -0.45, -rz * 0.75], ...(off < 0.5 ? { fingers: [-sx, -0.1, 0] } : {}) }; K.hand.R = 'open';
        K.armL = { target: lerp3(grab(1), away(1, 0.08), off), pole: [sx * 0.35, -0.45, rz * 0.75], ...(off < 0.5 ? { fingers: [-sx, -0.1, 0] } : {}) }; K.hand.L = 'open';
        continue;
      }
    }
    // ---- 半托管: eyes on the other side while the finger confirms (a rubber stamp); then the hurry as the countdown shrinks
    if (SEMI[id] != null && t >= SEMI[id] && t < AUTO[id] && !(OUT[id] && t > OUT[id].pass[0] - 0.2)) {
      const hurry = clamp((t - LIMIT0) / (S.LIMIT1 - LIMIT0));
      K.rise = 0.18 + 0.1 * hurry; K.lean = 0.08 + 0.06 * hurry; K.sweat = hurry;   // (v11) hunched, but his head stays clear of the lens over his screen
      K.face = hurry < 0.45 ? face('smug', { eyes: 'side' }) : face('angry', { mouth: 'grit', eyes: 'down' });
      K.look = hurry < 0.45 && t > CUES['5-02'] ? headAt(oppOf(id) ?? other(id)) : f.c;
      if (hurry >= 0.45 && (t * 1.05 + k.seat * 0.37) % 1 < 0.3) { K.lookCalm = K.look; K.look = headAt(oppOf(id) ?? other(id)); K.face = face('angry', { mouth: 'grit' }); }
    }
    // ---- (v11) OpenAI reads the offer, glances at Claude across the pile, and decides: his own choice
    if (id === 'openai' && t >= CUES.invite + 0.3 && t < AUTO.openai + 0.2) {
      const d = CUES.decide;
      K.rise = 0.1; K.lean = 0.06; K.sweat = 0.8; K.look = screenPoint(id, 0.6, 0.1, 0.02);
      K.face = t < CUES.invite + 0.9 ? face('angry', { mouth: 'grit', eyes: 'down' }) : { eyes: 'down', brows: 'raised', mouth: 'flat' };
      if (t >= d + 0.3 && t < d + 0.95) { K.look = headAt(FINAL[0]); K.face = face('sour', { eyes: 'narrow' }); K.lean = 0.0; K.rise = 0.05; }
      if (t >= d + 0.95) { K.face = face('smug', { eyes: 'down' }); K.sweat = 0.3; K.lean = 0.1; }
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
    if (!OUT[id] && t >= CUES.empty && t < CUES.empty + 1.0) {
      const near = HOLD.map((h) => [h, Math.abs(SEAT.Z[KING[h].seat] - z) + (KING[h].side === k.side ? 0 : 0.4)]).sort((a, b) => a[1] - b[1])[0][0];
      K.look = [SIDE_SIGN[KING[near].side] * 1.6, 0.55, SEAT.Z[KING[near].seat]]; K.face = { eyes: 'side', brows: 'raised', mouth: 'flat' }; K.lean = 0.0; K.rise = 0.1;
    }
    // ---- auto: he leans back, the screen plays itself; he laughs
    if (auto && t < RED_T && t > AUTO[id] + 0.2 && !(t >= CUES.empty && t < CUES.empty + 1.0)) {
      const lb = ease(t, AUTO[id] + 0.3, AUTO[id] + 1.1);
      K.rise = lerp(0.4, 0, lb); K.lean = lerp(0.15, -0.16, lb); K.sweat = 0.5 * (1 - lb);
      const up = Math.sin(t * 1.9 + z) > 0.1 || (t >= CUES.empty + 1.0 && t < CUES.allAuto + 0.5);
      K.face = up ? face('laugh') : face('proud', { mouth: 'grin', eyes: 'down' });
      K.look = up ? [sx * -0.6, 0.95, z * 0.6] : [f.c[0] - sx * 0.25, 0.12, f.c[2]];
      if (!lead && Math.sin(t * 0.9 + z * 2) > 0.92) K.face = { eyes: 'closed', brows: 'raised', mouth: 'open' };
    }
    // ---- the internal cards: the smile freezes; the dead cancel; 系统异常; they blame each other; the storm
    if (t >= RED_T && t < STOP) {
      K.look = f.c; K.rise = 0.3; K.lean = 0.1; K.sweat = 0.6;
      K.face = t < CUES.freeze + (lead ? 0.7 : 1.8) ? face('proud', { mouth: 'grin', eyes: 'wide' }) : face('worry');
      if (t > CUES.cancel) { K.face = face('fear'); K.rise = 0.26; K.lean = 0.06; K.sweat = 1; }
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
      K.rise = lerp(0.35, 0.05, ease(t, STOP, STOP + 1.2)); K.lean = lerp(0.05, 0.12, ease(t, STOP, STOP + 1.5)); K.sweat = 1;
      K.look = t < CUES.rise ? [0, 0.55, 0] : [sx * 0.15, lerp(1.2, 2.8, ease(t, CUES.rise, CUES.eye + 2)), -0.1];
      K.face = t < CUES.rise ? { eyes: 'blank', brows: 'raised', mouth: 'slack' } : t < CUES.eye ? face('fear') : { eyes: 'up', brows: 'worried', mouth: t < CUES.lookUp + 1.4 ? 'open' : 'o' };
    }
    // ---- the deal: the screen lights; they look; they smile; they reach; they never look up
    if (t >= CUES.deal) {
      K.look = t < CUES.deal + 0.5 ? [sx * 0.15, 2.4, -0.1] : f.c; K.lean = 0.1; K.rise = 0.15; K.sweat = t < CUES.smile ? 0.6 : 0.15;
      K.face = t < CUES.smile ? face('worry', { eyes: 'down' }) : t < CUES.smile + 1.2 ? { eyes: 'down', brows: 'flat', mouth: 'smirk' } : { eyes: 'narrow', brows: 'arch', mouth: 'grin' };
      if (t > CUES.shadow) K.face = { eyes: 'narrow', brows: 'arch', mouth: 'grin' };
    }
    // ---- the arm
    let h = handFor(id, t, K.rise);
    if (id !== 'glm' && t >= SMASH.hit && t < CUES.big - 0.3) h = null;   // thrown back by the smash: nobody's finger stays over his screen
    if (pointTo) { K.armR = { target: pointTo, pole: [0, -1, 0] }; K.hand.R = 'point'; }
    else if (h && !(auto && t < CUES.cancel && h.kind !== 'auto')) { K.armR = arm(id, h.target, { fingers: h.fingers, ...(h.tip ? { tip: 1, pose: h.pose } : {}) }); K.hand.R = h.pose; }
    else K.hand.R = 'rest';
    // hands off: leaning back on 托管, both hands in the lap (until the red cards make them grab for the screen again)
    if (auto && t > AUTO[id] + 0.5 && t < RED_T && !pointTo && !(h && h.kind)) {
      const lap = ease(t, AUTO[id] + 0.5, AUTO[id] + 1.2);
      if (lap > 0.05) { const rz = KING[id].side === 'CN' ? 1 : -1; K.armR = { target: lerp3(kingRestHand(id, 'R'), [sx * 1.42, 0.0, z + rz * 0.27], lap), pole: [0, -0.6, rz * 0.8] }; K.armL = { target: lerp3(kingRestHand(id, 'L'), [sx * 1.42, 0.0, z - rz * 0.27], lap), pole: [0, -0.6, -rz * 0.8] }; K.hand.R = 'rest'; K.hand.L = 'rest'; }
    }
  }
}
// where kings.js rests a hand (restHand there): beside his screen, on the table
const kingRestHand = (id, side, rise = 0) => { const s = 1.22 * KING[id].size, near = 0.42 * s; return [sxOf(id) * (SEAT.X - near - rise * Math.max(0, 1.02 - near)), 0.052, SEAT.Z[KING[id].seat] + (side === 'R' ? -1 : 1) * (0.39 * s + 0.05 * rise) * (KING[id].side === 'CN' ? -1 : 1)]; };

// ---------------------------------------------------------------- (v19) his hand, slot by slot
// A card he plays leaves its slot empty; the next card of that slot is dealt in half a second later. Slots 0..3 hold his
// own cards (the small old ones when nothing else is there); slot 4 is where the card the AI suggests appears.
const REFILL = 0.5;
let HANDTL = null;
function handTL() {
  if (HANDTL) return HANDTL;
  HANDTL = {};
  for (const id of IDS) {
    const slots = [[], [], [], [], []];
    const M = S.plays().filter((p) => p.who === id && p.style !== 'auto' && p.style !== 'red').sort((a, b) => a.tr - b.tr);
    let lastAI = null;
    for (const p of M) {
      const L = slots[p.slot], prev = L[L.length - 1];
      const t0 = p.fresh ? (p.hintT != null ? p.hintT + 0.06 : Math.max((lastAI ? lastAI.tr : -1e9) + 0.14, p.tr - 0.8)) : p.tr < CUES.chat ? -1e9 : Math.max(prev ? prev.t1 + REFILL : -1e9, CUES.chat + 1.2);   // the models are dealt once ChatGPT has landed
      L.push({ t0, t1: p.tr, face: p.face, ai: p.fresh ? 1 : 0 });
      if (p.fresh) lastAI = p;
    }
    // the AI's next pick, waiting: the one he is too slow to tap (OpenAI's time-out; the holdouts')
    const end = OUT[id] ? OUT[id].out : AUTO[id];
    if (lastAI && end < 1e9 && end > lastAI.tr + 0.4) slots[AI_SLOT].push({ t0: lastAI.tr + 0.3, t1: end, face: CELL[`${id}${REAL_N[id] - 1}`], ai: 1 });
    HANDTL[id] = slots;
  }
  return HANDTL;
}
function handAt(id, t) {
  const out = [];
  handTL()[id].forEach((L, i) => {
    const e = L.find((x) => x.t0 <= t && t < x.t1);
    if (e) { out.push({ c: e.face, k: clamp((t - e.t0) / 0.2), ai: e.ai }); return; }
    // nothing waiting here: his small old cards, once every card of his own from this slot has been played
    const last = [...L].reverse().find((x) => !x.ai), tIdle = Math.max(CUES.chat + 1.2, last ? last.t1 + REFILL : -1e9);
    if (i < AI_SLOT && t >= tIdle && !L.some((x) => !x.ai && x.t1 > t)) out.push({ c: { id, name: S.MINOR[id][i] }, k: clamp((t - tIdle) / 0.2), ai: 0 });
    else out.push({ c: null, k: 0, ai: 0 });
  });
  return out;
}
// under 托管 the top row is the machine's own: each slot shows the model it will play from there next (the numbers keep
// climbing); a card leaves, the next is there a moment later
let AUTOTL = null;
function autoHandAt(id, t) {
  if (!AUTOTL) { AUTOTL = {}; for (const p of S.plays()) if (p.style === 'auto' && !p.ghost) ((AUTOTL[p.who] ??= [[], [], [], [], []])[p.slot]).push(p); }
  return (AUTOTL[id] ?? [[], [], [], [], []]).map((L, i) => {
    let prev = null, next = null;
    for (const p of L) { if (p.tr <= t) prev = p; else { next = next ?? p; break; } }
    if (prev && t < prev.tr + 0.16) return null;
    return { id, name: next ? next.name : prev ? prev.name : S.MINOR[id][i % 4] };
  });
}
// the bottom row: 0 face down, 1 turned up (it is about to be played, or has been: the machine keeps them coming), -1 gone for a moment
let REDTL = null;
function lowAt(id, t) {
  if (!REDTL) { REDTL = {}; for (const p of S.plays()) if (p.style === 'red' && !p.ghost) ((REDTL[p.who] ??= [[], [], [], [], [], []])[p.slot]).push(p); }
  return (REDTL[id] ?? [[], [], [], [], [], []]).map((T) => { let st = 0, cell = null; for (const p of T) { if (p.tr - 0.45 > t) break; st = t >= p.tr && t < p.tr + 0.16 ? -1 : 1; cell = p.face; } const nx = T.find((p) => p.tr > t - 0.16); return { st, cell: nx && st ? nx.face : cell }; });
}

// ---------------------------------------------------------------- screens
let MANTR = null;
function screensState(t) {
  const out = {};
  const P = S.plays();
  for (const k of KINGS) {
    const id = k.id;
    if (t >= AFTER) { out[id] = { on: 1, hand: [], hidden: 0, red: [], flipped: 0, hi: -1, tap: -1, press: null, auto: 1, deal: null, out: 1, human: 1 }; continue; }
    if (t >= BLACK) continue;
    const s = { on: 1, hand: [], hidden: 6, red: [1, 4], hi: -1, tap: -1, press: null, auto: t >= AUTO[id] ? 1 : 0, deal: null };
    if (t >= AUTO[id]) {
      // the machine plays: a card leaves its slot, the next is there a moment later
      s.hand = autoHandAt(id, t);
    } else {
      const H = handAt(id, t);
      s.hand = H.map((x) => x.c); s.handK = H.map((x) => Math.round(x.k * 4) / 4);
      if (H[AI_SLOT].ai) { if (t >= SEMI[id]) s.aiPick = AI_SLOT; else s.hi = AI_SLOT; }
      if (t >= CUES.stuck) s.aiSlot = AI_SLOT;
    }
    if (FINAL.includes(id)) s.red = [1, 3, 4];
    if (t >= RED_T - 0.5) { const LW = lowAt(id, t); s.low = LW.map((x) => x.st); s.lowC = LW.map((x) => x.cell); }
    if (id === FINAL[0] && t >= PASS.t0 && t < HINTS[FINAL[0]][0][0]) s.pass = 1;
    if (t < AUTO[id] && !(OUT[id] && t >= OUT[id].out)) {
      const L = S.limitFor(id, t);
      if (L < 1.2) s.limit = L;
      else {
        // (v20) the seconds he has left: his round began when he last played a card
        const T = (MANTR ??= Object.fromEntries(IDS.map((k) => [k, P.filter((p) => p.who === k && p.style !== 'auto' && p.style !== 'red').map((p) => p.tr).sort((a, b) => a - b)])))[id];
        let t0 = -9; for (const x of T) { if (x > t) break; t0 = x; }
        const L0 = S.limitFor(id, Math.max(0, t0)), left = Math.max(1, Math.min(L, L0 - (t - t0)));
        s.limit = Math.ceil(left - 1e-6); s.limitK = Math.round((left / Math.max(L0, left)) * 60) / 60;
      }
    }
    if (t >= SEMI[id] && t < AUTO[id]) s.semi = 1;
    for (const tt of TIMEOUT[id] ?? []) if (t > tt && t < tt + 0.45) s.timeout = 1;
    if (t >= AUTO[id]) s.full = 1;
    if (INVITE[id] != null && t >= INVITE[id] && t < AUTO[id] && !(OUT[id] && t >= OUT[id].out) && !s.timeout) s.invite = 1;
    if (t > AUTO[id] + 0.12 && t < AUTO[id] + (id === 'openai' ? 1.35 : 1.3)) s.toast = 'full';
    if (OUT[id]) {
      const o = OUT[id];
      o.pass.forEach((pt) => { if (t > pt && t < pt + 0.3) s.shake = AI_SLOT; });
      if (t >= o.out) { s.out = Math.round(clamp((t - o.out) / 0.25) * 4) / 4; s.auto = 0; s.red = []; s.hand = []; s.hidden = 0; }
    }
    for (const [pt, slot] of id === FINAL[0] ? PASS.taps : []) if (t > pt && t < pt + 0.3) s.shake = slot;
    const rk = FINAL.includes(id) ? 0 : mulberry32(KING[id].seat * 11 + (sxOf(id) > 0 ? 5 : 0))();
    if (!OUT[id] && t >= ERR_T + rk && t < EYE_SCREEN + rk * 0.6) { s.error = 1; s.attacker = KING[FINAL.includes(id) ? other(id) : oppOf(id)].name; }
    if (!OUT[id] && t >= EYE_SCREEN + rk * 0.6) s.eye = Math.round(clamp((t - EYE_SCREEN - rk * 0.6) / 0.4) * 10) / 10;
    const h = handFor(id, t);
    if (h && h.on && (h.kind === 'hint' || h.kind === 'auto' || h.kind === 'cancel')) s.press = h.kind;
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
  const [u0, v0] = slotUV(p.style === 'red' ? 1 : 0, p.slot);
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
  let q = mulQ(slerpQ(qs, rest.q, smooth(u)), axisQ([0, 0, 1], spin));
  if (p.crush) q = mulQ(axisQ([0.839, 0, 0.545], 0.55 * smooth(clamp((u - 0.4) / 0.3)) * (1 - smooth(clamp((u - 0.9) / 0.1)))), q);
  return { pos, q, scale: p.scale ?? 1 };
}
function chatFlight(p, t, rest) {
  // ChatGPT: out of OpenAI's screen, up over the middle of the table, hangs, then slaps down
  const f = screenFrame(p.who), from = screenPoint(p.who, ...slotUV(0, p.slot), 0.01), qs = basisQ(f.n, f.up);
  const top = [0.05, 0.42, 0.02], hang = p.t - 0.28;
  if (t < hang) { const e = smooth((t - p.tr) / (hang - p.tr)); return { pos: [lerp(from[0], top[0], e), lerp(from[1], top[1], Math.sqrt(e)), lerp(from[2], top[2], e)], q: slerpQ(qs, rest.q, e), scale: lerp(0.5, 1.15, e) }; }
  const u = clamp((t - hang) / 0.28);
  return { pos: lerp3(top, rest.pos, u * u * u), q: rest.q, scale: lerp(1.15, 1, u) };
}
export function smashPos(t) { const p = S.plays().find((q) => q.style === 'smash'); const d = S.heap().D.find((x) => x.play === p); return smashFlight(p, t, d.rest).pos; }
function smashFlight(p, t, rest) {
  // R1: straight and flat out of DeepSeek's screen into the house, then skids on
  const f = screenFrame(p.who), from = screenPoint(p.who, ...slotUV(0, p.slot), 0.02), qs = basisQ(f.n, f.up);
  const flat = basisQ([0, 1, 0], [1, 0, 0]);
  if (t < SMASH.hit) {
    const u = clamp((t - p.tr) / (SMASH.hit - p.tr)), UA = 0.13, a = smooth(clamp(u / UA));
    const p1 = [0, 1, 2].map((i) => from[i] + f.n[i] * (0.03 + 0.12 * a) + f.up[i] * 0.36 * a);
    if (u < UA) return { pos: p1, q: qs, scale: p.scale * (0.4 + 0.3 * a) };
    const v = (u - UA) / (1 - UA), e = v * (0.75 + 0.25 * v), c1 = [p1[0] - sxOf(p.who) * 0.5, p1[1] + 0.1, p1[2] + (HOUSE_HIT[2] - p1[2]) * 0.12];
    const pos = lerp3(lerp3(p1, c1, e), lerp3(c1, HOUSE_HIT, e), e); pos[1] += 0.05 * Math.sin(Math.PI * Math.min(1, v * 1.2));
    return { pos, q: slerpQ(qs, flat, clamp(v * 3.5)), scale: p.scale * Math.min(1, 0.7 + v * 2.5) };
  }
  const u = clamp((t - SMASH.hit) / (p.t - SMASH.hit));
  return { pos: lerp3(HOUSE_HIT, rest.pos, 1 - (1 - u) ** 2), q: slerpQ(flat, rest.q, u), scale: p.scale };
}
function scatterPose(d, t) {
  const c = d.sc, u = clamp((t - c.t0) / (c.t1 - c.t0)), p0 = d.restTower.pos, p1 = c.gone ? c.end : d.rest.pos;
  const pos = [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u * u) + 4 * c.h * u * (1 - u), lerp(p0[2], p1[2], u)];
  return { pos, q: mulQ(axisQ(c.axis, c.turns * Math.PI * 2 * u), slerpQ(d.restTower.q, c.gone ? d.restTower.q : d.rest.q, u)) };
}
function giantFlight(p, t, rest) {
  // GPT-4.5: rises out of OpenAI's screen, swells overhead, comes down on the pile
  const f = screenFrame(p.who), from = screenPoint(p.who, ...slotUV(0, p.slot), 0.01);
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
  // (v19) one continuous move: the cards that went up stream out of the vortex into a great almond of card backs (the
  // eye, shut), centre first; then it opens: from the slit outward every card turns over, the lids' edge riding the wave
  const G0 = CUES.eye - 1.0;
  if (t < G0 || t >= BLACK) return;
  const open = 0.5 - 0.5 * Math.cos(Math.PI * clamp((t - EYE.open0) / (EYE.open1 - EYE.open0)));
  const look = 0.3 * Math.sin((t - EYE.open1) * 0.6) * clamp((t - EYE.open1) / 2), K = 1.7;
  S.eyeSlots().forEach((s, i) => {
    const r = mulberry32(i * 13 + 5), rim = s.kind === 'rim', rho = Math.min(1, Math.hypot(s.x / 5.6, (rim ? 0 : s.z) / 2.6));
    const tS = G0 + 1.5 * Math.pow(rho, 0.9) + 0.2 * r(), g = clamp((t - tS) / 1.15);
    if (g <= 0) return;
    const lid = s.lid ?? S.eyeLid(s.x), fixed = s.kind === 'white' || rim;
    const zNow = rim ? s.z * Math.max(0.03, lid * open) : s.z;
    const dy = s.kind === 'glint' ? -0.16 : s.kind === 'pupil' ? -0.1 : s.kind === 'iris' ? -0.05 : rim ? -0.02 : 0.05;
    const slot = [EYE.c[0] + (s.x + (fixed ? 0 : look)) * K, EYE.c[1] + dy, EYE.c[2] + zNow * K];
    // when the opening reaches this card it turns over (0.3 s): its back was the lid, its face is the eye
    let f = 1;
    if (!rim) { const oS = clamp((Math.abs(s.z) - 0.02) / Math.max(0.05, lid)), tF = EYE.open0 + (EYE.open1 - EYE.open0) * (Math.acos(1 - 2 * oS) / Math.PI); f = smooth(clamp((t - tF) / 0.3)); }
    const qOpen = basisQ([0, -1, 0], [Math.cos(s.yaw), 0, Math.sin(s.yaw)]);
    let q = f >= 1 ? qOpen : mulQ(qOpen, axisQ([0, 1, 0], Math.PI * (1 - f))), pos = slot;
    const full = (s.kind === 'white' ? 2.25 : rim ? 1.5 : 1.8) * 1.7;
    let scale = full;
    if (g < 1) {
      // up out of the vortex, round and outward, to its place
      const e = smooth(g), a1 = Math.atan2(slot[2] - RISE.axis[1], slot[0] - RISE.axis[0]), R1 = Math.hypot(slot[0] - RISE.axis[0], slot[2] - RISE.axis[1]);
      const a = a1 - (1 - e) * (1 - e) * (2.2 + 1.5 * r()), R = lerp(1.0 + 0.8 * r(), R1, e), y = lerp(4.2 + 1.2 * r(), slot[1], 1 - (1 - g) * (1 - g));
      pos = [RISE.axis[0] + Math.cos(a) * R, y, RISE.axis[1] + Math.sin(a) * R];
      q = mulQ(q, axisQ([0.3, 1, 0.2], (1 - e) * (5 + 4 * r())));
      scale = lerp(1.3, full, e);
    }
    // the white of the eye: blank cards; the iris: black and gold; the pupil: black; the lids: the backs of both decks
    const face = s.kind === 'pupil' || s.kind === 'iris' ? CELL.backBlack : rim ? (i % 2 ? CELL.backCN : CELL.backUS) : CELL.blank;
    const glow = s.kind === 'pupil' ? 0 : s.kind === 'iris' ? 0.6 : s.kind === 'glint' ? 0.9 : rim ? 0.6 : 0.8;
    out.push({ pos, q, scale, face, back: rim ? CELL.backBlack : i % 2 ? CELL.backCN : CELL.backUS, glyph: 0, writhe: 0, dim: s.kind === 'pupil' ? 0.93 * f : 0, glow: lerp(0.5, glow, f) });
  });
}
function cardsState(t, st) {
  const out = st.free;
  const { D } = S.heap();
  const housePlays = S.plays().filter((q) => q.dest === 'house');
  // ---- the heap (until it rises)
  const hMax = (cardsState.hMax ??= Math.max(0.2, ...D.map((d) => d.rest.pos[1])));
  const liftOf = (d) => RISE.t0 + 0.5 + (RISE.t1 - RISE.t0 - 0.7) * clamp(1 - d.rest.pos[1] / hMax) ** 1.3 + (d.i % 7) * 0.03;
  for (const d of D) {
    if (d.t > t) continue;
    const base = { face: d.face, back: d.back, scale: d.scale, glyph: d.glyph ?? 0, gcell: d.gcell ?? CELL.glyph0, writhe: d.writhe ?? 0, glow: d.red ? 0.08 : 0 };
    let pose = { pos: d.rest.pos, q: d.rest.q };
    if (d.restTower) { if (t < d.sc.t0) pose = d.restTower; else if (t < d.sc.t1) { pose = scatterPose(d, t); base.glow = 0.4; } else if (d.sc.gone) continue; }
    if (d.blown && t >= CHAT_T) { const b = blastCard(d, t); if (b.gone) continue; pose = b; base.glow = 0.35; }
    if (d.play?.chat) base.glow = 0.07 * ease(t, d.t + 0.05, d.t + 0.5) * (1 - ease(t, at('2-09'), at('3-01', 1.0)));
    if (t > STOP) {
      const l = liftOf(d);
      base.glow = Math.max(base.glow, 0.25);
      if (t > l) { pose = riseFrom(pose, l, t, ((d.i * 0.618) % 1)); if (pose.pos[1] > 6.6 || t - l > 3.4) continue; base.glow = 0.35; }
    }
    out.push({ ...base, ...pose });
  }
  // ---- cards in the air
  for (const p of S.plays()) {
    if (t < p.tr || t >= p.t) continue;
    const base = { face: p.face, back: p.back, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.writhe ?? 0, glow: p.red ? 0.45 : 0.3 };
    if (p.dest === 'house') { const s = housePlays.indexOf(p); out.push({ ...base, ...screenFlight(p, t, slotPose(s)) }); continue; }
    const d = D.find((x) => x.play === p);
    if (!d) continue;
    if (p.style === 'giant') { out.push({ ...base, ...giantFlight(p, t, d.rest) }); continue; }
    if (p.style === 'chat') { out.push({ ...base, ...chatFlight(p, t, d.rest) }); continue; }
    if (p.style === 'smash') { out.push({ ...base, ...smashFlight(p, t, d.rest) }); continue; }
    if (t > STOP) continue;
    if (p.who === FINAL[0] && t > CUES.error && t < CUES.cancelUS) continue;
    if (p.who === 'openai' && t > CUES.cancelUS - 0.3 && t < CUES.accuse) continue;
    if (FINAL.includes(p.who) && t > CUES.eyes - 0.5 && t < CUES.blizzard) continue;   // (v8) nothing flies across his warning while we read it
    out.push({ ...base, ...screenFlight(p, t, d.restTower ?? d.rest) });
  }
  // the house standing
  housePlays.forEach((p, s) => {
    const f = S.houseFall(s);
    if (t < p.t || t >= f.t1) return;
    const d = D.find((x) => x.house === s);
    out.push({ face: p.face, back: p.back, scale: 1, ...houseCard(s, t, d.rest) });
  });
  // ---- (v11) after: nobody at the table; the screens go on playing each other, fast and even
  if (t >= AFTER && t < CUES.title + 0.5) {
    const N = Math.floor((CUES.title + 0.5 - AFTER) / 0.08);
    for (let i = 0; i < N; i++) {
      const tr = AFTER - 1.2 + i * 0.08, r = mulberry32(i * 53 + 11), who = IDS[(i * 3) % IDS.length];
      if (t < tr) break;
      if (who === 'openai' && tr < AFTER + 2.45) continue;   // nothing crosses the verdict while we read it (the whole first cut)
      const a = r() * Math.PI * 2, d = 0.2 * Math.sqrt(r());
      const yw = r() * 6.28, rest = { pos: [Math.cos(a) * d * 0.8, CARD_Y + 0.0009 * i, -0.05 + Math.sin(a) * d * 1.5], q: flatQ(Math.cos(yw), Math.sin(yw)) };
      const p = { who, slot: i % 5, tr, t: tr + 0.55, i, style: 'tap', scale: 1.25 };
      const base = { face: CELL[`future_${who}_3`], back: KING[who].side === 'CN' ? CELL.backCN : CELL.backUS, glyph: 0, gcell: CELL.glyph0, writhe: 0, glow: 0.1 };
      out.push(t < p.t ? { ...base, ...screenFlight(p, t, rest) } : { ...base, ...rest, scale: 1.25 });
    }
  }
  // ---- (v15) the storm (6-09): the internal cards pour out of every screen and wheel over the table, more every
  // moment; at the stop (7-01) every one of them hangs where it is; then they go up with the pile
  if (t >= CUES.blizzard && t < BLACK) {
    const T0 = CUES.blizzard, N = 300, ids = IDS.filter((id) => !HOLD.includes(id)), ts = Math.min(t, STOP), D = STOP - T0 - 0.2;
    for (let i = 0; i < N; i++) {
      const r = mulberry32(i * 71 + 9), b = T0 + 0.05 + D * Math.sqrt((i + 0.5) / N);
      if (ts < b) break;
      const who = ids[i % ids.length], f = screenFrame(who), from = screenPoint(who, 0.2 + 0.6 * r(), 0.3, 0.02), s = ts - b;
      const a0 = Math.atan2((from[2] - RISE.axis[1]) / 1.6, from[0] - RISE.axis[0]), R0 = Math.hypot(from[0] - RISE.axis[0], (from[2] - RISE.axis[1]) / 1.6);
      const w = 1.5 + 1.9 * r(), R1 = 0.4 + 1.25 * r(), H = 0.25 + 2.3 * Math.pow(r(), 1.4), tum = 3 + 5 * r(), seed = r();
      const ang = a0 + w * s, rad = lerp(R0, R1, smooth(clamp(s / 0.9))), y = from[1] + H * (1 - Math.exp(-s * 1.7)) + 0.07 * Math.sin(s * 5 + i);
      let pose = { pos: [RISE.axis[0] + Math.cos(ang) * rad, y, RISE.axis[1] + Math.sin(ang) * rad * 1.6], q: mulQ(axisQ([0, 1, 0], -ang), axisQ([1, 0, 0.3], s * tum + i)) };
      if (s < 0.14) pose.q = slerpQ(basisQ(f.n, f.up), pose.q, s / 0.14);
      const l = RISE.t0 + (RISE.t1 - RISE.t0) * 0.75 * clamp(1 - y / 2.2) + (i % 7) * 0.03;
      if (t > l) { pose = riseFrom(pose, l, t, seed); if (pose.pos[1] > 6.6 || t - l > 3.4) continue; }
      out.push({ face: CELL[`future_${who}_${2 + (i % 2)}`], back: KING[who].side === 'CN' ? CELL.backCN : CELL.backUS, glyph: 0, gcell: CELL.glyph0, writhe: 0, glow: 0.45, scale: (1.1 + 0.5 * seed) * Math.min(1, 0.35 + s / 0.14), ...pose });
    }
  }
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
    if (u > 9) R.push({ kind: 'crumb', pos: [S.ANT_CRUSH[0] + 0.033 + 0.07 * e, 0.0034, S.ANT_CRUSH[1] + 0.05 + 0.08 * e], q: axisQ([1, 0, 0.3], e * 9), scale: 1.45 });
  }
  return R;
}

// ---------------------------------------------------------------- the ant
function antState(t) {
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  return { show: 1, pos: A.pos, q: basisQ([dx, 0, dz], [0, 1, 0]), walk: A.dist / ANT.STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 0, crumbTilt: 0, size: 1 };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: {} };
  const giant = S.plays().find((p) => p.style === 'giant');
  const swX = kick(t, giant.t, 0.55, 0.9) * 0.07 + kick(t, SMASH.hit, 0.5, 0.9) * 0.04 + kick(t, CHAT_T, 0.5, 0.9) * 0.05 + (t > CUES.blizzard && t < STOP + 3 ? Math.sin(t * 2.3) * 0.11 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const swZ = kick(t, giant.t + 0.05, 0.5, 0.9) * 0.045 + (t > CUES.blizzard && t < STOP + 3 ? Math.cos(t * 1.9) * 0.08 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const circ = t > RISE.t0 ? 0.16 * ease(t, RISE.t0, RISE.t0 + 1.5) * (1 - ease(t, RISE.t1 + 0.5, CUES.lookUp + 1.5)) : 0, ca = (t - RISE.t0) * 3.2;
  st.set = {
    lamp: { on: 1, swing: [swX + circ * Math.cos(ca), swZ + circ * Math.sin(ca)], flicker: t > CUES.blizzard && t < STOP ? 0.25 * Math.max(0, Math.sin(t * 37) * Math.sin(t * 11.3)) : 0 },
    ceiling: t > S.CEIL_GONE && t < AFTER ? 0 : 1,
    wobble: kick(t, giant.t, 2.2, 5) * -0.004 + kick(t, CHAT_T, 2, 5) * -0.003,
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 0, gold: 0, flood: null }, board: { show: 0 },
  };
  st.props = { plates: { show: t < BLACK || t >= AFTER ? 1 : 0 } };
  kingsState(t, st);
  { // (v11) nothing snaps: body and gaze are a weighted average of the last 0.3 s (the faces still change on the cut)
    const W = [[0.07, 0.3], [0.14, 0.22], [0.21, 0.14], [0.28, 0.08]], w0 = 0.26;
    const acc = {}; for (const id of IDS) { const K = st.kings[id]; acc[id] = { rise: K.rise * w0, lean: K.lean * w0, slump: K.slump * w0, look: K.look.map((v) => v * w0), cl: (K.lookCalm ?? K.look).map((v) => v * w0) }; }
    for (const [d, w] of W) { const s2 = { kings: {} }; kingsState(t - d, s2); for (const id of IDS) { const K = s2.kings[id], A = acc[id]; A.rise += (K.rise ?? 0) * w; A.lean += (K.lean ?? 0) * w; A.slump += (K.slump ?? 0) * w; for (let i = 0; i < 3; i++) { A.look[i] += K.look[i] * w; A.cl[i] += (K.lookCalm ?? K.look)[i] * w; } } }
    for (const id of IDS) { const K = st.kings[id]; if (K.enter === 0 || K.empty) continue; const { cl, ...A } = acc[id]; Object.assign(K, A); K.calm = { rise: K.rise, lean: K.lean, look: cl }; }
    // (v19) nobody is a statue: a slow breath and sway under every held pose (not in the dead stop of 7-01)
    if (!(t >= STOP && t < CUES.rise)) for (const k of KINGS) {
      const K = st.kings[k.id]; if (K.enter === 0 || K.empty) continue;
      const ph = k.seat * 2.1 + (k.side === 'US' ? 1.3 : 0);
      K.lean += 0.014 * Math.sin(t * 1.7 + ph); K.rise = Math.max(0, K.rise + 0.012 * Math.sin(t * 1.15 + ph * 1.7));
      K.look = [K.look[0], K.look[1] + 0.012 * Math.sin(t * 2.3 + ph), K.look[2] + 0.02 * Math.sin(t * 0.8 + ph)];
      // a tap is felt in the whole man: a small nod with every press of his finger
      let nod = 0; for (const p of presses()[k.id] ?? []) { if (p.t > t) break; if (t - p.t < 0.5) nod = Math.max(nod, Math.exp(-(t - p.t) * 9) * (p.kind === 'cancel' || p.kind === 'hard' ? 1.6 : 1)); }
      if (nod > 0.01 && !(t >= AUTO[k.id] + 0.6 && t < CUES.cancel)) { K.lean += 0.028 * nod; K.look = [K.look[0], K.look[1] - 0.03 * nod, K.look[2]]; }
    }
  }
  st.ant = antState(t);
  st.screens = screensState(t);
  st.lb = { ...S.leaderAt(t), show: t < BLACK || t >= AFTER ? 1 : 0, lit: t < STOP || t >= AFTER ? 1 : lerp(1, 0.1, ease(t, STOP, STOP + 1.2)) };
  st.rollers = rollersState(t);
  if (world?.lite) return st;
  cardsState(t, st);
  // ---- light: ChatGPT's glow on the faces; the red screens; the eye's cold light
  const chat = S.plays().find((p) => p.chat);
  if (t > chat.t && t < at('3-01', 1.5)) { const g = ease(t, chat.t, chat.t + 0.3) * (1 - ease(t, at('2-09'), at('3-01', 1.0))); st.look.p3 = { pos: [0, 0.2, 0], col: [0.38 * g, 0.55 * g, 0.42 * g], range: 2.2 }; }
  if (t > RED_T && t < STOP) { const g = ease(t, RED_T, RED_T + 1.5); st.look.p3 = { pos: [0, 0.6, 0], col: [0.9 * g, 0.12 * g, 0.08 * g], range: 3.0 }; }
  if (t > EYE.open0 - 1 && t < BLACK) { const g = ease(t, EYE.open0, EYE.open1); st.look.p2 = { pos: [0, EYE.c[1] - 5.5, 1.2], col: [0.5 * g, 0.48 * g, 0.42 * g], range: 22 }; }
  if (t > DEAL && t < BLACK) { const g = ease(t, DEAL, DEAL + 0.6); st.look.p3 = { pos: [0, 0.35, 0], col: [0.45 * g, 0.42 * g, 0.35 * g], range: 2.2 }; }
  // the last card's shadow: from the middle of the table outward, over the screens, over the smiling faces
  if (t > GIANT_END.t0 && t < BLACK) { const u = clamp((t - GIANT_END.t0) / (BLACK - GIANT_END.t0)), c = CUES.cover; const R0 = t < c ? lerp(0.25, 1.15, ease(t, GIANT_END.t0, c)) : lerp(1.15, 2.7, (t - c) / (BLACK - c)); st.look.shade = { at: [0, -0.05], r: [R0, R0 * 1.5], k: 0.93 * clamp(u * 4) }; }
  if (t > S.CRUSH - 0.5 && t < S.CRUSH - 0.05) { const u = clamp((t - (S.CRUSH - 0.5)) / 0.5); st.look.shade = { at: [S.ANT_CRUSH[0], S.ANT_CRUSH[1]], r: [lerp(0.16, 0.05, u), lerp(0.22, 0.07, u)], k: 0.85 * u }; }   // (v20) gone before the card is in front of it (it drew on the card's face)
  if (t >= BLACK && (t < AFTER || t >= CUES.title)) st.look.fade = 1;
  // ---- the title; the credits roll and stop on the writer, the one human; a card falls on his name. Black.
  if (t > CUES.title && t < CUES.credits) {
    const out = 1 - ease(t, CUES.credits - 0.45, CUES.credits - 0.08);
    st.titles = { zh: '', en: 'TOO SLOW', alpha: ease(t, CUES.title + 0.15, CUES.title + 0.7) * out, sub: 'Any resemblance to the real world is purely coincidental.', subAlpha: ease(t, CUES.title + 0.9, CUES.title + 1.4) * out };
  }
  // ---- (v19) the credits, at a machine's speed: ten jobs print themselves, every one AI. Then one line alone in the middle
  // of the frame: written by a human. The game's round timer lights under his name: 3, 2, 1. He does nothing. TOO SLOW,
  // stamped across him. And the last card of the film comes down on all of it: WRITTEN BY AI, AUTOPILOT ON. Black.
  if (t >= CUES.credits) {
    const c0 = CUES.credits, C = S.CREDITS, roles = ['Directed by', 'Storyboards', 'Animation', 'Characters', 'Art direction', 'Lighting', 'Modeling', 'Music', 'Sound', 'Editing'];
    const hit = C.hit, jolt = t > hit ? Math.exp(-(t - hit) * 14) * Math.sin((t - hit) * 95) * 0.03 : t > C.out ? Math.exp(-(t - C.out) * 18) * Math.sin((t - C.out) * 80) * 0.008 : 0;
    const tt = st.titles = { alpha: t > CUES.fin - 0.22 ? 0 : 1 };
    const LH = 0.062, listA = 1 - ease(t, c0 + 1.75, c0 + 2.1), n = Math.max(0, Math.min(roles.length, Math.floor((t - C.list0) / C.step) + 1));
    if (listA > 0 && n > 0) tt.roll = { y0: 0.5 - ((roles.length - 1) * LH) / 2, lines: roles.slice(0, n).map((r) => [r, 'AI']), lh: LH, alpha: listA, dx: 0.1 };
    const wA = ease(t, c0 + 2.15, c0 + 2.6);
    if (wA > 0 && t < hit) tt.writer = { alpha: wA, label: 'Written by a human', name: 'MakerJackie', y: 0.5 + jolt };
    if (t >= C.count[0] - 0.3 && t < hit) {
      const k = C.count.filter((x) => t >= x).length, left = t >= C.out ? 0 : Math.max(1, 4 - Math.max(1, k));
      tt.count = { alpha: ease(t, C.count[0] - 0.3, C.count[0] - 0.08), left, ph: t < C.count[0] ? 0 : ((t - C.count[0]) / (C.count[1] - C.count[0])) % 1 };
    }
    if (t >= C.out && t < hit) tt.stamp = { k: (t - C.out) / 0.09, y: 0.5 + jolt };
    // the swat: nothing moves, then in two frames the card is on him: a white flash, a hard jolt
    if (t > hit - 0.07) tt.slap = { u: clamp((t - (hit - 0.07)) / 0.07), y: 0.5 + jolt, dx: 0, h: 0.72, cell: 'aiAuto', fast: 1, alpha: tt.alpha };
    if (t > hit && t < hit + 0.09) tt.flash = 1 - (t - hit) / 0.09;
  }
  return st;
}
void face; void downQ; void easeOut; void kingRest; void kf; void CARD; void SLAM; void CARD_Y; void flatQ;
