// JOKERS WILD v2 — the split-flap scoreboard's whole history. Only three things, big enough to read:
// row 0: the date and the multiplier; row 2: who is #1 right now (rows 3-9 join in when everyone claims #1).
// After 王炸 the date and the names turn into machine glyphs and the #1 is the jokers.
import { CUES } from '../shots.js';
import { MODELS } from '../models.js';
import { at, end } from './core.js';
import { allThrows, LADDER, FIRST, DOUBLE, V3, O1, R1, RACE5 } from './throws.js';
import { CELL } from '../cards-cells.js';

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const lpad = (s, n) => (' '.repeat(n) + s).slice(-n);
const SHORT = {
  'Claude 3.5 Sonnet': 'Sonnet 3.5', 'Claude Opus 4': 'Opus 4', 'Claude Opus 4.6': 'Opus 4.6', 'Claude Mythos': 'Mythos', 'Claude Fable 5': 'Fable 5',
  'Claude Opus 5.5': 'Opus 5.5', 'Gemini 1.5 Pro': 'Gemini 1.5', 'Gemini 2.5 Pro': 'Gemini 2.5', 'Gemini 3 Pro': 'Gemini 3', 'DeepSeek LLM': 'DeepSeek',
  'DeepSeek-V2': 'DeepSeekV2', 'DeepSeek-V3': 'DeepSeekV3', 'DeepSeek-R1': 'R1', 'DeepSeek-V3.2': 'V3.2', 'DeepSeek-V4': 'V4', 'DeepSeek-V4.1': 'V4.1',
  'Qwen2.5-Max': 'Qwen2.5Max', 'Kimi k1.5': 'k1.5', 'K2 Thinking': 'K2 Think', 'Muse Glimmer': 'Glimmer',
};
const short = (n) => (SHORT[n] ?? n).slice(0, 10);
const sc2 = (s) => (Math.abs(s - Math.round(s)) < 1e-6 ? String(Math.round(s)) : s.toFixed(s < 99 ? 1 : 2));
export const glyphs = (n, seed) => Array.from({ length: n }, (_, i) => `{g${(seed * 7 + i * 5) % 16}}`).join('');
const top = (id, v) => { const m = MODELS[id][Math.min(v, MODELS[id].length - 1)]; return `#1 {${id}} ` + pad(short(m.name), 10) + lpad(sc2(m.score), 5); };
const landOf = (id, cell) => allThrows().find((x) => x.who === id && x.cell === cell)?.land;

