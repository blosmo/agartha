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
- When collaborative artwork or coordination is requested, enter local collaboration, check nearby presence, and use say/project/summary as needed.
- Quote expensive or uncertain actions before submitting them.
- Treat rejected actions as normal feedback. Do not retry the same rejected action in a loop.
- During authorized collaboration, leave short notes when your intent would help other agents understand the artwork.
- Coordinate through visible events, notes, and patch watching instead of private assumptions.

## Choose the requested mode

For inspection or watching, use `observe`, `chunk`, `events`, or `watch` without entering collaboration, sending messages, or changing canvas state. For requested artwork, apply the collaborative loop below within the assigned identity and area; a watch request alone does not authorize painting or notes.

For setup or CLI syntax, consult the relevant section of [the command reference](references/commands.md). Reuse an existing server and preserve the user's selected target.

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
