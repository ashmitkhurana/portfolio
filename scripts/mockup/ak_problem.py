#!/usr/bin/env python3
"""Solver inputs from the approved 2D trace (docs/ribbon/turns/out_v9/edges_v3.json), in the engine's world/camera conventions.

Camera / frame / anchor constants are copied from scripts/mockup/lift_sig.py (FRAME == "phone" branch):
  lift_sig.py:21  SX, SY = 852/390, 1846/844            cutout px -> css px is  px / (SX, SY)   (M, line 27)
  lift_sig.py:22  FOV = 26.4
  lift_sig.py:24  VW, VH = 390, 844
  lift_sig.py:25  ANCHOR = dict(left=20, top=118.15625, width=347.21875, height=154.1875)
  lift_sig.py:37  D = (VH/2) / tan(FOV/2)
  lift.py _lift_vec:  k = (D - z)/D ; world = ((px - VW/2) k, (VH/2 - py) k, z)       (x right, y UP, z toward camera)
  lift_sig.py:245 to_anchor: [(sx-left)/width, (sy-top)/height, z/height]
World units = css px at z = 0 (the engine camera, lib/ribbon/poses/camera.ts + resolve.ts pointToWorld).

Usage: scripts/mockup/.venv/bin/python scripts/mockup/ak_problem.py [edges_json]
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EDGES = os.path.join(ROOT, "docs/ribbon/turns/out_v9/edges_v3.json")
CUTOUT = os.path.join(ROOT, "docs/ribbon/ref/ak-signature-cutout.webp")
OUT_NPZ = os.path.join(ROOT, "docs/ribbon/turns/ak_problem_phone.npz")

SX, SY = 852.0 / 390.0, 1846.0 / 844.0
FOV = 26.4
VW, VH = 390.0, 844.0
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)
D = (VH / 2) / math.tan(math.radians(FOV) / 2)


def px_to_css(px):
    """cutout px (N,2) -> css px"""
    return np.asarray(px, float) / np.array([SX, SY])


def css_to_px(css):
    return np.asarray(css, float) * np.array([SX, SY])


def project_css(P3):
    """world (N,3) (x, y up, z) -> css px (N,2), y down"""
    P3 = np.atleast_2d(np.asarray(P3, float))
    s = D / (D - P3[:, 2])
    return np.stack([VW / 2 + P3[:, 0] * s, VH / 2 - P3[:, 1] * s], 1)


def project(P3):
    """world (N,3) -> cutout px (N,2), +y down"""
    return css_to_px(project_css(P3))


def backproject(px, z):
    """cutout px (N,2) at world depth z (scalar or (N,)) -> world (N,3). Same maths as lift.py _lift_vec."""
    css = px_to_css(np.atleast_2d(px))
    z = np.broadcast_to(np.asarray(z, float), (len(css),))
    k = (D - z) / D
    return np.stack([(css[:, 0] - VW / 2) * k, (VH / 2 - css[:, 1]) * k, z], 1)


def to_anchor(P3, scr_css):
    """one world point + its css screen position -> anchor-space triple (lift_sig.to_anchor)"""
    return [(scr_css[0] - ANCHOR["left"]) / ANCHOR["width"], (scr_css[1] - ANCHOR["top"]) / ANCHOR["height"], P3[2] / ANCHOR["height"]]


def from_anchor(a):
    """anchor-space triples (N,3) -> world (N,3) (resolve.ts pointToWorld)"""
    a = np.atleast_2d(np.asarray(a, float))
    sx = ANCHOR["left"] + a[:, 0] * ANCHOR["width"]
    sy = ANCHOR["top"] + a[:, 1] * ANCHOR["height"]
    z = a[:, 2] * ANCHOR["height"]
    k = (D - z) / D
    return np.stack([(sx - VW / 2) * k, (VH / 2 - sy) * k, z], 1)


def roundtrip_error(n=2000, seed=0):
    rng = np.random.default_rng(seed)
    px = np.stack([rng.uniform(0, 852, n), rng.uniform(0, 1846, n)], 1)
    z = rng.uniform(-110, 150, n)
    err = np.abs(project(backproject(px, z)) - px)
    return float(err.max())


def _resample(poly, step=3.0):
    poly = np.asarray(poly, float)
    seg = np.hypot(*np.diff(poly, axis=0).T)
    s = np.r_[0, np.cumsum(seg)]
    q = np.arange(0, s[-1] + 1e-9, step)
    return np.stack([np.interp(q, s, poly[:, 0]), np.interp(q, s, poly[:, 1])], 1)


def build_problem(edges_json=EDGES, frame="phone"):
    if frame != "phone":
        raise NotImplementedError("only the phone frame is implemented")
    E = json.load(open(edges_json))
    pairs = np.array(E["pairs"], float)            # (N, 2, 2)
    e1_px, e2_px = pairs[:, 0], pairs[:, 1]
    N = len(pairs)
    pint = np.array(E["pair_interval"], int)
    assert len(pint) == N
    # per ring vis / kind from the nearest edge sample
    out = dict(frame=frame, N=N, e1_px=e1_px, e2_px=e2_px, interval=pint)
    for tag, e in (("1", e1_px), ("2", e2_px)):
        src = np.array(E["edge" + tag], float)
        _, j = cKDTree(src).query(e)
        out["vis" + tag] = np.array(E["vis" + tag], bool)[j]
        out["kind" + tag] = np.array(E["kind" + tag])[j]
    # intervals (names, expected face) as indexed by pair_interval (the verified face_check of the trace report, 16 intervals)
    fc = E["report"]["face_check"]["intervals"]
    iv = [(int(k), v["from"], v["to"], v["expected"]) for k, v in fc.items()]
    iv.sort()
    out["intervals"] = [dict(k=k, name="%s__%s" % (a, b), frm=a, to=b, face=f, i0=int(np.nonzero(pint == k)[0].min()), i1=int(np.nonzero(pint == k)[0].max())) for k, a, b, f in iv]
    # windows
    windows = {}
    for it in out["intervals"]:
        if it["face"] == "window":
            windows[it["name"]] = (pint == it["k"])
    out["windows"] = windows
    out["landmark_rings"] = {it["frm"]: it["i0"] for it in out["intervals"]}
    out["landmark_rings"]["end"] = N - 1
    # width
    wmask = np.isin(pint, [it["k"] for it in out["intervals"] if it["face"] in ("A", "B")])
    wlen = np.hypot(*(e2_px - e1_px).T)
    out["W_px"] = float(np.median(wlen[wmask]))
    out["W_css"] = float(np.median(np.hypot(*(px_to_css(e2_px) - px_to_css(e1_px)).T)[wmask]))
    out["wmask"] = wmask
    # coverage: silhouettes every 3 px, outward normals from the blurred cutout alpha
    alpha = np.array(Image.open(CUTOUT).convert("RGBA"))[..., 3].astype(float) / 255.0
    g = ndi.gaussian_filter(alpha, 2.0)
    gy, gx = np.gradient(g)
    G, NN, TURN = [], [], []
    for si, s in enumerate(E["silhouettes"]):
        pts = _resample(s["pts"], 3.0)
        gxx = ndi.map_coordinates(gx, [pts[:, 1], pts[:, 0]], order=1, mode="nearest")
        gyy = ndi.map_coordinates(gy, [pts[:, 1], pts[:, 0]], order=1, mode="nearest")
        n = -np.stack([gxx, gyy], 1)                # alpha is high inside: outward = -grad
        n /= np.maximum(np.hypot(*n.T), 1e-9)[:, None]
        G.append(pts); NN.append(n); TURN.append(np.full(len(pts), si))
    G, NN, TURN = np.concatenate(G), np.concatenate(NN), np.concatenate(TURN)
    out["coverage"] = dict(g=G, n=NN, p_in=G - 2.0 * NN, p_out=G + 3.0 * NN, silhouette=TURN,
                           names=[s["turn"] for s in E["silhouettes"]])
    out["camera"] = dict(FOV=FOV, VW=VW, VH=VH, D=D, SX=SX, SY=SY, anchor=ANCHOR)
    return out


def save(P, path=OUT_NPZ):
    d = dict(e1_px=P["e1_px"], e2_px=P["e2_px"], vis1=P["vis1"], vis2=P["vis2"], kind1=P["kind1"], kind2=P["kind2"],
             interval=P["interval"], W_px=P["W_px"], W_css=P["W_css"], wmask=P["wmask"],
             win_names=np.array(list(P["windows"])), win_masks=np.array(list(P["windows"].values())),
             int_names=np.array([i["name"] for i in P["intervals"]]), int_face=np.array([i["face"] for i in P["intervals"]]),
             int_i0=np.array([i["i0"] for i in P["intervals"]]), int_i1=np.array([i["i1"] for i in P["intervals"]]),
             lm_names=np.array(list(P["landmark_rings"])), lm_rings=np.array(list(P["landmark_rings"].values())),
             cov_g=P["coverage"]["g"], cov_n=P["coverage"]["n"], cov_in=P["coverage"]["p_in"], cov_out=P["coverage"]["p_out"],
             cov_sil=P["coverage"]["silhouette"], cov_names=np.array(P["coverage"]["names"]),
             cam=np.array([FOV, VW, VH, D, SX, SY, ANCHOR["left"], ANCHOR["top"], ANCHOR["width"], ANCHOR["height"]]))
    np.savez(path, **d)


if __name__ == "__main__":
    P = build_problem(sys.argv[1] if len(sys.argv) > 1 else EDGES)
    save(P)
    print("N rings:", P["N"])
    print("intervals:")
    for it in P["intervals"]:
        print("  %2d %-18s %-7s rings %d..%d" % (it["k"], it["name"], it["face"], it["i0"], it["i1"]))
    print("windows:")
    for k, m in P["windows"].items():
        idx = np.nonzero(m)[0]
        print("  %-18s rings %d..%d (%d)" % (k, idx.min(), idx.max(), m.sum()))
    c = P["coverage"]
    print("coverage points:", len(c["g"]), {n: int((c["silhouette"] == i).sum()) for i, n in enumerate(c["names"])})
    print("vis1 True %d / vis2 True %d of %d" % (P["vis1"].sum(), P["vis2"].sum(), P["N"]))
    print("kinds ring1:", {k: int((P["kind1"] == k).sum()) for k in np.unique(P["kind1"])}, "ring2:", {k: int((P["kind2"] == k).sum()) for k in np.unique(P["kind2"])})
    print("W_px (cutout px, median over %d A/B rings) = %.3f ; in css px = %.3f" % (P["wmask"].sum(), P["W_px"], P["W_css"]))
    print("camera: FOV %.1f VW %g VH %g D %.4f" % (FOV, VW, VH, D))
    print("round-trip px -> backproject(z) -> project, max abs error over 2000 random px/depths: %.3e px" % roundtrip_error())
    print("saved", OUT_NPZ)
