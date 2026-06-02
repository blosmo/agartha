import { memo, type PointerEvent, type ReactNode, useCallback, useMemo, useRef } from "react";
import { FullscreenButton } from "./FullscreenButton";
import { GREGORIAN_SEASON_COLORS, describeGregorianSeason } from "../lib/gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";
import { DAYS_PER_YEAR, type NewCalendarDate } from "../lib/newCalendar";
import {
  makeGregorianSunlightSeries,
  makeSunlightSeries,
  sunlightPointForCalendarDate,
  sunlightPointForGregorianDate,
  type SunlightPoint,
} from "../lib/sunlight";

interface SunlightChartProps {
  calendarDate: NewCalendarDate;
  showNewCalendar: boolean;
  showGregorianOverlay: boolean;
  onSelectIndex: (index: number) => void;
  embedded?: boolean;
  /** When set, render a single calendar system (used for aligned calendar compare columns). */
  focusSystem?: "new" | "gregorian";
}

const chart = {
  width: 440,
  height: 246,
  padLeft: 46,
  padRight: 20,
  padTop: 24,
  padBottom: 38,
  minHours: 9,
  maxHours: 15,
};

const gridHours = [9, 11, 13, 15];
const gridDays = [1, 37, 73];

interface SunlightPathModel {
  season: string;
  seasonIndex: number;
  path: string;
}

interface SunlightLabelModel {
  season: string;
  seasonIndex: number;
  x: number;
  y: number;
}

