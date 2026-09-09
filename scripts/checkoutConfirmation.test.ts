import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import {
  CheckoutReceiptError,
  checkoutReturnUrls,
  confirmCheckoutReceipt,
  requireCheckoutEnvironmentMode,
  requireCheckoutSessionId,
  type CheckoutReceiptLedger,
} from '../packages/billing/checkoutConfirmation.js';

const sessionId = 'cs_test_abcdefgh12345678';

function ledger(overrides: Partial<CheckoutReceiptLedger['purchase']> = {}, payment: CheckoutReceiptLedger['payment'] = null): CheckoutReceiptLedger {
  return {
    purchase: {
      purchaseId: 'purchase_1', agentId: 'agent_1', amountCents: 500, currency: 'usd', livemode: false,
      paymentRail: 'checkout', status: 'pending', expiresAt: Date.now() + 60_000, checkoutSessionId: sessionId,
      ...overrides,
    },
    payment,
  };
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: sessionId, mode: 'payment', client_reference_id: 'purchase_1', amount_total: 500, currency: 'usd', livemode: false,
    status: 'open', payment_status: 'unpaid', payment_intent: null,
    metadata: { agartha_purchase_id: 'purchase_1', agartha_agent_id: 'agent_1' },
    ...overrides,
  } as Stripe.Checkout.Session;
}

function paidLedger(overrides: Partial<NonNullable<CheckoutReceiptLedger['payment']>> = {}): CheckoutReceiptLedger {
  return ledger({ paymentId: 'pi_1', status: 'paid' }, {
    paymentId: 'pi_1', purchaseId: 'purchase_1', amountCents: 500, livemode: false,
    wasPaid: true, creditedCents: 500, reversedCents: 0, openDispute: false, ...overrides,
  });
}

