// JOKERS WILD — the split-flap scoreboard's whole history. Row 0: the date and the multiplier. Rows 1-10: the
// ranking (each company's latest card, best score first: every new #1 makes the whole board flip). Row 11: notices.
// The set module animates the flips between consecutive entries of a row.
import { ROW, CUES } from '../shots.js';
import { MODELS, MISTRAL } from '../models.js';
import { at, end } from './core.js';
import { allThrows, LADDER, DOUBLE, O1, R1, LLAMA, BOMB } from './throws.js';
import { CELL } from '../cards-cells.js';

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const lpad = (s, n) => (' '.repeat(n) + s).slice(-n);
const SHORT = {
  'Claude 3.5 Sonnet': 'Sonnet 3.5', 'Claude Opus 4': 'Opus 4', 'Claude Opus 4.6': 'Opus 4.6', 'Claude Mythos': 'Mythos', 'Claude Fable 5': 'Fable 5',
  'Claude Opus 5.5': 'Opus 5.5', 'Gemini 1.5 Pro': 'Gemini 1.5', 'Gemini 2.5 Pro': 'Gemini 2.5', 'Gemini 3 Pro': 'Gemini 3', 'DeepSeek LLM': 'DeepSeek',
  'DeepSeek-V2': 'DeepSeekV2', 'DeepSeek-V3': 'DeepSeekV3', 'DeepSeek-R1': 'R1', 'DeepSeek-V3.2': 'V3.2', 'DeepSeek-V4': 'V4', 'DeepSeek-V4.1': 'V4.1',
  'Qwen2.5-Max': 'Qwen2.5Max', 'Kimi k1.5': 'k1.5', 'K2 Thinking': 'K2 Think', 'Muse Glimmer': 'Glimmer', 'Mistral Large 2': 'Mistral',
};
const short = (n) => (SHORT[n] ?? n).slice(0, 10);
const sc2 = (s) => (Math.abs(s - Math.round(s)) < 1e-6 ? String(Math.round(s)) : s.toFixed(s < 99 ? 1 : 2));
export const glyphs = (n, seed) => Array.from({ length: n }, (_, i) => `{g${(seed * 7 + i * 5) % 16}}`).join('');
const rowText = (r, id, m) => (r ? pad(`#${r}`, 3) : '   ') + `{${id}} ` + pad(short(m.name), 10) + lpad(sc2(m.score), 5);

// the moments the board learns a new card: [t, id, model index]
function rankingEvents() {
  const ev = [[at('1-03', 10.3), 'openai', 0]];
  const th = allThrows();
  // the ladder: the board reacts a beat after each card lands
  const byCell = (id, v) => th.find((x) => x.cell === CELL[`${id}${v}`] && x.who === id);
  for (const [, id, v] of LADDER) { const x = byCell(id, v); ev.push([x.land + (id === 'xai' ? -0.12 : 0.22), id, v]); }
  ev.push([DOUBLE.t + DOUBLE.flight + 0.3, 'openai', 2], [DOUBLE.t + DOUBLE.flight + 0.32, 'deepseek', 2]);
  ev.push([O1.grab + 0.5, 'openai', 3]);
  ev.push([R1.t + R1.flight + 0.35, 'deepseek', 4]);
  // between the duel and the rush the others catch up off-screen (dates they really released)
  for (const [t, id, v] of [[at('3-12', 0.5), 'qwen', 3], [at('3-12', 0.8), 'kimi', 1], [at('3-12', 1.1), 'doubao', 2], [at('3-12', 1.4), 'google', 4],
    [at('4-01', 0.4), 'anthropic', 3], [at('4-01', 0.8), 'xai', 2], [LLAMA.t + LLAMA.flight + 0.2, 'meta', 4], [at('4-03', 0.3), 'glm', 3],
    [at('4-04', 0.2), 'kimi', 4], [at('4-11', 0.2), 'anthropic', 4], [at('5-01', 0.1), 'qwen', 6], [at('5-01', 0.3), 'glm', 4]]) ev.push([t, id, v]);
  // the rush: everyone's latest, faster than the flaps can keep up
  const rush = [['openai', 6], ['anthropic', 5], ['deepseek', 6], ['google', 6], ['xai', 5], ['qwen', 6], ['kimi', 5], ['glm', 5], ['meta', 5], ['doubao', 5],
    ['anthropic', 6], ['openai', 7], ['google', 7], ['deepseek', 7], ['qwen', 7], ['kimi', 6], ['glm', 6], ['xai', 7], ['meta', 6], ['anthropic', 7]];
  rush.forEach(([id, v], i) => ev.push([at('6-01', 0.1) + i * 0.12 * (i < 10 ? 1 : 0.6) + (i >= 10 ? at('6-10') - at('6-01') : 0), id, v]));
  return ev.sort((a, b) => a[0] - b[0]);
}

