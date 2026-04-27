import { describe, expect, it } from "vitest";

import { MATERIAL, toWorldCoord, type MaterialId } from "@agartha/protocol/world";
import type { PatchEnvelope } from "@agartha/protocol/patches";

import { PatchClientState } from "./patchClient";

describe("PatchClientState", () => {
  it("tracks visible chunk subscriptions and records recovery requests", () => {
    const client = new PatchClientState();
    const subscription = client.subscribe({ x: 0, y: 0 }, 1);
    expect(subscription.subscribedChunks).toHaveLength(9);

    client.applySnapshot({
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      version: 4,
      cells: [cell(10, 10, MATERIAL.Paint)],
    });

    const stalePatch: PatchEnvelope = {
      protocolVersion: 1,
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      baseVersion: 3,
      nextVersion: 5,
      eventId: "event-0002",
      body: { encoding: "changed_cells", cells: [cell(10, 10, MATERIAL.Stone)] },
    };

    expect(client.applyPatch(stalePatch)).toEqual({
      ok: false,
      recoveryChunk: { x: 0, y: 0 },
      reason: "version_mismatch",
    });
    expect(client.recoveryRequests).toEqual([{ x: 0, y: 0 }]);
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
