import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { assertCents, getOrCreateWallet, requireBillingOwner } from "./common";
import { createQuoteInTransaction, reserveSessionInTransaction } from "./blenderSessions";

const terminalStatus = v.union(v.literal("completed"), v.literal("partial"), v.literal("failed"), v.literal("cancelled"));
type Job = Doc<"managedJobs">;
function identifier(value: string, name: string, max = 128) { if (!value || value.length > max) throw new Error(`${name} is invalid.`); }
function terminal(row: Job) { return row.status !== "queued" && row.status !== "running"; }
async function job(ctx: QueryCtx | MutationCtx, jobId: string) {
  const row = await ctx.db.query("managedJobs").withIndex("by_job", q => q.eq("jobId", jobId)).unique();
  if (!row) throw new Error("Managed job not found.");
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
  return { ...safe, computeChargedCents: reservation?.chargedCents ?? 0, computeReservedCents: reservation?.reservedCents ?? 65, computeStatus: reservation?.status, chargedCents: row.chargedAiCents + (reservation?.chargedCents ?? 0) };
}
export const createManagedJob = internalMutation({
  args: { token: v.string(), jobId: v.string(), requestId: v.string(), brief: v.string(), budgetCents: v.number(), livemode: v.boolean() },
  handler: async (ctx, args) => {
    identifier(args.jobId, "jobId", 80); identifier(args.requestId, "requestId");
    if (!args.brief.trim() || new TextEncoder().encode(args.brief).length > 4000) throw new Error("Brief must contain 1 to 4000 UTF-8 bytes.");
    assertCents(args.budgetCents, "budgetCents");
    if (args.budgetCents < 100 || args.budgetCents > 2000) throw new Error("Budget must be 100 to 2000 cents.");
    const actor = await requireBillingOwner(ctx, args.token);
    const prior = await ctx.db.query("managedJobs").withIndex("by_owner_request", q => q.eq("agentId", actor.agentId).eq("livemode", args.livemode).eq("requestId", args.requestId)).unique();
    if (prior) { if (prior.jobId !== args.jobId || prior.brief !== args.brief || prior.budgetCents !== args.budgetCents) throw new Error("Job request reused with different payload."); return sanitized(ctx, prior); }
    if (await ctx.db.query("managedJobs").withIndex("by_job", q => q.eq("jobId", args.jobId)).unique()) throw new Error("Job ID already exists.");
    const reservationId = `managed-${args.jobId}`;
    const quote = await createQuoteInTransaction(ctx, { token: args.token, quoteId: reservationId, requestId: reservationId, minutes: 10, livemode: args.livemode });
    if (quote.reserveCents !== 65) throw new Error("Managed compute pricing requires review.");
    await reserveSessionInTransaction(ctx, { token: args.token, quoteId: reservationId, reservationId, requestId: reservationId });
    const ai = args.budgetCents - quote.reserveCents;
    const wallet = await getOrCreateWallet(ctx, actor.agentId, args.livemode);
    if (wallet.frozen || wallet.availableCents < ai) throw new Error("Insufficient available Blender credits.");
    await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - ai, heldCents: wallet.heldCents + ai });
    const now = Date.now();
    const id = await ctx.db.insert("managedJobs", { jobId: args.jobId, requestId: args.requestId, agentId: actor.agentId, livemode: args.livemode, brief: args.brief, budgetCents: args.budgetCents, reservationId, status: "queued", cancelled: false, progress: "Queued", reservedAiCents: ai, chargedAiCents: 0, pendingAiCents: 0, releasedAiCents: 0, visuallyInspected: false, createdAt: now, updatedAt: now, deadlineAt: now + 20 * 60_000 });
    const row = (await ctx.db.get(id))!;
    await entry(ctx, row, "reserve", "reserve", -ai);
    return sanitized(ctx, row);
  },
});
export const getManagedJob = internalQuery({ args: { token: v.string(), jobId: v.string() }, handler: async (ctx, args) => { const actor = await requireBillingOwner(ctx, args.token); const row = await job(ctx, args.jobId); if (row.agentId !== actor.agentId) throw new Error("Managed job not found."); return sanitized(ctx, row); } });
export const getManagedJobForBroker = internalQuery({ args: { jobId: v.string() }, handler: async (ctx, args) => job(ctx, args.jobId) });
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
export const requestManagedCancel = internalMutation({ args: { token: v.string(), jobId: v.string() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token); const row = await job(ctx, args.jobId);
  if (row.agentId !== actor.agentId) throw new Error("Managed job not found.");
  if (!terminal(row)) { await ctx.db.patch(row._id, { cancelled: true }); await finish(ctx, { ...row, cancelled: true }, "cancelled", "Cancelled", row.visuallyInspected); }
  return sanitized(ctx, await job(ctx, args.jobId));
} });
export const claimManagedInference = internalMutation({ args: { jobId: v.string(), executorId: v.string(), operationId: v.string(), maxCostCents: v.number(), payloadFingerprint: v.string() }, handler: async (ctx, args) => {
  identifier(args.operationId, "operationId"); identifier(args.payloadFingerprint, "payloadFingerprint"); assertCents(args.maxCostCents, "maxCostCents");
  if (!args.maxCostCents) throw new Error("Inference requires a positive reservation.");
  const row = await job(ctx, args.jobId);
  if (row.executorId !== args.executorId) throw new Error("Stale executor.");
  const prior = await ctx.db.query("managedInferenceOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
  if (prior) { if (prior.jobId !== row.jobId || prior.executorId !== args.executorId || prior.payloadFingerprint !== args.payloadFingerprint || prior.maxCostCents !== args.maxCostCents) throw new Error("Inference operation reused with different payload."); return { claimed: false, state: prior.state }; }
  const wallet = await getOrCreateWallet(ctx, row.agentId, row.livemode);
  if (row.status !== "running" || row.cancelled || row.deadlineAt <= Date.now() || wallet.frozen) throw new Error("Inference is not authorized.");
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
  await ctx.db.patch(row._id, { chargedAiCents: row.chargedAiCents + args.chargeCents, pendingAiCents: 0, releasedAiCents: row.releasedAiCents + refund, updatedAt: Date.now() });
  await ctx.db.patch(op._id, { state: "completed", chargeCents: args.chargeCents, completedAt: Date.now() });
  return { state: "completed", reused: false, chargeCents: args.chargeCents };
} });
export const finishManagedJob = internalMutation({ args: { jobId: v.string(), executorId: v.string(), status: terminalStatus, progress: v.string(), visuallyInspected: v.boolean(), artifactsReady: v.optional(v.boolean()) }, handler: async (ctx, args) => { const row = await job(ctx, args.jobId); if (row.executorId !== args.executorId) throw new Error("Stale executor."); if (args.progress.length > 1000) throw new Error("Progress exceeds 1000 characters."); await ctx.db.patch(row._id, { ...(args.artifactsReady === undefined ? {} : { artifactsReady: args.artifactsReady }), visuallyInspected: args.visuallyInspected }); return finish(ctx, await job(ctx, args.jobId), args.status, args.progress, args.visuallyInspected); } });
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
    await ctx.db.patch(row._id, { artifactsReady: true, visuallyInspected: false, updatedAt: Date.now() });
    return { artifactsReady: true, visuallyInspected: false };
  },
});
