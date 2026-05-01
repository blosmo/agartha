import { memo, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import type { ComparisonMode } from "../lib/comparisonMode";
import { DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS, type NewCalendarDate } from "../lib/newCalendar";
import {
  GREGORIAN_SEASONS,
  GREGORIAN_SEASON_COLORS,
  describeGregorianSeason,
  gregorianYearProgress,
} from "../lib/gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";

interface CalendarComparisonPanelProps {
  calendarDate: NewCalendarDate;
  showGregorianOverlay: boolean;
  comparisonMode: ComparisonMode;
}

export const CalendarComparisonPanel = memo(function CalendarComparisonPanel({
  calendarDate,
  showGregorianOverlay,
  comparisonMode,
}: CalendarComparisonPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);
  const gregorianYearDay = dayOfGregorianYear(calendarDate.gregorianDate);
  const normalDate = !calendarDate.isReflectionDay;

  return (
    <aside
      ref={panelRef}
      className="comparison-panel bento-fullscreenable"
      aria-label="Date panel"
    >
      <div className="panel-title-row">
        <h2>Date</h2>
        <FullscreenButton label="Full screen date" targetRef={panelRef} />
      </div>

      <div
        className={`calendar-readout-columns ${
          showGregorianOverlay ? `is-comparing compare-${comparisonMode}` : ""
        }`.trim()}
      >
        <div className="calendar-readout-column new-calendar-readout-column">
          <span>New Calendar</span>
          <h3>{calendarDate.isReflectionDay ? calendarDate.monthName : calendarDate.season}</h3>
          <dl className="readout-grid">
            <div>
              <dt>Season day</dt>
              <dd>
                {calendarDate.dayOfSeason}
                <span>/{DAYS_PER_SEASON}</span>
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
              <dt>Date</dt>
              <dd>{calendarDate.gregorianLabel}</dd>
            </div>
          </dl>
          <SeasonBar
            label="New Calendar"
            count={5}
            activeIndex={calendarDate.seasonIndex}
            progress={(calendarDate.index + 1) / DAYS_PER_YEAR}
            names={SEASONS}
            colors={SEASON_COLORS}
          />
        </div>

        {showGregorianOverlay && (
          <div className="calendar-readout-column gregorian-readout-column">
            <span>Gregorian</span>
            <h3>{gregorianSeason.season}</h3>
            <dl className="readout-grid">
              <div>
                <dt>Season day</dt>
                <dd>
                  {gregorianSeason.dayOfSeason}
                  <span>/{gregorianSeason.daysInSeason}</span>
                </dd>
              </div>
              <div>
                <dt>Season count</dt>
                <dd>4 seasons</dd>
              </div>
              <div>
                <dt>Calendar date</dt>
                <dd>{calendarDate.gregorianLabel}</dd>
              </div>
              <div>
                <dt>Year day</dt>
                <dd>
                  {gregorianYearDay}
                  <span>/365</span>
                </dd>
              </div>
            </dl>
            <SeasonBar
              label="Gregorian"
              count={4}
              activeIndex={gregorianSeason.seasonIndex}
              progress={gregorianYearProgress(calendarDate.gregorianDate)}
              names={GREGORIAN_SEASONS}
              colors={GREGORIAN_SEASON_COLORS}
            />
          </div>
        )}
      </div>
    </aside>
  );
});

function dayOfGregorianYear(date: Date): number {
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const yearStart = Date.UTC(date.getFullYear(), 0, 1);
  return Math.floor((current - yearStart) / (24 * 60 * 60 * 1000)) + 1;
}

function SeasonBar({
  label,
  count,
  activeIndex,
  progress,
  names,
  colors,
}: {
  label: string;
  count: number;
  activeIndex: number;
  progress: number;
  names: string[];
  colors: string[];
}) {
  return (
    <div className={`season-bar ${label === "Gregorian" ? "gregorian-season-bar" : "new-calendar-season-bar"}`}>
      <div className="season-bar-heading">
        <span>{label}</span>
        <strong>{names[activeIndex]}</strong>
      </div>
      <div className="season-track">
        {Array.from({ length: count }, (_, index) => (
          <span
            key={names[index]}
            className={index === activeIndex ? "is-active" : ""}
            style={{ backgroundColor: colors[index] }}
          />
        ))}
        <i style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
    </div>
  );
}
