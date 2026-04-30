import { useEffect, useMemo, useState } from "react";
import { DateReadout } from "./components/DateReadout";
import { ExplainerPanel } from "./components/ExplainerPanel";
import { TimeControls } from "./components/TimeControls";
import {
  DAYS_PER_YEAR,
  describeNewCalendarIndex,
  todayIndex,
  type OverlayMode,
} from "./lib/newCalendar";
import { CalendarScene } from "./visualization/CalendarScene";
import { clampCalendarIndex } from "./visualization/calendarGeometry";

export default function App() {
  const [selectedIndex, setSelectedIndex] = useState(() => todayIndex());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("krystal");
  const [krystalStage, setKrystalStage] = useState(10);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setSelectedIndex((value) => (value + 1) % DAYS_PER_YEAR);
    }, 650);
    return () => window.clearInterval(id);
  }, [playing]);

  const activeIndex = hoverIndex ?? selectedIndex;
  const calendarDate = useMemo(() => describeNewCalendarIndex(activeIndex), [activeIndex]);

  return (
    <main className="app-shell">
      <CalendarScene
        selectedIndex={selectedIndex}
        overlayMode={overlayMode}
        krystalStage={krystalStage}
        onSelectIndex={(index) => setSelectedIndex(clampCalendarIndex(index))}
        onHoverIndex={setHoverIndex}
      />

      <div className="brand-mark" aria-label="New Calendar Timepiece">
        <span />
        <div>
          <strong>New Calendar</strong>
          <em>Krystal Mechanics</em>
        </div>
      </div>

      <DateReadout calendarDate={calendarDate} krystalStage={krystalStage} />

      <ExplainerPanel overlayMode={overlayMode} />

      <TimeControls
        selectedIndex={selectedIndex}
        overlayMode={overlayMode}
        krystalStage={krystalStage}
        playing={playing}
        onSelectIndex={(index) => setSelectedIndex(clampCalendarIndex(index))}
        onOverlayModeChange={setOverlayMode}
        onKrystalStageChange={setKrystalStage}
        onToday={() => setSelectedIndex(todayIndex())}
        onPlayingChange={setPlaying}
      />
    </main>
  );
}
