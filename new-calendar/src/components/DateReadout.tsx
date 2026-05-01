import { useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import type { NewCalendarDate } from "../lib/newCalendar";

interface DateReadoutProps {
  calendarDate: NewCalendarDate;
}

export function DateReadout({ calendarDate }: DateReadoutProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const normalDate = !calendarDate.isReflectionDay;

  return (
    <section
      ref={panelRef}
      className="date-readout bento-fullscreenable"
      aria-label="Selected calendar position"
    >
      <div className="panel-title-row">
        <div>
          <p className="eyeline">Selected position</p>
          <h1>{calendarDate.isReflectionDay ? calendarDate.monthName : calendarDate.season}</h1>
        </div>
        <FullscreenButton label="Full screen selected position" targetRef={panelRef} />
      </div>

      <dl className="readout-grid">
        <div>
          <dt>Season day</dt>
          <dd>
            {calendarDate.dayOfSeason}
            <span>/73</span>
          </dd>
        </div>
        <div>
          <dt>Month</dt>
          <dd>{calendarDate.isReflectionDay ? "Reflection" : calendarDate.monthName}</dd>
        </div>
        <div>
          <dt>Week rhythm</dt>
          <dd>{normalDate ? `Week ${calendarDate.weekOfMonth}, ${calendarDate.planetaryDay}` : "Midpoint"}</dd>
        </div>
        <div>
          <dt>Gregorian</dt>
          <dd>{calendarDate.gregorianLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
