import {
  DAYS_PER_SEASON,
  SEASONS,
  type NewCalendarDate,
  gregorianForIndex,
} from "./newCalendar";
import {
  GREGORIAN_SEASONS,
  describeGregorianSeason,
  makeGregorianSeasonSegments,
} from "./gregorianSeasons";

export interface SunlightPoint {
  season: string;
  seasonIndex: number;
  dayOfSeason: number;
  yearIndex: number;
  date: Date;
  hours: number;
}

export interface SunlightSeries {
  season: string;
  seasonIndex: number;
  points: SunlightPoint[];
}

export interface GregorianSunlightSeries extends SunlightSeries {
  daysInSeason: number;
}

export const WASHINGTON_DC_LATITUDE = 38.9072;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / (24 * 60 * 60 * 1000));
}

export function daylightHours(date: Date, latitude = WASHINGTON_DC_LATITUDE): number {
  const n = dayOfYear(date);
  const solarDeclination = 23.44 * DEG_TO_RAD * Math.sin(((360 / 365) * (n - 81)) * DEG_TO_RAD);
  const latitudeRad = latitude * DEG_TO_RAD;
  const hourAngle = Math.acos(
    Math.max(-1, Math.min(1, -Math.tan(latitudeRad) * Math.tan(solarDeclination))),
  );

  return (2 * hourAngle * RAD_TO_DEG) / 15;
}

export function makeSunlightSeries(cycleStartYear: number): SunlightSeries[] {
  return SEASONS.map((season, seasonIndex) => {
    const points = Array.from({ length: DAYS_PER_SEASON }, (_, dayIndex) => {
      const yearIndex = seasonIndex * DAYS_PER_SEASON + dayIndex;
      const date = gregorianForIndex(yearIndex, cycleStartYear);
      return {
        season,
        seasonIndex,
        dayOfSeason: dayIndex + 1,
        yearIndex,
        date,
        hours: daylightHours(date),
      };
    });

    return { season, seasonIndex, points };
  });
}

export function makeGregorianSunlightSeries(cycleStartYear: number): GregorianSunlightSeries[] {
  const segments = makeGregorianSeasonSegments(cycleStartYear);

  return GREGORIAN_SEASONS.map((season, seasonIndex) => {
    const segment = segments.find((item) => item.season === season);
    const points = segment
      ? Array.from({ length: segment.daysInSeason }, (_, dayIndex) => {
          const yearIndex = segment.startIndex + dayIndex;
          const date = gregorianForIndex(yearIndex, cycleStartYear);
          return {
            season,
            seasonIndex,
            dayOfSeason: normalizedGregorianDay(dayIndex + 1, segment.daysInSeason),
            yearIndex,
            date,
            hours: daylightHours(date),
          };
        })
      : [];

    return {
      season,
      seasonIndex,
      daysInSeason: segment?.daysInSeason ?? 0,
      points,
    };
  });
}

export function sunlightPointForCalendarDate(calendarDate: NewCalendarDate): SunlightPoint {
  return {
    season: calendarDate.season,
    seasonIndex: calendarDate.seasonIndex,
    dayOfSeason: calendarDate.dayOfSeason,
    yearIndex: calendarDate.index,
    date: calendarDate.gregorianDate,
    hours: daylightHours(calendarDate.gregorianDate),
  };
}

export function sunlightPointForGregorianDate(date: Date): SunlightPoint {
  const gregorianSeason = describeGregorianSeason(date);

  return {
    season: gregorianSeason.season,
    seasonIndex: gregorianSeason.seasonIndex,
    dayOfSeason: normalizedGregorianDay(
      gregorianSeason.dayOfSeason,
      gregorianSeason.daysInSeason,
    ),
    yearIndex: dayOfYear(date) - 1,
    date,
    hours: daylightHours(date),
  };
}

function normalizedGregorianDay(dayOfSeason: number, daysInSeason: number): number {
  if (daysInSeason <= 1) return 1;
  return 1 + ((dayOfSeason - 1) / (daysInSeason - 1)) * (DAYS_PER_SEASON - 1);
}
