/**
 * Procedural studio environment: a handful of HDR emissive softboxes in a dark
 * room, baked to a PMREM cube per renderer. No external HDRI.
 *
 * Direction convention (env space == world space): the camera sits on +Z
 * looking down -Z, so strips at azimuth 0 are "behind the camera" and are what
 * camera-facing surfaces reflect. Azimuth grows towards +X.
 */
import * as THREE from "three";
import type { RibbonSettings, StripSettings } from "./settings";
import { temperatureColor } from "./color";

const R = 10; // room radius

function dirFromAngles(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
}

/** HDR emissive panel with soft (gradient) edges so no hard aliased steps. */
function softPanel(
  color: string,
  intensity: number,
  softness: number,
  tint: THREE.Color,
): THREE.ShaderMaterial {
  const c = new THREE.Color(color).multiply(tint).multiplyScalar(intensity);
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: c },
      uSoft: { value: Math.min(Math.max(softness, 0.001), 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uSoft;
      varying vec2 vUv;
      void main() {
        float ax = abs(vUv.x - 0.5);
        float ay = abs(vUv.y - 0.5);
        // softness 0: flat box with a thin soft edge; 1: smooth gaussian
        // falloff (no hard edge anywhere -> no zebra banding on the ribbon)
        float boxX = 1.0 - smoothstep(0.40, 0.5, ax);
        float gX = exp(-ax * ax / (2.0 * 0.15 * 0.15)) * (1.0 - smoothstep(0.34, 0.5, ax));
        float fx = mix(boxX, gX, uSoft);
        float boxY = 1.0 - smoothstep(0.38, 0.5, ay);
        float gY = exp(-ay * ay / (2.0 * 0.22 * 0.22)) * (1.0 - smoothstep(0.34, 0.5, ay));
        float fy = mix(boxY, gY, uSoft);
        gl_FragColor = vec4(uColor * fx * fy, 1.0);
      }`,
  });
}

function addStrip(
  scene: THREE.Scene,
  s: StripSettings,
  tint: THREE.Color,
  disposables: Array<{ dispose(): void }>,
): void {
  if (s.intensity <= 0) return;
  const geo = new THREE.PlaneGeometry(s.width, s.length);
  const mat = softPanel(s.color, s.intensity, s.softness, tint);
  disposables.push(geo, mat);
  const mesh = new THREE.Mesh(geo, mat);
  const dir = dirFromAngles(s.azimuth, s.elevation);
  mesh.position.copy(dir).multiplyScalar(R * 0.82);
  mesh.up.set(0, 1, 0);
  mesh.lookAt(0, 0, 0);
  mesh.rotateZ(THREE.MathUtils.degToRad(s.roll));
  scene.add(mesh);
}

/**
 * The colour of ALL the environment light: `env.tint` x the colour temperature
 * (white x 6500 K = neutral) and the effective floor-bounce colour (the face A
 * colour when `bounce.followFace`, else `bounce.color`).
 */
export function resolveEnvColors(s: RibbonSettings): { tint: THREE.Color; bounce: THREE.Color } {
  const tint = new THREE.Color(s.env.tint).multiply(temperatureColor(s.light.temperature));
  const bounce = new THREE.Color(s.env.bounce.followFace ? s.material.faceA.color : s.env.bounce.color);
  return { tint, bounce };
}

export function buildStudioScene(
  env: RibbonSettings["env"],
  colors: { tint: THREE.Color; bounce: THREE.Color },
): {
  scene: THREE.Scene;
  dispose: () => void;
} {
  const { tint } = colors;
  const scene = new THREE.Scene();
  const disposables: Array<{ dispose(): void }> = [];

  // dark room with a faint vertical gradient so unlit surfaces are never dead
  const roomGeo = new THREE.SphereGeometry(R, 32, 16);
  const roomMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    toneMapped: false,
    depthWrite: false,
    uniforms: {
      uAmbientCol: { value: tint.clone().multiplyScalar(env.ambient) },
      uBounce: { value: colors.bounce.clone().multiply(tint).multiplyScalar(env.bounce.intensity) },
      uTop: { value: new THREE.Color(env.top.color).multiply(tint).multiplyScalar(env.top.intensity * 0.12) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbientCol;
      uniform vec3 uBounce;
      uniform vec3 uTop;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 col = uAmbientCol * (0.6 + 0.4 * smoothstep(-1.0, 1.0, y));
        // floor bounce (face-coloured), strongest straight down, fading to the horizon
        col += uBounce * pow(clamp(-y, 0.0, 1.0), 1.6);
        // faint overhead fill
        col += uTop * pow(clamp(y, 0.0, 1.0), 2.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  disposables.push(roomGeo, roomMat);
  scene.add(new THREE.Mesh(roomGeo, roomMat));

  // large soft overhead box
  if (env.top.intensity > 0) {
    const geo = new THREE.PlaneGeometry(14, 6);
    const mat = softPanel(env.top.color, env.top.intensity, 0.9, tint);
    disposables.push(geo, mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, R * 0.85, 1.5);
    m.rotation.x = Math.PI / 2;
    scene.add(m);
  }

  addStrip(scene, env.key, tint, disposables);
  addStrip(scene, env.fill, tint, disposables);
  addStrip(scene, env.rim, tint, disposables);

  return {
    scene,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Owns one PMREM texture for one renderer; rebuilds on demand. */
export class EnvironmentBuilder {
  private pmrem: THREE.PMREMGenerator;
  private target: THREE.WebGLRenderTarget | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  build(settings: RibbonSettings): THREE.Texture {
    const { scene, dispose } = buildStudioScene(settings.env, resolveEnvColors(settings));
    const next = this.pmrem.fromScene(scene, 0, 0.1, R * 2, { size: 512 });
    dispose();
    this.target?.dispose();
    this.target = next;
    return next.texture;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
    this.target = null;
  }
}
