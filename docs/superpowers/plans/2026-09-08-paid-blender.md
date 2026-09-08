# Paid Blender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell bounded Blender modeling sessions to agents through Stripe, with a prepaid ledger and enforceable cost limits.

**Checkpoint (2026-09-08):** Pricing, payment adapters, internal ledger, trusted broker, private worker bridge, checkpoint persistence and agent documentation are implemented locally. The real Convex/Python integration uses a simulated provider and passes funding/start/model/replay/stop/resume/idle/lost-launch recovery. Remote deployment, Stripe business profile, actual payments/compute and measured margin remain open. See `docs/operations/paid-blender.md`.

**Architecture:** Agartha's stable cloud agent identity owns a Convex wallet. Stripe Checkout and MPP fund the same idempotent purchase ledger. A trusted Modal broker reserves credits, starts ephemeral workers, forwards real MCP operations through private SDK execution, persists bounded artifacts, and settles usage from trusted observations.

**Tech Stack:** TypeScript, Convex, Stripe/MPP, Python 3.12, Modal, pinned Blender 4.5/MCP runtime.

## Global Constraints

- Merchant: Divine Inside LLC, USA; USD only. Live account identity and capabilities must be verified after credentials arrive.
- $5/$20 credit purchases; $0.05/minute, five-minute/$0.25 minimum, 30-minute/$1.50 maximum reservation. No subscriptions, auto top-up, GPUs or paid four-core tier.
- Two-core/4-GiB worker cap, 60-second paid idle stop, platform TTL reserved seconds + at most 75 seconds. One active reservation per owner, 120 tool calls/minute, global launch cap four.
- 256,000,000-byte project snapshot; 1,073,741,824 stored bytes/account; 268,435,456 response bytes/reservation; seven-day retention. Enforce outside workers.
- One automatic retry, two free failed starts/account/24h, $1 failed-start compute budget/global/24h. No customer-triggered image builds.
- Preserve all unrelated dirty files, especially public agent prompts/skill/llms files currently edited by other work. No live payment tests or activation without the provided credentials and verified account.
- Use integer cents and integer nanodollars for money calculations. Unknown terminal state cannot release reserved funds. Buyer charges never exceed the accepted quote.
- Isolate test/live wallets by `(agentId, livemode)`. Test credits never fund live reservations. Test-mode compute is restricted to explicitly configured operator agent IDs, and absent activation settings fail closed.
- No Stripe/Modal/Convex credentials or raw Connect Tokens go to customers or Blender workers. Paid workers have ephemeral storage and no directly exposed HTTP route.

---

## Task 1: Pricing and bounded quote contract

Files: create `packages/protocol/src/blenderBilling.ts` and `packages/protocol/src/blenderBilling.test.ts`.

Produces `BLENDER_BILLING`, `quoteBlenderSession(minutes, now)`, `settleBlenderSession({reservedMinutes,readyAt,stoppedAt,startupFailed})`, `worstCaseBlenderCostNanoUsd(minutes)`. Quote includes pricing version, USD currency, reserved minutes/cents, 25-cent minimum, expiry and platform lifetime. Settlement returns charged minutes/cents and released cents. Quotes are data, not authorization; Task 2 persists owner-bound IDs.

- [x] Test exact boundaries before implementation:
  ```ts
  expect(quoteBlenderSession(5, 1000).reserveCents).toBe(25);
  expect(quoteBlenderSession(30, 1000).reserveCents).toBe(150);
  expect(() => quoteBlenderSession(4, 1000)).toThrow();
  expect(settleBlenderSession({reservedMinutes:30,readyAt:1000,stoppedAt:61001,startupFailed:false}).chargeCents).toBe(25);
  ```
