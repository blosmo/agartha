import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { createLedgerClient, BillingHttpError } from '../billing/ledgerClient.js';
import { jsonResponse, paymentEnvironment, type BillingRequest } from '../billing/http.js';
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
export async function managedInference(req: BillingRequest, res: ServerResponse) {
  if (req.method !== 'POST') throw new BillingHttpError(503, 'Managed modeling is not available.');
  const key = req.headers['x-agartha-broker-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 256) throw new BillingHttpError(401, 'Broker authentication required.');
  const { ledger } = paymentEnvironment();
  const brokerLedger = createLedgerClient({ siteUrl: process.env.AGARTHA_CONVEX_SITE_URL!, gatewayKey: process.env.AGARTHA_BILLING_GATEWAY_KEY!, brokerKey: key });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 450_000 || !/^[A-Za-z0-9_-]{1,80}$/.test(body.jobId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.executorId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.operationId)) throw new BillingHttpError(400, 'Invalid inference request.');
  // Validates broker authority before the payment service may authorize any inference.
  const row = await brokerLedger<Record<string, any>>('getManagedJobForBroker', { jobId: body.jobId });
  if (process.env.AGARTHA_MANAGED_MODELING_ENABLED !== 'true' && row.agentId !== process.env.AGARTHA_MANAGED_MODELING_OPERATOR_AGENT_ID) throw new BillingHttpError(503, 'Managed modeling is not available.');
  const credential = managedCredential(req);
  if (!credential) throw new BillingHttpError(503, 'Model access is not configured.');
  const step = await runInference({ jobId: body.jobId, executorId: body.executorId, operationId: body.operationId, brief: row.brief, history: body.history, ...(body.image === undefined ? {} : { image: body.image }), remainingCents: row.reservedAiCents - row.chargedAiCents - row.pendingAiCents }, ledger, credential);
  jsonResponse(res, { model: MANAGED_MODEL, ...step });
}
