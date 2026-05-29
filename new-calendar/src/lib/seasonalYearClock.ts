import {
  DAYS_PER_MONTH,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  MONTH_NAMES,
  REFLECTION_DAY_IN_SEASON,
  gregorianForIndex,
  type NewCalendarDate,
} from "./newCalendar";
import { describeGregorianSeason, gregorianYearProgress } from "./gregorianSeasons";
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

export interface SeasonProgressPieModel {
  yearProgress: number;
  seasonProgress: number;
  seasonName: string;
  daylightHours: number;
  pie: DaylightPieSegment;
  orbitAngleDeg: number;
  yearFillStartAngleDeg: number;
  yearFillEndAngleDeg: number;
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

export function yearFillAngles(yearProgress: number): {
  startAngleDeg: number;
  endAngleDeg: number;
} {
  const safeProgress = clamp(yearProgress, 0, 1);
  return {
    startAngleDeg: SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
    endAngleDeg: SEASON_CLOCK_SOLSTICE_ANGLE_DEG + safeProgress * 360,
  };
}

/** Derive the daylight wedge geometry for a point in the year. */
export function daylightPieSegment(
  hours: number,
  yearProgress: number,
): DaylightPieSegment {
  const daylightFraction = clamp(hours / 24, 0, 1);
  const arcSpan = daylightFraction * 360;
  const centerAngle = 180 - 90 * Math.cos(normalizeProgress(yearProgress) * Math.PI * 2);
  const lightStartAngle = centerAngle - arcSpan / 2;
  const lightEndAngle = centerAngle + arcSpan / 2;

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
  const fill = yearFillAngles(yearProgress);

  return {
    yearProgress,
    seasonProgress: calendarDate.dayOfSeason / DAYS_PER_SEASON,
    seasonName: calendarDate.season,
    daylightHours: hours,
    pie: daylightPieSegment(hours, calendarDate.index / DAYS_PER_YEAR),
    orbitAngleDeg: orbitAngleDegForIndex(calendarDate.index),
    yearFillStartAngleDeg: fill.startAngleDeg,
    yearFillEndAngleDeg: fill.endAngleDeg,
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
  const fill = yearFillAngles(yearProgress);

  return {
    yearProgress,
    seasonProgress: gregorianSeason.progress,
    seasonName: gregorianSeason.season,
    daylightHours: hours,
    pie: daylightPieSegment(hours, yearProgress),
    orbitAngleDeg: SEASON_CLOCK_SOLSTICE_ANGLE_DEG + yearProgress * 360,
    yearFillStartAngleDeg: fill.startAngleDeg,
    yearFillEndAngleDeg: fill.endAngleDeg,
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

export function indexFromClockPointer(
  clientX: number,
  clientY: number,
  svgRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  activeSeasonIndex: number,
): number {
  const { size, center, orbitRadius } = seasonClockLayout;
  const innerRadius = orbitRadius * 0.68;
  const x = ((clientX - svgRect.left) / svgRect.width) * size;
  const y = ((clientY - svgRect.top) / svgRect.height) * size;
  const dx = x - center;
  const dy = y - center;
  const distanceFromCenter = Math.hypot(dx, dy);
  const progress = normalizePointerProgress(Math.atan2(dy, dx) + Math.PI / 2);
  const isInnerRing =
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

function normalizeProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

function normalizePointerProgress(angle: number): number {
  const fullTurn = Math.PI * 2;
  return (((angle % fullTurn) + fullTurn) % fullTurn) / fullTurn;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