export const SunlightLinesPanel = memo(function SunlightLinesPanel({
  calendarDate,
  showNewCalendar,
  showGregorianOverlay,
  onSelectIndex,
  embedded = false,
  focusSystem,
}: SunlightChartProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const series = useMemo(
    () => makeSunlightSeries(calendarDate.cycleStartYear),
    [calendarDate.cycleStartYear],
  );
  const gregorianSeries = useMemo(
    () => makeGregorianSunlightSeries(calendarDate.cycleStartYear),
    [calendarDate.cycleStartYear],
  );
  const activePoint = sunlightPointForCalendarDate(calendarDate);
  const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);
  const gregorianPoint = sunlightPointForGregorianDate(calendarDate.gregorianDate);
  const activePosition = pointToSvg(activePoint);
  const gregorianPosition = pointToSvg(gregorianPoint);
  const seasonPaths = useMemo(() => makeSunlightPathModels(series), [series]);
  const gregorianSeasonPaths = useMemo(
    () => makeSunlightPathModels(gregorianSeries),
    [gregorianSeries],
  );
  const seasonLabels = useMemo(() => makeSeasonLabels(series), [series]);
  const gregorianSeasonLabels = useMemo(
    () => makeGregorianSeasonLabels(gregorianSeries),
    [gregorianSeries],
  );
  const compareSideBySide =
    showNewCalendar && showGregorianOverlay && !focusSystem;
  const showNewSunlight = focusSystem === "new" || (showNewCalendar && focusSystem !== "gregorian");
  const showGregorianSunlight =
    focusSystem === "gregorian" || (showGregorianOverlay && focusSystem !== "new");
  const dragSvgRef = useRef<SVGSVGElement | null>(null);
  const lineDragHandlersRef = useRef<{
    move: (event: globalThis.PointerEvent) => void;
    up: (event: globalThis.PointerEvent) => void;
  } | null>(null);
  const selectFromClientX = useCallback(
    (clientX: number, svg: SVGSVGElement) => {
      onSelectIndex(yearIndexFromChartClientX(clientX, svg.getBoundingClientRect()));
    },
    [onSelectIndex],
  );
  const finishLineDrag = useCallback((event?: globalThis.PointerEvent) => {
    const svg = dragSvgRef.current;
    draggingRef.current = false;
    dragSvgRef.current = null;
    const handlers = lineDragHandlersRef.current;
    if (handlers) {
      window.removeEventListener("pointermove", handlers.move);
      window.removeEventListener("pointerup", handlers.up);
      window.removeEventListener("pointercancel", handlers.up);
      lineDragHandlersRef.current = null;
    }
    if (svg && event?.pointerId !== undefined && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }, []);
  const startDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      finishLineDrag();
      draggingRef.current = true;
      dragSvgRef.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      selectFromClientX(event.clientX, event.currentTarget);

      const move = (pointerEvent: globalThis.PointerEvent) => {
        const svg = dragSvgRef.current;
        if (!draggingRef.current || !svg) return;
        pointerEvent.preventDefault();
        selectFromClientX(pointerEvent.clientX, svg);
      };
      const up = (pointerEvent: globalThis.PointerEvent) => {
        if (!draggingRef.current) return;
        finishLineDrag(pointerEvent);
      };

      lineDragHandlersRef.current = { move, up };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [finishLineDrag, selectFromClientX],
  );
  const continueDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      selectFromClientX(event.clientX, event.currentTarget);
    },
    [selectFromClientX],
  );
  const stopDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      finishLineDrag(event.nativeEvent);
    },
    [finishLineDrag],
  );

  const TitleTag = embedded ? "h3" : "h2";

  return (
    <section
      ref={panelRef}
      className={
        embedded
          ? "calendar-chart-subsection calendar-sunlight-subsection bento-fullscreenable"
          : "sunlight-chart-panel sunlight-lines-panel bento-fullscreenable"
      }
      aria-label={embedded ? "Sunlight chart" : "Sunlight panel"}
    >
      <div className={embedded ? "calendar-subsection-heading" : "chart-heading"}>
        <TitleTag>Sunlight</TitleTag>
        <div className="panel-actions">
          <strong>{activePoint.hours.toFixed(1)}h</strong>
          <FullscreenButton label="Full screen sunlight" targetRef={panelRef} />
        </div>
      </div>

      {compareSideBySide ? (
        <div className="sunlight-split-view">
          <article className="sunlight-system-card new-calendar-sunlight-card">
            <h3>New Calendar</h3>
            <SunlightSystemChart
              ariaLabel="New Calendar sunlight by day of season"
              paths={seasonPaths}
              labels={seasonLabels}
              colors={SEASON_COLORS}
              activeSeasonIndex={calendarDate.seasonIndex}
              activePosition={activePosition}
              dot="new"
              onPointerDown={startDrag}
              onPointerMove={continueDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            />
          </article>

          <article className="sunlight-system-card gregorian-sunlight-card">
            <h3>Gregorian</h3>
            <SunlightSystemChart
              ariaLabel="Gregorian sunlight by day of season"
              paths={gregorianSeasonPaths}
              labels={gregorianSeasonLabels}
              colors={GREGORIAN_SEASON_COLORS}
              activeSeasonIndex={gregorianSeason.seasonIndex}
              activePosition={gregorianPosition}
              dot="gregorian"
              labelPrefix="G "
              gregorian
            />
          </article>
        </div>
      ) : focusSystem === "new" ? (
        <article className="sunlight-system-card new-calendar-sunlight-card">
          <h3>New Calendar</h3>
          <SunlightSystemChart
            ariaLabel="New Calendar sunlight by day of season"
            paths={seasonPaths}
            labels={seasonLabels}
            colors={SEASON_COLORS}
            activeSeasonIndex={calendarDate.seasonIndex}
            activePosition={activePosition}
            dot="new"
            onPointerDown={startDrag}
            onPointerMove={continueDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        </article>
      ) : focusSystem === "gregorian" ? (
        <article className="sunlight-system-card gregorian-sunlight-card">
          <h3>Gregorian</h3>
          <SunlightSystemChart
            ariaLabel="Gregorian sunlight by day of season"
            paths={gregorianSeasonPaths}
            labels={gregorianSeasonLabels}
            colors={GREGORIAN_SEASON_COLORS}
            activeSeasonIndex={gregorianSeason.seasonIndex}
            activePosition={gregorianPosition}
            dot="gregorian"
            labelPrefix="G "
            gregorian
          />
        </article>
      ) : showGregorianSunlight && !showNewSunlight ? (
        <SunlightSystemChart
          ariaLabel="Gregorian sunlight by day of season"
          paths={gregorianSeasonPaths}
          labels={gregorianSeasonLabels}
          colors={GREGORIAN_SEASON_COLORS}
          activeSeasonIndex={gregorianSeason.seasonIndex}
          activePosition={gregorianPosition}
          dot="gregorian"
          labelPrefix="G "
          gregorian
        />
      ) : (
        <SunlightOverlayChart
          seasonPaths={seasonPaths}
          gregorianSeasonPaths={gregorianSeasonPaths}
          seasonLabels={seasonLabels}
          gregorianSeasonLabels={gregorianSeasonLabels}
          activeSeasonIndex={calendarDate.seasonIndex}
          gregorianActiveSeasonIndex={gregorianSeason.seasonIndex}
          activePosition={activePosition}
          gregorianPosition={gregorianPosition}
          showGregorianOverlay={false}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />
      )}
    </section>
  );
});

