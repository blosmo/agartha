# Paid Blender operator runbook

Status: test-mode end-to-end verification is complete. MPP, hosted Checkout, webhook redelivery, refunds and stale-event replay, real MCP modeling/export, checkpoint resume, idle cleanup, reconnects and metered settlement are verified. All workers are stopped, compute and credit purchases are disabled, and the temporary allowlist is empty. Live activation remains gated on live Stripe configuration.

Merchant: Divine Inside LLC, USA. The supplied Stripe test key was previously checked against the intended US account. The webhook destination is recorded in [stripe-blender-webhook.md](stripe-blender-webhook.md). Do not recreate it. `STRIPE_PROFILE_ID` is now a valid `profile_test_...` business profile. A read-only GET to Stripe Business Profiles returned HTTP 200 and exactly matched the profile configured with the supplied test key.

## Components

- `api/blender.ts`: authenticated purchases, MPP, quotes and reservations. Public pricing is credential-free.
- `api/stripe-webhook.ts`: original-byte signature verification and canonical reconciliation. It remains available for refunds even when new purchases are disabled.
- `convex/cloud/purchases.ts`, `blenderSessions.ts`, `blenderProjects.ts`: internal ledger, lifecycle, quotas and checkpoint metadata.
- `cloud/blender_billing/app.py`: trusted Modal HTTP broker, per-session monitors, recovery sweep and retention cleanup.
- `cloud/blender_billing/image.py`: operator-only image construction. Customer requests use an existing image ID.
- `cloud/blender_billing/provider.py`: exact CPU/memory caps, private exec transport, bounded file I/O and authoritative `poll()` termination checks.

The existing `cloud/blender_mcp` operator workflow is separate. Paid workers never mount the private storage Volume or receive Connect Tokens, account credentials or broker keys.

## Configuration

Keep every value server-only; never use a `VITE_` variable for these secrets.

| Variable | Install on | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Vercel | Test key first; the key fixes the payment mode |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Existing destination signing secret |
| `STRIPE_PROFILE_ID` | Vercel | MPP business profile ID |
| `AGARTHA_MPP_SIGNING_SECRET` | Vercel | At least 32 random characters |
| `AGARTHA_PUBLIC_URL` | Vercel | Canonical HTTPS app origin |
| `AGARTHA_CONVEX_SITE_URL` | Vercel, Modal | Existing trusted Convex HTTP origin |
| `AGARTHA_BILLING_GATEWAY_KEY` | Vercel, Convex, Modal | Separate billing transport key |
| `AGARTHA_BILLING_PAYMENT_KEY` | Vercel, Convex | Payment mutation authority; never in Modal workers |
| `AGARTHA_BILLING_BROKER_KEY` | Convex, Modal | Compute lifecycle authority; never in Blender workers |
| `AGARTHA_BLENDER_BILLING_ENABLED` | Vercel | New credit purchases; default `false` |
| `BLENDER_BILLING_ACTIVE` | Convex | Compute activation for both modes; default `false` |
| `BLENDER_TEST_OPERATOR_AGENT_IDS` | Convex | Stable IDs allowed to spend test credits on real compute |
| `AGARTHA_BLENDER_BROKER_URL` | Vercel | Deployed broker HTTPS origin |
| `AGARTHA_PAID_BLENDER_IMAGE_ID` | Modal | Prebuilt paid worker image ID |

The Modal secret is named `agartha-paid-blender-broker`. It contains only the broker's four needed variables: Convex URL, gateway key, broker key, and paid worker image ID. The private Volume is `agartha-paid-blender-private`, version 2. File transactions serialize local access and reload cross-container commits before reads. Checkpoint writes are journaled; a lost ledger commit response retains the file for reconciliation.

## Local verification

```bash
npx vitest run packages/protocol/src/blenderBilling.test.ts packages/billing/reconcile.test.ts scripts/blenderPayments.test.ts scripts/blenderBillingHttp.test.ts convex/blenderBilling.test.ts convex/blenderBillingHttp.test.ts convex/blenderReservations.test.ts convex/blenderProjects.test.ts convex/blenderFlow.test.ts --maxWorkers=1
npm run build:scripts
npm run build:scene
python -m unittest discover -s cloud/blender_billing -t . -p 'test_*.py'
python -m unittest cloud.blender_mcp.test_app cloud.blender_mcp.test_runtime cloud.blender_mcp.test_transport
```

Use a Python environment with `cloud/blender_mcp/requirements-client.txt` plus Starlette for HTTP tests. The local flow test needs a loopback listener. It launches the actual Python broker against Convex-test HTTP actions, with a deliberately simulated provider. It proves credit holds, idempotent tool results, committed checkpoint restore, idle shutdown, lost-launch recovery and settlement; it does not prove Stripe or Modal operation.

## Remote verification and activation

