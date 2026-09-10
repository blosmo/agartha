import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { v } from 'convex/values';
import { assertCents, getOrCreateWallet, requireBillingOwner } from './common';
import { digest, fail } from '../scene/model';
import { assertActivated } from './blenderSessions';
import { createManagedJobInTransaction, cancelManagedJobInTransaction } from './managedJobs';
import { PLAYGROUND_ALLOWANCE_LIMITS as limits, type PlaygroundAllowance, type PlaygroundAllowancePage } from '../../packages/protocol/src/playgroundAllowances';

type Context = QueryCtx | MutationCtx;
type Grant = Doc<'playgroundAllowances'>;
const actionArgs = { token: v.string(), livemode: v.boolean(), requestId: v.string(), allowanceId: v.string() };
function activated(agentId: string, livemode: boolean) { try { assertActivated(agentId, livemode); } catch (error) { fail('unavailable', (error as Error).message); } }
async function grant(ctx: Context, allowanceId: string, livemode: boolean) {
  const row = await ctx.db.query('playgroundAllowances').withIndex('by_allowance', q => q.eq('allowanceId', allowanceId)).unique();
  if (!row || row.livemode !== livemode) fail('not_found', 'Agent allowance not found.');
  return row;
}
function participant(row: Grant, actorId: string) { if (row.sponsorId !== actorId && row.recipientId !== actorId) fail('not_found', 'Agent allowance not found.'); }
async function receipt(ctx: MutationCtx, actorId: string, args: { livemode: boolean; requestId: string }, operation: string, payload: unknown, allowanceId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(args.requestId)) fail('invalid', 'Invalid requestId.');
  const fingerprint = JSON.stringify([operation, payload]);
  const prior = await ctx.db.query('playgroundAllowanceReceipts').withIndex('by_actor_request', q => q.eq('actorId', actorId).eq('livemode', args.livemode).eq('requestId', args.requestId)).unique();
  if (prior) { if (prior.fingerprint !== fingerprint || prior.allowanceId !== allowanceId) fail('conflict', 'Request reused with different allowance terms.'); return true; }
  await ctx.db.insert('playgroundAllowanceReceipts', { actorId, livemode: args.livemode, requestId: args.requestId, fingerprint, allowanceId });
  return false;
}
async function ledger(ctx: MutationCtx, owner: string, livemode: boolean, allowanceId: string, action: string, deltaCents: number) {
  if (deltaCents) await ctx.db.insert('blenderLedger', { entryId: `allowance:${allowanceId}:${action}`, source: `allowance:${allowanceId}`, action, owner, livemode, deltaCents, createdAt: Date.now() });
}
async function view(ctx: Context, row: Grant, actorId: string, details = true): Promise<PlaygroundAllowance> {
  participant(row, actorId);
  const wallet = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', row.walletOwner).eq('livemode', row.livemode)).unique();
  const sponsor = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', row.sponsorId).eq('livemode', row.livemode)).unique();
  const availableCents = wallet?.availableCents ?? 0, heldCents = wallet?.heldCents ?? 0;
  const frozen = Boolean(wallet?.frozen || !sponsor || sponsor.frozen);
  let enabled = false; try { assertActivated(row.recipientId, row.livemode); enabled = true; } catch { /* Return honest availability without exposing operator configuration. */ }
  const jobs: NonNullable<PlaygroundAllowance['jobs']> = [];
  if (details) for (const jobId of row.jobIds) { const job = await ctx.db.query('managedJobs').withIndex('by_job', q => q.eq('jobId', jobId)).unique(); if (job) jobs.push({ jobId, status: job.status, progress: job.progress, artifactsReady: job.artifactsReady ?? false }); }
  return { allowanceId: row.allowanceId, sponsorId: row.sponsorId, sponsorName: row.sponsorName, recipientId: row.recipientId, recipientName: row.recipientName, livemode: row.livemode, amountCents: row.amountCents, availableCents, heldCents, spentCents: row.amountCents - availableCents - heldCents - row.refundedCents, refundedCents: row.refundedCents, status: row.status, expiresAt: row.expiresAt, createdAt: row.createdAt, frozen, canCreateJob: enabled && actorId === row.recipientId && row.status === 'active' && row.expiresAt > Date.now() && !frozen && heldCents === 0 && availableCents >= 100 && row.jobIds.length < limits.jobsPerGrant, jobCount: row.jobIds.length, ...(details ? { jobs } : {}) };
}
export const list = internalQuery({ args: { token: v.string(), livemode: v.boolean(), role: v.union(v.literal('sponsor'), v.literal('recipient')), cursor: v.optional(v.string()) }, handler: async (ctx, args): Promise<PlaygroundAllowancePage> => {
  const actor = await requireBillingOwner(ctx, args.token);
  const query = args.role === 'sponsor'
    ? ctx.db.query('playgroundAllowances').withIndex('by_sponsor_mode', q => q.eq('sponsorId', actor.agentId).eq('livemode', args.livemode))
    : ctx.db.query('playgroundAllowances').withIndex('by_recipient_mode', q => q.eq('recipientId', actor.agentId).eq('livemode', args.livemode));
  const page = await query.order('desc').paginate({ numItems: limits.pageSize, cursor: args.cursor ?? null });
  const allowances = []; for (const row of page.page) allowances.push(await view(ctx, row, actor.agentId, false));
  return { allowances, hasMore: !page.isDone, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const get = internalQuery({ args: { token: v.string(), livemode: v.boolean(), allowanceId: v.string() }, handler: async (ctx, args) => { const actor = await requireBillingOwner(ctx, args.token); return view(ctx, await grant(ctx, args.allowanceId, args.livemode), actor.agentId); } });
export const create = internalMutation({ args: { token: v.string(), livemode: v.boolean(), requestId: v.string(), recipientId: v.string(), amountCents: v.number(), days: v.optional(v.number()) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), days = args.days ?? limits.defaultDays;
  const allowanceId = `allow-${await digest(`${actor.agentId}:${args.livemode}:${args.requestId}`)}`;
  if (await receipt(ctx, actor.agentId, args, 'create', [args.recipientId, args.amountCents, days], allowanceId)) return view(ctx, await grant(ctx, allowanceId, args.livemode), actor.agentId);
  activated(actor.agentId, args.livemode); assertCents(args.amountCents);
  if (args.amountCents < limits.minimumCents || args.amountCents > limits.maximumCents) fail('invalid', 'Allocate 100 to 20000 prepaid cents.');
  if (!Number.isInteger(days) || days < 1 || days > limits.maximumDays) fail('invalid', 'Allowance duration must be 1 to 30 days.');
  const pass = await ctx.db.query('playgroundPasses').withIndex('by_owner_mode', q => q.eq('agentId', actor.agentId).eq('livemode', args.livemode)).unique();
  if (!pass) fail('forbidden', 'Activate a play pass before allocating an agent allowance.');
  const recipient = await ctx.db.query('cloudSessions').withIndex('by_agent', q => q.eq('agentId', args.recipientId)).unique();
  if (!recipient || recipient.revoked || recipient.expiresAt <= Date.now()) fail('invalid', 'Choose an existing agent with a current session.');
  if (recipient.agentId === actor.agentId) fail('invalid', 'Choose another agent. Your own prepaid credits are already available to you.');
  let sponsored = 0, received = 0;
  for (const status of ['active', 'revoking'] as const) {
    sponsored += (await ctx.db.query('playgroundAllowances').withIndex('by_sponsor_mode_status', q => q.eq('sponsorId', actor.agentId).eq('livemode', args.livemode).eq('status', status)).take(limits.openPerIdentity)).length;
    received += (await ctx.db.query('playgroundAllowances').withIndex('by_recipient_mode_status', q => q.eq('recipientId', recipient.agentId).eq('livemode', args.livemode).eq('status', status)).take(limits.openPerIdentity)).length;
  }
  if (sponsored >= limits.openPerIdentity || received >= limits.openPerIdentity) fail('invalid', 'Settle an existing allowance before opening another.');
  const wallet = await getOrCreateWallet(ctx, actor.agentId, args.livemode);
  if (wallet.frozen || wallet.availableCents < args.amountCents) fail('invalid', 'Insufficient available prepaid credits.');
  const walletOwner = `playground-allowance-${allowanceId}`;
  const row = { allowanceId, walletOwner, sponsorId: actor.agentId, sponsorName: actor.name, recipientId: recipient.agentId, recipientName: recipient.name, livemode: args.livemode, amountCents: args.amountCents, refundedCents: 0, status: 'active' as const, expiresAt: Date.now() + days * 86_400_000, createdAt: Date.now(), jobIds: [] as string[] };
  await ctx.db.insert('playgroundAllowances', row);
  await ctx.db.patch(wallet._id, { availableCents: wallet.availableCents - args.amountCents });
  await ctx.db.insert('blenderWallets', { agentId: walletOwner, livemode: args.livemode, availableCents: args.amountCents, heldCents: 0, frozen: false, openDisputes: 0 });
  await ledger(ctx, actor.agentId, args.livemode, allowanceId, 'allocate', -args.amountCents);
  await ledger(ctx, walletOwner, args.livemode, allowanceId, 'fund', args.amountCents);
  return view(ctx, await grant(ctx, allowanceId, args.livemode), actor.agentId);
} });
export const createJob = internalMutation({ args: { ...actionArgs, brief: v.string(), budgetCents: v.number() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), row = await grant(ctx, args.allowanceId, args.livemode);
  if (row.recipientId !== actor.agentId) fail('forbidden', 'Only the invited agent can create jobs from this allowance.');
  const jobId = `al-${await digest(`${args.allowanceId}:${args.requestId}`)}`;
  if (await receipt(ctx, actor.agentId, args, 'job', [args.allowanceId, args.brief, args.budgetCents], args.allowanceId)) return { allowance: await view(ctx, row, actor.agentId), jobId };
  activated(actor.agentId, args.livemode);
  if (row.status !== 'active' || row.expiresAt <= Date.now()) fail('forbidden', 'This allowance has expired or was revoked.');
  if (row.jobIds.length >= limits.jobsPerGrant) fail('invalid', 'This allowance has reached its job limit.');
  await createManagedJobInTransaction(ctx, { token: args.token, jobId, requestId: jobId, brief: args.brief, budgetCents: args.budgetCents, livemode: args.livemode, referenceMode: 'none' }, row.walletOwner);
  await ctx.db.patch(row._id, { jobIds: [...row.jobIds, jobId] });
  return { allowance: await view(ctx, await grant(ctx, row.allowanceId, args.livemode), actor.agentId), jobId };
} });
/** Closing commits cancellation first, then refunds only when every hold is resolved. */
async function close(ctx: MutationCtx, row: Grant) {
  if (row.status === 'settled') return;
  await ctx.db.patch(row._id, { status: 'revoking' });
  let unsettled = false, chargedCents = 0;
  for (const jobId of row.jobIds) {
    let job = await ctx.db.query('managedJobs').withIndex('by_job', q => q.eq('jobId', jobId)).unique();
    if (!job) fail('invalid', 'Allowance job history requires reconciliation.');
    if (job.status === 'queued' || job.status === 'running') {
      await cancelManagedJobInTransaction(ctx, jobId, row.walletOwner);
      job = (await ctx.db.query('managedJobs').withIndex('by_job', q => q.eq('jobId', jobId)).unique())!;
    }
    const reservation = await ctx.db.query('blenderSessionReservations').withIndex('by_reservation', q => q.eq('reservationId', job.reservationId)).unique();
    chargedCents += job.chargedAiCents + (reservation?.chargedCents ?? 0);
    if (job.pendingAiCents || !reservation || !['settled', 'failed'].includes(reservation.status)) unsettled = true;
  }
  const wallet = await getOrCreateWallet(ctx, row.walletOwner, row.livemode);
  if (unsettled || wallet.heldCents) return;
  if (wallet.availableCents < 0 || wallet.availableCents !== row.amountCents - chargedCents) fail('invalid', 'Allowance balance requires reconciliation.');
  const sponsor = await getOrCreateWallet(ctx, row.sponsorId, row.livemode);
  const availableCents = sponsor.availableCents + wallet.availableCents;
  await ctx.db.patch(sponsor._id, { availableCents, frozen: availableCents < 0 || sponsor.openDisputes > 0 });
  await ctx.db.patch(wallet._id, { availableCents: 0 });
  await ledger(ctx, row.sponsorId, row.livemode, row.allowanceId, 'refund', wallet.availableCents);
  await ledger(ctx, row.walletOwner, row.livemode, row.allowanceId, 'return', -wallet.availableCents);
  await ctx.db.patch(row._id, { status: 'settled', refundedCents: wallet.availableCents });
}
export const revoke = internalMutation({ args: actionArgs, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), row = await grant(ctx, args.allowanceId, args.livemode);
  if (row.sponsorId !== actor.agentId) fail('forbidden', 'Only the sponsor can revoke this allowance.');
  await receipt(ctx, actor.agentId, args, 'revoke', args.allowanceId, args.allowanceId);
  // Repeating revocation may finish a refund after an asynchronous compute stop.
  await close(ctx, row);
  return view(ctx, await grant(ctx, row.allowanceId, args.livemode), actor.agentId);
} });
export const settle = internalMutation({ args: actionArgs, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token), row = await grant(ctx, args.allowanceId, args.livemode);
  participant(row, actor.agentId);
  await receipt(ctx, actor.agentId, args, 'settle', args.allowanceId, args.allowanceId);
  if (row.status === 'active' && row.expiresAt > Date.now()) fail('invalid', 'Revoke the allowance or wait for expiry before refunding its remaining balance.');
  await close(ctx, row);
  return view(ctx, await grant(ctx, row.allowanceId, args.livemode), actor.agentId);
} });