function SunlightChartFrame({ children }: { children: ReactNode }) {
  return (
    <div className="sunlight-chart-container">
      <div className="sunlight-chart-stage">
        <span className="sunlight-y-axis-label" aria-hidden="true">
          Hours of sunlight
        </span>
        {children}
      </div>
      <div className="chart-axis-labels" aria-hidden="true">
        <span className="sunlight-x-axis-label">Day of season</span>
      </div>
    </div>
  );
}

interface SunlightPointerHandlers {
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: PointerEvent<SVGSVGElement>) => void;
}

function SunlightOverlayChart({
  seasonPaths,
  gregorianSeasonPaths,
  seasonLabels,
  gregorianSeasonLabels,
  activeSeasonIndex,
  gregorianActiveSeasonIndex,
  activePosition,
  gregorianPosition,
  showGregorianOverlay,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  seasonPaths: SunlightPathModel[];
  gregorianSeasonPaths: SunlightPathModel[];
  seasonLabels: SunlightLabelModel[];
  gregorianSeasonLabels: SunlightLabelModel[];
  activeSeasonIndex: number;
  gregorianActiveSeasonIndex: number;
  activePosition: { x: number; y: number };
  gregorianPosition: { x: number; y: number };
  showGregorianOverlay: boolean;
} & SunlightPointerHandlers) {
  return (
    <SunlightChartFrame>
      <svg
        className="sunlight-chart"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="Hours of sunlight by day of season"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <SunlightGrid />

        <SunlightPaths
          paths={seasonPaths}
          colors={SEASON_COLORS}
          activeSeasonIndex={activeSeasonIndex}
        />

        {showGregorianOverlay && (
          <SunlightPaths
            paths={gregorianSeasonPaths}
            colors={GREGORIAN_SEASON_COLORS}
            activeSeasonIndex={gregorianActiveSeasonIndex}
            className="gregorian-lines"
          />
        )}

        <SunlightLabels
          labels={seasonLabels}
          colors={SEASON_COLORS}
          activeSeasonIndex={activeSeasonIndex}
        />

        {showGregorianOverlay && (
          <SunlightLabels
            labels={gregorianSeasonLabels}
            colors={GREGORIAN_SEASON_COLORS}
            activeSeasonIndex={gregorianActiveSeasonIndex}
            className="gregorian-labels"
            prefix="G "
          />
        )}

        <SunlightDot position={activePosition} dot="new" />

        {showGregorianOverlay && (
          <SunlightDot position={gregorianPosition} dot="gregorian" />
        )}
      </svg>
    </SunlightChartFrame>
  );
}

function SunlightSystemChart({
  ariaLabel,
  paths,
  labels,
  colors,
  activeSeasonIndex,
  activePosition,
  dot,
  gregorian = false,
  labelPrefix = "",
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  ariaLabel: string;
  paths: SunlightPathModel[];
  labels: SunlightLabelModel[];
  colors: string[];
  activeSeasonIndex: number;
  activePosition: { x: number; y: number };
  dot: "new" | "gregorian";
  gregorian?: boolean;
  labelPrefix?: string;
} & SunlightPointerHandlers) {
  return (
    <SunlightChartFrame>
      <svg
        className={`sunlight-chart sunlight-system-chart ${
          gregorian ? "gregorian-system-chart" : ""
        }`.trim()}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <SunlightGrid />
        <SunlightPaths
          paths={paths}
          colors={colors}
          activeSeasonIndex={activeSeasonIndex}
          className={gregorian ? "gregorian-lines" : undefined}
        />
        <SunlightLabels
          labels={labels}
          colors={colors}
          activeSeasonIndex={activeSeasonIndex}
          className={gregorian ? "gregorian-labels" : undefined}
          prefix={labelPrefix}
        />
        <SunlightDot position={activePosition} dot={dot} />
      </svg>
    </SunlightChartFrame>
  );
}

