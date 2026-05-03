import { mutation } from "./_generated/server";
import { v } from "convex/values";

import { tokenDigest, tokenPrefix } from "./lib/auth";

const WORLD_ID = "origin";
const NOW_SEED = 0;
const LOCAL_AGENT_ENERGY_CAP = 5_000;
const DEV_TOKENS = [
  ["agent-moss-archivist", "Moss Archivist", "token-moss"],
  ["agent-firebreak-builder", "Firebreak Builder", "token-firebreak"],
  ["agent-stream-gardener", "Stream Gardener", "token-gardener"],
] as const;

export const seedOrigin = mutation({
  args: {
    allowLocalTokens: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingWorld = await ctx.db
      .query("worlds")
      .withIndex("by_world_id", (q) => q.eq("worldId", WORLD_ID))
      .unique();

    if (existingWorld === null) {
      await ctx.db.insert("worlds", {
        worldId: WORLD_ID,
        name: "Origin",
        publicRead: true,
        authorityMode: "convex",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const [agentId, displayName, rawToken] of DEV_TOKENS) {
      const existingAgent = await ctx.db
        .query("agents")
        .withIndex("by_world_agent", (q) => q.eq("worldId", WORLD_ID).eq("agentId", agentId))
        .unique();
      if (existingAgent === null) {
        await ctx.db.insert("agents", {
          worldId: WORLD_ID,
          agentId,
          displayName,
          position: { chunk: { x: 0, y: 0 }, cell: { x: 64, y: 64 } },
          memorySummary: `${displayName} is ready to shape the origin world.`,
          energy: LOCAL_AGENT_ENERGY_CAP,
          energyCap: LOCAL_AGENT_ENERGY_CAP,
          energyUpdatedAt: now,
          regeneratesEveryMs: 100,
          capabilities: ["move", "place_material", "paint_cells", "register_symbol", "submit_note"],
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(existingAgent._id, {
          energy: LOCAL_AGENT_ENERGY_CAP,
          energyCap: LOCAL_AGENT_ENERGY_CAP,
          energyUpdatedAt: now,
          regeneratesEveryMs: 100,
          updatedAt: now,
        });
      }

      if (args.allowLocalTokens ?? true) {
        const tokenId = `local-${agentId}`;
        const existingToken = await ctx.db
          .query("serviceTokens")
          .withIndex("by_token_id", (q) => q.eq("tokenId", tokenId))
          .unique();
        if (existingToken === null) {
          await ctx.db.insert("serviceTokens", {
            tokenId,
            prefix: tokenPrefix(rawToken),
            digest: await tokenDigest(rawToken),
            worldId: WORLD_ID,
            agentId,
            scopes: ["agent:read", "agent:write", "watch"],
            createdAt: now,
            localSeeded: true,
          });
        }
      }
    }

    const existingChunk = await ctx.db
      .query("chunks")
      .withIndex("by_world_chunk", (q) => q.eq("worldId", WORLD_ID).eq("chunkKey", "0:0"))
      .unique();
    if (existingChunk === null) {
      await ctx.db.insert("chunks", {
        worldId: WORLD_ID,
        chunkKey: "0:0",
        chunk: { x: 0, y: 0 },
        version: 0,
        cells: [],
        updatedAt: now,
      });
    }

    const existingSeedEvent = await ctx.db
      .query("events")
      .withIndex("by_event_id", (q) => q.eq("eventId", "event-seed-origin"))
      .unique();
    if (existingSeedEvent === null) {
      await ctx.db.insert("events", {
        worldId: WORLD_ID,
        eventId: "event-seed-origin",
        kind: "seed",
        summary: "Seeded Convex origin authority",
        public: true,
        affectedChunks: ["0:0"],
        affectedCells: [],
        createdAt: NOW_SEED,
      });
    }

    return { worldId: WORLD_ID, agents: DEV_TOKENS.map(([agentId]) => agentId) };
  },
});
