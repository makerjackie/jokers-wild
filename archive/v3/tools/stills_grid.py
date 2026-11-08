"""Compose the style comparison sheet: rows = styles, columns = moments.

usage: python -X utf8 tools/stills_grid.py <stills_dir> <out.jpg>
expects <stills_dir>/<style>/t<time>.jpg as written by tools/snap.mjs
"""
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

STYLES = [("noir", "A 黑色战情室（推荐）", "暖色单色调，只有牌是彩色的；一盏灯、烟、硬阴影"),
          ("engrave", "B 刮版版画", "国王像从黑底上刻出来的铜版画，牌是手工上色"),
          ("poster", "C 冷战海报", "两色丝网印：中方半边红，美方半边蓝，中线黑；半调网点")]
MOMENTS = [("018.90", "0:19 开局：所有国王转头看第一张牌"), ("065.50", "1:06 巨牌 o1 举过头顶"), ("155.20", "2:35 两张王拼成一张脸（正俯）")]

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
W, H = 800, 450
LW, TH, GAP = 300, 70, 10
F = "C:/Windows/Fonts/msyh.ttc"
ft, fs, fx = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 30), ImageFont.truetype(F, 22), ImageFont.truetype(F, 18)
img = Image.new("RGB", (LW + len(MOMENTS) * (W + GAP), TH + len(STYLES) * (H + GAP) + 20), (14, 13, 12))
d = ImageDraw.Draw(img)
for j, (_, label) in enumerate(MOMENTS):
    d.text((LW + j * (W + GAP) + 8, 22), label, font=fs, fill=(230, 222, 205))
for i, (key, name, desc) in enumerate(STYLES):
    y = TH + i * (H + GAP)
    d.text((16, y + 12), name, font=ft, fill=(240, 232, 214))
    words, line, yy = desc, "", y + 62
    for ch in words:
        if d.textlength(line + ch, font=fx) > LW - 30:
            d.text((16, yy), line, font=fx, fill=(170, 162, 148)); line, yy = "", yy + 26
        line += ch
    d.text((16, yy), line, font=fx, fill=(170, 162, 148))
    for j, (t, _) in enumerate(MOMENTS):
        f = src / key / f"t{t}.jpg"
        if f.exists():
            img.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (LW + j * (W + GAP), y))
img.save(out, quality=90)
print("wrote", out, img.size)
