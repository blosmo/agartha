import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { BLENDER_BILLING, quoteBlenderSession, settleBlenderSession, worstCaseBlenderCostNanoUsd } from "../../packages/protocol/src/blenderBilling";
import { assertCents, getOrCreateWallet, requireBillingOwner, session } from "./common";
import { digest } from "../scene/model";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CALL_WINDOW_MS = 60 * 1000;
const GLOBAL_BUDGET_KEY = "global";

function identifier(value: string, name: string) {
  if (!value || value.length > 128) throw new Error(`${name} must be non-empty and at most 128 characters.`);
}

async function validateResumeProject(ctx: MutationCtx, agentId: string, livemode: boolean, projectId: string) {
  const project = await ctx.db.query("blenderProjects").withIndex("by_project", q => q.eq("projectId", projectId)).unique();
  if (!project || project.agentId !== agentId || project.livemode !== livemode) throw new Error("Project is not available to this agent.");
  if ((project.expiresAt !== 0 && project.expiresAt <= Date.now()) || project.purgedAt !== undefined) throw new Error("Project retention has expired.");
}

function assertActivated(agentId: string, livemode: boolean) {
  if (process.env.BLENDER_BILLING_ACTIVE !== "true") throw new Error("Paid Blender billing is not activated.");
  if (livemode) {
    return;
  }
  const allowed = (process.env.BLENDER_TEST_OPERATOR_AGENT_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(agentId)) throw new Error("Test-mode Blender billing is restricted to configured operators.");
}

async function ledger(ctx: MutationCtx, entryId: string, source: string, action: string, owner: string, livemode: boolean, deltaCents: number) {
  if (!deltaCents) return;
  const existing = await ctx.db.query("blenderLedger").withIndex("by_entry", q => q.eq("entryId", entryId)).unique();
  if (!existing) await ctx.db.insert("blenderLedger", { entryId, source, action, owner, livemode, deltaCents, createdAt: Date.now() });
}

async function moveHeldToAvailable(ctx: MutationCtx, agentId: string, livemode: boolean, reservationId: string, amount: number) {
  assertCents(amount, "releaseCents");
  const wallet = await getOrCreateWallet(ctx, agentId, livemode);
  if (wallet.heldCents < amount) throw new Error("Wallet held balance is inconsistent.");
  await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents + amount, heldCents: wallet.heldCents - amount, frozen: wallet.availableCents + amount < 0 || wallet.openDisputes > 0 });
  await ledger(ctx, `reservation:${reservationId}:release`, `reservation:${reservationId}`, "release", agentId, livemode, amount);
}

async function reserveFailureBudget(ctx: MutationCtx, agentId: string, livemode: boolean, reservationId: string, generation: number, cost: number) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const ownerEvents = await ctx.db.query("blenderSessionFailureEvents").withIndex("by_owner_failed_time", q => q.eq("agentId", agentId).eq("livemode", livemode).eq("failed", true).gte("createdAt", cutoff)).take(3);
  if (ownerEvents.length >= BLENDER_BILLING.failedStartsPerAccountPer24h) throw new Error("Failed-start allowance is exhausted.");
  const outstanding = await ctx.db.query("blenderSessionFailureEvents").withIndex("by_state_time", q => q.eq("state", "reserved")).take(8);
  const recentFailures = await ctx.db.query("blenderSessionFailureEvents").withIndex("by_state_time", q => q.eq("state", "failed").gte("createdAt", cutoff)).take(32);
  if (outstanding.length >= 8 || recentFailures.length >= 32) throw new Error("Failed-start budget reconciliation requires operator review.");
  const reservedNanoUsd = [...outstanding, ...recentFailures].reduce((sum, event) => sum + event.costNanoUsd, 0) + cost;
  if (reservedNanoUsd > BLENDER_BILLING.failedStartBudgetNanoUsd) throw new Error("Global failed-start budget is exhausted.");
  await ctx.db.insert("blenderSessionFailureEvents", { eventId: `failure:${reservationId}:${generation}`, reservationId, agentId, livemode, generation, costNanoUsd: cost, failed: false, released: false, state: "reserved", createdAt: now });
}