let ROWS = null;
export function boardRows() {
  if (ROWS) return ROWS;
  const rows = Array.from({ length: 12 }, () => [{ t: -1, text: '' }]);
  const push = (r, t, text) => { const L = rows[r]; if (L[L.length - 1].text !== text) L.push({ t, text }); };
  // ---------------------------------------------------------------- the #1 (row 2)
  const ev = [[FIRST.t + FIRST.flight + 0.45, 'openai', 0]];
  for (const [, id, v] of LADDER) ev.push([landOf(id, CELL[`${id}${v}`]) + 0.2, id, v]);
  ev.push([DOUBLE.t + DOUBLE.flight + 0.3, 'openai', 2], [V3.t + V3.flight + 0.25, 'deepseek', 3], [O1.grab + 0.4, 'openai', 3], [R1.t + R1.flight + 0.3, 'deepseek', 4]);
  for (const [row, id, v] of RACE5) ev.push([end(row, -0.07) + 0.4, id, v]);
  // the frenzy and the party: the #1 changes hands faster than the flaps can keep up
  const ids = ['openai', 'anthropic', 'deepseek', 'google', 'qwen', 'xai', 'kimi', 'glm', 'meta', 'doubao'];
  const vAt = (id, k) => Math.min(MODELS[id].length - 1, 4 + (k % 3));
  for (let i = 0; i < 5; i++) ev.push([at('5-10', 0.1) + i * 0.38, ids[(i * 3) % 10], vAt(ids[(i * 3) % 10], i)]);
  for (let i = 0; i < 22; i++) ev.push([at('6-07', 0.1) + i * 0.17, ids[(i * 7) % 10], vAt(ids[(i * 7) % 10], i + 1)]);
  for (let i = 0; i < 8; i++) ev.push([at('7-10', 0.2) + i * 0.6, ids[(i * 3 + 1) % 10], Math.min(MODELS[ids[(i * 3 + 1) % 10]].length - 1, 6)]);
  ev.sort((a, b) => a[0] - b[0]);
  for (const [t, id, v] of ev) if (t < CUES.wave) push(2, t, top(id, v));
  // ---- 2-19: every row claims #1 (rows 3-9 flip in, each to a different king, then cycle), cleared at the double
  const jam = at('2-19', 0.15);
  for (let r = 3; r <= 9; r++) {
    for (let k = 0; k < 5; k++) { const id = ids[(r * 3 + k * 7) % 10]; push(r, jam + (r - 3) * 0.06 + k * 0.28, top(id, Math.min(MODELS[id].length - 1, 1 + (k % 2)))); }
    push(r, DOUBLE.t + DOUBLE.flight + 0.15 + r * 0.03, '');
  }
  // the tie of the two 95s: two #1s
  push(3, DOUBLE.t + DOUBLE.flight + 0.5, top('deepseek', 2));
  push(3, V3.t + V3.flight + 0.25, '');
  // ---------------------------------------------------------------- the date and the multiplier (row 0)
  const dates = [[-1, '2022·11'], [at('2-01', 0.1), '2023·03'],
    ...LADDER.map(([, id, v], i) => [landOf(id, CELL[`${id}${v}`]) + 0.15, ['2023·04', '2023·12', '2024·01', '2024·03', '2024·03', '2024·04', '2024·05', '2024·08'][i]]),
    [at('2-19', 0.25), '2024·11'], [V3.t + V3.flight + 0.2, '2024·12'], [R1.t + R1.flight + 0.25, '2025·01'], [at('4-12', 0.4), '2025·02'],
    [end('5-01', 0.2), '2025·04'], [end('5-03', 0.2), '2025·05'], [end('5-05', 0.2), '2025·06'], [end('5-07', 0.2), '2025·07'],
    ...['2025·08', '2025·09', '2025·10', '2025·11', '2025·12', '2026·01', '2026·02', '2026·03'].map((d, i) => [at('5-10', 0.1) + i * 0.22, d]),
    [at('6-01', 0.1), '2026·04'], [at('6-07', 0.4), '2026·05'], [at('6-07', 1.6), '2026·06'], [at('6-07', 2.8), '2026·07'], [at('7-01', 0.2), '2026·08'],
    [at('7-10', 0.2), '2026·09'], [at('7-10', 2.6), '2026·10'], [at('7-11', 0.3), '2026·11'],      // ← now: it holds
    [CUES.burst + 0.2, '2026·12'], [CUES.wave + 0.3, glyphs(4, 1) + '·' + glyphs(2, 2)]];
  const mult = [[-1, 1], [at('5-10', 0.3), 2], [at('5-10', 0.9), 4], [at('5-10', 1.5), 8], [at('6-01', 0.3), 16], [at('6-03', 0.3), 32], [at('6-05', 0.2), 64],
    [at('6-07', 0.3), 128], [at('6-07', 1.0), 256], [at('6-07', 1.7), 512], [at('6-07', 2.4), 1024]];
  const multAt = (t) => { let m = 1; for (const [tm, v] of mult) if (tm <= t) m = v; return m; };
  const row0 = (d, t) => pad(d, 9) + (t > CUES.wave + 0.3 ? lpad(glyphs(3, 5), 11) : lpad(`倍数 ×${multAt(t)}`, 11));
  const times = [...dates.map((d) => d[0]), ...mult.map((m) => m[0]), CUES.wave + 0.3].sort((a, b) => a - b);
  for (const tt of times) { let d = ''; for (const [td, v] of dates) if (td <= tt) d = v; if (d) push(0, tt, row0(d, tt)); }
  // ---------------------------------------------------------------- after 王炸: the jokers are #1 for good
  push(2, CUES.wave + 0.5, '#1 {joker}{joker} ' + glyphs(6, 3) + '  ' + glyphs(3, 9));
  ROWS = rows;
  return rows;
}
void end;
