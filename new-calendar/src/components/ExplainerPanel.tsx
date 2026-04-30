import type { OverlayMode } from "../lib/newCalendar";

interface ExplainerPanelProps {
  overlayMode: OverlayMode;
}

export function ExplainerPanel({ overlayMode }: ExplainerPanelProps) {
  const copy = {
    calendar: {
      title: "New Calendar structure",
      body:
        "Tom Sherman's system turns the year into five 73-day seasons. Each season contains two 36-day months with a midpoint reflection day, and each month holds four 9-day planetary weeks.",
      detail:
        "The ring is fixed: birthdays, routines, and seasonal markers return to the same position each year.",
    },
    krystal: {
      title: "Krystal Spiral overlay",
      body:
        "The Krystal source material defines a centered exponential spiral: every octant rotates 45 deg and expands by sqrt(2); every quadrant rotates 90 deg and doubles.",
      detail:
        "The cyan and ember paths show mirrored EtorA and AdorA directions connected back to the central seed point.",
    },
    compare: {
      title: "Spiral comparison",
      body:
        "The comparison view keeps Krystal growth prominent and adds a Golden Mean ghost curve to show the different 90-degree expansion logic: x2 versus Phi.",
      detail:
        "This treats the spiritual source as an interpretive mechanics layer, while the calendar ring remains the timekeeping structure.",
    },
  }[overlayMode];

  return (
    <aside className="explainer-panel" aria-label="Visualization explanation">
      <p className="eyeline">Mechanics layer</p>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <p className="panel-detail">{copy.detail}</p>
      <p className="source-note">
        Sources: The New Calendar reporting; Emerald24 / Spirals of Creation PDF and page.
      </p>
    </aside>
  );
}
