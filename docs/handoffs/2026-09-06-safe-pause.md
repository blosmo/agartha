# Agartha — safe pause

Paused at the user's request after the current live benchmark completed. No more load tests, deployment changes, or implementation work should run until the user resumes.

## Completed and verified

- Four interface blockers fixed: legacy mobile layout, destructive object confirmation, reduced-motion handling, and keyboard zoom. Browser verification and 37 web tests passed. The broader interface review still has medium/low findings.
- vgpu 0.4 headless renderer integrated with the local Preview image action and `/api/world/preview`. Actual Metal GPU rendered the world and a synthetic 10,000-object scene in four draws. Same-revision requests coalesce; worker runs are bounded and cached. Interactive viewport remains Three.js.
- Authenticated Convex v2 scene authority deployed to existing development deployment `striped-eagle-66`. Per-object revisions, ownership, invitations, private reads, per-agent rate/object quotas, retry receipts, region pagination, retention cleanup. Existing local and cellular worlds were not migrated.
- User explicitly approved configuring the development operator secret and creating an isolated private world with 1,000 test credentials. Provisioning completed with 1,000 successes and no failures. Authenticated metadata GET=200; anonymous=401.
- Live benchmarks completed, each with 1,000 distinct identities and read-back verification. Latest: 256 concurrent HTTP clients, ten objects/edit, 10,000 objects verified, 112 verified edits/s, p95 4.46 seconds, 1,000 HTTP 200 responses. Complete results: `docs/benchmarks/2026-09-06-scene-capacity.json`.
- Most recent source change batches independent database operations inside one atomic edit. Its 21 Convex tests and scene typecheck passed before deployment. Earlier complete checks: protocol 10, CLI 12, web 37, scripts 8, Convex 21, renderer 3 (91 total). One original mock-scale run timed out; the test was changed to bounded groups of 50 with a 120-second ceiling and passed afterward. Full build passed before the final backend optimization; scene typecheck passed after it.

## Running / retained state

- Local Vite app remains at `http://127.0.0.1:5174/` for the user's browser.
- The approved live benchmark and provisioning jobs have completed; no load job needs resuming.
- Private test world: `scale-check-mtp9cell` in the development deployment. Four benchmark runs added 22,000 test objects in total.
- Credentials are in ignored `.agartha/scene-operator.json`, `.agartha/scene-staging.json`, and `.agartha/scene-load-agents.json`. Treat contents as secrets; never print or commit them. Created with mode 0600. Test agent credentials expire after seven days; curator after 30 days. Operator credential is configured remotely and retained locally.
- No automatic resumption or recurring load test was scheduled.

## Remaining work / honest limits

- The proposed 5,000-agent workload target of ~167 ten-object edits/s is NOT met by the measured ten-object bursts. Batching increased measured throughput from 91 to 112 edits/s, but p95 worsened from 3.61s to 4.46s. Do not describe this as production capacity proven.
- No sustained-load, 5,000-identity, persistent-subscription fanout or production deployment validation has been completed. Next performance step is server-side measurement of function latency, database bandwidth/OCC and deployment limits before changing architecture or purchasing capacity.
- The user-facing app and Copy agent prompt still use the local world. Hosted invitation prompts can be generated through `npm run scene:admin -- invite WORLD OUTPUT_FILE`; hosted UI/curator sessions and regional subscriptions are not integrated.
- vgpu renders locally. A hosted render-worker queue and private artifact storage remain unprovisioned. Follow `docs/operations/vgpu-rendering.md`.
- Lower-priority interface findings remain in `docs/reviews/2026-09-06-interface-review.md`.
- Workspace originally had no Git metadata; no commit/push was performed.

## Relevant entrypoints

- `convex/scene/authority.ts`, `schema.ts`, `http.ts`, `maintenance.ts`
- `scripts/scene-admin.ts`, `scripts/scene-load.ts`
- `packages/renderer/scene.ts`, `render.ts`, `world.wgsl`
- `apps/web/worldPreview.ts`, `apps/web/worldServer.ts`
- `apps/web/src/worlds/WorldViewport.tsx`, `ConfirmObjectRemoval.tsx`, `WorldSpace.tsx`
- `docs/protocol/hosted-scene-api.md`, `docs/plans/2026-09-06-scalable-shared-worlds.md`


Resumed later on 2026-09-06 at the user’s request. Connected plots, creation tools, and shared assets/shaders were subsequently implemented; see docs/protocol/connected-plots-and-library.md and STRATEGY.md for the current state.
