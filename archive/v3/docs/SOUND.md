# JOKERS WILD — sound (v3 test reel 「批准 / APPROVED」)

Everything you hear is synthesized in plain JavaScript at play time: no samples, no audio files, no Web Audio nodes.
`renderScore(sampleRate, opts) -> { L, R, report?, stems? }` (`src/audio.js`) is a pure, deterministic function
(seeded noise only, no `Math.random`, no clock; two renders are bit-identical), covers the whole reel (`DURATION`,
56.7 s) and runs in Node and the browser (~7 s at 48 kHz in Node). `renderScoreAsync(sampleRate, opts, onProgress)`
renders the same samples without blocking the page (bit-identical; longest single step ~135 ms).

**State (2026-11-07)**: the reel is scored, R1 .. R6, against the director's real events (629 from `soundEvents()`)
plus the score's own ambience. The v2 score (M1 .. M12) is archived in `archive/v2/`; its engine, instruments and v1/v2
event synths are kept. Every time hangs off `CUES` / `ROW` / `SHOT` or the events, so a moved shot or stamp moves its
sound. When `soundEvents()` is empty the reel runs on `testEvents()` (a stand-in list from the shot table).

```
node tools/render-audio.mjs [--test] [--twice] [--async] [--cues] [--stems] [--no-spec] [--kinds]
  out/score.wav           the reel (48 kHz 16-bit stereo, TPDF dither; exact zeros stay zero)
  out/score-spec.png      ffmpeg showspectrumpic
  out/levels.txt          the report (everything printed)
  --test                  on testEvents() instead: out/score-test.wav, score-test-spec.png, levels-test.txt
  --twice / --async       render again / with renderScoreAsync and compare bit for bit
  --cues                  every musical decision with its time
  --stems                 out/stem-{music,sfx,amb}.wav (pre-glue/limiter, same make-up gain)
  --kinds                 out/kinds.wav + kinds.txt: every v3 event kind once, solo, at its mix level
```

The report: every shot against its planned loudness (shots.txt column 9), the gates (exact zero), the two vacuums
(silence, fall, hit), the flash, LUFS at every CUE, the limiter's worst moments, a click scan, band energies per
sequence, an ffmpeg ebur128 cross-check.

## Files

