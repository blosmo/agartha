import { DAYS_PER_YEAR, type OverlayMode } from "../lib/newCalendar";

interface TimeControlsProps {
  selectedIndex: number;
  overlayMode: OverlayMode;
  krystalStage: number;
  playing: boolean;
  onSelectIndex: (index: number) => void;
  onOverlayModeChange: (mode: OverlayMode) => void;
  onKrystalStageChange: (stage: number) => void;
  onToday: () => void;
  onPlayingChange: (playing: boolean) => void;
}

const modes: Array<{ value: OverlayMode; label: string }> = [
  { value: "calendar", label: "Calendar" },
  { value: "krystal", label: "Krystal" },
  { value: "compare", label: "Compare" },
];

export function TimeControls({
  selectedIndex,
  overlayMode,
  krystalStage,
  playing,
  onSelectIndex,
  onOverlayModeChange,
  onKrystalStageChange,
  onToday,
  onPlayingChange,
}: TimeControlsProps) {
  return (
    <section className="time-controls" aria-label="Time controls">
      <div className="control-row">
        <button type="button" onClick={onToday}>
          Today
        </button>
        <button type="button" onClick={() => onPlayingChange(!playing)} aria-pressed={playing}>
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <label className="slider-label">
        <span>Year position</span>
        <output>{selectedIndex + 1}/365</output>
        <input
          type="range"
          min="0"
          max={DAYS_PER_YEAR - 1}
          value={selectedIndex}
          onChange={(event) => onSelectIndex(Number(event.target.value))}
        />
      </label>

      <div className="segmented" role="group" aria-label="Overlay mode">
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={overlayMode === mode.value ? "is-active" : ""}
            onClick={() => onOverlayModeChange(mode.value)}
            aria-pressed={overlayMode === mode.value}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <label className="slider-label compact">
        <span>Spiral stages</span>
        <output>{krystalStage}</output>
        <input
          type="range"
          min="2"
          max="14"
          value={krystalStage}
          onChange={(event) => onKrystalStageChange(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
