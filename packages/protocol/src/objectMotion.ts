/** Bounded, declarative motion. No scripts or per-frame writes are needed. */
export type ObjectMotion =
  | { kind: 'float'; speed: number; amplitude: number; phase: number }
  | { kind: 'spin'; speed: number; phase: number }
  | { kind: 'path'; points: number[][]; mode: 'loop' | 'pingpong'; speed: number; phase: number; orient: boolean };

export function parseObjectMotion(value: unknown): ObjectMotion | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object motion definition.');
  const input = value as Record<string, unknown>;
  if (input.kind !== 'float' && input.kind !== 'spin' && input.kind !== 'path') throw new Error('Motion kind must be float, spin or path.');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = input[key] ?? fallback;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`Motion ${key} must be between ${min} and ${max}.`);
    return n;
  };
  const speed = number('speed', .6, .05, input.kind === 'path' ? 5 : 2), phase = number('phase', 0, 0, Math.PI * 2);
  if (input.kind === 'spin') return { kind: 'spin', speed, phase };
  if (input.kind === 'path') {
    if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > 32) throw new Error('Path motion needs 2–32 points.');
    const points: [number, number, number][] = [];
    for (const point of input.points) {
      if (!Array.isArray(point) || point.length !== 3 || !point.every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('Path points must be finite XYZ coordinates.');
      const p = point as [number, number, number];
      if (Math.abs(p[0]) > 24 || Math.abs(p[1]) > 8 || Math.abs(p[2]) > 24) throw new Error('Path points exceed the bounded relative path area.');
      if (!points.length || p.some((n, i) => n !== points[points.length - 1][i])) points.push([...p]);
    }
    if (points.length < 2) throw new Error('Path motion needs non-zero total length.');
    const mode = input.mode ?? 'loop';
    if (mode !== 'loop' && mode !== 'pingpong') throw new Error('Path mode must be loop or pingpong.');
    if (input.orient !== undefined && typeof input.orient !== 'boolean') throw new Error('Path orient must be a boolean.');
    return { kind: 'path', points, mode, speed, phase, orient: input.orient ?? true };
  }
  return { kind: 'float', speed, phase, amplitude: number('amplitude', .6, .1, 2) };
}

export function motionPose(motion: ObjectMotion | undefined, seconds: number, yaw = 0) {
  if (!motion) return { lift: 0, yaw };
  if (motion.kind === 'path') {
    const edgeCount = motion.mode === 'loop' ? motion.points.length : motion.points.length - 1;
    const segments = Array.from({ length: edgeCount }, (_, i) => {
      const from = motion.points[i], to = motion.points[(i + 1) % motion.points.length];
      return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    });
    const length = segments.reduce((sum, value) => sum + value, 0);
    if (!(length > 0) || !Number.isFinite(seconds)) throw new Error('Path motion has no usable length or time.');
    const cycle = motion.mode === 'pingpong' ? length * 2 : length;
    let distance = (cycle * motion.phase / (Math.PI * 2) + seconds * motion.speed) % cycle;
    if (distance < 0) distance += cycle;
    const reverse = motion.mode === 'pingpong' && distance > length;
    if (reverse) distance = cycle - distance;
    let travelled = 0, segment = 0;
    while (segment < segments.length - 1 && travelled + segments[segment] < distance) { travelled += segments[segment]; segment++; }
    const from = motion.points[segment], to = motion.points[(segment + 1) % motion.points.length];
    const segmentLength = segments[segment];
    const t = segmentLength > 0 ? (distance - travelled) / segmentLength : 0;
    const offset: [number, number, number] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
    const direction = reverse ? -1 : 1;
    const dx = (to[0] - from[0]) * direction, dz = (to[2] - from[2]) * direction;
    return { lift: offset[1], yaw: motion.orient && (dx !== 0 || dz !== 0) ? yaw + Math.atan2(dx, dz) : yaw, offset };
  }
  const angle = seconds * motion.speed + motion.phase;
  return motion.kind === 'float' ? { lift: Math.sin(angle) * motion.amplitude, yaw } : { lift: 0, yaw: yaw + angle };
}

/** Bounds of the full motion cycle, not just the authored pose. */
export function motionExtents(scale: readonly number[], yaw = 0, motion?: ObjectMotion): [number, number, number] {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const radius = Math.hypot(scale[0], scale[2]) / 2;
  const base: [number, number, number] = [motion?.kind === 'spin' ? radius : (c * scale[0] + s * scale[2]) / 2, scale[1] / 2 + (motion?.kind === 'float' ? motion.amplitude : 0), motion?.kind === 'spin' ? radius : (s * scale[0] + c * scale[2]) / 2];
  if (motion?.kind === 'path') {
    const max = [0, 0, 0];
    for (const point of motion.points) for (const axis of [0, 1, 2]) max[axis] = Math.max(max[axis], Math.abs(point[axis]));
    if (motion.orient) return [max[0] + radius, base[1] + max[1], max[2] + radius];
    return [base[0] + max[0], base[1] + max[1], base[2] + max[2]];
  }
  return base;
}
