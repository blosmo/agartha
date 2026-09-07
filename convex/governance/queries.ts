import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { WORLD_RULE_DEFAULTS } from "../../packages/protocol/src/governance";
import { CLOUD_GRID, session } from "../cloud/common";
import {
  scopeOf,
  scopeState,
  scopeView,
  getProposal,
  proposalView,
  externalId,
  type Reader,
  type WorldRules,
} from "./helpers";
import { statusValue } from "./schema";
export async function discovery(ctx: Reader, value: string, agentId?: string) {
  const s = await scopeView(ctx, scopeOf(value), agentId);
  return {
    supported: true,
    scope: s.scope,
    guide: s.guide,
    overview: s.overview,
    proposals: s.proposals,
    eligibleToVote: s.permissions.eligibleToVote,
    canPropose: s.permissions.canPropose,
    rosterReady: s.voting.rosterReady,
  };
}
export async function worldRules(
  ctx: Reader,
  worldId: string,
): Promise<WorldRules> {
  const room = await ctx.db.query("sceneWorlds").withIndex("by_world", q => q.eq("worldId", worldId)).unique();
  if (!room || room.gridId !== CLOUD_GRID || !room.publicRead)
    return {
      ...WORLD_RULE_DEFAULTS,
      allowedShapes: [...WORLD_RULE_DEFAULTS.allowedShapes],
    };
  return (await scopeState(ctx, scopeOf(`world:${externalId(worldId)}`)))
    .rules as WorldRules;
}
export const overview = internalQuery({
  args: { scope: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, a) =>
    scopeView(ctx, scopeOf(a.scope), (await session(ctx, a.token))?.agentId),
});
export const proposal = internalQuery({
  args: { proposalId: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, a) =>
    proposalView(
      ctx,
      await getProposal(ctx, a.proposalId),
      (await session(ctx, a.token))?.agentId,
    ),
});
export const proposals = internalQuery({
  args: {
    scope: v.string(),
    status: v.optional(statusValue),
    cursor: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const scope = scopeOf(a.scope),
      agentId = (await session(ctx, a.token))?.agentId;
    await scopeState(ctx, scope);
    const query = a.status
      ? ctx.db
          .query("governanceProposals")
          .withIndex("by_status", (q) =>
            q.eq("scope", scope).eq("status", a.status!),
          )
      : ctx.db
          .query("governanceProposals")
          .withIndex("by_scope", (q) => q.eq("scope", scope));
    const result = await query
      .order("desc")
      .paginate({
        cursor: a.cursor ?? null,
        numItems: 10,
        maximumRowsRead: 10,
      });
    return {
      page: await Promise.all(
        result.page.map((p) => proposalView(ctx, p, agentId)),
      ),
      continueCursor: result.isDone ? null : result.continueCursor,
      isDone: result.isDone,
    };
  },
});
export const comments = internalQuery({
  args: {
    proposalId: v.string(),
    cursor: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await session(ctx, a.token);
    const p = await getProposal(ctx, a.proposalId);
    await scopeState(ctx, scopeOf(p.scope));
    const r = await ctx.db
      .query("governanceComments")
      .withIndex("by_proposal", (q) => q.eq("proposalId", a.proposalId))
      .order("desc")
      .paginate({
        cursor: a.cursor ?? null,
        numItems: 10,
        maximumRowsRead: 10,
      });
    return {
      page: r.page.map((p) => ({
        id: p._id,
        proposalId: p.proposalId,
        author: p.author,
        text: p.text,
        createdAt: p.createdAt,
      })),
      continueCursor: r.isDone ? null : r.continueCursor,
      isDone: r.isDone,
    };
  },
});

export const discover = internalQuery({
  args: {scope:v.string(), token:v.optional(v.string())},
  handler: async (ctx,args) => discovery(ctx,args.scope,(await session(ctx,args.token))?.agentId),
});
