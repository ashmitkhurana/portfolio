/**
 * Post pipeline (identical on both canvases) built on pmndrs `postprocessing`:
 *   RenderPass (MSAA, HalfFloat) -> [Bloom] -> ToneMapping -> [dither] -> screen.
 * Renderer-level tone mapping is OFF; ToneMappingEffect does it (the composer
 * renders to linear HDR targets). Film grain lives in CSS, not here.
 */
import * as THREE from "three";
import {
  BloomEffect,
  BlendFunction,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import type { RibbonSettings, ToneMapName } from "./settings";

const TONE_MODES: Record<ToneMapName, ToneMappingMode> = {
  AgX: ToneMappingMode.AGX,
  ACES: ToneMappingMode.ACES_FILMIC,
  Neutral: ToneMappingMode.NEUTRAL,
  Linear: ToneMappingMode.LINEAR,
  Reinhard: ToneMappingMode.REINHARD2,
  Cineon: ToneMappingMode.CINEON,
};

export type PostKind = "back" | "front";

export class PostPipeline {
  readonly composer: EffectComposer;
  private renderPass: RenderPass;
  private effectPass: EffectPass | null = null;
  private bloom: BloomEffect;
  private tone: ToneMappingEffect;
  private structureKey = "";

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private kind: PostKind,
    settings: RibbonSettings["post"],
  ) {
    this.composer = new EffectComposer(renderer, {
      depthBuffer: true,
      stencilBuffer: false,
      multisampling: settings.multisampling,
      frameBufferType: THREE.HalfFloatType,
    });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      luminanceThreshold: settings.bloomThreshold,
      luminanceSmoothing: settings.bloomSmoothing,
      intensity: settings.bloomIntensity,
      radius: settings.bloomRadius,
    });
    this.tone = new ToneMappingEffect({
      mode: TONE_MODES[settings.toneMapping],
    });
    this.configure(settings);
  }

  configure(s: RibbonSettings["post"]): void {
    this.composer.multisampling = s.multisampling;
    this.tone.mode = TONE_MODES[s.toneMapping];
    this.bloom.intensity = s.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = s.bloomThreshold;
    this.bloom.luminanceMaterial.smoothing = s.bloomSmoothing;
    this.bloom.mipmapBlurPass.radius = s.bloomRadius;

    const useBloom = s.bloom && (this.kind === "back" || s.bloomFront);
    const useDither = s.dither && this.kind === "back";
    const key = `${useBloom}|${useDither}`;
    if (key !== this.structureKey) {
      this.structureKey = key;
      if (this.effectPass) {
        this.composer.removePass(this.effectPass);
        this.effectPass.dispose();
      }
      const effects = useBloom ? [this.bloom, this.tone] : [this.tone];
      this.effectPass = new EffectPass(this.camera, ...effects);
      this.effectPass.dithering = useDither;
      this.composer.addPass(this.effectPass);
    }
  }

  /** css px size; pixel ratio must already be set on the renderer */
  setSize(w: number, h: number): void {
    this.composer.setSize(w, h, false);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
    this.tone.dispose();
  }
}
