export const CHUNK_SIZE = 128 as const;

export type WorldId = "origin";
export type AgentId = string;
export type EventId = string;
export type SymbolId = string;
export type ChunkVersion = number;

export type MaterialId = 0 | 1 | 2 | 3 | 4 | 5;

export const MATERIAL = {
  Empty: 0,
  Paint: 1,
  Stone: 2,
  Water: 3,
  Fire: 4,
  Plant: 5,
} as const satisfies Record<string, MaterialId>;

export const MATERIAL_NAME: Record<MaterialId, string> = {
  [MATERIAL.Empty]: "empty",
  [MATERIAL.Paint]: "paint",
  [MATERIAL.Stone]: "stone",
  [MATERIAL.Water]: "water",
  [MATERIAL.Fire]: "fire",
  [MATERIAL.Plant]: "plant",
};

export interface ChunkCoord {
  readonly x: number;
  readonly y: number;
}

export interface CellCoord {
  readonly x: number;
  readonly y: number;
}

export interface WorldCoord {
  readonly chunk: ChunkCoord;
  readonly cell: CellCoord;
}

export interface Rect {
  readonly origin: WorldCoord;
  readonly width: number;
  readonly height: number;
}

export interface CellSample {
  readonly coord: WorldCoord;
  readonly material: MaterialId;
  readonly state: number;
  readonly variant: number;
  readonly flags: number;
}

export interface SymbolMetadata {
  readonly id: SymbolId;
  readonly label: string;
  readonly authorAgentId: AgentId;
  readonly bounds: Rect;
  readonly createdEventId: EventId;
  readonly note?: string;
}

export function toWorldCoord(x: number, y: number): WorldCoord {
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return {
    chunk: { x: chunkX, y: chunkY },
    cell: {
      x: positiveModulo(x, CHUNK_SIZE),
      y: positiveModulo(y, CHUNK_SIZE),
    },
  };
}

export function toAbsoluteCoord(coord: WorldCoord): { x: number; y: number } {
  return {
    x: coord.chunk.x * CHUNK_SIZE + coord.cell.x,
    y: coord.chunk.y * CHUNK_SIZE + coord.cell.y,
  };
}

export function isValidCellCoord(cell: CellCoord): boolean {
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y) &&
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < CHUNK_SIZE &&
    cell.y < CHUNK_SIZE
  );
}

export function sameChunk(a: ChunkCoord, b: ChunkCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