- [x] Reject non-integers, non-finite values, negative/inverted timestamps, invalid durations and inconsistent failed-start state. Cap late-stop billing at the reservation; return all credits only for a verified pre-ready failure.
- [x] Use `39_420` nanodollars/core-second and `6_670` nanodollars/GiB-second for ceiling estimates. Keep cost and customer price separate.
- [x] Run `npx vitest run packages/protocol/src/blenderBilling.test.ts` and the protocol typecheck; review exported names before Task 2.

## Task 2: Atomic Convex ledger and ownership

Actual files: `convex/cloud/billingSchema.ts`, `common.ts`, `purchases.ts`, `blenderSessionSchema.ts`, `blenderSessions.ts`, `blenderProjectSchema.ts`, `blenderProjects.ts`, plus billing/reservation/project/HTTP/flow tests and schema spreads in `convex/schema.ts`.

Consumes Task 1 policy and `session(ctx, token)` from `convex/cloud/common.ts`. Wallets are keyed by stable `agentId` and test/live mode, not a mutable token hash. Implement purchases/wallets first, then reservations and projects against the reviewed common interfaces.

Produces internal operations `balance`, `createPurchase`, `fulfillPurchase`, `reversePurchase`, `createQuote`, `reserveSession`, `markSessionReady`, `settleSession`, `claimLaunch`, `recordLaunchFailure`, `authorizeOperation`, `reserveArtifactBytes`, and `commitArtifact`. Keep operation-specific arguments validated; trusted lifecycle/payment operations are not publicly callable mutations.

- [x] Test with `convex-test` using the real schema and existing cloud session registration. Two simultaneous reservations against one wallet must produce at most one active session and never a negative available balance.
- [x] Persist purchases, canonical Stripe payment identities, append-only ledger entries, quotes, reservations, project ownership and artifact budgets. Duplicate payment IDs across webhook events credit once; a payment reused for a different purchase fails.
- [x] Bind idempotency keys to owner plus request payload. Token rotation preserves balances; cross-owner reads/stops/downloads fail. Enforce quote expiry/version and exact money/currency/mode.
- [x] Add launch claim fencing and failure-budget reservations. Reconciliation releases credits once; stale callbacks cannot settle a replacement launch. Refunds/disputes remove available credits or freeze deficit wallets without silently forgiving spent credit.
- [x] Test replay, concurrent mutations, changed payload under an idempotency key, failure loops, uncertainty, expiry, partial reversal and retained byte quotas. Run `npx vitest run convex/blenderBilling.test.ts`.

## Task 3: Stripe purchase and HTTP adapters

Files: create `api/blender.ts`, `api/stripe-webhook.ts`, `packages/billing/stripe.ts`, `packages/billing/mpp.ts`, `scripts/blenderPayments.test.ts`, `convex/cloud/billingHttp.ts`; modify `convex/http.ts`, `vercel.json`, `.env.example` and dependency manifests only as needed.

Consumes Task 2 internal operations through authenticated HTTP actions. API routes: public pricing; authenticated balance, purchase creation, quote, session start/status/stop/resume; purchase-bound MPP challenge; dedicated raw-body Stripe webhook. Add explicit Vercel rewrites before the existing catch-all `/api` rewrite, preserving old routes.

