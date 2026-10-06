/**
 * RibbonCore: the DOM-free render core. One WebGLRenderer on an OffscreenCanvas
 * (or, in the single-canvas fallback, the visible canvas), the ribbon sim and
 * geometry, and the whole render-once pipeline:
 *
 *   1. shadow map (once)
 *   2. ribbon colour + FRONT MASK  -> rtRibbon (MRT, MSAA, depth shared by both outputs)
 *   3. shadow catcher (+ blur)     -> low-res contact-shadow buffer
 *   4. back composite  (default framebuffer): backdrop + ribbon behind the HTML
 *      -> emit("back")   (the adapter transfers it to the back canvas)
 *   5. front composite (default framebuffer): ribbon in front of the HTML +
 *      contact shadows -> emit("front")
 *
 * Nothing here touches the DOM (no document / window / ResizeObserver): the
 * adapter (engine.ts) passes plain data in (size, proxies, time) and moves the
 * ImageBitmaps out, so this class can run inside a Worker unchanged.
 */
import * as THREE from "three";
import { Backdrop, BACKDROP_LAYER } from "./backdrop";
import { EnvironmentBuilder } from "./environment";
import { temperatureColor } from "./color";
import { GpuTimer } from "./gpuTimer";
import { rlog, ribbonLogFrame } from "./debugLog";
import { RibbonGeometry } from "./geometry";
import {
  applyMaterialSettings,
  createRibbonMaterial,
  createSharedUniforms,
  type RibbonMaterial,
  type RibbonSharedUniforms,
} from "./material";
import {
  createBlurMaterial,
  createBloomSrcMaterial,
  createCatcherMaterial,
  createCompositeMaterial,
  FullscreenPass,
  type BlurUniforms,
  type BloomSrcUniforms,
  type CatcherUniforms,
  type CompositeUniforms,
} from "./passes";
import {
  assignSettings,
  cloneSettings,
  mergeSettings,
  type DeepPartial,
  type RibbonSettings,
} from "./settings";
import { RibbonSim } from "./sim";
import { createSweepDepthMaterials } from "./sweep";
import { MAX_PROXIES, type ProxyData, type RibbonPose } from "./types";

export type CoreCanvas = OffscreenCanvas | HTMLCanvasElement;
export type OutputKind = "back" | "front" | "single";

export interface CoreStats {
  drawCalls: number;
  triangles: number;
  rings: number;
  vertices: number;
  frontActive: boolean;
  /** sim + geometry CPU ms of the LAST frame (pure JS, no GL sync: the device-speed probe) */
  logicMs: number;
  /** CPU submit time per stage, ms (EMA) */
  cpu: { sim: number; geometry: number; scene: number; post: number };
  /** GPU time per stage, ms (EMA; 0 unless debug.gpuTimer) */
  gpu: { scene: number; post: number; stages: Record<string, number> };
}

const DEG = Math.PI / 180;
const RIBBON_LAYER = 0;

function dirFromAngles(azDeg: number, elDeg: number, out: THREE.Vector3) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

const VIEW_INDEX = { off: 0, mask: 1, ribbon: 2, catcher: 3 } as const;

export class RibbonCore {
  readonly settings: RibbonSettings;
  readonly camera = new THREE.PerspectiveCamera(28, 1, 10, 12000);
  readonly sim: RibbonSim;
  readonly ribbon: RibbonGeometry;
  readonly stats: CoreStats = {
    drawCalls: 0,
    triangles: 0,
    rings: 0,
    vertices: 0,
    frontActive: false,
    logicMs: 0,
    cpu: { sim: 0, geometry: 0, scene: 0, post: 0 },
    gpu: { scene: 0, post: 0, stages: {} },
  };

  /** CSS px size */
  width = 1;
  height = 1;
  pixelRatio = 1;
  /** drawing-buffer size (device px) */
  bufW = 1;
  bufH = 1;

  readonly renderer: THREE.WebGLRenderer;
  private readonly weave: boolean;
  private scene = new THREE.Scene();
  private light: THREE.DirectionalLight;
  private ribbonMat: RibbonMaterial;
  private depthMat: THREE.MeshDepthMaterial;
  private distanceMat: THREE.MeshDistanceMaterial;
  private mesh: THREE.Mesh;
  private env: EnvironmentBuilder;
  private backdrop = new Backdrop();
  private shared: RibbonSharedUniforms;

  private rtRibbon: THREE.WebGLRenderTarget;
  private rtCatchA: THREE.WebGLRenderTarget;
  private rtCatchB: THREE.WebGLRenderTarget;
  private rtBloomA: THREE.WebGLRenderTarget | null = null;
  private rtBloomB: THREE.WebGLRenderTarget | null = null;

