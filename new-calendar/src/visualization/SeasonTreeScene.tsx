import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  DAYS_PER_SEASON,
  type NewCalendarDate,
} from "../lib/newCalendar";
import { createNatureTexture } from "./generatedTextures";

interface SeasonTreeSceneProps {
  calendarDate: NewCalendarDate;
}

interface ScatterPoint {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  reveal: number;
}

interface SeasonTreeState {
  leafDensity: number;
  leafScale: number;
  blossomDensity: number;
  fruitDensity: number;
  fallenDensity: number;
  snowScale: number;
  leafColor: THREE.Color;
  blossomColor: THREE.Color;
  fruitColor: THREE.Color;
  fallenColor: THREE.Color;
  groundColor: THREE.Color;
  trunkColor: THREE.Color;
}

interface TreeHandles {
  root: THREE.Group;
  leaves: THREE.InstancedMesh;
  blossoms: THREE.InstancedMesh;
  fruit: THREE.InstancedMesh;
  fallenLeaves: THREE.InstancedMesh;
  snow: THREE.Mesh;
  ground: THREE.Mesh;
  trunkMaterial: THREE.MeshStandardMaterial;
  leafMaterial: THREE.MeshStandardMaterial;
  blossomMaterial: THREE.MeshStandardMaterial;
  fruitMaterial: THREE.MeshStandardMaterial;
  fallenMaterial: THREE.MeshStandardMaterial;
  snowMaterial: THREE.MeshStandardMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
  leafPoints: ScatterPoint[];
  blossomPoints: ScatterPoint[];
  fruitPoints: ScatterPoint[];
  fallenPoints: ScatterPoint[];
  current: SeasonTreeState;
  target: SeasonTreeState;
}

const leafCount = 260;
const blossomCount = 90;
const fruitCount = 86;
const fallenLeafCount = 120;
const cameraPolarAngle = Math.atan2(3.2, 5.8);

export function SeasonTreeScene({ calendarDate }: SeasonTreeSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<TreeHandles | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }

    setWebglFailed(false);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080807, 0.08);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    camera.position.set(0, 3.2, 5.8);
    camera.lookAt(0, 0.2, 0);

    renderer.setClearColor(0x050505, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4.4;
    controls.maxDistance = 8;
    controls.minPolarAngle = cameraPolarAngle - 0.22;
    controls.maxPolarAngle = cameraPolarAngle + 0.14;
    controls.minAzimuthAngle = -0.7;
    controls.maxAzimuthAngle = 0.7;
    controls.target.set(0, 0.15, 0);

    scene.add(new THREE.AmbientLight(0xf6efe3, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-2.8, 5.4, 4.6);
    scene.add(keyLight);
    const warmLight = new THREE.PointLight(0xffd38a, 3.2, 12);
    warmLight.position.set(2.4, 1.8, 2.4);
    scene.add(warmLight);

    const initialState = makeSeasonState(calendarDate);
    const handles = buildTree(initialState);
    scene.add(handles.root);
    treeRef.current = handles;

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function resize() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const width = Math.max(300, rect.width);
      const height = Math.max(260, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function animate() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      updateTree(handles, delta, clock.elapsedTime);
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      treeRef.current = null;
      disposeObject(handles.root);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const handles = treeRef.current;
    if (!handles) return;
    handles.target = makeSeasonState(calendarDate);
  }, [calendarDate]);

  return (
    <div className="tree-scene-wrap" aria-label="3D seasonal tree visualization">
      <div ref={containerRef} className="tree-scene-canvas" data-testid="season-tree-scene" />
      {webglFailed && (
        <div className="webgl-fallback" role="status">
          3D rendering is unavailable, but the seasonal tree follows the selected date.
        </div>
      )}
    </div>
  );
}

