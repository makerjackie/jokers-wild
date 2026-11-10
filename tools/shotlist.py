"""Build the shot list page and the planned-tension chart from docs/script/shots.txt.

usage: python -X utf8 tools/shotlist.py

Writes docs/script/SHOTLIST.md and docs/script/img/plan-anatomy.png, then prints
the totals and where the key beats land as a share of the running time.
"""
import collections
import pathlib
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "script" / "shots.txt"
OUT_MD = ROOT / "docs" / "script" / "SHOTLIST.md"
OUT_PNG = ROOT / "docs" / "script" / "img" / "plan-anatomy.png"
OUT_JS = ROOT / "src" / "shots-data.js"
MONTAGE_RE = re.compile(r"([\d.]+) 秒剪到 ([\d.]+) 秒")

# 《打，打个大西瓜》逐分钟张力分（画面组人工打分，见 docs/research/see-through.md）。原片 972 秒。
REF_LEN = 972.0
REF_TENSION = [(0, 3), (60, 5), (120, 7), (180, 6), (240, 6), (300, 6), (360, 7), (420, 6), (480, 8),
               (540, 2), (600, 4), (660, 8), (720, 8), (780, 10), (840, 6), (900, 2), (960, 1)]
REF_CUT = 674.2  # 11:14 狂欢被炮弹打断

LUFS = {0: -70, 1: -42, 2: -30, 3: -22, 4: -16, 5: -11}
KIND = {"L": "笑", "S": "惊", "C": "凉", "X": "奇观"}
MARK_RE = re.compile(r"^([LSCX])(\d+)\s*(.*)$")

Shot = collections.namedtuple("Shot", "id seq dur n shot pic sound cue tension loud marks t0 t1")


def parse():
    seqs, shots, t, cur = [], [], 0.0, None
    for raw in SRC.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            num, name, act = [p.strip() for p in line[1:].split("|")]
            cur = {"num": int(num), "name": name, "act": act, "shots": []}
            seqs.append(cur)
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 10:
            raise SystemExit(f"{len(parts)} columns, expected 10: {line[:40]}")
        sid, dur, n, shot, pic, sound, cue, tension, loud, marks = parts
        dur = float(dur)
        s = Shot(sid, cur["num"], dur, int(n), shot, pic, sound, cue, float(tension), int(loud), marks, t, t + dur)
        t += dur
        shots.append(s)
        cur["shots"].append(s)
    return seqs, shots


def marks_of(s):
    out = []
    for item in s.marks.split("；"):
        m = MARK_RE.match(item.strip())
        if m:
            label = m.group(3)
            out.append((m.group(1), int(m.group(2)), label.replace("★", "").strip(), label.count("★")))
    return out


