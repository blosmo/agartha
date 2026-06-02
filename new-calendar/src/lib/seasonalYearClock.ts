import {
  DAYS_PER_MONTH,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  MONTH_NAMES,
  REFLECTION_DAY_IN_SEASON,
  gregorianForIndex,
  type NewCalendarDate,
} from "./newCalendar";
import {
  daysInGregorianYear,
  describeGregorianSeason,
  GREGORIAN_SEASON_COLORS,
  gregorianYearProgress,
} from "./gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";
import { daylightHours } from "./sunlight";

export type SeasonClockSystem = "new" | "gregorian";

export interface DaylightPieSegment {
  lightStartAngle: number;
  lightEndAngle: number;
  daylightFraction: number;
  daylightHours: number;
}

export interface SeasonClockTick {
  angleDeg: number;
  label: string;
}

export interface YearRingSegment {
  seasonIndex: number;
  startAngleDeg: number;
  endAngleDeg: number;
  color: string;
}

export interface SeasonProgressPieModel {
  yearProgress: number;
  seasonProgress: number;
  seasonName: string;
  daylightHours: number;
  pie: DaylightPieSegment;
  orbitAngleDeg: number;
  yearRingSegments: YearRingSegment[];
  ticks: SeasonClockTick[];
  starPoints: number;
}

export const seasonClockLayout = {
  size: 246,
  center: 123,
  orbitRadius: 96,
  pieRadius: 68,
  yearFillInnerRadius: 68,
  yearFillOuterRadius: 92,
  starOuterRadius: 15,
  starInnerRadius: 6.5,
};

/** Winter solstice / year start at the top of the orbit ring (−90° in SVG polar coords). */
export const SEASON_CLOCK_SOLSTICE_ANGLE_DEG = -90;

/** Idealized month arc: two adjacent ticks span one season (72°). */
export const SEASON_CLOCK_MONTH_ARC_DEG = 36;
export const SEASON_CLOCK_SEASON_ARC_DEG = SEASON_CLOCK_MONTH_ARC_DEG * 2;

/** Equal visual arcs for the year ring (five New Calendar seasons). */
export const SEASON_CLOCK_YEAR_SEGMENT_ARC_DEG = 360 / 5;

/** Equal visual arcs for the Gregorian year ring (four astronomical seasons). */
export const GREGORIAN_CLOCK_YEAR_SEGMENT_ARC_DEG = 360 / 4;

/** Orbit angle in degrees, matching `angleForIndex` in calendarGeometry. */
export function orbitAngleDegForIndex(index: number): number {
  return (index / DAYS_PER_YEAR) * 360 + SEASON_CLOCK_SOLSTICE_ANGLE_DEG;
}

/** Month boundary tick on the orbit ring, evenly spaced from the solstice anchor. */
export function monthTickAngleDeg(monthIndex: number, monthCount: number): number {
  return SEASON_CLOCK_SOLSTICE_ANGLE_DEG + monthIndex * (360 / monthCount);
}

/** Year progress aligned with Progress rings: (index + 1) / year length. */
export function yearProgressForIndex(index: number): number {
  return (index + 1) / DAYS_PER_YEAR;
}

/** Fixed annular segments around the year ring, starting at the solstice anchor. */
export function yearRingSegments(
  colors: readonly string[],
  segmentArcDeg: number,
  startAngleDeg = SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
): YearRingSegment[] {
  return colors.map((color, seasonIndex) => ({
    seasonIndex,
    startAngleDeg: startAngleDeg + seasonIndex * segmentArcDeg,
    endAngleDeg: startAngleDeg + (seasonIndex + 1) * segmentArcDeg,
    color,
  }));
}

/** Clockwise year-progress boundary in degrees (solstice + progress × 360°). */
export function yearProgressEndAngleDeg(
  yearProgress: number,
  startAngleDeg = SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
): number {
  return startAngleDeg + clamp(yearProgress, 0, 1) * 360;
}

/** Normalized year progress [0, 1] from an orbit angle in degrees. */
export function yearProgressFromOrbitAngleDeg(
  orbitAngleDeg: number,
  startAngleDeg = SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
): number {
  const span = normalizeAngle(orbitAngleDeg - startAngleDeg);
  return span / 360;
}

/** Continuous New Calendar season progress from pointer-based year progress. */
export function newCalendarSeasonProgressFromYearProgress(
  yearProgress: number,
): number {
  const continuousIndex = clamp(yearProgress * DAYS_PER_YEAR, 0, DAYS_PER_YEAR);
  const dayZeroInSeason = continuousIndex % DAYS_PER_SEASON;
  return (dayZeroInSeason + 1) / DAYS_PER_SEASON;
}

