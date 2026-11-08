# 《失控》 OUT OF CONTROL — sound

> **v3 (榜首), 2026-11-08, temp score.** 2:21.2, R1–R8 on the new CUES. New kinds: blast {dur} (ChatGPT's shockwave:
> boom, rushing air, cards torn away), denied {who} (要不起: a dull falling two-note bonk), errorAlarm {who} (系统异常: a harsh
> two-tone alert), screenEye {who} (a low glassy tritone swell), pressure {dur} (the giant card's growing low air);
> boardFlip is the v3 split-flap. 2-04 a high note held and cut dead at the ChatGPT slap (a B-flat tutti hit, a ringing
> cluster under the blast), 2-08 silence then the warm chord; 3-03 the smash a tutti hit; 6-03 kept quiet; 6-08 one beat
> of silence; 8-06 the end slam in the black; gates 7-01 and 8-07..end exact zero (no music under the credits).
> Measured: -16.3 LUFS, -1.2 dBTP, 59/63 shots in class, no clicks.

> **v2 (托管), 2026-11-07, ANIMATIC temp sound.** The engine now runs the v2 story (2:23.9, R1–R8; chunks, gates and
> rooms in `audio.js`, `SCORE.R1..R8` in `audio-music.js`). New kinds: screenTap, hintDing, autoOn, autoPlay {red},
> cancelPress {hard} (a dead key), screenDeal, crumbRoll, crownRoll {i, dur}, endSlam (the biggest hit, with a vacuum).
> Cues: R1 no music, the crush, a lazy tuba theme · R2 the warm B-flat chord, the low A · R3 the race (hero slaps, the
> giant card's vacuum and tutti, a tutti grid) · R4 a heartbeat, the theme light on the dings · R5 the theme on the
> machine's beat, drones creeping in · R6 drones under the red cards, dead keys, two roars, the wall cut at the stop ·
> R7 zero, the cold organ rising to the eye · R8 three music-box notes, the shadow, the end slam, crowns, then silence.
> Gates: 7-01 and 8-07..end exact zero. Measured: 56/57 shots in class (6-03 +7), -15.8 LUFS, -1.2 dBTP, no clicks.
> The r4 text below describes the r4 score (same kit and craft).

Everything you hear is synthesized in plain JavaScript at play time: no samples, no audio files, no Web Audio nodes.
`renderScore(sampleRate, opts) -> { L, R, report?, stems? }` (`src/audio.js`) is a pure, deterministic function
(seeded noise only, no `Math.random`, no clock; two renders are bit-identical) over the whole film (`DURATION`, 2:51.4),
in Node and the browser (~12 s at 48 kHz in Node). `renderScoreAsync` renders the same samples without blocking the
page (bit-identical; longest single step ~100 ms). Every time hangs off `CUES` / `ROW` or the director's events
(`soundEvents()`, src/sound-events.js); when that list is empty (or the file does not load, in the tool) the film runs
on `testEvents()`, a stand-in built from the shot table. The v3 reel's score is archived in `archive/v3/src/`.

```
node tools/render-audio.mjs [--test] [--twice] [--async] [--cues] [--stems] [--no-spec] [--kinds]
  out/score.wav, score-spec.png, levels.txt   the film (48 kHz 16-bit, TPDF dither; exact zeros stay zero) and the report
  --test        on testEvents() (out/score-test.*)       --twice / --async   render again / async, compare bit for bit
  --cues        every musical decision with its time     --stems             out/stem-{music,sfx,amb}.wav
  --kinds       out/kinds.wav + kinds.txt: every film kind once, solo, at its mix level
```
The report: every shot against its planned loudness (shots.txt column 9), the gates, the two vacuums, LUFS at every
CUE, the limiter's worst moments, a click scan, band energies per sequence, an ffmpeg ebur128 cross-check.

## Files

| file | what |
|---|---|
| `src/audio.js` | `renderScore` / `renderScoreAsync`; the chunks (one per cue R1..R7), their four groups and rooms (per cue: the ant's far hall in R1, the dark above in R6/R7), the vacuums, the cuts, the hum, the gates, the walls, the master |
| `src/audio-music.js` | the score `SCORE.R1 .. R7`; the race theme (`THEME`, `march`), the beat (`beatsFrom`, `gridFrom`), the kit |
| `src/audio-sfx.js` | `MIX` (gain, send, group per kind), `SCENE` (dB per kind per shot), `levels()` (automation), `prepareEvents`, `scoreEvents` (the score's own ambience and the END), `testEvents`, event rendering, the hum |
| `src/audio-kinds.js` | one synth per event kind: `FILM_KINDS` (below), `SCORE_KINDS` (yawn); the v3 reel's `V3_KINDS` kept |
| `src/audio-voices.js` | music box, organ, choir, the AI's drones, Shepard riser, pizzicato (new), the machine's click |
| `src/audio-inst.js`, `src/audio-sfxlib.js`, `src/audio-dsp.js`, `src/audio-master.js` | brass, bowed strings, drums, timpani, cymbals; the v1/v2 synths (storm, chains, creaks...); DSP; rooms, glue, true-peak limiter, meters |

## The idea in sound

**One theme, three bodies.** The kings' race theme is eight beats, a sneaky minor march, D E F D | E C# D A (tonic, then
dominant). **Every beat is a card slapped down: the slaps ARE the beat.** A lazy tuba plays it under the lazy game
(R1); the orchestra races it a semitone higher every bar (R3); the decks play it by themselves, faster, over the AI's
drones (R5); a tiny music box plays it in **major**, cheerful and oblivious, until the box winds down and the slaps
shrink into the ant's steps (R7). Around it: one warm chord (R2, B-flat major, the third in it), almost nothing (R4),
and the AI's cold organ in open fifths, no third (R6). **The third is human**: the AI's music never has one.

## The score, cue by cue (on the director's 719 events, 2026-11-07)

| cue | music |
|---|---|
| **R1** 蚂蚁 0:00-0:20.3 | No music: the ant's steps out of the black (from nothing), the far muffled game through the wood (the score's own tosses in 1-02/1-03), the lamp's hum with the picture. 1-04: **the vacuum** (0.32 s: only the card's air), then the slap from the ant: the table a drum the size of a hall, the crack like a shot, crumbs jumping, an ear ring; the startle. 1-07: the theme in embryo, a lazy tuba (91 bpm, a little behind the beat) over soft pizzicato; it ends on A, held and drooping, a king yawning down the table. |
| **R2** 会说话的牌 -0:38.1 | 2-02: the table falls quiet: a thin high A (and a low A) held while OpenAI raises the card, cut at the slap (a timpani on B-flat under it). 2-04: **the warm chord** swells as the card lights up: B-flat major (strings, horns, a shimmer); the typing's glints ring on its tones; 2-05 a soft choir "o" with the table's "oh". 2-06: under DeepSeek the basses and the tuba slide from B-flat down to A (B-flat over A: sour, falling behind). The low A holds into R3: the dominant of the race. |
| **R3** 比大 -1:12.9 | 3-01: a jab of tuba, trombone and pizzicato on every slap of the scramble, a snare roll into the downbeat. 3-02: the theme on the eight hero slaps (one per cut, 0.85 -> 0.53 s), pizzicato, horns, trombones, trumpets, a semitone higher every bar, carried on through 3-03 and the tower. The skim: the music holds its breath (high tremolo, snare); the crash: cymbal and a tumbling pizzicato run. 3-05: half a beat of silence, a dumbfounded brass chord drooping. 3-06: the giant card raised: rolls and a crescendo rising into the dominant, **the vacuum** (0.36 s), the slam = a tutti downbeat in G minor, and the race again on a steady grid drawn from the finalists' slaps (36 beats, tutti, war drums, crashes, tremolo), climbing to D an octave up; every chair sliding into the dark a falling trombone glissando. 3-09: the two last slams (each finalist's biggest slap), two tutti stabs on D minor and the held note (余音) into 4-01. |
| **R4** 停手 -1:29.9 | The held note dies; a glassy high A and E and a low D at the edge of hearing while the cards tremble and they breathe (4-01..4-03); then only the room (4-04..4-06, the quietest seconds: -45..-51 LUFS). |
| **R5** 谁出的牌 -1:52.1 | 5-02: the two cards float up (two high strings sliding up, a slow swish each) and the AI's drones begin: D on DeepSeek's side against E-flat on OpenAI's, beating. 5-03 / 5-04: each slap a stab on its drone's note. 5-05: two flutter-tongued brass roars on the `rage` events (E-flat, D). 5-06..: the theme back on the decks' own beat (a machine grid from their slaps: 50 beats, 284 bpm), tutti, climbing over drones that do not move; a Shepard riser. 5-07/5-08 the orchestra thins to pizzicato, snare and drones (the slaps go on without his hand). 5-10: the theme dissolves into a wall (every semitone, tremolo, flutter-tongued brass, drones full, cymbal swell), **cut dead** at the `stop`. |
| **R6** 牌堆 -2:18.1 | 6-01 **digital zero**. From 6-02 the hum creeps back; the first `cardStand` tick, another; the wave a rustle crescendo that stops at once. 6-05: **the organ from its lowest note upward** as the cards rise: D, A, D, A, D, E, A ... open fifths and octaves, no third, swelling to the full chord; 6-06/6-07 the long tone; 6-08 each far thunder moves the chord above the pedal (D, C, A). The organ and the room fade on the cut to 7-01. |
| **R7** 发牌的人 -2:51.4 | Two cards like leaves. Each smile one music-box note on the `smile` events (D6, E6); the two small slaps the next two (F#6, D6): the theme assembling itself. 7-07: the theme on the box in D major, one note per slap, its own little oom-pah, a semitone higher every bar. **7-08** (see below). 7-09: the title in digital zero. |

### 7-08: the slaps become the ant's steps

1. The box keeps time with the slaps for the first 1.2 s of the rise, then winds down on its own: 9 more notes, each
   ~17 % later, softer, the oom-pah first to go, drifting 50 cents flat; the phrase never resolves.
2. The kings' slaps keep their pulse (the director's `smallSlap`, ~0.54 s, falling gain), getting smaller and drier;
   from 7-08 + 1.2 s each one is **crossfaded, hit by hit, into an ant's step at the same instant** (the slap `(1-m)^1.5`,
   the step `m^0.8` of the 1-02 steps' level, `m` rising over 4 s).
