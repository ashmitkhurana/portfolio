"""Tile frames into a labelled contact sheet: sheet2.py <out.png> <height> <cols> <img:label> ..."""
import sys
from PIL import Image, ImageDraw, ImageFont
out, h, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = [a.rsplit(":", 1) if ":" in a and not a.endswith(".png") else (a, "") for a in sys.argv[4:]]
ims = []
for path, lab in items:
    im = Image.open(path).convert("RGB")
    im = im.resize((int(im.width * h / im.height), h))
    if lab:
        d = ImageDraw.Draw(im)
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", max(14, h // 22))
        except Exception:
            f = ImageFont.load_default()
        d.rectangle([0, 0, d.textlength(lab, font=f) + 16, h // 22 + 14], fill=(0, 0, 0))
        d.text((8, 5), lab, fill=(255, 255, 255), font=f)
    ims.append(im)
w = max(i.width for i in ims)
rows = (len(ims) + cols - 1) // cols
S = Image.new("RGB", (cols * w + (cols - 1) * 8, rows * h + (rows - 1) * 8), (60, 60, 60))
for k, im in enumerate(ims):
    S.paste(im, ((k % cols) * (w + 8), (k // cols) * (h + 8)))
S.save(out)
