import { internalMutation, internalQuery } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { assertCents, getOrCreateWallet, requireBillingOwner, limit } from "./common";
import type { MutationCtx } from "../_generated/server";

const PURCHASE_AMOUNTS = new Set([500, 2_000]);
const PURCHASE_TTL_MS = 24 * 60 * 60 * 1000;

function requireCurrency(currency: string) {
  if (currency !== "usd") throw new Error("Only USD purchases are supported.");
}

function requireIdentifier(value: string, name: string) {
  if (!value || value.length > 128) throw new Error(`${name} must be non-empty and at most 128 characters.`);
}

async function ledger(ctx: MutationCtx, entryId: string, source: string, action: string, owner: string, livemode: boolean, deltaCents: number) {
  if (deltaCents === 0) return;
  const existing = await ctx.db.query("blenderLedger").withIndex("by_entry", q => q.eq("entryId", entryId)).unique();
  if (existing) return;
  await ctx.db.insert("blenderLedger", { entryId, source, action, owner, livemode, deltaCents, createdAt: Date.now() });
}

async function refreshWallet(ctx: MutationCtx, wallet: { _id: any; availableCents: number; heldCents: number; openDisputes: number; frozen: boolean }, deltaCents: number, openDisputeDelta = 0) {
  const availableCents = wallet.availableCents + deltaCents;
  const openDisputes = wallet.openDisputes + openDisputeDelta;
  if (!Number.isSafeInteger(availableCents) || availableCents < -Number.MAX_SAFE_INTEGER || openDisputes < 0 || !Number.isSafeInteger(openDisputes)) throw new Error("Invalid wallet state.");
  const frozen = availableCents < 0 || openDisputes > 0;
  await ctx.db.patch(wallet._id, { availableCents, openDisputes, frozen });
}

export const balance = internalQuery({
  args: { token: v.string(), livemode: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    const wallet = await ctx.db.query("blenderWallets").withIndex("by_agent_mode", q => q.eq("agentId", actor.agentId).eq("livemode", args.livemode)).unique();
    return wallet ? { agentId: actor.agentId, livemode: args.livemode, availableCents: wallet.availableCents, heldCents: wallet.heldCents, frozen: wallet.frozen, openDisputes: wallet.openDisputes } : { agentId: actor.agentId, livemode: args.livemode, availableCents: 0, heldCents: 0, frozen: false, openDisputes: 0 };
  },
});

export const getPurchase = internalQuery({
  args: { token: v.string(), purchaseId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    const purchase = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique();
    if (!purchase || purchase.agentId !== actor.agentId) throw new Error("Purchase not found.");
    return purchase;
  },
});

// Payment service only: this is never exposed through an owner-authenticated route.
export const getPurchaseForPayment = internalQuery({
  args: { purchaseId: v.string() },
  handler: async (ctx, args) => ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique(),
});

export const createPurchase = internalMutation({
  args: { token: v.string(), purchaseId: v.string(), amountCents: v.number(), livemode: v.boolean(), paymentRail: v.union(v.literal("checkout"), v.literal("mpp")), requestId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    assertCents(args.amountCents, "amountCents");
    if (!PURCHASE_AMOUNTS.has(args.amountCents)) throw new Error("Purchase amount must be 500 or 2000 cents.");
    requireIdentifier(args.purchaseId, "purchaseId"); requireIdentifier(args.requestId, "requestId");
    const existingRequest = await ctx.db.query("blenderPurchases").withIndex("by_owner_idempotency", q => q.eq("agentId", actor.agentId).eq("idempotencyKey", args.requestId)).unique();
    if (existingRequest) {
      if (existingRequest.expiresAt <= Date.now() && existingRequest.status === "pending") throw new Error("Purchase has expired; create a new purchase ID.");
      if (existingRequest.purchaseId !== args.purchaseId || existingRequest.amountCents !== args.amountCents || existingRequest.livemode !== args.livemode || existingRequest.paymentRail !== args.paymentRail) throw new Error("Idempotency key was reused with a different purchase payload.");
      return existingRequest;
    }
    const existingId = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique();
    if (existingId && existingId.agentId !== actor.agentId) throw new Error("Purchase belongs to another agent.");
    if (existingId) throw new Error("Purchase ID already exists.");
    await limit(ctx, `blender-purchase:${actor.agentId}`, 20, 3_600_000);
    const now = Date.now();
    const id = await ctx.db.insert("blenderPurchases", { purchaseId: args.purchaseId, agentId: actor.agentId, amountCents: args.amountCents, currency: "usd", livemode: args.livemode, paymentRail: args.paymentRail, idempotencyKey: args.requestId, status: "pending", createdAt: now, expiresAt: now + PURCHASE_TTL_MS });
    return (await ctx.db.get(id))!;
  },
});

