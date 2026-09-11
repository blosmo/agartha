# Poly Haven reuse verification

## Implemented behavior

Managed modeling can search Poly Haven and import an appropriate static model before authoring new geometry. Agartha's shared library and templates remain the first reuse options. The same client is available as a local JSON CLI. Existing bundled Poly Haven surface materials remain available; live HDRI and texture browsing are outside this change.

Downloads use a dedicated public HTTP client, known Poly Haven hosts, no redirects, size/hash checks, a cumulative byte cap, deadlines and managed cancellation checks. The client packages 1K glTF dependencies into an embedded GLB without opening downloaded Blender source. Provider failures are recoverable modeling actions. Candidate rendering, acceptance, budgets, and explicit public-sharing controls remain unchanged.

Source identity, artist credit and license are retained in the import event and editable component. A visible Poly Haven credit appears beside managed creation. Exported Blender source is the imported mesh representation, not the original artist's authoring file.

## Live source and local renderer evidence

Public API catalog and file manifests were fetched with `User-Agent: Agartha-3DForAgents/1.0`. Both final prepared files passed the existing `inspectGlb` validator and were rendered using Agartha's native vgpu model renderer.

| Model | Source | Prepared bytes | Triangles | Draws | Embedded textures |
| --- | --- | ---: | ---: | ---: | --- |
| Dirty Football | https://polyhaven.com/a/dirty_football | 1,993,904 | 19,998 | 1 | 3 JPEGs at 1024 x 1024 |
| Bar Chair Round 01 | https://polyhaven.com/a/bar_chair_round_01 | 2,811,404 | 14,373 | 1 | 3 JPEGs at 1024 x 1024 |

The football imported into local Blender 5.2.1 with packed materials, duplicated as a component, exported, and reopened with script execution disabled. The expanded `scripts/blender/verify_components.py` also checks that external provider identity, artist attribution and prepared model hash survive duplication, assembly inspection, export and reopening.

Provider/CLI tests cover pagination, caching, redirects, credentials, checksums, dependency allowlisting, unsupported formats, texture limits, network failure, malformed data, deadlines, cancellation, atomic output and JSON errors. Managed-flow tests exercise search, download/upload binding, rendered-candidate acceptance and recovery after provider failure.

No paid managed generation or production deployment was performed for this verification. Local native rendering required GPU access outside the shell sandbox. Network and loopback restrictions in the sandbox are not product failures.

## Rollout and post-deploy validation

Deploy as a coordinated worker, broker and web/gateway change. Rebuild the Blender worker image so it includes the updated `cloud/blender_mcp/components.py`; drain old workers and update the configured `AGARTHA_PAID_BLENDER_IMAGE_ID` before enabling new jobs on the updated broker and action prompt. Retain unrelated current production changes.

After deployment, verify the visible Poly Haven credit and `/agents/polyhaven.md`. With an explicitly authorized managed-job budget, request a suitable prop, check `search_polyhaven` and `load_polyhaven` events in `review.json`, verify the source page/CC0/artist credit, and inspect the delivered GLB and editable source. Check that a deliberately unavailable asset produces a recoverable action error and the job can continue.

For the first deployment and next day of real use, the deploying operator should watch action errors containing `Poly Haven`, job failures, deadline errors, and download/import latency. Healthy: suitable assets load, source metadata is present, normal visual review remains required, and provider outages do not fail entire jobs. Roll back the coordinated release or disable the new prompt/actions if optional-provider failures end jobs, imports lose materials, or a worker helper is unavailable. No catalog migration or automatic public asset publication is part of rollout.
