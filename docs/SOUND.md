# 《喂》 FEED (v5) — sound (temp score)

Everything is synthesized in plain JavaScript (no samples), deterministic (two renders bit-identical).
`renderScore(sampleRate)` in `src/audio.js` renders the whole film (1:59.1) from the director's `soundEvents()`
(`src/sound-events.js`) and `CUES` / `ROW`. **Nobody has listened to this: every level is a measurement, pitches were
checked by spectral peaks.**

```
node tools/render-audio.mjs [--test] [--twice] [--cues] [--stems] [--no-spec] [--kinds]
  out/score.wav, out/levels.txt, out/score-spec.png
```

## Files

| file | what |
|---|---|
| `src/audio.js` | the render: chunks (per cue; R1, R4, R5, R6 split where the sound drops out), groups and rooms, the two vacuums, the hum, the master |
| `src/audio-music.js` | the score: `TUNE`, `tierOf` (a machine's voice by its height), `beatsOf`, `SCORE.R2, R3, R4a, R4c, R5a, R5b, R7` |
| `src/audio-sfx.js` | `MIX`, `SCENE` (dB per kind per row), `prepareEvents`, `scoreEvents`, event rendering, the hum |
| `src/audio-kinds.js` | one synth per event kind (`FILM_KINDS`; the v5 kinds are the last section; older kinds are kept, unused) |
| `src/audio-voices.js`, `audio-inst.js`, `audio-sfxlib.js`, `audio-dsp.js`, `audio-master.js` | instruments, older synths, DSP, rooms / limiter / meters |

## The one idea

**The machine never changes what it does; it only gets bigger.**

- **`tak {who, size}`** is one two-part gesture (the hammer on its bell, then the card leaving the slot) and every part
  of it is a power of the machine's height: the bell's pitch (D7 on the 0.3 m toy, about 0.6 octave lower per doubling,
  always a D or an A: D2 at 30 m), its ring (0.1 s to 1.3 s), the gap between hammer and card (14 ms to 0.22 s), the
  card's flick (30 ms to 0.4 s of air), a thump under big hammers; from 8 m up it is heard from far below (dulled, in
  the hall).
- **The music is one small tune** (D major, eight-note phrases: A1 A2, then B and an ending). **Every tak is the tune's
  next note, sung by that machine in the voice its size gives it:** music box (0.3 m) → toy piano and a plucked bass →
  pizzicato → low strings → horns and tuba → trombones, tuba, war drums (2.2 m) → the whole orchestra (3.6 m) → the same
  tune four octaves under the music box, slow, organ and everything (30 m). A slow machine's card landing is the
  off-beat (the next note).

## Cue by cue

| cue | sound and music |
|---|---|
| **R1** ant | No music. Steps from nothing; the lamp's hum with the picture; 0.32 s of vacuum (only the card's air), then the slap from the ant's height; everything faded out by the cut to 1-06; the crumb; 1-07 two card slaps in the empty hall. |
| **R2** losing | The K: two plucked low notes and a timpani (a swagger). 2-02 a heartbeat. 2-03 nothing. 2-04 his robe (the score's own `cloth`), the toy set down. 2-05 the music box: a note on each tak and each landing. 2-06 it goes on; a low B-flat slides down to A under the black king. |
| **R3** a bigger one | The black machine comes down with a low thump of the orchestra. Two machines, two voices: music box (red, left) and toy piano an octave lower (black, right). 3-03 the red one's notes sag flat and stop as its spring runs down; black plays on alone. 3-04 a chip, a gulp: red is back, as a toy piano. |
| **R4** feeding | The same tune, each tak in its machine's current voice: lower and heavier at every gulp (a timpani stroke and a small cymbal on each). 4-06 trombones, tuba, war drums, slow: a wall. **4-07** everything faded out by the cut; only the taks and landings, muffled (220 Hz) and far. 4-08 / 4-09 the tune back, held down; a timpani roll into 5-01. |
| **R5** mountains | 5-01 the organ from its lowest note; at the `burst` the tune four octaves down, a note every 0.675 s (the mountains' taks fall on every other note): organ, brass, strings, drums. 5-02 the same, a little under. 5-03 cut: the music box, tiny, same tune, same beat; far cheering. 5-04 the box runs down with the black machine and stops. 5-05 no music: one man cheering. |
| **R6** it did not see | No music. 6-01 one tak. The air pressing down, he is still cheering (both kept through the vacuum), the last card: the loudest 0.4 s of the film (-8.0 LUFS-M). Faded out by the cut to 6-03: the ring; one tak far above; 6-04 a far landing and a tak. |
| **R7** title, credits | The music box alone: the whole tune (32 notes), its own bass tines, slowing into a last D major chord; over 2 s before 8-01. |
| **R8** epilogue | No music. Steps on stone; cloth; the foot (the softest sound in the film); the pressure rising under 8-04, ended at 8-05; one tak. |

## Event kinds (v5)

| kind | sound |
|---|---|
| tak `{who, size}` | above |
| slabLand `{who, size, far}` | 1: a pat on the pile; 2-3: a thump; 5+: a boom, the floor, things rattling; far: thunder a long way off |
| thud `{who, hard}` | wood under brass, the mechanism jingling, its bell jarred; hard: the table jumps |
| clockwork / rundown `{who, dur, size}` | an even tick-tock ratchet and a whirr / the ratchet slowing, a last tooth, the hammer drooping; size 30: slow low knocks and iron groaning |
| pat | a palm on brass, the bell answering |
| chipDrop `{n}` | clay clinks on brass, the funnel ringing, a rattle down its throat |
| crownLift / crownDrop | a small ring of gold / a clang, the funnel ringing, it rattles down |
| gulp `{size}` | a throat closing and opening, then the swell: metal stretching, air drawn in; lower and longer with size |
| creak | the table's wood, slow stick-slip |
| burst / grow | a deep crack, stone raining, timbers, air / rumble, iron groaning lower, stone trickling |
| cheer `{who, far}` | open-mouthed whoops and short laughs (synthetic voice: the least convincing sound here); far: tiny, thin |
| ringRoll | a ring rolling, then spinning down like a coin |
| cloth / footDown | a swish of heavy cloth / the softest pad and a grain of grit |
| antStep `stone` | the same three ticks, harder, a hair of ring |
| kept | cardWhoosh, cardSlap, crumbRoll, lampSwing, chuckle, pressure, endSlam |

## Mix

Pans: heart (red king and machine) left, spade right; the mountains nearly centred. Vacuums: the ant's slap and the last
card. Rooms: the hall; a vast one from 5-01. Hum: gone when the hall breaks. Master: staging on 5-01, glue, walls driven
(4-06, 5-01, the last card), true-peak limiter at -1.2 dBTP. No digital-zero gates (no row plans loudness 0).

## Measured (2026-11-09, the director's 333 events)

Integrated -16.6 LUFS (ffmpeg agrees), true peak -1.2 dBTP, no clicks, two renders bit-identical. 50 of 52 cuts in
their planned class; every ROW in class except **6-02** (wall): mean -13.8 LUFS, 1.8 LU short, because the card lands
1.5 s into a 2.4 s shot (the hit itself is the film's loudest moment). The first cut of the 4-02 montage is -24 (the
row as a whole -19.7, in class).
