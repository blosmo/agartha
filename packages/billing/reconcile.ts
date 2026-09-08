import Stripe from 'stripe';
import { verifyCreditPayment, type BillingPurchase, type PaymentObservation } from './stripe.js';

export type FulfillPurchaseInput = PaymentObservation & { generation: number };

export type PaymentReconciliationLedger = {
  getPurchaseForPayment?: (purchaseId: string) => Promise<BillingPurchase | null>;
  getPurchaseById?: (purchaseId: string) => Promise<BillingPurchase | null>;
  beginPaymentReconciliation: (input: { paymentId: string; eventId: string }) => Promise<{ generation: number }>;
  fulfillPurchase: (input: FulfillPurchaseInput) => Promise<unknown>;
};

export type ReconcileStripeWebhookOptions = {
  stripe: Stripe;
  ledger: PaymentReconciliationLedger;
  verifyPayment?: (stripe: Stripe, purchase: BillingPurchase, paymentId: string) => Promise<PaymentObservation>;
  idFactory?: () => string;
  maxAttempts?: number;
};

export type ReconciliationResult =
  | { status: 'ignored'; reason: 'unrelated_payment' | 'no_payment_intent' }
  | { status: 'fulfilled'; paymentId: string; purchaseId: string; generation: number };

type StripeObject = Record<string, unknown>;

function asObject(value: unknown): StripeObject {
  return value !== null && typeof value === 'object' ? value as StripeObject : {};
}

function objectId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  const id = asObject(value).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function paymentIntentId(value: unknown): string | undefined {
  return objectId(value);
}

async function resolvePaymentIntentId(stripe: Stripe, event: Stripe.Event): Promise<string | undefined> {
  const object = asObject(event.data.object);
  if (event.type.startsWith('payment_intent.')) return objectId(object.id);

  const direct = paymentIntentId(object.payment_intent);
  if (direct) return direct;

  const chargeId = objectId(object.charge) ?? (event.type.startsWith('charge.') ? objectId(object.id) : undefined);
  if (!chargeId) return undefined;
  const charge = await stripe.charges.retrieve(chargeId);
  return paymentIntentId(charge.payment_intent);
}

function isStaleGeneration(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'stale_generation') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /stale.+generation|generation.+stale/i.test(message);
}

function assertObservationBinding(observation: PaymentObservation, purchase: BillingPurchase, paymentId: string): void {
  if (observation.purchaseId !== purchase.purchaseId || observation.paymentId !== paymentId) throw new Error('Payment observation is bound to a different purchase or payment.');
  if (observation.amountCents !== purchase.amountCents || observation.currency !== purchase.currency || observation.livemode !== purchase.livemode) throw new Error('Payment observation does not match purchase.');
}

async function reconcilePaymentId(options: ReconcileStripeWebhookOptions, paymentId: string): Promise<ReconciliationResult> {
  if (!paymentId) return { status: 'ignored', reason: 'no_payment_intent' };

  const verifyPayment = options.verifyPayment ?? verifyCreditPayment;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const maxAttempts = options.maxAttempts ?? 2;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('maxAttempts must be between 1 and 3');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // The initial fetch is deliberately only a lookup hint. Canonical state is fetched after the generation fence.
    const paymentIntent = await options.stripe.paymentIntents.retrieve(paymentId);
    const purchaseId = paymentIntent.metadata?.agartha_purchase_id;
    if (!purchaseId) return { status: 'ignored', reason: 'unrelated_payment' };
    const getPurchase = options.ledger.getPurchaseForPayment ?? options.ledger.getPurchaseById;
    if (!getPurchase) throw new Error('Payment reconciliation ledger is missing getPurchaseForPayment.');
    const purchase = await getPurchase(purchaseId);
    if (!purchase) throw new Error(`Bound Stripe payment references missing purchase ${purchaseId}.`);

    const { generation } = await options.ledger.beginPaymentReconciliation({ paymentId, eventId: idFactory() });
    const observation = await verifyPayment(options.stripe, purchase, paymentId);
    assertObservationBinding(observation, purchase, paymentId);
    try {
      await options.ledger.fulfillPurchase({ ...observation, generation });
      return { status: 'fulfilled', paymentId, purchaseId, generation };
    } catch (error) {
      if (!isStaleGeneration(error) || attempt + 1 >= maxAttempts) throw error;
    }
  }
  throw new Error('Payment reconciliation exhausted its bounded retry attempts.');
}

export async function reconcileCreditPayment(
  stripe: Stripe,
  ledger: PaymentReconciliationLedger,
  paymentId: string,
  options: Pick<ReconcileStripeWebhookOptions, 'verifyPayment' | 'idFactory' | 'maxAttempts'> = {},
): Promise<ReconciliationResult> {
  return reconcilePaymentId({ stripe, ledger, ...options }, paymentId);
}

export async function reconcileStripeWebhook(
  stripe: Stripe,
  ledger: PaymentReconciliationLedger,
  event: Stripe.Event,
): Promise<ReconciliationResult>;
export async function reconcileStripeWebhook(
  options: ReconcileStripeWebhookOptions,
  event: Stripe.Event,
): Promise<ReconciliationResult>;
export async function reconcileStripeWebhook(
  stripeOrOptions: Stripe | ReconcileStripeWebhookOptions,
  ledgerOrEvent: PaymentReconciliationLedger | Stripe.Event,
  maybeEvent?: Stripe.Event,
): Promise<ReconciliationResult> {
  const directCall = maybeEvent !== undefined;
  const options: ReconcileStripeWebhookOptions = directCall
    ? { stripe: stripeOrOptions as Stripe, ledger: ledgerOrEvent as PaymentReconciliationLedger }
    : stripeOrOptions as ReconcileStripeWebhookOptions;
  const event = (directCall ? maybeEvent : ledgerOrEvent) as Stripe.Event;
  const paymentId = await resolvePaymentIntentId(options.stripe, event);
  if (!paymentId) return { status: 'ignored', reason: 'no_payment_intent' };
  return reconcilePaymentId(options, paymentId);
}

export const reconcileStripeEvent = reconcileStripeWebhook;
