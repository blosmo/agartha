import { describe, expect, it } from "vitest";
import {
  daylightPieSegment,
  DAYLIGHT_PIE_ANCHOR_ANGLE_DEG,
  GREGORIAN_CLOCK_YEAR_SEGMENT_ARC_DEG,
  indexFromClockPointer,
  makeGregorianProgressPie,
  makeNewCalendarProgressPie,
  monthTickAngleDeg,
  orbitAngleDegForIndex,
  orbitAngleDegFromPointer,
  pieSlicePath,
  pointerYearProgress,
  seasonClockLayout,
  SEASON_CLOCK_MONTH_ARC_DEG,
  SEASON_CLOCK_SEASON_ARC_DEG,
  SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
  SEASON_CLOCK_YEAR_SEGMENT_ARC_DEG,
  yearProgressForIndex,
  yearProgressEndAngleDeg,
  yearProgressFromOrbitAngleDeg,
  yearRingFilledSegments,
  yearRingSegments,
  newCalendarSeasonProgressFromYearProgress,
  gregorianSeasonProgressFromYearProgress,
  seasonProgressFromYearProgress,
} from "./seasonalYearClock";
import { daylightHours } from "./sunlight";
import { DAYS_PER_SEASON, DAYS_PER_YEAR, describeNewCalendarIndex, gregorianForIndex, MONTH_NAMES } from "./newCalendar";
import { gregorianYearProgress, GREGORIAN_SEASON_COLORS } from "./gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";