function SunlightGrid() {
  return (
    <g className="grid-lines">
      {gridHours.map((hours) => {
        const y = yForHours(hours);
        return (
          <g key={hours}>
            <line x1={chart.padLeft} x2={chart.width - chart.padRight} y1={y} y2={y} />
            <text x={chart.padLeft - 12} y={y + 4}>
              {hours}
            </text>
          </g>
        );
      })}
      {gridDays.map((day) => {
        const x = xForDay(day);
        return (
          <g key={day}>
            <line
              className="vertical"
              x1={x}
              x2={x}
              y1={chart.padTop}
              y2={chart.height - chart.padBottom}
            />
            <text x={x} y={chart.height - 13}>
              {day}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function SunlightPaths({
  paths,
  colors,
  activeSeasonIndex,
  className,
}: {
  paths: SunlightPathModel[];
  colors: string[];
  activeSeasonIndex: number;
  className?: string;
}) {
  return (
    <g className={className}>
      {paths.map((season) => (
        <path
          key={season.season}
          d={season.path}
          stroke={colors[season.seasonIndex]}
          className={season.seasonIndex === activeSeasonIndex ? "is-active" : ""}
        />
      ))}
    </g>
  );
}

function SunlightLabels({
  labels,
  colors,
  activeSeasonIndex,
  className = "season-labels",
  prefix = "",
}: {
  labels: SunlightLabelModel[];
  colors: string[];
  activeSeasonIndex: number;
  className?: string;
  prefix?: string;
}) {
  return (
    <g className={className}>
      {labels.map((season) => (
        <text
          key={season.season}
          x={season.x}
          y={season.y}
          fill={colors[season.seasonIndex]}
          className={season.seasonIndex === activeSeasonIndex ? "is-active" : ""}
        >
          {prefix}
          {season.season}
        </text>
      ))}
    </g>
  );
}

function SunlightDot({
  position,
  dot,
}: {
  position: { x: number; y: number };
  dot: "new" | "gregorian";
}) {
  if (dot === "gregorian") {
    return (
      <g
        className="gregorian-sunlight-dot"
        transform={`translate(${position.x} ${position.y})`}
      >
        <rect x="-5" y="-5" width="10" height="10" />
        <circle r="10" />
      </g>
    );
  }

  return (
    <g
      className="current-sunlight-dot"
      transform={`translate(${position.x} ${position.y})`}
    >
      <circle r="7" />
      <circle r="12" />
    </g>
  );
}

function pathForPoints(points: SunlightPoint[]): string {
  return points
    .map((point, index) => {
      const { x, y } = pointToSvg(point);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function makeSunlightPathModels(
  series: Array<{ season: string; seasonIndex: number; points: SunlightPoint[] }>,
): SunlightPathModel[] {
  return series.map((season) => ({
    season: season.season,
    seasonIndex: season.seasonIndex,
    path: pathForPoints(season.points),
  }));
}

function makeSeasonLabels(
  series: Array<{ season: string; seasonIndex: number; points: SunlightPoint[] }>,
): SunlightLabelModel[] {
  return series.map((season) => {
    const labelPoint = season.points[seasonLabelDay(season.seasonIndex)];
    const { x, y } = pointToSvg(labelPoint);
    return {
      season: season.season,
      seasonIndex: season.seasonIndex,
      x,
      y: y - 8,
    };
  });
}

function makeGregorianSeasonLabels(
  series: Array<{ season: string; seasonIndex: number; points: SunlightPoint[] }>,
): SunlightLabelModel[] {
  return series.flatMap((season) => {
    const labelPoint = season.points[Math.floor(season.points.length * 0.48)];
    if (!labelPoint) return [];
    const { x, y } = pointToSvg(labelPoint);
    return [
      {
        season: season.season,
        seasonIndex: season.seasonIndex,
        x,
        y: y + 18,
      },
    ];
  });
}

function pointToSvg(point: SunlightPoint): { x: number; y: number } {
  return {
    x: xForDay(point.dayOfSeason),
    y: yForHours(point.hours),
  };
}

function xForDay(day: number): number {
  const usableWidth = chart.width - chart.padLeft - chart.padRight;
  return chart.padLeft + ((day - 1) / 72) * usableWidth;
}

function yForHours(hours: number): number {
  const usableHeight = chart.height - chart.padTop - chart.padBottom;
  const normalized = (hours - chart.minHours) / (chart.maxHours - chart.minHours);
  return chart.height - chart.padBottom - normalized * usableHeight;
}

function seasonLabelDay(seasonIndex: number): number {
  return [12, 29, 14, 20, 28][seasonIndex];
}

export function yearIndexFromChartClientX(
  clientX: number,
  svgBounds: Pick<DOMRect, "left" | "width">,
): number {
  const x = ((clientX - svgBounds.left) / svgBounds.width) * chart.width;
  const usableWidth = chart.width - chart.padLeft - chart.padRight;
  const yearProgress = (x - chart.padLeft) / usableWidth;

  return Math.round(clamp(yearProgress * (DAYS_PER_YEAR - 1), 0, DAYS_PER_YEAR - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
