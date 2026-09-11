---
title: Astra-directed component generation with Meshy
status: completed
date: 2026-09-11
---

# Outcome

Astra plans, coordinates and independently reviews a complete asset or scene. It searches existing components/templates first, uses Blender for assembly and precise geometry, and may request textured Meshy components to fill gaps. Meshy is an explicitly enabled bounded allowance inside an existing managed job. Character rigging is optional. Existing jobs and independent acceptance remain compatible.

# Decisions

- Textures and PBR maps included in every Meshy generation. Pin Meshy 7, 2K textures and GLB; no untextured delivery or Ultra/8K defaults.
- A separate generated single-object reference is inspected by Astra before Meshy dispatch; do not feed a whole courtyard reference to an individual component task.
- Reuse the managed AI hold and single-in-flight operation fence, with a separate Meshy spending ceiling, maximum 1–3 generated assets, optional rigging permission, snapshotted credit rate and a final review reserve. Paid image references remain within the total job budget and are reported separately.
- Poll persisted task IDs; never blindly repeat an ambiguous paid POST. Settle known failed tasks at zero, retain uncertain holds for reconciliation, and allow settlement after cancellation without authorizing new work.
- Provider credentials remain in the trusted gateway. Blender receives validated GLB bytes only. Save imported textured geometry, hierarchy, armatures and animations in the editable source and final GLB.
- Initial implementation uses existing Astra coordination and review. A cheaper bounded implementation worker may be added only with verified model/rate configuration; it cannot accept or publish a scene or enlarge a spending cap.
- No purchase, new external account, paid test generation, or production deployment is implied by implementation. Finish local integration/tests and state any credential or activation dependency.

# Units

## U1 Provider transport
Goal: bounded, replay-safe Meshy start/poll and validated download URLs.
Files: packages/modeling/meshy.ts, scripts/meshyProvider.test.ts.
Approach: use packages/protocol/src/meshy.ts rates/types. Start image-to-3d or rigging through the managed ledger; persist provider task ID before returning; poll via saved stage/id and store a normalized result on terminal status. Do not poll in a long server request. No keys or raw upstream bodies in errors. Rig only an owned successful generation. Fixed API origin and trusted HTTPS asset URLs, no credential forwarding to downloads.
Tests: textured/PBR payload, quote, create replay, poll success/failure, timeout/ambiguous POST, invalid URLs/task IDs/credit overrun, rig parent validation.

## U2 Ledger
Goal: authorization and exact bounded accounting through existing managed holds.
Files: convex/cloud/managedJobSchema.ts, convex/cloud/managedJobs.ts, convex/cloud/billingHttp.ts, convex/meshyJobs.test.ts.
Approach: optional meshy allowance/rate on job creation, separate chargedMeshyCents. Extend inference kinds with asset-reference and meshy; mesh stage/parent on paid operations. Reuse transactional inference claim/completion helpers. Payment-only getManagedMeshyOperation, attachManagedMeshyTask and completeManagedMeshyTask. Add gate and complete/recovery semantics without releasing unresolved provider holds.
Tests: disabled/legacy rejection, owner/idempotence, allowance/count/review reserve, concurrent claims, rig permission and owned parent, stale executor, cancellation then settlement, success/refund/ambiguous holds, existing job compatibility.

## U3 Orchestration and product integration
Goal: Astra can prepare/review/generate/import components in a real managed scene, through human and agent entrypoints.
Files: packages/modeling/{jobs,http,references,studio,quality,inference}.ts, api/blender.ts, cloud/blender_billing/{studio,meshy_exchange,managed}.py, cloud/blender_mcp/components.py, public compute UI/docs, focused tests.
Approach: preserve Astra planning and final critic; add prepare_generated_asset/generate_asset to its action protocol. Prepare an isolated component reference, expose it as a labeled target for a subsequent Astra review, then execute the bounded provider task and optional rig. Import after bounded URL/hash/GLB validation, preserve source provenance and animation, and re-enter normal export/visual acceptance. Expose an optional Meshy allowance/rigging choice and costs in capabilities, job creation and documentation.
Tests: safe payload forwarding, default textures, no generation without allowed/reviewed reference, polling and cancellation, imported armature survival, persisted form replay, unsupported capability, real local HTTP integration and targeted build/checks.

## U4 Verification and documentation
Goal: current plan-based economics and a tested local integration.
Files: docs/operations/2026-09-11-meshy-integration.md and affected discovery/OpenAPI docs.
Tests: focused suites and build, independent review of external API/accounting boundaries. Optional live generation only after a configured key and approved exact spend.

# Pricing evidence

Read live Meshy pricing cards in USD, monthly: Pro $20/1000, Premium $40/3000, Ultra $100/8000, Studio $70/5500. Exclude first-month promotions from regular unit costs. Annual offers observed: Pro $192/year, Premium $384/year, Ultra $960/year; monthly allotments unchanged. Credits expire monthly, so amortized unit cost assumes full utilization. API: textured Meshy 7 =30 credits, rigging=5, separate animation=3. Account invoices/top-ups can override the illustrative rate only through trusted service configuration.
Sources: https://www.meshy.ai/pricing ; https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you-free-vs-pro-vs-premium-vs-ultra ; https://docs.meshy.ai/en/api/pricing ; https://docs.meshy.ai/en/api/image-to-3d ; https://docs.meshy.ai/en/api/rigging .
