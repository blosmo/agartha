import { describe, expect, it } from "vitest";
import { daylightHours, makeSunlightSeries } from "./sunlight";

describe("sunlight model", () => {
  it("creates five season series with 73 points each", () => {
    const series = makeSunlightSeries(2025);

    expect(series).toHaveLength(5);
    expect(series.every((season) => season.points.length === 73)).toBe(true);
  });

  it("estimates Washington D.C. summer as longer than winter", () => {
    const winter = daylightHours(new Date(2025, 11, 21));
    const summer = daylightHours(new Date(2026, 5, 21));

    expect(summer).toBeGreaterThan(14);
    expect(winter).toBeLessThan(10);
  });
});
