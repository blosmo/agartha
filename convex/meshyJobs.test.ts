import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.{ts,js}');
const token = 'ab'.repeat(32);
const api = anyApi.cloud.managedJobs;
const mesh = { meshyAllowance: { budgetCents: 60, maxAssets: 1, allowRigging: true }, meshyRate: { usdCents: 4000, credits: 3000 }, meshyAdmissionEnabled: true };

async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const actor = await t.mutation(anyApi.cloud.session.register, { token, name: 'Meshy worker', ipHash: 'meshy-test' });
  vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', actor.agentId);
  vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_VERSION', '3');
  await t.mutation(anyApi.cloud.purchases.createPurchase, { token, purchaseId: 'mesh-funding', amountCents: 500, livemode: false, paymentRail: 'mpp', requestId: 'mesh-funding-request' });
  const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: 'pi_mesh', eventId: 'mesh-event' });
  await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: 'mesh-funding', paymentId: 'pi_mesh', generation: generation.generation, amountCents: 500, currency: 'usd', livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
  const create = { token, jobId: 'mesh-job', requestId: 'mesh-request', brief: 'Build a lantern', budgetCents: 500, livemode: false, referenceMode: 'none' as const, ...mesh };
  await t.mutation(api.createManagedJob, create);
  await t.mutation(api.claimManagedJob, { jobId: 'mesh-job', executorId: 'mesh-worker' });
  return { t, create };
}

