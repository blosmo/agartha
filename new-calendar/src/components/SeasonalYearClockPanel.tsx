import {
  memo,
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  annularSlicePath,
  indexFromClockPointer,
  makeSeasonProgressPie,
  orbitAngleDegFromPointer,
  orbitMarkerPosition,
  pieSlicePath,
  seasonClockLayout,
  starPath,
  SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
  yearProgressFromOrbitAngleDeg,
  yearRingFilledSegments,
  seasonProgressFromYearProgress,
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
  integrated?: boolean;
  focusSystem?: SeasonClockSystem;
}

export const SeasonalYearClockPanel = memo(function SeasonalYearClockPanel({
  calendarDate,
  showNewCalendar = true,
  showGregorianOverlay = false,
  onSelectIndex,
  integrated = false,
  focusSystem,
}: SeasonalYearClockPanelProps) {
  const draggingRef = useRef(false);
  const dragSvgRef = useRef<SVGSVGElement | null>(null);
  const clockDragHandlersRef = useRef<{
    move: (event: globalThis.PointerEvent) => void;
    up: (event: globalThis.PointerEvent) => void;
  } | null>(null);
  const [dragOrbitAngleDeg, setDragOrbitAngleDeg] = useState<number | null>(null);
  const compareSideBySide =
    showNewCalendar && showGregorianOverlay && !focusSystem;
  const showNewClock = focusSystem === "new" || (showNewCalendar && focusSystem !== "gregorian");
  const showGregorianClock =
    focusSystem === "gregorian" || (showGregorianOverlay && focusSystem !== "new");
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

  const selectFromClientPointer = useCallback(
    (clientX: number, clientY: number, svg: SVGSVGElement, yearScrub: boolean) => {
      const rect = svg.getBoundingClientRect();
      setDragOrbitAngleDeg(orbitAngleDegFromPointer(clientX, clientY, rect));
      onSelectIndex(
        indexFromClockPointer(
          clientX,
          clientY,
          rect,
          calendarDate.seasonIndex,
          { yearScrub },
        ),
      );
    },
    [calendarDate.seasonIndex, onSelectIndex],
  );

  const finishClockDrag = useCallback((event?: globalThis.PointerEvent) => {
    const svg = dragSvgRef.current;
    draggingRef.current = false;
    dragSvgRef.current = null;
    setDragOrbitAngleDeg(null);
    const handlers = clockDragHandlersRef.current;
    if (handlers) {
      window.removeEventListener("pointermove", handlers.move);
      window.removeEventListener("pointerup", handlers.up);
      window.removeEventListener("pointercancel", handlers.up);
      clockDragHandlersRef.current = null;
    }
    if (svg && event?.pointerId !== undefined && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }, []);

  const startDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      finishClockDrag();
      draggingRef.current = true;
      dragSvgRef.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      selectFromClientPointer(event.clientX, event.clientY, event.currentTarget, true);

      const move = (pointerEvent: globalThis.PointerEvent) => {
        const svg = dragSvgRef.current;
        if (!draggingRef.current || !svg) return;
        pointerEvent.preventDefault();
        selectFromClientPointer(pointerEvent.clientX, pointerEvent.clientY, svg, true);
      };
      const up = (pointerEvent: globalThis.PointerEvent) => {
        if (!draggingRef.current) return;
        finishClockDrag(pointerEvent);
      };

      clockDragHandlersRef.current = { move, up };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [finishClockDrag, selectFromClientPointer],
  );

  const continueDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      selectFromClientPointer(event.clientX, event.clientY, event.currentTarget, true);
    },
    [selectFromClientPointer],
  );

  const stopDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      finishClockDrag(event.nativeEvent);
    },
    [finishClockDrag],
  );

  const clockPointerHandlers = {
    onPointerDown: startDrag,
    onPointerMove: continueDrag,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
  };

  const clockView = (
      <div
        className={`season-clock-view ${compareSideBySide ? "compare-clocks" : ""} ${
          focusSystem || integrated ? "season-clock-view--focused" : ""
        }`.trim()}
      >
        {showNewClock ? (
          <SeasonProgressPieCard
            title="New Calendar"
            showTitle={!integrated && Boolean(focusSystem || showGregorianOverlay)}
            system="new"
            model={newModel}
            seasonStroke={SEASON_COLORS[calendarDate.seasonIndex]}
            ariaLabel={
              compareSideBySide || focusSystem === "new"
                ? `New Calendar season clock, ${daylightHoursLabel(newModel.daylightHours)} daylight`
                : `Season clock, ${daylightHoursLabel(newModel.daylightHours)} daylight`
            }
            dragOrbitAngleDeg={dragOrbitAngleDeg}
            gregorianReferenceDate={calendarDate.gregorianDate}
            {...clockPointerHandlers}
          />
        ) : showGregorianClock ? (
          <SeasonProgressPieCard
            title="Gregorian"
            showTitle={!integrated && Boolean(focusSystem)}
            system="gregorian"
            model={gregorianModel}
            seasonStroke={GREGORIAN_SEASON_COLORS[gregorianSeason.seasonIndex]}
            ariaLabel={`Gregorian season clock, ${daylightHoursLabel(gregorianModel.daylightHours)} daylight`}
            muted={!focusSystem}
            dragOrbitAngleDeg={focusSystem === "gregorian" ? dragOrbitAngleDeg : null}
            gregorianReferenceDate={calendarDate.gregorianDate}
            {...(focusSystem === "gregorian" ? clockPointerHandlers : {})}
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
  );

  if (integrated) {
    return (
      <div className="calendar-readout-season-clock" aria-label="Season clock chart">
        {clockView}
      </div>
    );
  }

  return (
    <section className="season-clock-panel" aria-label="Season clock panel">
      <div className="chart-heading">
        <h2>Season clock</h2>
      </div>
      {clockView}
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
  dragOrbitAngleDeg = null,
  gregorianReferenceDate,
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
  dragOrbitAngleDeg?: number | null;
  gregorianReferenceDate?: Date;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: PointerEvent<SVGSVGElement>) => void;
}) {
  const layout = seasonClockLayout;
  const markerAngleDeg = dragOrbitAngleDeg ?? model.orbitAngleDeg;
  const yearRingProgress =
    dragOrbitAngleDeg !== null
      ? yearProgressFromOrbitAngleDeg(dragOrbitAngleDeg)
      : model.yearProgress;
  const seasonRingProgress =
    dragOrbitAngleDeg !== null && gregorianReferenceDate
      ? seasonProgressFromYearProgress(system, yearRingProgress, gregorianReferenceDate)
      : model.seasonProgress;
  const marker = orbitMarkerPosition(
    layout.center,
    layout.center,
    layout.orbitRadius,
    markerAngleDeg,
  );
  const isDragging = dragOrbitAngleDeg !== null;
  const lightPath = pieSlicePath(
    layout.center,
    layout.center,
    layout.pieRadius,
    model.pie.lightStartAngle,
    model.pie.lightEndAngle,
  );
  const yearRingTrackPath = annularSlicePath(
    layout.center,
    layout.center,
    layout.yearFillInnerRadius,
    layout.yearFillOuterRadius,
    SEASON_CLOCK_SOLSTICE_ANGLE_DEG,
    SEASON_CLOCK_SOLSTICE_ANGLE_DEG + 359.995,
  );
  const yearSegmentPaths = yearRingFilledSegments(
    model.yearRingSegments,
    yearRingProgress,
  ).map((segment) => ({
    ...segment,
    d: annularSlicePath(
      layout.center,
      layout.center,
      layout.yearFillInnerRadius,
      layout.yearFillOuterRadius,
      segment.startAngleDeg,
      segment.endAngleDeg,
    ),
  }));

  return (
    <article
      className={`season-clock-card ${system === "gregorian" ? "gregorian-season-clock-card" : "new-calendar-season-clock-card"} ${showTitle ? "" : "no-card-title"} ${muted ? "muted-season-clock-card" : ""}`.trim()}
      style={{ "--season-color": seasonStroke } as CSSProperties}
    >
      {showTitle ? <h3>{title}</h3> : null}
      <div className="season-clock-card-body">
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
        <defs>
          <filter
            id={`season-clock-sunlight-glow-${system}`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
              result="softGlow"
            />
            <feMerge>
              <feMergeNode in="softGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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

        {yearRingTrackPath ? (
          <path
            className="season-clock-year-ring-track"
            d={yearRingTrackPath}
            aria-hidden="true"
          />
        ) : null}

        {yearSegmentPaths.map((segment) =>
          segment.d ? (
            <path
              key={`year-segment-${segment.seasonIndex}`}
              className="season-clock-year-segment"
              d={segment.d}
              style={{ "--segment-color": segment.color } as CSSProperties}
              aria-hidden="true"
            />
          ) : null,
        )}

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

        <g
          className={`season-clock-orbit-marker${isDragging ? " is-dragging" : ""}`}
          aria-hidden="true"
        >
          <circle className="season-clock-orbit-marker-dot" cx={marker.x} cy={marker.y} r={5} />
        </g>
        </svg>

        <div className="season-clock-metrics-column">
          <CompactMetricBar
            label="Year"
            value={yearRingProgress}
            displayValue={percentLabel(yearRingProgress)}
            system={system}
          />
          <CompactMetricBar
            label="Season"
            value={seasonRingProgress}
            displayValue={percentLabel(seasonRingProgress)}
            system={system}
          />
          <div className="season-clock-daylight-metric">
            <span className="season-clock-metric-label">Daylight</span>
            <span className="season-clock-metric-value">{daylightHoursLabel(model.daylightHours)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function CompactMetricBar({
  label,
  value,
  displayValue,
  system,
}: {
  label: string;
  value: number;
  displayValue: string;
  system: SeasonClockSystem;
}) {
  const fillPercent = Math.min(100, Math.max(0, value * 100));
  const percent = Math.round(fillPercent);

  return (
    <div className="season-clock-metric">
      <div className="season-clock-metric-header">
        <span className="season-clock-metric-label">{label}</span>
        <span className="season-clock-metric-value">{displayValue}</span>
      </div>
      <div
        className={`season-clock-metric-bar season-clock-metric-bar--${system}`}
        role="progressbar"
        aria-label={`${label}: ${displayValue}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="season-clock-metric-fill" style={{ width: `${fillPercent}%` }} />
      </div>
    </div>
  );
}

function percentLabel(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

function daylightHoursLabel(hours: number): string {
  return `${hours.toFixed(1)}h`;
}
