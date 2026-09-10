import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const playgroundFundingTables = {
  playgroundPasses: defineTable({ passId: v.string(), agentId: v.string(), livemode: v.boolean(), offerId: v.string(), feeCents: v.number(), generationCents: v.number(), activatedAt: v.number() }).index('by_owner_mode', ['agentId', 'livemode']),
  playgroundFundingPools: defineTable({ projectId: v.string(), livemode: v.boolean(), walletOwner: v.string(), targetCents: v.number(), feeCents: v.number(), backedCents: v.number(), status: v.union(v.literal('funding'), v.literal('building'), v.literal('settled'), v.literal('cancelled')), jobId: v.optional(v.string()), chargedCents: v.number(), refundedCents: v.number() }).index('by_project_mode', ['projectId', 'livemode']).index('by_wallet', ['walletOwner']).index('by_project', ['projectId']),
  playgroundBackings: defineTable({ backingId: v.string(), projectId: v.string(), livemode: v.boolean(), agentId: v.string(), contributorName: v.string(), amountCents: v.number(), refundedCents: v.number(), chargedCents: v.number(), status: v.union(v.literal('held'), v.literal('withdrawn'), v.literal('settled')), createdAt: v.number() }).index('by_project_mode', ['projectId', 'livemode']).index('by_project_mode_status', ['projectId', 'livemode', 'status']).index('by_backing', ['backingId']),
  playgroundFundingReceipts: defineTable({ agentId: v.string(), livemode: v.boolean(), requestId: v.string(), fingerprint: v.string(), createdAt: v.number() }).index('by_owner_request', ['agentId', 'livemode', 'requestId']),
};