async function releaseFailureBudget(ctx: MutationCtx, reservationId: string, generation: number) {
  const event = await ctx.db.query("blenderSessionFailureEvents").withIndex("by_event", q => q.eq("eventId", `failure:${reservationId}:${generation}`)).unique();
  if (!event || event.released) return;
  await ctx.db.patch(event._id, { released: true, state: "released" });
}
export async function createQuoteInTransaction(ctx: MutationCtx, args: { token: string; quoteId: string; minutes: number; livemode: boolean; requestId: string; projectId?: string }) {
    const actor = await requireBillingOwner(ctx, args.token); assertActivated(actor.agentId, args.livemode); identifier(args.quoteId, "quoteId"); identifier(args.requestId, "requestId");
    if (args.projectId !== undefined) identifier(args.projectId, "projectId");
    if (args.projectId !== undefined) await validateResumeProject(ctx, actor.agentId, args.livemode, args.projectId);
    const existing = await ctx.db.query("blenderSessionQuotes").withIndex("by_owner_request", q => q.eq("agentId", actor.agentId).eq("livemode", args.livemode).eq("requestId", args.requestId)).unique();
    if (existing) { if (existing.quoteId !== args.quoteId || existing.minutes !== args.minutes || existing.projectId !== args.projectId) throw new Error("Quote request was reused with a different payload."); return existing; }
    const sameId = await ctx.db.query("blenderSessionQuotes").withIndex("by_quote", q => q.eq("quoteId", args.quoteId)).unique();
    if (sameId) throw new Error("Quote ID already exists.");
    const quote = quoteBlenderSession(args.minutes, Date.now());
    const id = await ctx.db.insert("blenderSessionQuotes", { quoteId: args.quoteId, agentId: actor.agentId, livemode: args.livemode, requestId: args.requestId, ...(args.projectId === undefined ? {} : { projectId: args.projectId }), minutes: quote.minutes, reserveCents: quote.reserveCents, pricingVersion: quote.pricingVersion, expiresAt: quote.expiresAt, status: "open", createdAt: Date.now() });
    return (await ctx.db.get(id))!;
}

export const createQuote = internalMutation({
  args: { token: v.string(), quoteId: v.string(), minutes: v.number(), livemode: v.boolean(), requestId: v.string(), projectId: v.optional(v.string()) },
  handler: createQuoteInTransaction,
});

export async function reserveSessionInTransaction(ctx: MutationCtx, args: { token: string; quoteId: string; reservationId: string; requestId: string }) {
    const actor = await requireBillingOwner(ctx, args.token); identifier(args.reservationId, "reservationId"); identifier(args.requestId, "requestId");
    const quote = await ctx.db.query("blenderSessionQuotes").withIndex("by_quote", q => q.eq("quoteId", args.quoteId)).unique();
    if (!quote || quote.agentId !== actor.agentId) throw new Error("Quote not found.");
    if (quote.projectId !== undefined) await validateResumeProject(ctx, actor.agentId, quote.livemode, quote.projectId);
    assertActivated(actor.agentId, quote.livemode);
    const sameId = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (sameId && (sameId.agentId !== actor.agentId || sameId.livemode !== quote.livemode || sameId.quoteId !== args.quoteId || sameId.requestId !== args.requestId)) throw new Error("Reservation ID is already bound to another owner or payload.");
    const prior = await ctx.db.query("blenderSessionReservations").withIndex("by_owner_request", q => q.eq("agentId", actor.agentId).eq("livemode", quote.livemode).eq("requestId", args.requestId)).unique();
    if (prior) { if (prior.reservationId !== args.reservationId || prior.quoteId !== args.quoteId) throw new Error("Reservation request was reused with a different payload."); return prior; }
    if (quote.pricingVersion !== BLENDER_BILLING.pricingVersion) throw new Error("Quote pricing has changed; request a new quote.");
    if (quote.status !== "open" || quote.expiresAt <= Date.now()) throw new Error("Quote is expired or already reserved.");
    const active = await ctx.db.query("blenderSessionReservations").withIndex("by_owner_status", q => q.eq("agentId", actor.agentId).eq("livemode", quote.livemode).eq("status", "reserved")).first();
    const launching = await ctx.db.query("blenderSessionReservations").withIndex("by_owner_status", q => q.eq("agentId", actor.agentId).eq("livemode", quote.livemode).eq("status", "launching")).first();
    const running = await ctx.db.query("blenderSessionReservations").withIndex("by_owner_status", q => q.eq("agentId", actor.agentId).eq("livemode", quote.livemode).eq("status", "running")).first();
    const unknown = await ctx.db.query("blenderSessionReservations").withIndex("by_owner_status", q => q.eq("agentId", actor.agentId).eq("livemode", quote.livemode).eq("status", "unknown")).first();
    if (active || launching || running || unknown) throw new Error("An active Blender reservation already exists.");
    const wallet = await getOrCreateWallet(ctx, actor.agentId, quote.livemode);
    if (wallet.frozen || wallet.availableCents < quote.reserveCents) throw new Error("Insufficient available Blender credits.");
    await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - quote.reserveCents, heldCents: wallet.heldCents + quote.reserveCents });
    await ledger(ctx, `reservation:${args.reservationId}:reserve`, `reservation:${args.reservationId}`, "reserve", actor.agentId, quote.livemode, -quote.reserveCents);
    const id = await ctx.db.insert("blenderSessionReservations", { reservationId: args.reservationId, quoteId: quote.quoteId, agentId: actor.agentId, livemode: quote.livemode, requestId: args.requestId, projectId: quote.projectId ?? args.reservationId, reservedMinutes: quote.minutes, reservedCents: quote.reserveCents, status: "reserved", launchGeneration: 0, retryCount: 0, chargedCents: 0, releasedCents: 0, responseBytesHeld: 0, responseBytesUsed: 0, failureBudgetNanoUsd: 0, stopRequested: false, createdAt: Date.now() });
    await ctx.db.patch(quote._id, { status: "reserved" });
    return (await ctx.db.get(id))!;
}

