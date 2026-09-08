import type { IncomingMessage, ServerResponse } from 'node:http';
import Stripe from 'stripe';
import { BillingHttpError, createLedgerClient } from './ledgerClient.js';
import type { LedgerCall } from './ledgerClient.js';
import type { PaymentReconciliationLedger } from './reconcile.js';

export type BillingRequest = IncomingMessage & { body?: unknown; query?: Record<string, string | string[] | undefined> };

export function reconciliationLedger(call: LedgerCall): PaymentReconciliationLedger {
  return {
    getPurchaseForPayment: purchaseId => call('getPurchaseForPayment', { purchaseId }),
    beginPaymentReconciliation: args => call('beginPaymentReconciliation', args),
    fulfillPurchase: args => call('fulfillPurchase', args),
  };
}

export function paymentEnvironment() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !/^(sk|rk)_(test|live)_/.test(secret)) throw new BillingHttpError(503, 'Configure STRIPE_SECRET_KEY.');
  const siteUrl = process.env.AGARTHA_CONVEX_SITE_URL;
  const gatewayKey = process.env.AGARTHA_BILLING_GATEWAY_KEY;
  const paymentKey = process.env.AGARTHA_BILLING_PAYMENT_KEY;
  if (!siteUrl || !gatewayKey || !paymentKey) throw new BillingHttpError(503, 'Configure the billing ledger connection.');
  return { stripe: new Stripe(secret, { maxNetworkRetries: 1, timeout: 15_000 }), livemode: /^(sk|rk)_live_/.test(secret), ledger: createLedgerClient({ siteUrl, gatewayKey, paymentKey }) };
}

export function jsonResponse(res: ServerResponse, value: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

export async function rawBody(req: BillingRequest, maximumBytes: number): Promise<Buffer> {
  // Webhook callers must disable Vercel parsing: reconstructed JSON is not signed bytes.
  if (req.body !== undefined) {
    if (!Buffer.isBuffer(req.body)) throw new BillingHttpError(400, 'Raw request bytes are required.');
    if (req.body.length > maximumBytes) throw new BillingHttpError(413, 'Request too large.');
    return req.body;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maximumBytes) throw new BillingHttpError(413, 'Request too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function jsonBody(req: BillingRequest): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new BillingHttpError(415, 'Use application/json.');
  let body = req.body;
  try {
    if (body === undefined) body = JSON.parse((await rawBody(req, 16_384)).toString('utf8'));
    else if (typeof body === 'string' || Buffer.isBuffer(body)) body = JSON.parse(body.toString());
  } catch (error) {
    if (error instanceof BillingHttpError) throw error;
    throw new BillingHttpError(400, 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 16_384) throw new BillingHttpError(400, 'Invalid request body.');
  return body as Record<string, unknown>;
}

export function sendBillingError(res: ServerResponse, error: unknown) {
  jsonResponse(res, { error: error instanceof BillingHttpError ? error.message : 'Billing request could not complete. Retry using the same purchase ID.' }, error instanceof BillingHttpError ? error.status : 503);
}
