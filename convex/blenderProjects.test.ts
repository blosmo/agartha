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
  const now = Date.now();
  await t.run(async ctx => {
    for (const projectId of ["project_a", "project_2", "project_3", "project_4", "project_5"]) await ctx.db.insert("blenderSessionReservations", { reservationId: `session_${projectId}`, quoteId: "q", agentId: a.agentId, livemode: false, requestId: "r", projectId, reservedMinutes: 5, reservedCents: 25, status: "running", launchGeneration: 1, retryCount: 0, chargedCents: 0, releasedCents: 0, responseBytesHeld: 0, responseBytesUsed: 0, failureBudgetNanoUsd: 0, stopRequested: false, createdAt: now, lastActivityAt: now });
    await ctx.db.insert("blenderSessionReservations", { reservationId: "session_b", quoteId: "q", agentId: b.agentId, livemode: false, requestId: "r", projectId: "project_b", reservedMinutes: 5, reservedCents: 25, status: "running", launchGeneration: 1, retryCount: 0, chargedCents: 0, releasedCents: 0, responseBytesHeld: 0, responseBytesUsed: 0, failureBudgetNanoUsd: 0, stopRequested: false, createdAt: now, lastActivityAt: now });
  });
  return { t, a, b };
}

async function createProject(t: Awaited<ReturnType<typeof setup>>["t"], token = tokenA, projectId = "project_a", livemode = false, requestId = `request_${projectId}`) {
  return t.mutation(anyApi.cloud.blenderProjects.createProject, { token, projectId, title: projectId, livemode, requestId });
}

