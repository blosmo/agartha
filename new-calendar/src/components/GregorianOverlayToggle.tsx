import { memo } from "react";
import type { ComparisonMode } from "../lib/comparisonMode";

interface GregorianOverlayToggleProps {
  checked: boolean;
  comparisonMode: ComparisonMode;
  onChange: (checked: boolean) => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
}

export const GregorianOverlayToggle = memo(function GregorianOverlayToggle({
  checked,
  comparisonMode,
  onChange,
  onComparisonModeChange,
}: GregorianOverlayToggleProps) {
  return (
    <div className="global-comparison-control">
      <label className="overlay-toggle global-overlay-toggle">
        <span>
          <strong>Gregorian</strong>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <i aria-hidden="true" />
      </label>

      <div
        className={`compare-mode-control ${checked ? "" : "is-disabled"}`.trim()}
        aria-disabled={!checked}
      >
        <span>Compare</span>
        <div className="compare-mode-buttons" role="group" aria-label="Compare">
          <button
            type="button"
            className={comparisonMode === "overlay" ? "is-active" : ""}
            disabled={!checked}
            aria-pressed={comparisonMode === "overlay"}
            onClick={() => onComparisonModeChange("overlay")}
          >
            Overlay
          </button>
          <button
            type="button"
            className={comparisonMode === "split" ? "is-active" : ""}
            disabled={!checked}
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
