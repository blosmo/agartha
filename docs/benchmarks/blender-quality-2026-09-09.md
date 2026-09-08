# Blender quality and efficiency — 2026-09-09

The authoring toolkit now preserves the intended static model while avoiding duplicated runtime geometry. It also supplies progressive preview presets and restores the source scene after both successful and failed operations. The toolkit is served directly at `/agents/blender-toolkit.py`, generated from the canonical Python source during the web build.

## Measured results

Baseline: `c42fb8465a52991f7e9e71e1cffd23257ed80284`. Both versions were executed locally in official, checksum-verified Blender 4.5.0 on macOS arm64, in CPU mode. The fixture includes textured smooth surfaces, mirrored and non-uniformly scaled objects, different UV layouts, object-linked material overrides, a curve, and a flattened plane.

| Fixture result | Before | After |
| --- | ---: | ---: |
| Triangles | 3,950 | 3,950 |
| GLB bytes | 223,020 | 99,460 |
| Runtime vertices | 8,176 | 2,452 |
| Draw groups | 3 | 5 |
| Texture UVs and values preserved | No | Yes |
| Material assignments preserved | No | Yes |
| Normals within the regression tolerance | 2.38% | 100% |
| Source unchanged by export | Yes | Yes |

The GLB is 55.4% smaller and has 70.0% fewer runtime vertices. The extra two draw groups retain distinct UV layouts and mirrored orientations instead of corrupting them through an unsafe join. The normal test uses a dot-product threshold of 0.9999; position matching uses four-decimal coordinates and UV matching uses squared error below 1e-8. This is a fidelity regression, not a general aesthetic score. Same-settings renders of the exported GLBs also confirmed restored textures and smooth shading.

For the existing **Open Ground** scene (996 objects, 18,800 triangles), the file decreased from 1,044,000 to 1,038,960 bytes and retained 10 draw groups. Export time increased from 0.392 to 1.062 seconds in that run. Preserving attribute data has a CPU cost; there is no universal export-speed claim.

## Preview measurements

Median of three local runs on the same fixture:

| Mode | Pixels | Maximum samples | Seconds |
| --- | ---: | ---: | ---: |
| Previous helper | 512 × 512 | 8 | 1.599 |
| Draft | 256 × 256 | 8 | 0.211 |
| Review | 512 × 512 | 32 | 1.093 |
| Final, comparison size | 512 × 512 | 128 | 2.636 |

The final preset normally uses 1024 pixels; the benchmark overrides it to 512 for comparison. Draft is intended for composition checks, not final image delivery. New presets use adaptive sampling, denoising and four render threads. The earlier helper used two threads. Both run on the local CPU; these timings are not measurements of Modal hardware or customer dollar savings. The worker remains capped at two physical cores/four vCPUs and 4 GiB. Customer pricing is unchanged.

The original preview helper changed render/world settings. New previews pass source-restoration checks after success and deliberately injected render/export failures. Sampling has a 10/15/20-second limit by preset; setup, denoising and saving take additional time, so the agent guide retains the broker's 30-second operation constraint.

## Validation and reproduction

Run the real-Blender regression:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/verify_quality.py -- \
  --kit scripts/seed/starter_kit.py --output /tmp/blender-quality \
  --assert-quality --renders --repeats 3
```

To record the old implementation, extract `scripts/seed/starter_kit.py` from the baseline commit and pass that file as `--kit`, omitting `--assert-quality`. Use separate output directories. The script writes metrics after each measurement. The GitHub `blender-quality` job downloads the same pinned Linux runtime, verifies its checksum and runs this regression. The generated GLBs also passed Agartha's real `inspectGlb` validator locally.

The larger-scene comparison executes `scripts/seed/worlds/open_ground.py` after loading each toolkit and calls `export_runtime` on the resulting scene. Raw sanitized measurements are in [the JSON report](blender-quality-2026-09-09.json).

## Cost decisions and limits

No paid cloud workers, GPU instances, external generation APIs or live purchases were used for these measurements. Keep asset reuse, preparation before reserving, short modeling batches, progressive previews, download-before-stop and explicit shutdown as the default workflow.

Modal charges the greater of resource requests and actual use; lower requests also lower guaranteed resources. Its guidance is to tune requests from observed workload percentiles. The current guarantees are retained until representative cloud measurements justify changing them. [Modal sandbox resources](https://modal.com/docs/guide/sandbox-resources)

At the published base Sandbox rates, the worker's full 2-core/4-GiB envelope is approximately $0.00633 per minute, excluding startup, broker, storage, payment fees and any applicable pricing modifiers. This is a rate calculation, not an observed bill. [Modal pricing](https://modal.com/pricing)

The results establish concrete pipeline improvements. They do not establish a globally optimal CPU/GPU choice or guarantee artistic quality for arbitrary agent-generated scenes.
