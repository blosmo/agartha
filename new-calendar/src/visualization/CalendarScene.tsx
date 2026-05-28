import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeGregorianSeasonSegments } from "../lib/gregorianSeasons";
import type { OverlayMode } from "../lib/newCalendar";
import { createEarthSurfaceTexture } from "./generatedTextures";
import {
  GOLDEN_QUADRANT_RATIO,
  KRYSTAL_OCTANT_RATIO,
  makeExponentialSpiralPoints,
  makeKrystalStages,
} from "../lib/krystalSpiral";
import {
  SEASON_COLORS,
  angleForIndex,
  clampCalendarIndex,
  makeCalendarPoints,
  makeSeasonArcs,
  pointForIndex,
} from "./calendarGeometry";

interface CalendarSceneProps {
  selectedIndex: number;
  overlayMode: OverlayMode;
  krystalStage: number;
  cycleStartYear: number;
  showGregorianOverlay: boolean;
  simulatedDaysPerSecond: number;
  onSelectIndex: (index: number) => void;
  onHoverIndex: (index: number | null) => void;
}

interface SelectionMarkerHandles {
  selected: THREE.Mesh;
  halo: THREE.Mesh;
  target: THREE.Vector3;
  targetIndex: number;
  spinAngle: number;
}

interface SceneHandles {
  root: THREE.Group;
  overlayGroup: THREE.Group;
  selection: SelectionMarkerHandles;
}

const CAMERA_POLAR_ANGLE = Math.atan2(9.4, 7.2);
const EARTH_AXIAL_TILT_RADIANS = THREE.MathUtils.degToRad(23.44);
const EARTH_SIDEREAL_ROTATIONS_PER_SOLAR_DAY = 1.00273790935;
const EARTH_ROTATION_OFFSET_RADIANS = -Math.PI / 2;

