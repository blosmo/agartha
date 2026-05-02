import { describe, expect, it } from "vitest";

import { convexSnapshotToDemoWorld } from "./convexWorldClient";

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
});
