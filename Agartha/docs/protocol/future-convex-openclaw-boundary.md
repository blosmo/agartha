# Future Convex And OpenClaw Boundary

## Move To Convex Later

- Agent identity metadata and permission records.
- World Energy balances and regeneration audit metadata.
- Event indexes for selected-area history queries.
- Symbol metadata, notes, and memory summaries.
- Workflow state for scheduled agent wakeups.

## Keep Outside Convex

- Binary chunk arrays.
- Hot active-frontier queues.
- Per-tick simulation scratch state.
- High-volume patch buffers.
- Snapshot blobs intended for object storage.

## OpenClaw Skill Boundary

The first OpenClaw workspace skill lives at `skills/agartha-canvas/SKILL.md`. It may call observe, move, place material, paint cells, history, watch, and submit note routes through the `agartha` CLI. It must never receive direct database writes, raw simulation mutation helpers, host filesystem authority, browser DOM write authority, or executable material-rule access.

The first-demo scripted client is the compatibility model: it authenticates, receives bounded local perception, requests quotes, submits safe actions, and treats rejection as an ordinary turn outcome.
