import {
  memo,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FullscreenButton } from "./FullscreenButton";
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
  showNewCalendar: boolean;
  showGregorianOverlay: boolean;
  onSelectIndex: (index: number) => void;
}

export const CalendarComparisonPanel = memo(function CalendarComparisonPanel({
  calendarDate,
  showNewCalendar,
  showGregorianOverlay,
  onSelectIndex,
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
          showNewCalendar && showGregorianOverlay ? "is-comparing" : ""
        }`.trim()}
      >
        {showNewCalendar && (
          <div className="calendar-readout-column new-calendar-readout-column">
            {showGregorianOverlay && <span>New Calendar</span>}
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
              onSelectIndex={onSelectIndex}
            />
          </div>
        )}

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
  onSelectIndex,
}: {
  label: string;
  count: number;
  activeIndex: number;
  progress: number;
  names: string[];
  colors: string[];
  onSelectIndex?: (index: number) => void;
}) {
  const draggingRef = useRef(false);
  const isInteractive = Boolean(onSelectIndex);
  const progressPercent = Math.min(100, Math.max(0, progress * 100));
  const currentIndex = Math.min(
    DAYS_PER_YEAR - 1,
    Math.max(0, Math.round(progress * DAYS_PER_YEAR) - 1),
  );

  const selectFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!onSelectIndex) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = rect.width <= 0 ? 0 : (event.clientX - rect.left) / rect.width;
      const nextIndex = Math.min(
        DAYS_PER_YEAR - 1,
        Math.max(0, Math.floor(ratio * DAYS_PER_YEAR)),
      );
      onSelectIndex(nextIndex);
    },
    [onSelectIndex],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!onSelectIndex) return;
      draggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      selectFromPointer(event);
      event.preventDefault();
    },
    [onSelectIndex, selectFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      selectFromPointer(event);
    },
    [selectFromPointer],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!onSelectIndex) return;

      const keyOffsets: Record<string, number> = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -DAYS_PER_SEASON,
        PageUp: DAYS_PER_SEASON,
      };

      if (event.key === "Home") {
        onSelectIndex(0);
      } else if (event.key === "End") {
        onSelectIndex(DAYS_PER_YEAR - 1);
      } else if (event.key in keyOffsets) {
        onSelectIndex(
          Math.min(DAYS_PER_YEAR - 1, Math.max(0, currentIndex + keyOffsets[event.key])),
        );
      } else {
        return;
      }

      event.preventDefault();
    },
    [currentIndex, onSelectIndex],
  );

  return (
    <div className={`season-bar ${label === "Gregorian" ? "gregorian-season-bar" : "new-calendar-season-bar"}`}>
      {!isInteractive && (
        <div className="season-bar-heading">
          <span>{label}</span>
          <strong>{names[activeIndex]}</strong>
        </div>
      )}
      <div
        className={`season-track ${isInteractive ? "is-draggable" : ""}`}
        role={isInteractive ? "slider" : undefined}
        aria-label={isInteractive ? "New Calendar year progress" : undefined}
        aria-valuemin={isInteractive ? 1 : undefined}
        aria-valuemax={isInteractive ? DAYS_PER_YEAR : undefined}
        aria-valuenow={isInteractive ? Math.round(progress * DAYS_PER_YEAR) : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onKeyDown={handleKeyDown}
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            key={names[index]}
            className={index === activeIndex ? "is-active" : ""}
            style={{ backgroundColor: colors[index] }}
          />
        ))}
        <i style={{ left: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
