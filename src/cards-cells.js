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
  // v3 reel
  CELL.tab = i++;         // the red 批准？ APPROVE? box on a proposal card (alpha: only the box)
  CELL.ink0 = i++; CELL.ink1 = i++;   // the red 批准 stamp mark where the box is (alpha), two pressings
  CELL.pair = i++;        // the two paper people holding hands (painted at load from paper.pairPicture)
  for (const k of KINGS) CELL[`court_${k.id}`] = i++;   // each king's double-headed court card (portrait painted at load)
  // 《失控》
  for (let g = 0; g < 4; g++) CELL[`old${g}`] = i++;   // before ChatGPT: Deep Blue, Watson, AlphaGo, GPT-2
  CELL.chatFace = i++;    // ChatGPT awake: its card with a dark screen where the cartouche was
  CELL.chatText = i++;    // the text that writes itself on that screen: G = mask, R/G = reading order (freecards reveal)
  CELL.gpt45 = i++;       // the door-sized GPT-4.5 (3-06), gold frame
  // v3 (榜首): the internal models nobody released, two per company, stamped 内部 · 禁止发布; the #1 card the eye deals
  for (const k of KINGS) for (let f = 0; f < 2; f++) CELL[`future_${k.id}_${f}`] = i++;
  CELL.num1 = i++;
  CELL.aiAuto = i++;   // v9: the card slapped on the writer's name: AI 托管
  CELL.old4 = i++; CELL.old5 = i++;   // v13: Deep Blue, Watson (the pile before the film starts)
  CELL.count = i;
}
// cells per atlas row/column (cards.js paints them; 16 x 11 fit in the 4096 atlas)
export const ATLAS_COLS = 16;
