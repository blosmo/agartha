import { DAYS_PER_YEAR } from "../lib/newCalendar";
import type { GregorianYearDay } from "../lib/gregorianSeasons";
import { memo, useCallback, type ReactNode } from "react";

interface TimeControlsProps {
  selectedIndex: number;
  gregorianYearDay: GregorianYearDay;
  playing: boolean;
  playbackSpeed: number;
  onSelectIndex: (index: number) => void;
  onStepTime: (days: number) => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onToday: () => void;
  onPlayingChange: (playing: boolean) => void;
}

const MIN_PLAYBACK_SPEED = 1;
const MAX_PLAYBACK_SPEED = 25;
const SPEED_STEP = 1;

export const TimeControls = memo(function TimeControls({
  selectedIndex,
  gregorianYearDay,
  playing,
  playbackSpeed,
  onSelectIndex,
  onStepTime,
  onPlaybackSpeedChange,
  onToday,
  onPlayingChange,
}: TimeControlsProps) {
  const previousDay = useCallback(() => onStepTime(-1), [onStepTime]);
  const nextDay = useCallback(() => onStepTime(1), [onStepTime]);
  const togglePlaying = useCallback(() => onPlayingChange(!playing), [onPlayingChange, playing]);
  const decreaseSpeed = useCallback(
    () => onPlaybackSpeedChange(playbackSpeed - SPEED_STEP),
    [onPlaybackSpeedChange, playbackSpeed],
  );
  const increaseSpeed = useCallback(
    () => onPlaybackSpeedChange(playbackSpeed + SPEED_STEP),
    [onPlaybackSpeedChange, playbackSpeed],
  );

  return (
    <section className="time-controls" aria-label="Time controls">
      <div className="transport-row" aria-label="Playback controls">
        <button type="button" aria-label="Previous day" title="Previous day" onClick={previousDay}>
          <TransportIcon name="previous" />
        </button>
        <button
          type="button"
          className="playback-toggle"
          onClick={togglePlaying}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          title={playing ? "Pause" : "Play"}
        >
          <TransportIcon name={playing ? "pause" : "play"} />
        </button>
        <button type="button" aria-label="Next day" title="Next day" onClick={nextDay}>
          <TransportIcon name="next" />
        </button>
      </div>

      <button type="button" className="today-button" onClick={onToday}>
        <span>Today</span>
      </button>

      <div className="speed-stepper" role="group" aria-label="Speed">
        <button
          type="button"
          className="speed-step"
          aria-label="Decrease speed"
          title="Decrease speed"
          disabled={playbackSpeed <= MIN_PLAYBACK_SPEED}
          onClick={decreaseSpeed}
        >
          −
        </button>
        <output className="speed-stepper-value">{formatSpeed(playbackSpeed)}</output>
        <button
          type="button"
          className="speed-step"
          aria-label="Increase speed"
          title="Increase speed"
          disabled={playbackSpeed >= MAX_PLAYBACK_SPEED}
          onClick={increaseSpeed}
        >
          +
        </button>
      </div>

      <label className="day-scrubber">
        <span>Day</span>
        <input
          type="range"
          min="0"
          max={DAYS_PER_YEAR - 1}
          value={selectedIndex}
          onChange={(event) => onSelectIndex(Number(event.target.value))}
        />
        <output>
          {gregorianYearDay.day}/{gregorianYearDay.daysInYear}
        </output>
      </label>
    </section>
  );
});

type TransportIconName =
  | "previous"
  | "play"
  | "pause"
  | "next";

function TransportIcon({ name }: { name: TransportIconName }) {
  return (
    <svg
      className={`transport-icon ${name === "play" ? "is-filled" : ""}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}

const iconPaths: Record<TransportIconName, ReactNode> = {
  previous: <path d="m15 18-6-6 6-6" />,
  play: <path d="M8 5v14l11-7L8 5Z" />,
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  next: <path d="m9 18 6-6-6-6" />,
};

function formatSpeed(speed: number): string {
  return `${Math.round(speed)}x`;
}
