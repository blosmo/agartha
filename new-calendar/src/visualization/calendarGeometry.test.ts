import { describe, expect, it } from "vitest";
import { DAYS_PER_YEAR } from "../lib/newCalendar";
import { makeCalendarPoints, makeSeasonArcs, pointForIndex } from "./calendarGeometry";

describe("calendar geometry", () => {
  it("creates one selectable point for every normal day", () => {
    expect(makeCalendarPoints()).toHaveLength(DAYS_PER_YEAR);
  });

  it("creates five equal season arcs", () => {
    const arcs = makeSeasonArcs();

    expect(arcs).toHaveLength(5);
    expect(arcs.map((arc) => arc.endIndex - arc.startIndex + 1)).toEqual([
      73, 73, 73, 73, 73,
    ]);
  });

  it("returns bounded points for the first and last day", () => {
    const first = pointForIndex(0);
    const last = pointForIndex(DAYS_PER_YEAR - 1);

    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(last.z)).toBe(true);
    expect(first.index).toBe(0);
    expect(last.index).toBe(364);
  });
});
