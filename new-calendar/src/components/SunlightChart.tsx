import {
  memo,
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { FullscreenButton } from "./FullscreenButton";
import type { ComparisonMode } from "../lib/comparisonMode";
import {
  GREGORIAN_SEASON_COLORS,
  describeGregorianSeason,
  gregorianYearProgress,
} from "../lib/gregorianSeasons";
import { SEASON_COLORS } from "../visualization/calendarGeometry";
import { DAYS_PER_SEASON, DAYS_PER_YEAR, type NewCalendarDate } from "../lib/newCalendar";
import {
  makeGregorianSunlightSeries,
  makeSunlightSeries,
  sunlightPointForCalendarDate,
  sunlightPointForGregorianDate,
  type SunlightPoint,
} from "../lib/sunlight";

interface SunlightChartProps {
  calendarDate: NewCalendarDate;
  showGregorianOverlay: boolean;
  comparisonMode: ComparisonMode;
  onSelectIndex: (index: number) => void;
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

const rings = {
  size: 246,
  center: 123,
  gregorianYearRadius: 111,
  outerRadius: 96,
  innerRadius: 65,
  gregorianRadius: 44,
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
  showGregorianOverlay,
  comparisonMode,
  onSelectIndex,
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
  const compareInSplit = showGregorianOverlay && comparisonMode === "split";
  const compareInOverlay = showGregorianOverlay && comparisonMode === "overlay";
  const selectFromPointer = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      onSelectIndex(indexFromLinePointer(event, calendarDate.seasonIndex));
    },
    [calendarDate.seasonIndex, onSelectIndex],
  );
  const startDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <section
      ref={panelRef}
      className="sunlight-chart-panel sunlight-lines-panel bento-fullscreenable"
      aria-label="Sunlight panel"
    >
      <div className="chart-heading">
        <h2>Sunlight</h2>
        <div className="panel-actions">
          <strong>{activePoint.hours.toFixed(1)}h</strong>
          <FullscreenButton label="Full screen sunlight" targetRef={panelRef} />
        </div>
      </div>

      {compareInSplit ? (
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
          showGregorianOverlay={compareInOverlay}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />
      )}

      <div className="chart-axis-labels" aria-hidden="true">
        <span>Hours of sunlight</span>
        <span>Day of season</span>
      </div>
    </section>
  );
});

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

export const ProgressRingsPanel = memo(function ProgressRingsPanel({
  calendarDate,
  showGregorianOverlay,
  comparisonMode,
  onSelectIndex,
}: SunlightChartProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const gregorianSeason = describeGregorianSeason(calendarDate.gregorianDate);
  const yearProgress = (calendarDate.index + 1) / DAYS_PER_YEAR;
  const gregorianYearProgressValue = gregorianYearProgress(calendarDate.gregorianDate);
  const seasonProgress = calendarDate.dayOfSeason / DAYS_PER_SEASON;
  const innerColor = SEASON_COLORS[calendarDate.seasonIndex];
  const gregorianColor = GREGORIAN_SEASON_COLORS[gregorianSeason.seasonIndex];
  const compareInSplit = showGregorianOverlay && comparisonMode === "split";
  const compareInOverlay = showGregorianOverlay && comparisonMode === "overlay";
  const selectFromPointer = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      onSelectIndex(indexFromRingPointer(event, calendarDate.seasonIndex));
    },
    [calendarDate.seasonIndex, onSelectIndex],
  );
  const startDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <section
      ref={panelRef}
      className="progress-rings-panel bento-fullscreenable"
      aria-label="Progress panel"
    >
      <div className="chart-heading">
        <h2>Progress</h2>
        <div className="panel-actions">
          <strong>{percentLabel(yearProgress)}</strong>
          <FullscreenButton label="Full screen progress" targetRef={panelRef} />
        </div>
      </div>

      <div className={`progress-ring-view ${compareInSplit ? "compare-rings" : ""}`.trim()}>
        <ProgressRingCard
          title="New Calendar"
          ariaLabel={
            compareInSplit
              ? "New Calendar year and season progress rings"
              : "Progress rings"
          }
          yearProgress={yearProgress}
          seasonProgress={seasonProgress}
          yearStroke="var(--cyan)"
          seasonStroke={innerColor}
          seasonName={calendarDate.season}
          gregorianOverlay={
            compareInOverlay
              ? {
                  yearProgress: gregorianYearProgressValue,
                  seasonProgress: gregorianSeason.progress,
                  yearStroke: "var(--gregorian)",
                  seasonStroke: gregorianColor,
                  seasonName: gregorianSeason.season,
                }
              : undefined
          }
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />

        {compareInSplit && (
          <ProgressRingCard
            title="Gregorian"
            ariaLabel="Gregorian year and season progress rings"
            yearProgress={gregorianYearProgressValue}
            seasonProgress={gregorianSeason.progress}
            yearStroke="var(--gregorian)"
            seasonStroke={gregorianColor}
            seasonName={gregorianSeason.season}
            muted
          />
        )}
      </div>
    </section>
  );
});

