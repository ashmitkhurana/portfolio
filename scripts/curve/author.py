#!/usr/bin/env python3
"""Author the AK signature as a designed smooth 3D centreline (docs/ribbon/turns/CURVE_PLAN.md).

Control points are written where they APPEAR in the phone mockup (cutout px, 852 x 1846 = 390 x 844 css) plus a depth z in
world css px (+ towards the camera, text plane = 0; the camera sits at D = 422 / tan(13.2 deg) ~ 1800 px). The resolver
unprojects them, so depth never moves a point on screen. Folds and hairpins are marked on the corner / tip point.

  python3 scripts/curve/author.py <version> [width multiplier]  ->  docs/ribbon/turns/curve/<version>/pose.json
"""
import json, math, os, sys

SX, SY = 852.0 / 390.0, 1846.0 / 844.0
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)  # phone hero-name box (lift_sig.py)
PI = math.pi

# fold radius (ribbon widths)
RHO = 0.45
GAP = 2 * RHO * 51.0  # layer gap of a flat fold, css px (W ~ 51 css)

# (cutout x, cutout y, z css, twist rad, extra)   End 1 -> End 2
P = [
    # 1. tail: off-screen bottom-left, near the camera, rising into the sculpture (face A)
    (200, 1960, 1250, 0, None),
    (265, 1846, 1120, 0, None),
    (350, 1700, 900, 0, None),
    (480, 1600, 640, 0, None),
    (620, 1520, 360, 0, None),
    # 2. S: right-hand bend; the half twist rolls the band over its edge (A -> B)
    (720, 1450, 200, 0.5 * PI, None),
    (745, 1375, 140, PI, None),
    (690, 1305, 105, PI, None),
    # long sweep left (face B), in front of the right leg's foot
    (560, 1250, 80, PI, None),
    (420, 1210, 70, PI, None),
    (260, 1180, 60, PI, None),
    (150, 1162, GAP, PI, None),
    # 3. far-left fold: up into the A left leg (face A); the leg lies 2 rho behind the sweep
    (64, 1147, GAP, PI, dict(fold=dict(angle=PI, radius=RHO, name="far-left"))),
    (115, 1000, 0, PI, None),
    (215, 800, 0, PI, None),
    (290, 650, 0, PI, None),
    # 4. apex fold: down into the A right leg (face B), frontmost of all
    (362, 548, 0, PI, dict(fold=dict(angle=PI, radius=RHO, name="apex"))),
    (408, 700, GAP, PI, None),
    (468, 900, GAP, PI, None),
    (529, 1100, GAP, PI, None),
    # 5. bottom-K loop (B outside, A glimpsed inside), tilting back on the right
    (565, 1195, GAP - 6, PI, None),
    (650, 1242, 30, PI, None),
    (750, 1222, 8, PI, None),
    (815, 1150, -10, PI, dict(hairpin=dict(name="k-lower", radius=1.0))),
    (795, 1062, -8, PI, None),
    (720, 1003, -2, PI, None),
    # 6. back layer: up to the junction behind the right leg
    (630, 960, 3, PI, None),
    (550, 930, 5, PI, None),
    # 7. crossbar left (upper strand), then over the FRONT of the left leg
    (470, 905, 7, PI, None),
    (380, 878, 10, PI, None),
    (300, 835, 14, PI, None),
    (225, 808, 16, PI, None),
    (150, 826, 13, PI, None),
    # 8. curl down the outside of the left leg, wrap BEHIND it
    (95, 870, 6, PI, None),
    (68, 925, -3, PI, None),
    (85, 985, -13, PI, None),
    (140, 1035, -16, PI, None),
    # 9. return (lower strand): emerges from behind the leg's true right edge, rises to the junction
    (225, 1050, -14, PI, None),
    (305, 1012, -6, PI, None),
    (380, 965, 6, PI, None),
    (430, 932, 15, PI, None),
    (485, 893, 22, PI, None),
    # 10. top-K front strand, up-right
    (545, 845, 22, PI, None),
    (610, 788, 22, PI, None),
    (680, 742, 20, PI, None),
    (760, 712, 14, PI, None),
    # 11. top-K tip: rolled U-turn back down-left (face A, dark), behind the front strand
    (832, 745, 0, PI, dict(hairpin=dict(name="k-upper", radius=0.9))),
    (790, 805, -12, PI, None),
    (730, 845, -17, PI, None),
    # 12. end strand: down past the junction (dark, in the gap), tip hidden behind the right leg
    (670, 900, -20, PI, None),
    (610, 980, -20, PI, None),
    (560, 1060, -20, PI, None),
    (540, 1095, -20, PI, None),
]


def to_point(cx, cy, z, tw, extra, width):
    sx, sy = cx / SX, cy / SY
    p = dict(
        x=round((sx - ANCHOR["left"]) / ANCHOR["width"], 5),
        y=round((sy - ANCHOR["top"]) / ANCHOR["height"], 5),
        z=round(z / ANCHOR["height"], 5),
        twist=round(tw, 5),
        width=width,
    )
    if extra:
        p.update(extra)
    return p


def build(points, width=1.0, name="ak-curve"):
    return {
        "version": 1,
        "name": name,
        "anchor": "hero-name",
        "notes": "designed 3D centreline (scripts/curve/author.py)",
        "orientation": "curvature",
        "variants": {"phone": {"points": [to_point(*q, width) for q in points]}},
    }


if __name__ == "__main__":
    ver = sys.argv[1] if len(sys.argv) > 1 else "v0"
    width = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "ribbon", "turns", "curve", ver)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "pose.json"), "w") as f:
        json.dump(build(P, width), f, indent=1)
    print(os.path.abspath(os.path.join(out, "pose.json")), len(P), "points")