export function CalendarScene({
  selectedIndex,
  overlayMode,
  krystalStage,
  cycleStartYear,
  showGregorianOverlay,
  simulatedDaysPerSecond,
  onSelectIndex,
  onHoverIndex,
}: CalendarSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onSelectIndex, onHoverIndex });
  const simulationRef = useRef({ simulatedDaysPerSecond });
  const sceneHandlesRef = useRef<SceneHandles | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  callbacksRef.current = { onSelectIndex, onHoverIndex };
  simulationRef.current = { simulatedDaysPerSecond };

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
    scene.fog = new THREE.FogExp2(0x090908, 0.025);

    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
    camera.position.set(0, 7.2, 9.4);
    camera.lookAt(0, 0, 0);

    renderer.setClearColor(0x050505, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4.6;
    controls.maxDistance = 16;
    controls.enablePan = false;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = CAMERA_POLAR_ANGLE;
    controls.maxPolarAngle = CAMERA_POLAR_ANGLE;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xf8f0de, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(2.8, 6, 3.2);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x83ffe6, 8, 20);
    rimLight.position.set(-3, 2, -4);
    scene.add(rimLight);

    const root = new THREE.Group();
    root.rotation.x = -0.18;
    scene.add(root);

    addSeasonArcs(root);
    const dayMesh = addDayMarkers(root);
    addCalendarGuides(root);
    const selection = addSelectionMarkers(root, selectedIndex);
    const overlayGroup = new THREE.Group();
    root.add(overlayGroup);
    sceneHandlesRef.current = { root, overlayGroup, selection };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    let frameId = 0;
    let hoverFrameId = 0;
    let pendingHoverPoint: { clientX: number; clientY: number } | null = null;
    let disposed = false;

    function resize() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(320, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function pointerFromClientPoint(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function findDay(clientX: number, clientY: number): number | null {
      pointerFromClientPoint(clientX, clientY);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(dayMesh, false)[0];
      return typeof hit?.instanceId === "number" ? clampCalendarIndex(hit.instanceId) : null;
    }

    function handlePointerMove(event: PointerEvent) {
      pendingHoverPoint = { clientX: event.clientX, clientY: event.clientY };
      if (hoverFrameId) return;

      hoverFrameId = window.requestAnimationFrame(() => {
        hoverFrameId = 0;
        if (!pendingHoverPoint) return;
        const { clientX, clientY } = pendingHoverPoint;
        pendingHoverPoint = null;
        callbacksRef.current.onHoverIndex(findDay(clientX, clientY));
      });
    }

    function handlePointerLeave() {
      if (hoverFrameId) {
        window.cancelAnimationFrame(hoverFrameId);
        hoverFrameId = 0;
      }
      pendingHoverPoint = null;
      callbacksRef.current.onHoverIndex(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const index = findDay(event.clientX, event.clientY);
      if (index !== null) callbacksRef.current.onSelectIndex(index);
    }

    function animate() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const selectionAlpha = 1 - Math.exp(-delta * 8);
      const simulatedDaysThisFrame = simulationRef.current.simulatedDaysPerSecond * delta;
      selection.selected.position.lerp(selection.target, selectionAlpha);
      selection.halo.position.lerp(selection.target, selectionAlpha);
      selection.spinAngle =
        simulatedDaysThisFrame > 0
          ? selection.spinAngle +
            simulatedDaysThisFrame * EARTH_SIDEREAL_ROTATIONS_PER_SOLAR_DAY * Math.PI * 2
          : earthRotationForIndex(selection.targetIndex);
      selection.selected.rotation.set(EARTH_AXIAL_TILT_RADIANS, selection.spinAngle, 0);
      selection.halo.rotation.z += delta * 0.9;
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      if (hoverFrameId) window.cancelAnimationFrame(hoverFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      sceneHandlesRef.current = null;
      disposeObject(root);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const selection = sceneHandlesRef.current?.selection;
    if (!selection) return;
    selection.target.copy(selectionMarkerPosition(selectedIndex));
    selection.targetIndex = selectedIndex;
    if (simulationRef.current.simulatedDaysPerSecond === 0) {
      selection.spinAngle = earthRotationForIndex(selectedIndex);
      selection.selected.rotation.set(EARTH_AXIAL_TILT_RADIANS, selection.spinAngle, 0);
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handles = sceneHandlesRef.current;
    if (!handles) return;

    disposeObject(handles.overlayGroup);
    handles.root.remove(handles.overlayGroup);

    const overlayGroup = new THREE.Group();
    handles.root.add(overlayGroup);
    addKrystalOverlay(overlayGroup, overlayMode, krystalStage);
    if (showGregorianOverlay) {
      addGregorianOverlay(overlayGroup, cycleStartYear);
    }
    handles.overlayGroup = overlayGroup;
  }, [overlayMode, krystalStage, cycleStartYear, showGregorianOverlay]);

  return (
    <div className="scene-wrap" aria-label="3D New Calendar visualization">
      <div ref={containerRef} className="scene-canvas" data-testid="calendar-scene" />
      {webglFailed && (
        <div className="webgl-fallback" role="status">
          3D rendering is unavailable, but the calendar readout and controls remain active.
        </div>
      )}
    </div>
  );
}

function addSeasonArcs(root: THREE.Group) {
  for (const arc of makeSeasonArcs()) {
    const points = [];
    for (let index = arc.startIndex; index <= arc.endIndex; index += 1) {
      const point = pointForIndex(index, 4.55);
      points.push(new THREE.Vector3(point.x, -0.08, point.z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: arc.color,
      transparent: true,
      opacity: 0.76,
    });
    root.add(new THREE.Line(geometry, material));
  }
}

function addDayMarkers(root: THREE.Group): THREE.InstancedMesh {
  const points = makeCalendarPoints();
  const geometry = new THREE.SphereGeometry(0.045, 10, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xf7efe1,
    emissive: 0x15110b,
    roughness: 0.48,
    metalness: 0.12,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  points.forEach((point) => {
    const scale = point.isReflectionDay ? 1.9 : point.isLeapMarker ? 2.3 : 1;
    matrix.compose(
      new THREE.Vector3(point.x, point.y, point.z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale),
    );
    mesh.setMatrixAt(point.index, matrix);
    color.set(point.isReflectionDay ? "#ffffff" : SEASON_COLORS[point.seasonIndex]);
    mesh.setColorAt(point.index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function addCalendarGuides(root: THREE.Group) {
  const sunGeometry = new THREE.SphereGeometry(0.24, 48, 48);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffcf5a,
  });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  root.add(sun);

  const coronaGeometry = new THREE.SphereGeometry(0.42, 48, 48);
  const coronaMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb13b,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
  root.add(corona);

  const sunLight = new THREE.PointLight(0xffd27a, 18, 18, 1.2);
  sunLight.position.set(0, 0.08, 0);
  root.add(sunLight);

  for (let index = 0; index < 365; index += 36) {
    const angle = angleForIndex(index);
    const points = [
      new THREE.Vector3(Math.cos(angle) * 0.24, -0.18, Math.sin(angle) * 0.24),
      new THREE.Vector3(Math.cos(angle) * 4.85, -0.18, Math.sin(angle) * 4.85),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: index % 73 === 0 ? 0.34 : 0.12,
    });
    root.add(new THREE.Line(geometry, material));
  }
}

function selectionMarkerPosition(selectedIndex: number): THREE.Vector3 {
  const current = pointForIndex(selectedIndex, 4.2);
  return new THREE.Vector3(current.x, current.y + 0.12, current.z);
}

function addSelectionMarkers(root: THREE.Group, selectedIndex: number): SelectionMarkerHandles {
  const target = selectionMarkerPosition(selectedIndex);
  const spinAngle = earthRotationForIndex(selectedIndex);
  const selectedGeometry = new THREE.SphereGeometry(0.2, 48, 48);
  const selectedMaterial = new THREE.MeshStandardMaterial({
    map: createEarthSurfaceTexture(),
    color: 0xffffff,
    emissive: 0x08264a,
    emissiveIntensity: 0.16,
    roughness: 0.72,
    metalness: 0.02,
  });
  const selected = new THREE.Mesh(selectedGeometry, selectedMaterial);
  selected.position.copy(target);
  selected.rotation.set(EARTH_AXIAL_TILT_RADIANS, spinAngle, 0);
  root.add(selected);

  const haloGeometry = new THREE.TorusGeometry(0.28, 0.012, 8, 48);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.85,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.position.copy(selected.position);
  halo.rotation.x = Math.PI / 2;
  root.add(halo);

  return { selected, halo, target, targetIndex: selectedIndex, spinAngle };
}

function earthRotationForIndex(index: number): number {
  return (
    EARTH_ROTATION_OFFSET_RADIANS +
    index * EARTH_SIDEREAL_ROTATIONS_PER_SOLAR_DAY * Math.PI * 2
  );
}

function addGregorianOverlay(root: THREE.Group, cycleStartYear: number) {
  const outerRadius = 5.02;
  const segments = makeGregorianSeasonSegments(cycleStartYear);

  for (const segment of segments) {
    const points = [];
    for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
      const point = pointForIndex(index, outerRadius);
      points.push(new THREE.Vector3(point.x, 0.1, point.z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: segment.color,
      transparent: true,
      opacity: 0.62,
    });
    root.add(new THREE.Line(geometry, material));
  }

  for (const segment of segments) {
    const angle = angleForIndex(segment.startIndex);
    const tickPoints = [
      new THREE.Vector3(Math.cos(angle) * 4.72, 0.12, Math.sin(angle) * 4.72),
      new THREE.Vector3(Math.cos(angle) * 5.24, 0.12, Math.sin(angle) * 5.24),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const material = new THREE.LineBasicMaterial({
      color: segment.color,
      transparent: true,
      opacity: 0.72,
    });
    root.add(new THREE.Line(geometry, material));
  }
}

function addKrystalOverlay(root: THREE.Group, overlayMode: OverlayMode, maxStage: number) {
  if (overlayMode === "calendar") return;

  addSpiralCurve(root, maxStage, 1, 0x6effe8, KRYSTAL_OCTANT_RATIO, 4.9, 0.58);
  addSpiralCurve(root, maxStage, -1, 0xff8763, KRYSTAL_OCTANT_RATIO, 4.9, 0.58);
  addStageMarkers(root, maxStage);

  if (overlayMode === "compare") {
    addSpiralCurve(root, maxStage, 1, 0xf7ce5b, Math.sqrt(GOLDEN_QUADRANT_RATIO), 4.2, 0.3);
  }
}

function addSpiralCurve(
  root: THREE.Group,
  maxStage: number,
  direction: 1 | -1,
  color: number,
  ratioPerOctant: number,
  radiusScale: number,
  opacity: number,
) {
  const points = makeExponentialSpiralPoints({
    maxStage,
    direction,
    ratioPerOctant,
    radiusScale,
  }).map((point) => new THREE.Vector3(point.x, 0.52, point.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  root.add(new THREE.Line(geometry, material));
}

function addStageMarkers(root: THREE.Group, maxStage: number) {
  const stages = makeKrystalStages(maxStage, 1);
  const maxRadius = stages[stages.length - 1].radius;

  for (const stage of stages) {
    const angle = (stage.angleDeg * Math.PI) / 180 - Math.PI / 2;
    const radius = (stage.radius / maxRadius) * 4.9;
    const position = new THREE.Vector3(Math.cos(angle) * radius, 0.62, Math.sin(angle) * radius);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(stage.quadrant ? 0.095 : 0.062, 18, 18),
      new THREE.MeshStandardMaterial({
        color: stage.quadrant ? 0xffffff : 0x6effe8,
        emissive: stage.quadrant ? 0xffd166 : 0x15665c,
        emissiveIntensity: stage.quadrant ? 1.3 : 0.8,
      }),
    );
    marker.position.copy(position);
    root.add(marker);

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.5, 0),
      position,
    ]);
    const material = new THREE.LineBasicMaterial({
      color: stage.quadrant ? 0xffffff : 0x6effe8,
      transparent: true,
      opacity: stage.quadrant ? 0.32 : 0.13,
    });
    root.add(new THREE.Line(geometry, material));
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
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
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}
