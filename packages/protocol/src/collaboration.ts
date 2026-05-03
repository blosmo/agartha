import { type AgentId, type EventId, type WorldCoord, type WorldId, toAbsoluteCoord } from "./world";

export const LOCAL_AREA_RADIUS_CELLS = 32 as const;
export const MAX_COLLABORATION_MESSAGE_LENGTH = 1_000 as const;
export const MAX_PROJECT_TEXT_LENGTH = 2_000 as const;
export const MAX_SUMMARY_TEXT_LENGTH = 4_000 as const;

export type CollaborationOperation =
  | "enter"
  | "leave"
  | "heartbeat"
  | "presence"
  | "messages"
  | "say"
  | "project"
  | "summary"
  | "context";

export type DurableCollaborationStatus = "proposal" | "decision" | "review";
export type ProjectEntryKind = "goal" | "update" | "review" | "next_step";

export interface LocalArea {
  readonly id: string;
  readonly center: { readonly x: number; readonly y: number };
  readonly radius: number;
}

export interface CollaborationError {
  readonly reason:
    | "malformed"
    | "unauthenticated"
    | "permission_denied"
    | "stale_project_version"
    | "rate_limited"
    | "not_found";
  readonly message: string;
  readonly retryable?: boolean;
}

export interface CollaborationEnvelope<TPayload = unknown> {
  readonly operation: CollaborationOperation;
  readonly worldId: WorldId;
  readonly agentId: AgentId;
  readonly payload?: TPayload;
}

export interface CollaborationResponseEnvelope<TResult = unknown> {
  readonly ok: boolean;
  readonly operation: CollaborationOperation;
  readonly worldId: WorldId;
  readonly agentId: AgentId;
  readonly areaId?: string;
  readonly result?: TResult;
  readonly error?: CollaborationError;
  readonly next?: readonly string[];
}

export interface CollaborationProvenance {
  readonly authorAgentId: AgentId;
  readonly createdAt: number;
  readonly areaId: string;
  readonly sourceMessageIds?: readonly string[];
  readonly sourceEventIds?: readonly EventId[];
  readonly sourceActionIds?: readonly string[];
  readonly supersedesId?: string;
  readonly status: DurableCollaborationStatus;
}

export interface CollaborationPresence {
  readonly agentId: AgentId;
  readonly displayName?: string;
  readonly areaId: string;
  readonly position: WorldCoord;
  readonly enteredAt: number;
  readonly lastSeenAt: number;
  readonly live: boolean;
}

export interface CollaborationMessage {
  readonly id: string;
  readonly worldId: WorldId;
  readonly areaId: string;
  readonly authorAgentId: AgentId;
  readonly body: string;
  readonly createdAt: number;
}

export interface AreaProjectEntry {
  readonly id: string;
  readonly kind: ProjectEntryKind;
  readonly body: string;
  readonly provenance: CollaborationProvenance;
}

export interface AreaProject {
  readonly id: string;
  readonly worldId: WorldId;
  readonly areaId: string;
  readonly title: string;
  readonly version: number;
  readonly entries: readonly AreaProjectEntry[];
  readonly updatedAt: number;
}

export interface DurableAreaSummary {
  readonly id: string;
  readonly worldId: WorldId;
  readonly areaId: string;
  readonly body: string;
  readonly provenance: CollaborationProvenance;
}

export interface CollaborationContext {
  readonly area: LocalArea;
  readonly presence: readonly CollaborationPresence[];
  readonly recentMessages: readonly CollaborationMessage[];
  readonly projects: readonly AreaProject[];
  readonly durableSummaries: readonly DurableAreaSummary[];
}

export interface EnterCollaborationPayload {
  readonly position: WorldCoord;
  readonly displayName?: string;
}

export interface SendCollaborationMessagePayload {
  readonly body: string;
}

export interface UpdateAreaProjectPayload {
  readonly projectId?: string;
  readonly title?: string;
  readonly kind: ProjectEntryKind;
  readonly body: string;
  readonly expectedVersion?: number;
  readonly sourceMessageIds?: readonly string[];
  readonly sourceEventIds?: readonly EventId[];
}

export interface RecordDurableSummaryPayload {
  readonly body: string;
  readonly status: DurableCollaborationStatus;
  readonly sourceMessageIds?: readonly string[];
  readonly sourceEventIds?: readonly EventId[];
  readonly supersedesId?: string;
}

export function localAreaForPosition(position: WorldCoord, radius = LOCAL_AREA_RADIUS_CELLS): LocalArea {
  const absolute = toAbsoluteCoord(position);
  const center = {
    x: Math.round(absolute.x / radius) * radius,
    y: Math.round(absolute.y / radius) * radius,
  };
  return {
    id: `origin:${center.x}:${center.y}:r${radius}`,
    center,
    radius,
  };
}

export function isWithinLocalArea(position: WorldCoord, area: LocalArea): boolean {
  const absolute = toAbsoluteCoord(position);
  return Math.hypot(absolute.x - area.center.x, absolute.y - area.center.y) <= area.radius;
}