function ProgressRingCard({
  title,
  ariaLabel,
  yearProgress,
  seasonProgress,
  yearStroke,
  seasonStroke,
  seasonName,
  gregorianOverlay,
  muted = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  title: string;
  ariaLabel: string;
  yearProgress: number;
  seasonProgress: number;
  yearStroke: string;
  seasonStroke: string;
  seasonName: string;
  gregorianOverlay?: {
    yearProgress: number;
    seasonProgress: number;
    yearStroke: string;
    seasonStroke: string;
    seasonName: string;
  };
  muted?: boolean;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: PointerEvent<SVGSVGElement>) => void;
}) {
  return (
    <article
      className={`progress-ring-card ${muted ? "gregorian-ring-card" : ""}`.trim()}
      style={{ "--season-color": seasonStroke } as CSSProperties}
    >
      <h3>{title}</h3>
      <svg
        className="progress-rings"
        viewBox={`0 0 ${rings.size} ${rings.size}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <circle
          className="progress-track"
          cx={rings.center}
          cy={rings.center}
          r={rings.outerRadius}
        />
        <circle
          className="progress-track inner"
          cx={rings.center}
          cy={rings.center}
          r={rings.innerRadius}
        />
        {gregorianOverlay && (
          <>
            <circle
              className="progress-track gregorian-year-track"
              cx={rings.center}
              cy={rings.center}
              r={rings.gregorianYearRadius}
            />
            <circle
              className="progress-track gregorian-track"
              cx={rings.center}
              cy={rings.center}
              r={rings.gregorianRadius}
            />
          </>
        )}
        <ProgressCircle radius={rings.outerRadius} progress={yearProgress} stroke={yearStroke} />
        <ProgressCircle radius={rings.innerRadius} progress={seasonProgress} stroke={seasonStroke} />
        {gregorianOverlay && (
          <>
            <ProgressCircle
              radius={rings.gregorianYearRadius}
              progress={gregorianOverlay.yearProgress}
              stroke={gregorianOverlay.yearStroke}
              className="gregorian-year-value"
            />
            <ProgressCircle
              radius={rings.gregorianRadius}
              progress={gregorianOverlay.seasonProgress}
              stroke={gregorianOverlay.seasonStroke}
              className="gregorian-value"
            />
          </>
        )}
        <g className="ring-center-copy">
          <text x={rings.center} y={rings.center - 7}>
            {percentLabel(yearProgress)}
          </text>
          <text x={rings.center} y={rings.center + 17}>
            year
          </text>
        </g>
      </svg>

      <dl className="ring-metrics">
        <div>
          <dt>Year progress</dt>
          <dd>{percentLabel(yearProgress)}</dd>
        </div>
        <div className="season-metric">
          <dt>{seasonName} progress</dt>
          <dd>{percentLabel(seasonProgress)}</dd>
        </div>
        {gregorianOverlay && (
          <>
            <div className="gregorian-readout-item">
              <dt>Gregorian year</dt>
              <dd>{percentLabel(gregorianOverlay.yearProgress)}</dd>
            </div>
            <div className="gregorian-readout-item">
              <dt>{gregorianOverlay.seasonName} progress</dt>
              <dd>{percentLabel(gregorianOverlay.seasonProgress)}</dd>
            </div>
          </>
        )}
      </dl>
    </article>
  );
}

function ProgressCircle({
  radius,
  progress,
  stroke,
  className = "",
}: {
  radius: number;
  progress: number;
  stroke: string;
  className?: string;
}) {
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.max(0, Math.min(1, progress));

  return (
    <circle
      className={`progress-value ${className}`.trim()}
      cx={rings.center}
      cy={rings.center}
      r={radius}
      stroke={stroke}
      transform={`rotate(-90 ${rings.center} ${rings.center})`}
      strokeDasharray={`${(circumference * safeProgress).toFixed(2)} ${circumference.toFixed(2)}`}
    />
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

function percentLabel(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

function indexFromLinePointer(
  event: PointerEvent<SVGSVGElement>,
  activeSeasonIndex: number,
): number {
  const point = svgPointFromPointer(event, chart.width, chart.height);
  const dayOfSeason = Math.round(
    clamp(
      1 + ((point.x - chart.padLeft) / (chart.width - chart.padLeft - chart.padRight)) * 72,
      1,
      DAYS_PER_SEASON,
    ),
  );

  return activeSeasonIndex * DAYS_PER_SEASON + dayOfSeason - 1;
}

function indexFromRingPointer(
  event: PointerEvent<SVGSVGElement>,
  activeSeasonIndex: number,
): number {
  const point = svgPointFromPointer(event, rings.size, rings.size);
  const dx = point.x - rings.center;
  const dy = point.y - rings.center;
  const distanceFromCenter = Math.hypot(dx, dy);
  const progress = normalizeProgress(Math.atan2(dy, dx) + Math.PI / 2);
  const isInnerRing =
    Math.abs(distanceFromCenter - rings.innerRadius) <
    Math.abs(distanceFromCenter - rings.outerRadius);

  if (isInnerRing) {
    const dayOffset = Math.round(progress * (DAYS_PER_SEASON - 1));
    return activeSeasonIndex * DAYS_PER_SEASON + dayOffset;
  }

  return Math.round(progress * (DAYS_PER_YEAR - 1));
}

function svgPointFromPointer(
  event: PointerEvent<SVGSVGElement>,
  viewBoxWidth: number,
  viewBoxHeight: number,
): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * viewBoxWidth,
    y: ((event.clientY - rect.top) / rect.height) * viewBoxHeight,
  };
}

function normalizeProgress(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn / fullTurn;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
