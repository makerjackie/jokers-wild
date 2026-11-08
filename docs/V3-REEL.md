# v3 test reel 「批准 / APPROVED」 — production

v2 (3:23, archived in `archive/v2-source.tgz`, extracted to `archive/v2/`) read correctly but the user felt nothing:
no fear, no shock, no fear of falling behind. v3 changes the point of view and the mechanism. Before rebuilding the
whole film, a ~57 s test reel checks that the feeling lands. Shot table: `docs/script/shots.txt` (the source of truth;
`python -X utf8 tools/shotlist.py` → `src/shots-data.js`, `docs/script/SHOTLIST.md`). Code rules: `docs/INTERFACES.md`
(pure function of t, celMaterial / glowMaterial, material ids, onTwos, fwidth fades, no assets, own files only, no git).

## The idea

**为了不输给对方，两边都把决定交给了一个看不懂的东西；人从出牌的人，变成盖章的人，最后变成了牌。**
(To keep up with the other side, both hand their decisions to something they cannot understand. People go from playing
the cards, to rubber-stamping them, to being cards.)

- **The camera lives at the height of two paper people** (~5 cm) standing on the map cloth: a red one on the CN coast,
  a blue one on the US coast. To them the kings are mountains and every stamp is an earthquake. Later the kings look up
  at the card king the way the paper people looked up at them.
- **The stamp is the loss of control.** A card slides out of each king's press with a red 批准？ tab; the king reads it
  and stamps 批准. The other side stamps faster, so this side must too. The card faces turn into glyphs nobody can read;
  the kings stop looking; the approval rate hits 100 %. Then the cards stop waiting: they fly off before the stamp lands,
  and the stamp hits bare cloth. The kings lean back. Nobody is deciding anything any more.
- **The two paper people make friends across the sea** (the 《打，打个大西瓜》 echo): in the sudden quiet they walk out
  onto the sea and hold hands. Above them the two jokers rise, fly at each other... and pair up: 王炸. The gold floods the
  map. The card king assembles at the throne; it presses every king flat into a court card and fans them in its hand;
  the last card in the fan is the two paper people holding hands. It plays that card onto the pile; the next card covers it.

## Places (world metres; layout.js has the table)

| what | where |
|---|---|
| red paper person's home spot | (-0.56, y 0, -2.02), on the CN coast (sea is \|x\| < ~0.42) |
| blue paper person's home spot | (+0.56, 0, -2.02) |
| where they meet | (0, 0, -2.02), the open sea between the two head kings |
| DeepSeek's proposal card lands | centre (-0.80, 0, -2.22), lying face up, its top edge toward the sea (+x) so the king reads it |
| OpenAI's proposal card lands | centre (+0.80, 0, -2.22), top edge toward -x |
| card presses | `pressPos(id)` as before; cards slide out of `pressOut(id)` |
| the pile | PILE (0, 0, 0), the compass rose |
| the river of cards (4-03 →) | out of every press, up over the table, toward the throne (-z) |
| the card king | on the throne (THRONE), as in v2 |

Hidden for the whole reel: the iron boxes, the giants, the keys, clocks, AUTO consoles, hoppers, seals, chips, kiln,
tower, dispenser, the card-makers. (Every module must draw nothing for a feature whose state is missing.)

## Who builds what

| owner | files | builds |
|---|---|---|
| main (director) | `src/dir/*`, director, shots, cards, cards-cells, fx, film, main, engine, layout, sound-events, board, kingcards | every shot, the proposal cards (model → glyph faces, the 批准？ tab, the ink on cards), the river, jokers, king cards and their portraits, the fan's cards, the macro depth of field, the board's 批准率, sound events, integration |
| paper agent | `src/paper.js`, `src/bench/paper.js` | the two paper protagonists and the paper crowd |
| kings agent | `src/kings.js`, `src/bench/kings.js` | masks off; ten distinct court-card faces; readable expressions; flat-into-a-card still works |
| props agent | `src/props.js`, `src/chips.js`, `src/bench/props.js` | the big 批准 stamps, the ink marks, the nameplates, presses spitting cards, everything else hidden by default |
| set agent | `src/set.js`, `src/bench/set.js` | the map cloth at macro scale, pinhole cities, the gold flood |
| card-king agent | `src/cardking.js`, `src/bench/cardking.js` | holding a fan of cards; the reach down with one golden fingertip |
| sound agent | `src/audio*.js`, `tools/render-audio.mjs`, `docs/SOUND.md` | the reel's score R1–R6 and the new sound kinds |

