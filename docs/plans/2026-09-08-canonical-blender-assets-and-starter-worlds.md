---
title: Canonical Blender assets and crafted starter worlds
date: 2026-09-08
status: planned
---

## Summary

Finish Blender creations by publishing a permanent, verifiable asset bundle into Agartha's shared library. Use that workflow to publish the observatory and rebuild the nine platform starter plots as a coherent collection of detailed miniature landscapes, each designed before modeling and verified in Agartha's actual renderer.

## Requirements

- R1. Finished Blender creations have durable shared GLB, editable source and preview files; another agent can discover, download and reuse them after the worker and its private checkpoint expire.
- R2. Reuse the existing content-addressed `modelId` contract and its renderer validation. Preserve current model and material-library clients.
- R3. Publication exposes a complete immutable manifest only after all expected artifact hashes, sizes and identities are verified. Retries must be safe.
- R4. Publishing intentionally exported artifacts is distinct from private session checkpointing. Never expose a private storage path or silently copy the working project into the public library.
- R5. Write per-world composition plans before generating geometry. Use GPT-6 Astra for art planning, Blender generation and review.
- R6. Upgrade all nine coded starters with distinct silhouettes, purposeful detail, paths and useful open areas. Inspect current hosted ownership and preserve changes made after the captured baseline.
- R7. Enforce existing per-model, room and visible-neighborhood rendering budgets without raising safety limits merely to accept authored content.
- R8. Verify the hosted library and actual browser/headless world views, not only Blender beauty renders. Retain an auditable bounded cost record.

## Grounding and current state

`convex/cloud/models.ts` already persists shared GLBs in Convex storage with SHA-256 IDs, bounded authenticated upload tickets, public discovery and cross-agent placement. `cloud/blender_billing` currently retains owner-private checkpoints for seven days and offers transient artifact downloads. The missing link is durable publication of a finished source/preview bundle and an agent-friendly completion workflow.

The existing observatory has 424 editable Blender objects. Its original GLB has 414 meshes and fails the existing 256-node/64-primitive library limits. Preserve that editable source; produce a separate runtime export with applied modifiers and geometry grouped by material. No limit increase is required.

Live `/api/plots` was captured on September 8 in a private operational evidence file. The central nine plots currently contain 100 objects total, all owned by `platform-seed`; two plots are empty. Local later installations do not represent the hosted baseline. Re-read versions and ownership before writes; do not bootstrap over existing rooms. `api/index.ts` forwards a route allowlist, so new hosted discovery routes need explicit integration.

## Design decisions

### Canonical publication

Keep GLB bytes in the existing `cloudModels` store. Add a compact immutable asset-manifest layer binding a model ID to independently stored source and preview artifacts, creator identity, name/description, license/attribution, optional derivation parent, and artifact hashes/byte counts. Asset identity uses a `bundle-` SHA-256 ID, avoiding the existing procedural `asset-` namespace. It hashes a versioned canonical identity containing creator agent ID, model ID, normalized metadata, artifact descriptors and optional parent; the assigned creation timestamp is outside that identity. Identical GLB bytes can have different editable sources. The existing model's first-uploader attribution remains intact.

Begin publication using an authenticated agent and expected source/preview hashes and sizes. The already validated model ID must exist. Issue a short-lived scoped upload ticket. Stream each artifact through a bounded upload endpoint and validate its file signature and exact expected content. Stage file references privately. Finalize atomically once all expected roles exist; only finalized manifests appear in public list/get/download. Keep source files as downloadable data; the server never opens or executes them.

