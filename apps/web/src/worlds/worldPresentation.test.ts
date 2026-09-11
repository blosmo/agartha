import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { parseRoomEnvironment } from '../../../../packages/protocol/src/roomEnvironment';
import { createSkybox } from './skybox';
import { createWorld } from './world';
import { activeRoomEnvironment, WorldPresentation } from './worldPresentation';

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: vi.fn(class {
    addPass = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }),
}));
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: vi.fn(class { dispose = vi.fn(); camera = undefined; }),
}));
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: vi.fn(class { dispose = vi.fn(); strength = 0; }),
}));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: vi.fn(class { dispose = vi.fn(); }),
}));

it('selects only the active room and clears its atmosphere while missing or archived', () => {
  const warm = { ...createWorld(), id: 'warm', environment: parseRoomEnvironment({ preset: 'golden-hour' }) };
  const dark = { ...createWorld(), id: 'dark', environment: parseRoomEnvironment({ preset: 'moonlit' }) };
  expect(activeRoomEnvironment([dark, warm], 'warm')).toBe(warm.environment);
  expect(activeRoomEnvironment([warm, dark], 'warm')).toBe(warm.environment);
  expect(activeRoomEnvironment([dark], 'warm')).toBeUndefined();
  expect(activeRoomEnvironment([{ ...warm, archived: true }, dark], 'warm')).toBeUndefined();
});

it('applies room lighting, uses it each frame, and restores defaults when switching away', () => {
  const renderer = { toneMappingExposure: .9, render: vi.fn() } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#dee8df', 200, 1200);
  const sky = createSkybox(), sun = new THREE.DirectionalLight(), hemisphere = new THREE.HemisphereLight();
  const base = new THREE.Texture(), presentation = new WorldPresentation(renderer, scene, sky, sun, hemisphere, base);
  const camera = new THREE.OrthographicCamera(); camera.position.set(100, 100, 100);
  try {
    presentation.set(parseRoomEnvironment({ preset: 'golden-hour', bloom: 0, exposure: 1.1, haze: .5 }), 'warm');
    presentation.frame(camera, new THREE.Vector3(), false, true, 0, 0, new THREE.Vector3());
    expect(renderer.toneMappingExposure).toBe(1.1);
    expect(sun.color.getHexString()).toBe('ffd5a5');
    expect(scene.fog.near).toBeCloseTo(100);
    expect(sun.shadow.camera.right).toBe(32);
    expect(sun.position.x).toBeLessThan(0);
    expect(sun.position.z).toBeGreaterThan(0);
    presentation.set(undefined, 'missing');
    presentation.frame(camera, new THREE.Vector3(), false, true, 0, 0, new THREE.Vector3());
    expect(renderer.toneMappingExposure).toBe(.9);
    expect(scene.environment).toBe(base);
    expect(scene.environmentIntensity).toBe(.45);
    expect(scene.fog.near).toBe(200);
    expect(sun.shadow.camera.right).toBe(100);
    expect(sun.position.toArray()).toEqual([-30, 70, 30]);
    presentation.render(camera, .016);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  } finally {
    presentation.dispose(); sky.geometry.dispose(); sky.material.dispose(); sun.shadow.dispose(); base.dispose();
  }
});

