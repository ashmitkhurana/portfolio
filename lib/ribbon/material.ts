/**
 * Ribbon colour-pass material: ONE MeshPhysicalMaterial patched with
 * onBeforeCompile so the whole ribbon is a single draw call that outputs to a
 * two-attachment (MRT) render target:
 *
 *   location 0  linear, tone-mapped, premultiplied colour (full physical shading)
 *   location 1  FRONT MASK: 1 where the fragment lies inside a proxy rect AND in
 *               front of that proxy's depth, else 0 (see README, "weaving")
 *
 * Both outputs are written by the same fragment that wins the depth test, so a
 * strand hidden behind another strand can never leak into the mask.
 *
 * Per-face surface parameters (colour, roughness, clearcoat, clearcoat
 * roughness, specular tint) are looked up from the hard per-vertex `aFace`
 * (+1 face A, -1 face B, 0 rim) in the shader: no blending across the rim.
 *
 * Tone mapping happens here (not in the composite) so MSAA resolves LDR
 * values: bright HDR rim samples would otherwise alias the silhouette.
 */
import * as THREE from "three";
import { MAX_PROXIES } from "./types";
import type { RibbonSettings, ToneMapName } from "./settings";
import { patchSweepVertexFull, type SweepUniforms } from "./sweep";
import {
  AO_FRAG_DECL,
  AO_VERT_BODY,
  AO_VERT_DECL,
  createAoUniforms,
  type AoUniforms,
} from "./ao";

export interface RibbonSharedUniforms extends AoUniforms {
  uProxyRects: { value: Float32Array };
  uProxyDepth: { value: Float32Array };
  uProxyRadius: { value: Float32Array };
  uProxyCount: { value: number };
  /** drawing-buffer px per CSS px (x, y) */
  uRibScale: { value: THREE.Vector2 };
  /** viewport height in CSS px */
  uRibViewH: { value: number };
  /** [A, B, rim] linear colours, 9 floats */
  uFaceCol: { value: Float32Array };
  /** [A, B, rim] x (roughness, clearcoat, clearcoatRoughness, 0) */
  uFaceMat: { value: Float32Array };
  /** [A, B, rim] linear specular tints */
  uFaceSpec: { value: Float32Array };
  uDepthShade: { value: number };
  /** 0..1 highlight tint towards the face's own hue (0 = neutral) */
  uTint: { value: number };
  uSpecI: { value: number };
  /** share of the punctual light's specular that is kept */
  uLightSpec: { value: number };
  /** multiplier of the indirect (environment) diffuse */
  uDiffuseK: { value: number };
  /** x = Fresnel rim strength, y = power */
  uRim: { value: THREE.Vector2 };
  /** 1 = the rim strip blends face A -> face B across the thickness */
  uEdgeGrad: { value: number };
  /** rim normals blend towards the camera-facing face normal (vertex stage) */
  uRimNormalMix: { value: number };
  /** minimum AO on rim fragments */
  uRimAoFloor: { value: number };
}

export function createSharedUniforms(): RibbonSharedUniforms {
  return {
    uProxyRects: { value: new Float32Array(MAX_PROXIES * 4) },
    uProxyDepth: { value: new Float32Array(MAX_PROXIES) },
    uProxyRadius: { value: new Float32Array(MAX_PROXIES) },
    uProxyCount: { value: 0 },
    uRibScale: { value: new THREE.Vector2(1, 1) },
    uRibViewH: { value: 1 },
    uFaceCol: { value: new Float32Array(9) },
    uFaceMat: { value: new Float32Array(12) },
    uFaceSpec: { value: new Float32Array(9) },
    uDepthShade: { value: 0.1 },
    uTint: { value: 0 },
    uSpecI: { value: 1 },
    uLightSpec: { value: 1 },
    uDiffuseK: { value: 1 },
    uRim: { value: new THREE.Vector2(0, 3) },
    uEdgeGrad: { value: 0 },
    uRimNormalMix: { value: 0 },
    uRimAoFloor: { value: 0 },
    ...createAoUniforms(),
  };
}

const VERT_DECL = /* glsl */ `
uniform float uRimNormalMix;
varying float vFace;
varying float vRibbonZ;
varying float vEdgeT;
`;

