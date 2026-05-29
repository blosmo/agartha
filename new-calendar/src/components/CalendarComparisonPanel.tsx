import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FullscreenButton } from "./FullscreenButton";
import { SeasonalYearClockPanel } from "./SeasonalYearClockPanel";
import { SunlightLinesPanel } from "./SunlightChart";
import {
  DAYS_PER_MONTH,
  DAYS_PER_SEASON,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  MONTH_NAMES,
  PLANETARY_DAYS,
  REFLECTION_DAY_IN_SEASON,
  SEASONS,
  normalDayIndexFromDate,
  type NewCalendarDate,
} from "../lib/newCalendar";
import {
  GREGORIAN_SEASONS,
  GREGORIAN_SEASON_COLORS,
  describeGregorianSeason,
  describeGregorianYearDay,
  gregorianYearProgress,
} from "../lib/gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";

interface CalendarComparisonPanelProps {
  calendarDate: NewCalendarDate;
  showNewCalendar: boolean;
  showGregorianOverlay: boolean;
  onSelectIndex: (index: number) => void;
}

const gregorianWeekdays = ["S", "M", "T", "W", "T", "F", "S"];
const newCalendarWeekdayLabels = PLANETARY_DAYS.map((day) => day.slice(0, 2));
const newMonthCells = Array.from({ length: DAYS_PER_MONTH }, (_, index) => ({
  key: `new-${index + 1}`,
  label: String(index + 1),
}));
const newMonthStripMonths = MONTH_NAMES.map((month) => ({
  label: shortNewMonth(month),
  days: DAYS_PER_MONTH,
  source: month,
}));
const shortMonthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
const longMonthFormatter = new Intl.DateTimeFormat(undefined, { month: "long" });

