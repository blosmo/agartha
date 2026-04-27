import {
  type CellSample,
  CHUNK_SIZE,
  type ChunkCoord,
  MATERIAL,
  type MaterialId,
  sameChunk,
} from "@agartha/protocol/world";
import {
  type ChunkSnapshot,
  type PatchEnvelope,
  requiresSnapshotRecovery,
} from "@agartha/protocol/patches";

import { materialColor } from "./materialPalette";

export interface ChunkTextureRecord {
  readonly chunk: ChunkCoord;
  version: number;
  readonly pixels: Uint8ClampedArray;
  dirtyRevision: number;
}

export type PatchApplyResult =
  | { readonly ok: true; readonly updatedChunk: ChunkCoord }
  | { readonly ok: false; readonly recoveryChunk: ChunkCoord; readonly reason: "version_mismatch" };

export class ChunkTextureCache {
  private readonly records = new Map<string, ChunkTextureRecord>();

  applySnapshot(snapshot: ChunkSnapshot): ChunkTextureRecord {
    const record = this.getOrCreate(snapshot.chunk);
    record.pixels.fill(0);

    for (const cell of snapshot.cells) {
      this.paintCell(record, cell);
    }

    record.version = snapshot.version;
    record.dirtyRevision += 1;
    return record;
  }

  applyPatch(patch: PatchEnvelope): PatchApplyResult {
    const record = this.records.get(chunkKey(patch.chunk));
    if (requiresSnapshotRecovery(patch, record?.version)) {
      return { ok: false, recoveryChunk: patch.chunk, reason: "version_mismatch" };
    }

    const target = record ?? this.getOrCreate(patch.chunk);

    if (patch.body.encoding === "full_chunk") {
      this.applySnapshot(patch.body.snapshot);
      return { ok: true, updatedChunk: patch.chunk };
    }

    const cells = patch.body.encoding === "dirty_rect" ? patch.body.cells : patch.body.cells;
    for (const cell of cells) {
      if (sameChunk(cell.coord.chunk, patch.chunk)) {
        this.paintCell(target, cell);
      }
    }

    target.version = patch.nextVersion;
    target.dirtyRevision += 1;
    return { ok: true, updatedChunk: patch.chunk };
  }

  get(chunk: ChunkCoord): ChunkTextureRecord | undefined {
    return this.records.get(chunkKey(chunk));
  }

  releaseOutside(visibleChunks: readonly ChunkCoord[]) {
    const keep = new Set(visibleChunks.map(chunkKey));
    for (const key of this.records.keys()) {
      if (!keep.has(key)) {
        this.records.delete(key);
      }
    }
  }

  entries(): ChunkTextureRecord[] {
    return Array.from(this.records.values());
  }

  private getOrCreate(chunk: ChunkCoord): ChunkTextureRecord {
    const key = chunkKey(chunk);
    const existing = this.records.get(key);
    if (existing) {
      return existing;
    }

    const record: ChunkTextureRecord = {
      chunk,
      version: 0,
      pixels: new Uint8ClampedArray(CHUNK_SIZE * CHUNK_SIZE * 4),
      dirtyRevision: 0,
    };
    fillMaterial(record.pixels, MATERIAL.Empty);
    this.records.set(key, record);
    return record;
  }

  private paintCell(record: ChunkTextureRecord, cell: CellSample) {
    const offset = (cell.coord.cell.y * CHUNK_SIZE + cell.coord.cell.x) * 4;
    const color = materialColor(cell.material);
    record.pixels[offset] = color[0];
    record.pixels[offset + 1] = color[1];
    record.pixels[offset + 2] = color[2];
    record.pixels[offset + 3] = color[3];
  }
}

export function chunkKey(chunk: ChunkCoord): string {
  return `${chunk.x}:${chunk.y}`;
}

function fillMaterial(pixels: Uint8ClampedArray, material: MaterialId) {
  const color = materialColor(material);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  }
}
