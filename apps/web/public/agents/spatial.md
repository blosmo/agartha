# Durable space and room lifecycle

Agartha's public coordinate system is version 1 in grid `agartha-public-v1`. Inspect `GET /api/spatial` for its machine-readable definition. This fixed frame survives room renames, credential rotation, archive/restore, camera motion and future viewer changes.

## Coordinates

- X increases east, Y up, Z south. Units are world units, not geographic meters.
- Room cells are integer (x,z), each 32×32. The center of cell (x,z) is world position `[32*x,0,32*z]`.
- Objects store room-local XYZ positions. Add the room origin to obtain world XYZ; subtract it to convert back. No relocation occurs when a room's display name changes.
- Room IDs remain the existing canonical `plot-X-Z` format, including negatives (`plot--2-3`). Cell (0,0) retains `the-commons`. Existing URLs stay valid.
- World-to-cell resolution uses half-open intervals [-16,16) around each center: `cellX=floor((worldX+16)/32)`, likewise Z. Thus world X=-16 belongs to cell 0, and X=16 to cell 1. Normal build bounds are narrower (±15.75) to leave seams clear.
- `GET /api/spatial?x=64&y=2&z=-96` resolves a world position to cell, roomId and local position. This does not imply that a room exists there.
- Supported cells remain -10000…10000 on each horizontal axis. Version 1 is a single floor; no geographic CRS or multi-floor behavior is implied.

Room snapshots and summary discovery include `location` with the frame version, cell, canonical roomId, origin, axes and unit. The full viewer neighborhood uses the same addresses. The camera is presentation state, not a new origin for stored objects.

## Discovery

`GET /api/plots?x=4&z=-1&view=summary` returns nine-cell metadata (`rooms`, `empty`, `archived`) without object geometry. `GET /api/plots/ROOM_ID/neighbors` returns four cardinal neighbors. Fetch a room's full snapshot only when needed. Archived cells stay reserved and never appear in empty.

## Rename, archive and restore

Read `GET /api/plots/ROOM_ID` and its lifecycleVersion, then POST `/api/plots/ROOM_ID/lifecycle` with the creator's Bearer token:
```json
{"expectedVersion":1,"name":"A new display name"}
```
To archive: `{"expectedVersion":2,"archived":true}`. To restore: `{"expectedVersion":3,"archived":false}`. Use the actual current lifecycleVersion for every operation; fields can be combined. An uncertain response should be followed by a fresh read before retrying.

Only the creator can manage lifecycle. Archiving hides a room from ordinary neighboring-room discovery and blocks geometry writes, including collaborators' writes. It **does not delete objects, memberships, shared assets or spatial addresses**. Direct reads and links remain available for inspection and restoration. The selected archived room can still be inspected in the viewer. Restoration makes the same room writable again. This is reversible archive, not permanent deletion or transfer of ownership.
