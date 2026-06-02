import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarComparisonPanel } from "./CalendarComparisonPanel";
import { describeGregorianSeason } from "../lib/gregorianSeasons";
import { DAYS_PER_MONTH, DAYS_PER_WEEK, describeNewCalendarIndex } from "../lib/newCalendar";

function readoutLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".readout-grid > div")).map(
    (row) => row.querySelector("dt")?.textContent ?? "",
  );
}

describe("CalendarComparisonPanel readout rows", () => {
  it("shows the trimmed readout rows in both compare columns", () => {
    const calendarDate = describeNewCalendarIndex(100, 2025);
    const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);

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

    const expectedGridLabels = [
      "Month",
      "Season count",
      "Days per month",
      "Days per week",
    ];

    expect(readoutLabels(newColumn)).toEqual(expectedGridLabels);
    expect(readoutLabels(gregorianColumn)).toEqual(expectedGridLabels);

    expect(newColumn.querySelector(".season-bar-block")).toBeInTheDocument();
    expect(gregorianColumn.querySelector(".season-bar-block")).toBeInTheDocument();
    expect(
      within(newColumn.querySelector(".season-bar-readout") as HTMLElement).getByText("Season"),
    ).toBeInTheDocument();
    expect(
      within(gregorianColumn.querySelector(".season-bar-readout") as HTMLElement).getByText("Season"),
    ).toBeInTheDocument();
    expect(within(newColumn).getByText(calendarDate.season)).toBeInTheDocument();
    expect(within(gregorianColumn).getByText(gregorianSeason.season)).toBeInTheDocument();
    expect(within(newColumn).getByText("5 seasons")).toBeInTheDocument();
    expect(within(gregorianColumn).getByText("4 seasons")).toBeInTheDocument();
    expect(within(newColumn).getByText(String(DAYS_PER_MONTH))).toBeInTheDocument();
    expect(within(newColumn).getByText(String(DAYS_PER_WEEK))).toBeInTheDocument();
    expect(within(gregorianColumn).getByText("7")).toBeInTheDocument();
    expect(within(newColumn).queryByText("Year day")).not.toBeInTheDocument();
    expect(within(newColumn).queryByText("Season day")).not.toBeInTheDocument();
    expect(within(gregorianColumn).queryByText("Date")).not.toBeInTheDocument();
    expect(newColumn.querySelector(".calendar-readout-season-clock")).toBeInTheDocument();
    expect(gregorianColumn.querySelector(".calendar-readout-season-clock")).toBeInTheDocument();
    expect(newColumn.querySelector(".season-clock-card-body")).toBeInTheDocument();

    const newColumnChildren = Array.from(newColumn.children).map((child) => child.className);
    const seasonBarBlockIndex = newColumnChildren.findIndex((name) => name.includes("season-bar-block"));
    const readoutGridIndex = newColumnChildren.findIndex((name) => name.includes("readout-grid"));
    expect(seasonBarBlockIndex).toBeGreaterThan(-1);
    expect(readoutGridIndex).toBeGreaterThan(seasonBarBlockIndex);

    expect(panel.querySelector(".calendar-season-clock-subsection")).not.toBeInTheDocument();
    expect(panel.querySelector(".calendar-charts-stack .season-clock-view")).not.toBeInTheDocument();
  });
});
