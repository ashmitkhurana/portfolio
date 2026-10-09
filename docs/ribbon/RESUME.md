# RESUME HERE (updated 2026-10-09 evening; weekly usage exhausted)

## HANDOFF 2026-10-10 (read first; supersedes older plans below)
- **Owner's goal (final, after many corrections):** a REALISTIC, thick, luxurious satin ribbon: one strand with two ends forming the AK signature pose as naturally as possible, flowing and folding like a real ribbon.
  - The AI mockup and the trace are only a rough idea; do NOT chase an exact match.
  - The owner's TEXTUAL spec (HANDOFF.md §5a: segment order, the face per segment, fold/flip points, edge crossover, over/under) defines the flow and wins every ambiguity.
  - The wrap must truly encircle the A left leg in 3D (needed for the slide animation).
  - Bar: Apple-level. Never show or adopt anything with wrinkles, ripples, wavy edges, creases, pinches or pass-throughs.
  - Never ask the owner to model or tune geometry.
- **Owner preferences:**
  - Send ONLY the latest render next to the mockup (mockup | render, 780×1688 box 0,440,780,1688, mockup cutout on (17,17,17)) as soon as each round finishes.
  - Keep docs/ribbon/JOURNEY.md updated every round: a version tally (v267 = real/X3; v268+ = later rounds) and the story, for the owner's blog.
- **Method:** scripts/curve/fit3d.py (one smooth B-spline ribbon: centreline c, ruling g→b, half-width h, fitted to the trace as a WEAK guide) → scripts/curve/layer.py (front/back order along camera rays) → refit with --pose/--zprior = the layered pose → layer.py. Every run folder's fit_a.log / fit_c.log holds the full arg list.
  - Checks: diagnose.py, clearance.py, silhouette.py, wrapcheck.py (wrap encircles the leg), faceaudit.py (visible face per segment vs the spec), edgecheck.py, convexcheck.py (a fold shows its outside), ripple.py, plus the scratchpad wavy.py (edge waviness).
  - Render with the thick satin band: render-pose --settings '{"geometry":{"thicknessRatio":0.147,"edgeBevel":2.4}}'.
