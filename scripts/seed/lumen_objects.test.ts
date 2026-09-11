import { expect, it } from 'vitest';
import { lumenObjects } from './lumen_objects';
import { motionPose } from '../../packages/protocol/src/objectMotion';
const id = `model-${'a'.repeat(64)}`;

it('keeps the transit envelope inside the room while moving the pod along its rails', () => {
  const [pod] = lumenObjects([{ name: 'pod', position: [0, 1.215, 8], scale: [1.78, 1.58, 3] }], { pod: id });
  expect(pod.position[0]).toBe(0);expect(pod.position[1]).toBeCloseTo(1.065);expect(pod.position[2]).toBe(0);
  expect(motionPose(pod.motion, 0).offset).toEqual([0, 0, 8]);
  expect(motionPose(pod.motion, 10).offset?.[0]).toBeGreaterThan(0);
});

it('rejects components that would block a gateway and retains the water clip', () => {
  expect(() => lumenObjects([{ name: 'wall', position: [14, 1, 0], scale: [1, 2, 1] }], { wall: id })).toThrow('gateway');
  const water = lumenObjects([], {}, { modelId: id, clip: 'WaterCurrent' });
  expect(water[0].animation).toEqual({ clip: 'WaterCurrent', speed: 1, paused: false });
  expect(water[0].scale).toEqual([7, .1, 7]);
});
