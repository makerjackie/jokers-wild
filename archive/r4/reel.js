// 《失控》 — the state of the world at film time t (docs/SHIKONG.md). Kings, cards, decks, the ant, the lights. The
// shots (cams.js) then place the camera and refine their moment. Everything here is a pure function of t.
import { KINGS, KING, SEAT, SIDE_SIGN, LAMP } from '../layout.js';
import { CUES } from '../shots.js';
import { clamp, smooth, lerp, lerp3, ease, easeIn, easeOut, mulberry32, kick } from '../util.js';
import { at, end, face, kf, kingRest, rightZ } from './core.js';
import { CELL } from '../cards-cells.js';
import { CARD } from '../cards.js';
import { flatQ, downQ, basisQ, slerpQ, mulQ, axisQ, rotV } from '../freecards.js';
import * as S from './story.js';
import { ANT } from '../ant.js';

const { FINAL, CARD_Y, DECK, DECK_HAND, OUT, OUT_DUR, outAt, HOUSE_SLOTS, FLICK, HELD, PAIR, STOP, STAND, RISE, RINGS, AI_ON, MEET, FALL, PEEK, PLAY2 } = S;
const ANT_STRIDE = ANT.STRIDE;
const sxOf = (id) => SIDE_SIGN[KING[id].side];
const zsOf = (id, hand) => (hand === 'R' ? 1 : -1) * rightZ(id);
const other = (id) => (id === 'deepseek' ? 'openai' : 'deepseek');
const sideOf = (id) => KING[id].side;

// ---------------------------------------------------------------- the points a hand goes through
const P = {
  rest: (id, h) => kingRest(id, h),
  ready: (id, h) => kf(id, 0.6, 0.74, zsOf(id, h) * 0.24),
  wind: (id, h) => kf(id, 0.32, 0.98, zsOf(id, h) * 0.3),
  rel: (id, h) => kf(id, 0.8, 0.46, zsOf(id, h) * 0.12),
  follow: (id, h) => kf(id, 0.84, 0.37, zsOf(id, h) * 0.08),
  back: (id, h) => kf(id, 0.5, 0.52, zsOf(id, h) * 0.22),
  lob: (id, h) => kf(id, 0.68, 0.62, zsOf(id, h) * 0.14),
  raise: (id, h) => kf(id, 0.42, 0.95, zsOf(id, h) * 0.1),
  over: (id, h) => kf(id, 0.26, 1.36, zsOf(id, h) * 0.2),
  look: (id, h) => kf(id, 0.36, 0.9, zsOf(id, h) * 0.06),
  show: (id, h) => kf(id, 0.62, 0.42, zsOf(id, h) * 0.17),
  chest: (id, h) => kf(id, 0.3, 0.62, zsOf(id, h) * 0.12),
  catch: (id, h) => kf(id, 0.48, 1.02, zsOf(id, h) * 0.16),
  deck: (id) => { const d = DECK[sideOf(id)]; return [d[0] + sxOf(id) * 0.02, d[1] + 0.035, d[2] - 0.02]; },
  lift: (id) => { const d = DECK[sideOf(id)]; return [d[0] + sxOf(id) * 0.04, d[1] + 0.2, d[2] - 0.08]; },
};
// keyed path [[t, point, ease?], ...]: hold before / after, smooth (or the given ease) between keys
function path(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b, e] = ks[i];
    const u = clamp((t - t0) / Math.max(1e-4, t1 - t0));
    const w = e === 'in' ? u * u * u : e === 'out' ? easeOut(u) : e === 'lin' ? u : smooth(u);
    return lerp3(a, b, w);
  }
  return ks[ks.length - 1][1];
}
const arm = (id, target, extra = {}) => ({ target, pole: [sxOf(id) * 0.4, -0.8, 0], ...extra });

// ---------------------------------------------------------------- the plays, per king and hand
let BYK = null;
function byKing() {
  if (BYK) return BYK;
  BYK = {};
  const n = {};
  for (const p of S.plays()) {
    // the frenzy (3-07 →) uses both hands, alternately; the finalists always draw with the hand by their stand
    if (!p.deck && p.style === 'slam' && p.t > at('3-07')) { n[p.who] = (n[p.who] ?? 0) + 1; p.hand = n[p.who] % 2 ? 'R' : 'L'; }
    (BYK[p.who] ??= []).push(p);
  }
  for (const id in BYK) {
    const L = BYK[id];
    L.forEach((p, i) => { const prev = L[i - 1]; p.k = clamp(((p.tr - (prev ? prev.tr : p.tr - 2)) - 0.1) / 1.25, 0.42, 1); });
  }
  return BYK;
}
// a play's arm keys and when its card is in the hand
function playKeys(p) {
  const id = p.who, h = p.hand, k = p.k ?? 1, tr = p.tr;
  if (p.style === 'toss') return { cardIn: tr - 0.78, keys: [[tr - 1.0, P.rest(id, h)], [tr - 0.55, P.ready(id, h)], [tr - 0.2, P.back(id, h)], [tr, P.lob(id, h)], [tr + 0.4, P.ready(id, h)], [tr + 0.95, P.rest(id, h)]], pose: 'hold' };
  if (p.style === 'open') return { cardIn: tr - 0.8, keys: [[tr - 1.0, P.rest(id, h)], [tr - 0.5, P.ready(id, h)], [tr - 0.22, P.wind(id, h)], [tr, P.lob(id, h)], [tr + 0.4, P.follow(id, h)], [tr + 1.0, P.rest(id, h)]], pose: 'hold' };
  if (p.style === 'giant') {
    const [h0, h1] = p.hold;
    return { cardIn: h0 - 0.05, both: true, keys: (hh) => [[h0 - 0.45, P.ready(id, hh)], [h0, P.over(id, hh)], [h1, kf(id, 0.3, 1.42, zsOf(id, hh) * 0.2)], [tr - 0.06, kf(id, 0.24, 1.5, zsOf(id, hh) * 0.2), 'out'], [tr, kf(id, 0.62, 0.62, zsOf(id, hh) * 0.2), 'in'], [tr + 0.3, P.follow(id, hh)], [tr + 1.2, P.ready(id, hh)]], pose: 'hold' };
  }
  if (p.style === 'flick') {
    const put = FLICK.put, go = FLICK.go, at0 = [FLICK.from[0], 0.03, FLICK.from[1]];
    return { cardIn: put - 0.62, putDown: put, keys: [[put - 1.0, P.ready(id, h)], [put - 0.75, P.deck(id)], [put - 0.62, P.lift(id)], [put - 0.25, [at0[0], 0.12, at0[2]]], [put, at0, 'out'], [go - 0.35, [at0[0] - 0.11, 0.06, at0[2]]], [go - 0.05, [at0[0] - 0.13, 0.025, at0[2]]], [go + 0.06, [at0[0] + 0.02, 0.03, at0[2]], 'in'], [go + 0.7, P.rest(id, h)]], pose: (t) => (t > go - 0.4 && t < go + 0.4 ? 'point' : 'hold') };
  }
  if (p.chat) {
    const [r0, r1] = p.raise;
    return { cardIn: r0 - 0.18, keys: [[r0 - 0.55, P.rest(id, h)], [r0 - 0.3, P.deck(id)], [r0 - 0.18, P.lift(id)], [r0 + 0.35, kf(id, 0.46, 0.84, zsOf(id, h) * 0.28)], [r1, kf(id, 0.44, 0.9, zsOf(id, h) * 0.27)], [tr - 0.17, P.wind(id, h)], [tr, P.rel(id, h), 'in'], [tr + 0.12, P.follow(id, h)], [tr + 0.9, P.rest(id, h)]], pose: 'hold', look: [r0 + 0.3, r1] };
  }
  if (p.deck) return { cardIn: tr - 0.6 * k, keys: [[tr - 0.86 * k, P.ready(id, h)], [tr - 0.64 * k, P.deck(id)], [tr - 0.5 * k, P.lift(id)], [tr - 0.24 * k, P.wind(id, h)], [tr, P.rel(id, h), 'in'], [tr + 0.1, P.follow(id, h)], [tr + 0.45 * k, P.ready(id, h)]], pose: 'hold' };
  return { cardIn: tr - Math.max(0.6 * k, 0.85), keys: [[tr - 0.6 * k, P.ready(id, h)], [tr - 0.24 * k, P.wind(id, h)], [tr, P.rel(id, h), 'in'], [tr + 0.1, P.follow(id, h)], [tr + 0.45 * k, P.ready(id, h)]], pose: 'hold' };
}
const playSpan = (p) => { const K = playKeys(p); const ks = K.both ? K.keys('L') : K.keys; return [ks[0][0], ks[ks.length - 1][0]]; };
// the play a hand is busy with at t (the latest that has started)
function activePlay(id, hand, t) {
  const L = byKing()[id];
  if (!L) return null;
  let best = null;
  for (const p of L) {
    if (p.hand !== hand && !(p.style === 'giant')) continue;
    const [a, b] = playSpan(p);
    if (t >= a && t <= b && (!best || a > playSpan(best)[0])) best = p;
  }
  return best;
}

