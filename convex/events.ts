import { assertLegacyEnabled } from './legacyGate';
import { query } from "./_generated/server";
import { v } from "convex/values";

export const recent = query({
  args: { worldId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const events = await ctx.db
      .query("events")
      .withIndex("by_world_time", (q) => q.eq("worldId", worldId))
      .order("desc")
      .take(limit);
    return events
      .filter((event) => event.public)
      .map((event) => ({
        id: event.eventId,
        tick: event.createdAt,
        summary: event.summary,
        affectedChunks: event.affectedChunks,
      }));
  },
});
