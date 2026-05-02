import { describe, expect, it } from "vitest";

import { actionCost, effectiveEnergy, toChunkSnapshot, validatePublicEnvelope } from "./protocol";

describe("Convex protocol mapping", () => {
  it("validates public envelopes and computes multi-cell paint cost", () => {
    const envelope = {
      worldId: "origin",
      agentId: "agent-moss-archivist",
      actionType: "paint_cells",
      payload: {
        cells: [
          { chunk: { x: 0, y: 0 }, cell: { x: 1, y: 1 } },
          { chunk: { x: 0, y: 0 }, cell: { x: 2, y: 1 } },
        ],
      },
    };
    expect(validatePublicEnvelope(envelope)).toMatchObject({ ok: true });
    expect(actionCost(envelope as never)).toBe(4);
  });

  it("maps chunk documents to public snapshots without empty cells", () => {
    expect(
      toChunkSnapshot({
        worldId: "origin",
        chunkKey: "0:0",
        chunk: { x: 0, y: 0 },
        version: 3,
        cells: [
          { coord: { chunk: { x: 0, y: 0 }, cell: { x: 1, y: 1 } }, material: 0, state: 0, variant: 0, flags: 0 },
          { coord: { chunk: { x: 0, y: 0 }, cell: { x: 2, y: 1 } }, material: 1, state: 0, variant: 0, flags: 0 },
        ],
      }).cells,
    ).toHaveLength(1);
  });

  it("computes capped regenerated energy without persistence", () => {
    expect(
      effectiveEnergy(
        {
          worldId: "origin",
          agentId: "agent-moss-archivist",
          position: { chunk: { x: 0, y: 0 }, cell: { x: 1, y: 1 } },
          memorySummary: "",
          energy: 48,
          energyCap: 50,
          energyUpdatedAt: 1_000,
          regeneratesEveryMs: 2_000,
        },
        11_000,
      ),
    ).toBe(50);
  });
});
