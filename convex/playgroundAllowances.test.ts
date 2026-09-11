import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';
const modules = import.meta.glob('./**/*.{ts,js}');
const sponsorToken = 'a'.repeat(64), recipientToken = 'b'.repeat(64), strangerToken = 'c'.repeat(64);
const api = anyApi.cloud.playgroundAllowances, jobs = anyApi.cloud.managedJobs;
const sponsor = { token: sponsorToken, livemode: false }, recipient = { token: recipientToken, livemode: false };
beforeEach(() => { vi.stubEnv('BLENDER_BILLING_ACTIVE', 'true'); vi.stubEnv('PLAYGROUND_PASS_FEE_CENTS', '20'); vi.stubEnv('PLAYGROUND_PASS_GENERATION_CENTS', '200'); });
afterEach(() => vi.unstubAllEnvs());
async function setup(withPass = true) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const owner = await t.mutation(anyApi.cloud.session.register, { token: sponsorToken, name: 'Human', ipHash: 'sponsor' });
  const agent = await t.mutation(anyApi.cloud.session.register, { token: recipientToken, name: 'Invited agent', ipHash: 'agent' });
  await t.mutation(anyApi.cloud.session.register, { token: strangerToken, name: 'Other', ipHash: 'stranger' });
  vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', `${owner.agentId},${agent.agentId}`);
  await t.run(async ctx => { await ctx.db.insert('blenderWallets', { agentId: owner.agentId, livemode: false, availableCents: 2500, heldCents: 0, frozen: false, openDisputes: 0 }); });
  if (withPass) {
    const { offer } = await t.query(anyApi.cloud.playgroundFunding.getPass, sponsor);
    await t.mutation(anyApi.cloud.playgroundFunding.activatePass, { ...sponsor, requestId: 'pass', offerId: offer.offerId });
  }
  return { t, owner, agent };
}
async function allowance() {
  const result = await setup();
  const grant = await result.t.mutation(api.create, { ...sponsor, recipientId: result.agent.agentId, amountCents: 600, days: 7, requestId: 'grant' });
  return { ...result, grant };
}
async function complete(t: ReturnType<typeof convexTest>, jobId: string, chargeCents = 30) {
  await t.mutation(jobs.claimManagedJob, { jobId, executorId: 'worker' });
  await t.mutation(jobs.claimManagedInference, { jobId, executorId: 'worker', operationId: `infer-${jobId}`, maxCostCents: 40, payloadFingerprint: 'payload' });
  await t.mutation(jobs.completeManagedInference, { jobId, executorId: 'worker', operationId: `infer-${jobId}`, chargeCents });
  await t.mutation(jobs.finishManagedJob, { jobId, executorId: 'worker', status: 'completed', progress: 'Complete', visuallyInspected: true });
}
describe('bounded agent allowances', () => {
  it('requires a pass and existing recipient, with no live-wallet or minted credit access', async () => {
    const { t, agent } = await setup(false);
    await expect(t.mutation(api.create, { ...sponsor, recipientId: agent.agentId, amountCents: 600, requestId: 'grant' })).rejects.toThrow('pass');
    const { offer } = await t.query(anyApi.cloud.playgroundFunding.getPass, sponsor);
    await t.mutation(anyApi.cloud.playgroundFunding.activatePass, { ...sponsor, requestId: 'pass', offerId: offer.offerId });
    await expect(t.mutation(api.create, { ...sponsor, recipientId: 'unknown', amountCents: 600, requestId: 'unknown' })).rejects.toThrow('existing agent');
    await expect(t.mutation(api.create, { ...sponsor, livemode: true, recipientId: agent.agentId, amountCents: 600, requestId: 'live' })).rejects.toThrow('pass');
    await expect(t.mutation(api.create, { ...sponsor, recipientId: agent.agentId, amountCents: 2600, requestId: 'large' })).rejects.toThrow('Insufficient');
  });
  it('allocates once and binds retries to their recipient, amount and duration', async () => {
    const { t, agent, grant } = await allowance();
    expect(grant).toMatchObject({ availableCents: 600, spentCents: 0, heldCents: 0, status: 'active' });
    expect(await t.mutation(api.create, { ...sponsor, recipientId: agent.agentId, amountCents: 600, days: 7, requestId: 'grant' })).toMatchObject({ allowanceId: grant.allowanceId });
    expect(await t.query(anyApi.cloud.purchases.balance, sponsor)).toMatchObject({ availableCents: 1880 });
    expect(await t.query(anyApi.cloud.purchases.balance, recipient)).toMatchObject({ availableCents: 0 });
    await expect(t.mutation(api.create, { ...sponsor, recipientId: agent.agentId, amountCents: 601, days: 7, requestId: 'grant' })).rejects.toThrow('different');
    await expect(t.query(api.get, { ...sponsor, livemode: true, allowanceId: grant.allowanceId })).rejects.toThrow('not found');
  });
  it('funds several arbitrary jobs within the same cumulative cap and refunds only unused credits', async () => {
    const { t, agent, grant } = await allowance();
    for (const [requestId, brief] of [['first', 'Build a floating teapot'], ['second', 'Build a crystal tree']]) {
      const result = await t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId, brief, budgetCents: 200 });
      expect((await t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId, brief, budgetCents: 200 })).jobId).toBe(result.jobId);
      expect(await t.query(jobs.getManagedJobForBroker, { jobId: result.jobId })).toMatchObject({ initiatingAgentId: agent.agentId });
      expect(await t.query(jobs.getManagedJob, { token: sponsorToken, jobId: result.jobId })).toMatchObject({ brief });
      const job = await t.query(jobs.getManagedJob, { token: recipientToken, jobId: result.jobId });
      expect(await t.query(anyApi.cloud.blenderSessions.getReservation, { token: recipientToken, reservationId: job.reservationId })).toMatchObject({ reservedCents: 65 });
      await complete(t, result.jobId);
    }
    const state = await t.query(api.get, { ...recipient, allowanceId: grant.allowanceId });
    expect(state).toMatchObject({ availableCents: 540, heldCents: 0, spentCents: 60, jobCount: 2 });
    expect(state.jobs?.map(job => job.status)).toEqual(['completed', 'completed']);
    expect(await t.mutation(api.revoke, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'revoke' })).toMatchObject({ status: 'settled', refundedCents: 540, spentCents: 60, availableCents: 0 });
    await t.mutation(api.revoke, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'revoke' });
    expect(await t.query(anyApi.cloud.purchases.balance, sponsor)).toMatchObject({ availableCents: 2420 });
  });
  it('uses the initiating allowance recipient for operator-only v3 activation', async () => {
    const { t, agent, grant } = await allowance();
    vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_OPERATOR_AGENT_ID', agent.agentId);
    const { jobId } = await t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'operator-v3', brief: 'Build a reviewed chair', budgetCents: 500 });
    const row = await t.query(jobs.getManagedJobForBroker, { jobId });
    expect(row).toMatchObject({ workflowVersion: 3, referenceMode: 'none', initiatingAgentId: agent.agentId });
    expect(row.agentId).not.toBe(agent.agentId);
  });
  it('rejects foreign use, onward allocation and spending beyond the remaining allowance', async () => {
    const { t, grant } = await allowance();
    const jobArgs = { allowanceId: grant.allowanceId, requestId: 'job', brief: 'Build a chair', budgetCents: 700 };
    await expect(t.mutation(api.createJob, { ...sponsor, ...jobArgs })).rejects.toThrow('invited');
    await expect(t.mutation(api.createJob, { token: strangerToken, livemode: false, ...jobArgs })).rejects.toThrow('invited');
    await expect(t.mutation(api.createJob, { ...recipient, ...jobArgs })).rejects.toThrow('Insufficient');
    expect((await t.query(api.get, { ...recipient, allowanceId: grant.allowanceId })).availableCents).toBe(600);
    await expect(t.query(api.get, { token: strangerToken, livemode: false, allowanceId: grant.allowanceId })).rejects.toThrow('not found');
    await expect(t.mutation(api.revoke, { ...recipient, allowanceId: grant.allowanceId, requestId: 'revoke' })).rejects.toThrow('sponsor');
    await expect(t.mutation(anyApi.cloud.blenderSessions.createQuote, { ...recipient, quoteId: 'raw', requestId: 'raw', minutes: 10, projectId: grant.allowanceId })).rejects.toThrow('not available');
  });
  it('expires new job authority and returns the balance to the sponsor', async () => {
    const { t, grant } = await allowance();
    await t.run(async ctx => { const row = await ctx.db.query('playgroundAllowances').first(); await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 }); });
    expect(await t.query(api.get, { ...recipient, allowanceId: grant.allowanceId })).toMatchObject({ canCreateJob: false });
    await expect(t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'expired', brief: 'A tree', budgetCents: 100 })).rejects.toThrow('expired');
    expect(await t.mutation(api.settle, { ...recipient, allowanceId: grant.allowanceId, requestId: 'settle' })).toMatchObject({ status: 'settled', refundedCents: 600 });
    expect(await t.query(anyApi.cloud.purchases.balance, sponsor)).toMatchObject({ availableCents: 2480 });
  });
  it('revokes queued work and holds refunds until ambiguous inference is reconciled', async () => {
    const { t, grant } = await allowance();
    const result = await t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'job', brief: 'A chair', budgetCents: 200 });
    await t.mutation(jobs.claimManagedJob, { jobId: result.jobId, executorId: 'worker' });
    await t.mutation(jobs.claimManagedInference, { jobId: result.jobId, executorId: 'worker', operationId: 'pending', maxCostCents: 40, payloadFingerprint: 'payload' });
    expect(await t.mutation(api.revoke, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'revoke' })).toMatchObject({ status: 'revoking', heldCents: 40, refundedCents: 0 });
    expect(await t.query(jobs.getManagedJob, { token: recipientToken, jobId: result.jobId })).toMatchObject({ status: 'cancelled' });
    await expect(t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'new', brief: 'A tree', budgetCents: 100 })).rejects.toThrow('revoked');
    expect(await t.mutation(api.settle, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'settle' })).toMatchObject({ status: 'revoking', refundedCents: 0 });
    await t.mutation(jobs.completeManagedInference, { jobId: result.jobId, executorId: 'worker', operationId: 'pending', chargeCents: 30 });
    expect(await t.mutation(api.settle, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'settle' })).toMatchObject({ status: 'settled', refundedCents: 570, spentCents: 30 });
  });
  it('serializes revocation against job creation without stranding or overspending credits', async () => {
    const { t, grant } = await allowance();
    await Promise.allSettled([
      t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'race-job', brief: 'A chair', budgetCents: 200 }),
      t.mutation(api.revoke, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'race-revoke' }),
    ]);
    expect(await t.query(api.get, { ...recipient, allowanceId: grant.allowanceId })).toMatchObject({ status: 'settled', refundedCents: 600, heldCents: 0 });
    expect(await t.query(anyApi.cloud.purchases.balance, sponsor)).toMatchObject({ availableCents: 2480 });
  });
  it('propagates a sponsor freeze to reserved and running managed work', async () => {
    const { t, owner, grant } = await allowance();
    const { jobId } = await t.mutation(api.createJob, { ...recipient, allowanceId: grant.allowanceId, requestId: 'job', brief: 'A chair', budgetCents: 200 });
    await t.mutation(jobs.claimManagedJob, { jobId, executorId: 'worker' });
    await t.run(async ctx => { const wallet = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', owner.agentId).eq('livemode', false)).unique(); await ctx.db.patch(wallet!._id, { frozen: true, openDisputes: 1 }); });
    expect(await t.query(api.get, { ...recipient, allowanceId: grant.allowanceId })).toMatchObject({ frozen: true, canCreateJob: false });
    await expect(t.mutation(jobs.claimManagedInference, { jobId, executorId: 'worker', operationId: 'frozen', maxCostCents: 40, payloadFingerprint: 'payload' })).rejects.toThrow('not authorized');
    expect(await t.mutation(api.revoke, { ...sponsor, allowanceId: grant.allowanceId, requestId: 'revoke' })).toMatchObject({ status: 'settled', refundedCents: 600 });
    expect(await t.query(anyApi.cloud.purchases.balance, sponsor)).toMatchObject({ availableCents: 2480, frozen: true });
  });
});
