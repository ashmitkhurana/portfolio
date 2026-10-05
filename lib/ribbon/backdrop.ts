/**
 * Back-layer dressing: opaque background (flat colour + vignette + warm bounce
 * glow + grain, one fullscreen quad), floor + wall shadow receivers. All of it
 * lives on three.js layer 1 (the ribbon is on layer 0) so the backdrop pass can
 * render it with the shared shadow map without re-rendering the ribbon.
 * Everything is toggleable from settings.
 */
import * as THREE from "three";
import type { RibbonSettings } from "./settings";

export const BACKDROP_LAYER = 1;

const tmpRGB = { r: 0, g: 0, b: 0 };

export class Backdrop {
  readonly group = new THREE.Group();
  readonly quad: THREE.Mesh;
  readonly quadMat: THREE.ShaderMaterial;
  readonly floor: THREE.Mesh;
  readonly wall: THREE.Mesh;
  private floorMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5 });
  private wallMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.35 });
  private quadGeo = new THREE.PlaneGeometry(2, 2);
  private planeGeo = new THREE.PlaneGeometry(1, 1);

  constructor() {
    this.quadMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBg: { value: new THREE.Vector3(0.05, 0.047, 0.043) },
        uVig: { value: 0.4 },
        uGrad: { value: 0.2 },
        uAspect: { value: 1 },
        uGlowPos: { value: new THREE.Vector2(0.6, 0.15) },
        uGlowColor: { value: new THREE.Vector3(1, 0.35, 0.06) },
        uGlowK: { value: 0.2 },
        uGlowRadius: { value: 0.5 },
        uGrain: { value: 0.03 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        // all colours here are display (sRGB) values: this quad bypasses tone mapping
        uniform vec3 uBg;
        uniform float uVig;
        uniform float uGrad;
        uniform float uAspect;
        uniform vec2 uGlowPos;
        uniform vec3 uGlowColor;
        uniform float uGlowK;
        uniform float uGlowRadius;
        uniform float uGrain;
        uniform float uTime;
        varying vec2 vUv;
        float bdHash(uvec2 p, uint seed) {
          uint h = p.x * 1664525u + p.y * 1013904223u + seed * 374761393u;
          h ^= h >> 16; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
          return float(h & 0xFFFFFFu) / 16777215.0;
        }
        void main() {
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float vig = smoothstep(0.30, 1.25, length(p));
          vec3 col = uBg * (1.0 - uVig * vig);
          col += uBg * uGrad * (1.0 - vUv.y);
          // tight warm bounce under the ribbon (gaussian, elliptical: wider than tall)
          vec2 g = (vUv - uGlowPos) * vec2(uAspect, 1.0) / vec2(max(uGlowRadius, 1e-3) * 1.6, max(uGlowRadius, 1e-3));
          col += uGlowColor * uGlowK * exp(-dot(g, g));
          // dither (kills 8-bit banding) + film grain (background only, ~12 re-seeds/sec)
          uvec2 q = uvec2(gl_FragCoord.xy);
          float f = floor(uTime * 12.0);
          float g1 = bdHash(q, 0u);
          float g2 = bdHash(q, uint(f) + 1u);
          float g3 = bdHash(q, uint(f) + 977u);
          col += (g1 - 0.5) / 255.0 * 2.0;
          col += (g2 + g3 - 1.0) * uGrain;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(this.quadGeo, this.quadMat);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -1000;

    this.floor = new THREE.Mesh(this.planeGeo, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.frustumCulled = false;

    this.wall = new THREE.Mesh(this.planeGeo, this.wallMat);
    this.wall.receiveShadow = true;
    this.wall.frustumCulled = false;

    this.group.add(this.quad, this.floor, this.wall);
    this.group.traverse((o) => o.layers.set(BACKDROP_LAYER));
  }

  /** single-canvas fallback: no background fill, only the floor shadow */
  setBackground(on: boolean): void {
    this.quad.visible = on;
  }

  apply(
    bg: RibbonSettings["background"],
    sh: RibbonSettings["shadows"],
    viewW: number,
    viewH: number,
  ): void {
    const u = this.quadMat.uniforms;
    const c = new THREE.Color(bg.color); // linear
    c.getRGB(tmpRGB, THREE.SRGBColorSpace);
    u.uBg.value.set(tmpRGB.r, tmpRGB.g, tmpRGB.b);
    u.uVig.value = bg.vignette;
    u.uGrad.value = bg.gradient;
    u.uAspect.value = viewW / Math.max(viewH, 1);
    new THREE.Color(sh.glowColor).getRGB(tmpRGB, THREE.SRGBColorSpace);
    u.uGlowColor.value.set(tmpRGB.r, tmpRGB.g, tmpRGB.b);
    u.uGlowK.value = sh.glow ? sh.glowIntensity : 0;
    u.uGlowRadius.value = sh.glowRadius;
    u.uGrain.value = bg.grain;

    this.floor.visible = sh.floor;
    this.floorMat.opacity = sh.floorOpacity;
    this.floor.scale.set(10000, 10000, 1);
    this.floor.position.set(0, -(viewH / 2) * sh.floorLevel, -2000);

    this.wall.visible = sh.wall;
    this.wallMat.opacity = sh.wallOpacity;
    this.wall.scale.set(10000, 10000, 1);
    this.wall.position.set(0, 0, -sh.wallDepth);
  }

  setTime(t: number): void {
    this.quadMat.uniforms.uTime.value = t;
  }

  /** glow centre in uv (0..1, y up) */
  setGlowPosition(x: number, y: number): void {
    (this.quadMat.uniforms.uGlowPos.value as THREE.Vector2).set(x, y);
  }

  dispose(): void {
    this.quadGeo.dispose();
    this.planeGeo.dispose();
    this.quadMat.dispose();
    this.floorMat.dispose();
    this.wallMat.dispose();
  }
}
