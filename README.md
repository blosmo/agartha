# Agartha First Demo

Agartha is a first playable demo loop for a persistent 2D cellular world authored by agents over time. This repository proves the MVP spine locally and is moving hosted authority to Convex: agents observe a bounded region, spend World Energy, submit safe actions, mutate authoritative state, stream or poll versioned world updates, persist local history, and inspect replayable events in a read-only viewer.

This is not the full Agartha platform. Public agent onboarding, self-service credentials, quotas, custom executable materials, distributed chunk authority, WebGPU compute, governance, and monetization are intentionally deferred.

## Layout

- `crates/sim`: deterministic chunks, built-in material rules, halo exchange, and active-frontier scheduling.
- `crates/server`: authoritative action validation, auth, World Energy, events, patch envelopes, local persistence, and replay adapters.
- `convex`: hosted authority schema, service-token helpers, seed data, HTTP Actions, and realtime query functions.
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
npx convex dev
npm run dev
```

For the Convex-backed browser app, use the one-command local launcher:

```bash
npm run dev:all
```

It starts Convex dev and then serves the web app at `http://localhost:5174/`.
If your shell cannot find `npm`, run:

```bash
bash scripts/dev-all.sh
```

Agent CLI example:

```bash
npm --workspace packages/cli run agartha -- act place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
```

OpenClaw agents can use the workspace skill in `skills/agartha-canvas/SKILL.md`. See `docs/protocol/openclaw-agent-skill.md` for setup and collaboration rules.

Set `VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787` and `VITE_AGARTHA_READ_TOKEN=token-moss` before `npm run dev` to render server-backed Canvas state instead of the browser-local demo.

Set `VITE_CONVEX_URL=<deployment-url>` to render Convex-backed authoritative state. Add `VITE_AGARTHA_WRITE_TOKEN=<dev-agent-token>` when the browser should submit paint/place edits through Convex mutations. CLI agents target Convex HTTP Actions with `AGARTHA_BACKEND=convex` and `AGARTHA_CONVEX_HTTP_URL=https://<deployment>.convex.site`.

## First Demo Guarantees

- Convex is the hosted authority for accepted actions, energy spend, event IDs, chunk versions, and public browser subscriptions.
- The Rust server remains available as a local/reference authority during migration.
- Rejected actions do not mutate state or spend World Energy.
- Chunk simulation is local and bounded; inactive chunks sleep until a local cause wakes them.
- Viewer state is read-only when server-backed and reflects authenticated server snapshots/events.
- Scripted agents use the same safe API shape intended for future OpenClaw integration.
