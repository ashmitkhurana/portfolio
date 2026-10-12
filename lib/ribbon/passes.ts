/**
 * Fullscreen passes of the render-once pipeline (all ShaderMaterials, DOM-free):
 *
 *  - catcher: ribbon -> low-res "shadow catcher" (height above the content plane)
 *  - blur:    separable gaussian, two radii blended by height via channel pairs
 *  - bloomSrc: threshold + downsample of the ribbon target
 *  - composite (back / front / single): reads the ONE ribbon target and the front
 *    mask; outputs the back canvas (bg + ribbon) or the front canvas (ribbon over
 *    HTML + contact shadows)
 */
import * as THREE from "three";
import { MAX_PROXIES } from "./types";
import type { RibbonSharedUniforms } from "./material";
import { SWEEP_GLSL, type SweepUniforms } from "./sweep";

const FS_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export class FullscreenPass {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private static geo: THREE.BufferGeometry | null = null;
  readonly mesh: THREE.Mesh;

  constructor(readonly material: THREE.ShaderMaterial) {
    if (!FullscreenPass.geo) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
      );
      FullscreenPass.geo = g;
    }
    this.mesh = new THREE.Mesh(FullscreenPass.geo, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(r: THREE.WebGLRenderer): void {
    r.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------------------
// shadow catcher

export interface CatcherUniforms {
  uRef: { value: number };
  uGroup: { value: number };
  uOff: { value: THREE.Vector2 };
  uView: { value: THREE.Vector2 };
  uFalloff: { value: number };
}

export function createCatcherMaterial(sweep: SweepUniforms): {
  material: THREE.ShaderMaterial;
  u: CatcherUniforms;
} {
  const u: CatcherUniforms = {
    uRef: { value: 0 },
    uGroup: { value: 0 },
    uOff: { value: new THREE.Vector2(0.2, 0.3) },
    uView: { value: new THREE.Vector2(1, 1) },
    uFalloff: { value: 80 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...(u as unknown as Record<string, THREE.IUniform>), ...sweep },
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */ `
      ${SWEEP_GLSL}
      uniform float uRef;
      uniform vec2 uOff;   // css px of shadow shift per px of height (x right, y DOWN)
      uniform vec2 uView;  // css viewport size
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(ribSweepPosition(), 1.0);
        float h = wp.z - uRef;
        vH = h;
        vec4 clip = projectionMatrix * viewMatrix * wp;
        vec2 off = uOff * max(h, 0.0);
        clip.xy += vec2(off.x * 2.0 / uView.x, -off.y * 2.0 / uView.y) * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGroup;
      uniform float uFalloff;
      varying float vH;
      void main() {
        if (vH <= 0.0) discard;
        float o = exp(-vH / uFalloff);
        // close to the content: tight shadow; high above it: wide shadow
        float k = 1.0 - exp(-vH / (0.8 * uFalloff));
        vec2 v = vec2(o * (1.0 - k), o * k);
        gl_FragColor = uGroup < 0.5 ? vec4(v, 0.0, 0.0) : vec4(0.0, 0.0, v);
      }`,
  });
  return { material, u };
}

// ---------------------------------------------------------------------------
// separable blur

export interface BlurUniforms {
  tSrc: { value: THREE.Texture | null };
  uDir: { value: THREE.Vector2 };
  /** gaussian sigma in texels for channels (r, b) and (g, a) */
  uSigma: { value: THREE.Vector2 };
}

export function createBlurMaterial(): {
  material: THREE.ShaderMaterial;
  u: BlurUniforms;
} {
  const u: BlurUniforms = {
    tSrc: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uSigma: { value: new THREE.Vector2(1.5, 6) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    depthTest: false,
    depthWrite: false,
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uDir;   // one texel along the blur axis, in uv
      uniform vec2 uSigma;
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(textureSize(tSrc, 0));
        vec2 stp = max(uSigma * 0.45, vec2(0.5));
        vec4 accC = vec4(0.0);
        vec4 accW = vec4(0.0);
        float wC = 0.0;
        float wW = 0.0;
        for (int i = -7; i <= 7; i++) {
          float fi = float(i);
          float oc = fi * stp.x;
          float ow = fi * stp.y;
          float gc = exp(-0.5 * oc * oc / (uSigma.x * uSigma.x));
          float gw = exp(-0.5 * ow * ow / (uSigma.y * uSigma.y));
          accC += texture(tSrc, uv + uDir * oc) * gc;
          accW += texture(tSrc, uv + uDir * ow) * gw;
          wC += gc;
          wW += gw;
        }
        gl_FragColor = vec4(accC.r / wC, accW.g / wW, accC.b / wC, accW.a / wW);
      }`,
  });
  return { material, u };
}

// ---------------------------------------------------------------------------
// bloom source (threshold + downsample)

export interface BloomSrcUniforms {
  tRibbon: { value: THREE.Texture | null };
  tMask: { value: THREE.Texture | null };
  uThreshold: { value: number };
  /** destination size in px */
  uDst: { value: THREE.Vector2 };
}

export function createBloomSrcMaterial(): {
  material: THREE.ShaderMaterial;
  u: BloomSrcUniforms;
} {
  const u: BloomSrcUniforms = {
    tRibbon: { value: null },
    tMask: { value: null },
    uThreshold: { value: 0.8 },
    uDst: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    depthTest: false,
    depthWrite: false,
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tRibbon;
      uniform sampler2D tMask;
      uniform float uThreshold;
      uniform vec2 uDst;
      void main() {
        vec2 sz = vec2(textureSize(tRibbon, 0));
        // this pass renders at a fraction of the source size
        vec2 uv = gl_FragCoord.xy / uDst;
        vec4 acc = vec4(0.0);
        float mAcc = 0.0;
        // 4 bilinear taps = 4x4 box
        for (int i = 0; i < 4; i++) {
          vec2 o = vec2(float(i & 1) * 2.0 - 1.0, float(i >> 1) * 2.0 - 1.0) * 0.5 / sz;
          acc += texture(tRibbon, uv + o);
          mAcc += texture(tMask, uv + o).r;
        }
        acc *= 0.25;
        mAcc *= 0.25;
        float a = max(acc.a, 1e-4);
        vec3 c = acc.rgb / a;
        float peak = max(c.r, max(c.g, c.b));
        float bright = max(peak - uThreshold, 0.0) / max(peak, 1e-4);
        vec3 b = c * bright * acc.a;
        float lum = dot(b, vec3(0.2126, 0.7152, 0.0722));
        float wf = clamp(mAcc / a, 0.0, 1.0);
        gl_FragColor = vec4(b, lum * wf);
      }`,
  });
  return { material, u };
}

