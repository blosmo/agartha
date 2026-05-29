export type GregorianSeasonName = "Winter" | "Spring" | "Summer" | "Autumn";

export interface GregorianSeasonDate {
  season: GregorianSeasonName;
  seasonIndex: number;
  dayOfSeason: number;
  daysInSeason: number;
  progress: number;
}

interface SeasonBoundary {
  season: GregorianSeasonName;
  month: number;
  day: number;
}

export interface GregorianSeasonSegment {
  season: GregorianSeasonName;
  seasonIndex: number;
  startIndex: number;
  endIndex: number;
  daysInSeason: number;
  color: string;
}

const SEASON_BOUNDARIES: SeasonBoundary[] = [
  { season: "Spring", month: 2, day: 20 },
  { season: "Summer", month: 5, day: 21 },
  { season: "Autumn", month: 8, day: 22 },
  { season: "Winter", month: 11, day: 21 },
];

export const GREGORIAN_SEASONS: GregorianSeasonName[] = ["Winter", "Spring", "Summer", "Autumn"];
export const GREGORIAN_SEASON_COLORS = ["#8bd6ff", "#a8f0a0", "#ffd166", "#ff8763"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function describeGregorianSeason(date: Date): GregorianSeasonDate {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = seasonStartFor(local);
  const nextStart = nextSeasonStart(start.season, start.date);
  const dayOfSeason = daysBetween(start.date, local) + 1;
  const daysInSeason = daysBetween(start.date, nextStart);

  return {
    season: start.season,
    seasonIndex: GREGORIAN_SEASONS.indexOf(start.season),
    dayOfSeason,
    daysInSeason,
    progress: dayOfSeason / daysInSeason,
  };
}

export function makeGregorianSeasonSegments(cycleStartYear: number): GregorianSeasonSegment[] {
  const cycleStart = new Date(cycleStartYear, 11, 21);
  const boundaries = [
    cycleStart,
    new Date(cycleStartYear + 1, 2, 20),
    new Date(cycleStartYear + 1, 5, 21),
    new Date(cycleStartYear + 1, 8, 22),
    new Date(cycleStartYear + 1, 11, 21),
  ];

  return boundaries.slice(0, -1).map((start, index) => {
    const next = boundaries[index + 1];
    const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
    const season = describeGregorianSeason(start).season;
    const startIndex = daysBetween(cycleStart, start);
    const endIndex = daysBetween(cycleStart, end);
    const seasonIndex = GREGORIAN_SEASONS.indexOf(season);

    return {
      season,
      seasonIndex,
      startIndex,
      endIndex,
      daysInSeason: endIndex - startIndex + 1,
      color: GREGORIAN_SEASON_COLORS[seasonIndex],
    };
  });
}

export function gregorianYearProgress(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const nextYear = Date.UTC(date.getFullYear() + 1, 0, 1);
  return (current - start) / (nextYear - start);
}

export function daysInGregorianYear(year: number): number {
  return new Date(year, 1, 29).getDate() === 29 ? 366 : 365;
}

export function dayOfGregorianYear(date: Date): number {
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const yearStart = Date.UTC(date.getFullYear(), 0, 1);
  return Math.floor((current - yearStart) / MS_PER_DAY) + 1;
}

export interface GregorianYearDay {
  day: number;
  daysInYear: number;
}

export function describeGregorianYearDay(date: Date): GregorianYearDay {
  const year = date.getFullYear();
  return {
    day: dayOfGregorianYear(date),
    daysInYear: daysInGregorianYear(year),
  };
}

function seasonStartFor(date: Date): { season: GregorianSeasonName; date: Date } {
  const year = date.getFullYear();
  const starts = SEASON_BOUNDARIES.map((boundary) => ({
    season: boundary.season,
    date: new Date(year, boundary.month, boundary.day),
  }));

  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (date >= starts[index].date) return starts[index];
  }

  return {
    season: "Winter",
    date: new Date(year - 1, 11, 21),
  };
}

function nextSeasonStart(season: GregorianSeasonName, start: Date): Date {
  const boundaryIndex = SEASON_BOUNDARIES.findIndex((boundary) => boundary.season === season);
  const nextBoundary = SEASON_BOUNDARIES[(boundaryIndex + 1) % SEASON_BOUNDARIES.length];
  const yearOffset = season === "Winter" ? 1 : 0;
  return new Date(start.getFullYear() + yearOffset, nextBoundary.month, nextBoundary.day);
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((utcDay(end) - utcDay(start)) / MS_PER_DAY);
}

function utcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
