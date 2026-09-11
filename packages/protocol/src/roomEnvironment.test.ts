import { describe, expect, it } from 'vitest';
import { parseRoomEnvironment } from './roomEnvironment';

describe('room environment', () => {
  it('normalizes partial presets from their defaults', () => {
    expect(parseRoomEnvironment({ preset: 'golden-hour', bloom: 0.2 })).toEqual({ preset: 'golden-hour', exposure: 0.95, haze: 0.22, bloom: 0.2, sunAzimuth: -85, sunElevation: 40 });
    expect(parseRoomEnvironment(undefined)).toBeUndefined();
  });
  it('rejects unknown, non-finite, and out-of-range values', () => {
    expect(() => parseRoomEnvironment({ glow: 1 })).toThrow('Unknown');
    expect(() => parseRoomEnvironment({ exposure: Infinity })).toThrow('finite');
    expect(() => parseRoomEnvironment({ haze: 2 })).toThrow('between');
    expect(() => parseRoomEnvironment({ preset: 'night' })).toThrow('preset');
  });
});
