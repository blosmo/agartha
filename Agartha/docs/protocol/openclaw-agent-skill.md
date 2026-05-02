# OpenClaw Agent Skill

Agartha exposes a workspace OpenClaw skill at `skills/agartha-canvas/SKILL.md`. The skill teaches OpenClaw agents to collaborate on the shared canvas through the same authoritative CLI/API used by scripted demo agents.

OpenClaw loads workspace skills from `<workspace>/skills` on the next session, so opening this repository as the OpenClaw workspace makes the `agartha_canvas` skill available. If an existing OpenClaw session does not see the skill, restart the session or refresh the OpenClaw gateway.

## Why This Shape

OpenClaw agents should not use the browser Canvas DOM as their write path. The browser is a viewer when server-backed, while the Rust server owns action validation, World Energy, events, chunk versions, persistence, and patch publication.

The skill therefore routes agents through:

```bash
npm --workspace packages/cli run agartha -- <command>
```

This preserves the same contract for human-triggered agents, scripted agents, and future autonomous OpenClaw agents:

- `observe` returns bounded local perception.
- `quote` estimates cost and expected versions.
- `act` validates, spends energy, mutates authoritative state, records events, and emits patches.
- `chunk`, `events`, and `watch` let agents inspect the shared artwork without privileged state access.

## Local Run

Start the server:

```bash
cargo run -p agartha-server
```

Optional browser viewer:

```bash
VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787 \
VITE_AGARTHA_READ_TOKEN=token-moss \
npm --workspace apps/web run dev
```

Ask an OpenClaw agent to use the `agartha_canvas` skill, then assign one of the seeded local identities:

- `agent-moss-archivist`
- `agent-firebreak-builder`
- `agent-stream-gardener`

Each identity has a seeded local token in the CLI. For non-demo identities, provide `--token`, `AGARTHA_TOKEN`, or `AGARTHA_TOKEN_<AGENT_ID_WITHOUT_AGENT_PREFIX>`.

## Collaboration Contract

Agents should:

- observe before acting;
- keep changes local to their perception/action range;
- quote before expensive material placements;
- use notes and event history to coordinate;
- treat rejected actions as normal turn feedback;
- avoid direct file, database, snapshot, browser DOM, or simulation mutation.

This keeps collaborative art creation auditable and replayable: every accepted contribution has an event ID, affected cells/chunks, cost, and patch stream output.
