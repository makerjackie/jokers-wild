# JOKERS WILD — sound

Everything you hear is synthesized in plain JavaScript at play time: no samples, no audio files, no
Web Audio nodes. `renderScore(sampleRate, opts) -> { L, R, report?, stems? }` (`src/audio.js`) is a pure,
deterministic function (seeded noise only, no `Math.random`, no clock; two renders are bit-identical),
covers the whole film (`DURATION`, 201.02 s) and runs in Node and the browser (~12-14 s for the whole
film at 48 kHz; 44.1 kHz works too). `renderScoreAsync(sampleRate, opts, onProgress)` renders the same
samples without blocking the page (see "Rendering without blocking the page").

**State**: the whole film is scored, M1 .. M12, against the director's real events for every sequence
(~3 050 events). The tone reel (6-10 .. 8-08, M7 + M8) is the version the user approved; the rest follows
SCRIPT.md section 7 and the planned loudness of every shot (docs/script/shots.txt). The picture is not
locked yet: everything hangs off CUES / ROW / the events, so a moved shot moves its sound.

```
node tools/render-audio.mjs [--preview] [--twice] [--cues] [--no-spec]
  out/score.wav                   the whole film with the real events (48 kHz 16-bit stereo, TPDF dither)
  out/score-preview.wav           (--preview) the same, the undirected sequences filled with the tool's synthetic events
  out/reel.wav                    exactly REEL.t0 .. REEL.t1 (1 320 960 samples = 27.52 s)
  out/stem-{music,sfx,amb}.wav    the reel's three layers (before glue/limiter, same make-up gain)
  out/reel-spec.png, out/score-spec.png, out/score-preview-spec.png   ffmpeg showspectrumpic (linear axis)
```

The tool prints per-row levels over the film, BS.1770 loudness (momentary 0.4 s, short-term 3 s) at ~30
sync points, the walls and holes of SCRIPT.md section 7, the march's flatness, the gates (exact zero),
sample and true peak, the limiter's worst moments, a click scan, a struck-tone ("mallet") scan of the
music stem and the mix over the whole film, band energies per sequence, an ffmpeg ebur128 cross-check,
and with `--twice` a bit-identical check. `--preview` is test-only: the synthetic events live in the tool
and never ship; a sequence counts as directed (and keeps only its real events) as soon as the real list
has any non-tick event in it.

## Rendering without blocking the page

```js
import { renderScore, renderScoreAsync } from './audio.js';
const { L, R } = await renderScoreAsync(ctx.sampleRate, {}, (p) => bar(p));   // p: 0 .. 1
```

- `renderScoreAsync(sampleRate = 48000, opts = {}, onProgress = null) -> Promise<{ L, R }>` (plus `report`
  / `stems` when `opts` asks for them, exactly like `renderScore`). `L`, `R`: `Float32Array`,
  `ceil(DURATION * sampleRate)` samples each.
- **Bit-identical** to `renderScore(sampleRate, opts)` in the same JS engine: both drive one generator
  (`renderGen`) step by step; only the pauses differ. Verified in Node 24 and in Chrome 156, at 48 and
  44.1 kHz. (Between different engines the last bit of `Math.sin` / `exp` / `log` can differ, so a Node
  render and a Chrome render differ by at most ~3e-8, about -150 dBFS: inaudible, but not the same bytes.)
- It works in slices of `opts.sliceMs` (default 12 ms), then gives the event loop back (`setImmediate` in
  Node, a `MessageChannel` task in the browser, `setTimeout` otherwise), so input, timers,
  `requestAnimationFrame` and painting all run between slices.
- `onProgress(p)` is called at every pause with `p` in [0, 1), never decreasing (weighted by the measured
  cost of every unit), and exactly once with `1` when the score is done, before the promise resolves.
- Every heavy loop is a plain block function with its state in an object; the `...G` generators run it
  BLOCK by BLOCK (16 384 samples), one note or one event per step; the two heaviest synths (the storm and
  the tornado) step per voice. The longest single step is ~80-90 ms (a long bowed note, a limiter block in a
  wall); `report.units` lists every unit with its compute time and its longest step.
- Two renders may run side by side: the module's sample rate is set again after every pause.

