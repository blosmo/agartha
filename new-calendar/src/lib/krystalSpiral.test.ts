import { describe, expect, it } from "vitest";
import {
  KRYSTAL_OCTANT_RATIO,
  KRYSTAL_QUADRANT_RATIO,
  krystalRadiusAtStage,
  makeExponentialSpiralPoints,
  makeKrystalStages,
} from "./krystalSpiral";

describe("Krystal Spiral math", () => {
  it("expands by sqrt(2) per 45-degree octant", () => {
    expect(krystalRadiusAtStage(1)).toBeCloseTo(KRYSTAL_OCTANT_RATIO);
    expect(krystalRadiusAtStage(2)).toBeCloseTo(KRYSTAL_QUADRANT_RATIO);
    expect(krystalRadiusAtStage(4)).toBeCloseTo(4);
  });

  it("labels even stages as quadrant points", () => {
    const stages = makeKrystalStages(4);

    expect(stages[0].quadrant).toBe(true);
    expect(stages[1].quadrant).toBe(false);
    expect(stages[2].quadrant).toBe(true);
    expect(stages[4].radius).toBeCloseTo(4);
  });

  it("builds mirrored exponential spiral point sets", () => {
    const clockwise = makeExponentialSpiralPoints({ maxStage: 4, direction: 1 });
    const counter = makeExponentialSpiralPoints({ maxStage: 4, direction: -1 });

    expect(clockwise).toHaveLength(counter.length);
    expect(clockwise[0].x).toBeCloseTo(counter[0].x);
    expect(clockwise.at(-1)?.radius).toBeCloseTo(counter.at(-1)?.radius ?? 0);
  });
});
