# vgpu rendering backbone

Agartha uses vgpu 0.4 for headless world previews and agent visual inspection. The interactive Three.js viewport remains independent. vgpu is a rendering library, not a hosted authority or a multi-agent database.

## Local preview

`GET /api/world/preview` returns a 960×640 PNG and `X-Agartha-Revision` / `X-Agartha-Renderer: vgpu`. The UI's Preview image action downloads it; the copyable onboarding prompt describes the same endpoint.

One isolated process renders at a time. Requests for the same revision share work and the last completed image is cached. A different revision arriving during a render receives 503 with a retry instruction. The render has a 20-second deadline and only accepts authoritative scene JSON; agents cannot submit executable WGSL to this endpoint. The world write queue does not wait for GPU work. Temporary scene data is deleted after completion.

## Worker command

```bash
npx vgpu doctor
npm run world:render -- scene-snapshot.json preview.png
```

The input contains an `objects` array matching the scene primitives. The shared compiler packs XYZ transforms and colors by primitive into storage buffers. Up to 10,000 objects render in at most four instanced draws, with depth testing. The renderer rejects invalid geometry, non-finite values, unbounded object counts and excessive target sizes. `gpu.dispose()` releases the device after rendering.

The built-in preview uses a fixed, validated shader (`packages/renderer/world.wgsl`), simple diffuse lighting, and a camera fitted to the snapshot. It is useful for geometry/layout checks, not a pixel-identical reproduction of the interactive viewport's shadows. Eight cone segments avoid a vgpu 0.4 index-buffer alignment failure observed with seven.

## GPU/runtime requirements

`vgpu doctor` must report a healthy adapter. The local Mac render was verified using Dawn/Metal. Restricted processes may not have graphics-adapter access. GPU-less workers need vgpu's separately installed software renderer or an appropriately provisioned worker image; the application does not silently download one. Keep GPU work out of Convex mutations.

For hosted rendering, deploy this same worker behind a bounded job queue and private snapshot handoff. Cache by world + region + snapshot/object-version digest rather than a global world revision. Apply per-agent visual-request quotas, coalesce identical jobs, and store PNGs in an object store with expiring access URLs. This hosted worker service is not provisioned by the local integration.

## Verification

- `vgpu doctor`: healthy Metal adapter; actual offscreen render/readback passed.
- `vgpu check packages/renderer/world.wgsl`: no shader diagnostics; validation passed.
- `npm run world:render -- .agartha/world.json /tmp/agartha-vgpu-preview.png`: 43 objects, four draws; PNG visually inspected.
- Live `/api/world/preview`: HTTP 200, image/png, 960×640, revision 5, renderer vgpu.
- Compiler tests: alignment/color packing, 10,000 objects/four batches, invalid/bounded inputs.

Official references: https://vgpu.sh/docs/get-started/node and https://vgpu.sh/docs/guides/two-pass-rendering.
- Additional real-GPU stress render: synthetic 10,000-object scene completed with four instanced draw calls. This validates rendering/batching, not multi-agent network throughput.
