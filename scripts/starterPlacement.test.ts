import { expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { modelBounds } from '../packages/renderer/modelBounds';
import { assertWithinPlot } from '../packages/protocol/src/plots';
import { starterPlacement } from './seed/starterPlacement';

it('grounds a starter with the same padded fitting envelope as the real model renderer', () => {
  const scene = new Group();
  const geometry = new BoxGeometry(25.8, 8, 25.8), material = new MeshBasicMaterial();
  const model = new Mesh(geometry, material); model.position.y = 3; scene.add(model); scene.updateMatrixWorld(true);
  const raw = new Box3().setFromObject(scene);
  const objects = starterPlacement('example', 'Example', `model-${'a'.repeat(64)}`, { min: raw.min.toArray(), max: raw.max.toArray() });
  const envelope = modelBounds({ scene, animations: [] });
  const position = new Vector3(0, .1, 0).sub(envelope.getCenter(new Vector3())).divide(envelope.getSize(new Vector3()))
    .multiply(new Vector3(...objects[0].scale)).add(new Vector3(...objects[0].position));
  expect(position.y).toBeCloseTo(.1, 6);
  expect(objects).toHaveLength(5);
  for (const object of objects) expect(() => assertWithinPlot(object)).not.toThrow();
  geometry.dispose(); material.dispose();
});
