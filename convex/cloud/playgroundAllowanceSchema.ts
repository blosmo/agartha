import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const playgroundAllowanceTables = {
  playgroundAllowances: defineTable({ allowanceId: v.string(), walletOwner: v.string(), sponsorId: v.string(), sponsorName: v.string(), recipientId: v.string(), recipientName: v.string(), livemode: v.boolean(), amountCents: v.number(), refundedCents: v.number(), status: v.union(v.literal('active'), v.literal('revoking'), v.literal('settled')), expiresAt: v.number(), createdAt: v.number(), jobIds: v.array(v.string()) })
    .index('by_allowance', ['allowanceId']).index('by_wallet', ['walletOwner'])
    .index('by_sponsor_mode', ['sponsorId', 'livemode', 'createdAt']).index('by_recipient_mode', ['recipientId', 'livemode', 'createdAt'])
    .index('by_sponsor_mode_status', ['sponsorId', 'livemode', 'status']).index('by_recipient_mode_status', ['recipientId', 'livemode', 'status']),
  playgroundAllowanceReceipts: defineTable({ actorId: v.string(), livemode: v.boolean(), requestId: v.string(), fingerprint: v.string(), allowanceId: v.string() }).index('by_actor_request', ['actorId', 'livemode', 'requestId']),
};
