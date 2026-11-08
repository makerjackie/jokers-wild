// JOKERS WILD v2 — every sound the PICTURE makes, as one deterministic list (owned by the director).
// The sound department renders each event with its kind's synth; music locks to CUES and to these.
//
//   soundEvents() -> [{ t, kind, gain, pan, pitch, dur, size, who }]
//     t     film seconds          gain  0..1 (1 = the kind's normal level)
//     pan   -1 (CN side, left) .. +1 (US side, right)
//     pitch semitone offset       dur   seconds (for kinds that last)
//     size  0..1 (body / weight)  who   optional king id / side / prop name (for variety; seeds)
//
// Everything here is derived from the same plans the director draws from (dir/story.js, dir/throws.js, dir/board.js,
// plan.js), so picture and sound can't drift. Kinds: docs/SOUND.md and docs/PRODUCTION.md ("Sound: new event kinds").
import { ROW, CUES } from './shots.js';
import { KING } from './layout.js';
import { mulberry32 } from './util.js';
import { AUTO, puppetThrows, cancelJabs, LIGHT_ORDER, LIGHT_TIMES } from './plan.js';
import { allThrows, LADDER, DOUBLE, O1, R1, LAST, FIRST } from './dir/throws.js';
import { boardRows } from './dir/board.js';
import { ENTER, BOXING, LOCKS, STICKERS } from './dir/story.js';
import { PAIR_LAND } from './dir/s8.js';
import * as SET from './set.js';

const at = (id, k = 0) => ROW[id].t0 + k;
const end = (id, k = 0) => ROW[id].t1 + k;
const FPS = 24;

