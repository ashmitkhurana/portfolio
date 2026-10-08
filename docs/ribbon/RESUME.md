# RESUME HERE (written 2026-10-08 evening, before the owner factory-resets the Mac)

Read this first, then `docs/ribbon/turns/STATUS.md` (latest sections) and `docs/ribbon/HANDOFF.md` §1 and §5a (the owner's ribbon flow, faces and over/under). My memory notes from this machine are copied into `docs/ribbon/agent-memory/`. Restore them into the new machine's Claude memory dir, or just read them: they carry the owner's working rules.

## Where the work is
- Branch: everything is on the branch this file was pushed with. Its parent is `rebrand/ribbon`.
- `ak-hero.json` is NOT changed: swapping in a pose needs the owner's OK.
- **Current best AK: `docs/ribbon/turns/curve/best/pose.json`** (render: `best/ribbon.png`, = version r8).
  - Build it with `scripts/curve/rotosurf.py best`.

## The approach that finally works: `scripts/curve/rotosurf.py`
- The AK is built straight from the APPROVED 2D trace (`docs/ribbon/turns/out_v9/edges_v3.json`, the owner's "perfect" mockup traced).
  - Each ring's two edge points are the trace's matched cross-section, exactly where they appear on screen.
  - Only DEPTH is designed:
    - the roll from the trace's foreshortening (signed projected width → tilt);
    - the centre depth from the owner's layering (right leg front, K strands and hidden layers behind, crossbar in front of the left leg, wrap behind it);
    - the tail capped at z 260 (near the camera it blows out).
- Inside the turn windows, the OWNER-APPROVED paper sections from the old msfit runs are spliced in: S, F (far-left), A (apex + legs), P (top-K loop + end), loaded via `scripts/mockup/msfit.py`.
  - Their true rulings give the exact roll shapes.
  - Each is evaluated over its full fitted range, crossfaded with its neighbours across their overlap, and re-seated on the layering with a depth ramp (their own depths were never consistent).
- The engine draws it as a RULED pose (exact edges, no automatic frames).
  - Engine change this session: `lib/ribbon/poses/resolve.ts` resampling also weights ruling rotation.

## Pipeline commands (worktree root)
- Python: `scripts/mockup/.venv` (recreate: `python3 -m venv scripts/mockup/.venv && scripts/mockup/.venv/bin/pip install -r scripts/mockup/requirements.txt`).
- Override build, needed for renders:
  - `NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next build`
  - then `NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next start -p 4100`
  - kill it by PID, never pkill.
  - The build rewrites `next-env.d.ts` / `tsconfig.json`: `git checkout --` them afterwards.
- Pose: `scripts/mockup/.venv/bin/python scripts/curve/rotosurf.py <ver>` writes `docs/ribbon/turns/curve/<ver>/pose.json`.
  - Env knobs: `APPROVED="S:S_APPROVED,F:F_APPROVED,A:A_APPROVED,P:P_APPROVED"` (add `X:X_best` / `K:K` to try the unapproved wrap / bottom-K models; both are worse today), `REPAIR=s,farleft`, `EXTEND=none|bottomk,wrap`, `SIGMA="1:-1,..."`, `TAIL_ZMAX`, `FADE`.
- Render: `node scripts/render-pose.mjs --quick --pose <pose.json> --out <dir>` (`ribbon.png` 780×1688; drop `--quick` for the 3× turn crops).
- Checks:
  - `scripts/curve/dump-pose.mjs` + `views.py` (false colour, side/top, clearance);
  - compare crops side by side with `docs/ribbon/ref/ak-signature-cutout.webp` resized to 780×1688.

## Owner's verdicts today (latest first)
- r0–r10 (rotosurf): finally recognisable as the mockup.
  - Still open:
    1. **Bottom-K loop**: smaller than the mockup, kinked and flag-shaped at its lower right. In the mockup it is a big round loop. The trace says it is TWO ROLLS (bottom and right) with the inner face visible between them; its outer edge is hidden behind roll outlines (`silhouettes['bottomk']`, 18 points). My hidden-edge path is the trace's guess, inside the outline. Next: build the hidden-edge path so the rulings reach the roll outline (an `EXTEND` attempt only caught 3 rulings, because the `vis` flags do not match the side), or fit a 2-roll paper section to this window, the way msfit did, then re-seat its depth.
    2. **Wrap**: a hook/crumple near the left leg's base. In the mockup it is a clean arch over the leg with a curl down its outside (inner face dark). `X_best` looks clean in isolation (`msfit/overlays/section_X_shaded.png`) but splices in as a diamond: check its projected edges against the trace before splicing.
    3. Small seams remain at section joins (`r8` is much better).
    4. **Material**: the mockup is a deep saturated glossy orange with dark shading where the band turns away and bright satin highlights; ours is flat, light orange (`lib/ribbon/settings.ts` / `siteSettings.ts` material, untouched so far).
- Rejected earlier today, don't repeat:
  - **Curvature-frame authoring** (author.py + level.py, v0–v28). The frames roll the band on their own and flip faces with tiny changes (the far-left fold picks its side from the arrival angle).
  - **The explicit design surface** (surface.py, s0–s18). Every reinvented turn looked wrong to the owner: "super bad". Design from circles, arcs and twists = wrong. Build from the trace + the approved sections.
- The owner's bar: "the folds, curves and bends must be perfect"; the mockup is perfect; check close crops against it before showing anything; never call something smooth without a close crop.

## Owner's working rules (also in `agent-memory/`)
- Work until usage runs out, then resume after the reset (there is NO 80 % stop rule).
- Opus plans; Sonnet/Haiku subagents execute exact specs (max 3).
- No pkill/killall. Use `/bin/rm -f`, `/bin/cp -f`, `/bin/ls`.
- Commit locally often. Push only when the owner asks. The owner asked for this push to survive the reset.
- Never drive the owner's browser. Headless renders only.
