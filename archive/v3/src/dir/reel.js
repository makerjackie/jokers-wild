// JOKERS WILD v3 reel — the base state of the world at film time t (docs/V3-REEL.md). The shots (cams.js) then place
// the camera and refine their moment. Everything here is a pure function of t.
import * as THREE from 'three';
import { KINGS, KING, SEAT, SIDE_SIGN, pressPos, THRONE, BOARD } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, easeIn, easeOut, mulberry32 } from '../util.js';
import { at, end, uRow, face, keys } from './core.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { MODELS } from '../models.js';
import { flatQ, downQ, basisQ, slerpQ, qFromMatrix } from '../freecards.js';
import { HEADS, STAMP_GRIP, CARD_Y, RED_HOME, BLUE_HOME, MEET, stamps, proposals, pileSpot, RIVER, riverCards, flatTime, FAN_ORDER, FAN_PAIR, WILD, PLAY } from './story.js';

const V = new THREE.Vector3(), M = new THREE.Matrix4(), M2 = new THREE.Matrix4();
const TAB_OFF = (0.5 - 0.31) * CARD.H;          // the 批准？ box sits this far below a card's centre (toward its bottom)

// ---------------------------------------------------------------- stamps per king and hand
let BY = null;
function byHand() {
  if (BY) return BY;
  BY = {};
  for (const s of stamps()) ((BY[s.who] ??= { L: [], R: [] })[s.hand]).push(s);
  return BY;
}
const contactY = (s) => (s.card != null && !s.miss ? CARD_Y : 0.0006);
// the palm target of one hand at t (null = not stamping now), and the rubber's squash
function stampHand(id, hand, t) {
  const L = byHand()[id]?.[hand];
  if (!L || !L.length || t < L[0].t - L[0].desc - 1.4 || t > L[L.length - 1].t + 0.9) return null;
  let n = L.findIndex((s) => s.t + 0.26 >= t);
  if (n < 0) n = L.length - 1;
  const s = L[n], p = n > 0 ? L[n - 1] : null;
  const hoverH = s.big ? 0.44 : (s.desc > 0.2 ? 0.26 : 0.17);
  const hov = (q, h) => [q.pos[0], contactY(q) + STAMP_GRIP + h, q.pos[1]];
  const con = (q) => [q.pos[0], contactY(q) + STAMP_GRIP - 0.004, q.pos[1]];
  let target, press = 0;
  if (t >= s.t) {                                   // contact, then the lift
    const u = (t - s.t) / 0.24;
    press = 1 - smooth((t - s.t - 0.05) / 0.12);
    target = lerp3(con(s), hov(s, 0.17), easeOut(clamp((u - 0.2) / 0.8)));
  } else if (t >= s.t - s.desc) {                  // the descent: accelerating
    const u = (t - (s.t - s.desc)) / s.desc;
    target = lerp3(hov(s, hoverH), con(s), u * u);
  } else {                                         // travel from the last lift (or ready) to above the next spot
    const from = p ? hov(p, 0.17) : readyHand(id, hand);
    const t0 = p ? p.t + 0.24 : s.t - s.desc - 1.2, t1 = s.t - s.desc;
    target = lerp3(from, hov(s, hoverH), smooth((t - t0) / Math.max(0.05, t1 - t0)));
  }
  return { target, press: clamp(press), s };
}
// an arm holding a stamp upright (kings dept: fist, fingers level toward the table, the palm facing his middle)
// `hole` is where the fist's hole (the handle) must be; the IK target is the palm, which sits behind the hole
// (kings GRIP_HOLE: 0.087 along the fingers, 0.032 out of the palm, times the king's scale)
const KSIZE = { openai: 1.12, deepseek: 0.94 };
function stampArm(id, hand, hole) {
  const k = KING[id], fx = -SIDE_SIGN[k.side];
  const pz = (k.side === 'US' ? 1 : -1) * (hand === 'R' ? 1 : -1);
  const sc = (KSIZE[id] ?? 1) * k.size;
  const target = [hole[0] - fx * 0.087 * sc, hole[1], hole[2] - pz * 0.032 * sc];
  return { target, pole: [0, -0.6, 0], fingers: [fx, 0, 0], palm: [0, 0, pz] };
}
// holding the stamp up, ready (the face ~7 cm above the cloth)
function readyHand(id, hand) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  const along = (hand === 'R') === (k.side === 'CN') ? 1 : -1;
  return [sx * 1.16, 0.2, z + along * 0.22 + (k.seat === 0 ? 0.25 : 0)];
}
// after the cards stop waiting: the stamp hangs in his lap-side hand, on the table edge
function idleHand(id, hand) {
  const k = KING[id], sx = SIDE_SIGN[k.side], z = SEAT.Z[k.seat];
  const along = (hand === 'R') === (k.side === 'CN') ? 1 : -1;
  return [sx * 1.3, 0.17, z + along * 0.24];
}

