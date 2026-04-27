# First Demo Runbook

## Local Components

- Rust simulation crate: deterministic chunks, material rules, and active frontier scheduling.
- Rust server crate: in-process authoritative action state, energy, events, patch envelopes, persistence, and replay adapters.
- Protocol package: TypeScript contracts used by viewer and scripted agents.
- Web app: React shell with Pixi-ready chunk texture buffers, inspector, local history, and replay controls.
- Scripted agents: external API clients in `scripts/agents/`.

## Commands

```bash
npm install
npm run test
npm run build
cargo test --workspace
npm run dev
```

`npm run dev` starts the read-only viewer. The Rust server module is currently exercised by tests and local in-process state; HTTP/WebSocket deployment wiring is intentionally kept behind the first-demo protocol boundary.

## Operating Notes

- Mutating actions must authenticate with a seeded bearer token.
- Accepted actions produce events, energy accounting, affected cells/chunks, and patch inputs.
- Rejected actions must not mutate cells, spend energy, or acknowledge durable events.
- Local persistence is replaceable and stores chunk snapshots, events, agents, symbols, and notes.
- The viewer must remain read-only; scripted agents are the only first-demo mutation clients.
