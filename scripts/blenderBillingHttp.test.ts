import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import Stripe from 'stripe';
import { createLedgerClient } from '../packages/billing/ledgerClient.js';
import { rawBody, type BillingRequest } from '../packages/billing/http.js';
import blender from '../api/blender.js';
import webhook from '../api/stripe-webhook.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function responseRecorder() {
  const state = { statusCode: 200, body: '', headers: new Map<string, string>() };
  const res = {
    get statusCode() { return state.statusCode; },
    set statusCode(value: number) { state.statusCode = value; },
    setHeader(key: string, value: string) { state.headers.set(key, value); },
    end(value?: string | Buffer) { state.body = value?.toString() ?? ''; },
  } as unknown as ServerResponse;
  return { state, res };
}

function configureTestPayments() {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL', 'https://ledger.example');
  vi.stubEnv('AGARTHA_BILLING_GATEWAY_KEY', 'gateway');
  vi.stubEnv('AGARTHA_BILLING_PAYMENT_KEY', 'payment');
}

describe('billing transport boundaries', () => {
  it('preserves webhook bytes and rejects parsed or oversized bodies', async () => {
    const original = Buffer.from('{ "id": "event" }\n');
    const request = Readable.from([original.subarray(0, 3), original.subarray(3)]) as BillingRequest;
    expect(await rawBody(request, 100)).toEqual(original);
    await expect(rawBody({ body: { id: 'event' } } as unknown as BillingRequest, 100)).rejects.toThrow('Raw request');
    await expect(rawBody(Readable.from([Buffer.alloc(101)]) as BillingRequest, 100)).rejects.toThrow('too large');
  });

  it('uses only a fixed ledger origin, bounded timeout, and private headers', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ availableCents: 500 }));
    const call = createLedgerClient({ siteUrl: 'https://ledger.example', gatewayKey: 'gateway', paymentKey: 'payment' }, fetcher);
    expect(await call('balance', { token: 'agent' })).toEqual({ availableCents: 500 });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://ledger.example/billing/api/balance');
    expect(init.redirect).toBe('error');
    expect(init.headers['x-agartha-payment-key']).toBe('payment');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    await expect(call('../fulfillPurchase', {})).rejects.toThrow('Invalid billing operation');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('redacts upstream error bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('secret token internal details', { status: 500 }));
    const call = createLedgerClient({ siteUrl: 'https://ledger.example', gatewayKey: 'gateway' }, fetcher);
    await expect(call('balance', {})).rejects.toThrow('Billing operation could not complete.');
  });

  it('publishes pricing without secrets and requires agent auth before ledger access', async () => {
    const pricing = responseRecorder();
    await blender({ method: 'GET', query: { path: 'pricing' }, headers: {} } as unknown as BillingRequest, pricing.res);
    expect(pricing.state.statusCode).toBe(200);
    expect(JSON.parse(pricing.state.body).minimumMinutes).toBe(5);
    const unauthenticated = responseRecorder();
    await blender({ method: 'POST', query: { path: 'purchases' }, headers: {} } as unknown as BillingRequest, unauthenticated.res);
    expect(unauthenticated.state.statusCode).toBe(401);
  });

  it('keeps purchases disabled and separates MPP credentials from agent credentials', async () => {
    configureTestPayments();
    vi.stubEnv('AGARTHA_BLENDER_BILLING_ENABLED', 'false');
    const disabled = responseRecorder();
    await blender({ method: 'POST', query: { path: 'purchases' }, headers: { authorization: `Bearer ${'a'.repeat(64)}` } } as unknown as BillingRequest, disabled.res);
    expect(disabled.state.statusCode).toBe(503);
    const mpp = responseRecorder();
    await blender({ method: 'POST', query: { path: 'purchases/p1/mpp' }, headers: { authorization: 'Payment opaque' } } as unknown as BillingRequest, mpp.res);
    expect(mpp.state.statusCode).toBe(401);
    expect(mpp.state.body).toContain('X-Agartha-Agent-Token');
  });

  it('rejects forged webhook bytes and accepts signed unrelated events without ledger writes', async () => {
    configureTestPayments();
    const stripe = new Stripe('sk_test_fixture');
    const payload = JSON.stringify({ id: 'evt_fixture', object: 'event', livemode: false, type: 'customer.created', data: { object: { id: 'cus_fixture' } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_fixture' });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const accepted = await webhook.fetch(new Request('https://agartha.test/api/blender/webhook', { method: 'POST', headers: { 'stripe-signature': signature, 'content-type': 'application/json' }, body: payload }));
    expect(accepted.status).toBe(200);
    const forged = await webhook.fetch(new Request('https://agartha.test/api/blender/webhook', { method: 'POST', headers: { 'stripe-signature': signature, 'content-type': 'application/json' }, body: payload + ' ' }));
    expect(forged.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