1. Resolve the test business profile and obtain a bounded compute test budget. Keep live purchasing disabled.
2. Build the paid image once using the existing pinned Blender/upstream image plus `cloud/blender_billing`. Record its immutable image ID. Provision the named Modal app before creating named Sandboxes.
3. Deploy the internal Convex functions and explicitly ordered Vercel billing rewrites. Configure the separate service keys. Deploy `cloud.blender_billing.app`; record the returned broker URL. These are production-service changes and require scoped deployment authorization.
4. Set only the test operator allowlist and test activation. Use Stripe test payments for one MPP purchase and one hosted Checkout purchase. Verify actual webhook delivery and wallet credits; repeat events, delayed refunds and lost API replies must not mint additional credits.
5. Run the real remote MCP flow: model, render, export/download, explicit stop, automatic idle stop, timeout, saved project resume and cross-container restore. Verify worker CPU/memory/image IDs and confirm every test worker is stopped. Exercise lost-start and interrupted-checkpoint recovery.
6. Measure worker, broker and monitor durations, transfer legs, retention storage and failure costs. Require at least 60% contribution margin under the measured workload before live activation. Test credentials and local tests do not authorize or prove live transactions.

Deploy command, after configuration and authorization:

```bash
python -m cloud.blender_billing.image
# Install the printed image ID as AGARTHA_PAID_BLENDER_IMAGE_ID.
modal deploy -m cloud.blender_billing.app
```

## Pricing and margin gate

Customer price is 40 cents for five running minutes, then 5 cents per additional begun minute, capped at 165 cents for a 30-minute reservation. Top-ups are $5/$20. The maximum five-minute worker lifetime is 375 seconds including startup allowance, at a 2-core/4-GiB resource ceiling of $0.03957. A $5 standard US card top-up is modeled at $0.45 in processing fees. Include both response-transfer legs, both checkpoint-transfer legs and retention as detailed in the cost review.

The worker-only calculation is not the final margin. Include the trusted HTTP broker, monitors, storage, failed starts, and at least 25% worker-compute contingency. Broker requests reserve 0.125 CPU/512 MiB, with higher peak limits; monitor allocations and actual peak memory must be measured. The approved 40-cent minimum clears the modeled 60% contribution gate with the existing data limits; verify actual account fees before live activation.

Pricing sources recorded during design: [Modal pricing](https://modal.com/pricing), [Stripe US pricing](https://stripe.com/pricing), [Stripe machine payments](https://docs.stripe.com/payments/machine), [Stripe MPP](https://docs.stripe.com/payments/machine/mpp). Recheck rates before live activation.

## Recovery and rollback

- Disable `AGARTHA_BLENDER_BILLING_ENABLED` to stop new top-ups. Disable `BLENDER_BILLING_ACTIVE` to stop new compute reservations. Existing webhooks, stop requests and reconciliation must stay available.
- Never release held credits from an assumed timeout. Use authoritative provider termination; unknown worker identity/outcome remains held for operator reconciliation.
- Named workers include a hash of the full reservation ID and generation. Lost creation replies can recover through lookup without creating another worker. Startup, shutdown, monitor and operation claims are fenced independently.
- A timed-out modeling operation is never rerun automatically. Confirmed termination finalizes its uncertain transfer reservation conservatively.
- Prepared checkpoint journals can safely retry their exact commit. Unfinished writing journals are cleaned only after the session is terminal, releasing the ledger grant before deleting the partial file.
- Old snapshots remain quota counted until deletion is claimed, physically committed and confirmed. Expired projects cannot be revived by a new launch. Hourly cleanup handles expired projects and stale journals.
- Stop and verify all paid Sandboxes before removing the broker or reconciliation jobs. Retain the ledger and private checkpoints according to their retention policy.

## Deployment evidence (2026-09-08)

- Gateway: `https://agartha-dusky.vercel.app`; current test release `agartha-rc49zw8qi-divine-inside.vercel.app`.
- Convex: `quaint-ladybug-283`.
- Broker: `https://blosmo--agartha-paid-blender-serve.modal.run`.
- Corrected paid image: `im-Kv6pF2pEAXlHBphZOfIbZn`.
- Use a Web-standard `fetch(Request)` handler for Stripe webhooks. Vercel legacy Node helpers parse `request.body`; Next.js body-parser configuration does not disable those helpers.
- Do not use `convex deploy --verbose`: it includes deployment environment values in its output.

## Final test results

- Real model: 61,848-byte GLB and 163,641-byte PNG; editable checkpoint 641,977 bytes.
- Cross-container idle save and resume recovered the expected model edit.
- A 310.169-second available session correctly charged 30 cents and released 20 cents from a 50-cent reservation.
- Refunding the original test top-up after usage produced a frozen -155-cent balance, preserving spent-credit debt.
- All workers and pending reservations are cleared. Temporary access and new purchases are disabled.
- See [cost review](paid-blender-cost-review.md): pricing v2 applies the approved 40-cent minimum; maximum-data modeled contribution is 62.3% domestic and 60.8% international. Existing v1 reservations retain their original charges.
- The scoped deployment preserves main commit `76559bb305f5b3b084a9f2fe53c43dc7555e6028`; keep the billing routes and services in main so future automatic deployments retain them.

## Approved pricing v2 and Astra scene

September 8: deployed 40 cents for five minutes plus 5 cents per additional begun minute, maximum 165 cents. Real Astra observatory test created 424 objects and valid PNG, GLB and editable Blender files, then settled at 40 test cents. The worker stopped successfully and Modal reported zero active workers. A new simulated $5 MPP top-up restored the test wallet after the prior refund deficit; no real payment was charged. Temporary compute access and purchases are disabled again after testing.
