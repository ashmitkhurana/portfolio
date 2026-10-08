# NEXT SESSION: build the AK as a designed 3D curve (read this first)

Written 2026-10-08 at the end of a very long session. Owner: Ashmit. Read HANDOFF.md §1, §5a (the owner-confirmed flow, faces, over/under) and STATUS.md, then this file.

## The owner's bar (non-negotiable)
- **Realism and flow over pixel overlap.** "I don't care if it overlaps the mockup perfectly; the folds, curves and bends must be perfect."
- Soft satin folds that flip the face. No crumples, kinks, dips, crossing panels or steel-rod in-plane bends. Nothing passes through itself.
- Build it from the owner's flow description (HANDOFF §5a). The mockup (docs/ribbon/ref/ak-signature-cutout.webp) is only a loose guide to where things sit.
- Apple-level polish. Show the owner only things you have checked yourself.

## What failed, and why (don't repeat it)
Every approach built on a **kinematic chain of rolls** failed in the far half of the ribbon:
- chain_fit
- msfit joining (a global ramp and a sequential version)
- global_fit (a depth plan)
- design_fit (from the flow)

Each roll's angle swings everything after it, so far parts drift by hundreds of px and hinge constraints stall the optimiser. Single-view depth ambiguity made independently fitted sections mutually inconsistent in depth (junction gaps 40–1300 css). Pixel-dense fitting to the mockup also over-constrained things. Details: SOLVE_SPEC.md, MULTISHOOT_PLAN.md, GLOBAL_PLAN.md, DESIGN_PLAN.md and the msfit/global/design NOTES.

## The new representation: a smooth 3D centreline + the engine's own frames and soft folds
The engine ALREADY supports it, so no export conversion is needed:
- `points` poses: centreline control points (x, y, z, twist, width in anchor space), lib/ribbon/poses/types.ts.
- `orientation: "curvature"` (lib/ribbon/frames.ts FrameMode, geometry.ts): the band bends only out of its own plane (rectifying-developable-like). In-plane steel-rod bending is impossible by construction.
- **Soft folds** (lib/ribbon/fold.ts): a paper roll about the bisector crease axis with radius ρ, which flips the face (A→B). It is authored by the turn of the path. Read its header.
- Each control point affects only its neighbourhood, so nothing swings the far end.

## Plan
1. **Read the engine's points/fold path end to end:** geometry.ts update() for non-ruled poses, frames.ts, fold.ts, poses/resolve.ts, and how folds are marked in a pose (find the field). Write a short note on how a fold is authored.
2. **Headless harness:** run the REAL engine geometry in Node (tsx or esbuild-bundle lib/ribbon/geometry.ts + deps; it's DOM-free apart from three). Given a pose JSON, it outputs the ring edge points (L/R) and normals. Every metric and fit must use exactly what will render.
3. **Author v0 by hand from the flow (HANDOFF §5a):** about 30 control points in camera-aligned 3D, End 1 → End 2:
   - the tail rising toward the camera;
   - the S fold (face A→B);
   - the sweep left;
   - the far-left fold up into the left leg;
   - the apex fold;
   - the right leg down (FRONTMOST);
   - the bottom-K loop, returning behind the right leg;
   - the crossbar left over the front of the left leg;
   - the wrap curling behind the left leg (half twist hidden there);
   - the return right, behind the right leg, in front of the back layer;
   - the top-K loop out to the upper right and folding back;
   - the end down and hidden behind the right leg.

   Use the mockup's centreline landmarks for x/y. Choose the depths yourself from the layering, small range: the right leg in front, the K strands and hidden layers behind it, the crossbar in front of the left leg, the wrap behind it. Folds: soft, ρ ≈ 0.3–0.6W.
4. **Review loop (you judge by eye):** render through the real engine with scripts/render-pose.mjs (390×844; pose override via the `.next-ak` build with NEXT_PUBLIC_POSE_OVERRIDE=1, port 4100). Also produce orthographic side/top views from the harness. Check the flow, faces, over/under, softness and no self-intersection. Adjust control points and iterate.
5. **Optional light polish:** a local optimiser on the control points only, with loose landmark residuals (soft-L1, ±20 px), face rules, over/under, clearance and smoothness. Locality keeps it stable.
6. When it looks right, show the owner the live render (localhost:3100 via launch.json "site-live", opened in their Comet with `open -a Comet`; never resize or drive their browser). Swap into ak-hero.json only after their OK.

## Assets to reuse
- Approved 2D trace: out_v9 (route_v8, guides_v5). It's the source of the landmark centreline.
- Over/under rules: overunder_v1.json.
- Render pipeline: scripts/render-pose.mjs, emit_pose.py.
- The owner-confirmed A shape (msfit/sections/sec_A_APPROVED.npz, paper model): a good reference for how the apex should look (compare renders), even though the new pose is curve-based.
- Already done: the motion engine (?motion=slide), terminal, OG/meta, skeleton, audit.

## Working rules (from memory)
- Opus plans and reviews; Sonnet/Haiku agents execute exact specs, max 3 at once.
- No pkill/killall (kill by PID/port); /bin/rm -f, /bin/cp -f, /bin/ls (interactive aliases hang); no unbounded wait loops.
- Commit locally often; never push without asking.
- Usage: the owner is usage-sensitive. Weekly was at 69% when this was written.