## State contracts (the director computes every field as a pure function of film time; modules only draw)

```js
// ---- paper (paper agent): new module
makePaper(ctx) -> { root, update(st.paper, t), HEIGHT, headWorld(name, out), handWorld(name, side, out),
                    pairPicture(ctx2d, x, y, w, h) }       // the two of them holding hands, in the module's own print
                                                          //   style, drawn into a 2D canvas (the card face of 6-06)
st.paper = {
  people: { red: P, blue: P },
  crowd: { show, hits: [[x, z, t0, strength], ...], look: [x, y, z], gold },
}
P = {
  show,               // default 0 (not drawn)
  pos: [x, z],        // feet on the tabletop (y 0)
  dir: [dx, dz],      // the way he faces and walks. He is a PROFILE cut-out: his paper plane contains dir and up.
  walk,               // step phase (float, 1 = one step; the director advances it with distance travelled)
  run,                // 0..1 walk -> run (leans in, big strides, arms pumping)
  look: [x, y, z],    // a world point: the head tilts (and the paper bends back at the waist) to look up/down at it
  wave,               // 0..1 the front arm up, waving (oscillation from t)
  down,               // 0..1 knocked onto his back (1 = lying flat); going back to 0 = getting up (the module shapes both)
  dive,               // 0..1 a dive forward onto his belly along dir
  cower,              // 0..1 crouched, arms over the head
  reach: [x, y, z] | null, hold,  // the front hand reaches for a world point; hold 0..1 = it has taken the other's hand
  shocks: [[t0, strength], ...],  // ground shocks (stamps): a hop and a paper flutter, decaying (strength 0..1)
  wind,               // 0..1 a gust (a card flying low overhead): the paper bends and flaps
  gold,               // 0..1 the gold flood's light on him
}
// crowd: ~40 paper people a side, standing about the coasts in the head half of the table (z -3.0 .. -0.6), never
//   within 0.12 m of the two protagonists' home spots or of the proposal-card spots. Each reacts to the hits (stamps) by
//   distance: close ones are knocked down, the rest flee away from it and keep running. Deterministic.

// ---- kings (kings agent)
// The masks, temple badges and brow plates are gone; the painted brows are back. Each king has his OWN face (see the
// brief). Everything else stays: enter, size, rise, sweat, crownTilt, lean, turn, slump, blown, look, face, hand,
// armL/armR, flat + cardAt + cardFrame + cardSize (pressed into a court card: 6-02, 6-03).

// ---- props (props agent)
st.props.stamps = { [id]: { R: S | null, L: S | null } }, S = {
  press,              // 0..1 the rubber face squashes on contact (the director drives it at the hit)
  wet,                // 0..1 fresh red ink on the face
}                     // a big rubber stamp held in that hand (handFrame). Its axis stays world-vertical, face down,
                      //   turned with the hand's yaw, so the face centre = palm centre - (0, STAMP.GRIP, 0).
props exports: STAMP = { GRIP, W, D, H }, stampFace(id, side, out) (world centre of the rubber face)
st.props.ink = [{ pos: [x, y, z], rot, size, k, seed }]   // red 批准 APPROVED rubber-stamp marks lying flat (y + 0.0004),
                      //   up to 256; k 0..1: 0 none, 0..0.15 the ink presses in (wet, ragged), 1 dry
props exports: paintStampMark(ctx2d, x, y, w, h, seed)   // the same mark painted into a 2D canvas (cards use it)
st.props.plates = { show }                            // brass nameplates at the table edge in front of each king
props exports: platePos(id)
st.props.presses[id] = { lever, slide }               // as before; pressOut(id, out) is where a card comes out

// ---- set (set agent)
st.set.cloth = {
  cities,             // 0..1 the pinhole towns' lights
  gold,               // 0..1 the colour of those lights: 0 warm amber .. 1 the AI's cold white-gold
  flood: { c: [x, z], r, w } | null,   // the gold flood: inside radius r the engraved ink lines fill with gold light
                      //   (the cloth glows like circuitry), a bright front of width w at r; outside, nothing changes
}
st.set.boxes.CN/US.show = 0, st.set.giants.CN/US.show = 0 for the whole reel.

// ---- card king (card-king agent)
st.cardking.fan = {
  on,                 // 0..1 the LEFT hand comes up before the chest holding a fan of cards
  n,                  // 1..12 slots
  spread,             // 0 squared up .. 1 a full fan (~100 deg)
  face: [x, y, z],    // world point the fan faces (usually the camera)
}
cardking exports: fanFrame(i, out)   // world matrix of slot i (0 = leftmost seen from the front): origin at the card
                      //   centre, card plane = local xy, face +z, uniformly scaled so a CARD.W x CARD.H card fits.
                      //   The director draws the cards there.
// deal.on (both hands over the two head kings, palms down) and arm (the stream reaching a target, carry) as in v2:
//   used for 6-02 (pressing the kings) and 6-05 (one golden fingertip coming down to the paper people at (0, 0, -2.02)).
```

