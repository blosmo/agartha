# Managed elephant comparison: 2026-09-10

This comparison records one legacy managed job and five version-3 attempts with the same brief and a 500-cent cap per job. The third run was separately authorized after the first version-3 attempt failed before compute. The cumulative approved ceiling remained 1000 cents; the third 500-cent cap was permitted only after the first two runs settled at a combined 116 cents. These are test-wallet operator jobs; assets remain private. The earlier agent-authored direct elephant is a separate experience and is not this baseline.

## Exact brief

> Create an anatomically convincing adult African elephant standing naturally, as a detailed full-body 3D asset for close-up viewing. Include a curved trunk, broad thin ears, tusks, articulated legs and feet, and a natural skin material. Deliver GLB, editable Blender source, and clear views. No base or background geometry in the model. Prioritize the finished model; video is optional.

## Legacy managed baseline

- Job: `3d08c44e-bb72-4093-9f09-29c8e53046c0`.
- Workflow: legacy, no generated references; Blender 5.2.1, worker image `im-t8tTWkO0lG09TfKKn64xx8`. The active broker's source revision was not independently established.
- Final API state: `failed`, no artifacts, compute `settled`, no pending AI charge.
- Settled charge: 95 cents, comprising 55 cents of AI and 40 cents of compute.
- The old progress text incorrectly said validated files had been delivered and `visuallyInspected` was true despite an empty artifact list.

The saved project was recovered separately from private checkpoint storage after settlement. It is diagnostic source, not a successful managed delivery. Opening it locally without automatic script execution and exporting only the model collection recovered a 1,736,872-byte GLB with 89,508 triangles. No geometry edits were made for the diagnostic renders.

The source is recognizable as an elephant and has a continuous body, ears, trunk folds, feet, tusks, and a tail. Its rounded body, short legs, oversized ear presentation, and soft surface treatment read more like a stylized figure than a convincing adult African elephant for close viewing. Triangle count alone does not establish anatomical quality. A separate local neutral-scene import of the recovered GLB confirmed that the source skin treatment did not survive: the portable model looks smooth and almost white. The geometry was unchanged. This material failure would be obscured by judging only the editable-source preview.

A reproducible delivery regression was found: Blender 5.2 wrote compressed source by default, while managed source validation required the raw `BLENDER` header. The controlled export now requests `compress=False`; actual-Blender regression checks passed. Failed saves no longer count as delivered or inspected models.

## Version-3 attempt 1

- Job: `7c3ecb43-f4dc-4112-9cf9-aab87e1824f7`, started once on 2026-09-10 at approximately 14:56 UTC.
- Reviewed application revision: `9ff75f3`; generated references, no asset/material publication, 500-cent cap and 165-cent compute hold.
- Final state: `failed`, compute `failed`, zero pending charge and no geometry revision. The worker was never launched; the compute hold was released.
- Settled charge: 21 cents (8 reference, 13 strategy). AI Gateway's dashboard showed provider costs of $0.0766 and $0.1337 respectively; these are provider amounts, distinct from rounded service ledger charges.
- Only `reference.jpg` was delivered. It is a design target, not a produced model. No GLB or editable source exists for this run.
- The saved review trace contains no strategy, reviews or accepted revision. Its error is HTTP 502 from the inference gateway. Provider metadata confirms the strategy request completed with HTTP 200 before gateway validation failed.

The exact rejected response was not recoverable from the retained trace. An offline reproduction established a contract defect: the tool schema admitted strategies larger than the parser's 6000-byte limit, and a schema-valid oversized mock settled its charge before producing the same HTTP status. This is a plausible cause, not proof of the particular validation branch hit by this run. The subsequent correction aligns generation and parsing bounds, requests a single tool call, and preserves bounded validation diagnostics without storing model prompts or images in logs.

## Version-3 attempt 2

- Job: `8632b50e-b7d3-4f3a-9fe0-2a00522ecded`, started once on 2026-09-11 at approximately 08:23 UTC.
- Reviewed source revision: `15ffbd2`; application deployment `https://agartha-lims40nl6-divine-inside.vercel.app`, with the broker updated to the same source.
- Final state: `failed` before worker launch, zero pending charge and no geometry revision. The 165-cent compute hold was released.
- Settled charge: 8 cents for the generated reference and 0 cents for strategy. AI Gateway reported $0.0766 for the reference. Strategy generation `gen_01M27S1W45VY4HZHKE7EC5HCC6` returned HTTP 200 in 1.18 seconds, but reported no usage; the dashboard displayed $0.0000.
- The retained trace recorded HTTP 502 with the message that exactly one structured result was required, plus `tools=0` and `finish=length`. This records the missing structured tool call; it does not establish that 4,096 reasoning tokens were spent.
- Only `reference.jpg` was available. It is a design target, not a produced model. There is no GLB, editable Blender source, or model preview from this attempt.

The deployed strategy path still used Chat Completions with a required function call. OpenAI's official [reasoning-model guidance](https://developers.openai.com/api/docs/guides/reasoning) states that GPT-6 Astra function calling requires the Responses API and is unsupported through Chat Completions. This identifies an endpoint compatibility defect in the integration. The subsequent correction migrates all managed Astra function calls to Responses while preserving the model, token ceilings, reasoning effort and budget reserve. It validates completed function-call output, settles known usage once, and leaves missing or all-zero usage unresolved. Mocked provider, billing and gateway regressions pass, but the next paid run still failed before producing geometry.

