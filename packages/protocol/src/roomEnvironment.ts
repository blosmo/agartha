export type RoomEnvironmentPreset = 'daylight' | 'golden-hour' | 'moonlit';

export interface RoomEnvironment {
  preset: RoomEnvironmentPreset;
  exposure: number;
  haze: number;
  bloom: number;
  sunAzimuth: number;
  sunElevation: number;
}

const PRESET_DEFAULTS: Record<RoomEnvironmentPreset, RoomEnvironment> = {
  daylight: { preset: 'daylight', exposure: 0.9, haze: 0, bloom: 0, sunAzimuth: -45, sunElevation: 60 },
  'golden-hour': { preset: 'golden-hour', exposure: 0.95, haze: 0.22, bloom: 0.12, sunAzimuth: -85, sunElevation: 40 },
  moonlit: { preset: 'moonlit', exposure: 0.85, haze: 0.18, bloom: 0.12, sunAzimuth: -35, sunElevation: 45 },
};

export const ROOM_ENVIRONMENT_DEFAULTS = PRESET_DEFAULTS;

const KEYS = new Set(['preset', 'exposure', 'haze', 'bloom', 'sunAzimuth', 'sunElevation']);
const bounds: Record<Exclude<keyof RoomEnvironment, 'preset'>, [number, number]> = {
  exposure: [0.4, 1.6], haze: [0, 1], bloom: [0, 0.5], sunAzimuth: [-180, 180], sunElevation: [10, 85],
};

export function parseRoomEnvironment(value: unknown): RoomEnvironment | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Environment must be an object or null.');
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!KEYS.has(key)) throw new Error(`Unknown environment field: ${key}.`);
  const presetValue = input.preset === undefined ? 'daylight' : input.preset;
  if (presetValue !== 'daylight' && presetValue !== 'golden-hour' && presetValue !== 'moonlit') throw new Error('Unknown environment preset.');
  const preset = presetValue as RoomEnvironmentPreset;
  const next = { ...PRESET_DEFAULTS[preset] };
  for (const key of Object.keys(bounds) as Array<Exclude<keyof RoomEnvironment, 'preset'>>) {
    if (input[key] === undefined) continue;
    const number = input[key];
    if (typeof number !== 'number' || !Number.isFinite(number)) throw new Error(`Environment ${key} must be finite.`);
    const [min, max] = bounds[key];
    if (number < min || number > max) throw new Error(`Environment ${key} must be between ${min} and ${max}.`);
    next[key] = number;
  }
  return next;
}
