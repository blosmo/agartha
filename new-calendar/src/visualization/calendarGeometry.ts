import {
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  PREFERRED_LEAP_INDEX,
  SEASONS,
  describeNewCalendarIndex,
} from "../lib/newCalendar";

export interface CalendarPoint {
  index: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
  z: number;
  seasonIndex: number;
  isReflectionDay: boolean;
  isLeapMarker: boolean;
  label: string;
}

export interface SeasonArc {
  season: string;
  seasonIndex: number;
  startIndex: number;
  endIndex: number;
  color: string;
}

export const SEASON_COLORS = ["#a7e8ff", "#a8f0a0", "#ffd166", "#ff8a5b", "#c7a7ff"];

export function angleForIndex(index: number): number {
  return (index / DAYS_PER_YEAR) * Math.PI * 2 - Math.PI / 2;
}

export function pointForIndex(index: number, radius = 4.2): CalendarPoint {
  const angle = angleForIndex(index);
  const calendarDate = describeNewCalendarIndex(index);
  const height = Math.sin(angle * 5) * 0.18;
  return {
    index,
    angle,
    radius,
    x: Math.cos(angle) * radius,
    y: height,
    z: Math.sin(angle) * radius,
    seasonIndex: calendarDate.seasonIndex,
    isReflectionDay: calendarDate.isReflectionDay,
    isLeapMarker: index === PREFERRED_LEAP_INDEX,
    label: calendarDate.isReflectionDay
      ? `${calendarDate.season} reflection`
      : `${calendarDate.monthName} ${calendarDate.dayOfMonth}`,
  };
}

export function makeCalendarPoints(radius = 4.2): CalendarPoint[] {
  return Array.from({ length: DAYS_PER_YEAR }, (_, index) => pointForIndex(index, radius));
}

export function makeSeasonArcs(): SeasonArc[] {
  return SEASONS.map((season, seasonIndex) => ({
    season,
    seasonIndex,
    startIndex: seasonIndex * DAYS_PER_SEASON,
    endIndex: seasonIndex * DAYS_PER_SEASON + DAYS_PER_SEASON - 1,
    color: SEASON_COLORS[seasonIndex],
  }));
}

export function clampCalendarIndex(index: number): number {
  return Math.max(0, Math.min(DAYS_PER_YEAR - 1, Math.round(index)));
}
