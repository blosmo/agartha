import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MATERIAL, type CellSample, type WorldCoord } from "@agartha/protocol/world";

import { authenticateToken } from "./lib/auth";
import { chunkKey, eventId } from "./lib/coords";
import {
  acceptedResult,
  actionCost,
  affectedChunkKeys,
  effectiveEnergy,
  expectedVersionFor,
  rejectedResult,
  toAgentPerception,
  validatePublicEnvelope,
} from "./lib/protocol";
import { assertInRange, assertValidWorldCoord, mergeSparseCells } from "./lib/validation";

const actionEnvelopeArg = v.any();
const browserCellArg = v.object({
  coord: v.object({
    chunk: v.object({ x: v.number(), y: v.number() }),
    cell: v.object({ x: v.number(), y: v.number() }),
  }),
  material: v.number(),
  state: v.number(),
  variant: v.number(),
  flags: v.number(),
});

export const observe = query({
  args: { agentId: v.string(), worldId: v.optional(v.string()), token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const worldId = args.worldId ?? "origin";
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId,
      agentId: args.agentId,
      scope: "agent:read",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) throw new Error(auth.reason);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_world_agent", (q) => q.eq("worldId", worldId).eq("agentId", args.agentId))
      .unique();
    if (agent === null) throw new Error("agent not found");
    const chunks = await ctx.db.query("chunks").withIndex("by_world_chunk", (q) => q.eq("worldId", worldId)).take(9);
    const events = await ctx.db.query("events").withIndex("by_world_time", (q) => q.eq("worldId", worldId)).order("desc").take(20);
    return toAgentPerception({
      agent,
      visibleCells: chunks.flatMap((chunk) => chunk.cells),
      events,
      now,
    });
  },
});

export const quote = mutation({
  args: { envelope: actionEnvelopeArg, token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const parsed = validatePublicEnvelope(args.envelope);
    if (!parsed.ok) return { quoteId: "quote-rejected", cost: 0, reason: parsed.reason, expectedChunkVersions: {} };
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: parsed.envelope.worldId,
      agentId: parsed.envelope.agentId,
      scope: "agent:write",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) return { quoteId: "quote-rejected", cost: 0, reason: auth.reason, expectedChunkVersions: {} };

    const expectedChunkVersions: Record<string, number> = {};
    for (const key of affectedChunkKeys(parsed.envelope)) {
      const [x, y] = key.split(":").map(Number);
      const chunk = await ctx.db
        .query("chunks")
        .withIndex("by_world_chunk", (q) => q.eq("worldId", parsed.envelope.worldId).eq("chunkKey", key))
        .unique();
      expectedChunkVersions[key] = chunk?.version ?? 0;
      if (chunk === null) void { x, y };
    }
    return {
      quoteId: `quote-${now.toString(36)}`,
      cost: actionCost(parsed.envelope),
      expectedChunkVersion: Object.values(expectedChunkVersions)[0],
      expectedChunkVersions,
    };
  },
});

export const act = mutation({
  args: { envelope: actionEnvelopeArg, token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const parsed = validatePublicEnvelope(args.envelope);
    if (!parsed.ok) return rejectedResult(parsed.reason);
    const envelope = parsed.envelope;
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: envelope.worldId,
      agentId: envelope.agentId,
      scope: "agent:write",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) return rejectedResult(auth.reason);

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_world_agent", (q) => q.eq("worldId", envelope.worldId).eq("agentId", envelope.agentId))
      .unique();
    if (agent === null) return rejectedResult("permission_denied");

    const cost = actionCost(envelope);
    const energy = effectiveEnergy(agent, now);
    if (energy < cost) return rejectedResult("insufficient_energy", cost, energy);

    const stale = await hasStaleChunkVersion(ctx, envelope);
    if (stale) return rejectedResult("stale_chunk_version", cost, energy);

    try {
      switch (envelope.actionType) {
        case "move":
          return await moveAgent(ctx, envelope, agent, cost, energy, now);
        case "place_material":
          return await placeMaterial(ctx, envelope, agent, cost, energy, now);
        case "paint_cells":
          return await paintCells(ctx, envelope, agent, cost, energy, now);
        default:
          return rejectedResult("malformed", cost, energy);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "persistence_failed";
      if (reason === "out_of_range" || reason === "illegal_material_overwrite" || reason === "invalid_target") {
        return rejectedResult(reason, cost, energy);
      }
      return rejectedResult("persistence_failed", cost, energy);
    }
  },
});