const FRAG_DECL = /* glsl */ `
#define RIB_MAX ${MAX_PROXIES}
uniform vec4 uProxyRects[RIB_MAX];
uniform float uProxyDepth[RIB_MAX];
uniform float uProxyRadius[RIB_MAX];
uniform int uProxyCount;
uniform vec2 uRibScale;
uniform float uRibViewH;
uniform vec3 uFaceCol[3];
uniform vec4 uFaceMat[3];
uniform vec3 uFaceSpec[3];
uniform float uDepthShade;
uniform float uTint;
uniform float uSpecI;
uniform float uLightSpec;
uniform float uDiffuseK;
uniform vec2 uRim;
uniform float uEdgeGrad;
uniform float uRimAoFloor;
varying float vFace;
varying float vRibbonZ;
varying float vEdgeT;
layout(location = 1) out highp vec4 gMask;

// Edge strip: across the thickness the surface blends face A (t = +1) -> face B (t = -1) along a
// quintic S-curve, so the two faces look like they emerge from each other. Weight towards A:
float ribEdgeW = 0.0;
vec3 ribCol(int f) {
  if (f < 2) return uFaceCol[f];
  return uEdgeGrad > 0.5 ? mix(uFaceCol[1], uFaceCol[0], ribEdgeW) : uFaceCol[2];
}
vec4 ribMat(int f) {
  if (f < 2) return uFaceMat[f];
  return uEdgeGrad > 0.5 ? mix(uFaceMat[1], uFaceMat[0], ribEdgeW) : uFaceMat[2];
}
vec3 ribSpec(int f) {
  if (f < 2) return uFaceSpec[f];
  return uEdgeGrad > 0.5 ? mix(uFaceSpec[1], uFaceSpec[0], ribEdgeW) : uFaceSpec[2];
}

float ribRoundRectSDF(vec2 p, vec2 halfSize, float rad) {
  vec2 q = abs(p) - halfSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// FRONT MASK for this fragment (0..1). Inside a proxy rect (1 device-px AA ramp
// on the rect edge) AND in front of that proxy's depth (1 px ramp on the
// intersection line, from the screen-space derivative of z).
float ribFrontMask() {
  vec2 px = gl_FragCoord.xy / uRibScale;
  vec2 css = vec2(px.x, uRibViewH - px.y);
  float dz = max(fwidth(vRibbonZ), 1e-3);
  float m = 0.0;
  for (int i = 0; i < RIB_MAX; i++) {
    if (i >= uProxyCount) break;
    vec4 r = uProxyRects[i];
    vec2 hs = 0.5 * r.zw;
    float rad = min(uProxyRadius[i], min(hs.x, hs.y));
    float sd = ribRoundRectSDF(css - (r.xy + hs), hs, rad);
    float inside = clamp(0.5 - sd * uRibScale.x, 0.0, 1.0);
    float front = clamp((vRibbonZ - uProxyDepth[i]) / dz + 0.5, 0.0, 1.0);
    m = max(m, inside * front);
  }
  return m;
}
`;

// Tone mapping is Khronos PBR Neutral (hue-preserving; over-exposure desaturates towards WHITE).
// Nothing warm is baked in: colour comes from the material only.
//
// Optional highlight tint (`material.highlightTint`, 0..1): `ribHue` is the face's OWN hue,
// derived from its base colour (white / grey faces have no hue, so they are never tinted).
// Every reflection (specular, environment reflection, clearcoat) is multiplied by it, and
// over-exposed highlights desaturate towards it instead of towards white. With uTint = 0,
// `ribHue` is (1,1,1) and RibNeutral is exactly the stock NeutralToneMapping.
const SPEC_TINT = /* glsl */ `
vec3 ribHue = vec3(1.0);
vec3 RibNeutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * ribHue, g);
}
`;

const SPEC_TINT_APPLY = (ao: boolean) => /* glsl */ `
  // the softboxes carry the highlights: a punctual light only adds small hard dots
  reflectedLight.indirectDiffuse *= uDiffuseK;
  ${ao ? "float ribAo = ribFace == 2 ? max(vAO, uRimAoFloor) : vAO;\n  float ribAoS = pow(max(ribAo, 1e-4), uAoSpec);\n  reflectedLight.indirectDiffuse *= ribAo;" : ""}
  reflectedLight.directSpecular *= ribHue * uLightSpec;
  // Fresnel rim: reflections strengthen towards grazing angles
  float ribFres = 1.0 + uRim.x * pow(1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0), uRim.y);
  reflectedLight.indirectSpecular *= ribHue * ribFres;
  ${ao ? "reflectedLight.indirectSpecular *= ribAoS;" : ""}
  #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= ribHue * uLightSpec;
    clearcoatSpecularIndirect *= ribHue * ribFres;
    ${ao ? "clearcoatSpecularIndirect *= ribAoS;" : ""}
  #endif
`;

