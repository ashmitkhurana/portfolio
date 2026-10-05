/**
 * RibbonEngine: owns the two renderers (back/front canvases), scenes, the
 * shared camera, the ribbon sim + geometry, proxies, settings and the rAF
 * loop. See README.md for the layering/partition rule.
 */
import * as THREE from "three";
import { Backdrop } from "./backdrop";
import { ContactShadows } from "./contact";
import { EnvironmentBuilder } from "./environment";
import { GpuTimer } from "./gpuTimer";
import { RibbonGeometry } from "./geometry";
import {
  applyMaterialSettings,
  createRibbonMaterial,
  createSharedUniforms,
  type RibbonSharedUniforms,
} from "./material";
import { PostPipeline } from "./post";
import { ProxyRegistry } from "./proxies";
import {
  assignSettings,
  cloneSettings,
  mergeSettings,
  type DeepPartial,
  type RibbonSettings,
  type ToneMapName,
} from "./settings";
import { RibbonSim } from "./sim";

export interface RibbonPose {
  /** xyz triples, world px (1 unit = 1 css px at z = 0, +y up) */
  points: ArrayLike<number>;
  twists?: ArrayLike<number>;
  widths?: ArrayLike<number>;
}

export interface RibbonStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  rings: number;
  vertices: number;
  frontActive: boolean;
  /** CPU submit time per stage, ms (EMA) */
  cpu: { sim: number; geometry: number; back: number; front: number };
  /** GPU time per layer, ms (EMA; 0 when the timer extension is unavailable) */
  gpu: { back: number; front: number };
  composer: boolean;
}

export interface RibbonEngineOptions {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  settings?: DeepPartial<RibbonSettings>;
  /** control points in the sim */
  controlPoints?: number;
}

interface Layer {
  kind: "back" | "front";
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  light: THREE.DirectionalLight;
  material: THREE.MeshPhysicalMaterial;
  mesh: THREE.Mesh;
  env: EnvironmentBuilder;
  envTexture: THREE.Texture | null;
  post: PostPipeline | null;
  timer: GpuTimer;
}

const DEG = Math.PI / 180;

const TONE_MAP: Record<ToneMapName, THREE.ToneMapping> = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
};

function dirFromAngles(azDeg: number, elDeg: number, out: THREE.Vector3) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return out.set(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
}

export class RibbonEngine {
  /** number of live (constructed, not disposed) engines; should be 1 */
  static live = 0;
  readonly settings: RibbonSettings;
  readonly camera = new THREE.PerspectiveCamera(28, 1, 10, 12000);
  readonly sim: RibbonSim;
  readonly ribbon: RibbonGeometry;
  readonly proxies: ProxyRegistry;
  readonly stats: RibbonStats = {
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    rings: 0,
    vertices: 0,
    frontActive: false,
    cpu: { sim: 0, geometry: 0, back: 0, front: 0 },
    gpu: { back: 0, front: 0 },
    composer: false,
  };

  /** CSS px size of the viewport */
  width = 1;
  height = 1;
  pixelRatio = 1;
  /** current (possibly adaptively reduced) pixel ratio ceiling */
  private prCeil = Infinity;
  private slowFrames = 0;
  private adaptFrames = 0;
  private refDt = 16.7;
  private okSeconds = 0;

