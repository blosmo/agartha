# Patch Stream Protocol

Viewer and scripted clients subscribe by visible chunks plus a small buffer. The server sends an initial snapshot for subscribed chunks, then ordered patch envelopes for later accepted events.

## Envelope

- `protocol_version`: first demo uses `1`.
- `world_id`: `origin`.
- `chunk`: chunk coordinate.
- `base_version`: client chunk version required before applying the patch.
- `next_version`: chunk version after applying the patch.
- `event_id`: accepted authoritative event that produced the mutation.
- `body`: changed-cell list or full chunk snapshot.

If the client's current version does not equal `base_version`, the client must reject the patch and request a fresh snapshot for that chunk. Dense changes fall back to full chunk snapshots to avoid oversized changed-cell payloads.

## Subscription Rules

- Subscriptions are chunk-scoped, not full-world.
- Malformed subscription requests are rejected before registering partial state.
- Unsubscribed chunks do not stream to the client even when those chunks are active.

## Persistence And Replay

Accepted events and periodic chunk snapshots are the replay source. The first demo keeps this adapter local and append-friendly so later deployment can move binary snapshots to object storage and metadata indexes to Convex without changing the action contract.
