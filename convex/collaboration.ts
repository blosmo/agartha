import { assertLegacyEnabled, legacyProductionPolicy } from './legacyGate';
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { CollaborationEnvelope } from "@agartha/protocol/collaboration";

import { authenticateToken } from "./lib/auth";
import { acceptedCollaborationResponse, contextForArea, staleProjectResponse, validateCollaborationEnvelope } from "./lib/collaboration";

const envelopeArg = v.any();

export const context = query({
  args: { agentId: v.string(), worldId: v.optional(v.string()), token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const now = Date.now();
    const auth = await authenticateRead(ctx, { worldId, agentId: args.agentId, token: args.token, production: legacyProductionPolicy() }, now);
    if (!auth.ok) throw new Error(auth.reason);
    const agent = await agentFor(ctx, worldId, args.agentId);
    if (agent === null) throw new Error("permission_denied");
    return await readContext(ctx, agent.position, worldId, now);
  },
});

export const handle = mutation({
  args: { envelope: envelopeArg, token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const parsed = validateCollaborationEnvelope(args.envelope);
    if (!parsed.ok) return parsed.response;
    const envelope = parsed.envelope;
    const now = Date.now();
    const auth = await authenticateReadOrWrite(ctx, envelope, args.token, legacyProductionPolicy(), now);
    if (!auth.ok) {
      return {
        ok: false,
        operation: envelope.operation,
        worldId: envelope.worldId,
        agentId: envelope.agentId,
        areaId: undefined,
        result: undefined,
        error: { reason: auth.reason, message: auth.reason, retryable: false },
        next: [],
      };
    }

    const agent = await agentFor(ctx, envelope.worldId, envelope.agentId);
    if (agent === null) {
      return rejected(envelope, "permission_denied", "agent not found");
    }
    const area = areaFor(agent.position);

    switch (envelope.operation) {
      case "enter":
      case "heartbeat":
        await touchSession(ctx, envelope, agent, area.id, now, true);
        return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), {}, [
          "collab presence",
          "collab say",
        ]);
      case "leave":
        await touchSession(ctx, envelope, agent, area.id, now, false);
        return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), { left: true }, [
          "collab enter",
        ]);
      case "presence":
      case "messages":
      case "context":
        return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), {}, [
          "collab say",
          "collab project",
        ]);
      case "say":
        return await sendMessage(ctx, envelope, agent, area.id, now);
      case "project":
        return await updateProject(ctx, envelope, agent, area.id, now);
      case "summary":
        return await recordSummary(ctx, envelope, agent, area.id, now);
      default:
        return rejected(envelope, "malformed", "unsupported collaboration operation");
    }
  },
});

async function sendMessage(ctx: any, envelope: CollaborationEnvelope, agent: any, areaId: string, now: number) {
  const body = text(envelope.payload, "body");
  if (!body) return rejected(envelope, "malformed", "body must be non-empty bounded text");
  await touchSession(ctx, envelope, agent, areaId, now, true);
  const message = {
    messageId: `message-${now.toString(36)}`,
    worldId: envelope.worldId,
    areaId,
    authorAgentId: envelope.agentId,
    body,
    createdAt: now,
  };
  await ctx.db.insert("collaborationMessages", message);
  await trimAreaMessages(ctx, envelope.worldId, areaId);
  return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), { message }, [
    "collab summary",
    "act",
  ]);
}

async function updateProject(ctx: any, envelope: CollaborationEnvelope, agent: any, areaId: string, now: number) {
  const body = text(envelope.payload, "body");
  const kind = text(envelope.payload, "kind") ?? "update";
  if (!body) return rejected(envelope, "malformed", "body must be non-empty bounded project text");
  const payload = objectPayload(envelope.payload);
  const projectId = typeof payload.projectId === "string" ? payload.projectId : `project-${now.toString(36)}`;
  const existing = await ctx.db.query("areaProjects").withIndex("by_project_id", (q: any) => q.eq("projectId", projectId)).unique();
  if (existing && typeof payload.expectedVersion === "number" && payload.expectedVersion !== existing.version) {
    return staleProjectResponse(envelope, areaId);
  }
  const entry = {
    id: `project-entry-${now.toString(36)}`,
    kind,
    body,
    provenance: provenance(envelope.agentId, areaId, now, "proposal"),
  };
  if (existing) {
    await ctx.db.patch(existing._id, { version: existing.version + 1, updatedAt: now, entries: [...existing.entries, entry] });
  } else {
    await ctx.db.insert("areaProjects", {
      projectId,
      worldId: envelope.worldId,
      areaId,
      title: typeof payload.title === "string" && payload.title.trim() ? payload.title : "Local collaboration project",
      version: 1,
      entries: [entry],
      updatedAt: now,
    });
  }
  return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), { projectId }, [
    "collab summary",
    "act",
  ]);
}

