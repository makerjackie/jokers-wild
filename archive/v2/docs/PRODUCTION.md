# Production v2 — 《王炸 / JOKERS WILD》

v1 (3:21, delivered 2026-11-06, archived in `archive/v1-source.tgz`) was rejected as unreadable: ~45 insider gags on tiny
props in dark frames, ten kings with the same face, plot you had to guess. v2 rewrites the story on the same engine.

**Core idea: 没有人想放出它，但谁也不敢先停手.** (Nobody wants to let it out; nobody dares to stop first.)
Script: `docs/SCRIPT.md`. Every shot with timecodes: `docs/script/SHOTLIST.md`, generated from `docs/script/shots.txt`
(`python -X utf8 tools/shotlist.py` → `src/shots-data.js`). Rules for all code: `docs/INTERFACES.md` (still valid:
pure function of t, celMaterial / glowMaterial, material ids, onTwos, fwidth fades, no assets, own files only, no git).

## The readability rule (the reason for v2)

Every beat must read on a PHONE, without the script: a visible actor, a clear action, a visible consequence, a readable
face reaction. Anything a department builds must read at the size it appears in the shot list. Big, simple shapes,
strong silhouettes, high contrast against black. When in doubt: bigger, brighter, simpler.

## What changed in the world

- **Masks.** Every king wears a half-mask in his company's brand shape and colours. Identity must read from M1 at a
  glance. Faces act with eyes (through the mask) and mouth.
- **Kings arrive.** At the start only OpenAI (small) and Google (dozing) sit at the table; the others slide in with
  their chairs out of the dark (`enter`).
