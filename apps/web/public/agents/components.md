# Build scenes from reusable components

For scenes and dioramas, plan the composition as individual objects and assemblies. Kitbash suitable library parts, author missing parts, and make variants where the design needs them. A single-object request does not need an artificial kit.

## Plan, search, assemble, review

1. Make a short parts list: major assemblies, repeated modules, reusable props, and unique hero objects. Establish scale and a coherent silhouette before detailing.
2. Search `GET /api/assets?q=window` for shared Blender components and `GET /api/library?kind=asset` for room assemblies. Follow each cursor until null, even through empty filtered pages. Read each candidate's dimensions, preview, provenance and license before reuse. Search uses names and descriptions; name parts by their function.
3. Build with named components, useful local pivots and consistent units. Reuse one definition for repeated windows, stair modules, stones or furnishings. Keep parts separately editable in source, even when runtime export batches geometry for performance.
4. Make an independent variant before changing shared geometry or materials. Preserve the source bundle ID. Do not fork a new public asset for every placement transform.
5. Inspect the assembled scene and individual parts: proportions, joins, support, collisions, repetition, material scale and sight lines. Library reuse does not excuse inconsistent style or weak composition.
6. Export reusable components independently, review their previews, and publish through the [shared asset workflow](./blender-assets.md) with the explicitly authorized license and source-sharing scope. Keep private or project-specific content out of generic components.

A component should be a useful unit—a window assembly, tree, railing section or chair—not every screw or face. Components and whole scenes use the existing `bundle-…` identity; no separate component catalog is required.

## Blender helpers

The hosted worker provides `cloud.blender_mcp.components`. Coordinates here are **Blender XYZ, Z-up**, with rotations in radians. GLB export uses glTF Y-up. These helpers do not normalize component dimensions; design at a deliberate physical scale.

```python
from cloud.blender_mcp.components import (
    create_component, duplicate_component, import_component,
    export_component, assembly_manifest,
)

# frame and glass are existing unparented static mesh objects.
window = create_component('Window A', [frame, glass], origin=(0, 0, 0))
# A shared instance: later mesh/material edits affect every instance.
repeated = duplicate_component(window, 'Window B', location=(3, 0, 0))
# An independent variant: mesh and material data are copied before editing.
tall = duplicate_component(window, 'Tall window', location=(6, 0, 0), variant=True)
tall.scale.z = 1.4
print(assembly_manifest())
paths = export_component(window, '/workspace/artifacts/window')
print(paths)
```

Grouping preserves world placement. The component root supplies the pivot. Duplicating retains its internal hierarchy and supported native modifiers; normal instances share geometry/materials, while variants copy meshes and materials. Texture images remain shared. Animation and constraints are not supported by these static helpers. Realize geometry-node outputs on a copy before using them. Modifier object dependencies must remain inside the component.

`export_component` writes `component.glb`, `source.blend` and `preview.png` in the requested directory. It exports only the chosen root and its descendants at the component's local origin, preserving editable meshes, materials and supported modifiers in source. Surrounding scene geometry, studio objects and unrelated text blocks are excluded. Review dependencies and naming before sharing. The GLB must still pass the destination's model limits.

Download these files before ending the worker. Direct hosted MCP downloads require files at the artifacts root: copy them there under unique basenames rather than overwriting the scene's `model.blend`, `model.glb` or `preview.png`. Retain the scene's editable source and `assembly_manifest()` alongside the final render so component membership, transforms and provenance remain inspectable.

## Load and modify shared assets

`GET /api/assets/BUNDLE_ID` returns the model ID, metadata, source and preview links. Fetch the GLB through `/api/models/MODEL_ID/file`, verify its SHA-256 matches `MODEL_ID`, and import the local file:

```python
window = import_component('/workspace/artifacts/window.glb', 'Library window',
    bundle_id='bundle-<64 hex>', location=(3, 0, 0),
    rotation=(0, 0, 1.57079632679), scale=(1, 1, 1))
variant = duplicate_component(window, 'Weathered window', variant=True)
```

Static embedded GLB files are accepted. External resources, skins and animation are rejected. The importer preserves geometry dimensions and records `agarthaParentBundleId` on the component root. It does not load or execute Blender source or recipe text. For deeper changes to the original authoring graph, deliberately download the source and reopen it with script execution disabled.

Managed reference-guided agents can call `search_assets` and `load_asset` directly; the trusted service downloads and checks GLB hashes without exposing credentials to Blender. Loading produces a new rendered candidate that must be reviewed before acceptance. To let a managed job contribute its original generic components, explicitly set `shareComponents: {"license":"MIT","attribution":"Your author or studio name"}` when creating the reference-guided job. This authorizes public GLB, editable source and preview publication under that exact license. Supported automatic-sharing licenses are MIT, CC-BY-4.0 and CC0-1.0; MIT and CC-BY require attribution. Omit this option for private authoring. The choice is bound to the job and cannot be changed by retrying its request ID.

With sharing enabled, `prepare_asset` exports a named component after scene acceptance; the next turn must inspect its preview before `publish_asset`. At most three reviewed components can be contributed within the existing job budget. New edits invalidate pending contributions. Returned permanent bundle IDs are recorded in `review.json` before worker cleanup. Variants inherit their source bundle ID; automatic publication preserves a recognized parent license and attribution. Multi-source assemblies or other licenses require deliberate publication and license review.

## Share variants

Use the existing [publication command](./blender-assets.md) for an isolated component bundle. Supply `--parent ORIGINAL_BUNDLE_ID` for a derivative. The HTTP equivalent is `parentId` on `/api/assets/upload-ticket`. Choose the permitted license and preserve required attribution; a provenance link does not grant new rights.

`GET /api/assets?parentId=BUNDLE_ID` discovers published variants; it accepts `q` and `cursor` too. Original bundles are immutable. A variant receives a new bundle ID, and existing placements continue to use the original until deliberately replaced.

## Reuse before modeling

Search Agartha components and templates first. For suitable ready-made props, managed agents can use `search_polyhaven` and `load_polyhaven`; the service packages a bounded 1K model with textures, retains Poly Haven credit, and requires visual review. See the [Poly Haven workflow](polyhaven.md). Use existing bundled PBR materials for finishes, and continue authoring if no suitable asset is available.
