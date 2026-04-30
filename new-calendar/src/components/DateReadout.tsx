import type { NewCalendarDate } from "../lib/newCalendar";
import { roundRatio } from "../lib/krystalSpiral";

interface DateReadoutProps {
  calendarDate: NewCalendarDate;
  krystalStage: number;
}

export function DateReadout({ calendarDate, krystalStage }: DateReadoutProps) {
  const normalDate = !calendarDate.isReflectionDay;

  return (
    <section className="date-readout" aria-label="Selected calendar position">
      <div>
        <p className="eyeline">Selected position</p>
        <h1>{calendarDate.isReflectionDay ? calendarDate.monthName : calendarDate.season}</h1>
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

      <div className="krystal-meter">
        <span>Krystal stage {krystalStage}</span>
        <strong>x{roundRatio(Math.SQRT2 ** krystalStage)}</strong>
      </div>
    </section>
  );
}
