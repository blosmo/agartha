import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type ModelPose = { x: number; y: number; size: number; rotation: [number, number, number]; opacity: number };
export type ModelRenderer = { backend: string; render(poses: ModelPose[], width: number, height: number): void; dispose(): void };

export async function createModelRenderer(host: HTMLElement, ids: string[], signal: AbortSignal, onFailure: () => void): Promise<ModelRenderer> {
  const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  camera.position.z = 1000;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let environment: THREE.RenderTarget | undefined, disposed = false;
  const dispose = () => {
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
    geometries.clear(); materials.clear();
    if (disposed) return;
    disposed = true;
    environment?.dispose();
    // Disposing a failed initialization starts another rejected init inside Three.
    if (renderer.initialized) renderer.dispose();
    renderer.domElement.remove();
  };
  const fail = () => { if (!disposed) { dispose(); onFailure(); } };
  try {
    await renderer.init();
    signal.throwIfAborted();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.append(renderer.domElement);
    renderer.onDeviceLost = fail;
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); });
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    // RoomEnvironment's emissive panels provide the reflections; its legacy
    // point lights are unnecessary for PMREM and unsupported by this backend.
    room.children.filter(object => (object as THREE.Light).isLight).forEach(object => room.remove(object));
    try { environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; }
    finally { room.dispose(); pmrem.dispose(); }
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb5c4bd, 1.4));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.5); key.position.set(-300, 400, 600); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe5f1ff, 1.2); fill.position.set(400, 100, 300); scene.add(fill);
    const loaded = await Promise.allSettled(ids.map(async id => {
      const response = await fetch(`/compute/models/${id}.glb`, { signal });
      if (!response.ok) throw new Error(`Model unavailable: ${id}`);
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/compute/models/');
      const modelMaterials: THREE.Material[] = [];
      gltf.scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material); modelMaterials.push(material); material.transparent = true;
        }
      });
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error(`Invalid model bounds: ${id}`);
      gltf.scene.position.sub(sphere.center);
      const normalized = new THREE.Group(); normalized.add(gltf.scene); normalized.scale.setScalar(1 / (2 * sphere.radius));
      const pivot = new THREE.Group(); pivot.add(normalized); scene.add(pivot);
      return { pivot, materials: modelMaterials };
    }));
    const failure = loaded.find(value => value.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    signal.throwIfAborted();
    if (disposed) throw new Error('Model renderer lost during initialization.');
    const models = loaded.map(value => { if (value.status !== 'fulfilled') throw new Error('Incomplete collection.'); return value.value; });
    let lastWidth = 0, lastHeight = 0;
    return {
      backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'three-webgpu' : 'three-webgl',
      dispose,
      render(poses, width, height) {
        if (disposed) throw new Error('Model renderer is no longer available.');
        if (!width || !height) return;
        if (width !== lastWidth || height !== lastHeight) {
          renderer.setSize(width, height, false); lastWidth = width; lastHeight = height;
          camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2;
          camera.updateProjectionMatrix();
        }
        models.forEach((model, i) => {
          const pose = poses[i];
          model.pivot.position.set(pose.x - width / 2, height / 2 - pose.y, 0);
          model.pivot.rotation.set(...pose.rotation); model.pivot.scale.setScalar(pose.size);
          model.pivot.visible = pose.opacity > 0.001;
          model.materials.forEach(material => { material.opacity = pose.opacity; });
        });
        renderer.render(scene, camera);
      },
    };
  } catch (error) { dispose(); throw error; }
}
