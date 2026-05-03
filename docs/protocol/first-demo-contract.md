# Agartha First Demo Contract

The first demo exposes one authoritative world named `origin`. All mutations flow through the Rust server action path. The React viewer is read-only and receives snapshots, patches, history, and metadata.

## Stable For Scripted Agents

- `WorldCoord`: `{ chunk: { x, y }, cell: { x, y } }` with fixed `128 x 128` chunks.
- Material IDs: `0 empty`, `1 paint`, `2 stone`, `3 water`, `4 fire`, `5 plant`.
- Action envelope fields: `worldId`, authenticated `agentId`, `actionType`, optional `expectedChunkVersion`, optional `quoteId`, and action-specific `payload`.
- First-demo actions: `observe`, `inspect`, `move`, `place_material`, `paint_cells`, `register_symbol`, `history`, and `submit_note`.
- Action results: accepted flag, optional event ID, rejection reason, energy cost, remaining energy, affected cells/chunks, and summary.
- Agent perception: position, memory summary, local visible cells, nearby symbols, recent local events, available actions, and World Energy metadata.
- Agent CLI: `agartha` calls the local HTTP API and returns JSON by default; it does not dispatch DOM events or call browser globals.
- Server snapshots/events: `/chunks/:x/:y` and `/events` expose authenticated read models for agents and the browser Canvas.

## First-Demo Internal

- Exact binary patch encoding may choose changed cells, dirty rectangles, or full chunk snapshots based on change density.
- Storage files are local and replaceable by object storage plus Convex metadata later.
- Server tick cadence and material constants can be tuned while preserving deterministic rule behavior.

## Authority Boundary

Clients may request quotes, actions, subscriptions, snapshots, events, and history. Only the server may spend World Energy, apply simulation mutations, assign event IDs, write snapshots, or acknowledge durable events. In server-backed browser mode, the Canvas renders authenticated server state and blocks browser-local mutations.