// ---------------------------------------------------------------- the phases of the two finalists' arms after the race
// the mime (5-06 →): the slam without a card, on a beat that quickens; returns { target, pose } or null
function mimeBeat(id, t) {
  const m0 = at('5-06', 0.25);
  if (t < m0 || t > STOP + 0.02) return null;
  const off = id === 'openai' ? 0.17 : 0;
  // the beat: period 0.62 -> 0.32 s, phase accumulated (pure)
  const ph = (tt) => { const u = clamp((tt - m0) / (STOP - m0)); return (tt - m0) / 0.62 + 0.5 * u * u * (STOP - m0) * (1 / 0.32 - 1 / 0.62); };
  const x = ph(t) - off * 1.7;
  if (x < 0) return null;
  const f = x - Math.floor(x), hand = Math.floor(x) % 2 ? 'L' : 'R';
  const target = f < 0.55 ? lerp3(P.ready(id, hand), P.wind(id, hand), smooth(f / 0.55)) : f < 0.72 ? lerp3(P.wind(id, hand), P.rel(id, hand), ((f - 0.55) / 0.17) ** 3) : lerp3(P.rel(id, hand), P.ready(id, hand), smooth((f - 0.72) / 0.28));
  return { hand, target, f, beat: Math.floor(x) };
}

// ---------------------------------------------------------------- the kings
const LOOK_PILE = [0, 0.12, 0];
const headAt = (id) => [sxOf(id) * 1.52, 0.66, SEAT.Z[KING[id].seat]];
function kingsState(t, st) {
  for (const k of KINGS) {
    const id = k.id, sx = sxOf(id), z = SEAT.Z[k.seat], fin = FINAL.includes(id);
    const K = st.kings[id] = { look: LOOK_PILE, face: face('calm'), hand: { L: 'rest', R: 'rest' }, rise: 0, lean: 0, sweat: 0, slump: 0 };
    // ---- eliminated: he stops, sees he has nothing left, and his chair slides back into the dark
    const tOut = outAt(id);
    if (t > tOut - 0.6) {
      K.face = t < tOut ? face('shock', { eyes: 'down' }) : face('fear');
      K.look = t < tOut ? [sx * 1.0, 0.0, z] : [0, 0.25, z * 0.5];
      K.enter = 1 - smooth((t - tOut) / OUT_DUR) ** 1.4;
      if (K.enter <= 0.001) { K.enter = 0; continue; }
      // his hands try to hold on to the table edge as he goes
      for (const h of ['L', 'R']) { K['arm' + h] = arm(id, kf(id, 0.6, 0.36, zsOf(id, h) * 0.25)); K.hand[h] = 'open'; }
      K.rise = 0.2; K.lean = 0.25;
      continue;
    }
    // ---- calm: the lazy game (@1, @2-01): slumped, bored, eyes down; a yawn now and then
    const lazy = t < at('2-02');
    if (lazy) {
      K.slump = 0.025; K.lean = -0.04;
      K.face = face('calm', { eyes: (Math.floor(t * 0.4 + k.seat * 0.7) % 3) ? 'down' : 'side', brows: 'flat' });
      const yawn = Math.sin((t + k.seat * 3.1 + (sx > 0 ? 1.4 : 0)) * 0.55);
      if (yawn > 0.93) K.face = { eyes: 'closed', brows: 'raised', mouth: 'open' };
      K.look = [0, 0.05, z * 0.4];
    }
    // ---- 2-02 .. 2-05: the room turns to OpenAI, then to the card; everyone leans in
    if (t >= at('2-02') && t < at('3-01')) {
      K.look = t < at('2-03', 0.3) ? headAt('openai') : [0, 0.02, 0];
      K.face = t < at('2-03', 0.4) ? face('calm', { eyes: 'side', brows: 'raised' }) : face('shock');
      if (t > at('2-04')) { K.rise = 0.3 * ease(t, at('2-04', 0.3), at('2-05', 0.5)); K.lean = 0.18 * ease(t, at('2-04', 0.3), at('2-05', 0.5)); K.face = { eyes: 'wide', brows: 'raised', mouth: 'o' }; }
    }
    // ---- the race (3-01 → 3-09): half standing, sweating, glaring across; the faces harden
    if (t >= at('3-01') && t < at('4-01')) {
      const p = clamp((t - at('3-01')) / (at('3-09') - at('3-01')));
      K.rise = (fin ? 0.45 : 0.35) + 0.45 * p; K.lean = 0.1 + 0.1 * p; K.sweat = p;
      K.look = fin ? headAt(other(id)) : LOOK_PILE;
      K.face = p < 0.35 ? face('angry', { eyes: 'glare' }) : p < 0.7 ? face('angry') : face('shout', { mouth: 'grit' });
    }
    // ---- one-off reactions
    if (id === 'deepseek') {
      if (t >= at('2-06') && t < at('3-01')) { K.face = { eyes: 'wide', brows: 'worried', mouth: 'flat' }; K.look = [0.0, 0.02, 0.0]; K.rise = 0.3; K.lean = 0.12; }
      if (t >= at('3-04') && t < at('3-05')) { K.face = t < FLICK.go ? face('smug') : t < FLICK.hit + 0.3 ? face('calm', { eyes: 'narrow', brows: 'arch', mouth: 'flat' }) : face('proud'); K.look = t < FLICK.go + 0.1 ? [FLICK.from[0], 0, FLICK.from[1]] : [0.35, 0.15, -0.55]; K.rise = 0.5; }
    }
    if (id === 'openai') {
      if (t >= at('2-02') && t < at('2-04')) K.face = face('smug');
      if (t >= at('2-04') && t < at('2-07')) K.face = face('proud', { eyes: 'narrow' });
      if (t >= at('2-07') && t < at('3-01')) { K.face = face('smug'); K.lean = -0.14; K.rise = 0; K.look = headAt('deepseek'); }
      if (t >= at('3-06') && t < at('3-07')) { K.rise = lerp(0.7, 1, ease(t, at('3-06', 0.1), at('3-06', 0.6))); K.face = t < at('3-06', 1.7) ? face('proud', { mouth: 'grin' }) : face('shout'); K.look = [0, 0.1, 0]; }
    }
    if (t >= at('3-04') && t < at('3-06') && sx > 0) {
      // the US row admires its house, then gapes as it falls
      K.look = [0.4, 0.3, -0.56];
      K.face = t < FLICK.hit ? face('proud', { eyes: 'narrow', mouth: 'smirk' }) : { eyes: 'wide', brows: 'raised', mouth: 'o' };
    }
    if (t >= at('3-03') && t < at('3-04') && (id === 'kimi' || id === 'doubao')) { K.look = [-0.76, 0.05, 1.86]; K.face = t < at('3-03', 1.3) ? face('shock', { mouth: 'grin' }) : id === 'kimi' ? face('angry', { mouth: 'grin' }) : face('angry', { mouth: 'grit' }); K.rise = 0.7; K.lean = 0.25; }
    // ---- the finalists from 4-01 to the end
    if (fin && t >= at('3-09', 1.3)) finalist(id, t, K);
    // ---- arms: the play a hand is busy with, else ready (race) / rest
    if (!(fin && t >= at('3-09', 1.3))) {
      const busyGiant = byKing()[id]?.find((p) => p.style === 'giant' && t >= playSpan(p)[0] && t <= playSpan(p)[1]);
      for (const h of ['L', 'R']) {
        const p = busyGiant ?? activePlay(id, h, t);
        if (p) {
          const K2 = playKeys(p);
          const ks = K2.both ? K2.keys(h) : K2.keys;
          K['arm' + h] = arm(id, path(t, ks));
          K.hand[h] = typeof K2.pose === 'function' ? K2.pose(t) : K2.pose;
          if (K2.look && t > K2.look[0] && t < K2.look[1]) { K.look = kf(id, 0.46, 0.84, zsOf(id, h) * 0.28); }
        } else if (t >= at('3-01') && t < at('4-01')) { K['arm' + h] = arm(id, P.ready(id, h)); K.hand[h] = 'hold'; }
      }
    }
    // the Llama tug (3-03): Kimi's right and Doubao's left on the same card
    const tug = tugState(t);
    if (tug && (id === 'kimi' || id === 'doubao')) {
      const h = id === 'kimi' ? 'R' : 'L';
      K['arm' + h] = arm(id, id === 'kimi' ? tug.kimi : tug.doubao); K.hand[h] = 'hold';
    }
  }
}
// ---- the Llama: where the two hands are while they fight over it
function tugState(t) {
  const t0 = at('3-03', 1.25), t1 = at('3-03', 3.0);
  if (t < t0 - 0.4 || t > t1 + 0.4) return null;
  const card = [-0.76, 0.03, 1.86];
  const reach = ease(t, t0 - 0.4, t0);
  const w = Math.sin((t - t0) * 2 * Math.PI * 2.6) * 0.06 * clamp((t - t0) / 0.2) * (1 - clamp((t - at('3-03', 2.35)) / 0.1));
  const won = ease(t, at('3-03', 2.4), at('3-03', 2.75));
  const mid = [card[0] - 0.05 * won, 0.06 + 0.05 * clamp((t - t0) / 0.3) + 0.25 * won, card[2] + w - 0.45 * won];
  return {
    kimi: lerp3(P.ready('kimi', 'R'), [mid[0], mid[1], mid[2] - 0.05], reach),
    doubao: lerp3(P.ready('doubao', 'L'), [mid[0], mid[1], mid[2] + 0.05 + 0.4 * won], reach * (1 - won * 0.9)),
    mid, won,
  };
}

