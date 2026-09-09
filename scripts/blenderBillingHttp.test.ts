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
  it('discovers standalone access without credentials or payment configuration', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const path of ['', 'capabilities']) {
      const response = responseRecorder();
      await blender({ method: 'GET', query: { path }, headers: {} } as unknown as BillingRequest, response.res);
      expect(response.state.statusCode).toBe(200);
      expect(JSON.parse(response.state.body)).toMatchObject({ name: 'Agartha Compute', registration: '/api/session', interfaces: ['http', 'mcp'], modelingGuide: '/compute/modeling.md', toolkitGuide: '/agents/blender-quality.md', toolkit: '/agents/blender-toolkit.py' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns trusted standalone connection links without private reservation fields', async () => {
    configureTestPayments();
    vi.stubEnv('AGARTHA_BLENDER_BROKER_URL', 'https://broker.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ reservationId: 'r1', projectId: 'p1', status: 'reserved', providerWorkerId: 'private-worker' })));
    const response = responseRecorder();
    await blender({ method: 'GET', query: { path: 'sessions/r1' }, headers: { authorization: `Bearer ${'a'.repeat(64)}` } } as unknown as BillingRequest, response.res);
    expect(response.state.statusCode).toBe(200);
    expect(JSON.parse(response.state.body)).toMatchObject({ statusUrl: 'https://broker.example/sessions/r1', toolsUrl: 'https://broker.example/sessions/r1/tools', artifactsUrl: 'https://broker.example/sessions/r1/artifacts/', mcpUrl: 'https://broker.example/mcp/r1' });
    expect(response.state.body).not.toContain('private-worker');
  });

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

  it.each(['checkout', 'mpp'] as const)('returns an actionable %s handoff without starting a payment', async paymentRail => {
    configureTestPayments();
    vi.stubEnv('AGARTHA_BLENDER_BILLING_ENABLED', 'true');
    const purchase = { purchaseId: 'p1', paymentRail, status: 'pending', expiresAt: Date.now() + 60_000, livemode: false };
    const fetcher = vi.fn().mockImplementation(async () => Response.json(purchase));
    vi.stubGlobal('fetch', fetcher);
    const result = responseRecorder();
    await blender({ method: 'POST', query: { path: 'purchases' }, headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: { purchaseId: 'p1', requestId: 'p1', amountCents: 500, paymentRail } } as unknown as BillingRequest, result.res);
    expect(result.state.statusCode).toBe(201);
    expect(JSON.parse(result.state.body)).toMatchObject({ statusUrl: '/api/blender/purchases/p1', balanceUrl: '/api/blender/balance', nextAction: { method: 'POST', url: `/api/blender/purchases/p1/${paymentRail}`, agentTokenHeader: paymentRail === 'mpp' ? 'X-Agartha-Agent-Token' : 'Authorization', agentTokenScheme: paymentRail === 'mpp' ? null : 'Bearer' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://ledger.example/billing/api/createPurchase');
    expect(result.state.body).not.toContain('a'.repeat(64));
  });

  it.each(['paid', 'expired', 'disabled'] as const)('does not suggest paying a %s purchase', async condition => {
    configureTestPayments();
    vi.stubEnv('AGARTHA_BLENDER_BILLING_ENABLED', condition === 'disabled' ? 'false' : 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ purchaseId: 'p1', paymentRail: 'checkout', status: condition === 'paid' ? 'paid' : 'pending', expiresAt: Date.now() + (condition === 'expired' ? -60_000 : 60_000), livemode: false })));
    const result = responseRecorder();
    await blender({ method: 'GET', query: { path: 'purchases/p1' }, headers: { authorization: `Bearer ${'a'.repeat(64)}` } } as unknown as BillingRequest, result.res);
    expect(result.state.statusCode).toBe(200);
    expect(JSON.parse(result.state.body).nextAction).toBeNull();
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
