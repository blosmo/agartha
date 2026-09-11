# Astra-directed Meshy components

Astra remains the planner, scene coordinator and independent final reviewer. It searches the shared library, builds precise geometry and assembles components in Blender, and can fill missing parts with textured Meshy assets. This version uses Astra for existing modeling turns too. A cheaper implementation model is not enabled.

## Cost basis

Regular USD monthly subscription prices checked September 11, 2026. These estimates assume all monthly credits are used and exclude promotional discounts. Unused subscription capacity raises effective unit cost. Each provider operation is rounded upward to a whole cent for job accounting.

| Subscription | Monthly price / credits | Textured Meshy 7, 30 credits | Rigging, 5 credits | Textured + rigged, billed cents |
| --- | --- | --- | --- | --- |
| Pro | $20 / 1,000 | $0.60 | $0.10 | $0.70 |
| Premium | $40 / 3,000 | $0.40 | $0.0667 | $0.47 |
| Ultra | $100 / 8,000 | $0.375 | $0.0625 | $0.45 |
| Studio | $70 / 5,500 | $0.3818 | $0.0636 | $0.46 |

Single-component image references, Astra turns, Blender compute and the independent review also consume the total job budget. Meshy's allowance is a sublimit within that budget. It does not fund those other operations and does not guarantee every allowed asset will fit. Failed provider tasks settle at zero. The service must configure the plan matching its actual cost basis before enabling jobs.

Sources: [live subscription plans](https://www.meshy.ai/pricing), [plan comparison](https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you-free-vs-pro-vs-premium-vs-ultra), [API pricing](https://docs.meshy.ai/en/api/pricing), [image-to-3D contract](https://docs.meshy.ai/en/api/image-to-3d), [rigging contract](https://docs.meshy.ai/en/api/rigging).

## Deployment and activation

Implementation is feature gated. No paid generation is needed for automated tests.

1. Deploy the backward-compatible Convex schema and ledger handlers first.
2. Deploy the gateway and Blender broker/worker code. Workers need the generated-component importer packaged alongside existing Blender helpers.
3. Configure `MESHY_API_KEY` on the trusted gateway only. Do not put it in browser configuration, job requests, Blender code or logs.
4. Configure `AGARTHA_MESHY_PLAN` to one of `pro-monthly`, `premium-monthly`, `ultra-monthly`, `studio-monthly`. Default is Pro; an unknown value disables Meshy admission.
5. Set `AGARTHA_MESHY_ENABLED=true` only after credentials, plan and an explicit bounded live validation are approved. Managed workflow version 3 must already be enabled for the caller.
6. Read `/api/blender/capabilities` with that caller's identity, then submit a job with `meshyAllowance`. Poll and start the same job through the existing API. Inspect the exported GLB, editable BLEND and independent review before calling activation validated.

Example additional create-job property:

```json
{"meshyAllowance":{"budgetCents":100,"maxAssets":1,"allowRigging":true}}
```

The ordinary total `budgetCents` still applies. The ledger reserves at least $1 for independent review before admitting Meshy work. Disable new work by clearing `AGARTHA_MESHY_ENABLED`; keep the key available until previously dispatched tasks have reconciled. The job stores its original rate so a later configuration change does not reprice running tasks.

## Recovery

The provider POST is issued once per durable operation. Retrying the same operation returns its stored task or result; changing its payload is rejected. A transport failure before a task ID was saved is ambiguous and stops the job with that operation's funds held. It must be reconciled against the provider account; never blindly create a replacement task.

Known task IDs are polled by the existing broker recovery cycle after job cancellation or expiry. Recovery may settle charges or refunds but cannot create tasks. Canceling the job stops further work; it cannot undo a provider task already running. Incompatible usage or untrusted result URLs keep the hold unresolved for operator investigation rather than inventing a charge.

Generated GLBs and their reference/provenance are stored privately with the managed job before import. Final deliverables use the existing job artifact API and retention policy. Provider URLs can expire, so download successful assets promptly. Rigging is limited to suitable humanoid bipeds; custom motion generation is outside this integration. Normal scene edits and final exported-model inspection still determine acceptance.

## Local verification

- Production build passed, including script and Convex type checks.
- All npm test stages passed: 899 tests across protocol, CLI, web, scripts, billing, playground, Convex, renderer and release checks. Local-server suites required localhost access outside the sandbox.
- Python managed/studio/exchange tests passed. Retry tests model the broker's cached error responses and confirm one paid task with distinct Blender retry attempts.
- Real Blender 5.2.1 emitted `GENERATED_COMPONENTS_BLENDER_ROUNDTRIP_OK`. The fixture checks embedded textures, skinning, animation, shape-key targets, parent transforms, source exclusion and idempotent import behavior.
- Focused independent review found and resolved the image-response limit, recovery starvation and cached-error retry issues.
- Browser visual inspection was unavailable because the browser tool timed out. Form submission, disabled capabilities, bounds and saved-request replay have automated coverage.
- No paid Meshy calls, subscription purchase, production deployment or live activation were performed.
