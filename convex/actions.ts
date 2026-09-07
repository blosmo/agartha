import { assertLegacyEnabled } from './legacyGate';
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MATERIAL, type CellSample, type ChunkCoord, type WorldCoord } from "@agartha/protocol/world";

import { authenticateToken } from "./lib/auth";
import { contextForArea } from "./lib/collaboration";
import { absoluteToWorldCoord, chunkKey, eventId, worldCoordToAbsolute } from "./lib/coords";
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
    assertLegacyEnabled();
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
    const [sessions, messages, projects, summaries] = await Promise.all([
      ctx.db.query("collaborationSessions").withIndex("by_world_area", (q) => q.eq("worldId", worldId)).collect(),
      ctx.db.query("collaborationMessages").withIndex("by_world_area_time", (q) => q.eq("worldId", worldId)).collect(),
      ctx.db.query("areaProjects").withIndex("by_world_area", (q) => q.eq("worldId", worldId)).collect(),
      ctx.db.query("areaSummaries").withIndex("by_world_area", (q) => q.eq("worldId", worldId)).collect(),
    ]);
    return toAgentPerception({
      agent,
      collaboration: contextForArea({
        position: agent.position,
        now,
        sessions,
        messages: messages.map((message) => ({
          id: message.messageId,
          worldId: message.worldId,
          areaId: message.areaId,
          authorAgentId: message.authorAgentId,
          body: message.body,
          createdAt: message.createdAt,
        })),
        projects: projects.map((project) => ({
          id: project.projectId,
          worldId: project.worldId,
          areaId: project.areaId,
          title: project.title,
          version: project.version,
          entries: project.entries,
          updatedAt: project.updatedAt,
        })),
        summaries: summaries.map((summary) => ({
          id: summary.summaryId,
          worldId: summary.worldId,
          areaId: summary.areaId,
          body: summary.body,
          provenance: summary.provenance,
        })),
      }),
      visibleCells: chunks.flatMap((chunk) => chunk.cells),
      events,
      now,
    });
  },
});