  private layers: [Layer, Layer];
  private back: Layer;
  private front: Layer;
  private shared: RibbonSharedUniforms;
  private backdrop: Backdrop;
  private contact: ContactShadows;
  private raf = 0;
  private running = false;
  private lastT = 0;
  private emaMs = 16.7;
  private disposed = false;
  private envTimer = 0;
  private ro: ResizeObserver;
  private mqReduce: MediaQueryList | null = null;
  private applied = { geometry: "", env: "", post: "", shadowSize: 0 };
  private tmpV = new THREE.Vector3();
  private lightCenter = new THREE.Vector3();
  private lightRadius = 0;
  private frontWasActive = false;
  private forceShadow = true;
  private frameIndex = 0;
  private glowX = 0.6;
  private glowY = 0.2;
  private envYaw = 0;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };
  private readonly onReduce = () => this.applyReducedMotion();

  constructor(opts: RibbonEngineOptions) {
    RibbonEngine.live++;
    this.settings = mergeSettings(opts.settings);
    const s = this.settings;

    this.sim = new RibbonSim(opts.controlPoints ?? 64);
    this.ribbon = new RibbonGeometry(s.geometry, 128);
    this.proxies = new ProxyRegistry();
    this.shared = createSharedUniforms(
      this.proxies.rects,
      this.proxies.depth,
      this.proxies.radius,
    );
    this.backdrop = new Backdrop();
    this.contact = new ContactShadows();

    this.back = this.createLayer("back", opts.back);
    this.front = this.createLayer("front", opts.front);
    this.layers = [this.back, this.front];
    this.back.scene.add(this.backdrop.group);
    this.front.scene.add(this.contact.group);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.back);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.mqReduce.addEventListener("change", this.onReduce);
    this.applyReducedMotion();

    this.resize();
    this.applySettings(true);
    // initial flat pose so the first frame is valid
    this.sim.snapToTarget();
    this.start();
  }

  // ---- public API -------------------------------------------------------

  /** Convert a viewport CSS-px position (y down) to world coords at z = 0. */
  domToWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x - this.width / 2, this.height / 2 - y, 0);
  }

  setPose(pose: RibbonPose, snap = false): void {
    this.sim.setTargetPose(pose.points, pose.twists, pose.widths, snap);
  }

  /** Re-apply `settings` after mutating them (diffs expensive subsystems). */
  applySettings(force = false): void {
    const s = this.settings;
    this.sim.params = { ...s.sim };
    this.camera.fov = s.camera.fov;
    this.updateCamera();

    this.syncGeometry(force);

    // environment (debounced regen)
    const eKey = JSON.stringify({
      ...s.env,
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

    // post
    const pKey = JSON.stringify(s.post);
    if (force || pKey !== this.applied.post) {
      this.applied.post = pKey;
      this.prCeil = Infinity;
      if (this.targetPixelRatio() !== this.pixelRatio) this.resize();
      for (const l of this.layers) l.post?.configure(s.post);
      this.forceShadow = true;
    }

    // materials
    for (const l of this.layers) {
      applyMaterialSettings(l.material, s.material, this.shared);
      l.material.wireframe = s.debug.wireframe;
      l.mesh.receiveShadow = s.shadows.self;
      l.mesh.castShadow =
        s.shadows.self || s.shadows.floor || s.shadows.wall || s.shadows.contact;
      l.light.color.set(s.light.color);
      l.light.intensity = s.light.intensity * s.post.exposure;
      const sh = l.light.shadow;
      sh.radius = s.shadows.radius;
      sh.bias = s.shadows.bias;
      sh.normalBias = s.shadows.normalBias;
      if (sh.mapSize.x !== s.shadows.mapSize) {
        sh.mapSize.set(s.shadows.mapSize, s.shadows.mapSize);
        sh.map?.dispose();
        sh.map = null;
      }
      l.scene.environmentIntensity = s.env.intensity * s.post.exposure;
    }

    this.shared.uRibDebug.value = s.debug.partition ? 1 : 0;
    document.documentElement.toggleAttribute(
      "data-ribbon-debug",
      s.debug.proxyOutlines || s.debug.partition,
    );
    this.backdrop.apply(s.background, s.shadows, this.width, this.height);
  }

  private effectiveGeometry(): RibbonSettings["geometry"] {
    const g = this.settings.geometry;
    const k = Math.min(Math.max(this.width / 1440, 0.5), 1.4);
    return { ...g, width: g.width * k };
  }

  /** push geometry settings (width scaled by viewport) into the ribbon */
  private syncGeometry(force: boolean): void {
    const eff = this.effectiveGeometry();
    const key = JSON.stringify(eff);
    if (!force && key === this.applied.geometry) return;
    this.applied.geometry = key;
    if (this.ribbon.setParams(eff)) {
      for (const l of this.layers) l.mesh.geometry = this.ribbon.geometry;
    }
  }

  patchSettings(patch: DeepPartial<RibbonSettings>): void {
    assignSettings(
      this.settings as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
    this.applySettings();
  }

  snapshotSettings(): RibbonSettings {
    return cloneSettings(this.settings);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /**
   * Diagnostic: run `frames` synchronous frames with a GL finish after each and
   * return the mean wall time per frame in ms (independent of rAF/visibility).
   */
  benchmark(frames = 60): { msPerFrame: number; cpuMs: number } {
    const wasRunning = this.running;
    this.stop();
    const gls = this.layers.map((l) => l.renderer.getContext());
    let cpu = 0;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const c0 = performance.now();
      this.frame(1 / 60, c0);
      cpu += performance.now() - c0;
      for (const gl of gls) gl.finish();
    }
    const total = performance.now() - t0;
    if (wasRunning) this.start();
    return { msPerFrame: total / frames, cpuMs: cpu / frames };
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    RibbonEngine.live--;
    this.stop();
    clearTimeout(this.envTimer);
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.mqReduce?.removeEventListener("change", this.onReduce);
    document.documentElement.removeAttribute("data-ribbon-debug");
    this.proxies.dispose();
    for (const l of this.layers) {
      l.scene.remove(l.mesh);
      l.post?.dispose();
      l.timer.dispose();
      l.env.dispose();
      l.material.dispose();
      l.light.shadow.map?.dispose();
      l.renderer.dispose();
      l.renderer.forceContextLoss();
    }
    this.ribbon.dispose();
    this.backdrop.dispose();
    this.contact.dispose();
  }

  // ---- internals --------------------------------------------------------

  private createLayer(kind: "back" | "front", canvas: HTMLCanvasElement): Layer {
    const isFront = kind === "front";
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true, // native MSAA on the default framebuffer
      alpha: isFront,
      premultipliedAlpha: true,
      stencil: isFront, // front pass marks behind-ribbon pixels for contact shadows
      depth: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // we schedule updates (see frame())
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setClearColor(0x0d0c0b, isFront ? 0 : 1);

    const scene = new THREE.Scene();
    const material = createRibbonMaterial(kind, this.shared);
    const mesh = new THREE.Mesh(this.ribbon.geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.castShadow = true;
    light.shadow.mapSize.set(this.settings.shadows.mapSize, this.settings.shadows.mapSize);
    scene.add(light, light.target);

    const env = new EnvironmentBuilder(renderer);
    return {
      kind,
      canvas,
      renderer,
      scene,
      light,
      material,
      mesh,
      env,
      envTexture: null,
      post: null,
      timer: new GpuTimer(renderer.getContext() as WebGL2RenderingContext),
    };
  }

  private scheduleEnv(): void {
    clearTimeout(this.envTimer);
    this.envTimer = window.setTimeout(() => this.rebuildEnv(), 140);
  }

  private rebuildEnv(): void {
    if (this.disposed) return;
    for (const l of this.layers) {
      l.envTexture = l.env.build(this.settings.env);
      l.scene.environment = l.envTexture;
    }
  }

  private applyReducedMotion(): void {
    const reduce = this.mqReduce?.matches ?? false;
    this.sim.idleScale01 = reduce ? 0.04 : 1;
  }

  private resize(): void {
    const w = Math.max(this.back.canvas.clientWidth, 1);
    const h = Math.max(this.back.canvas.clientHeight, 1);
    const pr = this.targetPixelRatio();
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    for (const l of this.layers) {
      l.renderer.setPixelRatio(pr);
      l.renderer.setSize(w, h, false);
      l.post?.setSize(w, h);
    }
    const buf = this.back.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.shared.uRibScale.value.set(buf.x / w, buf.y / h);
    this.shared.uRibViewH.value = h;
    this.updateCamera();
    this.backdrop.apply(this.settings.background, this.settings.shadows, w, h);
    this.proxies.invalidate();
    this.forceShadow = true;
    // the ring width scales with the viewport
    this.syncGeometry(false);
  }

  private targetPixelRatio(): number {
    return Math.max(
      1,
      Math.min(
        window.devicePixelRatio || 1,
        this.settings.post.pixelRatioCap,
        this.prCeil,
      ),
    );
  }

  /**
   * Adaptive resolution: if frames stay clearly longer than the best interval
   * the display has delivered, step the pixel ratio down by 0.25 (floor 1). After ~20 s of smooth frames it probes one step back up.
   */
  private adapt(dtMs: number): void {
    if (!this.settings.post.adaptive) return;
    this.adaptFrames++;
    if (this.adaptFrames < 90) return; // ignore shader-compile / warm-up hitches
    // refDt tracks the best frame interval seen (8.3 ms on a 120 Hz panel, 16.7
    // on 60 Hz), slowly relaxing so a display change is picked up.
    this.refDt = Math.min(this.refDt * 1.0004, this.emaMs);
    const slow = this.emaMs > Math.max(this.refDt * 1.6, 10);
    if (slow) {
      this.slowFrames++;
      this.okSeconds = 0;
    } else {
      this.slowFrames = 0;
      this.okSeconds += dtMs / 1000;
    }
    const cur = this.pixelRatio;
    if (this.slowFrames > 40 && cur > 1) {
      this.prCeil = Math.max(1, cur - 0.25);
      this.slowFrames = 0;
      this.resize();
    } else if (this.okSeconds > 20 && this.prCeil !== Infinity) {
      const up = cur + 0.25;
      if (up <= Math.min(window.devicePixelRatio || 1, this.settings.post.pixelRatioCap)) {
        this.prCeil = up;
        this.okSeconds = 0;
        this.resize();
      }
    }
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

  /** Fit the shadow frustum to a quantised bounding sphere of the ribbon. */
  private fitLights(): void {
    const b = this.ribbon.bounds;
    const q = 32;
    const cx = Math.round((b.min.x + b.max.x) / 2 / q) * q;
    const cy = Math.round((b.min.y + b.max.y) / 2 / q) * q;
    const cz = Math.round((b.min.z + b.max.z) / 2 / q) * q;
    const raw =
      0.5 *
        Math.hypot(
          b.max.x - b.min.x,
          b.max.y - b.min.y,
          b.max.z - b.min.z,
        ) *
        1.04 +
      80;
    this.lightCenter.set(cx, cy, cz);
    this.lightRadius = Math.ceil(raw / 64) * 64;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const dtMs = Math.min(now - this.lastT, 100);
    this.lastT = now;
    const dt = dtMs / 1000;
    const t0 = performance.now();
    this.frame(dt, now);
    this.adapt(dtMs);
    const cpu = performance.now() - t0;
    this.emaMs += (dtMs - this.emaMs) * 0.08;
    this.stats.fps = 1000 / Math.max(this.emaMs, 0.001);
    this.stats.frameMs = cpu;
  };

  private frame(dt: number, now: number): void {
    const s = this.settings;
    const sim = this.sim;
    const st = this.stats;
    const ema = (prev: number, v: number) => prev + (v - prev) * 0.08;

    let t = performance.now();
    sim.step(dt);
    const t1 = performance.now();
    st.cpu.sim = ema(st.cpu.sim, t1 - t);
    this.ribbon.update(sim.outPos, sim.outTwist, sim.outWidth, sim.count);
    const t2 = performance.now();
    st.cpu.geometry = ema(st.cpu.geometry, t2 - t1);
    this.proxies.update();

    // uniforms shared by both passes
    this.shared.uProxyCount.value = this.proxies.count;

    // environment rotation (slow glide)
    if (s.env.autoRotate) this.envYaw += s.env.autoRotateSpeed * dt;
    const yaw = (s.env.rotationY + this.envYaw) * DEG;
    const pitch = s.env.rotationX * DEG;
    for (const l of this.layers) l.scene.environmentRotation.set(pitch, yaw, 0);

    this.fitLights();
    this.updateLights();
    this.updateGlow(dt);
    this.backdrop.setTime(now / 1000);

    this.contact.update(
      this.proxies.rects,
      this.proxies.depth,
      this.proxies.radius,
      this.proxies.count,
      s.shadows.contact,
      s.shadows.contactOpacity,
      s.shadows.contactPad,
      this.width,
      this.height,
    );

    // shadow maps are scheduled: every N frames (or when forced)
    const every = Math.max(1, Math.floor(s.shadows.updateEvery));
    const shadowNow = this.forceShadow || this.frameIndex % every === 0;
    this.forceShadow = false;
    this.frameIndex++;

    const useComposer = s.post.composer;
    st.composer = useComposer;
    const measure = s.debug.hud && s.debug.gpuTimer;

    this.back.renderer.info.reset();
    this.front.renderer.info.reset();

    t = performance.now();
    if (measure) this.back.timer.begin();
    this.renderLayer(this.back, dt, useComposer, shadowNow, null);
    if (measure) this.back.timer.end();
    const t3 = performance.now();
    st.cpu.back = ema(st.cpu.back, t3 - t);

    const frontActive =
      this.proxies.count > 0 && this.ribbon.maxZ > this.proxies.minDepth;
    if (frontActive) {
      if (measure) this.front.timer.begin();
      this.renderLayer(this.front, dt, useComposer, shadowNow, this.frontScissors());
      if (measure) this.front.timer.end();
    } else if (this.frontWasActive) {
      const r = this.front.renderer;
      r.setRenderTarget(null);
      r.setScissorTest(false);
      r.clear(true, true, true);
    }
    this.frontWasActive = frontActive;
    st.cpu.front = ema(st.cpu.front, performance.now() - t3);

    if (measure) {
      this.back.timer.poll();
      this.front.timer.poll();
      st.gpu.back = this.back.timer.ms;
      st.gpu.front = this.front.timer.ms;
    }

    const bi = this.back.renderer.info.render;
    const fi = this.front.renderer.info.render;
    st.drawCalls = bi.calls + (frontActive ? fi.calls : 0);
    st.triangles = bi.triangles + (frontActive ? fi.triangles : 0);
    st.rings = this.ribbon.totalRings;
    st.vertices = this.ribbon.totalRings * this.ribbon.profileCount;
    st.frontActive = frontActive;
  }

  /**
   * One scissor rect per proxy (CSS px, x/y from the bottom-left). The front
   * layer is rendered once per rect so its fill cost is the sum of the proxy
   * areas rather than the whole viewport.
   */
  private frontScissors(): Array<[number, number, number, number]> {
    const out: Array<[number, number, number, number]> = [];
    for (let i = 0; i < this.proxies.count; i++) {
      const r = this.proxies.rects[i];
      const x0 = Math.max(0, Math.floor(r.x) - 1);
      const y0 = Math.max(0, Math.floor(r.y) - 1);
      const x1 = Math.min(this.width, Math.ceil(r.x + r.z) + 1);
      const y1 = Math.min(this.height, Math.ceil(r.y + r.w) + 1);
      if (x1 > x0 && y1 > y0) out.push([x0, this.height - y1, x1 - x0, y1 - y0]);
    }
    return out;
  }

  private renderLayer(
    l: Layer,
    dt: number,
    useComposer: boolean,
    shadowNow: boolean,
    scissors: Array<[number, number, number, number]> | null,
  ): void {
    const r = l.renderer;
    const s = this.settings;
    r.shadowMap.needsUpdate = shadowNow;
    this.backdrop.setLinearOutput(useComposer);
    if (useComposer) {
      if (!l.post) {
        l.post = new PostPipeline(r, l.scene, this.camera, l.kind, s.post);
        l.post.setSize(this.width, this.height);
      }
      r.toneMapping = THREE.NoToneMapping;
      l.post.render(dt);
      return;
    }
    r.toneMapping = TONE_MAP[s.post.toneMapping];
    r.toneMappingExposure = 1;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.clear(true, true, true);
    if (scissors && scissors.length && !s.debug.partition) {
      r.setScissorTest(true);
      for (let i = 0; i < scissors.length; i++) {
        const q = scissors[i];
        r.setScissor(q[0], q[1], q[2], q[3]);
        r.shadowMap.needsUpdate = shadowNow && i === 0;
        r.render(l.scene, this.camera);
      }
      r.setScissorTest(false);
    } else {
      r.render(l.scene, this.camera);
    }
  }

  private updateLights(): void {
    const s = this.settings;
    const dir = dirFromAngles(s.light.azimuth, s.light.elevation, this.tmpV);
    for (const l of this.layers) {
      const L = l.light;
      L.position.copy(this.lightCenter).addScaledVector(dir, this.lightRadius + 600);
      L.target.position.copy(this.lightCenter);
      L.target.updateMatrixWorld();
      const cam = L.shadow.camera;
      const r = this.lightRadius;
      if (cam.right !== r || cam.far !== this.lightRadius * 2 + 1400) {
        cam.left = -r;
        cam.right = r;
        cam.top = r;
        cam.bottom = -r;
        cam.near = 1;
        cam.far = r * 2 + 1400;
        cam.updateProjectionMatrix();
      }
    }
  }

  private updateGlow(dt: number): void {
    const b = this.ribbon.bounds;
    const pos = this.sim.outPos;
    const n = this.sim.count;
    const hw = this.width / 2;
    const hh = this.height / 2;
    // lowest control point that is actually on screen -> tight bounce under it
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
    const k = 1 - Math.exp(-dt * 3);
    this.glowX += (Math.min(Math.max(ux, 0.05), 0.95) - this.glowX) * k;
    this.glowY += (Math.min(Math.max(uy, 0.02), 0.9) - this.glowY) * k;
    this.backdrop.setGlowPosition(this.glowX, this.glowY);
  }
}