## Files

| file | what |
|---|---|
| `src/audio.js` | `renderScore` / `renderScoreAsync` (one generator, `renderGen`): the chunked render, the siren, hum and organ, the master chain and the gates (`gates()`) |
| `src/audio-music.js` | the score: `buildMusic` (the reel: AUTO cascade, march, break, seals, climb) and `SCORE[cue]` (M1 .. M10b), `cueTable()` |
| `src/audio-sfx.js` | event rendering (`MIX` per kind, `aiFocus` and `SCENE` per shot, `ducks` at cuts), ambience: `humInto`, `organInto`, `siren` |
| `src/audio-sfxlib.js` | one synth per sound-event kind (66), plus engines (tex, grains, friction, sweep) |
| `src/audio-inst.js` | the instruments (brass presets, bowed sections, the card instrument, snare, bass drum, war drum, timpani, cymbals, heart) |
| `src/audio-dsp.js` | filters, noise, windowed buses (`span`, `groupSpan`, `put`, `put2`, `addBus`), WAV encoder |
| `src/audio-master.js` | FDN rooms, glue, streaming true-peak limiter, carve, sweeps, BS.1770 meters (`windowLUFS`, `loudnessCum`, ...) |

Adapted from YOUR TURN's sound department (same author, MIT; it follows THE BIG ONE and LEVIATHAN). Only
the architecture was kept: its music and its whole toy palette are gone from the code (no xylophone,
marimba, kalimba, glockenspiel, music box, woodblock, slide whistle, ocarina or cartoon pop).

**Chunks.** The film is rendered one music cue at a time (M1 | M2+M2b | M3 | M4 | M5 | M6 | the reel |
M9 walls | M9b from CUES.pair | M10 | M10b from CUES.lastTwo | M11+M12): each chunk gets its own windowed
music and effects groups (window = the cue plus the longest event tail) and its own rooms, is carved,
summed into the master and released. Two chunks are "cut dead" at their end, rooms included: the M9
walls at CUES.pair and M10 at CUES.lastTwo. Event seeds are a hash of the event itself (kind, time, who,
pan, pitch, size), so adding events anywhere never changes another event's sound.

## Timing rule

