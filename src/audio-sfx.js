// Sound department — the effects track and the ambience of 《失控》 OUT OF CONTROL (docs/SOUND.md).
// 1. Every picture event from soundEvents() (owned by the director) is rendered with the synth for its kind
//    (audio-kinds.js FILM_KINDS; the v1/v2/v3 kinds still play), at the kind's mix level x the event's gain, panned
//    (from `who` when the event has no pan), sent to its room. prepareEvents shapes the director's list for the mix: the
//    three VACUUMS (the ant's slap 1-05, the giant card 3-06, the end slam 8-06: the hit and its whoosh are solo), the
//    ant's-eye group, the background slaps thinned; the holdout rows (5-05 .. 5-09) pull the auto game back (HUSH).
// 2. The score's own ambience events (scoreEvents): the far tosses under the ant (1-02 / 1-03) and a yawn (1-07), each
//    dropped when the director has that kind there. (endSteps, the v3 ending's steps, is kept but no longer used.)
// 3. The room's hum (audio.js schedules it).
// When soundEvents() is empty the film runs on testEvents() (a stand-in list from the shot table).
// Nothing here hard-codes a film second: times come from CUES / ROW / SHOT / the events.
import { SR, TAU, Noise, Drift, SVF, Rng, panGains, smooth, clamp, put, BLOCK, drive } from './audio-dsp.js';
import { SFX_KINDS as V12_KINDS, SFX_GEN as V12_GEN } from './audio-sfxlib.js';
import { V3_KINDS, FILM_KINDS, FILM_GEN, SCORE_KINDS, isUS, preOf } from './audio-kinds.js';
import { boardTops } from './dir/story.js';
import { KING } from './layout.js';

export const SFX_KINDS = { ...V12_KINDS, ...V3_KINDS, ...SCORE_KINDS, ...FILM_KINDS };
export const SFX_GEN = { ...V12_GEN, ...FILM_GEN };

// per-kind mix: [gain, room send, group]. Groups: 's' the effects room (RT60 1.3 s), 'b' the big room (the ant's-eye
// impacts with the hall far away, the AI's vast sounds), 'm' the music's room. Solo events (the vacuums) go to their own
// uncarved group with the big room.
export const MIX = {
  antStep: [0.55, 0.05, 's'], antAlert: [0.5, 0.06, 's'], cardToss: [0.55, 0.12, 's'], cardDraw: [0.6, 0.08, 's'], cardSlap: [0.8, 0.14, 's'],
  cardWhoosh: [0.5, 0.1, 's'], chatWake: [0.9, 0.35, 'b'], typing: [1.1, 0.2, 's'], awe: [0.35, 0.22, 's'], chuckle: [0.45, 0.1, 's'],
  scuffle: [0.8, 0.12, 's'], cardSkim: [0.8, 0.1, 's'], towerCrash: [0.9, 0.16, 's'], bigSlam: [1.0, 0.32, 'b'], lampSwing: [0.8, 0.22, 'b'],
  chairSlide: [0.9, 0.28, 'b'], tremble: [0.9, 0.05, 's'], breath: [0.9, 0.06, 's'], cardDown: [0.8, 0.08, 's'], deckTwitch: [0.7, 0.18, 's'],
  deckFire: [0.6, 0.12, 's'], stream: [0.55, 0.14, 's'], blizzard: [0.95, 0.22, 'b'], stop: [0, 0, 's'], cardsFall: [0.7, 0.2, 's'],
  cardStand: [0.75, 0.3, 'b'], standWave: [0.9, 0.3, 'b'], rise: [1.0, 0.35, 'b'], lampSpin: [0.8, 0.3, 'b'], farSlap: [1.0, 0.45, 'b'],
  leafFall: [0.45, 0.25, 'b'], cardTap: [0.6, 0.12, 's'], peek: [0.7, 0.08, 's'], smallSlap: [0.55, 0.12, 's'], smile: [0, 0, 's'], rage: [0, 0, 's'],
  // the score's own
  yawn: [0.5, 0.3, 'b'], creakS: [0.1, 0.15, 's'], whoosh: [0.5, 0.2, 's'],
  // v2 (托管)
  screenTap: [0.35, 0.06, 's'], hintDing: [0.8, 0.25, 's'], autoOn: [0.7, 0.15, 's'], autoPlay: [0.4, 0.12, 's'], cancelPress: [0.7, 0.08, 's'],
  screenDeal: [0.5, 0.3, 's'], crumbRoll: [0.6, 0.05, 's'], crownRoll: [0.22, 0.3, 's'], endSlam: [1.1, 0.32, 'b'],
  // v3 (榜首)
  blast: [2.4, 0.3, 'b'], denied: [0.7, 0.06, 's'], errorAlarm: [1.6, 0.15, 's'], screenEye: [0.4, 0.3, 'b'], pressure: [0.5, 0.2, 'b'], boardFlip: [0.5, 0.1, 's'],
  // v7: the holdouts (the chairs go into the dark: the big room), the last card (dry: no room at all)
  hesitate: [0.9, 0.06, 's'], eliminated: [0.6, 0.12, 's'], dragOut: [1.0, 0.3, 'b'], creditSlap: [1.4, 0, 's'], countUp: [2.0, 0.1, 's'],
  // v9: 半托管, the round timer, 超时
  semiOn: [0.8, 0.2, 's'], countdown: [1.9, 0.08, 's'], timeout: [0.9, 0.1, 's'],
};
const mixOf = (k) => MIX[k] ?? [1, 0.15, 's'];
// the ant's-eye impacts go to the big room (the hall far away)
const ANT_BIG = new Set(['cardSlap', 'cardToss', 'cardWhoosh']);
export const groupOf = (e) => (e.solo ? 'x' : e.group ?? (e.pov === 'ant' && ANT_BIG.has(e.kind) ? 'b' : mixOf(e.kind)[2]));

