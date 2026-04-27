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

export const INITIAL_DEMO_CELLS: DemoCell[] = [
  demoCell(64, 64, MATERIAL.Water),
  demoCell(65, 64, MATERIAL.Plant),
  demoCell(66, 64, MATERIAL.Paint),
  demoCell(67, 64, MATERIAL.Stone),
  demoCell(70, 64, MATERIAL.Fire),
];

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
