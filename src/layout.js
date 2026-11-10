// JOKERS WILD — the shared physical layout. Every module builds to these numbers.
// Units: metres. Origin: centre of the tabletop, top surface y = 0, +y up.
// The table's long axis is z. The HEAD (empty throne, scoreboard) is at -z; the FOOT is at +z,
// which is where the motif camera M1 stands, looking toward -z.
// Seen from the foot: LEFT is -x = China (CN), RIGHT is +x = USA (US).
// A king's local frame: +z is its FRONT (it faces the table), +y up, local +x is the king's LEFT.

export const FLOOR_Y = -0.78;
export const TABLE = {
  HALF_L: 3.2, HALF_W: 1.2, THICK: 0.09,
  // leg centres [x, z]; the foot-left leg (index 2) is the short one that wobbles and gets shimmed
  LEGS: [[-1.02, -2.95], [1.02, -2.95], [-1.02, 2.95], [1.02, 2.95]],
  SHIM_LEG: 2,
};
export const SEA_HALF = 0.42;          // the sea strip of the map cloth: |x| < SEA_HALF, full length
export const PILE = [0, 0, 0];         // where played cards land (centre of the sea)
export const LAMP = { pos: [0, 2.6, -0.1], cone: 64 };     // pendant lamp: bulb position, half-angle of its light (deg)
export const THRONE = { pos: [0, FLOOR_Y, -4.25], daisH: 0.32, seatY: FLOOR_Y + 0.32 + 0.56, backTop: FLOOR_Y + 3.7 };
// glass cases on pedestals either side of the throne; the joker card stands at JOKER_Y inside
export const CASES = { CN: [-1.55, FLOOR_Y, -3.95], US: [1.55, FLOOR_Y, -3.95] };
export const JOKER_Y = 0.42;           // world y of the joker card centre inside its case
export const BOARD = { pos: [0, 5.2, -4.9], W: 3.6, H: 1.9, ROWS: 12 };    // split-flap scoreboard, face toward +z; high, so the
                                                                          // card king's crown (top <= 4.1) never covers it from M1
// the motif camera: every wide of the film is this symmetric frame (the director may push in from it)
export const M1 = { pos: [0, 2.4, 10.5], look: [0, 1.15, -3.2], fov: 40 };
export const DISPENSER = { pos: [1.95, FLOOR_Y, 3.75] };                  // NVIDIA chip dispenser (US foot corner)
export const EU = { pos: [0, FLOOR_Y, 3.62] };                             // Mistral, the cardboard king at the foot, facing -z

// Ten kings, five a side, seat 0 at the head (next to the throne) .. seat 4 at the foot.
export const SEAT = { X: 1.62, Z: [-2.5, -1.25, 0.0, 1.25, 2.5], Y: FLOOR_Y + 0.47 };
export const KINGS = [
  // 《失控》 v9: no nations. The left row (warm light) and the right row (cool light); the two who last face each other
  // across the pile in the middle (seat 2): Claude and OpenAI. Seats 0 and 4 stay empty.
  { id: 'anthropic', name: 'Claude', side: 'CN', seat: 2, size: 1.06 },
  { id: 'google', name: 'Gemini', side: 'CN', seat: 1, size: 1.02 },
  { id: 'meta', name: 'Meta', side: 'CN', seat: 3, size: 1.0 },
  { id: 'openai', name: 'OpenAI', side: 'US', seat: 2, size: 1.08 },
  { id: 'xai', name: 'xAI', side: 'US', seat: 1, size: 0.98 },
  { id: 'mistral', name: 'Mistral', side: 'US', seat: 3, size: 1.0 },
];
export const KING = Object.fromEntries(KINGS.map((k) => [k.id, k]));
export const SIDE_SIGN = { CN: -1, US: 1 };
export const deg = (d) => (d * Math.PI) / 180;
export function seatPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * SEAT.X, SEAT.Y, SEAT.Z[k.seat]]; }
// yaw that turns a king's local +z toward the table: CN (at -x) faces +x, US (at +x) faces -x
export function seatYaw(id) { return KING[id].side === 'CN' ? Math.PI / 2 : -Math.PI / 2; }
// each king's card press and paper card-maker stand on the tabletop in front of him
export function pressPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.9, 0, SEAT.Z[k.seat] - 0.12]; }
export function makerPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 0.74, 0, SEAT.Z[k.seat] + 0.16]; }
// the AUTO button (with its cancel key) sits on the table edge in front of each king
export function buttonPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.06, 0, SEAT.Z[k.seat] + 0.3]; }

// colours: the two camps, and each company's muted robe tone (kings are desaturated by design)
export const CAMP = { CN: '#c4342c', US: '#3454a0' };

// ---------------------------------------------------------------- v2 (docs/PRODUCTION.md "v2")
// The two iron boxes (Pandora's boxes) stand ON the tabletop between each side's seats 0 and 1. Each locks one joker
// behind LOCKS padlocks. The head king (seat 0) unlocks; the seat-1 king slaps a 安全 ✓ sticker on it.
// pos = centre of the box's base on the tabletop (y = 0); W along x, D along z, H up.
export const BOXES = { CN: [-0.78, 0, -1.85], US: [0.78, 0, -1.85] };
export const BOX = { W: 0.34, D: 0.44, H: 0.32, LOCKS: 5 };
// The two national giants stand in the dark behind each row, facing the table (CN at -x faces +x, US faces -x).
// pos = between the feet on the floor; standing height ~5.4 m (eyes ~4.8 m above the floor).
export const GIANTS = { CN: [-3.85, FLOOR_Y, 0.4], US: [3.85, FLOOR_Y, 0.4], H: 5.4 };
// a king entering (enter 0 -> 1) slides in with his chair from ENTER_DX metres further out, in the dark
export const ENTER_DX = 2.3;
// the turn clock (斗地主 alarm clock) stands on the table in front of each king
export function clockPos(id) { const k = KING[id]; return [SIDE_SIGN[k.side] * 1.1, 0, SEAT.Z[k.seat] - 0.42]; }
// the lit city Meta peels off the map cloth (6-03): centre of the patch on the US land beside his seat
export const CITY = [0.72, 0, 2.05];