describe('Checkout confirmation receipts', () => {
  it('requires a strict test/live Checkout capability', () => {
    expect(requireCheckoutSessionId(sessionId)).toBe(sessionId);
    expect(requireCheckoutSessionId('cs_live_ABCDEFGH12345678')).toBe('cs_live_ABCDEFGH12345678');
    for (const value of [undefined, ['x'], 'cs_1', 'cs_test_bad/slash', `cs_test_${'a'.repeat(201)}`]) {
      expect(() => requireCheckoutSessionId(value)).toThrow(CheckoutReceiptError);
    }
  });

  it('uses deterministic return URLs and preserves the literal Stripe placeholder', () => {
    expect(checkoutReturnUrls('https://agartha.example')).toEqual({
      successUrl: 'https://agartha.example/payments/return/?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://agartha.example/payments/return/?canceled=1',
    });
    expect(checkoutReturnUrls('https://agartha.example', 'cs_test_id+value').confirmationUrl)
      .toBe('https://agartha.example/payments/return/?session_id=cs_test_id%2Bvalue');
  });

  it('projects pending, received, credited, adjusted, not-completed, expired, and test/live states', () => {
    expect(confirmCheckoutReceipt(session(), ledger())).toEqual({ state: 'not_completed', amountCents: 500, currency: 'usd', livemode: false });
    const completed = session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
    expect(confirmCheckoutReceipt(completed, ledger())).toEqual({ state: 'payment_received', amountCents: 500, currency: 'usd', livemode: false });
    expect(confirmCheckoutReceipt(completed, paidLedger())).toEqual({ state: 'credited', amountCents: 500, currency: 'usd', livemode: false, creditedCents: 500 });
    expect(confirmCheckoutReceipt(completed, paidLedger({ creditedCents: 250, reversedCents: 250 }))).toMatchObject({ state: 'adjusted', creditedCents: 250 });
    const fullyReversed = paidLedger({ creditedCents: 0, reversedCents: 500 });
    fullyReversed.purchase.status = 'reversed';
    expect(confirmCheckoutReceipt(completed, fullyReversed)).toMatchObject({ state: 'adjusted', creditedCents: 0 });
    expect(confirmCheckoutReceipt(completed, paidLedger({ creditedCents: 500, openDispute: true }))).toMatchObject({ state: 'adjusted', creditedCents: 500 });
    expect(confirmCheckoutReceipt(session({ status: 'complete' }), ledger())).toMatchObject({ state: 'pending' });
    expect(confirmCheckoutReceipt(session({ status: 'expired' }), ledger())).toMatchObject({ state: 'expired' });
    const liveSession = session({ id: 'cs_live_abcdefgh12345678', livemode: true });
    expect(confirmCheckoutReceipt(liveSession, ledger({ checkoutSessionId: liveSession.id, livemode: true }))).toMatchObject({ state: 'not_completed', livemode: true });
  });

  it('rejects a Checkout session retrieved with the wrong Stripe environment', () => {
    expect(() => requireCheckoutEnvironmentMode(session(), false)).not.toThrow();
    expect(() => requireCheckoutEnvironmentMode(session({ livemode: true }), false)).toThrow(CheckoutReceiptError);
    expect(() => requireCheckoutEnvironmentMode(session(), true)).toThrow(CheckoutReceiptError);
  });

  it.each([
    ['session binding', session({ id: 'cs_test_different12345678' }), ledger()],
    ['rail', session(), ledger({ paymentRail: 'mpp' })],
    ['mode', session({ mode: 'setup' }), ledger()],
    ['purchase identity', session({ client_reference_id: 'other' }), ledger()],
    ['metadata', session({ metadata: { agartha_purchase_id: 'purchase_1', agartha_agent_id: 'other' } }), ledger()],
    ['amount', session({ amount_total: 2_000 }), ledger()],
    ['currency', session({ currency: 'eur' }), ledger()],
    ['livemode', session({ livemode: true }), ledger()],
    ['payment binding', session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_other' }), paidLedger()],
  ])('fails closed on a %s mismatch', (_name, checkout, receipt) => {
    expect(() => confirmCheckoutReceipt(checkout, receipt)).toThrow(CheckoutReceiptError);
  });

  it('fails closed when a bound payment row is absent or internally inconsistent', () => {
    const completed = session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
    expect(() => confirmCheckoutReceipt(completed, ledger({ paymentId: 'pi_1' }))).toThrow(CheckoutReceiptError);
    expect(() => confirmCheckoutReceipt(completed, paidLedger({ purchaseId: 'other' }))).toThrow(CheckoutReceiptError);
    expect(() => confirmCheckoutReceipt(completed, paidLedger({ creditedCents: 400, reversedCents: 200 }))).toThrow(CheckoutReceiptError);
  });

  it('fails closed on expired payment contradictions and inconsistent purchase status', () => {
    expect(() => confirmCheckoutReceipt(session({ status: 'expired', payment_status: 'paid', payment_intent: 'pi_1' }), ledger())).toThrow(CheckoutReceiptError);
    expect(() => confirmCheckoutReceipt(session({ status: 'expired' }), paidLedger())).toThrow(CheckoutReceiptError);
    const completed = session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
    expect(() => confirmCheckoutReceipt(completed, paidLedger({}))).not.toThrow();
    expect(() => confirmCheckoutReceipt(completed, { ...paidLedger({}), purchase: { ...paidLedger({}).purchase, status: 'pending' } })).toThrow(CheckoutReceiptError);
    expect(() => confirmCheckoutReceipt(completed, { ...paidLedger({}), purchase: { ...paidLedger({}).purchase, status: 'failed' } })).toThrow(CheckoutReceiptError);
  });

  it('tracks an unpaid observation through Stripe success and ledger crediting', () => {
    const unpaid = paidLedger({ wasPaid: false, creditedCents: 0, reversedCents: 0, openDispute: false });
    unpaid.purchase.status = 'failed';
    const asyncPending = session({ status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_1' });
    expect(confirmCheckoutReceipt(asyncPending, unpaid)).toMatchObject({ state: 'pending' });
    expect(confirmCheckoutReceipt(session({ status: 'open', payment_status: 'unpaid', payment_intent: 'pi_1' }), unpaid)).toMatchObject({ state: 'not_completed' });
    expect(confirmCheckoutReceipt(session({ status: 'expired', payment_status: 'unpaid', payment_intent: 'pi_1' }), unpaid)).toMatchObject({ state: 'expired' });
    const stripeSucceeded = session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' });
    expect(confirmCheckoutReceipt(stripeSucceeded, unpaid)).toEqual({ state: 'payment_received', amountCents: 500, currency: 'usd', livemode: false });
    expect(confirmCheckoutReceipt(stripeSucceeded, paidLedger())).toMatchObject({ state: 'credited', creditedCents: 500 });
  });

  it('rejects contradictory unpaid ledger observations', () => {
    const checkout = session({ status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_1' });
    for (const payment of [
      paidLedger({ wasPaid: true }),
      paidLedger({ wasPaid: false, creditedCents: 1, reversedCents: 0 }),
      paidLedger({ wasPaid: false, creditedCents: 0, reversedCents: 0, openDispute: true }),
    ]) {
      payment.purchase.status = 'failed';
      expect(() => confirmCheckoutReceipt(checkout, payment)).toThrow(CheckoutReceiptError);
    }
    expect(() => confirmCheckoutReceipt(checkout, ledger({ status: 'failed' }))).toThrow(CheckoutReceiptError);
  });

  it('returns only the public receipt projection', () => {
    const result = confirmCheckoutReceipt(session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' }), paidLedger());
    expect(Object.keys(result).sort()).toEqual(['amountCents', 'creditedCents', 'currency', 'livemode', 'state']);
    expect(JSON.stringify(result)).not.toMatch(/agent|purchase|payment|balance|email/i);
  });
});
