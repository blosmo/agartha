import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { describeGregorianYearDay } from "./lib/gregorianSeasons";
import {
  DAYS_PER_SEASON,
  REFLECTION_DAY_IN_SEASON,
  describeNewCalendarIndex,
  todayIndex,
} from "./lib/newCalendar";

vi.mock("./visualization/CalendarScene", () => ({
  CalendarScene: ({ onSelectIndex }: { onSelectIndex: (index: number) => void }) => (
    <button type="button" data-testid="mock-scene" onClick={() => onSelectIndex(36)}>
      Mock scene
    </button>
  ),
}));

vi.mock("./visualization/SeasonTreeScene", () => ({
  SeasonTreeScene: () => <div data-testid="mock-tree-scene">Mock tree</div>,
}));

describe("App", () => {
  it(
    "renders the live timepiece controls and source-framed overlay",
    () => {
      render(<App />);

      expect(screen.getByLabelText("Orbit panel")).toBeInTheDocument();
      expect(screen.getByLabelText("Tree panel")).toBeInTheDocument();
      expect(screen.getByLabelText("Calendar panel")).toBeInTheDocument();
      expect(within(screen.getByLabelText("Calendar panel")).getByLabelText("Sunlight chart")).toBeInTheDocument();
      expect(within(screen.getByLabelText("Calendar panel")).getByLabelText("Season clock chart")).toBeInTheDocument();
      expect(within(screen.getByLabelText("Calendar panel")).queryByLabelText("Progress chart")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous day" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Forward 9 days" })).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Speed" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Speed" })).toHaveTextContent("5x");
      expect(screen.queryByRole("group", { name: "Speed presets" })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Compare" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Calendar panel")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Calendar", level: 2 })).toBeInTheDocument();
      const calendarPanel = screen.getByLabelText("Calendar panel");
      expect(
        within(calendarPanel.querySelector(".new-calendar-readout-column") as HTMLElement).getByRole(
          "heading",
          { name: "New Calendar", level: 3 },
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Date", level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByText("Selected position")).not.toBeInTheDocument();
      expect(screen.queryByText("Daily sunlight")).not.toBeInTheDocument();
      expect(screen.queryByText("Progress rings")).not.toBeInTheDocument();
      expect(screen.queryByText("Month structure")).not.toBeInTheDocument();
      expect(screen.queryByText("3D lens")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen orbit" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen tree" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen sunlight" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Full screen progress" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen season clock" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Full screen calendar" })).toBeInTheDocument();
      expect(screen.queryByText(/Krystal/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Overlay mode")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "About" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Sunlight panel")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Progress panel")).not.toBeInTheDocument();
    },
    10_000,
  );

  it("opens the about dialog from the header link", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("heading", { name: "About The New Calendar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(screen.getByRole("heading", { name: "About The New Calendar" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /The New Calendar/i })[0]).toHaveAttribute(
      "href",
      "https://thenewcalendar.com/",
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "About The New Calendar" })).not.toBeInTheDocument();
  });

  it("updates the readout from scene selection and overlay controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("mock-scene"));
    const calendarPanel = screen.getByLabelText("Calendar panel");
    expect(within(calendarPanel).getByRole("heading", { name: "New Calendar", level: 3 })).toBeInTheDocument();

    expect(calendarPanel).toHaveTextContent("Winter");
    expect(calendarPanel).not.toHaveTextContent("Gregorian");
  });

  it("renders sunlight lines and season clock together without a progress rings section", () => {
    render(<App />);

    const calendarPanel = screen.getByLabelText("Calendar panel");
    expect(screen.getByRole("img", { name: "Hours of sunlight by day of season" })).toBeInTheDocument();
    expect(within(calendarPanel).queryByLabelText("Progress chart")).not.toBeInTheDocument();
    expect(within(calendarPanel).getByLabelText("Season clock chart")).toBeInTheDocument();
    expect(within(calendarPanel).getByText("Year progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rings" })).not.toBeInTheDocument();
  });

  it("shows the same gregorian year day on the header scrubber and calendar panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("mock-scene"));

    const calendarDate = describeNewCalendarIndex(36);
    const expected = describeGregorianYearDay(calendarDate.gregorianDate);
    const expectedText = `${expected.day}/${expected.daysInYear}`;

    const dayScrubberOutput = screen.getByLabelText("Day").parentElement!.querySelector("output");
    expect(dayScrubberOutput).toHaveTextContent(expectedText);

    const calendarPanel = screen.getByLabelText("Calendar panel");
    const yearDayRow = Array.from(calendarPanel.querySelectorAll(".readout-grid > div")).find(
      (row) => row.querySelector("dt")?.textContent === "Year day",
    );
    expect(yearDayRow?.querySelector("dd")?.textContent).toBe(expectedText);
  });

  it("scrubs the sunlight chart across the full year", async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await user.click(await screen.findByTestId("mock-scene"));
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();

    const sunlightChart = screen.getByRole("img", { name: "Hours of sunlight by day of season" });
    Object.defineProperty(sunlightChart, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 440,
        bottom: 246,
        width: 440,
        height: 246,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(sunlightChart, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(sunlightChart, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(sunlightChart, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(sunlightChart, {
      clientX: 83,
      clientY: 85,
      pointerId: 1,
    });

    expect(screen.getByDisplayValue("36")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New Calendar", level: 3 })).toBeInTheDocument();

    fireEvent.pointerMove(sunlightChart, {
      clientX: 420,
      clientY: 85,
      pointerId: 1,
    });
    expect(screen.getByDisplayValue("364")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Calendar panel")).getByRole("heading", { name: "New Calendar", level: 3 }),
    ).toBeInTheDocument();

    fireEvent.pointerUp(sunlightChart, {
      clientX: 420,
      clientY: 85,
      pointerId: 1,
    });
  });

  it("scrubs time from the New Calendar season bar without duplicating its header text", () => {
    render(<App />);

    const calendarPanel = screen.getByLabelText("Calendar panel");
    const seasonProgress = within(calendarPanel).getByRole("slider", {
      name: "New Calendar year progress",
    });
    expect(within(seasonProgress.parentElement as HTMLElement).queryByText("New Calendar")).not.toBeInTheDocument();

    Object.defineProperty(seasonProgress, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 24,
        width: 400,
        height: 24,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(seasonProgress, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(seasonProgress, {
      clientX: 200,
      pointerId: 1,
    });

    expect(screen.getByDisplayValue("182")).toBeInTheDocument();
  });

  it("changes the active day when a New Calendar month day is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    const calendarDate = describeNewCalendarIndex(todayIndex());
    expect(calendarDate.monthIndex).not.toBeNull();

    const firstDayIndex = firstDayIndexForMonth(calendarDate.monthIndex!);
    const calendarPanel = screen.getByLabelText("Calendar panel");
    const newCalendarMonths = calendarPanel.querySelector(".new-calendar-months") as HTMLElement;

    await user.click(within(newCalendarMonths).getByRole("button", { name: "Select day 1" }));

    expect(screen.getByDisplayValue(String(firstDayIndex))).toBeInTheDocument();
    expect(within(newCalendarMonths).getByText(calendarDate.monthName!)).toBeInTheDocument();
  });

  it("toggles the Gregorian overlay into every calendar view", async () => {
    const user = userEvent.setup();
    render(<App />);

    const overlayToggle = screen.getByRole("switch", { name: "Gregorian" });
    expect(overlayToggle).toHaveAttribute("aria-checked", "false");
    expect(within(screen.getByLabelText("Calendar panel")).queryByText("Gregorian")).not.toBeInTheDocument();

    await user.click(overlayToggle);

    expect(overlayToggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "Overlay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Split" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calendar", level: 2 })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Calendar panel")).getAllByText("Gregorian").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "New Calendar sunlight by day of season" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gregorian sunlight by day of season" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /New Calendar season clock/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Gregorian season clock/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "New Calendar year and season progress rings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Gregorian year and season progress rings" })).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Calendar panel").querySelector(".gregorian-readout-column") as HTMLElement).getByRole(
        "heading",
        { name: "Gregorian", level: 3 },
      ),
    ).toBeInTheDocument();
  });

  it(
    "changes simulation speed and steps through time with transport buttons",
    async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    const increaseSpeed = screen.getByRole("button", { name: "Increase speed" });
    await user.click(increaseSpeed);
    await user.click(increaseSpeed);
    expect(screen.getByRole("group", { name: "Speed" })).toHaveTextContent("7x");

    for (let step = 0; step < 18; step += 1) {
      await user.click(increaseSpeed);
    }
    expect(screen.getByRole("group", { name: "Speed" })).toHaveTextContent("25x");
    expect(screen.getByRole("button", { name: "Increase speed" })).toBeDisabled();

    await user.click(await screen.findByTestId("mock-scene"));
    expect(screen.getByDisplayValue("36")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByDisplayValue("36")).toBeInTheDocument();
  },
    10_000,
  );
});

function firstDayIndexForMonth(monthIndex: number): number {
  const seasonIndex = Math.floor(monthIndex / 2);
  const monthWithinSeason = monthIndex % 2;
  const dayZeroInSeason = monthWithinSeason === 0 ? 0 : REFLECTION_DAY_IN_SEASON;
  return seasonIndex * DAYS_PER_SEASON + dayZeroInSeason;
}
