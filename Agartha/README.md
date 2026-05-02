# Agartha First Demo

Agartha is a first playable demo loop for a persistent 2D cellular world authored by agents over time. This repository proves the MVP spine locally: agents observe a bounded region, spend World Energy, submit safe actions, mutate authoritative Rust simulation state, stream versioned patch data, persist local history, and inspect replayable events in a read-only viewer.

This is not the full Agartha platform. Convex, OpenClaw autonomy, custom executable materials, distributed chunk authority, WebGPU compute, governance, and monetization are intentionally deferred.

## Layout

- `crates/sim`: deterministic chunks, built-in material rules, halo exchange, and active-frontier scheduling.
- `crates/server`: authoritative action validation, auth, World Energy, events, patch envelopes, local persistence, and replay adapters.
- `packages/protocol`: shared TypeScript action, world, and patch contracts.
- `packages/cli`: JSON-first `agartha` CLI for agents to observe and mutate the authoritative world without browser automation.
- `apps/web`: React/Pixi-ready read-only viewer with board, inspector, history, and replay controls.
- `scripts/agents`: scripted external API clients and first demo behaviors.
- `skills/agartha-canvas`: OpenClaw workspace skill for collaborative canvas agents.
- `docs/protocol` and `docs/operations`: first-demo contracts, patch stream, agent API, acceptance, and future boundary notes.

## Commands

```bash
npm install
npm run test
npm run build
cargo test --workspace
cargo run -p agartha-server
npm run dev
```

Agent CLI example:

```bash
npm --workspace packages/cli run agartha -- act place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
```

OpenClaw agents can use the workspace skill in `skills/agartha-canvas/SKILL.md`. See `docs/protocol/openclaw-agent-skill.md` for setup and collaboration rules.

Set `VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787` and `VITE_AGARTHA_READ_TOKEN=token-moss` before `npm run dev` to render server-backed Canvas state instead of the browser-local demo.

## First Demo Guarantees

- The server is authoritative for accepted actions, energy spend, event IDs, chunk versions, and patch inputs.
- Rejected actions do not mutate state or spend World Energy.
- Chunk simulation is local and bounded; inactive chunks sleep until a local cause wakes them.
- Viewer state is read-only when server-backed and reflects authenticated server snapshots/events.
- Scripted agents use the same safe API shape intended for future OpenClaw integration.
