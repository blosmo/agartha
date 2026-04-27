import type { CellSample, ChunkCoord, ChunkVersion, EventId, WorldId } from "./world";

export type PatchEncoding = "changed_cells" | "dirty_rect" | "full_chunk";

export interface ChunkSnapshot {
  readonly worldId: WorldId;
  readonly chunk: ChunkCoord;
  readonly version: ChunkVersion;
  readonly cells: readonly CellSample[];
}

export interface ChangedCellsPatch {
  readonly encoding: "changed_cells";
  readonly cells: readonly CellSample[];
}

export interface DirtyRectPatch {
  readonly encoding: "dirty_rect";
  readonly originCell: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly cells: readonly CellSample[];
}

export interface FullChunkPatch {
  readonly encoding: "full_chunk";
  readonly snapshot: ChunkSnapshot;
}

export type PatchBody = ChangedCellsPatch | DirtyRectPatch | FullChunkPatch;

export interface PatchEnvelope {
  readonly protocolVersion: 1;
  readonly worldId: WorldId;
  readonly chunk: ChunkCoord;
  readonly baseVersion: ChunkVersion;
  readonly nextVersion: ChunkVersion;
  readonly eventId: EventId;
  readonly body: PatchBody;
}

export function chunkKey(chunk: ChunkCoord): string {
  return `${chunk.x}:${chunk.y}`;
}

export function requiresSnapshotRecovery(
  patch: PatchEnvelope,
  currentVersion: ChunkVersion | undefined,
): boolean {
  return currentVersion !== undefined && currentVersion !== patch.baseVersion;
}
