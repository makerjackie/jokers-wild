// JOKERS WILD — the real model cards. Every company plays its real releases in release order
// (source: docs/research/ai-launches.csv). Pure data: safe to import from Node tools and the sound department.
//
//   MODELS[id] = [{ name, date: 'YYYY·MM', score, rank? }, ...]   index = the card's version number v (CELL[`${id}${v}`])
//   score: the number in the card's corners. It must beat the last card, so the ladder of the duel (seq 2-3) is set
//   by the script; after R1 (2025·01) every benchmark creeps toward 100 and grows decimals (the saturation joke).
//   rank: a #n rosette printed on the card (the claims the companies made).

const sat = (date) => {
  // months since 2025·01 -> 97 .. 100, more decimals as it saturates
  const [y, m] = date.split('·').map(Number);
  const k = (y - 2025) * 12 + (m - 1);
  return 100 - 3 * Math.pow(0.5, k / 2.4);
};

export const MODELS = {
  openai: [
    { name: 'ChatGPT', date: '2022·11', score: 70, rank: 1 },
    { name: 'GPT-4', date: '2023·03', score: 80 },
    { name: 'GPT-4o', date: '2024·11', score: 95, rank: 1 },
    { name: 'o1', date: '2024·12', score: 96, rank: 1 },
    { name: 'o3', date: '2025·04' },
    { name: 'GPT-5', date: '2025·08' },
    { name: 'GPT-5.5', date: '2026·04' },
    { name: 'GPT-6', date: '2026·09', rank: 1 },
  ],
  anthropic: [
    { name: 'Claude', date: '2023·03', score: 74 },
    { name: 'Claude 3', date: '2024·03', score: 81 },
    { name: 'Claude 3.5 Sonnet', date: '2024·06', score: 88 },
    { name: 'Claude Opus 4', date: '2025·05' },
    { name: 'Claude Opus 4.6', date: '2026·02' },
    { name: 'Claude Mythos', date: '2026·04' },
    { name: 'Claude Fable 5', date: '2026·06' },
    { name: 'Claude Opus 5.5', date: '2026·09', rank: 1 },
  ],
  google: [
    { name: 'Bard', date: '2023·03', score: 71 },
    { name: 'Gemini', date: '2023·12', score: 75 },
    { name: 'Gemini 1.5 Pro', date: '2024·02', score: 83 },
    { name: 'Gemini 2.0', date: '2024·12', score: 95.5 },
    { name: 'Gemini 2.5 Pro', date: '2025·03', rank: 1 },
    { name: 'Gemini 3 Pro', date: '2025·11', rank: 1 },
    { name: 'Gemini 3.5', date: '2026·05' },
    { name: 'Gemini 4', date: '2026·09', rank: 1 },
  ],
  xai: [
    { name: 'Grok-1', date: '2023·11', score: 73 },
    { name: 'Grok-2', date: '2024·08', score: 93, rank: 1 },
    { name: 'Grok 3', date: '2025·02', rank: 1 },
    { name: 'Grok 4', date: '2025·07' },
    { name: 'Grok 4.1', date: '2025·11', rank: 1 },
    { name: 'Grok 4.20', date: '2026·03' },
    { name: 'Grok 4.5', date: '2026·07' },
    { name: 'Grok 4.7', date: '2026·09' },
  ],
  meta: [
    { name: 'LLaMA', date: '2023·02', score: 72 },
    { name: 'Llama 2', date: '2023·07', score: 76 },
    { name: 'Llama 3', date: '2024·04', score: 87 },
    { name: 'Llama 3.1', date: '2024·07', score: 91 },
    { name: 'Llama 4', date: '2025·04', rank: 32 },
    { name: 'Muse Spark', date: '2026·04' },
    { name: 'Muse Glimmer', date: '2026·08' },
  ],
  mistral: [
    { name: 'Mistral 7B', date: '2023·09', score: 71 },
    { name: 'Mixtral 8x7B', date: '2023·12', score: 77 },
    { name: 'Mistral Large', date: '2024·02', score: 81 },
    { name: 'Mistral Large 2', date: '2024·07', score: 88 },
    { name: 'Mistral Small 3', date: '2025·01' },
    { name: 'Mistral Medium 3', date: '2025·05' },
    { name: 'Magistral', date: '2025·06' },
    { name: 'Medium 3.1', date: '2025·08' },
  ],
  // the Chinese side: 混沌 (wholly invented, the lead) and four joke brands: 大肥鱼, 万问, 月饼, 豆沙包
  deepseek: [   // 混沌 HUNDUN: invented, stands for no real company
    { name: 'Hundun', date: '2023·06', score: 72 },
    { name: 'Hundun 2', date: '2024·03', score: 85 },
    { name: 'Hundun 2.5', date: '2024·09', score: 92 },
    { name: 'Hundun 3', date: '2024·12', score: 95.2 },
    { name: 'Hundun Max', date: '2025·03' },
    { name: 'Hundun 4', date: '2025·09' },
    { name: 'Hundun 4.5', date: '2026·03' },
    { name: 'Hundun 5', date: '2026·08' },
  ],
  qwen: [
    { name: '万问', date: '2023·04', score: 72 },
    { name: 'WanWen 2', date: '2024·06', score: 86 },
    { name: 'WanWen 2.5', date: '2024·09', score: 92 },
    { name: 'WanWen Max', date: '2025·01' },
    { name: 'WanWen 3', date: '2025·04' },
    { name: 'WanWen 3 Max', date: '2025·09' },
    { name: 'WanWen 3.5', date: '2026·02' },
    { name: 'WanWen 3.8', date: '2026·08' },
  ],
  kimi: [
    { name: '月饼', date: '2024·03', score: 84 },
    { name: 'Mooncake 1.5', date: '2025·01' },
    { name: 'Mooncake 2', date: '2025·07' },
    { name: 'Mooncake Think', date: '2025·11' },
    { name: 'Mooncake 2.5', date: '2026·01' },
    { name: 'Mooncake 2.6', date: '2026·04' },
    { name: 'Mooncake 3', date: '2026·07' },
  ],
  glm: [   // 大肥鱼 FatFish
    { name: 'FatFish', date: '2023·11', score: 74 },
    { name: 'FatFish 2', date: '2024·05', score: 89 },
    { name: 'FatFish 3', date: '2024·12', score: 95.5 },
    { name: 'FatFish-R1', date: '2025·01', score: 97, rank: 1 },
    { name: 'FatFish 3.2', date: '2025·12' },
    { name: 'FatFish 4', date: '2026·04' },
    { name: 'FatFish 4.1', date: '2026·09' },
  ],
  doubao: [
    { name: '豆沙包', date: '2023·08', score: 77 },
    { name: '豆沙包 Pro', date: '2024·05', score: 90 },
    { name: 'Dousha 1.5', date: '2025·01' },
    { name: 'Dousha OSS', date: '2025·08' },
    { name: 'Dousha 2', date: '2026·02' },
    { name: 'Dousha 2.1', date: '2026·06' },
  ],
};
for (const id in MODELS) for (const m of MODELS[id]) if (m.score == null) m.score = sat(m.date);
// v7: what the machines release once the kings hand them the game (托管, from 2026·11): invented names, the film's
// future, not anyone's roadmap. Appended to each company's list (so they get atlas cells); REAL_N[id] = how many are real.
export const REAL_N = Object.fromEntries(Object.entries(MODELS).map(([id, l]) => [id, l.length]));
const NEXT = {
  openai: ['GPT-7', 'GPT-8'], anthropic: ['Claude 6', 'Claude 7'], google: ['Gemini 5', 'Gemini 6'], xai: ['Grok 6', 'Grok 8'],
  meta: ['Muse Ultra', 'Muse Max'], deepseek: ['Hundun 6', 'Hundun 7'], qwen: ['WanWen 4', 'WanWen 5'],
  kimi: ['Mooncake 4', 'Mooncake 5'], mistral: ['Mistral 4', 'Mistral 5'], glm: ['FatFish 5', 'FatFish 6'], doubao: ['Dousha 3', 'Dousha 4'],
};
for (const id in NEXT) NEXT[id].forEach((name, i) => MODELS[id].push({ name, date: i ? '2027·06' : '2026·12', future: true }));
// the names the #1 board flips through under 托管 (k = 0, 1, 2 ...): faster than anyone can read
const LINE = { openai: ['GPT-', 7], anthropic: ['Claude ', 6], google: ['Gemini ', 5], xai: ['Grok ', 6], meta: ['Muse ', 2], deepseek: ['Hundun ', 6], qwen: ['WanWen ', 4], kimi: ['Mooncake ', 4], mistral: ['Mistral ', 4], glm: ['FatFish ', 5], doubao: ['Dousha ', 3] };
export function nextName(id, k) { const [b, v] = LINE[id]; const n = v + k * 0.5; return b + (Number.isInteger(n) ? n : n.toFixed(1)); }


// how a score is printed: whole numbers on the ladder, then as many decimals as it takes to beat the last one
export function scoreText(s) {
  if (Math.abs(s - Math.round(s)) < 1e-6) return String(Math.round(s));
  if (s < 99) return s.toFixed(1);
  if (s < 99.9) return s.toFixed(2);
  return s.toFixed(3);
}
// the card a company plays at film-date `date` (its latest release up to then)
export function modelAt(id, date) {
  const L = MODELS[id];
  let v = 0;
  for (let i = 0; i < L.length; i++) if (L[i].date <= date) v = i;
  return v;
}
// Mistral's one card (2-24): too small to beat anything on the table
export const MISTRAL = { name: 'Mistral Large 2', date: '2024·07', score: 71 };
export const MAX_V = Math.max(...Object.values(MODELS).map((l) => l.length));
