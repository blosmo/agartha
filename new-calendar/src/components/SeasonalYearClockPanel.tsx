import {
  memo,
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { FullscreenButton } from "./FullscreenButton";
import {
  annularSlicePath,
  indexFromClockPointer,
  makeSeasonProgressPie,
  orbitMarkerPosition,
  pieSlicePath,
  seasonClockLayout,
  starPath,
  type SeasonClockSystem,
  type SeasonProgressPieModel,
} from "../lib/seasonalYearClock";
import { SEASON_COLORS } from "../visualization/calendarGeometry";
import {
  describeGregorianSeason,
  GREGORIAN_SEASON_COLORS,
} from "../lib/gregorianSeasons";
import { type NewCalendarDate } from "../lib/newCalendar";

interface SeasonalYearClockPanelProps {
  calendarDate: NewCalendarDate;
  showNewCalendar?: boolean;
  showGregorianOverlay?: boolean;
  onSelectIndex: (index: number) => void;
  embedded?: boolean;
  focusSystem?: SeasonClockSystem;
}

export const SeasonalYearClockPanel = memo(function SeasonalYearClockPanel({
  calendarDate,
  showNewCalendar = true,
  showGregorianOverlay = false,
  onSelectIndex,
  embedded = false,
  focusSystem,
}: SeasonalYearClockPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const compareSideBySide =
    showNewCalendar && showGregorianOverlay && !focusSystem;
  const showNewClock = focusSystem === "new" || (showNewCalendar && focusSystem !== "gregorian");
  const showGregorianClock =
    focusSystem === "gregorian" || (showGregorianOverlay && focusSystem !== "new");
  const TitleTag = embedded ? "h3" : "h2";

  const newModel = useMemo(
    () => makeSeasonProgressPie("new", calendarDate),
    [calendarDate],
  );
  const gregorianModel = useMemo(
    () => makeSeasonProgressPie("gregorian", calendarDate),
    [calendarDate],
  );
  const gregorianSeason = useMemo(
    () => describeGregorianSeason(calendarDate.gregorianDate),
    [calendarDate.gregorianDate],
  );

  const selectFromPointer = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onSelectIndex(
        indexFromClockPointer(
          event.clientX,
          event.clientY,
          rect,
          calendarDate.seasonIndex,
        ),
      );
    },
    [calendarDate.seasonIndex, onSelectIndex],
  );

  const startDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      selectFromPointer(event);
    },
    [selectFromPointer],
  );

  const continueDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      selectFromPointer(event);
    },
    [selectFromPointer],
  );

  const stopDrag = useCallback((event: PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <section
      ref={panelRef}
      className={
        embedded
          ? "calendar-chart-subsection calendar-season-clock-subsection bento-fullscreenable"
          : "season-clock-panel bento-fullscreenable"
      }
      aria-label={embedded ? "Season clock chart" : "Season clock panel"}
    >
      <div className={embedded ? "calendar-subsection-heading" : "chart-heading"}>
        <TitleTag>Season clock</TitleTag>
        <div className="panel-actions">
          <FullscreenButton label="Full screen season clock" targetRef={panelRef} />
        </div>
      </div>

      <div
        className={`season-clock-view ${compareSideBySide ? "compare-clocks" : ""} ${
          focusSystem ? "season-clock-view--focused" : ""
        }`.trim()}
      >
        {showNewClock ? (
          <SeasonProgressPieCard
            title="New Calendar"
            showTitle={Boolean(focusSystem || showGregorianOverlay)}
            system="new"
            model={newModel}
            seasonStroke={SEASON_COLORS[calendarDate.seasonIndex]}
            ariaLabel={
              compareSideBySide || focusSystem === "new"
                ? `New Calendar season clock, ${daylightHoursLabel(newModel.daylightHours)} daylight`
                : `Season clock, ${daylightHoursLabel(newModel.daylightHours)} daylight`
            }
            onPointerDown={startDrag}
            onPointerMove={continueDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        ) : showGregorianClock ? (
          <SeasonProgressPieCard
            title="Gregorian"
            showTitle={Boolean(focusSystem)}
            system="gregorian"
            model={gregorianModel}
            seasonStroke={GREGORIAN_SEASON_COLORS[gregorianSeason.seasonIndex]}
            ariaLabel={`Gregorian season clock, ${daylightHoursLabel(gregorianModel.daylightHours)} daylight`}
            muted
          />
        ) : null}

        {compareSideBySide && showGregorianClock && (
          <SeasonProgressPieCard
            title="Gregorian"
            system="gregorian"
            model={gregorianModel}
            seasonStroke={GREGORIAN_SEASON_COLORS[gregorianSeason.seasonIndex]}
            ariaLabel={`Gregorian season clock, ${daylightHoursLabel(gregorianModel.daylightHours)} daylight`}
            muted
          />
        )}
      </div>
    </section>
  );
});

