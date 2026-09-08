# Paid Blender modeling for agents

Status: approved to continue implementation on September 8, 2026; Stripe credentials are being supplied. Merchant: Divine Inside LLC, USA, confirmed by the user. No live billing changes have been made.

## Offer

Sell prepaid, non-transferable Blender service credits in USD. Start with $5 and $20 purchases, without a subscription or automatic top-up. Charge $0.05 per running workspace minute, with a five-minute/$0.25 minimum per session. A default five-minute reservation holds $0.25; the maximum reservation is 30 minutes/$1.50. Use the tested CPU-only two-core/4-GiB cap. Do not include GPUs or four-core upgrades in the initial paid offer.

Bill elapsed workspace time from readiness until confirmed shutdown, rounded up to whole minutes, with the five-minute minimum. This includes idle time while the workspace is available; explain it in every quote. Return unused reserved credits above the minimum after an early stop or idle shutdown. The minimum is not refunded for an early successful stop, and resume starts a new session with a new minimum. Stop idle paid sessions after 60 seconds. Failed startup consumes no credits. Each launch has a platform-enforced maximum lifetime covering its reservation plus at most 75 seconds of startup/cleanup allowance; agents cannot extend that lifetime by changing Blender code.

Credits are not model-quality guarantees: customer scripts can fail while consuming reserved compute. Successful artifact export and checkpoint recovery remain available through the agent API. Retain private checkpoints for seven days after the last paid session, with advance expiry metadata and downloadable exports. Apply a 256-MB project snapshot limit, 1-GiB stored-project quota per billing account, and 256-MiB response/download allowance per reservation. These limits must be enforced outside the Blender process.

## Why this pricing

The verified default workload took 25.7 seconds on two cores. Pricing uses the resource ceiling rather than this unusually small example: two physical cores plus 4 GiB cost at most $0.0063312 per minute at the published Sandbox rates. Startup, idle, cleanup, storage, gateway costs and payment fees still matter.

For a $5 domestic-card purchase, Stripe's published 2.9% + $0.30 is approximately $0.45 after cent rounding. Model the shortest allowed sessions, not only a continuously running worker:

| Use of $5 / 100 billable minutes | Compute ceiling including startup allowance | Compute with 25% contingency | Contribution after ~$0.45 payment fee, before remaining costs |
| --- | ---: | ---: | ---: |
| 100 continuous minutes, excluding a single startup | $0.63312 | $0.79140 | 75.2% |
| Twenty five-minute sessions, 75 seconds overhead each | $0.79140 | $0.98925 | 71.2% |
| Rejected alternative: fifty two-minute sessions, same overhead | $1.02882 | $1.28603 | 65.3% |

For the selected twenty-session case, exhausting 256 MiB per session across two billable network legs would add $0.40 at Modal's announced $0.04/GiB rate, leaving about 63.2% before storage and gateway costs. Budget for the October 1 egress pricing and ignore included transfer allowances/promotional compute credits when assessing sustainable margin. Storage, gateway/database costs, failed starts, refunds, support, tax and fixed overhead remain separate. Target at least 60% contribution after measured variable operating costs; this is not a guaranteed net profit margin.

Live activation requires an end-to-end cost envelope covering repeated minimum sessions, both transfer legs, checkpoint retention and gateway work. If it misses 60%, raise the minimum or reduce the included transfer allowance before enabling purchases.

Alternatives considered: charging cards per tool call loses too much to fixed fees and the $0.50 SPT minimum; subscription billing creates an unnecessary commitment for intermittent agents. Prepaid credits keep autonomous spending bounded and amortize payment fees.

## Payments and agent flow

1. Reuse Agartha's authenticated `cloudSessions.agentId` as the owner identity; credential rotation must preserve the wallet and projects. Publish machine-readable prices, limits and payment methods at `GET /api/blender/pricing`.
2. An authenticated agent creates a credit purchase with a server-selected amount and immutable wallet binding. Offer Stripe MPP on the purchase resource: HTTP 402 challenge, supported agent payment credential, verified payment, receipt. Support the official card/SPT flow where the merchant account is enabled; add stablecoin methods only after account capability verification. Use Stripe-hosted Checkout for human-funded purchases of the same credits.
3. Confirm payment server-side before crediting a wallet. Validate amount, currency, purchase binding, payment status and test/live mode. Deduplicate by the canonical Stripe payment ID, not merely webhook event ID. A browser redirect or client claim never grants credits. MPP and Checkout feed the same fulfillment mutation.
4. Quote a session before launch. Atomically reserve credits in Convex, bind the reservation to the authenticated owner, and issue one launch job. Repeat requests return the same purchase/reservation/session instead of charging or launching again. Insufficient balance returns a structured payment-required response without starting compute.
5. Return an agent-accessible MCP endpoint, project ID, maximum charge, remaining reservation, idle deadline and stop action. Expose balance, quote, start, status, stop and resume through APIs; no dashboard is required.
6. Reconcile actual elapsed time and release unused credits only from trusted platform observations. Unknown worker state keeps the reservation held until its bounded lifetime is reconciled. Delayed/duplicate payment events, launch response loss, worker failure, refunds and disputes must not mint credits or permit overspending.