- **Current best: docs/ribbon/turns/real/X3 (v267).** It has the T4 smooth-flow energies, the faces rule (faces.json), the wrap/leg clearance, and true folds at the apex (516) and top-K tip (1188): --fold2 R 40 + --fold_convex 10 + --flip_guard 20.
  - Good: smooth, no pass-throughs, wrap verified around the leg, apex/top-K tip are big soft arches.
  - Still open (owner): every fold and loop edge is WAVY (far-left, bottom-K, K loops, wrap); a kink just below the apex (pose ~525); a thin streak where the K strands meet the right leg (pose 668–716, the right leg's bottom going edge-on inside the bottom-K face-rule flip zone); the far-left fold is a wavy S, not a clean roll.
- **Rounds after X3 (none beat X3):**
  - Y1–Y6: far-left convexity, apex leg ramp, local energy boost, --edge_fair 50/200 (distorts the figure).
  - Z1–Z4: --fold_axis (fold line ∥ T_in+T_out) makes the folds worse; faces_v2.json (narrower flip zones) helps the streak only together with fold_axis.
  - KEY FINDING: at the creases T_in·T_out ≈ +0.7, i.e. the A legs barely reverse in 3D: they run steeply in DEPTH, so the folds can only twist. The 3D depth layout (inherited from the old trace pipeline) is too deep.
- **Round D (flatten the sculpture: --flat w = residual on the centreline tangent's depth component; chain keeps all over/unders): D1 (flat 2), D2 (flat 6), D3 (flat 6 + far-left R30/convex 10 + faces_v2), D4 (extra variant by the agent).** All four FINISHED (pose, render, all checks in docs/ribbon/turns/real/D1..D4), but the agent's report was lost in a session restart.
  - NEXT STEP: evaluate D1–D4 (T_in·T_out and |b·T| at the creases 376/516/1188; z-range; dN; wrapcheck; convexcheck; edgecheck; wavy; full-res crops vs X3).
  - If flattening lets the folds become true folds, continue from the best D. Otherwise rethink the depth layout explicitly: a shallow sculpture with the legs and loops across the view, depth only for crossings.
- **Engine and site (committed):** baked env AO, bright rims, golden-orange metallic material, soft-box fill, key light off the tail; the hero (phone + desktop) is still r40 (the owner rejected it; replace it only when a new pose passes all gates).

## CURRENT PLAN (owner, 2026-10-09 morning) — supersedes the morning summary's verdicts
- The owner REJECTED r40: "still a lot of wrinkles along the whole way" and "the wrap around the left leg of A is completely fucked up". Bar: Apple-level polish; nothing is adopted or shown unless it passes hard gates: no visible ripples or streaks in full-res close crops of every region, engine normal change ≲ 3° everywhere, zero clearance INTERSECTs (hidden ones included), silhouette no worse than r40.
- Root cause: rotosurf copies the hand-traced outline ring by ring and splices approved sections, so trace noise and splices become 3D wrinkles; with screen positions locked, the wrap curl cannot go around the left leg (it passes through it).
- New method: `scripts/curve/fit3d.py`, ONE smooth ribbon (B-spline centreline + B-spline ruling, constant width) fitted to the trace as a soft target, smoothness/developability/ruling-⊥-tangent as residuals, initialised from r40.
  - Phase A: smooth fit (wrinkles).
  - Phase B: clearance + over/under constraints (the wrap goes over the front of the left leg, curls down its outside, tucks behind; nothing passes through anything).
  - Phase C: gates + close-crop review, then the hero swap.
- Material/lighting work is paused until the shape is clean.

## Morning summary 2026-10-09 (overnight autonomous session; read this first)
- **Live hero phone pose = rotosurf r40** (owner-approved swap on this branch; desktop variant unchanged). Old file: docs/ribbon/turns/live/ak-hero.prev.json (restore: `cp docs/ribbon/turns/live/ak-hero.prev.json lib/ribbon/poses/ak-hero.json`). Current look: docs/ribbon/turns/live/ak-hero-r40/hero.png and ribbon.png.
- **Desktop hero = the same r40 sculpture** (uniformly scaled into the old desktop placement; screens docs/ribbon/turns/live/desk_r39_1440x900.png etc.; old: docs/ribbon/turns/live/ak-hero.prev2.json).
- **Geometry (r37 → r40):** top-K loop rebuilt as a constant-ruling band (`CYL`, rounder/wider, the notch where it leaves the right leg is gone); the crease at the right leg's foot removed (`EQS` second window 620:700); the apex top-left corner rounded (`EDGE_SIGW` 490:535:8). r40: the A left leg's tilt halved (`SEC_RELIEF` A:395:478:0.5:40) so it catches the light with a smooth satin highlight.
- **Engine/material:** baked environment AO (inner faces darken from occlusion only; both faces stay the same colour); bright rims instead of dark edge lines (`rimNormalMix`); golden-orange metallic material (metalness 0.7, no clearcoat, base #ff7a0a, warm specular tint, key strip el 40 / az −50 to avoid tail glare, exposure 1.2). All in lib/ribbon/siteSettings.ts.
- **Tools added:** scripts/curve/diagnose.py (per-ring dN/obliquity + overlays), clearance.py (3D strand clearance), cylfit.py, silhouette.py (render vs mockup silhouette diff + region IoU, overall 0.897), bkfit2.py; scripts/render-pose.mjs `--settings '<json>'` (live engine settings patch).
- **Still open (in order):** (1) bottom-K loop smaller than the mockup's; ring refits match the silhouette better (IoU 0.87) but render with normal flips — needs a twist-free entry from the right leg; (2) end strand #12 should be visible in the gap between the right leg and the bottom-K loop down to ~y 1100 (ours hides higher); (3) far-left fold reads as a chamfer with a small bright inner sliver; (4) a ~3 px rim seam at the apex's right shoulder (needs a rim fade-in in the engine); (5) the mockup's broad satin highlight gradients (env softbox pass); (6) hidden intersections behind the right leg (clearance clusters).
- Every step, metric and rejected attempt: docs/ribbon/turns/STATUS.md (sections dated 2026-10-09 session 2 / night).

Read this first, then `docs/ribbon/turns/STATUS.md` (latest sections) and `docs/ribbon/HANDOFF.md` §1 and §5a (the owner's ribbon flow, faces and over/under). My memory notes from this machine are copied into `docs/ribbon/agent-memory/`. Restore them into the new machine's Claude memory dir, or just read them: they carry the owner's working rules.

- **Next (from the end-of-window QA, STATUS.md last section):** bottom-K/end strand construction, far-left fold roll radius, apex top roundness.

## Where the work is
- Branch: **`claude/upbeat-hellman-f92bb7`** on origin (pushed 2026-10-08 at the owner's request before the reset). It is `rebrand/ribbon` plus all of this session's work. Restore: `git clone`, then `git checkout claude/upbeat-hellman-f92bb7`, then `npm install`, then recreate the venv (below).
- `ak-hero.json` is NOT changed: swapping in a pose needs the owner's OK.
- **Current best AK: `docs/ribbon/turns/curve/best/pose.json`** (= **r36**, 2026-10-09: r23 + the arclength-aligned S splice (`ALIGN=1 ALIGN_SECS=S`) + equal-fraction S ruling pairing (`EQS=125:230 EQS_RAMP=20`) + the crossbar re-keyed in front of the left leg (`XB_Z=70 ZCON="880:945>3,4:16"`) + the refit, smooth bottom-K ring (BK_RF/BK_NPTS=120/BK_ZRAMP=smooth); see STATUS.md 2026-10-09). r23 = `ALIGN=0 EQS= XB_Z=6 ZCON=`.
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
- `rotosurf.py` defaults now reproduce r23: `BK_RING=1 BK_FADE=3 BK_FADE_OUT=25 EDGE_SIG=3.5 ROLL_SIG=5 TAIL_ZMAX=260 FADE_S_LO=35` (TAIL_WSIG off).
- **What improved in the last stretch:**
  - **Material** (`lib/ribbon/siteSettings.ts`): saturated glossy orange. The colour is close to the mockup.
  - **Bottom K (r14)**: a cylinder band (ring from `ringfit.json`). The ruling turns from the right leg's into the ring's axis over the first 30 % of the loop, then stays on the axis. The sign is taken from the exit (the K band's edge order). The exit is crossfaded over 25 rings. It reads as one round loop with the hole open, but is still smaller and flatter than the mockup's. There is a bright flat strip at its lower right, where the inner face shows flat.
  - **Wrinkles (r19)**: smoother edges and roll. The owner reported "small wrinkles all over the surface". They come from trace-edge noise and per-ring roll noise. r19 reduces them; check close crops for any left (possibly raise EDGE_SIG / ROLL_SIG, but keep the turn windows sharp).
- **Open, in priority order:**
  1. **S**: a crease at the bottom of the S, because the capped tail is a physically wider band than W. With the true tail depth (`TAIL_ZMAX=1100`, r17) the S rounds exactly like the mockup, BUT the near tail then renders pale/washed out (distance-dependent: not the clearcoat, tested) and shows a shading step (noisy depth from perspective width).
     - Tested: NOT the clearcoat (r18) and NOT the env key light (key 8 instead of 15 just darkens everything; r20). The light is a DirectionalLight (core.ts:212). So something DEPTH-dependent brightens the near tail (z 500–1000; camera at z 1799): suspect the weave's FRONT-layer composite (passes.ts / composite material, tCatch / tMask), a near-plane effect or the edge/rim gradient on a huge projected width. Next: render the true-depth tail with the weave off or tier 1 to bisect.
     - **ROOT CAUSE FOUND (r20 dump):** with the true depth the tail's z rises ~500 px over a short screen run, so its tangent points mostly at the camera and the strip lies nearly FLAT (N = (0, -1, 0), N.v ~ -0.1). It is seen grazing and mirrors the environment, hence pale at every tier (tail RGB ~247,213,162 vs 168,66,0 when capped). The mockup's ~4× perspective widening is physically impossible for a face-on strip: it is artistic.
     - FIX: keep the tail face-on (capped/moderate depth, e.g. TAIL_ZMAX 300–500, the tangent mostly in the screen plane) and let the band's PHYSICAL width ramp from W up to the trace's width along the tail, SLOWLY. The crease at the S came from the width shrinking fast between the tail and the S window: spread that width change over the whole tail→S transition (smooth the half-width along the strip with a large sigma) so it reads as perspective, with no crease. Check `lib/ribbon/settings.ts` light (is it a point light at a finite distance?), depth-of-field / tier settings, the env key. Then use TAIL_ZMAX=1100.
     - r21 (`TAIL_ZMAX=420 TAIL_WSIG=30`, a tail width taper; the knob exists, default off): the tail is fine, but the S crease REMAINS. It is a hard diagonal at the S's lower join, so it comes from the S section splice (S_APPROVED, rings 117..240: its rulings rotate to the diagonal there), not from the width. Next: try APPROVED without S, plus REPAIR for the S window with rulings that rotate gently (only the thin top-right rim edge-on, like the mockup), or lengthen the S crossfade (FADE) on its lower side only.
  2. **Wrap**: a hook/crumple near the left leg's base (see above).
  3. **Bottom K**: bigger and rounder like the mockup (`BK_WSCALE`, and fit the ring so it passes the mockup's lower outline, `silhouettes['bottomk']`, y ~1240 cutout). Fix the flat bright strip.
  4. Highlights/shading of the material (satin bands, deep shadow where the band turns away).
  5. Seams at the section joins (S/F/A/P).
- **Never swap into `ak-hero.json` without the owner's OK. Show the owner only close-crop-checked results.**

## Handoff 2026-10-09 (read this first)

- Branch `claude/upbeat-hellman-f92bb7`, pushed. The best result is **r36** (`docs/ribbon/turns/curve/best/`, containing `pose.json` and `ribbon.png`). `scripts/mockup/.venv/bin/python scripts/curve/rotosurf.py best` reproduces it byte-identically; all new knobs default to r36 behaviour.
- `ak-hero.json` is NOT changed (needs the owner's OK).
- Details of each step are in `docs/ribbon/turns/STATUS.md`, sections dated 2026-10-09.

### Setup on a fresh machine

- `npm install`
- Python venv: `python3 -m venv scripts/mockup/.venv && scripts/mockup/.venv/bin/pip install -r scripts/mockup/requirements.txt` (plus matplotlib for the diagnostics).
- `npx playwright install chromium`
- Build: `NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next build`, then `git checkout -- next-env.d.ts tsconfig.json`.
- Serve: `NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next start -p 4100`.
- Render: `node scripts/render-pose.mjs --quick --pose <pose.json> --out <dir> [--material '<json>']` (`--material` is a live material override, no rebuild needed).
- macOS has no `timeout`. Git identity: ashmitkhurana <ashmit.khu@gmail.com>.

### Done today (r23 to r36)

- **S crease**: sections were crossfaded by ring index while out of phase with the trace. Fixed with `ALIGN=1 ALIGN_SECS=S` (arclength alignment) [r31].
- **S fan**: one edge stalled. Fixed with `EQS=125:230 EQS_RAMP=20` equal-fraction re-pairing [r33/r35]. This also halved the ridge at the S's inner corner (normal turn 18.8 to 9.5 deg/ring at ring 195).
- **Wrap**: the screen edges were right, but the crossbar was keyed behind the left leg in depth. Fixed with `XB_Z=70` plus a depth-constraint pass `ZCON="880:945>3,4:16"` (rings a..b are placed in front/behind intervals by a gap wherever they overlap on screen) [r34].
- **Bottom-K loop**: it was a 12-point polygon (creases and a bright flat facet), too small and steep, and seated in depth only at its start. Refit with ring `BK_RF=72.155,2.1885,0.7960 BK_WSCALE=1.297 BK_TURN=0.409`, `BK_NPTS=120` (`scripts/curve/ringmod.py`), `BK_FADE=10`, `BK_ZRAMP=smooth` [r36]. Loop-box IoU vs the mockup went from 0.67 to 0.84, with no clearance violations.
- **Default-off knobs kept**: `ALIGN_DEDUP`, `ZSM`, `ALIGN_ENDS` (`F:lo` rejected), `WRAP_DIP`, `WRAP_HOLD`.

### Open items, in suggested order

1. **Top-K loop**: the mockup's reaches much further right as a wide open loop; ours is narrower and pointed. Not yet diagnosed.
2. **Dent A on the S's upper edge at ring ~218 (S to F handover)**: the S and F sources disagree everywhere in their overlap (rings 211-243), with F about 18 rings out of phase with the trace. Rejected: `ALIGN_ENDS=F:lo`, a short crossfade (`SF_FADE`), and fading both into the trace (`SF_TRACE`). The next idea is in STATUS.
3. **Wrap curl bottom (rings ~941-1000)** passes through the left leg (hidden at its base); forcing it behind leaves a spike. Needs the leg's left edge to roll back where the curl wraps, or a retrace.
4. **Faint glint line across the lower S (rings 123-127)**: the band pitches into the S too fast (geometry; survives rough materials).
5. **Material and lighting**: the mockup's look is bold highlight stripes across the band plus deep red-brown shading (softbox/strip reflections); rougher materials only flatten it. Also the band edge renders as a dark line where the mockup has a bright rim.

### Method that worked

Diagnose first: map the visible defect to ring numbers via the L2/R2 dumps, then find which quantity breaks (edges, ruling pairing, depth, or normal dN). Then add env-gated knobs with defaults byte-identical, render variants, and compare crops against the mockup plus metrics (dN, edge turn, ruling intersections, z-buffer occlusion, 3D clearance with 2x7.18). Scratch tools from today lived in /private/tmp and are lost; port any you need into `scripts/curve/`.

### Owner's rules (also in `docs/ribbon/agent-memory/`)

Opus plans and reviews, Sonnet/Haiku subagents execute (max 3 in parallel); show only close-crop-checked results; never drive the owner's browser; no pkill/killall; commit locally often and push only when asked.
