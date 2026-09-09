# Budget-first Compute Implementation Plan

> **For agentic workers:** Use the approved design in `docs/superpowers/specs/2026-09-09-compute-budget-flow-design.md`. Execute scoped work continuously and review the combined change before release.

**Goal:** Make the modeling brief, intended use and maximum total task budget the primary Compute handoff.

**Architecture:** Static HTML and browser JavaScript construct a local agent plan. The existing pricing API validates minimum compute cost; the agent guide governs cost accounting and iterative delivery. Session billing is unchanged.

**Tech Stack:** HTML, CSS, browser JavaScript, Vitest/jsdom, Markdown, Vercel.

## Global constraints

- Budget is a ceiling, not a spending target; no quality guarantee.
- Draft $5, Refined $15, Detailed $30; custom USD amounts allowed; default $5.
- Include compute, model and review usage in the task budget. Disclose unbounded external costs before spending.
- Compute enforces session holds only; no claim of server-enforced total budget.
- Credit purchases are separately approved upfront payments; unused wallet credit is not task usage.
- No private brief persistence or transmission; safe text rendering only.
- Preserve existing billing endpoints, domain routing, pricing retry and clipboard fallback.

## Task 1: Budget form and copied plan

Files: `apps/web/public/compute/index.html`, `apps/web/public/compute/page.js`, `scripts/computePage.test.ts`.

- [x] Replace the duration-first handoff with required brief, intended-use select, preset buttons, USD amount, and a copy action. Put full instructions in an expandable review region. Keep session duration as an optional separate calculator.
- [x] Parse USD cents strictly and reject unsafe values before building the plan:

```js
function budgetCents(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
```

- [x] Keep budget validation current when live minimum prices change. Invalid values clear the generated plan and explain the error. Copying cannot bypass validation.
- [x] Include brief, intended use, maximum total usage budget, cost-accounting prerequisites, user approval, best-checkpoint review loop, stopping rules, validation/export allowance and honest final report in the copied plan.
- [x] Cover custom cents and invalid values with functional tests. Assert custom brief is text-only, editing clears copied status, stale copy completion is detected, pricing failures remain unverified, and changing the session calculator does not change task duration/budget.
- [x] Run `npx vitest run scripts/computePage.test.ts scripts/agentDocs.test.ts --maxWorkers=1` and `npm run build:scripts`; expect passing results.

## Task 2: Executing-agent guidance

Files: `apps/web/public/compute/skill.md`, `apps/web/public/compute/modeling.md`, `docs/operations/agartha-compute.md`.

- [x] Put budget planning before funding/reservation. Establish acceptance criteria from intended use, verify pricing and bounded external costs, split the budget while preserving validation/export funds, and obtain scoped approval before spending.
- [x] Explain prepaid funding versus actual task usage; never double count or hide larger upfront funding.
- [x] Review from actual images, preserve the best checkpoint, choose the most valuable affordable correction, and stop at acceptance, diminishing returns, or the reserve needed for delivery. Report when the budget is insufficient without starting or spending automatically.
- [x] Report files, actual compute/model/review usage costs, unknown costs, unspent budget, remaining limitations and the stopping reason. Never invent a total or claim printable/rigged/visually verified unless checked.
- [x] Update the operator scope note to distinguish agent-directed total budget from server-enforced session holds.
- [x] Run the agent-documentation test; preserve working relative links and existing exact API request examples.

## Task 3: Review and release

- [x] Review the combined diff for scope, financial promises, stale copy state and contradictory budget language. Resolve actionable findings.
- [x] Browser QA: complete a custom-budget handoff on desktop; verify invalid-budget and offline/retry recovery; complete a preset handoff at 390px with no horizontal overflow.
- [ ] Run the production build, focused tests, staged release-candidate and diff checks; use CI for the full suite and pinned Blender/Rust validation.
- [ ] Push the scoped branch, merge only after green checks, and verify the hosted flow, live pricing, documentation hashes and root redirect. Record what remains agent-enforced and what was actually tested.

## Shared payment confirmation

The additional payment requirements are specified in `docs/superpowers/specs/2026-09-09-shared-payment-confirmation-design.md`. Implement the shared static page and read-only, Stripe/ledger-bound receipt endpoint, preserve legacy retry idempotency, and deploy the compatible private ledger query first. Verify delayed/unpaid-to-paid transitions, partial reversals, unavailable/canceled states, privacy, and both hosted return paths.

## Render timeout correction

A render completed just beyond the old 30-second tool wait, leaving its operation uncertain and later calls fenced. Use a fixed 90-second tool wait inside the existing 120-second claim. Return the current operation deadline to the broker and recheck idle-only shutdown atomically; explicit stop and existing hard limits stay authoritative. Correct Blender 4.5 EEVEE guidance and require client/command timeout cushion. Tests must preserve no-duplicate execution, checkpoint fencing, recent-activity and active-claim races, and hard-stop precedence. Deploy Convex before the broker. No prices or billing holds change.
