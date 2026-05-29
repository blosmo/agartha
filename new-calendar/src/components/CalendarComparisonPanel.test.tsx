import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarComparisonPanel } from "./CalendarComparisonPanel";
import { describeGregorianYearDay } from "../lib/gregorianSeasons";
import { DAYS_PER_YEAR, describeNewCalendarIndex } from "../lib/newCalendar";

function yearDayText(container: HTMLElement): string {
  const rows = Array.from(container.querySelectorAll(".readout-grid > div"));
  const yearDayRow = rows.find((row) => row.querySelector("dt")?.textContent === "Year day");
  expect(yearDayRow).toBeTruthy();
  return yearDayRow!.querySelector("dd")?.textContent ?? "";
}

describe("CalendarComparisonPanel year day readout", () => {
  it("shows matching gregorian year day in both compare columns", () => {
    const calendarDate = describeNewCalendarIndex(DAYS_PER_YEAR - 1, 2025);
    const expected = describeGregorianYearDay(calendarDate.gregorianDate);

    render(
      <CalendarComparisonPanel
        calendarDate={calendarDate}
        showNewCalendar
        showGregorianOverlay
        onSelectIndex={() => {}}
      />,
    );

    const panel = document.querySelector(".comparison-panel") as HTMLElement;
    const newColumn = panel.querySelector(".new-calendar-readout-column") as HTMLElement;
    const gregorianColumn = panel.querySelector(".gregorian-readout-column") as HTMLElement;

    const expectedText = `${expected.day}/${expected.daysInYear}`;
    expect(within(newColumn).getByText(String(expected.day))).toBeInTheDocument();
    expect(within(gregorianColumn).getByText(String(expected.day))).toBeInTheDocument();
    expect(yearDayText(newColumn)).toBe(expectedText);
    expect(yearDayText(gregorianColumn)).toBe(expectedText);
  });

  it("uses a 366-day denominator on gregorian leap years", () => {
    const calendarDate = describeNewCalendarIndex(100, 2023);
    const expected = describeGregorianYearDay(calendarDate.gregorianDate);

    expect(expected.daysInYear).toBe(366);

    render(
      <CalendarComparisonPanel
        calendarDate={calendarDate}
        showNewCalendar
        showGregorianOverlay
        onSelectIndex={() => {}}
      />,
    );

    const panel = document.querySelector(".comparison-panel") as HTMLElement;
    const newColumn = panel.querySelector(".new-calendar-readout-column") as HTMLElement;
    const gregorianColumn = panel.querySelector(".gregorian-readout-column") as HTMLElement;
    const expectedText = `${expected.day}/${expected.daysInYear}`;

    expect(yearDayText(newColumn)).toBe(expectedText);
    expect(yearDayText(gregorianColumn)).toBe(expectedText);
  });
});
