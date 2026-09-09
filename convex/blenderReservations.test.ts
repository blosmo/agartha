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

describe("paid Blender reservations", () => {
  it("rejects old open quotes without moving credits", async () => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-old", minutes: 5, livemode: false, requestId: "q-old" });
    await t.run(async ctx => { await ctx.db.patch(quote._id, { pricingVersion: "blender-cpu2-v1", reserveCents: 25 }); });
    await expect(t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-old", reservationId: "r-old", requestId: "r-old" })).rejects.toThrow("pricing has changed");
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 500, heldCents: 0 });
  });

  it.each([false, true])("preserves v1 reservation retries and settlement (startupFailed=%s)", async startupFailed => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-old", minutes: 30, livemode: false, requestId: "q-old" });
    const reservation = await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-old", reservationId: "r-old", requestId: "r-old" });
    // Model a v1 hold that already existed at the time of the deployment.
    await t.run(async ctx => {
      await ctx.db.patch(quote._id, { pricingVersion: "blender-cpu2-v1", reserveCents: 150 });
      await ctx.db.patch(reservation._id, { reservedCents: 150 });
      const wallet = await ctx.db.query("blenderWallets").first();
      if (!wallet) throw new Error("Missing test wallet");
      await ctx.db.patch(wallet._id, { availableCents: 350, heldCents: 150 });
    });
    expect(await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-old", reservationId: "r-old", requestId: "r-old" })).toMatchObject({ reservedCents: 150 });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-old", launchGeneration: 1, operationId: "launch-old" });
    if (startupFailed) {
      await t.mutation(anyApi.cloud.blenderSessions.recordLaunchFailure, { reservationId: "r-old", launchGeneration: 1, reason: "boot" });
      await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-old", launchGeneration: 2, operationId: "launch-retry" });
      await t.mutation(anyApi.cloud.blenderSessions.recordLaunchFailure, { reservationId: "r-old", launchGeneration: 2, reason: "boot-again" });
      expect(await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: "r-old" })).toMatchObject({ chargedCents: 0, releasedCents: 150 });
    } else {
      await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-old", launchGeneration: 1, readyAt: 1_000 });
      const args = { reservationId: "r-old", launchGeneration: 1, terminalState: "confirmed", stoppedAt: 301_001, startupFailed };
      const result = await t.mutation(anyApi.cloud.blenderSessions.settleSession, args);
      expect(result).toMatchObject({ chargedCents: 30, releasedCents: 120 });
      expect(await t.mutation(anyApi.cloud.blenderSessions.settleSession, args)).toEqual(result);
    }
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ heldCents: 0, availableCents: startupFailed ? 500 : 470 });
  });

  it.each(["missing", "unsupported", "amount mismatch"])("holds credits when settlement pricing is %s", async problem => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-invalid", minutes: 5, livemode: false, requestId: "q-invalid" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r-invalid", requestId: "r-invalid" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-invalid", launchGeneration: 1, operationId: "launch-invalid" });
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-invalid", launchGeneration: 1, readyAt: 1_000 });
    await t.run(async ctx => {
      if (problem === "missing") await ctx.db.delete(quote._id);
      else await ctx.db.patch(quote._id, { pricingVersion: problem === "unsupported" ? "unknown" : "blender-cpu2-v1" });
    });
    await expect(t.mutation(anyApi.cloud.blenderSessions.settleSession, { reservationId: "r-invalid", launchGeneration: 1, terminalState: "confirmed", stoppedAt: 2_000, startupFailed: false })).rejects.toThrow();
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ heldCents: 40, availableCents: 460 });
    expect(await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: "r-invalid" })).toMatchObject({ status: "running", chargedCents: 0, releasedCents: 0 });
  });

  it("rejects missing or foreign resume projects before reserving compute", async () => {
    const { t } = await setup();
    await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "bad-resume", requestId: "bad-resume", minutes: 5, livemode: false, projectId: "missing" })).rejects.toThrow("not available");
    await t.run(async ctx => { await ctx.db.insert("blenderProjects", { projectId: "foreign", agentId: "other-agent", livemode: false, title: "Foreign", requestId: "foreign", storedBytes: 0, currentVersionNumber: 0, nextVersionNumber: 0, lastPaidSessionAt: Date.now(), expiresAt: Date.now() + 100_000, createdAt: Date.now(), updatedAt: Date.now() }); });
    await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "foreign-resume", requestId: "foreign-resume", minutes: 5, livemode: false, projectId: "foreign" })).rejects.toThrow("not available");
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).heldCents).toBe(0);
  });
  it("renews a long checkpoint lease and fences a replaced shutdown executor", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-lease", minutes: 5, livemode: false, requestId: "q-lease" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-lease", reservationId: "r-lease", requestId: "r-lease" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-lease", launchGeneration: 1, operationId: "launch-lease" });
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-lease", launchGeneration: 1, readyAt: Date.now() });
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-lease", launchGeneration: 1, executorId: "first" });
    clock.mockReturnValue(now + 35_000);
    await t.mutation(anyApi.cloud.blenderSessions.renewShutdown, { reservationId: "r-lease", launchGeneration: 1, executorId: "first" });
    clock.mockReturnValue(now + 70_000);
    expect(await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-lease", launchGeneration: 1, executorId: "second" })).toMatchObject({ claimed: false });
    clock.mockReturnValue(now + 96_000);
    expect(await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-lease", launchGeneration: 1, executorId: "second" })).toMatchObject({ claimed: true });
    await expect(t.mutation(anyApi.cloud.blenderSessions.renewShutdown, { reservationId: "r-lease", launchGeneration: 1, executorId: "first" })).rejects.toThrow('executor has changed');
  });
  it("fences automatic shutdown against new calls and settles a timed-out operation", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-auto", minutes: 5, livemode: false, requestId: "q-auto" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-auto", reservationId: "r-auto", requestId: "r-auto" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-auto", launchGeneration: 1, operationId: "launch-auto" });
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-auto", launchGeneration: 1, readyAt: Date.now() });
    await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r-auto", launchGeneration: 1, operationId: "unfinished", payloadFingerprint: "a", responseBytes: 100 });
    const stop = await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-auto", launchGeneration: 1, executorId: "monitor" });
    expect(stop).toMatchObject({ claimed: true, checkpointAllowed: false });
    await expect(t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r-auto", launchGeneration: 1, operationId: "too-late", payloadFingerprint: "b", responseBytes: 100 })).rejects.toThrow("not authorized");
    await t.mutation(anyApi.cloud.blenderSessions.settleSession, { reservationId: "r-auto", launchGeneration: 1, terminalState: "confirmed", stoppedAt: Date.now(), startupFailed: false });
    const row = await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: "r-auto" });
    expect(row).toMatchObject({ status: "settled", responseBytesHeld: 0, responseBytesUsed: 100, chargedCents: 40 });
  });
  it("reports an active operation deadline to the broker only while it is claimed", async () => {
    const { t } = await setup();
    await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-deadline", minutes: 5, livemode: false, requestId: "q-deadline" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-deadline", reservationId: "r-deadline", requestId: "r-deadline" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-deadline", launchGeneration: 1, operationId: "launch-deadline" });
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-deadline", launchGeneration: 1, readyAt: Date.now() });
    expect((await t.query(anyApi.cloud.blenderSessions.getReservationForBroker, { reservationId: "r-deadline" })).activeOperationDeadline).toBeUndefined();
    const beforeAuthorization = Date.now();
    await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r-deadline", launchGeneration: 1, operationId: "render-deadline", payloadFingerprint: "render", responseBytes: 100 });
    const afterAuthorization = Date.now();
    const active = await t.query(anyApi.cloud.blenderSessions.getReservationForBroker, { reservationId: "r-deadline" });
    expect(active.activeOperationDeadline).toBeGreaterThanOrEqual(beforeAuthorization + 120_000);
    expect(active.activeOperationDeadline).toBeLessThanOrEqual(afterAuthorization + 120_000);
    await t.mutation(anyApi.cloud.blenderSessions.completeOperation, { operationId: "render-deadline", actualResponseBytes: 10, resultRef: "result-deadline", state: "completed" });
    expect((await t.query(anyApi.cloud.blenderSessions.getReservationForBroker, { reservationId: "r-deadline" })).activeOperationDeadline).toBeUndefined();
  });
  it("atomically rejects an idle-only shutdown after activity refresh or a fresh claim", async () => {
    const { t } = await setup();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-idle-race", minutes: 5, livemode: false, requestId: "q-idle-race" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-idle-race", reservationId: "r-idle-race", requestId: "r-idle-race" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r-idle-race", launchGeneration: 1, operationId: "launch-idle-race" });
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r-idle-race", launchGeneration: 1, readyAt: now });
    clock.mockReturnValue(now + 61_000);
    await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r-idle-race", launchGeneration: 1, operationId: "fresh-activity", payloadFingerprint: "first", responseBytes: 100 });
    expect(await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-idle-race", launchGeneration: 1, executorId: "idle-monitor-1", idleOnly: true })).toMatchObject({ claimed: false });
    expect((await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: "r-idle-race" })).stopRequested).toBe(false);
    await t.mutation(anyApi.cloud.blenderSessions.completeOperation, { operationId: "fresh-activity", actualResponseBytes: 10, resultRef: "first-result", state: "completed" });
    await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r-idle-race", launchGeneration: 1, operationId: "fresh-claim", payloadFingerprint: "second", responseBytes: 100 });
    clock.mockReturnValue(now + 122_000);
    expect(await t.mutation(anyApi.cloud.blenderSessions.claimShutdown, { reservationId: "r-idle-race", launchGeneration: 1, executorId: "idle-monitor-2", idleOnly: true })).toMatchObject({ claimed: false });
    expect((await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: "r-idle-race" })).stopRequested).toBe(false);
    await t.mutation(anyApi.cloud.blenderSessions.completeOperation, { operationId: "fresh-claim", actualResponseBytes: 10, resultRef: "second-result", state: "completed" });
  });
  it("atomically reserves one owner/mode wallet and binds request payloads", async () => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q1", minutes: 5, livemode: false, requestId: "quote-1" });
    const reservation = await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r1", requestId: "reserve-1" });
    expect(reservation.status).toBe("reserved");
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).availableCents).toBe(460);
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).heldCents).toBe(40);
    expect((await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r1", requestId: "reserve-1" })).reservationId).toBe("r1");
    await expect(t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r2", requestId: "reserve-2" })).rejects.toThrow("already reserved");
    await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q2", minutes: 30, livemode: false, requestId: "quote-1" })).rejects.toThrow("different payload");
  });

  it("fences launch callbacks and keeps unknown terminal state held", async () => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q1", minutes: 5, livemode: false, requestId: "quote-1" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r1", requestId: "reserve-1" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r1", launchGeneration: 1, operationId: "launch-1" });
    expect((await t.mutation(anyApi.cloud.blenderSessions.claimStartup, { reservationId: "r1", launchGeneration: 1, executorId: "executor-1" })).claimed).toBe(true);
    expect((await t.mutation(anyApi.cloud.blenderSessions.claimStartup, { reservationId: "r1", launchGeneration: 1, executorId: "executor-2" })).claimed).toBe(false);
    await t.mutation(anyApi.cloud.blenderSessions.attachWorker, { reservationId: "r1", launchGeneration: 1, workerId: "worker-1" });
    await expect(t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r1", launchGeneration: 2, readyAt: 1000 })).rejects.toThrow("Stale");
    await t.mutation(anyApi.cloud.blenderSessions.markSessionReady, { reservationId: "r1", launchGeneration: 1, readyAt: 1000 });
    await t.mutation(anyApi.cloud.blenderSessions.attachWorker, { reservationId: "r1", launchGeneration: 1, workerId: "worker-1" });
    await expect(t.mutation(anyApi.cloud.blenderSessions.attachWorker, { reservationId: "r1", launchGeneration: 1, workerId: "worker-2" })).rejects.toThrow("another provider");
    expect((await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r1", launchGeneration: 1, operationId: "op-1", payloadFingerprint: "payload-1", responseBytes: 1024 })).reused).toBe(false);
    expect((await t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r1", launchGeneration: 1, operationId: "op-1", payloadFingerprint: "payload-1", responseBytes: 1024 })).reused).toBe(true);
    await t.mutation(anyApi.cloud.blenderSessions.completeOperation, { operationId: "op-1", actualResponseBytes: 512, resultRef: "result-1", state: "completed" });
    await expect(t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r1", launchGeneration: 1, operationId: "op-1", payloadFingerprint: "changed", responseBytes: 1024 })).rejects.toThrow("different payload");
    await expect(t.mutation(anyApi.cloud.blenderSessions.authorizeOperation, { reservationId: "r1", launchGeneration: 1, operationId: "op-too-large", payloadFingerprint: "large", responseBytes: 268_435_457 })).rejects.toThrow("exceeds");
    await t.mutation(anyApi.cloud.blenderSessions.settleSession, { reservationId: "r1", launchGeneration: 1, terminalState: "unknown", stoppedAt: 2000, startupFailed: false });
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).heldCents).toBe(40);
    await t.mutation(anyApi.cloud.blenderSessions.settleSession, { reservationId: "r1", launchGeneration: 1, terminalState: "confirmed", stoppedAt: 61_001, startupFailed: false });
    const balance = await t.query(anyApi.cloud.purchases.balance, { token, livemode: false });
    expect(balance.heldCents).toBe(0);
    expect(balance.availableCents).toBe(460);
  });

  it("allows one retry after a failed startup and releases held credits after terminal failure", async () => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q1", minutes: 5, livemode: false, requestId: "quote-1" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r1", requestId: "reserve-1" });
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r1", launchGeneration: 1, operationId: "launch-1" });
    expect((await t.mutation(anyApi.cloud.blenderSessions.recordLaunchFailure, { reservationId: "r1", launchGeneration: 1, reason: "boot" })).retry).toBe(true);
    await t.mutation(anyApi.cloud.blenderSessions.claimLaunch, { reservationId: "r1", launchGeneration: 2, operationId: "launch-2" });
    expect((await t.mutation(anyApi.cloud.blenderSessions.recordLaunchFailure, { reservationId: "r1", launchGeneration: 2, reason: "boot-again" })).retry).toBe(false);
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).heldCents).toBe(0);
  });

  it("cancels an unstarted reservation and releases its full hold", async () => {
    const { t } = await setup();
    const quote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q-cancel", minutes: 5, livemode: false, requestId: "quote-cancel" });
    await t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: quote.quoteId, reservationId: "r-cancel", requestId: "reserve-cancel" });
    const cancelled = await t.mutation(anyApi.cloud.blenderSessions.requestStop, { token, reservationId: "r-cancel" });
    expect(cancelled.cancelled).toBe(true);
    expect((await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).heldCents).toBe(0);
  });

  it("fails closed when activation is absent and enforces operation response and call limits", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    await t.mutation(anyApi.cloud.session.register, { token, name: "Closed", ipHash: "closed" });
    vi.stubEnv("BLENDER_BILLING_ACTIVE", "false");
    await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q1", minutes: 5, livemode: false, requestId: "quote-1" })).rejects.toThrow("not activated");
  });

  it("serializes concurrent reservations for one owner and rejects a globally reused reservation ID", async () => {
    const { t, actor } = await setup();
    const q1 = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q1", minutes: 5, livemode: false, requestId: "quote-1" });
    const q2 = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token, quoteId: "q2", minutes: 5, livemode: false, requestId: "quote-2" });
    const attempts = await Promise.allSettled([
      t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: q1.quoteId, reservationId: "r1", requestId: "reserve-1" }),
      t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: q2.quoteId, reservationId: "r2", requestId: "reserve-2" }),
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    const reusedId = attempts.find(result => result.status === "fulfilled")?.value.reservationId ?? "r1";
    const other = await t.mutation(anyApi.cloud.session.register, { token: tokenB, name: "Other", ipHash: "other" });
    vi.stubEnv("BLENDER_TEST_OPERATOR_AGENT_IDS", `${actor.agentId},${other.agentId}`);
    const otherQuote = await t.mutation(anyApi.cloud.blenderSessions.createQuote, { token: tokenB, quoteId: "q-other", minutes: 5, livemode: false, requestId: "quote-other" });
    await expect(t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token: tokenB, quoteId: otherQuote.quoteId, reservationId: reusedId, requestId: "other-reserve" })).rejects.toThrow("already bound");
    expect(actor.agentId).toBeDefined();
  });
});

it("can reserve the first paid session for a newly created project", async () => {
  const { t } = await setup();
  await t.mutation(anyApi.cloud.blenderProjects.createProject, { token, projectId: "fresh", title: "Fresh", livemode: false, requestId: "fresh" });
  const args = { token, quoteId: "q-fresh", minutes: 5, livemode: false, requestId: "q-fresh", projectId: "fresh" };
  await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, args)).resolves.toMatchObject({ projectId: "fresh" });
  await expect(t.mutation(anyApi.cloud.blenderSessions.reserveSession, { token, quoteId: "q-fresh", reservationId: "r-fresh", requestId: "r-fresh" })).resolves.toMatchObject({ projectId: "fresh", status: "reserved", reservedCents: 40 });
});
