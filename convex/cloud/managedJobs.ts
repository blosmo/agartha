import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { assertCents, allowanceForJob, fundingBackings, getOrCreateWallet, requireBillingOwner } from "./common";
import { createQuoteInTransaction, reserveSessionInTransaction } from "./blenderSessions";

import {componentSharing} from "./managedJobSchema";

const terminalStatus = v.union(v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"));
type Job = Doc<"managedJobs">;
function identifier(value: string, name: string, max = 128) { if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > max) throw new Error(`${name} is invalid.`); }
function terminal(row: Job) { return row.status !== "queued" && row.status !== "running"; }
async function job(ctx: QueryCtx | MutationCtx, jobId: string) {
  const row = await ctx.db.query("managedJobs").withIndex("by_job", q => q.eq("jobId", jobId)).unique();
  if (!row) throw new ConvexError({ code: "not_found", message: "Managed job not found." });
  return row;
}
async function entry(ctx: MutationCtx, row: Job, suffix: string, action: string, deltaCents: number) {
  if (deltaCents) await ctx.db.insert("blenderLedger", { entryId: `managed:${row.jobId}:${suffix}`, source: `managed:${row.jobId}`, action, owner: row.agentId, livemode: row.livemode, deltaCents, createdAt: Date.now() });
}
async function stopCompute(ctx: MutationCtx, row: Job) {
  const session = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", row.reservationId)).unique();
  if (!session || session.status === "settled" || session.status === "failed") return;
  if (session.status === "reserved") {
    const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
    if (wallet.heldCents < session.reservedCents) throw new Error("Inconsistent held balance.");
    await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents + session.reservedCents, heldCents: wallet.heldCents - session.reservedCents, frozen: wallet.availableCents + session.reservedCents < 0 || wallet.openDisputes > 0 });
    await ctx.db.insert("blenderLedger", { entryId: `reservation:${row.reservationId}:release`, source: `reservation:${row.reservationId}`, action: "release", owner: row.agentId, livemode: row.livemode, deltaCents: session.reservedCents, createdAt: Date.now() });
    await ctx.db.patch(session._id, { status: "failed", releasedCents: session.reservedCents, stopRequested: true });
  } else await ctx.db.patch(session._id, { stopRequested: true, lastActivityAt: Date.now() });
}
async function finish(ctx: MutationCtx, row: Job, status: "completed" | "partial" | "failed" | "cancelled", progress: string, visuallyInspected: boolean) {
  if (progress.length > 1000) throw new Error("Progress exceeds 1000 characters.");
  if (terminal(row)) return row;
  const active = await ctx.db.query("managedInferenceOperations").withIndex("by_job_state", q => q.eq("jobId", row.jobId).eq("state", "claimed")).take(2);
  if (active.length > 1) throw new Error("Concurrent inference requires reconciliation.");
  for (const operation of active) await ctx.db.patch(operation._id, { state: "unresolved" });
  const release = row.reservedAiCents - row.chargedAiCents - row.pendingAiCents - row.releasedAiCents;
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (release < 0 || wallet.heldCents < release) throw new Error("Inconsistent managed hold.");
  await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents + release, heldCents: wallet.heldCents - release, frozen: wallet.availableCents + release < 0 || wallet.openDisputes > 0 });
  await entry(ctx, row, "release", "release", release);
  await ctx.db.patch(row._id, { status: row.cancelled ? "cancelled" : row.pendingAiCents ? "failed" : status, progress, visuallyInspected, releasedAiCents: row.releasedAiCents + release, updatedAt: Date.now(), finishedAt: Date.now() });
  await stopCompute(ctx, row);
  return job(ctx, row.jobId);
}
async function sanitized(ctx: QueryCtx | MutationCtx, row: Job) {
  const { _id, _creationTime, executorId, agentId, ...safe } = row;
  const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", row.reservationId)).unique();
  return { ...safe, computeChargedCents: reservation?.chargedCents ?? 0, computeReservedCents: reservation?.reservedCents ?? (row.referenceMode === "generate" ? 165 : 65), computeStatus: reservation?.status, chargedCents: row.chargedAiCents + (reservation?.chargedCents ?? 0) };
}
export async function createManagedJobInTransaction(ctx: MutationCtx, args: { token: string; jobId: string; requestId: string; brief: string; shareMaterials?: boolean; shareComponents?: { license: "CC0-1.0" | "CC-BY-4.0" | "MIT"; attribution: string }; referenceMode?: "generate" | "none"; budgetCents: number; livemode: boolean }, fundingActorId?: string) {
    identifier(args.jobId, "jobId", 80); identifier(args.requestId, "requestId");
    if (!args.brief.trim() || new TextEncoder().encode(args.brief).length > 4000) throw new Error("Brief must contain 1 to 4000 UTF-8 bytes.");
    assertCents(args.budgetCents, "budgetCents");
    if (args.budgetCents < 100 || args.budgetCents > 2000) throw new Error("Budget must be 100 to 2000 cents.");
    const referenceMode = args.referenceMode ?? "none", shareMaterials = args.shareMaterials ?? false;
    const shareComponents=args.shareComponents?{license:args.shareComponents.license,attribution:args.shareComponents.attribution.trim().normalize('NFC')}:undefined;
    if(shareComponents&&(referenceMode!=="generate"||shareComponents.attribution.length>500||shareComponents.license!=="CC0-1.0"&&!shareComponents.attribution))throw new Error("Component sharing requires reference-guided modeling and bounded license attribution.");
    if (shareMaterials && referenceMode !== "generate") throw new Error("Material contributions require reference-guided modeling.");
    if (referenceMode === "generate" && args.budgetCents < 500) throw new Error("Reference-guided jobs require a budget of at least 500 cents.");
    const authenticated = await requireBillingOwner(ctx, args.token);
    const actor = fundingActorId ? { ...authenticated, agentId: fundingActorId } : authenticated;
    const prior = await ctx.db.query("managedJobs").withIndex("by_owner_request", q => q.eq("agentId", actor.agentId).eq("livemode", args.livemode).eq("requestId", args.requestId)).unique();
    if (prior) { if (prior.jobId !== args.jobId || prior.brief !== args.brief || prior.budgetCents !== args.budgetCents || (prior.referenceMode ?? "none") !== referenceMode || (prior.shareMaterials ?? false) !== shareMaterials || JSON.stringify(prior.shareComponents??null)!==JSON.stringify(shareComponents??null)) throw new Error("Job request reused with different payload."); return sanitized(ctx, prior); }
    if (await ctx.db.query("managedJobs").withIndex("by_job", q => q.eq("jobId", args.jobId)).unique()) throw new Error("Job ID already exists.");
    const reservationId = `managed-${args.jobId}`;
    const quote = await createQuoteInTransaction(ctx, { token: args.token, quoteId: reservationId, requestId: reservationId, minutes: referenceMode === "generate" ? 30 : 10, livemode: args.livemode }, fundingActorId);
    if (quote.reserveCents !== (referenceMode === "generate" ? 165 : 65)) throw new Error("Managed compute pricing requires review.");
    const reservation = await reserveSessionInTransaction(ctx, { token: args.token, quoteId: reservationId, reservationId, requestId: reservationId }, fundingActorId);
    await ctx.db.patch(reservation._id, { deferredStart: true });
    const ai = args.budgetCents - quote.reserveCents;
    const wallet = await getOrCreateWallet(ctx, actor.agentId, args.livemode);
    if (wallet.frozen || wallet.availableCents < ai) throw new Error("Insufficient available Blender credits.");
    await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - ai, heldCents: wallet.heldCents + ai });
    const now = Date.now();
    const id = await ctx.db.insert("managedJobs", { jobId: args.jobId, requestId: args.requestId, agentId: actor.agentId, livemode: args.livemode, brief: args.brief, referenceMode, shareMaterials, ...(shareComponents?{shareComponents}:{}), chargedReferenceCents: 0, budgetCents: args.budgetCents, reservationId, status: "queued", cancelled: false, progress: "Queued", reservedAiCents: ai, chargedAiCents: 0, pendingAiCents: 0, releasedAiCents: 0, visuallyInspected: false, createdAt: now, updatedAt: now, deadlineAt: now + (referenceMode === "generate" ? 45 : 20) * 60_000 });
    const row = (await ctx.db.get(id))!;
    await entry(ctx, row, "reserve", "reserve", -ai);
    return sanitized(ctx, row);

}
export const createManagedJob = internalMutation({
  args: { token: v.string(), jobId: v.string(), requestId: v.string(), brief: v.string(), shareMaterials: v.optional(v.boolean()), shareComponents: v.optional(componentSharing), referenceMode: v.optional(v.union(v.literal("generate"), v.literal("none"))), budgetCents: v.number(), livemode: v.boolean() },
  handler: (ctx, args) => createManagedJobInTransaction(ctx, args),
});

