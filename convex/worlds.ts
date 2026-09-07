import { assertLegacyEnabled } from './legacyGate';
import { query } from "./_generated/server";
import { v } from "convex/values";

export const metadata = query({
  args: { worldId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const world = await ctx.db.query("worlds").withIndex("by_world_id", (q) => q.eq("worldId", worldId)).unique();
    if (world === null || !world.publicRead) return null;
    return {
      worldId: world.worldId,
      name: world.name,
      authorityMode: world.authorityMode,
      publicRead: world.publicRead,
      tick: world.tick ?? 0,
    };
  },
});
