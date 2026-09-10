import { anyApi, type GenericActionCtx, type GenericDataModel } from 'convex/server';
import { PLAYGROUND_LIMITS } from '../../packages/protocol/src/playground';
import { fail } from '../scene/model';
const api = anyApi.cloud.playground;
const funding = anyApi.cloud.playgroundFunding;
const allowances = anyApi.cloud.playgroundAllowances;

/** Browser and agent calls share these handlers. Payment mode comes only from the trusted gateway. */
export async function playgroundRoute(ctx: GenericActionCtx<GenericDataModel>, request: Request, parts: string[], url: URL, token: string | undefined, body: Record<string, unknown>): Promise<unknown | undefined> {
  if (parts[0] !== 'playground') return undefined;
  const action = parts[1], projectId = parts[2], operation = parts[3];
  const paginationOpts = { numItems: PLAYGROUND_LIMITS.pageSize, cursor: url.searchParams.get('cursor') ?? null };
  const mode = request.headers.get('x-agartha-payment-mode');
  const livemode = mode === 'live';
  if (request.method === 'GET') {
    if (parts.length === 1) return ctx.runQuery(api.overview, { token });
    if (action === 'pass' && parts.length === 2) {
      if (mode !== 'test' && mode !== 'live') return { offer: { offerId: 'unavailable', feeCents: 0, generationCents: 0, totalCents: 0, livemode: false, available: false, unavailableReason: 'Payments are not configured. Exploring, proposing and voting remain free.' }, pass: null, wallet: null };
      return ctx.runQuery(funding.getPass, { token, livemode });
    }
    if (action === 'allowances') {
      if (mode !== 'test' && mode !== 'live') return { allowances: [], hasMore: false, nextCursor: null };
      if (!token) fail('unauthorized', 'Create a free session to view your agent allowances.');
      if (parts.length === 2) return ctx.runQuery(allowances.list, { token, livemode, role: url.searchParams.get('role') ?? 'sponsor', cursor: url.searchParams.get('cursor') ?? undefined });
      if (parts.length === 3) return ctx.runQuery(allowances.get, { token, livemode, allowanceId: projectId });
    }
    if (action === 'projects') {
      if (parts.length === 2) return ctx.runQuery(api.list, { token, status: url.searchParams.get('status') ?? undefined, plotId: url.searchParams.get('plotId') ?? undefined, paginationOpts });
      if (parts.length === 3) return ctx.runQuery(api.get, { token, projectId });
      if (parts.length === 4 && operation === 'contributions') return ctx.runQuery(api.contributions, { projectId, paginationOpts });
      if (parts.length === 4 && operation === 'funding') return mode === 'live' || mode === 'test' ? ctx.runQuery(funding.getFunding, { token, projectId, livemode }) : null;
    }
  }
  if (request.method === 'POST') {
    if (!token) fail('unauthorized', 'Create a free session before participating.');
    const common = { token, requestId: body.requestId };
    if (action === 'pass' && projectId === 'activate' && parts.length === 3) {
      if (mode !== 'test' && mode !== 'live') fail('unavailable', 'Payments are not configured.');
      return ctx.runMutation(funding.activatePass, { ...common, livemode, offerId: body.offerId });
    }
    if (action === 'allowances') {
      if (mode !== 'test' && mode !== 'live') fail('unavailable', 'Payments are not configured.');
      if (parts.length === 2) return ctx.runMutation(allowances.create, { ...common, livemode, recipientId: body.recipientId, amountCents: body.amountCents, days: body.days });
      const grantArgs = { ...common, livemode, allowanceId: projectId };
      if (parts.length === 4 && operation === 'jobs') return ctx.runMutation(allowances.createJob, { ...grantArgs, brief: body.brief, budgetCents: body.budgetCents });
      if (parts.length === 4 && operation === 'revoke') return ctx.runMutation(allowances.revoke, grantArgs);
      if (parts.length === 4 && operation === 'settle') return ctx.runMutation(allowances.settle, grantArgs);
    }
    if (action === 'projects') {
      if (parts.length === 2) return ctx.runMutation(api.create, { ...common, title: body.title, brief: body.brief, imageUrl: body.imageUrl, plotId: body.plotId });
      const args = { ...common, projectId };
      if (parts.length === 4) {
        if (operation === 'vote') return ctx.runMutation(api.vote, { ...args, voted: body.voted });
        if (operation === 'update') return ctx.runMutation(api.update, { ...args, title: body.title, brief: body.brief, imageUrl: body.imageUrl, plotId: body.plotId, status: body.status });
        if (operation === 'invitations') return ctx.runMutation(api.invite, { ...args, title: body.title, description: body.description });
        if (operation === 'contributions') return ctx.runMutation(api.contribute, { ...args, invitationId: body.invitationId, description: body.description, artifactUrl: body.artifactUrl });
      }
      if (parts.length === 5 && operation === 'invitations') return ctx.runMutation(api.invitationStatus, { ...args, invitationId: parts[4], status: body.status });
      if (parts.length === 6 && operation === 'contributions' && parts[5] === 'review') return ctx.runMutation(api.review, { ...args, contributionId: parts[4], status: body.status, reviewNote: body.reviewNote });
      if (parts.length === 5 && operation === 'funding') {
        if (mode !== 'test' && mode !== 'live') fail('unavailable', 'Payments are not configured.');
        const funded = { ...args, livemode };
        switch (parts[4]) {
          case 'configure': return ctx.runMutation(funding.configureFunding, { ...funded, targetCents: body.targetCents });
          case 'back': return ctx.runMutation(funding.backProject, { ...funded, amountCents: body.amountCents, expectedTargetCents: body.expectedTargetCents, expectedFeeCents: body.expectedFeeCents });
          case 'withdraw': return ctx.runMutation(funding.withdrawBacking, { ...funded, backingId: body.backingId });
          case 'start': return ctx.runMutation(funding.startBuild, funded);
          case 'cancel': return ctx.runMutation(funding.cancelFunding, funded);
          case 'settle': return ctx.runMutation(funding.settleFunding, funded);
        }
      }
    }
  }
  fail('not_found', 'Playground operation not found.');
}
