import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';
const modules = import.meta.glob('./**/*.{ts,js}');
afterEach(() => vi.unstubAllEnvs());

describe('private billing routes', () => {
  it('requires separate service authority for payment writes', async () => {
    vi.stubEnv('AGARTHA_BILLING_GATEWAY_KEY', 'gateway');
    vi.stubEnv('AGARTHA_BILLING_PAYMENT_KEY', 'payment');
    const t = convexTest({ schema, modules });
    const options = { method: 'POST', headers: { 'content-type': 'application/json', 'x-agartha-billing-key': 'gateway' }, body: '{}' };
    expect((await t.fetch('/billing/api/fulfillPurchase', options)).status).toBe(401);
    expect((await t.fetch('/billing/api/getPurchaseForPayment', options)).status).toBe(401);
    expect((await t.fetch('/billing/api/getCheckoutReceipt', options)).status).toBe(401);
    expect((await t.fetch('/billing/api/reversePurchase', options)).status).toBe(404);
    expect((await t.fetch('/billing/api/balance', { ...options, headers: {} })).status).toBe(401);
  });

  it('exposes Checkout receipts only to the payment service key', async () => {
    vi.stubEnv('AGARTHA_BILLING_GATEWAY_KEY', 'gateway');
    vi.stubEnv('AGARTHA_BILLING_PAYMENT_KEY', 'payment');
    const t = convexTest({ schema, modules });
    const token = 'e'.repeat(64);
    await t.mutation(anyApi.cloud.session.register, { token, name: 'Receipt test', ipHash: 'receipt-test' });
    await t.mutation(anyApi.cloud.purchases.createPurchase, { token, purchaseId: 'receipt-1', amountCents: 500, livemode: false, paymentRail: 'checkout', requestId: 'receipt-1' });
    await t.mutation(anyApi.cloud.purchases.attachCheckoutSession, { purchaseId: 'receipt-1', checkoutSessionId: 'cs_test_receipt' });
    const headers = { 'content-type': 'application/json', 'x-agartha-billing-key': 'gateway', 'x-agartha-payment-key': 'payment' };
    const response = await t.fetch('/billing/api/getCheckoutReceipt', { method: 'POST', headers, body: JSON.stringify({ purchaseId: 'receipt-1', checkoutSessionId: 'cs_test_receipt' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purchase: { purchaseId: 'receipt-1', checkoutSessionId: 'cs_test_receipt' }, payment: null });
  });

  it('authenticates owner operations and rejects oversized bodies', async () => {
    vi.stubEnv('AGARTHA_BILLING_GATEWAY_KEY', 'gateway');
    const t = convexTest({ schema, modules });
    const token = 'c'.repeat(64);
    await t.mutation(anyApi.cloud.session.register, { token, name: 'Billing test', ipHash: 'billing-test' });
    const headers = { 'content-type': 'application/json', 'x-agartha-billing-key': 'gateway' };
    expect((await t.fetch('/billing/api/balance', { method: 'POST', headers, body: JSON.stringify({ token: 'd'.repeat(64), livemode: false }) })).status).toBe(401);
    const response = await t.fetch('/billing/api/balance', { method: 'POST', headers, body: JSON.stringify({ token, livemode: false }) });
    expect(response.status).toBe(200);
    expect((await response.json()).availableCents).toBe(0);
    expect((await t.fetch('/billing/api/balance', { method: 'POST', headers, body: 'x'.repeat(16_385) })).status).toBe(413);
  });
});