- **Inflation.** Kings swell as the race goes (`size`), OpenAI most; DeepSeek stays the smallest.
- **Madness.** Kings half-stand and lean over the table (`rise`), sweat, crowns askew.
- **Two iron boxes (Pandora's boxes)** on the table between seats 0 and 1 of each side (`BOXES`, `BOX` in layout.js),
  each locking one joker behind 5 padlocks. Each lock removed lets gold light leak out into that side's presses.
  Every removal gets a 安全 ✓ sticker. The last lock is turned by the AUTO strings. The lids open from inside.
- **Two national giants** (`GIANTS`): colossal faceless figures standing in the dark behind each row, eyes glowing
  (CN red, US blue). The US giant swings a seal on a chain onto the chip bridge (禁运).
- **Two full jokers**, mirror images: CN red, US blue. No half faces. They pair up instead of colliding.
- **Card backs** red (CN) / blue (US) → both drift to one purple during the party → all flip to the AI's black-and-gold
  at 王炸.
- **The card king** builds on the throne (face = the two jokers side by side), grows taller than the giants, DEALS a
  card to every king, then absorbs every card the kings play and keeps growing until it fills the frame.
- **Cut from v1**: Mistral and the table-leg shim, the paper card-makers and paper people, the cardboard crowd, the
  fishing rod, make-up, price tags, sacks, cheat sheets, approval flaps and stamps, toll and 拒收, SERVER BUSY, the
  flattening of kings into cards, the printed king cards, "100% 代码" end card, the 12-row leaderboard (the board now
  shows only the date, the #1 and the multiplier).

## Who builds what

| owner | files | builds |
|---|---|---|
| main (director) | director + `src/dir/*`, cards, fx, film, main, layout, shots, sound-events, plan, models, board-text, titles | every shot; cards (jokers' new art, back colours, deals, fly-up into the giant); fx (strings and their fall, the gold leak lines, sweat?); board data; integration; QC |
| kings agent | `src/kings.js`, `src/bench/kings.js` | masks, readable eyes/mouth behind them, `enter`, `size`, `rise`, `sweat`, `crownTilt`, dozing |
| set agent | `src/set.js`, `src/bench/set.js` | the two iron boxes (lid, 5 padlocks, chains, stickers, seam glow, joker anchor), the two giants, removing the glass cases, the torn hole in the map cloth |
| props agent | `src/props.js`, `src/chips.js`, `src/bench/props.js` | iron keys in kings' hands, the turn clocks, the hopper items read big, the seal on a giant's chain |
| card-king agent | `src/cardking.js`, `src/bench/cardking.js` | `grow`, a face of two full jokers side by side, `absorb` pulse, a dealing pose |
| sound agent | `src/audio*.js`, `tools/render-audio.mjs`, `docs/SOUND.md` | the v2 score M1–M12 per SCRIPT.md, the new event kinds below |

## State contracts v2 (in addition to INTERFACES.md and the v1 fields that still exist)

The director computes every field as a pure function of film time; modules only draw what they are given.
A missing field means "default / not in this shot". World metres. The director owns timing; modules own looks.

```js
// ---- kings (kings agent): new fields on st.kings[id]
enter     // 0..1, default 1. 0 = not drawn at all (king AND chair). 0..1 the king slides in with his chair from
          //   ENTER_DX m further out (away from the table, along x), decelerating, a small bump on arrival at 1.
size      // default 1: a scale multiplier on top of KING_SCALE * KING.size (0.85 .. 1.5), about the seat point on the
          //   floor; the chair scales with him only up to 1.1 (a fat king overflows his chair). Arms keep reaching targets.
rise      // 0..1, default 0: half-standing. The body lifts off the seat (~0.22 m at 1) and pitches forward over the table
          //   (adds to lean). Robes stay rigid. At 1 his hands reach the middle of his half of the table.
sweat     // 0..1: beads and runs of sweat on the face and the mask (catch the lamp), a damp sheen
crownTilt // rad, roll of the crown on the head (askew), default 0
// the existing face/brows/mouth/eyes/look/lean/slump/armL/armR/hand fields stay. Masks hide the brows: the director will
// mostly act with eyes ('wide','narrow','shut','closed','side','down','glare'), face.pupil and the mouth.
kings api additions: maskFrame(id, out) (world matrix of the mask centre, +z out of the face), eyeFrame exists.

// ---- set (set agent)
st.set.boxes = { CN: B, US: B }, B = {
  show,            // default 1
  lid,             // 0 shut .. 1 wide open (hinged at the box's back, the side toward the throne/-z); the lid bursts from inside
  burst,           // 0..1: the lid is punched up from inside (a jolt, a flash of light at the seam) — 8-01
  seam,            // 0..1: gold light leaking from the lid seam (grows as locks come off); with lid > 0 the light pours up
  locks: [L0..L4], // per padlock: 0 locked on its chain .. 0.25 the shackle springs open .. 1 fallen onto the table and
                   //   settled (deterministic resting spot beside the box, lying on its side); index 0 is removed first
  chains,          // 0..1: the chains slither off the box (after the last lock) and lie on the table
  stickers: [k...],// one entry per sticker slapped so far: k 0..1 the slap (pops in flat, a tiny bounce); up to 14,
                   //   laid out deterministically: first ones near the hasps, later everywhere, overlapping, a little crooked
}
st.set.giants = { CN: Gi, US: Gi }, Gi = {
  show,            // 0 hidden in black .. 1 present (their rim light and eyes reveal them; at 0 not drawn)
  rise,            // 0 sunk low (crouched in the dark, head ~2.5 m) .. 1 standing at full height
  eyes,            // 0..1 the eye glow (CN red, US blue); they open like lids
  lean,            // 0..1 leaning in over his row toward the table
  look,            // [x,y,z] world point the head turns to (default the table centre)
  fist,            // [x,y,z] | null: world target for the right fist (IK; the arm is long enough to reach x = 0.3 above
                   //   the table at z between -1 and 3.5, y >= 1.6). null = arm hanging.
  tangled,         // 0..1: the arm is held, straining (a tremor) — 8-06
}
st.set.clothHole = { u }    // 0..1: where Meta peels a city off the map (props.cityPatch), a ragged dark hole opens
set api: boxLock(side, i, out) world centre of padlock i while locked; boxStickerAt(side, i, out) where sticker i lands;
         boxSeam(side, out) the front-centre of the lid seam (the gold leak starts here); jokerAnchor: { CN, US } (inside
         each box, card plane = local xy, +z toward -z of the world... see the set's report); giantFist(side, out) the
         solved fist position; giantEyes(side, out) between the eyes. st.set.cases is gone (glass cases removed).

// ---- props (props agent)
st.props.keys   = { [id]: { hand: 'L'|'R'|null, turn: 0..1 } }   // a big old iron key held in that hand (handFrame);
                                                              //   turn rotates it about its shaft by 0..90 deg
st.props.clocks = { [id]: { show: 0..1, n, ring: 0..1 } }    // a brass alarm clock on the table at clockPos(id) with a
                                                              //   big red digit display n (0..15), facing the king and
                                                              //   the camera (two faces back to back); ring = it rattles
st.props.seals.US = { ..., chain: [[x,y,z]...] }             // exists: the director passes the chain from the giant's fist
// the hopper items (gold, castle, city, plant) appear in medium shots now: they must read (big, lit windows, smoke)

// ---- card king (card-king agent)
st.cardking += { grow: 1..3 (scale about the throne seat; at 1 the v1 size), absorb: [t0, ...] (film times a card
  arrives in the chest: a gold ripple out from the chest), deal: { k: 0..1, target: [x,y,z] } (right arm out over the
  table, palm down, the stream's tip flicking a card toward target) }
cardking faceFrame: the two jokers sit side by side (cards module), each a FULL face now: widen the face window so
  both cards read whole (no collar over their faces)
```

## Sound: new event kinds (sound-events.js, from the director's data)

chairSlide {who, dur} (a heavy chair scraping in on stone) · chairStop {who} (a thud) · keyTurn {who} · lockOpen (the
shackle springs) · lockDrop (a heavy padlock clanks onto the wooden table) · sticker (a sticky paper slap) · lidSlam ·
lidBurst (metal "嘣" from inside) · lidCreak {dur} · chains {dur} · jokerHum {dur, pitch} (an un-instrument-like low tone) ·
giantBreath {who 'CN'|'US', dur} · giantEyes (a low swell) · sealSwing (a huge whoosh on a chain) · deal (a card
"嗖" ending in a soft "嗒") · stringsDrop (thin threads going slack, a faint high release) · flyUp (a card rising away) ·
absorb (the giant's deep inhale) · clockTick (the turn clock) · clockRing (its alarm, short).
The v1 kinds (throw, land/slam, chips, press, button, cancel, cigar, clink, toast, avalanche, kiln, seal/stamp,
chains, flips, storm, wave, heart, ...) stay.

## Order of work (main)
1. Contracts (this file), script, shot list, layout. Launch the departments.
2. Style frames of the masked kings → shown to the user (non-blocking).
3. Director v2, sequence by sequence, on top of the departments' benches as they land; cards and fx changes.
4. A low-res full cut; a naive-viewer readability check (frames without the script); fix; second pass.
5. Score; mux; a 720p review cut for the user. No 1080p master, covers or copy until the user approves release.

## Status (2026-11-07)
v2 directed end to end (src/dir/s1, s4, s6, s8, s10 + story.js, throws.js, board.js, world.js); all five departments
delivered (masks + enter/size/rise/sweat; iron boxes + giants + ceiling/board hiding; keys, clocks, hopper items, AUTO
labels; card king grow/deal/absorb/two-joker face; the v2 score, −13.7 LUFS). Two naive-viewer readability tests on
two-frames-per-shot sheets (reviewers saw only the pictures): fixed the lock beat (square-on frame, padlocks drop and
pile up — now "the clearest idea in the film"), strings hung from a glowing card over each king, the AUTO label,
the joker's birth, R1 on o1, eye close-ups that include the mask, brightness, the ending's staging.
Known weak: the kiln (dark dome, no visible fire), the avalanche wide, the storm shots, the giants mostly loom.
Review cut: out/v2/jokers_wild_v2_720p.mp4 (720p, crf 28). No 1080p master until the user approves release.
