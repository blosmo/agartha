import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type GalleryViewer = { dispose(): void; reset(): void; setVisible(value: boolean): void; backend: string };

export async function createGalleryViewer(host: HTMLElement, slug: string, signal: AbortSignal, onFailure: () => void): Promise<GalleryViewer> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 15);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  let environment: THREE.RenderTarget | undefined, controls: OrbitControls | undefined, resize: ResizeObserver | undefined;
  let shadow: THREE.LightShadow | undefined;
  let composer: EffectComposer | undefined, disposed = false, frame = 0, visible = true, interacted = false;
  const events = new AbortController();
  const initial = new THREE.Vector3();
  const direction = new THREE.Vector3(12, 9, 15).normalize();
  const dispose = () => {
    // A load may finish after disposal; collect and release those late resources too.
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    geometries.clear(); materials.clear(); textures.clear();
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); events.abort(); resize?.disconnect(); controls?.dispose(); environment?.dispose(); shadow?.dispose();
    composer?.passes.forEach(pass => pass.dispose()); composer?.dispose();
    renderer.dispose(); renderer.domElement.remove();
  };
  const fail = () => { if (!disposed) { dispose(); onFailure(); } };
  const schedule = () => {
    if (disposed || !visible || document.hidden || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      try { controls?.update(); composer?.render(); } catch { fail(); }
    });
  };
  try {
    signal.throwIfAborted();
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); }, { signal: events.signal });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = .92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);

    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    try { environment = pmrem.fromScene(room, .035); scene.environment = environment.texture; scene.environmentIntensity = .65; }
    finally { room.dispose(); pmrem.dispose(); }
    scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x786f5c, .4));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6); key.position.set(-2, 4, 3);
    key.castShadow = true; shadow = key.shadow; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -.8;
    key.shadow.camera.right = key.shadow.camera.top = .8; key.shadow.camera.near = .1; key.shadow.camera.far = 8;
    key.shadow.bias = -.00015; key.shadow.normalBias = .002; key.shadow.radius = 3; scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7e7ff, .55); fill.position.set(3, 2, 1); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffecd2, 1.7); rim.position.set(1, 3, -3); scene.add(rim);

    let model: THREE.Group;
    if (slug === 'platonic-solids') {
      model = new THREE.Group();
      const shapes = [new THREE.TetrahedronGeometry(.62), new THREE.BoxGeometry(.82, .82, .82),
        new THREE.OctahedronGeometry(.62), new THREE.DodecahedronGeometry(.58), new THREE.IcosahedronGeometry(.6)];
      const colors = [0xc7a273, 0x809b83, 0xc1856c, 0xa5b8c0, 0xd4bd84];
      shapes.forEach((geometry, i) => {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors[i], roughness: .38, metalness: .12, flatShading: true }));
        mesh.position.set((i % 3 - (i < 3 ? 1 : .5)) * 1.5, .7, i < 3 ? -.85 : .85);
        mesh.rotation.set(.12, i * .4, .08);
        model.add(mesh);
      });
    } else {
      const response = await fetch(`/compute/gallery/${slug}/model.glb`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
      if (!response.ok) throw new Error('The model could not be loaded.');
      model = (await new GLTFLoader().parseAsync(await response.arrayBuffer(), `/compute/gallery/${slug}/`)).scene;
    }
    model.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry); mesh.receiveShadow = true;
      const surfaces = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.castShadow = surfaces.some(material => !material.transparent || material.opacity > .8);
      for (const material of surfaces) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
          textures.add(value); value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
      }
    });
    signal.throwIfAborted();
    if (disposed) throw new Error('Graphics became unavailable.');
    const bounds = new THREE.Box3().setFromObject(model), sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error('Invalid model geometry.');
    model.position.sub(sphere.center);
    const normalized = new THREE.Group(); normalized.scale.setScalar(1 / (sphere.radius * 2)); normalized.add(model); scene.add(normalized);
    const floorGeometry = new THREE.PlaneGeometry(4, 4), floorMaterial = new THREE.ShadowMaterial({ color: 0x343c32, opacity: .2 });
    geometries.add(floorGeometry); materials.add(floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2;
    floor.position.y = (bounds.min.y - sphere.center.y) / (sphere.radius * 2) - .002; floor.receiveShadow = true; scene.add(floor);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
    composer = new EffectComposer(renderer, target); composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera);
    ao.updateGtaoMaterial({ radius: .07, thickness: .15, distanceExponent: 1.5, distanceFallOff: 1, samples: 8, screenSpaceRadius: false });
    ao.updatePdMaterial({ samples: 8, radius: 4 }); ao.blendIntensity = .45;
    composer.addPass(ao); composer.addPass(new OutputPass());

    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches; controls.dampingFactor = .09;
    controls.enablePan = false; controls.enableZoom = false; controls.minDistance = .7; controls.maxDistance = 4;
    controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI / 2 - .02;
    controls.addEventListener('start', () => { interacted = true; });
    controls.addEventListener('change', schedule);
    function fit() {
      if (!host.clientWidth || !host.clientHeight || disposed) return;
      const width = host.clientWidth, height = host.clientHeight;
      renderer.setSize(width, height, false); composer!.setSize(width, height);
      camera.aspect = width / height;
      const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
      initial.copy(direction).multiplyScalar(.51 / Math.sin(halfFov));
      if (!interacted) camera.position.copy(initial);
      camera.updateProjectionMatrix(); controls!.update(); schedule();
    }
    resize = new ResizeObserver(fit); resize.observe(host); fit();
    composer.render();
    host.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
      event.preventDefault(); interacted = true;
      if (event.key === '0') { interacted = false; camera.position.copy(initial); }
      else {
        const position = new THREE.Spherical().setFromVector3(camera.position);
        if (event.key === 'ArrowLeft') position.theta -= .15;
        if (event.key === 'ArrowRight') position.theta += .15;
        if (event.key === 'ArrowUp') position.phi = Math.max(.25, position.phi - .12);
        if (event.key === 'ArrowDown') position.phi = Math.min(Math.PI / 2 - .02, position.phi + .12);
        if (event.key === '+' || event.key === '=') position.radius = Math.max(.7, position.radius * .9);
        if (event.key === '-') position.radius = Math.min(4, position.radius * 1.1);
        camera.position.setFromSpherical(position);
      }
      controls!.update(); schedule();
    }, { signal: events.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule();
    }, { signal: events.signal });
    return {
      dispose, backend: 'webgl',
      setVisible(value) { visible = value; if (value) schedule(); else { cancelAnimationFrame(frame); frame = 0; } },
      reset() { interacted = false; camera.position.copy(initial); controls!.target.set(0, 0, 0); controls!.update(); schedule(); },
    };
  } catch (error) { dispose(); throw error; }
}
