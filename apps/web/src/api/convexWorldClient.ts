import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { ActionEnvelope, ActionResult, PaintCellsPayload, PlaceMaterialPayload } from "@agartha/protocol/actions";
import type { ChunkCoord, MaterialId, WorldCoord } from "@agartha/protocol/world";

import { absoluteCoord, type DemoCell, type DemoEvent } from "../app/demoWorld";
import { DEFAULT_SERVER_CHUNKS } from "./worldClient";

interface ConvexChunkSnapshot {
  readonly chunk: ChunkCoord;
  readonly version: number;
  readonly cells: readonly {
    readonly coord: DemoCell["coord"];
    readonly material: DemoCell["material"];
    readonly state: number;
    readonly variant: number;
  }[];
}

interface ConvexEventDto {
  readonly id: string;
  readonly tick: number;
  readonly summary: string;
}

export interface ConvexWorldSnapshot {
  readonly cells: readonly DemoCell[];
  readonly events: readonly DemoEvent[];
  readonly chunkVersions: Record<string, number>;
}

export interface ConvexWriteConfig {
  readonly agentId: string;
  readonly token: string;
  readonly worldId: "origin";
}

const visibleChunksQuery = makeFunctionReference<
  "query",
  { worldId: string; chunks: { x: number; y: number }[] },
  readonly ConvexChunkSnapshot[]
>("chunks:visible");
const recentEventsQuery = makeFunctionReference<"query", { worldId: string; limit: number }, readonly ConvexEventDto[]>(
  "events:recent",
);
const actMutation = makeFunctionReference<
  "mutation",
  { envelope: ActionEnvelope; token?: string; production?: boolean },
  ActionResult
>("actions:act");
const clearAllCellsMutation = makeFunctionReference<
  "mutation",
  { worldId: string; agentId: string; token?: string; production?: boolean },
  ActionResult
>("actions:clearAllCells");

export function readConvexWriteConfig(env: Record<string, string | boolean | undefined>): ConvexWriteConfig | undefined {
  const token = typeof env.VITE_AGARTHA_WRITE_TOKEN === "string" ? env.VITE_AGARTHA_WRITE_TOKEN.trim() : "";
  if (!token) return undefined;

  const agentId =
    typeof env.VITE_AGARTHA_AGENT_ID === "string" && env.VITE_AGARTHA_AGENT_ID.trim()
      ? env.VITE_AGARTHA_AGENT_ID.trim()
      : "agent-moss-archivist";

  return {
    agentId,
    token,
    worldId: "origin",
  };
}

export function useConvexWorldSnapshot(chunks: readonly ChunkCoord[] = DEFAULT_SERVER_CHUNKS): ConvexWorldSnapshot | undefined {
  const snapshots = useQuery(visibleChunksQuery, { worldId: "origin", chunks: chunks.map((chunk) => ({ ...chunk })) });
  const events = useQuery(recentEventsQuery, { worldId: "origin", limit: 20 });
  if (!snapshots || !events) return undefined;
  return convexSnapshotToDemoWorld(snapshots, events);
}

export function useConvexAct() {
  return useMutation(actMutation);
}

export function useConvexClearAllCells() {
  return useMutation(clearAllCellsMutation);
}

export function placeMaterialEnvelope(
  config: ConvexWriteConfig,
  target: WorldCoord,
  material: Exclude<MaterialId, 0>,
  variant = 0,
): ActionEnvelope<PlaceMaterialPayload> {
  return {
    actionType: "place_material",
    agentId: config.agentId,
    payload: { material, target, variant },
    worldId: config.worldId,
  };
}

export function paintCellsEnvelope(
  config: ConvexWriteConfig,
  cells: readonly WorldCoord[],
  variant: number,
): ActionEnvelope<PaintCellsPayload> {
  return {
    actionType: "paint_cells",
    agentId: config.agentId,
    payload: { cells, variant },
    worldId: config.worldId,
  };
}

export function convexSnapshotToDemoWorld(
  snapshots: readonly ConvexChunkSnapshot[],
  events: readonly ConvexEventDto[],
): ConvexWorldSnapshot {
  const cells = snapshots
    .flatMap((snapshot) =>
      snapshot.cells.map((cell) => ({
        id: `${absoluteCoord(cell.coord).x}:${absoluteCoord(cell.coord).y}`,
        coord: cell.coord,
        material: cell.material,
        state: cell.state,
        variant: cell.variant,
        flags: 0,
      })),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    cells,
    events: events.map((event) => ({ id: event.id, tick: event.tick, summary: event.summary })),
    chunkVersions: Object.fromEntries(snapshots.map((snapshot) => [`${snapshot.chunk.x}:${snapshot.chunk.y}`, snapshot.version])),
  };
}
