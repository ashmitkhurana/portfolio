/**
 * Ribbon material: MeshPhysicalMaterial + a small onBeforeCompile patch that
 *  1. mixes face A / face B colour from the `aFace` attribute,
 *  2. implements the two-canvas PARTITION (see README):
 *       back  pass: discard fragments that are inside a proxy rect AND in front of it
 *       front pass: keep ONLY fragments inside a proxy rect AND in front of it
 *  3. optionally tints the result (red = drawn by back, blue = drawn by front).
 *
 * Both passes share the same uniform objects (proxy arrays etc.); each pass has
 * its own material instance with a different `uRibPass`.
 */
import * as THREE from "three";
import { MAX_PROXIES } from "./proxies";
import type { RibbonSettings } from "./settings";

export type RibbonPass = "back" | "front";

export interface RibbonSharedUniforms {
  uProxyRects: { value: THREE.Vector4[] };
  uProxyDepth: { value: number[] };
  uProxyRadius: { value: number[] };
  uProxyCount: { value: number };
  /** drawing-buffer px per CSS px (x, y) */
  uRibScale: { value: THREE.Vector2 };
  /** viewport height in CSS px */
  uRibViewH: { value: number };
  uRibDebug: { value: number };
  uColorB: { value: THREE.Color };
  uFaceBlend: { value: number };
  uDepthShade: { value: number };
}

export function createSharedUniforms(
  rects: THREE.Vector4[],
  depth: number[],
  radius: number[],
): RibbonSharedUniforms {
  return {
    uProxyRects: { value: rects },
    uProxyDepth: { value: depth },
    uProxyRadius: { value: radius },
    uProxyCount: { value: 0 },
    uRibScale: { value: new THREE.Vector2(1, 1) },
    uRibViewH: { value: 1 },
    uRibDebug: { value: 0 },
    uColorB: { value: new THREE.Color("#a8380a") },
    uFaceBlend: { value: 0.35 },
    uDepthShade: { value: 0.4 },
  };
}

const VERT_DECL = /* glsl */ `
attribute float aFace;
varying float vFace;
varying float vRibbonZ;
`;

const FRAG_DECL = /* glsl */ `
#define RIB_MAX ${MAX_PROXIES}
uniform vec4 uProxyRects[RIB_MAX];
uniform float uProxyDepth[RIB_MAX];
uniform float uProxyRadius[RIB_MAX];
uniform int uProxyCount;
uniform vec2 uRibScale;
uniform float uRibViewH;
uniform float uRibDebug;
uniform float uRibPass; // 0 = back canvas, 1 = front canvas
uniform vec3 uColorB;
uniform float uFaceBlend;
uniform float uDepthShade;
varying float vFace;
varying float vRibbonZ;

// signed distance to a rounded rect (negative inside)
float ribRoundRectSDF(vec2 p, vec2 halfSize, float rad) {
  vec2 q = abs(p) - halfSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// 0: outside every proxy rect, 1: inside one but only BEHIND it,
// 2: in FRONT of one but within RIB_BAND px of its edge (drawn by BOTH canvases:
//    the overlap hides the filtered/transparent seam when canvases are scaled),
// 3: in FRONT of one and deep inside its rect (front canvas only)
#define RIB_BAND 3.0
int ribFragmentState() {
  vec2 px = gl_FragCoord.xy / uRibScale;      // CSS px, y up
  vec2 css = vec2(px.x, uRibViewH - px.y);     // CSS px, y down (DOM space)
  int state = 0;
  for (int i = 0; i < RIB_MAX; i++) {
    if (i >= uProxyCount) break;
    vec4 r = uProxyRects[i];
    vec2 hs = 0.5 * r.zw;
    float rad = min(uProxyRadius[i], min(hs.x, hs.y));
    float sd = ribRoundRectSDF(css - (r.xy + hs), hs, rad);
    if (sd <= 0.0) {
      if (vRibbonZ > uProxyDepth[i]) {
        if (sd < -RIB_BAND) return 3;
        state = 2;
      } else if (state == 0) {
        state = 1;
      }
    }
  }
  return state;
}
`;

const FRAG_PARTITION = /* glsl */ `
  int ribState = ribFragmentState();
  if (uRibPass > 0.5) {
    // front canvas: keep only fragments in front of a proxy. Fragments inside a
    // proxy but BEHIND it stay (alpha 0, stencil-marked) so contact-shadow
    // planes cannot veil ribbon that is behind them.
    if (ribState == 0) discard;
    // behind-inside fragments: skip all lighting (cheap early-out); depth + stencil
    // are still written, colour/alpha are zero.
    if (ribState == 1) {
      gl_FragColor = vec4(0.0);
      return;
    }
  } else {
    if (ribState == 3) discard;
  }
`;

export function createRibbonMaterial(
  pass: RibbonPass,
  shared: RibbonSharedUniforms,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    side: THREE.FrontSide,
    clearcoat: 1,
  });
  if (pass === "front") {
    mat.transparent = true; // alpha 0 for "behind" fragments (see FRAG_PARTITION)
    mat.stencilWrite = true;
    mat.stencilRef = 1;
    mat.stencilFunc = THREE.AlwaysStencilFunc;
    mat.stencilZPass = THREE.ReplaceStencilOp;
  }
  const passUniform = { value: pass === "front" ? 1 : 0 };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, { uRibPass: passUniform });

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_DECL}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n  vFace = aFace;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n  vRibbonZ = (modelMatrix * vec4(transformed, 1.0)).z;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_DECL}`)
      .replace(
        "void main() {",
        `void main() {\n${FRAG_PARTITION}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  diffuseColor.rgb = mix(uColorB, diffuse, smoothstep(-uFaceBlend, uFaceBlend, vFace));`,
      )
      .replace(
        "#include <opaque_fragment>",
        `outgoingLight *= mix(1.0 - uDepthShade, 1.0, smoothstep(-340.0, 140.0, vRibbonZ));
  outgoingLight = mix(outgoingLight, uRibPass > 0.5 ? vec3(0.05, 0.45, 2.2) : vec3(2.2, 0.08, 0.05), 0.5 * uRibDebug);
  #include <opaque_fragment>`,
);
  };
  mat.customProgramCacheKey = () => `ribbon-${pass}`;
  return mat;
}

export function applyMaterialSettings(
  mat: THREE.MeshPhysicalMaterial,
  s: RibbonSettings["material"],
  shared: RibbonSharedUniforms,
): void {
  mat.color.set(s.colorA);
  shared.uColorB.value.set(s.colorB);
  shared.uFaceBlend.value = Math.max(s.faceBlend, 1e-3);
  shared.uDepthShade.value = s.depthShade;
  mat.roughness = s.roughness;
  mat.metalness = s.metalness;
  mat.clearcoat = s.clearcoat;
  mat.clearcoatRoughness = s.clearcoatRoughness;
  mat.anisotropy = s.anisotropy;
  mat.anisotropyRotation = THREE.MathUtils.degToRad(s.anisotropyRotation);
  mat.specularIntensity = s.specularIntensity;
  mat.ior = s.ior;
  mat.sheen = s.sheen;
  mat.sheenRoughness = s.sheenRoughness;
  mat.sheenColor.set(s.sheenColor);
}