  private catcherScene = new THREE.Scene();
  private catcherMesh: THREE.Mesh;
  private catcherU: CatcherUniforms;
  private blur: FullscreenPass;
  private blurU: BlurUniforms;
  private bloomSrc: FullscreenPass;
  private bloomSrcU: BloomSrcUniforms;
  private compBack: FullscreenPass;
  private compBackU: CompositeUniforms;
  private compFront: FullscreenPass;
  private compFrontU: CompositeUniforms;
  private stageTimers: Record<string, GpuTimer> = {};

  private groupDepth = [0, 0];
  private groupCount = 1;
  private envTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private applied = { geometry: "", env: "", samples: -1, shadowSize: 0 };
  private tmpV = new THREE.Vector3();
  private lightCenter = new THREE.Vector3();
  private lightRadius = 0;
  private frontWasActive = false;
  private forceShadow = true;
  private shadowRendered = false;
  private catcherRendered = false;
  private contactWanted = false;
  // motion-gated shadow map / catcher (see frame())
  private shadowSig: Float32Array | null = null;
  private shadowLight = new THREE.Vector4(NaN, 0, 0, 0);
  private catcherSig: Float32Array | null = null;
  private catcherDirty = true;
  private catcherValid = false;
  private catcherGroups = new THREE.Vector3(NaN, 0, 0);
  private ribRectDev = new THREE.Vector4();
  private frameIndex = 0;
  private glowX = 0.6;
  private glowY = 0.2;
  private glowInit = false;
  private envYaw = 0;
  private disposed = false;

