# Ribbon engine

One continuous, lacquered-orange 3D ribbon rendered with three.js that weaves in
front of and behind real HTML. DOM-free render core in `lib/ribbon/core.ts`, a
thin DOM adapter in `engine.ts`, React mount in `components/ribbon/RibbonStage.tsx`,
lab page at `/lab` (dev only, or `NEXT_PUBLIC_LAB=1` for a local production build).

## Render once, composite twice

```
z=3  front <canvas>  fixed, pointer-events none, TRANSPARENT  (ImageBitmapRenderingContext)
z=2  HTML content    transparent background
z=0  back  <canvas>  fixed, OPAQUE                            (ImageBitmapRenderingContext)
```

ONE `WebGLRenderer` lives on an `OffscreenCanvas` (WebGL2, `antialias:false`,
premultiplied alpha; MSAA happens in render targets). Per frame, in the same rAF:

1. shadow map (once; light + ribbon on layer 0)
2. **ribbon pass** -> `rtRibbon`, an MSAA MRT with two attachments and ONE shared
   depth buffer: attachment 0 = tone-mapped premultiplied colour (RGBA8 sRGB),
   attachment 1 = **front mask** (R8). Full physical shading happens once.
3. shadow catcher + blur (contact shadows) and, on `high`, a half-res bloom
4. **back composite** (default framebuffer): backdrop (bg, grain, bounce glow,
   floor/wall shadow receivers on layer 1) then the ribbon with its back weight
   -> `offscreen.transferToImageBitmap()` -> `back.transferFromImageBitmap()`
5. **front composite**: ribbon * front weight + contact shadows
   -> `transferToImageBitmap()` -> `front.transferFromImageBitmap()`

Both composites read the SAME `rtRibbon` texels, so shading is identical on both
canvases. Nothing in `core.ts` touches the DOM: the adapter passes plain data in
(size, DPR, proxy rects as typed arrays, time) and moves the bitmaps out, so the
core can move into a Worker unchanged (it is on the main thread for now).

### Mask and depth: MRT with a shared depth buffer

three r184 supports multisampled MRT (`WebGLRenderTarget({count: 2, samples: 4})`,
per-attachment renderbuffers + per-attachment resolve blit; the attachments may
have different formats). The mask is written by the same fragment that wins the
depth test, so a strand hidden behind another strand can never leak into the mask
and no second geometry pass is needed. A depth-texture share between two MSAA
targets is not possible in WebGL2 (multisampled depth is a renderbuffer), and
re-rendering the mask with `EQUAL` depth would double the geometry cost. The
depth renderbuffer is not resolved (`resolveDepthBuffer = false`).

Mask value per fragment (`material.ts`, `ribFrontMask`): max over proxies of
`inside(rect SDF, 1 device-px AA ramp) * front(z > proxyDepth, 1 px ramp from
fwidth(z))`. After the MSAA resolve it is coverage-weighted, so the composites
divide by the resolved alpha: `m = mask / a`.

### Seams: why they cannot appear

Front weight `wf = remap(m)`. Back weight `wb = (1 - wf) / (1 - a * wf)` (and
`1` where `a = 1`): this is the exact complement under premultiplied "over"
(front over HTML over back reproduces `c a + bg (1 - a)` for every `a`, `wf`).
For opaque ribbon pixels the back canvas simply holds the whole ribbon, the
front canvas adds identical colour on top, and the front weight only decides
what covers the HTML. So even when the browser resamples the two canvases
independently (fractional DPR, e.g. cap 1.5 on a 2x display) the proxy-rect
boundaries show no seam. (An earlier "pure complement" `wb = 1 - wf` version
showed a 25% dark line under resampling; that is why the formula is what it is.)
There is no overlap band and no stencil.

### Fallback

If OffscreenCanvas WebGL2 / `ImageBitmapRenderingContext` is missing
(`RibbonEngine.supportsWeave()`), `RibbonStage` mounts only the front canvas and
the core renders into it directly in "single" mode: ribbon (+ floor shadow) over
everything, no weaving, no backdrop (the page `--bg` shows). One `console.info`.

## Proxies

DOM elements with `data-ribbon-proxy`, optional `data-ribbon-depth` (world z,
default 0), `data-ribbon-radius` (px) and `data-ribbon-pad` (px the rect is grown
on every side, for glyph overhang with negative letter-spacing). `proxies.ts`
measures them (cached; re-measured on resize / fonts / `invalidate()`; scroll is
applied per frame) into typed arrays (`ProxyData`, max 16).

## Contact shadows on HTML (`catcher`, `passes.ts`)

* **Catcher**: the ribbon is rendered at `contact.resolution` (default 1/4) of the
  drawing buffer, no depth test, MAX blending, fragments with `z > proxyDepth`
  only, `occlusion = exp(-height / falloff)`. Proxies are grouped by depth (max 2
  groups, one RG channel pair each).
* **Offset**: each vertex is shifted in screen space along the (projected) light
  direction, proportional to its height, scaled by `contact.offset`.
* **Blur**: separable gaussian, two radii by height through channels: the
  "contact" channel (weight `o * (1-k)`) is blurred with `blurContact`, the
  "high" channel (`o * k`) with `blurHigh`; `k` grows with height.
* **Composite**: black with alpha `shadow * strength` (default 0.28), only inside
  the proxy rounded-rect SDF (fades over `contact.pad`), never over ribbon visible
  on the back layer; the front ribbon is drawn over it. Dithered.

## Camera mapping

1 world unit = 1 CSS px at z = 0. Perspective camera, fov 28 (tweakable) at
`z = (viewH/2)/tan(fov/2)`, looking at the origin; origin = viewport centre,
+y up. `engine.domToWorld(x, y)` converts viewport CSS px. The ribbon width and
bevel scale with viewport width (0.5x..1.4x of the 1440 value).