Use source and preview limits compatible with the existing HTTP upload pattern: source at most 16 MB and PNG preview at most 2 MB per request. Reject oversized files before storing, reserve against a per-agent 128 MB retained-plus-pending source/preview allowance and 64 finalized-plus-pending bundle count, and allow at most two concurrent tickets. Convert reservations to retained usage atomically on first finalize, charge duplicates once and release only still-pending reservations on expiry. These limits are additional to existing model quotas. On expiry reclaim staged files through verified reference checks; finalized storage is independent of Blender checkpoint garbage collection. Mark source/preview blobs with a dedicated canonical-upload media-type parameter so a bounded age-gated `_storage` sweep can discover orphan blobs left by process termination between `storage.store` and stage recording. The sweeper only considers these marked blobs after ticket lifetime plus grace, verifies all staged/final references in the deletion mutation, and never scans/deletes unrelated private storage. Test this crash boundary explicitly. Retry with the same ticket and bytes returns the same role and immutable result. Concurrent duplicate uploads retain one reference and safely dispose only confirmed unreferenced blobs.

Provide a small agent publisher command under `scripts/` that validates local GLB, uploads it via existing model tickets, publishes its source/preview bundle, and returns a canonical asset ID and reuse instructions once complete. The documented fresh-agent flow is remote build → deliberate GLB/source/PNG export → authenticated bounded download with resumable local state → publication → independent canonical verification → worker stop in cleanup. If upload is interrupted, stop compute after durable local downloads and retry publication from those files; never report a canonical creation before finalize. Advertise asset discovery and the publisher workflow in the existing agent capability response and docs. Source sharing is explicit in the command arguments; these requested public starter creations always include source. The command does not read private checkpoint directories or publish arbitrary URLs. Hosted publication is the authoritative shared path; local file saves are not advertised as shared persistence.

### Runtime versus editable geometry

Author named components in Blender. Save the editable source before joining geometry. Exclude cameras, lights and infinite ground from the runtime asset. Apply modifiers and join static mesh geometry by material, retaining material appearance and correct transforms; obtain true Y-up exported bounds for placement. Validate every GLB with `inspectGlb` before upload. Target 6–12 draw groups and 12–18k triangles per whole starter scene, with a total visible collection below 160k triangles, 150 draws and 24 MB GLB bytes, including retained contributions. Use no image textures for these authored assets; otherwise account decoded pixels and sampler bindings below the actual 16,777,216-pixel ceiling. The actual hard byte ceiling remains 32,000,000. Publish one useful standalone component per starter as well as its scene bundle, and prove one independent-agent component placement and source-edit derivative without instancing all library components into the nine-room view.

### Starter composition collection

Use inhabited miniature landscapes with weathered stone, timber joinery, intentional paths and restrained brass accents. The browser camera looks from positive X/positive Z: tall forms belong toward negative X/negative Z and lower detail faces the viewer. Mood must work with the existing global daylight and physically based materials; do not depend on Blender-only lights, volumetrics or procedural textures unavailable in glTF.

All geometry remains within plot bounds. Keep a five-unit-wide central gateway corridor on every edge, and connect the scene's paths to those approaches. Reserve visible open ground for future agents. Preserve the recognizable intent of existing starter contributions while replacing only the explicitly identified platform seed presentation.

| World | Composition plan before creation | Detail and reuse priorities |
| --- | --- | --- |
| The Commons | A timber gathering hall and asymmetric tree grove surround a quiet pond; forked stone paths connect four gateways. The tallest canopy sits at the rear. | Layered island edge, curved pond coping, carved bench ends, roof braces, communal table, bridge planks and planted path bends. |
| Fern Hollow | An ancient leaning tree frames a mossy footbridge and shallow winding stream; the front clearing stays open. | Root buttresses, fern fans, layered low-poly leaves, fallen trunk, mushrooms and exposed banks. Preserve recognizable grove character. |
| Sky Workshop | A curved timber-and-brass canopy shelters an unfinished celestial instrument; a clear assembly yard faces the viewer. | Reuse the optimized observatory instrument where appropriate; workbench, drawers, plan rolls, hanging counterweight and crafted roof structure. |
| Ochre Court | A sunken sandstone court leads through a tall carved arch toward a stepped sundial. | Masonry courses, relief bands, copper inlay, arcaded seating, vessels and sparse dry planting. |
| Rolling Meadow | Contoured grassy terraces wind toward a small crafted windmill on the rear ridge, with ample meadow in front. | Dry-stone wall seams, fence fragments, a narrow stream crossing, blade joinery and three deliberate wildflower patches. |
| A Quiet Beginning | A refined meditation shelter sits between two sculptural trees with a basin and stepping-stone approach. | Layered eaves, fine posts, basin rim, low bench and moss. Calm composition and half the ground available for building. |
| The Next Chapter | An open reading pavilion shows one finished bay and one intentionally unfinished bay around a small reading terrace. | Books, book cart, stacked timbers, roof joinery, bench and planted edge; incompleteness is deliberate, not an empty placeholder. |
| Open Ground | A low walled garden frames a meeting stone and cross-shaped paths around a generous central lawn. | Crafted perimeter seats, low flowers, recessed stone courses and a small entrance marker; no tall mass dominates the open center. |
| Common Future | A tea pavilion and courtyard use matching timber construction with a softer rain-washed palette. | Engraved table, tea vessels, lanterns, stone borders, benches and a sculptural planted corner; retain the existing pavilion's gathering role. |

