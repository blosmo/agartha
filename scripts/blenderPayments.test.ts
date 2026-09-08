import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { Challenge, Credential } from 'mppx';
import {
  BILLING_WEBHOOK_EVENTS,
  createCreditCheckout,
  parseStripeWebhook,
  verifyCreditPayment,
  type BillingPurchase,
} from '../packages/billing/stripe.js';
import { handleCreditMpp } from '../packages/billing/mpp.js';

const purchase = (overrides: Partial<BillingPurchase> = {}): BillingPurchase => ({
  purchaseId: 'purchase_123',
  agentId: 'agent_123',
  amountCents: 500,
  currency: 'usd',
  livemode: false,
  paymentRail: 'checkout',
  status: 'pending',
  expiresAt: Date.now() + 60_000,
  ...overrides,
});

describe('Stripe Blender adapters', () => {
  it('returns a fresh payment challenge for malformed MPP credentials', async () => {
    const create = vi.fn();
    const response = await handleCreditMpp(new Request('https://agartha.test/pay', { method: 'POST', headers: { Authorization: 'Payment invalid' } }), purchase({ paymentRail: 'mpp' }), {
      stripeClient: { paymentIntents: { create } } as unknown as Stripe,
      profileId: 'profile_test_fixture', signingSecret: '01234567890123456789012345678901', livemode: false,
    }, async () => {});
    expect(response.status).toBe(402);
    expect(response.headers.get('www-authenticate')).toMatch(/^Payment /);
    expect(create).not.toHaveBeenCalled();
  });
  it('creates a server-priced Checkout session with immutable metadata and idempotency', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.test' });
    const stripe = {
      checkout: {
        sessions: {
          create,
          retrieve: vi.fn(),
        },
      },
    } as unknown as Stripe;

    await createCreditCheckout(stripe, purchase(), {
      successUrl: 'https://agartha.test/success',
      cancelUrl: 'https://agartha.test/cancel',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        adaptive_pricing: { enabled: false },
        client_reference_id: 'purchase_123',
        metadata: { agartha_purchase_id: 'purchase_123', agartha_agent_id: 'agent_123' },
        payment_intent_data: {
          metadata: { agartha_purchase_id: 'purchase_123', agartha_agent_id: 'agent_123' },
        },
        line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 500, currency: 'usd' }) })],
      }),
      { idempotencyKey: 'purchase_123' },
    );
  });

  it('retrieves a stored Checkout session instead of charging again', async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: 'cs_existing' });
    const create = vi.fn();
    const stripe = { checkout: { sessions: { create, retrieve } } } as unknown as Stripe;
    const result = await createCreditCheckout(stripe, purchase({ checkoutSessionId: 'cs_existing' }), {
      successUrl: 'https://agartha.test/success', cancelUrl: 'https://agartha.test/cancel',
    });
    expect(result.id).toBe('cs_existing');
    expect(retrieve).toHaveBeenCalledWith('cs_existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid amount, rail, and unsafe redirect URLs', async () => {
    const stripe = {} as Stripe;
    await expect(createCreditCheckout(stripe, purchase({ amountCents: 700 }), { successUrl: 'https://a', cancelUrl: 'https://b' })).rejects.toThrow(/amount/i);
    await expect(createCreditCheckout(stripe, purchase({ paymentRail: 'mpp' }), { successUrl: 'https://a', cancelUrl: 'https://b' })).rejects.toThrow(/rail/i);
    await expect(createCreditCheckout(stripe, purchase(), { successUrl: 'javascript:alert(1)', cancelUrl: 'https://b' })).rejects.toThrow(/url/i);
  });

  it('constructs webhooks from exact raw bytes and rejects tampering', () => {
    const stripe = new Stripe('sk_test_unused');
    const raw = Buffer.from(JSON.stringify({ id: 'evt_test', object: 'event', type: 'payment_intent.succeeded', data: { object: {} } }));
    const secret = 'whsec_test';
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw.toString(), secret });
    expect(parseStripeWebhook(stripe, raw, signature, secret).type).toBe('payment_intent.succeeded');
    expect(() => parseStripeWebhook(stripe, raw, `${signature}x`, secret)).toThrow();
    expect(BILLING_WEBHOOK_EVENTS).toHaveLength(15);
  });

  it('returns a paid observation only after metadata, mode, amount and authoritative state agree', async () => {
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_123', object: 'payment_intent', amount: 500, amount_received: 500, currency: 'usd', livemode: false,
          status: 'succeeded', metadata: { agartha_purchase_id: 'purchase_123', agartha_agent_id: 'agent_123' },
          latest_charge: 'ch_123',
        }),
      },
      charges: { list: vi.fn().mockResolvedValue({ data: [{ id: 'ch_123', payment_intent: 'pi_123' }], has_more: false }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [{ amount: 100, status: 'succeeded' }], has_more: false }) },
      disputes: { list: vi.fn().mockResolvedValue({ data: [{ amount: 50, status: 'needs_response' }], has_more: false }) },
    } as unknown as Stripe;
    await expect(verifyCreditPayment(stripe, purchase(), 'pi_123')).resolves.toEqual({
      purchaseId: 'purchase_123', paymentId: 'pi_123', amountCents: 500, currency: 'usd', livemode: false,
      paid: true, refundedCents: 100, disputedCents: 50, disputeOpen: true,
    });
  });

  it('issues a purchase-bound MPP challenge without creating a payment', async () => {
    const stripe = {
      rawRequest: vi.fn(),
      paymentIntents: { create: vi.fn() },
    } as unknown as Stripe;
    const response = await handleCreditMpp(new Request('https://agartha.test/api/blender/mpp'), purchase({ paymentRail: 'mpp' }), {
      stripeClient: stripe,
      profileId: 'agartha-test-profile',
      signingSecret: '01234567890123456789012345678901',
      livemode: false,
    }, vi.fn());
    expect(response.status).toBe(402);
    expect(response.headers.get('www-authenticate')).toContain('intent="charge"');
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('does not create a second MPP payment for an already paid purchase', async () => {
    const stripe = { rawRequest: vi.fn(), paymentIntents: { create: vi.fn() } } as unknown as Stripe;
    const response = await handleCreditMpp(new Request('https://agartha.test/api/blender/mpp'), purchase({ paymentRail: 'mpp', status: 'paid' }), {
      stripeClient: stripe, profileId: 'profile', signingSecret: '01234567890123456789012345678901', livemode: false,
    }, vi.fn());
    expect(response.status).toBe(409);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects an expired pending MPP purchase before issuing a challenge', async () => {
    const stripe = { rawRequest: vi.fn(), paymentIntents: { create: vi.fn() } } as unknown as Stripe;
    const response = await handleCreditMpp(new Request('https://agartha.test/api/blender/mpp'), purchase({ paymentRail: 'mpp', expiresAt: Date.now() - 1 }), {
      stripeClient: stripe, profileId: 'profile', signingSecret: '01234567890123456789012345678901', livemode: false,
    }, vi.fn());
    expect(response.status).toBe(409);
  });

  it('does not return a success response when canonical MPP verification fails', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'pi_mpp', status: 'succeeded' });
    const stripe = {
      rawRequest: vi.fn(),
      paymentIntents: { create, retrieve: vi.fn().mockResolvedValue({ id: 'pi_mpp', amount: 500, amount_received: 500, currency: 'usd', livemode: false, status: 'succeeded', metadata: {} }) },
      charges: { list: vi.fn() }, refunds: { list: vi.fn() }, disputes: { list: vi.fn() },
    } as unknown as Stripe;
    const config = { stripeClient: stripe, profileId: 'profile', signingSecret: '01234567890123456789012345678901', livemode: false };
    const mppPurchase = purchase({ paymentRail: 'mpp' });
    const challengeResponse = await handleCreditMpp(new Request('https://agartha.test/api/blender/mpp'), mppPurchase, config, vi.fn());
    const challenge = Challenge.deserialize(challengeResponse.headers.get('www-authenticate')!);
    const request = new Request('https://agartha.test/api/blender/mpp', { headers: { authorization: Credential.serialize({ challenge, payload: { spt: 'spt_test', externalId: 'purchase_123' } }) } });
    await expect(handleCreditMpp(request, mppPurchase, config, vi.fn())).rejects.toThrow(/metadata/i);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not return a success response when the paid ledger callback fails', async () => {
    const stripe = {
      rawRequest: vi.fn(),
      paymentIntents: { create: vi.fn().mockResolvedValue({ id: 'pi_mpp', status: 'succeeded' }), retrieve: vi.fn().mockResolvedValue({ id: 'pi_mpp', amount: 500, amount_received: 500, currency: 'usd', livemode: false, status: 'succeeded', metadata: { agartha_purchase_id: 'purchase_123', agartha_agent_id: 'agent_123' } }) },
      charges: { list: vi.fn().mockResolvedValue({ data: [{ id: 'ch_mpp', payment_intent: 'pi_mpp' }], has_more: false }) }, refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) }, disputes: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    } as unknown as Stripe;
    const config = { stripeClient: stripe, profileId: 'profile', signingSecret: '01234567890123456789012345678901', livemode: false };
    const mppPurchase = purchase({ paymentRail: 'mpp' });
    const challengeResponse = await handleCreditMpp(new Request('https://agartha.test/api/blender/mpp'), mppPurchase, config, vi.fn());
    const challenge = Challenge.deserialize(challengeResponse.headers.get('www-authenticate')!);
    const request = new Request('https://agartha.test/api/blender/mpp', { headers: { authorization: Credential.serialize({ challenge, payload: { spt: 'spt_test', externalId: 'purchase_123' } }) } });
    await expect(handleCreditMpp(request, mppPurchase, config, vi.fn().mockRejectedValue(new Error('ledger unavailable')))).rejects.toThrow('ledger unavailable');
  });

  it('fails closed when Stripe pagination is empty or repeats its cursor', async () => {
    const paymentIntent = { id: 'pi_123', object: 'payment_intent', amount: 500, amount_received: 500, currency: 'usd', livemode: false, status: 'succeeded', metadata: { agartha_purchase_id: 'purchase_123', agartha_agent_id: 'agent_123' }, latest_charge: 'ch_123' };
    const stripe = { paymentIntents: { retrieve: vi.fn().mockResolvedValue(paymentIntent) }, charges: { list: vi.fn().mockResolvedValue({ data: [{ id: 'ch_123', payment_intent: 'pi_123' }], has_more: false }) }, refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: true }) }, disputes: { list: vi.fn() } } as unknown as Stripe;
    await expect(verifyCreditPayment(stripe, purchase(), 'pi_123')).rejects.toThrow(/more pages/i);
    const repeated = { paymentIntents: { retrieve: vi.fn().mockResolvedValue(paymentIntent) }, charges: { list: vi.fn().mockResolvedValue({ data: [{ id: 'ch_123', payment_intent: 'pi_123' }], has_more: true }) }, refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) }, disputes: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) } } as unknown as Stripe;
    await expect(verifyCreditPayment(repeated, purchase(), 'pi_123')).rejects.toThrow(/cursor/i);
  });
});
