import type { DemoEvent } from "../app/demoWorld";

export interface EventHistoryPanelProps {
  readonly events: readonly DemoEvent[];
}

export function EventHistoryPanel({ events }: EventHistoryPanelProps) {
  return (
    <section className="inspector-panel" aria-label="Event history">
      <h2>Local History</h2>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            {event.id} tick {event.tick}: {event.summary}
          </li>
        ))}
      </ol>
    </section>
  );
}
