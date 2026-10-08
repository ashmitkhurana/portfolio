#!/usr/bin/env python3
"""Author the AK signature as a designed smooth 3D centreline (docs/ribbon/turns/CURVE_PLAN.md).

Control points are written where they APPEAR in the phone mockup (cutout px, 852 x 1846 = 390 x 844 css) plus a depth z in
world css px (+ towards the camera, text plane = 0; the camera sits at D = 422 / tan(13.2 deg) ~ 1800 px). The resolver
unprojects them, so depth never moves a point on screen. Folds and hairpins are marked on the corner / tip point.

  python3 scripts/curve/author.py <version> [width multiplier] [delta.json]  ->  docs/ribbon/turns/curve/<version>/pose.json
"""
import json, math, os, sys

SX, SY = 852.0 / 390.0, 1846.0 / 844.0
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)  # phone hero-name box (lift_sig.py)
PI = math.pi

W = 51.0  # ribbon width, css px (engine width 34 x width multiplier 1.5)
CK = 2.185  # cutout px per css px

# The one flat fold is the apex (radius in widths). Every other turn is a ROUND arc the curvature frames roll (the band
# goes edge-on through the curve, a satin roll outline), joined tangentially to straight face-on runs.
RHO_A = 0.6
GAP_A = 2 * RHO_A * W
RHO_F = 0.6  # far-left: soft (the engine's zones measured: room for ~0.6 next to the apex fold)
GAP_F = 2 * RHO_F * W
FA = -PI  # fold dihedral; the sign picks the side the strip rolls to

# depth layout (css px)
LZ = -24.0  # A left leg
RIGHT_Z = LZ + GAP_A  # A right leg: frontmost of all
BACK_Z = -20.0  # back layer: bottom-K band -> crossbar
MID_Z = 12.0  # middle layer: return -> top-K front
END_Z = -55.0  # top-K back section / end strand

T2 = 2 * PI  # base roll after the tail; level.py adds the per-run corrections (delta.json)

# review tags (not written to the pose): LB / LA = a straight run that must be face-on showing face B / A (level.py
# measures the roll the frames hold there and corrects it with twist); RAMP = where that correction changes (just after
# a turn, never inside one: a twist inside a curve would fight the frames' roll and flatten the band into a pinch)
LB, LA, RAMP = {"face": "B"}, {"face": "A"}, {"ramp": True}


def arc(E, heading, R, sweep, n, z0, z1, tag=None):
    """Points of a circular arc in the screen plane (cutout px), leaving E with `heading` (degrees, screen y down),
    radius R (css px), turning by `sweep` degrees (+ = clockwise on screen); depth eased z0 -> z1. E itself is not
    included. Returns the points and the exit heading."""
    h, sw, r = math.radians(heading), math.radians(sweep), R * CK
    sg = 1.0 if sweep > 0 else -1.0
    cx, cy = E[0] - sg * r * math.sin(h), E[1] + sg * r * math.cos(h)
    a0 = math.atan2(E[1] - cy, E[0] - cx)
    out = []
    for k in range(1, n + 1):
        f = k / n
        a = a0 + sw * f
        e = f * f * (3 - 2 * f)
        out.append((round(cx + r * math.cos(a), 1), round(cy + r * math.sin(a), 1), round(z0 + (z1 - z0) * e, 1), T2, tag))
    return out, heading + sweep


