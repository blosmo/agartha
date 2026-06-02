import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeasonalYearClockPanel } from "./SeasonalYearClockPanel";
import { describeNewCalendarIndex, gregorianForIndex } from "../lib/newCalendar";
import { makeSeasonProgressPie, yearProgressForIndex, yearProgressFromOrbitAngleDeg, newCalendarSeasonProgressFromYearProgress } from "../lib/seasonalYearClock";
import { daylightHours } from "../lib/sunlight";
import { SEASON_COLORS } from "../visualization/calendarGeometry";
import { GREGORIAN_SEASON_COLORS, describeGregorianSeason } from "../lib/gregorianSeasons";

describe("SeasonalYearClockPanel", () => {
  it("renders integrated season clock in readout columns", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);

    const { container } = render(
      <SeasonalYearClockPanel
        calendarDate={calendarDate}
        onSelectIndex={() => undefined}
        integrated
      />,
    );

    expect(container.querySelector(".calendar-readout-season-clock")).toBeInTheDocument();
    expect(container.querySelector(".season-clock-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Season clock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full screen season clock" })).not.toBeInTheDocument();
  });

  it("renders compact year, season, and daylight metrics beside the clock", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const model = makeSeasonProgressPie("new", calendarDate);
    const expectedDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );

    const { container } = render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
    );

    expect(container.querySelector(".season-clock-card-body")).toBeInTheDocument();
    expect(container.querySelector(".season-clock-metrics-column")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("Season")).toBeInTheDocument();
    expect(screen.getByText(`${Math.round(yearProgressForIndex(120) * 100)}%`)).toBeInTheDocument();
    expect(screen.getByText(`${Math.round(model.seasonProgress * 100)}%`)).toBeInTheDocument();
    expect(screen.getByText("Daylight")).toBeInTheDocument();
    expect(screen.getByText(`${expectedDaylight.toFixed(1)}h`)).toBeInTheDocument();

    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars).toHaveLength(2);
    expect(progressBars[0]).toHaveAttribute(
      "aria-label",
      `Year: ${Math.round(model.yearProgress * 100)}%`,
    );
    expect(progressBars[1]).toHaveAttribute(
      "aria-label",
      `Season: ${Math.round(model.seasonProgress * 100)}%`,
    );
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
    Object.defineProperty(chart, "hasPointerCapture", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(chart, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(chart, {
      clientX: 123,
      clientY: 30,
      pointerId: 1,
    });

    expect(onSelectIndex).toHaveBeenCalled();

    onSelectIndex.mockClear();
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 219,
        clientY: 123,
        pointerId: 1,
        bubbles: true,
      }),
    );

    expect(onSelectIndex).toHaveBeenCalled();

    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 219,
        clientY: 123,
        pointerId: 1,
        bubbles: true,
      }),
    );
  });

  it("updates year and season metric bars continuously while dragging", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const expectedDaylight = daylightHours(
      gregorianForIndex(calendarDate.index, calendarDate.cycleStartYear),
    );

    render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
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
    Object.defineProperty(chart, "hasPointerCapture", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(chart, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    const progressBars = () => screen.getAllByRole("progressbar");
    const fillWidth = (bar: HTMLElement) =>
      (bar.querySelector(".season-clock-metric-fill") as HTMLElement).style.width;

    const committedYearWidth = fillWidth(progressBars()[0] as HTMLElement);
    const committedSeasonWidth = fillWidth(progressBars()[1] as HTMLElement);

    fireEvent.pointerDown(chart, {
      clientX: 123,
      clientY: 30,
      pointerId: 1,
    });

    const dragYearProgress = yearProgressFromOrbitAngleDeg(-90);
    const dragSeasonProgress = newCalendarSeasonProgressFromYearProgress(dragYearProgress);
    const dragYearWidth = `${dragYearProgress * 100}%`;
    const dragSeasonWidth = `${dragSeasonProgress * 100}%`;

    expect(fillWidth(progressBars()[0] as HTMLElement)).toBe(dragYearWidth);
    expect(fillWidth(progressBars()[1] as HTMLElement)).toBe(dragSeasonWidth);
    expect(dragYearWidth).not.toBe(committedYearWidth);
    expect(dragSeasonWidth).not.toBe(committedSeasonWidth);

    act(() => {
      fireEvent.pointerMove(chart, {
        clientX: 219,
        clientY: 123,
        pointerId: 1,
      });
    });

    const movedYearProgress = yearProgressFromOrbitAngleDeg(0);
    const movedSeasonProgress = newCalendarSeasonProgressFromYearProgress(movedYearProgress);
    expect(fillWidth(progressBars()[0] as HTMLElement)).toBe(`${movedYearProgress * 100}%`);
    expect(fillWidth(progressBars()[1] as HTMLElement)).toBe(`${movedSeasonProgress * 100}%`);
    expect(fillWidth(progressBars()[0] as HTMLElement)).not.toBe(dragYearWidth);

    act(() => {
      fireEvent.pointerUp(chart, {
        clientX: 219,
        clientY: 123,
        pointerId: 1,
      });
    });
  });

  it("updates gregorian metric bars continuously when gregorian clock is focused", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const gregDaylight = daylightHours(calendarDate.gregorianDate);

    render(
      <SeasonalYearClockPanel
        calendarDate={calendarDate}
        focusSystem="gregorian"
        onSelectIndex={() => undefined}
      />,
    );

    const chart = screen.getByRole("img", {
      name: new RegExp(`Gregorian season clock, ${gregDaylight.toFixed(1)}h daylight`, "i"),
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
    Object.defineProperty(chart, "hasPointerCapture", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(chart, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    const progressBars = () => screen.getAllByRole("progressbar");
    const fillWidth = (bar: HTMLElement) =>
      (bar.querySelector(".season-clock-metric-fill") as HTMLElement).style.width;

    fireEvent.pointerDown(chart, {
      clientX: 123,
      clientY: 30,
      pointerId: 1,
    });

    const dragYearProgress = yearProgressFromOrbitAngleDeg(-90);
    expect(fillWidth(progressBars()[0] as HTMLElement)).toBe(`${dragYearProgress * 100}%`);
    expect(fillWidth(progressBars()[1] as HTMLElement)).not.toBe("0%");

    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 123,
        clientY: 30,
        pointerId: 1,
        bubbles: true,
      }),
    );
  });

  it("renders progressive season-colored year ring fill", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);

    const { container } = render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
    );

    const card = container.querySelector(".new-calendar-season-clock-card");
    expect(card).toHaveStyle({
      "--season-color": SEASON_COLORS[calendarDate.seasonIndex],
    });

    expect(container.querySelector(".season-clock-year-ring-track")).toBeInTheDocument();

    const segments = container.querySelectorAll(".season-clock-year-segment");
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length).toBeLessThan(5);
    expect(segments[0]).toHaveStyle({ "--segment-color": SEASON_COLORS[0] });
    expect(segments[1]).toHaveStyle({ "--segment-color": SEASON_COLORS[1] });
  });

  it("shows only winter fill at the start of the year", () => {
    const calendarDate = describeNewCalendarIndex(0, 2025);

    const { container } = render(
      <SeasonalYearClockPanel calendarDate={calendarDate} onSelectIndex={() => undefined} />,
    );

    const segments = container.querySelectorAll(".season-clock-year-segment");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveStyle({ "--segment-color": SEASON_COLORS[0] });
  });

  it("uses gregorian season colors in compare mode", () => {
    const calendarDate = describeNewCalendarIndex(120, 2025);
    const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);

    const { container } = render(
      <SeasonalYearClockPanel
        calendarDate={calendarDate}
        showNewCalendar
        showGregorianOverlay
        onSelectIndex={() => undefined}
      />,
    );

    const gregorianCard = container.querySelector(".gregorian-season-clock-card");
    expect(gregorianCard).toHaveStyle({
      "--season-color": GREGORIAN_SEASON_COLORS[gregorianSeason.seasonIndex],
    });

    expect(gregorianCard?.querySelector(".season-clock-year-ring-track")).toBeInTheDocument();

    const gregorianSegments = gregorianCard?.querySelectorAll(".season-clock-year-segment");
    expect(gregorianSegments?.length).toBeGreaterThan(0);
    expect(gregorianSegments?.length).toBeLessThan(4);
    expect(gregorianSegments?.[0]).toHaveStyle({
      "--segment-color": GREGORIAN_SEASON_COLORS[0],
    });
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
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
  });
});
