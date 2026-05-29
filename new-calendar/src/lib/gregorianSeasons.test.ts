import { describe, expect, it } from "vitest";
import {
  dayOfGregorianYear,
  daysInGregorianYear,
  describeGregorianSeason,
  describeGregorianYearDay,
  makeGregorianSeasonSegments,
} from "./gregorianSeasons";

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

  it("describes gregorian year day with leap-year denominators", () => {
    expect(daysInGregorianYear(2024)).toBe(366);
    expect(daysInGregorianYear(2025)).toBe(365);
    expect(dayOfGregorianYear(new Date(2026, 11, 20))).toBe(354);
    expect(describeGregorianYearDay(new Date(2024, 1, 29))).toEqual({
      day: 60,
      daysInYear: 366,
    });
  });
});