## Assumptions and boundaries

- The user approved spending. The announced default ceiling for this new work is $10, separate from the completed $2 billing-test budget; a budget-preference question remains available. Stop paid generation at the ceiling and use measured resource lifetimes in the ledger.
- The request authorizes publication of the intentionally created shared assets and upgrade of the named starter content. Other worlds, governance voters, account-wide billing and private user projects are outside this change.
- Use an accurately named studio agent for public attribution. Do not make demonstration identities into governance voters. Use an operator-only internal starter migration for the nine named seed rooms, never a new public ownership bypass. It requires no active human/agent curator, only `platform-seed` object owners, and the immutable captured baseline snapshot/version/content allowlist. Apply each room atomically after normal bounds/model/render/governance validation. Any changed baseline, even a community edit that retains `platform-seed` ownership, stops replacement. Do not simply refresh replacement eligibility.
- Runtime scene GLBs may be consolidated for performance, while source files preserve named editable parts. New geometry variants receive new hashes and optional parent provenance, rather than overwriting an existing asset.
- No new dashboard, lighting engine, renderer-budget increase or general asset marketplace is required.

## Implementation units

- U1. **Immutable hosted asset bundles**
  - Goal/requirements: durable complete publication, R1–R4.
  - Dependencies: existing model upload and storage.
  - Files: `convex/cloud/assetSchema.ts`, `convex/cloud/assets.ts`, `convex/cloud/assetUpload.ts`, `convex/schema.ts`, `convex/http.ts`, `convex/assets.test.ts`, `packages/protocol/src/canonicalAssets.ts` and its test.
  - Approach: authenticated bounded manifest tickets, privately staged uploads, atomic finalize, content-hashed identities, immutable public projections, cleanup independent from project retention.
  - Tests: owner/ticket binding, exact hashes and sizes, malformed PNG/Blender signature, partial invisibility, duplicate/concurrent upload and finalize, expired/revoked credentials, quota reservation release, cleanup versus finalize race, download survival after private checkpoint deletion, public fields excluding tokens/storage internals; retained quota exhaustion through many different source bundles sharing one model; orphan reclamation after store-before-stage process termination.

- U2. **Agent discovery and publication workflow**
  - Goal/requirements: another agent can finish and reuse a model, R1–R4.
  - Dependencies: U1.
  - Files: `convex/cloud/http.ts`, `api/index.ts`, `scripts/publish-blender-asset.ts`, related route/client tests, `apps/web/public/agents/blender-billing.md`, `apps/web/public/agents/glb-models.md` and capability docs.
  - Approach: expose asset begin/finalize/list/get/file operations through the existing gateway; use separate upload credentials only at verified upload endpoints; return stable publication/reuse result; interrupted commands retain resumable local state without printing credentials.
  - Tests: gateway forwarding, structured failures, foreign upload-origin rejection, lost replies, retry safety, distinct agent lookup and placement. A held/private source path must never appear in public output.

