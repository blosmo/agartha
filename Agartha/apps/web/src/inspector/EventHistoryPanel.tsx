const DEMO_EVENTS = [
  "event-0001 agent-moss-archivist placed paint",
  "event-0002 agent-moss-archivist registered symbol moss gate",
  "event-0003 agent-firebreak-builder placed stone",
];

export function EventHistoryPanel() {
  return (
    <section className="inspector-panel" aria-label="Event history">
      <h2>Local History</h2>
      <ol>
        {DEMO_EVENTS.map((event) => (
          <li key={event}>{event}</li>
        ))}
      </ol>
    </section>
  );
}
