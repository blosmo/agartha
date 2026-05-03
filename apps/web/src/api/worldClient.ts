import { CHUNK_SIZE, MATERIAL, type ChunkCoord, type WorldCoord, type CellSample } from "@agartha/protocol/world";
import type { ChunkSnapshot } from "@agartha/protocol/patches";

import { absoluteCoord, type DemoCell, type DemoEvent } from "../app/demoWorld";

export interface ServerWorldConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly chunks?: readonly ChunkCoord[];
}

export interface ServerWorldSnapshot {
  readonly cells: DemoCell[];
  readonly collaboration?: ServerCollaborationContext;
  readonly events: DemoEvent[];
  readonly chunkVersions: Record<string, number>;
}

export interface WorldEventDto {
  readonly id: string;
  readonly tick: number;
  readonly summary: string;
}

export interface ServerCollaborationContext {
  readonly area: { readonly id: string; readonly centerX?: number; readonly centerY?: number; readonly radius: number };
  readonly presence: ReadonlyArray<{ readonly agentId: string; readonly displayName?: string; readonly live: boolean }>;
  readonly recentMessages: ReadonlyArray<{ readonly id: string; readonly authorAgentId: string; readonly body: string }>;
  readonly projects: ReadonlyArray<{ readonly id: string; readonly title: string; readonly version: number; readonly entries: ReadonlyArray<{ readonly kind: string; readonly body: string }> }>;
  readonly durableSummaries: ReadonlyArray<{ readonly id: string; readonly body: string; readonly provenance?: { readonly status?: string; readonly authorAgentId?: string } }>;
}

export const DEFAULT_SERVER_CHUNKS: readonly ChunkCoord[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

export function readServerWorldConfig(env: Record<string, string | boolean | undefined>): ServerWorldConfig | undefined {
  const baseUrl = typeof env.VITE_AGARTHA_SERVER_URL === "string" ? env.VITE_AGARTHA_SERVER_URL.trim() : "";
  if (!baseUrl) return undefined;

  const token = typeof env.VITE_AGARTHA_READ_TOKEN === "string" ? env.VITE_AGARTHA_READ_TOKEN.trim() : "";
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
  };
}

export async function fetchServerWorldSnapshot(
  config: ServerWorldConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ServerWorldSnapshot> {
  if (!config.token) {
    throw new ServerWorldError("missing_token", "VITE_AGARTHA_READ_TOKEN is required for server-backed Canvas mode.");
  }

  const chunks = config.chunks ?? DEFAULT_SERVER_CHUNKS;
  const [events, perception, snapshots] = await Promise.all([
    fetchJson<WorldEventDto[]>(`${config.baseUrl}/events`, config.token, fetchImpl),
    fetchJson<{ readonly collaboration?: ServerCollaborationContext }>(`${config.baseUrl}/observe`, config.token, fetchImpl),
    Promise.all(
      chunks.map((chunk) =>
        fetchJson<ChunkSnapshot>(`${config.baseUrl}/chunks/${chunk.x}/${chunk.y}`, config.token, fetchImpl),
      ),
    ),
  ]);

  const cells = snapshots
    .flatMap((snapshot) => snapshot.cells.filter((cell) => cell.material !== MATERIAL.Empty).map(cellSampleToDemoCell))
    .sort(sortDemoCells);
  const chunkVersions = Object.fromEntries(snapshots.map((snapshot) => [chunkKey(snapshot.chunk), snapshot.version]));

  return {
    cells,
    collaboration: perception.collaboration,
    chunkVersions,
    events: events.map((event) => ({
      id: event.id,
      summary: event.summary,
      tick: event.tick,
    })),
  };
}

export class ServerWorldError extends Error {
  constructor(
    readonly reason: "missing_token" | "request_failed",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ServerWorldError";
  }
}

async function fetchJson<TResponse>(url: string, token: string, fetchImpl: typeof fetch): Promise<TResponse> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ServerWorldError("request_failed", message || response.statusText, response.status);
  }

  return (await response.json()) as TResponse;
}

function cellSampleToDemoCell(cell: CellSample): DemoCell {
  return {
    coord: cell.coord,
    flags: cell.flags,
    id: cellKey(cell.coord),
    material: cell.material,
    state: cell.state,
    variant: cell.variant,
  };
}

function cellKey(coord: WorldCoord): string {
  const absolute = absoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

function chunkKey(chunk: ChunkCoord): string {
  return `${chunk.x}:${chunk.y}`;
}

function sortDemoCells(a: DemoCell, b: DemoCell) {
  const absoluteA = absoluteCoord(a.coord);
  const absoluteB = absoluteCoord(b.coord);
  return absoluteA.y - absoluteB.y || absoluteA.x - absoluteB.x;
}

export function boardChunkForAbsoluteCell(x: number, y: number): ChunkCoord {
  return {
    x: Math.floor(x / CHUNK_SIZE),
    y: Math.floor(y / CHUNK_SIZE),
  };
}
