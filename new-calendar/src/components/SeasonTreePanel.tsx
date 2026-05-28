import { Suspense, lazy, memo, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";

const SeasonTreeScene = lazy(() =>
  import("../visualization/SeasonTreeScene").then((module) => ({
    default: module.SeasonTreeScene,
  })),
);

interface SeasonTreePanelProps {
  calendarDate: import("../lib/newCalendar").NewCalendarDate;
}

export const SeasonTreePanel = memo(function SeasonTreePanel({
  calendarDate,
}: SeasonTreePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={panelRef}
      className="season-tree-panel bento-fullscreenable"
      aria-label="Tree panel"
    >
      <div className="panel-title-row">
        <h2>Tree</h2>
        <div className="panel-actions">
          <FullscreenButton label="Full screen tree" targetRef={panelRef} />
        </div>
      </div>

      <Suspense fallback={<div className="scene-loading" role="status">Loading tree</div>}>
        <SeasonTreeScene calendarDate={calendarDate} />
      </Suspense>
    </section>
  );
});
