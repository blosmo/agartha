# Headless modeling essentials

Status: approved by the user; implementation in progress.

## Intent

Give agents a small, composable set of operations for making interesting, well-finished objects entirely through JSON. A modeling operation should describe a form, not a particular finished product. Keep the existing shared mesh library, immutable IDs, room placement, materials, and PNG inspection loop. Construction transforms run before mesh normalization; returned full source dimensions must drive placement scale to retain intended proportions.

The user’s latest direction is the acceptance criterion: essentials for interesting and beautiful objects, usable headlessly. Imported assets remain useful but do not substitute for original construction tools.

## Approach

Extend the existing deterministic recipe API. A full remote CAD/Blender service would offer more operations but adds runtime, deployment, and failure modes before the basic workflow is polished. Exposing only raw triangle arrays is flexible but forces every agent to reimplement common geometry. Small recipes backed by ordinary meshes give a useful middle ground and preserve an escape hatch for arbitrary geometry.

## Core operations

1. Basic volumes: retain the existing box, sphere, cylinder and cone placement primitives. Add a rounded-box mesh recipe for softened edges, and a torus recipe for rings. Expose dimensions and geometric resolution rather than aesthetic presets.
2. Extrude: retain the simple/concave 2D outline extrusion. Preserve deliberate hard edges and UVs.
3. Lathe/revolve: retain radius/height profiles for rotational forms. Improve profile expressiveness only where it supports reliable useful shapes; never silently change existing recipes.
4. Sweep: add a circular section along an open 3D path, with radius, path smoothing and bounded resolution. This supplies handles, stems, rails, cables and curved structural elements. Reject degenerate paths clearly. Closed loops are covered by torus initially; arbitrary profile sweeps are a later extension.
5. Transform and compose: let agents rotate modeled geometry around all three axes before placement, including nonuniform scaling with correct normals. Continue using shared assemblies to combine independently materialed parts, and ordinary room transforms for placement. Geometry editing must not require a browser gizmo.
6. Finish and inspect: preserve explicit normals/UVs, existing PBR materials and shader support, and the PNG time/focus controls. Add reusable front/side/top/isometric inspection views only through the preview API. Agents should inspect silhouette, proportion, intersections and highlights before publishing refinements.

General booleans, arbitrary-topology fillets, sculpting, subdivision editing and a graphical modeling editor are not prerequisites for this first essential core. Raw indexed geometry remains available when recipes are insufficient. This is a focused first core, not a claim that those advanced operations have been implemented.

## Headless contract

Use the existing `POST /api/library` mesh definition with `recipe`. Existing lathe/extrude inputs remain compatible. New shapes follow the same bounds normalization, source-dimension metadata, immutable mesh IDs, local/hosted storage, and render-budget checks. Returned geometry is portable and reusable in assemblies.

Each recipe needs a short JSON example, explicit units and axes, valid ranges, expected output cost, and actionable errors. Inputs must be deterministic and bounded before allocating geometry. A rejected recipe must not publish partial state. The tool catalog must describe actual deployed capabilities.

## Verification

Verify topology, finite coordinates, outward winding, normals, UVs and boundaries with meaningful geometry tests. Render at least a curved handled vessel and a softened architectural object through the real agent API. Inspect multiple views and PBR highlights to assess whether the operations yield attractive forms without excessive tessellation. Check that the same recipe works locally and in the hosted pipeline, and that reused geometry remains shared.

Previous release evidence is preserved in `docs/operations/2026-09-07-model-performance.md`: imported GLB animation and native previews, 32-instance desktop measurements, a narrow desktop viewport, and a GPU-resource cleanup round trip. Physical mobile-device performance remains unmeasured; do not present a desktop viewport result as device evidence.

## Current implementation status

Implemented and now live: raw indexed meshes, OBJ and native GLB import, lathe/extrude recipes, shared assemblies, materials, animation, bounded model loading, and PNG previews. Production verification placed both an original lathed mesh and an OBJ mesh beside an animated GLB in room `plot-41-41`; all three rendered in the hosted PNG.

Rounded-box/torus/sweep recipes, full-axis modeling transforms, smooth lathe profiles, and explicit orthographic assembly inspection views are implemented and locally verified. Deployment of this expanded core is awaiting release approval; the previously shipped import/lathe/extrude release remains live. See the operation report for evidence and exact limits.