export const authorizePaymentAttempt = internalMutation({
  args: { token: v.string(), purchaseId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBillingOwner(ctx, args.token);
    const purchase = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique();
    if (!purchase || purchase.agentId !== actor.agentId) throw new Error("Purchase not found.");
    await limit(ctx, `blender-payment:${actor.agentId}`, 10, 60_000);
    return { authorized: true };
  },
});

export const attachCheckoutSession = internalMutation({
  args: { purchaseId: v.string(), checkoutSessionId: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique();
    if (!purchase) throw new Error("Purchase not found.");
    if (purchase.paymentRail !== "checkout") throw new Error("Checkout session requires a checkout purchase.");
    if (purchase.status === "pending" && purchase.expiresAt <= Date.now()) throw new Error("Purchase has expired; create a new purchase ID.");
    if (purchase.checkoutSessionId && purchase.checkoutSessionId !== args.checkoutSessionId) throw new Error("Purchase is already bound to another checkout session.");
    if (purchase.expiresAt <= Date.now() && purchase.status === "pending") throw new Error("Purchase has expired.");
    if (!purchase.checkoutSessionId) await ctx.db.patch(purchase._id, { checkoutSessionId: args.checkoutSessionId });
    return { purchaseId: args.purchaseId, checkoutSessionId: args.checkoutSessionId };
  },
});

export const beginPaymentReconciliation = internalMutation({
  args: { paymentId: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    requireIdentifier(args.paymentId, "paymentId"); requireIdentifier(args.eventId, "eventId");
    const prior = await ctx.db.query("blenderPaymentEvents").withIndex("by_payment_event", q => q.eq("paymentId", args.paymentId).eq("eventId", args.eventId)).unique();
    if (prior) return { generation: prior.generation };
    const latest = await ctx.db.query("blenderPaymentEvents").withIndex("by_payment_generation", q => q.eq("paymentId", args.paymentId)).order("desc").first();
    const generation = (latest?.generation ?? 0) + 1;
    await ctx.db.insert("blenderPaymentEvents", { paymentId: args.paymentId, eventId: args.eventId, generation, createdAt: Date.now() });
    const payment = await ctx.db.query("blenderPayments").withIndex("by_payment", q => q.eq("paymentId", args.paymentId)).unique();
    if (payment) await ctx.db.patch(payment._id, { reconcileGeneration: generation });
    return { generation };
  },
});

export const fulfillPurchase = internalMutation({
  args: { purchaseId: v.string(), paymentId: v.string(), generation: v.number(), amountCents: v.number(), currency: v.string(), livemode: v.boolean(), paid: v.boolean(), refundedCents: v.number(), disputedCents: v.number(), disputeOpen: v.boolean() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", args.purchaseId)).unique();
    if (!purchase) throw new Error("Purchase not found.");
    requireIdentifier(args.paymentId, "paymentId");
    assertCents(args.amountCents, "amountCents"); assertCents(args.refundedCents, "refundedCents"); assertCents(args.disputedCents, "disputedCents"); requireCurrency(args.currency);
    if (!Number.isSafeInteger(args.generation) || args.generation < 1) throw new Error("generation must be a positive safe integer.");
    if (args.amountCents !== purchase.amountCents || args.livemode !== purchase.livemode) throw new Error("Payment does not match purchase amount or mode.");
    if (purchase.paymentId && purchase.paymentId !== args.paymentId) throw new Error("Purchase is already bound to another payment.");
    const existingPayment = await ctx.db.query("blenderPayments").withIndex("by_payment", q => q.eq("paymentId", args.paymentId)).unique();
    if (existingPayment && (existingPayment.purchaseId !== purchase.purchaseId || existingPayment.livemode !== purchase.livemode)) throw new Error("Payment is already bound to another purchase or mode.");
    const latestEvent = await ctx.db.query("blenderPaymentEvents").withIndex("by_payment_generation", q => q.eq("paymentId", args.paymentId)).order("desc").first();
    const event = await ctx.db.query("blenderPaymentEvents").withIndex("by_payment_generation", q => q.eq("paymentId", args.paymentId).eq("generation", args.generation)).unique();
    if (!event || !latestEvent || latestEvent.generation !== args.generation) throw new ConvexError({ code: "stale_generation", message: "Stale payment reconciliation generation." });
    const fingerprint = JSON.stringify({ kind: "fulfill", amountCents: args.amountCents, currency: args.currency, livemode: args.livemode, paid: args.paid, refundedCents: args.refundedCents, disputedCents: args.disputedCents, disputeOpen: args.disputeOpen });
    if (event.committedFingerprint) {
      if (event.committedFingerprint !== fingerprint) throw new Error("Reconciliation generation already committed with a different state.");
      const current = await ctx.db.query("blenderPayments").withIndex("by_payment", q => q.eq("paymentId", args.paymentId)).unique();
      return { purchaseId: purchase.purchaseId, paymentId: args.paymentId, creditedCents: current?.creditedCents ?? 0, reversedCents: current?.reversedCents ?? 0, reconcileGeneration: args.generation };
    }
    const payment = existingPayment ?? { paymentId: args.paymentId, purchaseId: purchase.purchaseId, amountCents: purchase.amountCents, creditedCents: 0, reversedCents: 0, reconcileGeneration: args.generation, openDispute: false, wasPaid: false, livemode: purchase.livemode };
    if (payment.amountCents !== args.amountCents) throw new Error("Payment amount cannot change.");
    const targetReversed = Math.min(payment.amountCents, args.refundedCents + args.disputedCents);
    const targetCredited = args.paid ? payment.amountCents - targetReversed : 0;
    const creditDelta = targetCredited - payment.creditedCents;
    const disputeDelta = args.disputeOpen === payment.openDispute ? 0 : args.disputeOpen ? 1 : -1;
    const wallet = await getOrCreateWallet(ctx, purchase.agentId, purchase.livemode);
    if (creditDelta) { await refreshWallet(ctx, wallet, creditDelta, disputeDelta); await ledger(ctx, `payment:${args.paymentId}:${args.generation}:credit`, `payment:${args.paymentId}`, "credit", purchase.agentId, purchase.livemode, creditDelta); }
    else if (disputeDelta) { await refreshWallet(ctx, wallet, 0, disputeDelta); }
    if (existingPayment) await ctx.db.patch(existingPayment._id, { creditedCents: targetCredited, reversedCents: targetReversed, openDispute: args.disputeOpen, wasPaid: args.paid, reconcileGeneration: args.generation });
    else await ctx.db.insert("blenderPayments", { ...payment, creditedCents: targetCredited, reversedCents: targetReversed, openDispute: args.disputeOpen, wasPaid: args.paid });
    await ctx.db.patch(purchase._id, { paymentId: args.paymentId, status: args.paid ? targetReversed === payment.amountCents ? "reversed" : "paid" : "failed" });
    await ctx.db.patch(event._id, { committedFingerprint: fingerprint });
    return { purchaseId: purchase.purchaseId, paymentId: args.paymentId, creditedCents: targetCredited, reversedCents: targetReversed, reconcileGeneration: args.generation };
  },
});

