#!/usr/bin/env python3
"""paper3: paper2 model + seen-from-above block on the apex roll, apex rho in [0.2W, 3W], depth pin weight 1.0, 10 tilt/rho multi-starts.
Usage: paper3_fit.py fit | report
"""
import json, math, os, sys, time
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import paper2_fit as P2   # noqa: E402
import paper as PM        # noqa: E402
import ak_apex as AA      # noqa: E402
import ak_problem as AP   # noqa: E402

K, APEX = P2.K, P2.APEX
OUT = os.path.join(AP.ROOT, 'docs/ribbon/turns/paper3')
os.makedirs(OUT, exist_ok=True)
P2.OUT = OUT
P2.W_Z = 1.0
W_SEEN = 40.0
SEEN_MARGIN = 0.2
START_SECS = 360.0
CAM = np.array([0.0, 0.0, AP.D])


def bounds(W):
    lo, hi = P2.bounds(W)
    o = 6 + 4 * APEX
    lo[o + 2], hi[o + 2] = 0.2 * W, 3.0 * W
    return lo, hi


class Problem3(P2.Problem):
    def seen(self, x):
        _, _, rolls = PM.unpack(x, K)
        u0, b, rho, phi = rolls[APEX]
        W = self.W
        t = abs(phi) * np.linspace(0.15, 0.85, 15)
        vv = np.array([-0.4, -0.2, 0.0, 0.2, 0.4]) * W
        T, V = np.meshgrid(t, vv, indexing='ij')
        Xp = (rho * T).ravel(); V = V.ravel()
        Yp = (V + Xp * np.cos(b)) / np.sin(b)
        q = np.stack([u0 + Yp * np.cos(b) + Xp * np.sin(b), V], 1)
        a = np.array([np.cos(b), np.sin(b)]); ap = np.array([np.sin(b), -np.cos(b)])
        d = 0.05
        S = lambda qq: PM.surface(x, qq[:, 0], qq[:, 1], K)
        P0 = S(q); Pp = S(q + d * ap); Pm = S(q - d * ap); Pa = S(q + d * a)
        N = np.cross(Pp - Pm, Pa - P0)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        acc = Pp + Pm - 2 * P0          # points toward the cylinder centre: outer normal has n.acc < 0
        N = np.where(((N * acc).sum(1) > 0)[:, None], -N, N)
        vh = CAM - P0
        vh /= np.linalg.norm(vh, axis=1, keepdims=True)
        return np.maximum(0.0, SEEN_MARGIN - (N * vh).sum(1)) * W_SEEN

    def parts(self, x):
        d = super().parts(x)
        d['seen'] = self.seen(x)
        return d


class Timeout(Exception):
    pass


def tilted_x(c, pr, x0, theta_deg):
    """tilt the posed model about the screen-horizontal axis through the section centroid, then re-solve (in-plane rotation about the view axis,
    translation) by Kabsch against the back-projected trace at z = 0."""
    x = x0.copy()
    if theta_deg == 0:
        pass
    ua = pr.u_all(x)
    PL, PR = PM.edges(x, ua, pr.W, K)
    idx = pr.idx
    m1 = c['v1'][idx]; m2 = c['v2'][idx]
    P = np.concatenate([PL[idx][m1], PR[idx][m2]])
    Q = np.concatenate([AP.backproject(c['e1'][idx][m1], 0.0), AP.backproject(c['e2'][idx][m2], 0.0)])
    cen = P.mean(0)
    Rt = Rotation.from_euler('x', theta_deg, degrees=True).as_matrix()
    Pt = (P - cen) @ Rt.T + cen
    # 2D Procrustes (rotation about z) + translation; z translation puts the mean depth at the trace plane (z = 0)
    pc, qc = Pt.mean(0), Q.mean(0)
    H = (Pt[:, :2] - pc[:2]).T @ (Q[:, :2] - qc[:2])
    U, _, Vt = np.linalg.svd(H)
    dd = np.sign(np.linalg.det(Vt.T @ U.T))
    R2 = Vt.T @ np.diag([1, dd]) @ U.T
    Rz = np.eye(3); Rz[:2, :2] = R2
    tz = np.array([qc[0], qc[1], 0.0]) - Rz @ pc
    R0 = Rotation.from_rotvec(x[:3]).as_matrix(); t0 = x[3:6]
    Rn = Rz @ Rt @ R0
    tn = Rz @ (Rt @ (t0 - cen) + cen) + tz
    x[:3] = Rotation.from_matrix(Rn).as_rotvec(); x[3:6] = tn
    return x