function buildTree(initialState: SeasonTreeState): TreeHandles {
  const root = new THREE.Group();
  root.rotation.x = -0.05;
  const barkTexture = createNatureTexture("bark", { repeatX: 2, repeatY: 5 });
  const leafTexture = createNatureTexture("leaf", { repeatX: 2, repeatY: 2 });
  const blossomTexture = createNatureTexture("blossom");
  const fruitTexture = createNatureTexture("fruit");
  const fallenTexture = createNatureTexture("fallenLeaf", { repeatX: 2, repeatY: 1 });
  const groundTexture = createNatureTexture("ground", { repeatX: 3, repeatY: 3 });
  const snowTexture = createNatureTexture("snow", { repeatX: 2, repeatY: 2 });

  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: barkTexture,
    bumpMap: barkTexture,
    bumpScale: 0.045,
    color: initialState.trunkColor,
    roughness: 0.74,
    metalness: 0.02,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    map: leafTexture,
    bumpMap: leafTexture,
    bumpScale: 0.025,
    color: initialState.leafColor,
    roughness: 0.82,
    metalness: 0.01,
  });
  const blossomMaterial = new THREE.MeshStandardMaterial({
    map: blossomTexture,
    color: initialState.blossomColor,
    roughness: 0.72,
  });
  const fruitMaterial = new THREE.MeshStandardMaterial({
    map: fruitTexture,
    bumpMap: fruitTexture,
    bumpScale: 0.018,
    color: initialState.fruitColor,
    roughness: 0.58,
  });
  const fallenMaterial = new THREE.MeshStandardMaterial({
    map: fallenTexture,
    bumpMap: fallenTexture,
    bumpScale: 0.018,
    color: initialState.fallenColor,
    roughness: 0.74,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({
    map: snowTexture,
    bumpMap: snowTexture,
    bumpScale: 0.025,
    color: 0xf5f4ee,
    roughness: 0.92,
  });
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
    bumpMap: groundTexture,
    bumpScale: 0.03,
    color: initialState.groundColor,
    roughness: 0.84,
  });

  const ground = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.18, 64), groundMaterial);
  ground.position.y = -1.5;
  ground.scale.z = 0.72;
  root.add(ground);

  const snow = new THREE.Mesh(new THREE.CylinderGeometry(2.36, 2.48, 0.06, 64), snowMaterial);
  snow.position.y = -1.38;
  snow.scale.set(1, initialState.snowScale, 0.72);
  root.add(snow);

  addTrunkAndBranches(root, trunkMaterial);

  const leafPoints = makeCanopyPoints(leafCount, 4);
  const blossomPoints = makeCanopyPoints(blossomCount, 11);
  const fruitPoints = makeCanopyPoints(fruitCount, 19);
  const fallenPoints = makeGroundPoints(fallenLeafCount, 23);

  const leaves = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.082, 0),
    leafMaterial,
    leafCount,
  );
  const blossoms = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    blossomMaterial,
    blossomCount,
  );
  const fruit = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.05, 12, 10),
    fruitMaterial,
    fruitCount,
  );
  const fallenLeaves = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.012, 0.05),
    fallenMaterial,
    fallenLeafCount,
  );

  root.add(leaves, blossoms, fruit, fallenLeaves);

  const handles = {
    root,
    leaves,
    blossoms,
    fruit,
    fallenLeaves,
    snow,
    ground,
    trunkMaterial,
    leafMaterial,
    blossomMaterial,
    fruitMaterial,
    fallenMaterial,
    snowMaterial,
    groundMaterial,
    leafPoints,
    blossomPoints,
    fruitPoints,
    fallenPoints,
    current: cloneState(initialState),
    target: cloneState(initialState),
  };

  updateScatter(leaves, leafPoints, initialState.leafDensity, initialState.leafScale, 0);
  updateScatter(blossoms, blossomPoints, initialState.blossomDensity, 1, 0);
  updateScatter(fruit, fruitPoints, initialState.fruitDensity, 1, 0);
  updateScatter(fallenLeaves, fallenPoints, initialState.fallenDensity, 1, 0);
  return handles;
}

function addTrunkAndBranches(root: THREE.Group, material: THREE.Material) {
  const trunk = tube([
    [0, -1.44, 0],
    [-0.12, -0.74, 0.02],
    [0.14, -0.05, -0.02],
    [0.02, 0.72, 0],
  ], 0.16, material);
  root.add(trunk);

  const branches: Array<{ points: number[][]; radius: number }> = [
    { points: [[0.02, 0.46, 0], [-0.48, 0.92, 0.06], [-1.15, 1.22, 0.08]], radius: 0.07 },
    { points: [[0.08, 0.64, 0], [0.58, 1.02, -0.02], [1.38, 1.28, -0.04]], radius: 0.075 },
    { points: [[0.04, 0.82, 0], [-0.22, 1.22, -0.08], [-0.58, 1.72, -0.12]], radius: 0.055 },
    { points: [[0.12, 0.82, 0], [0.35, 1.34, 0.06], [0.65, 1.82, 0.1]], radius: 0.052 },
    { points: [[0.02, 0.68, 0], [-0.78, 1.42, -0.04], [-1.55, 1.78, -0.12]], radius: 0.046 },
    { points: [[0.18, 0.64, 0], [0.86, 1.28, 0.04], [1.62, 1.68, 0.12]], radius: 0.046 },
    { points: [[-0.45, 1.02, 0.06], [-0.98, 1.52, 0.28], [-1.72, 1.68, 0.36]], radius: 0.035 },
    { points: [[0.62, 1.06, -0.02], [1.08, 1.52, -0.28], [1.74, 1.66, -0.34]], radius: 0.035 },
    { points: [[-0.32, 1.2, -0.04], [-0.88, 1.88, -0.28], [-1.36, 2.16, -0.24]], radius: 0.032 },
    { points: [[0.46, 1.28, 0.04], [0.92, 1.88, 0.24], [1.36, 2.14, 0.28]], radius: 0.032 },
    { points: [[0.06, 1.02, 0], [-0.08, 1.64, 0.18], [-0.18, 2.26, 0.2]], radius: 0.038 },
    { points: [[0.1, 1.0, 0], [0.22, 1.58, -0.18], [0.36, 2.2, -0.2]], radius: 0.035 },
  ];

  branches.forEach((branch) => root.add(tube(branch.points, branch.radius, material)));
}