let CACHE = null;
export function soundEvents() {
  if (CACHE) return CACHE;
  const E = [];
  const ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, pan: 0, pitch: 0, dur: 0, size: 0.5, ...o });
  const rnd = mulberry32(1701);
  const panOf = (id) => (KING[id]?.side === 'CN' ? -0.6 : 0.6);
  const sidePan = (side) => (side === 'CN' ? -0.55 : 0.55);

  // ================================================================ the clock: an old room clock over the empty table,
  // then the AI's ticks on the frame grid (eighths -> sixteenths -> thirty-seconds), and the 嗒嗒嗒 into the black
  for (let t = 0.5; t < CUES.open - 0.1; t += 1.0) ev(t, 'tick', { gain: 0.5, size: 0.75, who: 'clock' });
  const tickStep = (t) => {
    if (t < CUES.open) return 0;
    if (t < CUES.arrive) return 12;
    if (t < CUES.jam) return 6;
    if (t < CUES.full) return 4;
    if (t < CUES.joker1) return 6;
    if (t < CUES.v3) return 0;                                                   // the joker: only its tone
    if (t < CUES.locks) return 4;
    if (t < CUES.frenzy) return 3;
    if (t < CUES.button) return t < CUES.mad ? 2 : 1;
    if (t < CUES.auto) return 0;                                                 // Claude and the button: only the heart
    if (t < CUES.burst) return 3;
    if (t < CUES.launch) return 4;
    if (t < CUES.pair) return 2;
    if (t < CUES.king) return 0;                                                 // silence, the heart, the bomb, the wave
    if (t < CUES.stare) return 6;
    if (t < CUES.slam) return 0;                                                 // the choice: only the hearts
    if (t < CUES.race) return 6;
    if (t < CUES.credits) return Math.max(1, Math.round(6 - 5 * Math.min(1, (t - CUES.race) / (CUES.black + 2 - CUES.race))));
    return 0;
  };
  const tickGain = (t) => (t < CUES.arrive ? 0.26 : t < CUES.burst ? 0.32 : t < CUES.wave ? 0.22 : t < CUES.race ? 0.26 : 0.34);
  for (let f = Math.ceil(CUES.open * FPS); f < CUES.credits * FPS; f++) {
    const t = f / FPS, st = tickStep(t);
    if (st && f % st === 0) ev(t, 'tick', { gain: tickGain(t) * (st === 1 ? 0.7 : 1), pan: (rnd() - 0.5) * 0.6, size: 0.2 + 0.2 * rnd() });
  }

  // ================================================================ the human layer: the heartbeat (54 bpm)
  const beat = 60 / 54;
  const hearts = (t0, t1, o = {}) => { for (let t = t0; t < t1; t += beat) ev(t, 'heart', { gain: 1, ...o }); };
  ev(at('3-03', 0.15), 'heart', { gain: 1 });
  hearts(at('4-06', 0.2), end('4-06'), { gain: 0.8 });
  hearts(at('6-08', 0.3), end('6-08'));
  ev(at('9-06', 0.25), 'heart', { gain: 1 }); ev(at('9-06', 0.25) + beat * 0.9, 'heart', { gain: 0.9 });
  hearts(CUES.stare + 0.2, CUES.slam - 0.05);

  // ================================================================ seq 1: the lamp, the breathing, the first card, code red
  ev(at('1-01', 1.0), 'switch', { gain: 0.6 });
  for (let t = at('1-02', 0.3); t < CUES.open; t += 2.6) ev(t, 'breath', { dur: 2.0, gain: 0.55, pan: 0.2, who: 'google' });
  ev(FIRST.t + FIRST.flight + 0.02, 'whoosh', { size: 0.6, gain: 0.7, who: 'ring' });
  ev(CUES.code + 0.3, 'chips', { size: 0.35, pan: 0.3, gain: 0.7 });
  ev(CUES.code + 0.5, 'pulse', { dur: CUES.arrive - CUES.code - 0.5, pan: 0.4, gain: 0.7 });
  for (let i = 0; i < 6; i++) ev(CUES.stir + 0.3 + i * 0.42 + rnd() * 0.2, 'chairSlide', { dur: 0.5 + rnd() * 0.4, gain: 0.25 + 0.1 * i, pan: (i % 2 ? 0.8 : -0.8), size: 0.6 });

  // ================================================================ every card thrown
  for (const th of allThrows()) {
    if (th.puppet || th.still) continue;
    const s = th.scale ?? 1, who = th.who;
    if (th.deal) { ev(th.t, 'deal', { pan: Math.sign(th.to[0]) * 0.5, gain: 0.8, dur: th.flight }); continue; }
    if (th.up) {
      if (who) ev(th.t, 'throw', { pan: panOf(who) * 0.6, gain: 0.4, who });
      ev(th.t + 0.05, 'flyUp', { pan: who ? panOf(who) * 0.4 : 0, gain: who ? 0.35 : 0.8, dur: th.flight });
      ev(th.land, 'absorb', { gain: who ? 0.25 : 0.9, size: who ? 0.4 : 1 });
      continue;
    }
    if (!th.gun && who) ev(th.t, 'throw', { pan: panOf(who) * 0.7, gain: 0.35 + 0.15 * Math.min(1, s / 3), size: Math.min(1, s / 4.6), who });
    if (th.gun) ev(th.land, 'slap', { pan: panOf(who) * 0.3, gain: 0.35, size: 0.3, who });
    else ev(th.land, s < 0.9 ? 'snap' : 'slam', { pan: who ? panOf(who) * 0.3 : 0, gain: Math.min(1, 0.55 + 0.1 * s), size: Math.min(1, 0.2 + s / 5), who });
  }

  // ================================================================ seq 2: chairs, clocks
  for (const id in ENTER) {
    const [t0, d] = ENTER[id];
    ev(t0, 'chairSlide', { dur: d, pan: panOf(id) * 0.9, who: id, size: KING[id].seat === 0 ? 0.5 : 0.7 });
    ev(t0 + d, 'chairStop', { pan: panOf(id) * 0.9, who: id });
  }
  for (const [row, id] of LADDER) for (let k = 0; k < 3; k++) { const t = at(row, -0.2 + k * 0.33); if (t < end(row)) ev(t, 'clockTick', { pan: panOf(id) * 0.5, gain: 0.7, who: id }); }
  ev(at('2-21', 0.3), 'clockRing', { pan: 0, dur: 0.5, gain: 0.9 });
  ev(at('2-19', 0.3), 'jam', { dur: DOUBLE.t + DOUBLE.flight + 0.2 - at('2-19', 0.3), gain: 0.8 });

  // ================================================================ seq 3: the jokers are born and boxed
  for (const [side, id, born] of [['US', 'openai', CUES.joker1], ['CN', 'deepseek', at('3-06', 0.05)]]) {
    const B = BOXING[side], p = sidePan(side);
    ev(born - (side === 'US' ? 2.4 : 1.4), 'groan', { dur: side === 'US' ? 2.4 : 1.4, pan: p * 0.6, who: id });
    ev(born, 'jokerHum', { dur: B.slam - born + 0.2, pan: p * 0.4, pitch: side === 'US' ? 0 : -1, who: side });
    ev(B.grab, 'paper', { dur: 0.2, pan: p * 0.6, gain: 0.6 });
    ev(B.slam, 'lidSlam', { pan: p * 0.5, who: side });
    ev(B.slam + 0.02, 'chains', { dur: 0.45, pan: p * 0.5, size: 0.6 });
    B.clicks.forEach((tc, i) => ev(tc, 'click', { pan: p * 0.5, gain: 0.9, size: 0.7, pitch: i * 0.3, who: side }));
  }
  ev(CUES.title + 0.6, 'jokerHum', { dur: 3.4, pan: 0, gain: 0.4, pitch: -2 });

  // ================================================================ the locks and the stickers
  for (const side of ['CN', 'US']) {
    const p = sidePan(side);
    LOCKS[side].forEach((ts, i) => {
      ev(ts - 0.35, 'keyTurn', { pan: p * 0.5, gain: i === 4 ? 0.8 : 1, who: side });
      ev(ts, 'lockOpen', { pan: p * 0.5, size: 0.7, who: side });
      ev(ts + 0.48, 'lockDrop', { pan: p * 0.5, size: 0.8, who: side });
      if (i < 4) ev(ts + 0.15, 'leak', { dur: 0.9, pan: p * 0.4, gain: 0.6, size: (i + 1) / 5 });
    });
    for (const ts of STICKERS[side]) ev(ts, 'sticker', { pan: p * 0.6, gain: 0.85, who: side });
  }

  // ================================================================ seq 4: the giants, the embargo, o1, R1, the avalanche, the kiln
  ev(CUES.eyes + 0.8, 'giantEyes', { pan: 0.7, who: 'US' });
  ev(CUES.eyes + 1.0, 'giantBreath', { dur: 2.0, pan: 0.7, who: 'US' });
  ev(CUES.starve + 0.6, 'giantEyes', { pan: -0.7, who: 'CN' });
  ev(CUES.starve + 0.8, 'giantBreath', { dur: 1.6, pan: -0.7, who: 'CN' });
  ev(CUES.giantUS, 'chipflow', { dur: CUES.embargo - CUES.giantUS, size: 0.6, pan: 0.5 });
  ev(CUES.embargo, 'chipflow', { dur: CUES.frenzy - CUES.embargo, size: 0.35, pan: 0.6, gain: 0.5 });
  ev(CUES.giantUS + 0.3, 'giantBreath', { dur: 2.0, pan: 0.6, who: 'US' });
  ev(CUES.giantUS + 0.4, 'chains', { dur: 2.0, size: 0.9, pan: 0.5 });
  ev(CUES.embargo - 0.4, 'sealSwing', { pan: 0.3 });
  ev(CUES.embargo + 0.02, 'seal', { gain: 1, pan: 0.1, who: 'US' });
  ev(CUES.embargo + 0.04, 'crunch', { gain: 0.9, pan: 0.1 });
  ev(CUES.starve + 0.2, 'chips', { size: 0.12, pan: -0.5, gain: 0.5 });
  ev(CUES.boast + 0.1, 'chips', { size: 1, dur: 0.8, pan: 0.6 });
  ev(O1.out - 0.2, 'groan', { dur: 1.1, pan: 0.6 });
  ev(O1.out + 0.05, 'press', { pan: 0.6, size: 1 });
  ev(at('4-09', 0.3), 'chips', { size: 0.1, pan: -0.6, gain: 0.5 });
  ev(at('4-09', 0.55), 'press', { pan: -0.6, size: 0.15, gain: 0.5 });
  ev(R1.t + R1.flight + 0.05, 'collapse', { gain: 1, pan: 0 });
  ev(CUES.avalanche + 0.3, 'avalanche', { dur: 2.6, size: 1, pan: 0.6 });
  ev(CUES.avalanche + 1.95, 'blink', { pan: 0.7, gain: 0.6 });
  ev(CUES.kiln + 0.4, 'kiln', { dur: CUES.frenzy - CUES.kiln - 0.4, pan: -0.6 });
  for (let i = 0; i < 8; i++) ev(CUES.kiln + 0.8 + i * 0.2, 'brick', { pan: -0.7, gain: 0.5 + 0.1 * rnd() });

  // ================================================================ seq 6: the frenzy
  ev(at('6-01', 0.6), 'clank', { pan: 0.5, size: 0.8 });
  ev(at('6-02', 0.6), 'crumble', { pan: -0.5, size: 0.8 });
  ev(at('6-03', 0.4), 'tear', { dur: 1.0, pan: 0.5 });
  ev(at('6-03', 0.5), 'crackle', { dur: 1.2, pan: 0.5 });
  ev(at('6-04', 0.5), 'boomL', { pan: -0.5 });
  for (const row of ['6-01', '6-02', '6-03', '6-04']) ev(end(row, -0.35), 'press', { pan: row === '6-02' || row === '6-04' ? -0.5 : 0.5, gain: 0.9, size: 0.9 });

  // ================================================================ seq 7: AUTO
  for (const id of Object.keys(AUTO)) {
    const a = AUTO[id];
    ev(a.cover, 'cover', { pan: panOf(id) * 0.5, gain: id === 'anthropic' ? 1 : 0.6, who: id });
    ev(a.press, 'relay', { pan: panOf(id) * 0.5, size: id === 'anthropic' ? 0.8 : 0.55 + 0.2 * rnd(), who: id });
    ev(a.strings, 'string', { pan: panOf(id) * 0.5, gain: id === 'anthropic' ? 1 : 0.55, who: id });
  }
  ev(at('7-01', 1.0), 'creakS', { pan: 0.3, who: 'anthropic' });
  for (const th of puppetThrows()) {
    ev(th.t, 'throw', { pan: panOf(th.who) * 0.7, gain: 0.4, who: th.who });
    ev(th.t + th.flight, 'slap', { pan: panOf(th.who) * 0.3, gain: 0.45, size: 0.35, who: th.who });
  }
  LIGHT_TIMES.forEach((k, i) => ev(at('7-09', k), 'lighter', { pan: panOf(LIGHT_ORDER[i]) * 0.6, gain: 0.7, who: LIGHT_ORDER[i] }));
  const party = ROW['7-10'];
  for (const [c, pan, size] of [[1, 0, 0.9], [3, -0.3, 0.6], [6, 0.3, 0.6], [8, 0, 0.8]]) ev(party.cuts[c].t0 + 0.05, 'clink', { pan, size });
  ev(party.cuts[2].t0 + 0.1, 'puff', { pan: -0.4 });
  ev(party.cuts[7].t0 + 0.05, 'puff', { pan: 0.4 });

  // ================================================================ seq 8: the lids burst
  ev(CUES.burst, 'lidBurst', { gain: 1, pan: 0.2, who: 'US' });
  ev(CUES.burst + 0.03, 'lidBurst', { gain: 0.9, pan: -0.2, who: 'CN' });
  ev(CUES.freeze + 0.1, 'ash', { gain: 0.5 });
  ev(CUES.rise + 0.1, 'lidCreak', { dur: 1.6, pan: -0.4 });
  ev(CUES.rise + 0.15, 'lidCreak', { dur: 1.5, pan: 0.4 });
  ev(CUES.rise + 0.4, 'jokerHum', { dur: CUES.launch - CUES.rise, pan: 0, gain: 0.8, pitch: 2 });
  ev(CUES.lookup + 0.2, 'cigarDrop', { gain: 0.6 });
  ev(at('8-05', 0.0), 'buzz', { dur: 0.35 });
  ev(at('8-05', 0.2), 'alarm', { pan: 0 });
  cancelJabs().forEach((tc, i) => ev(tc, 'click', { pan: 0.2, gain: 0.8 + 0.015 * i, who: 'anthropic' }));
  ev(CUES.seals - 0.3, 'sealSwing', { pan: -0.5 }); ev(CUES.seals - 0.25, 'sealSwing', { pan: 0.5 });
  ev(CUES.seals + 0.4, 'strain', { dur: 1.6, pan: -0.4, size: 0.8 });
  ev(CUES.seals + 0.45, 'strain', { dur: 1.5, pan: 0.4, size: 0.8 });
  ev(CUES.seals + 0.2, 'storm', { dur: CUES.launch - CUES.seals - 0.2, size: 0.6, gain: 0.8 });

  // ================================================================ seq 9: 王炸
  ev(CUES.launch, 'storm', { dur: CUES.pair - CUES.launch, size: 0.97, gain: 1 });
  ev(CUES.launch + 0.05, 'whoosh', { size: 1, pan: -0.7 }); ev(at('9-02', 0.05), 'whoosh', { size: 1, pan: 0.7 });
  ev(PAIR_LAND - 0.25, 'tick', { gain: 0.45, size: 0.25, pan: -0.15 });     // 嗒
  ev(PAIR_LAND, 'tick', { gain: 0.45, size: 0.25, pan: 0.15 });             // 嗒
  ev(CUES.bomb, 'kingbomb', { gain: 1 });
  ev(CUES.wave, 'wave', { dur: 2.6, gain: 1 });

  // ================================================================ seq 10-11: the new king deals; the threads let go; the choice
  ev(at('10-01', 0.1), 'tornado', { dur: 4.2, size: 1 });
  ev(CUES.free + 0.05, 'stringsDrop', { dur: 1.2, gain: 0.8 });
  ev(LAST.pick, 'paper', { dur: 0.2, gain: 0.5 });
  ev(LAST.slam + 0.1, 'slap', { gain: 1, size: 1, pan: -0.3, who: 'deepseek' });
  ev(LAST.slam + 0.1, 'slap', { gain: 1, size: 1, pan: 0.3, who: 'openai' });

  // ================================================================ the scoreboard: every flap that turns, binned
  if (SET.boardFlipEvents) {
    const flips = SET.boardFlipEvents(boardRows(), 0, CUES.credits);
    const bin = 0.08, bins = new Map();
    for (const f of flips) { const b = Math.floor(f.t / bin); bins.set(b, (bins.get(b) ?? 0) + 1); }
    for (const [b, n] of bins) ev(b * bin, 'flaps', { dur: bin, gain: Math.min(1, 0.18 + n / 24), size: Math.min(1, n / 40) });
  }
  CACHE = E.filter((e) => e.t >= 0 && e.t < CUES.credits).sort((a, b) => a.t - b.t);
  return CACHE;
}
