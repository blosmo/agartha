import { describe, expect, it } from "vitest";
import {
  daylightPieSegment,
  makeGregorianProgressPie,
  makeNewCalendarProgressPie,
  monthTickAngleDeg,
  orbitAngleDegForIndex,
  pieSlicePath,
  SEASON_CLOCK_MONTH_ARC_DEG,
  SEASON_CLOCK_SEASON_ARC_DEG,
  SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
  yearProgressForIndex,
} from "./seasonalYearClock";
import { daylightHours } from "./sunlight";
import { DAYS_PER_SEASON, DAYS_PER_YEAR, describeNewCalendarIndex, gregorianForIndex, MONTH_NAMES } from "./newCalendar";
import { gregorianYearProgress } from "./gregorianSeasons";

describe("daylightPieSegment", () => {
  it("creates a tiny light wedge near the winter solstice", () => {
    const winterHours = daylightHours(new Date(2025, 11, 21));
    const segment = daylightPieSegment(winterHours, 0);

    expect(segment.daylightFraction).toBeCloseTo(winterHours / 24, 5);
    expect(segment.lightEndAngle - segment.lightStartAngle).toBeCloseTo(
      segment.daylightFraction * 360,
      4,
    );
    expect(segment.lightStartAngle).toBeGreaterThan(0);
    expect(segment.lightEndAngle).toBeLessThan(180);
  });

  it("creates a near 50/50 vertical split at the spring equinox", () => {
    const equinoxHours = daylightHours(new Date(2026, 2, 20));
    const segment = daylightPieSegment(equinoxHours, 0.25);

    expect(segment.daylightFraction).toBeCloseTo(0.5, 1);
    expect(segment.lightEndAngle - segment.lightStartAngle).toBeCloseTo(
      segment.daylightFraction * 360,
      1,
    );
    expect((segment.lightStartAngle + segment.lightEndAngle) / 2).toBeCloseTo(180, 0);
  });

  it("creates a mostly light pie near the summer solstice", () => {
    const summerHours = daylightHours(new Date(2026, 5, 21));
    const segment = daylightPieSegment(summerHours, 0.5);

    expect(segment.daylightFraction).toBeCloseTo(summerHours / 24, 5);
    expect(segment.lightStartAngle).toBeLessThan(180);
    expect(segment.lightEndAngle).toBeGreaterThan(180);
  });
});

describe("pieSlicePath", () => {
  it("draws a closed path for partial and full slices", () => {
    const partial = pieSlicePath(50, 50, 20, 90, 180);
    const full = pieSlicePath(50, 50, 20, 0, 360);

    expect(partial.startsWith("M 50 50")).toBe(true);
    expect(partial.endsWith("Z")).toBe(true);
    expect(full.includes("A 20 20")).toBe(true);
  });
});

describe("orbit and progress alignment", () => {
  it("maps orbit angle to the same formula as calendarGeometry.angleForIndex", () => {
    expect(orbitAngleDegForIndex(0)).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 5);
    expect(orbitAngleDegForIndex(DAYS_PER_YEAR / 4)).toBeCloseTo(0, 5);
    expect(orbitAngleDegForIndex(DAYS_PER_YEAR / 2)).toBeCloseTo(90, 5);
  });

  it("advances one season of orbit over 72 degrees", () => {
    const seasonStart = 0;
    const nextSeasonStart = DAYS_PER_SEASON;
    expect(
      orbitAngleDegForIndex(nextSeasonStart) - orbitAngleDegForIndex(seasonStart),
    ).toBeCloseTo(SEASON_CLOCK_SEASON_ARC_DEG, 5);
  });

  it("matches Progress year progress for a given index", () => {
    const index = 120;
    expect(yearProgressForIndex(index)).toBeCloseTo((index + 1) / DAYS_PER_YEAR, 8);
  });
});

describe("makeNewCalendarProgressPie", () => {
  it("derives daylight and progress from the live selected index", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const model = makeNewCalendarProgressPie(calendarDate);
    const date = gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear);

    expect(model.yearProgress).toBeCloseTo(yearProgressForIndex(calendarDate.index), 8);
    expect(model.seasonProgress).toBeCloseTo(
      calendarDate.dayOfSeason / DAYS_PER_SEASON,
      8,
    );
    expect(model.orbitAngleDeg).toBeCloseTo(orbitAngleDegForIndex(calendarDate.index), 5);
    expect(model.daylightHours).toBeCloseTo(daylightHours(date), 5);
    expect(model.pie.daylightFraction).toBeCloseTo(daylightHours(date) / 24, 5);
    expect(model.pie.lightEndAngle - model.pie.lightStartAngle).toBeCloseTo(
      model.pie.daylightFraction * 360,
      4,
    );
    expect(model.pie.daylightFraction).not.toBeCloseTo(model.seasonProgress, 1);
    expect(model.yearFillEndAngleDeg - model.yearFillStartAngleDeg).toBeCloseTo(
      model.yearProgress * 360,
      4,
    );
    expect(model.ticks).toHaveLength(10);
    expect(model.starPoints).toBe(10);
  });

  it("places month ticks at the solstice anchor with 36-degree spacing", () => {
    const calendarDate = describeNewCalendarIndex(0, 2025);
    const model = makeNewCalendarProgressPie(calendarDate);

    expect(model.ticks[0].angleDeg).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 4);
    expect(model.ticks[1].angleDeg - model.ticks[0].angleDeg).toBeCloseTo(
      SEASON_CLOCK_MONTH_ARC_DEG,
      4,
    );
    expect(model.ticks[2].angleDeg - model.ticks[0].angleDeg).toBeCloseTo(
      SEASON_CLOCK_SEASON_ARC_DEG,
      4,
    );
    expect(model.ticks.at(-1)?.angleDeg).toBeCloseTo(
      monthTickAngleDeg(MONTH_NAMES.length - 1, MONTH_NAMES.length),
      4,
    );
  });
});

describe("makeGregorianProgressPie", () => {
  it("uses gregorian year progress and season metrics", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const model = makeGregorianProgressPie(calendarDate);

    expect(model.yearProgress).toBeCloseTo(
      gregorianYearProgress(calendarDate.gregorianDate),
      8,
    );
    expect(model.orbitAngleDeg).toBeCloseTo(
      SEASON_CLOCK_SOLSTICE_ANGLE_DEG + model.yearProgress * 360,
      4,
    );
    expect(model.ticks).toHaveLength(12);
    expect(model.ticks[0].angleDeg).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 4);
    expect(model.ticks[1].angleDeg - model.ticks[0].angleDeg).toBeCloseTo(30, 4);
    expect(model.starPoints).toBe(12);
  });
});