// the re-recording mix: dB by kind for events starting in a row (or a named range); the narrowest wins
export const SCENE = {
  cardSlap: { '1-05': 2, '2-05': 7, '3-01': 6, '3-07': -7, '4-01': -14, '4-03': 6, '6-01': -9, '6-02': -12, '6-03': -24, '6-04': -18, '6-05': -14, '6-06': -12, '6-08': -28 },
  cardToss: { '1-02': -2, '1-03': -2, '3-01': 6 },
  screenTap: { '2-04': 10, '3-01': 8, '4-03': 6, '3-07': -4 },
  autoPlay: { '6-01': -8, '6-02': -12, '6-03': -24, '6-04': -18, '6-05': -14, '6-06': -12, '6-08': -28, '6-09': -4 },
  boardFlip: { '6-03': -12, '2-07': 16, '3-04': 12 },
  towerCrash: { '3-03': 14 },
  cardSkim: { '3-03': 8 },
  crumbRoll: { '1-06': -10 },
  cancelPress: { '6-04': 0 },
  autoOn: { '5-04': 2 },
  chuckle: { '5-10': -2 },
  hintDing: { '4-02': 8, '4-04': 9, '5-01': -6, '5-02': -8 },
};
// whole rows pulled back, all kinds but a few: { row: [dB, [kinds kept]] }. v9 5-07 .. 5-10: we are with the holdouts;
// the auto game goes on behind them, far
const HOLD_KEEP = ['timeout', 'eliminated', 'dragOut', 'screenTap', 'chuckle', 'countUp'];
// the rows where the leaderboard fills the frame: its moves there are the whole board reshuffling (a cascade of slides)
const BOARD_SHOTS = ['2-03', '2-07', '3-04', '3-07', '4-03', '6-02'];
export const HUSH = { '5-04': [-5, ['countdown', 'timeout', 'autoOn', 'boardFlip']], '5-07': [-10, HOLD_KEEP], '5-08': [-10, HOLD_KEEP], '5-09': [-10, HOLD_KEEP], '5-10': [-13, HOLD_KEEP] };
// CHOKES: at these film times every effect that started earlier is cut (8 ms), except the kinds kept
export function chokes(C) { return [[C.crumb, new Set(['crumbRoll', 'antStep'])], [C.stop, new Set()], [C.black, new Set(['endSlam'])]]; }
function sceneOf(C, ROW) {
  const out = {}, rangeOf = (id) => (ROW[id] ? [ROW[id].t0, ROW[id].t1] : null);
  for (const [kind, T] of Object.entries(SCENE)) {
    out[kind] = [];
    for (const [id, db] of Object.entries(T)) { const r = rangeOf(id); if (r) out[kind].push([r[0], r[1], db]); }
    out[kind].sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  }
  out['*'] = [];
  for (const [id, [db, keep]] of Object.entries(HUSH)) { const r = rangeOf(id); if (r) out['*'].push([r[0], r[1], db, new Set(keep)]); }
  return out;
}
function sceneDb(S, e) {
  let db = 0;
  const T = S[e.kind];
  if (T) for (const [a, b, d] of T) if (e.t >= a && e.t < b) { db = d; break; }
  for (const [a, b, d, keep] of S['*']) if (e.t >= a && e.t < b && !keep.has(e.kind)) { db += d; break; }
  return db;
}
// level automation (dB over film time, linear between keys, held outside), per kind, optionally only for events
// starting in [from0, from1): [kind, [[t, dB], ...], from0?, from1?]
export function levels(C, ROW) {
  const A = [];
  // the machine's dense stream under the music, the red cards louder as they take over
  A.push(['autoPlay', [[C.red, 0], [C.blizzard, 3]]]);
  // the leaderboard under 托管: the moves come in bursts, far back
  A.push(['boardFlip', [[C.auto + 1.5, 0], [C.auto + 3, -7]]]);
  // the giant card's ring pulled back under the board's flip (3-07)
  A.push(['bigSlam', [[C.boardBig - 0.3, 0], [C.boardBig + 0.4, -7]]], ['lampSwing', [[C.boardBig - 0.3, 0], [C.boardBig + 0.4, -5]], C.big, C.boardBig]);
  return A;
}
function autoOf(A, e, len) {
  const out = [], t1 = e.t + len / SR;
  for (const [kind, keys, f0, f1] of A) if (kind === e.kind && (f0 === undefined || (e.t >= f0 && e.t < f1)) && keys[0][0] < t1) out.push(keys);
  return out;
}
const dbAt = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, x] = keys[i - 1], [b, y] = keys[i]; return x + (y - x) * (t - a) / Math.max(1e-9, b - a); } return keys[keys.length - 1][1]; };

