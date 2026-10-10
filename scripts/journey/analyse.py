# Analyse a probe dump: screen path of the pose rings, arc from ring 0 (End 1, leading), which rings overlap the name.
import json, sys, math
d = json.load(open(sys.argv[1]))
n, W, H, D = d["n"], d["w"], d["h"], d["camZ"]
P = [d["pos"][i*3:i*3+3] for i in range(n)]
Rl = [d["ruled"][i*4:i*4+4] for i in range(n)]
def scr(x, y, z):
    s = D / (D - z); return (W/2 + x*s, H/2 - y*s)
arc = [0.0]
for i in range(1, n): arc.append(arc[-1] + math.dist(P[i], P[i-1]))
G = d["glyphs"]
def over(i):
    x, y, z = P[i]; bx, by, bz, hw = Rl[i]
    pts = [scr(x + bx*hw*t, y + by*hw*t, z + bz*hw*t) for t in (-1, -0.5, 0, 0.5, 1)]
    return any(g[0] <= px <= g[2] and g[1] <= py <= g[3] for g in G for px, py in pts)
ov = [i for i in range(n) if over(i)]
print("len", round(arc[-1]), "overlap rings:", ov[:3], "...", ov[-3:], "count", len(ov))
# runs
runs = []; 
for i in ov:
    if runs and i == runs[-1][1] + 1: runs[-1][1] = i
    else: runs.append([i, i])
print("overlap runs", runs)
for i in range(0, n, 10):
    sx, sy = scr(*P[i]); print(f"{i:4} arc {arc[i]:7.0f} scr ({sx:6.0f},{sy:6.0f}) z {P[i][2]:6.0f}", "NAME" if i in ov else "")
