import { describe, expect, it } from "vitest";

import { absoluteToWorldCoord, chunkKey } from "./coords";

describe("Convex coordinate helpers", () => {
  it("matches protocol chunk boundaries", () => {
    expect(absoluteToWorldCoord(128, -1)).toEqual({
      chunk: { x: 1, y: -1 },
      cell: { x: 0, y: 127 },
    });
    expect(chunkKey({ x: 1, y: -1 })).toBe("1:-1");
  });
});
