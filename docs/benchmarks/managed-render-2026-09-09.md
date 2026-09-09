# Managed render settings — 2026-09-09

The managed modeler renders with Cycles on a two-thread CPU. Its prompt now matches that engine and recommends broad area key/fill/rim lighting, neutral world fill, scale-aware light size/power, AgX and full-object framing. Explicit artistic lighting in the brief takes precedence over the studio recommendation. These are authoring defaults, not a claim that every generated lighting rig is automatically optimal.

The preview uses 512×512, up to 32 samples, noise threshold 0.05, eight minimum samples, OpenImageDenoise with albedo/normal passes and accurate prefiltering, and a ten-second sampling limit. The video uses 512×512, up to 16 samples, threshold 0.1, eight minimum samples and a one-second sampling limit. Persistent data is enabled for the 48-frame, 12 fps orbit. Setup, denoising, encoding and transfer consume additional time; the reservation deadline and 360-second video reserve remain necessary.

## Local measurements

Blender 4.5.0 on macOS arm64, CPU, two threads. Each value is the median of three distinct orbit views, not repeated measurements of one identical view. Both presets used the same approved rocket scene; a second fixture replaces its largest body's material with glass to stress transmission. This is a small comparison, not a broad asset benchmark or a cloud cost measurement. The baseline used 32 preview samples and eight video samples, retaining the source's 0.01 adaptive threshold and automatic minimum sample count.

| Fixture | Output | Baseline seconds | Tuned seconds |
| --- | --- | ---: | ---: |
| Rocket | Preview | 6.858 | 4.682 |
| Glass variant | Preview | 7.375 | 5.222 |
| Rocket | Video frame | 1.520 | 1.652 |
| Glass variant | Video frame | 1.565 | 1.538 |

Preview medians improved about 30–32%. Video time was roughly unchanged, with a higher sample ceiling on frames that can finish within the existing sampling limit. Visual review of the three angles on each fixture found no material-boundary, silhouette or highlight loss warranting rejection. Low-sample glass is still approximate, and this does not establish temporal denoising quality for every material. Transmission bounces and highlight clamping were not reduced merely to improve timing. Raw measurements are in [the JSON report](managed-render-2026-09-09.json).

## Camera and source fidelity

A long box that fit the original front view clipped in 34 of 48 orbit frames. Fitting evaluated mesh bounds at every delivered angle reduced that to zero. One constant distance/orthographic scale is used for the entire movie, with a six-percent border on each side. Modifier-aware perspective and orthographic regressions check all 48 angles, quaternion-mode source cameras and complete restoration of every render setting changed by the movie pipeline. The source camera remains unchanged.

Lighting, shadows and the studio floor affect rendered appearance, not the GLB's material values. The exporter selects only AGARTHA_MODEL and excludes lights/cameras. The prompt now requires unbaked material colors/maps and puts presentation-only tables/plinths in AGARTHA_STUDIO unless requested as part of the asset. Arbitrary procedural Blender shader nodes are not guaranteed to reproduce in glTF; authoring guidance calls for glTF-compatible Principled BSDF materials. The existing test rocket includes an authored display base; its six PBR materials contain no image textures.

## Reproduction

Run the same fixture through both presets using separate output directories:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/benchmark_managed_render.py -- \
  --blend /path/to/model.blend --preset baseline --output /tmp/render-baseline
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/benchmark_managed_render.py -- \
  --blend /path/to/model.blend --preset adaptive --output /tmp/render-adaptive
```

The actual exporter, full MP4 encoder and camera/restoration regressions run in `scripts/blender/verify_managed_export.py` and the pinned Blender CI job. The local comparison used no additional paid services.

## Research basis

- [Cycles sampling and denoising](https://docs.blender.org/manual/en/4.5/render/cycles/render_settings/sampling.html): adaptive sampling, noise/sample tradeoffs, denoising auxiliary passes and sampling-time limits.
- [Cycles performance](https://docs.blender.org/manual/en/4.5/render/cycles/render_settings/performance.html): persistent data trades memory for faster repeated renders.
- [Area lights](https://docs.blender.org/manual/en/4.5/render/lights/light_object.html#area-light): broad emitters produce softer shadows.
- [Cameras](https://docs.blender.org/manual/en/4.5/render/cameras.html): perspective focal length, orthographic scale and framing.
- [Color management](https://docs.blender.org/manual/en/4.5/render/color_management.html): AgX handles high dynamic range and highlights; the MP4 encoder uses Standard because its PNG inputs already contain the display transform.
- [Reducing noise](https://docs.blender.org/manual/en/4.5/render/cycles/optimizations/reducing_noise.html): bounce and clamp shortcuts can change appearance.

Later policy update: the timings above describe the original 48-frame configuration. Current local code prioritizes object refinement, reserves 90 seconds for delivery, and attempts a 24-frame optional video only with at least 180 seconds spare. This shorter configuration has workflow tests but has not yet been benchmarked on the hosted service.
