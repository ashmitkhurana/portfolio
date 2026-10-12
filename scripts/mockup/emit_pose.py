#!/usr/bin/env python3
"""Write a ruled phone variant in exactly the format scripts/mockup/lift_sig.py --pose writes (write_variant + to_anchor), but to an
arbitrary output path. The base file (notes, other variants, key order) is the CURRENT lib/ribbon/poses/ak-hero.json, read only.

  emit(L, R, frame, out_json_path, faceSign=1)   L, R: (N,3) world arrays (x, y up, z toward camera; css px at z=0), one per ring
                                                  (caller subsamples; lift_sig keeps every 2nd ring)
  Self-test (round trip of the current phone variant):  .venv/bin/python scripts/mockup/emit_pose.py
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import ak_problem as AP

POSE = os.path.join(AP.ROOT, "lib/ribbon/poses/ak-hero.json")


def world_to_rings(L, R):
    """lift_sig.py:245-247: anchor space [x, y, z/height], rounded to 5 decimals"""
    Ls, Rs = AP.project_css(L), AP.project_css(R)
    return [dict(L=[round(v, 5) for v in AP.to_anchor(L[i], Ls[i])], R=[round(v, 5) for v in AP.to_anchor(R[i], Rs[i])]) for i in range(len(L))]


def rings_to_world(rings):
    """inverse: ruled variant rings -> (L, R) world"""
    return AP.from_anchor([r["L"] for r in rings]), AP.from_anchor([r["R"] for r in rings])


def emit(L, R, frame, out_json_path, faceSign=1):
    if frame != "phone":
        raise NotImplementedError("phone only")
    if os.path.abspath(out_json_path) == os.path.abspath(POSE):
        raise ValueError("refusing to write lib/ribbon/poses/ak-hero.json")
    rings = world_to_rings(np.asarray(L, float), np.asarray(R, float))
    cur = json.load(open(POSE))
    r4 = lambda v: repr(round(v * 10000) / 10000)                    # lift_sig.py:258
    t3 = lambda a: "[%s, %s, %s]" % (r4(a[0]), r4(a[1]), r4(a[2]))
    cur["variants"][frame] = dict(faceSign=faceSign, ruled=[dict(L=r["L"], R=r["R"]) for r in rings])
    out = ["{", '  "version": 1,', '  "name": "ak-hero",', '  "anchor": "hero-name",',
           '  "notes": ' + json.dumps(cur.get("notes", "")) + ",", '  "orientation": "curvature",', '  "variants": {']
    order = [c for c in ("phone", "tablet", "desktop", "ultrawide") if c in cur["variants"]]
    for ci, c in enumerate(order):
        v = cur["variants"][c]
        out.append('    "%s": {' % c)
        if v.get("ruled"):
            out.append('      "faceSign": %d,' % (v.get("faceSign", 1)))
            out.append('      "ruled": [')
            for i, r in enumerate(v["ruled"]):
                out.append('        { "L": %s, "R": %s }%s' % (t3(r["L"]), t3(r["R"]), "," if i < len(v["ruled"]) - 1 else ""))
            out.append("      ]")
        else:
            if v.get("spline") == "bspline":
                out.append('      "spline": "bspline",')
            out.append('      "points": [')
            for i, p in enumerate(v["points"]):
                extra = ""
                if p.get("fold"):
                    f = p["fold"]
                    extra += ', "fold": { "angle": %s, "radius": %s%s }' % (r4(f["angle"]), r4(f["radius"]), (', "name": ' + json.dumps(f["name"])) if f.get("name") else "")
                if p.get("hairpin"):
                    h = p["hairpin"]
                    extra += ', "hairpin": { "name": %s, "radius": %s }' % (json.dumps(h["name"]), r4(h["radius"]))
                out.append('        { "x": %s, "y": %s, "z": %s, "twist": %s, "width": %s%s }%s' % (r4(p["x"]), r4(p["y"]), r4(p["z"]), r4(p["twist"]), r4(p["width"]), extra, "," if i < len(v["points"]) - 1 else ""))
            out.append("      ]")
        out.append("    }" + ("," if ci < len(order) - 1 else ""))
    out += ["  }", "}"]
    txt = "\n".join(out) + "\n"
    json.loads(txt)
    open(out_json_path, "w").write(txt)
    return out_json_path


if __name__ == "__main__":
    cur = json.load(open(POSE))
    ph = cur["variants"]["phone"]
    L, R = rings_to_world(ph["ruled"])
    tmp = "/private/tmp/claude-501/ak_roundtrip.json"
    emit(L, R, "phone", tmp, ph.get("faceSign", 1))
    new = json.load(open(tmp))
    a = np.array([[r["L"], r["R"]] for r in ph["ruled"]]); b = np.array([[r["L"], r["R"]] for r in new["variants"]["phone"]["ruled"]])
    La, Ra = rings_to_world(new["variants"]["phone"]["ruled"])
    print("rings", len(a), "faceSign", ph.get("faceSign", 1), new["variants"]["phone"]["faceSign"])
    print("max abs error, anchor space (x, y, z): %s" % np.abs(a - b).reshape(-1, 3).max(0))
    print("max abs error, world L/R after re-inverse: %.3e (px, css units)" % max(np.abs(La - L).max(), np.abs(Ra - R).max()))
    print("desktop variant identical:", new["variants"]["desktop"] == cur["variants"]["desktop"], "; whole file byte-identical to ak-hero.json:", open(tmp).read() == open(POSE).read())