describe("private Blender project ledger", () => {
  it("enforces exact project and account byte limits through active paid reservations", async () => {
    const { t } = await setup();
    await createProject(t);
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "op_big", projectId: "project_a", maxBytes: 256_000_000, versionId: "v1" })).resolves.toMatchObject({ maxBytes: 256_000_000 });
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "op_too_big", projectId: "project_a", maxBytes: 1, versionId: "v2" })).rejects.toThrow(/project snapshot/i);
    await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "op_big", actualBytes: 256_000_000, blobRef: "blob:v1", sha256: "a".repeat(64) });
    const project = await t.run(async ctx => ctx.db.query("blenderProjects").withIndex("by_project", q => q.eq("projectId", "project_a")).unique());
    expect(project?.storedBytes).toBe(256_000_000);
    await expect(t.query(anyApi.cloud.blenderProjects.getProjectForReservation, { sessionId: "session_project_a", sessionGeneration: 1, projectId: "project_a" })).resolves.toMatchObject({ version: { versionId: "v1", blobRef: "blob:v1" } });
    for (const id of ["project_2", "project_3", "project_4", "project_5"]) await createProject(t, tokenA, id);
    for (const id of ["project_2", "project_3", "project_4"]) await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: `session_${id}`, sessionGeneration: 1, operationId: `op_${id}`, projectId: id, maxBytes: 256_000_000, versionId: `v_${id}` });
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_5", sessionGeneration: 1, operationId: "op_quota_fill", projectId: "project_5", maxBytes: 49_741_824, versionId: "v_quota_fill" });
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_5", sessionGeneration: 1, operationId: "op_quota", projectId: "project_5", maxBytes: 1, versionId: "v_quota" })).rejects.toThrow(/quota/i);
  });

  it("keeps project creation and artifact reservations idempotent with immutable payloads", async () => {
    const { t } = await setup();
    await createProject(t);
    await expect(createProject(t)).resolves.toMatchObject({ projectId: "project_a" });
    await expect(createProject(t, tokenA, "project_other", false, "request_project_a")).rejects.toThrow(/different payload/i);
    const first = await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "op1", projectId: "project_a", maxBytes: 100, versionId: "v1" });
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "op1", projectId: "project_a", maxBytes: 100, versionId: "v1" })).resolves.toMatchObject({ _id: first._id });
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "op1", projectId: "project_a", maxBytes: 101, versionId: "v1" })).rejects.toThrow(/different payload/i);
    await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "op1", actualBytes: 50, blobRef: "blob:v1", sha256: "a".repeat(64) });
    await expect(t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "op1", actualBytes: 51, blobRef: "blob:v1", sha256: "a".repeat(64) })).rejects.toThrow(/different data/i);
  });

  it("releases only unused reservations and prevents older immutable commits from rolling back newer versions", async () => {
    const { t } = await setup();
    await createProject(t);
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "old", projectId: "project_a", maxBytes: 100, versionId: "v1" });
    await t.mutation(anyApi.cloud.blenderProjects.rollbackArtifact, { operationId: "old" });
    await expect(t.mutation(anyApi.cloud.blenderProjects.rollbackArtifact, { operationId: "old" })).resolves.toMatchObject({ status: "released", releasedBytes: 100 });
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "v2op", projectId: "project_a", maxBytes: 80_000_000, versionId: "v2" });
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "v3op", projectId: "project_a", maxBytes: 90_000_000, versionId: "v3" });
    await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "v2op", actualBytes: 80_000_000, blobRef: "blob:v2", sha256: "b".repeat(64) });
    await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "v3op", actualBytes: 90_000_000, blobRef: "blob:v3", sha256: "c".repeat(64) });
    const project = await t.run(async ctx => ctx.db.query("blenderProjects").withIndex("by_project", q => q.eq("projectId", "project_a")).unique());
    expect(project?.currentVersionId).toBe("v3");
    expect(project?.storedBytes).toBe(90_000_000);
    const candidates = await t.query(anyApi.cloud.blenderProjects.listArtifactDeletionCandidates, { projectId: "project_a", limit: 10 });
    expect(candidates).toEqual([expect.objectContaining({ versionId: "v2", bytes: 80_000_000 })]);
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "replacement", projectId: "project_a", maxBytes: 256_000_000, versionId: "v4" })).resolves.toMatchObject({ versionId: "v4" });
    await t.mutation(anyApi.cloud.blenderProjects.rollbackArtifact, { operationId: "replacement" });
    const claim = await t.mutation(anyApi.cloud.blenderProjects.claimArtifactDeletion, { versionId: "v2" });
    await t.mutation(anyApi.cloud.blenderProjects.confirmArtifactDeletion, { versionId: "v2", deletionToken: claim.deletionToken });
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "after_gc", projectId: "project_a", maxBytes: 87_000_000, versionId: "v4" })).resolves.toMatchObject({ versionId: "v4" });
  });

  it("rejects cross-owner, wrong-mode, expired-session, and non-paid reservation grants", async () => {
    const { t } = await setup();
    await createProject(t);
    await createProject(t, tokenB, "project_b");
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_b", sessionGeneration: 1, operationId: "wrong_owner", projectId: "project_a", maxBytes: 10, versionId: "x" })).rejects.toThrow(/owned/i);
    await expect(t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "missing", sessionGeneration: 1, operationId: "missing_session", projectId: "project_a", maxBytes: 10, versionId: "x" })).rejects.toThrow(/active paid/i);
    await expect(t.query(anyApi.cloud.blenderProjects.getProject, { token: tokenB, projectId: "project_a", livemode: false })).rejects.toThrow(/not found/i);
  });

  it("ensures a default project during launch and extends retention only after readiness", async () => {
    const { t } = await setup();
    await t.run(async ctx => {
      const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", "session_project_2")).unique();
      if (!row) throw new Error("fixture reservation missing");
      await ctx.db.patch(row._id, { status: "launching" });
    });
    const launching = await t.mutation(anyApi.cloud.blenderProjects.ensureProjectForReservation, { sessionId: "session_project_2", sessionGeneration: 1 });
    expect(launching.projectId).toBe("project_2");
    expect(launching.expiresAt).toBe(0);
    await expect(t.query(anyApi.cloud.blenderProjects.getProjectForReservation, { sessionId: "session_project_2", sessionGeneration: 1, projectId: "project_2" })).resolves.toMatchObject({ project: { projectId: "project_2" } });
    await t.run(async ctx => {
      const row = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", "session_project_2")).unique();
      if (!row) throw new Error("fixture reservation missing");
      await ctx.db.patch(row._id, { status: "running" });
    });
    const ready = await t.mutation(anyApi.cloud.blenderProjects.ensureProjectForReservation, { sessionId: "session_project_2", sessionGeneration: 1 });
    expect(ready.expiresAt).toBeGreaterThan(Date.now());
    await t.run(async ctx => {
      const project = await ctx.db.query("blenderProjects").withIndex("by_project", q => q.eq("projectId", "project_2")).unique();
      const session = await ctx.db.query("blenderSessionReservations").withIndex("by_reservation", q => q.eq("reservationId", "session_project_2")).unique();
      if (!project || !session) throw new Error("fixture row missing");
      await ctx.db.patch(project._id, { expiresAt: Date.now() - 1 });
      await ctx.db.patch(session._id, { status: "launching" });
    });
    await expect(t.query(anyApi.cloud.blenderProjects.getProjectForReservation, { sessionId: "session_project_2", sessionGeneration: 1, projectId: "project_2" })).rejects.toThrow(/retention/i);
    const expired = await t.query(anyApi.cloud.blenderProjects.listExpiredProjects, {});
    expect(expired.page).toEqual([expect.objectContaining({ projectId: "project_2" })]);
  });

  it("marks a newly inserted out-of-order version obsolete and keeps commit retries stable", async () => {
    const { t } = await setup();
    await createProject(t);
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "old", projectId: "project_a", maxBytes: 100, versionId: "old_v" });
    await t.mutation(anyApi.cloud.blenderProjects.reserveArtifactBytes, { sessionId: "session_project_a", sessionGeneration: 1, operationId: "new", projectId: "project_a", maxBytes: 100, versionId: "new_v" });
    await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "new", actualBytes: 100, blobRef: "blob:new", sha256: "n".repeat(64) });
    const first = await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "old", actualBytes: 100, blobRef: "blob:old", sha256: "o".repeat(64) });
    const retry = await t.mutation(anyApi.cloud.blenderProjects.commitArtifact, { operationId: "old", actualBytes: 100, blobRef: "blob:old", sha256: "o".repeat(64) });
    expect(first.reservation.status).toBe("committed");
    expect(retry.reservation.status).toBe("committed");
    await expect(t.query(anyApi.cloud.blenderProjects.listArtifactDeletionCandidates, { projectId: "project_a", limit: 10 })).resolves.toEqual([expect.objectContaining({ versionId: "old_v", bytes: 100 })]);
  });
});

it("lets an owner read a new project before retention starts, but rejects expired projects", async () => {
  const { t } = await setup();
  const created = await createProject(t);
  await expect(t.query(anyApi.cloud.blenderProjects.getProject, { token: tokenA, projectId: "project_a", livemode: false })).resolves.toMatchObject({ expiresAt: 0, currentVersionNumber: 0 });
  await expect(t.query(anyApi.cloud.blenderProjects.getProject, { token: tokenB, projectId: "project_a", livemode: false })).rejects.toThrow(/not found/i);
  await expect(t.query(anyApi.cloud.blenderProjects.getProject, { token: tokenA, projectId: "project_a", livemode: true })).rejects.toThrow(/not found/i);
  await t.run(async ctx => { await ctx.db.patch(created._id, { expiresAt: Date.now() - 1 }); });
  await expect(t.query(anyApi.cloud.blenderProjects.getProject, { token: tokenA, projectId: "project_a", livemode: false })).rejects.toThrow(/retention/i);
});