export const reserveSession = internalMutation({
  args: { token: v.string(), quoteId: v.string(), reservationId: v.string(), requestId: v.string() },
  handler: reserveSessionInTransaction,
});

export const getReservation = internalQuery({
  args: { token: v.string(), reservationId: v.string() },
  handler: async (ctx, args) => { const actor = await requireBillingOwner(ctx, args.token); const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique(); if (!row || row.agentId !== actor.agentId) throw new Error("Reservation not found."); return row; },
});

export const getReservationForBroker = internalQuery({
  args: { reservationId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.reservationId, "reservationId");
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row) throw new Error("Reservation not found.");
    const active = await ctx.db.query("blenderSessionOperations").withIndex("by_reservation_action_state", q => q.eq("reservationId", row.reservationId).eq("action", "operation").eq("state", "claimed")).first();
    return { ...row, ...(active ? { activeOperationDeadline: active.claimDeadline } : {}) };
  },
});

export const claimMonitor = internalMutation({
  args: { reservationId: v.string(), executorId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.executorId, "executorId");
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.status === "settled" || row.status === "failed") return { claimed: false };
    const now = Date.now();
    if (row.monitorExecutorId !== args.executorId && (row.monitorLeaseExpiresAt ?? 0) > now) return { claimed: false };
    await ctx.db.patch(row._id, { monitorExecutorId: args.executorId, monitorLeaseExpiresAt: now + 45_000 });
    return { claimed: true };
  },
});

export const listActiveReservations = internalQuery({
  args: {},
  handler: async ctx => {
    const rows = [];
    for (const status of ["launching", "running", "unknown", "reserved"] as const) rows.push(...await ctx.db.query("blenderSessionReservations").withIndex("by_status", q => q.eq("status", status)).take(5));
    return rows.slice(0, 5);
  },
});

