# Service-owned managed modeling implementation plan

> **For agentic workers:** Use the subagent-driven-development skill for bounded implementation and review tasks. The user approved this design and implementation; continue without routine design approval pauses.

**Goal:** Make prompt-and-budget managed creation the normal agent workflow and require service-owned planning and independent visual acceptance.

**Architecture:** Persist workflow version 3 for new jobs after a coordinated setting is activated. Reuse the studio executor, inference ledger, artifact store, and existing public API; isolate strategy and critic prompts from modeler history. Older rows continue through their original protocols.

**Tech stack:** TypeScript, Convex, Python, Blender 5.2.1, Modal, Vercel AI Gateway with GPT-6 Astra and GPT Image 2.5 Flare.

## Global constraints

- Approved provider spend: two elephant runs at 500 cents each, 1000 cents total.
- No new payment rail, model provider, customer charge, asset publication, or automatic uncertain-operation replay.
- Preserve existing ownership, cancellation, checkpoint recovery, download bounds, and budget accounting.
- Keep all current jobs and retries compatible; change defaults only for newly created version-3 jobs.
- Activation setting: `AGARTHA_MANAGED_WORKFLOW_VERSION=3`, with consistent reference availability on Convex and Vercel. Before public activation, use `AGARTHA_MANAGED_WORKFLOW_OPERATOR_AGENT_ID` to enable only the benchmark identity.

## Task 1: Admission, discovery, and durable acceptance contract

**Files:** `convex/cloud/managedJobs.ts`, `convex/cloud/managedJobSchema.ts`, `convex/managedJobs.test.ts`, `packages/modeling/jobs.ts`, `api/blender.ts`, `vercel.json`, `apps/web/public/compute/skill.md`, new `apps/web/public/compute/direct.md`, new `apps/web/public/compute/llms.txt`, `apps/web/public/compute/index.html`, `apps/web/public/compute/managed.js`, agent documentation and focused tests.

**Interfaces produced:** managed rows have optional `workflowVersion: 3`; inference kinds additionally permit `strategy` and `review`; `recordManagedAcceptance({jobId, executorId, qualityApproved?: boolean})` requires `qualityApproved === true` for v3 and allows v3 without generated references. Artifact links include `review.json` for v3 when a checkpoint exists.

- [ ] Add regression cases for new v3 default reference selection, explicit none, caps below 500, old-row replay across activation, payload mismatch, and unchanged funding/cancellation behavior.
- [ ] Resolve defaults after looking up a prior request so a deployment setting change cannot convert a retry into a different paid operation. Persist v3 only for new jobs when the setting is active. Use 30-minute reservations for v3 caps at least 500 cents; otherwise preserve the existing 10-minute reserve.
- [ ] Extend ledger inference kinds and require the trusted independent-review flag for v3 acceptance. Completion with no independently accepted checkpoint must remain partial, not completed. Checkpoint writes invalidate acceptance as before.
- [ ] Move direct instructions out of the managed quickstart, add host-specific discovery routes ahead of the generic fallback, and describe budget/reference defaults accurately without calling a blockout finished. Keep short `paymentUrl` and MPP recovery guidance in the appropriate funding sections.
- [ ] Run `npx vitest run --dir scripts --maxWorkers=1` and the affected Convex tests. Commit and provide the exact diff for review.

## Task 2: Service-owned planning and independent review

**Files:** new `packages/modeling/quality.ts`, `packages/modeling/inference.ts`, `packages/modeling/http.ts`, `packages/modeling/studio.ts`, `cloud/blender_billing/studio.py`, `cloud/blender_billing/managed.py`, their focused tests, and modeler guidance.

**Interfaces consumed:** Task 1's v3 row and acceptance arguments. **Interfaces produced:** protocol 3 inference supports `kind: 'strategy' | 'modeling' | 'review'`; the planner returns a validated strategy object; the reviewer returns validated criterion evidence and prioritized defects with derived `accepted`. Strategy and review are billed through `claimManagedInference` and `completeManagedInference`.

- [ ] Add tests that critic requests omit modeler history, reject missing/duplicate views and malformed verdicts, enforce conservative cost bounds, and never redispatch uncertain requests.
- [ ] Build strict strategy/review function schemas and parsers in `quality.ts`. Use Astra with separate system prompts. Keep the modeling action protocol compatible and add a bounded strategy field to v3 modeler input.
- [ ] Validate protocol 3 against the persisted row in the inference gateway. Route each operation kind through the existing fenced inference implementation, never through a customer-controlled provider URL.
- [ ] Run v3 rows through `run_studio` regardless of reference mode. Generate a strategy before starting the worker. On acceptance, collect fresh views, hash the GLB, run the critic, cache the decision only for that revision/hash, and accept only a passing result. Return prioritized defects to the modeler for targeted edits.
- [ ] Persist `review.json` independently of reference metadata for non-reference v3 jobs. Keep valid older reference traces readable. Preserve seven-day retention and bounded authorized reads.
- [ ] Add workflow tests for rejection then repair, no acceptance on modeler claims, stale verdict invalidation, reviewer budget exhaustion, no-reference strategy, accepted-file fallback, final-render geometry preservation, cancellation, and stopping after failure.
- [ ] Run the full Python billing/MCP suites and focused TypeScript tests. Run Blender export and review regressions. Commit and provide the exact diff for independent review.

## Task 3: Controlled elephant comparison and release

**Files:** a reusable bounded benchmark runner under `scripts/`, private local output under `/tmp`, a credential-free report under `docs/benchmarks/`, release verification notes.

- [ ] Run the baseline against the old workflow before deployment using a 500-cent cap and save exact input, status, settlement, artifacts, and versions.
- [ ] Add a resumable benchmark runner which writes job IDs before sending, polls boundedly, downloads only returned artifacts, and refuses a second dispatch for an uncertain run. Keep secrets outside source and reports.
- [ ] Verify all tests, build, release scan, and independent code review. Deploy compatible inference/schema/broker code, then activate the version setting for the approved operator run.
- [ ] Run the improved workflow with the same elephant brief and 500-cent cap. Inspect references, real model renders, GLB import, and review trace; record actual visual differences and costs, including any unknowns.
- [ ] Activate public v3 only after verification. Merge tested source into main, verify the deployment and live agent entry points, retain the benchmark privately, and report quality limitations honestly.