- [x] Define injectable Stripe/ledger adapters and test them with fixtures before credentials arrive. Never credit on a redirect or unchecked client metadata.
- [x] Implement hosted Checkout for $5/$20 purchases, with immutable purchase identity and server-selected amounts. Webhook signature uses the original bytes; paid amount, currency, mode and purchase binding are verified before fulfillment.
- [x] Implement actual MPP using Stripe's documented `Mppx`/Stripe methods and a purchase-bound challenge. Successful card/SPT payments feed the same canonical fulfillment path; replay cannot fund another wallet. Keep unsupported payment methods unadvertised.
- [x] Fail closed with actionable configuration errors when keys/profile are absent. Server-only variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PROFILE_ID`; internal signing/broker secrets are generated during setup.
- [x] Test valid/invalid webhook signatures, duplicate/out-of-order events, lost API responses, unpaid MPP retry, wrong purchase proof, auth and routing. Run `npx vitest run scripts/blenderPayments.test.ts` plus relevant gateway tests.

## Task 4: Trusted paid broker and bounded private worker bridge

Files: create `cloud/blender_billing/broker.py`, `cloud/blender_billing/worker_bridge.py`, `cloud/blender_billing/storage.py`, `cloud/blender_billing/test_broker.py`; adapt shared Blender bootstrap/supervisor only with operator-regression coverage.

Consumes Task 2 reservation/operation contracts. Produces a real remote MCP endpoint and session lifecycle for paid agents. Modal credentials stay in the trusted broker; workers use the prebuilt image, no credentials, no persistent writable Volume, and no Connect Token/public port exposed to customers.

- [x] Test fake provider observations before live use: no launch before an atomic reservation; repeated launch request reuses one named worker; missing terminal observations hold credit.
- [x] Use SDK execution/stdin/stdout for the private worker bridge. Keep upstream tool schemas/results intact; bound request/response bytes at the broker and never trust worker counters or filesystem size claims without bounded reads.
- [x] Persist only verified bounded files in owner-scoped private storage, and restore checkpoints into ephemeral workers. Enforce aggregate storage, transfer and retention budgets outside Blender. Preserve editable projects through actual stop/resume.
- [x] Enforce platform TTL, broker-side idle time, call/concurrency limits, failed-start budgets, fenced lifecycle callbacks and bounded retries. Persist operations so broker restart cannot lose a running paid worker or duplicate its charge.
- [x] Run Python broker tests and the existing 13 Blender tests. Verify the original operator workflow remains usable.

## Task 5: Agent documentation and credential-independent integration

Actual files: `apps/web/public/agents/blender-billing.md`, `docs/operations/paid-blender.md`, `convex/blenderFlow.test.ts`, and `cloud/blender_billing/verify_local.py`. Existing dirty public documents are preserved.

- [x] Document pricing, minimums, idle billing, credit holds/releases, purchase receipts, explicit spend limits, quota/expiry metadata and the authenticated MCP flow. Make CLI/agent operations first-class; no billing dashboard.
- [x] Run the full local flow against injected payment/provider adapters, including unpaid rejection, funding, quote, one launch, modeling response, stop, settlement and resume. Label simulations separately from live evidence.
- [x] Perform an independent financial/security review of the integrated code and repair material findings. Preserve current test and public route behavior.

## Task 6: Stripe and Modal verification, margin audit and activation

- [ ] Once keys arrive, verify the account is Divine Inside LLC (US), confirm Stripe profile/capabilities, and create the test webhook. Use test mode first and never print keys.
- [ ] Run Stripe's MPP validator in test mode, plus Checkout/webhook funding into a real test wallet. Exercise paid remote MCP, exports, stop/settlement, stored-project resume, unpaid rejection and all timeout/cleanup paths.
- [ ] Measure repeated minimum-length sessions, startup/cleanup, gateway and two transfer legs, storage and failures. Require modeled contribution >=60% without promotional allowances before activation; report assumptions and actual evidence separately.
- [ ] Configure production account/approved prices only after all gates pass. Verify live deployment routing and the correct merchant identity; never claim live charging from local tests alone.
- [ ] Record final commands, versions, results, operational rollback and all stopped test workers. Mark the goal complete only when the paid agent flow is operational and verified.

## Verified test checkpoint — September 8

Real Stripe MPP/Checkout, genuine webhook redelivery, refunds/replay, real paid Blender MCP modeling/export, save/resume across controller containers, idle shutdown, reconnects, metered settlement and isolation checks pass. All test workers are stopped; temporary access and purchases are disabled. The maximum-data cost envelope fails the 60% target at 25 cents, so Task 6 live activation remains open pending pricing choice and live credentials. See `docs/operations/paid-blender-cost-review.md` and the evidence JSON files.
