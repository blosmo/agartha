import {
  collaborationEnvelopeErrors,
  collaborationOk,
  collaborationRejected,
  isWithinLocalArea,
  localAreaForPosition,
  type CollaborationContext,
  type CollaborationEnvelope,
  type CollaborationPresence,
} from "@agartha/protocol/collaboration";
import type { WorldCoord } from "@agartha/protocol/world";

export const COLLABORATION_PRESENCE_TTL_MS = 45_000;
export const MAX_RECENT_MESSAGES_PER_AREA = 50;

export function validateCollaborationEnvelope(value: unknown):
  | { readonly ok: true; readonly envelope: CollaborationEnvelope }
  | { readonly ok: false; readonly response: ReturnType<typeof collaborationRejected> } {
  const errors = collaborationEnvelopeErrors(value);
  const envelope = value as Partial<CollaborationEnvelope>;
  if (errors.length === 0) return { ok: true, envelope: value as CollaborationEnvelope };
  return {
    ok: false,
    response: collaborationRejected(
      typeof envelope.operation === "string" ? envelope.operation : "context",
      envelope.worldId === "origin" ? envelope.worldId : "origin",
      typeof envelope.agentId === "string" ? envelope.agentId : "",
      errors[0],
    ),
  };
}

export function presentAgentsForArea(
  sessions: readonly Array<{
    readonly agentId: string;
    readonly displayName?: string;
    readonly areaId: string;
    readonly position: WorldCoord;
    readonly enteredAt: number;
    readonly lastSeenAt: number;
    readonly live: boolean;
  }>,
  area: ReturnType<typeof localAreaForPosition>,
  now: number,
): CollaborationPresence[] {
  return sessions
    .filter((session) => session.live)
    .filter((session) => now - session.lastSeenAt <= COLLABORATION_PRESENCE_TTL_MS)
    .filter((session) => session.areaId === area.id || isWithinLocalArea(session.position, area))
    .map((session) => ({ ...session, areaId: area.id }));
}

export function contextForArea(args: {
  readonly position: WorldCoord;
  readonly now: number;
  readonly sessions: readonly Parameters<typeof presentAgentsForArea>[0][number][];
  readonly messages: readonly any[];
  readonly projects: readonly any[];
  readonly summaries: readonly any[];
}): CollaborationContext {
  const area = localAreaForPosition(args.position);
  return {
    area,
    presence: presentAgentsForArea(args.sessions, area, args.now),
    recentMessages: args.messages.filter((message) => message.areaId === area.id).slice(-20),
    projects: args.projects.filter((project) => project.areaId === area.id),
    durableSummaries: args.summaries.filter((summary) => summary.areaId === area.id),
  };
}

export function acceptedCollaborationResponse(
  envelope: CollaborationEnvelope,
  context: CollaborationContext,
  result: Record<string, unknown>,
  next: readonly string[],
) {
  return collaborationOk(envelope.operation, envelope.worldId, envelope.agentId, { ...result, context }, context.area.id, next);
}

export function staleProjectResponse(envelope: CollaborationEnvelope, areaId: string) {
  return collaborationRejected(
    envelope.operation,
    envelope.worldId,
    envelope.agentId,
    {
      reason: "stale_project_version",
      message: "project version is stale; refresh context before updating",
      retryable: true,
    },
    areaId,
  );
}