// ---------------------------------------------------------------- the proposal cards
const cardUp = (who) => [-SIDE_SIGN[KING[who].side], 0];          // top edge toward the sea
let PILE_IDX = null;
function pileIndex() {
  if (PILE_IDX) return PILE_IDX;
  const order = proposals().map((c, i) => [c.fly, i]).sort((a, b) => a[0] - b[0]);
  PILE_IDX = new Map(order.map(([, i], n) => [i, n]));
  return PILE_IDX;
}
function pressDir(world, id) {
  if (world?.props?.pressFrame) { world.props.pressFrame(id, M); const e = M.elements; const l = Math.hypot(e[8], e[10]) || 1; return [e[8] / l, e[10] / l]; }
  const p = pressPos(id), sp = proposals().find((c) => c.who === id).pos; const dx = sp[0] - p[0], dz = sp[1] - p[2], l = Math.hypot(dx, dz); return [dx / l, dz / l];
}
function pressMouth(world, id) {
  if (world?.props?.pressRamp) { const p = world.props.pressRamp(id, V).toArray(); return [p[0], Math.max(CARD_Y * 0.5, p[1]), p[2]]; }
  if (world?.props?.pressOut) { const p = world.props.pressOut(id, V).toArray(); return [p[0], Math.max(0.01, p[1]), p[2]]; }
  const p = pressPos(id); return [p[0] - SIDE_SIGN[KING[id].side] * -0.06, 0.03, p[2] + 0.1];
}
function proposalCards(t, world, list) {
  const P = proposals(), PI = pileIndex();
  const gcell = (i) => CELL[`glyph${(i * 7) % 16}`];
  for (let i = 0; i < P.length; i++) {
    const c = P[i];
    if (t < c.out) continue;
    const k = KING[c.who], s = SIDE_SIGN[k.side];
    const [ux, uz] = cardUp(c.who);
    const rest = [c.pos[0] + ux * TAB_OFF, CARD_Y * 0.5 + 0.0002, c.pos[1] + uz * TAB_OFF];
    const face = c.face ?? CELL[`${c.who}${(i * 3) % MODELS[c.who].length}`];
    const back = k.side === 'CN' ? CELL.backCN : CELL.backUS;
    const inkK = c.stamp != null && t >= c.stamp ? clamp((t - c.stamp) / 0.5) * 0.85 + 0.15 : 0;
    const base = { face, back, glyph: c.glyph, gcell: gcell(i), tab: 1, ink: inkK, inkCell: i % 2 ? CELL.ink1 : CELL.ink0, inkRot: ((i * 37) % 11 - 5) * 0.012 };
    if (t < c.land) {
      // out of the press's mouth, a skid across the cloth to the spot
      const u = easeOut((t - c.out) / (c.land - c.out));
      const m = pressMouth(world, c.who), d0 = pressDir(world, c.who);
      const pos = [lerp(m[0], rest[0], u), lerp(m[1], rest[1], smooth(u * 2.2)), lerp(m[2], rest[2], u)];
      const a0 = Math.atan2(d0[1], d0[0]), a1 = Math.atan2(uz, ux);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const a = a0 + da * smooth(u * 1.15);
      list.push({ ...base, pos, q: flatQ(Math.cos(a), Math.sin(a)) });
    } else if (t < c.fly) {
      list.push({ ...base, pos: rest, q: flatQ(ux, uz) });
    } else {
      // played: whipped up off the cloth and onto the pile
      const n = PI.get(i), ps = pileSpot(n);
      const d = Math.hypot(ps.pos[0] - rest[0], ps.pos[2] - rest[2]);
      const dur = 0.75 + d * 0.28 + (c.self ? 0.4 : 0);
      const u = clamp((t - c.fly) / dur);
      if (u >= 1) { list.push({ ...base, pos: ps.pos, q: flatQ(Math.cos(ps.yaw), Math.sin(ps.yaw)), tab: 0.0 + base.tab }); continue; }
      const e = smooth(u);
      const h = (c.self ? 0.55 : 0.34) * Math.sin(Math.PI * Math.min(1, u * 1.05)) + (c.self ? 0.2 * easeOut(u * 3) : 0);
      const pos = [lerp(rest[0], ps.pos[0], e), lerp(rest[1], ps.pos[1], e) + h, lerp(rest[2], ps.pos[2], e)];
      const spin = u * (2.2 + (i % 3)) * Math.PI;
      const q0 = flatQ(ux, uz), q1 = flatQ(Math.cos(ps.yaw), Math.sin(ps.yaw));
      const qs = slerpQ(q0, q1, e);
      const tw = new THREE.Quaternion(...qs).multiply(new THREE.Quaternion().setFromAxisAngle(V.set(0, 1, 0), Math.sin(spin) * 0.5 * (1 - e)));
      list.push({ ...base, pos, q: [tw.x, tw.y, tw.z, tw.w] });
    }
  }
}

