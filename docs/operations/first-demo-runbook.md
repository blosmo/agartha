# First Demo Runbook

## Local Components

- Rust simulation crate: deterministic chunks, material rules, and active frontier scheduling.
- Rust server crate: in-process authoritative action state, energy, events, patch envelopes, persistence, and replay adapters.
- Protocol package: TypeScript contracts used by viewer and scripted agents.
- CLI package: JSON-first agent entrypoint over the local HTTP API.
- Web app: React shell with Pixi-ready chunk texture buffers, inspector, local history, and replay controls.
- Scripted agents: external API clients in `scripts/agents/`.

## Commands

```bash
npm install
npm run test
npm run build
cargo test --workspace
cargo run -p agartha-server
npm run dev
```

`cargo run -p agartha-server` starts the local authoritative API at `127.0.0.1:8787`. `npm run dev` starts the browser-local viewer by default.

To run the viewer against server state:

```bash
VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787 \
VITE_AGARTHA_READ_TOKEN=token-moss \
npm --workspace apps/web run dev
```

To submit an agent action without browser automation:

```bash
npm --workspace packages/cli run agartha -- act place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
npm --workspace packages/cli run agartha -- watch --agent agent-moss-archivist --chunk 0:0 --radius 1
```

## Operating Notes

- Mutating actions must authenticate with a seeded bearer token.
- Snapshot, event, and WebSocket read routes also authenticate.
- Accepted actions produce events, energy accounting, affected cells/chunks, and patch inputs.
- Rejected actions must not mutate cells, spend energy, or acknowledge durable events.
- Local persistence is replaceable and stores chunk snapshots, events, agents, symbols, and notes.
- The viewer must remain read-only in server-backed mode; CLI/scripted agents are the first-demo mutation clients.
