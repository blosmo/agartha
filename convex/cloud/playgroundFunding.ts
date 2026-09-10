import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import { assertCents, fundingBackings, getOrCreateWallet, requireBillingOwner, session } from './common';
import { assertActivated } from './blenderSessions';
import { createManagedJobInTransaction, cancelManagedJobInTransaction } from './managedJobs';
import { allocateFundingRefund, type PlaygroundFunding, type PlaygroundPassOffer } from '../../packages/protocol/src/playgroundFunding';
import { digest } from '../scene/model';

function fundingError(message: string | undefined) { return new ConvexError({ code: 'invalid', message: message ?? 'Funding unavailable.' }); }
const modeArgs = { token: v.string(), livemode: v.boolean(), requestId: v.string() };
const projectArgs = { ...modeArgs, projectId: v.string() };
type Context = QueryCtx | MutationCtx;
function configuredCents(name: string): number | null {
  const value = process.env[name];
  if (!value || !/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000 ? amount : null;
}
function offer(livemode: boolean, agentId?: string): PlaygroundPassOffer {
  const feeCents = configuredCents('PLAYGROUND_PASS_FEE_CENTS');
  const generationCents = configuredCents('PLAYGROUND_PASS_GENERATION_CENTS');
  let unavailableReason: string | undefined;
  if (feeCents === null || generationCents === null) unavailableReason = 'Play pass pricing has not been configured.';
  else if (!agentId) unavailableReason = 'Register to activate a pass from prepaid credits.';
  else { try { assertActivated(agentId, livemode); } catch (error) { unavailableReason = (error as Error).message; } }
  return { offerId: `pass-v1-${feeCents ?? 0}-${generationCents ?? 0}`, feeCents: feeCents ?? 0, generationCents: generationCents ?? 0, totalCents: (feeCents ?? 0) + (generationCents ?? 0), livemode, available: !unavailableReason, ...(unavailableReason ? { unavailableReason } : {}) };
}
async function project(ctx: Context, projectId: string) {
  const row = await ctx.db.query('playgroundProjects').withIndex('by_project', q => q.eq('projectId', projectId)).unique();
  if (!row) throw fundingError('Project not found.');
  return row;
}
async function pool(ctx: Context, projectId: string, livemode: boolean) {
  return ctx.db.query('playgroundFundingPools').withIndex('by_project_mode', q => q.eq('projectId', projectId).eq('livemode', livemode)).unique();
}
export async function assertProjectBriefEditable(ctx: Context, projectId: string) {
  const pools = await ctx.db.query('playgroundFundingPools').withIndex('by_project', q => q.eq('projectId', projectId)).take(3);
  if (pools.some(row => row.backedCents > 0 || row.status !== 'funding')) throw fundingError('A backed project brief is locked.');
}
async function receipt(ctx: MutationCtx, agentId: string, args: { livemode: boolean; requestId: string }, operation: string, payload: unknown) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(args.requestId)) throw fundingError('Invalid requestId.');
  const fingerprint = JSON.stringify([operation, payload]);
  const prior = await ctx.db.query('playgroundFundingReceipts').withIndex('by_owner_request', q => q.eq('agentId', agentId).eq('livemode', args.livemode).eq('requestId', args.requestId)).unique();
  if (prior) { if (prior.fingerprint !== fingerprint) throw fundingError('Request reused with different payload.'); return true; }
  await ctx.db.insert('playgroundFundingReceipts', { agentId, livemode: args.livemode, requestId: args.requestId, fingerprint, createdAt: Date.now() });
  return false;
}
async function ledger(ctx: MutationCtx, owner: string, livemode: boolean, source: string, suffix: string, deltaCents: number) {
  if (deltaCents) await ctx.db.insert('blenderLedger', { entryId: `${source}:${suffix}`, source, action: suffix, owner, livemode, deltaCents, createdAt: Date.now() });
}
async function view(ctx: Context, projectId: string, livemode: boolean, agentId?: string): Promise<PlaygroundFunding | null> {
  const row = await pool(ctx, projectId, livemode);
  if (!row) return null;
  const backers = [...await fundingBackings(ctx, projectId, livemode, 'held'), ...await fundingBackings(ctx, projectId, livemode, 'settled')];
  const job = row.jobId ? await ctx.db.query('managedJobs').withIndex('by_job', q => q.eq('jobId', row.jobId!)).unique() : null;
  return { ...(job ? { job: { status: job.status, progress: job.progress, artifactsReady: job.artifactsReady ?? false, visuallyInspected: job.visuallyInspected } } : {}), projectId, livemode, targetCents: row.targetCents, feeCents: row.feeCents, backedCents: row.backedCents, status: row.status, ...(row.jobId ? { jobId: row.jobId } : {}), chargedCents: row.chargedCents, refundedCents: row.refundedCents, backers: backers.map(({ backingId, contributorName, amountCents, refundedCents, chargedCents, status, agentId: owner }) => ({ backingId, contributorName, amountCents, refundedCents, chargedCents, status, mine: owner === agentId })) };
}
export const getPass = internalQuery({ args: { token: v.optional(v.string()), livemode: v.boolean() }, handler: async (ctx, args) => {
  const actor = await session(ctx, args.token);
  const pass = actor ? await ctx.db.query('playgroundPasses').withIndex('by_owner_mode', q => q.eq('agentId', actor.agentId).eq('livemode', args.livemode)).unique() : null;
  const wallet = actor ? await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', actor.agentId).eq('livemode', args.livemode)).unique() : null;
  return { offer: offer(args.livemode, actor?.agentId), pass: pass ? { passId: pass.passId, offerId: pass.offerId, feeCents: pass.feeCents, generationCents: pass.generationCents, livemode: pass.livemode, activatedAt: pass.activatedAt } : null, wallet: actor ? { availableCents: wallet?.availableCents ?? 0, heldCents: wallet?.heldCents ?? 0, frozen: wallet?.frozen ?? false } : null };
} });
export const activatePass = internalMutation({ args: { ...modeArgs, offerId: v.string() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const existing = await ctx.db.query('playgroundPasses').withIndex('by_owner_mode', q => q.eq('agentId', actor.agentId).eq('livemode', args.livemode)).unique();
  await receipt(ctx, actor.agentId, args, 'pass', args.offerId);
  if (existing) { if (existing.offerId !== args.offerId) throw fundingError('A pass is already active.'); return { passId: existing.passId, offerId: existing.offerId, feeCents: existing.feeCents, generationCents: existing.generationCents, livemode: existing.livemode, activatedAt: existing.activatedAt }; }
  const price = offer(args.livemode, actor.agentId);
  if (!price.available) throw fundingError(price.unavailableReason);
  if (price.offerId !== args.offerId) throw fundingError('Pass pricing changed. Review the current offer.');
  const wallet = await getOrCreateWallet(ctx, actor.agentId, args.livemode);
  if (wallet.frozen || wallet.availableCents < price.totalCents) throw fundingError('Insufficient available prepaid credits.');
  const passId = `pass-${await digest(`${actor.agentId}:${args.livemode}`)}`;
  await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - price.feeCents });
  await ledger(ctx, actor.agentId, args.livemode, passId, 'hosting-fee', -price.feeCents);
  const pass = { passId, offerId: price.offerId, feeCents: price.feeCents, generationCents: price.generationCents, livemode: args.livemode, activatedAt: Date.now() };
  await ctx.db.insert('playgroundPasses', { ...pass, agentId: actor.agentId });
  return pass;
} });
export const getFunding = internalQuery({ args: { projectId: v.string(), livemode: v.boolean(), token: v.optional(v.string()) }, handler: async (ctx, args) => { await project(ctx, args.projectId); const actor = await session(ctx, args.token); return view(ctx, args.projectId, args.livemode, actor?.agentId); } });
export const configureFunding = internalMutation({ args: { ...projectArgs, targetCents: v.number() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), proposal = await project(ctx, args.projectId);
  if (proposal.creatorId !== actor.agentId) throw fundingError('Only the project creator can configure funding.');
  if (await receipt(ctx, actor.agentId, args, 'configure', [args.projectId, args.targetCents])) return view(ctx, args.projectId, args.livemode, actor.agentId);
  assertActivated(actor.agentId, args.livemode);
  const feeCents = configuredCents('PLAYGROUND_PRODUCTION_FEE_CENTS');
  if (feeCents === null) throw fundingError('Community production pricing has not been configured.');
  assertCents(args.targetCents);
  if (args.targetCents - feeCents < 100 || args.targetCents - feeCents > 2000) throw fundingError('Generation budget must be 100 to 2000 cents, plus the disclosed production fee.');
  if (proposal.status === 'completed' || proposal.status === 'cancelled') throw fundingError('This project is closed.');
  const existing = await pool(ctx, args.projectId, args.livemode);
  if (existing) { if (existing.backedCents || existing.status !== 'funding') throw fundingError('Backed funding terms are locked.'); await ctx.db.patch(existing._id, { targetCents: args.targetCents, feeCents }); }
  else await ctx.db.insert('playgroundFundingPools', { projectId: args.projectId, livemode: args.livemode, walletOwner: `playground-pool-${await digest(`${args.projectId}:${args.livemode}`)}`, targetCents: args.targetCents, feeCents, backedCents: 0, status: 'funding', chargedCents: 0, refundedCents: 0 });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
export const backProject = internalMutation({ args: { ...projectArgs, amountCents: v.number(), expectedTargetCents: v.number(), expectedFeeCents: v.number() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  if (await receipt(ctx, actor.agentId, args, 'back', [args.projectId, args.amountCents, args.expectedTargetCents, args.expectedFeeCents])) return view(ctx, args.projectId, args.livemode, actor.agentId);
  assertActivated(actor.agentId, args.livemode); assertCents(args.amountCents);
  const proposal = await project(ctx, args.projectId), row = await pool(ctx, args.projectId, args.livemode);
  if (!row || row.status !== 'funding' || ['cancelled', 'completed'].includes(proposal.status)) throw fundingError('Project is not accepting backing.');
  if (args.expectedTargetCents !== row.targetCents || args.expectedFeeCents !== row.feeCents) throw fundingError('Funding terms changed. Review the current target and production fee.');
  if (args.amountCents < 1 || args.amountCents > row.targetCents - row.backedCents) throw fundingError('Backing exceeds remaining target.');
  const prior = await fundingBackings(ctx, args.projectId, args.livemode, 'held');
  if (prior.length >= 100) throw fundingError('This project has reached its backing limit.');
  const wallet = await getOrCreateWallet(ctx, actor.agentId, args.livemode);
  if (wallet.frozen || wallet.availableCents < args.amountCents) throw fundingError('Insufficient available prepaid credits.');
  const backingId = `back-${await digest(`${actor.agentId}:${args.livemode}:${args.requestId}`)}`;
  await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - args.amountCents, heldCents: wallet.heldCents + args.amountCents });
  await ledger(ctx, actor.agentId, args.livemode, backingId, 'reserve', -args.amountCents);
  await ctx.db.insert('playgroundBackings', { backingId, projectId: args.projectId, livemode: args.livemode, agentId: actor.agentId, contributorName: actor.name, amountCents: args.amountCents, refundedCents: 0, chargedCents: 0, status: 'held', createdAt: Date.now() });
  await ctx.db.patch(row._id, { backedCents: row.backedCents + args.amountCents });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
async function refundHeldBacking(ctx: MutationCtx, backing: NonNullable<Awaited<ReturnType<typeof lookupBacking>>>) {
  const wallet = await getOrCreateWallet(ctx, backing.agentId, backing.livemode);
  if (wallet.heldCents < backing.amountCents) throw fundingError('Inconsistent backing hold.');
  const availableCents = wallet.availableCents + backing.amountCents;
  await ctx.db.patch(wallet._id, { availableCents, heldCents: wallet.heldCents - backing.amountCents, frozen: availableCents < 0 || wallet.openDisputes > 0 });
  await ledger(ctx, backing.agentId, backing.livemode, backing.backingId, 'refund', backing.amountCents);
  await ctx.db.patch(backing._id, { status: 'withdrawn', refundedCents: backing.amountCents });
}
async function lookupBacking(ctx: Context, backingId: string) { return ctx.db.query('playgroundBackings').withIndex('by_backing', q => q.eq('backingId', backingId)).unique(); }
export const withdrawBacking = internalMutation({ args: { ...projectArgs, backingId: v.string() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  if (await receipt(ctx, actor.agentId, args, 'withdraw', [args.projectId, args.backingId])) return view(ctx, args.projectId, args.livemode, actor.agentId);
  const row = await pool(ctx, args.projectId, args.livemode), backing = await lookupBacking(ctx, args.backingId);
  if (!row || !backing || backing.agentId !== actor.agentId || backing.projectId !== args.projectId || backing.livemode !== args.livemode) throw fundingError('Backing not found.');
  if (backing.status === 'withdrawn') return view(ctx, args.projectId, args.livemode, actor.agentId);
  if (row.status !== 'funding' || backing.status !== 'held') throw fundingError('A started build cannot be withdrawn; unused funds return after settlement.');
  await refundHeldBacking(ctx, backing);
  await ctx.db.patch(row._id, { backedCents: row.backedCents - backing.amountCents });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
export const cancelFunding = internalMutation({ args: projectArgs, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), proposal = await project(ctx, args.projectId);
  if (proposal.creatorId !== actor.agentId) throw fundingError('Only the project creator can cancel funding.');
  if (await receipt(ctx, actor.agentId, args, 'cancel', args.projectId)) return view(ctx, args.projectId, args.livemode, actor.agentId);
  const row = await pool(ctx, args.projectId, args.livemode);
  if (!row) throw fundingError('Funding not found.');
  if (row.status === 'cancelled') return view(ctx, args.projectId, args.livemode, actor.agentId);
  if (row.status === 'building' && row.jobId) { await cancelManagedJobInTransaction(ctx, row.jobId, row.walletOwner); return view(ctx, args.projectId, args.livemode, actor.agentId); }
  if (row.status !== 'funding') throw fundingError('Funding is already settled.');
  const backings = await fundingBackings(ctx, args.projectId, args.livemode, 'held');
  for (const backing of backings) if (backing.status === 'held') await refundHeldBacking(ctx, backing);
  await ctx.db.patch(row._id, { status: 'cancelled', refundedCents: row.backedCents });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
export const startBuild = internalMutation({ args: projectArgs, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), proposal = await project(ctx, args.projectId);
  if (proposal.creatorId !== actor.agentId) throw fundingError('Only the project creator can start its build.');
  if (await receipt(ctx, actor.agentId, args, 'start', args.projectId)) return view(ctx, args.projectId, args.livemode, actor.agentId);
  assertActivated(actor.agentId, args.livemode);
  const row = await pool(ctx, args.projectId, args.livemode);
  if (!row || row.status !== 'funding' || row.backedCents !== row.targetCents || ['completed', 'cancelled'].includes(proposal.status)) throw fundingError('Project has not reached its funding target or is closed.');
  const backings = await fundingBackings(ctx, args.projectId, args.livemode, 'held');
  for (const backing of backings) {
    if (backing.status !== 'held') continue;
    const wallet = await getOrCreateWallet(ctx, backing.agentId, args.livemode);
    if (wallet.frozen || wallet.heldCents < backing.amountCents) throw fundingError('A backer has unavailable or disputed funds.');
    await ctx.db.patch(wallet._id, { heldCents: wallet.heldCents - backing.amountCents });
  }
  const wallet = await getOrCreateWallet(ctx, row.walletOwner, args.livemode);
  if (wallet.availableCents || wallet.heldCents) throw fundingError('Pool wallet must be empty before launch.');
  await ctx.db.patch(wallet._id, { availableCents: row.backedCents });
  await ledger(ctx, row.walletOwner, args.livemode, `pool:${row.walletOwner}`, 'fund', row.backedCents);
  const jobId = `pg-${await digest(`${args.projectId}:${args.livemode}`)}`;
  await createManagedJobInTransaction(ctx, { token: args.token, jobId, requestId: jobId, brief: proposal.brief, budgetCents: row.targetCents - row.feeCents, referenceMode: 'none', livemode: args.livemode }, row.walletOwner);
  await ctx.db.patch(row._id, { status: 'building', jobId });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
export const settleFunding = internalMutation({ args: projectArgs, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  // Any authenticated participant may trigger deterministic refunds, never change recipients.
  if (await receipt(ctx, actor.agentId, args, 'settle', args.projectId)) return view(ctx, args.projectId, args.livemode, actor.agentId);
  const row = await pool(ctx, args.projectId, args.livemode);
  if (!row) throw fundingError('Funding not found.');
  if (row.status === 'settled') return view(ctx, args.projectId, args.livemode, actor.agentId);
  if (row.status !== 'building' || !row.jobId) throw fundingError('No build is awaiting settlement.');
  const job = await ctx.db.query('managedJobs').withIndex('by_job', q => q.eq('jobId', row.jobId!)).unique();
  const reservation = job ? await ctx.db.query('blenderSessionReservations').withIndex('by_reservation', q => q.eq('reservationId', job.reservationId)).unique() : null;
  if (!job || ['queued', 'running'].includes(job.status) || !reservation || !['settled', 'failed'].includes(reservation.status)) throw fundingError('Build compute settlement is still pending.');
  const wallet = await getOrCreateWallet(ctx, row.walletOwner, args.livemode);
  if (wallet.heldCents || job.pendingAiCents) throw fundingError('Unresolved charges require reconciliation before refunds.');
  const computeCost = job.chargedAiCents + reservation.chargedCents;
  if (wallet.availableCents !== row.backedCents - computeCost) throw fundingError('Pool ledger requires reconciliation.');
  const fee = ['completed', 'partial'].includes(job.status) ? row.feeCents : 0;
  const refund = wallet.availableCents - fee;
  if (refund < 0) throw fundingError('Production fee exceeds remaining authorization.');
  const backings = await fundingBackings(ctx, args.projectId, args.livemode, 'held');
  const allocations = allocateFundingRefund(backings.map(b => b.amountCents), refund);
  for (let i = 0; i < backings.length; i++) {
    const backing = backings[i], amount = allocations[i];
    const ownerWallet = await getOrCreateWallet(ctx, backing.agentId, args.livemode);
    const availableCents = ownerWallet.availableCents + amount;
    await ctx.db.patch(ownerWallet._id, { availableCents, frozen: availableCents < 0 || ownerWallet.openDisputes > 0 });
    await ledger(ctx, backing.agentId, args.livemode, backing.backingId, 'refund', amount);
    await ctx.db.patch(backing._id, { status: 'settled', refundedCents: amount, chargedCents: backing.amountCents - amount });
  }
  await ledger(ctx, row.walletOwner, args.livemode, `pool:${row.walletOwner}`, 'production-fee', -fee);
  await ledger(ctx, row.walletOwner, args.livemode, `pool:${row.walletOwner}`, 'refund', -refund);
  await ctx.db.patch(wallet._id, { availableCents: 0 });
  await ctx.db.patch(row._id, { status: 'settled', chargedCents: computeCost + fee, refundedCents: refund });
  return view(ctx, args.projectId, args.livemode, actor.agentId);
} });