export const claimLaunch = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), operationId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.reservationId, "reservationId"); identifier(args.operationId, "operationId");
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!reservation) throw new Error("Reservation not found.");
    const prior = await ctx.db.query("blenderSessionOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (prior) {
      if (prior.action !== "launch" || prior.reservationId !== reservation.reservationId || prior.generation !== args.launchGeneration) throw new Error("Launch operation was reused with a different payload.");
      return { reservationId: reservation.reservationId, launchGeneration: prior.generation, reused: true };
    }
    if (reservation.status !== "reserved" || args.launchGeneration !== reservation.launchGeneration + 1) throw new Error("Stale launch generation or reservation state.");
    const quote = await ctx.db.query("blenderSessionQuotes").withIndex("by_quote", q => q.eq("quoteId", reservation.quoteId)).unique();
    if (quote?.projectId !== undefined) await validateResumeProject(ctx, reservation.agentId, reservation.livemode, quote.projectId);
    const activeRows = [];
    for (const status of ["launching", "running", "unknown"] as const) activeRows.push(...await ctx.db.query("blenderSessionReservations").withIndex("by_status", q => q.eq("status", status)).take(5));
    const activeLaunches = activeRows.length;
    if (activeLaunches >= BLENDER_BILLING.globalLaunchLimit) throw new Error("Global Blender launch limit reached.");
    const failureCost = worstCaseBlenderCostNanoUsd(reservation.reservedMinutes);
    await reserveFailureBudget(ctx, reservation.agentId, reservation.livemode, reservation.reservationId, args.launchGeneration, failureCost);
    const now = Date.now();
    const workerHash = await digest(`${reservation.reservationId}:${args.launchGeneration}`);
    await ctx.db.patch(reservation._id, { status: "launching", launchGeneration: args.launchGeneration, failureBudgetNanoUsd: failureCost, launchClaimedAt: now, lastActivityAt: now, providerWorkerName: `paid-blender-${workerHash.slice(0, 24)}`, providerWorkerId: undefined, executorId: undefined, startupLeaseExpiresAt: undefined });
    await ctx.db.insert("blenderSessionOperations", { operationId: args.operationId, reservationId: reservation.reservationId, action: "launch", generation: args.launchGeneration, requestId: args.operationId, payloadFingerprint: `${reservation.reservationId}:${args.launchGeneration}`, responseBytes: 0, state: "completed", claimDeadline: now + 120_000, createdAt: now });
    return { reservationId: reservation.reservationId, launchGeneration: args.launchGeneration, reused: false };
  },
});

export const markSessionReady = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), readyAt: v.number() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!reservation || reservation.launchGeneration !== args.launchGeneration || (reservation.status !== "launching" && reservation.status !== "running")) throw new Error("Stale or invalid launch callback.");
    if (!Number.isSafeInteger(args.readyAt) || args.readyAt < 0) throw new Error("readyAt must be a non-negative safe integer.");
    if (reservation.status === "running") { if (reservation.readyAt !== args.readyAt) throw new Error("Conflicting ready callback."); return { reservationId: reservation.reservationId, launchGeneration: args.launchGeneration, readyAt: args.readyAt, reused: true }; }
    await releaseFailureBudget(ctx, reservation.reservationId, args.launchGeneration);
    await ctx.db.patch(reservation._id, { status: "running", readyAt: args.readyAt, failureBudgetNanoUsd: 0, lastActivityAt: Date.now() });
    return { reservationId: reservation.reservationId, launchGeneration: args.launchGeneration, readyAt: args.readyAt, reused: false };
  },
});

export const attachWorker = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), workerId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.workerId, "workerId");
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.launchGeneration !== args.launchGeneration || !["launching", "running", "unknown"].includes(row.status)) throw new Error("Stale worker attachment.");
    if (row.providerWorkerId && row.providerWorkerId !== args.workerId) throw new Error("Worker is already bound to another provider identity.");
    if (!row.providerWorkerId) await ctx.db.patch(row._id, { providerWorkerId: args.workerId, lastActivityAt: Date.now() });
    return { reservationId: row.reservationId, launchGeneration: row.launchGeneration, workerId: args.workerId, reused: Boolean(row.providerWorkerId) };
  },
});

export const claimStartup = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), executorId: v.string() },
  handler: async (ctx, args) => {
    identifier(args.executorId, "executorId");
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.status !== "launching" || row.launchGeneration !== args.launchGeneration || row.launchClaimedAt === undefined) throw new Error("Stale startup claim.");
    const now = Date.now();
    if (now > row.launchClaimedAt + 60_000) return { claimed: false, expired: true, reservationId: row.reservationId };
    if (row.executorId && row.executorId !== args.executorId) return { claimed: false, expired: false, reservationId: row.reservationId };
    if (row.executorId && row.startupLeaseExpiresAt !== undefined && now < row.startupLeaseExpiresAt) return { claimed: true, expired: false, reservationId: row.reservationId, leaseExpiresAt: row.startupLeaseExpiresAt };
    const leaseExpiresAt = Math.min(row.launchClaimedAt + 60_000, now + 70_000);
    await ctx.db.patch(row._id, { executorId: args.executorId, startupLeaseExpiresAt: leaseExpiresAt, lastActivityAt: now });
    return { claimed: true, expired: false, reservationId: row.reservationId, leaseExpiresAt };
  },
});

