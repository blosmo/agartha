# Modeling completion audit

Status: complete for the user's imported/original-asset goal and approved headless-essential core.

## Requirements and evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Import assets without a modeling UI | Local and hosted OBJ publication; scoped binary GLB upload, immutable file download verified against source SHA-256; attributed Fox preserved | Verified |
| Model original forms headlessly | Shared JSON recipe API for lathe, extrusion, roundedBox, torus and open sweep; smooth lathe profiles and XYZ construction transforms; geometry and invalid-input tests | Verified |
| Compose reusable objects | Hosted vessel and bench assets published, prepared and placed; every saved part's mesh reference and position matched its prepared form | Verified |
| Useful material and animation fidelity | PBR wood, brass and ceramic inspected in actual PNGs and browser; native textured/skinned Fox animated in the hosted browser and produced distinct posed PNGs | Verified |
| Inspect and refine without GUI authoring | Four distinct hosted PNGs per assembly; focus unions, orthographic isolation, correct camera-dependent PBR and transparency; native GLB front/side/top also inspected locally | Verified |
| Preserve performance | Geometry/storage/room/work admission limits; atomic over-budget rejection; shared geometry/textures; cancellation/disposal; measured 32-Fox desktop fixture and GPU cleanup round trip | Verified within documented desktop measurements |
| Agent-facing access and documentation | Public tool catalog returns all six modeling entries and four views; public modeling guide verified; existing APIs retain default behavior | Verified |
| Actual hosted release | Modal service deployed; Vercel production build and alias succeeded; production Convex schema/type checks and publish succeeded with no index deletions | Verified |

The approved core does not promise a full CAD/sculpting package, general booleans or arbitrary-topology fillets. Open-path sweep limitations and numeric bounds are explicit. Physical mobile hardware was not benchmarked; desktop frame averages are not universal performance guarantees.

## Release targets

- Vercel: `https://agartha-o7cehr5m2-divine-inside.vercel.app`, aliased to `https://agartha-dusky.vercel.app`.
- Convex production: `quaint-ladybug-283`.
- Modal: `agartha-world-renderer`, service `https://blosmo--agartha-world-renderer-service.modal.run`.

## Final hosted verification

`node --import tsx scripts/verify-hosted-headless.ts` completed successfully. The verifier honors preview `Retry-After`; it reused existing meshes/assemblies idempotently after its initial 429. No production limit was weakened.

Room: `https://agartha-dusky.vercel.app/?plot=plot-41-41`.

- Vessel: `asset-b5268f0a290259da8e68ab0db81af262c4a07bdd588afcce6d02bfeb161bd1dd`.
- Bench: `asset-80244830303683cba12b005c008e80b631b2520bc859ac964dd332f6620b5d52`.
- All eight PNG responses had the requested view header, valid PNG data, and four distinct image hashes per assembly. Every image was visually inspected.
- Artifacts: `/var/folders/p7/18dk5xkj4z94vchn36wy4gr40000gn/T/agartha-hosted-headless-v8BmHN/`.
- Live browser: 12 objects, including both assemblies and the earlier native import; 41 reported draw calls, 21,024 reported triangles, one shared native model template and an observed 8.33 ms frame average. Animation time advanced.

The full integration suite/build passed before the final review fixes (280 tests); covering post-fix protocol tests91 and renderer tests20, strict checks, native Node ESM import and actual GPU renders passed. The final Vercel production build also passed. Current work remains on `codex/headless-modeling-essentials`; no merge/PR was requested.
