import { defineTable } from "convex/server";
import { v } from "convex/values";
export const componentSharing = v.object({license:v.union(v.literal("CC0-1.0"),v.literal("CC-BY-4.0"),v.literal("MIT")),attribution:v.string()});
const meshyAllowance = v.object({ budgetCents: v.number(), maxAssets: v.number(), allowRigging: v.boolean() });
const meshyRate = v.object({ usdCents: v.number(), credits: v.number() });
const meshyResult = v.object({ status: v.union(v.literal("succeeded"), v.literal("failed")), modelUrl: v.optional(v.string()), walkingUrl: v.optional(v.string()), thumbnailUrl: v.optional(v.string()) });
export const managedStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"));
export const managedJobTables = {
  managedJobs: defineTable({
    downloadBytes: v.optional(v.number()), downloadWindowStart: v.optional(v.number()), downloadRequests: v.optional(v.number()),
    jobId: v.string(), requestId: v.string(), agentId: v.string(), livemode: v.boolean(), brief: v.string(), workflowVersion: v.optional(v.literal(3)), shareMaterials: v.optional(v.boolean()), shareComponents: v.optional(componentSharing), referenceMode: v.optional(v.union(v.literal("generate"), v.literal("none"))), referenceReady: v.optional(v.boolean()), chargedReferenceCents: v.optional(v.number()), meshyAllowance: v.optional(meshyAllowance), meshyRate: v.optional(meshyRate), meshyAdmissionEnabled: v.optional(v.boolean()), chargedMeshyCents: v.optional(v.number()), budgetCents: v.number(), reservationId: v.string(),
    status: managedStatus, cancelled: v.boolean(), progress: v.string(), executorId: v.optional(v.string()),
    reservedAiCents: v.number(), chargedAiCents: v.number(), pendingAiCents: v.number(), releasedAiCents: v.number(), visuallyInspected: v.boolean(), artifactsReady: v.optional(v.boolean()), videoReady: v.optional(v.boolean()),
    createdAt: v.number(), updatedAt: v.number(), deadlineAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_job", ["jobId"]).index("by_owner_request", ["agentId", "livemode", "requestId"]).index("by_status", ["status", "createdAt"]),
  managedInferenceOperations: defineTable({
    jobId: v.string(), operationId: v.string(), executorId: v.string(), payloadFingerprint: v.string(), maxCostCents: v.number(), kind: v.optional(v.union(v.literal("modeling"), v.literal("reference"), v.literal("strategy"), v.literal("review"), v.literal("asset-reference"), v.literal("meshy"))), meshStage: v.optional(v.union(v.literal("image-to-3d"), v.literal("rigging"))), meshParentOperationId: v.optional(v.string()), meshTaskId: v.optional(v.string()), meshResult: v.optional(meshyResult), needsMeshyPoll: v.optional(v.boolean()), meshLastPollAt: v.optional(v.number()), chargeCents: v.optional(v.number()),
    state: v.union(v.literal("claimed"), v.literal("completed"), v.literal("unresolved")), createdAt: v.number(), completedAt: v.optional(v.number()),
  }).index("by_operation", ["operationId"]).index("by_job_state", ["jobId", "state"]).index("by_meshy_poll", ["needsMeshyPoll", "meshLastPollAt"]),
};
