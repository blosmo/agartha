import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { checkoutPaymentUrl, checkoutRedirectDestination, type CheckoutReceiptLedger } from '../packages/billing/checkoutConfirmation.js';

const id = 'cs_test_abcdefgh12345678';
const base = 'https://3d.example';
const stripeUrl = `https://checkout.stripe.com/c/pay/${id}#fidkdWxOYHwnPyd%2Bfragment%2Fpreserve`;
const receipt = (): CheckoutReceiptLedger => ({ purchase: {
  purchaseId: 'purchase_1', agentId: 'agent_1', amountCents: 500, currency: 'usd', livemode: false,
  paymentRail: 'checkout', status: 'pending', expiresAt: Date.now() + 60_000, checkoutSessionId: id,
}, payment: null });
const session = (overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session => ({
  id, mode: 'payment', client_reference_id: 'purchase_1', amount_total: 500, currency: 'usd', livemode: false,
  status: 'open', payment_status: 'unpaid', payment_intent: null, url: stripeUrl,
  metadata: { agartha_purchase_id: 'purchase_1', agartha_agent_id: 'agent_1' }, ...overrides,
} as Stripe.Checkout.Session);

describe('short Checkout handoff', () => {
  it('builds a first-party link without carrying a fragile fragment', () => {
    expect(checkoutPaymentUrl(base, id)).toBe(`${base}/api/blender/checkout-redirect?session_id=${id}`);
    expect(()=>checkoutPaymentUrl(base, 'cs_bad')).toThrow();
  });
  it('redirects an existing open checkout to the exact Stripe URL including its fragment', () => {
    expect(checkoutRedirectDestination(session(), receipt(), base)).toBe(stripeUrl);
  });
  it.each([
    null, 'https://evil.example/pay', `http://checkout.stripe.com/c/pay/${id}#x`,
    `https://checkout.stripe.com.evil.example/c/pay/${id}#x`, `https://user@checkout.stripe.com/c/pay/${id}#x`,
    `https://checkout.stripe.com:444/c/pay/${id}#x`, 'https://checkout.stripe.com/c/pay/cs_test_different1234#x',
    `${stripeUrl}\r\nInjected: yes`,
  ])('rejects an absent, foreign, mismatched, or unsafe redirect %s', url => {
    expect(()=>checkoutRedirectDestination(session({url}), receipt(), base)).toThrow();
  });
  it('verifies ledger ownership and amount before redirecting', () => {
    expect(()=>checkoutRedirectDestination(session({amount_total:2000}), receipt(), base)).toThrow();
    expect(()=>checkoutRedirectDestination(session({metadata:{agartha_purchase_id:'other',agartha_agent_id:'agent_1'}}),receipt(),base)).toThrow();
    const mismatched=receipt();mismatched.purchase.checkoutSessionId='cs_test_other12345678';
    expect(()=>checkoutRedirectDestination(session(),mismatched,base)).toThrow();
  });
  it.each(['complete','expired'] as const)('sends %s sessions to confirmation instead of another payment', status => {
    expect(checkoutRedirectDestination(session({status,url:null}),receipt(),base)).toBe(`${base}/payments/return/?session_id=${id}`);
  });
  it('does not reopen an expired purchase even if Stripe still reports an open session', () => {
    const old=receipt();old.purchase.expiresAt=Date.now()-1;
    expect(checkoutRedirectDestination(session(),old,base)).toBe(`${base}/payments/return/?session_id=${id}`);
  });
  it('sends successful payments awaiting ledger credit to confirmation', () => {
    expect(checkoutRedirectDestination(session({status:'complete',payment_status:'paid',payment_intent:'pi_1',url:null}),receipt(),base)).toBe(`${base}/payments/return/?session_id=${id}`);
  });
});
