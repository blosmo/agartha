import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimeControls } from "./TimeControls";
import { describeGregorianYearDay } from "../lib/gregorianSeasons";
import { DAYS_PER_YEAR, describeNewCalendarIndex } from "../lib/newCalendar";

describe("TimeControls day scrubber", () => {
  it("shows gregorian civil year day, not calendar index position", () => {
    const index = 219;
    const calendarDate = describeNewCalendarIndex(index, 2025);
    const gregorianYearDay = describeGregorianYearDay(calendarDate.gregorianDate);

    expect(gregorianYearDay.day).not.toBe(index + 1);

    render(
      <TimeControls
        selectedIndex={index}
        gregorianYearDay={gregorianYearDay}
        playing={false}
        playbackSpeed={5}
        onSelectIndex={() => {}}
        onStepTime={() => {}}
        onPlaybackSpeedChange={() => {}}
        onToday={() => {}}
        onPlayingChange={() => {}}
      />,
    );

    const slider = screen.getByLabelText("Day");
    const output = slider.parentElement!.querySelector("output");
    expect(output).toHaveTextContent(`${gregorianYearDay.day}/${gregorianYearDay.daysInYear}`);
    expect(slider).toHaveValue(String(index));
  });

  it("uses a 366-day denominator on gregorian leap years", () => {
    const calendarDate = describeNewCalendarIndex(100, 2023);
    const gregorianYearDay = describeGregorianYearDay(calendarDate.gregorianDate);

    expect(gregorianYearDay.daysInYear).toBe(366);

    render(
      <TimeControls
        selectedIndex={100}
        gregorianYearDay={gregorianYearDay}
        playing={false}
        playbackSpeed={5}
        onSelectIndex={() => {}}
        onStepTime={() => {}}
        onPlaybackSpeedChange={() => {}}
        onToday={() => {}}
        onPlayingChange={() => {}}
      />,
    );

    const output = screen.getByLabelText("Day").parentElement!.querySelector("output");
    expect(output).toHaveTextContent(`${gregorianYearDay.day}/${gregorianYearDay.daysInYear}`);
  });

  it("still scrubs by calendar index 0 through 364", () => {
    const onSelectIndex = vi.fn();

    render(
      <TimeControls
        selectedIndex={0}
        gregorianYearDay={describeGregorianYearDay(describeNewCalendarIndex(0).gregorianDate)}
        playing={false}
        playbackSpeed={5}
        onSelectIndex={onSelectIndex}
        onStepTime={() => {}}
        onPlaybackSpeedChange={() => {}}
        onToday={() => {}}
        onPlayingChange={() => {}}
      />,
    );

    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", String(DAYS_PER_YEAR - 1));

    fireEvent.change(slider, { target: { value: "364" } });
    expect(onSelectIndex).toHaveBeenCalledWith(364);
  });
});
