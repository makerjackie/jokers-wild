# 《失控》 OUT OF CONTROL (v7) — sound

Everything is synthesized in plain JavaScript (no samples), deterministic: two renders are bit-identical, and so is the
async render. `renderScore(sampleRate)` in `src/audio.js` renders the whole film (2:36.2) from the director's
`soundEvents()` (`src/sound-events.js`) and `CUES` / `ROW`. No second is hard-coded, so after a picture retime you re-run
the tool. The base is the v3 score (commit `74e8244`: its kit, its theme, its R1–R4 and R6–R8 cues), with R5 rebuilt and
R9 new. The 《喂》 v6 kinds are still in `audio-kinds.js`, but this film does not use them.

```
node tools/render-audio.mjs [--test] [--twice] [--async] [--cues] [--stems] [--no-spec] [--kinds]
  -> out/score.wav (48 kHz 16-bit), out/score-spec.png, out/levels.txt (every shot vs shots.txt's loudness column,
     the gates, the vacuums, the limiter, a click scan, ffmpeg ebur128)
```

## The idea

One theme: the kings' race theme, eight beats, D E F D | E C# D A. **Every beat is a card slapped down.** The kings'
music has a third and the AI's music never does: the AI gets drones (D against E-flat) and an organ in open fifths.

## Cues

