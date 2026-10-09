#!/usr/bin/env python
"""Rebuild the owner's five "broad round bend" turns as generalised-cylinder bands fitted to the mockup outline.

  scripts/mockup/.venv/bin/python scripts/curve/turnfit.py --pose docs/ribbon/turns/fit/kk4/pose.json --out docs/ribbon/turns/fit/turn

Per turn (box in css px, ring range of the strand in the base pose):
  (a) mockup outline points inside the box -> (side, ring) by fit3d.outline_centre_assign restricted to the strand's rings
  (b) ordered L / R target polylines (order = assigned ring + along-tangent offset), gaussian-smoothed (sigma 2 points)
  (c) cylfit.fit_offset -> d (css), residual mean/max (> reject px mean: "not a cylinder", keep the base rings)
  (d) midline from L + d/2 and R - d/2 (nearest-point pairing), resampled by arclength to the ring count
  (e) 3D band: h = max(25.5, |d_world|/2), b_xy = d_world/(2h), b_z = +-sqrt(1-|b_xy|^2) (sign of the base pose's mean ruling z),
      centre depth by the perp rule, end depth pinned to the base pose, unproject with the exact camera model, L = c - h b, R = c + h b.
Writes <out>/init_turns.json (smoothstep-blended into the base pose over --blend rings at each end), <out>/T<k>_overlay.png, <out>/turns_report.txt.
"""
import argparse, json, math, os, sys
import numpy as np
from scipy.ndimage import gaussian_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fit3d  # noqa: E402
from fit3d import pose_to_world, world_to_pose, project, D, VW, VH, SCUT, ROOT  # noqa: E402
import cylfit  # noqa: E402

BOXES = {1: ("39.5:355:166.5:477.5", 880, 1010), 3: ("260:290.5:382.5:414.5", 1089, 1264), 5: ("8.5:472.5:110:556", 293, 393),
         7: ("214:497.5:390:563", 648, 772), 9: ("212:570:385.5:732", 66, 261)}
NOEXCL = "0:0:0:0"


def ss(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def tangents(c):
    pad = np.pad(c, ((3, 3), (0, 0)), mode="edge")
    t = pad[6:] - pad[:-6]
    return t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)


def ordered_polyline(P, side, ring, keep, which, c, t, sig=2.0):
    m = keep & (side == which)
    if m.sum() < 6:
        return None, None
    Q, ri = P[m], ring[m]
    sp = np.maximum(np.linalg.norm(np.gradient(c, axis=0), axis=1), 0.5)
    off = ((Q - c[ri]) * t[ri]).sum(1) / sp[ri]
    key = ri + np.clip(off, -1.5, 1.5)
    o = np.argsort(key)
    Q, key = Q[o], key[o]
    Qs = np.stack([gaussian_filter1d(Q[:, j], sig, mode="nearest") for j in range(2)], 1)
    return Qs, key


def fit_d(L, R, d_init):
    best = None
    starts = [np.asarray(d_init, float)]
    gx = np.arange(-90, 91, 6.0)
    sc = []
    for x in gx:
        for y in gx:
            dd = np.array([x, y])
            sc.append((cylfit._dists(L, R, dd).mean(), x, y))
    sc.sort()
    starts += [np.array([s[1], s[2]]) for s in sc[:3]]
    for s0 in starts:
        d, rm, rx = cylfit.fit_offset(L, R, s0)
        if best is None or rm < best[1]:
            best = (d, rm, rx)
    return best


def unproject(m_css, z):
    k = (D - z) / D
    return np.stack([(m_css[:, 0] - VW / 2) * k, (VH / 2 - m_css[:, 1]) * k, z], 1)