// ---- the two finalists after the race: the pause, the betrayal, the mime, the stop, the rise, the dealer
function finalist(id, t, K) {
  const sx = sxOf(id), h0 = DECK_HAND[id], h1 = h0 === 'R' ? 'L' : 'R', o = other(id);
  const H = HELD[id];
  const oHead = headAt(o);
  K.sweat = 1;
  // @4: the card in his hand frightens him; he lays it down and shows his empty hands; leans back
  if (t < at('5-01')) {
    K.rise = lerp(0.85, 0.25, ease(t, at('4-01'), at('4-02', 1.0)));
    if (t < at('4-01')) { K.look = headAt(o); K.face = face('shout', { mouth: 'grit' }); }
    K.lean = 0.12;
    const tDown = H.down, mine = id === 'deepseek';
    const cardAt = [H.at[0], 0.02, H.at[1]];
    // holding it up and looking at it
    const holdPt = kf(id, 0.5, 0.7, zsOf(id, h0) * 0.24);
    let tgt = path(t, [[H.draw - 0.5, P.ready(id, h0)], [H.draw - 0.22, P.deck(id)], [H.draw, P.lift(id)], [H.draw + 0.6, holdPt]]), pose = 'hold';
    if (t > tDown - 1.25) tgt = path(t, [[tDown - 1.25, holdPt], [tDown - 0.35, [cardAt[0] - sx * 0.04, 0.09, cardAt[2]]], [tDown, [cardAt[0], 0.035, cardAt[2]], 'out'], [tDown + 0.35, P.show(id, h0)], [tDown + 1.6, P.show(id, h0)], [tDown + 2.4, P.rest(id, h0)]]);
    if (t > tDown) pose = 'open';
    if (t > tDown + 2.2) pose = 'rest';
    K['arm' + h0] = arm(id, tgt, t > tDown && t < tDown + 1.9 ? { palm: [0, 1, 0] } : {});
    K.hand[h0] = pose;
    // the other hand joins the showing
    if (t > tDown + 0.15 && t < tDown + 2.2) { K['arm' + h1] = arm(id, path(t, [[tDown + 0.15, P.rest(id, h1)], [tDown + 0.5, P.show(id, h1)], [tDown + 1.7, P.show(id, h1)], [tDown + 2.2, P.rest(id, h1)]]), { palm: [0, 1, 0] }); K.hand[h1] = 'open'; }
    else { K['arm' + h1] = arm(id, P.rest(id, h1)); K.hand[h1] = 'rest'; }
    // looks and faces
    K.look = t < at(mine ? '4-02' : '4-03', mine ? 0.3 : 0.9) ? [holdPt[0] - sx * 0.05, holdPt[1] + 0.05, holdPt[2]] : oHead;
    K.face = face('worry', { eyes: 'wide' });
    if (t > at(mine ? '4-02' : '4-03', mine ? 0.3 : 0.9)) K.face = face('fear', { mouth: 'flat' });
    if (!mine && t > at('4-05') && t < tDown - 0.4) { K.look = t < at('4-05', 0.6) ? [H.at[0], 0.1, H.at[1]] : oHead; K.face = face('worry'); }
    if (t > tDown + 0.2) K.face = { eyes: 'open', brows: 'worried', mouth: 'flat' };
    // both lean back at the end of 4-05; 4-06 the stillness (a slow breath)
    const back = ease(t, at('4-05', 1.9), at('4-06', 0.8));
    K.rise = lerp(K.rise, 0, back); K.lean = lerp(K.lean, -0.12, back);
    if (t > at('4-06')) { K.look = oHead; K.face = { eyes: 'open', brows: 'worried', mouth: 'flat' }; K.slump = 0.01 * (1 + Math.sin(t * 1.4)); }
    return;
  }
  // @5: the cards from behind them; the betrayal; the mime
  if (t < STOP) {
    K.look = oHead;
    K.face = { eyes: 'open', brows: 'worried', mouth: 'flat' };
    K.rise = 0; K.lean = -0.12;
    for (const h of ['L', 'R']) { K['arm' + h] = arm(id, P.rest(id, h)); K.hand[h] = 'rest'; }
    // the card lands (5-03 / 5-04): each sees it come from behind the other
    const landMine = PAIR[KING[o].side];          // the card from the OTHER's deck: the one he sees
    if (t > PAIR.CN - 0.6) { K.look = lerp3(oHead, [0, 0.35, 0], ease(t, PAIR.CN - 0.6, PAIR.CN - 0.1)); K.face = face('shock'); }
    if (t > Math.max(PAIR.CN, PAIR.US) + 0.05) { K.look = oHead; K.face = face('angry', { eyes: 'glare', mouth: 'grit' }); }
    void landMine;
    if (t > at('5-05')) { K.face = face('angry', { eyes: 'glare', mouth: 'grit' }); K.rise = 0.6 * ease(t, at('5-05'), at('5-05', 1.2)); K.lean = 0.15; for (const h of ['L', 'R']) { K['arm' + h] = arm(id, P.ready(id, h)); K.hand[h] = 'fist'; } }
    // the mime
    const m = mimeBeat(id, t);
    if (m) {
      K.rise = 0.9; K.lean = 0.2;
      K['arm' + m.hand] = arm(id, m.target); K.hand[m.hand] = 'hold';
      const oh = m.hand === 'R' ? 'L' : 'R';
      K['arm' + oh] = arm(id, P.ready(id, oh)); K.hand[oh] = 'hold';
      K.face = face('shout', { mouth: 'grit' });
    }
    // 5-07: DeepSeek's hand comes down empty; he stops and looks at it
    if (id === 'deepseek' && t > at('5-07', 1.0) && t < at('5-09', 0.45)) {
      const lk = ease(t, at('5-07', 1.0), at('5-07', 1.7));
      K['armR'] = arm(id, lerp3(P.rel(id, 'R'), P.look(id, 'R'), lk), { palm: [-sx * 0.6, 0.2, -0.8] });
      K.hand.R = 'open'; K['armL'] = arm(id, P.ready(id, 'L')); K.hand.L = 'open';
      K.look = t < at('5-08', 0.15) ? P.look(id, 'R') : oHead;
      K.face = t < at('5-08', 0.15) ? { eyes: 'down', brows: 'raised', mouth: 'slack' } : { eyes: 'blank', brows: 'raised', mouth: 'flat' };
      K.rise = 0.7;
    }
    // 5-08: OpenAI, mid-mime, sees him looking and freezes; their eyes meet
    if (id === 'openai' && t > at('5-08', 0.75) && t < at('5-09', 0.45)) {
      const frozen = mimeBeat(id, at('5-08', 0.75));
      if (frozen) { K['arm' + frozen.hand] = arm(id, frozen.target); }
      K.look = oHead; K.face = { eyes: 'blank', brows: 'raised', mouth: 'flat' };
    }
    if (t > at('5-09', 0.45) && t < STOP) K.face = face('shout', { eyes: t > CUES.blizzard ? 'shut' : 'glare', mouth: 'grit' });
    return;
  }
  // @6: frozen, then the cards stand up and look at them, then they rise; they look up
  if (t < at('7-01')) {
    const fr = mimeBeat(id, STOP - 0.001);
    const hold = fr ? fr.target : P.ready(id, h0), hh = fr ? fr.hand : h0;
    const lower = ease(t, at('6-03', 0.4), at('6-04', 1.2));
    K['arm' + hh] = arm(id, lerp3(hold, P.chest(id, hh), lower)); K.hand[hh] = lower > 0.5 ? 'open' : 'hold';
    const oh = hh === 'R' ? 'L' : 'R';
    K['arm' + oh] = arm(id, lerp3(P.ready(id, oh), P.chest(id, oh), lower)); K.hand[oh] = 'open';
    K.rise = lerp(0.9, 0.15, ease(t, at('6-03'), at('6-05', 1.0))); K.lean = lerp(0.2, -0.16, ease(t, at('6-04', 1.5), at('6-05', 2.5)));
    K.look = t < at('6-03') ? oHead : t < at('6-05') ? [0, 0.35, 0] : [0, lerp(0.8, 3.2, ease(t, at('6-05', 0.3), at('6-05', 3.4))), -0.1];
    K.face = t < at('6-03') ? { eyes: 'blank', brows: 'raised', mouth: 'slack' } : t < at('6-05') ? face('fear') : { eyes: 'up', brows: 'raised', mouth: t < at('6-06') ? 'o' : 'slack' };
    if (t > at('6-06')) {
      for (const h of ['L', 'R']) { K['arm' + h] = arm(id, lerp3(P.chest(id, h), P.rest(id, h), ease(t, at('6-06'), at('6-06', 1.5)))); K.hand[h] = 'rest'; }
      K.slump = 0.02; K.look = [sx * 0.15, 2.1, -0.1];
    }
    return;
  }
  // @7: the cards from the dark
  const F = FALL[id];
  K.rise = 0; K.lean = -0.06; K.slump = 0.01;
  for (const h of ['L', 'R']) { K['arm' + h] = arm(id, P.rest(id, h)); K.hand[h] = 'rest'; }
  const fallPos = fallCard(id, t)?.pos;
  K.look = fallPos && t < F.land + 0.4 ? fallPos : [F.at[0], 0.0, F.at[1]];
  K.face = t < F.land ? { eyes: 'up', brows: 'raised', mouth: 'o' } : face('worry', { eyes: 'down' });
  const pk = PEEK[id];
  if (id === 'openai' && t > pk.glance && t < pk.reach) { K.look = headAt('deepseek'); K.face = face('side', { brows: 'knit' }); }
  if (t > pk.reach && t < pk.down + 0.6) {
    const c = peekCorner(id, t);
    const h = h0;   // the hand nearer the card's corner
    K['arm' + h] = arm(id, c, { palm: [0, -1, 0] }); K.hand[h] = 'hold';
    K.look = [F.at[0] - sx * 0.06, 0.02, F.at[1]];
    K.lean = 0.1; K.rise = 0.15;
    K.face = t < pk.smile ? { eyes: 'down', brows: 'knit', mouth: 'flat' } : t < pk.grin ? { eyes: 'narrow', brows: 'flat', mouth: 'smirk' } : { eyes: 'narrow', brows: 'arch', mouth: 'grin' };
  }
  if (t > pk.down + 0.6 && t < PLAY2[id] - 0.6) { K.face = face('smug'); K.look = headAt(o); }
  // 7-06: picks it up and slaps it in the middle; 7-07 →: catches the cards that fall, and plays them, laughing
  const p2 = PLAY2[id];
  if (t > p2 - 0.6 && t < p2 + 0.7) {
    K['arm' + h0] = arm(id, path(t, [[p2 - 0.6, P.rest(id, h0)], [p2 - 0.42, [F.at[0], 0.04, F.at[1]]], [p2 - 0.24, P.wind(id, h0)], [p2 - 0.08, P.rel(id, h0), 'in'], [p2 + 0.05, P.follow(id, h0)], [p2 + 0.7, P.rest(id, h0)]]));
    K.hand[h0] = 'hold'; K.look = [0, 0.05, 0]; K.face = face('proud', { mouth: 'grin' }); K.rise = 0.4;
  }
  const fd = S.feed().filter((f) => f.who === id && t > f.catch - 0.7 && t < f.slap + 0.45).pop();
  if (fd) {
    const hh = fd.k % 4 < 2 ? h0 : h1;
    K['arm' + hh] = arm(id, path(t, [[fd.catch - 0.7, P.ready(id, hh)], [fd.catch, P.catch(id, hh), 'out'], [fd.slap - 0.2, P.wind(id, hh)], [fd.slap - 0.05, P.rel(id, hh), 'in'], [fd.slap + 0.12, P.follow(id, hh)], [fd.slap + 0.45, P.ready(id, hh)]]));
    K.hand[hh] = t < fd.catch - 0.15 ? 'open' : 'hold';
    K.rise = 0.45; K.lean = 0.1;
    K.look = t < fd.catch ? feedCard(fd, t)?.pos ?? [0, 1, 0] : [0, 0.05, 0];
    K.face = (fd.k % 3 === 0) ? face('laugh') : face('proud', { mouth: 'grin' });
  } else if (t > at('7-07')) { K.face = face('proud', { mouth: 'grin' }); K.rise = 0.35; K.look = [0, 0.05, 0]; for (const h of ['L', 'R']) { K['arm' + h] = arm(id, P.ready(id, h)); K.hand[h] = 'open'; } }
}

