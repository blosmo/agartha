import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MATERIAL, MATERIAL_NAME, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

import {
  cellKey,
  DEFAULT_TERRAIN_SEED,
  INITIAL_DEMO_CELLS,
  TERRAIN_SEEDS,
  generateTerrain,
  stepDemoWorld,
  upsertCell,
  type DemoCell,
  type DemoEvent,
} from "./demoWorld";
import { BoardCanvas } from "../board/BoardCanvas";
import { MaterialEditorPanel } from "../controls/MaterialEditorPanel";
import { TerrainSeedPanel } from "../controls/TerrainSeedPanel";
import { TimeControls } from "../controls/TimeControls";
import { CellInspector } from "../inspector/CellInspector";
import { EventHistoryPanel } from "../inspector/EventHistoryPanel";
import { ReplayControls } from "../replay/ReplayControls";
import "./layout.css";

export function App() {
  const [cells, setCells] = useState<DemoCell[]>(INITIAL_DEMO_CELLS);
  const [terrainSeedId, setTerrainSeedId] = useState(DEFAULT_TERRAIN_SEED.id);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>(MATERIAL.Paint);
  const [selectedCoord, setSelectedCoord] = useState<WorldCoord>(INITIAL_DEMO_CELLS[0].coord);
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>([
    { id: "demo-0001", tick: 0, summary: "Seeded origin materials" },
  ]);
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.id === cellKey(selectedCoord)),
    [cells, selectedCoord],
  );

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      advanceTime();
    }, 650);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  function paintCell(coord: WorldCoord, material: MaterialId) {
    setSelectedCoord(coord);
    setCells((current) => upsertCell(current, coord, material));
    setEvents((current) => [
      {
        id: `demo-${String(current.length + 1).padStart(4, "0")}`,
        tick,
        summary: `Manual edit: set cell ${cellKey(coord)} to ${materialLabel(material)}`,
      },
      ...current,
    ]);
  }

  function advanceTime() {
    setCells((current) => stepDemoWorld(current));
    setTick((currentTick) => {
      const nextTick = currentTick + 1;
      setEvents((current) => [
        {
          id: `demo-${String(current.length + 1).padStart(4, "0")}`,
          tick: nextTick,
          summary: `Advanced local simulation to tick ${nextTick}`,
        },
        ...current,
      ]);
      return nextTick;
    });
  }

  function resetDemo() {
    const seed = TERRAIN_SEEDS.find((terrainSeed) => terrainSeed.id === terrainSeedId) ?? DEFAULT_TERRAIN_SEED;
    const seededCells = generateTerrain(seed);
    setCells(seededCells);
    setTick(0);
    setIsPlaying(false);
    setSelectedCoord(seededCells[0].coord);
    setEvents([{ id: "demo-0001", tick: 0, summary: `Reset ${seed.label} terrain` }]);
  }

  function selectTerrainSeed(seedId: string) {
    const seed = TERRAIN_SEEDS.find((terrainSeed) => terrainSeed.id === seedId) ?? DEFAULT_TERRAIN_SEED;
    const seededCells = generateTerrain(seed);
    setTerrainSeedId(seed.id);
    setCells(seededCells);
    setTick(0);
    setIsPlaying(false);
    setSelectedCoord(seededCells[0].coord);
    setEvents([{ id: "demo-0001", tick: 0, summary: `Loaded ${seed.label} terrain seed ${seed.seed}` }]);
  }

  return (
    <main className="agartha-app">
      <section className="agartha-board-shell" aria-label="Agartha board">
        <BoardCanvas
          cells={cells}
          onPaintCell={paintCell}
          onSelectCell={setSelectedCoord}
          selectedMaterial={selectedMaterial}
        />
      </section>
      <aside className="agartha-side-panel" aria-label="World inspector">
        <TerrainSeedPanel
          onSelectSeed={selectTerrainSeed}
          seeds={TERRAIN_SEEDS}
          selectedSeedId={terrainSeedId}
        />
        <MaterialEditorPanel
          onClear={resetDemo}
          onSelectMaterial={setSelectedMaterial}
          selectedMaterial={selectedMaterial}
        />
        <TimeControls
          isPlaying={isPlaying}
          onResetTime={() => {
            setTick(0);
            setIsPlaying(false);
          }}
          onStep={advanceTime}
          onTogglePlay={() => setIsPlaying((current) => !current)}
          tick={tick}
        />
        <CellInspector coord={selectedCoord} material={selectedCell?.material ?? MATERIAL.Empty} state={selectedCell?.state ?? 0} />
        <EventHistoryPanel events={events} />
        <ReplayControls />
      </aside>
    </main>
  );
}

function materialLabel(material: MaterialId) {
  return MATERIAL_NAME[material];
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
