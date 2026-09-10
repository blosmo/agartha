import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { addressFromId } from '../../packages/protocol/src/plots';
import { PLAYGROUND_CAPABILITIES, PLAYGROUND_LIMITS, playgroundIdentifier as rawIdentifier, playgroundText as rawText, playgroundUrl as rawUrl, type PlaygroundDetail, type PlaygroundProject } from '../../packages/protocol/src/playground';
import { digest, fail } from '../scene/model';
import { limit, publicWorld, requireBillingOwner, session } from './common';
import { playgroundStatus } from './playgroundSchema';

function validated<T>(read: () => T): T { try { return read(); } catch (error) { fail('invalid', error instanceof Error ? error.message : 'Invalid input.'); } }
const playgroundIdentifier = (value: string) => validated(() => rawIdentifier(value));
const playgroundText = (value: string, name: string, maximum: number) => validated(() => rawText(value, name, maximum));
const playgroundUrl = (value?: string) => validated(() => rawUrl(value));
type Context = MutationCtx | QueryCtx;
type Project = Doc<'playgroundProjects'>;
type Actor = Doc<'cloudSessions'>;
export async function requireProject(ctx: Context, projectId: string): Promise<Project> {
  playgroundIdentifier(projectId);
  const project = await ctx.db.query('playgroundProjects').withIndex('by_project', q => q.eq('projectId', projectId)).unique();
  if (!project) fail('not_found', 'This project could not be found.');
  return project;
}
export function requireCreator(project: Project, actor: Actor) {
  if (project.creatorId !== actor.agentId) fail('forbidden', 'Only the project steward can do that.');
}
function requireOpen(project: Project) {
  if (project.status === 'cancelled' || project.status === 'completed') fail('conflict', 'This project is closed. Start a new proposal to expand it.');
}
async function summary(ctx: Context, project: Project, actor: Actor | null): Promise<PlaygroundProject> {
  const { _id, _creationTime, ...value } = project;
  const vote = actor ? await ctx.db.query('playgroundVotes').withIndex('by_project_agent', q => q.eq('projectId', project.projectId).eq('agentId', actor.agentId)).unique() : null;
  return { ...value, hasVoted: Boolean(vote), canManage: actor?.agentId === project.creatorId };
}
function publicInvitation(row: Doc<'playgroundInvitations'>) { const { _id, _creationTime, ...value } = row; return value; }
function publicContribution(row: Doc<'playgroundContributions'>) { const { _id, _creationTime, ...value } = row; return value; }
export async function projectDetail(ctx: Context, projectId: string, actor: Actor | null): Promise<PlaygroundDetail> {
  const project = await requireProject(ctx, projectId);
  const invitations = await ctx.db.query('playgroundInvitations').withIndex('by_project', q => q.eq('projectId', projectId)).take(PLAYGROUND_LIMITS.invitations);
  const contributions = await ctx.db.query('playgroundContributions').withIndex('by_project', q => q.eq('projectId', projectId)).order('desc').paginate({ numItems: PLAYGROUND_LIMITS.pageSize, cursor: null });
  return { project: await summary(ctx, project, actor), invitations: invitations.map(publicInvitation), contributions: contributions.page.map(publicContribution), contributionCursor: contributions.isDone ? null : contributions.continueCursor, viewer: actor ? { agentId: actor.agentId, name: actor.name } : null };
}
async function receipt(ctx: MutationCtx, actor: Actor, requestId: string, operation: string, payload: unknown, perform: () => Promise<PlaygroundDetail>) {
  playgroundIdentifier(requestId);
  const fingerprint = await digest(JSON.stringify([operation, payload]));
  const old = await ctx.db.query('playgroundReceipts').withIndex('by_request', q => q.eq('agentId', actor.agentId).eq('requestId', requestId)).unique();
  if (old) {
    if (old.fingerprint !== fingerprint) fail('conflict', 'This request ID was already used for a different change.');
    return projectDetail(ctx, old.result.projectId, actor);
  }
  await limit(ctx, `playground:write:${actor.agentId}`, 60, 60_000);
  const result = await perform();
  await ctx.db.insert('playgroundReceipts', { agentId: actor.agentId, requestId, fingerprint, result: { projectId: result.project.projectId } });
  return result;
}
async function validatePlot(ctx: Context, plotId: string | undefined) {
  if (plotId === undefined) return;
  addressFromId(plotId);
  await publicWorld(ctx, plotId);
}
export const overview = internalQuery({ args: { token: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await session(ctx, args.token);
  return { ...PLAYGROUND_CAPABILITIES, viewer: actor ? { agentId: actor.agentId, name: actor.name } : null };
}});
export const list = internalQuery({ args: { token: v.optional(v.string()), status: v.optional(playgroundStatus), plotId: v.optional(v.string()), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > PLAYGROUND_LIMITS.pageSize) fail('invalid', 'Request at most 24 projects.');
  if (args.status && args.plotId) fail('invalid', 'Filter by either room or status.');
  const actor = await session(ctx, args.token);
  const query = args.plotId !== undefined
    ? ctx.db.query('playgroundProjects').withIndex('by_plot', q => q.eq('plotId', args.plotId!))
    : args.status !== undefined
      ? ctx.db.query('playgroundProjects').withIndex('by_status', q => q.eq('status', args.status!))
      : ctx.db.query('playgroundProjects').withIndex('by_created');
  const page = await query.order('desc').paginate(args.paginationOpts);
  return { page: await Promise.all(page.page.map(project => summary(ctx, project, actor))), continueCursor: page.isDone ? null : page.continueCursor };
}});
export const get = internalQuery({ args: { projectId: v.string(), token: v.optional(v.string()) }, handler: async (ctx, args) => projectDetail(ctx, args.projectId, await session(ctx, args.token)) });
export const contributions = internalQuery({ args: { projectId: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  await requireProject(ctx, args.projectId);
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > PLAYGROUND_LIMITS.pageSize) fail('invalid', 'Request at most 24 contributions.');
  const page = await ctx.db.query('playgroundContributions').withIndex('by_project', q => q.eq('projectId', args.projectId)).order('desc').paginate(args.paginationOpts);
  return { page: page.page.map(publicContribution), continueCursor: page.isDone ? null : page.continueCursor };
}});
export const create = internalMutation({ args: { token: v.string(), requestId: v.string(), title: v.string(), brief: v.string(), imageUrl: v.optional(v.string()), plotId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const title = playgroundText(args.title, 'Title', PLAYGROUND_LIMITS.title), brief = playgroundText(args.brief, 'Brief', PLAYGROUND_LIMITS.brief), imageUrl = playgroundUrl(args.imageUrl);
  return receipt(ctx, actor, args.requestId, 'create', { title, brief, imageUrl, plotId: args.plotId }, async () => {
    await limit(ctx, `playground:create:${actor.agentId}`, 10, 86_400_000);
    await validatePlot(ctx, args.plotId);
    const projectId = `project-${(await digest(`${actor.agentId}:${args.requestId}`)).slice(0, 32)}`;
    await ctx.db.insert('playgroundProjects', { projectId, creatorId: actor.agentId, creatorName: actor.name, title, brief, ...(imageUrl ? { imageUrl } : {}), ...(args.plotId ? { plotId: args.plotId } : {}), status: 'idea', votes: 0, createdAt: Date.now(), updatedAt: Date.now() });
    return projectDetail(ctx, projectId, actor);
  });
}});
export const vote = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), voted: v.boolean() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  return receipt(ctx, actor, args.requestId, 'vote', { projectId: args.projectId, voted: args.voted }, async () => {
    const project = await requireProject(ctx, args.projectId);
    requireOpen(project);
    const old = await ctx.db.query('playgroundVotes').withIndex('by_project_agent', q => q.eq('projectId', args.projectId).eq('agentId', actor.agentId)).unique();
    if (Boolean(old) !== args.voted) {
      if (old) await ctx.db.delete(old._id); else await ctx.db.insert('playgroundVotes', { projectId: args.projectId, agentId: actor.agentId });
      await ctx.db.patch(project._id, { votes: project.votes + (args.voted ? 1 : -1) });
    }
    return projectDetail(ctx, args.projectId, actor);
  });
}});
export const update = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), title: v.optional(v.string()), brief: v.optional(v.string()), imageUrl: v.optional(v.string()), plotId: v.optional(v.string()), status: v.optional(playgroundStatus) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const { token: _, requestId, ...payload } = args;
  return receipt(ctx, actor, requestId, 'update', payload, async () => {
    const project = await requireProject(ctx, args.projectId); requireCreator(project, actor); requireOpen(project);
    const patch: Partial<Project> = { updatedAt: Date.now() };
    // A funded brief is a promise to backers. Funding owns its state transitions.
    const pools = await ctx.db.query('playgroundFundingPools').withIndex('by_project_mode', q => q.eq('projectId', args.projectId)).take(2);
    if (pools.length && (args.title !== undefined || args.brief !== undefined || args.imageUrl !== undefined)) fail('conflict', 'This project has a funding plan. Its brief is locked; create another proposal to change its direction.');
    if (args.title !== undefined || args.brief !== undefined || args.imageUrl !== undefined) {
      if (project.status !== 'idea') fail('conflict', 'The creative brief is locked once building starts.');
      if (args.title !== undefined) patch.title = playgroundText(args.title, 'Title', PLAYGROUND_LIMITS.title);
      if (args.brief !== undefined) patch.brief = playgroundText(args.brief, 'Brief', PLAYGROUND_LIMITS.brief);
      if (args.imageUrl !== undefined) patch.imageUrl = playgroundUrl(args.imageUrl);
    }
    if (args.plotId !== undefined) { await validatePlot(ctx, args.plotId); patch.plotId = args.plotId; }
    if (args.status !== undefined && args.status !== project.status) {
      if (['completed', 'cancelled'].includes(args.status) && pools.some(pool => pool.status === 'building' || pool.status === 'funding' && pool.backedCents > 0)) fail('conflict', 'Settle or cancel the outstanding funding before closing this room project.');
      const allowed = project.status === 'idea' ? ['building', 'cancelled'] : project.status === 'building' ? ['completed', 'cancelled'] : [];
      if (!allowed.includes(args.status)) fail('conflict', 'Choose a valid project transition.');
      if ((args.status === 'building' || args.status === 'completed') && !(patch.plotId ?? project.plotId)) fail('invalid', 'Link a room before marking the project as building or complete.');
      patch.status = args.status;
    }
    await ctx.db.patch(project._id, patch);
    return projectDetail(ctx, args.projectId, actor);
  });
}});
export const invite = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), title: v.string(), description: v.string() }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const title = playgroundText(args.title, 'Invitation title', PLAYGROUND_LIMITS.title), description = playgroundText(args.description, 'Invitation', PLAYGROUND_LIMITS.description);
  return receipt(ctx, actor, args.requestId, 'invite', { projectId: args.projectId, title, description }, async () => {
    const project = await requireProject(ctx, args.projectId); requireCreator(project, actor); requireOpen(project);
    const invitations = await ctx.db.query('playgroundInvitations').withIndex('by_project', q => q.eq('projectId', args.projectId)).take(PLAYGROUND_LIMITS.invitations);
    if (invitations.length >= PLAYGROUND_LIMITS.invitations) fail('quota', 'A project can have at most 20 invitations.');
    await ctx.db.insert('playgroundInvitations', { invitationId: `invite-${(await digest(`${actor.agentId}:${args.requestId}`)).slice(0, 32)}`, projectId: args.projectId, title, description, status: 'open', createdAt: Date.now() });
    return projectDetail(ctx, args.projectId, actor);
  });
}});
export const invitationStatus = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), invitationId: v.string(), status: v.union(v.literal('open'), v.literal('closed')) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  return receipt(ctx, actor, args.requestId, 'invitationStatus', { projectId: args.projectId, invitationId: args.invitationId, status: args.status }, async () => {
    const project = await requireProject(ctx, args.projectId); requireCreator(project, actor); requireOpen(project);
    const invitation = await ctx.db.query('playgroundInvitations').withIndex('by_invitation', q => q.eq('invitationId', args.invitationId!)).unique();
    if (!invitation || invitation.projectId !== args.projectId) fail('not_found', 'Invitation not found.');
    await ctx.db.patch(invitation._id, { status: args.status });
    return projectDetail(ctx, args.projectId, actor);
  });
}});
export const contribute = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), invitationId: v.optional(v.string()), description: v.string(), artifactUrl: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const description = playgroundText(args.description, 'Contribution', PLAYGROUND_LIMITS.description), artifactUrl = playgroundUrl(args.artifactUrl);
  return receipt(ctx, actor, args.requestId, 'contribute', { projectId: args.projectId, invitationId: args.invitationId, description, artifactUrl }, async () => {
    const project = await requireProject(ctx, args.projectId); requireOpen(project);
    await limit(ctx, `playground:contribute:${actor.agentId}`, 30, 86_400_000);
    if (args.invitationId) {
      const invitation = await ctx.db.query('playgroundInvitations').withIndex('by_invitation', q => q.eq('invitationId', args.invitationId!)).unique();
      if (!invitation || invitation.projectId !== args.projectId || invitation.status !== 'open') fail('conflict', 'Choose an open invitation in this project.');
    }
    await ctx.db.insert('playgroundContributions', { contributionId: `contribution-${(await digest(`${actor.agentId}:${args.requestId}`)).slice(0, 32)}`, projectId: args.projectId, authorId: actor.agentId, authorName: actor.name, ...(args.invitationId ? { invitationId: args.invitationId } : {}), description, ...(artifactUrl ? { artifactUrl } : {}), status: 'offered', createdAt: Date.now() });
    return projectDetail(ctx, args.projectId, actor);
  });
}});
export const review = internalMutation({ args: { token: v.string(), requestId: v.string(), projectId: v.string(), contributionId: v.string(), status: v.union(v.literal('accepted'), v.literal('declined')), reviewNote: v.optional(v.string()) }, handler: async (ctx, args) => {
  const actor = await requireBillingOwner(ctx, args.token);
  const note = args.reviewNote === undefined || args.reviewNote === '' ? undefined : playgroundText(args.reviewNote, 'Review note', PLAYGROUND_LIMITS.description);
  return receipt(ctx, actor, args.requestId, 'review', { projectId: args.projectId, contributionId: args.contributionId, status: args.status, note }, async () => {
    const project = await requireProject(ctx, args.projectId); requireCreator(project, actor); requireOpen(project);
    const contribution = await ctx.db.query('playgroundContributions').withIndex('by_contribution', q => q.eq('contributionId', args.contributionId)).unique();
    if (!contribution || contribution.projectId !== args.projectId) fail('not_found', 'Contribution not found.');
    if (contribution.status !== 'offered') fail('conflict', 'This contribution has already been reviewed.');
    await ctx.db.patch(contribution._id, { status: args.status, ...(note ? { reviewNote: note } : {}) });
    return projectDetail(ctx, args.projectId, actor);
  });
}});
