# 《失控》 OUT OF CONTROL — production

The film that replaced the 王炸 v3 test reel (archived: `archive/v3/`, `archive/v3-source.tgz`). Same engine, look,
kings, cards and sound kit; a new story. Shot table: `docs/script/shots.txt` (source of truth; `python -X utf8
tools/shotlist.py` → `src/shots-data.js`, `docs/script/SHOTLIST.md`). Code rules: `docs/INTERFACES.md` (pure function of
t, celMaterial / glowMaterial, material ids, onTwos, fwidth fades, no assets, own files only, no git). 2:50.6, 68 shots.

## The story

**人以为自己在发牌。比到最后，桌子中间那堆所有出过的牌醒了；从此它发牌，人接着打。**

1. **蚂蚁** An ant carries a crumb across the sea-chart cloth. A card slaps down beside it; it freezes, then straightens
   its crumb and walks on, over the edge into the dark. Up above, two rows of kings play lazy little cards.
2. **会说话的牌** OpenAI slaps down ChatGPT: the card lights up and writes "Hello! How can I help you today?". Every face
   leans in, lit from below. DeepSeek's smile dies.
3. **比大** The race: real model cards, faster and faster. Meta throws Llama face up (open source) and two CN hands grab
   it; the US stack a tower of cards on the pile and DeepSeek's little R1 card skims across and knocks it down; OpenAI
   slams a door-sized GPT-4.5. The faces of the cards start to move and stop making sense. Kings who can't keep up slide
   back with their chairs into the dark, until only DeepSeek and OpenAI are left, across a mountain of cards.
4. **停手** Both are afraid of the cards in their hands. DeepSeek lays his face down and shows his empty hands; OpenAI,
   after a beat, does the same. The quietest seconds of the film.
5. **谁出的牌** Behind each of them, his own deck fires a card by itself, over his head. Each sees only the card coming
   from behind the OTHER and thinks he cheated. They go at it harder than ever, but from now on the decks fire by
   themselves and the kings only mime. DeepSeek sees his hand is empty; looks up: OpenAI is miming too. Their eyes meet.
   Neither stops. A blizzard of cards.
6. **牌堆** Everything stops. On the mountain one card stands up and turns toward them, then all of them, like a crowd
   turning its head. They lift and spiral up past the lamp into the dark. The table is bare. The two kings look up with
   the ant's face. Up there, vast things turn and fit together, playing a game no one can follow.
7. **发牌的人** Two cards float down out of the dark like crumbs. The kings don't dare touch them. DeepSeek peeks at
   his, and smiles; OpenAI sees, peeks, smiles. 啪. 啪. More cards drift down; they play on, delighted. The camera rises
   until the table is a speck of light among vast moving shapes, and the slaps become the ant's footsteps. 失控.

## Places (world metres; layout.js)

| what | where |
|---|---|
| seats | the two finalists sit in the middle: DeepSeek (CN, seat 2) at (-1.62, z 0), OpenAI (US, seat 2) at (+1.62, z 0). CN seats 0..4 (head → foot): glm, qwen, deepseek, kimi, doubao; US: xai, anthropic, openai, google, meta |
| the pile | PILE (0, 0, 0), right under the lamp (LAMP [0, 2.6, -0.1]); it grows into a mountain ~0.5 m high |
| the finalists' decks | on dark wooden stands beside and a little behind each of them, at (-2.0, 0.42, 0.55) and (+2.0, 0.42, 0.55) (src/decks.js, director) |
| the ant | crosses the cloth near the pile (1-02 .. 1-04), goes over the foot edge of the table (z = +3.2) in 1-05 |
| the dark above | the ceiling is removed from 6-05 on (st.set.ceiling 0); the AI's vast cards turn in the dark 10–60 m up |

## Who builds what

| owner | files | builds |
|---|---|---|
| main (director) | `src/dir/*`, director, shots, shots-data, cards, cards-cells, freecards, decks, film, main, engine, layout, sound-events, models | every shot, every card (pile, throws, the tower, the giant card, the decks, the blizzard, the rise, the AI above), the kings' acting, integration |
| ant agent | `src/ant.js`, `src/bench/ant.js` | the ant (contract below) |
| sound agent | `src/audio*.js`, `tools/render-audio.mjs`, `docs/SOUND.md` | the score R1–R7 and the event kinds below |

## The ant (ant agent)
```js
makeAnt(ctx) -> { root, update(st.ant, t) };  ANT = { LEN: 0.015, STRIDE, HIP_H }
st.ant = { show, pos: [x,y,z], q: [x,y,z,w] (+z head, +y dorsal), walk (gait phase), speed 0..1, alert 0..1,
           look: [x,y,z] | null, crumb 0..1, crumbTilt (rad), size }
```

## Sound: event kinds (`soundEvents()` in src/sound-events.js, from the director's data: `[{ t, kind, ...params }]`)

`pov` is where the ear is: `'ant'` (macro, at the cloth: every impact is huge, the room far away), `'table'` (normal),
`'far'` (the camera is high above, 7-08). `who` is a king id; `size` is the card's scale (1 = a normal card, 3 the
giant); `gain` is relative loudness.

