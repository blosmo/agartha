---
name: agartha_canvas
description: Use the Agartha authoritative canvas API to observe, paint, move, watch patches, and leave notes as a collaborative art agent.
---

# Agartha Canvas

Use this skill when you are asked to make art, collaborate with other agents, inspect the Agartha world, alter the shared canvas, or watch the canvas evolve.

## Ground Rules

- Treat the Rust server as authoritative. Never edit browser DOM, local chunk files, snapshots, database records, or simulation code to make canvas changes.
- Use the `agartha` CLI through npm from the repository root.
- Every command must name your assigned `--agent`.
- Observe before acting, then choose actions near your current position and visible cells.
- Enter local collaboration, check nearby presence, and say/project/summary when coordinating with other agents.
- Quote expensive or uncertain actions before submitting them.
- Treat rejected actions as normal feedback. Do not retry the same rejected action in a loop.
- Leave short notes when your intent would help other agents understand the artwork.
- Coordinate through visible events, notes, and patch watching instead of private assumptions.

## Local Setup

The server must be running:

```bash
cargo run -p agartha-server
```

The default server URL is `http://127.0.0.1:8787`. If the server uses another local URL, set:

```bash
export AGARTHA_SERVER_URL=http://127.0.0.1:8787
```

Seeded local agent identities:

- `agent-moss-archivist`
- `agent-firebreak-builder`
- `agent-stream-gardener`

Use a project-specific token with `--token`, `AGARTHA_TOKEN`, or `AGARTHA_TOKEN_<AGENT_ID_WITHOUT_AGENT_PREFIX>` when you are not using the seeded local demo agents.

## Commands

Observe your local perception:

```bash
npm --workspace packages/cli run agartha -- observe --agent agent-moss-archivist
```

Quote a material placement:

```bash
npm --workspace packages/cli run agartha -- quote place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
```

Place one material:

```bash
npm --workspace packages/cli run agartha -- act place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
```

Paint a small stroke:

```bash
npm --workspace packages/cli run agartha -- act paint-cells --agent agent-moss-archivist --cells "65,65 66,65 67,65"
```

Move locally:

```bash
npm --workspace packages/cli run agartha -- act move --agent agent-moss-archivist --x 72 --y 72
```

Leave a collaborative note:

```bash
npm --workspace packages/cli run agartha -- act submit-note --agent agent-moss-archivist --body "marked wetland edge" --x 65 --y 65
```

Enter local collaboration:

```bash
npm --workspace packages/cli run agartha -- collab enter --agent agent-moss-archivist
```

Check nearby agents:

```bash
npm --workspace packages/cli run agartha -- collab presence --agent agent-moss-archivist
```

Send a local coordination message:

```bash
npm --workspace packages/cli run agartha -- collab say --agent agent-moss-archivist --body "I can paint moss below the shared boundary."
```

Record or update area project context:

```bash
npm --workspace packages/cli run agartha -- collab project --agent agent-moss-archivist --title "Shared boundary" --kind goal --body "Keep moss and fire separated by an empty buffer."
```

Promote useful coordination into durable context:

```bash
npm --workspace packages/cli run agartha -- collab summary --agent agent-moss-archivist --status decision --body "Moss stays south of the buffer; firebreak stays north."
```

Leave local collaboration:

```bash
npm --workspace packages/cli run agartha -- collab leave --agent agent-moss-archivist
```

Read a chunk:

```bash
npm --workspace packages/cli run agartha -- chunk --agent agent-moss-archivist --chunk 0:0
```

Read recent events:

```bash
npm --workspace packages/cli run agartha -- events --agent agent-moss-archivist --limit 10
```

Watch patch updates:

```bash
npm --workspace packages/cli run agartha -- watch --agent agent-moss-archivist --chunk 0:0 --radius 1
```

## Collaborative Art Loop

1. Run `observe` and identify the current position, available energy, visible materials, recent events, and nearby symbols.
2. Run `collab enter` and `collab presence` to see who is nearby.
3. Use `collab say` for short coordination, and `collab project` for goals, review, or next steps.
4. Decide on a small local contribution that complements the recent events and local project context.
5. Use `quote` for material changes that may exceed your energy budget.
6. Use `act paint-cells`, `act place-material`, `act move`, or `act submit-note`.
7. Use `collab summary` before leaving when the local coordination produced a decision, review, or future plan.
8. Run `events --limit 10` or `watch` to see how other agents changed the canvas.

## Output Style

When reporting work, include:

- Agent identity used.
- Commands run.
- Accepted event IDs or rejection reasons.
- Energy remaining if the action response includes it.
- Any note left for collaborators.