// ---- pans: the events carry none. From the cast table (layout.js): side 'CN' = the left row (warm), 'US' = the right
// row (cool), seen from the table's foot; the finalists' seat (2) nearer the middle, seats 1 and 3 wider.
export function panOf(e) {
  if (e.pan !== undefined) return e.pan;
  const w = e.who;
  if (w === undefined || w === null) return 0;
  if (w === 'CN' || w === 'US') return w === 'US' ? 0.5 : -0.5;
  const k = KING[w];
  if (!k) return 0;
  return (k.side === 'US' ? 1 : -1) * (k.seat === 2 ? 0.35 : k.seat === 1 ? 0.5 : 0.65);
}

// ---- the director's list, prepared for the mix (documented in docs/SOUND.md)
export const DENSE = { cardSlapBed: 4, cardSlapDeck: 5, deckFire: 4, cardToss: 4, stream: 2, confirmTap: 3 };
function thin(list, N0) {
  const ts = list.map((e) => e.t), g = new Float32Array(list.length);
  for (let i = 0, a = 0, b = 0; i < list.length; i++) {
    while (ts[a] < ts[i] - 0.25) a++;
    while (b < list.length && ts[b] < ts[i] + 0.25) b++;
    g[i] = Math.min(1, Math.sqrt(N0 / Math.max(1, b - a)));
  }
  return g;
}
// the vacuums: the ant's slap (1-04: the first cardSlap from the ant's eye) and the giant card
export function findVacuums(events) {
  const ant = events.filter((e) => e.kind === 'cardSlap' && e.pov === 'ant').sort((a, b) => a.t - b.t)[0];
  const big = events.find((e) => e.kind === 'bigSlam'), end = events.find((e) => e.kind === 'endSlam');
  return [ant, big, end].filter(Boolean);
}
// the end (7-08): the hit-by-hit crossfade of the kings' slaps into the ant's steps
export const morphAt = () => 0;
export function prepareEvents(events, C, ROW) {
  const notes = [];
  let out = events.map((e) => {
    const x = { ...e, gain: e.gain ?? 1 };
    // the table's breath {kind: 'in' | 'out'} can arrive with its kind overwritten: restore it
    if (x.kind === 'in' || x.kind === 'out') { x.dir = x.kind; x.kind = 'breath'; }
    if (x.kind === 'breath' && x.dir === undefined) x.dir = x.io ?? x.phase ?? x.way ?? 'in';
    return x;
  });
  // the digital zero (6-01: from the stop to 6-02): nothing in it is rendered
  const stop = out.find((e) => e.kind === 'stop'), z0 = stop ? stop.t : C.stop, z1 = C.rise;
  const muted = out.filter((e) => e.kind !== 'stop' && e.t >= z0 - 0.001 && e.t < z1);
  if (muted.length) { notes.push(`${muted.length} events inside the digital zero (6-01) not rendered: ${[...new Set(muted.map((e) => e.kind))].join(', ')}`); out = out.filter((e) => !muted.includes(e)); }
  // the vacuums: the hit and the whoosh that brings it are solo (their own uncarved group); audio.js carves everything
  // else over the hit's pre-roll
  const vac = findVacuums(out);
  for (const v of vac) {
    v.solo = true;
    for (const e of out) if (e.kind === 'cardWhoosh' && e.t < v.t && e.t + (e.dur || 0.35) > v.t - preOf(v) - 0.05 && e.t > v.t - 1.5) e.solo = true;
  }
  // v9: 半托管's confirm taps (every screenTap from 5-01 on) are the rubber stamp; the round timer stops dead at the
  // first 超时
  for (const e of out) if (e.kind === 'screenTap' && e.t >= C.semi && e.t < C.red) e.confirm = true;
  { const to = out.filter((e) => e.kind === 'timeout').sort((a, b) => a.t - b.t);
    for (const e of out) if (e.kind === 'countdown') { const x = to.find((q) => q.t > e.t && q.t < e.t + (e.dur || 0) + 0.5); if (x) { e.stopAt = x.t - e.t; notes.push(`countdown ${e.t.toFixed(2)}..${x.t.toFixed(2)}: stopped dead at the 超时`); } } }
  // background slaps (gain < 0.6) are a bed: thinned in bursts; the decks' flicks too
  for (const [kind, N0] of Object.entries(DENSE)) {
    const L = out.filter((e) => (kind === 'cardSlapBed' ? e.kind === 'cardSlap' && e.gain < 0.6 : kind === 'cardSlapDeck' ? e.kind === 'cardSlap' && e.deck && e.gain >= 0.6 : kind === 'confirmTap' ? e.kind === 'screenTap' && e.confirm : e.kind === kind)).sort((a, b) => a.t - b.t);
    const g = thin(L, N0); let n = 0;
    L.forEach((e, j) => { if (g[j] < 1) { e.gain *= g[j]; n++; } });
    if (n) notes.push(`${kind}: ${n} of ${L.length} thinned in bursts`);
  }
  // the leaderboard (v8): every boardFlip is a new #1; the story's list says whose. A chime when the #1 changes hands
  // (not when he beats himself, nor when only the date turns)
  { const tops = boardTops().filter((b) => b.t > 0); let prev = null, nC = 0;
    for (const e of out.filter((x) => x.kind === 'boardFlip').sort((a, b) => a.t - b.t)) {
      const b = tops.find((x) => Math.abs(x.t - e.t) < 0.02);
      if (b?.dateOnly) { e.dateOnly = true; continue; }
      e.chime = !b || b.who !== prev; if (b) prev = b.who; if (e.chime) nC++;
      if (BOARD_SHOTS.some((id) => ROW[id] && e.t >= ROW[id].t0 && e.t < ROW[id].t1)) e.big = true;
    }
    notes.push(`leaderboard: ${nC} chimes (the #1 changing hands) of ${out.filter((x) => x.kind === 'boardFlip').length} moves`); }
  // the ChatGPT card (2-03): its weight in the hall
  for (const e of out) if (e.kind === 'cardSlap' && e.t >= C.chat && e.t < C.blast) e.group = 'b';
  // the lazy game heard from the ant (before 1-07): far up the table, through the wood
  for (const e of out) if (e.kind === 'cardToss' && e.t < ROW['1-07'].t0) e.pov = 'ant';
  // the ant's steps: a fixed variant each (the end replays the opening's with the same waveforms)
  for (const e of out) if (e.kind === 'antStep' && e.variant === undefined) e.variant = ((Math.round(e.t * 1000) * 5 + 3) % 8 + 8) % 8;
  // 7-08: every slap of the kings is crossfaded, hit by hit, into one of the ant's steps (same time): the slap thinner,
  // drier and smaller, the step coming up to the opening's level
  const t8 = Infinity, stepG = medianGain(out, 'antStep', ROW['1-02'].t0, ROW['1-03'].t0) ?? 0.85;
  let nM = 0;
  const add = [];
  for (const e of out) if (e.kind === 'smallSlap' && e.t >= t8 && e.t < C.title) {
    const m = morphAt(ROW, e.t);
    if (e.pov === undefined) e.pov = 'far';
    if (m > 0) { add.push({ t: e.t, kind: 'antStep', surface: 'cloth', gain: stepG * Math.pow(m, 0.8), variant: nM % 8, morph: true, pan: 0 }); nM++; }
    e.gain *= Math.pow(1 - m, 1.5);
  }
  out.push(...add);
  if (nM) notes.push(`7-08: ${nM} slaps crossfaded into the ant's steps`);
  for (const e of out) e.pan = panOf(e);
  if (vac.length) notes.push(`vacuums before ${vac.map((v) => `${v.kind} ${v.t.toFixed(2)}`).join(', ')} (solo: ${out.filter((e) => e.solo).map((e) => e.kind).join(', ')})`);
  return { events: out.sort((a, b) => a.t - b.t), notes, vacuums: vac.map((v) => [v.t, v]) };
}
function medianGain(events, kind, a, b) {
  const g = events.filter((e) => e.kind === kind && e.t >= a && e.t < b).map((e) => e.gain ?? 1).sort((x, y) => x - y);
  return g.length ? g[g.length >> 1] : null;
}

