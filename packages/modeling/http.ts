import type { ServerResponse } from 'node:http';
import { createLedgerClient, BillingHttpError } from '../billing/ledgerClient.js';
import { jsonResponse, paymentEnvironment, type BillingRequest } from '../billing/http.js';
import { MANAGED_MODEL, runInference } from './inference.js';

export function managedEnabled() {
  return process.env.AGARTHA_MANAGED_MODELING_ENABLED === 'true' && Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}
export async function managedInference(req: BillingRequest, res: ServerResponse) {
  if (req.method !== 'POST' || !managedEnabled()) throw new BillingHttpError(503, 'Managed modeling is not available.');
  const key = req.headers['x-agartha-broker-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 256) throw new BillingHttpError(401, 'Broker authentication required.');
  const { ledger } = paymentEnvironment();
  const brokerLedger = createLedgerClient({ siteUrl: process.env.AGARTHA_CONVEX_SITE_URL!, gatewayKey: process.env.AGARTHA_BILLING_GATEWAY_KEY!, brokerKey: key });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 450_000 || !/^[A-Za-z0-9_-]{1,80}$/.test(body.jobId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.executorId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.operationId)) throw new BillingHttpError(400, 'Invalid inference request.');
  // Validates broker authority before the payment service may authorize any inference.
  const row = await brokerLedger<Record<string, any>>('getManagedJobForBroker', { jobId: body.jobId });
  const step = await runInference({ jobId: body.jobId, executorId: body.executorId, operationId: body.operationId, brief: row.brief, history: body.history, ...(body.image === undefined ? {} : { image: body.image }), remainingCents: row.reservedAiCents - row.chargedAiCents - row.pendingAiCents }, ledger, (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)!);
  jsonResponse(res, { model: MANAGED_MODEL, ...step });
}
