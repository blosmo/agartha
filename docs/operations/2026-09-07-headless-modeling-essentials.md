# Headless modeling essentials verification

The user approved the design in `docs/superpowers/specs/2026-09-07-headless-modeling-essentials.md`. Work is on `codex/headless-modeling-essentials`; the repository has no initial commit, so focused source snapshots were used for review.

## Implemented locally

The shared recipe API now constructs rounded boxes, toruses and open circular-section sweeps, alongside the existing extrusions and lathes. Optional construction scale and XYZ degree rotations preserve source dimensions and correct normals. Lathes also support optional shape-preserving cubic profile interpolation with analytic tangent normals. Default recipes retain their previous output.

The PNG API accepts isometric/front/side/top views and canonical focus selections of up to 20 IDs. Focused orthographic views isolate selected parts, while isometric previews retain scene context. Snapshot identity includes rendered content and immutable geometry references, not revision metadata alone.

## Evidence

`npm test && npm run build` passed before the final review-fix batch: protocol89, CLI12, web58, scripts37, Convex61, renderer18, release5 = 280 tests, followed by the complete build. Local API tests ran with loopback access. Later fixes require their own covering tests and fresh rendered evidence.

The isolated `scripts/headless-modeling-demo.ts` workflow publishes recipe meshes, composes a handled lidded vessel and softened bench, and renders each from four angles. It uses temporary world data, leaving the user's `.agartha` rooms unchanged. Source recipes/layout live in `scripts/fixtures/headless-objects.ts`. The workflow also publishes and places the two groups as reusable assemblies.

Actual PNG inspection found and drove fixes for unrelated geometry obscuring focused side views, coarse lathe silhouettes, an upper handle attachment gap, and snapshot collisions between changed geometry at the same revision. The browser showed the composed models with smooth highlights and rounded edges. Observed desktop diagnostics at the default view: 43 renderer draw calls, 22,992 reported triangles, 22 GPU geometries, seven textures, and an 8.33 ms sampled frame average. This is not a physical mobile-device result or a percentile/frame-rate guarantee.

## Review

Task reviews approved the transform math after a slanted-face normal regression test was strengthened, and approved geometry after explicit 0.0001-source-unit precision limits were added. Final review identified three remaining corrections: view-dependent PBR lighting, view-dependent transparency sorting, and rejection of closed sweep paths. All three were fixed and approved on re-review. The covering protocol suite passed 91 tests and renderer suite passed 20 tests; strict checks passed. Fresh GPU renders verified the updated lighting and assembly placement. This report does not claim deployment of the new core yet.


## Final local verification and release boundary

The final isolated run used `/var/folders/p7/18dk5xkj4z94vchn36wy4gr40000gn/T/agartha-headless-demo-SiD5nB`. Both groups were published and placed using the reusable asset endpoint: vessel `asset-dfd953dcc188ef295f9ea3d9e97a142b58e525c1c4c42bf9887e059be947882b`, bench `asset-80244830303683cba12b005c008e80b631b2520bc859ac964dd332f6620b5d52`. All eight view requests succeeded. Images were inspected; the vessel handle now joins its body, the curves are smooth, and focused orthographic views contain no unrelated room geometry. Native Fox front/side/top renders were also inspected at `/tmp/agartha-headless-fox-{front,side,top}.png`.

The real local server was restored at port 5174 after its listener was found stopped. Its tool catalog now advertises lathe, extrude, roundedBox, torus, sweep, transform, and all four preview views. The compiled API passes a native Node ESM import check. The prepared hosted verification script is `scripts/verify-hosted-headless.ts`; its type check passes, but it has not run.

Automatic approval review rejected publishing the expanded core to Modal because release approval beyond the modeling-scope approval was required. No new-core production deployment was made in this attempt. The prior imported-model release remains live. Pending scope is deployment to Vercel Divine Inside/agartha, Convex quaint-ladybug-283, and Modal agartha-world-renderer, followed by the prepared hosted verification.