const DEPTH_SHADE = /* glsl */ `
  outgoingLight *= mix(1.0 - uDepthShade, 1.0, smoothstep(-340.0, 140.0, vRibbonZ));
`;

const TONE_FN: Record<ToneMapName, string> = {
  AgX: "AgXToneMapping",
  ACES: "ACESFilmicToneMapping",
  Neutral: "RibNeutral",
  Linear: "LinearToneMapping",
  Reinhard: "ReinhardToneMapping",
  Cineon: "CineonToneMapping",
};

/** lights_physical_fragment with the per-face lookups spliced in */
function patchedPhysicalChunk(): string {
  return THREE.ShaderChunk.lights_physical_fragment
    .replace(/vec3 specularColorFactor = [^;]+;/g, "vec3 specularColorFactor = ribSpec(ribFace);")
    .replace(/float specularIntensityFactor = [^;]+;/g, "float specularIntensityFactor = uSpecI;")
    .replace("material.clearcoat = clearcoat;", "material.clearcoat = ribMat(ribFace).y;")
    .replace(
      "material.clearcoatRoughness = clearcoatRoughness;",
      "material.clearcoatRoughness = ribMat(ribFace).z;",
    );
}

export interface RibbonMaterial {
  material: THREE.MeshPhysicalMaterial;
  setToneMapping(t: ToneMapName): void;
  /** compile the environment ambient-occlusion variant (ao.ts) in / out */
  setAo(on: boolean): void;
}

export function createRibbonMaterial(
  shared: RibbonSharedUniforms,
  sweep: SweepUniforms,
): RibbonMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    // DoubleSide: ruled poses can wind parts of the closed band inside out (the ruling's sign vs the sweep frame);
    // with FrontSide those parts were culled and the band looked see-through at folds (owner-confirmed 2026-10-10)
    side: THREE.DoubleSide,
    clearcoat: 1, // enables the clearcoat program; per-face value comes from uFaceMat
  });
  let tone: ToneMapName = "Neutral";
  let ao = false;
  const exposure = { value: 1 };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, sweep, { toneMappingExposure: exposure });

    // geometry comes from the GPU sweep (sweep.ts): position, normal and tangent
    // are rebuilt from the per-ring texture; the face id rides in tangent.z
    shader.vertexShader = patchSweepVertexFull(
      shader.vertexShader.replace(
        "#include <common>",
        `#include <common>\n${VERT_DECL}${ao ? AO_VERT_DECL : ""}`,
      ),
    ).replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  #ifndef FLAT_SHADED
  if (abs(tangent.z) < 0.5 && uRimNormalMix > 0.0) {
    // rim: bend the normal towards the camera-facing face normal so the thin edge catches the light
    vec3 ribFn = normalize(normalMatrix * texelFetch(uRingTex, ivec2(int(position.z + 0.5), 2), 0).xyz);
    if (dot(ribFn, -mvPosition.xyz) < 0.0) ribFn = -ribFn;
    vNormal = normalize(mix(normalize(vNormal), ribFn, uRimNormalMix));
  }
  #endif${ao ? AO_VERT_BODY : ""}\n  vFace = tangent.z;\n  vEdgeT = (position.y * (uRingProf.y - uRingProf.x) + tangent.y * uRingProf.x) / max(uRingProf.y, 1e-4);\n  vRibbonZ = (modelMatrix * vec4(transformed, 1.0)).z;`,
    );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${THREE.ShaderChunk.tonemapping_pars_fragment}\n${FRAG_DECL}${ao ? AO_FRAG_DECL : ""}\n${SPEC_TINT}`,
      )
      .replace(
        "void main() {",
        `void main() {\n  int ribFace = vFace > 0.5 ? 0 : (vFace < -0.5 ? 1 : 2);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    float te = clamp(0.5 + 0.5 * vEdgeT, 0.0, 1.0);
    ribEdgeW = te * te * te * (te * (te * 6.0 - 15.0) + 10.0);
  }
  diffuseColor.rgb = ribCol(ribFace);
  {
    // the colour hot highlights (and over-exposed areas) go to: the face's specular tint, softened.
    // Neutral for white / grey specular tints.
    vec3 sp = ribSpec(ribFace);
    ribHue = mix(vec3(1.0), pow(sp / max(max(sp.r, max(sp.g, sp.b)), 1e-4), vec3(0.45)), uTint);
  }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n  roughnessFactor = ribMat(ribFace).x;`,
      )
      .replace("#include <lights_physical_fragment>", patchedPhysicalChunk())
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${SPEC_TINT_APPLY(ao)}`)
      .replace("#include <opaque_fragment>", `${DEPTH_SHADE}\n  #include <opaque_fragment>`)
      .replace(
        "#include <tonemapping_fragment>",
        `gl_FragColor.rgb = ${TONE_FN[tone]}( gl_FragColor.rgb );
  // premultiply: the render target stores coverage in alpha (MSAA resolves it)
  gl_FragColor.rgb *= gl_FragColor.a;
  gMask = vec4(ribFrontMask());`,
      );
  };
  mat.customProgramCacheKey = () => `ribbon-v6-${tone}-${ao ? "ao" : "noao"}`;
  return {
    material: mat,
    setToneMapping(t) {
      if (t === tone) return;
      tone = t;
      mat.needsUpdate = true;
    },
    setAo(on) {
      if (on === ao) return;
      ao = on;
      mat.needsUpdate = true;
    },
  };
}

