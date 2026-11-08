# JOKERS WILD — sound (v2)

Everything you hear is synthesized in plain JavaScript at play time: no samples, no audio files, no Web Audio
nodes. `renderScore(sampleRate, opts) -> { L, R, report?, stems? }` (`src/audio.js`) is a pure, deterministic
function (seeded noise only, no `Math.random`, no clock; two renders are bit-identical), covers the whole film
(`DURATION`, 203.35 s) and runs in Node and the browser (~15 s for the whole film at 48 kHz; 44.1 kHz works too).
`renderScoreAsync(sampleRate, opts, onProgress)` renders the same samples without blocking the page.

**State (2026-11-06, v2)**: the whole film is scored, M1 .. M12, against the director's real v2 events (4 028 from
`soundEvents()`, plus the score's own ambience). v1's score is gone with v1's story; only the engine, the
instruments and the v1 event synths were kept. Every time hangs off `CUES` / `ROW` / `SHOT` or the events, so a moved
shot moves its sound.

```
node tools/render-audio.mjs [--twice] [--async] [--cues] [--no-spec] [--kinds]
  out/score.wav                  the whole film (48 kHz 16-bit stereo, TPDF dither; exact zeros stay zero)
  out/reel.wav                   REEL (Claude at the button .. the jokers rising, 6-08 .. 8-03)
  out/stem-{music,sfx,amb}.wav   the three layers over M7 .. M8 (pre-glue/limiter, same make-up gain)
  out/score-spec.png, reel-spec.png   ffmpeg showspectrumpic
  out/levels.txt                 the level report (everything printed)
  --twice / --async              render again / with renderScoreAsync and compare bit for bit
  --kinds                        out/kinds.wav + kinds.txt: every event kind once, solo, at its mix level
```

The report: per-row levels against the planned loudness column of `shots.txt`, BS.1770 loudness at ~56 sync points,
the walls and holes of SCRIPT.md, every shot against its class, the march's flatness, the gates (exact zero), sample
and true peak, the limiter's worst moments, a click scan, a struck-tone ("mallet") scan of the music stem and the
mix, band energies per sequence, an ffmpeg ebur128 cross-check.

## Rendering without blocking the page

```js
import { renderScore, renderScoreAsync } from './audio.js';
const { L, R } = await renderScoreAsync(ctx.sampleRate, {}, (p) => bar(p));   // p: 0 .. 1
```

- `renderScoreAsync(sampleRate = 48000, opts = {}, onProgress = null) -> Promise<{ L, R }>` (plus `report` / `stems`
  when asked, like `renderScore`). `L`, `R`: `Float32Array`, `ceil(DURATION * sampleRate)` samples each.
- **Bit-identical** to `renderScore(sampleRate, opts)` in the same engine (both drive one generator, `renderGen`).
  Between different engines the last bit of `Math.sin` / `exp` / `log` can differ (~-150 dBFS).
- Slices of `opts.sliceMs` (default 12 ms), then the event loop is given back (`setImmediate` / `MessageChannel` /
  `setTimeout`). `onProgress(p)`: never decreasing, exactly once `1` at the end. Longest single step ~110 ms (a run
  of march notes); the heavy synths (storm, tornado, jokerHum, chipflow) step per block or per voice.

## Files