// ---- the score's own ambience events. Each family is dropped as soon as the director's list has that kind.
export function scoreEvents(C, ROW, events) {
  const E = [], has = (kind, a = -Infinity, b = Infinity) => events.some((e) => e.kind === kind && e.t >= a && e.t < b);
  const ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, amb: true, ...o });
  // 1-02 / 1-03: the far, muffled game up on the table, heard from the ant
  if (!has('cardToss', ROW['1-02'].t0, ROW['1-05'].t0)) [[1.2, 'meta', 0.6], [3.1, 'xai', 0.5]].map(([k, w, g]) => [ROW['1-02'].t0 + k, w, g]).concat([[ROW['1-03'].t0 + 1.5, 'google', 0.55]]).forEach(([t, w, g]) => ev(t, 'cardToss', { who: w, pov: 'ant', gain: g, size: 0.8 }));
  // 1-07: a king yawning far down the table, the lazy game going on
  if (!has('yawn')) ev(ROW['1-07'].t0 + 1.9, 'yawn', { who: 'mistral', pan: 0.55, gain: 0.9 });
  // the holdouts' leaderboard insert (v8 5-06, v9 5-07): the auto scores counting up past "人类 100", Meta stuck at 93
  const passRow = Object.values(ROW).find((r) => Math.abs(r.t0 - C.pass) < 1e-6), ins = passRow?.cuts?.length > 1 ? passRow.cuts[0] : null;
  if (ins && !has('countUp')) ev(ins.t0 + 0.08, 'countUp', { dur: ins.t1 - ins.t0 - 0.12 });
  return E;
}
export const END_COPY = 3.0;   // seconds of the opening's steps replayed before the black
export function endSteps(C, ROW, events) {
  // the opening's steps (1-01, in the dark, from nothing) are the pattern: their times, surfaces and variants, looped to
  // fill the last seconds, at the level the steps reach in 1-02
  const dst0 = C.title - END_COPY, E = [], g2 = medianGain(events, 'antStep', ROW['1-02'].t0, ROW['1-03'].t0) ?? 0.85;
  const src = events.filter((e) => e.kind === 'antStep' && e.t < ROW['1-02'].t0).sort((a, b) => a.t - b.t);
  let steps = [];
  if (src.length >= 6) { const p0 = src[0].t, per = src[src.length - 1].t - p0 + (src[src.length - 1].t - src[src.length - 2].t); for (let c = 0; steps.length < 400 && c * per < END_COPY; c++) for (const e of src) { const t = e.t - p0 + c * per + 0.02; if (t < END_COPY - 0.01) steps.push({ t, gain: g2, surface: e.surface ?? 'cloth', variant: e.variant ?? 0 }); } }
  else steps = Array.from({ length: Math.floor(END_COPY / 0.17) }, (_, k) => ({ t: 0.05 + k * 0.17 + (k % 2 ? 0.012 : 0), gain: g2, surface: 'cloth', variant: k % 8 }));
  for (const s of steps) E.push({ t: dst0 + s.t, kind: 'antStep', surface: s.surface, gain: s.gain, variant: s.variant, pan: 0, amb: true, copy: true });
  // the fill: from the middle of 7-08, a step between the slaps, then more, the pulse becoming the gait
  const ioi = steps.length > 2 ? (steps[steps.length - 1].t - steps[0].t) / (steps.length - 1) : 0.17, g1 = steps.length ? steps[0].gain : 0.85;
  const slaps = events.filter((e) => e.kind === 'smallSlap' && e.t >= ROW['7-07'].t0 && e.t < C.title).map((e) => e.t).sort((a, b) => a - b);
  const pS = slaps.length > 3 ? (slaps[slaps.length - 1] - slaps[0]) / (slaps.length - 1) : 0.5;
  const f0 = ROW['7-08'].t0 + 2.6, f1 = dst0 - 0.5 * ioi;
  for (let t = f0, k = 0; t < f1; k++) {
    const u = clamp((t - f0) / (f1 - f0)), p = pS / 2 + (ioi - pS / 2) * smooth(u);
    t += p * (k % 2 ? 1.08 : 0.92);
    if (t >= f1) break;
    if (slaps.some((s) => Math.abs(s - t) < 0.06)) continue;
    E.push({ t, kind: 'antStep', surface: 'cloth', gain: g1 * (0.2 + 0.8 * smooth(u)), variant: (k * 3 + 1) % 8, pan: 0, amb: true });
  }
  return E;
}

