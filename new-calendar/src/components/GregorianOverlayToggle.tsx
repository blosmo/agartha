import { memo } from "react";

interface GregorianOverlayToggleProps {
  gregorianChecked: boolean;
  onGregorianChange: (checked: boolean) => void;
}

export const GregorianOverlayToggle = memo(function GregorianOverlayToggle({
  gregorianChecked,
  onGregorianChange,
}: GregorianOverlayToggleProps) {
  return (
    <div className="global-comparison-control">
      <button
        type="button"
        role="switch"
        className={gregorianChecked ? "is-active gregorian-active" : undefined}
        aria-checked={gregorianChecked}
        aria-label="Gregorian"
        onClick={() => onGregorianChange(!gregorianChecked)}
      >
        <span className="calendar-layer-switch" aria-hidden="true" />
        <span>Gregorian</span>
      </button>
    </div>
  );
});
