import { parseRoomEnvironment, type RoomEnvironment } from './roomEnvironment';

/** Shared art direction. The PNG renderer approximates the browser's light transport. */
const palettes = {
  daylight: {
    sun: '#fff1d6', sunIntensity: 3, sky: '#e5efff', ground: '#71644f', ambient: .85,
    reflection: .45, zenith: '#789fb9', horizon: '#dee8df', nadir: '#9fb9b8',
  },
  'golden-hour': {
    sun: '#ffd5a5', sunIntensity: 3.2, sky: '#b5c9e2', ground: '#8a704e', ambient: .6,
    reflection: .4, zenith: '#6f94ab', horizon: '#dbcbb2', nadir: '#8d998c',
  },
  moonlit: {
    sun: '#aec9ff', sunIntensity: .8, sky: '#7898c9', ground: '#333441', ambient: .38,
    reflection: .22, zenith: '#101c35', horizon: '#46546b', nadir: '#283343',
  },
} as const;

export function roomLighting(value?: RoomEnvironment) {
  const environment = parseRoomEnvironment(value);
  const palette = palettes[environment?.preset ?? 'daylight'];
  if (!environment) return { ...palette, configured: false, exposure: .9, haze: 0, bloom: 0, sunDirection: [-30, 70, 30] as [number, number, number] };
  const azimuth = environment.sunAzimuth * Math.PI / 180;
  const elevation = environment.sunElevation * Math.PI / 180;
  return {
    ...palette, configured: true, exposure: environment.exposure, haze: environment.haze, bloom: environment.bloom,
    sunDirection: [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)] as [number, number, number],
  };
}

export function roomFog(lighting: ReturnType<typeof roomLighting>, inside: boolean, cameraDistance: number) {
  const shift = inside ? 0 : Math.max(0, cameraDistance - Math.sqrt(3) * 100);
  if (!lighting.configured) return { near: 200 + shift, far: 1200 + shift };
  return inside
    ? { near: 32 - lighting.haze * 24, far: 400 - lighting.haze * 280 }
    : { near: 160 - lighting.haze * 120 + shift, far: 700 - lighting.haze * 550 + shift };
}