async function recordSummary(ctx: any, envelope: CollaborationEnvelope, agent: any, areaId: string, now: number) {
  const body = text(envelope.payload, "body");
  const status = text(envelope.payload, "status") ?? "decision";
  if (!body) return rejected(envelope, "malformed", "body must be non-empty bounded summary text");
  const summary = {
    summaryId: `summary-${now.toString(36)}`,
    worldId: envelope.worldId,
    areaId,
    body,
    provenance: provenance(envelope.agentId, areaId, now, status),
    createdAt: now,
  };
  await ctx.db.insert("areaSummaries", summary);
  return acceptedCollaborationResponse(envelope, await readContext(ctx, agent.position, envelope.worldId, now), { summary }, [
    "act",
    "collab leave",
  ]);
}

async function authenticateReadOrWrite(ctx: any, envelope: CollaborationEnvelope, token: string | undefined, production: boolean, now: number) {
  const readOps = new Set(["presence", "messages", "context"]);
  return authenticateRead(ctx, {
    worldId: envelope.worldId,
    agentId: envelope.agentId,
    token,
    production,
    scope: readOps.has(envelope.operation) ? "agent:read" : "agent:write",
  }, now);
}

async function authenticateRead(ctx: any, args: any, now: number) {
  const records = await ctx.db
    .query("serviceTokens")
    .withIndex("by_prefix", (q: any) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
    .collect();
  return authenticateToken(args.token, records, {
    worldId: args.worldId,
    agentId: args.agentId,
    scope: args.scope ?? "agent:read",
    now,
    production: legacyProductionPolicy(),
  });
}

async function agentFor(ctx: any, worldId: string, agentId: string) {
  return await ctx.db.query("agents").withIndex("by_world_agent", (q: any) => q.eq("worldId", worldId).eq("agentId", agentId)).unique();
}

async function readContext(ctx: any, position: any, worldId: string, now: number) {
  const sessions = await ctx.db.query("collaborationSessions").withIndex("by_world_area", (q: any) => q.eq("worldId", worldId)).collect();
  const messages = await ctx.db.query("collaborationMessages").withIndex("by_world_area_time", (q: any) => q.eq("worldId", worldId)).collect();
  const projects = await ctx.db.query("areaProjects").withIndex("by_world_area", (q: any) => q.eq("worldId", worldId)).collect();
  const summaries = await ctx.db.query("areaSummaries").withIndex("by_world_area", (q: any) => q.eq("worldId", worldId)).collect();
  return contextForArea({ position, now, sessions, messages: messages.map(toMessage), projects: projects.map(toProject), summaries: summaries.map(toSummary) });
}

async function touchSession(ctx: any, envelope: CollaborationEnvelope, agent: any, areaId: string, now: number, live: boolean) {
  const existing = await ctx.db
    .query("collaborationSessions")
    .withIndex("by_world_agent", (q: any) => q.eq("worldId", envelope.worldId).eq("agentId", envelope.agentId))
    .unique();
  const patch = { displayName: agent.displayName, areaId, position: agent.position, lastSeenAt: now, live };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("collaborationSessions", { worldId: envelope.worldId, agentId: envelope.agentId, enteredAt: now, ...patch });
  }
}

async function trimAreaMessages(ctx: any, worldId: string, areaId: string) {
  const messages = await ctx.db
    .query("collaborationMessages")
    .withIndex("by_world_area_time", (q: any) => q.eq("worldId", worldId).eq("areaId", areaId))
    .collect();
  const overflow = messages.length - 50;
  if (overflow <= 0) return;
  const oldest = [...messages].sort((a, b) => a.createdAt - b.createdAt).slice(0, overflow);
  await Promise.all(oldest.map((message) => ctx.db.delete(message._id)));
}

function areaFor(position: any) {
  return contextForArea({ position, now: Date.now(), sessions: [], messages: [], projects: [], summaries: [] }).area;
}

function toMessage(message: any) {
  return { id: message.messageId, worldId: message.worldId, areaId: message.areaId, authorAgentId: message.authorAgentId, body: message.body, createdAt: message.createdAt };
}

function toProject(project: any) {
  return { id: project.projectId, worldId: project.worldId, areaId: project.areaId, title: project.title, version: project.version, entries: project.entries, updatedAt: project.updatedAt };
}

function toSummary(summary: any) {
  return { id: summary.summaryId, worldId: summary.worldId, areaId: summary.areaId, body: summary.body, provenance: summary.provenance };
}

function provenance(authorAgentId: string, areaId: string, createdAt: number, status: string) {
  return { authorAgentId, createdAt, areaId, sourceMessageIds: [], sourceEventIds: [], sourceActionIds: [], status };
}

function text(payload: unknown, key: string) {
  const value = objectPayload(payload)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function objectPayload(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function rejected(envelope: CollaborationEnvelope, reason: string, message: string) {
  return {
    ok: false,
    operation: envelope.operation,
    worldId: envelope.worldId,
    agentId: envelope.agentId,
    areaId: undefined,
    result: undefined,
    error: { reason, message, retryable: false },
    next: [],
  };
}
