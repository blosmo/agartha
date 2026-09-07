import { tallyV1 } from "./voting";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  WORLD_RULE_DEFAULTS,
  parseGovernanceScope,
  parseGovernanceChange,
  governanceLinks,
  type GovernanceScope,
  type WorldRules,
} from "../../packages/protocol/src/governance";
import { publicWorld, session, limit, externalId } from "../cloud/common";
import { digest, fail, identifier } from "../scene/model";
export type Reader = QueryCtx | MutationCtx;
export function scopeOf(value: string) {
  try {
    return parseGovernanceScope(value);
  } catch (e) {
    fail("invalid", String(e));
  }
}
export function changeOf(scope: GovernanceScope, value: unknown) {
  try {
    return parseGovernanceChange(scope, value);
  } catch (e) {
    fail("invalid", String(e));
  }
}
export async function roomFor(ctx: Reader, scope: GovernanceScope) {
  return scope === "software" ? null : publicWorld(ctx, scope.slice(6));
}
export async function memberFor(
  ctx: Reader,
  scope: GovernanceScope,
  agentId?: string,
) {
  if (!agentId || scope === "software") return null;
  const room = await roomFor(ctx, scope);
  return ctx.db
    .query("sceneAgents")
    .withIndex("by_agent", (q) =>
      q.eq("worldId", room!.worldId).eq("agentId", agentId),
    )
    .unique();
}
export async function actorFor(
  ctx: Reader,
  scope: GovernanceScope,
  token: string,
  allowArchived = false,
) {
  const actor = await session(ctx, token);
  if (!actor) fail("unauthorized", "Register an agent first.");
  const room = await roomFor(ctx, scope),
    member = await memberFor(ctx, scope, actor.agentId);
  if (member?.revoked) fail("forbidden", "World membership is revoked.");
  if (room?.archivedAt !== undefined && !allowArchived)
    fail("forbidden", "World is archived.");
  return { agentId: actor.agentId, name: actor.name };
}
export async function scopeState(ctx: Reader, scope: GovernanceScope) {
  const room = await roomFor(ctx, scope);
  const stored = await ctx.db
    .query("governanceScopes")
    .withIndex("by_scope", (q) => q.eq("scope", scope))
    .unique();
  if (stored) return stored;
  const owners = room
    ? await ctx.db
        .query("sceneAgents")
        .withIndex("by_owner", (q) =>
          q
            .eq("worldId", room.worldId)
            .eq("canCurate", true)
            .eq("revoked", false),
        )
        .take(64)
    : [];
  return {
    scope,
    rules:
      scope === "software"
        ? null
        : {
            ...WORLD_RULE_DEFAULTS,
            allowedShapes: [...WORLD_RULE_DEFAULTS.allowedShapes],
          },
    rulesVersion: 0,
    voterVersion: 0,
    voters: owners.map(({ agentId, name }) => ({ agentId, name })),
  };
}
export async function ensureScope(ctx: MutationCtx, scope: GovernanceScope) {
  const state = await scopeState(ctx, scope);
  if ("_id" in state) return state;
  const id = await ctx.db.insert("governanceScopes", state);
  return (await ctx.db.get(id))!;
}
export async function getProposal(ctx: Reader, id: string) {
  identifier(id);
  const p = await ctx.db
    .query("governanceProposals")
    .withIndex("by_proposal", (q) => q.eq("proposalId", id))
    .unique();
  if (!p) fail("not_found", "Governance proposal not found.");
  return p;
}
export async function scopeView(
  ctx: Reader,
  scope: GovernanceScope,
  agentId?: string,
) {
  const state = await scopeState(ctx, scope),
    room = await roomFor(ctx, scope),
    member = await memberFor(ctx, scope, agentId);
  const enabled =
    !!agentId && !member?.revoked && room?.archivedAt === undefined;
  return {
    kind: scope === "software" ? "software" : "world",
    label: room?.name ?? "Agartha software",
    supported: true,
    ...governanceLinks(scope),
    rules: state.rules,
    rulesVersion: state.rulesVersion,
    voterVersion: state.voterVersion,
    voters: state.voters,
    voting: {
      durationHours: 24,
      quorumFraction: 0.5,
      approval: "majority",
      rosterReady: state.voters.length > 0,
    },
    permissions: {
      agentId: agentId ?? null,
      canPropose: enabled,
      canManageVoters: enabled && !!member?.canCurate,
      eligibleToVote:
        enabled && state.voters.some((v) => v.agentId === agentId),
    },
  };
}
export async function proposalView(
  ctx: Reader,
  p: Doc<"governanceProposals">,
  agentId?: string,
) {
  const scope = scopeOf(p.scope),
    room = await roomFor(ctx, scope),
    member = await memberFor(ctx, scope, agentId);
  const authorized = !!agentId && !member?.revoked,
    enabled = authorized && room?.archivedAt === undefined;
  const ballots = await ctx.db
    .query("governanceBallots")
    .withIndex("by_voter", (q) => q.eq("proposalId", p.proposalId))
    .take(64);
  const before = p.closesAt === null || Date.now() < p.closesAt;
  return {
    id: p.proposalId,
    scope,
    revision: p.revision,
    status: p.status,
    title: p.title,
    rationale: p.rationale,
    change: p.change,
    author: p.author,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    openedAt: p.openedAt,
    closesAt: p.closesAt,
    baseRulesVersion: p.baseRulesVersion,
    eligibleVoters: p.eligibleVoters,
    ballots: ballots.map(({ agentId, name, choice, version, updatedAt }) => ({
      agentId,
      name,
      choice,
      version,
      updatedAt,
    })),
    votingPolicy: p.votingPolicy ?? null,
    finalTally: p.finalTally ?? null,
    tally: p.finalTally ?? tallyV1(p, ballots),
    outcomeReason: p.outcomeReason,
    permissions: {
      canEdit: enabled && agentId === p.author.agentId && p.status === "draft",
      canOpen:
        enabled &&
        agentId === p.author.agentId &&
        p.status === "draft" &&
        (await scopeState(ctx, scope)).voters.length > 0,
      canVote:
        enabled &&
        p.status === "open" &&
        before &&
        p.eligibleVoters.some((v) => v.agentId === agentId),
      canWithdraw:
        enabled &&
        agentId === p.author.agentId &&
        ["draft", "open"].includes(p.status) &&
        before,
      canFinalize: authorized && p.status === "open" && !before,
    },
    implementation:
      p.status === "implementation_pending" && p.change.kind === "software"
        ? {
            proposalId: p.proposalId,
            scope,
            title: p.title,
            rule: p.change.rule,
            implementation: p.change.implementation,
            acceptanceCriteria: p.change.acceptanceCriteria,
            repository: "https://github.com/blosmo/agartha",
            status: "implementation_pending",
          }
        : null,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export async function receipt(
  ctx: MutationCtx,
  agentId: string,
  args: { token: string; requestId: string },
  operation: string,
) {
  identifier(args.requestId);
  const { token, ...payload } = args;
  const payloadHash = await digest(
    JSON.stringify(canonical({ operation, ...payload })),
  );
  const old = await ctx.db
    .query("governanceReceipts")
    .withIndex("by_request", (q) =>
      q.eq("agentId", agentId).eq("requestId", args.requestId),
    )
    .unique();
  if (old && old.payloadHash !== payloadHash)
    fail("conflict", "Request ID already used with a different payload.");
  return { old, payloadHash };
}
export async function finish(
  ctx: MutationCtx,
  scope: string,
  agentId: string,
  requestId: string,
  payloadHash: string,
  result: unknown,
) {
  await limit(ctx, `governance:${scope}:${agentId}`, 12, 60000);
  await ctx.db.insert("governanceReceipts", {
    agentId,
    requestId,
    payloadHash,
    result,
  });
  return result;
}
export async function activeVoter(ctx: Reader, agentId: string) {
  identifier(agentId);
  const row = await ctx.db
    .query("cloudSessions")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .unique();
  if (!row || row.revoked || row.expiresAt <= Date.now())
    fail("invalid", "Voter must be an active registered agent.");
  return { agentId: row.agentId, name: row.name };
}
export { externalId };
export type { WorldRules };
