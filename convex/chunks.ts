import { assertLegacyEnabled } from './legacyGate';
import { query } from "./_generated/server";
import { v } from "convex/values";

import { chunkKey } from "./lib/coords";
import { toChunkSnapshot } from "./lib/protocol";

export const snapshot = query({
  args: { worldId: v.optional(v.string()), chunk: v.object({ x: v.number(), y: v.number() }) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const key = chunkKey(args.chunk);
    const chunk = await ctx.db
      .query("chunks")
      .withIndex("by_world_chunk", (q) => q.eq("worldId", worldId).eq("chunkKey", key))
      .unique();
    if (chunk === null) return { worldId, chunk: args.chunk, version: 0, cells: [] };
    return toChunkSnapshot(chunk);
  },
});

export const visible = query({
  args: { worldId: v.optional(v.string()), chunks: v.array(v.object({ x: v.number(), y: v.number() })) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const snapshots = [];
    for (const chunkCoord of args.chunks) {
      const key = chunkKey(chunkCoord);
      const chunk = await ctx.db
        .query("chunks")
        .withIndex("by_world_chunk", (q) => q.eq("worldId", worldId).eq("chunkKey", key))
        .unique();
      snapshots.push(chunk === null ? { worldId, chunk: chunkCoord, version: 0, cells: [] } : toChunkSnapshot(chunk));
    }
    return snapshots;
  },
});