## Trust boundary

The current operator-only workshop grants substantial control of its Sandbox. Public billing cannot trust its Python timers, files, claimed usage or counters as the financial authority.

Use a trusted launch/MCP broker outside Blender, backed by atomic Convex ledger mutations. Keep Stripe, Modal and database credentials in trusted services. Agents receive neither Modal credentials nor raw Sandbox Connect Tokens. For paid sessions, communicate with the worker through the authenticated Modal SDK execution channel rather than exposing an independently reachable worker URL. Preserve the real upstream MCP schemas and tools through the broker.

Paid workers use ephemeral storage. The broker restores and persists only size-bounded checkpoints/artifacts through private storage; do not mount an unrestricted writable persistent Volume into customer-controlled Blender. Enforce response bytes, stored bytes, ownership, concurrency and payment reservations in the broker. Treat file metadata and runtime-reported counters as untrusted. Keep the existing outbound deny-all policy and no production credentials in workers.

Use a maximum of one active paid session per billing account and 120 tool calls per minute initially, with a small global launch limit and retry backoff. Allow at most one automatic launch retry, and at most two free failed starts per billing account in a rolling 24-hour period. Maintain a trusted global $1 failed-start compute budget per rolling 24 hours; reserve the worst-case failed-start cost before launch and open a circuit when exhausted. A disabled retry requires explicit operator recovery after diagnosis; repeated failures cannot recycle the same credits into unlimited free compute. Use prebuilt, pinned worker images so customer requests cannot trigger image builds. Paid Blender access does not charge for the existing Agartha world APIs and does not automatically publish generated models.

## Implementation boundary and acceptance

- Add isolated billing tables/mutations and Stripe fulfillment routes; preserve existing dirty-worktree changes.
- Add a trusted paid-session broker and bounded worker bridge; retain the existing operator workflow for development.
- Add API discovery and agent instructions, including explicit prices, idle billing, reservations, limits, receipts and recovery.
- Test atomic balance reservation, duplicate/reordered webhooks, payment-proof reuse, cross-owner access, token rotation, concurrent launches, expired quotes, failed startup, repeated free failed starts/budget exhaustion, unknown status, early stop, exhaustion, refund/dispute handling and worker attempts to bypass metering/storage/download limits.
- Verify Stripe sandbox purchase → funded wallet → paid remote MCP modeling/export → stop → settlement → resume, including a rejected unpaid request and no orphan compute.
- Verify MPP using Stripe's recommended validator in test mode. Do not substitute a Checkout-only implementation while describing it as autonomous machine payments.
- Activate live payments only for the verified Divine Inside LLC account and the approved prices. The local Stripe CLI currently identifies an expired “Kamikai sandbox” configuration, so it must be authenticated to the correct account first. No account capabilities have yet been verified.

## Sources checked September 7, 2026

- [Modal pricing](https://modal.com/pricing) — Sandbox CPU $0.00003942/core-second, memory $0.00000667/GiB-second; storage and other costs are separate.
- [Stripe pricing](https://stripe.com/pricing) — standard US domestic-card processing; actual account and payment-method rates must be checked.
- [Stripe machine payments](https://docs.stripe.com/payments/machine) — MPP card/SPT and stablecoin support, payment minimums and account eligibility.
- [MPP integration](https://docs.stripe.com/payments/machine/mpp) — Stripe profile, HTTP 402, payment verification/receipt, test validation.
- [Stripe's agent architecture](https://docs.stripe.com/agents/how-it-works) — developer MCP access alone does not meter or charge product users.

- [Modal egress billing](https://modal.com/docs/guide/network-egress-billing) — $0.04/GiB beyond included allowances starting October 1, 2026; includes private network traffic and external transfers.