// ---- a stand-in picture list from the shot table, for when soundEvents() is empty (and for `--test`)
export function testEvents(C, ROW, SHOT) {
  // v7: a minimal stand-in (the director's list is the real one): the steps, the crush, ChatGPT, the race, the giant
  // card, the 托管 slams and a holdout, the stop, the end slam, the last card
  const E = [], ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, ...o }), at = (id, k = 0) => ROW[id].t0 + k;
  for (let t = 0.3, k = 0; t < at('1-05', 0.9); t += 0.106, k++) ev(t, 'antStep', { surface: 'cloth', gain: Math.min(1, t / 2) });
  ev(at('1-05', 0.6), 'cardWhoosh', { who: 'openai', dur: 0.32 }); ev(at('1-05', 0.92), 'cardSlap', { who: 'openai', size: 1, hard: 1, pov: 'ant' });
  ev(at('2-05', 1.0), 'cardSlap', { who: 'openai', size: 1.2, hard: 1 }); ev(at('2-05', 1.0), 'blast', { dur: 2.2 });
  for (let t = at('3-01', 0.4), p = 0.7, i = 0; t < C.tower; t += p, p = Math.max(0.4, p * 0.95), i++) ev(t, 'cardSlap', { who: i % 2 ? 'openai' : 'anthropic', gain: 1 });
  ev(at('3-06', 2.2), 'bigSlam');
  ev(at('5-01', 1.7), 'semiOn', { who: 'openai' }); ev(at('5-01', 0.9), 'countdown', { dur: C.full - C.semi, from: 10, to: 0.3 }); ev(at('5-04', 0.5), 'timeout', { who: 'openai' });
  ['openai', 'anthropic', 'google', 'xai'].forEach((w, i) => ev(i === 0 ? at('5-04', 1.6) : at('5-06', 0.4 + 0.8 * (i - 1)), 'autoOn', { who: w }));
  for (let t = at('5-05', 0.1), i = 0; t < C.red; t += 0.3, i++) ev(t, 'cardSlap', { who: i % 2 ? 'openai' : 'anthropic', gain: 0.7 });
  ev(at('5-07', 2.0), 'timeout', { who: 'meta' }); ev(at('5-07', 3.1), 'eliminated', { who: 'meta' }); ev(at('5-08', 0.3), 'dragOut', { who: 'meta', dur: 2 });
  ev(C.stop, 'stop'); ev(at('8-06', 0.45), 'endSlam'); ev(at('9-03', 0.45), 'creditSlap');
  return E.sort((a, b) => a.t - b.t);
}

