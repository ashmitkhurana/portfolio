/**
 * GPU sweep: the ribbon surface is reconstructed in the VERTEX shader from a
 * tiny per-ring float texture instead of being built vertex-by-vertex on the CPU.
 *
 * CPU (geometry.ts, every frame): per ring only -- centreline, rotation-
 * minimising frame (B, N) after twist, effective half width, cap scales, tangent
 * and arc-length param -> `uRingTex` (RGBA32F, width = rings, 4 rows):
 *
 *   row 0: centre.xyz,  effective half width
 *   row 1: B.xyz,       plan scale (1 on the body, cos on the caps)
 *   row 2: N.xyz,       thickness scale (1 on the body, dome on the caps)
 *   row 3: T.xyz,       arc-length param (0..1 along the body)
 *
 * Static mesh (built once): per vertex
 *   position  = (profile sx, profile sy, ring index)
 *   tangent   = (profile cx, cy, face id, 1)      [named `tangent` so three binds it;
 *                                                  w = 1 keeps its handedness math valid]
 *
 * Every pass that draws the ribbon (colour/mask, shadow depth, contact-shadow
 * catcher) includes the SAME GLSL below, so they can never disagree.
 */
import * as THREE from "three";

export interface SweepUniforms {
  uRingTex: { value: THREE.DataTexture };
  /** x = corner bevel radius, y = half thickness, z = ring count */
  uRingProf: { value: THREE.Vector4 };
}

export const SWEEP_GLSL = /* glsl */ `
uniform sampler2D uRingTex;
uniform vec4 uRingProf;
#ifndef USE_TANGENT
attribute vec4 tangent;
#endif

vec3 ribRingPoint(int ring, vec2 sp, vec2 cp) {
  vec4 a = texelFetch(uRingTex, ivec2(ring, 0), 0);
  vec4 b = texelFetch(uRingTex, ivec2(ring, 1), 0);
  vec4 n = texelFetch(uRingTex, ivec2(ring, 2), 0);
  float r = uRingProf.x;
  float x = (sp.x * (a.w - r) + cp.x * r) * b.w;
  float y = (sp.y * (uRingProf.y - r) + cp.y * r) * n.w;
  return a.xyz + b.xyz * x + n.xyz * y;
}

// position only (shadow depth passes, contact-shadow catcher)
vec3 ribSweepPosition() {
  return ribRingPoint(int(position.z + 0.5), position.xy, tangent.xy);
}

// position + outward normal + length tangent (colour pass). The normal is
// dP/ds x dP/du with dP/ds the central difference of the swept positions of the
// neighbouring rings, exactly like the CPU version it replaces.
void ribSweep(out vec3 P, out vec3 Nrm, out vec3 Tan) {
  vec2 sp = position.xy;
  vec2 cp = tangent.xy;
  int i = int(position.z + 0.5);
  int last = int(uRingProf.z + 0.5) - 1;
  P = ribRingPoint(i, sp, cp);
  vec3 pp = i > 0 ? ribRingPoint(i - 1, sp, cp) : P;
  vec3 pn = i < last ? ribRingPoint(i + 1, sp, cp) : P;
  vec3 s = pn - pp;
  float sl = length(s);
  if (sl < 1e-9) {
    s = texelFetch(uRingTex, ivec2(i, 3), 0).xyz; // degenerate (cap tip): ring axis
    sl = 1.0;
  }
  s /= sl;
  vec3 b = texelFetch(uRingTex, ivec2(i, 1), 0).xyz;
  vec3 n = texelFetch(uRingTex, ivec2(i, 2), 0).xyz;
  vec3 u = b * (-cp.y) + n * cp.x; // profile tangent in 3D
  vec3 o = cross(s, u);
  float ol = length(o);
  Nrm = o / (ol > 0.0 ? ol : 1.0);
  Tan = s;
}
`;

/** Colour-pass vertex shader: replaces the normal / tangent / position sources. */
export function patchSweepVertexFull(src: string): string {
  return src
    .replace("#include <common>", `#include <common>\n${SWEEP_GLSL}`)
    .replace(
      "#include <beginnormal_vertex>",
      `vec3 ribP; vec3 ribN; vec3 ribT;
  ribSweep(ribP, ribN, ribT);
  ${THREE.ShaderChunk.beginnormal_vertex
    .replace("vec3( normal )", "ribN")
    .replace("vec3( tangent.xyz )", "ribT")}`,
    )
    .replace(
      "#include <begin_vertex>",
      THREE.ShaderChunk.begin_vertex.replace("vec3( position )", "ribP"),
    );
}

/** Depth / distance (shadow) pass vertex shader: position only. */
export function patchSweepVertexPosition(src: string): string {
  return src
    .replace("#include <common>", `#include <common>\n${SWEEP_GLSL}`)
    .replace(
      "#include <begin_vertex>",
      THREE.ShaderChunk.begin_vertex.replace("vec3( position )", "ribSweepPosition()"),
    );
}

/**
 * Shadow-pass materials that use the same sweep (the stock depth materials
 * would read the (meaningless) static attributes).
 */
export function createSweepDepthMaterials(sweep: SweepUniforms): {
  depth: THREE.MeshDepthMaterial;
  distance: THREE.MeshDistanceMaterial;
} {
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sweep);
    shader.vertexShader = patchSweepVertexPosition(shader.vertexShader);
  };
  depth.customProgramCacheKey = () => "ribbon-sweep-depth";
  const distance = new THREE.MeshDistanceMaterial();
  distance.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sweep);
    shader.vertexShader = patchSweepVertexPosition(shader.vertexShader);
  };
  distance.customProgramCacheKey = () => "ribbon-sweep-distance";
  return { depth, distance };
}