## Sound: new event kinds (sound-events.js, from the director's data)

stampHit {who, size, pov: 'ant'|'high'} (a rubber stamp slamming wood; from the ant's height it is a pile-driver:
sub thump, wood boom, paper rattle) · stampMiss (the same on bare cloth: hollow) · stampLift (a sticky peel) · cardSlide
(a card skidding over linen, a soft stop) · cardFly (a card whipping away overhead) · flock {dur, density} (hundreds of
cards flapping like birds) · paperFall (a paper figure flattening: a tiny crisp slap) · paperStep (tiny paper steps) ·
paperRun {dur} · handTouch (one music-box note) · jokerRise {who, dur} · charge {dur} · pair (王炸) · flood {dur} ·
inhale (the card king) · flatten {who} (噗) · riffle (a fan of cards spread) · cardSnick (a card slid into a fan) ·
cardPlay (嗒) · boardFlip.

## Order of work (main)
1. Script, timings, this file; launch the departments.
2. Engine: depth of field for the macro shots; colour kept for paper ids 40..49.
3. Director: the reel, shot by shot, on placeholders until the departments land; cards, king cards, river, jokers.
4. Low-res cut → naive-viewer test (frames only, no script) → fix.
5. Score, mux, a 720p review reel (crf 28). No 1080p.

## Status (2026-11-07)
Reel directed end to end (src/dir/story.js data, reel.js state, cams.js shots; src/freecards.js, src/portraits.js,
engine depth of field). All six departments delivered: paper people (paper.js: a red man in a flat cap, a blue young
woman with a ponytail, a crowd of 80), ten distinct unmasked faces, stamps/ink/nameplates/rebuilt presses, the macro
cloth with pinhole towns and the gold flood, the card king's fan and golden finger, the score R1-R6 (-14.6 LUFS).
Two naive-viewer tests on two-frames-per-shot sheets. Fixed after them: the jokers now burst out of DeepSeek's press
(not out of the handshake), the pair visibly becomes a card that stands up under the fingertip, other cards are thrown
on top of theirs at the end (not a flip), 4-01 slowed so the card leaves before the stamp lands, face cameras aim at the
solved head. Review cut: out/v3/jokers_wild_v3_reel_720p.mp4 (720p, crf 28). No 1080p until the user approves.
Known weak: the tiny crowd's fates read as specks; the 王炸 flash peak washes out for a few frames; 6-01/6-02 card-mass
chaos; "sea" doesn't read as water.
