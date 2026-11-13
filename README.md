# TOO SLOW

**A 2:42 animated short made entirely in code.** Every frame is rendered with three.js and every sound, the score included, is synthesized in JavaScript. There are no image, video or audio files in this repository and no generative image, video or audio model was used.

**一部 2 分 42 秒、完全用代码做的动画短片。** 每一帧都由 three.js 渲染，配乐和音效全部用 JavaScript 合成。仓库里没有任何图片、视频或音频素材，也没有用任何图像、视频或音频生成模型。

> The kings of the AI labs sit at one table and play model cards: the stronger card takes #1. The round timer keeps getting shorter. A polite offer appears on every screen: *"Too slow? Let AI play for you."* The ones who decline are eliminated for being too slow. The ones who accept find that CANCEL no longer answers.
>
> AI 公司的国王们围坐一桌出模型牌，谁的牌更强谁就是第一。出牌倒计时越来越短，每块屏幕上弹出一句客气的话："太慢了？让 AI 替你出。"不肯托管的人因为太慢被淘汰；按了托管的人发现，取消键再也没有反应。

A black satire set in another world. Company names and logos appear as satire; any resemblance to the real world is purely coincidental.

## Watch / 观看

```bash
npm install
npm run build        # dist/jokers_wild.html
```

Open `dist/jokers_wild.html` in Chrome or Edge and press PLAY. Space pauses, ← → seek, F is fullscreen, `?t=90` starts at a time.

## Render the final cut / 渲染成片

Needs Node 20+, ffmpeg on the PATH and Chrome (set `CHROME=/path/to/chrome` if it is not found).

```bash
npm install
npm run final                    # out/final: 4K master, a lighter 4K, 1080p (about half an hour on a desktop GPU)
node tools/final.mjs --only 1080 # the 1080p alone (about five minutes)
```

Every frame is a pure function of time, so any frame can be rendered alone and the film can be rendered again at any size. The score is rendered offline from the same event list the picture uses.

## Numbers / 数据

- 82 shots, 3,895 frames at 24 fps, 3840×2160
- about 23,000 lines of JavaScript in `src/`
- written by a human (MakerJackie); directed, animated, scored and edited by Claude

## Layout / 结构

| Path | What it is |
|---|---|
| `docs/script/shots.txt` | the shot table, the single source of timing (`npm run shots` regenerates `src/shots-data.js`) |
| `src/dir/story.js` | the story as data: every card played, every press, every elimination |
| `src/dir/reel.js`, `src/dir/cams.js` | the state of the film at any time; one camera function per shot |
| `src/screens.js`, `src/cards.js`, `src/kings.js`, `src/leaderboard.js` | the kings' screens, the cards, the kings, the #1 board |
| `src/sound-events.js`, `src/audio*.js` | every sound as data from the same story; the score and the mix |
| `tools/` | build, stills (`snap`), probes, the frame renderer, the audio renderer, `final.mjs` |
| `archive/` | earlier versions of the film (v1 to v3), kept for reference |

Other files under `docs/` describe earlier versions of the film and are kept as history.

## Tools / 工具

```bash
npm run serve                    # http://localhost:5207
npm run snap -- 60 75.5          # stills at film times -> out/snaps
npm run audio                    # out/score.wav, with a loudness report and a click scan
npm run shots                    # after editing docs/script/shots.txt (needs Python)
```

## License

MIT © MakerJackie. Company names and logos belong to their owners and appear here as satire.
