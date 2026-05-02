import { describe, expect, it } from "vitest";

import { MATERIAL } from "@agartha/protocol/world";

import {
  DEMO_CANVAS_CELLS,
  DEFAULT_TOOL_SETTINGS,
  TERRAIN_SEEDS,
  absoluteCoord,
  applyMaterialStroke,
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

  it("spreads dense preset material across the full canvas", () => {
    for (const seed of TERRAIN_SEEDS) {
      const cells = generateTerrain(seed);
      const absoluteCells = cells.map((cell) => absoluteCoord(cell.coord));

      expect(cells.length).toBeGreaterThan(12_000);
      expect(Math.min(...absoluteCells.map((cell) => cell.x))).toBeLessThanOrEqual(3);
      expect(Math.max(...absoluteCells.map((cell) => cell.x))).toBeGreaterThanOrEqual(DEMO_CANVAS_CELLS - 4);
      expect(Math.min(...absoluteCells.map((cell) => cell.y))).toBeLessThanOrEqual(3);
      expect(Math.max(...absoluteCells.map((cell) => cell.y))).toBeGreaterThanOrEqual(DEMO_CANVAS_CELLS - 4);
    }
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

describe("applyMaterialStroke", () => {
  it("batches brush stroke targets without rebuilding per coordinate", () => {
    const first = demoCell(64, 64, MATERIAL.Paint).coord;
    const second = demoCell(65, 64, MATERIAL.Paint).coord;
    const batched = applyMaterialStroke([], [first, second], {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "brush",
      material: MATERIAL.Plant,
      brushSize: 4,
      hardness: 100,
      opacity: 100,
    });

    const sequential = applyMaterialTool(applyMaterialTool([], first, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "brush",
      material: MATERIAL.Plant,
      brushSize: 4,
      hardness: 100,
      opacity: 100,
    }).cells, second, {
      ...DEFAULT_TOOL_SETTINGS,
      mode: "brush",
      material: MATERIAL.Plant,
      brushSize: 4,
      hardness: 100,
      opacity: 100,
    });

    expect(batched.cells).toEqual(sequential.cells);
    expect(batched.material).toBe(sequential.material);
    expect(batched.affected).toBeGreaterThan(sequential.affected);
  });
});
