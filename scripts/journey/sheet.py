# grid sheet of frames: sheet.py <prefix> <count> <cols> <out>
import sys
from PIL import Image
pre, n, cols, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
ims = [Image.open(f"{pre}_{i:02d}.png") for i in range(n)]
w, h = ims[0].size; rows = (n + cols - 1) // cols
s = Image.new("RGB", (cols * (w + 10) - 10, rows * (h + 10) - 10), "white")
for i, im in enumerate(ims): s.paste(im, ((i % cols) * (w + 10), (i // cols) * (h + 10)))
s.save(out)