export const requestStop = internalMutation({
  args: { token: v.string(), reservationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.agentId !== actor.agentId) throw new Error("Reservation not found.");
    if (row.status === "reserved") {
      await moveHeldToAvailable(ctx, row.agentId, row.livemode, row.reservationId, row.reservedCents);
      await ctx.db.patch(row._id, { status: "failed", releasedCents: row.reservedCents, stopRequested: true });
      return { reservationId: row.reservationId, stopRequested: true, cancelled: true };
    }
    if (!["launching", "running", "unknown"].includes(row.status)) throw new Error("Reservation is not stoppable.");
    if (!row.stopRequested) await ctx.db.patch(row._id, { stopRequested: true, lastActivityAt: Date.now() });
    return { reservationId: row.reservationId, stopRequested: true };
  },
});

export const claimShutdown = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), executorId: v.string(), idleOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    identifier(args.executorId, "executorId");
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.launchGeneration !== args.launchGeneration) throw new Error("Stale shutdown claim.");
    if (row.status === "settled" || row.status === "failed") return { claimed: false, terminal: true, reservationId: row.reservationId };
    const now = Date.now();
    if (args.idleOnly) {
      const active = await ctx.db.query("blenderSessionOperations").withIndex("by_reservation_action_state", q => q.eq("reservationId", row.reservationId).eq("action", "operation").eq("state", "claimed")).first();
      const idle = now - (row.lastActivityAt ?? now) >= 60_000;
      if (!idle || (active && now < active.claimDeadline)) return { claimed: false, terminal: false, reservationId: row.reservationId };
    }
    if (row.stopExecutorId && row.stopExecutorId !== args.executorId && (row.stopLeaseExpiresAt ?? 0) > now) return { claimed: false, terminal: false, reservationId: row.reservationId };
    const active = await ctx.db.query("blenderSessionOperations").withIndex("by_reservation_action_state", q => q.eq("reservationId", row.reservationId).eq("action", "operation").eq("state", "claimed")).first();
    const stopLeaseExpiresAt = now + 60_000;
    await ctx.db.patch(row._id, { stopRequested: true, stopExecutorId: args.executorId, stopLeaseExpiresAt });
    return { claimed: true, terminal: false, reservationId: row.reservationId, stopLeaseExpiresAt, checkpointAllowed: !active };
  },
});

export const renewShutdown = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), executorId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!row || row.launchGeneration !== args.launchGeneration || row.stopExecutorId !== args.executorId || row.status === "settled" || row.status === "failed") throw new Error("Shutdown executor has changed.");
    await ctx.db.patch(row._id, { stopLeaseExpiresAt: Date.now() + 60_000 });
    return { renewed: true };
  },
});

export const recordLaunchFailure = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!reservation || (reservation.status !== "launching" && reservation.status !== "unknown") || reservation.launchGeneration !== args.launchGeneration || (reservation.status === "unknown" && reservation.readyAt !== undefined)) {
      if (reservation?.status === "failed" && reservation.launchGeneration === args.launchGeneration) return { retry: false, reservationId: reservation.reservationId, reused: true };
      throw new Error("Stale or invalid launch failure.");
    }
    const account = await ctx.db.query("blenderSessionFailureAccounts").withIndex("by_owner_mode", q => q.eq("agentId", reservation.agentId).eq("livemode", reservation.livemode)).unique();
    const now = Date.now(); const fresh = !account || now - account.windowStart >= WINDOW_MS; const failedStarts = (fresh ? 0 : account!.failedStarts) + 1;
    const failureEvent = await ctx.db.query("blenderSessionFailureEvents").withIndex("by_event", q => q.eq("eventId", `failure:${reservation.reservationId}:${args.launchGeneration}`)).unique();
    if (!failureEvent || failureEvent.failed) throw new Error("Launch failure was already recorded.");
    await ctx.db.patch(failureEvent._id, { failed: true, state: "failed" });
    if (account) await ctx.db.patch(account._id, { windowStart: fresh ? now : account.windowStart, failedStarts }); else await ctx.db.insert("blenderSessionFailureAccounts", { agentId: reservation.agentId, livemode: reservation.livemode, windowStart: now, failedStarts, reservedNanoUsd: 0 });
    if (reservation.retryCount < 1 && !reservation.stopRequested) { await ctx.db.patch(reservation._id, { status: "reserved", retryCount: reservation.retryCount + 1, providerWorkerName: undefined, providerWorkerId: undefined, executorId: undefined, startupLeaseExpiresAt: undefined }); return { retry: true, reservationId: reservation.reservationId }; }
    await moveHeldToAvailable(ctx, reservation.agentId, reservation.livemode, reservation.reservationId, reservation.reservedCents);
    await ctx.db.patch(reservation._id, { status: "failed", releasedCents: reservation.reservedCents });
    return { retry: false, reservationId: reservation.reservationId, reason: args.reason };
  },
});

