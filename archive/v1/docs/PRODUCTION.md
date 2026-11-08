# Production plan (step 4 on): the whole film

The user handed direction over completely after the tone reel ("你是导演，你说了算"). Decisions locked:

- **Look: noir (style A) with camp-tinted shadows.** Shadows on the China half (x < 0) go red-black, on the US half
  blue-black; highlights stay warm cream; cards keep their colour. From AUTO (7-01) the camp tint drains away and,
  after 王炸, only the AI's gold-on-black remains. Engine look options: `campTint` 0..1.
- **King faces: painted court-card portraits** (canvas atlas: each king × expressions), projected on a re-sculpted
  head framed by curls. Political sensitivity is not a constraint.
- **Cards are real model cards**: every company plays its real releases in order (from `docs/research/ai-launches.csv`,
  generated into `src/models.js`), big readable name + score + rank. Cards turn into machine glyphs only at the
  takeover, on camera.
- **Board raised**: `BOARD.pos` y = 5.2 (layout.js). From M1 its bottom edge must clear the card king's crown (top <= 4.1).
- **M1 moved back**: `M1` in layout.js = camera [0, 2.2, 10.5] looking at [0, 1.0, -3.2], fov 40. One frame holds the board,
  the throne (and later the card king), the lamp, the whole table and the floor under the foot legs (the shim). The room
  grows to fit (ceiling >= 7.0, foot wall >= 12). The lamp hangs from a V of two chains so the centre line above it stays
  clear (the card king's face and the board sit there).

Everything below is built against `docs/SCRIPT.md` / `docs/script/SHOTLIST.md` (times) and `docs/INTERFACES.md`
(rules). Owners edit only their own files.

## Who builds what

| owner | files | builds |
|---|---|---|
| main | director, cards, fx, engine, materials, film, main, layout, shots, sound-events, plan, models, titles | every shot, the printed king-cards (portraits pre-rendered at load) and their folding, every card behaviour (throws by real model, giant / tiny / copies / makeup cells, jokers' flight, the pair, the shockwave, the glyph turn), the shadow sweep, titles, integration, QC |
| kings agent | `src/kings.js`, `src/bench/kings.js` | court-card faces (painted, readable, many expressions, an eye that holds a full-frame close-up), side curls, hand shapes (point, fist, open, hold), bodyFrame/headFrame/cardFrame, the flattening squash |
| set agent | `src/set.js`, `src/bench/set.js` | lamp switching on; table wobble + rock; dispenser: chips pouring down both chutes, the bridge dented by the US seal with a 禁运 mark, toll barrier with a 25% sign, a cart of chips crossing and rolling back, the NVIDIA eye blinking; the chip tower beside the dispenser collapsing into an avalanche; the CN brick kiln with rough red chips stacking; the 服务器繁忙 SERVER BUSY sign under a board row; room grown for the new M1; V-chain lamp; `lamp.on` |
| props agent | `src/props.js`, `src/chips.js`, `src/bench/props.js` | chip stacks in front of each king; hopper feeding (chips, gold bars, a castle with server windows, a lit city block, a smoking power plant, paper-doll chains); self-pumping presses; card-maker actions (shovel, pull, hold a card up, look across, reeled away, swept in); the cardboard crowd (百模大战) popping up and falling like dominoes; Meta's fishing rod with a $100M bag; the makeup brush swipe; price tags flipping to negative; sacks on every king's back; approval flaps + personal stamps; Mistral folded under the short leg, crushed and sliding out at the end; `src/chips.js` = the one poker-chip model everyone instances (set imports it for the dispenser flow and the avalanche) |
| card-king agent | `src/cardking.js`, `src/bench/cardking.js` | the colossal king made of cards on the throne: assembly from the storm, breathing, head turn, the joker pair as its face (anchor), a card-stream arm that can reach anywhere on the table and carry things, the flick |
| sound agent | `src/audio*.js`, `tools/render-audio.mjs`, `docs/SOUND.md` | the whole score M1–M12 per SCRIPT.md §7, heartbeat, every event kind the director adds |

## New state contracts (in addition to INTERFACES.md)

The director computes every field as a pure function of film time; modules only draw what they are given.
A field that is missing means "default / not in this shot". Positions are world metres unless noted.

```js
// ---- set (set agent)
st.set.lamp      = { on, swing, flicker }       // on 0..1: the bulb switching on (glow + filament); the director scales the light itself
st.set.dispenser = { show, flowUS, flowCN, dent, toll, cart: { show, u, load, back }, blink }
                   // flow 0..1 chip rate down each chute; dent 0..1 the bridge crushed (+ 禁运 EMBARGO mark left on it);
                   // toll 0..1 a red-white barrier drops onto the bridge with a "25%" sign; cart.u 0 dispenser end .. 1 CN end;
                   // cart.load 0..1 chips heaped in it; cart.back true while it rolls back; blink 0..1 the NVIDIA eye closing
st.set.tower     = { fall }                     // the chip skyscraper beside the dispenser: 0 standing .. 1 avalanche settled
st.set.kiln      = { show, glow, bricks }       // the CN brick kiln (foot-left corner, mirror of the dispenser); bricks 0..1 red chip stacks
st.set.board.busy = { row, u }                  // the 服务器繁忙 SERVER BUSY plate dropping on two chains under board row `row` (u 0..1)
set exports: KILN, TOWER (positions), bridgePoint(u, out) (world point on the sea-crossing chute), chuteEnd(side, out)

// ---- props (props agent)
st.props.chips    = { [id]: { stack } }           // 0..1 height of the chip stack beside the king's press
st.props.presses  = { [id]: { lever, slide, hopper: { kind, u, show } } }   // kind: 'chips'|'gold'|'castle'|'city'|'plant'|'people'
                   // u 0 item resting at the hopper's mouth .. 1 swallowed. 'people': a doll chain trailing into the hopper, the
                   // protagonist card-maker last (presses[id].hopper.maker = true; .look 0..1 he turns his head back)
st.props.makers   = { [id]: { show, pose, at, yaw, face, look, hold, shovel, reel, swept } }
                   // hold: 'shovel' | 'card' | null; shovel 0 loaded .. 1 tipped into the hopper; reel 0..1 hooked and reeled away
st.props.crowd    = { pop, fall }                 // cardboard minor-lab kings with #1 placards: pop 0..1 (staggered), fall 0..1 head→foot
st.props.rod      = { show, ext, reel, from, to } // Meta's telescopic rod from his crown; ext 0..1 telescoping out to `to`; reel 0..1
st.props.brush    = { show, at, u }               // a big make-up brush wiping across a card on the pile (u 0..1 one swipe)
st.props.tags     = { [id]: { show, text, prev, flip } }   // small split-flap price tags (text like '¥1.00'), flip 0..1 prev→text
st.props.sacks    = { [id]: { show, leak } }      // a fat sack on each king's back (api.bodyFrame); leak 0..1 books dropping out (Claude)
st.props.flaps    = { [id]: { up, stamp } }       // a "批准？ APPROVE?" flap pops up in front of the king; stamp 0..1 a ✓ lands
st.props.stamps   = { [id]: { hand } }            // a small personal seal in the king's hand ('L'|'R'|null)
st.props.eu       = { show, fold, at, rot, crushed, slide }   // + crushed 0..1 flattened under the leg; slide 0..1 squeezed out
props exports: rodBag(out) (where the $100M bag hangs), hopperMouth(id, out), cityPatch(out)

// ---- kings (kings agent)
st.kings[id] += { hand: { L, R } ('point'|'fist'|'open'|'hold'), flat 0..1, face.pupil, face eyes 'shut', mouth 'laugh'|'scream' }
                   // flat: the king squashes onto a vertical plane through him (his pose pressed flat, "噗"); at 1 he is gone and
                   // the director's printed double-headed court card (cards.js, pre-rendered portrait) takes his place and does the folding
kings api: bodyFrame(id, out), headFrame(id, out), cardFrame(id, out)

// ---- card king (card-king agent)
st.cardking = { show, build, breathe, look, lean, arm: { out, target, via, carry }, flick }
cardking api: faceFrame(out), armTip(out), headWorld(out)
```

## Order of work (main agent)
1. Engine camp tint; board raised; models data; card faces with real names.
2. King face redesign (court-card portraits), then flattening and folding.
3. Director, sequence by sequence: 1 开局, 2 斗牌, 3 卡脖子, 4 使绊子, 5 制牌人, 6 加速, (7, 8 polish), 9 王炸, 10 新王, 11 垫桌脚, 12 片尾; sound events for each.
4. Integration of agents' work; contact sheets per sequence; pops; full renders; fixes. At least two QC rounds.
5. Release package: covers, copy, README (zh/en), PLAYBOOK, PROMPT.

## Status (end of session 2026-11-06)
Done: all 12 sequences directed (src/dir/s1..s10, s78); real model cards; camp-tinted noir; new court-card faces;
card king; printed king cards with load-time portraits (film.js paintPortraits); inertialization of arm/look jumps
(film.js); full score + ~3,000 picture-locked sound events; two contact-sheet QC rounds; pops scan (remaining flags are
intended fast actions); preview render works (tools/render.mjs --w 960 --h 540 --scale 1, ~2 min for the film).
In flight: props agent (goblet grip offset, sacks vs chair), sound agent (async renderScore with progress + level
re-check on the real events).
Left: 4-03 price tags readability; wire the player to the async score (progress bar); one more preview + pops pass;
final 1080p render (scale 2) + score mux; covers (tools/covers.mjs is written, not run); copy for 8 platforms;
README zh/en, LICENSE, docs/PLAYBOOK.md, docs/PROMPT.md; publishing dry-run for the user before any real publishing.
