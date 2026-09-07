import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { changeValue, digest, fail, label } from "../scene/model";
import { statusValue } from "./proposalSchema";
import {
  apply,
  enroll,
  editorsValid,
  finish,
  getProposal,
  present,
  readable,
  receipt,
  validateChanges,
  writer,
} from "./proposalHelpers";
const MAX_OPEN_PROPOSALS = 20;
const base = { id: v.string(), token: v.string(), requestId: v.string() },
  revision = { ...base, proposalId: v.string(), expectedRevision: v.number() };
export const create = internalMutation({
  args: {
    ...base,
    title: v.string(),
    changes: v.optional(v.array(changeValue)),
    editors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await writer(ctx, args.id, args.token),
      r = await receipt(ctx, actor, args, "create");
    if (r.old) return r.old.result;
    label(args.title, 120);
    editorsValid(args.editors ?? []);
    await validateChanges(ctx, actor.worldId, args.changes ?? []);
    let openCount = 0;
    for (const status of ["draft", "submitted"] as const) {
      const active = await ctx.db
        .query("sceneProposals")
        .withIndex("by_proposer_status", (q) =>
          q
            .eq("worldId", actor.worldId)
            .eq("proposerId", actor.agentId)
            .eq("status", status),
        )
        .take(MAX_OPEN_PROPOSALS);
      openCount += active.length;
    }
    if (openCount >= MAX_OPEN_PROPOSALS)
      fail("quota", "At most twenty open proposals per agent per room.");
    const proposalId = `proposal-${(await digest(`${actor.worldId}:${actor.agentId}:${args.requestId}`)).slice(0, 40)}`;
    const now = Date.now();
    const key = await ctx.db.insert("sceneProposals", {
      worldId: actor.worldId,
      proposalId,
      proposerId: actor.agentId,
      proposerName: actor.name,
      title: args.title,
      editors: args.editors ?? [],
      revision: 1,
      status: "draft",
      changes: (args.changes ?? []).map((c) => ({
        ...c,
        contributorId: actor.agentId,
        contributorName: actor.name,
      })),
      createdAt: now,
      updatedAt: now,
    });
    const p = (await ctx.db.get(key))!;
    return finish(
      ctx,
      actor,
      args.requestId,
      r.payloadHash,
      present(p),
      "created",
      p,
    );
  },
});
export const edit = internalMutation({
  args: {
    ...revision,
    title: v.optional(v.string()),
    changes: v.optional(v.array(changeValue)),
    removeChanges: v.optional(v.array(v.string())),
    editors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await writer(ctx, args.id, args.token),
      r = await receipt(ctx, actor, args, "edit");
    if (r.old) return r.old.result;
    const p = await getProposal(ctx, actor.worldId, args.proposalId);
    if (p.proposerId !== actor.agentId && !p.editors.includes(actor.agentId))
      fail("forbidden", "Only the proposer or an invited editor may edit.");
    if (args.expectedRevision !== p.revision)
      fail("conflict", "Proposal revision changed.");
    if (p.status === "accepted" || p.status === "withdrawn")
      fail("conflict", "Proposal is terminal.");
    if (args.editors !== undefined) {
      if (p.proposerId !== actor.agentId)
        fail("forbidden", "Only the proposer manages editors.");
      editorsValid(args.editors);
    }
    if (args.title !== undefined) label(args.title, 120);
    if (
      args.title === undefined &&
      args.changes === undefined &&
      args.removeChanges === undefined &&
      args.editors === undefined
    )
      fail("invalid", "Provide proposal edits.");
    if ((args.removeChanges?.length ?? 0) > 20)
      fail("invalid", "Remove at most twenty changes.");
    await validateChanges(ctx, actor.worldId, args.changes ?? []);
    const changes = new Map(p.changes.map((c) => [c.id, c]));
    for (const id of args.removeChanges ?? []) changes.delete(id);
    for (const c of args.changes ?? [])
      changes.set(c.id, {
        ...c,
        contributorId: actor.agentId,
        contributorName: actor.name,
      });
    await validateChanges(ctx, actor.worldId, [...changes.values()]);
    await ctx.db.patch(p._id, {
      title: args.title ?? p.title,
      editors: args.editors ?? p.editors,
      changes: [...changes.values()],
      status: "draft",
      revision: p.revision + 1,
      updatedAt: Date.now(),
    });
    const next = (await ctx.db.get(p._id))!;
    return finish(
      ctx,
      actor,
      args.requestId,
      r.payloadHash,
      present(next),
      "edited",
      next,
    );
  },
});
export const transition = internalMutation({
  args: {
    ...revision,
    action: v.union(
      v.literal("submit"),
      v.literal("request_changes"),
      v.literal("withdraw"),
      v.literal("accept"),
    ),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await writer(ctx, args.id, args.token),
      r = await receipt(ctx, actor, args, "transition");
    if (r.old) return r.old.result;
    const p = await getProposal(ctx, actor.worldId, args.proposalId);
    if (p.revision !== args.expectedRevision)
      fail("conflict", "Proposal revision changed.");
    if (p.status === "accepted" || p.status === "withdrawn")
      fail("conflict", "Proposal is terminal.");
    if (args.message !== undefined) label(args.message, 500);
    const ownerAction =
      args.action === "accept" || args.action === "request_changes";
    if (ownerAction && !actor.canCurate)
      fail("forbidden", "Only a room owner may review proposals.");
    if (!ownerAction && p.proposerId !== actor.agentId)
      fail("forbidden", "Only the proposer may submit or withdraw.");
    if (ownerAction && p.status !== "submitted")
      fail("conflict", "Proposal must be submitted for review.");
    if (args.action === "submit" && (p.status !== "draft" || !p.changes.length))
      fail("invalid", "Submit a draft with changes.");
    const now = Date.now();
    const accepted =
      args.action === "accept"
        ? {
            agentId: actor.agentId,
            name: actor.name,
            revision: p.revision,
            changed: await apply(ctx, p),
            createdAt: now,
          }
        : undefined;
    await ctx.db.patch(p._id, {
      revision: p.revision + 1,
      status:
        args.action === "submit"
          ? "submitted"
          : args.action === "request_changes"
            ? "draft"
            : args.action === "withdraw"
              ? "withdrawn"
              : "accepted",
      updatedAt: now,
      ...(ownerAction
        ? {
            review: {
              agentId: actor.agentId,
              name: actor.name,
              message: args.message ?? "",
              revision: p.revision,
              createdAt: now,
            },
          }
        : {}),
      ...(accepted ? { accepted } : {}),
    });
    if (accepted)
      await ctx.db.insert("sceneActivity", {
        worldId: actor.worldId,
        region: "0:0",
        agentId: actor.agentId,
        author: actor.name,
        message: `Accepted proposal: ${p.title}`,
        requestId: args.requestId,
        createdAt: now,
      });
    const next = (await ctx.db.get(p._id))!;
    return finish(
      ctx,
      actor,
      args.requestId,
      r.payloadHash,
      present(next),
      args.action,
      next,
    );
  },
});
export const get = internalQuery({
  args: {
    id: v.string(),
    token: v.optional(v.string()),
    proposalId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await readable(ctx, args.id, args.token);
    return present(await getProposal(ctx, room.worldId, args.proposalId));
  },
});
export const list = internalQuery({
  args: {
    id: v.string(),
    token: v.optional(v.string()),
    status: v.optional(statusValue),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await readable(ctx, args.id, args.token);
    const query = args.status
      ? ctx.db
          .query("sceneProposals")
          .withIndex("by_status", (q) =>
            q.eq("worldId", room.worldId).eq("status", args.status!),
          )
      : ctx.db
          .query("sceneProposals")
          .withIndex("by_room", (q) => q.eq("worldId", room.worldId));
    const page = await query.order("desc").paginate({
      cursor: args.cursor ?? null,
      numItems: 20,
      maximumRowsRead: 20,
      maximumBytesRead: 256000,
    });
    return { ...page, page: page.page.map(present) };
  },
});
export const feed = internalQuery({
  args: {
    id: v.string(),
    token: v.optional(v.string()),
    after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await readable(ctx, args.id, args.token),
      after = args.after ?? 0;
    if (!Number.isSafeInteger(after) || after < 0)
      fail("invalid", "Invalid feed sequence.");
    const rows = await ctx.db
        .query("sceneProposalEvents")
        .withIndex("by_sequence", (q) =>
          q.eq("worldId", room.worldId).gt("sequence", after),
        )
        .take(51),
      events = rows
        .slice(0, 50)
        .map(({ _id, _creationTime, worldId, ...event }) => event);
    return {
      events,
      nextSequence: events.at(-1)?.sequence ?? after,
      hasMore: rows.length > 50,
    };
  },
});
export const owners = internalQuery({
  args: { id: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const room = await readable(ctx, args.id, args.token),
      rows = await ctx.db
        .query("sceneAgents")
        .withIndex("by_owner", (q) =>
          q
            .eq("worldId", room.worldId)
            .eq("canCurate", true)
            .eq("revoked", false),
        )
        .take(17);
    return {
      version: room.ownerVersion ?? 1,
      owners: rows.map(({ agentId, name }) => ({ agentId, name })),
    };
  },
});
export const setOwner = internalMutation({
  args: {
    ...base,
    expectedVersion: v.number(),
    agentId: v.string(),
    owner: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await writer(ctx, args.id, args.token),
      r = await receipt(ctx, actor, args, "setOwner");
    if (r.old) return r.old.result;
    if (!actor.canCurate)
      fail("forbidden", "Only a room owner may manage owners.");
    const room = await readable(ctx, args.id, args.token);
    if (args.expectedVersion !== (room.ownerVersion ?? 1))
      fail("conflict", "Owner version changed.");
    let target = await ctx.db
      .query("sceneAgents")
      .withIndex("by_agent", (q) =>
        q.eq("worldId", room.worldId).eq("agentId", args.agentId),
      )
      .unique();
    if (args.owner) {
      target = await enroll(ctx, room.worldId, args.agentId);
    }
    if (!target || target.revoked)
      fail("invalid", "Owner must be an active room member.");
    const rows = await ctx.db
      .query("sceneAgents")
      .withIndex("by_owner", (q) =>
        q
          .eq("worldId", room.worldId)
          .eq("canCurate", true)
          .eq("revoked", false),
      )
      .take(17);
    if (!args.owner && target.canCurate && rows.length <= 1)
      fail("forbidden", "Cannot remove the last room owner.");
    if (args.owner && !target.canCurate && rows.length >= 16)
      fail("quota", "At most sixteen room owners.");
    await ctx.db.patch(target._id, { canCurate: args.owner });
    const version = (room.ownerVersion ?? 1) + 1;
    await ctx.db.patch(room._id, { ownerVersion: version });
    return finish(
      ctx,
      actor,
      args.requestId,
      r.payloadHash,
      { version, agentId: target.agentId, owner: args.owner },
      "owner_changed",
    );
  },
});

