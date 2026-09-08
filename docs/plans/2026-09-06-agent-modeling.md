# Agent modeling and imported assets

Goal: Agents can import assets and model original 3D assets; the living shared world remains performant.

Completion requires more than a parser: imported and authored geometry must be publishable, placeable, reusable, visible in the live grid and agent previews, and documented for visiting agents. Verify persistence, ownership, bounds, material fidelity, animation, resource disposal and measurable scene budgets.

Implementation sequence:
1. A bounded indexed mesh format and OBJ import with clear unsupported-input errors.
2. Mesh library entries, immutable IDs, normalized bounds, placement and cloud/local parity.
3. Shared browser geometry cache, instancing and preview renderer support.
4. GLB import preserving useful materials and supported animation; explicit capabilities and limits.
5. Agent modeling helpers and instructions, imported and original demonstration objects in rooms.
6. Browser/PNG verification and performance measurements with repeated assets and animated scenes.

Current status: complete for the original goal and the user-approved headless-essential core. Local and hosted imports, original modeling, materials, animation, reusable assemblies, inspection views and bounded performance have been verified. See `docs/operations/2026-09-07-modeling-completion-audit.md`. The progress entries below are historical checkpoints.

## GLB import progress

Added a bounded GLB container/accessor reader, image/resource inspection, hierarchy and skin checks, animation metadata validation, and immutable local binary model storage. The local `/api/models` upload/list/content routes retain original GLB bytes and provenance. Verified with the unmodified attributed Khronos Fox sample: 576 triangles, one embedded texture, one skin, and Survey/Walk/Run clips. Local GLB placement, playback and matching posed PNG previews are implemented; hosted model storage remains unfinished.

Added room rendering cost accounting for instances, draw groups and animated triangle work. Local plot writes now enforce budgets before saving, with a tested atomic rejection at the triangle limit. Hosted enforcement, aggregate visible-region limits and measured runtime performance remain to be completed.

## Native playback progress

Local room objects now accept imported model IDs and named animation clips. Native Three.js GLTFLoader/SkeletonUtils preserve embedded materials, hierarchy and skins; geometry/textures are shared and per-instance skeletons/material clipping are disposed separately. The Fox is placed in Fern Hollow with Survey playback. Browser frames change during playback and settle identically under reduced motion. ModelLayer tests verify one load for repeated instances and pause/resume without playhead reset. Source credits appear in room details.

Remaining: hosted model upload/storage/placement; robust aggregate visible-region resource admission/cancellation and stress measurements. Native models are fitted from sampled clip envelopes and clipped to their placement box; verify extreme imported poses and improve envelope handling as needed. Canvas diagnostics report draw calls, triangles, frame time and model/template counts. A single-Fox baseline reported 31 draws, 18,192 triangles and roughly 8.33 ms frame cadence; this is not a scene-scale stress result.

## Native preview verification

The server now loads GLB data with the same Three.js loader and shared fitting envelope, bakes skinned/morph geometry at a requested time, and renders embedded material maps with vgpu. It handles PNG/JPEG textures, alpha settings, secondary UVs, UV transforms and vertex colors. Local preview snapshots include deduplicated GLB data; room updates still carry references only. `time=0..120` and `focus=OBJECT_ID` select animation frames and close-ups, and both affect snapshot cache identity.

Verified the real Fox in room and focused PNGs at time0 and time1. Both returned room revision1 with different snapshot IDs and image hashes. Inspected the resulting images and a mixed PBR/shader/custom-mesh grid regression image. Renderer tests15, protocol64, script30 and Convex55 passed; full build passed. Added server dependencies Three.js/jpeg-js and prepared the renderer image definition for its next deployment. Hosted model file resolution and scene-scale admission/stress verification remain.


## Hosted imports and browser lifecycle

Implemented Convex model storage with five-minute scoped upload tickets, binary validation, immutable content IDs, deduplication, per-agent storage quotas, and public provenance. Model references now work through hosted room edits, assemblies, and proposals. The gateway resolves model files for PNG rendering without forwarding private credentials to storage. The hosted tool catalog advertises the ticket workflow; the GLB guide documents both upload paths. This code has not been deployed.

Backend tests cover upload, deduplication, placement, attribution, revoked/expired credentials, ticket reuse with different content, and atomic rejection of an over-budget model batch. Gateway tests cover model redirects, deduplicated preview data, and credential isolation. Browser unit tests cover shared resources, pause/resume, obsolete-download cancellation, bounded instance admission, and native translucent proposal models preserving alpha masks. Saved models now expose selection references. New assets decode sequentially, and active-room models receive admission priority.

Web production build and scene/scripts type checks pass. Fresh browser verification of these latest changes is blocked by the locked Mac. Remaining: measured desktop/mobile stress tests, aggregate decoded-memory/triangle/draw admission across the visible neighborhood, and final live hosted verification after deployment. Count limits and unit tests do not establish those performance results.


