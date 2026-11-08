# 复盘：《王炸 / JOKERS WILD》

> 2026-11-06。上一部《轮到你了》失败后的重做。这份复盘给下一部片子用：哪些做法有效，哪些坑踩了。

## 这次做对了什么

1. **基调先行，样片定调。** 先做 3 种画风的静帧和 27 秒带配乐的基调样片，用户看完才进制作。用户只提了三条意见（头诡异、牌要是真实模型、红蓝阵营要一眼看出），全部在制作期解决。
2. **全权托管后，导演自己定，不再来回问。** 用户说"你是导演"之后，所有决定（画风、脸、牌、结尾）都直接拍板，写进 `docs/PRODUCTION.md`。
3. **一个数据源驱动画面和声音。** 出牌表（`src/dir/throws.js`）、记分牌历史（`src/dir/board.js`）、规则回放（`src/plan.js`）同时喂给导演和 `src/sound-events.js`。约 3000 个音效事件全部跟画面同源，不会错位。
4. **导演按段落拆文件**（`src/dir/s1.js … s10.js`），每段一个 `apply`（整段状态）加每镜一个函数（机位）。改一段不用读全片。
5. **部门并行**：布景、道具、国王、牌之王、声音 5 个 Agent 各管自己的文件，契约写在 `docs/PRODUCTION.md`。主 Agent 只做导演和集成。
6. **真实数据当笑点。** 牌面是真实模型名、按真实发布顺序；分数趋近 100 时小数越来越多（跑分饱和）。比编的更好笑。
7. **低分辨率全片预览很快**（960×540，全片约 2 分钟），可以频繁看整片。

## 踩过的坑（下次直接避开）

- **"上一帧状态"陷阱。** 导演里问模块要位置（`makerFrame`、`sealFace`、`bridgePoint`），拿到的是上一次渲染的状态，随机访问渲染时会错。改成：导演只给声明式的"挂靠"（`attach: { kind, id }`），由下游模块在本帧更新后解析；镜头贴眼睛用 `st.camAttach`，在 film.js 里国王更新之后再摆机位。
- **正面看压扁看不出来。** 国王被压成牌，从正前方拍只是少了纵深，跟没压一样。要用四分之三侧面拍。
- **自定义 uniform 重复声明** 会让着色器编译失败但画面不报错，只是东西不见了。用调试脚本查 `mesh.visible` 和控制台的 Shader Error。
- **cel 材质写 alpha=0**（给笔刷通道做标记），离屏渲染判断背景时要反过来用不透明清屏色。
- **镜头穿模**：环绕机位会钻进别的国王身体里、钻进王座里。环绕前算一遍轨迹经过哪里。
- **低机位要高于桌面**：`kf()` 的高度是相对座椅的，0.22 会把机位放进桌板里。
- **雪崩、炸弹之后桌上太乱**：大牌要炸出桌面，筹码洪水在下一个场景前清掉。连续性服从可读性。
- **画面太暗**：黑色电影风格在手机上容易糊成一片。全局曝光提到 1.28，暗场镜头单独加曝光和补光（新增第二个实用光 P3）。
- **Bash 里的 heredoc** 在这个环境偶尔整段解析失败。补丁脚本用 Write 写成文件再 `python -X utf8` 执行。
- **按住牌出现的跳帧**：牌出现在手里要缩放进入；动作切换用惯性化（重跑导演前几个子帧）消掉跳变。

## 下一部可以做得更好

- 一开始就把"每个笑点在 1080p 手机上能不能读出来"当验收标准，小道具（价签、钓竿、收费杆）都要专门的近景。
- 先定 M1 母题构图和房间尺寸，再让布景建房间；这次中途抬高记分牌、后拉 M1，布景返工了一次。
- 交付前留出完整听一遍配乐的时间，并让用户听过。

## v2 (2026-11-07): what the rewrite taught

- **A naive-viewer test works and is cheap.** Two frames per shot on six contact sheets, given to a fresh agent with
  no access to the script, answering fixed questions ("more or fewer padlocks?", "who pulls the strings?"). It caught
  the film's core idea reading backwards (locks "being added") — something the director, who knows the script, could
  not see. Run it before showing the user, and again after the fixes.
- **Repeat the same frame for a counted beat.** The lock beat only read once every removal used the identical
  square-on framing (five, four, three... padlocks, the opened ones piling up on the table below).
- **Show both ends of a relation.** Strings from the dark read as "the giants pull them". A visible card at the top of
  each string made the AI the puppeteer.
- **Readable labels beat clever props.** The AUTO button meant nothing until it said 托管 AUTO in big glowing type.
- **Every new prop blocks old cameras.** After each department lands, re-check every shot; boxes on the table broke
  six setups.

## 《失控》 (2026-11-07): what the rebuild taught

- **Isolate departments from the director's churn.** `tools/build-bench.mjs <name>` bundles one bench without the film,
  and `tools/build.mjs --silent` bundles the film without the score. Two agents worked for an hour each without ever
  breaking each other's builds.
- **A heap must be simulated, not scattered.** Cards dropped in order onto a heightfield, each settling as low as it can
  within a tilt cap, read as a real pile. Balancing each card on the highest sample made a 3 m spike. Any cosmetic tilt
  added after the simulation pokes corners through the cards above it.
- **Bisect a stray object.** `&freeSkip=a-b` drops a range of the free cards. Three snapshots found the one card whose
  corner showed through ChatGPT.
- **Things fly through the lens.** Streams of cards crossing an over-the-shoulder camera turned whole shots black.
  film.js now pushes any free card out of a 0.55 m sphere round the camera (except in the macro shots).
- **Cheat inserts.** In 4-01 the card in his hand turns its face to the lens (`hand.faceTo`), with his face soft behind
  it. Every honest angle was blocked by his arm or his crown.
- **Faces looking up need the camera at their height, not the floor's.** Pitched far back, the head showed only its chin.
  Aim the look about 40 degrees up and put the lens just below eye level.