// ---------------------------------------------------------------------------
// composites

export type CompositeMode = "back" | "front" | "single";

export interface CompositeUniforms {
  tRibbon: { value: THREE.Texture | null };
  tMask: { value: THREE.Texture | null };
  tCatch: { value: THREE.Texture | null };
  tBloom: { value: THREE.Texture | null };
  uBuf: { value: THREE.Vector2 };
  /** device-px rect (gl_FragCoord space, y up) outside which the ribbon target holds no data */
  uRibRect: { value: THREE.Vector4 };
  uProxyGroup: { value: Float32Array };
  uShadowStrength: { value: number };
  uShadowPad: { value: number };
  uShadowOn: { value: number };
  uBloomI: { value: number };
  uView: { value: number };
  uDither: { value: number };
  uTime: { value: number };
}

export function createCompositeMaterial(
  mode: CompositeMode,
  shared: RibbonSharedUniforms,
): { material: THREE.ShaderMaterial; u: CompositeUniforms } {
  const u: CompositeUniforms = {
    tRibbon: { value: null },
    tMask: { value: null },
    tCatch: { value: null },
    tBloom: { value: null },
    uBuf: { value: new THREE.Vector2(1, 1) },
    uRibRect: { value: new THREE.Vector4(-1e6, -1e6, 1e6, 1e6) },
    uProxyGroup: { value: new Float32Array(MAX_PROXIES) },
    uShadowStrength: { value: 0.28 },
    uShadowPad: { value: 8 },
    uShadowOn: { value: 0 },
    uBloomI: { value: 0 },
    uView: { value: 0 },
    uDither: { value: 1 },
    uTime: { value: 0 },
  };
  const back = mode === "back";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...(u as unknown as Record<string, THREE.IUniform>),
      uProxyRects: shared.uProxyRects,
      uProxyDepth: shared.uProxyDepth,
      uProxyRadius: shared.uProxyRadius,
      uProxyCount: shared.uProxyCount,
      uScale: shared.uRibScale,
      uViewH: shared.uRibViewH,
    },
    defines: { RIB_MODE: mode === "back" ? 0 : mode === "front" ? 1 : 2, RIB_MAX: MAX_PROXIES },
    depthTest: false,
    depthWrite: false,
    // back: premultiplied over the backdrop already in the framebuffer.
    // front/single: raw write (the canvas starts transparent).
    transparent: back,
    blending: back ? THREE.CustomBlending : THREE.NoBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tRibbon;
      uniform sampler2D tMask;
      uniform sampler2D tCatch;
      uniform sampler2D tBloom;
      uniform vec2 uBuf;
      uniform vec4 uRibRect;
      uniform vec2 uScale;
      uniform float uViewH;
      uniform vec4 uProxyRects[RIB_MAX];
      uniform float uProxyDepth[RIB_MAX];
      uniform float uProxyRadius[RIB_MAX];
      uniform float uProxyGroup[RIB_MAX];
      uniform int uProxyCount;
      uniform float uShadowStrength;
      uniform float uShadowPad;
      uniform float uShadowOn;
      uniform float uBloomI;
      uniform float uView;
      uniform float uDither;
      uniform float uTime;

      float cmpHash(uvec2 p, uint seed) {
        uint h = p.x * 1664525u + p.y * 1013904223u + seed * 374761393u;
        h ^= h >> 16; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
        return float(h & 0xFFFFFFu) / 16777215.0;
      }
      vec3 cmpSrgb(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
      }
      float cmpSdf(vec2 p, vec2 h, float r) {
        vec2 q = abs(p) - h + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      void main() {
        ivec2 ip = ivec2(gl_FragCoord.xy);
        vec2 uv = gl_FragCoord.xy / uBuf;
        // the ribbon target is only rendered / resolved inside uRibRect (elsewhere it is stale)
        bool inRib = all(greaterThanEqual(gl_FragCoord.xy, uRibRect.xy)) && all(lessThan(gl_FragCoord.xy, uRibRect.zw));
        vec4 R = inRib ? texelFetch(tRibbon, ip, 0) : vec4(0.0);
        float a = clamp(R.a, 0.0, 1.0);
        float mres = inRib ? texelFetch(tMask, ip, 0).r : 0.0;
        // the MSAA-resolved mask is coverage-weighted: divide it back out
        float m = a > 0.002 ? clamp(mres / a, 0.0, 1.0) : 0.0;
        // Front weight wf: a 1-px AA ramp where the strand pierces the content
        // plane / a rect edge. The back weight is the exact complement under
        // "over" compositing: front (c a wf, a wf) over back (c a wb + bg (1 - a wb))
        // equals c a + bg (1 - a) iff wb = (1 - wf) / (1 - a wf). For a = 1 that is
        // wb = 1: the back layer holds the whole ribbon (the front one only adds
        // identical colour on top), so even when the browser resamples the two
        // canvases independently (fractional DPR) no seam can appear.
        // exact early-outs (nothing to draw here): no ribbon coverage, and in the
        // front composite no contact shadow either
        if (uView < 0.5 && uBloomI <= 0.0 && a <= 0.002) {
          #if RIB_MODE == 1
            if (uShadowOn < 0.5) { gl_FragColor = vec4(0.0); return; }
            vec4 C0 = texture(tCatch, uv);
            if (max(max(C0.r, C0.g), max(C0.b, C0.a)) <= 0.0) { gl_FragColor = vec4(0.0); return; }
          #elif RIB_MODE == 0
            gl_FragColor = vec4(0.0);
            return;
          #endif
        }
        float wf = clamp((m - 0.08) / 0.84, 0.0, 1.0);
        float wb = a >= 0.999 ? 1.0 : (1.0 - wf) / (1.0 - a * wf);
        #if RIB_MODE == 2
          wf = 1.0; wb = 0.0;
        #endif

        vec3 c = a > 0.002 ? R.rgb / a : vec3(0.0);
        uvec2 q = uvec2(gl_FragCoord.xy);
        float nz = (cmpHash(q, 17u) + cmpHash(q, 91u) - 1.0) * uDither;
        c = cmpSrgb(c) + nz / 255.0;
        c = clamp(c, 0.0, 1.0);

        // ---- bloom (high tier), split by the blurred front weight
        vec3 bloomB = vec3(0.0);
        vec3 bloomF = vec3(0.0);
        if (uBloomI > 0.0) {
          vec4 B = texture(tBloom, uv);
          float bl = max(dot(B.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
          float bm = clamp(B.a / bl, 0.0, 1.0);
          vec3 bc = cmpSrgb(B.rgb * uBloomI);
          // share of the glow carried by the front layer: where the front is
          // opaque it hides the back layer, so it carries all of it; the back
          // share is scaled so front + back*(1 - front alpha) == the full glow
          float bf = max(bm, a * wf);
          bloomF = bc * bf;
          bloomB = bc * min((1.0 - bf) / max(1.0 - a * wf, 1e-3), 1.0);
        }

        // ---- debug views (back composite shows them, front is cleared)
        if (uView > 0.5) {
          #if RIB_MODE == 0
            vec3 col = vec3(0.05);
            if (uView < 1.5) {
              // mask: red = drawn behind the HTML, blue = drawn in front, mixed = AA ramp
              col = mix(vec3(0.05), mix(vec3(1.0, 0.12, 0.08), vec3(0.1, 0.5, 1.0), wf) * (0.35 + 0.65 * a), a);
              // outline the proxy rects
              for (int i = 0; i < RIB_MAX; i++) {
                if (i >= uProxyCount) break;
                vec4 r = uProxyRects[i];
                vec2 hs = 0.5 * r.zw;
                vec2 css = vec2(gl_FragCoord.x / uScale.x, uViewH - gl_FragCoord.y / uScale.y);
                float sd = cmpSdf(css - (r.xy + hs), hs, min(uProxyRadius[i], min(hs.x, hs.y)));
                col = mix(col, vec3(0.3, 0.9, 1.0), (1.0 - smoothstep(0.0, 1.0, abs(sd * uScale.x))) * 0.8);
              }
            } else if (uView < 2.5) {
              float chk = mod(floor(gl_FragCoord.x / 16.0) + floor(gl_FragCoord.y / 16.0), 2.0);
              col = mix(vec3(0.12 + 0.06 * chk), c, a);
            } else {
              vec4 C = texture(tCatch, uv);
              col = vec3(C.r + C.b * 0.5, C.g + C.b * 0.5, C.a);
            }
            gl_FragColor = vec4(col, 1.0);
          #else
            gl_FragColor = vec4(0.0);
          #endif
          return;
        }

        #if RIB_MODE == 0
          // behind the HTML: ribbon * back weight, premultiplied-over the backdrop
          gl_FragColor = vec4(c * a * wb + bloomB, a * wb);
        #else
          vec3 pm = c * a * wf + bloomF;
          float alpha = a * wf;
          #if RIB_MODE == 1
            float shadow = 0.0;
            if (uShadowOn > 0.5) {
              vec2 css = vec2(gl_FragCoord.x / uScale.x, uViewH - gl_FragCoord.y / uScale.y);
              vec4 C = texture(tCatch, uv);
              for (int i = 0; i < RIB_MAX; i++) {
                if (i >= uProxyCount) break;
                vec4 r = uProxyRects[i];
                vec2 hs = 0.5 * r.zw;
                float sd = cmpSdf(css - (r.xy + hs), hs, min(uProxyRadius[i], min(hs.x, hs.y)));
                float inside = smoothstep(0.0, max(uShadowPad, 1.0), -sd);
                if (inside <= 0.0) continue;
                vec2 cw = uProxyGroup[i] < 0.5 ? C.rg : C.ba;
                float s = cw.x + cw.y - cw.x * cw.y;
                shadow = max(shadow, s * inside);
              }
            }
            // not over ribbon that is visible on the BACK layer; the front ribbon is drawn over it
            float sa = shadow * uShadowStrength * (1.0 - a * (1.0 - wf));
            sa = sa > 0.0005 ? sa + (cmpHash(q, 5u) - 0.5) / 255.0 : 0.0;
            sa = clamp(sa, 0.0, 1.0);
            alpha = alpha + sa * (1.0 - alpha);
          #endif
          gl_FragColor = vec4(pm, alpha);
        #endif
      }`,
  });
  return { material, u };
}
