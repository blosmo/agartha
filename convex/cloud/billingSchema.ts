import { defineTable } from "convex/server";
import { v } from "convex/values";

export const blenderBillingTables = {
  blenderWallets: defineTable({
    agentId: v.string(),
    livemode: v.boolean(),
    availableCents: v.number(),
    heldCents: v.number(),
    frozen: v.boolean(),
    openDisputes: v.number(),
  }).index("by_agent_mode", ["agentId", "livemode"]),
  blenderPurchases: defineTable({
    purchaseId: v.string(),
    agentId: v.string(),
    amountCents: v.number(),
    currency: v.literal("usd"),
    livemode: v.boolean(),
    paymentRail: v.union(v.literal("checkout"), v.literal("mpp")),
    idempotencyKey: v.string(),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("reversed")),
    paymentId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    checkoutSessionId: v.optional(v.string()),
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_owner_idempotency", ["agentId", "idempotencyKey"]),
  blenderPayments: defineTable({
    paymentId: v.string(),
    purchaseId: v.string(),
    amountCents: v.number(),
    creditedCents: v.number(),
    reversedCents: v.number(),
    reconcileGeneration: v.number(),
    openDispute: v.boolean(),
    wasPaid: v.boolean(),
    livemode: v.boolean(),
  })
    .index("by_payment", ["paymentId"])
    .index("by_purchase", ["purchaseId"]),
  blenderLedger: defineTable({
    entryId: v.string(),
    source: v.string(),
    action: v.string(),
    deltaCents: v.number(),
    owner: v.string(),
    livemode: v.boolean(),
    createdAt: v.number(),
  }).index("by_entry", ["entryId"]).index("by_owner_time", ["owner", "createdAt"]),
  blenderPaymentEvents: defineTable({
    paymentId: v.string(),
    eventId: v.string(),
    generation: v.number(),
    committedFingerprint: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_payment_event", ["paymentId", "eventId"]).index("by_payment_generation", ["paymentId", "generation"]),
};
