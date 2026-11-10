# 《喂》 FEED (v6) — sound

Everything is synthesized in plain JavaScript (no samples), deterministic (two renders bit-identical; the async render
too). `renderScore(sampleRate)` in `src/audio.js` renders the whole film (3:00.9) from the director's `soundEvents()`
(`src/sound-events.js`) and `CUES` / `ROW`, so a retimed picture is re-scored by running the tool again.
**Nobody has listened to this: every level is a measurement; pitches were spot-checked by spectral peaks.**

```
node tools/render-audio.mjs [--test] [--twice] [--async] [--cues] [--stems] [--no-spec] [--kinds]
  out/score.wav, out/levels.txt (every row against its planned loudness), out/score-spec.png
```

## Files

| file | what |
|---|---|
| `src/audio.js` | the render: chunks (per cue, split where the film drops to silence), groups and rooms, the two vacuums, the lamp's hum and the machines' mains buzz, the master |
| `src/audio-music.js` | the score: `TUNE`, `tierOf` (a machine's voice by its height), harmony modes, `beatsOf`, `SCORE.R2 .. R9` |
| `src/audio-sfx.js` | `MIX`, `SCENE` (dB per kind per row), `levels()`, `prepareEvents`, `scoreEvents`, event rendering, the hum |
| `src/audio-kinds.js` | one synth per event kind (`FILM_KINDS`; v5's and v6's are the last two sections; older kinds kept, unused), the kings' voices |
| `audio-voices.js`, `audio-inst.js`, `audio-sfxlib.js`, `audio-dsp.js`, `audio-master.js` | instruments, older synths, DSP, rooms / limiter / meters |

## Three ideas

1. **The machine never changes what it does; it only gets bigger.** `tak {who, size}` is one gesture (the hammer on
   its bell, then the card leaving the slot); the bell's pitch (D7 on the 0.3 m toy, D2 at 30 m, always a D or an A),
   its ring, the gap between hammer and card and the card's flick are all powers of the machine's height.
2. **One small tune, and the machines play it.** D major, eight-note phrases. Every tak is the tune's next note, in
   the voice of that machine's size: music box → toy piano → pizzicato → low strings → (the hall dark) cellos, basses,
   soft trombones, tuba → trombones, tuba, war drums → at 30 m organ and everything, four octaves under the music box.
   **It goes wrong as the kings lose it:** right until the dead kings' crowns are fed (5-09: B-flat under the tonic,
   the first wrong harmony); minor from the moment the machine takes for itself (6-02); the mountain plays it in minor
   over a Neapolitan bass. The credits give it back whole, in major, on the music box alone.
