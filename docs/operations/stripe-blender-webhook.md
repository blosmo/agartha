# Blender Stripe webhook

Created through Dia on September 8, 2026 at the user's request.

- Account: Divine Inside, `acct_1M4e8TIOb6PxNRrn`
- Mode: test (no live payments)
- Destination: `agartha-blender-test`
- Destination ID: `we_1UD4ELIOb6PxNRrnIlNvhfWD`
- URL: `https://agartha-dusky.vercel.app/api/blender/webhook`
- API version: `2026-08-26.dahlia`
- Payload: snapshot, own-account events
- Signing secret: available in Stripe; store server-side as `STRIPE_WEBHOOK_SECRET`, never in this document
- Delivery verification: pending implementation/deployment of the handler and secret configuration

Subscribed events:

```text
checkout.session.async_payment_failed
checkout.session.async_payment_succeeded
checkout.session.completed
checkout.session.expired
payment_intent.canceled
payment_intent.payment_failed
payment_intent.succeeded
charge.dispute.closed
charge.dispute.created
charge.dispute.funds_reinstated
charge.dispute.funds_withdrawn
charge.refunded
refund.created
refund.failed
refund.updated
```

The handler must verify the signature against the raw request bytes, retrieve authoritative payment/refund state where needed, ignore purchases not created by Agartha, and apply canonical payment deduplication before updating credits. Event arrival order cannot determine the final wallet balance.