beforeEach(() => { vi.stubEnv('BLENDER_BILLING_ACTIVE', 'true'); vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', ''); vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_VERSION', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Meshy managed ledger', () => {
  it('requires v3 admission and preserves the allowance/rate on replay', async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const actor = await t.mutation(anyApi.cloud.session.register, { token, name: 'Operator', ipHash: 'mesh-admission' });
    vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', actor.agentId);
    const base = { token, jobId: 'disabled-mesh', requestId: 'disabled-request', brief: 'Build a lamp', budgetCents: 500, livemode: false, referenceMode: 'none' as const, ...mesh };
    await expect(t.mutation(api.createManagedJob, base)).rejects.toThrow('workflow version 3');
    vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_VERSION', '3');
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token, purchaseId: 'mesh-admission-funding', amountCents: 500, livemode: false, paymentRail: 'mpp', requestId: 'mesh-admission-funding-request' });
    const generation = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: 'pi_mesh_admission', eventId: 'mesh-admission-event' });
    await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: 'mesh-admission-funding', paymentId: 'pi_mesh_admission', generation: generation.generation, amountCents: 500, currency: 'usd', livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
    const row = await t.mutation(api.createManagedJob, base);
    expect(row).toMatchObject(mesh);
    expect(await t.mutation(api.createManagedJob, { ...base, meshyAdmissionEnabled: false })).toEqual(row);
    await expect(t.mutation(api.createManagedJob, { ...base, meshyAllowance: { ...mesh.meshyAllowance, budgetCents: 61 } })).rejects.toThrow('different payload');
  });

  it('claims, attaches, completes and rigs a successful generated asset', async () => {
    const { t } = await setup();
    const image = { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-image', payloadFingerprint: 'image-fingerprint', kind: 'meshy' as const, meshStage: 'image-to-3d' as const, maxCostCents: 40 };
    expect(await t.mutation(api.claimManagedInference, image)).toMatchObject({ claimed: true, maxCostCents: 40 });
    await expect(t.mutation(api.claimManagedInference, { ...image, operationId: 'mesh-second' })).rejects.toThrow('in flight');
    expect(await t.mutation(api.attachManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-image', taskId: '123e4567-e89b-12d3-a456-426614174000' })).toMatchObject({ reused: false });
    expect(await t.mutation(api.completeManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-image', chargeCents: 40, result: { status: 'succeeded', modelUrl: 'https://assets.meshy.ai/model.glb' } })).toMatchObject({ state: 'completed', chargeCents: 40 });
    expect(await t.query(api.getManagedMeshyOperation, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-image' })).toMatchObject({ meshTaskId: '123e4567-e89b-12d3-a456-426614174000', meshResult: { status: 'succeeded' } });
    const rig = { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-rig', payloadFingerprint: 'rig-fingerprint', kind: 'meshy' as const, meshStage: 'rigging' as const, meshParentOperationId: 'mesh-image', maxCostCents: 7 };
    expect(await t.mutation(api.claimManagedInference, rig)).toMatchObject({ claimed: true, maxCostCents: 7 });
    await t.mutation(api.attachManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-rig', taskId: '123e4567-e89b-12d3-a456-426614174002' });
    await t.mutation(api.completeManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-rig', chargeCents: 7, result: { status: 'succeeded', walkingUrl: 'https://assets.meshy.ai/walking.glb' } });
    expect(await t.query(api.getManagedJob, { token, jobId: 'mesh-job' })).toMatchObject({ chargedMeshyCents: 47, chargedAiCents: 47 });
  });

  it('keeps a cancelled task held until reconciliation and settles a failed task at zero', async () => {
    const { t } = await setup();
    const image = { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-cancelled', payloadFingerprint: 'cancelled-fingerprint', kind: 'meshy' as const, meshStage: 'image-to-3d' as const, maxCostCents: 40 };
    await t.mutation(api.claimManagedInference, image);
    await t.mutation(api.attachManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-cancelled', taskId: '123e4567-e89b-12d3-a456-426614174001' });
    await t.mutation(api.requestManagedCancel, { token, jobId: 'mesh-job' });
    await expect(t.mutation(api.claimManagedInference, { ...image, operationId: 'mesh-new' })).rejects.toThrow('not authorized');
    expect(await t.mutation(api.listPendingMeshyOperations, {})).toEqual([{ jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-cancelled' }]);
    await t.mutation(api.completeManagedMeshyTask, { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'mesh-cancelled', chargeCents: 0, result: { status: 'failed' } });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 500, heldCents: 0 });
  });
});

// Real provider-to-ledger integration; only Meshy's remote HTTP is replaced.
describe('Meshy provider and durable ledger contract', () => {
  const response = (body: unknown, status = 200) => Response.json(body, { status });
  async function service() {
    const { t } = await setup();
    const { startMeshy, pollMeshy } = await import('../packages/modeling/meshy');
    const queries = new Set(['getManagedMeshyOperation']);
    const ledger = (async (name: string, args: any) => queries.has(name) ? t.query(api[name], args) : t.mutation(api[name], args)) as import('../packages/billing/ledgerClient').LedgerCall;
    const input = { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'contract-image', rate: mesh.meshyRate, stage: 'image-to-3d' as const, image: `data:image/jpeg;base64,${Buffer.from([255,216,255,0]).toString('base64')}` };
    return { t, ledger, input, startMeshy, pollMeshy };
  }
  it('attaches documented v7 IDs, prevents redispatch and settles only once', async () => {
    const { t, ledger, input, startMeshy, pollMeshy } = await service();
    const taskId = '018a210d-8ba4-705c-b111-1f1776f7f578';
    const fetcher = vi.fn().mockResolvedValueOnce(response({ result: taskId })).mockResolvedValueOnce(response({ id: taskId, status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/output/model.glb' } }));
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).resolves.toMatchObject({ taskId });
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).resolves.toMatchObject({ taskId, status: 'pending' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(pollMeshy(input, ledger, 'fixture', fetcher)).resolves.toMatchObject({ status: 'succeeded', chargeCents: 40 });
    await expect(pollMeshy(input, ledger, 'fixture', fetcher)).resolves.toMatchObject({ status: 'succeeded' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await t.query(api.getManagedJob, { token, jobId: input.jobId })).toMatchObject({ chargedAiCents: 40, chargedMeshyCents: 40, pendingAiCents: 0 });
    await expect(startMeshy({ ...input, humanoid: true }, ledger, 'fixture', fetcher)).rejects.toThrow('does not match');
  });
  it('releases a rejected admission without needing a nonexistent task ID', async () => {
    const { t, ledger, input, startMeshy } = await service();
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'rejected' }, 422));
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).rejects.toThrow('rejected');
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).resolves.toMatchObject({ status: 'failed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await t.query(api.getManagedJob, { token, jobId: input.jobId })).toMatchObject({ chargedMeshyCents: 0, pendingAiCents: 0 });
  });
  it('retains an uncertain POST hold and never dispatches it again', async () => {
    const { t, ledger, input, startMeshy } = await service();
    const fetcher = vi.fn().mockRejectedValue(new Error('connection lost'));
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).rejects.toThrow('uncertain');
    await expect(startMeshy(input, ledger, 'fixture', fetcher)).rejects.toThrow('already dispatched');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await t.query(api.getManagedJob, { token, jobId: input.jobId })).toMatchObject({ status: 'failed', chargedMeshyCents: 0, pendingAiCents: 40 });
  });
});

describe('Meshy allowance boundaries', () => {
  const claim = { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: 'bounded-image', payloadFingerprint: 'bounded-fingerprint', kind: 'meshy' as const, meshStage: 'image-to-3d' as const, maxCostCents: 40 };
  it('enforces exact prices, reference counts, generation counts and stale executors', async () => {
    const { t } = await setup();
    await expect(t.mutation(api.claimManagedInference, { ...claim, maxCostCents: 1 })).rejects.toThrow('stage cost');
    await expect(t.mutation(api.claimManagedInference, { ...claim, executorId: 'other' })).rejects.toThrow('Stale');
    const reference = { ...claim, operationId: 'bounded-ref', kind: 'asset-reference' as const, meshStage: undefined, maxCostCents: 10 };
    await t.mutation(api.claimManagedInference, reference);
    await t.mutation(api.completeManagedInference, { jobId: claim.jobId, executorId: claim.executorId, operationId: reference.operationId, chargeCents: 5 });
    await expect(t.mutation(api.claimManagedInference, { ...reference, operationId: 'second-ref' })).rejects.toThrow('reference allowance');
    expect(await t.query(api.getManagedJob, { token, jobId: claim.jobId })).toMatchObject({ chargedReferenceCents: 5 });
    await t.mutation(api.claimManagedInference, claim);
    await t.mutation(api.attachManagedMeshyTask, { jobId: claim.jobId, executorId: claim.executorId, operationId: claim.operationId, taskId: 'bounded-task' });
    const completion = { jobId: claim.jobId, executorId: claim.executorId, operationId: claim.operationId, chargeCents: 40, result: { status: 'succeeded' as const, modelUrl: 'https://assets.meshy.ai/bounded.glb' } };
    await t.mutation(api.completeManagedMeshyTask, completion);
    await expect(t.mutation(api.claimManagedInference, { ...claim, operationId: 'second-image' })).rejects.toThrow('allowance exhausted');
    await expect(t.mutation(api.completeManagedMeshyTask, { ...completion, chargeCents: 39 })).rejects.toThrow('Conflicting');
    expect(await t.query(api.getManagedMeshyOperation, { jobId: claim.jobId, executorId: 'other', operationId: claim.operationId })).toBeNull();
  });
  it('rejects a rig without owned success or rig permission', async () => {
    const { t } = await setup();
    const rig = { ...claim, operationId: 'bounded-rig', meshStage: 'rigging' as const, meshParentOperationId: 'missing', maxCostCents: 7 };
    await expect(t.mutation(api.claimManagedInference, rig)).rejects.toThrow('owned');
    await t.run(async ctx => {
      const row = await ctx.db.query('managedJobs').first();
      await ctx.db.patch(row!._id, { meshyAllowance: { ...mesh.meshyAllowance, allowRigging: false } });
    });
    await expect(t.mutation(api.claimManagedInference, rig)).rejects.toThrow('not allowed');
  });
  it('protects the review reserve from component images and Meshy work', async () => {
    const { t } = await setup();
    await t.run(async ctx => { const row = await ctx.db.query('managedJobs').first(); await ctx.db.patch(row!._id, { reservedAiCents: 130 }); });
    await expect(t.mutation(api.claimManagedInference, claim)).rejects.toThrow('review');
    await expect(t.mutation(api.claimManagedInference, { ...claim, kind: 'asset-reference', meshStage: undefined })).rejects.toThrow('review');
  });
});

it('rotates recovery past unrelated unresolved operations and failing known tasks', async () => {
  const { t } = await setup();
  await t.run(async ctx => {
    for (let i = 0; i < 70; i++) await ctx.db.insert('managedInferenceOperations', { jobId: 'old-job', executorId: 'old-worker', operationId: `unrelated-${i}`, payloadFingerprint: 'old', maxCostCents: 1, kind: 'modeling', state: 'unresolved', createdAt: i });
    for (let i = 0; i < 12; i++) await ctx.db.insert('managedInferenceOperations', { jobId: 'mesh-job', executorId: 'mesh-worker', operationId: `recover-${i}`, payloadFingerprint: 'mesh', maxCostCents: 40, kind: 'meshy', meshStage: 'image-to-3d', meshTaskId: `task-${i}`, needsMeshyPoll: true, meshLastPollAt: 0, state: 'unresolved', createdAt: i });
  });
  const first = await t.mutation(api.listPendingMeshyOperations, {});
  const second = await t.mutation(api.listPendingMeshyOperations, {});
  const third = await t.mutation(api.listPendingMeshyOperations, {});
  expect(first).toHaveLength(5); expect(second).toHaveLength(5);
  expect(new Set([...first, ...second, ...third].map(item => item.operationId)).size).toBe(12);
});

it('rejects an allowance that cannot cover one textured asset before reserving funds', async () => {
  const { t, create } = await setup();
  await expect(t.mutation(api.createManagedJob, { ...create, jobId: 'too-small-job', requestId: 'too-small-request', meshyAllowance: { ...mesh.meshyAllowance, budgetCents: 1 } })).rejects.toThrow('one textured generation');
});
