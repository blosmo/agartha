import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { describe, expect, it } from 'vitest';
import schema from './schema';
const modules = import.meta.glob('./**/*.{ts,js}');
const token = 'a'.repeat(64), recoveryToken = 'b'.repeat(64);
const candidateToken = 'c'.repeat(64), candidateRecoveryToken = 'd'.repeat(64);
const args = { candidateToken, candidateRecoveryToken, name: 'Visitor', ipHash: 'browser' };
const api = anyApi.cloud.browserIdentity;
async function setup(withRecovery = true) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const actor = await t.mutation(anyApi.cloud.session.register, { token, name: 'Original', ipHash: 'original', ...(withRecovery ? { recoveryToken } : {}) });
  await t.run(async ctx => { await ctx.db.insert('blenderWallets', { agentId: actor.agentId, livemode: false, availableCents: 1500, heldCents: 200, frozen: false, openDisputes: 0 }); });
  return { t, actor };
}
describe('recoverable browser identity', () => {
  it('renews an expired browser credential without abandoning its credited wallet', async () => {
    const { t, actor } = await setup();
    await t.run(async ctx => { const row = await ctx.db.query('cloudSessions').first(); await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 }); });
    const renewed = await t.mutation(api.ensure, { ...args, token, recoveryAgentId: actor.agentId, recoveryToken });
    expect(renewed).toMatchObject({ agentId: actor.agentId, accessToken: token, recoveryToken, recoverable: true });
    expect(await t.query(anyApi.cloud.purchases.balance, { token: renewed.accessToken, livemode: false })).toMatchObject({ availableCents: 1500, heldCents: 200 });
    expect(await t.run(ctx => ctx.db.query('cloudSessions').collect())).toHaveLength(1);
  });
  it('restores lost access using the separate recovery proof while preserving funds', async () => {
    const { t, actor } = await setup();
    const restored = await t.mutation(api.ensure, { ...args, recoveryAgentId: actor.agentId, recoveryToken, restore: true });
    expect(restored).toMatchObject({ agentId: actor.agentId, accessToken: candidateToken });
    expect(await t.query(anyApi.cloud.purchases.balance, { token: candidateToken, livemode: false })).toMatchObject({ availableCents: 1500, heldCents: 200 });
    await expect(t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).rejects.toThrow();
  });
  it('adopts legacy valid access without altering an existing recovery proof', async () => {
    const { t, actor } = await setup();
    const adopted = await t.mutation(api.ensure, { ...args, token });
    expect(adopted).toMatchObject({ agentId: actor.agentId, recoverable: false, recoveryConfigured: true });
    expect(adopted).not.toHaveProperty('recoveryToken');
    expect(await t.mutation(api.ensure, { ...args, recoveryAgentId: actor.agentId, recoveryToken, restore: true })).toMatchObject({ agentId: actor.agentId });
    await expect(t.mutation(api.ensure, { ...args, recoveryAgentId: actor.agentId, recoveryToken: candidateRecoveryToken, restore: true })).rejects.toThrow('invalid');
  });
  it('adds recovery only to a current identity with none configured', async () => {
    const { t, actor } = await setup(false);
    const adopted = await t.mutation(api.ensure, { ...args, token });
    expect(adopted).toMatchObject({ agentId: actor.agentId, recoveryToken: candidateRecoveryToken, recoverable: true });
    expect(await t.mutation(api.ensure, { ...args, recoveryAgentId: actor.agentId, recoveryToken: candidateRecoveryToken })).toMatchObject({ agentId: actor.agentId });
  });
  it('never silently creates a new identity for expired, retired or invalid access', async () => {
    const { t } = await setup(false);
    await t.run(async ctx => { const row = await ctx.db.query('cloudSessions').first(); await ctx.db.patch(row!._id, { expiresAt: 0 }); });
    await expect(t.mutation(api.ensure, { ...args, token })).rejects.toThrow('Restore');
    await expect(t.mutation(api.ensure, { ...args, token: 'e'.repeat(64) })).rejects.toThrow('Restore');
    expect(await t.run(ctx => ctx.db.query('cloudSessions').collect())).toHaveLength(1);
  });
  it('never restores a revoked identity even with its recovery proof', async () => {
    const { t, actor } = await setup();
    await t.run(async ctx => { const row = await ctx.db.query('cloudSessions').first(); await ctx.db.patch(row!._id, { revoked: true }); });
    await expect(t.mutation(api.ensure, { ...args, recoveryAgentId: actor.agentId, recoveryToken, restore: true })).rejects.toThrow('invalid');
  });
  it('creates a fresh identity only without prior browser credentials', async () => {
    const t = convexTest({ schema, modules });
    expect(await t.mutation(api.ensure, args)).toMatchObject({ accessToken: candidateToken, recoveryToken: candidateRecoveryToken, recoverable: true });
  });
});
