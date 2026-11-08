// JOKERS WILD — every sound the PICTURE makes, as one deterministic list (owned by the director).
// The sound department renders each event with its kind's synth; music locks to CUES and to these.
//
//   soundEvents() -> [{ t, kind, gain, pan, pitch, dur, size, who }]
//     t     film seconds          gain  0..1 (1 = the kind's normal level)
//     pan   -1 (CN side, left) .. +1 (US side, right), as heard from the camera of that moment
//     pitch semitone offset       dur   seconds (for kinds that last)
//     size  0..1 (body / weight)  who   optional king id or prop name (for variety; seeds)
//
// Kinds: see docs/SOUND.md (the sound department's list). Everything here is derived from the same plans the director
// draws from (dir/throws.js, dir/board.js, plan.js, the sequence modules' exported times), so picture and sound can't drift.
import { ROW, CUES, DURATION } from './shots.js';
import { KING, KINGS } from './layout.js';
import { mulberry32 } from './util.js';
import { AUTO, puppetThrows, cancelJabs, LIGHT_ORDER, LIGHT_TIMES } from './plan.js';
import { allThrows, LADDER, DOUBLE, O1, R1, LLAMA, BOMB, GUN } from './dir/throws.js';
import { boardRows, BUSY } from './dir/board.js';
import { boardFlipEvents } from './set.js';
import { PAIR_LAND } from './dir/s9.js';
import { flatTime, FLAT_ORDER, SHIM } from './dir/s10.js';

const at = (id, k = 0) => ROW[id].t0 + k;
const end = (id, k = 0) => ROW[id].t1 + k;
const FPS = 24;

