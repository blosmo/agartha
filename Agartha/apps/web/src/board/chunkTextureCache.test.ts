import { describe, expect, it } from "vitest";

import { MATERIAL, toWorldCoord, type MaterialId } from "@agartha/protocol/world";
import type { PatchEnvelope } from "@agartha/protocol/patches";

import { ChunkTextureCache } from "./chunkTextureCache";
import { materialColor } from "./materialPalette";

describe("ChunkTextureCache", () => {
  it("creates visible chunk buffers from initial snapshots", () => {
    const cache = new ChunkTextureCache();
    const record = cache.applySnapshot({
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      version: 1,
      cells: [cell(1, 1, MATERIAL.Water)],
    });

    const offset = (1 * 128 + 1) * 4;
    expect(Array.from(record.pixels.slice(offset, offset + 4))).toEqual(materialColor(MATERIAL.Water));
    expect(record.version).toBe(1);
  });

  it("applies ordered patches only to the affected chunk", () => {
    const cache = new ChunkTextureCache();
    cache.applySnapshot({ worldId: "origin", chunk: { x: 0, y: 0 }, version: 1, cells: [] });
    cache.applySnapshot({ worldId: "origin", chunk: { x: 1, y: 0 }, version: 1, cells: [] });

    const patch: PatchEnvelope = {
      protocolVersion: 1,
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      baseVersion: 1,
      nextVersion: 2,
      eventId: "event-0002",
      body: { encoding: "changed_cells", cells: [cell(2, 2, MATERIAL.Fire)] },
    };

    expect(cache.applyPatch(patch)).toEqual({ ok: true, updatedChunk: { x: 0, y: 0 } });
    expect(cache.get({ x: 0, y: 0 })?.version).toBe(2);
    expect(cache.get({ x: 1, y: 0 })?.version).toBe(1);
  });

  it("releases stale texture records outside the visible chunk set", () => {
    const cache = new ChunkTextureCache();
    cache.applySnapshot({ worldId: "origin", chunk: { x: 0, y: 0 }, version: 1, cells: [] });
    cache.applySnapshot({ worldId: "origin", chunk: { x: 1, y: 0 }, version: 1, cells: [] });

    cache.releaseOutside([{ x: 1, y: 0 }]);

    expect(cache.get({ x: 0, y: 0 })).toBeUndefined();
    expect(cache.get({ x: 1, y: 0 })).toBeDefined();
  });
});

function cell(x: number, y: number, material: MaterialId) {
  return {
    coord: toWorldCoord(x, y),
    material,
    state: 0,
    variant: 0,
    flags: 0,
  };
}
