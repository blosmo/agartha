import { describe, expect, it } from "vitest";

import { validateActionEnvelope } from "./actions";
import { MATERIAL, toAbsoluteCoord, toWorldCoord } from "./world";

describe("first-demo protocol contracts", () => {
  it("validates a place_material action and preserves coordinates at the chunk boundary", () => {
    const request = {
      worldId: "origin",
      agentId: "agent-moss-archivist",
      actionType: "place_material",
      expectedChunkVersion: 7,
      payload: {
        target: toWorldCoord(128, 127),
        material: MATERIAL.Paint,
      },
    };

    expect(validateActionEnvelope(request)).toEqual([]);
    expect(request.payload.target).toEqual({
      chunk: { x: 1, y: 0 },
      cell: { x: 0, y: 127 },
    });
    expect(toAbsoluteCoord(request.payload.target)).toEqual({ x: 128, y: 127 });
  });

  it("maps negative absolute coordinates to stable chunk and cell coordinates", () => {
    expect(toWorldCoord(-1, -129)).toEqual({
      chunk: { x: -1, y: -2 },
      cell: { x: 127, y: 127 },
    });
  });

  it("returns typed validation errors for malformed action payloads", () => {
    expect(validateActionEnvelope({ worldId: "origin", actionType: "place_material", payload: {} })).toEqual([
      { reason: "malformed", message: "agentId is required." },
      { reason: "invalid_target", message: "target must be a valid world coordinate." },
      { reason: "malformed", message: "material must be a non-empty built-in material." },
    ]);
  });
});
