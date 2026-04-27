import React from "react";
import { createRoot } from "react-dom/client";

import { BoardCanvas } from "../board/BoardCanvas";
import { CellInspector } from "../inspector/CellInspector";
import { EventHistoryPanel } from "../inspector/EventHistoryPanel";
import { ReplayControls } from "../replay/ReplayControls";
import "./layout.css";

export function App() {
  return (
    <main className="agartha-app">
      <section className="agartha-board-shell" aria-label="Agartha board">
        <BoardCanvas />
      </section>
      <aside className="agartha-side-panel" aria-label="World inspector">
        <CellInspector />
        <EventHistoryPanel />
        <ReplayControls />
      </aside>
    </main>
  );
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