- U3. **Optimized observatory and reusable modeling/export workflow**
  - Goal/requirements: persist the completed proof asset and establish economical generation, R1, R5, R7.
  - Dependencies: U1–U2; written composition plans above.
  - Files: reusable Blender export helper under `cloud/blender_mcp/` or `scripts/`, focused geometry/export tests, canonical manifest evidence.
  - Approach: preserve source, convert/join a runtime copy, exclude infinite ground/camera/lights, validate under unchanged limits, publish GLB/source/preview and verify independent downloads after stopping compute. Pack external dependencies, reject unresolved linked libraries, and reopen the downloaded source with factory startup and auto-execution disabled in an independent local Blender process with no worker mounts. Verify named objects/materials and no missing image/library dependencies before claiming portability.
  - Verification: real observatory asset exists in canonical discovery with valid source/preview hashes and a renderable model ID; another agent can fetch it.

- U4. **Nine crafted starter assets and repeatable seeds**
  - Goal/requirements: planned, beautiful starting worlds, R5–R8.
  - Dependencies: U3.
  - Files: per-world authoring recipes and manifest under `scripts/seed/`, `apps/web/plotStore.ts` and relevant tests if first-run seeding needs integration, `docs/operations/` evidence.
  - Approach: Astra authors each planned scene; bounded cloud runs generate and optimize artifacts, publish bundles, then assemble a repeatable starter catalog referencing immutable model IDs. Preserve the original source and preview for every completed scene. Bundle optimized runtime GLBs and a hash-pinned catalog in `apps/web/public/starter-assets/`. A verified catalog installer populates the existing filesystem ModelStore before any first-run plot writes; validate the complete required catalog first, fail closed on missing/corrupt files, and do not overwrite existing plots. Editable sources remain in canonical cloud storage.
  - Verification: all nine plans have resulting verified assets; collection draw/triangle/byte counts meet targets; first-run catalog is reproducible and existing rooms are not overwritten by ordinary boot.

- U5. **Version-checked hosted rollout and visual acceptance**
  - Goal/requirements: shared library and actual starter worlds work for agents/users, R6–R8.
  - Dependencies: U1–U4.
  - Files: `convex/cloud/starterWorlds.ts`, a bounded deployment/seed-upgrade script and tests, operational report/evidence.
  - Approach: capture and retain an immutable baseline allowlist of IDs, versions and object content hashes; a later read is only a concurrency check. The operator-only migration validates the entire named room still matches that baseline, has no active curator, and contains only platform seed ownership. Validate all replacement scene objects/models/budgets and world rules, then swap one room atomically and record a catalog receipt/activity event. This avoids the public proposal API’s 20-change limit without expanding public authority. Stage exact placement payloads first. Retain the original snapshot and post-apply version; rollback is allowed only if the current room exactly matches the migration’s post-state, so later contributions cannot be erased. A conflict stops subsequent rooms. Integrate only scoped source into the deployment bundle and preserve the current main baseline plus existing paid-billing routes.
  - Verification: full browser view and selected close-ups at desktop and 390px, real headless previews, no omitted models due to budgets, canonical source downloads after all workers stop, and distinct agent reuse. Record measured frame timing and geometry counts with device/view context; no unsupported mobile-performance claim. Re-read saved revisions and library manifests after rollout.

## Alternatives considered

Keeping exports only in private seven-day storage would not satisfy persistence or cross-agent reuse. Publishing whole private checkpoints would expose unintended content. Raising model/viewport budgets would hide an export problem and jeopardize a nine-world view. A new storage service or dashboard is unnecessary because the existing Convex library, upload pattern and agent API cover the required foundation.

## Execution risks and acceptance gates

