---
title: Convex sparse chunk sizing spike
date: 2026-05-02
status: initial
---

# Convex Sparse Chunk Sizing Spike

This spike records the first hosted-world storage gate for Agartha's Convex authority.

## Model

- Chunks are sparse documents keyed by `worldId + chunkKey`.
- Each chunk stores only active cells, not a fixed `128 x 128` array.
- First-demo target: keep an individual chunk comfortably below 2,000 active cells and keep the default visible query to the 3x3 origin viewport.
- Events are separate documents keyed by world/time and are queried in bounded windows.

## Initial Thresholds

- Dense painted chunk warning threshold: 2,000 active cells in one chunk document.
- Visible viewport warning threshold: 9 chunks and 5,000 returned active cells.
- Paint burst warning threshold: 100 accepted cells per single action or repeated writes that push mutation latency above interactive use.
- Event query warning threshold: unbounded event queries are disallowed; browser and CLI use explicit `limit`.

## Result

Implementation is ready for the user-run Convex dev loop, but live Convex payload and latency measurements are blocked until `npx convex dev` creates the deployment and generated files.

Before treating sparse chunks as the long-term storage shape, run:

1. `npx convex dev`
2. Seed `origin` with `seed.seedOrigin`
3. Paint a 100-cell burst through the Convex `act` mutation or HTTP Action
4. Inspect chunk document size, visible query payload size, mutation latency, and event growth in the Convex dashboard

If thresholds fail, move dense snapshots to object storage or a Rust/object-storage snapshot worker while keeping Convex as the authority for tokens, actions, versions, events, and metadata.
