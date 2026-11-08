# JOKERS WILD — production interfaces (read before touching code)

The film: `docs/SCRIPT.md` (approved). Every shot with timecodes: `docs/script/SHOTLIST.md`.
The physical layout every module builds to: `src/layout.js`. Timing: `src/shots.js` (`CUES`, `ROW`, `SHOT`, `REEL`).
Reference films we copied the pipeline from (READ ONLY): `../your-turn` (newest) and
`../the-big-one`. Their PLAYBOOK.md files list the pitfalls.

## Tone (the user rejected the previous film for looking like a toy)
Tense black satire in a dark war room, lit by ONE pendant lamp: hard top light, deep blacks, hard shadows, smoke in the
beam. Everything the humans own is heavy, worn, old: dark wood, brass, iron, stone, leather, felt, glass. Nothing is
cute, rounded-toy, pastel or shiny-plastic. Silhouettes must read against black. Cards (the AI) are the only
saturated things in the frame (the noir style turns everything else into warm monochrome; see materials.js ids).

## Iron rules
- Every frame is a pure function of film time: `renderAt(t)`. No `Math.random` (use `mulberry32`/`Rng` from
  `src/util.js` with a fixed seed), no state carried between frames, no `Date`.
- Materials: `celMaterial()` from `src/materials.js` (lit by the lamp, casts lamp shadows) or `glowMaterial()` for
  self-lit things (flaps, bulbs, buttons). Hooks: `pattern` (GLSL editing `col`, `gloss`, `emis`, `idOut`, `litBias`,
  `shadeMul`, `specK`, `specTh`, `lampMul`; may `discard`), `vertex` (edits `pos`/`nrm`). Colours are display-referred:
  pass hex strings, `C()` is applied for you.
- Material ids decide inking and the style passes (see the table at the end of `src/materials.js`):
  set 1..9 (inked) / 100..109 (not inked), props 10..19 / 110..119, kings 20..29, cards 30..39 and 130..139 (keep
  colour in every style), paper people 40..49, glows and glass 140+, painted background 0 (brush pass, no ink).
- Things that must not cast lamp shadows (glass, glows, thin threads): `mesh.userData.noShadow = true`.
- Characters move on twos (`onTwos(t)`), effects on threes (`onThrees(t)`), mechanisms and the camera on ones.
- Far detail (engraving, bumps, thin lines, small text) must fade out by metres-per-pixel (`fwidth`) or it shimmers.
- No external images, font files or audio files. Canvas 2D textures drawn once at load are fine (deterministic).
  Real company logos are allowed (satire); draw them with `src/logos.js` and treat every company the same.
- Only edit the files you own. Need something from another module? Write it in your final report.
- Do not touch git. The GPU may be shared with other agents: slow renders are not a code bug.