def fit_turn(k, box, a, b, bL, bR, wL, wR, O, rej, log):
    bx = fit3d.parse_boxes(box)
    P = O[fit3d.in_boxes(O, bx)]
    cb = (bL + bR) / 2
    side, ring, keep, info = fit3d.outline_centre_assign(bL, bR, P, bx, [np.arange(a, b + 1)])
    t = tangents(cb)
    PL, kL = ordered_polyline(P, side, ring, keep, 0, cb, t)
    PR, kR = ordered_polyline(P, side, ring, keep, 1, cb, t)
    res = dict(k=k, box=box, a=a, b=b, pts=len(P), kept=int(keep.sum()), far=info["far"], amb=info["ambiguous"])
    if PL is None or PR is None:
        res.update(ok=False, why="too few points on a side (L %s, R %s)" % (None if PL is None else len(PL), None if PR is None else len(PR)))
        return res
    res.update(nL=len(PL), nR=len(PR), ringsL=(int(kL.min()), int(kL.max())), ringsR=(int(kR.min()), int(kR.max())))
    d0 = np.median((bR - bL)[a:b + 1], axis=0)
    d, rm, rx = fit_d(PL, PR, d0)
    res.update(d=d, dn=float(np.hypot(*d)), rmean=rm, rmax=rx, d0=d0, PL=PL, PR=PR)
    if rm > rej:
        res.update(ok=False, why="not a cylinder (residual mean %.2f > %.1f css px)" % (rm, rej))
        return res
    # (d) midline
    _, qq = cylfit.pt_seg_dist(PL + d, PR)
    dd = np.linalg.norm(qq - (PL + d), axis=1)
    m = ((PL + d / 2) + (qq - d / 2)) / 2
    ok = dd <= max(3 * rm, 4.0)
    m = m[ok]
    res["mid_used"] = (int(ok.sum()), len(ok))
    m = np.stack([gaussian_filter1d(m[:, j], 2.0, mode="nearest") for j in range(2)], 1)
    ds = np.linalg.norm(np.diff(m, axis=0), axis=1)
    s = np.r_[0, np.cumsum(ds)]
    # ring sub-range actually covered by the targets (clipped to the strand range)
    ra = int(max(a, math.floor(min(kL.min(), kR.min()))))
    rb = int(min(b, math.ceil(max(kL.max(), kR.max()))))
    n = rb - ra + 1
    tt = np.linspace(0, s[-1], n)
    ms = np.stack([np.interp(tt, s, m[:, j]) for j in range(2)], 1)
    # (e) 3D band
    cz0 = ((wL + wR) / 2)[:, 2]
    kmean = float(np.mean((D - cz0[ra:rb + 1]) / D))
    dw = d * kmean
    h = max(25.5, float(np.hypot(*dw)) / 2)
    bxy = dw / (2 * h)
    ruling = (wR - wL)[ra:rb + 1]
    zs = float(np.mean(ruling[:, 2] / np.maximum(np.linalg.norm(ruling, axis=1), 1e-9)))
    sg = 1.0 if zs >= 0 else -1.0
    bz = sg * math.sqrt(max(0.0, 1 - float(bxy @ bxy)))
    dm = np.diff(ms * kmean, axis=0)
    if abs(bz) > 0.15:
        dcz = -(dm @ bxy) / bz
    else:
        dcz = np.zeros(len(dm))
    dmn = np.linalg.norm(dm, axis=1)
    dcz = np.clip(dcz, -3 * dmn, 3 * dmn)
    cz = np.r_[0, np.cumsum(dcz)]
    tl = np.linspace(0, 1, n)
    c0, c1 = cz0[ra], cz0[rb]
    cz = cz - (cz[0] + (cz[-1] - cz[0]) * tl) + c0 + (c1 - c0) * tl
    cw = unproject(ms, cz)
    bvec = np.array([bxy[0], bxy[1], bz])
    nL, nR = cw - h * bvec, cw + h * bvec
    res.update(ok=True, ra=ra, rb=rb, n=n, h=h, bz=bz, bxy=float(np.hypot(*bxy)), zr=(float(cz.min()), float(cz.max())), zs=zs, kmean=kmean,
               newL=nL, newR=nR, mid=ms)
    return res


