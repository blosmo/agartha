import {
  type AgentId,
  type CellSample,
  type ChunkVersion,
  MATERIAL,
  type MaterialId,
  type Rect,
  type SymbolMetadata,
  type WorldCoord,
  type WorldId,
  isValidCellCoord,
} from "./world";

export type ActionType =
  | "observe"
  | "inspect"
  | "move"
  | "place_material"
  | "paint_cells"
  | "register_symbol"
  | "history"
  | "submit_note";

export interface ActionEnvelope<TPayload = unknown> {
  readonly worldId: WorldId;
  readonly agentId: AgentId;
  readonly actionType: ActionType;
  readonly expectedChunkVersion?: ChunkVersion;
  readonly quoteId?: string;
  readonly payload: TPayload;
}

export interface PlaceMaterialPayload {
  readonly target: WorldCoord;
  readonly material: Exclude<MaterialId, typeof MATERIAL.Empty>;
  readonly variant?: number;
}

export interface PaintCellsPayload {
  readonly cells: readonly WorldCoord[];
  readonly variant?: number;
}

export interface MovePayload {
  readonly to: WorldCoord;
}

export interface RegisterSymbolPayload {
  readonly label: string;
  readonly bounds: Rect;
  readonly note?: string;
}

export interface SubmitNotePayload {
  readonly target?: WorldCoord;
  readonly body: string;
}

export type RejectionReason =
  | "malformed"
  | "unauthenticated"
  | "permission_denied"
  | "insufficient_energy"
  | "stale_chunk_version"
  | "invalid_target"
  | "illegal_material_overwrite"
  | "out_of_range"
  | "persistence_failed";

export interface ActionResult {
  readonly accepted: boolean;
  readonly eventId?: string;
  readonly reason?: RejectionReason;
  readonly cost: number;
  readonly energyRemaining: number;
  readonly affectedCells: readonly WorldCoord[];
  readonly affectedChunks: readonly string[];
  readonly summary: string;
}

export interface AgentPerception {
  readonly worldId: WorldId;
  readonly agentId: AgentId;
  readonly position: WorldCoord;
  readonly memorySummary: string;
  readonly visibleCells: readonly CellSample[];
  readonly nearbySymbols: readonly SymbolMetadata[];
  readonly recentEvents: readonly string[];
  readonly availableActions: readonly ActionType[];
  readonly worldEnergy: {
    readonly current: number;
    readonly cap: number;
    readonly regeneratesEveryTicks: number;
    readonly nextRegenerationTick: number;
  };
}

export interface ValidationError {
  readonly reason: RejectionReason;
  readonly message: string;
}

export function validateActionEnvelope(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isRecord(value)) {
    return [{ reason: "malformed", message: "Action payload must be an object." }];
  }

  if (value.worldId !== "origin") {
    errors.push({ reason: "malformed", message: "worldId must be 'origin'." });
  }

  if (typeof value.agentId !== "string" || value.agentId.length === 0) {
    errors.push({ reason: "malformed", message: "agentId is required." });
  }

  if (!isActionType(value.actionType)) {
    errors.push({ reason: "malformed", message: "actionType is not supported." });
  }

  if (!("payload" in value)) {
    errors.push({ reason: "malformed", message: "payload is required." });
  }

  if (value.actionType === "place_material") {
    validatePlaceMaterialPayload(value.payload, errors);
  }

  return errors;
}

function validatePlaceMaterialPayload(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "place_material payload must be an object." });
    return;
  }

  if (!isWorldCoord(value.target)) {
    errors.push({ reason: "invalid_target", message: "target must be a valid world coordinate." });
  }

  if (!isMaterial(value.material) || value.material === MATERIAL.Empty) {
    errors.push({ reason: "malformed", message: "material must be a non-empty built-in material." });
  }
}

export function isWorldCoord(value: unknown): value is WorldCoord {
  return (
    isRecord(value) &&
    isRecord(value.chunk) &&
    Number.isInteger(value.chunk.x) &&
    Number.isInteger(value.chunk.y) &&
    isRecord(value.cell) &&
    isCellCoord(value.cell)
  );
}

export function isMaterial(value: unknown): value is MaterialId {
  return (
    value === MATERIAL.Empty ||
    value === MATERIAL.Paint ||
    value === MATERIAL.Stone ||
    value === MATERIAL.Water ||
    value === MATERIAL.Fire ||
    value === MATERIAL.Plant
  );
}

function isActionType(value: unknown): value is ActionType {
  return (
    value === "observe" ||
    value === "inspect" ||
    value === "move" ||
    value === "place_material" ||
    value === "paint_cells" ||
    value === "register_symbol" ||
    value === "history" ||
    value === "submit_note"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCellCoord(value: Record<string, unknown>) {
  return (
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    isValidCellCoord({ x: value.x, y: value.y })
  );
}