export const settleSession = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), terminalState: v.union(v.literal("confirmed"), v.literal("unknown")), stoppedAt: v.number(), startupFailed: v.boolean() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!reservation || reservation.launchGeneration !== args.launchGeneration) throw new Error("Stale settlement callback.");
    if (args.startupFailed) throw new Error("Record startup failures through recordLaunchFailure.");
    if (args.terminalState === "unknown") { if (reservation.status === "settled" || reservation.status === "failed") throw new Error("Reservation is already terminal."); await ctx.db.patch(reservation._id, { status: "unknown" }); return { status: "unknown", reservationId: reservation.reservationId }; }
    if (reservation.status === "settled") return { status: "settled", reservationId: reservation.reservationId, chargedCents: reservation.chargedCents, releasedCents: reservation.releasedCents };
    if (!["running", "unknown", "launching"].includes(reservation.status)) throw new Error("Reservation cannot be settled.");
    if (!Number.isSafeInteger(args.stoppedAt) || args.stoppedAt < 0) throw new Error("stoppedAt must be a non-negative safe integer.");
    const quote = await ctx.db.query("blenderSessionQuotes").withIndex("by_quote", q => q.eq("quoteId", reservation.quoteId)).unique();
    if (!quote || quote.agentId !== reservation.agentId || quote.livemode !== reservation.livemode) throw new Error("Reservation pricing quote is unavailable.");
    const result = settleBlenderSession({ pricingVersion: quote.pricingVersion, reservedMinutes: reservation.reservedMinutes, readyAt: reservation.readyAt ?? null, stoppedAt: args.stoppedAt, startupFailed: args.startupFailed });
    if (result.chargeCents + result.releaseCents !== reservation.reservedCents) throw new Error("Reservation amount does not match its pricing quote.");
    await moveHeldToAvailable(ctx, reservation.agentId, reservation.livemode, reservation.reservationId, result.releaseCents);
    const wallet = await getOrCreateWallet(ctx, reservation.agentId, reservation.livemode);
    if (reservation.reservedCents - result.releaseCents > wallet.heldCents) throw new Error("Wallet held balance is inconsistent.");
    await ctx.db.patch(wallet._id, { heldCents: wallet.heldCents - (reservation.reservedCents - result.releaseCents) });
    const uncertain = await ctx.db.query("blenderSessionOperations").withIndex("by_reservation_action_state", q => q.eq("reservationId", reservation.reservationId).eq("action", "operation").eq("state", "claimed")).take(2);
    if (uncertain.length > 1) throw new Error("Concurrent operation state requires reconciliation.");
    let uncertainBytes = 0;
    for (const operation of uncertain) {
      uncertainBytes += operation.responseBytes;
      await ctx.db.patch(operation._id, { state: "failed", actualResponseBytes: operation.responseBytes, error: "Worker terminated before operation completion was confirmed." });
    }
    await ctx.db.patch(reservation._id, { status: "settled", stoppedAt: args.stoppedAt, chargedCents: result.chargeCents, releasedCents: result.releaseCents, responseBytesHeld: reservation.responseBytesHeld - uncertainBytes, responseBytesUsed: reservation.responseBytesUsed + uncertainBytes });
    return { status: "settled", reservationId: reservation.reservationId, chargedCents: result.chargeCents, releasedCents: result.releaseCents };
  },
});

