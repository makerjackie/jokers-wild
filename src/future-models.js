// 《失控》 v3 — the internal models nobody has released: invented names, the film's future (not anyone's real roadmap).
// Two per company; atlas cells CELL[`future_${id}_${f}`] (cards-cells.js), painted by cards.js.
// (v20) four per company, in order (never back): the unreleased ones are far ahead of anything released, and the numbers run
// away: 20, 30, 50, 99. Every company the same ladder, so the board and the cards agree.
const LADDER = [20, 30, 50, 99];
export const FUTURE = Object.fromEntries(Object.entries({ openai: 'GPT-', anthropic: 'Claude ', google: 'Gemini ', xai: 'Grok ', meta: 'Muse ', mistral: 'Mistral ', glm: 'FatFish ' })
  .map(([id, base]) => [id, LADDER.map((n) => base + n)]));