let CACHE = null;
export function soundEvents() {
  if (CACHE) return CACHE;
  const E = [];
  const ev = (t, kind, o = {}) => E.push({ t, kind, gain: 1, pan: 0, pitch: 0, dur: 0, size: 0.5, ...o });
  const rnd = mulberry32(1701);
  const panOf = (id) => (KING[id].side === 'CN' ? -0.6 : 0.6);

  // ================================================================ the AI clock: card ticks on the frame grid
  // eighths -> sixteenths -> thirty-seconds as things speed up; never a buzz; through the black to the hard cut
  ev(0.5, 'tick', { gain: 1.0, size: 0.5 });                                     // 1-01: the first sound of the film
  const tickStep = (t) => {
    if (t < at('1-02')) return 0;
    if (t < at('2-01')) return 6;
    if (t < at('2-18')) return 4;
    if (t < at('2-23')) return 3;
    if (t < at('3-01')) return 6;
    if (t < at('4-01')) return 6;
    if (t < at('4-11')) return 4;
    if (t < CUES.stop) return 2;
    if (t < at('5-02')) return 0;                                                // 4-13 .. 5-01: only the heart
    if (t < CUES.levers) return t < at('5-03') ? 12 : 8;                        // the cards printing themselves, slowly denser
    if (t < CUES.rush) return 4;                                                 // doubled at the levers
    if (t < at('6-08')) return t < at('6-04') ? 2 : 1;                          // sixteenths, then thirty-seconds
    if (t < CUES.cigars) return 3;
    if (t < CUES.crack) return 2;
    if (t < CUES.launch) return 3;
    if (t < CUES.pair) return 2;
    if (t < CUES.wave) return 0;                                                 // 9-08 .. 9-11: silence and the heart
    if (t < CUES.credits) return 3;
    return 0;
  };
  const tickGain = (t) => (t < at('2-01') ? 0.28 : t < CUES.crack ? 0.33 : t < CUES.wave ? 0.22 : 0.26);
  for (let f = Math.ceil(at('1-02') * FPS); f < CUES.credits * FPS; f++) {
    const t = f / FPS, st = tickStep(t);
    if (st && f % st === 0) ev(t, 'tick', { gain: tickGain(t) * (st === 1 ? 0.6 : 1), pan: (rnd() - 0.5) * 0.6, size: 0.2 + 0.2 * rnd() });
  }

  // ================================================================ the human layer: the heartbeat (54 bpm, never faster)
  const beat = 60 / 54;
  const hearts = (t0, t1, o = {}) => { for (let t = t0; t < t1; t += beat) ev(t, 'heart', { gain: 1, ...o }); };
  hearts(at('3-04', 0.3), end('3-04'));
  hearts(CUES.stop + 0.05, end('5-06'));
  // 6-08: the heart skips a beat as he is pulled in
  { const t0 = at('6-08', 0.2); ev(t0, 'heart'); ev(t0 + beat, 'heart'); ev(t0 + beat * 2.5, 'heart', { gain: 0.8 }); }
  ev(at('9-10', 0.3), 'heart', { gain: 1 }); ev(at('9-10', 0.3) + beat * 0.95, 'heart', { gain: 0.9 });
  hearts(at('10-05', 0.15), end('10-05'));
  // 11-05: the last heartbeats are pulled onto the tick grid (3 frames) until they ARE ticks
  { let t = at('11-05', 0.4); for (let i = 0; i < 5; i++) { const g = Math.round(t * FPS / 3) * 3 / FPS; const q = i / 4; ev(t + (g - t) * q, q < 0.9 ? 'heart' : 'tick', { gain: 1 - 0.5 * q, size: 0.5 }); t += beat; } }

  // ================================================================ seq 1: the lamp, the first card, heads turning
  ev(at('1-02', 0.04), 'switch', { gain: 1 });
  for (const th of allThrows()) {
    if (th.puppet) continue;
    const s = th.scale ?? 1;
    if (!th.gun) ev(th.t, 'throw', { pan: panOf(th.who) * 0.7, gain: 0.35 + 0.15 * Math.min(1, s / 3), size: Math.min(1, s / 4.6), who: th.who });
    // every card landing on the pile is a war drum; its size and speed make the hit
    if (th.gun) ev(th.land, 'slap', { pan: panOf(th.who) * 0.3, gain: 0.35, size: 0.3, who: th.who });
    else ev(th.land, th.cell != null && s < 0.9 ? 'snap' : 'slam', { pan: panOf(th.who) * 0.3, gain: Math.min(1, 0.55 + 0.1 * s), size: Math.min(1, 0.2 + s / 5), who: th.who });
  }
  for (const [t0, g] of [[2.6, 0.7], [4.5, 0.55], [6.4, 0.4], [8.3, 0.3], [at('2-09', 1.2), 0.6], [DOUBLE.t + 1.0, 0.7], [at('11-01', 0.9), 0.9], [at('11-01', 2.8), 0.7]]) ev(t0, 'creakL', { dur: 0.9, gain: g });
  ev(at('1-03', 8.2), 'creakT', { gain: 0.6 });
  // 1-05: the heads turn on twos, head end first: stone grinding
  KINGS.forEach((k) => ev(at('1-05') + ((k.seat * 1.25) + 0.1) / 5.2 * 1.56, 'stone', { pan: panOf(k.id) * 0.8, gain: 0.55, who: k.id }));
  ev(at('1-05', 0.6), 'pulse', { dur: at('1-07') - at('1-05', 0.6), pan: 0.4, gain: 0.7 });
  ev(end('1-07', -0.12), 'tick', { gain: 0.9, size: 0.5 });

  // ================================================================ seq 2
  ev(at('2-03', 0.35), 'chips', { size: 0.4, pan: 0.3 });
  ev(at('2-03', 0.85), 'press', { pan: 0.3 });
  for (let i = 0; i < 24; i++) ev(at('2-18', 0.05 + i * 0.035), 'pop', { pan: (i % 2 ? 0.5 : -0.5) * (0.4 + 0.6 * rnd()), gain: 0.5 + 0.3 * rnd() });
  ev(at('2-19', 0.9), 'jam', { dur: DOUBLE.t + DOUBLE.flight + 0.25 - at('2-19', 0.9), gain: 0.8 });
  { const t0 = DOUBLE.t + DOUBLE.flight + 0.05; for (let i = 0; i < 30; i++) ev(t0 + (i / 30) * 1.5, 'topple', { pan: (i % 2 ? 0.55 : -0.55), gain: 0.45 + 0.2 * rnd(), size: 0.3 }); }
  ev(at('2-24', 0.2) + 0.38, 'tick', { gain: 0.6, size: 0.3 });                 // Mistral's card bounces off the pile
  ev(at('2-24', 0.2) + 1.3, 'slap', { gain: 0.3, size: 0.15, pan: 0.4 });
  ev(at('2-25', 0.05), 'creakT', { gain: 0.9 });
  ev(at('2-26', 0.2), 'fold', { size: 0.6, pan: -0.3 }); ev(at('2-26', 0.7), 'fold', { size: 0.5, pan: -0.3 });
  ev(at('2-26', 1.4), 'thud', { gain: 1, pan: -0.4 });

  // ================================================================ seq 3
  ev(at('3-01'), 'chipflow', { dur: at('3-03') - at('3-01'), size: 0.6, pan: 0.5 });
  ev(at('3-03', 0.1), 'chipflow', { dur: at('4-01') - at('3-03', 0.1), size: 0.35, pan: 0.6, gain: 0.6 });
  ev(at('3-02'), 'chains', { dur: 3.0, size: 0.8, pan: 0.4 });
  ev(at('3-03', 0.08), 'seal', { gain: 1, pan: 0.2, who: 'US' });
  ev(at('3-03', 0.1), 'crunch', { gain: 0.9, pan: 0.2 });
  ev(at('3-04', 0.9), 'chips', { size: 0.12, pan: -0.5, gain: 0.5 });
  ev(at('3-05', 0.1), 'chips', { size: 1, dur: 0.8, pan: 0.6 });
  ev(at('3-05', 0.9), 'groan', { dur: 1.1, pan: 0.6 });
  ev(O1.out + 0.05, 'press', { pan: 0.6, size: 1 });
  ev(O1.land, 'slam', { gain: 1, size: 1, pan: 0.2, who: 'openai' });
  ev(at('3-06', 0.35), 'chips', { size: 0.1, pan: -0.6, gain: 0.5 });
  ev(at('3-06', 0.6), 'press', { pan: -0.6, size: 0.15, gain: 0.5 });
  ev(R1.t + R1.flight + 0.05, 'collapse', { gain: 1, pan: 0 });
  ev(at('3-08', 0.3), 'avalanche', { dur: 2.6, size: 1, pan: 0.6 });
  ev(at('3-08', 1.95), 'blink', { pan: 0.7, gain: 0.6 });
  ev(BUSY.t, 'hang', { pan: 0, gain: 0.8 });
  ev(at('3-10', 0.05), 'chains', { dur: 0.8, size: 0.6, pan: 0.3 });
  ev(at('3-10', 0.5), 'gate', { pan: 0.1 }); ev(at('3-10', 1.0), 'gate', { pan: 0.1, gain: 0.8 }); ev(at('3-10', 1.3), 'gate', { pan: 0.1, gain: 0.6 });
  ev(at('3-10', 1.45), 'cart', { dur: at('3-11', 0.2) - at('3-10', 1.45), pan: 0, size: 0.7 });
  ev(at('3-11', 0.05), 'seal', { gain: 1, pan: -0.3, who: 'CN' });
  ev(at('3-11', 0.2), 'cart', { dur: 1.2, pan: 0.2, size: 0.7, pitch: -2 });
  ev(at('3-12', 0.2), 'kiln', { dur: at('4-01') - at('3-12', 0.2), pan: -0.6 });
  for (let i = 0; i < 9; i++) ev(at('3-12', 0.65 + i * 0.2), 'brick', { pan: -0.7, gain: 0.5 + 0.1 * rnd() });

  // ================================================================ seq 4
  ev(at('4-01'), 'reel', { dur: 0.75, pan: 0.5 });
  ev(at('4-01', 1.3), 'zip', { pan: 0.6 });
  ev(at('4-01', 1.3), 'reel', { dur: 0.6, pan: 0.6, gain: 1.2 });
  ev(LLAMA.wipe[0], 'brush', { dur: LLAMA.wipe[1] - LLAMA.wipe[0], gain: 0.9 });
  for (let i = 0; i < 6; i++) ev(at('4-03', 0.15 + i * 0.25), 'flaps', { dur: 0.2, gain: 0.5, pan: -0.5 });
  ev(BOMB.blast, 'bomb', { gain: 1, pan: -0.2 });
  for (let i = 0; i < 14; i++) ev(BOMB.blast + 0.35 + rnd() * 0.6, 'slap', { gain: 0.25 + 0.2 * rnd(), size: 0.3, pan: (rnd() - 0.5) * 1.6 });
  for (const [who, , t0] of [['anthropic', 0, at('4-05', 0.15)], ['deepseek', 0, at('4-06', 0.08)], ['xai', 0, at('4-07', 0.1)], ['openai', 0, at('4-08', 0.06)], ['doubao', 0, at('4-09', 0.05)], ['glm', 0, at('4-10', 0.02)]]) ev(t0, 'point', { pan: panOf(who) * 0.6, who });
  ev(at('4-09', 0.05), 'paper', { dur: 0.3, gain: 0.6, pan: -0.5 });
  ev(at('4-11', 0.3), 'books', { dur: 2.2, pan: 0.5 });

  // ================================================================ seq 5
  ev(at('5-01', 0.05), 'lever', { pan: -0.2 });
  ev(at('5-01', 0.5), 'press', { pan: -0.2, gain: 0.7 });
  ev(at('5-01', 0.95), 'paper', { dur: 0.25, gain: 0.5 });
  for (let t = at('5-02', 0.9) + 0.55; t < end('5-02'); t += 1 / 0.9) ev(t, 'press', { pan: -0.3, gain: 0.45, size: 0.4 });
  for (let k = 0; k < 9; k++) ev(at('5-02', 1.0) + k * 0.42, 'tick', { gain: 0.35, size: 0.15 });
  ev(at('5-06', 0.3), 'lever', { pan: -0.6 }); ev(at('5-06', 0.3), 'lever', { pan: 0.6 });
  ev(at('5-06', 0.55), 'press', { pan: -0.6, gain: 0.8 }); ev(at('5-06', 0.56), 'press', { pan: 0.6, gain: 0.8 });

  // ================================================================ seq 6
  ev(at('6-04', 0.55), 'clank', { pan: 0.5, size: 0.8 });
  ev(at('6-05', 0.55), 'crumble', { pan: -0.5, size: 0.8 });
  ev(at('6-06', 0.3), 'crackle', { dur: 0.7, pan: 0.5 });
  ev(at('6-07', 0.45), 'boomL', { pan: -0.5 });
  ev(at('6-08', 0.1), 'paper', { dur: 1.4, gain: 0.7, pan: -0.4 });
  ev(at('6-08', 1.45), 'press', { pan: -0.4, gain: 0.8 });
  // the approvals: every stamp of every king, faster and faster, until they smear (6-09); they stop at 6-10
  {
    const t0 = at('6-09'), t1 = end('6-09');
    KINGS.forEach((k, i) => {
      let last = -1;
      for (let t = t0; t < t1; t += 1 / 96) {
        const rate = 2.2 + 9 * Math.min(1, Math.max(0, (t - t0) / (t1 - 0.3 - t0))) ** 2;
        const ph = Math.floor((t - t0) * rate + i * 0.37);
        if (ph !== last && last >= 0 && !(k.id === 'anthropic' && t > t1 - 0.25)) ev(t, 'stamp', { pan: panOf(k.id) * 0.5, gain: 0.45, who: k.id });
        last = ph;
      }
    });
  }

  // ================================================================ seq 7-8 (the reel, as approved)
  for (const id of Object.keys(AUTO)) {
    const a = AUTO[id];
    ev(a.cover, 'cover', { pan: panOf(id) * 0.5, gain: id === 'anthropic' ? 1 : 0.6, who: id });
    ev(a.press, 'relay', { pan: panOf(id) * 0.5, size: id === 'anthropic' ? 0.8 : 0.55 + 0.2 * rnd(), who: id });
    ev(a.strings, 'string', { pan: panOf(id) * 0.5, gain: id === 'anthropic' ? 1 : 0.55, who: id });
  }
  ev(at('7-01', 1.0), 'creakS', { pan: 0.3, who: 'anthropic' });
  ev(at('7-06', 0.2), 'flaps', { dur: 0.25, pan: 0.4, gain: 0.5, who: 'xai' });
  for (const th of puppetThrows()) {
    ev(th.t, 'throw', { pan: panOf(th.who) * 0.7, gain: 0.45, who: th.who });
    ev(th.t + th.flight, 'slap', { pan: panOf(th.who) * 0.3, gain: 0.5, size: 0.35, who: th.who });
  }
  LIGHT_TIMES.forEach((k, i) => ev(at('7-09', k), 'lighter', { pan: panOf(LIGHT_ORDER[i]) * 0.6, gain: 0.7, who: LIGHT_ORDER[i] }));
  const party = ROW['7-10'];
  ev(party.cuts[1].t0 + 0.05, 'clink', { pan: 0, size: 0.8 });
  ev(party.cuts[4].t0 + 0.04, 'clink', { pan: -0.3, size: 0.6 });
  ev(party.cuts[7].t0 + 0.03, 'clink', { pan: 0.3, size: 0.6 });
  ev(party.cuts[11].t0 + 0.02, 'clink', { pan: 0, size: 0.9 });
  ev(party.cuts[2].t0 + 0.1, 'puff', { pan: -0.4 });
  ev(party.cuts[9].t0 + 0.05, 'puff', { pan: 0.4 });
  for (let i = 0; i < 16; i += 3) ev(party.cuts[i].t0 + 0.08, 'whoosh', { size: 0.25, gain: 0.35, pan: (i % 2 ? 0.6 : -0.6) });
  ev(CUES.crack, 'crackG', { size: 1, gain: 1, pan: -0.2 });
  ev(at('8-01', 0.22), 'ash', { gain: 0.5 });
  ev(at('8-03', 0.1), 'crackG', { size: 0.15, dur: 1.6, pan: -0.5 });
  ev(at('8-04', 0.05), 'crackG', { size: 0.2, dur: 1.3, pan: 0.5 });
  ev(at('8-05', 0.0), 'buzz', { dur: 0.35 });
  ev(at('8-05', 0.25), 'alarm', { pan: 0 });
  cancelJabs().forEach((tc, i) => ev(tc, 'click', { pan: 0.2, gain: 0.8 + 0.015 * i, who: 'anthropic' }));
  ev(at('8-07', 0.0), 'chains', { dur: 0.55, pan: -0.5, size: 0.9 });
  ev(at('8-07', 0.05), 'chains', { dur: 0.5, pan: 0.5, size: 0.9 });
  ev(at('8-07', 0.6), 'strain', { dur: 1.4, pan: -0.4, size: 0.8 });
  ev(at('8-07', 0.66), 'strain', { dur: 1.3, pan: 0.4, size: 0.8 });
  ev(at('8-07', 0.3), 'storm', { dur: ROW['8-08'].t1 - at('8-07', 0.3), size: 0.6, gain: 0.8 });
  ev(at('8-08', 0.2), 'whoosh', { size: 0.9, pan: -0.5 });
  ev(at('8-08', 0.3), 'whoosh', { size: 0.9, pan: 0.5 });

  // ================================================================ seq 9: 王炸
  ev(CUES.launch, 'storm', { dur: CUES.pair - CUES.launch, size: 0.97, gain: 1 });
  ev(CUES.launch + 0.05, 'whoosh', { size: 1, pan: -0.7 }); ev(CUES.launch + 0.08, 'whoosh', { size: 1, pan: 0.7 });
  ev(at('9-07', 0.02), 'whoosh', { size: 1, pan: 0 });
  ev(PAIR_LAND - 0.25, 'tick', { gain: 0.45, size: 0.25, pan: -0.15 });     // 嗒
  ev(PAIR_LAND, 'tick', { gain: 0.45, size: 0.25, pan: 0.15 });             // 嗒
  ev(CUES.bomb2, 'kingbomb', { gain: 1 });
  ev(CUES.wave, 'wave', { dur: 2.6, gain: 1 });

  // ================================================================ seq 10-11: the new king
  ev(at('10-01', 0.1), 'tornado', { dur: 4.2, size: 1 });
  for (const k of KINGS) ev(flatTime(k.id), 'flatten', { pan: panOf(k.id) * 0.7, size: k.id === 'openai' || k.id === 'deepseek' ? 1 : 0.7, who: k.id });
  ev(at('11-01', 0.12), 'tilt', { gain: 1, pan: -0.4 });
  ev(SHIM.fold[0] + 0.15, 'fold', { size: 1, pan: -0.2 }); ev(SHIM.fold[0] + 0.5, 'fold', { size: 0.8, pan: -0.2 });
  ev(SHIM.pick1, 'paper', { dur: 0.3, pan: 0.6, gain: 0.6 }); ev(SHIM.pick2, 'paper', { dur: 0.3, pan: -0.6, gain: 0.6 });
  ev(SHIM.under, 'thud', { gain: 1, pan: -0.4 });
  ev(at('11-04', 0.2), 'flick', { gain: 0.9, pan: -0.3 });

  // ================================================================ the scoreboard: every flap that turns, binned
  {
    const flips = boardFlipEvents(boardRows(), 0, CUES.credits);
    const bin = 0.08, bins = new Map();
    for (const f of flips) { const b = Math.floor(f.t / bin); bins.set(b, (bins.get(b) ?? 0) + 1); }
    for (const [b, n] of bins) ev(b * bin, 'flaps', { dur: bin, gain: Math.min(1, 0.18 + n / 24), size: Math.min(1, n / 40) });
  }
  CACHE = E.filter((e) => e.t >= 0 && e.t < DURATION).sort((a, b) => a.t - b.t);
  return CACHE;
}
void FLAT_ORDER; void LADDER; void GUN;