## Quality tiers and perf (`settings.ts`)

* `low`: DPR 1, MSAA 2x, 400 rings, no contact shadows.
* `medium` (default): DPR cap 1.5, MSAA 4x, 600 rings, 1024 shadow map, contact shadows.
* `high`: DPR cap 2, 900 rings, 2048 shadow map, bloom.
* Adaptive resolution drops the pixel ratio by 0.25 steps (floor 1) when frames
  stay long and probes back up every ~20 s.
* The PMREM environment is built once (debounced on edits), never per frame.
* The ribbon target is RGBA8 *sRGB* (tone mapping happens in the ribbon shader so
  MSAA resolves LDR, no aliased HDR rims): half the MSAA bandwidth of HalfFloat.
  MSAA is the dominant GPU cost (see numbers in the commit message / lab HUD).

## Material and look

`MeshPhysicalMaterial` patched via `onBeforeCompile`, one draw call:

* Flat band profile: face A (flat), left rim, face B (flat), right rim; tiny
  corner bevels (`geometry.edgeBevel`, default 0.6 px, up to T/2 = fully round).
  Vertices are split at the creases and `aFace` is a HARD per-vertex value
  (+1 / -1 / 0), so no normal or colour bleeds across the edge. Each flat face is
  subdivided (`widthSegments`) so twisted faces stay smooth.
* Per-face `color / roughness / clearcoat / clearcoatRoughness / specularColor`
  (`material.faceA`, `material.faceB`) plus `material.edge` (`faceA | faceB | custom`
  and a colour). Presets in `FACE_PRESETS`: Mockup (default), Duotone, Ember, Mono.
* Warm look: highlights are graded towards amber and tone-mapped with a
  warm-neutral curve (`RibWarmNeutral`: Khronos Neutral whose over-exposure
  desaturates towards amber, near-white only in a tiny core); this avoids the pink
  that white desaturation gives a red-orange base. `depthShade` is a subtle depth cue.
* Environment (`environment.ts`): mostly dark procedural studio of HDR softboxes
  baked to a 512px PMREM. One directional light casts self-shadows (PCF).
* Background colour, film grain (background only), dither and the warm bounce
  glow are one fullscreen shader in `backdrop.ts` (display-referred).

## Geometry (GPU sweep)

`frames.ts`: centripetal Catmull-Rom, resampled by arc length; rotation
minimising frames (double reflection, `transportFrames` + `twistFrames`).
`geometry.ts` + `sweep.ts`: **the sweep runs in the vertex shader**.

* CPU, per frame, per RING only (~0.4 ms): centreline, frame (B, N) after twist,
  effective half width, cap scales, tangent, arc param, packed into a
  `DataTexture` (RGBA32F, width = rings incl. caps, 4 rows: `[c, hw] [B, planScale]
  [N, thickScale] [T, s]`). It also derives a conservative AABB and a motion
  signature (two section corners per ring) used to gate the shadow map / catcher.
* The mesh is static (rebuilt only on topology changes): interleaved
  `position = (profile sx, sy, ring)`, `tangent = (cx, cy, face, 1)`; `normal`
  aliases `(cx, cy, face)` (three turns a standard material into flat shading and
  drops `USE_TANGENT` when `normal` is missing, so it must exist).
* `SWEEP_GLSL` (sweep.ts) reconstructs position, outward normal (dP/ds x dP/du,
  dP/ds = central difference of the neighbouring rings' swept positions, exactly
  the old CPU maths) and tangent. The SAME chunk is used by the colour/mask
  material (`onBeforeCompile`), the shadow depth/distance materials
  (`customDepthMaterial` / `customDistanceMaterial`) and the contact-shadow catcher.
* Caps are just extra rings with their own plan / thickness scale.
* Width is constant: a tight in-plane bend is relaxed by smoothing the centreline
  (`relaxPath`, sparse + prefix sums, frames resumed from the first edited ring).

## Perf notes (Step 1b)

* Ribbon target is cleared / drawn / MSAA-resolved only inside the ribbon's screen
  rect (`post.scissor`, off with bloom); composites read nothing outside it
  (`uRibRect`).
* Shadow map re-rendered only after the ribbon moved `shadows.moveThreshold` of a
  shadow texel (or the light frustum / settings changed); the contact-shadow
  catcher + blur only after it moved `contact.moveThreshold` px.
* `post.samplesRetina`: MSAA used when the pixel ratio is >= 1.75.
* Adaptive resolution has hysteresis and exponential probe back-off (engine.ts).
* Idle is calm by default (`idle.calm` in `sim.ts`, lab preset `idle.lively` = the
  Phase 1 idle): gentle breathing/drift, no twist churn; scrolling will add energy.

## Files

`types.ts` plain shared data - `settings.ts` types/defaults/tiers/face presets -
`core.ts` DOM-free pipeline - `engine.ts` DOM adapter (canvases, loop, adaptive DPR) -
`passes.ts` catcher/blur/bloom/composite shaders - `material.ts` ribbon shader patch -
`sim.ts` springs + idle - `noise.ts` - `frames.ts` curve + frames - `geometry.ts` sweep -
`environment.ts` PMREM studio - `backdrop.ts` bg/floor/wall - `proxies.ts` DOM proxies -
`sweep.ts` GPU sweep GLSL + shadow depth materials - `gpuTimer.ts` HUD timing - `testPoses.ts` lab poses (`sweep`, `twists` with clean half-twists, `knot`).

Debug (lab panel, Debug folder): `view` = mask (red behind / blue in front, proxy
outlines) | ribbon RT only | shadow catcher; `proxyOutlines`, `hud`, `gpuTimer`
(GPU queries, off by default), `wireframe`.
