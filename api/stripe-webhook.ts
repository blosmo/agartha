import { BILLING_WEBHOOK_EVENTS, parseStripeWebhook } from '../packages/billing/stripe.js';
import { reconcileStripeWebhook } from '../packages/billing/reconcile.js';
import { paymentEnvironment, reconciliationLedger } from '../packages/billing/http.js';
import { BillingHttpError } from '../packages/billing/ledgerClient.js';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Web-standard requests preserve signed bytes. Vercel's legacy request.body
// helper parses JSON even when Next.js-specific bodyParser configuration exists.
async function webhook(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const { stripe, livemode, ledger } = paymentEnvironment();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return json({ error: 'Webhook is not configured.' }, 503);
    const signature = request.headers.get('stripe-signature');
    if (!signature) return json({ error: 'Signature required.' }, 400);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Request body required.' }, 400);
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
      chunks.push(value);
    }
    let event;
    try { event = parseStripeWebhook(stripe, Buffer.concat(chunks), signature, secret); }
    catch { return json({ error: 'Invalid webhook signature.' }, 400); }
    if (event.livemode !== livemode) return json({ error: 'Webhook payment mode does not match.' }, 400);
    if (!(BILLING_WEBHOOK_EVENTS as readonly string[]).includes(event.type)) return json({ received: true, ignored: true });
    await reconcileStripeWebhook(stripe, reconciliationLedger(ledger), event);
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof BillingHttpError ? error.message : 'Webhook reconciliation could not complete.' }, error instanceof BillingHttpError ? error.status : 503);
  }
}

export default { fetch: webhook };
