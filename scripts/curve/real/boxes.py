"""Owner-boxed regions, mockup | run | run2..., 2x. usage: boxes.py OUTDIR RUN [RUN...]"""
import sys
from PIL import Image
R = "/Users/ashmitkhurana/Development/Personal/portfolio/"
B = {'apex': (150, 440, 490, 640), 'topk': (530, 530, 780, 840), 'farleft': (0, 860, 260, 1140),
     'bottomk': (410, 970, 780, 1210), 'wrap': (20, 640, 330, 960)}
cut = Image.open(R + 'docs/ribbon/ref/ak-signature-cutout.webp').convert('RGBA')
bg = Image.new('RGBA', cut.size, (17, 17, 17, 255)); bg.alpha_composite(cut)
m = bg.convert('RGB').resize((780, 1688), Image.LANCZOS)
out, runs = sys.argv[1], sys.argv[2:]
rs = [Image.open(R + 'docs/ribbon/turns/real/%s/render/ribbon.png' % r).convert('RGB') for r in runs]
for k, b in B.items():
    ims = [m.crop(b)] + [r.crop(b) for r in rs]
    w, h = ims[0].size
    o = Image.new('RGB', (len(ims) * (w + 6) - 6, h), (255, 255, 255))
    for i, im in enumerate(ims): o.paste(im, (i * (w + 6), 0))
    s = 2 if len(ims) <= 2 else 1.4
    o.resize((int(o.size[0] * s), int(o.size[1] * s)), Image.LANCZOS).save('%s/box_%s.png' % (out, k))
print('ok')