export const authorizeOperation = internalMutation({
  args: { reservationId: v.string(), launchGeneration: v.number(), operationId: v.string(), payloadFingerprint: v.string(), responseBytes: v.number() },
  handler: async (ctx, args) => {
    assertCents(args.responseBytes, "responseBytes"); identifier(args.operationId, "operationId");
    if (args.responseBytes > BLENDER_BILLING.responseBytes) throw new Error("Response exceeds reservation limit.");
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", args.reservationId)).unique();
    if (!reservation || reservation.status !== "running" || reservation.stopRequested || reservation.launchGeneration !== args.launchGeneration) throw new Error("Operation is not authorized for this session.");
    const prior = await ctx.db.query("blenderSessionOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (prior) { if (prior.action !== "operation" || prior.reservationId !== reservation.reservationId || prior.generation !== args.launchGeneration || prior.responseBytes !== args.responseBytes || prior.payloadFingerprint !== args.payloadFingerprint) throw new Error("Operation request was reused with a different payload."); return { operationId: prior.operationId, responseBytes: prior.responseBytes, reused: true, state: prior.state, resultRef: prior.resultRef }; }
    const now = Date.now(); const window = await ctx.db.query("blenderSessionCallWindows").withIndex("by_reservation", q => q.eq("reservationId", reservation.reservationId)).unique();
    const activeOperation = await ctx.db.query("blenderSessionOperations").withIndex("by_reservation_action_state", q => q.eq("reservationId", reservation.reservationId).eq("action", "operation").eq("state", "claimed")).first();
    if (activeOperation) throw new Error("Another Blender operation is already in flight for this reservation.");
    const fresh = !window || now - window.windowStart >= CALL_WINDOW_MS; const calls = (fresh ? 0 : window!.calls) + 1;
    if (calls > BLENDER_BILLING.callsPerMinute) throw new Error("Blender operation rate limit reached.");
    if (reservation.responseBytesUsed + reservation.responseBytesHeld + args.responseBytes > BLENDER_BILLING.responseBytes) throw new Error("Response byte reservation exhausted.");
    if (window) await ctx.db.patch(window._id, { windowStart: fresh ? now : window.windowStart, calls }); else await ctx.db.insert("blenderSessionCallWindows", { reservationId: reservation.reservationId, windowStart: now, calls });
    await ctx.db.patch(reservation._id, { responseBytesHeld: reservation.responseBytesHeld + args.responseBytes, lastActivityAt: now });
    await ctx.db.insert("blenderSessionOperations", { operationId: args.operationId, reservationId: reservation.reservationId, action: "operation", generation: args.launchGeneration, requestId: args.operationId, payloadFingerprint: args.payloadFingerprint, responseBytes: args.responseBytes, state: "claimed", claimDeadline: now + 120_000, createdAt: now });
    return { operationId: args.operationId, responseBytes: args.responseBytes, reused: false };
  },
});

export const completeOperation = internalMutation({
  args: { operationId: v.string(), actualResponseBytes: v.number(), resultRef: v.optional(v.string()), state: v.union(v.literal("completed"), v.literal("failed")), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertCents(args.actualResponseBytes, "actualResponseBytes");
    const operation = await ctx.db.query("blenderSessionOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique();
    if (!operation || operation.action !== "operation") throw new Error("Operation not found.");
    if (operation.state !== "claimed") { if (operation.state !== args.state || operation.actualResponseBytes !== args.actualResponseBytes || operation.resultRef !== args.resultRef || operation.error !== args.error) throw new Error("Operation completion payload conflicts with prior result."); return { operationId: operation.operationId, reused: true, actualResponseBytes: operation.actualResponseBytes, state: operation.state }; }
    if (args.actualResponseBytes > operation.responseBytes) throw new Error("Actual response exceeds reserved bytes.");
    const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", operation.reservationId)).unique();
    if (!reservation) throw new Error("Reservation not found.");
    await ctx.db.patch(reservation._id, { responseBytesHeld: reservation.responseBytesHeld - operation.responseBytes, responseBytesUsed: reservation.responseBytesUsed + args.actualResponseBytes, lastActivityAt: Date.now() });
    await ctx.db.patch(operation._id, { state: args.state, actualResponseBytes: args.actualResponseBytes, resultRef: args.resultRef, error: args.error });
    return { operationId: operation.operationId, reused: false, actualResponseBytes: args.actualResponseBytes, resultRef: args.resultRef, state: args.state };
  },
});

export const releaseOperationResponse = internalMutation({
  args: { operationId: v.string() },
  handler: async (ctx, args) => { const operation = await ctx.db.query("blenderSessionOperations").withIndex("by_operation", q => q.eq("operationId", args.operationId)).unique(); if (!operation || operation.action !== "operation" || operation.state !== "claimed") return { released: 0 }; const reservation = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", operation.reservationId)).unique(); if (!reservation) throw new Error("Reservation not found."); await ctx.db.patch(reservation._id, { responseBytesHeld: reservation.responseBytesHeld - operation.responseBytes }); await ctx.db.patch(operation._id, { responseBytes: 0, state: "completed", actualResponseBytes: 0 }); return { released: operation.responseBytes }; },
});
