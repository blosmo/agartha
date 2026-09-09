/** Operator-only test credit; never represents a customer payment or live balance. */
import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { getOrCreateWallet, requireBillingOwner } from './common';

export const fund = internalMutation({
  args: { token: v.string(), referenceBenchmark: v.optional(v.boolean()) },
  handler: async (ctx, { token, referenceBenchmark }) => {
    const actor = await requireBillingOwner(ctx, token);
    const allowed = (process.env.BLENDER_TEST_OPERATOR_AGENT_IDS || '').split(',').map(value => value.trim());
    if (!allowed.includes(actor.agentId)) throw new Error('Verification operator is not configured.');
    const creditedCents = referenceBenchmark ? 1000 : 200;
    const entryId = `${referenceBenchmark ? 'reference-verification' : 'managed-verification'}:${actor.agentId}`;
    const prior = await ctx.db.query('blenderLedger').withIndex('by_entry', q => q.eq('entryId', entryId)).unique();
    if (prior) return { creditedCents, reused: true, livemode: false };
    const wallet = await getOrCreateWallet(ctx, actor.agentId, false);
    if (wallet.frozen) throw new Error('Verification wallet is frozen.');
    await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents + creditedCents });
    await ctx.db.insert('blenderLedger', { entryId, source: 'operator-verification', action: 'test_credit', owner: actor.agentId, livemode: false, deltaCents: creditedCents, createdAt: Date.now() });
    return { creditedCents, reused: false, livemode: false };
  },
});
