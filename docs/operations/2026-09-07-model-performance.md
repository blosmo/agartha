# Imported model browser verification

Verified using the actual Three.js viewer and the isolated `scripts/model-view-stress.ts` fixture. Run it with `node --import tsx scripts/model-view-stress.ts`; it prints its local URL and temporary data directory. It publishes the attributed Fox fixture through the local upload API and places 64 animated instances in two temporary rooms. It does not edit `.agartha`.

## Observed results

| View | Instances / templates | Main-pass draws | Triangles | Observed frame average |
| --- | --- | --- | --- | --- |
| Real Fern Hollow, desktop | 1 / 1 | 31 | 18,336 | 8.33 ms |
| Stress fixture, desktop 1280×720 | 32 / 1 | 91 | 43,560 | 8.33 ms |
| Stress fixture, 390×844 viewport | 32 / 1 | 91 | 43,560 | 8.62 ms |
| Neighbor with models visible | 32 / 1 | 79 | 37,680 | 8.33 ms |
| Navigated outside model neighborhood | 0 / 0 | 26 | 5,400 | 8.33 ms |

The viewer displayed the admission notice for the extra instances; the admitted foxes remained visible and animated. The real Fox retained its textured appearance and source credits. Its canvas click opened the correct room and credits. The narrow viewport contained the world, controls and admission notice without horizontal overflow in the inspected screenshot.

A fresh navigation round trip measured 14 geometries and four textures before loading models; loading 32 foxes raised this to 15 geometries and 37 textures. Shared model source size was 162,852 bytes and texture-binding count 1,048,576 pixels. Navigating out returned to exactly 14 geometries and four textures, zero model source bytes/pixels, zero instances and zero templates. Per-instance skeleton textures explain the additional texture count while models are loaded.

These are sampled frame averages from the viewer's 500 ms diagnostics window, not percentile measurements or GPU timings. The narrow viewport ran on desktop hardware; this does not establish physical mobile-device performance. The fixture covers many instances of one small animated asset, not all permitted combinations of high-detail models, textures, meshes and shaders. Hosted deployment remains a separate check. The isolated `/__model-preview` fixture also verified a saved textured fox beside a translucent native fox, sharing one template with two instances. No placeholder primitive appeared.

A regression test additionally verifies that a newly active model can evict lower-priority cached templates rather than being starved by the previous neighborhood. Six ModelLayer tests and script type checks passed after that fix. Temporary stress servers were stopped and the browser was restored to the real Fern Hollow room.

## Hosted verification completed

After explicit approval for the corrected production target, deployed Convex functions to `quaint-ladybug-283`. Schema validation and typechecking passed; no indexes were deleted. The Vercel alias remains `https://agartha-dusky.vercel.app`, on deployment `agartha-k1zvo7t8q-divine-inside.vercel.app`; the Modal renderer is `agartha-world-renderer`.

The live workflow created isolated room `plot-41-41`, uploaded the unmodified Fox through a scoped upload ticket, placed it with Survey animation, verified the downloaded binary SHA-256 against the source file, and rendered time 0 and time 1. The model ID is `model-d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7`. The PNG hashes differ: `9f93e399c6dde5e4a64bc5207ffc3aad4a3f0c9a43e8c7d3aea99c305c2f582e` and `82f56107615458a336dda31c9090059aee704b1463c74b66cbb3523c7b9cb1b4`. Inspected the textured posed Fox in the actual cloud PNG and the production browser. The browser reported one model/template and advancing animation time.

Published an original lathe (`mesh-868c144bbff976f9fc123cfb4e62b23e34929b3e8c05c3062b03eb5accdade6f`) and an OBJ import (`mesh-e1f305d09897465d35d4ade5b60b7827c8a127b9313da8be3a29362611187d07`) through the authenticated hosted library API. Placed both in the same room with ceramic/clay materials. The hosted composite PNG and browser both show the two vases and imported fox. Local artifacts: `/tmp/agartha-hosted-fox-0.png`, `/tmp/agartha-hosted-fox-1.png`, `/tmp/agartha-hosted-modeling.png`.

The user then clarified that the modeling toolkit should provide the essentials for making interesting and beautiful objects headlessly. The proposed next core is recorded in `docs/superpowers/specs/2026-09-07-headless-modeling-essentials.md`; its missing operations are not implied by this release verification.
