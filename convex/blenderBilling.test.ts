import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,js}");
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);

async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const a = await t.mutation(anyApi.cloud.session.register, { token: tokenA, name: "A", ipHash: "a" });
  const b = await t.mutation(anyApi.cloud.session.register, { token: tokenB, name: "B", ipHash: "b" });
  return { t, a, b };
}

describe("paid Blender wallet ledger", () => {
  it("bounds payment-service attempts per owner before external calls", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "rate-purchase", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "rate-purchase" });
    for (let i = 0; i < 10; i++) await t.mutation(anyApi.cloud.purchases.authorizePaymentAttempt, { token: tokenA, purchaseId: "rate-purchase" });
    await expect(t.mutation(anyApi.cloud.purchases.authorizePaymentAttempt, { token: tokenA, purchaseId: "rate-purchase" })).rejects.toThrow("Request limit reached");
    await expect(t.mutation(anyApi.cloud.purchases.authorizePaymentAttempt, { token: tokenB, purchaseId: "rate-purchase" })).rejects.toThrow("not found");
  });
  it("creates owner-bound idempotent purchases and isolates test/live wallets", async () => {
    const { t, a } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "checkout", requestId: "r1" });
    const same = await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "checkout", requestId: "r1" });
    expect(same.purchaseId).toBe("p1");
    await expect(t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "checkout", requestId: "r2" })).rejects.toThrow("already exists");
    await expect(t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p2", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r1" })).rejects.toThrow("Idempotency");
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).availableCents).toBe(500);
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: true })).availableCents).toBe(0);
    expect(a.agentId).toBeDefined();
  });

  it("deduplicates canonical payments, fences generations, and allows reinstatement", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r1" });
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    expect((await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" })).generation).toBe(generation.generation);
    const refund = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_2" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: refund.generation, refundedCents: 500, disputedCents: 0, disputeOpen: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).availableCents).toBe(0);
    await expect(t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: refund.generation, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("different state");
    const restore = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_3" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: restore.generation, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).availableCents).toBe(500);
    await expect(t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: generation.generation, refundedCents: 500, disputedCents: 0, disputeOpen: false })).rejects.toThrow("Stale");
  });

  it("rejects forged payment attributes and cross-owner reads", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r1" });
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await expect(t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 2_000, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("match");
    await expect(t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "eur", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("USD");
    await expect(t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: true, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("match");
    await expect(t.query(anyApi.cloud.purchases.getPurchase, { token: tokenB, purchaseId: "p1" })).rejects.toThrow("not found");
    await expect(t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p2", amountCents: 100, livemode: false, paymentRail: "mpp", requestId: "r2" })).rejects.toThrow("500 or 2000");
  });

  it("preserves the wallet across token rotation and rejects payment reuse", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r1" });
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenB, purchaseId: "p2", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r2" });
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    await expect(t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p2", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("another purchase");
    const rotated = "c".repeat(64);
    await t.mutation(anyApi.cloud.session.maintain, { operation: "rotate", token: tokenA, newToken: rotated });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: rotated, livemode: false })).availableCents).toBe(500);
  });

  it("does not mint credit from an unpaid payment or allow a purchase payment rebinding", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "r1" });
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: false, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    const reverseGeneration = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_2" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: reverseGeneration.generation, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).availableCents).toBe(0);
    const otherPayment = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_2", eventId: "evt_3" });
    await expect(t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_2", generation: otherPayment.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false })).rejects.toThrow("bound");
  });

  it("fences checkout attachment and applies partial refunds, disputes, and deficits", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token: tokenA, purchaseId: "p1", amountCents: 500, livemode: false, paymentRail: "checkout", requestId: "r1" });
    await t.mutation(anyApi.cloud.purchases.attachCheckoutSession, { purchaseId: "p1", checkoutSessionId: "cs_1" });
    await t.mutation(anyApi.cloud.purchases.attachCheckoutSession, { purchaseId: "p1", checkoutSessionId: "cs_1" });
    await expect(t.mutation(anyApi.cloud.purchases.attachCheckoutSession, { purchaseId: "p1", checkoutSessionId: "cs_2" })).rejects.toThrow("another checkout");
    const fulfilled = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_1" });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "p1", paymentId: "pi_1", generation: fulfilled.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    const partial = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_2" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: partial.generation, refundedCents: 250, disputedCents: 0, disputeOpen: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).availableCents).toBe(250);
    const dispute = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_3" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: dispute.generation, refundedCents: 250, disputedCents: 100, disputeOpen: true });
    expect((await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false })).frozen).toBe(true);
    const resolved = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_1", eventId: "evt_4" });
    await t.mutation(anyApi.cloud.purchases.reversePurchase, { paymentId: "pi_1", generation: resolved.generation, refundedCents: 250, disputedCents: 0, disputeOpen: false });
    const balance = await t.query(anyApi.cloud.purchases.balance, { token: tokenA, livemode: false });
    expect(balance.frozen).toBe(false);
    const ledgerTotal = await t.run(async ctx => (await ctx.db.query("blenderLedger").collect()).filter(entry => !entry.livemode).reduce((sum, entry) => sum + entry.deltaCents, 0));
    expect(ledgerTotal).toBe(balance.availableCents);
  });
});
