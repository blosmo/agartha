import { CHUNK_SIZE, type ChunkCoord, type WorldCoord } from "@agartha/protocol/world";

export function chunkKey(chunk: ChunkCoord): string {
  return `${chunk.x}:${chunk.y}`;
}

export function positiveModulo(value: number, modulo = CHUNK_SIZE): number {
  return ((value % modulo) + modulo) % modulo;
}

export function absoluteToWorldCoord(x: number, y: number): WorldCoord {
  return {
    chunk: { x: Math.floor(x / CHUNK_SIZE), y: Math.floor(y / CHUNK_SIZE) },
    cell: { x: positiveModulo(x), y: positiveModulo(y) },
  };
}

export function worldCoordToAbsolute(coord: WorldCoord): { readonly x: number; readonly y: number } {
  return {
    x: coord.chunk.x * CHUNK_SIZE + coord.cell.x,
    y: coord.chunk.y * CHUNK_SIZE + coord.cell.y,
  };
}

export function isCellInRange(actor: WorldCoord, target: WorldCoord, range = 96): boolean {
  const a = worldCoordToAbsolute(actor);
  const b = worldCoordToAbsolute(target);
  return Math.abs(a.x - b.x) <= range && Math.abs(a.y - b.y) <= range;
}

export function eventId(now: number, suffix: string): string {
  return `event-${Math.round(now).toString(36)}-${suffix}`;
}