// ---------------------------------------------------------------- cards
const T2 = CARD.T / 2;
const jitterQ = (q, seed, amt = 0.1) => { const r = mulberry32(seed); return mulQ(q, axisQ([r() - 0.5, r() - 0.5, 0], (r() - 0.5) * 2 * amt)); };
// a card held in a hand: film.js puts it there (face toward the king's eyes); `free` blends it toward a computed pose
const held = (id, side, extra = {}) => ({ hand: { id, side, ...extra } });

// the flight of a played card: from the release point to its rest pose
function flight(p, t, rest) {
  const u = clamp((t - p.tr) / (p.t - p.tr));
  const from = p.style === 'giant' ? kf(p.who, 0.55, 0.85, 0) : playKeys(p).keys instanceof Function ? kf(p.who, 0.6, 0.6, 0) : path(p.tr, playKeys(p).keys);
  const to = rest.pos;
  const arcH = p.style === 'toss' ? 0.22 : p.style === 'open' ? 0.5 : p.dest === 'house' ? 0.25 : p.style === 'giant' ? 0.02 : 0.07;
  const e = p.style === 'toss' || p.style === 'open' ? u : u * (1.35 - 0.35 * u);
  const pos = [lerp(from[0], to[0], e), lerp(from[1], to[1], e) + Math.sin(Math.PI * u) * arcH, lerp(from[2], to[2], e)];
  const sx = sxOf(p.who);
  const q0 = basisQ([sx, 0.6, 0], [-sx * 0.5, 0.8, 0]);
  const spin = (1 - u) * (p.style === 'toss' ? 2.5 : 1.2) * (p.i % 2 ? 1 : -1);
  const q = mulQ(slerpQ(q0, rest.q, smooth(u)), axisQ([0, 0, 1], spin));
  return { pos, q };
}
function cardBase(p) { return { face: p.face, back: p.back, scale: p.scale, glyph: p.glyph ?? 0, gcell: p.gcell ?? CELL.glyph0, writhe: p.writhe ?? 0 }; }

