import { anyApi, httpActionGeneric, type HttpRouter } from 'convex/server';
import { ConvexError } from 'convex/values';

const purchases = anyApi.cloud.purchases;
const ownerQueries = new Set(['balance', 'getPurchase']);
const ownerMutations = new Set(['createPurchase', 'authorizePaymentAttempt']);
const paymentQueries = new Set(['getPurchaseForPayment', 'getCheckoutReceipt']);
const paymentMutations = new Set(['attachCheckoutSession', 'beginPaymentReconciliation', 'fulfillPurchase']);
const sessionQueries = new Set(['getReservation']);
const sessionMutations = new Set(['createQuote', 'reserveSession', 'requestStop']);
const brokerQueries = new Set(['getReservationForBroker', 'listActiveReservations']);
const brokerMutations = new Set(['claimLaunch', 'claimStartup', 'claimShutdown', 'renewShutdown', 'claimMonitor', 'attachWorker', 'markSessionReady', 'recordLaunchFailure', 'settleSession', 'authorizeOperation', 'completeOperation']);
const projectOwnerQueries = new Set(['getProject']);
const projectOwnerMutations = new Set(['createProject']);
const projectBrokerQueries = new Set(['getProjectForReservation', 'listArtifactDeletionCandidates', 'listExpiredProjects', 'getArtifactReservation']);
const projectBrokerMutations = new Set(['ensureProjectForReservation', 'reserveArtifactBytes', 'commitArtifact', 'rollbackArtifact', 'claimArtifactDeletion', 'confirmArtifactDeletion']);

const managedOwnerQueries = new Set(['getManagedJob']);
const managedOwnerMutations = new Set(['createManagedJob', 'requestManagedCancel']);
const managedBrokerQueries = new Set(['getManagedJobForBroker', 'listActiveManagedJobs']);
const managedBrokerMutations = new Set(['authorizeManagedDownload', 'claimManagedJob', 'heartbeatManagedJob', 'recordManagedCheckpoint', 'recordManagedVideo', 'recordManagedReference', 'recordManagedAcceptance', 'finishManagedJob', 'recoverManagedJob']);
const managedPaymentMutations = new Set(['claimManagedInference', 'completeManagedInference']);

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function registerBillingRoutes(router: HttpRouter) {
  router.route({ pathPrefix: '/billing/api/', method: 'POST', handler: httpActionGeneric(async (ctx, request) => {
    const key = process.env.AGARTHA_BILLING_GATEWAY_KEY;
    if (!key || request.headers.get('x-agartha-billing-key') !== key) return json({ error: 'Unauthorized gateway.' }, 401);
    const operation = new URL(request.url).pathname.slice('/billing/api/'.length);
    const managed = managedOwnerQueries.has(operation) || managedOwnerMutations.has(operation) || managedBrokerQueries.has(operation) || managedBrokerMutations.has(operation) || managedPaymentMutations.has(operation);
    const trusted = paymentQueries.has(operation) || paymentMutations.has(operation) || managedPaymentMutations.has(operation);
    const broker = managedBrokerQueries.has(operation) || managedBrokerMutations.has(operation) || brokerQueries.has(operation) || brokerMutations.has(operation) || projectBrokerQueries.has(operation) || projectBrokerMutations.has(operation);
    const session = sessionQueries.has(operation) || sessionMutations.has(operation) || brokerQueries.has(operation) || brokerMutations.has(operation);
    const project = projectOwnerQueries.has(operation) || projectOwnerMutations.has(operation) || projectBrokerQueries.has(operation) || projectBrokerMutations.has(operation);
    if (!managed && !trusted && !broker && !session && !project && !ownerQueries.has(operation) && !ownerMutations.has(operation)) return json({ error: 'Unknown billing operation.' }, 404);
    if (trusted) {
      const paymentKey = process.env.AGARTHA_BILLING_PAYMENT_KEY;
      if (!paymentKey || request.headers.get('x-agartha-payment-key') !== paymentKey) return json({ error: 'Unauthorized payment service.' }, 401);
    }
    if (broker) {
      const brokerKey = process.env.AGARTHA_BILLING_BROKER_KEY;
      if (!brokerKey || request.headers.get('x-agartha-broker-key') !== brokerKey) return json({ error: 'Unauthorized compute broker.' }, 401);
    }
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'JSON body required.' }, 400);
      let length = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16_384) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const args = JSON.parse(new TextDecoder().decode(bytes));
      if (!args || typeof args !== 'object' || Array.isArray(args)) return json({ error: 'Invalid request.' }, 400);
      const module = managed ? anyApi.cloud.managedJobs : project ? anyApi.cloud.blenderProjects : session ? anyApi.cloud.blenderSessions : purchases;
      const query = managedOwnerQueries.has(operation) || managedBrokerQueries.has(operation) || ownerQueries.has(operation) || paymentQueries.has(operation) || sessionQueries.has(operation) || brokerQueries.has(operation) || projectOwnerQueries.has(operation) || projectBrokerQueries.has(operation);
      const result = query ? await ctx.runQuery(module[operation], args) : await ctx.runMutation(module[operation], args);
      return json(result);
    } catch (error) {
      const code = error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data ? String(error.data.code) : '';
      const status = ({ unauthorized: 401, forbidden: 403, not_found: 404, rate_limited: 429 } as Record<string, number>)[code] ?? 409;
      return json({ error: 'Billing request rejected.', ...(code ? { code } : {}) }, status);
    }
  }) });
}