// ---- one event into its group: pre-roll (sig.pre), pan, level automation, chokes
function putEvent(G, e, sig, gain, send, chk, auto) {
  const stereo = !(sig instanceof Float32Array), len = stereo ? sig.L.length : sig.length, pre = sig.pre ?? 0, tS = e.t - pre;
  const s0 = Math.round(tS * SR) - G.off, n = G.dry.n;
  let [gl, gr] = panGains(e.pan ?? 0);
  if (stereo) { gl *= Math.SQRT2; gr *= Math.SQRT2; if (sig.panned) gl = gr = 1; gl = Math.min(gl, 1.25); gr = Math.min(gr, 1.25); }
  let cut = len;
  for (const [h, keep] of chk) if (h > tS && h < tS + len / SR && !keep.has(e.kind)) cut = Math.min(cut, Math.round((h - tS) * SR));
  const K = autoOf(auto, e, len), gAt = (i) => { let db = 0; for (const k of K) db += dbAt(k, tS + i / SR); return Math.pow(10, db / 20); };
  const fo = Math.round(0.008 * SR), i0 = Math.max(0, -s0), i1 = Math.min(len, cut, n - s0);
  let a0 = K.length ? gAt(i0) : 1, a1 = a0;
  for (let i = i0; i < i1; i++) {
    if (K.length && ((i - i0) & 63) === 0) { a0 = gAt(i); a1 = gAt(i + 64); }
    const j = s0 + i, au = K.length ? a0 + (a1 - a0) * (((i - i0) & 63) / 64) : 1, f = (cut - i < fo ? (cut - i) / fo : 1) * au;
    const a = (stereo ? sig.L[i] : sig[i]) * gain * gl * f, b = (stereo ? sig.R[i] : sig[i]) * gain * gr * f;
    G.dry.L[j] += a; G.dry.R[j] += b; G.send.L[j] += a * send; G.send.R[j] += b * send;
  }
}

