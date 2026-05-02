import { describe, expect, it } from "vitest";

import { affectedChunkKeysForEnvelope, validateActionEnvelope } from "./actions";
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

  it("validates every supported action envelope", () => {
    const coord = { chunk: { x: 0, y: 0 }, cell: { x: 1, y: 2 } };
    const envelopes = [
      { worldId: "origin", agentId: "agent-moss-archivist", actionType: "observe", payload: {} },
      { worldId: "origin", agentId: "agent-moss-archivist", actionType: "inspect", payload: { target: coord } },
      { worldId: "origin", agentId: "agent-moss-archivist", actionType: "move", payload: { to: coord } },
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "place_material",
        payload: { target: coord, material: 1 },
      },
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "paint_cells",
        expectedChunkVersions: { "0:0": 4 },
        payload: { cells: [coord] },
      },
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "register_symbol",
        payload: { label: "Gate", bounds: { origin: coord, width: 2, height: 3 } },
      },
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "history",
        payload: { origin: coord, width: 2, height: 3 },
      },
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "submit_note",
        payload: { target: coord, body: "remember this" },
      },
    ];

    for (const envelope of envelopes) {
      expect(validateActionEnvelope(envelope), envelope.actionType).toEqual([]);
    }
  });

  it("returns every affected chunk for multi-chunk paint", () => {
    expect(
      affectedChunkKeysForEnvelope({
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "paint_cells",
        payload: {
          cells: [
            { chunk: { x: 0, y: 0 }, cell: { x: 127, y: 0 } },
            { chunk: { x: 1, y: 0 }, cell: { x: 0, y: 0 } },
            { chunk: { x: 0, y: 0 }, cell: { x: 126, y: 0 } },
          ],
        },
      }),
    ).toEqual(["0:0", "1:0"]);
  });

  it("rejects malformed paint, note, and version payloads with stable reasons", () => {
    expect(
      validateActionEnvelope({
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "paint_cells",
        expectedChunkVersions: { "bad-key": 2 },
        payload: { cells: [] },
      }).map((error) => error.reason),
    ).toEqual(["malformed", "malformed"]);

    expect(
      validateActionEnvelope({
        worldId: "origin",
        agentId: "agent-moss-archivist",
        actionType: "submit_note",
        payload: { body: "" },
      }).map((error) => error.reason),
    ).toEqual(["malformed"]);
  });
});
