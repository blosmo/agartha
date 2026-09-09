import Stripe from 'stripe';

export type BillingPurchaseStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'canceled' | 'refunded' | 'disputed' | 'reversed';

export type BillingPurchase = {
  purchaseId: string;
  agentId: string;
  amountCents: number;
  currency: 'usd';
  livemode: boolean;
  paymentRail: 'checkout' | 'mpp';
  status: BillingPurchaseStatus;
  expiresAt: number;
  checkoutSessionId?: string;
};

export type StripeCheckoutSession = Stripe.Checkout.Session;

export type PaymentObservation = {
  purchaseId: string;
  paymentId: string;
  amountCents: number;
  currency: 'usd';
  livemode: boolean;
  paid: boolean;
  refundedCents: number;
  disputedCents: number;
  disputeOpen: boolean;
};

export const BILLING_WEBHOOK_EVENTS = [
  'checkout.session.async_payment_failed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.canceled',
  'payment_intent.payment_failed',
  'payment_intent.succeeded',
  'charge.dispute.closed',
  'charge.dispute.created',
  'charge.dispute.funds_reinstated',
  'charge.dispute.funds_withdrawn',
  'charge.refunded',
  'refund.created',
  'refund.failed',
  'refund.updated',
] as const;

export type BillingWebhookEventType = (typeof BILLING_WEBHOOK_EVENTS)[number];

export type CheckoutUrls = { successUrl: string; cancelUrl: string };

function assertPurchase(purchase: BillingPurchase, rail: BillingPurchase['paymentRail']): void {
  if (!purchase.purchaseId || !purchase.agentId) throw new Error('purchase identity is required');
  if (purchase.currency !== 'usd') throw new Error('only USD purchases are supported');
  if (purchase.paymentRail !== rail) throw new Error(`purchase rail must be ${rail}`);
  if (purchase.amountCents !== 500 && purchase.amountCents !== 2000) throw new Error('purchase amount must be $5 or $20');
}

function assertReturnUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('success and cancel URLs must be valid HTTPS URLs'); }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) return;
  throw new Error('success and cancel URLs must be HTTPS URLs');
}

function isExpired(expiresAt: number): boolean {
  const millis = expiresAt < 10_000_000_000 ? expiresAt * 1000 : expiresAt;
  return Date.now() >= millis;
}

export async function createCreditCheckout(
  stripe: Stripe,
  purchase: BillingPurchase,
  urls: CheckoutUrls,
): Promise<StripeCheckoutSession> {
  assertPurchase(purchase, 'checkout');
  assertReturnUrl(urls.successUrl);
  assertReturnUrl(urls.cancelUrl);

  if (purchase.status === 'pending' && isExpired(purchase.expiresAt)) throw new Error('pending purchase has expired');
  if (purchase.status === 'paid') {
    if (!purchase.checkoutSessionId) throw new Error('paid purchase is missing its stored Checkout session');
    return stripe.checkout.sessions.retrieve(purchase.checkoutSessionId);
  }
  if (purchase.status !== 'pending') throw new Error(`purchase cannot be charged from status ${purchase.status}`);
  if (purchase.checkoutSessionId) return stripe.checkout.sessions.retrieve(purchase.checkoutSessionId);

  const metadata = {
    agartha_purchase_id: purchase.purchaseId,
    agartha_agent_id: purchase.agentId,
  };
  return stripe.checkout.sessions.create({
    mode: 'payment',
    adaptive_pricing: { enabled: false },
    client_reference_id: purchase.purchaseId,
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: purchase.currency,
        unit_amount: purchase.amountCents,
        product_data: { name: `Agartha Blender credits ($${purchase.amountCents / 100})` },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
  }, { idempotencyKey: purchase.purchaseId });
}