export const getManagedJob = internalQuery({ args: { token: v.string(), jobId: v.string() }, handler: async (ctx, args) => { const actor = await requireBillingOwner(ctx, args.token); const row = await job(ctx, args.jobId); if (row.agentId !== actor.agentId) {
  const allowance = await allowanceForJob(ctx, row.agentId, row.livemode, row.jobId);
  if (allowance && (allowance.sponsorId === actor.agentId || allowance.recipientId === actor.agentId)) return sanitized(ctx, row);
  const pool = await ctx.db.query('playgroundFundingPools').withIndex('by_wallet', q => q.eq('walletOwner', row.agentId)).unique();
  const proposal = pool ? await ctx.db.query('playgroundProjects').withIndex('by_project', q => q.eq('projectId', pool.projectId)).unique() : null;
  const backers = pool ? [...await fundingBackings(ctx, pool.projectId, row.livemode, 'held'), ...await fundingBackings(ctx, pool.projectId, row.livemode, 'settled')] : [];
  if (!pool || pool.jobId !== row.jobId || (proposal?.creatorId !== actor.agentId && !(terminal(row) && backers.some(b => b.agentId === actor.agentId && b.status !== 'withdrawn')))) throw new ConvexError({ code: "not_found", message: "Managed job not found." });
} return sanitized(ctx, row); } });
export const getManagedJobForBroker = internalQuery({ args: { jobId: v.string() }, handler: async (ctx, args) => {
  const row = await job(ctx, args.jobId);
  if (row.agentId.startsWith('playground-allowance-')) {
    const allowance = await allowanceForJob(ctx, row.agentId, row.livemode, row.jobId);
    if (!allowance) throw new Error('Agent allowance authority is unavailable.');
    return { ...row, initiatingAgentId: allowance.recipientId };
  }
  if (!row.agentId.startsWith('playground-pool-')) return row;
  const pool = await ctx.db.query('playgroundFundingPools').withIndex('by_wallet', q => q.eq('walletOwner', row.agentId)).unique();
  const proposal = pool ? await ctx.db.query('playgroundProjects').withIndex('by_project', q => q.eq('projectId', pool.projectId)).unique() : null;
  if (!pool || pool.jobId !== row.jobId || !proposal) throw new Error('Project funding authority is unavailable.');
  return { ...row, initiatingAgentId: proposal.creatorId };
} });
export const listActiveManagedJobs = internalQuery({ args: {}, handler: async ctx => {
  const rows = [...await ctx.db.query("managedJobs").withIndex("by_status", q => q.eq("status", "queued")).take(5), ...await ctx.db.query("managedJobs").withIndex("by_status", q => q.eq("status", "running")).take(5)];
  return rows.sort((a, b) => a.createdAt - b.createdAt).slice(0, 5);
} });
export const claimManagedJob = internalMutation({ args: { jobId: v.string(), executorId: v.string() }, handler: async (ctx, args) => {
  identifier(args.executorId, "executorId"); const row = await job(ctx, args.jobId);
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (row.status !== "queued" || row.cancelled || row.deadlineAt <= Date.now() || wallet.frozen) return { claimed: false };
  await ctx.db.patch(row._id, { status: "running", executorId: args.executorId, progress: "Starting", updatedAt: Date.now() });
  return { claimed: true, job: await job(ctx, args.jobId) };
} });
export async function cancelManagedJobInTransaction(ctx: MutationCtx, jobId: string, agentId: string) {
  const row = await job(ctx, jobId);
  if (row.agentId !== agentId) throw new ConvexError({ code: "not_found", message: "Managed job not found." });
  if (!terminal(row)) { await ctx.db.patch(row._id, { cancelled: true }); await finish(ctx, { ...row, cancelled: true }, "cancelled", "Cancelled", row.visuallyInspected); }
  return sanitized(ctx, await job(ctx, jobId));
}
export const requestManagedCancel = internalMutation({ args: { token: v.string(), jobId: v.string() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const row = await job(ctx, args.jobId);
  const allowance = await allowanceForJob(ctx, row.agentId, row.livemode, row.jobId);
  const allowed = allowance && (allowance.sponsorId === actor.agentId || allowance.recipientId === actor.agentId);
  return cancelManagedJobInTransaction(ctx, args.jobId, allowed ? row.agentId : actor.agentId);
} });
export const claimManagedInference = internalMutation({ args: { jobId: v.string(), executorId: v.string(), operationId: v.string(), maxCostCents: v.number(), payloadFingerprint: v.string(), kind: v.optional(v.union(v.literal("modeling"), v.literal("reference"))) }, handler: async (ctx, args) => {
  identifier(args.operationId, "operationId"); identifier(args.payloadFingerprint, "payloadFingerprint"); assertCents(args.maxCostCents, "maxCostCents");
  if (!args.maxCostCents) throw new Error("Inference requires a positive reservation.");
  const row = await job(ctx, args.jobId);
  if (row.executorId !== args.executorId) throw new Error("Stale executor.");
  const prior = await ctx.db.query("managedInferenceOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
  if (prior) { if (prior.jobId !== row.jobId || prior.executorId !== args.executorId || prior.payloadFingerprint !== args.payloadFingerprint || prior.maxCostCents !== args.maxCostCents || (prior.kind ?? "modeling") !== (args.kind ?? "modeling")) throw new Error("Inference operation reused with different payload."); return { claimed: false, state: prior.state }; }
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (row.status !== "running" || row.cancelled || row.deadlineAt <= Date.now() || wallet.frozen) throw new Error("Inference is not authorized.");
  const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", row.reservationId)).unique();
  if (!reservation || reservation.stopRequested || ["settled", "failed", "unknown"].includes(reservation.status)) throw new Error("Compute is no longer available for this job.");
  if (args.kind === "reference" && (row.referenceMode !== "generate" || row.referenceReady || args.operationId !== `${args.executorId}-reference`)) throw new Error("Reference generation is not available for this job.");
  if (row.pendingAiCents) throw new Error("Another inference is in flight.");
  if (args.maxCostCents > row.reservedAiCents - row.chargedAiCents - row.releasedAiCents) throw new Error("AI budget exhausted.");
  await ctx.db.insert("managedInferenceOperations", { ...args, state: "claimed", createdAt: Date.now() });
  await ctx.db.patch(row._id, { pendingAiCents: args.maxCostCents, updatedAt: Date.now() });
  return { claimed: true, maxCostCents: args.maxCostCents, deadlineAt: row.deadlineAt };
} });
export const completeManagedInference = internalMutation({ args: { jobId: v.string(), executorId: v.string(), operationId: v.string(), chargeCents: v.optional(v.number()), ambiguous: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const row = await job(ctx, args.jobId);
  const op = await ctx.db.query("managedInferenceOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
  if (!op || op.jobId !== row.jobId || op.executorId !== args.executorId || row.executorId !== args.executorId) throw new Error("Stale inference completion.");
  if (args.ambiguous) {
    if (args.chargeCents !== undefined) throw new Error("Ambiguous inference cannot charge estimated usage.");
    if (op.state === "completed") throw new Error("Conflicting inference completion.");
    await ctx.db.patch(op._id, { state: "unresolved" });
    await finish(ctx, row, "failed", "Inference outcome requires reconciliation", row.visuallyInspected);
    return { state: "unresolved", pendingAiCents: row.pendingAiCents };
  }
  if (args.chargeCents === undefined) throw new Error("Known charge required.");
  assertCents(args.chargeCents, "chargeCents");
  if (args.chargeCents > op.maxCostCents) throw new Error("Charge exceeds reserved inference cost.");
  if (op.state === "completed") { if (op.chargeCents !== args.chargeCents) throw new Error("Conflicting inference completion."); return { state: "completed", reused: true }; }
  const refund = terminal(row) ? op.maxCostCents - args.chargeCents : 0;
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (wallet.heldCents < args.chargeCents + refund || row.pendingAiCents !== op.maxCostCents) throw new Error("Inconsistent inference hold.");
  await ctx.db.patch(wallet._id, { heldCents: wallet.heldCents - args.chargeCents - refund, availableCents: wallet.availableCents + refund, frozen: wallet.availableCents + refund < 0 || wallet.openDisputes > 0 });
  await entry(ctx, row, `operation:${op.operationId}:release`, "release", refund);
  // The original reserve debit minus releases equals actual spend; a second charge debit would double-count it.
  await ctx.db.patch(row._id, { chargedAiCents: row.chargedAiCents + args.chargeCents, chargedReferenceCents: (row.chargedReferenceCents ?? 0) + (op.kind === "reference" ? args.chargeCents : 0), pendingAiCents: 0, releasedAiCents: row.releasedAiCents + refund, updatedAt: Date.now() });
  await ctx.db.patch(op._id, { state: "completed", chargeCents: args.chargeCents, completedAt: Date.now() });
  return { state: "completed", reused: false, chargeCents: args.chargeCents };
} });
export const finishManagedJob = internalMutation({
  args: { jobId: v.string(), executorId: v.string(), status: terminalStatus, progress: v.string(), visuallyInspected: v.boolean(), artifactsReady: v.optional(v.boolean()), videoReady: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const row = await job(ctx, args.jobId);
    if (row.executorId !== args.executorId) throw new Error("Stale executor.");
    if (args.progress.length > 1000) throw new Error("Progress exceeds 1000 characters.");
    const artifactsReady = args.artifactsReady ?? row.artifactsReady;
    if ((args.videoReady ?? row.videoReady) && !artifactsReady) throw new Error("A model checkpoint is required before recording video.");
    await ctx.db.patch(row._id, {
      ...(args.artifactsReady === undefined ? {} : { artifactsReady: args.artifactsReady }),
      ...(args.videoReady === undefined ? {} : { videoReady: args.videoReady }),
      visuallyInspected: args.visuallyInspected,
    });
    return finish(ctx, await job(ctx, args.jobId), args.status, args.progress, args.visuallyInspected);
  },
});

export const recoverManagedJob = internalMutation({ args: { jobId: v.string() }, handler: async (ctx, args) => { const row = await job(ctx, args.jobId); if (row.deadlineAt > Date.now()) throw new Error("Managed job deadline has not expired."); return finish(ctx, row, "failed", "Job deadline expired", row.visuallyInspected); } });
export const heartbeatManagedJob = internalMutation({ args: { jobId: v.string(), executorId: v.string(), progress: v.optional(v.string()) }, handler: async (ctx, args) => {
  if (args.progress !== undefined && args.progress.length > 1000) throw new Error("Progress exceeds 1000 characters.");
  const row = await job(ctx, args.jobId);
  if (row.executorId !== args.executorId || row.status !== "running" || row.cancelled || row.deadlineAt <= Date.now()) return { active: false };
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (wallet.frozen) return { active: false };
  const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", row.reservationId)).unique();
  if (!reservation || reservation.stopRequested || reservation.status === "settled" || reservation.status === "failed") return { active: false };
  await ctx.db.patch(reservation._id, { lastActivityAt: Date.now() });
  await ctx.db.patch(row._id, { updatedAt: Date.now(), ...(args.progress === undefined ? {} : { progress: args.progress }) });
  return { active: true };
} });

// A durable checkpoint is independent of financial settlement. Recovery may record
// a confirmed file save after the job became terminal, but cannot reopen the job.
export const recordManagedCheckpoint = internalMutation({
  args: { jobId: v.string(), executorId: v.string() },
  handler: async (ctx, args) => {
    const row = await job(ctx, args.jobId);
    if (!row.executorId || row.executorId !== args.executorId) throw new Error("Stale executor.");
    await ctx.db.patch(row._id, { artifactsReady: true, videoReady: false, visuallyInspected: false, updatedAt: Date.now() });
    return { artifactsReady: true, visuallyInspected: false };
  },
});

// Video delivery changes artifact metadata only; compute remains on its session ledger.
export const recordManagedVideo = internalMutation({
  args: { jobId: v.string(), executorId: v.string() },
  handler: async (ctx, args) => {
    const row = await job(ctx, args.jobId);
    if (!row.executorId || row.executorId !== args.executorId) throw new Error("Stale executor.");
    if (!row.artifactsReady) throw new Error("A model checkpoint is required before recording video.");
    await ctx.db.patch(row._id, { videoReady: true, updatedAt: Date.now() });
    return { videoReady: true };
  },
});

export const recordManagedReference = internalMutation({
  args: { jobId: v.string(), executorId: v.string() },
  handler: async (ctx, args) => {
    const row = await job(ctx, args.jobId);
    if (row.executorId !== args.executorId || row.referenceMode !== "generate") throw new Error("Reference job ownership mismatch.");
    await ctx.db.patch(row._id, { referenceReady: true, updatedAt: Date.now() });
    return { referenceReady: true };
  },
});

export const recordManagedAcceptance = internalMutation({
  args: { jobId: v.string(), executorId: v.string() },
  handler: async (ctx, args) => {
    const row = await job(ctx, args.jobId);
    if (row.executorId !== args.executorId || row.referenceMode !== "generate" || !row.artifactsReady) throw new Error("A reference-guided checkpoint is required.");
    await ctx.db.patch(row._id, { visuallyInspected: true, updatedAt: Date.now() });
    return { visuallyInspected: true };
  },
});