def fit():
    t0 = time.time()
    c = AA.setup(); AA.W_GLOBAL[0] = c['W']
    pr = Problem3(c)
    W = c['W']
    f2 = json.load(open(os.path.join(AP.ROOT, 'docs/ribbon/turns/paper2/fit.json')))
    xs = np.array(f2['starts'][f2['selected_index']]['x'])
    lo, hi = bounds(W)
    print(f'paper3 fit; paper2 selected: {f2["starts"][f2["selected_index"]]["name"]}; nx {P2.NX}', flush=True)
    starts = []
    for rf in (0.25, 0.4):
        for th in (-40, -20, 0, 20, 40):
            name = f'rho0 {rf}W tilt {th:+d}'
            x0 = xs.copy(); x0[6 + 4 * APEX + 2] = rf * W
            x0 = tilted_x(c, pr, x0, th)
            x0 = np.clip(x0, lo + 1e-9, hi - 1e-9)
            t1 = time.time(); best = [np.inf, x0]; status = 'ok'

            def res(x):
                r = pr.res(x)
                cst = 0.5 * float(r @ r)
                if cst < best[0]:
                    best[0], best[1] = cst, x.copy()
                if time.time() - t1 > START_SECS:
                    raise Timeout()
                return r
            try:
                r = least_squares(res, x0, method='trf', x_scale='jac', max_nfev=3000, bounds=(lo, hi), diff_step=1e-6)
                xf, cost, nfev, stat = r.x, float(r.cost), int(r.nfev), int(r.status)
            except Timeout:
                status = 'timeout'; xf, cost, nfev, stat = best[1], best[0], -1, -9
            pt = pr.parts(xf); ff = pr.front(xf)
            blocks = {k: float(0.5 * np.sum(v ** 2)) for k, v in pt.items()}
            st = dict(name=name, rho0_over_W=rf, tilt_deg=th, cost=cost, nfev=nfev, status=stat, outcome=status, blocks=blocks, front=ff,
                      right_front=bool(ff['frac_post_in_front'] > 0.5), seen_cost=blocks['seen'], x=xf.tolist(), x0=x0.tolist(), secs=time.time() - t1,
                      overlap_min_gap=float(PM.overlap_gaps(xf, W, K).min()))
            starts.append(st)
            line = (f'  {name:22s} [{status}] cost {cost:10.2f} front {ff["frac_post_in_front"]:.3f} seen {blocks["seen"]:.2f} '
                    f'rho {xf[6 + 4 * APEX + 2]:.2f} phi {np.degrees(xf[6 + 4 * APEX + 3]):.1f} ({st["secs"]:.0f}s)')
            print(line, flush=True)
            print('      blocks', {k: round(v, 2) for k, v in blocks.items()}, flush=True)
            with open(os.path.join(OUT, 'NOTES.md'), 'a') as fh:
                fh.write(line + '\n')
            json.dump(dict(starts=starts, partial=True), open(os.path.join(OUT, 'fit.json'), 'w'), indent=1, default=float)
    done = [q for q in starts if q['outcome'] == 'ok']
    ok = [q for q in done if q['right_front'] and q['seen_cost'] < 1.0]
    note = 'selected among right_front & seen<1'
    if ok:
        pool = ok
    else:
        rf_ = [q for q in done if q['right_front']] or done
        pool = [min(rf_, key=lambda q: q['seen_cost'])] if rf_ else starts[:1]
        note = 'NO start met right_front & seen<1; fallback = lowest seen cost among right_front'
        sel = pool[0]
    sel = min(pool, key=lambda q: q['cost']) if ok else pool[0]
    json.dump(dict(starts=starts, selected_index=starts.index(sel), n_qualifying=len(ok), selection_note=note, seconds=time.time() - t0),
              open(os.path.join(OUT, 'fit.json'), 'w'), indent=1, default=float)
    print('selected', starts.index(sel), sel['name'], 'cost', sel['cost'], note, flush=True)


def report():
    P2.Problem = Problem3
    P2.report()
    c = AA.setup(); AA.W_GLOBAL[0] = c['W']
    fj = json.load(open(os.path.join(OUT, 'fit.json')))
    M = json.load(open(os.path.join(OUT, 'metrics.json')))
    for m, s in zip(M['starts'], fj['starts']):
        m.update(tilt_deg=s['tilt_deg'], rho0_over_W=s['rho0_over_W'], outcome=s['outcome'], seen_cost=s['seen_cost'], secs=s['secs'])
    M['selection_note'] = fj['selection_note']
    M['seen_above_cost'] = M['cost_blocks'].get('seen')
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    print('IoU', M['silhouette_refined']['iou_in_box'], 'contour', M['silhouette_refined']['contour_err_sym'], 'z', M['z_range_refined'],
          'rho', M['apex_rho_css'], M['apex_rho_over_W'], 'phi', M['apex_phi_deg'], 'seen', M['seen_above_cost'])


if __name__ == '__main__':
    {'fit': fit, 'report': report}[sys.argv[1]]()