def overlay(res, bL, bR, path):
    from PIL import Image, ImageDraw
    cut = Image.open(os.path.join(ROOT, "docs", "ribbon", "ref", "ak-signature-cutout.webp")).convert("RGBA")
    bg = Image.new("RGBA", cut.size, (17, 17, 17, 255)); bg.alpha_composite(cut)
    im = bg.convert("RGB")
    x0, y0, x1, y1 = [float(v) for v in res["box"].split(":")]
    pad = 25
    cb = (max(int((x0 - pad) * SCUT[0]), 0), max(int((y0 - pad) * SCUT[1]), 0), min(int((x1 + pad) * SCUT[0]), im.width), min(int((y1 + pad) * SCUT[1]), im.height))
    Z = 2
    im = im.crop(cb).resize(((cb[2] - cb[0]) * Z, (cb[3] - cb[1]) * Z), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    px = lambda P: [((p[0] * SCUT[0] - cb[0]) * Z, (p[1] * SCUT[1] - cb[1]) * Z) for p in P]
    d.rectangle([((x0 * SCUT[0] - cb[0]) * Z), ((y0 * SCUT[1] - cb[1]) * Z), ((x1 * SCUT[0] - cb[0]) * Z), ((y1 * SCUT[1] - cb[1]) * Z)], outline=(90, 90, 90))
    a, b = res["a"], res["b"]
    d.line(px(bL[a:b + 1]), fill=(160, 60, 60), width=1)
    d.line(px(bR[a:b + 1]), fill=(160, 60, 60), width=1)
    if "PL" in res and res["PL"] is not None:
        d.line(px(res["PL"]), fill=(0, 255, 255), width=2)
        d.line(px(res["PR"]), fill=(255, 0, 255), width=2)
    if res.get("ok"):
        pl, pr = project(res["newL"]), project(res["newR"])
        d.line(px(pl), fill=(255, 255, 0), width=2)
        d.line(px(pr), fill=(80, 255, 80), width=2)
        for i in range(0, len(pl), 6):
            d.line(px([pl[i], pr[i]]), fill=(255, 255, 255), width=1)
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pose", default=os.path.join(ROOT, "docs/ribbon/turns/fit/kk4/pose.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--turns", default="1,3,5,7,9")
    ap.add_argument("--reject", type=float, default=4.0)
    ap.add_argument("--blend", type=int, default=12)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    d0 = json.load(open(a.pose))
    rg = d0["variants"]["phone"]["ruled"]
    wL = pose_to_world([r["L"] for r in rg]); wR = pose_to_world([r["R"] for r in rg])
    bL, bR = project(wL), project(wR)
    O = fit3d.outline_points(None, NOEXCL)
    newL, newR = wL.copy(), wR.copy()
    lines = []
    for k in [int(v) for v in a.turns.split(",")]:
        box, ra, rb = BOXES[k]
        r = fit_turn(k, box, ra, rb, bL, bR, wL, wR, O, a.reject, lines.append)
        if r.get("ok"):
            lo, hi = r["ra"], r["rb"]
            n = r["n"]
            kk = np.arange(n)
            w = ss(np.minimum(kk, n - 1 - kk) / float(a.blend))[:, None]
            newL[lo:hi + 1] = (1 - w) * wL[lo:hi + 1] + w * r["newL"]
            newR[lo:hi + 1] = (1 - w) * wR[lo:hi + 1] + w * r["newR"]
            lines.append("T%d ACCEPTED rings %d..%d (strand %d..%d, targets L rings %s R rings %s; pts %d kept %d (amb %d), L %d R %d pts): d (%.1f,%.1f) |d| %.1f css, residual mean/max %.2f/%.2f, mid pts used %d/%d, h %.1f, |bxy| %.3f, b_z %.3f (base mean ruling z %.3f), depth %.1f..%.1f (k %.3f)"
                         % (k, lo, hi, ra, rb, r["ringsL"], r["ringsR"], r["pts"], r["kept"], r["amb"], r["nL"], r["nR"], r["d"][0], r["d"][1], r["dn"], r["rmean"], r["rmax"], r["mid_used"][0], r["mid_used"][1], r["h"], r["bxy"], r["bz"], r["zs"], r["zr"][0], r["zr"][1], r["kmean"]))
            pl, pr = project(r["newL"]), project(r["newR"])
            tL, tR = r["PL"], r["PR"]
            eL = cylfit.pt_seg_dist(pl, tL)[0]; eR = cylfit.pt_seg_dist(pr, tR)[0]
            lines.append("    new band projected edges vs target polylines (point-to-polyline css px): L mean %.2f max %.2f | R mean %.2f max %.2f" % (eL.mean(), eL.max(), eR.mean(), eR.max()))
        else:
            lines.append("T%d REJECTED/FAILED: %s; pts %d kept %d; %s" % (k, r.get("why"), r.get("pts", 0), r.get("kept", 0),
                         ("d (%.1f,%.1f) residual mean/max %.2f/%.2f" % (r["d"][0], r["d"][1], r["rmean"], r["rmax"])) if "d" in r else ""))
        overlay(r, bL, bR, os.path.join(a.out, "T%d_overlay.png" % k))
    out = dict(d0)
    out["name"] = "ak-turns-init"
    out["notes"] = "kk4 with turn rings replaced by generalised-cylinder bands (scripts/curve/turnfit.py)"
    out["variants"] = dict(phone=dict(points=[], faceSign=d0["variants"]["phone"]["faceSign"], ruled=[
        dict(L=[round(float(v), 6) for v in world_to_pose(newL[i:i + 1])[0]], R=[round(float(v), 6) for v in world_to_pose(newR[i:i + 1])[0]]) for i in range(len(newL))]))
    json.dump(out, open(os.path.join(a.out, "init_turns.json"), "w"))
    txt = "\n".join(lines)
    open(os.path.join(a.out, "turns_report.txt"), "w").write(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