export const clearAllCells = mutation({
  args: { worldId: v.string(), agentId: v.string(), token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: args.worldId,
      agentId: args.agentId,
      scope: "agent:write",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) return rejectedResult(auth.reason);

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_world_agent", (q) => q.eq("worldId", args.worldId).eq("agentId", args.agentId))
      .unique();
    if (agent === null) return rejectedResult("permission_denied");

    const chunks = await ctx.db.query("chunks").withIndex("by_world_chunk", (q) => q.eq("worldId", args.worldId)).collect();
    const affectedChunks: string[] = [];
    for (const chunk of chunks) {
      if (chunk.cells.length === 0) continue;
      affectedChunks.push(chunk.chunkKey);
      await ctx.db.patch(chunk._id, { cells: [], version: chunk.version + 1, updatedAt: now });
    }

    await ctx.db.patch(agent._id, { energyUpdatedAt: now, updatedAt: now });
    const id = eventId(now, "clear");
    await insertPublicEvent(
      ctx,
      args.worldId,
      id,
      args.agentId,
      "clear_all_cells",
      `${args.agentId} cleared all canvas cells`,
      affectedChunks,
      [],
    );

    return {
      accepted: true,
      eventId: id,
      cost: 0,
      energyRemaining: effectiveEnergy(agent, now),
      affectedCells: [],
      affectedChunks,
      summary: "clear_all_cells accepted",
    };
  },
});

export const paintBrowserCells = mutation({
  args: {
    worldId: v.string(),
    agentId: v.string(),
    token: v.optional(v.string()),
    production: v.optional(v.boolean()),
    cells: v.array(browserCellArg),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: args.worldId,
      agentId: args.agentId,
      scope: "agent:write",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) return rejectedResult(auth.reason);

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_world_agent", (q) => q.eq("worldId", args.worldId).eq("agentId", args.agentId))
      .unique();
    if (agent === null) return rejectedResult("permission_denied");
    if (args.cells.length === 0) return rejectedResult("malformed");

    const byChunk = new Map<string, typeof args.cells>();
    try {
      for (const cell of args.cells) {
        assertValidWorldCoord(cell.coord);
        const key = chunkKey(cell.coord.chunk);
        byChunk.set(key, [...(byChunk.get(key) ?? []), cell]);
      }
    } catch (error) {
      const reason = error instanceof Error && error.message === "invalid_target" ? "invalid_target" : "malformed";
      return rejectedResult(reason);
    }

    for (const cells of byChunk.values()) {
      const chunk = await getOrCreateChunk(ctx, args.worldId, cells[0].coord.chunk, now);
      const mergedCells = mergeSparseCells(
        chunk.cells,
        cells.map((cell) => ({
          coord: cell.coord,
          material: cell.material,
          state: cell.state,
          variant: cell.variant,
        })),
      );
      await ctx.db.patch(chunk._id, { cells: mergedCells, version: chunk.version + 1, updatedAt: now });
    }

    await ctx.db.patch(agent._id, { energyUpdatedAt: now, updatedAt: now });
    const affectedCells = args.cells.map((cell) => cell.coord);
    const affectedChunks = Array.from(byChunk.keys());
    const id = eventId(now, "browser-paint");
    await insertPublicEvent(
      ctx,
      args.worldId,
      id,
      args.agentId,
      "browser_paint_cells",
      `${args.agentId} browser edited ${args.cells.length} cells`,
      affectedChunks,
      affectedCells,
    );

    return {
      accepted: true,
      eventId: id,
      cost: 0,
      energyRemaining: effectiveEnergy(agent, now),
      affectedCells,
      affectedChunks,
      summary: "browser_paint_cells accepted",
    };
  },
});

async function hasStaleChunkVersion(ctx: any, envelope: any) {
  for (const key of affectedChunkKeys(envelope)) {
    const chunk = await ctx.db
      .query("chunks")
      .withIndex("by_world_chunk", (q: any) => q.eq("worldId", envelope.worldId).eq("chunkKey", key))
      .unique();
    const expected = expectedVersionFor(envelope, key);
    if (expected !== undefined && expected !== (chunk?.version ?? 0)) return true;
  }
  return false;
}

