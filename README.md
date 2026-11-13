# TOO SLOW

English | [简体中文](README.zh-CN.md)

[![TOO SLOW: click to watch the film on X](docs/cover.jpg)](https://x.com/maker_jackie/status/2121167705160261634)

**▶ [Watch the film on X](https://x.com/maker_jackie/status/2121167705160261634)**

**A 2:42 animated short made entirely in code.** Every frame is rendered with three.js and every sound, the score included, is synthesized in JavaScript. The film uses no image, video or audio assets and no generative image, video or audio model.

> The kings of the AI labs sit at one table and play model cards: the stronger card takes #1. The round timer keeps getting shorter. A polite offer appears on every screen: *"Too slow? Let AI play for you."* The ones who decline are eliminated for being too slow. The ones who accept find that CANCEL no longer answers.

A dark comedy set in another world. Written by a human (MakerJackie); directed, animated, scored and edited in code by Claude Fable 5.2, with Claude Opus 5.5 on parts of the work. Company names and logos appear as satire; any resemblance to the real world is purely coincidental.

## Watch

- **On X**: [x.com/maker_jackie](https://x.com/maker_jackie/status/2121167705160261634)
- **In your browser, rendered live from this code**:

  ```bash
  npm install
  npm run build        # dist/jokers_wild.html
  ```

  Open `dist/jokers_wild.html` in Chrome or Edge and press PLAY. Space pauses, ← → seek, F is fullscreen, `?t=90` starts at a time.

## Render the final cut

Needs Node 20+, ffmpeg on the PATH and Chrome (set `CHROME=/path/to/chrome` if it is not found).

```bash
npm install
npm run final                    # out/final: 4K master, a lighter 4K, 1080p (about half an hour on a desktop GPU)
node tools/final.mjs --only 1080 # the 1080p alone (about five minutes)
```

Every frame is a pure function of time, so any frame can be rendered alone and the film can be rendered again at any size. The score is rendered offline from the same event list the picture uses.

## Numbers

- 82 shots, 3,895 frames at 24 fps, 3840×2160
- about 23,000 lines of JavaScript in `src/`
- 7 days and 22 versions from the first script to the final cut

## Layout

| Path | What it is |
|---|---|
| `docs/script/shots.txt` | the shot table, the single source of timing (`npm run shots` regenerates `src/shots-data.js`) |
| `src/dir/story.js` | the story as data: every card played, every press, every elimination |
| `src/dir/reel.js`, `src/dir/cams.js` | the state of the film at any time; one camera function per shot |
| `src/screens.js`, `src/cards.js`, `src/kings.js`, `src/leaderboard.js` | the kings' screens, the cards, the kings, the #1 board |
| `src/sound-events.js`, `src/audio*.js` | every sound as data from the same story; the score and the mix |
| `tools/` | build, stills (`snap`), probes, the frame renderer, the audio renderer, `final.mjs` |
| `tools/covers.mjs`, `tools/kit.py`, `docs/publish/` | the covers (composed from stills of the film), titles, descriptions and the publishing kit |
| `archive/` | earlier versions of the film (v1 to v3), kept for reference |

Other files under `docs/` describe earlier versions of the film and are kept as history.

## Tools

```bash
npm run serve                    # http://localhost:5207
npm run snap -- 60 75.5          # stills at film times -> out/snaps
npm run audio                    # out/score.wav, with a loudness report and a click scan
npm run shots                    # after editing docs/script/shots.txt (needs Python)
```

## License

MIT © MakerJackie. Company names and logos belong to their owners and appear here as satire.
