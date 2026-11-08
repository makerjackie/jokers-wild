// Card atlas cell indices (pure data, safe to import from Node tools and the sound department).
import { KINGS } from './layout.js';
import { MODELS, MAX_V } from './models.js';
export const CELL = {};
{
  let i = 0;
  // the real model cards: MODELS[id][v] -> CELL[`${id}${v}`] (every company gets MAX_V slots; unused ones repeat its last card)
  for (const k of KINGS) {
    for (let v = 0; v < MAX_V; v++) CELL[`${k.id}${v}`] = i + Math.min(v, MODELS[k.id].length - 1);
    i += MAX_V;
  }
  CELL.backCN = i++; CELL.backUS = i++; CELL.backBlack = i++; CELL.blank = i++;
  for (let g = 0; g < 16; g++) CELL[`glyph${g}`] = i++;
  CELL.jokerL = i++; CELL.jokerR = i++;
  CELL.jokerCN = CELL.jokerL; CELL.jokerUS = CELL.jokerR;   // v2: two full jokers, CN red, US blue
  CELL.backPurple = i++;  // v2: both camps' backs drift to this during the party
  CELL.mistral = i++;
  CELL.o1gold = i++;      // the giant gold-edged o1 that OpenAI holds up (3-05)
  CELL.llamaMakeup = i++; // Llama 4 in full make-up, #1 (4-02); wiped back to the plain card (#32)
  CELL.claudeCopy = i++;  // a slightly blurred photocopy of Claude's card (4-04, Kimi's bomb)
  CELL.makerSelf = i++;   // the card that prints the card-maker himself at his press (5-01)
  CELL.makerSelf2 = i++;  // the same, its little press lever pulled down (it prints by itself, 5-02)
  CELL.makerFace = i++;   // the card with the protagonist card-maker's face (6-08)
  CELL.cheat = i++;       // Doubao's crib sheet (4-09)
  CELL.count = i;
}
// cells per atlas row/column (cards.js paints them; 16 x 11 fit in the 4096 atlas)
export const ATLAS_COLS = 16;