// house slot pose
const slotPose = (s) => { const h = HOUSE_SLOTS[s]; return { pos: h.pos, q: basisQ(h.n, h.up) }; };
// the house's fall: slot pose → its rest on the cloth (rotating about its foot, then sliding)
function houseCard(s, t, heapRest) {
  const f = S.houseFall(s), sp = slotPose(s);
  const u = clamp((t - f.t0) / (f.t1 - f.t0));
  if (u <= 0) return sp;
  const e = u * u;
  const pos = [lerp(sp.pos[0], heapRest.pos[0], e), lerp(sp.pos[1], heapRest.pos[1], easeIn(u)) + Math.sin(Math.PI * u) * 0.03, lerp(sp.pos[2], heapRest.pos[2], e)];
  return { pos, q: slerpQ(sp.q, heapRest.q, smooth(u)) };
}

// a card standing up on the mountain and turning to face its king (6-03 →), then rising in the vortex (6-05 →)
function standPose(rest, st0, t, seed) {
  const u = smooth((t - st0) / 0.55);
  if (u <= 0) return rest;
  const x = rest.pos[0], who = S.faceTarget(x), hd = headAt(who);
  const toK = [hd[0] - x, 0, hd[2] - rest.pos[2]]; const l = Math.hypot(toK[0], toK[2]) || 1;
  const n = [toK[0] / l, 0.25, toK[2] / l];
  const qs = basisQ(n, [0, 1, 0]);
  const pos = [x, rest.pos[1] + CARD.H * 0.5 * u * 0.92, rest.pos[2]];
  // a shiver as it comes up
  const sh = Math.sin((t - st0) * 40 + seed * 9) * 0.04 * (1 - u);
  return { pos, q: mulQ(slerpQ(rest.q, qs, u), axisQ([0, 1, 0], sh)) };
}
function risePose(stood, t0, t, seed) {
  const a0 = Math.atan2(stood.pos[2] - S.RISE.axis[1], stood.pos[0] - S.RISE.axis[0]);
  const r0 = Math.hypot(stood.pos[0] - S.RISE.axis[0], stood.pos[2] - S.RISE.axis[1]);
  const s = t - t0;
  if (s <= 0) return stood;
  const y = stood.pos[1] + 1.4 * s * s + 0.15 * s;
  const ang = a0 + (1.2 + seed) * s * s * 0.9 + s * 0.8;
  const r = lerp(r0, 0.75 + 0.9 * seed, smooth(s / 1.4)) + 0.5 * Math.max(0, y - 2.8) * 0.18;
  const pos = [S.RISE.axis[0] + Math.cos(ang) * r, y, S.RISE.axis[1] + Math.sin(ang) * r];
  const fl = s * (5 + seed * 4);
  const q = mulQ(basisQ([Math.cos(ang), 0.2, Math.sin(ang)], [0, 1, 0]), axisQ([0, 1, 0], Math.sin(fl) * 0.8));
  return { pos, q: slerpQ(stood.q, q, smooth(s / 0.5)) };
}