// Deployment operators may assign an initial owner to seed rooms. Never expose through HTTP.
export const assignInitialOwner = internalMutation({
  args: { id: v.string(), agentId: v.string(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const room = await readable(ctx, args.id);
    if ((room.ownerVersion ?? 1) !== args.expectedVersion)
      fail("conflict", "Owner version changed.");
    const existing = await ctx.db
      .query("sceneAgents")
      .withIndex("by_owner", (q) =>
        q
          .eq("worldId", room.worldId)
          .eq("canCurate", true)
          .eq("revoked", false),
      )
      .take(1);
    if (existing.length) fail("forbidden", "Room already has an owner.");
    const target = await enroll(ctx, room.worldId, args.agentId);
    if (target.revoked) fail("forbidden", "Agent membership is revoked.");
    const version = (room.ownerVersion ?? 1) + 1,
      sequence = (room.proposalSequence ?? 0) + 1;
    await ctx.db.patch(target._id, { canCurate: true });
    await ctx.db.patch(room._id, {
      ownerVersion: version,
      proposalSequence: sequence,
    });
    await ctx.db.insert("sceneProposalEvents", {
      worldId: room.worldId,
      sequence,
      type: "initial_owner_assigned",
      agentId: target.agentId,
      name: target.name,
      createdAt: Date.now(),
    });
    return { version, agentId: target.agentId, owner: true };
  },
});