describe("daylightPieSegment", () => {
  it("anchors the wedge at 6 o'clock and grows clockwise with daylight", () => {
    const winterHours = daylightHours(new Date(2025, 11, 21));
    const segment = daylightPieSegment(winterHours);

    expect(segment.lightStartAngle).toBe(DAYLIGHT_PIE_ANCHOR_ANGLE_DEG);
    expect(segment.daylightFraction).toBeCloseTo(winterHours / 24, 5);
    expect(segment.lightEndAngle - segment.lightStartAngle).toBeCloseTo(
      segment.daylightFraction * 360,
      4,
    );
    expect(segment.lightEndAngle).toBeGreaterThan(DAYLIGHT_PIE_ANCHOR_ANGLE_DEG);
  });

  it("reaches halfway around the disk near the equinox", () => {
    const equinoxHours = daylightHours(new Date(2026, 2, 20));
    const segment = daylightPieSegment(equinoxHours);

    expect(segment.lightStartAngle).toBe(DAYLIGHT_PIE_ANCHOR_ANGLE_DEG);
    expect(segment.daylightFraction).toBeCloseTo(0.5, 1);
    expect(segment.lightEndAngle - segment.lightStartAngle).toBeCloseTo(
      segment.daylightFraction * 360,
      1,
    );
    expect(segment.lightEndAngle).toBeCloseTo(
      DAYLIGHT_PIE_ANCHOR_ANGLE_DEG + segment.daylightFraction * 360,
      1,
    );
  });

  it("wraps past the top at the summer solstice", () => {
    const summerHours = daylightHours(new Date(2026, 5, 21));
    const segment = daylightPieSegment(summerHours);

    expect(segment.lightStartAngle).toBe(DAYLIGHT_PIE_ANCHOR_ANGLE_DEG);
    expect(segment.daylightFraction).toBeCloseTo(summerHours / 24, 5);
    expect(segment.lightEndAngle - segment.lightStartAngle).toBeCloseTo(
      segment.daylightFraction * 360,
      4,
    );
    expect(segment.lightEndAngle).toBeGreaterThan(270);
  });

  it("keeps the same anchor regardless of year phase", () => {
    const hours = 12;
    const winter = daylightPieSegment(hours);
    const summer = daylightPieSegment(hours);

    expect(winter.lightStartAngle).toBe(summer.lightStartAngle);
    expect(winter.lightEndAngle).toBe(summer.lightEndAngle);
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

describe("yearRingSegments", () => {
  it("creates five equal New Calendar segments from the solstice anchor", () => {
    const segments = yearRingSegments(SEASON_COLORS, SEASON_CLOCK_YEAR_SEGMENT_ARC_DEG);

    expect(segments).toHaveLength(5);
    expect(segments[0].startAngleDeg).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 5);
    expect(segments[0].endAngleDeg - segments[0].startAngleDeg).toBeCloseTo(72, 5);
    expect(segments[4].endAngleDeg - segments[0].startAngleDeg).toBeCloseTo(360, 5);
    expect(segments.map((segment) => segment.color)).toEqual([...SEASON_COLORS]);
  });

  it("creates four equal Gregorian segments from the solstice anchor", () => {
    const segments = yearRingSegments(
      GREGORIAN_SEASON_COLORS,
      GREGORIAN_CLOCK_YEAR_SEGMENT_ARC_DEG,
    );

    expect(segments).toHaveLength(4);
    expect(segments[0].startAngleDeg).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 5);
    expect(segments[0].endAngleDeg - segments[0].startAngleDeg).toBeCloseTo(90, 5);
    expect(segments[3].endAngleDeg - segments[0].startAngleDeg).toBeCloseTo(360, 5);
  });
});

describe("yearRingFilledSegments", () => {
  const zones = yearRingSegments(SEASON_COLORS, SEASON_CLOCK_YEAR_SEGMENT_ARC_DEG);

  it("fills only a sliver of winter on day 0", () => {
    const progress = yearProgressForIndex(0);
    const filled = yearRingFilledSegments(zones, progress);

    expect(filled).toHaveLength(1);
    expect(filled[0].seasonIndex).toBe(0);
    expect(filled[0].color).toBe(SEASON_COLORS[0]);
    expect(filled[0].startAngleDeg).toBeCloseTo(SEASON_CLOCK_SOLSTICE_ANGLE_DEG, 5);
    expect(filled[0].endAngleDeg).toBeCloseTo(yearProgressEndAngleDeg(progress), 5);
    expect(filled[0].endAngleDeg - filled[0].startAngleDeg).toBeLessThan(2);
  });

  it("keeps winter partial through mid-winter", () => {
    const midWinterIndex = Math.floor(DAYS_PER_SEASON / 2);
    const progress = yearProgressForIndex(midWinterIndex);
    const filled = yearRingFilledSegments(zones, progress);

    expect(filled).toHaveLength(1);
    expect(filled[0].seasonIndex).toBe(0);
    expect(filled[0].endAngleDeg).toBeCloseTo(yearProgressEndAngleDeg(progress), 5);
    expect(filled[0].endAngleDeg).toBeLessThan(zones[0].endAngleDeg);
  });

  it("finishes winter and begins spring at the spring equinox", () => {
    const lastWinterIndex = DAYS_PER_SEASON - 1;
    const springStartIndex = DAYS_PER_SEASON;
    const winterEnd = yearRingFilledSegments(zones, yearProgressForIndex(lastWinterIndex));
    const springStart = yearRingFilledSegments(zones, yearProgressForIndex(springStartIndex));

    expect(winterEnd[0].endAngleDeg).toBeCloseTo(zones[0].endAngleDeg, 5);
    expect(springStart).toHaveLength(2);
    expect(springStart[1].seasonIndex).toBe(1);
    expect(springStart[1].endAngleDeg).toBeLessThan(zones[1].endAngleDeg);
  });

  it("stacks winter, spring, and partial summer at the summer season boundary", () => {
    const summerIndex = DAYS_PER_SEASON * 2;
    const progress = yearProgressForIndex(summerIndex);
    const filled = yearRingFilledSegments(zones, progress);

    expect(filled).toHaveLength(3);
    expect(filled[0].endAngleDeg).toBeCloseTo(zones[0].endAngleDeg, 5);
    expect(filled[1].endAngleDeg).toBeCloseTo(zones[1].endAngleDeg, 5);
    expect(filled[2].seasonIndex).toBe(2);
    expect(filled[2].endAngleDeg).toBeCloseTo(yearProgressEndAngleDeg(progress), 5);
    expect(filled[2].endAngleDeg).toBeLessThan(zones[2].endAngleDeg);
  });

  it("fills about half the ring at mid-year", () => {
    const midYearIndex = Math.floor(DAYS_PER_YEAR / 2);
    const progress = yearProgressForIndex(midYearIndex);
    const filled = yearRingFilledSegments(zones, progress);

    const filledSpan = filled.reduce(
      (total, segment) => total + (segment.endAngleDeg - segment.startAngleDeg),
      0,
    );

    expect(filledSpan).toBeCloseTo(progress * 360, 1);
    expect(filled.length).toBeGreaterThanOrEqual(2);
    expect(filled.length).toBeLessThan(5);
  });

  it("fills nearly the entire ring on the last day", () => {
    const progress = yearProgressForIndex(DAYS_PER_YEAR - 1);
    const filled = yearRingFilledSegments(zones, progress);

    expect(filled).toHaveLength(5);
    expect(filled[0].startAngleDeg).toBeCloseTo(zones[0].startAngleDeg, 5);
    expect(filled[4].endAngleDeg).toBeCloseTo(yearProgressEndAngleDeg(progress), 5);
    expect(filled[4].endAngleDeg - filled[4].startAngleDeg).toBeGreaterThan(60);
  });

  it("maps orbit angle back to normalized year progress", () => {
    expect(yearProgressFromOrbitAngleDeg(SEASON_CLOCK_SOLSTICE_ANGLE_DEG)).toBeCloseTo(0, 5);
    expect(yearProgressFromOrbitAngleDeg(0)).toBeCloseTo(0.25, 5);
    expect(yearProgressFromOrbitAngleDeg(90)).toBeCloseTo(0.5, 5);
  });

  it("derives continuous New Calendar season progress from year progress", () => {
    const index = 120;
    const calendarDate = describeNewCalendarIndex(index, 2025);
    const pointerYearProgress = yearProgressFromOrbitAngleDeg(orbitAngleDegForIndex(index));
    expect(newCalendarSeasonProgressFromYearProgress(pointerYearProgress)).toBeCloseTo(
      calendarDate.dayOfSeason / DAYS_PER_SEASON,
      5,
    );

    const midSeasonProgress = 0.41;
    const liveSeason = newCalendarSeasonProgressFromYearProgress(midSeasonProgress);
    const committedSeason = newCalendarSeasonProgressFromYearProgress(
      yearProgressFromOrbitAngleDeg(
        orbitAngleDegForIndex(Math.round(midSeasonProgress * (DAYS_PER_YEAR - 1))),
      ),
    );
    expect(liveSeason).not.toBeCloseTo(committedSeason, 2);
  });

  it("clips four Gregorian zones the same way", () => {
    const gregZones = yearRingSegments(
      GREGORIAN_SEASON_COLORS,
      GREGORIAN_CLOCK_YEAR_SEGMENT_ARC_DEG,
    );
    const progress = 0.35;
    const filled = yearRingFilledSegments(gregZones, progress);

    expect(filled[0].color).toBe(GREGORIAN_SEASON_COLORS[0]);
    expect(filled.at(-1)?.endAngleDeg).toBeCloseTo(yearProgressEndAngleDeg(progress), 5);
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
    expect(model.yearRingSegments).toHaveLength(5);
    expect(model.yearRingSegments[0].color).toBe(SEASON_COLORS[0]);
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

const fullSvgRect = {
  left: 0,
  top: 0,
  width: seasonClockLayout.size,
  height: seasonClockLayout.size,
};

function clientPointForProgress(progress: number): { clientX: number; clientY: number } {
  const { size, center, orbitRadius } = seasonClockLayout;
  const angle = progress * Math.PI * 2 - Math.PI / 2;
  const x = center + Math.cos(angle) * orbitRadius;
  const y = center + Math.sin(angle) * orbitRadius;
  return { clientX: x, clientY: y };
}

describe("pointer scrub mapping", () => {
  it("maps the winter solstice anchor to index 0", () => {
    const { clientX, clientY } = clientPointForProgress(0);
    expect(pointerYearProgress(clientX, clientY, fullSvgRect)).toBeCloseTo(0, 5);
    expect(indexFromClockPointer(clientX, clientY, fullSvgRect, 0)).toBe(0);
    expect(orbitAngleDegFromPointer(clientX, clientY, fullSvgRect)).toBeCloseTo(
      SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
      4,
    );
  });

  it("maps quarter-year angles without wrap jumps", () => {
    const quarter = clientPointForProgress(0.25);
    const threeQuarter = clientPointForProgress(0.75);

    expect(indexFromClockPointer(quarter.clientX, quarter.clientY, fullSvgRect, 0)).toBe(
      Math.round(0.25 * (DAYS_PER_YEAR - 1)),
    );
    expect(
      indexFromClockPointer(threeQuarter.clientX, threeQuarter.clientY, fullSvgRect, 0),
    ).toBe(Math.round(0.75 * (DAYS_PER_YEAR - 1)));
    expect(orbitAngleDegFromPointer(quarter.clientX, quarter.clientY, fullSvgRect)).toBeCloseTo(
      0.25 * 360 + SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
      3,
    );
  });

  it("uses year scrub on the orbit ring even over the inner pie", () => {
    const { center } = seasonClockLayout;
    const progress = 0.4;
    const angle = progress * Math.PI * 2 - Math.PI / 2;
    const innerRadius = seasonClockLayout.orbitRadius * 0.68;
    const clientX = center + Math.cos(angle) * innerRadius;
    const clientY = center + Math.sin(angle) * innerRadius;

    expect(
      indexFromClockPointer(clientX, clientY, fullSvgRect, 2, { yearScrub: true }),
    ).toBe(Math.round(progress * (DAYS_PER_YEAR - 1)));
    expect(indexFromClockPointer(clientX, clientY, fullSvgRect, 2)).toBe(
      2 * DAYS_PER_SEASON + Math.round(progress * (DAYS_PER_SEASON - 1)),
    );
  });

  it("keeps pointer progress continuous just before and after the year wrap", () => {
    const nearEnd = clientPointForProgress(0.999);
    const nearStart = clientPointForProgress(0.001);

    expect(pointerYearProgress(nearEnd.clientX, nearEnd.clientY, fullSvgRect)).toBeCloseTo(
      0.999,
      3,
    );
    expect(pointerYearProgress(nearStart.clientX, nearStart.clientY, fullSvgRect)).toBeCloseTo(
      0.001,
      3,
    );
    expect(indexFromClockPointer(nearEnd.clientX, nearEnd.clientY, fullSvgRect, 0)).toBe(
      DAYS_PER_YEAR - 1,
    );
    expect(indexFromClockPointer(nearStart.clientX, nearStart.clientY, fullSvgRect, 0)).toBe(0);
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
    expect(model.yearRingSegments).toHaveLength(4);
    expect(model.yearRingSegments[0].color).toBe(GREGORIAN_SEASON_COLORS[0]);
  });

  it("derives continuous Gregorian season progress from year progress", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const yearProgress = gregorianYearProgress(calendarDate.gregorianDate);
    expect(
      gregorianSeasonProgressFromYearProgress(calendarDate.gregorianDate, yearProgress),
    ).toBeCloseTo(makeGregorianProgressPie(calendarDate).seasonProgress, 4);

    const liveProgress = gregorianSeasonProgressFromYearProgress(
      calendarDate.gregorianDate,
      yearProgress + 0.002,
    );
    expect(liveProgress).toBeGreaterThan(0);
    expect(liveProgress).toBeLessThanOrEqual(1);
  });

  it("routes season progress by clock system", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const yearProgress = 0.41;
    expect(
      seasonProgressFromYearProgress("new", yearProgress, calendarDate.gregorianDate),
    ).toBeCloseTo(newCalendarSeasonProgressFromYearProgress(yearProgress), 8);
    expect(
      seasonProgressFromYearProgress(
        "gregorian",
        gregorianYearProgress(calendarDate.gregorianDate),
        calendarDate.gregorianDate,
      ),
    ).toBeCloseTo(makeGregorianProgressPie(calendarDate).seasonProgress, 4);
  });
});
