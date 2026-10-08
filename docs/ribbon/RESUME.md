# RESUME HERE (written 2026-10-08 evening, before the owner factory-resets the Mac)

Read this first, then `docs/ribbon/turns/STATUS.md` (latest sections) and `docs/ribbon/HANDOFF.md` §1 and §5a (the owner's ribbon flow, faces and over/under). My memory notes from this machine are copied into `docs/ribbon/agent-memory/`. Restore them into the new machine's Claude memory dir, or just read them: they carry the owner's working rules.

## Where the work is
- Branch: **`claude/upbeat-hellman-f92bb7`** on origin (pushed 2026-10-08 at the owner's request before the reset). It is `rebrand/ribbon` plus all of this session's work. Restore: `git clone`, then `git checkout claude/upbeat-hellman-f92bb7`, then `npm install`, then recreate the venv (below).
- `ak-hero.json` is NOT changed: swapping in a pose needs the owner's OK.
- **Current best AK: `docs/ribbon/turns/curve/best/pose.json`** (render: `best/ribbon.png`, = version **r19**: r8 + the bottom-K cylinder band (r14) + smoother edges and roll (r19) + the material pass).
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
    - r11 tried `BK_RING=1` (a cylinder band from ringfit.json spliced over interval 7). Worse: the arc's start and end don't match interval 7's extent, and the 12-ring crossfade with the trace pairs folds. If retried, map the ring over the trace's loop (bk_in..bk_out, using the trace landmarks), make the band the FULL source over the window (no fade inside), and extend the axis width so the projected far edge reaches the mockup's bottom outline (y ~1240 cutout).
    - r12 (`BK_RING=1 BK_FADE=4`): the band crumples and its edges cross on the far side, probably a constant axis sign vs the trace's L/R order flipping around the loop. Not fixed.
    2. **Wrap**: a hook/crumple near the left leg's base. In the mockup it is a clean arch over the leg with a curl down its outside (inner face dark). `X_best` looks clean in isolation (`msfit/overlays/section_X_shaded.png`) but splices in as a diamond: check its projected edges against the trace before splicing.
    3. Small seams remain at section joins (`r8` is much better).
    4. **Material**: first pass done in `lib/ribbon/siteSettings.ts` (saturated #ff6a10 / #ff620e, clearcoat 0.7, envDiffuse 0.55): the colour is close now (`best/ribbon.png`). Still missing the mockup's strong satin highlight bands and the deep shading on away-facing surfaces (key light / env).
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

## Not part of this repo
`/Users/ashmitkhurana/Development/tools/ribbon-studio` is a separate, older tool (Codex's "Ribbon Studio" editor + MCP server, Oct 5; not a git repo, ~3 MB without node_modules). Nothing in the portfolio uses it: no references to it. All the AK work is in this repo.

## Latest state (end of session, 2026-10-08 ~16:25)
- `rotosurf.py` defaults now reproduce r19: `BK_RING=1 BK_FADE=3 BK_FADE_OUT=25 EDGE_SIG=3.5 ROLL_SIG=5 TAIL_ZMAX=260`.
- **What improved in the last stretch:**
  - **Material** (`lib/ribbon/siteSettings.ts`): saturated glossy orange. The colour is close to the mockup.
  - **Bottom K (r14)**: a cylinder band (ring from `ringfit.json`). The ruling turns from the right leg's into the ring's axis over the first 30 % of the loop, then stays on the axis. The sign is taken from the exit (the K band's edge order). The exit is crossfaded over 25 rings. It reads as one round loop with the hole open, but is still smaller and flatter than the mockup's. There is a bright flat strip at its lower right, where the inner face shows flat.
  - **Wrinkles (r19)**: smoother edges and roll. The owner reported "small wrinkles all over the surface". They come from trace-edge noise and per-ring roll noise. r19 reduces them; check close crops for any left (possibly raise EDGE_SIG / ROLL_SIG, but keep the turn windows sharp).
- **Open, in priority order:**
  1. **S**: a crease at the bottom of the S, because the capped tail is a physically wider band than W. With the true tail depth (`TAIL_ZMAX=1100`, r17) the S rounds exactly like the mockup, BUT the near tail then renders pale/washed out (distance-dependent: not the clearcoat, tested) and shows a shading step (noisy depth from perspective width).
     - Tested: NOT the clearcoat (r18) and NOT the env key light (key 8 instead of 15 just darkens everything; r20). The light is a DirectionalLight (core.ts:212). So something DEPTH-dependent brightens the near tail (z 500–1000; camera at z 1799): suspect the weave's FRONT-layer composite (passes.ts / composite material, tCatch / tMask), a near-plane effect or the edge/rim gradient on a huge projected width. Next: render the true-depth tail with the weave off or tier 1 to bisect.
     - Fix: smooth the tail depth more (`gsmooth` sigma >> 6) and find what brightens near-camera geometry. Check `lib/ribbon/settings.ts` light (is it a point light at a finite distance?), depth-of-field / tier settings, the env key. Then use TAIL_ZMAX=1100.
  2. **Wrap**: a hook/crumple near the left leg's base (see above).
  3. **Bottom K**: bigger and rounder like the mockup (`BK_WSCALE`, and fit the ring so it passes the mockup's lower outline, `silhouettes['bottomk']`, y ~1240 cutout). Fix the flat bright strip.
  4. Highlights/shading of the material (satin bands, deep shadow where the band turns away).
  5. Seams at the section joins (S/F/A/P).
- **Never swap into `ak-hero.json` without the owner's OK. Show the owner only close-crop-checked results.**
