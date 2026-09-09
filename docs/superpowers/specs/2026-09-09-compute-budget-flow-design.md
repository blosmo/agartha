# Budget-first Compute flow

The user approved a budget-first flow: describe the desired model and intended use, set a maximum total task budget, then let the agent plan, inspect, improve and deliver within it. More expensive presets must not promise a quality level. The budget is a ceiling, not a spending target.

## Product flow

The standalone Compute page keeps its current visual language and endpoints. Its primary form collects a required modeling brief, intended use (general model, game/web asset, product visualization, or 3D printing), and a custom USD task-usage budget. Draft $5, Refined $15 and Detailed $30 are optional starting-budget buttons; $5 is the default. The user can edit the amount. These are effort allowances, not quality guarantees.

The copied plan asks the agent to define acceptance criteria, estimate model/compute/review costs, reserve capacity for validation and export, and show the plan plus any credit purchase before spending. It must preserve the best checkpoint, fix evidence-backed defects, stop when requirements are met or further edits have little value, download before stopping and report files, actual costs, remaining defects and stopping reason.

The task budget includes compute usage, separately billed model inference and review. Compute currently enforces session holds only. The executing agent must be able to measure and bound other costs; otherwise it must disclose unknown costs and resolve the budget scope with the user before spending. Never represent this form as a server-enforced total budget or an automatic model-generation job. Prepaid credit purchases are separately approved cash outlay, with unused funds remaining in the wallet; do not double count funding as task usage or hide an upfront purchase larger than the usage budget.

## UI and behavior

Use semantic labels, native controls and explicit invalid-budget feedback. The form never stores or submits the brief; only the public pricing endpoint is fetched. Reject empty, nonpositive, sub-minimum-compute, fractional-cent and unsafe budget amounts before copying. A bad amount must not leave a stale valid plan available. Clipboard failure reveals and selects the full plan. Editing the form clears copy success; a copy completing after an edit must report that the plan changed.

Move session duration to an optional compute-cost calculator in the pricing section. It estimates a single session only and does not constrain the task budget or appear as the requested task duration in the copied plan. Preserve authoritative live pricing, fallback labels and retry behavior. Live rates update minimum validation and pricing prose together.

## Scope and acceptance

Update `apps/web/public/compute/index.html`, `page.js`, `skill.md`, `modeling.md`, targeted page tests and the operations note. No billing schema, model-provider integration, paid inference, model execution or new payment tier. Shared Checkout confirmation is specified separately in `2026-09-09-shared-payment-confirmation-design.md`; existing charging and idempotency contracts remain unchanged. Keep the existing root/www redirect and all world routes.

Acceptance requires functional tests for budget selection, custom cents, intended-use handoff, invalid inputs, copy races, safe text insertion, clipboard fallback, and pricing failure/recovery; desktop and 390px browser checks; current build/CI; and hosted page/API verification after release. No actual model purchase is required to test the form.