function tube(points: number[][], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8), material);
}

function updateTree(handles: TreeHandles, delta: number, elapsed: number) {
  const alpha = 1 - Math.exp(-delta * 3.5);
  lerpState(handles.current, handles.target, alpha);
  handles.root.rotation.y = Math.sin(elapsed * 0.24) * 0.035;

  handles.leafMaterial.color.copy(handles.current.leafColor);
  handles.blossomMaterial.color.copy(handles.current.blossomColor);
  handles.fruitMaterial.color.copy(handles.current.fruitColor);
  handles.fallenMaterial.color.copy(handles.current.fallenColor);
  handles.groundMaterial.color.copy(handles.current.groundColor);
  handles.trunkMaterial.color.copy(handles.current.trunkColor);
  handles.snow.scale.y = Math.max(0.001, handles.current.snowScale);
  handles.snow.visible = handles.current.snowScale > 0.025;

  updateScatter(
    handles.leaves,
    handles.leafPoints,
    handles.current.leafDensity,
    handles.current.leafScale,
    elapsed,
  );
  updateScatter(handles.blossoms, handles.blossomPoints, handles.current.blossomDensity, 1, elapsed);
  updateScatter(handles.fruit, handles.fruitPoints, handles.current.fruitDensity, 1, elapsed);
  updateScatter(handles.fallenLeaves, handles.fallenPoints, handles.current.fallenDensity, 1, elapsed);
}

