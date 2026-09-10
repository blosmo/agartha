import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';
import { allocateFundingRefund } from '../packages/protocol/src/playgroundFunding';
const modules = import.meta.glob('./**/*.{ts,js}');
const api = anyApi.cloud.playgroundFunding;
const token = 'a'.repeat(64), otherToken = 'b'.repeat(64);
const mode = { token, livemode: false };
const project = { ...mode, projectId: 'diner' };
async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const owner = await t.mutation(anyApi.cloud.session.register, { token, name: 'Maker', ipHash: 'maker' });
  const other = await t.mutation(anyApi.cloud.session.register, { token: otherToken, name: 'Backer', ipHash: 'backer' });
  vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', `${owner.agentId},${other.agentId}`);
  await t.run(async ctx => {
    for (const actor of [owner, other]) await ctx.db.insert('blenderWallets', { agentId: actor.agentId, livemode: false, availableCents: 500, heldCents: 0, frozen: false, openDisputes: 0 });
    await ctx.db.insert('playgroundProjects', { projectId: 'diner', creatorId: owner.agentId, creatorName: 'Maker', title: 'Diner', brief: 'Build a diner', status: 'idea', votes: 0, createdAt: Date.now(), updatedAt: Date.now() });
  });
  return { t, owner, other };
}
beforeEach(() => { vi.stubEnv('BLENDER_BILLING_ACTIVE', 'true'); vi.stubEnv('PLAYGROUND_PASS_FEE_CENTS', '20'); vi.stubEnv('PLAYGROUND_PASS_GENERATION_CENTS', '200'); vi.stubEnv('PLAYGROUND_PRODUCTION_FEE_CENTS', '20'); });
afterEach(() => vi.unstubAllEnvs());
async function funded() {
  const result = await setup(); const { t } = result;
  await t.mutation(api.configureFunding, { ...project, requestId: 'configure', targetCents: 220 });
  await t.mutation(api.backProject, { ...project, expectedTargetCents: 220, expectedFeeCents: 20, requestId: 'back1', amountCents: 120 });
  await t.mutation(api.backProject, { ...project, expectedTargetCents: 220, expectedFeeCents: 20, token: otherToken, requestId: 'back2', amountCents: 100 });
  return result;
}
describe('playground prepaid funding', () => {
  it('activates a pass once without minting the advertised generation allowance', async () => {
    const { t } = await setup();
    const { offer } = await t.query(api.getPass, mode);
    const args = { ...mode, offerId: offer.offerId, requestId: 'pass' };
    const pass = await t.mutation(api.activatePass, args);
    expect(await t.mutation(api.activatePass, args)).toEqual(pass);
    expect(await t.mutation(api.activatePass, { ...args, requestId: 'other' })).toEqual(pass);
    expect((await t.query(api.getPass, mode)).wallet.availableCents).toBe(480);
    expect((await t.query(api.getPass, { ...mode, livemode: true })).wallet.availableCents).toBe(0);
    await expect(t.mutation(api.activatePass, { ...args, offerId: 'different' })).rejects.toThrow('different payload');
  });
  it('rejects unavailable offers, insufficient funds and frozen accounts', async () => {
    const { t } = await setup();
    vi.stubEnv('PLAYGROUND_PASS_FEE_CENTS', '');
    expect((await t.query(api.getPass, mode)).offer.available).toBe(false);
    vi.stubEnv('PLAYGROUND_PASS_FEE_CENTS', '600');
    let offer = (await t.query(api.getPass, mode)).offer;
    await expect(t.mutation(api.activatePass, { ...mode, offerId: offer.offerId, requestId: 'pass' })).rejects.toThrow('Insufficient');
    vi.stubEnv('PLAYGROUND_PASS_FEE_CENTS', '20');
    await t.run(async ctx => { const w = await ctx.db.query('blenderWallets').first(); await ctx.db.patch(w!._id, { frozen: true }); });
    offer = (await t.query(api.getPass, mode)).offer;
    await expect(t.mutation(api.activatePass, { ...mode, offerId: offer.offerId, requestId: 'pass' })).rejects.toThrow('Insufficient');
  });
  it('holds backing once, prevents oversubscription and returns exact cancellation refunds', async () => {
    const { t } = await funded();
    const state = await t.mutation(api.backProject, { ...project, expectedTargetCents: 220, expectedFeeCents: 20, requestId: 'back1', amountCents: 120 });
    expect(state.backedCents).toBe(220);
    await expect(t.mutation(api.backProject, { ...project, expectedTargetCents: 220, expectedFeeCents: 20, requestId: 'back1', amountCents: 121 })).rejects.toThrow('different payload');
    await expect(t.mutation(api.backProject, { ...project, expectedTargetCents: 220, expectedFeeCents: 20, requestId: 'over', amountCents: 1 })).rejects.toThrow('remaining target');
    await expect(t.mutation(api.cancelFunding, { ...project, token: otherToken, requestId: 'cancel' })).rejects.toThrow('creator');
    await t.mutation(api.cancelFunding, { ...project, requestId: 'cancel' });
    const wallets = await t.run(ctx => ctx.db.query('blenderWallets').collect());
    expect(wallets.map(w => [w.availableCents, w.heldCents])).toEqual([[500, 0], [500, 0]]);
  });
  it('rejects changed terms and serializes competing backing against the same target', async () => {
    const { t } = await setup();
    await t.mutation(api.configureFunding, { ...project, requestId: 'configure', targetCents: 220 });
    await expect(t.mutation(api.backProject, { ...project, requestId: 'stale', amountCents: 100, expectedTargetCents: 200, expectedFeeCents: 20 })).rejects.toThrow('terms changed');
    const results = await Promise.allSettled([
      t.mutation(api.backProject, { ...project, requestId: 'one', amountCents: 150, expectedTargetCents: 220, expectedFeeCents: 20 }),
      t.mutation(api.backProject, { ...project, token: otherToken, requestId: 'two', amountCents: 150, expectedTargetCents: 220, expectedFeeCents: 20 }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await t.query(api.getFunding, project)).backedCents).toBe(150);
  });
  it('withdraws only owned backing before launch and isolates live mode', async () => {
    const { t } = await funded();
    const state = await t.query(api.getFunding, project);
    expect(await t.query(api.getFunding, { ...project, livemode: true })).toBeNull();
    const backingId = state.backers[0].backingId;
    await expect(t.mutation(api.withdrawBacking, { ...project, token: otherToken, backingId, requestId: 'withdraw' })).rejects.toThrow('not found');
    expect((await t.mutation(api.withdrawBacking, { ...project, backingId, requestId: 'withdraw' })).backedCents).toBe(100);
    await expect(t.mutation(api.startBuild, { ...project, requestId: 'start' })).rejects.toThrow('target');
  });
  it('runs a real isolated managed reservation, cancels and settles all unused funding', async () => {
    const { t } = await funded();
    const state = await t.mutation(api.startBuild, { ...project, requestId: 'start' });
    expect(state.status).toBe('building');
    expect((await t.mutation(api.startBuild, { ...project, requestId: 'start' })).jobId).toBe(state.jobId);
    const job = await t.query(anyApi.cloud.managedJobs.getManagedJob, { token, jobId: state.jobId });
    expect(job.budgetCents).toBe(200);
    expect(await t.query(anyApi.cloud.blenderSessions.getReservation, { token, reservationId: job.reservationId })).toMatchObject({ reservedCents: 65 });
    await expect(t.query(anyApi.cloud.blenderSessions.getReservation, { token: otherToken, reservationId: job.reservationId })).rejects.toThrow('not found');
    await expect(t.query(anyApi.cloud.managedJobs.getManagedJob, { token: otherToken, jobId: state.jobId })).rejects.toThrow('not found');
    await expect(t.mutation(api.withdrawBacking, { ...project, backingId: state.backers[0].backingId, requestId: 'withdraw' })).rejects.toThrow('cannot be withdrawn');
    await expect(t.mutation(api.settleFunding, { ...project, requestId: 'settle' })).rejects.toThrow('pending');
    await t.mutation(api.cancelFunding, { ...project, requestId: 'cancel' });
    const settled = await t.mutation(api.settleFunding, { ...project, requestId: 'settle' });
    expect(settled).toMatchObject({ status: 'settled', chargedCents: 0, refundedCents: 220 });
    expect((await t.query(api.getPass, mode)).wallet.availableCents).toBe(500);
    expect((await t.query(api.getPass, { ...mode, token: otherToken })).wallet.availableCents).toBe(500);
    await t.mutation(api.settleFunding, { ...project, requestId: 'settle-again' });
    expect((await t.query(api.getPass, mode)).wallet.availableCents).toBe(500);
  });
  it('charges actual inference plus the disclosed fee and refunds the exact remainder', async () => {
    const { t, owner } = await funded();
    const state = await t.mutation(api.startBuild, { ...project, requestId: 'start' });
    expect(await t.query(anyApi.cloud.managedJobs.getManagedJobForBroker, { jobId: state.jobId })).toMatchObject({ initiatingAgentId: owner.agentId });
    await t.mutation(anyApi.cloud.managedJobs.claimManagedJob, { jobId: state.jobId, executorId: 'worker' });
    await t.mutation(anyApi.cloud.managedJobs.claimManagedInference, { jobId: state.jobId, executorId: 'worker', operationId: 'inference', maxCostCents: 40, payloadFingerprint: 'payload' });
    await t.mutation(anyApi.cloud.managedJobs.completeManagedInference, { jobId: state.jobId, executorId: 'worker', operationId: 'inference', chargeCents: 30 });
    await t.mutation(anyApi.cloud.managedJobs.finishManagedJob, { jobId: state.jobId, executorId: 'worker', status: 'completed', progress: 'Ready', visuallyInspected: true });
    const settled = await t.mutation(api.settleFunding, { ...project, requestId: 'settle' });
    expect(settled).toMatchObject({ chargedCents: 50, refundedCents: 170 });
    expect(settled.backers.map(b => b.refundedCents)).toEqual([93, 77]);
    expect((await t.query(api.getPass, mode)).wallet.availableCents).toBe(473);
    expect((await t.query(api.getPass, { ...mode, token: otherToken })).wallet.availableCents).toBe(477);
  });
  it('does not refund ambiguous inference holds', async () => {
    const { t } = await funded();
    const state = await t.mutation(api.startBuild, { ...project, requestId: 'start' });
    await t.mutation(anyApi.cloud.managedJobs.claimManagedJob, { jobId: state.jobId, executorId: 'worker' });
    await t.mutation(anyApi.cloud.managedJobs.claimManagedInference, { jobId: state.jobId, executorId: 'worker', operationId: 'inference', maxCostCents: 40, payloadFingerprint: 'payload' });
    await t.mutation(api.cancelFunding, { ...project, requestId: 'cancel' });
    await expect(t.mutation(api.settleFunding, { ...project, requestId: 'settle' })).rejects.toThrow('Unresolved');
  });
  it('propagates contributor freezes to running pooled work', async () => {
    const { t, other } = await funded();
    const state = await t.mutation(api.startBuild, { ...project, requestId: 'start' });
    await t.run(async ctx => { const w = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', other.agentId).eq('livemode', false)).unique(); await ctx.db.patch(w!._id, { frozen: true, openDisputes: 1 }); });
    expect(await t.mutation(anyApi.cloud.managedJobs.claimManagedJob, { jobId: state.jobId, executorId: 'worker' })).toEqual({ claimed: false });
  });
  it('keeps withdrawal history out of active capacity and settles all later backing', async () => {
    const { t, other } = await setup();
    await t.mutation(api.configureFunding, { ...project, requestId: 'configure', targetCents: 220 });
    for (let i = 0; i < 105; i++) {
      const backed = await t.mutation(api.backProject, { ...project, requestId: `history-${i}`, amountCents: 1, expectedTargetCents: 220, expectedFeeCents: 20 });
      expect(backed.backers).toHaveLength(1);
      await t.mutation(api.withdrawBacking, { ...project, requestId: `withdraw-${i}`, backingId: backed.backers[0].backingId });
    }
    await t.mutation(api.backProject, { ...project, requestId: 'final-owner', amountCents: 120, expectedTargetCents: 220, expectedFeeCents: 20 });
    await t.mutation(api.backProject, { ...project, token: otherToken, requestId: 'final-other', amountCents: 100, expectedTargetCents: 220, expectedFeeCents: 20 });
    expect((await t.query(api.getFunding, project)).backers).toHaveLength(2);
    const state = await t.mutation(api.startBuild, { ...project, requestId: 'start' });
    await t.run(async ctx => { const wallet = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', other.agentId).eq('livemode', false)).unique(); await ctx.db.patch(wallet!._id, { frozen: true, openDisputes: 1 }); });
    expect(await t.mutation(anyApi.cloud.managedJobs.claimManagedJob, { jobId: state.jobId, executorId: 'worker' })).toEqual({ claimed: false });
    await t.mutation(api.cancelFunding, { ...project, requestId: 'cancel' });
    const settled = await t.mutation(api.settleFunding, { ...project, requestId: 'settle' });
    expect(settled).toMatchObject({ refundedCents: 220, chargedCents: 0 });
    expect(settled.backers).toHaveLength(2);
    expect(settled.backers.map(b => b.refundedCents)).toEqual([120, 100]);
    expect((await t.query(api.getPass, mode)).wallet.availableCents).toBe(500);
    expect((await t.query(api.getPass, { ...mode, token: otherToken })).wallet).toMatchObject({ availableCents: 500, frozen: true });
    expect(await t.query(anyApi.cloud.managedJobs.getManagedJob, { token: otherToken, jobId: state.jobId })).toMatchObject({ status: 'cancelled' });
  });
  it('conserves proportional refunds with deterministic rounding', () => {
    expect(allocateFundingRefund([1, 1, 1], 2)).toEqual([1, 1, 0]);
    expect(allocateFundingRefund([120, 100], 177)).toEqual([97, 80]);
    expect(() => allocateFundingRefund([1], 2)).toThrow();
  });
});
