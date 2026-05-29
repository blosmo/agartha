import { describe, expect, it } from "vitest";
import { DAYS_PER_YEAR } from "../lib/newCalendar";
import { yearIndexFromChartClientX } from "./SunlightChart";

const chartBounds = { left: 0, width: 440 };

describe("yearIndexFromChartClientX", () => {
  it("maps the left chart edge to the start of the year", () => {
    expect(yearIndexFromChartClientX(46, chartBounds)).toBe(0);
  });

  it("maps the right chart edge to the end of the year", () => {
    expect(yearIndexFromChartClientX(420, chartBounds)).toBe(DAYS_PER_YEAR - 1);
  });

  it("maps horizontal position across the full chart width", () => {
    expect(yearIndexFromChartClientX(233, chartBounds)).toBe(182);
  });

  it("continues mapping outside the svg bounds while dragging", () => {
    expect(yearIndexFromChartClientX(-40, chartBounds)).toBe(0);
    expect(yearIndexFromChartClientX(500, chartBounds)).toBe(DAYS_PER_YEAR - 1);
  });
});
