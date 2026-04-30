import { describe, expect, it } from "vitest";
import {
  DAYS_PER_YEAR,
  PREFERRED_LEAP_INDEX,
  describeGregorianDate,
  describeNewCalendarIndex,
  normalDayIndexFromDate,
} from "./newCalendar";

describe("New Calendar model", () => {
  it("anchors winter to the winter solstice", () => {
    const date = describeGregorianDate(new Date(2025, 11, 21));

    expect(date.index).toBe(0);
    expect(date.season).toBe("Winter");
    expect(date.dayOfSeason).toBe(1);
    expect(date.dayOfMonth).toBe(1);
  });

  it("keeps Sherman season boundaries in 73-day units", () => {
    expect(describeGregorianDate(new Date(2026, 2, 3)).season).toBe("Winter");
    expect(describeGregorianDate(new Date(2026, 2, 4)).season).toBe("Spring");
    expect(describeGregorianDate(new Date(2026, 4, 16)).season).toBe("Summer");
    expect(describeGregorianDate(new Date(2026, 6, 28)).season).toBe("Autumn");
    expect(describeGregorianDate(new Date(2026, 9, 9)).season).toBe("Fall");
  });

  it("marks each season midpoint as a reflection day outside normal months", () => {
    const date = describeNewCalendarIndex(36, 2025);

    expect(date.isReflectionDay).toBe(true);
    expect(date.monthIndex).toBeNull();
    expect(date.dayOfMonth).toBeNull();
    expect(date.planetaryDay).toBeNull();
  });

  it("maps reusable day indices across the normal 365-position structure", () => {
    expect(describeNewCalendarIndex(0, 2025).dayOfSeason).toBe(1);
    expect(describeNewCalendarIndex(DAYS_PER_YEAR - 1, 2025).season).toBe("Fall");
    expect(normalDayIndexFromDate(new Date(2025, 11, 21))).toBe(0);
  });

  it("keeps the preferred leap marker out of ordinary month days", () => {
    const date = describeNewCalendarIndex(PREFERRED_LEAP_INDEX, 2025);

    expect(date.isLeapDay).toBe(true);
    expect(date.isReflectionDay).toBe(true);
  });
});
