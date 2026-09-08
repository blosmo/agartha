import { defineTable } from "convex/server";
import { v } from "convex/values";

export const blenderProjectTables = {
  blenderProjects: defineTable({
    projectId: v.string(),
    agentId: v.string(),
    livemode: v.boolean(),
    title: v.string(),
    requestId: v.string(),
    storedBytes: v.number(),
    currentVersionId: v.optional(v.string()),
    currentVersionNumber: v.number(),
    nextVersionNumber: v.number(),
    lastPaidSessionAt: v.number(),
    expiresAt: v.number(),
    purgedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_owner_mode", ["agentId", "livemode"])
    .index("by_owner_request", ["agentId", "livemode", "requestId"])
    .index("by_expires", ["expiresAt"])
    .index("by_unpurged_expires", ["purgedAt", "expiresAt"]),
  blenderProjectVersions: defineTable({
    versionId: v.string(),
    projectId: v.string(),
    agentId: v.string(),
    livemode: v.boolean(),
    versionNumber: v.number(),
    bytes: v.number(),
    blobRef: v.string(),
    sha256: v.string(),
    committedAt: v.number(),
    deletionRequestedAt: v.optional(v.number()),
    deletionToken: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_version", ["versionId"])
    .index("by_project_version", ["projectId", "versionNumber"])
    .index("by_project_deleted_version", ["projectId", "deletedAt", "versionNumber"])
    .index("by_owner_mode_deleted", ["agentId", "livemode", "deletedAt"]),
  blenderArtifactReservations: defineTable({
    operationId: v.string(),
    projectId: v.string(),
    agentId: v.string(),
    livemode: v.boolean(),
    sessionId: v.string(),
    sessionGeneration: v.number(),
    versionId: v.string(),
    versionNumber: v.number(),
    maxBytes: v.number(),
    status: v.union(v.literal("held"), v.literal("committed"), v.literal("released")),
    actualBytes: v.optional(v.number()),
    releasedBytes: v.optional(v.number()),
    blobRef: v.optional(v.string()),
    sha256: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_operation", ["operationId"])
    .index("by_project", ["projectId"])
    .index("by_owner_mode_status", ["agentId", "livemode", "status"]),
};
