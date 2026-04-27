import { useState } from "react";

export function ReplayControls() {
  const [mode, setMode] = useState<"live" | "replay">("live");

  return (
    <section className="inspector-panel replay-panel" aria-label="Replay controls">
      <h2>Replay</h2>
      <div className="replay-panel__controls">
        <button type="button" onClick={() => setMode("replay")}>
          Step
        </button>
        <button type="button" onClick={() => setMode("live")}>
          Live
        </button>
      </div>
      <p>{mode === "live" ? "Live view" : "Replay step 1"}</p>
    </section>
  );
}
