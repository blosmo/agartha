import Stripe from 'stripe';
import { Mppx, stripe as stripeMethods } from 'mppx/server';
import { verifyCreditPayment, type BillingPurchase, type PaymentObservation } from './stripe.js';

type MppStripeClient = {
  rawRequest?: (...args: never[]) => Promise<unknown>;
  paymentIntents: {
    create: (...args: never[]) => Promise<{
      id: string;
      status: string;
      lastResponse?: { headers?: Record<string, string> };
    }>;
  };
};

export type MppBillingConfig = {
  stripeClient: Stripe;
  profileId: string;
  signingSecret: string;
  livemode: boolean;
};

function fixedIdempotencyClient(stripe: Stripe, purchaseId: string): MppStripeClient {
  const client = new Proxy(stripe, {
    get(target, property, receiver) {
      if (property !== 'paymentIntents') return Reflect.get(target, property, receiver);
      return new Proxy(target.paymentIntents, {
        get(paymentIntents, method, methodReceiver) {
          if (method !== 'create') return Reflect.get(paymentIntents, method, methodReceiver);
          return (params: Stripe.PaymentIntentCreateParams, options?: Stripe.RequestOptions) => paymentIntents.create(params, {
            ...options,
            idempotencyKey: `agartha_mpp_${purchaseId}`,
          });
        },
      });
    },
  });
  return client as unknown as MppStripeClient;
}

export async function handleCreditMpp(
  request: Request,
  purchase: BillingPurchase,
  config: MppBillingConfig,
  onPaid: (observation: PaymentObservation) => Promise<unknown>,
): Promise<Response> {
  if (purchase.paymentRail !== 'mpp') throw new Error('purchase rail must be mpp');
  if (purchase.amountCents !== 500 && purchase.amountCents !== 2000) throw new Error('purchase amount must be $5 or $20');
  if (purchase.currency !== 'usd' || purchase.livemode !== config.livemode) throw new Error('purchase mode or currency does not match MPP configuration');
  if (!config.profileId || config.signingSecret.length < 32) throw new Error('MPP profile and signing secret are required');
  if (purchase.status === 'pending' && (!Number.isFinite(purchase.expiresAt) || purchase.expiresAt <= Date.now())) return Response.json({ error: 'purchase has expired' }, { status: 409 });
  if (purchase.status === 'paid') return Response.json({ error: 'purchase already funded' }, { status: 409 });
  if (purchase.status !== 'pending') return Response.json({ error: `purchase cannot be funded from status ${purchase.status}` }, { status: 409 });

  let receiptReference: string | undefined;
  const chargeMethod = stripeMethods.spt({
    client: fixedIdempotencyClient(config.stripeClient, purchase.purchaseId),
    networkId: config.profileId,
    livemode: config.livemode,
    onPaymentSuccess: async ({ receipt }) => { receiptReference = receipt.reference; },
  });
  const mppx = Mppx.create({
    methods: [chargeMethod],
    realm: new URL(request.url).hostname,
    secretKey: config.signingSecret,
  });
  const handler = mppx.stripe.charge({
    amount: (purchase.amountCents / 100).toFixed(2),
    currency: 'usd',
    decimals: 2,
    networkId: config.profileId,
    externalId: purchase.purchaseId,
    metadata: {
      agartha_purchase_id: purchase.purchaseId,
      agartha_agent_id: purchase.agentId,
    },
    paymentMethodTypes: ['card'],
    expires: new Date(purchase.expiresAt),
    scope: `agartha:blender:${purchase.purchaseId}:${purchase.livemode ? 'live' : 'test'}:${purchase.amountCents}`,
    meta: {
      agartha_purchase_id: purchase.purchaseId,
      agartha_agent_id: purchase.agentId,
    },
  });
  const result = await handler(request);
  if (result.status === 402) {
    if (result.challenge.status === 401) {
      const headers = new Headers(request.headers);
      headers.delete('Authorization');
      const retry = await handler(new Request(request.url, { method: request.method, headers }));
      if (retry.status !== 402) throw new Error('Expected a fresh MPP payment challenge');
      return retry.challenge;
    }
    return result.challenge;
  }
  if (!receiptReference) throw new Error('MPP payment completed without a Stripe receipt reference');
  const observation = await verifyCreditPayment(config.stripeClient, purchase, receiptReference);
  if (!observation.paid) throw new Error('MPP receipt is not backed by a succeeded Stripe payment');
  await onPaid(observation);

  return result.withReceipt(new Response(JSON.stringify({ purchaseId: purchase.purchaseId }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}
