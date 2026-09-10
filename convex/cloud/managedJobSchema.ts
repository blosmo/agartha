import { defineTable } from "convex/server";
import { v } from "convex/values";
export const componentSharing = v.object({license:v.union(v.literal("CC0-1.0"),v.literal("CC-BY-4.0"),v.literal("MIT")),attribution:v.string()});
export const managedStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"));
export const managedJobTables = {
  managedJobs: defineTable({
    jobId: v.string(), requestId: v.string(), agentId: v.string(), livemode: v.boolean(), brief: v.string(), shareMaterials: v.optional(v.boolean()), shareComponents: v.optional(componentSharing), referenceMode: v.optional(v.union(v.literal("generate"), v.literal("none"))), referenceReady: v.optional(v.boolean()), chargedReferenceCents: v.optional(v.number()), budgetCents: v.number(), reservationId: v.string(),
    status: managedStatus, cancelled: v.boolean(), progress: v.string(), executorId: v.optional(v.string()),
    reservedAiCents: v.number(), chargedAiCents: v.number(), pendingAiCents: v.number(), releasedAiCents: v.number(), visuallyInspected: v.boolean(), artifactsReady: v.optional(v.boolean()), videoReady: v.optional(v.boolean()),
    createdAt: v.number(), updatedAt: v.number(), deadlineAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_job", ["jobId"]).index("by_owner_request", ["agentId", "livemode", "requestId"]).index("by_status", ["status", "createdAt"]),
  managedInferenceOperations: defineTable({
    jobId: v.string(), operationId: v.string(), executorId: v.string(), payloadFingerprint: v.string(), maxCostCents: v.number(), kind: v.optional(v.union(v.literal("modeling"), v.literal("reference"))), chargeCents: v.optional(v.number()),
    state: v.union(v.literal("claimed"), v.literal("completed"), v.literal("unresolved")), createdAt: v.number(), completedAt: v.optional(v.number()),
  }).index("by_operation", ["operationId"]).index("by_job_state", ["jobId", "state"]),
};
