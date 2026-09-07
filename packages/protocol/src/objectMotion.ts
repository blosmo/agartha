/** Bounded, declarative motion. No scripts or per-frame writes are needed. */
export type ObjectMotion =
  | { kind: 'float'; speed: number; amplitude: number; phase: number }
  | { kind: 'spin'; speed: number; phase: number };

export function parseObjectMotion(value: unknown): ObjectMotion | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object motion definition.');
  const input = value as Record<string, unknown>;
  if (input.kind !== 'float' && input.kind !== 'spin') throw new Error('Motion kind must be float or spin.');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = input[key] ?? fallback;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`Motion ${key} must be between ${min} and ${max}.`);
    return n;
  };
  const speed = number('speed', .6, .05, 2), phase = number('phase', 0, 0, Math.PI * 2);
  if (input.kind === 'spin') return { kind: 'spin', speed, phase };
  return { kind: 'float', speed, phase, amplitude: number('amplitude', .6, .1, 2) };
}

export function motionPose(motion: ObjectMotion | undefined, seconds: number, yaw = 0) {
  if (!motion) return { lift: 0, yaw };
  const angle = seconds * motion.speed + motion.phase;
  return motion.kind === 'float' ? { lift: Math.sin(angle) * motion.amplitude, yaw } : { lift: 0, yaw: yaw + angle };
}

/** Bounds of the full motion cycle, not just the authored pose. */
export function motionExtents(scale: readonly number[], yaw = 0, motion?: ObjectMotion): [number, number, number] {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const radius = Math.hypot(scale[0], scale[2]) / 2;
  return [
    motion?.kind === 'spin' ? radius : (c * scale[0] + s * scale[2]) / 2,
    scale[1] / 2 + (motion?.kind === 'float' ? motion.amplitude : 0),
    motion?.kind === 'spin' ? radius : (s * scale[0] + c * scale[2]) / 2,
  ];
}