export async function createCreditCheckoutWithLegacyRecovery(
  stripe: Stripe,
  purchase: BillingPurchase,
  urls: CheckoutUrls,
  legacyUrls: CheckoutUrls,
): Promise<StripeCheckoutSession> {
  try {
    return await createCreditCheckout(stripe, purchase, urls);
  } catch (error) {
    if (purchase.checkoutSessionId || !(error instanceof Stripe.errors.StripeIdempotencyError)) throw error;
    return await createCreditCheckout(stripe, purchase, legacyUrls);
  }
}

export function parseStripeWebhook(
  stripe: Stripe,
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

type StripePage<T> = { data: T[]; has_more: boolean };

async function listAll<T>(
  list: (params: { payment_intent: string; limit: number; starting_after?: string }) => Promise<StripePage<T>>,
  paymentId: string,
): Promise<T[]> {
  const items: T[] = [];
  let startingAfter: string | undefined;
  let pageCount = 0;
  for (;;) {
    if (pageCount++ >= 1_000) throw new Error('Stripe pagination exceeded the bounded page limit');
    const page = await list({ payment_intent: paymentId, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    items.push(...page.data);
    if (!page.has_more) return items;
    if (page.data.length === 0) throw new Error('Stripe pagination reported more pages without returning rows');
    const last = page.data[page.data.length - 1];
    if (!last || typeof last !== 'object' || !('id' in last) || typeof last.id !== 'string') throw new Error('Stripe pagination returned an item without an id');
    if (startingAfter === last.id) throw new Error('Stripe pagination cursor did not advance');
    startingAfter = last.id;
  }
}

export async function verifyCreditPayment(
  stripe: Stripe,
  purchase: BillingPurchase,
  paymentId: string,
): Promise<PaymentObservation> {
  if (!paymentId) throw new Error('payment ID is required');
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  const metadata = paymentIntent.metadata ?? {};
  if (metadata.agartha_purchase_id !== purchase.purchaseId || metadata.agartha_agent_id !== purchase.agentId) throw new Error('Stripe payment metadata does not match purchase');
  if (paymentIntent.currency !== 'usd' || paymentIntent.amount !== purchase.amountCents) throw new Error('Stripe payment amount or currency does not match purchase');
  if (paymentIntent.livemode !== purchase.livemode) throw new Error('Stripe payment mode does not match purchase');

  const [charges, refunds, disputes] = await Promise.all([
    listAll(stripe.charges.list.bind(stripe.charges), paymentId),
    listAll(stripe.refunds.list.bind(stripe.refunds), paymentId),
    listAll(stripe.disputes.list.bind(stripe.disputes), paymentId),
  ]);
  if (paymentIntent.status === 'succeeded' && paymentIntent.amount_received !== purchase.amountCents) throw new Error('Stripe payment received amount does not match purchase');
  const matchingCharges = charges.filter((charge) => {
    const paymentIntentReference = (charge as Stripe.Charge).payment_intent;
    return (typeof paymentIntentReference === 'string' ? paymentIntentReference : paymentIntentReference?.id) === paymentId;
  });
  if (paymentIntent.status === 'succeeded' && matchingCharges.length === 0) throw new Error('Stripe payment has no authoritative charge');

  const refundedCents = Math.min(purchase.amountCents, refunds.reduce((total, refund) => total + (refund as Stripe.Refund).amount * ((refund as Stripe.Refund).status === 'succeeded' ? 1 : 0), 0));
  const relevantDisputes = disputes.filter((dispute) => {
    const status = (dispute as Stripe.Dispute).status;
    return status !== 'won' && status !== 'warning_closed';
  });
  const disputedCents = Math.min(purchase.amountCents, relevantDisputes.reduce((total, dispute) => total + (dispute as Stripe.Dispute).amount, 0));
  const paid = paymentIntent.status === 'succeeded';
  return {
    purchaseId: purchase.purchaseId,
    paymentId,
    amountCents: purchase.amountCents,
    currency: 'usd',
    livemode: purchase.livemode,
    paid,
    refundedCents,
    disputedCents,
    disputeOpen: relevantDisputes.some((dispute) => ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes((dispute as Stripe.Dispute).status)),
  };
}
