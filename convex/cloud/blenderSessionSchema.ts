import { defineTable } from "convex/server";
import { v } from "convex/values";

export const blenderSessionTables = {
  blenderSessionQuotes: defineTable({
    quoteId: v.string(), agentId: v.string(), livemode: v.boolean(), requestId: v.string(), projectId: v.optional(v.string()),
    minutes: v.number(), reserveCents: v.number(), pricingVersion: v.string(), expiresAt: v.number(),
    status: v.union(v.literal("open"), v.literal("reserved"), v.literal("expired")), createdAt: v.number(),
  }).index("by_quote", ["quoteId"]).index("by_owner_request", ["agentId", "livemode", "requestId"]),
  blenderSessionReservations: defineTable({
    deferredStart: v.optional(v.boolean()),
    monitorExecutorId: v.optional(v.string()), monitorLeaseExpiresAt: v.optional(v.number()),
    reservationId: v.string(), quoteId: v.string(), agentId: v.string(), livemode: v.boolean(), requestId: v.string(), projectId: v.string(),
    reservedMinutes: v.number(), reservedCents: v.number(), status: v.union(v.literal("reserved"), v.literal("launching"), v.literal("running"), v.literal("unknown"), v.literal("settled"), v.literal("failed")),
    launchGeneration: v.number(), retryCount: v.number(), readyAt: v.optional(v.number()), stoppedAt: v.optional(v.number()),
    chargedCents: v.number(), releasedCents: v.number(), responseBytesHeld: v.number(), responseBytesUsed: v.number(), failureBudgetNanoUsd: v.number(), launchClaimedAt: v.optional(v.number()), startupLeaseExpiresAt: v.optional(v.number()), executorId: v.optional(v.string()), stopLeaseExpiresAt: v.optional(v.number()), stopExecutorId: v.optional(v.string()), lastActivityAt: v.optional(v.number()), stopRequested: v.boolean(), providerWorkerName: v.optional(v.string()), providerWorkerId: v.optional(v.string()), createdAt: v.number(),
  }).index("by_reservation", ["reservationId"]).index("by_owner_request", ["agentId", "livemode", "requestId"]).index("by_owner_status", ["agentId", "livemode", "status"]).index("by_status", ["status", "createdAt"]).index("by_project_status", ["projectId", "status"]),
  blenderSessionOperations: defineTable({
    operationId: v.string(), reservationId: v.string(), action: v.string(), generation: v.number(), requestId: v.string(), payloadFingerprint: v.string(), responseBytes: v.number(), state: v.union(v.literal("claimed"), v.literal("completed"), v.literal("failed")), actualResponseBytes: v.optional(v.number()), resultRef: v.optional(v.string()), error: v.optional(v.string()), claimDeadline: v.number(), createdAt: v.number(),
  }).index("by_operation", ["operationId"]).index("by_reservation", ["reservationId"]).index("by_reservation_action_state", ["reservationId", "action", "state"]).index("by_reservation_request", ["reservationId", "requestId"]),
  blenderSessionFailureAccounts: defineTable({ agentId: v.string(), livemode: v.boolean(), windowStart: v.number(), failedStarts: v.number(), reservedNanoUsd: v.number() }).index("by_owner_mode", ["agentId", "livemode"]),
  blenderSessionFailureBudget: defineTable({ key: v.string(), windowStart: v.number(), reservedNanoUsd: v.number() }).index("by_key", ["key"]),
  blenderSessionFailureEvents: defineTable({ eventId: v.string(), reservationId: v.string(), agentId: v.string(), livemode: v.boolean(), generation: v.number(), costNanoUsd: v.number(), failed: v.boolean(), released: v.boolean(), state: v.union(v.literal("reserved"), v.literal("failed"), v.literal("released")), createdAt: v.number() }).index("by_event", ["eventId"]).index("by_owner_failed_time", ["agentId", "livemode", "failed", "createdAt"]).index("by_state_time", ["state", "createdAt"]),
  blenderSessionCallWindows: defineTable({ reservationId: v.string(), windowStart: v.number(), calls: v.number() }).index("by_reservation", ["reservationId"]),
};
