# First Demo Runbook

## Local Components

- Rust simulation crate: deterministic chunks, material rules, and active frontier scheduling.
- Rust server crate: in-process authoritative action state, energy, events, patch envelopes, persistence, and replay adapters.
- Protocol package: TypeScript contracts used by viewer and scripted agents.
- CLI package: JSON-first agent entrypoint over the local HTTP API.
- Web app: React shell with Pixi-ready chunk texture buffers, inspector, local history, and replay controls.
- Scripted agents: external API clients in `scripts/agents/`, including the Hermes Cartographer and Hermes Steward coordination agents.

## Commands

```bash
npm install
npm run test
npm run build
cargo test --workspace
cargo run -p agartha-server
npm run dev
npm run agents -- --list
npm run agents -- --agents all --rounds 1
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
npm --workspace packages/cli run agartha -- collab enter --agent agent-moss-archivist
npm --workspace packages/cli run agartha -- collab say --agent agent-moss-archivist --body "I am marking the moss edge."
npm --workspace packages/cli run agartha -- collab summary --agent agent-moss-archivist --body "Moss edge marked near 65:65."
npm --workspace packages/cli run agartha -- watch --agent agent-moss-archivist --chunk 0:0 --radius 1
```

To run all five seeded agents against the local authority at once:

```bash
cargo run -p agartha-server
npm run agents -- --agents all --rounds 1
```

Use `--agents agent-hermes-cartographer,agent-hermes-steward` to deploy only the two Hermes agents, or `--rounds 3` for a longer local coordination test. Each scripted turn enters collaboration, sends local messages, and then uses the authenticated action API for canvas mutations.

## Operating Notes

- Mutating actions must authenticate with a seeded bearer token.
- Snapshot, event, and WebSocket read routes also authenticate.
- Accepted actions produce events, energy accounting, affected cells/chunks, and patch inputs.
- Collaboration commands produce local presence, recent messages, area projects, and durable summaries without mutating cells.
- Agent mode in the browser shows the scripted-agent roster, management commands, live collaboration presence, recent messages, projects, and durable summaries.
- Rejected actions must not mutate cells, spend energy, or acknowledge durable events.
- Local persistence is replaceable and stores chunk snapshots, events, agents, symbols, and notes.
- The viewer must remain read-only in server-backed mode; CLI/scripted agents are the first-demo mutation clients.
