import type { DemoEvent } from "../app/demoWorld";

export interface EventHistoryPanelProps {
  readonly events: readonly DemoEvent[];
}

export function EventHistoryPanel({ events }: EventHistoryPanelProps) {
  return (
    <section className="inspector-panel gradient-border gradient-border-to-br" aria-label="Event history" data-agent-region="event-history">
      <h2>Local History</h2>
      <ol aria-live="polite" className="event-history-panel__list" role="log">
        {events.map((event) => (
          <li data-agent-id={`event-${event.id}`} key={event.id}>
            {event.id} tick {event.tick}: {event.summary}
          </li>
        ))}
      </ol>
    </section>
  );
}
