import { expect, it } from 'vitest';
import * as THREE from 'three';
import { modelBounds } from './modelBounds';

it('fits static architectural sections exactly, without adding an inset or raising their floor', () => {
  const scene = new THREE.Group(); scene.userData.agarthaExactBounds = true;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(31.5, .2, 31.5), new THREE.MeshStandardMaterial());
  mesh.position.y = .1; scene.add(mesh);
  try {
    const bounds = modelBounds({ scene, animations: [] });
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(31.5);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(.2);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.x).toBeCloseTo(15.75);
  } finally { mesh.geometry.dispose(); mesh.material.dispose(); }
});

it('retains the safety margin around an animated model envelope', () => {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  mesh.name = 'moving'; scene.add(mesh);
  const clip = new THREE.AnimationClip('move', 1, [new THREE.VectorKeyframeTrack('moving.position', [0, 1], [0, 0, 0, 2, 0, 0])]);
  try {
    const bounds = modelBounds({ scene, animations: [clip] });
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(2.2);
    expect(bounds.max.x).toBeGreaterThan(2.8);
  } finally { mesh.geometry.dispose(); mesh.material.dispose(); }
});

it('preserves the historical fitting envelope for existing static assets', () => {
 const scene = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshBasicMaterial()); scene.add(mesh);
 try { expect(modelBounds({scene,animations:[]}).getSize(new THREE.Vector3()).x).toBeCloseTo(2.2); }
 finally { mesh.geometry.dispose(); mesh.material.dispose(); }
});