it('creates, resizes, and disposes bloom effects as the room configuration changes', () => {
  const renderer = { toneMappingExposure: 1, getPixelRatio: vi.fn(() => 2) } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const sky = createSkybox(), sun = new THREE.DirectionalLight(), hemisphere = new THREE.HemisphereLight();
  const base = new THREE.Texture(), presentation = new WorldPresentation(renderer, scene, sky, sun, hemisphere, base);
  try {
    presentation.set(parseRoomEnvironment({ preset: 'golden-hour', bloom: .4 }), 'bloom-room');

    expect(EffectComposer).toHaveBeenCalledOnce();
    expect(RenderPass).toHaveBeenCalledOnce();
    expect(UnrealBloomPass).toHaveBeenCalledWith(expect.any(THREE.Vector2), .4, .35, 1.05);
    expect(OutputPass).toHaveBeenCalledOnce();
    const composer = vi.mocked(EffectComposer).mock.results[0]?.value as { setPixelRatio: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
    const bloom = vi.mocked(UnrealBloomPass).mock.results[0]?.value as { strength: number; dispose: ReturnType<typeof vi.fn> };
    const output = vi.mocked(OutputPass).mock.results[0]?.value as { dispose: ReturnType<typeof vi.fn> };
    const renderPass = vi.mocked(RenderPass).mock.results[0]?.value as { dispose: ReturnType<typeof vi.fn> };
    expect(bloom.strength).toBe(.4);

    presentation.resize(640, 360);
    expect(composer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(composer.setSize).toHaveBeenLastCalledWith(640, 360);
    presentation.resize(3840, 2160);
    const ratio = composer.setPixelRatio.mock.calls.at(-1)![0];
    expect(3840 * 2160 * ratio * ratio).toBeCloseTo(2_000_000);
    expect(ratio).toBeLessThan(1);

    presentation.set(parseRoomEnvironment({ preset: 'golden-hour', bloom: 0 }), 'default-room');
    expect(bloom.dispose).toHaveBeenCalledOnce();
    expect(output.dispose).toHaveBeenCalledOnce();
    expect(renderPass.dispose).toHaveBeenCalledOnce();
    expect(composer.dispose).toHaveBeenCalledOnce();
  } finally {
    presentation.dispose(); sky.geometry.dispose(); sky.material.dispose(); sun.shadow.dispose(); base.dispose();
  }
});

it('captures a reflection and restores temporary scene state after success', () => {
  const renderer = { toneMappingExposure: 1, getPixelRatio: vi.fn(() => 1) } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const sky = createSkybox(); sky.position.set(2, 4, 6); sky.scale.set(3, 4, 5);
  const sun = new THREE.DirectionalLight(), hemisphere = new THREE.HemisphereLight(), base = new THREE.Texture();
  const presentation = new WorldPresentation(renderer, scene, sky, sun, hemisphere, base);
  const oldEnvironment = new THREE.Texture();
  const reflectionTexture = new THREE.Texture();
  const reflection = { texture: reflectionTexture, dispose: vi.fn() } as unknown as THREE.WebGLRenderTarget;
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => undefined);
  const fromCubemap = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromCubemap').mockReturnValue(reflection);
  const now = 1000;
  scene.environment = oldEnvironment;
  const originalPosition = sky.position.clone(), originalScale = sky.scale.clone();
  try {
    presentation.set(parseRoomEnvironment({ preset: 'golden-hour' }), 'reflection-room');
    presentation.frame(new THREE.PerspectiveCamera(), new THREE.Vector3(), false, true, now, 1, new THREE.Vector3(8, 0, 12));
    presentation.frame(new THREE.PerspectiveCamera(), new THREE.Vector3(), false, true, now + 751, 1, new THREE.Vector3(8, 0, 12));

    expect(update).toHaveBeenCalledOnce();
    expect(fromCubemap).toHaveBeenCalledOnce();
    expect(scene.environment).toBe(reflectionTexture);
    expect(sky.position.toArray()).toEqual(originalPosition.toArray());
    expect(sky.scale.toArray()).toEqual(originalScale.toArray());
  } finally {
    presentation.dispose(); clock.mockRestore(); update.mockRestore(); fromCubemap.mockRestore();
    reflectionTexture.dispose(); oldEnvironment.dispose(); sky.geometry.dispose(); sky.material.dispose(); sun.shadow.dispose(); base.dispose();
  }
});

it('restores the existing environment after a failed reflection capture and disposes temporaries', () => {
  const renderer = { toneMappingExposure: 1, getPixelRatio: vi.fn(() => 1) } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const sky = createSkybox(); sky.position.set(2, 4, 6); sky.scale.set(3, 4, 5);
  const sun = new THREE.DirectionalLight(), hemisphere = new THREE.HemisphereLight(), base = new THREE.Texture();
  const presentation = new WorldPresentation(renderer, scene, sky, sun, hemisphere, base);
  const oldEnvironment = new THREE.Texture();
  const originalPosition = sky.position.clone(), originalScale = sky.scale.clone();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const cubeDispose = vi.spyOn(THREE.WebGLCubeRenderTarget.prototype, 'dispose');
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => { throw new Error('capture failed'); });
  const fromCubemap = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromCubemap');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    presentation.set(parseRoomEnvironment({ preset: 'golden-hour' }), 'failed-reflection-room');
    scene.environment = oldEnvironment;
    presentation.frame(new THREE.PerspectiveCamera(), new THREE.Vector3(), false, true, 1000, 1, new THREE.Vector3());
    presentation.frame(new THREE.PerspectiveCamera(), new THREE.Vector3(), false, true, 1751, 1, new THREE.Vector3());

    expect(update).toHaveBeenCalledOnce();
    expect(fromCubemap).not.toHaveBeenCalled();
    expect(scene.environment).toBe(oldEnvironment);
    expect(sky.position.toArray()).toEqual(originalPosition.toArray());
    expect(sky.scale.toArray()).toEqual(originalScale.toArray());
    expect(cubeDispose).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Room reflection capture failed; using the existing environment.', expect.any(Error));
  } finally {
    presentation.dispose(); clock.mockRestore(); warn.mockRestore(); update.mockRestore(); fromCubemap.mockRestore(); cubeDispose.mockRestore();
    oldEnvironment.dispose(); sky.geometry.dispose(); sky.material.dispose(); sun.shadow.dispose(); base.dispose();
  }
});