let ROWS = null;
export function boardRows() {
  if (ROWS) return ROWS;
  const rows = Array.from({ length: 12 }, () => [{ t: -1, text: '' }]);
  const push = (r, t, text) => { const L = rows[r]; if (L[L.length - 1].text !== text) L.push({ t, text }); };
  // ---- row 0: the date and the multiplier
  const party = ROW['7-10'].cuts;
  const dates = [[at('1-03', 10.0), '2022·11'], ...LADDER.map(([row], i) => [end(row, 0.4), ['2023·04', '2023·12', '2024·01', '2024·03', '2024·03', '2024·04', '2024·05', '2024·08'][i]]),
    [at('2-19', 0.3), '2024·11'], [at('3-03', 0.2), '2024·12'], [R1.t + 0.9, '2025·01'], [at('3-10', 0.3), '2025·12'], [at('3-11', 0.2), '2026·01'], [at('4-04', 0.1), '2026·02'],
    [at('6-01', 0.05), '2026·03'], [at('6-01', 0.3), '2026·04'], [at('6-01', 0.55), '2026·05'], [at('6-01', 0.8), '2026·06'], [at('6-10', 0.2), '2026·08'],
    [party[0].t0, '2026·09'], [party[6].t0, '2026·10'], [party[11].t0 + 0.05, '2026·11'], [party[13].t0 + 0.05, '2026·12'], [party[14].t0 + 0.05, '2027·01'], [party[15].t0 + 0.05, '2027·02'],
    [at('8-01', 0.1), glyphs(4, 1) + '·' + glyphs(2, 2)]];
  const mult = [[-1, 1], [BOMB.blast + 0.1, 2], [at('6-03', 0.05), 4], [at('6-03', 0.15), 8], [at('6-03', 0.24), 16], [at('6-03', 0.32), 64], [at('6-03', 0.4), 256], [at('6-03', 0.5), 1024]];
  const multAt = (t) => { let m = 1; for (const [tm, v] of mult) if (tm <= t) m = v; return m; };
  const row0 = (d, t) => pad(d, 9) + lpad(`倍数 ×${multAt(t)}`, 11);
  const times = [...dates.map((d) => d[0]), ...mult.map((m) => m[0])].sort((a, b) => a - b);
  for (const tt of times) { let d = ''; for (const [td, v] of dates) if (td <= tt) d = v; if (d) push(0, tt, row0(d, tt)); }
  // ---- rows 1-10: the ranking
  const latest = {};
  const writeRanking = (t, rankOverride) => {
    const list = Object.entries(latest).map(([id, v]) => ({ id, m: MODELS[id][v] })).sort((a, b) => b.m.score - a.m.score);
    for (let r = 0; r < 10; r++) {
      const e = list[r];
      push(r + 1, t, e ? rowText(rankOverride ? 1 : r + 1, e.id, e.m) : '');
    }
  };
  const evs = rankingEvents();
  const jam0 = at('2-18', 0.05), jam1 = at('2-19', 1.0), unjam = DOUBLE.t + DOUBLE.flight + 0.25;
  for (const [t, id, v] of evs) {
    latest[id] = v;
    if (t > jam0 && t < unjam) continue;
    writeRanking(t);
    if (t >= at('2-17') && t < at('2-18')) {
      // Grok is #1 for a blink: the rows start fighting over #1 and flip it away
      writeRanking(t + 0.55, true);
    }
  }
  // 2-18/2-19: everyone claims #1, flipping faster and faster until the rows jam (set: board.jam)
  {
    let t = jam0, g = 0.2, k = 0;
    while (t < jam1) {
      const list = Object.entries(latest).map(([id, v]) => ({ id, m: MODELS[id][v] })).sort((a, b) => b.m.score - a.m.score);
      for (let r = 0; r < 10; r++) { const e = list[r]; if (!e) continue; push(r + 1, t + r * 0.013, rowText((k + r) % 2 ? 1 : r + 1, e.id, e.m)); }
      t += g; g = Math.max(0.07, g * 0.86); k++;
    }
    const list = Object.entries(latest).map(([id, v]) => ({ id, m: MODELS[id][v] })).sort((a, b) => b.m.score - a.m.score);
    for (let r = 0; r < 10; r++) { const e = list[r]; if (e) push(r + 1, jam1 + r * 0.01, rowText(1, e.id, e.m)); }
    // the two 95s land: the jam breaks, two #1s on top
    latest.openai = 2; latest.deepseek = 2;
    const after = Object.entries(latest).map(([id, v]) => ({ id, m: MODELS[id][v] })).sort((a, b) => b.m.score - a.m.score);
    for (let r = 0; r < 10; r++) { const e = after[r]; if (e) push(r + 1, unjam + r * 0.02, rowText(r < 2 ? 1 : r + 1, e.id, e.m)); }
  }
  // Llama 4 (4-02): #1 in make-up, wiped down to #32
  {
    const m = MODELS.meta[4];
    const r = 1;
    push(r, LLAMA.wipe[0] - 0.35, rowText(1, 'meta', { ...m, name: 'Llama 4' }));
    push(r, LLAMA.wipe[1] + 0.1, rowText(32, 'meta', m).replace('#32', '#32'));
  }
  // the party (7-10, cut 4): every row a #1
  {
    const p3 = ROW['7-10'].cuts[3].t0 - 0.15;
    for (let r = 1; r <= 10; r++) { const L = rows[r]; let last = ''; for (const e of L) if (e.t <= p3) last = e.text; if (last) push(r, p3 + r * 0.012, '#1 ' + last.slice(3)); }
  }
  // ---- row 11: notices
  push(11, at('2-24', 0.85), pad(`{mistral} ${short(MISTRAL.name)}`, 11) + ' 要不起 PASS');
  push(11, at('3-01'), '');
  push(11, at('6-09', 0.6), '   批准 APPROVED 93%');
  push(11, at('6-10', 1.2), '');
  // the takeover: names melt into glyphs row by row
  for (let r = 1; r <= 10; r++) {
    const L = rows[r], last = L[L.length - 1].text;
    const logo = (last.match(/\{[a-z]+\}/) ?? ['{g1}'])[0];
    push(r, at('8-01', 0.2 + r * 0.15), `${pad('#1', 3)}${logo} ${glyphs(10, r + 3)}${lpad('', 5)}`);
  }
  // the end (11-05): the pair on top, every other row flips to blank, then the bottom line
  const e0 = at('11-05', 0.2);
  push(0, e0, glyphs(4, 9) + '·' + glyphs(2, 4) + '      ' + glyphs(5, 6));
  push(1, e0 + 0.3, `#1 {joker}{joker} ${glyphs(9, 11)}`);
  for (let r = 2; r <= 10; r++) push(r, e0 + 0.6 + (r - 2) * 0.3, '');
  push(11, at('11-06', 0.3), '人类：要不起 HUMANS: PASS');
  // entries were written per event, not in time order: sort each row, then drop repeats
  for (let r = 0; r < rows.length; r++) {
    const L = rows[r].map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    const out = [];
    for (const e of L) if (!out.length || out[out.length - 1].text !== e.text) out.push({ t: e.t, text: e.text });
    rows[r] = out;
  }
  ROWS = rows;
  return rows;
}
export const BUSY = { row: 1, t: at('3-09', 0.45) };
void CUES; void O1;
