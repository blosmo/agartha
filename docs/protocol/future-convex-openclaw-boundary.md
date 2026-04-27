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

Future OpenClaw skills may call observe, inspect, move, place material, paint cells, register symbol, history, and submit note endpoints. They must never receive direct database writes, raw simulation mutation helpers, host filesystem authority, or executable material-rule access.

The first-demo scripted client is the compatibility model: it authenticates, receives bounded local perception, requests quotes, submits safe actions, and treats rejection as an ordinary turn outcome.