  constructor(
    private canvas: CoreCanvas,
    opts: {
      settings?: DeepPartial<RibbonSettings>;
      controlPoints?: number;
      /** false: single-canvas fallback (ribbon over everything, no backdrop) */
      weave?: boolean;
    } = {},
  ) {
    this.weave = opts.weave ?? true;
    this.settings = mergeSettings(opts.settings);
    const s = this.settings;
    this.sim = new RibbonSim(opts.controlPoints ?? 64);
    this.ribbon = new RibbonGeometry(s.geometry, 128);
    this.shared = createSharedUniforms();

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas as HTMLCanvasElement,
      antialias: false, // MSAA happens in the render targets
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // tone mapping is done in the ribbon shader
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.autoClear = false;
    r.info.autoReset = false;
    r.setClearColor(0x000000, 0);

    // ---- scene: ribbon (layer 0) + backdrop (layer 1) + the light (both)
    this.ribbonMat = createRibbonMaterial(this.shared, this.ribbon.sweep);
    this.mesh = new THREE.Mesh(this.ribbon.geometry, this.ribbonMat.material);
    this.mesh.frustumCulled = false;
    // shadow passes must reconstruct the ribbon with the same GPU sweep
    const dm = createSweepDepthMaterials(this.ribbon.sweep);
    this.depthMat = dm.depth;
    this.distanceMat = dm.distance;
    this.mesh.customDepthMaterial = dm.depth;
    this.mesh.customDistanceMaterial = dm.distance;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(RIBBON_LAYER);
    this.light = new THREE.DirectionalLight(0xffffff, 1.5);
    this.light.castShadow = true;
    this.light.layers.enable(BACKDROP_LAYER);
    this.light.shadow.mapSize.set(s.shadows.mapSize, s.shadows.mapSize);
    this.scene.add(this.mesh, this.light, this.light.target, this.backdrop.group);
    this.env = new EnvironmentBuilder(r);

    // ---- render targets
    const rtOpts = { depthBuffer: true, stencilBuffer: false };
    this.rtRibbon = new THREE.WebGLRenderTarget(1, 1, {
      ...rtOpts,
      count: 2,
      samples: s.post.samples,
      // tone-mapped, premultiplied colour: 8-bit sRGB storage is plenty (and
      // halves the MSAA bandwidth vs HalfFloat); the hardware encodes on write
      // and decodes on read, so the pipeline stays linear.
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.rtRibbon.resolveDepthBuffer = false;
    // attachment 1 = front mask: one 8-bit channel is plenty
    const mt = this.rtRibbon.textures[1];
    mt.format = THREE.RedFormat;
    mt.type = THREE.UnsignedByteType;
    mt.minFilter = THREE.NearestFilter;
    mt.magFilter = THREE.NearestFilter;
    const small = {
      depthBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    };
    this.rtCatchA = new THREE.WebGLRenderTarget(1, 1, small);
    this.rtCatchB = new THREE.WebGLRenderTarget(1, 1, small);
    this.rtCatchA.texture.wrapS = this.rtCatchA.texture.wrapT = THREE.ClampToEdgeWrapping;

    // ---- shadow catcher + blur + bloom passes
    const cm = createCatcherMaterial(this.ribbon.sweep);
    this.catcherU = cm.u;
    this.catcherMesh = new THREE.Mesh(this.ribbon.geometry, cm.material);
    this.catcherMesh.frustumCulled = false;
    this.catcherScene.add(this.catcherMesh);
    const bm = createBlurMaterial();
    this.blur = new FullscreenPass(bm.material);
    this.blurU = bm.u;
    const bs = createBloomSrcMaterial();
    this.bloomSrc = new FullscreenPass(bs.material);
    this.bloomSrcU = bs.u;

    // ---- composites
    const cb = createCompositeMaterial("back", this.shared);
    this.compBack = new FullscreenPass(cb.material);
    this.compBackU = cb.u;
    const cf = createCompositeMaterial(this.weave ? "front" : "single", this.shared);
    this.compFront = new FullscreenPass(cf.material);
    this.compFrontU = cf.u;
    for (const u of [this.compBackU, this.compFrontU]) {
      u.tRibbon.value = this.rtRibbon.textures[0];
      u.tMask.value = this.rtRibbon.textures[1];
      u.tCatch.value = this.rtCatchA.texture;
    }
    this.backdrop.setBackground(this.weave);

    this.sim.snapToTarget();
  }

  // ---- public API -------------------------------------------------------

  setPose(pose: RibbonPose, snap = false): void {
    rlog("sim-pose", { snap, points: pose.points.length, folds: pose.folds?.length ?? 0 });
    this.ribbon.frameMode = pose.orientation ?? "rmf";
    this.ribbon.setFolds(pose.folds);
    this.ribbon.setHairpins(pose.hairpins);
    this.sim.setRuled(pose.ruled);
    this.sim.setTargetPose(pose.points, pose.twists, pose.widths, snap);
  }

  setReducedMotion(reduce: boolean): void {
    this.sim.idleScale01 = reduce ? 0 : 1; // reduced motion: static pose, no idle
  }

  patchSettings(patch: DeepPartial<RibbonSettings>): void {
    rlog("settings-patch", patch);
    assignSettings(
      this.settings as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
    this.applySettings();
  }

  snapshotSettings(): RibbonSettings {
    return cloneSettings(this.settings);
  }

  /** Set the CSS size and pixel ratio (the drawing buffer is floor(css * pr)). */
  setSize(cssW: number, cssH: number, pixelRatio: number): void {
    this.width = Math.max(cssW, 1);
    this.height = Math.max(cssH, 1);
    rlog("core-size", {
      css: [this.width, this.height],
      pixelRatio,
      prev: this.pixelRatio,
      rings: this.settings.geometry.rings,
      samples: this.applied.samples,
    });
    this.pixelRatio = pixelRatio;
    const r = this.renderer;
    r.setPixelRatio(pixelRatio);
    r.setSize(this.width, this.height, false);
    const buf = r.getDrawingBufferSize(new THREE.Vector2());
    this.bufW = buf.x;
    this.bufH = buf.y;
    this.shared.uRibScale.value.set(buf.x / this.width, buf.y / this.height);
    this.shared.uRibViewH.value = this.height;
    this.rtRibbon.setSize(buf.x, buf.y);
    this.resizeCatchers();
    for (const u of [this.compBackU, this.compFrontU]) u.uBuf.value.set(buf.x, buf.y);
    this.updateCamera();
    this.backdrop.apply(
      this.settings.background,
      this.settings.shadows,
      this.width,
      this.height,
      this.settings.material.faceA.color,
    );
    this.forceShadow = true;
    this.catcherDirty = true;
    this.syncSamples();
    this.syncGeometry(false);
  }

  private resizeCatchers(): void {
    const k = Math.min(Math.max(this.settings.contact.resolution, 0.1), 1);
    const w = Math.max(2, Math.ceil(this.bufW * k));
    const h = Math.max(2, Math.ceil(this.bufH * k));
    this.rtCatchA.setSize(w, h);
    this.rtCatchB.setSize(w, h);
    if (this.rtBloomA && this.rtBloomB) {
      const bw = Math.max(2, Math.ceil(this.bufW / 4));
      const bh = Math.max(2, Math.ceil(this.bufH / 4));
      this.rtBloomA.setSize(bw, bh);
      this.rtBloomB.setSize(bw, bh);
    }
  }

  /** Re-apply `settings` after mutating them (diffs expensive subsystems). */
  applySettings(force = false): void {
    rlog("apply-settings", { force });
    const s = this.settings;
    this.forceShadow = true;
    this.catcherDirty = true;
    this.sim.params = { ...s.sim };
    this.camera.fov = s.camera.fov;
    this.updateCamera();
    this.syncGeometry(force);

    // the effective environment colours (tint x temperature, face-coloured bounce) are part of the key
    const eKey = JSON.stringify({
      ...s.env,
      temperature: s.light.temperature,
      faceA: s.env.bounce.followFace ? s.material.faceA.color : "",
      intensity: 0,
      rotationX: 0,
      rotationY: 0,
      autoRotate: 0,
      autoRotateSpeed: 0,
    });
    if (force || eKey !== this.applied.env) {
      this.applied.env = eKey;
      if (force) this.rebuildEnv();
      else this.scheduleEnv();
    }

    this.syncSamples();
    if (s.post.bloom && !this.rtBloomA) {
      const opts = {
        depthBuffer: false,
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      };
      this.rtBloomA = new THREE.WebGLRenderTarget(1, 1, opts);
      this.rtBloomB = new THREE.WebGLRenderTarget(1, 1, opts);
      this.compBackU.tBloom.value = this.rtBloomA.texture;
      this.compFrontU.tBloom.value = this.rtBloomA.texture;
    }
    this.resizeCatchers();

    this.ribbonMat.setToneMapping(s.post.toneMapping);
    applyMaterialSettings(this.ribbonMat.material, s.material, this.shared);
    this.ribbonMat.material.wireframe = s.debug.wireframe;
    this.mesh.receiveShadow = s.shadows.self;
    this.mesh.castShadow = s.shadows.self || s.shadows.floor || s.shadows.wall;
    const L = this.light;
    L.color.set(s.light.color).multiply(temperatureColor(s.light.temperature));
    L.intensity = s.light.intensity * s.post.exposure;
    const sh = L.shadow;
    sh.radius = s.shadows.radius;
    sh.bias = s.shadows.bias;
    sh.normalBias = s.shadows.normalBias;
    if (sh.mapSize.x !== s.shadows.mapSize) {
      rlog("shadow-map-recreate", { size: s.shadows.mapSize });
      sh.mapSize.set(s.shadows.mapSize, s.shadows.mapSize);
      sh.map?.dispose();
      sh.map = null;
    }
    this.scene.environmentIntensity = s.env.intensity * s.post.exposure;

    // composites / catcher
    const view = VIEW_INDEX[s.debug.view] ?? 0;
    for (const u of [this.compBackU, this.compFrontU]) {
      u.uView.value = view;
      u.uDither.value = s.post.dither ? 1 : 0;
      u.uShadowStrength.value = s.contact.strength;
      u.uShadowPad.value = s.contact.pad;
      u.uBloomI.value = s.post.bloom ? s.post.bloomIntensity : 0;
    }
    this.catcherU.uFalloff.value = Math.max(s.contact.falloff, 1);
    this.bloomSrcU.uThreshold.value = s.post.bloomThreshold;
    this.backdrop.apply(s.background, s.shadows, this.width, this.height, s.material.faceA.color);
  }

  /** Run a frame. `emit` is called right after each composite so the adapter can transfer it. */
  frame(
    dt: number,
    now: number,
    proxies: ProxyData,
    emit: (which: OutputKind) => void,
  ): void {
    const s = this.settings;
    const st = this.stats;
    const r = this.renderer;
    ribbonLogFrame(this.frameIndex);
    const ema = (prev: number, v: number) => prev + (v - prev) * 0.08;

    let t = performance.now();
    this.sim.step(dt);
    const t1 = performance.now();
    st.cpu.sim = ema(st.cpu.sim, t1 - t);
    this.ribbon.update(this.sim.outPos, this.sim.outTwist, this.sim.outWidth, this.sim.count, this.sim.ruled);
    const t2 = performance.now();
    st.cpu.geometry = ema(st.cpu.geometry, t2 - t1);
    st.logicMs = t2 - t;

    this.shared.uProxyRects.value = proxies.rects;
    this.shared.uProxyDepth.value = proxies.depth;
    this.shared.uProxyRadius.value = proxies.radius;
    this.shared.uProxyCount.value = proxies.count;
    this.assignGroups(proxies);

    if (s.env.autoRotate) this.envYaw += s.env.autoRotateSpeed * dt;
    this.scene.environmentRotation.set(s.env.rotationX * DEG, (s.env.rotationY + this.envYaw) * DEG, 0);
    this.fitLights();
    this.updateLights();
    this.updateGlow(dt);
    this.backdrop.setTime(now / 1000);
    this.compBackU.uTime.value = now / 1000;

    // shadow map: every N frames. A FROZEN pose renders it once and keeps it (re-render only on an
    // exact change of the geometry, the light frustum or the settings: no threshold, nothing that
    // can toggle). A live ribbon re-renders it every time (threshold 0, the site) or once it moved
    // a fraction of a shadow-map texel (lab).
    const every = Math.max(1, Math.floor(s.shadows.updateEvery));
    const frozen = this.sim.params.mode === "frozen";
    let shadowNow = this.forceShadow;
    if (!shadowNow && this.frameIndex % every === 0) {
      const lc = this.lightCenter;
      const sl = this.shadowLight;
      const thr = s.shadows.moveThreshold;
      const delta = this.ribbon.signatureDelta(this.shadowSig);
      if (sl.x !== lc.x || sl.y !== lc.y || sl.z !== lc.z || sl.w !== this.lightRadius) {
        shadowNow = true;
      } else if (frozen) {
        shadowNow = delta > 0;
      } else if (thr <= 0) {
        shadowNow = true;
      } else {
        const texel = (2 * this.lightRadius) / s.shadows.mapSize;
        shadowNow = delta > thr * texel;
      }
    }
    if (shadowNow) {
      this.shadowRendered = true;
      rlog("shadow-render", { forced: this.forceShadow });
      this.shadowSig = this.ribbon.snapshotSignature(this.shadowSig);
      this.shadowLight.set(this.lightCenter.x, this.lightCenter.y, this.lightCenter.z, this.lightRadius);
    }
    this.forceShadow = false;
    this.frameIndex++;

    const measure = s.debug.hud && s.debug.gpuTimer;
    const frontActive = proxies.count > 0 && this.ribbon.maxZ > proxies.minDepth && this.weave;
    const contactOn = s.contact.enabled && frontActive;
    this.contactWanted = contactOn;
    const bloomOn = s.post.bloom && this.rtBloomA !== null && this.rtBloomB !== null;
    r.info.reset();

    // ---- 1+2: shadow map + ribbon colour/mask (full shading ONCE)
    t = performance.now();
    // the ribbon target only needs clearing / drawing / resolving inside the ribbon's
    // screen rect (composites treat everything outside as empty)
    const dbg = VIEW_INDEX[s.debug.view] ?? 0;
    const rr = dbg === 0 ? this.ribbonScreenRect(bloomOn ? s.post.bloomRadius * 3 : 0) : null;
    const rect = this.ribRectDev;
    const rt = this.rtRibbon;
    if (rr && s.post.scissor && !bloomOn) {
      const kx = this.bufW / this.width;
      const ky = this.bufH / this.height;
      const x0 = Math.max(0, Math.floor(rr[0] * kx) - 1);
      const x1 = Math.min(this.bufW, Math.ceil((rr[0] + rr[2]) * kx) + 1);
      const y0 = Math.max(0, Math.floor((this.height - rr[1] - rr[3]) * ky) - 1);
      const y1 = Math.min(this.bufH, Math.ceil((this.height - rr[1]) * ky) + 1);
      rt.scissor.set(x0, y0, Math.max(x1 - x0, 1), Math.max(y1 - y0, 1));
      rt.scissorTest = true;
      rect.set(x0, y0, x1, y1);
    } else {
      rt.scissorTest = false;
      rect.set(-1e6, -1e6, 1e6, 1e6);
    }
    for (const u of [this.compBackU, this.compFrontU]) u.uRibRect.value.copy(rect);
    this.stageBegin("ribbon", measure);
    r.setRenderTarget(this.rtRibbon);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    this.camera.layers.set(RIBBON_LAYER);
    r.shadowMap.needsUpdate = shadowNow;
    r.render(this.scene, this.camera);
    this.stageEnd("ribbon", measure);

    // ---- 3: shadow catcher (+ blur) and bloom
    if (contactOn) {
      const g = this.catcherGroups;
      if (g.x !== this.groupCount || g.y !== this.groupDepth[0] || g.z !== this.groupDepth[1]) {
        g.set(this.groupCount, this.groupDepth[0], this.groupDepth[1]);
        this.catcherDirty = true;
      }
      const thr = s.contact.moveThreshold;
      // same rule as the shadow map: frozen = once + exact change; live = every frame (0) or by threshold
      const cdelta = this.ribbon.signatureDelta(this.catcherSig);
      if (
        this.catcherDirty ||
        !this.catcherValid ||
        (frozen ? cdelta > 0 : thr <= 0 || cdelta > thr)
      ) {
        this.catcherDirty = false;
        this.catcherValid = true;
        this.catcherRendered = true;
        this.catcherSig = this.ribbon.snapshotSignature(this.catcherSig);
        rlog("catcher-render");
        this.stageBegin("catcher", measure);
        this.renderCatcher();
        this.stageEnd("catcher", measure);
      }
    } else {
      this.catcherValid = false;
    }
    if (bloomOn) {
      this.stageBegin("bloom", measure);
      this.renderBloom();
      this.stageEnd("bloom", measure);
    }
    const t3 = performance.now();
    st.cpu.scene = ema(st.cpu.scene, t3 - t);

    // ---- 4: back composite
    this.compFrontU.uShadowOn.value = contactOn ? 1 : 0;
    this.compBackU.tCatch.value = this.rtCatchA.texture;
    this.compFrontU.tCatch.value = this.rtCatchA.texture;
    r.setRenderTarget(null);
    if (this.weave) {
      this.camera.layers.set(BACKDROP_LAYER);
      r.shadowMap.needsUpdate = false;
      this.stageBegin("backdrop", measure);
      r.render(this.scene, this.camera); // bg quad + floor / wall shadow receivers
      this.stageEnd("backdrop", measure);
      // ribbon * back weight, premultiplied over the backdrop; only where the
      // ribbon can be (screen-space AABB of its bounds)
      if (rr) {
        r.setScissorTest(true);
        r.setScissor(rr[0], this.height - rr[1] - rr[3], rr[2], rr[3]);
      }
      this.stageBegin("compBack", measure);
      this.compBack.render(r);
      this.stageEnd("compBack", measure);
      if (rr) r.setScissorTest(false);
      emit("back");
    } else {
      r.clear(true, false, false);
      this.camera.layers.set(BACKDROP_LAYER);
      r.shadowMap.needsUpdate = false;
      r.render(this.scene, this.camera); // floor shadow only (transparent canvas)
    }

    // ---- 5: front composite (only inside the proxy rects: the canvas is
    // transparent after the transfer, so everything else stays empty for free)
    if (this.weave) {
      if (frontActive && dbg === 0) {
        this.stageBegin("compFront", measure);
        r.setScissorTest(true);
        const margin = 2 + (bloomOn ? s.post.bloomRadius * 3 : 0);
        for (let i = 0; i < proxies.count; i++) {
          const x0 = Math.max(0, Math.floor(proxies.rects[i * 4] - margin));
          const y0 = Math.max(0, Math.floor(proxies.rects[i * 4 + 1] - margin));
          const x1 = Math.min(this.width, Math.ceil(proxies.rects[i * 4] + proxies.rects[i * 4 + 2] + margin));
          const y1 = Math.min(this.height, Math.ceil(proxies.rects[i * 4 + 1] + proxies.rects[i * 4 + 3] + margin));
          if (x1 <= x0 || y1 <= y0) continue;
          r.setScissor(x0, this.height - y1, x1 - x0, y1 - y0);
          this.compFront.render(r);
        }
        r.setScissorTest(false);
        this.stageEnd("compFront", measure);
        emit("front");
      } else if (this.frontWasActive || dbg !== 0) {
        r.clear(true, false, false);
        emit("front");
      }
      this.frontWasActive = frontActive && dbg === 0;
    } else {
      this.compFront.render(r); // single canvas: ribbon over the floor shadow, above the HTML
    }
    if (measure) {
      let scene = 0;
      let post = 0;
      for (const [k, tm] of Object.entries(this.stageTimers)) {
        tm.poll();
        st.gpu.stages[k] = tm.ms;
        if (k === "ribbon" || k === "catcher" || k === "bloom") scene += tm.ms;
        else post += tm.ms;
      }
      st.gpu.scene = scene;
      st.gpu.post = post;
    }
    const t4 = performance.now();
    st.cpu.post = ema(st.cpu.post, t4 - t3);

    const info = r.info.render;
    st.drawCalls = info.calls;
    st.triangles = info.triangles;
    st.rings = this.ribbon.totalRings;
    st.vertices = this.ribbon.totalRings * this.ribbon.profileCount;
    st.frontActive = frontActive;
  }

  private stageBegin(name: string, on: boolean): void {
    if (!on) return;
    (this.stageTimers[name] ??= new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext)).begin();
  }

  private stageEnd(name: string, on: boolean): void {
    if (on) this.stageTimers[name]?.end();
  }

  /** CPU+GL sync benchmark helper: finish all queued GL work. */
  finish(): void {
    (this.renderer.getContext() as WebGL2RenderingContext).finish();
  }

  transfer(): ImageBitmap | null {
    const c = this.canvas as OffscreenCanvas;
    return typeof c.transferToImageBitmap === "function" ? c.transferToImageBitmap() : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.envTimer) clearTimeout(this.envTimer);
    this.scene.remove(this.mesh);
    for (const t of Object.values(this.stageTimers)) t.dispose();
    this.env.dispose();
    this.ribbonMat.material.dispose();
    this.depthMat.dispose();
    this.distanceMat.dispose();
    this.ribbon.sweep.uRingTex.value.dispose();
    this.light.shadow.map?.dispose();
    for (const rt of [this.rtRibbon, this.rtCatchA, this.rtCatchB, this.rtBloomA, this.rtBloomB]) {
      rt?.dispose();
    }
    for (const p of [this.blur, this.bloomSrc, this.compBack, this.compFront]) p.material.dispose();
    (this.catcherMesh.material as THREE.Material).dispose();
    this.ribbon.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ---- internals --------------------------------------------------------

  private effectiveGeometry(): RibbonSettings["geometry"] {
    const g = this.settings.geometry;
    const k = Math.min(Math.max(this.width / 1440, 0.5), 1.4);
    return { ...g, width: g.width * k, edgeBevel: g.edgeBevel * k };
  }

  private syncGeometry(force: boolean): void {
    const eff = this.effectiveGeometry();
    const key = JSON.stringify(eff);
    if (!force && key === this.applied.geometry) return;
    this.applied.geometry = key;
    if (this.ribbon.setParams(eff)) {
      this.mesh.geometry = this.ribbon.geometry;
      this.catcherMesh.geometry = this.ribbon.geometry;
    }
  }

  /**
   * Everything a first visible frame needs has been rendered at least once: the shadow map, the
   * contact catcher (when this layout uses it) and the environment. The adapter reveals the live
   * canvases only then.
   */
  get ready(): boolean {
    return this.shadowRendered && this.scene.environment !== null && (!this.contactWanted || this.catcherRendered);
  }

  /** MSAA samples currently in use on the ribbon target */
  get effectiveSamples(): number {
    return this.applied.samples;
  }

  /** effective MSAA: retina density (pixel ratio >= 1.75) may use fewer samples */
  private syncSamples(): void {
    const p = this.settings.post;
    const n = this.pixelRatio >= 1.75 && p.samplesRetina >= 0 ? p.samplesRetina : p.samples;
    if (this.applied.samples === n) return;
    rlog("msaa-recreate", { samples: n, prev: this.applied.samples, pixelRatio: this.pixelRatio });
    this.applied.samples = n;
    this.rtRibbon.samples = n;
    this.rtRibbon.dispose();
  }

  private scheduleEnv(): void {
    if (this.envTimer) clearTimeout(this.envTimer);
    this.envTimer = setTimeout(() => this.rebuildEnv(), 140);
  }

  private rebuildEnv(): void {
    if (this.disposed) return;
    rlog("env-pmrem");
    this.scene.environment = this.env.build(this.settings);
  }

  private updateCamera(): void {
    const cam = this.camera;
    cam.fov = this.settings.camera.fov;
    cam.aspect = this.width / this.height;
    const dist = this.height / 2 / Math.tan((cam.fov * DEG) / 2);
    cam.position.set(0, 0, dist);
    cam.near = Math.max(10, dist * 0.05);
    cam.far = dist + 8000;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Group proxies by depth (max 2 groups) for the shadow catcher channels. */
  private assignGroups(p: ProxyData): void {
    const ds: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const d = p.depth[i];
      if (!ds.some((x) => Math.abs(x - d) < 0.5)) ds.push(d);
    }
    ds.sort((a, b) => b - a);
    this.groupCount = Math.max(1, Math.min(ds.length, 2));
    this.groupDepth[0] = ds[0] ?? 0;
    this.groupDepth[1] = ds.length > 1 ? ds[1] : this.groupDepth[0];
    const grp = this.compFrontU.uProxyGroup.value;
    for (let i = 0; i < MAX_PROXIES; i++) {
      if (i >= p.count) {
        grp[i] = 0;
        continue;
      }
      const d0 = Math.abs(p.depth[i] - this.groupDepth[0]);
      const d1 = Math.abs(p.depth[i] - this.groupDepth[1]);
      grp[i] = this.groupCount > 1 && d1 < d0 ? 1 : 0;
    }
  }

  /**
   * Shadow catcher: render the ribbon (no depth test, MAX blend) into a low-res
   * target keeping only fragments above a proxy plane, with
   * occlusion = exp(-height / falloff). The vertex shader shifts each vertex in
   * screen space along the light direction proportionally to its height. Two
   * channels per depth group (contact / high) are blurred with different radii
   * and unioned in the composite.
   */
  private renderCatcher(): void {
    const s = this.settings;
    const r = this.renderer;
    const L = dirFromAngles(s.light.azimuth, s.light.elevation, this.tmpV);
    const lz = Math.max(L.z, 0.25);
    // css px of shadow shift per px of height (x right, y down)
    this.catcherU.uOff.value.set((-L.x / lz) * s.contact.offset, (L.y / lz) * s.contact.offset);
    this.catcherU.uView.value.set(this.width, this.height);

    r.setRenderTarget(this.rtCatchA);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    this.camera.layers.set(RIBBON_LAYER);
    for (let g = 0; g < this.groupCount; g++) {
      this.catcherU.uRef.value = this.groupDepth[g];
      this.catcherU.uGroup.value = g;
      r.render(this.catcherScene, this.camera);
    }

    const w = this.rtCatchA.width;
    const h = this.rtCatchA.height;
    const kx = w / this.width; // texels per css px
    this.blurU.uSigma.value.set(
      Math.max(s.contact.blurContact * kx, 0.5),
      Math.max(s.contact.blurHigh * kx, 0.5),
    );
    this.blurU.tSrc.value = this.rtCatchA.texture;
    this.blurU.uDir.value.set(1 / w, 0);
    r.setRenderTarget(this.rtCatchB);
    this.blur.render(r);
    this.blurU.tSrc.value = this.rtCatchB.texture;
    this.blurU.uDir.value.set(0, 1 / h);
    r.setRenderTarget(this.rtCatchA);
    this.blur.render(r);
  }

  private renderBloom(): void {
    const a = this.rtBloomA;
    const b = this.rtBloomB;
    if (!a || !b) return;
    const r = this.renderer;
    this.bloomSrcU.tRibbon.value = this.rtRibbon.textures[0];
    this.bloomSrcU.tMask.value = this.rtRibbon.textures[1];
    this.bloomSrcU.uDst.value.set(a.width, a.height);
    r.setRenderTarget(a);
    this.bloomSrc.render(r);
    const sg = Math.max(this.settings.post.bloomRadius * (a.width / this.width), 0.5);
    this.blurU.uSigma.value.set(sg, sg);
    this.blurU.tSrc.value = a.texture;
    this.blurU.uDir.value.set(1 / a.width, 0);
    r.setRenderTarget(b);
    this.blur.render(r);
    this.blurU.tSrc.value = b.texture;
    this.blurU.uDir.value.set(0, 1 / a.height);
    r.setRenderTarget(a);
    this.blur.render(r);
  }

  /**
   * Screen-space AABB (CSS px, y down) of the ribbon's world bounds plus a
   * margin, or null when it cannot be bounded (a corner behind the camera).
   */
  private ribbonScreenRect(extra: number): [number, number, number, number] | null {
    const b = this.ribbon.bounds;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const v = this.tmpV;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      // clip.w = distance along the view axis; bail out when any corner is behind the near plane
      const cw = this.camera.position.z - v.z;
      if (cw < this.camera.near) return null;
      v.project(this.camera);
      const px = ((v.x + 1) / 2) * this.width;
      const py = ((1 - v.y) / 2) * this.height;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    const m = 6 + extra;
    x0 = Math.max(0, Math.floor(x0 - m));
    y0 = Math.max(0, Math.floor(y0 - m));
    x1 = Math.min(this.width, Math.ceil(x1 + m));
    y1 = Math.min(this.height, Math.ceil(y1 + m));
    if (x1 <= x0 || y1 <= y0) return [0, 0, 1, 1];
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /** Fit the shadow frustum to a quantised bounding sphere of the ribbon. */
  private fitLights(): void {
    const b = this.ribbon.bounds;
    const q = 32;
    const cx = Math.round((b.min.x + b.max.x) / 2 / q) * q;
    const cy = Math.round((b.min.y + b.max.y) / 2 / q) * q;
    const cz = Math.round((b.min.z + b.max.z) / 2 / q) * q;
    const raw =
      0.5 * Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * 1.04 + 80;
    this.lightCenter.set(cx, cy, cz);
    this.lightRadius = Math.ceil(raw / 64) * 64;
  }

  private updateLights(): void {
    const s = this.settings;
    const dir = dirFromAngles(s.light.azimuth, s.light.elevation, this.tmpV);
    const L = this.light;
    L.position.copy(this.lightCenter).addScaledVector(dir, this.lightRadius + 600);
    L.target.position.copy(this.lightCenter);
    L.target.updateMatrixWorld();
    const cam = L.shadow.camera;
    const rad = this.lightRadius;
    if (cam.right !== rad || cam.far !== this.lightRadius * 2 + 1400) {
      cam.left = -rad;
      cam.right = rad;
      cam.top = rad;
      cam.bottom = -rad;
      cam.near = 1;
      cam.far = rad * 2 + 1400;
      cam.updateProjectionMatrix();
    }
  }

  private updateGlow(dt: number): void {
    const b = this.ribbon.bounds;
    const pos = this.sim.outPos;
    const n = this.sim.count;
    const hw = this.width / 2;
    const hh = this.height / 2;
    let bx = (b.min.x + b.max.x) / 2;
    let by = b.min.y;
    let found = false;
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      if (Math.abs(x) < hw * 0.92 && y > -hh * 0.88 && y < minY) {
        minY = y;
        bx = x;
        by = y;
        found = true;
      }
    }
    if (!found) by = -hh * 0.8;
    by -= this.settings.shadows.glowDrop;
    const ux = (bx + hw) / this.width;
    const uy = (by + hh) / this.height;
    // a frozen pose has a constant target (and the very first frame has no history): snap, don't glide
    const k = this.glowInit && this.sim.params.mode !== "frozen" ? 1 - Math.exp(-dt * 3) : 1;
    this.glowInit = true;
    this.glowX += (Math.min(Math.max(ux, 0.05), 0.95) - this.glowX) * k;
    this.glowY += (Math.min(Math.max(uy, 0.02), 0.9) - this.glowY) * k;
    this.backdrop.setGlowPosition(this.glowX, this.glowY);
  }
}