function updateScatter(
  mesh: THREE.InstancedMesh,
  points: ScatterPoint[],
  density: number,
  scaleMultiplier: number,
  elapsed: number,
) {
  const dummy = new THREE.Object3D();
  points.forEach((point, index) => {
    const reveal = clamp((density - point.reveal) / 0.18, 0, 1);
    const scale = point.scale * scaleMultiplier * reveal;
    const sway = Math.sin(elapsed * 1.4 + index * 0.37) * 0.018 * reveal;
    dummy.position.copy(point.position);
    dummy.position.x += sway;
    dummy.rotation.copy(point.rotation);
    dummy.rotation.z += sway * 1.8;
    dummy.scale.setScalar(Math.max(0.001, scale));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function makeSeasonState(calendarDate: NewCalendarDate): SeasonTreeState {
  const progress = (calendarDate.dayOfSeason - 1) / (DAYS_PER_SEASON - 1);
  const season = calendarDate.season;

  if (season === "Winter") {
    return state({
      leafDensity: 0.04,
      leafScale: 0.6,
      blossomDensity: 0,
      fruitDensity: 0,
      fallenDensity: 0.07,
      snowScale: 0.95 - progress * 0.42,
      leafColor: "#e9e6dd",
      blossomColor: "#f4e7f5",
      fruitColor: "#f46555",
      fallenColor: "#8a4a36",
      groundColor: "#e8e8df",
      trunkColor: "#ff725f",
    });
  }

  if (season === "Spring") {
    return state({
      leafDensity: 0.34 + progress * 0.42,
      leafScale: 0.86 + progress * 0.12,
      blossomDensity: 0.95 - progress * 0.28,
      fruitDensity: 0,
      fallenDensity: 0.04,
      snowScale: 0.18 * (1 - progress),
      leafColor: mix("#f0a8df", "#71f0a5", progress * 0.68),
      blossomColor: "#f4a4de",
      fruitColor: "#f45d55",
      fallenColor: "#f4a4de",
      groundColor: mix("#37b98e", "#43d778", progress),
      trunkColor: "#ff9260",
    });
  }

  if (season === "Summer") {
    return state({
      leafDensity: 1,
      leafScale: 1.12,
      blossomDensity: 0.08,
      fruitDensity: 0.06,
      fallenDensity: 0.02,
      snowScale: 0,
      leafColor: "#16db80",
      blossomColor: "#f5e56c",
      fruitColor: "#f56551",
      fallenColor: "#62d776",
      groundColor: "#57d765",
      trunkColor: "#ff9a61",
    });
  }

  if (season === "Autumn") {
    return state({
      leafDensity: 0.96 - progress * 0.08,
      leafScale: 1.04,
      blossomDensity: 0.02,
      fruitDensity: 0.58 + progress * 0.34,
      fallenDensity: 0.06 + progress * 0.08,
      snowScale: 0,
      leafColor: mix("#11c5a8", "#2fbf8e", progress),
      blossomColor: "#d9edf0",
      fruitColor: "#ff6257",
      fallenColor: "#ff7257",
      groundColor: mix("#34c875", "#61c95c", progress),
      trunkColor: "#ffab45",
    });
  }

  return state({
    leafDensity: 0.78 - progress * 0.5,
    leafScale: 1.02 - progress * 0.1,
    blossomDensity: 0,
    fruitDensity: 0.1 * (1 - progress),
    fallenDensity: 0.22 + progress * 0.68,
    snowScale: 0.02 * progress,
    leafColor: mix("#ff8d44", "#ff5045", progress),
    blossomColor: "#ffc3a0",
    fruitColor: "#ff5a4a",
    fallenColor: mix("#ff8d44", "#e94235", progress),
    groundColor: mix("#91c84b", "#babf55", progress),
    trunkColor: "#ffb13e",
  });
}

function state(values: Omit<SeasonTreeState, "leafColor" | "blossomColor" | "fruitColor" | "fallenColor" | "groundColor" | "trunkColor"> & {
  leafColor: string | THREE.Color;
  blossomColor: string | THREE.Color;
  fruitColor: string | THREE.Color;
  fallenColor: string | THREE.Color;
  groundColor: string | THREE.Color;
  trunkColor: string | THREE.Color;
}): SeasonTreeState {
  return {
    ...values,
    leafColor: color(values.leafColor),
    blossomColor: color(values.blossomColor),
    fruitColor: color(values.fruitColor),
    fallenColor: color(values.fallenColor),
    groundColor: color(values.groundColor),
    trunkColor: color(values.trunkColor),
  };
}

function cloneState(value: SeasonTreeState): SeasonTreeState {
  return {
    leafDensity: value.leafDensity,
    leafScale: value.leafScale,
    blossomDensity: value.blossomDensity,
    fruitDensity: value.fruitDensity,
    fallenDensity: value.fallenDensity,
    snowScale: value.snowScale,
    leafColor: value.leafColor.clone(),
    blossomColor: value.blossomColor.clone(),
    fruitColor: value.fruitColor.clone(),
    fallenColor: value.fallenColor.clone(),
    groundColor: value.groundColor.clone(),
    trunkColor: value.trunkColor.clone(),
  };
}

function lerpState(current: SeasonTreeState, target: SeasonTreeState, alpha: number) {
  current.leafDensity += (target.leafDensity - current.leafDensity) * alpha;
  current.leafScale += (target.leafScale - current.leafScale) * alpha;
  current.blossomDensity += (target.blossomDensity - current.blossomDensity) * alpha;
  current.fruitDensity += (target.fruitDensity - current.fruitDensity) * alpha;
  current.fallenDensity += (target.fallenDensity - current.fallenDensity) * alpha;
  current.snowScale += (target.snowScale - current.snowScale) * alpha;
  current.leafColor.lerp(target.leafColor, alpha);
  current.blossomColor.lerp(target.blossomColor, alpha);
  current.fruitColor.lerp(target.fruitColor, alpha);
  current.fallenColor.lerp(target.fallenColor, alpha);
  current.groundColor.lerp(target.groundColor, alpha);
  current.trunkColor.lerp(target.trunkColor, alpha);
}

function makeCanopyPoints(count: number, seed: number): ScatterPoint[] {
  const random = seededRandom(seed);
  const points: ScatterPoint[] = [];
  while (points.length < count) {
    const x = (random() * 2 - 1) * 1.85;
    const y = 0.84 + random() * 1.68;
    const z = (random() * 2 - 1) * 0.72;
    const normalized =
      (x * x) / 3.42 +
      ((y - 1.64) * (y - 1.64)) / 0.86 +
      (z * z) / 0.62;
    if (normalized > 1.08) continue;
    points.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
      scale: 0.72 + random() * 0.82,
      reveal: random(),
    });
  }
  return points;
}

function makeGroundPoints(count: number, seed: number): ScatterPoint[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const radius = Math.sqrt(random()) * 2.08;
    const angle = random() * Math.PI * 2;
    return {
      position: new THREE.Vector3(Math.cos(angle) * radius, -1.33, Math.sin(angle) * radius * 0.62),
      rotation: new THREE.Euler(0, random() * Math.PI, random() * Math.PI),
      scale: 0.78 + random() * 0.86,
      reveal: random(),
    };
  });
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(from: string, to: string, progress: number): THREE.Color {
  return new THREE.Color(from).lerp(new THREE.Color(to), clamp(progress, 0, 1));
}

function color(value: string | THREE.Color): THREE.Color {
  return value instanceof THREE.Color ? value.clone() : new THREE.Color(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material) {
  const disposedTextures = new Set<THREE.Texture>();
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
      disposedTextures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}