// ---------------------------------------------------------------- the river and the vortex over the throne
function river(t, world, list, build) {
  const R = riverCards(t);
  const V0 = RIVER.vortex;
  for (const c of R) {
    const age = t - c.t0;
    const m = pressMouth(world, c.who);
    const r = mulberry32(Math.floor(c.seed * 1e6));
    const vr = 0.55 + 0.9 * r(), vh = V0[1] - 0.9 + 1.9 * r(), va0 = r() * Math.PI * 2, spd = 0.28 + 0.25 * r();
    if (build > 0 && r() < build * 1.05) continue;        // drawn into the card king as it assembles
    if (age > RIVER.flight + 6 + 3 * r()) continue;           // deep in the cloud over the throne: lost in the dark
    const face = CELL[`glyph${Math.floor(r() * 16)}`], back = KING[c.who].side === 'CN' ? CELL.backCN : CELL.backUS;
    let pos, q;
    if (age < RIVER.flight) {
      const u = age / RIVER.flight, e = smooth(u);
      // up out of the press, over the table toward the head, into the vortex's orbit
      const a = va0 + spd * age;
      const end = [V0[0] + Math.cos(a) * vr, vh, V0[2] + Math.sin(a) * vr * 0.6];
      const mid = [m[0] * 0.55, 0.55 + 0.35 * r(), lerp(m[2], end[2], 0.4)];
      const b = (p0, p1, p2) => (1 - e) * (1 - e) * p0 + 2 * e * (1 - e) * p1 + e * e * p2;
      pos = [b(m[0], mid[0], end[0]), b(m[1], mid[1], end[1]), b(m[2], mid[2], end[2])];
      // flapping like a bird: the card rocks about its long axis as it goes
      const fl = Math.sin(age * (9 + 4 * r()) + r() * 6) * 0.9;
      const dir = [end[0] - m[0], 0, end[2] - m[2]];
      const qq = new THREE.Quaternion(...basisQ([0, 1, 0], dir)).multiply(new THREE.Quaternion().setFromAxisAngle(V.set(0, 1, 0), fl));
      q = [qq.x, qq.y, qq.z, qq.w];
    } else {
      const a = va0 + spd * age;
      pos = [V0[0] + Math.cos(a) * vr, vh + 0.08 * Math.sin(age * 1.3 + r() * 6), V0[2] + Math.sin(a) * vr * 0.6];
      q = basisQ([Math.cos(a), 0.3, Math.sin(a) * 0.6], [0, 1, 0]);
    }
    list.push({ pos, q, face, back, glyph: 0, scale: 1, glow: 0.18 });
  }
}

// ---------------------------------------------------------------- the jokers
const JOKER_S = 1.7;
// 6-05: the fingertip reaches them: a flash, and they are a card
export const PAIR_LIFT = { t: at('6-05', 1.45) };
export const FAN_FACE = [0, 1.4, -1.0];      // the fan turns toward the fan cameras (6-04, 6-06)
export function jokerAt(side, t, world) {
  const s = SIDE_SIGN[side];
  if (t < CUES.moons) return null;
  const glow = 0.05 + 0.14 * ease(t, CUES.moons, CUES.moons + 1.4) + 0.12 * ease(t, CUES.pair + 0.4, CUES.pair + 0.6) * (1 - 0.6 * ease(t, CUES.pair + 0.7, CUES.flood + 0.8));
  // rising out of the river on each side of the two paper people, like two moons over the sea
  // born out of each head king's press: up out of the river of cards, then drifting in over the sea
  const born = ease(t, CUES.moons, CUES.moons + 0.7), rise = ease(t, CUES.moons + 0.5, CUES.moons + 1.7);
  let pos = [s * lerp(0.9, 0.42, rise), lerp(0.08, 0.55, born) - 0.13 * rise, lerp(-2.6, -2.16, rise)], yaw = 0;
  pos[1] += 0.01 * Math.sin(t * 2.1 + s);
  // facing each other a little (5-02), then the charge (5-03) to the stop (5-04), nose to nose
  const turn = ease(t, CUES.standUp, CUES.charge + 0.3);
  yaw = -s * 0.55 * turn;
  const ch = clamp((t - CUES.charge) / (CUES.faceoff - CUES.charge - 0.05));
  if (t > CUES.charge) { const e = ch * ch; pos = [lerp(pos[0], s * 0.13, e), lerp(pos[1], 0.31, e), lerp(pos[2], -2.08, e)]; yaw = -s * lerp(0.55, 1.05, e); }
  // the turn: side by side, facing the same way (the foot): a pair
  const tw = ease(t, CUES.pair + 0.05, CUES.pair + 0.45);
  if (t > CUES.pair) { pos = [s * lerp(0.13, 0.158, tw), 0.31 + 0.02 * tw, -2.08]; yaw = -s * 1.05 * (1 - tw); }
  let q = basisQ([Math.sin(yaw), 0, Math.cos(yaw)], [0, 1, 0]), scale = JOKER_S * (0.45 + 0.55 * born);
  // 6-01: up to the card king's face
  const up = ease(t, CUES.king + 0.15, CUES.king + 1.5);
  if (up > 0 && world?.cardking?.jokerFrame) {
    world.cardking.jokerFrame(side, M);
    const f = qFromMatrix(M);
    const sc = f.scale * CARD.W > 0 ? f.scale : JOKER_S;
    const arc = Math.sin(Math.PI * up) * 0.6;
    pos = [lerp(pos[0], f.pos[0], up), lerp(pos[1], f.pos[1], up) + arc, lerp(pos[2], f.pos[2], up)];
    q = slerpQ(q, f.q, up); scale = lerp(JOKER_S, sc, up);
  }
  return { pos, q, scale, glow, face: side === 'CN' ? CELL.jokerCN : CELL.jokerUS, back: CELL.backBlack };
}

