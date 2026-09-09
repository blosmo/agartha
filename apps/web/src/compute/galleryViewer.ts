import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type GalleryViewer = { dispose(): void; reset(): void; backend: string };

export async function createGalleryViewer(host: HTMLElement, slug: string, signal: AbortSignal, onFailure: () => void): Promise<GalleryViewer> {
  const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .01, 30);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let environment: THREE.RenderTarget | undefined, controls: OrbitControls | undefined, resize: ResizeObserver | undefined;
  let disposed = false, frame = 0;
  const events = new AbortController();
  const dispose = () => {
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
    geometries.clear(); materials.clear();
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); events.abort(); resize?.disconnect(); controls?.dispose(); environment?.dispose();
    if (renderer.initialized) renderer.dispose();
    renderer.domElement.remove();
  };
  const fail = () => { if (!disposed) { dispose(); onFailure(); } };
  try {
    await renderer.init(); signal.throwIfAborted();
    renderer.onDeviceLost = fail;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    room.children.filter(object => (object as THREE.Light).isLight).forEach(object => room.remove(object));
    try { environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; }
    finally { room.dispose(); pmrem.dispose(); }
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc0bdb0, 1.2));
    const key = new THREE.DirectionalLight(0xfff0da, 2.3); key.position.set(-3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe5f0ff, 1); fill.position.set(4, 2, -3); scene.add(fill);
    const response = await fetch(`/compute/gallery/${slug}/model.glb`, { signal });
    if (!response.ok) throw new Error('The model could not be loaded.');
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), `/compute/gallery/${slug}/`);
    gltf.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    signal.throwIfAborted();
    if (disposed) throw new Error('Graphics became unavailable.');
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error('Invalid model geometry.');
    gltf.scene.position.sub(sphere.center);
    const normalized = new THREE.Group(); normalized.scale.setScalar(1 / (sphere.radius * 2)); normalized.add(gltf.scene); scene.add(normalized);
    const direction = slug === 'meridian-house' ? new THREE.Vector3(7, 3.5, -9) : slug === 'cloud-garden' ? new THREE.Vector3(7, 6.1, 9) : new THREE.Vector3(6, 2.65, 7.55);
    const initial = direction.normalize().multiplyScalar(1.85);
    camera.position.copy(initial);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = .7; controls.maxDistance = 4;
    function schedule() {
      if (disposed || document.hidden || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed) return;
        try { controls?.update(); renderer.render(scene, camera); } catch { fail(); }
      });
    }
    controls.addEventListener('change', schedule);
    resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight || disposed) return;
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); schedule();
    }); resize.observe(host);
    host.addEventListener('keydown', event => {
      const supported = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'];
      if (!supported.includes(event.key)) return;
      event.preventDefault();
      if (event.key === '0') camera.position.copy(initial);
      else {
        const position = new THREE.Spherical().setFromVector3(camera.position);
        if (event.key === 'ArrowLeft') position.theta -= .15;
        if (event.key === 'ArrowRight') position.theta += .15;
        if (event.key === 'ArrowUp') position.phi -= .12;
        if (event.key === 'ArrowDown') position.phi += .12;
        if (event.key === '+' || event.key === '=') position.radius = Math.max(.7, position.radius * .9);
        if (event.key === '-') position.radius = Math.min(4, position.radius * 1.1);
        position.makeSafe(); camera.position.setFromSpherical(position);
      }
      controls?.update(); schedule();
    }, { signal: events.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); }, { signal: events.signal });
    schedule();
    return { dispose, backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl', reset() { camera.position.copy(initial); controls?.target.set(0, 0, 0); controls?.update(); schedule(); } };
  } catch (error) { dispose(); throw error; }
}
