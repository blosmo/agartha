import { managedJobs } from '../packages/modeling/jobs.js';
import { managedEnabled, managedInference, referencesEnabled } from '../packages/modeling/http.js';
import type { ServerResponse } from 'node:http';
import { BLENDER_BILLING } from '../packages/protocol/src/blenderBilling.js';
import { createCreditCheckoutWithLegacyRecovery, type BillingPurchase } from '../packages/billing/stripe.js';
import { handleCreditMpp } from '../packages/billing/mpp.js';
import { reconcileCreditPayment } from '../packages/billing/reconcile.js';
import { BillingHttpError } from '../packages/billing/ledgerClient.js';
import { jsonBody, jsonResponse, paymentEnvironment, reconciliationLedger, sendBillingError, type BillingRequest } from '../packages/billing/http.js';
import { CheckoutReceiptError, checkoutReturnUrls, checkoutPaymentUrl, checkoutRedirectDestination, confirmCheckoutReceipt, requireCheckoutEnvironmentMode, requireCheckoutSessionId, type CheckoutReceiptLedger } from '../packages/billing/checkoutConfirmation.js';

function publicBase() {
  const value = process.env.AGARTHA_PUBLIC_URL;
  if (!value) throw new BillingHttpError(503, 'Configure AGARTHA_PUBLIC_URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new BillingHttpError(503, 'Public billing URL must use HTTPS.');
  return url.origin;
}

function sessionLinks(reservationId: string) {
  const value = process.env.AGARTHA_BLENDER_BROKER_URL;
  if (!value) throw new BillingHttpError(503, 'The Blender compute broker is not configured.');
  const base = new URL(value);
  if (base.protocol !== 'https:' || base.username || base.password) throw new BillingHttpError(503, 'The Blender compute broker URL must use HTTPS.');
  const id = encodeURIComponent(reservationId);
  return { statusUrl: new URL(`/sessions/${id}`, base).href, startUrl: new URL(`/sessions/${id}/start`, base).href, stopUrl: new URL(`/sessions/${id}/stop`, base).href, toolsUrl: new URL(`/sessions/${id}/tools`, base).href, artifactsUrl: new URL(`/sessions/${id}/artifacts/`, base).href, mcpUrl: new URL(`/mcp/${id}`, base).href };
}

function purchaseResponse(purchase: BillingPurchase) {
  const statusUrl = `/api/blender/purchases/${encodeURIComponent(purchase.purchaseId)}`;
  const canPay = purchase.status === 'pending' && purchase.expiresAt > Date.now()
    && process.env.AGARTHA_BLENDER_BILLING_ENABLED === 'true';
  return { ...purchase, statusUrl, balanceUrl: '/api/blender/balance',
    nextAction: canPay ? {
      method: 'POST', url: `${statusUrl}/${purchase.paymentRail}`,
      agentTokenHeader: purchase.paymentRail === 'mpp' ? 'X-Agartha-Agent-Token' : 'Authorization',
      agentTokenScheme: purchase.paymentRail === 'mpp' ? null : 'Bearer',
      instruction: purchase.paymentRail === 'mpp'
        ? 'Expect HTTP 402. Let your authorized MPP payer answer WWW-Authenticate using Authorization: Payment, keeping X-Agartha-Agent-Token. Retry this same URL; do not create another purchase.'
        : 'Share the returned paymentUrl with your user. It preserves the full Stripe checkout URL. Retry this same API URL to recover the same Checkout session; never construct a Stripe URL from its ID. Confirm funding with statusUrl before using credits.',
    } : null,
  };
}

export default async function handler(req: BillingRequest, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agartha-Agent-Token');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Payment-Receipt');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const rawPath = req.query?.path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath ?? '';
  if ((!path || path === 'capabilities') && req.method === 'GET') {
    const header = req.headers.authorization;
    const discoveryToken = typeof header === 'string' && /^Bearer [a-f0-9]{64}$/.test(header) ? header.slice(7) : undefined;
    jsonResponse(res, {
      name: 'Agartha Compute', version: '1.0.0',
      description: 'Give your agent access to Astra for managed 3D modeling with a total budget, or use Direct Blender. No Agartha world or room required.',
      documentation: '/compute/skill.md', openapi: '/compute/openapi.json',
      modelingGuide: '/compute/modeling.md', toolkitGuide: '/agents/blender-quality.md', toolkit: '/agents/blender-toolkit.py',
      registration: '/api/session', pricing: '/api/blender/pricing', balance: '/api/blender/balance',
      purchases: '/api/blender/purchases', quotes: '/api/blender/quotes', sessions: '/api/blender/sessions',
      managed: { enabled: managedEnabled(discoveryToken, req), model: 'openai/gpt-6-astra', minimumBudgetCents: 100, maximumBudgetCents: 2000, references: { enabled: referencesEnabled(discoveryToken), model: 'openai/gpt-image-2.5-flare', minimumBudgetCents: 500 }, components:{library:'/api/assets',guide:'/agents/components.md',publicationOption:'shareComponents',publicationDefault:false,licenseRequired:true}, materials:{library:'/api/materials/library',guide:'/agents/material-authoring.md',publicationOption:'shareMaterials',publicationDefault:false}, jobs: '/api/blender/jobs' },
      interfaces: ['http', 'mcp'], artifactFormats: ['glb', 'blend', 'png', 'mp4'],
      authentication: 'Bearer agent token; the same stable identity owns Agartha and Compute credits.',
      availability: 'Read pricing for purchase status. Quotes check compute activation and account eligibility. Discovery does not guarantee capacity.',
    });
    return;
  }
  if (path === 'pricing' && req.method === 'GET') {
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    jsonResponse(res, { ...BLENDER_BILLING, purchasesEnabled: process.env.AGARTHA_BLENDER_BILLING_ENABLED === 'true', paymentMode: /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : 'unconfigured' });
    return;
  }
  if ((path === 'checkout-status' || path === 'checkout-redirect') && req.method === 'GET') {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const checkoutSessionId = requireCheckoutSessionId(req.query?.session_id);
      const { stripe, livemode, ledger } = paymentEnvironment();
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      requireCheckoutEnvironmentMode(session, livemode);
      const purchaseId = session.metadata?.agartha_purchase_id;
      if (typeof purchaseId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(purchaseId)) throw new CheckoutReceiptError(409);
      const receipt = await ledger<CheckoutReceiptLedger>('getCheckoutReceipt', { purchaseId, checkoutSessionId });
      if (path === 'checkout-redirect') {
        const destination = checkoutRedirectDestination(session, receipt, publicBase());
        if (new URL(destination).hostname === 'checkout.stripe.com' && process.env.AGARTHA_BLENDER_BILLING_ENABLED !== 'true') throw new CheckoutReceiptError(503);
        res.statusCode = 303;
        res.setHeader('Location', destination);
        res.end();
        return;
      }
      jsonResponse(res, confirmCheckoutReceipt(session, receipt));
    } catch (error) {
      const status = error instanceof CheckoutReceiptError ? error.status : 503;
      jsonResponse(res, { error: 'Checkout receipt unavailable.' }, status);
    }
    return;
  }
  try {
    if (path === 'inference') { await managedInference(req, res); return; }
    if (!['GET', 'POST'].includes(req.method ?? '')) throw new BillingHttpError(405, 'Use GET or POST.');
    const match = /^purchases\/([a-zA-Z0-9_-]{1,128})(?:\/(checkout|mpp|reconcile))?$/.exec(path);
    const sessionMatch = /^sessions\/([a-zA-Z0-9_-]{1,128})$/.exec(path);
    if (!['balance', 'purchases', 'quotes', 'sessions', 'jobs'].includes(path) && !path.startsWith('jobs/') && !match && !sessionMatch) throw new BillingHttpError(404, 'Billing route not found.');
    const mpp = match?.[2] === 'mpp';
    const authorization = req.headers.authorization;
    const token = mpp ? req.headers['x-agartha-agent-token'] : authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BillingHttpError(401, mpp ? 'Use X-Agartha-Agent-Token for agent authentication and Authorization for MPP payment.' : 'Use your agent Bearer token.');
    const { stripe, livemode, ledger } = paymentEnvironment();
    if (path === 'jobs' || path.startsWith('jobs/')) { await managedJobs(req, res, path, token, ledger, livemode); return; }
    if (path === 'quotes' && req.method === 'POST') {
      const body = await jsonBody(req);
      jsonResponse(res, await ledger('createQuote', { token, quoteId: body.quoteId, requestId: body.requestId, minutes: body.minutes, livemode, ...(body.projectId === undefined ? {} : { projectId: body.projectId }) }), 201);
      return;
    }
    if (path === 'sessions' && req.method === 'POST') {
      const body = await jsonBody(req);
      if (typeof body.reservationId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.reservationId)) throw new BillingHttpError(400, 'Provide a valid reservation ID.');
      const links = sessionLinks(body.reservationId);
      const row = await ledger<Record<string, unknown>>('reserveSession', { token, quoteId: body.quoteId, reservationId: body.reservationId, requestId: body.requestId });
      jsonResponse(res, { reservationId: row.reservationId, projectId: row.projectId, status: row.status, reservedCents: row.reservedCents, reservedMinutes: row.reservedMinutes, ...links }, 201);
      return;
    }
    if (sessionMatch && req.method === 'GET') {
      const row = await ledger<Record<string, unknown>>('getReservation', { token, reservationId: sessionMatch[1] });
      jsonResponse(res, { reservationId: row.reservationId, projectId: row.projectId, status: row.status, reservedCents: row.reservedCents, chargedCents: row.chargedCents, releasedCents: row.releasedCents, ...sessionLinks(sessionMatch[1]) });
      return;
    }
    if (path === 'balance' && req.method === 'GET') { jsonResponse(res, await ledger('balance', { token, livemode })); return; }
    if (path === 'purchases' && req.method === 'POST') {
      if (process.env.AGARTHA_BLENDER_BILLING_ENABLED !== 'true') throw new BillingHttpError(503, 'Blender credit purchases are not active yet.');
      const body = await jsonBody(req);
      const purchase = await ledger<BillingPurchase>('createPurchase', { token, purchaseId: body.purchaseId, requestId: body.requestId, amountCents: body.amountCents, paymentRail: body.paymentRail, livemode });
      jsonResponse(res, purchaseResponse(purchase), 201);
      return;
    }
    if (!match) throw new BillingHttpError(405, 'Method not allowed.');
    const purchase = await ledger<BillingPurchase & { paymentId?: string }>('getPurchase', { token, purchaseId: match[1] });
    if (purchase.livemode !== livemode) throw new BillingHttpError(409, 'Purchase belongs to a different payment mode.');
    if (!match[2] && req.method === 'GET') { jsonResponse(res, purchaseResponse(purchase)); return; }
    if (req.method !== 'POST') throw new BillingHttpError(405, 'Use POST for payment operations.');
    await ledger('authorizePaymentAttempt', { token, purchaseId: purchase.purchaseId });
    if (match[2] === 'reconcile') {
      // Owner can request recovery, but cannot submit a payment observation or change a binding.
      const body = await jsonBody(req);
      const paymentId = purchase.paymentId ?? body.paymentId;
      if (typeof paymentId !== 'string' || !/^pi_[a-zA-Z0-9]{1,120}$/.test(paymentId)) throw new BillingHttpError(400, 'Provide the Stripe payment ID to recover this purchase.');
      const intent = await stripe.paymentIntents.retrieve(paymentId);
      if (intent.metadata.agartha_purchase_id !== purchase.purchaseId || intent.metadata.agartha_agent_id !== purchase.agentId) throw new BillingHttpError(403, 'Payment does not belong to this purchase.');
      await reconcileCreditPayment(stripe, reconciliationLedger(ledger), paymentId);
      jsonResponse(res, await ledger('getPurchase', { token, purchaseId: purchase.purchaseId }));
      return;
    }
    if (process.env.AGARTHA_BLENDER_BILLING_ENABLED !== 'true') throw new BillingHttpError(503, 'Blender credit purchases are not active yet.');
    if (match[2] === 'checkout') {
      const base = publicBase();
      const urls = checkoutReturnUrls(base);
      const checkout = await createCreditCheckoutWithLegacyRecovery(stripe, purchase, urls, { successUrl: `${base}/?blenderPayment=complete`, cancelUrl: `${base}/?blenderPayment=canceled` });
      await ledger('attachCheckoutSession', { purchaseId: purchase.purchaseId, checkoutSessionId: checkout.id });
      const { confirmationUrl } = checkoutReturnUrls(base, checkout.id);
      jsonResponse(res, { purchaseId: purchase.purchaseId, checkoutSessionId: checkout.id, paymentUrl: checkoutPaymentUrl(base, checkout.id), checkoutUrl: checkout.url, confirmationUrl });
      return;
    }
    if (mpp) {
      const profileId = process.env.STRIPE_PROFILE_ID;
      const signingSecret = process.env.AGARTHA_MPP_SIGNING_SECRET;
      if (!profileId?.startsWith('profile_') || !signingSecret || signingSecret.length < 32) throw new BillingHttpError(503, 'Configure the Stripe business profile and MPP signing secret.');
      const headers = new Headers();
      if (authorization) headers.set('Authorization', authorization);
      const response = await handleCreditMpp(new Request(`${publicBase()}/api/blender/${path}`, { method: 'POST', headers }), purchase, { stripeClient: stripe, profileId, signingSecret, livemode }, async observation => {
        const result = await reconcileCreditPayment(stripe, reconciliationLedger(ledger), observation.paymentId);
        if (result.status !== 'fulfilled' || result.purchaseId !== purchase.purchaseId) throw new Error('MPP payment reconciliation failed.');
      });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    throw new BillingHttpError(404, 'Billing route not found.');
  } catch (error) { sendBillingError(res, error); }
}
