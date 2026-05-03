import {
  affectedChunkKeysForEnvelope,
  validateActionEnvelope,
  type ActionEnvelope,
  type ActionResult,
  type AgentPerception,
  type RejectionReason,
} from "@agartha/protocol/actions";
import type { ChunkSnapshot } from "@agartha/protocol/patches";
import { MATERIAL, type CellSample, type ChunkCoord, type SymbolMetadata, type WorldCoord } from "@agartha/protocol/world";

import { chunkKey } from "./coords";

export interface ConvexChunkDoc {
  readonly worldId: string;
  readonly chunkKey: string;
  readonly chunk: ChunkCoord;
  readonly version: number;
  readonly cells: readonly CellSample[];
}

export interface ConvexAgentDoc {
  readonly worldId: string;
  readonly agentId: string;
  readonly position: WorldCoord;
  readonly memorySummary: string;
  readonly energy: number;
  readonly energyCap: number;
  readonly energyUpdatedAt: number;
  readonly regeneratesEveryMs: number;
}

export interface ConvexEventDoc {
  readonly eventId: string;
  readonly summary: string;
  readonly public: boolean;
}

export function validatePublicEnvelope(value: unknown): { readonly ok: true; readonly envelope: ActionEnvelope } | {
  readonly ok: false;
  readonly reason: RejectionReason;
  readonly message: string;
} {
  const errors = validateActionEnvelope(value);
  if (errors.length > 0) return { ok: false, reason: errors[0].reason, message: errors[0].message };
  return { ok: true, envelope: value as ActionEnvelope };
}

export function toChunkSnapshot(chunk: ConvexChunkDoc): ChunkSnapshot {
  return {
    worldId: "origin",
    chunk: chunk.chunk,
    version: chunk.version,
    cells: chunk.cells.filter((cell) => cell.material !== MATERIAL.Empty),
  };
}

export function toAgentPerception(args: {
  readonly agent: ConvexAgentDoc;
  readonly collaboration?: AgentPerception["collaboration"];
  readonly visibleCells: readonly CellSample[];
  readonly symbols?: readonly SymbolMetadata[];
  readonly events: readonly ConvexEventDoc[];
  readonly now: number;
}): AgentPerception {
  const current = effectiveEnergy(args.agent, args.now);
  return {
    worldId: "origin",
    agentId: args.agent.agentId,
    position: args.agent.position,
    memorySummary: args.agent.memorySummary,
    visibleCells: args.visibleCells,
    nearbySymbols: args.symbols ?? [],
    recentEvents: args.events.filter((event) => event.public).map((event) => event.summary),
    collaboration: args.collaboration,
    availableActions: ["move", "place_material", "paint_cells", "register_symbol", "submit_note", "collab"],
    worldEnergy: {
      current,
      cap: args.agent.energyCap,
      regeneratesEveryTicks: 2,
      nextRegenerationTick: 2,
    },
  };
}

export function actionCost(envelope: ActionEnvelope): number {
  switch (envelope.actionType) {
    case "move":
    case "submit_note":
      return 1;
    case "place_material":
      return typeof envelope.payload === "object" && envelope.payload !== null && "material" in envelope.payload
        ? materialCost(Number(envelope.payload.material))
        : 2;
    case "paint_cells":
      return typeof envelope.payload === "object" &&
        envelope.payload !== null &&
        "cells" in envelope.payload &&
        Array.isArray(envelope.payload.cells)
        ? envelope.payload.cells.length * 2
        : 0;
    case "register_symbol":
      return 3;
    default:
      return 0;
  }
}

export function expectedVersionFor(envelope: ActionEnvelope, key: string): number | undefined {
  return envelope.expectedChunkVersions?.[key] ?? envelope.expectedChunkVersion;
}

export function affectedChunkKeys(envelope: ActionEnvelope): readonly string[] {
  return affectedChunkKeysForEnvelope(envelope);
}

export function acceptedResult(args: {
  readonly eventId: string;
  readonly envelope: ActionEnvelope;
  readonly cost: number;
  readonly energyRemaining: number;
  readonly cells: readonly WorldCoord[];
  readonly summary: string;
}): ActionResult {
  return {
    accepted: true,
    eventId: args.eventId,
    cost: args.cost,
    energyRemaining: args.energyRemaining,
    affectedCells: args.cells,
    affectedChunks: affectedChunkKeys(args.envelope),
    summary: args.summary,
  };
}

export function rejectedResult(reason: RejectionReason, cost = 0, energyRemaining = 0): ActionResult {
  return {
    accepted: false,
    reason,
    cost,
    energyRemaining,
    affectedCells: [],
    affectedChunks: [],
    summary: "action rejected",
  };
}

export function effectiveEnergy(agent: ConvexAgentDoc, now: number): number {
  const elapsed = Math.max(0, now - agent.energyUpdatedAt);
  const regenerated = Math.floor(elapsed / agent.regeneratesEveryMs);
  return Math.min(agent.energyCap, agent.energy + regenerated);
}

export function cellKey(coord: WorldCoord): string {
  return `${chunkKey(coord.chunk)}:${coord.cell.x}:${coord.cell.y}`;
}

function materialCost(material: number): number {
  switch (material) {
    case MATERIAL.Stone:
      return 3;
    case MATERIAL.Water:
    case MATERIAL.Fire:
      return 4;
    case MATERIAL.Plant:
      return 2;
    default:
      return 2;
  }
}