def tc(t):
    m = int(t // 60)
    return f"{m}:{t - 60 * m:05.2f}"


def cue_spans(shots):
    spans = collections.OrderedDict()
    for s in shots:
        if s.cue not in spans:
            spans[s.cue] = [s.t0, s.t1, s.id, s.id]
        else:
            spans[s.cue][1], spans[s.cue][3] = s.t1, s.id
    return spans


def write_md(seqs, shots):
    total, nshots = shots[-1].t1, sum(s.n for s in shots)
    o = [
        "# 镜头表（自动生成）",
        "",
        "> 由 `docs/script/shots.txt` 生成。改源文件后运行 `python -X utf8 tools/shotlist.py`，不要手改本页。",
        f"> 全片 {tc(total)}（{total:.1f} 秒），{nshots} 个镜头（{len(shots)} 行，蒙太奇行按镜数计），平均镜头长 {total / nshots:.2f} 秒。",
        "> 方位：从桌尾看向桌头，左边中方，右边美方，桌头是空王座。",
        "",
        "![计划张力](img/plan-anatomy.png)",
        "",
        "## 分段",
        "",
        "| # | 段落 | 幕 | 入点 | 出点 | 时长 | 镜头数 | 平均镜头长 | 音乐 cue |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for q in seqs:
        a, b = q["shots"][0].t0, q["shots"][-1].t1
        n = sum(s.n for s in q["shots"])
        cues = list(dict.fromkeys(s.cue for s in q["shots"]))
        o.append(f"| {q['num']} | {q['name']} | {q['act']} | {tc(a)} | {tc(b)} | {b - a:.1f} 秒 | {n} | {(b - a) / n:.2f} 秒 | {'、'.join(cues)} |")
    for q in seqs:
        a, b = q["shots"][0].t0, q["shots"][-1].t1
        o += ["", f"## {q['num']}. {q['name']}（{tc(a)}–{tc(b)}）", "",
              "| 编号 | 入点 | 时长 | 镜头 | 画面 | 声音 | 标记 |", "|---|---|---|---|---|---|---|"]
        for s in q["shots"]:
            dur = f"{s.dur:g} 秒" + (f"，{s.n} 镜" if s.n > 1 else "")
            o.append(f"| {s.id} | {tc(s.t0)} | {dur} | {s.shot} | {s.pic} | {s.sound} | {s.marks} |")
    o += ["", "## 笑点、惊吓、发凉、奇观索引"]
    for kind in "LSCX":
        items = sorted(((s, num, label, stars) for s in shots for k, num, label, stars in marks_of(s) if k == kind),
                       key=lambda x: x[0].t0)
        o += ["", f"### {KIND[kind]}（{len(items)}）", "", "| 编号 | 时间 | 镜头 | 内容 | 分量 |", "|---|---|---|---|---|"]
        for s, num, label, stars in items:
            o.append(f"| {kind}{num} | {tc(s.t0)} | {s.id} | {label} | {'★' * stars} |")
    o += ["", "## 音乐 cue 的时间", "", "| cue | 入点 | 出点 | 时长 | 镜头 |", "|---|---|---|---|---|"]
    for cue, (a, b, i0, i1) in cue_spans(shots).items():
        o.append(f"| {cue} | {tc(a)} | {tc(b)} | {b - a:.1f} 秒 | {i0} → {i1} |")
    OUT_MD.write_text("\n".join(o) + "\n", encoding="utf-8")


def draw(seqs, shots):
    total, nshots = shots[-1].t1, sum(s.n for s in shots)
    W, H, L, R = 2000, 1450, 270, 70
    PW = W - L - R

    def X(t):
        return L + PW * t / total

    SURF, INK, SEC, MUTED = (252, 252, 251), (11, 11, 11), (82, 81, 78), (137, 135, 129)
    GRID, BASE, BAND = (225, 224, 217), (195, 194, 183), (244, 243, 239)
    BLUE = (42, 120, 214)
    EVC = {"L": (237, 161, 0), "S": (227, 73, 72), "C": (98, 80, 214), "X": (27, 175, 122)}
    img = Image.new("RGB", (W, H), SURF)
    d = ImageDraw.Draw(img)
    F, FB = "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc"
    ft, fs, fl, fx = ImageFont.truetype(FB, 38), ImageFont.truetype(F, 20), ImageFont.truetype(F, 22), ImageFont.truetype(F, 17)

    d.text((L, 26), "《失控》剧本的计划张力，对照《打，打个大西瓜》", font=ft, fill=INK)
    d.text((L, 82), f"由镜头表生成：{nshots} 个镜头，全长 {tc(total)[:-3]}。原片的张力分按时长比例缩放到同一长度，只对照形状。",
           font=fs, fill=SEC)

    top, bottom = 128, 1340
    tracks = {"cuts": (190, 350), "loud": (400, 580), "ev": (630, 850), "ten": (960, bottom)}
    taken = []  # rectangles already holding text, for the event labels

    def free(box):
        return all(box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3] for b in taken)

    # sequence bands and names
    for i, q in enumerate(seqs):
        a, b = X(q["shots"][0].t0), X(q["shots"][-1].t1)
        if i % 2:
            d.rectangle([a, top, b, bottom], fill=BAND)
        name = q["name"]
        w = d.textlength(name, font=fs)
        if w < b - a - 6:
            d.text(((a + b) / 2 - w / 2, top + 8), name, font=fs, fill=SEC)

    # vertical gridlines every 20 s
    for t in range(0, int(total) + 1, 20):
        for y0, y1 in tracks.values():
            d.line([X(t), y0, X(t), y1], fill=GRID, width=1)
        lab = f"{t // 60}:{t % 60:02d}"
        d.text((X(t) - d.textlength(lab, font=fs) / 2, bottom + 10), lab, font=fs, fill=MUTED)

    def label(track, text, sub=None):
        y0, y1 = tracks[track]
        d.text((24, y0 - 4), text, font=fl, fill=INK)
        line, y = "", y0 + 28
        for ch in sub or "":
            if d.textlength(line + ch, font=fx) > 150:
                d.text((24, y), line, font=fx, fill=MUTED)
                line, y = "", y + 22
            line += ch
        if line:
            d.text((24, y), line, font=fx, fill=MUTED)

    # track 1: cuts per 10 s
    y0, y1 = tracks["cuts"]
    starts = []
    for s in shots:
        starts += [s.t0 + s.dur * k / s.n for k in range(s.n)]
    nb = int(total // 10) + 1
    bins = [0] * nb
    for t in starts:
        bins[min(int(t // 10), nb - 1)] += 1
    vmax = 20
    for v in (0, 10, 20):
        y = y1 - (y1 - y0) * v / vmax
        d.line([L, y, W - R, y], fill=GRID if v else BASE, width=1)
        d.text((L - 12 - d.textlength(str(v), font=fx), y - 11), str(v), font=fx, fill=MUTED)
    peak = max(range(nb), key=lambda i: bins[i])
    for i, v in enumerate(bins):
        if not v:
            continue
        cx = X(min(i * 10 + 5, total - 0.5))
        yy = y1 - (y1 - y0) * min(v, vmax) / vmax
        d.rounded_rectangle([cx - 12, yy, cx + 12, y1], radius=4, fill=BLUE)
        d.rectangle([cx - 12, max(yy, y1 - 4), cx + 12, y1], fill=BLUE)
        if i == peak:
            d.text((cx - d.textlength(str(v), font=fx) / 2, yy - 24), str(v), font=fx, fill=INK)
    label("cuts", "剪辑密度", "每 10 秒的镜头数")

    # track 2: planned loudness
    y0, y1 = tracks["loud"]

    def YL(v):
        return y1 - (y1 - y0) * (v + 72) / 66

    for v in (-60, -40, -20):
        d.line([L, YL(v), W - R, YL(v)], fill=GRID, width=1)
        d.text((L - 12 - d.textlength(str(v), font=fx), YL(v) - 11), str(v), font=fx, fill=MUTED)
    for v, name in ((-12, "墙 −12"), (-40, "洞 −40")):
        d.line([L, YL(v), W - R, YL(v)], fill=BASE, width=1)
        d.text((W - R + 6, YL(v) - 11), name.split()[0], font=fx, fill=SEC)
    pts = []
    for s in shots:
        y = YL(LUFS[s.loud])
        pts += [(X(s.t0), y), (X(s.t1), y)]
    d.line(pts, fill=BLUE, width=2)
    zero = [s for s in shots if s.loud == 0 and s.dur >= 3]
    for s in zero[:1]:
        d.text((X(s.t0) - 30, YL(-70) + 4), "数字静音", font=fx, fill=SEC)
    label("loud", "计划响度", "短时 LUFS，按 0–5 档换算")

    # track 3: events by lane
    y0, y1 = tracks["ev"]
    lanes = "LSCX"
    lh = (y1 - y0) / len(lanes)
    for j, k in enumerate(lanes):
        yc = y0 + lh * (j + 0.5)
        d.line([L, yc, W - R, yc], fill=GRID, width=1)
        d.text((L - 16 - d.textlength(KIND[k], font=fs), yc - 13), KIND[k], font=fs, fill=SEC)
    dots, names = [], []
    for s in shots:
        for k, num, text, stars in marks_of(s):
            yc = y0 + lh * (lanes.index(k) + 0.5)
            cx = X(s.t0 + min(s.dur, 1.0) / 2)
            dots.append((cx, yc, k))
            taken.append((cx - 9, yc - 9, cx + 9, yc + 9))
            if stars >= 3:
                names.append((cx, yc, f"{k}{num} " + text.split("，")[0]))
    for cx, yc, k in dots:
        d.ellipse([cx - 9, yc - 9, cx + 9, yc + 9], fill=SURF)
        d.ellipse([cx - 7, yc - 7, cx + 7, yc + 7], fill=EVC[k])
    for cx, yc, text in names:
        w = d.textlength(text, font=fx)
        for dx, dy in ((10, -32), (10, 8), (-10 - w, -32), (-10 - w, 8), (10, -52), (-10 - w, -52)):
            box = (cx + dx - 2, yc + dy, cx + dx + w + 2, yc + dy + 22)
            if free(box) and box[2] < W - 4:
                break
        taken.append(box)
        d.text((box[0] + 2, box[1]), text, font=fx, fill=INK)
    label("ev", "笑、惊、凉、奇观", "点在镜头入点，三星的标出名字")

    # track 4: tension, ours vs the reference
    y0, y1 = tracks["ten"]

    def YT(v):
        return y1 - (y1 - y0) * v / 10.5

    for v in range(0, 11, 2):
        d.line([L, YT(v), W - R, YT(v)], fill=GRID if v else BASE, width=1)
        d.text((L - 12 - d.textlength(str(v), font=fx), YT(v) - 11), str(v), font=fx, fill=MUTED)
    ref = []
    for i, (t, v) in enumerate(REF_TENSION):
        t1 = REF_TENSION[i + 1][0] if i + 1 < len(REF_TENSION) else REF_LEN
        ref += [(X(t / REF_LEN * total), YT(v)), (X(t1 / REF_LEN * total), YT(v))]
    d.line(ref, fill=MUTED, width=2)
    ours = []
    for s in shots:
        ours += [(X(s.t0), YT(s.tension)), (X(s.t1), YT(s.tension))]
    d.line(ours, fill=BLUE, width=3)

    # key moments: hairline through every track, name in the header row above the tension plot
    by_id = {s.id: s for s in shots}
    notes = [("2-05", "嗒"), ("3-04", "喂"), ("4-07", "犹豫"), ("5-01", "两座山"), ("6-02", "啪"), ("8-03", "他看见了")]
    for sid, text in notes:
        x = X(by_id[sid].t0)
        d.line([x, tracks["cuts"][0], x, y1], fill=BASE, width=1)
        d.text((x + 6, y0 - 40), text, font=fx, fill=INK)
    rx, ry = X(REF_CUT / REF_LEN * total), YT(8)
    note = "原片 11:14 狂欢被炮弹打断"
    nw = d.textlength(note, font=fx)
    d.rectangle([rx - 14 - nw, ry + 8, rx - 6, ry + 32], fill=SURF)
    d.text((rx - 10 - nw, ry + 9), note, font=fx, fill=SEC)
    d.ellipse([rx - 8, ry - 8, rx + 8, ry + 8], fill=SURF)
    d.ellipse([rx - 6, ry - 6, rx + 6, ry + 6], fill=MUTED)
    label("ten", "张力", "0–10，逐镜头打分")

    # legend for the tension track, in the header row
    lx, ly = L, y0 - 40
    d.line([lx, ly + 12, lx + 36, ly + 12], fill=BLUE, width=3)
    d.text((lx + 46, ly), "失控（计划，逐镜头）", font=fx, fill=INK)
    lx2 = lx + 46 + d.textlength("失控（计划，逐镜头）", font=fx) + 40
    d.line([lx2, ly + 12, lx2 + 36, ly + 12], fill=MUTED, width=2)
    d.text((lx2 + 46, ly), "打，打个大西瓜（逐分钟人工打分，按比例缩放）", font=fx, fill=INK)

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_PNG)


def sub_shots(s):
    """Split a montage row into its cuts: durations shrink geometrically from the first to the last
    length named in the shot column ("0.5 秒剪到 0.25 秒"), scaled to fill the row exactly."""
    if s.n <= 1:
        return [(s.id, s.t0, s.t1)]
    m = MONTAGE_RE.search(s.shot)
    a, b = (float(m.group(1)), float(m.group(2))) if m else (1.0, 1.0)
    r = (b / a) ** (1 / (s.n - 1))
    raw = [a * r ** k for k in range(s.n)]
    k = s.dur / sum(raw)
    out, t = [], s.t0
    for i, d in enumerate(raw):
        t1 = s.t1 if i == s.n - 1 else t + d * k
        out.append((f"{s.id}.{i + 1:02d}", t, t1))
        t = t1
    return out


def write_js(seqs, shots):
    total = shots[-1].t1
    rows = []
    for s in shots:
        for sid, a, b in sub_shots(s):
            rows.append(f"  {{ id: '{sid}', row: '{s.id}', seq: {s.seq}, t0: {a:.4f}, t1: {b:.4f}, cue: '{s.cue}', "
                        f"tension: {s.tension:g}, loud: {s.loud} }},")
    sq = [f"  {{ num: {q['num']}, name: '{q['name']}', act: '{q['act']}', t0: {q['shots'][0].t0:.4f}, t1: {q['shots'][-1].t1:.4f} }},"
          for q in seqs]
    OUT_JS.write_text("\n".join([
        "// Generated by tools/shotlist.py from docs/script/shots.txt. Do not edit: change the script and re-run.",
        f"export const DURATION = {total:.4f};",
        "// one entry per camera cut (montage rows are split into their cuts: id '7-10.03', row '7-10')",
        "export const SHOT_ROWS = [", *rows, "];",
        "export const SEQS = [", *sq, "];", ""]), encoding="utf-8")


def main():
    seqs, shots = parse()
    write_md(seqs, shots)
    write_js(seqs, shots)
    draw(seqs, shots)
    total, nshots = shots[-1].t1, sum(s.n for s in shots)
    print(f"total {tc(total)} ({total:.2f} s), shots {nshots}, rows {len(shots)}, ASL {total / nshots:.2f} s")
    by_id = {s.id: s for s in shots}
    for sid in ("1-05", "2-05", "3-04", "4-07", "5-01", "6-02", "8-03"):
        s = by_id[sid]
        print(f"  {sid} at {tc(s.t0)} = {100 * s.t0 / total:.0f}%")
    for q in seqs:
        a, b = q["shots"][0].t0, q["shots"][-1].t1
        print(f"  seq {q['num']:>2} {q['name']}: {tc(a)}-{tc(b)} ({b - a:.1f} s)")
    for cue, (a, b, i0, i1) in cue_spans(shots).items():
        print(f"  {cue}: {tc(a)}-{tc(b)} ({b - a:.1f} s) {i0}->{i1}")


if __name__ == "__main__":
    main()
