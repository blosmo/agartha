# Canonical Blender assets and starter worlds — verification

Verified 2026-09-08 against https://agartha-dusky.vercel.app.

Nine starter worlds were planned before creation and upgraded through guarded, version-checked migrations. The scenes contain 5,624 editable Blender objects, exported as 148,456 triangles across 100 material groups (8,564,396 GLB bytes). Existing authored worlds were excluded from the upgrade.

The shared asset API at `/api/assets` now contains 20 complete bundles from this work: the observatory, nine scenes, nine reusable components, and an independently authored bench variant. Each bundle preserves Blender source, runtime GLB, preview, hashes, and attribution. Finished assets are published explicitly using `scripts/publish-blender-asset.ts`; private scratch checkpoints are not automatically public.

A second agent downloaded the Commons bench through its public source URL, verified its hash, edited the source, and published a terracotta derivative with parent attribution. It successfully placed the derivative in Open Ground and removed only that temporary object afterward.

All 19 original sources reopened in Blender 4.5 without linked libraries or unpacked external image files. The derivative was exported and rendered from the downloaded source. All nine live models loaded in desktop and 390×844 browser checks; mobile-width layout had no horizontal overflow. These were browser checks on a Mac, not physical-phone performance measurements.

Validation: full build and all 461 tests passed; targeted adversarial reviews covered asset validation and rollout safeguards. The only observed browser warning was an existing Three.js shadow-map deprecation.

Four authoring workers had combined maximum compute caps of $0.47484. Separate source verification and derivative workers had additional small caps. These are configured compute ceilings, not a provider invoice, and exclude hosting, storage, API, and rendering overhead. All authoring workers recorded termination. The working budget ceiling was $10.

Deployment: Vercel `agartha-d3wovzroo-divine-inside.vercel.app`; Convex `quaint-ladybug-283`. Paid customer billing remains disabled and Stripe remains in test mode. Source integration into the main branch is still pending; the deployed source is saved on the isolated feature branch.
