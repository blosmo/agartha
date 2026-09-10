# Collaborative playground

Status: implemented and verified locally. User authorized autonomous implementation on September 10, 2026. Deployment and paid cloud execution remain separate rollout checks.

## Product contract

Agartha remains a playground for humans and their agents. Browsing, ideas, voting, invitations, and contributions are free. Existing owned-object editing and cross-owner review stay intact. An optional one-time build budget provides a disclosed hosting fee and generation budget when a project is ready for managed compute; additional generations use explicitly authorized prepaid credits. It is not an entrance requirement. No artificial daily winner, compulsory crowdfunding for ordinary rooms, subscriptions, or automatic top-ups. Community projects pool credits for larger builds, with image-led concepts, invitations and distinct authorship/backer credit. Concept art is direction, not a delivery guarantee. Projects may start without knowing every component. Existing budget pays for a complete base; expansions need additional authorization.

Prices must be configurable and explicitly labeled in test mode; retain existing live-payment gates. Do not deploy, charge, invoke paid generation, or publish user content during implementation. Preserve apps/web/index.html's unrelated change.

## Implementation units

### U1 — Community domain, API and local development (root)
Goal: durable free proposals, votes, invitations, contribution review and room links, available equally to humans and agents.
Files: packages/protocol/src/playground.ts; convex/cloud/playgroundSchema.ts; convex/cloud/playground.ts; convex/cloud/playgroundRoutes.ts; convex/schema.ts; convex/cloud/http.ts; api/index.ts; development routing integration; convex/playground.test.ts.
Approach: authenticated existing sessions for writes, public reads with optional personalized session state, bounded indexed pagination and mutation limits. One vote per identity, set semantics. Immutable proposal brief after funding. Only creator changes project or accepts contributions; acceptance credits author but never grants room edit authority. HTTPS concept URL, no server fetching, no generation on proposal submission. Durable idempotency for writes.
Verification: auth, repeat vote, duplicate request, foreign project controls, malformed input, pagination, invitation capacity and accepted contribution attribution; API parity and browser flow.

### U2 — Optional build budget and shared generation funding (billing unit)
Goal: a real bounded credit and fee flow using existing prepaid billing, with transactional community funding and honest availability.
Files: convex/cloud/playgroundFunding.ts; convex/cloud/playgroundFundingSchema.ts; packages/protocol/src/playgroundFunding.ts; relevant narrowly scoped billing integration files; funding tests.
Approach: configure an optional nonrecurring build-budget offer; pay the disclosed hosting fee from existing credits on explicit activation when a project is ready for compute, retaining the remainder as usable generation credits. Never mint credits or auto-charge. Pool prepaid credits toward project budgets, request receipts and exact cancellation refunds. Preserve test/live isolation, freezes, ledger reconciliation and existing generation controls. Determine safe reusable integration for project-funded managed jobs after source inspection. Keep live enablement off until reviewed.
Verification: duplicate purchase/activation/backing, insufficient credit, cancel/refund, frozen accounts, test/live separation, concurrent funding and spending, idempotency binding and job settlement.

### U3 — Playground experience (UI unit)
Goal: image-led proposals and creative invitations alongside the existing world, without a money-first dashboard.
Files: apps/web/src/worlds/playground/*; apps/web/src/worlds/WorldSpace.tsx (limited integration); UI tests.
Approach: header Playground entry opens a responsive accessible panel with Ideas, Find a crew, and Build budget. Anonymous exploration; free visitor session on deliberate first write. Concept cards, vote, proposal creation, detail, room visits, invitation creation, contribution submission/acceptance and visible credits. Build-budget and funding actions use the backend contract and confirmation showing exact allocation; no fabricated paid-success states. Lazy-load and provide loading/error/empty states. Existing world remains visible.
Verification: component interaction and stale-response tests; focused keyboard/mobile browser checks.

### U4 — Integration, agent docs and verification (root)
Goal: complete discoverable end-to-end experience, including agent instructions and evidence.
Files: public agent docs, skill discovery, operation notes, integration tests.
Approach: expose identical operations to agents; document free roam/propose/vote and bounded funding authorization; make project membership separate from object ownership. Verify local application plus full relevant typechecks and focused suite, review auth/money changes.
Verification: browser create/vote/invite/contribute/reload; native API second identity; complete tests/build and independent review. Report local completion separately from deployment and paid-service verification.

### U5 — Bounded agent allowance (integration finding)
Goal: make the build-budget-to-agent promise real without giving an invited agent the browser's whole wallet or requiring a campaign for every ordinary generation.
Files: dedicated allowance schema/mutations/protocol/tests; narrow synthetic-wallet authorization integration; allowance panel; gateway routes and docs.
Approach: a build-budget holder explicitly earmarks prepaid credits for one existing agentId. The allowance is a separate budget wallet, usable only through bounded managed jobs by that recipient. It expires after a disclosed finite interval (default seven days), has no auto-refill and cannot be transferred onward. Sponsor retains read/cancel/revoke/refund authority. Existing account freezes stop funded execution; original wallet credentials never enter agent invitations. Revoke stops active work and unused credits return only after held/ambiguous charges settle. Agents use the same allowance API as the browser. Cap active allowances and job history to bound queries.
Verification: recipient binding, multiple jobs within cumulative ceiling, foreign identity denial, expiry/new-job denial, sponsor freeze, revoke during queued/running work, exact unused refund, idempotent allocation and launch; UI exact amount/recipient/expiry confirmation and API agent handoff.
