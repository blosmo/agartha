import { assertLegacyEnabled } from './legacyGate';
import { mutation } from "./_generated/server";
import { v } from "convex/values";

import { authenticateToken } from "./lib/auth";

export const refillEnergy = mutation({
  args: {
    token: v.optional(v.string()),
    agentId: v.string(),
    amount: v.optional(v.number()),
    production: v.optional(v.boolean()),
    adminEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    if (!args.adminEnabled) throw new Error("admin refill disabled");
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: "origin",
      scope: "admin:energy",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) throw new Error(auth.reason);

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_world_agent", (q) => q.eq("worldId", "origin").eq("agentId", args.agentId))
      .unique();
    if (agent === null) throw new Error("agent not found");

    const nextEnergy = Math.min(agent.energyCap, args.amount === undefined ? agent.energyCap : agent.energy + args.amount);
    await ctx.db.patch(agent._id, { energy: nextEnergy, energyUpdatedAt: now, updatedAt: now });
    await ctx.db.insert("adminAudit", {
      worldId: "origin",
      actorTokenId: auth.token.tokenId,
      action: "admin.energy.refill",
      agentId: args.agentId,
      summary: `Refilled ${args.agentId} energy`,
      createdAt: now,
    });
    return {
      agentId: args.agentId,
      worldEnergy: { current: nextEnergy, cap: agent.energyCap, regeneratesEveryTicks: 2, nextRegenerationTick: 2 },
    };
  },
});
