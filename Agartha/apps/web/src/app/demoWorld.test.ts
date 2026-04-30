import { describe, expect, it } from "vitest";

import { MATERIAL } from "@agartha/protocol/world";

import {
  DEFAULT_TOOL_SETTINGS,
  TERRAIN_SEEDS,
  applyMaterialTool,
  demoCell,
  generateTerrain,
} from "./demoWorld";

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

describe("applyMaterialTool", () => {
  it("paints deterministic circular brush footprints", () => {
    const result = applyMaterialTool([], demoCell(64, 64, MATERIAL.Paint).coord, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "brush",
      material: MATERIAL.Plant,
      brushSize: 4,
      hardness: 100,
      opacity: 100,
    });

    expect(result.affected).toBeGreaterThan(20);
    expect(result.cells.every((cell) => cell.material === MATERIAL.Plant)).toBe(true);
    expect(result).toEqual(
      applyMaterialTool([], demoCell(64, 64, MATERIAL.Paint).coord, {
        ...DEFAULT_TOOL_SETTINGS,
        mode: "brush",
        material: MATERIAL.Plant,
        brushSize: 4,
        hardness: 100,
        opacity: 100,
      }),
    );
  });

  it("fills a connected material island with the bucket", () => {
    const cells = [
      demoCell(10, 10, MATERIAL.Plant),
      demoCell(11, 10, MATERIAL.Plant),
      demoCell(12, 10, MATERIAL.Stone),
    ];
    const result = applyMaterialTool(cells, cells[0].coord, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "bucket",
      material: MATERIAL.Water,
    });

    expect(result.affected).toBe(2);
    expect(result.cells.filter((cell) => cell.material === MATERIAL.Water)).toHaveLength(2);
    expect(result.cells.find((cell) => cell.id === cells[2].id)?.material).toBe(MATERIAL.Stone);
  });

  it("fills an enclosed empty space with the bucket", () => {
    const cells = [
      demoCell(20, 20, MATERIAL.Stone),
      demoCell(21, 20, MATERIAL.Stone),
      demoCell(22, 20, MATERIAL.Stone),
      demoCell(20, 21, MATERIAL.Stone),
      demoCell(22, 21, MATERIAL.Stone),
      demoCell(20, 22, MATERIAL.Stone),
      demoCell(21, 22, MATERIAL.Stone),
      demoCell(22, 22, MATERIAL.Stone),
    ];
    const result = applyMaterialTool(cells, demoCell(21, 21, MATERIAL.Empty).coord, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "bucket",
      material: MATERIAL.Paint,
      paintVariant: 2,
    });

    const filledCell = result.cells.find((cell) => cell.id === "21:21");
    expect(result.affected).toBe(1);
    expect(filledCell?.material).toBe(MATERIAL.Paint);
    expect(filledCell?.variant).toBe(2);
    expect(result.cells.filter((cell) => cell.material === MATERIAL.Stone)).toHaveLength(8);
  });

  it("falls back to a small fill when empty space is open", () => {
    const result = applyMaterialTool([], demoCell(30, 30, MATERIAL.Empty).coord, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "bucket",
      material: MATERIAL.Plant,
      brushSize: 2,
    });

    expect(result.affected).toBeGreaterThan(1);
    expect(result.affected).toBeLessThan(30);
    expect(result.cells.every((cell) => cell.material === MATERIAL.Plant)).toBe(true);
  });

  it("clears cells with the eraser", () => {
    const cells = [demoCell(20, 20, MATERIAL.Fire)];
    const result = applyMaterialTool(cells, cells[0].coord, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "eraser",
    });

    expect(result.affected).toBe(1);
    expect(result.cells).toHaveLength(0);
  });
});
