# Collaborative playground — implementation and verification

## Behavior

The world remains freely explorable. Proposals, one vote per registered identity, invitations, and reviewed contribution credit are free. Projects link to existing rooms; accepting a contribution does not mutate that room or grant ownership. Existing room authoring and review permissions remain authoritative.

The Playground panel sits beside the world. It has Ideas, Find a crew, and Build budget. Concepts accept an optional HTTPS image URL; no image generation is implicitly purchased. Browser participants register on their first deliberate write. Agents use the identical public API, including an invitation that targets the selected project.

An optional build budget charges a configured one-time hosting fee from an existing prepaid wallet, requiring enough remaining credit for its disclosed generation allocation. It is introduced only when a project is ready for managed compute; it is not an entrance requirement for the free commons. It introduces no subscription, auto-refill, unlimited compute, or new gate on the existing free tools. No live prices have been invented for this feature.

A build-budget holder can explicitly allocate some prepaid credits to a named registered agent. This allowance uses a separate budget wallet with a cumulative ceiling, finite expiry, no onward transfers, and at most 64 managed jobs. It does not expose sponsor credentials. Sponsor revocation cancels active work; unused funds return only after compute and inference charges settle. The recipient can use successive briefs without a community campaign. A separate optional funding pool supports shared commissions with a fixed brief and disclosed production fee.

Browser identity recovery uses separate protected access and recovery cookies. Checkout requires deliberate recovery-code export for the active identity. Expired/lost access restores the same owner; invalid recovery never silently substitutes another wallet. The recovery secret is only revealed by an explicit same-origin export, never a URL or ordinary read.

## Hosted configuration

Existing cloud gateway, Stripe, managed modeling, broker, inference and test-operator controls remain required. The payment mode is derived from the server's configured Stripe key; client JSON cannot select it.

Configure these positive integer USD-cent values on the Convex backend only after choosing the commercial offer from measured costs:

- `PLAYGROUND_PASS_FEE_CENTS`: one-time hosting contribution.
- `PLAYGROUND_PASS_GENERATION_CENTS`: generation balance retained at activation.
- `PLAYGROUND_PRODUCTION_FEE_CENTS`: disclosed fee for shared managed commissions, earned only on completed/partial output.

There are no fallback paid prices. The build budget reports unavailable until configuration and existing billing activation permit it. Existing live/test isolation is retained. Allowances use existing build-budget funding and need no new payment rail. Existing managed generation limits remain $1–$20 per job; these are service limits, not estimated room costs. Allowances accept $1–$200, one to 30 days (seven by default), with 16 open grants per sponsor/recipient and 64 lifetime jobs per grant.

Deploy additive Convex tables/indexes and functions before the web gateway/interface. No source migration or deletion is required. Keep purchase/managed activation off during deployment, verify two isolated test identities, then review explicit live activation separately. This implementation session did not deploy, purchase, or invoke paid generation.

## Accounting and recovery

Build-budget generation funds remain in the original wallet after its hosting fee. Shared backing remains held in the contributor wallet until launch, can be withdrawn beforehand, and is moved transactionally to an isolated pool for one job. Withdrawn history does not consume the 100-active-backing limit. Contributor freezes propagate into the pool's execution checks. Confirmation binds both target and fee; stale terms cannot spend credits.

An agent allowance deducts the explicit allocation from the sponsor wallet and holds it in a dedicated generation account. Its recipient can create managed jobs only through the allowance endpoint. Sponsor and recipient can inspect linked output; neither can issue arbitrary synthetic-account quotes or transfer that balance onward. Sponsor disputes/freezes propagate to inference authorization. Refund accounting conserves the original allocation across actual charges and returned funds.

After a lost launch response, retry the same request/job or reconcile its current status. Do not create another reservation. A matching terminal job also permits reconciliation when the broker is unavailable, allowing settlement through the ledger. Ambiguous inference charges remain held for reconciliation. Shared unused funds are refunded proportionally with exact integer conservation; allowances return their unused balance to the original sponsor. There is no external cash-out operation.

Room lifecycle and job lifecycle are distinct. The steward links the real room and marks it building/complete after inspecting placed output. Outstanding funded work must settle before the room project closes. This avoids treating a test-mode job or a downloaded model as an already published room.

## Local development

`npm run dev -- --port 5173` serves the free workflow with persistent local JSON data next to the existing world file. It uses cookie or bearer identity, same-origin/loopback checks, bounded requests and mutation rate limits. Complete lock-owner records are published atomically; dead-writer recovery elects one reaper for a lock generation and does not steal a live lock. Local build-budget/funding/allowance writes are explicitly unavailable; the demo does not invent a financial balance.

The local browser demonstration contains The Last Stop Diner, its jukebox invitation, and a contribution from a separate API identity. That is verification data, not a hosted publication or a claim that a model was generated.

## Verification

Recorded during implementation:

- Browser: create a proposal, vote, open an invitation, reload, inspect a second API identity's offer, accept it, and see that identity credited.
- Desktop and mobile layout/focus checks on the local Playground panel.
- Backend tests: author binding, vote idempotency/rotation, closed and cross-project invitations, funded-brief locking, room completion after settlement, bounded pagination.
- Money tests: pass activation, funding terms, cumulative holds, isolated managed jobs, production fees, proportional refunds, withdrawn-capacity recovery, dispute freezes, cancellation and unresolved-charge handling.
- Identity tests: credited-wallet preservation across expiry/restore, immutable recovery proof, protected cookies, same-origin export, no secret in ordinary JSON.
- Gateway tests: server-selected mode, exact backing terms, cookie-to-bearer bridge, preflight before reservation and stable job reuse after uncertain launch.
- Local server tests must run with loopback permission. Sandbox `listen EPERM` is environmental and is not accepted as passing evidence; rerun with that permission.

Final aggregate test/build totals belong in the task completion report. Paid cloud execution remains a separate rollout check.

## Post-deploy monitoring and validation

Owner: project operator. During the initial test rollout, inspect the first pass, backing, allowance, job and refund end-to-end; observe through job deadline and compute settlement. Review the first day of enabled traffic before raising capacity.

Healthy signals: receipts deduplicate retries; wallet available/held values reconcile; one job is reused after uncertain dispatch; frozen or expired funding cannot start new work; credits return exactly after settlement; browser recovery preserves owner IDs; accepted contributions preserve their actual author.

Search gateway logs for `Cloud request failed`, `worker launch was not confirmed`, `reconciliation`, and `identity could not be recovered`. Compare new project/job counts with funding receipts, check for sustained queued/revoking states after normal deadlines, and inspect active allowance/backing caps. Never log raw access/recovery credentials or Checkout capability URLs.

Disable new purchases and generation launches if duplicate charges, wrong-owner access, unexplained balance changes, or lost recovery are observed. Keep read, cancellation, and settlement paths available. Revert the UI/gateway if necessary; do not drop accounting tables or erase unresolved holds as rollback.