// ---------------------------------------------------------------- the court cards and the fan
function fanSlot(world, i, t) {
  if (world?.cardking?.fanFrame) { world.cardking.fanFrame(i, M); return qFromMatrix(M); }
  // fallback until the card king's fan lands: a fan before its chest
  const c = world?.cardking?.chestPoint ? world.cardking.chestPoint(V).toArray() : [0, 2.2, -3.6];
  const a = (i - 5) * 0.16;
  return { pos: [c[0] + Math.sin(a) * 0.9, c[1] + 0.6 + Math.cos(a) * 0.3, c[2] + 0.9], q: basisQ([0, 0.1, 1], [Math.sin(a), Math.cos(a), 0]), scale: 4.4 };
}
function courtCards(t, world, list, st) {
  const ck = world?.kings;
  for (const id of FAN_ORDER) {
    const tf = flatTime(id);
    if (t < tf + 0.22) continue;
    let at0;
    if (ck?.cardFrame) { ck.cardFrame(id, M); at0 = qFromMatrix(M); const [w] = ck.cardSize(id); at0.scale = w / CARD.W; }
    else { const p = KING[id]; at0 = { pos: [SIDE_SIGN[p.side] * 1.62, 0.25, SEAT.Z[p.seat]], q: basisQ([-SIDE_SIGN[p.side], 0, 0], [0, 1, 0]), scale: 4.4 }; }
    const pop = clamp((t - tf - 0.22) / 0.18);
    const slot = FAN_ORDER.indexOf(id);
    const go = Math.max(tf + 0.55, CUES.rows + 0.25 + slot * 0.06), dur = 0.75;
    const u = clamp((t - go) / dur), e = smooth(u);
    let pos = at0.pos, q = at0.q, scale = at0.scale * (0.92 + 0.08 * pop);
    if (u > 0) {
      const f = fanSlot(world, slot, t);
      pos = lerp3(at0.pos, f.pos, e); pos[1] += Math.sin(Math.PI * u) * 0.8;
      q = slerpQ(at0.q, f.q, e); scale = lerp(scale, f.scale, e);
    }
    list.push({ pos, q, scale, face: CELL[`court_${id}`], back: CELL.backBlack, glow: 0.08 * (1 - e) });
  }
  void st;
}
// the height of the heap at (x, z): the highest pile card whose footprint covers it
function pileTopAt(x, z) {
  let y = 0;
  const n = proposals().length;
  for (let i = 0; i < n; i++) { const p = pileSpot(i).pos; if (Math.hypot(p[0] - x, p[2] - z) < 0.12) y = Math.max(y, p[1]); }
  return y + CARD.T;
}
// where the paper pair's card comes to rest on the heap (6-07)
let LAND = null;
export function pairLand() { return LAND ?? (LAND = [0.03, pileTopAt(0.03, 0.05) + 0.006, 0.05]); }
// the card with the two paper people: it slides into the fan (6-06), is played onto the pile (6-07) and covered
function pairCard(t, world, list) {
  if (t > PAIR_LIFT.t && t < CUES.us) {
    // where they stood: a card with their picture stands up off the cloth and rises with the fingertip
    const u = clamp((t - PAIR_LIFT.t) / (CUES.us - PAIR_LIFT.t));
    const up = smooth(u * 2.2);
    const q = slerpQ(flatQ(0, -1), basisQ([0, 0, 1], [0, 1, 0]), up);
    list.push({ pos: [MEET[0], CARD_Y + 0.095 * up + 0.06 * u * u, MEET[1] + 0.07 * up], q, scale: 0.7, face: CELL.pair, back: CELL.backBlack, glow: 0.08 + 0.12 * (1 - u) });
    return;
  }
  if (t < CUES.us) return;
  const land = pairLand();
  const top = land[1];
  if (t < CUES.play) {
    if (world?.cardking?.fanIn && world.cardking.fanIn(FAN_PAIR) <= 0) return;
    const f = fanSlot(world, FAN_PAIR, t);
    list.push({ pos: f.pos, q: f.q, scale: f.scale, face: CELL.pair, back: CELL.backBlack, glow: 0.3 });
    return;
  }
  // played: from high above, down onto the pile, face up
  const u = clamp((t - (PLAY.land - 0.45)) / 0.45);
  const from = [0.1, 1.4, -0.4];
  const pos = t < PLAY.land - 0.45 ? from : [lerp(from[0], land[0], u), lerp(from[1], land[1], u * u), lerp(from[2], land[2], u)];
  list.push({ pos, q: flatQ(0.15, -1), scale: 1, face: CELL.pair, back: CELL.backBlack, glow: 0.12 });
  // the next cards are thrown on top of it, skidding in from the side, face up: the game goes on
  for (const [k, tc, dx, dz, yaw, cell] of [[0, PLAY.cover, -0.55, 0.12, 0.35, CELL.glyph3], [1, PLAY.cover2, 0.5, -0.2, -0.5, CELL.glyph9]]) {
    if (t < tc - 0.28) continue;
    const v = clamp((t - (tc - 0.28)) / 0.28), e = 1 - (1 - v) * (1 - v);
    const end = [land[0] + 0.012 * (k ? -1 : 1), top + CARD.T * (1.2 + k), land[2] + 0.01 * (k ? 1 : -1)];
    const a = yaw * (1 - e) + (k ? -0.12 : 0.1);
    list.push({ pos: [lerp(end[0] + dx, end[0], e), end[1] + 0.06 * Math.sin(Math.PI * v), lerp(end[2] + dz, end[2], e)], q: flatQ(Math.sin(a), -Math.cos(a)), scale: 1, face: cell, back: CELL.backBlack });
  }
}