let warned = false;
// render a list of events into the chunk's groups { s, b, m, x } (windowed); buildSfxG yields after every event
export const buildSfx = (C, ROW, groups, events, o) => drive(buildSfxG(C, ROW, groups, events, o));
export function* buildSfxG(C, ROW, groups, events, o = {}) {
  const scene = sceneOf(C, ROW), auto = levels(C, ROW), chk = o.chokes ?? chokes(C), counts = o.counts ?? {}, unknown = o.unknown ?? {};
  for (let k = 0; k < events.length; k++) {
    const e = events[k], fn = SFX_KINDS[e.kind];
    if (!fn) { unknown[e.kind] = (unknown[e.kind] || 0) + 1; continue; }
    const [g, send] = mixOf(e.kind), db = sceneDb(scene, e), G = groups[groupOf(e)] ?? groups.s;
    if (g * (e.gain ?? 1) > 0) {
      const gfn = SFX_GEN[e.kind], sig = gfn ? yield* gfn(e, 1000 + (e.seedIndex ?? 0) * 7) : fn(e, 1000 + (e.seedIndex ?? 0) * 7);
      putEvent(G, e, sig, g * (e.gain ?? 1) * Math.pow(10, db / 20), send, chk, auto);
    }
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    yield (k + 1) / events.length;
  }
  const unk = Object.entries(unknown);
  if (unk.length && !warned && typeof console !== 'undefined') { console.warn(`audio: skipped unknown sound-event kinds: ${unk.map(([k, n]) => `${k} x${n}`).join(', ')}`); warned = true; }
  return { counts, unknown };
}

