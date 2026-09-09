import type Stripe from 'stripe';
import type { BillingPurchase } from './stripe.js';

export type CheckoutReceiptState = 'pending' | 'payment_received' | 'credited' | 'adjusted' | 'not_completed' | 'expired';

export type CheckoutReceipt = {
  state: CheckoutReceiptState;
  amountCents: number;
  currency: 'usd';
  livemode: boolean;
  creditedCents?: number;
};

export type CheckoutReceiptLedger = {
  purchase: BillingPurchase & { paymentId?: string };
  payment: null | {
    paymentId: string;
    purchaseId: string;
    amountCents: number;
    livemode: boolean;
    wasPaid: boolean;
    creditedCents: number;
    reversedCents: number;
    openDispute: boolean;
  };
};

export class CheckoutReceiptError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 503) { super('Checkout receipt unavailable.'); }
}

export function checkoutReturnUrls(base: string, checkoutSessionId?: string) {
  return {
    successUrl: `${base}/payments/return/?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/payments/return/?canceled=1`,
    ...(checkoutSessionId === undefined ? {} : { confirmationUrl: `${base}/payments/return/?session_id=${encodeURIComponent(checkoutSessionId)}` }),
  };
}

export function requireCheckoutSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]{8,200}$/.test(value)) throw new CheckoutReceiptError(400);
  return value;
}

export function requireCheckoutEnvironmentMode(session: Stripe.Checkout.Session, livemode: boolean): void {
  if (session.livemode !== livemode) throw new CheckoutReceiptError(409);
}

function paymentIntentId(value: Stripe.Checkout.Session['payment_intent']): string | null {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function baseReceipt(purchase: BillingPurchase): Omit<CheckoutReceipt, 'state'> {
  return { amountCents: purchase.amountCents, currency: 'usd', livemode: purchase.livemode };
}

export function confirmCheckoutReceipt(session: Stripe.Checkout.Session, ledger: CheckoutReceiptLedger): CheckoutReceipt {
  const { purchase, payment } = ledger;
  const metadata = session.metadata ?? {};
  if (
    session.id !== purchase.checkoutSessionId
    || purchase.paymentRail !== 'checkout'
    || session.mode !== 'payment'
    || session.client_reference_id !== purchase.purchaseId
    || metadata.agartha_purchase_id !== purchase.purchaseId
    || metadata.agartha_agent_id !== purchase.agentId
    || session.amount_total !== purchase.amountCents
    || session.currency !== 'usd'
    || purchase.currency !== 'usd'
    || session.livemode !== purchase.livemode
  ) throw new CheckoutReceiptError(409);

  const paymentId = paymentIntentId(session.payment_intent);
  if (purchase.paymentId && purchase.paymentId !== paymentId) throw new CheckoutReceiptError(409);
  if (purchase.paymentId && !payment) throw new CheckoutReceiptError(409);
  if (payment && (
    !purchase.paymentId
    || payment.paymentId !== purchase.paymentId
    || payment.paymentId !== paymentId
    || payment.purchaseId !== purchase.purchaseId
    || payment.amountCents !== purchase.amountCents
    || payment.livemode !== purchase.livemode
    || !Number.isSafeInteger(payment.creditedCents)
    || !Number.isSafeInteger(payment.reversedCents)
    || payment.creditedCents < 0
    || payment.reversedCents < 0
    || payment.creditedCents + payment.reversedCents > payment.amountCents
  )) throw new CheckoutReceiptError(409);

  const base = baseReceipt(purchase);
  const consistentUnpaidPayment = !!payment
    && !payment.wasPaid
    && payment.creditedCents === 0
    && payment.reversedCents === 0
    && !payment.openDispute
    && purchase.status === 'failed';
  if (session.status === 'expired') {
    if (session.payment_status === 'paid'
      || (payment && !consistentUnpaidPayment)
      || (!payment && purchase.paymentId)
      || (!payment && !['pending', 'expired'].includes(purchase.status))
      || ['paid', 'reversed'].includes(purchase.status)) throw new CheckoutReceiptError(409);
    return { state: 'expired', ...base };
  }
  if (session.payment_status !== 'paid') {
    if ((payment && !consistentUnpaidPayment)
      || (!payment && purchase.paymentId)
      || (!payment && purchase.status !== 'pending')
      || ['paid', 'reversed'].includes(purchase.status)) throw new CheckoutReceiptError(409);
    return { state: session.status === 'complete' ? 'pending' : 'not_completed', ...base };
  }
  if (session.status !== 'complete' || !paymentId) throw new CheckoutReceiptError(409);
  if (!payment) {
    if (purchase.status !== 'pending') throw new CheckoutReceiptError(409);
    return { state: 'payment_received', ...base };
  }
  if (consistentUnpaidPayment) return { state: 'payment_received', ...base };
  if (!payment.wasPaid) throw new CheckoutReceiptError(409);
  if (!['paid', 'reversed'].includes(purchase.status)) throw new CheckoutReceiptError(409);
  const fullyCredited = payment.creditedCents === payment.amountCents
    && payment.reversedCents === 0
    && !payment.openDispute;
  if ((fullyCredited && purchase.status !== 'paid')
    || (!fullyCredited && purchase.status === 'reversed' && payment.creditedCents !== 0)
    || (!fullyCredited && purchase.status === 'paid' && payment.creditedCents === 0 && payment.reversedCents === payment.amountCents)) throw new CheckoutReceiptError(409);
  return {
    state: fullyCredited ? 'credited' : 'adjusted',
    ...base,
    creditedCents: payment.creditedCents,
  };
}