/** Continuous Gregorian season progress from pointer-based year progress. */
export function gregorianSeasonProgressFromYearProgress(
  referenceDate: Date,
  yearProgress: number,
): number {
  const year = referenceDate.getFullYear();
  const daysInYear = daysInGregorianYear(year);
  const dayFloat = clamp(yearProgress * daysInYear, 0, daysInYear);
  const wholeDays = Math.floor(dayFloat);
  const withinDay = dayFloat - wholeDays;
  const progressAtDay = describeGregorianSeason(
    dateFromDayOfGregorianYear(year, wholeDays),
  ).progress;

  if (withinDay <= 0.001 || wholeDays >= daysInYear - 1) {
    return progressAtDay;
  }

  const progressAtNextDay = describeGregorianSeason(
    dateFromDayOfGregorianYear(year, wholeDays + 1),
  ).progress;

  return progressAtDay + (progressAtNextDay - progressAtDay) * withinDay;
}

/** Live season progress while scrubbing the clock orbit. */
export function seasonProgressFromYearProgress(
  system: SeasonClockSystem,
  yearProgress: number,
  referenceDate: Date,
): number {
  return system === "gregorian"
    ? gregorianSeasonProgressFromYearProgress(referenceDate, yearProgress)
    : newCalendarSeasonProgressFromYearProgress(yearProgress);
}

/**
 * Clip fixed season zones to the filled portion of the year ring (solstice → progress).
 * Unfilled arcs are omitted so season colors stack clockwise as the year advances.
 */
export function yearRingFilledSegments(
  segments: readonly YearRingSegment[],
  yearProgress: number,
  startAngleDeg = SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
): YearRingSegment[] {
  const progressEnd = yearProgressEndAngleDeg(yearProgress, startAngleDeg);
  const filled: YearRingSegment[] = [];

  for (const segment of segments) {
    if (progressEnd <= segment.startAngleDeg) continue;

    filled.push({
      ...segment,
      startAngleDeg: segment.startAngleDeg,
      endAngleDeg: Math.min(segment.endAngleDeg, progressEnd),
    });
  }

  return filled;
}

/**
 * Fixed anchor for the inner daylight wedge (6 o'clock in SVG polar coords).
 * The wedge grows clockwise from this point as daylight hours increase — only
 * the arc span changes, so users can read growth/shrink without both endpoints
 * wandering with year phase.
 */
export const DAYLIGHT_PIE_ANCHOR_ANGLE_DEG = 90;

/** Derive the daylight wedge geometry from hours alone (year-independent anchor). */
export function daylightPieSegment(hours: number): DaylightPieSegment {
  const daylightFraction = clamp(hours / 24, 0, 1);
  const arcSpan = daylightFraction * 360;
  const lightStartAngle = DAYLIGHT_PIE_ANCHOR_ANGLE_DEG;
  const lightEndAngle = DAYLIGHT_PIE_ANCHOR_ANGLE_DEG + arcSpan;

  return {
    lightStartAngle,
    lightEndAngle,
    daylightFraction,
    daylightHours: hours,
  };
}

export function makeNewCalendarProgressPie(
  calendarDate: NewCalendarDate,
): SeasonProgressPieModel {
  const date = gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear);
  const hours = daylightHours(date);
  const yearProgress = yearProgressForIndex(calendarDate.index);

  return {
    yearProgress,
    seasonProgress: calendarDate.dayOfSeason / DAYS_PER_SEASON,
    seasonName: calendarDate.season,
    daylightHours: hours,
    pie: daylightPieSegment(hours),
    orbitAngleDeg: orbitAngleDegForIndex(calendarDate.index),
    yearRingSegments: yearRingSegments(SEASON_COLORS, SEASON_CLOCK_YEAR_SEGMENT_ARC_DEG),
    ticks: makeNewCalendarTicks(calendarDate.cycleStartYear),
    starPoints: 10,
  };
}

export function makeGregorianProgressPie(
  calendarDate: NewCalendarDate,
): SeasonProgressPieModel {
  const gregorianDate = calendarDate.gregorianDate;
  const gregorianSeason = describeGregorianSeason(gregorianDate);
  const hours = daylightHours(gregorianDate);
  const yearProgress = gregorianYearProgress(gregorianDate);

  return {
    yearProgress,
    seasonProgress: gregorianSeason.progress,
    seasonName: gregorianSeason.season,
    daylightHours: hours,
    pie: daylightPieSegment(hours),
    orbitAngleDeg: SEASON_CLOCK_SOLSTICE_ANGLE_DEG + yearProgress * 360,
    yearRingSegments: yearRingSegments(
      GREGORIAN_SEASON_COLORS,
      GREGORIAN_CLOCK_YEAR_SEGMENT_ARC_DEG,
    ),
    ticks: makeGregorianTicks(calendarDate.cycleStartYear),
    starPoints: 12,
  };
}