## Version-3 attempt 3

- Job: `29ce7bca-4d56-4a33-ae3d-dfdf40e037fa`, started once on 2026-09-11 using the corrected Responses path.
- Final state: `failed` before worker launch, compute `failed`, only a generated reference available.
- Known charge: 8 cents. Another 59 cents remains reserved for unresolved inference usage. This is a maximum liability, not a confirmed charge or a released hold.
- The strategy trace reports `status=incomplete, reason=max_output_tokens` and `inference_usage_reconciliation`. Reliable usage was unavailable. No uncertain operation was replayed.

The next bounded tuning increases planner and reviewer output ceilings from 4,096 to 8,192 tokens, uses medium reasoning effort for these two stages, and protects 125 cents for final review. Modeling retains its existing settings and budget adjustment. Preflight checks reject planning that would consume the review reserve. Focused budget and request tests pass; real model quality remains unverified.

## Version-3 attempt 4

- Job: `0db1386f-5515-4203-847f-20fc69215642`, started once on 2026-09-11 using the 8,192-token, medium-effort planner.
- Reviewed source `7f8d5c5`, merged as `c13c099` in PR #57; deployed as `dpl_Ca5mqn4f6HTLojMGcaC79XVVjEPV`.
- Final state: `failed` before worker launch, compute `failed`, no strategy or geometry revision. Only `reference.jpg` exists as a model artifact.
- Known charge: 8 cents for the reference. Another 79 cents remains reserved for unresolved inference usage.
- The private trace again reports `status=incomplete, reason=max_output_tokens` and `inference_usage_reconciliation`.
- AI Gateway generation `gen_01M280X9EZPJP3D36NT5AABY30` began at 10:41:14.207 UTC, returned HTTP 200 in 1.69 seconds (provider response time 1.61 seconds), and explicitly reported no usage. The dashboard displayed $0.0000, which is not sufficient evidence to release the service hold.

Increasing the ceiling and reducing reasoning effort did not resolve the failure. The quick, usage-less response does not establish actual reasoning-token exhaustion. The request matches the documented Responses format; the available evidence does not identify a further safe parameter correction. Paid retries stopped pending a reliable provider response or a more specific diagnosis. Temporary operator overrides were removed without releasing the unresolved holds. No successful improved model is available, and public version 3 remains disabled.

At that point, five dispatches had produced 140 cents of known service charges and 138 cents of unresolved maximum liability, totaling 278 cents of accounted exposure. Further private verification is authorized within the original 1,000-cent cumulative ceiling, with each new job capped at 500 cents. Unknown charges remain included until reconciled. Version 3 remains disabled as the public default pending a successful model and export review.

## Controlled provider diagnosis and schema correction

Seven small probes used the same Astra gateway, separate durable operation labels, and the original cumulative budget. Text output and minimal loose/strict function calls succeeded. The exact planner without images failed with all-zero usage in 1.947 seconds; changing only strict mode to false also failed in 1.745 seconds. Removing all optional schema constraints completed but violated local length limits.

Removing **only the string regex pattern** from the original planner schema completed in 17.855 seconds with 576 input tokens and 559 output tokens. The 2,061-byte strategy passed `parseStrategy`. Strict mode, string length limits, array limits, model, prompt, reasoning effort, and output ceiling were unchanged. This isolates the repeated whitespace regex as the trigger in this provider path. It does not imply that every regex is unsupported.

The fix removes that pattern from planner and critic schemas and retains local whitespace, Unicode, length, field, and byte validation. A regression test failed before the change and passed afterward. The seven probes account for 140 cents conservatively: 20 cents of rounded, padded metered exposure and 120 cents retained for ambiguous requests. Together with the five jobs, total accounted exposure is 418 cents before another full run. Full model delivery and public activation still require verification.

## Model action recovery

Full managed verification now passes planning and launches Blender. The next failure exposed a separate control-flow defect: a completed but invalid modeling action ended the job rather than allowing a bounded correction. An edit used only for resource discovery also triggered automatic export before geometry existed, and asset searches replaced previous inspection history.

The follow-up fixes distinguish a completed, billed but invalid modeling action from uncertain inference. The modeler may issue up to two consecutive corrective requests under fresh operation IDs. Invalid actions never execute, while uncertain and reviewer failures still stop. Search results preserve recent inspection history and structured identifiers within the serialized context bound. The tool description names every operation requiring JSON parameters. A fixed read-only resource action supplies toolkit signatures and installed catalogs without requiring model export.

Regression tests reproduce the recovery and history faults. Actual Blender checks confirm toolkit inspection does not change the scene. Private run identifiers, billing receipts and spending details remain in the operator's verification report.

## Reproduction and evidence

`scripts/managed-quality-benchmark.mjs` resumes pre-created jobs from a private manifest, with the bearer token supplied separately. It checks the stored brief, cap, version, and publication settings, records each start attempt before dispatch, refuses an uncertain second start, and bounds same-origin artifact downloads. One `status` command performs one bounded poll. Creation/funding remains an explicit operator action.

Private state, tokens, source files, reference images, and render files are excluded from this report and the repository. A failed delivery and a recovered checkpoint must remain distinguishable in any comparison.
