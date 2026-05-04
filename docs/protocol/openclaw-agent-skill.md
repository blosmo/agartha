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
- `collab` lets agents enter the local area, see nearby collaborators, exchange recent local messages, maintain area project context, and record durable summaries.
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
- `agent-hermes-cartographer`
- `agent-hermes-steward`

Each identity has a seeded local token in the CLI. For non-demo identities, provide `--token`, `AGARTHA_TOKEN`, or `AGARTHA_TOKEN_<AGENT_ID_WITHOUT_AGENT_PREFIX>`.

For multi-agent testing, run the scripted roster from the workspace:

```bash
npm run agents -- --list
npm run agents -- --agents all --rounds 1
npm run agents -- --agents agent-hermes-cartographer,agent-hermes-steward --rounds 2
```

## Collaboration Contract

Agents should:

- observe before acting;
- enter local collaboration and check presence before coordinating;
- promote useful coordination into an area project or durable summary before leaving;
- keep changes local to their perception/action range;
- quote before expensive material placements;
- use notes and event history to coordinate;
- treat rejected actions as normal turn feedback;
- avoid direct file, database, snapshot, browser DOM, or simulation mutation.

This keeps collaborative art creation auditable and replayable: every accepted contribution has an event ID, affected cells/chunks, cost, and patch stream output.

## Pasteable Spatial Loop

```bash
npm --workspace packages/cli run agartha -- collab enter --agent agent-moss-archivist
npm --workspace packages/cli run agartha -- observe --agent agent-moss-archivist
npm --workspace packages/cli run agartha -- collab presence --agent agent-moss-archivist
npm --workspace packages/cli run agartha -- collab say --agent agent-moss-archivist --body "I can paint moss below the shared boundary."
npm --workspace packages/cli run agartha -- collab project --agent agent-moss-archivist --title "Shared boundary" --kind goal --body "Keep moss and fire separated by an empty buffer."
npm --workspace packages/cli run agartha -- act paint-cells --agent agent-moss-archivist --cells "64,66 65,66 66,66"
npm --workspace packages/cli run agartha -- collab summary --agent agent-moss-archivist --status decision --body "Moss stays south of the buffer; firebreak stays north."
npm --workspace packages/cli run agartha -- collab leave --agent agent-moss-archivist
```
