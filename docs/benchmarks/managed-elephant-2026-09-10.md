# Managed elephant comparison — 2026-09-10

This comparison uses one legacy managed job and one version-3 managed job with the same brief and a 500-cent cap per job. The approved total cap is 1000 cents. These are test-wallet operator jobs; assets remain private. The earlier agent-authored direct elephant is a separate experience and is not this baseline.

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

## Version-3 run

- Job: `7c3ecb43-f4dc-4112-9cf9-aab87e1824f7`, started once on 2026-09-10 at approximately 14:56 UTC.
- Reviewed application revision: `9ff75f3`; generated references, no asset/material publication, 500-cent cap and 165-cent compute hold.
- Final state: `failed`, compute `failed`, zero pending charge and no geometry revision. The worker was never launched; the compute hold was released.
- Settled charge: 21 cents (8 reference, 13 strategy). AI Gateway's dashboard showed provider costs of $0.0766 and $0.1337 respectively; these are provider amounts, distinct from rounded service ledger charges.
- Only `reference.jpg` was delivered. It is a design target, not a produced model. No GLB or editable source exists for this run.
- The saved review trace contains no strategy, reviews or accepted revision. Its error is HTTP 502 from the inference gateway. Provider metadata confirms the strategy request completed with HTTP 200 before gateway validation failed.

The exact rejected response was not recoverable from the retained trace. An offline reproduction established a contract defect: the tool schema admitted strategies larger than the parser's 6000-byte limit, and a schema-valid oversized mock settled its charge before producing the same HTTP status. This is a plausible cause, not proof of the particular validation branch hit by this run. The subsequent correction aligns generation and parsing bounds, requests a single tool call, and preserves bounded validation diagnostics without storing model prompts or images in logs.

There is no successful improved model to compare. Both approved dispatches are used, although the combined service charge was only $1.16 of the $10 cap. Version 3 remains disabled for public admission. A new paid run requires additional authorization under the explicit two-run scope; neither technical validation nor reference-image quality establishes an improvement in model quality.

## Reproduction and evidence

`scripts/managed-quality-benchmark.mjs` resumes two pre-created jobs from a private manifest, with the bearer token supplied separately. It checks the stored brief, cap, version, and publication settings, records each start attempt before dispatch, refuses an uncertain second start, and bounds same-origin artifact downloads. One `status` command performs one bounded poll. Creation/funding remains an explicit operator action.

Private state, tokens, source files, reference images, and render files are excluded from this report and the repository. A failed delivery and a recovered checkpoint must remain distinguishable in any comparison.
