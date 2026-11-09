// 《失控》 v4 — the cards are plain playing cards: four suits, rank = strength. A is the top a person can read; past
// it the auto-play deals ranks that do not exist (14, 21, 99, ∞). Pure data: safe to import from Node tools and the
// sound department.
//   MODELS[suit][v] = { name, rank, beyond }    index v = CELL[`${suit}${v}`]
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '14', '21', '99', '∞'];
export const RANK_IX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
export const ACE = RANK_IX.A;
export const SUITS = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' };
export const MODELS = Object.fromEntries(Object.keys(SUITS).map((s) => [s, RANKS.map((r, v) => ({ name: `${SUITS[s]}${r}`, rank: r, beyond: v > ACE, score: v }))]));
export const MAX_V = RANKS.length;
export const MISTRAL = { name: '', rank: '', score: 0 };
export const scoreText = (s) => String(s);