function SeasonProgressPieCard({
  title,
  showTitle = true,
  system,
  model,
  seasonStroke,
  ariaLabel,
  muted = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  title: string;
  showTitle?: boolean;
  system: SeasonClockSystem;
  model: SeasonProgressPieModel;
  seasonStroke: string;
  ariaLabel: string;
  muted?: boolean;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: PointerEvent<SVGSVGElement>) => void;
}) {
  const layout = seasonClockLayout;
  const marker = orbitMarkerPosition(
    layout.center,
    layout.center,
    layout.orbitRadius,
    model.orbitAngleDeg,
  );
  const lightPath = pieSlicePath(
    layout.center,
    layout.center,
    layout.pieRadius,
    model.pie.lightStartAngle,
    model.pie.lightEndAngle,
  );
  const yearFillPath = annularSlicePath(
    layout.center,
    layout.center,
    layout.yearFillInnerRadius,
    layout.yearFillOuterRadius,
    model.yearFillStartAngleDeg,
    model.yearFillEndAngleDeg,
  );

  return (
    <article
      className={`season-clock-card ${system === "gregorian" ? "gregorian-season-clock-card" : "new-calendar-season-clock-card"} ${showTitle ? "" : "no-card-title"} ${muted ? "muted-season-clock-card" : ""}`.trim()}
      style={{ "--season-color": seasonStroke } as CSSProperties}
    >
      {showTitle ? <h3>{title}</h3> : null}
      <svg
        className={`season-clock-chart season-clock-chart--${system}`}
        viewBox={`0 0 ${layout.size} ${layout.size}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <circle
          className="season-clock-orbit-ring"
          cx={layout.center}
          cy={layout.center}
          r={layout.orbitRadius}
        />

        {model.ticks.map((tick) => {
          const outer = orbitMarkerPosition(
            layout.center,
            layout.center,
            layout.orbitRadius,
            tick.angleDeg,
          );
          const inner = orbitMarkerPosition(
            layout.center,
            layout.center,
            layout.orbitRadius - 8,
            tick.angleDeg,
          );

          return (
            <line
              key={`${tick.label}-${tick.angleDeg}`}
              className="season-clock-tick"
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              aria-hidden="true"
            />
          );
        })}

        {yearFillPath ? (
          <path className="season-clock-year-fill" d={yearFillPath} aria-hidden="true" />
        ) : null}

        <circle
          className="season-clock-pie-track"
          cx={layout.center}
          cy={layout.center}
          r={layout.pieRadius}
        />
        <path className="season-clock-pie-light" d={lightPath} />
        <circle
          className="season-clock-pie-ring"
          cx={layout.center}
          cy={layout.center}
          r={layout.pieRadius}
        />

        <g className="season-clock-star" aria-hidden="true">
          <path
            d={starPath(
              layout.center,
              layout.center,
              layout.starOuterRadius,
              layout.starInnerRadius,
              model.starPoints,
            )}
            className="season-clock-star-shape"
          />
        </g>

        <g className="season-clock-orbit-marker" aria-hidden="true">
          <circle className="season-clock-orbit-marker-halo" cx={marker.x} cy={marker.y} r={9} />
          <circle className="season-clock-orbit-marker-dot" cx={marker.x} cy={marker.y} r={5} />
        </g>
      </svg>

      <dl className="ring-metrics season-clock-metrics">
        <div>
          <dt>Year progress</dt>
          <dd>{percentLabel(model.yearProgress)}</dd>
        </div>
        <div className="season-metric">
          <dt>{model.seasonName} progress</dt>
          <dd>{percentLabel(model.seasonProgress)}</dd>
        </div>
        <div className="daylight-metric">
          <dt>Daylight</dt>
          <dd>{daylightHoursLabel(model.daylightHours)}</dd>
        </div>
      </dl>
    </article>
  );
}

function percentLabel(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

function daylightHoursLabel(hours: number): string {
  return `${hours.toFixed(1)}h`;
}
