import {validateRenderBudget} from '../scene/renderBudget';
import {validateModelRef} from './models';
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertWithinPlot } from "../../packages/protocol/src/plots";
import {
  AGENT_OBJECT_QUOTA,
  MAX_BATCH,
  digest,
  fail,
  identifier,
  label,
  regionOf,
  validateObject,
  type SceneObject,
} from "../scene/model";
import { limit, membership, publicWorld, session } from "./common";
type Reader = MutationCtx | QueryCtx;
export async function readable(ctx: Reader, id: string, token?: string) {
  await session(ctx, token);
  const room = await publicWorld(ctx, id);
  if (room.archivedAt !== undefined)
    fail("forbidden", "This room is archived.");
  return room;
}
export async function getProposal(ctx: Reader, id: string, proposalId: string) {
  identifier(proposalId);
  const p = await ctx.db
    .query("sceneProposals")
    .withIndex("by_proposal", (q) =>
      q.eq("worldId", id).eq("proposalId", proposalId),
    )
    .unique();
  if (!p) fail("not_found", "Proposal not found.");
  return p;
}
export function present(p: Doc<"sceneProposals">) {
  const { _id, _creationTime, worldId, ...value } = p;
  return value;
}
export async function writer(ctx: MutationCtx, id: string, token: string) {
  const m = await membership(ctx, id, token);
  const actor = await ctx.db
    .query("sceneAgents")
    .withIndex("by_agent", (q) =>
      q.eq("worldId", m.worldId).eq("agentId", m.agentId),
    )
    .unique();
  return actor!;
}
export async function receipt(
  ctx: MutationCtx,
  actor: Doc<"sceneAgents">,
  args: { requestId: string; token: string },
  operation: string,
) {
  identifier(args.requestId);
  const { token, ...payload } = args;
  const payloadHash = await digest(JSON.stringify({ operation, ...payload }));
  const old = await ctx.db
    .query("sceneProposalReceipts")
    .withIndex("by_request", (q) =>
      q
        .eq("worldId", actor.worldId)
        .eq("agentId", actor.agentId)
        .eq("requestId", args.requestId),
    )
    .unique();
  if (old && old.payloadHash !== payloadHash)
    fail("conflict", "Request ID was already used for a different operation.");
  return { old, payloadHash };
}
export async function finish(
  ctx: MutationCtx,
  actor: Doc<"sceneAgents">,
  requestId: string,
  payloadHash: string,
  result: unknown,
  type: string,
  proposal?: Doc<"sceneProposals">,
) {
  await limit(ctx, `proposals:${actor.worldId}:${actor.agentId}`, 12, 60000);
  const room = await ctx.db
    .query("sceneWorlds")
    .withIndex("by_world", (q) => q.eq("worldId", actor.worldId))
    .unique();
  const sequence = (room!.proposalSequence ?? 0) + 1;
  await ctx.db.patch(room!._id, { proposalSequence: sequence });
  await ctx.db.insert("sceneProposalEvents", {
    worldId: actor.worldId,
    sequence,
    type,
    agentId: actor.agentId,
    name: actor.name,
    createdAt: Date.now(),
    ...(proposal
      ? { proposalId: proposal.proposalId, revision: proposal.revision }
      : {}),
  });
  await ctx.db.insert("sceneProposalReceipts", {
    worldId: actor.worldId,
    agentId: actor.agentId,
    requestId,
    payloadHash,
    result,
  });
  return result;
}
export function editorsValid(editors: string[]) {
  if (editors.length > 8 || new Set(editors).size !== editors.length)
    fail("invalid", "Use at most eight unique editors.");
  editors.forEach(identifier);
}
export async function validateChanges(
  ctx: Reader,
  worldId: string,
  changes: Array<{ id: string; expectedVersion: number; object?: SceneObject }>,
) {
  if (
    changes.length > MAX_BATCH ||
    new Set(changes.map((c) => c.id)).size !== changes.length
  )
    fail("invalid", "Use at most 20 unique changes.");
  const room = await ctx.db
    .query("sceneWorlds")
    .withIndex("by_world", (q) => q.eq("worldId", worldId))
    .unique();
  for (const c of changes) {
    identifier(c.id);
    if (!Number.isSafeInteger(c.expectedVersion) || c.expectedVersion < 0)
      fail("invalid", "Expected version must be non-negative.");
    if (!c.object) continue;
    validateObject(c.object);
    await validateModelRef(ctx,c.object,room?.gridId);
    if (c.id !== c.object.id)
      fail("invalid", "Object ID must match change ID.");
    try {
      assertWithinPlot(c.object);
    } catch (e) {
      fail("invalid", String(e));
    }
    for (const [libraryId, kind] of [
      [c.object.meshId, "mesh"],
      [c.object.shaderId, "shader"],
    ] as const) {
      if (!libraryId) continue;
      const ref = await ctx.db
        .query("sceneLibrary")
        .withIndex("by_grid_entry", (q) =>
          q.eq("gridId", room!.gridId!).eq("libraryId", libraryId),
        )
        .unique();
      if (ref?.kind !== kind)
        fail("invalid", "Reference is not in this grid library.");
    }
  }
}
export async function apply(ctx: MutationCtx, p: Doc<"sceneProposals">) {
  await validateChanges(ctx, p.worldId, p.changes);
  const existingRows = await Promise.all(
    p.changes.map((c) =>
      ctx.db
        .query("sceneObjects")
        .withIndex("by_object", (q) =>
          q.eq("worldId", p.worldId).eq("objectId", c.id),
        )
        .unique(),
    ),
  );
  const conflicts = p.changes.flatMap((c, i) =>
    (existingRows[i]?.version ?? 0) === c.expectedVersion
      ? []
      : [
          {
            id: c.id,
            expectedVersion: c.expectedVersion,
            currentVersion: existingRows[i]?.version ?? 0,
          },
        ],
  );
  if (conflicts.length)
    throw new ConvexError({
      code: "conflict",
      message: "Proposal objects changed. Inspect and reconcile.",
      conflicts,
    });
  await validateRenderBudget(ctx,p.worldId,p.changes);
  const deltas = new Map<string, { live: number; allocated: number }>();
  const changed = [];
  for (const [index, c] of p.changes.entries()) {
    const existing = existingRows[index];
    if (!c.object && (!existing || existing.deleted))
      fail("invalid", "Cannot remove absent object.");
    const owner = existing?.owner ?? c.contributorId;
    const delta = deltas.get(owner) ?? { live: 0, allocated: 0 };
    delta.live += (c.object ? 1 : 0) - (existing && !existing.deleted ? 1 : 0);
    delta.allocated += existing ? 0 : 1;
    deltas.set(owner, delta);
    const version = c.expectedVersion + 1,
      fields = {
        worldId: p.worldId,
        objectId: c.id,
        owner,
        author: existing?.author ?? c.contributorName,
        version,
        region: c.object ? regionOf(c.object.position) : existing!.region,
        deleted: !c.object,
        object: c.object,
      };
    if (existing) await ctx.db.replace(existing._id, fields);
    else await ctx.db.insert("sceneObjects", fields);
    changed.push({ id: c.id, version });
  }
  for (const [id, delta] of deltas) {
    const member = await ctx.db
      .query("sceneAgents")
      .withIndex("by_agent", (q) =>
        q.eq("worldId", p.worldId).eq("agentId", id),
      )
      .unique();
    if (!member) {
      if (delta.allocated)
        fail("forbidden", "Contributor membership is missing.");
      continue;
    }
    if (delta.allocated) {
      const identity = member.cloudSessionId
        ? await ctx.db.get(member.cloudSessionId)
        : null;
      if (member.revoked || !identity || identity.revoked)
        fail("forbidden", "Contributor membership is inactive.");
    }
    if (
      member.liveObjects + delta.live > AGENT_OBJECT_QUOTA ||
      member.objectsAllocated + delta.allocated > 10000
    )
      fail("quota", "Contributor object quota reached.");
    await ctx.db.patch(member._id, {
      liveObjects: member.liveObjects + delta.live,
      objectsAllocated: member.objectsAllocated + delta.allocated,
    });
  }
  return changed;
}

export async function enroll(
  ctx: MutationCtx,
  worldId: string,
  agentId: string,
) {
  const identity = await ctx.db
    .query("cloudSessions")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .unique();
  if (!identity || identity.revoked)
    fail("invalid", "Owner must be a registered agent.");
  const existing = await ctx.db
    .query("sceneAgents")
    .withIndex("by_agent", (q) =>
      q.eq("worldId", worldId).eq("agentId", agentId),
    )
    .unique();
  if (existing) return existing;
  // A non-hash sentinel cannot authenticate; membership replaces it after the first real login.
  const key = await ctx.db.insert("sceneAgents", {
    worldId,
    agentId: identity.agentId,
    name: identity.name,
    tokenHash: `pending:${worldId}:${identity.agentId}`,
    cloudSessionId: identity._id,
    cloudCredentialVersion: identity.credentialVersion ?? 0,
    revoked: false,
    canCurate: false,
    objectsAllocated: 0,
    liveObjects: 0,
    windowStart: 0,
    windowRequests: 0,
    expiresAt: identity.expiresAt,
  });
  return (await ctx.db.get(key))!;
}
