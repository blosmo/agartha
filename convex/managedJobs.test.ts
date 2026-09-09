import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,js}");
const token = "a".repeat(64);
const tokenB = "b".repeat(64);

async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const actor = await t.mutation(anyApi.cloud.session.register, { token, name: "Operator", ipHash: "reservation-test" });
  vi.stubEnv("BLENDER_TEST_OPERATOR_AGENT_IDS", actor.agentId);
  await t.mutation(anyApi.cloud.purchases.createPurchase, { token, purchaseId: "funding", amountCents: 500, livemode: false, paymentRail: "mpp", requestId: "funding-request" });
  const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: "pi_funding", eventId: "funding-event" });
  await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: "funding", paymentId: "pi_funding", generation: generation.generation, amountCents: 500, currency: "usd", livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
  return { t, actor };
}

beforeEach(() => vi.stubEnv("BLENDER_BILLING_ACTIVE", "true"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const api = anyApi.cloud.managedJobs;
const create = { token, jobId: "job", requestId: "request", brief: "Build a chair", budgetCents: 200, livemode: false };
const inference = { jobId: "job", executorId: "worker", operationId: "op", maxCostCents: 50, payloadFingerprint: "hash" };
async function running() { const result = await setup(); await result.t.mutation(api.createManagedJob, create); await result.t.mutation(api.claimManagedJob, { jobId: "job", executorId: "worker" }); return result; }
describe("managed modeling ledger", () => {
  it("atomically holds the total budget, retries safely and enforces ownership", async () => {
    const { t } = await setup();
    const row = await t.mutation(api.createManagedJob, create);
    expect(row).toMatchObject({ reservedAiCents: 135, computeReservedCents: 65 });
    expect(row).not.toHaveProperty("executorId");
    expect(await t.run(ctx => ctx.db.query("blenderSessionReservations").first())).toMatchObject({ deferredStart: true });
    expect(await t.mutation(api.createManagedJob, create)).toEqual(row);
    await expect(t.mutation(api.createManagedJob, { ...create, brief: "Different" })).rejects.toThrow("different payload");
    await t.mutation(anyApi.cloud.session.register, { token: tokenB, name: "Other", ipHash: "other" });
    await expect(t.query(api.getManagedJob, { token: tokenB, jobId: "job" })).rejects.toThrow("not found");
    await expect(t.mutation(api.requestManagedCancel, { token: tokenB, jobId: "job" })).rejects.toThrow("not found");
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 300, heldCents: 200 });
  });
  it("rolls back compute and quotes if the total cannot be reserved", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.createManagedJob, { ...create, budgetCents: 600 })).rejects.toThrow("Insufficient");
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 500, heldCents: 0 });
    expect(await t.run(ctx => ctx.db.query("blenderSessionQuotes").collect())).toEqual([]);
    await expect(t.mutation(api.createManagedJob, { ...create, brief: "😀".repeat(1001) })).rejects.toThrow("UTF-8");
    await expect(t.mutation(api.createManagedJob, { ...create, budgetCents: 100.5 })).rejects.toThrow();
    await expect(t.mutation(api.createManagedJob, { ...create, jobId: "unreachable/job" })).rejects.toThrow("invalid");
  });
  it("does not spend more on inference after compute stops", async () => {
    const { t } = await running();
    await t.run(async ctx => { const reservation = await ctx.db.query("blenderSessionReservations").first(); await ctx.db.patch(reservation!._id, { status: "failed" }); });
    await expect(t.mutation(api.claimManagedInference, inference)).rejects.toThrow("no longer available");
  });
  it("fences workers, dispatches once and settles only actual usage", async () => {
    const { t } = await running();
    expect(await t.mutation(api.claimManagedJob, { jobId: "job", executorId: "worker" })).toEqual({ claimed: false });
    expect(await t.mutation(api.claimManagedInference, inference)).toMatchObject({ claimed: true });
    expect(await t.mutation(api.claimManagedInference, inference)).toMatchObject({ claimed: false });
    await expect(t.mutation(api.claimManagedInference, { ...inference, operationId: "op2" })).rejects.toThrow("in flight");
    await expect(t.mutation(api.completeManagedInference, { jobId: "job", executorId: "other", operationId: "op", chargeCents: 10 })).rejects.toThrow("Stale");
    await expect(t.mutation(api.completeManagedInference, { jobId: "job", executorId: "worker", operationId: "op", chargeCents: 51 })).rejects.toThrow("exceeds");
    const completion = { jobId: "job", executorId: "worker", operationId: "op", chargeCents: 10 };
    await t.mutation(api.completeManagedInference, completion);
    expect(await t.mutation(api.completeManagedInference, completion)).toMatchObject({ reused: true });
    await expect(t.mutation(api.claimManagedInference, { ...inference, operationId: "op2", maxCostCents: 126 })).rejects.toThrow("budget");
    await t.mutation(api.finishManagedJob, { jobId: "job", executorId: "worker", status: "partial", progress: "Done", visuallyInspected: true });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 490, heldCents: 0 });
    const ledger = await t.run(ctx => ctx.db.query("blenderLedger").collect());
    expect(ledger.reduce((sum, e) => sum + e.deltaCents, 0)).toBe(490);
  });
  it("retains ambiguous usage without charging the maximum and reconciles later", async () => {
    const { t } = await running(); await t.mutation(api.claimManagedInference, inference);
    await t.mutation(api.completeManagedInference, { jobId: "job", executorId: "worker", operationId: "op", ambiguous: true });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "failed", pendingAiCents: 50, chargedAiCents: 0 });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 450, heldCents: 50 });
    await t.mutation(api.completeManagedInference, { jobId: "job", executorId: "worker", operationId: "op", chargeCents: 7 });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 493, heldCents: 0 });
  });
  it("cancellation blocks all further claims and preserves in-flight reconciliation", async () => {
    const { t } = await running(); await t.mutation(api.claimManagedInference, inference);
    await t.mutation(api.requestManagedCancel, { token, jobId: "job" });
    await expect(t.mutation(api.claimManagedInference, { ...inference, operationId: "new" })).rejects.toThrow("not authorized");
    expect(await t.mutation(api.heartbeatManagedJob, { jobId: "job", executorId: "worker" })).toEqual({ active: false });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "cancelled", pendingAiCents: 50 });
    await t.mutation(api.completeManagedInference, { jobId: "job", executorId: "worker", operationId: "op", chargeCents: 0 });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 500, heldCents: 0 });
  });
  it("recovers expired workers without taking over inference", async () => {
    const { t } = await running(); await t.mutation(api.claimManagedInference, inference);
    await t.run(async ctx => { const row = await ctx.db.query("managedJobs").first(); await ctx.db.patch(row!._id, { deadlineAt: Date.now() - 1 }); });
    await t.mutation(api.recoverManagedJob, { jobId: "job" });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "failed", pendingAiCents: 50, chargedAiCents: 0 });
  });
  it("serializes competing dispatch claims and rejects frozen wallets", async () => {
    const { t } = await running();
    const results = await Promise.allSettled([
      t.mutation(api.claimManagedInference, inference),
      t.mutation(api.claimManagedInference, { ...inference, operationId: "parallel" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? "op" : "parallel";
    await t.mutation(api.completeManagedInference, { jobId: "job", executorId: "worker", operationId: winner, chargeCents: 1 });
    await t.run(async ctx => { const wallet = await ctx.db.query("blenderWallets").first(); await ctx.db.patch(wallet!._id, { frozen: true, openDisputes: 1 }); });
    await expect(t.mutation(api.claimManagedInference, { ...inference, operationId: "frozen" })).rejects.toThrow("not authorized");
    expect(await t.mutation(api.heartbeatManagedJob, { jobId: "job", executorId: "worker" })).toEqual({ active: false });
  });

  it("preserves durable checkpoints through recovery and resets inspection for each revision", async () => {
    const { t } = await running();
    await expect(t.mutation(api.recordManagedCheckpoint, { jobId: "job", executorId: "other" })).rejects.toThrow("Stale");
    await t.mutation(api.recordManagedCheckpoint, { jobId: "job", executorId: "worker" });
    await t.run(async ctx => { const row = await ctx.db.query("managedJobs").first(); await ctx.db.patch(row!._id, { deadlineAt: Date.now() - 1, visuallyInspected: true }); });
    await t.mutation(api.recoverManagedJob, { jobId: "job" });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "failed", artifactsReady: true, visuallyInspected: true });
    await t.mutation(api.recordManagedCheckpoint, { jobId: "job", executorId: "worker" });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "failed", artifactsReady: true, visuallyInspected: false });
    await t.mutation(api.finishManagedJob, { jobId: "job", executorId: "worker", status: "completed", progress: "Inspected", visuallyInspected: true });
    await t.mutation(api.finishManagedJob, { jobId: "job", executorId: "worker", status: "completed", progress: "New uninspected revision", visuallyInspected: false });
    expect(await t.query(api.getManagedJob, { token, jobId: "job" })).toMatchObject({ status: "failed", artifactsReady: true, visuallyInspected: false });
  });

});