export const quote = mutation({
  args: { envelope: actionEnvelopeArg, token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
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
    assertLegacyEnabled();
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
    assertLegacyEnabled();
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

export const stepWorld = mutation({
  args: { worldId: v.string(), agentId: v.string(), token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const now = Date.now();
    const auth = await authenticateWrite(ctx, args, now);
    if (!auth.ok) return rejectedResult(auth.reason);

    const world = await ctx.db.query("worlds").withIndex("by_world_id", (q) => q.eq("worldId", args.worldId)).unique();
    if (world === null) return rejectedResult("permission_denied");

    const chunks = await ctx.db.query("chunks").withIndex("by_world_chunk", (q) => q.eq("worldId", args.worldId)).collect();
    const previousByChunk = new Map(chunks.map((chunk) => [chunk.chunkKey, chunk.cells]));
    const previousCells = chunks.flatMap((chunk) => chunk.cells);
    const nextCells = stepSparseCells(previousCells);
    const nextByChunk = groupCellsByChunk(nextCells);
    const allChangedChunkKeys = new Set([...previousByChunk.keys(), ...nextByChunk.keys()]);
    const changedChunks: string[] = [];

    for (const key of allChangedChunkKeys) {
      const previous = previousByChunk.get(key) ?? [];
      const next = nextByChunk.get(key) ?? [];
      if (cellSamplesEqual(previous, next)) continue;

      const existing = chunks.find((chunk) => chunk.chunkKey === key);
      const chunkCoord = next[0]?.coord.chunk ?? previous[0]?.coord.chunk ?? chunkCoordFromKey(key);
      const chunk = existing ?? (await getOrCreateChunk(ctx, args.worldId, chunkCoord, now));
      await ctx.db.patch(chunk._id, { cells: next, version: chunk.version + 1, updatedAt: now });
      changedChunks.push(key);
    }

    const nextTick = (world.tick ?? 0) + 1;
    await ctx.db.patch(world._id, { tick: nextTick, updatedAt: now });

    const id = eventId(now, "time-step");
    await insertPublicEvent(ctx, args.worldId, id, args.agentId, "time_step", `Advanced global simulation to tick ${nextTick}`, changedChunks, []);

    return {
      accepted: true,
      eventId: id,
      cost: 0,
      energyRemaining: 0,
      affectedCells: [],
      affectedChunks: changedChunks,
      summary: `time_step accepted: tick ${nextTick}`,
    };
  },
});

export const resetWorldTime = mutation({
  args: { worldId: v.string(), agentId: v.string(), token: v.optional(v.string()), production: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const now = Date.now();
    const auth = await authenticateWrite(ctx, args, now);
    if (!auth.ok) return rejectedResult(auth.reason);

    const world = await ctx.db.query("worlds").withIndex("by_world_id", (q) => q.eq("worldId", args.worldId)).unique();
    if (world === null) return rejectedResult("permission_denied");
    await ctx.db.patch(world._id, { tick: 0, updatedAt: now });

    const id = eventId(now, "time-reset");
    await insertPublicEvent(ctx, args.worldId, id, args.agentId, "time_reset", "Reset global simulation time", [], []);

    return {
      accepted: true,
      eventId: id,
      cost: 0,
      energyRemaining: 0,
      affectedCells: [],
      affectedChunks: [],
      summary: "time_reset accepted",
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
    assertLegacyEnabled();
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

async function authenticateWrite(
  ctx: any,
  args: { readonly worldId: string; readonly agentId: string; readonly token?: string; readonly production?: boolean },
  now: number,
) {
  const records = await ctx.db
    .query("serviceTokens")
    .withIndex("by_prefix", (q: any) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
    .collect();
  return authenticateToken(args.token, records, {
    worldId: args.worldId,
    agentId: args.agentId,
    scope: "agent:write",
    now,
    production: args.production ?? false,
  });
}

function stepSparseCells(cells: readonly CellSample[]): CellSample[] {
  const next = new Map(cells.map((cell) => [coordKey(cell.coord), cell]));
  const occupied = new Set(next.keys());

  for (const cell of cells) {
    const { x, y } = worldCoordToAbsolute(cell.coord);

    if (cell.material === MATERIAL.Water) {
      const below = absoluteToWorldCoord(x, y + 1);
      const belowKey = coordKey(below);
      if (!occupied.has(belowKey)) {
        next.delete(coordKey(cell.coord));
        next.set(belowKey, { ...cell, coord: below });
        occupied.delete(coordKey(cell.coord));
        occupied.add(belowKey);
      }
    }

    if (cell.material === MATERIAL.Fire) {
      const nextAge = cell.state + 1;
      if (nextAge > 3) {
        next.delete(coordKey(cell.coord));
        occupied.delete(coordKey(cell.coord));
      } else {
        next.set(coordKey(cell.coord), { ...cell, state: nextAge });
      }

      for (const target of [
        absoluteToWorldCoord(x + 1, y),
        absoluteToWorldCoord(x - 1, y),
        absoluteToWorldCoord(x, y + 1),
        absoluteToWorldCoord(x, y - 1),
      ]) {
        const targetKey = coordKey(target);
        const targetCell = next.get(targetKey);
        if (targetCell?.material === MATERIAL.Plant) {
          next.set(targetKey, { ...targetCell, material: MATERIAL.Fire, state: 0 });
        }
      }
    }

    if (cell.material === MATERIAL.Plant) {
      const nearWater = [
        absoluteToWorldCoord(x + 1, y),
        absoluteToWorldCoord(x - 1, y),
        absoluteToWorldCoord(x, y + 1),
        absoluteToWorldCoord(x, y - 1),
      ].some((coord) => next.get(coordKey(coord))?.material === MATERIAL.Water);

      if (nearWater) {
        const growTarget = absoluteToWorldCoord(x + 1, y + 1);
        const growKey = coordKey(growTarget);
        if (!occupied.has(growKey)) {
          next.set(growKey, { coord: growTarget, material: MATERIAL.Plant, state: 0, variant: 0, flags: 0 });
          occupied.add(growKey);
        }
      }
    }
  }

  return Array.from(next.values()).sort(compareCellSamples);
}

function groupCellsByChunk(cells: readonly CellSample[]) {
  const byChunk = new Map<string, CellSample[]>();
  for (const cell of cells) {
    const key = chunkKey(cell.coord.chunk);
    byChunk.set(key, [...(byChunk.get(key) ?? []), cell]);
  }
  for (const [key, chunkCells] of byChunk) {
    byChunk.set(key, [...chunkCells].sort(compareCellSamples));
  }
  return byChunk;
}

function cellSamplesEqual(a: readonly CellSample[], b: readonly CellSample[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort(compareCellSamples);
  const sortedB = [...b].sort(compareCellSamples);
  return sortedA.every((cell, index) => sameCellSample(cell, sortedB[index]));
}

function sameCellSample(a: CellSample, b: CellSample | undefined) {
  return Boolean(
    b &&
      coordKey(a.coord) === coordKey(b.coord) &&
      a.material === b.material &&
      a.state === b.state &&
      a.variant === b.variant &&
      a.flags === b.flags,
  );
}

function compareCellSamples(a: CellSample, b: CellSample) {
  return coordKey(a.coord).localeCompare(coordKey(b.coord));
}

function coordKey(coord: WorldCoord) {
  const absolute = worldCoordToAbsolute(coord);
  return `${absolute.x}:${absolute.y}`;
}

function chunkCoordFromKey(key: string): ChunkCoord {
  const [x, y] = key.split(":").map(Number);
  return { x, y };
}

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
