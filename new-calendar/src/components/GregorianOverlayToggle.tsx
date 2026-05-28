import { memo } from "react";
import type { ComparisonMode } from "../lib/comparisonMode";

interface GregorianOverlayToggleProps {
  newChecked: boolean;
  gregorianChecked: boolean;
  comparisonMode: ComparisonMode;
  onNewChange: (checked: boolean) => void;
  onGregorianChange: (checked: boolean) => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
}

export const GregorianOverlayToggle = memo(function GregorianOverlayToggle({
  newChecked,
  gregorianChecked,
  comparisonMode,
  onNewChange,
  onGregorianChange,
  onComparisonModeChange,
}: GregorianOverlayToggleProps) {
  return (
    <div className="global-comparison-control">
      <div className="calendar-layer-toggle" aria-label="Calendar layers">
        <label className={newChecked ? "is-active" : ""}>
          <input
            type="checkbox"
            checked={newChecked}
            onChange={(event) => onNewChange(event.target.checked)}
          />
          <span className="calendar-layer-check" aria-hidden="true" />
          <span>New</span>
        </label>
        <label className={gregorianChecked ? "is-active gregorian-active" : ""}>
          <input
            type="checkbox"
            checked={gregorianChecked}
            onChange={(event) => onGregorianChange(event.target.checked)}
          />
          <span className="calendar-layer-check" aria-hidden="true" />
          <span>Gregorian</span>
        </label>
      </div>

      <div
        className={`compare-mode-control ${newChecked && gregorianChecked ? "" : "is-disabled"}`.trim()}
        aria-disabled={!(newChecked && gregorianChecked)}
      >
        <div className="compare-mode-buttons" role="group" aria-label="Compare">
          <button
            type="button"
            className={comparisonMode === "overlay" ? "is-active" : ""}
            disabled={!(newChecked && gregorianChecked)}
            aria-pressed={comparisonMode === "overlay"}
            onClick={() => onComparisonModeChange("overlay")}
          >
            Overlay
          </button>
          <button
            type="button"
            className={comparisonMode === "split" ? "is-active" : ""}
            disabled={!(newChecked && gregorianChecked)}
            aria-pressed={comparisonMode === "split"}
            onClick={() => onComparisonModeChange("split")}
          >
            Split
          </button>
        </div>
      </div>
    </div>
  );
});
