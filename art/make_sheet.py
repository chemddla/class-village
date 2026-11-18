"""art/cards 의 그림을 모아 시안 한 장(앞모습·뒷모습)으로 만든다.

실행: python art/make_sheet.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CARDS = HERE / "cards"
NAMES = {
    "A": "A · 옆으로 넘긴 머리",
    "B": "B · 일자 앞머리 단발",
    "C": "C · 포니테일",
    "D": "D · 털모자",
    "E": "E · 양갈래",
    "F": "F · 반대쪽 가르마",
}
FONT = "C:/Windows/Fonts/malgunbd.ttf"


def sheet(view, title):
    keys = list(NAMES)
    first = Image.open(CARDS / f"{keys[0]}_{view}.png")
    cw, ch = first.size
    cols, rows = 3, 2
    pad, label_h, title_h = 24, 64, 90
    W = cols * cw + (cols + 1) * pad
    H = title_h + rows * (ch + label_h) + (rows + 1) * pad
    img = Image.new("RGB", (W, H), (255, 250, 240))
    d = ImageDraw.Draw(img)
    d.text((pad, 24), title, fill=(74, 59, 42), font=ImageFont.truetype(FONT, 44))
    f = ImageFont.truetype(FONT, 34)
    for i, k in enumerate(keys):
        c, r = i % cols, i // cols
        x = pad + c * (cw + pad)
        y = title_h + pad + r * (ch + label_h + pad)
        card = Image.open(CARDS / f"{k}_{view}.png").convert("RGB")
        mask = Image.new("L", card.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw, ch), radius=36, fill=255)
        img.paste(card, (x, y), mask)
        tw = d.textlength(NAMES[k], font=f)
        d.text((x + (cw - tw) / 2, y + ch + 12), NAMES[k], fill=(74, 59, 42), font=f)
    out = HERE / f"samples_{view}.png"
    img.save(out)
    return out


if __name__ == "__main__":
    print(sheet("front", "캐릭터 시안 — 앞모습"))
    print(sheet("back", "캐릭터 시안 — 뒷모습"))
