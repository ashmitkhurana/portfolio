/**
 * Front-canvas "contact shadow on content": one ShadowMaterial plane per proxy
 * at the proxy's depth. The ribbon's shadow lands on the plane, darkening the
 * HTML underneath where the ribbon hovers in front. The plane is exactly the
 * proxy rect (so it never veils ribbon drawn by the back canvas outside it) and
 * its alpha fades to 0 over `pad` px towards the rect edge (rounded-rect SDF).
 */
import * as THREE from "three";
import { MAX_PROXIES } from "./proxies";

interface ContactUniforms {
  uRectHalf: { value: THREE.Vector2 };
  uPlaneSize: { value: THREE.Vector2 };
  uPad: { value: number };
  uRadius: { value: number };
}

export class ContactShadows {
  readonly group = new THREE.Group();
  private planes: THREE.Mesh[] = [];
  private mats: THREE.ShadowMaterial[] = [];
  private uniforms: ContactUniforms[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);

  constructor() {
    for (let i = 0; i < MAX_PROXIES; i++) {
      const u: ContactUniforms = {
        uRectHalf: { value: new THREE.Vector2(1, 1) },
        uPlaneSize: { value: new THREE.Vector2(1, 1) },
        uPad: { value: 60 },
        uRadius: { value: 0 },
      };
      const mat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 });
      mat.depthWrite = false;
      // skip pixels where ribbon BEHIND this plane was marked in the stencil
      mat.stencilWrite = true;
      mat.stencilRef = 1;
      mat.stencilFunc = THREE.NotEqualStencilFunc;
      mat.stencilFail = THREE.KeepStencilOp;
      mat.stencilZFail = THREE.KeepStencilOp;
      mat.stencilZPass = THREE.KeepStencilOp;
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\nuniform vec2 uPlaneSize;\nvarying vec2 vLocal;`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\n  vLocal = position.xy * uPlaneSize;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform vec2 uRectHalf;
uniform float uPad;
uniform float uRadius;
varying vec2 vLocal;
float ctRoundRect(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}`,
          )
          .replace(
            "#include <tonemapping_fragment>",
            `gl_FragColor.a *= smoothstep(0.0, uPad, -ctRoundRect(vLocal, uRectHalf, uRadius));
  #include <tonemapping_fragment>`,
          );
      };
      mat.customProgramCacheKey = () => "ribbon-contact";
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.planes.push(mesh);
      this.mats.push(mat);
      this.uniforms.push(u);
      this.group.add(mesh);
    }
  }

  /**
   * Position planes for the current proxies. Rects are CSS px in viewport
   * space (y down). Camera maps 1 world unit = 1 css px at z = 0.
   */
  update(
    rects: THREE.Vector4[],
    depth: number[],
    radius: number[],
    count: number,
    enabled: boolean,
    opacity: number,
    pad: number,
    viewW: number,
    viewH: number,
  ): void {
    for (let i = 0; i < MAX_PROXIES; i++) {
      const mesh = this.planes[i];
      if (!enabled || i >= count) {
        mesh.visible = false;
        continue;
      }
      const r = rects[i];
      const w = r.z;
      const h = r.w;
      const cx = r.x + w / 2 - viewW / 2;
      const cy = viewH / 2 - (r.y + h / 2);
      mesh.visible = true;
      mesh.position.set(cx, cy, depth[i]);
      mesh.scale.set(w, h, 1);
      this.mats[i].opacity = opacity;
      const u = this.uniforms[i];
      u.uRectHalf.value.set(w / 2, h / 2);
      u.uPlaneSize.value.set(w, h);
      u.uPad.value = Math.max(pad, 1);
      u.uRadius.value = Math.min(radius[i], w / 2, h / 2);
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
