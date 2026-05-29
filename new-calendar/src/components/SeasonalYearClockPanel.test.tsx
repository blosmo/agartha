import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeasonalYearClockPanel } from "./SeasonalYearClockPanel";
import { describeNewCalendarIndex, gregorianForIndex } from "../lib/newCalendar";
import { yearProgressForIndex } from "../lib/seasonalYearClock";
import { daylightHours } from "../lib/sunlight";

describe("SeasonalYearClockPanel", () => {
  it("renders year, season, and daylight metrics", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const expectedDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );

    render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
    );

    expect(screen.getByText("Year progress")).toBeInTheDocument();
    expect(screen.getByText(`${Math.round(yearProgressForIndex(120) * 100)}%`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${calendarDate.season} progress`, "i"))).toBeInTheDocument();
    expect(screen.getByText("Daylight")).toBeInTheDocument();
    expect(screen.getByText(`${expectedDaylight.toFixed(1)}h`)).toBeInTheDocument();
  });

  it("renders a single season clock chart", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const expectedDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );

    render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
    );

    expect(
      screen.getByRole("img", {
        name: new RegExp(`season clock, ${expectedDaylight.toFixed(1)}h daylight`, "i"),
      }),
    ).toBeInTheDocument();
  });

  it("scrubs the year when dragging the pie", () => {
    const onSelectIndex = vi.fn();
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const expectedDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );

    render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={onSelectIndex} />,
    );

    const chart = screen.getByRole("img", {
      name: new RegExp(`season clock, ${expectedDaylight.toFixed(1)}h daylight`, "i"),
    });
    Object.defineProperty(chart, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 246,
        bottom: 246,
        width: 246,
        height: 246,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(chart, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(chart, {
      clientX: 123,
      clientY: 30,
      pointerId: 1,
    });

    expect(onSelectIndex).toHaveBeenCalled();
  });

  it("shows split compare pies when both calendars are enabled", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const newDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );
    const gregDaylight = daylightHours(calendarDate.gregorianDate);

    render(
      <SeasonalYearClockPanel
        calendarDate={calendarDate}
        showNewCalendar
        showGregorianOverlay
        onSelectIndex={() => undefined}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: new RegExp(`New Calendar season clock, ${newDaylight.toFixed(1)}h daylight`, "i"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: new RegExp(`Gregorian season clock, ${gregDaylight.toFixed(1)}h daylight`, "i"),
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Daylight")).toHaveLength(2);
  });
});
