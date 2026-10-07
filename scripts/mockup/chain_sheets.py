#!/usr/bin/env python3
"""Per-turn comparison sheets [mockup | engine ribbon-only crop | offline render] + full overview, for the chain fit.
Usage: chain_sheets.py offline   (offline z-buffer render of the solution, all windows + full) ; chain_sheets.py sheets (needs chain/render from render-pose.mjs)
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import chain_fit as C   # noqa: E402
import ak_problem as AP  # noqa: E402
import paper as PM      # noqa: E402

OUT = C.OUT
REND = os.path.join(OUT, 'render')
SHEETS = os.path.join(OUT, 'sheets')
COL_A = np.array([0x5a, 0x1c, 0x04], float)
COL_B = np.array([0xff, 0x7a, 0x12], float)
BG = (24, 24, 28)


def offline(L, R, box, scale):
    """z-buffer render of the ruled strip (rings L,R dense), window box in cutout px"""
    x0, y0, x1, y1 = box
    w, h = int((x1 - x0) * scale), int((y1 - y0) * scale)
    img = np.zeros((h, w, 3)); img[:] = BG
    zb = np.full((h, w), -np.inf)
    cam = np.array([0, 0, AP.D])
    nv = 9
    ts = np.linspace(0, 1, nv)
    G = L[:, None, :] + ts[None, :, None] * (R - L)[:, None, :]    # (n, nv, 3) ruling chords (exact on the surface)
    p2 = AP.project(G.reshape(-1, 3)).reshape(len(L), nv, 2)
    sx = (p2[..., 0] - x0) * scale; sy = (p2[..., 1] - y0) * scale
    for i in range(len(L) - 1):
        bx0 = min(sx[i].min(), sx[i + 1].min()); bx1 = max(sx[i].max(), sx[i + 1].max())
        by0 = min(sy[i].min(), sy[i + 1].min()); by1 = max(sy[i].max(), sy[i + 1].max())
        if bx1 < 0 or by1 < 0 or bx0 > w or by0 > h:
            continue
        for j in range(nv - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            pts3 = np.array([G[a, b] for a, b in q])
            Pu = (pts3[1] + pts3[2]) / 2 - (pts3[0] + pts3[3]) / 2
            Pv = (pts3[3] + pts3[2]) / 2 - (pts3[0] + pts3[1]) / 2
            n = np.cross(Pu, Pv); nn = np.linalg.norm(n)
            if nn < 1e-12:
                continue
            n /= nn
            vd = cam - pts3.mean(0); vd /= np.linalg.norm(vd)
            d = float(n @ vd)
            col = (COL_A if d < 0 else COL_B) * (0.3 + 0.7 * abs(d))
            for tri in ((0, 1, 2), (0, 2, 3)):
                X = np.array([sx[q[t]] for t in tri]); Y = np.array([sy[q[t]] for t in tri]); Z = pts3[list(tri), 2]
                xmin, xmax = int(max(np.floor(X.min()), 0)), int(min(np.ceil(X.max()), w - 1))
                ymin, ymax = int(max(np.floor(Y.min()), 0)), int(min(np.ceil(Y.max()), h - 1))
                if xmin > xmax or ymin > ymax:
                    continue
                gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
                den = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2])
                if abs(den) < 1e-12:
                    continue
                l0 = ((Y[1] - Y[2]) * (gx - X[2]) + (X[2] - X[1]) * (gy - Y[2])) / den
                l1 = ((Y[2] - Y[0]) * (gx - X[2]) + (X[0] - X[2]) * (gy - Y[2])) / den
                l2 = 1 - l0 - l1
                m = (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
                if not m.any():
                    continue
                z = l0 * Z[0] + l1 * Z[1] + l2 * Z[2]
                sub = zb[ymin:ymax + 1, xmin:xmax + 1]
                upd = m & (z > sub)
                sub[upd] = z[upd]
                img[ymin:ymax + 1, xmin:xmax + 1][upd] = col
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def load_rings():
    d = np.load(os.path.join(OUT, 'export_rings.npz'))
    return d['L'], d['R']


def mockup_crop(box):
    im = Image.open(os.path.join(C.ROOT, 'docs/ribbon/ref/ak-signature-cutout.webp')).convert('RGBA')
    bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im)
    return bg.convert('RGB').crop(box)


def cmd_offline():
    L, R = load_rings()
    # densify rings by linear interpolation of the emitted rulings is NOT exact; the dense solution surface is used instead
    pr = C.Chain()
    x, _ = C.final_x()
    Ld, Rd = C.raster_dense(pr, x, step=0.8)
    os.makedirs(os.path.join(OUT, 'offline'), exist_ok=True)
    for nm, box in C.WINDOWS_BOX.items():
        offline(Ld, Rd, box, 2).save(os.path.join(OUT, 'offline', f'{nm}.png'))
        print('offline', nm, flush=True)
    offline(Ld, Rd, (0, 0, 852, 1846), 0.5).save(os.path.join(OUT, 'offline', 'full.png'))


def fit_h(im, h):
    return im.resize((int(round(im.width * h / im.height)), h), Image.LANCZOS)


def cmd_sheets():
    os.makedirs(SHEETS, exist_ok=True)
    H = 700
    for nm, box in C.WINDOWS_BOX.items():
        panels = [mockup_crop(box), Image.open(os.path.join(REND, f'ribbon_crop_{nm}.png')).convert('RGB'), Image.open(os.path.join(OUT, 'offline', f'{nm}.png')).convert('RGB')]
        panels = [fit_h(p, H) for p in panels]
        sheet = Image.new('RGB', (sum(p.width for p in panels) + 20, H + 30), (10, 10, 10))
        dr = ImageDraw.Draw(sheet)
        xo = 0
        for p, t in zip(panels, ('mockup', 'engine (ribbon only)', 'offline')):
            sheet.paste(p, (xo, 30)); dr.text((xo + 4, 8), f'{nm}: {t}', fill=(255, 255, 255)); xo += p.width + 10
        sheet.save(os.path.join(SHEETS, f'sheet_{nm}.png'))
    panels = [fit_h(mockup_crop((0, 0, 852, 1846)), 1000), fit_h(Image.open(os.path.join(REND, 'ribbon.png')).convert('RGB'), 1000),
              fit_h(Image.open(os.path.join(OUT, 'offline', 'full.png')).convert('RGB'), 1000)]
    sheet = Image.new('RGB', (sum(p.width for p in panels) + 20, 1030), (10, 10, 10))
    xo = 0
    for p in panels:
        sheet.paste(p, (xo, 30)); xo += p.width + 10
    sheet.save(os.path.join(SHEETS, 'sheet_overview.png'))


if __name__ == '__main__':
    {'offline': cmd_offline, 'sheets': cmd_sheets}[sys.argv[1]]()