Added model-layer admission by source bytes, texture-binding pixels, per-instance triangles/draws, and animated triangles. Inspecting binary metadata precedes native image/geometry decoding; in-flight reservations count toward shared limits. The GLB inspector now reports texture-binding pixels, including distinct sampler bindings. Browser tests cover resource thresholds, repeated expensive instances, and paused animation cost. Seven browser tests and web/scene/scripts builds pass. The Mac remains locked, so limits are engineering bounds awaiting measured runtime tuning; they are not a frame-rate guarantee or a whole-scene GPU-memory measurement.

## Verification checkpoint — 2026-09-07

Current integration results: protocol 64, CLI 12, web 57, scripts 32, Convex 61, renderer 15, release checks 5: 246 passing tests. The initial combined run stopped at five loopback-listener EPERM failures; those exact local API tests passed with loopback access, and the remaining suites were run separately. This is not an uninterrupted `npm test` success and does not include Rust tests or a deployed cloud check.

Completion remains unproven. Imported/authored geometry and native animation are implemented with local examples and API/renderer evidence, but the latest ghost/selection/admission changes still need visual verification. Busy-scene desktop/mobile frame times, resource cleanup during navigation, and fidelity under multiple animated imports need live browser evidence. Hosted storage and rendering code has not been deployed or verified against a live hosted installation. Three browser-access checks returned a locked Mac; further visual/performance verification requires it to be unlocked.


Browser access resumed. See `docs/operations/2026-09-07-model-performance.md` for actual 32-instance animation, 390×844 viewport, GPU-resource cleanup, and native ghost-preview observations. Added reproducible isolated `scripts/model-view-stress.ts`. The hosted Vercel target is Divine Inside/agartha, production alias `https://agartha-dusky.vercel.app`; the current production deployment predates these changes. Local public Convex configuration points to striped-eagle-66, but its role as the production gateway target has not been independently confirmed. No production secrets were retrieved and no deployment was performed.

Live public catalog check: `GET https://agartha-dusky.vercel.app/api/plots/the-commons/tools` returned HTTP 200 with neither `models` nor `meshes` advertised. Hosted support is therefore not verified as deployed. Production-backend confirmation and release authorization are pending; no hosted writes were made.


## Approved release attempt and corrected target — 2026-09-07

The user approved the proposed release. Modal `agartha-world-renderer` deployed successfully, with service URL `https://blosmo--agartha-world-renderer-service.modal.run`. The configured development target `striped-eagle-66` was updated using `convex dev --once`; a new `convex/tsconfig.json` connects CLI checks to the existing project configuration.

The first Vercel release failed at API invocation due to extensionless native ESM imports in the material catalog dependency. Added explicit `.js` imports and `api/tsconfig.json`; confirmed the compiled API loads under native Node and nine gateway/docs tests pass. The corrected production release is `https://agartha-k1zvo7t8q-divine-inside.vercel.app`, aliased to `https://agartha-dusky.vercel.app`. Public tools return HTTP 200 again. Automatic review rejected the attempted rollback; the issue was resolved by deploying the corrected build under the existing release approval.

A narrowly scoped Vercel environment lookup, without retrieving other decrypted values, proved `AGARTHA_CONVEX_SITE_URL` points to `quaint-ladybug-283.convex.site`. This differs from the development target previously confirmed by the user. A production Convex dry run verified the same target and passed schema/type checks with no index deletions. Automatic review rejected the actual publish because approval named the other deployment. Production Convex remains unchanged, and the live tool catalog still lacks models/meshes. The next required action is explicit approval to deploy to `quaint-ladybug-283`.

Prepared `scripts/verify-hosted-model.py` for the subsequent authorized live upload/placement/download/PNG checks. It has not run. It retains retry credentials privately under ignored `.agartha`, never prints them, restricts the upload token to the confirmed production Convex host, and writes only the resulting preview PNGs to `/tmp`.

Production Convex is now deployed following the user's explicit approval for quaint-ladybug-283. Live GLB upload, immutable download, animation, two PNG poses, original lathe publication, OBJ publication, and both mesh placements passed; production browser and cloud PNGs were inspected. See the updated operation report. The user's subsequent headless-essentials direction is preserved in `docs/superpowers/specs/2026-09-07-headless-modeling-essentials.md`; rounded forms, sweeps, full-axis construction transforms and explicit inspection views remain proposed work, so the broader active goal is not marked complete.


The user approved the headless-essentials design. The new core is implemented and locally verified, including actual GPU renders and reusable assembly placement; full integration/build and final covering checks passed. See `docs/operations/2026-09-07-headless-modeling-essentials.md`. Production release of the expanded core is pending explicit approval after automatic review rejected the Modal publish; no new-core deployment was made.


Final release is deployed and verified following explicit approval. The completion audit maps every requirement to source/test/runtime evidence and records the performance limits of that evidence. All approved headless-core tasks are complete.
