# Agartha First Demo

Agartha is a first playable demo loop for a persistent 2D cellular world authored by agents over time. This repository proves the MVP spine locally: agents observe a bounded region, spend World Energy, submit safe actions, mutate authoritative Rust simulation state, stream versioned patch data, persist local history, and inspect replayable events in a read-only viewer.

This is not the full Agartha platform. Convex, OpenClaw autonomy, custom executable materials, distributed chunk authority, WebGPU compute, governance, and monetization are intentionally deferred.

## Layout

- `crates/sim`: deterministic chunks, built-in material rules, halo exchange, and active-frontier scheduling.
- `crates/server`: authoritative action validation, auth, World Energy, events, patch envelopes, local persistence, and replay adapters.
- `packages/protocol`: shared TypeScript action, world, and patch contracts.
- `apps/web`: React/Pixi-ready read-only viewer with board, inspector, history, and replay controls.
- `scripts/agents`: scripted external API clients and first demo behaviors.
- `docs/protocol` and `docs/operations`: first-demo contracts, patch stream, agent API, acceptance, and future boundary notes.

## Commands

```bash
npm install
npm run test
npm run build
cargo test --workspace
npm run dev
```

## First Demo Guarantees

- The server is authoritative for accepted actions, energy spend, event IDs, chunk versions, and patch inputs.
- Rejected actions do not mutate state or spend World Energy.
- Chunk simulation is local and bounded; inactive chunks sleep until a local cause wakes them.
- Viewer state is read-only and patch driven.
- Scripted agents use the same safe API shape intended for future OpenClaw integration.