3. From 7-08 + 2.6 s steps fill in between the slaps, the pulse subdividing into the gait (0.27 s -> the opening's 0.106 s).
4. The last 3 s are **the opening's steps replayed**: 1-01's times, surfaces and variants (the same cached waveforms),
   looped, at the 1-02 level. The hum has left with the camera; the cut to 7-09 is exact zero.

## Event kinds (`FILM_KINDS`, audio-kinds.js)

Event: `{ t, kind, gain, who?, size?, pov?, ... }`, rendered with its kind's synth x `MIX[kind]` x `gain` x the shot's
`SCENE` dB, panned from `who` (CN left, US right seen from the table's foot; finalists +-0.35, the others +-0.65; an event
`pan` wins), sent to its room. pov 'ant' impacts (and tosses before 1-07) go to the far hall.

| kind | sound |
|---|---|
| antStep `{surface, gain}` | three tiny dry ticks (a tripod's feet); cloth: a soft pat; card: brighter, the card's plate; wood: a knock. 8 cached variants per surface |
| antAlert | a stiff burst of chitin (antennae up), a tiny quick intake, then nothing |
| cardToss `{who, size, pov}` | a soft 嗒 (the last flutter, the flat landing, the pile's knock); pov 'ant': a muffled low "dup" through the wood |
| cardDraw `{who}` | card on card ("shhk"), off the deck's edge, the air as it lifts |
| cardSlap `{who, size, hard, pov}` | table: the palm's "pak", the crack, the pile's knock, the table's thump, air for big cards (US crisper, CN rounder); ant: the vacuum pre-roll, sub to 30 Hz, the table's boom, a shot-like crack, the ground, crumbs, an ear ring; far: thin |
| cardWhoosh `{who, dur}` | the air growing as the card comes, its spin in it, thrower -> pile; ends at t + dur |
| chatWake `{dur}` | the light's flick, a warm low bloom, a glassy shimmer on B-flat major |
| typing `{dur, n}` | a click and a glint per character on the chord's tones, spaces as pauses, running left to right |
| awe `{dur}` | a dozen kings drawing breath through an "o", a few voiced, wide |
| chuckle `{who}` | "hn-hn-hn" through the nose, falling, a breath out |
| scuffle `{dur}` | palms on the cloth, knuckles, the card crumpling in a tug of war, sleeves |
| cardSkim `{dur}` | a light skid on the weave with a thin whistle, him -> the tower |
| towerCrash `{n}` | the tower giving (a paper creak), a cascade of n cards falling toward the US side, a slither, skids |
| bigSlam | the giant card's wall of air (the vacuum), a room-sized boom, the huge flat whap, the table jumping, cups rattling, the pile jumping |
| lampSwing `{amp, dur}` | iron creaks and chain clinks at each end of the swing, dying away, left and right |
| chairSlide `{who, dur}` | a shove, two chair legs' stick-slip on stone, sliding on and away: darker, thinner, outward |
| tremble `{who, dur}` | a card's edge buzzing against fingers (~17 Hz, uneven) |
| breath `{who, phase\|dir: 'in'\|'out'}` | an intake rising / a long soft breath out; each king his own size |
| cardDown `{who}` | the card's air cushion, a little slide, the fingertips |
| deckTwitch `{who}` | a tiny paper "tk", a hair of slide, settling |
| deckFire `{who}` | a flick off the deck's edge and the whip of air |
| stream `{who, rate, rate1, dur}` | flicks and whips, inhumanly even, rate -> rate1 per second; the deck's chatter, the flight |
| blizzard `{dur}` | the storm engine: thousands of cards, snaps, the air roaring |
| stop | nothing: the cut (the gate is the sound) |
| cardsFall `{n, dur}` | a rain of small cards and a 哗 (silent if inside the zero) |
| cardStand `{i}` | an edge dragging up over cards, the "tk" as it stands, a hair of ring, the air as it turns |
| standWave `{dur}` | ticks thickening into a surge of paper sweeping across; stops at once |
| rise `{dur}` | the vortex's wind circling the room, thousands of cards fluttering up and away |
| lampSpin `{dur}` | chain torsion groaning, links clinking faster, turning |
| farSlap `{size, dist}` | thunder: a long low boom, a late softened crack, rolls across the sky (R7: -30 dB, at the edge of hearing) |
| leafFall `{dur}` | soft breaths of air on each see-saw swing, the faintest flutter, swinging left and right |
| cardTap `{who}` | a tiny soft 嗒 on the linen |
| peek `{who}` | a corner flexing, coming away from the cloth with a soft "tk" |
| smallSlap `{who, gain, pov}` | a small light 啪 (8 cached variants); 'far': thinner; 7-08: crossfaded into the steps |
| smile `{who}`, rage `{who}` | silent: the score's music-box note / brass roar lands there |
| yawn (the score's, 1-07) | a breathy intake opening into a voiced "aah" sighing to "mm" |

## Mix and master

- **Prepared** (`prepareEvents`): the zero (nothing between the `stop` and 6-02 is rendered); the vacuums (the ant's
  slap and the giant card: the hit and its whoosh solo, everything else carved over the pre-roll); background slaps
  (gain < 0.6) and the decks' slaps thinned in bursts (sqrt(N0 / n) per 0.5 s); the ChatGPT slap in the hall;
  `breath` with its `kind` overwritten restored; the 7-08 crossfade. **The score's own** (`scoreEvents`, each dropped
  if the picture has the kind there): the far tosses in 1-02/1-03, the yawn (1-07), OpenAI's breath in 2-02, the
  lift's swishes in 5-02, the chairs creaking in 4-05, the END steps.
- **The beat**: `beatsFrom` (one beat per slap; merges, drops flams, fills small gaps) for the hero slaps of 3-02;
  `extend` carries it through 3-03 and the tower; `gridFrom` (a steady, never-slowing grid from the slap density,
  snapping onto slaps within 40 ms) for 3-06..3-08 and the decks of R5. Bars of 4 beats, of 8 when the beat is
  faster than 0.3 s; a semitone per bar.
- **Master**: 26 Hz high-pass, mono below 110 Hz, tone EQ; staging (3-07 + 3-08 at -12 LUFS pre-glue); glue (-13 dB,
  1.5:1); the walls driven (3-06 .. 3-09 from the slam, 5-06 .. the stop; 1.6 dB); true-peak limiter; -1.2 dBTP; the
  **gates** (6-01 and 7-09: exact zero, 1.5 ms ramps). The hum: with the picture (1-02), gone in the vacuums and the
  zero, creeping back from 6-02, leaving in 7-08.

## Measured (the director's 719 events, 2026-11-07)

| | |
|---|---|
| integrated / LRA | -13.6 LUFS / 22.9 LU (ffmpeg ebur128 agrees) |
| sample / true peak | -1.2 dBFS / -1.2 dBTP |
| limiter, deepest | -3.8 dB (0:26.7, the ChatGPT slap); glue 3.7 dB |
| planned loudness | **69 / 69 shots in their class** (walls >= -12 on their own mean, holes <= -40, zeros exact, 2-4 within 6 LU) |
| gates / clicks | 6-01 and 7-09 exact zero / none |
| vacuums | 1-04: 26.8 LU from the silence to the hit; 3-06: 40.1 LU |
| determinism | two renders bit-identical; `renderScoreAsync` = `renderScore` bit for bit (longest step ~100 ms) |

Walls: 3-06 -11.6 · 3-07 -10.0 · 3-08 -11.7 .. -8.3 · 5-06 -10.6 · 5-09 -9.4 · 5-10 -8.3. Holes: 1-01 -52.7 ·
1-02..1-06 -44 .. -48 · 4-04..4-06 -51 .. -45 · 5-01 -51 · 6-02 -56 · 6-03 -46 · 7-01..7-05 -42 .. -49 · 7-08 -40.6.
Pitches checked by spectral peaks: the warm chord (B-flat major with D), the low A, the lazy tuba (D E F D), the race's
first beats, the organ (D-A-E, then C, then A; no third), the box (D6 E6 F#6 D6).

## For the director

- The race slaps in 3-09: the frenzy loop runs to 3-09 + 0.8 and interleaves race slaps (70.24, 70.26, 70.70) with the
  two last slams (70.35, 70.75). The score finds the slams by size; ending the loop before 3-09 + 0.35 would let them
  stand alone.
- `rage {who}` is used (the brass roars); `smile {who}` too. `breath` may carry `phase` or `dir`.
- Everything between `stop` and 6-02 is not rendered (digital zero); cardsFall there is silent by design.

## Known limits

- Nobody here can listen: every level is a measurement, the pitches spectral peaks.
- The holes are faint on a phone by design (4-04 .. 4-06 around -50 LUFS).
