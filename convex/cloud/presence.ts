import { internalMutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { PRESENCE_TTL_MS, validatePresence } from '../../packages/protocol/src/agentPresence';
import { limit, session } from './common';
import { fail } from '../scene/model';

export const feed = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query('agentRoomPresence').withIndex('by_expiry', q => q.gt('expiresAt', now)).order('desc').take(501);
    return { agents: rows.slice(0, 500).map(({ _id, _creationTime, ...agent }) => agent), truncated: rows.length > 500 };
  },
});
export const update = internalMutation({
  args: { token: v.string(), plotId: v.optional(v.string()), position: v.optional(v.array(v.number())), yaw: v.optional(v.number()), leave: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await session(ctx, args.token);
    if (!actor) fail('unauthorized', 'Register before entering a room.');
    let payload;
    try { payload = validatePresence(args); } catch (error) { fail('invalid', (error as Error).message); }
    await limit(ctx, `presence:${actor.agentId}`, 120, 60_000);
    const previous = await ctx.db.query('agentRoomPresence').withIndex('by_agent', q => q.eq('agentId', actor.agentId)).unique();
    if (payload.leave) {
      if (previous) await ctx.db.delete(previous._id);
      return { agent: null };
    }
    const agent = { agentId: actor.agentId, name: actor.name, plotId: payload.plotId, position: payload.position, yaw: payload.yaw, expiresAt: Math.min(Date.now() + PRESENCE_TTL_MS, actor.expiresAt) };
    if (previous) await ctx.db.replace(previous._id, agent);
    else await ctx.db.insert('agentRoomPresence', agent);
    return { agent };
  },
});