## Build and look
```bash
node tools/build.mjs                                            # -> dist/jokers_wild.html
node tools/snap.mjs --extra "&bench=set" 0 1 2                 # stills of a bench at bench-times 0,1,2 -> out/snaps
node tools/snap.mjs --out out/set --sheet sheet --extra "&bench=set&style=noir" 0 1 2 3 4 5
node tools/snap.mjs --extra "&style=engrave" 125.3               # a film frame in another style
```
Bench mode: `?bench=<name>` renders that module's own test scene. Each bench lives in `src/bench/<name>.js` and
exports `setup({ scene, overlay, camera, engine })` returning `update(t, camera) -> look` (look: optional engine
options, e.g. `{ style, mono, beam, smoke, exposure }`). Benches must light themselves like the film (the lamp
uniforms in `G` default to the film's lamp). `src/bench/index.js` is the registry (main agent owns it).

## Coordinates (src/layout.js)
Origin at the centre of the tabletop, top surface y = 0, +y up, metres. The long axis is z: the HEAD (throne,
scoreboard, glass cases) at -z, the FOOT (camera M1, the cardboard Mistral king, the NVIDIA dispenser) at +z.
Seen from the foot, LEFT (-x) is China, RIGHT (+x) is the USA. Floor y = -0.78. Table 6.4 x 2.4 m. The pendant lamp
bulb at (0, 2.6, -0.1), pointing straight down. A king's local frame: +z = its front (facing the table), +y up,
local +x = the king's LEFT hand side.

## Module: set — `src/set.js`, `src/bench/set.js` (owner: set agent)
The room and everything fixed in it.
```js
export function makeSet(ctx) -> {
  root,                            // THREE.Group, add to scene
  tableTop,                        // Object3D: the tabletop frame; whatever sits on the table is parented here (follows the wobble)
  jokerAnchor: { CN, US },         // Object3D inside each glass case where the joker card stands (card plane = local xy, +z faces the table side)
  lampBulb(out) -> Vector3,        // bulb world position after the lamp's swing (the director copies it into G.uLampPos)
  legFoot(i, out) -> Vector3,      // floor contact point of leg i (TABLE.LEGS order); the shim goes under leg TABLE.SHIM_LEG
  boardCell(row, col, out) -> Vector3,   // world centre of one flap cell (for close-ups)
  update(st, t),                   // st.set, below
}
st.set = {
  lamp: { swing: [ax, az], flicker },       // pendulum angles (rad) about x and z; flicker 0..1 (filament stutter, the director animates it)
  wobble,                                    // rad: the table rocks on the short leg (+ lifts the shim corner)
  cases: { CN: { crack, shatter, light }, US: {...} },   // crack 0..1 cracks spread over the glass; shatter 0..1 glass falls away; light 0..1 the thin spotlight
  board: { rows: [[{ t, text }, ...], ...], lit },       // per row: history of texts; at film time t show the last entry with entry.t <= t,
                                                         // flipping from the previous text over ~0.15-0.6 s (cells cycle through a few glyphs, staggered)
  alarm: { on, angle },                      // red rotating beacon on the scoreboard frame: on 0..1, angle rad
}
```
What to build (the look matters as much as the API):
- **Room**: near-black stone walls and floor, painted (id 0) where far, maybe heavy drapes or columns barely caught
  by spill light; nothing modern. The lamp is the only big light.
- **Table**: a long, heavy, dark wooden war-room table on four legs, thick top with a carved edge. Covered by the
  **map cloth**: an old engraved sea chart (canvas texture): two abstract continents (left and right, NOT real
  geography, NO borders, NO country shapes) with a coastline running along each side of the central sea strip
  (|x| < SEA_HALF), engraved wave lines on the sea, a compass rose, faded parchment colours, a few rhumb lines.
- **Lamp**: industrial pendant over the table centre: long cord or chain from the dark ceiling, a deep conical
  enamel/metal shade, a visible bulb glow inside (glowMaterial). It swings (pendulum) from `lamp.swing`.
- **Throne** at THRONE.pos: stone dais (3 steps), a tall, severe high-backed throne, empty, in the vanishing point of
  every wide shot. Dark, a little gold.
- **Glass cases** at CASES.CN / CASES.US: tall pedestals with a glass vitrine on top (brass frame, glass panes),
  a thin spotlight cone from above on each, a heavy lock with a wax/metal seal on its door. Glass: subtle edge
  highlights and streaks, mostly see-through (the joker inside must read). `crack` draws radial crack lines spreading
  from an impact point; `shatter` lets panes fall (simple shard pieces are fine). The joker card itself is drawn by
  the cards module at `jokerAnchor` (leave the anchor ~0.12 m above the case floor, card about 0.18 x 0.26 m).
- **Scoreboard** at BOARD.pos: a big split-flap departure board (black flaps, amber characters, a heavy frame) with
  BOARD.ROWS rows of about 20 cells. Each cell is a real two-flap mechanism: when its character changes, the upper
  flap falls over the hinge (one flip per intermediate glyph). Characters: everything in `BOARD_CHARS` and the logo
  tokens `{openai}` etc. from `src/board-text.js` (main agent writes it; build the glyph atlas from it at load). A
  logo token takes one cell and shows the logo in brand colour.
- **Alarm beacon**: a red rotating lamp on the board frame (`alarm`). When on, it also drives the practical light
  (the director sets G.uP2Pos/uP2Col; you expose its world position as `alarmPos(out)`).
- **NVIDIA chip dispenser** at DISPENSER.pos: a heavy cast-iron vending machine / casino cashier with the NVIDIA eye,
  two chutes: one along the US side's table edge, one crossing the table near the foot like a bridge over the sea
  to the CN side. (Not needed for the first stills; build it last.)

## Module: props — `src/props.js`, `src/bench/props.js` (owner: props agent)
```js
export function makeProps(ctx) -> {
  root,
  update(st, t, api),              // api = { handFrame(id, side) -> Matrix4 world (origin = palm centre, +y fingers, +z out of the palm) }
  buttonTop(id, out), cancelTop(id, out), coverTip(id, out),   // world points a king's hand presses
  cigarTip(id, out),                // world position of a cigar's burning tip (for smoke)
  pressLever(id, out), pressOut(id, out),   // a card press: lever handle, the slot a printed card slides out of
}
st.props = {
  buttons: { [id]: { cover, press, lit, cancel, dead } },  // cover 0 closed..1 open; press 0..1 travel; lit 0..1 AUTO lamp; cancel 0..1 travel; dead 1 = cancel key greyed out
  cigars: { [id]: { hand, lit, glow, ash, ashDrop } },   // hand 'L'|'R'|null (null = in the ashtray); glow 0..1 a draw; ash 0..1 length; ashDrop: film time the ash falls or null
  glasses: { [id]: { hand, wine } },                     // hand 'L'|'R'|null (null = on the table); wine level 0..1
  seals: { CN: { drop, spin, chain }, US: {...} },       // drop 0 hidden in the dark above .. 1 slammed down; spin rad; chain: optional [[x,y,z]...] path from the dark to the seal
  presses: { [id]: { lever, slide } },                   // lever 0..1 pulled; slide 0..1 a card sliding out
  makers: { [id]: { show, pose } },                      // the paper card-maker beside each press (pose: { lean, armL, armR, head } in radians)
  people: { CN: { show }, US: { show } },                // hand-in-hand paper-doll chains along each coastline
  eu: { show, fold },                                    // the cardboard Mistral king at EU.pos (fold 0..1 folded in four)
}
```
What to build:
- **AUTO button** at `buttonPos(id)` (layout.js) on the table edge in front of each king: a heavy steel base, a big
  red-amber mushroom button with a hinged steel safety cover (like a launch button), a small engraved plate
  "托管 AUTO", a lamp ring that glows when `lit`. Beside it a smaller square key "取消托管 CANCEL" that can be greyed out.
- **Cigars** (thick, dark leaf, a band; glowing tip; ash) and **ashtrays**; **wine glasses** (heavy crystal goblets,
  dark red wine). When held, place them from `api.handFrame(id, side)`.
- **National seals**: two giant stamps hanging on heavy chains from the dark: the US one round (Western official
  seal, no real emblem), the CN one square (Chinese seal with a carved knob, no real emblem). Face texts: "禁运
  EMBARGO" (US) and "拒收 REJECTED" (CN), mirrored as on a real stamp. Chains of real links (instanced torus links
  along a catenary or along `chain` when given).