async function moveAgent(ctx: any, envelope: any, agent: any, cost: number, energy: number, now: number) {
  const to = envelope.payload.to as WorldCoord;
  assertInRange(agent.position, to);
  await ctx.db.patch(agent._id, { position: to, energy: energy - cost, energyUpdatedAt: now, updatedAt: now });
  const id = eventId(now, "move");
  await insertPublicEvent(ctx, envelope.worldId, id, envelope.agentId, "move", `${envelope.agentId} moved`, [], []);
  return acceptedResult({ eventId: id, envelope, cost, energyRemaining: energy - cost, cells: [], summary: "move accepted" });
}

async function placeMaterial(ctx: any, envelope: any, agent: any, cost: number, energy: number, now: number) {
  const target = envelope.payload.target as WorldCoord;
  assertInRange(agent.position, target);
  const material = Number(envelope.payload.material) || MATERIAL.Paint;
  const variant = Number.isInteger(envelope.payload.variant) ? Number(envelope.payload.variant) : 0;
  const chunk = await getOrCreateChunk(ctx, envelope.worldId, target.chunk, now);
  const cells = mergeSparseCells(chunk.cells, [{ coord: target, material, variant }]);
  await ctx.db.patch(chunk._id, { cells, version: chunk.version + 1, updatedAt: now });
  await ctx.db.patch(agent._id, { energy: energy - cost, energyUpdatedAt: now, updatedAt: now });
  const id = eventId(now, "place");
  await insertPublicEvent(ctx, envelope.worldId, id, envelope.agentId, "place_material", `${envelope.agentId} placed material`, [chunk.chunkKey], [target]);
  return acceptedResult({ eventId: id, envelope, cost, energyRemaining: energy - cost, cells: [target], summary: "place_material accepted" });
}

async function paintCells(ctx: any, envelope: any, agent: any, cost: number, energy: number, now: number) {
  const targets = envelope.payload.cells as WorldCoord[];
  const variant = Number.isInteger(envelope.payload.variant) ? Number(envelope.payload.variant) : 0;
  for (const target of targets) assertInRange(agent.position, target);
  const byChunk = new Map<string, WorldCoord[]>();
  for (const target of targets) byChunk.set(chunkKey(target.chunk), [...(byChunk.get(chunkKey(target.chunk)) ?? []), target]);
  for (const [key, coords] of byChunk) {
    const chunk = await getOrCreateChunk(ctx, envelope.worldId, coords[0].chunk, now);
    const cells = mergeSparseCells(
      chunk.cells,
      coords.map((coord) => ({ coord, material: MATERIAL.Paint, variant })),
    );
    await ctx.db.patch(chunk._id, { cells, version: chunk.version + 1, updatedAt: now });
    void key;
  }
  await ctx.db.patch(agent._id, { energy: energy - cost, energyUpdatedAt: now, updatedAt: now });
  const id = eventId(now, "paint");
  await insertPublicEvent(ctx, envelope.worldId, id, envelope.agentId, "paint_cells", `${envelope.agentId} painted ${targets.length} cells`, Array.from(byChunk.keys()), targets);
  return acceptedResult({ eventId: id, envelope, cost, energyRemaining: energy - cost, cells: targets, summary: "paint_cells accepted" });
}

async function getOrCreateChunk(ctx: any, worldId: string, chunkCoord: { x: number; y: number }, now: number) {
  const key = chunkKey(chunkCoord);
  const existing = await ctx.db
    .query("chunks")
    .withIndex("by_world_chunk", (q: any) => q.eq("worldId", worldId).eq("chunkKey", key))
    .unique();
  if (existing !== null) return existing;
  const id = await ctx.db.insert("chunks", { worldId, chunkKey: key, chunk: chunkCoord, version: 0, cells: [], updatedAt: now });
  return await ctx.db.get(id);
}

async function insertPublicEvent(
  ctx: any,
  worldId: string,
  id: string,
  agentId: string,
  kind: string,
  summary: string,
  affectedChunks: string[],
  affectedCells: readonly WorldCoord[],
) {
  await ctx.db.insert("events", {
    worldId,
    eventId: id,
    agentId,
    kind,
    summary,
    public: true,
    affectedChunks,
    affectedCells,
    createdAt: Date.now(),
  });
}
