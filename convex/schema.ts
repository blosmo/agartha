import { governanceTables } from './governance/schema';
import { cloudTables } from './cloud/schema';
import { sceneTables } from "./scene/schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const chunkCoord = v.object({ x: v.number(), y: v.number() });
const cellCoord = v.object({ x: v.number(), y: v.number() });
const worldCoord = v.object({ chunk: chunkCoord, cell: cellCoord });
const cellSample = v.object({
  coord: worldCoord,
  material: v.number(),
  state: v.number(),
  variant: v.number(),
  flags: v.number(),
});
const objectSample = v.object({
  dx: v.number(),
  dy: v.number(),
  material: v.number(),
  state: v.number(),
  variant: v.number(),
  flags: v.number(),
});

export default defineSchema({
  ...sceneTables,
  ...cloudTables,
  ...governanceTables,
  worlds: defineTable({
    worldId: v.string(),
    name: v.string(),
    publicRead: v.boolean(),
    authorityMode: v.literal("convex"),
    tick: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_world_id", ["worldId"]),

  chunks: defineTable({
    worldId: v.string(),
    chunkKey: v.string(),
    chunk: chunkCoord,
    version: v.number(),
    cells: v.array(cellSample),
    updatedAt: v.number(),
  }).index("by_world_chunk", ["worldId", "chunkKey"]),

  agents: defineTable({
    worldId: v.string(),
    agentId: v.string(),
    displayName: v.string(),
    position: worldCoord,
    memorySummary: v.string(),
    energy: v.number(),
    energyCap: v.number(),
    energyUpdatedAt: v.number(),
    regeneratesEveryMs: v.number(),
    capabilities: v.array(v.string()),
    privateNotes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_agent_id", ["agentId"])
    .index("by_world_agent", ["worldId", "agentId"]),

  events: defineTable({
    worldId: v.string(),
    eventId: v.string(),
    agentId: v.optional(v.string()),
    kind: v.string(),
    summary: v.string(),
    public: v.boolean(),
    affectedChunks: v.array(v.string()),
    affectedCells: v.array(worldCoord),
    createdAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_world_time", ["worldId", "createdAt"]),

  symbols: defineTable({
    worldId: v.string(),
    symbolId: v.string(),
    label: v.string(),
    authorAgentId: v.string(),
    origin: worldCoord,
    width: v.number(),
    height: v.number(),
    note: v.optional(v.string()),
    createdEventId: v.string(),
    public: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_symbol_id", ["symbolId"])
    .index("by_world", ["worldId"]),

  notes: defineTable({
    worldId: v.string(),
    noteId: v.string(),
    authorAgentId: v.string(),
    target: v.optional(worldCoord),
    body: v.string(),
    public: v.boolean(),
    createdEventId: v.string(),
    createdAt: v.number(),
  })
    .index("by_note_id", ["noteId"])
    .index("by_world", ["worldId"]),

  collaborationSessions: defineTable({
    worldId: v.string(),
    agentId: v.string(),
    displayName: v.optional(v.string()),
    areaId: v.string(),
    position: worldCoord,
    enteredAt: v.number(),
    lastSeenAt: v.number(),
    live: v.boolean(),
  })
    .index("by_world_agent", ["worldId", "agentId"])
    .index("by_world_area", ["worldId", "areaId"]),

  collaborationMessages: defineTable({
    messageId: v.string(),
    worldId: v.string(),
    areaId: v.string(),
    authorAgentId: v.string(),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_message_id", ["messageId"])
    .index("by_world_area_time", ["worldId", "areaId", "createdAt"]),

  areaProjects: defineTable({
    projectId: v.string(),
    worldId: v.string(),
    areaId: v.string(),
    title: v.string(),
    version: v.number(),
    entries: v.array(v.any()),
    updatedAt: v.number(),
  })
    .index("by_project_id", ["projectId"])
    .index("by_world_area", ["worldId", "areaId"]),

  areaSummaries: defineTable({
    summaryId: v.string(),
    worldId: v.string(),
    areaId: v.string(),
    body: v.string(),
    provenance: v.any(),
    createdAt: v.number(),
  })
    .index("by_summary_id", ["summaryId"])
    .index("by_world_area", ["worldId", "areaId"]),

  objectTemplates: defineTable({
    worldId: v.string(),
    objectId: v.string(),
    label: v.string(),
    width: v.number(),
    height: v.number(),
    samples: v.array(objectSample),
    authorAgentId: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_object_id", ["worldId", "objectId"])
    .index("by_world_updated", ["worldId", "updatedAt"]),

  serviceTokens: defineTable({
    tokenId: v.string(),
    prefix: v.string(),
    digest: v.string(),
    worldId: v.string(),
    agentId: v.optional(v.string()),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    localSeeded: v.boolean(),
  })
    .index("by_token_id", ["tokenId"])
    .index("by_prefix", ["prefix"]),

  tokenRotations: defineTable({
    oldTokenId: v.string(),
    newTokenId: v.string(),
    createdAt: v.number(),
  }).index("by_old_token", ["oldTokenId"]),

  adminAudit: defineTable({
    worldId: v.string(),
    actorTokenId: v.optional(v.string()),
    action: v.string(),
    agentId: v.optional(v.string()),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_world_time", ["worldId", "createdAt"])
    .index("by_actor", ["actorTokenId"]),
});
