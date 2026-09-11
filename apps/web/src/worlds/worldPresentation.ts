import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { RoomEnvironment } from '../../../../packages/protocol/src/roomEnvironment';
import { roomFog, roomLighting } from '../../../../packages/protocol/src/roomLighting';
import type { SharedWorld } from './world';

export function activeRoomEnvironment(plots: readonly SharedWorld[], id: string) {
  const room = plots.find(plot => plot.id === id);
  return room?.archived ? undefined : room?.environment;
}

/** One explicitly selected room supplies the viewing atmosphere, including its neighbors. */
export class WorldPresentation {
  lighting = roomLighting();
  private key = '';
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloom?: UnrealBloomPass;
  private output?: OutputPass;
  private reflection?: THREE.WebGLRenderTarget;
  private reflectionDirty = false;
  private templates = -1;
  private changedAt = 0;
  private capturedAt = -Infinity;
  private shadowExtent = 0;
  private width = 1;
  private height = 1;
  private readonly sunOffset = new THREE.Vector3(-30, 70, 30);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private sky: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>,
    private sun: THREE.DirectionalLight,
    private hemisphere: THREE.HemisphereLight,
    private baseEnvironment: THREE.Texture,
  ) {}

  set(environment?: RoomEnvironment, roomId = '') {
    const key = JSON.stringify([roomId, environment ?? null]);
    if (key === this.key) return;
    this.key = key;
    this.lighting = roomLighting(environment);
    const light = this.lighting;
    this.renderer.toneMappingExposure = light.exposure;
    this.sun.color.set(light.sun);
    this.sun.intensity = light.sunIntensity;
    this.hemisphere.color.set(light.sky);
    this.hemisphere.groundColor.set(light.ground);
    this.hemisphere.intensity = light.ambient;
    this.scene.environmentIntensity = light.reflection;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.set(light.horizon);
    for (const [key, value] of Object.entries({ zenith: light.zenith, horizon: light.horizon, nadir: light.nadir, sunlight: light.sun })) {
      this.sky.material.uniforms[key].value.set(value);
    }
    this.sunOffset.set(...light.sunDirection);
    if (light.configured) this.sunOffset.multiplyScalar(85);
    this.sky.material.uniforms.sunDirection.value.copy(this.sunOffset).normalize();
    this.scene.environment = this.baseEnvironment;
    this.reflection?.dispose();
    this.reflection = undefined;
    this.invalidateReflection();
    if (light.bloom > 0) {
      if (!this.composer) {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
        this.composer = new EffectComposer(this.renderer, target);
        this.renderPass = new RenderPass(this.scene, new THREE.Camera());
        this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), light.bloom, .35, 1.05);
        this.output = new OutputPass();
        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.bloom);
        this.composer.addPass(this.output);
        this.resize(this.width, this.height);
      }
      this.bloom!.strength = light.bloom;
    } else this.disposeEffects();
  }

  invalidateReflection() {
    this.reflectionDirty = this.lighting.configured;
    this.changedAt = performance.now();
  }

  frame(camera: THREE.Camera, target: THREE.Vector3, inside: boolean, focused: boolean, now: number, templates: number, roomCenter: THREE.Vector3) {
    const fog = roomFog(this.lighting, inside, camera.position.distanceTo(target));
    if (this.scene.fog instanceof THREE.Fog) Object.assign(this.scene.fog, fog);
    const extent = inside ? 28 : focused && this.lighting.configured ? 32 : 100;
    if (this.shadowExtent !== extent) {
      this.shadowExtent = extent;
      Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    const texel = extent * 2 / 2048;
    const x = Math.round(target.x / texel) * texel, z = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.copy(this.sunOffset).add(this.sun.target.position);
    if (templates !== this.templates) {
      this.templates = templates;
      this.invalidateReflection();
    }
    // A small static probe supplies local architectural reflections. Never capture every frame.
    if (this.reflectionDirty && now - this.changedAt > 750 && now - this.capturedAt > 2000) {
      this.captureReflection(roomCenter);
      this.capturedAt = now;
      this.reflectionDirty = false;
    }
  }

  private captureReflection(center: THREE.Vector3) {
    const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const camera = new THREE.CubeCamera(.1, 140, cube);
    camera.position.copy(center); camera.position.y = 3;
    const oldEnvironment = this.scene.environment;
    const skyPosition = this.sky.position.clone(), skyScale = this.sky.scale.clone();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.baseEnvironment;
    this.sky.position.copy(camera.position); this.sky.scale.setScalar(100);
    try {
      camera.update(this.renderer, this.scene);
      const reflection = pmrem.fromCubemap(cube.texture);
      this.reflection?.dispose();
      this.reflection = reflection;
      this.scene.environment = reflection.texture;
    } catch (error) {
      this.scene.environment = oldEnvironment;
      console.warn('Room reflection capture failed; using the existing environment.', error);
    } finally {
      this.sky.position.copy(skyPosition); this.sky.scale.copy(skyScale);
      pmrem.dispose(); cube.dispose();
    }
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.composer?.setPixelRatio(Math.min(this.renderer.getPixelRatio(), 1.5, Math.sqrt(2_000_000 / (this.width * this.height))));
    this.composer?.setSize(this.width, this.height);
  }

  render(camera: THREE.Camera, delta: number) {
    if (this.composer && this.renderPass) {
      this.renderPass.camera = camera;
      this.composer.render(delta);
    } else this.renderer.render(this.scene, camera);
  }

  private disposeEffects() {
    this.bloom?.dispose(); this.output?.dispose(); this.renderPass?.dispose(); this.composer?.dispose();
    this.bloom = undefined; this.output = undefined; this.renderPass = undefined; this.composer = undefined;
  }

  dispose() {
    this.disposeEffects();
    this.reflection?.dispose(); this.reflection = undefined;
  }
}
