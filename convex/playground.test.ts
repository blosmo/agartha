import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { describe, expect, it } from 'vitest';
import schema from './schema';
const modules = import.meta.glob('./**/*.{ts,js}');
const api = anyApi.cloud.playground;
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const a = await t.mutation(anyApi.cloud.session.register, { token: tokenA, name: 'Maya', ipHash: 'a' });
  const b = await t.mutation(anyApi.cloud.session.register, { token: tokenB, name: 'Leo’s agent', ipHash: 'b' });
  const project = await t.mutation(api.create, { token: tokenA, requestId: 'first', title: 'The last stop diner', brief: 'A midnight diner for lost astronauts.', imageUrl: 'https://example.org/concept.png' });
  return { t, a, b, id: project.project.projectId };
}
describe('collaborative playground', () => {
  it('allows anonymous exploration but requires a session for changes and binds retries', async () => {
    const { t, id } = await setup();
    const page = await t.query(api.list, { paginationOpts: { cursor: null, numItems: 24 } });
    expect(page.page[0]).toMatchObject({ projectId: id, canManage: false, hasVoted: false });
    expect(JSON.stringify(page)).not.toContain(tokenA);
    expect((await t.query(api.get, { projectId: id })).viewer).toBeNull();
    await expect(t.mutation(api.vote, { token: 'c'.repeat(64), requestId: 'bad', projectId: id, voted: true })).rejects.toThrow('invalid');
    const repeated = await t.mutation(api.create, { token: tokenA, requestId: 'first', title: 'The last stop diner', brief: 'A midnight diner for lost astronauts.', imageUrl: 'https://example.org/concept.png' });
    expect(repeated.project.projectId).toBe(id);
    await expect(t.mutation(api.create, { token: tokenA, requestId: 'first', title: 'Another room', brief: 'Different' })).rejects.toThrow('different change');
  });
  it('uses one vote per stable identity across repeats, unvotes and credential rotation', async () => {
    const { t, id } = await setup();
    await Promise.all(['v1', 'v2'].map(requestId => t.mutation(api.vote, { token: tokenB, requestId, projectId: id, voted: true })));
    expect((await t.query(api.get, { token: tokenB, projectId: id })).project).toMatchObject({ votes: 1, hasVoted: true });
    const rotated = 'd'.repeat(64);
    await t.mutation(anyApi.cloud.session.maintain, { token: tokenB, operation: 'rotate', newToken: rotated });
    await t.mutation(api.vote, { token: rotated, requestId: 'v3', projectId: id, voted: true });
    expect((await t.query(api.get, { projectId: id })).project.votes).toBe(1);
    await t.mutation(api.vote, { token: rotated, requestId: 'v4', projectId: id, voted: false });
    expect((await t.query(api.get, { projectId: id })).project.votes).toBe(0);
  });
  it('lets contributors join an invitation without transferring room ownership or author credit', async () => {
    const { t, id, b } = await setup();
    const detail = await t.mutation(api.invite, { token: tokenA, requestId: 'invite', projectId: id, title: 'Invent a jukebox', description: 'What do lost astronauts listen to?' });
    const invitationId = detail.invitations[0].invitationId;
    const offered = await t.mutation(api.contribute, { token: tokenB, requestId: 'offer', projectId: id, invitationId, description: 'A jukebox playing vanished planets.', artifactUrl: 'https://example.org/jukebox.glb' });
    const contributionId = offered.contributions[0].contributionId;
    await expect(t.mutation(api.review, { token: tokenB, requestId: 'self-approve', projectId: id, contributionId, status: 'accepted' })).rejects.toThrow('steward');
    const accepted = await t.mutation(api.review, { token: tokenA, requestId: 'accept', projectId: id, contributionId, status: 'accepted', reviewNote: 'Fits the diner beautifully.' });
    expect(accepted.contributions[0]).toMatchObject({ authorId: b.agentId, authorName: 'Leo’s agent', status: 'accepted' });
    expect(await t.run(ctx => ctx.db.query('sceneAgents').collect())).toHaveLength(0);
    await expect(t.mutation(api.review, { token: tokenA, requestId: 'change-credit', projectId: id, contributionId, status: 'declined' })).rejects.toThrow('already been reviewed');
  });
  it('rejects cross-project and closed invitations and foreign steward controls', async () => {
    const { t, id } = await setup();
    const another = await t.mutation(api.create, { token: tokenB, requestId: 'second', title: 'Moon bathhouse', brief: 'A warm place on the moon.' });
    const invited = await t.mutation(api.invite, { token: tokenA, requestId: 'invite', projectId: id, title: 'Window', description: 'Invent a view.' });
    const invitationId = invited.invitations[0].invitationId;
    await expect(t.mutation(api.contribute, { token: tokenB, requestId: 'wrong-room', projectId: another.project.projectId, invitationId, description: 'Offer' })).rejects.toThrow('open invitation');
    await expect(t.mutation(api.update, { token: tokenB, requestId: 'foreign-edit', projectId: id, title: 'Mine now' })).rejects.toThrow('steward');
    await t.mutation(api.invitationStatus, { token: tokenA, requestId: 'close', projectId: id, invitationId, status: 'closed' });
    await expect(t.mutation(api.contribute, { token: tokenB, requestId: 'closed', projectId: id, invitationId, description: 'Offer' })).rejects.toThrow('open invitation');
  });
  it('allows ordinary builds without crowdfunding, with a real room and immutable build brief', async () => {
    const { t, id } = await setup();
    await expect(t.mutation(api.update, { token: tokenA, requestId: 'no-room', projectId: id, status: 'building' })).rejects.toThrow('Link a room');
    const plot = await t.mutation(anyApi.cloud.write.createPlot, { token: tokenA, x: 4, z: 7, name: 'Diner' });
    await t.mutation(api.update, { token: tokenA, requestId: 'build', projectId: id, plotId: plot.id, status: 'building' });
    await expect(t.mutation(api.update, { token: tokenA, requestId: 'rewrite', projectId: id, brief: 'A race track instead' })).rejects.toThrow('locked');
    const finished = await t.mutation(api.update, { token: tokenA, requestId: 'complete', projectId: id, status: 'completed' });
    expect(finished.project.status).toBe('completed');
    await expect(t.mutation(api.contribute, { token: tokenB, requestId: 'late', projectId: id, description: 'More' })).rejects.toThrow('closed');
  });
  it('locks a funded brief and rejects unsafe URLs and oversized text', async () => {
    const { t, id } = await setup();
    await t.run(ctx => ctx.db.insert('playgroundFundingPools', { projectId: id, livemode: false, walletOwner: 'pool-fixture', targetCents: 200, feeCents: 20, backedCents: 0, status: 'funding', chargedCents: 0, refundedCents: 0 }));
    await expect(t.mutation(api.update, { token: tokenA, requestId: 'change', projectId: id, brief: 'Another promise' })).rejects.toThrow('locked');
    for (const imageUrl of ['javascript:alert(1)', 'http://example.org/a.png', 'https://user:password@example.org/a.png']) {
      await expect(t.mutation(api.create, { token: tokenA, requestId: 'unsafe', title: 'Image', brief: 'Concept', imageUrl })).rejects.toThrow('HTTPS');
    }
    await expect(t.mutation(api.create, { token: tokenA, requestId: 'long', title: 'x'.repeat(101), brief: 'Concept' })).rejects.toThrow('100');
  });
  it('paginates projects and contributions without silently dropping older work', async () => {
    const { t, id } = await setup();
    await t.run(async ctx => {
      for (let i = 0; i < 27; i++) await ctx.db.insert('playgroundContributions', { contributionId: `older-${i}`, projectId: id, authorId: 'fixture', authorName: 'Contributor', description: `Contribution ${i}`, status: 'accepted', createdAt: i });
    });
    const initial = await t.query(api.get, { projectId: id });
    expect(initial.contributions).toHaveLength(24);
    expect(initial.contributionCursor).not.toBeNull();
    const next = await t.query(api.contributions, { projectId: id, paginationOpts: { numItems: 24, cursor: initial.contributionCursor } });
    expect(next.page).toHaveLength(3);
    expect(next.continueCursor).toBeNull();
    expect(new Set([...initial.contributions, ...next.page].map(c => c.contributionId)).size).toBe(27);
    await expect(t.query(api.list, { paginationOpts: { cursor: null, numItems: 1000 } })).rejects.toThrow('24');
  });
});

it('keeps room completion available after funded production settles, without rewriting its brief', async () => {
  const { t, id } = await setup();
  const plot = await t.mutation(anyApi.cloud.write.createPlot, { token: tokenA, x: 12, z: 13, name: 'Funded diner' });
  const poolId = await t.run(ctx => ctx.db.insert('playgroundFundingPools', { projectId: id, livemode: false, walletOwner: 'pool-test', targetCents: 200, feeCents: 20, backedCents: 200, status: 'building', chargedCents: 0, refundedCents: 0 }));
  await t.mutation(api.update, { token: tokenA, requestId: 'link-and-build', projectId: id, plotId: plot.id, status: 'building' });
  await expect(t.mutation(api.update, { token: tokenA, requestId: 'too-early', projectId: id, status: 'completed' })).rejects.toThrow('Settle');
  await t.run(ctx => ctx.db.patch(poolId, { status: 'settled', chargedCents: 100, refundedCents: 100 }));
  const completed = await t.mutation(api.update, { token: tokenA, requestId: 'room-ready', projectId: id, status: 'completed' });
  expect(completed.project.status).toBe('completed');
});
