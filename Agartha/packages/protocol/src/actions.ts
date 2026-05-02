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
  readonly expectedChunkVersions?: Readonly<Record<string, ChunkVersion>>;
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

  if ("expectedChunkVersion" in value && !isOptionalInteger(value.expectedChunkVersion)) {
    errors.push({ reason: "malformed", message: "expectedChunkVersion must be an integer when provided." });
  }

  if ("expectedChunkVersions" in value && !isChunkVersionRecord(value.expectedChunkVersions)) {
    errors.push({
      reason: "malformed",
      message: "expectedChunkVersions must map chunk keys to integer versions when provided.",
    });
  }

  switch (value.actionType) {
    case "observe":
      validateEmptyPayload(value.payload, "observe", errors);
      break;
    case "inspect":
      validateTargetPayload(value.payload, "inspect", errors);
      break;
    case "move":
      validateTargetPayload(value.payload, "move", errors, "to");
      break;
    case "place_material":
      validatePlaceMaterialPayload(value.payload, errors);
      break;
    case "paint_cells":
      validatePaintCellsPayload(value.payload, errors);
      break;
    case "register_symbol":
      validateRegisterSymbolPayload(value.payload, errors);
      break;
    case "history":
      validateHistoryPayload(value.payload, errors);
      break;
    case "submit_note":
      validateSubmitNotePayload(value.payload, errors);
      break;
  }

  return errors;
}

export function affectedChunkKeysForEnvelope(envelope: ActionEnvelope): readonly string[] {
  const payload = envelope.payload;
  switch (envelope.actionType) {
    case "inspect":
      return isRecord(payload) && isWorldCoord(payload.target) ? [chunkKey(payload.target.chunk)] : [];
    case "move":
      return isRecord(payload) && isWorldCoord(payload.to) ? [chunkKey(payload.to.chunk)] : [];
    case "place_material":
      return isRecord(payload) && isWorldCoord(payload.target) ? [chunkKey(payload.target.chunk)] : [];
    case "paint_cells":
      if (!isRecord(payload) || !Array.isArray(payload.cells)) return [];
      return uniqueChunkKeys(payload.cells.filter(isWorldCoord).map((coord) => chunkKey(coord.chunk)));
    case "register_symbol":
    case "history":
      return isRecord(payload) && isWorldCoord(payload.origin) ? [chunkKey(payload.origin.chunk)] : [];
    case "submit_note":
      return isRecord(payload) && isWorldCoord(payload.target) ? [chunkKey(payload.target.chunk)] : [];
    case "observe":
      return [];
  }
}

export function chunkKey(chunk: { readonly x: number; readonly y: number }): string {
  return `${chunk.x}:${chunk.y}`;
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

function validatePaintCellsPayload(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "paint_cells payload must be an object." });
    return;
  }
  if (!Array.isArray(value.cells) || value.cells.length === 0) {
    errors.push({ reason: "malformed", message: "paint_cells requires at least one cell." });
    return;
  }
  for (const cell of value.cells) {
    if (!isWorldCoord(cell)) {
      errors.push({ reason: "invalid_target", message: "paint_cells cells must be valid world coordinates." });
      return;
    }
  }
}

function validateTargetPayload(
  value: unknown,
  actionName: string,
  errors: ValidationError[],
  field: "target" | "to" = "target",
) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: `${actionName} payload must be an object.` });
    return;
  }
  if (!isWorldCoord(value[field])) {
    errors.push({ reason: "invalid_target", message: `${field} must be a valid world coordinate.` });
  }
}

function validateRegisterSymbolPayload(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "register_symbol payload must be an object." });
    return;
  }
  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    errors.push({ reason: "malformed", message: "symbol label is required." });
  }
  validateRect(value.bounds, errors);
}

function validateHistoryPayload(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "history payload must be an object." });
    return;
  }
  validateRect(value, errors);
}

function validateSubmitNotePayload(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "submit_note payload must be an object." });
    return;
  }
  if ("target" in value && value.target !== undefined && !isWorldCoord(value.target)) {
    errors.push({ reason: "invalid_target", message: "target must be a valid world coordinate when provided." });
  }
  if (typeof value.body !== "string" || value.body.trim().length === 0) {
    errors.push({ reason: "malformed", message: "note body is required." });
  }
}

function validateEmptyPayload(value: unknown, actionName: string, errors: ValidationError[]) {
  if (value === undefined || value === null) return;
  if (!isRecord(value) || Object.keys(value).length > 0) {
    errors.push({ reason: "malformed", message: `${actionName} payload must be empty.` });
  }
}

function validateRect(value: unknown, errors: ValidationError[]) {
  if (!isRecord(value) || !isWorldCoord(value.origin)) {
    errors.push({ reason: "invalid_target", message: "bounds origin must be a valid world coordinate." });
    return;
  }
  const width = value.width;
  const height = value.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    errors.push({ reason: "malformed", message: "bounds width and height must be positive integers." });
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

function isOptionalInteger(value: unknown) {
  return value === undefined || Number.isInteger(value);
}

function isChunkVersionRecord(value: unknown) {
  return (
    isRecord(value) &&
    Object.entries(value).every(([key, version]) => /^-?\d+:-?\d+$/.test(key) && Number.isInteger(version))
  );
}

function uniqueChunkKeys(keys: readonly string[]) {
  return Array.from(new Set(keys)).sort();
}

function isCellCoord(value: Record<string, unknown>) {
  return (
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    isValidCellCoord({ x: value.x, y: value.y })
  );
}
