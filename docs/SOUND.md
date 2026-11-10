# 《失控》 OUT OF CONTROL (v7 score, v9 picture) — sound

Everything is synthesized in plain JavaScript (no samples), deterministic: two renders are bit-identical, and so is the
async render. `renderScore(sampleRate)` in `src/audio.js` renders the whole film (2:35.1) from the director's
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
| **R5** 托管 5-01..5-12 (v9) | **The turn, with a reason: the round timer.** 5-01..5-04: the smug theme **in major, but its beat is the countdown's tick** (`countdownTicks`, shared with the effect): one beat a second at first, faster every round down to the race's top speed, a semitone higher every bar, the orchestra filling in; a heartbeat under 5-03; the last 1.6 s a tremolo-and-snare strain. **Cut dead at OpenAI's 超时**: the buzzer, the board flipping to 2026·11, then his fist on 全托管 = **the release** (a warm D-major tutti exhale). 5-05/5-06: the smug march relaxed, on the followers' beat (their three slams are three stabs climbing D F# A), on through the leaderboard insert (5-07's first cut). From Meta's screen **cold**: a heartbeat that stops at 淘汰; each 淘汰 a low E-flat; each chair a falling glissando into the dark; cold harmonics and the organ's low D. 5-10: nothing, then the laughs pick the theme up. 5-11: the flock, tutti, major, **a semitone higher every bar over drones that do not move**. 5-12: the third drains out, the riser grows. |
| **R6** 底牌 6-01..6-09 | The drones and a low organ under the red cards; the dead keys; two flutter-tongued brass roars on `rage`; 6-08 one beat of silence; 6-09 the wall, **cut dead** at `stop`. |
| **R7** 眼睛 7-01..7-05 | 7-01 exact zero. Then the cold organ from its lowest note upward (D A E, no third), full at the eye, thinning before 8-01. |
| **R8** 结尾 8-01..8-06 | Three music-box notes at the smiles (D6 E6 F#6, unfinished); the shadow's low swell; the vacuum; the end slam (the biggest hit, D, no third), faded out by the title. |
| **R9** 片尾 9-01..9-03 | 9-01: 1 s of exact black, then **the music box finishes the theme** under the title and the credits. The credits are short now (9-02 is 8 s), so it plays the one phrase that comes home: D E F# D E C# A D, about 53 bpm, slowing at the end (the two-phrase version comes back if there is room for 0.7 s a note). It rings out before 9-03. 9-03: 0.45 s of exact black, then **the swat** (creditSlap): hard, close, dry, no tail. Exact zero to the end. |

## Kinds new since v3 (`audio-kinds.js`, end of file)

| kind | sound |
|---|---|
| semiOn `{who}` (v9) | 半托管 on: a soft toggle and a gentle green "assist" chime going **up** (A5, E6, sine-pure). autoOn's confirm goes down |
| countdown `{dur, from, to}` (v9) | the engine of 5-01..5-04: one event; dry digital tik/tok ticks whose period shrinks geometrically from 1 s to 0.03 s (a buzz), a soft low pulse on every fourth tick, a thin rising whine. It **stops dead at the first 超时** (prepareEvents sets `stopAt`) |
| timeout `{who}` (v9) | 超时: a short harsh game buzzer, two square tones a semitone apart (E-flat3 against E3), 0.3 s, flat. Not the attack alarm (that one is polished and sings) |
| screenTap, confirm (v9) | every screenTap from 5-01 on is 半托管's "✓ 确认出牌": the fingertip plus a tiny soft "ack" a fifth up. Thinned in bursts (111 of 157), so they stay a light rubber-stamp rhythm |
| boardFlip `{gain}` (v8) | the AI 智力排行榜, a digital screen, no flaps: a soft UI tick and a short airy slide (a row moving). `chime` (set in prepareEvents from the story's `boardTops()`: the #1 **changed hands**, 58 of 73 moves): a bright little glass chime on top (A6 then E7). `big` (rows where the board fills the frame: 2-03, 2-07, 3-04, 3-07, 4-03, 6-02): five slides cascading across the screen. `dateOnly`: the tick alone. Under 托管 the moves are automated down 7 dB |
| countUp `{dur}` (v8, the score's own) | the holdouts' leaderboard insert (v9: 5-07's first cut): a soft digital ticker speeding up, a bright blip as the auto scores pass "人类 100" |
| creditSlap (v8) | the mosquito swat: no air before it, no room, no tail. A hard crack and palm driven dense, the desk top, a small low thump, all shut within about 0.08 s |
| hesitate `{who}` (v7; not emitted in v9) | a sleeve rustling out, a short held nasal breath, the sleeve coming back slower |
| eliminated `{who}` | 淘汰: the game's flat verdict (two dull tones a tritone apart, A3 then E-flat3), then the panel dying (a click, a falling whine, a fizz) |
| dragOut `{who, dur}` | nails across the linen catch on the table edge and slip off ("tk"); the weight lurches; two heavy oak legs judder on stone, one leg squealing; it all recedes; big room (the dark) |
| errorAlarm `{who}` | the lying attack warning: a calm, official chime (A6→D6, a fifth, no third) twice, over a steady piercing A5 pulse at 6/s and a low throb |
| chuckle | the v3 nasal "hn-hn-hn" (FEED's horn laugh is no longer used); the group of seven in 5-09 is at -4 dB |

Pans come from the cast table in `src/layout.js` (`KING[id].side`, `.seat`): side 'CN' = the left row, 'US' = the right row, seen from
the table's foot; seat 2 (the finalists, Claude left, OpenAI right) at ±0.35, seats 1 / 3 at ±0.5 / ±0.65. No company ids are hard-coded in the score.

## Mix

`MIX` / `SCENE` / `HUSH` / `levels()` live in `audio-sfx.js`.
- **HUSH (v9):** 5-04 -5 dB for everything but the countdown, the 超时, the 全托管 press and the board (the timeout lands in a hole). 5-07..5-10 (the holdouts): the auto game pulled back -10 / -10 / -10 / -13 dB; the 超时s, 淘汰s, chairs, confirm taps, chuckles and count-up are kept.
- **5-07 (two cuts):** on the leaderboard insert the smug march plays on, with the count-up. The cold starts on Meta's screen, the row's second cut. hintDings are -6 / -8 dB in 5-01 / 5-02 (the AI's picks under the countdown).
- **3-07:** the GPT-4.5 card's ring is pulled back under the board (-7 dB automation), and the ten simultaneous slaps are at -7 dB.
- **Vacuums:** before the ant's slap, the giant card and the end slam.
- **Master:** 26 Hz high-pass, mono below 110 Hz, tone EQ, staging (3-06 + 3-07 to -11 LUFS pre-glue), glue, the walls driven, a true-peak limiter at -1.2 dBTP, then the gates.
- **Render tool:** if `sound-events.js` or `dir/story.js` won't load, `render-audio.mjs` stubs both and renders on the stand-in list.

## Gates (exact digital zero, every bus and the hum)

| gate | from | to |
|---|---|---|
| 7-01 the cut | the `stop` event | 7-02 |
| 9-01 the title in black | 9-01 | +1.0 s (`TITLE_HOLD`), then the music box |
| 9-03 before the swat | 9-03 | `creditSlap` − 2 ms |
| 9-03 after the swat | `creditSlap` + 0.3 s | the end |

The R8 chunk fades to nothing by 9-01. The R9 chunk (the box and its room) fades over 1.2 s into 9-03. The swat is
alone in its own END chunk.

## Measured (v9 picture, 2:35.1, the director's 1465 events, 2026-11-10)

| | |
|---|---|
| integrated / LRA | **-16.2 LUFS** / 16.5 LU (ffmpeg ebur128: -16.2) |
| sample / true peak | -1.2 dBFS / **-1.2 dBTP** (ffmpeg's oversampler reads -1.1) |
| limiter, deepest | -5.3 dB (0:20.2, the ChatGPT slap; 0:39.5, the smash); glue 4.6 dB |
| shots in their loudness class | 75 / 79. **Off:** 2-05 wall -2.2 (as in v3); 3-03.01 wall -1.9 (the jab before the card flies); 5-03 +6.3 (the countdown's strain peak, 0.3 over "medium"; I left it there on purpose); 9-03 -6.8 (see below) |
| the swat (9-03) | the v8 synth: sample peak -2.3 dBFS, true peak at the ceiling, momentary max -14.7 LUFS (the end slam: -6.8). An event this short can't read loud on a 0.4 s meter, and more gain only feeds the limiter. By far the loudest thing in the credits, out of exact zero, then exact zero |
| act 5 | 5-01 -20 / -20, 5-02 -20.5 / -18.7 / -17.6, 5-03 -15.7, 5-04 -16.5 (the gap, then the release), 5-05 -17.4, 5-06 -17, 5-07 -21 / -21, 5-08 -17.6, 5-09 -16.8, 5-10 -27.5, 5-11 -15.7, 5-12 -15.6 |
| act 9 | 9-01 -42.7, 9-02 -43.7 (the box, momentary max -37), then the swat |
| gates | all four exact zero; click scan clean |
| determinism | a second render and renderScoreAsync are both bit-identical |

**Not verified (nobody here can listen):**
- whether the smug major march sounds smug;
- whether the dragOut squeal hurts or just grates;
- whether the attack chime reads as lying;
- whether 69 leaderboard chimes are too sweet (most are quiet, under 托管);
- whether the countdown tightens the chest or just nags, and whether the march riding it reads as strain;
- whether the swat startles as much as the end slam while measuring about 9 LU lower;
- whether the music box at -42 LUFS can be heard on a phone.

`--test` (the stand-in list) renders without errors; its levels mean nothing.
