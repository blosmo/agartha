export interface SpiralStage {
  stage: number;
  angleDeg: number;
  radius: number;
  quadrant: boolean;
  label: string;
}

export interface SpiralPoint {
  x: number;
  y: number;
  radius: number;
  angleRad: number;
}

export const KRYSTAL_OCTANT_DEGREES = 45;
export const KRYSTAL_QUADRANT_DEGREES = 90;
export const KRYSTAL_OCTANT_RATIO = Math.SQRT2;
export const KRYSTAL_QUADRANT_RATIO = 2;
export const GOLDEN_QUADRANT_RATIO = (1 + Math.sqrt(5)) / 2;

export function krystalRadiusAtStage(stage: number): number {
  return Math.pow(KRYSTAL_OCTANT_RATIO, stage);
}

export function goldenRadiusAtQuarterStage(stage: number): number {
  return Math.pow(GOLDEN_QUADRANT_RATIO, stage / 2);
}

export function makeKrystalStages(maxStage = 12, direction: 1 | -1 = 1): SpiralStage[] {
  return Array.from({ length: maxStage + 1 }, (_, stage) => {
    const angleDeg = stage * KRYSTAL_OCTANT_DEGREES * direction;
    const radius = krystalRadiusAtStage(stage);
    return {
      stage,
      angleDeg,
      radius,
      quadrant: stage % 2 === 0,
      label: stage % 2 === 0 ? `Q${stage / 2}: x${radius}` : `O${stage}: x${roundRatio(radius)}`,
    };
  });
}

export function makeExponentialSpiralPoints(options: {
  maxStage: number;
  samplesPerStage?: number;
  direction?: 1 | -1;
  ratioPerOctant?: number;
  radiusScale?: number;
}): SpiralPoint[] {
  const {
    maxStage,
    samplesPerStage = 14,
    direction = 1,
    ratioPerOctant = KRYSTAL_OCTANT_RATIO,
    radiusScale = 1,
  } = options;
  const totalSamples = Math.max(2, Math.round(maxStage * samplesPerStage));
  const maxRadius = Math.pow(ratioPerOctant, maxStage);

  return Array.from({ length: totalSamples + 1 }, (_, i) => {
    const stage = (i / totalSamples) * maxStage;
    const radius = (Math.pow(ratioPerOctant, stage) / maxRadius) * radiusScale;
    const angleRad = direction * stage * (Math.PI / 4) - Math.PI / 2;
    return {
      x: Math.cos(angleRad) * radius,
      y: Math.sin(angleRad) * radius,
      radius,
      angleRad,
    };
  });
}

export function roundRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