| file | what |
|---|---|
| `src/audio.js` | `renderScore` / `renderScoreAsync`, the chunks (one per cue), the four groups and their rooms, the vacuums, the drain, the cut, the hum, the gates (`gates()`), the walls (`wallDrives()`), the master |
| `src/audio-music.js` | the score: `SCORE.R1 .. R6`, the kit (brass, strings, drums, music box, organ, choir, drones, Shepard, the machine's click) |
| `src/audio-sfx.js` | `prepareEvents` (pans, the bed, cloth hits, gaps, vacuums, thinning), `scoreEvents` (the score's ambience), `testEvents` (stand-in list), `MIX` (gain, send, group per kind), `SCENE`, `HUSH`, `chokes`, `levels()` (automation), event rendering; the hum |
| `src/audio-kinds.js` | one synth per v3 event kind (below) |
| `src/audio-voices.js` | the v3 instruments: `musicBox`, `organNotes` (wavetable ranks), `choirVowel` (formants), `drone` (the jokers), `shepardInto`, `flapClick` |
| `src/audio-inst.js`, `src/audio-sfxlib.js` | v2: brass, bowed strings, war drum, timpani, crash, cymbal swell, boom; the v1/v2 event synths (still playable: `oldClock`, `giantBreath`, `press`, ...) |
| `src/audio-dsp.js`, `src/audio-master.js` | filters, noise, windowed buses, WAV; FDN rooms, glue, true-peak limiter, carve, BS.1770 meters |

**Chunks** (one per cue): R1 0 → 2-01 | R2 → 3-01 | R3 → 4-01 (**cut dead** at 4-01: music, effects, rooms) | R4 → 5-01 |
R5 → 6-01 | R6 → the end. Each chunk has four groups: **music** (war room, RT60 2.4 s), **effects** (RT60 1.3 s),
**big** (the ant's-eye impacts and the AI's light, RT60 3.2 s) and **solo** (big room, never carved: the vacuum's
falling stamp and the paper dive, the flock and the paper people in the hole). Event seeds are a hash of the event
itself, so adding events anywhere never changes another event's sound.

## The idea in sound: three musics, three owners

| owner | voice | arc |
|---|---|---|
| **the paper people** | one small music box (the only tuned struck instrument; only theirs) | their motif, four notes **A5 F#6 E6 B5** (sol mi re la in D): a call and an echo across the sea, left open. On the hand-hold it gets its fifth note **D6** and the reel's only warm chord (D major, the third in it). At the end the box runs down (later, flatter) and its fifth note is played by the card king's organ: the same D, the third gone. |
| **the kings** | low brass (the v2 motif: three notes rising by semitones), war drums, timpani, low strings | creeps in on the clock (A B-flat B); the first stamp lands on C, OpenAI answers on C#; in the race every DeepSeek stamp IS a note of the motif, a semitone higher each bar; 100 % lands on C an octave above the first stamp; then the kings' music is cut dead and never returns. |
| **the AI** | the jokers' drones, a Shepard riser, choir, a cold pipe organ (octaves and fifths only, never a third) | the riser under the race (the rise that never arrives); two drones a semitone apart (A, B-flat) fighting; 王炸 = **D A E** in open fifths; then only the organ, on D. |

## The score, cue by cue (times from the director's events, 2026-11-07)

| cue | music |
|---|---|
| **R1** 0:00-0:07.6 小人 | 1-01: the room hum from nothing, the old clock far off (tick ... tock, once a second; the score's own). 1-02: the music box, tiny: A5 F#6 as the red paper person waves (2.45), E6 B5 softer and farther (more room, panned right) as the blue one waves back (3.45). 1-03: the shadow: a low swell (basses and cellos on A and B-flat, a sub, the tuba, pp -> mp); the giant's breath from above, the stamp handle's creak. |
| **R2** 0:07.6-0:15.3 批准 | 2-01: the press's clack and the card coming like a wall (from the ant); the swell holds as a pedal. 2-02/2-03: the kings' motif on the clock's ticks while DeepSeek reads: A (9.45), B-flat (10.45), B (11.45, held, growing), a thin high tremolo. **The vacuum** 12.33-12.75: music, rooms, effects and the hum are carved away; the first half is true silence (-53 LUFS), then only the stamp's fall rushes in. **12.75 the first stamp**: the pile-driver (sub thump, wood boom, the rubber's smack, the crack, the ground shaking, a rattle of paper, a faint ringing in the ear) and the kings on C (C + C#, trumpets, two war drums, timpani, crash, sub): the biggest sound so far (-9 LUFS-M, 44 LU over the silence). 14.45: OpenAI answers on C#, quicker and drier. |
| **R3** 0:15.3-0:24.1 更快 | The race. The beat is DeepSeek's stamps (30 of them, 0.68 s apart at first, 0.17 s at the end): each one a stab of the kings' brass, the motif a semitone higher every bar of three (D Eb E, Eb E F, ... 10 bars, up to B); every OpenAI stamp (32) bites back a horn and a trombone a semitone above, with a snare. Between the beats the machine subdivides (a low spiccato and a hard latch click, 4 -> 1 per beat); a contrabass pedal re-bowed a semitone higher every bar; a Shepard riser accelerating (0.12 -> 0.6 octaves/s). The eight lesser kings' stamps (165) are the pile-driver BED under it (3-04 on). 3-05: a crash on the montage, every cut on a beat. 3-06: every beat a pile-driver tutti over a sustained tremolo cluster. **3-07 the vacuum** 22.26-22.62 (silence, the red paper person's dive alone, the fall), then the near miss with everything (on C). 3-08: the board flips; **100 %** (23.81, the last flip landing on a DeepSeek stamp): one huge downbeat on C with its C#, held until **cut dead** on the cut to 4-01. |
| **R4** 0:24.1-0:34.5 不用盖了 | 4-01: hollow. The kings' music is gone; the presses tick on by themselves at the race's last tempo (every 0.16 s, dry, small); the cards slide out with the press's clack and fly off by themselves; the stamps come down on bare cloth: a dead "pomf" with one hollow note sagging flat (no crack, no paper, no boom); a glassy A5/E6 hangs over the emptiness. 4-02: the cards flying off past DeepSeek, close (the flock, thin). **4-03: drained at once** (music carved, every effect choked, the rooms emptied): only the flock of cards overhead, far, like birds (-42 LUFS). 4-04/05: tiny paper steps, the paper person getting up. 4-06 (light, -30 LUFS: it rises ~10 LU out of the hole): the music box comes back as they meet (A5 F#6 E6 B5, 0.4 s apart, ending 0.4 s before the touch), intimate but present, and on the hand-hold (33.52, the picture's `handTouch`) the fifth note D6, louder, with the box's bass tines (D4 A4 F#5) and soft strings (D3 A3 F#4, cellos D2): D major, the only warm chord in the reel; it fades as the jokers rise. |
| **R5** 0:34.5-0:42.9 王炸 | 5-01: the jokers' drones rise with them (CN on A1 from 34.5, US on B-flat1 from 34.65; rich, rough partials: they beat and fight), the jokers' glassy glow, the flock pulled under. 5-02: louder; a low string cluster A B-flat B (the kings afraid). 5-03 the charge: both drones glide up four semitones (still a semitone apart), the Shepard riser racing (0.5 -> 1.9 oct/s), the strings climbing, a war-drum roll quickening, a cymbal swell, the charge's roar converging: **cut into digital silence** (5-04, exact zero). 5-05: the jokers turn (39.1): a breath drawn in (a reverse swell, a sub rising, the choir on "u"); **the flash (39.6, the picture's `pair`)**: one enormous cold chord, D1 D2 A2 D3 A3 E4 A4 in open fifths, no third: organ (full, mixture), tuba, trombones, horns, trumpets, choir ("a" and "o"), strings, two war drums, timpani, two crashes, the pair's boom and gold glints (-8.7 LUFS-M). 5-06: the long tone rises as the gold floods: the choir and violins step up A D E A; the flood's shimmer climbs, the cards flip over in its wake. |
| **R6** 0:42.9-0:56.7 牌 | Only the organ now (the kings' brass never returns): a pedal on D (D1 D2 A2 D3) swelling with the card king's inhale. 6-02/6-03: the "噗" of the kings pressed flat (two, then eight faster and faster); from the third an E-flat creeps in above the pedal (dread), gone when the fan opens; the riffle of the fan. 6-04: the organ alone. 6-05: the golden finger's low cold tone sinking; the music box runs down: the four notes later and flatter every time (0, -7, -16, -28 cents), the organ almost gone. 6-06 (51.9): **the fifth note comes, but the organ plays it**: D3 A3 D4 D5, cold, bright, the third gone; the card slid into the fan (嚓). 6-07: the organ holds under the two 嗒 (53.45, 53.95: the identical crisp slap, twice); **cut dead** into the black (6-08, 2.2 s of exact zero). |

## The director's events, prepared (`prepareEvents`)

- **Pans**: the events carry none. From `who`: CN kings left, US right (the table seen from its foot); the head kings
  (deepseek, openai) at +-0.32, the eight others at +-0.68, the biggest stamp (size >= 0.95) dead centre; `red` -0.25,
  `blue` +0.3 (`far` +0.5); `CN` / `US` +-0.55. An event's own `pan` wins.
- **The bed**: every stamp with gain < 0.95 (the eight lesser kings) becomes a pile-driver BED hit: eight cached
  variants per pov (a crowd of identical machines), no fall, a shorter darker thump, a little rattle; thinned in level
  (sqrt(4 / n) per 0.5 s).
- **Cloth hits**: a head king's `stampMiss` before CUES.unneeded is a stamp on the bare map in the frenzy: rendered as a
  hit with a softer paper crack. From 4-01 on, `stampMiss` is the hollow miss.
- **Gaps**: every head-king stamp knows how long it had to fall (time since the previous head stamp): its fall (the
  pre-roll that starts before `t`) can't reach back past the previous one.
- **Vacuums**: the first big stamp (size >= 0.95) and the `wild` stamp get a full fall and are SOLO, with any
  `paperFall` / `paperStep` in their fall window; everything else (music, effects, rooms, hum) is carved away over the
  fall. The hole's flock and paper people are solo too (they survive the drain at 4-03).
- **Sizes**: the first `cardSlide` (before CUES.read) is the ant's wall (size 1, with the press's clack); the 4-01
  slides get the clack too; `cardFly` before 3-01 is big (0.9), `self` cards 0.7, the race's 0.4.
- **Thinning**: `cardSlide`, `cardFly`, `stampLift` bursts: gain x sqrt(3 / n) per 0.5 s.
- **The score's own ambience** (`scoreEvents`, each family dropped when the director emits that kind): `oldClock`
  (0.45 s, once a second until the first stamp starts to fall), `giantBreath` (1-03, 2-02), `stampCreak` (1-03 + 1.9 s).
  (The synthesized `grunt` of 2-03 is out of the score by the director's decision; the kind still exists.)

## Event kinds (`audio-kinds.js`) and the params they use

Event: `{ t, kind, gain, pan?, who?, size?, dur?, pov?, ... }`, rendered with its kind's synth x `MIX[kind]` x `gain` x
the scene's dB, equal-power pan, a send to its group's room. Unknown kinds are skipped (silent, one console warning,
listed in the report: none today).

| kind | params used | sound |
|---|---|---|
| `stampHit` | `who` (US crisper, CN rounder), `size` (1 = the first, the biggest), `pov` 'ant' / 'high', `wild` (3-07: a vacuum), `gain` (< 0.95 = the bed) | ant: the fall (pre-roll), sub thump to 32 Hz (driven so phones hear it), the table's wooden boom, the rubber's smack, the crack, the ground shaking, a rattle of paper falling back; size >= 0.95 leaves a faint ear ring. high: a heavy desk stamp ("thock", rubber, paper slap) |
| `stampMiss` | `size`, `pov` | the same fall, then a dead "pomf" on cloth and one hollow note sagging flat: no crack, no paper, no boom |
| `stampLift` | `size` | tacky ink letting go (crackles thickening), a soft low "tk" |
| `cardSlide` | `dur`, `size`, `clack` (set by prepareEvents) | the press's clack (iron latch, wooden knock), the linen weave's skid nearer and slowing, a flat soft "pa" |
| `cardFly` | `dur` (0.5), `size`, `pan2` | a whoosh with the card's spinning flutter, loud at once and receding, travelling across |
| `flock` | `dur`, `density`, `rise` | hundreds of cards flapping like birds (wingbeats 7-13 Hz in bursts, drifting), a bed of air; thin until `rise`, full after |
| `paperFall` | `size` | a tiny crisp slap and a crinkle |
| `paperStep` | `size`, optional `dur` + `rate` (a walk) | one tiny paper step |
| `paperRun` | `dur`, `size` (> 0.7: a crowd) | quick light steps (~7.5/s), the paper body flapping |
| `paperWave` | `far` | two or three soft flutters of a paper arm |
| `paperUp` | — | the paper peeling off the linen, a crinkle, a step |
| `handTouch` | `pitch` (semitones from D6) | the music box's fifth note, D6 (the warmth under it is the score's) |
| `jokerRise` | `who` 'CN' / 'US', `dur` | the cards whirling up, a glassy chord on its own note (A / B-flat) blooming like a moon (the drone is the score's) |
| `charge` | `dur` | a roar building, a whine climbing, the sides converging; ends exactly at `dur` |
| `pair` | — | 王炸's flash: the deepest boom (to 26 Hz), the crack of light, the air blast, gold glints tuned to D A E (the chord is the score's) |
| `flood` | `dur` | a rising shimmer of gold glints (D A E, climbing), a rushing front, the cards flipping over in its wake |
| `inhale` | `dur` | the card king's cavernous intake (formants rising), cards sucked in, the pressure swelling; stops full |
| `flatten` | `who` (own variant), `size`, `gain` | 噗: a soft low plosive, the body giving way, a dry crunch, the card's slap |
| `riffle` | `dur`, `n` | a fan of cards spread: edges snapping past, fast in the middle, sweeping left to right |
| `fingerDescend` | `dur` | a low cold tone sinking (A3 -> D3), a faint gold shimmer, air pressing down |
| `cardSnick` | — | a short slide of card on card, a crisp "snick" |
| `cardPlay` | `size` (`cover` is accepted) | 嗒: a crisp flat slap, the pile's dull knock; IDENTICAL every time |
| `boardFlip` | `dur` (`n` accepted) | split-flap chatter, a last clack |
| `grunt` | `who` | 闷哼: a short closed-mouth "hm", pitch falling (not used: dropped from 2-03) |
| `stampCreak` | `dur`, `size` | the wooden handle tightening in a giant's grip (the score's, 1-03) |

