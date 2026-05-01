import { describe, expect, it } from "vitest";
import { describeGregorianSeason, makeGregorianSeasonSegments } from "./gregorianSeasons";

describe("gregorian season model", () => {
  it("maps dates into four solar seasons", () => {
    expect(describeGregorianSeason(new Date(2026, 4, 1)).season).toBe("Spring");
    expect(describeGregorianSeason(new Date(2026, 6, 1)).season).toBe("Summer");
    expect(describeGregorianSeason(new Date(2026, 9, 1)).season).toBe("Autumn");
    expect(describeGregorianSeason(new Date(2026, 0, 1)).season).toBe("Winter");
  });

  it("counts winter across the Gregorian year boundary", () => {
    const seasonDate = describeGregorianSeason(new Date(2026, 0, 1));

    expect(seasonDate.season).toBe("Winter");
    expect(seasonDate.dayOfSeason).toBe(12);
    expect(seasonDate.daysInSeason).toBe(89);
  });

  it("builds four Gregorian segments inside a New Calendar cycle", () => {
    const segments = makeGregorianSeasonSegments(2025);

    expect(segments.map((segment) => segment.season)).toEqual([
      "Winter",
      "Spring",
      "Summer",
      "Autumn",
    ]);
    expect(segments[0].startIndex).toBe(0);
    expect(segments.at(-1)?.endIndex).toBe(364);
  });
});