def eased_arc(E, heading, R, sweep, n, z0, z1, tag=None):
    """A round turn whose curvature eases in and out (radius 2R over the first and last 18 % of the sweep, R between), so
    no straight run meets a curve abruptly (an abrupt curvature step shows as a notch / wobble on the band's edges)."""
    parts = [(2 * R, 0.18), (R, 0.64), (2 * R, 0.18)]
    out, h, P0, z = [], heading, E, z0
    for (r, f), k in zip(parts, (max(2, n // 4), max(3, n // 2), max(2, n // 4))):
        zz = z + (z1 - z0) * f
        pts, h = arc(P0, h, r, sweep * f, k, z, zz, tag)
        out += pts
        P0, z = pts[-1][:2], zz
    return out, h


def ahead(P0, heading, d):
    h = math.radians(heading)
    return (round(P0[0] + d * math.cos(h), 1), round(P0[1] + d * math.sin(h), 1))


# left-leg frame for the wrap (cutout px): axis through L0 along U (up the leg), V across it (to the right)
L0, U, V = (115.0, 1000.0), (0.45, -0.89), (0.89, 0.45)


def leg(su, sv):
    return (round(L0[0] + su * U[0] + sv * V[0], 1), round(L0[1] + su * U[1] + sv * V[1], 1))


def helix():
    """The wrap: half a turn of a helix around the left leg (axis L0 + s U, depth LZ). Front pass (along the crossbar's
    screen line) -> curl round the outer edge -> down behind the leg -> leaving behind it already heading along the
    return's line (so the return needs no visible screen bend; the half twist happens behind the leg).
    s(phi) = s0 + sd phi - c (1 - cos phi) + e (phi - sin phi): s'(0) = sd, s'(pi) = sd + 2 e, s(pi) = s1."""
    a, b = 75.0, 30.0
    s0, s1, sd = 205.0, -100.0, -12.5
    e = (RET_SLOPE_U * a - sd) / 2
    c = (s0 + sd * math.pi + e * math.pi - s1) / 2
    out = []
    for k in range(1, 9):
        ph = math.pi * k / 8
        su = s0 + sd * ph - c * (1 - math.cos(ph)) + e * (ph - math.sin(ph))
        out.append(leg(su, -a * math.sin(ph)) + (round(LZ + b * math.cos(ph), 1), T2, RAMP if k >= 4 else None))
    out[-1] = out[-1][:4] + (LB,)  # hidden behind the leg: the anchor of the return's face
    return out


# the return's screen heading (up-right, ~22.8 deg) expressed in the leg frame: U / V components ratio
RET_H = -22.8
_rh = (math.cos(math.radians(RET_H)), math.sin(math.radians(RET_H)))
RET_SLOPE_U = (_rh[0] * U[0] + _rh[1] * U[1]) / (_rh[0] * V[0] + _rh[1] * V[1])
HX_END = leg(-100.0, 0.0)


# ---- S: the tail rises (straight on screen near the bend), one round arc, then the sweep -------------------------------
S_E = (660.0, 1540.0)  # fitted: the eased S exits onto the mockup's sweep line
S_H = math.degrees(math.atan2(S_E[1] - 1600, S_E[0] - 478))  # along the tail's last run
S_ARC, S_OUT = eased_arc(S_E, S_H, 0.95 * W, -165.6 - S_H, 12, 115.0, 88.0, RAMP)
S_X = S_ARC[-1][:2]

# ---- far-left: a round rolled corner from the sweep into the left leg ---------------------------------------------------
# the corner of the two straight runs, then the arc's entry R tan(turn / 2) before it
FL_V = (64.0, 1150.0)
FL_TURN = (-63.2) - S_OUT  # into the left leg's heading (0.45, -0.89)
FL_R = 0.8 * W
FL_E = ahead(FL_V, S_OUT + 180, FL_R * CK * math.tan(math.radians(abs(FL_TURN)) / 2))
FL_ARC, FL_OUT = arc(FL_E, S_OUT, FL_R, FL_TURN, 6, 40.0, LZ, RAMP)

# ---- bottom K: a round loop off the right leg, fitted to the approved trace (out_v9): radius 0.9 W, 218 deg, exits onto
# the trace's K band line (707,1056) -> (553,937)
BK_H = math.degrees(math.atan2(0.970, 0.244))
BK_E = (543.0, 1155.0)
BK_ARC, BK_OUT = arc(BK_E, BK_H, 0.9 * W, -218.2, 9, RIGHT_Z - 6, -14.0, RAMP)

# ---- top K: the front strand (trace heading -39 deg), a round tip of radius 0.45 W turning 168.7 deg (it rolls over like
# the S: face B -> A through it), the back section on the trace's line (709,854) -> (533,1066)
TK_H = math.degrees(math.atan2(-0.629, 0.777))
TK_E = (684.0, 728.0)
TK_ARC, TK_OUT = arc(TK_E, TK_H, 0.45 * W, 168.7, 7, MID_Z, END_Z + 10, RAMP)
TK_X = TK_ARC[-1][:2]


# (cutout x, cutout y, z css, twist rad, tag/extra)   End 1 -> End 2
P = [
    # 1. tail: off-screen bottom-left, near the camera, rising into the sculpture (face A)
    (200, 1960, 540, T2, None),
    (265, 1846, 430, T2, None),
    (350, 1700, 300, T2, LA),
    (478, 1600, 200, T2, LA),
    (S_E[0], S_E[1], 130.0, T2, RAMP),
    # 2. S: one round bend; the band rolls over its edge through it (A -> B)
] + S_ARC + [
    # the long sweep left (face B), in front of the right leg's foot
    ahead(S_X, S_OUT, 150) + (80.0, T2, RAMP),
    ahead(S_X, S_OUT, 300) + (44.0, T2, LB),
    ahead(S_X, S_OUT, 450) + (40.0, T2, None),
    (150, 1162, LZ + GAP_F, T2, None),
    # 3. far-left FOLD: flat, like the apex (broad layers, a rounded roll edge), up into the A left leg (face A)
    (64, 1147, LZ + GAP_F, T2, dict(fold=dict(angle=FA, radius=RHO_F, name="far-left"))),
    (115, 1000, LZ, T2, None),
    (215, 800, LZ, T2, None),
    (290, 650, LZ, T2, None),
    # 4. apex fold: down into the A right leg (face B), frontmost of all
    (362, 548, LZ, T2, dict(fold=dict(angle=FA, radius=RHO_A, name="apex"))),
    (408, 700, RIGHT_Z, T2, None),
    (468, 900, RIGHT_Z, T2, None),
    (512, 1045, RIGHT_Z, T2, LB),
    (BK_E[0], BK_E[1], RIGHT_Z - 4, T2, None),
    # 5. bottom K: a round loop rolling back in depth (B outside, A glimpsed in the curl)
] + BK_ARC + [
    # 6. back layer: the K band, straight up-left to the junction (trace), behind the right leg
    (660, 1011, -16, T2, LB),
    (611, 968, -18, T2, None),
    (553, 937, BACK_Z, T2, None),
    (468, 911, BACK_Z, T2, None),
    # 7. crossbar left (upper strand; trace), rising onto the front of the left leg, arching as it starts to wrap
    (374, 883, BACK_Z - 4, T2, LB),
    (318, 850, -10, T2, None),
    (260, 822, 6, T2, None),
    (205, 815, 14, T2, None),
    # 8. the wrap (trace): over the front of the left leg, a tight curl round its outer edge, behind it (the hidden half
    #    twist), out at the leg's right edge, where the band turns up-right as the return, still rolled (thin)
    (150, 834, 2, T2, None),
    (102, 870, -14, T2, None),
    (84, 920, -34, T2, RAMP),
    (96, 975, -62, T2, RAMP),
    (124, 1030, -72, T2, RAMP),
    (160, 1064, -70, T2, RAMP),
    # 9. return (lower strand; trace), opening to face-on B under the crossbar, in front of it at the V
    (254, 1036, -44, T2, RAMP),
    (346, 992, -6, T2, LB),
    (429, 938, 6, T2, None),
    (482, 893, 6, T2, RAMP),
    # 10. top-K front strand (trace), behind the right leg's top, out to the tip
    (543, 843, MID_Z - 2, T2, None),
    (610, 789, MID_Z, T2, LB),
    (TK_E[0], TK_E[1], MID_Z, T2, None),
    # 11. top-K tip: rolls over (face A after it)
] + TK_ARC + [
    # 12. end strand (trace line), dark, behind the K band, tip hidden behind the right leg
    ahead(TK_X, TK_OUT, 70) + (END_Z, T2, LA),
    ahead(TK_X, TK_OUT, 160) + (END_Z, T2, None),
    ahead(TK_X, TK_OUT, 260) + (END_Z, T2, None),
    ahead(TK_X, TK_OUT, 335) + (END_Z, T2, None),
]


def to_point(cx, cy, z, tw, extra, width, dtw=0.0):
    sx, sy = cx / SX, cy / SY
    p = dict(
        x=round((sx - ANCHOR["left"]) / ANCHOR["width"], 5),
        y=round((sy - ANCHOR["top"]) / ANCHOR["height"], 5),
        z=round(z / ANCHOR["height"], 5),
        twist=round(tw + dtw, 5),
        width=width,
    )
    if extra:
        p.update({k: v for k, v in extra.items() if k not in ("face", "ramp")})
    return p


def build(points, width=1.0, name="ak-curve", delta=None):
    d = delta or [0.0] * len(points)
    return {
        "version": 1,
        "name": name,
        "anchor": "hero-name",
        "notes": "designed 3D centreline (scripts/curve/author.py)",
        "orientation": "curvature",
        "variants": {"phone": {"points": [to_point(*q, width, d[i]) for i, q in enumerate(points)]}},
    }


if __name__ == "__main__":
    ver = sys.argv[1] if len(sys.argv) > 1 else "v0"
    width = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "ribbon", "turns", "curve", ver)
    os.makedirs(out, exist_ok=True)
    delta = None
    if len(sys.argv) > 3:  # twist corrections from scripts/curve/level.py
        delta = json.load(open(sys.argv[3]))
        assert len(delta) == len(P), "delta file was made for a different point list"
    with open(os.path.join(out, "pose.json"), "w") as f:
        json.dump(build(P, width, delta=delta), f, indent=1)
    print(os.path.abspath(os.path.join(out, "pose.json")), len(P), "points")
