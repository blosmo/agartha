import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { createLedgerClient, BillingHttpError } from '../billing/ledgerClient.js';
import { jsonResponse, paymentEnvironment, type BillingRequest } from '../billing/http.js';
import { generateReference } from './references.js';
import { MANAGED_MODEL, runInference } from './inference.js';

export function managedCredential(req?: BillingRequest) {
  const header = req?.headers['x-vercel-oidc-token'];
  return process.env.AI_GATEWAY_API_KEY || (process.env.VERCEL === '1' && typeof header === 'string' ? header : undefined) || process.env.VERCEL_OIDC_TOKEN;
}
export function managedEnabled(token?: string, req?: BillingRequest) {
  const operator = process.env.AGARTHA_MANAGED_MODELING_OPERATOR_AGENT_ID;
  const permittedOperator = Boolean(token && operator && `agent-${createHash('sha256').update(token).digest('hex').slice(0, 24)}` === operator);
  return (process.env.AGARTHA_MANAGED_MODELING_ENABLED === 'true' || permittedOperator) && Boolean(managedCredential(req));
}
export function referencesEnabled(token?: string) {
  const operator = process.env.AGARTHA_REFERENCE_MODELING_OPERATOR_AGENT_ID;
  return process.env.AGARTHA_REFERENCE_MODELING_ENABLED === 'true' || Boolean(token && operator && `agent-${createHash('sha256').update(token).digest('hex').slice(0, 24)}` === operator);
}

export async function managedInference(req: BillingRequest, res: ServerResponse) {
  if (req.method !== 'POST') throw new BillingHttpError(503, 'Managed modeling is not available.');
  const key = req.headers['x-agartha-broker-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 256) throw new BillingHttpError(401, 'Broker authentication required.');
  const { ledger } = paymentEnvironment();
  const brokerLedger = createLedgerClient({ siteUrl: process.env.AGARTHA_CONVEX_SITE_URL!, gatewayKey: process.env.AGARTHA_BILLING_GATEWAY_KEY!, brokerKey: key });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > ((body.protocol === 2 || body.protocol === 3) ? 3_000_000 : 450_000) || !/^[A-Za-z0-9_-]{1,80}$/.test(body.jobId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.executorId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.operationId)) throw new BillingHttpError(400, 'Invalid inference request.');
  if (body.protocol !== undefined && ![2, 3].includes(body.protocol)) throw new BillingHttpError(400, 'Unknown workflow protocol.');
  // Validates broker authority before the payment service may authorize any inference.
  const row = await brokerLedger<Record<string, any>>('getManagedJobForBroker', { jobId: body.jobId });
  if (process.env.AGARTHA_MANAGED_MODELING_ENABLED !== 'true' && (row.initiatingAgentId ?? row.agentId) !== process.env.AGARTHA_MANAGED_MODELING_OPERATOR_AGENT_ID) throw new BillingHttpError(503, 'Managed modeling is not available.');
  const credential = managedCredential(req);
  if (!credential) throw new BillingHttpError(503, 'Model access is not configured.');
  const remainingCents = row.reservedAiCents - row.chargedAiCents - row.pendingAiCents;
  if (row.workflowVersion === 3 ? body.protocol !== 3 : body.protocol === 3) throw new BillingHttpError(400, 'Workflow protocol does not match the persisted job.');
  if (row.workflowVersion !== 3 && row.referenceMode === 'generate' && body.protocol !== 2) throw new BillingHttpError(400, 'Reference-guided jobs require the current Blender workflow.');
  if (body.protocol === 2 && row.referenceMode !== 'generate') throw new BillingHttpError(400, 'This job does not use reference-guided modeling.');
  if (body.kind === 'reference') {
    if (![2, 3].includes(body.protocol) || row.referenceMode !== 'generate' || body.operationId !== `${body.executorId}-reference`) throw new BillingHttpError(400, 'Invalid reference operation.');
    const reference = await generateReference({ jobId: body.jobId, executorId: body.executorId, operationId: body.operationId, brief: row.brief, remainingCents }, ledger, credential);
    jsonResponse(res, reference); return;
  }
  const v3Quality = body.protocol === 3 && ['strategy', 'review'].includes(body.kind);
  const legacyReview = body.protocol === 2 && body.kind === 'critique';
  if (body.kind !== undefined && body.kind !== 'modeling' && !v3Quality && !legacyReview) throw new BillingHttpError(400, 'Unknown modeling operation.');
  let step;
  try { step = await runInference({ jobId: body.jobId, executorId: body.executorId, operationId: body.operationId, brief: row.brief, history: body.history, ...(body.image === undefined ? {} : { image: body.image }), ...([2, 3].includes(body.protocol) ? { protocol: body.protocol, images: body.images } : {}), ...(body.protocol === 3 ? { kind: body.kind ?? 'modeling', strategy: body.strategy, candidateRevision: body.candidateRevision, glbSha256: body.glbSha256 } : legacyReview ? { kind: 'critique' } : {}), remainingCents }, ledger, credential); }
  catch (error) {
    if (body.protocol === 3 && (body.kind ?? 'modeling') === 'modeling' && error instanceof BillingHttpError && error.status === 409 && error.message === 'Remaining budget is reserved for delivery.') {
      jsonResponse(res, { error: error.message, code: 'quality_review_reserved' }, 409); return;
    }
    throw error;
  }
  jsonResponse(res, { model: MANAGED_MODEL, ...step });
}
