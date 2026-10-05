# Ribbon engine

One continuous, lacquered-orange 3D ribbon rendered with three.js that weaves in
front of and behind real HTML. Framework-agnostic core in `lib/ribbon/`, React
mount in `components/ribbon/RibbonStage.tsx`, lab page at `/lab` (dev only, or
`NEXT_PUBLIC_LAB=1` for a local production build).

## Layers

```
z=3  front <canvas>  fixed, pointer-events none, TRANSPARENT (stencil + alpha)
z=2  HTML content    transparent background
z=0  back  <canvas>  fixed, OPAQUE: background (+ grain, tight bounce glow), floor shadow, ribbon
```

One CPU simulation, two `WebGLRenderer`s, each with its own scene/mesh sharing
the SAME `BufferGeometry` (typed arrays are updated in place once per frame,
both contexts upload them). Same camera on both.

## Partition rule (every ribbon pixel drawn once, except a 3px seam band)

Depth proxies are DOM elements with `data-ribbon-proxy`, optional
`data-ribbon-depth` (world z, default 0) and `data-ribbon-radius` (px).
`proxies.ts` measures them (cached; re-measured on resize / fonts / `invalidate()`;
scroll applied per frame) and feeds `uProxyRects/Depth/Radius/Count` (max 16).

In the ribbon fragment shader (`material.ts`), per fragment:

| state | meaning | back canvas | front canvas |
|---|---|---|---|
| 0 | outside every proxy rect | draws | discard |
| 1 | inside a rect, ribbon BEHIND it | draws (HTML covers it, gaps show it) | alpha 0 + stencil mark |
| 2 | in front, within 3px of the rect edge | draws | draws (overlap hides the filtered seam when canvases are scaled) |
| 3 | in front, deep inside the rect | discard | draws |

The stencil mark keeps contact-shadow planes from veiling ribbon that is behind
them. The front pass is scissored to each proxy rect (one render per rect), so
its fill cost is the sum of the proxy areas. It is skipped entirely when no
ribbon is in front of the nearest proxy.

`debug.partition` tints back-drawn red / front-drawn blue; `debug.proxyOutlines`
outlines proxies (`html[data-ribbon-debug]`).

## Camera mapping

1 world unit = 1 CSS px at z = 0. Perspective camera, fov 28 (tweakable) at
`z = (viewH/2)/tan(fov/2)`, looking at the origin; origin = viewport centre,
+y up. `engine.domToWorld(x, y)` converts viewport CSS px. The ribbon width
scales with viewport width (0.5x..1.4x of `geometry.width` at 1440).

## Rendering paths and quality tiers (`settings.ts`)

* `medium` (default): direct rendering to the canvas, native MSAA, renderer
  tone mapping (Neutral keeps orange saturated; AgX turns it salmon), DPR cap
  1.5, 600 rings, 1024 shadow map. ~60 fps at 2000x1250 on an M-series GPU.
* `low`: DPR 1, 400 rings, no contact shadows.
* `high`: `postprocessing` composer (HalfFloat MSAA + bloom), DPR 2, 900
  rings. Heavy (~30 fps at 2000x1250).
* Adaptive resolution drops the pixel ratio by 0.25 steps (floor 1) when
  frames stay over 20 ms and probes back up every ~20 s.
* The PMREM environment is built once per renderer (and debounced on edits),
  never per frame.

## Material and light

`MeshPhysicalMaterial` (lacquer: metalness 0.35, clearcoat 1) patched with
`onBeforeCompile`: face A/B colour mix from `aFace`, partition, depth shade
(darkens ribbon behind the content plane, a cheap AO substitute), debug tint.
Environment (`environment.ts`) is a mostly dark procedural studio: a few large
HDR panels with gaussian falloff (no hard edges, so no zebra bands), baked to a
512px PMREM. One directional light casts self-shadows (PCF; three r184
deprecated PCFSoftShadowMap) fitted to a quantised bounding sphere.
Background colour, film grain (background only), dither and the warm bounce
glow are one fullscreen shader in `backdrop.ts` that outputs display-referred
colour, so the page background is exactly `--bg`.

## Geometry

`frames.ts`: centripetal Catmull-Rom, resampled by arc length; rotation
minimising frames (double reflection) + twist. `geometry.ts`: rounded-rect
profile swept along the rings, analytic profile normals + true surface
derivative along the length, elliptical end caps, hairpin guard that narrows
the ribbon where edge-wise curvature would self-intersect. Everything is
preallocated and updated in place.

## Files

`settings.ts` types/defaults/tiers - `engine.ts` loop/renderers/resize - `sim.ts`
springs + idle - `noise.ts` simplex/curl - `frames.ts` curve + frames -
`geometry.ts` sweep - `material.ts` shader patch - `environment.ts` PMREM studio -
`backdrop.ts` bg/floor/wall - `contact.ts` contact shadows on content -
`proxies.ts` depth proxies - `post.ts` optional composer - `gpuTimer.ts` HUD
timing - `testPoses.ts` lab poses.
