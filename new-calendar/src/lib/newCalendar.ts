export type SeasonName = "Winter" | "Spring" | "Summer" | "Autumn" | "Fall";

export type OverlayMode = "calendar" | "krystal" | "compare";

export interface NewCalendarDate {
  index: number;
  cycleStartYear: number;
  season: SeasonName;
  seasonIndex: number;
  dayOfSeason: number;
  monthIndex: number | null;
  monthName: string;
  dayOfMonth: number | null;
  weekOfMonth: number | null;
  planetaryDay: string | null;
  isReflectionDay: boolean;
  isLeapDay: boolean;
  gregorianDate: Date;
  gregorianLabel: string;
}

export const DAYS_PER_YEAR = 365;
export const SEASONS: SeasonName[] = ["Winter", "Spring", "Summer", "Autumn", "Fall"];
export const DAYS_PER_SEASON = 73;
export const DAYS_PER_MONTH = 36;
export const DAYS_PER_WEEK = 9;
export const REFLECTION_DAY_IN_SEASON = 37;
export const PREFERRED_LEAP_INDEX = DAYS_PER_SEASON * 2 + REFLECTION_DAY_IN_SEASON - 1;

export const PLANETARY_DAYS = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
];

export const MONTH_NAMES = [
  "Deep Winter",
  "Late Winter",
  "Early Spring",
  "Late Spring",
  "Early Summer",
  "High Summer",
  "Early Autumn",
  "Late Autumn",
  "Early Fall",
  "Late Fall",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function seasonCycleStartFor(date: Date): Date {
  const year = date.getFullYear();
  const thisWinterStart = new Date(year, 11, 21);
  const local = localDateOnly(date);
  return local >= thisWinterStart ? thisWinterStart : new Date(year - 1, 11, 21);
}

function daysBetween(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / MS_PER_DAY);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isGregorianLeapDay(date: Date): boolean {
  return date.getMonth() === 1 && date.getDate() === 29;
}

export function normalDayIndexFromDate(date: Date): number {
  const local = localDateOnly(date);
  const start = seasonCycleStartFor(local);
  const rawIndex = daysBetween(start, local);

  if (isGregorianLeapDay(local)) {
    return PREFERRED_LEAP_INDEX;
  }

  const leapYear = start.getFullYear() + 1;
  const leapDay = isLeapYear(leapYear) ? new Date(leapYear, 1, 29) : null;
  const leapAdjustment = leapDay && leapDay > start && leapDay < local ? 1 : 0;
  return (((rawIndex - leapAdjustment) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

export function gregorianForIndex(index: number, cycleStartYear: number): Date {
  const start = new Date(cycleStartYear, 11, 21);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
}

export function describeNewCalendarIndex(
  index: number,
  cycleStartYear = seasonCycleStartFor(new Date()).getFullYear(),
): NewCalendarDate {
  const safeIndex = Math.max(0, Math.min(DAYS_PER_YEAR - 1, Math.round(index)));
  const seasonIndex = Math.floor(safeIndex / DAYS_PER_SEASON);
  const dayZeroInSeason = safeIndex % DAYS_PER_SEASON;
  const dayOfSeason = dayZeroInSeason + 1;
  const isReflectionDay = dayOfSeason === REFLECTION_DAY_IN_SEASON;
  const gregorianDate = gregorianForIndex(safeIndex, cycleStartYear);

  if (isReflectionDay) {
    return {
      index: safeIndex,
      cycleStartYear,
      season: SEASONS[seasonIndex],
      seasonIndex,
      dayOfSeason,
      monthIndex: null,
      monthName: `${SEASONS[seasonIndex]} Reflection`,
      dayOfMonth: null,
      weekOfMonth: null,
      planetaryDay: null,
      isReflectionDay: true,
      isLeapDay: safeIndex === PREFERRED_LEAP_INDEX,
      gregorianDate,
      gregorianLabel: formatGregorian(gregorianDate),
    };
  }

  const secondMonth = dayOfSeason > REFLECTION_DAY_IN_SEASON;
  const monthWithinSeason = secondMonth ? 1 : 0;
  const dayOfMonth = secondMonth
    ? dayOfSeason - REFLECTION_DAY_IN_SEASON
    : dayOfSeason;
  const monthIndex = seasonIndex * 2 + monthWithinSeason;
  const planetaryDay = PLANETARY_DAYS[(dayOfMonth - 1) % DAYS_PER_WEEK];

  return {
    index: safeIndex,
    cycleStartYear,
    season: SEASONS[seasonIndex],
    seasonIndex,
    dayOfSeason,
    monthIndex,
    monthName: MONTH_NAMES[monthIndex],
    dayOfMonth,
    weekOfMonth: Math.floor((dayOfMonth - 1) / DAYS_PER_WEEK) + 1,
    planetaryDay,
    isReflectionDay: false,
    isLeapDay: safeIndex === PREFERRED_LEAP_INDEX,
    gregorianDate,
    gregorianLabel: formatGregorian(gregorianDate),
  };
}

export function describeGregorianDate(date: Date): NewCalendarDate {
  const start = seasonCycleStartFor(date);
  return describeNewCalendarIndex(normalDayIndexFromDate(date), start.getFullYear());
}

export function formatGregorian(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function todayIndex(): number {
  return normalDayIndexFromDate(new Date());
}
