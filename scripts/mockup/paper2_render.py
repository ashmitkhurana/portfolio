#!/usr/bin/env python3
"""Offline z-buffer renderer of the paper model (no thickness). Same camera as ak_problem.project."""
import os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ak_problem as AP   # noqa: E402
import paper as PM        # noqa: E402

WIN = (180, 530, 480, 760)
COL_A = np.array([0x5a, 0x1c, 0x04], float)
COL_B = np.array([0xff, 0x7a, 0x12], float)


def render(x, K, W, u0, u1, win=WIN, scale=3, du=0.4, nv=25, bg=(24, 24, 28)):
    u = np.arange(u0, u1 + du, du)
    v = np.linspace(-W / 2, W / 2, nv)
    U, V = np.meshgrid(u, v, indexing='ij')
    P = PM.surface(x, U.ravel(), V.ravel(), K).reshape(len(u), nv, 3)
    p2 = AP.project(P.reshape(-1, 3)).reshape(len(u), nv, 2)
    cam = np.array([0, 0, AP.D])
    x0, y0, x1, y1 = win
    w, h = (x1 - x0) * scale, (y1 - y0) * scale
    img = np.zeros((h, w, 3)); face_img = np.zeros((h, w, 3)); zb = np.full((h, w), -np.inf); img[:] = bg; face_img[:] = bg
    sx = (p2[..., 0] - x0) * scale; sy = (p2[..., 1] - y0) * scale
    for i in range(len(u) - 1):
        for j in range(nv - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            pts3 = np.array([P[a, b] for a, b in q])
            # face normal n = Pu x Pv (A when n.(cam-c) < 0, as in ak_apex.face_metrics)
            Pu = (pts3[1] + pts3[2]) / 2 - (pts3[0] + pts3[3]) / 2
            Pv = (pts3[3] + pts3[2]) / 2 - (pts3[0] + pts3[1]) / 2
            n = np.cross(Pu, Pv); nn = np.linalg.norm(n)
            if nn < 1e-12:
                continue
            n /= nn
            c = pts3.mean(0)
            vd = cam - c; vd /= np.linalg.norm(vd)
            d = float(n @ vd)
            isA = d < 0
            shade = 0.3 + 0.7 * abs(d)
            base = COL_A if isA else COL_B
            fcol = np.array([40, 200, 255.0]) if d > 0 else np.array([255, 60, 200.0])   # toward camera by n sign
            for tri in ((0, 1, 2), (0, 2, 3)):
                X = np.array([sx[q[t]] for t in tri]); Y = np.array([sy[q[t]] for t in tri]); Z = np.array([pts3[t, 2] for t in tri])
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
                img[ymin:ymax + 1, xmin:xmax + 1][upd] = base * shade
                face_img[ymin:ymax + 1, xmin:xmax + 1][upd] = fcol * (0.4 + 0.6 * abs(d))
    return img.clip(0, 255).astype(np.uint8), face_img.clip(0, 255).astype(np.uint8), zb


if __name__ == '__main__':
    d = np.load(os.path.join(AP.ROOT, 'docs/ribbon/turns/paper/solution.npz'))
    import json
    M = json.load(open(os.path.join(AP.ROOT, 'docs/ribbon/turns/paper/metrics.json')))
    W = M['params']['W_css']
    ua = d['u_rings']
    out = os.path.join(AP.ROOT, 'docs/ribbon/turns/paper2')
    img, fimg, zb = render(d['x'], 3, W, ua[0], ua[-1])
    Image.fromarray(img).save(os.path.join(out, 'offline_apex.png'))
    Image.fromarray(fimg).save(os.path.join(out, 'offline_apex_facedir.png'))
    print('done', img.shape)
