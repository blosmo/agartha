# Blender Stripe webhook

The deployed test destination sends events to `https://agartha-dusky.vercel.app/api/blender/webhook`. Test Checkout payments, signed webhook redelivery, canonical credit deduplication, refunds, and stale paid-event replay have been verified. Live payment activation requires a separate live destination and server-only live signing secret; merging the code does not enable payments.

Configure `STRIPE_WEBHOOK_SECRET` server-side. Reuse the existing destination in the intended Stripe account; never commit signing secrets or copy test configuration into live mode. The authoritative subscribed-event list is `BILLING_WEBHOOK_EVENTS` in `packages/billing/stripe.ts`.

The Web-standard request handler preserves the original bytes for signature verification, rejects payment-mode mismatches, and retrieves canonical Stripe payment/refund state before updating credits. It remains available for reconciliation when new purchases are disabled.

See [the paid Blender runbook](paid-blender.md) for activation gates and rollback.