// ---------------------------------------------------------------- the paper people
function paperPeople(t) {
  const P = (o) => ({ show: 1, walk: 0, run: 0, wave: 0, down: 0, dive: 0, cower: 0, hold: 0, wind: 0, gold: 0, reach: null, shocks: [], ...o });
  const shocksFor = (x, z) => stamps().filter((s) => s.t <= t + 0.01 && t - s.t < 1.2).map((s) => [s.t, clamp((s.big ? 1.1 : 0.75) * (1 - Math.hypot(s.pos[0] - x, s.pos[1] - z) / 0.6))]).filter((s) => s[1] > 0.05);
  const goldK = clamp((t - CUES.flood) / 0.6) * (t > CUES.pair ? 1 : 0) + (t > CUES.pair ? 0.6 * clamp((t - CUES.pair - 0.4) / 0.3) : 0);
  // ---- red
  let rp = RED_HOME.slice(), rdir = [0.8, 0.6], rlook = [BLUE_HOME[0], 0.03, BLUE_HOME[1]];
  const red = {};
  red.wave = ease(t, at('1-02', 1.4), at('1-02', 1.8)) * (1 - ease(t, at('1-02', 3.0), at('1-02', 3.4)));
  if (t > at('1-03', 0.35)) { rdir = [-1, 0]; rlook = [-1.4, lerp(0.2, 0.75, ease(t, at('1-03', 0.5), at('1-03', 1.6))), -2.45]; }
  if (t > CUES.slide) rp = [lerp(RED_HOME[0], RED_HOME[0] + 0.035, ease(t, at('2-01', 0.75), at('2-01', 1.1))), RED_HOME[1]];
  // looking up at the hovering stamp; cowering as it comes; knocked flat; blown; up again
  const s1 = stamps().find((s) => s.who === 'deepseek');
  if (t > CUES.read) rlook = [s1.pos[0], 0.4, s1.pos[1]];
  red.cower = ease(t, s1.t - 0.35, s1.t - 0.12) * (1 - ease(t, s1.t, s1.t + 0.05));
  red.down = ease(t, s1.t, s1.t + 0.22) * (1 - ease(t, at('2-05', 0.4), at('2-05', 1.0)));
  red.wind = clamp(1 - Math.abs(t - (s1.t + 0.6)) / 0.4);
  if (t > s1.t) rp = [rp[0] + 0.025 * ease(t, s1.t, s1.t + 0.3) + 0.03 * ease(t, s1.t + 0.5, s1.t + 0.9), rp[1]];
  // @3: cowering under the stamps, then the run along the coast toward the head (3-04)
  if (t > CUES.faster) { rdir = [-1, 0]; red.cower = 0.5 + 0.3 * Math.sin(t * 3); rlook = [-0.8, 0.35, -2.2]; }
  if (t > CUES.run) {
    const u = clamp((t - CUES.run) / (end('3-04') - CUES.run));
    rp = [lerp(-0.6, -0.62, u), lerp(-1.98, -2.42, u)]; rdir = [0, -1]; red.run = 1 - ease(t, end('3-04', -0.1), end('3-04', 0.1)); red.walk = (t - CUES.run) * 7.5; red.cower = 0;
  }
  if (t > end('3-04')) { rp = [-0.62, -2.42]; rdir = [1, 0]; red.cower = 1; rlook = [-1.2, 0.6, -2.4]; }
  // 3-07: the blind stamp right at him: he looks up, dives toward the sea; it lands where he was
  if (t > CUES.near) {
    rlook = [WILD.pos[0], 0.5, WILD.pos[1]];
    red.cower = 1 - ease(t, WILD.t - 0.3, WILD.t - 0.2);
    red.dive = ease(t, WILD.t - 0.24, WILD.t - 0.04);
    rp = [lerp(-0.62, -0.5, ease(t, WILD.t - 0.24, WILD.t - 0.02)), -2.42];
  }
  // 4-04: he gets up and walks out onto the sea; 4-06: the meeting
  if (t > CUES.walk) {
    red.dive = 1 - ease(t, at('4-04', 0.2), at('4-04', 0.8));
    rlook = [0.4, 0.04, -2.05];
    const u = clamp((t - at('4-04', 0.9)) / 0.9);
    rp = [lerp(-0.5, -0.44, u), lerp(-2.42, -2.38, u)]; rdir = [0.85, 0.5]; red.walk = Math.max(0, t - at('4-04', 0.9)) * 2.2;
  }
  if (t > CUES.hands) {
    const u = clamp((t - CUES.hands) / 0.85);
    rp = [lerp(-0.1, -0.0105, easeOut(u)), MEET[1]]; rdir = [1, 0]; red.walk = (t - CUES.hands) * 2.3 * (1 - u * 0.2); rlook = [0, 0.045, MEET[1]];
    red.reach = ease(t, at('4-06', 1.1), at('4-06', 1.5)) > 0 ? [0, 0.028, MEET[1]] : null; red.hold = ease(t, at('4-06', 1.45), at('4-06', 1.7));
    if (u >= 1) red.walk = 0.85 * 2.3;
  }
  if (t > CUES.moons) { rlook = keys(t, [[CUES.moons, [-0.4, 0.45, -2.2]], [CUES.charge, [0, 0.4, -2.1]], [CUES.pair, [0, 0.38, -2.1]]]); }
  if (t > CUES.finger) rlook = [0, 0.6, -2.3];
  // ---- blue
  let bp = BLUE_HOME.slice(), bdir = [-0.38, 0.92], blook = [RED_HOME[0], 0.03, RED_HOME[1]];
  const blue = {};
  blue.wave = ease(t, at('1-02', 2.4), at('1-02', 2.7)) * (1 - ease(t, at('1-02', 3.4), at('1-02', 3.6)));
  const o1 = stamps().find((s) => s.who === 'openai');
  if (t > at('2-04')) { bdir = [1, 0]; blook = [o1.pos[0], 0.35, o1.pos[1]]; }
  blue.cower = ease(t, o1.t - 0.25, o1.t - 0.1) * (1 - ease(t, o1.t, o1.t + 0.05));
  blue.down = ease(t, o1.t, o1.t + 0.2) * (1 - ease(t, CUES.walkUS - 0.6, CUES.walkUS - 0.1));
  if (t > CUES.faster) blue.cower = 0.6;
  if (t > CUES.walkUS - 0.6) { blue.cower = 0; bdir = [-1, 0]; blook = [-0.3, 0.04, -2.02]; const u = clamp((t - CUES.walkUS) / 1.0); bp = [lerp(0.5, 0.42, u), -2.02]; blue.walk = Math.max(0, t - CUES.walkUS) * 2.2; }
  if (t > CUES.hands) {
    const u = clamp((t - CUES.hands - 0.1) / 0.8);
    bp = [lerp(0.1, 0.0105, easeOut(u)), MEET[1]]; bdir = [-1, 0]; blue.walk = (t - CUES.hands) * 2.3; blook = [0, 0.045, MEET[1]];
    if (u >= 1) blue.walk = 0.9 * 2.3;
    blue.reach = ease(t, at('4-06', 1.15), at('4-06', 1.5)) > 0 ? [0, 0.028, MEET[1]] : null; blue.hold = ease(t, at('4-06', 1.45), at('4-06', 1.7));
  }
  if (t > CUES.moons) blook = keys(t, [[CUES.moons, [0.4, 0.45, -2.2]], [CUES.charge, [0, 0.4, -2.1]], [CUES.pair, [0, 0.38, -2.1]]]);
  if (t > CUES.finger) blook = [0, 0.6, -2.3];
  const hide = t > PAIR_LIFT.t;  // they are a card now
  return {
    red: P({ ...red, show: hide ? 0 : 1, pos: rp, dir: rdir, look: rlook, shocks: shocksFor(...rp), gold: goldK }),
    blue: P({ ...blue, show: hide ? 0 : 1, pos: bp, dir: bdir, look: blook, shocks: shocksFor(...bp), gold: goldK }),
  };
}