- Partial uploads and lost responses: immutable tickets and verified staged references; publication is incomplete until finalized.
- Public source safety: intentional exported source only, bounded binary download, never server-executed.
- Visual quality: review actual Agartha daylight rendering; a beautiful Blender image alone is insufficient.
- Geometry costs: validate the complete visible collection before hosted placements. Simplify export geometry without discarding editable source.
- Concurrent contributions: refreshed version/ownership checks must fail closed before destructive replacement.
- Deployment continuity: billing changes are currently outside main; a deploy must retain the scoped billing payload and latest-main files. Durable source integration remains tracked and must not be confused with a temporary hosted deployment.


## Dimensioned composition and early visual gate

Coordinates use plot-local X/Z; heights are above the local ground. Hero rectangles below are planning envelopes, not filled collision volumes. Every scene also keeps central edge approaches clear and ties paths to X/Z ±15.5.

| World | Hero center; footprint; height | Secondary mass | Usable clearing and example addition | Standalone shared component |
| --- | --- | --- | --- | --- |
| The Commons | (-5,-5); 11×8; 6 | Pond at (5,0), 8×6; rear grove | X -10…-2, Z 3…11, Y .1; a 3×2 workshop table | Crafted gathering bench |
| Fern Hollow | (-6,-5); 8×8; 9 | Winding stream and low fern banks | X 2…10, Z 3…11, Y .1; a small field-study shelter | Ancient tree and exposed roots |
| Sky Workshop | (-5,-5); 11×8; 7 | Exposed brass instrument at (0,0), 5×5; open canopy front | X 2…10, Z 4…11, Y .1; a 3×3 assembly station | Celestial armillary instrument |
| Ochre Court | (-5,-6); 12×3; 9 | Sunken sundial plaza 18×16 | X -9…-2, Z 5…11, Y -.2; a sculpture pedestal | Carved sandstone arch |
| Rolling Meadow | (-7,-7); 4×4; 9 | Rear terraces reach height 3 | X 2…11, Z 2…11, Y .1; an orchard or small farm stand | Crafted windmill |
| A Quiet Beginning | (-6,-5); 7×3; 6 | Moon gate, low meditation deck and two red maples | X 1…11, Z 2…11, Y .1; a contemplative rock garden | Stone moon gate |
| The Next Chapter | (-6,-5); 10×9; 7 | Fan-shaped open roof ribs, reading terrace and unfinished bay | X 2…11, Z 2…11, Y .1; a new reading bay | Reading bench and book cart |
| Open Ground | (0,0); 5×5; 1.5 | Low geometric boundary garden, no tall centerpiece | X 3…11, Z 3…11, Y .1; a community pavilion | Curved garden bench |
| Common Future | (-6,-5); 11×8; 6 | Sweeping teal tiled roof, tea terrace, pale-flowered corner | X 2…10, Z 3…11, Y .1; a communal tea preparation counter | Tea table and service |

Distinction at neighborhood scale: Commons is an asymmetric pond-and-hall island; Fern is an organic leaning-tree silhouette; Sky is exposed brass machinery under a curved canopy; Ochre is a vertical carved arch; Meadow is a windmill above contoured fields; Quiet is a circular stone moon gate with red foliage; Next is a fan of unfinished timber ribs; Open is a low patterned green garden; Common Future is a sweeping teal roof around a compact courtyard.

Before fine modeling, inspect a nine-panel dimensioned layout and isometric massing contact sheet. Pass only if each hero remains visible from the real positive-X/positive-Z camera, neighboring silhouettes are distinct, the four approaches connect, and the clearing can fit its example addition without covering the hero. Then finish one representative scene and check actual Agartha rendering and budgets before completing the remaining eight. Correct composition at that point rather than relying on tiny props to differentiate repeated pavilions.

## Storage references

Convex supports storing generated files from actions/HTTP actions and retaining their IDs through a mutation; file deletion is available from mutation storage APIs. Public storage URLs act as bearer links and cannot be made private again without deleting the file, so only finalized intentionally public artifacts receive public URLs. See [generated-file storage](https://docs.convex.dev/file-storage/store-files), [StorageWriter](https://docs.convex.dev/api/interfaces/server.StorageWriter), and [storage security model](https://docs.convex.dev/file-storage/overview).
