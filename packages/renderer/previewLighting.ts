import type { RoomEnvironment } from '../protocol/src/roomEnvironment';
import { roomFog, roomLighting } from '../protocol/src/roomLighting';

function linearRgb(hex: string) {
  return [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
}

/** Preset and exposure parity, without claiming browser shadows, reflection probes or bloom. */
export function previewLighting(position: ArrayLike<number>, environment?: RoomEnvironment) {
  const light = roomLighting(environment);
  const fog = roomFog(light, false, Math.hypot(...Array.from(position)));
  return {
    sunDirection: light.sunDirection,
    direct: light.sunIntensity / 3,
    sunColor: linearRgb(light.sun),
    ambient: light.ambient / .85,
    ambientColor: linearRgb(light.sky),
    exposure: light.exposure / .9,
    fogColor: linearRgb(light.horizon),
    near: fog.near,
    position: Array.from(position),
    far: fog.far,
    configured: light.configured ? 1 : 0,
    reflection: light.reflection / .45,
  };
}
