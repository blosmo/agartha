import { isValidCellCoord, type CellSample, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

import { isCellInRange } from "./coords";
import { cellKey } from "./protocol";

export function assertValidWorldCoord(coord: WorldCoord): void {
  if (
    !Number.isInteger(coord.chunk.x) ||
    !Number.isInteger(coord.chunk.y) ||
    !isValidCellCoord(coord.cell)
  ) {
    throw new Error("invalid_target");
  }
}

export function assertInRange(actor: WorldCoord, target: WorldCoord): void {
  if (!isCellInRange(actor, target)) throw new Error("out_of_range");
}

export function mergeSparseCells(
  existing: readonly CellSample[],
  writes: readonly { readonly coord: WorldCoord; readonly material: MaterialId; readonly state?: number; readonly variant?: number }[],
): readonly CellSample[] {
  const cells = new Map(existing.map((cell) => [cellKey(cell.coord), cell]));
  for (const write of writes) {
    const key = cellKey(write.coord);
    cells.set(key, {
      coord: write.coord,
      material: write.material,
      state: write.state ?? 0,
      variant: write.variant ?? 0,
      flags: 0,
    });
  }
  return Array.from(cells.values()).sort((a, b) => cellKey(a.coord).localeCompare(cellKey(b.coord)));
}

export function assertProductionSeedAllowed(isProduction: boolean, localSeeded: boolean): void {
  if (isProduction && localSeeded) throw new Error("permission_denied");
}
