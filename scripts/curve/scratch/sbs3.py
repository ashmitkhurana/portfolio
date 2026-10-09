import sys
from PIL import Image
R = "/Users/ashmitkhurana/Development/Personal/portfolio/"
x6, n1, out = sys.argv[1], sys.argv[2], sys.argv[3]
cut = Image.open(R + "docs/ribbon/ref/ak-signature-cutout.webp").convert("RGBA")
bg = Image.new("RGBA", cut.size, (17, 17, 17, 255)); bg.alpha_composite(cut)
box = (0, 440, 780, 1688)
m = bg.convert("RGB").resize((780, 1688), Image.LANCZOS).crop(box)
a = Image.open(x6).convert("RGB").crop(box)
b = Image.open(n1).convert("RGB").crop(box)
S = Image.new("RGB", (780 * 3 + 20, 1248), (40, 40, 40))
S.paste(m, (0, 0)); S.paste(a, (790, 0)); S.paste(b, (1580, 0))
S.save(out); print("ok")