export const reversePurchase = internalMutation({
  args: { paymentId: v.string(), generation: v.number(), refundedCents: v.number(), disputedCents: v.number(), disputeOpen: v.boolean() },
  handler: async (ctx, args) => {
    requireIdentifier(args.paymentId, "paymentId"); assertCents(args.refundedCents, "refundedCents"); assertCents(args.disputedCents, "disputedCents");
    const payment = await ctx.db.query("blenderPayments").withIndex("by_payment", q => q.eq("paymentId", args.paymentId)).unique();
    if (!payment) throw new Error("Payment not found.");
    if (payment.reconcileGeneration !== args.generation) throw new ConvexError({ code: "stale_generation", message: "Stale payment reconciliation generation." });
    const purchase = await ctx.db.query("blenderPurchases").withIndex("by_purchase", q => q.eq("purchaseId", payment.purchaseId)).unique();
    if (!purchase || purchase.livemode !== payment.livemode) throw new Error("Payment purchase binding is invalid.");
    const targetReversed = Math.min(payment.amountCents, args.refundedCents + args.disputedCents);
    const targetCredited = payment.wasPaid ? payment.amountCents - targetReversed : 0;
    const availableDelta = targetCredited - payment.creditedCents;
    const disputeDelta = args.disputeOpen === payment.openDispute ? 0 : args.disputeOpen ? 1 : -1;
    const wallet = await getOrCreateWallet(ctx, purchase.agentId, payment.livemode);
    const fingerprint = JSON.stringify({ refundedCents: args.refundedCents, disputedCents: args.disputedCents, disputeOpen: args.disputeOpen });
    const event = await ctx.db.query("blenderPaymentEvents").withIndex("by_payment_generation", q => q.eq("paymentId", args.paymentId).eq("generation", args.generation)).unique();
    if (!event) throw new Error("Unknown payment reconciliation generation.");
    if (event.committedFingerprint) {
      if (event.committedFingerprint !== fingerprint) throw new Error("Reconciliation generation already committed with a different state.");
      return { paymentId: args.paymentId, creditedCents: payment.creditedCents, reversedCents: payment.reversedCents };
    }
    if (availableDelta || disputeDelta) { await refreshWallet(ctx, wallet, availableDelta, disputeDelta); await ledger(ctx, `payment:${args.paymentId}:${args.generation}:reversal`, `payment:${args.paymentId}`, "reversal", purchase.agentId, payment.livemode, availableDelta); }
    await ctx.db.patch(event._id, { committedFingerprint: fingerprint });
    await ctx.db.patch(payment._id, { creditedCents: targetCredited, reversedCents: targetReversed, openDispute: args.disputeOpen });
    await ctx.db.patch(purchase._id, { status: payment.wasPaid ? targetReversed === payment.amountCents ? "reversed" : "paid" : "failed" });
    return { paymentId: args.paymentId, creditedCents: targetCredited, reversedCents: targetReversed };
  },
});
