import { describe, expect, it } from "vitest";

import { MATERIAL } from "@agartha/protocol/world";

import { TERRAIN_SEEDS, generateTerrain } from "./demoWorld";

describe("generateTerrain", () => {
  it("is deterministic for a given seed", () => {
    expect(generateTerrain(TERRAIN_SEEDS[0])).toEqual(generateTerrain(TERRAIN_SEEDS[0]));
  });

  it("produces distinct environments for different seeds", () => {
    const counts = TERRAIN_SEEDS.map((seed) => generateTerrain(seed).length);

    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("preloads multiple built-in materials", () => {
    const materials = new Set(generateTerrain(TERRAIN_SEEDS[1]).map((cell) => cell.material));

    expect(materials.has(MATERIAL.Water)).toBe(true);
    expect(materials.has(MATERIAL.Plant)).toBe(true);
    expect(materials.has(MATERIAL.Stone)).toBe(true);
    expect(materials.has(MATERIAL.Fire)).toBe(true);
  });
});