const tmpColor = new THREE.Color();

function setRGB(arr: Float32Array, i: number, hex: string): void {
  tmpColor.set(hex); // sRGB -> linear working space
  arr[i * 3] = tmpColor.r;
  arr[i * 3 + 1] = tmpColor.g;
  arr[i * 3 + 2] = tmpColor.b;
}

export function applyMaterialSettings(
  mat: THREE.MeshPhysicalMaterial,
  s: RibbonSettings["material"],
  shared: RibbonSharedUniforms,
): void {
  const faces = [s.faceA, s.faceB];
  for (let i = 0; i < 2; i++) {
    const f = faces[i];
    setRGB(shared.uFaceCol.value, i, f.color);
    setRGB(shared.uFaceSpec.value, i, f.specularColor);
    const o = i * 4;
    shared.uFaceMat.value[o] = f.roughness;
    shared.uFaceMat.value[o + 1] = f.clearcoat;
    shared.uFaceMat.value[o + 2] = f.clearcoatRoughness;
  }
  // rim strip: follows a face, optionally with its own colour, or blends A -> B (`gradient`)
  shared.uEdgeGrad.value = s.edge.mode === "gradient" ? 1 : 0;
  const src = s.edge.mode === "faceB" ? 1 : 0;
  for (let c = 0; c < 4; c++) shared.uFaceMat.value[8 + c] = shared.uFaceMat.value[src * 4 + c];
  for (let c = 0; c < 3; c++) {
    shared.uFaceCol.value[6 + c] = shared.uFaceCol.value[src * 3 + c];
    shared.uFaceSpec.value[6 + c] = shared.uFaceSpec.value[src * 3 + c];
  }
  if (s.edge.mode === "custom") {
    setRGB(shared.uFaceCol.value, 2, s.edge.color);
    setRGB(shared.uFaceSpec.value, 2, s.edge.color);
  }
  shared.uDepthShade.value = s.depthShade;
  shared.uTint.value = s.highlightTint;
  shared.uSpecI.value = s.specularIntensity;
  shared.uLightSpec.value = s.lightSpecular;
  shared.uDiffuseK.value = s.envDiffuse;
  shared.uRim.value.set(s.rim, s.rimPower);
  shared.uRimNormalMix.value = s.rimNormalMix ?? 0;
  shared.uRimAoFloor.value = s.rimAoFloor ?? 0;
  shared.uAoK.value = s.ao;
  shared.uAoSpec.value = s.aoSpec;
  shared.uAoBias.value = s.aoBias;
  shared.uAoSoft.value = s.aoSoft;
  mat.color.set(s.faceA.color);
  mat.metalness = s.metalness;
  mat.anisotropy = s.anisotropy;
  mat.anisotropyRotation = THREE.MathUtils.degToRad(s.anisotropyRotation);
  mat.ior = s.ior;
  mat.sheen = s.sheen;
  mat.sheenRoughness = s.sheenRoughness;
  mat.sheenColor.set(s.sheenColor);
}