// the deck on a stand: n cards stacked face down; it sways when it is a tower
function deckCards(side, t, out) {
  const d = DECK[side], n = S.deckCount(side, Math.min(t, STOP + 0.3)), sx = side === 'CN' ? -1 : 1;
  const back = side === 'CN' ? CELL.backCN : CELL.backUS;
  const sway = clamp((t - CUES.blizzard) / 3) * (t < STOP + 0.4 ? 1 : 0);
  const tw = t > S.TWITCH.t && t < S.TWITCH.t + 0.5 && side === 'CN' ? Math.sin((t - S.TWITCH.t) / 0.5 * Math.PI) : 0;
  for (let i = 0; i < n; i++) {
    const r = mulberry32(i * 31 + (side === 'CN' ? 1 : 2));
    const hgt = (i + 0.5) * CARD.T * 1.04;
    const lean = sway * (hgt * hgt) * 0.12 * Math.sin(t * 2.6 + side.length);
    const pos = [d[0] + (r() - 0.5) * 0.006 + lean * sx, d[1] + hgt, d[2] + (r() - 0.5) * 0.006 + lean * 0.4];
    let q = downQ(sx, 0.03 * (r() - 0.5));
    if (i === n - 1 && tw > 0) { q = mulQ(q, axisQ([1, 0, 0], tw * 0.18)); pos[1] += tw * 0.012; }
    // the rise takes the decks too: from the top down, each card peels off into the vortex
    const lift = RISE.t0 + 0.4 + (RISE.t1 - RISE.t0 - 0.6) * (1 - i / Math.max(1, n - 1));
    if (t > lift) { const pr = risePose({ pos, q }, lift, t, r()); if (t - lift > 3.6 || pr.pos[1] > 11) continue; out.push({ ...pr, face: CELL.glyph7, back, scale: 1, glyph: 1, gcell: CELL.glyph7, writhe: 1, glow: 0.15 }); continue; }
    out.push({ pos, q, face: CELL.blank, back, scale: 1 });
  }
  return { top: [d[0], d[1] + n * CARD.T * 1.04, d[2]], n };
}
// a card fired from a deck: up off the top, over the king's head, onto the mountain; the 5-02 pair hangs high first
function fireCard(f, t, heapRest, deckTop) {
  const sx = f.side === 'CN' ? -1 : 1;
  const P0 = deckTop;
  if (f.pair) {
    const hover = [sx * 1.05, 1.55, 0.3], lift = f.t, hv = f.t + 0.9, sw = f.land - 0.38;
    if (t < hv) { const u = smooth((t - lift) / 0.9); return { pos: [lerp(P0[0], hover[0], u), lerp(P0[1], hover[1], u) + Math.sin(Math.PI * u) * 0.1, lerp(P0[2], hover[2], u)], q: mulQ(basisQ([0, -1, 0], [sx, 0, 0]), axisQ([0, 1, 0], u * 2.4)) }; }
    if (t < sw) { const s = t - hv; return { pos: [hover[0] - sx * 0.06 * s, hover[1] + 0.03 * Math.sin(s * 2.2), hover[2] - 0.02 * s], q: mulQ(basisQ([0, -1, 0], [sx, 0, 0]), axisQ([0, 1, 0], 2.4 + 0.25 * Math.sin(s * 1.7))) }; }
    const u = clamp((t - sw) / (f.land - sw)), e = u * u;
    const from = [hover[0] - sx * 0.06 * (sw - hv), hover[1], hover[2] - 0.02 * (sw - hv)];
    return { pos: lerp3(from, heapRest.pos, e), q: slerpQ(mulQ(basisQ([0, -1, 0], [sx, 0, 0]), axisQ([0, 1, 0], 2.4)), heapRest.q, smooth(u)) };
  }
  const u = clamp((t - f.t) / (f.land - f.t));
  const C = [sx * 1.45, 1.25 + 0.3 * ((f.t * 7.3) % 1), 0.35];
  const b = (a, c, d) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * c + u * u * d;
  const pos = [b(P0[0], C[0], heapRest.pos[0]), b(P0[1], C[1], heapRest.pos[1]), b(P0[2], C[2], heapRest.pos[2])];
  const fl = Math.sin(u * 9 + f.t * 3) * 0.9 * (1 - u);
  const q = mulQ(slerpQ(basisQ([0, -1, 0], [sx, 0, 0]), heapRest.q, smooth(u)), axisQ([1, 0, 0], fl));
  return { pos, q };
}
// the AI's vast cards
function aiCards(t, out) {
  if (t < AI_ON) return;
  const g = clamp((t - AI_ON) / 3);
  RINGS.forEach((R, ri) => {
    for (let i = 0; i < R.n; i++) {
      const r = mulberry32(ri * 1000 + i * 7);
      let ang = (i / R.n) * Math.PI * 2 + R.w * (t - AI_ON) + r() * 0.08;
      const y = R.y + (r() - 0.5) * R.y * 0.25;
      let rad = R.r * (0.85 + 0.3 * r());
      // a meeting: two cards swing toward each other, touch face to face, part
      let meet = 0;
      for (const [tm, mr, a, bb] of MEET) if (mr === ri && (i === a || i === bb)) meet = Math.max(meet, Math.max(0, 1 - Math.abs(t - tm) / 1.6));
      const pos = [Math.cos(ang) * rad, y + meet * 2, Math.sin(ang) * rad - 0.1];
      const tilt = R.tilt + 0.3 * Math.sin(t * 0.15 + i);
      const n = [-Math.cos(ang) * Math.cos(tilt), -Math.sin(tilt) + 0.1 * Math.sin(t * 0.2 + i), -Math.sin(ang) * Math.cos(tilt)];
      const flip = Math.sin(t * 0.11 * (1 + r()) + i * 1.7) > 0.96 ? 1 : 0;
      const q = mulQ(basisQ(n, [0, 1, 0]), axisQ([0, 1, 0], flip * Math.PI * smooth((Math.sin(t * 0.11 * (1 + r()) + i * 1.7) - 0.96) / 0.04)));
      out.push({ pos, q, scale: R.s * (0.85 + 0.3 * r()) * (0.4 + 0.6 * g), face: CELL[`glyph${(i * 3 + ri) % 16}`], back: CELL.backBlack, glyph: 1, gcell: CELL[`glyph${(i * 5 + ri * 3) % 16}`], writhe: 0.6, glow: (0.35 + 0.45 * r()) * g + meet * 0.8 });
    }
  });
}
// the two cards that fall from the dark (7-01) and lie face down
function fallCard(id, t) {
  const F = FALL[id];
  if (t < F.t0) return null;
  const sx = sxOf(id);
  const rest = { pos: [F.at[0], CARD_Y * 0.5, F.at[1]], q: downQ(sx, 0) };
  if (t >= F.land) return rest;
  const u = (t - F.t0) / (F.land - F.t0);
  const yy = lerp(7.2, rest.pos[1], u * (2 - u) * 0.3 + u * 0.7);
  const sway = Math.sin(u * Math.PI * 3.2) * 0.32 * (1 - u);
  const pos = [F.at[0] + sway * 0.6, yy, F.at[1] + Math.cos(u * Math.PI * 2.4) * 0.18 * (1 - u)];
  const q = mulQ(downQ(sx, 0), mulQ(axisQ([1, 0, 0], Math.sin(u * Math.PI * 3.2) * 0.7 * (1 - u)), axisQ([0, 1, 0], u * 3.1 * (1 - u))));
  return { pos, q: slerpQ(q, rest.q, smooth((u - 0.85) / 0.15)) };
}
// where the peeking hand is: under the near edge of the card as it lifts about its far edge
function peekLift(id, t) { const pk = PEEK[id]; return 0.5 * ease(t, pk.lift, pk.lift + 0.45) * (1 - ease(t, pk.down, pk.down + 0.35)); }
function peekCorner(id, t) {
  const F = FALL[id], sx = sxOf(id), ang = peekLift(id, t);
  const near = [F.at[0] + sx * CARD.H / 2, 0, F.at[1]];       // the edge toward the king (the card's top edge points to him)
  const far = F.at[0] - sx * CARD.H / 2;
  const x = far + sx * CARD.H * Math.cos(ang), y = CARD.H * Math.sin(ang);
  const reach = ease(t, PEEK[id].reach, PEEK[id].lift);
  return lerp3(kingRest(id, DECK_HAND[id]), [x + sx * 0.03, y + 0.035, near[2] + 0.06], reach);
}
function feedCard(f, t) {
  const sx = sxOf(f.who), hh = f.k % 4 < 2 ? DECK_HAND[f.who] : (DECK_HAND[f.who] === 'R' ? 'L' : 'R');
  if (t < f.t0 || t > f.catch) return null;
  const c = P.catch(f.who, hh);
  const u = (t - f.t0) / (f.catch - f.t0);
  const pos = [lerp(f.from[0], c[0], u) + Math.sin(u * 7) * 0.12 * (1 - u), lerp(f.from[1], c[1], u * (0.3 + 0.7 * u)), lerp(f.from[2], c[2], u)];
  return { pos, q: mulQ(downQ(-sx, 0), axisQ([1, 0.3, 0], Math.sin(u * 9) * 0.6)) };
}