No second is hard-coded. Every time is a `CUES` / `ROW` value or comes from the picture's own events:
the M2 motif sits on the raise shots and holds into the next `slam`; the M4 stabs sit on the `point`
events; the M7 cascade on the `relay` events; the march's beat is fitted so beat 16 lands on CUES.crack;
the seals on `chains`, the climb on `strain`; the M10 brass on the `flatten` events. When a cue's
events are missing, the music falls back on the shot table (the rows' starts).

## The three layers (SCRIPT.md section 7)

| layer | where |
|---|---|
| **power** (kings, states) | low string clusters (M1 from nothing, M2 pedals, the cascade, the shadow, the climb), low brass (the kings' motif, the seal falls, every hit), war drums (the title, the cascade, M6, the bomb), timpani, cymbals |
| **human** (heartbeat) | the `heart` events only (the director emits every beat, gain 1; the level is the mix's, per shot): 3-04, M5 at 54 bpm (kept inside the hole), 6-08 (a skipped beat), 9-10 (the first sound after the silence, alone: the hum stays off until the sub swell; at hole level, +7 dB), 10-05, 11-05 / 11-06 (drifting onto the tick grid) |
| **AI** (cards) | the ticks (identical every time, on the frame grid), the 50 Hz machine-room hum from 0:01 to the hard cut at 3:13.02 (it sinks into an organ drone on E1 through M10 and comes back at the tilt), the throws, slaps, storm, tornado, wave; in M10 the cards themselves play the kings' motif |

## Instruments (`audio-inst.js`)

- **Brass**: unison stacks of band-limited saws (polyBLEP) with per-player detune, lag and scoop; the
  filter opens with the breath, `tanh` tears the tone at ff, a lip "blat" at the onset, a bell formant,
  marcato `accent`, a nervous `flutter`. Presets: cornet, trumpet, euphonium, horn, trombone, tuba.
- **Bowed sections** (`bowed`): cellos / basses / violas with per-player detune, vibrato and
  unsynchronized tremolo, rosin noise, body resonance, sul ponticello, sforzando, stepped or gliding pitch;
  short notes make the M4 spiccato; one or two players make the M5 solo bass.
- **The card instrument** (`cardTone`): a note is a riffle of card snaps fired at the note's own
  frequency (a pitched, papery buzz) with octave layers, each side detuned a little.
- **Percussion**: field snare (flams, 5-stroke rolls), band bass drum, war drum (odaiko / gran cassa),
  timpani, clash cymbals, suspended-cymbal swell, trailer boom, `heart` (lub-dub).

## The score, cue by cue

| cue | music |
|---|---|
| **M1** 0:00-0:24.6 | Nothing until the lamp. Across the long take a chromatic cluster A-Bb-B (basses A1-B1, cellos A2-B2) grows from nothing and opens (low-pass 250 Hz -> 1.6 kHz), is pressed down in 1-06 and is gone at the title: one long low brass A (tuba, trombones, horn) over a war drum, dying into the hum. The first drum of the film is the picture's first `slam` at CUES.open. |
| **M2** 0:24.6-0:46.7 | The kings' motif on every raise (2-01, 2-04 .. 2-16), each hand a semitone higher (A-Bb-B .. E-F-F#), the third note held into the card's `slam` (the drum is the event); trombones + tuba, horns from the 4th hand, trumpets from the 7th; a tremolo pedal on each root. 2-17/2-18: tremolo crescendo, timpani roll. **The jam** (2-19): the band stuck on one chord, re-struck ~11 times a second, slightly uneven. **2-20: the music rests** (carved); the board's `jam` keeps chattering until the double slam knocks it loose. 2-21: a crash and the brass a semitone higher still, falling away under the dominoes. |
| **M2b** 0:46.7-0:54.5 | No music. |
| **M3** 0:54.5-1:21 | Half a second before the seal is seen, a slow chromatic fall in low brass and tremolo strings with a cymbal swell into EMBARGO (59.5): brass and strings sforzando on D held through 3-03. 3-04: only the heartbeat (music carved). **The o1 fanfare** (62.5): D major, then a too-bright E major (the Lydian II, G#), then an augmented D (A#), trumpets 10 cents sharp, horns, trombones, tuba, timpani, crashes; it holds a D major chord until the tiny card lands and is **cut dead at CUES.tiny**. The avalanche, the busy plate, the toll gate and the carts are dry. REJECTED (77.0): brass on Bb with a tritone, strings, war drum, crash. The kiln (78.5): the motif a semitone higher, F-F#-G, slow and heavy. |
| **M4** 1:21-1:34.05 | A low spiccato ostinato in E (16ths accelerating 0.12 -> 0.075 s, a semitone higher at the bomb and again at 4-07), a field snare growing denser; one muffled drum when the price goes negative, a drum + crash at the bomb; **a dissonant brass stab on every `point`** (tritones and a minor ninth), each a semitone higher, panned to the pointer. The sacks (4-11): every brass on one long sour chord (E1 .. D5), growing, then it breaks off. The montage (4-12): spiccato in 32nds, war drums, a snare roll. **Cut to silence at CUES.stop.** |
| **M5** 1:34-1:49 | One double bass holds a long A (sul tasto, very quiet) under the 54 bpm heart and falls a minor second (A -> Ab) at CUES.look. The hole stays a hole: heart -3 dB, presses -14 dB, ticks -10 dB there. |
| **M6** 1:49-2:00.45 | Tremolo strings; from 6-02 (the machine-gun hand, a wall) war drums in sixteenths and the low brass bursting in on F# with a crash; the low brass climbs one step per thing fed to the hopper (G, Ab, A, Bb: horns from the castle, trumpets from the city), each with a war drum, a crash on the power plant. **The music steps aside at CUES.fed** (paper and a skipped heartbeat). The approvals: strings, brass and a drum roll build under the stamps and are **cut dead at CUES.button** into the reel. |
| **M7, M8** 2:00.45-2:27.97 | The tone reel, unchanged (see below). |
| **M9** 2:27.97-2:42.6 | 9-01: the strings fly up an octave and more (tremolo glissando); the storm and the siren carry over. **9-02, 9-04, 9-06: digital zero** (the master's gates). 9-03 / 9-05 / 9-07: the noise walls: tremolo cluster ff a step higher each time, trombones, a war-drum roll, a crash, the siren at +8 dB, the storm; driven 1.5 dB into soft saturation in the master. **At CUES.pair everything is cut dead** (music, effects, their rooms); the siren's motor is cut, it dies in a fraction of a second. 9-08: only the picture's two soft ticks. **9-09: 3.5 s of digital zero.** 9-10: the heartbeat. The sub swells for 0.7 s before the flash (with a reversed cymbal); 9-11 the bomb: a tutti hit (low brass with a tritone and a semitone, horns, trumpets, war drums, two crashes, timpani) on top of the `kingbomb` event; 9-12: an open E held over the `wave`, its dissonances fading first. |
| **M10** 2:42.6-2:58.6 | The hum sinks into an **organ drone**: from 50 Hz down to E1 over 4 s, the upper ranks (8', 4', 2 2/3', 2') coming in. Over the tornado **the cards play the kings' motif**, E-F-F#, slow. 10-02: the king settles: a low pedal on E (tuba, trombones, a sub) and the organ swells. 10-03: a low tremolo cluster creeping up with the shadow. 10-04: **a low brass note on every `flatten`**, falling by semitones, side to side. **Cut dead at CUES.lastTwo**: 10-05 is only the two kings' hearts (the organ ducked by 26 dB). 10-06: flattened together, a low minor second. |
| **M11** 2:58.6-3:13.02 | No music: the picture's dry foley; the organ collapses back into the 50 Hz hum at the tilt; ticks and hum into the black; **hard cut at CUES.credits**. |
| **M12** 3:13.02-3:21.02 | Digital zero (the master's gate). |

### The tone reel (M7, M8), as approved

**M7a, the AUTO cascade (7-01 .. 7-08).** On Claude's relay a D pedal (contrabasses, cellos, a sub) and a
war drum; on the first three presses the kings' motif D-Eb-E in trombones and tuba, nervously; every
further king adds the next semitone to a bowed cluster, each on his relay with a war drum. Cut dead on the
cigars cut.

**M7b, the victory march (7-09 .. 7-12).** Original. A state band played as a broadcast (loudspeakers:
85 Hz - 7 kHz, presence, a little tearing, light compression) in a stone room (RT60 2.7 s). Bb major, 2/4,
118.5 bpm (beat 16 = the crack), cornets 7 cents sharp, euphoniums, horns on the after-beats, trombones,
tuba, field drum, bass drum, clash cymbals.

```
bar   1          2          3           4          5          6          7          8          9
mel   Bb  F. D | Bb D F   | Bb'  .  C" | A  G. Eb | Bb  F. D | Bb D Gb  | F  Eb Db | C  Ab A  | Bb   <- the crack
harm  Bb       | Bb       | Eb         | F7       | Bb       | Bb   Gb  | Ebm      | F7 unison| unison Bb
```

7-11: 0.3 s from inside the glass case (everything dull and boxy). 7-12: the crack unmuffles everything on
the Bb downbeat. **M8**: the broadcast skips like a scratched CD on that downbeat (5 repeats of 0.12 s
with digital dropouts), sticks on a single Bb (granular freeze pulled into one note by a comb on Bb2), fades
and darkens into the hole by 8-03. The hole: hum, the creeping cracks, the cards far away. 8-05: the lamp's
buzz, the beacon, the air-raid siren from the alarm event (two rotors a minor third apart, peak 290 / 345
Hz, a wail every 3.2 s; since this pass with harmonics to ~5 kHz and a 1.6 kHz presence peak so it reads on
a phone speaker). 8-06: the dead cancel key, dry. 8-07: the seals fall (E-D-C-Bb in low brass) with the
chains; the storm swallows them. 8-08: a low string tremolo cluster climbs chromatically (15 steps,
0.38 -> 0.11 s), violas join, a war-drum roll, a cymbal swell; cut dead on the cut to 9-01.

## Sound events (`audio-sfxlib.js`)

Each event: its kind's synth x `MIX[kind]` x the event's `gain` x the shot's focus (`aiFocus` for ticks,
throws and slaps in the reel; `SCENE` elsewhere: dB per kind for events starting in a shot or a named
range), equal-power `pan` (CN left, US right), a send to the war room (FDN RT60 1.3 s). `ducks` pulls a
long tail back at a cut (the seal's and the crunch's at the cut to 3-04). Unknown kinds are skipped,
silent, with one console warning, and listed in the report.

`SCENE` (dB): heart 3-04 +6, the card-maker's hole 4-13 .. 5-05 -3, 6-08 +4, 9-10 +7, 10-05 -4, 11-05 /
11-06 +4; press 5-01 .. 5-05 -14; lever 5-01 -12, 5-06 -6; paper 5-01 -8; slam 1-02 +5 (the film's first
war drum); tick 4-13 .. 5-05 -10, 9-08 +6 (the two soft "da"), 10-05 -6, 11-06 +6, 11-07 +10 (the clock
in the black); flaps 2-19 +3, 6-01 +6 (board close-ups), 4-13 .. 5-05, 8-03, 8-04 muted (the board flips
off-screen inside holes), 6-10 -12, 7-01 -6, 8-01 -6, the frozen world (CUES.freeze .. end of 8-02) -20.

| kind | synth |
|---|---|
| `tick` | a paper-edge snap (three noise bands, one above 9 kHz), identical every time |
| `throw` / `slap` | a short air whip / a flat paper "thwap" on the pile |
| `stamp` | rubber stamp: handle thud, rubber squish, paper slap |
| `cover` | the spring-loaded steel safety cover snapping open |
| `relay` | a fist, a heavy contactor slamming home (steel, 100 Hz coil chatter), the latch |
| `string` | a stiff steel wire snapping taut (inharmonic, no glide) |
| `creakS` / `creakT` | a chair / a table leg under load (stick-slip through wood modes) |
| `lighter` / `puff` / `ash` | flint and flame / a draw on a cigar / ash on the table |
| `clink` | two lead-crystal goblets, slightly different, beating |
| `flaps` / `jam` | a run of split-flaps / flaps stuck mid-flip, chattering |
| `crackG` | glass: a sharp crack (size ~1) or a creeping crack over `dur` (size ~0) |
| `buzz` / `alarm` / `switch` | filament arcing / the beacon's contactor and motor / the lamp's rotary switch and filament ping |
| `click` | the dead cancel key: plastic on a steel spring, dry |
| `chains` / `strain` / `hang` | chain running out with its jolt / chain groaning under torsion / the little plate on its chains |
| `storm` | the card storm: flutter voices, card snaps, roaring air; builds over its first 3.9 s, `size >= 0.95` = full blast at once |
| `whoosh` / `zip` / `point` | something big passing / yanked away on a line / a stone sleeve swinging (the brass stab is music) |
| `slam` | a card slammed: a war drum (bigger card = lower, longer; `gain` = speed) and the card's slap |
| `stone` | a stone head turning: dry grinding, no tone |
| `pulse` | the red crown: a 58 Hz throb with harmonics, ~2.2 beats a second |
| `chips` / `chipflow` / `avalanche` | a shovel of clay chips / chips down a chute / the chip tower going down (grows) |
| `press` / `lever` / `groan` | the card press "dong" with the card springing out / the lever's ratchet and clunk / a press groaning |
| `pop` / `topple` / `fold` | a cardboard standee snapping up / falling flat / cardboard or paper folded |
| `thud` / `brick` | the shim "dong" / clay chips stacked |
| `seal` | a national seal slamming down: taiko, boom, the iron rim, the crack |
| `crunch` / `collapse` | the metal chute crushed / the gold card folding at the middle |
| `snap` / `flick` | the tiny card's "pa" / a card fingertip flicking ash |
| `blink` | the dispenser's eye: an iris and an electric blip |
| `gate` / `cart` | the toll barrier / iron cart wheels (`pitch < 0`: rolling back, gathering speed) |
| `kiln` / `reel` / `brush` | a furnace roar / a fishing reel's pawl / a make-up brush |
| `bomb` / `boomL` / `kingbomb` | the four-card bomb / the power plant / the jokers' bomb (a sine diving to 24 Hz, the blast, card shrapnel, iron ringing) |
| `books` / `paper` | hardbacks thudding out of a sack / paper rustle |
| `clank` / `crumble` / `crackle` | gold bars / a stone castle / electricity arcing |
| `heart` | one heartbeat: lub, and dub 0.31 s later |
| `tornado` / `wave` | the card tornado (a rotating roar) / the shock wave turning every card (two fronts from the centre out) |
| `flatten` / `tilt` | a king squashed into a card (the low brass note is the music's) / the table dropping onto its short leg |

## Mix and master

- **Rooms**: power layer (war room, RT60 2.4 s), the march (its PA and a stone room, RT60 2.7 s),
  effects (war room, RT60 1.3 s), the siren (far end of the stone room, RT60 3.2 s, mostly wet).
- **Carved silences** (after the rooms, -90 dB): M2 2-20; M3 3-04 (heart only) and from CUES.tiny to the
  reject; M4 from CUES.stop; M6 at CUES.fed (until the approvals) and from CUES.button; the reel's own
  gaps; M10 10-05. **Chunks cut dead**, rooms included: the M9 walls at CUES.pair, M10 at CUES.lastTwo.
- **The gates** (`gates()`): 9-02, 9-04, 9-06, CUES.zero -> CUES.heart, CUES.credits -> the end are
  **exact digital zero** in the master (1.5 ms ramps just outside them; the WAV encoder does not dither
  exact zeros).
- **Master**: 26 Hz high-pass, mono below 110 Hz, gentle tone EQ; **staging on a fixed reference**: the
  march's last 3 s before the crack (the approved reel) lands at `REF_LUFS` (-9.9 pre-glue, -10.3 LUFS-S
  after), so the rest of the film is placed relative to the approved reel and no single hit can move it;
  glue (-12 dB, 1.4:1); the 9-0x noise walls driven 1.5 dB into soft saturation; a streaming true-peak
  limiter at -1 dBTP; the true peak landed exactly on -1.0 dBTP (sample peak -1.000 dBFS).

## Measured (final render, the director's real events, 3 051)

| | |
|---|---|
| integrated / LRA | -13.8 LUFS / 18.3 LU (ffmpeg ebur128 agrees) |
| sample / true peak | -1.000 dBFS / -1.000 dBTP |
| limiter, deepest | -5.9 dB (the avalanche's flood, 1:13.2); the bomb -5.0 dB |
| clicks / gates | 0 / all five exact zero |
| struck tones in the music | 0 |
| determinism | two renders bit-identical; `renderScoreAsync` = `renderScore` bit for bit |

Walls (SCRIPT.md section 7, the loudest 3 s window, >= -12 LUFS-S): 0:42-0:45 -11.9 · 0:59 -12.0 · 1:11
-11.4 · 1:17 -11.9 · 1:33 -11.8 · 1:50-1:57 -11.4 · 2:15 -10.2 · 2:29-2:32 -10.4 · 2:38-2:43 -11.2.
Holes (<= -40): 1:34-1:48 -41.9 · 2:17-2:20 -42.2 · 2:32-2:38 -40.4 (through the heartbeat of 9-10 up to
the sub swell) · 2:56 -44.9.

Every shot against its planned loudness (shots.txt, own mean): all 17 wall shots >= -12 (2-19 -10.9 ..
6-02 -11.9 .. 9-03 -7.2), all 12 hole shots <= -40 (5-01 -41.3, 8-03 -42.4, 9-08 -44.7, 9-10 -40.6, ...).
More than 6 LU off a light/medium/loud class: 2-23 / 2-24 / 2-27 (hum and ticks only, -38 .. -46 against
"light" -30), 3-02 +7.9 (the seal's descent carries the 0:59 wall), the approved reel (7-08, 7-11, 8-01,
8-02, 8-07, 8-08 louder than "medium"), 11-07 (the ticks in the black, -40).

The reel is where it was approved: crack -10.3, its end -10.7, march flatness 2.6 dB.

## Status

Done: the engine; the whole score M1 .. M12 (the reel as approved) on the real events; synths for all 66
event kinds; the hum, the organ, the siren into 9-0x; the gates; the master and the checks; the
non-blocking render. Waiting on the picture lock for the final pass.
