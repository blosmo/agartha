import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CalendarComparisonPanel } from "./components/CalendarComparisonPanel";
import { FullscreenButton } from "./components/FullscreenButton";
import { GregorianOverlayToggle } from "./components/GregorianOverlayToggle";
import { MonthStructurePanel } from "./components/MonthStructurePanel";
import { SeasonTreePanel } from "./components/SeasonTreePanel";
import { ProgressRingsPanel, SunlightLinesPanel } from "./components/SunlightChart";
import { TimeControls } from "./components/TimeControls";
import type { ComparisonMode } from "./lib/comparisonMode";
import {
  DAYS_PER_YEAR,
  describeNewCalendarIndex,
  todayIndex,
} from "./lib/newCalendar";
import { clampCalendarIndex } from "./visualization/calendarGeometry";

const DEFAULT_PLAYBACK_DELAY_MS = 650;
const DEFAULT_PLAYBACK_SPEED = 5;
const CalendarScene = lazy(() =>
  import("./visualization/CalendarScene").then((module) => ({
    default: module.CalendarScene,
  })),
);

export default function App() {
  const [selectedIndex, setSelectedIndex] = useState(() => todayIndex());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_PLAYBACK_SPEED);
  const [showNewCalendar, setShowNewCalendar] = useState(true);
  const [showGregorianOverlay, setShowGregorianOverlay] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("split");
  const scenePanelRef = useRef<HTMLElement | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverIndexRef = useRef<number | null>(null);
  const simulatedDaysPerSecond = useMemo(
    () => (playing ? 1000 / playbackDelayForSpeed(playbackSpeed) : 0),
    [playing, playbackSpeed],
  );

  useEffect(() => {
    if (!playing) return;
    const delay = playbackDelayForSpeed(playbackSpeed);
    const id = window.setInterval(() => {
      startTransition(() => {
        setSelectedIndex((value) => wrapCalendarIndex(value + 1));
      });
    }, delay);
    return () => window.clearInterval(id);
  }, [playing, playbackSpeed]);

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    };
  }, []);

  const selectIndex = useCallback((index: number) => {
    setSelectedIndex(clampCalendarIndex(index));
  }, []);

  const stepTime = useCallback((days: number) => {
    setSelectedIndex((value) => wrapCalendarIndex(value + days));
  }, []);

  const changePlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(clampPlaybackSpeed(speed));
  }, []);

  const returnToToday = useCallback(() => {
    setSelectedIndex(todayIndex());
  }, []);

  const changeNewCalendarVisibility = useCallback(
    (checked: boolean) => {
      setShowNewCalendar(checked);
      if (!checked && !showGregorianOverlay) {
        setShowGregorianOverlay(true);
      }
    },
    [showGregorianOverlay],
  );

  const changeGregorianVisibility = useCallback(
    (checked: boolean) => {
      setShowGregorianOverlay(checked);
      if (!checked && !showNewCalendar) {
        setShowNewCalendar(true);
      }
    },
    [showNewCalendar],
  );

  const scheduleHoverIndex = useCallback((index: number | null) => {
    pendingHoverIndexRef.current = index;
    if (hoverFrameRef.current !== null) return;

    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      setHoverIndex(pendingHoverIndexRef.current);
    });
  }, []);

  const activeIndex = hoverIndex ?? selectedIndex;
  const calendarDate = useMemo(() => describeNewCalendarIndex(activeIndex), [activeIndex]);

  return (
    <main className="app-shell">
      <div className="dashboard-frame">
        <header className="dashboard-header">
          <div className="brand-mark" aria-label="New Calendar Timepiece">
            <span />
            <div>
              <strong>New Calendar</strong>
            </div>
          </div>

          <div className="dashboard-current">
            <span>{calendarDate.season}</span>
            <strong>{calendarDate.gregorianLabel}</strong>
          </div>

          <div className="global-control-row" aria-label="Global calendar controls">
            <TimeControls
              selectedIndex={selectedIndex}
              playing={playing}
              playbackSpeed={playbackSpeed}
              onSelectIndex={selectIndex}
              onStepTime={stepTime}
              onPlaybackSpeedChange={changePlaybackSpeed}
              onToday={returnToToday}
              onPlayingChange={setPlaying}
            />
            <GregorianOverlayToggle
              newChecked={showNewCalendar}
              gregorianChecked={showGregorianOverlay}
              comparisonMode={comparisonMode}
              onNewChange={changeNewCalendarVisibility}
              onGregorianChange={changeGregorianVisibility}
              onComparisonModeChange={setComparisonMode}
            />
          </div>
        </header>

        <div className="dashboard-grid" aria-label="Calendar lens dashboard">
          <section ref={scenePanelRef} className="scene-panel bento-fullscreenable" aria-label="Orbit panel">
            <div className="panel-title-row">
              <h2>Orbit</h2>
              <div className="panel-actions">
                <FullscreenButton label="Full screen orbit" targetRef={scenePanelRef} />
              </div>
            </div>

            <Suspense fallback={<div className="scene-loading" role="status">Loading orbit</div>}>
              <CalendarScene
                selectedIndex={selectedIndex}
                overlayMode="calendar"
                krystalStage={10}
                cycleStartYear={calendarDate.cycleStartYear}
                showGregorianOverlay={showGregorianOverlay}
                simulatedDaysPerSecond={simulatedDaysPerSecond}
                onSelectIndex={selectIndex}
                onHoverIndex={scheduleHoverIndex}
              />
            </Suspense>
          </section>

          <CalendarComparisonPanel
            calendarDate={calendarDate}
            showNewCalendar={showNewCalendar}
            showGregorianOverlay={showGregorianOverlay}
            onSelectIndex={selectIndex}
          />

          <MonthStructurePanel
            calendarDate={calendarDate}
            showNewCalendar={showNewCalendar}
            showGregorianOverlay={showGregorianOverlay}
            comparisonMode={comparisonMode}
            onSelectIndex={selectIndex}
          />

          <SeasonTreePanel calendarDate={calendarDate} />

          <SunlightLinesPanel
            calendarDate={calendarDate}
            showNewCalendar={showNewCalendar}
            showGregorianOverlay={showGregorianOverlay}
            comparisonMode={comparisonMode}
            onSelectIndex={selectIndex}
          />

          <ProgressRingsPanel
            calendarDate={calendarDate}
            showNewCalendar={showNewCalendar}
            showGregorianOverlay={showGregorianOverlay}
            comparisonMode={comparisonMode}
            onSelectIndex={selectIndex}
          />
        </div>
      </div>
    </main>
  );
}

function wrapCalendarIndex(index: number): number {
  return ((Math.round(index) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

function clampPlaybackSpeed(speed: number): number {
  return Math.min(25, Math.max(1, Math.round(speed)));
}

function playbackDelayForSpeed(speed: number): number {
  return Math.max(45, DEFAULT_PLAYBACK_DELAY_MS / speed);
}