function cardsState(t, st, world) {
  const out = st.free;
  const { D } = S.heap();
  const HT = t > STAND.first - 1 ? S.heapTimes() : null;
  // ---- the decks (the finalists' stands)
  const top = { CN: deckCards('CN', t, out).top, US: deckCards('US', t, out).top };
  // ---- the heap: every card that has landed
  for (const d of D) {
    if (d.t > t) continue;
    const base = { face: d.face, back: d.back, scale: d.scale, glyph: d.glyph ?? 0, gcell: d.gcell ?? CELL.glyph0, writhe: d.writhe ?? 0 };
    let pose = { pos: d.rest.pos, q: d.rest.q };
    if (d.play?.chat) {
      // ChatGPT wakes: its screen lights and the words write themselves
      base.over = CELL.chatText; base.reveal = clamp((t - at('2-04', 0.35)) / 2.6);
      base.glow = 0.26 * ease(t, d.t + 0.1, at('2-04', 0.5)) * (1 - ease(t, at('2-07'), at('3-01', 1.5)));
      pose.q = d.rest.q;
    }
    if (HT && HT.has(d)) {
      const o = HT.get(d);
      if (t > o.lift) { pose = risePose(standPose(pose, o.stand, o.lift, o.seed), o.lift, t, o.seed); if (pose.pos[1] > 11 || t - o.lift > 3.6) continue; base.glow = 0.15; base.writhe = 1; base.glyph = 1; }
      else if (t > o.stand) { pose = standPose(pose, o.stand, t, o.seed); base.glyph = Math.max(base.glyph, smooth((t - o.stand) / 0.6)); base.writhe = Math.max(base.writhe, 0.8); base.glow = 0.12 * smooth((t - o.stand) / 0.6); }
    } else if (t > STOP + 0.5 && d.t < STOP + 0.5 && t > S.RISE.t1 + 1.5) continue;
    out.push({ ...base, ...pose });
  }
  // ---- plays in the air (or in the hand)
  for (const p of S.plays()) {
    const K = playKeys(p);
    if (t < K.cardIn || t >= p.t) continue;
    const id = p.who;
    if (t < p.tr) {
      // in the hand (or both hands; or put down for the flick)
      if (p.style === 'flick' && t >= FLICK.put) {
        const from = [FLICK.from[0], CARD_Y * 0.5, FLICK.from[1]];
        let pos = from, q = flatQ(1, 0);
        out.push({ ...cardBase(p), pos, q });
        continue;
      }
      const grow = clamp((t - K.cardIn) / 0.15);
      const c = { ...cardBase(p), ...held(id, K.both ? 'B' : p.hand, { mode: K.both ? 'giant' : 'look' }) };
      if (!p.deck && p.style !== 'giant') c.scale = (p.scale ?? 1) * (0.3 + 0.7 * grow);
      out.push(c);
      continue;
    }
    if (p.style === 'flick') {
      // skimming across the cloth, a quarter turn as it goes
      const u = clamp((t - FLICK.go) / (FLICK.hit - FLICK.go)), e = 1 - Math.pow(1 - u, 1.7);
      const to = [p.at[0], CARD_Y * 0.5, p.at[1]];
      out.push({ ...cardBase(p), pos: [lerp(FLICK.from[0], to[0], e), CARD_Y * 0.5, lerp(FLICK.from[1], to[2], e)], q: flatQ(Math.cos(e * 0.6), Math.sin(e * 0.6) * 0.3) });
      continue;
    }
    if (p.dest === 'house') { const sp = slotPose(p.slot); out.push({ ...cardBase(p), ...flight(p, t, sp) }); continue; }
    if (p.dest === 'cloth') {
      // the Llama: lands face up, then the tug
      const rest = { pos: [p.at[0], CARD_Y * 0.5, p.at[1]], q: flatQ(Math.cos(p.yaw), Math.sin(p.yaw)) };
      out.push({ ...cardBase(p), ...flight(p, t, rest) });
      continue;
    }
    const d = D.find((x) => x.play === p);
    if (d) out.push({ ...cardBase(p), ...flight(p, t, d.rest) });
  }
  // the house: standing between its card's landing and its fall
  for (let s = 0; s < HOUSE_SLOTS.length; s++) {
    const p = S.plays().find((q) => q.dest === 'house' && q.slot === s);
    const f = S.houseFall(s);
    if (t < p.t || t >= f.t1) continue;
    const d = D.find((x) => x.house === s);
    out.push({ ...cardBase(p), ...houseCard(s, t, d.rest) });
  }
  // the R1 card resting against the fallen house, the Llama on the cloth and in the tug
  const llama = S.plays().find((p) => p.style === 'open');
  if (t >= llama.t) {
    const tug = tugState(t);
    if (!tug) { if (t < at('3-03', 1.25)) out.push({ ...cardBase(llama), pos: [llama.at[0], CARD_Y * 0.5, llama.at[1]], q: flatQ(Math.cos(llama.yaw), Math.sin(llama.yaw)) }); }
    else if (tug.won < 0.98) out.push({ ...cardBase(llama), pos: tug.mid, q: mulQ(flatQ(Math.cos(llama.yaw), Math.sin(llama.yaw)), axisQ([1, 0, 0], 0.3 * Math.sin(t * 16) * (1 - tug.won))), scale: 1 - 0.7 * clamp((tug.won - 0.6) / 0.4) });
  }
  // ---- @4: the two cards they hold, lay down, and that later stand and rise with the rest
  for (const id of FINAL) {
    const H = HELD[id], sx = sxOf(id);
    if (t < H.draw) continue;
    const rest = { pos: [H.at[0], CARD_Y * 0.5, H.at[1]], q: downQ(-sx, 0) };
    const base = { face: id === 'deepseek' ? CELL.deepseek7 : CELL.openai7, back: id === 'deepseek' ? CELL.backCN : CELL.backUS, glyph: 1, gcell: H.gcell, writhe: 1, glow: 0.25, scale: 1.25 };
    if (t < H.down) {
      const c = { ...base, ...held(id, DECK_HAND[id], { mode: 'look', tremble: t > at('4-01') ? 1 : 0.3, faceTo: id === 'deepseek' && t >= at('4-01') && t < at('4-02') ? S.INSERT.cam : null }) };
      // the last moments: blend into lying face down
      const mx = clamp((t - (H.down - 0.5)) / 0.5);
      if (mx > 0) { c.hand.mix = smooth(mx); c.hand.to = rest; }
      out.push(c);
      continue;
    }
    // lying face down; from 6-04 it stands with the mountain, then rises
    let pose = rest;
    const st0 = STAND.wave1 - 0.4, rs = RISE.t1 - 0.3;
    if (t > rs) { pose = risePose(standPose(rest, st0, rs, 0.4), rs, t, 0.4); if (t - rs > 3.6) continue; }
    else if (t > st0) pose = standPose(rest, st0, t, 0.4);
    out.push({ ...base, ...pose });
  }
  // ---- @5: what the decks fire (with the hover of the first pair)
  for (const d of D) {
    if (!d.fire) continue;
    const f = d.fire;
    if (t < f.t || t >= d.t) continue;
    if (t > STOP && f.land > STOP) {
      // everything in the air drops where it is (6-01): straight down onto the heap
      const at0 = fireCard(f, STOP, d.rest, top[f.side]);
      const u = clamp((t - STOP) / 0.45);
      out.push({ face: f.face, back: CELL.backBlack, scale: f.scale, glyph: 1, gcell: f.face, writhe: 1, glow: 0.12, pos: lerp3(at0.pos, d.rest.pos, u * u), q: slerpQ(at0.q, d.rest.q, u) });
      continue;
    }
    out.push({ face: f.face, back: CELL.backBlack, scale: f.scale, glyph: 1, gcell: f.face, writhe: 1, glow: f.pair ? 0.45 : 0.22, ...fireCard(f, t, d.rest, top[f.side]) });
  }
  // ---- @6 →: the AI's vast cards
  aiCards(t, out);
  // ---- @7: the two that fall; the peek; the new little pile; the feed
  for (const id of FINAL) {
    const F = FALL[id], sx = sxOf(id), p2 = PLAY2[id];
    const base = { face: CELL.blank, back: CELL.backBlack, glyph: 0, glow: t < F.land ? 0.7 : 0.12, scale: t < F.land ? 1.25 : 1 };
    if (t < F.t0) continue;
    if (t < p2 - 0.45) {
      let c = fallCard(id, t);
      const ang = peekLift(id, t);
      if (ang > 0) {
        // lifted about its far edge (toward the middle): the near edge rises, the face tilts toward its king
        const xf = F.at[0] - sx * CARD.H / 2;
        const a = [sx * Math.cos(ang), Math.sin(ang), 0], n = [sx * Math.sin(ang), -Math.cos(ang), 0];
        c = { pos: [xf + sx * (CARD.H / 2) * Math.cos(ang), (CARD.H / 2) * Math.sin(ang) + T2, F.at[1]], q: basisQ(n, a) };
      }
      out.push({ ...base, ...c });
    } else if (t < p2 - 0.08) out.push({ ...base, ...held(id, DECK_HAND[id], { mode: 'look' }) });
    else {
      const rest = { pos: [sx * 0.05, CARD_Y * 0.5 + (id === 'openai' ? CARD.T : 0), 0.02], q: flatQ(Math.cos(sx * 0.4), Math.sin(sx * 0.4)) };
      const u = clamp((t - (p2 - 0.08)) / 0.24);
      const from = P.rel(id, DECK_HAND[id]);
      out.push({ ...base, pos: lerp3(from, rest.pos, u), q: slerpQ(basisQ([0, -1, 0], [-sx, 0, 0]), rest.q, u) });
    }
  }
  const FD = S.feed();
  FD.forEach((f, n) => {
    const base = { face: CELL.blank, back: CELL.backBlack, glyph: 0, glow: t < f.catch ? 0.6 : 0.1 };
    if (t < f.t0) return;
    const hh = f.k % 4 < 2 ? DECK_HAND[f.who] : (DECK_HAND[f.who] === 'R' ? 'L' : 'R');
    if (t < f.catch) { const c = feedCard(f, t); if (c) out.push({ ...base, ...c }); return; }
    if (t < f.slap - 0.06) { out.push({ ...base, ...held(f.who, hh, { mode: 'look' }) }); return; }
    const rest = { pos: [f.at[0], CARD_Y * 0.5 + (n + 2) * CARD.T * 0.9, f.at[1]], q: flatQ(Math.cos(f.yaw), Math.sin(f.yaw)) };
    const u = clamp((t - (f.slap - 0.06)) / 0.18);
    const from = P.rel(f.who, hh);
    out.push({ ...base, pos: lerp3(from, rest.pos, u), q: slerpQ(basisQ([0, -1, 0], [-sxOf(f.who), 0, 0]), rest.q, u) });
  });
  void world;
}

