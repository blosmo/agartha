# Lumen Garden Station benchmark

Status: live and verified on 2026-09-11. Release branch includes the merged managed-quality backend from `4a3fa449` without enabling workflow version 3.

## Delivered

A 31.5 × 31.5 m courtyard with a two-level cafe, textured limestone and bronze, layered planting, reflecting water, an orbital lantern and a separate pod following a circular route. The source is original procedural Blender geometry. Shared catalog material maps are CC0. A generated original concept and inspected Helion City views guided the design; neither the concept nor Blender renders are presented as browser evidence.

Reusable controls:

- Versioned creator/curator room atmosphere through the existing APIs: daylight, golden-hour and moonlit, with bounded sun direction, exposure, haze and bloom. A reset restores existing room lighting.
- Relative waypoint paths with constant-distance playback, loop/pingpong, phase and optional tangent orientation. Full swept bounds still obey room and gateway limits.
- Active-room lighting with a small static reflection probe and optional bounded bloom. Late neighbor responses cannot change the selected atmosphere.
- Complete environment/path data and timed poses in PNG previews. PNG lighting is explicitly approximate; browser shadows, reflections and bloom remain the visual acceptance source.
- Opt-in exact static fitting through `scenes[scene].extras.agarthaExactBounds: true`. Existing assets preserve their historical 5% fitting margin, and animated envelopes retain their safety margin.

## Evidence

- Local room: `http://127.0.0.1:5186/?plot=plot-4--3`.
- Nine models loaded in the actual browser, approximately 13.14 MB total, 83,032 triangles and 65 model draw groups. Editable source is 15,869,698 bytes, below the 16 MB limit.
- Inspected focused overview and walking-height entry. All four boundary approaches remain clear under the placement contract.
- Independent mesh sweep found pod collisions with the cafe corner and three visitors. The ground facade was set back 1.2 m, interior details 0.9 m, and visitors moved onto pedestrian paving. Reloading the saved source and checking 720 poses on the exact 32-segment route found zero above-ground scenery intersections. Track and floor contact surfaces were excluded from collision checks.
- Browser atmosphere round trip: golden-hour → moonlit → reset/default → golden-hour. Observed `environmentPreset` and bloom values matched each saved state; reset disposed bloom and restored the existing appearance.
- Browser reduced-motion verification: native clip clock `557.096` and path clock `557.151` stayed unchanged across separate observations, then playback was restored.
- Actual local PNG requests at time 0 and time 2 rendered successfully; inspected both images and confirmed pod displacement. Artifacts remain in ignored `.agartha/lumen-garden/`.
- Current baseline was checked against `origin/main`: `496386f53954aaa64c3708d370c7f9c3999ed5e8`.

## Verification results

Production build passed, including web, protocol, CLI, script and Convex typechecks. Protocol: 128 tests; CLI: 12; web: 147; scripts: 237; billing: 5. Renderer, playground, release and Rust suites passed. Convex's 227 ordinary tests passed; its one Python/HTTP integration test passed when rerun with localhost access. The full script suite passed with localhost access after a transient chat timing failure passed on retry. A compatibility test caught the historical starter-grounding assumption and led to opt-in fitting instead of changing old assets globally.

## Publication sequence

1. Approved targets: Convex `quaint-ladybug-283`, Modal `agartha-world-renderer`, Vercel Agartha production and publication of the reviewed assets/new room.
2. Deploy the additive backend, then the updated PNG worker, then the browser/API and documentation from the current baseline.
3. Publish one complete canonical scene/source/preview bundle, one small animated-water bundle and eight model components that link to the complete editable source. Avoid duplicating the 15.87 MB source for every component.
4. Discover an empty cell near the mall, preserve current ownership/version checks, save the nine-object composition and environment, then read it back.
5. Inspect the actual hosted room, timed PNGs, model counts and motion before marking this document live.

## Limits

The result remains stylized and less densely detailed than the photographic concept and Helion reference. Transit is decorative: there is no boarding or moving-platform simulation. The reflection probe is static between scene changes. Audio, weather particles and a renderer migration are outside this benchmark. No live-performance improvement is claimed from the local frame measurements.

## Live release evidence

- Room: https://www.agartha.place/?plot=plot-4--3. All nine room objects loaded in the actual public browser. Inspected the overview and walking-height entry; golden-hour exposure 0.9 and bloom 0.12 matched the saved environment.
- Convex `quaint-ladybug-283` and Modal `agartha-world-renderer` deployed successfully. Vercel production candidate `agartha-5ihq36idp-divine-inside.vercel.app` was promoted after all code, security, Blender and automated-review checks passed.
- Both canonical source bundles and eight reusable components are published. All nine downloaded component/water GLBs match their local SHA-256 hashes, totaling 13,136,700 bytes.
- Public top-view previews at times 0 and 2 returned valid PNGs, distinct snapshot hashes and the explicit approximate-lighting header. Visual inspection confirmed pod displacement and preserved composition.
- Reduced-motion emulation held native and path clocks fixed across observations. The emulation was removed afterward.
- Re-running the publisher preserved room snapshot `82b2bda7f3cb63d37b4e8b58de31cfd293228f84cfab88d1c95f76cc54a003b1` without writes.
- Integrated verification passed: protocol 129, CLI 12, web 151, scripts 300, billing 5, playground 3, Convex 238, renderer 25 and release 5 tests; production build passed. Hosted checks also covered Python and Rust.
- The neighborhood reaches the existing 16-model display budget, so some neighboring models are hidden. All nine Lumen models remain loaded. This is not a claim that the entire surrounding grid is rendered without limits.

## Repeat the visual baseline

Run `node --import tsx scripts/verify-lumen-garden.ts https://www.agartha.place PATH_TO_OUTPUT` with `AGARTHA_TOKEN` set to a registered agent token. The local operator identity is a fallback when available. The checked-in `scripts/seed/lumen_manifest.json` records public model IDs and transforms, so source binaries are not required to run the check.

The command verifies the fixed golden-hour atmosphere and composition, isolates the room from neighboring edits, captures a top camera at times 0 and 2, and saves PNGs plus snapshot/image hashes. It fails if the room changes during capture. Compare images visually before accepting a new baseline. PNGs approximate lighting; use the browser's Focus plot and Enter room controls for the corresponding overview and entry checks. Keep day/moonlit/reset round trips in a local fixture so testing does not change the public room.

The original source and water source can be retrieved through their published bundle manifests. See the public IDs in `scripts/seed/lumen_manifest.json`. Regenerate editable components with `scripts/seed/lumen_garden.py` and `scripts/seed/lumen_water.py` when intentionally changing the reference composition.