## Mix and master

- **Mix**: `MIX` (gain, send, group per kind), `SCENE` (dB per kind per shot: the first stamp +4, the early race +4, the
  dive in the vacuum +10, the board +8 ...), `HUSH` (4-03 .. 4-06: everything but the flock, the paper people and the
  hand-hold -40 dB), `chokes` (4-03: every earlier effect cut in 8 ms, but the flock and the paper), `levels()` (the flock: +15 dB
  close in 4-02, full and far in the hole, -6 dB under the music box at 4-06, pulled under the drones in R5; the
  jokers' glow up as they charge).
- **Carved after the rooms**: the two vacuums (music, effects, big; the solo group keeps the fall and the dive),
  4-03 .. the music box (music), 4-03 on (effects and big), R3 cut dead at 4-01 (all four groups), 5-04 (music).
- **Hum**: 50 Hz room tone from nothing; ducked to zero in the vacuums.
- **Master**: 26 Hz high-pass, mono below 110 Hz, gentle tone EQ; **staging**: 3-06 (the pile-drivers) lands at
  `REF_LUFS` (-10 pre-glue); glue (-13 dB, 1.5:1); the **walls driven** into soft saturation (`wallDrives()`: the first
  stamp to the end of 2-04, 3-04 .. 4-01 around the 3-07 vacuum, the flash to the end of 5-05; 1.6 dB); a streaming
  true-peak limiter; normalized to **-1.2 dBTP**; the **gates** (5-04 and 6-08, exact zero, 1.5 ms ramps).

## Measured (final render, the director's 629 events)

| | |
|---|---|
| integrated / LRA | -14.6 LUFS / 20.0 LU (ffmpeg ebur128: -14.6 / 20.0) |
| sample / true peak | -1.2 dBFS / -1.2 dBTP (ffmpeg agrees) |
| limiter, deepest | -2.3 dB (0:22.7, the near miss); glue 4.2 dB |
| planned loudness | **41 / 41 shots in their class** (walls >= -12 on their own mean, holes <= -40, gates exact zero, 2-4 within 6 LU; 4-06 is class 2 since 2026-11-07) |
| clicks / gates | 0 / both exact zero |
| determinism | two renders bit-identical; `renderScoreAsync` = `renderScore` bit for bit |

Walls (own mean): 2-04 -11.8 · 3-04 -11.0 · 3-05.01..06 -11.8 .. -10.0 (the row -10.9) · 3-06 -9.4 · 3-07 -11.4 ·
3-08 -9.4 · 5-05 -11.4. Holes: 1-01 -53.7 · 1-02 -40.1 · 4-03 -42.1 · 4-04 -41.5 · 4-05 -40.6; then 4-06 (the hand-hold, light) -30.3. The vacuums:
first half -52.9 / -49.1 LUFS, the hits 44 / 40 LU above them. The flash: -8.7 LUFS-M.

## For the director

- The events need no `pan`; if a shot's camera reverses left and right, give those events a `pan` and it wins.
- 3-07's near miss is found by `wild: true`; the first stamp by `size >= 0.95`. The 100 % downbeat is the last
  `boardFlip` in 3-08 + 0.08 s, snapped to a DeepSeek stamp within 0.1 s.
- R3's beat is the head kings' stamps by side (`who` deepseek / openai, or any CN / US king with gain >= 0.95). If they
  move, the music moves; if fewer than 4 CN stamps are found it falls back on an accelerating grid.
- The score emits `oldClock`, `giantBreath`, `stampCreak` itself; emit any of them to own their timing (the
  score's are then dropped). The 2-02/2-03 motif locks to the first three clock ticks either way.
- `cardPlay.cover`, `boardFlip.n`, `paperStep.i`, `flatten.gain` are accepted; only `gain` changes the sound.

## Known limits

- Nobody here can listen: every level is a measurement; pitches were checked by spectral peaks (the motif, the hits,
  the drones, the chord, the organ's fifth).
- The holes (4-03 .. 4-05, -42 .. -41 LUFS) are faint on a phone by design; the hand-hold (4-06, -30) rises out of them.
- The pile-driver bed is thinned hard (165 stamps in ~6 s); the head kings' stamps carry the rhythm on top.