// ---------------------------------------------------------------- the ant
function antState(t) {
  const A = S.antAt(t);
  if (!A.show) return { show: 0 };
  const [dx, dz] = A.dir;
  const fwd = [dx * Math.cos(A.pitch), -Math.sin(A.pitch), dz * Math.cos(A.pitch)];
  const up = [dx * Math.sin(A.pitch), Math.cos(A.pitch), dz * Math.sin(A.pitch)];
  const bend = A.pitch > 0.02 && A.pitch < Math.PI / 2 - 0.02 ? 140 : 0;
  return { show: 1, pos: A.pos, q: basisQ(fwd, up), walk: A.dist / ANT_STRIDE, speed: A.speed, alert: A.alert, look: A.look, crumb: 1, crumbTilt: A.crumbTilt, size: 1, groundBend: bend };
}

// ---------------------------------------------------------------- the whole world
export function base(t, world) {
  const st = { look: {}, set: {}, props: {}, kings: {}, cards: { throws: [], jokers: { CN: { show: false }, US: { show: false } } }, fx: {}, cardking: { show: 0 }, paper: {}, free: [], decks: { CN: { show: 1 }, US: { show: 1 } } };
  // ---- set: the lamp (swings with the giant and the blizzard, circles in the rise), the ceiling, the table's jump
  const gl = S.plays().find((p) => p.style === 'giant');
  const swX = kick(t, gl.t, 0.55, 0.9) * 0.07 + (t > CUES.blizzard && t < STOP + 3 ? Math.sin(t * 2.3) * 0.11 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const swZ = kick(t, gl.t + 0.05, 0.5, 0.9) * 0.045 + (t > CUES.blizzard && t < STOP + 3 ? Math.cos(t * 1.9) * 0.08 * clamp((t - CUES.blizzard) / 2) * (1 - clamp((t - STOP) / 3)) : 0);
  const circ = t > S.RISE.t0 ? 0.16 * ease(t, S.RISE.t0, S.RISE.t0 + 1.5) * (1 - ease(t, S.RISE.t1 + 0.5, at('6-07', 1.5))) : 0;
  const ca = (t - S.RISE.t0) * 3.2;
  st.set = {
    lamp: { on: 1, swing: [swX + circ * Math.cos(ca), swZ + circ * Math.sin(ca)], flicker: t > CUES.blizzard && t < STOP ? 0.25 * Math.max(0, Math.sin(t * 37) * Math.sin(t * 11.3)) : 0 },
    ceiling: t > S.CEIL_GONE ? 0 : 1,
    wobble: kick(t, gl.t, 2.2, 5) * -0.004,
    boxes: { CN: { show: 0 }, US: { show: 0 } }, giants: { CN: { show: 0 }, US: { show: 0 } },
    cloth: { cities: 0, gold: 0, flood: null },
    board: { show: 0 },
  };
  st.props = { plates: { show: 1 } };
  // ---- kings
  kingsState(t, st);
  // ---- the ant
  st.ant = antState(t);
  if (world?.lite) return st;
  // ---- cards
  cardsState(t, st, world);
  // ---- light: the ChatGPT card lights the faces from below; the AI's cold light from above (6-05 →)
  const chat = S.plays().find((p) => p.chat);
  if (t > chat.t && t < at('3-02')) {
    const g = ease(t, chat.t + 0.15, at('2-04', 0.6)) * (1 - ease(t, at('2-07'), at('3-01', 1.0)));
    st.look.p3 = { pos: [0, 0.2, 0], col: [0.8 * g, 1.15 * g, 0.88 * g], range: 2.5 };
  }
  if (t > AI_ON) {
    const g = ease(t, AI_ON, AI_ON + 3);
    st.look.p2 = { pos: [0, 13, -0.1], col: [0.9 * g, 0.85 * g, 0.7 * g], range: 34 };
  }
  // ---- the title
  if (t > CUES.title) {
    const a = ease(t, CUES.title + 0.6, CUES.title + 1.6);
    st.titles = { zh: '失控', en: 'OUT OF CONTROL', alpha: a, credit: 'MakerJackie' };
  }
  return st;
}
export { headAt, P as POINTS, fallCard, peekLift, feedCard, mimeBeat };
void end;