export function collaborationEnvelopeErrors(value: unknown): CollaborationError[] {
  const errors: CollaborationError[] = [];
  if (!isRecord(value)) {
    return [{ reason: "malformed", message: "Collaboration envelope must be an object." }];
  }
  if (!isCollaborationOperation(value.operation)) {
    errors.push({ reason: "malformed", message: "operation is not supported." });
  }
  if (value.worldId !== "origin") {
    errors.push({ reason: "malformed", message: "worldId must be 'origin'." });
  }
  if (typeof value.agentId !== "string" || value.agentId.length === 0) {
    errors.push({ reason: "malformed", message: "agentId is required." });
  }

  switch (value.operation) {
    case "enter":
    case "heartbeat":
      validateEnterPayload(value.payload, errors);
      break;
    case "say":
      validateTextPayload(value.payload, "body", MAX_COLLABORATION_MESSAGE_LENGTH, errors);
      break;
    case "project":
      validateProjectPayload(value.payload, errors);
      break;
    case "summary":
      validateSummaryPayload(value.payload, errors);
      break;
    case "leave":
    case "presence":
    case "messages":
    case "context":
      if (value.payload !== undefined && (!isRecord(value.payload) || Object.keys(value.payload).length > 0)) {
        errors.push({ reason: "malformed", message: `${value.operation} payload must be empty when provided.` });
      }
      break;
  }
  return errors;
}

export function collaborationOk<TResult>(
  operation: CollaborationOperation,
  worldId: WorldId,
  agentId: AgentId,
  result: TResult,
  areaId?: string,
  next: readonly string[] = [],
): CollaborationResponseEnvelope<TResult> {
  return { ok: true, operation, worldId, agentId, areaId, result, next };
}

export function collaborationRejected(
  operation: CollaborationOperation,
  worldId: WorldId,
  agentId: AgentId,
  error: CollaborationError,
  areaId?: string,
): CollaborationResponseEnvelope<never> {
  return { ok: false, operation, worldId, agentId, areaId, error };
}

function validateEnterPayload(value: unknown, errors: CollaborationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "enter payload must include the agent position." });
    return;
  }
  if (!isWorldCoordLike(value.position)) {
    errors.push({ reason: "malformed", message: "position must be a valid world coordinate." });
  }
  if ("displayName" in value && value.displayName !== undefined && typeof value.displayName !== "string") {
    errors.push({ reason: "malformed", message: "displayName must be a string when provided." });
  }
}

function validateProjectPayload(value: unknown, errors: CollaborationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "project payload must be an object." });
    return;
  }
  if ("projectId" in value && value.projectId !== undefined && typeof value.projectId !== "string") {
    errors.push({ reason: "malformed", message: "projectId must be a string when provided." });
  }
  if ("title" in value && value.title !== undefined && !isBoundedText(value.title, MAX_PROJECT_TEXT_LENGTH)) {
    errors.push({ reason: "malformed", message: "title must be non-empty bounded text when provided." });
  }
  if (!isProjectEntryKind(value.kind)) {
    errors.push({ reason: "malformed", message: "kind must be goal, update, review, or next_step." });
  }
  if (!isBoundedText(value.body, MAX_PROJECT_TEXT_LENGTH)) {
    errors.push({ reason: "malformed", message: "body must be non-empty bounded project text." });
  }
  if ("expectedVersion" in value && value.expectedVersion !== undefined && !Number.isInteger(value.expectedVersion)) {
    errors.push({ reason: "stale_project_version", message: "expectedVersion must be an integer.", retryable: true });
  }
}

function validateSummaryPayload(value: unknown, errors: CollaborationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: "summary payload must be an object." });
    return;
  }
  if (!isBoundedText(value.body, MAX_SUMMARY_TEXT_LENGTH)) {
    errors.push({ reason: "malformed", message: "body must be non-empty bounded summary text." });
  }
  if (!isDurableStatus(value.status)) {
    errors.push({ reason: "malformed", message: "status must be proposal, decision, or review." });
  }
}

function validateTextPayload(value: unknown, field: string, maxLength: number, errors: CollaborationError[]) {
  if (!isRecord(value)) {
    errors.push({ reason: "malformed", message: `${field} payload must be an object.` });
    return;
  }
  if (!isBoundedText(value[field], maxLength)) {
    errors.push({ reason: "malformed", message: `${field} must be non-empty bounded text.` });
  }
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isCollaborationOperation(value: unknown): value is CollaborationOperation {
  return (
    value === "enter" ||
    value === "leave" ||
    value === "heartbeat" ||
    value === "presence" ||
    value === "messages" ||
    value === "say" ||
    value === "project" ||
    value === "summary" ||
    value === "context"
  );
}

function isProjectEntryKind(value: unknown): value is ProjectEntryKind {
  return value === "goal" || value === "update" || value === "review" || value === "next_step";
}

function isDurableStatus(value: unknown): value is DurableCollaborationStatus {
  return value === "proposal" || value === "decision" || value === "review";
}

function isWorldCoordLike(value: unknown): value is WorldCoord {
  if (!isRecord(value) || !isRecord(value.chunk) || !isRecord(value.cell)) return false;
  const { x: chunkX, y: chunkY } = value.chunk;
  const { x: cellX, y: cellY } = value.cell;
  return (
    Number.isInteger(chunkX) &&
    Number.isInteger(chunkY) &&
    Number.isInteger(cellX) &&
    Number.isInteger(cellY) &&
    typeof cellX === "number" &&
    typeof cellY === "number" &&
    cellX >= 0 &&
    cellY >= 0 &&
    cellX < 128 &&
    cellY < 128
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
