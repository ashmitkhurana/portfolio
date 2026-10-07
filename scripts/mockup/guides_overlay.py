"""Render TURNS.md guide polylines over the AK cutout (gridded 3x turn crops + 2x overview).
Usage: python guides_overlay.py <guides.json> <out_dir>
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs/ribbon/ref/ak-signature-cutout.webp')
WINDOWS = {
    'apex': (180, 530, 480, 760), 'farleft': (0, 960, 330, 1260), 'scurve': (540, 1240, 852, 1580),
    'bottomk': (480, 880, 852, 1260), 'wrap': (20, 740, 470, 1090), 'junction': (380, 780, 650, 1010),
    'topk': (540, 640, 852, 930), 'endstrand': (480, 880, 720, 1260),
}
COL = {'E1': (255, 0, 255, 255), 'E2': (0, 255, 0, 255), 'SIL': (255, 220, 0, 255)}

def font(sz):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', sz)
    except Exception:
        return ImageFont.load_default()

def dashed(d, pts, col, w, dash=10, gap=8):
    period = dash + gap
    phase = 0.0  # arc position within the dash period, carried across segments
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        if L == 0:
            continue
        t = 0.0
        while t < L:
            if phase < dash - 1e-6:
                t2 = min(t + (dash - phase), L)
                d.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * t2 / L, y0 + (y1 - y0) * t2 / L)], fill=col, width=w)
            else:
                t2 = min(t + max(period - phase, 1e-6), L)
            if t2 <= t:  # float absorption guard
                t2 = min(t + 1e-3, L)
                if t2 <= t:
                    break
            phase = (phase + (t2 - t)) % period
            t = t2

def render(bg, segs, box, S, grid_step, out):
    x0, y0, x1, y1 = box
    c = bg.crop(box).resize(((x1 - x0) * S, (y1 - y0) * S), Image.LANCZOS)
    d = ImageDraw.Draw(c, 'RGBA')
    f = font(18 if S >= 3 else 14)
    for gx in range((x0 // grid_step + 1) * grid_step, x1, grid_step):
        X = (gx - x0) * S
        major = gx % 100 == 0
        d.line([(X, 0), (X, c.height)], fill=(0, 200, 255, 90 if major else 35), width=1)
        if major:
            d.text((X + 3, 3), str(gx), fill=(0, 220, 255, 255), font=f)
    for gy in range((y0 // grid_step + 1) * grid_step, y1, grid_step):
        Y = (gy - y0) * S
        major = gy % 100 == 0
        d.line([(0, Y), (c.width, Y)], fill=(0, 200, 255, 90 if major else 35), width=1)
        if major:
            d.text((3, Y + 3), str(gy), fill=(0, 220, 255, 255), font=f)
    for s in segs:
        pts = [((x - x0) * S, (y - y0) * S) for x, y in s['pts']]
        col = COL[s['edge']]
        if s['kind'] == 'hidden':
            dashed(d, pts, col[:3] + (200,), 3)
        elif s['kind'] == 'sil':
            dashed(d, pts, col, 3, dash=4, gap=5)
        else:
            d.line(pts, fill=col, width=3)
        for (px, py) in pts:
            d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=col)
        if len(pts) >= 2:
            mx, my = pts[len(pts) // 2]
            d.text((mx + 6, my + 6), f"{s['edge']}{'(h)' if s['kind']=='hidden' else ''}", fill=col, font=f)
    c.convert('RGB').save(out)

def main():
    guides, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    segs = json.load(open(guides))['segments']
    im = Image.open(SRC).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    for name, box in WINDOWS.items():
        render(bg, segs, box, 3, 20, os.path.join(out_dir, f'g_{name}.png'))
    render(bg, segs, (0, 500, 852, 1650), 1, 50, os.path.join(out_dir, 'g_overview.png'))
    print('ok', sorted(os.listdir(out_dir)))

if __name__ == '__main__':
    main()