// ---------------------------------------------------------------- the board: the approval rate
function boardRows() {
  const rows = Array.from({ length: BOARD.ROWS }, () => [{ t: -1, text: '' }]);
  rows[2] = [{ t: -1, text: '批准率  APPROVED' }];
  const pct = [[-1, 93], [at('2-04', 0.6), 94], [at('3-01'), 95], [at('3-04'), 96], [at('3-07', 0.1), 97], [at('3-08', -0.35), 99], [at('3-08', -0.05), 100]];
  rows[4] = pct.map(([t, v]) => ({ t, text: `      ${v} %` }));
  return rows;
}
let ROWS = null;

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [] };
  // ---- set
  const flood = t > CUES.flood ? { c: MEET.slice(), r: 4.2 * easeOut((t - CUES.flood) / 2.6), w: 0.12 } : null;
  st.set = {
    lamp: { on: 1 },
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 1, gold: t > CUES.flood ? clamp((t - CUES.flood) / 1.6) : 0, flood },
    board: { rows: ROWS ?? (ROWS = boardRows()), lit: 1, show: 1 },
  };
  // ---- the kings
  const pressedOut = (id) => t > flatTime(id) + 0.25;
  for (const k of KINGS) {
    const id = k.id, sx = SIDE_SIGN[k.side], isHead = HEADS.includes(id);
    const K = st.kings[id] = { look: [0, 0.15, SEAT.Z[k.seat] * 0.6], face: face('calm'), hand: { L: 'rest', R: 'rest' }, size: KSIZE[id] ?? 1 };
    const other = id === 'deepseek' ? 'openai' : id === 'openai' ? 'deepseek' : null;
    const otherHead = other ? [-sx * 1.62, 0.62, SEAT.Z[0]] : null;
    // stamping: both hands from their stamp lists; in between, ready
    let busy = false;
    for (const hand of ['L', 'R']) {
      const sh = stampHand(id, hand, t);
      if (sh) { K['arm' + hand] = stampArm(id, hand, sh.target); K.hand[hand] = 'fist'; busy = true; }
    }
    const firstStamp = byHand()[id] ? Math.min(...[...byHand()[id].L, ...byHand()[id].R].map((s) => s.t)) : Infinity;
    if (isHead && t < firstStamp && t > 0) { const hand = id === 'deepseek' ? 'R' : 'L'; K['arm' + hand] = K['arm' + hand] ?? stampArm(id, hand, readyHand(id, hand)); K.hand[hand] = 'fist'; }
    if (busy) { K.rise = isHead ? 0.55 : 0.4; K.lean = 0.12; }
    // the stamps stop (4-01 →): the stamp hangs by his side; 4-03 they lean back
    if (t > CUES.unneeded + 1.0) {
      for (const hand of ['L', 'R']) { K['arm' + hand] = stampArm(id, hand, idleHand(id, hand)); K.hand[hand] = 'fist'; }
      K.rise = (isHead ? 0.55 : 0.4) * (1 - ease(t, CUES.river, CUES.river + 1.4)); K.lean = -0.18 * ease(t, CUES.river, CUES.river + 1.4);
    }
    // looks and faces through the reel
    if (isHead) {
      const myFirst = stamps().find((s) => s.who === id);
      if (t > CUES.shadow) K.look = [myFirst.pos[0], 0.02, myFirst.pos[1]];
      K.face = face('calm', { eyes: 'down', brows: 'knit' });
      if (t > CUES.faster) { K.look = otherHead; K.face = face('sour', { eyes: 'glare' }); }
      if (t > CUES.blind) K.face = face('angry');
      K.sweat = clamp((t - CUES.faster) / 6) * 0.8;
      if (t > CUES.unneeded) { K.face = { eyes: 'wide', brows: 'raised', mouth: 'slack' }; K.look = [stamps().find((s) => s.who === id && s.t > CUES.unneeded).pos[0], 0.1, -2.2]; }
      if (t > CUES.stare) { K.look = keys(t, [[CUES.stare, [sx * 1.2, 0.35, -2.3]], [CUES.stare + 0.7, [sx * 0.6, 0.6, -3.2]]]); K.face = { eyes: 'wide', brows: 'raised', mouth: 'slack' }; }
      if (t > CUES.river) { K.look = [0, 1.4, -3.6]; K.face = face('worry', { eyes: 'open' }); }
      if (t > CUES.moons) { K.look = [sx * 0.42, 0.45, -2.15]; K.face = face('shock'); }
      if (t > CUES.standUp) { K.rise = ease(t, CUES.standUp, CUES.standUp + 0.5); K.lean = 0.05; K.look = otherHead; K.face = face('fear'); K.sweat = 1; }
      if (t > CUES.pair) { K.look = [0, 0.33, -2.08]; K.face = face('shock'); }
    } else {
      if (t > CUES.blind) { K.face = face('angry', { eyes: 'glare' }); K.look = [-sx * 1.62, 0.6, SEAT.Z[k.seat]]; K.sweat = 0.5; }
      if (t > CUES.river) { K.face = face('calm', { eyes: 'down', brows: 'knit' }); K.look = [0, 1.2, -3.5]; }
      if (t > CUES.standUp) { K.rise = 0.6 * ease(t, CUES.standUp + 0.1, CUES.standUp + 0.6); K.face = face('fear'); K.look = [0, 0.35, -2.1]; }
    }
    if (t > CUES.king) { K.look = [0, 3.4, -4.1]; K.face = { eyes: 'up', brows: 'raised', mouth: 'o' }; K.rise = Math.max(K.rise ?? 0, 0.3); }
    // pressed flat into a court card (6-02, 6-03)
    const tf = flatTime(id);
    if (t > tf - 0.1) { K.flat = clamp((t - (tf - 0.1)) / 0.3); }
    if (pressedOut(id)) K.gone = true;
  }
  // ---- props: the stamps in the hands, the presses, the ink on the cloth, the nameplates
  st.props = { stamps: {}, presses: {}, ink: [], plates: { show: 1 } };
  for (const k of KINGS) {
    const id = k.id, S = {};
    for (const hand of ['L', 'R']) {
      const sh = stampHand(id, hand, t);
      const holds = sh || (t > CUES.unneeded + 1.0) || (HEADS.includes(id) && t > 0 && hand === (id === 'deepseek' ? 'R' : 'L')) || (HEADS.includes(id) && t > CUES.faster);
      if (holds && !st.kings[id].gone && !(st.kings[id].flat > 0.3)) S[hand] = { press: sh?.press ?? 0, wet: 1 };
    }
    st.props.stamps[id] = S;
    // a card sliding out of the press
    const P = proposals().filter((c) => c.who === id);
    let slide = 0; for (const c of P) if (t > c.out - 0.1 && t < c.land) slide = Math.max(slide, 1 - Math.abs((t - c.out) / 0.25 - 0.5) * 2);
    st.props.presses[id] = { slide: clamp(slide), lever: 0 };
  }
  for (const s of stamps()) if ((s.miss || s.wild) && t >= s.t) {
    const yaw = Math.atan2(-SIDE_SIGN[KING[s.who].side], 0) + ((s.t * 13.7) % 1 - 0.5) * 0.3;
    st.props.ink.push({ pos: [s.pos[0], 0, s.pos[1]], rot: yaw, size: 1, k: clamp((t - s.t) / 0.5) * 0.85 + 0.15, seed: Math.floor(s.t * 100) % 97 });
  }
  if (st.props.ink.length > 256) st.props.ink = st.props.ink.slice(-256);
  // ---- the paper people and the crowd
  st.paper = { people: paperPeople(t), crowd: { show: t > CUES.shadow && t < CUES.us ? 1 : 0, hits: stamps().filter((s) => s.t <= t).map((s) => [s.pos[0], s.pos[1], s.t, s.big ? 1 : 0.7]), look: [0, 0.6, -2.4], gold: st.paper?.people?.red?.gold ?? 0 } };
  // ---- the card king (6-01 →)
  if (t > CUES.king - 0.2) {
    const build = ease(t, CUES.king, CUES.king + 1.7);
    st.cardking = { show: 1, build, grow: lerp(1, 1.6, ease(t, CUES.king + 0.4, CUES.press)), breathe: 0.6, look: [0, 0.4, -1.6], glow: 0.8, faceGlow: 1.1 };
    const dealOn = ease(t, CUES.press - 0.25, CUES.press + 0.3) * (1 - ease(t, CUES.rows + 0.1, CUES.rows + 0.6));
    if (dealOn > 0) {
      const over = (id) => { if (world?.kings?.headWorld) { const h = world.kings.headWorld(id, V).toArray(); return [h[0], h[1] + 0.3, h[2]]; } const k = KING[id]; return [SIDE_SIGN[k.side] * 1.83, 0.84, -2.43]; };
      const pr = (id) => { const tf = flatTime(id); return clamp((t - (tf - 0.22)) / 0.12) * (1 - clamp((t - (tf + 0.1)) / 0.25)); };
      st.cardking.deal = { on: dealOn, k: 0, target: [0, 0.3, -2.4], palms: { R: over('deepseek'), L: over('openai') }, press: { R: pr('deepseek'), L: pr('openai') } };
    }
    const fanOn = ease(t, CUES.rows + 0.2, CUES.rows + 0.8);
    if (fanOn > 0) st.cardking.fan = { on: fanOn, n: 10 + clamp((t - CUES.us - 0.05) / 0.55), spread: ease(t, CUES.rows + 0.4, CUES.fan + 0.3), open: 0.85, face: FAN_FACE };
    if (t > CUES.finger) st.cardking.arm = { out: ease(t, CUES.finger + 0.1, CUES.finger + 1.55), target: [MEET[0], 0.075, MEET[1] - 0.01], via: [[-0.7, 1.6, -2.75], [-0.08, 0.9, -2.1], [0, 0.42, -2.04]], finger: 1 };
    st.cardking.look = t > CUES.finger ? [0, 0.1, -2.0] : [0, 0.4, -1.6];
    if (world?.cardking?.pose) world.cardking.pose(st.cardking, t);
  }
  if (world?.lite) return st;
  // ---- the free cards: proposals, river, jokers, court cards, the pair
  proposalCards(t, world, st.free);
  river(t, world, st.free, st.cardking.build ?? 0);
  for (const side of ['CN', 'US']) { const j = jokerAt(side, t, world); if (j) st.free.push(j); }
  courtCards(t, world, st.free, st);
  pairCard(t, world, st.free);
  st.freeLook = { waveC: MEET, waveR: flood ? flood.r : -1 };
  // ---- light: the lamp, and from 王炸 the jokers' cold gold from above the sea
  st.look.lampPow = 1;
  if (t > CUES.moons) {
    const g = ease(t, CUES.moons, CUES.moons + 1.4) * 0.6 + 1.2 * ease(t, CUES.pair + 0.4, CUES.pair + 0.55) * (1 - 0.4 * ease(t, CUES.pair + 0.6, CUES.flood + 1));
    st.look.p2 = { pos: [0, 0.36, -2.0], col: [1.5 * g, 1.2 * g, 0.65 * g], range: 1.6 + 2.5 * ease(t, CUES.pair, CUES.flood + 2) };
  }
  if (t > PAIR_LIFT.t - 0.05 && t < PAIR_LIFT.t + 0.35) st.look.flash = Math.max(st.look.flash ?? 0, 0.45 * (1 - clamp((t - PAIR_LIFT.t) / 0.25)));
  if (t > CUES.finger && t < CUES.us && world?.cardking?.armTip) {
    const tip = new THREE.Vector3().setFromMatrixPosition(world.cardking.armTip(M2)).toArray();
    const g = ease(t, CUES.finger + 0.4, CUES.finger + 1.4);
    st.look.p3 = { pos: tip, col: [1.6 * g, 1.05 * g, 0.45 * g], range: 0.45 };
  }
  if (t > CUES.king) {
    const g = ease(t, CUES.king, CUES.king + 1.5) * (t > CUES.finger && t < CUES.us ? 0.25 : 1);
    const fp = world?.cardking?.faceFrame ? new THREE.Vector3().setFromMatrixPosition(world.cardking.faceFrame(M2)).toArray() : [0, 3.4, -4.0];
    st.look.p2 = { pos: [fp[0], fp[1], fp[2] + 0.6], col: [1.4 * g, 0.95 * g, 0.45 * g], range: 7 };
  }
  return st;
}
void THRONE; void CARD_Y; void downQ;
