import { describe, expect, it } from "vitest";

import {
  convexSnapshotToDemoWorld,
  paintCellsEnvelope,
  placeMaterialEnvelope,
  readConvexWriteConfig,
} from "./convexWorldClient";

describe("convex world client mapping", () => {
  it("maps Convex chunk snapshots and events into demo-world state", () => {
    const snapshot = convexSnapshotToDemoWorld(
      [
        {
          chunk: { x: 0, y: 0 },
          version: 4,
          cells: [
            {
              coord: { chunk: { x: 0, y: 0 }, cell: { x: 65, y: 65 } },
              material: 1,
              state: 0,
              variant: 2,
            },
          ],
        },
      ],
      [{ id: "event-1", tick: 10, summary: "painted" }],
    );

    expect(snapshot.cells).toMatchObject([{ id: "65:65", material: 1, variant: 2 }]);
    expect(snapshot.events).toEqual([{ id: "event-1", tick: 10, summary: "painted" }]);
    expect(snapshot.chunkVersions).toEqual({ "0:0": 4 });
  });

  it("builds write config and chunk-version envelopes for browser paint", () => {
    const config = readConvexWriteConfig({
      VITE_AGARTHA_AGENT_ID: "agent-browser",
      VITE_AGARTHA_WRITE_TOKEN: "token-browser",
    });

    expect(config).toEqual({ agentId: "agent-browser", token: "token-browser", worldId: "origin" });
    expect(
      placeMaterialEnvelope(
        config!,
        { chunk: { x: 0, y: 0 }, cell: { x: 2, y: 3 } },
        1,
        3,
      ),
    ).toMatchObject({
      actionType: "place_material",
      payload: { material: 1, variant: 3 },
    });

    expect(
      paintCellsEnvelope(
        config!,
        [
          { chunk: { x: 0, y: 0 }, cell: { x: 2, y: 3 } },
          { chunk: { x: 1, y: 0 }, cell: { x: 0, y: 3 } },
        ],
        2,
      ),
    ).toMatchObject({
      actionType: "paint_cells",
      agentId: "agent-browser",
      payload: { variant: 2 },
      worldId: "origin",
    });
  });
});
