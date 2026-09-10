# Service-owned managed modeling

The user approved making the service responsible for planning, creation, review, and delivery. The ordinary client supplies a brief, optional reference preference, and a total budget. Direct Blender remains an explicit advanced interface. This follows the elephant feedback: low-detail primitives, insufficient anatomical development, and an accidental direct workflow produced an unsatisfactory model.

## Contract

- Make `/skill.md` and `/llms.txt` on `3dforagents.com` lead to a short managed quickstart; keep Agartha's room onboarding on its own origin. Put Direct Blender instructions in a separate advanced document.
- New jobs use workflow version 3 after the deployment setting `AGARTHA_MANAGED_WORKFLOW_VERSION=3` is activated. For pre-release verification, enable only the authenticated initiating identity in `AGARTHA_MANAGED_WORKFLOW_OPERATOR_AGENT_ID`. Persist the version on creation; existing jobs and retries retain their original version and reference choice.
- For version 3, omitted `referenceMode` means generated references when the approved cap is at least 500 cents and `AGARTHA_REFERENCE_MODELING_ENABLED=true`; explicit `none` remains supported. The total cap never increases. Configure these settings consistently on Convex and Vercel after compatible code is deployed.
- Keep the existing 100–2000-cent admission range, authentication, owner isolation, payment modes, cancellation, settlement, quotas, and publication opt-ins. Small caps may not cover a reviewed final result; report a partial/failed outcome rather than silently accepting a draft.

## Service strategy and acceptance

Version 3 uses the existing studio executor with or without generated references. Before starting Blender compute, a dedicated Astra request produces a bounded modeling strategy: subject class, intended style/use, geometry approach, proportions, ordered stages, and observable acceptance checks. Organic forms require deliberate profiles, connected anatomical masses where appropriate, sufficient silhouette tessellation, and anatomy-specific review. Primitives are a blockout, except when the brief explicitly requests that style. Materials and render resolution cannot substitute for form.

When the modeler asks to accept a candidate, the service imports the exported GLB into an isolated neutral scene, gathers fresh hero/front/right views, and sends them to a separate Astra reviewer with the brief, strategy, and references. The editable source and its materials remain unchanged. This ensures the critic sees portable delivery materials rather than unsupported source-only shader effects. It does not send the modeler's claims or editing history. The reviewer returns structured evidence for silhouette, proportions, construction, materials, and presentation, plus prioritized defects. Acceptance is derived from passing every criterion and having no blocking/major defects. A rejected candidate must be revised before another paid review. Each review is tied to a candidate revision and SHA-256 of its exported GLB. A successful file export or modeler `accept` action alone is insufficient.

Use the existing bounded inference ledger for strategy and review operations, with explicit operation kinds and no automatic redispatch after uncertain results. Reserve reviewer allowance before admitting further modeling output. If another modeling request cannot be admitted before dispatch, use that reserve once to review an existing unreviewed candidate under the same acceptance rules; uncertain inference failures do not trigger another request. Preserve accepted artifacts separately from candidates, invalidate acceptance after a mutation, require a verified checkpoint before completion, and retain useful files with honest limitations on budget/deadline failure. A final higher-resolution render must not replace reviewed geometry with an unreviewed export.

Keep the strategy and review decisions in authenticated `review.json`, including jobs without generated references. Its retention, size, and download authorization follow existing artifact rules. Independent model review is evidence, not an objective guarantee of artistic quality.

## Benchmark and release

The user approved a maximum of $10 in provider spend: one old-workflow elephant run capped at $5 and one improved-workflow run capped at $5. Use existing operator accounts and the test-only verification wallet; no customer checkout, live-balance adjustment, public asset publication, or unlimited retries. Record exact prompts, versions, actual settled/unknown costs, artifacts, and visible defects. Inspect the exported GLBs and real renders. Compare the workflows under the same brief and cap, acknowledging that the improved default includes references. Do not describe locally authored stand-ins as service output.

Do not add a neural 3D provider in this change. If the benchmark still fails the visual bar, document that result and identify the backend evaluation needed rather than calling the default fixed.

Deploy compatible gateway inference, Convex schema/functions, and Modal broker code before activating version 3. Keep existing jobs compatible. Verify public discovery and a real improved run, then merge the tested source and verify the web rollout. Preserve unrelated local work and do not publish benchmark assets without explicit authorization.