| file | what |
|---|---|
| `src/audio.js` | `renderScore` / `renderScoreAsync`, the chunks, the gates (`gates()`), the wall drives (`wallDrives()`), the hum / organ / siren schedule, the master |
| `src/audio-music.js` | the score: `SCORE[cue]` (M1 .. M6, M9, M9b, M10, M11) and `buildMusicG` (M7 + M8: AUTO, the march, the break, the hole, the seals) |
| `src/audio-sfx.js` | `prepareEvents` (remaps, the card cloud, bursts thinned), `scoreEvents` (the score's own ambience events), `MIX`, `SCENE`, `HUSH`, `levels()` (automation), event rendering; the hum, the siren, the organ |
| `src/audio-sfxlib.js` | one synth per event kind (v1 kinds + 27 v2 kinds), engines (tex, grains, friction, sweep) |
| `src/audio-inst.js` | brass presets, bowed sections, the card instrument (`cardTone`), the card tap (`cardTap`), snare, bass drum, war drum, timpani, cymbals, heart |
| `src/audio-dsp.js` | filters, noise, windowed buses, WAV encoder |
| `src/audio-master.js` | FDN rooms, glue, true-peak limiter, `pull` (pulled away), carve, sweeps, BS.1770 meters |

**Chunks** (one per cue): M1 0 → 2-03 | M2 → 3-01 | M3 → 4-01 | M4 → 5-01 | M5 → 6-01 | M6 → 6-08 (**pulled away**
over 0.3 s: a falling low-pass and a fade, music, effects and rooms) | M6b (6-08: the heart alone) | M7 7-01 → 9-01
(the march, the break, the hole, the seals; **cut dead** at 9-01) | M9 → the pair (**cut dead**, rooms included) |
M9b → 10-01 | M10 → 11-01 | M11 → the end. Event seeds are a hash of the event itself, so adding events anywhere
never changes another event's sound.

## The three layers

| layer | what |
|---|---|
| **power** (the kings, the states) | low brass (the kings' motif, the title, the seal fall, EMBARGO, the fanfare, the hopper climb, the frenzy, the seals), low strings (clusters, pedals, spiccato, tremolo climbs), war drums, timpani, cymbals. Last heard at the bomb. |
| **human** | the `heart` events (the picture's), the breathing |
| **AI** | the hum (50 Hz) that turns into the new king's organ, the card ticks (滴答), the gold light (`glow`, `leak`), the jokers' tone, the cards playing the kings' motif (`cardTone`), the card cloud, the "da-da-da" |

Banned and absent: xylophone, marimba, glockenspiel, kalimba, music box, woodblock, slide whistle, ocarina, cartoon
boings. The struck-tone scan finds 0 strikes in the music and 0 melodic struck runs in the mix. Comedy lands on dry
foley and pauses: the chair gags (2-11, 2-17), the boxes and stickers (3-04 .. 3-06), the relays (7-01 .. 7-08), the
cancel key (8-05) have no music under them.

## The score, cue by cue

**The kings' motif**: three low brass notes rising by semitones. It climbs a semitone per hand in M2 (A-Bb-B ..
E-F-F#), hits F at the double slam, the kiln lifts it to F-F#-G, the gold to F#-G-G#, the hopper climbs A, Bb, B into
the frenzy's C. The march hammers it (Ab Ab A A -> Bb). After the bomb the brass never returns: the **cards** play it.

| cue | music |
|---|---|
| **M1** 0:00-0:23 | No music in the empty room: the hum from nothing (1-01), the old clock's tick-tock (the picture's `tick {who:'clock'}`, rendered as a heavy pendulum clock), Google's slow breathing. The first card (1-04): the picture's slam is the film's first war drum; the gold light's "vwoom" (`glow`, the score's) runs outward. 1-06: under the chairs scraping in the dark, an A-Bb-B cluster (basses, cellos) creeps in from nothing, opening slowly, and resolves onto A at 2-03. |
| **M2** 0:23-0:44.1 | The motif on every hand, a semitone higher each time (trombones + tuba, horns from the 4th hand, trumpets from the 7th), its third note held into the slam (the drum is the event), a tremolo pedal on each root. **2-11 and 2-17 (the chairs that never stop) are dry**; the climb still counts them. 2-17 → 2-18: tremolo and a timpani roll. **2-19 the jam**: the band stuck on one chord, re-struck ~11 times a second with a snare (a machine gun; a wall). **2-20 / 2-21: no music** (the clocks; the board's jam ducked 16 dB). **2-22**: two crashes, the brass a semitone higher (F), strings, timpani, a sub, held through the first 0.6 s of 2-23 and gone: a beat of quiet. |
| **M3** 0:44.1-1:02.2 | A thread of high cello tremolo while the press groans; cut when the joker appears: its own tone (`jokerHum`) is the scare. The boxes, chains, five padlocks and stickers are dry. **Title** (3-07): one long low brass A pressing on a war drum (and a sub), then only the hum (and the joker's tone, faint). |
| **M4** 1:02.2-1:30.9 | 4-02: a low string semitone cluster (E-F) under the giant's eyes and breath; it leaves before the key turns. **4-03 the first lock is dry** (key, "ka", "dang", the gold leak, "pa"). 4-04: the seal lifted in a slow chromatic low-brass fall (pp -> f) and a cymbal swell into **EMBARGO** (4-05): brass and strings sforzando on D with an Eb in it, a crash, a sub (a wall). 4-06: only the heartbeat. **The o1 fanfare** (4-07): D major, a too-bright E (Lydian), an augmented D, trumpets 10 cents sharp; its last chord held and sagging under the second lock; **cut dead** when R1 lands (4-10). The avalanche is dry (a wall). 4-12: the kiln: the motif up a semitone (F-F#-G), slow, war drums. |
| **M5** 1:30.9-1:42.3 | Under the "ka, dang, pa" and the drums: a low spiccato ostinato in 16ths (0.15 -> 0.046 s), a semitone higher with every lock; 5-09 the plastered boxes: denser, a low brass swell; 5-10: a snare and a war-drum roll into the frenzy. |
| **M6** 1:42.3-1:59.1 | 6-01 the gold: the motif up again (F#-G-G#), war drums; the low brass climbs a step per thing fed to the hopper (A castle, Bb city, B power plant), crash on the plant; the fourth locks over a held pp chord; **6-07 the wall**: brass on C with a C#, strings ff, war drums and snare from 16ths to 32nds, the picture's ticks in 32nds. **6-08: pulled away** (0.3 s, darker and gone): only Claude's heartbeat. |
| **M7** 1:59.1-2:15.7 | 7-01 .. 7-08: the relays are dry ("ka", "ka-ka-ka"); under them one held breath: a contrabass D and a sub growing with every king. **7-09 the march** crashes in on the cigars: an original corny state band (cornets 7 cents sharp, trumpets, euphoniums, horns on the after-beats, trombones, tuba, field drum, bass drum, clash cymbals), Bb major, 2/4, 24 beats of 0.4708 s (127.4 bpm) fitted so beat 24 is the burst: 2 bars of vamp, the 8-bar tune (bar 6 lurches to the flat sixth, bar 7 sinks into E-flat minor), a 2-bar tag pounding the motif in unison (Ab Ab A A -> Bb). Too loud and flat (compressed hard, a little torn; flatness over 7-10: 0.7 dB). **7-11 the last lock: the march goes distant** (dry darker and ~24 dB down, its stone room kept): the key and the "dang" lead. 7-13: heard from inside the iron box (boxy, muffled; the effects too). |
| **M8** 2:15.7-2:27.15 | **8-01 the burst**: the band back FULL on its Bb downbeat (louder than ever), then it skips like a scratched CD (5 repeats), sticks on one grain pulled into a single Bb, darkens and dies by 8-03 (a wall). **8-03 the hole**: the hum and one high string tremolo creeping upward (pp); the lids creak, the jokers' tone barely there (it grows through 8-04 / 8-05); 8-05: the siren spins up, a second tremolo a semitone above; the cancel key dry. **8-06**: the seals swing down in low brass (E -> D), the chains catch and the D strains (flutter); a low string tremolo cluster climbs 13 semitones (0.26 -> 0.08 s), violas join, a war-drum roll, a cymbal swell; **cut dead** on the cut to 9-01. |
| **M9** 2:27.15-2:42.05 | 9-01 / 9-02: the strings fly up an octave and more under the tearing wind. **9-03**: three noise walls (tremolo cluster a step higher each time, trombones, tuba, a drum roll, a crash, the card storm, the siren +8 dB) with **digital zero** between them (9-03.02, 9-03.04); all cut dead at the pair. 9-04: only the two soft "da". **9-05: 3.5 s of digital zero.** 9-06: the heartbeat, alone (the hum stays off). The sub swells 0.6 s before the flash; **9-07 JOKERS WILD**: a tutti hit (low brass with a tritone and a semitone, horns, trumpets, war drums, two crashes, timpani) on the `kingbomb`; 9-08: an open E held over the wave, its dissonances fading first. The last of the brass. |
| **M10** 2:42.05-2:55.05 | The hum becomes an **organ**: the mains glide up to A1 (55 Hz) as the ranks come in; the cards play the kings' motif (A-Bb-B) over the tornado. 10-02 the king sits: the organ sinks to E1 ("低音沉下去") and the cards play the motif low (E-F-F#). The deals ("sou, da") and the threads letting go are foley; the organ fades with the threads, the hum comes back. |
| **M11** 2:55.05-3:18.35 | 11-01 .. 11-04: no music (the hearts, the hum). 11-05 / 11-06: foley (the double slap, the two cards flying up, the king's inhale). **11-07 the race**: the cards play the motif a semitone higher and faster every time (6 statements, A up to D); the organ rises out of the hum again; the card cloud (hundreds of cards streaming up) swells. **11-08**: it collapses into "da-da-da": card taps 7 -> 22 a second plus the picture's ticks; the organ is cut dead on the black; **11-09**: the taps run on in the black, denser (-> 46 a second); **hard cut** at 12-01 (the gate). |
| **M12** 3:18.35-3:23.35 | Digital zero. |

## The director's events, prepared (`prepareEvents`)

- `tick {who: 'clock'}` -> `oldClock` (the heavy pendulum clock, tick/tock by second).
- `click {who: 'US' | 'CN'}` -> `lockShut` (the boxes' padlocks snapping shut). The cancel key keeps `click`.
- The quiet `flyUp` / `absorb` events of the race (gain < 0.6: 399 + 399) become **one** `cardCloud` texture:
  every flyUp a short rising swish from a bank of 8, every absorb feeding a breathing bed (formants rising as the
  king grows), a golden hiss, a soft low "thoom" every 6th absorb. The loud ones (the two played cards) stay hits.
- Bursts of the same kind are thinned in level: gain x sqrt(N0 / n) for n events in 0.5 s (throw N0 4, slap 4, slam 2).

**The score's own ambience events** (`scoreEvents`; each family is dropped when the director emits that kind): the
old clock (`oldClock`, M1), Google's breathing (`breath`, 1-02 .. 1-04), the gold light on the first card (`glow`)
and on the first lock of each side (`glow`, dropped since the picture emits `leak`). Currently only the first-card
`glow` is the score's.

**The re-recording mix** (`audio-sfx.js`): `SCENE` (dB per kind per shot), `HUSH` (whole shots pulled back except a
few kinds: 7-11/7-12 -8 dB but the lock foley, 8-02 -16 dB, 8-03 -26 dB but the lids and the jokers' tone, 8-04 -14,
8-05 -8), `levels()` (dB automation over film time for long events: the EMBARGO seal's tail out of 4-06, V3's drum
out of 4-02, the jam out of 2-20/2-21, the burst's tail out of 8-03, the double slam's tail out of 2-23, the jokers'
tone rising from -26 dB in the hole to -4 dB by the seals, the dispenser's 30 s chip flow under the heart, the
fanfare and the kiln). The card ticks are lifted where the shot list asks for 滴答 (2-20, 2-21, 2-23, 6-07, 7-10,
11-07 .. 11-09).

## Sound events (`audio-sfxlib.js`)

Event: `{ t, kind, gain, pan, pitch, dur, size, who }`. Each is rendered with its kind's synth x `MIX[kind]` x `gain`
x the scene's dB, equal-power `pan`, a send to the effects room (FDN RT60 1.3 s). Unknown kinds are skipped, silent,
with one console warning, and listed in the report (none today).

### v2 kinds (as implemented)

| kind | params used | sound |
|---|---|---|
| `chairSlide` | `dur` (default 1.2), `size` (king's weight) | a carved chair and its king scraping in on stone: two legs' stick-slip through wood, grit, the weight's rumble; from far (dark) to near, slowing, the slips coarser as it stops |
| `chairStop` | `size` | the legs catching: a thud on stone, the wood knocking, a small bump as the king settles, a short seat creak |
| `keyTurn` | `size` | a big iron key: in (gritty slide), the turn (a grinding twist, 3 ward clicks), the bolt's deep clunk (~0.55 s) |
| `lockOpen` | — | the shackle springs: a hard steel "ka" and two knocks on its stop |
| `lockShut` | — | a padlock snapped shut: "ka-da" (also what `click {who:'US'/'CN'}` becomes) |
| `lockDrop` | `size` | a heavy padlock onto the wooden table: "dang" (the lock's body rings dark), two bounces, the shackle rattling |
| `sticker` | — | the backing peeled (a quick dry rip), slapped flat on iron: "pa"; nearly identical every time (the gag) |
| `lidSlam` | `size` | the iron lid banged shut: thump, the box clanging dark, the hasp rattling |
| `lidBurst` | `size` | the lid punched open from inside: "beng" (a boom inside iron, the box ringing torn), rivets flying, the light escaping as a hiss; stereo |
| `lidCreak` | `dur`, `size` | a long uneven iron hinge groan with the lid's body answering |
| `chains` | `dur`, `size` | size < 0.75: links rattling on/off the box, a slither, last links settling; size >= 0.75: a heavy chain running out through a hawse with its jolt |
| `jokerHum` | `dur`, `pitch` (0 = A1), `size` | the joker's tone: partials a little off the harmonic series (slow beating), a moving vowel (o -> a: a grin), an occasional suppressed chuckle (3-5 quick pulses), a sub-octave, a faint glassy fizz; stereo, the sides drifting |
| `giantBreath` | `who` ('CN' a little deeper), `dur`, `size` | a slow inhale, a held moment, a long exhale through a cavern of a throat, a low growl on the exhale |
| `giantEyes` | `who` (CN F1, US E1), `dur` | a low swell of two beating tones, the glow fizzing |
| `sealSwing` | `dur` (0.9), `size`, `pan` | a huge low whoosh passing across (panned), the chain clinking faster, the pivot creaking |
| `deal` | `dur` (flight) | a thin spinning "sou" and a soft landing "da" at `dur` |
| `stringsDrop` | `dur` | threads letting go: a faint high release and shimmer (no glide), tiny soft ticks as they settle |
| `flyUp` | `dur` | a flick, then a spinning swish climbing while it recedes |
| `absorb` | `dur`, `size` | the king breathing a card in (a cavernous inhale, accelerating), a deep "thoom", a golden hiss |
| `clockTick` | `size`, `pitch` (tick/tock; 0 = by video frame) | the brass turn clock's escapement, identical every time |
| `clockRing` | `dur` (0.6) | the turn clock's alarm: a clapper between two small bells, the clock rattling |
| `oldClock` | `pitch` (0 tick / 1 tock) | the heavy long-case clock: wooden tick-tock, escapement, the case answering |
| `breath` | `dur`, `size` | a king breathing heavily asleep: nasal inhale, long exhale with a soft snore |
| `tear` | `dur` | cloth ripping in spurts (a city peeled off the map) |
| `glow` | `dur`, `size`, `pitch` | the gold light: a soft deep "vwoom" blooming and widening, a faint shimmer |
| `leak` | `dur`, `size` (locks gone / 5) | gold seeping from the seam: a fizz swelling into a short low glow, louder and lower as more locks are gone |
| `cigarDrop` | — | three or four cigars tumbling onto the table, ember sparks |
| `cardCloud` | (made by `prepareEvents`) | the race's cards streaming up as one granular texture |

### v1 kinds (kept)

`tick throw slap stamp cover relay string creakS lighter puff clink flaps crackG ash buzz alarm click strain storm
whoosh switch creakL slam stone pulse chips press pop jam topple creakT fold thud chipflow seal crunch groan snap
collapse avalanche blink hang gate cart kiln brick reel zip brush bomb point books heart lever clank crumble crackle
boomL paper tornado flatten tilt flick kingbomb wave` — as in v1 (`slam` is a war drum plus the card's slap; `tick`
the AI's paper-edge snap; `heart` lub-dub; `alarm` starts the siren ambience).

## Mix and master

- **Rooms**: music (war room, RT60 2.4 s), effects (RT60 1.3 s), the march (its own stone room, RT60 2.5 s),
  the siren (far end of the stone room, RT60 3.2 s, mostly wet).
- **Carved silences** (after the rooms): 2-20/2-21, 2-23 after its first 0.7 s, 3-02 .. 3-06, 4-06, 4-10 .. 4-11
  (the fanfare cut dead), the power layer under the march; chunks pulled / cut dead at 6-08, 9-01, the pair.
- **Gates** (`gates()`): 9-03.02, 9-03.04, 9-05 (3.5 s), 12-01 are **exact digital zero** (1.5 ms ramps outside).
- **Hum**: 50 Hz (+100/150/200/250, a fan's breath) from nothing (1-01) to the hard cut; off from 9-05 until the sub
  swell; it becomes the organ in M10 and again in the race.
- **Master**: 26 Hz high-pass, mono below 110 Hz, gentle tone EQ; **staging on a fixed reference**: the march over
  7-10 lands at `REF_LUFS` (-10.8 pre-glue), so no single hit moves the film; glue (-12 dB, 1.4:1); the **wall drives**
  (`wallDrives()`: soft tanh saturation, crossfaded: 2-19, 2-22 (+0.6 s of 2-23), 4-05, 8-01 .. 8-02, the three 9-03
  walls) so the short walls are dense, not peaky; a streaming true-peak limiter; normalized to **-1.2 dBTP** (0.2 dB
  under the spec: ffmpeg's oversampler reads ~0.1 dB hotter than ours).

## Measured (final render, the director's 4 028 events)

| | |
|---|---|
| integrated / LRA | -13.7 LUFS / 16.0 LU (ffmpeg ebur128: -13.7 / 16.1) |
| sample / true peak | -1.2 dBFS / -1.2 dBTP (ffmpeg: -1.1 dBTP) |
| limiter, deepest | -7.8 dB (1:55.7, the frenzy's slam bursts); glue 3.2 dB |
| clicks / gates | 0 / all four exact zero |
| struck tones in the music | 0; melodic struck runs in the mix: 0 |
| determinism | two renders bit-identical; `renderScoreAsync` = `renderScore` bit for bit; 44.1 kHz clean |

Walls (SCRIPT.md, the loudest 3 s window, >= -12 LUFS-S): 2-19 -10.3 · 2-22 -11.2 · 4-05 -10.2 · 4-11 -11.3 ·
6-07 -9.4 · 8-01 -10.8 · 9-03 -9.2 · 9-07/9-08 -10.7. Holes (<= -40): 6-08 -42.7 · 8-03 -42.6 · 9-06 -43.2 (up to
the sub swell) · 11-01 .. 11-04 -43.0 (max LUFS-S) · 9-05 exact zero. Every hole shot of shots.txt <= -40 (1-01
-42.3), every wall shot >= -12 (own mean). The march over 7-10: -11 LUFS, flatness 0.7 dB.

More than 6 LU off a light/medium class, by design: 2-23 (the 2-22 wall rings into its first 0.6 s), 8-02 (the
burst's skip is part of its wall), 7-11/7-12 (the last locks' "dang" in a light shot), 4-08 (the fanfare still
blowing), 7-08 (three relays in 0.25 s), 11-09 (the "da-da-da" in the black, -21.7).

## For the director

- Preferred kinds (both already handled by remaps): `lockShut` for the boxes' padlocks (now `click {who:'US'|'CN'}`),
  `oldClock` for the room clock (now `tick {who:'clock'}`).
- The puppet throws/slaps run through 8-02 .. 8-05 (~24 a second); the mix pulls them far back in the frozen world
  and the hole. If the picture freezes those arms in 8-02, dropping the events there is cleaner.
- 11-05's double "da" is two `slam`s (war drums); the shot list asks for a dry double "嗒": `slap` with size 1 would
  be drier, if wanted.
- Long events crossing shots (`jokerHum` 8-03 .. 9-01, `chipflow` 1:12 .. 1:42, `jam` 2-19 .. 2-22) are shaped by
  `levels()`: if their times change, the shapes follow CUES, but tell sound.

## Known limits

- Nobody here can listen: every level is a measurement (the walls and holes are met by the numbers above).
- The 0.6 s and 0.15 s walls (2-22, 8-01) reach -12 LUFS-S only by spilling ~0.6 s into the next shot and by the
  master's saturation.
- The march's beat count (24) assumes the burst stays ~11.3 s after the cigars; the tempo refits to the real gap.
- The longest async step is ~110 ms (the page can stutter once or twice during the render).
