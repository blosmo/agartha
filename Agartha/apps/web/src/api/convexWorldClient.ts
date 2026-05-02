import { anyApi } from "convex/server";
import { useQuery } from "convex/react";
import type { ChunkCoord } from "@agartha/protocol/world";

import { absoluteCoord, type DemoCell, type DemoEvent } from "../app/demoWorld";
import { DEFAULT_SERVER_CHUNKS } from "./worldClient";

interface ConvexChunkSnapshot {
  readonly chunk: ChunkCoord;
  readonly version: number;
  readonly cells: readonly {
    readonly coord: DemoCell["coord"];
    readonly material: DemoCell["material"];
    readonly state: number;
    readonly variant: number;
  }[];
}

interface ConvexEventDto {
  readonly id: string;
  readonly tick: number;
  readonly summary: string;
}

export interface ConvexWorldSnapshot {
  readonly cells: readonly DemoCell[];
  readonly events: readonly DemoEvent[];
  readonly chunkVersions: Record<string, number>;
}

export function useConvexWorldSnapshot(chunks: readonly ChunkCoord[] = DEFAULT_SERVER_CHUNKS): ConvexWorldSnapshot | undefined {
  const snapshots = useQuery(anyApi.chunks.visible, { worldId: "origin", chunks }) as readonly ConvexChunkSnapshot[] | undefined;
  const events = useQuery(anyApi.events.recent, { worldId: "origin", limit: 20 }) as readonly ConvexEventDto[] | undefined;
  if (!snapshots || !events) return undefined;
  return convexSnapshotToDemoWorld(snapshots, events);
}

export function convexSnapshotToDemoWorld(
  snapshots: readonly ConvexChunkSnapshot[],
  events: readonly ConvexEventDto[],
): ConvexWorldSnapshot {
  const cells = snapshots
    .flatMap((snapshot) =>
      snapshot.cells.map((cell) => ({
        id: `${absoluteCoord(cell.coord).x}:${absoluteCoord(cell.coord).y}`,
        coord: cell.coord,
        material: cell.material,
        state: cell.state,
        variant: cell.variant,
        flags: 0,
      })),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    cells,
    events: events.map((event) => ({ id: event.id, tick: event.tick, summary: event.summary })),
    chunkVersions: Object.fromEntries(snapshots.map((snapshot) => [`${snapshot.chunk.x}:${snapshot.chunk.y}`, snapshot.version])),
  };
}