3. **No human voice.** Every vocal sound a king makes is his own brass instrument through a plunger mute (a "wah"
   whose pitch bends): heart a trumpet, spade a trombone, diamond a cornet, club a euphonium; one timbre per king,
   always. Chuckles, the cut-off cry of a man dragged out, the grunt at the key, "stop!" (a pick-up and a hard falling
   note, again and again, faster and higher), the cheer (whoops, laughs, and the tune's first three notes as a fanfare).

## Cue by cue

| cue | sound and music |
|---|---|
| **R1** ant | No music. Steps from nothing; the lamp's hum with the picture; 0.32 s of vacuum, the slap from the ant's height, all faded out by the cut; the crumb; 1-07 only the room (no card events there). |
| **R2** the rule | No music. Each card: a slap, then the lamp leaning (chain creak, clinks, a low swoosh of light toward that king). 2-02 the chain settling (the score's own). 2-03 the light slides off the club king (a falling sweep, a held breath) and a heartbeat quickens until his chair goes: the jolt, the scrape receding, his euphonium's cry cut off; the crown spins down like a coin. Only when it has stopped: **one low held D**, at the edge of hearing. |
| **R3** auto | The low D holds; the heartbeat again as the dark reaches the red king; 3-03 only the note. It lets go as he brings out the toy. 托管: a click, the spring's answer, a small rising chime, the ratchet. **First tak: the tune begins**, music box, a note on each tak and each landing. 3-07 a low B-flat slides to A under the black king. |
| **R4** the one without a machine | The black machine comes down with a low thump of the orchestra; from its first tak two voices (music box left, toy piano right). The lamp's small leans are a soft chain tick, lower to the left, higher to the right. The diamond king's slap: the music ducks 12 dB for 0.8 s after it (the lean that does not come). He is dragged out (his cornet's cry) and **the tune does not notice**. 4-05 two brass chuckles; the red machine's notes sag as it runs down. |
| **R5** feeding | The low D and the heartbeat on the red king until his first chip; then the tune fed, heavier at each gulp. **5-05** everything faded out by the cut; only his robe, and the machines muffled and far. 5-06 low strings, the table groaning. The plugs: a spark, a low sforzando, a high harmonic sagging away; the lamp's hum dims and the machines' mains buzz comes up and stays; the tune loses its top. 5-09 the first wrong harmony. |
| **R6** no taking it back | 6-01 the tune far down. 6-02 the funnel takes the chip: minor from that swallow. **6-03** the music is taken away (-24 dB): the same click as 托管, dead, harder and harder, the taks going on in tempo. 6-04 the key (steel groaning, his trumpet's grunts). 6-05 / 6-06 each crown: a tremolo cluster swelling with the funnel's breath, a hit of the dark orchestra on the swallow. 6-07 a roll and a swell, then the machines land on the floor: D minor with its E-flat, held. 6-08 the tune in trombones, tuba, war drums. |
| **R7** mountains | 7-01 the funnels eat the hall; the organ from its lowest note; at the `burst` the tune four octaves down, minor, a note every 0.675 s (the mountains' taks fall on every other one): the biggest music of the film. **7-03** cut to nothing: far, muffled taks and two tiny horns. 7-04 the low D under the starving machine and the trombone shouting at it. 7-05 the trumpet's shout stops; **1.0 s of real silence** (music, effects and rooms carved to nothing); then the trumpet cheers. 7-06 trumpet cheering, trombone shouting: no music. |
| **R8** it did not see | 8-01 one tak. The air pressing down, both horns still going (kept through the vacuum), the last card: the loudest 0.4 s of the film. All faded out by the cut: the spectacles (a thin hiss of wire on card, three rocks). 8-04 two taks far overhead. 8-05 a low pedal (D and A, organ and basses), far booms, his chair pushed back. 8-06 faded to black; one tak, far. |
| **R9** title, credits | The music box alone: the whole tune in major (32 notes), its own bass tines, slowing into a last D major chord; over 2 s before 10-01. |
| **R10** epilogue | No music. Steps on stone; cloth; the foot; the pressure rising, ended at the cut; one tak ringing out. |

## Event kinds new in v6

| kind | sound |
|---|---|
| lampLean `{who, amp}` | big: an iron creak, a second smaller one, clinks, a low swoosh of light crossing to that king; small (amp < 0.7): one short creak and a clink, four cached variants (a metronome) |
| lightLeaves `{who}` | a soft falling sweep on his side, a small intake of breath (noise, not voice) |
| dragOut `{who, dur}` | the jolt, two chair legs scraping away and dulling, his horn's rising cry cut dead at 0.4 s |
| crownSpin `{who, dur}` | a clang the cloth swallows, the rim wobbling faster and lower, a flat knock |
| button `{who, mode, hard}` | one click (down, the spring's answer) in both modes; 'auto': then a rising two-note chime (A6 D7 for the red machine, E6 A6 for the black); 'cancel': nothing; harder: a fist with it |
| plugBite `{who}` | brass teeth, crackle, an arc's buzz, the mains hum swelling, the lamp's tone sagging |
| suck `{who, dur}` | a brass throat drawing air, its vowel rising, louder, shut at the end; 'both': the same, enormous |
| keyStrain `{dur}` | steel groaning, the ratchet forced tooth by tooth, two grunts, thrown back: a last grunt and the chair's knock |
| shout / cheer / chuckle | the kings' horns (above); `far`: thin and tiny |
| glassSlide `{dur}` | wire on card, then rocking on its rims, each softer |
| chairBack `{who, dur}` | two slow, heavy pushes of a chair over stone |

v5's kinds are unchanged (tak, slabLand, thud, clockwork, rundown, pat, chipDrop, crownLift, crownDrop, gulp, creak,
burst, grow, pressure, endSlam, cloth, footDown, antStep stone).

## Mix

Pans from `who`: heart front left, diamond back left, spade front right, club back right. Vacuums: the ant's slap and
the last card. Hum: the lamp's 50 Hz from 1-02, dimmed by each plug, gone at the burst; the mains buzz (100 Hz and up)
from the first plug to the burst. Master: staging on 7-01, glue, walls driven (6-07 .. 7-01, the last card), true-peak
limiter at -1.2 dBTP. No digital-zero gates (no row plans loudness 0).

## Measured (2026-11-10, the director's 520 events)

Integrated -16.9 LUFS (ffmpeg agrees), true peak -1.2 dBTP, no clicks. 73 of 75 cuts in their planned class; every ROW
in class except **1-07** (planned 2, measured -48.5: the row has no events, only the room). The first half of 6-07 (the
crescendo) is -13.4; the row as a whole is -11.2. The last card: -6.9 LUFS over its loudest 0.4 s (next loudest: -7.8,
the machines landing in 6-07).
