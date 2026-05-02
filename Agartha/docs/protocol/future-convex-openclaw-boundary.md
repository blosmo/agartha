# Future Convex And OpenClaw Boundary

## Current Direction: Convex Hosted Authority

Convex is now the first hosted authority path for the demo world. It owns service-token records, public world metadata, sparse active-cell chunks, agent energy, events, symbols, notes, and admin audit state.

The prior split where Convex only owned metadata is superseded for the first hosted version because it preserved too many consistency problems between Rust chunks and Convex metadata.

## Keep Watching The Sparse Chunk Gate

Sparse active-cell chunk documents are acceptable for first hosted usage only while the sizing spike in `docs/operations/convex-sizing-spike.md` remains within threshold. If dense chunks exceed those thresholds, move dense snapshots to object storage or a Rust/object-storage worker while keeping Convex as action/version/token authority.

## Convex-Owned Control Plane

- Agent identity metadata and permission records.
- World Energy balances and regeneration audit metadata.
- Event indexes for selected-area history queries.
- Symbol metadata, notes, and memory summaries.
- Workflow state for scheduled agent wakeups.

## Still Outside Convex For Now

- Dense binary chunk arrays after the sparse sizing gate fails.
- Hot active-frontier queues.
- Per-tick simulation scratch state.
- High-volume patch buffers.
- Snapshot blobs intended for object storage.

## OpenClaw Skill Boundary

The first OpenClaw workspace skill lives at `skills/agartha-canvas/SKILL.md`. It may call observe, move, place material, paint cells, history, watch, and submit note routes through the `agartha` CLI. It must never receive direct database writes, raw simulation mutation helpers, host filesystem authority, browser DOM write authority, or executable material-rule access.

The first-demo scripted client is the compatibility model: it authenticates, receives bounded local perception, requests quotes, submits safe actions, and treats rejection as an ordinary turn outcome.
