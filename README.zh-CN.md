# TOO SLOW

[English](README.md) | 简体中文

[![TOO SLOW：点击在 X 上观看](docs/cover-zh.jpg)](https://x.com/maker_jackie/status/2121167705160261634)

**▶ [在 X 上观看短片](https://x.com/maker_jackie/status/2121167705160261634)**

**一部 2 分 42 秒、完全用代码做的动画短片。** 每一帧都由 three.js 渲染，配乐和音效全部用 JavaScript 合成。影片没有用任何图片、视频或音频素材，也没有用任何图像、视频或音频生成模型。

> AI 公司的国王们围坐一桌出模型牌，谁的牌更强谁就是第一。出牌倒计时越来越短，每块屏幕上弹出一句客气的话："Too slow? Let AI play for you."（太慢了？让 AI 替你出。）不肯托管的人因为太慢被淘汰；按了托管的人发现，取消键再也没有反应。

一部发生在另一个世界的黑色幽默短片。编剧是人类（MakerJackie）；导演、动画、配乐、音效和剪辑由 Claude Fable 5.2 用代码完成，部分环节由 Claude Opus 5.5 协助。片中出现的公司名称和标志仅用于讽刺，如有雷同，纯属巧合。

## 观看

- **在 X 上看**：[x.com/maker_jackie](https://x.com/maker_jackie/status/2121167705160261634)
- **在浏览器里看，由这份代码实时渲染**：

  ```bash
  npm install
  npm run build        # 生成 dist/jokers_wild.html
  ```

  用 Chrome 或 Edge 打开 `dist/jokers_wild.html`，点击 PLAY。空格暂停，← → 快进快退，F 全屏，加 `?t=90` 可以从第 90 秒开始。

## 渲染成片

需要 Node 20 以上、PATH 里有 ffmpeg，以及 Chrome（找不到时设置 `CHROME=/path/to/chrome`）。

```bash
npm install
npm run final                    # 输出到 out/final：4K 母版、较小的 4K、1080p（台式机显卡约半小时）
node tools/final.mjs --only 1080 # 只出 1080p（约五分钟）
```

每一帧都只由时间决定，所以任何一帧都可以单独渲染，整部片子也可以按任意尺寸重新渲染。配乐离线渲染，用的是和画面同一份事件列表。

## 数据

- 82 个镜头，3,895 帧，24 帧每秒，3840×2160
- `src/` 里约 2.3 万行 JavaScript
- 从第一版剧本到成片 7 天，共 22 个版本

## 结构

| 路径 | 内容 |
|---|---|
| `docs/script/shots.txt` | 镜头表，所有时间的唯一来源（改完运行 `npm run shots` 重新生成 `src/shots-data.js`） |
| `src/dir/story.js` | 用数据写成的故事：每一张出的牌、每一次按键、每一次淘汰 |
| `src/dir/reel.js`、`src/dir/cams.js` | 任意时刻的画面状态；每个镜头一个摄像机函数 |
| `src/screens.js`、`src/cards.js`、`src/kings.js`、`src/leaderboard.js` | 国王们的屏幕、牌、国王、第一名排行榜 |
| `src/sound-events.js`、`src/audio*.js` | 从同一个故事生成的全部声音事件；配乐和混音 |
| `tools/` | 构建、截图（`snap`）、调试探针、逐帧渲染、音频渲染、`final.mjs` |
| `tools/covers.mjs`、`tools/kit.py`、`docs/publish/` | 封面（用片中剧照合成）、标题、简介和发布包 |
| `archive/` | 早期版本（v1 到 v3），留作参考 |

`docs/` 下的其他文件记录的是早期版本，作为历史保留。

## 工具

```bash
npm run serve                    # http://localhost:5207
npm run snap -- 60 75.5          # 按影片时间截图，输出到 out/snaps
npm run audio                    # 生成 out/score.wav，附响度报告和爆音检查
npm run shots                    # 修改 docs/script/shots.txt 之后运行（需要 Python）
```

## 许可证

MIT © MakerJackie。片中的公司名称和标志归各自所有者，仅用于讽刺。
