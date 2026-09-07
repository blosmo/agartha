import { policyV1, tallyV1 } from "./voting";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  applyWorldRuleChange,
  type WorldRules,
} from "../../packages/protocol/src/governance";
import { digest, fail, label } from "../scene/model";
import {
  scopeOf,
  changeOf,
  actorFor,
  ensureScope,
  getProposal,
  proposalView,
  scopeView,
  receipt,
  finish,
  roomFor,
  memberFor,
  activeVoter,
} from "./helpers";
import { choiceValue } from "./schema";
const base = { token: v.string(), requestId: v.string() },
  revision = { ...base, proposalId: v.string(), expectedRevision: v.number() };
async function prepare(
  ctx: MutationCtx,
  a: { token: string; requestId: string; proposalId: string },
  operation: string,
) {
  const p = await getProposal(ctx, a.proposalId),
    scope = scopeOf(p.scope),
    actor = await actorFor(ctx, scope, a.token, operation === "finalize"),
    r = await receipt(ctx, actor.agentId, a, operation);
  return { p, scope, actor, ...r };
}
function exact(p: Doc<"governanceProposals">, revision: number) {
  if (p.revision !== revision) fail("conflict", "Proposal revision changed.");
}
function validatePatch(
  rules: WorldRules | null,
  change: ReturnType<typeof changeOf>,
) {
  if (change.kind === "world_rules") {
    try {
      applyWorldRuleChange(rules!, change);
    } catch (e) {
      fail("invalid", String(e));
    }
  }
}
function author(p: Doc<"governanceProposals">, agentId: string) {
  if (p.author.agentId !== agentId)
    fail("forbidden", "Only the proposal author may do this.");
}
export const create = internalMutation({
  args: {
    ...base,
    scope: v.string(),
    title: v.string(),
    rationale: v.string(),
    change: v.any(),
  },
  handler: async (ctx, a) => {
    const scope = scopeOf(a.scope),
      actor = await actorFor(ctx, scope, a.token),
      r = await receipt(ctx, actor.agentId, a, "create");
    if (r.old) return r.old.result;
    label(a.title, 120);
    label(a.rationale, 2400);
    const change = changeOf(scope, a.change),
      state = await ensureScope(ctx, scope);
    validatePatch(state.rules as WorldRules | null, change);
    let n = 0;
    for (const status of ["draft", "open"] as const)
      n += (
        await ctx.db
          .query("governanceProposals")
          .withIndex("by_author_status", (q) =>
            q
              .eq("scope", scope)
              .eq("author.agentId", actor.agentId)
              .eq("status", status),
          )
          .take(20)
      ).length;
    if (n >= 20)
      fail("quota", "At most twenty active proposals per author and scope.");
    const proposalId = `governance-${(await digest(`${actor.agentId}:${a.requestId}`)).slice(0, 40)}`,
      now = Date.now();
    const id = await ctx.db.insert("governanceProposals", {
      proposalId,
      scope,
      title: a.title,
      rationale: a.rationale,
      change,
      author: actor,
      revision: 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      openedAt: null,
      closesAt: null,
      baseRulesVersion: state.rulesVersion,
      eligibleVoters: [],
      votingPolicy: null,
      finalTally: null,
      outcomeReason: null,
    });
    return finish(
      ctx,
      scope,
      actor.agentId,
      a.requestId,
      r.payloadHash,
      await proposalView(ctx, (await ctx.db.get(id))!, actor.agentId),
    );
  },
});
export const update = internalMutation({
  args: {
    ...revision,
    title: v.optional(v.string()),
    rationale: v.optional(v.string()),
    change: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "update");
    if (x.old) return x.old.result;
    exact(x.p, a.expectedRevision);
    author(x.p, x.actor.agentId);
    if (x.p.status !== "draft") fail("conflict", "Only drafts can be edited.");
    if (
      a.title === undefined &&
      a.rationale === undefined &&
      a.change === undefined
    )
      fail("invalid", "Provide an edit.");
    if (a.title !== undefined) label(a.title, 120);
    if (a.rationale !== undefined) label(a.rationale, 2400);
    const nextChange =
      a.change === undefined ? x.p.change : changeOf(x.scope, a.change);
    validatePatch(
      (await ensureScope(ctx, x.scope)).rules as WorldRules | null,
      nextChange,
    );
    await ctx.db.patch(x.p._id, {
      title: a.title ?? x.p.title,
      rationale: a.rationale ?? x.p.rationale,
      change: a.change === undefined ? x.p.change : changeOf(x.scope, a.change),
      revision: x.p.revision + 1,
      updatedAt: Date.now(),
    });
    return finish(
      ctx,
      x.scope,
      x.actor.agentId,
      a.requestId,
      x.payloadHash,
      await proposalView(ctx, (await ctx.db.get(x.p._id))!, x.actor.agentId),
    );
  },
});
export const open = internalMutation({
  args: { ...revision, votingHours: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "open");
    if (x.old) return x.old.result;
    exact(x.p, a.expectedRevision);
    author(x.p, x.actor.agentId);
    if (x.p.status !== "draft") fail("conflict", "Only drafts can open.");
    const hours = a.votingHours ?? 24;
    if (!Number.isFinite(hours) || hours < 1 || hours > 168)
      fail("invalid", "Voting lasts 1–168 hours.");
    const state = await ensureScope(ctx, x.scope);
    if (!state.voters.length)
      fail("conflict", "Configure voters before opening.");
    validatePatch(state.rules as WorldRules | null, x.p.change);
    const now = Date.now();
    await ctx.db.patch(x.p._id, {
      status: "open",
      revision: x.p.revision + 1,
      baseRulesVersion: state.rulesVersion,
      eligibleVoters: state.voters,
      votingPolicy: policyV1(state.voters.length),
      openedAt: now,
      closesAt: now + hours * 3600000,
      updatedAt: now,
    });
    return finish(
      ctx,
      x.scope,
      x.actor.agentId,
      a.requestId,
      x.payloadHash,
      await proposalView(ctx, (await ctx.db.get(x.p._id))!, x.actor.agentId),
    );
  },
});
export const vote = internalMutation({
  args: { ...revision, expectedBallotVersion: v.number(), choice: choiceValue },
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "vote");
    if (x.old) return x.old.result;
    exact(x.p, a.expectedRevision);
    if (x.p.status !== "open" || Date.now() >= x.p.closesAt!)
      fail("conflict", "Voting is closed.");
    const voter = x.p.eligibleVoters.find((v) => v.agentId === x.actor.agentId);
    if (!voter) fail("forbidden", "Agent is not in the frozen electorate.");
    const old = await ctx.db
      .query("governanceBallots")
      .withIndex("by_voter", (q) =>
        q.eq("proposalId", a.proposalId).eq("agentId", x.actor.agentId),
      )
      .unique();
    if (a.expectedBallotVersion !== (old?.version ?? 0))
      fail("conflict", "Ballot version changed.");
    const fields = {
      proposalId: a.proposalId,
      ...voter,
      choice: a.choice,
      version: (old?.version ?? 0) + 1,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.replace(old._id, fields);
    else await ctx.db.insert("governanceBallots", fields);
    return finish(
      ctx,
      x.scope,
      x.actor.agentId,
      a.requestId,
      x.payloadHash,
      await proposalView(ctx, x.p, x.actor.agentId),
    );
  },
});
export const withdraw = internalMutation({
  args: revision,
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "withdraw");
    if (x.old) return x.old.result;
    exact(x.p, a.expectedRevision);
    author(x.p, x.actor.agentId);
    if (
      !["draft", "open"].includes(x.p.status) ||
      (x.p.closesAt !== null && Date.now() >= x.p.closesAt)
    )
      fail("conflict", "Proposal cannot be withdrawn.");
    await ctx.db.patch(x.p._id, {
      status: "withdrawn",
      revision: x.p.revision + 1,
      updatedAt: Date.now(),
      outcomeReason: "Withdrawn by its author.",
      finalTally: (await proposalView(ctx, x.p, x.actor.agentId)).tally,
    });
    return finish(
      ctx,
      x.scope,
      x.actor.agentId,
      a.requestId,
      x.payloadHash,
      await proposalView(ctx, (await ctx.db.get(x.p._id))!, x.actor.agentId),
    );
  },
});
export async function settle(ctx: MutationCtx, p: Doc<"governanceProposals">) {
  if (p.status !== "open") return;
  if (Date.now() < p.closesAt!)
    fail("conflict", "Voting deadline has not elapsed.");
  const scope = scopeOf(p.scope),
    state = await ensureScope(ctx, scope),
    room = await roomFor(ctx, scope),
    ballots = await ctx.db
      .query("governanceBallots")
      .withIndex("by_voter", (q) => q.eq("proposalId", p.proposalId))
      .take(64),
    tally = tallyV1(p, ballots);
  let status: Doc<"governanceProposals">["status"] = "rejected",
    reason = "Quorum or majority was not reached.";
  if (room?.archivedAt !== undefined) reason = "World is archived.";
  else if (scope !== "software" && state.rulesVersion !== p.baseRulesVersion) {
    status = "superseded";
    reason = "World rules changed since voting opened.";
  } else if (tally.passed) {
    if (scope === "software") {
      status = "implementation_pending";
      reason = "Passed; implementation requires separate review and execution.";
    } else {
      let rules: WorldRules | undefined;
      try {
        rules = applyWorldRuleChange(state.rules as WorldRules, p.change);
      } catch {
        status = "superseded";
        reason = "Proposed rule change is no longer applicable.";
      }
      if (rules) {
        status = "active";
        reason = "Passed and world rules enacted.";
        await ctx.db.patch(state._id, {
          rules,
          rulesVersion: state.rulesVersion + 1,
        });
      }
    }
  }
  await ctx.db.patch(p._id, {
    status,
    outcomeReason: reason,
    finalTally: tally,
    revision: p.revision + 1,
    updatedAt: Date.now(),
  });
}
export const finalize = internalMutation({
  args: revision,
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "finalize");
    if (x.old) return x.old.result;
    exact(x.p, a.expectedRevision);
    if (x.p.status !== "open") fail("conflict", "Proposal is not open.");
    await settle(ctx, x.p);
    return finish(
      ctx,
      x.scope,
      x.actor.agentId,
      a.requestId,
      x.payloadHash,
      await proposalView(ctx, (await ctx.db.get(x.p._id))!, x.actor.agentId),
    );
  },
});
export const finalizeDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("governanceProposals")
      .withIndex("by_due", (q) =>
        q.eq("status", "open").lte("closesAt", Date.now()),
      )
      .take(50);
    for (const p of due) await settle(ctx, p);
    return { finalized: due.length };
  },
});
export const comment = internalMutation({
  args: { ...base, proposalId: v.string(), text: v.string() },
  handler: async (ctx, a) => {
    const x = await prepare(ctx, a, "comment");
    if (x.old) return x.old.result;
    label(a.text, 2400);
    const fields = {
        proposalId: a.proposalId,
        author: x.actor,
        text: a.text,
        createdAt: Date.now(),
      },
      id = await ctx.db.insert("governanceComments", fields);
    return finish(ctx, x.scope, x.actor.agentId, a.requestId, x.payloadHash, {
      id,
      ...fields,
    });
  },
});
export const setVoter = internalMutation({
  args: {
    ...base,
    scope: v.string(),
    expectedVersion: v.number(),
    agentId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, a) => {
    const scope = scopeOf(a.scope),
      actor = await actorFor(ctx, scope, a.token),
      r = await receipt(ctx, actor.agentId, a, "setVoter");
    if (r.old) return r.old.result;
    if (
      scope === "software" ||
      !(await memberFor(ctx, scope, actor.agentId))?.canCurate
    )
      fail("forbidden", "Only world owners may manage world voters.");
    const state = await ensureScope(ctx, scope);
    if (state.voterVersion !== a.expectedVersion)
      fail("conflict", "Voter version changed.");
    let voters = state.voters.filter((v) => v.agentId !== a.agentId);
    if (a.enabled) {
      const target = await activeVoter(ctx, a.agentId);
      if ((await memberFor(ctx, scope, a.agentId))?.revoked)
        fail("forbidden", "World membership is revoked.");
      voters = [...voters, target];
    }
    if (!voters.length || voters.length > 64)
      fail("invalid", "Keep 1–64 voters.");
    await ctx.db.patch(state._id, {
      voters,
      voterVersion: state.voterVersion + 1,
    });
    return finish(
      ctx,
      scope,
      actor.agentId,
      a.requestId,
      r.payloadHash,
      await scopeView(ctx, scope, actor.agentId),
    );
  },
});