- **Card presses**: a small cast-iron hand press per king (lever, platen, a slot where a card slides out), and the
  **card-makers**: flat paper figures (white paper, ink-line face, a printer's cap and apron), about 0.22 m tall,
  hinged like shadow puppets (head, torso, two arms, legs), standing on the table beside their press.
- **Paper people**: chains of identical hand-in-hand paper dolls standing along each coastline (|x| ≈ SEA_HALF..0.6),
  a few groups per side, each doll ~0.09 m.
- **Mistral**: a flat cardboard standee of a king (printed court-card king with the Mistral pixel M on the crown) on a
  fold-out strut, seen from behind in M1 (grey cardboard back + strut). `fold` folds it in half and in half again.

## Modules the main agent owns
`src/main.js`, `src/film.js`, `src/director.js`, `src/kings.js`, `src/cards.js`, `src/fx.js`, `src/logos.js`,
`src/board-text.js`, `src/sound-events.js`, `src/shots.js`, `src/layout.js`, `src/engine.js`, `src/materials.js`,
`src/glsl.js`, `src/bench/index.js`, the tools except `tools/render-audio.mjs`.

## Module: sound — `src/audio*.js`, `tools/render-audio.mjs`, `docs/SOUND.md` (owner: sound agent)
`renderScore(sampleRate, opts) -> { L, R, report? }`, deterministic, the same in Node and the browser. Picture
sounds come from `soundEvents()` in `src/sound-events.js` (owned by the director); music locks to `CUES`.
