import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { reconcileStripeWebhook, type PaymentReconciliationLedger } from './reconcile.js';
import type { BillingPurchase, PaymentObservation } from './stripe.js';
import { createLedgerClient } from './ledgerClient.js';

const purchase: BillingPurchase = {
  purchaseId: 'purchase_1', agentId: 'agent_1', amountCents: 500, currency: 'usd', livemode: false,
  paymentRail: 'checkout', status: 'pending', expiresAt: Date.now() + 60_000,
};
const observation: PaymentObservation = {
  purchaseId: 'purchase_1', paymentId: 'pi_1', amountCents: 500, currency: 'usd', livemode: false,
  paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false,
};

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${type}`, object: 'event', api_version: null, created: 1, livemode: false, pending_webhooks: 1, request: null, type, data: { object } } as unknown as Stripe.Event;
}

function deps(overrides: Partial<PaymentReconciliationLedger> = {}) {
  const calls: string[] = [];
  const ledger: PaymentReconciliationLedger = {
    getPurchaseById: async () => { calls.push('purchase'); return purchase; },
    beginPaymentReconciliation: async () => { calls.push('begin'); return { generation: 1 }; },
    fulfillPurchase: async () => { calls.push('fulfill'); return { ok: true }; },
    ...overrides,
  };
  const stripe = {
    paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: 'pi_1', metadata: { agartha_purchase_id: 'purchase_1' } }) },
    charges: { retrieve: vi.fn() },
  } as unknown as Stripe;
  return { calls, ledger, stripe };
}

describe('Stripe payment reconciliation', () => {
  it('retries structured stale-generation errors through the HTTP client', async () => {
    let generation = 0;
    let fulfillCalls = 0;
    const client = createLedgerClient({ siteUrl: 'https://ledger.example', gatewayKey: 'gateway' }, vi.fn(async (url) => {
      if (String(url).endsWith('/getPurchaseForPayment')) return Response.json(purchase);
      if (String(url).endsWith('/beginPaymentReconciliation')) return Response.json({ generation: ++generation });
      fulfillCalls++;
      return fulfillCalls === 1 ? Response.json({ error: 'Billing request rejected.', code: 'stale_generation' }, { status: 409 }) : Response.json({ ok: true });
    }));
    const { stripe } = deps();
    const ledger: PaymentReconciliationLedger = {
      getPurchaseForPayment: purchaseId => client('getPurchaseForPayment', { purchaseId }),
      beginPaymentReconciliation: args => client('beginPaymentReconciliation', args),
      fulfillPurchase: args => client('fulfillPurchase', args),
    };
    await expect(reconcileStripeWebhook({ stripe, ledger, verifyPayment: async () => observation }, event('payment_intent.succeeded', { id: 'pi_1' }))).resolves.toMatchObject({ status: 'fulfilled', generation: 2 });
    expect(fulfillCalls).toBe(2);
  });
  it('fences before canonical verification and fulfillment', async () => {
    const { calls, ledger, stripe } = deps();
    const verifyPayment = vi.fn(async () => { calls.push('verify'); return observation; });
    await reconcileStripeWebhook({ stripe, ledger, verifyPayment, idFactory: () => 'attempt_1' }, event('payment_intent.succeeded', { id: 'pi_1' }));
    expect(calls).toEqual(['purchase', 'begin', 'verify', 'fulfill']);
    expect(verifyPayment).toHaveBeenCalledWith(stripe, purchase, 'pi_1');
  });

  it('resolves a checkout payment intent and ignores unrelated events without metadata', async () => {
    const { ledger, stripe } = deps();
    const verifyPayment = vi.fn(async () => observation);
    await expect(reconcileStripeWebhook({ stripe, ledger, verifyPayment }, event('checkout.session.completed', { id: 'cs_1', payment_intent: 'pi_1' }))).resolves.toMatchObject({ status: 'fulfilled' });
    (stripe.paymentIntents.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'pi_other', metadata: {} });
    await expect(reconcileStripeWebhook({ stripe, ledger, verifyPayment }, event('payment_intent.succeeded', { id: 'pi_other' }))).resolves.toEqual({ status: 'ignored', reason: 'unrelated_payment' });
  });

  it('re-fetches and claims a fresh generation after a stale generation rejection', async () => {
    const { calls, ledger, stripe } = deps({
      beginPaymentReconciliation: vi.fn(async () => { calls.push('begin'); return { generation: calls.filter((value) => value === 'begin').length }; }),
      fulfillPurchase: vi.fn(async () => { calls.push('fulfill'); if (calls.filter((value) => value === 'fulfill').length === 1) throw new Error('Stale payment reconciliation generation.'); return { ok: true }; }),
    });
    const verifyPayment = vi.fn(async () => { calls.push('verify'); return observation; });
    await expect(reconcileStripeWebhook({ stripe, ledger, verifyPayment, idFactory: vi.fn().mockReturnValueOnce('attempt_1').mockReturnValueOnce('attempt_2') }, event('payment_intent.succeeded', { id: 'pi_1' }))).resolves.toMatchObject({ status: 'fulfilled', generation: 2 });
    expect(calls).toEqual(['purchase', 'begin', 'verify', 'fulfill', 'purchase', 'begin', 'verify', 'fulfill']);
  });

  it('does not acknowledge a bound payment when verification or fulfillment fails', async () => {
    const { ledger, stripe } = deps();
    const verifyPayment = vi.fn().mockRejectedValue(new Error('Stripe unavailable'));
    await expect(reconcileStripeWebhook({ stripe, ledger, verifyPayment }, event('refund.created', { id: 're_1', payment_intent: 'pi_1' }))).rejects.toThrow('Stripe unavailable');
  });
});
