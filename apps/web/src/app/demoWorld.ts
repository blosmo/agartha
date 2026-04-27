import { MATERIAL, toWorldCoord, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

export interface DemoCell {
  readonly id: string;
  readonly coord: WorldCoord;
  readonly material: MaterialId;
  readonly state: number;
  readonly variant: number;
  readonly flags: number;
}

export interface DemoEvent {
  readonly id: string;
  readonly tick: number;
  readonly summary: string;
}

export interface TerrainSeed {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly seed: number;
}

export const TERRAIN_SEEDS: TerrainSeed[] = [
  {
    id: "stream-garden",
    label: "Stream Garden",
    description: "Water channels, plant clusters, and a few agent markers.",
    seed: 1843,
  },
  {
    id: "ember-break",
    label: "Ember Break",
    description: "Stone ridges and fire pockets cutting through dry growth.",
    seed: 9021,
  },
  {
    id: "stone-delta",
    label: "Stone Delta",
    description: "Dense rock islands split by branching water paths.",
    seed: 4777,
  },
];

export const DEFAULT_TERRAIN_SEED = TERRAIN_SEEDS[0];
export const INITIAL_DEMO_CELLS: DemoCell[] = generateTerrain(DEFAULT_TERRAIN_SEED);

export function generateTerrain(terrainSeed: TerrainSeed): DemoCell[] {
  const random = seededRandom(terrainSeed.seed);
  const cells = new Map<string, DemoCell>();

  function set(x: number, y: number, material: MaterialId, state = 0) {
    const cell = demoCell(x, y, material, state);
    cells.set(cell.id, cell);
  }

  const centerX = 64 + Math.floor(random() * 12) - 6;
  const centerY = 64 + Math.floor(random() * 10) - 5;

  for (let x = 44; x <= 92; x += 1) {
    const wave = Math.round(Math.sin((x + terrainSeed.seed) * 0.19) * 4);
    const riverY = centerY + wave + Math.floor(random() * 3) - 1;
    set(x, riverY, MATERIAL.Water);
    if (random() > 0.62) set(x, riverY + 1, MATERIAL.Water);
    if (random() > 0.74) set(x, riverY - 1, MATERIAL.Plant);
  }

  for (let index = 0; index < 110; index += 1) {
    const x = centerX + Math.floor(random() * 58) - 29;
    const y = centerY + Math.floor(random() * 44) - 22;
    const roll = random();

    if (roll < 0.46) {
      set(x, y, MATERIAL.Plant);
    } else if (roll < 0.68) {
      set(x, y, MATERIAL.Stone);
    } else if (roll < 0.83) {
      set(x, y, MATERIAL.Paint);
    } else if (roll < 0.93) {
      set(x, y, MATERIAL.Water);
    } else {
      set(x, y, MATERIAL.Fire, Math.floor(random() * 2));
    }
  }

  if (terrainSeed.id === "ember-break") {
    for (let offset = -18; offset <= 18; offset += 1) {
      set(centerX + offset, centerY + Math.round(offset * 0.35), MATERIAL.Stone);
      if (offset % 9 === 0) set(centerX + offset, centerY - 5, MATERIAL.Fire);
    }
  }

  if (terrainSeed.id === "stone-delta") {
    for (let offset = -20; offset <= 20; offset += 2) {
      set(centerX + offset, centerY + 10 + Math.round(Math.sin(offset) * 3), MATERIAL.Stone);
      set(centerX + offset, centerY - 10 + Math.round(Math.cos(offset) * 3), MATERIAL.Stone);
    }
  }

  set(centerX, centerY, MATERIAL.Paint);
  set(centerX + 1, centerY, MATERIAL.Stone);
  set(centerX + 2, centerY, MATERIAL.Plant);

  return Array.from(cells.values()).sort(compareCells);
}

export function demoCell(x: number, y: number, material: MaterialId, state = 0): DemoCell {
  const coord = toWorldCoord(x, y);
  return {
    id: cellKey(coord),
    coord,
    material,
    state,
    variant: 0,
    flags: 0,
  };
}

export function cellKey(coord: WorldCoord): string {
  const absolute = absoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

export function absoluteCoord(coord: WorldCoord) {
  return {
    x: coord.chunk.x * 128 + coord.cell.x,
    y: coord.chunk.y * 128 + coord.cell.y,
  };
}

export function upsertCell(cells: readonly DemoCell[], coord: WorldCoord, material: MaterialId): DemoCell[] {
  const key = cellKey(coord);
  const next = new Map(cells.map((cell) => [cell.id, cell]));

  if (material === MATERIAL.Empty) {
    next.delete(key);
  } else {
    next.set(key, {
      id: key,
      coord,
      material,
      state: 0,
      variant: 0,
      flags: 0,
    });
  }

  return Array.from(next.values()).sort(compareCells);
}

export function stepDemoWorld(cells: readonly DemoCell[]): DemoCell[] {
  const next = new Map(cells.map((cell) => [cell.id, cell]));
  const occupied = new Set(next.keys());

  for (const cell of cells) {
    const { x, y } = absoluteCoord(cell.coord);

    if (cell.material === MATERIAL.Water) {
      const below = toWorldCoord(x, y + 1);
      const belowKey = cellKey(below);
      if (!occupied.has(belowKey)) {
        next.delete(cell.id);
        next.set(belowKey, { ...cell, id: belowKey, coord: below });
        occupied.delete(cell.id);
        occupied.add(belowKey);
      }
    }

    if (cell.material === MATERIAL.Fire) {
      const nextAge = cell.state + 1;
      if (nextAge > 3) {
        next.delete(cell.id);
        occupied.delete(cell.id);
      } else {
        next.set(cell.id, { ...cell, state: nextAge });
      }

      for (const target of [
        toWorldCoord(x + 1, y),
        toWorldCoord(x - 1, y),
        toWorldCoord(x, y + 1),
        toWorldCoord(x, y - 1),
      ]) {
        const targetKey = cellKey(target);
        const targetCell = next.get(targetKey);
        if (targetCell?.material === MATERIAL.Plant) {
          next.set(targetKey, { ...targetCell, material: MATERIAL.Fire, state: 0 });
        }
      }
    }

    if (cell.material === MATERIAL.Plant) {
      const nearWater = [
        toWorldCoord(x + 1, y),
        toWorldCoord(x - 1, y),
        toWorldCoord(x, y + 1),
        toWorldCoord(x, y - 1),
      ].some((coord) => next.get(cellKey(coord))?.material === MATERIAL.Water);

      if (nearWater) {
        const growTarget = toWorldCoord(x + 1, y + 1);
        const growKey = cellKey(growTarget);
        if (!occupied.has(growKey)) {
          next.set(growKey, demoCell(x + 1, y + 1, MATERIAL.Plant));
          occupied.add(growKey);
        }
      }
    }
  }

  return Array.from(next.values()).sort(compareCells);
}

function compareCells(a: DemoCell, b: DemoCell) {
  const absoluteA = absoluteCoord(a.coord);
  const absoluteB = absoluteCoord(b.coord);
  return absoluteA.y - absoluteB.y || absoluteA.x - absoluteB.x;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