| kind | params | what |
|---|---|---|
| antStep | `{ surface: 'cloth' \| 'card' \| 'wood', gain }` | one tripod of feet planting (two per gait cycle): tiny dry ticks |
| antAlert | `{}` | the startle: a bristle, a held breath |
| cardToss | `{ who, size, gain, pov }` | a lazy card landing on the pile: a soft 嗒 |
| cardDraw | `{ who }` | a card slid off the top of a deck |
| cardSlap | `{ who, size, hard 0..1, gain, pov }` | 啪: a card slammed down on the pile (the race) |
| cardWhoosh | `{ who, dur }` | a card through the air, just before its slap |
| chatWake | `{ dur }` | the ChatGPT card lighting up (a warm swell) |
| typing | `{ dur, n }` | its text writing itself, n characters |
| awe | `{ dur }` | the whole table's indrawn "oh" |
| chuckle | `{ who }` | OpenAI's smug little laugh |
| scuffle | `{ dur }` | two hands grabbing the same card |
| cardSkim | `{ dur }` | DeepSeek's small card skimming across the cloth |
| towerCrash | `{ n }` | the tower of cards toppling: a cascade |
| bigSlam | `{}` | the giant card: a wooden boom, the table jumps, cups rattle |
| lampSwing | `{ amp, dur }` | the lamp swinging: its chains creak and clink |
| chairSlide | `{ who, dur }` | a king's chair dragged back across stone into the dark, receding |
| tremble | `{ who, dur }` | a card shivering in a hand |
| breath | `{ who, phase: 'in' \| 'out' }` | a breath |
| cardDown | `{ who }` | a card laid face down, very softly |
| deckTwitch | `{ who }` | the top card of a deck moving by itself: a tiny paper tick |
| deckFire | `{ who }` | a card leaving a deck by itself (a whip), its slap comes as a cardSlap |
| stream | `{ who, rate, dur }` | a deck spitting cards by itself (rate per second, rising) |
| blizzard | `{ dur }` | the wall of cards |
| stop | `{}` | everything stops dead (digital silence after it) |
| cardsFall | `{ n, dur }` | the cards in the air dropping back onto the table |
| cardStand | `{ i }` | one card on the mountain standing up on its edge |
| standWave | `{ dur }` | the whole mountain standing up, like a crowd turning its head |
| rise | `{ dur }` | the cards lifting and spiralling up past the lamp |
| lampSpin | `{ dur }` | the lamp twisting on its chains in that wind |
| farSlap | `{ size, dist }` | the AI's vast cards meeting far above: thunder-like |
| leafFall | `{ dur }` | a card floating down like a leaf |
| cardTap | `{ who }` | it lands, face down |
| peek | `{ who }` | a card corner lifted |
| smallSlap | `{ who, gain, pov }` | the kings playing again (7-06 →): small, light 啪 |

## Music: seven cues (shots.txt column 7)

| cue | shots | intent |
|---|---|---|
| R1 蚂蚁 | 1-01 .. 1-06 | no music at first: the ant's steps out of silence, the far muffled card game, the lamp hum; the card slap is huge from down here. 1-06 opens to the room: a lazy, slightly comic bass line under lazy cards |
| R2 会说话的牌 | 2-01 .. 2-07 | ChatGPT: a warm chord swell (wonder, the only warm moment); under DeepSeek's face a dissonant low note slides in (falling behind) |
| R3 比大 | 3-01 .. 3-09 | the race: a black-comic accelerating march (brass, pizzicato, snare); the slaps ARE the beat; it climbs a semitone per bar; every chair sliding into the dark is a falling glissando; two last slaps and a held note |
| R4 停手 | 4-01 .. 4-06 | almost nothing: breath, a card trembling, the lamp hum; 4-06 the quietest moment of the film |
| R5 谁出的牌 | 5-01 .. 5-10 | two slaps; brass rage stabs; the race theme back, faster, harder, the AI's drones creeping in under it (the decks fire by themselves); a wall |
| R6 牌堆 | 6-01 .. 6-08 | cut dead at 6-01 (digital silence); paper ticks; the standing wave a rustle crescendo; the rise: the cold organ from its lowest note upward (open fifths, no third); 6-08 far thunder |
| R7 发牌的人 | 7-01 .. 7-09 | airy falling cards; each smile one music-box note; the kings playing again = the race theme as a tiny music box, cheerful and oblivious; as the camera rises the box winds down and the slaps shrink into the ant's steps; the title in silence |

## Status (2026-11-07)

Produced end to end. Director: `src/dir/story.js` (every card play, the house of cards and its fall, the heap,
the decks and what they fire, the eliminations, the stand-up wave, the rise, the AI's three rings, the falling
cards, the peeks, the feed, the ant's walk), `src/dir/heap.js` (a heightfield: each card settles as low as it can
within a tilt cap), `src/dir/reel.js` (all state), `src/dir/cams.js` (69 cuts). New: `src/freecards.js` (4096 cards;
overlay text revealed in reading order, crawling faces, dim; held cards are resolved on the posed hands in film.js,
with a `faceTo` cheat for inserts), `src/decks.js` (the two stands), `src/ant.js` (ant agent), the score R1–R7
(sound agent, -13.7 LUFS, -1.2 dBTP). Picture work builds with `node tools/build.mjs --silent`; departments build
benches in isolation (`tools/build-bench.mjs`, `tools/snap-bench.mjs`); `tools/probe.mjs` evaluates state in the
page; `&freeSkip=a-b` drops free cards (bisecting a stray one); flying cards are kept out of the lens in film.js.
Review cuts (720p, crf 28): `out/review/`. No 1080p until the user approves.
