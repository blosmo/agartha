import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireBillingOwner } from "./common";

export const PROJECT_MAX_BYTES = 256_000_000;
export const OWNER_MAX_BYTES = 1_073_741_824;
export const PROJECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function identifier(value: string, name: string) {
  if (!value || value.length > 256) throw new Error(`${name} must be non-empty and at most 256 characters.`);
}

function byteCount(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer.`);
  return value;
}

async function project(ctx: QueryCtx | MutationCtx, projectId: string) {
  return ctx.db.query("blenderProjects").withIndex("by_project", q => q.eq("projectId", projectId)).unique();
}

async function activeReservation(ctx: QueryCtx | MutationCtx, sessionId: string, generation: number) {
  const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", sessionId)).unique();
  if (!reservation || reservation.launchGeneration !== generation || !["launching", "running"].includes(reservation.status)) throw new Error("Artifact requires an active paid Blender reservation.");
  return reservation;
}

async function ownerTotals(ctx: MutationCtx, agentId: string, livemode: boolean) {
  const [versions, held] = await Promise.all([
    ctx.db.query("blenderProjectVersions").withIndex("by_owner_mode_deleted", q => q.eq("agentId", agentId).eq("livemode", livemode)).take(513),
    ctx.db.query("blenderArtifactReservations").withIndex("by_owner_mode_status", q => q.eq("agentId", agentId).eq("livemode", livemode).eq("status", "held")).take(513),
  ]);
  if (versions.length > 512 || held.length > 512) throw new Error("Project storage accounting exceeded its bounded query limit.");
  const projects = await ctx.db.query("blenderProjects").withIndex("by_owner_mode", q => q.eq("agentId", agentId).eq("livemode", livemode)).take(513);
  if (projects.length > 512) throw new Error("Project storage accounting exceeded its bounded query limit.");
  const ownedIds = new Set(projects.map(row => row.projectId));
  return {
    storedBytes: versions.filter(row => ownedIds.has(row.projectId) && row.deletedAt === undefined).reduce((sum, row) => sum + row.bytes, 0),
    heldBytes: held.reduce((sum, row) => sum + row.maxBytes, 0),
    heldForProject: (projectId: string) => held.filter(row => row.projectId === projectId).reduce((sum, row) => sum + row.maxBytes, 0),
  };
}

async function hasActiveProjectReservation(ctx: QueryCtx | MutationCtx, projectId: string) {
  const rows = await Promise.all(["reserved", "launching", "running", "unknown"].map(status => ctx.db.query("blenderSessionReservations").withIndex("by_project_status", q => q.eq("projectId", projectId).eq("status", status as "reserved" | "launching" | "running" | "unknown")).take(2)));
  if (rows.some(page => page.length > 1)) return true;
  return rows.some(page => page.length > 0);
}

export const createProject = internalMutation({
  args: { token: v.string(), projectId: v.string(), title: v.string(), livemode: v.boolean(), requestId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    identifier(args.projectId, "projectId"); identifier(args.requestId, "requestId");
    if (args.title.length > 256) throw new Error("title must be at most 256 characters.");
    const prior = await ctx.db.query("blenderProjects").withIndex("by_owner_request", q => q.eq("agentId", actor.agentId).eq("livemode", args.livemode).eq("requestId", args.requestId)).unique();
    if (prior) {
      if (prior.projectId !== args.projectId || prior.title !== args.title) throw new Error("Project request was reused with a different payload.");
      return prior;
    }
    const sameId = await project(ctx, args.projectId);
    if (sameId) throw new Error("Project ID already exists.");
    const now = Date.now();
    const id = await ctx.db.insert("blenderProjects", { projectId: args.projectId, agentId: actor.agentId, livemode: args.livemode, title: args.title, requestId: args.requestId, storedBytes: 0, currentVersionNumber: 0, nextVersionNumber: 0, lastPaidSessionAt: 0, expiresAt: 0, createdAt: now, updatedAt: now });
    return (await ctx.db.get(id))!;
  },
});

export const getProject = internalQuery({
  args: { token: v.string(), projectId: v.string(), livemode: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    const row = await project(ctx, args.projectId);
    if (!row || row.agentId !== actor.agentId || row.livemode !== args.livemode) throw new Error("Project not found.");
    if (row.expiresAt !== 0 && row.expiresAt <= Date.now()) throw new Error("Project retention has expired.");
    return row;
  },
});

export const getProjectForReservation = internalQuery({
  args: { sessionId: v.string(), sessionGeneration: v.number(), projectId: v.string() },
  handler: async (ctx, args) => {
    const reservation = await activeReservation(ctx, args.sessionId, args.sessionGeneration);
    const row = await project(ctx, args.projectId);
    if (!row || row.agentId !== reservation.agentId || row.livemode !== reservation.livemode || reservation.projectId !== row.projectId) throw new Error("Project is not owned by the paid reservation.");
    if (row.expiresAt !== 0 && row.expiresAt <= Date.now()) throw new Error("Project retention has expired.");
    const version = row.currentVersionId ? await ctx.db.query("blenderProjectVersions").withIndex("by_version", q => q.eq("versionId", row.currentVersionId!)).unique() : null;
    return { project: row, version };
  },
});

export const ensureProjectForReservation = internalMutation({
  args: { sessionId: v.string(), sessionGeneration: v.number() },
  handler: async (ctx, args) => {
    const reservation = await activeReservation(ctx, args.sessionId, args.sessionGeneration);
    const now = Date.now();
    const existing = await project(ctx, reservation.projectId);
    if (existing) {
      if (existing.agentId !== reservation.agentId || existing.livemode !== reservation.livemode) throw new Error("Project is not owned by the paid reservation.");
      if (existing.expiresAt !== 0 && existing.expiresAt <= now) throw new Error("Project retention has expired.");
      if (reservation.status === "running" && existing.expiresAt < now + PROJECT_RETENTION_MS) await ctx.db.patch(existing._id, { lastPaidSessionAt: now, expiresAt: now + PROJECT_RETENTION_MS, updatedAt: now });
      return (await ctx.db.get(existing._id))!;
    }
    const id = await ctx.db.insert("blenderProjects", { projectId: reservation.projectId, agentId: reservation.agentId, livemode: reservation.livemode, title: `Blender project ${reservation.projectId}`, requestId: `session:${reservation.reservationId}`, storedBytes: 0, currentVersionNumber: 0, nextVersionNumber: 0, lastPaidSessionAt: reservation.status === "running" ? now : 0, expiresAt: reservation.status === "running" ? now + PROJECT_RETENTION_MS : 0, createdAt: now, updatedAt: now });
    return (await ctx.db.get(id))!;
  },
});

export const reserveArtifactBytes = internalMutation({
  args: { sessionId: v.string(), sessionGeneration: v.number(), operationId: v.string(), projectId: v.string(), maxBytes: v.number(), versionId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.sessionId, "sessionId"); identifier(args.operationId, "operationId"); identifier(args.projectId, "projectId"); identifier(args.versionId, "versionId");
    byteCount(args.maxBytes, "maxBytes");
    if (args.maxBytes > PROJECT_MAX_BYTES) throw new Error("Project snapshot exceeds the 256,000,000-byte limit.");
    if (!Number.isSafeInteger(args.sessionGeneration) || args.sessionGeneration < 1) throw new Error("sessionGeneration must be a positive safe integer.");
    const prior = await ctx.db.query("blenderArtifactReservations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (prior) {
      if (prior.sessionId !== args.sessionId || prior.sessionGeneration !== args.sessionGeneration || prior.projectId !== args.projectId || prior.maxBytes !== args.maxBytes || prior.versionId !== args.versionId) throw new Error("Artifact operation was reused with a different payload.");
      return prior;
    }
    const paidSession = await activeReservation(ctx, args.sessionId, args.sessionGeneration);
    if (paidSession.status !== "running") throw new Error("Artifact requires a ready paid Blender reservation.");
    const row = await project(ctx, args.projectId);
    if (!row || row.agentId !== paidSession.agentId || row.livemode !== paidSession.livemode || paidSession.projectId !== row.projectId) throw new Error("Project is not owned by the paid reservation.");
    const now = Date.now();
    const totals = await ownerTotals(ctx, paidSession.agentId, paidSession.livemode);
    // Temporary replacement bytes count against the account quota. The current
    // immutable snapshot stays intact until the replacement is committed.
    if (totals.heldForProject(args.projectId) + args.maxBytes > PROJECT_MAX_BYTES) throw new Error("Project snapshot exceeds the 256,000,000-byte limit.");
    if (totals.storedBytes + totals.heldBytes + args.maxBytes > OWNER_MAX_BYTES) throw new Error("Stored project quota is exhausted.");
    const existingVersion = await ctx.db.query("blenderProjectVersions").withIndex("by_version", q => q.eq("versionId", args.versionId)).unique();
    if (existingVersion) throw new Error("Version ID already exists.");
    const versionNumber = row.nextVersionNumber + 1;
    await ctx.db.patch(row._id, { nextVersionNumber: versionNumber, lastPaidSessionAt: now, expiresAt: now + PROJECT_RETENTION_MS, updatedAt: now });
    const id = await ctx.db.insert("blenderArtifactReservations", { operationId: args.operationId, projectId: args.projectId, agentId: paidSession.agentId, livemode: paidSession.livemode, sessionId: args.sessionId, sessionGeneration: args.sessionGeneration, versionId: args.versionId, versionNumber, maxBytes: args.maxBytes, status: "held", createdAt: now });
    return (await ctx.db.get(id))!;
  },
});

export const commitArtifact = internalMutation({
  args: { operationId: v.string(), actualBytes: v.number(), blobRef: v.string(), sha256: v.string() },
  handler: async (ctx, args) => {
    identifier(args.operationId, "operationId"); identifier(args.blobRef, "blobRef"); identifier(args.sha256, "sha256"); byteCount(args.actualBytes, "actualBytes");
    const reservation = await ctx.db.query("blenderArtifactReservations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (!reservation) throw new Error("Artifact reservation not found.");
    if (args.actualBytes > reservation.maxBytes) throw new Error("Committed artifact exceeds its reservation.");
    if (reservation.status === "committed") {
      if (reservation.actualBytes !== args.actualBytes || reservation.blobRef !== args.blobRef || reservation.sha256 !== args.sha256) throw new Error("Artifact commit was already completed with different data.");
      return { reservation, obsoleteVersions: [] };
    }
    if (reservation.status !== "held") throw new Error("Artifact reservation is no longer available.");
    const row = await project(ctx, reservation.projectId);
    if (!row) throw new Error("Project not found.");
    const existing = await ctx.db.query("blenderProjectVersions").withIndex("by_version", q => q.eq("versionId", reservation.versionId)).unique();
    if (existing) throw new Error("Version ID already exists.");
    const now = Date.now();
    const obsolete = await ctx.db.query("blenderProjectVersions").withIndex("by_project_deleted_version", q => q.eq("projectId", reservation.projectId).eq("deletedAt", undefined)).take(513);
    if (obsolete.length > 512) throw new Error("Project version accounting exceeded its bounded query limit.");
    const currentVersionId = reservation.versionNumber > row.currentVersionNumber ? reservation.versionId : row.currentVersionId;
    const obsoleteVersions = obsolete.filter(version => version.deletedAt === undefined && version.versionId !== currentVersionId).map(version => ({ versionId: version.versionId, blobRef: version.blobRef, bytes: version.bytes, deletionToken: version.deletionToken ?? `${args.operationId}:${version.versionId}` }));
    const newVersionId = await ctx.db.insert("blenderProjectVersions", { versionId: reservation.versionId, projectId: reservation.projectId, agentId: reservation.agentId, livemode: reservation.livemode, versionNumber: reservation.versionNumber, bytes: args.actualBytes, blobRef: args.blobRef, sha256: args.sha256, committedAt: now });
    for (const version of obsolete) if (version.deletedAt === undefined && version.versionId !== currentVersionId && version.deletionRequestedAt === undefined) await ctx.db.patch(version._id, { deletionRequestedAt: now, deletionToken: `${args.operationId}:${version.versionId}` });
    if (currentVersionId !== reservation.versionId) await ctx.db.patch(newVersionId, { deletionRequestedAt: now, deletionToken: `${args.operationId}:${reservation.versionId}` });
    if (reservation.versionNumber > row.currentVersionNumber) await ctx.db.patch(row._id, { currentVersionNumber: reservation.versionNumber, currentVersionId: reservation.versionId, storedBytes: args.actualBytes, updatedAt: now });
    await ctx.db.patch(reservation._id, { status: "committed", actualBytes: args.actualBytes, releasedBytes: reservation.maxBytes - args.actualBytes, blobRef: args.blobRef, sha256: args.sha256, completedAt: now });
    return { reservation: (await ctx.db.get(reservation._id))!, obsoleteVersions };
  },
});

export const listArtifactDeletionCandidates = internalQuery({
  args: { projectId: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) throw new Error("limit must be between 1 and 100.");
    const row = await project(ctx, args.projectId);
    if (!row) throw new Error("Project not found.");
    const versions = await ctx.db.query("blenderProjectVersions").withIndex("by_project_deleted_version", q => q.eq("projectId", args.projectId).eq("deletedAt", undefined)).take(101);
    if (versions.length > 100) throw new Error("Project deletion candidates exceeded the bounded query limit.");
    const expired = row.expiresAt !== 0 && row.expiresAt <= Date.now();
    const active = await hasActiveProjectReservation(ctx, args.projectId);
    return versions.filter(version => version.deletedAt === undefined && ((version.deletionRequestedAt !== undefined && version.versionId !== row.currentVersionId) || (expired && !active && version.versionId === row.currentVersionId))).slice(0, args.limit).map(version => ({ versionId: version.versionId, blobRef: version.blobRef, bytes: version.bytes, deletionToken: version.deletionToken ?? `gc:${version.versionId}` }));
  },
});

export const listExpiredProjects = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("blenderProjects").withIndex("by_unpurged_expires", q => q.eq("purgedAt", undefined).gt("expiresAt", 0).lte("expiresAt", Date.now())).paginate({ numItems: 50, cursor: args.cursor ?? null });
    return { page: page.page, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const claimArtifactDeletion = internalMutation({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    const version = await ctx.db.query("blenderProjectVersions").withIndex("by_version", q => q.eq("versionId", args.versionId)).unique();
    if (!version) throw new Error("Artifact version not found.");
    if (version.deletedAt !== undefined) return { versionId: version.versionId, blobRef: version.blobRef, bytes: version.bytes, deletionToken: version.deletionToken ?? `gc:${version.versionId}` };
    const row = await project(ctx, version.projectId);
    if (!row) throw new Error("Project not found.");
    const expiredCurrent = row.currentVersionId === version.versionId && row.expiresAt !== 0 && row.expiresAt <= Date.now();
    if (row.currentVersionId === version.versionId && !expiredCurrent) throw new Error("Current retained artifact cannot be deleted.");
    if (expiredCurrent && await hasActiveProjectReservation(ctx, version.projectId)) throw new Error("Project has an active paid reservation.");
    const now = Date.now();
    const deletionToken = version.deletionToken ?? `gc:${version.versionId}:${now}`;
    if (version.deletionRequestedAt === undefined || version.deletionToken === undefined) await ctx.db.patch(version._id, { deletionRequestedAt: version.deletionRequestedAt ?? now, deletionToken });
    return { versionId: version.versionId, blobRef: version.blobRef, bytes: version.bytes, deletionToken };
  },
});

export const confirmArtifactDeletion = internalMutation({
  args: { versionId: v.string(), deletionToken: v.string() },
  handler: async (ctx, args) => {
    const version = await ctx.db.query("blenderProjectVersions").withIndex("by_version", q => q.eq("versionId", args.versionId)).unique();
    if (!version) throw new Error("Artifact version not found.");
    if (version.deletedAt !== undefined) return { versionId: version.versionId, deleted: true, bytes: version.bytes };
    if (version.deletionToken !== args.deletionToken || version.deletionRequestedAt === undefined) throw new Error("Artifact deletion is not authorized.");
    const row = await project(ctx, version.projectId);
    if (!row) throw new Error("Project not found.");
    if (row.currentVersionId === version.versionId) {
      if (row.expiresAt === 0 || row.expiresAt > Date.now()) throw new Error("Current retained artifact cannot be deleted.");
      if (await hasActiveProjectReservation(ctx, version.projectId)) throw new Error("Project has an active paid reservation.");
    }
    await ctx.db.patch(version._id, { deletedAt: Date.now() });
    if (row.currentVersionId === version.versionId) await ctx.db.patch(row._id, { purgedAt: Date.now(), storedBytes: 0 });
    return { versionId: version.versionId, deleted: true, bytes: version.bytes };
  },
});

export const rollbackArtifact = internalMutation({
  args: { operationId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.operationId, "operationId");
    const reservation = await ctx.db.query("blenderArtifactReservations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (!reservation) throw new Error("Artifact reservation not found.");
    if (reservation.status === "committed") throw new Error("Committed artifact cannot be rolled back.");
    if (reservation.status === "released") return reservation;
    await ctx.db.patch(reservation._id, { status: "released", releasedBytes: reservation.maxBytes, completedAt: Date.now() });
    return (await ctx.db.get(reservation._id))!;
  },
});

export const getArtifactReservation = internalQuery({
  args: { operationId: v.string() },
  handler: async (ctx, args) => ctx.db.query("blenderArtifactReservations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique(),
});