| cue | music |
|---|---|
| **R1** 蚂蚁 1-01..1-07 | No music: the ant's steps out of the black, the far game through the wood, the vacuum and the slap from the ant's height. 1-07: the theme played lazily on a tuba. |
| **R2** 横空出世 2-01..2-09 | A thin high A held while OpenAI taps, cut at the ChatGPT slap (a B-flat tutti hit under the blast). 2-08: silence, then the warm B-flat chord. 2-09: a low A slides in under 大肥鱼. |
| **R3** 争第一 3-01..3-07 | The race on the hero slaps, a semitone higher every bar; the skim and the smash; half a beat of silence; the crescendo, the vacuum, the GPT-4.5 tutti hit. Its ring (shortened in v7) dies under the board. |
| **R4** 提示 4-01..4-05 | A heartbeat on D, then the theme played lightly on the dings and slaps. |
| **R5** 托管 5-01..5-11 | **The turn.** 5-01: hands that can't keep up (a snare and timpani roll, strings and horns straining on A), a breath of nothing, then **the 托管 slam as release**: a D-major tutti exhale. Then the theme **in major, smug**, on the beat of the five hands (5-04's five slams = five stabs climbing D F# A D F#, a crash on the last). 5-05: the march far behind; **one horn note hanging** (G over D), sagging as Meta pulls back. 5-06..5-08 **cold**: the march gone; R4's heartbeat, which stops at 淘汰; each 淘汰 a low E-flat (timpani, muted brass, a high string cluster); each chair a falling glissando into the dark; string harmonics and the organ's low D at the edge of hearing. 5-09: nothing, then the laughs pick the theme up (three pizzicati, a tuba A). 5-10: the flock, the theme tutti in major on the slap grid, **a semitone higher every bar over drones that do not move**. 5-11: the third drains out (minor melody, open-fifth chords), the orchestra thins to pizzicato and snare, the drones and a Shepard riser grow (the strange hum). |
| **R6** 底牌 6-01..6-09 | The drones and a low organ under the red cards; the dead keys; two flutter-tongued brass roars on `rage`; 6-08 one beat of silence; 6-09 the wall, **cut dead** at `stop`. |
| **R7** 眼睛 7-01..7-05 | 7-01 exact zero. Then the cold organ from its lowest note upward (D A E, no third), full at the eye, thinning before 8-01. |
| **R8** 结尾 8-01..8-06 | Three music-box notes at the smiles (D6 E6 F#6, unfinished); the shadow's low swell; the vacuum; the end slam (the biggest hit, D, no third), faded out by the title. |
| **R9** 片尾 9-01..9-03 | 9-01: 1 s of exact black, then **the music box finishes the theme** under the title and the credits: 16 notes at about 74 bpm in D major, a half close on A, then home on D, slowing at the end. It rings out before 9-03. 9-03: exact black, **the creditSlap** alone and dry, then exact zero to the end. |

## New kinds in v7 (`audio-kinds.js`, end of file)

| kind | sound |
|---|---|
| hesitate `{who}` | a sleeve rustling out, a short held nasal breath, the sleeve coming back slower |
| eliminated `{who}` | 淘汰: the game's flat verdict (two dull tones a tritone apart, A3 then E-flat3), then the panel dying (a click, a falling whine, a fizz) |
| dragOut `{who, dur}` | nails across the linen catch on the table edge and slip off ("tk"); the weight lurches; two heavy oak legs judder on stone, one leg squealing; it all recedes (low-pass closing, panned outward); big room (the dark) |
| errorAlarm `{who}` | now the lying attack warning: a calm, official chime (A6→D6, a fifth, no third) twice, over a steady piercing A5 pulse at 6/s and a low throb. Polished, not a crash |
| creditSlap | the last sound: a breath of air, then palm, crack and a short table thump. Zero room send |
| chuckle | the v3 nasal "hn-hn-hn" again (FEED's horn laugh is no longer used). The group of seven in 5-09 is at -4 dB |
| autoOn | unchanged synth; 5-01 and 5-03 at +2 dB. 5-04's five land on the march's beat |

## Mix

`MIX` / `SCENE` / `HUSH` / `levels()` live in `audio-sfx.js`.
- **HUSH 5-05..5-09:** we are with the holdouts, so the auto game (autoPlay, slaps, flips) is pulled back -9 / -10 / -10 / -10 / -13 dB. The holdouts' own sounds and the chuckles are kept.
- **3-07:** the GPT-4.5 card's ring is pulled back under the board (-7 dB automation), and the ten simultaneous slaps are at -7 dB.
- **6-04:** cancelPress at 0 dB, and the drones' swell under the dead keys is smaller.
- **Vacuums:** before the ant's slap, the giant card and the end slam.
- **Master:** 26 Hz high-pass, mono below 110 Hz, tone EQ, staging (3-06 + 3-07 to -11 LUFS pre-glue), glue, the walls driven, a true-peak limiter at -1.2 dBTP, then the gates.

## Gates (exact digital zero, every bus and the hum)

| gate | from | to |
|---|---|---|
| 7-01 the cut | the `stop` event | 7-02 |
| 9-01 the title in black | 9-01 | +1.0 s (`TITLE_HOLD`), then the music box |
| 9-03 before the last card | 9-03 | `creditSlap` − 0.05 s (its air pre-roll) |
| 9-03 after the last card | `creditSlap` + 0.55 s | the end |

The R8 chunk fades to nothing by 9-01. The R9 chunk (the box and its room) fades over 1.2 s into 9-03. The creditSlap is
alone in its own END chunk.

## Measured (the director's 1574 events, 2026-11-10)

| | |
|---|---|
| integrated / LRA | **-16.3 LUFS** / 16.3 LU (ffmpeg ebur128 agrees) |
| sample / true peak | -1.2 dBFS / **-1.2 dBTP** |
| limiter, deepest | -5.4 dB (0:20.2, the ChatGPT slap; 0:37.6, the smash); glue 4.6 dB |
| shots in their loudness class | 72 / 75. **Off:** 2-05 wall -2.2 and 3-03 wall -1.1 (the same misses as v3); 9-03 -6.3 (one dry slap in 2.6 s of black: its mean can't reach "loud" unless it gets louder than the end slam. Its momentary max is -14 LUFS, and the limiter takes at most about 3 dB off its peak) |
| act 5 | 5-01 -25 / -16 (the release), 5-02 -18, 5-04 -16..-18, 5-05 -24.5, 5-06 -25, 5-07/5-08 -17 (the chairs), 5-09 -27, 5-10 -14.6, 5-11 -15.4 |
| act 9 | 9-01 / 9-02 -41.7 (box, momentary max -37), 9-03 the slap |
| gates | all four exact zero; click scan clean |
| determinism | a second render and renderScoreAsync are both bit-identical |

**Not verified (nobody here can listen):** whether the smug major march sounds smug rather than cheerful; whether the
dragOut squeal hurts or just grates; whether the attack chime reads as "lying"; whether the music box at about -42 LUFS
can be heard on a phone. `--test` (the stand-in list) renders without errors; its levels mean nothing.
