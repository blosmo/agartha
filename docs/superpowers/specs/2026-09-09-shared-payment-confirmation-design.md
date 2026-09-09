# Shared Stripe confirmation screen

The user requested a proper post-Stripe confirmation screen for both Agartha and 3D for Agents, and suggested sharing it. Both services use the same agent-owned prepaid balance, so use one `/payments/return/` screen with links to both services. Serve it on both origins; generate deterministic Checkout URLs on the configured `AGARTHA_PUBLIC_URL` billing origin so retries of the same purchase do not acquire different Stripe idempotency parameters.

## Verification and privacy

New Checkout success URLs include Stripe's literal `{CHECKOUT_SESSION_ID}` placeholder. Cancel URLs lead to the same screen in a neutral closed-checkout state. A redirect or query flag never proves payment. Existing checkout API responses gain a direct `confirmationUrl` built from the returned session ID, useful even when an existing Checkout session still has a legacy return URL. Legacy root `blenderPayment` returns go to an unverified explanatory state on the shared screen.

`GET /api/blender/checkout-status?session_id=...` accepts the opaque Stripe Checkout receipt ID as narrowly scoped read access. It needs no browser agent credential and returns no email, name, agent/purchase/payment ID, full Stripe object, balance or Checkout URL. It verifies Stripe session identity, payment mode, payment rail, metadata, amount, currency and the ledger's immutable Checkout/payment binding. No receipt request may fulfill, reconcile, charge, refund or otherwise mutate payment state.

Add a payment-service-only `getCheckoutReceipt` ledger query to read the matching purchase and its existing payment contribution. No schema change is needed. Exact credited and reversed amounts and open disputes distinguish a full credited purchase from an adjustment; purchase status alone is insufficient for partial refunds. Public results project only `state`, `amountCents`, `currency`, `livemode`, and `creditedCents` when meaningful. States: `pending`, `payment_received`, `credited`, `adjusted`, `not_completed`, `expired`. Stripe or ledger mismatches fail closed. Unknown upstream failures are redacted.

The screen shows purchase amount and credits added by this purchase, not current spendable wallet balance. Even a credited purchase does not prove current availability after usage, holds or other disputes; the agent checks balance before compute. Payment received while the ledger is pending is shown as processing rather than ready. Bounded read-only polling and manual retry recover delays without creating another purchase. Test-mode results clearly say test; no live-credit promise. Missing/invalid receipts, canceled checkout and legacy returns never display success.

## Routing and display

Use semantic, responsive HTML with visible checking, credited, payment-received, pending, adjusted, not-completed, expired, canceled, missing-link and unavailable states. Header: shared modeling credits. Actions link to `https://3dforagents.com/compute/` and the configured Agartha public homepage (current canonical public site is `https://agartha-dusky.vercel.app/`). No open redirect or arbitrary user-supplied destinations. No trackers, no account credentials, no private browser storage. Send `no-store`, `noindex` and `no-referrer` for the receipt page and status response.

## Tests and release

Unit/transport tests must cover bindings, wrong mode/amount/metadata, privacy projection, no writes, pending versus credited, partial/full reversals and dispute states, and deterministic success/cancel URLs with the placeholder intact. Test the Convex receipt query's payment-key boundary and immutable Checkout match. Browser tests cover success, delayed crediting, unavailable/retry, cancellation/forged flags and mobile layout. Verify both hosted origins, redirects and a fail-closed live lookup. Do not charge a live payment for these tests. Publish the compatible Convex query before deploying the status route; use the reviewed current-main checkout without the unrelated workspace snapshot.

Stripe references: [custom success pages](https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=stripe-hosted), [fulfillment and webhooks](https://docs.stripe.com/checkout/fulfillment).
