import { expect, it } from 'vitest';
import { parseRoomEnvironment } from './roomEnvironment';
import { roomFog, roomLighting } from './roomLighting';

it('restores the legacy lighting when leaving a configured room', () => {
  const warm = roomLighting(parseRoomEnvironment({ preset: 'golden-hour' }));
  expect(warm.configured).toBe(true);
  expect(warm.sun).not.toBe(roomLighting().sun);
  const reset = roomLighting();
  expect(reset).toMatchObject({ configured: false, exposure: .9, ambient: .85, reflection: .45, bloom: 0, sunDirection: [-30, 70, 30] });
  expect(roomFog(reset, true, 0)).toEqual({ near: 200, far: 1200 });
});

it('derives a normalized sun direction and bounded fog from the selected preset', () => {
  const light = roomLighting(parseRoomEnvironment({ preset: 'golden-hour', sunAzimuth: 90, sunElevation: 30, haze: 1 }));
  expect(Math.hypot(...light.sunDirection)).toBeCloseTo(1);
  expect(light.sunDirection[0]).toBeCloseTo(Math.sqrt(3) / 2);
  expect(light.sunDirection[1]).toBeCloseTo(.5);
  expect(roomFog(light, true, 0)).toEqual({ near: 8, far: 120 });
  const nearby = roomFog(light, false, Math.sqrt(3) * 100);
  const distant = roomFog(light, false, Math.sqrt(3) * 100 + 80);
  expect(distant.near - nearby.near).toBeCloseTo(80);
  expect(distant.far - nearby.far).toBeCloseTo(80);
});