export function makeSeasonProgressPie(
  system: SeasonClockSystem,
  calendarDate: NewCalendarDate,
): SeasonProgressPieModel {
  return system === "gregorian"
    ? makeGregorianProgressPie(calendarDate)
    : makeNewCalendarProgressPie(calendarDate);
}

/** Normalized year progress [0, 1) from pointer position on the clock SVG. */
export function pointerYearProgress(
  clientX: number,
  clientY: number,
  svgRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): number {
  const { size, center } = seasonClockLayout;
  const x = ((clientX - svgRect.left) / svgRect.width) * size;
  const y = ((clientY - svgRect.top) / svgRect.height) * size;
  const dx = x - center;
  const dy = y - center;
  return normalizePointerProgress(Math.atan2(dy, dx) + Math.PI / 2);
}

/** Continuous orbit angle (degrees) for the scrub marker while dragging. */
export function orbitAngleDegFromPointer(
  clientX: number,
  clientY: number,
  svgRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): number {
  return pointerYearProgress(clientX, clientY, svgRect) * 360 + SEASON_CLOCK_SOLSTICE_ANGLE_DEG;
}

export function indexFromClockPointer(
  clientX: number,
  clientY: number,
  svgRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  activeSeasonIndex: number,
  options?: { yearScrub?: boolean },
): number {
  const { size, center, orbitRadius } = seasonClockLayout;
  const innerRadius = orbitRadius * 0.68;
  const x = ((clientX - svgRect.left) / svgRect.width) * size;
  const y = ((clientY - svgRect.top) / svgRect.height) * size;
  const dx = x - center;
  const dy = y - center;
  const distanceFromCenter = Math.hypot(dx, dy);
  const progress = pointerYearProgress(clientX, clientY, svgRect);
  const isInnerRing =
    !options?.yearScrub &&
    Math.abs(distanceFromCenter - innerRadius) <
      Math.abs(distanceFromCenter - orbitRadius);

  if (isInnerRing) {
    const dayOffset = Math.round(progress * (DAYS_PER_SEASON - 1));
    return activeSeasonIndex * DAYS_PER_SEASON + dayOffset;
  }

  return Math.round(progress * (DAYS_PER_YEAR - 1));
}

export function pieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngleDeg);
  const end = polarToCartesian(cx, cy, radius, endAngleDeg);
  const span = normalizeAngle(endAngleDeg - startAngleDeg);

  if (span >= 359.999) {
    return [
      `M ${cx - radius} ${cy}`,
      `A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy}`,
      `A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy}`,
      "Z",
    ].join(" ");
  }

  const largeArc = span > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function annularSlicePath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const span = normalizeAngle(endAngleDeg - startAngleDeg);
  if (span <= 0.001) return "";

  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngleDeg);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngleDeg);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngleDeg);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngleDeg);
  const largeArc = span > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function starPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
): string {
  const step = Math.PI / points;
  const vertices: string[] = [];

  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + index * step;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    vertices.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return `${vertices.join(" ")} Z`;
}

export function orbitMarkerPosition(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  return polarToCartesian(cx, cy, radius, angleDeg);
}

export function midpointIndexForNewMonth(monthIndex: number): number {
  const seasonIndex = Math.floor(monthIndex / 2);
  const monthWithinSeason = monthIndex % 2;
  const dayZeroInSeason =
    monthWithinSeason === 0
      ? Math.floor(DAYS_PER_MONTH / 2)
      : REFLECTION_DAY_IN_SEASON + Math.floor(DAYS_PER_MONTH / 2);

  return seasonIndex * DAYS_PER_SEASON + dayZeroInSeason;
}

function makeNewCalendarTicks(_cycleStartYear: number): SeasonClockTick[] {
  return MONTH_NAMES.map((monthName, monthIndex) => ({
    angleDeg: monthTickAngleDeg(monthIndex, MONTH_NAMES.length),
    label: shortMonthLabel(monthName),
  }));
}

function makeGregorianTicks(cycleStartYear: number): SeasonClockTick[] {
  const year = cycleStartYear + 1;
  const monthCount = 12;

  return Array.from({ length: monthCount }, (_, monthIndex) => {
    const date = new Date(year, monthIndex, 1);
    const label = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);

    return {
      angleDeg: monthTickAngleDeg(monthIndex, monthCount),
      label,
    };
  });
}

function shortMonthLabel(monthName: string): string {
  return monthName
    .split(" ")
    .map((part) => part[0])
    .join("");
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function normalizeAngle(angleDeg: number): number {
  return ((angleDeg % 360) + 360) % 360;
}

function normalizePointerProgress(angle: number): number {
  const fullTurn = Math.PI * 2;
  return (((angle % fullTurn) + fullTurn) % fullTurn) / fullTurn;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dateFromDayOfGregorianYear(year: number, dayIndex: number): Date {
  const date = new Date(year, 0, 1);
  date.setDate(date.getDate() + dayIndex);
  return date;
}
