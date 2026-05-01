import { memo, type CSSProperties, useMemo, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import type { ComparisonMode } from "../lib/comparisonMode";
import {
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  MONTH_NAMES,
  PLANETARY_DAYS,
  type NewCalendarDate,
} from "../lib/newCalendar";

interface MonthStructurePanelProps {
  calendarDate: NewCalendarDate;
  showGregorianOverlay: boolean;
  comparisonMode: ComparisonMode;
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

export const MonthStructurePanel = memo(function MonthStructurePanel({
  calendarDate,
  showGregorianOverlay,
  comparisonMode,
}: MonthStructurePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
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
      })),
    [newMonthActiveDay],
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

  return (
    <section
      ref={panelRef}
      className="month-structure-panel bento-fullscreenable"
      aria-label="Months panel"
    >
      <div className="structure-heading">
        <h2>Months</h2>
        <FullscreenButton label="Full screen months" targetRef={panelRef} />
      </div>

      <div
        className={`month-system-grid ${
          showGregorianOverlay ? `is-comparing compare-${comparisonMode}` : "single-month-system"
        }`.trim()}
      >
        <article className="month-system-card new-calendar-months">
          <div className="month-system-heading">
            <span>New Calendar</span>
            <strong>{newMonthLabel}</strong>
            <em>36 days · 4 weeks · 9-day rhythm</em>
          </div>

          <MonthGrid
            className="new-month-grid"
            columns={DAYS_PER_WEEK}
            labels={newCalendarWeekdayLabels}
            cells={newMonthGridCells}
          />
        </article>

        {showGregorianOverlay && (
          <article className="month-system-card gregorian-months">
            <div className="month-system-heading">
              <span>Gregorian</span>
              <strong>{gregorianMonth.label}</strong>
              <em>
                {gregorianMonth.daysInMonth} days · {gregorianMonth.weekRows} calendar weeks · 7-day rhythm
              </em>
            </div>

            <MonthGrid
              className="gregorian-month-grid"
              columns={7}
              labels={gregorianWeekdays}
              cells={gregorianMonth.cells}
            />
          </article>
        )}
      </div>

      <div className="month-strip-comparison" aria-label="Month length comparison">
        <MonthStrip
          label="New Calendar"
          months={activeNewMonthStrip}
        />
        {showGregorianOverlay && (
          <MonthStrip
            label="Gregorian"
            months={gregorianStripMonths}
          />
        )}
      </div>
    </section>
  );
});

function MonthGrid({
  className,
  columns,
  labels,
  cells,
}: {
  className: string;
  columns: number;
  labels: string[];
  cells: Array<{ key: string; label: string; active?: boolean; muted?: boolean }>;
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
      {cells.map((cell) => (
        <span
          key={cell.key}
          className={[
            "month-day-cell",
            cell.active ? "is-active" : "",
            cell.muted ? "is-muted" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {cell.label}
        </span>
      ))}
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
      };
    }),
  };
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
