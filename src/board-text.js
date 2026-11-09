// Everything the split-flap scoreboard can show. The set module builds its glyph atlas from these at load.
// A logo token like '{openai}' (or a glyph token '{g3}') occupies one cell.
export const BOARD_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#·:：%×.-/+ ' +
  '♠♥♦♣∞人类要不起服务器繁忙批准托管倍数开源第一国产最强通义千问豆包智谱率';
export const BOARD_LOGOS = ['openai', 'anthropic', 'google', 'xai', 'meta', 'deepseek', 'qwen', 'kimi', 'glm', 'doubao', 'mistral', 'joker'];
// unreadable machine glyphs (the date and names turn into these after the takeover): '{g0}'..'{g15}'
export const BOARD_GLYPHS = 16;
// split a board string into cells: '{openai} OpenAI #1' -> ['{openai}', ' ', 'O', ...]
export function cells(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { const j = text.indexOf('}', i); out.push(text.slice(i, j + 1)); i = j; } else out.push(text[i]);
  }
  return out;
}