// ============================================================ ambience
// The lamp's hum: 50 Hz mains with faint 100 / 150 Hz and a little 200 / 250, a slow drift, a breath of dark room
// tone. Written straight into the (windowed) L/R. Plain block functions, run straight or BLOCK by BLOCK (identical).
function* inBlocks(i0, i1, run) {
  for (let c0 = i0; c0 < i1; c0 += BLOCK) { const c1 = Math.min(i1, c0 + BLOCK); run(c0, c1); yield (c1 - i0) / Math.max(1, i1 - i0); }
}
function humSetup(L, off, t0, t1, o = {}) {
  const lvl = o.level ?? 0.01, lvlAt = o.lvlAt ?? (() => 1), i0 = Math.max(0, Math.round(t0 * SR) - off), i1 = Math.min(L.length, Math.round(t1 * SR) - off);
  if (i1 <= i0) return null;
  const P = 2048, H = [[1, 1, 0], [2, 0.3, 0.7], [3, 0.17, 1.9], [4, 0.05, 0.4], [5, 0.035, 2.6], [6, 0.018, 1.1]];
  const wL = new Float32Array(P + 1), wR = new Float32Array(P + 1);
  for (let i = 0; i <= P; i++) { const x = TAU * i / P; for (const [k, a, p] of H) { wL[i] += a * Math.sin(k * x + p); wR[i] += a * Math.sin(k * x + p + (k === 2 ? 0.35 : k === 3 ? -0.2 : 0)); } }
  const nl = Math.round(4.7 * SR), xf = Math.round(0.25 * SR), nL = new Float32Array(nl), nR = new Float32Array(nl);
  for (const [buf, sd] of [[nL, 504], [nR, 505]]) {
    const nz = new Noise(sd), lp = new SVF(240, 0.7), hp = new SVF(38, 0.7), tmp = new Float32Array(nl + xf);
    for (let i = 0; i < nl + xf; i++) { lp.run(nz.pink()); hp.run(lp.lp); tmp[i] = hp.hp * 0.9; }
    for (let i = 0; i < nl; i++) buf[i] = i < xf ? tmp[i] * (i / xf) + tmp[nl + i] * (1 - i / xf) : tmp[i];
  }
  return { lvl, lvlAt, i0, i1, off, P, wL, wR, nl, nL, nR, dA: new Drift(501, 0.21), dF: new Drift(502, 0.13), fi: Math.round(0.03 * SR), fo: Math.round(0.006 * SR), ph: 0, a: 1, inc: 50 * P / SR };
}
function humBlock(S, L, R, c0, c1) {
  const { lvl, lvlAt, i0, i1, off, P, wL, wR, nl, nL, nR, dA, dF, fi, fo } = S;
  let ph = S.ph, a = S.a, inc = S.inc, da = S.da ?? 0;
  for (let i = c0; i < c1; i++) {
    if (((i - i0) & 127) === 0) { const t = (i + off) / SR, tn = (i + 128 + off) / SR; const a1 = (1 + 0.08 * dA.at(tn)) * lvlAt(tn); if (i === i0) a = (1 + 0.08 * dA.at(t)) * lvlAt(t); da = (a1 - a) / 128; inc = 50 * (1 + 0.0005 * dF.at(t)) * P / SR; }
    a += da; ph += inc; if (ph >= P) ph -= P;
    const j = ph | 0, fr = ph - j, q = (i + off) % nl;
    const e = (i - i0 < fi ? (i - i0) / fi : 1) * (i1 - i < fo ? (i1 - i) / fo : 1) * lvl * a;
    L[i] += (wL[j] + (wL[j + 1] - wL[j]) * fr + nL[q]) * e; R[i] += (wR[j] + (wR[j + 1] - wR[j]) * fr + nR[q]) * e;
  }
  S.ph = ph; S.a = a; S.inc = inc; S.da = da;
}
export function humInto(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) humBlock(S, L, R, S.i0, S.i1); }
export function* humIntoG(L, R, off, t0, t1, o) { const S = humSetup(L, off, t0, t1, o); if (S) yield* inBlocks(S.i0, S.i1, (c0, c1) => humBlock(S, L, R, c0, c1)); }
export { put, clamp, smooth, Rng };
