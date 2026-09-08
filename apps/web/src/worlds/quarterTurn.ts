export const TURN_DURATION_MS = 250;

// cubic-bezier(0.77, 0, 0.175, 1), the shared animate skill's on-screen movement curve.
export function turnEase(progress: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const coordinate = (t: number, a: number, b: number) => 3 * (1-t) ** 2 * t * a + 3 * (1-t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 20; i++) {
    const t = (low + high) / 2;
    if (coordinate(t, .77, .175) < progress) low = t; else high = t;
  }
  return coordinate((low + high) / 2, 0, 1);
}

/** Repeated taps retarget from the displayed angle, never restart from a previous pose. */
export class QuarterTurn {
  value = 0;
  target = 0;
  private from = 0;
  private started = 0;
  get active() { return this.value !== this.target; }
  rotate(now: number, immediate: boolean) {
    this.from = this.value;
    this.target += Math.PI / 2;
    this.started = now;
    if (immediate) this.finish();
  }
  sample(now: number) {
    const progress = Math.min(1, Math.max(0, (now - this.started) / TURN_DURATION_MS));
    this.value = progress === 1 ? this.target : this.from + (this.target - this.from) * turnEase(progress);
    return this.value;
  }
  finish() { this.value = this.target; this.from = this.target; }
  reset() { this.value = this.target = this.from = 0; }
}
