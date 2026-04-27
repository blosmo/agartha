export interface TimeControlsProps {
  readonly tick: number;
  readonly isPlaying: boolean;
  readonly onStep: () => void;
  readonly onTogglePlay: () => void;
  readonly onResetTime: () => void;
}

export function TimeControls({
  tick,
  isPlaying,
  onStep,
  onTogglePlay,
  onResetTime,
}: TimeControlsProps) {
  return (
    <section className="inspector-panel time-controls" aria-label="Time controls">
      <h2>Time Controls</h2>
      <div className="time-controls__readout">Tick {tick}</div>
      <div className="time-controls__buttons">
        <button onClick={onStep} type="button">
          Step time
        </button>
        <button aria-pressed={isPlaying} onClick={onTogglePlay} type="button">
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={onResetTime} type="button">
          Reset time
        </button>
      </div>
    </section>
  );
}