export const CalendarComparisonPanel = memo(function CalendarComparisonPanel({
  calendarDate,
  showNewCalendar,
  showGregorianOverlay,
  onSelectIndex,
}: CalendarComparisonPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);
  const gregorianYearDay = describeGregorianYearDay(calendarDate.gregorianDate);
  const normalDate = !calendarDate.isReflectionDay;
  const gregorianYear = calendarDate.gregorianDate.getFullYear();
  const gregorianMonthIndex = calendarDate.gregorianDate.getMonth();
  const gregorianDay = calendarDate.gregorianDate.getDate();
  const gregorianMonth = useMemo(
    () => makeGregorianMonth(gregorianYear, gregorianMonthIndex, gregorianDay),
    [gregorianDay, gregorianMonthIndex, gregorianYear],
  );
  const gregorianStripMonths = useMemo(
    () => makeGregorianStripMonths(gregorianYear, gregorianMonthIndex),
    [gregorianMonthIndex, gregorianYear],
  );
  const newMonthLabel = calendarDate.monthName;
  const newMonthActiveDay = calendarDate.dayOfMonth;
  const newMonthGridCells = useMemo(
    () =>
      newMonthCells.map((cell, index) => ({
        ...cell,
        active: newMonthActiveDay === index + 1,
        selectIndex:
          calendarDate.monthIndex === null
            ? undefined
            : indexForNewMonthDay(calendarDate.monthIndex, index + 1),
      })),
    [calendarDate.monthIndex, newMonthActiveDay],
  );
  const activeNewMonthStrip = useMemo(
    () =>
      newMonthStripMonths.map((month) => ({
        label: month.label,
        days: month.days,
        active: month.source === calendarDate.monthName,
      })),
    [calendarDate.monthName],
  );
  const newCalendarReadoutRows = useMemo(
    () => buildNewCalendarReadoutRows(calendarDate, normalDate, gregorianYearDay),
    [calendarDate, gregorianYearDay, normalDate],
  );
  const gregorianReadoutRows = useMemo(
    () =>
      buildGregorianReadoutRows(
        calendarDate,
        gregorianSeason,
        gregorianYearDay,
        gregorianMonth.label,
      ),
    [calendarDate, gregorianMonth.label, gregorianSeason, gregorianYearDay],
  );
  const compareSideBySide = showNewCalendar && showGregorianOverlay;
  const chartPanelProps = {
    calendarDate,
    showNewCalendar,
    showGregorianOverlay,
    onSelectIndex,
    embedded: true as const,
  };

  return (
    <aside
      ref={panelRef}
      className="comparison-panel bento-fullscreenable"
      aria-label="Calendar panel"
    >
      <div className="panel-title-row">
        <h2>Calendar</h2>
        <FullscreenButton label="Full screen calendar" targetRef={panelRef} />
      </div>

      <div className="calendar-panel-body">
        <div
          className={`calendar-readout-columns ${
            showNewCalendar && showGregorianOverlay ? "is-comparing" : ""
          }`.trim()}
        >
          {showNewCalendar && (
            <div className="calendar-readout-column new-calendar-readout-column">
              <h3>New Calendar</h3>
              <ComparisonReadoutGrid rows={newCalendarReadoutRows} />
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
              <h3>Gregorian</h3>
              <ComparisonReadoutGrid rows={gregorianReadoutRows} />
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

        <div className="calendar-panel-months">
          <div
            className={`month-system-grid ${
              compareSideBySide ? "is-comparing" : "single-month-system"
            }`.trim()}
          >
            {showNewCalendar && (
              <article className="month-system-card new-calendar-months">
                <div className="month-system-heading">
                  <strong>{newMonthLabel}</strong>
                </div>

                <MonthGrid
                  className="new-month-grid"
                  columns={DAYS_PER_WEEK}
                  labels={newCalendarWeekdayLabels}
                  cells={newMonthGridCells}
                  onSelectIndex={onSelectIndex}
                />
              </article>
            )}

            {showGregorianOverlay && (
              <article className="month-system-card gregorian-months">
                <div className="month-system-heading">
                  <strong>{gregorianMonth.label}</strong>
                </div>

                <MonthGrid
                  className="gregorian-month-grid"
                  columns={7}
                  labels={gregorianWeekdays}
                  cells={gregorianMonth.cells}
                  onSelectIndex={onSelectIndex}
                />
              </article>
            )}
          </div>

          <div
            className={`month-strip-comparison ${
              compareSideBySide ? "is-comparing" : ""
            }`.trim()}
            aria-label="Month length comparison"
          >
            {showNewCalendar && (
              <MonthStrip
                label="New Calendar"
                months={activeNewMonthStrip}
              />
            )}
            {showGregorianOverlay && (
              <MonthStrip
                label="Gregorian"
                months={gregorianStripMonths}
              />
            )}
          </div>
        </div>

        {compareSideBySide ? (
          <div
            className="calendar-charts-compare"
            aria-label="Sunlight and season clock comparison"
          >
            {showNewCalendar && (
              <div className="calendar-charts-column new-calendar-charts-column">
                <SunlightLinesPanel {...chartPanelProps} focusSystem="new" />
                <SeasonalYearClockPanel {...chartPanelProps} focusSystem="new" />
              </div>
            )}
            {showGregorianOverlay && (
              <div className="calendar-charts-column gregorian-charts-column">
                <SunlightLinesPanel {...chartPanelProps} focusSystem="gregorian" />
                <SeasonalYearClockPanel {...chartPanelProps} focusSystem="gregorian" />
              </div>
            )}
          </div>
        ) : (
          <div className="calendar-charts-stack">
            {showNewCalendar && <SunlightLinesPanel {...chartPanelProps} />}
            {showGregorianOverlay && !showNewCalendar && (
              <SunlightLinesPanel {...chartPanelProps} />
            )}
            {(showNewCalendar || showGregorianOverlay) && (
              <SeasonalYearClockPanel {...chartPanelProps} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
});

interface ComparisonReadoutRow {
  label: string;
  value: ReactNode;
}

function ComparisonReadoutGrid({ rows }: { rows: ComparisonReadoutRow[] }) {
  return (
    <dl className="readout-grid" data-readout-rows={rows.length}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function buildNewCalendarReadoutRows(
  calendarDate: NewCalendarDate,
  normalDate: boolean,
  gregorianYearDay: ReturnType<typeof describeGregorianYearDay>,
): ComparisonReadoutRow[] {
  return [
    {
      label: "Date",
      value: calendarDate.gregorianLabel,
    },
    {
      label: "Year day",
      value: (
        <>
          {gregorianYearDay.day}
          <span>/{gregorianYearDay.daysInYear}</span>
        </>
      ),
    },
    {
      label: "Season",
      value: calendarDate.season,
    },
    {
      label: "Season day",
      value: (
        <>
          {calendarDate.dayOfSeason}
          <span>/{DAYS_PER_SEASON}</span>
        </>
      ),
    },
    {
      label: "Season count",
      value: "5 seasons",
    },
    {
      label: "Month",
      value: calendarDate.isReflectionDay ? "Reflection" : calendarDate.monthName,
    },
    {
      label: "Number of days in the month",
      value: normalDate ? DAYS_PER_MONTH : "Midpoint",
    },
    {
      label: "Number of days in the week",
      value: DAYS_PER_WEEK,
    },
  ];
}

function buildGregorianReadoutRows(
  calendarDate: NewCalendarDate,
  gregorianSeason: ReturnType<typeof describeGregorianSeason>,
  gregorianYearDay: ReturnType<typeof describeGregorianYearDay>,
  gregorianMonthLabel: string,
): ComparisonReadoutRow[] {
  const daysInMonth = daysInGregorianMonth(
    calendarDate.gregorianDate.getFullYear(),
    calendarDate.gregorianDate.getMonth(),
  );

  return [
    {
      label: "Date",
      value: calendarDate.gregorianLabel,
    },
    {
      label: "Year day",
      value: (
        <>
          {gregorianYearDay.day}
          <span>/{gregorianYearDay.daysInYear}</span>
        </>
      ),
    },
    {
      label: "Season",
      value: gregorianSeason.season,
    },
    {
      label: "Season day",
      value: (
        <>
          {gregorianSeason.dayOfSeason}
          <span>/{gregorianSeason.daysInSeason}</span>
        </>
      ),
    },
    {
      label: "Season count",
      value: "4 seasons",
    },
    {
      label: "Month",
      value: gregorianMonthLabel,
    },
    {
      label: "Number of days in the month",
      value: daysInMonth,
    },
    {
      label: "Number of days in the week",
      value: 7,
    },
  ];
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

function MonthGrid({
  className,
  columns,
  labels,
  cells,
  onSelectIndex,
}: {
  className: string;
  columns: number;
  labels: string[];
  cells: Array<{ key: string; label: string; active?: boolean; muted?: boolean; selectIndex?: number }>;
  onSelectIndex?: (index: number) => void;
}) {
  return (
    <div
      className={`month-grid ${className}`}
      style={{ "--month-columns": columns } as CSSProperties}
    >
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className="month-grid-label">
          {label}
        </span>
      ))}
      {cells.map((cell) => {
        const cellClassName = [
          "month-day-cell",
          cell.active ? "is-active" : "",
          cell.muted ? "is-muted" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (typeof cell.selectIndex === "number" && onSelectIndex) {
          return (
            <button
              key={cell.key}
              type="button"
              className={cellClassName}
              aria-label={`Select day ${cell.label}`}
              onClick={() => onSelectIndex(cell.selectIndex!)}
            >
              {cell.label}
            </button>
          );
        }

        return (
          <span key={cell.key} className={cellClassName}>
            {cell.label}
          </span>
        );
      })}
    </div>
  );
}

function MonthStrip({
  label,
  months,
}: {
  label: string;
  months: Array<{ label: string; days: number; active: boolean }>;
}) {
  return (
    <div className={`month-strip ${label === "Gregorian" ? "gregorian-month-strip" : "new-calendar-month-strip"}`}>
      <div className="month-strip-heading">
        <span>{label}</span>
      </div>
      <div className="month-strip-grid">
        {months.map((month, index) => (
          <span
            key={`${month.label}-${index}`}
            className={month.active ? "is-active" : ""}
            style={{ "--month-days": month.days } as CSSProperties}
          >
            <b>{month.label}</b>
            <em>{month.days}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function makeGregorianMonth(year: number, monthIndex: number, activeDay: number) {
  const date = new Date(year, monthIndex, 1);
  const daysInMonth = daysInGregorianMonth(year, monthIndex);
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const weekRows = Math.ceil((startWeekday + daysInMonth) / 7);
  const cellCount = weekRows * 7;

  return {
    label: monthLabel(date, "long"),
    daysInMonth,
    weekRows,
    cells: Array.from({ length: cellCount }, (_, index) => {
      const day = index - startWeekday + 1;
      const inMonth = day >= 1 && day <= daysInMonth;

      return {
        key: `gregorian-${index}`,
        label: inMonth ? String(day) : "",
        active: inMonth && day === activeDay,
        muted: !inMonth,
        selectIndex: inMonth ? normalDayIndexFromDate(new Date(year, monthIndex, day)) : undefined,
      };
    }),
  };
}

function indexForNewMonthDay(monthIndex: number, dayOfMonth: number): number {
  const seasonIndex = Math.floor(monthIndex / 2);
  const monthWithinSeason = monthIndex % 2;
  const dayZeroInSeason =
    monthWithinSeason === 0 ? dayOfMonth - 1 : REFLECTION_DAY_IN_SEASON + dayOfMonth - 1;
  return seasonIndex * DAYS_PER_SEASON + dayZeroInSeason;
}

function makeGregorianStripMonths(year: number, activeMonthIndex: number) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const date = new Date(year, monthIndex, 1);
    return {
      label: monthLabel(date, "short"),
      days: daysInGregorianMonth(year, monthIndex),
      active: monthIndex === activeMonthIndex,
    };
  });
}

function daysInGregorianMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthLabel(date: Date, month: "short" | "long"): string {
  return (month === "short" ? shortMonthFormatter : longMonthFormatter).format(date);
}

function shortNewMonth(month: string): string {
  return month
    .split(" ")
    .map((part) => part[0])
    .join("");
}
